# Resource Profile v2 (Overview 테이블 재구성) — 통합 정합성 검증 리포트

> 검증자: integration-verifier. 방법: 생산자(resolver/service/fetcher/SQL)↔소비자(invoke 훅/컴포넌트) **양쪽 동시 읽기** 교차 비교 + jest/build.
> 기준: `01_architect_design_v2_columns.md` §2 계약. v1(통과 완료) 위 델타만 검증.
> **결론: 경계면 불일치·회귀 0건. 전 항목 통과.** 실행 검증(백엔드 229 / 프론트 74 / build) 성공(worktree 노이즈 제외).

---

## 통과 (PASS)

### P1. `getResourceLoadSummary` 확장 — LoadRow 7필드 + completionRate null 처리 일치
- 생산자: `ResourceManagementService.js:286-299` → `content.load[]` 에 `{accountId, todoCount, inProgressCount, doneCount, projectCount, spentSeconds, remainingSeconds, completionRate}`. `completionRate = computeCompletionRate(spent, rem)`(`:252-255`, 분모 0 → `null`).
- 소비자: `useResourceLoadSummary.js:36-44` → `Map(accountId→LoadRow)` 7필드 전부, 기본값 카운트 `?? 0` / `completionRate ?? null`. ✓
- 테이블 소비 경로(`ResourceOverviewTable.jsx:63-73`):
  - `AssignedIssueCell` ← `todoCount/inProgressCount/doneCount`(`:66-70`) ✓
  - `projectsCell` ← `projectCount ?? 0`(`:72`) ✓
  - `CompletionBar rate` ← `completionRate ?? null`(`:73`) → null이면 `-`(`CompletionBar.jsx:27-29`, `overview.completion.none`) ✓
- **미존재 계정 기본값**: 배치 미도착(`isLoadPending && !load`) → `-` 대시(`:61-64`); 도착 후 Map 미존재 → 카운트 0 / rate null(생산자 union 규칙 `Service:285` = loadMap∪projectCountMap 키, 둘 다 없는 계정만 생략). 소비측 기본값과 정합. ✓
- **lazy 비차단**: 테이블은 `isLoadPending`과 무관하게 즉시 렌더(`ResourceOverviewTab.jsx:121-126` 로딩 게이트는 `useResourceOverview`만). ✓
- **필드명 혼동 방지**: v2는 `spentSeconds`/`remainingSeconds`(v1 In-Progress 배치의 `remainingEstimateSeconds`와 별개). 소비측도 v2 필드명으로만 접근. ✓

### P2. `getResourceProfile` load 확장 — v1 유지 + 신규 4필드, 목록 In-Progress 유지
- 생산자: `ResourceManagementService.js:203-214` load = v1 필드(`inProgressCount`=목록 length, `remainingEstimateSeconds`=per-head 합, `util`, `utilBand`) **유지** + v2 신규 `todoCount`/`doneCount`/`completionRate`/`projectCount`. 배치 `spentSeconds`/`remainingSeconds`·배치 inProgressCount는 **드로어 load에 미노출**(완수율 내부 산출용) — 백엔드 리포트 §2.2와 일치. ✓
- 소비자: `LoadSummaryCards.jsx:46-73` → `todoCount`/`inProgressCount`(v1)/`doneCount`(AssignedIssueCell) + `completionRate`(CompletionBar) + `projectCount` + `remainingEstimateSeconds`(시간) + `util`(UtilBadge). 생산자 노출 필드와 정확히 대응, 미노출 필드 접근 없음. ✓
- **진행중 이슈 목록 회귀 없음**: `getResourceProfileService:176` 여전히 `fetchInProgressIssuesForAccount`(In-Progress only) 소비 → `inProgressIssues` v1 그대로, `InProgressIssueList` 변경 없음. ✓

### P3. 회귀 방지 핵심 — In-Progress 페처 2종 불변, Match/드로어목록 무회귀
- `ResourceLoadFetcher.js`: `fetchInProgressLoadByAccounts`(`:177`)·`fetchInProgressIssuesForAccount`(`:58`) **미수정**. `statusCategory = "In Progress"` 필터(`:61,119`) 그대로. 신규 all-status 로직은 별도 함수(`fetchAssignedLoadByAccounts:299`/`fetchAssignedLoadForChunk:224`)에만 존재. [[feedback-worklog-fetch-isolation]] 준수. ✓
- 호출부 전역 grep(`src/`) 교차 확인:
  - `fetchInProgressLoadByAccounts` → **오직** `getProjectSkillMatchService:325`(Match candidate.inProgressCount/remainingEstimateSeconds). 계약 무변경. ✓
  - `fetchInProgressIssuesForAccount` → **오직** `getResourceProfileService:176`(드로어 In-Progress 목록). 무변경. ✓
  - `fetchAssignedLoadByAccounts` → 신규 소비 2곳(`getResourceLoadSummaryService:280` 전원, `getResourceProfileService:180` 단일계정)만. ✓
