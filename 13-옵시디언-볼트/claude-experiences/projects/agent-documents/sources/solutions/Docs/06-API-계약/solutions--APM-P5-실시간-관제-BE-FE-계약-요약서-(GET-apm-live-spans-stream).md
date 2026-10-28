# APM P5 실시간 관제 — BE↔FE 계약 요약서 (`GET /apm/live/spans/stream`)

> **용도**: P5.2(X-View)·P5.3(요청 관제) 화면 **구현 착수 전** 사전 대조. FE가 타입·훅을 만들 때 보는 한 장.
> **작성**: 2026-09-16 · integration-qa(정적 경계면 대조, 코드 무수정)
> **BE 정본 기준**: `moveseye-be-spring` HEAD `28a1ad3`(계약 본체는 `3c76a74` 5단계 + `8d6f730` 6단계). `28a1ad3`은 SSE ASYNC 디스패치 500 수정이라 **계약 변경 없음**.
> **설계 정본**: `designs/devdesign_apm-realtime.md` v4.4 §2.5·§3.1·§3.2·§3.3 / **UX 정본**: `designs/devdesign_apm-realtime-ux.md` v1.2 §0·§1·§2
> **🔴 판정 원칙**: 아래 표의 "실제(BE)" 열은 **코드가 내보내는 것**이 정본이다. 설계 문서와 어긋나는 곳은 §2 "불일치" 열과 §6에 모았다.

---

## 1. 엔드포인트 계약

### 1.1 요청

| 항목 | 값 | 출처 |
|---|---|---|
| 메서드·경로 | `GET /apm/live/spans/stream` | `ApmLiveSpansStreamController.PATH:18` |
| `produces` | `text/event-stream` | `:31` |
| 프로토콜 | 네이티브 `EventSource`(SSE). 서버가 모든 이벤트에 `retry:3000`(거절 응답만 `retry:15000`) | `LiveSpanStreamCodec.event():54~58`, `LiveStreamRejectionAdvice:37` |

**쿼리 파라미터 전부** (`ApmLiveSpansStreamController.stream():27~36`)

| 이름 | 타입 | 필수 | 기본값 | 허용값·제약 | 의미 |
|---|---|---|---|---|---|
| `visitorId` | string | ✳ | — | 비거나 없으면 **`x-visitor-id` 헤더로 폴백** | 세션 대조용. 🔴 둘 다 없으면 **401** |
| `serviceUid` | UUID | 아니오 | `null`(전체) | UUID 파싱 실패 시 **400** | 서비스 필터(서버측). `viewKey` 구성요소 |
| `env` | string | 아니오 | `null`(전체) | trim 후 빈 문자열이면 `null` 취급 · **UTF-8 128바이트 초과 시 400** | 환경 필터(서버측). `viewKey` 구성요소 |
| `snapshot-seconds` | int | 아니오 | **`300`** | 🔴 **`300` 또는 `900`만**. 그 외 **400** | 창 길이(초). `viewKey` 구성요소. **파라미터명에 하이픈이 들어간다** — `snapshotSeconds` 아님 |
| `sinceEpoch` | string | 아니오 | `null` | — | 재접속 커서: 마지막 `streamEpoch` |
| `sinceSeq` | long | 아니오 | `null` | — | 재접속 커서: **마지막으로 "완전히 적용한" seq**(되감지 않는다) |
| `viewKey` | string | 아니오 | `null` | — | 재접속 커서: 마지막 `viewKey` |

- 커서 3개는 **셋을 함께** 보낸다(`LiveSpanStreamService.Cursor(epoch, seq, viewKey)`). 하나라도 있으면 "명시 커서"로 취급된다.
- `Last-Event-ID` 헤더(네이티브 자동 재접속)도 커서로 쓰인다. 🔴 **서버가 한 단계 되감는다**(`headerSeq - 1`) — 멀티파트 중간 part에서도 `id:`가 갱신되기 때문. 그래서 재전송된 seq를 FE의 "`seq ≤ 마지막이면 무시`" 규칙이 흡수해야 한다(`ApmLiveSpansStreamController.cursor():47~66`).
- 명시 커서와 헤더가 둘 다 있으면, **같은 `viewKey`·같은 `epoch`이고 헤더 seq가 더 최신일 때만** 헤더를 채택한다.

### 1.2 인증·권한·라이선스

| 축 | 판정 | 실패 시 |
|---|---|---|
| 세션 | 쿠키 `accessToken` + `visitorId`(쿼리 또는 `x-visitor-id` 헤더) ↔ Redis 로그인 키 대조 (`VisitorSessionChecker.require():56~71`, 컨트롤러 `:34`) | **실제 HTTP 401** + JSON |
| 라이선스 | `@RequiresFeature(Feature.APM)` (클래스 레벨) | **HTTP 200 + `control{reject,403,APM_LICENSE_REQUIRED}}`** |
| 권한 | `ApmAccessChecker.canRead` = DMOVE 권한 `applicationMonitoring/apm.view`(기본 true, ADMIN/SUPER_ADMIN은 우회 통과) · **MCP 토큰은 거부** | **HTTP 200 + `control{reject,403,APM_VIEW_FORBIDDEN}`** |
| 기능 스위치 | `app.apm.live.spans.enabled` | **HTTP 200 + `control{reject,503,APM_LIVE_DISABLED}`** |

🔴 **CORS**: `SecurityConfig:57` `app.cors.allowed-origins` 기본 `http://localhost:5173,http://localhost:3000`, `allowCredentials=true`. dev에서 FE(:5173)→BE(:3000)는 교차 출처이므로 **`EventSource`를 `{ withCredentials: true }`로 생성**해야 쿠키가 실린다.

### 1.3 응답 헤더 (성공·거절 공통)

```
HTTP/1.1 200
Content-Type: text/event-stream;charset=UTF-8
Cache-Control: no-cache
X-Accel-Buffering: no
```
- 스트림 타임아웃 **600,000ms(10분)** — `LiveServletWriter(request, response, 600000)`. 또한 `watchdog`가 `now - c.opened >= 600000`이면 연결을 닫는다. 🔴 **정상 사용 중에도 10분마다 끊긴다** → FE는 네이티브 재접속(+`Last-Event-ID`)에 의존해야 하고, 이를 "오류"로 배너를 띄우면 안 된다.

### 1.4 실패 응답의 **실제 본문 모양**

🔴 **401/400만 진짜 HTTP 오류이고, 403/429/503은 HTTP 200 + `control` 이벤트다.** 이 구분이 FE 상태 머신의 출발점이다.

| 상황 | HTTP | Content-Type | 본문(그대로) |
|---|---|---|---|
| JWT 없음·만료, visitorId 없음·불일치 | **401** | `application/json` | `{"code":401,"errorCode":"INVALID_TOKEN"}` |
| `snapshot-seconds`가 300/900이 아님, `serviceUid` UUID 아님, `env` 128바이트 초과 | **400** | `application/json` | `{"code":400,"errorCode":"APM_LIVE_INVALID_QUERY"}` |
| 권한 없음 / MCP 토큰 | **200** | `text/event-stream` | `event:control\nretry:15000\ndata:{"type":"reject","code":403,"errorCode":"APM_VIEW_FORBIDDEN","retryable":false}\n\n` |
| 라이선스 만료 | **200** | `text/event-stream` | 위와 같고 `errorCode:"APM_LICENSE_REQUIRED"` |
| 기능 꺼짐 | **200** | `text/event-stream` | `{"type":"reject","code":503,"errorCode":"APM_LIVE_DISABLED","retryable":false}` |
| 연결 수 초과(기본 활성 40+대기 10, 사용자당 4 — 2026-09-23부터 설정 `app.apm.live.spans.stream.*`, 운영 §7.12a) | **200** | `text/event-stream` | `{"type":"reject","code":429,"errorCode":"APM_LIVE_TOO_MANY_CONNECTIONS","retryable":true,"retryAfterMs":15000}` |

출처: `LiveStreamRejectionAdvice.reject():31~38`, `resolveException():40~56`, `ApmLiveSpansStreamController:34~46`.

🔴 **401 본문은 `ApiResult`가 아니다** — `status`·`message`·`data` 없이 `code`·`errorCode` 두 필드뿐인 맨 맵이다(`resolveException():50~52`). 기존 FE 인터셉터가 `status`를 기대한다면 이 경로만 별도 처리가 필요하다. (설계 §2.5는 "실제 401 + `ApiResult` 본문"이라 적었다 → **설계 오기, BE가 정본**.)

---

## 2. SSE 이벤트 payload — **BE 코드가 실제 내보내는 필드** 기준

이벤트는 4종(+`snapshot`이 3단계로 쪼개져 사실상 6개 이벤트 이름): `snapshot.begin` · `snapshot.chunk` · `snapshot.end` · `spans` · `heartbeat` · `control`.

🔴 **`id:` 필드가 붙는 이벤트는 `spans` 하나뿐**이다(값 `"{streamEpoch}:{seq}"`). snapshot·heartbeat·control은 `id:`가 없어 `Last-Event-ID`를 움직이지 않는다 — 설계 §2.5의 "seq를 소비하지 않는다"가 그대로 구현돼 있다. (`LiveSpanFrames.pack():81~84`, `LiveSpanSnapshot.send()`/`heartbeat()`/`control()`은 `id=null`)

### 2.1 `snapshot.begin`

`LiveSpanSnapshot.produce():85~95`

| 필드 | 타입 | 필수 | 의미 | 설계와 불일치 |
|---|---|---|---|---|
| `snapshotId` | string(UUID 또는 최초 시도의 내부 id) | ✅ | 이 snapshot 시도의 식별자. **축소 재시작마다 새 값** | — |
| `streamEpoch` | string(UUID) | ✅ | 서버 기동·링 리셋 세대 | — |
| `seq` | number | ✅ | 이 snapshot이 고정한 데이터 발행 번호 `S` | — |
| `viewKey` | string | ✅ | `{serviceUid\|all}\|{env\|all}\|http\|{seconds}\|sampling-v1` | — |
| `serverTime` | number(ms epoch) | ✅ | 서버 시각 — x축 오른쪽 끝의 기준(브라우저 시계 금지) | — |
| `chunks` | number | ✅ | `dictChunks + 버킷 chunk 수`(총 chunk 수) | — |
| `dictChunks` | number | ✅ | 앞쪽 `kind:"dict"` chunk 개수 | — |
| `dictVersion` | number | ✅ | 사전 세대 번호 | — |
| `snapshotKeepRatio` | number(0~1) | ✅ | base 계층 표본 유지 비율. 1이면 솎지 않음 | — |
| `node.nodeId` | string | ✅ | 🟡 **`streamEpoch`와 같은 UUID를 넣는다**(`"nodeId", snapshot.epoch`) | 🔴 설계 예시는 `"be-1"`(사람이 읽는 노드 이름). **BE가 정본이나 사실상 무의미한 값** — 화면에 노드 이름으로 표시하지 말 것 |
| `node.startedAt` | number | ✅ | 이 스트림 서비스 기동 시각 | — |
| `node.coverageFrom` | number | ✅ | `max(startedAt, serverTime − windowSeconds*1000)` — **복원 가능 범위의 시작**(UX §0 `at` 부분복원 판정에 쓰는 값) | — |
| `config.windowSeconds` | number | ✅ | 서버 보관 창(기본 900) | — |
| `config.snapshotSeconds` | number | ✅ | 이 view의 창(300 또는 900) | — |
| `config.slowMs` | number | ✅ | 전역 느림 기준(기본 2000) | — |
| `config.p95ThresholdMs` | number **\| null** | ✅(값은 null 가능) | 전역 `P95_LATENCY` 알람 임계. **전역 규칙이 없으면 null** | ✅ 구현됨 (UX §1.4 참고선) |
| `config.errorRateThresholdPct` | number **\| null** | ✅(값은 null 가능) | 전역 `ERROR_RATE` 알람 임계(%) | ✅ 구현됨 |
| `config.pointsPerBucket` | number | ✅ | 200 | — |
| `config.emphasisPerBucket` / `emphasisPerService` / `emphasisTotal` | number | ✅ | 50 / 20000 / 50000 | — |
| `config.arenaTotal` | number | ✅ | 1,400,000 | — |
| `config.retention.perServicePerSec` | number | ✅ | 200 | — |
| `config.retention.totalPoints` | number | ✅ | 1,300,000 | — |
| `live` | object | ✅ | 🔴 **항상 `{}`(빈 객체)** — `"live", Map.of()` 하드코딩 | 🔴🔴 **설계 §3.2가 규정한 `live[svc].active/cpuPct/heapPct/threads`가 전혀 없다.** §6-A 참조 |

🔴 `config.p95ThresholdMs`·`errorRateThresholdPct`의 출처는 `ApmAlertRuleRepository.findByServiceIdIsNull()` 중 `enabled` + `kind == "P95_LATENCY"|"ERROR_RATE"`의 `threshold`(`LiveSpanStreamService:101~112`). 규칙이 여러 개면 **마지막 것이 이긴다**(덮어쓰기 루프).

