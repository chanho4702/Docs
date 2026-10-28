## 판정

**조건부 진행** — 개별 retry의 잠금 설계는 타당하지만, 사유 매핑·만료 시 화면 접근·확인 완료의 동시성·폴링·대상 식별 정보를 보완해야 한다.

정적 검수만 수행했으며 파일 수정·테스트 실행은 하지 않았다. 미커밋 변경을 포함한 열람 시점 기준이다.

아래 경로 표기는 다음 기준이다.

- `설계` = `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md`
- `계약` = 같은 폴더의 `contract_apm-alert-zabbix-apply.md`
- `BE` = `C:\worktrees\apm-c05-followup\src\main\java\com\dmove\moveseye\premium\apm\alert`
- `FE` = `C:\worktrees\apm-alert-history-fe\src`

## 🔴 필수

1. **`NEUTRALIZE_TIMEOUT` 매핑을 바로잡아야 한다.**  
   설계는 `RPUSH_HOLD_WAIT:`를 DEAD 사유의 접두어로 적었지만, 실제 DEAD는 `NEUTRALIZE_TIMEOUT:`이다. `RPUSH_HOLD_WAIT:`는 상한 도달 전 PENDING 재확인 사유다. 그대로 구현하면 핵심 회복 대상이 `OTHER`로 분류된다. `HOLD_TIMEOUT_PREFIX`는 현재 package-private이므로 분류기를 `command` 패키지에 두거나 공유 상수 계약도 정해야 한다.  
   근거: `설계:779`, `BE/command/ApmZbxResolvePushExecutor.java:43`, `BE/command/ApmZbxResolvePushExecutor.java:154`, `BE/command/ApmZbxResolvePushExecutor.java:157`.

2. **라이선스 면제를 FE 진입부터 DB 집계까지 연결해야 한다.**  
   세 API만 면제해도 기존 라우트의 `FeatureGate`가 EXPIRED·ARCHIVED에서 화면을 막는다. 이를 열어도 기존 `zabbix-status`는 면제 대상이 아니며, Zabbix 탭은 그 조회가 실패하면 명령 카드를 렌더하지 않는다. 회복 패널을 기존 진단 조회의 성공 여부와 분리하고, 만료 중 필요한 집계는 DB 조회로 제공해야 한다. 전체 규칙 편집 화면을 함께 개방해서는 안 된다.  
   근거: `설계:773`, `FE/routes/routes.tsx:978`, `FE/hooks/useLicense.ts:21`, `FE/hooks/useLicense.ts:97`, `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertZabbixTab.tsx:45`, 같은 파일 `:234`, `BE/ApmAlertRuleController.java:86`, 같은 파일 `:262`.

   또한 `LicenseArchitectureTest`의 면제 허용 목록·자체 판정 검증 확장이 §16.7에 빠졌다. 현재 허용 목록은 채널 컨트롤러 세 메서드뿐이다.  
   근거: `C:\worktrees\apm-c05-followup\src\test\java\com\dmove\moveseye\license\LicenseArchitectureTest.java:80`, 같은 파일 `:205`, `:307`.

3. **`acknowledge`는 운영자가 확인한 명령 버전에 한정해야 한다.**  
   현재 설계는 `id + DEAD + UNIDENTIFIED`만 검사한다. 그러나 같은 id의 명령은 재적재 시 generation이 증가하고 `zbxIds`가 합쳐진다. 따라서 **모달을 연 뒤 대상이 늘고 다시 UNIDENTIFIED DEAD가 된 경우**, 이전 대상을 확인한 메모로 새 정리 의무까지 삭제할 수 있다. 이는 코드로 가능한 경쟁 시나리오이며 재현 테스트는 실행하지 않았다.

   요청에 `expectedGeneration` 등 확인 당시 버전을 포함하고, 변경됐으면 삭제하지 말고 재확인을 요구해야 한다. `released`, 변경 전 요약, 감사 정보도 삭제 트랜잭션에서 확보해야 한다. 현재 Store는 `released`를 조회하지만 외부에는 boolean만 반환한다.  
   근거: `설계:772`, `설계:778`, `BE/command/ApmZbxCommandStore.java:748`, 같은 파일 `:760`, `:1664`, `:1672`, `:1678`, `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:106`.

