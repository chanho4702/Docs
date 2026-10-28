# 커스텀 대시보드 — 1차 요구사항 분석 & 기획

작성일: 2026-06-16
참고 구현: `C:\CloudJira\moves-workforce\static\ui\src\pages\projectDetail\dashboard`
대상: moveseye (FE: `moveseyee_fe`, BE: `moveseye-be`(Nest) + `moveseye-be-spring`(Spring) 병행)

---

## 1. 참고 대시보드에서 확인한 검증된 패턴 (그대로 차용할 골격)

| 요소 | moves-workforce 구현 | 차용 여부 |
|------|----------------------|-----------|
| 레이아웃 | `react-grid-layout` 12컬럼 그리드, edit 모드에서 드래그/리사이즈 | ✅ 차용 |
| 위젯 모델 | `{ id, pos_x, pos_y, width, height, data_type, chart_type, title }` DB 영속화 | ✅ 차용 |
| 차트 추가 | 모달: **템플릿(추천 묶음)** vs **커스텀(dataType 선택 → 허용 chartType만 노출)** | ✅ 차용 |
| dataType↔chartType 제약 | dataType마다 `allowedCharts` 화이트리스트 | ✅ 차용 |
| 위젯별 데이터 | `getChartDataById(data_type, chart_type, 필터)` 단건 호출 + 차트유형별 옵션 빌더 | ✅ 차용(구조) |
| 위젯별 필터 | chartType별 날짜범위/대상 선택, 차트↔테이블 뷰 토글 | ✅ 차용 |
| 요약 패널 | 상단 고정(static) KPI 타일 | ✅ 차용(선택) |
| 편집 흐름 | edit 토글 → 추가/삭제/리네임/이동/리사이즈 → "완료" 시 레이아웃 일괄 저장 | ✅ 차용 |

**핵심 통찰:** 위젯은 `(데이터 유형 × 차트 유형 × 필터)`의 조합으로 정의되고, 배치(위치/크기)는 별도로 영속화된다. 이 분리가 "자유롭게 구성 가능한 대시보드"의 본질이다.

---

## 2. moveseye 맥락의 1차 요구사항 (FR)

- **FR-1 대시보드 캔버스**: 12컬럼 그리드, 위젯 드래그 이동 + 리사이즈. 편집 모드 On/Off.
- **FR-2 위젯 추가**: "위젯 추가" 모달에서 ① 데이터 유형 선택 → ② (허용된) 차트 유형 선택 → ③ 이름 입력 → 추가.
- **FR-3 위젯 필터**: 위젯마다 기간(period) 등 필터를 개별 적용. (전역 필터는 향후)
- **FR-4 위젯 관리**: 이름 변경, 삭제, 수동 새로고침.
- **FR-5 레이아웃 영속화**: 사용자별로 위젯 구성·배치를 저장/복원 (BE + DB).
- **FR-6 데이터 표출**: 위젯 유형에 맞는 ECharts 렌더 + (선택) 테이블 뷰 토글.
- **FR-7 템플릿(선택, 2차)**: 추천 위젯 묶음 원클릭 추가.

**비기능/제약**
- 기존 차트 자산(`DmoveChart`, `useChartOption`, ECharts, `host-monitoring.api`) 최대 재사용.
- 권한: `PageWrapper` + `DmovePermissionsKey`로 보호 (FE 규약).
- BE는 Nest·Spring **양쪽 동일 계약**으로 신설 (병행 규칙 대상 — 새 기능).
- i18n(en/kr), AntD 래퍼 컴포넌트 규약 준수.

---

## 3. 핵심 설계 결정 — moveseye 데이터/차트 매핑

moves-workforce는 "조직/공수" 데이터였지만 moveseye는 **Zabbix 인프라 모니터링**이다. 데이터 유형을 두 갈래로 나눈다:

### (A) 시계열형 — 특정 호스트의 메트릭 추이
- CPU 사용률, 메모리 사용률, 디스크 사용률/IO, 네트워크 BPS/PPS, 응답시간
- 차트: **line / area** (이미 구현된 `useCpuChart` 등 재사용)
- 필터: 기간(period), 대상 호스트
- ⚠️ 제약: "특정 호스트"가 있어야 의미가 있음 → 위젯에 `hostId`(또는 itemKey) 바인딩 필요.

### (B) 집계형 — 여러 호스트를 가로지르는 현황 통계
- 이벤트 심각도 분포(문제 severity별 count), 호스트그룹별 가용성/문제 수, 호스트 상태(up/down), 최근 이벤트 추이
- 차트: **pie / bar / line(시간추이) / 숫자 KPI**
- 필터: 기간, 호스트그룹, 심각도
- 장점: 대시보드의 "전체 조망" 성격에 자연스럽게 맞음.

> **권장 1차 범위:** 집계형(B) 위주 + 시계열(A) 일부. (B)가 커스텀 대시보드의 "한눈에 보기" 목적에 더 부합하고, 호스트 바인딩 복잡도를 낮춘다. (A)는 호스트 지정 UX가 추가로 필요.

