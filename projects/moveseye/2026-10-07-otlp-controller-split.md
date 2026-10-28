---
tags: [moveseye, apm, refactoring, archunit, backend]
updated: 2026-10-07
---

# APM OTLP 수신 컨트롤러 분리(615줄 → 판정 순서·상태 코드만)

대상: `moveseye-be-spring/.../premium/apm/collector/ingest/ApmOtlpController.java`. 사용자 요청("컨트롤러에 다 때려 박았다")으로 **수신 입구의 메커니즘**을 `ingest/receive/` 세트로 내렸다. 커밋 전.

## 무엇을 어떻게 갈랐나
"같이 바뀌는 단위"로 다섯을 떼어 냈다 — `ApmOtlpProperties`(상한 3개, `@Value`+`@PostConstruct`+지연 생성 핵 대체) · `ApmOtlpBodyReader`(형식·회선 상한·gzip 해제) · `ApmIngestAdmission`(permit·429 카운터) · `ApmOtlpLogSignalHandler`(로그 신호: 자기 관측 저장/미지원 카운트) · `ApmOtlpIngestDispatcher`(파싱·중복·파이프라인 선택·영수증·0행 WARN). 컨트롤러는 339줄(코드 169줄)로, `receive()` 한 메서드가 **순서와 상태 코드**만 쥔다.

- **분리된 클래스는 상태 코드를 모른다.** 검사 예외 2종(`PayloadTooLargeException`→413, `MalformedPayloadException`→400)과 런타임 예외(→503)로 결과를 알리고, 코드로 바꾸는 건 컨트롤러뿐이다. "500은 절대 내지 않는다"(R11 실측: 60초에 31배치 손실)가 한 파일만 읽어도 확인되게 하려는 선택.
- 테스트는 `ReflectionTestUtils.setField(controller, "maxBodyBytes", …)` 대신 `new ApmOtlpProperties(1024, 512, 1)`로 **값으로 조립**한다. 리플렉션 방식은 필드 이름이 바뀌면 조용히 기본값으로 돌아 거짓 통과한다.

## 발견 — 기준선이 이미 깨져 있었다
리팩터링 전 관련 테스트를 먼저 돌리니 `LicenseArchitectureTest` A5-c가 **원래부터 실패** 상태였다. 그 규칙은 `@LicenseExempt` 엔드포인트에서 `LicenseProvider.current()`를 **같은 클래스 한 단계 위임까지만** 따라가는데, ZM-122에서 admission을 넣으며 `receive()` 아래 `receiveAdmitted()`를 한 겹 더 만들어 두 단계가 됐다. 분리하면서 라이선스 확인을 `receive()` 안으로 올려 함께 해소(7/7 통과).

## 교훈
- **리팩터링 전 기준선 테스트를 반드시 먼저 돌린다.** 안 돌렸으면 A5-c 실패를 내 변경 탓으로 오판해 시간을 버렸거나, 반대로 "원래 깨져 있던 것"을 모른 채 넘겼을 것이다.
- **ArchUnit의 "한 단계 위임" 규칙은 private 메서드 추출 리팩터링에 취약하다.** 메서드를 하나 더 가르는 순간 조용히 깨지고, 그 테스트가 평소 CI에서 돌지 않으면 아무도 모른다. 규칙에 기대는 호출은 클래스 주석에 "이 자리에 직접 둔다"를 적어 둬야 한다.
- 분리 과정에서 로그 신호의 `dropStatRecorder`·`recentTracker` 실패가 전에는 try 밖이라 **500으로 새던 경로**였음이 드러났다(지금은 503). 큰 메서드 안의 try 범위는 의도가 아니라 우연인 경우가 있다.

관련: [[moveseye]] · [[2026-10-06-apm-hardening-scale]] · [[2026-10-06-apm-overall-review]]
