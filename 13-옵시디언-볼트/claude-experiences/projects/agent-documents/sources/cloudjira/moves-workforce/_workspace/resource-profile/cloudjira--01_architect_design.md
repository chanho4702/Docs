# 자원관리 페이지 인력 중심 개선 (Resource Profile) 설계서

> 단일 진실 원천. backend/frontend/verifier 는 §2 경계면 계약 표를 기준으로 작업한다.
> 요구사항: `_workspace/resource-profile/00_input/requirement.md`

---

## 1. 개요 / 영향 범위

기존 `/resource` 페이지(Overview + Match 2탭)에 **인력 360도 상세 드로어**를 얹고 **Match 탭에 현재 부하 결합**을 추가한다. 별도 페이지·역방향 추천은 만들지 않는다.

- **백엔드 (`src/resolver/resourceManagement/`)**
  - 신규 전용 페처 모듈 `ResourceLoadFetcher.js` — 진행중 이슈/남은작업량 Jira 검색(공통 경로 미수정, [[feedback-worklog-fetch-isolation]] 준수).
  - 신규 이력 쿼리 `ProjectUsersQuery.FIND_HISTORY_BY_ACCOUNT` (project JOIN, 종료 포함).
  - 신규 resolver 3종: `getResourceProfile`(드로어 온디맨드), `getResourceLoadSummary`(Overview 배치 컬럼), `getProjectSkillMatch` **강화**(부하 결합·랭킹 반영).
  - `ResourceMatch.rankCandidates` 시그니처 확장(부하 tiebreaker).
- **프론트 (`static/ui/src/pages/resource/`)**
  - Overview: 로우 클릭 → `ResourceProfileDrawer` (신규). 진행중 이슈 목록 + 부하 요약 + 경험(스킬/참여이력).
  - Overview 테이블: 진행중 건수 / 남은작업량 컬럼(배치 조회로 lazy hydrate).
  - Match: `CandidateRankTable` 에 부하 컬럼 추가(서버가 이미 결합해 내려줌).
  - `resourceKeys` 팩토리 3키 추가.
- **DB**: **마이그레이션 불필요**. `projectusers` + `project` 읽기 전용 JOIN만 추가. (참여이력용 기간 컬럼은 실재하지 않음 — §5 참조, 프로젝트 start/end + status 로 대체.)
- **i18n**: `locales/kr/resource.json` · `locales/en/resource.json` 에 `profile.*` / `col.inProgress` / `col.remaining` 키 추가.

---

## 2. 경계면 계약 (가장 중요)

컨벤션: **조립조회 = `res.content`**, CRUD/set·get = `res.data`, getActiveProjects/getProjectStatusList = `res.rows`. 신규 3종은 전부 조립조회 → **`res.content`**.

| resolver 함수 | 입력 payload | 응답 shape (success 시) | 대응 프론트 훅 / 쿼리키 |
|--------------|-------------|------------------------|------------------------|
| `getResourceProfile` (신규) | `{ accountId }` | `{ success, content: { profile, load, inProgressIssues, experience } }` (아래 상세) | `useResourceProfile(accountId)` / `resourceKeys.profile(accountId)` |
| `getResourceLoadSummary` (신규) | `{}` (없음) | `{ success, content: { load: [{accountId, inProgressCount, remainingEstimateSeconds}], generatedAt } }` | `useResourceLoadSummary()` / `resourceKeys.loadSummary()` |
| `getProjectSkillMatch` (강화) | `{ projectId }` | `{ success, content: { projectId, projectName, requiredSkills, candidates } }` — **candidate 에 `inProgressCount`, `remainingEstimateSeconds` 필드 추가**(기존 필드 전부 유지) | `useProjectSkillMatch(projectId)` (기존 유지, shape만 확장) |

### 2.1 `getResourceProfile` content 상세 (드로어 단일 진실)