### 2.2 `snapshot.chunk` — `kind: "dict"`

`LiveSpanSnapshot.produce():96~100` + `LiveSpanStreamCodec.dictionary():99~106`

```jsonc
{ "snapshotId": "…", "index": 0, "kind": "dict", "dictVersion": 42,
  "services":  [ { "id": 1, "uid": "b1f0-…-uuid", "displayName": "주문", "env": "prod" } ],
  "routes":    { "1": { "0": "__none__", "1": "__other__", "17": "GET /orders/{id}" } },
  "instances": { "1": { "0": {"display":"__none__","key":"…"}, "2": { "display": "7f3a9c1e", "key": "3f9c2b7e41a0d5c8" } } } }
```

| 필드 | 타입 | 필수 | 비고 | 불일치 |
|---|---|---|---|---|
| `snapshotId` / `index` / `kind` / `dictVersion` | string / number / `"dict"` / number | ✅ | `index`는 0부터 chunk 전체 통틀어 연속 | — |
| `services[].id` | number(long) | ✅ | **서비스 내부 id** — `routes`·`instances`·`replaceBuckets`의 키로 쓰이며 **JSON에서는 문자열 키**다 | — |
| `services[].uid` | string(UUID) | ✅ | 외부 식별자 — URL `svc`·서비스 상세 링크는 이것 | — |
| `services[].displayName` / `env` | string | ✅ | `env`는 null 가능(`ServiceInfo.env()`) | — |
| `routes[serviceId][routeId]` | string | ✅ | route 문자열. `0`=`__none__`(경로 미식별), `1`=`__other__`(상한에 접힘) 항상 포함 | — |
| `instances[serviceId][instanceId].display` | string | ✅ | 도착 값의 **앞 8 코드포인트**. 표시 전용, 충돌 가능 | ✅ |
| `instances[serviceId][instanceId].key` | string(16 hex) | ✅ | **SHA-256(UTF-8 도착값)의 앞 64bit 소문자 hex**(`LiveSpanDictionary.instanceKey()`). URL `?inst=<serviceUid>:<key>`의 값 | ✅ 구현됨 (UX §0이 요구한 그대로) |

- route ID·instance ID는 서비스 수명 안에서 **2부터 단조 증가**, 만료로 재사용 없음. 상한 route 200개·instance 64개(넘으면 `__other__`).

### 2.3 `snapshot.chunk` — `kind: "buckets"`

`LiveSpanSnapshot.produce():101~117` + `LiveSpanStreamCodec.bucket():81~85`/`layer():89~97`/`stats():73~77`

```jsonc
{ "snapshotId": "…", "index": 2, "kind": "buckets",
  "buckets": { "1": [ { …버킷… } ] } }   // key = serviceId(문자열), 값 = 버킷 배열
```

**버킷 객체** (`replaceBuckets`의 원소와 **완전히 같은 모양**)

| 필드 | 타입 | 필수 | 의미 | 불일치 |
|---|---|---|---|---|
| `b` | number(ms epoch) | ✅ | 버킷(1초) 시작 시각. 점 튜플의 `endTsDeltaMs` 기준 | — |
| `pointsRev` | number | ✅ | 점 계층 리비전 — **점 교체 판정용** | — |
| `statsRev` | number | ✅ | 집계 리비전 — **stats 교체 판정용(독립)** | — |
| `provisionalUntil` | number(ms) | ✅ | 이 시각 전이면 "잠정"(늦은 도착 반영 가능) | — |
| `base` | Layer | ✅ | 기본 계층 | — |
| `emphasis` | Layer | ✅ | 강조 계층(`http5xx ∨ spanError ∨ slow`) — 🔴 **항상 ratio=1로 솎지 않는다** | — |
| `stats` | Stats | ✅ | 전체 관측 집계(표본 아님) | — |
| ~~`patterns`~~ | — | ❌ | 🔴 `LiveSpanRing.Bucket`에 `patterns` 필드는 있으나 **codec이 직렬화하지 않는다** | §6-B |

**Layer**(`LiveSpanStreamCodec.layer():89~97`)

| 필드 | 타입 | 필수 | 의미 |
|---|---|---|---|
| `observed` | number | ✅ | 이 계층이 **관측한** 수. 🔴 `base.observed == stats.count` · `emphasis.observed`는 그 **부분집합** — **더하지 말 것** |
| `retained` | number | ✅ | 서버가 실제로 보관 중인 슬롯 수 |
| `delivered` | number | ✅ | 이 이벤트에 실린 점 개수(`points.length`와 같다) |
| `points` | Point[] | ✅ | 튜플 배열(빈 배열 가능) |

**Point 튜플**(`LiveSpanPoint.tuple():11~17`, 비트 상수 `:9`) — 길이 **7** 고정

| idx | 필드 | 타입 | 의미 |
|---|---|---|---|
| 0 | `endTsDeltaMs` | number(int) | `endTs − b`. 실제 종료 시각 = `b + this` |
| 1 | `durationMs` | number(float) | 지연 |
| 2 | `flags` | number(비트) | `1`=http5xx · `2`=spanError · `4`=slow · `8`=emphasisLayer |
| 3 | `routeId` | number(0~65535) | 사전 키 |
| 4 | `instanceId` | number(0~65535) | 사전 키 |
| 5 | `traceId` | string(32 hex) | 소문자 hex, 구분자 없음 |
| 6 | `spanId` | string(16 hex) | 〃 |

**Stats**(`LiveSpanStreamCodec.stats():73~77`)

| 필드 | 타입 | 필수 | 의미 | 불일치 |
|---|---|---|---|---|
| `count` | number | ✅ | 이 버킷의 **전체 관측 수**(TPS의 분자) | — |
| `http5xx` | number | ✅ | `http.response.status_code ≥ 500` 수 | — |
| `spanError` | number | ✅ | `status.code == ERROR` 수 | — |
| `slow` | number | ✅ | `durationMs ≥ slowMs` 수 | — |
| `p50Ms` | number **\| null** | ✅ | `count == 0`이면 null | — |
| `p95Ms` | number **\| null** | ✅ | 〃 | — |
| `p95Approx` | boolean | ✅ | **항상 `true`**(15칸 히스토그램 보간) → 화면은 항상 "약" 표기 | — |
| `maxMs` | number | ✅ | 최댓값 | — |
| `hist` | number[15] | ✅ | 15칸 히스토그램(아래 경계표) | ✅ 구현됨 |
| `histOverflow` | number | ✅ | `hist[14]`와 **같은 값**(중복) — 따로 더하지 말 것 | 🟡 설계는 별도 필드처럼 읽히나 실제는 사본 |
| `lateArrivals` | number | ✅ | 늦은 도착 수정 건수 | — |
| ~~`minMs`~~ | — | ❌ | 🔴 `LiveSpanRing.Stats.minMs`는 있으나 **직렬화되지 않는다** | §6-D |
| ~~`sumMs`~~ | — | ❌ | 🔴 마찬가지 미노출 → **평균 지연을 계산할 수 없다** | §6-D |

**`hist` 15칸 경계(ms)** — `LiveSpanStats.BOUNDS` = `CanonicalBounds.durationSeconds() × 1000`

| bin | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 상한(ms) | 5 | 10 | 25 | 50 | 75 | 100 | 250 | 500 | 750 | 1000 | 2500 | 5000 | 7500 | 10000 | ∞ |

배정 규칙: `bin = 첫 i such that durationMs ≤ BOUNDS[i]`, 없으면 `14`.

### 2.4 `snapshot.end`

```jsonc
{ "snapshotId": "…", "chunks": 9, "checksum": "crc32:9f1a0b3c" }
```

| 필드 | 타입 | 필수 | 의미 |
|---|---|---|---|
| `snapshotId` | string | ✅ | 확정 대상 |
| `chunks` | number | ✅ | 실제로 보낸 chunk 수 — `begin.chunks`와 대조 |
| `checksum` | string | ✅ | `"crc32:" + 8자리 소문자 hex`(`%08x`) |

🔴 **checksum 산식(구현 확인됨, `LiveSpanSnapshot.send():129~147`)**: 그 `snapshotId`의 **`snapshot.chunk` 이벤트만** index 순으로, 각 이벤트의 **`data:` 뒤부터 말미 `\n\n` 직전까지의 UTF-8 바이트**를 그대로 이어붙인 것의 CRC32. `begin`·`end` 자체와 개행은 포함하지 않는다. → FE는 `MessageEvent.data` 문자열을 **그대로**(재직렬화 금지) UTF-8 인코딩해 이어붙여야 같은 값이 나온다.

### 2.5 `spans` (1초 tick, **`id:` 있음**)

`LiveSpanFrames.payload():86~109`

| 필드 | 타입 | 필수 | 의미 | 불일치 |
|---|---|---|---|---|
| `streamEpoch` | string | ✅ | 세대 | — |
| `viewKey` | string | ✅ | view 식별 | — |
| `sinceSeq` | number | ✅ | **항상 `seq − 1`** | — |
| `seq` | number | ✅ | 데이터 발행 번호 | — |
| `serverTime` | number(ms) | ✅ | tick 시각 | — |
| `part.index` / `part.count` | number | ✅ | 같은 seq의 멀티파트(최대 4). 🔴 `count`개를 다 모은 뒤 **한 번에** 적용 | — |
| `dictDelta.from` | number | ✅ | 이 델타가 전제하는 사전 버전 | — |
| `dictDelta.to` | number | ✅ | 적용 후 버전 | — |
| `dictDelta.services` | Service[] | ✅ | **빈 배열 가능**. 🔴 설계 §3.2 예시에는 없지만 **BE는 항상 보낸다** — 신규 서비스가 여기로 온다 | 🟡 설계 예시 축약, **BE가 정본** |
| `dictDelta.routes` | `{ [serviceId]: { [routeId]: string } }` | ✅ | 빈 객체 가능 | — |
| `dictDelta.instances` | `{ [serviceId]: { [instanceId]: {display,key} } }` | ✅ | 빈 객체 가능. 🟡 설계 예시 누락, **BE가 정본** | 🟡 |
| `removeServices` | number[] | ✅ | 퇴출·삭제된 serviceId. 🔴 **`part.index === 0`에만 값이 들어가고 나머지 part는 `[]`** | — |
| `replaceBuckets` | `{ [serviceId]: Bucket[] }` | ✅ | 통째 교체 대상(§2.3 버킷 객체와 동일) | — |
| `statsRevision` | `{ [serviceId]: Revision[] }` | ✅ | 집계만 교체. 원소 = `{b, statsRev, provisionalUntil, stats}` (**`pointsRev`·`base`·`emphasis` 없음**) | — |
| `live` | object | ✅ | 서비스 단위 증분(바뀐 서비스만, 관측 끊김은 빈 값 한 번). 🔴 **2026-09-23부터 `part.index === 0`에만 값이 들어가고 나머지 part는 `{}`** — `removeServices`와 같은 규칙. FE 병합은 part마다 서비스 단위로 덮어쓰므로 빈 맵은 no-op(`ApmLiveSpansMerger.frame`) | ✅ P5.3·B6 #1 |
| `patterns` | object | ✅ | 🔴 **항상 `{}`** | 🔴🔴 §6-B |
| `pressure.arenaPressure` | number | ✅ | 🔴 **누적 카운터**(감소하지 않음), 비율·불리언 아님 | 🔴 §6-C |
| `pressure.serverKeepRatio` | number(0~1) | ✅ | 서버가 이 frame에 적용한 base 유지 비율(`1/k`, 점 전면 생략 시 `0`) | — |
| `pressure.clientKeepRatio` | number(0~1) | ✅ | 이 연결에만 적용된 추가 솎음 비율(`1/keep`) | — |

### 2.6 `heartbeat` (5초, 데이터가 없을 때만, `id:` 없음)

```jsonc
{ "ts": 1789000006000, "lastSeq": 184221 }
```
`LiveSpanStreamService.heartbeat():482~488`. 🔴 `lastSeq`는 **알림일 뿐 커서를 전진시키지 않는다**.

### 2.7 `control` (`id:` 없음, `retry:3000`; 컨트롤러 밖 거절만 `retry:15000`)

| `type` | 페이로드(실제) | 발생 지점 |
|---|---|---|
| `reject` | `{type, code, errorCode, retryable, retryAfterMs?}` — `retryAfterMs`는 `retryable:true`일 때만(항상 `15000`) | `reject():497~504`, `LiveStreamRejectionAdvice:31~38` |
| `paused` | `{type:"paused", code:200, errorCode:"APM_LIVE_SNAPSHOT_QUEUED", queuePosition:number}` | `admit():358` |
| `degraded` | `{type:"degraded", clientKeepRatio:number, reason:"connection_queue"\|"frame_limit"\|"arena_pressure"}` | `degrade():390~395`, `tick():273` |
| `epochChanged` | `{type:"epochChanged", streamEpoch:string}` | `admit():363` |
| ~~`resume`~~ | ❌ **BE가 보내지 않는다** | 🔴 설계 §2.5 표의 `resume`은 **오기**. `paused` 해제 신호는 **새 `snapshot.begin` 도착**이다 |

