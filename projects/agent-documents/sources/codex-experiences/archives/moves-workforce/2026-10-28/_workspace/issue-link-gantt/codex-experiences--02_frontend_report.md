# 02 Frontend Report — issue-link-gantt (M1+M2)

> 작성: frontend-engineer / 2026-06-29 / 슬러그 `issue-link-gantt`
> 범위: **1차 릴리스 = M1(읽기 트리+화살표) + M2(일정 드래그 write-back)**. **M3(관계 편집: 링크 생성/삭제·부모 재지정)은 미구현(범위 외).**
> 기준 계약: 설계서 §2(단일 진실). backend `02_backend_report.md` 미생성 상태 → §2 계약 그대로 소비.

---

## 1. 소비한 응답 shape (§2 계약 기준)

### read: `getProjectGanttData`
```
invoke('getProjectGanttData', { projectId, coworkerFieldId })
→ result = { success, content: { tasks:[Task], links:[Link], meta:{ total, fetchedAt } }, error }
```
- 접근 경로: `result.content.tasks` / `result.content.links` / `result.content.meta`.
- **shape 격리**: `ganttAdapter.unwrapGanttPayload(result)` 한 곳에서만 `result.content`를 꺼낸다. backend가 (다른 도메인처럼) 루트 평탄화로 내려줄 가능성에 대비해 `result.content ?? result` 폴백을 둠 → 실제 shape이 §2와 달라도 **이 함수 1곳만 수정**하면 됨.
- 성공 분기: `result.success === true`. resolver가 `success:false`를 주면 `useGanttData`가 `isError`로 승격.

### write: `updateGanttSchedule` (M2)
```
invoke('updateGanttSchedule', { projectId, issueKey, start, due })
→ result.content = { issueKey, start, due }   // start/due = 'YYYY-MM-DD' | null
```
- `useUpdateSchedule.mutationFn`에서 `result.success !== true`면 throw → onError 토스트.
- 반환 `result.content`는 현재 화면에서 직접 쓰지 않고(낙관적 업데이트 미적용) `onSettled`에서 `invalidateQueries(ganttKeys.data)`로 서버 권위 상태 재동기화.

### Task / Link → SVAR 어댑터 매핑 (`ganttAdapter.js`)

| 계약(§2) | SVAR(wx-react-gantt) | 변환 규칙 |
|----------|----------------------|-----------|
| `Task.id`(=key) | `task.id` | 그대로 |
| `Task.summary` | `task.text` | 없으면 id 폴백 |
| `Task.start/end` ('YYYY-MM-DD') | `task.start/end` (Date) | `parseISODate`(로컬 자정, TZ shift 방지). 한쪽만 있으면 다른 쪽으로 보정. 둘 다 없으면 미지정(요약은 자식에서 산출) |
| `Task.type` ('summary'/'task'/'milestone') | `task.type` | 동일 문자열 패스스루(유효성 검사, 기본 'task') |
| `Task.effectiveParent` | `task.parent` | 부모 key가 페치집합에 있으면 사용, 없으면 `0`(루트) — 교차/유실 참조 방어 |
| `Task.progress` (0~1, null) | `task.progress` (0~100) | `Math.round(progress*100)`, null→0 |
| `Link.id` | `link.id` | 없으면 `source->target` 합성 |
| `Link.source/target` | `link.source/target` | 그대로 |
| `Link.type` ('FS'/SS/FF/SF) | `link.type` ('e2s'/s2s/e2e/s2e) | `LINK_TYPE_TO_SVAR` 매핑(FS→e2s), 미지정→e2s |

역방향(write-back): SVAR `update-task` 이벤트 task(start/end Date) → `extractScheduleChange` → `{ issueKey, start:'YYYY-MM-DD', due:'YYYY-MM-DD' }`.

---

## 2. 변경/신규 파일

