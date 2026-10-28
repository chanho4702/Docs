# Moves Workforce 논리 설계 전수 검증 보고서

> **최종 판정: PARTIAL — 최초 감사에서 확인한 F-01~F-10 핵심 결함은 해소됐고 자동 검증은 통과했다. 다만 F-11 전역 frontend 부채, F-12 복구·성능 위험, 실제 development deploy/E2E와 PermissionLinter 미검증이 남아 운영 출시 완료로 판정하지 않는다.**

## 0. 2026-08-03 최종 통합 재검증

### 0.1 최종 상태

| ID | 최종 상태 | 근거 |
|---|---|---|
| F-01 | **RESOLVED** | SELF 일정 update/delete에 actor 기반 owner predicate와 0행 오류를 적용하고, frontend mutation 실패 시 modal 유지·성공 시에만 invalidate/close하도록 통일했다. |
| F-02 | **RESOLVED** | Forge SQL raw `rows.affectedRows`를 공통 adapter의 `rowsAffected`로 정규화했다. user update repository의 adapter 우회와 raw-shape가 아닌 mock도 제거했으며 0행 회귀 테스트가 통과했다. |
| F-03 | **RESOLVED** | Backend/frontend 모두 명시적 context `active/inactive`를 우선한다. license 부재는 `development/staging`만 허용하고 production은 API fallback, unknown/context 실패는 `UNAVAILABLE` fail-closed로 맞췄다. diagnostics 우회 경로도 제거했다. |
| F-04 | **RESOLVED** | 공용 resource DTO에서 `salary` 계열을 제거하고 재귀 누출 test를 추가했다. |
| F-05 | **RESOLVED** | Calendar context·`worklog.started`를 연결하고 resolved `{success:false}`도 rollback/error 경로로 보내 success toast와 cache invalidate를 막았다. |
| F-06 | **RESOLVED** | `{content:{job}}` 소비, transient/terminal cleanup 분리, exponential backoff 계약과 테스트가 일치한다. |
| F-07 | **RESOLVED** | 미래 구간 clamp, 미래-only short circuit, 0 denominator `null/N/A`, overlap schedule cap을 backend/UI에 반영했다. |
| F-08 | **RESOLVED** | 내 일정 기간 조회를 overlap predicate로 수정했다. |
| F-09 | **RESOLVED** | `progressThreshold`를 manifest schema·default·seed·service validation·UI에 `0..100 %p`, 기본값 `5`로 연결했다. |
| F-10 | **RESOLVED** | architecture/ERD/핵심로직/onboarding/README와 Obsidian 감사 노트·INDEX·프로젝트 허브를 현재 구현/inventory로 갱신했다. |
| F-11 | **PARTIAL** | 감사 대상 일정 query key와 주요 i18n은 보정했다. 전역 inline `queryKey` 57건, 직접 invalidate 13건과 `ScheduleModal` 하드코딩 UI는 기술부채로 남는다. |
| F-12 | **OPEN** | main bundle gzip 1.72MB와 `project_team` DELETE→INSERT 다단계 write의 비트랜잭션 복구 위험은 이번 범위 밖이다. |

### 0.2 최종 실행 검증

| 검증 | 결과 | 상세 |
|---|---|---|
| Backend Jest | **PASS** | 52 suites / 768 tests / 0 failures |
| Frontend Jest | **PASS** | 41 suites / 650 tests / 0 failures / snapshot 1 PASS |
| Frontend production build | **PASS with warnings** | 109.9초, main JS gzip 1.72MB, Atlaskit 2건 + marklassian 1건 source-map, bundle-size와 `MODULE_TYPELESS_PACKAGE_JSON` 경고 |
| i18n merge/parity | **PASS** | merge 성공, kr/en leaf 1,994/1,994, 한쪽 누락 0, 정적 `t()` 누락 0 |
| `git diff --check` | **PASS with line-ending warnings** | `.gitignore` EOF 공백 제거 후 exit 0. LF→CRLF 경고만 존재 |
| `forge lint` | **PARTIAL / Permission UNVERIFIED** | app root에서 실행한 기존 결과는 `No issues found`; PermissionLinter는 `Unknown product`로 해당 검사 미완료 |
| Git snapshot | **기록** | HEAD `165bd21` + 사용자/이번 작업이 함께 있는 dirty worktree. 기존 변경을 되돌리지 않음 |

### 0.3 배포 전 잔여 검증

- development deploy 후 Forge SQL DML raw shape, KVS `progressThreshold` schema, 일정 ownership을 smoke test한다.
- production license active/inactive/missing/API failure 및 frontend 직접 `requestJira` 차단을 E2E로 확인한다.
- Jira Calendar drag의 2xx/4xx/transport 실패와 queue polling transient/terminal cleanup을 E2E로 확인한다.
- PermissionLinter `Unknown product` 원인을 해소한 뒤 `forge lint`를 다시 실행한다.
- F-11 query key/i18n 부채와 F-12 bundle/`project_team` 복구 전략은 별도 RFC로 추적한다.

