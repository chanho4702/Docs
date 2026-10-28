# 검수 — APM P5.1 1단계 "P5 기본 OFF 상태의 수신 관문"(BE)

- **대상**: worktree `C:\solutions\moveseye-be-spring-p5`(브랜치 `p5-live`, master `c6b7a14` 기준, 미커밋 작업 상태)
- **구현**: Codex(gpt-6-astra) / 구현 보고 `_archive/features/apm/realtime/review_apm-p51-s1-be_codex-impl.md`(수정 4 · 신규 10 · 테스트 7)
- **정본**: `features/apm/realtime/devdesign_apm-realtime.md` §2.3 · §2.3.0 · §3.1 · §3.3 · §3.4 · §7.1 1단계 행(v4.1 편집 중) · 코덱스 r3 §4.3 1번 행 · 구현 프롬프트(`codex_impl_p51_be.md`)
- **검수 방식**: 읽기 전용(코드 무수정) + 선별 테스트 재실행 + 변이 3건(적용→실행→복원, md5 대조)
- **일자**: 2026-09-15 / 검수자: Claude

---

## 0. 판정 요약

| 등급 | 건수 | 내용 |
|---|---:|---|
| 🔴 | **3** | 압축본 상한 `@Max`가 R-P5b 2 MiB를 코드 변경 없이 막음 · 무압축 경로 동시 수 무제한(§5.2 힙 예산 불성립) · 파서가 ID를 **거절 대신 조용히 절단** |
| 🟡 | **9** | 경계 테스트 리터럴 하드코딩 · guard/Security 경로 매처 불일치 · 카운터 사유 2건 합쳐짐 · 404/405→503 · 상호참조 3건 깨짐 · 외 4 |
| 🟢 | 주요 12축 | 보안 경계 · 저장 경로 불변 · envelope 미유입 · 상한 즉시 중단 · 세마포어 반납 · 스트리밍 파서 · 라이선스 A1~A5 · 응답 규약 · 카운터 스레드 안전 · 로그 잔존 0 · `git diff --check` · 소켓 IT 포트 |

**병합 가능 여부**: 🟢 **조건부 가능**. 1단계는 `enabled` 기본 false이고 6단계 전까지 어떤 Collector도 이 경로로 보내지 않으므로 **지금 커밋해도 런타임 위험은 0**이다. 다만 🔴-1은 정본 v4.1 §7.1이 "1단계에 반영하라"고 명시한 값이라 **같은 수정 라운드에서 반드시 처리**해야 하고, 🔴-2·🔴-3은 `enabled=true`가 되는 시점(2~4단계) 전에 닫혀야 한다. 커밋을 먼저 내고 수정 라운드를 별도 커밋으로 붙이는 순서를 권한다(정본이 그 순서를 허용한다 — "1단계 커밋이 이미 524,288로 나갔다면 별도 커밋으로 정정").

---

## 1. 🔴 상세 (재현 · 수정안)

### 🔴-1 압축본 상한이 `@Max(524288)`로 못 박혀 R-P5b의 2 MiB를 **설정으로도 우회할 수 없다**

- **위치**: `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ApmLiveSpansProperties.java:14`, `:21` / `src/main/resources/application.yml:139`
- **근거**: 정본 v4.1 §7.1 1단계 행 상단 경고 + §2.3.0 표 — `max-compressed-bytes` **524,288 → 2,097,152**. R-P5b `features/apm/realtime/r-p5b_apm-live-yaml-correctness.md` 발견 ⑥: 정본 yaml을 통과한 **정상 입력**(난수 값 · 그룹 = 스팬 수 · 1,000스팬 · live-safety 전부 통과)의 gzip이 **572.4 KiB**라 512 KiB 관문에서 413이 난다.
- **왜 단순 기본값 변경이 아닌가**: `@Max(2097152) Integer maxBodyBytes` / `@Max(524288) Integer maxCompressedBytes`로 **검증 상한 자체가 524,288**이다. 즉 운영자가 `APM_LIVE_SPANS_MAX_COMPRESSED_BYTES=2097152`를 넣으면 기본값이 바뀌는 게 아니라 **기동이 실패한다**(`unsafeSettingsFailStartup`이 같은 메커니즘을 증명). 임시 회피 경로가 없다.
- **재현**: `ApmLiveSpansPropertiesTest`에 `max-compressed-bytes=2097152`를 넣으면 `hasFailed()`가 된다. 실제 배치는 `ApmOtlpLiveControllerTest.lowCompressionPayloadIsCheckedIndependently(900000)`가 이미 "413이 정답"으로 고정해 둔 상태다 — R-P5b 이후 이 fixture의 **정답이 200으로 뒤집힌다**.
- **수정안(수정 라운드)**: ① `@Max(524288)` → `@Max(2097152)`, 기본값 `524288` → `2097152` ② `application.yml:139` 값과 주석("압축본 상한 = 해제 후 상한과 동일 · gzip 폭탄의 **회선 읽기 유계용**이지 크기 축소용이 아님") ③ 경계 테스트 3곳(`compressedBoundary` `@ValueSource(524287,524288,524289)` → `2097151/152/153`, `missingOrDishonestLengthStillCountsWire`의 `gzipAt(524289)`·기대 read 수, `lowCompressionPayloadIsCheckedIndependently`의 `> 524288` 비교와 `size == 900000` 어서션) ④ `ApmLiveSpansPropertiesTest:23`의 기대값 ⑤ **함께 따라오는 힙 영향**은 🔴-2 참조.

