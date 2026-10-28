# 권한관리 고도화 (permission-hardening) — 통합 정합성 검증 리포트

작성: integration-verifier | 2026-07-03 | 근거: `01_architect_design.md`(SSOT) + `02_backend_report.md` + `02_frontend_report.md` + 실제 소스 교차 읽기
대상 브랜치: RFC-134 | 검증 방식: 생산자/소비자 양쪽 동시 읽기 + jest/build 실행

## 요약

| 분류 | 개수 | 항목 |
|---|---|---|
| **통과** | 8 | 경계면 교차, 가드 전수성, fail-close, **스코프 ④(재검증 완료)**, 마이그레이션, i18n, 테스트/빌드, 성능 |
| **실패** | 0 | — (재검증 2차 §11-3 `updatePermission` 시드 오염 방어 부재 → backend 수정으로 **해소**) |
| **미검증** | 1 | 런타임 실제 권한 거부/스코프 차단 E2E (배포·실사용자 필요) |

빌드/테스트(최신): 백엔드 jest **12 suites / 165 pass**, 프론트 jest **6 suites / 58 pass**, 프론트 build **성공(exit 0)**.

> **재검증 이력**:
> - (2026-07-03) 초판 실패 `getIssueWorklogDetail` 스코프 no-op → backend 수정으로 **해소**(§4).
> - (2026-07-06) 시드 scope 토글 완화 재검증 2차(§11) → 신규 `updatePermissionScope` 경계면 정합. `updatePermission` 시드 오염 방어 부재 실패 발견 → **backend 재수정으로 해소**(§11-3, `edit:false` 세트 `PERMISSION_SEED_IMMUTABLE` 거부).

---

## 1. 경계면 교차 — **통과**

양쪽 실제 소스를 병기해 대조. responseWrapper 가 result 를 최상위 spread(`{success, ...result}`) 하므로 프론트는 `res.content.*` 가 아니라 `res.*` 로 접근 — 전 경계면에서 일치.

| 경계면 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| userPermissionCheck | `PermissionService.js:117-138` (`{isUser,name,projectScope,pages:[{pageId,value:{read,write}}]}`) | `usePermissionStore.js:18-38` (`res.pages`/`page.pageId`/`page.value.read/write`, `res.isUser`, `res.projectScope ?? 'ALL'`) | ✅ 필드/중첩 일치 |
| getPermissionCatalog | `ResourceCatalog.getCatalogSections()` + `PermissionService.js:144-146` (`sections[].{sectionId,sectionLabelKey,resources[].{key,labelKey,descriptionKey}}`) | `usePermissionCatalog.js:22-45` (`res.sections`→section.sectionId/sectionLabelKey/resources[].key/labelKey/descriptionKey) | ✅ descriptionKey 확장 양측 반영 |
| addPermission | `PermissionService.js:15-28` (`{name,pages,projectScope}`) | `usePermissionRegistrationModal.js:80-90` (`{name,projectScope,pages:[{pageId,value:{read,write}}]}`) | ✅ |
| updatePermission | `PermissionService.js:76-93` (`{id,name,pages,isNameChanged,projectScope}`) | `usePermissionEditModal.js:137-143` (동일) | ✅ |
| findPermissionById | `PermissionService.js:46-59` (`{id,edit,name,pages,projectScope}`) | `usePermissionEditModal.js:69-85` (`data.pages/name/edit/projectScope ?? 'ALL'`) | ✅ |
| 가드 거부 에러 | `PermissionError`/`ProjectScopeError` → responseWrapper `{success:false,error:{name,code,message,cause}}` | `utils/permissionError.js:19-38` (`res.error.code` 분기, **name 아님**) | ✅ |

**에러코드 4종 글자 단위 대조**: `ErrorCodes.js:64-67` ↔ `permissionError.js:12-17` — `PERMISSION_DENIED`/`PERMISSION_UNMAPPED`/`PERMISSION_PRINCIPAL_UNRESOLVED`/`PERMISSION_PROJECT_SCOPE_DENIED` 전부 일치. 프론트가 `error.code` 로 분기(name 미사용) 확인.

