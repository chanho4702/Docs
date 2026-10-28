# 작업 배정 (Work Assignment) — 프론트엔드 구현 리포트

- **일자**: 2026-07-22
- **브랜치**: RFC-160
- **입력**: `01_architect_design.md` §4/§7 + **`02_backend_report.md` §1(실제 shape) / §5(주의사항)**
- **검증**: `npm test` → **12 suites / 126 tests 전부 통과**(신규 25건) · `npm run build` → **Compiled with warnings**(신규 코드 유래 경고 0)

> 소비 경로는 전부 **`02_backend_report.md` §1 의 실제 shape**에 맞췄다. 설계서와 백엔드 리포트가 다른 곳(추가 필드)은 백엔드 리포트를 따랐다.

---

## 1. 신규 / 수정 파일

### 신규 — 소스
| 파일 | 역할 |
|---|---|
| `static/ui/src/utils/queryKey/assignmentKeys.js` | 쿼리키 팩토리 (`all` / `board(projectId)` / `pool(projectId)`) |
| `static/ui/src/pages/projectDetail/assignment/AssignmentPage.jsx` | 셸 — 좌우 2분할, 선택/필터/풀토글/드로어/확인모달 상태 소유 |
| `.../assignment/useWorkAssignmentBoard.js` | `getWorkAssignmentBoard` (staleTime 60s, **`refetchOnWindowFocus:false`**) |
| `.../assignment/useWorkAssignmentPool.js` | `getWorkAssignmentPool` (온디맨드, board.projectLoad 조인) |
| `.../assignment/useAssignWorkItem.js` | `assignWorkItem` useMutation + `setQueryData` 패치 (**invalidate 없음**) |
| `.../assignment/patchAssignmentCache.js` | **순수함수** — 캐시 델타 패치 (`buildAssignDelta` / `applyProjectDelta` / `patchAssignmentCache`) |
| `.../assignment/poolJoin.js` | **순수함수** — `joinPoolCandidates` / `mergeCandidates` / `toProjectLoadMap` |
| `.../assignment/queue/queueFilter.js` | **순수함수** — `QUEUE_FILTERS` / `matchQueueFilter` / `countByFilter` |
| `.../assignment/queue/WorkQueuePanel.jsx` | 좌측 큐 — 헤더 카운트 · 필터 · truncated 안내 · 리스트 |
| `.../assignment/queue/WorkQueueFilters.jsx` | 세그먼트 필터 (전체/미배정/마감임박/지연) |
| `.../assignment/queue/WorkQueueItem.jsx` | 큐 1건 카드 (이슈키·요약·flags·D-day·잔여MD·담당/협업자 아바타) |
| `.../assignment/candidate/CandidatePanel.jsx` | 우측 헤더 + 전사 풀 토글 + 마스킹/절단 안내 |
| `.../assignment/candidate/AssignmentCandidateTable.jsx` | 이중 스코프 8컬럼 테이블 (`CommonTable`) |
| `.../assignment/candidate/ScopeSplitCell.jsx` | "프로젝트 내 / 전사" 스코프 1칸 조립 |
| `.../assignment/candidate/GapSignalBadge.jsx` | `signals[]` → 배지 + 임계 수치 툴팁 |
| `.../assignment/candidate/AssignActionCell.jsx` | 담당자 지정/해제 · 협업자 추가/해제 버튼 (권한 게이트) |

### 신규 — 테스트 / i18n
| 파일 | 내용 |
|---|---|
| `.../assignment/__test__/patchAssignmentCache.test.js` | 20건 — 델타/큐/후보/projectLoad/불변성/poolJoin |
| `.../assignment/__test__/queueFilter.test.js` | 5건 — 필터 매칭/카운트/방어 |
| `locales/kr/assignment.json` · `locales/en/assignment.json` | 신규 네임스페이스 (각 **83 키**) |

### 수정 (2파일, 추가만)
| 파일 | 변경 |
|---|---|
| `static/ui/src/constants/tabs.js` | import 2줄(`PersonAddIcon`, `AssignmentPage`) + `projectUser.children` **끝에** `projectAssignment` 항목 추가. 기존 두 항목(`projectUserList` / `projectSalary`) 및 시그니처 무변경 |
| `locales/kr|en/projectDetail.json` | `tabs.assignment` 1키 추가 |

### 기존 공용 컴포넌트 — **수정 0건**
`ResourceProfileDrawer` / `UtilBadge` / `WorkloadCell` / `AssignedIssueCell` / `CompletionBar` / `SkillTags(SkillChip)` / `StatusBadge` / `InfoTip` / `CommonTable` / `UserAvatar` / `ConfirmModal` / `useJiraEditGuards` — 전부 **props 로만 조립**했고 파일 diff 0. (§5 참조)

---

## 2. 소비하는 응답 shape (verifier 교차 비교용)

### 2.1 `getWorkAssignmentBoard` → `res.content`
훅: `useWorkAssignmentBoard.js` — `res.success` 분기 후 `res.content` 반환, 아래 경로로 분해.

| content 경로 | 소비처 | 용도 |
|---|---|---|
| `meta.companyScopeVisible` | `AssignmentPage`(헤더), `CandidatePanel`(안내), `AssignmentCandidateTable`(전사 셀 locked / 신호 컬럼) | 전사 스코프 마스킹 |
| `meta.poolAvailable` | `AssignmentPage`(pool enabled), `CandidatePanel`(토글 노출) | 전사 풀 토글 |
| `meta.queueTruncated` / `meta.maxQueueItems` | `WorkQueuePanel` | `assignment.queue.truncated` 문구의 `{n}` |
| `meta.issueTruncated` / `meta.maxProjectIssues` | `WorkQueuePanel` | `assignment.queue.issueTruncated` 의 `{n}` |
| `meta.snapshotAggregatedAt` | `AssignmentPage` 헤더, `ScopeSplitCell`(project util 툴팁) | 스냅샷 집계 시각(null → `meta.noAggregate`) |
| `meta.rollupAggregatedAt` | `AssignmentPage` 헤더 | 전사 집계 시각(companyScopeVisible 일 때만) |
| `meta.thresholds.externalLoadRatio` / `.projectFocusRatio` | `GapSignalBadge` | 배지 툴팁의 `{ratio}%` |
| `queue[]` | `WorkQueuePanel` → `WorkQueueItem` | 큐 렌더 |
| `queue[].issueId` / `issueKey` | 선택 상태 키 / mutation payload / 캐시 패치 매칭 | — |
| `queue[].summary`, `issueTypeIconUrl`, `issueTypeName`, `statusName` | `WorkQueueItem` | 표기 |
| `queue[].flags[]` | `queueFilter`, `WorkQueueItem` 배지, `patchAssignmentCache`(빈 배열 → 큐 제거) | — |
| `queue[].dDay` | `WorkQueueItem.ddayLabel` | `D-{n}` / `D+{n}` / `D-DAY` / 기한없음 |
| `queue[].remainingEstimateSeconds` | `WorkQueueItem` | 잔여 MD (hourRate 환산) |
| `queue[].assignee?.accountId/displayName/avatarUrls['24x24']` | `WorkQueueItem`, `AssignActionCell`(현재 담당 판정) | **옵셔널 체이닝** |
| `queue[].coworkers[].accountId/displayName/avatarUrls` | `WorkQueueItem`, `AssignActionCell`, `AssignmentPage`(전체 교체 배열 조립) | — |
| `projectLoad[]` (`accountId` + 7수치) | `useWorkAssignmentPool`(조인), `patchAssignmentCache` | pool 후보 project 덮어쓰기 |
| `candidates[]` | `AssignmentCandidateTable` | 행 렌더 |
| `candidates[].displayName / avatarUrls / roleName / levelName / isMember` | 1·2 컬럼 | `isMember===false` → "외부" 칩 |
| `candidates[].score / matchedCount / requiredCount` | 3 컬럼(적합도) | — |
| `candidates[].matchedSkills[] / missingSkills[]` (`{id,name}`) | 7 컬럼 | `SkillChip` matched/missing |
| `candidates[].project.{todoCount,inProgressCount,doneCount,spentSeconds,remainingSeconds,completionRate,util}` | 4 컬럼 `ScopeSplitCell(variant='project')` | `util==null` → **'-' 폴백** |
| `candidates[].company` (**null 가능**) | 5 컬럼 | `null` → `assignment.scope.companyLocked` 문구, 신호 컬럼 '-' |
| `candidates[].company.{util,utilBand,projectCount,todoCount,inProgressCount,doneCount,spentSeconds,remainingSeconds,completionRate}` | `ScopeSplitCell(variant='company')` → `UtilBadge`/`AssignedIssueCell`/`WorkloadCell` | 전부 옵셔널 체이닝 |
| `candidates[].signals[]` | `GapSignalBadge` | 서버 판정 그대로(프론트 재계산 없음) |
| `projectName`, `generatedAt`, `requiredSkills`, `meta.bands`, `loadSplitRatio` | **미사용** | 훅에서 노출은 하되 화면에서 안 씀(스킬 커버리지는 candidate 안에 이미 있음, bands 는 서버가 utilBand 로 확정) |

