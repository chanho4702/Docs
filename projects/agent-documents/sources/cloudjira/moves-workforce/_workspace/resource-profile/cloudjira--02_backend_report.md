# Resource Profile — 백엔드 구현 리포트

> frontend-engineer 는 이 문서의 **실제 응답 shape** 을 단일 진실로 소비한다. 설계서 §2 계약과 일치 여부/이탈을 아래 명시.

## 1. 구현한 resolver 함수 + 실제 응답 shape

모두 `responseWrapper` 로 감싸져 성공 시 `{ success:true, ...result }`, 실패 시 `{ success:false, error:{name,code,message,cause} }` 로 직렬화된다. 신규 3종은 전부 조립조회 → **`res.content`** 로 접근.

프론트 invoke 결과 접근 경로: `invoke('fn', payload)` → `res.content.*`.

### 1.1 `getResourceProfile` (신규) — 드로어 온디맨드

- 입력 payload: `{ accountId }`
- 권한: `R('RESOURCE_MANAGEMENT')`
- 등록: `guardedDefine(resolver, 'getResourceProfile', ({ payload }) => getResourceProfileService(payload))`
- `accountId` 누락 → `LogicalError(ErrorCodes.USER_ID_REQUIRED)` throw.

**실제 성공 응답 (`res.content`):**
```jsonc
{
  "profile": {
    "accountId": "string",
    "displayName": "string",        // person 없으면 accountId 로 폴백
    "avatarUrls": { "24x24": "url" } | null,
    "roleName": "string" | null,
    "levelName": "string" | null
  },
  "load": {
    "inProgressCount": 3,               // 진행중 이슈 관여 건수(정수, 분할 안 함) = inProgressIssues.length
    "remainingEstimateSeconds": 144000, // Σ(이슈별 1인 기대 몫). 정수 아님(나눗셈 결과, 소수 가능)
    "util": 0.82 | null,                // person.util (rollup 재사용, 신규 페치 없음)
    "utilBand": "idle|normal|over|red|unknown"  // person 없으면 "unknown"
  },
  "inProgressIssues": [                  // updated DESC 정렬. 페치 실패 시 [] (부분성공)
    {
      "issueKey": "PRJ-123",
      "summary": "string",
      "statusName": "In Progress" | null,
      "projectName": "string" | null,
      "issueTypeName": "string" | null,
      "issueRemainingEstimateSeconds": 216000,  // 분할 전 원본(초)
      "participantCount": 3,                     // (assignee?1:0)+coworkers.length, 최소 1
      "remainingEstimateSeconds": 72000,         // 1인 기대 몫 = 원본 ÷ participantCount
      "dueDate": "2026-07-30" | null,
      "participation": "assignee" | "coworker"
    }
  ],
  "experience": {
    "skills": [ { "id": "string", "name": "string", "category": "string" } ],  // person.skills 재사용, 없으면 []
    "projectHistory": [                  // p.start_date DESC. 종료 프로젝트 포함
      {
        "projectId": "uuid-string",      // BIN_TO_UUID
        "projectName": "string" | null,
        "roleName": "string" | null,     // role_key → roleName 라벨(getRoleList)
        "projectStatusKey": "string" | null,
        "projectStatusName": "string" | null,  // status.rows 라벨 해석
        "startDate": "2026-01-01" | null,
        "endDate": "2026-06-30" | null,
        "closed": true | false           // 백엔드 판정(아래 §3)
      }
    ]
  }
}
```
→ **설계서 §2.1 계약과 완전 일치.**

### 1.2 `getResourceLoadSummary` (신규) — Overview 배치 부하 컬럼

- 입력 payload: 없음 (`{}`)
- 권한: `R('RESOURCE_MANAGEMENT')`
- 등록: `guardedDefine(resolver, 'getResourceLoadSummary', () => getResourceLoadSummaryService())`

