# APM 읽기 API 계약 — P1 (2026-08-31, 오케스트레이터 확정본)

> `contract_apm.md` §4로 합류 예정. 그 파일은 BE 에이전트 둘이 §2·§3을 동시에 쓰고 있어 충돌을 피하려고 분리했다. FE(6.11·7.x)와 BE(1.3~1.5·서비스 EP)가 **이 문서를 같이 본다.** 설계 정본 `designs/devdesign_apm.md` §2.2·§8.1, 화면 명세 `designs/devdesign_apm-screens-wbs.md` §3.1~3.4·3.9·3.10.

## 공통
- 전부 `Feature.APM`(`FeatureInterceptor`) + **조회 권한 `apm.view` — 2026-09-03부터 DMOVE 권한 축이다**(기본값 열림, 역할 체크박스로 좁힌다. 축·기본값·FE 소비 키는 §10.5). 응답은 전역 envelope `{status, code, data}`(FE `useDmoveQuery`가 2겹 언랩 → 소비자는 `data` 직접).
- 시간: `from`·`to`는 **ms 에폭**(FE `useApmTimeRange` 기준), `step`은 **초**(60·300·3600 중 하나, 미지정 시 창 길이로 자동: ≤6h→60, ≤7d→300, 그 외 3600). BE는 1m/5m/1h 테이블을 step에 맞춰 고른다.
- 지연은 **ms**(`p50Ms`…), 비율은 **%**(`errorRatePct` 0~100), 처리량은 **rps**(초당). 값이 없는 구간은 `null`(0 아님 — 0은 "요청 0건"이다).
- 시각 필드는 ISO-8601 UTC 문자열(`lastSeenAt`), 시계열 점의 `ts`는 ms 에폭.
- `{uid}` = `service_uid`(UUID). 없으면 body `code: 404, message: APM_SERVICE_NOT_FOUND`.
- `status` enum: `UP | DEGRADED | DOWN | STALE | UNKNOWN`(수집기 끊김). `state` enum: `ACTIVE | PENDING_APPROVAL | HIDDEN`.
- 🔴 **`collectionPausedBy`의 `null`은 "모름"이다**(V62, 2026-09-18). 조용히 적재를 멈추는 스위치라 누가 껐는지를 행에 남긴다 — 로그만으로는 부족했다(PUT은 요청 로그에 남지 않고, 남아도 30일이면 사라진다). V62 이전에 꺼진 것·행위자를 알 수 없던 경로는 `null`이며, 화면이 이를 "시스템이 껐다"로 적으면 거짓이 된다. 재개하면 시각·사람 둘 다 지운다.
- 🔴 **`collecting`은 `state`와 다른 축이다**(V60, 2026-09-17). `state=HIDDEN`은 목록에서 감추기만 하고 데이터는 계속 쌓이고, `collecting=false`는 목록에 남긴 채 적재만 멈춘다 — 네 조합이 모두 실재하므로 한 값으로 접지 말 것. 멈춰도 `lastSeenAt`은 계속 갱신된다(멈춘 것은 적재이지 수신이 아니다). 그래서 **수신은 오는데 저장이 0인 것이 정상인 유일한 경우**이고, 폐기 카운터는 `PENDING`·`REJECTED`가 아니라 전용 사유 `COLLECTION_PAUSED`로 센다. 라이브 스팬도 같은 축으로 거절한다(`serviceCollectionPaused`).

## 1. 서비스 목록/상세
| EP | 응답 `data` |
|---|---|
| `GET /apm/services/overview?from&to&env&includeHidden=false&q` | `{ summary: {total, up, degraded, down, stale, unknown}, services: ServiceRow[] }` |
| `GET /apm/services/{uid}?from&to` | `ServiceDetail` |
| `PUT /apm/services/{uid}` body `{displayName?, description?, tags?: string[], owner?, apdexT?: number(초), slowThresholdMs?, hidden?: boolean, collecting?: boolean, hostNameOverride?}` (관리자) | `ServiceDetail` |
| `DELETE /apm/services/{uid}` (관리자, 숨김 상태에서만 허용 → 아니면 `code 409 APM_SERVICE_NOT_HIDDEN`) | `{deleted: true}` |
| `GET /apm/services/{uid}/instances?from&to` | `InstanceRow[]` |

```ts
type ServiceRow = {
  serviceUid: string; serviceName: string; env: string; displayName: string;
  state: 'ACTIVE'|'PENDING_APPROVAL'|'HIDDEN'; status: 'UP'|'DEGRADED'|'DOWN'|'STALE'|'UNKNOWN';
  collecting: boolean; collectionPausedAt: string|null;   // V60 — state와 다른 축
  collectionPausedBy: string|null;   // V61 — 🔴 null은 '아무도 안 껐다'가 아니라 '모른다'다
  statusReason?: string;                 // 예: "p95 2400ms > 2000ms", "5분 미수신"
  instanceCount: number; versions: string[]; runtimeFamily: 'jvm'|'dotnet'|'node'|'python'|'go'|'unknown';
  firstSeenAt: string; lastSeenAt: string;
  rps: number|null; errorRatePct: number|null; p50Ms: number|null; p95Ms: number|null; p99Ms: number|null;
  activeRequests: number|null; availability24hPct: number|null; apdex: number|null;
  spark: { ts: number[]; rps: (number|null)[]; errorRatePct: (number|null)[]; p95Ms: (number|null)[] }; // 창을 24칸으로 나눈 스파크
  tags: string[]; owner: string|null; instrumented: boolean;   // instrumented=false → "계측 없음" 배지(합성 감시만 있는 서비스, P3)
};
type ServiceDetail = ServiceRow & {
  description: string|null; apdexT: number; slowThresholdMs: number;
  hostName: string|null; hostNameOverride: string|null; zabbixHostId: string|null;   // host.name ↔ Zabbix 호스트 매칭(없으면 null)
  instances: InstanceRow[];
  // 🔴 GET /apm/services/{uid}/alert-rules와 **동일한 결과**(목록·순서·effective까지). 아래 §6 #2·§7.2 #4·10 참조
  alertRules: { ruleUid: string; kind: string; threshold: number; thresholdUnit: string; windowMin: number;
                enabled: boolean; global: boolean;
                effective: boolean;              // 이 규칙이 이 서비스의 이 종류를 **실제로 감시**하는가
                appliedRuleUid: string|null }[]; // 실제로 감시하는 규칙(자기 자신 또는 전역). 아무도 안 돌면 null
};
type InstanceRow = {
  instanceId: string; version: string|null; hostName: string|null; zabbixHostId: string|null;
  firstSeenAt: string; lastSeenAt: string; status: 'UP'|'STALE';
  rps: number|null; errorRatePct: number|null; p95Ms: number|null;
};
```

## 2. RED·엔드포인트·상태코드
| EP | 응답 `data` |
|---|---|
| `GET /apm/services/{uid}/red-series?from&to&step` | `RedSeries` |
| `GET /apm/services/{uid}/endpoints?from&to&sort=p95Ms&order=desc&limit=50&offset=0&q&method /* 2026-09-15 가산: HTTP 메서드 필터(대소문자 무시, q와 AND, otherRoutes는 필터 전 집계). FE 트랜잭션 탭 URL 키는 httpMethod(선택 엔드포인트의 method와 다른 축) */` | `{ total: number; rows: EndpointRow[]; otherRoutes: number }` (`otherRoutes` = `__other__`로 접힌 route 수 → 경고 배지) |
| `GET /apm/services/{uid}/endpoints/series?route&method&from&to&step` | `RedSeries` |
| `GET /apm/services/{uid}/status-codes?from&to&step` | `{ step: number; points: { ts: number; c1xx: number; c2xx: number; c3xx: number; c4xx: number; c5xx: number }[] }` |
| `GET /apm/services/{uid}/methods?from&to` | `{ method: string; requests: number }[]` |
| `GET /apm/services/{uid}/latency-heatmap?from&to&step` | `{ step: number; bounds: number[] /* ms, 정규 경계 */; ts: number[]; cells: number[][] /* [tsIdx][bucketIdx] count */ }` |

```ts
type RedPoint = { ts: number; requests: number; errors: number; rps: number|null; errorRatePct: number|null;
                  p50Ms: number|null; p95Ms: number|null; p99Ms: number|null; activeRequests: number|null; apdex: number|null };
type RedSeries = { step: number; points: RedPoint[]; rebucketed: boolean; sampleWarning: boolean /* 관측 수 적어 백분위 신뢰 낮음 */;
                   mixedBounds: boolean /* 🔴 2026-09-01 신설 — 아래 참고 */;
                   // 🔴 2026-09-02 신설(가산). null = 이 EP는 싣지 않는다 / [] = 이 창에 배포가 없었다 — §11
                   deployments: DeploymentMark[]|null };
type DeploymentMark = { id: number; ts: number /* ms 에폭 */; version: string; source: "AUTO"|"WEBHOOK" };
type EndpointRow = { route: string; method: string; requests: number; rps: number; errorRatePct: number;
                     p50Ms: number|null; p95Ms: number|null; p99Ms: number|null; isOther: boolean };
```

#### 🔴 `mixedBounds` (2026-09-01 신설 — 4차 검수 🔴2 반영, **가산 필드**)

한 버킷에 **접을 수 없는 경계**(서로 부분집합이 아닌 히스토그램 격자)의 관측이 섞여 있었다는 뜻이다.

- 그 칸의 **`p50Ms`·`p95Ms`·`p99Ms`·`apdex`는 `null`**로 나간다. 일부 관측만의 백분위를 전체의 백분위처럼 보여 주지 않기 위해 **일부러 안 내는 것**이다(같은 규칙이 적재에도 있다 — 경계가 어긋난 행은 히스토그램 자체를 NULL로 확정한다).
- **`requests`·`errors`·`rps`·`errorRatePct`는 그대로 정확하다.** 버킷과 무관한 값이라 영향이 없다.
- ⚠️ 플래그는 **시계열 전체에 하나**다(`rebucketed`·`sampleWarning`과 같다). `mixedBounds:true`라도 모든 점의 백분위가 null인 것은 아니고, **섞인 칸만** null이다.
- **FE**: 필드를 몰라도 깨지지 않는다(가산 필드). 다만 지연 차트에 배지를 붙일 거라면 `rebucketed`와 **문구를 달리**해야 한다 — `rebucketed`는 "값이 근사다", `mixedBounds`는 "**값을 내지 않았다**"이다.
- 정상 운영에서는 `false`다. `true`가 뜨는 조건은 (1) 같은 서비스·같은 메트릭을 서로 다른 SDK 격자로 보내는 앱이 섞였을 때, (2) 정규 경계를 바꾼 배포 전후가 한 창에 걸쳤을 때뿐이다.

#### 🔴 `deployments` (2026-09-02 신설 — WBS 3.11, **가산 필드**)

차트에 그을 **배포 세로선**(markLine)이다. 자세한 것은 **§11**에 있고, 여기서 반드시 알아야 할 것은 둘이다.

