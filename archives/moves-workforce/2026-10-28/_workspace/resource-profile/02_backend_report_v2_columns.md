# Resource Profile v2 (Overview 테이블 재구성) — 백엔드 확장 리포트

> v1(`02_backend_report.md`) 위에 얹는 델타. 여기 명시 없는 것은 전부 v1 유지.
> frontend-engineer 는 이 문서의 **실제 응답 shape** 을 단일 진실로 소비한다.

## 1. 구현한 함수 (신규/변경)

| 종류 | 이름 | 파일 | 비고 |
|------|------|------|------|
| 배치 페처(신규) | `fetchAssignedLoadByAccounts(accountIds)` | `ResourceLoadFetcher.js` | all-status, Done 26주 한정, 상태별 카운트+spent/rem |
| SQL 쿼리(신규) | `ProjectUsersQuery.FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS(count)` | `ProjectUsersQuery.js` | bulk, 활성 프로젝트 distinct 카운트 |
| 순수함수(신규) | `isProjectClosed(endDate, today?)` | `ResourceMatch.js` (export) | end_date 기준, jest 6케이스 |
| 서비스(확장) | `getResourceLoadSummaryService()` | `ResourceManagementService.js` | LoadRow 확장 shape |
| 서비스(확장) | `getResourceProfileService({accountId})` | `ResourceManagementService.js` | load 필드 확장(진행중 이슈 목록은 v1 유지) |
| 헬퍼(신규) | `computeCompletionRate`, `selectActiveProjectCounts` | `ResourceManagementService.js` | 완수율/프로젝트카운트 |

**v1 In-Progress 페처 2종(`fetchInProgressLoadByAccounts`, `fetchInProgressIssuesForAccount`)은 미수정 확인** → Match(`getProjectSkillMatch`)·드로어 진행중 이슈 목록 회귀 없음.
**Controller / `src/index.js` / `PermissionMap.js` 변경 없음 확인** (`getResourceLoadSummary`·`getResourceProfile` 는 v1 에서 이미 등록/권한 매핑 존재, 서비스 로직만 확장).

## 2. 실제 응답 shape (프론트가 글자 그대로 소비)

접근 경로: `invoke('fn', payload)` → `res.content.*`.

### 2.1 `getResourceLoadSummary` (확장) — 입력 `{}` (payload 없음)

**실제 성공 응답 (`res.content`):**
```jsonc
{
  "load": [
    {
      "accountId": "string",
      "todoCount": 2,             // statusCategory.key === 'new'          (관여 건수, 분할 안 함, 정수)
      "inProgressCount": 3,       // statusCategory.key === 'indeterminate'(관여 건수, 분할 안 함, 정수)
      "doneCount": 5,             // statusCategory.key === 'done'         (관여 건수; Done은 최근 26주 updated만)
      "projectCount": 4,          // 활성(미종료) 참여 프로젝트 distinct 수 (정수, SQL)
      "spentSeconds": 360000,     // Σ(timeSpentSeconds ÷ 참여자 수) = 1인 기대 몫 합 (소수 가능)
      "remainingSeconds": 90000,  // Σ(remainingEstimateSeconds ÷ 참여자 수) = 1인 기대 몫 합 (소수 가능)
      "completionRate": 0.8       // spentSeconds/(spentSeconds+remainingSeconds), 분모 0 → null
    }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z"   // new Date().toISOString()
}
```
- **행 포함 규칙**: 이슈 부하가 있거나(loadMap) **또는** 활성 프로젝트가 있는(projectCountMap) 계정의 union → 둘 다 없는 사람만 배열에서 생략. 프론트는 `Map(accountId→LoadRow)` 병합, 미존재 시 전 카운트 0 / `completionRate:null` 취급.
- **필드명 주의**: v2 배치는 `spentSeconds`/`remainingSeconds` (v1 In-Progress 배치의 `remainingEstimateSeconds` 와 다름 — 혼동 방지). `completionRate` 는 `0~1` 실수 또는 `null`, 프론트가 `×100` % 표기.
→ **설계서 §2.1 계약과 완전 일치.**

### 2.2 `getResourceProfile` (load 확장) — 입력 `{ accountId }`