```jsonc
{
  "profile": {                 // 인적 요약 (buildPeopleContext 의 1인분 재사용)
    "accountId": "string",
    "displayName": "string",
    "avatarUrls": { "24x24": "url" } | null,
    "roleName": "string|null",
    "levelName": "string|null"
  },
  "load": {                    // (b) 부하
    "inProgressCount": 3,               // 진행중 이슈 관여 건수(분할 안 함, 정수)
    "remainingEstimateSeconds": 144000, // 남은 작업량 = 이슈별 1인 기대 몫(분할 후)의 합(초)
    "util": 0.82 | null,                // rollup 재사용(신규 페치 없음)
    "utilBand": "idle|normal|over|red|unknown"
  },
  "inProgressIssues": [        // (a) 진행중 작업 목록 (updated desc)
    {
      "issueKey": "PRJ-123",
      "summary": "string",
      "statusName": "In Progress",
      "projectName": "string|null",     // Jira issue.fields.project.name
      "issueTypeName": "string|null",
      "issueRemainingEstimateSeconds": 216000, // 이슈 전체 남은작업량(분할 전 원본)
      "participantCount": 3,                    // assignee(있으면1) + coworkers 수
      "remainingEstimateSeconds": 72000,        // 1인 기대 몫 = 위 원본 ÷ participantCount
      "dueDate": "2026-07-30|null",
      "participation": "assignee" | "coworker"   // 대상자가 담당자인지 협업자인지
    }
  ],
  "experience": {              // (c) 경험
    "skills": [{ "id": "string", "name": "string", "category": "string" }],
    "projectHistory": [                 // 종료 프로젝트 포함
      {
        "projectId": "uuid",
        "projectName": "string",
        "roleName": "string|null",
        "projectStatusKey": "string|null",
        "projectStatusName": "string|null",   // KVS status 라벨 해석
        "startDate": "2026-01-01|null",
        "endDate": "2026-06-30|null",
        "closed": true|false               // status 가 종료계열 or end_date < today (백엔드 판정)
      }
    ]
  }
}
```

**실패 시** (전 resolver 공통, responseWrapper): `{ success:false, error:{ name, code, message, cause } }`.
- `accountId` 누락 → `LogicalError(ErrorCodes.USER_ID_REQUIRED)`.
- Jira 검색 실패는 **부분 성공 허용**: inProgressIssues 페치 실패 시 빈 배열 + `load.inProgressCount=0` 으로 폴백(드로어의 스킬/이력/util 은 살린다). 로그만 남기고 throw 안 함.

### 2.2 `getResourceLoadSummary` content 상세

```jsonc
{
  "load": [
    // inProgressCount = 관여 건수(분할 안 함)
    // remainingEstimateSeconds = 이슈별 1인 기대 몫(총 remaining ÷ 참여자 수)의 합
    { "accountId": "string", "inProgressCount": 2, "remainingEstimateSeconds": 90000 }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z"   // 서버 조회 시각(캐시 표기용)
}
```
- 등록 사용자(`users` 테이블) 전원 대상. 진행중 이슈 0건인 사람은 배열에서 생략 가능 → 프론트는 `Map(accountId→load)` 로 병합, 없으면 `{inProgressCount:0, remaining:0}` 취급.

---

## 3. 백엔드 설계

### 3.1 신규 전용 페처 — `ResourceLoadFetcher.js` (핵심)

공통 이슈 페처(`getProjectIssuesByFilter`/`getProjectGanttIssues` 등) **절대 미수정**. 신규 모듈에 격리.

**진행중 판정**: `statusCategory = "In Progress"` (Jira 상태 카테고리, Moves 자체 상태 아님 — 요구 확정).
**대상 이슈**: `assignee` 또는 `movesRmsCoworkers`(manifest `jira:entityProperty` searchAlias — 커스텀필드 `coworkerIdField` 와 독립, 팀 관리형 포함 [[project-team-managed-field-gap]]).
**coworkerFieldId 불필요**: 검색 alias `movesRmsCoworkers` 는 manifest 선언 alias라 필드 id 조회 없이 항상 사용. (기존 `getProjectIssuesByUser` 가 coworkerFieldId 를 boolean 게이트로 쓰지만, 여기선 alias 를 무조건 포함해 필드 조회 1회를 절약.)
**남은작업량**: `issue.fields.timetracking?.remainingEstimateSeconds ?? 0`.
**컨텍스트**: `as: 'user'` (asApp 지양 [[feedback-no-asapp]]).

두 개 export:

**공통 분할 규칙 (A·B 동일 적용)** — 협업자 부하 = **균등 분할**:
- **참여자 수(participantCount) = (assignee 있으면 1) + coworkers 수**. (담당자1+협업자2 = 3)
  - 담당자만(협업자 없음) → 분모 1 → 전액(기존 동작과 동일).
  - 협업자만 있고 assignee 없음 → 분모 = coworkers 수.