4. **UNIDENTIFIED를 사람이 확인할 수 있는 대상 정보를 보존·표시해야 한다.**  
   DTO는 단일 `triggerId`·`itemId`지만 명령은 여러 `zbxIds`를 가질 수 있다. 특히 규칙이 삭제됐거나 식별 정보가 부족한 행에서 현재 FE는 대상을 “삭제된 규칙”으로만 표시한다. 운영자가 실제 Zabbix 대상을 대조한 뒤 확인 완료를 누르기 어렵다.

   `zbx_id ∪ target.zbxIds`, 남아 있는 rule/scope 식별값, host/itemKey를 조회·상세 모달에 제공해야 한다. 바인딩 조인이 실패해도 명령 자체의 스냅샷으로 fallback해야 한다.  
   근거: `설계:778`, `설계:780`, `BE/command/ApmZbxCommandStore.java:139`, 같은 파일 `:766`, `BE/command/ApmZbxDeleteExecutor.java:84`, `FE/types/apm.ts:970`, `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:119`, 같은 파일 `:327`.

5. **폴링 조건과 비활성 규칙 배지의 충돌을 해결해야 한다.**  
   `bindings.queued`는 전체 대기 명령의 존재 여부가 아니다. 동일 바인딩에 drift가 있으면 PENDING 명령이 있어도 drift 칸에 들어간다. DEAD와 대기가 함께 있어도 missing이 우선한다. 따라서 `queued>0`만 보면 실행 중인 명령을 놓친다. 현재 쓰기 성공 처리도 QUEUED 응답으로 폴링을 시작하지 않고 토스트만 표시한다. 쓰기 응답·retry 응답을 통한 폴링 시작과, 실제 대기 여부를 판단할 독립 조건을 명시해야 한다.  
   근거: `설계:798`, `BE/rule/ApmAlertService.java:1630`, `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:78`, 같은 파일 `:108`, `:147`.

   또한 현재 배지는 `enabled=false`면 queued·commandFailed를 읽기 전에 “사용 안 함”으로 반환한다. 끄기 명령의 대기·실패를 감추므로, 규칙 활성 여부와 외부 반영 상태를 함께 표시하도록 설계해야 한다.  
   근거: `FE/pages/application-monitoring/alert-rules/components/ApmAlertSyncBadge.tsx:28`.

6. **명령 목록의 모든 페이지에 접근할 수 있어야 한다.**  
   API에는 offset이 있지만 현재 FE 카드는 앞 200건만 조회하고 다음 페이지를 제공하지 않는다. 앞쪽 UNIDENTIFIED·손상 명령을 해결하지 못하면 뒤쪽 DEAD hard RPUSH에 접근할 수 없다. 잘렸다는 안내만으로 회복 창구를 대체할 수 없다.  
   근거: `설계:770`, `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:30`, 같은 파일 `:55`, `:279`, `:290`.

7. **§16.7에 다음 필수 시나리오를 추가해야 한다.**

   | 구분 | 추가할 시나리오 |
   |---|---|
   | 잠금·CAS | retry ↔ 6b guard 양쪽 선점 순서, retry ↔ worker claim, 이전 claim의 늦은 결과가 새 실행을 변경하지 못함, retry ↔ DELETE_ITEM 선형화·새 바인딩 예약 |
   | re-key | 재적재가 먼저면 lane 변경으로 no-op, retry가 먼저면 정상 성공 후 재적재 수렴. 경쟁이면 항상 false라는 단언은 금지 |
   | 회복 체인 | hard RPUSH 회복 후 STAT·PROVISION 진행, NEUTRALIZE_TIMEOUT 카운터 초기화 후 **실제 -1 성공 전 STAT 금지**, PUSH_CURRENT 나이 600초 경계·최신 값 병합 |
   | 확인 완료 | acknowledge 중복·retry와 경쟁·generation 변경, 다중 대상, 선행이 둘인 후속, 롤백 시 성공 감사가 남지 않음 |
   | 라이선스·API | EXPIRED·ARCHIVED의 실제 화면 진입, NONE·INVALID·APM 미보유 거부, 재시도 후 PROVISION·STAT(on)·PUSH는 계속 DEFERRED, body code 실패 처리 |
   | FE | drift+PENDING·DEAD+PENDING·꺼진 규칙, QUEUED 응답만으로 폴링 시작, 새 작업 시 상한 재설정, 201번째 행 접근, 진단 API 실패에도 회복 패널 유지 |

   기존 목록은 적재와의 두 스레드 경쟁·후속 STAT 위주여서 위 경계를 충분히 다루지 않는다.  
   근거: `설계:811`, `설계:812`, `설계:814`.