### 2.2 `getWorkAssignmentPool` → `res.content`
훅: `useWorkAssignmentPool.js`

| 경로 | 소비처 |
|---|---|
| `candidates[]` | `joinPoolCandidates(candidates, board.projectLoad)` → `mergeCandidates(board.candidates, pool)` → 테이블 |
| `truncated` / `maxPoolAccounts` / `totalPoolSize` | `CandidatePanel` — `assignment.candidate.poolTruncated` (`{n}` / `{total}`) |
| `projectId`, `generatedAt` | 미사용 |

- 조인은 `project.*` **수치 7필드만** 덮어쓴다. `signals` / `loadSplitRatio` 는 서버 값 유지(규칙 이원화 방지).
- 호출은 `poolOpen && meta.poolAvailable === true` 일 때만(`enabled`).

### 2.3 `assignWorkItem` → `res.content` (AssignResult)
훅: `useAssignWorkItem.js` → `patchAssignmentCache.js`

**보내는 payload**: `{ projectId, issueId, issueKey, [assigneeAccountId], [coworkerAccountIds] }`
- `projectId` **항상 포함**(훅이 주입 — 호출부가 빠뜨릴 수 없다).
- `issueId` + `issueKey` **둘 다** 전송.
- `assigneeAccountId`: **키 존재 여부**로 미변경/해제를 구분(`'assigneeAccountId' in vars`). 담당 해제는 `null` 명시 전송, 협업자만 바꿀 때는 **키 자체를 넣지 않음**.
- `coworkerAccountIds`: **전체 교체**. 추가 = `[...new Set([...현재 coworkers, 신규])]`, 해제 = `현재.filter(id => id !== 대상)`.

**읽는 경로**:

| 경로 | 용도 |
|---|---|
| `content.issueId` / `issueKey` | 큐 항목 매칭(둘 중 하나라도 맞으면 매칭) |
| `content.item` | 큐 항목 교체값 (`flags.length===0` 이면 큐에서 제거) |
| `content.item.assignee?.accountId`, `item.coworkers[].accountId` | 배정 후 참여자 집합 |
| `content.item.participantCount`, `item.remainingEstimateSeconds`, **`item.timeSpentSeconds`** | 배정 후 1인 몫 |
| `content.item.statusCategoryKey` | 상태 카운트 +1 |
| `content.previous.assigneeAccountId`, `previous.coworkerAccountIds` | 배정 전 참여자 집합 |
| `content.previous.participantCount`, `previous.remainingEstimateSeconds`, **`previous.spentSeconds`** | 배정 전 1인 몫(차감) |
| `content.previous.statusCategoryKey` | 상태 카운트 -1 |
| `content.applied` | 미사용(성공 토스트는 단일 문구) |

> **이름 차이 준수**: `previous.spentSeconds` ↔ `item.timeSpentSeconds`. `buildAssignDelta` 가 각각 다른 필드에서 읽는 것을 전용 유닛테스트로 고정했다.

### 2.4 에러 소비
- 실패 시 `res.error.code` 를 `Error.code` 로 승격해 throw.
- `ASSIGNMENT_NO_CHANGE` → 조용히 무시(토스트 없음). `403`(Jira `ForgeAPIError`) → `assignment.toast.jiraPermission.assign`. 그 외 → `assignment.toast.assign.error`.
- board/pool 부분 성공(Jira 패스 실패 → `queue:[]`)은 **에러가 아니라 빈 큐**로 표시된다(훅이 success:true 를 정상 처리).

---

## 3. 인덱스 지연 대응 (필수 규약 준수 근거)

- `assignmentKeys.*` 에 대한 **`invalidateQueries` 호출 0건** (grep 확인 — 주석에만 등장).
- 배정 성공 시 `queryClient.setQueryData(assignmentKeys.board(projectId), prev => patchAssignmentCache(prev, result))` 만 실행.
- board / pool **둘 다 `refetchOnWindowFocus:false`**.
- pool 캐시는 별도 패치가 필요 없다 — pool 후보의 `project.*` 는 렌더 시점에 `board.projectLoad` 로 조인되므로 board 패치가 그대로 반영된다.
- `patchAssignmentCache` 는 `company` / `signals` / `loadSplitRatio` / `util` 을 **건드리지 않는다**(전사 값은 배치 산출물 — 다음 자연 재조회에서 정합).

---

## 4. 권한 게이트 구현 (설계서 §4.6)

| 대상 | 구현 |
|---|---|
| 탭 진입 | `canRender` 미지정(프로젝트 상세 진입 자체가 `PROJECT` read) |
| 전사 스코프 컬럼 | `meta.companyScopeVisible === false` → 5 컬럼에 `assignment.scope.companyLocked`, 6 컬럼(신호) '-' + 상단 SectionMessage |
| 전사 인력 풀 토글 | `meta.poolAvailable === true` 일 때만 렌더 + 쿼리 `enabled` |
| 담당자 write 버튼 | `canWrite('PROJECT')` **AND** `useJiraProjectPermissions(projectKeyOfIssue(issueKey)).canAssignIssues !== false` (null=미확인은 허용) → 미충족 시 disabled + Tooltip 사유 |
| 협업자 write 버튼 | `canWrite('PROJECT')` (§6-3 참조) |
| 후보 로우 클릭 → 드로어 | `canRead('RESOURCE_MANAGEMENT')` 가 false 면 **`onClick` 자체를 붙이지 않고** 상단에 `assignment.drawer.locked` 안내. `useResourceProfile` / `getResourceProfile` 은 무수정 |
| 드로어 내 스킬 편집 | `canWrite('RESOURCE_MANAGEMENT')` 를 그대로 전달(드로어 기존 계약) |

---

## 5. 기존 공용 컴포넌트 수정 여부

**수정한 공용 컴포넌트 없음.** 전부 props 조립으로 해결했다.

| 자산 | 재사용 방식 |
|---|---|
| `UtilBadge` | `ScopeSplitCell(variant='company')` 에서 `{util, utilBand}` 전달. `util==null` → 컴포넌트 내부가 이미 `resource.util.none` 처리 |
| `AssignedIssueCell` | `{todo,inProgress,done}` — 프로젝트/전사 **양쪽에 각각** 1회씩 |
| `WorkloadCell` | `{spentSeconds,remainingSeconds,completionRate,hourRate}` — `completionRate==null` 시 내부에서 '-' |
| `CompletionBar` | **미사용** — `WorkloadCell` 이 진행도 바를 이미 포함해 중복 표기가 되어 쓰지 않았다(설계서는 "완수율만 좁게 보일 때" 조건부 재사용) |
| `SkillChip` | matched/missing tone 그대로 |
| `StatusBadge` | flags/신호/적합도/외부 칩 |
| `InfoTip` | 컬럼 헤더 3곳(`interp` 만 사용) |
| `CommonTable` | head/rows/rowsPerPage/emptyMessage |
| `UserAvatar` | 후보 1컬럼. 큐 카드의 소형 아바타는 `@atlaskit/avatar` 의 `Avatar`(xsmall)를 직접 사용 — `UserAvatar` 는 `AvatarItem`(이름 텍스트 포함) 이라 카드 안 겹침 표기에 부적합 |
| `ResourceProfileDrawer` | `{isOpen, accountId, fallbackPerson, canWrite, onClose}` 기존 시그니처 그대로. 후보 객체가 `displayName/avatarUrls/roleName/levelName` 을 갖고 있어 `fallbackPerson` 계약과 일치 |
| `ConfirmModal` | `appearance` 를 액션별로 전달(지정/추가 = `warning`, 해제 = `danger`). 컴포넌트 무수정 |
| `useJiraProjectPermissions` / `projectKeyOfIssue` | 모듈 TTL 캐시 그대로 사용 |
| `CandidateRankTable` / `useProjectSkillMatch` | 설계대로 **재사용 안 함**(단일 스코프 전용 / coverage 는 board 응답에 이미 포함) |
| `executeRequest('assignIssue')` | **사용 안 함** — 배정은 `assignWorkItem` 단일 경로 |