- **`GET /apm/services/{uid}/red-series`에서만 값이 들어간다.** `endpoints/series`·`instances/series`에서는 **항상 `null`**이다 — 배포는 서비스 단위 사건이라 route·instance 축으로 갈리지 않는다(`activeRequests`가 같은 규칙을 따르는 것과 같은 이유).
- 🔴 **`null`과 `[]`는 다르다.** `null` = "이 EP는 싣지 않는다", `[]` = "서비스 시계열인데 이 창에 배포가 없었다". 같게 취급하면 "배포가 없었다"와 "물어보지 않았다"가 뭉개진다.
- 상한 200개. 넘으면 잘리고 **별도 표시가 없다**(정확한 수·목록은 §11.1 #1이 답한다).

## 3. 런타임·인스턴스 시계열
| EP | 응답 `data` |
|---|---|
| `GET /apm/services/{uid}/runtime?from&to&step&family=jvm` | `RuntimeSeries` |
| `GET /apm/services/{uid}/instances/{instanceId}/series?from&to&step` | `RedSeries` |

```ts
type Series = { name: string; points: { ts: number; value: number|null }[] };   // name = 차원값(예: "heap", "G1 Young Generation", 풀 이름)
type RuntimeSeries = {
  family: 'jvm'|'dotnet'|'node'|'python'|'go'|'unknown'; step: number;
  slots: {                                   // 런타임 대응표(WBS 1.6) — 없는 슬롯은 키 자체가 없다
    memoryUsed?: Series[]; memoryLimit?: Series[]; memoryCommitted?: Series[];   // jvm.memory.type별(heap/non_heap)
    gcDurationMs?: Series[]; gcCount?: Series[];                                  // jvm.gc.name별(구간 합)
    threads?: Series[]; cpuUtilizationPct?: Series[]; classCount?: Series[];
    poolActive?: Series[]; poolIdle?: Series[]; poolPending?: Series[]; poolMax?: Series[]; poolWaitP95Ms?: Series[];  // 풀 이름별
    processCpuPct?: Series[]; processMemoryBytes?: Series[];                       // 비-JVM
  };
};
```

## 4. APM 개요(메뉴 1)
`GET /apm/overview?from&to&env` →
```ts
{
  summary: {total, up, degraded, down, stale, unknown};
  totals: { rps: number|null; errorRatePct: number|null; p95Ms: number|null; activeRequests: number|null;
            prev: { rps, errorRatePct, p95Ms, activeRequests } };        // 직전 동일 길이 창(ApmTimeRange.previous() = from−span ~ to−span). "전일 동시간"이 아니다 — 24시간 창일 때만 우연히 일치
  heatmap: { services: {serviceUid, displayName}[]; ts: number[]; cells: (number|null)[][] /* [svcIdx][tsIdx] = errorRatePct */ ; step: number };
  slowestTop5: { serviceUid, displayName, p95Ms }[]; errorTop5: { serviceUid, displayName, errorRatePct }[];
  recentAlerts: { eventId: number; serviceUid: string|null; displayName: string|null;
                  kind: string;            // 🔴 §6-2의 계약 enum. 저장 표기가 아니다(A23)
                  thresholdUnit: 'pct'|'ms'|'min'|'count'|'ratio'|'';   // value의 단위. 모르는 kind면 ''
                  value: number|null; firedAt: string; resolvedAt: string|null }[];
}
```
🔴 **`recentAlerts[].kind`는 2026-09-01(A23)부터 계약 표기다.** 그 전에는 `apm_alert_rule.kind`의
**저장 표기**가 그대로 나가서, 옛 표기(`LATENCY_P95`·`COLLECTOR_SEND_FAILED`)로 저장된 행이 있으면
같은 이벤트가 개요와 알람 화면에서 **다른 문자열**로 보였다 — FE는 이 값으로 색·아이콘을 고르므로
에러 없이 기본값으로 떨어진다. 같은 변경에서 **`thresholdUnit`을 동봉**한다(FE 요청): `value`가
`12.5`일 때 그것이 %인지 ms인지 배수인지는 kind가 정하고, 그 표를 FE에 복제하면 종류가 늘 때마다
두 곳이 갈린다. 🔴 **모르는 kind에는 단위를 지어내지 않고 빈 문자열**을 준다.
⚠️ `serviceUid`·`displayName`은 **수집기 축 알람**(`COLLECTOR_FAILURE`)이나 지워진 서비스에서 `null`이다.

## 5. 상태 판정(1.4) — BE·FE 공통 이해
- 최근 `stale_minutes`(기본 5) 안에 수신 없음 → `STALE`(배포 후 10분 grace: 새 `service.version` 인스턴스 첫 수신 후 10분은 STALE 제외). 수집기(토큰의 마지막 Collector)가 STALE이면 `UNKNOWN`.
- 수신 있음 + (5분 창 오류율 > 임계 `default_error_rate_pct` 또는 p95 > `default_p95_ms`, 서비스별 덮어쓰기 우선) → `DEGRADED`, `statusReason`에 근거.
- `DOWN`은 P3 합성 감시 바인딩 실패 시에만. 그 외 `UP`.
- `availability24hPct` = **24h 창의 5분 칸을 위 판정으로 세어**, `UP`+`DEGRADED` ÷ **판정된 칸**.
  즉 `availability` 시계열과 **같은 판정**이다(§6 #1 "시계열에서 파생"). 세 가지가 규약이다:
  - **`DEGRADED`는 깎지 않는다** — 느려도 응답한 시간은 가용이다.
  - **`STALE`은 깎는다** — 분모에 들어가고 분자에서 빠진다.
  - 🔴 **`UNKNOWN`은 분모에서 뺀다.** 수집기가 끊긴 구간은 **앱의 책임이 아니다** — 판정할 근거가 없는
    시간을 다운타임으로 세면 수집기 사고 한 번이 전 서비스의 가용성을 통째로 떨어뜨린다.
    같은 이유로 A28의 **`status` 생략 칸**(보존 밖이라 답할 수 없는 칸)도 분모에서 뺀다.
  - 판정된 칸이 하나도 없으면(전부 `UNKNOWN`/생략) **0%가 아니라 `null`(모름)**이다.
  ⚠️ 2026-09-01(3차 검수 4번) 이전 구현은 **1m 수신 여부만** 셌다 — `UNKNOWN` 칸이 분자만 잃어
  "수집기가 끊긴 것"이 "앱이 죽어 있던 것"으로 찍혔고, 노란 칸(DEGRADED)이 있어도 100%였다.
- `apdex` = (satisfied + tolerating/2) / total, T = `apdexT`(기본 0.5s): satisfied ≤ T, tolerating ≤ 4T — 히스토그램 버킷 보간.

🔴 **가용성 스트립의 보존 처리 (2026-09-01, A28).** `availability`는 원시 수신 여부를 `apm_metric_1m`에서
읽는데 그 테이블은 **7일**만 산다. 전에는 그 밖의 창을 물으면 수신 행이 한 줄도 안 나와 구간 전체가
`STALE`/`UNKNOWN`으로 칠해졌다 — "데이터가 지워졌다"를 "그때 죽어 있었다"로 그린 셈이다. 이제:
- 창 시작이 1m 보존 밖이면 **5m → 1h로 승격**해 읽고, 롤업 지연으로 비는 **최근 30분은 1m으로 덧댄다**
  (5m은 닫힌 버킷만 LAG 2분을 두고 채워 최소 7분, 최악 12분 뒤처진다).
- 🔴 **꼬리는 수신 여부만이 아니라 HTTP 집계(오류율·p95)도 1m으로 덧댄다** (2026-09-01, 3차 검수 1번).
  수신만 덧대면 꼬리 칸의 HTTP 집계가 비어 **임계를 넘긴 구간이 `UP`으로** 나갔다 — 가장 주의해서
  봐야 할 자리를 정확히 초록으로 칠하는 오류다. 꼬리 시작은 **칸 격자에 맞춰 내리고**, 그 구간의
  상위 롤업 행은 1m 행으로 **대체**한다(합치면 같은 요청을 두 번 센다).
- **답할 수 없는 칸은 `status` 키가 아예 없다.** 두 경우다: ① 읽는 단의 버킷이 칸보다 굵다
  (1시간 단으로 5분 칸을 물으면 "그 5분에 왔나"에 답할 수 없다 — `step`을 60으로 주고 8일 전을 보는
  경우도 같다) ② 그 단의 보존(최대 400일)마저 넘었다.
- ⚠️ **`UNKNOWN`으로 채우지 않는다.** `UNKNOWN`은 이미 **관측 결과**(수신이 없었고 그때 수집기도
  조용했다)라 같은 값으로 칠하면 화면이 다시 거짓말을 한다. FE는 이 칸을 **회색이 아니라 빈칸/빗금**으로
  그리고, 화면에서 퍼센트를 계산한다면 **분모에서 빼야** 한다.
- `step`은 요청 그대로다(승격되는 것은 "어느 테이블을 읽나"이지 칸 폭이 아니다 — x축이 흔들리면 안 된다).

## 6. FE 계약 요청 반영 (2026-08-31, G1 보고 → 오케스트레이터 결정)
| # | 요청 | 결정 |
|---|---|---|
| 1 | 버킷별 가용성 시계열 | **추가** `GET /apm/services/{uid}/availability?from&to&step` → `{ step, points: { ts, status?: 'UP'|'DEGRADED'|'STALE'|'DOWN'|'UNKNOWN' }[] }` (5분 버킷 판정 §5 그대로). `availability24hPct`는 이 시계열에서 파생. 🔴 **`status` 키가 없는 칸이 있다** — 아래 A28 |
| 2 | `alertRules[].kind` | **enum 고정** `ERROR_RATE`(threshold=%) · `P95_LATENCY`(threshold=ms) · `STALE`(threshold=분) · `COLLECTOR_FAILURE`(threshold=건) · `ACTIVE_REQUESTS_SPIKE`(threshold=배수) · `SLO_BURN`(P3) · `STUCK_REQUEST`(threshold=ms, 2026-09-23 — 요청 걸림, 창 없음). `thresholdUnit: 'pct'|'ms'|'min'|'count'|'ratio'` 필드 동봉. 🔴 `ServiceDetail.alertRules`도 **같은 함수가 만든다**(§7.2 #10) |
| 3 | `latency-heatmap` arity | `cells[tsIdx].length === bounds.length + 1` (**마지막 = +∞ 오버플로 버킷**, 정규 경계 규약과 동일) |
| 4 | env/tag 옵션 | overview 응답에 **필터 무관 전량** `envs: string[]`·`tags: string[]` 추가 |
| 5 | `endpoints.sort` | 허용 `requests|rps|errorRatePct|p50Ms|p95Ms|p99Ms`, 기본 `p95Ms desc`. 그 외 값 → `code 400 APM_INVALID_SORT` |
| 6 | 목록 `q` | BE도 `displayName·serviceName·env` 부분 일치(대소문자 무시). FE 클라이언트 필터와 동일 |
| 7 | `spark` 길이 | 4배열 길이 **동일·24** 보장(창을 24등분, 값 없으면 null) |
| 8 | `instances` 중복 | `ServiceDetail.instances` == `GET .../instances`(같은 from/to)의 값. 상세는 그것을 쓰고 인스턴스 탭만 별도 EP |

---

## 7. 구현 상태 (2026-08-31, BE `premium/apm/overview` + `premium/apm/service` + `premium/apm/core/query`)

작업 위치: `C:\worktrees\apm-be-schema`(미커밋). 신규 패키지 2개만 추가했고 기존 파일 수정은 §7.3에 전부 적었다.
테스트 **355 green**(신규 101 = 단위 87 + IT 14, skip 0). 계약 표본 JSON은 `src/test/resources/apm/contract/*.json` 8종 — FE 픽스처와 그대로 대조 가능하다.

### 7.1 EP 구현 표

| EP | 상태 | 비고 |
|---|---|---|
| `GET /apm/services/overview` | ✅ | `envs`·`tags`(§6 #4) 포함. 승인 대기(PENDING_APPROVAL)는 목록에서 제외 |
| `GET /apm/services/{uid}` | ✅ | 없는 uid → **HTTP 200 + body `code 404` `APM_SERVICE_NOT_FOUND`** |
| `PUT /apm/services/{uid}` | ✅ | 관리자. 🔴 **부분 수정**(null=유지, `""`·`[]`=삭제) |
| `DELETE /apm/services/{uid}` | ✅ | 관리자. 숨김 아니면 **200 + `code 409` `APM_SERVICE_NOT_HIDDEN`** |
| `GET .../instances` | ✅ | §6 #8 — 상세의 `instances`와 **같은 함수**가 만든다(MVC 테스트가 두 응답을 대조) |
| `GET .../availability` | ✅ | §6 #1 신규 |
| `GET .../red-series` | ✅ | 빈 버킷도 점을 채운다(`requests:0`, 지연 `null`) |
| `GET .../endpoints` | ✅ | §6 #5 sort 검증 → 위반 시 **200 + `code 400` `APM_INVALID_SORT`** |
| `GET .../endpoints/series` | ✅ | ⚠️ `activeRequests`는 **항상 null**(§7.2-5) |
| `GET .../status-codes` | ✅ | |
| `GET .../methods` | ✅ | |
| `GET .../latency-heatmap` | ✅ | `cells[i].length === bounds.length + 1`(§6 #3) 보장 |
| `GET .../runtime` | ⚠️ | JVM만 실제로 채워진다(§7.2-7) |
| `GET .../instances/{instanceId}/series` | ✅ | 창이 7일 넘으면 **빈 시계열**(§7.2-6) |
| `GET /apm/overview` | ✅ | 히트맵은 목록 스파크와 **같은 24칸**을 쓴다 |

권한: 클래스 `@RequiresFeature(Feature.APM)`(ArchUnit A2 통과) · 읽기=로그인 사용자 · 쓰기(PUT·DELETE)=`AdminAccessChecker.requireAdmin` · 거부는 200 + `code 403`.

### 7.2 계약 변경 요청 · 명확화 (FE 확인 필요)

1. **`latency-heatmap`에 `rebucketed: boolean` 추가**(가산적). 창 안에서 경계가 섞이면 지배적 경계로 보간해 접고 이 값을 세운다. FE는 무시해도 되지만 배지를 띄우는 편이 정직하다.
2. 🔴 **`endpoints.otherRoutes` 의미 정정.** "접힌 원본 route의 **수**"는 **저장되지 않는다** — 적재가 초과분을 전부 `__other__` 한 값으로 접기 때문이다(`ApmDimsNormalizer`). 그래서 이 필드는 **`__other__` 행의 수**(보통 0 또는 method 수)다. "몇 개가 접혔나"가 필요하면 `apm_ingest_drop_stat`의 `ROUTE_OVERFLOW` 카운터를 노출하는 별도 EP가 필요하다.
3. `endpoints.sort`에 **`route`는 없다**(§6 #5 목록 그대로) → `route`로 정렬 요청 시 400. FE가 route 정렬 UI를 두었다면 클라이언트 정렬로 처리해야 한다.
4. `alertRules[].kind`는 **DB 값이 아니라 계약 enum**이다(`LATENCY_P95`→`P95_LATENCY`, `COLLECTOR_SEND_FAILED`→`COLLECTOR_FAILURE`). DB 상수·알람 잡은 그대로 두고 경계에서만 번역한다(`ApmAlertKinds`). 모르는 종류는 원문 통과 + `thresholdUnit: ""`.
5. 🔴 **`endpoints/series`의 `activeRequests`는 항상 `null`이다.** `http.server.active_requests`의 허용 차원은 `http.request.method`뿐이라 route 축이 없다. 전 서비스 값을 붙이면 "이 엔드포인트의 동시 요청"으로 오해되므로 붙이지 않았다.
6. 🔴 **인스턴스 지표는 1m 보존(7일) 안에서만 나온다.** 5m·1h는 서비스 합산이라 인스턴스 축이 없다(V38 §4). 창이 넘으면 `InstanceRow`의 `rps`·`errorRatePct`·`p95Ms`는 `null`, 인스턴스 시계열은 빈 배열이다(0이 아니다).
7. 🔴 **비-JVM 런타임 슬롯은 표만 있고 데이터가 오지 않는다.** `RuntimeSlotMap`에 .NET·Node·Python·Go 매핑을 OTel 규약 기준으로 적어 두었으나, 그 메트릭 이름들이 **수신 허용목록(`ApmMetricAllowlist`)에 없어** 저장 자체가 안 된다. 비-JVM 지원은 허용목록 확장이 선행돼야 한다(`RuntimeSlotMapTest`가 이 사실을 고정한다). 공통 `process.cpu.utilization`·`process.memory.usage`만 저장되며, 자바 에이전트는 그 둘을 내지 않는다(R1 §2.4).
8. **Node에 event loop 슬롯이 계약에 없다** — `nodejs.eventloop.delay`·`utilization`은 Node 진단의 핵심인데 `RuntimeSeries.slots`에 자리가 없다. Node를 실제로 지원할 때 계약 확장이 필요하다.
9. **`availability24hPct`가 `null`인 조건**: "롤업 전"이 아니라 ① **서비스 존재 기간이 5분 한 칸도 안 될 때**(방금 등록된 서비스에 24h 분모를 씌우면 잘못 없이 2%가 찍히므로 `firstSeenAt` 이후만 분모로 센다) 또는 ② **판정된 칸이 하나도 없을 때**(24시간 내내 수집기가 조용해 전부 `UNKNOWN` — 2026-09-01 추가). 둘 다 "0%"가 아니라 "모름"이다.
10. **`/apm/overview`의 `totals` 모집단은 `summary`와 다르다.** `summary`는 목록과 같은 모집단(숨김·승인대기 제외)이고, `totals`는 **숨김 포함 전체**다 — "전체 rps"는 실제로 들어오는 트래픽이어야 하고 목록에서 숨겼다고 트래픽이 사라지지는 않는다.
11. **응답 `step`이 요청 `step`과 다를 수 있다.** 창이 그 해상도의 보존(1m=7일·5m=30일)을 넘으면 상위 테이블로 승격한다 — 앞 구간이 조용히 빈 그래프를 주지 않기 위해서다. FE는 x축 간격을 **응답의 `step`**에서 읽어야 한다.
12. **`recentAlerts`는 창 안에 발화한 것만**이다(창 이전에 발화해 아직 열린 알람은 안 나온다). P1에 알람 잡이 없으면 빈 배열이다.
13. 🔴 **`ServiceDetail.alertRules`는 `GET /apm/services/{uid}/alert-rules`와 같은 결과다**(2026-09-01, A22 후속). 만드는 술어가 `ApmAlertService#forService` **한 곳**이라 두 화면이 다른 규칙을 보일 수 없다. 따라오는 두 가지:
    - ⚠️ **같은 `kind`가 두 줄**일 수 있다 — 정확히 "서비스별 규칙을 꺼 둔 종류"에서만. 꺼진 규칙(`effective:false`, 표시용)과 실제로 도는 전역 규칙(`effective:true`)이 함께 나오고, 실제로 도는 쪽이 먼저다. 꺼진 규칙을 감추면 사용자가 그것을 **다시 켤 방법을 화면에서 잃는다**.
    - ⚠️ **`COLLECTOR_FAILURE`는 이 목록에 없다** — 수집기 축은 서비스가 잘못한 것이 아니라 서비스 화면에 뜨지 않는다. (그 전 상세 응답에는 실릴 수 있었다.)
    - ⚠️ 그 전에는 상세만 **활성 여부를 무시하고** 서비스별 규칙으로 전역을 덮어, **꺼 둔 규칙 뒤에서 실제로 감시하던 전역 규칙이 상세에서만 사라졌다**.

### 7.3 기존 파일 수정 (신규 패키지 외)

| 파일 | 수정 | 사유 |
|---|---|---|
| `engine-api/.../common/exception/ErrorCode.java` | `APM_SERVICE_NOT_FOUND`·`APM_SERVICE_NOT_HIDDEN`·`APM_INVALID_SORT` 3개 추가 | 계약이 요구하는 오류 코드가 없었다 |
| `premium/apm/core/domain/ApmService.java` | `applySettings(...)` 메서드 1개 추가 | PUT의 부분 수정. 엔티티에 세터가 없어 상태 변경 경로가 필요했다(`hide`/`unhide`는 그대로 씀) |

### 7.4 구현 노트 (검수용)

- **히스토그램 벡터 합은 SQL 컬럼 전개**다: `sum(hist_counts[1]) … sum(hist_counts[24])`. `unnest with ordinality`(행 15배 폭발)·자바 합산(카디널리티 비례 전송, 6h RED가 16만 행)보다 빠르고, 범위 밖 첨자가 NULL이라 길이가 다른 패밀리가 섞여도 안전하다. 대가는 **폭 상한 24칸**(정규 경계 최대는 `pool_ms` 16칸) — 넘으면 경고 로그 + `truncated` 플래그. 메인 트리의 V40 `apm_int_array_sum`에는 **의존하지 않는다**.
- 🔴 **IT가 잡은 실제 버그**: 칸 인덱스를 `floor((extract(epoch from bucket_start)*1000 - fromMs)/cellMs)`로 짰더니 KST에서 **540칸(9시간)** 밀렸다 — PG는 TZ 없는 `timestamp`의 epoch를 UTC로 계산하고 자바(`ApmTimeRange`)는 시스템 시간대를 쓴다. `extract(epoch from (bucket_start - 창시작))`(차이)로 고쳤다. 단위 테스트로는 안 보이고 증상이 "그래프가 통째로 빔"이라 데이터 없음으로 오해된다.
- **가용성·상태 판정은 `apm_metric_1m`을 읽는다**(결선 에이전트 주의 (a) 반영). 5m은 LAG 2분 + 닫힌 버킷만이라 최근 ~7분이 비어 있고, 그것으로 세면 모든 서비스가 항상 마지막 칸만 죽어 보인다. 24h × 1m 스캔 비용은 **5분 격자 캐시 키**로 상환한다(TTL이 아니라 키가 신선도를 보장).
- **수집기 센티널(`service_id = 0`)은 모든 조회에서 제외**한다(주의 (b)). 배치는 `sanitize()`로 걸러 내고 단일 서비스 질의는 빈 결과를 준다 — IT가 실증.
- **Zabbix 호스트 링크**는 `AssetService`(DB 전용) 경유 + 5분 캐시다. `AssetRepository` 직접 참조는 ArchUnit A3 위반이고, Zabbix 직격은 매 렌더마다 전건 로드를 부른다. 자산 검색이 `ILIKE` 부분일치뿐이라 **자바에서 정확일치만 채택**한다 — 부분일치를 쓰면 `api`가 `api-gateway`에 붙는 조용히 틀린 링크가 생긴다(없는 링크보다 나쁘다).
- **미검증**: 실 데이터 성능(6h/1m RED, 서비스 20개 목록)은 측정하지 않았다. 브라우저 렌더도 미실시.

## 8. 수집기 화면 API (WBS 0.10·0.11·7.9 — 2026-08-31 오케스트레이터 확정본, BE 구현 전)
토큰·설정·승인·`ingest/recent`는 `contract_apm.md` §2에 이미 있다. 여기는 그 위에 얹는 것만. 전부 관리자(`AdminAccessChecker`), `Feature.APM`.

| EP | 응답 `data` / 비고 |
|---|---|
| `GET /apm/collectors` | `CollectorRow[]` — `apm_collector` 전량(토큰 라벨 조인). `status: 'UP'|'STALE'`(마지막 수신 `stale_minutes` 기준) |
| `GET /apm/collectors/{id}/series?from&to&step` | `{ step, points: { ts, acceptedMetricPoints, acceptedSpans, acceptedLogRecords, sentMetricPoints, sendFailed, queueSize }[] }` — 센티널 `service_id=0`·`instance_id=collector_instance_id` 행에서 `otelcol_receiver_accepted_*`(구간 증분)·`otelcol_exporter_sent_*`·`otelcol_exporter_send_failed_*`·`otelcol_exporter_queue_size`(구간 max). 없는 값 null |
| `POST /apm/collector-config` body `{ tokenId: number; endpoint: string /* https://host[:port] — BE가 "/apm/otlp"를 붙인다 */; slowMs?: number(2000); normalPct?: number(2); memoryLimitMib?: number(512); queueDir?: string; keepRawSql?: boolean(false); os: 'windows'|'linux'|'macos' /* macos 2026-09-15 가산 */; processors?: ProcessorOptions /* 2026-09-15 가산 → §8.9 */ }` | **`text/yaml`**, `Cache-Control: no-store`. 🔴 토큰 원문은 서버에 없다(해시만) → 응답 yaml의 `Authorization: "Bearer ${RECEIVE_TOKEN}"`는 **자리표시**로 남기고 `X-Apm-Token-Placeholder: RECEIVE_TOKEN` 헤더 + 본문 상단 주석으로 "발급 시 복사한 토큰을 넣으세요" 안내. 단, **발급 직후 같은 요청에서** 만들 수 있게 `POST /apm/receive-tokens`(§2)에 `withConfig?: {...위 옵션}`을 받아 `{ token, endpoint, configYaml }`을 1회 응답으로 돌려주는 옵션을 추가한다(원문을 두 번 노출하지 않음). `keepRawSql=true`면 `transform/sql` 프로세서를 빼고 응답 헤더 `X-Apm-Warning: raw-sql` + 감사 로그. 템플릿 정본 `moveseye-be-spring/src/main/resources/apm/collector-template.yaml`(`${...}` 치환) |
| `GET /apm/collectors/config-defaults` **(2026-09-01 신설)** | `{ queueDir: { linux: string; windows: string; macos: string /* 2026-09-15 가산 */ }; downloadBaseUrl: string; slowMs: number; normalPct: number; memoryLimitMib: number; endpointHint: string }` — 설정 생성 폼의 **서버 정본 기본값**. 🔴 **FE가 기본값을 다시 하드코딩하지 않게** 서버가 내려 준다. 관리자, `Feature.APM`. 상세는 §8.6 |
| `GET /apm/install-guide?os=windows|linux|macos&stack=…&installDir&configDir&queueDir&agentDir /* 경로 4개 선택, §8.10 */` (구: `?os&stack=java|dotnet|node|python|go`) | `{ collector: { version: '0.159.0', downloadUrl, steps: Step[] }, app: { stack, steps: Step[], envVars: {name, value, note}[] }, verify: Step[] }` · `Step = { title, command?: string, note?: string }`. Java env 권고: `OTEL_SERVICE_NAME`·`OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector>:4317`·`OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=<env>,service.version=<ver>`·`OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`·`OTEL_SEMCONV_STABILITY_OPT_IN=database`·javaagent 2.31.1 다운로드 URL. Windows 명령은 **PowerShell 5.1 단일**(2026-09-01 D6 — `sc.exe`가 아니라 `New-Service`, nssm 미가정). 🔴 다중 Collector 금지 문구(설계 §3.2) 포함. **2026-09-07: 최상위 `references[]` + 각 `Step`·`EnvVar`·`Notice`의 `refs[]` 가산 → §8.8**. **2026-09-15: `os=macos` 가산** — LaunchDaemon(plist·`launchctl bootstrap`) 등록, 경로 `/usr/local/{bin,etc/moveseye,var/moveseye/otelcol-queue,var/log/moveseye}`, 데몬이 root로 돌므로 설정 600·큐 700으로 잠금, 다운로드는 `uname -m`으로 darwin_{arm64|amd64} 선택(`downloadUrl` 필드는 arm64 고정), 출처 `apple-launchd-daemon`. 별칭 `mac`·`darwin`·`osx`도 macos로 읽는다. 앱 계측 단계는 리눅스와 동일. **같은 날 포트 가이드 가산**: 안내 `ports`(앱→Collector 4317/4318 인바운드, Collector→MovesEye 아웃바운드 HTTPS, 13133은 127.0.0.1 전용) + 세 OS 모두 `collector.ports` 단계(큐 디렉터리 다음·서비스 등록 앞 — 듣는 프로세스 확인 명령 + 방화벽 열기 + 충돌 시 `receivers.otlp.protocols.*.endpoint`·`extensions.health_check.endpoint` 변경과 앱 ENDPOINT 동기화 안내) + `verify.collector-health`에 `address already in use` 판독. 포트 상수 `ApmInstallVersions.OTLP_GRPC_PORT/OTLP_HTTP_PORT/HEALTH_CHECK_PORT`는 템플릿 yaml과 테스트로 대조. 출처 `ms-new-netfirewallrule` 추가 |
| `GET /apm/ingest/drops?tokenId&from&to` | `{ rows: { reason: DropReason; metricName: string|null; count: number; lastSeenAt: string; signal: 'METRIC'|'TRACE'|'LOG' }[]; routeOverflow: { serviceUid, displayName, count }[] }` — 🔴 `signal`은 2026-09-02 추가(스팬 폐기와 데이터포인트 폐기가 한 줄로 합산되던 것을 갈랐다. 축이 생기기 전 행은 `METRIC`으로 읽힌다) — `apm_ingest_drop_stat` + ROUTE_OVERFLOW 서비스별(§7.2-2 해소). 🔴 `from`·`to`는 **서로 독립**이다(§8.2-1, A26) |
| `GET /apm/services/{uid}/endpoints` | **`sort=route` 허용 추가**(FE 요청) — 서버 정렬 |

```ts
type CollectorRow = { id: number; tokenId: number; tokenLabel: string; collectorInstanceId: string; version: string|null;
                      lastSeenAt: string; status: 'UP'|'STALE'; queueSize: number|null; sendFailedTotal: number|null; samplingDroppedTotal: number|null };
type DropReason = 'NOT_ALLOWLISTED'|'ROUTE_OVERFLOW'|'REBUCKETED'|'RAW_BOUNDS'|'UNKNOWN_SERVICE'|'PENDING'|'REJECTED'|'COLLECTION_PAUSED'|'CUMULATIVE_FIRST_SKIPPED'|'SIGNAL_NOT_SUPPORTED';
// 🔴 `COLLECTION_PAUSED`(V60)는 **사용자가 일부러 끈 것**이다. 저장 안 된 것은 맞지만
//    화면의 "잃은 건수"에는 넣지 않는다 — 고칠 원인이 없는 숫자가 되어 없는 장애를 쫓게 한다.
//    표에는 사유 한 줄로 남기고 색만 중립으로 둔다.
// ⚠️ BE 열거는 이보다 넓다(`BOUNDS_CONFLICT`·`RAW_SQL_BLOCKED`·`RUM_*`). FE는 모르는 값이 와도
//    원문을 그대로 띄우고 죽지 않는다.
// 🔴 RAW_BOUNDS는 2026-09-01(D2) 신설 — **손실이 아니다**. 수신 격자가 정규 격자보다 성겨서
//    접으면 분포를 날조하게 되므로 **수신 격자 그대로 저장**했다는 표시다(값은 다 들어갔고
//    백분위 해상도만 낮다). FE 라벨: "원본 격자 유지" 계열 문구 + ROUTE_OVERFLOW·REBUCKETED와
//    같은 '변형' 묶음으로 보일 것 — '폐기' 묶음에 넣으면 사용자가 데이터가 사라진 줄 안다.
```

---

### 8.1 구현 상태 (2026-08-31, BE `premium/apm/collector`)

작업 위치: `C:\solutions\moveseye-be-spring` 메인 트리(미커밋). 신규 패키지 1개(`premium/apm/collector`)를 추가했고 기존 파일 수정은 §8.4에 전부 적었다.
테스트 **신규 87**(단위 80 + IT 7, skip 0) — 전체 `:test` **2051 green / 0 skip / 0 fail**.

| EP | 상태 | 비고 |
|---|---|---|
| `GET /apm/collectors` | ✅ | 회수된 토큰의 수집기도 STALE로 남는다(목록에서 지우면 "내가 방금 무엇을 끊었나"를 못 본다). 정렬 = UP 먼저 → 최근 수신순 |
| `GET /apm/collectors/{id}/series` | ✅ | 없는 id → **200 + `code 404` `APM_COLLECTOR_NOT_FOUND`** |
| `POST /apm/collector-config` | ✅ | `text/yaml;charset=UTF-8` + `Cache-Control: no-store` + `Content-Disposition: attachment; filename="config.yaml"` |
| `POST /apm/receive-tokens` `withConfig` | ✅ | 응답 `ApmTokenIssuedDto.configYaml`(원문 토큰이 채워진 완성본). 없으면 `null` |
| `GET /apm/install-guide` | ✅ | os×stack 10조합 전수 테스트 |
| `GET /apm/ingest/drops` | ✅ | `ApmIngestStatusController`(`/apm/ingest`)에 얹었다 |
| `GET /apm/services/{uid}/endpoints?sort=route` | ✅ | 서버 정렬(대소문자 무시, method로 동점 처리). `ALLOWED_SORTS`에 `route` 추가 |

권한: 클래스 `@RequiresFeature(Feature.APM)` + **전부 `AdminAccessChecker.requireAdmin`**(조회 API와 달리 운영자에게 열지 않았다 — 토큰이 붙은 설정 파일과 설치 절차라서). 거부는 200 + `code 403`.

- 🔴 **앱 재기동 후 서비스 목록에 뜨기까지의 정본은 "1~2분"이다** (2026-09-01). 근거는 에이전트의
  OTLP export 주기(기본 60초) + 우리 1분 버킷이 닫히는 시간이며, `GET /apm/install-guide`의
  `app.restart` 문구가 그 근거까지 함께 말한다. ⚠️ **FE 온보딩 화면의 "60초 안에"는 export 주기만
  센 값이라 더 짧다** — 같은 사실을 두 숫자로 말하면 사용자는 90초에 "안 된다"고 판단한다.
  FE 문구 교체는 별건이며, 여기서는 **어느 쪽이 정본인지만** 못 박는다.
- 🔴 **Java 자동계측 에이전트 경로는 OS별로 다르고, 내려받는 곳과 `-javaagent`가 같아야 한다**
  (2026-09-01 수정). Linux `/opt/otel/opentelemetry-javaagent.jar` ·
  Windows `C:\ProgramData\moveseye\otel\opentelemetry-javaagent.jar`. 예전 가이드는 현재 디렉터리에
  받고 `/opt/otel/`을 가리켜, 그대로 붙여 넣으면 JVM이 기동 자체에 실패했다(Windows에도 리눅스 경로가
  나갔다). ⚠️ 경로는 **큐 디렉터리 프로퍼티에서 파생하지 않는다** — 큐를 다른 볼륨으로 옮긴 고객의
  앱이 안 뜨게 된다.
- 🔴 **`notices`에 항목 2개가 늘었다 — `postgres-tuning`(WARNING) · `capacity-planning`(INFO)**
  (2026-09-01, R3 §9.1 O1). 응답 shape는 그대로다(`{ code, level, text }[]`) — **FE는 렌더링만 하므로
  변경 없음**. 다만 두 항목은 **Collector가 아니라 MovesEye 서버의 Postgres** 이야기라서, 화면이
  notices를 "수집기 설치 주의사항"으로 묶어 놓았다면 제목을 중립적으로("설치 전 확인") 두는 편이 낫다.
  - `postgres-tuning`: `work_mem = 64MB` · `shared_buffers = RAM 25%` · `maintenance_work_mem = 1GB` ·
    `max_wal_size = 4GB`. 🔴 **R3 실측에서 조회 플랜을 뒤집은 것은 `work_mem` 하나였다** — `order by`를
    걷어내도, 히스토그램 전개 폭을 24→15로 줄여도 플랜은 Sort+GroupAggregate 그대로였고,
    `work_mem`을 4MB→64MB로 올리자 HashAggregate로 바뀌며 스필이 사라졌다(6h RED 251 ms → 186 ms).
  - `capacity-planning`: 1m 테이블 **행당 686 B**(인덱스 포함, 설계 초안 150 B의 4.6배) ·
    서비스 10 · 인스턴스 3 · route 50 → 약 1,400만 행/일 = **9.6 GB/일**, 7일 **67 GB**, 3단 **109 GB**.

### 8.2 계약 변경·명확화 (FE 확인 필요)

1. 🔴 **`drops`의 `count`는 누적이고 `from`·`to`는 `lastSeenAt` 필터다.** `apm_ingest_drop_stat`은 `(token_id, reason, metric_name, signal)`당 **한 행에 누적**하는 카운터라 시간축이 없다. 창을 좁혀도 숫자는 줄지 않고, 대신 "그 창에도 **여전히 일어나는가**"가 걸러진다. 화면 문구가 이 차이를 흐리면 사용자는 그것을 버그로 읽는다.
   - 🔴 **두 경계는 서로 독립이다 — 없는 쪽은 그 방향으로 무한이다** (2026-09-01 A26에서 정정).
     `from`·`to`를 **둘 다 생략하면 무필터**, `to`만 주면 **그 시각 이전 전부**, `from`만 주면
     **그 뒤로 전부**다. 그 전에는 하나라도 오면 `ApmTimeRange`가 빠진 쪽을 채워, `to`만 준 호출이
     조용히 **"그 시각 기준 최근 1시간"**이 되어 누적 카운터의 대부분을 지운 표를 "폐기 없음"처럼
     보여 줬다(둘 다 생략한 경우만 막아 둔 방어가 한쪽만 준 경우에는 뚫려 있었다).
   - ⚠️ **뒤집힌 창(`from >= to`)은 보정하지 않는다** — 빈 표가 나가고 서버 로그에 WARN이 남는다.
     여기서 기본 창으로 접는 것이 바로 위의 그 버그다.
2. 🔴 **`routeOverflow`를 위해 적재 측을 고쳤다**(§8.4). 계약 초안의 `http.route@<service_uid>` 대신 **`<metric>@svc:<serviceId>`**(숫자 id)로 저장한다 — `metric_name`이 `varchar(128)`이고 UNIQUE 키의 일부라 UUID(36자)를 넣으면 이름이 긴 조합에서 접두가 잘려 서로 다른 사건이 한 행으로 뭉친다. uid·표시명은 조회 시점에 `apm_service`에서 되찾는다. **저장 접미는 응답에 새어 나가지 않는다**(`rows[].metricName`은 접미를 뗀 값).
   - ⚠️ **규약 도입 전에 쌓인 행은 서비스를 알 수 없어 `routeOverflow`에 안 나온다**(`rows`의 총량에는 그대로 남는다). 삭제된 서비스도 같다 — 없는 이름을 지어내지 않는다.
3. **`collectors/{id}/series`의 `step`은 요청과 다를 수 있다.** 수집기 축(`instance_id`)은 `apm_metric_1m`에만 있어(5m·1h는 서비스 합산) **1분 행을 요청 step으로 접어** 만든다. 점이 2016개(7일×5분)를 넘으면 칸을 넓힌다 — 앞을 잘라 내면 "그때는 데이터가 없었다"로 오해된다. FE는 x축 간격을 응답의 `step`에서 읽는다. 보존이 7일이므로 **그 앞 구간의 점은 전부 `null`**이다(0이 아니다).
4. **`sentMetricPoints`는 `otelcol_exporter_sent_metric_points` 하나다**(필드 이름 그대로). `sendFailed`만 `otelcol_exporter_send_failed_*` 전부(스팬·메트릭·로그)를 더한다 — "몇 건 실패했나"는 신호를 가리지 않는 질문이라서다.
5. **`install-guide` 응답에 가산 필드 3개를 넣었다**(계약 초안 대비): `collector.os`, `Step.code`, 최상위 `notices: { code, level: 'WARNING'|'INFO', text }[]`.
   - 🔴 **i18n은 BE가 하지 않는다.** 키만 주면 FE가 사전을 갖기 전까지 화면이 통째로 비므로 **바로 쓸 수 있는 한국어 문구 + 안정 키(`code`)**를 함께 준다. 나중에 번역을 붙일 때 그 키로 갈아끼우면 된다.
   - `notices`에는 **다중 Collector 금지**(`single-collector`)·**라이선스 만료 403 즉시 폐기**(`license-expiry`)·토큰 1회 노출(`token-secrecy`)이 들어 있다. 둘 다 조용히 데이터를 잃는 경로라 설치 화면 밖에서는 말할 자리가 없다.
5-1. **`install-guide`에 공식 문서 출처가 붙었다 — 가산 필드 2종**(2026-09-07). 최상위 `references[]`와, 각 `Step`·`EnvVar`·`Notice`의 `refs[]`다. **기존 FE는 무수정으로 그대로 돈다**(모르는 키는 무시된다). 상세는 §8.8.
6. **`os`·`stack`은 없으면 기본(linux·java), 모르는 값이면 200 + `code 400` `APM_INSTALL_TARGET_INVALID`.** (`os` 허용값: `windows`·`linux`·`macos` — macos는 2026-09-15 가산) "안 준 값"과 "틀린 값"은 다른 사건이다 — 오타를 기본값으로 접으면 윈도우 관리자가 systemd 안내를 그대로 따라 하다 실패한다.
7-1. 🔴 **`keepRawSql`을 생략하면 설정 화면의 `keep_raw_sql`이 기본값**이다(2026-08-31, 분석 §12 A8 — 그전에는 소비자가 0건이라 화면에서 켜도 아무 일도 안 일어났다). 요청이 명시하면 요청이 이긴다. 같은 규칙이 `POST /apm/receive-tokens`의 `withConfig` 경로에도 걸린다.
7. 🔴 **`collector-config`는 회수된 토큰을 거절한다**(200 + `code 400` `APM_TOKEN_NOT_FOUND`, 메시지에 "회수된 토큰"). 그 설정을 배포하면 Collector가 401을 받고 exporter는 401을 영구 실패로 보아 **재시도 없이 즉시 폐기**한다(R11) — 원인이 화면 어디에도 안 남는다.
8. **`endpoint` 검증**(200 + `code 400` `APM_COLLECTOR_ENDPOINT_INVALID`): `http`/`https` + 호스트 필수, 쿼리·프래그먼트 금지, 끝 `/` 정리, `/apm/otlp`가 없으면 붙임. 🔴 **`/v1/metrics`를 붙여 온 것은 잘라 주지 않고 거절한다** — 조용히 고쳐 주면 무엇을 잘못 적었는지 영영 모른다. 옵션 범위(`slowMs` 1~600000 · `normalPct` 0~100 · `memoryLimitMib` 64~65536) 위반은 `APM_COLLECTOR_CONFIG_INVALID`.
9. 🔴 **`withConfig`의 옵션이 잘못되면 토큰 발급 자체가 실패한다**(트랜잭션 롤백). 예외를 삼키면 "토큰은 만들어졌는데 yaml만 빈" 응답이 나가고, 화면은 성공으로 보이는데 설치는 못 한다 — 관리자는 그 토큰을 회수하는 일부터 해야 한다.
10. **감사 로그는 전용 테이블이 아니라 WARN 로그다.** APM에는 감사 테이블이 없다(자산·Zabbix 관리의 감사 체계는 그 도메인 전용). `keepRawSql=true`면 `tokenId`·`label`·`actor`·`endpoint`를 WARN으로 남긴다(운영 프로필은 롤링 파일 30일 보관). 전용 테이블이 생기면 한 줄을 옮기면 된다.
11. **`collectors`의 `queueSize`·`sendFailedTotal`·`samplingDroppedTotal`이 `null`인 것은 0이 아니다.** 그 메트릭이 안 왔다는 뜻이고, 0으로 채우면 **끊긴 수집기가 가장 건강해 보인다**. 두 누계는 수집기가 보고한 **누적값**이라 수집기 재시작 시 0으로 돌아간다 — 화면이 증감을 계산한다면 감소를 "재시작"으로 읽어야 한다.

### 8.3 yaml 생성기 규칙

- 정본은 **파일 하나**(`src/main/resources/apm/collector-template.yaml`, otelcol-contrib 0.159.0 `validate` 통과본). 코드에 yaml을 복제하지 않고 **치환과 한 군데 삭제**만 한다.
- 치환: `${MOVESEYE_ENDPOINT}`·`${QUEUE_DIR}`(둘 다 **큰따옴표 스칼라**로 — 윈도우 경로의 역슬래시·콜론이 평문에서 애매해지지 않게)·`${SLOW_MS}`·`${NORMAL_PCT}`·`${MEMORY_LIMIT_MIB}`. `${RECEIVE_TOKEN}`은 `withConfig` 경로에서만 채운다.
- 🔴 **치환은 설정 줄에만 한다.** 템플릿 머리말이 자리표시 이름을 *설명*하려고 본문에 적어 두었기 때문에, 통째로 치환하면 그 설명이 뜻을 잃은 문장이 된다. 주석은 검증본의 절반이고 고객이 손댈 때 유일한 안내다.
- 🔴 **잔존 자리표시는 예외로 막는다.** 남으면 Collector는 그 문자열을 값으로 받아 **기동에 성공**하고 엉뚱한 곳으로 보낸다 — 화면에서는 "데이터가 안 온다"로만 보인다.
- `keepRawSql=true`: `transform/sql`을 **프로세서 정의와 traces 파이프라인 목록 양쪽**에서 뺀다(한쪽만 지우면 Collector가 기동을 거부한다). 지운 뒤 문자열이 남아 있으면 던진다. 경고 문구가 파일 상단 주석에도 들어가되 **프로세서 이름은 안 적는다** — "생성물 어디에도 그 이름이 없다"가 검증 가능한 불변식이라서다.
- 검증: `otelcol-contrib validate`는 못 돌리므로(바이너리 없음) 대신 **snakeyaml로 파싱해 키 트리를 정본 템플릿과 비교**하고 자리표시 잔존 0을 확인한다. 템플릿 자체가 validate 통과본이므로 구조가 같고 값만 바뀌었다면 생성물도 통과한다는 논리다.
  - ⚠️ 원본 템플릿은 **그대로는 파싱되지 않는다**(플로우 매핑 안의 `${X}`를 YAML이 중첩 매핑 시작으로 읽는다). 비교 기준은 "자리표시를 스칼라로 바꾼 템플릿"이다.

### 8.4 기존 파일 수정 (신규 패키지 외)

| 파일 | 수정 | 사유 |
|---|---|---|
| `engine-api/.../common/exception/ErrorCode.java` | `APM_COLLECTOR_ENDPOINT_INVALID`·`APM_COLLECTOR_CONFIG_INVALID`·`APM_COLLECTOR_NOT_FOUND`·`APM_INSTALL_TARGET_INVALID` 4개 추가 | 계약이 요구하는 오류 코드가 없었다 |
| `premium/apm/collector/ingest/store/MetricIngestor.java` | ROUTE_OVERFLOW 기록 시 `metric_name`에 `@svc:<serviceId>` 접미(§8.2-2) | 서비스 축이 없으면 "어느 서비스의 상한을 올리나"에 답할 수 없다 |
| `premium/apm/collector/ingest/drop/ApmDropMetricKey.java`(신규) | 접미 규약의 생성·해체 | 저장 규약을 한 곳에 못박는다 |
| `premium/apm/service/red/ApmSeriesQueryService.java` | `ALLOWED_SORTS`에 `route` 추가 + comparator 분기 | 계약 §8 |
| `premium/apm/collector/token/**`(`ApmTokenCreateReqDto`·`ApmTokenIssuedDto`·`ApmReceiveTokenService`) | `withConfig` 옵션 / `configYaml` 필드 / 발급 시 생성 | 계약 §8. 🔴 **record 컴포넌트가 늘었다** — 두 DTO를 직접 생성하는 코드는 인자 수가 바뀐다 |
| `premium/apm/collector/ingest/status/ApmIngestStatusController.java` | `GET /apm/ingest/drops` 추가 | 경로가 `/apm/ingest` 아래라 기존 컨트롤러에 얹었다 |
| `premium/apm/service/ApmServiceController.java` | `endpoints` @Operation 설명에 sort 허용 목록 명시 | 문서 |
| `src/main/resources/apm/collector-template.yaml` | 머리말 주석 2줄 보강(치환 범위·토큰 자리 안내) | 주석은 치환하지 않으므로 생성물에서도 읽히게 |
| `build.gradle.kts` | `tasks.withType<Test> { maxHeapSize = "1g" }` | 🔴 ArchUnit이 전 패키지 클래스 그래프를 올리는데 Gradle 기본 힙 512m로는 **클래스가 늘자 OOM으로 전체 테스트 실행이 중단**됐다(실제 발생). 리포트에는 "Could not complete execution"만 남아 원인이 안 보인다 |

### 8.5 불안한 지점 (검수용)

- **런타임 미검증.** 실제 Collector를 붙여 `/apm/collectors`·`series`가 채워지는지, 생성한 yaml로 otelcol이 기동하는지는 확인하지 않았다. `otelcol-contrib validate`를 돌리는 것이 가장 값싼 다음 단계다.
- **설치 가이드 명령은 실행해 보지 않았다.** 특히 Windows `sc.exe create`의 이스케이프(`binPath= "\"...exe\" --config \"...\""`)와 `icacls` 인자는 문법 검토만 했다.
- **`drops`는 전량을 메모리로 읽는다**(`findAll`). 30일 롤링 정리가 있어 실무상 작지만, 허용목록 밖 메트릭 이름이 다양한 설치본에서는 행 수가 예상보다 클 수 있다(표는 200줄로 자른다).
- **`collectors` 목록도 전량 조회다**(수집기 수는 사이트당 한 자리 전제 — 설계 §3.1의 "게이트웨이 1대").

---

### 8.6 설치본 설정 프로퍼티 · `GET /apm/collectors/config-defaults` (2026-09-01 신설)

수집기 온보딩의 하드코딩 기본값을 `@ConfigurationProperties`로 올리고, 그 값을 화면이 받아 갈 EP를 추가했다.

#### 프로퍼티 키 (`application.yml`, 접두 `app.apm.collector`)

| 키 | env | 기본값 | 무엇 |
|---|---|---|---|
| `default-queue-dir.linux` | `APM_QUEUE_DIR_LINUX` | `/var/lib/moveseye/otelcol-queue` | 디스크 큐 경로(리눅스) |
| `default-queue-dir.windows` | `APM_QUEUE_DIR_WINDOWS` | `C:\ProgramData\moveseye\otelcol-queue` | 디스크 큐 경로(윈도우) |
| `download-base-url` | `APM_DOWNLOAD_BASE_URL` | `https://github.com/open-telemetry` | 릴리스 아티팩트 베이스. 🔴 **폐쇄망 고객이 사내 미러로 바꾸는 값** |
| `endpoint-hint` | `APM_ENDPOINT_HINT` | `https://moveseye.example.com` | `endpoint` 입력의 예시(placeholder) |

- ⚠️ 키를 **생략**하면 코드 기본값이 쓰이지만, **빈 값**을 명시하면 `@NotBlank`로 **기동이 실패**한다. 조용히 접으면 "설정을 넣었는데 안 먹는다"가 배포 뒤에 드러난다.
- ⚠️ `download-base-url` 끝의 `/`는 서버가 지운다(안 지우면 `//releases/…`가 된다). 뒤에 붙는 경로 모양(`/<repo>/releases/download/v<ver>/<file>`)은 코드가 갖고 있으므로 사내 미러는 그 모양을 그대로 흉내 내면 된다.
- 🔴 **버전 번호는 프로퍼티가 아니다**(`ApmInstallVersions.COLLECTOR_VERSION`=0.159.0, `JAVA_AGENT_VERSION`=2.31.1). 우리가 round-trip을 실측한 조합이라 고객이 바꾸면 검증되지 않은 설치가 된다. `slowMs`·`normalPct`·`memoryLimitMib`도 코드 상수 — 설치본 정책이 아니라 **수집기 하나의 취향**이고 화면이 매번 고른다.
- 🔴 **소비자가 둘이고 둘이 같은 값을 말해야 한다.** 생성 yaml의 `extensions.file_storage.directory`와 설치 가이드의 `collector.queue-dir` 단계(권한 700/`icacls` 잠금)가 **같은 경로**여야 한다. 갈리면 고객은 권한을 잠근 곳과 **다른 곳에** 마스킹 후 텔레메트리를 쌓고, 그 사실은 어느 화면에도 안 나온다. `ApmCollectorPropertiesConsistencyTest`가 os별로 이 일치를 못박는다.

#### 응답과 사용 규약

```ts
type ApmCollectorConfigDefaults = {
  queueDir: { linux: string; windows: string; macos: string };  // 셋 다 항상 채워짐(null 없음) — os 토글에 재요청 불필요 (macos 2026-09-15 가산, 기본 /usr/local/var/moveseye/otelcol-queue)
  downloadBaseUrl: string;                       // 화면이 다운로드 안내를 직접 그린다면 이 값을 쓸 것(GitHub 하드코딩 금지)
  slowMs: number;        // 기본 2000, 허용 1~600000
  normalPct: number;     // 기본 2, 허용 0~100
  memoryLimitMib: number;// 기본 512, 허용 64~65536
  endpointHint: string;  // 값이 아니라 placeholder — 그대로 제출하면 실재하지 않는 호스트로 보낸다
  processors: { attributesDrop: AttributeAction[]; redactionPii: string[]; filterMetrics: string[] };  // 2026-09-15 가산 — 템플릿의 기본 규칙(서버가 템플릿을 파싱). §8.9
};
```

- 🔴 **`queueDir`의 주인은 발급 Drawer의 입력이고 프로퍼티는 폴백이다.** `POST /apm/collector-config`(및 `POST /apm/receive-tokens`의 `withConfig`) **요청에 `queueDir`이 있으면 그 값**이 쓰이고, **없으면 이 기본값**이 쓰인다.
- 🔴 **어느 쪽이 쓰였는지 알려 주는 헤더는 두지 않는다.** `X-Apm-Queue-Dir-Source: request|default` 같은 커스텀 헤더는 **FE의 fetch 래퍼까지 닿지 않아** 화면이 읽지 못한다(설정 생성 응답은 `text/yaml` 원문이다). 대신 규약을 반대로 세운다 — **FE는 이 EP로 기본값을 받아 폼을 채우고, 사용자가 그대로 두든 고치든 항상 값을 실어 보낸다.** 그러면 "어느 쪽이 이겼나"라는 질문 자체가 사라진다.
- 값이 바뀌는 시점은 **서버 재기동**뿐이므로 화면이 오래 캐시해도 위험하지 않다(관리자가 설정을 바꾼 직후에만 새로고침 필요).
- 권한: `AdminAccessChecker.requireAdmin` + `@RequiresFeature(Feature.APM)`. 거부는 이 레포 계약대로 **HTTP 200 + body `code:403`**.

#### 🔄 FE 반영 (다음 FE 작업)

- 발급 Drawer의 `queueDir`·`slowMs`·`normalPct`·`memoryLimitMib`·`endpoint` placeholder를 **이 EP 응답으로 초기화**하고, 제출 시 전부 실어 보낸다.
- FE에 남아 있는 큐 경로·GitHub URL 하드코딩이 있으면 제거한다.

### 8.7 tail 샘플링 옵션이 실제로 무엇을 켜는가 (2026-09-02, WBS 3.4 · P2 트레이스 착수)

`slowMs`·`normalPct`는 **이미 8.6에 있던 옵션**이지만, 그동안 트레이스를 저장하지 않아 화면에서
의미가 없었다. P2부터 `POST /apm/otlp/v1/traces`가 **실제로 적재**하므로 그 뜻을 못 박아 둔다.

생성 yaml의 `processors.tail_sampling.policies`는 **정책 3개**다(순서가 계약이다):

| 이름 | 타입 | 설정 | 뜻 |
|---|---|---|---|
| `errors` | `status_code` | `status_codes: [ERROR]` | 🔴 **조건 없이 100% 보존**. 옵션이 없다 |
| `slow` | `latency` | `threshold_ms: {slowMs}` | 그 이상 걸린 트레이스 100% |
| `normal` | `probabilistic` | `sampling_percentage: {normalPct}` | 나머지에서 확률 표본 |

🔴 **화면이 반드시 지켜야 할 것**: 트레이스 목록은 **전수가 아니다**. 개수를 요청 수로 읽으면 안
되고(오류율·처리량은 메트릭이 답한다), 목록의 모든 행에 `sampledReason` 배지를 달아 "왜 이것이
남았나"를 말해야 한다.

⚠️ **`sampledReason`은 Collector의 판정이 아니라 BE가 붙인 라벨이다.** tail 샘플링 프로세서는 어느
정책이 통과시켰는지 스팬에 적어 주지 않는다. 화면이 아는 값은 **네 개**다(2026-09-02 갱신):

| 값 | 뜻 | 라벨 |
|---|---|---|
| `ERROR` | 오류 스팬이 있어 남았다 — 🔴 **확실한 판정** | 오류 |
| `SLOW_INFERRED` | 🔴 **BE의 추정**. 임계는 고정 2000ms이고 그 수집기의 실제 `slowMs`가 아니다 | 느림(추정) |
| `SLOW` | Collector·에이전트가 **속성으로 알려 준** 경우에만 온다(BE는 이 값을 만들지 않는다) | 느림 |
| `SAMPLED` | 확률 표본 | 표본 |

🔴 **`SLOW_INFERRED`를 `SLOW`로 뭉쳐 표시하지 말 것.** 이름이 갈린 이유가 "추정이라는 사실이 값에
남아 있게" 하기 위해서다(검수 🟡5) — 화면에서 합치면 그 구분이 다시 사라지고, 사용자는 그 목록을
"느린 요청 전량"으로 읽는다. 필터 축으로는 써도 된다.

그 밖의 값은 고객이 `sampling.policy` 속성을 심은 경우의 **원문 문자열**이다 — 화면은 모르는 값을
그대로 표시할 것. 자세한 판정 순서는 `contract_apm.md` §7.4.

---

### 8.8 설치 가이드의 공식 문서 출처 — `references[]` · `refs[]` (2026-09-07 신설)

설치 가이드의 명령·환경변수·경고는 **우리가 지어낸 것이 아니라 OTel·Microsoft·systemd·PostgreSQL
공식 문서를 우리 환경에 맞춰 옮긴 것**이다. 그 근거를 응답에 실었다.

#### 타입 (가산 — 기존 FE는 무수정으로 그대로 돈다)

```ts
type ApmInstallGuide = {
  collector: { os; version; downloadUrl; steps: Step[] };
  app: { stack; steps: Step[]; envVars: EnvVar[] };
  verify: Step[];
  notices: Notice[];
  references: Reference[];                 // 🔴 신설
};
type Reference = { id: string; title: string; url: string; note: string | null };
type Step     = { code; title; command: string|null; note: string|null; refs: string[] };  // refs 신설
type EnvVar   = { name; value; note: string|null; refs: string[] };                        // refs 신설
type Notice   = { code; level: 'WARNING'|'INFO'; text; refs: string[] };                   // refs 신설
```

#### 🔴 FE가 지켜야 할 것

1. **`refs[]`는 `references[].id`를 가리키는 문자열이다.** URL이 아니다 — 화면은 id로 `references`에서
   찾아 `title`·`url`을 그린다. 같은 문서를 여러 스텝이 인용하므로 URL을 항목마다 실으면 같은
   주소가 응답에 열 번 나온다.
2. **가리키는 대상은 반드시 목록에 있다.** BE가 `references`를 **인용에서 파생**시키기 때문이다
   (`ApmDocRef.resolve`). 끊긴 참조도, 아무도 안 쓰는 고아 항목도 구조적으로 생기지 않는다 —
   전 조합에서 테스트가 양방향을 못박는다. 그래도 화면은 **못 찾으면 링크를 그리지 않는** 쪽으로
   두는 편이 안전하다(빈 링크보다 없는 편이 낫다).
3. 🔴 **`refs`는 비어 있을 수 있어도 `null`이 되지 않는다.** 출처가 없는 단계가 실제로 있다
   (우리 화면 안에서 끝나는 '수신 확인'·'서비스 목록 확인'에는 인용할 남의 문서가 없다).
   빈 배열은 정상이고 **결함이 아니다**.
4. **`references`는 그 조합(os×stack)이 인용한 것만 담는다.** 리눅스 화면에 `New-Service` 문서가
   뜨지 않고, Java 화면에 .NET 설치 문서가 뜨지 않는다. 조합을 바꾸면 목록도 바뀐다 —
   **캐시 키에 os·stack이 들어가야 한다**(이미 그럴 것이다).
5. **순서는 항상 같다**(Collector → SDK/스펙 → 스택 → OS/DB). 조합을 토글할 때 목록이 뒤섞이지
   않게 BE가 카탈로그 선언 순서로 정렬해 준다 — 화면에서 다시 정렬하지 말 것.
6. ⚠️ **`note`에 "폐쇄망에서는 열리지 않습니다"가 적힌 항목이 있다.** GitHub·npm 문서다.
   다운로드 베이스는 사내 미러로 바꿀 수 있지만(§8.6) **문서 링크는 못 바꾼다** — 남의 문서라서다.
   화면은 그 note를 함께 보여 주어, 링크가 안 열리는 것을 설치 실패로 오해하지 않게 한다.
7. `url`은 **항상 `https`**다(테스트가 못박는다). `target="_blank" rel="noopener noreferrer"`로 열 것.

#### 출처 목록 (2026-09-07 현재 카탈로그 — 정본은 `premium/apm/collector/install/ApmDocRef.java`)

| id | 어디에 붙나 | URL |
|---|---|---|
| `otel-collector-install` | collector.download·extract | https://opentelemetry.io/docs/collector/installation/ |
| `otel-collector-config` | collector.config · token-secrecy | https://opentelemetry.io/docs/collector/configuration/ |
| `otel-collector-releases` | collector.download | https://github.com/open-telemetry/opentelemetry-collector-releases/releases |
| `otel-collector-otlp-receiver` | OTLP_ENDPOINT·PROTOCOL env · app-to-collector | https://github.com/open-telemetry/opentelemetry-collector/tree/main/receiver/otlpreceiver |
| `otel-collector-healthcheck-ext` | verify.collector-health | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/healthcheckextension |
| `otel-collector-filestorage-ext` | collector.queue-dir · app-to-collector | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/extension/storage/filestorage |
| `otel-collector-exporterhelper-queue` | verify.collector-log · license-expiry | https://github.com/open-telemetry/opentelemetry-collector/blob/main/exporter/exporterhelper/README.md |
| `otel-collector-otlphttp-exporter` | license-expiry | https://github.com/open-telemetry/opentelemetry-collector/tree/main/exporter/otlphttpexporter |
| `otel-collector-memorylimiter` | collector.config | https://github.com/open-telemetry/opentelemetry-collector/tree/main/processor/memorylimiterprocessor |
| `otel-collector-tailsampling` | single-collector | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor |
| `otel-collector-loadbalancing` | single-collector | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/exporter/loadbalancingexporter |
| `otel-collector-transform` | masking-opt-in | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/transformprocessor |
| `otel-collector-redaction` | masking-opt-in | https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/redactionprocessor |
| `otel-sdk-env` | 공통 env 3종·EXPORT_INTERVAL·PROTOCOL | https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/ |
| `otel-otlp-metrics-exporter-spec` | TEMPORALITY_PREFERENCE (전 스택) | https://opentelemetry.io/docs/specs/otel/metrics/sdk_exporters/otlp/ |
| `otel-semconv-http-migration` | SEMCONV_STABILITY_OPT_IN · app.restart(.NET·Node·Python) · Go app.run | https://opentelemetry.io/docs/specs/semconv/non-normative/http-migration/ |
| `otel-java-agent` | java app.download·app.run | https://opentelemetry.io/docs/zero-code/java/agent/ |
| `otel-java-agent-config` | java app.run·app.restart | https://opentelemetry.io/docs/zero-code/java/agent/configuration/ |
| `otel-java-agent-releases` | java app.download | https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases |
| `otel-dotnet-zero-code` | dotnet 전 단계·TRACES_ENABLED_INSTRUMENTATIONS | https://opentelemetry.io/docs/zero-code/dotnet/ |
| `otel-dotnet-repo` | dotnet app.download(설치 스크립트 원본) | https://github.com/open-telemetry/opentelemetry-dotnet-instrumentation |
| `otel-js-zero-code` | node app.download·app.run | https://opentelemetry.io/docs/zero-code/js/ |
| `otel-js-auto-instrumentations-pkg` | node app.download | https://www.npmjs.com/package/@opentelemetry/auto-instrumentations-node |
| `otel-python-zero-code` | python app.download·app.run | https://opentelemetry.io/docs/zero-code/python/ |
| `otel-go` | go app.download·app.restart | https://opentelemetry.io/docs/languages/go/ |
| `otel-go-otelhttp` | go app.download·app.run | https://pkg.go.dev/go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp |
| `ms-new-service` | (windows) collector.service | https://learn.microsoft.com/powershell/module/microsoft.powershell.management/new-service |
| `ms-icacls` | (windows) collector.queue-dir | https://learn.microsoft.com/windows-server/administration/windows-commands/icacls |
| `systemd-service-unit` | (linux) collector.service·start·verify.collector-health | https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html |
| `pg-runtime-resource` | postgres-tuning | https://www.postgresql.org/docs/current/runtime-config-resource.html |
| `pg-runtime-wal` | postgres-tuning | https://www.postgresql.org/docs/current/runtime-config-wal.html |

- ⚠️ **`capacity-planning` 안내에는 출처가 없다(빈 배열).** 그건 우리 R3 실측이지 남의 문서가
  아니다 — 없는 근거를 지어내지 않는 것이 링크를 다는 것보다 중요하다.
- 🔴 **버전 고정 링크를 쓰지 않는다.** 공식 문서는 최신만 유지되는 쪽이 많아 버전 경로를 박으면
  먼저 죽는다. 우리가 고정한 버전(`0.159.0`·`2.31.1`)은 코드 상수이고, **릴리스 목록** 링크로
  찾아가게 했다.
- ⚠️ **표본 JSON은 만들지 않았다.** 이 응답은 본문이 전부 한국어 산문이라 표본을 두면 문구를 한 번
  손볼 때마다 계약 게이트가 깨진다(D1·D6·D13·D17 모두 문구 수정이었다). 대신 **shape은 위 타입이,
  불변식(끊긴 참조 0·고아 0·전부 https·OS/스택 누수 0)은 `ApmInstallGuideServiceTest`가** 지킨다.

#### 🔄 FE 반영 (선택 — 하지 않아도 회귀 없음)

- 설치 가이드 탭의 각 단계·환경변수·경고 아래에 **"근거 문서" 링크**를 단다(`refs` → `references`).
- 탭 하단에 `references[]` 전체를 **"참고 문서" 목록**으로 한 번 더 두면 인쇄·공유에 유용하다.

---


### 8.9 프로세서 상세 — `processors` 옵션 (2026-09-15 신설)

설정 yaml의 마스킹·허용목록 프로세서 셋을 화면에서 손볼 수 있다. `POST /apm/collector-config`와 `POST /apm/receive-tokens`의 `withConfig` **둘 다** 같은 모양을 받는다.

```ts
type AttributeAction = { key?: string; pattern?: string; action: 'delete' | 'hash' };  // key·pattern 중 정확히 하나
type ProcessorOptions = {
  attributesDrop?: { useDefaults?: boolean /* 기본 true */; extra?: AttributeAction[] };
  redactionPii?:   { useDefaults?: boolean; extra?: string[] /* 정규식 */ };
  filterMetrics?:  { useDefaults?: boolean; extra?: string[] /* 지표 이름 정규식 */ };
};
```

- 🔴 **전부 생략 가능하고, 생략하면 템플릿 그대로다** — 옛 화면의 요청과 결과가 한 글자도 다르지 않다(`ApmCollectorConfigGeneratorTest`가 못박음). FE는 "기본 포함 + 추가 없음"이면 키 자체를 싣지 않는다(`apmBuildProcessorOptions`).
- 🔴 **기본 규칙은 낱개로 고르지 않는다** — 한 벌로 실측(R14)된 것이라 절반만 남기면 마스킹했다는 착각만 남는다. 기본을 빼려면 `useDefaults=false`로 통째로 빼고 `extra`에 자기 규칙을 적는다.
- 🔴 **기본 제외 + 추가 없음 = 프로세서 자체를 정의·파이프라인에서 뺀다.** 빈 `filter/metrics` include는 **모든 지표를 버리기** 때문(Collector는 멀쩡해 보인다). 허용목록을 뺀 경우 BE 수신 허용목록이 여전히 거른다.
- 기본 규칙의 내용은 `GET /apm/collectors/config-defaults`의 `processors`로 내려 준다(서버가 템플릿 `collector-template.yaml`을 파싱 — 코드에 따로 적지 않는다). 화면은 스위치 옆에 그 목록을 보여 주고, 응답이 없으면(구 서버) 추가 규칙만 받는다.
- 검증(모두 200 + `code 400` `APM_COLLECTOR_CONFIG_INVALID`): 항목당 최대 50건, 정규식 256자 이내·Java `Pattern.compile` 통과·제어문자/`${` 금지, `action`은 `delete|hash`, 속성 이름은 `[A-Za-z0-9_.:/-]{1,128}`. ⚠️ Collector는 Go(RE2) 문법이라 Java가 받아도 Collector가 거부할 수 있다(역참조·lookaround) — 설치 확인 단계의 로그가 알려 준다.
- 생성 yaml: 추가 규칙은 템플릿 항목 뒤에 **작은따옴표 스칼라**로 붙는다(`'`는 `''`). 상단 주석에 `# ⚙ 프로세서 상세 설정이 적용됐습니다: attributes/drop: 기본 규칙 제외, 추가 2건 / …`가 붙고, 기본 마스킹(attributes/drop·redaction/pii)을 뺐으면 `# ⚠️ 기본 마스킹 규칙을 뺐습니다 …` 경고 주석 + 응답 헤더 `X-Apm-Warning: masking-reduced`(keepRawSql과 겹치면 `raw-sql, masking-reduced` 한 헤더에 쉼표) + 서버 WARN 로그(누가·어느 토큰).


### 8.10 설치 경로 — `installDir`·`configDir`·`queueDir`·`agentDir` (2026-09-15 신설)

`GET /apm/install-guide`가 쿼리로 설치 경로 넷을 받아 **모든 단계의 명령을 그 경로로 다시 조립**한다. 응답에 `paths: { installDir, configDir, queueDir, agentDir }`(실효값)가 붙는다.

| 파라미터 | 뜻 | 기본값(리눅스 / 윈도우 / macOS) |
|---|---|---|
| `installDir` | Collector 바이너리 디렉터리(바이너리 이름은 고정 `otelcol-contrib[.exe]`) | `/usr/local/bin` / `C:\Program Files\moveseye-collector` / `/usr/local/bin` |
| `configDir` | 설정 파일 디렉터리(파일명 고정: 리눅스·맥 `collector.yaml`, 윈도우 `config.yaml`) | `/etc/moveseye` / `C:\ProgramData\moveseye` / `/usr/local/etc/moveseye` |
| `queueDir` | 디스크 큐. 🔴 생성 yaml의 `file_storage.directory`와 같아야 한다 — 기본값은 `app.apm.collector.default-queue-dir.*` 프로퍼티 | 프로퍼티 |
| `agentDir` | Java 자동계측 에이전트 jar 디렉터리 | `/opt/otel` / `C:\ProgramData\moveseye\otel` / `/opt/otel` |

- 비면 기본값, **틀리면 200 + `code 400` `APM_INSTALL_TARGET_INVALID`**(기본값으로 접지 않는다 — 오타 난 경로로 관리자가 권한을 주고 명령은 다른 곳에 깐다). 검증: 리눅스·맥 `^/[A-Za-z0-9._~/-]+$`(명령에 따옴표 없이 들어가므로 공백 불가), 윈도우 `^[A-Za-z]:\\[^<>:"|?*제어문자]+$`(전부 큰따옴표 안이라 공백 가능), 200자 이내, `..` 금지, 끝 구분자는 뗀다.
- 🔴 **FE가 문자열 치환으로 흉내 내지 않는다** — systemd 유닛 `ExecStart`·launchd plist·`New-Service -BinaryPathName`처럼 한 번 더 파생된 경로를 놓친다. `ApmInstallPaths`가 `binPath/configPath/agentJar`를 한 곳에서 만들고 `ApmInstallGuideServiceTest.customPathsReplaceDefaultsEverywhere`가 세 OS 전부에서 기본 경로 잔존 0을 못박는다.
- FE: 설치 가이드 탭 맨 위 '설치 경로' 카드. 입력은 URL에 싣지 않는다(타이핑마다 navigate → 페이지 리마운트) — 로컬 상태 + 500ms 디바운스로 재조회하고, 응답 `paths`를 칸에 되비춘다. OS를 바꾸면 경로 모양이 달라 전부 비운다. `queueDir`을 바꾼 경우 설정 재생성 폼에도 같은 값을 넣으라는 안내를 붙인다.

## 9. 실시간 관제(Live) — P1.5 (2026-09-01 신설, BE 구현 완료 · FE 미착수)

설계 정본: `designs/devdesign_apm-live.md`. 개요(메뉴 1) 상단 **"실시간" 토글**이 쓴다.

### 9.1 EP

| 메서드 | 경로 | 권한 | 응답 |
|---|---|---|---|
| GET | `/apm/live/snapshot?serviceUid=&env=` | 로그인 + `@VisitorIdCheck` + `@RequiresFeature(APM)` | `ApiResult<ApmLiveDto>` |
| GET | `/apm/live/stream?serviceUid=&env=&visitorId=` | 로그인 + `@RequiresFeature(APM)` + **세션 대조 필수**(아래 §9.3) | `text/event-stream` |

- **관리자 전용이 아니다** — 개요와 같은 판단(장애를 보는 사람은 운영자다).
- 쿼리 파라미터는 셋 다 선택. `serviceUid`·`env`는 대소문자 무시 완전일치, 없으면 **전체**.
- 에러는 이 레포 계약대로 **HTTP 200 + body `code`**. 예외는 401(`INVALID_TOKEN`)뿐이다.

### 9.2 SSE 이벤트 — 🔴 이름이 계약값이다

| `event:` | 언제 | `data:` |
|---|---|---|
| `snapshot` | **연결 즉시 1회** | `ApmLiveDto` (창 전체 = 90칸) |
| `bucket` | 10초마다 | `ApmLiveDto` (뒤쪽 6칸 = 60초) |
| `heartbeat` | 30초마다 | `{ "ts": number }` |

- 🔴 `snapshot`과 `bucket`은 **같은 타입**이다. 다른 것은 `services[].buckets` 길이뿐 → **FE 병합 코드는 한 벌**이면 된다.
- 🔴 **병합 규칙: `(serviceUid, ts)`로 덮어쓴다.** 같은 `ts`가 여러 번 오는 것은 정상이다(파이프라인 지연 25~35초 때문에 증분이 뒤로 6칸 겹쳐 온다 — 1칸만 보내면 거의 항상 빈 칸이다).
- `endpoints`는 순위표라 **증분에도 매번 전체**가 실린다(부분 갱신이 성립하지 않는다).
- ECharts에 `append`를 쓰지 말 것 — 늦게 도착한 값이 뒤에 붙어 시간축이 꼬인다. **ts 키 맵 → 정렬 배열**로 그린다.

### 9.3 인증 — 🔴 스트림만 규약이 다르다

- **토큰**: `accessToken` **쿠키**(`EventSource`가 자동 전송). 🔴 **토큰을 쿼리로 보내지 말 것** — 프록시·액세스 로그에 평문으로 남는다.
- **세션 대조 — 🔴 필수다** (2026-09-01 정정, 4차 검수 🔴1). 스트림에는 `x-visitor-id` 헤더 대신 **`visitorId` 쿼리 파라미터**를 쓸 수 있다(`EventSource`는 커스텀 헤더를 못 싣는다). 다만 그것은 **통로를 하나 더 연 것이지 검사를 면제한 것이 아니다**:
  - **쿼리 `visitorId` 또는 헤더 `x-visitor-id` 중 하나는 반드시 있어야 한다.** 둘 다 없으면 **401**이다(빈 문자열도 없는 것으로 본다).
  - 값이 Redis의 현재 로그인 세션과 다르면 **401**. `@VisitorIdCheck` 인터셉터와 **같은 코드**(`VisitorSessionChecker`)로 판정한다.
  - 쿼리가 우선, 없으면 헤더. 둘 다 왔는데 다르면 쿼리가 이긴다(둘 중 하나만 맞으면 통과시키지 않는다).
  - ⚠️ **이전 계약 문구(“안 주면 통과”)는 폐기됐다.** 그 문구대로면 다른 기기 로그인으로 세션이 밀린 브라우저도 `accessToken` 쿠키만 남아 있으면 스트림을 계속 받았다 — 세션 바인딩 우회였다.
  - **FE 영향 없음**: FE는 이미 항상 `visitorId` 쿼리를 붙인다.
- `/apm/live/snapshot`은 **일반 EP와 동일**하다(`x-visitor-id` 헤더 필수).
- ⚠️ **라이선스는 연결 시점에만** 검사한다(인터셉터라 연결을 여는 요청에만 걸린다). 스트림 도중 만료·회수돼도 **최대 `stream-timeout-seconds`** 동안은 흐른다 — 그 값을 2026-09-01에 **1800초(30분) → 600초(10분)** 로 낮췄다(4차 검수 🟡5, 정책 승인 사항: 설계서 §4).
  - **FE는 아무것도 안 해도 된다.** 수명이 끝나면 `EventSource`가 **스스로 재접속**하고, 그 재접속 요청이 라이선스를 다시 검사한다. 화면상 변화 없음(끊김도 보이지 않는다).

### 9.4 타입

```ts
type ApmLiveDto = {
  serverTime: number;      // ms 에폭. 🔴 브라우저 시계 대신 이것을 축의 '지금'으로 쓴다
  bucketSeconds: number;   // 10 — x축 간격이자 rps 환산의 분모
  windowSeconds: number;   // 900 — 🔴 buckets.length × bucketSeconds가 아니다(증분에서는 다르다)
  enabled: boolean;        // false면 이 설치본이 실시간을 껐다. 404가 아니라 200 + 빈 목록이다
  services: ApmLiveServiceLive[];
  endpoints: ApmLiveEndpointRow[];   // 최근 60초 Top(오류 축 ∪ 지연 축)
};

type ApmLiveServiceLive = {
  serviceUid: string;      // 🔴 키는 uid다(내부 id는 안 나간다)
  displayName: string;     // 미설정이면 serviceName
  env: string;
  buckets: ApmLiveBucket[];  // 오래된 → 최신. 관측 없는 칸도 자리를 지킨다
};

type ApmLiveBucket = {
  ts: number;              // 칸 시작(ms 에폭, 절대 정렬) — 병합 키
  rps: number;             // requests / bucketSeconds. 🔴 빈 칸은 0이다(null 아님)
  requests: number;
  errors: number;
  errorRatePct: number | null;   // 🔴 요청 0이면 null(0%가 아니다)
  p95Ms: number | null;          // 🔴 관측 0건이면 null. ⚠️ 10초 소표본이라 추세로 읽을 것
  activeRequests: number | null; // 🔴 그 칸의 마지막 관측값(합이 아니다)
};

type ApmLiveEndpointRow = {
  serviceUid: string;
  displayName: string;
  method: string;          // "GET" 등. 없으면 ""
  route: string;           // 🔴 "__other__"면 상한에 걸려 접힌 묶음이다 — 링크로 만들지 말 것
  requests: number;
  errors: number;
  errorRatePct: number | null;
  maxMs: number | null;    // 최근 60초 최대 지연(상계). p95를 안 쓰는 이유는 소표본 보간 오차
                           // 🔴 CUMULATIVE 수신에서는 근사다 — 바로 아래 설명
  topError: boolean;       // 오류 축 상위
  topSlow: boolean;        // 지연 축 상위. 🔴 둘 다 true일 수 있다
};
```

#### 🔴 `maxMs`의 출처 — CUMULATIVE 수신에서도 표가 비지 않는다 (2026-09-02 회귀 수정)

D17이 **저장 롤업**에서 CUMULATIVE 히스토그램의 `min`·`max`를 버리게 하면서(누적 극값은 뺄 수 없어
한 번 있었던 104초가 그 뒤 모든 버킷에 영원히 찍혔다), **실시간 링버퍼도 같은 `null`을 받아**
"느린 엔드포인트 Top"이 통째로 비고 실시간 p95의 실측 클램프도 꺼지는 회귀가 있었다.
기본 자바 에이전트가 CUMULATIVE라 이건 예외가 아니라 다수 경로였다. **지금은 저장용 극값과
Live용 값을 갈라 놓았다**(`MetricIngestor.liveMaxOf`) — 링에는 이 순서로 값이 간다.

| 수신 형태 | `maxMs`의 정체 | 정확도 |
|---|---|---|
| **DELTA** | SDK가 그 주기에 실제로 잰 최댓값 | 정확 |
| **CUMULATIVE** | 그 export **차분 벡터의 최상위 비어 있지 않은 버킷 상한**(모든 관측을 덮는 상계) | 실제 최댓값 이상, 오차는 **버킷 한 칸** 안 |
| CUMULATIVE(그 칸에 증분이 0) | exemplar 값(실측 요청 하나) | 그 요청의 실제 값 |

- 🔴 **exemplar 값을 먼저 쓰지 않는 이유**: exemplar는 **대표 표본이지 최댓값이 아니다.** R1 실측에서
  `/home/summary`는 실제 max **0.9498초**인데 실린 exemplar는 **0.0112초**(85배 작다)였다 — exemplar를
  앞세우면 **가장 느린 엔드포인트가 11ms로 찍혀 Top 정렬 맨 아래로 간다**(빈 표보다 나쁘다).
- **저장 롤업(`GET /apm/services/{uid}/red` 등)의 `max`는 그대로 `null`이다** — D17은 유지된다.
  실시간과 저장 화면의 최대 지연이 다를 수 있고, 그건 정상이다.
- **FE 조치 없음.** 필드명·타입·의미("그 창에 이만큼 느린 요청이 있었다") 모두 그대로다.
  ⚠️ 다만 CUMULATIVE 설치본에서는 소수점까지 정확한 값이 아니므로 **"정확히 몇 ms"로 읽는 문구는
  피한다**. 정확한 값이 필요하면 설치 가이드가 권장하는
  `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`가 답이다.

### 9.5 🔴 FE가 반드시 지켜야 할 것

1. **문구는 "실시간(약 30초 이내)"**이다. 지연 예산의 대부분이 상류(에이전트 export 10초 + 수집기 batch 5초)에 있어 "초 단위"라고 쓰면 계약 위반이다.
2. `enabled:false`면 **토글을 비활성 + 안내 문구**를 띄운다(빈 차트가 아니라).
3. `errorRatePct`·`p95Ms`·`activeRequests`의 `null`을 **0으로 채우지 말 것**. "요청이 없었다"와 "0%"는 다르고, 후자로 칠하면 죽은 서비스가 초록으로 보인다.
4. 재접속 시 `/snapshot`을 따로 부를 필요 없다 — `EventSource`가 재접속하면 서버가 `snapshot`을 다시 준다.
5. 서버 재기동 직후에는 **창이 비어 있는 것이 정상**이다(인메모리 링). "데이터 없음"을 장애로 표시하지 말 것.

### 9.6 설정(참고 — FE가 하드코딩하지 말 것)

`app.apm.live.{enabled, window-seconds=900, bucket-seconds=10, route-window-seconds=60, tick-buckets=6, max-services=200, max-routes-per-service=200, stream-timeout-seconds=600, heartbeat-seconds=30, max-heap-mb=64}`.
**`bucketSeconds`·`windowSeconds`는 응답에 실려 온다** — 화면은 그 값을 쓴다(설치본마다 다를 수 있다).

- 🔴 `stream-timeout-seconds` **기본값이 1800 → 600으로 바뀌었다**(2026-09-01). FE는 무영향(자동 재접속).
- 🔴 `max-heap-mb`(신설)는 **조합의 상한**이다. `window-seconds`·`route-window-seconds`는 `bucket-seconds`의 **배수여야 하고**, 링버퍼 힙 추정이 이 예산을 넘으면 **기동이 실패**한다(개별 `@Min`/`@Max`는 곱셈을 못 막는다 — 전부 최댓값을 적으면 route 슬롯이 60억이 된다).

### 🔄 FE 반영 (다음 FE 작업)

- 개요 상단 "실시간" 토글 + 흐르는 차트 3(rps·active·오류율) + 최근 60초 엔드포인트 표 + 서비스 카드 실시간 점.
- 토글 off 시 `EventSource`를 **닫는다**(연결을 남기지 않는다).

---

## 10. 트레이스 조회 · 서비스 맵 — P2 2차 물결 (2026-09-02, BE 구현 완료 · FE 미착수)

WBS 3.5~3.10 · 3.12 · 3.13. 설계 정본 `designs/devdesign_apm.md` §5 · §8.1(트레이스·서비스 맵·에러·DB·외부 호출 행), 화면 명세 `designs/devdesign_apm-screens-wbs.md` §3.5~3.8 · §3.14.
**3.11(배포 감지·전후 비교)은 이번 범위가 아니다** — `apm_deployment` 테이블은 있고 쓰는 코드가 없다.

### 10.0 이 절 전체에 걸리는 여섯 가지 (🔴 FE가 먼저 읽을 것)

1. **샘플링을 통과한 것만 보인다.** 트레이스·엣지·DB 그룹·외부 의존의 **절대 건수는 근사**다(원천이 tail 샘플링을 통과한 스팬). 비율·분포·순위는 의미가 유지된다. ⚠️ 오류 트레이스는 100% 샘플링되므로 **오류율이 실제보다 높게** 보일 수 있다. 화면은 "샘플 기준"을 항상 표시해야 한다. 건수·오류율의 정본은 메트릭(§2 RED)이다.
2. **7일이 지나면 트레이스가 사라진다.** 그런데 그것을 가리키는 링크는 더 오래 산다 — 에러 그룹의 `sampleTraceId`(90일)·DB 그룹의 `sampleTraceId`(90일)·메트릭 exemplar(최대 400일). 🔴 `APM_TRACE_NOT_FOUND`는 **정상 동작**이고, 화면은 "없는 주소"가 아니라 **"이 트레이스는 만료됐습니다"** 로 안내해야 한다(서버는 만료와 오타를 구분할 수 없다).
3. **`null`과 `0`을 구분한다.** 백분위 `null` = "관측이 없거나 경계를 몰라 계산 못 함", `errorRatePct` `null` = "호출 0건". 0으로 채우면 죽은 것이 초록으로 보인다.
4. **`mixedBounds: true`면 그 행/칸의 `p50Ms·p95Ms·p99Ms`는 `null`이다.** 건수·오류율은 정확하다. 화면은 백분위 자리에 "경계 혼재"를 표시할 것.
   🔴 2026-09-02부터 **경계를 모르는 행(`bounds_id = NULL`)이 섞여도 `true`**다(2차 검수 지적 4). 그 전에는 `count(distinct)`가 NULL을 세지 않아 혼재를 **놓치고** 남의 눈금으로 잰 ms를 내보냈다. ⚠️ **전부 NULL**인 경우는 혼재가 아니라 "경계를 모른다"이므로 `mixedBounds:false` + 백분위 `null`이다 — 화면 문구를 나눌 거라면 이 둘을 구분할 것.
5. **권한은 `apm.view`다**(2026-09-03 개정 — 그 전 이틀은 `ADMIN` 축이었다). 칸이 꺼진 역할의 사용자는 이 절의 EP 전부에서 `200 + code 403`을 받는다 — FE는 메뉴 노출을 `permissions.apm.view`로 가릴 것(§10.5).
6. **집계 지연은 최대 8분이다.** 트레이스 집계 배치가 5분 주기 + LAG 3분이라, 방금 일어난 호출은 서비스 맵·에러·DB·외부 의존에 **아직 없다**(트레이스 목록·상세는 즉시 보인다 — 그쪽은 적재가 직접 쓴다). 화면은 "최근 5분"을 기본 창으로 쓰지 말 것.

공통 규약은 §공통과 같다: `from`·`to`는 ms 에폭(없거나 뒤집히면 최근 1시간), 응답 envelope `{status, code, data}`, 오류는 **HTTP 200 + 바디 code**.

### 10.1 EP 표

| # | EP | 권한 | 응답 `data` |
|---|---|---|---|
| 1 | `GET /apm/traces?from&to&service&involved&route&status&minMs&maxMs&sort&order&limit&offset` | 🅞 | `TraceList` |
| 2 | `GET /apm/traces/scatter?…&cells&perCell` | 🅞 | `Scatter` |
| 3 | `GET /apm/traces/{traceId}` | 🅞 | `TraceDetail` |
| 4 | `GET /apm/traces/{traceId}/flame` | 🅞 | `Flame` |
| 5 | `POST /apm/traces/compare` body `{baselineTraceId, targetTraceId}` | 🅞 | `TraceCompare` |
| 6 | `GET /apm/service-map?from&to&env&service` | 🅞 | `ServiceMap` |
| 7 | `GET /apm/service-map/edges/series?from&to&fromServiceUid&toKind&toRef&step` | 🅞 | `EdgeSeries` |
| 8 | `GET /apm/errors?from&to&service&q&sort&order&limit&offset` | 🅞 | `ErrorGroups` |
| 9 | `GET /apm/errors/{groupId}?from&to` | 🅞 | `ErrorGroupDetail` |
| 10 | `GET /apm/errors/{groupId}/series?from&to` | 🅞 | `AggSeries` |
| 11 | `GET /apm/db/queries?from&to&service&system&q&sort&order&limit&offset` | 🅞 | `DbQueryGroups` |
| 12 | `GET /apm/db/queries/{groupId}?from&to` | 🅞 | `DbQueryRow` |
| 13 | `GET /apm/db/queries/{groupId}/series?from&to` | 🅞 | `AggSeries` |
| 14 | `GET /apm/db/systems?from&to&service` | 🅞 | `DbSystems` |
| 15 | `GET /apm/dependencies?from&to&service` | 🅞 | `Dependencies` |
| 16 | `GET /apm/dependencies/series?from&to&service&target` | 🅞 | `AggSeries` |
| 17 | `GET /apm/services/{uid}/exemplars?metric&from&to&step&limit` | 🅞 | `Exemplars` |

전부 `@RequiresFeature(APM)` + `@VisitorIdCheck` + **`ApmAccessChecker.requireRead`**(= 역할의 `applicationMonitoring/apm` **view** 칸, 관리자는 우회). 쓰기 EP는 없지만 **읽기에도 판정이 있다** — 근거는 §10.5.
🔴 #3 `GET /apm/traces/{traceId}`와 #9 `GET /apm/errors/{groupId}`만 판정이 **하나 더** 붙는다(원문 열람 — §10.5).

🔴 **설계서 경로에서 바꾼 것 2개** (둘 다 대상 문자열이 경로 변수가 될 수 없어서다 — 주소·큐 이름에 `.` `:` `/`가 들어간다):
- `GET /apm/service-map/edges/{from}/{to}/series` → **`/edges/series?fromServiceUid&toKind&toRef`**
- `GET /apm/dependencies/{target}/series` → **`/dependencies/series?target=`**

🔴 **설계서에 있는데 이번에 만들지 않은 것 4개**:
- `GET/PUT /apm/service-map/layout`(사용자별 배치 저장) — 저장 테이블이 필요한 별도 과제. FE는 그때까지 dagre 자동 레이아웃만 쓴다.
- `GET /apm/errors/treemap` — 목록(서비스 × 그룹 × count)으로 그릴 수 있다. 같은 집계를 두 EP로 두면 필터가 어긋난다.
- `GET /apm/db/slow-series` — `queries?sort=p95Ms`로 고른 그룹들의 `/series`를 겹쳐 그리는 것과 같다. 서버가 "느림"의 기준을 따로 정하면 화면 필터와 갈린다.
- `GET /apm/dependencies/sankey` — #15가 (서비스, 대상, 건수)를 이미 준다.

### 10.2 타입

```ts
// ── #1 목록 ────────────────────────────────────────────────────────────
type TraceList = {
  total: number;          // 🔴 10만에서 끊는다
  totalCapped: boolean;   // true면 "그 이상"
  rows: TraceRow[];
};
type TraceRow = {
  traceId: string;                 // 32자 소문자 hex
  startTs: number;                 // ms 에폭
  durationMs: number;
  rootServiceUid: string | null;
  rootServiceName: string;         // displayName 우선
  rootName: string;                // 🔴 루트가 아직 안 왔으면 잠정값
  error: boolean;
  spanCount: number;               // 지금까지 저장된 수
  serviceUids: string[];
  sampledReason: string | null;    // ERROR | SLOW_INFERRED | SAMPLED | 정책 이름
};
```
- `service` = `service_uid`. 없는 uid면 `code 404 APM_SERVICE_NOT_FOUND`.
- `involved`(기본 `false`) — `false`는 **이 서비스에서 시작한** 트레이스만(인덱스를 탄다), `true`는 **거쳐 간** 트레이스까지(배열 검사라 창이 넓으면 느리다).
- 🔴 **`route`는 스팬의 `http.route`가 아니라 루트 스팬 이름 부분일치**다. `apm_trace_summary`에 route 컬럼이 없다. 실무상 루트 이름이 `GET /api/orders/{id}` 형태라 대개 통하지만, 정확한 route 필터가 필요하면 스키마 변경이 선행이다.
- `status`: `all`(기본) | `error` | `ok`.
- `sort`: `startTs`(기본) | `durationMs` | `spanCount`, `order`: `desc`(기본) | `asc`. 🔴 밖의 값은 `code 400 APM_INVALID_SORT`(조용히 기본값으로 바꾸지 않는다).
- `limit` 기본 50 · 최대 500.

```ts
// ── #2 산점도 ──────────────────────────────────────────────────────────
type Scatter = {
  total: number; totalCapped: boolean;
  downsampled: boolean;            // 🔴 true면 "표본" 배지
  cells: number;                   // 시간축 칸 수(기본 120, 최대 600)
  perCell: number;                 // 칸당 대표 수(기본 3, 최대 20)
  points: { ts: number; durationMs: number; traceId: string; error: boolean;
            rootServiceUid: string | null; rootName: string }[];
};
```
- **목록과 같은 필터를 쓴다** — 브러시로 범위를 잡아 목록으로 넘길 때 파라미터를 그대로 실으면 된다.
- y축 격자는 **로그**(4분의 1 데케이드)다. 선형으로 자르면 1초짜리 한 건이 격자를 지배해 ms대의 구조가 뭉개진다.
- 🔴 칸마다 **느린 것부터** 남긴다 → **위쪽 윤곽(이상치)은 보존**되지만 **아래쪽 밀도는 실제보다 성기다**. 밀도를 읽는 용도로 쓰지 말 것.
- 🔴 **표본 상한도 시간 칸별이다**(2026-09-02 개정, 2차 검수 지적 3). 예전에는 창 전체에 정렬 없는 `limit 200000`을 걸어 **어느 20만 건이 뽑히는지가 비결정적**이었고, 하필 앞쪽만 뽑히면 뒤쪽 시간대가 통째로 비어 보였다. 지금은 칸마다 `limit`을 걸고 `(durationMs desc, traceId)`로 안정 정렬한다 → **같은 데이터면 같은 그림**이고 어느 시간대도 사라지지 않는다.
  ⚠️ 대가: 조기 종료가 사라져 **넓은 창에서 느려질 수 있다**. 그때의 대응은 `cells`를 줄이는 것이 아니라 **창을 좁히는 것**이다(칸을 줄이면 칸당 예산이 늘어 더 느려진다).

```ts
// ── #3 상세(워터폴) ────────────────────────────────────────────────────
type TraceDetail = {
  traceId: string; startTs: number; durationMs: number;
  rootServiceUid: string | null; rootName: string;
  error: boolean; spanCount: number; sampledReason: string | null;
  services: { serviceUid: string; serviceName: string; env: string | null }[];
  spans: Span[];                   // 🔴 전위 순회 순서
  criticalPath: string[];          // spanId, 루트→리프 순
  criticalPathMs: number;          // 그 경로의 자기 시간 합
  rootMissing: boolean;            // 🔴 진짜 루트가 없다 → durationMs가 일부 구간만 잰 값
  cycleBroken: boolean;            // 🔴 부모 사슬 순환을 끊었다(데이터 이상)
  truncated: boolean;              // 🔴 5,000 스팬 상한에 걸렸다
};
type Span = {
  spanId: string; parentSpanId: string | null;
  name: string; kind: 'UNSPECIFIED'|'INTERNAL'|'SERVER'|'CLIENT'|'PRODUCER'|'CONSUMER';
  status: 'UNSET'|'OK'|'ERROR';    // 🔴 UNSET이 절대다수이고 실패가 아니다
  serviceUid: string | null; serviceName: string;
  startTs: number;                 // ms 에폭
  offsetMs: number;                // 트레이스 시작 기준 상대 — 막대의 x
  durationMs: number;              // 막대의 폭
  selfMs: number;                  // 자식과 겹치지 않는 자기 시간
  depth: number;                   // 루트 0
  onCriticalPath: boolean;
  orphan: boolean;                 // 🔴 부모를 못 찾아 루트로 승격됨
  attrs: Record<string, string>;
  events: { name: string; time: string | null; attributes: Record<string,string> }[];
  links: { traceId: string; spanId: string; attributes: Record<string,string> }[];
};
```
- 🔴 **`spans` 순서가 계약이다.** 부모 바로 다음에 그 자식들, 형제는 시작 시각 순. **FE는 트리를 다시 만들 필요가 없다** — 위에서 아래로 그리고, 접기는 "그 마디의 `depth`보다 큰 뒤 행들을 숨긴다"로 처리한다.
- `selfMs`는 **자식 구간의 합집합**을 뺀 값이라 병렬 호출에서도 음수가 되지 않는다.
- ⚠️ `spanCount`(요약에 적힌 수)와 `spans.length`가 **다를 수 있다**. 앞은 "지금까지 저장한 수", 뒤는 "이번에 돌려준 수"(상한 5,000).
- ⚠️ `durationMs`(요약)는 timestamp 차라 **항상 1000ns의 배수**이고, `Span.durationMs`는 OTLP 나노초 원값이다 — 나란히 보이면 끝자리가 안 맞는다(계약 §7.6-10).
- 🔴 **요약이 없고 스팬만 있어도 상세는 선다**(요약을 스팬에서 지어낸다). 404는 둘 다 없을 때만이다.

```ts
// ── #4 플레임 ──────────────────────────────────────────────────────────
type Flame = {
  traceId: string; durationMs: number; truncated: boolean;
  roots: FlameNode[];              // 🔴 하나라는 보장이 없다(고아 승격)
};
type FlameNode = {
  name: string; serviceUid: string | null; serviceName: string;
  valueMs: number;                 // 합친 스팬들의 지속시간 합
  selfMs: number;                  // 합친 스팬들의 자기 시간 합
  count: number;                   // 몇 개를 합쳤나
  error: boolean; children: FlameNode[];
};
```
- 워터폴과 **다른 트리**다: 같은 `(서비스, 이름)`의 형제를 합친다. 루프 안의 얇은 막대 200개가 한 칸으로 보이는 것이 목적이다.
- 🔴 `valueMs`는 병렬 호출에서 **부모보다 클 수 있다**. 칸 폭은 부모 대비 비율로 그릴 것.

```ts
// ── #5 비교 ────────────────────────────────────────────────────────────
type TraceCompare = {
  baseline: CompareSide; target: CompareSide;
  deltaMs: number;                 // target − baseline (지속시간)
  rows: CompareRow[];              // 델타 절댓값 내림차순
};
type CompareSide = { traceId: string; startTs: number; durationMs: number;
                     spanCount: number; error: boolean;
                     rootServiceUid: string | null; rootName: string };
type CompareRow = {
  path: string;                    // 루트부터의 이름 사슬 ("GET /a > SELECT orders")
  name: string; serviceUid: string | null; serviceName: string;
  baselineCount: number; targetCount: number;
  baselineSelfMs: number; targetSelfMs: number;
  deltaMs: number;                 // target − baseline (자기 시간)
  onlyIn: 'BOTH' | 'BASELINE' | 'TARGET';
};
```
- 🔴 매칭 키는 **경로 서명**이다(이름만 맞추면 트리에서 위치가 다른 두 스팬이 한 줄로 엉킨다).
- 🔴 비교하는 값은 **자기 시간**이다. 지속시간으로 비교하면 같은 지연이 부모 사슬 전체에서 반복돼 표 위쪽이 껍데기로 채워진다.
- 같은 traceId를 두 번 넣어도 막지 않는다(델타 0인 표가 답이다). 한쪽이 없으면 `code 404 APM_TRACE_NOT_FOUND`, 필드가 비면 `code 400`.

```ts
// ── #6 서비스 맵 ───────────────────────────────────────────────────────
type ServiceMap = {
  from: number; to: number;
  nodes: MapNode[]; edges: MapEdge[];
  truncated: boolean;              // 🔴 엣지 2,000 상한에 걸렸다
};
type MapNode = {
  id: string;                      // `${kind}:${ref}` — SERVICE면 ref가 service_uid
  kind: 'SERVICE'|'DB'|'HTTP'|'QUEUE';
  label: string; serviceUid: string | null; env: string | null;
  incoming: number; outgoing: number;
  instrumented: boolean;           // false = 상대편만 보고 그린 노드
};
type MapEdge = {
  fromId: string; toId: string;    // 🔴 MapNode.id와 같은 문자열
  toKind: 'SERVICE'|'DB'|'HTTP'|'QUEUE';
  requests: number; errors: number;
  errorRatePct: number | null;
  p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
  mixedBounds: boolean; sampleWarning: boolean;
};
```
- 🔴 **노드 id는 `kind:ref`이고 `SERVICE`면 ref가 `service_uid`**다(내부 id는 밖으로 나가지 않는다). 엣지의 `fromId`·`toId`와 **같은 문자열**이라 FE는 그것으로만 연결하면 된다.
- **엣지가 없는 서비스도 노드로 선다**(배치 전용·갓 등록된 서비스). 사라지면 사용자가 장애로 오해한다.
- `env` 필터는 🔴 **호출하는 쪽에만** 걸린다 — 반대편까지 거르면 "스테이징이 운영 DB를 부른다" 같은 사고가 맵에서 사라진다.
- `service`(uid)를 주면 **그 서비스에 닿는 엣지만**(1홉 이웃) + 그 서비스 노드만 시드한다.
- 노드 유형 판정(BE 롤업이 정한다): 자식 스팬이 다른 서비스에 있으면 `SERVICE` → `messaging.system`이면 `QUEUE` → `db.system`이면 `DB` → 나머지 `HTTP`. 🔴 **대상을 식별할 수 없는 CLIENT 스팬은 엣지가 되지 않는다**(빈 노드에 전부 뭉치면 맵이 가장 굵은 화살표로 거짓말한다).

```ts
// ── #7 엣지 시계열 ─────────────────────────────────────────────────────
type EdgeSeries = {
  step: number;                    // 🔴 300·900·1800·3600 중 하나(요청값을 올림)
  fromId: string; toId: string; toKind: string;
  points: { ts: number; requests: number; errors: number;
            errorRatePct: number | null;
            p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
            mixedBounds: boolean }[];
};
```
- `toRef`는 **맵 응답의 `toId`에서 `kind:` 접두어를 뗀 값**을 그대로 보낸다(`SERVICE`면 `service_uid`).
- 🔴 **빈 구간은 점을 만들지 않는다.** 엣지가 없던 5분은 "호출 0건"이 아니라 "그 경로가 관측되지 않았다"이고, 0으로 그리면 끊긴 것처럼 보인다.
- 그 창에 엣지가 하나도 없으면 `code 404 APM_EDGE_NOT_FOUND` — "없는 경로"가 아니라 **"창을 넓혀 보라"** 는 뜻이다.

```ts
// ── #8·#9 예외 그룹 ────────────────────────────────────────────────────
type ErrorGroups = { total: number; rows: ErrorGroupRow[] };
type ErrorGroupRow = {
  groupId: number; serviceUid: string | null; serviceName: string;
  exceptionType: string;
  messageNorm: string;             // 🔴 정규화형(숫자·id·따옴표 값이 ?)
  count: number;                   // 🔴 창 안 발생 수 — **요청한 창보다 넓다**(아래 "1시간 버킷" 참고)
  countTotal: number;              // 🔴 **보존 90일 전체**의 합(창 안 합과 다른 창이다). ⚠️ 2026-09-02 개정 — 예전의 "평생 누적"이 아니라 보존이 지나면 줄어든다
  firstSeenAt: string; lastSeenAt: string;   // ISO-8601 UTC
  sampleTraceId: string | null;    // 🔴 7일 뒤 만료
  topRoutes: { route: string; count: number }[];   // 최대 5
};
type ErrorGroupDetail = {
  summary: ErrorGroupRow;
  sampleStack: string | null;      // 절단·마스킹된 스택트레이스
  routes: { route: string; count: number }[];      // 창 안 전체, 발생 수 내림차순
};
```
- 🔴 **목록은 창 안에 발생이 있는 그룹만** 준다(INNER JOIN). 안 그러면 90일 전에 한 번 터진 오류가 `countTotal`이 커서 오늘 화면 맨 위에 뜬다.

##### 🔴 1시간 버킷 — `count`는 창보다 넓고, 목록에 뜨는 그룹은 정확하다 (2026-09-02 QA D1)

`apm_error_group_1h`는 **1시간 버킷**이라, 창을 그 경계로 자르면 사건이 든 버킷이 통째로 빠진다.
QA 실측: 17:03에 16:34~16:49의 예외 8그룹이 실재하는데 `?from=now-15m` → `total 0`,
`now-60m` → `total 0`, `now-120m` → `total 8`. **화면은 정상처럼 보이는 빈 화면**을 보여 줬고
(`"이 기간에 발생한 예외가 없습니다"`), `new-errors`는 창 시작이 배포 시각(분 단위)이라
**모든 창에서 언제나 0건**이었다.

지금은 **버킷 조인의 창 시작만 정시로 내린다**. 그 결과 두 값의 성질이 갈린다:

| | 정확도 |
|---|---|
| **어떤 그룹이 목록에 뜨는가** | 🔴 **정확하다** — 그룹 행의 초 단위 `first_seen_at`·`last_seen_at`이 창과 겹치는지 2차로 거른다 |
| **`count`(창 안 발생 수)** | ⚠️ **근사다** — 창을 덮는 정시 버킷 **전체**의 합이라 요청한 창보다 넓다(최대 1시간) |

1시간 해상도에서 15분치를 떼어 낼 방법은 없고, 선택지는 "넓게 세거나 0을 보여 주거나"였다.
🔴 **화면은 두 값을 같은 무게로 읽지 말 것** — 목록·정렬은 믿고, 건수는 "이 시간대에 이만큼"으로
읽어야 한다. 그룹 시계열(#10)의 해상도도 같은 이유로 **1시간이 바닥**이다.

⚠️ **5분 버킷 테이블(맵·DB·의존)에는 같은 보정을 걸지 않았다.** 사각지대가 5분이라 FE 최소
프리셋(15분)에서는 대부분 살아나고, 그쪽은 정확한 건수가 쓸모 있는 표다. 대신 §10.0-6대로
**"최근 5분"을 기본 창으로 쓰지 말 것**(실측: 17:05에 `db/queries?from=now-5m` → 0, `now-15m` → 28).
- 🔴 **상세는 창에 버킷이 없어도 404가 아니다**(LEFT JOIN). 링크를 타고 온 사용자에게 그룹의 정체를 못 보여 주면 안 된다. 그때 `count`는 0이다.
- `route`가 `__unrouted__`인 것은 **경로가 없던 요청**이다(라우팅 전 거부·비HTTP·배치). 화면은 "경로 없음"으로 번역할 것.
- 지문 규칙(BE): `sha256(예외타입 + '|' + 정규화 메시지)`. 🔴 **스택 프레임은 넣지 않았다** — 스택이 절반의 이벤트에만 있어 같은 오류가 두 그룹으로 갈리고, 같은 예외가 두 호출 경로에서 나면 쪼개지는데 그건 대개 같은 버그다.
- `sort`: `count`(기본) | `countTotal` | `lastSeenAt` | `firstSeenAt`.
- 열람 권한: 설계서 §8.1은 "스택 원문 🅐 또는 설정"이라 적었지만 **이번 물결은 운영자 읽기**다. 저장 시점에 `mask_sql`·`keep_raw_sql`이 이미 적용된 값이라, 조회에서 한 번 더 가르면 "저장은 했는데 아무도 못 본다"가 된다. 🔴 **열람을 좁혀야 하면 저장을 좁히는 것이 먼저**다.

```ts
// ── #11~#14 DB 쿼리 ────────────────────────────────────────────────────
type DbQueryGroups = { total: number; rows: DbQueryRow[] };
type DbQueryRow = {
  groupId: number; serviceUid: string | null; serviceName: string;
  dbSystem: string;                // postgresql | mysql | redis … 없으면 ''
  queryNorm: string;               // 🔴 정규화형(리터럴 ?, IN (?) 로 접힘)
  count: number; errors: number;
  totalMs: number;                 // 🔴 정렬 기본축
  avgMs: number;
  p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
  mixedBounds: boolean;
  firstSeenAt: string; lastSeenAt: string;
  sampleTraceId: string | null;    // 🔴 7일 뒤 만료
};
type DbSystems = {
  flows: { serviceUid: string | null; serviceName: string; dbSystem: string;
           count: number; errors: number; totalMs: number }[];
};
```
- 🔴 **정렬 기본이 `totalMs`(총 소요)** 다. "가장 느린 쿼리"(p95)와 "가장 오래 잡아먹는 쿼리"는 다르고, 고쳐서 이득인 것은 대개 후자(30ms × 10만 번 = N+1)다. `sort`: `totalMs`(기본) | `count` | `errors` | `avgMs` | `lastSeenAt`.
- 지문 = `sha256(db_system + '|' + 정규화 SQL)`. 같은 SQL이 postgres와 redis에서 나올 수 있어 시스템이 키에 들어간다.
- 🔴 쿼리 문자열의 출처는 `db.query.text` → `db.query.summary` → **스팬 이름** 순이다. 마스킹 정책이 `DROP`이면 앞 둘이 없고, 그때 `queryNorm`이 `"SELECT orders"`처럼 스팬 이름이 된다(표의 행이 서는 것이 목적).
- 🔴 **커넥션 스팬은 그룹이 아니다** (2026-09-02 QA D8). OTel 자바 에이전트의 JDBC **커넥션 획득**
  스팬은 `db.query.text`를 **빈 문자열**로 실어 오는데, 이름 폴백이 그것을 쿼리로 만들어
  `dmove_apm|postgres`가 "느린 쿼리 Top" **3위**(90.1ms·26회)에 섰다. 지금은 **키가 있는데 비어 있는**
  스팬을 제외한다. ⚠️ 키가 **아예 없는** 경우(정책 DROP)는 그대로 이름 폴백을 쓴다 — 갈라 두지
  않으면 `mask_sql=false` 설치본의 DB 화면이 통째로 빈다.
- `/db/systems`(sankey) 흐름의 굵기는 **건수가 아니라 `totalMs`** 다.
- ⚠️ `dbSystem`이 빈 문자열이면 계측이 `db.system`을 주지 않은 것이다 — 화면은 "미상"으로.

```ts
// ── #15·#16 외부 의존 ──────────────────────────────────────────────────
type Dependencies = {
  rows: { serviceUid: string | null; serviceName: string;
          target: string;          // server.address (포트·경로 없음)
          count: number; errors: number; timeouts: number;
          errorRatePct: number | null;
          p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
          mixedBounds: boolean }[];
};
```
- 🔴 **`timeouts`는 `errors`의 부분집합이 아니다.** 타임아웃인데 스팬 상태가 `UNSET`인 경우가 있다(호출자가 삼키고 폴백) → `timeouts > errors`인 행이 나온다. "느려서 끊었다"와 "500을 받았다"는 대응이 다르다.
- ⚠️ 타임아웃 판정은 **문자열 휴리스틱**(`error.type`·예외 타입/메시지에 `timeout`)이라 SDK에 따라 **놓칠 수 있다**. 과다 계상보다 과소 계상 쪽으로 기울여 두었다.
- `service`를 안 주면 같은 주소가 **서비스별로 여러 줄**이다("게이트웨이가 느린데 어느 서비스에서 느린가"가 그 상태로 읽힌다). 한 줄로 합치고 싶으면 화면이 `target`으로 접는다.
- 🔴 **계측된 서비스로 해소된 호출은 여기 없다** (2026-09-02 QA D9, **결정 번복**). 예전에는
  "상대가 우리 서비스여도 넣는다"였고(게이트웨이 뒤 구성에서 구분이 흐려진다는 이유), 그 결과
  qa-node→qa-python 호출 **44건이 두 벌로** 적재돼 서비스 맵에는 `SERVICE` 엣지로, 이 화면에는
  **`127.0.0.1`** 이라는 이름으로 함께 떴다. 화면 이름이 "외부 호출"이라 사용자는 그것을 "우리가
  계측하지 않은 상대"로 읽는데 실제로는 옆 서비스의 루프백 주소다. 지금은 **서비스 맵의 `SERVICE`
  엣지 판정과 같은 조인**(자식 스팬이 다른 서비스에 있는가)으로 제외한다.
  - ⚠️ **상대가 계측돼 있어도 그 스팬이 아직 안 왔으면** 외부로 분류된다(집계 LAG 3분 안에 도착하지
    못한 경우). 맵의 `SERVICE`/`HTTP` 판정이 흔들리는 것과 **같은 조건**이다.
  - ⚠️ **과거 버킷의 기존 행은 남는다**(대입 UPSERT라 대상에서 빠진 키는 갱신되지 않는다). 롤업이
    다시 도는 구간만 사라지고, 그보다 오래된 `127.0.0.1` 행은 보존 30일 동안 화면에 남아 있다.
- 목록 상한 500행.

```ts
// ── #10·#13·#16 공용 시계열 ────────────────────────────────────────────
type AggSeries = {
  step: number;                    // 실제로 쓴 해상도(초)
  points: { ts: number; count: number;
            errors: number | null; timeouts: number | null;
            avgMs: number | null;
            p50Ms: number | null; p95Ms: number | null; p99Ms: number | null;
            mixedBounds: boolean }[];
};
```
| EP | step | count | errors | timeouts | avgMs·백분위 |
|---|---|---|---|---|---|
| `/apm/errors/{id}/series` | 🔴 **항상 3600**(원천이 1시간 버킷) | ✅ | `null` | `null` | `null` |
| `/apm/db/queries/{id}/series` | 300 | ✅ | ✅ | `null` | ✅ |
| `/apm/dependencies/series` | 300 | ✅ | ✅ | ✅ | 백분위만 ✅, 🔴 `avgMs`는 **항상 null** |

🔴 `null`은 "0건"이 아니라 **그 축이 없다**는 뜻이다. 예외는 전부가 오류라 `errors` 축이 없고, `apm_dependency_5m`에는 `sum` 컬럼이 없어 평균을 낼 수 없다(설계 §7 표 그대로 — 평균이 필요하면 스키마 변경이 먼저).

##### 🔴 백분위는 이제 **실측 범위 안**이다 (2026-09-02 QA D5 · V46)

QA 실측: `db.query.text` 1건(실제 **110ms**)짜리 그룹이 `avgMs 110` · **`p50Ms 175`** · `p95Ms 242.5` ·
`p99Ms 248.5`를 냈다. p50이 평균의 1.59배다 — **단일 관측이면 셋 다 평균과 같아야 한다.** 화면에서는
서로 다른 두 행(240ms 1건 / 110ms 1건)이 **둘 다 p95 242.5ms**로 나오는 형태로 드러났다(같은
히스토그램 칸 `(0.1, 0.25] s`).

원인은 5분 롤업 테이블이 `count`·`sum`·`hist_counts`만 갖고 있어 백분위를 **버킷 경계 사이 보간**으로만
냈기 때문이다. V46이 세 테이블(엣지·DB·의존)에 `min`·`max`를 더했고, 조회는 그 범위로 세 백분위를
**모두 조인다**(메트릭 쪽은 P1 QA D2에서 이미 같은 보정을 받았다 — 트레이스만 물려받지 못했었다).

- **FE 영향 없음**(필드가 늘지 않았다). 값이 더 정확해질 뿐이다.
- ⚠️ **V46 이전에 쌓인 버킷은 보정되지 않는다**(그 두 값이 NULL) — 그 구간의 백분위는 예전 값
  그대로다. 되메우려면 원본 스팬(7일 보존)을 다시 훑어야 하고, 얻는 것이 "과거 창이 조금 더
  정확해진다"뿐이라 하지 않았다.
- ⚠️ `mixedBounds:true`이거나 `bounds_id`를 모르면 여전히 백분위는 `null`이다(보정 이전의 판정).
🔴 **빈 구간은 점을 만들지 않는다**(RED 시계열과 다르다). 관측이 없던 것과 0건인 것을 서버가 구분할 수 없다.

```ts
// ── #17 exemplar 점프 ──────────────────────────────────────────────────
type Exemplars = {
  metric: string;
  step: number;                    // 🔴 창이 보존을 넘으면 승격된다(60→300→3600)
  empty: boolean;                  // 🔴 오류가 아니다 — SDK가 exemplar를 안 붙였을 수 있다
  points: {
    ts: number;
    count: number;
    maxMs: number | null;          // 🔴 2026-09-02 **의미 변경**(QA D17) — 아래를 반드시 읽을 것
    traceId: string;
    stored: boolean;               // 🔴 2026-09-02 신설(가산 필드) — 아래를 반드시 읽을 것
  }[];
};
```
- `metric` 기본값 `http.server.request.duration`.
- 버킷마다 **exemplar 값이 가장 큰 행의 traceId** 하나(dims는 합친다). 화면이 쓰는 자리가 "차트의 그 시점 막대"이고 그 막대도 dims 합산이라, dims별로 나눠 주면 고르는 규칙이 두 곳에 생긴다.
- `maxMs`는 **경계 패밀리로 단위를 환산한 값**이다(`duration_s`는 초 → ms). 게이지처럼 경계가 없으면 원값 그대로다.

##### 🔴 `maxMs` = **버킷의 최댓값이 아니라 그 traceId가 가리키는 요청의 값**이다 (2026-09-02 QA D17, 의미 변경)

2회차 종단 QA에서 칩이 **`09-02 17:10 · 104.88 s`** 라고 적으면서 **130.9 ms**짜리 `POST /auth/login`
트레이스로 링크됐다(**800배**). 같은 수가 다섯 버킷에 그대로 반복되고 `traceId`만 매 버킷 바뀌었다.

원인은 **두 값의 출처가 달랐던 것**이다 — 라벨은 `apm_metric_1m.max` 컬럼에서, 링크는
`exemplar_trace_id`에서 왔다. CUMULATIVE(자바/Node 에이전트 기본) 히스토그램에서 `count`·`sum`은
직전 관측과 빼서 증분을 얻지만 **극값은 뺄 수 없어** 누적 최대가 리셋되지 않는다. 환경 격리로
확정했다 — `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta`로만 바꿔 재기동하니 그 시점
이후 버킷부터 값이 버킷마다 달라졌다.

- **지금 `maxMs`는 OTLP exemplar 자신이 실어 온 값**(`asDouble`/`asInt`)이다. 그래서 라벨과 링크가
  언제나 **같은 요청**을 가리킨다(temporality와 무관).
- 🔴 **V47 이전에 쌓인 버킷은 `null`이다**(링크는 살아 있다). 옛 `max`로 메우지 않는다 — 그 값이
  바로 위의 거짓말이라 되살리면 화면에서 고친 것이 되돌아간다. 1m 보존(7일)이 지나면 사라지고,
  5m/1h로 승격된 구간은 더 오래 `null`로 남는다. FE는 이미 `number | null`을 다루므로 변경 불필요.
- ⚠️ **필드명은 `maxMs` 그대로 두었다.** 이름이 새 의미와 어긋나지만, 개명은 FE(`ApmExemplarStrip`
  — 정렬 키와 칩 라벨 두 곳)를 동시에 고쳐야 해서 이번 BE 단독 수정 범위 밖이다. 개명 제안은 아래
  `🔄 FE 요청사항`에 남겼다.
- ⚠️ **같이 바뀐 것**: CUMULATIVE 히스토그램은 이제 `min`/`max` 컬럼을 **저장하지 않는다**(NULL).
  그 결과 ① 백분위의 min/max 클램프(§10 D5)가 CUMULATIVE 구간에서 생략된다(= 보간만 쓰던 예전 값),
  ② **실시간 개요의 "느린 엔드포인트" Top이 CUMULATIVE 수신에서는 비어 보인다**(그 목록이 max로
  고른다). 둘 다 delta로 보내면 정상이고, 설치 가이드가 이제 그 사실을 명시한다.

##### 🔴 `stored` — 이 필드가 없으면 exemplar 링크는 **전부 죽은 링크**다 (2026-09-02 QA D2, 실측)

종단 QA에서 **exemplar 23개 중 저장된 트레이스가 0개**였다(대조군인 에러 그룹 `sampleTraceId` 8/8,
DB 그룹 12/12는 전부 열린다). 이유는 구조적이다 — exemplar는 **메트릭 경로**(요청 100%)에서 오고
트레이스는 **Collector tail 샘플링**을 통과한 것만 남는다(오류 100% · ≥2s 100% · 나머지 2%).
exemplar가 고르는 값은 그 버킷의 **최대 지연**인데, 그 최대값이 2초 미만·정상 응답이면 남을 확률이 2%다.

- **`stored: false`면 링크를 걸지 말 것.** 대신 "이 요청은 샘플로 저장되지 않았습니다"로 표시한다.
  값(지연·건수)은 그대로 쓸모가 있으므로 점 자체는 그려도 된다.
- 🔴 **눌러 보게 두면 안 되는 이유**: 상세 EP는 "샘플링 탈락"과 "보존 만료"를 **구분할 수 없다**
  (지워진 행은 흔적을 안 남긴다). 그래서 `APM_TRACE_NOT_FOUND` 하나로 답하고, 화면은 §10.0-2 지침대로
  **"만료됐습니다"** 를 띄운다 — 사용자는 보존 기간을 의심하며 창을 좁혀 보고 **영원히 열리지 않는다**.
- 서버는 `apm_trace_summary`를 **배치 한 번**으로 확인한다(창 ±5분으로 파티션 프루닝). 예전 주석의
  "점마다 찌르는 비용이 크다"는 **확인 방법을 잘못 가정한 것**이었다.
- ⚠️ **`true`가 영원한 보장은 아니다.** 조회 시점의 사실이고, 7일 보존을 넘기면 그 링크도 404가 된다
  — 그때의 안내는 여전히 "만료됨"이 맞다.
- ⚠️ 창 경계 밖(±5분 초과)에서 시작한 트레이스는 저장돼 있어도 `false`로 보인다. **링크가 하나 덜
  열리는** 방향이라 안전하다(반대는 사용자를 404로 보낸다).

### 10.3 오류 코드 (신설 4)

| code | body code | 언제 |
|---|---|---|
| `APM_TRACE_NOT_FOUND` | 404 | 스팬도 요약도 없다. 🔴 **보존 7일 만료가 가장 흔한 원인** — "만료됨"으로 안내할 것 |
| `APM_TRACE_COMPARE_INVALID` | 400 | 🔴 **2026-09-02 신설**(QA D10). `POST /apm/traces/compare` 본문에 `baselineTraceId`·`targetTraceId`가 없다. 예전에는 이 검증도 `APM_TRACE_NOT_FOUND`를 재사용했는데, 그러면 `code`(400)와 `errorCode`("찾을 수 없음")가 **서로 다른 이야기**를 해 화면이 **호출부 버그**를 "만료됨"으로 안내했다. 이 코드가 오면 고칠 곳은 요청을 만든 화면이다(사용자가 할 일이 없다) |
| `APM_ERROR_GROUP_NOT_FOUND` | 404 | 예외 그룹 id 없음(마지막 발생 90일 경과 가능) |
| `APM_DB_QUERY_GROUP_NOT_FOUND` | 404 | DB 쿼리 그룹 id 없음 |
| `APM_EDGE_NOT_FOUND` | 404 | 그 창에 엣지가 없다. 🔴 "존재한 적 없다"와 구분하지 않는다 — 창을 넓히라고 안내 |

기존 재사용: `APM_SERVICE_NOT_FOUND`(404), `APM_INVALID_SORT`(400).

### 10.4 🔄 FE 반영 (7.10~7.13 · 7.15)

- **7.10 트레이스 탐색**: 산점도(#2) 브러시 → 목록(#1) → 워터폴(#3)/플레임(#4)/비교(#5). `spans`를 그대로 세로로 그리고 `depth`로 접는다. `criticalPath`를 굵게. `rootMissing`·`cycleBroken`·`truncated` 배지 필수.
- **7.11 에러**: #8 표 → #9 상세(스택 뷰어 C16) → #10 추이. `__unrouted__` 번역, `sampleTraceId` 404를 "만료됨"으로.
- **7.12 DB**: #11 표(기본 정렬 `totalMs`) → #12/#13, #14 sankey(C12).
- **7.13 외부 호출**: #15 표(타임아웃 열 별도) → #16 추이.
- **7.15 서비스 맵**: #6 → React Flow + dagre. `node.id` 문자열로만 연결. 레이아웃 저장 EP는 **아직 없다**.
- 공통: **"샘플 기준" 배지**와 **집계 최대 8분 지연** 안내를 화면에 둘 것(§10.0-1·6).

### 10.5 🔴 권한 — DMOVE 권한 축 · 원문 열람 (2026-09-02 신설 → **2026-09-03 축 전환**)

> **🔴 2026-09-03 개정 — 판정 축이 "역할"에서 "DMOVE 권한"으로 바뀌었다.**
> 예전 문서(아래 회색 이력)는 `ADMIN ∪ SUPER_ADMIN`을 기준으로 썼다. 지금은 **사용자 권한 관리
> 화면의 체크박스**가 정본이고, FE가 소비할 키는 `permissions.apm.view` / `permissions.apm.edit`다.

#### (1) FE가 알아야 할 것 — 요약

| 항목 | 값 |
|---|---|
| 모듈 이름 | **`applicationMonitoring`** (역할 편집 화면의 아코디언 그룹) |
| 기능 이름 | **`apm`** — 평탄화 후 `permissions.apm` |
| 쓰는 칸 | **`view`**(조회) · **`edit`**(관리). `delete`·`download`는 **대응 EP가 없다**(체크해도 아무 EP도 열리지 않는다) |
| 신규 역할 기본값 | `view=true` · `edit`은 관리자 역할만 true |
| 기존 역할 | **`V48` 마이그레이션이 백필**한다 — `view=true`·`edit=false`. 백필이 없으면 화면에 체크박스 자체가 안 뜬다 |
| 관리자 | `userRole ∈ {ADMIN, SUPER_ADMIN}`은 **권한 JSON과 무관하게 통과**(`DmovePermissionChecker` 내장 우회) |
| 원문(스택·스팬 속성) | 🔴 **권한 축이 아니라 여전히 역할 축**(ADMIN 이상). 아래 (3) |
| FE 상태 | ✅ **이미 맞춰져 있다**(2026-09-03 FE 물결) — `useApmPermissions`(`canView`/`canEdit`) · `DmovePermissionsKey.APPLICATION_MONITORING = "apm"` · 라벨 예외표 `constants/permissionLabels.ts`. 🔴 그 표가 필요한 이유: 로케일에 `apm`이 **객체 루트**(`apm.menu.*`)라 `t("apm")`이 키 원문을 찍는다 → 라벨만 `apm_permission`으로 우회하고 **권한 키는 BE `feature.name`과 같게 유지**한다 |

#### (2) EP별 축

| 축 | 판정 | 대상 |
|---|---|---|
| 조회 | `ApmAccessChecker.requireRead` → **`apm.view`** | APM 조회 EP 36개 — 개요·서비스(12)·RED·런타임·인스턴스·실시간(스냅샷·SSE)·서비스 맵(2)·트레이스(5)·에러(3)·DB(4)·의존(2)·exemplar·배포 조회(3)·`GET /apm/services/{uid}/alert-rules` |
| 관리 | `ApmAccessChecker.requireEdit` → **`apm.edit`** | APM 관리 EP 26개 — 수집 토큰(GET·POST·DELETE)·수집기(목록·시계열·기본값·설정 YAML·설치 가이드)·수신 상태(recent·drops)·APM 설정(GET·PUT)·알람 규칙(목록·생성·수정·삭제·resync·preview·zabbix-status·alert-events)·등록 관리(pending·approve·reject·unknown)·서비스 `PUT`/`DELETE` |
| 원문 | `ApmAccessChecker.canViewRawText`(**역할 축 유지**) × `keep_raw_sql` | `TraceDetail.spans[].attrs`·`events`·`links`, `ErrorGroupDetail.sampleStack` |

- 🔴 **관리 축은 "쓰기"가 아니라 "관리 화면"이다.** 수집 토큰 목록·APM 설정 조회·설치 가이드·
  미등록 서비스 목록은 전부 **GET**이지만 수신 경로·설치 절차를 담고 있어 `edit`이다. 반대로
  `POST /apm/traces/compare`는 아무것도 바꾸지 않는 조회라 `view`다. **HTTP 메서드로 추측하지 말 것.**
- 🔴 **`view`와 `edit`은 서로를 함축하지 않는다.** `edit`만 켠 역할은 조회 EP에서 거부된다
  (테스트가 그 성질을 고정한다). FE도 두 값을 각각 봐야 한다 — 메뉴 노출은 `view`,
  수집기·설정·알람 규칙 **탭과 버튼**은 `edit`.
- ⚠️ **거동 변경 ①(조회가 다시 열린다)**: 2026-09-02~09-03 사이에만 존재했던 "일반 USER는 APM
  조회 불가"가 **원상 복구**된다(기본값 `view=true`). P1까지의 동작과 같다. 좁히려면 역할에서
  체크를 끈다 — 코드가 아니라 데이터로 답한다.
  ✅ **FE 반영 완료**: 2026-09-02에 사이드바 APM 메뉴를 `useIsUserRoleAdmin`으로 가렸던 것을
  `useApmPermissions().canView`로 교체했고, 회귀 테스트(`apmAdminGating.test.tsx`)가 그 파일에
  `useIsUserRoleAdmin`이 되살아나지 않는지까지 본다.
- ⚠️ **거동 변경 ②(관리는 그대로)**: `edit` 기본값이 false이고 관리자는 우회하므로, 아무도 체크를
  켜지 않은 설치본에서 관리 EP를 통과하는 집합은 **오늘과 동일**하다. 달라진 것은 "관리자로
  올리지 않고 APM 관리만 위임할 수 있다"는 선택지가 생겼다는 점뿐이다.
- ℹ️ **비용**: 판정 1회당 `user`+`role` 조회 2건(관리자는 0건 — 우회가 먼저다). `CloudInfra`·`Cost`가
  이미 쓰는 패턴이라 새로운 종류의 부하는 아니다. SSE는 **구독 시작에 한 번만** 판정한다.

<details><summary>이력 — 2026-09-02 역할 축 시절의 기술(참고용)</summary>

설계 §8.1의 🅞(운영자 이상 읽기)가 코드에 없어 일반 `USER`가 서비스 목록·RED 시계열·트레이스
상세·예외 스택·정규화 SQL을 전부 읽을 수 있었다. 이를 `ADMIN ∪ SUPER_ADMIN`으로 잠갔다(우리
역할 축에 "운영자" 등급이 없어서 접은 것). **2026-09-03에 권한 축이 생기면서 그 임시 조치는
철회됐다** — 잠금을 원하면 이제 역할 체크박스로 한다.

</details>

- 거부 형태는 레포 전역 계약대로 **HTTP 200 + body `code:403`**이다(401만 실제 상태 코드).
  🔴 **2026-09-02부터 `errorCode: "FORBIDDEN"` + 한국어 메시지가 함께 나간다**(QA D11).
  🔴 **2026-09-03부터 관리 EP(`apm.edit`)도 같은 모양이다** — 문구만 다르다
  (조회 거부 `"APM 화면을 볼 권한이 없습니다."` / 관리 거부 `"APM 설정을 변경할 권한이 없습니다."`).
  두 거부는 사용자가 처한 상황이 다르다: 전자는 "이 메뉴가 내 것이 아니다", 후자는 "메뉴는
  보이는데 이 버튼만 안 된다". 바디의 `code:403`은 그대로라 **인터셉터 계약은 변하지 않는다**. 예전에는
  `{"status":"error","code":403,"message":"Access Denied"}` — 다른 오류는 전부 `errorCode` + 한국어인데
  403만 영어 + 코드 없음이라 FE가 분기할 축이 없었다. **FE는 숫자(`code === 403`)가 아니라
  `errorCode`로 분기할 것.** ⚠️ APM 밖에서 같은 예외를 던지는 자리(전역 권한 인터셉터 등)는
  **응답이 바뀌지 않았다**(1:1 계약 보존).
  ⚠️ SSE(`/apm/live/stream`)도 같은 판정이며 **emitter를 만들기 전에** 거부한다 —
  만든 뒤 닫으면 `EventSource`가 재연결을 무한히 시도한다.
  🔴 **그 EP는 2026-09-02 이전에 USER에게 `HTTP 401 INVALID_TOKEN`을 주고 있었다**(QA D3, 실측).
  `produces=text/event-stream` 때문에 전역 핸들러의 JSON을 쓰지 못해 `/error` 재디스패치 →
  SecurityContext 없는 익명 401로 빠지는 경로였다. **FE가 그것을 세션 만료로 읽어 refresh →
  재시도 → 로그아웃을 돌렸다면** 그 증상은 이 수정으로 사라진다.

**원문 열람(설계 §8.1 "스택 원문 🅐 또는 설정")** — 두 축이 곱해진다.

| | `keep_raw_sql=false`(기본) | `keep_raw_sql=true` |
|---|---|---|
| 자격 있음(**ADMIN+ — 권한 칸이 아니다**) | 원문(= 이미 마스킹된 저장값) | **원문** |
| 자격 없음 | 원문(같은 값) | 🔴 **마스킹** |

- `keep_raw_sql`이 꺼져 있으면 저장값이 **적재 시점에 이미 마스킹**돼 있어(`ApmSqlPolicy`)
  조회에서 아무 일도 하지 않는다. 즉 기본 설치본의 응답은 **바뀌지 않는다**.
- 마스킹은 **생략이 아니라 값 치환**이다. 스택트레이스의 `at ...` **프레임 줄은 그대로 남고**
  메시지·`Caused by` 줄만 접힌다(프레임을 지우면 스택은 아무 값도 없는 문자열이 된다).
  속성은 **값만** 접고 키는 그대로다.
- `DbQueryRow.queryNorm`에는 별도 판정이 **없다**. 그 값은 `apm_sql_norm()`이 리터럴을 지운
  결과이고(달러 인용까지 — 2차 검수 지적 7 반영), 원문이 아니다.
#### (3) 🔴 원문만 역할 축에 남겼다 (2026-09-03)

- **읽기 티어가 넓어지는 날 원문만 좁게 두려고** 판정을 나눠 뒀는데, 그날이 2026-09-03이다.
  조회는 `apm.view`로 옮기고 **원문(`canViewRawText`)은 `ADMIN ∪ SUPER_ADMIN`에 그대로 두었다.**
- 이유: `apm.view`의 기본값이 **열림**이라, 원문까지 그 칸에 묶으면 "화면을 보라고 준 권한"이
  조용히 **"고객 데이터 원문 열람 권한"**이 된다. 그 승격은 어느 화면에도 표시되지 않는다.
- 즉 **`apm.view`를 받은 일반 사용자는 화면은 보지만 원문은 마스킹본을 본다**
  (`keep_raw_sql`을 켠 설치본에 한해 실제로 값이 달라진다 — 위 표).
  원문을 나눠 주려면 별도 권한 칸이 필요하고, 그것은 이 물결의 범위가 아니다.

---

### 10.6 FE 구현 상태 · 요청사항 (2026-09-02, FE P2 1차 물결)

**구현 완료(FE)**: #1 목록 · #2 산점도 · #3 상세(워터폴 **C7 직접 구현**) · #4 플레임(C8).

화면 셋 — 트레이스 탐색(메뉴 4) · 트레이스 상세(`/application-monitoring/traces/:traceId`) ·
서비스 상세 **트레이스 탭** — 이 **같은 컴포넌트**(`ApmTraceExplorer`)를 필터만 고정해 쓴다.
트랜잭션 탭의 "응답시간 산점도[P2]" 자리도 같은 산점도로 채웠다(선택 엔드포인트가 있을 때만 렌더).
계약이 요구한 표시는 전부 붙였다: 모든 행의 `sampledReason` 배지(네 값 + 원문 + null) ·
"샘플 기준" 안내 · `downsampled` 표본 배지 · `rootMissing`·`cycleBroken`·`truncated` 배지 ·
`totalCapped` "이상" 표기 · `APM_TRACE_NOT_FOUND` → "만료됐습니다" 안내.

**미착수(다음 물결)**: #5 비교 · #6~#7 서비스 맵 · #8~#10 에러 · #11~#14 DB ·
#15~#16 외부 의존 · #17 exemplar.

#### 🔄 FE 요청사항

1. **§10에는 BE 표본 JSON이 없다.** 다른 절은 `src/test/resources/apm/contract/*.json` 8종을 FE
   픽스처가 그대로 옮겨 쓰는데 트레이스에는 그 파일이 없어, FE 픽스처
   (`src/__tests__/fixtures/apmTraceContractSample.ts`)를 **§10.2의 타입·규약 문장에서 지어냈다**
   (파일 상단에 "전부 파생"이라고 명시). `trace-list`·`trace-scatter`·`trace-detail`·`trace-flame`
   네 표본을 내주면 그대로 교체하고 `npm run typecheck:contract`가 진짜 대조 게이트가 된다.
   — **BE 확인 요청**
2. **`route` 필터가 루트 스팬 이름 부분일치**라는 점(§10.2 #1)이 트랜잭션 탭에서 특히 드러난다.
   그 탭은 사용자가 고른 **엔드포인트(`http.route`)** 를 그대로 산점도 필터로 넘기는데 매칭 축이
   달라, "선택한 경로와 정확히 일치하지 않을 수 있다"는 문구를 도움말에 넣어 두었다.
   `apm_trace_summary`에 route 컬럼이 생기면 그 문구를 지운다 — **스키마 변경 시 알려 줄 것**.
3. ~~**§10.5의 FE 요청(사이드바 APM 메뉴를 `useIsUserRoleAdmin`으로 가리기)은 이번 물결에서
   처리하지 않았다.**~~ → **2026-09-02 P2 2차에서 처리 완료**(아래 §10.7 D).

---

### 10.7 FE 구현 상태 · 요청사항 (2026-09-02, FE P2 **2차** 물결)

**구현 완료(FE)**: #6~#7 서비스 맵 · #8~#10 에러 · #11~#14 DB · #15~#16 외부 의존.
~~**여전히 미착수**: #5 트레이스 비교 · #17 exemplar 점프.~~ → **#17은 3차 물결에서 착수**(§11.8). **남은 것은 #5 트레이스 비교뿐**이다.

- **서비스 맵**(메뉴 3, `/service-map`) — React Flow + **`@dagrejs/dagre` 3.1.1 신규 추가**(MIT,
  exact pin). 노드 유형 4종을 모양·아이콘 두 축으로 구분(색만 쓰면 색각 이상 사용자에게 같아
  보인다), 엣지 굵기=호출수(**제곱근 스케일**), 색=오류율, 라벨=p95. 엣지 클릭 → 사이드패널의
  #7 시계열 두 장. `truncated`·끝점 없는 엣지 수·`mixedBounds`·`sampleWarning` 전부 표시.
- **에러·DB·외부 호출**(메뉴 5·6·7) — 라우트는 만들고 **SideNav에는 넣지 않았다**(설계 §1.2
  상위 6개만 노출). 진입은 서비스 상세 탭 3개(`APM_SERVICE_TAB_READY`에 추가)와 전역 검색이다.
  각 화면의 본체(`Apm*Explorer`)를 전용 화면과 서비스 상세 탭이 **같이 쓴다**(트레이스와 동일 구조).
- 계약이 요구한 표시: **"샘플 기준 · 집계 최대 8분 지연" 안내**(§10.0-1·6)를 네 화면 전부에 ·
  `mixedBounds`는 `null`과 **다른 문구**("경계 혼재") · `errorRatePct: null`은 "호출 없음" ·
  `__unrouted__` → "경로 없음" · 빈 `dbSystem` → "미상" · DB 기본 정렬 `totalMs` ·
  타임아웃을 오류와 **별도 열** · `APM_EDGE_NOT_FOUND` → "창을 넓혀 보라"(오류가 아님) ·
  창 밖 에러 그룹(`count:0`)은 404가 아니라 안내 · `sampleTraceId` 만료는 트레이스 상세가 안내.
- **C16(SQL·스택 뷰어)은 `sql-formatter` 없이** `<pre>` + 복사 버튼으로 구현했다(의존성 추가 보류).
  받는 값이 이미 `apm_sql_norm()` 정규화형이라 포맷터를 태우면 오히려 "손대지 않은 원문"처럼 보인다.

#### 🔄 FE 요청사항

1. ~~**§10.6-1과 같은 요청이 이 절에도 그대로 걸린다 — 아직 미해소.**~~ → **2026-09-02 부분
   해소.** BE가 `trace-list`·`trace-list-capped`·`trace-scatter`·`trace-detail`·`trace-flame`·
   `service-map` 여섯을 `src/test/resources/apm/contract/`에 신설했고, FE 픽스처
   (`apmTraceContractSample.ts`·`apmMapContractSample.ts`)를 **그 JSON 내용으로 교체**했다.
   BE 표본이 못 덮는 분기(깊이 2 중첩·병렬 자식·`sampledReason` 원문/null·0ms 점·QUEUE 노드·
   엣지 없는 노드·`errorRatePct:null`)만 `_DERIVED_` 접미를 붙여 파생으로 남겼다.
   **아직 파생인 것**: `service-map-edge-series`·`error-groups`·`error-group-detail`·
   `db-queries`·`db-systems`·`dependencies`·`agg-series`(EP별 3종) — 이 일곱 표본이 나오면
   같은 방식으로 교체한다.
   ↳ 단 **`ErrorGroups`의 모양은 이미 확인됐다**: §11의 `deployment-new-errors.json`이 같은
   `ApmErrorGroupsDto`를 직렬화한 표본이고 FE `TApmErrorGroups`와 필드·nullable이 정확히 일치했다
   (`sampleTraceId:null`·`__unrouted__`·`count`/`countTotal` 분리 포함). 값만 파생으로 남는다.
   — **BE 확인 요청(잔여분)**
2. ~~**`/apm/db/queries/{groupId}` 응답이 `DbQueryRow` 단건인지 확인 필요.**~~ → **2026-09-02
   해소 — 단건이 맞다. FE 수정 없음.** BE 소스로 확인:
   `ApmDbQueryController.detail()`이 `ApiResult<ApmDbQueryGroupsDto.Row>`를 돌려주고
   `ApmDbQueryService.detail()`도 `Row` 하나를 낸다(없는 groupId면 body code 404
   `APM_DB_QUERY_GROUP_NOT_FOUND`). **비대칭은 의도된 것**이다 — `/errors/{groupId}`는 목록 행에
   없는 `sampleStack`·`routes`를 더 싣느라 래퍼가 필요했고, DB 쪽은 상세가 목록 행과 정확히
   같은 정보라 래퍼를 만들 이유가 없다. 목록과 상세의 차이는 조인뿐이다(목록 INNER JOIN =
   창 안에 실행이 있는 그룹만 / 상세 LEFT JOIN = 링크를 타고 왔는데 창이 좁아도 404를 주지 않고
   `count`·`totalMs` 0에 백분위 null). FE는 `TApmDbQueryRow` 단건으로 그대로 둔다. — **해소**
3. **`/apm/dependencies`에 `total`·페이지네이션이 없다**(상한 500행). FE는 서버 페이징을 끄고
   클라이언트에서 접는다. 실 설치본에서 500행에 실제로 닿으면 잘린 사실을 알릴 방법이 없으므로
   (`truncated` 같은 신호가 없다) 그때 필드 추가를 요청하겠다. — **정보 공유**
4. **`/apm/service-map/layout`(사용자별 배치 저장)이 없어** 드래그한 노드 위치가 새로고침에
   사라진다. 화면 각주와 도움말에 그 사실을 적어 두었다. dagre 입력을 정렬해 **같은 데이터면
   같은 그림**은 보장했다(안 그러면 새로고침마다 맵이 뒤집혀 "무언가 바뀌었다"로 읽힌다).
   — **후속 과제(계약 §10.1이 이미 명시)**

#### D. §10.5 관리자 게이트 — 처리 완료

`USER` 계정에게 APM 진입점을 **세 곳 모두** 가렸다: `SideNav`·`MobileSideNav`의 APM 그룹
(`show: isUserRoleAdmin`, 부모에만) + 전역 검색 13항목(`userRoleAdminOnly: true`).
축은 `useIsUserRoleAdmin`(= BE `userRole`)이고 `useIsSuperRole`(Zabbix 역할 혼합)이 **아니다** —
후자로 가리면 "Zabbix 슈퍼관리자인 일반 계정"에게 메뉴가 열리고 API만 막힌다.
홈 위젯 진입점은 **원래 없었다**(위젯 레지스트리 18종에 APM 항목이 없다) — 나중에 APM 위젯을
만들면 그때 같은 축을 걸어야 한다. 회귀 테스트는 `src/__tests__/apmAdminGating.test.tsx`.

---

### 10.6-1 해소 — BE 표본 JSON을 냈다 (2026-09-02)

FE 요청 1(§10.6)에 대한 답이다. `moveseye-be-spring/src/test/resources/apm/contract/`에 **7개를 추가**했고,
전부 **실제 DTO를 애플리케이션과 같은 조건의 `ObjectMapper`로 직렬화한 결과**다(지어낸 값이 아니다).
`ApmContractFixtureTest`가 매 빌드에서 이 파일들과 응답을 대조하므로, **BE가 모양을 바꾸면 BE 빌드가 먼저 깨진다.**

| 파일 | 대응 EP | 이 표본이 특별히 알려 주는 것 |
|---|---|---|
| `trace-list.json` | §10 #1 | `sampledReason` 세 갈래(`SAMPLED`·`ERROR`·`SLOW_INFERRED`)가 실제로 어떤 문자열로 오는지 · 🔴 **루트가 미등록 서비스면 `rootServiceUid`가 `null`이고 `rootServiceName`은 스팬이 말한 문자열 그대로** |
| `trace-list-capped.json` | §10 #1 | `total:100000` + `totalCapped:true` — "10만 건"이 아니라 **"10만 이상"**이다 |
| `trace-scatter.json` | §10 #2 | 🔴 `total`(5만)과 `points.length`(3)가 **다른 것이 정상** — 점을 세어 건수로 읽으면 안 된다 |
| `trace-detail.json` | §10 #3 | 🔴 **고아 스팬**(`orphan:true` + `parentSpanId`가 남아 있고 `depth:0`) · `status:"UNSET"`이 정상이라는 것 · **빈 `attrs`(`{}`)** 가 결측이 아니라는 것 · 예외 `events`·`links`의 실제 모양 |
| `trace-flame.json` | §10 #4 | 🔴 **`roots`가 둘**이다(고아 승격) — 하나라고 가정한 렌더러는 여기서 깨진다 · 접힌 노드의 `count:3` |
| `service-map.json` | §10 #6 | `instrumented:false` 노드(상대편만 보고 그린 DB·외부 HTTP) · 🔴 `mixedBounds:true` 엣지의 백분위가 **전부 `null`**인 모양 |
| `red-series-no-deployments.json` | §2 | 🔴 `deployments:null` — "배포가 없다"가 아니라 **"이 EP는 안 싣는다"**(엔드포인트·인스턴스 시계열) |

⚠️ `red-series.json`(기존)도 **바뀌었다** — `deployments` 배열이 붙었다(§2의 가산 필드).

**FE 할 일**: `src/__tests__/fixtures/apmTraceContractSample.ts`의 "전부 파생" 주석을 지우고 위 파일들로 교체한 뒤,
`npm run typecheck:contract`가 진짜 대조 게이트가 되게 할 것.

**FE 요청 2(`route` 필터 축)**: `apm_trace_summary`에 **route 컬럼을 추가하지 않았다** — 이번 물결의 범위 밖이다.
도움말 문구("선택한 경로와 정확히 일치하지 않을 수 있다")를 **그대로 두면 된다**. 스키마가 바뀌면 이 절에 적는다.

#### FE 반영 완료 (2026-09-02) · 표본이 드러낸 것

`apmTraceContractSample.ts`·`apmMapContractSample.ts`의 "전부 파생" 주석을 지우고 위 여섯 표본으로 교체했다
(`red-series.json`의 `deployments` 가산 + `red-series-no-deployments.json`은 `apmContractSample.ts`에 반영).
**타입 불일치는 §10 트레이스·맵 전 필드에서 0건**이었다 — `ApmTraceListDto`·`ApmTraceDetailDto`·`ApmScatterDto`·
`ApmFlameDto`·`ApmServiceMapDto`를 필드·nullable 단위로 대조했고 FE `types/apm.ts`와 정확히 일치했다.
**§2에만 실제 drift가 있었다**: `TApmRedSeries`에 `deployments`가 없어 추가했다
(`deployments?: TApmDeploymentMark[] | null` + `TApmDeploymentMark`. `null`("이 EP는 안 싣는다")과
`[]`("이 창에 배포가 없었다")를 타입 주석에서 갈라 뒀다. 차트 markLine 소비는 다음 물결).

BE 표본이 못 덮는 분기만 `_DERIVED_` 접미로 파생을 남겼다 — 깊이 2 중첩·병렬 자식(접기·selfMs 규칙)·
`sampledReason` 원문 문자열과 `null`·0ms 산점·QUEUE 노드와 ref 안의 콜론·엣지 없는 노드·`errorRatePct:null`.

**표본을 읽다 나온 확인 요청 둘** — 둘 다 화면은 이미 견디게 돼 있어 급하지 않다:

1. **`trace-detail.json`의 `bbbb111122223333`이 `onCriticalPath:true`인데 `criticalPath` 배열에는 없다.**
   `criticalPathMs`(107.2 = `aaaa` 22.4 + `cccc` 84.8)에도 그 스팬(41)이 빠져 있다. FE는 두 출처를
   **합집합**으로 강조하므로(한쪽이 비어도 강조가 사라지지 않게) 표본 그대로 3행이 강조되는데,
   그러면 **강조된 행의 자기 시간 합(148.2)과 화면에 적히는 `criticalPathMs`(107.2)가 어긋난다.**
   실제 서비스도 둘을 따로 계산해 어긋날 수 있는 것인지, 아니면 표본만 그런 것인지 알려 줄 것.
   (전자라면 FE가 합집합 규칙을 버리고 배열을 정본으로 삼아야 한다.) — **BE 확인 요청**
2. **정규화 SQL이 `db.statement` 키로 온다**(`trace-detail.json`). `ApmDbQueryController` 주석은 원문 SQL이
   `db.query.text`에 있다고 적었는데 표본에는 그 키가 없다. 지금 FE는 속성 키를 특별 취급하지 않아
   영향이 없지만, 트레이스 상세에 "이 스팬의 SQL" 자리를 만들 때 **어느 키를 정본으로 읽어야 하는지**
   (둘 다인지, `keep_raw_sql`이 켜졌을 때만 `db.query.text`가 추가로 붙는지) 확정이 필요하다. — **BE 확인 요청**

#### 10.6-2 위 두 요청에 대한 답 — 둘 다 **표본이 틀렸다** (2026-09-02, P2 종단 QA D6 반영)

**요청 1(크리티컬 패스 3자 정합) — 서비스는 어긋나지 않는다. 표본만 어긋나 있었다.**
QA가 실데이터 **8트레이스**(스팬 4~151, 단일/다중 서비스, 정상/오류/느림)로 대조한 결과
`onCriticalPath:true` 집합 == `criticalPath` 배열(순서까지) == 강조된 스팬의 Σ`selfMs` ==
`criticalPathMs`, **delta 0.0**. 셋은 <b>한 계산</b>에서 나온다(`ApmSpanTree.criticalPath`가
경로를 고르면서 그 마디의 플래그를 함께 세운다) — 어긋날 수가 없다.

- 표본이 어긋났던 이유: 그 세 값을 **손으로 적었다**. 형제 두 스팬(41.0 / 84.8) 중 **짧은 쪽**에
  플래그가 붙어 있었는데, 크리티컬 패스는 "자기 시간 합이 가장 큰 경로"라 짧은 쪽이 뽑힐 수 없다.
  계약이 *"실제 DTO를 애플리케이션과 같은 조건의 ObjectMapper로 직렬화한 결과(지어낸 값이 아니다)"*
  라고 적은 것은 **DTO는 진짜지만 값은 손으로 채운** 상태였다.
- **BE 조치**: 표본의 세 필드(`selfMs`·`depth`·`orphan` 포함)를 **실제 알고리즘을 돌려서** 만든다.
  파일 대조만으로는 "둘 다 틀려도 초록"이라 **불변식 테스트**를 함께 넣었다 —
  플래그 집합 == 배열 == Σ`selfMs` == `criticalPathMs`.
- **🔄 FE 할 일**: `trace-detail.json`을 다시 받고(`bbbb…`의 `onCriticalPath`가 `false`가 됐다),
  **합집합 규칙을 버리고 `criticalPath` 배열을 정본으로** 삼아도 된다. 지금의 합집합 규칙을
  유지해도 결과는 같지만(두 집합이 언제나 같다), 그 규칙을 위해 만든 회귀 테스트는
  **존재하지 않는 서버 거동**을 고정하고 있으니 정리하는 편이 낫다.

**요청 2(SQL 키) — 정본은 `db.query.text` 하나다.**
`keep_raw_sql`이 켜지든 꺼지든 **키는 바뀌지 않는다**(꺼짐 = 마스킹본, 켜짐 = 원문). 표본의
`db.statement`는 구 semconv 형태이고, **실제로 그 키로 오면** 예전에는 저장되지 않았다(QA D4).
2026-09-02부터 적재가 **별칭으로 `db.query.text`에 접어** 저장하므로, 어느 쪽으로 보내든
화면이 읽을 키는 하나다.

- **🔄 FE 할 일**: 트레이스 상세의 "이 스팬의 SQL" 자리는 **`attrs["db.query.text"]` 하나만** 읽는다.
  `db.statement`를 폴백으로 두면 그 키는 영영 오지 않아 죽은 분기가 된다.
- ⚠️ 그 값이 **없을 수 있다**(정책이 `DROP`인 설치본). 그때는 "정책상 저장하지 않음"이 맞는 안내다 —
  "SQL 없음"이라고 하면 쿼리가 아니었다는 뜻으로 읽힌다.

---

## 11. 배포 감지·웹훅·전후 비교 — WBS 3.11 (2026-09-02, BE 구현 완료 · FE 미착수)

서비스 상세 **배포 탭**(화면 §3.11)과 RED 차트의 **배포 markLine**. 설계 §5(`apm_deployment`, 보존 400일)·§8.1(배포 행).

> 설계서·§2에서 "§10.7"로 예고된 내용이 이 절이다. §10(트레이스 조회)의 하위가 아니어서 독립 절로 뺐다 —
> 원천이 트레이스가 아니라 **메트릭**이고, 화면도 다른 탭이다.

### 11.0 먼저 읽을 다섯 가지 (🔴)

1. **원천이 §10과 다르다.** 전후 비교는 **메트릭**(§2 RED)에서 나온다 — 샘플링된 트레이스가 아니라 **건수·오류율이 근사가 아니다**. 대신 메트릭 보존(1m=7일·5m=30일)을 넘긴 배포는 두 창이 모두 빈다(배포 행 자체는 400일 남는다).
2. **`rolloutPct`와 `currentRolloutPct`는 다른 시각의 다른 사실이다.** 전자는 **기록된 값**(웹훅이 준 카나리 비율, 자동 감지는 **항상 `null`**), 후자는 **지금** 그 버전을 보고하는 살아 있는 인스턴스 비율(조회할 때마다 다시 센다). 표에 하나만 보인다면 **가장 최근 행에는 `currentRolloutPct`**, 과거 행에는 `rolloutPct`(없으면 `-`)가 읽기에 맞다.
3. **목록의 기본 창이 §공통과 다르다 — `from`·`to`가 없으면 최근 30일**이다(다른 EP는 1시간). 배포는 하루 몇 건인 사건이라 1시간 기본값이면 탭이 거의 항상 비어 보인다. 명시적으로 준 창은 그대로 존중한다.
4. **웹훅(`POST`)만 실제 HTTP 상태 코드로 답한다.** 같은 경로의 `GET`은 이 레포 계약대로 `200 + body code`다. 한 경로에 두 계약이 공존한다 — 이유는 §11.4.
5. **자동 감지는 세 가지를 못 잡는다**(§11.3). 그 셋은 **웹훅으로 메워야** 하고, 화면 도움말에 그 사실을 적는 편이 정직하다.

### 11.1 EP 표

| # | EP | 인증·권한 | 응답 `data` |
|---|---|---|---|
| 1 | `GET /apm/services/{uid}/deployments?from&to&limit&offset` | 🅞 로그인 + `requireRead` | `Deployments` |
| 2 | `GET /apm/deployments/{id}/compare?window` | 🅞 | `DeploymentCompare` |
| 3 | `GET /apm/deployments/{id}/new-errors?window&limit` | 🅞 | `ErrorGroups` (§10.2와 **같은 타입**) |
| 4 | `POST /apm/services/{uid}/deployments` | 🔴 **수신 토큰 `scope=deploy`** (로그인 아님) | 아래 §11.4 — **envelope 아님** |

#1~#3은 §10과 같다: `@RequiresFeature(APM)` + `@VisitorIdCheck` + `ApmAccessChecker.requireRead`(= `ADMIN ∪ SUPER_ADMIN`), 오류는 `200 + body code`.
🔴 **#3의 응답 타입은 §10.2의 `ErrorGroups`와 글자 그대로 같다** — 에러 그룹 목록 컴포넌트를 그대로 재사용할 것(정렬은 창 안 발생 수 내림차순 고정).

### 11.2 타입

```ts
type Deployments = {
  total: number;              // 창 안의 전체 배포 수(페이지 이전)
  rows: DeploymentRow[];      // 🔴 최신이 먼저
};
type DeploymentRow = {
  id: number;                 // compare·new-errors가 받는 값
  serviceUid: string;
  version: string;            // service.version 원문(최대 128자)
  detectedAt: string;         // ISO-8601. 🔴 분 단위로 잘려 있다
  detectedTs: number;         // 같은 시각의 ms 에폭 — markLine에 그대로
  source: "AUTO" | "WEBHOOK";
  rolloutPct: number|null;         // 🔴 기록값. AUTO는 언제나 null
  currentRolloutPct: number|null;  // 🔴 지금 비율. 살아 있는 인스턴스가 0이면 null(0%가 아니다)
  currentInstances: number;        // 지금 이 버전을 보고하는 인스턴스 수
  meta: Record<string, unknown>|null;  // 웹훅이 실은 자유 서식(커밋·파이프라인 URL). 서버는 해석하지 않는다
};

type DeploymentCompare = {
  deploymentId: number; serviceUid: string; serviceName: string; version: string;
  detectedAt: string; detectedTs: number; source: "AUTO"|"WEBHOOK";
  windowMinutes: number;      // 🔴 **실제로 쓴 값**(요청값이 범위 밖이면 잘린다)
  before: RedWindow;          // [배포 - window, 배포)
  after: RedWindow;           // [배포, 배포 + window)  🔴 배포 시각 자체는 '후'에 들어간다
  delta: DeploymentDelta;
  afterComplete: boolean;     // 🔴 false면 '후' 창이 현재 시각에 잘렸다(진행 중인 배포)
};
type RedWindow = {
  fromTs: number; toTs: number; fromAt: string; toAt: string;
  minutes: number;            // 🔴 잘린 창은 여기가 짧다 — "아직 n분치" 문구의 근거
  requests: number; errors: number;
  rps: number|null; errorRatePct: number|null;   // 요청 0건이면 errorRatePct는 null
  p50Ms: number|null; p95Ms: number|null; p99Ms: number|null; apdex: number|null;
  rebucketed: boolean; sampleWarning: boolean; mixedBounds: boolean;  // §2와 같은 뜻
};
type DeploymentDelta = {   // after - before. 한쪽이라도 null이면 그 항목은 null
  rpsPctChange: number|null;       // 상대 변화율(%)
  errorRatePointDiff: number|null; // 🔴 **퍼센트 포인트**(2%→5%면 +3). 상대 변화율이 아니다
  p50MsDiff: number|null; p95MsDiff: number|null; p99MsDiff: number|null;
  p95PctChange: number|null;       // 상대 변화율(%)
  apdexDiff: number|null;
};
```

- 🔴 **`delta`에 건수가 없다.** `afterComplete:false`일 때 두 창의 길이가 다르므로 `requests`를 그대로 비교하면 "배포 후 요청이 1/12로 줄었다"는 가짜 급락이 나온다. 비율 지표만 비교한다.
- 🔴 **`delta`에 판정(개선/악화)이 없다.** 임계는 서비스마다 다르고, 서버가 정하면 화면이 그것을 **사실로** 표시하게 된다. 이 비교는 인과가 아니라 **나란히 놓은 두 숫자**다(같은 시각에 트래픽 패턴·외부 장애·다른 서비스 배포가 함께 움직였을 수 있다).
- `window`는 기본 60분, `5~1440` 밖이면 **잘라서** 쓴다(거절하지 않는다). 실제로 쓴 값이 `windowMinutes`에 실린다.

### 11.3 자동 감지(AUTO) — 무엇을 배포라고 부르는가

**판정: 살아 있는 인스턴스 중 아무도 보고하고 있지 않던 버전이 관측되면 배포다.**
"인스턴스의 버전 컬럼이 바뀌었나"가 **아니다** — 컨테이너 배포는 기존 인스턴스를 고치지 않고 새 인스턴스를 띄우므로, 인스턴스 단위 변화만 보면 K8s·ECS에서 **한 건도 못 잡는다**. 서비스 단위 집합으로 판정해야 in-place 재시작(윈도우 서비스·systemd)과 롤링 교체가 둘 다 잡힌다.

- **"살아 있다" = 최근 30분 안에 수신이 있었던 인스턴스.** 짧을수록 롤백을 잘 잡고 길수록 유령 배포가 준다 — 30분은 그 사이의 타협이다(설정으로 열지 않았다).
- 🔴 **부트스트랩: 아는 버전이 하나도 없던 서비스의 첫 버전은 기록하지 않는다.** 이 규칙이 없으면 **제품을 처음 켜는 날 돌고 있던 서비스 전부가 "방금 배포됨"으로 찍히고** 그 마커가 400일 남는다. 판정 근거를 DB에서 읽으므로 **BE 재기동도 유령을 만들지 않는다.**
- **감지 시각은 분 단위로 잘린다.** 같은 (서비스·버전·분)은 자연키가 한 행으로 접고, 30분 창 안의 재감지는 별도 조회가 막는다(다중 노드 대비).
- ⚠️ **기록이 실패하면 다음 수신이 재시도한다**(2026-09-02 보강). 감지는 수신 hot path라 무슨 예외가 나도 삼키는데, 전에는 삼키기 **전에** 그 버전을 캐시에 넣어 버려서 — DB가 몇 초 흔들리기만 해도 그 버전이 영원히 "이미 아는 버전"이 되고(캐시 TTL이 지나 DB를 다시 읽을 때쯤이면 그 버전의 인스턴스 행이 이미 저장돼 live set에 들어 있다) **배포 마커 하나가 영구히 사라졌다**. 지금은 실패한 버전을 캐시에서 도로 뺀다.

🔴 **AUTO가 못 잡는 것 세 가지 — 전부 웹훅으로 메운다:**

| 못 잡는 것 | 왜 |
|---|---|
| **같은 버전 재배포** | 서버가 가진 정보(버전 문자열)만으로는 "같은 것을 다시 올렸다"와 "아무 일도 없었다"가 구분되지 않는다 |
| **30분 안의 롤백** | v1→v2 롤아웃 직후 되돌리면 v1 인스턴스가 아직 살아 있는 것으로 보인다. v2가 완전히 걷힌 뒤의 롤백은 잡힌다 |
| **`service.version`을 안 실어 보내는 앱** | 판정 자체가 성립하지 않는다 |

⚠️ 반대 방향 오차도 있다: **30분 넘게 끊겼던 인스턴스가 같은 버전으로 돌아오면** 배포로 기록될 수 있다(그 버전을 도는 다른 인스턴스가 없을 때). "버전이 사라졌다 다시 나타났다"는 사실 자체는 맞다.

### 11.4 웹훅 `POST /apm/services/{uid}/deployments` — 🔴 이 EP만 계약이 다르다

이 레포는 거의 모든 오류를 `HTTP 200 + body code`로 답하지만, **이 EP의 클라이언트는 브라우저가 아니라 파이프라인의 curl 한 줄**이다. `curl --fail`·GitHub Actions 스텝은 상태 코드로만 성패를 가르므로, 200을 주면 **토큰이 틀려도 파이프라인이 초록**이고 배포 마커는 조용히 사라진다. 그래서 OTLP 수신과 같은 규약을 쓴다.

```
POST /apm/services/{uid}/deployments
Authorization: Bearer <수신 토큰 (scope=deploy)>
Content-Type: application/json

{ "version": "1.5.0",            // 🔴 필수. 나머지는 전부 선택
  "detectedAtMs": 1788000000000, // 없으면 수신 시각. 🔴 분 단위로 잘려 저장된다
  "rolloutPct": 20,              // 0~100. 모르면 보내지 말 것(0은 "아무에게도 안 나갔다"는 값이다)
  "meta": { "commit": "9f2c1a", "pipeline": "https://ci/1" } }  // 서버는 해석하지 않는다
```

| 상태 | 본문 | 언제 |
|---|---|---|
| **200** | `{ id, serviceUid, version, detectedAt, created }` — 🔴 **envelope이 아니다**(`status`/`code`/`data` 없음) | 기록됨. `created:false`는 **실패가 아니라 "이미 있었다"**(재전송) |
| **400** | `{ error, code }` | `version` 누락(`APM_DEPLOYMENT_VERSION_REQUIRED`) · `rolloutPct` 범위 밖(`APM_DEPLOYMENT_ROLLOUT_INVALID`) · uid가 UUID가 아님 · **본문이 JSON이 아님**(`APM_DEPLOYMENT_BODY_INVALID`) |
| **401** | `{ error }` | 토큰 없음·틀림·회수됨. 🔴 사유를 자세히 적지 않는다 |
| **403** | `{ error }` | 토큰의 용도가 배포가 아님 · APM 미보유·만료 |
| **404** | `{ error, code }` | 그 `uid`의 서비스 없음(`APM_SERVICE_NOT_FOUND`) |

- 🔴 **깨진 JSON도 실제 400이다**(2026-09-02 보강). 전에는 본문 파싱 실패만 전역 핸들러로 새어 **`200 + INVALID_DATA`**로 나갔다 — 이 EP에서 가장 흔한 실수 하나가 정확히 우리가 막으려던 사고(`curl --fail`이 초록)를 그대로 만들고 있었다. 지금은 웹훅 컨트롤러의 전용 `@ExceptionHandler`가 잡아 위 표대로 답한다.
  - ⚠️ **이 400은 토큰 검사보다 먼저 난다**(스프링이 본문을 먼저 역직렬화한다). 토큰이 틀리고 본문도 깨졌으면 401이 아니라 400이 온다 — CI 로그에서 순서를 오해하지 말 것.
  - ⚠️ **본문을 아예 안 보내면** 파싱 실패가 아니라 `version` 누락이다(`APM_DEPLOYMENT_VERSION_REQUIRED`).
- 🔴 **멱등이다.** 같은 (서비스·버전·**분**)의 재전송은 새 행을 만들지 않고 같은 `id`를 돌려준다. CI 재시도가 마커를 두 번 긋지 않게 하는 것이 이 성질의 전부다.
- 🔴 **기존 수신 토큰(`scopes:["ingest"]`)으로는 못 쓴다.** 관리자가 **`scope=deploy`로 새 토큰을 발급**해야 한다(`POST /apm/tokens`의 `scopes:["deploy"]`). `kind`는 `COLLECTOR`여야 한다 — 브라우저에 심는 RUM 공개 토큰이 서버 쓰기 권한을 얻으면 안 된다.
- ⚠️ **토큰 발급 시 모르는 scope는 이제 거절된다**(`APM_TOKEN_SCOPE_UNSUPPORTED`, 400). 허용은 `ingest`·`deploy` 둘뿐 — `"deploys"` 오타가 통과하면 **아무 문도 못 여는 토큰**이 만들어지고 화면에는 정상으로 보인다.
- **노출면이 다르니 한 토큰에 묶지 말 것**: 수신 토큰은 수집기 설정 파일에 평문으로 들어가고, 배포 토큰은 CI 시크릿에 들어간다.

### 11.5 🔄 FE 반영 (WBS 7.14 배포 탭)

1. **배포 탭**: #1로 표(버전·시각·출처 배지·롤아웃) → 행 선택 시 #2 전후 비교 카드(p95·오류율·rps) + #3 신규 예외 표(에러 그룹 컴포넌트 재사용).
2. **RED 차트의 markLine**: `red-series` 응답의 `deployments`를 그대로 쓴다 — **별도 호출이 필요 없다**(§2). `null`이면 그 차트는 마커를 그리지 않는다.
3. **`afterComplete:false`면 "아직 n분치만 모였습니다"를 반드시 표시**할 것(`after.minutes`). 안 그러면 진행 중인 배포가 "요청 급감"으로 보인다.
4. **`rolloutPct`(AUTO=null)를 `-`로 그릴 것.** 0%로 그리면 "아무에게도 안 나갔다"로 읽힌다.
5. **`new-errors`가 답하는 질문을 문구로 못박을 것** — "이번 배포가 **없던 오류**를 만들었나"이지 "오류가 늘었나"가 아니다. 배포 전부터 있던 오류의 급증은 이 표에 안 나온다(에러 그룹 화면의 시계열이 답한다).
6. 도움말에 **AUTO가 못 잡는 셋**(§11.3 표)을 적고 웹훅 사용법을 안내하면, "롤백했는데 왜 마커가 없냐"는 문의가 줄어든다.

### 11.6 불안한 지점 (검수용)

- **30분 창(살아 있는 인스턴스 기준)은 실측이 아니라 판단이다.** 실 데이터로 유령 배포/미감지 빈도를 재 보지 않았다.
- **다중 노드 중복 방어는 단일 프로세스에서만 검증했다.** 자연키(분 절단) + 30분 창 조회의 조합은 IT가 확인했지만, 두 노드가 같은 분에 동시에 INSERT하는 경합 자체는 재현하지 않았다.
- ~~**웹훅 경로의 `SecurityConfig` permitAll … 실제 필터 체인 왕복은 미검증이다.**~~ ✅ **해소(2026-09-02)** — `ApmDeploymentWebhookSecurityChainTest`가 실제 `SecurityFilterChain`을 통과시켜 **POST permitAll · 같은 경로 GET 401 · `/apm/services/a/b/deployments` 비매칭**을 고정한다. `*`를 `**`로 넓히면 그 테스트가 깨지는 것까지 확인했다.
  - ⚠️ 남은 것: 그 테스트는 **보안 체인만** 세운다(인터셉터 5종은 없다). 라이선스·visitor-id 인터셉터와의 상호작용은 여전히 전체 컨텍스트에서만 드러난다.
- **실서버 왕복 미실시** — 실제 CI에서 curl로 호출해 본 적이 없다(MockMvc·IT 레벨까지만).
- **RED 시계열마다 배포 조회가 한 번 더 돈다.** 인덱스가 있고 행이 적어 비용은 작다고 봤지만, 배포가 수백 건인 서비스의 30일 창에서 재 보지 않았다.

### 11.7 계약 표본 파일 (2026-09-02 신설)

§11의 응답은 **저장소의 JSON 표본으로 고정**돼 있다. FE 픽스처는 타입 선언이 아니라 **이 파일들**을 베껴 쓸 것 — 타입은 `number|null`까지만 말해 주고 "언제 0이고 언제 null인가"는 말해 주지 않는다.

| 파일 (`moveseye-be-spring/src/test/resources/apm/contract/`) | 무엇을 고정하나 |
|---|---|
| `deployments.json` | AUTO/WEBHOOK 두 출처 · 🔴 `currentRolloutPct`의 **0.0(다 걷혔다)과 null(지금 아무것도 안 돈다)** 구분 · `meta` 없는 행 |
| `deployment-compare.json` | 창이 양쪽 다 찬 비교. 🔴 **퍼센트 포인트(`errorRatePointDiff`)와 상대 변화율(`p95PctChange`)이 다른 필드**임을 값으로 보여 준다 |
| `deployment-compare-just-happened.json` | 🔴 **방금 일어난 배포** — `after.minutes:0` · `requests:0` · **`rps:null`**(분모 0) · `delta` 전부 null · `afterComplete:false` |
| `deployment-new-errors.json` | §10.2 `ErrorGroups`와 **글자 그대로 같은 타입**(컴포넌트 재사용) · `sampleTraceId:null`인 행 · `__unrouted__` |
| `webhook-accepted.json` / `webhook-rejected.json` / `webhook-malformed-body.json` | 🔴 웹훅의 **평문 본문**(envelope 아님) 200 / 404 / 400 |

- 🔴 **웹훅 표본 셋은 컨트롤러를 실제로 호출해서 만든다.** 그 본문은 뒤에 record가 없는 `Map`이라, 손으로 지은 표본은 본문이 바뀌어도 같이 바뀌어서 아무것도 지키지 못한다.
- 🔴 **직렬화는 애플리케이션 `ObjectMapper`**(Boot `JacksonAutoConfiguration`)로 한다. 예전에는 `new ObjectMapper()`를 쓰면서 "같은 조건"이라고 **적어만** 두었는데, 그 둘이 갈리면 표본은 전부 초록인데 실제 응답의 시각 필드만 배열로 나가는 상태가 된다. `spring.jackson.*`이 생기면 게이트가 먼저 깨지도록 검사도 함께 있다.

---

### 11.8 FE 구현 상태 · 요청사항 (2026-09-02, FE **3차** 물결 — P2 QA D14 해소)

**구현 완료(FE)**: §11 #1~#3 전량 + §2 `deployments` markLine + §10 #17 exemplar 점프.

- **서비스 상세 배포 탭**(`APM_SERVICE_TAB_READY`에 추가 — 이제 12탭 중 10개가 열린다)
  - 목록 표(`ApmDeploymentTable`) — 버전·시각·출처 배지·**롤아웃 두 열**·meta 칩.
    🔴 롤아웃을 한 열로 접지 않았다: `rolloutPct`(기록·AUTO는 언제나 `—`)와 `currentRolloutPct`
    (지금·`0.0`=다 걷힘 / `null`=도는 인스턴스 없음)가 **다른 시각의 다른 사실**이라서다.
    표본 `deployments.json`의 세 행이 그 세 상태를 정확히 덮어 회귀 테스트가 된다.
  - 행 선택 → 전후 비교(`ApmDeploymentCompareCard`) — **C18 전후 비교 막대** 3장
    (rps·오류율·p95). `afterComplete:false`면 "아직 n분치" 안내, 요청 창과 응답 `windowMinutes`가
    다르면 "실제 적용된 창" 배지. `errorRatePointDiff`는 **%p**, `p95PctChange`는 **%** 로
    문구에 단위를 박았다. **개선/악화 판정은 하지 않는다**(색도 칠하지 않는다).
  - 신규 예외 표 — `ApmErrorGroupTable`·`ApmErrorGroupPanel`을 **그대로 재사용**했다(§11.1의
    "같은 타입"을 화면에서도 지킨다). 문구로 "없던 오류가 생겼나"임을 못박았다(§11.5-5).
  - **웹훅 안내 카드** — `--fail`을 포함한 curl 예시 + AUTO가 못 잡는 셋(§11.3) + 응답 규칙
    (멱등·깨진 JSON이 토큰 검사보다 먼저 400·`rolloutPct` 0의 뜻).
  - 선택·비교 창은 **URL 쿼리**(`?deploy=`·`?deployWindow=`)다 — 차트 마커에서 딥링크로 들어온다.
  - 🔴 **목록에 시간 창을 넘기지 않는다** — 비우는 것이 곧 "서버 기본값(최근 30일)"이다(§11.0-3).
    툴바의 15분을 물려주면 탭이 늘 비어 보인다는 계약 문구를 그대로 따랐다.
- **RED 차트 배포 markLine**(§2 `deployments`) — 서비스 상세 개요 탭의 유입량·오류율·지연 세 장.
  🔴 `null`(안 싣는다) / `[]`(이 창에 없었다) / 항목을 **세 갈래로** 갈랐다
  (`apmDeploymentMarkState`). 캔버스 markLine과 **함께 DOM 범례**(`apm-deployment-marker`)를
  세운다 — 카드가 표 모드로 바뀌면 캔버스가 사라지고, 스크린리더도 그림은 못 읽는다.
- **exemplar 점프**(§10 #17, §10.7 "여전히 미착수" 해소) — 지연 카드 아래 칩 목록.
  🔴 차트 클릭이 아니라 칩인 이유: `ApmChartCard`가 차트↔표 토글을 달고 있어 ECharts 클릭에만
  두면 **표 모드에서 기능이 사라진다**.

#### 🔄 FE 요청사항

1. 🔴 **토큰 발급 화면에 scope 선택이 없다.** 지금 `ApmTokenIssueDrawer`는 `scopes`를 아예 안
   실어 보내(=BE 기본 `ingest`), 화면만으로는 **`scope=deploy` 토큰을 만들 수 없다**. 배포 웹훅
   안내는 붙였지만 그 안내가 시키는 토큰을 제품 안에서 발급할 경로가 없는 상태다.
   `TApmTokenCreateReq.scopes`는 이미 FE 타입에 있으므로 **화면 작업만 남았다** — 다음 물결의
   FE 과제로 잡되, 그 전에 확인이 필요한 것 둘:
   ① 한 토큰에 `["ingest","deploy"]`를 함께 담는 것을 허용하는가(§11.4는 "한 토큰에 묶지 말 것"
   이라고 **권고**하는데, 서버가 거절하는지 허용만 하고 권고인지가 갈린다).
   ② `kind`는 `COLLECTOR` 고정인가(§11.4 문장은 그렇게 읽힌다). — **BE 확인 요청**
2. **`compare`의 `window` 클램프를 화면이 사후에만 알 수 있다.** 요청값이 범위 밖이면 응답
   `windowMinutes`로만 드러나서, 화면은 "실제 적용된 창" 배지를 **응답을 받은 뒤에** 띄운다.
   지금은 프리셋을 `5~1440` 안으로만 두어 실사용에서는 안 걸리지만, 딥링크로 `?deployWindow=99999`
   가 들어오면 한 박자 늦게 정정된다. **정보 공유**(계약 변경 요청 아님).
3. **§10 #17 `Exemplars.points[].stored`를 소비하기 시작했다.** FE 타입은 가산(`stored?: boolean`)
   이라 **키가 없어도 깨지지 않는다** — 그때는 링크를 유지하되 "저장 여부를 확인할 수 없다"로
   안내한다(세 갈래: `true`=링크 · `false`=링크 없음 + "샘플로 저장되지 않음" · 없음=경고 링크).
   🔴 BE가 이 필드를 싣기 시작하면 **필드명·의미를 바꾸지 말 것** — `false`를 "만료"로 읽으면
   QA D2가 지적한 거짓말(보존 7일 안내)이 그대로 돌아온다. — **정보 공유**
4. 🔴 **`Exemplars.points[].maxMs`의 의미가 바뀌었다(2026-09-02, QA D17) — 이름은 그대로다.**
   이제 "그 버킷의 최댓값"이 아니라 **그 `traceId`가 가리키는 요청 자신의 값**이다(§10 #17 참조).
   **FE 코드 변경은 필요 없다** — `ApmExemplarStrip`의 정렬(느린 것부터)과 칩 라벨 둘 다 새 의미로
   그대로 맞고, 오히려 "104.88 s라고 적힌 칩이 130.9 ms 트레이스로 링크"되던 것이 없어진다.
   ① **개명 제안**: 이름이 새 의미와 어긋나므로 다음 FE 물결에서 `valueMs`로 바꾸는 것을 제안한다.
   BE는 두 이름을 잠시 함께 싣는 것도 가능하니, FE가 준비되는 시점을 알려 주면 그때 맞춘다.
   ② ⚠️ **`null`이 늘어난다**: V47 이전에 쌓인 버킷은 값이 없어 `-`로 렌더된다(링크는 살아 있다).
   1m 보존(7일)이 지나면 사라지지만 5m/1h 승격 구간은 더 오래 남는다. — **BE 확인 요청(개명 시점)**
5. ~~⚠️ **실시간 개요의 "느린 엔드포인트" Top이 CUMULATIVE 수신에서는 빌 수 있다**(같은 D17 수정의
   부수 효과). 그 목록은 `maxMs`(실측 최대)로 고르는데, 누적 지표에서는 그 값을 이제 **저장하지
   않는다**(고정된 옛 최대값을 싣느니 없는 편이 낫다는 판정). 오류 축 Top은 영향이 없다.~~
   ✅ **해소(2026-09-02, 코덱스 검수 #1 — BE 수정 완료).** 이건 "빌 수 있다"로 넘길 일이 아니라
   **P1 Live의 회귀**였다(기본 자바 에이전트가 CUMULATIVE라 다수 경로다). 저장 롤업용 극값과
   **Live용 값을 갈랐다** — 링에는 그 export의 히스토그램 최상위 버킷 상한(없으면 exemplar 값)이
   가고, 저장 `max`는 D17대로 계속 `null`이다. 상세·정확도·왜 exemplar를 먼저 쓰지 않는지는
   **§9.4 아래 "🔴 `maxMs`의 출처"** 표 참조. **FE 조치 없음**(필드·타입·의미 불변).
   회귀 테스트 4건(`MetricIngestorTest.CumulativeLiveValues`)이 이 자리를 지킨다 —
   R1 CUMULATIVE 픽스처 2회 적재로 Top의 `maxMs`와 p95가 채워지는 것까지 링을 실제로 거쳐 확인한다.
   ⚠️ 그래도 **`delta` 권장은 유지**한다(CUMULATIVE의 `maxMs`는 상계 근사다). — **정보 공유**

#### D6(크리티컬 패스) — FE 규칙 되돌림

P2 QA가 실데이터 8트레이스에서 `onCriticalPath` 집합 == `criticalPath` 배열 == Σ`selfMs` ==
`criticalPathMs`(delta 0.0)를 확인했으므로, FE의 **합집합 규칙과 그 회귀 테스트를 철회**하고
`criticalPath` 배열 단일 정본으로 되돌렸다(`apmCriticalPathIds`). 합집합은 강조된 행의 자기
시간 합과 화면에 적히는 `criticalPathMs`를 어긋나게 만든다.
🔴 **BE 표본 `trace-detail.json`은 아직 그 어긋난 값을 담고 있다**(`bbbb…`가 `onCriticalPath:true`
인데 배열·`criticalPathMs`에는 없다). FE 픽스처는 그 한 필드만 고쳐
`APM_TRACE_DETAIL_DERIVED_SAMPLE`(`_DERIVED_` 접미)로 두었다 — **BE가 표본을 재생성하면 알려 줄 것.**
그때 파생 표시를 떼고 그대로 옮겨 온다. — **BE 확인 요청**

---

### 11.9 BE 회신 — P2 종단 QA 결함 수정 (2026-09-02, `verification/e2e_apm-p2-qa.md` §1)

BE `a0f13d5` 위에 QA 결함 11건을 반영했다(`:test` **2535 green, skip 0**). FE가 볼 것만 추린다 —
전체 표는 `contract_apm.md` §7.9.

#### 🔴 응답이 바뀐 것 (셋)

| 무엇 | 변화 | FE 조치 |
|---|---|---|
| `Exemplars.points[]` | **`stored: boolean` 가산** | 🔴 **필드명·의미가 §11.8 요청 3에 적어 둔 것과 정확히 같다.** 가산 처리(`stored?`)를 이제 필수로 좁혀도 되고, 세 갈래를 유지해도 안전하다. `false` = "샘플로 저장되지 않음"(만료 아님) |
| `POST /apm/traces/compare` 인자 누락 | `errorCode`가 `APM_TRACE_NOT_FOUND` → **`APM_TRACE_COMPARE_INVALID`** | 그 코드를 "만료" 분기에서 빼고 **호출부 오류**로 다룰 것(사용자에게는 재시도 안내가 무의미하다) |
| 모든 403 | `errorCode: "FORBIDDEN"` + **한국어 메시지** 추가 | 숫자(`code === 403`) 대신 `errorCode`로 분기. 메시지를 그대로 노출해도 한글이다 |

#### 🔴 값이 달라지는 것 (필드 변화 없음)

1. **에러 목록·상세·시계열이 15분·1시간 창에서도 값을 준다**(QA D1). 지금까지 그 창들이 **항상 0건**이었고
   `new-errors`는 **모든 창에서 0**이었다 — 화면이 "예외가 없습니다"를 정상처럼 보여 주던 상태다.
   ⚠️ 대신 `count`는 창을 덮는 **정시 버킷 전체의 합**이라 요청한 창보다 넓다. **목록·정렬은 정확하고
   건수가 근사다** — 화면이 둘을 같은 무게로 읽지 말 것(§10.2 "1시간 버킷" 절).
2. **백분위가 실측 범위 안으로 들어온다**(QA D5 · V46). 관측이 적은 구간에서 `p50 > avg` 같은 값이
   사라진다. ⚠️ V46 이전에 쌓인 버킷은 보정되지 않아 **예전 값 그대로**다.
3. **"외부 호출" 표에서 계측된 서비스 호출이 빠진다**(QA D9). `127.0.0.1`처럼 옆 서비스의 주소가
   외부로 세어지던 것이 사라진다. ⚠️ **과거 버킷의 기존 행은 남는다**(대입 UPSERT) — 보존 30일 동안
   화면에 남아 있을 수 있다.
4. **"느린 쿼리" 표에서 커넥션 스팬이 빠진다**(QA D8). `dmove_apm|postgres` 같은 행이 사라진다.
5. **구 semconv로 보내는 앱의 SQL·DB명·주소가 살아난다**(QA D4). 그동안 그 앱들은 DB 화면에 스팬
   이름이, 서비스 맵에 `mysql` 같은 이름의 노드가 떴다. 별칭이 신 이름으로 접으므로 **화면은 지금대로
   `db.query.text`·`server.address`만 읽으면 된다.**

#### 🔴 `/apm/live/stream`이 USER에게 주던 401이 사라졌다 (QA D3)

유효한 세션의 `USER`가 **`HTTP 401 INVALID_TOKEN`**을 받고 있었다(`produces=text/event-stream`
핸들러에서 예외를 렌더하지 못해 `/error` 재디스패치 → 익명 401). 지금은 **200 + `code:403` +
`errorCode:"FORBIDDEN"`**이다. 🔴 `useApmLive`·axios 인터셉터가 그 401을 **세션 만료**로 읽어
refresh → 재시도 → 로그아웃을 돌리고 있었다면 그 증상이 사라진다 — 대신 **403 처리 경로가 실제로
타진다**(그 분기가 없으면 지금부터 조용히 아무 안내도 안 나온다).

#### ✅ §11.8 "BE 확인 요청" 두 건 — 해소

- **표본 `trace-detail.json` 재생성 완료.** `bbbb…`의 `onCriticalPath`가 `false`가 됐고, 세 필드를
  **실제 알고리즘(`ApmSpanTree`)을 돌려서** 만든다. 🔴 FE는 `APM_TRACE_DETAIL_DERIVED_SAMPLE`의
  `_DERIVED_` 접미를 떼고 그대로 옮겨 오면 된다. 표본이 다시 어긋나지 않도록 BE에 **불변식
  테스트**(집합 == 배열 == Σ`selfMs` == `criticalPathMs`)를 넣었다.
- **표본의 SQL 키를 `db.query.text`로 고쳤다.** `db.statement`는 정본이 아니다(§10.6-2 요청 2).

#### ⚠️ 이번에 고치지 않은 것

- **D7 — `USER` 계정으로 로그인하면 앱 전체가 에러 화면**(`SideNav.tsx:211` `permissions?.X.view`의
  중첩 옵셔널 체이닝 누락). P2가 만든 회귀가 아니고 **FE 선재 이슈**지만, 이것 때문에 §10.5가
  요구한 "USER에게 APM 메뉴 숨김"을 **런타임으로 검증할 수 없다**. — **🔄 FE 요청**
- **D14 — §11(배포) BE 전량에 화면이 없다**는 QA 시점의 관찰이고, §11.8에서 FE가 이미 착수했다.
- **D12 — 예외 메시지·스택의 비-SQL 리터럴은 마스킹되지 않는다.** 스펙대로다(근거는
  `contract_apm.md` §7.9의 "마스킹의 한계"). 개인정보가 예외에 실리는 설치본은 Collector
  `redaction/pii`가 정본이다.

---

### 11.10 FE 회신 — §11.8 요청 1·D6 표본 소화 (2026-09-02, FE 4차)

#### ✅ §11.8-1 토큰 scope 선택 — **해소**(BE 회신 확인 후 구현)

BE 규칙을 `ApmReceiveTokenService`(`SCOPE_INGEST`·`SCOPE_DEPLOY`·`ALLOWED_SCOPES`·
`normalizeScopes`)에서 직접 확인했고, §11.8이 물었던 두 가지는 이렇게 닫혔다:

| 물음 | BE 답 | 화면이 한 일 |
|---|---|---|
| ① 한 토큰에 `["ingest","deploy"]`를 함께 담아도 되나 | **허용한다**(§11.4는 권고이지 강제가 아니다). 빈 배열·미지정은 `["ingest"]`로 채우고, 목록 밖 값은 400 `APM_TOKEN_SCOPE_UNSUPPORTED` | 체크박스 둘 다 고를 수 있게 두되 **경고 배너**로 분리 발급을 권한다(막지 않는다) |
| ② `kind`는 `COLLECTOR` 고정인가 | 두 범위 모두 판정이 `kind == COLLECTOR` **이면서** scope를 가질 것 | 발급 요청에 **`kind`를 싣지 않는다** — BE 기본값 `COLLECTOR`가 정답이라 화면이 고를 이유가 없다 |

- `ApmTokenIssueDrawer`에 **권한 범위 체크박스**(기본 `ingest` 체크). 고른 값을 `scopes`로
  **항상 명시적으로** 싣는다 — 기본값과 같아도 그렇게 한다. 비워 보내면 BE가 채우는데, 그때
  화면이 보여 준 것과 저장된 것이 갈려도 확인할 길이 목록 배지밖에 없다.
- 🔴 **범위를 전부 지우면 발급을 막는다.** 빈 배열은 BE가 `["ingest"]`로 채우므로, 화면이
  "아무 권한 없음"을 보여 준 채 수신 권한이 있는 토큰이 만들어진다.
- 🔴 **`ingest`가 빠지면 설정 yaml 동봉을 끄고 잠근다.** 배포 전용 토큰이 수집기 설정에 박히면
  Collector는 **기동에 성공한 채** 403만 받고 exporter가 재시도 없이 폐기한다(R11) — 화면에는
  "데이터가 안 온다"로만 보이는, 이 계약에서 가장 조용한 실패다.
- 토큰 목록의 scope 열을 **배지**로 세웠다. 🔴 모르는 값(구 토큰·BE가 범위를 늘린 경우)은
  번역 키를 씌우지 않고 **원문 그대로** 보여 준다 — 감추면 화면이 실제보다 좁은 권한을 말한다.
- 배포 탭 웹훅 카드의 안내를 고쳤다("발급 창에 scope 선택이 없다" → "발급 창에서 배포를 체크").
  ⚠️ 문구에 **범위는 발급 후 바꿀 수 없다**를 넣었다(넓히는 API가 없다).
- 도움말 옵션 상세에 `token_scopes` 항목 추가(21 → 22, kr·en 양쪽 · 누락 게이트가 지킨다).

**🔄 남는 요청 없음.** 다만 정보 공유 하나: 화면은 `kind`를 보내지 않으므로 **`RUM` 토큰을
발급할 경로가 제품에 없다.** RUM이 실제로 붙는 시점에 화면 축이 하나 더 필요해진다.

#### ✅ D6 `trace-detail.json` 재생성분 반영 — 파생 해제

`APM_TRACE_DETAIL_DERIVED_SAMPLE` → **`APM_TRACE_DETAIL_SAMPLE`**(BE `5afa90b` 표본 그대로).
같이 따라온 변화 둘: `bbbb…`의 `onCriticalPath`가 `false`, SQL 키가 **`db.query.text`**.
FE 회귀 테스트에 BE와 같은 **불변식**(플래그 집합 == `criticalPath` 배열 == Σ`selfMs` ==
`criticalPathMs`)을 추가했다 — 표본이 다시 어긋나면 양쪽에서 동시에 깨진다.
⚠️ 파생 깊은 표본(`…DERIVED_DEEP_SAMPLE`)의 SQL 키도 `db.query.text`로 맞췄다(파생이 구
semconv를 남겨 두면 그 키가 정본인 것처럼 읽힌다).

---

## 12. P3 1차 물결 — SLO · 홈 위젯 → **별도 문서**

WBS **4.1 SLO**(메뉴 10)와 **4.5 홈 위젯 3종**의 계약은 분량이 커서 갈랐다.
정본: **[`contract_apm-p3.md`](APM-P3-%EA%B3%84%EC%95%BD-SLO-%ED%99%88-%EC%9C%84%EC%A0%AF-%ED%95%A9%EC%84%B1-%EA%B0%90%EC%8B%9C-%EB%A9%94%EC%8B%9C%EC%A7%95-%EB%B0%B0%EC%B9%98-%EB%A6%AC%ED%8F%AC%ED%8A%B8-%282026-09-07-BE-%EA%B5%AC%ED%98%84-%EC%99%84%EB%A3%8C-FE-%EB%AF%B8%EC%B0%A9%EC%88%98%29.md)** — §1 SLO(EP 6 · 타입 · 정의 · 번 레이트
알람 · 오류 코드 6 · 예시 JSON) · §2 홈 위젯(카탈로그 3종 · EP 3 · 타입) · §3 권한(이 문서 §10.5와
동일) · §4 구현 상태·불안한 지점.

🔴 이 문서에서 이어지는 것 둘만 여기 적어 둔다:
- **오류 코드 7개가 늘었다**(`APM_SLO_*` 6 + `APM_ALERT_RULE_SCOPE_INVALID` 재사용) — §10.3 표와
  함께 읽을 것.
- **알람 kind `SLO_BURN`이 살아났다**(P1에서는 규칙만 만들 수 있고 값을 내지 않던 스텁이었다).
  🔴 대상이 **서비스가 아니라 SLO**라 알람 규칙 화면에서 만들 수 없고, `expressionThreshold`가
  `STALE`처럼 **0**이다. 상세는 저쪽 §1.5.

> 2026-09-07 URL 실접속 확인: 31건 중 29건 HTTP 200, npmjs(403)·freedesktop(418)은 봇 차단 응답(페이지 실재). 확신 낮다던 4건(sdk-env·semconv http-migration·java agent config·github tree) 전부 200.
