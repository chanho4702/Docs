## 판정

**반려**

기존 행의 평가·수정 경쟁은 개선됐지만, 신규 행 phantom과 서비스/SLO 삭제의 선잠금 누락 때문에 “모든 쓰기보다 부모 잠금이 먼저”라는 보장이 아직 성립하지 않습니다.

## 🔴 필수

### 1. 배치의 “전체 선잠금”이 잠금 뒤 생성된 규칙·서비스를 보호하지 못함

[ApmAlertParentLocks.java:45](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertParentLocks.java:45>)의 두 `SELECT … FOR ...`는 문장 실행 시 존재한 행만 잠급니다. PostgreSQL 기본 `READ COMMITTED`에서는 이후 커밋된 신규 행을 다음 조회가 볼 수 있습니다.

- 평가: 선잠금 후 [ApmAlertEvaluationService.java:304](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:304>)에서 규칙을 다시 읽고, [ApmAlertEvaluationService.java:345](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:345>)에서 바인딩을 씁니다.
- 대조: 선잠금 후 [ApmAlertSyncService.java:133](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:133>)에서 규칙을 다시 읽고, [ApmAlertSyncService.java:165](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:165>)부터 바인딩을 씁니다.
- 규칙 생성은 [ApmAlertService.java:389](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:389>)에서 허용됩니다.

따라서 선잠금 직후 생성·커밋된 규칙이나 서비스는 배치 대상에는 들어오지만 부모 잠금은 없습니다. 특히 `syncAll()`은 이후 개별 부모 재잠금이나 stale 대조도 없어 이전 임계로 Zabbix 정의·바인딩을 쓸 수 있습니다.

현재 경쟁 IT는 모든 행을 실행 전에 시드하므로 이 틈을 고정하지 못합니다. 정확한 대상 집합을 잠근 뒤 다시 읽거나, 쓰기 직전 대상별로 `서비스 → 규칙`을 잠그는 방식이 필요합니다. “선잠금과 대상 조회 사이에 create 커밋” 경쟁 IT도 추가해야 합니다.

### 2. 서비스·SLO 삭제는 여전히 lock-then-read가 아님

서비스 삭제는 서비스와 상태를 먼저 읽고 검사한 뒤에야 알람 계층에서 `FOR UPDATE`를 잡습니다.

- 선조회·상태 검사: [ApmServiceQueryService.java:537](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/list/ApmServiceQueryService.java:537>)
- 뒤늦은 잠금: [ApmAlertService.java:638](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:638>)

그 사이 수신 경로의 [ApmRegistryWriter.java:153](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/registry/auto/ApmRegistryWriter.java:153>)가 `last_seen_at`을 갱신하면서 `HIDDEN → ACTIVE`로 되돌릴 수 있습니다. 갱신이 먼저 커밋되면 삭제는 최신 행을 잠그지만, 영속성 컨텍스트의 오래된 `HIDDEN` 엔티티로 계속 삭제합니다. `@Version`도 없어 이를 막지 못합니다.

SLO 삭제도 [ApmAlertService.java:878](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:878>)에서 규칙을 읽은 뒤 [ApmAlertService.java:893](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:893>)에서 잠급니다. 규칙이 없다고 조기 반환한 직후 다른 요청이 번 레이트 규칙과 Zabbix 객체를 만들면, SLO의 CASCADE는 DB 행만 지우고 Zabbix 객체를 고아로 남길 수 있습니다.

서비스/SLO 부모를 UID로 먼저 잠근 뒤 엔티티와 상태를 다시 읽어야 합니다. 해당 두 삭제 경쟁도 IT로 고정해야 합니다.

## 🟡 권장

- 1초 장부는 부모 잠금 자체는 쓰기보다 먼저 잡습니다. 다만 `fire/settle`은 `부모 → 이벤트 → 바인딩`이고([ApmStuckRequestLedger.java:118](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:118>), [ApmStuckRequestLedger.java:137](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:137>)), 배치는 `부모 → 바인딩 → 이벤트`입니다. 현재 활성 `STUCK_REQUEST`는 평가 배치가 이벤트를 건드리지 않고 건너뛰므로([ApmAlertEvaluationService.java:388](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:388>)) 같은 바인딩 대기는 일방향이며 현재 구조에서는 진짜 순환이 아닙니다. 그래도 분기 변경에 취약하므로 실제 `evaluateAll()` 대 `fire/settle` IT를 두는 편이 안전합니다.

- `kind·threshold·window`는 현재 mutable 판정 필드를 모두 대조하며, `enabled`는 별도로 검사합니다. 다만 서비스명·환경·SLO명은 잠금 전에 읽고 재검사하지 않습니다. `KEY SHARE`는 비키 서비스 UPDATE를 막지 않으므로 동시 메타데이터 수정 시 직전 이름이 스냅샷에 남을 수 있습니다. “발화 커밋 시점의 표시명”까지 요구한다면 보완이 필요하다는 것은 **추정**입니다.

- 배치의 서비스 `KEY SHARE`는 수신의 비키 UPDATE(`FOR NO KEY UPDATE`)와 호환되며, SSE의 MVCC `SELECT`도 직접 막지 않습니다. 반면 서비스 삭제는 [ApmAlertService.java:638](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:638>)에서 `FOR UPDATE`를 잡은 채 [ApmAlertService.java:644](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:644>)의 Zabbix I/O까지 수행하므로 같은 서비스 수신 UPDATE는 그 시간 동안 대기합니다. 대기 요청 누적으로 DB pool이 차면 SSE·수신까지 간접 지연될 수 있다는 것은 **추정**입니다.

## 🟢 참고

- 기존 행에 대해서는 `evaluateAll()`과 `syncAll()` 모두 첫 실행문에서 부모를 잠그므로 예외·조기 반환 전에 바인딩이 쓰이는 경로는 없습니다.
- 규칙 update의 enable 토글, delete, resync `OURS/THEIRS`, 기존 SLO 규칙 동기화는 규칙 엔티티 조회 전에 `FOR UPDATE`를 잡습니다.
- 서비스 삭제의 다중 규칙 잠금은 규칙·바인딩·이벤트 모두 `id` 오름차순이며, 서비스 `FOR UPDATE`가 배치의 서비스 `KEY SHARE`와 먼저 충돌하므로 배치와의 다중 규칙 순서에서는 순환이 없습니다.
- `ApmAlertEvaluationRaceIT`의 양방향 트랜잭션 정지는 기존 행의 평가 대 화면 mutation 의도를 유효하게 고정합니다. 다만 위 신규행 phantom, 수신 대 서비스 삭제, SLO 생성 대 삭제, 1초 장부 대 실제 배치는 범위 밖입니다.
- 파일 수정 및 테스트 실행은 하지 않았습니다.
