# linked-mode-ux 검증 리포트 (회차 1)

- 작성 2026-10-13 · integration-verifier
- 기준: `00_input/requirement.md`(**13:16 갱신본 — 끝의 "범위 축소" 절 포함**), `01_architect_design.md`, `02_backend_report.md`(D1~D12), `02_frontend_report.md`(F1~F11), `05_workforce_report.md`(WD1~WD11, Q-WF1)
- 대상: 승인 앱 작업 트리(커밋 전) + 워크포스 작업 트리(커밋 전, 이전 세션 미추적 pptx·png·custom-scopes.yaml·LeaderTeamBackfill.test.js 제외)
- 보고서의 "통과"는 믿지 않고 테스트·빌드를 직접 다시 돌렸다. `git add/commit`·`forge` 미실행.
- 검증자가 직접 고친 것 1건(오타 수준): `src/resolver/worklogControl/WorklogControlContext.js:57` JSDoc 의 삭제된 `channel` 반환 칸 표기 제거(코드 동작 무변경).

## 요약 — 통과 9 / 실패 5 / 미검증 8 / 결정 필요 2

| # | 검증 항목 | 결과 |
|---|---|---|
| 1 | resolver 3단계 등록·축 변경·다른 프로젝트 issueId 우회 | 통과 |
| 2 | 응답 shape ↔ 프론트 소비 | 통과(단 F-3 화면 버그) |
| 3 | 불변식 1~10 | **실패 1건(F-2, 불변식 7 형제 범위)**, 나머지 통과 |
| 4 | 정책 기본값·KVS 키 맵, SQL·마이그레이션 0, idleSqlBudget 숫자 | 통과 |
| 5 | 계약 파일 바이트 동일 | 통과(CRLF 관찰 1건) |
| 6 | 창구 통일 폐쇄성 | 통과(결정 필요 D-1) |
| 7 | 이슈 화면 원칙 | 통과 |
| 8 | URL 호환·엔트리·i18n·감사 i18n | 통과 |
| 9 | 테스트·빌드 | 통과(양쪽 전부 녹색) |
| 10 | 보고서 간 모순 | **실패 1건(F-1 범위 축소 미반영)**, 결정 필요 2건 |

---

## 실패

### F-1 [전 리포] 사용자 "범위 축소"(requirement.md 끝 절, 2026-10-13 구현 후 결정)가 코드에 반영되지 않았다 — 담당: backend · frontend · workforce
요구 갱신: 팀장 승인 설정 표는 이슈별 통제 항목(s/e·pa·fl)만. 기록 규칙 7키(`pol`)는 **팀장 표·계약(`rms.issue.pol`·`ISSUE_POLICY_KEYS`)·일괄 적용·승인 앱 소비(`stricterSetting base`·`linkedWithBase`·`polOpen`)에서 전부 제거**. Q-WF1 = (a) 담당자 팀장만 표시. `rx` 토큰 `rms.issue.v2` 는 `fl` 만 뜻하게, 벡터 재생성.
현재 코드(세 보고서 작성 시점, 요구 갱신 이전)는 `pol` 을 전부 싣고 있다:
- 승인 앱 계약: `src/integration/workforce/contract.js:102`(`ISSUE_POLICY_KEYS`), `:260`(`issuePolicyValid`), `:330`(`nullable(b.pol, issuePolicyValid)`); `vectors.json` v2 벡터(`I:10003`)에 `pol`; `__test__/linkedModeContract.test.js`.
- 승인 앱 소비: `src/domain/linkedIssue/setting.js:9-56`(`stricterPolicy`·`base`·`polOpen`), `src/resolver/worklogPolicy/WorklogPolicyResolver.js:51,60-63`(`linkedWithBase`), `src/domain/worklogPolicy/merge.js:10,39-41`(LINKED_ISSUE 층 `pol` 적용·`LINKED_POLICY_KEYS`), `src/resolver/worklog/WorklogService.js`(`getLinkedIssueOverview.setting.policy`), `src/resolver/worklogPolicy/WorklogPolicyService.js` `listIssueExceptions` 의 `workforce.pol`, D8 테스트들(`setting.test.js`·`IssueExceptions.test.js`).
- 승인 앱 화면: `static/ui/src/features/worklog/LinkedSettingSummary.jsx:20-21`(`setting.policy`), `features/worklogPolicy/IssueExceptionList.jsx:181`(`workforce.pol` 칩), i18n `worklog.linked.summary.policy`.
- 워크포스: `src/integration/approval/issueSetting.js`(`changes.pol`·`issuePolicyValueValid`), `src/resolver/approvalLink/IssueApprovalSettingService.js`(pol 입력 검증·`assertNewFields`), `static/ui/src/pages/projectDetail/issue/approvalBulk.js`(`POLICY_KEYS`·`policyPatch`·분→초), `IssueApprovalBulkModal.jsx`·`IssueApprovalSettingTable.jsx`(기록 규칙 열·7키 입력), `locales/{kr,en}/issueApprovalSetting.json` `policyKey.*`·`policyShort.*`·`unit.*`·`policyPartial` 등.
→ 고치는 방법: (1) 백엔드가 계약에서 `pol`·`ISSUE_POLICY_KEYS` 를 빼고 v2 벡터를 `fl` 만으로 재생성, 소비처(setting·merge·resolver·overview·exceptions)에서 `pol` 경로와 D8 장치를 걷어 낸 뒤 테스트 정리. **주의**: validator 는 모르는 최상위 키를 무시하므로(설계 §0 Q3) `pol` 을 실은 옛 문서가 와도 문서는 유효·`pol` 은 무시된다 — "무시되는지" 테스트 1건 권장. (2) 워크포스가 바이트 복사 후 pol 입력·열·일괄 7키·i18n 제거, `vectors.test.js` 지문·`linked-mode-ux 골든` 단언(`toHaveProperty('pol')`) 갱신. (3) 프론트가 `setting.policy`·`workforce.pol` 표시와 해당 i18n 제거. (4) `CTL_RX` 의 `'rms.issue.v2'` 이름 유지 여부를 백엔드가 결정해 양쪽 주석·AGENTS 에 "fl 만" 으로 적는다. 계약 7파일은 같은 회차에 양쪽 sha256 재대조.

