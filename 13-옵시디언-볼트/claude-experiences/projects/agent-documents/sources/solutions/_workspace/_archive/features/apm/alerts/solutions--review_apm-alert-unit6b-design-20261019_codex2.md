## 판정

**재설계 필요** — 🔴1·6은 해소됐지만, 상태 복구 메서드 선택, lifecycle 명령 억제, 커서 세대·VERIFY 완료 증명, 첫 페이지 `57014` 복구 계약에 필수 결함이 남아 있다.

## 1차 지적 해소 확인(🔴1~6)

1. **🔴1 대상 집합 분리 — 해소**

   객체 복구는 활성 규칙, 상태 대조는 활성·비활성 규칙의 기존 binding으로 분리했고, 비활성 규칙에서 신규 binding/PROVISION을 금지했다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:681`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:683`

2. **🔴2 의미 단위 상태 복구 — 미해소**

   원하는 OFF에 `enqueueResolveGroup`을 쓰는 선택은 맞다. soft RPUSH → STAT → RCONF를 실제로 구성한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:687`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:202`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:214`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:220`

   원하는 ON에 `enqueueEnable`을 쓰는 것은 6b의 “상태만 복구” 의미와 맞지 않는다. 이 메서드는 문서에 적힌 hard RPUSH → STAT뿐 아니라 **강제 `PROVISION(enforce=true)`도 함께 적재**한다. 이는 §15.9가 확정한 비강제 PROVISION 및 수동 drift 보존과 충돌한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:679`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:688`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:237`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:255`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:257`

   기존 객체의 상태 불일치만 복구할 때는 `enqueueRestore`가 더 정확하다. 남은 RCONF를 취소하고 hard RPUSH → STAT만 적재하며 PROVISION은 추가하지 않는다. 현재도 고아 binding 복귀에 이 의미로 사용한다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:273`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:278`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:285`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ApmZbxCleanupService.java:290`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:214`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertOrphanSweeper.java:220`

   반대로 사용자가 규칙을 직접 켜거나 정의 변경까지 다시 적용하는 경로에는 `enqueueEnable`이 맞다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:506`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:509`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:546`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/rule/ApmAlertService.java:550`

3. **🔴3 DEAD 비부활 — 미해소**

   DEAD까지 조회하겠다는 목적은 반영됐지만, “lifecycle 명령이 어떤 상태든 하나라도 있으면 적재하지 않는다”는 조건이 너무 넓다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:691`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:693`

   PENDING은 반드시 수렴한다는 보장이 없다. 선행 명령이 DEAD이면 dependency edge가 유지되고, successor PENDING은 edge가 없어질 때까지 claim되지 않는다. 이 상태는 운영자 개입이 없으면 영구 지속될 수 있다.  
   `src/main/resources/db/migration/V79__apm_zbx_command.sql:20`  
   `src/main/resources/db/migration/V79__apm_zbx_command.sql:21`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:891`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:896`

   또한 PENDING/PROCESSING이 과거 OFF 의사인데 현재 원하는 상태가 ON인 경우에도 최신 의사를 병합하지 못한다. 기존 upsert의 `generation+1`·target 병합 구조를 의도적으로 우회하게 된다. 이는 코드 구조에 근거한 정적 추론이다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:679`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:682`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:685`

   오래된 DONE은 완료 시 행 자체가 삭제되므로 설계 대상이 아니다. 이 부분은 문제없다.  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1304`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1308`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandStore.java:1312`

4. **🔴4 커서와 완료 증명 — 미해소**

   HMAC, channel, hwm, phase 도입은 원시 `afterEventId`보다 개선됐지만 세대 구분과 VERIFY 완료 증명이 불완전하다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:698`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:701`

5. **🔴5 `57014` 계약 — 미해소**

   SQLSTATE, 페이지 rollback, 집계 제외까지 명시한 점은 해소됐다. 하지만 첫 호출·첫 페이지 timeout이면 “입력 cursor”가 null이어서 캡처한 `gen/hwm`을 보존한 재개 커서를 반환할 수 없다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:705`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:707`

6. **🔴6 삭제 호출 그래프 — 해소**

   직접 메서드뿐 아니라 전용 helper/type까지 삭제 후보에 포함했고, `alignLegacyDescription`·`readTrigger`는 유지한다고 바로잡았다. 현재 호출 그래프와 일치한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:709`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:710`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:288`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:467`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:869`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1372`

## 🔴 필수

1. **ON 상태 대조는 `enqueueRestore` 또는 동일 의미의 전용 메서드로 바꿔야 한다.**

   `enqueueEnable`의 숨은 강제 PROVISION을 그대로 두면 §15.9의 drift 보존 결정을 위반한다. 이름 혼동이 우려되면 `enqueueStateRestore` 같은 전용 facade로 분리하되 실제 명령은 RCONF 취소 + hard RPUSH → STAT이어야 한다.

2. **lifecycle 존재 여부가 아니라 “현재 원하는 의사를 이미 대표하는 명령인가”를 판정해야 한다.**

   - DEAD: 동일 실패 의사의 자동 부활은 금지한다.
   - PENDING/PROCESSING: 최신 원하는 상태와 일치하면 skip하고, 반대 의사이면 generation/target 병합 또는 명시적 supersede가 필요하다.
   - DEAD predecessor에 막힌 PENDING은 “곧 수렴할 명령”으로 취급하면 안 된다.
   - `skippedDead`만으로 PENDING·PROCESSING까지 묶어 세지 않는다.

3. **`lifecycleStates(bindingIds)`의 명령-바인딩 연관 규칙이 누락됐다.**

   `PROVISION`·STAT·RPUSH에는 `binding_id`가 있지만 RCONF와 DELETE_*에는 현재 `binding_id=null`이다. 단순 `binding_id` 조회로는 설계가 열거한 모든 명령을 찾을 수 없다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:692`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:69`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:74`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:109`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:117`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:159`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandSpec.java:175`

   resource key·dedup key·trigger/item identity를 통한 매핑을 명시하거나, 향후 명령부터 실제 `binding_id`/command-group 식별자를 저장해야 한다.

