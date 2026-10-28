# APM 대시보드 — 편집 가능한 차트 레이아웃 + 전체/서비스별 대시보드 (v0 초안, 2026-09-15)

> 요청(2026-09-15): "차트들 레이아웃 편집 가능하게 해줘 홈화면처럼" · "전반적인 대시보드가 필요해 — 전체 대시보드랑 각 서비스들의 대시보드".
> 상태: **초안 — 사용자 결정 3건 대기** (§6). 결정되면 계약서 `features/apm/dashboards/contract_apm-dashboards.md`로 옮기고 구현.

## 1. 무엇을 만드나

| 화면 | 지금 | 목표 |
|---|---|---|
| APM 개요(`/application-monitoring/overview`) | 고정 배치(Row/Col) 카드 8장 + 자리표시 3장 | **전체 대시보드** — 위젯 그리드(RGL 12컬럼), 편집 모드에서 끌기·크기·추가·삭제·초기화, 사용자별 저장 |
| 서비스 상세 개요 탭(`/services/:uid` 첫 탭) | 고정 배치 카드 9장 | **서비스 대시보드** — 같은 그리드, 위젯은 `serviceUid`에 바인딩. 레이아웃은 **서비스마다** 저장(전역 기본 레이아웃을 시드로) |
| 다른 상세 탭(트랜잭션·런타임·인스턴스…) | 고정 | 그대로(분석 화면이라 편집 가치 낮음). 원하면 2차 |

홈 위젯(ZM-110)과 같은 UX: 우상단 "편집" 토글 → 드래그·리사이즈 핸들, "위젯 추가" 모달(카탈로그·그룹), 위젯 셸의 ⋯ 메뉴(설정·삭제), "기본으로 되돌리기".

## 2. 재사용 — 홈 위젯 인프라를 그대로 쓴다 (✅ 2026-09-15 구현 반영)

- FE: 홈의 `HomeWidgetGrid`·`HomeWidgetShell`·`AddHomeWidgetModal`·`useHomeWidgets`·편집 핸들러를 **일반화**해 `components/WidgetDashboard/*`(`WidgetGrid`·`WidgetShell`·`WidgetEditOverlay`·`AddWidgetModal`·`WidgetDashboardToolbar`·`useWidgetDashboardEditor`·`types`)와 `hooks/useDashboardWidgets`·`services/widgetDashboard.api`(`createWidgetDashboardApi(url)`)로 올렸다. 홈은 그 일반형의 첫 소비자로 남는다(홈 파일은 얇은 래퍼, 테스트 무수정 통과).
  - 🔴 APM 카드는 `WidgetShell`(카드를 새로 그림)이 아니라 **`WidgetEditOverlay`**(카드는 그대로, 편집 모드에만 이름·삭제 오버레이)로 감싼다 — `ApmChartCard`·Top5·히트맵은 배지·차트↔표 토글·범례가 머리에 붙어 있어 셸로 다시 감싸면 머리가 두 줄이 된다.
  - 위젯 컴포넌트 계약 `({ widget, editMode })` + 데이터 문맥은 **Context**(`ApmOverviewDashboardContext` / `ApmServiceDashboardContext`) — 개요는 `GET /apm/overview` 한 응답, 서비스는 `red-series`·히트맵·가용성·엔드포인트 Top5 두 벌을 탭이 한 번 읽어 내린다(위젯마다 조회하면 같은 창을 N번 부른다). 기본 세트 밖 위젯(상태코드·메서드 분포)만 스스로 조회한다.
- BE: `home_widget`(V23)에 **`dashboard_key` 컬럼 가산**(V58: `varchar(64) NOT NULL DEFAULT 'home'`, 인덱스 `(user_id, dashboard_key)`). 값 = `home` / `apm:overview` / `apm:service:<uuid>` — 정본 `home.DashboardKey`.
  - 본체는 `home.DashboardWidgetService(list/create/update/updateLayout/remove/reset)`로 올렸고 `HomeWidgetService`는 `DashboardKey.HOME`+`HomeWidgetCatalog`로 위임한다. 저장 정책은 `home.WidgetCatalog` 인터페이스(`spec(code)`·`seeds(admin)`)가 답한다.
  - 🔴 **카탈로그는 홈과 따로 둔다** — `premium/apm/dashboard/ApmDashboardWidgetType`(enum, 스코프 OVERVIEW/SERVICE) + `ApmDashboardCatalog.OVERVIEW/SERVICE`. 홈 enum에 APM 타입을 섞으면 홈의 카탈로그 고정 테스트·FE 정합 테스트가 깨지고, 프리미엄 코드가 premium 밖으로 나간다(LicenseArchitectureTest A1). 다른 스코프의 코드는 `spec()`이 빈 Optional → `WIDGET_TYPE_INVALID`.
  - 컨트롤러는 `premium/apm/dashboard/ApmDashboardController`(`@RequiresFeature(APM)`, 읽기·쓰기 모두 `apm.view` — 배치는 그 사용자의 취향이지 관리 행위가 아니다). 서비스 대시보드는 uid를 `ApmServiceQueryService.require`로 먼저 확인한다(없는 uid에 배치를 만들면 고아 행이 남는다).
  - 대안(별 테이블 `apm_dashboard_widget`)은 카탈로그·EP·시드 로직이 두 벌이 된다 — 홈에서 이미 겪은 "위젯 추가마다 두 곳" 비용. 컬럼 가산이 낫다.
- 크기 정본은 BE 시드(`ApmDashboardWidgetType`의 defaultWidth/Height)이고 FE 상수(`constants/apmDashboardWidgets.ts`)가 같은 값을 갖는다 — 양쪽 카탈로그 테스트(`ApmDashboardCatalogTest`·`apmDashboardCatalog.test.ts`)가 각각 못박는다.