**`reject.errorCode` 전량**(코드에서 수집한 실제 값):

| errorCode | code | retryable | 의미 |
|---|---|---|---|
| `APM_VIEW_FORBIDDEN` | 403 | false | apm.view 권한 없음 / MCP 토큰 |
| `APM_LICENSE_REQUIRED` | 403 | false | `Feature.APM` 라이선스 |
| `APM_LIVE_DISABLED` | 503 | false | 기능 스위치 꺼짐 |
| `APM_LIVE_TOO_MANY_CONNECTIONS` | 429 | true | 활성 40 / 대기 10 / 사용자당 4 초과 — 2026-09-23부터 설정 `app.apm.live.spans.stream.{max-active,max-waiting,per-user,max-snapshots,queue-mib,write-timeout-ms}`(기본값은 같다) |
| `APM_LIVE_QUEUE_FULL` | 429 | true | 이 연결의 송신 큐 초과 |
| `APM_LIVE_FRAME_UNAVAILABLE` | 429 | true | 이 view의 frame 인코딩 실패 |
| `APM_LIVE_SNAPSHOT_FAILED` | 429 | true | snapshot 생성 실패·취소 |
| `APM_LIVE_SNAPSHOT_UNAVAILABLE` | 503 | true | snapshot 중 런타임 예외 |
| `APM_LIVE_UNAVAILABLE` | 429 | true | tick 5회 연속 실패 → 전체 리셋 |

🔴 `reject`는 **연결을 닫기 직전**에 보내는 최선 노력이다 — 소켓이 이미 막혀 있으면 **아무 `control` 없이 그냥 끊긴다**(`reject():500~501`). FE는 "control 없는 단절"도 정상 경로로 다뤄야 한다.

---

## 3. FE가 만들어야 할 타입 초안 (TypeScript)

> **배치 제안**: `src/types/apmLiveSpans.ts` — 기존 `types/apm.ts`와 **분리**한다. P1.5 Live(`/apm/live/stream`, 10초 bucket, `TApmLiveStreamState`·`APM_LIVE_EVENT`·`APM_LIVE_CONNECTION`)와 **다른 스트림**이므로 접두어도 `TApmLiveSpans*`·`APM_LIVE_SPANS_*`로 갈라 이름 충돌을 피한다.
>
> **따르는 기존 규약**(`types/apm.ts` 실사 결과):
> - `interface` 대신 **`type`만** 쓴다(파일 전체에 `interface` 0건).
> - 필드에 `readonly`를 붙이지 않는다. 배열 상수만 `as const`로 고정한다.
> - TS `enum`을 쓰지 않는다 → **const 객체 + `as const` + `(typeof X)[keyof typeof X]`** 패턴, 또는 값 목록 재사용이 필요 없으면 순수 union 리터럴.
> - 🔴 **`?`와 `| null`을 의미로 구분한다**: `?` = 키 자체가 없을 수 있음(가산 필드·슬롯 부재), `| null` = 키는 항상 오고 값이 "없음"이 관측된 사실(0과 다름). 이 스트림은 **`| null`이 압도적**이다 — 서버가 필드를 생략하지 않는다.

```ts
// src/types/apmLiveSpans.ts
// APM P5 라이브 스팬 스트림(GET /apm/live/spans/stream)의 수신 계약.
// 🔴 P1.5 Live(/apm/live/stream)와 다른 스트림·다른 주기·다른 병합 규칙이다. 타입을 공유하지 않는다.
// 🔴 이 파일의 모든 shape은 BE LiveSpanStreamCodec이 실제로 직렬화하는 것이 정본이다.

// ─────────────────────────────────────────────────────────────
// 공통 스칼라
// ─────────────────────────────────────────────────────────────
/** ms epoch */
export type TApmLiveSpansEpochMs = number;

/** 서비스 내부 id(long). 🔴 JSON 객체의 키로 올 때는 문자열이다. */
export type TApmLiveSpansServiceId = number;

/** 점 튜플의 flags 비트 (BE LiveSpanPoint.HTTP5XX/SPAN_ERROR/SLOW/EMPHASIS) */
export const APM_LIVE_SPANS_FLAG = {
  HTTP_5XX: 1,
  SPAN_ERROR: 2,
  SLOW: 4,
  EMPHASIS: 8,
} as const;

/** SSE 이벤트 이름 — addEventListener에 그대로 쓴다 */
export const APM_LIVE_SPANS_EVENT = {
  SNAPSHOT_BEGIN: "snapshot.begin",
  SNAPSHOT_CHUNK: "snapshot.chunk",
  SNAPSHOT_END: "snapshot.end",
  SPANS: "spans",
  HEARTBEAT: "heartbeat",
  CONTROL: "control",
} as const;

export type TApmLiveSpansEvent =
  (typeof APM_LIVE_SPANS_EVENT)[keyof typeof APM_LIVE_SPANS_EVENT];

/** stats.hist 15칸의 상한(ms). 마지막 칸(index 14)은 무한대(= 10,000ms 초과). */
export const APM_LIVE_SPANS_HIST_BOUNDS_MS = [
  5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000,
] as const;

/** 창 길이(초). 🔴 300 또는 900만 — 그 외는 BE가 400으로 거절한다. */
export const APM_LIVE_SPANS_WINDOW = { FIVE_MIN: 300, FIFTEEN_MIN: 900 } as const;

export type TApmLiveSpansWindow =
  (typeof APM_LIVE_SPANS_WINDOW)[keyof typeof APM_LIVE_SPANS_WINDOW];

// ─────────────────────────────────────────────────────────────
// 사전
// ─────────────────────────────────────────────────────────────
export type TApmLiveSpansService = {
  /** routes·instances·replaceBuckets의 키가 되는 내부 id */
  id: TApmLiveSpansServiceId;
  /** 외부 식별자 — URL ?svc=·서비스 상세 링크는 이것을 쓴다 */
  uid: string;
  displayName: string;
  env: string | null;
};

export type TApmLiveSpansInstance = {
  /** 도착값 앞 8 코드포인트. 표시 전용 — 충돌 가능해 URL·필터 키로 쓰지 않는다. */
  display: string;
  /** SHA-256(UTF-8 도착값) 앞 64bit hex 16자. URL ?inst=<serviceUid>:<key>의 값. */
  key: string;
};

/** serviceId(문자열 키) → routeId(문자열 키) → route 문자열. "0"=__none__, "1"=__other__ 항상 포함 */
export type TApmLiveSpansRouteDict = Record<string, Record<string, string>>;

/** serviceId(문자열 키) → instanceId(문자열 키) → 인스턴스 */
export type TApmLiveSpansInstanceDict = Record<
  string,
  Record<string, TApmLiveSpansInstance>
>;

// ─────────────────────────────────────────────────────────────
// 점 · 계층 · 집계 · 버킷
// ─────────────────────────────────────────────────────────────
/** [endTsDeltaMs, durationMs, flags, routeId, instanceId, traceId, spanId] — 길이 7 고정 */
export type TApmLiveSpansPoint = [
  endTsDeltaMs: number,
  durationMs: number,
  flags: number,
  routeId: number,
  instanceId: number,
  traceId: string,
  spanId: string,
];

export type TApmLiveSpansLayer = {
  /** 🔴 base.observed === stats.count · emphasis.observed는 그 부분집합 — 두 값을 더하지 않는다 */
  observed: number;
  /** 서버가 실제 보관 중인 슬롯 수(고유 요청 수가 아니다) */
  retained: number;
  /** 이 이벤트에 실린 점 개수(points.length와 같다) */
  delivered: number;
  points: TApmLiveSpansPoint[];
};

export type TApmLiveSpansStats = {
  /** 전체 관측 수 — TPS의 분자. 🔴 점 개수로 세지 않는다 */
  count: number;
  http5xx: number;
  spanError: number;
  slow: number;
  /** count === 0 이면 null */
  p50Ms: number | null;
  p95Ms: number | null;
  /** 🔴 항상 true(15칸 히스토그램 보간) — 화면은 항상 "약" 표기 */
  p95Approx: boolean;
  maxMs: number;
  /** 길이 15 고정. 경계는 APM_LIVE_SPANS_HIST_BOUNDS_MS */
  hist: number[];
  /** 🔴 hist[14]의 사본이다 — hist 합계에 더하면 중복 계수 */
  histOverflow: number;
  lateArrivals: number;
  // 🔴 minMs·sumMs는 BE가 내보내지 않는다(평균 지연 계산 불가) — 계약서 §6-D
};

export type TApmLiveSpansBucket = {
  /** 버킷(1초) 시작 ms. 점의 실제 종료 시각 = b + point[0] */
  b: TApmLiveSpansEpochMs;
  /** 점 계층 리비전 — 점 교체 판정용 */
  pointsRev: number;
  /** 집계 리비전 — stats 교체 판정용(pointsRev와 독립) */
  statsRev: number;
  /** 이 시각 전이면 "잠정"(늦은 도착 반영 가능) */
  provisionalUntil: TApmLiveSpansEpochMs;
  base: TApmLiveSpansLayer;
  /** 🔴 강조 계층은 서버가 솎지 않는다(항상 ratio=1) */
  emphasis: TApmLiveSpansLayer;
  stats: TApmLiveSpansStats;
};

/** statsRevision의 원소 — 🔴 pointsRev·base·emphasis가 없다 */
export type TApmLiveSpansStatsRevision = {
  b: TApmLiveSpansEpochMs;
  statsRev: number;
  provisionalUntil: TApmLiveSpansEpochMs;
  stats: TApmLiveSpansStats;
};

// ─────────────────────────────────────────────────────────────
// snapshot.begin / .chunk / .end
// ─────────────────────────────────────────────────────────────
export type TApmLiveSpansNode = {
  /** 🔴 현 구현은 streamEpoch와 같은 UUID다 — 노드 "이름"으로 표시하지 않는다 */
  nodeId: string;
  startedAt: TApmLiveSpansEpochMs;
  /** 복원 가능 범위의 시작. UX §0 `at` 부분복원 판정에 쓴다 */
  coverageFrom: TApmLiveSpansEpochMs;
};

export type TApmLiveSpansConfig = {
  /** 서버 보관 창(기본 900) */
  windowSeconds: number;
  /** 이 view의 창 */
  snapshotSeconds: TApmLiveSpansWindow;
  /** 전역 느림 기준. 개별 점의 정상/느림 판정은 이 값 하나뿐이다 */
  slowMs: number;
  /** 전역 P95_LATENCY 알람 임계. 🔴 null이면 참고선을 그리지 않는다(대체값 생성 금지) */
  p95ThresholdMs: number | null;
  /** 전역 ERROR_RATE 알람 임계(%). 🔴 null이면 선 없이 값만 */
  errorRateThresholdPct: number | null;
  pointsPerBucket: number;
  emphasisPerBucket: number;
  emphasisPerService: number;
  emphasisTotal: number;
  arenaTotal: number;
  retention: { perServicePerSec: number; totalPoints: number };
};

export type TApmLiveSpansSnapshotBegin = {
  snapshotId: string;
  streamEpoch: string;
  seq: number;
  viewKey: string;
  serverTime: TApmLiveSpansEpochMs;
  /** dictChunks + 버킷 chunk 수 */
  chunks: number;
  dictChunks: number;
  dictVersion: number;
  /** base 계층 표본 유지 비율. 1이면 솎지 않음 */
  snapshotKeepRatio: number;
  node: TApmLiveSpansNode;
  config: TApmLiveSpansConfig;
  /** 🔴 현 BE는 항상 {} — 계약서 §6-A(BE 추가 필요) */
  live: Record<string, never>;
};

export type TApmLiveSpansDictChunk = {
  snapshotId: string;
  index: number;
  kind: "dict";
  dictVersion: number;
  services: TApmLiveSpansService[];
  routes: TApmLiveSpansRouteDict;
  instances: TApmLiveSpansInstanceDict;
};

export type TApmLiveSpansBucketsChunk = {
  snapshotId: string;
  index: number;
  kind: "buckets";
  /** serviceId(문자열 키) → 버킷 배열(b 오름차순) */
  buckets: Record<string, TApmLiveSpansBucket[]>;
};

export type TApmLiveSpansChunk = TApmLiveSpansDictChunk | TApmLiveSpansBucketsChunk;

export type TApmLiveSpansSnapshotEnd = {
  snapshotId: string;
  /** begin.chunks와 대조 */
  chunks: number;
  /** "crc32:" + 8자리 소문자 hex */
  checksum: string;
};

// ─────────────────────────────────────────────────────────────
// spans (1초 tick, id: "<streamEpoch>:<seq>")
// ─────────────────────────────────────────────────────────────
export type TApmLiveSpansDictDelta = {
  /** 이 델타가 전제하는 사전 버전. 내가 가진 dictVersion과 다르면 snapshot 재요청 */
  from: number;
  to: number;
  /** 🔴 설계 §3.2 예시엔 없지만 BE는 항상 보낸다 — 신규 서비스가 여기로 온다 */
  services: TApmLiveSpansService[];
  routes: TApmLiveSpansRouteDict;
  instances: TApmLiveSpansInstanceDict;
};

export type TApmLiveSpansPressure = {
  /** 🔴 누적 카운터(감소하지 않음) — "현재 압박 중"으로 읽지 않는다. 계약서 §6-C */
  arenaPressure: number;
  /** 서버가 이 frame에 적용한 base 유지 비율(1/k, 점 전면 생략 시 0) */
  serverKeepRatio: number;
  /** 이 연결에만 적용된 추가 솎음 비율(1/keep) */
  clientKeepRatio: number;
};

export type TApmLiveSpansFrame = {
  streamEpoch: string;
  viewKey: string;
  /** 🔴 항상 seq - 1 */
  sinceSeq: number;
  seq: number;
  serverTime: TApmLiveSpansEpochMs;
  /** 같은 seq의 멀티파트(최대 4). count개를 다 모은 뒤 한 번에 적용한다 */
  part: { index: number; count: number };
  dictDelta: TApmLiveSpansDictDelta;
  /** 🔴 part.index === 0 에만 값이 들어간다(나머지 part는 []) */
  removeServices: TApmLiveSpansServiceId[];
  /** serviceId(문자열 키) → 통째 교체할 버킷 배열 */
  replaceBuckets: Record<string, TApmLiveSpansBucket[]>;
  /** serviceId(문자열 키) → 집계만 교체할 리비전 배열 */
  statsRevision: Record<string, TApmLiveSpansStatsRevision[]>;
  /** 🔴 현 BE는 항상 {} — 계약서 §6-A */
  live: Record<string, never>;
  /** 🔴 현 BE는 항상 {} — 계약서 §6-B(P5.4 범위) */
  patterns: Record<string, never>;
  pressure: TApmLiveSpansPressure;
};

// ─────────────────────────────────────────────────────────────
// heartbeat · control
// ─────────────────────────────────────────────────────────────
export type TApmLiveSpansHeartbeat = {
  ts: TApmLiveSpansEpochMs;
  /** 🔴 마지막 데이터 seq 알림일 뿐 — 커서를 전진시키지 않는다 */
  lastSeq: number;
};

export const APM_LIVE_SPANS_REJECT_CODE = {
  VIEW_FORBIDDEN: "APM_VIEW_FORBIDDEN",
  LICENSE_REQUIRED: "APM_LICENSE_REQUIRED",
  DISABLED: "APM_LIVE_DISABLED",
  TOO_MANY_CONNECTIONS: "APM_LIVE_TOO_MANY_CONNECTIONS",
  QUEUE_FULL: "APM_LIVE_QUEUE_FULL",
  FRAME_UNAVAILABLE: "APM_LIVE_FRAME_UNAVAILABLE",
  SNAPSHOT_FAILED: "APM_LIVE_SNAPSHOT_FAILED",
  SNAPSHOT_UNAVAILABLE: "APM_LIVE_SNAPSHOT_UNAVAILABLE",
  UNAVAILABLE: "APM_LIVE_UNAVAILABLE",
} as const;

export type TApmLiveSpansRejectCode =
  (typeof APM_LIVE_SPANS_REJECT_CODE)[keyof typeof APM_LIVE_SPANS_REJECT_CODE];

/** 배지 문구가 3분기된다(UX §2.3) */
export type TApmLiveSpansDegradedReason =
  | "connection_queue"
  | "frame_limit"
  | "arena_pressure";

export type TApmLiveSpansControlReject = {
  type: "reject";
  code: 403 | 429 | 503;
  errorCode: TApmLiveSpansRejectCode;
  retryable: boolean;
  /** retryable === true 일 때만 온다. 현 구현은 항상 15000 */
  retryAfterMs?: number;
};

export type TApmLiveSpansControlPaused = {
  type: "paused";
  code: 200;
  errorCode: "APM_LIVE_SNAPSHOT_QUEUED";
  queuePosition: number;
};

export type TApmLiveSpansControlDegraded = {
  type: "degraded";
  clientKeepRatio: number;
  reason: TApmLiveSpansDegradedReason;
};

export type TApmLiveSpansControlEpochChanged = {
  type: "epochChanged";
  streamEpoch: string;
};

/** 🔴 "resume"은 BE가 보내지 않는다 — paused 해제는 새 snapshot.begin 도착으로 안다 */
export type TApmLiveSpansControl =
  | TApmLiveSpansControlReject
  | TApmLiveSpansControlPaused
  | TApmLiveSpansControlDegraded
  | TApmLiveSpansControlEpochChanged;

// ─────────────────────────────────────────────────────────────
// 요청 · 커서 · 연결 상태
// ─────────────────────────────────────────────────────────────
export type TApmLiveSpansParams = {
  serviceUid?: string;
  env?: string;
  /** 🔴 실제 쿼리 키는 하이픈이 든 "snapshot-seconds"다 */
  snapshotSeconds?: TApmLiveSpansWindow;
};

/** 재접속 커서 — 🔴 셋을 함께 보낸다 */
export type TApmLiveSpansCursor = {
  sinceEpoch: string;
  /** 마지막으로 "완전히 적용한" seq(되감지 않는다) */
  sinceSeq: number;
  viewKey: string;
};

/** 🔴 스트림을 열기 전 실패(실제 HTTP 401/400)의 본문 — ApiResult가 아니다(status·message 없음) */
export type TApmLiveSpansPreflightError = {
  code: 401 | 400;
  errorCode: "INVALID_TOKEN" | "APM_LIVE_INVALID_QUERY";
};

/** 화면 연결 상태 3단(UX §2.8) — 소켓 상태와 "갱신 중"은 다른 축이다 */
export const APM_LIVE_SPANS_CONNECTION = {
  CONNECTING: "connecting",
  /** 소켓 열림 + 최근 12초 내 spans/heartbeat 수신 */
  LIVE: "live",
  /** 소켓 열림 + 12초 이상 무수신 */
  STALLED: "stalled",
  /** 입장 대기(control{paused}) — 연결은 유지된다 */
  QUEUED: "queued",
  RECONNECTING: "reconnecting",
  CLOSED: "closed",
} as const;

export type TApmLiveSpansConnection =
  (typeof APM_LIVE_SPANS_CONNECTION)[keyof typeof APM_LIVE_SPANS_CONNECTION];
```