4. **같은 회차 PROVISION이면 B를 무조건 건너뛰는 규칙도 수정해야 한다.**

   비강제 PROVISION은 기존 exact trigger가 있으면 정의와 status를 보존한다. 예를 들어 `LEGACY_NAME + disabled trigger`면 A가 이름만 고치고 B는 생략되어 trigger가 계속 꺼져 있다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:689`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1367`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1370`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1374`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1642`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/bridge/ZabbixAlertBridge.java:1645`

   PROVISION 결과가 실제로 status까지 수렴시키는 need만 B를 생략하거나, PROVISION 뒤에 restore group dependency를 연결해야 한다.

5. **`activated_at` epoch ms를 activation generation으로 쓰면 안 된다.**

   `activated_at`은 `timestamp`이고 재활성화 때 `localtimestamp`로 갱신되지만, 커서에서는 millisecond로 축소한다. OFF → ON 두 트랜잭션이 같은 ms에 끝나면 이전 커서와 새 세대를 구분하지 못한다. 따라서 “끄고 다시 켬을 확실히 구분”하지 못한다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:699`  
   `src/main/resources/db/migration/V77__apm_alert_notification.sql:58`  
   `src/main/resources/db/migration/V77__apm_alert_notification.sql:61`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:147`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:150`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:201`

   채널 행에 `activation_generation bigint`를 두고 false→true 전환마다 원자적으로 증가시키는 방식이 필요하다. `activated_at`은 감사 시각으로만 유지하는 편이 안전하다.