- **1인 기대 몫 = 이슈 `remainingEstimateSeconds` ÷ participantCount**.
- **진행중 건수는 분할하지 않는다** — 관여 1건 = 1건(정수). **작업량(초)만 분할**.
- 참여자 수 산출에 필요한 **assignee + coworkers 목록**은 (A)·(B) 모두 `fields=assignee` + `properties=movesRms`(coworkers) 로 확보(아래 각 스펙 반영됨).

**(A) `fetchInProgressIssuesForAccount(accountId)`** — 드로어용(1인, 이슈 목록 필요)
```
JQL: (assignee = "{accountId}" OR movesRmsCoworkers in ("{accountId}"))
     AND statusCategory = "In Progress"
     ORDER BY updated DESC
fields: summary,status,timetracking,project,issuetype,assignee,duedate
properties: movesRms
maxResults=100 + nextPageToken 루프(1패스)
이슈별 계산:
  issueRemaining = issue.fields.timetracking?.remainingEstimateSeconds ?? 0
  coworkers      = issue.properties.movesRms?.coworkers ?? []
  participantCount = (issue.fields.assignee ? 1 : 0) + coworkers.length   // 최소 1 보정
  perHead        = participantCount > 0 ? issueRemaining / participantCount : issueRemaining
→ [{ issueKey, summary, statusName, projectName, issueTypeName,
     issueRemainingEstimateSeconds: issueRemaining,   // 분할 전 원본
     participantCount,                                // assignee+coworkers 수
     remainingEstimateSeconds: perHead,               // 1인 기대 몫(분할 후)
     dueDate, participation }]
   participation = issue.fields.assignee?.accountId === accountId ? 'assignee' : 'coworker'
```

**(B) `fetchInProgressLoadByAccounts(accountIds[])`** — 배치용(전원, 카운트/합만)
```
POST /rest/api/3/search/jql  (postJiraJson, as:'user')  ← URL 길이 회피(accountId 다수)
body: {
  jql: `statusCategory = "In Progress"
        AND (assignee in (${ids}) OR movesRmsCoworkers in (${ids}))`,
  fields: ["timetracking","assignee"],
  properties: ["movesRms"],
  maxResults: 100, nextPageToken 루프
}
이슈별 집계(균등 분할):
  issueRemaining   = issue.fields.timetracking?.remainingEstimateSeconds ?? 0
  coworkers        = issue.properties.movesRms?.coworkers ?? []
  participantCount = (issue.fields.assignee ? 1 : 0) + coworkers.length
  perHead          = participantCount > 0 ? issueRemaining / participantCount : issueRemaining
  대상 집합 내 각 참여자(assignee.accountId + coworkers)에 대해:
    inProgressCount += 1            // 건수는 분할 안 함
    remainingEstimateSeconds += perHead   // 작업량은 1인 기대 몫만 가산
→ Map(accountId → { inProgressCount, remainingEstimateSeconds })
```
- **정확성 가정(설계서 명시 + UI InfoTip)**: 참여 인원으로 **균등 분할**한 1인 기대 몫. 사람별 실제 기여도 데이터가 없어 여전히 **근사치**(균등 가정). 진행중 건수는 관여 건수(정수, 분할 없음).
- `accountIds` 가 매우 많아 POST 본문 JQL 이 과대해질 우려 시 50개씩 청크 + `p-limit(3)` 병렬(동시성 제한). 결과 Map merge.
- Jira 검색 실패 → 빈 Map 폴백(로그만).

> **postJiraJson 미지원 파라미터 확인 필요**: `src/api/jira/util/RequestJiaJson.js` 의 `postJiraJson` 가 `/search/jql` POST 를 지원하는지 backend 가 확인. 미지원이면 GET + accountIds 청크(URL 길이 안전선 ~1500자)로 폴백.

### 3.2 신규 이력 쿼리 — `ProjectUsersQuery.FIND_HISTORY_BY_ACCOUNT`

`projectusers` 에는 **투입·철수 기간 컬럼이 없다**(schema 확인: `role_key, level_key, salary, created_at, updated_at` 뿐). 종료 판정은 `project.project_status_key` + `project.end_date` 로 대체(§5).

