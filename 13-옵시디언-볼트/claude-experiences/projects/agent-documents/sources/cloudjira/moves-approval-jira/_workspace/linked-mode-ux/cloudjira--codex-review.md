## 결론

**현재 상태로는 배포 보류를 권고합니다.** 주요 화면의 창구 통일과 정책 편집 UI 이동은 구현됐지만, 캐시된 `DIRECT` 판정으로 수정·삭제가 나가는 경로는 남아 있습니다.  
가장 중요한 문제는 `LINKED_ISSUE.pol`이 기존 Workforce 잠금을 지우며 제한을 완화한다는 점입니다. 프로젝트 이동 후 이슈 예외 목록의 범위 재확인도 빠져 있습니다.  
계약 두 파일은 실제 바이트까지 동일합니다. 그러나 한쪽 앱만 롤백하면 정책 무시·설정 소실·직접 쓰기 재개 가능성이 있어 안전한 롤백 조합으로 볼 수 없습니다.  
두 리포의 `git status`·`git diff`와 미추적 구현 파일을 검토했습니다. 파일 수정·배포는 하지 않았고, 전체 Jest·빌드 통과는 구현 보고서의 결과이며 이번 검토에서 재실행한 결과는 아닙니다.

## 질문별 판정

아래에서 **A**는 승인 앱, **W**는 워크포스 리포입니다.

### 1. 창구 통일 — **부분**

현재 판정이 `HANDOFF`·`BLOCKED`인 경우에는 주요 화면에서 직접 쓰기를 차단합니다.

| 경로 | 코드 판정 |
|---|---|
| 이슈 패널 작성 | `createChannel !== 'DIRECT'`이면 제출 중단 |
| 패널 행 수정·삭제 | `editChannel`로 행 액션 자체를 제한 |
| 마이워크 모달 작성·기간 입력 | `createBlocked`에서 공통 제출 중단 |
| 모달 수정·삭제 | Enter 제출과 삭제 핸들러도 `DIRECT` 검사 |
| 마이워크·프로젝트 캘린더 drop | 공통 `checkWorklogMove` 이후 `DIRECT`일 때만 PUT |
| 서버 `createIssueWorklogService` | `HANDOFF`는 넘김 오류, 그 밖의 비DIRECT는 거부 후 POST |

근거: W의 [PanelWorklogForm.jsx:77](/C:/CloudJira/moves-workforce/static/ui/src/panel/PanelWorklogForm.jsx:77), [PanelRecentWorklogs.jsx:103](/C:/CloudJira/moves-workforce/static/ui/src/panel/PanelRecentWorklogs.jsx:103), [WorklogModal.jsx:318](/C:/CloudJira/moves-workforce/static/ui/src/pages/myWork/modal/WorklogModal.jsx:318), [worklogMove.js:21](/C:/CloudJira/moves-workforce/static/ui/src/pages/myWork/worklogMove.js:21), [worklogDrop.js:37](/C:/CloudJira/moves-workforce/static/ui/src/pages/projectDetail/calender/worklogDrop.js:37), [IssueWorklogControlService.js:292](/C:/CloudJira/moves-workforce/src/resolver/approvalLink/IssueWorklogControlService.js:292).

연동 ON의 조회 실패·소속 확인 실패는 `BLOCKED`입니다. 서버 `plain` 분기도 ON이면 진입하지 않습니다. 승인 앱 없는 OFF 설치의 직접 작성·수정·삭제 경로는 유지됩니다. 근거: [writeChannel.js:27](/C:/CloudJira/moves-workforce/src/domain/approvalLink/writeChannel.js:27), [writeChannelView.js:10](/C:/CloudJira/moves-workforce/static/ui/src/components/worklog/writeChannelView.js:10).

