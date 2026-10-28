C·A·D·G를 반영했습니다. **컴파일 성공, 선별 테스트 480건 통과**했습니다. 시작 시 worktree는 깨끗했고 `p5-live`와 `master`는 동일했습니다. 커밋하지 않았습니다.

| 항목 | 반영 내용·위치 |
|---|---|
| **C — 압박 카운터** | 누적 진단값은 보존하고 SSE에는 tick 간 증분을 전송합니다. 압박 해제 시 `0`도 발행합니다. [LiveSpanStreamService.java:199](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java:199) |
| **A — `live` 공급** | 저장 성공 후 메트릭 수집 → 읽기 전용 조회 → 서비스별 payload로 연결했습니다. [MetricIngestor.java:385](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:385), [LiveBuffer.java:235](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveBuffer.java:235), [LiveSpanRuntimePayload.java:10](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:10) |
| **A — 발송·기존 active 수정** | snapshot과 spans에 반영하고, 메트릭만 변경되거나 stale로 전환되어도 증분을 발행합니다. 기존 active 이력도 속성별 최신값 합산으로 수정했습니다. [LiveSpanSnapshot.java:95](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:95), [LiveSpanFrames.java:112](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanFrames.java:112), [LiveBuffer.java:516](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveBuffer.java:516) |
| **D — 통계 필드** | `minMs`·`sumMs` 추가. `histOverflow`는 `hist[14]` 사본이므로 합계에 더하면 중복이라는 주석을 추가했습니다. [LiveSpanStreamCodec.java:73](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamCodec.java:73) |
| **G — 골든** | 실제 송신 JSON 22개와 비교 테스트를 추가했습니다. 실패 메시지에 요청하신 FE 계약 변경 문구를 넣었습니다. [LiveSpanContractGoldenTest.java:24](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanContractGoldenTest.java:24) |

**`live` 출처·계산 규칙**

같은 프로세스의 P1.5 `LiveBuffer`에 저장 성공 후 들어온 메트릭을 사용합니다. 계산은 [LiveRuntimeMetrics.java:21](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:21)에 있습니다.

- `active`: **인스턴스 안 속성 조합별 최신값 합 → 인스턴스 합**. 관측 없음은 `null`, 실제 관측한 0은 유지합니다. 90초 초과 관측은 제외하고 `asOf`는 합산에 참여한 가장 오래된 관측 시각입니다.
- `expectedInstances`: 저장 성공을 최근 5분 안에 본 인스턴스 수의 추정치입니다. `instances[]`에는 stale 관측의 시각도 남깁니다.
- `cpuPct`: 인스턴스별 JVM CPU 우선, 없으면 process CPU. 신선한 값의 단순 평균·최댓값을 `%`로 제공합니다.
- `heapPct`: heap pool별 used와 양수 limit이 함께 있어야 계산합니다. 유효한 인스턴스 비율의 평균이며, 없으면 `null`입니다.
- `threads`: 속성별 최신값을 인스턴스 안에서 합산한 뒤 서비스 전체를 합산합니다.

**P1.5 보존 근거**

기존 DTO·10초 버킷·duration/route 집계는 유지했습니다. 런타임 캐시의 LRU를 분리해 런타임 전용 서비스가 기존 HTTP 이력을 밀어내지 않습니다. 저장 실패 시 미반영, 읽기의 무변경성, 기존 LRU 보존, **3개 인스턴스 × 3개 속성 조합의 15분 이력**을 테스트했습니다.

**골든 파일 목록**

위치: [src/test/resources/apm/contract](/C:/solutions/moveseye-be-spring-p5/src/test/resources/apm/contract). 아래 이름의 접미사는 모두 `.golden.json`입니다.

```text
snapshot.begin
snapshot.chunk.dict
snapshot.chunk.buckets
snapshot.end
spans
spans.empty-dict
heartbeat
control.paused
control.epochChanged
control.degraded.arena_pressure
control.degraded.connection_queue
control.degraded.frame_limit
control.reject.APM_VIEW_FORBIDDEN
control.reject.APM_LICENSE_REQUIRED
control.reject.APM_LIVE_DISABLED
control.reject.APM_LIVE_TOO_MANY_CONNECTIONS
control.reject.connected.APM_LIVE_QUEUE_FULL
control.reject.connected.APM_LIVE_FRAME_UNAVAILABLE
control.reject.connected.APM_LIVE_SNAPSHOT_FAILED
control.reject.connected.APM_LIVE_SNAPSHOT_UNAVAILABLE
control.reject.connected.APM_LIVE_UNAVAILABLE
control.reject.connected.APM_LIVE_TOO_MANY_CONNECTIONS
```

생성 UUID와 그 UUID에 종속된 CRC만 정규화했습니다. **실제 전송 바이트의 CRC는 별도로 검증**합니다.

**검증 결과**

| 선별 범위 | 통과 | 실패·오류·건너뜀 |
|---|---:|---:|
| `overview.live.*` | 177 | 0 |
| `collector.ingest.live.*` | 267 | 0 |
| `MetricIngestorTest` 추가 확인 | 36 | 0 |
| **합계** | **480** | **0** |

모두 `--max-workers=1`로 실행했습니다. `:compileJava`, `:compileTestJava`, `git diff --check`도 통과했습니다. 전체 회귀·bootRun은 실행하지 않았습니다.

**검수자가 확인할 위험·제한**

- 서비스 범위는 **기존 P5 사전 기준**입니다. 메트릭만으로 신규 서비스를 등록하지 않습니다. 사전 상한에 걸린 인스턴스는 `instances[]`에서 빠질 수 있습니다.
- 최신 캐시는 서비스당 **64개 인스턴스·256개 시리즈**, P1.5 active 이력은 **칸당 64개 속성 조합**으로 제한했습니다. 포화된 합계는 `null`로 처리하므로 실제 카디널리티 검수가 필요합니다.
- 기본 힙 추정치는 **63.73 MiB**입니다. 실제 heap·GC 실측은 수행하지 않았습니다.
- 큰 `live` payload는 기존 `snapshot.begin` **64 KiB 상한**에 닿을 수 있습니다. 분할 전송 계약은 변경하지 않았습니다.

`patterns{}`·FE 구현은 범위에서 제외했고, **P5 `enabled=false` 기본값을 유지**했습니다. 문서 정정 대상인 `control.resume` 미발송, 401의 `{code,errorCode}` 본문, `dictDelta.services/instances` 항상 포함, `histOverflow` 사본 규칙은 유지했습니다. 계약·설계 문서는 수정하지 않았습니다.
