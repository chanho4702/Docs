# Dashboard asApp Aggregate Boundary — Frontend Report

## 구현 범위

- `projectKeys.dashboardAggregate(projectId)`와 `useDashboardAggregate(projectId)`를 추가했습니다.
- hook은 `invoke('getDashboardAggregate', { project_id })`의 `{ success, content }` 계약을 확인한 뒤 `content`만 React Query cache에 저장합니다.
- `SummaryPanel`의 completion rate, D-day, overdue count는 aggregate DTO를 소비합니다.
- `progressStatus`, `plannedVsActual` widget은 aggregate DTO를 소비합니다. status의 count/MD 토글은 각각 `statusDistribution.byCount`/`statusDistribution.byEffort`를 사용합니다.
- `riskIssues`, `issueSize`는 기존 `useDashboardInsight`/`getDashboardIssueInsight` 경로를 유지했고, relation graph는 기존 `useProjectRelationGraph`/`getProjectRelationGraph` 경로를 유지했습니다.

## 응답 소비 계약

```js
const result = await invoke('getDashboardAggregate', { project_id: projectId });
if (!result.success) throw result.error;
return result.content;
```

`content`의 `project`, `counts`, `statusDistribution`, 선택적 `metrics`, `truncated`만 소비합니다. raw issue field는 aggregate 경로에서 사용하지 않습니다.

## i18n

신규 문구가 없어 locale source 파일 변경은 하지 않았습니다. frontend build의 기존 prebuild merge는 실행되었습니다.

## 검증

- `npm test -- --runInBand src/utils/queryKey/queryKeyFactories.test.js src/utils/__test__/dashboardInsightAdapters.test.js src/utils/queryKey/queryKeyContract.test.js src/constants/__test__/dashboardWidgets.test.js`
  - 4 suites / 79 tests passed
- `CI=true npm run build`
  - passed (`build/index.html` 생성 확인, Browserslist caniuse-lite 갱신 권고 warning만 발생)
- `git diff --check -- static/ui/src`
  - whitespace error 없음
