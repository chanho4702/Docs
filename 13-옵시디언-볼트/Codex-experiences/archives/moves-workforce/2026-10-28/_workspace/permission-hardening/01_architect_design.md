# 권한관리 고도화 (permission-hardening) 설계서

작성: feature-architect | 2026-07-03 | 슬러그: permission-hardening
근거 요구사항: `_workspace/permission-hardening/00_input/requirement.md`
단일 진실 원천(SSOT): 이 문서. backend/frontend/verifier는 아래 "2. 경계면 계약" + "리소스 카탈로그" + "resolver 매핑 표"를 기준으로 작업한다.

> 이 설계는 실제 코드 Read로 실증한 사실 위에서 작성했다. 확인 못 한 항목은 "가정"으로 표기했다.

---

## 실증으로 확인한 현행 사실 (설계 근거)

| 사실 | 출처(파일:라인) |
|------|------|
| `req.context.accountId`가 resolver에 제공됨 (위변조 방지 목적 이미 사용 중) | `src/resolver/projectIssue/ProjectUsersController.js:44-48` (`context?.accountId`) |
| `responseWrapper(fn)`가 유일한 합성 지점, 성공 시 `{success:true,...result}` / 실패 시 `{success:false,error:{name,code,message,cause}}` | `src/utils/ResponseWrapper.js:3-33` |
| 라이선스 가드가 이미 `req.context.license`로 responseWrapper 안에서 동작 → 권한 가드도 동일 위치 합성 가능 | `ResponseWrapper.js:8-14` |
| `userPermissionCheckService`는 `getCurrentUserApi()`(=Jira `/myself` REST)로 accountId를 얻고, `checkAdministerPermission()`(=Jira `/mypermissions` REST)로 admin 판정 후, `getUserInfoService`(users SQL)→`permission_key`→KVS `permission.findById`로 권한 세트 획득 | `PermissionService.js:106-156`, `UserApi.js:64-92` |
| `getUserInfoService({accountId})` = `findByAccountId` = users 테이블 SQL 1회 (`{rows}` 반환, `permission_key` 컬럼) | `UserService.js:656`, `UserRepository.js:7-19` |
| KVS permission 엔티티 shape: `{ id, name, edit, pages:[{pageId, value:{read,write}}] }` | `SeedData.js:26-67`, `PermissionService.js:33-40` |
| 시드 Admin/Member는 `edit:false`(관리자 수정 불가), 존재 시 skip(`if(existing) continue`) | `SeedData.js:69-73` |
| SEED_VERSION=5, `ensureSeed`가 `version<SEED_VERSION`이면 `runMigration()+runSeed()` 후 `seed_version` set (멱등) | `onInstall.js:5`, `SeedData.js:14-21` |
| 프론트 fail-open 위치: 미수신 pageId를 `{read:true,write:true}`로 채움 | `usePermissionStore.js:33-36` |
| `readablePages`는 `permissions` 객체 키 중 `read===true`인 것 → 사이드바/드롭다운 노출 | `Sidebar.jsx:36-41`, `BackofficeDropdown.jsx` |
| 페이지 정의 드리프트: `PROJECT_GANTT`는 PAGE_IDS·프론트에만 있고 시드엔 없음 / `WORKLOG`는 시드엔 있고 getPages·PAGE_IDS엔 주석처리(없음) | `pages.jsx:1-42`, `SeedData.js:34,54` |
| `canRead/canWrite` 호출 프론트 파일 27개, 접근자 시그니처 `canRead(pageId)`/`canWrite(pageId)` | grep 결과 (§7) |
| 등록 resolver 총 **109개 / 24 컨트롤러** (WorklogController는 함수 0개) | src/index.js + 전 컨트롤러 전수 조사 (§2-B) |

---

## 1. 개요 / 영향 범위

이번 범위는 요구사항의 **4가지** 그대로다. 새 페이지·새 DB 테이블은 없다.

- **① 서버사이드 권한 가드**: resolver 공통 가드 도입. 109개 함수 전부에 `(resource, action)` 또는 `PUBLIC/SELF`를 선언하고 호출 시 검증. 미선언 = deny-by-default + 계약 테스트로 검출.
- **② fail-close 전환**: 프론트 미정의 pageId 기본값 `{read:false,write:false}`. 백엔드는 카탈로그 전체를 항상 완전하게 응답해 초기 미비 공백을 메움.
- **③ 리소스 카탈로그 단일 소스화 + 마이그레이션**: `src/permission/ResourceCatalog.js` 1곳. 5군데 드리프트 정리. SEED_VERSION 5→6, 멱등 병합/고아정리.
- **④ 프로젝트 데이터 범위 권한**: 권한 세트에 `projectScope:'ALL'|'MEMBER_ONLY'` 필드 추가(관리자가 세트별 토글). MEMBER_ONLY면 비관리자는 본인이 `projectusers`에 등록된 프로젝트 데이터만 조회. 서버사이드 enforcement(목록=쿼리필터, 상세=소속검증). admin은 항상 ALL. → 상세 설계 **§11**.

### 영향 축
- **백엔드(신규 파일)**: `src/permission/ResourceCatalog.js`, `src/permission/PermissionMap.js`, `src/permission/permissionGuard.js`, `src/permission/PrincipalResolver.js`, `src/error/PermissionError.js`. **신규 resolver 1개**: `getPermissionCatalog`. **④용 신규 쿼리**: `src/rdb/query/ProjectUsersQuery.js`에 `FIND_PROJECT_IDS_BY_ACCOUNT`(소속 프로젝트 id 조회) + list 리포지토리들의 `whereIn('project_id', memberIds)` 필터 분기.
- **백엔드(수정)**: 24개 Controller의 `resolver.define` 등록부(가드 합성), `PermissionService.userPermissionCheckService`(카탈로그 병합 + context.accountId 사용 + `projectScope` 응답), `PermissionService.add/updatePermissionService`(`projectScope` 저장), `SeedData.addPermissionSeed`(카탈로그 기반 재생성 + scope) + 신규 `migratePermissionSets`(키 병합 + scope 기본값), `onInstall.SEED_VERSION` 6, `ErrorCodes` 추가, myWork/mySchedule 서비스의 **self-scope 강제**(context.accountId), **④ 프로젝트 데이터 resolver의 scope 필터/검증**(§11-C 표).
- **프론트(수정)**: `usePermissionStore.js`(fail-close + `projectScope` 노출), `constants/pages.jsx`(PAGE_IDS 제거·getPages를 카탈로그 훅으로 대체), 권한/사용자 모달 6개 파일(카탈로그 훅 사용) + 권한 모달에 **scope 토글 UI**, 신규 훅 `usePermissionCatalog`, `queryKey/backofficeKeys`에 catalog 키 추가, **비소속 프로젝트 상세 직접 접근 시 에러 처리**(ProjectDetailPage). **27개 canRead/canWrite 호출부는 시그니처 유지(무수정)**.
- **DB**: 스키마 변경 없음. KVS `permission` 엔티티 데이터만 마이그레이션(신규 필드 `projectScope` 포함). 소속 판정은 기존 `projectusers` 테이블(`account_id` 인덱스) 조회.
- **i18n**: `locales/kr/common.json`·`permission.json` + `locales/en/` 대응. (신규 키 §8)

---

## 2. 경계면 계약 (가장 중요)

### 2-A. 신규/변경 resolver 계약

