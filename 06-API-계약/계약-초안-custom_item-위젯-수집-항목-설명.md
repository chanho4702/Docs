# 계약 초안 — custom_item 위젯 + 수집 항목 설명

상태: **초안(draft)** · 작성일 2026-06-16 · 관련: `plan_custom-dashboard.md`
적용 대상: BE `moveseye-be`(Nest) + `moveseye-be-spring`(Spring) **양쪽 동일 계약(병행)**, FE `moveseyee_fe`
원칙: API 계약 1:1 보존, 응답은 `ApiResult<T>` 래퍼, 403→HTTP200 등 기존 규칙 유지.

---

## A. 수집 정보 응답에 `description`(+`chartable`) 추가

### A-1. 변경 대상
- 엔드포인트(변경 없음): `GET /api/v1/hosts/{id}/collected-info`
- BE: `host.get`의 `selectItems`에 `'description'` 추가.
- DTO/타입: `CollectedItemDto`(Nest) / `CollectedItemDto`(Spring) / `TCollectedItem`(FE)에 필드 2개 추가.

### A-2. 추가 필드
| 필드 | 타입 | 설명 |
|------|------|------|
| `description` | `string \| null` | Zabbix item 설명. 비어 있으면 null. |
| `chartable` | `boolean` | 차트화 가능 여부. `valueType ∈ {"0","3"}` → true (BE 계산해서 내려줌). |

### A-3. 응답 예시 (items[] 요소)
```json
{
  "itemid": "23296",
  "name": "CPU utilization",
  "key": "system.cpu.util",
  "valueType": "0",
  "status": "0",
  "lastValue": "12.5",
  "units": "%",
  "description": "CPU utilization in percent",
  "chartable": true
}
```

### A-4. BE 구현 메모
- Nest `host.service.ts getCollectedInfo`: `selectItems`에 `'description'` 추가, 매핑에 `description: item.description ?? null`, `chartable: ['0','3'].includes(item.value_type)`.
- Spring `HostService.getCollectedInfo`: `selectItems` 동일 추가, `HostCollectedInfoResDto.CollectedItemDto`에 필드 추가. (record면 컴포넌트 추가)
- 설명 폴백 사전(2순위)은 **확정: 1차 포함, FE `constants`에 정의**(i18n 친화). BE는 `description` 원문만 내려주고 null 허용 — 사전 매핑/폴백은 FE 책임.

---

## B. 신규 — 호스트 항목 history 차트 엔드포인트 (custom_item 데이터원)

### B-1. 엔드포인트
```
GET /api/v1/host/{id}/items/history
```
> 기존 메트릭 차트(`/host/{id}/cpu/line-charts` 등)와 동일 계열. 차이는 key 고정이 아니라 itemid를 클라이언트가 지정.

### B-2. 쿼리 파라미터
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `itemids` | `string` (comma-separated) | ✅ | 선택한 항목 id 목록. 예 `23296,23310` |
| `from` | ISO datetime | ✅ | 조회 시작 |
| `to` | ISO datetime | ✅ | 조회 끝 |

- 직렬화: 기존 `serializerObjParams` 패턴 재사용(FE), BE는 `@Query` 파싱.

### B-3. 응답: `ApiResult<TMonitorChart[]>` (기존 차트 shape 그대로)
```json
[
  {
    "type": "CPU utilization",        // item name (시리즈 라벨)
    "itemid": "23296",
    "units": "%",                      // y축 단위 (추가)
    "data": [
      { "timestamp": "2026-06-16T00:00:00.000Z", "value": "12.5", "itemid": "23296" },
      { "timestamp": "2026-06-16T00:01:00.000Z", "value": "13.0", "itemid": "23296" }
    ]
  }
]
```
- **shape는 기존 `TMonitorChart`와 호환** → FE의 `useChartOption`/`useHandelChartAction`/공통 시각 눈금 그대로 사용. `type`=item name, `units` 필드만 추가(없으면 무시 가능).
- 여러 itemid → 여러 시리즈. 공통 시각 눈금 로직이 시각 정렬 처리.

> **구현 완료(2026-06-16, 양쪽 BE)**: 컨트롤러 경로 `GET /host/{id}/items/history?itemids=&from=&to=`(from/to는 unix epoch, 기존 메트릭 차트와 동일). 시리즈 요소 = `{ type(item name), itemid, units, data }`. `data` 요소는 **FE 소비 기준 `{timestamp, value}`** — Nest는 `DataTimestampDto{timestamp,value}`, Spring은 `HistoryPoint{itemid,timestamp,value}`(cpu 등 기존 메트릭과 동일 패턴, itemid 여분 필드는 FE 무시). 숫자형(value_type 0/3)만 시리즈화, 비차트형 itemid는 제외. 1h 초과 기간은 trend 평균 폴백.

### B-4. 동작 규칙
1. **숫자형만**: 요청에 비차트형 itemid가 섞이면 해당 시리즈는 제외(또는 빈 data). 전부 비차트형이면 `[]`.
2. **history 우선 + trend 폴백**(2026-06-16 변경): 항상 history(원본) 먼저 조회, **비어 있으면** trend(`valueAvg`)로 폴백. (기존 `isMoreThan1Hour` 기간 분기는 "정확히 1시간"이 trend 경계에 걸려 최근 구간이 비는 문제가 있어 제거)
3. **단위 분리(2차 확정)**: 응답 `units`가 2종 이상이면 FE에서 `yAxisIndex` 부여 — 1차는 단위 노출만, 같은 단위끼리 겹치기 권장.
4. 권한: 조회는 인증 사용자 공통(기존 host 컨트롤러 가드 동일).