### 🔴-2 무압축 경로에 동시 수 상한이 전혀 없다 — §5.2의 "동시 해제 4 × 2 MiB = 8 MiB" 예산이 성립하지 않는다

- **위치**: `LiveBodyReader.java:50`
  ```java
  if (gzip && !decompress.tryAcquire()) throw LiveIngestException.busy();
  ```
- **문제**: 세마포어는 **gzip 요청에만** 걸린다. 무압축(`Content-Encoding` 없음 또는 `identity`) 요청은 **무제한 동시 수용**되며 각각 `wire`(ByteArrayOutputStream)에 최대 2 MiB를 힙에 쌓는다. 즉 유효 토큰을 가진 클라이언트가 `Content-Encoding`만 빼면 슬롯 제한을 통째로 우회한다. Servlet 비동기 읽기라 Tomcat 스레드 수가 상한 역할을 하지도 않는다(`maxConnections` 기본 8,192).
- **추가로, gzip 경로도 예산을 넘는다**(추정 아님 — 코드 산술): `onAllDataRead`에서
  ```java
  byte[] body = gzip ? inflate(wire.toByteArray()) : wire.toByteArray();   // :146
  ```
  `wire`의 내부 버퍼는 doubling으로 최대 ~2×상한, 거기에 `toByteArray()` **복사본**, 거기에 해제 결과가 동시에 살아 있고 `wire.reset()`은 `consumer.accept` **뒤** `finally`(:153)에서야 일어난다. 압축본 상한이 2 MiB가 되면(🔴-1) 슬롯당 피크 ≈ wire 4 MiB + 복사 2 MiB + 해제 2 MiB = **8 MiB**, × 4슬롯 = **32 MiB**. 정본 §2.3.0의 "압축본 상한 변경은 힙 임시 4 × 2 MiB에 영향 없음"은 **압축본 버퍼를 해제 전에 놓는 구현을 전제**하는데 이 구현은 그렇지 않다.
- **재현**: `enabled=true` 상태에서 유효 COLLECTOR/ingest 토큰으로 `Content-Encoding` 없이 2 MiB 본문을 초당 수십 건 동시 전송. 현재 테스트는 전부 단일 스레드 순차라 잡지 못한다.
- **수정안**: ① 세마포어를 **gzip 전용이 아니라 수신 전체의 admission**으로 올리거나(무압축용 별도 상한 신설), ② 해제 직전 `wire`의 내부 버퍼를 놓도록 `ByteArrayInputStream`을 `wire`에서 직접 만들고 복사를 없앤다(`wire.writeTo` / `toByteArray()` 회피), ③ Content-Length가 정직하면 그 값으로 `ByteArrayOutputStream` 초기 용량을 잡아 doubling 낭비를 없앤다, ④ §5.2 힙 예산 문장을 실제 피크로 갱신. **최소한 ①만이라도 2단계 착수 전에.**

### 🔴-3 파서가 ID·속성을 길이 초과 시 **거절하지 않고 조용히 절단**한다 — 2단계 dedup의 "전체 키 비교"와 충돌

- **위치**: `LiveSpanParser.java:122-124`(`scalar(parser, 32)` / `(…,16)`), `:191-200`(`scalar`), `:203-225`(`BoundedText`)
- **문제**: `BoundedText`는 상한에 닿으면 `full = true`로 **남은 문자를 버리고 정상 반환**한다. 예외가 없다. 따라서
  - 40자 traceId → 앞 **32자만** 남아 "정상적인 32-hex"로 보이는 값이 만들어진다.
  - 비-hex traceId(`"zzzz…"`)도 그대로 통과한다 — hex 검증이 어디에도 없다.
  - 같은 앞 32자를 공유하는 서로 다른 ID 둘이 **같은 키로 축약**된다.
- **왜 지금은 무증상인가**: 1단계에서 `scopes()`는 `span(parser)`의 반환값을 버리고 개수만 센다(`LiveSpanParser.java:102`). 그래서 런타임 영향 0이고 테스트도 통과한다. 그러나 정본 §3.3은 dedup을 "60초 내 같은 `(traceId, spanId)` **전체 키 비교**"로, §2.4는 "ID 재사용 금지"로 못 박았다 — 절단된 키는 그 약속을 깬다.
- **재현**: `LiveSpanParserTest.allowedHugeStringIsRetainedOnlyUpToUtf8Limit`가 이미 이 동작을 **정답으로 고정**해 두었다(`http.route` 100,000자 → 255바이트 반환, 예외 없음). traceId로 같은 입력을 넣으면 동일하게 32자로 접힌다.
- **수정안**: route·instance 같은 **표시용 값은 절단이 맞지만**(§3.3 "잘라서 `__truncated__`"), `traceId`·`spanId`·`parentSpanId`는 **정체성 값**이라 규칙이 다르다. `scalar`에 "초과 시 예외" 모드를 추가하고 ID 3종은 `길이 == 32/16 ∧ [0-9a-fA-F]` 후조건 검사 → 위반은 `malformed`(또는 §2.3 `slimBypassed{formUnsafe}` 카나리아). `startTimeUnixNano`/`endTimeUnixNano`도 같은 이유로 `Long.parseUnsignedLong` 범위 검사가 2단계 전에 필요하다(현재 20바이트 길이 제한만 있어 `99999999999999999999`가 통과).