## 3. APM 위젯 카탈로그(1차)

기존 카드 = 위젯 1:1. `ApmChartCard`는 그대로 위젯 본문이 된다(셸이 제목·⋯ 메뉴를 얹는다).

| 그룹 | 위젯 | 데이터(기존 훅) | 전체 | 서비스 |
|---|---|---|---|---|
| 트래픽 | RED 합계 StatCard(요청/오류율/p95/활성) | `useApmOverviewTotals` / `useApmServiceRed` | ✅ | ✅ |
| 트래픽 | 요청량·오류율·지연 시계열(각 1장) | `useApmSeries` | ✅ | ✅ |
| 트래픽 | 지연 분포 히트맵 | `useApmLatencyHeatmap` | – | ✅ |
| 상태 | 서비스 상태 도넛 · 서비스×시간 오류율 히트맵 | 개요 훅 | ✅ | – |
| 상태 | Apdex 게이지 · 24h 가용성 스트립 · 인스턴스 스트립 | 상세 훅 | – | ✅ |
| 순위 | 느린 서비스 top5 · 오류 많은 서비스 top5 | 개요 훅 | ✅ | – |
| 순위 | 느린 엔드포인트 top5 · 실패 엔드포인트 top5 · 상태코드 분포 · 메서드 분포 | 상세 훅 | – | ✅ |
| 알림 | 최근 알림 · 열린 문제 | `useApmAlerts` | ✅ | ✅(서비스 필터) |
| 배포 | 최근 배포 · 배포 전후 비교 | 배포 훅 | ✅ | ✅ |
| SLO | 예산 게이지 · 번다운 | SLO 훅 | ✅ | ✅ |

기본 시드 = 지금 화면과 같은 배치(행별 동일 높이·오른쪽 빈칸 없이 — RGL vertical compact 규칙).

## 4. 계약 (✅ 2026-09-15 확정 — 정본 `_workspace/features/apm/dashboards/contract_apm-dashboards.md`)

```
# 개요(전체) 대시보드 — key = apm:overview
GET    /apm/dashboards/overview/widgets              → Widget[]   (0건이면 기본 6종 시드, 멱등)
POST   /apm/dashboards/overview/widgets              { widgetType, title?, config?, posX?, posY?, width?, height? }
PATCH  /apm/dashboards/overview/widgets/layout       { layouts: [{ id, x, y, w, h }] }
PATCH  /apm/dashboards/overview/widgets/{id}         { title?, config? }
DELETE /apm/dashboards/overview/widgets/{id}
POST   /apm/dashboards/overview/widgets/reset        → Widget[]

# 서비스 대시보드 — key = apm:service:{uid}  (uid 존재 확인 → 없으면 APM_SERVICE_NOT_FOUND, HTTP 200 + code 404)
GET    /apm/dashboards/services/{uid}/widgets        → Widget[]   (0건이면 기본 11종 시드)
POST   /apm/dashboards/services/{uid}/widgets
PATCH  /apm/dashboards/services/{uid}/widgets/layout
PATCH  /apm/dashboards/services/{uid}/widgets/{id}
DELETE /apm/dashboards/services/{uid}/widgets/{id}
POST   /apm/dashboards/services/{uid}/widgets/reset

Widget = { id, widgetType, title|null, config{}, posX, posY, width, height, pinned }   (홈 위젯 DTO와 동일)
오류: WIDGET_TYPE_INVALID(미지·다른 스코프 코드) · WIDGET_DUPLICATE · WIDGET_NOT_FOUND(404) · 403(apm.view 없음, HTTP 200 + code 403)
```
- 홈의 `/home/widgets*`는 **그대로**다(별칭이 아니라 같은 서비스의 `key=home` 호출). `/dashboards/{key}` 일반 경로는 두지 않았다 — key 문자열을 URL로 받으면 스코프 판정(권한·uid 존재)이 컨트롤러 밖으로 새어 나간다.
- 시간 범위·env·자동 갱신은 대시보드 **툴바**(기존 ApmToolbar)가 갖고 위젯은 Context로 받는다 — 위젯마다 기간을 따로 두지 않는다.
- 서비스 대시보드 첫 진입 시드는 **서비스용 기본 세트**(§3 서비스 열, 상태코드·메서드 분포는 기본 세트 밖).
- 위젯 `config`는 아직 쓰는 위젯이 없다(설정 버튼 없음) — 서버는 jsonb를 그대로 보관하므로 나중에 위젯별 설정을 붙여도 계약은 그대로다.

## 5. 작업 규모(추정)

| 단계 | 내용 | 규모 |
|---|---|---|
| A | 홈 위젯 인프라 일반화(FE `WidgetDashboard`, BE `dashboard_key`·EP 별칭·V58) — 홈 회귀 테스트 통과가 완료 조건 | M |
| B | APM 개요를 위젯 그리드로(위젯 10종 래핑·기본 시드·편집 UX) | M |
| C | 서비스 대시보드 탭(위젯 12종·uid 바인딩·서비스별 저장·기본 시드) | M |
| D | 도움말·i18n·QA(정적+헤드리스)·계약서·설계 정정 | S |

## 6. 결정 필요(사용자)

1. **저장 범위** — 사용자별(홈과 동일, 기본안) vs 조직 공유(관리자가 편집·모두 동일). 공유면 권한 축과 "누가 바꿨나"가 필요해 규모가 커진다.
2. **서비스 대시보드 위치** — 상세의 첫 탭 "개요"를 대시보드로 **대체**(기본안) vs 별도 "대시보드" 탭 추가(개요는 고정 유지).
3. **편집 대상 범위** — 개요·서비스 대시보드 두 곳만(기본안) vs 다른 상세 탭(트랜잭션·런타임…)까지.