### 신규 — `static/ui/src/pages/projectDetail/gantt/`
- **`ganttAdapter.js`** — ★shape 격리 지점★. `unwrapGanttPayload`(content 추출+폴백), `toSvarTasks`/`toSvarLinks`(계약→SVAR), `parseISODate`/`formatISODate`, `extractScheduleChange`(SVAR→write 입력), `LINK_TYPE_TO_SVAR`/`SVAR_TO_LINK_TYPE`.
- **`useGanttData.js`** — `useQuery(ganttKeys.data(projectId))` → `invoke('getProjectGanttData', {projectId, coworkerFieldId})`. coworkerFieldId는 기존 `getCustomFieldId(CustomFieldId.coworkerIdField)` 패턴 재사용. staleTime 5분. `success:false`→isError 승격. 어댑터로 정규화한 `{tasks, links, meta}` 반환.
- **`useGanttMutations.js`** — **`useUpdateSchedule`만**(M2). `useMutation`→`updateGanttSchedule`, onSuccess 토스트, onError 코드별 토스트(`GANTT_INVALID_DATE_RANGE`→dateRange, else saveFailed), onSettled `invalidateQueries(ganttKeys.data)`(성공/실패 공통 revert+재동기화). **useSetParent/useSetLink는 의도적으로 미작성(M3)**.
- **`GanttToolbar.jsx`** — 줌(일/주/월, Atlaskit ButtonGroup), 담당자·상태 멀티 필터(@atlaskit/select), 범례(summary/task/milestone). 순수 프레젠테이션(상태는 Page 소유).
- **`GanttChart.jsx`** — `<Willow><Gantt …/></Willow>` 래퍼 + `import 'wx-react-gantt/dist/gantt.css'`. 줌별 scales/cellWidth. `init(api)`에서 핸들러 1회 부착(콜백/editable은 ref로 스테일 클로저 방지). **M2**: `api.on('update-task')`→일정 write-back. **M3 차단**: `api.intercept('add-link'/'delete-link'/'move-task', ()=>false)`, 쓰기권한 없으면 `update-task`도 intercept로 차단(완전 읽기전용).
- **`GanttPage.jsx`** — 진입(project_id, toast). 게이트: canRead('PROJECT_GANTT')→로딩(Spinner)→에러(SectionMessage `gantt.error.load`)→빈상태(`gantt.empty`)→정상. 담당자/상태 옵션 도출, 필터 적용 후 어댑터 변환(필터로 끊긴 링크는 양끝 visible일 때만 통과). 편집 노출은 canWrite('PROJECT_GANTT')(가이드/readOnlyHint 분기, 드래그 핸들러 가드).

### 수정 — 배선
- **`static/ui/src/utils/queryKey/projectKeys.js`** — `ganttKeys = { all:['projectGantt'], data:(id)=>['projectGantt', id] }` 추가(기존 export 컨벤션 따름, 인라인 키 미사용).
- **`static/ui/src/constants/pages.jsx`** — `PAGE_IDS`에 `"PROJECT_GANTT"` 추가. (permissionStore는 PAGE_IDS 중 API 미반환 항목을 `{read:true,write:true}`로 기본 허용 → 시드 반영 전에도 탭 노출/편집 가능.)
- **`static/ui/src/constants/tabs.js`** — `projectDetailTabs` 시그니처에 `canReadGantt` 추가, 달력 탭 형제로 `projectGantt` 탭 등록(`TimelineIcon` + `t('gantt.tab.label')`, `canRender:()=>canReadGantt`). 컴포넌트 `() => <GanttPage project_id toast/>`.
- **`static/ui/src/components/tabs/ProjectDetailTabs.jsx`** — `canRead('PROJECT_GANTT')`를 store에서 읽어 `projectDetailTabs(...)`에 전달(+useMemo deps).
- **`static/ui/package.json`** — `wx-react-gantt@^1.3.1` 추가.

### 신규 — i18n
- **`locales/kr/gantt.json`** · **`locales/en/gantt.json`** — §10 키표 전체(M3 전용 키 cycle/selfRef/crossProject/linkSaved/parentSaved 포함, 현재 미사용 무방). merge가 파일명을 namespace로 쓰므로 내부는 `gantt.` 접두어 없이 중첩 구조로 작성 → `t('gantt.tab.label')` 등으로 해석.

---

## 3. 아이콘 정정

설계 §4 샘플은 `ChartTimelineIcon`(@atlaskit/icon-lab/core/chart-timeline)을 제안했으나 **해당 아이콘은 패키지에 없음**(icon-lab엔 chart-* 다수/`video-timeline-*`만 존재). → `@atlaskit/icon/core/timeline`의 **`TimelineIcon`**으로 대체.

---

## 4. merge / build / test 결과

| 단계 | 명령 | 결과 |
|------|------|------|
| i18n merge | `cd static/ui && npm run merge` | **성공**. `ko-KR.json`/`en-US.json`에 `gantt.*` 반영 확인(`gantt.tab.label`=간트, `gantt.toast.scheduleSaved` 등, en `gantt.title`=Schedule Gantt). |
| build | `cd static/ui && CI=false npm run build` | **성공(Compiled with warnings)**. 경고는 전부 기존 third-party 소스맵 경고(@atlaskit/analytics-next-stable-react-context, marklassian의 `.ts` 부재) — **내 코드/SVAR 무관**. `export not found` 경고 없음(SVAR `Gantt`/`Willow` export 유효 확인). |
| test | `cd static/ui && CI=true npm test` | **전체 통과 58/58 (6 suites)**. 비파괴. |

---

## 5. SVAR 도입 이슈 (중요 — 리더/verifier 확인 필요)