---

## 2. 🟡 상세

| # | 항목 | 위치 · 근거 | 조치 |
|---|---|---|---|
| 🟡-1 | **경계 테스트가 설정값 파라미터화되어 있지 않다**(검수 항목 2의 명시 질문에 대한 답: **아니다**) | `ApmOtlpLiveControllerTest.java:133,139,144,149,228` — `@ValueSource(ints = {524287, 524288, 524289})`, `size <= 2097152 ? 200 : 413`, `compressed.length > 524288` 전부 리터럴. `ApmLiveSpansPropertiesTest.java:22-26`도 리터럴 | 🔴-1 수정 시 5곳을 손으로 맞춰야 한다. `properties.maxCompressedBytes()`에서 읽는 헬퍼로 바꾸면 상한 변경이 한 곳이 된다 |
| 🟡-2 | **guard 필터와 SecurityConfig의 경로 매처가 다른 소스를 쓴다** | `LiveIngestGuardFilter.java:25` — `request.getRequestURI().substring(contextPath)`(**raw·미디코드**). SecurityConfig는 AntPath(디코드된 servletPath+pathInfo) | `POST /apm/otlp%2Dlive/v1/traces`는 permitAll은 받고 guard는 비켜 간다 → 그 경로에서만 사람용 envelope 차단망이 없다. Collector는 이렇게 보내지 않아 실사용 영향은 없으나, 두 매처는 같은 소스(`ServletRequestPathUtils` 또는 공유 `RequestMatcher`)를 써야 영영 갈라지지 않는다 |
| 🟡-3 | **카운터 사유 2건이 다른 사건과 합쳐진다** | `LiveIngestException.java:26` 408 타임아웃 → `malformed` / `LiveIngestResponses.java:64` 내부 장애 503 `APM_LIVE_UNAVAILABLE` → `busy` | 코덱스가 408은 공개했고 503은 안 했다. 후자가 더 나쁘다 — 파서 내부 결함이 "동시 해제 초과"로 읽힌다(정본 §2.3은 둘을 명시적으로 구분한다). 사유 enum에 `readTimeout`·`internal` 2종 추가를 2단계 범위로 제안(8종은 프롬프트가 고정한 것이므로 정본 §2.3 거절 사유 목록 갱신과 함께) |
| 🟡-4 | **404·405가 503으로 바뀐다** | `LiveIngestGuardFilter.java:53-56` — 화이트리스트 `400,401,403,408,413,415` 외 전부 `default -> 503` | Collector 경로 오타(`/v1/trace`)가 404가 아니라 `503 APM_LIVE_REQUEST_REJECTED`로 나간다. §2.3이 경계하는 "설정 한 줄 누락이 조용한 폐기로 나타나는" 바로 그 모양이다. 화이트리스트에 404·405 추가 권장(사람용 envelope만 벗기고 상태는 보존) |
| 🟡-5 | **`allowedToIngest` 추출 과정에서 지식이 소실되고 상호참조 3건이 깨졌다** | 제거된 Javadoc(원본 `ApmOtlpController:449-457`)의 "V38 컬럼 주석은 '빈 배열 = 전부 허용'이라 적었지만 발급 경로는 `["ingest"]`를 채운다 — 그것을 전부 허용으로 읽으면 범위 확대 시 옛 행이 새 권한을 얻는다"가 `ApmIngestTokenPolicy.java:17` 한 줄로 축약됐다. 또 `ApmReceiveTokenDto.java:55`·`ApmReceiveTokenService.java:86`·`ApmDeploymentWebhookController.java:211`의 `{@code ApmOtlpController.allowedToIngest}` 참조가 **없는 메서드를 가리킨다** | 새 위치로 Javadoc 원문을 옮기고 세 파일의 참조를 `ApmIngestTokenPolicy.allowedToIngest`로 갱신. `{@code}`는 컴파일러가 안 잡는다 |
| 🟡-6 | **메서드 제거 자리에 빈 줄 2개가 남았다** | `ApmOtlpController.java:448`, `:511` (`git diff --check`는 잡지 못함 — 후행 공백이 아니라 빈 줄) | 커밋 전 정리 |
| 🟡-7 | **permitAll 회귀 검출이 성공 경로 2건에만 걸려 있다**(변이 M2 실증) | permitAll을 지우면 `sessionlessTokenCrossesRealSecurityAndLicenseInterceptors`·`realLicenseGateIs403`만 실패하고, `invalidReceiveTokenUsesOtlp401`은 **통과한다** — guard 필터가 JWT 필터의 401 envelope을 `{"error":…}` 401로 정규화해 어서션을 만족시키기 때문 | 검출력 자체는 충분하지만(2건이 잡음), "401 테스트가 permitAll을 지킨다"고 오해하지 말 것. `LiveIngestSecurityChainTest`에 "`$.error` 값이 `APM_LIVE_UNAUTHORIZED`"까지 못 박으면 3건이 된다 |
| 🟡-8 | **요청마다 `new ObjectMapper()` · 성공 요청에도 예외 객체 생성** | `LiveIngestGuardFilter.java:48`(정규화 경로 한정이라 영향 작음) / `LiveBodyReader.java:46` — `oversized`를 **모든 요청에서** 미리 만들어 스택트레이스를 캡처한다 | 핫 패스 할당. `fillInStackTrace` 억제(`super(msg, null, false, false)`) 또는 지연 생성 |
| 🟡-9 | **`LiveIngestSocketTest`의 시간 어서션과 기동 비용** | `:114` `isBetween(2초, 7초)` + `:77` 소켓 타임아웃 8초, 테스트마다 Tomcat 기동/종료 3회 | 포트 충돌은 **문제 없다** — `tomcat.setPort(0)` + `getLocalPort()`로 임의 포트를 쓴다 ✅. 다만 느린 CI에서 상·하한 어서션이 플레이키해질 수 있다. 하한(2초)은 "3초 타임아웃이 실제로 작동했다"는 증거라 유지 가치가 있고, 상한은 완화(7 → 12초 + 소켓 타임아웃 동반 상향)를 권함 |

