# 자원관리 Overview 테이블 재구성 (resource-profile v2) — 델타 설계서

> **v1 위에 얹는 델타.** 기준 문서 `01_architect_design.md`(통과 완료). 여기 명시 없는 것은 전부 **v1 유지**.
> 요구: `_workspace/resource-profile/00_input/requirement_v2_columns.md`
> 대상: Overview 테이블 컬럼 전면 재구성 + `getResourceLoadSummary` 확장. **드로어/Match 계약은 v1 유지**(단 드로어 load는 §3.4 선택 확장).

---

## 1. 영향 범위 (델타)

| 축 | v1 | v2 변경 |
|----|----|--------|
| 백엔드 페처 | `fetchInProgressLoadByAccounts`(In Progress만), `fetchInProgressIssuesForAccount` | **둘 다 유지(불변)**. 신규 `fetchAssignedLoadByAccounts`(전체 할당 이슈, 상태별 집계) 추가 |
| 백엔드 서비스 | `getResourceLoadSummaryService` = 진행중 부하 배치 | 전체 할당 이슈 집계로 **확장**(상태별 카운트+spent/remaining+완수율). `getResourceProfileService` load 선택 확장(§3.4) |
| 백엔드 쿼리 | `FIND_HISTORY_BY_ACCOUNT`(1인) | 신규 `FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`(전원, 참여중 프로젝트 수) |
| 순수함수 | — | 신규 `isProjectClosed(endDate)` (end_date 기준, v1 history `closed` 판정도 이걸로 정리 가능) |
| 프론트 테이블 | 인력·직무·등급·가동율·투입가능·스킬·작업 | **인력·직무·등급·가동율·할당이슈(할일/진행/완료)·참여프로젝트수·완수율**. 스킬/편집/available 컬럼 제거 |
| 프론트 드로어 | 스킬 표시 | 스킬 **편집 진입점** 추가(UserSkillEditModal 재사용) |
| DB | — | **마이그레이션 없음**(읽기 JOIN 쿼리 1건 추가) |
| i18n | resource.json | `col.*`/`overview.issues.*`/`overview.completion.*` 키 추가 |
| 계약 컨벤션 | 조립조회=`res.content` | 유지 |

**하위호환**: `getProjectSkillMatch`는 v2 변경 대상 아님 → `fetchInProgressLoadByAccounts`(In Progress only) **절대 미수정**(Match candidate.inProgressCount/remaining 회귀 방지). Overview만 신규 all-status 페처로 갈아탄다.

---

## 2. 경계면 계약 (변경분만 — 글자 그대로 확정)

컨벤션: 조립조회 = **`res.content`**.

| resolver 함수 | 입력 payload | 응답 shape (success) | 대응 프론트 훅/쿼리키 |
|--------------|-------------|----------------------|----------------------|
| `getResourceLoadSummary` (**확장**) | `{}` | `{ success, content: { load: [ LoadRow ], generatedAt } }` — LoadRow shape 확장(아래) | `useResourceLoadSummary()` / `resourceKeys.loadSummary()` (v1 유지, shape 확장) |
| `getResourceProfile` (**선택 확장**) | `{ accountId }` | v1 shape 유지 + `content.load` 에 상태별 카운트/완수율/projectCount 추가(§3.4) | `useResourceProfile(accountId)` / `resourceKeys.profile(accountId)` (v1 유지) |
| `getProjectSkillMatch` | `{ projectId }` | **v1 그대로 (변경 없음)** | v1 유지 |

### 2.1 `getResourceLoadSummary` content — 확정 shape

```jsonc
{
  "load": [
    {
      "accountId": "string",
      "todoCount": 2,             // statusCategory.key === 'new'          (관여 건수, 분할 안 함)
      "inProgressCount": 3,       // statusCategory.key === 'indeterminate'(관여 건수, 분할 안 함)
      "doneCount": 5,             // statusCategory.key === 'done'         (관여 건수, 분할 안 함; §3.1 기간 한정)
      "projectCount": 4,          // project_users 활성(미종료) 참여 프로젝트 수 (§3.3)
      "spentSeconds": 360000,     // Σ (timeSpentSeconds ÷ 참여자 수)   = 1인 기대 몫 합
      "remainingSeconds": 90000,  // Σ (remainingEstimateSeconds ÷ 참여자 수) = 1인 기대 몫 합
      "completionRate": 0.8       // spentSeconds / (spentSeconds + remainingSeconds), 분모 0 → null
    }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z"
}
```
- 진행중/할일/완료 이슈가 하나도 없는 사람은 배열에서 생략 가능 → 프론트는 `Map(accountId→LoadRow)` 병합, 없으면 전 필드 0 / `completionRate:null` 취급.
- **`completionRate`**: `0~1` 실수 또는 `null`(분모 0). 프론트가 `×100` 하여 % 표기. (v1 remainingEstimateSeconds 필드명과 구분: v2 배치는 `spentSeconds`/`remainingSeconds` 로 명명 — v1 In-Progress 배치의 `remainingEstimateSeconds` 와 혼동 방지.)

