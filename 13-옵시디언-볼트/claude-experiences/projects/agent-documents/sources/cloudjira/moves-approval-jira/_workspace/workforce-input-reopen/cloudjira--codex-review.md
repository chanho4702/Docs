## 결론

현재 작업 트리는 **운영 배포 보류**가 적절합니다. 직접 REST 쓰기를 서버 관문으로 모은 것은 맞지만, “승인 앱의 현재 판정을 우회하는 경로가 0”이라고 결론 내릴 수는 없습니다.  
주요 차단 사유는 **낡은 ctl·제출 문서로 저장을 허용하는 구간**, **ctl 검증 실패 시 DIRECT로 복귀하는 조건**, **예상 원가의 판정 누락**입니다.  
팀 구조 생산 계약과 모달·Excel 변경은 대체로 맞습니다. 보고서의 협업 드로어 F-1과 원가 OFF 응답 F-2는 현재 코드에서 수정된 것을 확인했습니다.  
두 리포의 `git status`, `git diff`, 관련 미추적 소스를 검토했습니다. **테스트·빌드·Forge 배포·개발 사이트 실측은 재실행하지 않았으며**, 코드·문서·경험 Vault도 수정하지 않았습니다.

## 질문별 판정

경로 표기에서 `AP`는 `C:\CloudJira\moves-approval-jira`, `WF`는 `C:\CloudJira\moves-workforce`입니다. 검토 중 WF의 일부 보정 코드가 갱신되어, 해당 항목은 마지막으로 다시 읽은 코드 기준으로 판정했습니다.

### 1. B가 정말 우회를 닫는가 — **부분**

현재 UI의 작성·수정·삭제·캘린더 이동은 `worklogWrite.js`의 resolver 호출로 연결됩니다. 실행 서버에서도 작성은 `createIssueWorklogService`, 수정·삭제는 `assertDirectEdit`를 거칩니다. `DEFER`와 `DENY`는 Jira 쓰기 전에 예외로 종료합니다.

- 작성: `APPLY`에 해당하는 별도 직접 경로 없이 `ALLOW` 뒤에만 POST합니다. 근거: [IssueWorklogControlService.js:302](C:/CloudJira/moves-workforce/src/resolver/approvalLink/IssueWorklogControlService.js:302).
- 수정·삭제: 현재 이슈·워크로그·작성자를 재확인하고 판정한 뒤 PUT/DELETE합니다. 근거: 같은 파일 `:370`, `:385`, `:397`, `:447`, `:466`.
- 캘린더 drop: 공용 `moveWorklog`가 `updateIssueWorklog`를 호출하므로 서버 판정이 다시 적용됩니다. 근거: `WF/static/ui/src/components/worklog/worklogWrite.js:156`.
- 기간 일괄: gated 상태에서는 날짜별 `dryRun`을 먼저 수행하고, 저장 시에도 다시 판정합니다. 저장 중 실패하면 성공분은 남기고 미저장 날짜를 안내합니다. 근거: [WorklogModal.jsx:486](C:/CloudJira/moves-workforce/static/ui/src/pages/myWork/modal/WorklogModal.jsx:486).

문서별 결과는 다음과 같습니다.

| 조건 | 현재 결과 |
|---|---|
| 검증된 ctl에 `wr` 없음 | HANDOFF 또는 BLOCKED |
| 검증된 ctl의 `wr` 만료·미지원 버전 | HANDOFF 또는 BLOCKED |
| 구판 ctl에 `wa`만 있음 | 신판 WF는 `wa`를 읽지 않으므로 HANDOFF 또는 BLOCKED |
| `LinkedWriteGate`가 DEFER 반환 | 저장하지 않고 승인 앱 경로 반환 |
| ctl 자체의 서명 불량·조회 실패 | **미연동으로 접힌 뒤**, 스위치 OFF 또는 소속 false이면 DIRECT 가능 |

마지막 행이 “직접 쓰기로 떨어지는 경로 0” 주장과 맞지 않습니다. `ApprovalControlLookup`는 검증 실패를 `linked:false`로 반환하고, `writeChannelOf`는 `OFF || target === false`일 때 DIRECT를 반환합니다. 승인 앱에서 프로젝트 전체를 연결한 이슈가 WF 소속으로 판정되지 않는 경우에도 이 조건을 만날 수 있습니다. 근거: [ApprovalControlLookup.js:98](C:/CloudJira/moves-workforce/src/resolver/approvalLink/ApprovalControlLookup.js:98), [writeChannel.js:33](C:/CloudJira/moves-workforce/src/domain/approvalLink/writeChannel.js:33).

10분 유예는 자기 키 서명을 검증하지만, **봉투의 원래 `started`·`seconds`와 현재 기록의 일치 또는 출처 op의 재사용 여부까지 확인하지 않습니다**. 따라서 “서명이 유효한 본인 봉투”와 “이 기록이 방금 WF에서 생성된 바로 그 기록”은 아직 같은 증명이 아닙니다. 근거: [LinkedWriteGate.js:51](C:/CloudJira/moves-workforce/src/resolver/approvalLink/LinkedWriteGate.js:51).

