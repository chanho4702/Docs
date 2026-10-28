## 판정

**조건부 승인** — 핵심 설계는 반영됐지만, interrupt된 미전송 `PUSH_CURRENT`를 완료·삭제하는 경로는 수정해야 한다.

파일 수정·테스트 실행 없이 정적으로 검수했다. 아래 코드 경로는 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이다. 테스트 통과·뮤테이션 결과는 요청서의 보고이며 독립 재검증하지 않았다.

## 🔴 필수

1. **잠금 대기 중 interrupt를 값 만료로 오인해 명령을 삭제할 수 있다.**

   할당기는 `InterruptedException`에서도 `STOPPED`를 반환한다. 그런데 PushCurrent는 `STOPPED` 뒤 `ctx.renew()`가 성공하면 값 나이를 확인하지 않고 `done()`을 반환한다. 따라서 **유효한 표본이고 claim도 유지됐지만 아직 push하지 않은 명령**이 완료된다.

   워커 종료가 실제로 `shutdownNow()`를 사용하므로 진입 경로도 있다. 이후 완료 CAS까지 성공하면 명령이 삭제된다. **코드에 근거한 추론이며 실행 재현은 하지 않았다.**

   - interrupt → `STOPPED`: `command/ApmZbxItemPushClock.java:99`
   - renew 성공 → 무조건 완료: `command/ApmZbxPushCurrentExecutor.java:184`
   - 종료 시 interrupt: `command/ApmZbxCommandWorker.java:150`
   - 완료 시 행 삭제: `command/ApmZbxCommandStore.java:1466`

   **수정 조건:** interrupt·claim 상실은 `stopped()`로 반납하고, 실제 값 만료만 완료해야 한다. claim이 유효한 상태에서 잠금 대기를 interrupt해 **push 없음·예약 없음·명령 보존**을 확인하는 회귀 테스트가 필요하다.

## 🟡 권장

승인을 막지 않는 항목이다.

- **옛 행 병합에서 선택한 값과 표본을 명시적으로 정규화한다.** 표본 없는 기존 행이 비교에서 이기면 `excluded.target || c.target` 때문에 값은 기존 행, `sampleMs`는 신규 행의 것이 될 수 있다. 다만 중지 후 교체·시계 비역행 전제에서 이 조합이 발생하는 정상 실행 경로는 확인하지 못했다. 기존 행을 선택할 때 복원 가능한 표본을 명시하거나, STUCK의 표본 부재를 유지하는 편이 명확하다. 근거: `command/ApmZbxCommandStore.java:801`, `command/ApmZbxCommandStore.java:805`.

- **테스트의 입증 범위를 보강한다.** 새 테스트는 tuple 증가·표본 비교·직렬화를 검증하지만, 실제 잠금 대기 중 generation 변경, 첫 INSERT 충돌 후 재조회, 전송 실패 후 재시도, PROVISION 재적재 뒤 원래 표본 기준 만료를 직접 검증하지 않는다. 근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxItemPushClockIT.java:107`, `:122`, `:159`.

- **할당기 우회 방지 ArchUnit이 빠졌다.** 기존 규칙은 호출자가 `command` 패키지인지 검사하므로, 실행기가 할당기를 건너뛰고 브리지를 직접 호출해도 허용한다. 현재 프로덕션 호출 두 곳은 할당기를 경유한다. 근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxWriteSingleEntryTest.java:51`; 설계 `C:/solutions/_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md:1135`.

## 🟢 확인된 것

- **예약 커밋 후 RPC가 실행된다.** 트랜잭션 안 진입을 거부하고, 아이템 잠금 획득 → 재검증 → 예약 트랜잭션 종료 → pusher 순서를 지킨다. 근거: `command/ApmZbxItemPushClock.java:92`, `:107`, `:110`, `:114`.
- **시각·표본 규칙이 구현됐다.** 첫 예약 ns=1, 동일 clock의 ns 증가·넘침, 오래된 표본 거부, 같은 표본 허용, 표본 없는 정렬 push의 watermark 보존을 확인했다. 근거: `command/ApmZbxItemPushClock.java:135`, `:147`, `:152`, `:164`.
- **표본 전달과 전환 처리가 연결됐다.** STUCK 값·tick을 같은 스냅샷에서 읽고, 재적재에 표본을 보존하며, 표본 없는 옛 STUCK은 버린다. 값 나이도 원래 `sampleMs`로 재검사한다. 근거: `evaluate/ApmStuckRequestMonitor.java:384`, `command/ApmZbxProvisionExecutor.java:307`, `command/ApmZbxPushCurrentExecutor.java:135`, `:176`.
- **두 push 경로 모두 할당된 ns를 전달한다.** 근거: `command/ApmZbxPushCurrentExecutor.java:175`, `command/ApmZbxResolvePushExecutor.java:128`, `bridge/ZabbixAlertBridge.java:1192`, `:1210`.

## 판단 요청 답

1. **설계 대비 구현:** 주요 동작은 일치한다. 신형 행끼리의 병합은 표본 기준이다. 옛 행 혼합은 위 🟡처럼 완전히 원자적인 값·표본 선택은 아니다. 첫 예약의 충돌 후 재조회 루프는 **행을 삭제하지 않는 현재 운영 경로·READ COMMITTED 전제에서 타당하다**. 근거: `command/ApmZbxCommandStore.java:801`, `command/ApmZbxItemPushClock.java:129`, `:139`, `:144`.

2. **`STOPPED` 뒤 두 번째 renew:** 추가 비용은 실패 분기에서의 짧은 DB 트랜잭션 한 번이다. claim 상실과 만료를 구분하려는 의도는 이해되지만, **interrupt라는 세 번째 원인을 놓친 것이 문제**다. 중단 사유를 분리하면 재호출도 없앨 수 있다. 근거: `command/ApmZbxCommandStore.java:1056`, 위 🔴1.

3. **복원된 식별의 아이템 키:** 정상 바인딩에서는 같은 키가 된다. 복원은 DB의 kind·scope를 사용하고, 서비스/SLO/collector UID 규칙도 push 경로와 일치한다. 복원 실패는 DEAD로 차단한다. 다만 새 실효 cutoff 테스트는 완전 식별 경로만 검증한다. 근거: `command/ApmZbxResolveConfirmExecutor.java:68`, `:89`, `:153`; `command/ApmZbxCommandStore.java:1843`; `rule/ApmAlertBindingScopes.java:39`; `src/test/java/com/dmove/moveseye/premium/apm/alert/command/ApmZbxCommandExecutionIT.java:214`.

4. **FakeZabbix의 충분성:** **중복 tuple 버림·역전 도착 방지라는 전송 속성 검증에는 충분하다.** 트리거 상태를 판정하지 않으므로 “실제 트리거가 OK로 유지됨”까지 입증하지는 않는다. 실측은 그 인과관계를 뒷받침하지만 할당기를 통과한 실제 Zabbix 재실측은 남아 있다. 근거: `src/test/java/com/dmove/moveseye/premium/apm/alert/support/FakeZabbixAlertBackend.java:784`, `:799`; `src/test/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedgerIT.java:198`; `C:/solutions/_workspace/_archive/features/apm/alerts/zbx_clock_probe_20261021.log:7`; `C:/solutions/_workspace/_archive/features/apm/alerts/zbx_ns_probe_20261021.log:6`.