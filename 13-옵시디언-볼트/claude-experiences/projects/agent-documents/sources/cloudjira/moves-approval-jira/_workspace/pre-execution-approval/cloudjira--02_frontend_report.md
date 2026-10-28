# 워크로그 사전승인 프론트 구현 보고

2026-10-06. `.claude/agents/frontend-engineer.md`와 `.claude/skills/forge-frontend-dev/SKILL.md`, `02_backend_report.md` 실제 계약을 기준으로 구현했다. 기존 미커밋 변경·sidebar/lazy 최적화·root의 PrincipalResolver 수정은 보존했다. 백엔드·manifest·scope·마이그레이션·가이드 문서는 수정하지 않았다.

## 사용자 동선

1. 기존 프로젝트 설정 화면의 **워크로그 생성 사전승인**에서 필수 여부, 허용 Flow(최대20개), 자동 적용 기본 Flow를 저장한다. 기존 Flow를 재사용하며 별도 preset 페이지나 Jira custom field를 만들지 않았다.
2. 기존 Moves Approval 이슈 패널과 워크로그 탭의 **워크로그 승인 결재선**에서 허용 Flow를 선택한다. 서버 default가 이미 선택되어 있으면 매번 선택하지 않는다. 상태 전환의 결재선은 기존 프로젝트 SQL 전환 규칙에서 자동 적용된다는 설명을 함께 표시한다.
3. required 생성 editor의 버튼은 **승인 요청**이다. 입력안·결재선 표시와 승인 전 미등록/승인 후 요청자 본인 등록/외부 경로 범위를 저장 전에 안내한다. required=false 및 수정은 기존 Jira 즉시 쓰기 안내다. 생성 policy가 없거나 실패/invalid이면 UI를 차단한다. 탭에서도 policy가 준비되지 않으면 새 입력 버튼을 비활성화한다.
4. 기존 워크로그 탭에 **내 워크로그 승인 요청 · 등록 현황** 목록을 추가했다. 승인 상태와 등록 상태를 별도 열에 표시하며 50건 cursor로 이어 본다. 본문 comment는 목록에서 요청하지 않는다. **상세 · 등록**에서 기존 승인 모달을 연다.
5. WORKLOG_CREATE 상세는 서버 immutable 원본 설명/시간/Flow와 ledger 상태를 보여 준다. `canApply===true`일 때만 **승인된 기록 등록** 버튼을 표시한다. UNKNOWN/APPLYING의 **등록 결과 대조**는 현재 Forge context accountId가 entry.requester와 일치할 때만 보인다. 실행 입력은 requestId만 전달한다.
6. UNKNOWN 대조는 숫자 nextCursor로 이어 받으며 manualReviewRequired에서는 추가 실행을 막고 수동 확인을 안내한다. complete=true도 미실행 증거로 해석하지 않는다. 자동 POST·자동 APPLIED·같은 내용 새 상신을 제안하지 않는다. WORKLOG_CREATE에는 일반 이슈 재상신 버튼을 제공하지 않는다.

## 실제 resolver 소비

`invokeApproval`이 content를 벗긴 값을 사용한다.

| 화면 | resolver와 소비 값 |
|---|---|
| WorklogApprovalConfig | getWorklogApprovalConfig → config/availableFlows[id,label], saveWorklogApprovalConfig → 현재 config.rev와 required/allowedFlowIds/defaultFlowId |
| WorklogApprovalPolicyPanel | getIssueWorklogApprovalPolicy → policy, selectIssueWorklogApprovalFlow → issueId/flowId/현재 bindingRev |
| WorklogDialog | getWorklogEditorContext.approvalPolicy, createWorklogApproval → {entry}; issueId/clientIntentId/started/timeSpentSeconds/comment만 전달 |
| MyWorklogApprovals | listMyWorklogApprovals → entries,nextCursor,hasMore; snapshot은 started/seconds만 |
| WorklogApprovalEntry | getWorklogApprovalEntry → entry,canApply; applyApprovedWorklog → entry,optional worklog; reconcileApprovedWorklog → entry,reconciliation |
| CertificateSheet | 최상위 worklogCreate.started/timeSpentSeconds/comment/flowLabel/applyStatus/worklogId; target.worklogCreate나 entry.snapshot을 혼용하지 않음 |

clientIntentId는 secure crypto UUID다. 같은 입력안 재시도에서는 동일 ID를 보존하고 입력 내용 변경에는 새 ID를 사용한다. 요청 생성 실패를 createWorklog로 우회하지 않는다. WORKLOG_CREATION_PENDING은 다시 제출할 수 없게 표시하여 자동 재생성을 막는다. 성공 요청 뒤 onDone은 `{changed:false,approvalRequested:true,requestId}`로 반환하여 Jira 즉시 등록과 구분한다.

## 공통 연결과 최적화

- worklogApprovalKeys의 all/policy/mine/entry/config factory를 추가했다. 정책·선택 변경 시 policy/editor/entry를 함께 무효화하고 등록 후 worklog/history/approval/inbox/notification 결과를 갱신한다. modal 완료와 issue modal 종료에도 새 key를 무효화한다.
- InboxTable/exportInboxExcel/CertificateSheet에 WORKLOG_CREATE kind label을 추가했다. 업무함의 제공 metadata는 시간 요약에 사용하며 comment를 표시하지 않는다. 알림은 종류를 제목에 포함하고 metadata가 없는 경우 0분/가짜 시각을 만들지 않는다.
- 신규 대형 페이지/Forge resource는 없다. 상시 이슈 selector는 native select/label을 사용해 무거운 Atlaskit form import를 추가하지 않았다. 기존 설정 11개 lazy와 NotificationPanel lazy를 유지했다.
- 좁은 화면 sidebar는 matchMedia로 처음/resize 시 접힘 상태를 맞추고 CSS의 실제 폭/label 숨김은 collapsed class만 따르게 고쳤다. 따라서 좁은 화면에서도 사용자가 실제로 펼칠 수 있으며 aria-expanded와 화면 상태가 일치한다. window/matchMedia 없는 경우를 가드하고 change listener를 해제한다.