부수 관찰(등급 없음): `onDataAvailable`의 `read`가 0을 돌려주면 deadline(3초)까지 바쁜 대기한다(`LiveBodyReader.java:128-135`) · 새 `live/` 패키지에 `package-info.java`가 없다(형제 `overview/live/`에는 있으나 부모 `collector/ingest/`에도 없어 규약 위반은 아님) · `SelectedSpan`과 속성 `HashMap`이 스팬마다 만들어져 즉시 버려진다(2단계 소비 예정이며 주석에 명시됨).

---

## 3. 검수 항목별 결과

### 3.1 보안 경계 ✅

- `/apm/otlp-live/**` permitAll(`SecurityConfig.java:80-81`)은 **인접 경로에 영향이 없다**. `LiveIngestSecurityChainTest:89-94`가 `/apm/live/stream`·`/apm/live/snapshot`·`/apm/otlp-live-extra/v1/traces` 셋 다 세션 요구(사람용 `{"status":"error"}`)를 유지함을 **실제 `SecurityConfig`+실제 `JwtAuthFilter`**로 증명한다. 주석도 AntPath `/` 경계 이유를 정확히 적었다.
- 토큰 판정 공용화(`ApmIngestTokenPolicy`)는 **로직이 1:1**이다(`bearer` 대소문자 무시 `regionMatches` · kind=COLLECTOR · scope=ingest · 빈 scope 거부). 저장 경로 `ApmOtlpControllerTest` 22건 전건 통과로 동작 불변 확인. 회수·해시 대조는 여전히 `ApmReceiveTokenService`가 담당하고 라이브도 그 401을 그대로 받는다(`ApmOtlpLiveControllerTest:94-104`가 `revokedAt` 실물 엔티티 + 실제 해시로 확인, `save` 미호출까지 검증).
- 라이선스: `@RestController` + 클래스 `@RequiresFeature(APM)` + 메서드 `@LicenseExempt` + `MACHINE_CLIENT_CLASSES` 등재 + 컨트롤러 직접 `licenseProvider.current().allows(Feature.APM)` — A2·A4·A5·**A5-c(면제 메서드 전수 라이선스 확인)** 규칙과 정확히 일치. 저장 경로(`ApmOtlpController:363-364`)와 **같은 술어**를 쓰므로 EXPIRED/ARCHIVED 단계적 차단(`state.allowsPremium()`)도 동일하게 걸린다. `LicenseArchitectureTest` 7건 통과.
- `OtelArchitectureTest` 2건 통과 — 새 코드가 `otel..`을 역방향으로 부르지 않고 `premium → otel`만 쓰므로 규칙 변경이 필요 없다(1단계 요구 충족).
- **사람용 envelope 미유입**: 필터 예외·`sendError`·200+`code:403` envelope·바인딩(`@RequestParam`)·본문(`@RequestBody`)·`@ModelAttribute`·Content-Type·컨트롤러 내부 예외 전 경로가 `{"error":…}`로 나가고 `success`/`data`/`status` 키가 없음을 `LiveIngestFailureTest` 15건 + 컨트롤러 테스트의 공통 어서션(`ApmOtlpLiveControllerTest:60-63`)이 **모든 요청에** 강제한다.
- **로그·예외 메시지 잔존 0**: `live/` 패키지 전체에 `log`·`Logger`·`@Slf4j`·`printStackTrace`·`getMessage()` 사용이 **하나도 없다**(grep). `LiveIngestException`은 `super(code)`만 담고, `classify`는 `ApiError.getErrorCode()`(코드)만 꺼내 메시지를 버린다 — `existingRevocationExceptionCodeIsPreservedWithoutMessage`·`preAuthenticationFilterExceptionIs503WithoutRawMessage`가 `"private-payload"` 미노출을 확인. ⚠️ 뒤집어 말하면 **이 경로의 운영 관측은 카운터뿐**이다(의도적, 정본 §2.3 "원문 미기록"과 정합).

