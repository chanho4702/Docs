# 계약 — APM 데이터 기간 지정 내보내기 (ZM-154)

- 작성일: 2026-09-16 · 갱신 2026-09-22 · 상태: ✅ **양쪽 master 반영(미푸시)** — BE `b2c564a` · FE `39ece8e`. FE 연동 시 BE master 코드와 대조해 **차이 없음** 확인(FE 보고 [`features/apm/data-export/zm-154_apm-data-export-fe.md`](zm-154_apm-data-export-fe.md) §3). `🔄 FE 요청사항` 필수 항목 없음
- ⚠️ FE가 쓰지 않는 범위: `rawText` 체크는 관리자 + `error-groups`에서만 노출(원문이 실리는 열이 그것뿐) · 트랜잭션 탭의 검색어·메서드 필터는 파일에 실리지 않음(EP에 파라미터 없음, 요구 생기면 `q`/`method` 추가 후보)
- 🆕 **v2 후속(2026-09-28, BE master `213d875`·FE master `01b7b28`, 미푸시)** — 엔드포인트 `q`·`method` 필터 + 계획 고정 토큰 `planToken`. 맨 아래 **§v2** 절. 모두 **추가형**(안 보내면 v1과 동일)
- 설계: [`features/apm/data-export/devdesign_apm-data-export.md`](devdesign_apm-data-export.md)
- 라이선스 `Feature.APM` · 권한 `applicationMonitoring/apm` **view** · 원문은 관리자 역할(ADMIN ∪ SUPER_ADMIN)
- 헤더 `x-visitor-id` 필수(`@VisitorIdCheck`), 인증 쿠키(`withCredentials`)

---

## 1. EP 요약

| 메서드 | 경로 | 응답 | 용도 |
|---|---|---|---|
| GET | `/apm/exports/{dataset}/plan` | JSON envelope `ApiResult<ApmExportPlanDto>` | 파일 없이 실제 창·해상도·행 수·안내 |
| GET | `/apm/exports/{dataset}` | 🔴 **파일 본문**(성공) / JSON envelope(실패) | 다운로드 |

`{dataset}` = `red-series` · `endpoints` · `error-groups` (그 밖은 `APM_EXPORT_INVALID`)

두 EP는 **같은 쿼리 파라미터**를 받고 **같은 검증**을 한다.

---

## 2. 쿼리 파라미터

| 이름 | 타입 | 필수 | 기본 | 설명 |
|---|---|---|---|---|
| `from` | long(ms) | ✅ | — | 창 시작. 🔴 없거나 0 이하면 거절(화면처럼 "최근 1시간"으로 접지 않는다) |
| `to` | long(ms) | ✅ | — | 창 끝(배타). 미래면 **지금으로 자른다**. `from >= to`면 거절 |
| `step` | int(초) | | 자동 | `60`·`300`·`3600`만(그 밖은 거절). 🔴 보존 밖이면 **승격**된다 → 응답 `stepSeconds`를 볼 것. `error-groups`는 무시(항상 3600) |
| `service` | string(UUID) | `endpoints`만 필수 | — | `service_uid`. `red-series`에서 생략 = **창 안에 RED 수신이 있는 전 서비스**. `error-groups`에서 생략 = 전 서비스 |
| `q` | string | | — | `error-groups`만: 예외 타입·정규화 메시지 부분일치(≤200자) |
| `format` | `csv` \| `jsonl` | | `csv` | `ndjson`도 JSONL로 받는다. 그 밖은 거절 |
| `gzip` | boolean | | `false` | true면 `application/gzip`, 파일명 `.gz` |
| `rawText` | boolean | | `false` | 🔴 true = 원문(마스킹 전) 스택. **관리자만**, 아니면 body code 403 |

---