### 3.1 API 함수 초안 — `src/services/apm.api.ts`에 추가

기존 `liveStreamUrl`(P1.5, `apm.api.ts:472~484`)과 **같은 관례**를 따른다. 🔴 `import.meta.env`를 이 파일에서 직접 읽지 않는다(jest가 파싱하지 못한다 — 레포 공통 규약). `API.defaults?.baseURL`을 쓴다.

```ts
// apm.api.ts — 기존 liveStreamUrl 바로 아래에 추가
// 🔴 P5 사람용 스트림. P1.5 liveStreamUrl(/live/stream)과 경로·주기·payload가 전부 다르다.
// 🔴 액세스 토큰을 쿼리에 싣지 않는다. 인증은 accessToken 쿠키(EventSource withCredentials),
//    세션 대조는 visitorId 쿼리(EventSource는 커스텀 헤더를 못 실어 x-visitor-id를 쓸 수 없다).
const liveSpansStreamUrl = (
  params: TApmLiveSpansParams = {},
  cursor?: TApmLiveSpansCursor,
): string => {
  const visitorId =
    typeof localStorage === "undefined"
      ? null
      : localStorage.getItem(STORAGE_KEYS.X_VISITOR_ID);
  const query = new URLSearchParams(
    clean({
      serviceUid: params.serviceUid,
      env: params.env,
      // 🔴 쿼리 키는 하이픈. BE @RequestParam(name = "snapshot-seconds")
      "snapshot-seconds": params.snapshotSeconds,
      sinceEpoch: cursor?.sinceEpoch,
      sinceSeq: cursor?.sinceSeq,
      viewKey: cursor?.viewKey,
      visitorId,
    }) as Record<string, string>,
  );
  const search = query.toString();
  const base = (API.defaults?.baseURL ?? "").replace(/\/+$/, "");
  return `${base}${baseUrl}/live/spans/stream${search ? `?${search}` : ""}`;
};
```
→ `ApmService` 객체 리터럴(`apm.api.ts:913~1005`)에 `liveSpansStreamUrl`을 추가한다.

### 3.2 훅 — `src/hooks/useApmLiveSpans.ts` (신설)

🔴 **기존 `useApmLive`를 고쳐 쓰지 않는다.** P1.5와 이벤트 이름·병합 규칙·커서·control 상태 머신이 전부 다르고, `useApmLive`는 개요 화면이 동시에 쓰고 있다.

계승할 패턴(`useApmLive.ts` 실사):
- `new window.EventSource(url, { withCredentials: true })` — 🔴 dev에서 FE(:5173)↔BE(:3000) 교차 출처라 **필수**.
- 커스텀 이벤트명을 `addEventListener`로 등록(기본 `message` 리스너는 쓰지 않는다).
- `onerror`는 상태만 바꾸고 **throw하지 않는다**.
- cleanup에서 `removeEventListener` → **`source.close()`** → 상태 `CLOSED`. 안 닫으면 서버 emitter가 쌓인다.
- `typeof EventSource === "undefined"` 가드(jsdom/테스트).

🔴 **바꿔야 하는 것 하나**: `useApmLive`는 "재접속을 `EventSource`에 전부 맡긴다"(지수 백오프 리셋 방지). P5는 **`control{reject, retryable:true}`를 받으면 명시적으로 `close()` 후 `retryAfterMs`+jitter 뒤 커서를 실어 새로 연다**(설계 §2.5 상태 머신). 네이티브 자동 재접속은 **`onerror`(단순 네트워크 단절)에만** 맡긴다. 두 경로를 섞으면 안 된다.

**viewKey 산식**(`LiveSpanStreamView.key()`) — FE가 직접 만들 필요 없이 **마지막 이벤트의 `viewKey`를 보관해 재사용**하는 것이 안전하다(문자열 인코딩 규칙이 미묘하다). 참고:
```
`${serviceUid ?? "all"}|${envEncoded}|http|${seconds}|sampling-v1`
// envEncoded: env 없음 → "all" · env === "all" → "%61ll"
//             그 밖 → "%"→"%25", "|"→"%7C" 치환
```

---

## 4. 병합 규칙 체크리스트 (구현자 체크용)

- [ ] **① 커서는 `(streamEpoch, viewKey, seq)` 삼중이다.** `spans` 수신 시 `streamEpoch`나 `viewKey`가 내가 가진 것과 다르면 **가진 것을 전부 버리고** snapshot을 기다린다. 같으면 `sinceSeq === 마지막으로 적용한 seq`일 때만 적용하고, `seq ≤ 마지막`이면 **조용히 무시**(재전송 흡수), `seq > 마지막 + 1`이면 **건너뛰지 말고** 재접속(`sinceEpoch/sinceSeq/viewKey`) 또는 snapshot으로 복구한다.
- [ ] **①-b `part`를 모아 한 번에 적용한다.** `part.count > 1`이면 같은 `seq`의 part를 `count`개 전부 모은 뒤 적용한다. **중간 part를 차트에 그리지 않는다.** `removeServices`는 `part.index === 0`에만 실린다.
- [ ] **② `pointsRev`와 `statsRev`는 완전히 독립이다.** `replaceBuckets`의 버킷은 `(serviceId, b)` 키로 **통째 교체**하되 `pointsRev`가 내가 가진 값보다 작거나 같으면 **점을 무시**하고, 그 버킷에 동봉된 `stats`는 **`statsRev`로 따로 비교**해 적용한다. `statsRevision`은 `statsRev`가 클 때만 `stats`를 덮어쓰고 **점은 건드리지 않는다**. 하나의 `rev`로 뭉뚱그리면 점 교체와 통계 교체가 서로를 밀어낸다.
- [ ] **③ `provisionalUntil`이 지나지 않은 버킷은 "잠정"이다.** `Date.now() < provisionalUntil`(서버 시각 기준으로 보정)인 버킷은 게이지·최신 칸을 **흐리게/해칭**으로 표시한다. 그 뒤에도 `lateArrivals`로 수정이 오므로 "확정"이라고 쓰지 않는다.
- [ ] **④ `removeServices`는 즉시 반영한다.** 해당 `serviceId`의 **버킷·사전(routes·instances)·화면 상태를 전부 버린다.** ID는 재사용되지 않으므로 남겨 두면 영원히 유령 서비스가 된다. URL 필터(`route`/`inst`)는 **문자열**로 들고 있으므로 지우지 말고 "필터 대상이 현재 사전에 없음(결과 0)" 배지 + 해제 버튼으로 남긴다.
- [ ] **⑤ 새 `snapshot.begin`이 오면 직전 미완 snapshot의 chunk 버퍼를 즉시 폐기한다.** 서버는 전송량 상한 초과 시 **새 `snapshotId`로 `begin`부터 다시** 보낸다(최대 3회, 선행 신호로 `control{degraded, reason:"frame_limit"}`). `end` 없이 끝난 `snapshotId`는 **절대 확정하지 않는다.** "먼저 받은 snapshotId 하나만 모은다"고 구현하면 두 시도의 chunk가 섞이거나 영원히 `end`를 못 받는다.
- [ ] **⑤-b snapshot은 `end`에서 한 번에 확정한다.** `chunks` 수 일치 + `checksum` 일치를 확인한 뒤에만 화면에 반영한다(그 전에는 스켈레톤, 중간 chunk를 그리지 않는다). 확정 전 도착한 `spans`는 **버퍼(상한 30개)** 에 두었다가 확정 후 ①의 `sinceSeq` 규칙으로 적용한다.
- [ ] **⑥ `dictDelta.from`이 내가 가진 `dictVersion`과 다르면 사전을 믿지 않는다** → 재접속(snapshot). `dictDelta.services`도 반드시 병합한다(신규 서비스가 여기로 온다).
- [ ] **⑦ 집계는 `stats`에서만 읽는다.** TPS·오류율·p95는 `stats.count`/`http5xx`/`spanError`/`hist`로 계산하고, **점 개수로 세지 않는다**(점은 표본이다). `p95Approx`가 항상 true이므로 항상 "약" 표기.
- [ ] **⑧ 배지 산식.** `observedCount = Σ stats.count`(창 안 버킷). `displayedCount` = 실제 그린 **고유 `(traceId, spanId)` 수**(base·emphasis 중복 제거 후, 브라우저 솎음 반영 후). 🔴 `base.observed + emphasis.observed`를 더하면 같은 요청을 두 번 센다. `retainedSlots = Σ(base.retained + emphasis.retained)`는 **슬롯 수**이지 고유 요청 수가 아니다.
- [ ] **⑨ 창 밖 버킷은 폐기한다.** `b < serverTime − snapshotSeconds*1000`인 버킷은 버린다.
- [ ] **⑩ control 없는 단절도 정상 경로다.** 소켓이 막히면 서버는 `reject`를 못 보내고 그냥 끊는다. 또한 **10분(`600000ms`)마다 서버가 연결을 닫는다** — `onerror`+`CONNECTING`은 네이티브 재접속에 맡기고 오류 배너를 띄우지 않는다.

