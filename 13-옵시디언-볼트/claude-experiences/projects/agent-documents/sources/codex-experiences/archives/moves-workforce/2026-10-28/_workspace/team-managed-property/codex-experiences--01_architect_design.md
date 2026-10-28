# 팀 관리형 프로젝트 지원 — 코워커·등록일·등록자 이슈 프로퍼티 이전 설계서

- 날짜: 2026-07-14 · 브랜치: RFC-155
- 입력: `_workspace/team-managed-property/00_input/requirement.md` (§3 PoC 확정 제약은 전제)
- 근거 PoC: `claude-experiences/projects/moves-workforce/2026-07-14-team-managed-poc.md`

---

## 0. 설계 전에 확정한 핵심 사실 (코드 실측)

설계를 좌우하는 3가지를 코드에서 직접 확인했다. 구현자·검증자는 이 전제를 기준으로 판단한다.

1. **`searchIssueWithJQL`은 백엔드 resolver가 아니다.** 프론트 `static/ui/src/utils/jiraApi/requestJira.js`의 `REQUEST_MAP.searchIssueWithJQL` = `POST /rest/api/3/search/jql`을 `@forge/bridge`의 `requestJira`로 **직접** 호출한다. `executeRequest`의 `requestOption`이 `body = JSON.stringify(param)`이므로 **`param`에 `properties: ["movesRms"]`를 추가하면 POST 바디에 그대로 실려 별도 래퍼 수정이 전혀 필요 없다.** (요구사항 §6의 "백엔드 searchIssueWithJQL resolver가 properties를 통과시키는지"는 → 해당 resolver가 존재하지 않음. 프론트 param에 추가로 해결.)
2. **coworker의 현재 데이터 형태는 "Jira user 객체 배열"이다.** 모든 소비처가 `issue.fields[coworkerFieldId]`를 `[{accountId, displayName, avatarUrls}]`로 읽는다(표시용 아바타/이름 포함). 프로퍼티는 **accountId 배열만** 저장하므로, 표시가 필요한 모든 지점에 **사용자 정보 resolve 단계가 새로 필요**하다. 이것이 본 작업의 최대 난점이다.
3. **coworker 소비처는 "표시가 필요한 곳"과 "카운트만 필요한 곳"으로 갈린다.**
   - 표시 필요(user 객체): ProjectIssueTable, WorklogModal, GanttMapper, IssueAnalysisService, ProjectDashboard 담당자/이슈 차트(getAssigneeStats includeCoworker).
   - 카운트만 필요(accountId 배열 길이면 충분): ProgressCalculator/ProjectCost/PortfolioAggregator의 `totalWorkers`, getIssueParticipantStats의 참여자 Set.
   - → 카운트만 필요한 곳은 **사용자 lookup 불필요**(accountId[].length). 이 구분으로 N+1과 불필요한 bulk 호출을 줄인다.

---

## 1. 개요 / 영향 범위

