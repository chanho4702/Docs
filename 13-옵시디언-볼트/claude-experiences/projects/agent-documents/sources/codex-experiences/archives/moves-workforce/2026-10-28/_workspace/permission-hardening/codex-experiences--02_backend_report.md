# 권한관리 고도화 (permission-hardening) — 백엔드 구현 리포트

작성: backend-engineer | 2026-07-03 | 근거: `01_architect_design.md` (SSOT) + 리더 확정사항
대상 브랜치: RFC-134 | 커밋: 미수행(지시대로)

> 다음 단계 frontend 는 이 문서의 **실제 응답 shape**을 글자 그대로 소비하라. 설계서와 다르게 구현한 부분은 아래 "설계 대비 변경분(diff)"에 명시했다.

---

## 0. 요약

- **테스트: `npm test` (jest) → 12 suites / 165 tests 전부 PASS.** 신규 계약 테스트 포함. 기존 테스트 무회귀.
- 신규 파일 8, 수정 파일 24 (컨트롤러 22 + 서비스/리포지토리/시드/에러/쿼리 등).
- `src/index.js` **변경 없음** (신규 컨트롤러 없음, `getPermissionCatalog` 는 기존 PermissionController 내 추가).
- i18n(locales) 값은 **미추가** — frontend 가 merge 워크플로우로 추가(§9에 전체 키 목록 명시).

---

## 1. 구현/변경 파일 전체 목록

### 신규 (8)
| 파일 | 역할 |
|---|---|
| `src/permission/ResourceCatalog.js` | 리소스 카탈로그 14키 단일 소스 + 파생 헬퍼(getSeedPages/mergeSetPages/pagesToResourceMap/getCatalogSections/getMigrateSource/getDefaultForNew/RESOURCE_KEYS). **descriptionKey 포함**(리더 확장) |
| `src/permission/PermissionMap.js` | 110개 resolver → 권한 매핑(PUBLIC/SELF/OR/project mode) |
| `src/permission/PrincipalResolver.js` | `resolvePrincipal(context)` — L1 TTL(30초) 캐시, context.accountId, ADMINISTER, SQL, KVS 병합, projectScope, memberProjectIds lazy. `scopedProjectIds(principal)`, `clearPrincipalCache()` |
| `src/permission/permissionGuard.js` | `guard(meta)`, `isSatisfied`(OR), `guardedDefine`, detail/inherited 소속검증, `req.principal` 부착 |
| `src/error/PermissionError.js` | name `'PermissionDeniedError'` |
| `src/error/ProjectScopeError.js` | name `'ProjectScopeDeniedError'` |
| `test/permission/permissionMap.contract.test.js` | 등록집합 ↔ 매핑집합 대조 + 구조 유효성 |

### 수정 (컨트롤러 22 — guardedDefine 치환)
UserController, RoleController, LevelController, ProjectController, ProjectUsersController, JobController, ProjectStatusController(`projectStatusController`), PermissionController, SettingController, ProjectDashboardController, SchedulerController, MyWorkController(.jsx), MyScheduleController(.jsx), PublicHolidayController, IssueAnalysisController, ResourceAnalysisController, ProjectCalendarController, ProjectProgressController, PortfolioDashboardController, ProjectCostController, GanttController, StorageController.
- **SentryConfig / WorklogController 는 미변경**(각각 원시 define 유지·등록함수 0). getSentryDSN 은 PUBLIC 매핑이나 raw string 반환 보존 위해 guardedDefine 미적용(§8).