### F-2 [backend] `listAllApprovals` 가 워크로그 사전 승인(WORKLOG_CREATE) 행을 상세·독촉보다 넓게 보여 준다 — 불변식 7(형제 resolver 같은 범위)
- `src/resolver/approval/ApprovalAdminService.js:89` — 타임시트가 아닌 행은 전부 `filterVisibleRows` → 어댑터 `filterVisible` 로 거른다. `WorklogCreateTargetAdapter.filterVisible`(`src/resolver/approval/target/WorklogCreateTargetAdapter.js:38`)은 **이슈 열람만** 본다(업무함용 — 행이 이미 참여자로 좁혀졌다는 전제, 백엔드 "발견 3"이 타임시트 어댑터에 대해 지적한 것과 같은 함정).
- 같은 대상의 상세 열람 `canView`(`:24`)는 이슈 열람 **∧ 참여자(요청자·결재자·위임 대리) 또는 위임자**다. 그래서 관리자(이슈 열람만 가능)는 남의 워크로그 사전 승인 요청의 존재·요청자·상태·대기 결재자를 목록에서 보지만, 제목을 눌러 상세를 열면 거부되고, `sendApprovalReminder`(`:196`, `adapter.canView`)는 `REQUEST_NOT_FOUND` 를 낸다(목록의 [독촉] 버튼이 항상 실패).
- 테스트 공백: `ApprovalAdminService.test.js` 에 WORKLOG_CREATE 케이스 없음.
→ 고치는 방법: `visibility()` 에서 WORKLOG_CREATE 행은 `filterVisible` 통과 후 이미 모은 `approvers`(approversOf)와 `requester_key` 로 참여자 판정 + 위임(`delegationService.activeAmong`)까지 확인하고, 아니면 숨김·`hiddenCount`(타임시트와 같은 방식, Q144 a 의 취지). 다른 종류(ISSUE·TRANSITION·FIELD_CHANGE·WORKLOG_CERTIFICATION)는 `canView` = 이슈(+워크로그) 열람이라 지금과 같다 — 종류별 `canView` 와 `filterVisible` 범위가 같은지 표로 테스트 고정 권장. 설계 §2.1 이 `filterVisibleRows` 만 적은 것이 원인이므로 설계 표도 함께 고친다.

### F-3 [frontend] 이슈 예외 편집 모달에서 결재선을 두 번 저장하면 항상 `WORKLOG_POLICY_CONFLICT`
- `static/ui/src/features/worklogPolicy/IssueExceptionList.jsx:56` — `rev: target.flow?.rev ?? 0` 은 모달을 연 시점의 목록 행 값이다. 저장 성공 뒤 서버 rev 는 +1(또는 해제 시 0)이 되지만 모달은 열린 채 `target` 이 갱신되지 않는다(`:92` 버튼 비활성 비교도 옛 `target.flow.flowId` 기준이라 다시 눌러진다). 두 번째 저장 → rev 불일치 → CONFLICT → 목록만 재조회, 모달의 `target` 은 여전히 낡아 닫을 때까지 계속 실패.
→ 고치는 방법: `selection` 의 `onSuccess(result)` 에서 `result.binding.{flowId, rev}` 를 모달 로컬 상태로 들고 다음 호출·비활성 비교에 쓰거나, 성공 시 모달을 닫는다. 테스트 1건(연속 2회 저장 → 두 번째 payload rev 가 첫 응답 rev).

### F-4 [backend, 낮음] `listAllApprovals` "기간 필수"가 서버에서 강제되지 않는다
- 프론트 F4 는 "코디네이터 지시 '기간 필수'"로 항상 `from/to` 를 보내지만, 서버 `ApprovalAdminService.normalize`(`src/resolver/approval/ApprovalAdminService.js:70`)는 `from`·`to` 생략·한쪽만 허용(무제한 범위). 상한 3660일 검사도 양쪽이 다 있을 때만 걸린다(`historyFilter.dateRangeOf`).
→ 고치는 방법: 기간 필수가 확정 결정이면 `normalize` 에서 `from`·`to` 둘 다 없으면 `INVALID_TARGET`(+ 테스트). 아니면 프론트 보고서 F4 의 근거 문구를 "화면 정책"으로 고쳐 두 보고서를 맞춘다. 리더 확인 필요.