**실패/폴백**: Jira 검색 실패 → 해당 배치 0/빈 폴백(로그만, throw 안 함). projectCount 쿼리 실패 → 0 폴백. 부분 성공 허용(v1 원칙).

---

## 3. 백엔드 설계 (델타)

### 3.1 신규 배치 페처 — `ResourceLoadFetcher.js` 에 `fetchAssignedLoadByAccounts(accountIds)` 추가

v1의 In-Progress 페처는 그대로 두고, **전체 할당 이슈** 배치 함수를 추가한다(공통 경로 미수정, 전용 페처 내부 확장 [[feedback-worklog-fetch-isolation]]).

**할당 정의**(v1과 동일): `assignee` OR `movesRmsCoworkers`(searchAlias).
**상태 확장**: `statusCategory = "In Progress"` 필터 **제거** → 전체 할당 이슈. 단 **Done 볼륨 한정**(§성능):

```
POST /rest/api/3/search/jql   (postJiraJson, as:'user')   ← URL 길이 회피
body: {
  jql: `(assignee in (${ids}) OR movesRmsCoworkers in (${ids}))
        AND (statusCategory != Done OR updated >= "-26w")`,   // 열린 이슈 전부 + Done은 최근 26주만
  fields: ["statusCategory","timetracking","assignee"],
  properties: ["movesRms"],
  maxResults: 100, nextPageToken 루프(1패스)
}
```
- accountIds 다수로 본문 JQL 과대 시 50개 청크 + `p-limit(3)` 병렬, 결과 Map merge.

**이슈별 집계**:
```
cat  = issue.fields.statusCategory?.key            // 'new' | 'indeterminate' | 'done'
spent= issue.fields.timetracking?.timeSpentSeconds ?? 0        // Jira가 워크로그 합산 자동 유지 → 개별 페치 없음
rem  = issue.fields.timetracking?.remainingEstimateSeconds ?? 0
cow  = issue.properties.movesRms?.coworkers ?? []
participantCount = (issue.fields.assignee ? 1 : 0) + cow.length     // 최소 1 보정
perSpent = participantCount>0 ? spent/participantCount : spent
perRem   = participantCount>0 ? rem/participantCount   : rem
대상 집합 내 각 참여자(assignee.accountId + coworkers)에 가산:
  cat==='new'           → todoCount++
  cat==='indeterminate' → inProgressCount++
  cat==='done'          → doneCount++
  spentSeconds     += perSpent
  remainingSeconds += perRem
→ Map(accountId → { todoCount, inProgressCount, doneCount, spentSeconds, remainingSeconds })
```

**statusCategory.key 매핑**(Jira 표준, IssueAnalysisService 확인): `new`=할일(To Do), `indeterminate`=진행(In Progress), `done`=완료(Done).

### 3.2 균등 분할 vs 완수율 (혼선 방지 — 명시)

- **이슈 건수(todo/inProgress/done)**: **관여 건수 = 분할 안 함**(정수). 1건은 1건.
- **spent/remaining**: v1 컨벤션대로 **참여자 수 균등 분할(1인 기대 몫)** 합산.
- **완수율은 분할과 무관**: `completionRate = Σ(spent/n) / (Σ(spent/n) + Σ(rem/n))`. 각 이슈가 같은 `n`(참여자 수)으로 분자·분모에 동시에 들어가므로 **분할해도 미분할해도 값 동일**(비율 불변). → 완수율 자체는 분할 이슈가 아님. spent/remaining을 분할값으로 보관하는 이유는 "절대량 표기 시 v1과 일관"이며, 완수율 결과는 어느 쪽이든 같다.

### 3.3 참여중 프로젝트 수 — `ProjectUsersQuery.FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`

**소스 확정**: 할당 이슈의 distinct project가 아니라 **`project_users` 활성(미종료) 참여 프로젝트 수**(요구 "참여중인 프로젝트" 의미에 부합, buildPeopleContext 계열 재사용).

**종료 판정 확정**: 프로젝트 상태 엔티티(KVS)에 **종료 플래그가 없다**(실측: `{id,name,color,order}`뿐). 따라서 종료 = **`end_date` 기준**(PortfolioAggregator 의 `endDate <= today` 컨벤션과 일치). status-기반 종료 판정은 데이터가 없어 채택 불가.

