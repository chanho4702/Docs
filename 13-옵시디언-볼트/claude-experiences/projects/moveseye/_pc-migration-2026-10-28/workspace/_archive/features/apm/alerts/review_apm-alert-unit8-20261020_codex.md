## 판정

**조건부 승인** — 핵심 구현과 BE↔FE 계약은 정합하지만, 설계 검수 🔴7의 필수 회귀 검증은 일부 미완료다. 기존 테스트로의 대체가 모두 동등하지는 않다.

파일 수정·테스트 실행 없이 제공된 diff와 워크트리 코드를 정적으로 검수했다. 요청서의 테스트 통과·뮤테이션 결과는 재확인하지 않았다.

경로 약칭:

- `BE` = `C:\worktrees\apm-c05-followup\src\main\java\com\dmove\moveseye\premium\apm\alert`
- `BET` = `C:\worktrees\apm-c05-followup\src\test\java\com\dmove\moveseye\premium\apm\alert`
- `FE` = `C:\worktrees\apm-alert-history-fe\src`
- `설계` = `C:\solutions\_workspace\features\apm\alerts\apm-alert-unit5-6-design-20261011.md`

## 설계 검수 🔴1~7 반영 확인

| 항목 | 판단 | 코드 근거 |
|---|---|---|
| **1. DEAD 사유 매핑** | **반영**. `HOLD_TIMEOUT_PREFIX`를 직접 참조하며 `RPUSH_HOLD_WAIT`와 구분한다. `MANUAL_CLOSE`·`INVALID_COMMAND`도 분리됐다. | `BE/command/ApmZbxDeadReason.java:26`, `BE/command/ApmZbxResolvePushExecutor.java:43`, `BET/command/ApmZbxCommandAdminIT.java:136` |
| **2. 만료 중 회복 창구** | **반영**. 세 EP의 면제·자체 보유 검사·edit 검사가 연결됐다. FE는 fallback에서 업셀과 회복 카드만 표시하며, 진단 조회 실패·로딩 중에도 카드를 유지한다. | `BE/ApmAlertCommandController.java:59`, 같은 파일 `:74`, `:87`, `:101`; `FE/routes/routes.tsx:980`; `FE/pages/application-monitoring/alert-rules/components/ApmAlertRecoveryFallback.tsx:20`; `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertZabbixTab.tsx:40` |
| **3. 확인한 generation만 acknowledge** | **반영**. 행 잠금 뒤 generation을 검사하고, 삭제 전 후속 정보를 확보한다. 감사는 `afterCommit`에서 기록한다. FE도 모달에 보인 generation을 전송한다. | `BE/command/ApmZbxCommandStore.java:1704`, 같은 파일 `:1720`, `:1723`, `:1732`; `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:161` |
| **4. 대상 식별 정보** | **반영**. `zbx_id ∪ target.zbxIds`, rule/scope, host/key를 보존하고 조인 실패 시 스냅샷으로 대체한다. 상세·확인 완료 모달에 표시한다. | `BE/command/ApmZbxCommandAdmin.java:203`; `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:319`, 같은 파일 `:455` |
| **5. 폴링·꺼진 규칙 배지** | **구현 반영, 시간 흐름 검증 일부 부족**. `inFlight`는 버킷과 독립적이며 QUEUED 응답은 폴링을 시작하고 상한을 재설정한다. 꺼진 규칙도 실패·대기를 표시한다. | `BE/rule/ApmAlertService.java:1621`; `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:74`, 같은 파일 `:95`; `FE/pages/application-monitoring/shared/apmAlertDisplay.ts:110` |
| **6. 전 페이지 접근** | **기본 구현 반영**. limit 50·offset과 별도 `Pagination`이 연결됐다. 목록 축소 시 페이지 보정은 🟡 참조. | `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:84`, 같은 파일 `:408`; `FE/__tests__/ApmAlertZbxCommandsCard.test.tsx:202` |
| **7. 필수 테스트 보강** | **부분 반영**. 상태 전환·대상·generation·잠금 순서·만료 STAT 검증은 추가됐으나, 실제 re-key 경합·회복 후 재실패·ack 경쟁·폴링 시간 흐름은 완결되지 않았다. | `BET/command/ApmZbxCommandAdminIT.java:156`, 같은 파일 `:200`, `:222`, `:269`, `:298`; `설계:836` |

## 🔴 필수

