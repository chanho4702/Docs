## 잔여 반영 판정

| 항목(M1~M3·N2·N3·N7) | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| M1 | 닫힘 | `ApmCustomMetricGate.java:419,423-439`에서 트랜잭션 중 기존 캐시를 제거하고 `afterCompletion(STATUS_COMMITTED)`에서만 새 캐시를 공개한다. 롤백 시 다시 제거한다. 실제 트랜잭션과 롤백 후 51번째 접힘은 `ApmCustomMetricIT.java:249-273`이 검증한다. |
| M2 | 닫힘 | `ApmCustomMetricGate.java:373-380`에서 동일 세대 자리도 `seat.kind().equals(kind)`인 경우에만 touch한다. 종류 불일치 시 UPSERT가 없다는 단언은 `ApmCustomMetricGateTest.java:134-147`에 있다. |
| M3 | 닫힘 | `ApmCustomMetricSeriesService.java:97-105`가 `last_seen_at >= now - ApmCustomMetricRule.SEAT_RETENTION` 조건으로 살아 있는 자리만 조회한다. 규칙 목록 요약과 같은 보존 상수를 사용한다. |
| N2 | 닫힘 | `ApmCustomMetricGate.java:286-312`에서 캐시 TTL, 모든 자리의 만료 여유, touch 시각, 규칙 ID 및 종류를 검사한다. 신뢰할 수 없는 미스는 `ApmCustomMetricGate.java:272-275,335-351`의 DB 원장 판정으로 내려간다. M1의 커밋 후 공개도 결합됐다. 아래 N7 세대 전파 결함은 별도다. |
| N3 | 닫힘 | 의도적 편차와 비용표가 `review_zm-155-be-metric-allowlist.md:114-123`에 명시됐다. 서비스당 3문장·캐시 내 0문장은 `ApmCustomMetricGateTest.java:206-231`, 3개 서비스 9문장 선형성은 `ApmCustomMetricGateTest.java:234-247`이 단언한다. 제한된 LRU에 대해 전체 preload를 피하고 cold 비용을 서비스 수에 한정한 판단은 타당하다. |
| N7 | 부분 | `V81__apm_custom_metric_rule.sql:38-44`에 `rule_id`가 추가됐고, DB 원장 경로는 `ApmCustomMetricGate.java:363-386`에서 세대를 비교한다. 그러나 캐시 히트 경로는 로컬의 옛 규칙 ID와 옛 캐시 ID만 비교하고 DB의 새 자리 세대를 확인하지 않는다(`ApmCustomMetricGate.java:286-312`). IT도 캐시를 가진 기존 `oldNode` 대신 새 `stale` 인스턴스를 만들어 이 경로를 놓친다(`ApmCustomMetricIT.java:280-303`). |

## 새 결함

- P1 · 필수 · `ApmCustomMetricGate.java:286`, `ApmCustomMetricIT.java:280` · 옛 스냅샷 노드가 보유한 자리 캐시로 새 규칙 세대 전환 후에도 저장할 수 있다 · `oldNode`가 1세대 자리를 캐시한 뒤 다른 노드가 2세대로 원장을 넘겨받아도, 1세대 노드는 캐시의 `ruleId`와 자신의 옛 스냅샷 ID가 같다는 이유로 DB 조회 없이 `STORE`한다. 최대 규칙 갱신 주기 동안 이전 세대 값, 특히 서로 다른 kind가 새 세대 시계열에 섞일 수 있다. 현재 IT는 캐시가 없는 새 인스턴스로만 옛 세대를 검사해 통과한다 · 세대 변경·자리 인수 시 노드 간 캐시 무효화를 전파하거나, 저장 트랜잭션에서 현재 원장 세대를 확인하는 CAS를 추가한다. IT는 1세대를 저장한 실제 `oldNode`를 새 세대 인수 직후 TTL 경과 없이 다시 호출해 `NONE`과 미저장을 단언해야 한다.

## 판정

수정 후 재검수

이유 1: N7의 핵심인 옛 스냅샷 노드 저장 차단이 기존 자리 캐시가 있는 실제 전파 창에서는 성립하지 않는다.  
이유 2: M1~M3·N2·N3는 정적으로 닫혔고, 기존 상수 표 지표 경로에도 새 회귀는 발견하지 못했다.

확인하지 못한 것:

- 요청에 따라 빌드와 테스트는 실행하지 않았다.
- 실제 다중 노드에서 규칙 교체와 수집이 겹치는 타이밍은 재현하지 않았다.
- PostgreSQL lock wait, 실행 계획 및 부하 성능은 측정하지 않았다.