신규 쿼리(bulk, account_id IN):
```sql
SELECT pu.account_id,
       COUNT(DISTINCT pu.project_id) AS active_project_count
FROM projectusers pu
JOIN project p ON p.project_id = pu.project_id
WHERE pu.account_id IN (?, ?, ...)
  AND (p.end_date IS NULL OR p.end_date >= CURDATE())   -- 활성(미종료)만
GROUP BY pu.account_id
```
- `INDEX(account_id)` 사용. 종료 판정을 SQL `end_date` 로 직접 처리 → status 라벨 조회 불필요(경량). 결과 `Map(accountId → active_project_count)`.

**신규 순수함수 `isProjectClosed(endDate, today = new Date())`** (jest 대상, `ResourceMatch.js` 또는 신규 `ResourceProjectStatus.js`):
```
isProjectClosed = (endDate) => endDate != null && new Date(endDate) < todayDateOnly
```
- SQL 로 이미 필터하므로 projectCount 엔 불필요할 수 있으나, v1 history `closed` 필드 산출(§v1 §5)을 이 함수로 일원화 권장(선택). 도입 시 v1 getResourceProfile의 `closed` 판정도 이걸 재사용.

### 3.4 서비스 변경

**`getResourceLoadSummaryService()`** (확장, `content` 반환):
```
1) findUsersRepository({}) → accountIds
2) Promise.all:
   - fetchAssignedLoadByAccounts(accountIds)          // §3.1 → Map(acc → 상태별+spent/rem)
   - executeQuery(FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS, accountIds) // §3.3 → Map(acc → count)
3) load = accountIds 중 데이터 있는 계정에 대해 LoadRow 조립:
     completionRate = (spent+rem) > 0 ? spent/(spent+rem) : null
     projectCount   = projectCountMap.get(acc) ?? 0
4) return { content: { load, generatedAt: new Date().toISOString() } }
```
- **성능**: Jira 배치 1회(all-status, Done 26주 한정) + SQL 1회. N+1 없음. rollup·워크로그 개별 페치 없음.

**`getResourceProfileService({ accountId })`** (v1 유지 + load 선택 확장):
- v1 그대로 `fetchInProgressIssuesForAccount(accountId)`로 **진행중 이슈 목록 유지**(드로어 "지금 뭐 하는지"는 In Progress만 — 확정, 변경 없음).
- **load 확장(권장·일관성)**: 추가로 `fetchAssignedLoadByAccounts([accountId])` 1회(단일 계정) + projectCount 쿼리 호출해, `content.load` 에 `todoCount/inProgressCount/doneCount/completionRate/projectCount` 추가. 기존 `inProgressCount`(=목록 length)·`remainingEstimateSeconds`(per-head)·`util`·`utilBand` 는 **유지**(하위호환).
  - 주의: `load.inProgressCount`(v1, 목록 length)와 all-status 배치의 inProgressCount 는 동일해야 정상(둘 다 In Progress 관여 건수). 값 일치 확인은 verifier 몫. 혼선 시 배치값을 신뢰(단일 소스).

### 3.5 Controller / 등록 / 권한
- `getResourceLoadSummary`·`getResourceProfile` **이미 등록/권한 매핑 존재**(v1) → Controller·`src/index.js`·`PermissionMap.js` **변경 없음**. 서비스 로직만 확장.

---

## 4. 프론트엔드 설계 (델타)

### 4.1 `ResourceOverviewTable.jsx` — 컬럼 전면 재구성

| 순서 | key | 헤더 i18n | 셀 렌더 |
|-----|-----|----------|--------|
| 1 | member | `resource.col.member` | UserAvatar (v1 유지) |
| 2 | role | `resource.col.role` | roleName (v1 유지) |
| 3 | level | `resource.col.level` | levelName (v1 유지) |
| 4 | util | `resource.col.util` | `<UtilBadge>` (v1 유지) |
| 5 | assigned | `resource.col.assignedIssues` | `할일 {todo} / 진행 {inProgress} / 완료 {done}` (3분할, loadMap) |
| 6 | projects | `resource.col.projectCount` | `{projectCount}` (loadMap) |
| 7 | completion | `resource.col.completion` | 프로그레스 바 + `{n}%` 또는 `-`(null) (loadMap) |

- **제거**: `skills`, `action`(스킬편집), `available` 컬럼. `SkillTags`/`UserSkillEditModal` import는 테이블에서 제거(드로어로 이동).
- **로우 클릭 → 드로어**: v1 유지.
- 5~7 컬럼은 `useResourceLoadSummary()` 의 `Map` 병합으로 **lazy hydrate**(테이블 즉시 렌더, 미도착 시 `-`/스켈레톤). 비차단.

