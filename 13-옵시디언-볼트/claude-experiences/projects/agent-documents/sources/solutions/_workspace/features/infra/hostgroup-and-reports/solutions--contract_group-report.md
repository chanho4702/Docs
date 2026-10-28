# API 계약 — 호스트 그룹 주별/월별 리포트 (group-report)

작성: be-engineer / 2026-06-22
대상: fe-engineer, integration-qa, functional-qa
구현: NestJS(`moveseye-be`) + Spring(`moveseye-be-spring`) **양쪽 1:1 동일 계약**

---

## 0. 공통 사항

- **인증**: Bearer JWT + 헤더 `x-visitor-id` 필수 (host 컨트롤러 공통 가드).
  - 권한 거부 → 기존 거동 보존: 대부분 **HTTP 200 + body `code`**, 401만 실제 상태코드.
- **응답 envelope**: 표준 `ApiResult<T>`.
  ```json
  { "status": "success", "code": 200, "errorCode": null, "message": null, "data": <T> }
  ```
- ⚠️ **FE 언랩 깊이**: axios 인터셉터 + `useDmoveQuery`가 응답을 **2겹 언랩**한다.
  즉 훅 소비자는 위 `data`(= `T`)를 **직접** 수신한다 (`response.data.data`처럼 추가 언랩 금지).
  → 아래 "응답 data" 섹션의 shape가 곧 FE가 손에 쥐는 값이다.
- **날짜 표기**: `periodStart`/`periodEnd`는 `YYYY-MM-DD` 문자열(UTC 기준). 시각 성분 없음.
- **resource/alerts 노출 방식**: DB jsonb 구조를 **중첩 객체 그대로** 노출(변형/평탄화 없음).

---

## 1. GET /hosts/{groupid}/reports — 리포트 목록

최근 N개 **마감된** 기간의 리포트를 **최신순(내림차순)** 으로 반환.
조회 시 해당 기간 스냅샷이 DB에 없으면 그 자리에서 계산·저장(**lazy 백필**)한다.
아직 진행 중(미마감)인 현재 기간은 **목록에서 제외**된다.

### 요청
| 위치 | 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|---|
| path | `groupid` | string | ✅ | Zabbix host group id |
| query | `periodType` | `"WEEK" \| "MONTH"` | ✅ | 기간 단위 |
| query | `limit` | number(int) | ❌ | 반환 개수. 미지정 시 **WEEK=8, MONTH=6**. 범위 1~52 |

> ⚠️ `periodType`은 대문자. WEEK=ISO주(월~일), MONTH=달력월.

### 응답 data: `GroupReportResDto[]`
배열. 각 원소 = 아래 "리포트 객체 shape".

---

## 2. GET /hosts/{groupid}/reports/detail — 리포트 상세

단일 기간 리포트. 저장본 없고 기간이 마감됐으면 백필 후 반환.
**미마감 기간을 요청하면 에러**(`REPORT_PERIOD_NOT_CLOSED`).

### 요청
| 위치 | 이름 | 타입 | 필수 | 설명 |
|---|---|---|---|---|
| path | `groupid` | string | ✅ | Zabbix host group id |
| query | `periodType` | `"WEEK" \| "MONTH"` | ✅ | 기간 단위 |
| query | `periodStart` | string `YYYY-MM-DD` | ✅ | 기간 시작일. WEEK=월요일, MONTH=1일 |

### 응답 data: `GroupReportResDto` (단일 객체)

> 목록·상세 **동일 shape**를 반환한다(목록도 resource/alerts 전체 포함). FE는 타입 1개만 정의하면 됨.

---

## 3. 리포트 객체 shape — `GroupReportResDto`

```jsonc
{
  "periodType": "WEEK",            // "WEEK" | "MONTH"
  "periodStart": "2026-06-08",     // string YYYY-MM-DD (UTC). WEEK=월요일/MONTH=1일
  "periodEnd": "2026-06-14",       // string YYYY-MM-DD (UTC, 포함되는 마지막 날)
  "hostCount": 12,                 // number(int) — 집계 시점 그룹 호스트 수
  "resource": { /* ReportResource */ },
  "alerts":   { /* ReportAlerts   */ }
}
```

### 3.1 `resource` — 자원 사용률 요약
metric별 기간 전체 요약. **해당 metric을 수집하는 item이 그룹에 하나도 없으면 그 metric은 `null`**.

