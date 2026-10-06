# APM P4 (RUM · K8s) BE 검수 — Claude

- 대상: worktree `C:\solutions\moveseye-be-spring-p4` / 브랜치 `p4-rum` / 기준 master `5547cd0`, **워킹트리 미커밋**(신규 16 경로·수정 29 파일).
- 구현: Codex(gpt-6-astra xhigh) / 검수: Claude. **코드 수정 없음** — 검출력 확인을 위한 임시 변이는 전부 원복했고 아래 §6에서 원복을 증명한다.
- 정본 대조: `_workspace/contract_apm-p4.md`, `_workspace/designs/devdesign_apm.md` §15·§7·§8.1·§9, `devdesign_apm-screens-wbs.md` WS-5.
- 작성: 2026-09-08.

---

## 요약 3줄

1. **보안 골격은 견고하다.** 전용 SecurityFilterChain·정확 Origin 매칭·상한 스트림 본문·gzip 폭탄 방어·500 금지·PII 허용목록·A1~A5 우회 없음까지 설계 §15가 요구한 것을 실제로 구현했고, 변이 실험에서 origin/영수증/CUMULATIVE/재시작 판정 4개 가드가 모두 테스트에 잡혔다(3,051 green 재현).
2. **그러나 K8s 절반은 "동작하지 않는 기능"이다.** OOM 배지가 매달린 `k8s.container.status.last_terminated_reason`은 contrib에 **메트릭이 아니라 기본 비활성 리소스 속성**이고, 재시작 속성 이름은 semconv의 `k8s.container.restart_count`가 아닌 `container.restart_count`다 — 테스트가 그 지어낸 이름을 스스로 먹여 통과하므로 **초록이 사실을 감췄다**.
3. **병합 전 반드시 고칠 것은 4건**: (R1) `kubernetes.observe()` 무방비 예외가 이미 적재된 메트릭 배치를 503→재전송→이중 계산으로 밀어 넣는다, (R2) OOM 미수신, (R3) OOM 레벨 트리거로 배지가 영구 점등, (R4) preflight 401/403 분기가 토큰 존재 여부를 알려 준다(같은 레포 `ApmOtlpController`가 명시적으로 금지한 것).

---

## 1. 지적 사항