---

## 5. 상한 · 거절 사유 — 화면이 보여 줘야 하는 것

### 5.1 배지·문구로 나가는 것

| 신호 | 출처 필드 | 화면 문구(UX §2.3) |
|---|---|---|
| 서버 전송량 상한 | `control{degraded, reason:"frame_limit", clientKeepRatio}` | "서버 전송량 상한으로 1/k" |
| 이 연결의 큐 초과 | `control{degraded, reason:"connection_queue", clientKeepRatio}` | "이 연결은 1/k로 솎아 받는 중" |
| 서버 보관 압박 | `control{degraded, reason:"arena_pressure", clientKeepRatio}` | "서버 보관 축소로 1/k" |
| snapshot 솎음 | `snapshot.begin.snapshotKeepRatio` (<1) | 배지 보조 정보 |
| 서버 frame 솎음 | `pressure.serverKeepRatio` (<1) | 배지 보조 정보 |
| 이 연결 솎음 | `pressure.clientKeepRatio` (<1) | 배지 "이 연결 1/k" |
| 입장 대기 | `control{paused, queuePosition}` | "입장 대기 중(n번째)" — **연결 유지**, 스켈레톤 |
| 세대 교체 | `control{epochChanged}` | "서버가 재시작되어 창을 다시 받습니다" — **연결 유지**, 전부 버리고 snapshot 대기 |
| 서버 보관 축소 중 | `pressure.arenaPressure > 0` | ⚠️ **누적 카운터라 한 번 발생하면 영구 true** — §6-C 해결 전에는 이 배지를 쓰지 말 것 |

**배지 산식 정본**
- `표시 {displayedCount} / 관측 {observedCount} (서버 보관 슬롯 {retainedSlots} · 이 연결 1/{k} · 브라우저 1/{j})`
- `observedCount = Σ(창 안 모든 버킷).stats.count`
- `displayedCount = |{ (traceId, spanId) : 실제로 그린 점 }|` (중복 제거)
- `retainedSlots = Σ(base.retained + emphasis.retained)` — 슬롯 수(겹침 포함)
- `k = 1 / pressure.clientKeepRatio`, `j` = FE 자체 상한 솎음 비율

### 5.2 서버 상한 (연결·전달)

| 대상 | 값 | 넘으면 FE가 받는 신호 |
|---|---|---|
| 활성 연결 | 40 | `reject 429 APM_LIVE_TOO_MANY_CONNECTIONS` |
| 대기 연결 | 10 | 〃 |
| 사용자당 연결 | **4** | 〃 — 🔴 탭 여러 개·wall 모드에서 쉽게 닿는다 |
| snapshot 동시 생성 | 2 | `paused{queuePosition}` |
| tick frame | 2MiB/view, 최대 4 part | `degraded{frame_limit}`, 최악에는 점 생략(`statsRevision`만) |
| 연결별 송신 큐 | 8MiB 또는 5초분 | `degraded{connection_queue}` → `reject 429 APM_LIVE_QUEUE_FULL` |
| 재생 로그 | view당 10초·10개 프레임 | 로그 밖 커서는 snapshot으로 복구 |
| snapshot 전송량 | 300초 뷰 32MiB / 900초 뷰 96MiB | `snapshotKeepRatio` 하락 → 새 `snapshotId`로 재시작(최대 3회) → 초과 시 `reject 503` |
| 스트림 수명 | **600초** | 소켓 종료 → 네이티브 재접속 |

출처: `LiveStreamLimits.defaults()`, `LiveSpanSnapshot`, `LiveServletWriter`. 활성·대기·사용자당·snapshot·큐·write는 2026-09-23부터 설정(`app.apm.live.spans.stream.*`)이고 위 값은 기본값이다.

#### 5.2a `GET /apm/live/spans/stats` — 지금 상태 (2026-09-23 신설, 백로그 B7 #4)

일반 REST(`x-visitor-id` 헤더 · apm view · 🔴 MCP 토큰 403). `ApiResult<ApmLiveStreamStatsDto>`. **수만 온다** — 계정 식별자 없음.

| 필드 | 뜻 | 화면 사용 |
|---|---|---|
| `enabled` | `app.apm.live.spans.enabled` | — |
| `limits.{maxActive,maxWaiting,perUser,maxSnapshots,queueMib,writeTimeoutMs}` | 유효 상한(기동 때 읽은 값) | `perUser`·`maxActive` |
| `connections.{total,active,queued,pending,users,mine,views,snapshotsInFlight}` | 지금 열린 연결 분포. `queued` = 대기열(paused 통지 받음) · `pending` = 방금 열려 다음 tick(≤1초)에 입장할 연결(정상 연결도 1초 안에 지난다 — 코덱스 09-28 🟡로 `waiting` 하나에서 갈랐다) · `mine` = 요청한 계정의 연결 수(숨긴 탭 포함). 🔴 값은 tick·연결·해제 때 굳힌 스냅샷(최대 1초 낡음) — stats가 tick 잠금을 잡지 않는다 | 헤더 "내 연결 {mine}/{perUser}" · "전체 시청 {active}/{maxActive}" · 대기·429 배너의 "탭 {mine}개" 안내 |
| `counters.{rejected,degraded,writerTimeouts,writerFailures,tickFailures,snapshots}` | 기동 이후 누적 | 운영 진단(화면 미표시) |
| `seq`·`streamEpoch`·`startedAt`·`serverTime` | 발행 번호·세대·기동 시각·응답 시각 | — |

FE: `ApmService.getLiveSpansStats` · `useApmLiveSpansStats(enabled)`(15초 폴링, 페이지가 한 번 읽어 두 탭에 전달) · 타입 `TApmLiveStreamStatsDto`. 기동 로그에도 유효 상한이 한 줄 찍힌다(`LiveSpanStreamService.start`).

### 5.3 서버 보관 상한 (표시 축소 — FE는 `observed/retained/delivered`로 본다)

| 규칙 | 값 | 화면 표현 |
|---|---|---|
| base reservoir | 200점/서비스/초 | 군집 툴팁 "이 구간 관측 {observed} · 서버 보관 {retained} · 전달 {delivered}" |
| 강조 계층 | 50/버킷 · 20,000/서비스 · 50,000 전역 | 〃 (강조는 솎지 않음) |
| 전역 arena | 1,400,000 슬롯 | `pressure.arenaPressure` |
| route 사전 | 200/서비스 | 초과분은 `__other__` → "기타(상한에 접힘) — 링크 없음" |
| instance 사전 | 64/서비스 | 〃 |
| 사전 바이트 예산 | 20MiB | 〃 |
| route 미식별 | `routeId === 0` = `__none__` | "경로 미식별" |

### 5.4 수신 거절 사유 (이 스트림에는 오지 않는다 — 수집기 탭용)

🔴 **이 SSE 페이로드에는 거절 사유 카운터가 실리지 않는다.** 화면에 보여 주려면 별도 EP `GET /apm/collectors/{id}/live`(`ApmCollectorLiveDto.Backend.rejectedSpans` / `slimBypassed`)를 조회해야 한다 — 실시간 관제 화면이 이것을 쓸지는 **미결**(§6-G).

- **스팬 단위** `LiveSpanRejection`(11개 상수, 설계는 10종으로 규정 — `instanceBudget`은 미사용 잔존): `batchOverflow` · `outsidePopulation` · `malformed` · `timeReversed` · `metadataUnavailable` · `serviceUnknown` · `servicePending` · `serviceHidden` · `instanceBudget`(🟡 미사용) · `future` · `stale`
- **요청 단위** `LiveIngestCounters.Reason`(16개 상수, 설계는 14종 — 코드에는 `rateLimited`·`rateLimitMapFull`도 있다): `bodyTooLarge` · `compressedTooLarge` · `unsupportedEncoding` · `malformed` · `tooManySpans`(이력) · `disabled` · `busy` · `unauthorized` · `readTimeout` · `internalError` · `tokenRevoked` · `metadataUnavailable` · `rateLimited` · `rateLimitMapFull` · `dedupFull` · `storageUnavailable`
- **카나리아** `LiveSlimReason`(11): `eventsPresent` · `linksPresent` · `unknownKey` · `scopeResidue` · `resourceSchemaUrl` · `nameNotLive` · `statusMessage` · `traceState` · `typeMismatch` · `lengthOver` · `formUnsafe`

---

## 6. 🔴 착수 전 확인 필요 목록

> 분류: **BE 추가 필요** = 화면이 요구하는데 BE가 안 준다 / **설계 정정 필요** = 문서가 코드와 다르다 / **결정 필요** = 사람이 정해야 한다.

### 한눈에

| # | 항목 | 분류 | 심각도 | 착수 차단 |
|---|---|---|---|---|
| A | `live{}`가 통째로 비어 있음 (`active`·`cpuPct`·`heapPct`·`threads`·`instances[]` 전무) | **BE 추가 필요** | 🔴🔴 | **P5.3 부분 차단** |
| B | `patterns{}`가 통째로 비어 있음 | **BE 추가 필요** | 🔴 | P5.4 차단(P5.2 비차단) |
| C | `pressure.arenaPressure`가 누적 카운터 → 배지 영구 ON + `degraded` 무한 발송 | **BE 결함 / FE 회피** | 🔴 | 비차단(우회 가능) |
| D | `stats.minMs`·`sumMs` 미노출 → 평균 불가, 다초 p95가 BE와 미세 상이 | **BE 추가 검토** | 🟡 | 비차단 |
| E | `histOverflow`가 `hist[14]`의 사본 | 설계 정정 | 🟡 | 비차단(함정) |
| F | `control.resume` 없음 / 401 본문이 `ApiResult` 아님 / `dictDelta.services`·`instances` 설계 예시 누락 / `node.nodeId`가 UUID | 설계 정정 | 🟡 | 비차단(함정) |
| G | 계약 표본 JSON 픽스처 0건 | **BE 추가 필요** | 🔴 | QA 게이트 |
| H | 사용자당 연결 4개 상한 | 결정·구조 | 🟡 | 설계 준수로 해결 |
| I | 수신 거절 사유는 이 SSE에 없음(수집기 EP 소관) | 결정 필요 | 🟡 | 비차단 |
| J | 사이드바 메뉴가 8→9개가 된다 | 결정 필요 | 🟡 | 비차단 |

### A. 🔴🔴 `live`가 통째로 비어 있다 — **BE 추가 필요 (P5.3 차단급)**

`snapshot.begin.live`와 `spans.live` 모두 **`Map.of()` 하드코딩**이다.
- `LiveSpanSnapshot.java:95` — `"live", Map.of()`
- `LiveSpanFrames.java:107` — `"live", Map.of()`