### 5-1. 설치 시 peer 의존성 사고 → 해결됨
- `wx-react-gantt`는 `react@^18.3.1` peer를 요구, 프로젝트는 `react@18.2.0` → ERESOLVE 충돌.
- **1차 시도 `npm install --legacy-peer-deps`가 함정**: legacy-peer-deps는 peer 자동설치를 **끔** → npm7+가 자동설치해 두던 peer 23종(특히 **`echarts`** — `echarts-for-react`의 peer, package.json엔 미선언)이 **제거**되어 `npm run build`가 `Can't resolve 'echarts'`로 실패. package-lock도 ~1545줄 대량 삭제됨.
- **해결**: `npm install --force`로 재설치(충돌은 무시하되 peer 자동설치는 유지) → echarts(6.1.0) 등 22개 peer 복원, wx-react-gantt(1.3.1) 유지. 이후 build/test 모두 통과. 최종 package-lock diff는 정상 규모(+290/−286, 정규화 수준)로 echarts·wx 모두 lock에 존재.
- **후속 권고**: 동일 사고 방지 위해 (a) `echarts`를 `package.json` dependencies에 명시(peer 누락 정상화) 또는 (b) repo에 `.npmrc`(`legacy-peer-deps=false`/`force` 정책 합의)를 추가하는 것을 검토. **CI/타 개발자 환경에서 `--legacy-peer-deps`로 설치하면 동일하게 echarts가 빠질 수 있음** → 설치 가이드 공유 필요.

### 5-2. 번들 사이즈
- SVAR core(`wx-react-gantt`)는 단일 dist(`gantt.js`+`gantt.css`)로 별도 거대 청크 추가 없이 빌드 성공. CRA가 "bundle size significantly larger than recommended" 경고를 내지만 이는 **기존부터 있던 전체 번들 경고**(ECharts/ApexCharts/FullCalendar 등 누적)로 SVAR 단독 원인 아님. 256MB 런타임 영향 우려 수준 아님.

### 5-3. CSS / 스타일 충돌
- `import 'wx-react-gantt/dist/gantt.css'`를 `GanttChart.jsx` 모듈에서 import(탭 진입 시 로드). 빌드 CSS 추출 정상.
- SVAR는 `<Willow>` 테마 컨텍스트 안에서만 렌더 → Atlaskit/`react-grid-layout` 전역 토큰과 **스코프 분리**(Willow 클래스 네임스페이스). 차트 host에 고정 height(640) 컨테이너 부여.
- **런타임 시각 충돌은 빌드로 확인 불가** → E2E(터널/배포)에서 ① Willow 테마와 Atlaskit 다크/라이트 토큰 간섭 ② Atlaskit 글로벌 reset(`@atlaskit/css-reset`)이 SVAR 행/그리드 높이에 미치는 영향 점검 필요(verifier E2E 항목으로 이관).

---

## 6. 설계 대비 벗어난 점 / 결정 기록

1. **아이콘**: `ChartTimelineIcon`(부재) → `TimelineIcon`(@atlaskit/icon/core/timeline). (§3)
2. **권한 노출 경로**: 설계대로 `PAGE_IDS`에만 `PROJECT_GANTT` 추가. `getPages`(백오피스 권한설정 UI 목록)에는 **미추가** — i18n 라벨 의존 신설을 피하고, 시드/백엔드가 기본 권한을 책임지는 설계(§4)에 맞춤. permissionStore 폴백(`{read:true,write:true}`)으로 시드 반영 전에도 동작. (backend seed에 `PROJECT_GANTT` 추가는 backend 범위.)
3. **revert 방식**: 설계 §4의 "onError revert"를 낙관적 롤백이 아니라 **onSettled invalidate 재조회**로 구현(설계 "MVP는 invalidate 재조회로 단순화" 채택). SVAR가 만든 로컬 변경은 재조회로 서버 상태에 덮어써져 자연 revert.
4. **M3 비활성 방식**: "핸들러 미연결"을 넘어 `api.intercept`로 link add/delete·move-task(부모 재지정)를 **능동 차단** + 무권한 시 update-task까지 차단. 로컬 상태가 비영구 변경되는 것도 방지(읽기 무결성). useSetParent/useSetLink·관련 토스트 키는 미사용 상태로 둠.
5. **필터링 트리 무결성**: 담당자/상태 필터로 부모가 빠지면 자식은 어댑터가 루트(0)로 재부모화. 링크는 양끝이 visible일 때만 표시.

### verifier가 교차검증할 1순위
- backend 실제 `getProjectGanttData` 응답이 **`content`로 감싸는지**(§2) vs 루트 평탄화인지. 후자면 `ganttAdapter.unwrapGanttPayload`의 폴백이 흡수하지만, 계약 불일치이므로 한 곳(어댑터) 고정 또는 backend 정렬 필요.
- `updateGanttSchedule` 응답 `content:{issueKey,start,due}` 및 에러 `error.code` 명칭(`GANTT_INVALID_DATE_RANGE`)이 `useUpdateSchedule` onError 분기와 일치하는지.
- Task `assignee:{accountId,displayName}` / `statusKey` 존재 여부(필터 옵션 도출이 이에 의존).

