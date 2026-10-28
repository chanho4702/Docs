## 판정

**승인** — 1차 🔴1~3은 코드와 추가 테스트의 정적 검토 기준으로 해소됐다. 이번 보정에서 새로 확인된 승인 차단 결함은 없다.

파일 수정·테스트 실행 없이 검토했다. 요청서의 테스트 통과·뮤테이션 결과는 재현하지 않았다.

경로 약칭:

- `BE` = `C:\worktrees\apm-c05-followup\src\main\java\com\dmove\moveseye\premium\apm\alert`
- `BET` = `C:\worktrees\apm-c05-followup\src\test\java\com\dmove\moveseye\premium\apm\alert`
- `FE` = `C:\worktrees\apm-alert-history-fe\src`

## 1차 🔴1~3 해소 확인

| 항목 | 판단 및 코드·테스트 근거 |
|---|---|
| **🔴1 re-key 경합** | **해소.** retry는 최초 lane 조회 → resource 잠금 → 행 잠금 뒤 lane 재확인 순서이며, 변경됐으면 `LANE_CHANGED`로 종료한다. 새 테스트는 retry의 실제 advisory 대기를 확인한 뒤 lane만 변경하고 DEAD는 유지한다. 따라서 상태 검사만으로 통과하던 기존 테스트의 공백을 메운다. 코드: `BE/command/ApmZbxCommandStore.java:1653`, `:1658`, `:1669`. 테스트: `BET/command/ApmZbxCommandAdminIT.java:222`, `:234`, `:237`. |
| **🔴2 NEUTRALIZE_TIMEOUT 재시도 체인** | **해소.** 개별 retry가 `confirmRechecks`를 제거한다. 새 테스트는 미동기 상태에서 재시도해 다시 DEAD가 되고, STAT PENDING·트리거 꺼짐·성공한 -1 없음이 유지되는지 확인한다. 이후 캐시 동기화와 재시도를 거쳐 -1 기록·명령 완료·트리거 켜짐을 확인한다. 코드: `BE/command/ApmZbxCommandStore.java:1675`. 테스트: `BET/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:385`, `:401`, `:408`, `:411`, `:414`, `:418`. |
| **🔴3 acknowledge 경쟁·감사 / FE 폴링 수명** | **해소.** acknowledge가 resource 대기 후 갱신된 generation·status를 읽어 각각 `GENERATION_CHANGED`·`NOT_DEAD`로 거부하는 경쟁 테스트가 추가됐다. 감사는 실제 `afterCommit` 안에 있고 삭제 실패 시 로그 부재도 검사한다. FE 테스트는 상한 만료 → 새 QUEUED 응답 → 폴링 재개·만료 표시 해제 → 새 작업 기준 179초까지 유지하는 컴포넌트 흐름을 검사한다. 코드: `BE/command/ApmZbxCommandStore.java:1731`, `:1738`, `:1750`; `FE/pages/application-monitoring/alert-rules/tabs/ApmAlertRulesTab.tsx:95`. 테스트: `BET/command/ApmZbxCommandAdminIT.java:350`, `:369`; `FE/__tests__/ApmAlertRulesPage.test.tsx:330`, `:354`, `:370`, `:382`. |

## 🔴 필수

없음. 검토 범위에서 새로 확인된 필수 수정 사항은 없다.

## 🟡 권장

아래 항목은 승인을 막지 않는다.

- **감사 테스트에 커밋 단계 실패도 추가하면 좋다.** 현재 테스트는 `BEFORE DELETE`에서 실패하므로, 삭제 뒤 감사 등록까지 도달한 후 롤백되는 경우는 검증하지 않는다. 감사를 삭제 직후 동기 로그로 옮기는 회귀도 현재 실패 주입만으로는 잡지 못한다. 현재 `afterCommit` 구현 자체는 올바르다.  
  근거: `BET/command/ApmZbxCommandAdminIT.java:377`, `:383`, `:389`; `BE/command/ApmZbxCommandStore.java:1748`, `:1750`.

- **600초 경계 검증은 여전히 남는다.** 요청서의 과도한 표현 철회는 적절하다. 향후 정확히 600초인 값과 이를 초과한 값의 처리 차이를 직접 검사하는 것이 좋다. 이번 재검수의 차단 조건으로 재분류하지 않는다.  
  근거: `BE/command/ApmZbxPushCurrentExecutor.java:130`; `BET/evaluate/ApmAlertEvaluationZabbixPhaseIT.java:672`.

## 🟢 확인된 것

- **`raceOnLane`은 격리 DB 전제에서 필요한 실행 순서를 강제한다.** holder가 resource를 잡고, `pg_locks`에서 해당 advisory의 미승인 대기를 확인한 뒤 변경을 허용한다. 변경은 holder 트랜잭션 안에서 실행되고, 커밋으로 잠금이 풀려야 contender가 진행한다. 단순 sleep 기반 경쟁보다 결정적이다. 다만 대기 조회에 contender의 PID 조건은 없어, 같은 DB·같은 lane을 사용하는 외부 세션이 없다는 전제가 있다.  
  근거: `BET/command/ApmZbxCommandAdminIT.java:451`, `:457`, `:465`, `:486`, `:496`, `:498`; 자동 워커 비활성 전제: `BET/support/FakeZabbixIT.java:23`.

- **목록의 REPEATABLE READ 적용은 타당하다.** 컨트롤러가 별도 서비스 빈의 `list()`를 호출하고, 페이지·선행·후속·대상·집계가 그 트랜잭션 안에서 JDBC 조회로 실행된다. 조회 경로에 명시적 행·advisory 잠금이나 별도 `REQUIRES_NEW` 경계가 없다. 따라서 일반 워커·적재 DML과 새로운 잠금 순환을 만들지는 않는 구조다. 이는 정적 판단이며 동시 실행 실측 결과는 아니다.  
  근거: `BE/ApmAlertCommandController.java:66`; `BE/command/ApmZbxCommandAdmin.java:61`, `:71`, `:75`, `:90`; `BE/command/ApmZbxCommandStore.java:1792`, `:1805`, `:1813`, `:1979`.

- **페이지 보정은 기존 빈 페이지 고착을 해소한다.** 데이터가 있을 때만 현재 페이지와 마지막 페이지를 비교하고, total 0도 1페이지로 보정한다. 51건의 2페이지에서 total 50으로 줄면 offset 0으로 돌아가는 테스트가 있다.  
  근거: `FE/pages/application-monitoring/alert-rules/components/ApmAlertZbxCommandsCard.tsx:95`; `FE/__tests__/ApmAlertZbxCommandsCard.test.tsx:214`.

- **retry 감사의 장부 이동은 정확하다.** 잠근 행의 변경 전 command·dedup·lane·attempts·generation·이전 오류를 확보하고 커밋 뒤 기록한다. Admin의 즉시 감사 로그는 제거됐으며, 성공 시 워커 깨우기는 유지된다. 감사 내용 검사도 추가됐다.  
  근거: `BE/command/ApmZbxCommandStore.java:1661`, `:1682`, `:1686`; `BE/command/ApmZbxCommandAdmin.java:121`; `BET/command/ApmZbxCommandAdminIT.java:394`.