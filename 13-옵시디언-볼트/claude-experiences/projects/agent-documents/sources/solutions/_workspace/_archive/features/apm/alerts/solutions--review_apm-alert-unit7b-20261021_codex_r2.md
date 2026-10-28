## 판정

**승인** — 1차 🔴1은 해소됐으며, 정적 검수에서 새로운 승인 차단 결함은 확인되지 않았다.

파일 수정·테스트 실행 없이 실제 미커밋 파일을 설계·diff·실측과 대조했다. 테스트·뮤테이션 통과 보고는 독립 재검증하지 않았다. 아래 코드 상대경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이다.

## 🔴 필수

없음.

## 🟡 권장

아래 항목은 승인을 막지 않는다.

1. **interrupt 회귀 테스트의 검증 범위를 보강한다.** 실제 잠금 대기 interrupt와 실행기의 `INTERRUPTED → STOPPED` 분기를 각각 검증한다. 다만 allocator IT의 “예약 없음” 단언은 `last_clock`만 비교하므로 같은 초의 `last_ns` 변경까지 검출하지 못한다. 전체 watermark 불변·pusher 미호출, 워커를 거친 명령 행 보존까지 연결하면 더 강하다. 근거: [ApmZbxItemPushClockIT.java:152](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxItemPushClockIT.java:152), [ApmZbxPushCurrentExecutorTest.java:81](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxPushCurrentExecutorTest.java:81).

2. **병합에서 `cutoff`를 유지하는 정책을 설계에 맞춰 명확히 한다.** 값·`sampleMs`는 선택된 표본을 따르지만, `cutoff`는 여전히 두 행의 최댓값이다. 설계의 “값·표본·clock을 함께 선택”과는 차이가 있다. 현재 신선도·나이는 `sampleMs`, 전송 순서는 allocator가 담당하므로 이 차이로 인한 기능 결함은 확인하지 못했다. 근거: `command/ApmZbxCommandStore.java:801`, `:827`; 설계 `apm-alert-unit5-6-design-20261011.md:1063`.

3. **남은 검증 공백은 유지보수 항목으로 남긴다.** 잠금 대기 중 실제 generation 변경, 첫 INSERT 충돌, PROVISION 재적재 뒤 원래 표본 기준 만료, 복원 식별 경로의 실효 cutoff를 직접 연결하는 테스트는 부족하다. 할당기 우회 방지 ArchUnit도 빠져 있다. 현재 규칙은 호출자가 `command` 패키지인지까지 검사한다. 근거: [ApmZbxItemPushClockIT.java:107](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxItemPushClockIT.java:107), [ApmZbxCommandExecutionIT.java:200](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:200), [ApmZbxWriteSingleEntryTest.java:51](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxWriteSingleEntryTest.java:51).

## 🟢 확인된 것

- **1차 🔴1 해소.** 잠금 대기 interrupt는 예약 전에 `INTERRUPTED`로 반환한다. PushCurrent는 interrupt·claim 상실을 `stopped()`로, 재검증에서 확인한 값 만료만 `done()`으로 처리한다. ResolvePush도 interrupt를 반납한다. 워커의 `STOPPED` 처리는 행 삭제가 아닌 `PENDING` 전환이다. 근거: `command/ApmZbxItemPushClock.java:101`, `command/ApmZbxPushCurrentExecutor.java:176`, `:191`, `command/ApmZbxResolvePushExecutor.java:130`, `command/ApmZbxCommandWorker.java:459`, `command/ApmZbxCommandStore.java:1566`.

- **잠금·트랜잭션 순서가 설계와 맞는다.** 트랜잭션 내부 진입 거부 → 제한 시간 JVM 잠금 → 재검증 → 예약 트랜잭션 커밋 → RPC → 잠금 해제 순서다. 두 push 명령의 리스 계산에도 잠금 대기를 더한다. 근거: `command/ApmZbxItemPushClock.java:94`, `:109`, `:112`, `:116`, `command/ApmZbxCommandProperties.java:108`.

