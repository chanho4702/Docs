# 작업(이슈) 추가 이력 기능 — 통합 정합성 검증 리포트

> 검증 기준(SSOT): `01_architect_design.md` 2장 경계면 계약 + `02_backend_report.md`(실측 shape) + `02_frontend_report.md`(소비 shape).
> 검증 방식: 생산자/소비자 양쪽 동시 읽기 + jest/build 실행. "존재 확인"이 아니라 "경계면 교차 비교".

---

## 종합 결과: **전부 통과 (실패 0 / 미검증 0)**

9개 핵심 검증 포인트 전부 통과. 백엔드 89 tests / 프론트 8 tests / 빌드 모두 성공.
경계면 shape 불일치, i18n 키 누락, 회귀 침범, 성능 패턴 위반 **없음**.

---

## 검증 포인트별 결과

### 1. recordIssueAssignedDate 계약 일치 — 통과
양쪽 동시 읽기:
- 생산자: `src/resolver/projectIssue/ProjectUsersController.js:45-50`
  `responseWrapper(({payload, context}) => recordIssueAssignedDateService({...payload, accountId: context?.accountId}))`
  → **accountId를 context에서 서버 취득**(payload 아님, 위변조 방지) 확인.
- 생산자: `src/resolver/projectIssue/ProjectUsersService.js:246` destructure
  `{issueIds, assignedDateFieldId, assignedByFieldId, assignedAt, accountId}` — 계약 입력과 일치.
  반환 `{recorded, skipped}` → responseWrapper가 `{success:true, recorded, skipped}`로 래핑.
  best-effort: 가드 read 실패 시 skip(line 261-264), write 실패 시 throw 없이 recorded=0(line 289-291). 비차단 확인.
- 소비자: `static/ui/src/pages/projectDetail/issue/IssueAddModal.jsx:62-80`
  `invoke('recordIssueAssignedDate', {issueIds: checkItems, assignedDateFieldId, assignedByFieldId})`
  → **accountId/assignedAt 미전송** 확인. `.then` 콜백 내부 try/catch noop(line 67-73)로 비차단. 응답 미사용.
- 등록 함수명 매핑: `recordIssueAssignedDate`가 `registerProjectUsersController`에 정의됨. `src/index.js`는 동 컨트롤러를 이미 등록(추가 등록 불필요) — 백엔드 리포트 4장과 일치.

### 2. searchIssueWithJQL 소비 shape 일치 — 통과
- 생산자 엔드포인트 실재: `static/ui/src/utils/jiraApi/requestJira.js:50-52` `searchIssueWithJQL → POST /rest/api/3/search/jql`(nextPageToken 지원).
- 소비자: `TaskHistoryPage.jsx:58-83`
  - `jql = \`${CustomFieldKey.projectIdField} = "${project_id}"\`` (전체)
  - `fields = ['summary','issuetype','status','assignee','timetracking', assignedDateFieldId, assignedByFieldId]` — **필드 id를 전체 id로 포함** 확인.
  - `fieldsByKeys: false` 확인(line 72).
  - nextPageToken 루프 + MAX_PAGES(20)/MAX_ISSUES(2000)/PAGE_SIZE(100) 상한.
- transform 접근 경로: `taskHistory.transform.js`
  - `assignedAt = issue?.fields?.[assignedDateFieldId] ?? null` (line 26-27) → ISO|null
  - `assignedBy = issue?.fields?.[assignedByFieldId] ?? null` (line 30-31) → **단일 user 객체|null**(배열 가정 안 함, `.map` 등 미사용) 확인.
  - `timetracking.originalEstimateSeconds` (line 19) → number|null. 백엔드 리포트 3-1/3-2 실측 shape과 글자 그대로 일치.

### 3. manifest 커스텀필드 — 통과
`manifest.yml:22-31`:
- `assignedDateField` / `moves_RMS_projectAssignedDate` / `type: datetime` / `readOnly: true`
- `assignedByField` / `moves_RMS_projectAssignedBy` / `type: user` / `readOnly: true` / **collection 미지정(단일)** 확인.
- 프론트 상수와 name 일치: `customField.js:13-25` `CustomFieldId`/`CustomFieldKey`에 두 필드 모두 추가, key 매핑 정확.

### 4. user 필드 set 포맷 — 통과
`ProjectUsersService.js`:
- datetime: `value: JSON.stringify(iso)` (line 286) → `"2026-..."` JSON 문자열.
- user(단일): `value: JSON.stringify([{accountId}])` (line 300) → `[{"accountId":"..."}]` 길이 1 배열.
  coworker와 동일 엔드포인트(`updateCustomField` 재사용) 직렬화 패턴과 일치. 백엔드 리포트 3-2와 동일.

