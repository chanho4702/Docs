## 판정

**재설계 필요**

분류표는 `premium.apm.alert` 범위의 Zabbix 쓰기 경로를 빠짐없이 찾았고, 생성·상태 변경·해소·삭제를 durable command로 옮기는 큰 방향도 맞습니다. 실제 호출점도 설계가 인용한 줄과 대체로 일치합니다. 예를 들어 직접 push는 [ApmAlertEvaluationService.java:441](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:441), 1초 장부는 [ApmStuckRequestLedger.java:132](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:132), 삭제는 [ZabbixAlertBridge.java:1385](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1385)에 있습니다.

다만 현재 설계대로 구현하면 다음 세 가지 핵심 보장이 깨집니다.

- DELETE 재적재가 유실되어 item이 영구 고아가 될 수 있습니다.
- `history.push`와 수명주기 명령이 서로 추월하여 껐다 켠 직후 거짓 알람이 발생할 수 있습니다.
- 기본 lease·batch·HTTP timeout 조합은 기동 검사를 통과할 수 없고, facade의 3초 예산도 강제할 수 없습니다.

## 🔴 필수

### 1. DELETE의 `DO NOTHING`은 실제로 영구 유실을 만든다

근거: [설계:59](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:59), [ApmZbxCleanupService.java:201](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:201)

가능한 순서는 다음과 같습니다.

1. 기존 `DELETE_ITEM` 실행기가 아직 살아 있는 바인딩을 보고 “보존 완료”로 판단합니다.
2. 동시에 그 마지막 바인딩을 삭제하는 트랜잭션이 같은 dedup key를 적재하지만 `DO NOTHING`으로 사라집니다.
3. 삭제 트랜잭션이 커밋됩니다.
4. 실행기가 기존 명령을 성공 삭제합니다.
5. 바인딩 0, 명령 0, Zabbix item만 남습니다.

수정안:

- DELETE도 충돌 시 반드시 `generation + 1`, `next_attempt_at=now`, DEAD 부활을 수행해야 합니다.
- “다른 바인딩이 사용하므로 보존” 완료도 generation CAS로 끝내야 합니다.
- 참조 검사는 `zbx_itemid`뿐 아니라 예약 상태의 논리 키 `(host, kind, scope/itemKey)`까지 포함해야 합니다.
- RPUSH·RCONF의 충돌 병합도 명시해야 합니다. 권장값은 RPUSH `clock=max`, RCONF `resolveBefore=max`, 둘 다 generation 증가입니다.

### 2. 단일 `group_key`와 바인딩별 삭제 그룹은 공유 item의 선행 조건을 표현하지 못한다

근거: [설계:57](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:57), [설계:62](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:62), [설계:76](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:76)

같은 item은 여러 규칙의 trigger가 공유합니다. 그런데 item 명령은 dedup으로 한 행이고 `group_key`도 하나뿐입니다. 두 삭제가 겹치면 item이 첫 번째 trigger만 기다리고 두 번째 trigger보다 먼저 실행될 수 있습니다. DELETE 충돌을 `DO NOTHING`으로 두면 새 선행 조건도 합쳐지지 않습니다.

수정안:

- 삭제 그룹을 바인딩이 아니라 **논리 item resource** 기준으로 잡으십시오.
- 같은 item을 참조하는 모든 `DELETE_TRIGGER`를 phase 0, 해당 `DELETE_ITEM`을 phase 1에 넣어야 합니다.
- 더 일반적으로는 `command_dependency(command_id, predecessor_id)`를 두는 편이 정확합니다.
- 명령을 여러 개 잠글 때 dedup key 또는 id 오름차순을 강제하십시오.

### 3. 직접 `history.push`는 R1을 차단하지 못하며, 제안된 “켜기 전 -1”도 충분하지 않다

근거: [설계:7](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:7), [설계:154](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:154), [설계:224](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:224)

설계는 “쓰기 단일 실행기”라고 선언하면서 5분 단계에서는 직접 push합니다. 직전 DB 차단 검사와 RPC 사이에는 원자성이 없습니다.

예:

1. 평가가 양수 push 가능 판정을 완료합니다.
2. 사용자가 끄고 RPUSH(-1)→STAT(disable)이 완료됩니다.
3. 앞서 출발한 양수 push가 마지막에 도착합니다.
4. 다시 켜면 저장된 양수로 즉시 발화할 수 있습니다.

