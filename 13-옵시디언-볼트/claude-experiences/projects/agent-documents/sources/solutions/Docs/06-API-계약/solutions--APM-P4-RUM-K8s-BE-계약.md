# APM P4 — RUM·K8s BE 계약

기준: master 5547cd0 / p4-rum. 구현 담당 Codex, 검수·병합 Claude.
정본: C:\solutions\_workspace\contract_apm-p4.md.
2026-09-08 Claude 검수 반영: 사용자가 정본 직접 갱신을 명시한 예외에 따라 이 파일을 수정한다.

## §1 보안

조회·관리는 @RequiresFeature(APM), 쿠키 세션/visitorId, ApmAccessChecker를 따른다.
RUM 관리(목록 포함)는 apm.edit, 조회는 apm.view다. 사용자 역할 문자열을 직접 비교하지 않는다.
관리 API는 기존 ApiResult envelope의 data payload를 아래 DTO로 해석한다. 권한 거부는 HTTP 200/body code=403, 세션 인증 실패는 실제 401이다.

공개 수신은 @LicenseExempt와 직접 LicenseProvider.current().allows(APM)를 함께 사용한다.
LicenseArchitectureTest.MACHINE_CLIENT_CLASSES에 ApmRumIngestController를 추가했다. 이름의 MACHINE은 실행 환경이 아니라 **세션 화면이 아닌 텔레메트리 exporter의 실제 HTTP 계약**으로 해석한다. A1~A5 규칙을 완화하지 않았다.
전용 SecurityFilterChain을 premium 안에 두어 표준 모듈이 premium을 import하지 않는다.
사용자 JWT 필터는 이 수신 경로에서 쿠키/Bearer를 사용자 인증으로 해석하지 않는다.

토큰은 apm_receive_token을 재사용한다. 단방향 해시·발급·회수라는 동일한 모델을 중복 구현하지 않기 위해서다.
RUM 서비스에서 kind=RUM, scopes=["rum"]을 고정한다. Collector ingest/deploy 토큰과 서로 사용할 수 없다.
RUM 공개 토큰에는 장기 유효기간 대신 origin 바인딩과 회수가 있다. 원문은 POST 발급 응답의 plainToken 한 번만 나온다.
목록·스니펫·toString에는 토큰 원문/해시를 내보내지 않는다. 발급/스니펫 응답은 Cache-Control: no-store.
기존 Collector 토큰 발급 API로 만든 예약 RUM 토큰은 scope가 rum이 아니면 사용할 수 없다. 전용 API에서 새로 발급한다.

Origin은 scheme/host/port 전체 정확 매칭이다. wildcard, path, query, fragment, userinfo, null, 합쳐진 origin은 허용하지 않는다.
> → 반영 (2026-09-14, QA D3): 발급·Origin 전체 교체에서 동일 문자열의 중복 origin은 **거절하지 않고 dedup**한다. 처음 나온 순서를 유지해 하나씩 저장·반환한다. 입력 배열 최대 32개 검사는 dedup 전에 적용하므로 중복을 포함해 33개면 거절한다. FE의 "중복 허용 안 함" 안내는 이 계약에 맞춰 수정한다.

허용 목록 최대 32개. 빈 목록은 의도적인 수신 중지다. 대소문자·기본 포트 생략을 서버가 자동으로 동치화하지 않는다.
예: https://app.example.com과 https://app.example.com:443은 다르다.

단일 BE 노드 인메모리 제한:

| 제한 | 기본 | 발급 허용 범위 | 초과 |
|---|---:|---:|---|
| OPTIONS 전역 rps | 100 | 단일 노드 고정 | 429, Retry-After=1 |
| rps | 20 | 1~1000 | 429, Retry-After=1 |
| bodyBytes(해제 후) | 262144 | 1024~8388608 | 413 |
| gzip 회선 | min(bodyBytes, 2097152) | 고정 상한 | 413 |
| dailyLimit(UTC 일별 스팬/데이터포인트 수) | 100000 | 1~10000000 | 429, 다음 UTC 자정까지 Retry-After |
| 배치 스팬/데이터포인트 | 4096 | 고정 | 413 |

OPTIONS는 토큰 DB 조회 전 고정 크기 전역 큐로 제한한다. 임의 tokenId마다 제한 상태를 만들지 않는다.
POST 레이트 창은 토큰별 1초 슬라이딩 창이다. 초 경계에서 두 배 허용되지 않는다.
일 예산은 수용 시도 기준으로 차감하므로 재전송도 차감된다. 프로세스 재시작으로 카운터가 초기화된다.
다중 노드/재시작에도 엄격한 예산이 필요하면 Redis 공유 원자 연산으로 전환해야 한다.
공개 토큰과 Origin은 텔레메트리가 실제 사람의 행동이었다는 증명이 아니다. Origin은 비브라우저 클라이언트가 위조할 수 있다.

PII 규약:

- url.query, URL query/hash, raw IP, UA 원문, authorization/cookie/baggage, 입력값·리플레이는 저장하지 않는다.
- 페이지 키: tokenId + 정규화 path의 SHA-256. 토큰이 다른 사이트는 같은 path여도 별개 그룹이다.
- 숫자·UUID·긴 hex·긴 토큰·이메일 형태 path segment를 {id}로 바꾼다. percent encoding을 먼저 해석한다. 최대 path 512자.
- enduser.id는 토큰별 SHA-256으로 치환한다. session.id도 토큰별 SHA-256으로만 distinct에 사용한다.
- 국가: 유효 CF-IPCountry, 없으면 Accept-Language의 지역 코드. 없으면 null. **GeoIP 실측 국가가 아닌 힌트**다.
- JS 오류 메시지 첫 줄은 저장하지 않는다. type과 마스킹된 stack frame만 최대 UTF-8 4096바이트. 지문은 type+정규화 stack으로 계산한다.
- 프론트 스팬 저장 속성은 rum.browser, url.path, 해시 enduser.id, 표준 HTTP method/status, 유효 traceparent/tracestate만 허용한다.
- 폐기는 apm_ingest_drop_stat.signal=RUM. NOT_ALLOWLISTED, RUM_PII_REMOVED, RUM_ORIGIN_DENIED, RUM_RATE_LIMITED, RUM_BODY_TOO_LARGE, RUM_INVALID_PAYLOAD, RUM_UNAVAILABLE를 사용한다. 미확인 tokenId는 token_id=0으로 기록하지 않는다. PII_REMOVED는 속성 제거 수이며 거부 스팬 수가 아니다.

## §2 수신

| Method / 경로 | 인증 | 실제 HTTP 상태 |
|---|---|---|
| OPTIONS /apm/rum/v1/traces?tokenId=7 | 토큰 ID의 설정+Origin+APM 라이선스 | 204 / 403 / 429 / 503 |
| OPTIONS /apm/rum/v1/metrics?tokenId=7 | 동일 | 동일 |
| POST /apm/rum/v1/traces?tokenId=7 | Origin+Bearer 공개 RUM 토큰+tokenId 일치 | 200 / 400 / 401 / 403 / 413 / 415 / 429 / 503 |
| POST /apm/rum/v1/metrics?tokenId=7 | 동일 | 동일 |

**500 금지.** JSON/구조 오류=400, 지원하지 않는 Content-Type/Content-Encoding=415, 내부 DB/라이선스 조회 실패=503.
정상 OTLP 응답은 {}. 일부 폐기 시 partialSuccess.rejectedSpans 또는 rejectedDataPoints는 int64 문자열이다.
관리 ApiResult와 다르므로 FE의 2겹 언랩을 적용하지 않는다.

