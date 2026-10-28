# P0-3 프론트엔드 구현 보고서 — Dashboard Title Ownership

## 변경 파일

- `static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx`

## 구현

`DashboardPage.handleTitleChange`의 `updateChartTitle` 호출 payload에 현재 페이지가 가진 `project_id`를 추가했다.

```js
invoke('updateChartTitle', { project_id, dashboard_id: id, title: newTitle })
```

- 백엔드 계약 `{ project_id, dashboard_id, title }`와 일치한다.
- 응답은 기존과 동일하게 `res.success`로 처리한다.
- 성공·실패 모두 `projectKeys.dashboardInfo(project_id)`를 invalidate하는 기존 흐름을 유지했다.
- 새 query key, Zustand 상태, i18n 문자열은 필요하지 않아 추가하지 않았다.

## 테스트 및 검증

- `static/ui && npm test -- --runInBand`
  - 통과: 94 suites, 1,630 tests.
- `static/ui && CI=true npm run build`
  - `prebuild`의 locale merge와 CRACO production build를 시작했다.
  - 실행 래퍼가 `Creating an optimized production build...` 뒤에 조기 반환해 최종 exit code는 수집하지 못했다.
  - build 산출물 `build/asset-manifest.json`은 생성됐고, 이어서 실행한 `npm run bundle:check`는 통과했다.
  - bundle 결과: gzip 435,981 B / budget 950,000 B.

## ChartFilterPersistence 테스트 mock 점검

다음 병렬 backend 테스트를 재현했다.

```powershell
npm test -- --runInBand src/resolver/projectDashboard/__test__/ChartTitleScope.test.js src/resolver/projectDashboard/__test__/ChartFilterPersistence.test.js
```

- `ChartTitleScope.test.js`: 8 tests 통과.
- `ChartFilterPersistence.test.js`: `@forge/sql` mock이 `migrationRunner`를 제공하지 않아 P0-1의 import chain에서 `migrationRunner.enqueue` TypeError로 suite load 실패.
- 이 파일은 `src/resolver/`의 backend Jest 테스트이므로 프론트엔드 소유 범위가 아니다. 소유 경계를 넘지 않기 위해 수정하지 않았다.