```jsonc
{
  "cpu":     { "avg": 42.31, "max": 88.0, "min": 5.12 },  // ReportMetricSummary | null
  "memory":  { "avg": 60.5,  "max": 91.2, "min": 30.0 },  // | null
  "disk":    { "avg": 55.0,  "max": 70.0, "min": 40.0 },  // | null
  "traffic": null                                          // 수집 item 없음 → null
}
```
- 4개 키(`cpu`/`memory`/`disk`/`traffic`)는 **항상 존재**, 값이 `ReportMetricSummary` 또는 `null`.
- `ReportMetricSummary`: `{ avg: number, max: number, min: number }` (소수 2자리 반올림).
  - 단위는 Zabbix item 원값(예: CPU/메모리/디스크는 % 사용률, traffic은 bytes 계열).
  - **그룹 집계 정책**: traffic = 호스트 **합산**, 그 외 = 호스트 **평균**. max/min은 그룹 내 호스트들의 최대/최소.

### 3.2 `alerts` — 알람/이벤트 통계
기간 내 **생성 이벤트**(trigger PROBLEM)를 severity별로 집계.

```jsonc
{
  "totals": {              // ReportAlertTotals — 키 6개 항상 존재, number(>=0)
    "notClassified": 0,    // severity 0
    "information":   3,    // severity 1
    "warning":       12,   // severity 2
    "average":       4,    // severity 3
    "high":          1,    // severity 4
    "disaster":      0     // severity 5
  },
  "topHosts": [            // ReportTopHost[] — 알람 많은 순 내림차순, 최대 10개. 없으면 []
    { "hostName": "web-prod-01", "count": 9 },
    { "hostName": "db-01",       "count": 4 }
  ]
}
```

---

## 4. 상태코드 / 에러

| 상황 | HTTP | body |
|---|---|---|
| 정상 | 200 | `status:"success"`, `data` |
| 인증 실패 | 401 | `status:"error"`, `code:401` |
| 권한 거부 | **200** | `status:"error"`, `code:403`, `errorCode` (기존 거동 보존) |
| 상세 조회한 기간이 미마감(아직 진행 중) | **200** | `status:"error"`, `errorCode:"REPORT_PERIOD_NOT_CLOSED"` |

> ⚠️ FE: 상세에서 "미마감 기간"은 에러로 내려온다. 목록(`/reports`)은 미마감 기간을 **조용히 제외**(에러 아님).
> 일반적으로 FE는 목록에서 받은 `periodStart`로만 상세를 호출하므로 이 에러는 정상 흐름에선 거의 발생하지 않는다.

---

## 5. FE 타입 제안 (TypeScript)

```ts
export type ReportPeriodType = 'WEEK' | 'MONTH';

export interface ReportMetricSummary { avg: number; max: number; min: number; }

export interface ReportResource {
  cpu: ReportMetricSummary | null;
  memory: ReportMetricSummary | null;
  disk: ReportMetricSummary | null;
  traffic: ReportMetricSummary | null;
}

export interface ReportAlertTotals {
  notClassified: number; information: number; warning: number;
  average: number; high: number; disaster: number;
}
export interface ReportTopHost { hostName: string; count: number; }
export interface ReportAlerts { totals: ReportAlertTotals; topHosts: ReportTopHost[]; }

export interface GroupReport {
  periodType: ReportPeriodType;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  hostCount: number;
  resource: ReportResource;
  alerts: ReportAlerts;
}

// GET /hosts/:groupid/reports        → GroupReport[]
// GET /hosts/:groupid/reports/detail → GroupReport
```

쿼리 파라미터:
```ts
// 목록
{ periodType: ReportPeriodType; limit?: number }
// 상세
{ periodType: ReportPeriodType; periodStart: string /* YYYY-MM-DD */ }
```

---

## 6. 구현/운영 메모 (FE 직접 영향 없음, 참고)

- 스냅샷 테이블 `host_group_report` (jsonb resource/alerts). UNIQUE(group_id, period_type, period_start).
- 배치: 매주 월 03:00(UTC) 지난 주, 매월 1일 03:30(UTC) 지난 달 → 전 그룹 upsert.
  배치는 Zabbix Super Admin 토큰(Redis `ZABBIX::Super_Admin`) 사용.
- 배치 미수행 그룹/기간도 **조회 시 lazy 백필**되므로 FE는 배치 타이밍과 무관하게 과거 데이터를 받는다.
- 첫 조회(백필) 시 Zabbix 집계로 응답이 다소 느릴 수 있음(이후 조회는 DB 즉시). 로딩 UX 권장.
- Nest/Spring 응답 직렬화 동일: `periodType`은 문자열, 날짜는 `YYYY-MM-DD`, jsonb는 중첩 객체 그대로.
```