> → 반영 (2026-09-14, QA D5): `GET /apm/rum/v1/traces` 및 `GET /apm/rum/v1/metrics`는 지원하지 않는다. 실제 HTTP **405** + `{"statusCode":405,"message":"Method Not Allowed"}`로 응답한다. 이는 위 OPTIONS/POST의 RUM 오류 본문이나 관리 ApiResult envelope와 다르다. 기존 동작을 문서화하며 코드는 변경하지 않는다.

미존재·무효·회수된 tokenId와 Origin 불일치는 모두 같은 HTTP 403/동일 본문, CORS 허용 헤더 없음으로 응답한다. OPTIONS는 401을 반환하지 않는다. POST의 Bearer 인증 실패만 401이다.

브라우저 OPTIONS는 Authorization **값을 전송하지 않는다**. 따라서 비밀이 아닌 tokenId를 URL query로 보내고, 그 토큰의 allowlist를 preflight에서 조회한다.
POST는 실제 Bearer 원문을 해싱해 찾은 토큰 ID와 query tokenId의 일치를 다시 검사한다. 토큰 원문을 URL에 넣는 방식은 제공하지 않는다.
CORS: Access-Control-Allow-Origin은 정확한 요청 origin, Allow-Methods=POST,
Allow-Headers=Authorization, Content-Type, Content-Encoding, traceparent, tracestate,
Expose-Headers=Retry-After, Max-Age=60. Allow-Credentials는 보내지 않는다.
Vary=Origin, Access-Control-Request-Method, Access-Control-Request-Headers.
허용 origin에는 POST 401/429/503 응답에도 CORS를 달아 exporter가 상태를 읽게 한다.

Content-Type=application/json. gzip/identity만 지원하며 getParameter의 자동 form 파싱보다 먼저 검사한다. @RequestBody로 전체 본문을 먼저 메모리에 올리지 않고 상한을 갖고 읽는다.

OTLP/JSON 이름:

| 자료 | 수신 내용 |
|---|---|
| traces | resourceSpans[].scopeSpans[].spans[] |
| spans | documentLoad(PV), documentFetch/resourceFetch, CLIENT fetch/XHR, exception 이벤트 |
| metrics | web_vitals.lcp/inp/cls/ttfb/fcp. web.vitals.* 및 LCP/INP/CLS/TTFB/FCP 별칭 |
| gauge | asDouble 또는 asInt(int64 문자열) |
| histogram | explicitBounds + bucketCounts(int64 문자열), aggregationTemporality=1 또는 AGGREGATION_TEMPORALITY_DELTA |
| 단위 | 시간 ms/s(수신 시 ms 변환), CLS 1 또는 {score}; 미지정은 시간 ms/CLS score |
| 식별 | traceId 32 hex, spanId/parentSpanId 16 hex, zero ID 불가 |
| 시각 | timeUnixNano/startTimeUnixNano/endTimeUnixNano 문자열; 과거 30일~미래 5분 |
| 페이지 | rum.page.path 우선, 없으면 url.path/url.full/http.url. 스니펫이 현재 location.pathname을 실어 보냄 |
| navigation | navigation.fetchStart 등 표준 navigation key 또는 해당 이름의 스팬 이벤트 |
| resource | URL은 정규화 path만, resource.start_time(ms), resource.transfer_size 또는 HTTP body size |
| exception | exception.type, exception.stacktrace |

traceparent와 traceId 충돌은 해당 스팬만 폐기한다. CLIENT 이름은 호출 페이지 대신 정규화한 요청 대상 path다.
CUMULATIVE histogram은 중복 누적을 피하기 위해 폐기한다. exponential histogram은 이번 RUM 계약에 포함하지 않는다.
CanonicalBounds.durationSeconds 기반 시간 격자에 Web Vitals 임계 경계를 추가하고 HistogramRebucketer를 재사용한다.
재버킷 분포는 균등 분포 가정의 근사이며 rebucketed로 표시한다. gauge는 실제 한 관측이다.

수신 예시는 src/test/resources/apm/contract/rum-ingest-traces.json, rum-ingest-metrics.json.

## §3 스키마·보존·트레이스 연결

설계서의 예정 V39(P4)는 실제 최신 버전 다음 **V57__apm_rum_kubernetes.sql**로 구현했다. 기존 마이그레이션은 변경하지 않았다.

| 테이블 | 내용 | 보존 |
|---|---|---|
| apm_receive_token | allowed_origins text[], rum_rps, rum_body_bytes, rum_daily_limit 추가 | 회수 이력 포함 영구 |
| apm_rum_page_5m | token_id, group_id, page_group, browser, os, country, bucket, pv, sessions, js_error_count, resource_count/bytes, 각 vital counts/min/max, bounds_id/cls_bounds_id, rebucketed | 일 파티션 30일 |
| apm_rum_session_5m | 그룹·분류·버킷별 session_hash distinct | 일 파티션 30일 |
| apm_rum_receipt | token_id·관측 해시·bucket PK. 원문 미보관 | 일 파티션 30일 |
| apm_rum_timing_5m | navigation/resource 이름별 count·시작/소요 합·bytes | 일 파티션 30일 |
| apm_rum_error_5m | 페이지·지문·버킷별 오류 수 | 일 파티션 30일 |
| apm_rum_js_error_group | 지문·type·누적 count·4KB sample_stack·first/last | 마지막 관측 후 90일 |
| apm_rum_span | 최소 프론트 스팬 + 허용된 attrs | 일 파티션 7일 |
| apm_hist_bounds | rum_ms, rum_score 격자 2행 추가 | 영구 |

country는 DB PK에서 빈 문자열을 null 대용으로 쓰고 응답에서는 null로 돌린다.
5분 대입 UPSERT와 영수증, 세션 distinct, 오류·timing·스팬 쓰기가 같은 트랜잭션이다.
DB 실패 후 재전송이 이미 기록된 영수증 때문에 버려지지 않는다.
DDL은 적재 트랜잭션 밖에서 준비해 롤백된 파티션이 캐시에 남는 문제를 피한다.
원본 OTLP 스팬·본문은 보관하지 않는다. 브라우저 최소 스팬만 상관 조회 용도로 남긴다.

**세션 정의**: 페이지+browser+os+country+5분 버킷 안에서 session hash distinct.
넓은 기간의 세션 수는 버킷별 수의 합이다. 전체 기간 unique user/session이 아니다.
sessionMode="DISTINCT_PER_PAGE_DIMENSION_5M_SUM". 세션 ID 없는 데이터는 세션 수를 만들지 않는다.

> → 반영 (2026-09-14, QA D6): PV는 `documentLoad` 스팬에서만 증가한다. 같은 페이지·분류·5분 버킷에 `session.id`가 있는 Web Vitals 메트릭만 도착하고 `documentLoad`는 없으면 **`pv:0, sessions:1`**이 가능하다. 메트릭에서 세션 관측은 확인했지만 페이지 로드 스팬은 받지 못했다는 뜻이며, PV를 추정해서 채우지 않는다. 집계·조회 코드는 변경하지 않는다.

