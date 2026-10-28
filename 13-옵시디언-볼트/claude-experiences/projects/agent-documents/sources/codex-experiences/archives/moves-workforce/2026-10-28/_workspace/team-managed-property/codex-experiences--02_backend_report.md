# 백엔드 구현 리포트 — 팀 관리형 프로젝트 지원(코워커·등록일·등록자 이슈 프로퍼티 이전)

- 날짜: 2026-07-14 · 브랜치: RFC-155
- 입력: `01_architect_design.md`(§3 백엔드·§7 마이그레이션·§8-1 manifest·§10 Backend 체크리스트)
- 테스트: 루트 `npm test` → **14 suites / 219 tests 전부 통과** (신규 실패 0, 기존 실패 0)

---

## 1. 구현 완료 항목 요약

### 신규 파일
| 파일 | 내용 |
|---|---|
| `src/api/jira/issue/IssuePropertyApi.js` | `MOVES_PROPERTY_KEY='movesRms'`, `readIssueProperty`(404→{}, 그외 4xx throw), `writeIssueProperty`(전체 교체, ≥400 throw), `mergeIssueProperty`(read-merge-write). 전부 asApp 기본 |
| `src/api/jira/issue/CoworkerResolver.js` | `resolveCoworkerUsersMap(issues, as='user')` — 전 이슈 coworker accountId flat+dedup 후 `getBulkJiraUsersApi` **1회** → `Map<accountId, jiraUser>` |
| `src/resolver/migration/MigrationService.js` | `runFieldToPropertyMigrationService({nextPageToken, pageSize})` — 페이징 배치, 멱등, p-limit(5), asApp |
| `src/resolver/migration/MigrationController.js` | `registerMigrationController(resolver)` — `runFieldToPropertyMigration` guardedDefine 등록 |

### 수정 파일
- `src/api/jira/issue/IssueApi.js` — 6개 페처 전환: `&properties=movesRms` 추가, coworker read를 `issue.properties?.movesRms?.coworkers ?? []`(accountId[])로, `getProjectIssuesByUser` JQL `moves_RMS_coworkers`→`movesRmsCoworkers`. `moves_RMS_projectId` JQL 무변경. `getAssigneeStats`는 페이지 루프 밖 1회 bulk resolve(coworker 이름/아바타).
- `src/api/jira/field/FieldApi.js` — `getMovesFieldIds()` 추가(마이그레이션 전용, 모듈 캐시).
- `src/resolver/projectIssue/ProjectUsersService.js` — `updateIssueCoworkersService` 신규(merge-write), `recordIssueAssignedDateService` 프로퍼티 전환(가드=prev.assignedAt, `assignedAt`=slice(0,10) date-only + `assignedAtIso` 분리). 사용되지 않게 된 `readIssueFieldValue` 제거. `updateProjectIdField`/`deleteProjectIssue`(projectId 용도) 무변경.
- `src/resolver/projectIssue/ProjectUsersController.js` — `updateIssueCoworkers` 등록.
- `src/resolver/issueAnalysis/IssueAnalysisService.js` — `getIssueAnalysisListService`: `resolveCoworkerUsersMap` 페이지 1회 → coworkers user객체 부착, `totalWorkers=assignee?1:0 + accountIds.length`. `downloadIssueAnalysisExcelService`: 카운트만(resolve 없음).
- `src/resolver/gantt/GanttMapper.js` — `normalizeIssue`가 `fieldIds.coworkerUserMap` + 프로퍼티 accountId[]로 coworker user객체 복원(로컬 상수 `MOVES_PROPERTY_KEY`, 순수 유지).
- `src/resolver/gantt/GanttService.js` — `resolveCoworkerUsersMap(issues)` 1회 → mapper에 map 전달. `getCoworkerFieldIdApi` 조달 제거(불필요 네트워크 1회 감소).
- `src/resolver/projectProgress/ProgressCalculator.js` — `normalizeIssue(issue)`: 프로퍼티 accountId[].length로 `totalWorkers` 카운트만(resolve 없음, coworkerFieldId 인자 제거). ProjectCost/Portfolio는 이 변경에 흡수(파일 무수정).
- `src/permission/PermissionMap.js` — `updateIssueCoworkers: W('PROJECT','inherited')`, `runFieldToPropertyMigration: W('SETTINGS')`.
- `src/index.js` — `registerMigrationController` import+호출.
- `manifest.yml` — `jira:entityProperty`(moves-rms-entity-property, propertyKey movesRms, alias 3종) 추가. PoC 블록 3종(webtrigger poc-entity-property / function pocEntityProperty / entityProperty moves-rms-poc-entity-property) 제거. **jira:customField 선언 유지**(제거 금지 준수).
- `test/permission/permissionMap.contract.test.js` — MigrationController 등록 추가(계약 대조 통과).
- `src/resolver/projectIssue/__test__/recordIssueAssignedDate.test.js` — 프로퍼티 기준으로 전면 갱신.