승인 앱 없는 단독 사용은 유지됩니다. 다만 단독 경로를 살리기 위해 문서 부재·실패를 모두 미연동으로 취급한 부분이 연동 안전성과 충돌합니다.

### 2. 판정 동일성이 실제로 보장되는가 — **부분**

대조 테스트가 전부 복제된 가짜 판정을 비교하는 것은 아닙니다. 하네스는 실제 `mergePolicy`, `evaluateWorklogLock`, `judgeCreate`, `judgeMutation`, `mutationNotices`를 import합니다. 승인 앱의 화면 서버도 같은 함수들을 사용합니다. 근거: `AP/src/integration/workforce/__test__/writeGateHarness.js:9`, `:201`, `AP/src/resolver/worklog/WorklogService.js:127`, `:579`, `:641`.

그러나 하네스의 **서비스 조립·판정 순서는 테스트 전용으로 재구성**돼 있습니다. 실제 resolver의 최신 DB 조회, 수신 캐시 갱신, 통제 작업 상태, 출처 원장과 게시 지연까지 비교하지 않습니다. 따라서 도메인 산식의 동일성은 검사하지만, 실행 시점의 동일성을 보장하는 테스트는 아닙니다.

`wr` 생산은 같은 `mergePolicy`를 사용하며, `resolveTarget`은 WF가 자기 `rms.issue`로 적용할 `LINKED_ISSUE` 층을 제외합니다. 주 단위 `u`, 자동 마감, 제출 잠금, 수동 마감·재개방 `cr`, 프로젝트 이슈 예외 `ix/ixa`, 사이트 시간대 `tz`가 전달됩니다. 근거: [WorklogControlCtl.js:96](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlCtl.js:96), `AP/src/resolver/worklogPolicy/WorklogPolicyResolver.js:63`, `AP/src/domain/worklogControl/writeRules.js:37`.

**구체적으로 답이 갈리는 입력:** `wr.cr=[]`, 자동 마감 꺼짐인 ctl이 게시된 뒤 관리자가 지난달을 수동 마감합니다. ctl 재게시 큐가 아직 실행되지 않았다면 WF는 미만료 `wr`를 사용해 그 달의 새 작성을 ALLOW할 수 있지만, 승인 앱은 현재 `PeriodCloseRepository`에서 CLOSED를 읽어 DENY합니다. 마감 훅은 전 대상의 즉시 갱신을 완료하지 않고 큐를 깨웁니다. 근거: `AP/src/resolver/timesheet/PeriodLockService.js:60`, [WorklogControlHooks.js:116](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlHooks.js:116).

또한 `wr.exp`는 게시 당시 권한층의 남은 유효 기간으로 제한되지 않습니다. 게시 후 권한층이 만료되어 승인 앱은 `assertAuthority`로 거부하지만 WF의 `wr`는 남아 있을 수 있습니다. 근거: `AP/src/domain/worklogControl/writeRules.js:23`, `AP/src/resolver/worklogControl/WorklogControlCtl.js:103`.

### 3. ALL_ISSUES 프로젝트의 이슈별 해제 — **부분**

백엔드 보고서의 원래 발견은 현재 코드에서 보정됐습니다. `isOwnIssueRelease`가 WF 자기 서명·대상·`ctl:NONE`을 확인하고, `ApprovalControlLookup.forIssue`가 이를 프로젝트 ctl보다 우선합니다. 따라서 현재 코드는 해제된 이슈에 프로젝트 `wr`를 그대로 적용하지 않습니다. 근거: `WF/src/integration/approval/policySignal.js:93`, [ApprovalControlLookup.js:106](C:/CloudJira/moves-workforce/src/resolver/approvalLink/ApprovalControlLookup.js:106).

다만 **해제 이후 쓰기 창구는 아직 동일하지 않습니다**. 반환값이 `linked:false, code:'RELEASED'`여도 `creationState`는 RELEASED를 별도로 처리하지 않습니다. 전역 연동 ON이고 실제 WF 소속인 이슈는 `target:true`가 되어 BLOCKED입니다. 승인 앱은 해당 이슈를 비연동으로 처리합니다.

수정 지시는 두 단계입니다. 서명된 해제 우선순위는 유지하고, **검증된 RELEASED를 일반적인 부재·검증 실패와 구분**해 해제 이슈의 입력 정책을 명시해야 합니다. 현재의 보정으로 원래 오판정은 닫혔지만 입력 복원까지 완료됐다고 볼 수는 없습니다.

### 4. A의 팀 구조 계약 — **부분**