## 3. 계획 응답 `ApmExportPlanDto` (`data`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `dataset` | string | `red-series` \| `endpoints` \| `error-groups` |
| `format` | string | `csv` \| `jsonl` |
| `gzip` | boolean | |
| `filename` | string | 다운로드 파일명(= Content-Disposition) |
| `contentType` | string | 다운로드 응답의 Content-Type |
| `fromMs` / `toMs` | long | 🔴 **실제로 쓰는 창**. RED·엔드포인트는 칸 경계로 넓힌 값, `to`는 지금을 넘지 않음 |
| `fromAt` / `toAt` | string | 위의 ISO-8601 UTC |
| `stepSeconds` | int | 실제 해상도(에러 그룹은 3600) |
| `requestedStepSeconds` | int \| null | 요청한 step |
| `stepEscalated` | boolean | 🔴 보존 때문에 더 굵어졌다 |
| `rows` | long | 파일 데이터 행 수(헤더·메타 제외). RED·엔드포인트는 정확, 에러 그룹은 그 사이 늘 수 있음 |
| `maxRows` | int | 행 상한(기본 200,000) |
| `allowed` | boolean | 🔴 false면 다운로드가 `APM_EXPORT_TOO_LARGE`로 거절된다 |
| `rawText` | boolean | 원문이 실리는가 |
| `retentionClipped` | boolean | 창 시작이 원천 보존보다 오래됨(앞부분 없음 가능) |
| `retentionDays` | int | 판정에 쓴 보존 일수(1m=7·5m=30·1h=400·에러 그룹=옵션, 기본 90) |
| `incompleteFromMs` | long \| null | 이 시각 이후는 적재·롤업 중일 수 있음 |
| `countFromMs` | long \| null | 에러 그룹 발생 수를 센 실제 시작(정시 내림). 그 밖은 null |
| `services` | `{serviceUid, name, env}[]` | 대상 서비스. 에러 그룹 전 서비스면 `[]` |
| `columns` | string[] | 파일 열 이름(§4 순서) |
| `notes` | string[] | 한국어 안내 — **화면이 그대로 보여 줘도 된다**(승격·보존·미완·근사·상한·CSV 수식 방어) |

`rows > maxRows`여도 계획은 **성공**이다(`allowed=false`).

---

## 4. 파일 열 (🔴 이름·순서 고정 — 바꾸면 `X-Apm-Export-Schema-Version`을 올린다. 현재 1)

### 4.1 `red-series` — 칸마다 한 줄 (서비스 → 시간 순)

| 열 | 타입 | 설명 |
|---|---|---|
| `serviceUid` · `serviceName` · `env` | text | `serviceName` = display_name 우선 |
| `bucketStartMs` · `bucketStartAt` | int · text | 칸 시작(ms · ISO UTC) |
| `stepSeconds` | int | 칸 폭 |
| `coverage` | text | 🔴 `DATA` \| `NO_DATA` \| `PARTIAL` \| `NOT_ROLLED_UP` \| `OUT_OF_RETENTION` |
| `requests` · `errors` | int \| 빈 칸 | 🔴 `coverage≠DATA`이고 행이 없으면 **빈 칸**(0 아님). `errors` = 5xx만 |
| `rps` | decimal \| 빈 칸 | requests / stepSeconds |
| `errorRatePct` | decimal \| 빈 칸 | requests=0이면 빈 칸 |
| `p50Ms` · `p95Ms` · `p99Ms` | decimal \| 빈 칸 | 히스토그램 근사. 경계 혼합 칸은 빈 칸 |
| `apdex` | decimal \| 빈 칸 | 0~1 |
| `activeRequests` | decimal \| 빈 칸 | 평균 동시 요청(RED 행과 독립) |
| `rebucketed` · `mixedBounds` · `sampleWarning` | boolean \| 빈 칸 | **칸마다**의 신뢰도 플래그 |

### 4.2 `endpoints` — route×method마다 한 줄 (route 대소문자 무시 → method 순)