---

## A. 1차 후속 통합 재검증 이력

> 검증 기준일: 2026-08-03 (Asia/Seoul)  
> 후속 재검증 revision: `165bd21` + 검증 시점의 미커밋 작업 트리  
> 범위: 프로젝트 내부 설계 문서·`_workspace/` RFC/잔여 작업 문서·Obsidian 경험 노트·manifest·backend/frontend·SQL/KVS 모델·권한·응답 계약·i18n·테스트·build·Forge lint  
> 당시 판정: **PARTIAL — 핵심 backend 결함은 보완됐으나 통합 경계 4개와 배포 E2E가 남음**  
> 보존 원칙: 아래 최초 감사 본문은 원인·증거 이력으로 유지하며, 현재 상태는 이 후속 재검증 절을 우선한다.

## A.1 2026-08-03 1차 후속 통합 재검증

### A.1.1 상태 요약

| ID | 현재 상태 | 재검증 결론 |
|---|---|---|
| F-01 | **PARTIAL** | Backend `SELF` owner predicate·0행 오류·overlap 조회는 해결. Frontend 일정 mutation cache/error 계약은 잔존 |
| F-02 | **PARTIAL** | Runtime `rows.affectedRows` → `rowsAffected` alias는 해결. SDK raw shape와 다른 test mock이 잔존 |
| F-03 | **PARTIAL** | Backend 4-state/fail-closed·diagnostics 제거·registrar 중앙화는 해결. Frontend gate는 context 부재/실패를 계속 허용 |
| F-04 | **RESOLVED** | 공용 `ResourcePersonDTO`에서 비용 키 제거, 재귀 누출 test 통과 |
| F-05 | **PARTIAL** | context 전달·`worklog.started` 사용은 해결. 실제 `executeRequest` 실패 shape를 성공으로 오인 |
| F-06 | **RESOLVED** | `{content:{job}}`, wrapper 실패, `job:null`, transient/terminal cleanup 경계와 backoff 일치 |
| F-07 | **RESOLVED** | 미래 clamp, 미래-only/0분모 `null`, 겹침 일정 cap 및 UI `N/A` 일치 |
| F-08 | **RESOLVED** | 내 일정 조회가 overlap predicate를 사용 |
| F-09 | **RESOLVED** | manifest/default/seed/service/UI validation 및 저장 응답 계약 일치 |
| F-10 | **PARTIAL** | 후속 SSOT는 최신화됐으나 기존 architecture/ERD/README/Vault 정합화는 별도 문서 작업 결과 확인 필요 |
| F-11 | **PARTIAL** | 감사 대상 다수는 factory/i18n으로 이관. 일정 화면 inline key·hardcode와 전역 inline key 부채 잔존 |
| F-12 | **OPEN** | main bundle 1.72MB gzip과 `project_team` DELETE→INSERT 복구 위험은 이번 수정 비범위 |

### A.1.2 실패/부분 통과 경계면

#### F-01/F-11 — 일정 mutation 소비자와 query key 불일치 (Frontend)

- 생산자: `updateMySchedule`/`deleteMySchedule`은 `{success:true, content:{scheduleId, rowsAffected:1}}`를 반환하고 타인 소유 0행은 `SCHEDULE_NOT_FOUND_OR_FORBIDDEN`으로 거부한다.
- 소비자: `static/ui/src/pages/myWork/WorklogPage.jsx:90,314`와 `static/ui/src/pages/myWork/modal/ScheduleModal.jsx:137`은 여전히 `['getMyScheduleList']` inline key를 사용한다. Project Calendar의 `scheduleKeys.myList({startDate,endDate})`와 prefix가 달라 mutation 후 Calendar cache가 무효화되지 않는다.
- `ScheduleModal.jsx:145-151`은 delete 실패 응답을 표시하지 않고 `submitModal()`을 실행해 실패해도 modal을 닫는다. `ScheduleModal.jsx:114`도 add/update의 성공 여부와 무관하게 submit callback을 실행한다.
- `schedule.error.notFoundOrForbidden` source key가 없고 일정 modal의 성공/실패/label 문구도 하드코딩돼 있다(`ScheduleModal.jsx:123-160,194-298`).
- 수정 방법: `scheduleKeys.myList(...)`와 `scheduleKeys.all` prefix invalidate를 mutation 소비자 전체에 적용하고, mutation 함수가 성공 boolean을 반환한 경우에만 modal을 닫는다. `result.success === false`의 error code를 양 언어 i18n으로 매핑한다.