**실제 성공 응답 (`res.content`):**
```jsonc
{
  "load": [
    { "accountId": "string", "inProgressCount": 2, "remainingEstimateSeconds": 90000 }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z"   // new Date().toISOString()
}
```
- 진행중 이슈 0건인 사람은 **배열에서 생략**됨 → 프론트는 `Map(accountId→load)` 로 병합, 없으면 `{inProgressCount:0, remainingEstimateSeconds:0}` 취급(설계 §2.2 지침 그대로).
- `remainingEstimateSeconds` 는 나눗셈 결과라 정수 아닐 수 있음(소수 가능).
→ **설계서 §2.2 계약과 완전 일치.**

### 1.3 `getProjectSkillMatch` (강화) — candidate 부하 결합

- 입력 payload: `{ projectId }` (기존 유지)
- 권한: `R('RESOURCE_MANAGEMENT')` (기존 유지)
- 등록: 기존 유지(서비스 내부만 강화)

**실제 성공 응답 (`res.content`)** — 기존 필드 전부 유지 + candidate 에 **2필드 추가**:
```jsonc
{
  "projectId": "string",
  "projectName": "string" | null,
  "requiredSkills": [ { "id, name, category" } ],
  "candidates": [
    {
      "accountId": "string",
      "displayName": "string",
      "avatarUrls": {...} | null,
      "roleName": "string" | null,
      "levelName": "string" | null,
      "util": 0.5 | null,
      "utilBand": "idle|normal|over|red|unknown",
      "available": true|false,
      "coverage": 0.66,
      "score": 66,
      "matchedCount": 2,
      "requiredCount": 3,
      "matchedSkills": [ { "id", "name" } ],
      "missingSkills": [ { "id", "name" } ],
      "inProgressCount": 2,               // ★ 신규 — 미상 시 0
      "remainingEstimateSeconds": 90000   // ★ 신규 — 미상 시 0(소수 가능)
    }
  ]
}
```
- `candidates` 정렬: `rankCandidates` — **coverage desc → util asc → remainingEstimateSeconds asc → inProgressCount asc → displayName asc**. coverage 최우선 유지, 부하는 tiebreaker.
- **하위호환**: 기존 프론트는 새 2필드를 무시하면 그대로 동작(안전).
→ **설계서 §2 계약과 완전 일치.**

## 2. 열린 질문 실측 결과

### 2.1 `postJiraJson` 의 POST `/rest/api/3/search/jql` 지원 여부 → **지원함. 설계 primary(POST) 채택.**
- `src/api/jira/util/RequestJiaJson.js` 의 `postJiraJson` 은 `client.requestJira(url, { method:'POST', headers:{Accept, Content-Type:application/json}, body: JSON.stringify(body) })` 로 **임의 JSON 본문 POST** 를 수행한다. `/search/jql` POST 엔드포인트는 body `{ jql, fields, properties, maxResults, nextPageToken }` 를 받는 공식 엔드포인트 → 그대로 사용 가능.
- **결정**: 배치(B) `fetchInProgressLoadByAccounts` 는 **POST + postJiraJson** 로 구현(URL 길이 회피). GET+청크 폴백은 **미채택**(불필요). 단 accountId 다수 대비 **50개 청크 + p-limit(3)** 병렬은 그대로 적용해 POST 본문 JQL 과대 방지.
- 페처(A) 드로어용은 설계대로 **GET + nextPageToken 루프**(requestJiraJson).

### 2.2 종료 프로젝트 판정(§8-1) → **status 키/이름 우선 + `end_date < today` 폴백(복합)**
- 실측: `getProjectStatusListService().rows` 의 status 엔티티는 `{ id, name, color, order }` 뿐 — **"종료" 전용 플래그(category/closed) 없음**. 단 시드(`SeedData.js`)에 종료계열 status `status-done`(name `DONE`)이 존재.
- **채택한 판정** (`isProjectClosed`):
  1. `projectStatusKey ∈ {'status-done'}` (시드 종료 키) → closed
  2. `projectStatusName` 이 `/(done|closed?|complete|completed|finish|finished|종료|완료|마감)/i` 매칭 → closed (커스텀 종료 status 대비 이름 휴리스틱)
  3. 위 미해당 시 `end_date < today`(yyyy-mm-dd 문자열 비교) → closed
- 설계 §5/§8-1 "종료 status 키가 있으면 우선, 없으면 날짜 단독" 을 **복합(키+이름+날짜)** 으로 구현. status 이름은 사용자가 바꿀 수 있어 키(status-done)와 이름 키워드를 함께 봄.