`serviceUid`, `serviceName`, `env`, `windowFromMs`, `windowToMs`, `stepSeconds`(읽은 해상도), `route`, `method`(없으면 빈 문자열), `isOther`(route 상한으로 접힌 `__other__` 행), `requests`, `errors`, `rps`(실제 경과 시간 기준), `errorRatePct`(requests=0이면 빈 칸 — ⚠️ 화면은 0), `p50Ms`, `p95Ms`, `p99Ms`, `rebucketed`, `mixedBounds`, `sampleWarning`

### 4.3 `error-groups` — 창 안에 발생이 있는 그룹마다 한 줄 (창 안 발생 수 내림차순, 동점 groupId)

| 열 | 타입 | 설명 |
|---|---|---|
| `groupId` | int | |
| `serviceUid` · `serviceName` · `env` | text | 서비스가 사라졌으면 빈 칸 |
| `exceptionType` · `messageNorm` | text | 메시지는 정규화형(원문 아님) |
| `windowCount` | int | ⚠️ 정시 내림 창(`countFromMs`~`toMs`)의 발생 수 |
| `countTotal` | int | 보존(90일) 전체 합 |
| `firstSeenMs` · `firstSeenAt` · `lastSeenMs` · `lastSeenAt` | int · text | |
| `sampleTraceId` | text | 🔴 7일 뒤 만료 |
| `endpointCounts` | json | `{route: count}` 발생 수 순. CSV는 JSON 문자열, JSONL은 객체. `__unrouted__` = 경로 없음 |
| `sampleStack` | text | 🔴 기본 **마스킹**(프레임 줄 유지, SQL 리터럴 → `?`). `rawText=true`(관리자)일 때만 원문 |

### 4.4 형식 공통

- CSV: UTF-8 **BOM**, CRLF, RFC 4180. NULL = 빈 칸. 🔴 텍스트·JSON 칸이 `= + - @ 탭 CR`로 시작하면 앞에 `'`가 붙는다(수치 칸 제외). 정상 종료에는 표지 없음.
- JSONL: 1행 `{"_meta":{schemaVersion, source, dataset, fromMs, toMs, fromAt, toAt, stepSeconds, requestedStepSeconds, stepEscalated, plannedRows, masked, retentionDays, retentionClipped, incompleteFromMs, countFromMs, timezone, exportedAt}}` → 데이터 행 → 끝 `{"_end":{"rows":N,"truncated":false}}`. 🔴 **`_end`가 없으면 불완전한 파일**. 값은 바꾸지 않는다(수식 방어 없음).

---

## 5. 다운로드 응답

### 5.1 성공 (HTTP 200)

| 헤더 | 값 |
|---|---|
| `Content-Type` | `text/csv; charset=UTF-8` · `application/x-ndjson; charset=UTF-8` · (gzip) `application/gzip` |
| `Content-Disposition` | `attachment; filename="moveseye-apm_{dataset}[_{uid 앞 8자}]_{yyyyMMddTHHmmZ}_{…}.{csv\|jsonl}[.gz]"` |
| `Cache-Control` | `no-store` |
| `X-Apm-Export-Dataset` · `-From` · `-To` · `-Step` · `-Rows` · `-Raw-Text` · `-Schema-Version` | 계획과 같은 값 |
| `Access-Control-Expose-Headers` | 위 헤더 + `Content-Disposition` (이 응답에만) |

⚠️ `Content-Encoding`은 쓰지 않는다 — gzip 파일 그대로 저장된다.

### 5.2 본문 전 실패 — 🔴 **HTTP 200 + JSON envelope** (`Content-Type: application/json`)

| body `code` | `errorCode` | 언제 | `data` |
|---|---|---|---|
| 400 | `APM_EXPORT_INVALID` | dataset·format·step·창·service 형식, endpoints에 service 누락, q 길이. **(09-22 코덱스 R2 반영)** `from=abc`·`step=1m` 같은 숫자 형식 오류, `gzip`/`rawText`가 `true`/`false`(대소문자 무시) 밖의 값(`on`·`yes`·`1` 포함)도 여기 — 전역 `INVALID_DATA`가 아니다. 빈 문자열은 "안 보냄"과 같다 | — |
| 400 | `APM_EXPORT_TOO_LARGE` | rows > maxRows | `{rows, maxRows}` |
| 429 | `APM_EXPORT_BUSY` | 노드 동시 실행 수 초과(기본 2) — 잠시 뒤 재시도 | — |
| 404 | `APM_SERVICE_NOT_FOUND` | 없는 service | — |
| 403 | `FORBIDDEN` | `apm.view` 없음 / 비관리자 `rawText=true` | — |
| 403 | (라이선스 잠금) | APM 기능 없음 | 기존 라이선스 계약 |
| 401 | — | 미인증(실제 HTTP 401) | — |