`hourRate` 는 기존 화면들과 **동일한 공유 캐시 키** `['getSettingData']` 를 그대로 사용했다(신규 키를 만들면 같은 데이터를 두 번 받게 된다). 신규 팩토리 대상이 아닌 **기존 관행 키의 재사용**이다.

---

## 6. i18n

- 신규 `locales/kr/assignment.json` / `locales/en/assignment.json` — **각 83 키**(kr/en 완전 대칭).
- `locales/kr|en/projectDetail.json` 에 `tabs.assignment` 1키 추가.
- **`npm run merge` 실행 완료** → `ko-KR.json` / `en-US.json` 에 `assignment` 네임스페이스 + `projectDetail.tabs.assignment` 반영 확인. (`ko-KR.json`/`en-US.json` 직접 수정 없음. `npm run build` 의 prebuild 가 merge 를 한 번 더 실행)
- 코드에서 사용하는 `assignment.*` 키 **77개(동적 키 확장 포함)를 스크립트로 전수 대조** — kr/en 양쪽 누락 0.
- 치환은 전부 `tFormat(t, key, vars)` (Forge `t()` 는 보간을 지원하지 않음).

**설계서 §7.1 대비 키 구조 변경 1건**
`signal.EXTERNAL_OVERLOAD` 와 `signal.EXTERNAL_OVERLOAD.tip` 은 **같은 경로가 문자열이자 객체**가 되어 JSON 으로 표현할 수 없다. → `signal.label.{SIGNAL}` / `signal.tip.{SIGNAL}` 로 분리했다(값은 설계서 문구 그대로).

---

## 7. 검증 결과

### `cd static/ui && npm test`
```
Test Suites: 12 passed, 12 total
Tests:       126 passed, 126 total
```
신규 25건:
- `patchAssignmentCache.test.js` **20건** — `previous.spentSeconds`↔`item.timeSpentSeconds` 분리, participantCount 0 clamp, 신규/이탈/계속 참여자 델타, 상태 카운트 이동, 음수 방지, completionRate 분모 0 → null, 큐 교체/제거/미존재, board·item 누락 방어, company/signals 불변(참조 동일), projectLoad 신규 행 추가, 원본 불변성, poolJoin 4종
- `queueFilter.test.js` **5건** — 필터 매칭/알 수 없는 키/flags 누락/카운트/빈 입력

### `cd static/ui && npm run build`
```
Compiled with warnings.
```
경고는 **전부 기존 node_modules 소스맵 경고 3건**(`@atlaskit/analytics-next-stable-react-context` ×2, `marklassian` ×1)뿐이다. **신규 코드 유래 경고(미사용 변수·훅 의존성 등) 0건.** 빌드 산출물 정상 생성.

---

## 8. 설계서와 달라진 점

| # | 설계 | 실제 | 이유 |
|---|---|---|---|
| 1 | `assignment/queueFlags.js` — `computeQueueFlags` 프론트 미러 (F5) | **구현하지 않음** | 백엔드가 `AssignResult.item.flags` 를 **재계산해서** 내려준다(02_backend_report §1.3). 프론트가 같은 규칙을 다시 구현하면 임계값(`dueSoonDays`)·타임존 처리가 서버와 이원화될 뿐 소비처가 없다(죽은 코드). 대신 필터 매칭만 순수 모듈 `queue/queueFilter.js` 로 분리해 테스트했다 |
| 2 | i18n `signal.{S}` + `signal.{S}.tip` | `signal.label.{S}` + `signal.tip.{S}` | 같은 JSON 경로가 문자열이자 객체가 될 수 없음(§6) |
| 3 | 배정 버튼 게이트 = `canWrite('PROJECT')` AND `canAssignIssues !== false` (둘 다) | **담당자 버튼만** Jira 권한 게이트 적용, **협업자 버튼은 `canWrite('PROJECT')` 만** | 협업자 write 는 이슈 **프로퍼티** write(`mergeIssueProperty`, `as:'app'`)라 Jira `ASSIGN_ISSUES` 와 무관하다. 동일 게이트를 걸면 정당한 사용자를 과잉 차단한다 |
| 4 | 컬럼 5 = `UtilBadge` + `AssignedIssueCell` + `WorkloadCell`, 컬럼 4 = `AssignedIssueCell` + `WorkloadCell` | 동일하되 컬럼 4 에 **프로젝트 가동률 텍스트 + 출처 툴팁** 1줄 추가 | `project.util` 은 대개 null 이라 '-' 폴백과 "일 배치 스냅샷" 출처를 화면에 명시해야 오해가 없다(설계 §5-1-C 요구) |
| 5 | `CompletionBar` 재사용 | 미사용 | `WorkloadCell` 이 완수율 바를 이미 포함 — 같은 셀에 두 번 그리게 된다 |
| 6 | (미규정) | 큐가 비어 있지 않은데 선택이 없으면 **첫 항목 자동 선택** | 배정 완료로 선택 항목이 큐에서 빠졌을 때 우측이 빈 컨텍스트로 남지 않게 한다 |
| 7 | (미규정) | pool/board 응답의 `truncated` 계열을 SectionMessage 로 노출 | 백엔드가 추가한 additive 필드(`maxQueueItems` / `maxProjectIssues` / `maxPoolAccounts` / `totalPoolSize`)를 문구의 `{n}` 에 사용 — 상수 하드코딩 회피 |

**계약 위반 없음.** 백엔드 리포트 §1 의 모든 필드를 같은 이름·같은 옵셔널리티로 소비했고, 추측한 경로는 없다.

---

## 9. 남은 확인 사항 (E2E 미수행)

1. **실배포 검증 필요** — `assignWorkItem` 의 Jira write(assignee PUT `as:'user'`, coworker 프로퍼티 `as:'app'`) 후 캐시 패치가 화면에 즉시 반영되는지(로컬 테스트는 순수함수 단위까지만).
2. `meta.snapshotAggregatedAt` 은 드라이버 문자열일 수 있어 `new Date(...).toLocaleString()` 이 `Invalid Date` 를 낼 가능성 — 실데이터 확인 시 포맷터 보정 필요.
3. 전사 풀 토글 시 `getWorkAssignmentPool` 이 최대 300명 × Jira 배치를 도므로 체감 지연 확인 필요(스피너는 토글 옆에 표시).

---

## 10. 검증 리포트 후속 보완 (2026-07-23)

`03_verify_report.md` 의 개선 권고 3건(C-경고-4 / C-경고-5 / C-경고-2)을 반영했다. **경계면(응답 shape 소비 경로)은 한 글자도 바꾸지 않았고, 기존 공용 컴포넌트 수정도 여전히 0건**이다.

### 10.1 (C-경고-5) `completionRate == null` 후보의 작업량이 사라지던 문제 — 폴백 추가

**문제**: `ScopeSplitCell` → `WorkloadCell` 경로에서 `completionRate == null` 이면 `WorkloadCell`(`:30-32`)이 spent/remaining 을 렌더하지 않고 `'-'` 만 표시했다. 이 화면에서 "남은 작업량"은 배정 판단의 핵심 지표라 방치할 수 없다.

**조치** — `candidate/ScopeSplitCell.jsx` 에 폴백 렌더러 `WorkloadFallback` 추가(로컬 컴포넌트).
- **`WorkloadCell.jsx` 원본은 무수정**(`/resource` 인력 풀 · 마이페이지 회귀 위험 — verifier C-7 판정 유지). 호출부에서 분기만 한다.
  ```jsx
  {scope.completionRate == null
      ? <WorkloadFallback scope={scope} hourRate={hourRate} />
      : <WorkloadCell ... />}
  ```
- 폴백은 **진행도 바 없이 수치만** 보여준다. 하단 수치 라인은 `WorkloadCell` 과 **동일 포맷·동일 MD 환산식**(`sec/(hourRate*3600)`, 소수 1자리)이라 컬럼 정렬이 흐트러지지 않는다.
- 라벨은 기존 키 `resource.overview.workload.spent|remaining|total` 을 그대로 재사용(신규 키 불필요).

**"작업량 0" 과 "추정치 미입력" 구분** (권고사항 반영)

| 조건 | 배지 | 톤 | 툴팁 |
|---|---|---|---|
| `assignedCount > 0` | `assignment.workload.noEstimate` (추정 미입력) | warning | `noEstimateTip` — "관여 작업 {n}건이 있지만 원본/잔여 추정이 입력되지 않아…" |
| `assignedCount === 0` | `assignment.workload.noWork` (할당 작업 없음) | neutral | `noWorkTip` |