### dataType ↔ allowedCharts (초안)
| dataType | 설명 | allowedCharts | 데이터 출처 |
|----------|------|---------------|-------------|
| `event_severity` | 문제 심각도별 분포 | pie, bar | event/problems 집계 |
| `event_trend` | 기간별 이벤트 발생 추이 | line, bar | event 동기화 데이터 |
| `hostgroup_status` | 호스트그룹별 가용/문제 | bar, pie | hosts/hostgroups |
| `host_availability` | 호스트 up/down 비율 | pie, KPI | host.get |
| `cpu_usage` (A) | 호스트 CPU 추이 | line, area | host/{id}/cpu/line-charts |
| `memory_usage` (A) | 호스트 메모리 추이 | line, area | host/{id}/memory/line-charts |
| `custom_item` (A) | **사용자가 고른 임의 Zabbix 수집 항목** 추이 | line, area | host/{id}/items/history (신규) |

### 3-1. `custom_item` 위젯 (사용자 선택형 시계열) — 시계열형(A)의 일반화
고정 메트릭(CPU/메모리…) 대신, 호스트의 **수집 정보(collected-info)에서 항목을 직접 골라** 차트화한다.

- **위젯 생성 플로우**: 호스트 선택 → (연결된 템플릿으로 항목 필터) → **수집 항목 선택(복수)** → 차트 유형(line/area) → 기간.
- **데이터 출처**: 선택한 `itemid[]`의 `history.get`(장기간은 `trend.get` 폴백) → `TMonitorChart[]` shape → 기존 차트 파이프라인 + 공통 시각 눈금(시각 정렬 수정본) 그대로 재사용.
- **위젯 config(jsonb)**: `{ hostId, itemIds[], chartType, period }`.

#### 제약 (필수 처리)
1. **숫자형 항목만 차트 가능** — `valueType`이 `0`(float)/`3`(unsigned)인 항목만. `1/2/4`(char/log/text)는 선택 UI에서 비활성. → 계약에 `chartable` 플래그 제공.
2. **history 보존기간** — 기간이 길면 history가 없으므로 `trend` 폴백(기존 `isMoreThan1Hour` 분기 패턴 재사용).
3. **단위 혼합** — 단위 다른 항목을 한 차트에 겹치면 y축 분리(`yAxisIndex`) 또는 같은 단위끼리만.

### 3-2. 항목 설명(description) 노출 — "이 항목이 무슨 데이터인가"
현재 `getCollectedInfo`의 `selectItems`에 `description`이 빠져 있다. Zabbix item에는 `description`이 표준 필드로 존재하므로 **`selectItems`에 `'description'` 한 줄 추가 + DTO/타입에 필드 추가**로 노출 가능.
- ⚠️ Zabbix `description`은 관리자가 수동 작성하는 필드라 **비어 있는 경우가 많다**. 폴백(확정, 사전은 FE constants):
  1순위 Zabbix `description` → 2순위 **key 기반 설명 사전**(예: `system.cpu.util`→"CPU 사용률(%)", `vm.memory.size`→"메모리 크기") → 3순위 `name`/`key` 원문.
- ⚠️ description에 Zabbix 매크로(`{$MACRO}`)가 포함될 수 있음(1차는 원문 노출).

---

## 4. 아키텍처 기획

### FE 컴포넌트 트리 (`src/pages/dashboards/custom/`)
```
CustomDashboardPage.tsx      # 그리드 + edit 토글 + 저장/추가, react-grid-layout
├─ DashboardToolbar          # 편집/추가 버튼, (전역 기간 필터 — 2차)
├─ WidgetCard                # 카드 셸: 제목/리네임/삭제/새로고침/뷰토글 (DmoveChart 헤더 재활용)
│   └─ WidgetRenderer        # dataType×chartType → 옵션 빌더 매핑 (ChartTemplate 대응)
│       ├─ useWidgetData     # getWidgetData(dataType, chartType, filter) 훅
│       └─ <DmoveChart>      # 기존 차트 컴포넌트 재사용
├─ AddWidgetModal           # 템플릿/커스텀 2모드 (AddChartModal 대응)
└─ SummaryPanel (선택)      # 상단 KPI 타일
```
- 상태: 레이아웃은 로컬 → "완료" 시 일괄 PATCH. 위젯 데이터는 React Query(`useDmoveQuery`).
- 차트 옵션 빌더 맵: `{ pie: pieOption, bar: barOption, line: lineOption, area: areaOption }` (`src/utils` 또는 `hooks/chart`).