설계 §3.2·UX §1.2가 요구하는 필드 중 **코드에 존재하는 것이 하나도 없다**(`cpuPct`·`heapPct`·`threads`·`active`·`observedInstances`·`expectedInstances` 전역 grep 결과 0건, `RuntimeSlotMap.SLOT_THREADS` 상수만 무관하게 존재).

없는 것 전부:

| 필요 필드 | UX가 쓰는 곳 | 상태 |
|---|---|---|
| `live[svc].active.value` | §1.1 "동시 요청(합산)" 타일의 큰 숫자 | **없음** |
| `live[svc].active.observedInstances` / `expectedInstances` / `expectedIsEstimate` | §1.2 "m/n 인스턴스" 배지, 툴팁 "(추정)" | **없음** |
| `live[svc].active.asOf` | §1.1 "관측 21초 전" | **없음** |
| `live[svc].active.instances[]` (`{id, value, asOf}`) | §1.2 툴팁 "어느 인스턴스가 stale인지", "⚠ j 인스턴스 관측 없음" | **없음** |
| `live[svc].cpuPct.{avg,max,observedInstances,asOf}` | §1.2 서비스 타일 "CPU 41%(max 63)" | **없음** |
| `live[svc].heapPct` (null 가능) | §1.2 "측정 불가" 문구 | **없음** |
| `live[svc].threads` | §1.2 서비스 타일 | **없음** |

**영향**: UX §1(요청 관제) 와이어프레임의 **4번째 게이지 타일 전체**와 **서비스 타일의 CPU/heap/threads 줄**이 만들 수 없다. TPS·p95·오류율 게이지 3개와 이퀄라이저·타일의 `stats` 부분은 **지금 그대로 만들 수 있다.**

**권고(결정 필요)**: ① BE에 `live` 채우기를 선행 요구 / ② P5.3 1차는 `stats` 기반 3게이지 + 이퀄라이저 + 타일(처리량·p95·오류율·스파크)만 만들고 "동시 요청"·CPU 타일은 **다음 단계로 명시적 연기**. UX §1은 "완료 관제와 동시 요청 수를 시각적으로 분리한다"고 이미 두 리듬을 분리해 뒀으므로 ②가 구조적으로 안전하다.

### B. 🔴 `patterns`도 통째로 비어 있다 — **BE 추가 필요 (P5.4 범위, 1차 비차단)**

- `LiveSpanFrames.java:107` — `"patterns", Map.of()`
- `snapshot.begin`에는 `patterns` 키 자체가 **없다**(설계도 begin에는 요구하지 않음 — 일치).
- `LiveSpanRing.Bucket`에 `patterns` 필드(`List<Object>`)가 **존재하지만 `LiveSpanStreamCodec.bucket()`이 직렬화하지 않는다**(자리만 잡아 둔 상태).

설계 §3.2가 규정한 `{kind, since, until, n, confidence, valueMs, targetRouteId, targetInstanceId, rSquared, errorShare, trafficShare}` 중 **어떤 필드도 실제로 오지 않는다.**

**영향**: UX §2.7 패턴 오버레이·관측 특징 칩을 만들 수 없다. 설계상 **P5.4 범위**이므로 P5.2 1차 착수에는 비차단이나, **타입은 지금 확정해 두고 화면은 빈 배열 분기로 열어 두는 것**을 권고한다.

### C. 🔴 `pressure.arenaPressure`가 누적 카운터다 — **BE 확인 필요 / FE 회피 필요**

`LiveSpanRing.Counters.arenaPressure`는 `AtomicLong`이고 압박이 일어날 때마다 `incrementAndGet()`만 한다(`LiveSpanRing:275, 288`). 리셋 지점이 **없다**. `LiveSpanStreamService.tick():239`가 `ring.counters().arenaPressure.get()`(누적 총합)을 그대로 `pressure.arenaPressure`에 싣는다.

두 가지 문제가 같이 나온다:
1. **FE**: UX §2.3의 "`pressure.arenaPressure > 0` → 배지 '서버 보관 축소 중'"을 그대로 구현하면 **서버 기동 후 압박이 한 번이라도 있었으면 배지가 영구히 켜진다.**
2. **BE**: `tick():273`이 `if (tick.pressure() > 0) sendControl(c, degraded{arena_pressure})`이므로 **첫 압박 이후 모든 연결에 매초 `control{degraded}`가 무한 발송된다.** 이 이벤트는 연결 큐 바이트를 계속 소모한다.

**권고**: BE가 "현 tick의 압박 증분"(직전 tick 대비 delta) 또는 "최근 N초 내 압박 여부"를 보내도록 정정. 그전까지 FE는 **`arenaPressure`를 배지 조건으로 쓰지 말고** `control{degraded, reason:"arena_pressure"}` 수신 시 **일정 시간(예: 10초) 동안만** 배지를 켜는 방식으로 우회한다.

### D. 🟡 `stats.minMs`·`sumMs` 미노출 — **BE 추가 검토 / 화면 영향 있음**

`LiveSpanRing.Stats`(`LiveSpanRing.java:40~42`)는 `minMs`·`sumMs`를 가지고 있으나 `LiveSpanStreamCodec.stats():73~77`이 내보내지 않는다.

| 영향 | 내용 |
|---|---|
| **평균 지연 불가** | `sumMs`가 없어 `avg = sum/count`를 만들 수 없다. UX가 평균을 요구하지는 않으므로(p50/p95만) **현재는 비차단**이나, "평균 응답시간" 요구가 오면 BE 변경이 필요하다. |
| **다초 p95 산식이 BE와 미세하게 다르다** | UX §1.2는 "여러 버킷의 `hist[15]` 합 → p95"를 요구한다. BE의 버킷 p95는 `HistogramRebucketer.percentile(BOUNDS, counts, .95, minMs, maxMs)`로 **실측 min/max로 보정**한다. FE는 `minMs`가 없어 `observedMin`을 0으로 둘 수밖에 없다. 보간 결과가 `[lo, hi]` 밖으로 나갈 때만 차이가 생기므로 **오차는 유계**지만, "게이지의 p95"와 "버킷 툴팁의 `p95Ms`"가 다르게 보일 수 있다. |

**권고**: `stats()`에 `minMs`(+ 가능하면 `sumMs`) 추가 요청. 버킷당 8~16B 증가라 예산 영향 미미. **착수 전 결정 필요** — 안 넣으면 FE 문서에 "게이지 p95는 근사, 버킷 p95와 소수점이 다를 수 있음"을 명시해야 한다.

### E. 🟡 `histOverflow`가 `hist[14]`의 사본이다 — **설계 정정 필요 (FE 함정)**

`LiveSpanStats.copy():37~45`가 `new Stats(..., h, h[14], late)`로 **같은 값을 두 번** 싣는다. `hist` 합계에 `histOverflow`를 더하면 **10초 초과 요청을 두 번 센다.** FE는 `histOverflow`를 **표시용 보조 정보로만** 쓴다.

### F. 🟡 설계 문서와 코드가 다른 항목 (전부 **코드가 정본**)

| 항목 | 설계 | 코드 | 판정 |
|---|---|---|---|
| `control` 타입 | §2.5 표에 `resume` 포함 | `resume`을 **보내지 않는다** | 🔴 **설계 오기.** `paused` 해제는 새 `snapshot.begin`으로 안다 |
| 401 본문 | §2.5 "실제 401 + `ApiResult` 본문" | `{"code":401,"errorCode":"INVALID_TOKEN"}` (`status`·`message` 없음) | 🟡 설계 정정 필요. FE는 `ApiResult` 파서를 태우지 말 것 |
| `dictDelta` 필드 | §3.2 예시에 `{from,to,routes}`만 | `{from,to,services,routes,instances}` | 🟡 설계 예시 축약. **코드가 정본** — FE가 `services`를 안 읽으면 신규 서비스를 영영 못 본다 |
| `node.nodeId` | §3.2 예시 `"be-1"` | `streamEpoch`와 같은 UUID | 🟡 화면에 "노드 이름"으로 쓰지 말 것 |
| `LiveSpanRejection` 개수 | §3.3 "10종" | enum 상수 **11개**(`instanceBudget` 미사용 잔존) | 🟡 설계가 이미 "미사용으로 유지"라고 적어 둠 — 일치 |
| `LiveIngestCounters.Reason` 개수 | §3.3 "14종" | enum 상수 **16개**(`rateLimited`·`rateLimitMapFull` 추가) | 🟡 **설계 정정 필요** |

### G. 🔴 계약 표본 JSON이 존재하지 않는다 — **BE 추가 필요 / QA 게이트**

설계 §3.2가 "P5.1 계약 표본 JSON에서 고정"이라고 두 번 적었으나, `moveseye-be-spring/src/test` 아래에 **live/spans 관련 JSON 픽스처가 한 건도 없다**(`find` 결과 0건). 테스트는 전부 자바 단언이다.

**영향**: FE가 타입을 맞출 대조본이 없다 → 메모리 `fe-contract-fixture-gate`("tsc가 강제한다는 주장이 허위였음")의 재발 위험. `npm run typecheck:contract` 게이트에 물릴 픽스처가 없다.

**권고**: BE에 각 이벤트 1건씩(`snapshot.begin`/`dict chunk`/`buckets chunk`/`end`/`spans`/`heartbeat`/`control` 5종) **실제 직렬화 결과를 덤프한 골든 JSON**을 요청하고, FE `src/types/__fixtures__/apmLiveSpans/*.json`에 복사해 타입 대조 테스트를 건다.

### H. 🟡 결정 필요 — 사용자당 연결 4개 상한

`LiveStreamLimits.perUser = 4`. 실시간 관제 탭 2개(`active`·`xview`)를 **한 페이지가 하나의 EventSource로 공유**하지 않으면 탭 전환마다 연결이 늘 수 있고, wall 모드 모니터 + 개발자 탭이 겹치면 쉽게 4를 넘겨 `reject 429`가 난다.
→ **UX §0 결정("SSE 연결은 페이지 컴포넌트가 소유, `tab` 변경은 연결을 건드리지 않는다")을 반드시 지킬 것.** 훅은 `useApmLiveSpans` 하나가 페이지 레벨에서 소유하고 두 탭이 컨텍스트로 소비한다.

### I. 🟡 결정 필요 — 수신 거절 사유를 이 화면에 보여 줄 것인가

§5.4대로 거절 카운터는 SSE에 없고 `GET /apm/collectors/{id}/live`에만 있다. UX §1·§2에는 이 수치를 쓰는 부품이 없다(수집기 탭 소관). **실시간 관제 화면은 거절 사유를 표시하지 않는 것**이 현 설계와 일치하며, 필요하면 "수집기 탭 열기" 링크로 보낸다.

### J. 🟡 결정 필요 — APM 사이드바가 8 → 9개가 된다

UX §0은 "현 APM 메뉴 ✅ 7개 → 추가하면 8개"라고 적었으나 **실사 결과 현재 8개**다(`slo` 누락 계수 — `SideNav.tsx:331~409`). 추가하면 **9개**가 되어 APM 한 메뉴 아래 자식이 9개로 가장 길어진다.
**권고**: 개수 자체는 착수 차단이 아니므로 예정대로 추가하되, **UX 정본 §0의 "7개 → 8개" 문장을 "8개 → 9개"로 정정**하고 사용자에게 개수를 알린 뒤 진행한다.

---

## 7. 라우트 · 사이드바 등록

### 7.1 라우트 규약과의 적합성 — ✅ 맞는다

UX §0이 제안한 `/application-monitoring/realtime?tab=active|xview`는 기존 규약과 **정확히 일치**한다.

| 규약 | 현행 | 신규 메뉴 적합성 |
|---|---|---|
| 모든 APM 화면은 `/application-monitoring` 아래 | `ROOTS_APPLICATION_MONITORING = "/application-monitoring"` (`constants/routes.ts:8`) | ✅ `/application-monitoring/realtime` |
| 🔴 **자식 라우트는 절대경로이되 반드시 부모 경로로 시작해야 한다** — 밖이면 React Router가 트리를 거부해 **앱 전체가 안 뜬다** (`routes/routes.tsx:630~631` 주석, 메모리) | 자식 19개 전부 `path: PATH_APPLICATION_MONITORING.xxx` 절대경로 | ✅ `path(ROOTS_APPLICATION_MONITORING, "/realtime")`로 만들면 자동 충족 |
| 이중 게이트 | `PageWrapper permissionKey={DmovePermissionsKey.APPLICATION_MONITORING}` + `FeatureGate feature="APM"` | ✅ 그대로 |
| 🔴 `adminOnly`류와 `permissionKey` 병용 금지(`PageWrapper` OR 판정이 권한 게이트를 무력화, `routes.tsx:623~631`) | — | ✅ `permissionKey`만 쓴다 |
| 페이지 리마운트 key | **`location.pathname`** (`App.tsx:235~240`) — `location.key`가 아니다 | ✅ **같은 경로 안의 `?tab=` 변경은 리마운트하지 않는다** → 탭 전환이 SSE 연결을 끊지 않는다(UX §0 요구와 일치) |
| 탭·상태는 URL query | 기존 APM 화면 관례 | ✅ `tab`·`svc`·`env`·`win`·`at`·`sel`·`pt`·`route`·`inst`·`mode` |

