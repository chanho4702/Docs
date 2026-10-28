# 통합 검증 리포트 — issue-link-gantt (M1 읽기 + M2 일정 write-back)

> 작성: integration-verifier / **2026-06-30 재검증(워킹트리 기준)** / 슬러그 `issue-link-gantt`
> 기준: `01_architect_design.md` §2 경계면 계약 + `HANDOFF.md`(6/30 변경 내역). 범위 = 1차 릴리스(M1+M2). **M3(관계 편집)은 의도적 제외 — 미구현이 정상.**
> 방법: 생산자(백엔드 mapper/service/fetcher)·소비자(프론트 컬럼 cell FC/어댑터) 양쪽 동시 읽기 + 루트/프론트 jest·build 실행.
> 비고: 6/29 검증(FAIL 0) 이후 **Task shape 확장(아바타/프로젝트/협업자/상태배지) + 마커→highlightTime 교체 + 라이브러리 SVAR 정식 전환(@svar-ui/react-gantt) + echarts 명시**가 추가됨. 본 리포트가 stale한 6/29판을 대체한다.

---

## 결론 요약

- **경계면 정합: 통과(최우선).** 6/30 확장된 Task 필드 6종(issueTypeIcon / project / assignee.avatarUrl / statusCategory / coworkers / meta.projectStart·End)이 **생산자(mapper) → 페처 요청 필드 → 어댑터 passthrough → 컬럼 cell FC props → 재사용 컴포넌트 prop 계약**까지 끝단 일치. 회귀 0.
- **마커→highlightTime 교체: 통과.** meta.projectStart/projectEnd → GanttPage markers(css 태그) → GanttChart highlightMap → highlightTime 데이터 흐름 정합. css 키 문자열 양쪽 리터럴 일치.
- **패키지 건전성: 통과.** GPL `wx-react-gantt` 제거 → MIT `@svar-ui/react-gantt@^2.7.1` 전환, `echarts@^6.1.0` 명시 추가(6/29 MINOR M-1 해소), patch-package CSP 자체호스팅 배선 정상.
- **M3 제외: 통과.** 컨트롤러 2개만 등록 + 프론트 훅 미작성 + SVAR intercept 차단 3중 유지.
- **성능/메모리 격리: 통과.** 전용 페처 미오염·`as='user'`·1패스 N+1 없음·i18n merge 반영 모두 유지.
- **object 필드 roundtrip(U1) / SVAR 시각충돌(U2): 미검증(deploy·E2E 게이트) — 그대로 유지.**

테스트: 루트 jest **112/112 통과**, 프론트 jest **58/58 통과**, 프론트 build **Compiled with warnings(third-party 소스맵만)**.

---

## 통과 (PASS)

### P1. 확장 Task 필드 끝단 정합 (최우선 — 6/30 신규 집중 검증)
6/30에 확장된 필드 전부를 생산자↔소비자 양쪽 동시 읽기로 교차 확인. 모두 일치:

| 필드 | 생산자(mapper) | 페처 요청 | 어댑터 passthrough | 소비자 cell | 재사용 컴포넌트 prop |
|------|---------------|----------|--------------------|-------------|---------------------|
| project | `GanttMapper.js:79-86` `{id,key,name,avatarUrl}` | `IssueApi.js:351` `project` | `ganttAdapter.js:110` `project` | `GanttChart.jsx:15-19` `row.project` | `ProjectComponent`(`IssueComponent.js:29-51`) `project.id/name/avatarUrls['16x16']` ✔ (cell이 `{'16x16':p.avatarUrl}` 재조립) |
| issueTypeIcon | `GanttMapper.js:98` `issuetype.iconUrl` | `:350` `issuetype` | `:109` `issueTypeIcon` | `:20-21` `row.issueTypeIcon`+`row.key` | `IssueComponent`(`:10`) `issueKey/issueImage` ✔ |
| statusCategory | `GanttMapper.js:73-77` `{key,name,colorName}` | `:351` `statusCategory` | `:111` `statusCategory` | `:22-23` `row.statusCategory` | `StatusComponent`(`:53-54,80`) `status.colorName/name` ✔ |
| assignee.avatarUrl | `GanttMapper.js:104-110` `{accountId,displayName,avatarUrl}` | `:351` `assignee` | `:112` `assigneeObj` | `:24-33` `row.assigneeObj.avatarUrl/displayName` | `UserAvatar`(`:12`) `avatarUrl/displayName` ✔ |
| coworkers | `GanttMapper.js:88,113` raw Jira user[] | `:355` coworkerFieldId | `:113` `coworkers` | `:34-39` `row.coworkers` | `AvatarStack`(`:11,25-27`) `users[].avatarUrls/displayName/emailAddress/accountId` ✔ |
| startText/duration | `start`(ISO)/SVAR 산출 | `:350` duedate·cf_10015 | `:114` `startText`, `:124-129` `duration` | `:113`(startText 컬럼)·`:114-121`(duration getter) | plain text ✔ |

- 페처 `getProjectGanttIssues`(`IssueApi.js:349-356`)가 `project,issuetype,statusCategory,assignee` + coworkerFieldId를 fields에 포함 → 확장 필드의 **원천 데이터가 inline 응답에 존재**. N+1 없음.
- mapper의 avatarUrl 키 정합: assignee=`avatarUrls['24x24']`, project=`avatarUrls['16x16']`. 소비측(UserAvatar small=24px, ProjectComponent 16x16)과 해상도 일치.

### P2. read 경계면 — `getProjectGanttData`
- 생산자: `GanttService.js:63-74` `{ content:{ tasks, links, meta:{ total, fetchedAt, projectStart, projectEnd } } }` → `responseWrapper`가 `{ success:true, content:{...} }`로 직렬화. `GanttController.js:10-12` 등록.
- 소비자: `useGanttData.js:36` `unwrapGanttPayload(result)` = `result.content ?? result` → tasks/links/meta. `:35` `success===true` 게이트, `:46` success:false도 isError 처리. ✔
- 함수명 `invoke('getProjectGanttData')`(`useGanttData.js:26`) ↔ `index.js` `registerGanttController` 등록 ✔.

### P3. 마커 → highlightTime 데이터 흐름 (6/30 신규)
- meta.projectStart/projectEnd 생산: `GanttService.js:51-61` project 테이블 start_date/end_date(`findProjectByIdRepository`) best-effort, `toIsoDate`로 `YYYY-MM-DD` 정규화. 실패해도 null(본데이터 무영향). ✔
- 소비: `GanttPage.jsx:34-58` meta→markers(`css:'gantt-marker-today/start/end'`) → `GanttChart.jsx:154-164` highlightMap이 동일 css 리터럴로 분기 → `gantt-hl-today/start/end` 클래스 매핑 → `:166-169` highlightTime(date) 콜백. **css 키 문자열 양쪽 정확 일치.** ✔
- markers는 타임라인 범위 산정(`:128-150`)에도 사용 → 프로젝트 시작/종료가 범위 밖으로 잘리지 않음. ✔

### P4. write 경계면 — `updateGanttSchedule`
- 생산자: `GanttService.js:108-114` `{ content:{ issueKey, start, due } }`. 검증 `:94-99` start>due → `LogicalError(GANTT_INVALID_DATE_RANGE)`.
- 소비자: `useGanttMutations.js`(`useUpdateSchedule`)가 `result.success!==true` throw, onError `err.cause.code==='GANTT_INVALID_DATE_RANGE'` → `gantt.error.dateRange` 토스트. 입력 `{projectId,issueKey,start,due}` 양쪽 동일. ✔
- 어댑터 `extractScheduleChange`(`ganttAdapter.js:155-164`)가 SVAR `end`(Date) → 계약 `due`(ISO) 변환. read는 `end`, write는 `due` 네이밍 분리 유지·혼선 없음. ✔

