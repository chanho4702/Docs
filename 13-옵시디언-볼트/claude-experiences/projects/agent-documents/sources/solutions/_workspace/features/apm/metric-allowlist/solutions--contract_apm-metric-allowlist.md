# 계약 — APM 메트릭 허용목록 확장 수단 (ZM-155, 1차 BE)

- 작성일: 2026-10-13 · 상태: **BE 구현 완료 + 코덱스 v1 R1~R10 반영(워크트리 `C:\worktrees\zm-155-be`, 브랜치 `ZM-155-be`, master BE `a9080eb`·FE `258d747`(2026-10-19 병합, 미푸시))** · FE 미착수
- 🆕 **v1.3(코덱스 v3 M1~M3·N2·N3·N7)은 맨 아래 §9 — 응답 모양 변화 없음, 동작만**(재등록 종류 규칙 변경)
- **v1.2(코덱스 v2 N1~N9 + FE F1~F5 회신)의 FE 영향은 §8** · v1.1(코덱스 v1)은 §7
- 🔴 **권한(확정)**: 규칙 관리 EP 6개(목록·등록·켜기·끄기·경고 해제·삭제)는 전부 **`apm.edit`**(`ApmAccessChecker.requireEdit` — 역할의 `applicationMonitoring/apm` edit 칸, 관리자 역할은 권한 JSON과 무관하게 통과). 조회 EP `custom-metrics`는 **`apm.view`**(`requireRead`). FE의 `apm.edit` 기준 차단과 같다.
- 🆕 **v1.1(코덱스 v1)의 FE 영향은 §7** — 자동 정지 → 경고(WARN)·`resume` → `clear-warning`·`valueKind` 확정·`metricNameTruncated`·`NAME_TRUNCATED`·fail-closed·영속 자리
- 설계: [`features/apm/metric-allowlist/devdesign_apm-metric-allowlist-extension.md`](devdesign_apm-metric-allowlist-extension.md) §8 결정 Q1~Q9
- BE 보고: [`features/apm/metric-allowlist/zm-155_be-metric-allowlist.md`](zm-155_be-metric-allowlist.md) · 검수 인계: [`features/apm/metric-allowlist/review_zm-155-be-metric-allowlist.md`](review_zm-155-be-metric-allowlist.md)
- 마이그레이션: **V81** `V81__apm_custom_metric_rule.sql`(다른 브랜치가 V76~V80 사용 중 — 2026-10-13 전 브랜치·워크트리 확인)
- 공통: 헤더 `x-visitor-id` 필수(`@VisitorIdCheck`), 쿠키 인증, `@RequiresFeature(APM)`. 응답은 평소 envelope `{status, code, data}`.
  🔴 **오류·권한 거부는 전부 HTTP 200 + body `code` + `errorCode`**(이 레포 계약). 401만 실제 상태코드.
- 시각은 전부 **epoch ms(Long)**.

---

## 0. 1차 범위와 화면 전제

| 항목 | 1차 값 | 비고 |
|---|---|---|
| 차원 | **없음 고정**(Q1) | 수신 속성을 버리고 서비스·인스턴스별 합계 1줄(`dims={}`)로 저장 |
| 받는 종류 | GAUGE · SUM(카운터·UpDownCounter) | 🔴 히스토그램은 폐기 사유 `CUSTOM_KIND_UNSUPPORTED`(Q4) |
| 등록 경로 | **폐기 통계의 `NOT_ALLOWLISTED` 행에서만**(Q5) | 이름 직접 입력 화면 없음. 서버가 최근 7일 관측을 다시 확인 |
| 저장 위치 | 기존 `apm_metric_1m`(Q3) | 롤업 5m/1h·보존·콜드 아카이브(ZM-156)에 자동 합류 |
| 값 종류 | **서비스×이름 시계열마다 첫 수신 종류로 고정**(GAUGE·UPDOWN·COUNTER, 자리 원장) | 다른 종류는 `CUSTOM_KIND_UNSUPPORTED`(R7·N7). 🔴 v1.3: 자리에 **규칙 세대(rule_id)** 가 붙는다 — 같은 이름을 지우고 다시 만들면 새 세대가 같은 자리를 넘겨받으며 **종류를 새로 정한다**, 옛 규칙을 든 노드(전파 창 30초)는 그 이름을 저장하지 못하고 `NOT_ALLOWLISTED`로 센다 |
| 규칙 조회 장애 | **마지막 성공 + 60초**를 넘는 순간 **fail-closed**(실패 재시도 5초 간격) | 커스텀 지표는 `NOT_ALLOWLISTED`로 센다. 내장 지표 무영향(R1·N1) |
| 감사 | `[APM-ALLOWLIST]` 로그(Q7) | 이력 테이블·이력 화면 없음 |
| 수집기 | 규칙 저장 시 설정 생성 폼의 추가 정규식 기본값에 포함(Q8) | 고객이 설정을 다시 받아 배포해야 반영 |
| 다중 노드 지연 | 최대 30초(Q9) | 규칙을 바꾼 노드는 다음 배치에 즉시 |