```sql
SELECT
    BIN_TO_UUID(pu.project_id) AS project_id,
    p.project_name,
    pu.role_key,
    p.project_status_key,
    p.start_date,
    p.end_date
FROM projectusers pu
JOIN project p ON p.project_id = pu.project_id
WHERE pu.account_id = ?
ORDER BY p.start_date DESC
```
- `INDEX(account_id)` 존재 → 효율적. 종료 프로젝트도 project 행이 남아 있으므로 자동 포함.

### 3.3 Service — `ResourceManagementService.js` 추가/수정

**신규 `getResourceProfileService({ accountId })`** (조립조회, `content` 반환)
```
1) accountId 검증(LogicalError USER_ID_REQUIRED)
2) Promise.all:
   - buildPeopleContext()                       // 재사용: profile + util + skills (신규 페치 없음)
   - fetchInProgressIssuesForAccount(accountId)  // (A) — try/catch 빈배열 폴백
   - executeQuery(ProjectUsersQuery.FIND_HISTORY_BY_ACCOUNT, [accountId])
   - getRoleListService()                        // roleName 라벨
   - getProjectStatusListService()               // status 라벨(res.rows)
3) person = ctx.people.find(p => p.accountId === accountId)  // 없으면 최소 profile 구성
4) load = { inProgressCount: issues.length,                          // 관여 건수(분할 안 함)
            remainingEstimateSeconds: Σ issue.remainingEstimateSeconds, // (A)가 이미 1인 기대 몫 → 합만
            util: person.util, utilBand: person.utilBand }
5) experience.skills = person.skills
   experience.projectHistory = historyRows.map(→ roleName/statusName 라벨 해석 + closed 판정)
6) return { content: { profile, load, inProgressIssues: issues, experience } }
```
- `buildPeopleContext()` 는 전 인원 조립이라 다소 무겁지만 **신규 워크로그 페치 없음**(rollup 1회 read). 드로어는 온디맨드(사용자 클릭당 1회)라 허용. 최적화가 필요하면 후속에서 1인 경량 경로 분리(범위 밖).

**신규 `getResourceLoadSummaryService()`** (조립조회, `content` 반환)
```
1) findUsersRepository({}) → accountIds
2) fetchInProgressLoadByAccounts(accountIds)  // (B)
3) load = [...map] 변환, generatedAt = new Date().toISOString()
4) return { content: { load, generatedAt } }
```

**강화 `getProjectSkillMatchService({ projectId })`**
- 기존 candidates 조립 후, `fetchInProgressLoadByAccounts(people.map(accountId))` 1회 호출(배치, N+1 아님).
- 각 candidate 에 `inProgressCount`, `remainingEstimateSeconds` 병합(없으면 0).
- `rankCandidates(candidates)` → 부하 반영 정렬(§3.4).
- 응답 shape: 기존 + candidate 2필드 추가(**하위호환**, 기존 프론트 소비 안전).
- Jira 실패 시 두 필드 0 폴백(스킬 랭킹은 유지).

### 3.4 순수 함수 — `ResourceMatch.rankCandidates` 확장

현재: `coverage desc → util asc → name`. 부하 결합 후:
```
coverage desc
  → util asc (null=0)
  → remainingEstimateSeconds asc (여유 우선, 미상=0)
  → inProgressCount asc
  → displayName asc
```
- **결정**: 스킬 적합도(coverage)를 **최우선 유지**(스킬 매칭 페이지의 본질). 부하는 동점 후보 사이의 tiebreaker로 반영("적합도 같으면 여유 있는 사람 우선"). jest 케이스 추가(부하 tiebreaker 검증).

### 3.5 Controller / 등록

`ResourceManagementController.js` — `guardedDefine` 3건 추가:
```js
guardedDefine(resolver, 'getResourceProfile',     ({ payload }) => getResourceProfileService(payload));
guardedDefine(resolver, 'getResourceLoadSummary', () => getResourceLoadSummaryService());
// getProjectSkillMatch: 기존 등록 유지(서비스 내부만 강화)
```
- `src/index.js` 등록 함수(`registerResourceManagementController`)는 이미 호출됨 → **변경 없음**.
- **`src/permission/PermissionMap.js` 추가 필수**(deny-by-default):
  ```js
  getResourceProfile:     R('RESOURCE_MANAGEMENT'),
  getResourceLoadSummary: R('RESOURCE_MANAGEMENT'),
  ```