- `ProjectDetailPage.jsx:27-48`: `invoke('findProjectById',{project_id:id})` → `isProjectScopeDenied(scopeCheck)` → EmptyState. 가드 추출기 `payload.projectId ?? payload.project_id` 와 payload 키(`project_id`) 정합.

## 2. 가드 전수성 — **통과**

- **계약 테스트 통과**(`test/permission/permissionMap.contract.test.js`): 등록집합 ↔ PERMISSION_MAP 키집합 **1:1**, 중복 없음, 구조 유효성(grant.resource 가 전부 카탈로그 키). 110키 = 등록 109 + 신규 `getPermissionCatalog`.
- `index.js:37-60` 이 24개 컨트롤러를 계약 테스트와 **동일 집합**으로 등록. 신규 `getPermissionCatalog` 는 기존 `registerPermissionController` 내부에 추가되어 index.js 무변경.
- **guardedDefine 미적용(의도)**: `SentryConfig.getSentryDSN`(raw string 반환 보존, PUBLIC 매핑은 존재 → 계약 테스트 통과), `WorklogController`(등록 함수 0). 노출 리스크: getSentryDSN 은 앱 전역 인프라 PUBLIC 이라 가드 불요 — 리스크 없음.
- **SELF context.accountId 덮어쓰기 확인**: `MyWorkController.jsx:12-22`(4함수 `accountId: context?.accountId`), `MyScheduleController.jsx:13-22`(add/update/list `account_id: context?.accountId`, delete 는 schedule_id 만), `getUserInfo`. payload 의 accountId 는 무시되고 context 로 강제 — 타인 데이터 열람/위변조 차단 정상.

## 3. fail-close — **통과**

- **fail-open 잔재 전역 grep 결과 0건**: `{read:true,write:true}` 기본값 없음, `PAGE_IDS` 참조 없음(`constants/pages.jsx` 삭제, 잔존 grep 은 주석뿐).
- `usePermissionStore.js:45-56`: `canRead/canWrite` 는 `?? false`, catch 시 `permissions:{}`(41행) → 미정의 키/invoke 실패 전부 false.
- 백엔드 완전성: `userPermissionCheckService` 는 미등록 사용자(`PrincipalResolver.js:90-102`)·accountId 부재(`PermissionService.js:121-128`)에도 카탈로그 **14키 전체** `{read:false,write:false}` + `projectScope:'ALL'` 반환(throw 안 함). `mergeSetPages`(`ResourceCatalog.js:90-99`)가 저장 세트의 누락 키를 defaultForNew 로 항상 메움.

## 4. 스코프 ④ — **통과 (재검증 완료 — gap 해소)**

### ✅ 재검증: `getIssueWorklogDetail` 스코프 강제 (2026-07-03, backend 수정본)
초판 실패 항목을 backend 가 수정. 4개 파일 실제 Read + 우회 경로 추적 결과 **정상 차단 확인**.