#### F-02 — DML runtime은 해결됐지만 mock 계약이 완전히 정규화되지 않음 (Backend)

- `src/rdb/query/CommonQuery.js:34-38`은 공식 raw `rows.affectedRows`를 보존하면서 `rowsAffected` alias를 제공한다. 공통 contract test도 실제 raw shape를 사용한다.
- 그러나 `{rowsAffected}`만 반환하는 repository mock이 `UpdateUserMerge.test.js:15-16`, `UserDeleteCascade.test.js:4,42,65,100,113`, `ProjectTeamService.test.js:9-16,84,235,248,257,312`, `TeamService.test.js:25,28-29,423`에 남아 있다.
- 이는 SSOT의 “`{rowsAffected:1}` 단독 mock 금지”와 불일치하며 향후 adapter 제거/회귀를 가릴 수 있다.
- 수정 방법: repository mock을 `{rows:{affectedRows:n}, rowsAffected:n}`으로 통일하고 공통 helper로 중복을 제거한다. SQL을 발행하지 않는 명시적 NOOP 결과는 별도 domain contract로 구분한다.

#### F-03 — Backend fail-closed와 Frontend app gate가 연결되지 않음 (Backend + Frontend)

- Backend는 `ACTIVE|INACTIVE|NOT_APPLICABLE|UNAVAILABLE` 4-state를 구현하고 production `UNAVAILABLE`을 차단한다. `getLicenseDiagnostics` 파일/등록/invoke/console dump도 제거됐다.
- Frontend `useLicenseStore.js:74,88,94`는 context license 부재 또는 `view.getContext()` 실패를 계속 `isLicensed:true`로 처리한다. Backend의 `LICENSE_INACTIVE`/`LICENSE_STATUS_UNAVAILABLE` 결과가 `App` license gate로 전달되지 않는다.
- 따라서 backend resolver는 닫혀도 UI와 frontend 직접 `requestJira` 경로는 열릴 수 있어 앱 전체 fail-closed 계약은 완성되지 않았다.
- 수정 방법: 앱 초기화 시 guarded backend 판정을 반드시 확인하고 license 오류 상태를 store에 반영한다. 판정 전에는 route와 직접 `requestJira` action을 렌더/실행하지 않으며, unavailable은 재시도 가능한 별도 차단 화면으로 처리한다.

#### F-05 — Calendar가 실제 Jira HTTP 실패를 성공으로 오인 (Frontend)

- `worklogDrop.js:35`는 `executeRequest('updateWorklog', ...)` 결과를 받은 뒤 success 여부를 확인하지 않고, `:44-45`에서 event를 갱신하고 성공 toast를 표시한다.
- 실제 helper는 HTTP/transport 오류를 throw하지 않고 `{success:false,error}`로 resolve한다(`static/ui/src/utils/jiraApi/requestJira.js:181`). 현재 test는 reject mock만 검사해 이 경계면을 놓친다.
- 수정 방법: `result?.success === false`이면 throw/revert 경로로 보내고, resolved failure fixture를 추가해 `revert()`·error toast·cache 미무효화를 단언한다. 성공 응답이 Jira Worklog DTO인지도 검증한 뒤 `setExtendedProp`한다.

### A.1.3 통과한 생산자/소비자 계약

- `getSentryDSN`: backend `{content:{dsn}}` ↔ frontend `result.content.dsn`, 실패 시 앱 boot 지속.
- `getUploadJobStatus`: backend `{content:{job|null}}` ↔ frontend `success` 우선 확인. transient에는 server cleanup 없음, terminal에만 `cleanupJob`.
- `getResourceOverview`: `RESOURCE_MANAGEMENT` 응답 전체에 `salary|totalSalary|rate` 재귀 누출 없음.
- `getResourceAnalysisList`: top-level 호환 shape, `requestedEndDate/effectiveEndDate`, null denominator ↔ UI `N/A` 일치.
- `getSettingData/updateSetting`: top-level read와 `{content:{settings}}` update 소비가 일치하며 `progressThreshold` 0..100 finite validation을 양쪽에서 수행.
- registrar: `CONTROLLER_REGISTRARS` 등록 집합과 `PermissionMap`이 일치하고 목록 밖 직접 controller 등록 없음.

### A.1.4 실행 검증