| resolver 함수 | 상태 | 입력 payload | 응답 shape (success 시, 글자 그대로) | 대응 프론트 훅/스토어 |
|--------------|------|-------------|-----------------------------------|--------------------|
| `userPermissionCheck` | **변경(pages 완전성 + projectScope 1필드 추가)** | 없음 (accountId는 `context`에서 서버가 취득) | `{ success:true, isUser:boolean, name:string, projectScope:'ALL'\|'MEMBER_ONLY', pages:[ {pageId:string, value:{read:boolean, write:boolean}} ] }` — **pages는 카탈로그 전체 키를 항상 포함**(저장값 오버레이, 없으면 카탈로그 기본값). admin은 `projectScope:'ALL'` 고정. `id`/`edit`는 내부용이라 미포함(현재도 프론트 미사용) | `usePermissionStore.loadPermissions` / `getProjectScope()` |
| `getPermissionCatalog` | **신규** | 없음 | `{ success:true, sections:[ { sectionId:string, sectionLabelKey:string, resources:[ {key:string, labelKey:string} ] } ] }` | `usePermissionCatalog()` (신규 훅), `catalogKeys.catalog()` |
| `addPermission` | **변경(payload 확장)** | `{ name, pages:[...], projectScope:'ALL'\|'MEMBER_ONLY' }` (projectScope 생략 시 서버 'ALL' 폴백) | `{ success:true }` (기존 유지) | `usePermissionRegistrationModal` (scope 토글 추가) |
| `updatePermission` | **변경(payload 확장)** | `{ id, name, pages:[...], isNameChanged, projectScope:'ALL'\|'MEMBER_ONLY' }` | `{ success:true }` | `usePermissionEditModal` (scope 토글) |
| `findPermissionById` | **변경(응답 확장)** | `{ id }` | `{ success:true, id, edit, name, pages, projectScope:'ALL'\|'MEMBER_ONLY' }` (기존 세트 필드 부재 시 'ALL') | 편집 모달 초기값 |
| 권한 가드 거부 (모든 가드 대상 공통) | 신규 에러 | — | `{ success:false, error:{ name:'PermissionDeniedError', code:'PERMISSION_DENIED', message, cause:'' } }` (미선언=`PERMISSION_UNMAPPED`, context 없음=`PERMISSION_PRINCIPAL_UNRESOLVED`) | mutation `onError`/`res.error.code` 분기 |
| **④ 프로젝트 범위 거부** (비소속 projectId 상세 접근) | 신규 에러 | — | `{ success:false, error:{ name:'ProjectScopeDeniedError', code:'PERMISSION_PROJECT_SCOPE_DENIED', message, cause:'' } }` | `ProjectDetailPage`/상세 useQuery `onError` → 안내 화면/리다이렉트 |

> **핵심 결정 — `userPermissionCheck` 응답은 `projectScope` 1필드만 추가**(pages 구조 불변). 프론트가 이미 `res.pages`만 소비하므로(`usePermissionStore.js:19-30`) 하위호환. `projectScope`는 신규 소비(§11-F), 구 프론트가 무시해도 안전.
> **④ 목록성 조회(findProject·kanban·portfolio 등)는 응답 shape 불변** — 서버가 결과 행을 필터링만 하므로 프론트 계약 변화 없음(프론트 추가 필터 불요).

### 2-B. 전체 resolver → (resource, action) 매핑 표 (src/index.js 등록 109개 전수)

표기: `R`=읽기, `W`=쓰기. `PUBLIC`=인증된 Jira 사용자면 통과(리소스 검사 없음). `SELF`=인증+본인 데이터 한정(가드는 통과시키되 **서비스가 반드시 `context.accountId`로 스코프**해야 함). `A OR B`=OR-grant(둘 중 하나 충족 시 통과, §3-C).

#### User (`UserController`, 11) — 근거: 백오피스 사용자 관리 페이지
| 함수 | R/W | 요구 권한 |
|---|---|---|
| getUserListWithPaging | R | USER_MANAGEMENT/read |
| searchUser | R | USER_MANAGEMENT/read |
| findUserByAccountId | R | USER_MANAGEMENT/read |
| searchJiraUsers | R | USER_MANAGEMENT/read (사용자 추가 UI) |
| getUserMetaCount | R | USER_MANAGEMENT/read |
| downloadExcel | R | USER_MANAGEMENT/read |
| addUser | W | USER_MANAGEMENT/write |
| updateUser | W | USER_MANAGEMENT/write |
| deleteByUserId | W | USER_MANAGEMENT/write |
| uploadUsersExcelWithQueue | W | USER_MANAGEMENT/write |
| getUserInfo | R | **SELF** (현재 로그인 사용자 정보; 부트스트랩) |

#### Role (`RoleController`, 6) — 백오피스 직무 관리 + 사용자 모달 드롭다운
| addRole | W | ROLE_MANAGEMENT/write |
| updateRole | W | ROLE_MANAGEMENT/write |
| deleteRole | W | ROLE_MANAGEMENT/write |
| addRoleBulk | W | ROLE_MANAGEMENT/write |
| findRoleById | R | ROLE_MANAGEMENT/read |
| getRoleList | R | ROLE_MANAGEMENT/read **OR** USER_MANAGEMENT/read (사용자 등록 모달이 직무 목록 필요) |

#### Level (`LevelController`, 6) — 동일 패턴
| addLevel/updateLevel/deleteLevel/addLevelBulk | W | LEVEL_MANAGEMENT/write |
| findLevelById | R | LEVEL_MANAGEMENT/read |
| getLevelList | R | LEVEL_MANAGEMENT/read **OR** USER_MANAGEMENT/read |

#### Project (`ProjectController`, 9) — 프로젝트 목록/상세 + 칸반
| insertProject/updateProject/deleteProject | W | PROJECT/write |
| findProject/findProjectById/getActiveProjects | R | PROJECT/read |
| getProjectsRecentForKanban/getOldProjectsForKanban | R | KANBAN/read |
| updateFromKanban | W | KANBAN/write (칸반 드래그) |

#### ProjectUsers (`ProjectUsersController`, 9) — 프로젝트 인력/이슈
| insertProjectusers/updateProjectUsersByKey/deleteProjectUsersByKey | W | PROJECT/write |
| updateProjectIdField/deleteProjectIssue/recordIssueAssignedDate | W | PROJECT/write |
| findProjectusersByProjectId/getProjectUserWithScroll/searchProjectUser | R | PROJECT/read |

#### Job (`JobController`, 7) — **가정**: 현재 사용자 엑셀 업로드 진행/실패 관리에만 쓰임
| getUploadJobStatus/getFailList/getAllFailList/getJobBatch | R | USER_MANAGEMENT/read |
| removeJob/removeFailJobList/removeJobBatch | W | USER_MANAGEMENT/write |

#### ProjectStatus (`ProjectStatusController`, 9) — 백오피스 상태 관리 + 칸반 컬럼
| addProjectStatus/deleteProjectStatus/updateProjectStatus/setStatusLink | W | PROJECT_STATUS_MANAGEMENT/write |
| findProjectStatusById/getProjectStatusExistLink | R | PROJECT_STATUS_MANAGEMENT/read |
| getProjectStatusList/getStatusLink | R | PROJECT_STATUS_MANAGEMENT/read **OR** KANBAN/read **OR** PROJECT/read (칸반 컬럼 렌더가 필요) |
| addProjectStatusFromKanban | W | KANBAN/write **OR** PROJECT_STATUS_MANAGEMENT/write (칸반에서 컬럼 추가) — ⚠️ §10 확인필요 |

#### Permission (`PermissionController`, 6) — 백오피스 권한 관리
| addPermission/updatePermission/deletePermission | W | PERMISSION_MANAGEMENT/write |
| findPermissionById | R | PERMISSION_MANAGEMENT/read |
| getPermissionList | R | PERMISSION_MANAGEMENT/read **OR** USER_MANAGEMENT/read (사용자 모달이 권한 목록 필요) |
| userPermissionCheck | R | **PUBLIC** (자기 권한 부트스트랩) |
| *(신규) getPermissionCatalog* | R | **PUBLIC** (구조 메타데이터: 키+labelKey만, 데이터 아님) |

#### Setting (`SettingController`, 2)
| getSettingData | R | **PUBLIC** (currency/hourRate/band — cost·dashboard·portfolio 전역에서 읽는 비민감 앱 설정) |
| updateSetting | W | SETTINGS/write |