`approverOf`의 조상 탐색과 `memberTeamsOf/subLeadsOf`의 역방향 생산은 같은 규칙을 사용합니다. 팀장 없는 하위 팀원과 해당 상위 팀장에게 결재받는 하위 팀장이 `leads[].memberKeys`에 포함됩니다. 근거: [orgCap.js:34](C:/CloudJira/moves-workforce/src/integration/approval/orgCap.js:34), `:47`, `:55`, `:66`.

수신 측은 검증된 org를 `TeamScope`의 열람 범위와 `upperLeadsOf`에 사용합니다. 동일한 조직 스냅샷에서는 대칭적입니다. 다만 각자가 본인 문서를 게시하므로 조직 변경 직후에는 A의 새 `leaderKeys`와 B의 오래된 `memberKeys`가 일시적으로 어긋날 수 있습니다. 근거: `AP/src/resolver/timesheet/TeamScope.js:24`, `:64`.

W3는 **최소한 규칙 충돌이 남아 있습니다**. 상위 B가 있어도 A는 자신을 후보에서 선택하고 접수·결정할 수 있습니다. 결정 시에는 WF 팀장 여부만 재확인합니다. 근거: [WorklogRequestService.js:115](C:/CloudJira/moves-approval-jira/src/resolver/worklogCertification/WorklogRequestService.js:115), `:179`, [WorklogCertificationTargetAdapter.js:54](C:/CloudJira/moves-approval-jira/src/resolver/approval/target/WorklogCertificationTargetAdapter.js:54).

“상위 팀장, 없으면 본인”을 강제 규칙으로 적용하려면 후보·접수·결정 세 곳에서 `upperLeadsOf(owner)`가 빈 경우에만 자기 승인을 허용해야 합니다. 상위자 조회 실패는 자기 승인으로 전환하지 않고 거부해야 합니다. 반대로 팀장에게 상위자와 무관한 자기 승인 권한을 주려는 요구라면 현재 동작을 유지할 수 있지만, CLAUDE.md와 요구서의 강제 규칙 표현을 맞춰야 합니다.

W4는 기존 **“WF가 실제 결재자를 지정했을 때만 명부를 대체”**하는 우선순위의 결과입니다. 최상위 팀장의 `leaderKeys:[]`는 override로 인정되지 않아 명부 팀장이 기본 승인자가 됩니다. 코드상 일관되지만 이번 요구의 “위가 없으면 본인”에는 못 미칩니다. 근거: `AP/src/resolver/workforce/WorkforceInbound.js:341`, `AP/src/resolver/workforce/WorkforceOrgSource.js:59`.

### 5. ctl 즉시 게시 상한 — **부분**

상한 저장소 자체는 적절합니다. `AsyncLocalStorage.run(new Map())`로 resolver 호출마다 격리하며, 할당량 증가는 `await` 없이 수행됩니다. warm runtime 재사용과 같은 호출 안의 병렬 실행에서 카운터가 섞일 구조는 발견하지 못했습니다. 근거: [InvocationScope.js:15](C:/CloudJira/moves-approval-jira/src/permission/InvocationScope.js:15), `:36`.

그러나 상한은 **게시 3건**의 제한이며 전체 실행 시간의 제한은 아닙니다. `publishCtlNow` 호출별 예산은 별도이고, 서로 다른 resolver·스윕의 동시 게시를 직렬화하지도 않습니다.

다음 경로는 즉시 게시 대신 touch 또는 후속 배출에 의존합니다.

- 한 resolver에서 네 번째 이후 처음 검증된 이슈·프로젝트.
- `runInInvocation` 밖의 트리거·큐·일괄 갱신 경로에서 `ctlTargetChanged`를 호출한 경우.
- AsyncLocalStorage를 사용할 수 없는 런타임.
- `listDue(now,200)`의 첫 페이지에 요청 대상이 들어오지 않는 경우.
- 게시 관문·키·Jira PUT 실패로 즉시 배출하지 못한 경우.

`ctlTargetChanged`의 touch-only 분기에는 자체 wake가 없습니다. 따라서 일일 스윕까지 지연될 수 있습니다. 반면 정책·마감 변경의 `ctlRulesChanged`는 기존 workforce 큐를 깨웁니다. 근거: [WorklogControlHooks.js:100](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlHooks.js:100), `:133`, `AP/src/resolver/workforce/WorkforcePublisher.js:729`, `:738`.

### 6. 불변식 8·9 — **부분**

확인한 게시·수신 경계는 다음과 같습니다.