1. **re-key 경합 테스트가 `LANE_CHANGED` 방어를 실제로 검증하도록 보강해야 한다.**

   `retryVersusReenqueue`는 enqueue를 완료한 다음 retry를 호출하는 순차 테스트다. 따라서 retry가 **옛 lane을 읽은 뒤 기다리는 사이 lane이 변경되는 경우**를 만들지 않는다. 이 테스트만으로는 `LANE_CHANGED` 검사 제거를 잡는다고 볼 수 없다.

   retry의 최초 lane 조회와 행 재조회 사이에 실제 re-key를 배치하는 결정적 경합 테스트가 필요하다.  
   근거: `BET/command/ApmZbxCommandAdminIT.java:208`, 같은 파일 `:213`; 실제 방어 코드 `BE/command/ApmZbxCommandStore.java:1648`, 같은 파일 `:1662`.

2. **NEUTRALIZE_TIMEOUT의 ‘재시도 후에도 -1 성공 전 STAT 금지’를 직접 연결해 검증해야 한다.**

   기존 `neutralizeTimeoutIsDeadNotEnable`은 **최초 DEAD까지** 검증한다. 새 `retrySemantics`는 카운터 제거까지, `retryReleasesFollowers`는 정상 전송 후 완료까지 검증한다. 재시도 뒤 캐시 미동기가 계속될 때 STAT이 계속 막히는 경계는 연결되지 않았다.

   이는 설계 §16.9가 명시한 회복 경로의 핵심 조건이다.  
   근거: `BET/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:363`; `BET/command/ApmZbxCommandAdminIT.java:156`, 같은 파일 `:181`; `설계:839`.

3. **🔴7을 완료로 처리하려면 acknowledge 경쟁과 FE 폴링 수명 검증을 보완해야 한다.**

   현재 acknowledge 테스트는 잘못된 generation·정상 삭제·순차 중복 호출을 다룬다. 실제 재적재/재시도와의 경쟁 및 롤백 시 성공 감사 부재를 검증하지 않는다. FE의 3분 상한 테스트도 순수 함수 검사이며, 실제 컴포넌트에서 **상한 도달 → 새 QUEUED 작업 → 폴링 재개·상한 재설정**을 검증하지 않는다.

   근거: `BET/command/ApmZbxCommandAdminIT.java:313`, 같은 파일 `:318`, `:324`; `FE/__tests__/apmAlertDisplay.test.ts:253`; `FE/__tests__/ApmAlertRulesPage.test.tsx:304`; `설계:840`, 같은 파일 `:842`.

## 🟡 권장

아래 항목은 승인을 막지 않는다.

- **목록 축소 시 현재 페이지를 보정해야 한다 — 새 UI 결함.**  
  예를 들어 DEAD 51건의 2페이지에서 마지막 1건을 재시도하면, total은 50으로 줄지만 page는 2에 남는다. offset 50의 빈 목록을 보면서 `total > PAGE_SIZE` 조건 때문에 페이지 이동도 사라진다. 세그먼트 전환으로 복구할 수 있으므로 비차단으로 분류한다.  
  근거: `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:75`, 같은 파일 `:85`, `:408`.

- **목록 조회를 설계대로 읽기 전용 트랜잭션 하나로 묶는 편이 좋다.**  
  현재 페이지·선행·후속·대상·집계는 별도 조회여서, 워커가 처리하는 동안 서로 다른 시점의 결과가 섞일 수 있다. 쓰기 안전성 결함은 확인되지 않았다.  
  근거: `BE/command/ApmZbxCommandAdmin.java:56`, 같은 파일 `:64`, `:83`; `BE/command/ApmZbxCommandStore.java:1774`; `설계:782`.

- **retry 감사에 변경 당시 행 요약을 추가하라.**  
  현재는 사용자와 id만 남긴다. 설계의 command·dedup·resource·이전 오류 요약이 없어 성공 후 행이 삭제되면 원인 추적이 약해진다.  
  근거: `BE/command/ApmZbxCommandAdmin.java:114`; `설계:775`.

- **600초 테스트는 ‘경계 검증’으로 표현하지 말라.**  
  기존 테스트는 30분 전 값을 버리는 검사다. 현재 코드의 `age > maxAgeSeconds`는 확인했지만 600초/601초 경계를 검증한 것은 아니다. 해당 실행 로직은 이번 변경의 핵심 수정 대상이 아니므로 비차단으로 분류한다.  
  근거: `BET/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:630`; `BE/command/ApmZbxPushCurrentExecutor.java:130`.