| # | 심각도 | 파일:라인 | 문제 | 왜 | 권고 |
|---|---|---|---|---|---|
| R1 | 🔴 | `collector/ingest/MetricIngestPipeline.java:101` | `kubernetes.observe(points)`가 `ingestor.ingest()`(=이미 커밋) **뒤**, `receiptService.record()` **앞**에 try/catch 없이 놓였다 | K8s UPDATE 하나가 실패하면 파이프라인이 예외를 던지고 `ApmOtlpController:429`가 **503**을 준다. 그런데 메트릭 행은 이미 저장됐고 **영수증은 안 남았다** → exporter 재시도가 중복 판정을 통과해 같은 배치를 다시 적재한다. sum/histogram은 누적이라 **조용히 이중 계산**된다. 같은 파일 7)번 주석이 "순서를 뒤집으면 …"이라고 경고한 바로 그 함정을 반대 방향으로 밟았다 | `ApmRumIngestController.record()`처럼 `try{...}catch(RuntimeException ignored){log}`로 감싸거나, `ingestor.ingest()` **앞**으로 옮긴다. 보강 실패가 수신 상태를 바꾸면 안 된다 |
| R2 | 🔴 | `service/instance/ApmKubernetesMetricObserver.java:20-21,40` · `resources/apm/collector-template.yaml`(생성 블록) | OOM 판정이 **메트릭 이름** `k8s.container.status.last_terminated_reason` / `k8s.container.status.reason` 에 걸려 있다 | contrib `k8sclusterreceiver/documentation.md` 확인 결과 전자는 **Resource Attribute이고 Enabled=false(기본 비활성)**, 후자는 아예 없다(있는 것은 `k8s.pod.status_reason`). 생성 yaml도 그 속성을 켜지 않는다. → `container_oom_at`은 영원히 null, 계약 §6의 `oomKilled`/`oomKilledAt`은 **항상 false/null**. 계약서·DTO·FE 요청사항은 이 기능이 있다고 말한다 | ① 생성 yaml의 `k8s_cluster`에 `metrics: {}` / `resource_attributes: {k8s.container.status.last_terminated_reason: {enabled: true}}`를 명시해 켜고, ② 관측기는 **메트릭 `k8s.container.restarts`의 리소스 속성**에서 이유를 읽도록 바꾼다. 못 하면 계약 §6과 DTO에서 OOM을 빼고 "미지원"으로 적는다 |
| R3 | 🔴 | `core/domain/ApmInstance.java`(observeKubernetes, OOM 줄) · `ApmKubernetesMetricObserver.java:40-43` | `containerOomAt = at`가 **관측이 올 때마다** now로 갱신된다(레벨 트리거) | `last_terminated_reason`은 컨테이너가 사는 동안 계속 같은 값으로 보고된다. 그래서 R2를 고치는 순간 **한 번 OOM된 파드는 배지가 영구히 켜지고 시각은 언제나 "방금"** 이 된다. 계약 §6의 `restarted`/`oomKilled`는 "조회 창 안에 관측 시각이 있을 때 true"인데, 이러면 어떤 창에서도 true다. 재시작은 증가(에지) 판정인데 OOM만 레벨이라 비대칭이고, 그 비대칭이 버그의 원인 | restart count **증가와 짝지어** 한 번만 찍는다(`count > 이전 && reason==OOMKilled`). 또는 `(pod, restart_count)` 쌍을 기억해 같은 쌍이면 갱신하지 않는다 |
| R4 | 🔴 | `rum/token/RumTokenService.java:66-67` + `rum/ApmRumIngestController.java:56-58,75-78` | 없는/RUM 아닌/회수된 tokenId → **401**, 존재하지만 Origin 불일치 → **403** | 임의 Origin으로 `OPTIONS /apm/rum/v1/traces?tokenId=1..N`을 훑으면 401/403 차이만으로 **어느 id가 살아 있는 RUM 토큰인지** 열거된다. 같은 레포 `ApmOtlpController:399`가 "🔴 사유를 응답에 적지 않는다(토큰 존재 여부를 알려 주지 않는다)"고 못 박은 원칙의 정면 위반이고, 검수 기준 §15의 첫 항목이다. **변이 실험 결과 401→403 통일은 어떤 테스트도 깨지 않는다** = 비용 0 | preflight/POST의 "토큰 못 찾음"과 "Origin 불일치"를 **같은 403**으로 합친다. Bearer 인증 실패(POST)만 401로 남긴다. 계약 §2 표도 함께 정정 |
| R5 | 🟡 | `collector/ingest/normalize/ApmMetricAllowlist.java:305-310` · `core/domain/ApmInstance.java`(`attrs.get("container.restart_count")`) · `trace/ingest/{ApmSpanAttrAllowlist,TraceIngestPipeline}.java` | 재시작 카운트를 **`container.restart_count`** 라는 이름으로 읽는다 | k8sattributes README는 `k8s.container.restart_count`라고 명시한다(`container.restart_count`는 semconv에 없다). → `ApmRegistrar`→`observeKubernetes` 경로의 재시작 보강은 **한 번도 발화하지 않는다**. cluster 메트릭 별칭 `k8s.container.restarts`만 살아 있어 겉보기에는 동작한다 | 두 이름을 모두 읽되 정본은 `k8s.container.restart_count`로. `ApmKubernetesContextTest`도 정본 이름으로 다시 쓴다(지금은 잘못된 이름을 고정하고 있다) |
| R6 | 🟡 | `rum/page/RumQueryService.java:68-71` | `order by bucket, group_id, … limit 50001` 후 앞 50,000행만 사용 | 절단이 **가장 오래된 버킷을 남기고 최신을 버린다.** 30일 창처럼 큰 조회에서 "최근이 안 보이는" 화면이 나오고, truncated 배지만으로는 그게 최신 손실인 줄 알 수 없다 | `order by bucket desc`로 뒤에서 자르거나(그 뒤 정렬 복원), 집계를 SQL로 내려 CAP을 행 수가 아닌 그룹 수로 건다 |
| R7 | 🟡 | `trace/query/ApmTraceQueryService.java:596-599` | RUM 조인 서브쿼리에 **시간 조건이 없다** — `apm_rum_span where trace_id=?` + `exists(select 1 from apm_span s where s.trace_id=r.trace_id)` | 트레이스 상세 조회 **매 요청마다** 파티션 전체(rum 7일치 + apm_span 보존 전체)를 훑는 probe가 하나 늘었다. RUM 데이터가 0건인 설치본에서도 비용을 낸다 | 두 쿼리 모두에 `start_ts` 창(트레이스 summary의 startTs ± 여유)을 건다. `apm_rum_span`에 `(group_id, start_ts)` 인덱스도 필요하다(§상세의 traceIds 조회가 group_id로만 걸러 순차 스캔한다) |
| R8 | 🟡 | `trace/query/ApmTraceQueryService.java:627-630` | 브라우저 행이 있으면 `deriveSummary`로 **duration·root·error를 재계산**해 응답 summary를 덮어쓴다 | 계약 §3은 "서버 목록 summary/RED/SLO/서비스 맵 집계에는 RUM을 섞지 않는다"고 적었는데 **트레이스 상세 summary는 섞는다**. 공개(위조 가능) 스팬 하나가 서버 트레이스의 표시 duration·루트·에러 플래그를 바꾼다. 저장된 `apm_trace_summary`는 안 건드리므로 사고는 아니지만 계약 문장과 코드가 다르다 | 계약 §3에 "트레이스 **상세** summary는 Browser 포함으로 재계산된다(저장 summary는 불변)"를 명시하거나, 재계산을 duration/root에 한정하고 error는 서버 값 유지 |
| R9 | 🟡 | `rum/ingest/RumSanitizer.java:111` | 스택 필터가 `s.startsWith("at ")` **또는 `s.contains("@")`** 인 줄만 남긴다 | Firefox 프레임(`fn@url:1:2`) 때문에 `@` 규칙이 필요한데, 그 결과 **`@`가 든 오류 메시지 첫 줄이 그대로 저장**된다(`Error: invalid mail a@b.com` → 이메일만 마스킹되고 문장은 남음). 계약 §1 "JS 오류 메시지 첫 줄은 저장하지 않는다"를 부분적으로 어긴다 | Firefox 프레임은 `^[^\s]*@\S+:\d+`처럼 **형태**로 판정하고, 그 외 `@` 포함 줄은 버린다 |
| R10 | 🟡 | `rum/ingest/RumStore.java:37-38` | `select id from apm_hist_bounds where family='rum_ms'` — `queryForObject`(정확히 1행 가정) | `apm_hist_bounds`의 UNIQUE는 `(bounds)`이지 `(family)`가 아니다. 훗날 rum 격자를 한 줄 더 넣으면 **모든 RUM 수신이 503**이 된다(원인이 수신 경로에 안 보인다) | `where bounds = ?::double precision[]`(RumVital.bounds()로 조회)로 바꾸거나 `order by id limit 1` + 명시적 주석 |
| R11 | 🟡 | `rum/ApmRumIngestController.java:77,79` | `request.getParameter("tokenId")`가 Content-Type 검사(83행)보다 먼저 호출된다 | `application/x-www-form-urlencoded`로 오면 Tomcat이 폼 파싱을 하며 **토큰별 bodyBytes와 무관하게** maxPostSize(기본 2MB)까지 본문을 버퍼링한 뒤에야 415가 나간다. 인증 전 경로라 미인증 메모리 소모 | Content-Type/Content-Encoding 검사를 tokenId 파싱보다 앞으로 옮긴다(쿼리스트링만 직접 파싱해도 된다) |
| R12 | 🟡 | `rum/ApmRumIngestController.java:52`(preflight 경로 전반) | OPTIONS preflight에 **레이트리밋이 없다**(`limiter.request`는 `authenticate` 뒤에만) | 미인증 OPTIONS 하나마다 `apm_receive_token` 조회 1회. 토큰 없이도 무제한으로 DB를 두드릴 수 있다 | preflight에도 tokenId 기준(또는 전역) 저비용 창을 걸거나, 토큰 설정을 짧은 TTL 캐시로 읽는다 |
| R13 | 🟡 | `rum/ingest/RumParser.java:43` | metric 항목에 `gauge`/`histogram`이 없으면 `received++; dropped++; continue;` — **4096 상한 검사를 건너뛴다** | 계약 §1 "배치 데이터포인트 4096 고정 → 413"이 잘린 metric으로 우회된다(본문 상한이 실질 방어). 그만큼 일 예산도 소모된다 | 이 분기에도 `if (++received > 4096) throw new RumLimitException(413);`를 적용 |
| R14 | 🟡 | `rum/ingest/RumParser.java:87` | traceparent와 OTLP traceId 불일치 시 **배치 전체 400** | 스팬 하나의 오염이 정상 스팬까지 버리고, exporter는 같은 배치를 계속 재시도한다. 같은 상황을 계약은 "폐기 카운터"로 다루기로 했다 | 그 스팬만 `dropped++`로 버린다(§2 partialSuccess가 이미 그 통로다) |
| R15 | 🟡 | `rum/ingest/RumParser.java:121` | CLIENT 스팬 이름을 `"fetch " + method + " " + page`로 만든다 | `page`는 **호출한 페이지**이지 호출 대상이 아니다. 트레이스 폭포에서 브라우저 fetch 스팬이 전부 같은 이름으로 보인다. 바로 위에서 계산한 `resourcePath`가 정답인데 안 쓴다 | `resourcePath`(정규화된 요청 path)를 이름에 쓴다 |
| R16 | 🟡 | `resources/apm/rum-snippet.js:2-10` vs `snippet/RumSnippetService.java:31-34` | installCommand가 **버전을 하나도 고정하지 않는다** | 코드가 쓰는 `resourceFromAttributes` / `new WebTracerProvider({spanProcessors})`는 OTel JS **2.x** API다. 오늘 `npm install`한 고객이 1.x를 받으면 `Resource` API 불일치로 즉시 깨진다. 반면 collector 쪽은 이미 "정확 버전 고정" 규약을 지키고 있다 | 검증한 조합으로 `@x.y.z` 고정. 최소한 notices에 "SDK 2.x 필요"를 적는다 |
| R17 | 🟡 | `resources/db/migration/V57__apm_rum_kubernetes.sql:18,33,53,58,63,69,76,82` | 앞의 `ALTER … ADD COLUMN IF NOT EXISTS`와 달리 `CREATE INDEX`·`CREATE TABLE`에는 `IF NOT EXISTS`가 없다 | 레포 규약(CLAUDE.md)의 "공유 dev DB 고려 멱등 DDL"과 파일 안에서 스타일이 갈린다. 부분 적용 후 재실행이 필요한 상황에서 인덱스에서 먼저 죽는다 | 전부 `IF NOT EXISTS`로 통일 |
| R18 | 🟡 | `service/registry/auto/ApmRegistryWriter.java:45-52` vs `service/instance/ApmKubernetesMetricObserver.java` | 같은 재시작/OOM 규칙이 **JPA판과 JDBC판 두 벌**로 구현돼 있다 | 한쪽만 고치면 조용히 갈라진다(실제로 R3의 OOM 레벨 트리거는 양쪽에 똑같이 들어 있다). JPA판은 엔티티 전체를 save하므로 JDBC판의 동시 갱신을 **덮어써 잃을** 수 있다(`@Version` 없음) | 판정 로직을 한 곳(예: `ApmKubernetesObservation` 값 객체)으로 모으고, 쓰기는 JDBC 조건부 UPDATE 하나로 통일 |
| R19 | 🟡 | `premium/apm/rum/` 전체 | `package-info.java`가 없다. 코드 스타일이 한 줄 압축형(`if(x)return;`, 연산자 공백 없음)이고 설명 주석이 희박하다 | 같은 레포의 `core/`·`report/`·`service/deploy/`는 package-info를 두고, `CanonicalBounds`·`ApmPercentiles`·`ApmRetentionService` 등은 "왜 이렇게 했는가"를 길게 적는 것이 규약(§0.5-6/7, CLAUDE.md 상세 주석 톤)이다. P4만 톤이 다르면 다음 사람이 읽는 비용이 이 폴더에서만 급등한다 | `rum/package-info.java` 추가 + 최소한 `RumParser`·`RumStore`·`RumRateLimiter`의 판단 근거를 기존 톤으로 보강 |
| R20 | 🟡 | `ApmMetricAllowlist.java:305-310` | `k8s.pod.cpu.usage` 등 4개를 slot `"kubernetes"`(SLOT_* 상수 아님)로 허용목록에 넣었다 | kubeletstats 지표에는 `service.name`이 없어 **어차피 UNKNOWN_SERVICE로 폐기**된다 → 실효 없이 폐기 통계만 부풀린다(계약 §7-10이 인정한 문제를 스스로 키운다). 또 pod 이름을 dim으로 선언해 저장되는 경우 카디널리티가 파드 수명대로 늘어난다 | 실제로 저장·조회하지 않는 4개는 허용목록에서 뺀다. 남기려면 slot 상수를 만들고 조회 경로를 함께 만든다 |
| R21 | 🟢 | `core/metric/ApmHistBoundsCatalog.java:134` | `isCanonical`에 `rum_ms`/`rum_score`가 빠졌다 | `CanonicalBounds` 주석이 "패밀리를 더하면 그쪽도 같이 고쳐라"고 명시한 지점. 지금은 RUM이 `ApmHistogramMerger`를 안 써서 영향이 없다 | 다음 손볼 때 함께 추가 |
| R22 | 🟢 | `ApmHistBoundsCatalog.java:55-57` | CLS 격자에 `isMillis()==true`를 돌려준다 | 배율 1을 얻으려는 의도된 편법이고 결과는 맞지만, 이름이 "이 값은 ms다"라고 거짓말한다. `ApmApdex:90` 같은 다른 소비자가 생기면 축 라벨이 틀어진다 | `scale()` 또는 `isUnitless()`로 축을 하나 더 나누는 편이 정직하다 |
| R23 | 🟢 | `ApmRumIngestController.java:120-130` | 503(`RumRateLimiter` 전역 10,000 토큰 초과)이 `RUM_INVALID_PAYLOAD`로 집계된다 | 폐기 통계 해석이 틀린다(계약 §1 목록에 없는 사유 매핑) | `default` 대신 503 전용 분기 또는 미기록 |
| R24 | 🟢 | `ApmRumIngestController.java:128` | 토큰을 못 찾은 거부는 `token_id=0`으로 폐기 통계에 남는다 | `apm_ingest_drop_stat`에 FK가 없어 에러는 안 나지만, 화면에 존재하지 않는 토큰 0이 뜬다 | 계약에 "미상 토큰 = 0" 규약을 적거나 기록하지 않는다 |
| R25 | 🟢 | `snippet/RumSnippetService.java:34` | `cspConnectSrc`가 MovesEye origin 하나뿐 | 계약 §5는 "MovesEye origin + 백엔드 origin"이라고 적었다. BE가 백엔드 origin을 알 수 없으므로 코드가 맞고 **계약 문장이 과장**이다 | 계약 §5 문장을 "MovesEye origin을 제공하고 백엔드 origin은 notice로 안내한다"로 정정 |

