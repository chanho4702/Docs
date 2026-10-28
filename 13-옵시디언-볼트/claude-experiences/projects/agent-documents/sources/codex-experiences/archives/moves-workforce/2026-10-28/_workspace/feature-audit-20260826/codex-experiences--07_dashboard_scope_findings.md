# 프로젝트 대시보드 기능 감사 기록

기준: 2026-08-26

## P0 — 차트 제목 변경이 프로젝트 범위 검증과 SQL 소유 조건을 우회함

- `updateChartTitle`은 `PROJECT` write의 `inherited` 범위 resolver다. 하지만 화면 호출과 controller/service는 `{ dashboard_id, title }`만 전달·처리한다(`static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:267`, `src/resolver/projectDashboard/ProjectDashboardController.js:53`, `ProjectDashboardService.js:658-660`). 따라서 permission guard는 프로젝트 ID를 추출하지 못해 범위 검사를 건너뛴다.
- repository의 제목 변경도 `dashboard_id`만 WHERE 조건으로 사용한다(`src/resolver/projectDashboard/ProjectDashboardRepository.js:114-116`). 대상 dashboard가 어떤 RMS project 소속인지 서버에서 확인하지 않는다.
- 같은 모듈의 `updateChartFilter` 주석은 정확히 이 형태(`dashboard_id`만 받으면 inherited scope가 조용히 통과)를 과거 결함으로 설명하며, `project_id` 요구와 project 포함 UPDATE로 보완했다(`ProjectDashboardService.js:672-700`). 제목 변경 경로는 그 보완에서 빠져 있다.

영향: 범위 제한 사용자가 자신에게 허용된 프로젝트가 하나라도 있는 상태에서 타 프로젝트 chart ID를 알면 그 위젯 제목을 변경할 수 있다.

권장 수정: 제목 변경 payload에 `project_id`를 필수화하고 누락 시 fail-close 한다. repository UPDATE도 `dashboard_id`와 `project_id`를 함께 조건으로 사용하며, 타 프로젝트 dashboard ID 조합을 거부하는 회귀 테스트를 추가한다.

## P1 — 차트 삭제 실패가 성공 응답으로 위장될 수 있음

- `deleteChartByChartIdRepository()`는 SQL 예외를 catch한 뒤 로그만 남기고 반환한다(`src/resolver/projectDashboard/ProjectDashboardRepository.js:104-112`). `removeChartService()`와 resolver는 반환값을 검증하지 않으므로 response wrapper가 성공으로 응답할 수 있다(`ProjectDashboardService.js:727-730`).
- 화면은 성공 응답이면 로컬 state에서 위젯을 이미 제거했으므로(`static/ui/src/pages/projectDetail/dashboard/DashboardPage.jsx:137-145`), 저장 실패가 사용자의 새로고침 이후에만 드러난다.

권장 수정: repository에서 예외를 다시 throw하고, 필요하면 `rowsAffected`/존재 검증으로 대상 미존재를 명시적 오류로 반환한다.