#### Sentry (`SentryConfig`, 1)
| getSentryDSN | R | **PUBLIC** (앱 전역 초기화 인프라) |

#### ProjectDashboard (`ProjectDashboardController`, 8) — 프로젝트 상세 대시보드 탭
| getSummaryData/getChartInfo/getChartDataById/getChartData | R | DASHBOARD/read |
| addChart/updateChartTitle/updateChartLayout/removeChart | W | DASHBOARD/write |

#### Scheduler (`SchedulerController`, 1)
| startProjectWorklogBatch | W | SETTINGS/write (관리자 운영 트리거; 코드상 삭제 예정 표기) |

#### Worklog (`WorklogController`, 0) — 등록 함수 없음. 대상 아님.

#### MyWork (`MyWorkController`, 4) — /myWork 본인 워크로그
| getMyProjectList/getProjectWorklog/getMyCalendarWorklog/getMyIssueList | R | **SELF** ⚠️ §3-E: 서비스가 payload.accountId 대신 context.accountId 사용하도록 변경 필수 |

#### MySchedule (`MyScheduleController`, 5)
| addMySchedule/updateMySchedule/deleteMySchedule | W | **SELF** (본인 일정; context.accountId) |
| getMyScheduleList | R | **SELF** |
| getAllProjectWorkersSchedule | R | PROJECT/read (팀 일정 열람) |

#### PublicHoliday (`PublicHolidayController`, 5)
| addPublicHoliday/updatePublicHoliday/deletePublicHoliday | W | PUBLIC_HOLIDAY_MANAGEMENT/write |
| findPublicHolidayById | R | PUBLIC_HOLIDAY_MANAGEMENT/read |
| getPublicHolidayList | R | **PUBLIC** (캘린더/근무일 계산 전역에서 쓰는 비민감 레퍼런스 데이터) |

#### IssueAnalysis (`IssueAnalysisController`, 3) — 분석 리포트
| getIssueAnalysisList/getIssueWorklogDetail/downloadIssueAnalysisExcel | R | REPORT/read |

#### ResourceAnalysis (`ResourceAnalysisController`, 2)
| getResourceAnalysisList/getResourceWorklogDetail | R | REPORT/read |

#### ProjectCalendar (`ProjectCalendarController`, 1)
| getProjectCalendarWorklog | R | PROJECT/read (프로젝트 상세 캘린더 탭) |

#### ProjectProgress (`ProjectProgressController`, 1)
| getProjectProgressSummary | R | REPORT/read (진척 분석 탭, canReadReport 게이트) |

#### PortfolioDashboard (`PortfolioDashboardController`, 2)
| getPortfolioDashboard | R | REPORT/read (전사 대시보드 REPORT 게이트) |
| triggerPortfolioAggregation | W | REPORT/write (집계 재계산 트리거) |

#### ProjectCost (`ProjectCostController`, 1)
| getProjectCostSummary | R | **PROJECT_COST/read** (신규 민감 리소스, §5) |

#### Gantt (`GanttController`, 9)
| getProjectGanttData | R | PROJECT_GANTT/read |
| updateGanttSchedule/setGanttParent/setGanttLink/createGanttFolder/renameGanttFolder/moveGanttFolder/deleteGanttFolder/setGanttIssueFolder | W | PROJECT_GANTT/write |

#### Storage (`StorageController`, 1)
| getStorageUsage | R | STORAGE_MONITORING/read |

**요약**: 리소스 가드 대상 대다수 / PUBLIC 5개(`userPermissionCheck`, `getPermissionCatalog`, `getSettingData`, `getSentryDSN`, `getPublicHolidayList`) / SELF 10개(User `getUserInfo` + MyWork 4 + MySchedule 5) / OR-grant 5개(`getRoleList`,`getLevelList`,`getPermissionList`,`getProjectStatusList`,`getStatusLink`,`addProjectStatusFromKanban`).

### 2-C. 프로젝트 데이터 범위(④) 대상 resolver 표

`projectScope==='MEMBER_ONLY'` + 비admin일 때만 적용. `mode` 정의: **`list`**=쿼리레벨 필터(결과를 소속 프로젝트로 제한) / **`detail`**=payload의 projectId 소속 검증 후 미소속이면 `PERMISSION_PROJECT_SCOPE_DENIED` / **`inherited`**=자식키(memberId/chartId/folderId/issueId)만 받아 직접 projectId 없음 → 상위 read 경로가 이미 scope됨에 의존(§11-C 한계) / **`none`**=프로젝트 데이터 아님(scope 무관).

| resolver | resource/action | mode | projectId 파라미터 | 처리 |
|---|---|---|---|---|
| findProject | PROJECT/read | **list** | — | 리포지토리 `whereIn('project_id', memberIds)` |
| getActiveProjects | PROJECT/read | **list** | — | 동일 |
| getProjectsRecentForKanban | KANBAN/read | **list** | — | 칸반 리포지토리 필터 |
| getOldProjectsForKanban | KANBAN/read | **list** | — | 칸반 리포지토리 필터 |
| getPortfolioDashboard | REPORT/read | **list** | — | 전사 집계를 memberIds로 제한(전사→본인프로젝트 집계). §11-D |
| findProjectById | PROJECT/read | **detail** | `project_id` | 소속검증 |
| updateProject / deleteProject | PROJECT/write | **detail** | `project_id` | 소속검증(본인 프로젝트만 수정/삭제) |
| findProjectusersByProjectId / getProjectUserWithScroll / searchProjectUser | PROJECT/read | **detail** | `projectId`/`project_id` | 소속검증 |
| getSummaryData / getChartInfo / getChartDataById / getChartData | DASHBOARD/read | **detail** | `project_id` | 소속검증 |
| getProjectGanttData | PROJECT_GANTT/read | **detail** | `project_id` | 소속검증 |
| getProjectCostSummary | PROJECT_COST/read | **detail** | `projectId` | 소속검증 |
| getProjectProgressSummary | REPORT/read | **detail** | `projectId` | 소속검증 |
| getIssueAnalysisList / getIssueWorklogDetail / downloadIssueAnalysisExcel | REPORT/read | **detail** | `projectId` | 소속검증 |
| getResourceAnalysisList / getResourceWorklogDetail | REPORT/read | **detail** | `projectId` | 소속검증 |
| getProjectCalendarWorklog | PROJECT/read | **detail(배열)** | `selectedProjectIds[]` | memberIds 교집합으로 필터(부분소속 허용). §11-C |
| getAllProjectWorkersSchedule | PROJECT/read | **detail** | `projectId`(가정) | 소속검증 |
| insertProjectusers / updateProjectUsersByKey / deleteProjectUsersByKey / updateProjectIdField / deleteProjectIssue / recordIssueAssignedDate | PROJECT/write | **inherited** | 자식키 위주 | §11-C: projectId 있으면 검증, 없으면 상위 scope 의존 |
| addChart / updateChartTitle / updateChartLayout / removeChart | DASHBOARD/write | **inherited/detail** | project_id 있으면 detail | 있으면 검증 |
| Gantt writes(updateGanttSchedule/setGanttParent/setGanttLink/폴더 CRUD/setGanttIssueFolder) | PROJECT_GANTT/write | **inherited** | 이슈/폴더키 | 기존 `GANTT_CROSS_PROJECT_REF` 검증이 프로젝트 경계 보강 |
| **그 외 전부**(User/Role/Level/Permission/Setting/Status/Holiday/Storage/Sentry/MyWork/MySchedule/Job/Scheduler 등) | — | **none** | — | 프로젝트 데이터 아님 → scope 무관 |

> **전사 데이터 처리 방침 결정**: portfolio(전사 대시보드)는 REPORT-gate이나 ④ 요구("본인 속한 프로젝트만")에 맞춰 **집계 대상을 memberIds로 제한**한다(전면 차단 아님). REPORT 권한만으로 전사를 여는 것은 ④와 상충하므로 scope를 우선한다. 분석 3종은 프로젝트 단위라 detail 검증.

---