**다만 “어느 경로로도 나가지 않는다”는 보장은 성립하지 않습니다.** 캘린더는 `DIRECT` 판정을 5분 캐시하고, 모달도 조회한 판정을 제출 시 재사용합니다. 비연동 이슈를 조회한 뒤 같은 이슈가 연동 대상으로 바뀌면 이전 판정으로 PUT·DELETE가 가능합니다. 공용 `updateWorklog`·`deleteWorklog`에는 실행 시 연동 확인이 없습니다. 근거: [worklogMoveGuard.js:15](/C:/CloudJira/moves-workforce/static/ui/src/components/worklog/worklogMoveGuard.js:15), [worklogWrite.js:134](/C:/CloudJira/moves-workforce/static/ui/src/components/worklog/worklogWrite.js:134).

### 2. 승인 앱 작성 개방과 통제·탐지 — **맞음, 단 실측 필요**

실제 변경은 `WorklogControlContext.channel`을 APP으로 남기는 대신 **필드 자체를 제거**하고, 게시 문서의 `ch`를 APP으로 고정한 것입니다. 작성 경로에는 기간 창·기간 잠금·정책·사전 승인·출처 intent 검사가 계속 있습니다. `channel` 제거가 이 검사들을 생략하지는 않습니다. 근거: A의 [WorklogControlContext.js:96](/C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlContext.js:96), [WorklogControlCtl.js:97](/C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlCtl.js:97), [WorklogService.js:559](/C:/CloudJira/moves-approval-jira/src/resolver/worklog/WorklogService.js:559).

`LINKED_DIRECT_WF`는 새 기록·연동 이슈·검증된 WORKFORCE 출처이면 관찰 로그를 남깁니다. DELETE의 관문·능력 신호 확인은 유지됩니다. **WORKFORCE 봉투가 있다고 DELETE 후보가 되는 것은 아니며**, 출처 증명이 없는 `NONE`만 후보입니다. 근거: [WorklogControlDetector.js:163](/C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlDetector.js:163), [WorklogControlDetector.js:232](/C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlDetector.js:232), [foreign.js:33](/C:/CloudJira/moves-approval-jira/src/domain/worklogControl/foreign.js:33).

설계 Q1의 **조회 시 cap 게시도 구현됐습니다.** 연동 통제 문서가 확인되면 `getIssueWorklogControlService`가 `ensureOrgCap`을 호출합니다. 게시 실패는 조회 실패로 승격하지 않으며, DELETE 관문을 강제로 여는 처리도 없습니다. 근거: W의 [IssueWorklogControlService.js:222](/C:/CloudJira/moves-workforce/src/resolver/approvalLink/IssueWorklogControlService.js:222), [ApprovalLinkSignals.js:224](/C:/CloudJira/moves-workforce/src/resolver/approvalLink/ApprovalLinkSignals.js:224).

### 3. 계약 변경·롤백 — **부분**

실제 SHA-256 계산 결과 양쪽 파일은 동일합니다.

| 파일 | 양쪽 공통 SHA-256 |
|---|---|
| `contract.js` | `cb3e80c2d39485ea302e8d0f16d06d37dce199c0cbc29a23cd549ffe01916012` |
| `vectors.json` | `c85d6c779dd9b7e40d2ae4281a351b7f2d931f170e5da369812e6f145a69adc7` |

신판의 서명 검증에서는 `validateBody`를 통과해야 합니다. `pol`은 닫힌 키 집합·범위·분 단위 초를 검사하고, `fl`은 소문자 UUID를 검사합니다. 직접 저장 입력과 최종 서명 본문도 검증하므로, **추적한 신판 경로에서 해당 검사 누락은 발견하지 못했습니다.** 근거: A의 [contract.js:260](/C:/CloudJira/moves-approval-jira/src/integration/workforce/contract.js:260), [contract.js:324](/C:/CloudJira/moves-approval-jira/src/integration/workforce/contract.js:324), [signature.js:109](/C:/CloudJira/moves-approval-jira/src/integration/workforce/signature.js:109), W의 [IssueApprovalSettingService.js:56](/C:/CloudJira/moves-workforce/src/resolver/approvalLink/IssueApprovalSettingService.js:56), [issueSetting.js:69](/C:/CloudJira/moves-workforce/src/integration/approval/issueSetting.js:69).