### 5.3 본문 중 실패 (HTTP 200, 이미 파일이 나가는 중)

- CSV: 마지막 줄 `# ERROR: 내보내기 도중 오류가 발생해 파일이 완전하지 않습니다(N행까지 기록).`
- JSONL: 마지막 줄 `{"_error":{"message":…,"rowsWritten":N}}`, `_end` **없음**
- 경합으로 상한에 걸리면: CSV `# TRUNCATED: …` 줄 / JSONL `_end.truncated=true` + `note`

---

## 6. FE 연동 가이드

```ts
// 1) 계획 — 평범한 JSON(언랩 1겹 규칙 그대로)
GET /apm/exports/red-series/plan?from&to&step&service&format&gzip
  → allowed=false면 버튼 비활성 + notes 표시

// 2) 다운로드 — cost.api.ts downloadTemplate과 같은 패턴
const blob = await API.get(`/apm/exports/${dataset}`, { params, responseType: "blob" });
if (blob.type.includes("application/json")) {   // 🔴 실패 envelope가 blob 자리로 온다
  const envelope = JSON.parse(await blob.text()); throw new ApiEnvelopeError(envelope);
}
saveAs(blob, plan.filename);                      // 파일명은 계획 응답에서(헤더 노출에 기대지 말 것)
```

- 🔴 파일명·행 수는 **계획 응답**에서 쓴다 — 헤더는 교차 오리진 배포에서 브라우저 설정에 따라 못 읽을 수 있고 axios 인터셉터가 `data`만 돌려준다.
- `window.open`/`<a href>`로 받지 말 것 — `x-visitor-id` 헤더를 실을 수 없다.
- 창은 화면의 `useApmTimeRange()`의 `from`·`to`를 그대로 넘기면 된다(ms).

---

## 🔄 FE 요청사항

(없음 — FE 작업 목록은 보고서 `features/apm/data-export/zm-154_apm-data-export.md` §3)

---

## v2 후속(2026-09-28)

> BE master `213d875` · FE master `01b7b28`(2026-09-28 ff 병합, 워크트리 정리됨, 미푸시) · 보고 [`features/apm/data-export/zm-154_be-followup.md`](zm-154_be-followup.md)
> 🔴 **전부 추가형이다.** 새 파라미터를 보내지 않으면 v1과 바이트 단위로 같은 동작이다(계획 응답에 필드 4개가 늘어날 뿐). `X-Apm-Export-Schema-Version`은 **1 그대로**(파일 열 불변, JSONL `_meta`에 키만 추가).

### v2.1 새 쿼리 파라미터 (두 EP 공통 — `planToken`만 다운로드 전용)