> 백엔드 계약상 `completionRate` 는 `spent+remaining === 0` 일 때만 null 이므로(02_backend_report §1.1), 두 상태의 판별자는 **`assignedCount`** 다. 관여 이슈는 있는데 작업량이 0 → 추정치 미입력. 방어적으로 spent/remaining 수치 자체도 항상 함께 출력한다.

### 10.2 (C-경고-4) `assignment.drawer.locked` 상시 노출 → 아이콘 + 툴팁

`candidate/AssignmentCandidateTable.jsx` — `canReadResource === false` 일 때 테이블 상단에 같은 문구를 텍스트로 깔던 것을, **우측 정렬 자물쇠 아이콘 1개 + 툴팁**으로 축약했다(`@atlaskit/icon/core/lock-locked`, `size="small"`, `color="currentColor"`).
- 표시 텍스트와 툴팁 내용이 같아 툴팁이 무의미하던 문제 해소.
- 아이콘 `label` 에 동일 문구를 넣어 스크린리더 접근성은 유지.
- **로우 클릭 게이팅 로직 자체는 무변경** — `canReadResource` 가 false 면 `onClick` 을 붙이지 않는 방식 그대로.

### 10.3 (C-경고-2) 미사용 로케일 키 정리

10.1 에서 실제로 쓰게 되는 키가 없음을 먼저 확인한 뒤(6개 전부 코드 참조 0건 grep 확인) 제거했다.

| 제거 | 사유 |
|---|---|
| `tab.label` | 탭 라벨은 `projectDetail.tabs.assignment` 사용 — 중복 |
| `candidate.poolLoading` | 로딩은 토글 옆 Spinner 로 표기 |
| `scope.member` | "외부" 칩만 표기하므로 반대 라벨 불필요 |
| `scope.companyUtil` | 전사 가동률 라벨은 `UtilBadge` 가 자체 표기 |
| `signal.none` | 신호 없음은 '-' 리터럴 |
| `action.currentAssignee` | 버튼 라벨이 상태에 따라 전환돼 별도 라벨 불필요 |

| 추가 | 용도 |
|---|---|
| `workload.noEstimate` / `noEstimateTip` / `noWork` / `noWorkTip` | 10.1 폴백 |

- 결과: `locales/kr|en/assignment.json` **각 81키**(83 − 6 + 4), kr/en **키 집합 완전 일치**.
- **`npm run merge` 재실행 완료** → `ko-KR.json` / `en-US.json` 반영 확인.
- 스크립트 재대조: 코드 사용 키(동적 확장 포함) **87키 전수 존재, 누락 0** / **사장 키 0건**.

### 10.4 재검증 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **12 suites / 126 tests 전부 통과** (기존과 동일 — 폴백/아이콘은 렌더 계층이라 순수함수 테스트에 영향 없음) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 경고는 기존 node_modules 소스맵 3건뿐, **신규 코드 유래 경고 0** |
| 공용 컴포넌트 diff | `WorkloadCell` / `CompletionBar` / `UtilBadge` / `AssignedIssueCell` / `SkillTags` / `StatusBadge` / `InfoTip` / `CommonTable` / `UserAvatar` / `ConfirmModal` / `ResourceProfileDrawer` / `useJiraEditGuards` — **전부 변경 0건**(`git status` 확인) |

**수정 파일(보완분)**: `candidate/ScopeSplitCell.jsx`, `candidate/AssignmentCandidateTable.jsx`, `locales/kr|en/assignment.json` (+ merge 산출물).

### 10.5 미조치 항목과 사유

| 권고 | 조치 여부 | 사유 |
|---|---|---|
| C-경고-1 `jest.config.js` 에 `modulePathIgnorePatterns` 추가 | **미조치** | 루트(백엔드) jest 설정이라 프론트 범위 밖. 백엔드/리더 판단 영역 |
| C-경고-6 커밋 분리 (`tabs.js` hunk 분리 등) | **미조치** | 커밋은 리더 권한. 이 기능의 `tabs.js` 변경분은 **import 2줄 + `projectUser.children` 마지막 항목 1블록**으로 국소화되어 있어 hunk 분리가 가능하다 |
| 알려진 한계 4 (`issueScanned === 0 && candidates.length > 0` 감지 UI) | **미조치** | 백엔드 리포트 §5.4의 **선택** 권고. 부분 실패를 "빈 큐"로 보여주는 현재 동작이 설계 §3.4 정책 범위 내이고, 오탐(이슈가 정말 0건인 신규 프로젝트) 시 잘못된 경고를 띄우게 된다 |

---

## 11. 폴백 오표기 버그 수정 (2026-07-23)

§10.1 폴백에서 **스코프 필드 집합 차이를 놓친 실제 버그**가 있었다. 리더 지적대로 수정하고 회귀 테스트로 고정했다.

### 11.1 버그 — company 스코프가 항상 "할당 작업 없음" 으로 표기됨

`ScopeSplitCell.jsx` 의 폴백 판별이 `scope?.assignedCount ?? 0` 이었다. 그런데 `ScopeSplitCell` 은 **project / company 양쪽**에서 쓰이고, 백엔드 조립부(`WorkAssignmentService.js:160-186`) 기준 두 객체의 필드 집합이 다르다.

| | 필드 |
|---|---|
| 공통 | `util`, `todoCount`, `inProgressCount`, `doneCount`, `spentSeconds`, `remainingSeconds`, `completionRate` |
| **project 만** | `assignedCount`, `utilSource` |
| **company 만** | `utilBand`, `projectCount` |

→ company 는 `assignedCount` 자체가 없어 항상 `0` 으로 떨어지고, `completionRate == null` 인 경우 **"전사 할당 작업 없음"(neutral)** 으로 표기됐다.
실제로는 `todoCount`/`inProgressCount`/`doneCount` 가 양수인데 추정치만 없는 인원이 여기 걸린다 — **전사에서 작업을 잔뜩 들고 있는 사람이 "여유 있음"으로 보여 과부하 인원에게 배정하게 되는**, 이 화면이 막으려던 실패 모드 그 자체였다.

### 11.2 수정 — 판별을 순수 모듈로 분리하고 세 카운트 합으로 통일

**신규** `candidate/workloadState.js` (순수 모듈, IO/React 의존 0)

```js
export const countAssignedIssues = (scope) => {
    const sum = (scope?.todoCount ?? 0) + (scope?.inProgressCount ?? 0) + (scope?.doneCount ?? 0);
    const explicit = scope?.assignedCount;
    return Number.isFinite(explicit) ? Math.max(explicit, sum) : sum;
};
export const resolveWorkloadState = (scope) => ({ assignedCount, hasWork, tone, labelKey, tipKey });
```

- 계약상 project 의 `assignedCount` 정의가 `todo+inProgress+done` 과 동일하므로(설계서 §2.1 `ProjectLoadRow`) **합산 판별이 두 스코프 모두에서 정확**하다.
- 리더 제시안(`?? 합계`)에서 한 가지만 강화했다: `assignedCount` 가 **숫자로 존재하면 합계와의 `Math.max`** 를 쓴다. 두 값은 계약상 같지만 `patchAssignmentCache` 델타 패치에서 `statusCategoryKey` 가 null 인 이슈는 `assignedCount` 만 증감하고 상태 카운트는 그대로라 일시적으로 어긋날 수 있다. 이 화면에서 안전한 방향은 **작업을 과소 보고하지 않는 쪽**이라 max 를 택했다(company 는 필드가 없으므로 합계 폴백 — 지시한 동작과 동일).
- 컴포넌트는 판별 결과의 **i18n 키(`labelKey`/`tipKey`)와 톤(`tone`)** 을 받아 `t()` 에 넣기만 한다. 판별 로직이 JSX 밖으로 나와 테스트 가능해졌다.
- **백엔드 계약 무변경** — 프론트에서만 해결했다.

### 11.3 회귀 테스트 (`__test__/workloadState.test.js`, 신규 10건)

핵심 케이스(리더 요청):
```
assignedCount 없음 + todoCount:3 + inProgressCount:2 + completionRate:null (company)
  → assignedCount === 5, hasWork === true, tone === 'warning',
    labelKey === 'assignment.workload.noEstimate'
```
- 픽스처는 백엔드 조립부의 **필드 집합을 그대로 재현**했고, `expect(scope.assignedCount).toBeUndefined()` 로 픽스처 자체가 계약과 같은지도 검증한다(픽스처가 낡으면 테스트가 먼저 깨진다).
- 그 외: `doneCount` 만 양수인 company, 전 카운트 0(neutral), project 정상 케이스, **양방향 드리프트**(assignedCount 만 0 / 카운트만 0), null·undefined·빈 객체, `assignedCount` 가 문자열·NaN 일 때 합계 폴백.

