한국어로 답하세요. 읽기 전용 검토입니다. 파일 수정, 테스트, 프로세스 실행, 커밋은 하지 마세요. 현재 사용자 요청은 APM 감사에서 나온 우선순위를 순차 구현하고 검증하는 것입니다. 다른 작업자가 과거 원문 열람 결함을 고쳐 root가 테스트 중입니다.

검토할 설계: C:/solutions/_workspace/features/apm/hardening-20261006/apm-cumulative-correctness-20261006.md
관련 실제 코드: C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/metric 및 premium/apm/collector/ingest/normalize/CumulativeDeltaTracker.java, store/MetricIngestor.java, store/ApmMetricBatchWriter.java.
기존 재현: C:/solutions/_workspace/features/apm/hardening-20261006/apm-20261006-review-data.md

이번 검토는 2~4순위의 구현 전 설계 검토입니다. 정규화된 저장 dims로 누적값을 차분하는 충돌, 역순 관측의 거짓 reset, histogram bounds 변경의 불일치를 고치며 원시계열 상태 수와 snapshot 배열 수의 보호 예산을 함께 둡니다. 기존 receipt/DB 원자성/stripe lock/commit 이후 checkpoint publication을 유지해야 합니다.

root 보정사항: 공식 OTel 문서의 startTime==time unknown reset은 첫 증가 기여0이므로 최초 age 조건은 0<age<120초입니다. 새 epoch의 startTime==time도 전체값 재가산 금지입니다. 설계 문서가 갱신 중일 수 있으니 이를 반영해 판단하세요.

구체적으로 (1) 주요 수치 오류가 닫히는지, (2) 순서/epoch/schema 정책의 반례, (3) 원시 typed identity와 cardinality/메모리 예산 누수·교착, (4) 기존 영수증/rollback/commit 실패 원자성 회귀, (5) 누락된 최소 시험을 검토하세요. 가능성이 아니라 실제 코드와 설계의 근거를 붙이고 중요도순으로 짧게 답하세요. HA/durable checkpoint·정확한 과거 버킷 재배분은 명시적 미해결이므로 이번 패치를 그 기능까지 해결한 것으로 평가하지 마세요. blocking이 없으면 그것도 명시하세요.