---

## 2. 설계서 §15 항목별 준수

| §15 항목 | 계약 | 구현 | 판정 |
|---|---|---|---|
| 토큰 종류 분리 | Collector와 **다른 종류**, scope=rum, origin 바인딩, 회수 가능 | `apm_receive_token` 재사용 + `kind=RUM`·`scopes=["rum"]` 고정. `usable()`이 kind·scope·회수를 모두 검사하고 `RumTokenServiceTest`가 COLLECTOR/ingest/deploy/혼합 scope/회수 5조합을 막는 것을 고정 | ✅ (별도 테이블 대신 재사용 — 계약서 §1이 근거를 밝힘, 타당) |
| 경로 | P4에서 택1, 기본 BE 직접 `/apm/rum/v1/*` | BE 직접. premium 안 전용 `SecurityFilterChain @Order(1)` | ✅ |
| origin 정확 매칭 | scheme/host/port 전체, wildcard·path·query·fragment·userinfo·null·중복 불가 | `RumOriginPolicy.valid/allows` + `Collections.list(getHeaders("Origin")).size()==1`. `RumSecurityTest`가 14가지 우회 문자열을 고정 | ✅ |
| `Origin` 없는 요청 거부 | 필수 | `validOrigin()` → 403, MVC 테스트 `missingOriginIsActual403` | ✅ |
| CORS preflight | 정확 origin 반영, Allow-Credentials 미전송 | 구현·테스트 모두 있음 | ✅ |
| **토큰 존재 비노출** | (검수 기준 §1, 레포 관례 `ApmOtlpController:399`) | 401(없음) vs 403(origin 불일치)로 **구분된다** | ❌ **R4** |
| rps 상한 | 토큰별, 초과 429 + 폐기 카운터 | 1초 슬라이딩 창, Retry-After=1, `RUM_RATE_LIMITED` 기록. 초 경계 이중 허용 없음이 테스트로 고정 | ✅ |
| 본문 크기 상한 | 토큰별, 초과 거부 | 상한 스트림(`bounded`) + gzip 회선 min(limit,2MB) + 해제 후 limit → 413 | ✅ (단 R11: form-urlencoded 선행 파싱) |
| 일 건수 상한 | 토큰별, 초과 429 | UTC 일별, Retry-After=자정까지 초. 단일 노드·재시작 초기화를 계약 §1·§7-3이 명시 | ✅ |
| `traceparent`·`tracestate`만 허용 | 나머지 헤더 속성 삭제 | `RumSanitizer.spanAttrs` 허용목록 + traceparent 형식·zero-id 검증 + traceId 일치 검사 | ✅ |
| `url.query` 제거 | 필수 | 디코딩 **후** `split("[?#]")` — 중첩 percent 인코딩 우회 차단 | ✅ |
| path ID 정규화 | `/\d+/` → `/{id}/`(그룹화 겸용) | 숫자·8자+hex·UUID·긴 base64·JWT·`@`·`;`·`%`·제어문자·80자 초과 → `{id}`, `..` 정규화, 최대 512자 | ✅ (설계보다 강함) |
| IP 미저장, 국가만 | 필수 | 원문 IP를 어디에도 쓰지 않음. `CF-IPCountry`→`Accept-Language` 순, ISO 국가만. "GeoIP 아님"을 계약 §1·§7-7이 명시 | ✅ |
| `enduser.id` 해시 | 필수 | 토큰별 SHA-256(`tokenId + "\n" + value`). `session.id`도 동일 | ✅ |
| 동의·CSP | 스니펫에 동의 훅 + CSP `connect-src` | `consentGranted` 기본 false·export 게이트·철회 shutdown, `cspConnectSrc`+4개 notice | ✅ (R25는 계약 문장 쪽 과장) |
| 수신 데이터 범위 | Web Vitals·navigation/resource·JS 에러(4KB)·프론트 스팬만. **세션 리플레이·입력값 금지** | 저장 스키마 자체에 원문 URL/UA/본문 칸이 없다. 스택은 4KB(`octet_length` CHECK로 DB도 강제), 메시지 줄 폐기 시도 | ⚠️ **R9**(`@` 포함 메시지 줄 통과) 외 준수 |
| 500 금지 | JSON=400 / 미지원 타입=415 / 내부 실패=503 | `catch(Exception)→503`, MVC 테스트가 500 없음을 고정 | ✅ (단 잘못된 UTF-8은 `CharConversionException`이라 400이 아닌 503으로 샌다 — 🟢) |
| A1~A5 우회 없음 | `@LicenseExempt`는 스스로 라이선스 확인 | `MACHINE_CLIENT_CLASSES`에 1줄 추가(기존 3건과 동일 근거). A5-c가 메서드 전수로 검사하고, 세 진입점 모두 `licenseProvider.current().allows(APM)`를 직접 호출한다. A1(premium 밖→premium 의존) 위반 없음: `JwtAuthFilter`는 문자열 경로만 본다 | ✅ |
| JwtAuthFilter 변경이 기존 인증을 약화시키지 않는가 | — | 변경은 `resolveToken` 첫 줄의 `/apm/rum/v1/` 조기 `return null` **한 줄**. 인증을 넓히지 않고 좁히기만 하며, 그 경로는 전용 체인이 permitAll로 받는다. `@Component` 자동 등록 때문에 이 스킵이 실제로 필요하다(없으면 RUM Bearer를 JWT로 오인해 Redis/Zabbix까지 간다) | ✅ (다만 **테스트 0** — §6 B1) |