| 검증 항목 | 결과 |
|---|---|
| **payload 조작 우회 차단** | ✅ `IssueAnalysisService.js:107` 서비스 시그니처가 `({issueKey, hourRate}, principal)` — payload 에서 **projectId 를 아예 받지 않음**. MEMBER_ONLY(`scoped=scopedProjectIds(principal)!==null`)면 `isIssueInProjects(issueKey, scoped)` 로 서버가 issue→project 역산 검증(`:112-121`). scoped 는 principal(서버 SQL `findProjectIdsByAccountRepository`) 출처라 클라이언트가 조작 불가. "소속 projectId + 비소속 issueKey 조합" 공격은 projectId 인자 자체가 없어 원천 무력. 미소속 시 `ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)` throw |
| **JQL 인젝션 방어** | ✅ `IssueApi.js:307` `ISSUE_KEY_RE=/^[A-Za-z0-9_-]+$/` 로 issueKey 검증(`:319`, 따옴표/공백/괄호 배제) → `key = "${issueKey}"` breakout 불가. projectIds 는 DB `BIN_TO_UUID` 출처 canonical UUID(사용자 입력 아님). JQL 은 `moves_RMS_projectId = "${id}"` 로 `getProjectIssuesByFilter:341` 기존 패턴과 동일. (경미 관찰: `isIssueInProjects` 는 projectIds 를 JQL 삽입 전 UUID 재검증하지 않음 — 값이 서버 DB 출처라 미도달, 방어심층 관점의 선택적 하드닝 여지) |
| **ALL/admin 성능 회귀 없음** | ✅ `scopedProjectIds(principal)` 가 admin·非MEMBER_ONLY 에 `null` 반환(`PrincipalResolver.js:143-147`) → `if(scoped!==null)` 스킵 → **isIssueInProjects 미호출, 추가 Jira 조회 0**. MEMBER_ONLY 만 1 Jira 조회 |
| **PermissionMap 정정** | ✅ `PermissionMap.js:155` `getIssueWorklogDetail: R('REPORT','list')` (detail→list). 가드는 principal 부착만·issueKey 검증 안 함(서비스가 역산 검증). 계약/구조 유효성 테스트(project mode list 허용) 통과 |
| **프론트 계약 불변** | ✅ 서비스 응답 shape 불변. 프론트 2곳(`IssueAnalysisChart.jsx:234`,`WorklogDetailPanel.jsx:23`)은 `{issueKey,hourRate}` 만 전달·**무변경**. 신규 `PERMISSION_PROJECT_SCOPE_DENIED` 에러는 정상 UI 경로에서 미도달(상위 `getIssueAnalysisList` 가 detail 강제 → 비소속 프로젝트 이슈목록 진입 자체가 페이지레벨 차단됨). direct-invoke 공격 시에만 발생하며 `utils/permissionError.isProjectScopeDenied` 코드 분기와 정합 |
| **asApp 미사용** | ✅ `isIssueInProjects(issueKey, projectIds, as='user')` 기본 asUser, 서비스 호출부 `as` 미지정 → user 컨텍스트 `requestJiraJson({as:'user'})`(`IssueApi.js:329-330`). `[[feedback_no_asapp]]` 준수 |
| **npm test 재실행** | ✅ 12 suites / 165 tests PASS (계약 테스트 포함, 무회귀) |

**결론**: 초판 실패 항목 **해소 → 통과**. detail 추출기 대조표(아래)의 유일 gap 이 제거됨.

---

### detail 추출기 ↔ 프론트 payload 키 대조 (초판 기록, 참조용)

**detail 가드 추출기(`permissionGuard.js:43` `payload.projectId ?? payload.project_id`) ↔ 실제 프론트 invoke payload 키 대조:**

| resolver | 프론트 payload 키 | 위치 | 판정 |
|---|---|---|---|
| getProjectCostSummary | `projectId` | CostPage.jsx:38-40 | ✅ |
| getProjectProgressSummary | `projectId` | ProgressPage.jsx:36-38 | ✅ |
| getIssueAnalysisList | `projectId` | IssueAnalysisTable.jsx:147 | ✅ |
| downloadIssueAnalysisExcel | `projectId` | IssueAnalysisTable.jsx:184 | ✅ |
| getResourceAnalysisList/Detail | `projectId` | ResourceAnalysisPage.jsx:143 / Chart.jsx:243 | ✅ |
| getSummaryData/getChartInfo/getChartDataById/getChartData | `project_id` | SummaryPanel/DashboardPage/ChartTemplate | ✅ |
| getProjectGanttData | `projectId` | useGanttData.js:26 | ✅ |
| findProjectusersByProjectId/getProjectUserWithScroll/searchProjectUser | `project_id` | ProjectUserPanel/Select | ✅ |
| getAllProjectWorkersSchedule | `projectId` | useProjectWorkersSchedule.js:14 | ✅ |
| findProjectById/deleteProject/updateFromKanban | `project_id` | ProjectDetailPage/ProjectList/Kanban | ✅ |
| **getIssueWorklogDetail** | projectId 미전달(`issueKey`,`hourRate` 만) — **서비스가 issue→project 역산으로 서버검증** | IssueAnalysisChart.jsx:234, WorklogDetailPanel.jsx:23 | ✅ (재검증, 위 표 참조) |