---

## R1/R2/R3 — 사용자 E2E 보고 3건 수정 (2026-06-30, frontend-engineer)

> 근거: `03_verify_report.md` "추가 진단" R1~R3. 수정 범위 = 3건 + 직접 배선만. 백엔드 경계면(resolver 응답 shape / invoke 함수명 / 쿼리키) 무변경.

### R1. 오늘/시작/종료 표식 미표시 → markers prop 복구
- **수정 파일:** `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`
- **무엇을:** `<Gantt>` props에 `markers={Array.isArray(markers) ? markers : []}` 추가(약 217번째 라인, `links` 다음). highlightMap 주석을 "1차=markers 세로선, highlightTime은 폴백" 으로 갱신.
- **왜:** GanttPage가 만든 markers(`GanttPage.jsx:34-58`)가 GanttChart까지는 prop으로 들어오나, 기존 코드는 highlightMap/range 계산에만 쓰고 정작 `<Gantt>`로는 넘기지 않았다(verifier R1-(a)). SVAR markers는 픽셀 세로선이라 zoom 단위 무관하게 표시되므로 기본 `week` 줌에서도 보인다(highlightTime은 day/hour 줌에서만 적용되는 R1-(b) 한계를 우회). highlightTime 폴백은 보존(중복 강조 무해).
- **markers가 `<Gantt>`까지 닿는 배선 근거(코드 확인):**
  1. `GanttPage.jsx:149` `<GanttChart ... markers={markers} ... />` — markers prop 전달.
  2. `GanttChart.jsx:90` 함수 시그니처 `{ tasks, links, markers, zoom, ... }` — markers 수신.
  3. `GanttChart.jsx` `<Gantt ... markers={Array.isArray(markers) ? markers : []} ... />` — **이번에 복구**. 이로써 GanttPage → GanttChart param → `<Gantt>` 까지 끊김 없이 연결됨.
  - markers 데이터 shape: `{ start: Date, text, css: 'gantt-marker-today|start|end' }` (GanttPage.jsx:39/46/53). SVAR `IMarker { start:Date, text?, css? }` 와 일치. CSS 색상은 `gantt.css:6-37`에 `.gantt-marker-today/start/end`(파랑/초록/빨강) 이미 정의됨.
- **주의 준수:** 이번엔 markers prop 복구까지만. 오버레이 전환은 E2E 실패 확인 후 별도 결정(verifier 권고대로).

### R2. 진척율(progress) 편집 차단 누락 → 핸들 숨김 + write-back 가드
- **수정 파일 ①:** `static/ui/src/pages/projectDetail/gantt/gantt.css`
  - **무엇을:** `.wx-progress-marker { display: none !important; }` 추가(highlightTime 블록 위).
  - **왜:** SVAR 막대의 progress 드래그 핸들(`.wx-progress-marker`)이 기본 노출돼, 쓰기권한자가 끌면 `update-task`가 발생 → 무의미한 일정 write-back + 토스트(verifier R2-(b)). 핸들 자체를 숨겨 드래그를 봉쇄한다. 채움 막대(`wx-progress-percent`) 표시는 유지.
- **수정 파일 ②:** `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` (`update-task` 핸들러)
  - **무엇을:** 일정 무변경 이벤트 스킵 가드 추가 — `ev.task`(부분 diff)가 `start/end/duration` 중 어느 것도 건드리지 않으면 `return`(write-back 안 함). 기존 일정 드래그/리사이즈 경로(start/end/duration 변경 시)는 그대로 통과.
  - **왜:** CSS 핸들 숨김에 더한 2차 안전장치(verifier R2 수정방법 ②). progress-only 이벤트(혹은 일정 무변경 이벤트)가 새어 들어와도 원천 차단. SVAR update-task는 변경 필드만 담은 부분 diff이므로 `start/end/duration` 키 존재 여부로 일정 변경 판별이 가능하고, 기존 코드도 이미 ev.task를 부분 diff로 취급(merge-from-getTask)하던 전제와 일관.
  - **범위 준수:** 표시 한계(done/견적보유 이슈만 progress 산출, 나머지 0)는 데이터 특성이라 미수정.

### R3. 토스트 남발 → 성공 토스트 제거
- **수정 파일:** `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js`
- **무엇을:** `onSuccess`의 `toast.showSuccess(...)` 제거(onSuccess 키 삭제). `onError`의 실패 토스트는 유지. JSDoc도 갱신.
- **왜:** 낙관적 업데이트(onMutate에서 캐시 즉시 반영)라 막대가 이미 제자리에 있어 성공 토스트는 노이즈. 일정 드래그 매 건마다 뜨던 토스트 제거(verifier R3). R2-② 가드까지 더해져 무의미 저장 자체가 사라져 토스트 빈도가 한층 감소.
- **부수효과:** `gantt.toast.scheduleSaved` i18n 키는 미사용으로 남으나(무해), ko-KR/en-US 직접 수정 금지 + 신규 키 없음 → **merge 불필요**(이번 수정에 i18n 키 추가/삭제 없음).