🔴 **`?tab=`이 리마운트를 유발하지 않는다는 점이 이 설계의 전제다.** 반대였다면 탭을 옮길 때마다 EventSource가 새로 열려 사용자당 연결 4개 상한(§6-H)에 곧바로 닿았을 것이다. `App.tsx:240`을 건드리는 변경이 있으면 이 화면이 먼저 깨진다.

### 7.2 건드려야 하는 파일 (전부 바꿔야 "메뉴가 있다")

| # | 파일 | 할 일 |
|---|---|---|
| 1 | `src/constants/routes.ts` (L114~142 `PATH_APPLICATION_MONITORING`) | `realtime: path(ROOTS_APPLICATION_MONITORING, "/realtime"),` 추가 |
| 2 | `src/routes/routes.tsx` | ① 페이지 import(L116~133 부근) ② `PATH_APPLICATION_MONITORING.root` 블록의 `children` 배열(L638~866)에 라우트 객체 추가 — `PageWrapper permissionKey={DmovePermissionsKey.APPLICATION_MONITORING}` + `FeatureGate feature="APM"` 래핑. 🔴 배치는 **`overview` 다음(2번째)** |
| 3 | `src/layouts/app/SideNav.tsx` | APM `children` 배열(L335~410)에 `getItem` 항목 추가. `show: canViewApm`(L119~122). 🔴 `key`는 **URL 마지막 세그먼트와 같아야 한다**(L318~320 주석) → `key: "realtime"`. 배치는 `overview`(L336~344) 바로 뒤 |
| 4 | `src/layouts/app/MobileSideNav.tsx` | 동일 항목을 대칭 추가(L190~261). 🔴 **두 파일이 구조 중복이라 한쪽만 고치면 모바일에서 메뉴가 사라진다** |
| 5 | `src/locales/kr.json` · `en.json` | `apm.menu.realtime` + 화면 문구(UX §4.6 i18n 초안) |
| 6 | `src/constants/breadcrumbSegments.ts` | `realtime` 세그먼트 라벨 |
| 7 | `src/constants/navSearchEntries.ts` | 내비 검색 항목 |
| 8 | `src/constants/page-guide.ts` | `{ path: PATH_APPLICATION_MONITORING.realtime, key: "apm_realtime" }` |
| 9 | `src/pages/application-monitoring/realtime/` | 신설 폴더(설계 §4.0) — `ApmRealtimePage.tsx`(SSE 소유) + `ApmActiveTab.tsx` + `ApmXViewTab.tsx` |

### 7.3 사이드바 메뉴 항목 구조 (`SideNav.tsx` `getItem`)

```tsx
getItem({
  label: <Link to={PATH_APPLICATION_MONITORING.realtime}>{t("apm.menu.realtime")}</Link>,
  key: "realtime",          // 🔴 URL 마지막 세그먼트와 일치해야 선택 표시가 동작한다
  feature: "APM",           // 미보유 고객에게 잠금 라벨
  show: canViewApm,         // canViewFeature(permissions, DmovePermissionsKey.APPLICATION_MONITORING)
  icon: <ThunderboltOutlined />,   // 아이콘은 @ant-design/icons에서 선택
})
```
- 🟡 **현 APM 사이드바 자식은 8개**다 — `overview` · `services` · `service-map` · `traces` · `synthetics` · `slo` · `collectors` · `rum` (`SideNav.tsx:331~409` 실사). UX §0은 "✅ 7개"라고 적었으나 `slo`가 빠진 계수다(**UX 문서 정정 필요**). 추가하면 **9개**가 된다 — "메뉴가 너무 많다"는 판단이 나올 수 있으므로 착수 전 확인(§6-J).
- 배치는 **개요 다음 2번째**(UX §0 결정).
- `collectors`만 `show: canEditApm`(L392~403)이고 나머지는 `canViewApm`이다. 실시간 관제는 **조회 EP(`requireRead`)이므로 `canViewApm`**이 맞다.
- 게이팅 훅은 페이지 컴포넌트에서 `useApmPermissions()`(`canView`/`canEdit`)를 쓰고, 사이드바·라우트는 이미 `canViewFeature`/`canEditFeature` 유틸을 직접 쓰는 관례다 — **둘을 섞지 말고 현행 관례를 따른다.**
- UX §0 추가 요구: 개요의 Live 패널(`ApmLivePanel.tsx`)에 **"실시간 관제 열기 →" 링크 한 줄**만 추가(패널 구조 불변).

### 7.4 🔴 권한 403이 화면에 닿지 않는 경우

모듈 권한(`applicationMonitoring`)이 아예 없는 사용자는 `PageWrapper`가 **`/errors/404`로 먼저 보낸다**(UX §0, R-P5.6 §7-1 실측). 따라서 페이지 안의 `control{reject,403}` 배너 분기는 **"모듈 권한은 있으나 `apm.view`가 없는 조합"에서만** 도달한다. 죽은 분기는 아니지만 "403은 항상 화면이 배너로 받는다"고 가정하면 안 된다.

---

## 부록: 파일 색인 (BE)

| 역할 | 경로 |
|---|---|
| SSE 컨트롤러 | `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/ApmLiveSpansStreamController.java` |
| 거절 변환 | 〃 `LiveStreamRejectionAdvice.java` |
| 발행·admission·control | 〃 `LiveSpanStreamService.java` |
| snapshot 생성 | 〃 `LiveSpanSnapshot.java` |
| spans frame 인코딩 | 〃 `LiveSpanFrames.java` |
| **JSON 필드명 정본** | 〃 `LiveSpanStreamCodec.java` (`stats()`·`bucket()`·`revision()`·`layer()`·`dictionary()`) |
| 점 튜플 | 〃 `LiveSpanPoint.java` |
| 집계·히스토그램 | 〃 `LiveSpanStats.java` |
| 사전·instanceKey | 〃 `LiveSpanDictionary.java` |
| 자료구조 레코드 | 〃 `LiveSpanRing.java` (37~52행) |
| 상한 | 〃 `LiveStreamLimits.java` · `LiveSpanStorageProperties.java` |
| viewKey | 〃 `LiveSpanStreamView.java` |
| 비동기 송신 | 〃 `LiveServletWriter.java` |
| 거절 사유 enum | `…/premium/apm/collector/ingest/live/LiveSpanRejection.java` · `LiveIngestCounters.java` · `LiveSlimReason.java` |
| 수집기 관측 DTO | `…/premium/apm/collector/state/ApmCollectorLiveDto.java` |

---

## P5.3b `live[svc].activeAge` — 자바 확장의 진행 중 요청 분포 (2026-09-22)

**출처**: 고객 앱에 붙인 `moveseye-otel-extension`(OTel Java agent 2.31.1 확장)이 에이전트의 metric export 주기마다
게이지로 보낸다 → 수집기(기존 `filter/metrics`의 `http\.server\..*`가 **부분 일치**로 통과) → BE `MetricIngestor`가
허용목록·1분 저장을 **거치지 않고** 링의 최신값 캐시(`LiveRuntimeMetrics`)에만 둔다(설계 §5 "저장하지 않는다").

| metric | 종류 | 속성 | 뜻 |
|---|---|---|---|
| `moveseye.http.server.active_requests` | gauge | `moveseye.age_bucket` ∈ `lt_100ms`·`lt_500ms`·`lt_1s`·`lt_5s`·`ge_5s` | export 시점 경과 구간별 진행 중 요청 수 |
| `…active_requests.oldest_age` | gauge(ms) | — | 가장 오래 떠 있는 요청의 경과 |
| `…active_requests.limit` | gauge | — | 추적 상한(칸 수) |
| `…active_requests.dropped_recent` | gauge | — | 직전 export 이후 상한에 걸려 못 센 시작 수 |
| `…active_requests.expired_recent` | gauge | — | 직전 export 이후 TTL로 추적을 포기한 수(완료 아님) |

🔴 이름·구간 값은 확장 `ActiveRequestMetricsAgentListener`와 BE `MetricIngestor.collectActiveAge`·`LiveRuntimeMetrics.ACTIVE_AGE_BUCKETS`가
**문자 그대로** 같아야 한다. 구간 경계는 완료 요청 지연 구간 차트와 같다(100ms·500ms·1s·5s).

```ts
live[svc].activeAge?: {           // 🔴 확장이 보낸 인스턴스가 하나도 없으면 키 자체가 없다 → 화면은 "확장 없음"(0건 아님)
  buckets: [n, n, n, n, n];        // 위 5구간 순서, 관측 인스턴스 합
  oldestMs: number | null;         // 인스턴스 중 최대
  observedInstances: number;       // 확장 값이 신선한 인스턴스 수 — active.observedInstances보다 작으면 일부에만 확장이 있다
  asOf: number;                    // epoch ms, 인스턴스 중 가장 오래된 관측
  incomplete: boolean;             // 어느 인스턴스든 dropped_recent>0 또는 expired_recent>0
  instances: { id: number; buckets: number[]; oldestMs: number | null; asOf: number; incomplete: boolean }[];
}
```

- 인스턴스 값은 **다섯 칸이 같은 export 시각**이고 90초(`STALE_MS`) 이내일 때만 낸다. 칸이 빠지면 0으로 채우지 않고 그 인스턴스를 뺀다.
- 🔴 이것은 **export 시점의 분포**이지 1초 흐름이 아니다(설치 가이드 기본 export 15초). 화면은 "N초 전 기준"을 적는다.
- ⚠️ 에이전트에 metric reader가 둘 이상이면 `*_recent` 차분이 reader끼리 나뉜다(현재 설치 가이드는 OTLP 하나).

### P5.3b 추가 — `live[svc].activeAgeSeries` 1초 시계열 (2026-09-22 오후)

```ts
live[svc].activeAgeSeries?: {      // 확장 값이 없으면 키가 없다
  endSecond: number;               // 마지막 칸의 epoch 초
  perSecond: (number[5] | null)[]; // 120칸, 오래된 → 최신. null = 그 초에 관측 없음(0 아님)
}
```
- 확장이 **전용 1초 MeterProvider**로 이 게이지들만 따로 보낸다(에이전트의 다른 metric 주기는 그대로). 설정 `moveseye.active-requests.export-interval-millis`(기본 1000, 0이면 에이전트 주기).
- 🔴 수집기 `batch`가 metric을 최대 5초 묶어 보낸다 → BE는 **관측 시각 기준 1초 칸**에 쌓고(인스턴스당 120칸 원형 버퍼) 서비스 합을 통째로 싣는다. 최신값만 보내면 화면이 5초에 네 칸씩 건너뛴다.
- 인스턴스가 한 초를 건너뛰면(export 지터) 직전 1초 값을 이어 쓴다(`CARRY_SECONDS=1`). 그 이상 비면 그 인스턴스는 그 초에서 빠진다.
- 🔴 **저장 여부와 무관하게 링에 넣는다** — 확장 전용 배치는 저장할 행이 없어 `stored=0`인데, 기존 "저장 성공 배치만 링에" 규칙대로면 전부 버려진다. 시각별 값이라 재전송돼도 두 배가 되지 않는다(`MetricIngestor.isActiveAgeKind`).
- 비용(실측, 시험 앱 1대): export 1회 ≈ 2.8KB → 인스턴스당 초당 2.8KB. gzip(`otel.exporter.otlp.compression`)으로 줄일 수 있다.

### P5.3b 추가 — 요청 흐름(들어오는 공·나가는 공) (2026-09-22 저녁)

확장이 매 export(1초)마다 **직전 export 이후** 시작·종료 수를 게이지로 보낸다.

| metric | 속성 | 뜻 |
|---|---|---|
| `moveseye.http.server.requests.started_recent` | — | 시작된 요청 수(상한에 걸려 추적 못 한 것도 센다) |
| `moveseye.http.server.requests.ended_recent` | `moveseye.outcome` ∈ `ok`·`slow`·`error` | 끝난 요청 수. error = 5xx 또는 상태 코드 없음(예외), slow = 경과 ≥ `moveseye.active-requests.slow-threshold-millis`(기본 2000 — BE slowMs와 같게), 오류가 느림보다 우선 |

BE는 `live[svc].activeAgeSeries.flow: (number[4] | null)[]` = `[시작, 정상, 느림, 오류]`로 싣는다(`perSecond`와 같은 칸 배열). 🔴 흐름은
분포와 달리 **이어 쓰지 않는다**(같은 요청이 두 번 들어온다). 결과 3종 중 하나라도 안 온 초는 null.
화면(`ApmLiveFlowStage`)은 서비스 막대(분포)에 그 서비스의 흐름을 공으로 붙인다 — 한 초에 서비스당 공 8개 상한, 넘으면 초당 건수 글자.
화면은 **가로** 무대(서비스마다 한 줄)다. 막대 색은 경과 **3단계**(1초 미만 = 구간 0~2 합 · 1~5초 = 구간 3 · 5초 이상 = 구간 4)로 접는다 — 처리 중 요청은
끝나기 전엔 오류를 알 수 없으므로 오류는 나가는 공(빨강)으로만 보인다(사용자 결정 2026-09-22). 막대 길이는 절대 척도(최소 10건 기준).