## 3. 권한 가드 설계

### 3-A. 합성 형태 (responseWrapper와의 관계)
등록부를 `guardedDefine` 헬퍼로 일원화한다. `responseWrapper`를 헬퍼 내부로 흡수해 **가드+응답표준화를 한 곳에서** 적용하고, 미선언 함수를 원천 검출한다.

```
// src/permission/permissionGuard.js
guardedDefine(resolver, name, handler)
  meta = PERMISSION_MAP[name]
  if meta === undefined:            // 미선언 = 실수
      resolver.define(name, responseWrapper(() => { throw new PermissionError('PERMISSION_UNMAPPED') }))
      console.error(`[PERM] '${name}' PermissionMap 누락 → deny-by-default`)
      return
  if meta === 'PUBLIC' || meta === 'SELF':
      resolver.define(name, responseWrapper(handler))   // 리소스 검사 없음 (SELF는 서비스가 self-scope 책임)
      return
  resolver.define(name, responseWrapper(guard(meta)(handler)))   // meta = {resource,action} | [{...},...]
```

컨트롤러 변경(기계적): `resolver.define('x', responseWrapper(({payload})=>svc(payload)))` → `guardedDefine(resolver, 'x', ({payload})=>svc(payload))`. handler는 full `req`(payload/context)를 그대로 받는다(가드는 통과 후 `handler(req)` 호출).

### 3-B. guard 시그니처
```
guard(meta) => (handler) => async (req) => {
    const principal = await resolvePrincipal(req.context)   // {isAdmin, resourceMap}
    if (!isSatisfied(principal, meta)) throw new PermissionError(ErrorCodes.PERMISSION_DENIED)
    return handler(req)
}
isSatisfied(principal, meta):
    if (principal.isAdmin) return true                       // Jira ADMINISTER = 전권 바이패스
    const grants = Array.isArray(meta) ? meta : [meta]       // OR 의미
    return grants.some(g => principal.resourceMap[g.resource]?.[g.action] === true)
```

### 3-C. OR-grant (공유 read 대응)
여러 기능이 공유하는 read resolver(직무/등급/권한 목록, 상태 목록)를 단일 (resource,action)으로 묶으면 정당한 소비자를 과하게 차단한다. 따라서 **meta에 배열을 허용(OR)**한다. 예: `getRoleList`는 `ROLE_MANAGEMENT/read` 또는 `USER_MANAGEMENT/read` 중 하나면 통과.

### 3-D. 미선언 처리 방침 — **deny-by-default + 계약 테스트**
- 런타임: `PERMISSION_MAP`에 없는 함수는 자동 거부(`PERMISSION_UNMAPPED`). 즉 새 resolver가 매핑 없이 배포되면 열리지 않고 막힌다(안전한 실패).
- CI: `test/permission/permissionMap.contract.test.js` — `handler = resolver.getDefinitions()`의 등록 함수명 집합과 `PERMISSION_MAP` 키 집합을 대조. (1) 등록됐으나 매핑 없는 함수 → fail (2) 매핑됐으나 미등록(오타/삭제) → fail. 이로써 "가드 미선언 함수 검출"을 강제. 신규 기능 추가 시 매핑을 빠뜨리면 빌드가 깨진다.

### 3-E. SELF 스코프 강제 (보안상 중요 — 이번 범위에 포함)
현재 `getProjectWorklogService` 등 myWork 서비스는 **payload.accountId**를 신뢰한다(`MyWorkService.jsx:57` 등, 프론트가 전달). 가드가 PUBLIC/SELF로 통과시키면 Member가 콘솔에서 타인 accountId를 payload로 넘겨 **타인 워크로그를 열람**할 수 있다. 따라서 SELF 함수는 서비스 시그니처를 `context.accountId` 기반으로 전환한다.
- 컨트롤러: `guardedDefine(resolver,'getProjectWorklog', ({payload, context}) => getProjectWorklogService({...payload, accountId: context.accountId}))` — payload의 accountId를 context 값으로 **덮어씀**.
- 대상: MyWork 4개 + MySchedule 개인 CRUD 4개 + `getUserInfo`.

### 3-F. 표준 에러 코드/shape
`src/error/PermissionError.js` (LogicalError와 동형: `name='PermissionDeniedError'`, `code`, `message`, `cause`). `responseWrapper`가 그대로 직렬화 → `{success:false, error:{name,code,message,cause}}`. `ErrorCodes` 추가: `PERMISSION_DENIED`, `PERMISSION_UNMAPPED`, `PERMISSION_PRINCIPAL_UNRESOLVED`.

---

## 4. 성능 설계

### 4-A. 가드 1회당 조회 (naive)
`resolvePrincipal(context)`:
1. `accountId = context.accountId` — **Jira `/myself` 호출 불필요**(context 제공, §실증). 없으면 `PERMISSION_PRINCIPAL_UNRESOLVED` 거부.
2. `checkAdministerPermission()` — Jira REST `/mypermissions?permissions=ADMINISTER` **1회** (as:user, asApp 금지 준수).
3. admin이면 종료(전권). 아니면 `getUserInfoService({accountId})` — users SQL **1회** → `permission_key`.
4. KVS `permission.findById(permission_key)` **1회** → 세트. 카탈로그 기본값과 병합해 `resourceMap` 구성.

즉 admin=Jira 1회, 비admin=Jira 1 + SQL 1 + KVS 1.

### 4-B. 캐싱 전략 — L1 in-memory TTL (모듈 스코프, best-effort)
- `PrincipalResolver.js`에 `Map<accountId, {value, expireAt}>` 모듈 전역 캐시(TTL ~30초). warm 컨테이너에서 같은 accountId의 후속 가드는 **조회 0회**로 처리. cold면 miss → 재해석(정확성은 캐시에 의존하지 않음, 순수 최적화).
- 앱 로드 첫 호출 `userPermissionCheck`(PUBLIC)가 principal을 최초 해석·캐시 → 이후 페이지의 다수 guarded invoke가 캐시 히트. 실사용 시나리오(대시보드 진입 시 병렬 invoke 여러 건)에서 Jira/SQL/KVS 재조회를 1건으로 수렴.
- TTL 트레이드오프: 권한 변경이 최대 ~30초 지연 전파. 수용 가능. (즉시 반영이 필요하면 TTL 축소 또는 캐시 무효화는 로드맵.)
- **KVS L2 캐시는 도입하지 않음**(Phase 1): 매 호출 KVS write는 쓰기 증폭 + 240KiB 한도 압박. L1 best-effort로 충분.

### 4-C. SSOT 공유
`resolvePrincipal`의 비admin 분기 로직을 `userPermissionCheckService`와 **공유**(동일 `PrincipalResolver`). 가드와 프론트에 내려주는 권한이 항상 일치. `userPermissionCheckService`도 `getCurrentUserApi()` 제거하고 context.accountId 사용 → `/myself` 호출 1건 절감.

---

## 5. 리소스 카탈로그 설계

### 5-A. 위치/스키마
`src/permission/ResourceCatalog.js` (백엔드 단일 소스). 프론트는 `getPermissionCatalog` 응답으로만 소비.

```
// 각 엔트리
{
  key: 'PROJECT_COST',
  section: 'WORKFORCE' | 'SETTINGS',
  labelKey: 'common.pages.cost',      // 프론트가 t(labelKey)로 표시
  covers: ['프로젝트 상세 비용 탭'],   // 문서용 설명(응답엔 미포함)
  admin:  { read:true,  write:true  },// 시드 Admin 기본값
  member: { read:false, write:false },// 시드 Member 기본값
  defaultForNew: { read:false, write:false }, // 신규 커스텀 세트에 키 추가 시 기본
  migrateFrom: 'REPORT'               // (선택) 기존 세트 마이그레이션 시 이 키 값 복사
}
```
파생 헬퍼 export: `RESOURCE_KEYS`(문자열 배열), `getSeedPages(setType)`(Admin/Member pages 생성), `getCatalogSections()`(getPermissionCatalog 응답용, labelKey만), `getMigrateSource(key)`.