### 5. 권한 게이트 배선 — 통과
시그니처 인자 순서 일치 확인:
- `ProjectDetailTabs.jsx:10` `canWriteProject = usePermissionStore(s => s.canWrite('PROJECT'))`
- `ProjectDetailTabs.jsx:13` `projectDetailTabs(t, project_id, toast, canReadReport, canWriteProject)`
- `tabs.js:52` `export const projectDetailTabs = (t, project_id, toast, canReadReport, canWriteProject) =>`
- `tabs.js:84-93` taskHistory 탭 `canRender: () => canWriteProject` — PROJECT 쓰기 게이트. progress/cost의 `canReadReport`(REPORT) 게이트는 불변(line 146,157).
  → 인자 위치(5번째=canWriteProject) 양쪽 정확히 일치. 어긋남 없음.

### 6. i18n merge 정합성 — 통과
- 소스 파일 `locales/kr/taskHistory.json` / `locales/en/taskHistory.json`: **최상위 `taskHistory` 래핑 제거** 확인(`tab`/`guide`/`insight`/`burnup`/`table`/`state`가 최상위). merge.js가 파일명을 namespace로 감싸므로 정답.
- merge 결과(실측, ConvertFrom-Json):
  - `ko-KR.json` → `taskHistory.tab.label = "작업 이력"`, `en-US.json` → `"Task History"`
  - 이중 래핑 `taskHistory.taskHistory.*` **없음**(검증: 존재여부 False).
  - `insight.baseline`, `state.noTracked`, `burnup.noData` 등 키 생성 확인. kr/en 키 세트 동일.
- UI t() 참조 키 전수 교차(누락 0):
  - TaskHistoryPage: state.error/empty/noTracked, guide, burnup.title/tip, table.title — 전부 존재.
  - InsightCards: insight.{mdUnit,countUnit,baseline,baselineSub,current,currentSub,added,addedSub,untracked,untrackedSub,tip} — 전부 존재.
  - Burnup: burnup.{noData,cumulativeMd,cumulativeCount,colDate} — 전부 존재.
  - Table: table.{issueKey,summary,status,assignedBy,assignedAt,plannedMd,untracked} — 전부 존재.
  - InfoTip의 calcLabel(`projectDetail.analysis.progress.tip.*`)은 progress 네임스페이스 기존 키 재사용. InsightCards는 `<InfoTip calc={...}/>`, Burnup Card는 `info={{interp:...}}` — InfoTip 시그니처(`{calc, interp}`)와 일치.
- `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음(소스→merge 경로 준수).

### 7. 쿼리키 — 통과
`projectKeys.js:21-25` `taskHistory: (projectId) => ['projectTaskHistory', projectId]` 팩토리 추가.
`TaskHistoryPage.jsx:54` `queryKey: projectKeys.taskHistory(project_id)` 사용. 인라인 키 배열 아님.
보조 쿼리(`['getSettingData']`,`['assignedDateFieldId']`,`['assignedByFieldId']`)는 progress의 coworkerFieldId 관용 패턴과 동일 — 허용.

### 8. 회귀 격리 — 통과
git diff 실측:
- `ProjectUsersService.js`: 삭제 라인은 `});` 1개(append로 인한 컨텍스트 변화)뿐. `updateProjectIdFieldService`/`updateCustomField`/`deleteProjectIssueService`/coworker(`getAssigneeStatsService`) 본문 **수정 없음**. import(`pLimit`) + helper(`readIssueFieldValue`) + 신규 export append만.
- `IssueAddModal.jsx`: `.then` 콜백을 async로 바꿔 **성공 후속에만** 비차단 호출 추가. `updateProjectIdField`/`issueSearch`/coworker 경로 미수정.
- `ProjectIssueTable.updateCoworker` 경로 무변경(diff에 미포함).

### 9. 성능 패턴 — 통과
- 백엔드 다건 read 가드: `ProjectUsersService.js:254-267` `pLimit(5)` 동시성 제한 적용 확인. write는 targets를 CSV(`targets.join(',')`)로 묶어 1회 PUT(N+1 아님).
- 프론트 페이지네이션 상한: `TaskHistoryPage.jsx:18-20` MAX_PAGES=20 / MAX_ISSUES=2000 / PAGE_SIZE=100, 루프 break 가드(line 82) 확인.
- 공통 페치 경로 오염 없음(taskHistory 전용 useQuery + 전용 JQL). Resource 분석 등 타 경로 미수정.

---

## 실행 검증 (실제 출력)

### 백엔드 `npm test` (jest) — 통과
```
PASS src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js
PASS src/resolver/projectProgress/__test__/ProgressCalculator.test.js
PASS src/resolver/projectCost/__test__/CostCalculator.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregatorAsApp.test.js
PASS src/rdb/query/__test__/CommonQuery.test.js
PASS src/resolver/portfolioDashboard/__test__/PortfolioAggregator.test.js
Test Suites: 6 passed, 6 total
Tests:       89 passed, 89 total
```
신규 recordIssueAssignedDate.test.js 포함 전체 통과, 기존 5개 스위트 회귀 없음.

### 프론트 `react-scripts test --testPathPattern=taskHistory` — 통과
```
PASS src/pages/projectDetail/taskHistory/taskHistory.transform.test.js
  transformTaskHistory
    √ 등록일 있는 이슈는 tracked, 없는 이슈는 untracked 로 분리
    √ plannedMd 환산: originalEstimateSeconds / (hourRate*3600), 없으면 0
    √ 번업 누적: 같은 날 합산 후 날짜순 누적, baseline=최초 등록일 그룹
    √ untrackedCount 가 insight 에 반영
    √ rowsAll: tracked(등록일시 내림차순) → untracked 순서
    √ assignedBy user 객체 추출
    √ 빈 입력 안전
  buildBurnup / buildInsight 직접
    √ tracked 비어있으면 baseline 0
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