켜기 전에 -1을 한 번 더 보내도, 지연된 양수 push가 그 뒤에 도착하면 동일합니다.

또한 PROVISION(enforce)이 대기·실패 중이어도 [설계:155](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:155)의 차단식은 `missing`과 해소 그룹만 확인합니다. 새 임계로 DB 이벤트를 판정하면서 Zabbix의 옛 임계에 값을 밀어 Zabbix 알림을 놓치거나 잘못 발화시킬 수 있습니다.

수정안:

- 5분 값 push도 `resource_key + generation/sequence`를 사용하는 동일 실행 레인으로 보내십시오. `PUSH_CURRENT`처럼 최신 값만 합치는 projection 명령이어도 됩니다.
- 같은 resource의 push·RPUSH·STAT·PROVISION·DELETE는 동시에 실행되지 않아야 합니다.
- lifecycle mutation은 오래된 projection을 supersede해야 합니다.
- push 차단 조건에는 PROVISION(enforce), STAT, 해소·삭제 명령의 PENDING/PROCESSING/DEAD를 모두 포함하십시오.
- enable은 성공한 -1 정렬 이후에만 가능해야 하며, 이 -1은 soft 실패로 넘기면 안 됩니다.

### 4. 기본 lease와 3초 facade 예산은 현재 HTTP 상한으로 성립하지 않는다

근거: [설계:85](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:85), [설계:90](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:90), [ZabbixClient.java:91](/C:/worktrees/apm-c05-followup/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:91), [ZabbixClient.java:98](/C:/worktrees/apm-c05-followup/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:98)

Zabbix 단일 RPC의 response timeout은 30초입니다. PROVISION은 host/group/item/trigger 조회·생성·갱신으로 여러 호출을 수행합니다. 따라서 `batch=20`, `lease=2분`은 `requireFitsLease`를 통과할 수 없으며, 한 PROVISION도 최악 조건에서는 2분을 넘을 수 있습니다. 호출 스레드에서 실행하면 단일 RPC만으로 facade의 3초 예산도 초과합니다.

수정안:

- 명령은 한 행씩 just-in-time claim하거나, 외부 호출 사이마다 token+generation CAS로 lease를 갱신하십시오.
- 기동 검사는 명령 종류별 최대 호출 수와 실제 30초 timeout을 사용해야 합니다.
- `runNow`는 bounded executor에 넘긴 후 최대 3초만 기다리고, timeout 뒤에도 동일 claim 소유자가 백그라운드에서 계속 처리하게 하십시오.
- 호출 스레드가 직접 RPC를 수행하는 모델을 유지한다면 U1은 완전 비동기로 바꿔야 합니다.

### 5. V79의 V53 승계 절차가 제약과 의존 관계를 완전히 처리하지 않는다

근거: [설계:42](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:42), [V53__apm_slo_p3_review.sql:84](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V53__apm_slo_p3_review.sql:84), [V53__apm_slo_p3_review.sql:110](/C:/worktrees/apm-c05-followup/src/main/resources/db/migration/V53__apm_slo_p3_review.sql:110)

테이블·열 rename 자체는 행과 id를 보존하므로 타당합니다. 그러나 다음이 빠졌습니다.

- 기존 UNIQUE `(object_kind, zbx_id)`는 rename 후에도 남습니다. 새 정본이 `UNIQUE(dedup_key)`라면 옛 제약을 명시적으로 제거해야 합니다. 그렇지 않으면 `ON CONFLICT(dedup_key)`가 잡지 못하는 다른 제약 충돌이 발생합니다.
- V53 행만으로는 공유 item과 모든 trigger의 관계를 항상 복원할 수 없습니다. `rule_uid/slo_uid/service_id`만으로 만든 그룹은 공유 item의 전체 선행 trigger를 표현하지 못합니다.
- `group_key varchar(80)`에 UUID 여러 개를 그대로 연결하면 길이를 넘을 수 있으므로 안정적인 hash 형식을 정해야 합니다.
- 기존 행의 `status`, `generation`, `dedup_key`, `target`, `updated_at` 백필 순서와 `NOT NULL/CHECK` 적용 순서를 명문화해야 합니다.

V79 IT는 빈 테이블이 아니라 다음을 포함한 실제 V53 seed로 수행해야 합니다.

