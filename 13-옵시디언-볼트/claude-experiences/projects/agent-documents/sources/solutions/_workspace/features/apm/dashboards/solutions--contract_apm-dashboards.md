# 계약 — APM 대시보드 위젯 배치 (ZM-122, 2026-09-15)

설계 정본: `_workspace/features/apm/dashboards/devdesign_apm-dashboards.md`. 홈 위젯 계약(`features/home/home-widgets/contract_home-widgets.md`)과 **같은 DTO·같은 규칙**이다 — 다른 것은 경로·스코프·권한 축뿐이다.

## 1. 경로

| 스코프 | dashboard_key | 경로 접두 |
|---|---|---|
| 개요(전체) 대시보드 | `apm:overview` | `/apm/dashboards/overview/widgets` |
| 서비스 대시보드 | `apm:service:<uuid>` | `/apm/dashboards/services/{uid}/widgets` |

| 메서드 | 경로(접두 뒤) | 본문 | 응답 `data` |
|---|---|---|---|
| GET | `` | — | `Widget[]` — 0건이면 **기본 세트를 시드한 뒤** 반환(멱등). 정렬 posY, posX, id |
| POST | `` | `{ widgetType, title?, config?, posX?, posY?, width?, height? }` | `Widget` — 좌표·크기를 생략하면 카탈로그 기본 크기로 최하단 |
| PATCH | `/layout` | `{ layouts: [{ id, x, y, w, h }] }` | null — 내 것이 아닌 id는 그 항목만 무시 |
| PATCH | `/{widgetId}` | `{ title?, config? }` | `Widget` — 부분 수정, `title:""`는 기본 제목으로 되돌림 |
| DELETE | `/{widgetId}` | — | null |
| POST | `/reset` | — | `Widget[]` — 전부 삭제 후 기본 세트 재시드 |

`Widget = { id:number, widgetType:string, title:string|null, config:object, posX, posY, width, height, pinned:boolean }`

## 2. 권한·오류 (HTTP는 전부 200, body `code`로 구분)

| 상황 | code | errorCode |
|---|---|---|
| `apm.view` 없음(비관리자·권한 미부여) | 403 | — (컨트롤러 첫 줄, 서비스 미호출) |
| 라이선스에 APM 없음 | `@RequiresFeature(APM)` 규약(503) | — |
| 서비스 uid 없음(서비스 대시보드 전 EP) | 404 | `APM_SERVICE_NOT_FOUND` — 저장소 무접촉(고아 배치 금지) |
| 미지 코드·**다른 스코프 코드**(개요에 `apm_svc_*`) | 400 | `WIDGET_TYPE_INVALID` |
| 같은 대시보드에 이미 있는 타입 | 400 | `WIDGET_DUPLICATE` (전 타입 unique) |
| 내 위젯이 아닌 id(수정·삭제) | 404 | `WIDGET_NOT_FOUND` |

🔴 **쓰기도 `apm.view`다.** 배치는 그 사용자의 취향이지 다른 사용자에게 보이는 것을 바꾸는 행위가 아니다 — `apm.edit`은 서비스 등록·알람 규칙에만 요구한다.

## 3. 카탈로그 (정본 BE `ApmDashboardWidgetType`, FE `constants/apmDashboardWidgets.ts`)

### 개요 — 기본 세트 6종 전부

| code | 기본 w×h | 좌표(x,y) | 내용 |
|---|---|---|---|
| `apm_ov_traffic_totals` | 12×5 | 0,0 | 요청/s·오류율·p95·활성 StatCard 4장 |
| `apm_ov_status_donut` | 4×9 | 0,5 | 상태 도넛 |
| `apm_ov_error_heatmap` | 8×9 | 4,5 | 서비스×시간 오류율 히트맵 |
| `apm_ov_slow_services` | 4×8 | 0,14 | 느린 서비스 Top5 |
| `apm_ov_error_services` | 4×8 | 4,14 | 오류 서비스 Top5 |
| `apm_ov_recent_alerts` | 4×8 | 8,14 | 최근 알람 |

### 서비스 — 기본 세트 11종 + 기본 밖 2종

| code | 기본 w×h | 좌표 | 시드 |
|---|---|---|---|
| `apm_svc_red_totals` | 12×5 | 0,0 | ✅ |
| `apm_svc_requests` / `apm_svc_errors` | 6×9 | 0,5 / 6,5 | ✅ |
| `apm_svc_latency` / `apm_svc_latency_heatmap` | 6×10 | 0,14 / 6,14 | ✅ |
| `apm_svc_apdex` / `apm_svc_active_requests` | 3×8 / 9×8 | 0,24 / 3,24 | ✅ |
| `apm_svc_availability` | 12×6 | 0,32 | ✅ |
| `apm_svc_slow_endpoints` / `apm_svc_failing_endpoints` | 6×9 | 0,38 / 6,38 | ✅ |
| `apm_svc_instances` | 12×6 | 0,47 | ✅ |
| `apm_svc_status_codes` / `apm_svc_methods` | 6×8 | — | ❌ (트랜잭션 탭에 있음, 원하는 사람만) |

전 타입 `unique=true`·`pinned=false`·`adminOnly=false`·설정 항목 없음.

## 4. FE 소비

- 훅 `hooks/useApmDashboard.ts` — `useApmOverviewDashboard()` / `useApmServiceDashboard(uid)` (공용 `useDashboardWidgets`). 쿼리 키 `APM_QUERY_KEYS.DASHBOARD_OVERVIEW` / `DASHBOARD_SERVICE + uid`.
- 화면: 개요 `pages/application-monitoring/overview/ApmOverviewPage.tsx` → `ApmDashboardPanel` + `overview/widgets/registry.tsx`; 서비스 상세 개요 탭 `services/detail/tabs/ApmServiceOverviewTab.tsx` → `detail/widgets/registry.tsx`.
- 편집 UX = 홈과 동일(편집 토글 → 드래그·리사이즈, 위젯 추가 모달, 오버레이의 이름변경·삭제, 기본으로 되돌리기). 편집 중에는 카드 안 링크·토글 클릭이 막힌다.

## 5. DB

`V58__home_widget_dashboard_key.sql` — `home_widget.dashboard_key varchar(64) NOT NULL DEFAULT 'home'` + 인덱스 `(user_id, dashboard_key)`. 기존 행은 전부 `home`.

## 6. 검증

- BE: `ApmDashboardCatalogTest`(9) · `ApmDashboardApiMvcTest`(10) · `HomeWidgetServiceTest`(17) · `HomeWidgetCatalogTest`(7) · `HomeServiceTest`(7) · `LicenseArchitectureTest`(7) — 격리 워크트리 green.
- FE: `apmDashboardCatalog.test.ts`(7) · `ApmOverviewPage.test.tsx` · `ApmServiceDetailPage.test.tsx` · `apmRoutes.test.tsx` · 홈 위젯 스위트 8종(72) — tsc·eslint green.