프론트→백: 브라우저 OTLP traceId가 apm_span의 trace_id와 같을 때 GET /apm/traces/{traceId}에서 두 테이블을 합쳐 기존 트리/critical path를 재계산한다.
parentSpanId가 fetch 스팬을 가리키는 서버 스팬은 브라우저 아래에 자연스럽게 붙는다. 잃어버린 부모 관계를 추측해 만들지 않는다.
브라우저 행은 serviceName="Browser", serviceUid=null, attrs["rum.browser"]="true". kind는 기존 CLIENT/INTERNAL.
동일 loader를 쓰는 flame/compare 조회에도 이 Browser 행이 포함된다. 서버 서비스 목록·RED 롤업·서비스 맵에는 합산하지 않는다.
Browser 조회는 서버 스팬 시작~종료 범위 ±5분으로 제한하고 중복 서버 스팬 확인에도 시간 조건을 적용한다.
페이지 상세 trace 링크는 조회 창 ±5분의 서버 스팬 존재를 확인한다. apm_rum_span(group_id,start_ts) 인덱스를 추가했다.
상세·flame·compare의 표시 summary는 Browser를 포함해 시작·duration·root·spanCount를 재계산한다.
서버 summary가 있으면 error는 서버 값을 유지한다. 저장된 apm_trace_summary는 변경하지 않는다.
서버 summary가 없을 때 임시 상세 summary는 표시 트리로부터 유도한다.
중복 spanId는 서버 스팬을 우선한다. 서버 목록 summary/RED/SLO/서비스 맵 집계에는 RUM을 섞지 않는다.
**서비스 맵 BROWSER 노드 유형은 추가하지 않았다.** 공개 데이터로 서버 그래프 집계를 오염시키지 않기 위한 결정이다.

## §4 조회 DTO·예시

공통 from/to는 ms epoch, 생략하면 최근 1시간. 0<from<to, 원 요청 창 최대 30일.
from은 5분 내림, to는 5분 올림이며 응답의 from/to가 실제 집계 창이다. stepSeconds=300.
조회 최대 50,000 저장 행, 페이지 목록 최대 500, 상세 timing/error/trace 링크 각 50. 절단 시 truncated=true. 50,000행 제한은 최신 버킷부터 보존하며 시계열 표시 순서는 오름차순으로 복원한다.
0 채움 시계열은 만들지 않는다. 빈 배열은 관측 없음이다.
알 수 없는 groupId는 page=null인 빈 상세다. 잘못된 형식은 관리 API의 body code=400.
mixedBounds면 계산 불가 p75/분포는 null, 표본 수는 유지한다. +∞ 버킷에 걸린 p75는 exceedsTopBound=true이며 하한 표시가 필요하다.
ApmPercentiles의 min/max 클램프를 사용한다. 시간은 ms, CLS는 무차원 score.

| GET 경로 | 권한 | data |
|---|---|---|
| /apm/rum/pages?from&to | apm.view | Pages |
| /apm/rum/pages/{groupId}?from&to | apm.view | Detail |
| /apm/rum/vitals?from&to | apm.view | Vitals |
| /apm/rum/breakdown?by=browser\|os\|geo&from&to | apm.view | Breakdown |
| /apm/rum/series?from&to | apm.view | Series |

DTO 전량(숫자 타입은 JSON number, 아래 Long도 bigint 문자열이 아니다):

~~~typescript
type PageRow = {
  groupId: string; tokenId: number; path: string; pv: number; sessions: number;
  lcpP75Ms: number|null; inpP75Ms: number|null; clsP75: number|null;
  jsErrorCount: number; resourceCount: number; resourceBytes: number;
  mixedBounds: boolean; rebucketed: boolean;
};
type Pages = {
  from: number; to: number; stepSeconds: number; pages: PageRow[];
  truncated: boolean; sessionMode: "DISTINCT_PER_PAGE_DIMENSION_5M_SUM";
};
type Point = { ts: number; pv: number; sessions: number };
type Series = {
  from: number; to: number; stepSeconds: number; points: Point[];
  truncated: boolean; sessionMode: "DISTINCT_PER_PAGE_DIMENSION_5M_SUM";
};
type Vital = {
  name: "LCP"|"INP"|"CLS"|"TTFB"|"FCP"; unit: "ms"|"score"; samples: number;
  p75: number|null; good: number|null; needs: number|null; poor: number|null;
  goodThreshold: number; poorThreshold: number;
  mixedBounds: boolean; rebucketed: boolean; exceedsTopBound: boolean;
};
type Vitals = { from: number; to: number; vitals: Vital[]; truncated: boolean };
type Dimension = { name: string|null; pv: number; sessions: number; jsErrorCount: number };
type Breakdown = {
  from: number; to: number; by: "browser"|"os"|"geo"; rows: Dimension[]; truncated: boolean;
};
type Timing = {
  kind: "navigation"|"resource"; name: string; count: number;
  startMs: number; durationMs: number; bytes: number;
};
type ErrorGroup = {
  fingerprint: string; type: string; count: number; sampleStack: string|null;
  firstSeenAt: string; lastSeenAt: string;
};
type Detail = {
  from: number; to: number; page: PageRow|null; series: Point[]; timings: Timing[];
  errorGroups: ErrorGroup[]; traceIds: string[]; vitals: Vital[];
  truncated: boolean; timingMode: "AGGREGATE_AVERAGE";
};
~~~

timings.startMs/durationMs는 해당 구간 이름별 평균이다. 개별 페이지 로드의 실제 waterfall로 표시하면 안 된다.
errorGroups.count는 조회 창의 오류 수이고 first/last는 90일 보존 그룹 메타데이터다.
traceIds는 실제 백엔드 스팬이 존재하는 링크만 제공한다. 시간 보존 때문에 이전 오류 그룹에 링크가 없을 수 있다.

분포 임계(경계 포함): good는 <= goodThreshold, needs는 goodThreshold 초과~poorThreshold 이하, poor는 그 초과.

| Vital | good | needs 상한 |
|---|---:|---:|
| LCP | 2500ms | 4000ms |
| INP | 200ms | 500ms |
| CLS | 0.1 | 0.25 |
| TTFB | 800ms | 1800ms |
| FCP | 1800ms | 3000ms |

good/needs/poor는 비율이 아니라 **관측 수 추정치**이며 재버킷 때문에 소수일 수 있다. samples=0이면 셋 모두 null.

예시 data:
~~~json
{"from":1788825600000,"to":1788825900000,"stepSeconds":300,"pages":[{"groupId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","tokenId":7,"path":"/orders/{id}","pv":2,"sessions":1,"lcpP75Ms":1200.0,"inpP75Ms":null,"clsP75":0.1,"jsErrorCount":1,"resourceCount":3,"resourceBytes":900,"mixedBounds":false,"rebucketed":false}],"truncated":false,"sessionMode":"DISTINCT_PER_PAGE_DIMENSION_5M_SUM"}
~~~

Timing·ErrorGroup은 rum-detail.json에 각각 한 건과 sampleStack=null, UTC 시각 문자열을 넣어 검증한다.

검증 표본: rum-pages.json, rum-detail.json, rum-series.json, rum-vitals.json, rum-breakdown.json.
ApmContractFixtureTest.rumContracts가 Boot ObjectMapper로 DTO와 대조한다.

토큰 관리:

| EP | apm.edit data |
|---|---|
| GET /apm/rum/tokens | RumToken[] |
| POST /apm/rum/tokens | Issued |
| DELETE /apm/rum/tokens/{tokenId} | {revoked:true,tokenId} |
| DELETE /apm/rum/tokens?tokenId | 같은 동작(설계 표의 collection DELETE 호환) |
| PUT /apm/rum/origins | 변경된 RumToken |