### P5. M3 올바른 제외
- `GanttController.js:8-17`: `getProjectGanttData`+`updateGanttSchedule` **2개만** 등록. setGanttParent/setGanttLink 미등록. ✔
- `GanttChart.jsx:176-181`: `add-link`/`delete-link`/`move-task` intercept 차단 + `update-task`는 `editableRef.current===true`일 때만. ✔
- `_predecessors`(`GanttMapper.js:115,175`) 내부필드 응답 비노출(test로 보장). links는 mapper에서 dangling/self/중복 제외 후 합성(`:158-172`). ✔

### P6. 배선/등록·쿼리키·권한
- `ganttKeys.data(projectId)`(projectKeys.js) 팩토리 함수 사용, 인라인 배열 아님. `useGanttData.js:24` 참조. ✔
- 탭/권한: `GanttPage.jsx:23-24` `canRead/canWrite('PROJECT_GANTT')` 게이트. canWrite=false면 readOnlyHint + 편집 intercept 차단. ✔

### P7. 패키지 건전성 (회귀 차단)
- `git diff master -- static/ui/package.json`: `+@svar-ui/react-gantt@^2.7.1`(MIT)·`+echarts@^6.1.0`·`+patch-package@^8.0.1`·`+postinstall:patch-package`. `echarts-for-react@^3.0.6` 유지, 삭제 0.
- GPL `wx-react-gantt` 제거 완료, import도 `@svar-ui/react-gantt`로 일원화(`GanttChart.jsx:2`). ✔
- `static/ui/patches/@svar-ui+react-core+2.6.0.patch` 존재(CDN 폰트 주입 무효화). wx-icons 폰트 자체호스팅(`gantt/fonts/`). ✔
- **6/29 MINOR M-1(echarts 미선언) 해소됨** — 이제 dependencies에 명시. ✔

### P8. i18n
- `locales/kr/gantt.json`·`locales/en/gantt.json`에 신규 컬럼/마커 키 추가: `col.project/issue/status/assignee/coworker/start/duration`, `durationUnit`, `marker.today/start/end`. UI 참조(`GanttChart.jsx:108-120`, `GanttPage.jsx:39,46,53`) 전수 존재.
- merge 반영 확인: `locales/ko-KR.json:422,431,432`에 `col.coworker`/`durationUnit`/`marker` 중첩 반영(ko-KR 직접 수정 아님). ✔

### P9. 실행 검증 (글자 그대로)
- 루트 `npm test`: **Test Suites: 7 passed / Tests: 112 passed**, 5.27s. `PASS src/resolver/gantt/__test__/GanttMapper.test.js`. 신규 assignee shape(`{accountId,displayName,avatarUrl:null}`, test:88) 반영 통과.
- 프론트 `CI=true npm test`: **Test Suites: 6 passed / Tests: 58 passed**, 2.36s.
- 프론트 `CI=false npm run build`: **Compiled with warnings.** 경고는 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. `Can't resolve`/`Module not found`/`export not found`/echarts·svar·gantt 에러 **없음**.

---

## 미검증 (UNVERIFIED — 별도 게이트, 재확인 불요)

### U1. predecessorsField(`type: object`) 라이브 set→get roundtrip
- 사유: `forge deploy` + Forge 런타임 의존, 코드 단계 검증 불가. M1/M2는 이 필드에 write 안 함(setGanttLink=M3) → 실데이터 links 빈 배열, `parsePredecessors`가 `[]` 안전 처리. **1차 릴리스 기능 무영향.**

### U2. SVAR 런타임 시각 충돌 (Willow 테마 ↔ Atlaskit/react-grid-layout)
- 빌드/jest 확인 불가. E2E(터널/배포)에서 점검. (HANDOFF §4: highlightTime 빌드 main.2d2f4cda.js 사용자 미확인 — 표식 가시성은 E2E에서 최종 확인.)

### U3. SVAR 컬럼 cell `{ row }` prop·getter 런타임 시그니처
- cell FC가 받는 prop 키(`row`)와 getter 인자(`task`)는 SVAR 라이브러리 런타임 계약이라 정적 검증 불가. 단 **전달 필드(project/key/issueTypeIcon/statusCategory/assigneeObj/coworkers/startText/duration)는 생산측에서 모두 정확히 채워짐**을 본 리포트 P1로 확인. cell 렌더 자체는 HANDOFF상 사용자 육안 동작 확인됨(컬럼 미러링). 정적 잔여 위험 없음, 시각 확인만 E2E 잔여.

---

## 실패 (FAIL)

**없음.** 6/30 확장(아바타/프로젝트/협업자/상태배지/마커→highlightTime/라이브러리 전환) 어디에도 경계면 불일치·패키지 회귀·M3 누출 미발견. 6/29 대비 신규 회귀 0.

---

## 커밋 준비 상태

**차단 결함 0 — 커밋 가능.** 루트 112/112·프론트 58/58 jest 통과, 빌드 성공(third-party 소스맵 경고만), 6/30 확장 Task 필드·마커→highlightTime·SVAR/echarts 패키지 전환 모두 끝단 정합 확인. 6/29 MINOR M-1(echarts 미선언)도 이번 변경으로 해소됨.

남은 것은 **코드 외 배포 게이트(U1 object roundtrip, U2/U3 SVAR 런타임 시각 확인)** 뿐이며, 이는 커밋 차단 사유가 아니라 `forge deploy` 후 E2E로 닫는 항목이다. 워킹트리(백엔드 gantt 도메인 + 프론트 gantt 페이지 + manifest 커스텀필드 + patches + fonts + locales)를 그대로 커밋해도 무방하다.

---

## 추가 진단 — 사용자 E2E 보고 3건 (2026-06-30, 모두 프론트 — frontend-engineer 배정)

> 사용자가 라이브에서 발견한 런타임 결함 3건. 전부 프론트 영역. SVAR 라이브러리 내부 소스(`node_modules/@svar-ui/*`)를 교차 확인해 근본 원인을 확정함. 경계면(백엔드 응답)은 정상 — 데이터는 프론트까지 정합하게 도달함(P1~P3).

### R1. 오늘/프로젝트 시작·종료 flag 가 안 보임 — **원인 2개, 확정**

**(a) markers 가 `<Gantt>`에 아예 전달되지 않음 (정적 확정).**
- `GanttChart.jsx:214-225` `<Gantt>` props에 `markers` **없음**. GanttPage가 만든 markers(`GanttPage.jsx:34-58`, Date·css 정상)는 GanttChart로 들어오지만, GanttChart는 이를 highlightMap/range 계산에만 쓰고 `<Gantt>`로는 넘기지 않는다.
- SVAR `markers`는 **정식 config prop**이다: `gantt-store` `IMarker { start:Date, text?, css?, left? }`, `IConfig.markers?: IMarker[]` + 네이티브 `projectStart?:Date`/`projectEnd?:Date`. react-gantt가 `wx-markers`/`wx-marker`(2px 세로선, `z-index:4`, `height:100%`)로 렌더하며 CSS도 로드된 `dist/index.css`(=`@svar-ui/react-gantt/style.css`)에 존재. markers는 **픽셀 위치 세로선이라 zoom 단위와 무관**하게 표시된다.

**(b) 폴백으로 쓴 highlightTime 은 day/hour zoom 에서만 적용됨 (정적 확정).**
- 타입: `react-gantt/types/index.d.ts:47` `highlightTime?: (date: Date, unit: 'day' | 'hour') => string`. gantt-store 내부 weekend 하이라이터도 `(c==="day"||c==="hour")`일 때만 클래스를 반환(`gantt-store/dist/index.js`).
- 즉 **타임라인 그리드 셀이 day/hour 단위일 때만** highlightTime이 칠해진다. 기본 zoom은 **'week'**(`GanttPage.jsx:26`/`GanttChart.jsx:90` `useState('week')`/`zoom='week'`), week 셀에는 적용 자체가 안 된다(`GanttChart.jsx:166-169`의 highlightTime은 정확 ISO일 매칭이라 week 셀 시작일이 아니면 영영 불일치). → 기본 화면에서 오늘/시작/종료 표식이 전무.

