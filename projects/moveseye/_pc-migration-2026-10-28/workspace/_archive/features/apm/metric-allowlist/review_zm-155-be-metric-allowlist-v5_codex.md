## P1 반영 판정

| P1 | 닫힘 | `ApmCustomMetricGate.java:164-167,290-309`에서 캐시 자리가 `ruleId`를 보관·비교하고, `334-369`에서 캐시 적중도 현재 규칙·원장 세대를 재조회하여 불일치나 새 세대를 `stale` 처리하고 캐시를 제거한다. `430-520`의 원장 경로 역시 현재 규칙과 새 자리 세대를 비교해 옛 스냅샷을 폐기한다. 규칙 재조회 시 id 변경은 `635-646`에서 전체 자리 캐시를 비운다. 같은 세대는 `347-365`에서 정상 admission되며 `ApmCustomMetricGateTest.java:293-318`이 warm cache 경로를 단언한다. IT는 동일한 `oldNode`가 캐시를 보유한 뒤 삭제·재등록 직후 `NONE`이 되고, 실제 수신에서도 `NOT_ALLOWLISTED`·저장 0임을 검증한다(`ApmCustomMetricIT.java:293-333`). id 단조 증가 근거는 `bigserial`과 JPA `IDENTITY`이며 생성 코드가 id를 직접 지정하지 않는다(`V81__apm_custom_metric_rule.sql:12-14`, `ApmCustomMetricRule.java:68-70`, `ApmCustomMetricRuleService.java:269-271`). |

새 결함 없음.

## 판정

승인

이유 1: v4 P1의 옛 노드 캐시 적중 경로가 현재 DB 규칙 세대와 비교되며, 불일치 시 저장이 차단된다.  
이유 2: 같은 세대의 정상 캐시 적중과 `rule_id` 증가 전제도 코드·스키마·테스트에서 정적으로 확인됐다.

확인하지 못한 것:

- 요청에 따라 빌드와 테스트는 실행하지 않았다.
- 실제 다중 노드 동시 실행 타이밍과 DB lock wait는 재현하지 않았다.
- 운영 DB의 V81 적용 상태와 sequence 수동 재설정·복원 이력은 확인하지 않았다.