**list 필터 주입 지점 확인(반영됨)**: `ProjectService.js:57,147,162,221` 4함수 `scopedProjectIds(principal)` 전달 → `ProjectRepository.scopeCondition()`(`ProjectRepository.js:16-22`, null→무필터/[]→`1=0`/[ids]→`project_id IN (UUID_TO_BIN...)` UUID 정규식 방어). 칸반 2종/포트폴리오(`PortfolioDashboardService.js:91` 목록 필터)/캘린더 교집합(`ProjectCalendarService.js:67-77`) 반영. **'ALL' 폴백**: 런타임 `PrincipalResolver.js:32,114`(`normalizeScope`), 마이그레이션 `SeedData.js:85` 양쪽 확인.

## 5. 마이그레이션 — **통과**

`onInstall.js:5` `SEED_VERSION=6` ✅. `SeedData.js`:
- `runSeed`(13-19): addPermissionSeed → migratePermissionSets → status/setting/link 순서 ✅.
- `addPermissionSeed`(36-54): Admin/Member 카탈로그 파생 **덮어쓰기**(`if(existing) continue` 제거), 둘 다 `projectScope:'ALL'`, `edit:false`, Member `PROJECT_COST` ff/`WORKLOG` 제외 ✅.
- `migratePermissionSets`(64-89): 커스텀만(Admin/Member skip), RESOURCE_KEYS 순회로 누락키 `migrateFrom`(PROJECT_GANTT←PROJECT, PROJECT_COST←REPORT) 또는 defaultForNew 주입, 고아키(WORKLOG) 자동 제거, `projectScope` 부재 시 'ALL'. **멱등**: 2차 실행 시 `existing.has(key)` true → migrateFrom 미참조 → 동일결과 ✅. 설계 §6 과 일치.

## 6. i18n — **통과**

- merge 산출물(`locales/ko-KR.json`·`en-US.json`, nested JSON) 을 node dot-path 파싱으로 검증: **신규 36키(공통/스코프/에러/UI보조/desc 14) 전량 존재, 양 언어 모두 OK**.
- 프론트 `t()` 호출 키(`ProjectScopeField.jsx`, 모달, `ProjectDetailPage.jsx`, `permissionError.js`) ↔ merge 산출물 대조 누락 0. ko-KR/en-US 직접수정 아님(소스 `locales/kr`·`locales/en` → merge). `permission.modal.alert` 오타 교정 반영 확인.

## 7. 테스트/빌드 — **통과**

```
루트 npx jest            → 12 suites / 165 tests PASS (계약 테스트 포함, 무회귀)
static/ui react-scripts test → 6 suites / 58 tests PASS
static/ui react-scripts build → 성공 ("build folder is ready", exit 0)
```
StorageService 의 `console.error` 는 의도된 에러경로 테스트의 정상 출력.

## 8. 성능 — **통과**

- `PrincipalResolver.js:27,53-60`: 모듈 스코프 `Map` L1 캐시 + 30초 TTL, 가드마다 `resolvePrincipal` 1회 호출·캐시 히트 시 조회 0회. N+1 없음(가드당 admin=Jira1 / 비admin=Jira1+SQL1+KVS1, MEMBER_ONLY 만 +SQL1 lazy `PrincipalResolver.js:118-120`).
- list 필터는 기존 쿼리에 `IN` 절만 추가(추가 왕복 없음). 캘린더는 `p-limit` 동시성 제한 유지(`ProjectCalendarService.js:5`).

## 9. 미검증