6. **VERIFY는 actionable 행이 아니라 원시 event-id 구간을 페이지해야 한다.**

   현재 형태처럼 누락된 actionable 행만 `ORDER BY id LIMIT N`으로 찾으면 누락이 거의 없는 대규모 이력에서 `after=0`부터 `hwm` 전체를 읽어야 한다. 5초 `statement_timeout`에 매번 걸리면 같은 VERIFY cursor를 계속 반환하여 실제로 영구 정지할 수 있다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:701`  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:706`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:378`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:388`

   `id > after AND id <= hwm ORDER BY id LIMIT pageSize`로 원시 ID 구간을 먼저 자르고, 그 구간 안에서 누락을 채워야 한다. 그래야 누락 0건이어도 `after`가 전진하며 유한 종료한다.

7. **“활성화 뒤 resolve는 정상 outbox가 처리한다”는 전제가 틀린 경우를 처리해야 한다.**

   활성화 당시 열려 있던 이벤트가 bootstrap FIRED 생성 전에 resolve되면 정상 RESOLVED 적재는 기존 FIRED를 요구하므로 아무 행도 만들지 않는다. 현재 backfill 조건도 `resolved + FIRED 없음`을 선택하지 않는다. VERIFY를 같은 조건으로 반복해도 누락된다.  
   `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:702`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:71`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:77`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/ApmAlertNotificationOutbox.java:81`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:381`  
   `src/main/java/com/dmove/moveseye/premium/apm/alert/notify/AlertChannelActivation.java:384`

   활성화 시점에 열려 있던 이벤트를 `fired_at <= activated_at` 및 `resolved_at IS NULL OR resolved_at >= activated_at`처럼 재구성해 FIRED와 RESOLVED를 함께 채우거나, 별도 전이 장부를 기준으로 해야 한다.

8. **첫 페이지 `57014`에도 유효한 재개 커서를 반환해야 한다.**

   cursor 없는 첫 요청에서 먼저 `{gen, phase=SCAN, after=0, hwm}`을 확정·서명한 “effective cursor”를 만들고, 첫 페이지 timeout이면 그것을 반환해야 한다. null을 반환하면 동일 hwm으로 재개할 방법이 없다.

   또한 Spring이 `SQLException`을 감싸므로 cause chain 전체에서 `57014`를 찾아야 한다. 기존 코드에 같은 선례가 있다.  
   `src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:639`  
   `src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:642`  
   `src/main/java/com/dmove/moveseye/premium/apm/archive/ApmArchiveSource.java:643`

## 🟡 권장

- 결과 집계를 `skippedPending`, `skippedProcessing`, `skippedDead`, `blockedByDead`로 분리한다. 현재 `skippedDead` 하나로는 정상 지연과 수동 복구 필요 상태를 구분할 수 없다.  
  `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:693`

- 커서 구현은 `ApmExportPlanToken`처럼 최대 길이 제한, 엄격한 버전/필드 파싱, constant-time MAC 비교를 명시한다.  
  `src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:56`  
  `src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:63`  
  `src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:138`

- `57014`는 PostgreSQL의 일반 `query_canceled`이므로 모든 57014를 `timedOut=true`로 취급할지, 서버가 설정한 statement timeout만 그렇게 볼지 정책을 명시한다.

- `hwm` 조회 결과가 빈 테이블에서 null일 때의 정규값을 `0`으로 확정한다.

## 🟢 확인된 것

- OFF 복구에 `enqueueResolveGroup`을 재사용하는 판단은 정확하다.
- ON 상태만 복구할 때는 `enqueueRestore`, 사용자 규칙 활성화·정의 재적용에는 `enqueueEnable`이라는 의미 차이가 코드에서 확인됐다.
- 목적 분리 HMAC, channel 바인딩, fixed hwm, SCAN/VERIFY phase 도입 방향 자체는 타당하다.
- `status()`의 no-transaction guard 위치, ArchUnit 의존 금지, 페이지 사이 lock 해제, scheduler 15분 상한 정정은 적절하다.  
  `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:712`  
  `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:716`
- 파일 수정이나 테스트 실행 없이 HEAD `bad215d` 코드와 설계 문서만 정적으로 대조했다.