### 11.4 같은 종류의 실수 전수 점검 — **추가 발견 0건**

`assignment/` 전역에서 project 전용(`assignedCount`, `utilSource`) / company 전용(`utilBand`, `projectCount`) 필드 참조를 전부 grep 해 대조했다.

| 참조 지점 | 읽는 대상 | 판정 |
|---|---|---|
| `patchAssignmentCache.js:41,105,112,119` (`assignedCount`) | `emptyProjectScope` / `applyProjectDelta` — 적용 대상은 `c.project` 와 `projectLoad[]` **뿐** | 정상 (company 미적용은 기존 테스트 "company 참조 동일" 로 고정됨) |
| `poolJoin.js:15` (`LOAD_FIELDS.assignedCount`) | `joinPoolCandidates` 가 `c.project` 만 재조립(`{...c, project}`) | 정상 |
| `AssignmentCandidateTable.jsx:128-129` (`utilBand`/`projectCount`) | `c.company?.…` — company 객체에서만 | 정상 |
| `GapSignalBadge.jsx:33` (`projectCount`) | `company?.projectCount`(prop = `c.company`) | 정상 |
| `snapshotAt` (project 전용 meta) | company 셀에는 **미전달**(`AssignmentCandidateTable`) | 정상 |
| `utilSource` | 코드에서 읽는 곳 **없음** | 해당 없음 |

**부가 하드닝 2건**
1. `ScopeSplitCell` 의 `UtilBadge` 에 `utilBand={utilBand ?? scope.utilBand ?? 'unknown'}` — prop 누락 시 company 객체에서 방어적으로 읽는다(company variant 에서만 실행).
2. `ScopeSplitCell` 상단 docblock과 `workloadState.js` 에 **두 스코프의 필드 집합 표를 명시**해 동일 실수를 구조적으로 차단했다.

### 11.5 재검증

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **13 suites / 136 tests 전부 통과** (assignment 신규 3 suites / 35건 — 기존 25 + workloadState 10) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, 신규 코드 유래 경고 0 |
| 공용 컴포넌트 diff | 여전히 **0건**(`WorkloadCell` 포함 무수정) |
| i18n | 키 변경 없음(§10.3 의 `workload.*` 4키를 그대로 사용) → merge 재실행 불필요 |

**수정/신규 파일(11절)**: `candidate/workloadState.js`(신규), `__test__/workloadState.test.js`(신규), `candidate/ScopeSplitCell.jsx`(판별 이관 + 필드 맵 주석 + utilBand 방어).

---

## 12. UX 개선 — 카드 레이아웃 · 높이 동기화 · 검색 필터 (2026-07-23)

사용자 피드백 반영. **로직·경계면은 무변경**(invoke 경로/캐시 패치/권한 게이트 전부 그대로), 레이아웃과 필터만 손봤다.

### 12.1 좌우 카드 분리 — 기존 `components/card/Card` 재사용

신규 카드 스타일을 만들지 않고 **프로젝트 표준 카드**(`static/ui/src/components/card/Card.jsx`)를 그대로 썼다.
- Atlaskit 토큰 기반(`elevation.surface`, `color.border`, `border.radius.200`, `elevation.shadow.raised`, `space.300`)이라 **다크모드 대응이 자동**이다.
- `useColorMode` 는 **쓰지 않았다.** 그 훅은 ECharts처럼 캔버스에 색을 직접 넣어야 하는 곳(`ChartBox`, `PortfolioScheduleGantt` 등)에서 쓰는 것이고, CSS 토큰으로 그리는 이 화면은 토큰이 알아서 전환된다. 신규 코드의 색은 전부 `token()` 또는 `var(--ds-*)` 폴백 형태다.
- 카드 헤더 = **제목 + 건수**(`title` prop 에 노드로), 헤더 우측 = **검색 입력(+ 전사 풀 토글)**(`headerRight`).
  - 좌: `배정 대상 작업 12건` / 우: `후보 인력 8명`(신규 키 `candidate.count`)
- 우측 카드는 `description` 슬롯에 **선택 작업 컨텍스트**(`DWEB-12 배정 후보` + 요약)를 넣어 스크롤과 무관하게 항상 보이게 했다.

### 12.2 높이 동기화 — **뷰포트 비례값(78vh) + minHeight 하한**

```js
const PANEL_HEIGHT = '78vh';
const PANEL_MIN_HEIGHT = 480;
// 컨테이너: display:flex, alignItems:'stretch', height:PANEL_HEIGHT, minHeight:PANEL_MIN_HEIGHT, overflow:'hidden'
```

**왜 vh 인가 (Forge iframe 검증)**: 같은 iframe 안의 `IssueAnalysisPage.jsx:44` 와 `ResourceAnalysisPage.jsx:241` 이 이미 `height:'85vh'` 좌우 2분할을 운영 중이고, `ProjectTreeView`(`80vh`)·`ProjectKanbanBoard`(`90vh`)·`WorklogPage`(`85vh`)도 같은 방식이다. → Forge iframe 에서 `vh` 가 정상 동작함이 **코드베이스로 검증된 사실**이라 하드코딩 620 을 이걸로 대체했다.

**왜 `calc(100vh - Npx)` 가 아닌가**: 그 형태는 상단 크롬(글로벌 헤더 + 프로젝트 상세 탭 2단 + 페이지 헤더) 높이를 **상수로 가정**해야 한다. 탭 줄바꿈·권한별 탭 개수·번역 길이에 따라 그 높이가 달라져서 잘못 빼면 화면이 잘리거나 남는다. 비례값(78vh)은 그 가정을 없애고, 작은 화면에서 카드가 뭉개지는 것은 `minHeight:480` 하한이 막는다.

**스크롤 구조** (`alignItems:'stretch'` 로 두 카드 높이 동일)
```
카드(height:100%, overflow:hidden)
 ├ 헤더(제목+건수 / 검색·토글)   ← 고정
 ├ description(선택 작업 컨텍스트) ← 고정 (우측 카드)
 ├ hr
 └ 본문(overflow:auto)          ← 여기만 스크롤
      └ 필터 바 position:sticky top:0  ← 스크롤 중에도 상단 고정(좌측 카드)
```
`Card` 의 본문 Box 가 이미 `flex:1 1 auto; minHeight:0; overflow:auto` 라 **공용 컴포넌트 수정 없이** 그대로 성립한다. 좌측 필터 바만 sticky 를 얹었고 배경은 `token('elevation.surface')` 라 다크모드에서도 뒤 내용이 비쳐 보이지 않는다.

### 12.3 검색 필터

| | 대상 필드 | 순수 모듈 |
|---|---|---|
| 좌측 큐 | `issueKey`, `summary` | `queue/queueFilter.js` 에 통합(`matchQueueSearch` / `filterQueue`) |
| 우측 후보 | `displayName`, `roleName`, `levelName` | **신규** `candidate/candidateFilter.js` |
| 공통 정규화 | — | **신규** `searchText.js` (`normalizeSearch` / `includesNormalized` / `matchesAnyField`) |

- 규칙: **대소문자 무시 · trim · 빈 문자열이면 필터 없음**. 좌측은 플래그 필터와 **AND** 결합.
- **세그먼트 카운트도 검색 결과 안에서 센다** — 숫자와 실제 목록이 어긋나면 필터를 신뢰할 수 없다.
- 우측 검색에서 **스킬명은 제외**했다. 적합도(coverage)는 서버 랭킹과 '적합도' 컬럼이 이미 담당하고, 스킬까지 넣으면 "이름 검색" 결과가 직관과 어긋난다(테스트로 고정).
- 빈 상태 문구를 분기했다: 검색 중이면 `assignment.search.empty`("검색 결과가 없습니다"), 아니면 기존 `queue.empty` / `candidate.empty`.
- 입력 UI 는 신규 `SearchInput.jsx`(Atlaskit `Textfield isCompact` + 돋보기 아이콘) — 좌/우 공용.

**기본 필터 `'all'` → `'unassigned'`**
`queueFilter.js` 에 `DEFAULT_QUEUE_FILTER = 'unassigned'` 를 두고 `AssignmentPage` 의 `useState` 초깃값과 `filterQueue` 기본값이 **같은 상수 하나**를 보게 했다. 관련 주석·테스트도 갱신(`DEFAULT_QUEUE_FILTER` 값 자체를 검증하는 케이스 추가).
부수 효과 하나를 함께 고쳤다 — **자동 선택이 이제 "보이는 목록"의 첫 항목**을 고른다(전에는 필터 무관 `queue[0]` 이라, 기본이 미배정이 되면 화면에 없는 항목이 선택될 수 있었다). 선택 자체는 필터가 바뀌어도 유지된다(우측 컨텍스트가 사라지면 안 되므로).

