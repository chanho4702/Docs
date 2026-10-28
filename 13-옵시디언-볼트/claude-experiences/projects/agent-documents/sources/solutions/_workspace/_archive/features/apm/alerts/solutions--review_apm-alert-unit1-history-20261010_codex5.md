## 판정

**조건부 승인**

4차의 실제 반려 사유였던 서비스별·SLO 규칙 변경과 서비스 삭제 사이의 역순 교착은 해소되었습니다. 새로운 🔴 필수 사항은 없습니다.

조건은 요청서대로 **단위 1을 독립 배포하지 않고 단위 5·6과 함께 배포**하는 것입니다. 외부 I/O 분리가 빠진 채 단위 1만 배포한다면 아래 이관 항목 때문에 다시 반려 대상입니다.

## 🔴 필수

없음.

- `lockRuleByUid()`는 서비스 `KEY SHARE` → SLO `FOR UPDATE` → 규칙 `FOR UPDATE` 순서로 바뀌었습니다. 서비스별·SLO 규칙 경로는 서비스 삭제의 서비스 → SLO → 규칙 순서와 일치합니다. [ApmAlertService.java:1378](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1378)
- 전역 규칙의 첫 바인딩 예약도 순환하지 않습니다.
  - 예약이 서비스 `KEY SHARE`를 먼저 얻으면 서비스 삭제는 첫 `FOR UPDATE`에서 기다립니다.
  - 서비스 삭제가 먼저 잡으면 예약이 FK 확인에서 기다리지만, 삭제는 전역 규칙을 잠그지 않습니다. 삭제가 잠그는 규칙은 그 서비스/SLO 소유 규칙뿐입니다. [ApmAlertRuleRepository.java:97](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleRepository.java:97)
  - 따라서 `전역 규칙 → 서비스` 대기의 반대편에 `서비스 → 전역 규칙` 대기가 없어 순환이 닫히지 않습니다.
- 새 IT는 원래 교착 창을 적절히 고정합니다. 규칙 변경을 잠금 완료 후·바인딩 예약 전에 멈추고, 서비스 삭제가 서비스 잠금에서 기다린 뒤 양쪽이 정상 종료하며 Zabbix 삭제까지 확인합니다. [ApmAlertRuleLockOrderIT.java:101](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertRuleLockOrderIT.java:101)

## 🟡 권장

1. `reserve()`의 `ON CONFLICT` arbiter는 두 부분 인덱스에 맞춰 분리하는 것이 안전합니다.

   현재 대상 없는 `ON CONFLICT DO NOTHING`은 자연키뿐 아니라 `id` PK 충돌도 삼킵니다. [ApmAlertRuleBindingRepository.java:135](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/domain/ApmAlertRuleBindingRepository.java:135)

   다만 이번 구현은 예약 후 자연키로 다시 조회하므로, PK 충돌을 곧바로 “기존 바인딩 있음”으로 오판하지는 않습니다. 자연키 행이 없으면 `IllegalStateException`으로 끝납니다. [ZabbixAlertBridge.java:345](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:345)

   문제는 복원 후 sequence가 뒤처진 경우 이 예외가 5분 평가 전체를 롤백시킬 수 있다는 점입니다. sequence는 다음 시도마다 전진하므로 영구 손상은 아니어서 🟡로 판정합니다. 권장 SQL은 다음 두 갈래입니다.

   - 서비스 축: `ON CONFLICT (rule_id, service_id) WHERE service_id IS NOT NULL DO NOTHING`
   - 수집기 축: `ON CONFLICT (rule_id) WHERE service_id IS NULL DO NOTHING`

   현재 유일성도 정확히 이 두 부분 인덱스입니다. [V41__apm_alert.sql:52](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V41__apm_alert.sql:52)