### 5-B. 최종 카탈로그 (14개 키)
현행 13키 중 **WORKLOG 제거**, **PROJECT_GANTT·PROJECT_COST 추가** → 14키.

| key | section | admin r/w | member r/w | defaultForNew | migrateFrom |
|---|---|---|---|---|---|
| DASHBOARD | WORKFORCE | t/t | t/f | f/f | — |
| REPORT | WORKFORCE | t/t | t/f | f/f | — |
| KANBAN | WORKFORCE | t/t | t/f | f/f | — |
| PROJECT | WORKFORCE | t/t | t/f | f/f | — |
| **PROJECT_GANTT** (신규 등재) | WORKFORCE | t/t | t/f | f/f | **PROJECT** |
| **PROJECT_COST** (신규 분리) | WORKFORCE | t/t | **f/f** | **f/f** | **REPORT** |
| SETTINGS | SETTINGS | t/t | f/f | f/f | — |
| USER_MANAGEMENT | SETTINGS | t/t | f/f | f/f | — |
| ROLE_MANAGEMENT | SETTINGS | t/t | f/f | f/f | — |
| LEVEL_MANAGEMENT | SETTINGS | t/t | f/f | f/f | — |
| PERMISSION_MANAGEMENT | SETTINGS | t/t | f/f | f/f | — |
| PROJECT_STATUS_MANAGEMENT | SETTINGS | t/t | f/f | f/f | — |
| PUBLIC_HOLIDAY_MANAGEMENT | SETTINGS | t/t | t/f | t/f | — |
| STORAGE_MONITORING | SETTINGS | t/t | f/f | f/f | — |

### 5-C. granularity 방침 적용 (분리 기준 3가지 — 카탈로그 문서 주석에 명기)
키 분리는 다음 중 하나 이상일 때만: **(a) 민감도 상이 / (b) 대상 사용자군 상이 / (c) write 의미 상이.** 해당 없으면 상위 키에 묶는다(페이지 1:1 금지).
- **PROJECT_COST 채택**: 기준 (a) 민감도 — 인건비/단가(salary=기간 총단가)는 재무 민감정보로 일반 리포트(REPORT)와 민감도 다름. → 분리. 기본값: Admin r/w, **Member read=false**(구성원에게 비용 비노출), 신규 커스텀도 read=false(민감 보수 기본). 기존 세트는 `migrateFrom:REPORT`로 현행 유효 접근 보존(§6).
- **PROJECT_GANTT 유지 분리**: 간트는 이미 프론트에서 별도 게이트(`canRead('PROJECT_GANTT')`, `GanttPage.jsx:43`)로 운영 중 → 카탈로그/시드에 정식 등재(드리프트 해소). PROJECT와 write 의미가 유사하나(기준 c 약함) 이미 독립 게이트가 존재하므로 별 키 유지, `migrateFrom:PROJECT`.
- **분리하지 않은 것들**: 분석 3종(이슈/리소스/진척)·포트폴리오 → 모두 REPORT(대상군·민감도·write의미 동일). 칸반 컬럼 상태 → 기존 PROJECT_STATUS_MANAGEMENT 유지(OR-grant로 칸반 소비 커버).

### 5-D. 드리프트 정리 방침
- **PROJECT_GANTT**: 카탈로그·시드 등재. 마이그레이션이 기존 모든 세트에 `migrateFrom:PROJECT` 값으로 주입 → Member/커스텀이 간트를 잃지 않음.
- **WORKLOG**: **카탈로그에서 제외(제거)**. 판단 근거 — /myWork는 호출자 **본인** 워크로그만 다루는 self-data(§3-E에서 context.accountId로 스코프). 본인 데이터를 권한으로 잠그는 것은 자기 데이터 접근 차단 리스크만 있고 실익이 없음. 프론트도 이미 getPages/PAGE_IDS에서 WORKLOG를 뺀 상태라 프론트-백엔드 정합. → myWork resolver는 SELF로 분류(리소스 불요). 마이그레이션이 기존 시드 세트의 WORKLOG를 **고아 키로 정리(삭제)**.

---

## 6. 마이그레이션 설계

SEED_VERSION `5 → 6` (`onInstall.js`). `ensureSeed`/`onInstall` 경로가 `version<6`일 때 `runMigration()` + `runSeed()` 실행. `runSeed`에 순서: `addPermissionSeed()`(재작성) → `migratePermissionSets()`(신규) → 나머지 시드.

### 6-A. `addPermissionSeed` 재작성 (시드 Admin/Member = 카탈로그 파생, 멱등 덮어쓰기)
Admin/Member는 `edit:false`(사용자 수정 불가) 불변 시드이므로 **매 마이그레이션마다 카탈로그에서 결정적 재생성 후 덮어쓰기**(기존 `if(existing) continue` 제거).
```
save('permission-Admin',  { id, name:'Admin',  edit:false, pages: getSeedPages('admin')  })
save('permission-Member', { id, name:'Member', edit:false, pages: getSeedPages('member') })
```
`getSeedPages`는 카탈로그 14키를 순회해 admin/member 기본값으로 pages 생성. 결정적 → 멱등.

### 6-B. `migratePermissionSets` (커스텀 세트 병합/고아정리, 멱등)
```
sets = permission.findAll()                       // 커스텀 포함 전체
catalogKeys = RESOURCE_KEYS (Set)
for set in sets where set.name not in ('Admin','Member'):
    existing = index(set.pages by pageId)
    nextPages = []
    for key in RESOURCE_KEYS:                      // 누락 키 추가
        if existing[key]: nextPages.push(existing[key])
        else:
            src = getMigrateSource(key)            // migrateFrom
            val = (src && existing[src]) ? existing[src].value : catalog[key].defaultForNew
            nextPages.push({ pageId:key, value:{...val} })
    // 고아 키(catalog에 없는 pageId, 예: WORKLOG)는 nextPages에 미포함 → 자동 제거
    save(set.id, { ...set, pages: nextPages })
```
- **멱등**: 두 번째 실행 시 모든 키가 이미 존재 → 동일 결과. migrateFrom은 "키 부재 시에만" 참조하므로 반복 실행에도 값 변형 없음.
- **PROJECT_COST**: 기존 커스텀 세트에 `migrateFrom:REPORT`로 현행 REPORT 값 복사 → 지금까지 비용을 보던 관리자 세트는 접근 유지(최소 놀람). REPORT 키가 없던 세트는 `defaultForNew`(read=false).
- **PROJECT_GANTT**: `migrateFrom:PROJECT` 복사.
- **WORKLOG 고아 제거**: 커스텀 세트에 남아있던 WORKLOG 페이지 항목은 재생성에서 빠져 정리됨.
- Forge SQL/KVS 트랜잭션 미지원이나, KVS `save`는 키 단위 멱등이므로 중단·재시도 안전.

### 6-C. 배포 후 데이터 일관성
마이그레이션 후 모든 저장 세트가 카탈로그 14키를 정확히 보유 → `userPermissionCheckService`의 카탈로그 병합과 이중 안전. (병합 로직이 런타임에도 누락 키를 메우므로, 마이그레이션 실패 시에도 응답은 완전.)

### 6-D. projectScope 필드 마이그레이션 (④ 통합)
`migratePermissionSets`가 pages 병합과 **동일 루프에서** `projectScope`도 보정(멱등):
- 커스텀 세트: `set.projectScope` 없으면 `'ALL'` 주입(**현행 동작 보존**). 있으면 유지.
- Admin 시드: `addPermissionSeed`가 항상 `projectScope:'ALL'` 고정(edit:false, admin은 개념상 항상 ALL).
- Member 시드: `projectScope:'ALL'`(기본 off — 현행과 동일. 관리자가 필요 시 커스텀/토글로 MEMBER_ONLY 채택).
- 하위호환: 런타임 `resolvePrincipal`도 필드 부재를 `'ALL'`로 폴백 → 마이그레이션 이전/실패 상태에서도 안전(현행 동작).

