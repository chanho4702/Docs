# QA — 호스트 그룹 주별/월별 리포트 (group-report) 경계면 정합성

검증자: integration-qa / 2026-06-22
방식: 정적 shape 교차 대조 (앱 미기동) + FE `tsc --noEmit`
진실원천: `_workspace/contract_group-report.md`

## 종합 판정: **PASS (불일치 0건)**

계약 ↔ Nest ↔ Spring ↔ FE(타입/api/hook/컴포넌트)의 경계면이 모두 일치한다.
FE `npx tsc --noEmit` 전체 에러 0건. 차단성/경미 불일치 모두 없음. 참고용 관찰 2건만 기록.

---

## 1. 엔드포인트 경로/메서드/쿼리파라미터 — PASS

| 항목 | 계약 | Nest | Spring | FE api |
|---|---|---|---|---|
| 목록 | `GET /hosts/{groupid}/reports` | `@Get(':groupid/reports')` (host.controller.ts:392) | `@GetMapping("/{groupid}/reports")` (HostController.java:211) | `API.get(\`${hostsUrl}/${groupId}/reports\`)` (host-monitoring.api.ts:310) |
| 상세 | `GET /hosts/{groupid}/reports/detail` | `@Get(':groupid/reports/detail')` (host.controller.ts:414) | `@GetMapping("/{groupid}/reports/detail")` (HostController.java:222) | `.../reports/detail` (host-monitoring.api.ts:325) |
| 메서드 | GET | GET | GET | GET |
| 쿼리키 | `periodType`, `limit` / `periodType`, `periodStart` | DTO 필드 동일 | DTO 필드 동일 | `params: { periodType, limit }` / `{ periodType, periodStart }` (api.ts:312/327) |

- `hostsUrl = "hosts"` → 베이스 path 일치 (Nest/Spring 컨트롤러 `hosts` prefix와 정합).
- `periodType` 대문자: FE `REPORT_PERIOD_TYPE = { WEEK:"WEEK", MONTH:"MONTH" }` (options.ts:84) → 계약/BE enum 일치.
- `periodStart` `YYYY-MM-DD`: FE 타입/주석 일치. BE는 `period_start` date 컬럼 `.toString()`(Spring) / date 직렬화(Nest)로 `YYYY-MM-DD` 노출.
- `limit` 옵셔널 + 기본값 WEEK=8/MONTH=6: FE `REPORT_LIST_LIMIT`(options.ts:90) 일치, hook이 periodType별로 명시 전송(useGroupReport.ts:25). 범위 1~52 검증은 Nest DTO `@Min(1)@Max(52)`만 존재 — FE는 고정 8/6만 전송하므로 위반 불가(무해).

## 2. 응답 shape 대조 — PASS

### 리포트 객체 (목록 원소 = 상세, 동일 shape)
| 필드 | 계약 | Nest DTO | Spring DTO | FE `TGroupReport` |
|---|---|---|---|---|
| periodType | `"WEEK"\|"MONTH"` | `ReportPeriodType` (enum) | `ReportPeriodType` | `TReportPeriodType` ✅ |
| periodStart | string YYYY-MM-DD | string | String | string ✅ |
| periodEnd | string YYYY-MM-DD | string | String | string ✅ |
| hostCount | number(int) | number | int | number ✅ |
| resource | ReportResource | ReportResource | HostGroupReportJson.Resource | TReportResource ✅ |
| alerts | ReportAlerts | ReportAlerts | HostGroupReportJson.Alerts | TReportAlerts ✅ |

### resource (4키 항상 존재, 각 `Summary | null`)
- Nest `ReportResource`: cpu/memory/disk/traffic 4키, 각 `ReportMetricSummary | null` (entity.ts:33-45).
- Spring `Resource` record: `(MetricSummary cpu, memory, disk, traffic)` + `@JsonInclude(ALWAYS)` (HostGroupReportJson.java:21) → null이어도 키 누락 없이 직렬화. **계약의 "4키 항상 존재"를 Spring이 명시 보장.**
- FE `TReportResource`: 4키 각 `TReportMetricSummary | null` (host-monitoring.ts:391). ✅
- **null 가드**: `HostGroupReportResource.tsx` `summary: resource ? resource[metric] : null` + `renderValue`가 `!!record.summary`/`value !== null` 가드 후 no_data 표기 (33-71). Excel export(HostGroupReport.tsx:82)도 `summary ?` 분기. ✅
- `ReportMetricSummary { avg, max, min: number }` 순서/타입: Nest(class) ↔ Spring record `(double avg, max, min)` ↔ FE `TReportMetricSummary` 1:1. ✅