- `CandidateRankTable.jsx` **손대지 않음** — grep 결과 `inProgressCount`(`:60`)·`remainingEstimateSeconds`(`:63`) v1 Match 필드만 소비, v2 필드(todoCount/completionRate/assignedIssues) 참조 0. ✓

### P4. 신규 배치 `fetchAssignedLoadByAccounts` — 설계 §3.1~3.2 일치
- statusCategory.key 3분류(`ResourceLoadFetcher.js:273-275`): `new`→todoCount, `indeterminate`→inProgressCount, `done`→doneCount. 코드베이스 실측(GanttMapper/ProgressCalculator/IssueAnalysisService) 근거. ✓
- **균등 분할**: 건수(todo/inProgress/done)는 관여 건수(`+= 1`, 분할 안 함), `spent`/`rem`은 `perSpent`/`perRem`(÷participantCount, `:261-262,276-277`). participantCount = `Max(1, (assignee?1:0)+coworkers.length)`(`:260`). ✓
- **completionRate 상쇄**: `computeCompletionRate = spent/(spent+rem)`(`Service:252-255`). 각 이슈 동일 n으로 분자·분모 동시 반영 → 분할 무관·값 불변(설계 §3.2). ✓
- JQL: `(assignee in (ids) OR movesRmsCoworkers in (ids)) AND (statusCategory != Done OR updated >= "-26w")`(`:228`), `LOAD_DONE_WINDOW='-26w'` 상수화(`:26`). Done 볼륨 한정. ✓
- 청크 disjoint 이중계상 방지(chunkSet 소속만 계상 `:271`, 참여자 Set 중복제거 `:265-268`), 50청크+p-limit(3)(`:29-30,308-312`). asUser(`:246`). ✓

### P5. `FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS` — SQL·바인딩·병합 정합
- 쿼리(`ProjectUsersQuery.js:122-131`): `projectusers ⋈ project`, `WHERE account_id IN (?,...) AND (end_date IS NULL OR end_date >= CURDATE())`, `GROUP BY account_id`, `COUNT(DISTINCT project_id) AS active_project_count`. 활성 필터 = 설계 §3.3. ✓
- `generateInClause(count)`(`CommonQuery.js:49-52`) → `(?, ?, ...)` — `IN ${...}` 자리에 괄호 포함. import 확인(`ProjectUsersQuery.js:1`). ✓
- 바인딩: `executeQuery(FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS(accountIds.length), accountIds)`(`Service:262-264`) — placeholder 수 = accountIds 길이 일치. ✓
- 병합: `selectActiveProjectCounts`(`Service:258-270`) → `Map(account_id → Number(active_project_count)||0)`, try/catch 실패 시 빈 Map(부분 폴백). LoadSummary/Profile 양쪽 `projectCount = map.get(acc) ?? 0`(`Service:294,213`)로 병합. ✓

### P6. 제거 컬럼 잔재 없음 + i18n 대조
- `ResourceOverviewTable.jsx` import: `Tooltip/CommonTable/UserAvatar/useI18nStore/UtilBadge/AssignedIssueCell/CompletionBar`만 — `SkillTags`/`UserSkillEditModal`/`Button`/`EditIcon`/`StatusBadge` **제거 확인**. 컬럼 7종(skills/action/available 없음). `canWrite`/`onEditSkills` props 제거. ✓
- 스킬편집 드로어 이관: `ResourceProfileDrawer.jsx:121-130` `canWrite && accountId` 게이트 → `UserSkillEditModal` 호스팅(`:139-143`). `ResourceOverviewTab.jsx:132` 드로어에 `canWrite` 전달, `editTarget` state·모달 제거. ✓
- `UserSkillEditModal.jsx:53-56` 저장 성공 시 `userSkills(accountId)`+`overview()`+`profile(accountId)` invalidate — 드로어/테이블 갱신. ✓
- t() 호출 키 ↔ 로케일 대조(전수): 신규 `col.assignedIssues`/`col.projectCount`/`col.completion`, `overview.issues.{todo,inProgress,done}`, `overview.completion.{none,tip}`, `overview.projectCount.tip` — 소스(`kr/en/resource.json`) + merge 산출물(`ko-KR.json:1649-1674`·`en-US.json` 동일) 전부 반영. 누락 0. ✓
- **제거 컬럼 키 보존**: `col.available`/`col.skills`/`col.action`/`available.*` merge 산출물에 유지(`ko-KR.json:1667-1669`) — availableOnly 필터·재사용처 회귀 없음. ✓