**수정 방법(권고 우선순위):**
1. **markers prop 복구**: `GanttChart.jsx`의 `<Gantt>`에 `markers={markers}` 추가(가능하면 `projectStart`/`projectEnd`도 Date로 전달해 범위 자동 확장). 세로선이라 모든 zoom에서 보임. CSS는 `gantt.css:6-37`에 이미 `gantt-marker-*` 색 정의됨.
2. markers가 이 환경에서도 끝내 안 뜨면(HANDOFF §4의 과거 관측), **차트 위 커스텀 오버레이**(date→pixel 직접 계산, HANDOFF가 지목한 최후수단)로 전환.
3. highlightTime을 유지하려면 **기본 zoom을 'day'로** 바꿔야 작동하지만, 표식 용도로는 부적절(권고 안 함).

### R2. 진척율(처리율) 표시 안 됨 + 편집되면 안 됨 — **편집 차단 누락이 핵심**

**(a) 표시 경로 자체는 정상 배선됨.** `ganttAdapter.js:98-99` `progress = Math.round(task.progress*100)`(0~1→0~100) → SVAR `task.progress`. SVAR은 `wx-progress-percent`(채움 막대)로 자동 표시. 즉 **progress 값이 있으면 막대에 보인다.** "안 보임"의 실제 원인은 둘 중 하나:
   - 백엔드 `computeProgress`(`GanttMapper.js:42-53`)가 **done이거나 originalEstimate가 있을 때만** 값 산출, 그 외 `null`→어댑터에서 `0`. 견적 미입력 이슈가 많으면 대부분 0%라 시각상 "표시 안 됨"으로 보임(데이터 한계, 버그 아님).
   - 또는 Willow 테마에서 채움 색 대비가 약함(E2E 확인 필요).
   - → 처리율을 항상 보이게 하려면 **별도 진척율 컬럼(%) 추가** 또는 computeProgress 완화가 필요(제품 결정). 막대 표시 경로는 정상.

**(b) 편집 차단이 누락됨 (확정 — 수정 필요).** SVAR 막대에는 **progress 드래그 핸들**(`wx-progress-marker`, react-gantt/dist)이 기본 노출된다. 현재 `GanttChart.jsx:181` `update-task` intercept는 `editable===true`면 통과시키므로, **쓰기 권한자가 진척율 핸들을 드래그하면 update-task가 발생**한다. 그러면 `:186-202` 핸들러가 `extractScheduleChange`(start/end만 추출)를 호출 → 날짜는 그대로인 채 일정 write-back 1회 + 성공 토스트가 발생(원치 않는 부작용, R3와 연쇄).
   - **수정 방법**: ① `gantt.css`에 `.wx-progress-marker{display:none!important}` 추가해 핸들 자체를 숨겨 드래그 불가화(가장 단순·확실, 채움 표시는 유지). ② 추가로 `update-task` 핸들러에서 start/end가 직전 task와 동일하면(=progress-only 변경) `onScheduleChange` 호출을 스킵하도록 가드. ①만으로도 진척율 편집은 봉쇄됨.

### R3. 토스트 남발 — **성공 토스트 매 저장마다 발생**

- `useGanttMutations.js:62-67` `onSuccess`가 일정 드래그 **매 건마다** `toast.showSuccess(...)` 호출. 드래그/리사이즈가 잦고, R2-(b)의 progress 드래그까지 update-task로 새어 들어와 토스트를 증폭.
- **수정 방법**: `onSuccess`의 성공 토스트를 **제거**(낙관적 업데이트라 막대가 이미 제자리에 반영돼 별도 확인 불필요). 실패 토스트(`onError` `:69-80`)는 사용자 피드백상 유지 권고. R2-(b) 가드를 함께 적용하면 무의미한 저장/토스트가 원천 차단된다.

> 3건 모두 **백엔드 무관**(응답 shape·데이터 정합은 P1~P3에서 통과). 수정 대상 파일: `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`, `gantt.css`, `useGanttMutations.js`. (선택) 진척율 컬럼 추가 시 `locales/kr·en/gantt.json`에 `col.progress` 키 + merge.

---

## R1/R2/R3 수정 재검증 (2026-06-30, frontend-engineer 수정분 — 워킹트리 기준)

> 범위: 위 추가 진단의 R1/R2/R3 수정분만 재검증. 프론트 전용 변경(`GanttChart.jsx`/`gantt.css`/`useGanttMutations.js`). 방법: 수정 코드 정독 + 회귀 분기 추적 + SVAR 소스 교차 + 프론트 test/build 재실행.

### 실행 결과 (글자 그대로)
- 프론트 `CI=true npm test`: **Test Suites: 6 passed / Tests: 58 passed**, 1.651s. 비파괴.
- 프론트 `CI=false npm run build`: **Compiled with warnings.** 경고는 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. gantt/svar 에러 없음.
- 백엔드 무변경 확인: gantt 도메인(`src/resolver/gantt/`) 및 `static/ui` gantt 페이지는 전부 untracked(신규)라 이번 수정도 동일 디렉토리 내 프론트 3파일에 국한. `FieldApi.js`/`IssueApi.js` diff는 기존 M1/M2 추가분 그대로(신규 변경 아님). 루트 jest 생략(백엔드 무변경).

### 통과 (PASS)

**R3 — 토스트 제거: 통과.**
- `useGanttMutations.js`: `onSuccess` 콜백 **삭제**(`:62` 주석만 남음, `toast.showSuccess` 호출 없음). 일정 저장 시 성공 토스트 미발생. ✔
- onError 경로 무손상: `mutationFn`(`:32-37`)이 `success!==true` 시 `err.cause=result.error` 세팅 후 throw → `onError`(`:64-75`)에서 롤백 + `err.cause.code==='GANTT_INVALID_DATE_RANGE'` 분기(→`gantt.error.dateRange`) / else `gantt.error.saveFailed`. cause.code 분기·실패 토스트 전부 유지. onSuccess 제거가 onError와 독립이라 회귀 없음. ✔

**R2 — 진척율 편집 차단: 통과(회귀 없음, 중점 점검).**
- (a) 핸들 숨김: `gantt.css:41-43` `.wx-progress-marker{display:none!important}`. SVAR progress 드래그 핸들 클래스명(`wx-progress-marker`, react-gantt/dist 확인)과 정확 일치 → 핸들 비노출로 진척율 드래그 불가. 채움 막대(`wx-progress-percent`)는 숨기지 않아 **읽기 표시는 유지**. ✔
- (b) 가드 회귀 점검(핵심): `GanttChart.jsx:194-199` `touchesSchedule = evTask.start!==undefined || evTask.end!==undefined || evTask.duration!==undefined`, false면 `return`(스킵). **정상 일정 드래그/리사이즈는 SVAR가 update-task의 부분 diff에 start/end/duration 중 최소 하나를 반드시 포함**하므로 `touchesSchedule=true` → 통과. 가로 일자 변경(M2) write-back이 잘못 막히지 않음. ✔
  - progress-only 이벤트(start/end/duration 무변경)만 스킵 → R2 의도와 일치. CSS로 핸들도 숨겨 이중 안전. ✔
  - 권한 게이트 무충돌: `intercept('update-task', ()=>editableRef.current===true)`(`:182`)는 종전 그대로. 가드는 그 후 `on('update-task')` 핸들러(`:188` `if(!editableRef.current) return` + `:199` 스킵) 안에서만 동작 → 무권한 읽기전용·쓰기권한 일정편집 모두 정상. ✔
  - 보강 로직 무손상: `:203-205` `(!task.start||!task.end)`면 `api.getTask`로 전체 task 병합 후 `extractScheduleChange`(`:207-212`)로 end→due 변환. 종전과 동일. ✔