| 이름 | 타입 | 적용 | 설명 |
|---|---|---|---|
| `q` | string(≤200) | `error-groups`(v1 그대로) · 🆕 **`endpoints`** | `endpoints`에서는 **트랜잭션 탭 표(`GET /apm/services/{uid}/endpoints?q=`)와 같은 조건** — `route` 또는 `method` 부분일치, 대소문자 무시, 앞뒤 공백 제거. `red-series`는 v1과 같이 무시 |
| `method` | string(≤32, HTTP token) | 🆕 **`endpoints` 전용** | 트랜잭션 탭의 메서드 선택기와 같은 조건 — **정확히 일치**(대소문자 무시). `q`와 AND. 🔴 **(코덱스 v1 R1)** 🔴 **(코덱스 v2 N1)** 원문에 제어 문자(`Character.isISOControl` — CR·LF·TAB·NUL·C1 등)가 하나라도 있으면 먼저 거절하고, 그 뒤 **일반 공백만** 앞뒤를 다듬는다(`" GET "`은 통과, `"GET\n"`·`"\tGET"`·`"\t"` 단독은 거절). 다듬은 값이 RFC 9110 token 문법(tchar: 영숫자와 `!#$%&'*+-.^_~`, 백틱, 파이프 — 구현 `ApmExportRequest.METHOD_TOKEN`)이어야 한다 — 공백·개행·제어 문자·비ASCII는 거절(`APM_EXPORT_INVALID`). `M-SEARCH`·`PATCH`는 통과. 🔴 `red-series`·`error-groups`에 주면 **거절**(`APM_EXPORT_INVALID`) — 걸렀다고 믿은 파일이 전량이면 틀린 감사 자료라 조용히 무시하지 않는다. 빈 문자열·공백은 "안 보냄" |
| `planToken` | string(≤512, **원문 기준**) | 🆕 **다운로드 EP만** | 계획 응답의 `planToken`을 그대로. 🔴 **(코덱스 v1 R4)** 512자 상한은 공백 제거 **전** 원문에 건다(513자 공백·긴 공백+정상 토큰 모두 거절). 상한 안의 앞뒤 공백은 다듬어 받는다. 있으면 **계획이 확정한 창 끝·해상도로** 파일을 만든다. 빈 문자열 = 안 보냄(v1 동작). 계획 EP에 보내면 무시된다 |

- 🔴 **같은 모집단의 근거**: 필터 판정은 `service/red/ApmEndpointFilter` 한 클래스다 — 트랜잭션 표(`ApmSeriesQueryService.endpoints`)의 인라인 필터를 추출해 두 곳이 같이 쓴다(표의 필터는 SQL이 아니라 합산 뒤 자바 술어라 SQL 대신 술어를 공유). IT가 4가지 조건(`q=ORD` · `method=post` · `q=cmd&method=GET` · `q=o`)에서 **목록 `total` = 파일 행 수**를 단언한다.
- ⚠️ 화면과 다른 점(v1부터 그대로): 파일은 페이지·정렬이 없고 route→method 순 전량. 화면의 `otherRoutes`(접힌 `__other__` 행 수, 필터 **전**에 셈)는 파일에 없다 — `__other__` 행 자체는 필터에 걸리면 `isOther=true`로 실린다.

### v2.2 계획 응답 `ApmExportPlanDto` 추가 필드 (맨 뒤에 추가)

| 필드 | 타입 | 설명 |
|---|---|---|
| `q` | string \| null | **실제로 적용한** 검색어(다듬은 값). 🔴 **(코덱스 v1 R3)** `red-series`는 `q`를 쓰지 않으므로 보냈어도 **항상 null**. `endpoints`·`error-groups`는 보낸 값. 없으면 null |
| `method` | string \| null | 실제로 적용한 메서드(다듬은 값, 대소문자는 보낸 그대로) — `endpoints`에서만 값, 그 밖은 null |
| `planToken` | string | 🔴 계획 고정 토큰(`v1.<payload>.<mac>`, base64url, 약 150자). **항상 채워진다**(`allowed=false`여도) |
| `planTokenExpiresAtMs` | long | 토큰 만료 시각(ms). 기본 발급 +30분(`app.apm.export.plan-token-ttl-seconds`, 60~86,400) |

`notes`에 필터 안내 1줄이 추가된다(`endpoints` + 필터가 있을 때): `트랜잭션 표와 같은 조건으로 걸러 낸 엔드포인트만 내보냅니다(검색어 "ord", 메서드 GET).`

### v2.3 요청·응답 예시

