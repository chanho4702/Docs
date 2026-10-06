R1·R2를 모두 반영했습니다. **최종 선별 테스트 479건 통과**, 실패·오류·skip은 0건입니다. 문서·계약서는 수정하지 않았습니다.

| 필수 항목 | 반영 내용 · 파일:행 |
|---|---|
| 1. begin 크기 | 미관측 서비스 생략. SSE envelope를 포함한 실제 크기로 제한하고, 초과 서비스는 생략하며 `liveTruncated:true` 표시. [LiveSpanRuntimePayload.java:15](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:15), [LiveSpanSnapshot.java:123](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:123) |
| 2. overflow 격리 | `(instance, kind)`별 관리. 한 인스턴스가 넘쳐도 다른 인스턴스·종류는 유지. [LiveRuntimeMetrics.java:53](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:53) |
| 3. 인스턴스 탈락 표시 | 추적 상한 초과 또는 사전 매핑 누락 시 `live.<serviceId>.truncated:true`. `observedInstances`는 실제 합산 참여 수. [LiveSpanRuntimePayload.java:40](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimePayload.java:40) |
| 4. active 주석 | 시리즈별 최신값 합산 규칙으로 정정. 기존 테스트에도 다른 시리즈를 추가해 합산을 검증. [ApmLiveDto.java:79](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveDto.java:79), [LiveBufferTest.java:148](C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/LiveBufferTest.java:148) |
| 5. heapPct | 신선한 heap의 `Σused / Σ유효 limit × 100`으로 변경. pool별 매칭 제거. [LiveRuntimeMetrics.java:105](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:105) |
| 6. 시리즈·메모리 | `MAX_SERIES=2048`, 메모리 산술 주석 추가. 기본 전체 추정 **158.26MiB**, 예산 **192MiB**로 조정하고 YAML도 동기화. [LiveRuntimeMetrics.java:8](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:8), [ApmLiveProperties.java:153](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveProperties.java:153), [application.yml:180](C:/solutions/moveseye-be-spring-p5/src/main/resources/application.yml:180) |
| 7. 압박 누적값 | 내부 진단 카운터만 유지하고 SSE에는 구간값만 보내는 결정을 주석으로 명시. [LiveSpanStreamService.java:196](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java:196) |

🟡 항목별 처리 결과입니다.

| 항목 | 처리 |
|---|---|
| 1 | **반영**. threads는 최신 export의 조합만 합산. [LiveRuntimeMetrics.java:88](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:88) |
| 2 | **반영**. 위 7번 결정 적용. 문서 정정은 Claude 담당. |
| 3 | **반영**. 위 4번 적용. |
| 4 | double 직렬화 유지. 계약 문서 표기 사항. |
| 5 | nullable instance 값·`asOf` 유지. FE 타입·문서 사항. |
| 6 | 빈 stats의 min/sum/max=0 유지. `count>0` 조건 문서화 사항. |
| 7 | P1.5 스위치 종속 유지. 기존 설정 의미를 보존하고 계약에 명시할 사항. |
| 8 | **반영**. 빈 속성 SHA-256 결과 재사용, 만료 스캔을 초당 최대 1회로 제한. snapshot도 먼저 그룹화. [LivePoint.java:109](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LivePoint.java:109), [LiveRuntimeMetrics.java:30](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/LiveRuntimeMetrics.java:30) |
| 9 | **반영**. 위 6번 적용. 지연 할당을 이유로 최악 추정치를 낮추지 않음. |
| 10 | **반영**. 사전 만석 시 메트릭 전용 항목이 새 span에 자리를 양보. 기존 span ID 보호·ID 재사용 금지 검증. [LiveSpanDictionary.java:84](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanDictionary.java:84) |
| 11 | 모든 허용 메트릭을 expected 분모에 포함하는 설계 유지. UX 문구 사항. |
| 12 | **부분 반영**. 실제 HTTP 400 `APM_LIVE_INVALID_QUERY` 골든 추가, 총 **23개**. 나머지 4개 기존 분기 골든은 후속 보강으로 보류, `patterns`는 P5.4 범위. [LiveSpanContractGoldenTest.java:116](C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanContractGoldenTest.java:116) |
| 13 | **부분 반영**. ID 누락은 `identityIncomplete:true`로 표시. 서로 다른 런타임의 복원은 입력만으로 불가능하므로 미해결. |
| 14 | **보류**. 빈 프레임 생략은 현재 재생의 연속 `seq` 검사를 깨므로 재생 규칙과 함께 변경해야 함. [LiveSpanStreamService.java:355](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java:355) |

추가로, 관측 소스가 LRU·clear로 사라지면 이전 FE 값을 지우는 빈 payload를 한 번 발행하도록 보완했습니다. [LiveSpanStreamService.java:265](C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java:265)

G1 최종 실측은 JDK 17 테스트 JVM의 `MemoryPoolMXBean → MetricIngestor → LiveBuffer` 경로입니다. DB store는 mock입니다.

| G1 pool | used(B) | max(B) |
|---|---:|---:|
| Eden | 167,772,160 | -1 |
| Survivor | 13,289,024 | -1 |
| Old Gen | 100,307,968 | 1,073,741,824 |

`281,369,152 / 1,073,741,824 × 100`으로 **heapPct=26.20454431%**가 나왔습니다. [실측 테스트](C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveRuntimeIngestTest.java:18)

| begin 실측 조건 | SSE 전체 크기 | begin의 live 서비스 | 결과 |
|---|---:|---:|---|
| 300서비스·각 3인스턴스 | **65,402B** | 177 | `snapshot.end` 완료, 이후 변경 프레임에 300개 전달 |
| 300서비스·미관측 | **707B** | 0 | `snapshot.end` 완료 |
| 실제 링 200서비스·각 3인스턴스 | **65,401B** | 177 | `snapshot.end` 완료 |

기존 링 상한은 200이므로, 300서비스 검증은 catalog를 주입하고 실제 SSE codec·writer를 통과시켰습니다. [크기 회귀 테스트](C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRuntimeStreamTest.java:24)

| 최종 선별 범위 | 테스트 | 실패 / 오류 / skip |
|---|---:|---:|
| `overview.live.*` | 189 | 0 / 0 / 0 |
| `collector.ingest.live.*Test` | 254 | 0 / 0 / 0 |
| `MetricIngestorTest` | 36 | 0 / 0 / 0 |
| **합계** | **479** | **0 / 0 / 0** |

모든 실행은 `:test --max-workers=1 --no-daemon`으로 한정했습니다. IT는 제외했으며 `git diff --check`도 통과했습니다.

검수 시 확인할 위험은 다음과 같습니다.

- FE가 `liveTruncated`, `truncated`, `identityIncomplete`를 처리해야 부분 관측이 드러납니다.
- begin에서 생략된 서비스는 해당 서비스의 후속 변경까지 값이 비어 있을 수 있습니다.
- `APM_LIVE_MAX_HEAP_MB=64`를 명시한 환경은 기본 규모에서 기동 검증에 실패합니다. **158.26MiB는 계산상 추정치**이며 실제 최대 heap·GC 부하 실측은 남아 있습니다.