## 🟢 확인된 것

- **판단 요청 1 — retry 잠금 구조는 타당하다.**  
  resource → 자기 행 순서이며 lane 변경 시 추가 resource를 잡지 않고 종료한다. 가족 잠금을 생략해도 retry 자체가 새 가족 잠금을 요구하지 않아 순환 대기를 추가하지 않는 구조다. enqueue는 가족 → resource → 기존 행 순서를 유지한다. claim은 DEAD를 대상으로 하지 않는다.  
  근거: `BE/command/ApmZbxCommandStore.java:356`, 같은 파일 `:1648`, `:1662`, `:999`. 교착 부재 전체를 실행으로 입증한 판정은 아니다.

- **acknowledge의 CASCADE는 후속 명령 자체를 삭제하지 않는다.**  
  의존 행이 제거되고, 다른 선행은 유지된다. 응답도 `released`와 `stillBlocked`를 구분한다.  
  근거: `BE/command/ApmZbxCommandStore.java:1723`; `C:\worktrees\apm-c05-followup\src\main\resources\db\migration\V79__apm_zbx_command.sql:94`.

- **판단 요청 2 — retry 면제가 켜기·값 전송의 라이선스 검사를 우회하지 않는다.**  
  PROVISION·켜기 STAT·PUSH_CURRENT는 실행기에서 DEFERRED된다. FE fallback도 규칙 편집·진단 탭을 열지 않는다.  
  근거: `BE/command/ApmZbxProvisionExecutor.java:115`; `BE/command/ApmZbxTriggerStatusExecutor.java:88`; `BE/command/ApmZbxPushCurrentExecutor.java:127`; `FE/pages/application-monitoring/alert-rules/components/ApmAlertRecoveryFallback.tsx:23`.

- **판단 요청 3 — 대상·후속·BLOCKED 정의는 계약과 일치한다.**  
  waiting은 직접 후속 중 PUSH_CURRENT 제외, fencedPushes는 직접 후속 PUSH_CURRENT다. BLOCKED 목록과 집계는 모두 도래한 PENDING 중 선행 의존이 있는 행을 센다.  
  근거: `BE/command/ApmZbxCommandAdmin.java:71`; `BE/command/ApmZbxCommandStore.java:1768`, 같은 파일 `:1980`.

- **판단 요청 4 — 배지 우선순위와 주요 폴링 조건은 맞다.**  
  `missing > drift > queued > pending > synced`, 꺼진 규칙의 commandFailed 우선 표시, inFlight·QUEUED 시작 및 retry 후 카드 폴링이 구현됐다. 규칙 목록에는 3분 상한과 10초 유예가 있고, 명령 카드는 pending/processing이 있는 동안 계속 5초 폴링한다.  
  근거: `FE/pages/application-monitoring/shared/apmAlertDisplay.ts:55`, 같은 파일 `:110`; `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:84`; `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:89`.

- **판단 요청 5 — 대체 검증은 일부만 충분하다.**  
  retry↔claim 직접 IT 생략은 DEAD 제외 조건·행 잠금·기존 token CAS 검증으로 수용 가능하다. 반면 re-key 경합과 NEUTRALIZE_TIMEOUT 재시도 체인은 위 🔴 보완이 필요하다.  
  근거: `BE/command/ApmZbxCommandStore.java:999`, 같은 파일 `:1459`; `BET/command/ApmZbxCommandStoreIT.java:598`.

- **BE↔FE 계약의 필드명·타입·no-op·오류 코드가 정합한다.**  
  generation은 숫자로 왕복하고 Zabbix id는 문자열 배열이다. retry/ack 결과와 다섯 no-op 코드가 대응하며, 조회는 공통 훅에서 envelope을 해제하고 mutation은 `unwrapEnvelope`로 body 오류를 처리한다. 신규 오류 코드 두 개도 FE에 매핑됐다.  
  근거: `BE/command/ApmZbxCommandRowDto.java:14`; `BE/command/ApmZbxCommandStore.java:1632`, 같은 파일 `:1683`; `FE/types/apm.ts:977`, 같은 파일 `:1029`; `FE/services/apm.api.ts:353`; `FE/hooks/useDmoveQuery.ts:45`; `FE/services/apiEnvelope.ts:47`.