**페이지네이션 리셋**
`DynamicTable` 은 현재 페이지를 내부 state 로 들고 있고 `CommonTable` 은 `page` 를 전달하지 않는다(공용 컴포넌트 수정 금지) → **`key` remount** 로 해결했다.
```jsx
<CommonTable key={resetPageKey} ... />   // resetPageKey = `${search}|${poolOpen?'pool':'member'}`
```
검색어/풀 토글에만 반응하므로 **배정 캐시 패치로 행 값만 바뀔 때는 remount 되지 않는다**(사용자가 보던 페이지 유지).

**`rowsPerPage` 선택기는 넣지 않았다.** 근거: (a) 카드 높이가 78vh 라 10행이 거의 정확히 한 화면을 채운다(행마다 이중 스코프 셀이 2줄), (b) 실제 상한이 후보 300명이라 검색으로 충분히 좁혀진다, (c) 컨트롤이 늘면 헤더가 붐빈다. 과설계로 판단해 10 유지 + 검색으로 해결했다.

### 12.4 성능

- 필터/검색 계산을 **부모(`AssignmentPage`) 한 곳으로 끌어올려 `useMemo`** 로 묶었다(`queueCounts` / `visibleQueue` / `visibleCandidates`). 두 패널 컴포넌트는 이제 **표시 전용**이라 같은 배열을 두 번 훑지 않는다.
- 입력은 기존 공용 훅 `utils/useDebounce` 로 **200ms 디바운스**(상한이 큐 300 / 풀 300 이라 그 이상은 과설계).
- 검색어가 비면 `filterCandidates` 가 **원본 배열 참조를 그대로 반환**해 불필요한 리렌더를 만들지 않는다(테스트로 고정).

### 12.5 i18n

신규 4키(kr/en 대칭): `search.empty`, `queue.search.placeholder`, `candidate.count`, `candidate.search.placeholder`.
`npm run merge` 재실행 완료 → `assignment` 네임스페이스 **각 85키**, kr/en 키 집합 완전 일치, 코드 사용 키 **91개 전수 존재(누락 0) · 사장 키 0건**(스크립트 대조).

### 12.6 검증

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **14 suites / 154 tests 통과** (assignment 4 suites / 53건 — 신규 `candidateFilter` 8건 + `queueFilter` 검색 8건 확장) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, **신규 코드 유래 경고 0** |
| 공용 컴포넌트 diff | **0건** — `Card` / `CommonTable` / `WorkloadCell` / `ResourceProfileDrawer` / `useDebounce` 전부 **재사용만** |
| 경계면 | invoke 3종 소비 경로·`patchAssignmentCache`·권한 게이트 **무변경**, `invalidateQueries` 여전히 0건 |

**신규 파일**: `searchText.js`, `SearchInput.jsx`, `candidate/candidateFilter.js`, `__test__/candidateFilter.test.js`
**수정 파일**: `AssignmentPage.jsx`(레이아웃·상태·메모이즈), `queue/WorkQueuePanel.jsx`(카드화·표시 전용), `queue/queueFilter.js`(검색·기본값), `candidate/CandidatePanel.jsx`(카드화·검색·토글 이동), `candidate/AssignmentCandidateTable.jsx`(`emptyMessage`/`resetPageKey` prop), `__test__/queueFilter.test.js`, `locales/kr|en/assignment.json`

---

## 13. 배정 직후 선택 상태 수정 (2026-07-23)

사용자 피드백: "담당자 지정하고 나면 카드 선택이 풀린 상태로 미배정 탭에 가든가, 전체 탭으로 가든가 해야 할 것 같다."

### 13.1 원인

`selectedItem` 을 **필터 적용 전** `queue` 전체에서 찾고 있었다. 미배정 필터에서 배정하면
① 캐시 패치로 `UNASSIGNED` 플래그가 풀리고 → ② `visibleQueue` 에서 빠져 좌측 목록에서는 사라지는데
→ ③ `queue` 에는 남아 있어 **우측에는 선택 상태로 계속 떠 있고** → ④ `selectedItem` 이 null 이 아니라
자동선택 effect 도 돌지 않았다. 목록에 없는 항목이 선택돼 있는 상태다.

### 13.2 수정 — 선택 해석을 순수함수로 뽑고 **보이는 목록 기준**으로 전환

`queue/queueFilter.js` 에 신규 순수함수:

```js
export const resolveQueueSelection = (visibleQueue, selectedIssueId) => {
    const list = Array.isArray(visibleQueue) ? visibleQueue : [];
    const selectedItem = list.find((q) => q?.issueId === selectedIssueId) ?? null;
    const autoSelectId = !selectedItem && list.length > 0 ? (list[0].issueId ?? null) : null;
    return { selectedItem, autoSelectId };
};
```

`AssignmentPage` 는 이 결과만 쓴다. 자동선택 effect 의 의존성이 배열이 아니라 **원시값 `autoSelectId`** 로 바뀌어 불필요한 재실행도 사라졌다.

| 상황 | 결과 |
|---|---|
| **미배정 필터**에서 배정 | 목록에서 빠짐 → `selectedItem` null → 다음 항목 자동 선택(연속 배정 흐름 유지) |
| **전체 필터**에서 배정 | 계속 보이므로 **선택 유지**, 카드에 패치된 최신 값 반영 |
| 마지막 미배정 항목 배정 | `visibleQueue` 비어 `selectedItem`·`autoSelectId` 둘 다 null → **빈 상태** |

**필터를 코드로 강제 전환하지 않았다**(지시대로). 사용자가 고른 필터는 그대로 두고 선택만 해제된다.

### 13.3 `selectedItem` 참조 지점 전수 확인 (지시 항목 1)

| 참조 | 배정 직후 null/이동 시 영향 | 판정 |
|---|---|---|
| `runAssign` 의 `currentCoworkerIds` / `base = {issueId, issueKey}` | mutate 호출 **전에** 동기적으로 확정 | 안전 — 다만 아래 하드닝 적용 |
| `jiraProjectKey = projectKeyOfIssue(selectedItem?.issueKey)` | null 이면 `useJiraProjectPermissions(null)` → 쿼리 비활성 → `canAssignIssues === null` = **미확인 → 허용**(차단 아님, 서버가 최종 판정). 다음 항목이 선택되면 같은 프로젝트 키라 모듈 TTL 캐시에 그대로 적중 | 안전 |
| 확인 모달 `confirmBody` 의 `issueKey` | 아래 하드닝으로 `pending.item` 사용 | 안전 |
| `CandidatePanel` description | null → `queue.selectPrompt` 표기 | 의도된 동작 |
| `AssignActionCell` (`isAssignee`/`isCoworker`/버튼 활성) | 새 선택 기준으로 재계산 | 의도된 동작 |

**하드닝 1건** — 확인 모달을 열 때 **대상 작업을 함께 고정**한다.
```js
setPending({ action, candidate, item: selectedItem });   // handleAction
const target = pending?.item;                            // runAssign
```
진행 중인 액션이 "살아있는 선택 상태"에 의존하지 않게 됐다. 모달이 열려 있는 동안 백그라운드 갱신으로 선택이 바뀌어도 대상·확인 문구가 어긋나지 않고, 대상이 소실된 경우엔 조용히 무시하는 대신 **모달을 닫는다**(전에는 early return 이라 모달이 남았다). `runAssign` 의존성에서 `selectedItem` 제거.

### 13.4 자동선택 점프 검토 (지시 항목 2·3)

- **마지막 항목 배정** → `visibleQueue` 빈 배열 → `autoSelectId` null → 선택 없음 + 좌측 빈 상태.
  문구는 `assignment.queue.empty`("배정이 필요한 작업이 없습니다")로, 미배정 필터 문맥에서 정확히 맞는 표현이라 그대로 뒀다(검색 중이면 `search.empty`).
- **검색 중 점프**: 검색어를 좁혀 선택 항목이 밖으로 나가면 첫 매칭으로 이동한다. 디바운스 200ms 뒤 1회만 발생하고, "목록에 없는 항목이 선택돼 있는" 상태보다 낫다고 판단해 그대로 뒀다.
  - *튀는 느낌이 문제가 될 경우의 완화안(미구현, 제안)*: 이전 검색어를 `ref` 로 들고 있다가 **검색어 변경으로 인한 선택 소실일 때만 자동선택을 건너뛰는** 방법. 선택이 비고 우측은 `selectPrompt` 로 남아 사용자가 직접 고르게 된다. 배정·필터 변경 경로의 연속성은 그대로 유지된다. 실사용 반응을 보고 결정하는 편이 낫다고 봐서 지금은 넣지 않았다.

