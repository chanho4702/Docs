## R1~R10 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 부분 | `ApmCustomMetricGate.java:249-288`에서 마지막 성공 후 60초 초과 시 스냅샷을 비우고, 성공 시 `replaceRules()`로 복구한다. `MetricIngestor.java:513-524`상 내장 지표는 정적 표를 먼저 타므로 무영향이다. 다만 실패 때마다 `loadedAtMs`를 갱신한 뒤 TTL 조기 반환하므로, 첫 실패 감지가 늦으면 마지막 성공 후 약 90초까지 이전 규칙을 받을 수 있다. |
| R2 | 부분 | `V81__apm_custom_metric_rule.sql:33-38`에 `(service_id, metric_name)` 영속 원장이 생겼고, `ApmCustomMetricIT.java:141-168`이 50/51·새 Gate·규칙 교체·7일 만료를 검증한다. 규칙 삭제와 admission 삭제는 연결되지 않아 같은 이름 재등록은 같은 자리를 사용한다. 그러나 `ApmCustomMetricGate.java:376-381,405-425`의 무기한 JVM positive cache가 만료되어 DB에서 삭제된 자리를 계속 허용해 50 한도를 우회할 수 있다. 기동 preload나 배치 쓰기도 없고 첫 이름마다 `ApmCustomMetricGate.java:441-461`의 4~5개 SQL을 실행한다. |
| R3 | 부분 | `ApmCustomMetricGate.java:304-317`이 스냅샷에서 사라진 이름을 정리하고, `493-505`에 10,000 상한, `FoldWindow.record()`(`581-614`)에 동기화가 있다. 다만 1시간 만료는 상한 도달 시 `evictIdle()`을 호출할 때만 실행되고(`497-514`), `size()` 검사와 `computeIfAbsent()`가 원자적이지 않아 엄격한 상한도 아니다. |
| R4 | 닫힘 | pending 판정은 규칙 `id·updated_at`을 보존하며(`ApmCustomMetricGate.java:120-123`), UPDATE가 `id·updated_at·enabled=true·warned_at is null`을 모두 검사한다(`543-548`). 스냅샷 버전 변경 시 미기록 pending 판정도 폐기한다(`307-311`). |
| R5 | 닫힘 | 노드 로컬 표본으로 전역 규칙을 정지하지 않고 WARN만 기록한다(`ApmCustomMetricGate.java:507-523`). WARN 규칙은 enabled 상태이므로 계속 수신한다(`ApmCustomMetricRule.java:91-95`). 이는 갱신된 계약의 WARN 정책과 일치한다. |
| R6 | 부분 | 규칙별 `created_at` 이전 버킷은 제거하지만(`ApmCustomMetricSeriesService.java:65-75`), DB 조회 자체는 요청 `from`부터 전부 읽고(`60`), 하한을 `floor(created_at)`으로 내려 잡는다(`68`). 따라서 생성 시각이 포함된 1m/5m/1h 버킷에는 이전 incarnation 데이터가 섞일 수 있다. |
| R7 | 부분 | 첫 종류는 DB CAS로 확정하고(`ApmCustomMetricGate.java:202-227`), 이후 불일치는 `CUSTOM_KIND_UNSUPPORTED`로 폐기한다(`MetricIngestor.java:588-593`). 다만 삭제→동일 이름 재등록 후 30초 전파 창 동안 이전 노드가 옛 `RuleView.valueKind`로 저장할 수 있어 새 규칙의 종류와 혼합될 수 있다. |
| R8 | 닫힘 | 정확히 128자는 `NAME_TRUNCATED`, 129자 이상은 `NAME_INVALID`로 구분한다(`ApmCustomMetricNamePolicy.java:61-67`). 폐기 응답도 길이 128인 이름을 `metricNameTruncated=true`로 표시한다(`ApmIngestDropsDto.java:110-113`). |
| R9 | 닫힘 | 감사 필드를 먼저 캡처하고 `afterCommit`에서만 로그를 남긴다(`ApmCustomMetricRuleService.java:314-325,335-341`). 트랜잭션 롤백 시 감사 로그가 남지 않는다. |
| R10 | 부분 | 실제 PostgreSQL IT가 50/51, 새 Gate, 기존 자리, 규칙 이름 교체 및 7일 만료를 검증한다(`ApmCustomMetricIT.java:141-168`). 그러나 실제 삭제 API→재등록, 512-service cache 축출, admission 동시 경합, 만료된 positive cache, 늦게 감지된 fail-closed, 다중 서비스 잠금 순서 테스트는 없다. |

## 새 결함

- N1 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:251-252,273-286` · fail-closed가 계약상 60초보다 늦어질 수 있다 · 실패 시 `loadedAtMs=now`로 다시 30초 동안 검사를 생략한다. 예를 들어 성공 t=0, 첫 실패 t=45이면 t=60·75 호출은 조기 반환하고 t=90에야 닫힌다 · 실패 상태에서는 TTL 조기 반환 전 `now-lastSuccessMs >= 60초`를 검사하거나, retry TTL과 fail-closed deadline을 별도 상태로 관리한다.

- N2 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:376-381,388-415,417-425,443-461` · 만료된 JVM admission cache가 DB 정본을 우회해 서비스당 50개를 초과 수신할 수 있다 · DB가 7일 지난 A를 삭제하고 새 B에 자리를 줘도 `admitted`에는 A가 남는다. A가 돌아오면 0행인 touch UPDATE 결과를 무시하고 STORE한다. 반복하면 DB 50석 외에 캐시의 과거 이름까지 수신한다 · positive cache에도 admission 만료를 적용하고, touch가 0행이면 반드시 advisory lock 아래 재판정·재삽입한 뒤에만 STORE한다.

