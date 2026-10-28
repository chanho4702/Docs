# 결론

**SSE 선택과 40명 기본 상한은 합리적입니다.** 다만 40은 “힙 한계”라기보다, 실측 전 보호선입니다. 10명은 무난할 가능성이 높고, 40명부터는 메모리보다 **송신 대역폭·서로 다른 `viewKey`의 직렬화 시간·프록시**가 먼저 문제 됩니다.

## SSE 선택

- **장점:** 단방향 관제에 정확히 맞고, `EventSource`의 자동 재접속·`Last-Event-ID`를 활용하므로 WebSocket보다 설치·운영이 단순합니다.
- **단점:** 양방향 제어·명시적 backpressure가 없고 HTTP 상태/본문 처리와 Apache 버퍼링이 까다롭습니다. WebSocket도 연결별 fan-out 자체를 줄여 주지는 않습니다.

## 동시 시청 규모별 병목

| 시청자 | 먼저 아픈 곳 |
|---:|---|
| **10명** | 같은 `viewKey`면 직렬화·힙은 공유되어 여유가 큽니다. 단, 최대 프레임 기준 송신은 `8MiB × 10/초 = 80MiB/s`; 서로 다른 view 10개면 tick 직렬화도 10회입니다. |
| **40명** | 활성 상한 도달. 같은 view라도 최대 송신은 320MiB/s라 NIC/프록시가 먼저 포화될 수 있습니다. 서로 다른 view가 많으면 단일 tick 스레드의 1초 초과가 먼저입니다. |
| **100명** | 현재는 처리하지 않습니다. 같은 view 기준 40 active + 10 paused, 51번째부터 거절됩니다. 서로 다른 신규 view라면 snapshot 2 + 대기 10 때문에 13번째부터 일시 거절될 수도 있습니다. [admission](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java%3A155) |

“연결마다 8MiB를 복사해 40×8MiB가 힙에 잡힌다”는 해석은 틀립니다. 직렬화는 `viewKey`별 한 번이고, 동일 `byte[]`를 `retain()`하여 연결 큐가 공유합니다. 실제 네트워크 전송량만 연결 수만큼 증가합니다. [발행](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java%3A279) · [참조 공유](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveStreamBytes.java%3A59)

느린 클라이언트 하나도 writer 스레드를 계속 점유하지 않습니다. `isReady()`가 false면 즉시 반환하고 2초 watchdog이 해당 연결만 종료합니다. [비동기 쓰기](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveServletWriter.java%3A43) · [watchdog](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java%3A545)

Apache는 **추정 위험**입니다. 버퍼링은 1명에서도 지연을 만들고, 40~100 장기 연결의 worker 점유는 고객사 MPM 설정에 따라 달라집니다. `X-Accel-Buffering`만으로 Apache는 보장되지 않으며 실제 `mod_proxy_http` 검증이 남아 있습니다. [설계서](C:/solutions/_workspace/features/apm/realtime/devdesign_apm-realtime.md:438)

## 실제 위험과 기우

- 실제 위험: 숨김 탭도 슬롯·대역폭을 계속 사용하고 10분마다 재연결합니다. `IDLE_MS=0`이면 한 사용자가 탭 4개로 활성 용량 10%를 차지할 수 있습니다. [FE 설정](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/realtime/liveSpans/constants.ts%3A2)
- UX 위험: 41번째는 장애가 아니라 `paused`, 51번째는 재시도 가능한 429입니다. 사용자가 이유·대기 순서를 명확히 보지 못하면 “관제가 고장났다”고 느낍니다.
- 기우: 40명 때문에 곧바로 OOM 또는 writer 풀 전체 교착이 나는 구조는 아닙니다. 고유 SSE 바이트는 96MiB로 제한되고 느린 연결은 격리됩니다. [예산](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveStreamBytes.java%3A12)

## 권고 — 우선순위순

1. **40을 올리기 전에 실제 Apache 경유 10/40/100 부하 시험**: tick p95/max, `viewKey` 수, frame/egress Bps, writer queue, timeout·degraded·reject, Apache worker, heartbeat 간격을 함께 측정하십시오. [tick·writer](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java%3A98)
2. **상한을 검증된 설정 묶음으로 승격**: active/waiting/perUser/queue/write timeout/writer pool을 함께 조정하십시오. 8MiB 큐는 최대 8MiB frame과 짝이므로 근거 없이 먼저 줄이면 정상 multipart도 degrade됩니다. [하드코딩](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveStreamLimits.java%3A8)
3. **숨김 탭 정책 보완**: `IDLE_MS=0` 결정은 유지하더라도 브라우저당 EventSource 하나를 공유하거나, 활성 슬롯 표시·명시적 연결 종료 버튼을 두는 편이 상한 증설보다 효과적입니다.