### 3.2 본문 상한 · gzip 폭탄 ✅ (🔴-1 · 🔴-2 별도)

| 요구 | 결과 | 근거 |
|---|---|---|
| Content-Length 선검사 | ✅ | `LiveBodyReader.java:49`, 스트림을 **열기 전**에 거절(`contentLengthRejectsBeforeOpeningStream`이 `opened == false` 확인) |
| 거짓 Content-Length(없음·작게 속임) | ✅ | `:131-133` 상한+1바이트에서 정지. `missingOrDishonestLengthStillCountsWire`가 실제 읽은 바이트 수(524,289 / 2,097,153)까지 어서션 |
| 해제 **중** 즉시 중단 | ✅ | `:158-174` 8 KiB 블록마다 검사. 변이 M1로 검증(아래 §3.7) |
| 무압축 경로 | ✅ | 압축본 상한 미적용(`uncompressedIsNotSubjectToCompressedLimit`) |
| 비-gzip 415 · 본문 미읽음 | ✅ | `:86-93` — `br`·`deflate`·`zstd`·`gzip, gzip`·빈 값·`x-gzip`·헤더 2개 전부 415, `opened == false` |
| 세마포어 누수(예외·타임아웃·단절) | ✅ | `AtomicBoolean` 멱등 + `onAllDataRead` finally + `fail()` finally + **`onComplete`**(:194) 3중. `read()` 진입 실패(:63-71)도 반납 |
| 비동기 읽기 스레드 안전성 | ✅(경미한 경합 있음) | `done`/`released`는 `AtomicBoolean`. 타임아웃 스레드와 읽기 스레드가 동시에 `fail`해도 CAS로 하나만 승리. `wire`·`buffer`는 컨테이너 읽기 스레드 전용(`onAllDataRead`도 같은 스레드) ✅. 다만 타임아웃 확정 직후에도 읽기 스레드가 루프 한 번을 더 돌 수 있고(`!done.get()`은 루프 상단에서만 확인), 필터 `finally`의 `copyBodyToResponse`(:71)와 비동기 `write`(:81)가 극히 좁은 창에서 겹칠 수 있다 — 실사용 영향은 확인되지 않음 |
| 3초 타임아웃 408 | ✅ | `async.setTimeout` + 자체 `deadline`(해제 루프 내부에도 검사). **실제 Tomcat 소켓**으로 4건 동시 지연 업로드 → 전부 408 + 슬롯 반환 확인(`LiveIngestSocketTest:100-125`) |
| gzip 폭탄 | ✅ | 100 MiB 해제분을 8 KiB 블록 반복으로 만들어 압축본 < 512 KiB 상태에서 해제 중 413(`highCompressionBombStopsAtDecodedLimit`) |

### 3.3 파서 `LiveSpanParser`

| 요구 | 결과 | 근거 |
|---|---|---|
| 토큰 단위 스트리밍(전체 트리 미구성) | ✅ | `readTree`·`ObjectNode`·`TreeNode` 사용 0. `JsonParser` + `skipChildren()`만. 심볼 캐시(`INTERN_FIELD_NAMES`·`CANONICALIZE_FIELD_NAMES`)·thread-local 버퍼 재활용까지 꺼서 미지 필드 이름이 프로세스에 남지 않게 했다 — 요구 이상이다. ⚠️ **본문 자체는 전량 힙에 올라온다**(`count(byte[])`) — 스트리밍은 파싱에만 해당(정본이 허용한 `readBounded` 재사용 구조) |
| 깊이 제한 | ✅ | `maxNestingDepth(64)`. 미지 필드 안 10,000 중첩도 실패(`excessiveDepthFailsEvenInUnknownField`), 30은 통과 |
| 미지 필드 skip | ✅ | 1.5 MB 미사용 문자열 2종(루트 · `scope.name`)에서 정상 계수 |
| 엄격 UTF-8 | ✅ | `CodingErrorAction.REPORT` 디코더를 `InputStreamReader`로 직접 공급. **미사용 필드 안의** 0xFF도 400(`malformedUtf8Is400EvenInsideUnusedString`) — Jackson byte[] 경로가 대체 문자로 고치는 함정을 정확히 피했다(코드 주석이 그 이유를 적어 뒀다) |
| `name` 부재 허용 | ✅ | `span()`이 `name`을 읽지 않고 default로 skip |
| 허용 키만 추출(§3.1) | ✅ | resource 4키 · span 6키(`http.method`/`http.status_code` 구 키 포함, 오류 2축 `error.type`·`status.code` 둘 다). 보유량이 허용 키 수로 묶여 있고, `value`가 `key`보다 앞선 순서도 수용(`:158-163`) |
| 1,001번째 413 | ✅ | `:100-101`. **1,001번째 스팬 본문을 읽기 전에** 던지는 것까지 증명(`stopsBeforeReadingThe1001stSpanBody`가 깨진 JSON을 뒤에 붙여 확인). resource·scope를 가로지른 누적도 확인 |
| hex traceId/spanId 검증 | 🔴 | **없음** — 길이 초과는 조용히 절단, 비-hex는 통과. 🔴-3 |
| kind 정수/문자열 양쪽 | ✅ | `scalar`가 `VALUE_STRING`·`VALUE_NUMBER_INT` 둘 다 수용(`"SPAN_KIND_SERVER"`·`2` 모두 테스트에 존재) |
| nano 시간 오버플로 | 🟡 | 문자열로만 보관하고 수치 검증 없음(20바이트 길이 제한뿐) → `99999999999999999999`가 통과. 1단계는 값을 버리므로 무증상, 2단계 전 처리 필요(🔴-3에 포함) |