### B-5. BE 구현 메모
- Nest: `host.controller` + `host.service`에 `getItemsHistory(authToken, id, {itemids, from, to})`. 내부는 `zabbixItemService.get`(value_type/units 확인) → `zabbixHistoryService.getHistoryByItemids`(또는 trend) → `TMonitorChart[]` 매핑. **기존 cpu `getLineChart`를 itemid 직접버전으로 일반화**.
- Spring: `HostController`/`HostService`에 동일 메서드. `ZabbixHistoryService.getHistoryByItemids` 재사용.

---

## C. 커스텀 차트 위젯 저장 (host 스코프, ServerMonitoringDetail 통합) — 초안

방향 전환(2026-06-16): 신규 대시보드 페이지 대신 **기존 호스트 상세 페이지에 host별 커스텀 차트**. 저장=호스트별 공유, 배치=react-grid-layout.

### C-1. 테이블 `dashboard_widget`
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | serial/PK | |
| host_id | varchar | Zabbix hostid — **호스트별 스코프**(공유, user_id 없음) |
| title | varchar | 차트 이름 |
| chart_type | varchar | `line` \| `area` (1차) |
| config | jsonb | `{ "itemIds": ["23296","23310"] }` (custom_item) |
| pos_x, pos_y, width, height | int | react-grid-layout 좌표/크기 |
| created_at, updated_at | timestamptz | |

### C-2. 엔드포인트 (host 하위, Nest+Spring 병행)
```
GET    /api/v1/host/{id}/widgets            # 해당 호스트의 커스텀 위젯 목록(구성+배치)
POST   /api/v1/host/{id}/widgets            # 추가 { title, chartType, config:{itemIds} }
PATCH  /api/v1/host/{id}/widgets/layout     # 레이아웃 일괄 저장 [{ id, x, y, w, h }]
PATCH  /api/v1/host/{id}/widgets/{widgetId} # 제목/구성 수정
DELETE /api/v1/host/{id}/widgets/{widgetId} # 삭제
```
- 위젯 **데이터**는 §B(`/host/{id}/items/history`)를 `config.itemIds`로 직접 호출(위젯 메타와 데이터 분리).
- 응답: `ApiResult<T>` 래퍼, 위젯 DTO `{ id, title, chartType, config, posX, posY, width, height }`.

### C-3. 마이그레이션 전략 (두 BE가 같은 dev DB 공유)
- **Nest = dev DB DDL 정본**: `src/database/migrations/{ts}-CreateDashboardWidget.ts` 추가 → `migrationsRun:true`라 **Nest 부팅 시 자동 적용**.
- **Spring = 엔티티 매핑만**(`ddl-auto none`) + **Flyway `V2__dashboard_widget.sql`**(빈DB/Spring단독 운영 대비, dev에선 Flyway disabled라 미적용). `CREATE TABLE IF NOT EXISTS`로 Nest 선적용과 충돌 회피.
- ⚠️ dev DB 변경은 **Nest 기동 시점**에 발생 — 적용 타이밍을 사용자와 합의.

### C-4. 확정 + 구현 완료 (2026-06-16, 양쪽 BE)
- **편집 권한 = 인증 사용자 누구나** (관리자 가드 없음, 기존 host 가드 JwtAuthGuard/VisitorIdCheck만).
- **마이그레이션 = 코드만 작성, dev DB 미적용**(사용자가 나중에 Nest 기동 자동적용 or 수동).
- **구현 완료**: Nest `host/widgets/`(엔티티 `dashboard-widget.entity.ts`, 마이그레이션 `1781000000000-CreateDashboardWidget.ts`, module/controller/service/dto) + Spring `host/widgets/`(엔티티 `domain/DashboardWidget.java`+`WidgetConfig`, repository, service, controller, dto `WidgetDtos`, Flyway `V2__dashboard_widget.sql`). 둘 다 컴파일 통과.
- chart_type은 varchar('line'/'area') — Spring은 String으로 둬 값 1:1 보존(enum name 대문자화 회피).

---

## 확정 사항 (2026-06-16)
1. **설명 = Zabbix description + 핵심 키 사전** — 폴백 순서 ① Zabbix `description` → ② 핵심 키 사전(흔한 키 10~20개, **FE `constants`에 정의**, i18n 키로) → ③ `name`/`key` 원문. BE는 `description` 원문만 내려주고, **사전 매핑은 FE에서 적용**.
2. **위젯 데이터 경로 = §B 전용 엔드포인트 직호출** — FE가 `GET /host/{id}/items/history`를 직접 호출. 범용 `/widgets/{id}/data`는 채택하지 않음(1차). 위젯은 `config.itemIds`를 읽어 이 엔드포인트로 조회.
3. **다중 y축 = 2차로 미룸** — 1차는 `units` 노출만, 같은 단위끼리 겹치기 권장. `yAxisIndex` 자동 분리는 2차.