### 13.5 테스트 (신규 6건, `queueFilter.test.js`)

`resolveQueueSelection` + `filterQueue` 조합으로 **배정 전/후 큐 스냅샷**을 만들어 고정했다.
- 배정으로 `UNASSIGNED` 가 풀린 항목이 `filterQueue(unassigned)` 결과에서 빠진다
- 미배정 필터: 배정 후 `selectedItem === null` **그리고** `autoSelectId === '2'`(다음 항목)
- 전체 필터: 선택 유지 + `flags` 가 패치된 최신값(`['NO_ESTIMATE']`)으로 보인다
- 마지막 항목 배정: `{selectedItem:null, autoSelectId:null}` (빈 상태)
- 검색으로 선택이 밖으로 나가면 첫 매칭으로 이동
- 빈/비배열/선택 미지정 방어

### 13.6 검증

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **14 suites / 160 tests 통과** (assignment 4 suites / 59건) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, 신규 코드 유래 경고 0 |
| 경계면 | **무변경** — invoke 3종 소비 경로·payload 규약·`patchAssignmentCache`·권한 게이트 그대로, `invalidateQueries` 여전히 0건 |
| 공용 컴포넌트 | 수정 **0건** |
| i18n | 신규 키 없음 → merge 재실행 불필요 |

**수정 파일**: `queue/queueFilter.js`(`resolveQueueSelection` 추가), `AssignmentPage.jsx`(선택 해석 전환 + pending 대상 고정), `__test__/queueFilter.test.js`

---

## 14. E2E 대응 — flags 빈 이슈 렌더 · Jira 프로젝트 필터 (2026-07-23)

백엔드 §7 의 shape 변경(QueueItem 에 `projectKey`/`projectName` additive, `flags:[]` 유효)에 프론트를 맞췄다. **경계면은 additive 소비만 추가**, 기존 소비 경로 무변경.

### 14.1 작업 1 — `flags:[]` 이슈 렌더 대응

**`patchAssignmentCache` — "flags 비면 큐 제거" 로직 삭제** (핵심)
`patchQueue` 가 `flags.length === 0` 일 때 큐에서 제거하던 분기를 **없앴다**. 큐는 이제 done 제외 전체 열린 이슈라, 배정으로 `flags` 가 `[]` 가 돼도 이슈 자체는 열려 있으므로 **큐에 남고 최신 item 으로 교체**만 한다.
- 미배정 필터에서는 `UNASSIGNED` 배지가 빠져 **클라이언트 필터로 자연히 목록에서 사라진다**(§13 의 `resolveQueueSelection` 이 그대로 다음 항목을 집는다 — 이 조합이 §13·§14를 함께 만족).
- 전체 필터에서는 최신 값으로 계속 보인다.
- 관련 테스트를 `flags 가 비어도 제거하지 않고 교체한다`로 교체(제거를 단언하던 케이스 반전).

**`WorkQueueItem` — 배지 없는 행**
3행 flags 매핑은 `(item?.flags ?? []).map(...)` 이라 빈 배열이면 배지만 안 그리고 statusName·잔여는 그대로 렌더된다(깨지지 않음). 4행 "현재 담당(assignee 아바타)"은 flags 유무와 무관하게 **항상** 렌더되므로, flags 없는(이미 배정된) 행에서 담당자 아바타가 자연스럽게 보인다.

**세그먼트 카운트 모수**: `countByFilter` 는 flags 기반이라 그대로 맞는다("전체"는 이제 열린 이슈 전부, "미배정"은 `UNASSIGNED` 보유분). 새 모수에서 자연 정합.

### 14.2 작업 2 — Jira 프로젝트 드롭다운 필터

한 RMS 프로젝트에 여러 Jira 프로젝트 이슈가 섞이는 구조 대응. **별도 API 호출 없이** 큐 데이터에서 옵션을 유도한다.

`queue/queueFilter.js` 순수함수 추가:
| 함수 | 역할 |
|---|---|
| `ALL_PROJECTS` | "전체 프로젝트" sentinel |
| `matchQueueProject(item, projectKey)` | ALL/미지정이면 통과, 그 외 `item.projectKey` 완전 일치 |
| `deriveProjectOptions(queue)` | `projectKey` distinct + `projectName` 라벨(없으면 key), **라벨 오름차순**. `projectKey` null 은 옵션에서 제외 |
| `filterQueue(...,{ projectKey })` | 프로젝트 조건을 상태·검색과 **AND 결합** |
| `countByFilter(queue, { search, projectKey })` | 세그먼트 카운트도 프로젝트 필터 적용 후 모수에서 계산 |

- **null 방어(판단 명시)**: `projectKey === null` 인 이슈는 **드롭다운 옵션에 넣지 않고**, 특정 프로젝트를 고른 상태에서는 목록에서도 제외한다("전체 프로젝트"에서는 물론 보인다). "기타" 그룹을 만들지 않은 이유 — 옵션에 뜨지 않는 값을 필터로 고를 수 없어 죽은 옵션이 되고, 실데이터에서 Jira 이슈의 `project` 가 null 인 경우는 사실상 없다(백엔드가 네이티브 필드로 채움).
- **`countByFilter` 시그니처 변경**: `(queue, search)` → `(queue, { search, projectKey })`. 이 함수는 assignment 내부 전용이라 외부 소비자 없음(호출부는 `AssignmentPage` 하나 + 테스트). 함께 갱신했다.

**UI (`WorkQueuePanel`)**
- 프로젝트 옵션이 **2개 이상일 때만** 드롭다운을 노출한다(단일이면 필터가 무의미). `@atlaskit/select`(`spacing="compact"`, 8개 초과 시 검색 가능, `menuPortal` z-index 9999)를 sticky 필터 바 최상단에 둔다 — 스크롤에도 상태 세그먼트와 함께 고정.
- 다크모드: Atlaskit `Select` 라 토큰 기반 자동 대응.

**`AssignmentPage`**
- `projectKey` 상태 추가(기본 `ALL_PROJECTS`). `deriveProjectOptions(queue)` 를 `useMemo` 로 유도, `filterQueue`/`countByFilter` 에 전달.
- **선택 프로젝트가 데이터에서 사라지면 전체로 되돌리는** effect 추가(캐시 갱신 등으로 옵션이 바뀔 때 죽은 필터 방지).
- 빈 상태 문구 분기를 `isSearching` → **`isFiltered`**(검색어 **또는** 프로젝트 필터)로 확장 — 필터로 0건이면 `search.empty`("검색 결과가 없습니다"), 아무 필터 없이 0건이면 `queue.empty`.
- `resolveQueueSelection` 은 그대로 `visibleQueue`(= 프로젝트 필터까지 적용된 목록) 기준이라, 자동선택·선택유지·빈 상태가 **프로젝트 필터 적용 후 목록과 일관**되게 동작한다(별도 수정 불필요).

**`WorkQueueItem` — 프로젝트명 표기**
1행 이슈키 옆에 프로젝트명을 작게(11px, subtlest) 표기하고 **길면 잘라 툴팁**(`maxWidth:120`, `text-overflow:ellipsis`)으로 전체명을 준다. `projectName`/`projectKey` 둘 다 null 이면 생략. 이슈키만으로 구분 안 되던 문제 해소.

### 14.3 i18n
신규 2키(kr/en 대칭): `queue.project.label`, `queue.project.all`. `npm run merge` 재실행 완료 → `assignment` 네임스페이스 **각 87키**, kr/en 완전 일치, 코드 사용 키 **87개 전수 존재(누락 0) · 사장 키 0건**.

### 14.4 검증

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **16 suites / 202 tests 통과** (assignment 4 suites / 65건 — 프로젝트 필터 6건 + patchQueue 반전 케이스) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, **신규 코드 유래 경고 0** |
| 경계면 | additive 2필드(`projectKey`/`projectName`) 소비만 추가, 기존 소비 경로·payload 규약·권한 게이트 무변경, `invalidateQueries` 여전히 0건 |
| 공용 컴포넌트 | 수정 **0건**(`@atlaskit/select`·`Card`·`CommonTable` 재사용만) |