| 조합 | 정책·결재선 상태 | 쓰기 창구·위험 |
|---|---|---|
| 양쪽 신판 | 키 부재는 미설정. 새 칸 저장은 검증된 ctl `rx`로 제한 | 정상적인 최신 판정에서는 승인 앱으로 넘김 |
| 승인 앱만 구판 | 기존 `pol`·`fl`을 의미상 무시. 사이트·프로젝트·구판 결재선 규칙으로 복귀 | 신판 W는 계속 넘김. 다만 옛 ctl로 교체되기 전에는 새 `rx`가 남아 추가 저장을 허용할 수 있음 |
| 워크포스만 구판 | 기존 신판 문서는 읽지만 새 칸 UI 없음. **s/e/pa를 변경해 재게시하면 구판 writer가 `pol`·`fl`을 빼고 작성** | 최신 `ch:'APP'`을 읽으면 작성은 넘김. 이전 ctl·조회 실패·구판 편집/drop 경로에서는 직접 쓰기 위험 |
| 양쪽 구판 | 확장 정책 기능 없음 | 기존 설정과 구판의 분산 창구 동작으로 복귀 |

특히 **“구판 워크포스는 새 칸을 표시하지 않을 뿐”이라는 설명은 읽기에만 맞습니다.** `git show HEAD:src/integration/approval/issueSetting.js`로 확인한 구판 `issueSettingPlan`은 새 본문을 `{s,e,pa,by,tk,rev}`로 만듭니다. 재게시 후 신판 승인 앱이 더 높은 rev를 받으면 기존 정책이 소실될 수 있습니다. 신판의 보존 구현은 [issueSetting.js:58](/C:/CloudJira/moves-workforce/src/integration/approval/issueSetting.js:58), 설계의 구판 설명은 [설계서:430](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/01_architect_design.md:430)입니다.

`rx`는 호환성 게이트이지, 이미 게시된 데이터나 롤백 직후의 낡은 ctl을 보호하는 장치는 아닙니다.

### 4. “더 엄한 쪽 적용” — **부분**

DIVERGED 병합은 설계대로 구현됐습니다.

- 양쪽에 있는 정책 키는 더 엄한 값 선택.
- 한쪽에만 있는 키는 `polOpen`으로 보존.
- 읽을 때 실제 하위 층 유효값과 다시 비교.
- `fl`은 최고 rev 저장본 선택.

근거: [setting.js:17](/C:/CloudJira/moves-approval-jira/src/domain/linkedIssue/setting.js:17), [WorklogPolicyResolver.js:63](/C:/CloudJira/moves-approval-jira/src/resolver/worklogPolicy/WorklogPolicyResolver.js:63). 파일을 변경하지 않는 독립 실행에서도 한쪽의 8시간 제한과 하위 층 4시간 제한을 병합하면 4시간으로 계산됐습니다.

**단일 문서가 사이트 기본값보다 느슨한 것 자체는 최종 설계 §5.6의 의도입니다.** 따라서 일반 기본값 완화를 구현 오류로 분류하지는 않습니다. 근거: [설계서:346](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/01_architect_design.md:346).

그러나 현재 구현은 **명시적 Workforce 잠금도 제거**합니다. 하위 층이 `dailyMaxSeconds=14400, locked=true`인데 `pol.dailyMaxSeconds=28800`이면 최종값이 8시간·`locked=false`가 됩니다. 실제 순수 함수 실행으로 확인했습니다. 근거: [merge.js:30](/C:/CloudJira/moves-approval-jira/src/domain/worklogPolicy/merge.js:30), [merge.js:39](/C:/CloudJira/moves-approval-jira/src/domain/worklogPolicy/merge.js:39).

판단은 다음과 같습니다.