### 테스트/빌드 결과 (글자 그대로)
- 프론트 `CI=true npm test`: **Test Suites: 6 passed, 6 total / Tests: 58 passed, 58 total / Snapshots: 1 passed**. (회귀 0)
- 프론트 `CI=false npm run build`: **Compiled with warnings.** 경고는 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. `Can't resolve`/`Module not found`/gantt·svar·echarts 에러 **없음**. `The build folder is ready to be deployed.`
- merge: 신규 i18n 키 없어 미실행(불필요).

### 수정 파일 요약
- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` (R1 markers prop, R2 write-back 가드)
- `static/ui/src/pages/projectDetail/gantt/gantt.css` (R2 progress 핸들 숨김)
- `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` (R3 성공 토스트 제거)

---

## 커스텀 마커 오버레이 (R1 대체 구현)

### 배경
SVAR `markers`(세로선)는 **PRO 전용**이라 무료 빌드 `@svar-ui/react-gantt@2.7.1` 번들에 marker 렌더 코드가 없다(gantt-store 소스 확인: `markers` config는 타임라인 범위 계산 입력으로만 쓰이고 `_markers`/`wx-marker` DOM 생성 코드 부재). 따라서 `<Gantt markers={...}>` 는 세로선을 그리지 못한다. highlightTime은 `unit:'day'|'hour'` 줌에서만 동작 → 기본 `week` 줌 무효. PRO 번들 끼워넣기는 라이선스 위반이라 금지. → **차트 위에 직접 세로선을 그리는 커스텀 오버레이로 대체.**

### 채택한 좌표 변환 방식 — SVAR api 상태(getState) 사용 (가장 견고)
`init(api)` 로 받은 SVAR api를 `apiRef`에 저장하고, `api.getState()._scales`를 사용한다. gantt-store 소스(`index.js`)에서 task 막대의 `$x` 계산식을 그대로 역추적해 적용:

```
task.$x = Math.round( _scales.diff(taskStart, _scales.start, _scales.lengthUnit) * cellWidth )
```

마커도 **동일한 함수·동일한 입력**으로 계산한다:
```
contentX = Math.round( _scales.diff(markerDate, _scales.start, _scales.lengthUnit) * cellWidth )
```
- `_scales.diff` = SVAR가 task 레이아웃에 쓰는 바로 그 diff 함수(분수 단위 반환, `rt`→`Q` 경로 확인). `_scales.start` = 타임라인 컬럼0 시작(하단 scale 단위로 floor된 지점). `lengthUnit`/`cellWidth`도 task와 동일.
- **결과: 마커 세로선이 task 막대와 픽셀 단위로 정합**(같은 입력→같은 출력이므로 구조적으로 보장). 줌(day/week/month)·월별 일수 보정 모두 SVAR 내부 함수가 처리하므로 수동 컬럼 누적 계산 불필요.
- 수동 계산(요구사항 2번)은 폴백으로 두지 않았다 — api 헬퍼가 항상 존재하고 더 정확하기 때문. `_scales` 미준비 시엔 rAF 재시도로 대기.

### 오버레이 DOM / 레이아웃 / 스크롤 동기화
- **레이아웃 박스는 런타임 DOM 측정**(요구사항 3번 권장안 채택). 호스트(`.gantt-svar-host`, `position:relative`) 안에서 `querySelector('.wx-chart')`(가로 스크롤 컨테이너, 소스에서 `onScroll` 핸들러 확인)·`.wx-scale`(scale 헤더)을 찾아 `getBoundingClientRect`로:
  - `left` = 차트 좌상단 x − 호스트 x (= 좌측 그리드 폭, 측정값이라 컬럼 합/리사이저 무관하게 정확)
  - `top` = 차트 top + **scale 헤더 높이** (세로선이 task 행 영역만 덮도록 헤더 아래로 시작)
  - `width`/`height` = 차트 폭 / (차트 높이 − scale 헤더 높이)
- **DOM 구조(소스 확인):** `.wx-chart`(스크롤러) > `.wx-scale`(헤더) + `.wx-area`(콘텐츠) > `.wx-bars`. scale와 bars가 같은 스크롤러 안에서 같은 가로 원점(x=0) 공유 → `contentX`가 막대와 정렬됨.
- **가로 스크롤 동기화:** 오버레이는 외곽 클립 박스(`.gantt-marker-overlay`, `overflow:hidden`)와 내부 레이어(`.gantt-marker-overlay-inner`)로 구성. 세로선은 내부 레이어에 `left:contentX`로 절대배치, 내부 레이어를 `.wx-chart`의 `scroll` 이벤트에서 `transform: translateX(-scrollLeft)` 로 이동 → 컬럼과 함께 움직인다. `ResizeObserver`(차트 리사이즈)·`window resize`에도 재계산.
- 세로선 3개(오늘 파랑 `gantt-marker-today` / 시작 초록 `gantt-marker-start` / 종료 빨강 `gantt-marker-end`) — 색은 gantt.css의 기존 `gantt-marker-*` 규칙 재사용, 라벨 배경색만 신규 추가. 각 선에 `marker.text` 라벨 + `title`(호버). 전부 `pointer-events:none` 로 막대 드래그 무방해.
- 타임라인 범위 밖(`contentX < 0` 또는 `> _scales.width`) 마커는 렌더 생략(범위는 이미 markers 포함하도록 잡혀 있어 보통 안에 듦).

### 수정 파일:라인
- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx`
  - import에 `useState, useEffect` 추가
  - `hostRef`/`apiRef`/`overlayInnerRef` + `overlayBox`/`overlayLines` 상태 추가
  - `init(api)`에 `apiRef.current = api` 저장
  - `computeOverlay()` useCallback(좌표 계산) + `useEffect`(rAF 재시도 setup·scroll/resize 리스너) 추가
  - 렌더: 호스트 `ref`/`position:relative`, `markers` prop 주석 갱신(무효 명시·유지 사유), `.gantt-marker-overlay` DOM 추가