~~~typescript
type CreateToken = {
 label: string; allowedOrigins: string[]; rps?: number; bodyBytes?: number; dailyLimit?: number;
};
type ReplaceOrigins = { tokenId: number; allowedOrigins: string[] };
type RumToken = {
 id: number; label: string; kind: "RUM"; scopes: ["rum"]; allowedOrigins: string[];
 rps: number; bodyBytes: number; dailyLimit: number;
 createdAt: string; lastSeenAt: string|null; revokedAt: string|null;
};
type Issued = { token: RumToken; plainToken: string; endpoint: "/apm/rum" };
~~~

시각은 ISO-8601 UTC 문자열. lastSeenAt=null은 아직 저장 성공 없음.
scope/kind는 FE 입력으로 받지 않는다. rps/body/daily는 발급 후 불변이고 변경하려면 재발급한다.
원문은 발급 응답에서 복사하고 FE 영구 저장소/URL/로그에 남기지 않는다.
표본 rum-token.json, rum-token-issued.json의 토큰은 작동하지 않는 예시 문자열이다.

관리 API의 잘못된 입력은 기존 HTTP 200 + body code=400, errorCode=APM_RUM_INVALID 규약을 따른다.

> → 반영 (2026-09-14, QA D2): 회수된 RUM 토큰의 `PUT /apm/rum/origins`는 기존 관리 API 규약인 **HTTP 200 + body `code:400`, `errorCode:"APM_TOKEN_REVOKED"`**로 거절한다. Origin과 회수 시각은 변경하지 않는다. 없는 토큰·비 RUM 토큰은 `APM_TOKEN_NOT_FOUND`, 반복 DELETE는 기존 멱등 성공을 유지한다. `APM_TOKEN_REVOKED`는 이번에 기존 ErrorCode enum 체계에 추가했다.

## §5 스니펫

GET /apm/rum/snippet?tokenId=7, apm.edit. 반환 DTO:
~~~typescript
type Reference = {id:string; title:string; url:string; note:string};
type Snippet = {
 tokenId:number; endpoint:string; tokenPlaceholder:string; installCommand:string; code:string;
 propagateTraceHeaderCorsUrls:string[]; cspConnectSrc:string[];
 notices:string[]; references:Reference[];
};
~~~

endpoint는 설치본 app.apm.collector.endpoint-hint의 origin에서 만든다. 설치 주소를 설정하지 않았으면 예시 주소다.
OTel Web SDK·document-load/fetch/XHR와 web-vitals 초기화 코드, JS 오류 이벤트 수집을 제공한다.
> → 반영 (2026-09-14, QA D4): `error`와 `unhandledrejection`을 같은 exception 스팬 경로로 수집한다. Promise 거부의 `reason.name`·`reason.stack`은 문자열일 때만 사용하며 문자열/null/임의 객체 reason을 메시지나 JSON으로 변환하지 않는다. 기존 서버 `RumSanitizer.stack`에서 메시지 첫 줄·PII 제거 및 UTF-8 4096바이트 제한을 동일하게 적용한다. 동의 철회 시 두 리스너를 모두 해제한다.

Web Vitals 최종 값은 OTLP/JSON gauge로 직접 전송한다. 리소스 시작 시각은 SDK span.startTime을 performance.timeOrigin 기준으로 변환한다. 스니펫은 ES module 번들용이며 HTML에 붙이는 CDN script가 아니다. SDK 2.x 필수·1.x 혼용 금지·lockfile 고정 필요를 notice로 안내한다. 정확한 npm 버전 조합과 브라우저 번들 검증은 미완료다.
공개 토큰은 PASTE_ONCE_ISSUED_RUM_TOKEN 자리에 배포 설정으로 삽입한다. GET은 원문을 재노출하지 않는다.
consentGranted의 기본값은 false이고 동의 후 초기화한다. 철회 시 종료 함수와 consentGranted=false를 함께 적용한다.
session ID는 탭 메모리에만 생성한다. 쿠키/localStorage/입력값/세션 리플레이를 만들지 않는다.
propagateTraceHeaderCorsUrls는 기본 빈 목록이다. 실제 백엔드를 명시하고 그 백엔드 CORS에 traceparent/tracestate를 허용해야 한다.
cspConnectSrc 응답은 MovesEye origin만 제공한다. BE가 알 수 없는 백엔드 origin은 notice로 추가를 안내한다. script-src는 고객 자체 번들 정책을 따른다.

references는 ApmDocRef 패턴을 재사용한다:
- OpenTelemetry 브라우저: https://opentelemetry.io/docs/languages/js/getting-started/browser/
- Web Vitals: https://web.dev/articles/vitals (web.dev/vitals의 공식 안내)
- web-vitals: https://github.com/GoogleChrome/web-vitals

## §6 K8s

Collector 설정 POST와 발급 withConfig 옵션에 kubernetes?:boolean 추가, 생략=false.
true면 k8sattributes/kubeletstats/k8s_cluster와 metrics/k8s 파이프라인이 생성된다.
> → 반영 (2026-09-14, QA D1): `keepRawSql`을 생략해 설치본 기본값을 적용해도 `kubernetes:true`는 보존된다. 설정 다운로드와 토큰 발급 `withConfig` 모두 같은 규칙을 따른다. 옵션의 7인자 편의 생성자를 제거하고 기본값 병합에서 8개 필드를 모두 전달한다. 전역 keepRawSql의 false/true 각각을 실제 서비스·생성기 경로로 회귀 검증한다. filter/metrics의 구 `container.restart_count` 패턴은 제거했으며 정본 `k8s.container.restart_count`는 기존 `k8s\..*` 패턴으로 보존된다.

TLS 인증 검증은 켜져 있고 ServiceAccount CA를 기본 사용한다. kubelet serving CA가 다르면 별도 CA를 마운트하고 ca_file을 변경해야 하며 검증을 끄지 않도록 NOTICE로 안내한다. K8S_NODE_NAME은 Downward API로 주입한다.
k8sattributes는 pod UID resource attribute와 connection 기반으로 pod를 연결한다.
RBAC/실 배포는 5.3a 인프라 범위: ServiceAccount에 pods/namespaces/nodes/replicasets/deployments get/list/watch 및 nodes/stats 권한이 필요하다.
**이 통합 설정은 한 노드 시험용**이다. 운영에는 kubeletstats DaemonSet과 단일 k8s_cluster를 분리해야 한다. 중복 cluster receiver는 과대 수집을 만든다.
관련 notice는 생성 yaml의 NOTICE 주석으로 제공한다.

보존 속성: k8s.pod.name, k8s.namespace.name, k8s.node.name, k8s.deployment.name,
k8s.container.restart_count, k8s.container.status.last_terminated_reason.
구 container.restart_count는 공통 writer의 입력 폴백에서만 지원하며 정본을 우선한다.

**R2 설정 위치 정정(contrib 0.159.0 정본 기준)**:
- k8sattributes.extract.metadata에 restart_count/last_terminated_reason을 넣으면 Config.Validate()가 지원하지 않는 metadata로 거부한다. 사용자 요청 요약의 위치와 달리 검수 보고서 §7 필수 2의 위치를 따른다.
- k8s_cluster.resource_attributes.k8s.container.status.last_terminated_reason.enabled: true로 기본 비활성 속성을 켠다.
- k8s.container.restarts는 Gauge(Int) 메트릭이다. 관측기는 그 포인트의 resource attributes에서 마지막 종료 이유를 읽는다. 가짜 상태 메트릭이나 datapoint의 임의 reason은 사용하지 않는다.
- k8s.container.restart_count는 semconv 정수 리소스 속성이다. k8sattributes는 이를 입력 컨테이너 식별에 사용하며 이 버전에서 추출 출력으로 설정할 수는 없다.
- 테스트는 정의와 함께 metrics/traces/logs/metrics-k8s의 실제 processor 배열 및 batch/tail_sampling 이전 결선을 검증한다.