### F-5 [backend, 낮음] `listWorkforceTeams.truncated` 거짓 양성
- `src/resolver/workforce/WorkforceTeamsService.js:42` — 다섯째 페이지가 정확히 200행이면 뒤에 더 없어도 `truncated:true`(문서가 정확히 1,000건인 사이트에서 "잘렸다" 안내).
→ 고치는 방법: 마지막 페이지만 `limit: PAGE + 1` 로 읽어 201번째가 있을 때만 true, 또는 1건 탐침. 경계 테스트 1건.

---

## 결정 필요 (리더)

### D-1 워크포스 연동 스위치 OFF ∧ 서버가 `linked:true` 인 이슈 — 작성은 DIRECT, 수정·삭제는 HANDOFF (WD1 비대칭)
- 워크포스 `static/ui/src/components/worklog/writeChannelView.js` `resolveWriteChannel`(OFF → 무조건 DIRECT) vs `resolveEditChannel`(OFF 라도 `server.linked` 면 HANDOFF). 서버 `createIssueWorklogService` 도 OFF 면 `writeChannelOf` W1 → DIRECT POST.
- WD1 의 근거("스위치 OFF 여도 승인 앱이 통제 중인 이슈를 워크포스가 직접 쓰면 승인 앱 인증·잠금을 우회")는 **작성에도 똑같이** 적용된다. 승인 앱은 이 작성을 `LINKED_DIRECT_WF` 위반으로 사후 관찰한다(`WorklogControlDetector.js:162-165` — 이번에 `linkedInputChannel` 조건이 빠져 연동 이슈의 워크포스 출처 작성은 전부 위반).
- 선택지: (a) 설계 W1 그대로(스위치 OFF = 워크포스는 단독, 승인 앱 신호가 낡아 풀릴 때까지 위반으로 잡힘 — 수용) (b) `resolveWriteChannel`·서버 `creationState` 에서도 OFF ∧ `link.linked` 면 HANDOFF(수정과 대칭). 승인 앱 없는 설치는 `linked` 가 항상 false 라 영향 없음. 검증자 권고 (b).

### D-2 `rx` 토큰 의미 변경(F-1 연동)
- 이미 배포된 적은 없으므로 `rms.issue.v2` 이름을 "fl 만"으로 재정의해도 호환 문제는 없다. 다만 워크포스 WD5(토큰 없으면 저장 전체 거부)·WD7(결재선 열 표시 조건)이 v2 토큰을 pol·fl 둘 다의 게이트로 쓰고 있어, 제거 후 판정 조건을 다시 맞춰야 한다.

---

## 미검증

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| U-1 | 워크포스 `router.navigate` 로 승인 앱 전역 페이지 하위 경로 이동(HANDOFF 실효) | 실측 필요 | 두 앱 설치 개발 사이트에서 패널·마이워크 모달·드래그 토스트 |
| U-3 | 관리자 asUser 로 남의 `movesRms.org` 읽기("팀장 문서 다시 읽기") | 실측 필요 | 팀 탭 → `refreshWorkforceCapabilities` 의 UNREADABLE 수 |
| U-4/U-5 | 승인 앱 asApp 의 `movesApproval.flows` PUT, 워크포스 asUser GET | 실측 필요 | `workforce_publish` `F:*` 행 `last_error_code`, 워크포스 진단 `FLOWS_DOC` |
| U-7 | `getAppContext().appAri/environmentAri` → ctl `ui.globalPagePath` | 실측 필요 | 승인 앱 진단 `HANDOFF_PATH` |
| V-8 | `listAllApprovals`·history 쿼리 인덱스 사용 | TiDB 필요 | 개발 사이트 `EXPLAIN` — `ix_request_retention`·`ix_inbox_open` |
| V-9 | `touchDocKey`(`WHERE doc_key=?`) 전체 스캔 비용 | 운영 행 수 필요 | 원장 행 수 확인, 커지면 `account_id LIKE 'F:%'` 범위 |
| FU-1 | 프로젝트 설정 iframe 안 Atlaskit 모달 높이 | 화면 실측 | 개발 사이트 |
| FU-3 | 내 이력 프리셋(브라우저 날짜) vs 서버 해석(Jira 시간대 D6) 경계 하루 | 시간대 다른 계정 필요 | 1일 경계 데이터로 확인 |

---

## 통과 — 근거