---

## 3. 데이터 정합 확인 결과

| 항목 | 결과 |
|---|---|
| 5분 UPSERT 멱등·동시성 | ✅ `apm_rum_receipt` PK로 배치 중복을 막고, 같은 트랜잭션이라 실패 후 재전송이 영수증에 걸리지 않는다. 동시 같은 버킷은 유니크 인덱스 대기 → 한쪽만 반영. `RumSchemaIT`의 `concurrentDuplicateDeliveryCommitsExactlyOnce`가 실제 PG로 고정(변이 실험에서 검출됨) |
| 히스토그램 bounds 규약 | ✅ `RumVital.bounds()`(CanonicalBounds×1000 ∪ Web Vitals 임계) == V57 시드임을 `RumSchemaIT:73-75`가 **패밀리별로 대조**한다. `CanonicalBounds`가 경고한 "DB 사본 drift"를 정확히 막았다. 부동소수 환산도 전부 정확값으로 떨어진다(0.075×1000=75.0 등 검산 완료) |
| mixedBounds / min·max | ✅ 조회는 bounds_id 불일치·길이 불일치·패밀리 불일치를 mixed로 올려 p75/분포를 null로 만든다. 적재 UPSERT의 `case when … is null then null` 병합이 "일부 표본의 min/max로 전체를 잘못 클램프"하는 것을 막는다(설명 주석도 정확) |
| Web Vitals 임계 | ✅ LCP 2500/4000 · INP 200/500 · CLS 0.1/0.25 · TTFB 800/1800 · FCP 1800/3000. **전부 격자 경계에 실제로 존재**한다(경계 포함 판정이 보간 없이 정확해진다) |
| samples=0 → good/needs/poor null | ✅ `countAtOrBelowMs`가 total<=0에 null. `good!=null && throughNeeds==null` 조합은 불가능(같은 hist·bounds) → 언박싱 NPE 없음 |
| 세션 "버킷별 distinct 합"의 정직성 | ✅ `sessionMode="DISTINCT_PER_PAGE_DIMENSION_5M_SUM"`를 Pages·Series·Detail 응답에 실어 보내고 계약 §3·§7-4·FE 요청사항에 과대계상임을 명시 |
| 브라우저 스팬 7일 + 트레이스 연결 | ✅ 별도 테이블·7일 파티션, 서버 스팬 존재 시에만 조인, 중복 spanId는 서버 우선, 없는 부모를 만들지 않음, `serviceUid=null`+`label="Browser"`. orphan(서버 스팬 없음)은 아예 안 붙인다 | 
| V57 파티션·retention 편입 | ✅ `PARTITIONED_TABLES` 6개 추가, `ApmRetentionJob`에 `rumPartitions`(30일/스팬 7일)·`rumErrors`(90일) 스텝 추가. `apm_rum_js_error_group`은 비파티션이라 DELETE + `last_seen_at` 인덱스 |
| drop stat signal=RUM | ✅ `ApmIngestSignal.RUM` 신설, 6개 사유 전부 사용. `PII_REMOVED`는 속성 제거 수(근사)임을 계약이 명시 | 
| 예산 차감 시점 | ⚠️ `limiter.observations`가 `store()` **앞**이라 503 후 재전송이 예산을 두 번 먹는다. 계약 §1·§7-3이 인정한 설계이므로 결함은 아니나, R1처럼 503이 잦아지면 체감된다 |
| 절단 정책 | ❌ **R6** — 최신이 아니라 최오래를 남긴다 |