등록 리소스·cluster 메트릭은 ApmKubernetesStateWriter의 단일 조건부 JDBC UPDATE로 통합했다.
JPA K8s 컬럼은 updatable=false로 일반 touch/save가 이전 상태로 덮지 않는다.
서비스 이름 없는 지표는 namespace+pod가 맞는 기존 인스턴스에만 붙인다.
미사용 pod/node CPU·memory 4종과 가짜 상태 메트릭은 서비스 메트릭 허용목록에서 제거했다.

최초 count>0는 과거 사건 시점을 모르므로 재시작/OOM 시각을 만들지 않는다.
증가 관측에 OOMKilled가 있으면 한 번만 기록한다. 이유가 없으면 pending을 두어 5분 안의 늦은 이유를 한 번 결합한다.
동일 count·이유 반복 수신, 최초값, reset, 늦은 과거 샘플은 시각을 갱신하지 않는다.
배지는 조회 끝 시각 to 기준 5분 TTL과 조회 창 [from,to)을 모두 만족할 때 true다. 정확히 5분이면 false다.
원래 restartedAt/oomKilledAt은 이력으로 유지하며 실제 종료 시각이 아닌 텔레메트리 관측 시각이다.

적재 뒤 K8s 보강과 통계 예외는 수신 상태를 바꾸지 않는다. signal=METRIC /
K8S_ENRICHMENT_FAILED는 보강 실패 배치 수이며 메트릭 손실 수와 다르다. 영수증 기록은 계속 진행한다.
다중 클러스터/컨테이너 식별은 아직 namespace+pod 수준이며 여러 컨테이너 카운터 혼합은 후속 범위다.

기존 ApmInstanceRowDto 추가 필드:
~~~typescript
{
 k8sPod:string|null; k8sNode:string|null; k8sNamespace:string|null; k8sDeployment:string|null;
 containerRestartCount:number|null; restarted:boolean; oomKilled:boolean;
 restartedAt:string|null; oomKilledAt:string|null;
}
~~~
restarted/oomKilled는 조회 창 [from,to) 및 to 기준 최근 5분 안의 관측일 때 true다.
필드가 null이면 미수신이며 0이 아니다. 기존 서비스 상세 fixture에도 이 필드를 추가했다.
서비스 목록 기존 지표/필드명/상태 규약은 유지한다.

공식 근거:
https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/k8sattributesprocessor
https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/kubeletstatsreceiver
https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/k8sclusterreceiver

## §7 불안한 지점·검증 우선순위

1. 실제 고객 브라우저 exporter→CORS→BE→백엔드 trace header 전파 E2E와 CSP/동의 철회. MockMvc는 RUM 전용 체인과 실제 JwtAuthFilter를 포함한다. JWT 스킵 단위 테스트는 인접·기존 API의 인증 유지도 검증하지만 전체 앱·실브라우저 E2E와는 다르다.
2. 실제 K8s RBAC/노드 TLS/메타데이터와 k8s_cluster 분리 배치. 생성기는 설정을 만들며 클러스터에 배포하지 않는다. 매칭은 namespace+pod이며 다중 클러스터/컨테이너를 구분하는 키는 아직 없다.
3. 다중 BE 노드·재시작의 인메모리 일 제한 초기화. 현재 단일 노드 전제다. 파싱된 수신량은 DB 적재 전에 예산을 소비하므로 재시도/중복 전송도 예산에 포함된다.
4. 페이지·분류·버킷별 세션 합과 timing 평균의 의미를 FE가 정확히 표시해야 한다.
5. 공개 텔레메트리는 위조될 수 있다. 서버 RED/서비스 맵을 분리했지만 트레이스 상세의 Browser 행도 신뢰된 서버 증거가 아니다.
6. sessionId/스팬 ID 재사용·SDK 전송 중복 및 gauge 반복 관측은 계측 가이드 준수가 필요하다. 누적 histogram은 폐기한다.
7. 국가 값은 헤더 힌트이며 GeoIP 기반 방문 국가 통계가 아니다.
8. JVM/DB 시간대 UTC 운영 전제는 기존 APM과 같다. RUM만 다른 timestamp 시간대로 저장하지 않는다.
9. 조회 50,000행 절단 시 순위/분포는 부분 데이터이며 truncated 배지를 숨기면 안 된다.
10. service.name 없는 cluster 지표는 인스턴스 컨텍스트를 보강하지만 기존 서비스 메트릭 저장 경로의 UNKNOWN_SERVICE 폐기 통계에도 잡힐 수 있다. 미사용 허용목록 4종은 제거했지만 전용 수신·통계 분리는 후속 범위다. 보강 실패는 K8S_ENRICHMENT_FAILED로 구분한다.

최종 테스트 결과는 아래 실행 검증 항목에 기록한다.

> → 반영 (2026-09-14, P4 런타임 QA 수정 검증): `p4-qafix` / 기준 `6af7c46`에서 JDK 17로 `./gradlew.bat :test` **BUILD SUCCESSFUL (3m 10s)**. 303 suites, **3,088건 / 실패 0 / 오류 0 / skipped 0**. 실제 PostgreSQL의 `RumSchemaIT` 8건·`ApmKubernetesMetricObserverIT` 1건 및 LicenseArchitectureTest 7건 포함. D1 두 서비스 경로 4건 + D2/D3 상태·HTTP 계약 4건을 추가했으며, D1/D2 핵심 5건은 수정 전 실패를 확인했다.
>
> → 반영 (검증 수 차이): 본 트리 직전 XML은 3,086건이다. 그 실행에 포함된 미커밋 증분 차트 6건(`IncrementalChartQueryTest` 3건, CPU·memory·network 각 1건)은 기준 `6af7c46` worktree에 없고, 이번 APM 회귀 8건이 추가돼 3,088건이다. 기존 테스트 삭제나 skip으로 줄인 것이 아니다.
>
> → 반영 (스니펫·문서): `node --test src/test/resources/apm/rum-snippet.test.mjs` **6건 통과**. 일반 오류/Promise 수집 동등성·비 Error reason·동의·리스너 해제를 검증한다. UTF-8 4KB·PII는 같은 서버 정제 경로와 기존 `RumSanitizerTest`로 검증했다. package-info의 rum/synthetic/messaging/job/report 절, CLAUDE.md의 구현 현황, 잡 V54 완료 경로·원본 7일 보존 설명을 현행화했다. `git diff --check` 통과. 커밋·푸시·clean·bootRun·--stop은 실행하지 않았다.
>
> → 반영 (남은 불안): 수정본의 서버 런타임 재검증, 실제 OTel Web SDK 2.x 번들·브라우저 동의 철회, Collector 바이너리 validate 및 실제 K8s 배포는 미실행이다. Node VM의 SDK 대역 검증을 실제 번들 E2E로 해석하지 않는다. 기존 §7과 FE 역요청 F1~F4의 미해결 범위는 유지한다.

## 🔄 FE 요청사항