- **런타임 E2E**: 실제 MEMBER_ONLY 사용자 세션에서의 가드 거부(`PERMISSION_DENIED`)·비소속 상세 차단(`PERMISSION_PROJECT_SCOPE_DENIED`)·SELF 우회(타 accountId payload) 차단은 **배포 후 실사용자 컨텍스트**가 필요해 정적 검증 불가. 코드 경로상 정합은 확인함(추측 통과 아님, 실행만 미수행).

---

## 11. 재검증 2차 — 시드 scope 토글 완화 (2026-07-06)

사용자 결정: 시드 세트(edit:false)도 `projectScope` 토글만 편집 허용(Admin 예외, 항상 ALL). 신규 `updatePermissionScope` resolver 도입. 7개 검증 항목 **전부 통과**(§11-3 은 초기 실패 → backend 재수정으로 해소).

### 11-1. 경계면 교차 — **통과**
| 경계면 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| updatePermissionScope | `PermissionService.js:108-127` 입력 `{id, projectScope}` / 성공 `{success:true}` | `usePermissionEditModal.js:172-174` `invoke('updatePermissionScope',{id:permissionId, projectScope})` | ✅ payload 키·성공 shape 일치 |
| Admin 거부 에러 | `PermissionService.js:117-122` throw `LogicalError(PERMISSION_SCOPE_ADMIN_IMMUTABLE)` → `{success:false,error:{code:'PERMISSION_SCOPE_ADMIN_IMMUTABLE'}}` | `usePermissionEditModal.js:178` `res.error.code === 'PERMISSION_SCOPE_ADMIN_IMMUTABLE'` → toast + `setProjectScope(originalProjectScope)` 롤백 | ✅ 코드 문자열 글자 단위 일치(`permissionError.js:17`, `ErrorCodes.js:71`) |
| SET_NOT_FOUND | `PermissionService.js:112-114` | (프론트 미분기 → `showPermissionDeniedToast` false → generic 토스트, 안전) | ✅ 하위호환 |

### 11-2. 잠금 규칙 정합 — **통과**
- **백엔드**: `updatePermissionScopeService`(`:108-127`)는 `findById`→Admin(`name==='Admin' || id==='permission-Admin'`) 거부→그 외 `save(id, {...set, projectScope})` 로 **edit·name·pages 불변**(spread 보존). scope 외 필드 미변경 확인.
- **프론트**(`PermissionEditModal.jsx:40-44,71,81-82`): `pagesDisabled=!editable`(name/6체크박스/삭제 전파), `scopeDisabled=isAdminSet`(=`name==='Admin'`), `scopeNoteKey`=Admin→adminNote / 시드非Admin→seedNote. → Admin 전부잠금, 시드非Admin(Member) scope만 활성, 커스텀 전부편집. `handleSubmit`(`usePermissionEditModal.js:201-209`) editable→updatePermission / !editable→updatePermissionScope 분기. 설계 규칙과 일치.

### 11-3. `updatePermission` 우회 — **통과 (backend 재수정으로 해소, 2026-07-06)**
초기 실패(direct-invoke 로 edit:false 시드 잠금해제·pages 오염·Admin scope 우회)를 backend 가 수정. 실제 코드 Read + 두 공격 시나리오 경로 추적 결과 **차단 확인**.

- **수정 위치**: `PermissionService.js:76-106` `updatePermissionService` 진입부에 시드 방어 추가.
  ```
  const existing = await queryManager.findById(id);           // :85
  if (!existing)  throw LogicalError(PERMISSION_SET_NOT_FOUND);   // :86-88
  if (existing.edit === false) throw LogicalError(PERMISSION_SEED_IMMUTABLE); // :89-91
  ```
  `ErrorCodes.js:72` `PERMISSION_SEED_IMMUTABLE` 신설.