### 3.6 에러 케이스 (ErrorCodes)

- `USER_ID_REQUIRED` — accountId 누락(`getResourceProfile`).
- Jira 검색/timetracking 미설정 → throw 안 함, 0/빈배열 폴백(부분 성공).
- `PROJECT_ID_REQUIRED` — 기존 `getProjectSkillMatch` 유지.

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트 트리 (신규/수정)

```
pages/resource/
  overview/
    ResourceOverviewTab.jsx        (수정) 드로어 상태 + load 병합
    ResourceOverviewTable.jsx      (수정) onRowClick + 진행중/남은작업량 컬럼
    useResourceOverview.js         (유지)
    useResourceLoadSummary.js      (신규) 배치 부하 lazy 조회
    profile/
      ResourceProfileDrawer.jsx    (신규) Atlaskit Drawer, 3섹션
      useResourceProfile.js        (신규) getResourceProfile 훅
      InProgressIssueList.jsx      (신규) 진행중 이슈 테이블
      LoadSummaryCards.jsx         (신규) 건수/남은작업량/가동률 카드
      ProjectHistoryList.jsx       (신규) 참여이력 테이블
  match/
    CandidateRankTable.jsx         (수정) 부하 컬럼 2개 추가
```

### 4.2 쿼리키 팩토리 (`utils/queryKey/resourceKeys.js` 추가)

```js
profile: (accountId) => ["resource", "profile", accountId],
loadSummary: () => ["resource", "loadSummary"],
// projectMatch 는 기존 유지(응답 shape만 확장)
```

### 4.3 훅 소비 shape (계약 준수)

- `useResourceProfile(accountId)`: `invoke('getResourceProfile', { accountId })` → `res.content` 검증 후 `{ profile, load, inProgressIssues, experience }` 반환. `enabled: !!accountId && canRead`.
- `useResourceLoadSummary()`: `invoke('getResourceLoadSummary')` → `res.content.load` 를 `Map(accountId→{inProgressCount, remainingEstimateSeconds})` 로 변환 반환. `staleTime: 60*1000`. Overview 진입 시 백그라운드 로드(테이블 렌더 blocking 안 함).
- Match: `useProjectSkillMatch` 기존 그대로(candidate 에 2필드 추가 자동 수신).

### 4.4 Drawer 상호작용

- `ResourceOverviewTab` 에 `const [drawerTarget, setDrawerTarget] = useState(null)`.
- `ResourceOverviewTable` 로우 클릭 → `onRowSelect(person)` → `setDrawerTarget(person)`. (기존 스킬편집 버튼은 `stopPropagation` 유지.)
- `ResourceProfileDrawer isOpen={!!drawerTarget} accountId={drawerTarget?.accountId} onClose={...}`.
- 드로어 3섹션: **부하 요약 카드**(LoadSummaryCards, `load.remainingEstimateSeconds`→시간 변환 `Math.round(s/3600)`h = 분할 후 1인 몫 합 + `UtilBadge` 재사용) → **진행중 작업**(InProgressIssueList, participation 배지) → **경험**(SkillTags 재사용 + ProjectHistoryList, `closed` true 는 neutral 배지).
- **InProgressIssueList 분할 맥락 표기**: 각 이슈 로우에 `remainingEstimateSeconds`(내 몫, `profile.issue.share`) 를 주 표기하고, `participantCount > 1` 이면 `profile.issue.shared`({total}=`issueRemainingEstimateSeconds`, {count}=`participantCount`) 보조 표기 → "9MD · 3명 공유". InfoTip(`profile.load.tip`)로 균등 분할 근사 안내.

### 4.5 Overview 테이블 부하 컬럼

- head 에 `inProgress`(진행중), `remaining`(남은작업량) 컬럼 삽입(util 뒤).
- 각 로우: `loadMap.get(p.accountId)` → 값 표기, 미도착 시 `-` 또는 스켈레톤. **테이블은 loadSummary 없이 즉시 렌더**, 도착하면 채워짐(비차단).
- 정렬: CommonTable 기본. 부하 기준 정렬은 후속(범위 명시).