---

## 4. 코덱스 자진 신고 4건 판정

계약 §7의 "불안한 지점" 중 사용자가 지목한 4건(1·2·3·10)에 대한 판정이다.

| # | 코덱스 신고 | 판정 |
|---|---|---|
| §7-1 브라우저 exporter→CORS→BE→백엔드 전파 E2E·CSP·동의 철회 미검증 | "MockMvc가 실제 필터 체인을 검증하지만 브라우저 번들 실행과 같지 않다" | **정확하나 과소평가.** MVC 테스트는 `@ContextConfiguration(classes={ApmRumIngestController, RumSecurityConfiguration})`만 올린다 — **실제 앱의 체인도 JwtAuthFilter도 안 들어간다**. 즉 "실제 필터 체인"이라는 표현이 과하다(§6 B1에서 실증). 추가로 스니펫은 **버전 미고정 2.x API**(R16)라 번들 실패 확률이 낮지 않다 |
| §7-2 실 K8s RBAC/TLS/메타데이터·k8s_cluster 분리 미검증 | "생성기는 설정을 만들며 배포하지 않는다" | **불충분하다.** 미검증인 것이 배포뿐이라는 뉘앙스인데, 실제로는 **읽는 이름 자체가 틀렸다**(R2·R5) — 공식 문서만 확인해도 잡히는 항목이라 "실 클러스터 미보유"로 미룰 수 없다. 추가로 kubelet serving 인증서는 보통 ServiceAccount CA로 검증되지 않으므로 `insecure_skip_verify:false`+`ca_file: serviceaccount/ca.crt` 조합은 실제로 자주 실패한다 — NOTICE에 대처법이 필요하다 |
| §7-3 인메모리 일 제한의 다중 노드·재시작 초기화 | "현재 단일 노드 전제" | **타당하고 문서화도 충분.** 계약 §1 표·본문·§7에 세 번 적혔고 클래스 주석에도 있다. 다만 preflight에는 제한이 아예 없다는 사실(R12)이 신고에서 빠졌다 |
| §7-10 service.name 없는 cluster 지표가 UNKNOWN_SERVICE 폐기 통계에도 잡힌다 | "운영 drop 통계 해석 시 이 경로를 구분하는 후속 검수 필요" | **인지는 정확하나 코드가 그 인지와 반대다.** `kubernetes.observe(points)`는 `ingestor.ingest()` **뒤에** 놓여 있어 두 경로를 가르지 않고, 오히려 R20(쓰지도 않는 4개 지표 허용목록 추가)으로 폐기 통계를 더 부풀린다. 그리고 그 배치가 R1(무방비 예외)의 원인이기도 하다 — **이 한 줄의 위치가 세 문제의 공통 뿌리**다 |

