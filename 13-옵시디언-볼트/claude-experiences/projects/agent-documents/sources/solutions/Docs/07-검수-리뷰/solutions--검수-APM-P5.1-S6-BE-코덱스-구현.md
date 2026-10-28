A·B 구현을 완료했습니다. **선별 테스트 883건 통과, 실패·오류·skip 0건**입니다. 변경은 `p5-live`에 미커밋 상태로 남겼으며 HEAD는 `3c76a74`입니다.

| 항목 | 구현·근거 |
|---|---|
| **A-Y1** | `frame_limit`·`arena_pressure`·`connection_queue`와 `clientKeepRatio`를 실제 발생 상황에서 단언하는 [회귀 3건](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSnapshotRemainingTest.java:35) 추가 |
| **A-Y2** | [점당 90 B 산정](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:14), 만석 산식의 유지 비율 **0.828504** 검증 |
| **A-Y3** | [전송량 초과 시 표본 축소·재시작](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:26). 새 `snapshotId`로 재전송하고 최종 checksum·종료 이벤트 검증 |
| **B1** | [라이브 YAML](/C:/solutions/moveseye-be-spring-p5/src/main/resources/apm/collector-live-template.yaml:1), `summary: silent`, 안전 필터 13조건, gate 경고 추가. [생성 조건](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java:126)은 `liveSpans=true`이며 기본 꺼짐 |
| **B2** | [설치 가이드](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmInstallGuideService.java:160)에 3개 OS gate 실행 인자, 기존 서비스 갱신, BSP 지연·큐 안내 추가 |
| **B3** | [메트릭 조회](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorMetricStore.java:76), [로그 계수·보존](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorLogStore.java:29), [V59](/C:/solutions/moveseye-be-spring-p5/src/main/resources/db/migration/V59__apm_collector_live_observation.sql:1) 연결. exporter·`error_type`, 안전 필터 라벨, component·pipeline별 WARN, partial 거절을 분리 |
| **B4** | [후조건 카나리아](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveSpanParser.java:139) 11종 계수. 원문을 로그·계수 라벨에 남기지 않으며 수신 집계 유지 검증 |
| **B5** | [`GET /apm/collectors/{id}/live`](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ApmCollectorController.java:78)과 [응답 계약](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorLiveDto.java:5) 추가. 결측은 `null`, BE 누적값은 `scope: "node"`로 구분 |

정본과의 차이·구체화는 다음과 같습니다.

- snapshot은 정수 `1/k` 대신 연속 유지 비율을 사용했습니다. 만석에서 약 0.83이라는 기대값을 보존하기 위해서입니다.
- deprecated 별칭은 `otlp_http`·`resource_detection`으로 교체했습니다. 라이브 YAML 실행 문장은 자기계측 서비스명 치환을 제외하고 정본과 일치합니다.
- gate 경고는 관리자 문구로 작성했습니다. 누락 시 정리가 적용되지 않고 전송 전 차단될 수 있음을 안내합니다.
- 내부 OTLP 로그의 라벨이 **scope 속성**에 실리는 것을 확인해, 각 로그로 복사한 뒤 원문·불필요 속성을 제거하도록 구현했습니다.

검증은 `:compileJava`·`:compileTestJava`, `--max-workers=1` Collector·라이브 패키지 선별 실행, `git diff --check`까지 통과했습니다. 실제 Collector 0.159.0에서 **validate·Windows 시작 인자 실행·gate ON/OFF·위험 fixture 15종 차단·정리 문장 실패·WARN 수집·저장 SQL 마스킹**을 검증했습니다. [테스트 결과](/C:/solutions/moveseye-be-spring-p5/build/reports/tests/test/index.html)

검수 시 확인할 한계는 다음과 같습니다.

- Linux·macOS 서비스 실행은 문자열 회귀까지 검증했습니다.
- snapshot 재시작 시 FE는 새 `snapshotId`로 이전 미완 snapshot을 교체해야 합니다. 사전·통계만으로 상한을 넘는 축소 불가능 경로의 거절은 남아 있습니다.
- 로그가 조용해도 90초 후 관측값은 `null`입니다. WARN·부분 거절 로그 계수는 샘플링된 관측치이며 손실 수가 아닙니다.
- 화면 P5.2·P5.3, 7단계 계약 표본 고정, 전체 회귀·출시 부하 검증은 이번 범위 밖입니다. `app.apm.live.spans.enabled=false`를 유지했습니다.