v1 shape 전부 유지 + `content.load` 에 **필드 추가만**. **`inProgressIssues`(진행중 이슈 목록)은 v1 In-Progress 그대로 유지**(변경 없음).

**실제 `content.load` (v1 유지 필드 + v2 신규 필드):**
```jsonc
{
  "load": {
    // ── v1 유지(하위호환) ──
    "inProgressCount": 3,               // = inProgressIssues.length (진행중 이슈 목록 길이, In Progress)
    "remainingEstimateSeconds": 144000, // 진행중 이슈 per-head 합 (v1)
    "util": 0.82 | null,
    "utilBand": "idle|normal|over|red|unknown",
    // ── v2 신규 ──
    "todoCount": 2,                     // all-status 배치 new
    "doneCount": 5,                     // all-status 배치 done (최근 26주)
    "completionRate": 0.8 | null,       // 배치 spent/(spent+rem)
    "projectCount": 4                   // 활성 프로젝트 수
  }
}
```
- `content.profile` / `content.inProgressIssues` / `content.experience` 는 **v1 그대로**(§1.1 v1 리포트 참조).
- **주의(verifier용)**: v2 신규 필드에 `inProgressCount` 를 **중복 추가하지 않았다**. v1 `load.inProgressCount`(=진행중 이슈 목록 length)를 그대로 두고, all-status 배치의 indeterminate 카운트는 별도 노출하지 않음(둘은 동일해야 정상). 혼선 방지 위해 단일 필드(v1 값) 유지. `spentSeconds`/`remainingSeconds` 도 드로어 load 에는 노출 안 함(설계 §3.4 열거 항목 기준). 완수율 산출에만 내부 사용.
→ **설계서 §3.4 준수**(load 확장, 목록 In-Progress 유지). §2.2 "v1 shape 유지 + 상태별 카운트/완수율/projectCount 추가" 충족.

### 2.3 `getProjectSkillMatch` — **v2 변경 없음** (v1 그대로). `fetchInProgressLoadByAccounts` 미수정.

## 3. 열린 질문 실측 결과

### 3.1 `statusCategory.key` = `new` / `indeterminate` / `done` → **확정(코드베이스 실측)**
- 실측 근거(전부 이 3종 사용): `src/resolver/gantt/GanttMapper.js`(`statusCategory?.key`), `GanttMapper.test.js`(`{key:'done'}`, `{key:'indeterminate'}`, `{key:'new'}`), `src/resolver/projectProgress/ProgressCalculator.js`(주석 `new/indeterminate/done`), `IssueAnalysisService.js:221`(`statusCategory?.key`).
- 매핑: `new`=할일(todoCount), `indeterminate`=진행(inProgressCount), `done`=완료(doneCount). 그대로 채택.

### 3.2 `updated >= "-26w"` 상대일자 JQL → **채택(design primary), 단 live 미실측 · swap 가능하게 상수화**
- **실측 제약**: 이 환경은 forge tunnel/live Jira 접근이 없어 실제 쿼리 실행으로는 확인 불가.
- **판단**: `-26w`(주 단위 상대일자)는 Jira JQL 표준 상대일자 문법(단위 `d/w/m/y/h`)으로 유효. design 이 primary 로 확정한 값이라 그대로 채택.
- **폴백 준비**: 창(window)을 모듈 상수 `LOAD_DONE_WINDOW = '-26w'` (`ResourceLoadFetcher.js`)로 분리. 특정 Jira 인스턴스가 상대일자를 거부하면 이 **한 값만** 절대일자 ISO(예: 오늘−180일 `"2026-01-22"`)로 교체하면 됨(JQL 조립부 수정 불필요). 실배포/튜닝 단계에서 tunnel 로 1회 검증 권장.
- **JQL 전체**: `(assignee in (ids) OR movesRmsCoworkers in (ids)) AND (statusCategory != Done OR updated >= "-26w")` — 열린 이슈 전부 + Done 최근 26주.

## 4. 설계 대비 이탈 / 특기사항