### 4.2 완수율 프로그레스 바 — 신규 `CompletionBar.jsx`
- `@atlaskit/progress-bar` 설치 여부 확인(package.json) → 있으면 `<ProgressBar value={rate} />` + % 라벨. 없으면 커스텀 div 바(width `${rate*100}%`, 색: rate≥0.8 success / ≥0.4 info / <0.4 default, `null → '-'`).
- 입력: `completionRate`(0~1|null). 표기: `Math.round(rate*100)%`.

### 4.3 할당 이슈 셀 — 신규 `AssignedIssueCell.jsx`(또는 인라인)
- `할일 {todo} / 진행 {inProgress} / 완료 {done}`. 라벨은 i18n `overview.issues.todo/inProgress/done`(짧게). 0도 표기. In Progress 강조(굵게) 선택.

### 4.4 드로어 스킬 편집 진입점
- `ResourceProfileDrawer` 경험 섹션(스킬 표시, v1)에 **편집 버튼** 추가(`canWrite('RESOURCE_MANAGEMENT')` 게이트) → 기존 `UserSkillEditModal` 오픈(테이블에서 이동). 저장 성공 시 `resourceKeys.profile(accountId)` + `resourceKeys.overview()` invalidate.
- **드로어 load 표기 확장(선택, §3.4 채택 시)**: LoadSummaryCards 에 완수율/상태별 카운트 카드 추가 → Overview 와 일관.

### 4.5 `useResourceLoadSummary.js` — 반환 Map 필드 확장
- `res.content.load` → `Map(accountId → { todoCount, inProgressCount, doneCount, projectCount, spentSeconds, remainingSeconds, completionRate })`. 기본값(미존재): 전 카운트 0, `completionRate: null`.
- v1 대비 필드 확장만. `staleTime` 등 유지.

### 4.6 쿼리키
- 신규 없음. `resourceKeys.loadSummary()`/`profile()`/`overview()` v1 유지.

---

## 5. DB 설계 (델타)
- **마이그레이션·DDL 변경 없음.**
- 신규 읽기 쿼리 1건: `ProjectUsersQuery.FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS`(§3.3, projectusers⋈project, `end_date` 활성 필터, GROUP BY account).
- 종료 판정 = `end_date`(status 엔티티에 종료 플래그 부재 실측 → 날짜 기준 확정).

---

## 6. i18n 키 목록 (신규만)

`locales/kr/resource.json` · `locales/en/resource.json` 추가 후 `npm run merge`.

| 키 | kr | en |
|----|----|----|
| `col.assignedIssues` | 할당 이슈 | Assigned issues |
| `col.projectCount` | 참여 프로젝트 | Projects |
| `col.completion` | 완수율 | Completion |
| `overview.issues.todo` | 할일 | To Do |
| `overview.issues.inProgress` | 진행 | In progress |
| `overview.issues.done` | 완료 | Done |
| `overview.completion.none` | - | - |
| `overview.completion.tip` | 완수율 = 소비시간 ÷ (소비+남은작업량). 완료 이슈는 최근 6개월분만 집계 | Completion = spent ÷ (spent + remaining). Done issues counted for the last 6 months only |
| `overview.projectCount.tip` | 참여중(미종료) 프로젝트 수 | Number of active (not-ended) projects |

- 드로어 load 확장(§3.4) 채택 시 추가: `profile.load.completion`(완수율/Completion), `profile.load.todo`·`profile.load.done`(재사용 가능하면 `overview.issues.*` 공유).
- **제거 컬럼 관련 키**(`col.skills`/`col.action`/`col.available`/`available.*`)는 파일에 **남겨둠**(드로어/기타 재사용, 삭제 시 merge 회귀 위험 없음).

---

## 7. 구현 작업 분해 (델타)

### Backend
- [ ] `ResourceLoadFetcher.js` — `fetchAssignedLoadByAccounts(accountIds)` 신규. all-status JQL(`statusCategory != Done OR updated >= "-26w"`), asUser POST /search/jql, statusCategory.key 3분류 집계, spent/rem 균등 분할, coworker 참여자 수 산출. **기존 In-Progress 페처 2종 미수정.**
- [ ] `ProjectUsersQuery.FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS` 신규(bulk, end_date 활성 필터).
- [ ] `isProjectClosed(endDate)` 순수함수 + jest(경계: null/오늘/과거/미래).
- [ ] `getResourceLoadSummaryService` 확장 — 신규 배치 + projectCount 병합, completionRate 산출, `content.load[]` 확장 shape.
- [ ] (선택) `getResourceProfileService` load 확장 — 단일계정 배치 + projectCount 추가(진행중 이슈 목록은 In-Progress 유지).
- [ ] Controller/index/PermissionMap **변경 없음** 확인.