- `static/ui/src/pages/projectDetail/gantt/gantt.css`
  - `.gantt-svar-host{position:relative}`, `.gantt-marker-overlay`/`-inner`/`.gantt-marker-line`/`.gantt-marker-label` + 라벨 배경색 3종 추가

### i18n
신규 키 없음(`gantt.marker.today/start/end`는 GanttPage에서 이미 생성·사용). → **merge 불필요.**

### 테스트/빌드 결과 (글자 그대로)
- 프론트 `CI=true npx react-scripts test --watchAll=false`: **Test Suites: 6 passed, 6 total / Tests: 58 passed, 58 total / Snapshots: 1 passed, 1 total.** (회귀 0)
- 프론트 `npm run build`: **Compiled with warnings.** / **The build folder is ready to be deployed.** 경고는 기존 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)·merge.js 모듈타입뿐 — GanttChart 관련 에러/경고 **없음**.

### E2E로 확인 필요한 잔여(솔직히 명시)
구현은 정적 분석(gantt-store 소스의 task `$x` 공식·DOM 구조·scroll 핸들러)에 근거했고 단위 테스트/빌드는 통과하나, **실제 브라우저 렌더 검증(E2E)은 미수행**. 다음은 런타임에서 확인 필요:
1. **DOM 셀렉터 가정** — `.wx-chart`(스크롤러)·`.wx-scale`(헤더) 클래스가 실제 렌더 트리에 존재하고 측정이 의도대로 나오는지. 클래스가 다르거나 scale이 별도 sticky 컨테이너면 `top` 오프셋 보정 필요.
2. **scale 헤더 2단 높이** — `.wx-scale` `getBoundingClientRect().height`로 측정하므로 단수와 무관하게 맞아야 하나, 헤더가 `.wx-chart` 밖(별도 viewport)이라면 `top` 재산정 필요.
3. **세로선↔막대 정합** — 공식상 픽셀 정합이 보장되나, `state.cellWidth`가 zoom/autoScale로 `_cellWidth`와 갈리는 케이스에선 어긋날 수 있음(현재 zoom prop 미사용이라 안전). 실제 시작/종료/오늘 선이 해당 날짜 컬럼에 정확히 떨어지는지 눈으로 확인 권장.
4. **가로 스크롤 추종** — 스크롤 시 세로선이 컬럼과 함께 매끄럽게 이동하는지(translateX 동기화 지연/끊김 여부).
5. **초기 렌더 타이밍** — rAF 60회(약 1초) 내 `_scales`/DOM 준비를 가정. 대용량/지연 렌더 환경에서 오버레이가 안 뜨면 재시도 상한 상향 검토.

---

## M3 프론트 구현 (2026-06-30)

> 작성: frontend-engineer / 슬러그 `issue-link-gantt`
> 범위: **M3 = WBS 부모 재지정(setGanttParent) + 선후행 링크 add/remove(setGanttLink)** 프론트 배선.
> 입력: `01_architect_design.md` §A~§E(특히 §D SVAR 인터랙션 배선), `02_backend_report.md` "## M3 백엔드 구현"의 **확정 실제 shape**.
> 무회귀: M1 read·M2 일정 드래그(update-task)·R1 마커 오버레이·R2 progress 가드·R3 토스트 정책 **무변경**.