### alerts.totals (severity 6키 항상 존재)
- Nest `ReportAlertTotals`: notClassified/information/warning/average/high/disaster (entity.ts:48-66).
- Spring `AlertTotals` record: 동일 6키 동일 순서, `long` (HostGroupReportJson.java:26).
- FE `TReportAlertTotals = TAlertSeverityCounts = Record<TAlertSeverityKey, number>` — `TAlertSeverityKey`가 동일 6키(host-monitoring.ts:292-298). **키 이름 1:1 일치.** ✅
- 소비처 `HostGroupReportAlerts.tsx` SEVERITY_KEYS 배열이 동일 6키(16-23) + `alerts?.totals?.[key] ?? 0` 가드. ✅

### alerts.topHosts (`{hostName, count}[]`, 빈 배열 허용)
- Nest `ReportTopHost { hostName: string, count: number }` (entity.ts:69-75).
- Spring `TopHost(String hostName, long count)` (HostGroupReportJson.java:36).
- FE `TReportTopHost { hostName: string, count: number }` (host-monitoring.ts:402). ✅
- 빈 배열 처리: `alerts?.topHosts ?? []` + `topHosts.length ? <Table> : <Empty>` (HostGroupReportAlerts.tsx:65,106). ✅

## 3. 언랩 깊이 — PASS

- axios 인터셉터: `return response.data ?? response` (axiosInstance.ts:60) → ApiResult body 전체(`{status, code, errorCode, message, data}`) 반환 = **1겹**.
- `useDmoveQuery`: `envelope.data` 추출(useDmoveQuery.ts:22-26) = **1겹 더** → 총 2겹.
- 소비처 `useGroupReport`: `const reports = data ?? []` (useGroupReport.ts:43) → `data`는 payload `TGroupReport[]` 직접 수신. `.data` 과다 언랩 없음. ✅ ([[fe-usedmovequery-unwrap]] 규약 준수)
- 컴포넌트는 hook이 가공한 `reports`/`selectedReport`만 사용 — 추가 언랩 없음. ✅

## 4. Nest ↔ Spring 1:1 일치 — PASS

- 요청 DTO: 필드명(periodType/limit, periodType/periodStart) 동일. Spring은 `limit` `Integer`(옵셔널)·`periodType` String→enum 변환(`fromValue`, 기본 WEEK). Nest는 class-validator 검증(`@IsEnum`/`@Min/@Max`). **노출 계약(쿼리키·타입)은 동일**, 검증 강도 차이는 FE 영향 없음(FE가 항상 유효값 전송).
- 응답 DTO 필드명·순서·타입: 위 §2 표대로 전 필드 1:1. Spring `Resource`에 `@JsonInclude(ALWAYS)`로 null 키 보존까지 일치.
- periodType enum 직렬화: 양쪽 `WEEK`/`MONTH` 문자열. ✅
- 판정: 두 BE 모두 계약과 일치. 불일치 없음 → 어느 쪽이 정답인지 가릴 사안 없음.

## 5. FE 타입체크 — PASS

- `npx tsc --noEmit` → **에러 0건**. 리포트 관련 파일(types/host-monitoring.ts, host-monitoring.api.ts, useGroupReport.ts, HostGroupReport*.tsx) 무에러.

---

## 참고 관찰 (불일치 아님, 조치 불요)

1. **useGroupReport 타입 파라미터 표기** (useGroupReport.ts:30): `useDmoveQuery<TResponse<TGroupReport[]>>`로 선언했으나 useDmoveQuery는 payload를 직접 반환하므로 `useDmoveQuery<TGroupReport[]>`가 의미상 더 정확. 단 `TResponse<T> = T & {...}`(intersection)라 `TResponse<TGroupReport[]>`도 배열로 취급되어 `.map/.some/.find`가 정상 동작 → 런타임·타입 모두 무해. 다른 *.api 함수들도 동일 표기 관행이라 일관성상 유지해도 무방.

2. **에러 경로 `REPORT_PERIOD_NOT_CLOSED`** (계약 §4): 상세 미마감 기간 요청 시 HTTP 200 + errorCode로 내려오나, FE hook은 목록의 `periodStart`만으로 상세를 고르고(useGroupReport.ts:51-58) **상세 API를 호출하지 않는다**(목록=상세 동일 shape를 활용해 클라이언트 선택). 따라서 이 에러가 정상 흐름에서 발생할 경로 자체가 없음 → 미처리이지만 도달 불가(계약 §123 명시와 정합). `getGroupReportDetail` api 함수는 정의돼 있으나 현재 미사용.

---

## 책임 주체별 수정 권고

없음. be-engineer / fe-engineer 양측 조치 불요. 클로즈드 루프 종료.