- 일반 기본값: 팀장 예외 허용 가능.
- 명시적 잠금: 완화 금지.
- 사이트 `BLOCK`과 결합한 시간 상한: 조직 공통 통제로 쓸 것이라면 넘지 못하는 하한을 별도로 정의해야 함. 현재는 `BLOCK`을 유지해도 상한을 0, 즉 무제한으로 바꿔 실질적으로 제한을 없앨 수 있습니다. 근거: [catalog.js:43](/C:/CloudJira/moves-approval-jira/src/domain/worklogPolicy/catalog.js:43).

### 5. 권한 범위 — **부분**

`listAllApprovals`는 이슈 계열을 기존 `filterVisibleRows`로 좁히고, 타임시트는 `TimesheetAccess.canView`를 직접 호출합니다. 관리자에게 타임시트 전체를 노출하는 어댑터 우회는 없습니다. Q144의 기존 열람 규칙을 유지합니다. 근거: [ApprovalAdminService.js:86](/C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalAdminService.js:86), [TimesheetAccess.js:20](/C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TimesheetAccess.js:20).

`lookupProjectIssue`와 `selectIssueWorklogApprovalFlow`는 실제 Jira 이슈의 프로젝트를 요청 `projectId`와 대조합니다. 다른 프로젝트 id를 넣어 저장하는 우회는 차단됩니다. 근거: [WorklogPolicyService.js:108](/C:/CloudJira/moves-approval-jira/src/resolver/worklogPolicy/WorklogPolicyService.js:108), [WorklogApprovalPolicy.js:86](/C:/CloudJira/moves-approval-jira/src/resolver/worklogApproval/WorklogApprovalPolicy.js:86).

**목록에는 누락이 있습니다.** `listIssueWorklogExceptions`는 임의 issueId 입력을 받지 않고 SQL을 프로젝트로 제한하지만, 목록에 들어온 이슈의 **현재** `meta.projectId`를 대조하지 않습니다. A 프로젝트에 저장했던 이슈가 B로 이동한 뒤에도 A 목록에서 B 이슈의 키·제목과 옛 설정을 표시할 수 있습니다. 메타 조회 실패도 제외 조건이 아닙니다. 근거: [WorklogPolicyService.js:93](/C:/CloudJira/moves-approval-jira/src/resolver/worklogPolicy/WorklogPolicyService.js:93), [JiraPermission.js:214](/C:/CloudJira/moves-approval-jira/src/permission/JiraPermission.js:214).

`listWorkforceTeams`는 수신 SQL 캐시만 읽으며 사용자 프로퍼티 전수 조회를 하지 않습니다. `getPrincipalContext`와 관리자 가드는 같은 `resolveAdminPrincipal`을 사용하고, 프론트는 `isAdmin === true`일 때만 관리 묶음을 표시합니다. 근거: [WorkforceTeamsService.js:28](/C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceTeamsService.js:28), [PrincipalController.js:9](/C:/CloudJira/moves-approval-jira/src/resolver/principal/PrincipalController.js:9), [PrincipalResolver.js:48](/C:/CloudJira/moves-approval-jira/src/permission/PrincipalResolver.js:48), [usePrincipal.js:20](/C:/CloudJira/moves-approval-jira/static/ui/src/features/inbox/usePrincipal.js:20).

### 6. SQL·호출량 — **부분**

두 리포의 변경 목록에서 신규 DDL·인덱스·마이그레이션·manifest 변경은 없습니다. 기존 스케줄·큐 종류도 늘리지 않았습니다. `flows`는 기존 `workforce` 작업에서 배출됩니다. `idleSqlBudget`의 27·38·13 상한도 유지되고, flows 원천을 붙인 유휴 검사가 추가됐습니다. 근거: [idleSqlBudget.test.js:156](/C:/CloudJira/moves-approval-jira/src/trigger/__test__/idleSqlBudget.test.js:156), [WorkforcePublisher.js:646](/C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforcePublisher.js:646).