### 3.4 응답 규약 ✅

- `enabled=false` → **인증·용도·라이선스 통과 뒤** 503 `APM_LIVE_DISABLED`, 그리고 **본문을 열지 않는다**(`request.opened == false`). 미라이선스는 disabled보다 먼저 403(`unlicensedIs403EvenWhenDisabled`) — 정본 §3.4 "만료는 실제 403" 유지.
- 성공: `200 {"partialSuccess":{"rejectedSpans":0,"errorMessage":""}}` + `Content-Type: application/json` ✅ (정본 §2.3 "정확한 문자열로 분기"). OTLP 규약상 zero-value `partialSuccess`는 Collector가 빈 것으로 읽으므로 WARN도 남지 않는다 — 무해.
- 오류: `{"error":"<CODE>"}` + 상태 400/408/413/415/503(+401/403). 정본 §2.3·§2.3.0 표와 일치. `Cache-Control: no-store`, 4xx/5xx에 `Connection: close`.
- **exporter 취급 주석의 정확성**: 코드에 사실과 다른 주장은 없다. 다만 정본 §2.3이 강조한 "재시도 OFF이므로 503도 재전송되지 않는다 / 401·403·413·415는 Collector가 Permanent로 보고 즉시 폐기"가 **코드 주석에는 없다**. 2단계에서 `LiveIngestResponses`나 컨트롤러 상단에 한 줄 남기길 권함(이 파일만 읽는 사람이 503을 "재시도되니 안전"으로 오해할 여지).
- ⚠️ `Connection: close`를 **모든 오류에** 붙인다. 기본 OFF 상태에서 Collector가 붙으면 모든 요청이 503+연결 종료라 TCP 재수립이 계속 발생한다(6단계 전까지는 보낼 Collector가 없어 무해).

### 3.5 카운터 ✅

- 사유 8종이 프롬프트 목록과 정확히 일치(`bodyTooLarge`·`compressedTooLarge`·`unsupportedEncoding`·`malformed`·`tooManySpans`·`disabled`·`busy`·`unauthorized`).
- 스레드 안전 ✅: `EnumMap`은 생성자에서만 채우고 이후 읽기 전용, 값은 `AtomicLong`, 필드는 `final`(안전 공표).
- 단위 주석 ↔ 실제 일치 ✅: `accepted`는 `accept(count)`로 **스팬 수**, `rejected`는 요청당 1회(`LiveIngestResponses:36`). `spanCountBoundary`가 999/1000 → accepted 999/1000, 1001 → accepted 0 + tooManySpans 1로 둘을 동시에 못 박는다.
- 🟡-3(408·내부 장애 합쳐짐) 참조. 또 `accepted`가 소폭 미계수될 수 있다 — `write()`가 IOException을 던지면(클라이언트 단절) `counters.accept()`에 도달하지 않는다(`:29-31`). 의미상으로는 오히려 정확하다.

### 3.6 정본 차이 5건 타당성

| # | 차이 | 판정 | 비고 |
|---|---|---|---|
| 1 | 스팬 초과 → **배치 전체 413**(정본은 초과분 partialSuccess `batchOverflow`) | ✅ 타당 | 구현 프롬프트가 명시적으로 지시했고(§구현 범위 5), 교체 주석이 `LiveSpanParser.java:99`에 있다. 1단계엔 보내는 Collector가 없어 데이터 손실 0. **2단계에서 반드시 교체** — 413은 Permanent라 1,001스팬 배치에서 정상 1,000개까지 함께 잃는다 |
| 2 | 타임아웃 **408** | ✅ 타당 | 정본 §2.3.0 "읽기 시간 3초 초과 = 408"과 일치. 자원 부족 503과 분리한 것도 정본 의도 |
| 3 | 계수 단위(accepted = 파싱 수용 스팬 수) | ✅ 타당 | 주석 명시. ⚠️ 2단계에서 "집계 성공 수"로 의미가 바뀌는데 **이름이 같으면** 관측 연속성 착시가 생긴다 — 그때 카운터를 갈아 끼우거나 이름을 바꿀 것 |
| 4 | gzip 슬롯 보유 구간 = **회선 읽기 ~ 파싱 완료**(정본은 "동시 gzip 해제 4") | 🟡 부분 타당 | 압축본 버퍼까지 묶겠다는 근거는 정당하다. 그러나 **무압축 경로는 아예 안 묶여** 목적을 달성하지 못하고(🔴-2), 대신 느린 클라이언트 4개가 gzip 전체를 3초간 503으로 만든다. 보유 구간을 넓힌 채로 가려면 슬롯 수를 늘리고 무압축도 묶어야 하고, 좁히려면 `onAllDataRead`에서 취득해야 한다 |
| 5 | 회수 토큰 **401** 유지 | ✅ 타당 | 저장 경로와 동일한 체계 유지가 맞다(정본 §2.3.1도 상태 코드를 지정하지 않았다). 단 **`tokenRevoked` 사유 카운터가 없어** `unauthorized`에 합쳐진다 — 정본 §2.3 거절 사유 목록에는 `tokenRevoked`가 있으므로 3단계(메타 캐시)에서 분리 필요 |

