## 판정

**반려**

r4가 3차의 phantom 필터와 서비스/SLO lock-then-read는 대부분 올바르게 보완했습니다. 다만 서비스 삭제와 화면 규칙 변경 사이에 새 교착 경로가 있으며, 교착 희생 트랜잭션의 Zabbix 변경이 DB 롤백 밖에 남을 수 있어 🔴입니다.

## 🔴 필수

### 1. 서비스 삭제와 규칙 수정·재동기화가 `서비스 ↔ 규칙` 역순으로 교착할 수 있음

다음 순환이 가능합니다.

1. 규칙 수정은 먼저 규칙을 `FOR UPDATE`로 잡습니다([ApmAlertService.java:459](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:459)).
2. 이후 `syncNow()`가 Zabbix 프로비저닝을 수행합니다([ApmAlertService.java:491](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:491), [ZabbixAlertBridge.java:306](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:306)).
3. 바인딩이 처음 만들어지는 경우 Zabbix I/O 후 바인딩을 저장합니다([ZabbixAlertBridge.java:341](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:341)). 이 INSERT는 `service_id` FK 때문에 서비스 행에 `KEY SHARE`가 필요합니다([V41__apm_alert.sql:23](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V41__apm_alert.sql:23)).
4. 동시에 서비스 삭제는 서비스 `FOR UPDATE`를 먼저 잡고([ApmServiceQueryService.java:542](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java:542)), 이어 SLO→규칙을 잠급니다([ApmAlertService.java:683](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:683)).

따라서:

- 규칙 수정: **규칙 보유 → 서비스 대기**
- 서비스 삭제: **서비스 보유 → 규칙 대기**

가 되어 PostgreSQL 교착입니다. `resync(OURS)`와 꺼진 규칙을 다시 켜는 경로도 처음 바인딩을 만들면 같은 문제가 생깁니다.

특히 규칙 수정이 교착 희생자가 되면, DB 변경·바인딩은 롤백되어도 그 전에 수행한 Zabbix 생성·갱신은 남습니다. 이어 서비스 삭제는 아직 없는 바인딩을 통해 그 객체를 찾지 못하므로 영구 고아 트리거나 DB와 다른 표현식이 남을 수 있습니다.

규칙 mutation이 서비스 행을 규칙보다 먼저 잠그도록 바꾸거나, 해당 `applyOurDefinition`을 부모 재검증이 포함된 커밋 후 durable command로 옮겨야 합니다. 바인딩이 없는 서비스별/SLO 규칙의 `update`·`resync` 대 서비스 삭제 양방향 IT도 필요합니다.

## 🟡 권장

- phantom 필터가 직접 처리 대상에는 전달됐지만, 전역 규칙의 대상 계산은 아직 잠금 밖 규칙을 읽습니다. [ApmAlertService.java:1201](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1201)의 `rules.findAll()`은 선잠금 뒤 생성된 서비스별 override 규칙도 포함합니다. 그러면 잠긴 전역 규칙의 `liveKeys`에서 해당 서비스가 빠지고, [ApmAlertEvaluationService.java:444](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:444)의 sweep가 전역 바인딩을 고아 처리할 수 있습니다. 새 규칙 자체의 바인딩은 건드리지 않지만, 잠금 밖 규칙이 이번 회차의 이벤트 해소·바인딩 변경을 유발합니다. 다음 회차에 수렴하므로 영구 불일치는 아니지만, “새 행은 전부 다음 회차”라는 의도와 다릅니다. override 계산도 `locked.ruleIds()`로 제한하는 것이 안전합니다.

- phantom IT는 새 규칙 자체의 지연은 고정하지만, “잠금 뒤 생성된 서비스별 규칙이 기존 전역 규칙을 밀어내는 경우”는 없습니다. 이 조합을 추가해야 위 문제를 검출할 수 있습니다.

## 단위 5·6 이관 목록

- **첫 프로비저닝 동시 실행의 바인딩 UNIQUE 위반은 단위 5 단독 이관으로는 부족합니다.** 현재 `binding()`은 조회 후 새 엔티티 생성 방식이며([ZabbixAlertBridge.java:345](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:345)), 평가 대 장부 IT도 이를 피하려고 바인딩을 미리 만듭니다([ApmAlertEvaluationRaceIT.java:343](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationRaceIT.java:343)).

- 이관하려면 다음 중 하나를 단위 5·6 완료 조건으로 명시해야 합니다.

  - 외부 I/O 전에 `(rule_id, service_id)` 바인딩을 `INSERT … ON CONFLICT`로 원자적으로 예약
  - 같은 키의 프로비저닝을 claim/advisory lock으로 단일화
  - 단위 6에서 프로비저닝 실패가 판정 트랜잭션과 다른 짧은 트랜잭션에만 영향을 주도록 분리

- 현재 구조에서는 이 UNIQUE 위반이 5분 평가 전체를 롤백시켜 같은 회차의 다른 알람 이력까지 잃게 할 수 있습니다. 따라서 **단위 1을 독립 배포한다면 이번에 막아야 하고**, 단위 6과 같은 배포로 묶는 명시적 게이트가 있을 때만 이관 가능합니다.

- 외부 I/O를 커밋 뒤로 옮길 때 규칙 CRUD의 `syncNow/applyOurDefinition`도 포함해야 합니다. 현재 설계의 “평가 분할”만으로는 위 🔴 서비스→규칙 교착이 자동 해소되지 않습니다.

## 🟢 참고

- `evaluateAll()`은 잠근 규칙만 조회하고 대상별 `covers`를 검사하며, 재시도·sweep·eventid 백필에도 같은 판정을 전달합니다([ApmAlertEvaluationService.java:294](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:294)).
- `syncAll()`도 부모 선잠금 뒤 규칙·서비스 양쪽을 제한합니다([ApmAlertSyncService.java:121](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:121)).
- sweep 자체는 `covered=false`인 바인딩을 필터링한 뒤에만 변경합니다([ApmAlertOrphanSweeper.java:175](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:175)).
- 서비스 삭제는 잠금 뒤 상태를 다시 읽으며, SLO 수정·삭제는 `서비스 KEY SHARE → SLO UPDATE` 뒤 엔티티를 읽습니다. 번 규칙 생성·SLO 삭제 양방향 IT도 이 의도를 유효하게 고정합니다.
- 파일은 수정하지 않았고, 읽기 전용 조건 때문에 테스트는 재실행하지 않았습니다. `2,482` 통과는 요청서 기재 결과로만 확인했습니다.