---

## 7. 프론트엔드 변경 설계

### 7-A. `usePermissionStore.js` — fail-close 전환 (27개 호출부 무수정)
```
// 변경 전(fail-open): PAGE_IDS.reduce(... apiMap[id] ?? {read:true,write:true})
// 변경 후: 백엔드가 카탈로그 전체를 내려주므로 응답을 그대로 신뢰
const permissionMap = pages.reduce((acc, p) => {
    acc[p.pageId] = { read: p.value.read, write: p.value.write };
    return acc;
}, {});
set({ isUser: res.isUser, permissions: permissionMap, ... });
```
- `PAGE_IDS` import 제거. `permissions` 키 집합은 응답(=카탈로그)에서 파생 → `Sidebar.readablePages`(Object.keys 순회)도 자동으로 카탈로그 반영.
- `canRead/canWrite` 접근자는 `?? false` 유지 → 미정의 키·invoke 실패(`catch`에서 permissions `{}`)는 전부 false(fail-close). **접근자 시그니처 불변 → 27개 파일 무수정.**

### 7-B. `constants/pages.jsx` — PAGE_IDS 제거, getPages를 카탈로그 훅으로 대체
- `PAGE_IDS` export 삭제(store가 더는 참조 안 함).
- `getPages(t)`(하드코딩 섹션/페이지) 삭제 → 신규 훅 `usePermissionCatalog()`로 대체.

### 7-C. 신규 훅 `usePermissionCatalog()` + queryKey
```
// static/ui/src/hooks/usePermissionCatalog.js
useQuery({ queryKey: catalogKeys.catalog(), queryFn: () => invoke('getPermissionCatalog') })
// → { sections:[{sectionId, sectionLabelKey, resources:[{key, labelKey}]}] }
// 소비 측은 t(labelKey)/t(sectionLabelKey)로 라벨링, resources.key로 read/write 매핑
```
`backofficeKeys`에 `permissionCatalog: () => ["permission","catalog"]` 추가(또는 별도 `catalogKeys`). 권장: `backofficeKeys.permissionCatalog()`.

### 7-D. 모달 6개 파일 카탈로그 연동 (getPages 대체)
`getPages`를 쓰던 곳을 `usePermissionCatalog` 결과의 `sections`(=`{sectionId, sectionLabelKey, resources:[{key,labelKey}]}`) 형태로 교체. 기존 코드가 기대하는 `{sectionId, sectionLabel, pages:[{id,label}]}`와 필드명이 다르므로 훅에서 어댑팅하거나 소비부를 신필드로 수정.
대상: `usePermission.js`(usePageData), `usePermissionRegistrationModal.js`, `edit/PermissionEditModal.jsx`, `regist/PermissionRegistrationModal.jsx`, `user/modal/regist/UserRegistrationModal.jsx`, `user/modal/edit/UserEditModal.jsx`. (로딩 상태 처리 추가 — 카탈로그가 async가 됨.)
> 어댑터 권장: 훅이 `PAGES`(구 shape: `{sectionId, sectionLabel:t(sectionLabelKey), pages:[{id:key, label:t(labelKey)}]}`)와 `PAGE_LIST`를 그대로 반환하면 소비부 수정 최소화.

### 7-E. PermissionSettingPage / 비용 탭 게이트 변경
- `PermissionSettingPage.jsx`: 페이지 목록 소스가 카탈로그 훅으로 바뀌는 것 외 canWrite('PERMISSION_MANAGEMENT') 유지.
- **비용 탭 게이트 변경(behavior change)**: `constants/tabs.js`의 `projectCost` 탭 `canRender: () => canReadReport` → `canRender: () => canReadCost`(신규 `canRead('PROJECT_COST')`). `ProjectDetailTabs.jsx`에 `const canReadCost = usePermissionStore(s=>s.canRead('PROJECT_COST'))` 추가·전달. ⚠️ Member는 이제 비용 탭 미노출(민감도 정책). §10 확인필요로 표기.
- (선택) 간트 탭은 이미 `canReadGantt`(PROJECT_GANTT) 사용 중이라 무변경.

### 7-F. 권한 체크 필요 여부
신규 프론트 데이터 호출은 카탈로그(PUBLIC)뿐. `usePermissionStore` 게이팅은 위 비용 탭 외 변경 없음.

### 7-G. 프로젝트 범위(④) 프론트
- **scope 토글 UI**: 권한 등록/편집 모달(`usePermissionRegistrationModal`/edit)에 라디오/토글 1개(`projectScope`: 전체 프로젝트 / 소속 프로젝트만). 저장 시 add/updatePermission payload에 포함. 편집 진입 시 `findPermissionById.projectScope`로 초기화. Admin 세트는 edit:false라 UI 노출 대상 아님.
- **store**: `usePermissionStore`에 `projectScope` 상태 + `getProjectScope()` 노출(응답 필드 저장). (게이팅 로직 아님 — 정보성/배너용.)
- **비소속 상세 직접 접근 처리**: 서버가 상세 resolver에서 `PERMISSION_PROJECT_SCOPE_DENIED`를 던지므로, `ProjectDetailPage` 및 상세 useQuery의 `onError`/`res.error.code` 분기에서 "접근 권한 없는 프로젝트" 안내 화면 또는 `/project` 리다이렉트. (프론트가 소속을 자체 판단하지 않음 — 서버 응답만 신뢰.)
- **목록/칸반/포트폴리오**: 서버가 이미 필터한 결과를 반환하므로 **프론트 추가 필터 불요**(원칙). 렌더 로직 무변경, 회귀만 확인.
- **원칙**: 프론트는 소속 여부를 절대 계산하지 않는다. 노출은 UX 보조, 실제 차단은 서버가 담당(defense-in-depth).

---

## 8. i18n 키 목록

`locales/kr/*.json`·`locales/en/*.json`에 추가 후 `cd static/ui && npm run merge`. (ko-KR/en-US 직접수정 금지.)

### `locales/kr/common.json` / `locales/en/common.json`
| 키 | KR | EN |
|---|---|---|
| common.pages.gantt | 간트 | Gantt |
| common.pages.cost | 비용 | Cost |
| common.sections.workforce | WorkForce | WorkForce |
| common.sections.settings | 설정 | Settings |

> `common.pages.{dashboard,report,kanban,project,settings,user,role,level,permission,status,public,storage}`는 기존 존재(재사용). 섹션 라벨은 기존 하드코딩("WorkForce"/"Settings")을 키로 승격.

### `locales/kr/permission.json` / `locales/en/permission.json`
| 키 | KR | EN |
|---|---|---|
| permission.error.denied | 이 작업을 수행할 권한이 없습니다. | You do not have permission to perform this action. |
| permission.error.unmapped | 권한이 정의되지 않은 작업입니다. | This action has no permission mapping. |
| permission.toast.deniedTitle | 권한 없음 | Permission denied |
| permission.scope.label | 프로젝트 데이터 범위 | Project data scope |
| permission.scope.all | 전체 프로젝트 | All projects |
| permission.scope.memberOnly | 소속 프로젝트만 | My projects only |
| permission.scope.description | 소속 프로젝트만: 이 권한의 사용자는 본인이 인력으로 등록된 프로젝트만 조회할 수 있습니다. | My projects only: users with this permission can view only projects they are assigned to. |
| permission.error.projectScopeDenied | 접근 권한이 없는 프로젝트입니다. | You do not have access to this project. |
| permission.error.projectScopeDeniedTitle | 프로젝트 접근 불가 | Project access denied |

> 프론트 mutation `onError`/`res.error.code==='PERMISSION_DENIED'` 분기에서 `permission.toast.deniedTitle` + `permission.error.denied` 토스트. `PERMISSION_PROJECT_SCOPE_DENIED`는 상세 화면에서 `permission.error.projectScopeDeniedTitle`/`...Denied` 안내. (백엔드 error.message는 로그/디버그용, UI는 i18n 키 사용.)