- 승인 앱 ctl PUT은 `WorkforcePublisher → createAppPropertyGateway`의 asApp 경로입니다. 근거: [WorkforcePropertyGateway.js:68](C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePropertyGateway.js:68).
- WF org는 호출자 본인 계정을 받아 asUser로 게시합니다. origin도 서버가 호출자·이슈·입력을 묶어 만든 뒤 asUser POST 본문에 싣습니다. 근거: `WF/src/resolver/approvalLink/ApprovalLinkSignals.js:249`, `IssueWorklogControlService.js:241`, `:334`.
- `wr`는 검증된 ctl에서만 전달됩니다. 제출 문서의 개별 엔트리와 인증 문서도 검증 후 사용합니다. 근거: `WF/src/integration/approval/controlDoc.js:25`, `timesheetDoc.js:38`, `LinkedWriteGate.js:96`.
- 승인 앱 org 소비는 `WorkforceInbound`의 검증·CAS 수신 결과를 거칩니다. 원시 사용자 프로퍼티를 곧바로 팀 판정에 사용하는 새 경로는 발견하지 못했습니다. 근거: `AP/src/resolver/workforce/WorkforceInbound.js:226`, `WorkforceOrgSource.js:22`.

다만 **서명된 값의 진위와 목록의 완전성은 별개**입니다. `movesApproval.{YYYY}`의 바깥 껍데기·기간 목록은 서명 대상이 아니고, 404 또는 빈 `periods`는 제출 없음으로 인정됩니다. 최신 제출이 아직 게시되지 않았거나 엔트리가 제거된 경우에도 현재 DB의 잠금 상태를 복원할 수 없습니다. 근거: [timesheetDoc.js:23](C:/CloudJira/moves-workforce/src/integration/approval/timesheetDoc.js:23).

따라서 “서명 검증 없이 읽는 값이 없다”는 좁은 주장은 대체로 맞지만, **불변식 9를 충족해 현재 쓰기 허가의 안전성이 확보됐다**는 결론은 성립하지 않습니다.

### 7. SQL·호출량 — **부분**

새 SQL 테이블·인덱스·마이그레이션·scheduled trigger·consumer 등록은 확인되지 않았습니다. WF의 기존 consumer 변경은 기존 기능 수정이며, manifest는 패널 관련 모듈·resource 삭제입니다.

`wr` 생산 비용은 테스트에서 같은 `now`의 배출 단위로 고정돼 있습니다. **일일 전체 1회**가 아니라 배출마다 공용 마감 조회 1회이며, 프로젝트 공용 조회가 메모됩니다. 큐 continuation이나 별도 즉시 게시가 다른 `now`를 사용하면 다시 조회합니다. 근거: [WorklogControlCtlWriteRules.test.js:153](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/__test__/WorklogControlCtlWriteRules.test.js:153), `:170`.

- `worklogApprovalFacts`: 보이는 페이지에 대상이 있으면 loader 1회, 없으면 0회입니다.
- 승인 관리 SQL 테스트: enrich +1과 전체 ≤17을 고정합니다. 근거: `AP/src/resolver/approval/__test__/ApprovalAdminSqlBudget.test.js:116`.
- 업무함: 공용 enrich 호출과 단위 테스트는 있지만 일일 유휴 예산 테스트가 이 화면 비용 전체를 고정하는 것은 아닙니다.
- Excel: 페이지당 `listAllApprovals` 1회, PAGE=50, 최대 5,000행이며 이름 조회는 별도 chunk 호출입니다. 근거: `AP/static/ui/src/features/approvalAdmin/exportApprovalAdminExcel.js:34`, `:64`.

Jira 엔티티 프로퍼티 값의 한도는 **32,768바이트**입니다. 30,000이라는 내부 여유 상한 자체는 타당합니다. [공식 Jira entity properties 문서](https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/)

검사는 서명 봉투 전체 `value`에 적용되어 봉투 오버헤드는 포함합니다. 하지만 `byteSize = JSON.stringify(value).length`는 **UTF-8 바이트가 아닌 문자열 길이**입니다. 현재 wr의 주된 숫자·ID 데이터는 ASCII여서 여유가 크지만, “30,000B 상한”이라는 구현·테스트 주장은 정확하지 않습니다. 근거: [controlDoc.js:15](C:/CloudJira/moves-approval-jira/src/integration/workforce/controlDoc.js:15), `AP/src/resolver/workforce/WorkforcePublisher.js:595`.

### 8. C의 회귀 — **맞음**

`FIELD_CHANGE`와 `ISSUE_TRANSITION`은 서버와 모달의 허용 집합에 그대로 남습니다. 두 종류의 `afterDecide` 실행 자체도 제거되지 않았습니다. 워크로그 승인에 불필요한 `apply:null`이 실려 모달이 닫히지 않는 문제를 좁혀 고친 변경입니다. 근거: `AP/src/resolver/approval/ApprovalService.js:97`, `:1007`, `AP/static/ui/src/entries/modal.jsx:39`, `:118`.

`WORKLOG_CREATE.afterDecide`는 기존에도 `{apply:null}`을 반환했습니다. 일괄 승인은 truthy `result.apply`만 `applyStatus`로 변환하므로 null 키를 없애도 해당 소비처의 동작은 같습니다. 사전 승인 입력의 적용 상태는 별도 `WorklogApprovalService`와 상세 metadata에서 유지됩니다. 근거: `AP/src/resolver/approval/target/WorklogCreateTargetAdapter.js:70`, `ApprovalService.js:863`.

