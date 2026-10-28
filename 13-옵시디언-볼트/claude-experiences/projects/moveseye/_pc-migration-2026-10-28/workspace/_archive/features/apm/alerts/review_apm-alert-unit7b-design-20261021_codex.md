## 판정

**재설계 필요** — 시각과 표본 신선도를 분리하는 방향은 맞지만, 대기 명령 병합·기존 행 전환·잠금 대기와 실패 처리에 거짓 Problem이 남는 경로가 있다.

기준은 `apm-alert-history` / `bb14c07`이다. 아래 코드 경로는 `C:\worktrees\apm-c05-followup\src\main\java\com\dmove\moveseye\premium\apm\alert\` 기준이다. 파일 수정·테스트 실행은 하지 않았다.

## 실측 해석 확인

- **a 계열: 일치한다.** 새 0 뒤 옛 양수를 보내도 item `lastvalue`는 0이지만, 트리거는 PROBLEM으로 바뀌었다. 따라서 item 마지막 값의 clock 정렬만으로 재발화를 방지할 수 없다. 근거: `C:\solutions\_workspace\_archive\features\apm\alerts\zbx_clock_probe_20261021.log:6`, `:7`, `:8`.
- **b 계열: 저장 결과는 일치한다.** 개별 호출과 일괄 호출 모두 해당 `(clock, ns)`의 첫 값만 이력에 남았다. 다만 **“후속 항목도 성공 응답이었다”는 원시 출력으로 확인되지 않는다.** ACK는 baseline만 출력하며, 나머지 push 결과는 기록하거나 항목별 오류를 검사하지 않는다. 근거: 같은 `.log:3`, `:9`, `:11`, `:13`; 같은 `.py:47`, `:69`, `:85`, `:93`.
- **c 계열: 해당 조건에서 일치한다.** 기존 트리거를 켠 뒤 85초까지 OK였고, 다음 양수에서 PROBLEM이 됐다. 이를 **트리거 생성·아이템 재활성화까지 일반화할 근거는 없다.** 근거: 같은 `.log:15`, `:19`, `:20`; 같은 `.py:104`, `:108`.

## 🔴 필수

1. **대기 값 병합도 `sampleSec` 기준으로 바꿔야 한다.**

   §18.2는 실행 직전 신선도 검사만 규정한다. 현재 저장소는 `excluded.cutoff >= c.cutoff`로 값을 선택한다.

   가능한 반례는 다음과 같다. **코드 흐름에 근거한 추론이며, 실행 재현은 하지 않았다.**

   - 감시기의 이전 공개 표본은 양수·`sample=100`.
   - 다음 tick이 settle 0·`sample=101`을 적재했지만 아직 공개 스냅샷을 교체하지 않았다.
   - 같은 초의 5분 평가가 이전 양수를 읽어 `cutoff=101, sample=100`으로 적재한다.
   - 동률 `cutoff` 병합으로 대기 중인 0이 사라진다. watermark가 아직 100이면 옛 양수는 신선도 검사도 통과한다.

   **실행기가 검사하기 전에 최신 표본이 유실되는 문제다.** 값·표본 시각·원하는 clock을 한 묶음으로 선택하고, `pendingPush` 재적재에서도 이를 보존하도록 명시해야 한다.

   근거: `command/ApmZbxCommandStore.java:798`, `:820`, `:1301`; `command/ApmZbxProvisionExecutor.java:306`; `evaluate/ApmStuckRequestMonitor.java:265`, `:289`; `evaluate/ApmAlertEvaluationService.java:477`, `:556`; 설계 `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md:1033`, `:1038`.

2. **기존 명령·기존 Zabbix 이력의 전환 규칙이 필요하다.**

   - **옛 STUCK 행의 `sampleSec=cutoff` 폴백은 안전하지 않다.** 기존 `cutoff`는 실제 표본 시각이 아니므로, 이미 적용한 settle보다 오래된 양수가 동률 또는 더 새 표본으로 취급될 수 있다. 표본 시각을 복원할 수 없는 STUCK 값은 폐기 후 재측정하는 등 별도 전환이 필요하다.
   - **빈 watermark의 첫 예약도 기존 이력보다 새롭다는 보장이 없다.** 기존 아이템에 같은 `(clock, 0)`이 있으면 첫 push부터 중복 버림이 가능하다. 최초 기준값 확보와 구버전 워커 종료 순서를 설계해야 한다. Zabbix 조회가 필요하면 반드시 트랜잭션 밖에서 수행해야 한다.

   근거: 설계 파일 `:1029`, `:1032`, `:1038`; `evaluate/ApmAlertEvaluationService.java:425`, `:477`; `bridge/ZabbixAlertBridge.java:1192`, `:1209`; `engine-api/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/model/PushValue.java:54`.

3. **아이템 잠금 대기를 리스와 실행 유효성 검사에 포함해야 한다.**

   현재 실행기는 push 호출 **전에** `ctx.renew()`를 수행한다. 새 striped 잠금 대기가 그 뒤에 추가되면, 대기 중 generation 변경·취소·리스 만료가 발생해도 옛 실행이 예약과 push를 진행할 수 있다. 기존 리스 검증식에는 이 대기 시간이 없다.

   잠금 대기를 제한하고, **획득 후 예약 전에** claim 유효성을 다시 확인해야 한다. 값 나이도 재확인해야 한다. 트랜잭션을 연 채 JVM 잠금을 기다리거나 RPC를 수행하는 방식은 금지해야 한다.

   근거: 설계 파일 `:1031`; `command/ApmZbxPushCurrentExecutor.java:130`, `:154`, `:160`; `command/ApmZbxResolvePushExecutor.java:122`; `command/ApmZbxCommandStore.java:1000`, `:1050`; `command/ApmZbxCommandProperties.java:71`, `:90`.

4. **실패 시 “더 큰 시각이면 도착 순서도 보장된다”는 단정을 수정해야 한다.**

   확정 실패에서 예약 번호가 비는 것은 괜찮다. 하지만 timeout·응답 유실은 원격 처리 여부를 확정하지 못한다. **실패한 옛 양수가 원격에서 늦게 처리되면**, 이후 0보다 뒤에 도착할 가능성을 JVM 잠금과 DB 예약만으로 배제할 수 없다. 이는 **분산 실패 시나리오에 대한 추론이며 이번 실측 범위 밖**이다.

   미확정 전송의 차단·재수렴 절차를 정하거나, 이 경우는 엄격한 도착 순서 보장 밖이라는 잔여 위험을 명시해야 한다.

   근거: 설계 파일 `:1027`, `:1036`; `command/ApmZbxPushCurrentExecutor.java:159`; `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:329`, `:338`.

## 🟡 권장

- **`last_sample_sec`의 의미를 “마지막 예약 표본”으로 명확히 한다.** 현재 설계에서는 전송 실패에도 전진하므로 “더 새 표본이 이미 반영됐다”는 설명은 부정확하다. `STALE_SAMPLE` 완료를 실제 배달 성공으로 취급해 캐시 준비·오류 배지를 해제하지 않도록 구분하는 편이 좋다. 근거: 설계 파일 `:1033`, `:1036`; `command/ApmZbxPushCurrentExecutor.java:165`, `:196`.
- **초 단위 표본 비교의 전제를 기록한다.** 정상 `fixedDelay=1000` tick에서는 사용할 수 있지만, `tickMs`를 초로 축약하면 원래 정밀도가 사라진다. 벽시계 역행까지 지원하려면 별도 version이 필요하다. 값과 시각은 같은 `Snapshot`에서 한 번에 반환해야 한다. 근거: `evaluate/ApmStuckRequestMonitor.java:128`, `:146`, `:379`; 설계 파일 `:1038`.
- **다중 노드 이관은 단일 프로세스 운영 범위에서 수용 가능하다.** 두 노드에서는 서로 다른 tuple이 역순 도착해 a3가 재현될 수 있으므로, DB 행 잠금만으로 HA 안전성을 주장하면 안 된다. 근거: 설계 파일 `:1039`.
- 재실측에는 항목별 ACK, **같은 초·서로 다른 ns**, 기존 이력이 있는 첫 예약, 대기 0과 옛 양수의 병합, 잠금 대기 중 claim 상실을 추가하는 것이 좋다. 근거: 설계 파일 `:1041`, `:1043`; 실측 스크립트 `.py:48`, `:69`.

## 🟢 확인된 것

- **전송 시각과 표본 시각을 분리하는 원칙은 타당하다.** 아이템별 엄격한 tuple 증가와 표본 신선도 검사가 모두 필요하다. 근거: 설계 파일 `:1027`.
- 현재 실제 push 입구는 설계에 적힌 이름과 달리 **`pushResolveValue`·`pushCurrentValue` 두 곳**이다. 평가·장부의 값과 끄기·켜기·복귀·대조·PROVISION neutralize가 이 두 입구로 모인다. 두 곳을 모두 할당기 경유로 바꾸면 확인한 push 경로는 포괄한다. 근거: `bridge/ZabbixAlertBridge.java:1189`, `:1206`; `bridge/ApmZbxCleanupService.java:215`, `:252`, `:290`, `:348`, `:471`, `:494`; `command/ApmZbxProvisionExecutor.java:301`.
- **예약만 짧은 트랜잭션으로 커밋하고 RPC를 밖에서 수행하는 구조는 Zabbix 0 규칙과 양립한다.** 기존 워커·브리지의 트랜잭션 거부 가드를 새 할당기에도 유지하면 된다. 근거: 설계 파일 `:1035`; `command/ApmZbxCommandWorker.java:426`; `bridge/ZabbixAlertBridge.java:1439`.
- `PushValue`와 전송 구현은 이미 `ns`를 표현·전송한다. 다만 기존 `.at(long)`은 항상 0을 넣으므로 할당된 ns가 보존되는 생성 경로를 사용해야 한다. 근거: `engine-api/.../history/model/PushValue.java:24`, `:54`; `engine-zabbix/.../history/ZabbixHistoryPushImpl.java:72`.

## §18.3 판단

1. **조합 자체는 맞지만 현재 설계만으로 완결되지 않는다.** 필수 1·2를 반영해야 정상 전송에서 a·b를 닫는다. 다중 노드와 미확정 전송은 별도 보장 범위다. 또한 현재 수식은 wall clock의 “지금”이 아니라 **원하는 clock과 기존 watermark 중 큰 값**을 사용한다. 근거: 설계 파일 `:1034`.

2. **출처는 다음처럼 명시하면 된다.**

   | 종류 | 표본 기준 |
   |---|---|
   | STUCK 평가·장부 fire/settle | 동일 tick의 `tickMs`. 값과 함께 전달 |
   | ERROR_RATE·P95_LATENCY·ACTIVE_REQUESTS_SPIKE·COLLECTOR_FAILURE | 계산 창 끝 `now` |
   | SLO_BURN | 네 창이 공유하는 `windowEnd` |
   | STALE | 경과 시간을 계산한 평가 기준 시각. `lastSeenAt` 자체가 아님 |
   | ARCHIVE_HOLD | 보류 건수를 관측한 시각. 롤업이 아니므로 별도 명시 |
   | RPUSH·NEUTRALIZE | 측정 표본 아님. sample watermark 갱신 안 함 |

   **측정 결과인 SLO_BURN의 -1은 표본이다.** 숫자가 -1이라는 이유로 제외하면 안 된다. 근거: `evaluate/ApmAlertEvaluator.java:137`, `:178`; `evaluate/ApmSloBurnEvaluator.java:117`, `:124`; `core/batch/archive/ApmArchiveHoldProbe.java:42`; `evaluate/ApmStuckRequestMonitor.java:128`.

3. **바인딩 lane을 유지하고 아이템 전송 직렬화를 추가하는 안을 지지한다.** push만 `i:` lane으로 옮기면 기존 바인딩 lifecycle fence를 그대로 적용할 수 없다. 단일 노드에서는 현재 접근이 작으며, 필수 3의 대기·리스 처리가 전제다. 근거: `command/ApmZbxCommandKeys.java:15`, `:17`; `command/ApmZbxCommandStore.java:406`, `:410`.

4. **예약 시각의 빈 번호는 허용 가능하다.** 다만 예약 표본 watermark까지 전진하면, 새 값의 전송이 실패한 뒤 이전 표본도 차단되어 옛 양수 또는 -1이 다음 유효 표본까지 남을 수 있다. 이를 보수적 정책으로 수용할 수는 있지만, **“마지막 적용 표본”과 같은 의미로 설명해서는 안 된다.** 미확정 전송의 역순 도착은 필수 4와 별개로 처리해야 한다. 근거: 설계 파일 `:1033`, `:1036`.