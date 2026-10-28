필수 **R1~R3과 코드 수정 항목을 반영했습니다.** `p5-live`, HEAD `3c76a74` 유지, 커밋하지 않았습니다.

| 항목 | 반영 내용 · 위치 |
|---|---|
| R1 | 자기 로그의 `recentTracker` 호출 제거. 자기 로그만 수신하면 `received=false`. [ApmOtlpController:379](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java:379) |
| R2 | 전역 별칭 치환 삭제, k8s·라이브 exporter 정의와 참조를 직접 수정. 관측 분기의 신·구 별칭 유지. [ApmCollectorConfigGenerator:698](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorConfigGenerator.java:698) |
| R3 | 기존 `series`의 실패·큐 집계에서 라이브 exporter 제외. 라이브 전용 필드에는 유지. [ApmCollectorMetricStore:209](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorMetricStore.java:209) |
| Y-d | 골든 바이트 비교와 고정 MD5 검증 추가. 실패 메시지에 **“R-P5b 재시험 필요”** 명시. [ApmCollectorLiveConfigTest:37](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorLiveConfigTest.java:37) |
| Y-b | 최대 **3회 시도**, `transferred` 누적 유지, 잔여 예산으로 축소. 한계 도달 시 503 거절·종료. 제어 메시지용 1KiB 예약. [LiveSpanSnapshot:32](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanSnapshot.java:32) |
| Y-c | 실제 버킷 200점과 지수 표기·ID 경계값의 직렬화 크기 회귀 추가. [LiveSnapshotRemainingTest:56](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSnapshotRemainingTest.java:56) |
| Y-e | `APM_RUNTIME_REQUIRED=1`이면 바이너리 부재를 실패로 처리. [ApmCollectorLiveRuntimeTest:35](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorLiveRuntimeTest.java:35) |
| Y-p | 성공 시 임시 파일 정리, 실패 시 보존. Windows 파일 잠금은 최대 5초 재시도. [ApmCollectorLiveRuntimeTest:201](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/config/ApmCollectorLiveRuntimeTest.java:201) |
| Y-k·Y-u | `Set`·`Pattern` 상수화, scope 속성 잔존을 `scopeResidue`로 분류. [LiveSpanParser:31](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/live/LiveSpanParser.java:31), 같은 파일:253 |
| Y-l·Y-n | macOS 미로드 상태에서도 `bootstrap` 실행, `OTEL_SERVICE_NAME`을 첫 항목으로 복귀. [ApmInstallGuideService:175](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/install/ApmInstallGuideService.java:175), 같은 파일:651 |
| Y-m | 라이브 endpoint 자리표시 범례 추가. [collector-template.yaml:7](/C:/solutions/moveseye-be-spring-p5/src/main/resources/apm/collector-template.yaml:7) |
| Y-o | 실제 로그 저장소를 경유하는 자기 로그·앱 로그·400·503 회귀 추가. [ApmOtlpControllerTest:377](/C:/solutions/moveseye-be-spring-p5/src/test/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpControllerTest.java:377) |
| Y-r | 최근 `sent_spans`가 있고 실패 계열이 미생성일 때만 0 추정. 오래된 실패 계열은 `null` 유지. [ApmCollectorMetricStore:121](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorMetricStore.java:121) |
| Y-s | 라벨 선점을 신규 라이브 계열로 제한. 기존 계열의 차원 선택·해시 보존 회귀 추가. [ApmDimsNormalizer:187](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/ApmDimsNormalizer.java:187) |
| Y-t | `other`의 0행이 로그 수집 생존 신호라는 의도를 코드·DTO에 명시. [ApmCollectorLogStore:15](/C:/solutions/moveseye-be-spring-p5/src/main/java/com/dmove/moveseye/premium/apm/collector/state/ApmCollectorLogStore.java:15) |

**골든 보존:** [골든 파일](/C:/solutions/moveseye-be-spring-p5/src/test/resources/apm/contract/r-p5b-live-processors.golden)은 2,902B이며, 라이브 프로세서 구간의 MD5는 기존 **`944bde2816044f51aadc30c45fcb3801`**과 같습니다. 조건 수 13개를 유지하는 `IsMatch` 범위 완화, `summary: info`, scope `keep_keys` 변경도 검출했습니다. R-P5b 재시험은 하지 않았습니다.

**선별 검증:** 중복 실행을 제외한 각 테스트의 최종 결과는 **371건 통과, 실패 0, skip 0**입니다. 모두 `--max-workers=1`로 실행했습니다.

| 범위 | 통과 |
|---|---:|
| 설정·설치·프로퍼티 | 198 |
| 수신·카나리아·정규화·보안·토큰 | 89 |
| 실제 PostgreSQL·조회·API | 35 |
| snapshot·SSE | 45 |
| 런타임 클래스 | 4 |

런타임에는 **Collector 0.159.0 실제 구동 5개 시나리오**가 포함됩니다. 전체 `:test`는 실행하지 않았고, `git diff --check`도 통과했습니다.

**미반영·검수 위험:**

- **Y-f 및 정본 반영 ①~⑤:** 요청대로 Claude 담당으로 남겼습니다.
- **Y-g/h/i:** 출시 부하 검증은 미실행입니다. 자기 메트릭 증가량, 내부 로그 전송량, BE 장애 시 로그 피드백 루프는 남은 검증 대상입니다.
- FE는 새 `snapshot.begin` 수신 시 직전 미완성 버퍼를 폐기해야 합니다. snapshot 회귀는 축소한 예산으로 검증했으며, 운영 32/96MiB 규모 부하 검증은 포함하지 않았습니다.