```http
GET /apm/exports/endpoints/plan?from=1790000000000&to=1790003600000&service=3f2c…&step=60&q=orders&method=GET&format=csv
→ 200
{ "status":"success","code":200,"data":{
    "dataset":"endpoints","format":"csv","gzip":false,
    "filename":"moveseye-apm_endpoints_3f2c1d7e_20260921T1333Z_20260921T1433Z.csv",
    "fromMs":1789999980000,"toMs":1790003640000,"stepSeconds":60,"requestedStepSeconds":60,"stepEscalated":false,
    "rows":3,"maxRows":200000,"allowed":true, …,
    "notes":["트랜잭션 표와 같은 조건으로 걸러 낸 엔드포인트만 내보냅니다(검색어 \"orders\", 메서드 GET).", "CSV는 …"],
    "q":"orders","method":"GET",
    "planToken":"v1.ZW5kcG9pbnRz…Q.3kR…w","planTokenExpiresAtMs":1790005400000 } }

GET /apm/exports/endpoints?from=1790000000000&to=1790003600000&service=3f2c…&step=60&q=orders&method=GET&format=csv&planToken=v1.ZW5k…
→ 200 text/csv (계획과 같은 X-Apm-Export-From/To/Step)
```

```ts
// FE — 계획과 "같은 파라미터 + planToken"을 보낸다(그 밖은 v1 가이드 §6 그대로)
const plan = await getExportPlan(dataset, params);
const blob = await downloadExport(dataset, { ...params, planToken: plan.planToken });
```

### v2.4 호환 규칙

1. **토큰 없는 다운로드 = v1 동작**(요청마다 다운로드 시점의 "지금"으로 창 끝 자르기·보존 승격 판정).
2. **토큰 있는 다운로드** — 창 끝은 **계획 때 자른 값**(`min(to, 계획 시각)`), 해상도는 **계획이 고른 값**. 그래서 계획과 다운로드 사이에 보존 경계(1m 7일 · 5m 30일)를 넘어도 재승격되지 않고, 미래 `to`가 다운로드의 "지금"으로 다시 잘리지 않는다(검수 BE R1 잔여 해소 — FE의 `to=min(to, now)` 고정은 그대로 둬도 되고 둘이 충돌하지 않는다).
   - 고정하는 것은 **창·해상도뿐**이다. 데이터·`coverage`·`incompleteFromMs`·보존 판정(`retentionClipped`)·`exportedAt`은 **다운로드 시점** 기준이다. 따라서 `rows`는 에러 그룹·전 서비스 RED에서 여전히 조금 달라질 수 있다(v1과 같은 성질).
   - 파일 메타: JSONL `_meta`에 `q`·`method`(**적용값** — 위 §v2.2와 같은 규칙, `red-series`의 `q`는 null)·`planPinned`(토큰 고정 여부)·`retentionCutoffMs` 키가 추가된다. CSV 메타는 없고, 보존 결손만 파일 끝 `# NOTE:` 줄로 남는다(§v2.5).
   - 토큰 **지문은 원 요청 파라미터 기준**이다 — `red-series`에 `q`를 보내고 계획했다면 다운로드도 같은 `q`를 보내야 토큰이 맞는다(적용값이 null이어도).
3. **토큰은 계획과 같은 파라미터일 때만 유효** — `dataset`·`from`·`to`(보낸 그대로)·`step`·`service`·`q`·`method`(대소문자 무시)·`format`·`gzip`·`rawText` 중 하나라도 다르면 거절. 조건을 바꾸면 계획을 다시 조회해 새 토큰을 받는다(FE 쿼리 키가 이미 파라미터 전체라 자연히 그렇게 된다).
4. 🔴 **토큰에 계정 식별자가 없다 · 다른 사용자의 토큰 재사용은 막지 않는다** — 판단: 문제 아님. 토큰은 **권한을 주지 않는다**(다운로드는 토큰과 무관하게 `apm.view`·라이선스·원문 관리자 판정을 매번 다시 한다). 남의 토큰으로 얻는 것은 "그 파라미터를 그 시각에 계획했을 때의 창 끝·해상도"뿐이고 이는 자기 계획으로도 얻는 정보다. 계정을 묶으면 서명 검증 외에 얻는 보안 이득 없이 "링크 공유·재로그인 뒤 만료" 같은 오작동만 늘어난다. 검색어는 토큰에 **싣지 않는다**(파라미터 전체의 SHA-256 지문만) — URL·접근 로그에 남기 때문.
5. 토큰 형식·키: HMAC-SHA256, 키 = `HMAC-SHA256(JWT_SECRET, "moveseye/apm-export/plan-token/v1")`(용도 분리 파생, **새 env 없음**). 서버 저장 없음 → 다중 노드에서도 검증된다. `JWT_SECRET`을 바꾸면 발급된 토큰은 전부 무효(계획 재조회).