## 🟡 권장

- **`released`는 “즉시 실행 가능”과 구분해야 한다.** 선행 하나를 삭제해도 다른 선행이 남으면 claim되지 않는다. 또한 `waiting.count`에는 직접 후속 PUSH가 포함될 수 있는데 FE는 여기에 바인딩 전체 `fencedPushes`를 더한다. 중복 집계·무관한 PUSH 포함을 피하고, “제거된 의존”과 “남은 차단”을 구분하라.  
  근거: `BE/command/ApmZbxCommandStore.java:964`, 같은 파일 `:1672`, `설계:778`, `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:189`.

- **알려진 회복 사유인 `manual_close` 거부를 별도 코드로 제공하는 편이 좋다.** 현재 일반 RCONF는 이 경우 DEAD가 되지만 설계 분류상 OTHER다. “Zabbix에서 수동 닫기를 허용하거나 직접 문제를 해소한 뒤 재시도”라는 안내가 가능하다. **DELETE_*·RCONF의 시도 횟수 기반 자동 DEAD가 없다는 것과, 명시적 영구 실패 DEAD가 없다는 것은 다르다.**  
  근거: `BE/command/ApmZbxResolveConfirmExecutor.java:55`, 같은 파일 `:67`, `:102`, `BE/command/ApmZbxCommandWorker.java:51`.

- **resync 보조 진입의 위치를 명시하라.** 이관 요구에는 규칙별 resync 진입이 있지만 현재 버튼은 drift 규칙에만 나타난다. DEAD 명령에서 해당 규칙으로 이동하는 동선과, hard RPUSH는 resync로 회복되지 않는다는 안내가 필요하다.  
  근거: `설계:455`, `설계:471`, `FE/pages/application-monitoring/shared/apmAlertDisplay.ts:122`, `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:253`.

- **API 결과·감사 계약을 더 구체화하라.** acknowledge 응답 표에는 status가 없지만 공통 설명은 현재 상태 반환을 요구한다. retry에는 메모 입력이 없는데 감사 규약에는 메모가 있다. no-op 사유도 `NOT_DEAD`·`LANE_CHANGED`·`NOT_FOUND`처럼 구분하면 DEAD가 남아 있는데 “이미 처리됨”으로 안내하는 일을 피할 수 있다. 감사에는 인증된 사용자 id와 변경 당시 요약을 사용하라.  
  근거: `설계:771`, `설계:772`, `설계:774`, `설계:775`, `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:89`.

- **기존 FE 반영분과의 차이를 계약에 명시하라.** queued 타입·폴링·SLO syncing 일부는 이미 구현 중이다. 현재 queued 톤은 warning이며 새 행 타입에는 generation·nextAttemptAt이 없다. 설계대로 맞출 항목을 명시하면 중복 구현을 줄일 수 있다.  
  근거: `설계:778`, `설계:797`, `FE/pages/application-monitoring/shared/apmAlertDisplay.ts:67`, `FE/types/apm.ts:985`.

## 🟢 확인된 것

- **가족 잠금 없이 resource → 자기 행만 잡는 retry는 안전한 구조다.** enqueue는 가족 → resource → 기존 행 순서다. retry가 이후 가족·다른 resource·다른 명령 행을 요구하지 않으면 순환 대기를 추가하지 않는다. claim도 `SKIP LOCKED`이고, 6b guard는 기존 행 잠금 후 판정하므로 retry와 직렬화된다. 단, lane 변경 시 두 번째 resource 잠금을 잡으러 가지 않고 종료해야 한다.  
  근거: `BE/command/ApmZbxCommandStore.java:331`, 같은 파일 `:338`, `:341`, `:343`, `:971`.