Excel의 notice가 없으면 헤더·틀 고정·자동필터는 기존 2행입니다. notice가 있을 때만 모두 3행으로 함께 이동합니다. 근거: [excel.js:52](file:///C:/CloudJira/moves-approval-jira/static/ui/src/utils/excel.js%3A52), `:100`.

승인 관리 Excel은 같은 `listAllApprovals`를 커서로 따라가므로 서버 가시성 필터를 우회하지 않습니다. snapshot enrich도 가시성 검사·페이지 확정 뒤 수행합니다. 근거: `AP/src/resolver/approval/ApprovalAdminService.js:241`, `exportApprovalAdminExcel.js:41`.

### 9. 롤백 조합표 — **부분**

구판은 각 리포의 현재 HEAD 소스, 신판은 검토한 작업 트리로 비교했습니다. **코드 롤백과 이미 게시된 프로퍼티의 롤백은 동시에 일어나지 않습니다.**

| 조합 | 입력 경로 | 위험 |
|---|---|---|
| 승인 앱만 구판, WF 신판 | 재게시된 ctl에 `wa`만 있으면 HANDOFF/BLOCKED. 기존 신판 `wr`가 남아 있으면 만료 전까지 WF 관문 입력이 계속 열림 | 롤백 직후에는 신구 문서가 섞임 |
| 승인 앱 신판, WF만 구판 | 신판 ctl의 `ch:APP`, `wa` 없음으로 구판의 직접 생성 특례가 열리지 않음. 대체로 HANDOFF/BLOCKED | 남아 있는 옛 `wa` ctl은 구판 근사 직접 입력을 다시 열 수 있음 |
| 둘 다 구판 | `wa.v===1`·키 준비 등 구판 조건을 만족하면 생성 DIRECT 특례. 수정·삭제는 기존 넘김 경로 | 이번 작업이 제거하려던 근사 검사 우회와 36시간 이후 입력 장애가 돌아옴 |
| 둘 다 신판 | 미만료 `wr`이면 WF 서버 판정, 아니면 넘김/차단 | 현재 상태·게시 문서 간 시차 위험은 남음 |

근거: 구판 `WF/src/resolver/approvalLink/IssueWorklogControlService.js:133`, `:294`, `:350`; 신판 `AP/src/resolver/worklogControl/WorklogControlCtl.js:201`; 신판 `WF/src/integration/approval/controlDoc.js:51`.

운영 롤백 절차에는 ctl 재게시·확인과 WF의 프로젝트 문서 캐시 60초 경과 확인이 함께 들어가야 합니다.

### 10. 배포 전 필수 실측과 개발 사이트 절차 — **부분**

필수 실측은 마지막 절에 정리했습니다. 이번 리뷰에서 해당 실측은 실행하지 않았습니다.

직접 확인한 정적 결과는 다음과 같습니다.

- 양 리포 `writeGate.js`의 **원시 바이트가 동일**합니다.
- `writeGateVectors.json`도 원시 바이트가 동일합니다.
- 두 파일 모두 CR이 없습니다.
- `.gitattributes`의 해당 경로에 `text eol=lf` 지정이 추가돼 있습니다.

워크포스 패널 모듈·resource 삭제만으로 major가 필요하다고 단정할 근거는 없습니다. 현재 공식 major 변경 목록에 일반 issue UI 모듈 삭제는 포함되지 않아 **minor로 예상**하되, 실제 배포 결과와 설치 버전으로 확정해야 합니다. [공식 Forge App versions 문서](https://developer.atlassian.com/platform/forge/versions/)

### 11a. E의 월 경계·집계·권한·원가 — **부분**

핵심 진리표는 요구와 맞습니다. 검증된 문서의 `start/end`로 월 경계를 판단하고, 승인분은 항상, 이번 달 정상 출처·지문 일치 UNSUBMITTED/PENDING은 포함합니다. 반려·만료·취소·문서 없음은 제외합니다. `closeAt`은 잠금에만 사용합니다. 근거: [worklogApproval.js:81](C:/CloudJira/moves-workforce/src/integration/approval/worklogApproval.js:81).

현재 코드에서는 원가·진척 캐시가 `currentPeriodEnd` 표식으로 월 경계를 넘으면 무효화하도록 보정됐습니다. 따라서 보고서의 “캐시 키가 항상 서울 월 접미사”라는 지적은 현재 구현을 그대로 설명하지 않습니다. 다만 `rescopeApprovalBasis`는 새 `currentPeriodEnd`를 보존하지 않아 일부 경로가 다시 FALLBACK으로 내려갑니다. 근거: 같은 파일 `:128`, `:160`, `:172`.

현재 남은 문제는 다음과 같습니다.

1. **일반 프로젝트 트리·맵 드로어:** Jira REST 원본을 읽고 `approvalBasis:null`을 반환합니다. `countedSecondsOf`를 호출해도 승인 판정이 없는 원본 시간은 그대로 합산됩니다. 근거: [useIssueWorklogs.js:47](C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/work/useIssueWorklogs.js:47).
2. **협업 드로어 F-1:** 현재 `approvalFromDocs` 경로로 수정됐습니다. 이미 인가·소속·visibility를 좁힌 행에 서명 판정만 붙입니다. 사용자별 캐시와 결정자·요청 ID 제거도 유지됩니다. 근거: `WF/src/resolver/projectCollab/CollabIssueWorklogService.js:20`, `:41`, `:47`, `ApprovalCertReader.js:429`.
3. **협업 캘린더:** 아직 일반 `applyWorklogApproval`의 asUser 재검증을 사용합니다. Jira 열람 권한 없는 협업 참여자의 행이 사라지는 기존 문제가 남아 드로어와 동작이 다릅니다. 근거: `WF/src/resolver/projectCollab/CollabCalendarService.js:59`.
4. **예상 원가:** 확정분은 새 판정의 `approvedSecondsOf`를 사용하지만, 예상분은 재판정 전 `preserved`를 그대로 반환합니다. 숨김 보충 행 또는 앞선 판정과 문서 상태가 달라진 행이 요구와 다른 시간을 포함할 수 있습니다. 근거: [ApprovalCertReader.js:253](C:/CloudJira/moves-workforce/src/resolver/approvalLink/ApprovalCertReader.js:253).

원가의 구체 예는 승인 문서에 3,600초로 확정된 기록이 Jira에서 7,200초로 달라지고 숨김 보충 경로로 들어오는 경우입니다. 확정분은 3,600초인데 `expectedRows`에는 원래 보충 행의 7,200초가 남습니다. 요구대로라면 예상분에도 승인분 3,600초가 들어가야 합니다.

새 일반 표시 경로의 asApp 문서 조회는 먼저 보이는 행을 좁히고 사용자별 캐시를 사용합니다. 포트폴리오 배치는 집계 숫자만 반환하는 별도 경로입니다. 이번 추가 코드에서 타인의 숨김 설명을 새로 반환하는 경로는 발견하지 못했습니다. 다만 협업 경로는 **기존 CollabAccess 인가 예외**에 기대므로 승인 앱의 asUser 이슈 열람 불변식과 동일한 방식이라고 설명해서는 안 됩니다.

### 11. 더 단순한 안 — **부분**

| 안 | 빼거나 미루는 것 | “패널에서만 하지 말자” | 팀장 본인 결재 | 승인분 수정 불가·앱에서 보기 |
|---|---|---|---|---|
| WF 진입점 유지, 저장은 승인 앱으로 넘김 | B의 직접 ALLOW·10분 유예·wr 생산 | 진입은 만족, WF 안에서 저장 완료는 미충족 | A를 유지하면 만족 | B 단계와 숨김 본인 조회로 만족 |
| WF 생성만 열고 수정·삭제는 넘김 | 편집 인증 대조·10분 유예 | 작성은 만족 | A 유지 | 만족. 생성의 최신 잠금 검증은 필요 |
| A·B 유지, 승인 관리 Excel 연기 | 새 Excel export | 영향 없음 | 영향 없음 | 영향 없음 |
| E를 핵심 작업·캘린더·원가부터 적용 | 나머지 분석·포트폴리오 표시 확장 | 영향 없음 | 영향 없음 | 핵심 화면은 만족, “모든 화면”은 미충족 |
| WF에서도 입력, 실행은 승인 앱의 현재 판정에 위임 | 게시 문서를 최종 허가로 쓰는 구조 | 만족 | A 유지 | 만족. 호출·권한 계약 설계 필요 |

가장 작은 안전한 출시는 **A와 C를 유지하고, WF의 입력 진입점은 살리되 최신 판정을 증명하지 못하는 경우 넘기는 것**입니다. UI 배지·Excel 확장은 서버 쓰기 안전성 해결과 분리할 수 있습니다.

## 결함·누락

**P0로 확정할 결함은 발견하지 못했습니다. 다음 P1은 운영 배포 전에 해결해야 합니다.**

1. **P1 — 낡은 정책·마감 문서로 직접 쓰기 허용 — 담당: AP·WF**  
   근거: `AP/src/domain/worklogControl/writeRules.js:23`, `AP/src/resolver/worklogControl/WorklogControlHooks.js:116`, `WF/src/resolver/approvalLink/LinkedWriteGate.js:128`.  
   정책·마감 강화 직후 재게시 전에는 기존 `wr`가 계속 ALLOW할 수 있습니다. 최신 정책 revision을 확인하는 저장 프로토콜을 도입하거나, 그 확인이 불가능한 동안 직접 저장을 DEFER하십시오. TTL 단축만으로 “우회 0”을 보장할 수는 없습니다.

2. **P1 — 제출 문서 부재·누락을 제출 없음으로 신뢰 — 담당: AP·WF**  
   근거: `WF/src/integration/approval/timesheetDoc.js:26`, `:36`, `LinkedWriteGate.js:152`.  
   제출 직후 게시 지연이나 기간 엔트리 제거 시 승인 앱 DB의 PENDING/APPROVED 잠금과 달라집니다. 완전성과 최신성을 증명하는 서명 문서를 사용하고, 증명되지 않은 부재는 저장 허가로 사용하지 마십시오.

3. **P1 — ctl 검증 실패가 DIRECT 조건으로 복귀 — 담당: WF**  
   근거: `ApprovalControlLookup.js:102`, `:117`, `src/domain/approvalLink/writeChannel.js:39`.  
   ABSENT·BAD_SIGNATURE·READ_FAILED·NO_TRUST·검증된 RELEASED를 구분하십시오. 연동 통제가 있을 수 있는 대상에서 문서 검증 실패를 비연동 DIRECT로 변환하지 마십시오.

4. **P1 — 예상 원가에 최종 승인 판정 미적용 — 담당: WF**  
   근거: `src/resolver/approvalLink/ApprovalCertReader.js:267`, `:274`.  
   `expectedRows`도 같은 최종 `approval.countableSeconds`로 구성하십시오. 숨김 보충된 변경 승인분과 두 판정 사이 반려된 기록을 포함하는 회귀 검증이 필요합니다.

5. **P1 — 사람 확인 없이 관문 PASS 가능 — 담당: AP·운영 절차**  
   근거: [WorklogControlService.js:262](C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlService.js:262), `src/domain/worklogControl/gates.js:69`.  
   수동 PASS는 실제 확인 결과를 기록하는 기능으로는 타당하지만, “운영 전 재확인” 메모만으로 운영 준비를 통과시키는 사용은 부적절합니다. 개발 예외와 실측 PASS를 구분하고, 운영 스위치는 실측 증거가 있는 결과만 인정하십시오.

6. **P2 — 자기 승인 강제 규칙과 W3·W4 충돌 — 담당: AP**  
   근거: `WorklogRequestService.js:121`, `:181`, `WorklogCertificationTargetAdapter.js:66`, `WorkforceInbound.js:341`.  
   “상위자 없을 때만 자기 승인”을 후보·접수·결정에 일관되게 적용하고, 검증된 최상위 팀장을 명부 fallback에서 제외할지 명시하십시오.

7. **P2 — 10분 출처 증명의 결속 부족 — 담당: WF**  
   근거: `src/resolver/approvalLink/LinkedWriteGate.js:51`.  
   자기 서명 검증 외에 원래 기록 값·생성 시각·op 결속을 검증하십시오. 안전한 재사용 방지 근거가 없다면 미관찰 편집은 DEFER하십시오.

8. **P2 — E의 일반 드로어 표시 공백·협업 캘린더 불일치 — 담당: WF**  
   근거: `useIssueWorklogs.js:47`, `CollabCalendarService.js:59`.  
   일반 드로어에 서버 승인 판정을 붙이고, 협업 캘린더도 기존 협업 인가를 보존하는 판정 경로로 정리하십시오. 승인 배지·합계가 빠진 예외를 “모든 화면 완료”로 표시하지 마십시오.

9. **P2 — UTF-8 용량 계산과 예산 표현 부정확 — 담당: AP**  
   근거: `src/integration/workforce/controlDoc.js:22`, `WorklogControlCtlWriteRules.test.js:153`.  
   봉투 전체를 `Buffer.byteLength(JSON.stringify(value), 'utf8')`로 측정하십시오. `1 + 4×프로젝트`는 배출 단위 비용임을 명시하고 실제 일일·continuation 호출량을 별도로 측정하십시오.

10. **P2 — 문서와 코드 계약 불일치 — 담당: AP·WF**  
    근거: `AP/src/integration/workforce/controlDoc.js:7`, `WF/_workspace` 보고서의 AGENTS 문서 미갱신 기록.  
    ctl이 표시·넘김 전용이라는 주석과 구판 `wa` 기반 쓰기 설명을 현재 계약으로 맞추십시오. 검증 보고서에는 수정 완료된 F-1·F-2와 아직 남은 예외를 분리하십시오.

## 권고안

A의 패널 제거·조직 게시, C의 모달 수정·공용 이력 enrich는 유지할 수 있습니다. B는 “서명된 게시 문서가 최신 DB 판정과 같다”는 전제가 해결될 때까지 운영에서 직접 ALLOW를 제한하는 것이 적절합니다.

우선 **문서의 진위·완전성·최신성을 각각 구분**하십시오. 정상 서명이 있어도 낡은 문서일 수 있고, 개별 엔트리가 정상이어도 목록에서 잠금 엔트리가 빠졌을 수 있습니다. 대조 테스트도 도메인 산식 테스트에 더해 정책 강화·제출·승인·재개방과 실제 쓰기가 엇갈리는 서버 경로를 검증해야 합니다.

E는 확정·예상 행을 한 번의 최종 판정에서 만들고, 드로어·캘린더·원가가 그 결과를 함께 사용하도록 정리하십시오. 수정된 협업 드로어는 유지하되 협업 캘린더와 일반 드로어의 예외를 닫아야 합니다.

개발 사이트의 수동 메모 PASS는 **개발 실험 기록**으로 취급하십시오. 일반 사용자·모바일·REST 우회·복구 확인을 완료한 운영 실측 PASS와 같은 의미로 사용해서는 안 됩니다.

## 배포 전 필수 실측

다음은 중복 항목을 합친 최소 집합입니다.

| 묶음 | 개발 사이트 절차 | 필수 증거 |
|---|---|---|
| **U-1·U-3** 문서 게시·읽기 | 신판 WF 후 신판 AP 적용. 본인 `movesApproval.{YYYY}`, cert, ctl GET. `wr` 존재·`wa` 부재·`exp` 확인 | asUser 본인 조회 성공, 서명 검증 결과, 봉투 UTF-8 크기 |
| **V-1·U-4** 연결·규칙 갱신 | 새 연결 이슈를 최초 검증. 이어 정책 강화·수동 마감·재개방·이슈 예외 저장 | ctl PUT 결과와 `pending/published_at`, 변경 반영 지연, **재게시 전 저장이 차단되는지** |
| **V-2·V-3·V-5·V-7** 조직 게시 | 일반 팀원·하위 팀장 A·상위 B·최상위 팀장으로 접속. 중간 팀장 공석·팀 이동·팀장 교체 수행 | `leaderKeys/memberKeys` 대칭, 실제 teamKey 유효성, 두 사람 문서 갱신 시차 |
| **V-6·U-6** 작성·자동 결재 | WF에서 기록 후 AP의 출처 WORKFORCE·자동 접수·기본 승인자 확인. 명부 병용도 확인 | 상위자 우선, 최상위 자기 승인, 일반 팀원 자기 승인 거부 |
| **거부 3종·U-7** | 작성 기간 밖 등록, 승인분 수정·삭제, 마감 기간 등록을 모달·drop·resolver 직접 호출로 시도 | 오류 코드뿐 아니라 **Jira 기록이 변경되지 않았음** |
| **출처·DEFER** | `expand=properties` 단건 GET. 작성 직후·10분 경계·봉투 복사·내용 변경, 문서 없음·불량·만료·구판 `wa`, 사전 승인·BLOCK 상한 시험 | ALLOW/DENY/DEFER 결과와 POST/PUT/DELETE 호출 유무 |
| **기간 일괄** | 날짜 하나가 거부되는 범위, 전부 통과하는 범위, 저장 도중 실패하는 범위 | 선판정 거부 시 생성 0건, 중간 실패 시 성공분·미저장 날짜 정확성 |
| **E·B 단계** | 승인분을 Jira 직접 GET/PUT/visibility 해제/DELETE로 시도. AP·WF 본인 화면, 일반 드로어·협업 드로어·협업 캘린더 확인 | 직접 변경 차단, 앱 본인 조회 유지, 타인 숨김 설명 비노출 |
| **월 경계·원가** | 사이트 시간대를 Seoul과 DST 지역으로 설정한 시험 데이터. 월말·월초, 변경 승인분·반려·삭제 KEEP/ZERO 확인 | 모든 합계 일치, 예상=승인분+이번 달 결정 전, 경계 후 캐시 무효화 |
| **호출량·U-5** | cold/warm 화면 조회, ctl 대량 배출·continuation, 5,000행 Excel. 양 런타임 벡터 실행 | 실제 SQL/Jira 호출 수·시간, Intl 결과, 화면·내보내기 권한 범위 |
| **V-4·V-8·V-9·롤백** | 권한 있는 배포 단계에서 lint·deploy 결과 확인, 설치 버전 확인, 터널 재시작, ALL 재게시와 세 롤백 조합 시험 | 패널 소멸, 실제 major/minor, ctl·flows 재게시, 잔존 문서 처리 |
| **EOL·최종 검증** | 최종 checkout에서 원시 바이트·CR·`.gitattributes` 재확인. 마지막 보정 이후 관련 테스트·빌드 실행 | 양 사본 동일성과 **최종 변경 전체**의 검증 결과 |

수동 관문 3건은 실제 일반 사용자·비UI 경로·복구 실측을 완료한 뒤 결과와 증거를 다시 기록해야 합니다. 현재의 “개발 사이트, 운영 전 재확인” 메모만으로 운영 B 단계의 준비 완료를 판정하면 안 됩니다.