### 백엔드
- **신규 모듈** `src/api/jira/issue/IssuePropertyApi.js` — 프로퍼티 read/write/**read-merge-write** 헬퍼 + 상수(`MOVES_PROPERTY_KEY='movesRms'`).
- **신규 모듈** `src/api/jira/issue/CoworkerResolver.js` — 여러 이슈의 프로퍼티 coworker accountId를 **1회 bulk로** user 객체로 resolve(N+1 금지). `getBulkJiraUsersApi` 재사용.
- **신규 resolver 2종**:
  - `updateIssueCoworkers` (코워커 전용 갱신, read-merge-write)
  - `runFieldToPropertyMigration` (관리자 수동 트리거, 페이징 배치)
- **계약 전환 resolver 1종**: `recordIssueAssignedDate` (필드 write → 프로퍼티 write, 가드를 프로퍼티 기준으로).
- **read 경로 전환(내부)**: `src/api/jira/issue/IssueApi.js`의 6개 페처가 `fields=...coworkerFieldId` 대신 `&properties=movesRms`를 붙이고 `issue.properties.movesRms.coworkers`를 읽도록. 소비 서비스(issueAnalysis/projectProgress/projectCost/portfolioDashboard/projectDashboard/gantt/myWork/projectCalendar)는 coworker 형태 변경(user객체 → accountId[])에 맞춰 조정.
- **신규 컨트롤러 등록**: `updateIssueCoworkers`는 기존 `ProjectUsersController`에 추가, `runFieldToPropertyMigration`는 신규 `MigrationController` 또는 기존 컨트롤러에 추가 후 `src/index.js` 등록.
- **PermissionMap 신규 키 2개** 등록(deny-by-default이므로 필수).
- **삭제**: `src/poc/entityPropertyPoc.js`, `src/poc/` 디렉토리.

### 프론트
- **신규 공통 유틸** `static/ui/src/utils/jiraApi/coworkerProperty.js` — `getIssueCoworkerIds(issue)`(프로퍼티에서 accountId[] 추출) + 프론트 전 소비처가 공유. 표시 resolve는 기존 `useUserInfos`(bulk) 재사용.
- **전환 소비처**: ProjectIssueTable(표시+편집), WorklogModal(표시), taskHistory(transform/Page/Table), + `searchIssueWithJQL`/`getIssue` 직접 호출에 `properties` 추가.
- **JQL alias 치환**: myWork 계열 3곳 + taskHistory ORDER BY.
- **쿼리키 팩토리**: 신규 서버상태 없음(기존 projectKeys.taskHistory 재사용). coworker 갱신은 mutation(무효화 대신 서버응답 기반 단일행 패치 — 기존 패턴 유지).

### DB
- **변경 없음.** MySQL/KVS 스키마 무변경. 저장소는 Jira 이슈 프로퍼티(Jira측). manifest `storage.entities` 무변경.

### i18n
- 마이그레이션 관리자 UI 문자열만 신규(§8). coworker 표시/편집은 기존 문자열 재사용.
- 신규 파일: `locales/kr/migration.json` + `locales/en/migration.json`.

### manifest
- `jira:entityProperty`(movesRms, alias 3종) 추가, PoC 블록 3개 제거(§4).

---

## 2. 경계면 계약 (가장 중요)

> 프로퍼티 스키마(모든 계약의 기반):
> ```json
> { "coworkers": ["<accountId>", ...],
>   "assignedAt": "2026-07-14",                        // date-only, 인덱스용
>   "assignedAtIso": "2026-07-14T12:34:56.000+0900",   // ISO, 표시용
>   "assignedById": "<accountId>" }
> ```
> 키: `movesRms`. GET `/issue/{id}/properties/movesRms` → `{key, value:{...}}` (미설정 시 404). search 응답 → `issue.properties.movesRms` (미설정 시 `properties:{}`).

### 2-1. 신규/변경 백엔드 resolver

| resolver 함수 | 입력 payload | 응답 shape (responseWrapper 통과 후) | 대응 프론트 |
|---|---|---|---|
| **updateIssueCoworkers** (신규) | `{ issueId, accountIds: string[] }` (issueId = 숫자 이슈 id 또는 key) | `{ success:true, content:{ issueId, coworkers: string[] } }` (write 후 저장된 accountId[]) | ProjectIssueTable `updateCoworker` → `invoke('updateIssueCoworkers', {issueId, accountIds})` |
| **recordIssueAssignedDate** (계약 전환) | `{ issueIds: string[] }` (기존 `assignedDateFieldId`/`assignedByFieldId`는 **무시**; 프론트가 계속 보내도 무해) · `accountId`는 context에서 서버 취득 | `{ success:true, recorded:number, skipped:number }` (기존 shape 유지) | IssueAddModal `submit` → `invoke('recordIssueAssignedDate', {issueIds})` (필드 id 인자 제거 권장, 남겨도 동작) |
| **runFieldToPropertyMigration** (신규) | `{ nextPageToken?: string\|null, pageSize?: number(기본 50) }` | `{ success:true, content:{ scanned, migrated, skipped, failed, nextPageToken: string\|null, done: boolean } }` | (관리자) SettingPage 마이그레이션 버튼 → `nextPageToken`가 null 될 때까지 반복 invoke |

> **updateIssueCoworkers 상세**: read-merge-write. 이슈 프로퍼티를 GET(asApp) → `{...prev, coworkers: accountIds}` 병합 → PUT(asApp). `assignedAt/assignedAtIso/assignedById` 등 다른 필드 보존. 빈 배열이면 `coworkers:[]`로 저장(해제). write 후 프론트는 `searchByIssueId`(단건 GET+properties, **직접 read라 인덱스 지연 없음**)로 갱신 — 서버응답 기반 재조회 원칙 유지.

### 2-2. 계약 유지(변경 없음, 내부만 전환) — coworker 소비 resolver

아래는 **resolver 응답 shape은 그대로**이고 내부 read만 fields→properties로 바뀐다(프론트 계약 무변경). 검증자는 응답 shape 회귀만 확인하면 된다.

| resolver | 응답 내 coworker 관련 필드 | 전환 후 내부 처리 |
|---|---|---|
| `getIssueAnalysisList` / `downloadIssueAnalysisExcel` | `issue.coworkers:[{accountId,displayName,avatarUrl}]`, `totalWorkers` | 프로퍼티 accountId[] → 페이지 단위 1회 bulk resolve로 user 부착. `totalWorkers=assignee?1:0 + accountIds.length` |
| `getProjectGanttData` | `Task.coworkers:[user객체]` | 동일 — GanttMapper가 accountId[]→user객체(bulk resolve) |
| `getProjectProgressSummary` / `getProjectCostSummary` / `getPortfolioDashboard` | (coworker 미노출, `totalWorkers` 카운트만) | accountId[].length만 사용. **bulk resolve 불필요** |
| `getChartDataById`(assignee/issue 차트) | 참여자 카운트/이름 | getIssueParticipantStats=카운트만(resolve 불요), getAssigneeStats includeCoworker=이름/아바타 필요(bulk resolve) |
| `getProjectWorklog` / `getMyIssueList` / `getProjectCalendarWorklog` | 이슈 raw pass-through에 `issue.properties.movesRms` 포함(properties 파라미터로) | 프론트가 `issue.properties.movesRms.coworkers`+`useUserInfos`로 표시(2-3) |

### 2-3. 프론트 공통 coworker 소비 패턴 (전 소비처 통일 — 요구사항 §3 핵심)

모든 프론트 coworker 표시는 아래 3단계로 통일한다:
```
1) accountIds = getIssueCoworkerIds(issue)   // = issue.properties?.movesRms?.coworkers ?? []
2) const { data: users } = useUserInfos(accountIds)   // 기존 훅(bulk, 캐시 staleTime 10m) — 페이지/모달당 1회
3) userMap[accountId] → <AvatarStack users={...}/> / <Select defaultValue={...}/>
```
- `getIssueCoworkerIds`는 신규 `coworkerProperty.js`에 단일 정의(소비처가 인라인 접근하지 않도록).
- `useUserInfos`는 이미 `['jiraUserInfos', ids]` 캐시 + normalize(중복제거/정렬) → **동일 accountId 반복 lookup 없음**. N+1 금지 충족.
- 편집(ProjectIssueAssignSelect)의 `defaultValue`/`onChange`는 이미 accountId 기반(`value.accountId`)이라 로직 변경 최소.

---

## 3. 백엔드 설계

### 3-1. `src/api/jira/issue/IssuePropertyApi.js` (신규)

```
export const MOVES_PROPERTY_KEY = 'movesRms';

readIssueProperty(issueIdOrKey, as='app')
  → GET /rest/api/3/issue/{id}/properties/movesRms
  → 200: json.value (객체)  | 404: {} | 4xx기타: throw ForgeAPIError
writeIssueProperty(issueIdOrKey, value, as='app')
  → PUT /rest/api/3/issue/{id}/properties/movesRms, body=value(전체 교체)
  → status>=400 이면 throw (updateCustomField의 명시적 전파 패턴 준수)
mergeIssueProperty(issueIdOrKey, patch, as='app')   // read-merge-write 공용
  → const prev = await readIssueProperty(id, as);
    return writeIssueProperty(id, { ...prev, ...patch }, as);
```
- 전부 `api.asApp().requestJira` (프로퍼티 write는 asApp — PoC/요구사항 §4-2). read도 asApp(가드 read와 write 컨텍스트 일치).
- 크기 방어 코드 없음(§3-6, 단순 유지).

### 3-2. `src/api/jira/issue/CoworkerResolver.js` (신규)

```
resolveCoworkerUsersMap(issues) → Map<accountId, jiraUser>
  1) 전 issue.properties.movesRms.coworkers 를 flat + dedup
  2) accountIds 없으면 빈 Map
  3) getBulkJiraUsersApi(accountIds)  // 기존, 100개 chunk 내부 처리
  4) results.flatMap(r=>r.values).forEach → map.set(accountId, user)
```
- **요청당 1회** bulk(청크는 내부). 이슈 수와 무관하게 사용자 API 호출은 O(uniqueUsers/100). N+1 없음.
- 표시 필요 서비스만 사용(issueAnalysis/gantt/getAssigneeStats). 카운트-only 서비스는 미사용.

### 3-3. `updateIssueCoworkers` (신규 — ProjectUsersService.js)

```
export const updateIssueCoworkersService = async ({ issueId, accountIds }) => {
    const ids = Array.isArray(accountIds) ? accountIds.filter(Boolean) : [];
    await mergeIssueProperty(issueId, { coworkers: ids });   // read-merge-write, 다른 필드 보존
    return { content: { issueId, coworkers: ids } };
};
```
- 컨트롤러 등록(ProjectUsersController): `guardedDefine(resolver,'updateIssueCoworkers',({payload})=>updateIssueCoworkersService(payload));`
- `updateProjectIdField`(범용 필드 write)의 **projectId 용도는 그대로 유지**(작업 등록/삭제). coworker만 전용 resolver로 분리.

### 3-4. `recordIssueAssignedDate` 전환 (ProjectUsersService.js)

기존 `recordIssueAssignedDateService`를 프로퍼티 기준으로 재작성:
```
export const recordIssueAssignedDateService = async ({ issueIds, accountId }) => {
    const ids = normalizeArray(issueIds);
    const isoNow = new Date().toISOString();
    const dateOnly = isoNow.slice(0,10);              // yyyy-MM-dd (인덱스용) — §3-3 함정 회피
    const limit = pLimit(5);
    let recorded = 0, skipped = 0;
    await Promise.all(ids.map(id => limit(async () => {
        try {
            const prev = await readIssueProperty(id, 'app');   // 가드: 프로퍼티 기준
            if (prev?.assignedAt) { skipped++; return; }       // 이미 등록일 있으면 skip(최초 유지)
            await writeIssueProperty(id, {
                ...prev,                                        // coworkers 보존
                assignedAt: dateOnly,
                assignedAtIso: isoNow,
                assignedById: accountId ?? prev?.assignedById ?? null,
            }, 'app');
            recorded++;
        } catch (e) { console.error('[recordAssignedDate] fail → skip', id, e?.message); skipped++; }
    })));
    return { recorded, skipped };
};
```
- **가드가 프로퍼티 기준**이므로 팀 관리형에서 매번 덮어쓰던 부작용(요구사항 §4-2) 해소.
- 컨트롤러: 기존과 동일하게 `accountId`는 context 취득. `assignedDateFieldId`/`assignedByFieldId` 인자는 서비스가 무시(프론트 호환).
- best-effort 비차단 유지(개별 실패 시 skip).

### 3-5. IssueApi.js 페처 read 전환

각 search URL에 `&properties=${MOVES_PROPERTY_KEY}` 추가, `fields`에서 `coworkerFieldId` append 제거, 코드에서 `issue.fields[coworkerFieldId]` → `issue.properties?.movesRms?.coworkers ?? []`(accountId[]).

| 함수 | 변경 |
|---|---|
| `getAssigneeStats` | URL에 properties 추가. includeCoworker 시 coworkers=accountId[] → **displayName/avatar 필요** → 호출측(getAssigneeStatsService)에서 resolve. 아래 3-5-a 참조 |
| `getIssueParticipantStats` | URL에 properties 추가. coworkers accountId[] → participants Set에 add(카운트만, resolve 불요) |
| `getProjectIssuesByUser` | fields에서 coworkerFieldId 제거, `&properties=movesRms` 추가. **JQL alias 치환**(§5). 반환 issue에 properties 포함 → 프론트/서비스가 소비 |
| `getIssuesByWorklogAuthor` | `&properties=movesRms` 추가(캘린더-open WorklogModal coworker 표시용) |
| `getProjectIssuesByFilter` | fields에서 coworkerFieldId 제거, `&properties=movesRms` 추가 |
| `getProjectGanttIssues` | fieldList에서 coworkerFieldId push 제거, `&properties=movesRms` 추가 |
| `getBulkIssuesByProject` | 변경 없음(worklog 전용, coworker 미사용) |

**3-5-a. getAssigneeStats includeCoworker의 이름/아바타**: 현재 coworker user 객체의 name/avatar로 map 구성. 전환 후 accountId만 있으므로, `getAssigneeStatsService`에서 (a) getAssigneeStats가 accountId 카운트만 집계해 반환하고, (b) 서비스가 coworker/assignee accountId 집합을 `getBulkJiraUsersApi`로 1회 resolve해 name/avatar 부착, 또는 (b') getAssigneeStats 내부에서 페이지 수집 완료 후 1회 bulk resolve. → **페이지 루프 밖 1회 resolve**로 구현(루프 내 호출 금지). assignee는 이미 `assignee` 필드에 user 객체가 있으므로 assignee name/avatar는 그대로, coworker만 resolve 필요.

### 3-6. 소비 서비스 조정 (coworker 형태 변경 대응)

| 서비스 | 현재 | 전환 후 |
|---|---|---|
| `IssueAnalysisService.getIssueAnalysisListService` / `downloadIssueAnalysisExcelService` | `issue.fields[coworkerFieldId]`(user[]) → `{accountId,displayName,avatarUrl}` | `resolveCoworkerUsersMap(issues)` 1회 → `issue.properties.movesRms.coworkers`.map(id→map.get(id)) → `{accountId,displayName,avatarUrl}`. `totalWorkers`는 accountId[].length 사용 |
| `ProgressCalculator.normalizeIssue` | `f[coworkerFieldId]`(user[]) → `{accountId,displayName}` + totalWorkers | `issue.properties?.movesRms?.coworkers ?? []` → totalWorkers만 필요 → `coworkers.length`. displayName 불필요(진척 계산은 카운트만). 시그니처 `normalizeIssue(issue)`로 단순화 가능(coworkerFieldId 인자 제거) |
| `GanttMapper.normalizeIssue` | `f[coworkerFieldId]`(user[]) 그대로 coworkers | accountId[] → user객체 필요(AvatarStack). GanttService에서 `resolveCoworkerUsersMap(issues)` 1회 → mapper에 map 전달 → `coworkers = ids.map(id=>map.get(id)).filter(Boolean)` |
| `ProjectCostService` (normalizeIssue 재사용) | 위 ProgressCalculator 공유 | 카운트만 → 변경은 ProgressCalculator.normalizeIssue 단순화에 흡수 |
| `PortfolioAggregator` (normalizeIssue 재사용) | 카운트만 | 동일 |
| `ProjectDashboardService.getIssueChartData` | getIssueParticipantStats(카운트) | 내부 전환만(3-5), 서비스 무변경 |

> **성능 규칙 준수**: 공통 페치 경로(`getProjectIssuesByFilter` 등)는 URL에 properties 추가하는 최소 변경만. bulk user resolve는 **각 소비 서비스가 페이지/요청 단위 1회**만 수행(Gantt/IssueAnalysis 전용). 진척/비용/포트폴리오는 resolve 자체를 안 함(카운트만). → 회귀·N+1 없음.

### 3-7. 마이그레이션 배치 resolver (신규)

```
export const runFieldToPropertyMigrationService = async ({ nextPageToken=null, pageSize=50 }) => {
    // 필드 id 조달(회사 관리형 fields read용) — FieldApi 확장
    const { coworkerFieldId, assignedDateFieldId, assignedByFieldId } = await getMovesFieldIds();  // getCoworkerFieldIdApi 패턴 재사용
    const jql = `moves_RMS_projectId IS NOT EMPTY ORDER BY created ASC`;
    const url = `/rest/api/3/search/jql?jql=${jql}&fields=${coworkerFieldId},${assignedDateFieldId},${assignedByFieldId}&fieldsByKeys=true&properties=movesRms&maxResults=${pageSize}${token?...}`;
    const page = await requestJiraJson({ as:'app', url });  // asApp: 전 프로젝트 접근
    const issues = page.issues || [];
    let scanned=0, migrated=0, skipped=0, failed=0;
    const limit = pLimit(5);
    await Promise.all(issues.map(issue => limit(async () => {
        scanned++;
        // 멱등: 이미 프로퍼티 있으면 skip
        if (issue.properties?.movesRms && Object.keys(issue.properties.movesRms).length) { skipped++; return; }
        const f = issue.fields || {};
        const coworkers = (f[coworkerFieldId]||[]).map(u=>u.accountId).filter(Boolean);
        const assignedIso = f[assignedDateFieldId] || null;      // ISO datetime(구 필드)
        const assignedBy  = f[assignedByFieldId] || null;        // accountId string
        // 값이 하나도 없으면(팀 관리형 = fields 비어있음) skip — 이관할 원본 없음
        if (!coworkers.length && !assignedIso && !assignedBy) { skipped++; return; }
        try {
            await writeIssueProperty(issue.id, {
                coworkers,
                assignedAt: assignedIso ? assignedIso.slice(0,10) : null,   // date-only 변환(§3-3)
                assignedAtIso: assignedIso,
                assignedById: assignedBy,
            }, 'app');
            migrated++;
        } catch(e){ failed++; console.error('[migration] fail', issue.key, e?.message); }
    })));
    return { content: { scanned, migrated, skipped, failed, nextPageToken: page.nextPageToken||null, done: !page.nextPageToken } };
};
```
- **대상**: `moves_RMS_projectId IS NOT EMPTY` 전 이슈. 팀 관리형은 fields가 비어 자연 skip → 사실상 회사 관리형만 이관(요구사항 §4-4). 별도 프로젝트 유형 필터 불필요.
- **멱등**: 프로퍼티 이미 존재 시 skip. 재실행 안전.
- **페이징**: 1회 호출 = 1페이지(50건) 처리 후 `nextPageToken` 반환. 관리자가 `done:true`까지 반복 invoke(Forge 25s sync 한도 회피). p-limit(5).
- **asApp**: 전 프로젝트 접근 필요([[feedback_no_asapp]] 예외 — 배치성 관리자 1회 작업, 사용자 컨텍스트로 전 프로젝트 접근 불가). ※ 메모리 [[feedback_no_asapp]]는 "배치도 asApp 우회 말고 사용자 경로"를 권고하나, 마이그레이션은 전 사이트 이슈를 관리자 1인이 훑는 성격이라 사용자 스코프로는 불완전. **리스크로 명시(§9)**하고 사용자 승인 확인 필요.
- **트리거**: SettingPage(백오피스)에 "필드→프로퍼티 마이그레이션" 버튼(§4 프론트, §8 i18n). SETTINGS write 권한자만.
- **배포 순서**(PoC §6): manifest `jira:entityProperty` 선언 배포 + `forge install --upgrade` → 그 후 배치 실행.

### 3-8. FieldApi 확장

`getCoworkerFieldIdApi`(기존) 옆에 마이그레이션용 `getMovesFieldIds()` 추가 — `/rest/api/3/field`에서 `moves_RMS_coworkers`/`moves_RMS_projectAssignedDate`/`moves_RMS_projectAssignedById` name 매칭해 `{coworkerFieldId, assignedDateFieldId, assignedByFieldId}` 반환(모듈 메모리 캐시). 마이그레이션 전용(런타임 read 경로는 프로퍼티라 필드 id 불요).

### 3-9. 에러 케이스 (ErrorCodes)
- 프로퍼티 write 실패: 기존 `ForgeAPIError('APP_FIELD_WRITE_...' 대신 'ISSUE_PROPERTY_WRITE_{status}')` 신규 코드 or 재사용. recordIssueAssignedDate/coworker는 best-effort는 아님(coworker는 사용자 액션 → 실패 전파해 토스트). recordIssueAssignedDate는 best-effort(비차단).
- 마이그레이션 개별 실패: throw 안 함, `failed++` 집계.

### 3-10. src/index.js 등록
- `updateIssueCoworkers`: `registerProjectUsersController` 내 추가(별도 등록 불요).
- `runFieldToPropertyMigration`: 신규 `registerMigrationController(resolver)` 추가 → `src/index.js`에 import+호출. (또는 SchedulerController에 합류 — 단독 컨트롤러 권장.)

---

## 4. 프론트엔드 설계

### 4-1. 공통 유틸 `static/ui/src/utils/jiraApi/coworkerProperty.js` (신규)
```
export const MOVES_PROPERTY_KEY = 'movesRms';
export const getIssueCoworkerIds = (issue) => issue?.properties?.[MOVES_PROPERTY_KEY]?.coworkers ?? [];
export const getIssueAssignedAtIso = (issue) => issue?.properties?.[MOVES_PROPERTY_KEY]?.assignedAtIso ?? null;
export const getIssueAssignedById = (issue) => issue?.properties?.[MOVES_PROPERTY_KEY]?.assignedById ?? null;
```

### 4-2. ProjectIssueTable.jsx (표시+편집)
- **모듈 상단** `const coworkerId = await getCustomFieldId(...)` **제거**(더 이상 필드 id로 안 읽음).
- `fetchPage` param에 `properties:['movesRms']` 추가. 응답 후 **페이지 coworker accountId 수집 → `fetchBulkUsers`(또는 `useUserInfos` 상태화) 1회 → userMap 구성**. (테이블이 imperative `createRow`이므로: rawIssues를 state로 두고 `useUserInfos(allCoworkerIds)`로 userMap 산출 → createRow에 userMap 주입하는 리팩토링. 대안: fetchPage 안에서 `fetchBulkUsers` 직접 호출해 userMap 만들고 rows 생성.)
- coworker 셀:
  - readView: `const ids = getIssueCoworkerIds(issue); const users = ids.map(id=>userMap[id]).filter(Boolean);` → `<AvatarStack users={users}/>`
  - onEdit: `changeCoworker.current = getIssueCoworkerIds(issue)` (이미 accountId[])
  - editView defaultValue: `ids.map(id=>userMap[id]).filter(Boolean)` (user객체 배열 — ProjectIssueAssignSelect 기대형)
  - onConfirm 비교: `isSameArrayElements(changeCoworker.current, getIssueCoworkerIds(issue))`
- `updateCoworker`: `invoke('updateProjectIdField', {..., customFieldId:coworkerFieldId})` → **`invoke('updateIssueCoworkers', {issueId: issue.id, accountIds: changeCoworker.current})`**. 성공 시 `searchByIssueId`(단건 GET).
- `searchByIssueId`의 `getIssue` param에 `properties:'movesRms'` 추가(단건 새로고침에 프로퍼티 동봉 — 직접 read라 즉시 일관).

### 4-3. taskHistory (등록일·등록자 표시)
- **taskHistory.transform.js**: `assignedAt(issue, fieldId)` → `getIssueAssignedAtIso(issue)`; `assignedBy(issue, fieldId)` → `getIssueAssignedById(issue)`. `normalizeIssue`에서 `assignedDateFieldId/assignedByFieldId` 인자 제거. (테스트 `taskHistory.transform.test.js`도 프로퍼티 shape로 수정.)
- **TaskHistoryPage.jsx**: `assignedDateFieldId/assignedByFieldId` useQuery 제거. 집계 쿼리 fields=`['timetracking']` + `properties:['movesRms']` 추가. `transformTaskHistory(issues, {hourRate})`.
- **TaskHistoryTable.jsx**: fields에서 assignedDate/By 제거, `properties:['movesRms']` 추가. ORDER BY: `${CustomFieldKey.assignedDateField} DESC` → **`movesRmsAssignedAt DESC`**(§5). 등록자 lookup은 기존 `useUserInfos(accountIds)` 유지(normalized.assignedById가 이제 프로퍼티에서 옴).

### 4-4. WorklogModal.jsx (coworker 표시)
- `coworkers = selectedIssue?.fields?.[coworkerFieldId]` → `const coworkerIds = getIssueCoworkerIds(selectedIssue); const { data: users } = useUserInfos(coworkerIds); const coworkers = coworkerIds.map(id=>userMap[id]).filter(Boolean);` → `<AvatarStack users={coworkers}/>`.
- `promiseOptions` search param에 `properties:['movesRms']` 추가(검색으로 고른 이슈도 coworker 표시).
- JQL: `${CustomFieldKey.coworkerIdField} = currentUser()` → `movesRmsCoworkers = currentUser()` (§5).

### 4-5. SettingPage.jsx (마이그레이션 트리거 — 관리자)
- SETTINGS write 권한자에게만 노출(`usePermissionStore.canWrite('SETTINGS')` 또는 기존 SettingPage 접근 제어 재사용).
- "필드→프로퍼티 마이그레이션" 버튼 → `nextPageToken` 루프 invoke, 진행 카운터 표시(scanned/migrated/skipped/failed), `done` 시 완료 토스트.
- 신규 서버상태 없음(mutation성 반복 호출). 쿼리키 팩토리 추가 불필요.

### 4-6. 권한 체크
- coworker 편집: 기존 `canEdit`(PROJECT write) 유지. Jira 이슈 편집 권한(useJiraProjectPermissions)은 프로퍼티 write가 asApp이라 무관(단, 위변조 트레이드오프 §9). 편집 버튼 노출은 기존 canEdit 그대로.
- 마이그레이션: SETTINGS write.

---

## 5. JQL 치환 표

| 사용처(파일) | 현재 | 치환 후 |
|---|---|---|
| `IssueApi.getProjectIssuesByUser` | `moves_RMS_coworkers in ("${id}")` | `movesRmsCoworkers in ("${id}")` |
| `jiraApi/issue/getJqlIssue.js:getUserIssueIds` | `moves_RMS_coworkers in ("${accountId}")` | `movesRmsCoworkers in ("${accountId}")` |
| `myWork/modal/WorklogModal.jsx:promiseOptions` | `${CustomFieldKey.coworkerIdField} = currentUser()` (=`moves_RMS_coworkers = currentUser()`) | `movesRmsCoworkers = currentUser()` |
| `taskHistory/TaskHistoryTable.jsx:buildJql` | `ORDER BY ${CustomFieldKey.assignedDateField} DESC` (=`moves_RMS_projectAssignedDate`) | `ORDER BY movesRmsAssignedAt DESC` |

- PoC 실측(§4): `in (...)`·`= currentUser()`·`= accountId`·`is EMPTY`·date 범위·`ORDER BY` 모두 alias 지원 → **OR 전개 불필요, 1:1 치환**.
- `moves_RMS_projectId`(projectIdField) JQL은 **현행 유지**(요구사항 §3-1, 비목표 §5). 치환 대상 아님.
- alias 상수화 권장: `static/ui/src/constants/customField.js`에 `export const MovesAlias = { coworkers:'movesRmsCoworkers', assignedAt:'movesRmsAssignedAt', assignedBy:'movesRmsAssignedBy' }` 추가해 하드코딩 산재 방지.

---

## 6. read 경로 전환 표 (요구사항 §4-3 소비처 전수)

> 공통: search 계열 호출에 `properties: ["movesRms"]`(프론트 param) 또는 `&properties=movesRms`(백엔드 URL) 추가.

| # | 소비처 | 현재 접근 | 전환 후 접근 |
|---|---|---|---|
| 1 | `ProjectIssueTable.jsx` (표시+편집) | `issue.fields[coworkerId]` (user[]) | `getIssueCoworkerIds(issue)`(accountId[]) + userMap; write=`updateIssueCoworkers` |
| 2 | `ProjectIssuePanel.jsx` | *(grep 결과 coworker 미참조 — 컨테이너, 테이블은 ProjectIssueTable)* | 변경 없음(하위 ProjectIssueTable만) |
| 3 | `taskHistory.transform.js` | `issue.fields[assignedDateFieldId]`(ISO), `issue.fields[assignedByFieldId]`(accountId) | `getIssueAssignedAtIso(issue)`, `getIssueAssignedById(issue)` |
| 3b | `taskHistory/TaskHistoryPage.jsx`, `TaskHistoryTable.jsx` | fields=[...,assignedDate,assignedBy] | fields 제거 + `properties:['movesRms']`; ORDER BY alias(§5) |
| 4 | `gantt/useGanttData.js` | resolver `getProjectGanttData`(coworkerFieldId 전달) | 프론트 무변경(계약 유지). 백엔드 GanttMapper가 프로퍼티→user resolve(3-6) |
| 5 | `calender/useProjectCalender.js` | resolver `getProjectCalendarWorklog`(coworkerFieldId) | 프론트 무변경. 백엔드 getProjectIssuesByUser가 properties 포함(3-5) |
| 6 | `analysisReport/issue/IssueAnalysisTable.jsx` | resolver `getIssueAnalysisList`(coworkerFieldId) → `issue.coworkers` | 프론트 무변경(응답 shape 유지). 백엔드 resolve(3-6) |
| 7 | `myWork/utils/useMyWorklogList.js`, `table/useMyIssueTable.js` | resolver `getProjectWorklog`/`getMyIssueList`(coworkerFieldId) | 프론트 무변경. 백엔드 issue.properties.movesRms 포함(3-5). WorklogModal이 표시(4-4) |
| 8 | `myWork/modal/WorklogModal.jsx` | `selectedIssue.fields[coworkerFieldId]` + JQL coworker | `getIssueCoworkerIds`+`useUserInfos`; JQL alias(§5); promiseOptions properties 추가 |
| 9 | `IssueApi.getAssigneeStats`/`getIssueParticipantStats`/`getProjectIssuesByUser`/`getProjectIssuesByFilter`/`getProjectGanttIssues` | `issue.fields[coworkerFieldId]`(user[]) | `issue.properties.movesRms.coworkers`(accountId[]) + URL properties(3-5) |
| 10 | `projectProgress`·`projectCost`·`portfolioDashboard` (normalizeIssue) | `f[coworkerFieldId]`→totalWorkers | `issue.properties.movesRms.coworkers.length` (카운트만, resolve 불요) |
| 11 | `projectDashboard.getIssueChartData` | getIssueParticipantStats(coworkerFieldId) | 내부 전환만(#9), 서비스 무변경 |

- **단건 GET**: `ProjectIssueTable.searchByIssueId`의 `getIssue`는 `properties:'movesRms'` 쿼리 추가(GET은 `executeRequest`가 querystring으로 append). 단건 프로퍼티 GET은 검색 인덱스와 무관한 **직접 read → 즉시 일관**(write 직후 새로고침 정확).

---

## 7. 마이그레이션 배치 설계 (요구사항 §4-4 상세)

- **스코프**: `moves_RMS_projectId IS NOT EMPTY` 전 이슈(asApp 검색). 팀 관리형은 fields 공란 → 자연 skip.
- **소스 read**: 검색 1패스(`fields=coworker,assignedDate,assignedBy` + `fieldsByKeys=true` + `properties=movesRms`, maxResults=pageSize). fieldsByKeys=true 필수([[project_forge_field_key_fieldsbykeys]] — false면 앱 필드 조용히 누락).
- **변환**: coworker user[]→accountId[], assignedDate ISO→`{assignedAt:date-only, assignedAtIso:ISO}`(§3-3 date 함정), assignedBy accountId 그대로.
- **멱등**: `issue.properties.movesRms` 존재하면 skip. 값 없으면(원본 공란) skip.
- **동시성**: `pLimit(5)`.
- **트리거**: 관리자 SettingPage 버튼(SETTINGS write) → 페이징 반복 invoke. scheduledTrigger 상시 배치 없음.
- **권한(PermissionMap)**: `runFieldToPropertyMigration: W('SETTINGS')` 등록(deny-by-default이라 필수). 계약 테스트(`test/permission/permissionMap.contract.test.js`)가 등록집합↔맵키집합 대조하므로 컨트롤러 등록과 맵 등록 **동시** 필요.
- **배포 순서**: manifest 배포 + `forge install --upgrade` → 배치 실행(PoC §6 실측).

---

## 8. manifest 변경 + i18n 키

### 8-1. manifest.yml

**추가**(`modules` 아래):
```yaml
  jira:entityProperty:
    - key: moves-rms-entity-property
      entityType: "issue"
      propertyKey: movesRms
      values:
        - path: coworkers
          type: user
          searchAlias: movesRmsCoworkers
        - path: assignedAt
          type: date
          searchAlias: movesRmsAssignedAt
        - path: assignedById
          type: string
          searchAlias: movesRmsAssignedBy
```
**제거**:
- `webtrigger: - key: poc-entity-property` 블록 전체
- `function: - key: pocEntityProperty` 항목
- `jira:entityProperty: - key: moves-rms-poc-entity-property`(propertyKey movesRmsPoc) 블록 전체
- 파일 `src/poc/entityPropertyPoc.js` + `src/poc/` 디렉토리

**유지**(제거 금지 — 파괴적, [[project_forge_readonly_field_write]]): `jira:customField`의 coworkerIdField/assignedDateField/assignedByIdField/projectIdField 선언. 데이터 이관 완료 후 별도 RFC로 폐기.

**신규 function 등록**: 마이그레이션은 기존 `resolver` 핸들러 내부 resolver(`runFieldToPropertyMigration`)라 manifest function 추가 불요(index.handler로 커버). 별도 webtrigger/scheduledTrigger 만들지 않음.

**env 접미사 미적용 근거**(요구사항 §7): 운영 단일 앱 원칙 전제. 프로퍼티 키·alias는 전역이라 dev/prod 공존 시 충돌 가능하나, 운영 사이트엔 단일 환경 앱만 설치(메모리 [[project_forge_env_field_duplication]] 교훈 반영) → 접미사 없이 단순 유지.

### 8-2. i18n (마이그레이션 관리자 UI만)

`locales/kr/migration.json`:
```json
{
  "migration.field2property.title": "코워커/등록정보 이슈 프로퍼티 마이그레이션",
  "migration.field2property.description": "기존 커스텀 필드(코워커·등록일·등록자) 값을 이슈 프로퍼티로 이관합니다. 팀 관리형 프로젝트 지원에 필요하며, 여러 번 실행해도 안전합니다.",
  "migration.field2property.run": "마이그레이션 실행",
  "migration.field2property.running": "이관 중… (스캔 {scanned} / 이관 {migrated} / 건너뜀 {skipped})",
  "migration.field2property.done": "완료: 스캔 {scanned}건, 이관 {migrated}건, 건너뜀 {skipped}건, 실패 {failed}건",
  "migration.field2property.failed": "마이그레이션 중 오류가 발생했습니다."
}
```
`locales/en/migration.json`:
```json
{
  "migration.field2property.title": "Coworker/Assignment Issue-Property Migration",
  "migration.field2property.description": "Migrates existing custom field values (coworkers, assigned date, assigned-by) to issue properties. Required for team-managed project support; safe to run multiple times.",
  "migration.field2property.run": "Run migration",
  "migration.field2property.running": "Migrating… (scanned {scanned} / migrated {migrated} / skipped {skipped})",
  "migration.field2property.done": "Done: {scanned} scanned, {migrated} migrated, {skipped} skipped, {failed} failed",
  "migration.field2property.failed": "An error occurred during migration."
}
```
- 추가 후 `cd static/ui && npm run merge` 실행(`locales/script/*.json`은 빈 스텁 — 반영 안 됨).
- `{scanned}` 등 치환은 기존 `tFormat`(`static/ui/src/utils/i18n`) 사용.

---

## 9. 영향 파일 전수 목록

### 백엔드 (신규/수정/삭제)
**신규**
- `src/api/jira/issue/IssuePropertyApi.js` (read/write/mergeIssueProperty + MOVES_PROPERTY_KEY)
- `src/api/jira/issue/CoworkerResolver.js` (resolveCoworkerUsersMap)
- `src/resolver/migration/MigrationController.js` + `MigrationService.js` (runFieldToPropertyMigration)

**수정**
- `src/api/jira/issue/IssueApi.js` — 6개 페처 properties 추가 + coworker read 전환 + JQL alias
- `src/api/jira/field/FieldApi.js` — `getMovesFieldIds()` 추가(마이그레이션용)
- `src/resolver/projectIssue/ProjectUsersService.js` — `updateIssueCoworkersService` 신규, `recordIssueAssignedDateService` 프로퍼티 전환, `readIssueFieldValue`/기존 필드 write 정리
- `src/resolver/projectIssue/ProjectUsersController.js` — `updateIssueCoworkers` 등록, recordIssueAssignedDate 인자 정리
- `src/resolver/issueAnalysis/IssueAnalysisService.js` — coworker resolve(3-6)
- `src/resolver/gantt/GanttService.js` + `GanttMapper.js` — coworker resolve/형태 전환
- `src/resolver/projectProgress/ProgressCalculator.js` — normalizeIssue coworker→count
- `src/resolver/projectCost/ProjectCostService.js`, `src/resolver/portfolioDashboard/PortfolioAggregator.js` — normalizeIssue 시그니처 반영(카운트)
- `src/resolver/projectDashboard/ProjectDashboardService.js` — getAssigneeStatsService coworker name/avatar resolve(3-5-a)
- `src/permission/PermissionMap.js` — `updateIssueCoworkers`, `runFieldToPropertyMigration` 등록
- `src/index.js` — `registerMigrationController` import+호출
- `manifest.yml` — entityProperty 추가, PoC 블록 제거
- `src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js` — 프로퍼티 기준으로 갱신

**삭제**
- `src/poc/entityPropertyPoc.js`, `src/poc/`

### 프론트 (신규/수정)
**신규**
- `static/ui/src/utils/jiraApi/coworkerProperty.js` (getIssueCoworkerIds 등)

**수정**
- `static/ui/src/constants/customField.js` — `MovesAlias` 상수 추가(alias)
- `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` — 표시/편집/write/userMap(핵심)
- `static/ui/src/pages/projectDetail/taskHistory/taskHistory.transform.js` (+ `.test.js`)
- `static/ui/src/pages/projectDetail/taskHistory/TaskHistoryPage.jsx`, `TaskHistoryTable.jsx`
- `static/ui/src/pages/myWork/modal/WorklogModal.jsx` — coworker 표시 + JQL alias + promiseOptions properties
- `static/ui/src/utils/jiraApi/issue/getJqlIssue.js` — JQL alias
- `static/ui/src/backoffice/page/setting/SettingPage.jsx` — 마이그레이션 버튼
- `locales/kr/migration.json`, `locales/en/migration.json` (+merge)

**변경 없음(계약 유지 확인)**: DashboardPage/ChartTemplate/useGanttData/useProjectCalender/useMyWorklogList/useMyIssueTable/IssueAnalysisTable — coworkerFieldId를 resolver에 계속 전달해도 무해(백엔드가 무시). 선택적 정리: 이들의 `['coworkerFieldId']` useQuery 및 전달 인자 제거(후속 청소, 기능 무관).

---

## 10. 구현 작업 분해

### Backend 체크리스트
- [ ] `IssuePropertyApi.js`: read/write/merge + 상수. asApp. 4xx 전파.
- [ ] `CoworkerResolver.js`: `resolveCoworkerUsersMap(issues)` — dedup + getBulkJiraUsersApi 1회.
- [ ] IssueApi 6개 페처: `&properties=movesRms` 추가, coworker read `properties.movesRms.coworkers`로, `getProjectIssuesByUser` JQL alias.
- [ ] `getAssigneeStats`/`getIssueParticipantStats`: properties read; assignee 차트 coworker name/avatar는 서비스 레벨 1회 resolve.
- [ ] `ProjectUsersService`: `updateIssueCoworkersService`(merge-write) + `recordIssueAssignedDateService` 프로퍼티 전환(가드=assignedAt).
- [ ] `ProjectUsersController`: `updateIssueCoworkers` guardedDefine 등록.
- [ ] 소비 서비스 조정: issueAnalysis(resolve+totalWorkers), gantt(resolve), progress/cost/portfolio(count).
- [ ] `MigrationService`/`Controller`: 페이징 배치 + `getMovesFieldIds`.
- [ ] `PermissionMap`: `updateIssueCoworkers: W('PROJECT','inherited')`, `runFieldToPropertyMigration: W('SETTINGS')`. 계약 테스트 통과.
- [ ] `index.js`: MigrationController 등록.
- [ ] manifest: entityProperty 추가 + PoC 제거. `src/poc/` 삭제.
- [ ] jest: recordIssueAssignedDate 테스트 프로퍼티화, PortfolioAggregator 테스트 coworkerFieldId=null 여전히 통과 확인.

### Frontend 체크리스트
- [ ] `coworkerProperty.js` 유틸 + `MovesAlias` 상수.
- [ ] ProjectIssueTable: properties 추가, userMap 구성(페이지 1회 bulk), 표시/편집/`updateIssueCoworkers`, `getIssue` properties.
- [ ] taskHistory transform/Page/Table: 프로퍼티 read + ORDER BY alias + assignedById useUserInfos.
- [ ] WorklogModal: coworker useUserInfos + JQL alias + promiseOptions properties.
- [ ] getJqlIssue.js: JQL alias.
- [ ] SettingPage: 마이그레이션 버튼(반복 invoke, 진행 표시, SETTINGS write 게이팅).
- [ ] i18n: migration.json(kr/en) + `npm run merge`.
- [ ] `static/ui` build 통과.

---

## 11. 리스크 / 설계 가정

1. **[asApp 배치 vs [[feedback_no_asapp]]]** 마이그레이션은 전 사이트 이슈를 관리자 1인이 훑어야 해 사용자 스코프로 불완전 → asApp 검색/write 채택. 메모리 원칙과 상충하므로 **사용자 승인 필요**. 대안(사용자가 접근 가능한 프로젝트만 순회)은 관리자 권한 프로젝트에 한정돼 누락 가능.
2. **[위변조]** 프로퍼티는 이슈 편집 권한자가 REST로 수정 가능(PoC §5). 수용된 트레이드오프 — 서버는 형식 검증만. coworker write는 asApp이나 read/JQL은 조작 노출.
3. **[coworker 표시 latency]** 프로퍼티 accountId→user resolve가 프론트/백엔드에 1 bulk 추가. 페이지/요청당 1회로 제한(N+1 없음)했으나 첫 렌더에 아바타가 한 박자 늦게 뜰 수 있음(useUserInfos 캐시로 재방문 즉시). 허용 범위.
4. **[clone 미복사]** 이슈 clone 시 프로퍼티 미복사 가능(PoC 미실측). 비대응(사용자 결정) — "클론 이슈 coworker 공란"을 알려진 동작으로 문서화 권장.
5. **[date 인덱스 함정]** write 경로는 반드시 `assignedAt`=date-only. datetime을 넣으면 인덱스 조용히 누락 → ORDER BY/범위 JQL 깨짐. recordIssueAssignedDate/migration 양쪽 `slice(0,10)` 필수(설계 반영됨).
6. **[getAssignedStats 차트]** coworker 이름/아바타가 필요한 유일한 카운트-계열. resolve를 페이지 루프 밖 1회로 강제(루프 내 호출 시 N+1 회귀). 검증자 주의 포인트.
7. **[내부 소비자 누락 방지]** coworker read 전환 시 `issue.fields[coworkerFieldId]` 잔존 grep으로 전수 확인(6-9,10,11 표 항목). 응답 shape 계약(issueAnalysis `coworkers`, gantt `Task.coworkers`)은 **user객체 유지** — 프론트 무회귀 위해 백엔드에서 resolve 완결.
8. **[recordIssueAssignedDate 가드 read 비용]** 이슈당 프로퍼티 GET 1회(p-limit 5). 작업 등록은 소량 다건이라 부담 낮음. 대량 등록 시 기존과 동일 특성.

---

## 11-B. 델타: 간트 계층(wbsParent) 프로퍼티 이전 (2026-07-14 사용자 추가 요청, 리더 확정)

**배경**: 간트 계층도 같은 원인으로 팀 관리형에서 깨진다 — `GanttMapper.normalizeIssue`가 `issue.fields[wbsParentFieldId]`를 읽는데 팀 관리형 이슈는 fields에 앱 필드가 없다(write는 app/field asApp이라 성공 → 조용한 데이터 유실). 선후행은 네이티브 이슈 링크라 무관. `predecessorsField`는 미사용 존치(무변경).

**프로퍼티 스키마 확장**: `movesRms.wbsParent` = 부모 이슈 key 문자열 | null (해제 시 null — 기존 빈 문자열 관례 대체).
manifest `jira:entityProperty`에는 **추가하지 않는다**(wbsParent는 JQL 검색 안 함 — 선언 없는 path 저장은 PoC로 무해 확인).

**백엔드 델타**:
1. `getProjectGanttIssues`(IssueApi): `wbsParentFieldId` 인자·fieldList push 제거(properties=movesRms는 이미 붙음).
2. `GanttMapper.normalizeIssue`: `f[wbsParentFieldId]` → `issue.properties?.movesRms?.wbsParent`(trim, 빈문자→null 정규화 유지). fieldIds 인자에서 wbsParentFieldId 제거. 테스트(`GanttMapper.test.js`) 프로퍼티 shape로 갱신.
3. `GanttService`: `getAppFieldIds()` 조달 전면 제거(양 경로). `updateGanttParentService`의 write를 `updateAppCustomFieldValue(wbsParentField)` → `mergeIssueProperty(issueId, { wbsParent: parentKey ?? null })`로 교체(다른 프로퍼티 필드 보존). key→숫자id 맵은 프로퍼티 PUT이 key도 받으므로 불필요해지면 정리. **응답 계약(`{target, parentKey}` 등)은 무변경.**
4. `FieldApi.getAppFieldIds`: 소비자가 없어지면 삭제(마이그레이션은 별도 `getMovesFieldIds` 사용). `getMovesFieldIds`에 `moves_RMS_wbsParent` 추가.
5. **마이그레이션**: 소스 fields에 wbsParent 필드 추가, `wbsParent: f[wbsParentFieldId] || null` 복사. 멱등 조건 동일(프로퍼티 존재 시 skip).

**프론트 델타**: 없음 — `Task.wbsParent`는 백엔드 응답 계약 유지. `useGanttMutations` 캐시 패치·`ganttAdapter` 소비 무변경. (참고: 프로퍼티 전환으로 wbsParent는 search 인덱스 지연과 무관해지지만 기존 캐시 패치 패턴 그대로 유지.)

**검증 델타**: `wbsParentFieldId` fields-read 잔존 0(마이그레이션 소스 read 제외), gantt 응답 계약 무회귀, GanttMapper/GanttService 테스트 통과.

---

## 12. 검증 기준(integration-verifier용 요약)
- 경계면: `updateIssueCoworkers`/`recordIssueAssignedDate`/`runFieldToPropertyMigration` 응답 shape ↔ 프론트 소비 일치.
- coworker read 전환: `issue.fields[coworkerFieldId]` 잔존 0건(내부 소비자 포함 grep). resolve는 요청/페이지당 1 bulk(루프 내 호출 0).
- 응답 계약 무회귀: getIssueAnalysisList.coworkers / getProjectGanttData.Task.coworkers = user객체 배열 유지.
- JQL alias 4곳 치환 완료, projectId JQL 무변경.
- manifest: PoC 블록 3종 + `src/poc/` 제거, entityProperty 1종 추가.
- PermissionMap 계약 테스트 통과(신규 2키). `npm test` + `static/ui` build 통과.
