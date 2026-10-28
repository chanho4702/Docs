## 판정
**재설계 필요** — 비활성 규칙의 상태 복구를 단독 `STAT`로 처리하면 열린 Problem이 남거나 재활성화 직후 오탐이 발생할 수 있고, `DEAD` 명령 비부활 및 이어하기 완료 판정도 현재 설계로는 보장되지 않는다.

## 🔴 필수(구현 전에 설계를 고칠 것)

1. **비활성 규칙을 포함하는 대조 대상을 별도로 정의해야 한다.**

   §15.2의 1단계는 `enabled 규칙 × targetsOf`만 스냅샷한다고 쓰면서, 3단계에서는 꺼진 규칙의 트리거 상태도 비교한다. 이 구성으로는 비활성 규칙의 기존 binding을 발견할 수 없다. 현재 동기화 역시 비활성 규칙을 건너뛴다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:632`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:645`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:139`

   다음처럼 집합을 분리해야 한다.

   - 객체 복구·drift 대조: `enabled 규칙 × targetsOf`
   - 상태 대조: 활성·비활성 규칙의 **기존 binding만**
   - 비활성 규칙에는 신규 binding이나 `PROVISION`을 만들지 않음

2. **트리거 상태 불일치를 단독 `STAT`로 복구하면 안 된다.**

   현재 설계는 상태 불일치에 `STAT`만 적재한다. 하지만 비활성화 전에 `-1` resolve push가 없으면 Zabbix Problem이 열린 채 남는다. 기존 서비스도 이를 이유로 `RESOLVE_PUSH(soft) → STAT → RCONF` 순서를 사용한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:645`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:515`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:521`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:534`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCleanupService.java:192`

   반대로 재활성화도 stale 양수값에 의한 즉시 오탐을 막으려면 `RESOLVE_PUSH(hard) → STAT` 순서가 필요하다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCleanupService.java:228`

   따라서 6b는 다음 의미적 command group을 재사용해야 한다.

   - 원하는 상태가 OFF: 기존 disable/resolve group
   - 원하는 상태가 ON: hard resolve 후 enable하는 restore group
   - 객체가 없어서 `PROVISION`하는 경우: 같은 주기에 별도 단독 `STAT` 중복 적재 금지

3. **`DEAD` 비부활 조건을 모든 적재 경로에 명시해야 한다.**

   §15는 6a와 같은 성질로 `DEAD`를 되살리지 않는다고 하지만, 일반 command upsert는 기존 `DEAD`를 `PENDING`으로 되돌린다. `provisionPending`만으로는 `PENDING/PROCESSING`만 확인하므로 충분하지 않다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:672`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1125`

   6a처럼 `DEAD`까지 포함한 상태 조회 후 적재를 억제해야 한다. 이는 `PROVISION`, `STAT`, resolve/restore group 모두에 적용되어야 한다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:216`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1133`

4. **클라이언트가 보관하는 원시 `afterEventId`를 완료 증명으로 사용하면 안 된다.**

   현재 페이지 조회는 “지금 actionable인 이벤트 중 `id > cursor`”만 반환한다. 이미 커서가 지나간 이벤트가 나중에 `RESOLVED`가 되면 영구 누락될 수 있다. 오래되거나 조작된 큰 커서도 빈 페이지를 만들어 거짓 `complete=true`를 낼 수 있다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:661`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:375`

   다음 계약이 필요하다.

   - cursor를 opaque·서명된 값으로 만들고 `channelId`, 활성화 generation/시각, high-watermark를 포함
   - 다른 채널·이전 활성화 세대·범위 밖 cursor 거부
   - 마지막에 0부터 verification sweep을 수행한 뒤에만 `complete=true`
   - 원시 `afterEventId`는 최적화 힌트일 수는 있어도 완료 증명이 될 수 없음

5. **statement timeout 계약을 SQLSTATE까지 구체화해야 한다.**

   현재 retry 대상은 lock/deadlock/serialization 계열이고 PostgreSQL statement timeout의 `57014`는 포함되지 않는다. 설계의 “timeout이면 cursor 반환”만으로는 실제 API가 500으로 끝날 가능성이 있다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:664`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:435`

   `57014`를 트랜잭션 밖에서 잡아 다음을 반환하도록 명시해야 한다.

   - 해당 페이지 전체 rollback
   - `complete=false`
   - `nextCursor`는 마지막 커밋 cursor, 첫 페이지 timeout이면 입력 cursor
   - rollback된 페이지의 insert/discard 수는 결과 집계에서 제외

6. **§15.4 삭제 목록을 호출 그래프 단위로 확장해야 한다.**

   `applyOurDefinition`과 `retryPendingTriggerStatus`를 삭제하면 아래 private type/helper도 호출처가 0이 된다.

   - `binding(...)`, `ensureItem`, `ensureTrigger`, `triggerStatus`
   - `StatusOutcome`, `applyTriggerStatus`, `TriggerStatusRetryResult`, `ownedTrigger`

   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:288`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:467`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:529`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:863`

   반면 `alignLegacyDescription`은 command 기반 `PROVISION` 경로가 계속 사용하므로 유지한다는 정정이 맞다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1370`