## 번역과 실제 라벨

kr/en worklogApproval namespace를 동일 key로 추가하고 기존 inbox.type.worklog_create와 cert.target.worklog_create를 추가했다. error namespace는 백엔드가 추가한 계약을 그대로 사용한다.

| 한국어 | 영어 |
|---|---|
| 워크로그 생성 사전승인 | Worklog creation preapproval |
| 워크로그 승인 결재선 | Worklog approval flow |
| 자동 적용할 기본 결재선 | Default flow applied automatically |
| 승인 요청 | Request approval |
| 승인된 기록 등록 | Register approved worklog |
| 등록 결과 대조 | Compare registration results |
| 대조 계속 | Continue comparison |
| 상세 · 등록 | Details · registration |
| 내 워크로그 승인 요청 · 등록 현황 | My worklog approvals · registration status |

## 검증

- `npm.cmd run merge`: 성공. 한·영 key 일치, 생성물 재생성.
- 관련 최종 UI: **8 suites / 52 tests 모두 통과**, 종료 코드 0, 10.02초. 로그 `frontend-final-test.log`.
- 신규 회귀: config rev/allowlist/default 저장, 기본 Flow 재선택 없음과 bindingRev 선택, required editor 직접 생성0/동일 intent 재시도/입력변경 새 intent, policy 누락 fail-closed, CREATION_PENDING 추가 생성0, approved entry 원본과 requestId-only 등록, UNKNOWN 재POST0/수동 확인, 남의 UNKNOWN 버튼 없음, 증명서 원본/등록 상태 분리, 좁은 sidebar 실제 펼침 및 listener cleanup.
- 기존 WorklogTab/IssueApprovalOverview 테스트는 신규 정책 query와 Heading 의존성을 반영했다. 기존 워크로그·이슈·증명서·업무함·알림 테스트를 함께 실행했다.
- `git diff --check -- static/ui/src locales/kr locales/en`: 오류 없음. 작업 트리의 기존 CRLF 안내 warning만 출력됐다.
- 테스트 후 알림 제목 구분자를 정상 middle dot으로 정리하고 modal/issue 완료의 새 query key 무효화 및 WORKLOG_CREATE 일반 재상신 버튼 제한을 추가했다. 리더의 최종 전체 검증에서 통합 확인한다.
- 전체 UI 재실행·build·Forge lint·배포·커밋은 하지 않았다.

## 미검증

실제 Jira iframe에서 프로젝트 설정/selector/editor/본인 등록/UNKNOWN 상태를 연결한 조작과 light/dark 시각 QA, 실제 Jira author 보존 및 POST property 지원, SQL 마이그레이션은 리더의 통합 검증 대상이다. 알림의 새 종류 시간 metadata는 백엔드가 제공하는 경우만 표시하며 없는 경우 종류 표시만 한다. 커스텀 필드와 모든 외부 워크로그 경로 차단 기능은 구현하지 않았다.

## Claude 검토 프론트 보완

- 설정 조회의 `{config,availableFlows,projectEnabled}` 중 projectEnabled=false이면 전역 ‘적용 프로젝트’에서 활성화해야 필수 정책이 유효하며 프로젝트 관리자가 해결할 수 없으므로 사이트 관리자에게 요청해야 한다고 경고한다.
- 설정 정보 메시지에 Jira 설정 → 시스템 → 시간 추적에서 Moves Approval 제공자 선택이 필요하고, 미선택 시 기본 입력 화면은 사전승인으로 차단되지 않는다고 한·영으로 명시한다. 제공자의 현재 선택을 자동으로 확인한다는 표현은 사용하지 않는다.
- 공용 `applyStateKey(entry)`를 목록·상세·증명서에 적용했다. WAITING+PENDING/null은 ‘승인 후 등록 가능’, WAITING+REJECTED/EXPIRED/CANCELLED는 ‘등록 대상 아님’, WAITING+APPROVED는 기존 ‘등록 대기’다. UNKNOWN/APPLIED 등 실제 실행 상태는 승인 상태와 관계없이 그대로 표시한다.
- 목록의 현재 제목은 **내 워크로그 승인 요청 · 등록 현황 / My worklog approvals · registration status**다. 앞의 ‘등록 예정’ 명칭은 이 제목으로 대체한다.
- 승인 완료 알림의 종류별 문구는 이번에 변경하지 않았다. 공통 이벤트 template를 종별로 분리하면 backend 및 다른 대상의 계약까지 바뀌므로 후속 검토 대상으로 남긴다. 요청자의 상세/설정 안내에는 승인 후 본인 등록 단계를 명시한다.
- 회귀는 프로젝트 비활성/제공자 선택 고지, 승인·실행 상태 조합 8개, 반려 증명서 WAITING 오해 방지를 추가했다. **2 suites / 19 tests 모두 통과**, 42.343초. `npm.cmd run merge`도 성공했다. 로그는 `frontend-claude-remediation-test.log`다. build/Forge/배포/커밋은 수행하지 않았다.