### 4.6 권한

- `usePermissionStore` — 기존 `canRead('RESOURCE_MANAGEMENT')` 게이트 그대로. 드로어/부하 모두 read 범위. 신규 쓰기 없음.

---

## 5. DB 설계

**마이그레이션·DDL 변경 없음.** 읽기 전용 JOIN 쿼리(§3.2) 1건만 추가.

**참여이력 스키마 한계 & 대안 (명시)**:
- `projectusers` 에 **투입일/철수일(멤버별 기간) 컬럼이 없다**. `created_at`(등록 시각)은 있으나 "투입일" 의미로 신뢰 불가(대량 시드/이관 가능).
- **대안 채택**: 참여이력의 기간·종료는 **프로젝트 단위**로 표기 — `project.start_date`/`project.end_date` + `project_status_key`.
  - `closed` 판정(백엔드): `project_status_key` 가 종료계열이거나 `end_date < today`. (종료 status 키 목록은 `getProjectStatusListService().rows` 에서 판정 로직 확정 — status 엔티티에 종료 플래그가 없으면 `end_date < today` 단독 사용. backend 가 status 데이터 실측해 결정, 없으면 날짜 기준.)
- 멤버별 역할은 `projectusers.role_key`(존재) 사용 → roleName 라벨 해석.
- **후속(범위 밖)**: 멤버별 투입/철수 기간 정밀화가 필요하면 `projectusers` 에 `joined_at`/`left_at` 컬럼 추가(멱등 ALTER) — 이번 범위 아님.

---

## 6. i18n 키 목록

`locales/kr/resource.json` · `locales/en/resource.json` 에 추가(merge.js 로 병합, `ko-KR.json`/`en-US.json` 직접수정 금지).

| 키 | kr | en |
|----|----|----|
| `col.inProgress` | 진행중 | In progress |
| `col.remaining` | 남은 작업량 | Remaining |
| `profile.title` | 인력 상세 | Resource detail |
| `profile.section.load` | 부하 | Workload |
| `profile.section.inProgress` | 진행 중 작업 | In-progress work |
| `profile.section.experience` | 경험 | Experience |
| `profile.load.count` | 진행중 이슈 | In-progress issues |
| `profile.load.remaining` | 남은 작업량 | Remaining estimate |
| `profile.load.hours` | {n}시간 | {n}h |
| `profile.load.tip` | 여러 명이 참여한 이슈는 남은 작업량을 참여 인원으로 균등 분할한 1인 기대 몫으로 계산합니다(근사치) | Shared issues split remaining estimate evenly across participants as an approximate per-person share |
| `profile.issue.status` | 상태 | Status |
| `profile.issue.project` | 프로젝트 | Project |
| `profile.issue.share` | 내 몫 | My share |
| `profile.issue.shared` | {total} · {count}명 공유 | {total} · shared by {count} |
| `profile.issue.due` | 마감 | Due |
| `profile.issue.participation.assignee` | 담당 | Assignee |
| `profile.issue.participation.coworker` | 협업 | Coworker |
| `profile.issue.empty` | 진행 중인 작업이 없습니다 | No in-progress work |
| `profile.history.title` | 프로젝트 참여 이력 | Project history |
| `profile.history.role` | 역할 | Role |
| `profile.history.period` | 기간 | Period |
| `profile.history.status` | 상태 | Status |
| `profile.history.closed` | 종료 | Closed |
| `profile.history.ongoing` | 진행중 | Ongoing |
| `profile.history.empty` | 참여 이력이 없습니다 | No participation history |
| `match.load` | 현재 부하 | Current load |
| `match.inProgress` | 진행중 | In progress |
| `match.remaining` | 남은 작업량(1인 몫) | Remaining (per person) |
| `match.remaining.tip` | 여러 명이 참여한 이슈는 참여 인원으로 균등 분할한 1인 기대 몫입니다(근사치) | Shared issues are split evenly across participants (approximate per-person share) |

> `resource.band.*` / `resource.util.*` / `SkillTags` / `UtilBadge` 기존 키는 재사용.

---

## 7. 구현 작업 분해