### 1. 등록·축·우회
- 3단계: `getPrincipalContext`(`PrincipalController`), `listAllApprovals`·`sendApprovalReminder`(`ApprovalAdminController`), `listWorkforceTeams`(`WorkforceLinkController`), `listIssueWorklogExceptions`·`lookupProjectIssue`(`WorklogPolicyController`) 모두 `guardedDefine` + `PermissionMap` + 새 컨트롤러 2개 `CONTROLLER_REGISTRARS`(`src/index.js`). `permissionMap.contract.test` 포함 전체 녹색. 프론트 `invokeApproval` 이름이 등록 이름과 일치.
- `selectIssueWorklogApprovalFlow` 축 `{project:'admin', projectIdKey:'projectId'}` 확인. **다른 프로젝트 issueId 우회 차단**:
  - `WorklogApprovalPolicy.select`: 숫자 형식 → asUser `loadIssue(issueId)` 의 `projectId` ≠ payload `projectId` 면 `PROJECT_ISSUE_MISMATCH`(이슈를 못 보면 null → 같은 코드) → 저장·삭제 SQL 은 `issue_id=? AND project_id=?` 조건.
  - `saveIssueWorklogPolicy`(`WorklogPolicyService.saveIssue`): 같은 asUser 소속 대조 후 저장.
  - `lookupProjectIssue`: asUser 키 조회 → `issue.projectId !== projectId` 면 `PROJECT_ISSUE_MISMATCH`, 못 보면 `INVALID_TARGET`(존재 미노출).
  - `listIssueWorklogExceptions`: 후보 id 를 SQL `project_id=?` 로 먼저 줄이고 asUser `filterVisibleIssues` 로 다시 거름(못 보면 `hiddenCount`).
  - 테스트: `WorklogApprovalFlowSelect.test.js`·`IssueExceptions.test.js` 에 MISMATCH 케이스 존재.
  - 권고(실패 아님): 이슈가 다른 프로젝트로 옮겨진 뒤 남은 예외 행은 `meta.projectId !== projectId` 여도 목록에 나온다(`WorklogPolicyService.js:95`). 보이는 정보는 조회자가 원래 볼 수 있는 키·요약뿐이고 편집은 MISMATCH 로 막히지만, 표시에서 빼거나 "다른 프로젝트로 이동됨" 표시가 깔끔하다.

### 2. 경계면 표

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| getPrincipalContext | `PrincipalController.principalContextOf` `{accountId,isAdmin,isJiraAdmin}` | `inbox/usePrincipal.js` `isAdmin === true` | O |
| listAllApprovals | `ApprovalAdminService.listAllApprovals` `{items[],hiddenCount,nextCursor,incomplete}` | `ApprovalAdminPage.jsx:75-` 같은 칸 | O (F-2·F-4 별도) |
| sendApprovalReminder | `{requestId,notified,already}` / `REQUEST_NOT_PENDING`·`REQUEST_NOT_FOUND` | `ApprovalAdminPage.jsx:91-` | O |
| listWorkforceTeams | `WorkforceTeamsService` `{enabled,teams[],orgDocs,refreshCandidates,truncated}` | `WorkforceTeamsSection.jsx:42` | O |
| listIssueWorklogExceptions | `WorklogPolicyService.listIssueExceptions` | `IssueExceptionList.jsx:126-` (`items[].policy/flow/workforce`, `flows`) | O |
| lookupProjectIssue | `{issueId,issueKey,summary,linked}` | `IssueExceptionList.jsx:142-` | O |
| selectIssueWorklogApprovalFlow | `{binding:{issueId,flowId,rev}}` | `IssueExceptionList.jsx:55`, `:162` | O (응답 미사용 → F-3) |
| getIssueWorklogApprovalPolicy | `WorklogApprovalPolicy.view` `{required,selectedFlow,source,managedBy,configRev,reasonCode}` | `WorklogApprovalFlowLine.jsx`, `WorklogTab.jsx:81`, `WorklogDialog`(`selectedFlow.label`) | O — 옛 칸(`options`·`canSelect`·`bindingRev`·`selectedFlowId`) 프론트 소비 0 |
| control.channel 삭제 | `WorklogControlContext.controlView` 칸 없음 | `linkStateOf` 가 `channel` 미참조, LINKED 는 표시용(소비처는 UNAVAILABLE 만 분기) | O |
| listInbox history / getInboxCounts | `normalizeInboxFilters`·history 본인 행·중복 제거 | `InboxPage` + `exportInboxExcel`(같은 서버 필터) | O |
| createWorklogApproval 거부 cause | `WORKLOG_POLICY_INVALID` `{managedBy}` | `missingFlowKey(managedBy)` | O |