### 3.7 테스트 품질 — 변이 3건 전부 검출 ✅

| 변이 | 적용 위치 | 결과 |
|---|---|---|
| **M1** 해제 중 상한 검사 제거 | `LiveBodyReader.java:165-167` 블록 삭제 | 🟢 **잡힘** — `decodedBoundaryGzip[3] size=2097153` · `highCompressionBombStopsAtDecodedLimit` 2건 FAILED |
| **M2** permitAll 제거 | `SecurityConfig.java:81` 삭제 | 🟢 **잡힘** — `sessionlessTokenCrossesRealSecurityAndLicenseInterceptors` · `realLicenseGateIs403` 2건 FAILED (🟡-7: 401 테스트는 통과) |
| **M3** 세마포어 반납 제거 | `LiveBodyReader.java:53` release 제거 | 🟢 **잡힘** — `corruptGzipAndJsonAre400AndReleaseAdmission` · `busyAndTimeoutReturnSlotsExactlyOnce` · `LiveIngestSocketTest.stalledGzipUploadsTimeoutAndReleaseAllFourSlots` 3건 FAILED |

**복원 확인**: `LiveBodyReader.java` md5 `23be02ffe606f9b3aa0dce7b57cc4598` · `SecurityConfig.java` md5 `47937d7d08eab587ca60d7e08cf16376` — 변이 전과 동일. `git status`도 변이 전과 동일(M 4 · ?? 3). 복원 후 재실행 BUILD SUCCESSFUL.

**§4.3 1번 행 회귀 목록 커버리지**: 8개 항목 **전부 덮임** — 세션 없는 유효 토큰 성공 ✅ / 잘못된 토큰 401 OTLP 본문 ✅ / 용도·라이선스 403 ✅ / 사람용 envelope 미유입 ✅ / 기존 `/apm/otlp/**` 권한 유지 ✅ / 사용자용 `/apm/live/**` 권한 유지 ✅ / 필터·바인딩 예외 계약대로(500 누출 0) ✅ / `enabled=false` 503 ✅.

**누락(2단계 이전 보강 권장)**: ① **진짜 동시성 시나리오 0건** — 세마포어·카운터 경합이 전부 단일 스레드 순차로만 검증됐다(`busyAndTimeoutReturnSlotsExactlyOnce`도 순차 `mvc.perform`) ② 소켓 IT에 401/403 경로 없음(성공·408·chunked 3건뿐) — 실제 컨테이너에서 인증 실패 시 envelope가 새지 않는지는 MockMvc로만 확인 ③ `enabled=false` × 실제 보안 체인 조합 미검증(`LiveIngestSecurityChainTest`는 enabled=true만) ④ Content-Length를 **실제보다 크게** 속이는 경우 미검증(작게·없음만) ⑤ 404/405 응답 모양 미검증(🟡-4).

**CI 취약성**: `LiveIngestSocketTest`는 `setPort(0)` 임의 포트라 **포트 충돌 위험 없음** ✅. 위험은 시간 어서션(🟡-9)과 Tomcat 3회 기동 비용(선별 실행 1분 28초 중 상당 부분).

### 3.8 규약 ✅

- **패키지 어휘**: `collector/ingest/live/`는 정본 §2.3 패키지 결정("컨트롤러는 `collector/ingest/`")과 BE `CLAUDE.md` §0.5 ①메뉴 우선(수신 입구 = 수집기 메뉴)에 부합. 링·집계·SSE를 `overview/live/spans/`에 둔다는 결정과도 충돌 없음. `ApmIngestTokenPolicy`를 `ingest/` 루트에 둔 것도 `MACHINE_CLIENT_CLASSES` FQN 고정 규약과 정합.
- **`package-info`**: 새 패키지에 없다. 다만 부모 `collector/ingest/`에도 없으므로(있는 곳은 `apm/`·`core/`·`overview/live/`·`report/`·`rum/`·`service/deploy/`) 규약 위반은 아님 — 2단계에서 라이브 세트가 두 패키지로 갈라질 때 추가를 권함.
- **주석 언어**: 전부 한국어, "무엇"이 아니라 "왜"를 적었다(엄격 UTF-8 Reader를 직접 공급하는 이유, 심볼 캐시를 끄는 이유, 압축본 버퍼를 묶는 이유, `sendError`를 가로채는 이유). 규약이 요구하는 수준 이상.
- **기존 `ApmOtlpController` 변경분 최소성**: ✅ 4줄 교체 + 메서드 2개 이동뿐, 동작 변경 0(테스트 22건 통과). 🟡-5·🟡-6만 정리하면 완결.
- **worktree 임시 파일**: 없음(`git status` = 예상한 M 4 · ?? 3). `git diff --check` 통과(CRLF 경고만).

### 3.9 선별 테스트 재실행 수치

