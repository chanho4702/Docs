## 결과

**R1~R10 반영 완료. `:test` 전체 green입니다.**

| 검증 | 결과 |
|---|---|
| 전체 테스트 | **3,326 통과 / 실패 0 / 스킵 0** |
| 실행 시간 | Gradle **4분 54초**, 명령 전체 **297.062초** |
| 라이브 수신 테스트 | **170건 통과**, 기존 대비 **77건 증가** |
| 테스트 변경 | 신규 메서드 **14개**, 기존 메서드 **25개 수정** |
| 파일 검사 | `git diff --check` 통과 |

## 항목별 반영

| 항목 | 반영 내용·근거 |
|---|---|
| R1 | 압축본 기본값·`@Max` **2,097,152** 상향, 독립 상한·회선 읽기 주석 반영. [Properties:14](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ApmLiveSpansProperties.java:14), [application.yml:139](/C:/solutions/moveseye-be-spring-p5/src/main/resources/application.yml:139) |
| R2 | 압축·무압축 공통 `max-concurrent-requests`, 고정 배열·복사 없는 스트림 전달·버퍼 해제. [LiveBodyReader:53](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveBodyReader.java:53), [버퍼 전달:164](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveBodyReader.java:164) |
| R3 | ID 정확한 길이·hex 검증, 시간 음수·역전·비수치·long 초과 거절. 절단은 속성 값에만 적용. [LiveSpanParser:207](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveSpanParser.java:207) |
| R4 | 압축·해제 바이트 경계를 프로퍼티 **±1**로 계산. [경계 테스트:138](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/ApmOtlpLiveControllerTest.java:138) |
| R5 | 디코드된 `servletPath + pathInfo` 사용, `%2D` 회귀 검증. [Guard:25](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestGuardFilter.java:25) |
| R6 | `readTimeout`·`internalError` 추가, `busy`는 admission 초과로 한정. [Counters:8](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestCounters.java:8) |
| R7 | 404·405와 OTLP JSON 보존, 매핑 전 오류도 전역 처리보다 먼저 변환. [Advice:20](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestAdvice.java:20) |
| R8 | V38 경고 포함 Javadoc 이전·빈 줄 정리. [Policy:17](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmIngestTokenPolicy.java:17). `{@link}` 갱신: [Dto:56](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenDto.java:56), [Service:87](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/token/ApmReceiveTokenService.java:87), [Webhook:212](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/service/deploy/ApmDeploymentWebhookController.java:212) |
| R9 | 5요청 동시 진입→1건 `503 busy`, 슬롯 반납·카운터 원자성, 실제 소켓 401/403/404/405 검증. [Concurrency:23](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestConcurrencyTest.java:23), [Socket:145](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestSocketTest.java:145) |
| R10 | 시간 어서션 **2~12초**, 소켓 타임아웃 **15초**. [Socket:85](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestSocketTest.java:85), [시간 어서션:122](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestSocketTest.java:122) |

소켓 IT에서 추가 발견한 **Security 중첩 wrapper로 비동기 JSON 본문이 누락되는 문제**도 수정했습니다. [Responses:93](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveIngestResponses.java:93)

## fixture·힙 산정·미반영

- **R-P5b 실제 원문 G=N=1,000 배치 수용**을 검증했습니다. 회선 실측은 572.4 KiB이며, 보존 원문을 재압축한 fixture는 **590,363 B(576.5 KiB)**입니다. [출처·차이 설명](/C:/solutions/moveseye-be-spring-p5/src/test/resources/apm/contract/README.md:3)
- 기본 본문 버퍼 피크: **4슬롯 × (압축본 2 MiB + 해제본 2 MiB) = 16 MiB**. 무압축만이면 8 MiB입니다. 배열 성장·`toByteArray()` 복사가 없으며, 파서·gzip·I/O 객체 비용은 별도입니다.
- **요청한 코드·테스트 미반영 없음.** 외부 정본 문서는 쓰기 금지에 따라 수정하지 않았고, 변경된 힙·카운터 설명은 worktree 코드 주석에 반영했습니다.
- 커밋·병합은 수행하지 않았습니다.