---

## 5. 규약 준수

| 항목 | 판정 |
|---|---|
| 패키지 구조(§0.5-6/7) | ⚠️ `premium/apm/rum/{ingest,page,security,snippet,token}` 세트 구조는 맞음. **package-info 없음**(R19) |
| DTO 평면 | ✅ `RumQueryDto`가 중첩 record 컨테이너, 필드 전부 평면. Lombok boolean is- 함정 없음(record) |
| 권한 view/edit 축 | ✅ 조회 5 EP = `requireRead`, 토큰·origin·스니펫 6 EP = `requireEdit`. 역할 문자열 직접 비교 없음 |
| 200 + 바디 code | ✅ 관리 API는 `ApiResult` + `APM_RUM_INVALID`(ErrorCode 신설). 공개 수신만 실제 상태 — 계약이 그 경계를 명시하고 `LicenseArchitectureTest`가 강제 |
| 상세 주석 톤 | ❌ R19 — 레포의 다른 APM 코드와 톤이 확연히 다르다 |
| 계약 §DTO·예시·null 규약 | ✅ 대부분 완결. ⚠️ 다만 `Timing`·`ErrorGroup`은 **표본 JSON에서 빈 배열**이라 필드명·`sampleStack:null`·시각 포맷이 어디에도 고정돼 있지 않다 → FE가 추측하게 된다 |
| 표본 JSON 9종의 fixture 편입 | ⚠️ 7종이 `ApmContractFixtureTest.rumContracts`, 나머지 2종(`rum-ingest-*.json`)은 `RumParserTest`가 쓴다 — 9종 모두 테스트가 소비하므로 실질 충족. 단 fixture 테스트는 **손으로 만든 DTO ↔ 손으로 만든 JSON** 대조라 "서비스가 그 모양을 만든다"는 것은 증명하지 않는다(기존 관례와 동일) |
| 설치 출처 `references` 패턴 재사용 | ✅ `ApmDocRef` 3건 추가 + `ApmInstallGuideDto.Reference` 재사용. 폐쇄망 미러 안내까지 기존 톤 유지 |

---

## 6. 테스트 검출력 (직접 실행 + 변이 실험)

**기준 재현**: `JAVA_HOME="C:/Program Files/Java/jdk-17" ./gradlew.bat :test` → **3,051 tests / 301 suites, fail 0, error 0, skipped 0, BUILD SUCCESSFUL (3m 21s)**. 코덱스 보고와 정확히 일치. `RumSchemaIT` 6건·`ApmKubernetesMetricObserverIT` 1건도 **실행**됐다(`IntegrationTestSupport`가 dev 컨테이너 5433에 일회용 `moveseye_it` DB를 매번 drop/create — dev DB 본체는 건드리지 않는다).