### BE 엔드포인트 (Nest + Spring 동일 계약)
```
GET    /api/v1/dashboards/widgets            # 내 위젯 목록(구성+배치)
POST   /api/v1/dashboards/widgets            # 위젯 추가 {dataType, chartType, title, pos...}
PATCH  /api/v1/dashboards/widgets/layout     # 레이아웃 일괄 저장 [{id,x,y,w,h}]
PATCH  /api/v1/dashboards/widgets/{id}       # 제목 수정
DELETE /api/v1/dashboards/widgets/{id}       # 위젯 삭제
GET    /api/v1/dashboards/widgets/{id}/data  # 위젯 데이터 조회 (dataType별 분기 + 필터 쿼리)
```
- `widgets/{id}/data`는 dataType에 따라 기존 host/event 서비스에 위임(신규 집계는 추가 구현).
- 응답은 `ApiResult<T>` 래퍼 + `@ApiProperty` DTO. 403→200 등 기존 계약 규칙 유지.

### DB 스키마 (신규 엔티티 `dashboard_widget`)
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid/serial | PK |
| user_id | fk → user | 소유자(개인 대시보드 시) |
| title | varchar | 위젯 이름 |
| data_type | varchar/enum | event_severity 등 |
| chart_type | varchar/enum | pie/bar/line/area |
| config | jsonb | 위젯별 필터/대상(hostId, groupId, severity 등) |
| pos_x, pos_y, width, height | int | 그리드 배치 |
| created_at, updated_at | timestamptz | |
- Nest: TypeORM 엔티티 + 마이그레이션(V… Flyway는 Spring). Spring: JPA 엔티티 + Flyway `V2__dashboard_widget.sql`.
- ⚠️ 병행: 두 BE가 **같은 테이블**을 바라보므로 스키마 1벌, 마이그레이션은 각 레포 방식으로.

---

## 5. 기존 자산 재사용 포인트
- **차트 렌더/내보내기/표뷰**: `DmoveChart`, `useChartActions`, `getDataSourceChart` 그대로.
- **시계열 위젯**: `useCpuChart`/`useMemoryChart`/… + 방금 고친 공통 시각 눈금 로직 그대로 사용.
- **데이터 페칭**: `useDmoveQuery`, `host-monitoring.api`, 이벤트 API.
- **기간 필터**: `usePeriodTimes`, `RangeDatePicker`.
- **권한/라우팅**: `PageWrapper`, `DmovePermissionsKey`, `routes.tsx`, `SideNav`.

---

## 6. 1차(MVP) 범위 제안 vs 향후
**1차(MVP)**
- 그리드 + 드래그/리사이즈 + 편집모드 + 레이아웃 저장(BE/DB).
- 위젯 추가(커스텀 모드만), 삭제, 리네임, 새로고침.
- dataType 3~4종(집계형 우선: event_severity, event_trend, hostgroup_status, host_availability).
- 차트 유형: pie / bar / line.
- BE Nest+Spring 병행 + DB 엔티티.

**향후(2차+)**
- 템플릿(추천 묶음), 시계열형(A) 호스트 바인딩, 전역 필터, 테이블 뷰 토글, 공유 대시보드/역할별, 대시보드 복수 개(탭), 자동 새로고침 주기 설정.

---

## 7. 구현 로드맵 (fullstack-feature 파이프라인)
1. **결정 확정**(아래 §8) → 계약 `features/home/custom-dashboard/contract_custom-dashboard.md` 작성.
2. **BE(병행)**: `dashboard_widget` 엔티티/마이그레이션 + CRUD/layout/data 엔드포인트 — Nest 먼저, Spring 1:1.
3. **api-contract-sync**: 위젯 DTO/응답 shape FE 관점 정리.
4. **FE**: 그리드 페이지 → WidgetCard/Renderer → AddWidgetModal → 옵션 빌더 → 라우트/메뉴/i18n/권한.
5. **integration-qa**: dataType별 응답 shape ↔ FE 옵션 빌더 대조, 레이아웃 저장 왕복 검증.

---

## 8. 결정 확정 (2026-06-16)
1. **소유 범위 = 공유(전사/역할 공통)** → DB에 `user_id` 없음, 전역 1벌. **편집(추가/삭제/배치/리네임)은 관리자 권한만**(Nest `@UseGuards(RolesGuard)`+`@Roles`, Spring `@RolesGuarded`+`@Roles`). 일반 사용자는 조회 전용.
2. **위젯 데이터 = 집계형 우선** → 1차 dataType: `event_severity`, `event_trend`, `hostgroup_status`, `host_availability`. 시계열(호스트 바인딩)은 2차.
3. **레이아웃 = react-grid-layout 채택** (moveseyee_fe에 신규 의존성 추가).
4. **요약 KPI 패널 = 제외** (2차). 1차는 위젯 그리드만.

### 확정 반영 사항
- DB `dashboard_widget`에서 `user_id` 컬럼 제거(공유 전역). 나머지 스키마 동일.
- 편집 엔드포인트(POST/PATCH/DELETE)는 관리자 권한 가드. 조회(GET)는 인증 사용자 공통.
- ⚠️ Spring 권한: 원본 Nest 컨트롤러에 `RolesGuard`가 걸리면 Spring은 `@RolesGuarded` 마커를 반드시 함께 붙일 것(메모리 교훈 — 안 붙이면 @Roles 무시됨).