| 검증 | 결과 | 상세 |
|---|---|---|
| Backend Jest | **PASS** | 51 suites / 752 tests / 0 failures / 0 snapshots |
| Frontend Jest | **PASS** | 38 suites / 633 tests / 0 failures / 1 snapshot |
| Frontend production build | **PASS with warnings** | main JS gzip 1.72MB, Atlaskit 2건 + marklassian 1건 source map 누락, bundle-size 및 `MODULE_TYPELESS_PACKAGE_JSON` 경고 |
| i18n merge/parity | **PASS** | build prebuild merge 실행, kr/en leaf 1,993/1,993, 한쪽 누락 0, 정적 `t()` missing/object 0 |
| 감사 대상 query key | **PARTIAL** | Calendar/analysis/settings/polling은 factory 사용, 일정 mutation 소비자 inline key 잔존 |
| 전역 inline query key | **OPEN** | `queryKey:[...]` 60건, 직접 `invalidateQueries({queryKey:[...]})` 15건 |
| `forge lint` | **PARTIAL / Permission UNVERIFIED** | `pwd`로 `C:\CloudJira\moves-workforce` 확인 후 실행. 94.8초에 `No issues found`; 단 PermissionLinter가 `Unknown product`로 일부 작업 미수행 |
| `git diff --check` | **PASS with line-ending warnings** | whitespace error 없음. LF→CRLF 경고 존재 |
| Git snapshot | **기록** | HEAD `165bd21`, 기존 사용자/구현 작업이 포함된 dirty working tree. 변경을 되돌리지 않음 |

### A.1.5 배포 전 잔여 검증

- development deploy 후 실제 Forge SQL DML raw shape와 KVS `progressThreshold` schema smoke test
- production license active/inactive/missing/API failure 4-state E2E 및 frontend app gate 확인
- Jira Calendar drag의 2xx/4xx/transport 실패 E2E
- queue polling의 transient retry, terminal cleanup, orphan KVS 확인
- PermissionLinter `Unknown product` 원인 해소 후 `forge lint` 재실행

---

## 1. 총평

Controller → Service → Repository 계층, 중앙 `PermissionMap`, deny-by-default 가드, 팀 트리/비용 권한 분리, Jira 원본 데이터 원칙, 배치·캐시 분리는 전반적으로 좋은 구조다. 그러나 문서가 현재 구현을 따라가지 못하고, 몇몇 핵심 경계면에서 문서상의 불변식과 실제 코드가 정반대로 동작한다.

특히 다음 세 항목은 테스트가 모두 통과하더라도 운영 배포를 막아야 한다.

1. `SELF` 일정 수정·삭제가 소유자를 SQL 조건으로 검증하지 않아 다른 구성원의 일정 ID를 알면 변경할 수 있다.
2. `@forge/sql` DML 결과는 `result.rows.affectedRows`인데 다수 서비스와 테스트가 `result.rowsAffected`를 사용한다.
3. 라이선스 진단 resolver가 중앙 권한·라이선스 가드를 의도적으로 우회하며, 운영 라이선스 판정도 조회 실패 시 fail-open이다.

## 2. 검증 결과 요약

| ID | 심각도 | 판정 | 영역 | 요약 |
|---|---|---|---|---|
| F-01 | P0 | FAIL | 권한/데이터 무결성 | `SELF` 일정 update/delete에 소유자 조건 없음 |
| F-02 | P0 | FAIL | SQL 계약 | DML `affectedRows` 반환 shape를 전역적으로 잘못 소비 |
| F-03 | P0 | FAIL | 라이선스/가드 | 임시 진단 resolver가 권한·라이선스 가드 우회, 운영 판정 fail-open |
| F-04 | P1 | FAIL | 개인정보/비용 권한 | `getResourceOverview`가 `PROJECT_COST` 없이 `salary` 반환 |
| F-05 | P1 | FAIL | UI 계약 | 프로젝트 캘린더가 `context` 없이 렌더링되어 일정 조회·drag update 실패 |
| F-06 | P1 | FAIL | 비동기 작업 계약 | polling이 표준 응답 wrapper를 해석하지 않아 오류를 완료로 오인 |
| F-07 | P1 | FAIL | 핵심 산식 | 미래 날짜가 가동률 분모에 포함되고 0일을 0.1일로 강제 |
| F-08 | P2 | FAIL | 기간 조회 | 내 일정 조회가 구간과 겹치지만 시작일이 이전인 일정을 누락 |
| F-09 | P2 | FAIL | 설정 SSOT | `progressThreshold`가 문서에는 설정값이나 schema/service/seed에는 없음 |
| F-10 | P2 | FAIL | 문서/거버넌스 | 아키텍처·ERD·README·Vault가 현재 팀/권한/저장 모델과 불일치 |
| F-11 | P2 | FAIL | 캐시/i18n | query key 직접 배열 74건, 정적 i18n 오류와 하드코딩 UI 잔존 |
| F-12 | P2 | RISK | 성능/복구 | main bundle 1.72MB gzip, 팀 전량 교체는 중간 실패 시 빈 상태 |

## 3. 상세 지적

### F-01. `SELF` 일정 변경이 실제 소유권을 강제하지 않는다 — P0