### 변이 A — 잡힐 것으로 본 가드 4개: **전부 검출** ✅

| 변이 | 결과 |
|---|---|
| `RumOriginPolicy.allows` 정확 매칭 → 접두 매칭 | ❌ `RumSecurityTest[3] good.test.evil.test`, `[8] good.test:443` FAILED |
| `ApmInstance` 재시작 증가 판정 제거(항상 스탬프) | ❌ `ApmKubernetesContextTest` 2건 FAILED |
| `RumParser` CUMULATIVE 폐기 제거 | ❌ `RumParserTest.cumulativeHistogramIsDroppedInsteadOfDoubleCounted` FAILED |
| `RumStore` 영수증 중복 제거 무력화 | ❌ `RumSchemaIT.upsertDeduplicates…`, `…concurrentDuplicateDeliveryCommitsExactlyOnce` FAILED |

→ 3,051 tests, **7 failed**. 핵심 가드의 검출력은 실증됐다.

### 변이 B — 의심 지점 5개: **전부 생존** ❌ (테스트 공백)

| 변이 | 결과 | 뜻 |
|---|---|---|
| B1 `JwtAuthFilter`의 `/apm/rum/v1/` 스킵 제거 | BUILD SUCCESSFUL | **보안상 가장 민감한 한 줄에 테스트가 0개다.** 누가 되돌려도 아무도 모른다(운영에서는 RUM Bearer가 JWT로 오인돼 로그 오염·불필요한 Redis/Zabbix 호출) |
| B2 preflight 미상 토큰 401 → 403 | BUILD SUCCESSFUL | R4를 **비용 0으로 고칠 수 있다**는 증명이자, 401/403 분기가 계약에 고정돼 있지 않다는 뜻 |
| B3 collector yaml에 `k8sattributes` 파이프라인 주입 제거 | BUILD SUCCESSFUL | `ApmKubernetesConfigTest`는 receiver/processor **정의** 존재만 본다. 파이프라인에 실제로 꽂혔는지는 아무도 안 본다 — 문자열 `replace` 기반이라 템플릿이 조금만 바뀌면 조용히 빠진다 |
| B4 수신 응답의 `Vary` 헤더 제거 | BUILD SUCCESSFUL | 계약 §2가 명시한 헤더인데 미검증(CDN/프록시 캐시 오염 위험) |
| B5 토큰 발급 응답의 `Cache-Control: no-store` 제거 | BUILD SUCCESSFUL | 계약 §1 "발급/스니펫 응답은 no-store"가 미검증. **원문 토큰이 담긴 응답**이라 실질 위험 |

### 원복 증명
변이 파일은 전부 백업본으로 되돌렸고, 최종 상태는 **`git status` 45항목 / `git diff --stat` 29 files, 454 insertions(+), 97 deletions(-)** 로 변이 전과 동일하다. 최종 `:test` 재실행도 **3,051 / 0 fail / 0 error / 0 skip, BUILD SUCCESSFUL**.

> ⚠️ 검수 중 실수 1건 공개: `ApmInstance.java`를 원복하려다 `git checkout --`을 써서 코덱스의 수정을 한 번 날렸고, 캡처해 둔 diff로 **바이트 동일하게 복원**했다(같은 40 insert / 2 delete). 복원 과정에서 이 파일 하나만 줄바꿈이 LF→CRLF로 바뀌었다(`core.autocrlf` 정규형이라 `git diff` 내용은 동일하고, 다른 수정 파일과 달리 LF 경고 목록에서만 빠진다). 커밋 전에 코덱스가 이 파일을 한 번 눈으로 확인해 주면 좋겠다.

---

## 7. 병합 전 반드시 고칠 것 — 코덱스에게 보낼 지시문