---

## 9. 구현 작업 분해 (backend → frontend 순차 파이프라인)

### Phase B1 — 카탈로그 & 가드 코어 (backend)
- [ ] `src/permission/ResourceCatalog.js` (14키, 파생 헬퍼, 분리기준 주석)
- [ ] `src/permission/PermissionMap.js` (109 함수 매핑, §2-B 그대로; PUBLIC/SELF/OR 포함)
- [ ] `src/error/PermissionError.js` + `ErrorCodes` 3키 추가
- [ ] `src/permission/PrincipalResolver.js` (`resolvePrincipal(context)`, L1 TTL 캐시, context.accountId, ADMINISTER, SQL, KVS 병합)
- [ ] `src/permission/permissionGuard.js` (`guard(meta)`, `isSatisfied`(OR), `guardedDefine`)
- [ ] `test/permission/permissionMap.contract.test.js` (등록집합 ↔ 매핑집합 대조)

### Phase B2 — 등록부 가드 적용 & 서비스 보강 (backend)
- [ ] 24개 Controller: `resolver.define(name, responseWrapper(fn))` → `guardedDefine(resolver, name, fn)` 기계적 치환
- [ ] `userPermissionCheckService`: context.accountId 사용(`getCurrentUserApi` 제거) + 카탈로그 전체 병합 응답, `PrincipalResolver` 공유
- [ ] `PermissionController.userPermissionCheck`: `({context}) => userPermissionCheckService(context.accountId)`
- [ ] **SELF 스코프 강제**: MyWork 4 + MySchedule 개인 CRUD 4 + getUserInfo 컨트롤러에서 `accountId: context.accountId`로 덮어쓰기
- [ ] 신규 resolver `getPermissionCatalog` (PermissionController) + `getCatalogSections()` 서비스

### Phase B3 — 마이그레이션 (backend)
- [ ] `onInstall.SEED_VERSION` 6
- [ ] `addPermissionSeed` 카탈로그 파생 + 덮어쓰기(멱등)
- [ ] `migratePermissionSets` (커스텀 병합/고아정리/migrateFrom) + `runSeed` 등록
- [ ] i18n: common.json/permission.json (kr+en) 키 추가 → `npm run merge`

### Phase B4 — 프로젝트 데이터 범위 권한 ④ (backend, B1~B3 후)
- [ ] `resolvePrincipal` 확장: `projectScope`(세트/admin='ALL'/누락='ALL') + MEMBER_ONLY 시 `memberProjectIds` lazy 조회(1 SQL, L1 캐시 동승)
- [ ] `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNT` (`SELECT BIN_TO_UUID(project_id) FROM projectusers WHERE account_id=?`, INDEX(account_id)) + 리포지토리
- [ ] guard 확장: meta `project:'list'|'detail'` 지원, `req.principal` 부착, detail 시 `payload.projectId ?? payload.project_id` 소속검증 → `PERMISSION_PROJECT_SCOPE_DENIED`
- [ ] list 리포지토리 필터: findProject/getActiveProjects/kanban 2종에 `whereIn('project_id', memberIds)`(UUID_TO_BIN 래핑) 분기, memberIds 빈 배열이면 빈 결과
- [ ] portfolio 집계 서비스에 principal.memberProjectIds 필터 주입
- [ ] `getProjectCalendarWorklog` selectedProjectIds ∩ memberIds 교집합 필터
- [ ] `add/updatePermissionService` `projectScope` 저장, `findPermissionByIdService`/`userPermissionCheckService` 응답에 `projectScope`
- [ ] `ErrorCodes.PERMISSION_PROJECT_SCOPE_DENIED` + `ProjectScopeError` 클래스
- [ ] PermissionMap 2-C의 mode 반영(각 엔트리에 `project` 필드)

### Phase F1 — 프론트 fail-close & 카탈로그 (frontend, B 완료 후)
- [ ] `usePermissionStore.js` fail-close (응답 직소비, PAGE_IDS 제거)
- [ ] `constants/pages.jsx` PAGE_IDS/getPages 제거
- [ ] `usePermissionCatalog()` 훅 + `backofficeKeys.permissionCatalog()` (구 shape 어댑터 반환)
- [ ] 모달 6파일 카탈로그 훅 연동 + 로딩 처리
- [ ] 비용 탭 게이트 `canRead('PROJECT_COST')` (tabs.js + ProjectDetailTabs.jsx)
- [ ] 권한 거부 토스트 i18n 분기

### Phase F2 — 프로젝트 범위 UI ④ (frontend, B4 후)
- [ ] 권한 등록/편집 모달에 `projectScope` 토글(ALL/MEMBER_ONLY) 추가 → add/updatePermission payload 포함
- [ ] `usePermissionStore`에 `projectScope` 저장 + `getProjectScope()` 노출(응답 필드)
- [ ] `ProjectDetailPage`(및 상세 useQuery) `PERMISSION_PROJECT_SCOPE_DENIED` onError → "접근 권한 없음" 안내/`/project` 리다이렉트
- [ ] 목록/칸반/포트폴리오: 프론트 추가 필터 없음(서버 필터 결과 그대로 렌더) — 회귀 확인만
- [ ] i18n scope 라벨/에러 문구

### Phase V — 검증 (integration-verifier)
- [ ] contract 테스트 green, jest/build 통과
- [ ] `userPermissionCheck` 응답 pages 완전성(14키) + `projectScope` ↔ 프론트 소비 교차확인
- [ ] fail-close: 미등록 사용자/미정의 키가 전부 false
- [ ] SELF 우회(타 accountId payload) 차단 확인
- [ ] ④ MEMBER_ONLY: 비소속 projectId 상세 직접 invoke → `PERMISSION_PROJECT_SCOPE_DENIED`; 목록/칸반/포트폴리오가 소속 프로젝트로만 필터; admin은 ALL
- [ ] 성능: 가드당 Jira 1(+SQL1+KVS1), MEMBER_ONLY만 +SQL1(memberIds), L1 캐시 히트 시 0

---

## 10. 확인 필요 / 가정 (구현 전 리더 확인 권장)

1. **비용 탭 Member 비노출 (behavior change)**: PROJECT_COST를 Member read=false로 하면 기존에 REPORT로 비용을 보던 Member가 프로젝트 비용 탭을 잃는다. 커스텀 세트는 migrateFrom:REPORT로 보존되나 시드 Member는 아니다. 의도 확인 필요(민감도 정책상 채택했음).
2. **`addProjectStatusFromKanban` / `startProjectWorklogBatch` / `triggerPortfolioAggregation`**: 소비 맥락 추정. 칸반에서 상태 생성 권한, 배치/집계 트리거의 요구 권한은 제품 의도 확인 권장(현 매핑은 보수적 기본).
3. **Job 도메인 매핑 가정**: 현재 Job(업로드 잡/실패)이 사용자 엑셀 업로드 전용이라는 가정 하에 USER_MANAGEMENT로 매핑. 다른 대량 업로드(향후)로 확장되면 재매핑 필요.
4. **`req.context.accountId` 상시 제공 가정**: Global Page(user context) 기준 상시 제공으로 실증(ProjectUsersController 선례). 만약 특정 모듈에서 부재하면 해당 호출은 `PERMISSION_PRINCIPAL_UNRESOLVED`로 fail-close(안전).
5. **L1 캐시 TTL 30초**: 권한 변경 전파 지연 허용치. 조정 가능.
6. **④ "소속" 정의 = `projectusers` 등록만**: 요구사항대로 인력 테이블 등록 기준. Jira 이슈 담당자/협업자(coworker)이지만 projectusers 미등록인 사용자는 **비소속으로 간주**(상세 접근 차단). 이 정의가 맞는지 확인 필요(향후 담당자 포함으로 넓힐 여지 §12 로드맵).
7. **④ MEMBER_ONLY의 write 상세 범위**: 소속 프로젝트에 대한 write(updateProject/deleteProject 등)를 허용할지, MEMBER_ONLY는 read만 제한하고 write는 별개(PROJECT/write 보유자만)로 둘지 확인. 현 설계는 detail 검증을 read/write 공통 적용(본인 프로젝트만 수정).
8. **④ inherited-scope 자식키 write의 잔여 노출**: memberId/folderId 등 자식키만 받는 write는 상위 read 경로가 이미 scope됨에 의존(직접 invoke로 타 프로젝트 자식키를 알아내 호출하는 극단 케이스는 미차단). 완전 차단은 write마다 부모 project_id 역조회(+1 SQL) 필요 — 비용 대비 리스크 낮다고 판단해 Phase 1 제외. 강화 필요 시 §12.
9. **④ 포트폴리오 집계 필터 = 축소 채택**: MEMBER_ONLY에서 전사 대시보드를 전면 차단이 아닌 "소속 프로젝트 집계"로 축소. REPORT-gate와 scope 상충 시 scope 우선. 제품 의도 확인 권장.