- **generation 미증가는 맞다.** DEAD 전환은 claim_token·lease를 비우고, 다음 claim은 새 token을 만든다. 기존 실행의 늦은 결과는 status/token CAS를 통과하지 못한다. 같은 의사를 다시 실행하는 retry와 새 의사의 enqueue를 구분하는 설계도 타당하다.  
  근거: `BE/command/ApmZbxCommandStore.java:114`, 같은 파일 `:979`, `:1419`, `:1496`.

- **`last_error` 유지 자체는 오판을 만들지 않는다.** `commandFailed`는 DEAD 수로 판단한다. 다만 PENDING이면 항상 queued라는 §16.8의 설명은 정확하지 않다. drift가 있으면 drift가 우선한다.  
  근거: `BE/rule/ApmAlertService.java:1625`, 같은 파일 `:1630`.

- **후속은 retry 요청 시점이 아니라 선행 완료·삭제 시점에 풀린다.** hard RPUSH가 소유 확인에 다시 실패하면 DEAD로 돌아가 STAT·PROVISION을 계속 막는다. RESOLVE_PUSH 재시도의 `confirmRechecks` 제거도 필요하다.  
  근거: `BE/command/ApmZbxResolvePushExecutor.java:95`, 같은 파일 `:152`, `BE/command/ApmZbxCommandStore.java:1419`, 같은 파일 `:1583`.

- **오래된 PUSH_CURRENT 폐기 규칙은 존재한다.** 기본 600초를 초과하면 전송하지 않고 완료한다. 정확히는 claim 직후 무조건이 아니라 바인딩·규칙·라이선스 확인 뒤 실행기에서 검사한다. 라이선스가 없으면 먼저 DEFERRED된다.  
  근거: `BE/command/ApmZbxPushCurrentExecutor.java:114`, 같은 파일 `:127`, `:130`.

- **DEAD 회복의 예외도 보존돼 있다.** 강제 PROVISION은 보류 명령 적재 과정에서 DEAD STAT을 묵시적으로 부활시킬 수 있다. 반면 resync는 DEAD hard RPUSH의 대체 회복 수단이 아니다. 일괄 retry를 production에 노출하지 않는 결정은 적절하다.  
  근거: `설계:468`, `설계:548`, `BE/command/ApmZbxProvisionExecutor.java:182`, `BE/command/ApmZbxCommandStore.java:750`.

## 답변(§16.8 판단 요청 1~4)

1. **가족 잠금 생략: 동의한다.** 자기 행의 상태만 변경하고 추가 잠금을 요구하지 않는 조건이다. re-key 경쟁에서 lane이 바뀌면 종료하고, 가족 불변식은 기존 실행기의 item-family 참여·선형화가 유지한다. 근거: `설계:784`, `BE/command/ApmZbxCommandStore.java:1043`, 같은 파일 `:1101`.

2. **`last_error` 유지: 동의한다.** 실패 여부는 DEAD 상태로 판단한다. 다만 “PENDING이면 queued”는 drift 우선순위를 반영해 정정하고, 폴링은 queued 버킷만으로 판단하지 않아야 한다. 근거: `BE/rule/ApmAlertService.java:1630`.

3. **조회까지 라이선스 면제: 동의한다.** 만료 중 회복에 필요한 DB 장부 조회·집계·확인 완료를 열어야 한다. retry로 되살린 PROVISION·STAT(on)·PUSH_CURRENT의 실행기 라이선스 검사는 유지해야 한다. 채널 선례는 retry를 면제하지 않으므로, 동일 선례라기보다 실행기 검사를 전제로 한 별도 예외로 문서화해야 한다. 근거: `BE/ApmAlertChannelController.java:42`, `BE/command/ApmZbxCommandWorker.java:53`.

4. **일괄 retry 미노출: 동의한다.** 대상별 원인 확인·감사·개별 회복이 적절하다. 대신 모든 DEAD에 접근할 수 있는 페이지 이동과 UNIDENTIFIED 대상 상세가 갖춰져야 한다. 근거: `설계:789`, `설계:770`.