- **시각 할당과 표본 신선도가 분리됐다.** 첫 예약 ns=1, 같은 clock의 ns 증가·넘침, 옛 표본 거부·동일 표본 허용, 정렬용 -1의 표본 watermark 보존을 구현했다. 두 브리지 입구 모두 할당된 ns를 전달한다. 근거: `command/ApmZbxItemPushClock.java:137`, `:149`, `:154`, `:166`, `bridge/ZabbixAlertBridge.java:1192`, `:1210`.

- **표본 전달·전환 규칙이 연결됐다.** STUCK은 같은 공개 스냅샷의 값·tick을 읽고, 장부는 tick 기준 시각을 적재한다. PROVISION 재적재는 원래 표본을 보존하며, 표본 없는 옛 STUCK은 버린다. 값 나이는 잠금 획득 후에도 원래 표본으로 재검사한다. 근거: `evaluate/ApmStuckRequestMonitor.java:383`, `evaluate/ApmAlertEvaluationService.java:480`, `bridge/ApmZbxCleanupService.java:349`, `command/ApmZbxProvisionExecutor.java:307`, `command/ApmZbxPushCurrentExecutor.java:135`, `:180`.

## 판단 요청 답

1. **설계 대비 누락·왜곡:** 핵심 동작은 반영됐다. 기존 옛 행이 병합에서 이길 때 새 행의 `sampleMs`를 제거하므로 1차에서 지적한 표본 혼합은 해소됐다. 첫 INSERT 충돌 후 재조회 루프도 **READ COMMITTED·운영 중 watermark 행을 삭제하지 않는 전제에서 타당하다.** 이는 코드에 근거한 판단이며 충돌 실행을 재현하지 않았다. `cutoff` 최댓값 유지와 빠진 검증은 위 🟡에 해당한다. 근거: `command/ApmZbxCommandStore.java:806`, `command/ApmZbxItemPushClock.java:131`, `:138`, `:146`.

2. **`STOPPED` 뒤 두 번째 renew:** **이번 구현에서 제거됐다.** 잠금 획득 후 한 번의 renew와 만료 사유 기록으로 구분한다. 소유 확인 전 renew는 별도의 RPC 구간 보호이므로 유지할 의미가 있다. interrupt를 완료로 오인하던 경로의 회귀는 확인되지 않았다. 근거: `command/ApmZbxPushCurrentExecutor.java:152`, `:177`, `:181`, `:193`.

3. **복원 식별의 아이템 키:** 정상 바인딩에서는 **같은 키가 된다.** 복원은 DB의 kind·scope UID를 사용하며, SLO UID·`collector`·서비스 UID 규칙이 push 경로와 일치한다. 복원 불가·불일치는 DEAD로 차단한다. 다만 복원 경로와 watermark 조회를 결합한 직접 테스트는 부족하다. 근거: `command/ApmZbxResolveConfirmExecutor.java:71`, `:145`, `:153`, `:162`, `command/ApmZbxCommandStore.java:1844`, `rule/ApmAlertBindingScopes.java:39`.

4. **FakeZabbix의 충분성:** **중복 tuple 방지·역전 도착 방지·옛 표본 미전송 검증에는 충분하다.** 하지만 push가 트리거 상태를 실제로 판정하지 않으므로 “실제 Zabbix에서 Problem이 계속 OK다”까지 증명하지는 않는다. 실측은 그 인과관계를 뒷받침하지만, allocator 경유 실제 재실측은 남아 있다. 근거: [FakeZabbixAlertBackend.java:784](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/support/FakeZabbixAlertBackend.java:784), [ApmStuckRequestLedgerIT.java:179](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:179), `C:/solutions/_workspace/_archive/features/apm/alerts/zbx_clock_probe_20261021.log:7`, `C:/solutions/_workspace/_archive/features/apm/alerts/zbx_ns_probe_20261021.log:6`.