### 프론트 `npm run build` (prebuild merge 포함) — 성공
```
The build folder is ready to be deployed.
```
신규/수정 파일 ESLint 경고 0. 표시된 경고는 node_modules(@atlaskit) source map 누락(기존 존재, 우리 코드 무관).

---

## 미검증 / 한계 (런타임 실배포 외 영역)

다음은 정적 검증/단위테스트로 확인 불가하며 **배포 후 1회 실측 필요**(설계서·백엔드 리포트가 이미 가정으로 명시한 항목, 본 검증 범위 밖):
- Forge 배포 시 datetime/user 커스텀필드 2개 자동 생성 및 실제 set→read 왕복 포맷(`[{accountId}]` 직렬화가 단일 user 필드에서 정상 read되는지). 백엔드 리포트 3-2가 "다르면 한 줄 조정" 단서로 명시 — 코드상 일관성은 확인됨, 실 API 왕복만 미검증.
- `context.accountId` 실 런타임 값(기존 insertProjectusers 등 동일 패턴이라 정적으론 일치, 실측은 배포 시).

이들은 추측으로 통과 처리하지 않고 "배포 후 실측" 항목으로 분류한다(설계 가정과 동일 수준).

---

## 재검증 (등록자 accountId 방식)

> 배경: dev 배포 후 "등록자"가 표시 안 되는 문제(단일 user 커스텀필드 set→read 왕복 실패) 수정.
> 등록자 저장/조회를 **user 커스텀필드 → string 커스텀필드(accountId 문자열)** 로 교체. 변경된 경계면만 집중 교차 검증.

### 재검증 종합: **통과 (실패 0 / 미검증 1)**
변경된 경계면(저장 포맷 ↔ read 소비 ↔ 표시 lookup) 전부 일치. 구 user 필드 잔재 없음. DEBUG 로그 1건(운영 반입 금지 메모). 백엔드 89 / 프론트 8 / 빌드 성공.

### A. manifest ↔ customField.js 상수 일치 — 통과
- `manifest.yml:27-31`: 신 `assignedByIdField` / `moves_RMS_projectAssignedById` / `type: string` / `readOnly: true`. 구 `assignedByField`(user) **제거 확인**.
- `customField.js:17` `CustomFieldId.assignedByIdField = "assignedByIdField"`, `:24` `CustomFieldKey.assignedByIdField = "moves_RMS_projectAssignedById"` — key/name 양쪽 정확히 일치.
- 구 잔재 전체 grep(`assignedByField\b` / `moves_RMS_projectAssignedBy\b` / `JSON.stringify([{accountId`): **소스 코드 잔재 0**. 유일 매치는 `recordIssueAssignedDate.test.js:23 const BY_FIELD = 'app__env__assignedByField'` — 테스트 내 **임의 mock id 문자열 변수명**일 뿐 실제 필드 키/name 아님(정합성 무관). manifest·customField.js·transform·Page·Table·IssueAddModal 어디에도 구 user 필드 미잔존.

### B. 저장 포맷 ↔ read 소비 — 통과
- 생산자: `ProjectUsersService.js:306-318` 2-2 블록 `const assignedByValue = JSON.stringify(accountId)` → `updateCustomField({value: assignedByValue})`. **구 `JSON.stringify([{accountId}])` 완전 제거**, projectId 패턴(따옴표 감싼 문자열 값)과 동일.
- 소비자: `taskHistory.transform.js:29-31` `assignedBy = issue?.fields?.[assignedByFieldId] ?? null` → 주석 "accountId 문자열, user 객체 아님". `:58` 결과를 `assignedById`(문자열 필드)에 저장. user 객체 가정(`.avatarUrls`/`.displayName`/`.accountId` 역참조) **잔재 없음**.
- 저장(string) ↔ read(string) 양쪽 일치.