**문서/권한 계약**

- `src/permission/PermissionMap.js:197-202`는 일정 CRUD를 `SELF`로 선언한다.
- `src/resolver/mySchedule/MyScheduleController.jsx:10` 주석은 `context.accountId` 강제로 타인 위변조를 차단한다고 명시한다.

**실제 구현**

- add는 `context.accountId`를 저장 대상 `account_id`로 강제한다(`MyScheduleController.jsx:13-14`).
- update는 `context.accountId`를 넘기지만 서비스에서는 `updated_id`로만 사용한다(`MyScheduleService.jsx:16-27`). SQL `WHERE`는 `schedule_id`뿐이다(`src/rdb/query/UserSchedule.js:25-34`).
- delete는 context를 아예 전달하지 않으며(`MyScheduleController.jsx:19`), SQL도 `schedule_id`만 조건으로 사용한다(`UserSchedule.js:14-18`).
- 프로젝트 일정 조회 응답은 구성원 전체의 `schedule_id`를 포함한다(`UserSchedule.js:35-49`). 따라서 프로젝트 조회 권한이 있는 사용자는 다른 구성원의 일정 ID를 정상 API로 얻을 수 있다.

**영향**

타인 일정의 수정·삭제가 가능하다. 권한 가드가 resolver 진입만 허용하고 row ownership을 검증하지 않아 `SELF` 불변식이 깨진다.

**필수 수정**

- update/delete SQL을 `WHERE schedule_id = ... AND account_id = ?`로 변경한다.
- delete에도 `context.accountId`를 전달한다.
- DML 영향 행 수가 0이면 `NOT_FOUND_OR_FORBIDDEN`으로 처리한다. 이때 F-02의 DML shape를 먼저 바로잡아야 한다.
- 타인 ID로 update/delete가 거부되는 negative integration test를 추가한다.

### F-02. Forge SQL DML 반환 계약 불일치 — P0

설치된 `@forge/sql` 타입은 DML 결과를 `Result<UpdateQueryResponse>`로 반환하고 영향 행 수는 `result.rows.affectedRows`에 있다(`node_modules/@forge/sql/out/utils/types.d.ts:3-13`). 공통 `executeQuery`도 원본 결과를 그대로 반환한다(`src/rdb/query/CommonQuery.js:21-29`).

그런데 코드와 mock은 `result.rowsAffected`를 사용한다. 대표 영향:

- `src/resolver/projectIssue/ProjectUsersService.js:115`: 대상 사용자 없음 검출이 작동하지 않는다.
- `src/resolver/backoffice/user/UserService.js:469`: update 0행 검출이 작동하지 않는다.
- `src/resolver/projectTeam/ProjectTeamService.js:306`: 실제 insert가 성공해도 `addedCount`가 0으로 보고될 수 있다.
- `src/resolver/backoffice/team/TeamService.js:485,496`: 이동/해제 수가 0으로 보고될 수 있다.
- 다수 테스트가 `{ rowsAffected: 1 }`을 mock하여 실제 SDK 계약과 다른 상태로 green이다.

**필수 수정**

공통 어댑터에서 `rowsAffected: result?.rows?.affectedRows ?? 0`을 명시적으로 정규화하거나, 모든 호출부를 공식 shape로 통일한다. `{ rows: { affectedRows: 1 } }` 형태의 contract test를 공통 query 계층에 추가해야 한다.