### 삭제
- `src/poc/entityPropertyPoc.js` + `src/poc/` 디렉토리.

---

## 2. 실제 응답 shape (responseWrapper 통과 후 — 프론트 소비 기준, 글자 그대로)

프론트는 `invoke(...)` 결과를 `result.success` 확인 후 `result.content`(또는 최상위 필드)로 소비한다.

### 2-1. `updateIssueCoworkers`  (신규 — ProjectUsersController)
- 입력 payload: `{ issueId: string, accountIds: string[] }`  (issueId = 숫자 이슈 id 또는 key)
- 성공 응답:
```json
{ "success": true, "content": { "issueId": "<입력 그대로>", "coworkers": ["<accountId>", ...] } }
```
  - `coworkers` = write 후 저장된 accountId 배열(입력 accountIds에서 falsy 제거). 빈 배열이면 해제(`coworkers:[]`).
- 실패 응답: `{ success:false, error:{ name, code, message, cause } }` (프로퍼티 write 4xx/5xx → `code='ISSUE_PROPERTY_WRITE_<status>'`, coworker 편집은 **실패 전파** → 프론트 토스트).
- 갱신 후 프론트는 단건 `getIssue`(+`properties:'movesRms'`)로 재조회 권장(직접 read라 인덱스 지연 없음).

### 2-2. `recordIssueAssignedDate`  (계약 전환 — ProjectUsersController)
- 입력 payload: `{ issueIds: string[] }` (기존 `assignedDateFieldId`/`assignedByFieldId`는 **서버가 무시** — 프론트가 계속 보내도 무해). `accountId`는 context에서 서버 취득.
- 성공 응답(기존 shape 유지):
```json
{ "success": true, "recorded": 0, "skipped": 0 }
```
  - `recorded`/`skipped` = number. 이미 프로퍼티 `assignedAt` 있는 이슈는 skip(최초 등록 유지). best-effort/비차단(개별 실패도 skip 집계, throw 안 함).
- 저장되는 프로퍼티(참고): `{ ...prev, assignedAt:'yyyy-MM-dd'(date-only), assignedAtIso:ISO, assignedById:accountId|null }` — coworkers 등 기존 필드 merge 보존.

### 2-3. `runFieldToPropertyMigration`  (신규 — MigrationController, SETTINGS write)
- 입력 payload: `{ nextPageToken?: string|null, pageSize?: number(기본 50) }`
- 성공 응답:
```json
{ "success": true, "content": { "scanned": 0, "migrated": 0, "skipped": 0, "failed": 0, "nextPageToken": null, "done": true } }
```
  - `nextPageToken`: `string|null`. `done`: `boolean`(= `!nextPageToken`). 프론트는 `done:true`(=`nextPageToken===null`)까지 반복 invoke하며 `scanned/migrated/skipped/failed` 누적 표시.
- 실패 응답: `{ success:false, error:{...} }`(검색/필드조회 실패 시). 개별 이슈 write 실패는 throw 없이 `failed++`.

---

## 3. 계약 유지(shape 무회귀) resolver — 내부 read만 전환

아래는 **응답 shape 그대로**, 내부 coworker read만 fields→properties로 전환(프론트 계약 무변경).