### v2.5 보존 결손 표시 (🆕 코덱스 v1 R2 — 토큰 유무와 관계없이 항상)

토큰으로 계획의 해상도를 고정하면, 두 요청 사이에 보존 경계를 넘어 **앞부분이 이미 지워진 파일**이 정상 응답으로 나갈 수 있다(예: 7일 경계 직전 1m 계획 → 경계 통과·보존 삭제 뒤 다운로드 = 빈 칸·부분 집계). 그래서 결손 여부를 **다운로드 시점 기준**으로 다시 판정해 세 곳에 싣는다.

| 자리 | 값 |
|---|---|
| 응답 헤더 `X-Apm-Export-Retention-Clipped` | `true` \| `false` — 창 시작이 원천 보존보다 오래됐다(= 계획 DTO `retentionClipped`와 같은 판정, 다운로드 시점) |
| 응답 헤더 `X-Apm-Export-Retention-Cutoff` | long(ms) — 보존 기준선 = 다운로드 시각 − `retentionDays`일. 이보다 앞선 구간은 비어 있거나 일부만 있을 수 있다 |
| `Access-Control-Expose-Headers` | 위 두 헤더가 추가된다(이 응답에만) |
| CSV 파일 끝 | 결손일 때만 `# NOTE: retention-clipped from=<창 시작 ms> cutoff=<기준선 ms> retentionDays=<n> — <기준선 ISO> 이전 구간은 보존 기간이 지나 비어 있거나 일부만 있을 수 있습니다.` 한 줄. 🔴 자리 규칙은 `# TRUNCATED:`·`# ERROR:`와 같다 — 데이터 행 **뒤**. 표지가 둘이면 `# NOTE:`가 먼저이고 `# TRUNCATED:`/`# ERROR:`가 **마지막 줄**로 남는다 |
| JSONL | `_meta.retentionClipped`(v1) + `_meta.retentionCutoffMs`(v2). 파일 끝 표지 없음(`_end` 규칙 불변) |

⚠️ 결손이 아니면 CSV에는 아무것도 붙지 않는다(v1과 같이 깨끗한 표).

### v2.6 오류 코드 (전부 본문 전 · HTTP 200 + JSON envelope, v1 §5.2와 같은 체계)

| body `code` | `errorCode` | 언제 | message(한국어) |
|---|---|---|---|
| 400 | `APM_EXPORT_INVALID` | `method`를 `endpoints` 밖에 줌 · `method` 33자 이상 · 🆕 HTTP token 문법 위반(개행·공백·제어 문자) | `method 필터는 endpoints 데이터셋에서만 쓸 수 있습니다: red-series` 등 |
| 400 | `APM_EXPORT_INVALID` | `planToken` 형식 오류·서명 불일치(변조·다른 키)·버전 불명·**원문** 512자 초과 | `계획 토큰(planToken)이 올바르지 않습니다. 계획을 다시 조회해 주세요.` |
| 400 | `APM_EXPORT_INVALID` | `planToken` 만료 | `내보내기 계획이 만료되었습니다. 계획을 다시 조회한 뒤 받아 주세요.` |
| 400 | `APM_EXPORT_INVALID` | `planToken`과 요청 파라미터·데이터셋 불일치 | `계획 토큰(planToken)이 이 요청의 조건과 다릅니다. …` |
| 400 | `APM_EXPORT_INVALID` | (방어) 토큰으로 고정했는데 원천이 계획과 다른 창·해상도를 계산 | `계획 때와 다른 창·해상도가 계산되었습니다. …` |