- **계약 이탈 없음.** `getResourceLoadSummary` 확장 shape 은 §2.1 과 글자 그대로 일치. `getResourceProfile` 은 §3.4 대로 v1 유지 + 필드 추가.
- **드로어 load 에 `inProgressCount`/`spentSeconds`/`remainingSeconds` 중복·추가 미노출** (위 §2.2). 설계 §3.4 가 나열한 신규 항목 중 `inProgressCount` 는 v1 필드와 동일 의미라 중복 회피. 프론트가 드로어에서 상태별 카운트 카드를 그릴 때 `todoCount`/`inProgressCount`(v1)/`doneCount` 로 충분.
- **균등 분할 vs 완수율(§3.2)**: 이슈 건수(todo/inProgress/done)는 관여 건수(분할 안 함). `spentSeconds`/`remainingSeconds` 는 참여자 수 균등 분할(1인 기대 몫) 합. 완수율은 분자·분모 동일 `n` 상쇄로 분할 무관·값 불변(`computeCompletionRate` 는 분할값으로 계산해도 결과 동일).
- **배치 청크 이중계상 방지**: v1 과 동일 패턴 — 각 청크는 자기 청크 집합(chunkSet) 내 참여자만 계상(disjoint), 이슈별 참여자는 `Set` 중복 제거.
- **성능 준수**: `getResourceLoadSummary` = Jira all-status 배치 1회(50청크+p-limit(3)) + SQL 1회 = N+1 없음. `timetracking.timeSpentSeconds` 는 Jira 자동 집계라 워크로그 개별 페치 없음. 공통 워크로그/이슈 페처 미수정. asUser(asApp 금지). rollup 재사용(신규 페치 없음).
- **참여 프로젝트 수 소스**: `projectusers ⋈ project`, `end_date IS NULL OR end_date >= CURDATE()`(활성) distinct 카운트. 종료 판정 = end_date(status 엔티티에 종료 플래그 부재 실측 → 날짜 기준, `isProjectClosed` 순수함수와 동일 경계). SQL 컬럼명 DDL 검증 완료(`project.end_date`, `projectusers.account_id`/`project_id` 존재).
- **부분 성공 폴백**: Jira 배치 실패 → 빈/부분 Map(0). projectCount 쿼리 실패 → try/catch 빈 Map(0). throw 안 함. `accountId` 누락만 throw(v1 유지).
- **DDL 마이그레이션 없음**(읽기 JOIN 쿼리 1건 추가).

## 5. 변경/신규 파일

| 파일 | 변경 |
|------|------|
| `src/resolver/resourceManagement/ResourceLoadFetcher.js` | `fetchAssignedLoadByAccounts` + `fetchAssignedLoadForChunk` + `LOAD_DONE_WINDOW` 상수 추가. **기존 In-Progress 2종 미수정.** |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS(count)` 추가(+`generateInClause` import). |
| `src/resolver/resourceManagement/ResourceMatch.js` | `isProjectClosed(endDate, today?)` export 추가. |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `getResourceLoadSummaryService` v2 확장, `getResourceProfileService` load 확장, `computeCompletionRate`/`selectActiveProjectCounts` 헬퍼, import 확장. |
| `src/resolver/resourceManagement/__test__/ResourceMatch.test.js` | `isProjectClosed` jest 6케이스 추가. |
| Controller / `src/index.js` / `PermissionMap.js` | **변경 없음**(확인만). |

## 6. 테스트 결과 (`npm test`, 루트 jest)

```
Test Suites: 22 failed, 14 passed, 36 total
Tests:       229 passed, 229 total
Snapshots:   0 total
```
- **테스트 실패 0건.** 229건 전부 통과 (v1 223 + 신규 `isProjectClosed` 6케이스 = 229).
- **"22 failed suites" 는 전부 `.claude/worktrees/RFC-168/` 하위** — 다른 에이전트(RFC-168)가 생성한 별도 git worktree를 루트 jest 가 스캔하며 발생한 **suite-level 파싱 실패(SyntaxError: Cannot use import statement outside a module)** 이다. 내 변경 파일과 무관(실제 리포 루트의 동일 suite 는 전부 PASS). 예: 루트 `src/resolver/resourceManagement/__test__/ResourceMatch.test.js` PASS, `test/permission/permissionMap.contract.test.js` PASS(→ Controller 등록 ↔ PermissionMap 정합, v2 무변경 확인).
- 이 worktree 노이즈는 환경 조건(타 브랜치 worktree 존재)일 뿐 내 작업 범위 밖이며 수정하지 않았다.
```
```