**R1 — markers 배선: 통과(배선 한정).**
- `GanttChart.jsx:228` `<Gantt markers={Array.isArray(markers)?markers:[]} ... />`. 종전엔 highlightMap/range 계산에만 쓰던 markers가 이제 `<Gantt>`까지 도달. 배선: `GanttPage.jsx:149 markers={markers}` → `GanttChart.jsx:90` 수신 → `:228` prop 전달. ✔
- shape 정합: GanttPage markers(`GanttPage.jsx:34-58`)=`{start:Date, text:string, css:'gantt-marker-today'|'-start'|'-end'}` ↔ SVAR `IMarker{start:Date, text?, css?, left?}`(gantt-store types). 필드 타입 일치. ✔
- css 매칭: marker css 리터럴 ↔ `gantt.css:6-37` `.wx-marker.gantt-marker-*` 색 규칙 정의 존재. SVAR가 `wx-marker ${k.css}`로 클래스 합성(react-gantt/dist 확인). ✔
- highlightTime 폴백 보존: `:234 highlightTime={highlightTime}` 유지(day zoom 한정 컬럼 배경). 중복 강조 무해. ✔

### 미검증 / 잔여 위험 (UNVERIFIED)

**R1-가시성 — 런타임 마커 표시는 미검증, 소스상 위험 신호 있음 (배포 전 반드시 육안 확인).**
- SVAR 소스 추적 결과: `<Gantt>`에 넘긴 `markers` config는 gantt-store에서 **타임라인 범위(`_start/_end`) 계산 입력으로만** 쓰이고(라우터 `in:[...,"markers",...] out:["_start","_end"]`), 실제 세로선을 그리는 chart 렌더는 내부 상태 `_markers`를 읽는다(`react-gantt/dist` `ee=p(l,"_markers")` → `wx-markers` div). 그런데 **`_markers`는 gantt-store에서 기본값 `[]`로만 존재하고 `markers`→`_markers` 변환(left 픽셀 계산)을 수행하는 코드를 이 빌드에서 확인하지 못함**(전 패키지 grep). 즉 **markers 배선은 복구됐으나, 이 SVAR 빌드에서 세로 마커가 실제로 렌더되지 않을 가능성이 있다**(HANDOFF §4의 "markers 미렌더" 관측과 일치).
- 단 minified 소스 판독이라 변환 경로를 놓쳤을 잔여 가능성 존재 → **`forge deploy` 후 기본(week) zoom에서 오늘/시작/종료 세로선이 보이는지 육안 확인 필수.** 안 보이면 markers는 이 빌드에서 비기능 → HANDOFF가 지목한 **차트 위 커스텀 오버레이(date→pixel 직접 계산)** 로 전환 권고. (highlightTime은 day zoom에서만 동작하므로 기본 화면 표식 대체 불가.)
- 영향: 표식(보조 UI) 한정. 트리/일정/write-back 등 핵심 기능과 무관, 커밋 차단 아님.

**R2-(a) 진척율 표시값 — 데이터 한계(불변).** `computeProgress`(done/originalEstimate 보유 시만 값, 그 외 null→0)는 이번 수정 범위 밖. 견적 미입력 이슈는 0%로 보임. 항상 표시하려면 별도 진척율 컬럼/완화 필요(제품 결정). 채움 막대 표시 경로 자체는 정상.

### 경계면 불변 확인
- invoke 함수명(`getProjectGanttData`/`updateGanttSchedule`)·입력 파라미터(`{projectId,issueKey,start,due}`)·응답 unwrap(`unwrapGanttPayload`)·쿼리키(`ganttKeys.data`) **전부 무변경**. 백엔드 resolver/응답 shape 불변. 프론트 전용 수정으로 경계면 영향 0. ✔

### 실패 (FAIL)
**없음.** R1/R2/R3 수정에 회귀·경계면 불일치 미발견. R2 가드는 정상 일정 드래그를 막지 않음(확인). 유일 잔여는 R1 마커 **가시성**(런타임 게이트, 차단 아님).

### 커밋 준비 상태 (갱신)
**차단 결함 0 — 커밋 가능.** R2(진척율 편집 봉쇄+읽기표시 유지)·R3(토스트 제거) 코드 정합·회귀 없음, 프론트 58/58·빌드 통과, 경계면 불변. R1은 배선 통과이나 **세로 마커 가시성이 런타임 미검증(소스상 비렌더 위험)** — 이는 보조 표식 한정의 E2E 게이트로 커밋을 막지 않는다. 다만 배포 직후 **week zoom에서 마커 표시 육안 확인**을 권고하며, 안 보이면 후속으로 커스텀 오버레이 전환(별도 작업). 나머지 배포 게이트(U1 object roundtrip, U2 SVAR 시각충돌)는 종전대로 유지.

---

## 커스텀 마커 오버레이 재검증 (2026-06-30, R1 재구현 — 워킹트리 기준)

> 배경: 위 R1 재검증에서 지목한 대로 **SVAR 무료빌드는 markers 세로선을 렌더하지 않음(`_markers` 미계산, PRO 전용)이 확정**되어, frontend-engineer가 차트 위 **커스텀 세로선 오버레이**(date→pixel 직접 계산)로 재구현. 대상: `GanttChart.jsx`, `gantt.css`. 방법: 좌표 공식을 gantt-store task 레이아웃 소스와 교차, 가드/정리/회귀 추적, test/build 재실행.

### 실행 결과 (글자 그대로)
- 프론트 `CI=true jest`: **Test Suites: 6 passed / Tests: 58 passed**, 1.528s.
- 프론트 `CI=false npm run build`: **Compiled with warnings.** third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)만. gantt/svar/오버레이 관련 에러 없음. (백엔드 무변경 → 루트 jest 생략.)

### 통과 (PASS)

**O1. 좌표 정합 — task 막대 $x 공식과 동일 입력·동일 함수 (최우선, 소스 교차 확정).**
- gantt-store task 레이아웃 함수 `$t()`(매퍼 `ve(task,i,{cellWidth,_scales,...})` 경유, `gantt-store/dist/index.js`):
  `const {start:d, lengthUnit:f, diff:l} = _scales; e.$x = Math.round( l(x, d, f) * cellWidth )` — 즉 **`$x = round( _scales.diff(taskStart, _scales.start, _scales.lengthUnit) * cellWidth )`**.
- 오버레이(`GanttChart.jsx:263`): `x = Math.round( sc.diff(m.start, sc.start, sc.lengthUnit) * cw )`, `sc=state._scales`(`:237-238`), `cw=state.cellWidth ?? cellWidth`(`:257`).
- **동일 함수(`_scales.diff`)·동일 인자(마커일, `_scales.start`, `_scales.lengthUnit`)·동일 승수(cellWidth)·동일 `Math.round`.** 마커 x가 task 막대 $x와 픽셀 단위로 정합. ✔
- 접근 경로 실재 확인: `_scales`는 `{ diff(fn), start(Date), end, lengthUnit, minUnit, lengthUnitWidth }` 구조(gantt-store 소스) → `sc.start instanceof Date`·`typeof sc.diff==='function'`·`sc.lengthUnit` 모두 실존 필드. ✔
- `cellWidth` 소스 일치: task 매퍼와 오버레이 모두 store cellWidth를 쓰고, 오버레이 폴백(`cellWidth` 상수)은 `<Gantt cellWidth={cellWidth}>`로 막대에 전달한 바로 그 값(`:341`) → 어느 경로든 막대와 동일. ✔
- 범위 밖 마커 제외: `:264` `x<0 || x>contentWidth`(`contentWidth=sc.width ?? Infinity`) → 타임라인 밖이면 미표시. `sc.width` 부재 시 Infinity 폴백이라 크래시 없음. rangeStart/rangeEnd(`:137-159`)가 마커를 ±7일 포함하므로 정상 마커는 범위 내. ✔

