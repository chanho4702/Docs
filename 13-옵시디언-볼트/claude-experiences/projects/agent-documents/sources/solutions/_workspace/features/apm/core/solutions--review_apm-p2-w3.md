# 검수 요청 — APM P2 3차 (WBS 3.11 배포 감지·계약 표본)

- 대상: `moveseye-be-spring` 커밋 `29ffe71`(기준 `38eed96`). 결과는 `review_apm-p2-w3_codex.md`.
- 의도: AUTO 배포 감지(버전 집합 방식)+웹훅(scope deploy)+compare/new-errors+RED 배포 마커+계약 §11·표본 JSON 7종(ApmContractFixtureTest 매 빌드 대조).

## 검증됨
- 전체 `:test` 2494 green(신규 52, IT 19 실도커). 길이 0 창 함정 우회 IT 고정.

## 🔴 불안한 지점(구현 에이전트 자진 신고 — 전문은 에이전트 보고)
1. AUTO 감지="살아 있는 버전 집합에 없던 버전"(30분 창) — 같은 버전 재배포·30분 내 롤백·version 미전송 못 잡음(웹훅으로 메움). "30분"은 실측 아닌 판단.
2. 다중 노드 동시 INSERT(같은 분) 미재현. 분 절단 자연키 의존.
3. SecurityConfig `POST /apm/services/*/deployments` permitAll이 "스프링 *=한 세그먼트"에 기댐 — 실 필터 체인 미검증.
4. 토큰 scope 화이트리스트는 거동 변경(미지 scope 400).
5. RED 시계열마다 배포 조회 1회 추가 — 대량 창 미실측. 실서버 웹훅 curl 미실시.

---

## § 반영 (2026-09-02, `review_apm-p2-w3_codex.md` 지적 4건 — "다음 커밋 전 반드시" 전건 처리)

계약 정본은 `./contract_apm-read-api.md` §11.3(재시도)·§11.4(400)·§11.6(체인 검증)·**§11.7 신설(표본 파일 표)**.
전체 `:test` **2515 green, skip 0**(직전 2494 → +21, 도커 PG 5433 `moveseye_it` 붙은 상태 — `ApmDeploymentIT` 19건 실제 실행).

| # | 지적 | 상태 | 한 줄 |
|---|---|---|---|
| 1 | 🔴 깨진 JSON이 전역 핸들러의 200을 탐 | ✅ | 웹훅 컨트롤러 스코프 `@ExceptionHandler(HttpMessageNotReadableException)` → **실제 400 `{error, code}`**, 새 코드 `APM_DEPLOYMENT_BODY_INVALID`. MockMvc 회귀 4건 |
| 2 | 🟡 AUTO 캐시가 저장 실패를 "아는 버전"으로 굳힘 | ✅ | 캐시에 넣되 **기록 실패 시 도로 뺀다**(재시도 상태). 동시 수신 창은 그대로 좁게 유지. 회귀 3건 |
| 3 | 🟡 실 `SecurityFilterChain` 미검증 | ✅ | `ApmDeploymentWebhookSecurityChainTest` 신설 — **실제 `SecurityConfig`를 `@Import`한 최소 웹 컨텍스트**에 `springSecurity()` 적용. POST permitAll · 같은 경로 GET 401 · `a/b` 비매칭 · 그 밖 APM EP 401 |
| 4 | 🟡 표본 게이트가 새 `ObjectMapper`·수동 fixture | ✅ | Boot `JacksonAutoConfiguration`으로 만든 **애플리케이션 매퍼** 주입 + 표본 7종 추가(배포 목록·compare·**compare 0분 after**·new-errors·웹훅 200/404/400) |

### 각 항목의 판단

1. **왜 컨트롤러 스코프인가.** 본문 파싱 실패는 **핸들러 매핑이 끝난 뒤**(인자 해석)에 나므로 로컬 `@ExceptionHandler`가 전역 `@ControllerAdvice`를 이긴다. ⚠️ 같은 방법으로 **415는 못 잡는다**(`consumes` 매칭 실패라 핸들러가 정해지기 전이다 — `ApmOtlpController`가 `consumes`를 안 쓰는 이유). 이 EP는 `consumes`를 걸지 않아 그 경로가 없다.
   - ⚠️ **이 400은 토큰 검사보다 먼저 난다.** 순서를 뒤집으려면 본문을 문자열로 받아 직접 파싱해야 하는데(성공 경로의 역직렬화를 손으로 다시 쓰는 대가), 알려 주는 정보가 요청 형식뿐이라 대조 신호가 되지 않는다고 보고 그대로 뒀다. 계약 §11.4에 명시.
