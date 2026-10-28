- R1 · 필수 · `src/main/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGate.java:199` · 설정 캐시 갱신 실패 시 기존 ACTIVE snapshot을 계속 사용하여 수신 관문이 fail-open된다 · 근거: DB 조회 실패 후 `loadedAt`만 갱신하고 이전 `snapshot`을 유지하므로, 삭제·비활성화·자동 정지된 규칙이 반복 장애 동안 무기한 custom metric을 수신한다. `ApmCustomMetricGateTest.java:230`도 이 동작을 정상으로 고정한다 · 수정안: 갱신 실패 시 custom rule snapshot을 빈 값으로 교체하는 fail-closed 정책을 적용하되, 정적 `ApmMetricAllowlist` 경로는 그대로 통과시키고 해당 장애 동작을 테스트한다.
- R2 · 필수 · `src/main/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGate.java:262` · 서비스당 50개 상한이 JVM 재기동·LRU 축출·규칙 삭제 후 재등록으로 초기화되어 누적 custom series를 제한하지 못한다 · 근거: 복원 쿼리가 최근 1일이면서 현재 규칙 이름(`rules.keySet()`)인 행만 읽고, 서비스 상태도 최대 512개인 node-local 메모리다. 이름을 삭제한 뒤 새 이름을 등록하거나 서비스가 축출·재기동되면 과거 승인 이름을 잊고 다시 50개를 허용하며, 다중 노드에서는 서로 다른 이름 집합을 각각 승인할 수 있다 · 수정안: `(serviceId, metricName)` admission을 DB의 durable/global 상태로 관리하고 advisory lock 또는 unique constraint 아래에서 원자적으로 50개를 검사한다. 삭제·재기동·보존 기간 동안 admission 이력이 사라지지 않도록 lifecycle을 명시한다.
- R3 · 필수 · `src/main/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGate.java:117` · `foldWatch`가 이름 churn에 비례해 무제한 증가하여 수신 관문 자체에 메모리 카디널리티 구멍이 생긴다 · 근거: `ConcurrentHashMap<String, FoldWindow>`에 metric 이름마다 항목을 만들지만 규칙 삭제·disable·cache refresh에서는 제거하지 않고 명시적 resume 때 해당 이름만 제거한다. 관측 이름을 계속 바꾸며 등록→수신→삭제하면 L1=20과 무관하게 항목이 누적된다 · 수정안: snapshot 교체 시 더 이상 존재하지 않는 이름을 정리하고, generation과 TTL을 가진 bounded 구조 또는 durable 집계로 전환한다.
- R4 · 권장 · `src/main/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGate.java:370` · 지연된 자동 정지가 관리자의 resume 또는 같은 이름의 재등록 결과를 다시 정지시킬 수 있다 · 근거: UPDATE 조건이 `metric_name`, `enabled`, `suspended_at`뿐이라 node B가 계산한 오래된 suspension이 node A의 resume 또는 삭제→재생성 이후 행에도 일치한다. `pendingSuspensions` overlay도 새 ACTIVE snapshot을 다시 정지 상태로 해석한다 · 수정안: 판단 시점의 rule ID/version/`updated_at`을 보관하고 이를 포함한 optimistic CAS로 갱신하며, generation이 바뀐 pending decision은 폐기한다.
- R5 · 권장 · `src/main/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGate.java:332` · 50%/1h 자동 정지가 node-local 표본으로 전역 규칙을 정지시켜 다중 노드에서 잘못된 정지가 발생한다 · 근거: 한 노드가 소량의 folded 요청만 받아 local ratio 100%가 되면, 다른 노드에서 대량의 정상 저장이 이뤄져 전역 비율이 50% 미만이어도 DB 규칙 전체를 정지한다 · 수정안: PG 기반 minute aggregate 등 공유 집계로 전역 비율을 계산한 뒤 단일 CAS로 정지하거나, node-local 판단이 전역 정지를 일으키지 않도록 정책을 변경한다.
- R6 · 권장 · `src/main/java/com/dmove/moveseye/apm/service/ApmCustomMetricSeriesService.java:60` · 같은 이름을 삭제 후 재등록하면 새 규칙 생성 전의 과거 데이터가 조회 결과에 섞인다 · 근거: 현재 규칙 이름 목록만 `IN` 조건으로 사용하고 `rule.createdAt`별 하한을 적용하지 않아, 보존 중인 이전 incarnation의 point와 `received`가 새 `ruleCreatedAtMs`보다 앞선 시각에 나타난다 · 수정안: metric별 `createdAt`을 SQL에 결합하거나 결과 집계 전에 각 metric의 생성 시각 이전 행을 제외하고 `received`도 동일 범위로 계산한다.
- R7 · 권장 · `src/main/java/com/dmove/moveseye/apm/service/ApmCustomMetricSeriesService.java:89` · 같은 이름으로 GAUGE와 SUM이 들어오면 한 시계열로 병합되고 조회 시 단일 kind로 오판된다 · 근거: 규칙과 저장 key에 kind가 없고 UPSERT는 두 kind의 count/sum/min/max를 합친다. 조회는 min/max 존재 여부만으로 전체 범위를 GAUGE 또는 COUNTER로 판정하므로 배포 변경이나 instance 간 instrument kind 불일치가 복구 불가능한 데이터 혼합을 만든다 · 수정안: 규칙에 고정된 `valueKind` 또는 최초 관측 kind를 저장하고 이후 불일치를 거절하며, 조회는 저장된 kind를 사용한다.
- R8 · 권장 · `src/main/java/com/dmove/moveseye/apm/custommetric/ApmCustomMetricRuleService.java:301` · 128자를 넘는 관측 이름의 잘린 접두사가 “최근 관측됨” 검증을 통과하지만 실제 수신 이름과 일치하지 않는 유령 규칙이 된다 · 근거: `ApmIngestDropStatRecorder.java:258`이 `metric_name`을 128자로 자르는 반면 등록 검증은 저장된 문자열과 exact match한다. 잘린 128자 이름은 이름 정책을 통과하지만 원래 긴 metric은 계속 `NOT_ALLOWLISTED`로 폐기된다 · 수정안: truncation 여부나 원본 길이/hash를 별도로 기록하여 등록 대상에서 제외하고 `NAME_INVALID` hint를 제공한다.
- R9 · 권장 · `src/main/java/com/dmove/moveseye/apm/custommetric/ApmCustomMetricRuleService.java:237` · 감사 로그가 transaction commit 전에 기록되어 실패한 변경도 성공한 관리 작업처럼 남는다 · 근거: create·enable/disable·resume·delete가 모두 transactional method 내부에서 DB 변경 직후 `[APM-ALLOWLIST]`를 출력하므로 이후 commit 실패나 rollback과 로그가 불일치한다 · 수정안: immutable audit payload를 캡처한 뒤 transaction `afterCommit`에서 출력하거나 durable outbox를 사용한다.
- R10 · 권장 · `src/test/java/com/dmove/moveseye/apm/collector/ingest/custom/ApmCustomMetricGateTest.java:86` · 상한 테스트가 단일 JVM의 축소된 3/4 경계만 검증하여 실제 우회 경로를 잡지 못한다 · 근거: 50/51번째, 규칙 삭제→재등록, JVM 재기동 후 warming, 512개 서비스 LRU 축출, 다중 노드 admission·자동 정지 경합 테스트가 없다. 캐시 실패 테스트는 오히려 R1의 fail-open을 기대한다 · 수정안: 실제 50/51 경계와 durable-state lifecycle, cache 장애, stale suspension CAS 및 다중 노드 시나리오를 포함한 integration test를 추가한다.