**8+2N 상한 테스트는 전체 SQL 상한을 입증하지 못합니다.** 실제 요청·결재자 조회 ≤8은 검사하지만 `TimesheetAccess.canView`를 단순 mock으로 대체합니다. 실제 팀장 판정에는 팀 조회 1~2 SQL, org 조회·갱신·명부 우선순위 조회 등이 들어가며, invocation memo로 공유되는 비용도 있습니다. “타임시트마다 위임 1+팀장 1”이라는 설명은 실제 호출 구조와 다릅니다. 근거: [ApprovalAdminService.test.js:185](/C:/CloudJira/moves-approval-jira/src/resolver/approval/__test__/ApprovalAdminService.test.js:185), [TeamRepository.js:68](/C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TeamRepository.js:68), [TeamScope.js:24](/C:/CloudJira/moves-approval-jira/src/resolver/timesheet/TeamScope.js:24), [WorkforceInbound.js:222](/C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceInbound.js:222).

`touchDocKey`는 실제로 `WHERE doc_key=?` 전체 스캔 가능성이 있습니다. PK 선두는 `account_id`이며 `doc_key` 인덱스는 없습니다. 호출 빈도는 낮지만 원장 전체 크기에 비례하는 비용입니다. 근거: [WorkforceLinkRepository.js:134](/C:/CloudJira/moves-approval-jira/src/resolver/workforce/WorkforceLinkRepository.js:134), [workforceLink.sql.js:47](/C:/CloudJira/moves-approval-jira/src/rdb/schema/ddl/workforceLink.sql.js:47).

독촉의 요청·단계·현지 날짜 이벤트 키와 결정적 수신자별 알림 id는 적절합니다. 동시 호출도 `insertIgnore`로 중복을 제한합니다. 다만 **수동 독촉끼리 하루 1회**이며 기존 자동 독촉과 합산한 하루 1회는 아닙니다. 근거: [ApprovalAdminService.js:201](/C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalAdminService.js:201), [ExpiryService.js:57](/C:/CloudJira/moves-approval-jira/src/resolver/approval/ExpiryService.js:57).

### 7. 프론트 경계면 — **맞음, 일부 UX 실측 필요**

신규 controller는 `{content: ...}`를 반환하고, `ResponseWrapper`는 `{success:true,...result}`로 감쌉니다. 프론트 `invokeApproval`이 `res.content`를 풀어 소비하므로 신규 shape의 이중 래핑 문제는 없습니다. 근거: [ApprovalAdminController.js:6](/C:/CloudJira/moves-approval-jira/src/resolver/approval/ApprovalAdminController.js:6), [ResponseWrapper.js:20](/C:/CloudJira/moves-approval-jira/src/utils/ResponseWrapper.js:20), [invokeApproval.js:25](/C:/CloudJira/moves-approval-jira/static/ui/src/api/invokeApproval.js:25).

`selectedFlow`, `managedBy`, channel 제거에 대한 소비 변경은 맞춰져 있습니다. 옛 정책 응답 필드의 실행 소비도 검색에서 발견하지 못했습니다. 근거: [WorklogApprovalFlowLine.jsx:31](/C:/CloudJira/moves-approval-jira/static/ui/src/features/worklogApproval/WorklogApprovalFlowLine.jsx:31), [WorklogTab.jsx:79](/C:/CloudJira/moves-approval-jira/static/ui/src/features/worklog/WorklogTab.jsx:79).

`tab=done`→history/processed, 옛 감사·보관 URL→records, 기존 결재 구성 `setting`·`section` 호환 처리가 있습니다. 신규 CRA 엔트리는 없어서 3곳 추가 규칙의 누락도 없습니다. 근거: [inboxUrl.js:77](/C:/CloudJira/moves-approval-jira/static/ui/src/features/inbox/inboxUrl.js:77), [InboxPage.jsx:210](/C:/CloudJira/moves-approval-jira/static/ui/src/features/inbox/InboxPage.jsx:210), [settingsNavigation.js:109](/C:/CloudJira/moves-approval-jira/static/ui/src/features/settings/settingsNavigation.js:109).

