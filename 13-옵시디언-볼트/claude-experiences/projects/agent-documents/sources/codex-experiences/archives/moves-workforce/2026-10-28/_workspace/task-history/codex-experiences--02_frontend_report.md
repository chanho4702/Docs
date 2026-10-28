# 작업(이슈) 추가 이력 기능 — 프론트엔드 구현 리포트

> 백엔드 리포트(`02_backend_report.md`)의 응답/필드 포맷을 단일 진실로 신뢰해 구현했다.
> invoke/executeRequest 소비 경로가 백엔드 계약과 글자 그대로 일치하도록 작성했다.

---

## 1. 소비한 응답 shape (경계면 — 백엔드 계약과 일치 확인)

### 1-1. `invoke('recordIssueAssignedDate', ...)` — 비차단 후속 호출
- 호출: `invoke('recordIssueAssignedDate', { issueIds: checkItems, assignedDateFieldId, assignedByFieldId })`
- **`accountId` 미전송** (서버 context 취득) — 계약 준수.
- **`assignedAt` 미전송** (서버 now) — 계약 준수.
- 응답 `{ success, recorded, skipped }`은 **사용하지 않음**. `try/catch` noop으로 성공/실패 모두 무시(비차단). 소비 위치: `IssueAddModal.submit`.

### 1-2. `executeRequest('searchIssueWithJQL', param)` — 이력 조회 (신규 resolver 아님)
- `param.jql = \`${CustomFieldKey.projectIdField} = "${project_id}"\`` (필터 없음, 전체)
- `param.fields = ['summary','issuetype','status','assignee','timetracking', assignedDateFieldId, assignedByFieldId]`
  - **reporter 미사용**, 등록자 필드 `assignedByFieldId`를 전체 id로 포함.
- `param.fieldsByKeys = false` (필드 id 그대로 전달 — coworker 패턴 일치)
- `param.maxResults = 100`, `nextPageToken` 루프 (MAX_PAGES=20 / MAX_ISSUES=2000 안전 상한)
- 소비 필드(백엔드 리포트 3-1/3-2 실측과 일치):
  - `issue.id`, `issue.key`
  - `issue.fields.summary`
  - `issue.fields.issuetype.iconUrl`
  - `issue.fields.status.statusCategory` → `StatusComponent`에 전달 (`colorName`/`name` 보유)
  - `issue.fields.timetracking.originalEstimateSeconds` (number | undefined)
  - **`issue.fields[assignedDateFieldId]` = ISO datetime 문자열 | null** ← 핵심
  - **`issue.fields[assignedByFieldId]` = user 객체 `{accountId, displayName, avatarUrls}` | null (단일, 배열 아님)** ← 핵심
  - `result.nextPageToken`

### 1-3. `invoke('getSettingData')` — hourRate 조달
- 응답은 **content 래핑 없이 루트 직접**: `settingData?.hourRate || 8`. (progress/issue 패턴 동일)

> 위 세 경로 모두 백엔드 리포트의 실측 shape과 정확히 일치한다. **계약 불일치 없음.**

---

## 2. MD 환산 / 계산 정의 (transform 순수 함수)

- `plannedMd = originalEstimateSeconds / (hourRate*3600)`, 소수 1자리 — `ProjectIssueTable.createRow`와 동일. 값 없으면 0.
- `assignedAt(issue) = issue.fields[assignedDateFieldId] ?? null`
- `assignedBy(issue) = issue.fields[assignedByFieldId] ?? null`
- **tracked**: `assignedAt != null` (등록일시 오름차순) / **untracked**: `assignedAt == null`(추적 전)
- **번업(burnup)**: tracked를 등록 **날짜(YYYY-MM-DD, 시각 절삭)** 그룹 → 같은 날 합산 후 날짜순 누적.
  `points[{ date, dailyMd, cumulativeMd, count, cumulativeCount }]`, `baselineMd`(=points[0].cumulativeMd), `baselineDate`, `totalMd`, `trackedCount`, `baselineCount`.
- **insight**: `baselineMd`(초기 공수=최초 등록일 그룹 누적), `currentTotalMd`(tracked 합), `addedMd`(=current-baseline), `addedCount`(=tracked - baselineCount), `untrackedCount`. (설계 4-5/A2 그대로)
- untracked는 번업 제외, 테이블엔 '추적 전' 표기, 인사이트에 별도 건수.

---

## 3. 추가/수정 파일