🔴 새 `errorCode`는 없다 — FE는 `APM_EXPORT_INVALID`면 **계획을 다시 조회**하는 것 하나로 전부 처리된다(만료·불일치 구분이 필요하면 message로만 보인다). 권한 실패(403)·동시 실행(429)·상한(`TOO_LARGE`)은 토큰이 있어도 v1과 같다 — 판정 순서: 라이선스 → `apm.view`(403) → 파라미터·토큰 검증(400) → 원문 관리자 판정(403) → 동시 실행(429) → 상한. 즉 비관리자가 `rawText=true`와 **틀린 토큰**을 함께 보내면 403이 아니라 400이 먼저 난다(토큰 검증은 파라미터만 보므로 정보 노출은 없다).

### 🔄 FE 요청사항 (v2 연동 시)

1. 트랜잭션 탭 내보내기: 표의 `q`·`method` 상태를 계획·다운로드 파라미터에 실을 것(쿼리 키 포함). 파일명은 필터와 무관(v1 규칙 그대로).
2. 다운로드에 `planToken: plan.planToken` 추가. `APM_EXPORT_INVALID`를 받으면 계획을 다시 조회(모달의 계획 쿼리 invalidate)하고 안내.
3. `planTokenExpiresAtMs`가 지난 계획으로는 버튼을 누르기 전에 재조회해도 된다(선택).
4. 🆕 **(코덱스 v1 R2) 보존 결손 헤더 소비** — 다운로드 응답의 `X-Apm-Export-Retention-Clipped: true`면 저장 후 경고(예: "기준선 이전 구간은 보존 기간이 지나 비어 있거나 일부만 있습니다", 기준선 = `X-Apm-Export-Retention-Cutoff`). ⚠️ axios blob 응답에서 헤더를 읽으려면 인터셉터가 `headers`를 넘겨줘야 한다(현재 `data`만 반환 — v1 §6 주의). 헤더를 못 읽는 배포를 위해 **계획 DTO `retentionClipped`**를 이미 보여 주고 있다면 최소 요건은 충족(단, 계획 뒤 경계를 넘은 경우는 헤더로만 보인다).
5. 🆕 **(코덱스 v1 R3)** 계획 DTO의 `q`는 적용값이다 — `red-series` 모달에서 `q`를 "적용된 필터"로 표시하지 말 것(항상 null).

- FE → BE 요청: `env` 파라미터(개요 전체 서비스 RED) — APM 개요는 `?env=`로 좁혀 보는데 `red-series`(service 생략) 내보내기에는 env 조건이 없어 파일이 env 무관 전 서비스다. 지금은 모달이 "화면의 env 선택은 파일에 적용되지 않는다"고 안내한다(FE 2026-09-28, 미결).

## 2026-10-10 RT-3 — 미확정·미검증 칸 표시 (정본: `features/apm/hardening-20261006/contract_apm-late-rollup-20261006.md` 끝 "RT-3" 절)
- 계획 응답에 🆕 `untrustedBeforeMs: long | null`(`incompleteFromMs` 바로 뒤) — 이 시각 이전은 재집계 도입(업그레이드) 이전 자료라 검증되지 않아 값을 비운다. 창 끝보다 뒤일 수 있다. JSONL `_meta`에도 같은 키.
- §4.1 `coverage` 값 추가: `ROLLUP_INCOMPLETE`(2026-10-07, 도입 이후 dirty·blocked — 재집계가 끝나면 풀림), `LEGACY_UNVERIFIED`(RT-3, 도입 이전 — 기다려도 안 풀림, 기간을 좁혀야 함). 둘 다 수치·`activeRequests` 전부 빈 칸.
- §4.2 endpoints: 창이 어느 쪽과라도 겹치면 숫자 열 전체 빈 칸(route·method 열은 유지).