- RUM 전용 토큰/origin 발급·목록·회수 UI를 추가한다. 기존 Collector 토큰을 브라우저에 넣지 않는다.
- 발급 원문은 한 번만 복사하게 하고 재조회 불가를 안내한다. URL에는 tokenId만, 토큰은 Authorization 헤더로 전송한다.
- 관리 API는 기존 data 언랩, 수신 API는 실제 HTTP 상태를 사용한다. 429의 Retry-After를 따른다.
- null/0, sessionMode, timingMode, mixedBounds, rebucketed, truncated, exceedsTopBound를 표시 규칙에 반영한다.
- 페이지 표에 PV/버킷 세션 합/LCP·INP·CLS p75/JS 오류를 표시하고 분포에는 good·needs·poor 관측 수를 사용한다.
- 워터폴은 “집계 평균 timing”으로 표시한다. 개별 세션 리플레이처럼 표현하지 않는다.
- geo는 “국가 힌트”이며 null은 알 수 없음이다. 브라우저/OS는 family만 제공한다.
- 트레이스 Browser 행은 attrs.rum.browser로 표시한다. serviceUid=null을 허용하고 서비스 맵의 BROWSER 타입은 가정하지 않는다.
- 스니펫 동의 훅·CSP·백엔드 CORS·propagateTraceHeaderCorsUrls를 배포 환경에 맞춰 연결한다.
- Collector kubernetes 옵션은 운영 역할 분리 notice와 함께 노출한다. K8s 배지는 원래 관측 시각을 표시하며 5분 TTL 해제 뒤에도 과거 이력으로 읽을 수 있다.
- src/test/resources/apm/contract/rum-*.json 및 변경된 service-detail.json을 FE 계약 테스트에 반영한다.

### FE→BE 역요청 (2026-09-08 최초 요청 · 2026-09-14 Codex 직접 갱신)

초기 구현의 쓰기 범위 제한으로 검수 메모(`_workspace/reviews/review_apm-p4-fe_codex-memo.md`)에 남긴 F1~F4를 Claude가 옮겼다.
2026-09-14 사용자 허용에 따라 Codex가 이 절에 네 요청을 직접 재확인하고 현재 FE 대응을 갱신했다. **BE DTO·직렬화 표본 제공 전까지 요청은 미해결이다.**

| # | 요청 | 근거 | 현재 FE 대체 표시 | 검수 판정 |
|---|---|---|---|---|
| F1 | `PageRow.ttfbP75Ms: number\|null` 추가 + `rum-pages.json`·`rum-detail.json` 갱신 | WBS §3.18은 페이지 표에 TTFB를 요구하는데 `PageRow`엔 LCP/INP/CLS만 있다. 전체 페이지 TTFB(`Vitals`)를 행마다 복제하면 거짓이 된다 | 페이지별 TTFB 열 제거. 페이지 표 위에 전체 페이지 기준 상단 TTFB 카드 안내를 항상 표시 | **타당.** 다만 영구 빈 열은 "TTFB 전부 미관측"으로 읽힌다 — BE 반영 전까지 열을 빼거나 헤더에 보이는 안내를 다는 편이 낫다(검수 M2) |
| F2 | 버킷별 Web Vitals p75 시계열 DTO — `Detail.series`의 `Point`를 확장하거나 별도 배열(지표별 `p75`·`unit`·`mixedBounds`·`rebucketed`·`exceedsTopBound`·`ts`) + 표본 | `Point`가 `ts/pv/sessions`뿐이라 "p75 추이"를 그릴 수 없다. 창 전체 p75를 점으로 복제하면 안 된다 | 상세의 `apm.rum.p75_trend` 카드가 차트 대신 `p75_unavailable` 안내문만 | **타당.** 빈 카드 한 장이 남는 것은 감수 가능 |
| F3 | `PageRow`의 지표별 상한 초과 플래그(예: `lcpExceedsTopBound`) | `exceedsTopBound`가 `Vital`에만 있어 페이지 목록의 p75는 `≥`를 붙일 수 없다 | 상세 Vital 카드만 `≥` 표시. 목록은 지표별 하한 여부를 추정하지 않으며 mixedBounds는 `—` | **타당하나 우선순위 낮음.** 목록 p75는 이미 mixedBounds면 `—`로 접힌다 |
| F4 | 표본 보완 — `rum-detail.json`에 navigation timing·비-null `sampleStack`·실제 `traceIds`, 실제 Browser→server 트레이스 직렬화 표본, 그리고 `rum-snippet.json`·K8s 최근/이력 인스턴스 표본 | 현재 표본은 resource 1건·`sampleStack:null`·`traceIds:[]`뿐이라, 워터폴 navigation 구간·스택 `<pre>`·트레이스 링크·K8s 배지는 계약 게이트가 아닌 FE 자작 mock으로만 검증된다 | 해당 UI는 `ApmRumScreens.test.tsx`의 자체 mock으로 검증 | **타당.** 특히 `rum-snippet.json`은 스니펫 DTO(9필드)가 계약 게이트에 전혀 안 걸려 있는 유일한 조회 DTO다 |

FE 계약 소비 공백의 검수 반영 (2026-09-14, BE 변경 불필요):
- `Vital.goodThreshold`/`poorThreshold`/`unit`을 p75 등급·툴팁·표기에 사용한다. 분포와 태그는 동일 Vital 응답을 따른다. FE 기본 임계는 임계가 없는 PageRow 폴백으로만 사용한다.
- `ApmInstanceRowDto.k8sDeployment`를 인스턴스 표에 추가했으며 null은 `—`로 표시한다.
- FCP를 다섯 번째 분포 카드와 차트↔표 전환·kr/en 도움말에 추가했다.
- 수신 전용 `rum-ingest-{metrics,traces}.json`은 참고용 원문이며 FE 소비·계약 검증이 없음을 fixture README에 명시했다. BE 표본 대조는 줄바꿈 정규화 후 내용 동일성 기준이다.

### P4 런타임 QA FE 반영 (2026-09-14 · Codex 구현 / Claude 검수·병합)

- 근거: `verification/e2e_apm-p4-qa.md` D1~D4. FE worktree `moveseyee_fe-p4b`, `p4-qafix-fe`, 기준 `4599f21`.
- D3: §1의 중복 거절 문언은 실제 서버 규약에 맞춰 이 절에서 정정한다. 입력 목록은 **중복 포함 최대 32개**를 먼저 검증하고 정확히 같은 문자열만 저장 시 dedup한다. FE도 중복을 거절하거나 선제 제거하지 않고 원문 배열을 전송한다. 대소문자·명시 포트 정규화는 하지 않으며 kr/en 오류·도움말을 이에 맞춘다.
- D2: 기준 FE에 있는 회수 토큰의 Origin 편집 버튼 비활성화를 유지한다. 편집 중 갱신된 목록에서 회수가 확인되면 창을 닫는다. origin PUT의 400은 기존 업무 오류 처리로 파싱하고 토큰·스니펫 조회를 갱신해 외부 회수를 반영한다. BE의 `APM_TOKEN_REVOKED`는 회수 전용 kr/en 안내와 편집 창 닫기로 처리한다. 일반 입력 오류(`APM_RUM_INVALID`)만으로 토큰이 회수됐다고 판정하지 않는다.
- D1 임시 방어: BE의 `withSettingDefaults`가 `keepRawSql` 생략 시 `kubernetes`를 유실하는 QA 결과가 근거다. **K8s가 꺼진 DEFAULT 요청은 계속 키를 생략**한다. `kubernetes: true` 요청은 발급 `withConfig`와 설정 재생성 모두 `keepRawSql`을 명시한다. ON/OFF는 사용자 선택을 우선하고 DEFAULT는 조회한 전역 `keepRawSql`의 true/false를 사용한다. 전역값이 미조회·오류이면 false로 추정하지 않고 제출을 막으며 재조회 또는 명시 선택을 안내한다. 이 방식은 전역값을 조회 시점 값으로 고정하는 한시적 호환 처리이며, BE 수정 배포 확인 뒤 K8s DEFAULT도 생략하도록 되돌릴 수 있다. 체크박스 옆 한 줄 도움말로 현재 조회값 사용을 안내한다.
- D4: 스니펫 카드의 kr/en 도움말에 `error`와 `unhandledrejection`(처리되지 않은 Promise 거부)을 모두 포착하고 배포본에서 수집을 확인하도록 안내한다. FE가 생성 스니펫 코드를 임의로 덧붙이지 않는다.
- 최종 FE 검증: `npm run typecheck:contract`·`npx tsc --noEmit` 통과(수정 파일 오류 0), 관련 6 suites **214/214 통과**. 전체 Jest는 `--maxWorkers=2`로 **1회**, 236 suites 중 234 통과·2 실패, **2,759건 중 2,757 통과·2 실패**, 993.215초. 실패는 기존 검수 메모의 `TriggerFormDrawer` 오류 문구·`AiAssistantPage` 새 대화 URL 각 1건과 동일하다. 전체 실행 도중 갱신된 BE 안정 오류 코드 보정 후 관련 6 suites와 두 타입 검사를 다시 통과했다. `git diff --check` 통과. 로그·JSON·검증 기록은 FE worktree의 `scratchpad/codex-p4/fe/`에 보관한다.