- ITEM/TRIGGER/RESOLVE 혼재
- 공유 item을 가진 서로 다른 rule 행
- attempts·future `next_attempt_at`
- 같은 trigger의 RESOLVE와 DELETE
- migration 후 id·backoff·선행 조건 보존

### 6. 해소 경계와 ID/태그 삭제의 식별 조건이 안전하지 않다

근거: [설계:55](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:55), [설계:56](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:56)

`clock < resolveBefore`이면 동일 초에 생긴 Problem은 닫히지 않은 채 RCONF가 성공 종료할 수 있습니다. Zabbix clock이 초 단위이므로 경계가 실제로 발생합니다.

수정안:

- `cutoffEpochSec`를 박제하고 `clock <= cutoffEpochSec`로 정의하거나, 명시적인 exclusive cutoff `transitionEpochSec + 1`을 사용하십시오.
- ID 삭제도 단순 owner 확인이 아니라 전체 식별자를 검증해야 합니다.
  - trigger: synthetic host + owner + ruleUid + scopeUid + kind
  - item: synthetic host + owner + 정확한 item key
- 태그 검색은 AND 조건을 코드에서 재검증하고, 0건=성공, 복수건=모든 owned exact-match 삭제로 정의하십시오.
- 다른 host의 같은 key, owner만 같은 다른 trigger, 예약 바인딩의 null id를 다루는 IT가 필요합니다.

## 🟡 권장

1. §4.8의 교착 분석 방향은 맞지만 테스트가 필요합니다. 현재 1초 장부는 이벤트 후 바인딩으로 갑니다([ApmStuckRequestLedger.java:121](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:121), [ApmStuckRequestLedger.java:146](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:146)). 배치는 부모 선잠금 뒤 바인딩·이벤트를 처리합니다([ApmAlertParentLocks.java:15](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertParentLocks.java:15)). 현재 동일 트랜잭션이면 PostgreSQL이 교착을 검출하지만, 장부 안에서 `REQUIRES_NEW` PROVISION을 부르면 외부 트랜잭션→내부 트랜잭션→배치의 JVM 경유 대기가 되어 PG가 검출하지 못할 수 있습니다. ArchUnit 외에 latch 기반 3자 IT를 추가하십시오.

2. 잠금 순서 표에는 같은 종류 행의 정렬도 넣어야 합니다. 명령 cancel·UPSERT는 `dedup_key/id ASC`, 바인딩·이벤트는 `id ASC`를 명시하십시오. 특히 해소 그룹을 만드는 경로와 취소하는 경로가 같은 명령 행을 반대 순서로 잠그지 않아야 합니다.

3. `queued`, `drift`, `missing`, `pendingCache`, `synced`를 SQL/서비스 단계에서 상호 배타적으로 정의해야 `total = …` 불변식이 실제로 성립합니다. 현재 [설계:137](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:137)과 FE 우선순위만으로는 drift+queued 같은 조합의 집계 위치가 불명확합니다.

4. 단위 4의 마지막 검수는 아직 **반려**입니다([review_apm-alert-unit4-dispatcher-20261011_codex2.md:3](/C:/solutions/_workspace/_archive/features/apm/alerts/review_apm-alert-unit4-dispatcher-20261011_codex2.md:3)). 또한 그 검수가 단위 6으로 넘긴 notification reconcile의 페이지 간 pause·claim 공정성이 이번 설계의 6b에서 빠졌습니다. Zabbix 대조 분할과 별도로 포함하십시오.

5. 명령 실패를 기존 `binding.error` 한 칸에 쓰면 NOT_SUPPORTED·push 오류·STAT 오류가 서로 덮일 수 있습니다. command 상태를 DTO의 정본으로 쓰고, 바인딩 오류는 prefix별 CAS 또는 별도 열로 분리하는 편이 안전합니다.

6. 추정: 다중 노드 rolling deployment를 지원한다면 table/column rename은 구버전 노드를 즉시 깨뜨립니다. coordinated stop 배포를 명시하거나 additive migration→코드 전환→후속 rename/drop의 expand/contract로 나누십시오.

7. 추정: `trigger.delete`가 열린 Problem까지 원하는 방식으로 정리한다는 전제는 설계에 적은 대로 실제 Zabbix 7.x에서 확인해야 합니다. 실패하면 삭제 phase에 RCONF를 포함해야 합니다.

## 🟢 참고