**상한**

| # | 상한 | 값 | 걸리는 때 | 초과 시 |
|---|---|---|---|---|
| L1 | 규칙 수(활성·꺼짐·정지 모두) | 20 | 등록 | `APM_CUSTOM_METRIC_LIMIT` |
| L5 | 서비스당 커스텀 시계열(인스턴스 축 제외) | 50 | 수신 | `__other__` 한 줄로 **접어서 저장**(손실 아님), 사유 `CUSTOM_SERIES_OVERFLOW`. 🔴 **DB 원장(`apm_custom_metric_admission`) 기준 — 전 노드 공통·재기동 무관**. 자리는 마지막 관측 뒤 7일 유지(규칙을 지워도 남는다) |
| L6 | 이름 길이 | **127** | 등록 | 129자↑ `APM_CUSTOM_METRIC_NAME_INVALID`, 128자 `APM_CUSTOM_METRIC_NAME_TRUNCATED`(폐기 통계가 128자에서 자르므로 잘린 이름일 수 있다, R8) |
| L8 | 접힘 **경고** | 접힘 비율 **>50%** 가 **60분** | 수신 | 규칙 `WARN` — 🔴 **저장은 계속한다**(R5: 한 노드의 표본으로 전역 규칙을 멈추지 않는다). 해제는 사람만 |

⚠️ 1차(차원 없음)에서는 규칙 하나 = 서비스당 시계열 하나라 **L5(50) > L1(20)** — 평상시 접힘은 일어나지 않는다. 규칙을 지우고 다른 이름으로 다시 만드는 일이 7일 안에 반복돼 한 서비스의 자리가 50을 넘을 때 걸린다. 화면은 상한·접힘·경고를 "있을 수 있는 상태"로 처리하면 된다.

---

## 1. EP 요약