## 이전 구현 실행 검증 (검수 반영 전)

- 기준: p4-rum / 5547cd0. 커밋·푸시 없음.
- JAVA_HOME=C:/Program Files/Java/jdk-17, Gradle :test.
- 전체 테스트: **3,051개 / 301 suites, 실패 0, 오류 0, skip 0**, BUILD SUCCESSFUL (14m 20s).
- V57 마지막 namespace+pod 인덱스 추가 후 :test --tests '*RumSchemaIT' --tests '*ApmKubernetesMetricObserverIT': **7개 통과, skip 0** (59s).
- 격리 PostgreSQL 18에서 Flyway V57 적용, canonical bounds, UPSERT, 세션 distinct, 재전송 중복 제거, 동시 수신, 실패 트랜잭션 롤백, min/max 누락 혼합 집계, Browser→백엔드 부모 연결, namespace/pod 매칭·restart/reset/지연 관측·OOM을 검증했다.
- 단위/MVC: origin 우회/중복/누락, 토큰 종류·scope 오용, 429/Retry-After, 본문/gzip 상한, 실제 HTTP/CORS, PII/UA/국가, vitals 분류, 계약 fixture, K8s YAML, LicenseArchitectureTest A1~A5 포함.
- rum-snippet.js: Node ES module 구문 검사 통과. 실제 브라우저 번들/E2E와 실제 K8s 배포는 미실행.
- git diff --check 통과. clean/bootRun/--stop 미실행.
- DB는 이 작업에서 만든 일회용 컨테이너와 무작위 localhost 포트만 사용했다. 기존 dev DB/사용자 프로세스는 변경하지 않았다.
- 전체 보고서: build/reports/tests/p4-full/index.html, XML: build/test-results/p4-full/.
- 최종 스키마 IT 보고서: build/reports/tests/test/index.html.

## 변경/신규 파일 목록

최종 worktree 기준 신규 48개, 수정 31개. 기존 P4 미커밋 구현을 포함한 전체 목록이다. 계약 정본은 worktree 밖 명시적 쓰기 예외이며 아래 집계에서 제외한다.

### 신규

- `src/main/java/com/dmove/moveseye/premium/apm/rum/ApmRumController.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ApmRumIngestController.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumObservation.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumParser.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumSanitizer.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumStore.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumVital.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/package-info.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/page/RumQueryDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/page/RumQueryService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/security/RumLimitException.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/security/RumOriginPolicy.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/security/RumRateLimiter.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/security/RumSecurityConfiguration.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/snippet/RumSnippetDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/snippet/RumSnippetService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/token/RumOriginsDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/token/RumTokenCreateDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/token/RumTokenDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/token/RumTokenIssuedDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/rum/token/RumTokenService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/instance/ApmKubernetesMetricObserver.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/instance/ApmKubernetesStateWriter.java`
- `src/main/resources/apm/rum-snippet.js`
- `src/main/resources/db/migration/V57__apm_rum_kubernetes.sql`
- `src/test/java/com/dmove/moveseye/auth/security/JwtAuthFilterRumTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/collector/config/ApmKubernetesConfigTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/ApmRumControllerTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/ApmRumIngestMvcTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/RumContractFixtures.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/ingest/RumParserTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/ingest/RumSanitizerTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/ingest/RumSchemaIT.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/security/RumSecurityTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/rum/token/RumTokenServiceTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/service/instance/ApmKubernetesContextTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/service/instance/ApmKubernetesMetricObserverIT.java`
- `src/test/resources/apm/contract/rum-breakdown.json`
- `src/test/resources/apm/contract/rum-detail.json`
- `src/test/resources/apm/contract/rum-ingest-metrics.json`
- `src/test/resources/apm/contract/rum-ingest-traces.json`
- `src/test/resources/apm/contract/rum-pages.json`
- `src/test/resources/apm/contract/rum-series.json`
- `src/test/resources/apm/contract/rum-token-issued.json`
- `src/test/resources/apm/contract/rum-token.json`
- `src/test/resources/apm/contract/rum-vitals.json`
- `src/test/resources/apm/k8s/README.md`
- `src/test/resources/apm/k8s/cluster-restarts-0.159.0.json`

### 수정

- `engine-api/src/main/java/com/dmove/moveseye/common/exception/ErrorCode.java`
- `src/main/java/com/dmove/moveseye/auth/security/JwtAuthFilter.java`
- `src/main/java/com/dmove/moveseye/otel/histogram/CanonicalBounds.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigOptionsDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigReqDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/MetricIngestPipeline.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/drop/ApmDropReason.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/drop/ApmIngestSignal.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/ApmMetricAllowlist.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmDocRef.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/partition/ApmPartitionService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionJob.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmInstance.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmReceiveToken.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmHistBoundsCatalog.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/instance/ApmInstanceRowDto.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/registry/auto/ApmRegistrar.java`
- `src/main/java/com/dmove/moveseye/premium/apm/service/registry/auto/ApmRegistryWriter.java`
- `src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanAttrAllowlist.java`
- `src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java`
- `src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java`
- `src/main/resources/apm/collector-template.yaml`
- `src/test/java/com/dmove/moveseye/license/LicenseArchitectureTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/ApmContractFixtureTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpControllerTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/MetricIngestPipelineTest.java`
- `src/test/java/com/dmove/moveseye/premium/apm/core/batch/ApmBatchJobTest.java`
- `src/test/resources/apm/contract/service-detail.json`

## Claude 검수 반영 검증 (2026-09-08)