### Frontend
- [ ] `ResourceOverviewTable.jsx` — 컬럼 7종 재구성, skills/action/available 제거, loadMap 병합.
- [ ] `CompletionBar.jsx` 신규(@atlaskit/progress-bar 확인 → 폴백 div 바).
- [ ] `AssignedIssueCell` (인라인/컴포넌트) — 할일/진행/완료 3분할.
- [ ] `useResourceLoadSummary.js` — Map 필드 확장.
- [ ] `ResourceOverviewTab.jsx` — SummaryCard(available 집계 → 필요시 완수율/이슈 기반으로 재해석 or 유지) 검토, 스킬편집 모달을 드로어로 이관.
- [ ] `ResourceProfileDrawer` — 스킬 편집 버튼(canWrite) + (선택) load 확장 카드.
- [ ] i18n 키 추가 후 `cd static/ui && npm run merge`.

---

## 8. 반드시 다룬 설계 결정 (요구 §"반드시 다룰 설계 결정" 1~5)

1. **완료 이슈 범위 & 성능 (확정)**: JQL `AND (statusCategory != Done OR updated >= "-26w")`. **열린 이슈(할일/진행)는 전부**, **Done은 최근 26주(≈6개월) updated 만**. 근거: (a) 완수율 분모에 Done spent가 필요해 완전 제외 불가, (b) 전원 배치라 볼륨 민감 → 오래된 완료 이슈 대량 유입 차단, (c) "최근 6개월 완수율"이 현재 velocity 지표로 더 유의미. 대안(활성 프로젝트 소속 이슈만)은 사람별 프로젝트 목록이 달라 단일 배치 JQL 불가 → 기각. 창(window) 상수 `LOAD_DONE_WINDOW = '-26w'` 모듈화(조정 용이).
2. **균등 분할 vs 완수율 (명시)**: §3.2 — 이슈 건수는 관여 건수(분할 X), spent/remaining은 per-head 분할(v1 일관), 완수율은 분자·분모 동일 `n` 상쇄로 **분할 무관·값 불변**. 완수율은 "분할 이슈"가 아님.
3. **참여 프로젝트 수 소스 (확정)**: `project_users` 활성(미종료) 프로젝트 distinct 카운트(할당 이슈 distinct project 아님). 종료 = `end_date`(status 종료 플래그 부재 실측). §3.3.
4. **드로어 load 확장 (확정: 채택 권장)**: `getResourceProfile.content.load` 에 상태별 카운트+완수율+projectCount 추가(Overview 일관성). **드로어의 진행중 이슈 목록(inProgressIssues)은 In Progress만 유지**(변경 없음) — "지금 뭐 하는지"의 의미 보존.
5. **페처 공존 (확정)**: 기존 `fetchInProgressLoadByAccounts`/`fetchInProgressIssuesForAccount`(In Progress only) **불변** → Match(getProjectSkillMatch)·드로어 목록 회귀 방지. Overview 배치는 신규 `fetchAssignedLoadByAccounts`(all-status)로 분리. statusCategory 조건 변경은 **신규 함수 안에서만**(공통·기존 경로 미수정).

## 9. 열린 질문 / 가정
- **`updated >= "-26w"` 상대일자 JQL**: Jira JQL 상대일자 함수 문법(`-26w`) 유효 가정(표준). backend 착수 시 실측, 문제 시 절대일자(오늘−180일 ISO) 계산으로 폴백.
- **statusCategory.key 값**: `new`/`indeterminate`/`done` 3종 가정(IssueAnalysisService 실측). 커스텀 status라도 statusCategory는 이 3종으로 귀속됨(Jira 보장).
- **SummaryCard(상단 요약)**: v1은 available 밴드 집계. available 컬럼 제거 후 상단 요약을 유지할지/완수율·이슈 기반으로 바꿀지는 프론트 재량(요구 미지정). 최소 total 유지, idle/over는 utilBand 기반이라 그대로 둬도 무방(밴드는 rollup 유지).
- **드로어 load 확장 시 배치 2회 호출**(목록 In-Progress + 단일계정 all-status): 온디맨드(클릭당)라 허용. 부담 시 all-status 한 번으로 목록까지 재구성 가능하나 목록 의미(In Progress) 유지 위해 분리 권장.
