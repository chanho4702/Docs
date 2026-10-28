## 판정

**반려**

`PROCESSING` 중인 이관 전용 `m:` 명령이 정규 resource로 재적재되어도 정규 키가 보존되지 않아, §9의 resource 단일 실행을 영구적으로 이탈할 수 있습니다. 단독 배포하지 않는 조건과 무관하게 5a-1 대수 자체에서 닫아야 합니다.

## 🔴 필수

- **`PROCESSING` 중 re-key 요청이 유실됩니다.**

  [ApmZbxCommandStore.java:353](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:353)은 `c.status <> 'PROCESSING'`일 때만 `m:` 키를 정규 `b:`/`i:` 키로 바꿉니다. 처리 중 재적재되면 `generation`만 증가하고 정규 resource는 어디에도 저장되지 않습니다. 이후 `complete()`의 generation 불일치 재대기, `retry()`·`dead()`·`release()`도 기존 `m:` 키를 그대로 유지합니다.

  테스트도 [ApmZbxCommandStoreIT.java:170](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStoreIT.java:170)에서 `complete()` 뒤 **세 번째 enqueue가 있어야** 정규 키로 바뀌는 현재 결함을 정상 동작으로 고정합니다. 세 번째 적재는 보장되지 않습니다.

  결과적으로 이관된 `m:` DELETE와 같은 바인딩의 PROVISION·STAT·PUSH 또는 같은 item의 정규 `i:` DELETE가 partial UNIQUE를 공유하지 않고 병행 실행할 수 있습니다. 예를 들어 PROVISION 완료 뒤 옛 `m:` DELETE_TRIGGER가 새 트리거를 삭제하면 명령은 완료되어 사라지고 바인딩은 삭제된 ID를 가리키게 됩니다. 이는 **순서 위반 및 지속적인 Zabbix 상태 손상**입니다.

  다음 중 하나가 필요합니다.

  - `pending_resource_key`를 보존하고 PROCESSING→PENDING 전환 시 원자적으로 적용하거나,
  - target의 `ruleUid/scopeUid` 또는 `host/itemKey`로 정규 키를 복원해 모든 재대기 경로에서 적용하거나,
  - `m:` 별칭과 정규 resource를 동일 lane으로 직렬화하는 별도 alias 장치를 둡니다.

  수정 IT는 “PROCESSING `m:` 행에 정규 키 재적재 → 추가 enqueue 없이 REQUEUED → 정규 resource의 다른 명령과 동시 claim 불가”를 검증해야 합니다. ID 기반 이관 DELETE_ITEM과 키 기반 `DELI:k…`가 공존하는 경우도 포함해야 합니다.

## 🟡 권장

- **`release()`도 generation을 판정해야 합니다.** [ApmZbxCommandStore.java:652](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:652)은 token만 확인하고 항상 `now + delay`로 보냅니다. 실행 중 새 의사가 재적재되어 `next_attempt_at=now`가 되었어도 다시 지연시킵니다. generation 불일치면 `REQUEUED`와 즉시 시각을 적용하는 편이 §8.1 병합 규칙과 일치합니다.

- **명령 행 잠금 순서의 동시 IT가 필요합니다.** 추정: lifecycle enqueue는 자기 행을 먼저 잠근 뒤 PUSH를 잠그고, dependency 추가는 successor `FOR UPDATE` 뒤 predecessor `KEY SHARE`를 잡습니다([Store:246](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:246), [Store:376](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:376)). 반대편 enqueue가 predecessor/PUSH를 먼저 잡으면 교차 대기가 가능합니다. 명령 row 전체의 단일 잠금 순서 또는 deadlock 재시도 정책을 정하고, `DELETE_ITEM enqueue ↔ DELETE_TRIGGER enqueue`, `PUSH enqueue ↔ lifecycle enqueue`, `cancel ↔ addDependency` 동시 테스트를 추가해야 합니다.

- **23505 후 다음 후보 진행을 직접 검증해야 합니다.** 현재 경쟁 테스트는 충돌 뒤 남은 후보가 없는 경우만 검사합니다. 같은 resource 후보가 23505로 거부된 뒤 더 늦은 다른 resource 후보를 실제 claim하는 IT와 `SKIP LOCKED` 뮤테이션이 필요합니다.

- **V53 의존 복원에 운영 데이터 사전 검사를 권장합니다.** [V79:151](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V79__apm_zbx_command.sql:151)은 `rule_uid/slo_uid/service_id` 중 하나만 같아도 연결하고, 세 값이 모두 없는 경우만 전역 barrier로 봅니다. 정상 CRUD 불변식에서는 합리적입니다. 다만 DB가 `(kind, scope)` 중복을 강제하지 않으므로 과거 동시 생성·수동 데이터가 있다면 추정상 공유 item의 선행을 누락할 수 있습니다. nullable origin과 중복 규칙을 포함한 seed 또는 배포 전 진단 SQL을 추가하는 것이 안전합니다.

- **어댑터의 최초 오류 보존이 사라졌습니다.** `ApmZbxCleanupService.enqueue(..., error, ...)`의 `error`는 로그에만 사용되고 `last_error`에는 기록되지 않습니다. 기존 V53은 최초 실패 원문을 행에 저장했습니다. 동작상 유실은 아니지만 운영 진단 회귀입니다.