관련 **30개 언어·namespace 조합을 원본 JSON과 merged JSON으로 직접 비교했고 불일치 0건**이었습니다. 감사 `worklogApproval`·`bindIssue`도 양쪽 언어와 merged 파일에 있습니다. 근거: [policy.json:226](/C:/CloudJira/moves-approval-jira/locales/kr/policy.json:226), [ko-KR.json:1476](/C:/CloudJira/moves-approval-jira/locales/ko-KR.json:1476).

남은 문제는 기간 프리셋의 브라우저 시간대와 서버 Jira 시간대 차이입니다. 경계일의 표시·조회가 하루 달라질 수 있습니다. 근거: [inboxUrl.js:114](/C:/CloudJira/moves-approval-jira/static/ui/src/features/inbox/inboxUrl.js:114).

### 8. 이슈 화면 원칙 — **맞음, 위치 안내는 부분**

승인 앱의 issue/worklog 엔트리에서 상대 정적·동적 import를 따라가는 기존 검사 로직을 읽기 전용으로 실행했고, 세 검사가 통과했습니다. 정책 편집 모듈과 저장 resolver는 도달하지 않습니다. 워크포스 이슈 패널에서도 승인 설정 편집 호출을 발견하지 못했습니다. 근거: [issueScreenNoPolicyEdit.test.js:21](/C:/CloudJira/moves-approval-jira/static/ui/src/features/worklog/__test__/issueScreenNoPolicyEdit.test.js:21).

결재선이 없을 때는 **누가 어디서 설정해야 하는지** 안내합니다. 단독은 Jira 프로젝트 설정 › Moves Approval, 연동은 워크포스 작업관리 › 승인 설정입니다. 근거: [worklogApproval.json:63](/C:/CloudJira/moves-approval-jira/locales/kr/worklogApproval.json:63).

반면 일반 규칙 요약과 정상 결재선 한 줄에는 설정 위치 안내가 없습니다. 사용자 요구인 편집 UI 제거는 충족하지만, 모든 읽기 전용 요약에서 위치까지 안내한다는 판정은 할 수 없습니다. 근거: [WorklogRulesLine.jsx:20](/C:/CloudJira/moves-approval-jira/static/ui/src/features/worklogPolicy/WorklogRulesLine.jsx:20).

### 9. 더 단순한 안 — **부분적으로 가능**

| 축소안 | 줄어드는 구현 | 요구 충족 범위 |
|---|---|---|
| `approval.flows` 없이 승인 앱 프로젝트 설정에서 결재선 선택 | 새 문서·게시·조회·rx·fl 동기화 제거 | 창구 통일·이슈 편집 제거는 충족. **최종 Q142(a)는 미충족**, 결정 변경 필요 |
| 승인 관리에서 수동 독촉 제외 | 신규 mutation·중복 이벤트·행 액션 제거 | 현황·관리자 메뉴 유지. 요구 ⑤의 독촉은 미충족 |
| 승인 관리·내 이력 목록 유지, 조회 시 팀장 범위 한 번 계산 | 화면 변화 없이 반복 열람 비용 단순화 | 전체 요구 충족 가능. 위임·참여자 규칙은 유지해야 함 |
| `touchAll`을 `F:` PK 범위 UPDATE로 변경 | 전체 원장 스캔 제거 | 전체 요구 충족 가능 |
| 팀 화면을 현재 빈 상태로 먼저 제공 | W-8a·워크포스 DB 확장 보류 | **최종 Q146(a)와 일치**. 현 구현도 이 선택을 따름 |

Q142·Q146의 최종 결정 근거는 [requirement.md:72](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/00_input/requirement.md:72)입니다. 현재 범위에서는 `approval.flows`를 제거하기보다 SQL·판정 경로를 단순화하는 편이 적합합니다.

### 10. 배포 전 실측 — **부분, 핵심 관문 미완료**