**O2. 크래시/널 가드 — 전 경로 no-op 안전 (통과).**
- `computeOverlay`(`:232-272`): `!host||!api||typeof api.getState!=='function'` → false(`:235`); `!sc||!(sc.start instanceof Date)||typeof sc.diff!=='function'` → false(`:239`, _scales 미준비 방어); `!chartEl` → false(`:242`); `chartRect.width<=0` → false(`:248`). 모두 throw 없이 조기 반환. ✔
- `scaleEl` 부재 허용: `scaleEl ? rect.height : sc.height||0`(`:247`) → 헤더 못 찾아도 0으로 진행. ✔
- 마커 항목 가드: `!(m&&m.start instanceof Date)||NaN → null`(`:262`) 후 `.filter(Boolean)`. 빈 markers → `lines=[]` → 오버레이 DOM 미렌더(`:354` `overlayLines.length>0`). ✔
- tasks 0개: `:320` early return(null)은 **모든 훅(useEffect 포함 `:276`) 뒤**라 훅 순서 위반 없음. host 미렌더 시 effect의 `setup()`은 `host=null → el=null → computeOverlay 미호출`, rAF 60회 후 정지. 크래시 없음. tasks 채워지면 effect 재실행(deps에 tasks). ✔

**O3. 스크롤/리사이즈 정리 — 누수·스테일 없음 (통과).**
- cleanup(`:310-315`): `cancelAnimationFrame(frame)` + `chartEl.removeEventListener('scroll',syncScroll)` + `ro.disconnect()` + `window.removeEventListener('resize',recompute)`. 4종 모두 해제. ✔
- 조기 언마운트(rAF 재시도 중) 시: chartEl=null·ro=null이라 해당 해제는 건너뛰고 `cancelAnimationFrame`이 대기 프레임 취소, 미등록 resize 해제는 무해 no-op. ✔
- 스테일 클로저 없음: `computeOverlay`는 `useCallback([markers,cellWidth])`, effect deps에 `computeOverlay`/`tasks`/`links`/`zoom`/`rangeStart`/`rangeEnd` 포함(`:317`) → 의존 변경 시 기존 리스너 해제 후 재설정. `syncScroll`은 호출 시점의 `overlayInnerRef.current`/`chartEl` 참조(최신). ✔
- 중복 리스너 방지: `setup()`이 computeOverlay 성공 시 리스너 추가 후 즉시 return → rAF 재시도 루프 종료, 1회 실행당 1쌍만 등록. ✔

**O4. 회귀 불변 — M2/R2/R3·경계면·드래그 (통과).**
- M2: `init`의 `api.on('update-task')`(`:197-223`) 종전 그대로. ✔
- R2 progress 가드: `touchesSchedule`(`:205-209`) 유지 + `gantt.css:41-43` `.wx-progress-marker{display:none!important}` 유지. ✔
- R3: `useGanttMutations.js` 미변경(onSuccess 토스트 제거 상태 유지). ✔
- 경계면 불변: invoke 함수명/파라미터/unwrap/쿼리키·resolver shape 무변경. markers prop은 range 계산용으로만 전달(`:338` 동일). 백엔드 무관. ✔
- 드래그 방해 없음: `.gantt-marker-overlay`(`gantt.css:53-58` `pointer-events:none`)·`.gantt-marker-line`(`:64-72` `pointer-events:none`). z-index:5로 막대 위에 있으나 포인터 이벤트 통과 → 막대 드래그/리사이즈 정상. ✔

### 미검증 (UNVERIFIED — E2E 게이트, 코드로 단정 불가)
- `.wx-chart`/`.wx-scale` 셀렉터 실재 및 **`.wx-chart`가 좌측 grid를 제외한 타임라인 스크롤러인지**(오버레이 left 정렬의 전제). 소스상 `.wx-chart`는 onScroll·마커·주말셀을 품은 타임라인 스크롤러로 보이나 DOM 최종 구조는 브라우저 확인 필요.
- scale 헤더 sticky 여부에 따른 `top` 보정(`box.top = chartTop + scaleH`)의 실제 정확도.
- 세로선이 실제 날짜 컬럼에 떨어지는지 육안, 가로 스크롤 추종(translateX) 매끄러움, rAF 준비 타이밍(최대 60프레임 내 _scales 준비 가정).
- → `forge deploy` 후 브라우저에서 ① week zoom 오늘/시작/종료 세로선 표시 ② 막대와 날짜 정렬 ③ 가로 스크롤 동기 ④ 헤더 침범 없음 확인.

### 실패 (FAIL)
**없음.** 좌표 공식은 task 막대와 소스 레벨 동일 확정(O1), 가드·정리·회귀 모두 통과. 잔여는 DOM 구조/시각 정렬의 **런타임 확인**뿐(차단 아님).

### 커밋 준비 상태 (최종 갱신)
**차단 결함 0 — 커밋 가능.** 커스텀 오버레이는 좌표 공식이 SVAR task 레이아웃과 동일(픽셀 정합 보장), 크래시·누수·스테일 클로저 없음, M2/R2/R3·경계면 전부 불변, 프론트 58/58·빌드 통과. 남은 것은 **오버레이 시각 정렬의 E2E 육안 확인**(DOM 셀렉터/헤더 top 보정/스크롤 추종)뿐으로 커밋을 막지 않는다. 기존 배포 게이트(U1 object roundtrip, U2 SVAR 시각충돌)는 종전대로 유지.

---

## M3 통합 검증 (2026-06-30)

> 범위: 관계 편집(WBS 부모 재지정 + 선후행 링크 add/remove) 백엔드+프론트. 방법: setGanttParent/setGanttLink 응답 shape ↔ 프론트 소비 양쪽 동시 읽기, 검증 순수함수 로직 추적, intercept 배선 검토, 무회귀 확인, 루트/프론트 test+build 실행.

### 실행 결과 (글자 그대로)
- 루트 `npx jest`: **Test Suites: 8 passed / Tests: 125 passed**, 2.34s. (신규 `GanttValidationService.test.js` +13 반영: 112→125.)
- 프론트 `CI=true jest`: **Test Suites: 6 passed / Tests: 58 passed**, 1.382s.
- 프론트 `CI=false npm run build`: **Compiled with warnings.** (third-party 소스맵만, 컴파일 에러 0.)

### 통과 (PASS)

**M3-P1. 경계면 — setGanttParent (최우선).**
- 생산자: `GanttService.js:210-216` `{ content:{ issueKey, parentKey, effectiveParent } }` → responseWrapper `{ success:true, content:{...} }`. `GanttController.js:23-25` 등록.
- 소비자: `useGanttMutations.js:114-127` `invoke('setGanttParent',{projectId,issueKey,parentKey})`, `success!==true`면 `err.cause=result.error` throw, else `result.content`. content 직접 미소비(onSettled invalidate로 재동기화). ✔
- 함수명·파라미터 일치(`{projectId,issueKey,parentKey}`). ✔

**M3-P2. 경계면 — setGanttLink + Link 1:1.**
- 생산자: `GanttService.js:295-300` `{ content:{ target, predecessors:[Link] } }`. Link(`:287-293`)=`{id:'source->target', source, target, type, lag}` — **read links(`GanttMapper.buildTasksAndLinks`의 `{id,source,target,type,lag}`)와 동일 shape**. ✔ 1:1.
- 소비자: `useGanttMutations.js:156-171` `invoke('setGanttLink',{projectId,op,source,target,type,lag})`. 파라미터 일치, content 미소비(invalidate). ✔
- 함수명 `setGanttLink` ↔ `GanttController.js:28` ✔.