- R1~R4 및 B1~B5, R5~R25를 보완했다. R16은 SDK 2.x 전제를 notice로 명시했으며 정확 버전 조합·브라우저 번들은 미검증이다.
- R21은 RUM 격자를 CanonicalBounds로 통합하고 catalog의 정규 판정에 연결했다. R22는 무차원 단위와 표시 배율을 분리했다.
- 시작 시 ApmInstance.java의 P4 diff 40 insertions / 2 deletions를 확인했다. R3/R18 변경으로 상태 갱신을 공통 writer로 옮겼으며 줄바꿈만을 위한 복구 작업은 하지 않았다.
- 최종 전체 검증: JAVA_HOME=C:/Program Files/Java/jdk-17, .\gradlew.bat :test → **BUILD SUCCESSFUL (3m 39s)**.
- XML 합산: **3,072개 / 303 suites, 실패 0, 오류 0, skipped 0**. 검수 전 3,051개보다 21개 증가했다.
- 실제 PostgreSQL 통합 테스트: RumSchemaIT 8개, ApmKubernetesMetricObserverIT 1개 포함, 모두 실행·통과했다. 이번 실행은 기존 테스트 헬퍼의 localhost:5433 전용 moveseye_it DB를 사용했다. 운영/dev dmove DB는 수정하지 않았다.
- 1차 전체 검증에서는 신규 테스트에 실제 개행 대신 문자 \n을 넣은 fixture 오류 1개가 있었고 수정했다. 위 최종 전체 결과는 수정 이후 실행이다.
- B1~B5 변이 실험: JWT 스킵 제거, 미상 preflight 401 복원, processor 결선 제거, Vary 제거, no-store 제거를 모두 검출했다. JWT 변이가 MVC에 미치는 영향을 분리하기 위해 B4는 단독 실행으로도 실패를 확인했다. 변이 대상 파일은 스냅샷과 바이트 일치를 확인해 전부 원복했다.
- 변이 증거: 지정 scratchpad의 mutation-b-review/ 및 mutation-b4-isolated/ (XML·원복 스냅샷). 최종 전체 보고서: worktree/build/reports/tests/test/index.html; XML: build/test-results/test/.
- git diff --check 통과. 커밋·푸시·clean·bootRun·--stop 미실행.

### 항목별 반영

| 항목 | 반영 내용·검증 |
|---|---|
| R1 | 적재 후 observe RuntimeException과 통계 실패를 각각 격리한다. K8S_ENRICHMENT_FAILED로 보강 실패 배치를 계수한다. 실제 controller→pipeline 경로에서 예외 주입 후 200·영수증 기록·재전송 적재 1회를 검증했다. |
| R2 | contrib 0.159.0에서 지원하는 k8s_cluster.resource_attributes로 종료 이유를 활성화했다. Gauge(Int) k8s.container.restarts와 resource attribute를 읽으며 정본 k8s.container.restart_count를 보존한다. 두 키를 k8sattributes.extract.metadata에 넣지 않은 이유는 §6 및 아래 공식 근거 참조. |
| R3 | count 증가와 이유를 짝지어 한 번 기록하고, 늦은 이유는 pending에 5분 안 한 번 결합한다. 반복값·최초값·reset·과거 관측은 새 배지를 만들지 않는다. TTL 5분 경계·JDBC 실적재를 검증했다. |
| R4 | OPTIONS의 미존재·무효·회수·타종류/권한·origin 불일치는 동일 403/본문, CORS 허용 헤더 없음으로 통일했다. |
| B1 | 실제 JwtAuthFilter에 RUM 경로 2개와 인접/기존 경로 4개를 넣어 인증 스킵 범위와 JWT/Redis/Zabbix 무호출을 검증한다. |
| B2 | 실제 RumTokenService를 포함한 MVC에서 거부 사유별 동일 상태·본문·헤더를 검증한다. |
| B3 | metrics/traces/logs/metrics-k8s processor 배열과 batch/tail_sampling 이전 순서를 검증한다. |
| B4 | 성공 수신의 Vary에 Origin이 포함됨을 검증하고, 헤더 제거 변이를 단독 검출했다. |
| B5 | Spring Security 기본 헤더에 가려지지 않게 관리 handler 응답의 발급/스니펫 no-store를 직접 검증한다. |
| R5 | 정본 restart_count 이름을 allowlist·trace/registry·fixture에 적용하고 구 이름은 writer 입구에서만 폴백한다. |
| R6 | CAP 50,000에서 최신 버킷을 보존하고 표시 시계열은 오름차순으로 복원한다. DB 50,001행 경계 테스트를 추가했다. |
| R7 | Browser/서버 중복 조회에 서버 trace 범위 ±5분 조건, 상세 링크에 조회 창 ±5분 조건과 group_id/start_ts 인덱스를 추가했다. |
| R8 | 상세 표시 summary의 Browser 포함 재계산을 §3에 명시하고 저장 서버 summary가 있으면 error는 서버 값을 유지한다. |
| R9 | Firefox 스택 형태를 검사해 @가 든 일반 오류 메시지를 제외한다. |
| R10 | family 단독 조회 대신 canonical bounds 배열 일치로 ID를 조회한다. 동일 family 2행 공존 IT를 추가했다. |
| R11 | Content-Type/Encoding을 getParameter보다 먼저 검사한다. form 입력에서 자동 파싱 호출이 없는지 검증한다. |
| R12 | OPTIONS DB 조회 전에 단일 노드 전역 100 req/s 제한을 추가하고 초 경계와 호출 순서를 검증한다. |
| R13 | 데이터 유형 없는 metric도 배치 4096 상한에 포함한다. |
| R14 | traceparent 충돌 스팬만 partialSuccess로 폐기한다. |
| R15 | CLIENT fetch 이름에 정규화한 요청 대상 path를 쓴다. |
| R16 | 최소 대응으로 SDK 2.x 필수·1.x 혼용 금지·lockfile 고정을 notice에 명시했다. 정확한 npm 버전 조합 고정과 브라우저 번들 실행은 미완료다. |
| R17 | 미커밋 P4 신규 V57의 CREATE TABLE/INDEX를 IF NOT EXISTS로 통일했다. 기적용 V1~V56은 변경하지 않았다. |
| R18 | 재시작/OOM 판정과 쓰기를 공통 JDBC writer 하나로 통합했다. JPA의 K8s 컬럼 갱신을 막아 touch/save가 새 상태를 덮지 않는지 IT로 검증한다. |
| R19 | rum/package-info.java 및 parser/store/limiter 판단 근거 주석을 추가하고 신규 RUM Java 코드를 4칸 들여쓰기로 정리했다. |
| R20 | 실제 저장·조회하지 않는 pod/node CPU·memory 4종과 가짜 상태 메트릭을 서비스 허용목록에서 제거했다. UNKNOWN_SERVICE 통계 경로 분리는 후속으로 남는다. |
| R21~R22 | RUM 격자를 CanonicalBounds와 catalog 정규 판정에 통합하고 CLS 무차원 단위·표시 배율을 분리했다. |
| R23~R24 | 503은 RUM_UNAVAILABLE로 분류하고 미확인 tokenId=0 통계는 기록하지 않는다. |
| R25 | cspConnectSrc는 MovesEye origin만 반환하고 백엔드 origin은 notice로 안내한다고 계약을 정정했다. |

K8s 입력 fixture는 공식 contrib 출력 계약을 재현한 OTLP/JSON이며 실제 클러스터에서 캡처한 파일은 아니다. reader→observer→JDBC까지 검증했지만 Collector 바이너리 validate 및 클러스터 배포는 실행하지 않았다.

검수 근거:
- [contrib 0.159.0 k8sattributes Config.Validate](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/processor/k8sattributesprocessor/config.go)
- [contrib 0.159.0 k8s_cluster Gauge·Resource Attributes](https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/v0.159.0/receiver/k8sclusterreceiver/documentation.md)
- [OpenTelemetry Kubernetes semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/k8s/)
