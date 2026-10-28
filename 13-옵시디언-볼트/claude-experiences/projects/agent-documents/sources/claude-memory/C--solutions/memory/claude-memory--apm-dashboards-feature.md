---
name: apm-dashboards-feature
description: "APM 개요/서비스 대시보드(위젯 레이아웃 편집, 홈 인프라 일반화) — 2026-09-15 구현·실측 상태와 함정"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2ff0d0f4-3d9a-4217-ad4d-e7f0de3cf957
  modified: 2026-09-15T07:39:54.202Z
---

APM 대시보드(ZM-122, 2026-09-15): 홈 위젯 인프라를 일반화해 APM 개요(`apm:overview`)·서비스별(`apm:service:<uid>`) 대시보드를 만들었다. 설계 `_workspace/features/apm/dashboards/devdesign_apm-dashboards.md`(§2·§4 구현 반영), 계약 `_workspace/features/apm/dashboards/contract_apm-dashboards.md`.

- BE: `home_widget.dashboard_key`(V58) + `home.DashboardKey`/`WidgetCatalog`/`DashboardWidgetService`(본체) — `HomeWidgetService`는 위임. APM 카탈로그는 **홈 enum과 별도**(`premium/apm/dashboard/ApmDashboardWidgetType`·`ApmDashboardCatalog`, A1 규칙·홈 고정 테스트 때문). 컨트롤러 `ApmDashboardController` `/apm/dashboards/{overview|services/{uid}}/widgets…`, 쓰기도 `apm.view`.
- FE: `components/WidgetDashboard/*`(WidgetGrid·WidgetShell·WidgetEditOverlay·AddWidgetModal·Toolbar·useWidgetDashboardEditor) + `hooks/useDashboardWidgets` + `services/widgetDashboard.api(createWidgetDashboardApi)`. 홈 파일은 얇은 래퍼(테스트 무수정). APM은 `ApmDashboardPanel` + `overview/widgets/registry`·`services/detail/widgets/registry`, 데이터는 Context로 내림.
- 실측(09-15): BE 재기동 후 시드 6/11·스코프 교차 400·404·중복·레이아웃·삭제·홈 격리 전부 OK. 헤드리스: 서비스 대시보드 11셀 정확히 채움(cardFill 0·overflow 0).

**Why:** 사용자 요청 "차트 레이아웃 편집 홈화면처럼 + 전체/서비스별 대시보드". 별 테이블·홈 enum 확장 대안은 카탈로그 두 벌·아키텍처 테스트 위반이라 기각.

2026-09-15 후속(같은 ZM-122): **홈 화면에 APM 대표 카드 편입**. 새 위젯 `apm_traffic_kpi`(12×5, `GET /apm/widgets/traffic-totals` — 개요 `totals`와 같은 계산을 `ApmOverviewQueryService.totals()`로 뽑아 공유) + 기본 세트에 트래픽 KPI·상태 요약·알람 3종 편입(비관리자 13 / 관리자 15). 느린 서비스 Top은 카탈로그 전용. FE 노출 축이 `apmView`(권한) **and** `apmLicensed`(`useLicense().allowsFeature("APM")`, 읽는 중 true)로 둘이 됐다.

커밋(미푸시): BE `9575442`(대시보드)·`a6e7802`(홈 카드) / FE `8fc247f`·`c2b1445`. FE 전체 jest 2798/2803 — 남은 실패 4건은 무관(트리거 폼·AI 어시스턴트 기존 회귀, RUM 2건은 전체 실행에서만 나는 플레이크).

2026-09-16 후속(ZM-122 `b99b404`): **DB 쿼리 가독성 + 트레이스 ID 바로가기**. DB 표의 쿼리 열이 `scroll.x=max-content`+폭 미지정이라 내용 길이(실측 4,288px)만큼 표를 늘려 숫자 열이 화면 밖으로 밀렸다 → 요약 배지(작업+테이블)·3줄 접기·`scroll.x=100%`+`tableLayout=fixed`. 상세는 `ApmSqlBlock`(절 단위 줄바꿈·키워드 강조·원문 토글, 복사는 언제나 원문). 유틸 `shared/apmSqlDisplay.ts`. 트레이스 필터 바에 32자 hex ID 입력(필터가 아니라 상세로 navigate).

**How to apply:**
- 🔴 APM 카드는 `WidgetShell`이 아니라 **`WidgetEditOverlay`**로 감싼다(카드 머리 중복 방지). 편집 중 카드 안 링크·토글은 `--editing` CSS로 클릭 차단.
- 🔴 화면 테스트는 `@/hooks/useApmDashboard`와 `react-grid-layout`을 mock해야 한다(QueryClient 없음·jsdom 폭 0). apmRoutes·ApmOverviewPage·ApmServiceDetailPage 스위트에 mock 있음.
- 🔴 헤드리스 프로필은 **영문 UI**라 버튼 라벨은 `['편집','Edit']`로 찾는다. 개요 페이지는 그리드가 25초 뒤에 뜬다(40초 대기).
- 🔴 전체 jest를 BE 컴파일과 동시에 돌리면 메모리 고갈로 워커가 고아로 남는다(9GB) — `CommandLine -match 'jest'`인 node 정리 후 재시도.
- 크기는 BE 시드=FE 상수 동일값, 양쪽 카탈로그 테스트가 못박음. 새 위젯 = BE enum·FE 상수·registry 세 곳.