- `invokeApproval` 가 `content` 를 벗기며 소비자가 `.content` 를 다시 읽지 않음. 새 에러 코드 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`·기존 `PROJECT_ISSUE_MISMATCH`·`REQUEST_NOT_PENDING` 이 `ErrorCodes` 와 `locales/*/error.json` 양쪽에 있음. 시각은 epoch ms 응답, SQL 바인딩은 `toSqlTimestamp`(searchAll·history).

### 3. 불변식
- 1·4·5: 새 요청 생성 경로 없음. 원장 touch 는 `rev = rev + 1`. 결재자 행 무변경. 결재선 지정 해제는 `approval_approver` 가 아닌 `worklog_approval_binding` 의 rev 조건 DELETE(affectedRows≠1 → CONFLICT).
- 3: `src/domain` 에 `Date.now`·무인자 `new Date()`·SQL·Jira 호출 없음(grep). 새 도메인(`historyFilter`·`flowChoice`·`flowsBody`·`teamsFromOrgs`)은 now·tz 를 인자로.
- 6: 수동 독촉 알림 id = `deterministicEventId({requestId, NOTIFY_REMINDER, recipient, discriminator: reminder:manual:{id}:{step}:{YYYY-MM-DD}})` + `uq_notif` — 하루 1회 결정적. 스윕 독촉은 같은 `reminderRowsOf` 로 id 규칙 무변경(기존 테스트 녹색).
- 7: history 는 본인 actor_key 만. 타임시트 행은 `TimesheetAccess.canView`(Q144 a, 참여자·위임·현재 팀장) — 관리자도 못 보면 `hiddenCount`. 팀 목록은 수신 캐시 `workforce_inbound typ='rms.org'` 만 읽고 Jira 0, 사람 이름은 화면 `resolveUsers`(조회자 asUser). **예외 F-2**.
- 8: 승인 앱·워크포스 diff 에 새 `asApp` 호출 0. flows 게시는 기존 게이트웨이(큐 소비 경로, 응답 미반환). 워크포스 flows 읽기는 asUser(WD8).
- 9: 승인 앱은 `rms.issue.fl` 을 프로젝트 허용 목록(DB)과 다시 대조(`flowChoice`), `listIssueExceptions` 의 워크포스 값은 `status==='VERIFIED' ∧ body.projectId 일치 ∧ !released` 만. 워크포스는 `approval.flows` 를 `verifyEntry`(APPROVAL 계열·`ent{projectId}`·cloud) 통과분만 쓰고, 저장 시 `fl` 을 검증된 목록과 대조(`ISSUE_SETTING_FLOW_INVALID`).
- 10: validator 변경 없음.

### 4. 정책 키·SQL·유휴 예산
- `linkedInputChannel` 이 `SETTINGS_KEYS`·기본값·GLOBAL_ONLY 세 곳에서 같이 빠짐, `SettingsPolicyKeys.test` 녹색, 서버·화면 코드 잔존 참조 0(주석 1건뿐).
- `src/rdb`·`manifest.yml` diff 0, 새 마이그레이션 0. 워크포스 `src/rdb`·manifest diff 0(DB 무증가).
- `idleSqlBudget.test.js`: 기존 상한(미연동 ≤27, 연동 ≤38, 워크포스 연동 유휴 ≤13) 무변경, flows 원천 +0 단언만 추가. 새 scheduledTrigger·consumer 없음. flows touch 는 연동 모드에서만, await(fire-and-forget 아님).
- `npm run check:bundle` OK(순환 import TDZ 없음).

### 5. 계약 파일 (직접 sha256)
| 파일 | 승인 앱 | 워크포스 | 줄끝 |
|---|---|---|---|
| contract.js | `cb3e80c2…916012` | 같음 | 둘 다 LF(인덱스·작업 트리), `.gitattributes eol=lf` |
| vectors.json | `c85d6c77…69adc7` | 같음 | 둘 다 LF |
- 관찰: 승인 앱 **작업 트리**의 `base64url.js`·`canonical.js`·`ed25519.js`·`signature.js` 는 CRLF(인덱스는 LF, `.gitattributes eol=lf` 가 체크아웃 이후 추가된 흔적). LF 정규화 해시는 워크포스와 같다. 커밋 내용 영향 없음. 워크포스 WD11(로컬 대조를 LF 정규화로)은 이 때문이며 정본(지문 표)은 원래 LF 기준이라 수용. 정리하려면 승인 앱에서 `git checkout -- src/integration/workforce/{base64url,canonical,ed25519,signature}.js`(내용 무변경, 줄끝만 LF로).

### 6. 창구 통일 폐쇄성
- 워크포스 쓰기 지점 전수(grep `createWorklog|updateWorklog|deleteWorklog|executeRequest('…Worklog'|method PUT/POST/DELETE`):
  - 작성: 유일 경로 `worklogWrite.createWorklog` → resolver `createIssueWorklog` — 서버 `createIssueWorklogService` 가 `writeChannelOf` 로 HANDOFF(경로 cause)·BLOCKED(`WORKLOG_LINK_UNCONFIRMED`)면 POST 0, 소속 판정 실패 = `target:null` → BLOCKED. 기간 일괄 입력도 같은 함수를 날짜마다 부른다.
  - 수정·삭제: 패널 행(`PanelRecentWorklogs` → `resolveApprovalRowMode` 모르는 값 = BLOCKED, DIRECT 일 때만 `PanelWorklogRowActions`), 마이워크 모달(`onSubmit`·`onDelete` 가 `editChannel !== 'DIRECT'` 면 PUT/DELETE 0, Enter 제출 포함, 조회 실패 `{failed}` → BLOCKED), 마이워크 드래그(`worklogMove.js`), 프로젝트 캘린더 드래그(`worklogDrop.js`) — 둘 다 `checkWorklogMove` 의 `edit === 'DIRECT'` 일 때만 PUT, 판정 실패 BLOCKED(캐시 안 함).
  - 워크포스 서버에는 워크로그 PUT/DELETE 경로 없음(`src` grep).
  - 판정 실패 → 직접 쓰기로 떨어지는 경로: 연동 스위치 ON 에서는 없음. OFF 에서만 조회 실패 = DIRECT(승인 앱 없는 설치 보존, 설계 W1).
  - 서버·화면 `writeChannel.js` 글자 동일(LF 정규화 diff 0, 테스트도 대조).
  - 단독(승인 앱 없음): `plain` 경로(OFF ∧ 승인 앱 신호 없음 ∧ 서명 키 없음)는 이슈 선조회 없이 POST 하나 — 종전과 같음.
- 승인 앱 쪽 연동 이슈 작성 차단 잔존: 없음 — `WorklogControlContext`·`controlView` 에서 `channel` 삭제, `linkStateOf` 가 `channel` 미참조, `WorklogDialog`·`WorklogTab` 은 `UNAVAILABLE` 경고만, `LinkedWorklogPanel` 에 차단 분기 없음, 서버 `src` 에 channel 판정 0.
- 결정 필요 D-1(OFF ∧ linked 작성 비대칭) 별도.

### 7. 이슈 화면 원칙
- 승인 앱 `issueScreenNoPolicyEdit.test.js`(issue·worklog 엔트리 도달 모듈) 녹색. 검증자가 같은 방식으로 **modal 엔트리(이슈 화면이 여는 폼·상세)까지** 도달 모듈 91개를 훑었다 — `selectIssueWorklogApprovalFlow`·`saveIssueWorklogPolicy`·`saveProjectWorklogPolicy`·`saveWorklogApprovalConfig`·`WorklogPolicyPanel`·`IssueExceptionList` 0건.
- 워크포스 이슈 패널(`panel/index.js` 도달 51개)에 `saveIssueApprovalSettings`·`IssueApprovalSettingTable`·`IssueApprovalBulkModal` 0건.
- 읽기 전용 한 줄 i18n: `worklogApproval.flowLine.{selected, source.*, missing.PROJECT_ADMIN, missing.WORKFORCE_LEAD}` kr/en 존재.

### 8. URL·엔트리·i18n
- `tab=done` → `history&role=processed`(`LEGACY_VIEWS`), 설정 › 기록 옛 URL(`setting=audit[&section|&auditTab]`·`data`·`worklogHistory`) → `records`(`recordsSectionOfSetting`), `setting=flows|groups|approvers` 기존 매핑 유지 — `InboxPage.test`·`inboxUrl.test`·`settingsNavigation.test` 녹색.
- 엔트리 추가 없음: `craco.config.js`·`public/*`·`manifest.yml` diff 0.
- i18n: 승인 앱 merge 가 kr/en 키 집합 대조(통과). 변경된 화면 파일의 `t('…')` 정적 키 전부 `ko-KR.json` 에 존재(스크립트 대조, 누락 0). 삭제 키(`worklog.tab.channelWorkforce`·`workforce.inputChannel.*`·`inbox.tab.done`) 참조 0. 감사 `policy.audit.area.worklogApproval`·`policy.audit.action.bindIssue` 존재. 워크포스 merge 는 대칭 검사가 없어 직접 대조 — `issueApprovalSetting`(93/93)·`issuePanel`(66/66)·`setting`(95/95) 대칭.

---

## 실행 결과 (검증자가 직접 실행)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` | 통과(ko-KR·en-US 생성) |
| 승인 앱 | `npm test -- --runInBand` | **178 suites / 2725 tests 통과** |
| 승인 앱 | `npm run check:bundle` | 통과 |
| 승인 앱 | `npm run test:ui -- --runInBand` | **88 suites / 799 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공(경고: 기존 Atlaskit 소스맵 2·react-select CSS 1) |
| 워크포스 | `npx jest --runInBand` | **171 suites / 2361 tests 통과** |
| 워크포스 | `static/ui` `npx jest --runInBand` | **171 suites / 2711 tests 통과** |
| 워크포스 | `CI=true npm run build` | 성공 — app gzip 494,149B / 950,000, **panel gzip 331,252B / 350,000(94.6%, 여유 18.7KB — 다음 패널 변경 때 예산 주의)** |

세 보고서의 숫자와 일치. 검증자 JSDoc 수정은 테스트 실행 뒤라 동작 영향 없음(주석 한 줄).

## 담당별 재작업 목록
- **backend**: F-1(계약·소비 `pol` 제거·벡터 재생성), F-2(WORKLOG_CREATE 관리자 목록 범위), F-4(기간 필수 강제 여부 — 리더 확인 후), F-5(truncated 경계). D-2 토큰 의미 정리.
- **frontend**: F-1(`LinkedSettingSummary` `setting.policy`·`IssueExceptionList` `workforce.pol` 표시·i18n 제거), F-3(편집 모달 rev 갱신).
- **workforce**: F-1(pol 입력·열·일괄 7키·i18n·vectors 단언 제거, 계약 재복사), D-1 결정 시 `resolveWriteChannel`·`creationState` 대칭화.

---

# 재검증 1 (수정 회차 1 반영, 2026-10-13)

- 기준: `requirement.md` "범위 축소"·"수정 회차 1 리더 결정"(D-1·F-4·코덱스 P1·Q140 좁힘), `02_backend_report.md` 수정 회차 1(R1~R9), `02_frontend_report.md` R1-1~R1-5, `05_workforce_report.md` 수정 회차 1(R1-1~R1-3).
- 검증자가 직접 고친 것(오타 수준, 워크포스): `src/utils/errors/ErrorCodes.js:232` 주석의 옛 토큰 `rms.issue.v2` → `rms.issue.fl`, `src/resolver/approvalLink/__test__/ApprovalLinkAdminService.test.js:64` 픽스처 rx 의 `'rms.issue.v2'` → `'rms.issue.fl'`(단언은 `approval.flows` 만 봄 — 동작 무관). 이로써 두 리포 `rms.issue.v2` 잔존 0.

## 요약 — 이전 실패 5건 전부 해소 · 새 실패 0 · 권고 3 · 미검증 4(추가)

| 이전 | 결과 | 근거 |
|---|---|---|
| F-1 범위 축소 | **해소** | 아래 1 |
| F-2 WORKLOG_CREATE 범위 | **해소** | `ApprovalAdminService.visibility` 가 filterVisible 뒤 `worklogCreateParticipant`(요청자·결재자·현재 단계 미결정자의 위임 대리) 판정, 위임은 창당 1회 `delegatorsInWindow`. 상세 `canView` 보다 좁거나 같음(과거 대리 결정자 `decisions.delegateKey` 는 목록에서 빠짐 — 안전 쪽) |
| F-3 편집 모달 rev | **해소** | `IssueExceptionList.jsx:68-75` `saved{flowId,rev}` 를 응답 `binding` 으로 갱신, 다음 호출·비활성 비교에 사용 |
| F-4 기간 필수 | **해소** | `ApprovalAdminService.normalize` 가 `from`·`to` 누락 시 `INVALID_TARGET {field}` |
| F-5 truncated | **해소** | 마지막 페이지만 `PAGE+1` 조회, 넘칠 때만 true |
| D-1 | **반영** | 아래 3 |
| D-2 | **반영** | 토큰 `rms.issue.fl` 로 통일 |

## 1. F-1 잔존 grep (두 리포 src·static/ui/src·locales, 생성물 ko-KR/en-US 제외)
- `ISSUE_POLICY_KEYS`·`polOpen`·`linkedWithBase`·`stricterPolicy`·`LINKED_POLICY_KEYS`·`issuePolicyValueValid`·`setting.policy`·`workforce.pol`: **코드 0**. 남은 것은 "없어야 한다"를 단언하는 테스트(`linkedModeContract.test.js:29` 등)뿐.
- 단어 `pol`: 승인 앱은 주석 2·부정 단언 테스트뿐. 워크포스는 `IssueApprovalSettingService.js:69` "항목에 `pol` 이 오면 `INVALID_TARGET`"(의도된 거부) + 부정 단언 테스트뿐. i18n 에 `pol` 계열 키 없음, `worklog.linked.summary.policy` 삭제 확인.
- 옛 문서 호환: validator 가 모르는 최상위 키를 무시 → `pol` 실린 옛 문서도 유효, 소비 쪽이 읽지 않음(테스트 3곳 고정).
- 계약 해시(직접 sha256): `contract.js` **e09c2534…833c5a**, `vectors.json` **7b746bdc…6a5f51** — 두 리포 일치, 양쪽 인덱스·작업 트리 모두 LF(`eol=lf`).
- 토큰: 승인 앱 `CTL_RX = ['rms.issue','rms.kb','rms.issue.fl','approval.flows']`, 워크포스 게이트 같은 이름. `rms.issue.v2` 잔존 0(위 검증자 수정 2곳 포함).

## 2. 코덱스 P1
### (a) 워크포스 수정·삭제 서버 경유 + 실행 시점 재판정
- 화면 쓰기 지점 전수 grep: `executeRequest('updateWorklog'|'deleteWorklog'|'addWorklog')` **0**, Jira 직접 PUT/DELETE 0. 수정·삭제·드래그는 `worklogWrite.updateWorklog`·`moveWorklog`·`deleteWorklog` → `invoke('updateIssueWorklog'|'deleteIssueWorklog')`, 작성은 `invoke('createIssueWorklog')` 하나. 정적 테스트(`linkedNoDirectWrite.test.jsx:211`)도 고정. 권고: 정적 검사 패턴에 `addWorklog` 도 넣으면(`requestJira.js` 맵에 아직 남아 있음) 재발 방지가 완전해진다.
- 서버 `assertDirectEdit`(`IssueWorklogControlService.js:328-345`): 실행 직전 `loadIssueAsUser` → `lookup.forIssue` → `creationState` → `writeChannelOf` 재판정, HANDOFF → `WORKLOG_EDIT_HANDOFF_REQUIRED{path}`, BLOCKED → `WORKLOG_LINK_UNCONFIRMED`, DIRECT 만 asUser PUT/DELETE. 화면 판정(5분 캐시)이 낡아도 서버가 막는다.
- 단독 설치: 스위치 OFF ∧ 승인 앱 신뢰 키 없음(`lookup.usable===false`)이면 이슈 선조회 없이 요청 하나 — 종전 비용과 같다.
### (b) `listIssueWorklogExceptions`
- `WorklogPolicyService.js:97` — `!visible ∨ !meta.projectId ∨ meta.projectId !== projectId` 면 제외·`hiddenCount`. 이전 권고(이동된 이슈)도 함께 해소.

## 3. 새 규칙 정합
- 연동 이슈 기록 규칙 7키 예외: 서버 `saveIssue` 는 override 에 `approvalMode` 키가 **있을 때만** `WORKLOG_POLICY_MANAGED_BY_WORKFORCE{keys:['approvalMode']}`, 나머지 키는 저장. `mergePolicy({issueLinked})` 는 JIRA_ISSUE 층에서 `approvalMode` 만 무시(`ignored` 기록), 나머지 적용. 프론트 `WorklogPolicyPanel` 은 `managedBy==='WORKFORCE'` 면 `WORKFORCE_MANAGED_KEYS=['approvalMode']` 행 잠금 + 저장 payload 에서 제거(`:110`) → 서버 거부 조건과 정확히 맞물림(옛 저장분 approvalMode 도 저장 시 정리됨).
- 결재선: `select` 는 연동 이슈 값 지정만 거부, `flowId:null` 해제 허용. 연동 행 모달에 결재선 select 없음, 삭제는 해제 호출.
- 에러 문구(kr/en)가 "결재선·작성 기간·사전 승인"으로 좁혀짐 — 프론트 보고서 "남은 것" 1번의 우려는 백엔드 R3 에서 이미 해결.
- 작성 기간(s/e): 승인 앱 이슈 예외 키에는 날짜 범위 칸이 없어(7키 + approvalMode 등) 충돌 지점 없음.
- D-1 ↔ `LINKED_DIRECT_WF`: 워크포스 `writeChannelOf` 는 서명 검증된 통제 문서가 있으면 스위치·소속 무관 HANDOFF(경로 없으면 BLOCKED) — 서버·화면 두 파일 글자 동일(LF diff 0). 따라서 승인 앱 연동 이슈(=ctl 게시 대상)에 워크포스 출처 작성이 생기는 경우는 구버전 번들·직접 REST·ctl 게시 지연 구간뿐이고, 그것을 `LINKED_DIRECT_WF` 로 잡는 것은 설계 의도와 같다. 모순 없음. 남는 틈은 아래 미검증 R-U3.

## 4. 워크포스 신규 resolver 2개
- 3단계: `ApprovalLinkController.js:14-15` `guardedDefine` + `PermissionMap.js:426-427` `'SELF'` + 기존 `registerApprovalLinkController`(`src/index.js:96`). 전체 jest 녹색.
- 작성자 본인 판정: **서버에 명시적 작성자 대조는 없다.** PUT/DELETE 는 호출자 asUser 로 나가므로 Jira 권한(Edit/Delete own worklogs·all worklogs)이 그대로 관문이다 — 종전 화면 직접 호출과 권한 범위가 같아 **권한 상승은 없다**(통과). 다만 "Edit all worklogs" 권한자는 이 resolver 로 남의 기록을 고칠 수 있다(종전에도 REST 로 가능). 화면은 본인 행에만 버튼을 그린다. 권고 R-1: 앱 정책상 본인 것만 허용하려면 `assertDirectEdit` 의 이슈 조회와 함께 `GET worklog/{id}` 의 `author.accountId === principal` 를 확인(호출 +1). 리더 판단.

## 권고 (실패 아님)
- R-1 위 4 작성자 대조(워크포스).
- R-2 워크포스 정적 검사에 `addWorklog` 포함(워크포스).
- R-3 패널 번들 gzip 예산 사용률 94.7% 유지 — 다음 패널 변경 전에 여유 확보 검토(워크포스).

## 미검증 (추가분 — 기존 U-1·U-3·U-4/5·U-7·V-8·FU-1 은 그대로)
| # | 항목 | 확인 방법 |
|---|---|---|
| R-U1 | Jira `PUT/DELETE /issue/{A}/worklog/{id}` 에서 워크로그가 다른 이슈 B 소속이면 Jira 가 거부하는가 — 거부하지 않으면 비연동 이슈 A 를 넣어 연동 이슈 B 의 워크로그를 재판정 없이 고칠 수 있다(재판정은 A 기준). 문서상 404 가 예상되지만 실측 전 | 개발 사이트에서 이슈 불일치 PUT 시도. 거부 안 되면 `assertDirectEdit` 에 `GET issue/{A}/worklog/{id}` 소속 확인 추가 |
| R-U2 | 실행 시점 재판정의 지연(수정·삭제마다 이슈 GET + 통제 문서 조회) | 연동 사이트에서 드래그·저장 체감 |
| R-U3 | 승인 앱 연동 판정(rms.policy)과 ctl 게시 사이 지연 구간 — 스위치 OFF 워크포스는 DIRECT 로 작성, 승인 앱은 `LINKED_DIRECT_WF` 로 관찰 | 연동 직후 게시 주기 실측 |
| R-U4 | Forge `view.getContext().timezone` 실제 채움(프론트 R1-3) | 개발 사이트 |

## 실행 결과 (재검증 1, 검증자 직접 실행)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` | 통과(kr/en 키 대칭) |
| 승인 앱 | `npm test -- --runInBand` | **179 suites / 2723 tests 통과** |
| 승인 앱 | `npm run check:bundle` | OK |
| 승인 앱 | `npm run test:ui -- --runInBand` | **88 suites / 808 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공(서드파티 경고만) |
| 워크포스 | `npx jest --runInBand` | **171 suites / 2367 tests 통과** (검증자 픽스처 수정 파일 단독 재실행 14/14 통과) |
| 워크포스 | `static/ui` `npx jest --runInBand` | **171 suites / 2712 tests 통과** |
| 워크포스 | `CI=true npm run build` | 성공 — app gzip 494,322 / 950,000, panel gzip 331,300 / 350,000(94.7%) |

- 화면 정적 i18n 키 대조(승인 앱 변경 파일): 누락 0. 워크포스 `issueApprovalSetting`(66/66)·`issuePanel`(66/66)·`setting`(95/95) kr/en 대칭.
- `src/rdb`·`manifest.yml`·craco·`public` diff 0(두 리포), `idleSqlBudget` 상한 숫자 무변경.

## 잔여 (담당별)
- **backend**: 실패 없음.
- **frontend**: 실패 없음.
- **workforce**: 실패 없음. 권고 R-1(작성자 대조 여부 — 리더 판단), R-2(정적 검사에 `addWorklog`), R-3(패널 번들 여유). 미검증 R-U1(이슈 불일치 PUT 실측)이 거부되지 않으면 `assertDirectEdit` 보강 필요.