U-1·U-2·U-7은 작성 창구의 실제 사용 가능성, U-4·U-5는 최종 Q142의 구현 가능성을 결정하므로 필수입니다. V-8·V-9와 실제 열람 판정 SQL 계측도 필요합니다. U-3은 현재 Q146의 빈 팀 데이터 배포를 막는 필수 관문은 아니지만, “다시 읽기” 기능의 실패 처리와 cap 수신은 확인해야 합니다. 근거: [설계서:708](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/01_architect_design.md:708), [백엔드 보고서 §6](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/02_backend_report.md).

## 결함·누락

| 심각도 | 항목 | 수정 지시 |
|---|---|---|
| **P1** | `LINKED_ISSUE.pol`이 명시적 Workforce 잠금을 제거 | 기존 잠금의 엄격도·unavailable 상태를 유지하고, 더 느슨한 값을 거부하거나 무시하십시오. 일반 기본값 완화와 잠금 완화를 설계에서 구분하십시오. |
| **P1** | 캐시된 DIRECT로 연동 전환 후 PUT·DELETE 가능 | 워크포스의 수정·삭제를 서버 경유로 옮겨 실행 시 현재 연동 판정을 다시 확인하십시오. UI 캐시 무효화만으로는 조회와 실행 사이의 경쟁을 닫을 수 없습니다. |
| **P1** | 한쪽 롤백 시 `pol`·`fl` 소실·무시 | 구판 writer의 새 칸 보존 backport 또는 롤백 중 설정 쓰기 중단 절차를 마련하십시오. ctl 재게시 전후와 기존 정책 손실까지 롤백 검증에 포함하십시오. |
| **P1** | 프로젝트 이동 후 예외 목록 범위 불일치 | 목록에서 현재 `meta.projectId === projectId`를 필수로 확인하고, 메타가 없으면 제외하십시오. 이동 이슈와 bulkfetch 실패를 회귀 사례로 고정하십시오. |
| **P2** | 8+2N 상한을 입증하지 않는 테스트 | 실제 `TimesheetAccess`·`TeamScope`·inbound 경로를 연결해 SQL을 계측하십시오. 공유 비용·행별 비용·스키마 cold 비용을 구분해 상한 설명을 고치십시오. |
| **P2** | `touchDocKey` 전체 원장 스캔 | `account_id`의 `F:` 범위와 `doc_key='flows'`로 대상을 제한하십시오. 수정 전후 실행 계획과 처리 행 수를 비교하십시오. |
| **P2** | PM 읽기 전용 표시 미구현 | 프로젝트 PM의 공식 원천을 확정하거나 요구에서 명시적으로 제외하십시오. 권한 프리셋 이름을 사람의 PM 역할로 추정해 표시하지 마십시오. |
| **P2** | 시간대가 다른 이력 필터 경계 | 프리셋 날짜를 서버 판정과 같은 Jira 시간대로 계산하십시오. 자정 전후의 요청·처리 건으로 확인하십시오. |
| **P2** | 필수 번들 검증 증거 없음 | 수정 완료 후 `npm run check:bundle` 결과를 배포 증거에 추가하십시오. Jest 성공만으로 초기화 순환 의존성을 검증했다고 보지 마십시오. |

PM 누락은 W의 [보고서:33](/C:/CloudJira/moves-approval-jira/_workspace/linked-mode-ux/05_workforce_report.md:33)에 명시돼 있습니다. P1 항목은 위 질문별 근거에 연결됩니다. 이번 검토에서 P0로 확정할 결함은 발견하지 못했습니다.

## 권고안

최종 Q142·Q146을 유지하면서 P1 네 항목부터 닫는 것을 권고합니다. 단일 문서의 팀장 예외는 허용하되 **명시적 잠금과 조직 필수 상한은 완화할 수 없도록** 정책 경계를 정하십시오.