2. 부모 재확인 불일치 후의 “최대 3회 재시도”는 안전한 재시도가 아닙니다.

   첫 `lockParentsByUidForUpdate()`가 반환된 시점부터 규칙 `FOR UPDATE`는 트랜잭션 종료까지 유지됩니다. 부모가 달라 `continue`하면 다음 시도는 **규칙을 보유한 채 새 부모를 잠그는 역순**이 됩니다. 그 새 부모의 서비스 삭제와 겹치면 다시 `규칙 → 서비스` 대 `서비스 → 규칙` 순환이 가능합니다.

   현재 애플리케이션에는 `service_id`·`slo_id` 변경 경로가 없어 정상 운영에서는 불일치가 발생하지 않으므로 🔴은 아닙니다. 그래도 불일치 시 즉시 실패시키거나, 전체 트랜잭션을 새로 시작하는 바깥 재시도로 바꾸는 편이 정확합니다. Mockito 테스트는 3회 호출을 확인할 뿐 실제 PostgreSQL 잠금 안전성은 검증하지 못합니다. [ApmAlertServiceTest.java:350](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertServiceTest.java:350)

3. 다음 IT를 보강하면 의도가 더 완전하게 고정됩니다.

   - 전역 규칙 첫 바인딩 예약 ↔ 서비스 삭제 양방향
   - binding sequence를 기존 PK로 되돌린 뒤, 자연키가 아닌 PK 충돌은 삼키지 않는지
   - 예약 후 Zabbix item 생성 성공·trigger 생성 실패 시 커밋되는 바인딩 상태

## 단위 5·6 이관 목록

- 전역 규칙의 **기존 바인딩** 경로에는 새 INSERT가 없어 서비스 `KEY SHARE`가 걸리지 않습니다. 따라서 교착 순환은 없지만, 전역 규칙의 Zabbix 갱신과 서비스 삭제가 같은 바인딩을 두고 외부에서 엇갈릴 수 있습니다. 삭제가 기존 객체를 지운 뒤 규칙 갱신이 새 객체를 만들고, DB 저장은 서비스 삭제로 롤백되면 Zabbix 고아가 남을 수 있습니다. 규칙 CRUD의 `syncNow/applyOurDefinition`까지 커밋 뒤 durable 작업으로 옮겨야 합니다.

- 예약 뒤 외부 I/O가 `RuntimeException`으로 실패하면 같은 트랜잭션에서 `markError()`와 예약 행이 함께 커밋됩니다. 따라서 정상 예외 경로에서 `error=null`인 빈 예약만 노출되지는 않습니다. [ZabbixAlertBridge.java:306](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:306)

- 그러나 item 생성 후 trigger 생성이 실패하면 생성된 item id는 바인딩에 기록되지 않고 오류만 커밋됩니다. 재시도 전에 규칙·서비스가 삭제되면 그 item을 DB id로 정리하지 못할 수 있습니다. 또한 외부 I/O 성공 후 후속 DB 오류로 전체 트랜잭션이 롤백되면 예약과 상태 기록은 사라지고 Zabbix 객체만 남습니다. 이는 단위 5의 durable 수명주기 명령과 단위 6의 판정/외부 단계 분리에서 해소해야 합니다.

- 단위 6 완료 조건에는 “프로비저닝 실패가 해당 바인딩의 짧은 트랜잭션에만 영향을 주고, 같은 평가 회차의 다른 이벤트 전이를 롤백하지 않는다”를 유지해야 합니다.

## 🟢 참고

- `targetsOf(rule, visibleRule)`는 전역 override 계산을 잠근 규칙 집합으로 제한했고, 평가와 동기화 양쪽에서 `locked::hasRule`을 전달합니다. [ApmAlertService.java:1188](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1188), [ApmAlertEvaluationService.java:346](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:346), [ApmAlertSyncService.java:145](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:145)
- override IT는 선잠금 후 별도 트랜잭션에서 서비스별 규칙을 커밋하고, 첫 회차에는 전역 바인딩·이벤트가 유지되며 다음 회차에만 고아 처리되는 것을 확인합니다. 의도를 정확히 고정합니다. [ApmAlertEvaluationRaceIT.java:563](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRaceIT.java:563)
- 평가↔장부 IT도 바인딩을 미리 만들지 않아 동시 첫 예약의 자연키 경쟁과 단일 행 생성을 검증합니다. 다만 PK 등 다른 UNIQUE 충돌은 검증하지 않습니다. [ApmAlertEvaluationRaceIT.java:332](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRaceIT.java:332)
- 파일은 수정하지 않았습니다. 읽기 전용 조건 때문에 테스트는 재실행하지 않았으며, `2,493` 통과는 요청서 기재 결과로 확인했습니다. `git diff --check`에서는 오류가 없었습니다.
