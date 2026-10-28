# MovesEye OpenTelemetry extension PoC measurement (2026-09-22)

## Context

- OpenTelemetry Java agent 2.31.1, JDK 17, Spring MVC/Tomcat 조합의 `OperationListener` 확장 PoC를 측정했다.
- 정식 결과는 `C:/solutions/_workspace/verification/r-p5-3b-extension-poc.md`에 기록했다.

## Observed

- 정상·예외·client cancel·timeout·Servlet async·streaming 각각에서 sampling on/off 모두 start/end callback이 1/1이었다.
- P2의 모든 요청은 완료됐고 request error는 0이었다. collector disconnect에서도 요청 처리는 유지됐다.
- `max-active=32` 포화에서는 준비 요청 포함 start callback 488건 중 270건이 추적에서 제외됐고 종료 시 active는 0이었다.
- 비격리 호스트의 고정 순서 단회 A/B는 일부 arm에서 확장이 더 빠르고 다른 arm에서는 더 느린 상반된 결과를 냈다.

## Lessons

- P1 같은 의미 검증은 작은 시나리오 matrix로 sampling 독립성과 lifecycle 대칭을 빠르게 확인할 수 있다.
- 비용 분리는 이름만으로 충분하지 않다. tracking-only 비용을 구하려면 같은 요청 수·동시성·exporter 조건의 matched no-extension arm이 반드시 필요하다.
- 성능 수치는 격리 호스트에서 A/B 순서를 교차하고 반복 분포를 수집해야 한다. 단회 p99 차이를 인과 비용으로 해석하면 안 된다.
- `allocatedBytesLiveThreads` delta는 측정 시점에 살아 있는 thread만 합산하므로 완전한 per-request allocation이 아니다.
- 메모리가 빠듯한 장비에서는 큰 단계 직후 중간 보고서를 먼저 저장하면 후속 측정이 중단돼도 관측 결과를 보존할 수 있다.

## Links

- [[moveseye-apm-retention-policy-2026-09-17]]
- [[moveseye-logic-review-2026-09-07]]
