## 판정

**조건부 진행** — v2의 핵심 방향은 타당하다. 다만 전송 clock 변경에 따른 `RCONF.cutoff` 정합성과, 재적재 뒤 `max-age`의 기준시각을 먼저 보완해야 한다.

기준은 HEAD `bb14c07`이다. 파일 수정·테스트 실행은 하지 않았다. 아래 설계 파일은 `C:/solutions/_workspace/features/apm/alerts/`, 실측 파일은 그 `_archive/features/apm/alerts/`, 코드 상대경로는 워크트리의 `src/main/java/com/dmove/moveseye/premium/apm/alert/` 기준이다.

| 1차 지적 | 2차 판단 |
|---|---|
| 🔴1 표본 기준 병합·재적재 보존 | **대체로 해소.** `sampleMs` 기준 병합과 값·tick의 일괄 반환을 반영했다. 다만 재적재 시 clock 폐기와 값 나이 검사의 연결이 빠졌다. 설계 `apm-alert-unit5-6-design-20261011.md:1062`, `:1064`, `:1065`. |
| 🔴2 기존 명령·이력 전환 | **전환 규칙은 해소.** 옛 STUCK 폐기·구 워커 중지·첫 예약 기준을 명시했다. 첫 예약 `now + 1`이 만드는 별도 문제는 아래 필수 1이다. 같은 설계 `:1078`, `:1079`, `:1080`. |
| 🔴3 잠금 대기·리스 | **설계상 해소.** 제한 시간, 획득 후 renew·나이 재검사, 리스 검증식 보강을 반영했다. 같은 설계 `:1083`, `:1085`. |
| 🔴4 결과 불명 전송 | **보장 범위를 제한하는 방식으로 해소.** timeout·응답 유실의 역순 처리를 잔여 위험으로 명시했다. “최대 한 주기” 문구는 권장 사항으로 정정이 필요하다. 같은 설계 `:1087`, `:1090`. |
| 🟡 예약 표본 의미·ms 정밀도·HA 한계·재실측 | **설계에 반영됨.** 구현·실측 완료를 뜻하지는 않는다. 같은 설계 `:1062`, `:1093`, `:1094`, `:1095`. |

## 실측 해석 확인

- **a: 원시 출력과 일치한다.** 새 0 뒤 옛 양수를 보내자 item 마지막 값은 0인데 트리거는 PROBLEM이 됐다. 따라서 마지막 값의 clock 정렬만으로 거짓 Problem을 막을 수 없다. 근거: `zbx_clock_probe_20261021.log:6`, `:7`, `:8`.
- **b: 저장 결과는 일치하고, ACK 해석 정정도 맞다.** 동일 tuple에서는 개별·일괄 호출 모두 첫 값만 남았다. 후속 값의 항목별 성공 응답은 기록되지 않았다. 근거: 같은 `.log:9`, `:11`, `:13`; `zbx_clock_probe_20261021.py:48`, `:69`, `:86`, `:93`; 설계 `apm-alert-unit5-6-design-20261011.md:1058`.
- **c: 기존 트리거의 비활성화→재활성화 조건에서만 확인됐다.** 85초까지 OK였고 다음 양수에서 PROBLEM이 됐다. 생성·아이템 재활성화로 일반화하지 않는 v2가 타당하다. 근거: 같은 `.log:15`, `:19`, `:20`; 설계 `:1059`.
- **서로 다른 ns와 미래 clock은 아직 미검증이다.** probe는 의도적으로 과거 clock과 `ns=0`만 사용했다. 근거: 같은 `.py:63`, `:74`, `:86`.

## 🔴 필수

