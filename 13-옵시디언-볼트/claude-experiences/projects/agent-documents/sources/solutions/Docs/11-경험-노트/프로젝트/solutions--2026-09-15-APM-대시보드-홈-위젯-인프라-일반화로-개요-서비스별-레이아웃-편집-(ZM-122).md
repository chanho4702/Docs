# 2026-09-15 APM 대시보드 — 홈 위젯 인프라 일반화로 개요/서비스별 레이아웃 편집 (ZM-122)

## 무엇을
- 요청: "APM 차트 레이아웃 편집 가능하게, 홈처럼" + "전체 대시보드와 서비스별 대시보드".
- 결과: 홈 위젯 체계(`home_widget`·RGL 그리드·카탈로그 모달·편집 핸들러)를 **일반화**해 두 대시보드를 얹었다. 사용자별 저장, 서비스 상세 개요 탭이 곧 서비스 대시보드.
  - BE: `home_widget.dashboard_key`(V58, 기본 `home`) + `DashboardKey`/`WidgetCatalog`/`DashboardWidgetService`. APM 카탈로그·컨트롤러는 `premium/apm/dashboard/`.
  - FE: `components/WidgetDashboard/*` 공용 + `useDashboardWidgets` + `createWidgetDashboardApi(url)`. 홈은 얇은 래퍼로 남아 테스트 72건 무수정 통과.

## 결정과 이유
- **별 테이블이 아니라 컬럼 가산**: 카탈로그·EP·시드 로직이 두 벌 되는 비용을 홈에서 이미 겪었다.
- **APM 카탈로그는 홈 enum과 분리**: 홈 카탈로그 고정 테스트·FE 정합 테스트가 홈 enum을 그대로 검사하고, 프리미엄 코드는 `premium..` 밖으로 못 나간다(LicenseArchitectureTest A1). `spec(code)`가 다른 스코프 코드를 빈 Optional로 답해 `WIDGET_TYPE_INVALID`.
- **일반 경로 `/dashboards/{key}` 대신 스코프별 경로**: key 문자열을 URL로 받으면 권한·uid 존재 판정이 컨트롤러 밖으로 샌다. 서비스 대시보드는 `require(uid)` 먼저(없는 uid에 배치를 만들면 고아 행).
- **쓰기도 `apm.view`**: 배치는 사용자 취향이지 관리 행위가 아니다.
- **APM 카드는 `WidgetShell`이 아니라 `WidgetEditOverlay`**: `ApmChartCard`·Top5·히트맵은 배지·차트↔표 토글·범례가 머리에 붙어 있어 셸로 다시 감싸면 머리가 두 줄. 편집 모드에만 이름·삭제 오버레이를 얹고, 편집 중 카드 안 링크·토글 클릭은 CSS로 차단.
- **데이터는 Context로 한 번만**: 개요는 `GET /apm/overview` 하나, 서비스는 red-series·히트맵·가용성·Top5 두 벌을 탭이 읽어 내린다. 기본 세트 밖 위젯(상태코드·메서드)만 스스로 조회.

## 함정·교훈
- 🔴 **idempotent 편집 앵커가 새 텍스트에 포함되면 중복 삽입** — `HomeWidget.dashboardKey` 필드가 두 번 들어갔다(컴파일 전 발견). 앵커는 치환 결과에 남지 않는 것으로.
- 🔴 **화면 테스트는 `@/hooks/useApmDashboard`·`react-grid-layout`을 mock** — QueryClient 없음·jsdom 폭 0으로 그리드가 비어 스위트 셋이 깨졌다(apmRoutes 포함).
- 🔴 **전체 jest + Gradle 컴파일 동시 실행 → 메모리 고갈**: 시스템이 백그라운드 작업을 죽이고 jest 워커 11개가 고아(9GB)로 남아 이후 명령까지 타임아웃. `CommandLine -match 'jest'`인 node·`--headless` chrome 정리로 회복.
- 🔴 헤드리스 프로필 UI가 **영문**이라 "편집" 버튼 탐색 실패 → `['편집','Edit']`. accessToken 30분 만료라 재캡처 전 재로그인.
- 개요 페이지 그리드는 데이터 도착 뒤에 뜬다(25초 대기로 부족, 40초).
- 출력을 `cut | head`로 잘라 저장하면 JSON이 깨져 콘솔 로그를 잃는다 — 파일에 전량 저장 후 파싱.

## 실측
- BE(격리 워크트리) 57건 green · FE tsc/eslint/스위트 green(카탈로그 7·개요·상세·라우트·홈 8종).
- 재기동 후 curl: 시드 6/11, 스코프 교차 400, 없는 uid 404, 중복 400, 레이아웃·이름·삭제 OK, 개요·홈 스코프 격리 OK.
- 헤드리스: 서비스 대시보드 11셀 정확히 채움(카드-셀 높이 차 0, overflow 0).

관련: [[apm-dashboards-feature]] · 설계 `_workspace/designs/devdesign_apm-dashboards.md` · 계약 `_workspace/contract_apm-dashboards.md`