### 1. 소비한 실제 백엔드 shape (글자 그대로 — `02_backend_report.md` M3 기준)

#### `setGanttParent`
```
invoke('setGanttParent', { projectId, issueKey, parentKey })   // parentKey=null → WBS 해제
→ result = { success, content: { issueKey, parentKey, effectiveParent }, error }
```
- 접근: `result.content` (현재 화면에서 직접 소비 안 함 — 낙관적 미적용, invalidate 재조회로 서버 권위 동기화).
- 실패: `result.success !== true` → `err.cause = result.error` throw → `onError`에서 `err.cause.code` 분기.

#### `setGanttLink`
```
invoke('setGanttLink', { projectId, op:'add'|'remove', source, target, type:'FS', lag:0 })
→ result = { success, content: { target, predecessors:[Link] }, error }
   Link = { id:'source->target', source, target, type, lag }  // read links와 1:1 동일
```
- 접근: `result.content` (predecessors 직접 소비 안 함 — invalidate 재조회로 화살표 갱신).
- 에러코드(둘 공통): `GANTT_CYCLE_DETECTED` / `GANTT_SELF_REFERENCE` / `GANTT_CROSS_PROJECT_REF` / 그 외.

### 2. 추가한 훅 2개 (`useGanttMutations.js`)

| 훅 | mutationFn | onSettled | onError(코드→토스트) | 낙관적 |
|----|-----------|-----------|--------------------|:---:|
| `useSetParent({projectId,toast})` | `invoke('setGanttParent',{projectId,issueKey,parentKey})` | `invalidateQueries(ganttKeys.data(projectId))` | `mapRelationError` | ✗ |
| `useSetLink({projectId,toast})` | `invoke('setGanttLink',{projectId,op,source,target,type:'FS'(기본),lag:0(기본)})` | `invalidateQueries(ganttKeys.data(projectId))` | `mapRelationError` | ✗ |

- 패턴: M2 `useUpdateSchedule`의 `result.success!==true → err.cause=result.error throw`와 동일. **단 onMutate(낙관적) 미적용**(§D-3 — 서버 권위, 무효 트리 화면 노출 0).
- `mapRelationError(t, code)`: `GANTT_CYCLE_DETECTED→gantt.error.cycle` / `GANTT_SELF_REFERENCE→gantt.error.selfRef` / `GANTT_CROSS_PROJECT_REF→gantt.error.crossProject` / default→`gantt.error.saveFailed`.
- **성공 토스트 없음**(R3 — 노이즈 방지). 실패 토스트만(`toast.showError(t('common.toast.title.Fail'), message)`). architect 명세 C-3: `parentSaved`/`linkSaved` 키는 "미사용 유지"로 확정 → 그대로 미사용.
- 쿼리키 신규 0 — 기존 `ganttKeys.data(projectId)` 재사용.

### 3. 3 이벤트 → mutate 배선 (`GanttChart.jsx` init intercept, §D-2)

`init(api)`의 기존 `block=()=>false` 3중 차단을 **editable 분기 intercept**로 대체. 핵심 모델: **항상 `return false`(로컬 적용 차단) + editable일 때만 의도 추출→콜백(mutate)**. 무권한이면 콜백 없이 false만(종전 읽기전용 유지).

| SVAR 이벤트 | intercept payload(소스확인값, D-1) | 산출 의도 | 호출 |
|---|---|---|---|
| `add-link` | `{ link:{ source, target, type(SVAR코드 e2s/s2s/e2e/s2e) } }` | type=`SVAR_TO_LINK_TYPE[link.type]\|\|'FS'`, lag=0 | `onAddLink({ source, target, type, lag:0 })` → `setLink.mutate({op:'add',...})` |
| `delete-link` | `{ id }` (id=`'source->target'`) | `parseLinkId(id)`→`{source,target}` (실패 시 `api.getLink(id)` 폴백) | `onRemoveLink({ source, target, type:'FS', lag:0 })` → `setLink.mutate({op:'remove',...})` |
| `move-task` | `{ id, mode, target, inProgress }` | inProgress=true→스킵; `child`→newParent=target; `before/after`→newParent=`api.getTask(target)?.parent`; `up/down`→스킵; 0/undefined→null 정규화; `api.getTask(id)?.parent`와 같으면 스킵 | `onSetParent({ issueKey:id, parentKey:newParent })` → `setParent.mutate(...)` |

- 콜백 3종은 `onAddLinkRef`/`onRemoveLinkRef`/`onSetParentRef`로 받아 스테일 클로저 방지(기존 `onScheduleChangeRef` 패턴 동일).
- `indent-task`(들여쓰기 핫키)는 editable여도 **항상 차단**(MVP 미배선, §D-2 권고) 추가.
- `update-task` intercept(`()=>editableRef.current===true`)·`api.on('update-task')`(M2 일정 write-back, R2 가드) **무변경**.
- `add-link`/`delete-link`/`move-task` 핸들러는 모두 `try/catch`로 payload 형태 예외를 흡수(로컬 적용은 어차피 false로 차단되므로 안전).

