# 계약 — ZM-152 화면 자기설명 BE 요청 8건 (빈 값 이유·보존 경계·폐기 서비스 축)

- 작성일: 2026-09-28 · 갱신 2026-09-28(코덱스 v1 R1~R6 반영) · 상태: ✅ **BE master `43570e6` · FE master `e7e9e8f`**(2026-09-28 ff 병합, 코덱스 BE v2·FE v4 승인, 미푸시). 기능 문서 `moveseye-docs/features/APM-화면-자기설명.md`
- 명세: [`reports/zm-152_screen-self-explaining.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-152-%ED%99%94%EB%A9%B4%EC%9D%B4-%EC%8A%A4%EC%8A%A4%EB%A1%9C-%EC%84%A4%EB%AA%85%ED%95%98%EA%B2%8C-%EB%B9%88-%EA%B0%92-%EC%9D%B4%EC%9C%A0-%EB%B3%B4%EC%A1%B4-%EC%95%88%EB%82%B4-%EC%A7%80%ED%91%9C-%EB%9C%BB.md) §1·§5·§6 · BE 보고: [`reports/zm-152_be-self-explain.md`](../09-%EB%B3%B4%EA%B3%A0%EC%84%9C/ZM-152-%ED%99%94%EB%A9%B4-%EC%9E%90%EA%B8%B0%EC%84%A4%EB%AA%85-BE-%EC%9A%94%EC%B2%AD-8%EA%B1%B4-%EA%B5%AC%ED%98%84-%EB%B3%B4%EA%B3%A0.md)
- 라이선스 `Feature.APM` · 헤더 `x-visitor-id` 필수 · 인증 쿠키(`withCredentials`) — 기존 APM EP와 같다
- 🔴 **원칙: 응답 필드 추가만.** 기존 필드의 이름·타입·null 규칙·의미는 하나도 바꾸지 않았다. 새 EP 2개(`GET /apm/settings/retention`, `GET /apm/ingest/drops/by-service`) 외에는 전부 기존 응답에 키가 늘어난 것이다. FE 타입에는 **옵셔널(`?`)로 추가**하면 기존 화면·픽스처가 그대로 선다
- 마이그레이션 **없음**(DB 스키마 불변)

---

## 0. 한눈에

| # | 요청 | 어디에 | 추가된 것 | 권한 |
|---|---|---|---|---|
| 1 | 런타임 슬롯별 부재 사유 | `GET /apm/services/{uid}/runtime` | `absentSlots: {slot: "NOT_INGESTIBLE"\|"NOT_RECEIVED"}` | view |
| 2 | 액티브 요청을 보낸 적 있나 | `GET /apm/services/{uid}/red-series` · `GET /apm/services/{uid}` | red-series: `activeRequestsObserved`(창 안) · `activeRequestsLastSeenMs`(최근 7일) / 상세: `activeRequestsLastSeenMs` | view |
| 3 | 유효 보존 일수 | **신규** `GET /apm/settings/retention` | 표별 일수 + 해상도 대조 `resolutions[]` | **view** |
| 4 | 보존 경계 시각 | 트레이스 목록·산점도 · 예외 목록·시계열 · DB 쿼리 목록·시계열 · 외부 의존 목록·시계열 · 서비스 맵 | `oldestAvailableMs` | view |
| 5 | 폐기 통계 서비스 축 | **신규** `GET /apm/ingest/drops/by-service` | 서비스별 사유×메트릭 행(메모리 카운터) | **view** |
| 6 | 요청 0건 vs 수신 없음 | 서비스 목록 행 · 서비스 상세 · 개요 `totals`(홈 위젯 제외) | `requests` · `received` | view |
| 7 | SLO UNKNOWN 사유 | `GET /apm/slos` 행 · `GET /apm/slos/{uid}`의 `row` · SLO CRUD 응답 | `unknownReason` | view |
| 8 | 인스턴스 지표 가능 여부 | `GET /apm/services/{uid}/instances` · 상세 `instances[]` | `metricsAvailable` | view |

기존 `GET /apm/ingest/drops`(누적 DB 통계, `apm.edit`)·`GET /apm/settings`(`apm.edit`)는 **그대로**다.

---

## 1. 런타임 부재 사유 — `GET /apm/services/{uid}/runtime`

추가 필드

| 필드 | 타입 | null | 설명 |
|---|---|---|---|
| `absentSlots` | `Record<string, "NOT_INGESTIBLE" \| "NOT_RECEIVED">` | 키는 항상 있다(없을 때 `{}`) | 이 `family`가 가질 수 있는데 `slots`에 **없는** 슬롯 → 사유 |

- `NOT_INGESTIBLE` — 그 슬롯의 메트릭이 **수신 허용목록 밖**이라 보내도 저장되지 않는다. 에이전트 설정으로는 못 고친다(제품 업데이트 대상). 현재 비-JVM(.NET·Node·Python·Go) 런타임 슬롯이 전부 여기다.
- `NOT_RECEIVED` — 저장은 되는데 **이 창에** 안 왔다(에이전트가 안 보냄·창이 좁음·보존 밖).
- `slots`와 `absentSlots`의 키는 **겹치지 않는다**. 키 순서는 BE 슬롯 표 순서(화면 순서와 같음).
- `family=unknown`이면 공통 `processCpuPct`·`processMemoryBytes`만 대상이다.
- 판정 근거는 BE `RuntimeSlotMap.Binding.ingestible`이며, 이 표시가 실제 허용목록(`ApmMetricAllowlist`)과 같은지 테스트(`RuntimeSlotMapAbsentTest#ingestibleMatchesAllowlist`)가 고정한다.
- ⚠️ 보존 밖 창은 여전히 `NOT_RECEIVED`로 나온다(세 번째 코드를 만들지 않았다) — "창 전체 보존 밖"은 FE의 기존 보존 판정(또는 §3 일수)이 먼저 이긴다.

```json
{
  "family": "dotnet",
  "step": 60,
  "slots": {},
  "absentSlots": {
    "memoryUsed": "NOT_INGESTIBLE",
    "memoryCommitted": "NOT_INGESTIBLE",
    "gcDurationMs": "NOT_INGESTIBLE",
    "gcCount": "NOT_INGESTIBLE",
    "threads": "NOT_INGESTIBLE",
    "classCount": "NOT_INGESTIBLE",
    "processCpuPct": "NOT_RECEIVED",
    "processMemoryBytes": "NOT_RECEIVED"
  }
}
```

**FE 판정**: '계측 미제공' 카드에서 `absentSlots[slot] === "NOT_INGESTIBLE"`이면 "이 런타임의 이 지표는 아직 수집 대상이 아님"(설치 가이드 링크 불필요), `"NOT_RECEIVED"`면 지금처럼 설치 가이드 + 폐기 사유(§5) 경로. 키가 없으면(구버전 BE) 기존 두 경로 안내 유지.

---

## 2. 액티브 요청 관측 — red-series · 서비스 상세

### 2-1. `GET /apm/services/{uid}/red-series`

| 필드 | 타입 | null | 설명 |
|---|---|---|---|
| `activeRequestsObserved` | `boolean` | 🔴 서비스 전체 RED에만 값. 엔드포인트 시계열(`/endpoints/series`)·인스턴스 시계열에서는 `null` | **창 안**에 `http.server.active_requests` 표본이 하나라도 있었나 |
| `activeRequestsLastSeenMs` | `number(ms)` | `null` = 최근 7일 안에 한 번도 안 보냄. 엔드포인트·인스턴스 시계열에서도 `null` | **창과 무관하게** 최근 7일(1분 원시 보존) 안에서 마지막으로 보낸 1분 버킷 시작 |

- 두 신호를 다 낸 이유: "창 안"만으로는 요청 0건 창에서 옵션 문제인지 못 가르고, "전체 이력"은 비싸다. 1분 원시 표 인덱스 끝 한 번(`max(bucket_start)`)이라 싸다.
- ⚠️ 기준 7일은 BE `ApmResolution.M1` 상수(승격 판정과 같은 값)다. 운영에서 1m 보존을 줄였으면 그만큼 짧아진다(데이터가 없으니까).

### 2-2. `GET /apm/services/{uid}` (상세)

| 필드 | 타입 | null | 설명 |
|---|---|---|---|
| `activeRequestsLastSeenMs` | `number(ms)` | `null` = 7일 안에 한 번도 안 보냄 | red-series와 **같은 함수**(`ApmMetricStore.activeRequestsLastSeenMs`) |

창 안 관측 여부는 상세에서는 기존 `activeRequests != null`로 이미 갈린다(표본 0개일 때만 null이라는 기존 규칙 불변).

```json
{ "step": 60, "points": [ ... ], "rebucketed": false, "sampleWarning": false, "mixedBounds": false,
  "deployments": [], "activeRequestsObserved": false, "activeRequestsLastSeenMs": null }
```

**FE 판정**(액티브 요청 값이 null일 때):

| `activeRequestsLastSeenMs` | 요청 수(창) | 이유 |
|---|---|---|
| `null` | 무관 | **에이전트 옵션 필요**(보낸 적이 없다) — 요청 0건 창에서도 이제 가를 수 있다 |
| 값 있음 | 0 | **요청 없음** |
| 값 있음 | > 0 | 이 창에서만 끊김(드묾) — 기존 "데이터 없음" |
| 키 없음(구 BE) | — | 기존 판정 유지 |

---

## 3. 유효 보존 일수 — 🆕 `GET /apm/settings/retention`

- 권한 **`apm.view`**(`requireRead`) — 🔴 같은 컨트롤러의 `GET /apm/settings`는 여전히 `apm.edit`. 보존 안내는 모든 조회 화면이 쓰는 읽기 전용 사실이라 따로 열었다.
- 값의 정본: `scheduler_setting`(job_key `apm_retention`)의 `options`. 잡이 실제로 지우는 값과 **같은 해석**(`ApmRetentionDays.from` — 잡도 이 함수를 쓰도록 바꿨다). 60초 캐시.
- 실패 없음: 잡 행이 없거나 읽기에 실패하면 기본값 + `configured:false`.
- 🔴 **0 이하 값은 기본값으로 정규화된다**(코덱스 v1 R1, WARN 로그 1회). 배치 삭제 인자와 이 응답·`oldestAvailableMs`가 같은 양수만 본다 — 응답의 모든 일수는 항상 1 이상이다. 양수 설정값은 그대로다.

| 필드 | 타입 | 기본값 | 대상 |
|---|---|---|---|
| `configured` | boolean | — | false = 잡 행 없음/읽기 실패 → 아래가 기본값 |
| `nowMs` | number | — | 서버 기준 지금(경계 계산에 브라우저 시계 대신) |
| `m1Days` | int | 7 | `apm_metric_1m`(인스턴스 축 유일) |
| `m5Days` | int | 30 | `apm_metric_5m` |
| `h1Days` | int | 400 | `apm_metric_1h` |
| `spanDays` | int | 7 | `apm_span`(트레이스 상세·워터폴) |
| `traceSummaryDays` | int | 7 | `apm_trace_summary`(트레이스 목록·산점도) |
| `serviceEdge5mDays` | int | 30 | 서비스 맵 |
| `dbQuery5mDays` | int | 30 | DB 쿼리 집계 |
| `dependency5mDays` | int | 30 | 외부 의존 집계 |
| `messaging5mDays` | int | 30 | 메시징 |
| `errorGroup1hDays` | int | 90 | 예외 발생 수 버킷 |
| `errorGroupDays` | int | 90 | 예외 그룹 본체(마지막 관측 후) |
| `dbQueryGroupDays` | int | 90 | DB 쿼리 그룹 본체 |
| `errorGroupVisibleDays` | int | 90 | 🔴 예외 화면이 실제로 볼 수 있는 일수 = `min(errorGroup1hDays, errorGroupDays)` (R2) |
| `dbQueryVisibleDays` | int | 30 | 🔴 DB 쿼리 화면 = `min(dbQuery5mDays, dbQueryGroupDays)` (R3) |
| `sloSnapshotDays` | int | 400 | SLO 캘린더 |
| `deploymentDays` | int | 400 | 배포 이력 |
| `stuckRequestDays` | int | 90 | 요청 걸림 장부 |
| `dropStatDays` | int | 30 | 폐기 통계 DB 행 |
| `rum5mDays` · `rumSpanDays` · `rumErrorGroupDays` | int | 30 · 7 · 90 | RUM — 🔴 옵션 없음(코드 상수 노출) |
| `resolutions[]` | array | — | 시계열 해상도 3단(60·300·3600) |
| `resolutions[].step` | int | — | 초 |
| `resolutions[].promotionDays` | int | 7·30·400 | 🔴 시계열 **승격 판정**이 쓰는 상수(`ApmResolution`) |
| `resolutions[].effectiveDays` | int | = m1/m5/h1Days | 잡이 실제로 지우는 값 |
| `resolutions[].instanceAxis` | boolean | 60만 true | |
| `resolutions[].mismatch` | boolean | false | `promotionDays > effectiveDays` — 승격 없이 앞 구간이 빌 수 있다 |

```json
{
  "configured": true, "nowMs": 1790553600000,
  "m1Days": 7, "m5Days": 30, "h1Days": 400,
  "spanDays": 7, "traceSummaryDays": 7, "serviceEdge5mDays": 30, "dbQuery5mDays": 30,
  "dependency5mDays": 30, "messaging5mDays": 30, "errorGroup1hDays": 90, "errorGroupDays": 90,
  "dbQueryGroupDays": 90, "errorGroupVisibleDays": 90, "dbQueryVisibleDays": 30, "sloSnapshotDays": 400, "deploymentDays": 400, "stuckRequestDays": 90,
  "dropStatDays": 30, "rum5mDays": 30, "rumSpanDays": 7, "rumErrorGroupDays": 90,
  "resolutions": [
    { "step": 60, "promotionDays": 7, "effectiveDays": 7, "instanceAxis": true, "mismatch": false },
    { "step": 300, "promotionDays": 30, "effectiveDays": 30, "instanceAxis": false, "mismatch": false },
    { "step": 3600, "promotionDays": 400, "effectiveDays": 400, "instanceAxis": false, "mismatch": false }
  ]
}
```

**FE 사용**: `apmRetention.ts` 상수를 이 응답으로 덮는다(없으면/실패하면 상수 유지). 🔴 **승격 예측**(`apmResolvedStep`)은 `promotionDays`로, **"데이터가 남아 있나"** 안내는 `effectiveDays`/표별 일수로 해야 BE와 같다. 한 세션 한 번 조회(staleTime 길게)로 충분하다.

---

## 4. 보존 경계 — `oldestAvailableMs`

| EP | 응답 DTO | 원천 표(일수 필드) |
|---|---|---|
| `GET /apm/traces` | `ApmTraceListDto` | `traceSummaryDays` |
| `GET /apm/traces/scatter` | `ApmScatterDto` | `traceSummaryDays` |
| `GET /apm/errors` | `ApmErrorGroupsDto` | 🔴 `min(errorGroup1hDays, errorGroupDays)` (R2) |
| `GET /apm/errors/{groupId}/series` | `ApmAggSeriesDto` | 🔴 `min(errorGroup1hDays, errorGroupDays)` (R2) |
| `GET /apm/db/queries` | `ApmDbQueryGroupsDto` | 🔴 `min(dbQuery5mDays, dbQueryGroupDays)` (R3) |
| `GET /apm/db/queries/{groupId}/series` | `ApmAggSeriesDto` | 🔴 `min(dbQuery5mDays, dbQueryGroupDays)` (R3) |
| `GET /apm/dependencies` | `ApmDependenciesDto` | `dependency5mDays` |
| `GET /apm/dependencies/series` | `ApmAggSeriesDto` | `dependency5mDays` |
| `GET /apm/service-map` | `ApmServiceMapDto` | `serviceEdge5mDays` |

| 필드 | 타입 | null | 설명 |
|---|---|---|---|
| `oldestAvailableMs` | `number(ms)` | 위 EP에서는 항상 값. 같은 DTO를 쓰는 **다른** EP(예: `GET /apm/deployments/{id}/new-errors`의 `ApmErrorGroupsDto`)는 `null` = "계산하지 않음" | `서버 지금 − 유효 보존 일수 × 24h` |

- 🔴 **보수적 경계**다. 파티션 DROP은 하루 덜 지워서 실제로는 조금 더 오래된 행이 남아 있을 수 있지만, 이 시각 **이후**는 보존 정책상 지워지지 않았다. `ApmResolution.covers`와 같은 식이라 승격 판정과 같은 자다.
- 🔴 **min 규칙(R2·R3)**: 예외·DB 쿼리는 본체(`apm_error_group`·`apm_db_query_group`)가 마지막 관측 후 N일 지나면 **자식 버킷까지 함께** 지워진다. 그래서 경계는 버킷 보존과 본체 보존 중 **짧은 쪽**이다. 외부 의존(`apm_dependency_5m`)·서비스 맵(`apm_service_edge_5m`)은 본체 테이블·연쇄 삭제가 없어 파티션 보존 하나만 본다(점검 완료).
- 시계열 EP(red-series 등, 승격 있음)에는 싣지 않았다 — 거기는 기존처럼 응답 `step`이 승격 신호다.

```json
{ "total": 3, "totalCapped": false, "rows": [ ... ], "oldestAvailableMs": 1789948800000 }
```

**FE 판정**: `from < oldestAvailableMs` → 일부 밖(배너 "N일 이전은 보존 기간이 지나 없음"), `to <= oldestAvailableMs` → 전체 밖. 키가 없으면(구 BE) 기존 `apmRetentionState` 상수 계산 유지.

---

## 5. 서비스별 폐기 요약 — 🆕 `GET /apm/ingest/drops/by-service`

- 권한 **`apm.view`** — 기존 `GET /apm/ingest/drops`(`apm.edit`)는 그대로.
- 쿼리: `serviceUid`(UUID, 선택). 주면 그 서비스 1개(폐기가 없어도 `total:0` 한 줄), 안 주면 폐기가 있는 서비스만 `total` 내림차순(최대 200개, 서비스당 행 50개).
- 실패: 없는 `serviceUid` → HTTP 200 + body `code:404`(`APM_SERVICE_NOT_FOUND`). UUID 형식이 아닌 값은 스프링 바인딩 실패(`GlobalExceptionHandler` 처리 — 다른 APM EP의 UUID 파라미터와 같다).

### 🔴 한계 — 반드시 화면 문구에 반영

1. **프로세스 메모리 카운터**다. 서버 재기동 시 0부터 센다(`countingSinceMs`). "폐기 0건"은 "기동 후 0건"이다.
2. **인스턴스 로컬** — 설치형 1벌 배포 전제.
3. **서비스가 정해진 메트릭 폐기만** 센다: `NOT_ALLOWLISTED`(허용목록 밖) · `ROUTE_OVERFLOW` · `CUMULATIVE_FIRST_SKIPPED` · `REBUCKETED` · `RAW_BOUNDS` · `BOUNDS_CONFLICT`. 서비스를 모르는 폐기(귀속 실패·승인 대기·거절·신호 미지원)와 **트레이스 신호 폐기**(속성 허용목록·원문 SQL 차단)는 없다 — 그건 관리 권한의 `/drops`.
4. 키(서비스×사유×메트릭×신호) 상한 10,000 — 넘으면 새 키는 `overflowCount`로만 센다.
5. DB 테이블은 만들지 않았다(지시). 영속 서비스 축이 필요해지면 `apm_ingest_drop_stat`에 `service_id` 열(자연키 변경) 또는 별도 테이블 — 후속 결정.

| 필드 | 타입 | 설명 |
|---|---|---|
| `source` | `"PROCESS_MEMORY"` | 항상 이 값 |
| `countingSinceMs` · `countingSince` | number · ISO | 세기 시작 = 서버 기동 |
| `overflowCount` | number | 0이 아니면 이 표가 전부가 아니다 |
| `services[].serviceUid` · `displayName` | string | |
| `services[].total` | number | 행 count 합 |
| `services[].truncated` | boolean | 행 50개 상한에 걸림 |
| `services[].rows[].reason` | string | 위 3번의 6종 |
| `services[].rows[].metricName` | string \| null | 서비스 접미(`@svc:`) 없는 원래 이름 |
| `services[].rows[].signal` | `"METRIC"` | 현재 메트릭만 |
| `services[].rows[].count` | number | `countingSinceMs` 이후 누적 |
| `services[].rows[].lastSeenMs` · `lastSeenAt` | number · ISO | |

```json
{
  "source": "PROCESS_MEMORY",
  "countingSinceMs": 1790550000000, "countingSince": "2026-09-27T23:00:00Z",
  "overflowCount": 0,
  "services": [ {
    "serviceUid": "11111111-2222-3333-4444-555555555555", "displayName": "주문 API",
    "total": 1840, "truncated": false,
    "rows": [
      { "reason": "NOT_ALLOWLISTED", "metricName": "dotnet.gc.collections", "signal": "METRIC",
        "count": 1800, "lastSeenMs": 1790553540000, "lastSeenAt": "2026-09-27T23:59:00Z" },
      { "reason": "CUMULATIVE_FIRST_SKIPPED", "metricName": "http.server.request.duration", "signal": "METRIC",
        "count": 40, "lastSeenMs": 1790550060000, "lastSeenAt": "2026-09-27T23:01:00Z" }
    ]
  } ]
}
```

**FE 사용**: 런타임 '계측 미제공' 카드 — 그 슬롯 메트릭 이름(BE 슬롯 표)이 `rows[].metricName`에 `NOT_ALLOWLISTED`로 있으면 "수신은 됐지만 허용목록에서 버려짐" 확정. §1 `absentSlots`와 함께 쓰면 권한과 무관하게 판정된다. 링크는 `apm.edit`이 있을 때만 수집기 상태 탭.

---

## 6. 요청 0건 vs 수신 없음 — `requests` · `received`

| 응답 | 필드 | 타입 | null | 설명 |
|---|---|---|---|---|
| `GET /apm/services/overview`의 `services[]` 행, `GET /apm/services/{uid}` | `requests` | `number` | 없음(0 포함) | 창 안 요청 수 — `rps` 계산과 같은 모집단 |
| 〃 | `received` | `boolean` | 없음 | 창 안에 이 서비스의 **어떤 메트릭이든** 한 행이라도 들어왔나 |
| `GET /apm/overview`의 `totals` | `requests` | `number \| null` | 대상 서비스가 없으면 `null` | 현재 창 합(숨김·승인 대기 포함 — 기존 totals 모집단) |
| 〃 | `received` | `boolean \| null` | 대상 서비스가 없으면 `null` | 대상 중 하나라도 수신 |

- `received`는 조회 창이 고른 해상도 표(1m/5m/1h)에서 `EXISTS`로 본다. ⚠️ 5m·1h 표는 롤업 지연이 있어 **최근 몇 분만의 창**이 5m 이상으로 승격되면 드물게 false가 나올 수 있다(보통 창은 1m이라 해당 없음).
- ⚠️ 홈 위젯 `GET /apm/widgets/traffic-totals`에는 **싣지 않았다**(별도 DTO) — 필요하면 요청.
- `totals.prev`(직전 창 스냅샷)에는 추가하지 않았다.

**FE 판정**(`rps == null`일 때): `received === false` → "수신 없음(수집 끊김·보존 밖)", `received === true && requests === 0` → "요청 없음". 키 없음 → 기존 "요청 없음".

---

## 7. SLO UNKNOWN 사유 — `unknownReason`

`GET /apm/slos` 행(`ApmSloRowDto`), `GET /apm/slos/{uid}`의 `row`, SLO 생성·수정 응답.

| 필드 | 타입 | null | 값 |
|---|---|---|---|
| `unknownReason` | string | `status != "UNKNOWN"`이면 `null` | `NO_REQUESTS` · `NOT_MEASURABLE` · `OUT_OF_RETENTION` |

판정 순서(BE `ApmSloCalculator.unknownReason`, 코덱스 v1 R4 반영):
1. 측정을 못 했으면 `NOT_MEASURABLE`
2. 🔴 **창 시작이 유효 1h 보존(`rollup1hDays`) 밖이라 측정이 잘렸으면 `OUT_OF_RETENTION`** — 요청 수보다 **먼저** 본다(잘린 창의 0건은 "요청 없음"이 아니라 "못 읽음")
3. 요청 창은 있는데 잰 구간이 비었으면(`measuredToMs <= measuredFromMs`) `OUT_OF_RETENTION`
4. `requests == 0` → `NO_REQUESTS`
5. 그 밖(`requests > 0`인데 `measured == 0` — LATENCY 히스토그램 경계 혼재·누락 등) → `NOT_MEASURABLE`

측정 계획은 이제 유효 `rollup1hDays` 경계(`지금 − 일수`)보다 앞 구간을 읽지 않는다. 🔴 그 경우 행의 `measuredFromMs`가 그 경계로 당겨진다(기존 필드, 의미 불변 — "실제로 잰 구간의 시작"). 기본 보존(400일)에서는 7·30일 창이 잘리지 않아 측정값·`measuredFromMs`가 이전과 같다. `rollup1hDays`를 창보다 짧게 줄인 설치본에서 `OUT_OF_RETENTION`이 나온다. SLO 시계열(`/series`)·캘린더 칸에는 싣지 않았다.

```json
{ "sloUid": "7d8e…", "status": "UNKNOWN", "requests": 0, "measured": 0, "sliPct": null, "unknownReason": "NO_REQUESTS" }
```

---

## 8. 인스턴스 지표 가능 여부 — `metricsAvailable`

`GET /apm/services/{uid}/instances` 행, 서비스 상세 `instances[]` 행(`ApmInstanceRowDto`).

| 필드 | 타입 | null | 설명 |
|---|---|---|---|
| `metricsAvailable` | boolean | 없음 | false = 창 시작이 1분 원시 보존 밖이라 인스턴스 축이 없다 → `rps`·`errorRatePct`·`p95Ms`의 null은 "요청 없음"이 아니라 "이 기간은 인스턴스별로 못 봄" |

- 판정은 BE 기존 규칙 그대로 `ApmResolution.choose(from, to, 60) == M1`(창 **시작** 기준, 여유 없음). 한 응답의 모든 행이 같은 값이다(응답이 배열이라 최상위 필드를 못 붙여 행마다 싣는다).
- 🔴 명세 §6-2의 "7일 프리셋은 시작이 ms 차이로 7일을 넘어 항상 false" 동작은 **그대로다**(판정 규칙을 바꾸지 않았다). 여유 폭 도입은 별도 결정.
- 인스턴스가 없으면 빈 배열이라 이 값을 실을 행이 없다 — 그때는 FE 기존 판정.

**FE 사용**: `apmRetentionState(instance)` 흉내 대신 `rows[0]?.metricsAvailable === false`로 배너·빈 칸 배지.

---

## 9. 계약 표본(픽스처) 갱신

BE `src/test/resources/apm/contract/`의 14개 파일에 새 키가 추가됐다(값 변경 없음): `services-overview.json` · `services-overview-silent.json` · `service-detail.json` · `red-series.json` · `red-series-no-deployments.json` · `runtime.json` · `overview.json` · `trace-list.json` · `trace-list-capped.json` · `trace-scatter.json` · `service-map.json` · `slos.json` · `slo-detail.json` · `deployment-new-errors.json`(`oldestAvailableMs: null`).
FE `src/__tests__/fixtures/apmContractSample.ts` 등은 손으로 쓴 표본이라 **FE 타입에 옵셔널로 추가하면 깨지지 않는다**. 필수로 만들면 표본도 같이 채울 것.

---

## 🔄 FE 요청사항

> FE 연동(2026-09-28, 워크트리 `C:\worktrees\zm-152-fe`, 보고 `reports/zm-152_fe-contract-integration.md`) 중 발견. 둘 다 **FE를 막지 않는다**(현재 계약으로 연동 완료).

- [ ] **R-FE1 (표본 정합)** `service-detail.json` 표본이 `activeRequests: 3.0`인데 `activeRequestsLastSeenMs: null`(= 7일 안 한 번도 안 보냄)이다 — 실제 응답에서는 나올 수 없는 조합이다. 표본의 `activeRequestsLastSeenMs`를 값(예: `1788000000000`, red-series 표본과 같게)으로 맞춰 주면 FE 픽스처도 그대로 따라간다. FE는 지금 표본 값을 그대로 옮기고 주석으로 어긋남을 밝혀 두었다.
- [ ] **R-FE2 (선택)** 런타임 '허용목록 밖' 카드에서 "이 슬롯의 메트릭이 실제로 버려졌다"까지 확정하려면 FE가 슬롯→메트릭 이름 표(`RuntimeSlotMap`)를 한 벌 더 복제해야 한다. FE는 복제하지 않고 **서비스 단위 요약**("이 서비스의 폐기 n건 · 주요 사유")만 붙였다. 슬롯 단위가 필요해지면 `absentSlots` 값에 메트릭 이름을 싣거나(`{reason, metrics[]}` — 형태 변경이라 새 키 권장) by-service 응답에 `slot`을 붙이는 방식을 요청한다.