| resolver | coworker 관련 응답 필드 | 상태 |
|---|---|---|
| `getIssueAnalysisList` / `downloadIssueAnalysisExcel` | `issue.coworkers:[{accountId,displayName,avatarUrl}]`, `totalWorkers` | **유지**(백엔드 resolve 완결). 엑셀은 `resources`(카운트) |
| `getProjectGanttData` | `Task.coworkers:[jira user객체]` | **유지**(GanttService resolve → GanttMapper 복원) |
| `getProjectProgressSummary` / `getProjectCostSummary` / `getPortfolioDashboard` | coworker 미노출, `totalWorkers` 카운트 | **유지**(accountId[].length, resolve 없음) |
| `getChartDataById`(assignee/issue) | 참여자 카운트/이름 | **유지**(participant=카운트, assignee차트는 includeCoworker 미전달로 현행) |
| `getProjectWorklog`/`getMyIssueList`/`getProjectCalendarWorklog` | raw issue passthrough에 `issue.properties.movesRms` 포함 | **프론트 소비 필요**: 프론트가 `issue.properties.movesRms.coworkers`+`useUserInfos`로 표시(설계 §2-3, §4-4) |

---

## 4. 설계와 달라진 점 (사유 명시)

1. **`getProjectIssuesByFilter`/`getProjectGanttIssues`/`getAssigneeStats`/`getIssueParticipantStats`의 `coworkerFieldId` 인자를 제거하지 않고 시그니처에 남김(무시).** 사유: 다수 호출부(ProjectProgress/ProjectCost/Portfolio/IssueAnalysis/ProjectDashboard)가 계속 전달 — 시그니처 유지로 호출부 변경 최소화(회귀 위험 축소). fields 조립에는 더 이상 사용하지 않고 항상 `&properties=movesRms`를 붙인다. `PortfolioAggregatorAsApp.test`가 검증하는 6번째 인자(`as`) 위치는 그대로 유지.
2. **`ProgressCalculator.normalizeIssue`는 `coworkerFieldId` 인자를 실제로 제거**(설계의 "단순화 가능"을 채택). 호출부는 `normalizeIssue(i, coworkerFieldId)`로 계속 호출하지만 2번째 인자는 무시 → ProjectCost/PortfolioAggregator 파일 무수정. 기존 `ProgressCalculator.test`(단일 인자 호출)와 호환.
3. **GanttService에서 `getCoworkerFieldIdApi` 조달 로직 제거.** coworker가 프로퍼티로 이관돼 필드 id가 불필요 → 간트 로드당 `/field` 호출 1회 절감. coworker user는 `resolveCoworkerUsersMap`로 복원.
4. **에러 코드**: 프로퍼티 read/write 실패는 신규 코드 문자열 `ISSUE_PROPERTY_READ_<status>` / `ISSUE_PROPERTY_WRITE_<status>`를 `ForgeAPIError`에 담아 throw(설계 §3-9의 "신규 or 재사용" 중 신규 선택, ErrorCodes 열거엔 미추가 — 기존 `APP_FIELD_WRITE_<status>`와 동일하게 동적 코드 문자열 관례 따름).
5. **manifest**: PoC 제거 후 `webtrigger` 모듈이 완전히 사라졌으므로 블록 자체를 삭제(빈 배열 남기지 않음). `function` 목록에서 `pocEntityProperty`만 제거하고 나머지(resolver/runMigration/uploadUsers/onInstall/portfolioSnapshot) 유지.

그 외 모든 항목은 설계서대로 구현. `moves_RMS_projectId` JQL·`updateProjectIdField`·`deleteProjectIssue` 무변경.

---

## 5. 테스트 결과

```
npm test (jest, 루트)
Test Suites: 14 passed, 14 total
Tests:       219 passed, 219 total
```
- 갱신: `recordIssueAssignedDate.test.js`(프로퍼티 기준 5케이스) 통과.
- 계약: `permissionMap.contract.test.js`(MigrationController 등록 추가) 통과 — 등록집합↔맵키 대조 OK, `updateIssueCoworkers`/`runFieldToPropertyMigration` 신규 2키 포함.
- 회귀: `PortfolioAggregatorAsApp`/`ProgressCalculator`/`GanttMapper`/`CostCalculator` 전부 통과(coworker 형태 전환 무회귀).