2. **"성공 후 추가"가 아니라 "실패 시 제거"로 갔다.** 성공 후 추가는 동시 수신 두 스레드가 나란히 `recordIfNew`로 들어가는 창을 넓힌다(DB 방어가 뒤에 있지만 낭비다). 넣고-실패하면-빼기는 **두 성질을 다 지킨다**. 부트스트랩 갈래는 DB 쓰기가 없어 추가만 한다.
3. **`@SpringBootTest`를 쓰지 않았다.** 그건 DB·Redis가 있어야 도는데(`IntegrationTestSupport`는 없으면 **skip**), 노출면 회귀를 잡는 그물이 "환경이 갖춰졌을 때만 도는" 상태면 그물이 아니다. `SecurityConfig`는 **그대로 `@Import`** 하고 협력자(JWT 필터·인증 실패 응답)만 대역으로 세웠다 — 매처·메서드 제한·permitAll은 전부 진짜다. 🔴 JWT 필터 대역은 Mockito 목이 아니라 **익명 서브클래스**다(목은 체인을 이어 부르지 않아 전 요청이 빈 200이 된다).
4. **웹훅 표본 셋은 컨트롤러를 실제로 불러서 만든다.** 그 본문은 뒤에 record가 없는 `Map`이라 손으로 지은 표본은 본문이 바뀌어도 같이 바뀌어 아무것도 못 잡는다. 매퍼 쪽은 `ApplicationContextRunner`+`JacksonAutoConfiguration`으로 Boot가 만드는 그 빈을 꺼내 쓰고, `spring.jackson.*`이 생기면 먼저 깨지도록 검사를 함께 뒀다.

### 🔴 결함 검출력을 실제로 확인했다(되돌려 보기)

세 수정을 각각 되돌려 **정확히 의도한 테스트만** 빨개지는 것을 확인하고 원복했다.

| 되돌린 것 | 깨진 테스트 |
|---|---|
| `@ExceptionHandler` 제거 | 웹훅 MVC 3건(400 · 필드 타입 · 사유 미노출) |
| `known.remove(value)` 제거 | 감지기 2건(재시도 · 재시도 후 중복 방지) |
| `POST /apm/services/*/deployments` → `/apm/services/**/deployments` | 체인 4건(POST 통과 · GET 401 · 중첩 비매칭 · 컨트롤러 401) |

⚠️ 표본 테스트는 1번 되돌리기에 **반응하지 않는다**(그 표본은 핸들러 메서드를 직접 부르므로 본문 모양만 고정한다). 배선은 MVC 테스트가 본다 — 두 그물의 역할이 다르다는 뜻이고, 둘 다 있어야 한다.

### 남은 불안 (4차 검수에서 봐 줄 것)

1. **체인 테스트의 경계.** 보안 체인만 세웠고 **인터셉터 5종(Roles·MCP·visitor-id·AccessMode·Feature)은 없다.** 즉 "웹훅이 `@VisitorIdCheck` 없이 통과한다"·"`@LicenseExempt`가 인터셉터를 비켜선다"는 여전히 **전체 컨텍스트에서만** 드러난다. 이 둘을 커버하려면 결국 `@SpringBootTest`인데, 그러면 skip 문제로 돌아온다 — 지금 균형이 맞는지.
2. **표본 매퍼의 남은 틈.** `spring.jackson.*`은 검사하지만 **자바 쪽 `Jackson2ObjectMapperBuilderCustomizer`·`ObjectMapper` 빈을 나중에 선언하면** 표본 게이트가 조용히 애플리케이션과 갈린다(주석으로만 막아 뒀다). ArchUnit으로 못박을 수 있으나 이미 두 클래스가 그래프를 올려 힙 1g를 쓰고 있어(과거 OOM 이력) 세 번째를 더하는 것이 맞는지 판단이 필요하다.
3. **감지기 재시도의 유효 기한.** 실패한 버전은 다음 수신이 재시도하지만, **캐시 TTL(10분)이 지나 reload가 돌기 전에** 성공해야 한다(그 뒤엔 인스턴스 행이 live set에 들어가 새 버전으로 안 보인다). 배치가 초 단위로 오는 정상 상황에서는 충분하나, **DB가 10분 넘게 죽어 있으면 그 배포는 여전히 잃는다.** 그 경우를 더 막을 값이 있는지(감지 실패 목록을 따로 들고 있기 등)는 판단이 필요하다 — 지금은 "그 정도 장애면 잃을 것이 마커만은 아니다"로 보고 두었다.
4. **동시 수신 실경합은 여전히 미재현**(3차 지적 밖, 계약 §11.6에 남아 있는 항목). "넣고-실패하면-빼기"가 두 스레드 교차에서 어떻게 도는지는 **추론**이다.
5. **실서버 왕복 미실시** — 실제 CI에서 curl로 깨진 JSON을 보내 400을 받아 본 적은 없다(MockMvc까지만).