### P7. 성능 패턴 — 전 항목 준수
- 공통 워크로그/이슈 페처 미수정(신규 로직 `ResourceLoadFetcher.js` 격리). ✓
- `getResourceLoadSummaryService`: Jira all-status 배치 1회(50청크+p-limit3) + SQL 1회 `Promise.all`(`:279-282`) = **N+1 없음**. ✓
- `timetracking.timeSpentSeconds` Jira 자동 집계 소비(`:256`) — **워크로그 개별 페치 없음**. rollup(util) 재사용(신규 페치 없음). ✓
- asUser 전용(`:246`, `postJiraJson as:'user'`) — **asApp 미사용**. [[feedback-no-asapp]] 준수. ✓

### P8. 실행 검증
- 백엔드 `npm test`: **229 tests 전부 통과**(v1 223 + `isProjectClosed` 6케이스, `ResourceMatch.test.js:136-166`). "22 failed suites"는 **전부 `.claude/worktrees/RFC-168/` 노이즈**(비-worktree FAIL grep 결과 **공집합** 확인) → 리포 루트 14 suites 통과 판정. ✓
- 프론트 `CI=true npm test`: **8 suites / 74 tests 통과**(회귀 없음). ✓
- 프론트 `CI=true npm run build`: **Compiled with warnings** — 경고는 사전존재 3rd-party source-map(`@atlaskit/analytics-next-stable-react-context`, `marklassian`)뿐. Module not found/신규 파일발 에러 0. ✓

---

## 미검증 (NOT VERIFIED) — live Jira 필요

- **`updated >= "-26w"` 상대일자 JQL 실행**: forge tunnel/live Jira 접근 없어 정적 검증만. `LOAD_DONE_WINDOW='-26w'` 상수화(`ResourceLoadFetcher.js:26`)로 폴백 시 이 한 값만 절대일자 교체 가능한 구조는 확인. 실배포 1회 검증 권장(코디네이터 지시대로 미검증 분류).
- **`statusCategory.key` 런타임 값**: `new`/`indeterminate`/`done` 3종은 코드베이스 실측(GanttMapper 등) 근거이나 실 Jira 응답 확인은 배포 환경 필요. 커스텀 status라도 statusCategory는 3종 귀속(Jira 보장) 가정.
- **`timetracking.timeSpentSeconds` 자동집계 / `properties.movesRms.coworkers` 실형상**: 코드 경로·폴백(0/빈배열)은 정합. 실데이터 형상은 E2E 필요.

---

## 관찰 사항 (실패 아님, 정보성)

1. **드로어 `load.inProgressCount`(v1=In-Progress 목록 length) vs Overview 배치 `inProgressCount`(indeterminate 카운트)**: 둘 다 "In Progress 관여 건수"로 동일해야 정상이며 백엔드가 드로어엔 v1 단일 소스(목록 length)를 유지(설계 §3.4 확정). 정상 시 값 일치, 불일치 시 배치 신뢰가 설계 지침 — 현 구현은 의도된 결정. 경계면 버그 아님.
2. **`isProjectClosed` 함수 2종 공존**: 신규 export `ResourceMatch.isProjectClosed(endDate, today)`(date-only, jest 6케이스)와 서비스 로컬 `isProjectClosed({statusKey,statusName,endDate}, todayYmd)`(v1 복합, history `closed` 산출용, `Service:158`)가 별개. 로컬은 미export라 충돌 없음. 다만 **export 버전은 현재 프로덕션 미소비**(projectCount는 SQL `end_date` 필터로 처리, history는 로컬 복합 사용) → jest로만 검증되는 상태. 설계 §3.3이 "v1 history 판정 일원화는 선택"이라 미일원화는 이탈 아님. 정리 여부 선택.

---

## 종합 판정

**통과.** `getResourceLoadSummary` 확장 7필드·`getResourceProfile` load 확장 4필드가 생산자↔소비자 간 필드명·중첩·null 처리·미존재 기본값까지 완전 일치. In-Progress 페처 2종 불변으로 Match·드로어 진행중 목록 회귀 없음(호출부 grep 교차 확인). 신규 배치/SQL의 3분류 매핑·균등분할·완수율 상쇄·활성 필터·bulk 바인딩 전부 설계 §3.1~3.3 정합. 제거 컬럼 잔재 없고 i18n 신규 키 전수 merge 반영·제거 키 보존. 재작업 지시 없음. 잔여는 live Jira E2E(미검증 3건)로만 확정 가능(`-26w` 포함).
