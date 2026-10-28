한국어로 읽기 전용 독립 검토를 수행하세요. 파일 편집·명령 실행·테스트·DB·커밋은 하지 마세요. 사용자 요청은 APM 감사 우선순위를 순차 구현·검증하고 마지막에 문서화하는 것입니다.

이미 완료: raw-text 권한 aab73fc, cumulative 원시 신원·epoch/schema·상태예산 BE22eeff8 + FE59186c0. 원시계열 작업을 다시 설계하지 마세요.

현재 구현 중인 순위5+필수7 메트릭 시간창/삭제날짜 guard 설계를 검토합니다.
- 계획: C:/solutions/_workspace/planning/apm-late-rollup-20261006.md
- 계약: C:/solutions/_workspace/contract_apm-late-rollup-20261006.md
- 코드 기준: C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmRollupService.java, core/batch/retention/ApmRetentionService.java, core/batch/partition/ApmPartitionService.java, collector/ingest/store/ApmMetric1mStore.java 및 MetricIngestor.java
- 필요 시 관련 archive gate와 기존 실제 PostgreSQL IT를 읽어도 됩니다.

핵심 목표: 실제 수신 성공한 지원 시간창의 1m 원본 변경은 5m/1h에 재정산되거나 영속 미완료로 남고, 그 전에 원본이 삭제되지 않음. durable bounded stage/bucket dirty queue+generation 조건부 ACK, 5m 결과→1h marker→5m ACK 같은tx, normal/repair stage advisory lock, producer/consumer 날짜shared vsretentionexclusive, DDL 전과 tx 잠금후 시간/retired 확인, bounded bootstrap을 제안했습니다. 기존 receipt·메모리 checkpoint의 rollback 안전성과 histogram 의미를 보존해야 합니다.

실제 코드/계획에 근거한 차단 반례를 중요도순으로 짧게 제시하세요. 특히 잠금 순서(5m ACK와1h enqueue budget 순서), txn 안의 budget '짧은잠금' 의미, 부트스트랩과 이미 일부 삭제된 source로 상위값 축소, 동시수신 generation 경합, DDL 준비↔DROP경합/단조retired 경계, latest vsrepair기아, queuefull 원자성을 확인하세요. 아카이브 파일의 과거 source freshness는 별도 순위8 연결 과제임을 구분하세요. 운영 HA/실규모를 검증했다고 주장하지 말고 설계와 아직 미구현인 내용을 구분하세요. 모든 가능성을 장황하게 나열하기보다 반드시 닫아야 할 3~6개 반례와 최소 실제DB시험을 우선해 주세요.