### 신규 (프론트 페이지)
| 파일 | 내용 |
|------|------|
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` | 순수 변환/계산(plannedMd/tracked-untracked/burnup/insight) |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryPage.jsx` | 컨테이너: settings·필드id 조달 → searchIssueWithJQL 페이지 루프 → transform → 상태분기 렌더 |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryInsightCards.jsx` | Card 4종(초기/현재총/추가/추적전) + InfoTip |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryBurnup.jsx` | ECharts 번업(누적 공수 line/area) + 다크모드 + ChartTableToggle + noData |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx` | CommonTable. head: 이슈/제목/상태/등록자/등록일시/계획MD. 등록자=`assignedBy`→UserAvatar, 등록일시 dayjs `YYYY-MM-DD HH:mm`, untracked '추적 전' |
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.test.js` | 단위테스트 8건 |

### 신규 (i18n)
| 파일 | 내용 |
|------|------|
| `locales/kr/taskHistory.json` | 한국어 키 (설계 6장, `reporter`→`assignedBy` 반영) |
| `locales/en/taskHistory.json` | 영어 키 |

> **중요(merge 구조)**: `merge.js`는 파일명을 namespace로 감싼다(`taskHistory.json` → `result.taskHistory`). 따라서 파일 내부에서 최상위 `taskHistory` 래핑을 **제거**하고 `tab`/`guide`/`insight`/... 를 최상위에 두었다. 그 결과 `t('taskHistory.tab.label')`이 정확히 매핑된다(설계서 6장 JSON은 한 단계 더 감싸져 있었으나 merge 동작상 그대로 두면 `taskHistory.taskHistory.*`가 되어 오류 — 래핑 제거가 정답). cost.json 등 기존 파일과 동일한 구조.

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/constants/customField.js` | `CustomFieldId.assignedDateField/assignedByField`, `CustomFieldKey.assignedDateField/assignedByField` 추가 |
| `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx` | `submit`: projectId 등록 성공 후 `recordIssueAssignedDate` 비차단(try/catch noop) 호출. **accountId 미전송**. **coworker 경로 미수정** |
| `static/ui/src/constants/tabs.js` | `taskHistory` 탭 추가(`projectIssue` 다음, 최상위). 시그니처에 `canWriteProject` 인자 추가. 게이트 `canRender: () => canWriteProject`. 라벨 `taskHistory.tab.label`. ClockIcon/TaskHistoryPage import |
| `static/ui/src/components/tabs/ProjectDetailTabs.jsx` | `canWriteProject = usePermissionStore(s => s.canWrite('PROJECT'))` 읽어 `projectDetailTabs(...)`로 전달. 기존 `canReadReport` 불변 |
| `static/ui/src/utils/queryKey/projectKeys.js` | `taskHistory: (projectId) => ['projectTaskHistory', projectId]` 추가 |

---

## 4. 쿼리키 (queryKey 팩토리 준수)

- 이슈 수집: `projectKeys.taskHistory(project_id)` (신규 팩토리 키)
- 보조 쿼리(기존 관용 키 재사용): `['getSettingData']`, `['assignedDateFieldId']`, `['assignedByFieldId']` (progress의 coworkerFieldId 패턴 동일, staleTime 30분)
- 인라인 키 배열 없음.

---

## 5. 권한 게이트

- `taskHistory` 탭: **`canWrite('PROJECT')`** 게이트(설계 A1 — 작업관리 편집의 연장선). progress/cost의 `REPORT` 게이트와 구분.
- `CommonTab`는 탭을 숨기지 않고 비권한 시 `NoPermissionPage`를 보여주는 패턴(progress/cost와 동일) — 일관.

---

## 6. merge 실행 / 테스트 / 빌드 결과

- **`npm run merge` 실행 완료** → `locales/ko-KR.json`·`en-US.json`에 `taskHistory` 네임스페이스 생성 확인:
  - `ko-KR.json` `taskHistory.tab.label = "작업 이력"`, `en-US.json` `taskHistory` 존재 확인.
  - `ko-KR.json`/`en-US.json` 직접 수정 없음.
- **단위테스트**: `taskHistory.transform.test.js` — **8 passed / 8 total**.
  - tracked/untracked 분리, plannedMd 환산, 번업 누적·baseline, addedMd/addedCount, untrackedCount, rowsAll 정렬, assignedBy 추출, 빈 입력 안전.
  - (프론트엔드 최초 테스트 파일 — CRA 기본 jest로 정상 동작.)
- **`npm run build`(prebuild merge 포함)**: **성공** ("The build folder is ready to be deployed").
  - 우리 신규/수정 파일에 ESLint 경고 0건.
  - 표시된 "Compiled with warnings"는 전부 node_modules(@atlaskit/marklassian)의 **source map 누락 경고**로 기존부터 존재, 우리 코드와 무관.

---

## 7. 설계 대비 차이 / 비고

1. **i18n 래핑 제거(필수 보정)**: 설계서 6장 JSON은 `{ "taskHistory": { ... } }`로 한 번 더 감싸져 있으나, `merge.js`가 파일명을 namespace로 감싸므로 그대로 두면 `t('taskHistory.taskHistory.tab.label')`이 된다. 파일 내부 래핑을 제거해 설계가 의도한 `t('taskHistory.tab.label')`이 동작하도록 했다. (cost.json 등 기존 파일과 동일 구조 — 설계 의도 보존, 키 경로 동일.)
2. **상태 분기**: 설계 4-4의 로딩/에러/이슈0건(empty)/추적0건(noTracked) 4분기 모두 구현. 추적0건일 때도 인사이트 카드(untracked 건수 노출) + 이력 테이블은 렌더하고, 가운데 information 메시지로 안내.
3. **번업 차트**: 최소 요구(누적 공수 1선)를 step:'end' line + area로 구현, 툴팁에 누적 건수 보조 표기. ChartTableToggle로 로우데이터(표) 토글 제공.
4. **Card info**: 번업 Card에 `info={{ interp: t('taskHistory.burnup.tip') }}` 전달(Card→InfoTip). InfoTip의 "계산/해석" 라벨은 기존 progress 네임스페이스 키 재사용(이미 존재).
5. 새 npm 의존성 추가 없음(echarts-for-react/CommonTable/Card/UserAvatar/Atlaskit/dayjs 1.11.20 모두 기존 존재).
6. **회귀 격리**: coworker 경로(`ProjectIssueTable.updateCoworker`)·`updateProjectIdField` 미수정. IssueAddModal은 submit의 성공 후속에만 비차단 호출 추가.

### 검증자 주목 포인트
- `issue.fields[assignedDateFieldId]`(ISO|null) / `issue.fields[assignedByFieldId]`(user 객체|null) 접근이 transform.js·TaskHistoryPage.jsx에서 백엔드 실측 shape과 일치.
- `recordIssueAssignedDate` 호출에 accountId/assignedAt 미전송, 비차단 try/catch noop.
- 등록자는 reporter가 아니라 `assignedByField` 기반(설계 A4).

> ⚠️ **1~7장의 등록자 부분(user 객체 read·`assignedByField`)은 아래 8장 변경으로 무효화되었다. 등록자 read/표시 경로는 8장을 따른다.**

---

## 8. 등록자 표시 방식 변경 (user 객체 → accountId lookup)

> **배경:** task-history dev 배포 후 이슈 등록 테스트에서 작업 이력 테이블의 "등록자"가 표시되지 않음.
> 원인: 단일 user 커스텀필드의 set→read 왕복 실패. 백엔드가 등록자를 **user 객체가 아니라 accountId 문자열**로 저장하도록 변경(`02_backend_report.md` 8장).
> **방향(사용자 지시):** 등록자는 accountId 문자열로 저장하고, 그 accountId 로 사용자를 조회해 displayName/avatar 를 표시. 기존 훅 `useUserInfos(accountIds)` 재사용(bulk, N+1 회피).

### 8-1. 소비하는 새 read shape (백엔드 8장 계약과 글자 그대로 일치)

| 필드 | read 경로 | 값 타입 |
|------|----------|---------|
| 등록일 | `issue.fields[<assignedDateFieldId>]` | **ISO datetime 문자열 \| null** (불변) |
| 등록자 | `issue.fields[<assignedByIdFieldId>]` | **accountId 문자열 \| null** (⚠️ user 객체 아님) |

- 등록자 read 값은 이제 `"acc-123..."` 같은 **accountId 문자열**(또는 null). user 객체가 아님.
- 등록자 필드 id 는 `getCustomFieldId(CustomFieldId.assignedByIdField)`(name `moves_RMS_projectAssignedById`)로 생성한 **전체 id**. `searchIssueWithJQL` 의 `fields` 배열에 이 id를 그대로 넣고 `fieldsByKeys:false` 유지.
- tracked/untracked 판정은 여전히 `assignedAt`(datetime) 기준 — 변경 없음. 등록자 변경은 표시 경로에만 영향.

### 8-2. accountId → user lookup 후 UserAvatar 표시 경로 (useUserInfos 사용 위치)

`TaskHistoryPage.jsx`:
1. `transformTaskHistory` 가 각 행에 `assignedById`(accountId 문자열|null)를 담는다(기존 `assignedBy` user 객체 → `assignedById` 문자열로 교체).
2. `model.rowsAll` 에서 `assignedById` 를 모아(중복 포함, falsy 제거) `useUserInfos(assignedAccountIds)` 로 **bulk 조회** → `data`(user 객체 배열).
3. `accountId → user` 맵(`userMap`) 생성 → `<TaskHistoryTable rows={model.rowsAll} userMap={userMap} />` 로 전달(noTracked 분기·정상 분기 양쪽).

`TaskHistoryTable.jsx`:
- 각 행 등록자 칸: `userMap[it.assignedById]` 로 user 를 찾아 `<UserAvatar response={user} />` 표시. 없으면(`accountId` 없거나 아직 lookup 전) `-`.
- `useMemo` deps 에 `userMap` 추가.

> `useUserInfos`(`static/ui/src/utils/jiraApi/users/getUserInfos.js`)는 unique accountId 를 정규화해 `fetchBulkUsers`(`getBulkUser`, 50개 chunk)로 1회성 bulk 조회 → `{ data, isLoading }` 반환(`data` = user 객체 배열, 각 `accountId`/`displayName`/`avatarUrls` 보유). N+1 없음.

### 8-3. recordIssueAssignedDate payload (키 불변, 값만 새 필드 id)

- `IssueAddModal.submit`: `getCustomFieldId(CustomFieldId.assignedByField)` → **`getCustomFieldId(CustomFieldId.assignedByIdField)`**.
- invoke payload 키는 **`assignedByFieldId` 유지**(백엔드가 그 키로 받음), 값만 새 string 필드(`assignedByIdField`)의 전체 id.
- accountId/assignedAt 미전송, try/catch noop 비차단 유지 — 불변.

### 8-4. 변경 파일 목록

| 파일 | 변경 |
|------|------|
| `static/ui/src/constants/customField.js` | `CustomFieldId.assignedByField`(user) → `assignedByIdField`(string), `CustomFieldKey.assignedByField`(`moves_RMS_projectAssignedBy`) → `assignedByIdField`(`moves_RMS_projectAssignedById`) 교체. `assignedDateField`(datetime) 불변 |
| `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx` | submit 의 `assignedByField` → `assignedByIdField`. payload 키 `assignedByFieldId` 유지(값만 새 id) |
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` | `assignedBy`(accountId 문자열 반환) JSDoc 갱신, `normalizeIssue` 가 행에 `assignedById`(accountId 문자열\|null) 담음(구 `assignedBy` user 객체 키 제거) |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryPage.jsx` | `assignedByFieldId` 조달 useQuery 를 `CustomFieldId.assignedByIdField` 기준으로(관용 키 `['assignedByFieldId']` 유지). `useUserInfos` 로 accountId→user 맵 생성 후 테이블에 `userMap` 전달 |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx` | `userMap` prop 수신, 등록자 칸을 `userMap[it.assignedById]` lookup → `UserAvatar` (구 `it.assignedBy` user 객체 직접 사용 제거) |
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.test.js` | `BY_ID` 상수를 `assignedByIdField` 로, "assignedBy user 객체" 테스트를 "assignedById accountId 문자열 추출(null 포함)" 로 수정. 나머지(plannedMd/번업/tracked-untracked/insight/정렬/빈입력) 유지 |

- **회귀 격리**: coworker 경로(`ProjectIssueTable.updateCoworker`)·`updateProjectIdField`·탭/권한 배선·번업/인사이트 계산·등록일 read 경로 — 미수정. 등록자 read/표시 경로만 변경.

### 8-5. i18n / merge

- **라벨 변경 없음**: 등록자 칸 라벨 `taskHistory.table.assignedBy` 그대로. 신규 i18n 키 추가 없음.
- 빌드 `npm run build` 의 prebuild 가 merge 를 자동 실행(별도 수동 merge 불필요). 기존 `taskHistory` 네임스페이스(8장 이전 생성) 그대로 유지.

### 8-6. 테스트 / 빌드 결과 (Windows PowerShell)

- **단위테스트** `taskHistory.transform.test.js` (`npm test -- --watchAll=false --testPathPattern="taskHistory.transform"`):
  ```
  Test Suites: 1 passed, 1 total
  Tests:       8 passed, 8 total
  ```
  - assignedById accountId 문자열 추출(`'acc-1'` / null) 단언 포함, 8건 전부 통과.
- **빌드** `npm run build`(prebuild merge 포함): **성공** ("The build folder is ready to be deployed").
  - 우리 신규/수정 파일 ESLint 경고 0건. "Compiled with warnings" 는 전부 node_modules(@atlaskit/analytics-next, marklassian) **source map 누락** 경고로 기존부터 존재, 우리 코드 무관.

### 8-7. 검증자 주목 포인트 (1순위)

- `issue.fields[<assignedByIdFieldId>]` = **accountId 문자열|null** 접근이 transform.js(`assignedBy`/`normalizeIssue.assignedById`)·TaskHistoryPage.jsx 에서 백엔드 8장 shape 과 일치(더 이상 user 객체로 소비하지 않음).
- 등록자 표시: `useUserInfos(accountIds)` bulk lookup → `userMap[accountId]` → `UserAvatar`. reporter 아님.
- `recordIssueAssignedDate` payload 키 `assignedByFieldId`(값=`assignedByIdField` 전체 id), accountId/assignedAt 미전송, 비차단.

---

## 9. 등록 이력 카드 필터 — ProjectFilter(카드 안) + 클라이언트 사이드(테이블만, 번업/인사이트 전체 유지)

> **최종 방향(사용자 확정):** `ProjectFilter`(업무 검색 + 스페이스 + 담당자 + 상태)를 **등록 이력 카드 안(테이블 위)** 에 두고, **필터는 등록 이력 테이블에만** 적용한다.
> 번업·인사이트는 scope creep 본래 목적상 **프로젝트 전체 기준**을 유지. → 직전의 "JQL 서버 필터(전체 반영)" 를 폐기하고 **클라이언트 사이드 필터**로 전환.
> (데이터 수집은 필터 없이 projectId 전체 1회로 복원 → 캐시키도 원복 → IssueAddModal invalidate 정확 매칭.)

### 9-1. 필터 적용 흐름 (카드 안 ProjectFilter → jqlMap → 클라이언트 필터 → 테이블)
1. **카드 안 ProjectFilter**: 등록 이력 `Card` children 안(테이블 위)에 `<ProjectFilter addJqlMap={addJqlMap}/>` 렌더. (정상 분기·noTracked 분기 모두 동일 카드 `historyCard` 재사용.)
2. **jqlMap state**: `TaskHistoryPage` 에 `const [jqlMap, setJqlMap] = useState({})` + `addJqlMap(key,value)`. `useEffect(()=>setJqlMap({}), [project_id])` 로 프로젝트 변경 시 초기화. **`useDebounce` 미사용**(클라이언트 필터라 즉시 반영).
3. **클라이언트 필터**(번업/인사이트 무관): `const filteredRows = useMemo(() => applyTaskHistoryFilter(model.rowsAll, jqlMap), [model, jqlMap])`.
4. **테이블만 필터 결과**: `<TaskHistoryTable rows={filteredRows} userMap={userMap}/>`. 번업/인사이트는 전체 `model.burnup`/`model.insight` 그대로.

### 9-2. 데이터 수집 복원 (필터 없이 전체 1회) + 캐시키 원복
- queryFn jql = `` `${CustomFieldKey.projectIdField} = "${project_id}"` `` 만 (generateJQL/filterJql **제거**). `generateJQL`/`useDebounce` import 제거.
- **useQuery 캐시키 = `projectKeys.taskHistory(project_id)`** (= `['projectTaskHistory', project_id]`) 로 복원(jqlMapDebounce 미포함). → **IssueAddModal 의 `invalidateQueries({queryKey: projectKeys.taskHistory(project_id)})` 가 원래대로 정확히 매칭**(미수정). `enabled: !!project_id && fieldsReady` 유지.
- **fields 배열에 `'project'` 추가**(스페이스 필터에 `issue.fields.project.key` 필요). 나머지 fields 유지.
- transform 입력 `issues` 는 전체 → `model.rowsAll`/`burnup`/`insight` 전체 기준(필터 무관).

### 9-3. transform.js 확장 — raw 키 + applyTaskHistoryFilter(순수 함수)
- `normalizeIssue` 가 각 행에 추가: `projectKey`(`issue.fields.project?.key`), `assigneeAccountId`(`issue.fields.assignee?.accountId`), `statusCategoryKey`(`issue.fields.status?.statusCategory?.key`). 기존 키 유지.
- `applyTaskHistoryFilter(rows, jqlMap)` — jqlMap(ProjectFilter/jqlMaker 와 동일 구조)을 row 술어로 매핑, **AND 결합**, 빈 값/빈 배열 필터 스킵:

| jqlMap 키 | 구조 | row 술어 |
|---|---|---|
| `textfields` | string | `(summary + ' ' + key).toLowerCase().includes(term)` (빈 문자열 스킵) |
| `project` | `{state, value:[key]}` | `has = value.includes(row.projectKey)`; `'='`→`has`, `'!='`→`!has` |
| `assignee` | `{state, value:[accountId\|'EMPTY'\|'membersOf(...)']}` | `matched = value.some(v => v==='EMPTY' ? row.assigneeAccountId==null : (v.startsWith('membersOf(') ? false : v===row.assigneeAccountId))`; `'='`→`matched`, `'!='`→`!matched` |
| `statusCategory` | `{state:'=', value:['new'..]}` | `value.includes(row.statusCategoryKey)` |

### 9-4. membersOf(그룹) 한계 (명시)
- assignee 필터의 **`membersOf("그룹명")` 토큰은 클라이언트에서 그룹 멤버를 알 수 없어 매칭 불가** → 술어에서 **false 처리**(그 토큰은 효과 없음/0건 기여). 개인 담당자/미할당(`EMPTY`)은 정상 동작.
- assignee 의 "담당자" 는 **이슈 담당자(`issue.fields.assignee`)** 기준(작업관리 ProjectFilter 와 동일 의미). 등록자(`assignedBy`)와는 별개.

### 9-5. i18n
- **추가/제거 키 없음**. ProjectFilter 는 자체 placeholder(`projectDetail.filter.*` 기존 키) 사용. 이전에 제거한 `searchPlaceholder` 는 그대로 둠(merge 불필요).

### 9-6. 변경 파일
| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryPage.jsx` | JQL 서버 필터 폐기: jql 단순화(`generateJQL`/`useDebounce` import 제거), 캐시키 `projectKeys.taskHistory(project_id)` 원복, fields 에 `'project'` 추가. `jqlMap`/`addJqlMap`/reset effect 유지. `applyTaskHistoryFilter` 로 `filteredRows` 산출. ProjectFilter 를 등록 이력 `Card` 안(테이블 위)으로 이동, 테이블에 `filteredRows` 전달(정상·noTracked 분기 공통 `historyCard`) |
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` | `normalizeIssue` 에 `projectKey`/`assigneeAccountId`/`statusCategoryKey` raw 키 추가. `applyTaskHistoryFilter(rows, jqlMap)` 순수 함수 추가 |
| `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.test.js` | `applyTaskHistoryFilter` 케이스 6건 추가(빈맵/textfields/project=·!=/assignee 개인·EMPTY·membersOf·!=/statusCategory/AND) |
| `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx` | (직전 작업에서 이미) 표시 전용 — 변경 없음. `rows`(=filteredRows)/`userMap` 만 받음 |

- **회귀 격리**: `ProjectFilter`/`generateJQL`/`useDebounce`/작업관리(`ProjectIssuePanel`) 재사용만(수정 0). IssueAddModal `invalidateQueries` 미수정 — 캐시키 원복으로 정확 매칭. `TaskHistoryInsightCards`/`TaskHistoryBurnup`/백엔드 미수정. 번업/인사이트 전체 기준 보존.

### 9-7. 테스트 / 빌드 결과 (Windows PowerShell)
- **단위테스트** `taskHistory.transform.test.js`: **14 passed / 14 total** (기존 8 + `applyTaskHistoryFilter` 6 신규).
- **빌드** `npm run build`(prebuild merge 포함): **성공** ("The build folder is ready to be deployed"). 우리 파일 컴파일 에러/ESLint 경고 0건(제거한 import 의 no-unused 경고 없음), "Compiled with warnings" 는 node_modules source map 누락(기존·무관).