**M3-P3. 에러코드 ↔ 토스트 리터럴 일치.**
- 백엔드 throw: `GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF`/`GANTT_CYCLE_DETECTED`(ValidationService + setGanttLink remove 가드). `ErrorCodes.js:50-52` 3종 활성. ✔
- 프론트 `mapRelationError`(`useGanttMutations.js:84-95`): CYCLE_DETECTED→`gantt.error.cycle`, SELF_REFERENCE→`gantt.error.selfRef`, CROSS_PROJECT_REF→`gantt.error.crossProject`, default→`gantt.error.saveFailed`. **코드 문자열·키 리터럴 정확 일치.** ✔
- 전파 경로: LogicalError→responseWrapper `error.code`→`err.cause=result.error`→`err.cause.code`(M2와 동일 검증된 경로). i18n 키 4종 merge 반영 확인(`ko-KR.json:440-444`). ✔

**M3-P4. intercept 배선 정확성 (핵심).**
- **editable=false → 완전 읽기전용 유지**: add-link/delete-link/move-task intercept는 본문이 `editableRef.current===true` 가드 안에서만 실행되고 무권한이면 콜백 없이 `return false`. indent-task=`block`(상수 false). update-task intercept=`()=>editableRef.current===true`(false→차단)(`:301`). 5종 모두 차단 → 로컬 변형·mutate 0. ✔
- **editable=true → 서버권위 모델**: 각 intercept가 의도 추출→`onXxxRef.current(...)` 호출 후 **항상 `return false`**(로컬 트리/링크 변형 차단). 사이클 등 무효 상태가 화면에 안 뜨고 서버 확정+invalidate로만 반영. ✔
- delete-link id 파싱: `parseLinkId(id)`(`ganttAdapter.js:156-164`) 첫 `->` 기준 분해(Jira key엔 `->` 불포함이라 안전), 실패 시 `api.getLink(id)` 폴백. read Link.id 형식과 정합. ✔
- move-task 부모 산출(`:263-288`): `child`→target / `before|after`→`api.getTask(target).parent` / `up|down`·미지원→스킵, `inProgress`→스킵, `0|undefined`→null 정규화, 현재 부모와 동일하면 스킵(무의미 write/토스트 차단). 논리 정확. ✔
- SVAR 링크타입 역매핑: add-link `link.type`(SVAR 코드)→`SVAR_TO_LINK_TYPE[...]||'FS'`(`ganttAdapter.js:26-28` e2s→FS 등). ✔
- 콜백 ref화(`onAddLinkRef`/`onRemoveLinkRef`/`onSetParentRef`, `:105-110`)로 init 1회 클로저 스테일 방지. ✔
- GanttPage 배선(`GanttPage.jsx:31-32,113-124,169-171`): 훅 인스턴스화 + `canWrite` 2차 가드 후 mutate. intercept(editable) + 핸들러(canWrite) 이중 가드. ✔

**M3-P5. 검증 순수함수(가짜양성/음성 없음).**
- `detectTreeCycle`(`GanttValidationService.js:18-51`): null→통과(해제 안전); self→SELF_REFERENCE; 멤버십 실패→CROSS_PROJECT_REF; parentKey에서 effectiveParent 체인 상향 추적해 issueKey 재등장 시 CYCLE(visited로 기존 사이클 무한루프 방어). issueKey가 parentKey의 조상이면 정확 검출, 아니면 미발동 → 가짜양성/음성 없음. ✔
- `detectDagCycle`(`:64-105`): self/멤버십 가드 후, 인접리스트(predecessor→successors) 구성, **target에서 DFS해 source 도달 가능하면 CYCLE**(신규 source→target이 순환 형성). visited 무한루프 방어. 방향·종결점 정확. ✔
- remove(`GanttService.js:250-265`): self+멤버십만 가드, 사이클 검사 없음 — **간선 제거는 사이클 생성 불가하므로 정상**. ✔

**M3-P6. 무회귀.**
- M2 update-task 핸들러(`GanttChart.jsx:304-332`) 무변경(touchesSchedule 가드 포함). ✔
- R1 마커 오버레이 effect/computeOverlay(`:336+`) 무변경. ✔
- R2: touchesSchedule(`:314-318`) + `gantt.css` `.wx-progress-marker{display:none}` 무변경. ✔
- R3: useUpdateSchedule onSuccess 토스트 없음, useSetParent/useSetLink도 성공 토스트 없음(onSettled invalidate + onError만). ✔
- 전 경로 `as='user'`: `fetchGanttGraph`(`getProjectGanttIssues` 기본 user)·`updateIssueFields`(user)·`getAppFieldIds`(user). asApp 0. ✔
- 공통 페처 미오염: M3 검증 그래프도 전용 `getProjectGanttIssues` 재사용, `getProjectIssuesByFilter` 미수정. ✔
- 쿼리키 팩토리: `ganttKeys.data(projectId)` invalidate 사용(인라인 배열 아님). ✔
- 컨트롤러 4종 등록(`GanttController.js`), 경계면(read/M2 shape) 불변. ✔

### 미검증 (UNVERIFIED — deploy/E2E 게이트)
- **predecessorsField(object) write roundtrip**: `PREDECESSORS_AS_STRING=false`(object) write의 set→get 실증은 `forge deploy` 필요(U1 동일). 실패 시 토글만 true로 절체(read는 object/JSON 모두 수용해 대칭) — `serializePredecessors` 단일 추상화로 변경점 최소. **단정 불가, 배포 PoC 게이트.**
- **SVAR 이벤트 payload 실형태**: add-link `link.type`(SVAR 코드), delete-link `id`(합성키), move-task `mode`/`inProgress`/`target`, `api.getLink`/`api.getTask` 메서드 실재 — 브라우저 E2E 확인 항목. (코드는 방어적 try/catch + 폴백으로 작성됨.)
- **부모 해제 시 jiraParent 폴백 거동**(§D-4): `parentKey=null`→effectiveParent가 jiraParent로 폴백(루트 강제 아님)은 **설계 의도(버그 아님)**. 정상 분류.

### 경미 (MINOR — 비차단, 후속 권고)
- **seed 권한 `PROJECT_GANTT` 미등록 지속**(`src/seed/SeedData.js`에 없음, 이전 M-3 항목). 현재 permissionStore 폴백(`{read:true,write:true}`)이 공백을 메워 **모든 read 사용자가 M2 일정·M3 관계 편집까지 가능**. M2부터 있던 동작이라 M3가 만든 회귀는 아니나, 관계 편집이 라이브가 된 만큼 **프로덕션 전 seed + backoffice(getPages) 등록으로 쓰기 권한 게이팅 권고**. 차단 아님.

### 실패 (FAIL)
**없음.** M3 경계면(shape/함수명/파라미터/에러코드)·intercept 배선·검증 순수함수·무회귀 모두 통과.

### M3 커밋 준비 상태
**차단 결함 0 — 커밋 가능.** setGanttParent/setGanttLink 응답 shape ↔ 프론트 소비 정합, Link read 1:1, 에러코드 3종↔토스트 리터럴 일치, intercept 5종 배선 정확(무권한 완전 차단/유권한 서버권위), 검증 순수함수 정상, M2/R1/R2/R3·경계면 전부 불변. 루트 125/125·프론트 58/58·빌드 통과. 잔여는 **배포 게이트**(object roundtrip)·**E2E**(SVAR 이벤트 payload 실형태)·**후속 권고**(seed 권한 게이팅)뿐으로 커밋을 막지 않는다.