배포 순서는 승인 앱의 수신·게시 지원 → 실제 ctl/flows 게시 확인 → 워크포스 화면 활성화가 적절합니다. 이번 구현은 `rms.issue.v2`와 `approval.flows` 토큰을 동시에 게시하므로, 설계의 ④a·④b 분리 배포를 따르려면 토큰 활성화도 분리해야 합니다. 근거: [WorklogControlCtl.js:32](/C:/CloudJira/moves-approval-jira/src/resolver/worklogControl/WorklogControlCtl.js:32).

롤백은 정상 호환 조합으로 취급하지 말고, 설정 쓰기 중단·문서 보존·ctl 대조가 포함된 운영 절차로 다루십시오.

## 배포 전 필수 실측

개발 사이트 `tom-chkim-dev.atlassian.net`에서 다음 최소 집합을 확인하십시오.

| 실측 | 절차·통과 기준 |
|---|---|
| **U-1·U-2·U-7: 넘김 경로** | 패널·마이워크 모달·두 캘린더에서 승인 앱으로 이동합니다. 새 작성 날짜·시간과 기존 기록 id가 정확하고, 경로 누락 시 BLOCKED이며 직접 쓰기가 없어야 합니다. |
| **U-4·U-5: flows 왕복** | 연동 프로젝트의 `F:{projectId}/flows` 게시를 실행하고 원장 오류·프로퍼티·W의 `FLOWS_DOC` 진단을 대조합니다. 팀장이 이름을 보고 선택·저장하고 A가 동일 결재선을 사용해야 합니다. |
| **창구 차단·단독 회귀** | 연동 ON에서 ctl 없음·신뢰 키 없음·조회 거부·경로 없음으로 작성·수정·삭제·drop·기간 입력을 시도합니다. Network상 POST/PUT/DELETE가 0이어야 합니다. OFF·승인 앱 미설치에서는 기존 동작을 확인합니다. |
| **연동 전환 경쟁** | DIRECT로 조회한 모달·캘린더를 유지한 채 이슈를 연동 대상으로 바꿉니다. 즉시 수정·삭제·drop을 시도해 실행 시 서버가 거부하는지 확인합니다. |
| **권한·프로젝트 이동** | 일반 사용자·팀장·앱 관리자·Jira 관리자와 이슈 보안이 다른 계정을 준비합니다. 관리자 목록의 타임시트 범위, 다른 프로젝트 id mutation, 프로젝트 이동 후 예외 목록, 메타 조회 실패를 확인합니다. |
| **정책 잠금·DIVERGED** | 하위 잠금 4시간/팀장 문서 8시간, 한쪽 키 누락, 누적 충돌, 하위 정책 변경을 조합합니다. 잠금은 보존되고 실제 적용값·요약·타임시트 제출 판정이 같아야 합니다. |
| **cap·DELETE 관문** | 워크포스 작성 없이 조회만 해 cap이 게시·수신되는지 확인합니다. cap 미수신·읽기 거부 시 DELETE는 FLAG로 내려가고, 검증된 WORKFORCE 봉투 기록은 삭제 후보가 아니어야 합니다. |
| **양쪽 단독 롤백** | `pol`·`fl`이 있는 상태에서 앱을 하나씩 구판으로 돌립니다. ctl 교체 전후와 s/e/pa 재저장 후 문서·실효 정책·결재선을 비교합니다. |
| **V-8·V-9·실제 SQL 비용** | 종류·기간·프로젝트 필터별 `EXPLAIN`, 충분한 원장 크기의 flows touch, 타임시트 다수·비참여 관리자 조회를 계측합니다. mock 기반 상한 대신 실제 경로의 비용을 기록합니다. |
| **필수 검증·iframe** | 모든 수정 완료 후 백엔드·UI 테스트, `check:bundle`, UI build, `forge lint`를 실행합니다. 실제 iframe의 Log work·예외 모달·옛 URL·이력 내보내기를 확인합니다. |

U-6은 기존 G7 증거가 같은 manifest·진입 경로에 유효하면 재사용할 수 있습니다. W-8a의 실제 팀 게시와 데이터가 채워진 팀 표는 최종 Q146(a)에 따라 후속으로 남길 수 있습니다.