**수정 파일**: `queue/queueFilter.js`(프로젝트 필터·`countByFilter` 시그니처), `queue/WorkQueuePanel.jsx`(프로젝트 드롭다운·`isFiltered`), `queue/WorkQueueItem.jsx`(프로젝트명 표기), `patchAssignmentCache.js`(flags 빈 큐 유지), `AssignmentPage.jsx`(projectKey 상태·옵션 유도), `__test__/queueFilter.test.js`·`__test__/patchAssignmentCache.test.js`, `locales/kr|en/assignment.json`

---

## 15. 큐 프로젝트 필터를 스페이스 필터형 멀티선택으로 교체 (2026-07-23)

사용자 피드백: 큐의 프로젝트 필터를 작업 관리(목록 뷰)의 **스페이스 필터처럼** — `DropdownMenu` + `DropdownItemCheckbox` **멀티선택** — 으로 바꿔달라. §14의 `@atlaskit/select` 단일선택을 교체했다.

### 15.1 시맨틱 전환 — 단일 키 → 키 Set (순수함수)

`queue/queueFilter.js`:
- `matchQueueProject(item, projectKeys)` — **Set 기반**. 빈 Set(또는 미지정)이면 전부 통과(전체), 하나 이상이면 `item.projectKey ∈ Set`(OR). null projectKey 는 특정 선택 시 제외.
- `filterQueue(...,{ projectKeys })` / `countByFilter(...,{ projectKeys })` — 파라미터를 `projectKey`(문자열) → `projectKeys`(Set|배열)로 교체. 내부 `toKeySet()` 가 배열/Set/falsy 를 방어적으로 Set 정규화.
- `deriveProjectOptions` 는 그대로(큐 유래 distinct, 별도 API 없음).
- `ALL_PROJECTS` sentinel 제거 — "전체"는 이제 **빈 Set** 이 표현한다(문자열 sentinel 불필요).

### 15.2 멀티선택 드롭다운 UI (신규 `queue/ProjectFilterDropdown.jsx`)

`DropdownJql` 의 **UI 패턴만** 따랐다(원본은 JQL 생성기·서버 검색 훅과 결합돼 있어 재사용 불가 — 제약).
- `DropdownMenu` 트리거(`Button` + `ChevronDownIcon`, 선택 시 `isSelected`) + `DropdownItemCheckbox` 목록.
- **내부 검색 Textfield 는 옵션 8개 초과 시에만** 노출(`DropdownJql` 관례). 검색은 기존 `searchText` 순수유틸(`normalizeSearch`/`includesNormalized`) 재사용, 라벨·키 매칭.
- "전체 프로젝트" 체크박스(맨 위) = 선택 전부 해제(`onClear`). 각 프로젝트 체크박스 = `onToggle(key)`.
- 옵션 0건 검색 시 `assignment.search.empty` 표기.
- 데이터 소스는 큐 유도 옵션 그대로 — 별도 API 없음.

**트리거 라벨** (작업 관리 표기 관례 참고):
| 선택 수 | 라벨 |
|---|---|
| 0 | `assignment.queue.project.all`("전체 프로젝트") |
| 1 | 그 프로젝트 이름 |
| N | `assignment.queue.project.selected`("프로젝트 {n}" / "{n} projects") |

### 15.3 상태 소유 (`AssignmentPage`)

- `projectKey` 문자열 state → `projectKeys` **Set** state(기본 빈 Set = 전체).
- `toggleProject(key)`(Set 복제 후 add/delete), `clearProjects()`(빈 Set) 핸들러 추가.
- **선택 프로젝트가 큐 데이터에서 사라지면 해당 키만 Set 에서 제거**(전체 리셋 아님) — `projectOptions` 변화 시 유효 키만 남기고, 변화 없으면 참조 유지해 리렌더 억제.
- `filterQueue`/`countByFilter` 에 `projectKeys` 전달. `isFiltered` = 검색어 있음 **또는** `projectKeys.size > 0`.

### 15.4 일관 동작 확인 (기존 파이프라인 불변)

- `resolveQueueSelection` 은 그대로 `visibleQueue`(프로젝트 멀티필터까지 적용된 목록) 기준 → 자동선택·선택유지·빈 상태가 새 필터에서도 일관.
- 세그먼트 카운트도 프로젝트 필터 적용 후 모수에서 계산(§14와 동일 원칙, Set로 확장).
- `WorkQueuePanel` 은 프로젝트 옵션 2개 이상일 때만 필터 노출(단일이면 무의미) — 유지.

### 15.5 i18n
신규 1키(kr/en 대칭): `queue.project.selected`. 기존 `queue.project.label`/`.all` 재사용. `npm run merge` 완료 → `assignment` 네임스페이스 **각 88키**, kr/en 완전 일치, 코드 사용 키 **88개 전수 존재(누락 0) · 사장 키 0건**.

### 15.6 검증

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **16 suites / 204 tests 통과** (assignment 4 suites / 67건 — 프로젝트 필터 Set 시맨틱 테스트로 교체·확장) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, 신규 코드 유래 경고 0 |
| 공용 컴포넌트 | 수정 **0건** — `DropdownJql`/`ProjectFilter` 원본 무수정, `@atlaskit/dropdown-menu` 패턴만 차용 |
| 경계면 | invoke 소비 경로·payload 규약·`patchAssignmentCache` 무변경, `invalidateQueries` 0건 |

**신규 파일**: `queue/ProjectFilterDropdown.jsx`
**수정 파일**: `queue/queueFilter.js`(Set 시맨틱), `queue/WorkQueuePanel.jsx`(Select → 멀티선택 드롭다운), `AssignmentPage.jsx`(Set state·토글/클리어), `__test__/queueFilter.test.js`, `locales/kr|en/assignment.json`

---

## 16. 프로젝트 필터 공용 승격 + 옵션 아바타 (2026-07-23)

작업 관리(트리·간트)에도 같은 스페이스 필터를 쓰게 되면서 §15 의 프로젝트 필터를 공용으로 승격하고, 옵션에 프로젝트 아바타를 추가했다. **경계면·큐 필터 시맨틱 무변경**.

### 16.1 공용 승격
- `assignment/queue/ProjectFilterDropdown.jsx` → **삭제**, `components/filter/ProjectFilterDropdown.jsx` 로 이동(자체 포함 — 내부 검색 정규화 인라인). `WorkQueuePanel` import 를 공용 경로로 갱신.
- 순수 로직을 신규 `components/filter/projectSpace.js` 로 추출: `matchesProjectKeys`(Set 시맨틱)·`deriveProjectOptions`(accessor 유도)·`toKeySet`.
- `queue/queueFilter.js` 의 `matchQueueProject`/`deriveProjectOptions` 를 **공용 함수 위임**으로 축소(시그니처·동작 무변경 → 기존 67 테스트 그대로 통과). 트리·간트는 nested `task.project`, 큐는 flat `projectKey/Name/AvatarUrl` 을 각각 accessor 로 넘긴다.

### 16.2 옵션 아바타
- 옵션 shape 을 **`{ value, label, avatarUrl }`** 로 통일(트리·간트·큐 공용). `deriveProjectOptions(items, getKey, getName, getAvatar?)` — 같은 key 의 첫 non-null 아바타를 채운다.
- 큐 accessor 는 **백엔드 additive `QueueItem.projectAvatarUrl`**(string|null, `avatarUrls['16x16']`)을 소비한다. ⚠️ 작업 시점에 `02_backend_report.md` §7 에는 `projectKey`/`projectName` 만 문서화돼 있고 `projectAvatarUrl` 은 아직 미기재였다 — 코디네이터가 확정 통지한 필드명 그대로 사용했다(백엔드 배포 후 §7 갱신 확인 필요).
- `ProjectFilterDropdown` 각 옵션 앞에 `Avatar square xsmall`(16px). null 이면 Atlaskit 기본 글리프로 자리 확보(레이아웃 유지).

### 16.3 검증
- `npm test` → **17 suites / 213 tests 통과**(신규 `components/filter/__test__/projectSpace.test.js` — avatar 유도/첫 non-null/flat·nested 양 shape 고정).
- `npm run build` → 신규 경고 0.
- i18n 신규 키 없음(공용 드롭다운이 `assignment.queue.project.*` 재사용) → merge 불필요.
- 경계면·`patchAssignmentCache`·권한 게이트 무변경, `invalidateQueries` 0건.

**삭제**: `assignment/queue/ProjectFilterDropdown.jsx`
**신규(공용)**: `components/filter/ProjectFilterDropdown.jsx`, `components/filter/projectSpace.js`, `components/filter/__test__/projectSpace.test.js`
**수정**: `queue/queueFilter.js`(공용 위임 + avatar accessor), `queue/WorkQueuePanel.jsx`(import 경로), `__test__/queueFilter.test.js`(avatarUrl 반영)