---

## M3 검증 (2026-07-01)

> 범위: M3(관계 편집 — WBS 부모 재지정 + 선후행 링크 add/remove)만 재검증 + M1/M2 무회귀. 기준 = `01_architect_design.md` **§370 "M3 구현 명세"**(§A 경계면 계약, §B serialize 게이트, §C 검증서비스, §D intercept, §E-4 무회귀).
> 방법: 생산자(GanttService/GanttValidationService/ErrorCodes)·소비자(useGanttMutations/GanttChart/GanttPage/ganttAdapter) 양쪽 동시 읽기 + 루트/프론트 jest·빌드 실행.
> 비고: 6/30 M3 검증(FAIL 0) 이후 워킹트리 재확인. 소스·라인 전부 현재 워킹트리 기준으로 재대사(re-trace)함. 결론 6/30 대비 회귀 0.

### 실행 결과 (글자 그대로)
- 루트 `npx jest src/resolver/gantt`: **Test Suites: 2 passed / Tests: 36 passed**, 0.985s. (`GanttValidationService.test.js` 13 + `GanttMapper.test.js` 23 = 36.)
- 루트 `npm test`(전체): **Test Suites: 8 passed / Tests: 125 passed**, 2.661s. 무회귀.
- 프론트 `CI=true npm test`: **Test Suites: 6 passed / Tests: 58 passed**, 1.967s.
- 프론트 `CI=false npm run build`: **성공("The build folder is ready to be deployed").** 경고는 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐 — `Failed to compile`/`Can't resolve`/`Module not found`/gantt·svar 관련 에러 **0**.

### 통과 (PASS)

**M3-P1. 경계면 — setGanttParent 응답 shape ↔ 소비 경로 (글자 그대로 교차).**
- 생산자: `GanttService.js:210-216` `return { content:{ issueKey, parentKey:normParent, effectiveParent } }` → responseWrapper가 `{ success:true, content:{...} }` 직렬화. `GanttController.js:23-25` `resolver.define('setGanttParent', responseWrapper(...))` 등록.
- 소비자: `useGanttMutations.js:114-127` `invoke('setGanttParent', { projectId, issueKey, parentKey })` → `result.success!==true`면 `err.cause=result.error` throw, else `result.content ?? result`. content는 직접 필드 접근 없이 onSettled invalidate로 재동기화(§D-3 낙관 미적용). 함수명·입력 파라미터 `{projectId,issueKey,parentKey}` 양쪽 완전 일치. ✔
- effectiveParent 병합규칙: `GanttService.js:200-208` set이면 `normParent`, 해제(null)면 `jiraParent`(keySet 멤버일 때)로 폴백, 아니면 null — §396/§D-4와 정합(해제=루트 강제 아님). ✔

**M3-P2. 경계면 — setGanttLink + Link 1:1 shape.**
- 생산자: `GanttService.js:295-300` `return { content:{ target, predecessors } }`. predecessors 원소(`:287-293`)=`{ id:`${p.key}->${target}`, source, target, type, lag }` — read links(`GanttMapper.buildTasksAndLinks`의 `{id,source,target,type,lag}`, §60/§397)와 **필드·합성키 형식 1:1 동일**. ✔
- 소비자: `useGanttMutations.js:156-171` `invoke('setGanttLink', { projectId, op, source, target, type, lag })` → success 게이트 후 `result.content`. `GanttController.js:28-30` 등록. 입력 payload 6필드 양쪽 일치(§394 계약). ✔

**M3-P3. GanttValidationService 통합 — PUT 이전 호출 + 그래프 조달 (§C).**
- `fetchGanttGraph`(`GanttService.js:143-158`): `getAppFieldIds()`→전용 `getProjectGanttIssues()`→`buildTasksAndLinks()`로 `{ fieldIds, tasks, links, keySet }` 조달. 편집 1건당 경량 1패스(§7/§453), 공통 페처 미오염.
- setGanttParent(`:179-195`): `parentByKey = new Map(tasks.map(t=>[t.key, t.effectiveParent]))` 구성 → `detectTreeCycle({parentByKey,keySet,issueKey,parentKey})` 호출(`:192`) → **통과 후에만** `updateIssueFields` PUT(`:195`). 인자 조달 정확. ✔
- setGanttLink add(`:247-249`): `detectDagCycle({links,keySet,source,target})` → 통과 후 upsert→PUT(`:284`). remove(`:250-265`)는 사이클 검증 생략(간선 제거는 순환 불가), self/멤버십 가드만 유지 — §C-1/§470 정합. ✔

**M3-P4. ErrorCodes 3종 정의 ↔ 검증서비스 참조 ↔ 토스트 키 (3자 교차).**
- 정의: `ErrorCodes.js:50-52` `GANTT_CYCLE_DETECTED`/`GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF` — 주석 아닌 **실코드로 활성**(§C-2). M1/M2 3종(INVALID_DATE_RANGE/FIELD_NOT_RESOLVED/ISSUE_NOT_FOUND, `:45-47`)도 유지.
- 참조(백엔드 throw): `GanttValidationService.js:23/30/42`(tree), `:66/74/95`(dag), `GanttService.js:253/261`(remove 가드) — 전부 `ErrorCodes.*` 상수 참조, 문자열 하드코딩 아님. ✔
- 소비(프론트): `useGanttMutations.js:84-95` `mapRelationError` — `GANTT_CYCLE_DETECTED→gantt.error.cycle`, `SELF_REFERENCE→gantt.error.selfRef`, `CROSS_PROJECT_REF→gantt.error.crossProject`, default→`gantt.error.saveFailed`. 코드 문자열·키 리터럴 정확 일치. 전파 경로: LogicalError→responseWrapper `error.code`→`err.cause=result.error`→`err.cause.code`(M2 검증 경로 재사용). ✔
- i18n 실재: `locales/kr/gantt.json:45-49`(cycle/selfRef/crossProject/saveFailed) + merge 반영 `locales/ko-KR.json:440-443` 확인 — ko-KR 직접 수정 아님, merge 실행됨. 추가 키 0(§C-3대로 M1에서 기생성). ✔

**M3-P5. 프론트 intercept 배선 (add-link/delete-link/move-task 라우팅 + 롤백).**
- `GanttChart.jsx:201-302` `api.intercept(...)`: 3종 모두 `editableRef.current===true` 가드 내에서만 콜백 실행, 그 외/항상 `return false`로 로컬 적용 차단(서버권위 — 무효 상태 화면 미표출). indent-task=`block`(항상 false, `:298`), update-task=`()=>editableRef.current===true`(`:301`). 무권한이면 5종 전부 차단(읽기전용). ✔
  - add-link(`:204-220`): `payload.link.{source,target,type}` 추출, SVAR코드→계약 `SVAR_TO_LINK_TYPE[link.type]||'FS'`(`ganttAdapter.js:26-28`), `onAddLinkRef.current({source,target,type,lag:0})`.
  - delete-link(`:224-249`): `parseLinkId(id)`(`ganttAdapter.js:156-164`, 첫 `->` 분해) → 실패 시 `api.getLink(id)` 폴백 → `onRemoveLinkRef.current({source,target,type:'FS',lag:0})`.
  - move-task(`:253-295`): `inProgress!==true` 확정만, `child→target`/`before|after→api.getTask(target).parent`/`up|down·미지원→스킵`, `0|undefined→null` 정규화, 현재 부모와 동일 시 스킵(무의미 write 차단).