## 3. 설계 대비 이탈 / 특기사항

- **계약 이탈 없음.** 3종 응답 shape 모두 §2 / §2.1 / §2.2 와 글자 그대로 일치.
- **배치(B) 청크 이중계상 방지 로직**: 각 청크는 **자기 청크 집합(chunkSet) 내 참여자만** 계상. 청크는 disjoint 이고 참여자는 assignee/coworker 어느 쪽이든 자기 청크 JQL 로 반드시 매칭되므로 정확히 1회 계상됨(글로벌 set 사용 시 assignee가 다른 청크 쿼리에도 잡혀 이중계상되는 버그를 회피). 이슈별 참여자는 `Set` 으로 중복 제거(assignee가 coworkers에도 있는 엣지 방어).
- **부분 성공 폴백**: (A) 페처 try/catch → `[]`; (B) 청크별 try/catch → 해당 청크만 빈 Map(다른 청크 유지); 전체 실패 → 빈/부분 Map. `getResourceProfile`/`getProjectSkillMatch`/`getResourceLoadSummary` 모두 Jira 실패해도 throw 안 하고 0/빈배열로 폴백(스킬/이력/util 은 살림). `accountId`/`projectId` 누락만 throw.
- **소수값 주의(프론트 표기)**: `remainingEstimateSeconds`(1인 기대 몫 합/배치 합/candidate)는 나눗셈 결과라 정수가 아닐 수 있음. 프론트는 `Math.round(s/3600)` 등으로 시간 변환(설계 §4.4 지침대로) → 표기 시 반올림 권장.
- **성능 준수**: 공통 이슈 페처 **미수정**(신규 `ResourceLoadFetcher.js` 격리). 가동률은 `buildPeopleContext` 내 `getRollupMeta` 1회 read 재사용 — **신규 워크로그 페치 없음**. `getProjectSkillMatch` 의 부하 결합은 후보 전원 **배치 1회**(N+1 아님). DDL 마이그레이션 없음(읽기 JOIN만).
- `movesRmsCoworkers` alias 무조건 포함(coworkerFieldId 조회 생략) — 팀 관리형 프로젝트 포함 커버.

## 4. 변경/신규 파일

| 파일 | 변경 |
|------|------|
| `src/resolver/resourceManagement/ResourceLoadFetcher.js` | **신규** — `fetchInProgressIssuesForAccount(accountId)`(A, GET 루프), `fetchInProgressLoadByAccounts(accountIds)`(B, POST+50청크+p-limit(3)). 균등 분할. |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_HISTORY_BY_ACCOUNT` 추가(project JOIN, 종료 포함, start_date DESC). |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `getResourceProfileService`/`getResourceLoadSummaryService` 신규, `getProjectSkillMatchService` 강화(부하 결합), `isProjectClosed`/`toYmd` 헬퍼. |
| `src/resolver/resourceManagement/ResourceMatch.js` | `rankCandidates` 부하 tiebreaker 추가(remaining/inProgress). |
| `src/resolver/resourceManagement/ResourceManagementController.js` | `guardedDefine` 2건(`getResourceProfile`, `getResourceLoadSummary`) 추가. |
| `src/permission/PermissionMap.js` | `getResourceProfile`/`getResourceLoadSummary` = `R('RESOURCE_MANAGEMENT')`. |
| `src/resolver/resourceManagement/__test__/ResourceMatch.test.js` | 부하 tiebreaker jest 케이스 4건 추가. |
| `src/index.js` | **변경 없음**(`registerResourceManagementController` 기존 호출). |

## 5. 테스트 결과 (`npm test`, 루트 jest)

```
Test Suites: 14 passed, 14 total
Tests:       223 passed, 223 total   (직전 219 + rankCandidates 부하 tiebreaker 4 케이스)
Snapshots:   0 total
Time:        ~12 s
```
신규 부하 tiebreaker 케이스 및 `permissionMap.contract.test.js`(등록집합 ↔ 맵키 대조) 포함 전부 통과 → 컨트롤러 2건 등록 ↔ PermissionMap 2키 정합 확인됨.