- **마이그레이션 실패 롤백 IT를 추가하는 편이 좋습니다.** PostgreSQL/Flyway 트랜잭션 DDL이므로 현재 rename·열 추가·백필·제약 추가 중 실패하면 전체 롤백되는 구조는 맞습니다. 다만 의도적으로 CHECK 불가 V53 행을 넣어 V79 실패 후 `apm_zbx_cleanup`과 원 데이터가 그대로인지 확인하면 배포 증거가 더 강해집니다.

## 이관 목록

- **5a-2**
  - `clock <= cutoffEpochSec`를 사용하는 RCONF 실행기와 재활성화 취소 경쟁.
  - 선형화 전 edge는 PENDING 복귀, 선형화 후 edge의 trigger missing 성공 처리.
  - Zabbix 7.x에서 `item.delete`의 trigger cascade 또는 삭제 거부 동작 실측.
  - 태그/키 exact-match, 공유 item 보존, 복수 `zbxIds` 호출 상한.
  - 기존 `retryDue` 제거와 독립 worker 전환.
  - 실제 latch 기반 late-edge/외부 RPC 동시 IT.

- **5b**
  - PROVISION 중간 item ID 기록·보상.
  - STAT의 desired state 재조회와 라이선스 판정.
  - bounded executor, 3초 await, reject 시 PENDING 유지.
  - RPC 사이 lease 갱신과 실제 실행 경로별 호출 수 검증.

- **6a·7**
  - PUSH_CURRENT 완전 전환과 직접 push 제거.
  - 판정·1초 장부·worker 3자 교착 IT.
  - resource backlog·처리량·알람 지연 계측.

## 🟢 참고

- V79의 rename → nullable 열 추가 → 백필 → 구 UNIQUE 제거 → 새 UNIQUE/NOT NULL/CHECK → 인덱스 순서는 정확합니다. ID·sequence·attempts·`last_error`·미래 `next_attempt_at`도 보존됩니다.
- `PENDING/PROCESSING/DEAD` 선행 전부 차단, cycle 검사, successor generation 증가, partial UNIQUE와 행별 `REQUIRES_NEW` 23505 처리, 만료된 blocked PROCESSING 해제는 §9 모델과 일치합니다.
- `renewLease`, `markLinearized`, `complete`, `retry`, `dead`의 token/generation 처리도 위 re-key 문제를 제외하면 일관적입니다.
- 기동 검증식은 공유 `ZabbixHttpLimits`를 사용하며 `12 × 45초 + 30초 = 570초 < 600초`를 정확히 구현합니다.
- 요청서의 2,639건 통과 결과는 확인했습니다. 읽기 전용 조건 때문에 테스트를 다시 실행하거나 빌드 산출물을 만들지는 않았습니다.

## 의견 요청 답

1. **`DELT:t{id}`와 `DELT:g{md5}` 분리는 유지해도 됩니다.** ID가 있으면 객체 인스턴스, 없으면 논리 대상이라는 의미가 다릅니다. 재생성된 trigger는 새 ID 명령으로 두고 같은 `b:` resource에서 직렬화하면 됩니다. 단, group 기반 RCONF/DELETE의 취소와 exact-match 검색은 5a-2에서 함께 처리해야 합니다.

2. **DEAD PUSH_CURRENT supersede에 찬성합니다.** DEAD projection은 이미 실행 불가능한 과거 스냅샷이고 lifecycle이 상태를 바꿨으므로 폐기하는 편이 맞습니다. 이후 평가는 최신 PUSH를 다시 적재합니다. DEAD 삭제와 dependency CASCADE를 명시적으로 검증하는 테스트는 추가하십시오.

3. **선형화 후 item missing을 trigger 성공으로 보는 정책에 조건부 찬성합니다.** 선형화 전 edge는 반드시 item을 재대기시키고, 선형화 후에는 Zabbix 실측 결과가 cascade라면 missing 성공이 맞습니다. cascade가 아니라 삭제 거부라면 item retry→trigger→item 순서가 되어야 합니다. 실측 없이 가정으로 확정하면 안 됩니다.

4. **현재 `m:` 임시 키와 정규 DELETE_ITEM 경쟁 정책은 불가합니다.** 같은 dedup의 PROCESSING 재적재조차 정규 키를 잃고, `DELI:i{id}`와 `DELI:k{hash}`처럼 dedup이 다른 행은 아예 별도 lane이 됩니다. 위 🔴의 pending re-key/alias 직렬화를 5a-1에서 해결해야 합니다.

5. **`maxZabbixCalls` 값은 임시 상한으로는 합리적이지만 아직 승인할 수 없습니다.** 실행기가 없어 12/4/5회의 실제 최악 분기를 증명할 수 없고, 현재 어댑터의 `zbxIds` 반복은 크기 제한이 없습니다. 5a-2/5b에서 token 획득·version probe·소유 확인·검색·삭제/보상까지 센 Fake 호출 계수 테스트를 두고, 초과 시 테스트 또는 실행 자체가 실패하도록 고정해야 합니다.