- 콜백 ref화(`onAddLinkRef`/`onRemoveLinkRef`/`onSetParentRef`, `:105-110`)로 init 1회 클로저 스테일 방지. ✔
- 배선 완결: `GanttPage.jsx:31-32`(useSetParent/useSetLink 인스턴스화), `:113-124`(canWrite 2차 가드 후 mutate), `:169-171`(`<GanttChart>`에 onAddLink/onRemoveLink/onSetParent 전달). intercept(editable) + 핸들러(canWrite) 이중 가드. ✔
- **롤백/토스트**: 서버 LogicalError(사이클 등) → useSetParent/useSetLink `onError`(`:135-139`/`:177-181`)에서 `mapRelationError`로 토스트. 낙관 미적용이라 로컬 스냅백 불필요, `onSettled` invalidate(`:131-133`/`:173-175`)가 서버 권위 상태로 재동기화. ✔

**M3-P6. serializePredecessors / PREDECESSORS_AS_STRING 토글 (§B-1).**
- `GanttService.js:17` `const PREDECESSORS_AS_STRING = false;`(단일 상수) + `:24-27` `serializePredecessors(linksArr)` = `PREDECESSORS_AS_STRING ? JSON.stringify({links}) : {links}`. write는 `:284` `updateIssueFields(target, { [predecessorsFieldId]: serializePredecessors(nextPred) })` 한 경로만 사용. read측 `parsePredecessors`는 무변경(object/{links}/JSON문자열/배열 전부 수용 → 대칭). 토글 절체 시 이 상수 1줄 + manifest type만 변경 → mapper/검증/프론트 무변경. 설계대로 단일 추상화 지점 배치. ✔

**M3-P7. 무회귀(§E-4).**
- M1 read(`getProjectGanttData` `:43-93`, Task/Link 필드)·M2(`updateGanttSchedule` `:104-133`, 낙관+롤백 `useUpdateSchedule` `:19-77`) 무변경. ✔
- R1 오버레이(`GanttChart.jsx:336-426` computeOverlay/useEffect)·R2 progress 가드(`:314-318` touchesSchedule)·R3 성공토스트 제거(useUpdate/useSetParent/useSetLink 모두 onSuccess 토스트 없음) 무변경. ✔
- 전 경로 `as='user'`(fetchGanttGraph→getProjectGanttIssues 기본 user, updateIssueFields user), 공통 페처(`getProjectIssuesByFilter`) 미오염, 전용 페처 격리. 쿼리키 `ganttKeys.data(projectId)` 팩토리 사용(인라인 배열 아님). `ganttAdapter.toSvarTasks/toSvarLinks`·`unwrapGanttPayload` 폴백 무변경. ✔
- GanttController 4종 등록 + `src/index.js:27,58` `registerGanttController` import/호출 확인. ✔

### 미검증 (UNVERIFIED — deploy/E2E 게이트, 추측 통과 안 함)
- **U1. predecessorsField(`type: object`) 라이브 set→get roundtrip (deploy 게이트).** `PREDECESSORS_AS_STRING=false`(object) write의 Forge 라이브 왕복은 `forge deploy` 필요 → 코드/jest로 단정 불가. 실패 시 토글만 `true`로 절체(read는 object/JSON 모두 수용해 대칭), `serializePredecessors` 단일 추상화로 변경 최소. §B-2 PoC로 배포 후 확인.
- **U2. SVAR 이벤트 payload 실형태 (E2E 게이트).** add-link `link.type`(SVAR 코드), delete-link `id`(합성키), move-task `mode`/`inProgress`/`target`, `api.getLink`/`api.getTask` 실메서드 — 브라우저 런타임 계약이라 정적 검증 불가. 코드는 방어적 try/catch + 폴백으로 작성돼 오류 시 no-op(로컬 차단은 유지). 배포 후 육안 확인.
- **U3. 부모 해제 시 jiraParent 폴백 거동(§D-4).** `parentKey=null`→effectiveParent가 jiraParent로 폴백은 **설계 의도(버그 아님)**. 검증자·프론트 오판 금지. 정상 분류.

### 경미 (MINOR — 비차단, 후속 권고)
- **seed 권한 `PROJECT_GANTT` 미등록 지속**(`src/seed/SeedData.js`). permissionStore 폴백(`{read:true,write:true}`)이 공백을 메워 모든 read 사용자가 M3 관계 편집까지 가능. §E-3에서 M3 비범위로 확정된 사항(형제 탭 calendar/dashboard도 미시드 → 일관). 차등 권한이 제품 요구가 되면 프로덕션 전 seed+getPages 등록 권고. 차단 아님.

### 실패 (FAIL)
**없음.** §370 M3 명세의 6개 경계면(setGanttParent/setGanttLink shape, 검증서비스 통합, ErrorCodes 3자 교차, intercept 배선, serialize 토글, 무회귀) 전부 통과. 워킹트리 재대사에서 6/30 대비 신규 회귀·불일치 미발견.

### M3 커밋 준비 상태 (2026-07-01 재확인)
**차단 결함 0 — 커밋 가능.** 경계면 정합·검증 순수함수·intercept·무회귀 모두 통과, 루트 36(gantt)/125(전체)·프론트 58·빌드 성공. 잔여는 U1(object roundtrip, deploy 게이트)·U2(SVAR payload, E2E 게이트)·MINOR(seed 권한)뿐으로 커밋을 막지 않는다.

---

## M3 배포 후 런타임 버그 수정 (2026-07-01)

### 증상
배포 환경에서 관계 편집 시 백엔드 로그:
`[UPDATE ISSUE FIELDS] status: 400 {"errors":{"customfield_10382":"Field does not support update 'customfield_10382'"}}`
→ 링크/부모 연결이 저장 안 됨("연결이 안됨"). M2 일정 드래그는 정상.

### 근본 원인
`wbsParentField`·`predecessorsField`는 manifest에서 **`readOnly: true`** Forge 앱 커스텀필드다.
readOnly 앱 필드는 표준 `PUT /rest/api/3/issue/{key}` (updateIssueFields)로 갱신 불가 → 400 "Field does not support update".
- M2(customfield_10015/duedate)는 **표준 Jira 필드**라 PUT /issue 정상 → M2만 동작하고 M3만 실패한 이유.
- U1(object roundtrip)이 아니라 **write 엔드포인트 자체가 틀린** 버그였다(검증은 코드 정합만 봤고, readOnly→엔드포인트 제약은 deploy 게이트 U1 뒤에 가려져 있었음).

### 수정
readOnly 앱 필드는 앱 전용 값 엔드포인트로 write (기존 `projectIdField` = `ProjectUsersService.updateCustomField` 동일 패턴):
`PUT /rest/api/3/app/field/{fieldIdOrKey}/value` (asApp), body `{ updates:[{ issueIds:[숫자id], value }] }`.

- `IssueApi.js`: `updateAppCustomFieldValue({ fieldIdOrKey, issueId, value })` 신규(putJiraJson as:'app').
- `GanttService.js`:
  - `fetchGanttGraph` → `keyToId`(issue key→숫자 id) 맵 추가 반환(엔드포인트가 issueIds 요구).
  - `setGanttParent` write: `updateIssueFields(...)` → `updateAppCustomFieldValue({ fieldIdOrKey: wbsParentFieldId, issueId: keyToId.get(issueKey), value: normParent ?? '' })`. 해제=빈 문자열(read에서 null 정규화).
  - `setGanttLink` write: `updateIssueFields(...)` → `updateAppCustomFieldValue({ fieldIdOrKey: predecessorsFieldId, issueId: keyToId.get(target), value: serializePredecessors(nextPred) })`. serialize 토글·응답 shape 무변경.

### 검증
루트 `npm test` 125/125 통과(회귀 0). GanttValidationService/GanttMapper 순수함수 무영향.
**deploy 후 재검증 필요**: forge deploy → 관계 편집 시 (1) 400 미발생 (2) object roundtrip(U1)까지 동시 확인. object write가 여전히 거부되면 `PREDECESSORS_AS_STRING=true`+manifest string 절체(§B-1).