### 수정 (서비스/리포지토리/기타)
| 파일 | 변경 |
|---|---|
| `src/utils/errors/ErrorCodes.js` | 코드 4개 추가 |
| `src/resolver/backoffice/permission/PermissionService.js` | userPermissionCheckService(accountId) PrincipalResolver 공유·projectScope·완전 병합 / add·update·findById·list `projectScope` / 신규 `getPermissionCatalogService` |
| `src/permission/PrincipalResolver.js` | (신규) |
| `src/resolver/project/ProjectService.js` | findProject/getActiveProjects/kanban 2종 principal→memberProjectIds 필터 |
| `src/resolver/project/ProjectRepository.js` | `scopeCondition()` + 4개 리포지토리 `project_id IN` 분기 |
| `src/resolver/projectCalendar/ProjectCalendarService.js` | selectedProjectIds ∩ memberProjectIds 교집합 |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | projects 목록 memberProjectIds 필터 |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_PROJECT_IDS_BY_ACCOUNT` |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | `findProjectIdsByAccountRepository` |
| `src/seed/SeedData.js` | `addPermissionSeed` 카탈로그 파생 덮어쓰기 / 신규 `migratePermissionSets` / runSeed 순서 |
| `src/trigger/onInstall.js` | `SEED_VERSION` 5→6 |

---

## 2. 실제 응답 shape (글자 그대로)

### 2-1. `userPermissionCheck` (PUBLIC, payload 없음 — accountId 는 context)
```json
{
  "success": true,
  "isUser": true,
  "name": "Member",
  "projectScope": "ALL",
  "pages": [
    { "pageId": "DASHBOARD",                 "value": { "read": true,  "write": false } },
    { "pageId": "REPORT",                    "value": { "read": true,  "write": false } },
    { "pageId": "KANBAN",                    "value": { "read": true,  "write": false } },
    { "pageId": "PROJECT",                   "value": { "read": true,  "write": false } },
    { "pageId": "PROJECT_GANTT",             "value": { "read": true,  "write": false } },
    { "pageId": "PROJECT_COST",              "value": { "read": false, "write": false } },
    { "pageId": "SETTINGS",                  "value": { "read": false, "write": false } },
    { "pageId": "USER_MANAGEMENT",           "value": { "read": false, "write": false } },
    { "pageId": "ROLE_MANAGEMENT",           "value": { "read": false, "write": false } },
    { "pageId": "LEVEL_MANAGEMENT",          "value": { "read": false, "write": false } },
    { "pageId": "PERMISSION_MANAGEMENT",     "value": { "read": false, "write": false } },
    { "pageId": "PROJECT_STATUS_MANAGEMENT", "value": { "read": false, "write": false } },
    { "pageId": "PUBLIC_HOLIDAY_MANAGEMENT", "value": { "read": true,  "write": false } },
    { "pageId": "STORAGE_MONITORING",        "value": { "read": false, "write": false } }
  ]
}
```
- **pages 는 항상 카탈로그 14키 전체**(저장값 오버레이, 없으면 카탈로그 기본값). 순서는 위 고정 순서.
- `WORKLOG` **없음**(카탈로그에서 제거). admin → `name:"Admin"`, 모든 read/write true, `projectScope:"ALL"`.
- 미등록 사용자 → `isUser:false, name:"undefined"`, 전 키 `{read:false,write:false}`, `projectScope:"ALL"`.
- `id`/`edit` 미포함(내부용). **`projectScope` 가 신규 필드** — 구 프론트가 무시해도 안전.
- accountId 미수신(비정상) 시에도 `success:true` + 위 미등록 shape 반환(fail-close, throw 안 함).

### 2-2. `getPermissionCatalog` (신규, PUBLIC, payload 없음)
```json
{
  "success": true,
  "sections": [
    {
      "sectionId": "WORKFORCE",
      "sectionLabelKey": "common.sections.workforce",
      "resources": [
        { "key": "DASHBOARD",     "labelKey": "common.pages.dashboard", "descriptionKey": "permission.desc.DASHBOARD" },
        { "key": "REPORT",        "labelKey": "common.pages.report",    "descriptionKey": "permission.desc.REPORT" },
        { "key": "KANBAN",        "labelKey": "common.pages.kanban",    "descriptionKey": "permission.desc.KANBAN" },
        { "key": "PROJECT",       "labelKey": "common.pages.project",   "descriptionKey": "permission.desc.PROJECT" },
        { "key": "PROJECT_GANTT", "labelKey": "common.pages.gantt",     "descriptionKey": "permission.desc.PROJECT_GANTT" },
        { "key": "PROJECT_COST",  "labelKey": "common.pages.cost",      "descriptionKey": "permission.desc.PROJECT_COST" }
      ]
    },
    {
      "sectionId": "SETTINGS",
      "sectionLabelKey": "common.sections.settings",
      "resources": [
        { "key": "SETTINGS",                  "labelKey": "common.pages.settings",   "descriptionKey": "permission.desc.SETTINGS" },
        { "key": "USER_MANAGEMENT",           "labelKey": "common.pages.user",       "descriptionKey": "permission.desc.USER_MANAGEMENT" },
        { "key": "ROLE_MANAGEMENT",           "labelKey": "common.pages.role",       "descriptionKey": "permission.desc.ROLE_MANAGEMENT" },
        { "key": "LEVEL_MANAGEMENT",          "labelKey": "common.pages.level",      "descriptionKey": "permission.desc.LEVEL_MANAGEMENT" },
        { "key": "PERMISSION_MANAGEMENT",     "labelKey": "common.pages.permission", "descriptionKey": "permission.desc.PERMISSION_MANAGEMENT" },
        { "key": "PROJECT_STATUS_MANAGEMENT", "labelKey": "common.pages.status",     "descriptionKey": "permission.desc.PROJECT_STATUS_MANAGEMENT" },
        { "key": "PUBLIC_HOLIDAY_MANAGEMENT", "labelKey": "common.pages.public",     "descriptionKey": "permission.desc.PUBLIC_HOLIDAY_MANAGEMENT" },
        { "key": "STORAGE_MONITORING",        "labelKey": "common.pages.storage",    "descriptionKey": "permission.desc.STORAGE_MONITORING" }
      ]
    }
  ]
}
```
> **리더 승인 확장 적용됨**: 각 resource 항목에 `descriptionKey` 포함(설계서 §2-A `{key,labelKey}` 계약보다 우선). 프론트는 `t(descriptionKey)` 로 각 권한 설명을 렌더. i18n 값은 frontend 가 추가.

### 2-3. 가드 거부 에러 (4종)
모두 `responseWrapper` 표준 직렬화 → `{ success:false, error:{ name, code, message, cause } }`.

| 상황 | error.name | error.code | error.message |
|---|---|---|---|
| 리소스 권한 미충족 | `PermissionDeniedError` | `PERMISSION_DENIED` | `You do not have permission to perform this action` |
| PermissionMap 미선언 | `PermissionDeniedError` | `PERMISSION_UNMAPPED` | `Resolver '<name>' has no permission mapping` |
| context.accountId 부재 | `PermissionDeniedError` | `PERMISSION_PRINCIPAL_UNRESOLVED` | `Principal accountId is not available in context` |
| ④ 비소속 프로젝트 상세 접근 | `ProjectScopeDeniedError` | `PERMISSION_PROJECT_SCOPE_DENIED` | `You do not have access to this project` |

`cause` 는 전부 `''`. 예:
```json
{ "success": false, "error": { "name": "ProjectScopeDeniedError", "code": "PERMISSION_PROJECT_SCOPE_DENIED", "message": "You do not have access to this project", "cause": "" } }
```

> **프론트 분기 주의**: `error.name` 이 아니라 **`error.code` 로 분기**하라. `PERMISSION_PROJECT_SCOPE_DENIED` 는 상세 화면 onError 에서 "접근 권한 없는 프로젝트" 안내/리다이렉트, 나머지 `PERMISSION_*` 는 권한 없음 토스트.

### 2-4. `addPermission` / `updatePermission` (projectScope 입출력)
- `addPermission` 입력: `{ name, pages:[{pageId,value:{read,write}}], projectScope?:'ALL'|'MEMBER_ONLY' }` — **projectScope 생략 시 서버가 `'ALL'` 저장**.
- `updatePermission` 입력: `{ id, name, pages, isNameChanged, projectScope?:'ALL'|'MEMBER_ONLY' }` — 생략 시 `'ALL'`.
- 두 함수 응답: `{ "success": true }` (기존 유지).
- 저장 규칙: `projectScope !== 'MEMBER_ONLY'` 인 값은 전부 `'ALL'` 로 정규화.

### 2-5. `findPermissionById` (응답 확장)
```json
{ "success": true, "id": "permission-xxxx", "edit": true, "name": "협력사", "pages": [ ... ], "projectScope": "MEMBER_ONLY" }
```
- 기존 세트에 `projectScope` 필드 부재 시 `'ALL'` 폴백.

### 2-6. `getPermissionList` (부수 확장)
```json
{ "success": true, "data": [ { "id": "...", "name": "...", "pages": [ ... ], "edit": true, "projectScope": "ALL" } ] }
```
- `projectScope` 를 각 항목에 추가(모달이 필요 없으면 무시 가능, 하위호환).

---

## 3. PermissionMap 최종 매핑 (설계서 §2-B/§2-C 대비 변경분 diff)

설계서 §2-B/§2-C 를 **그대로** 구현. 아래는 설계 표에 명시가 모호했던 항목의 확정/미세 조정만 diff 로 기록.

| 함수 | 설계 표기 | 구현 확정값 | 사유 |
|---|---|---|---|
| `updateFromKanban` | (2-C 미열거) | `KANBAN/write`, project:**`detail`** | payload.project_id 존재 → MEMBER_ONLY 시 드래그 대상 프로젝트 소속 검증(방어 강화). ALL/admin 무영향 |
| `insertProject` | PROJECT/write | project:`none` | insert 는 projectId 없음 |
| `getProjectCalendarWorklog` | detail(배열) | `PROJECT/read`, project:**`list`** | 가드는 principal 부착만, 서비스가 `selectedProjectIds ∩ memberProjectIds` 교집합 수행(단일 pid 검증 부적합) |
| `getAllProjectWorkersSchedule` | PROJECT/read detail | 동일(`projectId` 추출) | 설계 가정대로 |
| inherited write 전체(ProjectUsers 6·Dashboard write 4·Gantt write 8) | inherited | project:`inherited` + **projectId 추출 시 검증** | 가드가 `payload.projectId ?? payload.project_id` 추출되면 소속 검증, 없으면 상위 read scope 의존(§10-8 한계 그대로) |

- **project mode 4종**: `none`/`list`/`detail`/`inherited`. 가드는 `detail`·`inherited` 에서만 pid 소속 검증(pid 추출 가능 시), `list`·`none` 은 미검증(서비스 필터 or 스코프 무관).
- OR-grant 5종 그대로: `getRoleList`, `getLevelList`, `getPermissionList`, `getProjectStatusList`, `getStatusLink`, `addProjectStatusFromKanban`.
- PUBLIC 5종: `userPermissionCheck`, `getPermissionCatalog`, `getSettingData`, `getSentryDSN`, `getPublicHolidayList`.
- SELF 9종: `getUserInfo` + MyWork 4 + MySchedule 개인 CRUD 4(add/update/delete/list).
- 총 매핑 키 **110** = 기존 등록 109 + 신규 `getPermissionCatalog` 1. 계약 테스트로 등록집합과 1:1 확인됨.

---

## 4. SELF 스코프 강제 지점 (context.accountId 덮어쓰기)

| 함수 | 덮어쓴 필드 |
|---|---|
| `getUserInfo` | `accountId` |
| `getMyProjectList` / `getProjectWorklog` / `getMyCalendarWorklog` / `getMyIssueList` | `accountId` |
| `addMySchedule` / `updateMySchedule` / `getMyScheduleList` | `account_id` |
| `deleteMySchedule` | (schedule_id 만 받음 — 덮어쓸 accountId 없음, SELF 통과) |

프론트가 payload 로 넘긴 accountId 는 **무시**되고 서버 context 값으로 강제됨(타인 데이터 열람/위변조 차단).

---

## 5. 프로젝트 데이터 범위(④) 필터 주입 지점

| 지점(파일:함수) | 방식 |
|---|---|
| `ProjectController` findProject/getActiveProjects/getProjectsRecentForKanban/getOldProjectsForKanban | 핸들러가 `principal` 을 서비스에 전달 |
| `ProjectService` 동일 4함수 | `scopedProjectIds(principal)` → 리포지토리 `memberProjectIds` 인자 |
| `ProjectRepository` findProjectRepository/getActiveProjectsRepository/getProjectsRecentForKanbanRepository/getOldProjectsForKanbanRepository | `scopeCondition()`: null→무필터, []→`1=0`(빈 결과), [ids]→`project_id IN (UUID_TO_BIN(...))` (UUID 형식 검증 후) |
| `ProjectCalendarService.getProjectCalendarWorklogService` | `selectedProjectIds ∩ memberProjectIds` 교집합(교집합 공집합 시 `{data:[]}`) |
| `PortfolioDashboardService.getPortfolioDashboardService` | `projects` 목록을 memberProjectIds 로 필터 (⚠️ utilization/problemIssues **글로벌 메타는 현행 유지** — 설계 §10-9 한계, 목록만 축소) |
| 가드(`permissionGuard.enforceProjectScope`) | detail/inherited 에서 `payload.projectId ?? payload.project_id` 미소속 시 `PERMISSION_PROJECT_SCOPE_DENIED` |
| `PrincipalResolver` | MEMBER_ONLY 비admin 만 `FIND_PROJECT_IDS_BY_ACCOUNT` 1회(SQL, INDEX(account_id)) lazy 조회, L1 캐시 동승 |

- **소속 정의 = `projectusers` 인력 등록**(확정). `SELECT DISTINCT BIN_TO_UUID(project_id) FROM projectusers WHERE account_id=?`.
- **하위호환**: `scopedProjectIds(undefined)` = null → 필터 없음. 배치 경로(`PortfolioAggregator`, `SchedulerService`)가 principal 없이 `getActiveProjectsService()` 호출해도 전체 조회 유지(정상).

---

## 6. 마이그레이션 (SEED_VERSION 5→6)

- `runSeed` 순서: `addPermissionSeed()` → `migratePermissionSets()` → status/setting/link.
- `addPermissionSeed`: Admin/Member 를 카탈로그에서 결정적 재생성 후 **덮어쓰기**(기존 `if(existing) continue` 제거). 둘 다 `projectScope:'ALL'`, `edit:false`. Member 는 `PROJECT_COST` read=false, `WORKLOG` 제거됨.
- `migratePermissionSets`(커스텀 세트만, 멱등):
  - 누락 키 추가 — `PROJECT_GANTT`←`migrateFrom:PROJECT`, `PROJECT_COST`←`migrateFrom:REPORT`(둘 다 소스 값 부재 시 defaultForNew=read:false).
  - 고아 키(`WORKLOG` 등) 제거.
  - `projectScope` 부재 시 `'ALL'` 주입(MEMBER_ONLY 는 유지).
- KVS `save` 키 단위 멱등 → 중단·재시도 안전(트랜잭션 불요).

---

## 7. 성능 (설계 §4 준수)

- admin: Jira `/mypermissions` 1회. 비admin: Jira 1 + users SQL 1 + KVS 1. MEMBER_ONLY 시 + projectusers SQL 1.
- L1 in-memory TTL 30초 캐시(accountId 키). warm 컨테이너 후속 가드 조회 0회. list 필터는 기존 쿼리에 `IN` 절만 추가(추가 왕복 없음). detail 검증은 in-memory Set.
- asApp 미도입(신규). context.accountId 사용으로 `/myself` 호출 제거.

---

## 8. 프론트가 알아야 할 주의사항

1. **에러 분기는 `error.code`** (name 아님). `PERMISSION_PROJECT_SCOPE_DENIED`(상세 접근불가 안내/리다이렉트) vs `PERMISSION_DENIED`/`PERMISSION_UNMAPPED`/`PERMISSION_PRINCIPAL_UNRESOLVED`(권한없음 토스트).
2. **`userPermissionCheck.pages` 는 카탈로그 14키 전체**를 항상 포함(`WORKLOG` 없음). fail-close 는 프론트에서 `?? false`.
3. **`getPermissionCatalog.resources` 는 `{key, labelKey, descriptionKey}`** — descriptionKey 로 설명 렌더.
4. **`projectScope`**: `userPermissionCheck`(store 노출), `findPermissionById`(모달 초기값), add/update(payload) 4곳. 값 `'ALL'|'MEMBER_ONLY'`.
5. **`getSentryDSN` 은 여전히 raw 문자열 반환**(responseWrapper 미적용). 기존 소비 코드 그대로.
6. **목록/칸반/포트폴리오는 서버 필터 결과 그대로** — 프론트 추가 필터 불필요(회귀 확인만).
7. **비용 탭 게이트**: 프론트에서 `canRead('PROJECT_COST')` 로 전환 필요(시드 Member read=false 라 Member 비노출 — 확정된 behavior change).

## 9. i18n (frontend 가 `locales/kr`·`locales/en` 추가 후 merge — 백엔드 미추가)

### `common.json`
`common.pages.gantt`(간트/Gantt), `common.pages.cost`(비용/Cost), `common.sections.workforce`(WorkForce), `common.sections.settings`(설정/Settings).
> `common.pages.{dashboard,report,kanban,project,settings,user,role,level,permission,status,public,storage}` 는 기존 재사용.

### `permission.json` — 에러/스코프 (설계 §8)
`permission.error.denied`, `permission.error.unmapped`, `permission.toast.deniedTitle`, `permission.scope.label`, `permission.scope.all`, `permission.scope.memberOnly`, `permission.scope.description`, `permission.error.projectScopeDenied`, `permission.error.projectScopeDeniedTitle`.

### `permission.json` — 리소스 설명 (descriptionKey, 리더 확장)
14키 각각: `permission.desc.DASHBOARD`, `permission.desc.REPORT`, `permission.desc.KANBAN`, `permission.desc.PROJECT`, `permission.desc.PROJECT_GANTT`, `permission.desc.PROJECT_COST`, `permission.desc.SETTINGS`, `permission.desc.USER_MANAGEMENT`, `permission.desc.ROLE_MANAGEMENT`, `permission.desc.LEVEL_MANAGEMENT`, `permission.desc.PERMISSION_MANAGEMENT`, `permission.desc.PROJECT_STATUS_MANAGEMENT`, `permission.desc.PUBLIC_HOLIDAY_MANAGEMENT`, `permission.desc.STORAGE_MONITORING`.
> 각 커버 범위는 `ResourceCatalog.js` 의 `covers` 주석 참조.

---

## 10. 테스트 결과

```
npx jest
Test Suites: 12 passed, 12 total
Tests:       165 passed, 165 total
```
- 신규 `test/permission/permissionMap.contract.test.js`: 등록집합↔매핑집합 1:1, 중복 없음, 구조 유효성(모든 grant resource 가 카탈로그 키) 통과.
- 기존 11 suites 무회귀(StorageService 의 `console.error` 로그는 의도된 에러경로 테스트의 정상 출력).

---

## §9 검증 후속 수정 — 스코프 ④ 잔여 gap (`getIssueWorklogDetail`)

### 문제 (verifier 03_verify_report.md)
`getIssueWorklogDetail` 은 PermissionMap 에서 `project:'detail'` 이었으나 payload 가 `{ issueKey, hourRate }` 뿐 **projectId 가 없다**(`IssueAnalysisService.js:104`, 프론트도 미전달). 가드 `enforceProjectScope` 의 pid 가 undefined → 검증 skip. → MEMBER_ONLY 사용자가 direct-invoke 로 비소속 프로젝트 이슈의 워크로그 상세를 열람 가능.

### 전수 점검 결과 (REPORT/detail 계열)
| 함수 | payload projectId | 판정 |
|---|---|---|
| getIssueAnalysisList | `{ projectId, ... }` | 정상(가드 detail 검증) |
| **getIssueWorklogDetail** | `{ issueKey }` **없음** | **gap → 수정** |
| downloadIssueAnalysisExcel | `{ projectId, ... }` | 정상 |
| getResourceAnalysisList | `{ projectId, ... }` | 정상 |
| getResourceWorklogDetail | `{ projectId, accountId, ... }` | 정상(projectId 로 가드 검증. accountId 는 프로젝트 내 필터라 스코프 모델상 허용) |
| getProjectProgressSummary | `{ projectId, ... }` | 정상 |
| getProjectCostSummary | `{ projectId, ... }` | 정상 |

→ **gap 은 `getIssueWorklogDetail` 1건만**. 나머지는 projectId 보유로 가드가 이미 소속 검증.

### 수정 방침 (리더 결정: 백엔드 서비스 레벨 소속 검증 — issue→project 역산)
프론트 projectId 전달 방식은 payload 조작(소속 pid + 비소속 issueId) 우회가 가능 → **서버가 issueKey 로 프로젝트를 직접 역산**. 앱은 Jira 이슈를 커스텀필드 `moves_RMS_projectId` 로 앱 프로젝트에 연결하므로, 이 JQL 절을 재사용해 확인(앱 DB 에는 이슈↔프로젝트 매핑 테이블이 없음 — Jira 필드가 소스).

### 변경 파일 (4)
| 파일 | 변경 |
|---|---|
| `src/api/jira/issue/IssueApi.js` | 신규 `isIssueInProjects(issueKey, projectIds)` — `key = "<issueKey>" AND (moves_RMS_projectId = "pid" OR ...)` JQL 1회로 소속 여부 boolean. issueKey 는 `/^[A-Za-z0-9_-]+$/` 검증(JQL 인젝션 차단) |
| `src/resolver/issueAnalysis/IssueAnalysisService.js` | `getIssueWorklogDetailService(payload, principal)` — `scopedProjectIds(principal)!==null`(MEMBER_ONLY) 일 때 `isIssueInProjects` 로 검증, 미소속이면 `ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)` throw. ALL/admin 은 추가 조회 0 |
| `src/resolver/issueAnalysis/IssueAnalysisController.js` | 핸들러가 `principal` 을 서비스에 전달 |
| `src/permission/PermissionMap.js` | `getIssueWorklogDetail`: `detail` → **`list`**(가드는 principal 부착만, 서비스가 실제 검증) + 주석 |

### 동작/성능
- **MEMBER_ONLY**: 워크로그 페치 전에 Jira 검색 1회(`fields=key&maxResults=1`) 추가. 미소속 → `PERMISSION_PROJECT_SCOPE_DENIED`(에러 shape 은 §2-3 와 동일 — 프론트 분기 불변).
- **ALL/admin**: `scopedProjectIds` = null → 추가 조회 0(기존과 동일).
- **direct-invoke 방어**: payload 로 projectId 를 조작해도 서버가 issueKey→project 를 역산하므로 우회 불가. issueKey 인젝션은 정규식으로 차단.
- 프론트 계약 변화 없음(`getIssueWorklogDetail` 입력/성공 shape 동일, MEMBER_ONLY 비소속 이슈일 때만 scope 에러).

### 테스트
```
npx jest → Test Suites: 12 passed, Tests: 165 passed
```
계약 테스트 무영향(`list` 는 유효 project mode).

---

## §10 시드 scope 토글 완화 (사용자 결정)

시드 세트(edit:false)도 **projectScope 토글만** 편집 가능하게 완화. Admin 은 예외(항상 ALL).

### 설계 결정: 신규 resolver `updatePermissionScope` (기존 updatePermission 재사용 안 함)
- **근거(코드 확인)**: `updatePermissionService` 는 저장 시 `data = { edit:true, name, pages, projectScope }` 로 **`edit:true` 를 무조건 세팅하고 name/pages 를 통째로 덮어쓴다**(`PermissionService.js:76-92`). 이를 Member(edit:false 시드)에 재사용하면 (1) 시드 잠금이 풀리고(edit:false→true), (2) pages 가 프론트 payload 로 오염될 위험. → **scope 전용 경로 분리가 안전**하다고 판단.

### 신규 resolver `updatePermissionScope`
| 항목 | 값 |
|---|---|
| 권한 | `PERMISSION_MANAGEMENT/write` (PermissionMap 추가, 계약 테스트 동기화 완료) |
| 입력 payload | `{ id: string, projectScope: 'ALL'\|'MEMBER_ONLY' }` |
| 성공 응답 | `{ "success": true }` |
| 서비스 로직 | 세트 조회 → Admin(`name==='Admin'` 또는 `id==='permission-Admin'`)이면 거부 → 그 외는 **기존 데이터 유지한 채 projectScope 만 `normalizeScope` 로 갱신 저장**(edit·name·pages 불변) |

**에러 케이스 (responseWrapper 표준 직렬화):**
```json
// Admin 세트에 scope 변경 시도
{ "success": false, "error": { "name": "LogicalError", "code": "PERMISSION_SCOPE_ADMIN_IMMUTABLE", "message": "PERMISSION_SCOPE_ADMIN_IMMUTABLE", "cause": "" } }
// 존재하지 않는 세트 id
{ "success": false, "error": { "name": "LogicalError", "code": "PERMISSION_SET_NOT_FOUND", "message": "PERMISSION_SET_NOT_FOUND", "cause": "" } }
```
> 프론트는 `error.code === 'PERMISSION_SCOPE_ADMIN_IMMUTABLE'` 로 Admin 거부 분기(토스트). Admin 세트는 애초에 UI 에서 scope 토글을 비활성/숨김 권장(서버는 방어).

### 시드 재생성 시 scope 보존 (`addPermissionSeed`, 멱등)
- **Admin**: 항상 `projectScope:'ALL'` 강제(불변).
- **Member**: pages/name/edit 는 카탈로그에서 재생성하되, **저장된 Member 세트의 기존 projectScope 를 `findById('permission-Member')` 로 읽어 보존**(MEMBER_ONLY 면 유지, 없으면 'ALL'). → 관리자가 토글한 scope 가 SEED_VERSION 업 마이그레이션에서 유실되지 않음. 재실행해도 동일 결과(멱등).

### 프론트 소비 (추가 변경 불요 — 확인만)
- `findPermissionById` / `getPermissionList` 응답에 **이미 `projectScope` 포함**(§2-5·§2-6). 프론트는 시드 세트의 현재 scope 를 그대로 읽어 토글 초기값으로 사용.
- 저장은 **시드/edit:false 세트 → `updatePermissionScope({id, projectScope})`**, 커스텀 edit:true 세트 → 기존 `updatePermission` 경로 그대로.

### 변경 파일 (5)
`src/resolver/backoffice/permission/PermissionService.js`(신규 `updatePermissionScopeService`), `PermissionController.js`(등록), `src/permission/PermissionMap.js`(`updatePermissionScope: PERMISSION_MANAGEMENT/write`), `src/utils/errors/ErrorCodes.js`(`PERMISSION_SET_NOT_FOUND`·`PERMISSION_SCOPE_ADMIN_IMMUTABLE`), `src/seed/SeedData.js`(Member scope 보존).

### 테스트
```
npx jest → Test Suites: 12 passed, Tests: 165 passed
```
계약 테스트가 신규 `updatePermissionScope` 등록 ↔ 매핑 1:1 확인.

### §10-후속: `updatePermissionService` 시드 방어 (verifier 2차 차단성 실패 수정)
**문제**: `updatePermissionService` 가 진입부 방어 없이 `data={edit:true,name,pages,projectScope}` 를 무조건 save → direct-invoke 로 (1) `updatePermission({id:'permission-Member',pages:[...]})` 로 Member 시드 `edit:false→true` 잠금해제 + pages 오염, (2) `updatePermission({id:'permission-Admin',projectScope:'MEMBER_ONLY',...})` 로 `updatePermissionScope` 의 Admin-immutable 가드 우회 가능.

**수정** (`PermissionService.js` `updatePermissionService` 진입부):
1. `findById(id)` — 없으면 `PERMISSION_SET_NOT_FOUND` 거부.
2. `existing.edit === false`(시드 세트 Admin/Member)면 **`PERMISSION_SEED_IMMUTABLE` 거부** (신설 코드). 시드의 name/pages 변경 전면 차단, projectScope 변경은 `updatePermissionScope` 전용 경로로만.
3. 커스텀 세트(`edit:true`)는 기존 동작 유지(name 중복검사·save 불변).

**신설 에러 코드**: `PERMISSION_SEED_IMMUTABLE`. 거부 shape:
```json
{ "success": false, "error": { "name": "LogicalError", "code": "PERMISSION_SEED_IMMUTABLE", "message": "PERMISSION_SEED_IMMUTABLE", "cause": "" } }
```
(대상 없음은 `PERMISSION_SET_NOT_FOUND`, shape 동형.)

**`addPermissionService` 확인(변경 없음)**: id 를 서버가 `"permission-"+crypto.randomUUID()` 로 생성 → 시드 id(`permission-Admin`/`permission-Member`) 충돌 불가. name `'Admin'`/`'Member'` 중복 생성은 `checkDuplicated`(같은 name 의 다른 key 존재 시 `NAME_DUPLICATED`)가 이미 차단. → 방어 불요.

**변경 파일 (2)**: `src/resolver/backoffice/permission/PermissionService.js`(updatePermissionService 진입부 방어), `src/utils/errors/ErrorCodes.js`(`PERMISSION_SEED_IMMUTABLE`).
**프론트 영향 없음**: 이미 시드 세트는 `updatePermissionScope` 로 라우팅(verifier 확인). 커스텀 세트 `updatePermission` 경로 정상 동작 유지.
**테스트**: `npx jest → 12 suites / 165 tests 전부 PASS`.