| 메서드 | 경로 | 권한 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/custom-metrics/rules` | `apm.edit` | `ApmCustomMetricRulesDto` |
| POST | `/apm/custom-metrics/rules` | `apm.edit` | `ApmCustomMetricRuleDto` |
| POST | `/apm/custom-metrics/rules/{id}/enable` | `apm.edit` | `ApmCustomMetricRuleDto` |
| POST | `/apm/custom-metrics/rules/{id}/disable` | `apm.edit` | `ApmCustomMetricRuleDto` |
| POST | `/apm/custom-metrics/rules/{id}/clear-warning` | `apm.edit` | `ApmCustomMetricRuleDto` |
| DELETE | `/apm/custom-metrics/rules/{id}` | `apm.edit` | `null` |
| GET | `/apm/services/{uid}/custom-metrics?from&to&step` | `apm.view` | `ApmCustomMetricSeriesDto` |
| GET | `/apm/ingest/drops` (기존) | `apm.edit` | `rows[].customRule` **필드 추가** |
| GET | `/apm/collectors/config-defaults` (기존) | `apm.edit` | `processors.filterMetricsExtra` **필드 추가** |
| GET | `/apm/install-guide` (기존) | `apm.edit` | `customMetrics` **필드 추가** + 조건부 안내 1줄 |

권한 거부: HTTP 200 + `{"code":403, ...}`(`ApmAccessChecker`, 관리자는 권한 JSON 무관 통과).

---

## 2. 규칙 EP

### 2.1 `GET /apm/custom-metrics/rules`

```json
{
  "rules": [
    {
      "id": 3,
      "metricName": "app.orders.created",
      "status": "ACTIVE",
      "enabled": true,
      "valueKind": "COUNTER",
      "warnedAtMs": null,
      "warnReason": null,
      "createdBy": "admin",
      "createdAtMs": 1760313600000,
      "updatedBy": "admin",
      "updatedAtMs": 1760313600000,
      "collectorPattern": "^app\\.orders\\.created$"
    }
  ],
  "limits": {
    "maxRules": 20, "maxSeriesPerService": 50, "seatRetentionDays": 7, "warnFoldPct": 50, "warnSustainMinutes": 60,
    "maxNameLength": 127, "observedWithinDays": 7, "propagationSeconds": 30, "failClosedSeconds": 60,
    "dimensions": "NONE", "acceptedKinds": ["GAUGE", "SUM"]
  },
  "budget": {
    "activeRules": 1, "liveServices": 10, "liveInstances": 30, "seriesPerServiceMax": 1,
    "rowsPerDayMax": 43200, "bytesPerRow": 686, "bytesPerDayMax": 29635200,
    "raw1mDays": 7, "bytesRaw1mMax": 207446400
  },
  "collector": {
    "patterns": ["^app\\.orders\\.created$"],
    "rulesChangedAtMs": 1760313600000,
    "regenerationRequired": true
  }
}
```

**`ApmCustomMetricRuleDto`**

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | long | |
| `metricName` | string | 수신 원문(대소문자 구분) |
| `status` | `ACTIVE`\|`WARN`\|`DISABLED` | 배지 정본. DISABLED=관리자가 끔(그 지표는 다시 `NOT_ALLOWLISTED`로 센다) · WARN=접힘 경고(L8, 저장은 계속) |
| `enabled` | boolean | 스위치 값(WARN이면 true) |
| `valueKind` | `GAUGE`\|`UPDOWN`\|`COUNTER`\|`MIXED`\|null | 자리 원장의 시계열 종류(서비스마다 다르면 `MIXED`). 살아 있는 자리가 없으면 null |
| `seatServices` | int | 🆕 F5 — 이 이름으로 살아 있는 자리(마지막 관측 7일 안)를 가진 서비스 수. 0이면 아직 저장된 서비스가 없다 |
| `warnedAtMs` / `warnReason` | long\|null / string\|null | 경고 시각·한국어 사유("이 서버 노드 기준") |
| `createdBy` / `createdAtMs` | string / long | 🔴 등록 전 구간에는 데이터가 없다(소급 저장 없음) |
| `updatedBy` / `updatedAtMs` | string\|null / long | 자동 경고면 `system` |
| `collectorPattern` | string | 수집기 `filter/metrics`용 정규식(앞뒤 고정) |

**`budget`** — 설계 §4.6 산식, 🔴 **최악치 추정**(모든 인스턴스가 모든 활성 규칙을 매분 보낸다고 가정, 행당 686B는 R3 내장 지표 실측):
`rowsPerDayMax = liveInstances × seriesPerServiceMax × 1440`, `seriesPerServiceMax = min(activeRules, 50)`, 🔴 **`activeRules` = 켜진 규칙 수(ACTIVE + WARN, DISABLED 제외)** — WARN도 저장을 계속하기 때문이다(N8·F2). 필드 이름은 호환 때문에 그대로 둔다.
`bytesPerDayMax = rowsPerDayMax × 686`, `bytesRaw1mMax = bytesPerDayMax × raw1mDays`(5m·1h 롤업 몫 제외).
`liveServices`·`liveInstances` = 최근 1일 안에 보고한 것. 집계 실패 시 0(목록은 나간다).

**`collector`** — `patterns`는 **켜진(경고 포함) 규칙**의 정규식(끈 규칙만 빠진다). `regenerationRequired=true`는 "규칙이 바뀐 적이 있다"이고 🔴 판정이 아니라 권고다(서버는 고객 yaml을 볼 수 없다) — `rulesChangedAtMs` 이후에 받은 설정이면 무시해도 된다. 자동 경고는 이 시각을 밀지 않는다.

### 2.2 `POST /apm/custom-metrics/rules`

요청: `{"metricName": "app.orders.created"}` — 🔴 폐기 통계 `rows[].metricName` 값 그대로(공백 정리 안 함).
응답: 생성된 `ApmCustomMetricRuleDto`(`status: ACTIVE`).

판정 순서(앞에서 걸리면 끝):

| 순서 | 조건 | body `code` | `errorCode` |
|---|---|---|---|
| 1 | 빈 이름·129자 이상·문법 밖(`^[A-Za-z][A-Za-z0-9_./-]*$`) | 400 | `APM_CUSTOM_METRIC_NAME_INVALID` |
| 1 | 정확히 128자 — 폐기 통계에서 잘린 이름일 수 있음(R8) | 400 | `APM_CUSTOM_METRIC_NAME_TRUNCATED` |
| 1 | 내장 허용목록·구 별칭(`http.server.duration` 등)·`otelcol*`·`moveseye.*` | 400 | `APM_CUSTOM_METRIC_BUILTIN` |
| 1 | 런타임 탭 패밀리 접두(`jvm.`·`dotnet.`·`process.runtime.dotnet.`·`nodejs.`·`v8js.`·`process.runtime.cpython.`·`python.`·`go.`, 대소문자 무시) | 400 | `APM_CUSTOM_METRIC_RESERVED` |
| 2 | 같은 이름 규칙 존재 | 409 | `APM_CUSTOM_METRIC_DUPLICATE` |
| 3 | 최근 7일 폐기 통계에 `NOT_ALLOWLISTED`·`METRIC`으로 없음(Q5) | 400 | `APM_CUSTOM_METRIC_NOT_OBSERVED` |
| 4 | 규칙 20개 도달(L1) | 400 | `APM_CUSTOM_METRIC_LIMIT` |

⚠️ 폐기 통계는 최대 10초 메모리에 모았다 쓴다 — 처음 들어온 이름은 그만큼 늦게 등록 가능해진다.

### 2.3 `POST …/{id}/enable` · `POST …/{id}/disable`

멱등(같은 상태면 그대로 반환). 끄면 저장을 멈추고 그 이름은 다시 `NOT_ALLOWLISTED`로 센다(이미 저장된 행은 남는다). 없는 id → `code 404`, `APM_CUSTOM_METRIC_NOT_FOUND`.

### 2.4 `POST …/{id}/clear-warning` — 경고 해제

경고가 아니면 멱등. 규칙 버전(`updatedAt`)이 바뀌어, 해제 전에 계산돼 아직 기록 안 된 경고는 버려진다(R4). 🔴 원인(L5 초과)이 그대로면 **60분 뒤 다시 경고**한다 — 화면은 확인 모달에서 그 사실을 말해야 한다.

### 2.5 `DELETE …/{id}`

`data: null`. 저장 중지만 한다 — 저장된 행은 보존 정리가 지운다(소급 삭제 없음). 같은 이름은 다시 `NOT_ALLOWLISTED`로 센다. 🔴 **서비스별 자리(L5)는 지워지지 않는다**(마지막 관측 뒤 7일 유지) — 다른 이름으로 바꿔 상한을 우회할 수 없다. 같은 이름을 다시 등록하면 같은 자리로 돌아오고 **새 세대로 종류를 새로 정한다**(v1.3). 조회 EP는 새 규칙 생성 다음 칸부터 보여 주므로 옛 세대 값과 섞이지 않는다.

---

## 3. 폐기 통계 EP 추가 필드 — `GET /apm/ingest/drops`

`rows[]`에 **`customRule`**·**`metricNameTruncated`** 추가(그 밖 필드·정렬·rowKey 규약 불변). 🔴 `reason=NOT_ALLOWLISTED` **이고** `signal=METRIC`인 행에만 객체가 실리고, 나머지 행은 `null`.

```json
{
  "reason": "NOT_ALLOWLISTED", "metricName": "app.orders.created", "count": 1200,
  "lastSeenAt": "2026-10-13T01:02:03Z", "signal": "METRIC",
  "customRule": { "registrable": true, "blockedReason": null, "ruleId": null, "ruleStatus": null },
  "metricNameTruncated": false
}
```

| 필드 | 타입 | 설명 |
|---|---|---|
| `registrable` | boolean | [받기] 버튼 활성 조건 — 등록 API와 **같은 판정 함수** |
| `blockedReason` | string\|null | `RULE_EXISTS` · `NAME_INVALID` · `NAME_TRUNCATED`(128자) · `BUILTIN` · `RESERVED` · `NOT_RECENT`(그 행의 `lastSeenAt`이 7일 전) · `LIMIT_REACHED`. 가능이면 null |
| `metricNameTruncated` (행 최상위) | boolean\|null | 🆕 R8 — 이름이 저장 상한 128자에 닿아 **잘렸을 수 있다** → '잘림' 표시. 이름 없는 행은 null. 모든 사유 행에 실린다 |
| `ruleId` / `ruleStatus` | long\|null / string\|null | `RULE_EXISTS`일 때만 — 규칙을 막 만든 직후에도 누적 행은 남아 있고, 끈 규칙의 지표는 계속 이 사유로 세어진다 |

새 사유 2종(이 표와 `/apm/ingest/drops/by-service`에 나온다, F1):

| 사유 | 손실 | `metricName` |
|---|---|---|
| `CUSTOM_SERIES_OVERFLOW` | **아님**(접혀서 저장) | 원래 지표 이름(저장은 `@svc:<id>` 접미 — 응답에서는 떼고 합친다. 서비스별 분해 필드는 1차에 없음) |
| `CUSTOM_KIND_UNSUPPORTED` | 손실(히스토그램 또는 확정 종류와 다른 종류) | 지표 이름 |
| `CUSTOM_UNIT_MISMATCH` | 🆕 v1.4 손실 — 그 시계열에 고정된 단위와 다른 단위(s·ms 등, 환산하지 않음) | 지표 이름 |

---

## 4. 조회 EP — `GET /apm/services/{uid}/custom-metrics`

쿼리: `from`·`to`(ms), `step`(초 60·300·3600, 생략 시 창 길이로 자동) — **red-series와 같은 해상도 선택·보존 승격·포인트 예산**. 권한 `apm.view`. 없는 uid → `code 404` `APM_SERVICE_NOT_FOUND`.
🔴 조회 대상은 **등록된 규칙 이름만**(이름 파라미터 없음). 접힌 몫(`__other__`)만 함께 준다.

```json
{
  "step": 60,
  "oldestAvailableMs": 1759708800000,
  "metrics": [
    {
      "name": "app.orders.created", "status": "ACTIVE", "ruleCreatedAtMs": 1760313600000,
      "received": true, "valueKind": "COUNTER",
      "points": [
        { "ts": 1760320800000, "count": 5, "sum": 5.0, "avg": null, "min": null, "max": null },
        { "ts": 1760320860000, "count": 0, "sum": null, "avg": null, "min": null, "max": null }
      ]
    },
    {
      "name": "app.queue.depth", "status": "WARN", "ruleCreatedAtMs": 1760313600000,
      "received": true, "valueKind": "GAUGE",
      "points": [ { "ts": 1760320800000, "count": 2, "sum": 10.0, "avg": 5.0, "min": 4.0, "max": 6.0 } ]
    }
  ],
  "overflow": null
}
```

| 필드 | 설명 |
|---|---|
| `step` | 실제 해상도(초). 🔴 요청과 다를 수 있다 |
| `oldestAvailableMs` | 응답 해상도 테이블의 보존 경계(1m=`raw1mDays`, 5m=`rollup5mDays`, 1h=`rollup1hDays`) — 이 전 구간 빈칸의 이유 |
| `metrics[]` | 규칙마다 한 줄(등록 순, 꺼짐·경고 포함). 규칙이 없으면 `[]`. 🔴 **규칙 `createdAt`이 든 칸까지 잘라서, 그 다음 완전한 칸부터 준다**(ceil — 생성 시각이 든 칸에는 같은 이름 지난 규칙 값이 섞였을 수 있다, R6·N6). 1h 해상도면 등록 후 최대 1시간 비어 보인다 |
| `metrics[].received` | 창 안에 한 점이라도 있었나. false면 이유는 등록 전(`ruleCreatedAtMs`)·보존 밖(`oldestAvailableMs`)·미수신(수집기 설정 재생성 필요일 수 있음) 중 하나 |
| `metrics[].valueKind` | `COUNTER`(→ `sum`이 증가량, 초당은 `sum/step`) · `GAUGE`·`UPDOWN`(→ `avg` 그리기, `sum`은 그리지 말 것). 이 서비스 시계열의 **지금 규칙 세대** 자리 원장 종류가 정본(N7, v1.4: 자리가 만료돼도 같은 세대면 사용), 없으면 저장 행에서 추정. 둘 다 없으면 null |
| `metrics[].unit` | 🆕 v1.4 — 이 서비스 시계열에 고정된 단위(OTLP unit, UCUM: `ms`·`s`·`By`·`1`…). 빈 문자열 = 무단위, 모름·접힌 몫 = null. 다른 단위로 온 값은 `CUSTOM_UNIT_MISMATCH`로 버려져 섞이지 않는다. 🔴 FE는 환산하지 않는다(`ms`·`By`만 같은 뜻의 포맷, 나머지는 숫자 그대로 + 단위 표시) |
| `overflow` | L5 초과로 `__other__`에 접힌 몫. 🔴 서로 다른 지표가 섞여 **count만 의미**, `valueKind: "MIXED"`, `status`·`ruleCreatedAtMs`는 null. 창에 데이터 없으면 null |
| 🔴 칸 정렬(확정) | **서버 기본 시간대(`ZoneId.systemDefault()`) 벽시계 기준**이다 — epoch 기준이 아니다. 1m 적재(`ApmMetric1mStore.bucketOf`)·5m/1h 롤업(`ApmRollupService.floor`)·red-series 격자(`ApmSeriesQueryService.floorTo`)·이 EP의 생성 칸 하한(`ceil(created_at)`)이 모두 같은 규칙이다. 정시 단위 오프셋 TZ(KST 등)에서는 epoch 정렬과 일치하지만, 30·45분 오프셋 TZ 서버에서는 1h 칸이 epoch와 어긋난다(1m·5m 칸은 오프셋이 5분의 배수라 일치). 🔴 **FE는 칸 경계를 직접 계산하지 말고 응답 `points[].ts`(서버가 만든 칸 시작)를 쓴다** — 첫 데이터 칸은 `ts >= ruleCreatedAtMs`인 첫 점이다. BE를 epoch로 바꾸지 않은 이유: 저장 버킷 자체가 서버 시간대라 조회 EP만 바꾸면 하한과 실제 칸이 어긋난다 |
| `points[]` | 빈 칸도 점이 있다 — `observed: false`·`count: 0`, 나머지 null(0은 측정값이다) |
| `points[].observed` | 🆕 v1.4 — 이 칸에 저장 행이 있었나. 🔴 **값 유무의 정본** — 카운터 `count`는 증가량을 반올림한 정수라 증가량 0·0.2인 정상 칸도 0이다(`count`로 빈 칸을 판단하면 받은 값이 사라진다). 옛 서버엔 없다(FE는 `count > 0`으로 폴백) |

---

## 5. 수집기 설정 기본값 — `GET /apm/collectors/config-defaults`

`processors`에 **`filterMetricsExtra: string[]`** 추가 — 켜진(경고 포함) 규칙의 정규식(`^app\.orders\.created$`). 🔴 FE는 설정 생성 폼의 `filter/metrics` **추가 목록 기본값**으로 이 값을 채워, 생성 요청 `processors.filterMetrics.extra`에 실어 보낸다. 서버는 `processors`를 생략한 요청에 몰래 넣지 않는다(기존 "생략=템플릿 그대로" 계약 유지). 규칙이 없으면 `[]`.

## 6. 설치 가이드 — `GET /apm/install-guide`

- 최상위에 **`customMetrics`** 추가: `{ patterns: string[], rulesChangedAtMs: long|null, regenerationRequired: boolean }`(§2.1 `collector`와 같은 모양).
- `regenerationRequired=true`면 `notices` **맨 끝에** INFO 1줄이 붙는다: `code: "custom-metric-rules-changed"` — "커스텀 지표 규칙이 바뀌었습니다 … 다시 받아 배포하세요". 기존 안내의 순서·문구는 그대로.

---

## 🔄 FE 요청사항 / 화면 메모

1. 폐기 통계 표의 기존 "화면에서 추가 불가" 힌트(FE `821344b`)를 `customRule.registrable` 기반 [받기] 버튼으로 교체. `blockedReason`별 툴팁 문구 필요.
2. 규칙 목록은 수집기 화면 하위 탭 권장(설계 §5.3 4단계). `status`/`enabled`를 따로 그릴 것.
3. 등록·변경 후 "수집기 설정을 다시 받아 배포해야 수집기 필터를 통과" 안내 — `collector.regenerationRequired`.
4. 서비스 상세 "커스텀 지표" 탭 — `valueKind`로 그릴 값 선택, `overflow`는 "기타(여러 지표 합)"로 건수만.
5. 폐기 사유 i18n 2종 추가(`CUSTOM_SERIES_OVERFLOW`·`CUSTOM_KIND_UNSUPPORTED`).

### FE 연동 결과(2026-10-13, FE 워크트리 `C:\worktrees\zm-155-fe`, 미커밋) — 위 1~5 반영 완료, v1.1(§7) 기준
- 보고 [`features/apm/metric-allowlist/zm-155_fe-metric-allowlist.md`](zm-155_fe-metric-allowlist.md) · 검수 인계 [`features/apm/metric-allowlist/review_zm-155-fe-metric-allowlist.md`](review_zm-155-fe-metric-allowlist.md)
- FE가 확인·가정한 것(BE 확인 요청):
  - ✅ **BE 회신(2026-10-13)**: F1 머리말 2종으로 정정 · F2 `activeRules`=켜진(ACTIVE+WARN) 규칙 수로 확정(§2.1) · F3 그대로(서버 안내 유지, FE 배너 중복은 문제없음) · F4 확인 — §5 그대로가 맞다 · F5 `seatServices` 추가(§8), 행 수는 2차(§8)
  - **F1 문서 정합** — §3 표 머리말이 "새 사유 3종"인데 표는 2행(`CUSTOM_RULE_SUSPENDED` 삭제, §7). FE는 **2종**으로 구현했다. 머리말만 고쳐 주면 된다.
  - **F2 예산 +1 산식** — 등록 모달은 `budget`에 `activeRules + 1`을 넣어 서버 산식(§2.1)을 그대로 재계산한다. `activeRules`가 **WARN 포함·DISABLED 제외**라는 가정이다 — 다르면 알려 달라.
  - **F3 설치 가이드 안내 중복** — FE는 `customMetrics.regenerationRequired`로 탭 맨 위에 경고 배너를 세우고, 서버 `notices` 끝의 `custom-metric-rules-changed`도 그대로 그린다(두 곳에 같은 사실). 서버 안내를 빼자는 요청은 아니다 — 접힐 수 있는 목록 끝이라 놓치기 쉬워 FE가 위에 한 번 더 세운 것.
  - **F4 설정 생성 기본값** — §5대로 발급 Drawer가 `filterMetricsExtra`를 `processors.filterMetrics.extra`에 채워 싣는다(`useDefaults: true` 유지). 응답이 늦게 와도 열림마다 1회, 사용자가 행을 손댔으면 덮지 않는다.
  - **F5 (후속 요청)** 규칙별 접힘 비율·자리 수/상한·최근 7일 행 수(설계 §5.3 4단계)는 응답에 없어 화면에 없다 — BE 미해결 목록과 같은 항목.

---

## 7. v1.1 변경(코덱스 검수 v1 R1~R10) — FE 영향

| 항목 | v1 | v1.1 |
|---|---|---|
| L8 | 자동 정지 `SUSPENDED` + 폐기 사유 `CUSTOM_RULE_SUSPENDED` | **경고 `WARN`**(저장 계속). 사유 `CUSTOM_RULE_SUSPENDED` **삭제** |
| 해제 EP | `POST /{id}/resume` | **`POST /{id}/clear-warning`** |
| 규칙 DTO | `suspendedAtMs`·`suspendedReason` | **`warnedAtMs`·`warnReason`** + 🆕 **`valueKind`** |
| `limits` | `suspendFoldPct`·`suspendSustainMinutes`, `maxNameLength:128` | **`warnFoldPct`·`warnSustainMinutes`**, **`maxNameLength:127`**, 🆕 `seatRetentionDays:7`·`failClosedSeconds:60` |
| 등록 오류 | — | 🆕 `APM_CUSTOM_METRIC_NAME_TRUNCATED`(128자) |
| 폐기 표 | `customRule` | + `blockedReason: NAME_TRUNCATED`, 🆕 행 최상위 `metricNameTruncated` |
| 조회 EP | 저장 행에서 종류 추정, 재등록 시 지난 데이터 섞임 | 규칙 확정 종류 우선(`UPDOWN` 추가), **생성 시각 앞 칸 자름** |
| L5 | 노드 메모리(재기동·규칙 교체로 초기화) | **DB 원장**(전 노드 공통, 마지막 관측 뒤 7일 유지) — 응답 모양 변화 없음 |
| 규칙 조회 장애 | 이전 규칙으로 무기한 수신 | 60초 뒤 **fail-closed** — 응답 모양 변화 없음 |
| 감사 로그 | 커밋 전 | 커밋 뒤에만 — 응답 모양 변화 없음 |

---

## 8. v1.2 변경(코덱스 검수 v2 N1~N9 + FE F1~F5 회신) — FE 영향

| 항목 | v1.1 | v1.2 |
|---|---|---|
| 규칙 DTO | `valueKind`(규칙에 확정) | `valueKind`는 **자리 원장 요약**(`MIXED` 추가) + 🆕 **`seatServices`** |
| `budget.activeRules` | ACTIVE만 | **ACTIVE + WARN**(켜진 규칙, N8·F2) |
| 조회 EP 하한 | 생성 시각이 든 칸부터(floor) | **다음 완전한 칸부터**(ceil, N6) |
| 조회 EP `valueKind` | 규칙의 확정값 | 이 서비스 시계열의 자리 원장 값(N7) |
| fail-closed | 마지막 실패 기준(최대 ~90초) | **마지막 성공 + 60초 정확히**(N1) — 응답 모양 변화 없음 |
| L5 자리 판정 | 이름마다 SQL 4~5개, 무기한 메모리 캐시 | 배치마다 서비스 ID 오름차순 락 + 서비스당 ≤3문장, 캐시는 60초 힌트(N2·N3·N4) — 응답 모양 변화 없음 |
| 자리 원장 정리 | 판정 때 해당 서비스만 | 보존 배치 단계 `customMetricSeats`가 전역으로(N9) |

**F5 중 "규칙별 최근 7일 행 수"는 2차로 남긴다** — `apm_metric_1m` 보조 인덱스는 `(service_id, metric, bucket_start)`라
서비스 축 없이 이름으로 세면 전 서비스 7일 파티션을 훑는다(규칙 목록을 열 때마다). 필요하면 롤업 단계에서 이름별 일 집계를
따로 쌓는 쪽이 맞다. **접힘 비율**도 노드 표본이라(L8 경고와 같은 이유) 숫자로 내리지 않고, 접힘이 이어졌다는 사실은
`status: WARN` + `warnReason`으로 준다. 자리 수/상한은 `seatServices`(서비스 수) + `limits.maxSeriesPerService`로 그린다.

---

## 9. v1.3 변경(코덱스 검수 v3) — 응답 모양 변화 없음

| 항목 | v1.2 | v1.3 |
|---|---|---|
| 재등록(같은 이름 삭제→등록) | 자리가 살아 있는 동안 옛 종류 유지 | 자리에 규칙 세대가 붙어 **새 세대가 자리를 넘겨받고 종류를 새로 정한다** |
| 옛 규칙 스냅샷 노드(전파 창 30초) | 옛 규칙으로 저장 가능 | 저장 금지 → `NOT_ALLOWLISTED`로 센다(폐기 표에 잠깐 보일 수 있다) |
| 종류가 다른 포인트 | 옛 자리의 마지막 관측을 갱신 | 갱신하지 않는다(종류 일치 확인 뒤에만) — 옛 자리는 7일 뒤 정상 만료 |
| 조회 EP `valueKind` | 만료된 자리 종류까지 사용 | 살아 있는 자리(7일 안)만, 없으면 저장 행에서 추정 — 규칙 목록 `valueKind`와 같은 기준 |

## 10. v1.4 변경(ZM-155 후속 R1~R3, 2026-10-21) — FE 영향

근거: `review_zm-155-followup-20261020.md`(코덱스 분석), 구현 검수 `review_zm-155-followup-impl-20261021.md`. Flyway **V82**(`apm_custom_metric_admission.unit`).

| 항목 | v1.3 | v1.4 |
|---|---|---|
| 조회 EP 점 | `count`로 빈 칸 판단 | 🆕 `points[].observed` — 값 유무의 정본(R1). FE는 `observed ?? count > 0` |
| 조회 EP `valueKind` | 살아 있는 자리(7일 안)만 | **지금 규칙 세대**의 자리면 만료돼도 사용(R2) — 만료 뒤 다른 종류로 와도 과거를 새 종류로 다시 읽지 않는다 |
| 만료 자리(7일 무수신) | 보존 배치가 삭제 → 다른 종류로 새 자리 가능 | 🔴 **세대가 끝날 때까지 남아 종류·단위를 지킨다**(규칙 삭제·재등록·서비스 없음일 때만 삭제). 상한(50) 계산은 그대로 살아 있는 자리만. 만료된 같은 세대 자리에 다른 종류가 오면 `CUSTOM_KIND_UNSUPPORTED`, 상한이 찼거나 그 종류가 배치에 없으면 같은 종류도 접힌다(제약은 저장 허가가 아니다) |
| 단위 | 보존 안 함(1m 행에 섞여 합산) | 🆕 자리를 받을 때 처음 본 단위로 고정, 다른 단위는 `CUSTOM_UNIT_MISMATCH`(손실). 조회 EP `metrics[].unit`. V82 전 행(unit NULL)은 다음 수신 단위를 채택 |
| 종류·단위를 바꾸는 방법 | — | 규칙을 지우고 다시 등록(새 세대). 🔴 옛 세대 데이터는 조회에서 빠지고, 1시간 해상도에서는 등록 직후 최대 1시간이 비어 보일 수 있다 |
| 폐기 사유 | 2종 | 3종 — `CUSTOM_UNIT_MISMATCH` 추가(i18n kr/en) |

배포: BE·FE를 함께 배포한다. 새 FE+옛 BE는 `count > 0` 폴백이라 0·소수 누락이 그대로고, 옛 FE는 `observed`·`unit`을 쓰지 않는다 — 배포 뒤 브라우저 새로 고침을 안내한다.

---

## 11. 런타임 실측(2026-10-28, dev BE :3000, master `21358d8` 기준)

전용 수신 토큰 `rt-z155` + 시험 서비스 `rt-z155-svc`(AUTO 등록)에 OTLP JSON으로 카운터(`rt.z155.orders`, unit `1`, delta)와 게이지(`rt.z155.depth`, unit `ms`)를 보냈다. 스크립트는 세션 scratchpad `rt_z155.py`.

| 항목 | 결과 |
|---|---|
| 규칙 전 수신 → 폐기 표 | `NOT_ALLOWLISTED`·`METRIC` 행 + `customRule.registrable=true` ✅ |
| 등록 거부 | BUILTIN(`http.server.duration`)·RESERVED(`jvm.rt.custom`)·NOT_OBSERVED·NAME_TRUNCATED(128자)·NAME_INVALID·DUPLICATE(409) 모두 계약 코드 ✅ (`jvm.memory.used`는 내장 허용목록이라 BUILTIN이 먼저 걸림 — 판정 순서대로) |
| 등록 직후 폐기 행 | `RULE_EXISTS` + `ruleId`·`ruleStatus` ✅ |
| 조회 EP | 생성 칸 다음 분부터, 카운터 `valueKind=COUNTER`·unit `1`, 게이지 `GAUGE`·unit `ms`, avg/min/max 정상 ✅ |
| R1 | 증가량 0.2 칸이 `count=0`·`sum=0.2`·`observed=true`로 살아 있음 ✅ |
| R3 | 같은 게이지를 unit `s`로 보내면 `CUSTOM_UNIT_MISMATCH`로 버려지고 저장 값에 섞이지 않음 ✅ |
| 재등록(새 세대) | 규칙 삭제 → 같은 이름 재등록 → 종류·단위 새로 정해 정상 저장 ✅ |
| 규칙 목록 | `valueKind`·`seatServices=1`·budget(활성 2·인스턴스 1 → 2880행/일)·collector patterns ✅ |
| 수집기 설정·설치 가이드 | `filterMetricsExtra`·`customMetrics` 패턴 일치, notices 끝에 `custom-metric-rules-changed` ✅ |
| 끄기/켜기/경고 해제/404 | 끄기 멱등, 꺼진 동안 수신은 `NOT_ALLOWLISTED`(+`ruleStatus=DISABLED`), 켜기·경고 해제 멱등, 없는 id `APM_CUSTOM_METRIC_NOT_FOUND` ✅ |
| 정리 | 규칙 4건 삭제·토큰 회수·서비스 숨김 후 삭제. 폐기 통계 `rt.z155.*` 행은 회수 토큰 보존(180일) 뒤 CASCADE로 사라진다 |

미실측: L5 접힘(`__other__`)·L8 경고(60분 지속)·다중 노드 30초 전파·fail-closed — 단위·IT 테스트가 맡는다.