---

## 11. 프로젝트 데이터 범위 권한 (범위 ④)

### 11-A. 저장 위치 결정 — 권한 세트 단위 `projectScope` (채택)
| 방식 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **권한 세트 필드 `projectScope`** (채택) | 기존 permission 모델·설정 UI와 일관 / **세트별 차등 가능**(PM 세트=ALL, 협력사 세트=MEMBER_ONLY) / 사용자당 permission_key 1개라 자동 적용 | 세트마다 토글 관리 | ✅ |
| 전역 설정 1개 (`settings.projectScope`) | 단순(온·오프 1개) | **사용자군 차등 불가**(전원 동일) / settings 도메인에 권한 개념 누수 | ✗ |
근거: ④ 요구의 핵심은 "**설정 가능**(관리자가 켜고 끔)"이며, 실제 운영에서 내부직원=ALL·외주=MEMBER_ONLY처럼 **집단별 차등**이 자연스럽다. 전역 1-플래그는 이를 표현 못 한다. 권한 세트는 이미 사용자군의 경계이므로 scope의 소속처로 정확. → KVS `permission` 엔티티에 `projectScope:'ALL'|'MEMBER_ONLY'` 필드 추가.

### 11-B. principal 확장 & 소속 판정 소스
- `resolvePrincipal(context)` 반환 확장: `{ isAdmin, resourceMap, projectScope, memberProjectIds }`.
  - `isAdmin` → `projectScope='ALL'` 강제(요구: ADMINISTER는 항상 ALL).
  - 비admin → 권한 세트의 `projectScope`(부재 시 `'ALL'`).
  - `projectScope==='MEMBER_ONLY'`일 때만 `memberProjectIds`를 **lazy 조회**: `ProjectUsersQuery.FIND_PROJECT_IDS_BY_ACCOUNT` = `SELECT BIN_TO_UUID(project_id) FROM projectusers WHERE account_id=?`. `ALL`이면 조회 안 함(비용 0).
- **소속 정의**(실증): `projectusers` 테이블(`projectusers.sql.js`) — `account_id VARCHAR(100)`, `project_id BINARY(16)`, `INDEX(account_id)`. "소속" = **해당 accountId로 projectusers에 인력 등록된 프로젝트**(role/level/salary 보유 행). 인덱스 있어 조회 저렴.

### 11-C. enforcement 책임 경계 (guard vs service)
가드는 **선언적 검증**(detail 소속 assert)과 **principal 주입**을 담당, 서비스는 **쿼리레벨 필터**를 담당. meta에 `project` 필드 추가:

| meta.project | 가드 동작 | 서비스 동작 |
|---|---|---|
| `'detail'` | `req.principal` 부착 + MEMBER_ONLY면 `pid = payload.projectId ?? payload.project_id` 추출, `pid ∉ memberProjectIds` → `throw ProjectScopeError(PERMISSION_PROJECT_SCOPE_DENIED)` | 변화 없음(가드 통과 = 소속 확인됨) |
| `'list'` | `req.principal` 부착(검증 안 함 — 목록은 필터로) | `principal`을 받아 리포지토리에 `memberProjectIds` 전달, MEMBER_ONLY면 `WHERE project_id IN (...)`. 빈 목록이면 빈 결과 |
| `'inherited'` / 미지정 | `req.principal`만 부착 | (자식키 write) 부모 scope는 상위 read에서 이미 강제 — §10-8 한계 |

- **guard→handler 신원 전달**: 가드가 `req.principal = principal`을 세팅 후 `handler(req)` 호출. list 핸들러는 `({payload, principal}) => svc(payload, principal)`로 principal 소비.
- **파라미터명 실증**: detail 대상은 `projectId`(cost/issueAnalysis/resourceAnalysis/progress) 또는 `project_id`(project/dashboard/gantt) 혼재 → 가드 추출기는 **둘 다 시도**(`payload.projectId ?? payload.project_id`). 배열형 예외 `getProjectCalendarWorklog.selectedProjectIds[]`는 service에서 `∩ memberProjectIds` 교집합 필터(부분 소속 허용).
- **에러**: `src/error/ProjectScopeError.js`(name `'ProjectScopeDeniedError'`, code `PERMISSION_PROJECT_SCOPE_DENIED`) + `ErrorCodes` 추가. responseWrapper가 표준 직렬화.

### 11-D. 대상 resolver
전수 표는 **§2-C** 참조. 요약: list 5개(findProject·getActiveProjects·kanban 2·portfolio) / detail 다수(프로젝트 상세·분석·대시보드·간트·비용·인력) / inherited(자식키 write) / none(비프로젝트 도메인). 포트폴리오는 전사 집계를 memberProjectIds로 축소(§2-C 각주, §10-9).

### 11-E. 성능 (④ 추가분)
- `ALL` 세트(대부분): **추가 조회 0**. scope 분기만.
- `MEMBER_ONLY` 세트: principal 해석당 `memberProjectIds` **SQL 1회 추가**(INDEX(account_id), 결과 소량). L1 TTL 캐시(§4-B)에 principal과 함께 태워 warm 재사용 → 후속 가드 0회. detail 검증은 in-memory Set 조회(무비용). list 필터는 기존 쿼리에 `IN` 절만 추가(추가 왕복 없음).
- 결론: MEMBER_ONLY에서도 principal 1회당 Jira 1 + SQL 2(user + memberIds) + KVS 1, 캐시 히트 시 0. 수용 가능.

### 11-F. 경계면/프론트 요약 (상세 §2-A·§7-G)
- `userPermissionCheck` 응답에 `projectScope` 1필드 추가(하위호환). add/update/findPermissionById payload·응답에 `projectScope`.
- 프론트: 권한 모달 scope 토글, store `getProjectScope()`, 상세 화면 `PERMISSION_PROJECT_SCOPE_DENIED` 처리, 목록/칸반/포트폴리오는 서버 필터 결과 그대로(추가 필터 없음).

---

## 12. 범위 외 로드맵 (기록만)

- **액션 세분화(delete/export 등)**: 권한 스키마 `value:{read,write}`에 키 추가(`{read,write,delete,export}`)로 하위호환 확장 가능. 카탈로그 엔트리에 지원 액션 목록 필드 추가 → 가드 `action` 인자만 확장. 기존 세트는 마이그레이션 defaultForNew로 병합. **DB/응답 shape 파괴 없음.**
- **④ 강화**: (a) "소속" 정의를 이슈 담당자/coworker 포함으로 확장 (b) inherited-scope 자식키 write의 부모 project_id 역조회 완전 차단 (c) MEMBER_ONLY write를 read와 분리.
- **Jira 그룹 매핑 / 감사 로그**: principal 해석에 그룹 소스 추가, 가드 거부/허용 이벤트 로깅.
- **권한 변경 즉시 반영**: L1 캐시 무효화 채널(권한 세트 저장 시 캐시 버전 bump).
```