---

## 6. 프론트 연동 주의(다음 단계)

- coworker 표시는 전 소비처 `getIssueCoworkerIds(issue)=issue.properties?.movesRms?.coworkers ?? []` + `useUserInfos(ids)`(bulk) 3단계 통일(설계 §2-3).
- 편집 write는 `invoke('updateIssueCoworkers', {issueId: issue.id, accountIds})` — **`updateProjectIdField`(coworker 경로) 대체**. projectId 경로는 그대로.
- search 계열 프론트 직접 호출(`searchIssueWithJQL`/`getIssue`)에 `properties:['movesRms']` param 추가 필요.
- JQL alias 치환 4곳: `movesRmsCoworkers`(coworker in/=/currentUser), `movesRmsAssignedAt`(ORDER BY). `moves_RMS_projectId` 무변경.
- 마이그레이션 버튼: `nextPageToken`이 null(=`done:true`) 될 때까지 반복 invoke, `scanned/migrated/skipped/failed` 누적 표시(SETTINGS write 게이팅).
- **배포 순서**(중요): manifest `jira:entityProperty` 선언 배포 + `forge install --upgrade` 후에야 alias JQL/프로퍼티 인덱스 동작. 그 다음 마이그레이션 배치 실행.

---

## 7. wbsParent 델타 (설계 §11-B, 2026-07-14 추가 요청)

간트 계층(WBS 부모)도 같은 원인(팀 관리형 fields 미노출 + asApp write 성공 → 조용한 유실)으로 깨지므로 `movesRms.wbsParent`(부모 이슈 key 문자열 | null) 프로퍼티로 이전.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `src/resolver/gantt/GanttMapper.js` | `normalizeIssue`: `f[wbsParentFieldId]` → `issue.properties?.movesRms?.wbsParent`(trim·빈문자→null 정규화 유지). fieldIds 인자에서 `wbsParentFieldId` 제거(`{coworkerUserMap}`만) |
| `src/api/jira/issue/IssueApi.js` | `getProjectGanttIssues`: `wbsParentFieldId` 인자·`fieldList.push` 제거(`&properties=movesRms` 이미 동봉). 시그니처 `(projectId, coworkerFieldId=null, as='user')` |
| `src/resolver/gantt/GanttService.js` | `getAppFieldIds`/`updateAppCustomFieldValue` import·호출 **전면 제거**. `getProjectGanttData`·`fetchGanttGraph`가 `getProjectGanttIssues(projectId)`만 호출, `buildTasksAndLinks(issues, {coworkerUserMap})`. `setGanttParent` write를 `mergeIssueProperty(issueKey, {wbsParent: parentKey ?? null})`로 교체(해제=null, 다른 프로퍼티 필드 보존). key→숫자id 맵(`keyToId`)·`fieldIds` 반환 제거 |
| `src/api/jira/field/FieldApi.js` | `getAppFieldIds` **삭제**(소비처 0). 딸린 미사용 import(LogicalError/ErrorCodes)·캐시·`PREDECESSORS_FIELD_NAME` 정리. `getMovesFieldIds`에 `wbsParentFieldId`(moves_RMS_wbsParent) 추가 |
| `src/resolver/migration/MigrationService.js` | 소스 fields에 `wbsParentFieldId` 추가, `wbsParent: f[wbsParentFieldId]||null`(trim 정규화) 복사. 멱등 조건에 `!wbsParent` 추가(원본 전부 공란이면 skip) |
| `src/resolver/gantt/__test__/GanttMapper.test.js` | wbsParent를 `properties.movesRms.wbsParent` shape로 갱신(`issue()` 헬퍼 3번째 인자, FIELD_IDS={}) |

