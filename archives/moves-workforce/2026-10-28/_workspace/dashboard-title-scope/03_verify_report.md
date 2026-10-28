# P0-3 통합 정합성 검증 보고서 — Dashboard Title Ownership

검증 일시: 2026-08-31

## 통과

### 1. Resolver 등록 · 권한 게이트 · 입력 계약

- 생산자: `src/resolver/projectDashboard/ProjectDashboardController.js:53`
  - `guardedDefine(resolver, 'updateChartTitle', ({payload}) => updateChartTitleService(payload))`로 기존 등록을 유지한다.
- 권한 선언: `src/permission/PermissionMap.js:195`
  - `W('DASHBOARD', 'inherited')`가 등록되어 있다.
- 소비자: `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:267`
  - `invoke('updateChartTitle', { project_id, dashboard_id: id, title: newTitle })`로 Service 계약의 세 필드를 모두 전송한다.
  - 따라서 `project_id`가 permission gate와 Service 양쪽에 전달되며, 기존의 ID-only 우회가 재발하지 않는다.

### 2. 실제 소유권 확인 · 최종 DML 방어

- 생산자: `src/resolver/projectDashboard/ProjectDashboardService.js:658-670`
  - 빈 `project_id`·`dashboard_id`를 각각 `PROJECT_ID_REQUIRED`·`DASHBOARD_ID_REQUIRED`로 fail-close 한다.
  - `existsChartInProjectRepository(project_id, dashboard_id)`가 false이면 `DASHBOARD_CHART_NOT_FOUND`로 종료하고 UPDATE를 실행하지 않는다.
  - SELECT와 UPDATE 사이 경합으로 UPDATE가 0건이면 같은 오류로 처리한다.
- 생산자: `src/resolver/projectDashboard/ProjectDashboardRepository.js:82-84,114-116`
  - 조회 바인딩은 `[dashboard_id, project_id]`, DML 바인딩은 `[title, dashboard_id, project_id]`다.
- 생산자: `src/rdb/query/ProjectDashboard.js:60-64,85-90`
  - 소유권 SELECT와 `UPDATE_TITLE` 모두 `dashboard_id`와 `project_id = UUID_TO_BIN(?)`를 함께 조건으로 사용한다.
  - ALL 범위 principal 또는 향후 Service 직접 호출에서도 다른 프로젝트 행을 수정할 수 없다.
- 회귀 증거: `src/resolver/projectDashboard/__test__/ChartTitleScope.test.js`
  - 정상 수정, 두 필수 ID 누락, 타 프로젝트 dashboard ID, UPDATE 0건 경합, 복합 WHERE를 포함한 8개 테스트가 통과했다.

### 3. 응답 shape · 화면 갱신 계약

- 생산자: `src/utils/ResponseWrapper.js:3-25`
  - Service의 `undefined` 성공 반환은 `{ success: true }`가 되고, `LogicalError`는 `{ success: false, error: { name, code, message, cause } }`로 직렬화된다.
- 소비자: `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:268-271`
  - 성공 toast는 `res.success`만 사용하므로 성공 응답에 content가 없는 계약과 맞는다.
  - 성공·실패 모두 `projectKeys.dashboardInfo(project_id)`를 무효화하여 낙관적 로컬 제목이 남지 않는다.
- Query key: 인라인 배열이 아니라 `projectKeys.dashboardInfo(project_id)`를 사용한다.
- i18n: 새 문자열·키를 추가하지 않아 locale merge 변경이 필요 없다.

### 4. 실행 검증

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js` | 통과: 1 suite, 8 tests |
| `npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js` | 통과: 2 suites, 32 tests |
| `npm test -- --runInBand` | 통과: exit code 0. 기존 ChartFilterPersistence load 실패 해소 확인 |
| `static/ui && npm test -- --runInBand` | 통과: 94 suites, 1,630 tests |
| `static/ui && npm run bundle:check` | 통과: gzip 435,981 B / 950,000 B |
| `forge lint` | No issues found. PermissionLinter는 `Unknown product` 경고로 일부 검사를 수행하지 못함 |

## 실패

없음.

## 해결 확인

### R1. `ChartFilterPersistence`의 P0-1 import-chain mock 회귀

- 재현: `npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js`
- 최초 실패 위치: `src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js:14-16`
  - P0-1의 import chain이 필요로 하는 `migrationRunner`를 기존 `@forge/sql` mock이 제공하지 않아 발생했다.
- 실제 import 경계:
  - `src/resolver/projectDashboard/ProjectDashboardService.js:25` → `ProjectUsersService`
  - P0-1에서 추가된 `src/resolver/projectIssue/ProjectUsersService.js:9` → `ProjectChildScope`
  - `src/resolver/projectIssue/ProjectChildScope.js:1` → `PrincipalResolver`
  - 이후 `PermissionService` → `SeedData` → `onInstall` → `src/rdb/schema/migrate.js:26`로 이어진다.
- 원인: `migrationRunner.enqueue`가 undefined라 suite load 단계에서 `TypeError`가 발생해 차트 필터의 테스트 본문이 실행되지 않았다.
- 보정: `ChartFilterPersistence.test.js`의 `@forge/sql` mock에 chainable `migrationRunner`를 추가했다.
- 재검증: ChartTitleScope와 병렬 실행한 32 tests 및 root 전체 Jest가 모두 exit code 0으로 통과했다.
- 판정: P0-3 구현과 무관한 P0-1 연쇄 의존성 회귀였고, 현재 해소됐다.

## 미검증

1. `static/ui && CI=true npm run build`
   - locale merge와 CRACO production build가 `Creating an optimized production build...`까지 진행됐고, 이후 `build/asset-manifest.json` 생성 및 `bundle:check` 통과를 확인했다.
   - 다만 실행 도구가 최종 exit code를 수집하기 전에 반환했으므로, 이 보고서에서는 CI build 명령 자체는 통과로 판정하지 않는다.

2. Forge PermissionLinter 전체 범위
   - `forge lint`는 `No issues found`였지만 `Unknown product` 경고로 PermissionLinter 일부 동작이 미수행됐다. 앱의 실제 설치 환경에서 재확인이 필요하다.

## F1 후속 조치 — 해결

- `ChartFilterPersistence.test.js`의 `@forge/sql` mock에 실제 import 계약과 같은 체이닝 `migrationRunner.enqueue()`, `run()`, `list()`를 추가했다.
- 프로덕션 코드는 변경하지 않았다.
- 검증 결과:
  - `npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js` — 1 suite, 24 tests 통과
  - `npm test -- --runInBand src/resolver/projectDashboard/__test__` — 10 suites, 165 tests 통과
  - `npm test -- --runInBand` — 전체 root Jest 통과

## 결론

P0-3의 프론트 payload → permission gate → Service 소유 확인 → 복합 UPDATE → response/invalidation 경계는 일관되며, 타 프로젝트 dashboard 제목 변경을 차단한다. 확인된 테스트 mock 회귀도 보정·재검증되어, 현재 backend 전체 Jest는 green 상태다.