- `premium.apm.alert` 범위 grep에서는 설계 분류표 밖의 Zabbix 쓰기 경로를 발견하지 못했습니다.
- `history.push`를 projection으로 분류한 판단 자체는 맞습니다. 문제는 durability가 아니라 lifecycle 명령과의 **실행 순서**입니다.
- item id를 trigger 생성 전에 짧은 트랜잭션으로 기록하고, 바인딩 소멸 시 보상 삭제를 적재하는 [설계:104](/C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:104)의 방향은 타당합니다. 위 generation·resource fence가 추가되면 외부 성공/DB 실패에도 수렴할 수 있습니다.
- claim의 DB 시각, `SKIP LOCKED`, token CAS, generation 도입과 lower phase의 DEAD 차단 정책은 적절합니다. DEAD 차단 사유와 `retry-dead` 운영 명령은 상태 API에 반드시 드러내야 합니다.
- `ApmAlertSyncService`가 현재 트랜잭션 안에서 읽기·재생성·상태 갱신을 수행한다는 인용도 정확합니다([ApmAlertSyncService.java:117](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:117), [ApmAlertSyncService.java:172](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:172)).

## U1~U4 의견

- **U1 — 현재 형태의 제한 시간 동기 실행에는 반대합니다.** 우선은 완전 비동기+폴링이 안전합니다. 제한 시간 방식을 택하려면 호출 스레드가 RPC를 수행하지 않고, bounded executor 작업을 최대 3초만 await하는 형태로 바꿔야 합니다.

- **U2 — 포함에 동의합니다.** queued를 모르는 FE는 예약 바인딩을 정상으로 표시하므로 BE와 같은 배포 묶음이어야 합니다.

- **U3 — 실패 판정에 동의합니다.** 다만 메시지 문자열만으로 구분하지 말고 `decisionCommitted=true`, `failedPhase=ZABBIX`, `commandsPending` 같은 구조화 필드를 실행 이력에 남기는 것이 좋습니다.

- **U4 — 명령 종류별 분리를 권장합니다.** DELETE·해소·disable은 라이선스와 무관하게 계속 실행해야 합니다. 반면 PROVISION·enable까지 “정리 의무”로 묶는 근거는 부족합니다. 평가 잡은 활성 라이선스를 요구하므로([ApmAlertEvaluationJob.java:24](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationJob.java:24)), 만료 중 새 객체를 만들거나 stale 값을 가진 trigger를 켜는 것은 위험합니다. PROVISION·enable은 라이선스 복구까지 PENDING으로 유지하거나, 라이선스 만료가 desired state에 포함되도록 정책을 먼저 확정하십시오.

## 구현 단위 조정

1. **선행 게이트:** 단위 4의 `discard(false)` 반려 사유를 해결하고 V78을 커밋·확정합니다. 현재 V78은 워크트리에서 미커밋 상태이므로 V79 번호도 이 뒤에 확정해야 합니다.

2. **5a-1 — 명령 대수와 migration만:** command별 conflict merge, generation, resource key, dependency/phase 모델, V53 실데이터 승계를 먼저 구현·검증합니다.

3. **5a-2 — DELETE/RESOLVE 실행기:** 공유 item 의존, cutoff 경계, exact identity 삭제, 보존 경쟁 IT까지 통과시킵니다.

4. **5b — PROVISION/STAT/facade:** item 중간 기록·보상, lease renewal, background `runNow`, hard response budget, queued 계약을 구현합니다.

5. **6a — 판정 분할:** 직접 `history.push`를 두지 말고 resource sequencer를 통과시킵니다. stale PROVISION/STAT/해소/삭제 명령이 하나라도 있으면 해당 resource의 push를 fence합니다.

6. **6b — 두 대조 작업:** `ApmAlertSyncService` 분할과 단위 4에서 이관된 notification reconcile의 bounded page·pause 공정성·continuation을 함께 완료합니다.

7. **추가 필수 IT/뮤테이션:** DELETE 재적재 경쟁, 공유 item의 복수 trigger, 동일 초 `resolveBefore`, 지연된 양수 push↔disable↔enable, hanging RPC의 3초 facade 응답, 기본 설정의 lease 검증, 1초 장부·판정·worker 3자 교착을 추가합니다.

8. 단위 1~6을 병합하더라도 1초 장부의 in-transaction Zabbix I/O는 남습니다. 이를 알려진 임시 예외로 배포할지, 단위 7까지 같은 배포로 묶을지 명시적으로 결정해야 합니다.