1. **할당된 전송 clock과 `RESOLVE_CONFIRM.cutoff`의 정합성을 설계해야 한다.**

   v2는 첫 전송을 `max(원하는 clock, 지금 초) + 1`로 잡지만, 해소·삭제 명령은 여전히 요청 당시의 벽시계 초를 cutoff로 사용한다. 해소 확인은 `event.clock > cutoff`인 Problem을 제외하고, 조회 결과가 비면 완료한다.

   **코드와 실측 모델에 근거한 반례이며 실행 재현은 하지 않았다.**

   - 벽시계 `T`초에 첫 양수를 전송하여 Problem의 clock이 `T+1`이 된다.
   - 같은 `T`초에 규칙을 삭제하면 `RCONF.cutoff=T`로 고정된다.
   - RCONF는 해당 Problem을 제외하고 완료하여 트리거 삭제를 진행한다.
   - 트리거 삭제가 열린 Problem을 닫지 않는다는 기존 실측 전제와 결합하면, 닫지 못한 Problem이 남는다.

   삭제 체인은 RPUSH 없이 RCONF부터 시작하므로 **정상 RPC에서도 가능한 경로**다. 끄기·고아 경로도 soft RPUSH 실패·공유 아이템 생략 시 같은 영향을 받는다. 첫 예약 외에도, 진행 중 push의 예약 시각이 lifecycle 적재 시각보다 늦어지는 경우를 함께 고려해야 한다.

   **필요한 보완:** lifecycle 이전 전송을 해소 대상에 포함하는 경계를 정의하되, 재활성화 뒤의 새 Problem을 보호하는 기존 의미를 유지해야 한다. 첫 예약의 미래 clock 수용 여부와 “첫 양수 직후 같은 초 삭제”도 검증 항목에 추가해야 한다.

   근거: 설계 `apm-alert-unit5-6-design-20261011.md:1080`; `bridge/ApmZbxCleanupService.java:97`, `:120`, `:126`, `:208`; `command/ApmZbxResolveConfirmExecutor.java:89`, `:90`; `bridge/ZabbixAlertBridge.java:861`, `:873`; `command/ApmZbxResolveConfirmExecutor.java:36`. 전송 clock이 이벤트 시각에 반영된 실측: `zbx_clock_probe_20261021.log:5`. **미래 clock 자체의 처리는 이번 실측 밖이다.**

2. **절대 값 나이 검사는 원래 `sampleMs`를 기준으로 한다고 명시해야 한다.**

   v2는 `pendingPush` 재적재에서 옛 clock을 보존할 필요가 없다고 한다. 그런데 현행 실행기의 `max-age`는 `현재 초 − c.cutoff()`다. 전송 시각을 새로 만드는 것과 측정값의 나이를 새로 만드는 것은 별개다.

   **현행 나이 계산을 유지하면 가능한 추론이다:** 오래 대기한 양수를 PROVISION 보류 경로가 현재 clock으로 재적재하면, 값의 나이가 다시 0부터 계산된다. 더 새로운 예약 표본이 없으면 watermark 검사도 통과한다. 따라서 상대적인 신선도 검사만으로 600초 폐기 규칙을 대체할 수 없다.

   **필요한 보완:** 재적재·재시도에서도 원래 `sampleMs`를 보존하고, 잠금 획득 뒤 `max-age`를 그 시각으로 검사해야 한다. 할당된 Zabbix tuple은 나이 판정에 사용하지 않아야 한다.

   근거: 설계 `apm-alert-unit5-6-design-20261011.md:1064`, `:1083`; `command/ApmZbxPushCurrentExecutor.java:110`, `:130`; `command/ApmZbxProvisionExecutor.java:299`, `:306`; `command/ApmZbxCommandStore.java:1301`, `:1310`.

## 🟡 권장