### P5.3b 2단계 — `live[svc].activeList` 처리 중 요청 목록 (2026-09-22 저녁)

확장이 metric export와 같은 박자(1초)로 OTLP **로그 레코드 한 줄**을 보낸다(새 프로토콜 없음, 수집기 logs 파이프라인 그대로 통과).

| 위치 | 값 |
|---|---|
| 로그 속성 `moveseye.kind` | `active_requests` (BE `ActiveRequestListIngestor`가 이 값으로만 가로챈다) |
| `moveseye.total` / `moveseye.list_limit` | 전체 처리 중 수 / 보낸 상한(기본 30, 최대 200 — `moveseye.active-requests.list.size`) |
| 본문(stringValue) | JSON `[{"t":traceId,"s":spanId,"m":method,"p":가려진 경로,"e":경과 ms,"a":시작 epoch ms}]` 가장 오래된 순 |

🔴 경로는 확장 `PathMasker`가 가린 값이다 — 숫자만인 구간·16자 이상 hex·UUID 구간은 `{id}`, 쿼리스트링 제거, 120자 상한. 원문은 어디에도 없다.
🔴 저장하지 않는다. 인스턴스별 마지막 한 장만 메모리(90초 뒤 폐기). 수집기 batch로 한 배치에 여러 장이 오면 가장 늦은 것만 남긴다.

```ts
live[svc].activeList?: {          // 확장이 보낸 인스턴스가 없으면 키 없음
  asOf: number;                    // 가장 오래된 인스턴스 목록 시각(epoch ms) — 화면 경과 = e + (now − asOf)
  total: number; limit: number; truncated: boolean;   // 인스턴스 합
  items: { t: string; s: string; m: string; p: string; e: number; a: number; i: number | null;
           o: string; d: number }[];   // 시작 시각 순, 상한 100. i = 인스턴스 사전 ID. o = 지금 하는 일("DB postgresql select … ?" / "HTTP GET host/path" / "RPC …", 없으면 ""), d = 그 작업 경과 ms
}
```
화면: "진행 중 요청" 카드의 숫자 또는 무대의 서비스 줄 클릭 → 목록 드로어(`ApmLiveInFlightList`). 행의 trace 클릭 → 기존 "저장된 트레이스 찾기"
드로어(`ApmLivePointDrawer`, pointKey = `traceId:spanId`). 🔴 아직 끝나지 않은 요청이라 트레이스는 저장 전 — 드로어가 "저장 판정 중" 상태를 그대로 보여 준다.

- **지금 하는 일(`o`/`d`, 2026-09-23)**: 확장이 DB_CLIENT·HTTP_CLIENT·RPC_CLIENT 계측의 시작·끝에서 요청 토큰에 적는다(`ActiveRequestChildOperationMetrics`).
  SQL은 에이전트 sanitizer가 리터럴을 `?`로 바꾼 값을 160자로 자른 것, URL은 호스트 + 가려진 경로. 앱 코드 안(계측 밖)에서 도는 중이면 `""`.

### 대용량 방어 (2026-09-23)
- 🔴 스트림 `live[svc].activeList.items`는 **서비스당 20건**(`wireLimit`)까지만. 잘리면 `truncated=true`. 전체(상한 100)는
  **`GET /apm/live/active-requests?serviceId=`**(읽기 권한, `ApmLiveActiveRequestsDto {serviceId, asOf, total, limit, truncated, items[{traceId,spanId,method,path,elapsedMs,startedAtMs,instance,currentOp,currentOpElapsedMs}]}`).
  FE는 드로어에서 서비스 하나를 열었을 때만 2초마다 읽는다. 전체 보기·탭 하단 표는 스트림 데이터.
- BE 메모리: 인스턴스당 40건(`ACTIVE_LIST_PER_INSTANCE_MAX`), 서비스 합 100건, 로그 본문 256KB 초과는 버린다. 최악 64대 × 40건 ≈ 1.2MB/서비스.
- 확장: 요청 경로에서 문자열을 만들지 않는다 — 경로·하위 작업 속성은 **참조만** 잡고, 1초 스냅샷이 상위 N건(기본 30, 최대 100)에만 가리기·설명을 만든다.

### P5.3b 3단계 — 요청 걸림(STUCK_REQUEST) 장애 로그 (2026-09-23)

사용자 결정: 임계는 설정 가능(기본 **60초** — 앞단 프록시가 끊는 시간), 장부는 **기존 알람 이력·Zabbix**와 **APM 전용 장부** 둘 다.

- **규칙 kind `STUCK_REQUEST`**(단위 `ms`, priority 4, Zabbix 키 `apm.stuck_request[<svc_uid>]`, 트리거 `>0`). V67이 전역 기본 규칙 1건(60000ms, `00000000-0000-4000-8000-0000000000a3`)을 시드. `windowMin`은 쓰지 않는다(FE 폼은 입력을 감추고 1을 보낸다). 미리보기 없음(`emptySeries`).
- **판정은 1초 감시기** `alert.evaluate.ApmStuckRequestMonitor`(`@Scheduled 1s`): `LiveBuffer.runtimeSnapshot`의 `activeList` 항목 중 `elapsedMs ≥ threshold`를 요청 단위로 장부(`apm_stuck_request`, V67)에 열고, 목록에서 사라지면 `ENDED`, 15초 못 보면 `LOST`, 규칙이 꺼지면 `RULE_OFF`로 닫는다. 서비스에 걸린 요청이 0→N이면 `apm_alert_event`를 열고 Zabbix에 최대 경과 ms를 push, N→0이면 닫고 0을 push(`ApmStuckRequestLedger`). 5분 배치는 `monitor.currentValue`(empty=관측 없음·0=정상·양수=최대 경과)로 같은 규칙을 맞춘다.
- **EP** `GET /apm/stuck-requests?serviceUid&from&to(감지 시각 ms)&open&limit(≤500)&offset` → `PagedListDto<ApmStuckRequestDto>`(읽기 권한). 필드: `id, serviceUid, serviceName, instance, traceId, spanId, method, path(가려짐), currentOp, currentOpElapsedMs, startedAt, detectedAt, thresholdMs, elapsedMsAtDetect, maxElapsedMs, lastSeenAt, resolvedAt(null=걸려 있음), endReason(ENDED|LOST|RULE_OFF|null), open`.
- **보존**: `apm_retention` options `stuckRequestDays`(기본 90) — 닫힌 행만 삭제.
- **FE**: 알람 규칙 화면 4번째 탭 `?tab=stuck`(`ApmAlertStuckTab`, 서비스·열린 것만 필터, trace 클릭 → 저장된 트레이스 드로어), 규칙 폼에 `STUCK_REQUEST` 추가(창 입력 없음), 로케일 `apm.alerts.stuck.*`·`apm.alert_kind.stuck_request`·도움말 `alert_stuck_table`.

### 런타임 실측 (2026-09-23 오후, BE 재시작 뒤)

- ✅ 전 구간: 확장(list 4건) → 수집기 → BE `activeList` → 1초 감시기 → `apm_stuck_request` 14행(전부 `ENDED`, "그때 하던 일"에 `HTTP POST dmove.co.kr/zabbix/api_jsonrpc.php`) → `apm_alert_event` STUCK_REQUEST 발화·해소 → Zabbix `history.push` 2회. 화면(장부 탭·실시간 탭) 헤드리스 캡처 정상.
- 🔴 **발견 1 — 수집기 `redaction/pii`가 목록 로그 본문을 가린다.** `blocked_values`의 카드번호 패턴 `\b(?:\d[ -]*?){13,16}\b`이 본문의 시작 시각 epoch ms(13자리, `"a":1790137249185`)에 걸려 JSON이 깨지고, BE는 파싱 실패를 조용히 버렸다 — 항목이 있는 목록만 통째로 사라지고 빈 목록은 통과해 "부하 중에만 목록이 안 온다"로 보였다. **계약 변경**: 확장은 `a`를 보내지 않는다(본문 `[{t,s,m,p,e,o,d}]`), BE가 `startedAtMs = asOf − e`로 만든다(있으면 그대로 씀). 본문에 13자리 이상 숫자 연속을 두지 않는 것이 규칙(확장 테스트가 고정). BE는 파싱 실패를 DEBUG로 남긴다.
- 🔴 **발견 2 — 이벤트 SSE 실제 경로는 `/event/stream`**(확장 기본 제외는 `/events/stream`이었다). 그대로면 이벤트 화면을 연 사용자마다 60초 뒤 "요청 걸림"으로 잡힌다 → 확장 기본 제외에 `/event/stream` 추가(jar 재배치). 고객 앱은 자기 SSE 경로를 `exclude-paths`에 넣어야 한다.
- ⚠️ 실측 절차 함정: curl 부하 루프에 `-c`(쿠키 저장)를 켜면 응답 쿠키가 세션 쿠키를 덮어 401이 난다 — 로그인만 `-c`, 나머지는 `-b`. 계정당 세션 1개라 실측은 임시 계정으로(사용 뒤 삭제).

### 코덱스 검수 반영 (2026-09-23)

`_workspace/reviews/review_apm-p53b-inflight-stage-list.md` 참조. 계약에 닿는 변경:
- 스트림·REST `activeList` 항목 문자열 상한: traceId/spanId 32·method 16·path 512·op 200자, 목록당 64K자. 목록을 든 인스턴스는 서비스당 **16개**까지(넘치면 `truncated=true`).
- `activeList.asOf`는 **가장 새 인스턴스 목록의 시각**이고 옛 목록의 항목 경과에는 차이가 더해져 있다(전에는 가장 옛 시각).
- `app.apm.live.max-heap-mb` 기본 192→**384**(이력·목록이 예산식에 들어옴). 컨테이너 `-Xmx` 768MiB 미만이면 함께 줄일 것.
- 확장 0.2.0 재빌드: 목록 로그 본문 64K자 상한, `list.size` 최대 100(잘못된 값은 30), `max-active` 상한 20만. 본문 키는 `{t,s,m,p,e,o,d}`(`a` 제거 — 위 런타임 실측 발견 1).
- FE: 원판·합계는 "지금 + 최근 1.5초 안에 들어왔거나 끝난 요청"(합성 동전은 옅은 점선). "서비스별 지금 처리 중" 이퀄라이저 차트는 제거.

### 후속 구현 — 동시 시청 가시성·대기 UX·효율 (2026-09-23 밤, 백로그 B6/B7)

- BE `GET /apm/live/spans/stats`(§5.2a) + 기동 INFO 로그(유효 상한 한 줄).
- BE `spans` 이벤트의 `live`는 **첫 part에만**(§2.5) — 서비스 60개 × 목록 20건이 part 수만큼 곱해져 나가던 것 제거.
- BE `LiveRuntimeMetrics.ageSeries` 메모(같은 초·같은 이력이면 재합산 없음 — tick·감시기·REST 세 호출자가 한 번만 계산) + 칸 배열 복사 제거.
- FE 대기(`paused`)·429는 작은 태그 대신 **배너**(이유·"내 연결 n/4"·"탭 m개면 안 쓰는 탭 닫기"·대기 배너엔 "연결 끊기"). 429는 일반 오류 배너를 겹쳐 띄우지 않는다(`isLiveTooManyConnections`).
- FE 훅 `disconnect()`: 사람이 슬롯을 즉시 반납(`stopped` → "다시 연결"만). 요청 관제 탭 헤더의 "연결 끊기" 버튼.
- FE 처리 중 목록 `asOf` 0(미상)은 "N초 전"을 지어내지 않는다(`summary_no_age`).
- 코덱스 검수(sol/high, 2026-09-28) 반영: 🔴 빈 환경변수(`APM_LIVE_STREAM_MAX_ACTIVE=`)가 조용히 기본값으로 접히던 것 → `ApmLiveStreamProperties.requireNonBlank`(Environment 원문 검사)로 **기동 실패** · 🟡 `queue-mib ≥ frame×parts` 교차 검증을 `LiveStreamLimits.from`에 · 🟡 `connections.waiting` → `queued`/`pending` 분리 · 🟡 stats는 tick 잠금 없이 스냅샷 읽기 · 🟡 multipart 뒤 part의 여백을 `live` 없는 크기로 계산 · FE 🔴 `asOf` 0 행 정렬(뒤로)·경과(보정 없음) · 🔴 429 뒤 대기열 진입 시 오류·카운트다운 소거, 배너는 대기가 429보다 우선 · 🟡 429 자동 재시도 중 배너 버튼 = 연결 끊기 · 🟡 stats 폴링은 오류로 멈춘 스트림에서 중지 · 🟡 `idleClosed` 재개 분기에 `stopped` 가드.