### Backend
- [ ] `ResourceLoadFetcher.js` 신규 — `fetchInProgressIssuesForAccount(accountId)` (A, GET+페이지루프), `fetchInProgressLoadByAccounts(accountIds)` (B, POST/청크). asUser. coworker alias `movesRmsCoworkers` 무조건 포함. **균등 분할**: participantCount=(assignee?1:0)+coworkers.length, perHead=remaining÷participantCount, 건수는 분할 안 함. (A)는 이슈별 `issueRemainingEstimateSeconds`+`participantCount`+`remainingEstimateSeconds`(perHead) 반환. `fields=assignee` + `properties=movesRms` 로 참여자 수 확보.
- [ ] `postJiraJson` 의 `/search/jql` POST 지원 확인 → 미지원 시 GET+50청크+p-limit 폴백.
- [ ] `ProjectUsersQuery.FIND_HISTORY_BY_ACCOUNT` 추가(project JOIN).
- [ ] `ResourceManagementService.js`:
  - `getResourceProfileService({accountId})` — buildPeopleContext 재사용 + (A) + 이력쿼리 + role/status 라벨, `content` 반환, 부분성공 폴백.
  - `getResourceLoadSummaryService()` — findUsers + (B), `content` 반환.
  - `getProjectSkillMatchService` 강화 — (B) 병합 + rankCandidates 부하 반영, candidate 2필드 추가.
- [ ] `ResourceMatch.rankCandidates` 시그니처 유지, 정렬에 remaining/inProgress tiebreaker 추가 + jest 케이스.
- [ ] `ResourceManagementController.js` — guardedDefine 2건 추가.
- [ ] `PermissionMap.js` — `getResourceProfile`/`getResourceLoadSummary` = R('RESOURCE_MANAGEMENT').
- [ ] `src/index.js` 변경 불필요(등록 함수 기존 호출).

### Frontend
- [ ] `resourceKeys.js` — `profile`, `loadSummary` 추가.
- [ ] `useResourceProfile.js` / `useResourceLoadSummary.js` 신규(`res.content` 소비, Map 변환).
- [ ] `ResourceProfileDrawer.jsx` + `LoadSummaryCards`/`InProgressIssueList`/`ProjectHistoryList` 신규.
- [ ] `ResourceOverviewTab.jsx` — drawer 상태 + loadSummary 병합 주입.
- [ ] `ResourceOverviewTable.jsx` — 로우 클릭 → 드로어, 진행중/남은작업량 컬럼(lazy).
- [ ] `CandidateRankTable.jsx` — 부하 컬럼 2개 추가(서버 결합값 소비).
- [ ] i18n 키 추가 후 `cd static/ui && npm run merge`.

---

## 8. 열린 질문 / 가정

1. **종료 프로젝트 판정 기준**: status 엔티티에 "종료" 플래그가 없다면 `end_date < today` 단독 사용(가정). backend 가 `getProjectStatusListService().rows` 실측해 종료계열 status 키가 있으면 우선 적용.
2. **협업자 부하 귀속 (사용자 승인 확정)**: 이슈 남은작업량을 **참여 인원(assignee 있으면1 + coworkers 수)으로 균등 분할**한 1인 기대 몫을 각 참여자에 계상. 진행중 **건수는 분할하지 않음**(관여 1건=1건). 사람별 실제 기여도 데이터가 없어 **균등 가정 = 근사치**(UI InfoTip 명시). (A)·(B) 페처 동일 적용. 드로어 이슈 목록은 원본(`issueRemainingEstimateSeconds`) + `participantCount` 를 함께 내려 "9MD·3명 공유 → 내 몫 3MD" 표기.
3. **Overview 배치 부하 컬럼 (사용자 승인 확정)**: **항상 노출**. `getResourceLoadSummary` + Overview 진행중/남은작업량 컬럼 유지. 배치 집계도 위 균등 분할 규칙 적용. `getResourceLoadSummary` 는 **단일 배치 JQL**(등록자 전원 대상, N+1 아님)이며 lazy 비차단 로드라 Overview 진입 성능 영향 최소.
4. **`getResourceProfile` 의 buildPeopleContext 비용**: 전 인원 조립을 1인 드로어에 사용(온디맨드라 허용). 클릭 반응 지연이 문제되면 후속에서 1인 경량 경로 분리(범위 밖).
5. **postJiraJson POST /search/jql 지원**: 미확인 → backend 착수 시 실측(§3.1 폴백 명시).