- **“최대 한 평가 주기 내 수렴”을 조건부 기대치로 바꾼다.** 다음 평가가 성공하고, 유효 표본이 있으며, 후속 전송이 성공한 뒤에도 옛 요청이 다시 도착하지 않아야 한다. `force_repush`는 다음 전송을 요구할 뿐 시간 상한을 보장하지 않는다. 스케줄 주기도 설정값이다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1090`; `evaluate/ApmAlertEvaluationService.java:483`; `command/ApmZbxPushCurrentExecutor.java:145`, `:175`; `evaluate/ApmAlertEvaluationJob.java:64`.
- **`force_repush`의 해제 조건을 명시한다.** 적재·예약·`STALE_SAMPLE` 완료가 아니라 유효한 후속 push 성공을 기준으로 하고, 실패·재시작에서는 보존하는 편이 일관된다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1090`, `:1093`, `:1097`.
- **잠금 실패 RETRY는 기존 백오프 정책과 함께 설명한다.** 5초 잠금 대기는 제한됐지만, 이후 재시도 지연까지 5초로 제한되는 것은 아니다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1083`; `command/ApmZbxCommandWorker.java:454`.

이 항목들은 진행을 막지 않는다.

## 🟢 확인된 것

- **정상 전송·단일 노드에서는 두 장치의 조합이 타당하다.** 표본 기준 병합·영속 watermark가 늦은 옛 양수를 거르고, 동일 아이템의 예약→push 직렬화와 엄격한 tuple 증가가 중복 tuple을 피한다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1031`, `:1034`, `:1063`.
- **실제 push 입구의 누락은 확인되지 않았다.** 현 코드 이름은 `pushUnmeasurable`·`pushCurrent`가 아니라 **`pushResolveValue`·`pushCurrentValue`**다. 평가·장부와 끄기·켜기·복귀·대조·PROVISION neutralize는 이 두 곳으로 모인다. 두 곳 모두 같은 할당기를 거쳐야 한다. 근거: `bridge/ZabbixAlertBridge.java:1189`, `:1206`; `bridge/ApmZbxCleanupService.java:215`, `:252`, `:290`, `:348`, `:471`, `:494`; `command/ApmZbxProvisionExecutor.java:301`.
- **표본 출처표는 현재 kind를 포괄한다.** STUCK의 값·tick 일괄 반환, SLO의 공통 `windowEnd`, STALE의 평가 기준시각, ARCHIVE_HOLD의 관측시각 구분이 적절하다. 측정 결과인 SLO `-1`도 표본으로 취급해야 한다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1070`; `evaluate/ApmSloBurnEvaluator.java:117`, `:124`; `evaluate/ApmAlertEvaluator.java:178`; `core/batch/archive/ApmArchiveHoldProbe.java:42`.
- **트랜잭션 안 Zabbix 0 규칙과 양립한다.** 트랜잭션 없이 잠금을 기다리고, renew·예약의 짧은 트랜잭션을 닫은 뒤 RPC하는 순서는 적절하다. 다중 노드의 도착 순서는 보장하지 않는다는 제한도 명확하다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1083`, `:1094`; `command/ApmZbxCommandWorker.java:426`; `bridge/ZabbixAlertBridge.java:1439`.
- **ns 전송 기능은 이미 있다.** 다만 `.at(long)`은 ns를 0으로 되돌리므로 할당된 ns를 보존하는 생성 경로가 필요하다. 근거: `engine-api/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/model/PushValue.java:54`; `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryPushImpl.java:72`.

## §18.3 판단

1. **조합에 찬성한다.** 단일 노드·정상 전송에서 a·b를 닫는 방향이다. 단, 전체 lifecycle의 안전성에는 위 필수 1·2가 추가돼야 한다. 결과 불명 전송과 HA까지 닫았다는 주장은 불가하다. 근거: 설계 `apm-alert-unit5-6-design-20261011.md:1089`, `:1094`.

2. **v2 출처표에 찬성한다.** 현재 kind의 누락은 확인되지 않았다. 동일한 `sampleMs`를 병합·재적재·watermark·절대 나이 검사까지 이어야 한다. 근거: 같은 설계 `:1064`, `:1070`; `evaluate/ApmStuckRequestMonitor.java:128`, `:379`.

3. **바인딩 lane 유지 + 아이템별 전송 잠금에 찬성한다.** push만 `i:` lane으로 이동하면 기존 lifecycle fence를 다시 설계해야 한다. 제한 대기와 획득 후 claim 재검증을 포함한 v2가 현재 범위에 적합하다. 근거: `command/ApmZbxCommandKeys.java:15`, `:17`; `command/ApmZbxCommandStore.java:406`, `:410`; 설계 `apm-alert-unit5-6-design-20261011.md:1083`.

4. **예약 번호의 빈칸은 허용 가능하다.** 예약 표본 watermark가 실패에도 전진하는 보수적 정책도 수용 가능하다. 다만 실제 배달 성공과 구분하고, 후속 성공 전까지 오래된 값·`-1`이 남을 수 있음을 유지해야 한다. `force_repush`는 보조 수단이며 수렴 시간의 보장은 아니다. 근거: 같은 설계 `:1088`, `:1090`, `:1093`.