참고: [Forge SQL API](https://developer.atlassian.com/platform/forge/storage-reference/sql-api/)

### F-03. 라이선스 진단 우회와 운영 fail-open — P0

- `src/resolver/license/LicenseDiagnosticsController.js:13-15`는 `responseWrapper`와 `guardedDefine`을 의도적으로 사용하지 않고 PermissionMap에도 등록하지 않는다고 명시한다.
- 이 resolver는 단일 registrar 목록 밖에서 직접 등록된다(`src/index.js:85-87`). 따라서 “모든 resolver는 단일 목록과 중앙 권한 계약에 포함된다”는 설계 불변식 및 contract test의 사각지대다.
- backend wrapper는 context license가 존재하면서 비활성일 때만 차단한다(`src/utils/ResponseWrapper.js:5-14`). license가 없거나 조회가 실패하면 통과한다.
- frontend도 license 부재·`view.getContext()` 실패를 허용으로 처리하고, context license와 backend 진단 결과를 브라우저 console에 기록한다(`static/ui/src/stores/useLicenseStore.js:78-121`).
- 파일 주석 자체가 production에서 평가판 종료 후에도 차단되지 않는 현상을 기록한다(`LicenseDiagnosticsController.js:4-6`).

**필수 수정**

- 원인 확인 후 임시 diagnostics resolver와 console logging을 제거한다.
- production paid 환경에서는 license 부재/조회 실패를 구분해 fail-closed하거나 License API self-query로 확정 판정한다. development/custom/free 환경의 정상적인 license 부재만 명시적으로 허용한다.
- diagnostics가 꼭 필요하면 관리자 전용 permission, 최소 DTO, 서버 로그/마스킹, 제거 기한을 둔다.
- controller registrar contract가 목록 밖 직접 `resolver.define()`을 검출하도록 테스트한다.

Atlassian은 paid app의 production context에서 license 정보를 제공하며, License API self-query도 제공한다. 환경별 license 부재 의미가 다르므로 단순 `undefined => 허용`만으로는 운영 정책을 표현할 수 없다. 참고: [Forge License API](https://developer.atlassian.com/platform/forge/apis-reference/license-api/), [Forge app listing/licensing](https://developer.atlassian.com/platform/marketplace/listing-forge-apps/)

### F-04. 비용 권한 없이 salary 노출 — P1

- `getResourceOverview` 권한은 `RESOURCE_MANAGEMENT` read다(`src/permission/PermissionMap.js:266`).
- 공용 people DTO에 `salary`가 포함된다(`src/resolver/resourceManagement/ResourceManagementService.js:115-133`).
- `getResourceOverviewService`가 이 배열을 그대로 반환한다(`ResourceManagementService.js:157-185`).

프로젝트 비용 화면은 별도 `PROJECT_COST` 권한으로 분리되어 있으므로, 급여가 일반 자원 관리 응답에 포함되면 민감정보 경계가 무너진다.

**필수 수정**: 공용 DTO에서 salary를 제거하고 비용 전용 projection에서만 추가하거나, resolver에서 `PROJECT_COST`를 별도로 검사해 조건부 필드로 반환한다. `ProjectUsersSalaryLeak.test.js`와 동일한 누출 방지 contract test를 자원 관리 endpoint에도 적용한다.

### F-05. 프로젝트 캘린더 context 계약 파손 — P1

- 탭은 `<ProjectCalender project_id toast />`로 렌더링한다(`static/ui/src/constants/tabs.js:123-130`).
- 컴포넌트는 `context` prop을 요구한다(`static/ui/src/pages/projectDetail/calender/ProjectCalender.jsx:32`).
- 일정 query는 `context.accountId`를 사용하지만 `enabled`에서는 optional chaining을 혼용한다(`ProjectCalender.jsx:79-88`).
- drag update는 `context.timezone`과 `event.extendedProps.started`를 사용한다(`ProjectCalender.jsx:237-260`). context가 없으므로 예외 후 `revert()`되어 사용자에게는 이동이 항상 실패한다.

**필수 수정**: 상위에서 context를 전달하거나 하나의 context store/hook에서 조회한다. drag의 기존 시간은 실제 FullCalendar event shape로 고정하고, context 부재·drag 성공·실패 toast를 테스트한다.

### F-06. job polling이 표준 응답 계약을 잘못 소비 — P1

- resolver는 `guardedDefine`으로 등록되어 `responseWrapper`의 `{ success, ...result }` 계약을 따른다(`src/resolver/utils/job/JobController.js:8-21`).
- service는 KVS job 객체를 raw 반환한다(`src/resolver/utils/job/JobService.js:4-8`).
- frontend는 `success`를 검사하지 않고 곧바로 `{ total, processed, failed, status }`를 구조 분해한다(`static/ui/src/polling/JobPollingManager.jsx:42-55`). `{success:false,error}`도 `job` truthy이므로 오류로 처리되지 않고 polling을 종료한다.
- catch에서는 transient 오류에도 서버 job을 삭제하며, 존재하지 않는 `t('upload.error')` 키를 사용한다(`JobPollingManager.jsx:78-84`). 실제 key는 `common.upload.error`다.

**필수 수정**: 응답을 `{ content: { job } }`로 명시하고 frontend에서 `success`를 먼저 검사한다. not-found, 완료, transient transport error를 분리하고 transient error에는 job 삭제를 금지한다.

### F-07. 가동률 미래 분모·0.1일 강제 — P1

핵심 로직 문서는 미래 구간을 가동률 분모에서 제외한다고 정의한다. 하지만 service는 요청 `endDate`를 그대로 근무일·휴가·월별 MM 계산에 사용한다(`src/resolver/resourceAnalysis/ResourceAnalysisService.js:72-95`). UI의 종료일 DatePicker에도 오늘 상한이 없다(`ResourceAnalysisPage.jsx:398-418`). 수동으로 미래 종료일을 선택하면 미래 가용일이 분모에 포함되어 가동률이 인위적으로 낮아진다.

또한 완전 휴가 또는 유효 근무일 0인 기간도 `Math.max(0.1, ...)`로 0.1일을 만든다(`ResourceAnalysisService.js:97-105,125-136`). 이는 문서에 없는 값 조작이며 0으로 나눌 수 없는 상태를 실제 가용시간처럼 표현한다.

**필수 수정**

- backend에서 effective end를 `min(endDate, today)`로 강제한다. UI 제한은 보조 방어다.
- 분모 0은 `null`/`N/A` 계약으로 표현한다.
- 미래 전용 구간, 오늘을 걸친 구간, 전일 휴가, 공휴일만 있는 구간 테스트를 추가한다.
- 겹치는 일정이 여러 건일 때 deduction 중복 합산을 허용할지, 일자별 max/cap을 적용할지 도메인 규칙을 명시한다.

### F-08. 내 일정 기간 겹침 조회 누락 — P2

`getMyScheduleListRepository`는 `schedule_start_date BETWEEN startDate AND endDate`만 사용한다(`src/resolver/mySchedule/MyScheduleRepository.jsx:6-23`). 예를 들어 7월 30일~8월 3일 휴가를 8월 1일~8월 31일로 조회하면 시작일이 범위 밖이어서 누락된다. 프로젝트 전체 일정 query는 이미 올바른 overlap 조건(`schedule_end_date >= start AND schedule_start_date <= end`)을 사용한다(`src/rdb/query/UserSchedule.js:45-48`). 두 query의 기준을 통일해야 한다.

### F-09. `progressThreshold`는 실질적으로 설정할 수 없다 — P2

핵심 로직 문서는 `progressThreshold`를 settings 입력으로 정의한다(`Moves_Workforce_핵심로직_정의서.md:77,104,129`). 구현도 값을 읽는다(`src/resolver/projectProgress/ProjectProgressService.js:52-55`, `src/resolver/portfolioDashboard/PortfolioDashboardService.js:152`). 그러나 manifest settings schema에 해당 attribute가 없고(`manifest.yml:232-253`), update service에도 없으며(`src/resolver/backoffice/setting/SettingService.js:12-26`), seed에도 없다. 결과적으로 항상 코드 default 5%p가 사용된다.

설정으로 제공할 것이면 schema/seed/service/UI/validation을 모두 추가하고, 고정 상수라면 문서와 화면에서 설정 가능하다는 표현을 제거한다.

### F-10. 설계 문서와 현재 구현이 SSOT 관계를 잃었다 — P2

| 항목 | 설계 문서 | 현재 구현 |
|---|---|---|
| controller | 17 domain / 26 controller (`아키텍처:72`) | registrar 30개 + 목록 밖 license diagnostics 1개 (`src/index.js:52-87`) |
| SQL | 11 table (`ERD:328`) | 12 table: `project_team` 포함, migration v014까지 |
| KVS custom entity | 11 entity (`ERD:328`) | 12 entity: `team` 포함 (`manifest.yml:134-301`) |
| 사용자 모델 | `salary_type`, `team_key` 없음 | v012/v013에서 추가 |
| 프로젝트-팀 | 없음 | `project_team`, `TEAM_ONLY`, 팀 계층/리더 권한 존재 |
| Jira 호출 | `asApp` 2예외 (`아키텍처:90-92`) | entity property, license, queue/trigger 등 추가 사용 경로 존재 |
| query key | factory만 사용 (`아키텍처:151`) | 정적 검색상 직접 배열 74건 |
| README | 운영 프로젝트 안내여야 함 | 여전히 Forge Hello World 및 `static/hello-world` 경로 (`README.md:1-27`) |

Obsidian Vault도 2026-07-15 이후 최신 RFC-147 팀 관리 구현이 index/hub에 반영되지 않았다. 또한 프로젝트 지침은 Vault 경로를 `C:\Users\DMOVE\Codex-experiences\`로 지정하지만 실제 Vault는 `C:\Users\DMOVE\claude-experiences\`다.

프로젝트 지침은 UI Kit 전용이라고 선언하지만 현재 manifest와 UI는 React 18 + Atlaskit 기반 Custom UI다. Custom UI 자체는 Forge에서 유효한 구조이므로 이를 runtime 결함으로 볼 수는 없지만, 유지보수 지침이 현재 architecture와 양립하지 않는다. “기존 Custom UI 승인” 또는 UI Kit migration 계획 중 하나를 공식 결정해야 한다.

### F-11. query key 및 i18n 계약 잔여 — P2

- 현재 정적 검사에서 직접 배열형 query key/invalidation이 74건이다. 캐시 무효화가 factory와 갈라질 수 있다.
- `static/ui/src/polling/JobPollingManager.jsx:83`의 `upload.error`는 ko/en 모두 존재하지 않는다.
- `static/ui/src/backoffice/page/projectStatus/modal/edit/ProjectStatusEditModal.jsx:47`은 문자열이 아니라 object인 `level.modal.edit.label.title`을 label로 사용한다. 실제 leaf는 `.placeholder`뿐이다.
- `static/ui/src/backoffice/page/level/modal/edit/LevelEditModal.jsx:29-30`에는 `Close`, `삭제`가 하드코딩되어 있다.
- ko/en 사전 leaf는 각 1,976개로 상호 대칭이다. 즉 문제는 locale 간 누락보다 소비 key와 하드코딩이다.

query key는 factory 이관을 일괄 수행하고, CI에 `queryKey: [`/직접 invalidate 패턴 금지 검사와 정적 i18n key/type 검사를 추가해야 한다.

### F-12. 성능·복구 잔여 위험 — P2

- production build는 성공했지만 main JS가 gzip 1.72MB이며 CRA가 권장 크기 초과를 경고한다. source map 누락 경고도 3건이다. global page 초기 진입 비용에 대한 bundle budget과 route-level lazy loading 기준이 설계 문서에 없다.
- 프로젝트 담당 팀 전량 교체는 DELETE 후 INSERT이며 transaction이 없어 중간 실패 시 빈 상태가 남는다. 코드가 이를 명시적으로 인정한다(`src/resolver/projectTeam/ProjectTeamService.js:109-148`). Forge SQL은 transaction을 지원하지 않으므로, snapshot/compensation, versioned replacement, 복구 job, 재시도 UX 가운데 하나를 운영 절차로 명문화해야 한다.

참고: [Forge SQL migration guide — transactions not supported](https://developer.atlassian.com/platform/forge/storage-reference/sql-migration-guide/)

## 4. 통과 항목

- backend Jest: **42 suites / 708 tests PASS**
- frontend Jest: **33 suites / 588 tests / 1 snapshot PASS**
- frontend production build: **PASS with warnings**
- backend resolver vs frontend `invoke()` 정적 대조: frontend가 호출하지만 backend에 없는 resolver 이름 없음
- ko/en locale leaf parity: **1,976 / 1,976, 차이 0**
- `ProjectUsers` 목록의 직접 salary 누출은 현재 query에서 제외되어 기존 잔여 작업 문서의 해당 항목보다 구현이 앞서 있다.
- 중앙 권한 map과 팀 리더/비용 gate에 대한 기존 contract/unit test는 대체로 충실하다.

단, 테스트 green은 F-02의 잘못된 DML mock과 F-01 소유권 negative test 부재를 가리지 못한다.

## 5. 부분 통과·미검증

- `forge lint`: `No issues found`였으나 PermissionLinter가 `Unknown product` 예외로 일부 검사를 수행하지 못했다. 따라서 manifest syntax는 통과로 보되 permission lint는 **PARTIAL/UNVERIFIED**다.
- production site E2E: 라이선스 만료/부재, Jira permission, `asApp` entity property, Forge SQL 실제 DML shape, KVS schema 422, calendar drag, queue polling은 배포 환경에서 재현하지 않았다.
- storage/info schema, scheduled trigger, queue consumer는 로컬 unit test만으로 플랫폼 동작을 완전 검증할 수 없다.
- 검증 중 작업 트리의 UI/locale 파일이 계속 수정되었다. 테스트와 build는 2026-08-03 최종 재실행 시점 스냅샷 기준이며, 이후 변경에는 재검증이 필요하다.

## 6. 권장 수정 순서

1. F-01 일정 ownership SQL 조건 + negative test
2. F-02 DML 결과 shape 중앙 정규화 + 실제 shape contract test
3. F-03 license 정책 확정 및 diagnostics 제거/보호
4. F-04 salary DTO 분리
5. F-06 polling response 계약 통일
6. F-05 calendar context/drag 계약 수정
7. F-07 미래 분모와 0일 계약 수정
8. F-08/F-09 및 문서·query key·i18n 정리
9. development 배포 후 E2E, `forge logs`, permission lint 재확인

## 7. 재검증 합격 조건

- 타인 `schedule_id`로 update/delete 시 데이터 변화 0 + 명시적 오류
- DML contract test가 `{ rows: { affectedRows } }`를 사용하고 서비스 수치/0행 분기가 정확함
- 모든 등록 resolver가 registrar/PermissionMap/responseWrapper 정책에 포함됨
- production paid 환경에서 active/expired/missing/API failure 각각의 판정 테스트 존재
- `getResourceOverview` 응답에 비용 권한 없는 salary가 없음
- calendar 일정 query와 drag update E2E 통과
- 미래 구간·0 denominator 산식 테스트 통과
- backend/frontend tests, production build, `forge lint` 재통과
- development 배포에서 license/Jira/SQL/KVS/queue 주요 경로 smoke E2E 통과