| 공격 시나리오 (direct-invoke, PERMISSION_MANAGEMENT/write 보유) | 결과 |
|---|---|
| **① Member pages 오염** `invoke('updatePermission',{id:'permission-Member',pages:[<임의>]})` | ✅ 차단 — Member 시드 `edit:false`(`SeedData.js:58`) → `existing.edit===false` → `PERMISSION_SEED_IMMUTABLE` throw, save 미도달 |
| **② Admin scope/pages 우회** `invoke('updatePermission',{id:'permission-Admin',projectScope:'MEMBER_ONLY',pages:[<임의>]})` | ✅ 차단 — Admin 시드도 `edit:false`(`SeedData.js:47`) → 동일 가드로 throw. `updatePermissionScope` Admin-immutable 가드 우회 경로 봉쇄 |

- **단일 가드 커버리지**: Admin·Member 두 시드 모두 `edit:false` 이므로 `existing.edit === false` 한 조건이 양쪽을 차단. 시드 세트의 projectScope 변경은 `updatePermissionScope` 전용 경로로만 허용(설계 §10 의도 완성).

**11-3-2. 커스텀 세트 회귀 — 통과**: 커스텀 세트는 `edit:true`(`addPermissionService`) → `existing.edit===false` false → 가드 통과 → 기존 동작 그대로. save 순서 = findById(방어) → data 구성 → `isNameChanged` 시 `checkDuplicated`(save 전, 기존과 동일) → `save`. name 중복검사 로직·순서 불변. (findById 1회 KVS read 추가는 미미, 성능 무시 가능.)

**11-3-3. 프론트 영향 — 통과**: 정상 UI 경로에서 시드 세트(edit:false)는 `usePermissionEditModal.handleSubmit`(`:204-208`)이 `!editable → scopeMutation(updatePermissionScope)` 로 라우팅 → `updatePermission` 미호출 → `PERMISSION_SEED_IMMUTABLE` **도달 불가**. 커스텀(edit:true)만 updatePermission 호출. 만약 비정상 도달 시에도 `updateMutation.onSuccess` 의 `!res.success` 분기가 NAME_DUPLICATED·권한계열 아님 → generic `toast.showError(..., res.error?.message)` 로 잡힘(크래시 없음).

### 11-4. 시드 보존 — **통과**
`addPermissionSeed`(`SeedData.js:40-62`): Admin `projectScope:'ALL'` 강제, Member 는 `findById('permission-Member')` 로 기존 scope 읽어 보존(MEMBER_ONLY 유지/없으면 ALL), pages/name/edit 카탈로그 재생성. 결정적 → 멱등. 설계 §10 일치.

### 11-5. 가드 매핑 — **통과**
`PermissionMap.js:105` `updatePermissionScope: W('PERMISSION_MANAGEMENT')`. 계약 테스트(등록집합↔매핑 1:1) 포함 **백엔드 jest 12 suites / 165 pass**. `ErrorCodes.js:70-71` 2코드 추가 확인.

### 11-6. i18n — **통과**
신규 3키 `permission.scope.adminNote`·`permission.scope.seedNote`·`permission.error.scopeAdminImmutable` — merge 산출물 `ko-KR.json`/`en-US.json` 양 언어 존재(node dot-path 검증). 프론트 `t()` 호출(`ProjectScopeField.noteKey`, `usePermissionEditModal.js:179`)과 일치.

### 11-7. 테스트/빌드 — **통과**
백엔드 jest 12/165 pass, 프론트 jest 6/58 pass, 프론트 build 성공(exit 0).

---

## 리더 조치 권고

1. ~~(경미) `getIssueWorklogDetail` 스코프 gap~~ → **해소됨**(backend issue→project 역산 서버검증, §4).
2. ~~[실패·차단] `updatePermission` 시드 오염 방어 부재(§11-3)~~ → **해소됨**(backend `updatePermissionService` 진입부 `edit:false` 시드 `PERMISSION_SEED_IMMUTABLE` 거부 추가, 두 공격 시나리오 차단 확인, §11-3).
3. **전 항목 정합 — 실패 0건, 재작업 불요.** 남은 것은 런타임 E2E(미검증, 배포 후).
4. (선택·비차단) `isIssueInProjects`(`IssueApi.js:322-325`) projectIds JQL 삽입 전 UUID 재검증 — 서버 DB 출처라 미도달이나 방어심층 하드닝 여지.