### C. 등록자 표시 경로 (N+1 점검) — 통과
- `TaskHistoryPage.jsx:96-99` `assignedAccountIds = rowsAll.map(r => r.assignedById).filter(Boolean)` (중복 포함 수집).
- `:100` `useUserInfos(assignedAccountIds)` → `getUserInfos.js:7-11` 내부에서 `[...new Set(accountIds)]` **unique 후** `:13-18` `fetchBulkUsers` **1회 bulk 호출**(queryKey `['jiraUserInfos', normalizedIds]`, staleTime 10분). → **N+1 없음**(이슈 수 무관 1회).
- `:101-107` `userMap = {accountId → user}` 생성 → `TaskHistoryTable rows + userMap` 전달.
- `TaskHistoryTable.jsx:32` `assignedUser = it.assignedById ? userMap[it.assignedById] : null`, `:48-51` 있으면 `<UserAvatar response={assignedUser}/>`, 없으면 `-`. 경계면 일치.

### D. searchIssueWithJQL fields 배열 — 통과
- `TaskHistoryPage.jsx:60-63` `fields = ['summary','issuetype','status','assignee','timetracking', assignedDateFieldId, assignedByFieldId]` — 새 등록자 필드 id 포함.
- `:45-49` `assignedByFieldId = getCustomFieldId(CustomFieldId.assignedByIdField)` 로 **새 필드(assignedByIdField) 전체 id** 조달 → fields/invoke payload 양쪽 동일 값.
- `:73` `fieldsByKeys: false` 유지.
- `IssueAddModal.jsx:70` `getCustomFieldId(CustomFieldId.assignedByIdField)` 로 만든 id를 `:72` invoke payload **키 `assignedByFieldId`** 에 담음(키명 불변, 값만 새 필드 id) — 계약 4번 일치.

### E. DEBUG(task-history) console.log — 통과(운영 반입 금지 메모)
- grep `DEBUG(task-history)`: **`ProjectUsersService.js`에 18건**(entry / guard result / datetime write attempt·success·FAILED / assignedBy write attempt·success·FAILED / done 등). 라인: 252, 280, 290, 299, 303, 312, 320, 324, 330 등.
- **정합성 실패 아님.** 단, 운영 배포 전 **반드시 제거 대상**: (1) Forge 로그 비용/노이즈, (2) `accountId`·필드 id 등 식별 정보가 평문 로깅됨(개인정보/보안 측면), (3) jest 실행 시에도 콘솔에 그대로 출력됨(확인됨). → **운영 반입 금지. 배포 전 9개 console.log 라인 삭제 필요.**

### F. 회귀 격리 — 통과
- `ProjectUsersService.js` git diff: 삭제 라인 `});` 1개(append 컨텍스트 변화)뿐. `updateProjectIdFieldService`/`updateCustomField`/`deleteProjectIssueService`/coworker(`getAssigneeStatsService`) 본문 무수정.
- `ProjectIssueTable.jsx`(coworker `updateCoworker` 경로): git diff 미포함 = **수정 없음**.
- `IssueAddModal.jsx`: `.then` 성공 후속 비차단 호출만, 필드 id 조달을 `assignedByIdField`로 교체. 기존 `updateProjectIdField` 호출 불변.

### 재검증 실행 결과 (실제 출력)
- 백엔드 `npm test`: **Test Suites: 6 passed / Tests: 89 passed**. `recordIssueAssignedDate.test.js` 등록자 body 단언이 **accountId 문자열**로 갱신 확인 — `:71 expect(userCall[1].body).toContain('"acc-123"')` + `:73 expect(...).not.toContain('accountId')`(객체/배열 포맷 아님 단언). (테스트 실행 중 DEBUG 로그가 콘솔 출력됨 — E 항목 근거.)
- 프론트 `--testPathPattern="taskHistory.transform"`: **8 passed**. 신규 계약 테스트 `√ assignedById accountId 문자열 추출(user 객체 아님)` 포함.
- 프론트 `npm run build`(prebuild merge): **성공** ("The build folder is ready to be deployed"). 신규/수정 코드 ESLint 경고 0.

### 재검증 미검증 (배포 후 실측)
- 신 `assignedByIdField`(string) 의 실제 set→read 왕복: `JSON.stringify(accountId)` 저장값이 `issue.fields[id]`로 **accountId 문자열 그대로** 돌아오는지. projectId(string) 패턴과 동일 직렬화라 코드상 일관성은 확인됨 — 이번 변경의 **수정 목적 자체(왕복 실패 해소)이므로 dev 재배포 후 1회 실측 권장**. 정적 검증으론 통과.