- N3 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:358-371,437-461` · cold start/LRU 축출 후 수신 경로가 이름마다 4~5개 SQL을 수행한다 · 기동 preload·배치 판정이 없으며 `ON CONFLICT`도 단건이다. 20개 이름×다수 서비스가 한 배치에 오면 수백~수천 round-trip이 배치 트랜잭션 안에서 발생한다 · 배치의 `(serviceId, metricName)`을 먼저 수집해 서비스별 기존 admission을 한 번에 조회하고, 신규분을 batch UPSERT한다.

- N4 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:386-404` · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:441-442` · 여러 서비스를 포함한 동시 배치가 advisory xact lock을 반대 순서로 획득해 교착될 수 있다 · 잠금은 트랜잭션 종료까지 유지되지만 서비스 순서는 payload 순서다 · 배치 시작 시 필요한 서비스 ID를 정렬해 한 번씩 잠그거나, 서비스별 admission을 독립된 일관된 순서의 배치 단계로 분리한다.

- N5 · 권장 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:304-311,325-329` · 규칙 버전이 바뀌어도 `foldWatch` 이력이 유지된다 · pending warning만 버전 비교로 제거하며, `foldWatch`는 이름이 사라질 때만 제거한다. 다른 노드의 clear-warning 및 동일 이름 재등록은 이전 59분 이력을 이어받아 즉시 다시 WARN이 될 수 있다 · id 또는 `updated_at`이 달라진 이름의 `foldWatch`도 스냅샷 교체 시 제거한다.

- N6 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmCustomMetricSeriesService.java:60,68-75` · 동일 이름 재등록 시 생성 버킷의 이전 incarnation 값이 조회에 섞인다 · `floor(created_at)` 버킷을 남기며 SQL은 이미 해당 버킷을 집계한 뒤다. 1h 조회에서는 최대 약 1시간의 이전 값이 새 규칙 데이터로 보일 수 있다 · 이전 값 혼입을 금지하려면 생성 시각 다음 완전 버킷부터 노출하거나, incarnation을 저장 데이터와 연결할 수 있는 별도 세대 식별자를 도입한다.

- N7 · 필수 · `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/custom/ApmCustomMetricGate.java:161-168,202-205,249-268` · 동일 이름 재등록의 전파 창에서 서로 다른 kind가 같은 시계열에 저장될 수 있다 · 이전 노드는 옛 GAUGE snapshot을 최대 30초 유지하고, 새 노드는 새 규칙을 COUNTER로 확정할 수 있다 · 재등록 시 이전 kind를 승계하거나, 새 세대를 전 노드 전파 뒤 활성화하거나, 세대가 맞지 않는 stale snapshot의 저장을 차단한다.

- N8 · 권장 · `src/main/java/com/dmove/moveseye/premium/apm/collector/custommetric/ApmCustomMetricRuleService.java:79-83` · 용량 예산이 WARN 규칙을 제외해 실제 저장량을 과소평가한다 · WARN은 계속 enabled 상태로 저장하지만 `STATUS_ACTIVE`만 센다. 전부 WARN이면 `seriesPerServiceMax`와 일일 용량이 0으로 표시된다 · 상태 문자열 대신 `ApmCustomMetricRule::isEnabled`로 계산한다.

- N9 · 권장 · `src/main/resources/db/migration/V81__apm_custom_metric_rule.sql:33-38` · admission 원장의 만료 행이 서비스를 다시 수신하지 않으면 영구 잔존한다 · 정리는 해당 서비스의 cache miss 때만 실행되고 `last_seen_at` 전역 정리 인덱스나 서비스 FK cascade가 없다 · 주기적 전역 retention과 `last_seen_at` 인덱스를 추가하거나, 서비스 FK `ON DELETE CASCADE`와 별도 만료 정리를 둔다. 현재 hot query는 PK 선두 `service_id`를 사용하므로 별도 서비스 인덱스는 불필요하다.

## 판정

수정 후 재검수

이유 1: 만료된 JVM admission cache가 DB 원장을 우회해 서비스당 50개 상한을 실제로 넘길 수 있어 수신 관문이 아직 안전하지 않다.  
이유 2: fail-closed 지연, 단건 SQL·잠금 교착 가능성, 재등록 세대의 과거 값/kind 혼합도 계약을 완전히 닫지 못했다.

확인하지 못한 것:

- 요청에 따라 빌드·단위 테스트·IT는 실행하지 않았다.
- 실제 PostgreSQL query plan, lock wait 및 교착 재현, cold-start 처리량은 측정하지 않았다.
- 다중 노드에서 삭제→동일 이름 재등록 및 clear-warning 직후의 실시간 동작은 실행 검증하지 않았다.
- V81 번호가 다른 미병합 브랜치와 충돌하는지는 현재 워크트리 밖 전체 ref를 재검증하지 않았다.
- V81은 additive 테이블만 추가하므로 애플리케이션 롤백 자체를 막는 DDL은 정적 검토상 발견하지 못했다.