## 🟡 권장

- `zabbixStatus` 분리 시 `requireNoTransaction()`은 `try` 바깥의 첫 문장이어야 한다. 안쪽에 넣으면 트랜잭션 오용 예외가 `reachable=false`로 삼켜질 수 있다. 현재 `status()`는 `RuntimeException`을 정상 상태 결과로 변환한다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1785`

- `readTrigger`에도 같은 no-transaction guard를 추가하는 방향은 타당하다. 기존 resync 경로는 외부 조회와 DB 쓰기를 이미 분리한다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:984`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:722`

- 잠금 순서는 서비스 `KEY SHARE → SLO → 규칙 SHARE → binding FOR UPDATE → command`라는 정규 순서를 명시하는 편이 안전하다. §15가 SLO 재검증까지 요구한다면 규칙 lock 이후에 SLO를 얻어서는 안 된다. 동일 종류의 다중 ID도 정렬해야 한다. 현재 parent lock은 서비스 후 규칙 순서를 사용하고, 규칙 쓰기도 서비스→SLO→규칙 순서다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertParentLocks.java:55`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:1373`  
  교착이 없다는 판단은 **현재 호출 그래프를 기준으로 한 추정**이며 실행 검증은 아니다.

- ArchUnit은 method-name 정규식만 늘리기보다 `sync` 패키지에서 bridge write API 및 executor 직접 의존 자체를 금지해야 한다. 현재 검사는 wrapper나 새 이름의 메서드로 우회될 수 있다.  
  `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxWriteSingleEntryTest.java:36`  
  `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxWriteSingleEntryTest.java:132`

- 알림 페이지 사이의 양보 시간은 advisory lock과 transaction을 모두 놓은 뒤 적용하고, 전체 deadline 계산에 포함해야 한다. 활성화·재조정의 페이지별 배타 try-lock 및 채널 enabled 재검증은 유지해야 한다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:319`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:334`

- §15.8-5의 “노드 수만큼 전체 조회” 전제는 수정해야 한다. scheduler는 분산 lease를 먼저 획득하므로 정상 상태에서는 한 노드만 실행한다. 실제 위험은 작업이 30분 lease TTL을 초과하거나 lease가 유실되는 경우다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/SchedulerManager.java:153`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/SchedulerManager.java:161`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/SchedulerLeaseService.java:23`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/SchedulerLeaseService.java:58`

- 구현 검증 항목에 다음을 추가해야 한다: 비활성 규칙의 열린 Problem 종료, 재활성화 직후 오탐 방지, 모든 command 종류의 `DEAD` 유지, inventory 후 규칙 변경·삭제 경쟁, 커서 아래 이벤트의 후발 resolve, 잘못된 cursor, `57014`, 동일 description의 복수 exact trigger.

## 🟢 확인된 것

- §15.1의 핵심 진단은 대체로 코드와 일치한다. `syncAll()`은 트랜잭션 안에서 parent lock, 상태 재시도, Zabbix 조회와 definition 적용을 수행한다. 다만 “약 2N RPC”는 정상 happy path의 근사치이며 누락 객체·retry 경로는 더 많다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:123`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:127`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:131`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:179`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/ApmAlertSyncService.java:183`