### 응답 계약 무변경 확인
- `getProjectGanttData` → `Task.wbsParent`(부모 key | null) **유지**. `Task.effectiveParent` 병합 규칙(wbsParent ?? jiraParent ?? null) 무변경.
- `setGanttParent` → `{ success:true, content:{ issueKey, parentKey, effectiveParent } }` **무변경**(write 저장소만 앱필드→프로퍼티).
- manifest `jira:entityProperty`에는 wbsParent **미추가**(JQL 검색 안 함, 미선언 path 저장은 PoC로 무해 확인).
- `predecessorsField` 관련 무변경(선후행은 네이티브 이슈 링크).

### 검증
- `f[wbsParentFieldId]` fields-read 잔존 0(마이그레이션 소스 read만 예외). `getAppFieldIds` 소비처 0 → 삭제 완료.
- 루트 `npm test`: **14 suites / 219 tests 전부 통과**(GanttMapper·GanttFolderService 포함, 회귀 0).
- 프론트 델타 없음(`Task.wbsParent` 계약 유지 — `useGanttMutations`/`ganttAdapter` 무변경).

---

## 8. 마이그레이션 기능 완전 제거 (2026-07-14 사용자 결정 — 사내 데이터 리셋 허용)

사용자가 사내 데이터 리셋을 허용 → 필드→프로퍼티 **마이그레이션 기능을 코드에서 완전 제거**. Jira 사이트의 데이터/프로퍼티는 미변경(코드 제거만). ※ `src/rdb/schema/migrate.js`(Forge SQL DDL, `runMigration`)는 **별개 기능이라 무변경**.

### 제거 파일/코드
| 대상 | 조치 |
|---|---|
| `src/resolver/migration/` (MigrationService.js, MigrationController.js) | 디렉토리 전체 삭제 |
| `src/index.js` | `registerMigrationController` import + 호출 제거 |
| `src/permission/PermissionMap.js` | `runFieldToPropertyMigration: W('SETTINGS')` 키 + Migration 섹션 제거 |
| `src/api/jira/field/FieldApi.js` | `getMovesFieldIds` 삭제(소비처가 마이그레이션뿐 → 제거). 딸린 미사용 상수(WBS_PARENT/ASSIGNED_DATE/ASSIGNED_BY_FIELD_NAME)·캐시 정리. **`getCoworkerFieldIdApi`는 PortfolioAggregator가 소비 → 유지** |
| `test/permission/permissionMap.contract.test.js` | MigrationController import + 등록 제거(등록집합↔맵키 동시 제거로 계약 통과 유지) |

### 소비처 grep 근거
- `getMovesFieldIds`: 소비처 = MigrationService 1곳뿐 → 삭제.
- `getCoworkerFieldIdApi`: 소비처 = `PortfolioAggregator.js`(line 485) → **유지**.
- `runFieldToPropertyMigration`/`registerMigrationController`/`resolver/migration`: 제거 후 잔존 0.

### 잔존 grep 결과 (`src/` 대상, case-insensitive)
`migration|getMovesFieldIds|runFieldToPropertyMigration|MigrationController|MigrationService` 검색 → 마이그레이션 기능 잔존 **0건**. 남은 hit은 전부 별개 기능인 **DB 스키마 마이그레이션**(`src/rdb/schema/migrate.js`·`isDBReady.js`의 `runMigration`/`applyMigrations`/`migrationRunner`, index.js의 `export { runMigration }`, seed/onInstall/CommonQuery의 `runMigration` 호출) — 지시대로 무변경.

### 남는 관련 자산(무변경)
- manifest `jira:entityProperty`(moves-rms-entity-property) — **런타임 프로퍼티 저장/JQL alias에 필요**하므로 유지(마이그레이션과 무관).
- `IssuePropertyApi`/`CoworkerResolver`/coworker·assignedAt·wbsParent 프로퍼티 read/write 경로 — 본 기능 핵심, 무변경.

### 테스트
- 루트 `npm test`: **14 suites / 219 tests 전부 통과**. `permissionMap.contract.test`(등록집합↔맵키 대조) 통과로 동기화 확인.
