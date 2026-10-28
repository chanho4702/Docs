# 코덱스 검수 결과 — APM P2 3차 (2026-09-02, codex exec read-only, 대상 29ffe71)

요약: 🔴 웹훅의 깨진 JSON은 실제 `400`이 아니라 전역 예외 처리로 `200 + ApiResult`가 되어 CI 실패를 성공으로 읽을 수 있습니다.  
AUTO 감지는 DB 기록 실패 시 새 버전을 캐시에 먼저 넣어 배포 마커가 영구 누락될 수 있습니다.  
`permitAll` 폭·scope 강제·RED `null`/`[]`·compare 0길이 처리는 코드상 계약과 대체로 일치하지만, 필터 체인 및 배포 DTO 계약 검증은 부족합니다.

| # | 심각도(🔴/🟡/🟢) | 파일:라인 | 문제 | 왜 문제인가 | 권고 |
|---|---|---|---|---|---|
| 1 | 🔴 | `GlobalExceptionHandler.java:173`, `ApmDeploymentWebhookController.java:109` | 잘못된 JSON이 컨트롤러 진입 전 `HttpMessageNotReadableException`이 되어 전역 핸들러의 `200` 응답 규약을 탑니다. | 계약 §11.4는 이 POST의 `400`을 실제 HTTP 상태로 요구합니다. `curl --fail`/CI가 본문 오류를 성공으로 처리할 수 있습니다. | 웹훅 경로에 한해 malformed body를 실제 `400` 평문 `{error, code}`로 변환하는 전용 예외 처리를 추가하고, 깨진 JSON MockMvc/실필터체인 테스트를 고정하십시오. |
| 2 | 🟡 | `ApmDeploymentDetector.java:133-145` | `known.add(value)`가 `recordIfNew`보다 먼저 실행됩니다. 기록이 일시 실패하면 해당 버전은 캐시에 이미 알려진 값이 됩니다. | 이후 인스턴스가 저장되면 다음 reload도 그 버전을 live set에서 읽어, AUTO 마커가 재시도 없이 영구 누락될 수 있습니다. hot path 예외를 삼키는 설계 자체와 결합한 정합성 결함입니다. | 저장 성공 또는 DB 중복 확인 뒤에만 캐시에 추가하거나, 실패한 버전을 dirty/retry 상태로 남기십시오. 동시 수신 시에도 같은 보장이 유지되게 하십시오. |
| 3 | 🟡 | `ApmDeploymentWebhookMvcTest.java:66`, `SecurityConfig.java:86` | 웹훅 테스트가 `standaloneSetup`이라 실제 `SecurityFilterChain`의 `POST /apm/services/*/deployments` 매칭을 검증하지 않습니다. | 현재 `*`는 한 경로 세그먼트이므로 코드상 과개방은 보이지 않습니다. 다만 테스트가 없어 Spring Security matcher 변경·구성 변경 시 POST 우회 또는 GET 개방을 잡지 못합니다. | 실제 보안 체인을 포함한 테스트로 정상 POST permitAll, GET 인증 필요, `/apm/services/a/b/deployments` 비매칭을 고정하십시오. |
| 4 | 🟡 | `ApmContractFixtureTest.java:35`, `ApmContractFixtures.java:135-147` | 표본 테스트는 새 `ObjectMapper`와 수동 fixture를 쓰며, 이번 WBS의 `Deployments`·`DeploymentCompare`·웹훅 평문 응답 표본이 없습니다. | “애플리케이션과 같은 조건”이라는 계약 문구와 다릅니다. 배포 DTO 필드, `RedWindow` null 규약, envelope/평문 경계의 drift는 이 게이트에서 잡히지 않습니다. | 애플리케이션 `ObjectMapper`를 주입해 직렬화하고, 배포 목록·compare(0분 after 포함)·new-errors·웹훅 성공/오류 표본을 추가하십시오. |
| 5 | 🟢 | `ApmSeriesQueryService.java:323-338`, `ApmRedSeriesDto.java:71-73` | 서비스 RED는 배포 없음에 `[]`, 엔드포인트·인스턴스 RED는 미탑재에 `null`을 반환합니다. | 계약 §2·§11의 “없음”과 “이 EP는 싣지 않음” 구분이 보존됩니다. | 현 규약을 유지하고, 배포 DTO 표본 추가 시 서비스 RED의 빈 `[]` 표본도 별도로 고정하십시오. |
| 6 | 🟢 | `ApmDeploymentService.java:142-159`, `ApmSeriesQueryService.java:244-253` | compare의 후창 길이 0은 `ApmTimeRange`에 넘기지 않고 명시적 empty DTO로 처리합니다. | “최근 1시간”으로 접히는 기존 시간창 보정 함정을 피하며, 경계는 `[before)`·`[after)` 계약과 맞습니다. | 현재 구현을 유지하십시오. |
| 7 | 🟢 | `ApmDeploymentWebhookController.java:116-189` | 토큰 존재 확인 뒤 `COLLECTOR ∧ scope=deploy`를 강제하고, uid 조회는 그 뒤입니다. | ingest/RUM 토큰은 403이며, 무인증 요청으로 서비스 존재 여부를 404로 탐색할 수 없습니다. 유효한 deploy 토큰의 404는 계약상 의도된 CI 진단 정보입니다. | 현재 순서를 유지하십시오. |
| 8 | 🟢 | `LicenseArchitectureTest.java:60-66`, `:204-264` | `MACHINE_CLIENT_CLASSES`로 명칭을 넓힌 기준은 OTLP뿐 아니라 CI 웹훅까지 포괄합니다. | `@LicenseExempt` 메서드 전수에 대해 직접 또는 한 단계 위임의 `LicenseProvider.current()` 도달을 검사하므로, 이번 웹훅의 라이선스 우회 방어 목적에는 타당합니다. | 이 테스트는 라이선스 확인만 검증한다는 경계를 주석·테스트명에 명확히 유지하십시오. |

### 요청서 불안 5건 판정

1. AUTO 30분 버전 집합의 동일 버전 재배포·짧은 롤백·버전 미전송 미감지는 계약대로 웹훅 보완 대상입니다. 다만 DB 실패 후 영구 누락은 별도 결함입니다.  
2. 다중 노드 같은 분 INSERT는 자연키 `ON CONFLICT`로 중복 행은 막습니다. 다만 실제 경합 재현은 여전히 미검증입니다.  
3. `permitAll`의 `*`는 한 세그먼트 매칭이므로 코드상 폭은 계약과 일치합니다. 실제 필터 체인 테스트 부재는 유지됩니다.  
4. scope 화이트리스트 변경은 의도된 호환성 변경이며, `deploy` 강제와 `COLLECTOR` kind 검사는 구현되어 있습니다.  
5. RED마다 추가 조회는 상한 200과 인덱스 전제를 둔 설계입니다. 대량 서비스 실측이 없으므로 성능 안전성은 **추정**입니다.  

### 다음 커밋 전 반드시 고칠 것

1. 웹훅 malformed JSON을 실제 HTTP `400`으로 반환하도록 전용 처리와 회귀 테스트를 추가할 것.  
2. AUTO 감지에서 DB 기록 실패가 캐시 때문에 영구 누락되지 않도록 저장-캐시 순서 또는 재시도 상태를 수정할 것.  
3. 실제 `SecurityFilterChain`을 통과하는 웹훅 POST/GET/중첩경로 테스트를 추가할 것.  
4. 배포 목록·compare·웹훅 응답까지 실제 애플리케이션 `ObjectMapper` 기반 계약 표본 게이트에 포함할 것.