- `inventory`는 no-transaction guard 후 전체 item/trigger를 읽지만 현재 snapshot 필드는 제한적이다. `provisionNeed`는 host foreign, item/trigger 누락, disabled item 및 legacy name을 판정한다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1576`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1620`

- `itemError`, `readTrigger`, `status`에 no-transaction guard가 빠져 있다는 서술도 맞다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:696`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:722`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1785`

- 6a repair와 동일하게 stage 3에서 최신 DB 상태를 재확인하고 host가 `FOREIGN`이면 command를 0개 적재하는 방향은 타당하다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertZabbixPhase.java:203`

- 알림 이어하기를 페이지별 독립 트랜잭션으로 구현하면 단위 4의 페이지 원자성, 배타 try-lock, 일시정지 2단계, discard 보존 규칙을 깨지 않는다. 이는 각 페이지가 rollback 단위이고 양보가 transaction 밖에서 수행된다는 조건부 판단이다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:190`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:244`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:126`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationStore.java:204`

- due command lag는 이미 `zabbixStatus`에서 계산하므로 6b 이관 항목이 반영되어 있다.  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:354`  
  `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertZabbixStatusDto.java:90`

## §15.8 판단 요청에 대한 답(1~5)

1. **찬성 — 비강제 `PROVISION`이 맞다.**  
   `enforce=false`는 이미 존재하는 수동 expression/status를 덮어쓰지 않으면서 누락 객체는 생성한다. §4.6의 `enforce` 원안은 §15에서 명시적으로 폐기해야 한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:172`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:79`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1351`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1407`

2. **이행이지만 단독 `STAT`는 반대한다.**  
   규칙 enabled 상태와 `binding.orphaned`가 원하는 상태의 정본이므로 Zabbix status를 맞추는 것은 사람 결정을 뒤집는 것이 아니다. executor의 판정도 이 정의와 일치한다. 다만 안전한 resolve/restore command group을 거쳐야 한다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:70`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxTriggerStatusExecutor.java:113`

3. **경쟁 자체는 허용 가능한 eventual consistency지만 재검증이 필수다.**  
   snapshot 뒤 규칙 변경·삭제는 stage 3의 잠금 및 최신 상태 재조회로 무효화해야 한다. Zabbix 객체가 그 사이 복구된 경우 비강제 `PROVISION`은 멱등 수렴할 수 있다. 다만 snapshot 직후 외부에서 다시 바뀐 상태까지 선형화할 수는 없으므로 다음 주기까지의 지연은 명시해야 한다. 이는 **코드 구조에 근거한 추정**이다. `DEAD` 명령 비부활 검사가 없으면 이 결론은 성립하지 않는다.

4. **현 규모에 한해 수용 가능하나 무제한 허용은 반대한다.**  
   현재 `inventory`는 모든 item/trigger를 메모리 snapshot으로 만든다. 일 1회·단일 lease 실행이면 우선 수용할 수 있지만, host별 item/trigger 수와 응답 bytes, 소요 시간을 계측하고 상한 또는 paging 전환 기준을 설계에 적어야 한다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1568`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1613`

5. **현재 문제 정의를 수정해야 한다.**  
   정상적인 multi-node 배포에서는 scheduler lease 때문에 노드 수만큼 Zabbix 읽기가 발생하지 않는다. 위험은 30분을 넘는 실행 또는 lease 유실 후 중복 실행이다. 또한 command upsert는 generation을 갱신하므로 “upsert가 중복 실행까지 완전히 막는다”고 볼 수도 없다. lease TTL, 예상 최악 실행 시간, 필요 시 heartbeat/갱신을 설계 판단 대상으로 바꾸는 것이 맞다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/sync/SchedulerLeaseService.java:23`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:679`