```
JAVA_HOME="C:/Program Files/Java/jdk-17" ./gradlew.bat :test \
  --tests 'com.dmove.moveseye.premium.apm.collector.ingest.live.*' \
  --tests 'com.dmove.moveseye.license.LicenseArchitectureTest' \
  --tests 'com.dmove.moveseye.premium.apm.collector.ingest.ApmOtlpController*' \
  --tests '*OtelArchitectureTest'
→ BUILD SUCCESSFUL in 1m 28s
```

| 클래스 | tests | failures | errors | skipped |
|---|---:|---:|---:|---:|
| `live.ApmOtlpLiveControllerTest` | 45 | 0 | 0 | 0 |
| `live.LiveSpanParserTest` | 16 | 0 | 0 | 0 |
| `live.LiveIngestFailureTest` | 15 | 0 | 0 | 0 |
| `live.ApmLiveSpansPropertiesTest` | 9 | 0 | 0 | 0 |
| `live.LiveIngestSecurityChainTest` | 5 | 0 | 0 | 0 |
| `live.LiveIngestSocketTest` | 3 | 0 | 0 | 0 |
| **live 소계** | **93** | **0** | **0** | **0** |
| `license.LicenseArchitectureTest` | 7 | 0 | 0 | 0 |
| `otel.OtelArchitectureTest` | 2 | 0 | 0 | 0 |
| `ingest.ApmOtlpControllerTest` | 22 | 0 | 0 | 0 |
| **합계** | **124** | **0** | **0** | **0** |

live 93건은 코덱스 보고의 "신규 93"과 정확히 일치. 전체 3,249는 재실행하지 않았다(코덱스 보고 수치 인용).

---

## 4. 수정 라운드 항목

| # | 항목 | 등급 | 범위 |
|---|---|---|---|
| **R1** | **`max-compressed-bytes` 524,288 → 2,097,152**(R-P5b 발견 ⑥ · 정본 v4.1 §7.1) — 기본값 + **`@Max` 동반 변경** + `application.yml` 주석 + 경계 테스트 3곳 + 프로퍼티 테스트 기대값 | 🔴-1 | 별도 커밋 가능 |
| **R2** | 무압축 경로 admission 상한 신설(또는 세마포어를 수신 전체로 승격) + 해제 시 압축본 버퍼 조기 해제·복사 제거 + §5.2 힙 예산 문장 갱신. **R1을 적용하면 힙 피크가 더 커지므로 R1과 같은 라운드에서 판단할 것** | 🔴-2 | 2단계 착수 전 |
| **R3** | ID 3종(`traceId`/`spanId`/`parentSpanId`) 절단 금지 — 길이·hex 후조건 검사 후 `malformed` 거절. nano 시간 수치 범위 검사 | 🔴-3 | 2단계(dedup 도입) 전 |
| **R4** | 경계 테스트를 프로퍼티 기반으로 파라미터화(R1의 재발 방지) | 🟡-1 | R1과 동시 |
| **R5** | guard 필터 경로 매칭을 디코드된 경로로 통일 | 🟡-2 | 수정 라운드 |
| **R6** | 카운터 사유에 `readTimeout`·`internal` 추가(정본 §2.3 거절 사유 목록 갱신 동반) | 🟡-3 | 2단계 |
| **R7** | guard 상태 화이트리스트에 404·405 보존 | 🟡-4 | 수정 라운드 |
| **R8** | `allowedToIngest` Javadoc 원문 이전 + 상호참조 3건(`ApmReceiveTokenDto:55`·`ApmReceiveTokenService:86`·`ApmDeploymentWebhookController:211`) 갱신 + 빈 줄 2곳 정리 | 🟡-5·6 | 커밋 전 |
| **R9** | 동시성 테스트(멀티스레드 세마포어·카운터) · 소켓 IT 401/403 · 404/405 응답 모양 추가 | 🟡 | 2단계 |
| **R10** | 소켓 IT 시간 어서션 상한 완화(7 → 12초, 소켓 타임아웃 동반 상향) | 🟡-9 | 수정 라운드 |

---

## 5. 총평

1단계 범위를 **정본보다 촘촘하게** 구현했다. 특히 ① 필터 단계까지 덮는 3단 오류 변환(guard·advice·컨트롤러 try)이 정본 §2.3의 "500 금지 범위" 설계를 그대로 코드로 옮겼고, ② 엄격 UTF-8을 위해 Jackson byte[] 경로의 대체-문자 관용을 우회한 판단, ③ 심볼 캐시·thread-local 버퍼를 꺼서 미지 필드 문자열이 프로세스에 남지 않게 한 처리는 요구를 넘는다. 변이 3건이 전부 잡힌 것으로 보아 테스트는 **장식이 아니라 실제 방어**다.

남은 🔴 3건 중 R1은 정본이 v4.1에서 뒤늦게 바꾼 값이라 구현자 책임이 아니고(프롬프트는 524,288을 지시했다), R2·R3은 1단계가 기능 OFF·값 폐기 상태라 **오늘 증상이 없는 대신 2단계에 그대로 승계되는 종류**다. 커밋 자체는 막을 이유가 없고, R1·R8·R5·R7·R10을 묶은 정정 커밋을 이어 붙인 뒤 2단계를 R2·R3부터 여는 순서를 권한다.