- 기존 지표 경로: 이상 없음 — `MetricIngestor.java:513`에서 정적 `ApmMetricAllowlist.find()`를 먼저 적용하고 실패한 경우에만 custom gate로 진입한다. 같은 이름의 규칙은 API 검증에서도 거부되며 기존 allowlist 정의 자체는 변경되지 않았다. 실측 payload의 Row 전 필드를 비교하는 회귀 테스트도 존재한다.
- 등록 검증: 이상 없음 — 최근 관측 판정은 persistent `apm_ingest_drop_stat`을 사용하며, 예약 prefix는 `RuntimeSlotMap`의 case-insensitive family 판정과 연결된다. HISTOGRAM도 수신 시 normalize된 kind로 거절한다. 단, R8의 truncation 예외는 수정이 필요하다.
- 수집기 설정(Q8): 이상 없음 — 활성·정지 규칙 이름을 escaped anchored regex로 `filterMetricsExtra`에 전달하며 설치 안내의 `customMetrics` flag와 의미가 일치한다.
- V81: 이상 없음 — 새 migration은 규칙 테이블 추가만 수행하며 현재 확인 가능한 V76~V80과 번호 충돌은 없다. additive table이므로 application rollback 시 잔존 테이블이 구버전 실행을 방해하지 않는다.
- 권한·라이선스·로그 이스케이프: 이상 없음 — 관리 API 6개는 모두 `requireEdit`, 조회 API는 `requireRead`, 두 controller 모두 APM feature gate를 거친다. 감사 필드는 `LogSafe`로 정제된다. 단, 로그 commit 시점은 R9와 같다.
- 조회 성능: 이상 없음 — service 확인, 규칙 목록, metric `IN` 집계의 고정된 소수 쿼리로 구성되어 규칙별 N+1은 없다.

## 판정

수정 후 재검수  
fail-open 캐시와 durable/global하지 않은 L5 admission 때문에 실제 수신 상한을 우회할 수 있다.  
규칙 churn으로 `foldWatch` 자체도 무제한 증가하므로, 관문을 운영에 열기 전에 세 필수 결함을 막아야 한다.

확인하지 못한 것:

- 요청에 따라 build·test·애플리케이션 실행은 하지 않았으므로 구현 보고서의 테스트 성공 수치는 독립적으로 검증하지 않았다.
- 실제 다중 노드 경합, DB query plan·잠금 동작 및 저장 행의 물리적 크기는 실행 검증하지 않았다.
- Collector 설정 재생성·배포 결과와 FE/browser 동작은 검수 범위에서 실행하지 않았다.
- 다른 미병합 브랜치에서 향후 V81을 사용할 가능성과 실제 rollback 절차는 정적 워크트리만으로 확인할 수 없다.