### 4. GanttPage 배선 (`GanttPage.jsx`)
- `useSetParent`/`useSetLink` 인스턴스화(projectId=project_id 주입), `handleSetParent`/`handleAddLink`/`handleRemoveLink` 정의(전부 `canWrite` 가드 — GanttChart `editable`와 2중 가드) → `<GanttChart onAddLink onRemoveLink onSetParent>` 전달. M2 `handleScheduleChange`와 동형.

### 5. i18n
- **추가/변경 0 → `npm run merge` 미실행(불요).** M3 에러 토스트 키(`gantt.error.cycle`/`selfRef`/`crossProject`/`saveFailed`)는 `locales/kr/gantt.json`·`locales/en/gantt.json` 양쪽에 **M1 단계에서 이미 존재**(파일 직접 확인 — kr:45-49 / en:43-49). architect C-3·M1 리포트와 정합. 성공 키(`parentSaved`/`linkSaved`)도 존재하나 R3대로 미사용.

### 6. 수정 파일:라인
- `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` — JSDoc 갱신 + `mapRelationError`(헬퍼) + `useSetParent`/`useSetLink` 추가(파일 말미).
- `static/ui/src/pages/projectDetail/gantt/ganttAdapter.js` — `parseLinkId(id)` 파서 추가(`extractScheduleChange` 위).
- `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` — import에 `parseLinkId, SVAR_TO_LINK_TYPE` 추가; 시그니처에 `onAddLink/onRemoveLink/onSetParent`; 3 콜백 ref; `init(api)`의 `block` 3중을 add-link/delete-link/move-task editable 분기 intercept + indent-task 차단으로 교체(약 185~). M2 update-task/오버레이 무변경.
- `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` — 훅 import/인스턴스화, `handleSetParent`/`handleAddLink`/`handleRemoveLink`(canWrite 가드) 정의, `<GanttChart>`에 3 콜백 prop 전달.

### 7. 테스트/빌드 결과 (글자 그대로)
- 프론트 `CI=true npx react-scripts test --watchAll=false`:
  ```
  Test Suites: 6 passed, 6 total
  Tests:       58 passed, 58 total
  Snapshots:   1 passed, 1 total
  ```
  (회귀 0. M3는 순수 UI 배선이라 신규 jest 케이스 없음 — 검증 순수함수는 백엔드 `GanttValidationService.test.js` 13케이스가 커버.)
- 프론트 `CI=false npm run build`: **Compiled with warnings.** / **The build folder is ready to be deployed.** 경고는 기존 third-party 소스맵(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. `gantt`/`svar`/`Module not found`/`Can't resolve` 에러 **없음**(grep 확인).

### 8. E2E로 확인 필요한 잔여 (코드로 확인 못 한 SVAR payload 실형태 — 솔직히 명시)
구현은 `01_architect_design.md` §D-1의 "소스 레벨 확인값"(architect가 dist를 grep)에 **의존**하며, 프론트 단계에서 실 브라우저 이벤트 payload를 직접 캡처하진 못했다. 다음은 deploy/E2E 게이트:
1. **`add-link` payload 실형태** — `{ link:{ source, target, type } }`이 실제 그대로인지(특히 `type`이 SVAR 코드 문자열인지). 다르면 `SVAR_TO_LINK_TYPE` 매핑 입력이 어긋남 → 어댑터 역매핑 보정.
2. **`delete-link` id 실형태** — payload `id`가 우리 합성키 `'source->target'`인지(우리가 부여한 read id와 일치하는지). 다르면 `parseLinkId` 실패 → `api.getLink(id)` 폴백으로 흡수되는지(폴백 자체가 `getLink` 존재에 의존 — SVAR 무료빌드에 메서드 존재 여부 미확인).
3. **`move-task` mode/inProgress 실형태** — `mode` 값 집합(`child`/`before`/`after`/`up`/`down`)과 `inProgress` 플래그가 확정 이벤트에서 실제로 어떻게 들어오는지. before/after의 `api.getTask(target)?.parent` 산출이 의도한 "형제의 부모"와 일치하는지.
4. **부모 해제 거동(§D-4)** — move-task로 task를 루트로 끌어도 jiraParent 있으면 재조회 시 jiraParent 밑으로 폴백(정상 — 버그 아님). 검증자 오판 방지.
5. **predecessorsField(object) write roundtrip(§B 게이트)** — `setGanttLink` write가 실제 Jira object 필드에 set→get 왕복하는지는 `forge deploy` 후에만 확정(백엔드 `PREDECESSORS_AS_STRING` 토글 게이트). 프론트는 shape 무관(invalidate 재조회로 read links 소비).