> P4 검수 결과다. 아래 4건은 병합 전 필수, 5~9번은 같은 라운드에서 함께 처리하기를 권한다. 코드는 내가 건드리지 않았고 워킹트리는 검수 전과 동일하다(29 files / 454+ / 97-).
>
> **필수 1 — `MetricIngestPipeline:101`의 `kubernetes.observe(points)`를 무방비로 두지 말 것.**
> 이 호출은 `ingestor.ingest()`(이미 커밋) 뒤, `receiptService.record()` 앞에 있다. 여기서 예외가 나면 `ApmOtlpController`가 503을 주는데 영수증이 없어 exporter 재전송이 중복 판정을 통과하고, 메트릭 sum/histogram이 **이중 계산**된다. `ApmRumIngestController.record()`와 같은 방식으로 `try{...}catch(RuntimeException e){log.warn(...)}`로 감싸거나 `ingestor.ingest()` 앞으로 옮겨라. "보강 실패가 수신 상태를 바꾸지 않는다"는 규칙을 이 줄에도 적용한다.
>
> **필수 2 — K8s OOM은 지금 절대 켜지지 않는다.**
> `ApmKubernetesMetricObserver:20-21`이 `k8s.container.status.last_terminated_reason`을 **메트릭 이름**으로 찾는데, contrib `k8sclusterreceiver`에서 그것은 **Resource Attribute이고 기본 비활성**이다(`k8s.container.status.reason`이라는 메트릭은 아예 없다). 생성 yaml도 그 속성을 켜지 않는다. 둘 중 하나를 해라: ① 생성 yaml의 `k8s_cluster`에 해당 resource_attribute를 `enabled: true`로 명시하고 관측기를 **`k8s.container.restarts` 포인트의 리소스 속성**에서 이유를 읽도록 고친다, ② 못 하면 계약 §6·`ApmInstanceRowDto`·FE 요청사항에서 OOM을 빼고 "미지원"으로 적는다. **지금처럼 계약서에만 있는 상태로 병합하지 말 것.** 테스트(`ApmKubernetesContextTest`, `ApmKubernetesMetricObserverIT`)는 그 지어낸 이름을 스스로 먹여서 통과하므로 초록이 증거가 되지 못한다.
>
> **필수 3 — OOM 시각이 레벨 트리거다.**
> `ApmInstance.observeKubernetes`와 관측기 둘 다 `containerOomAt = at`을 **관측마다** 갱신한다. lastState 이유는 컨테이너 수명 내내 반복 보고되므로 필수 2를 고치는 순간 배지가 영구히 켜지고 시각은 항상 "방금"이 된다. 재시작처럼 **에지 판정**으로 바꿔라 — restart count가 증가한 관측에서만, 또는 `(pod, restart_count)` 쌍이 바뀐 경우에만 찍는다.
>
> **필수 4 — preflight가 토큰 존재 여부를 알려 준다.**
> `RumTokenService.preflight()`는 없는/RUM 아닌/회수된 id에 401, `ApmRumIngestController.origin()`은 origin 불일치에 403을 준다 → 임의 Origin으로 tokenId를 훑으면 살아 있는 RUM 토큰이 열거된다. `ApmOtlpController:399`가 같은 레포에서 "🔴 사유를 응답에 적지 않는다(토큰 존재 여부를 알려 주지 않는다)"고 못 박은 원칙이다. **둘 다 403으로 합쳐라**(POST의 Bearer 인증 실패만 401 유지). 내가 변이로 확인했는데 이 변경은 **깨지는 테스트가 하나도 없다** — 동시에 그건 이 동작이 어디에도 고정돼 있지 않다는 뜻이니, 바꾸면서 "미상 토큰과 origin 불일치는 구분 불가"를 고정하는 테스트를 하나 추가해라. 계약 §2 상태 표도 함께 정정.
>
> **함께 처리 권장**
> 5. `container.restart_count` → semconv 정본은 **`k8s.container.restart_count`**다(k8sattributes README). 허용목록·`ApmInstance`·`ApmSpanAttrAllowlist`·`TraceIngestPipeline` 네 곳과 테스트를 정본 이름 기준으로 바꾸고, 구 이름은 폴백으로만 둔다.
> 6. `RumQueryService.load()`의 절단이 **최신을 버리고 최오래를 남긴다**(`order by bucket asc` + `limit CAP+1`). 30일 창에서 "최근이 안 보이는" 화면이 된다 — 뒤에서 자르도록 바꿔라.
> 7. `ApmTraceQueryService`의 RUM 조인 두 서브쿼리에 **시간 조건이 없다**. 트레이스 상세 매 요청이 파티션 전체를 훑는다(RUM 0건 설치본 포함). `start_ts` 창을 걸고 `apm_rum_span(group_id, start_ts)` 인덱스를 V57에 추가해라(V57은 아직 미커밋이니 같은 파일에서 가능).
> 8. 테스트 공백 5개를 메꿔라 — 내 변이가 전부 살아남았다: ① `JwtAuthFilter`의 `/apm/rum/v1/` 스킵(**보안상 가장 민감한 한 줄인데 테스트 0**), ② preflight 401/403 비구분, ③ 생성 yaml의 metrics/traces 파이프라인에 `k8sattributes`가 실제로 꽂히는지(`ApmKubernetesConfigTest`는 정의 존재만 본다), ④ 수신 응답 `Vary`, ⑤ 토큰 발급 응답 `Cache-Control: no-store`(**원문 토큰이 담긴 응답**이다).
> 9. `rum/package-info.java`를 추가하고 `RumParser`·`RumStore`·`RumRateLimiter`의 판단 근거 주석을 레포 톤(`CanonicalBounds`·`ApmPercentiles` 수준)으로 보강해라. 지금 RUM 패키지만 한 줄 압축형이라 다음 사람이 읽는 비용이 여기서만 급등한다.
>
> **계약서 정정 요청(코드 아님)**
> - §3에 "트레이스 **상세** summary는 Browser 행을 포함해 재계산된다(저장 summary·RED·서비스 맵은 불변)"를 추가 — 현재 문장은 안 섞는다고 읽힌다.
> - §5의 "CSP connect-src에 MovesEye origin + 백엔드 origin을 넣는다"는 코드와 다르다(백엔드 origin은 BE가 모른다) → "MovesEye origin을 제공하고 백엔드는 notice로 안내한다"로.
> - §4 표본에 `Timing`·`ErrorGroup`이 **빈 배열**이라 필드명·`sampleStack:null`·시각 포맷이 어디에도 고정돼 있지 않다 → `rum-detail.json`에 각 1건씩 채워 넣어 FE가 추측하지 않게 해라.
> - §1 스니펫 npm 설치 명령에 **버전 고정이 없다**. 코드는 OTel JS 2.x API(`resourceFromAttributes`, `spanProcessors` 생성자 옵션)를 쓰므로 1.x를 받은 고객은 즉시 깨진다.

---

## 8. 검수 범위 밖(미검증)

- 실제 브라우저 번들 실행·실 CORS·CSP·동의 철회 E2E.
- 실 K8s 클러스터 배포·RBAC·kubelet TLS(위 R2는 **공식 문서 대조**로 판정한 것이며 클러스터 실측이 아니다).
- 다중 BE 노드에서의 레이트리밋 거동.
- FE 연동(계약 소비 쪽)은 이번 범위가 아니다.
