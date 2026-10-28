# transition-approval 검증 리포트 (Phase 5 · 회차 1)

> 작성: integration-verifier · 2026-10-03 · autopilot 무인 회차. forge·git 쓰기 명령 없음, 리포 밖 수정 없음, 소스 수정 없음.
> 기준: `01_architect_design.md`(계약), `02_backend_report.md`·`02_frontend_report.md`(실제 shape 차이 선언), 실제 소스.
> 보고서의 "통과"는 전부 직접 다시 실행했다. 바뀐 파일 목록은 `git status`(미추적 `src/resolver/transition/`·`src/domain/transition/`·`static/ui/src/features/transition/` 등)로 확정했고 보고서 목록과 일치했다.

## 판정: **PASS** (필수 수정 0건)

| 구분 | 수 |
|---|---|
| 통과 | 34 |
| 실패(필수 수정) | 0 |
| 권고 | 6 (R1~R6) — 고치지 않음 |
| 미검증 | X1~X31(기존) — 전부 배포 회차 실측. 이번 회차 신규 X 없음 |
| 새 질문 | Q66, Q67 (`_workspace/QUESTIONS.md` 에 추가) |

## 실행 결과 (직접 실행)

| 명령 | 결과 |
|---|---|
| `npm run merge` | exit 0 — `locales/ko-KR.json`·`en-US.json` 생성. kr/en 전 파일 평탄 키 집합 차이 **0** |
| `npx jest --runInBand`(루트, 백엔드+계약) | **64 suites / 866 tests 통과** (보고 수치와 일치) |
| `npm run test:ui -- --runInBand` | **27 suites / 203 tests 통과** (보고 수치와 일치) |
| `npm run build:ui` | exit 0 — `Compiled with warnings` 3건 전부 node_modules(기준선 동일: @atlaskit source map ENOENT 2, postcss-calc 1). `build/issue.html` 생성, `issue.*.js` 6.28 kB(gz) |

수정이 없어 수정-재검증 루프는 돌지 않았다.

## 경계면 표 (생산자 ↔ 소비자)

`invokeApproval`(`static/ui/src/api/invokeApproval.js:23`)은 `res.success` 확인 후 `res.content ?? {}` 를 돌려준다. 모든 Controller 는 `{ content: <result> }` 를 반환한다. 소비자 중 `.content` 를 한 번 더 읽는 곳 없음(grep 0건).

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getIssueTransitionApprovals` | `TransitionService.js:139-207` `{issue, enforced, notEnforcedReason, targets[], history[]}` | `TransitionApprovalList.jsx:31,73-127`, `TransitionTargetRow.jsx:14-44`, `TransitionRequestForm.jsx:31-34`(`issue.projectId/issueKey/statusName`, `targets[].toStatusId/transitions/flow/canRequest/usability/latest`) | O |
| `createTransitionApproval` | `TransitionService.js:302-308` `{requestId,status,currentStepOrder,toStatusId,usability}` | `transitionApi.js:9-18` 보냄 `{issueId,toStatusId,transitionId?,requestMessage?,expiresAt?,ccKeys?}`(steps·flowId 없음), `modal.jsx:232` `result?.requestId` | O |
| `listTransitionRules` | `TransitionService.js:355-363` | `TransitionRuleSettings.jsx`·`TransitionRuleFormModal.jsx` (`rules[].openCount` 규칙별, `issueTypeId '*'`, `flowMissing`, `statuses[].issueTypeIds`) | O |
| `saveTransitionRule` | `TransitionService.js:420` `{rule}` | `TransitionRuleFormModal.jsx:68` `result?.rule` | O |
| `deleteTransitionRule` | `TransitionService.js:439` `{ruleId,deleted,openCount}` | `TransitionRuleSettings.jsx:179` 확인 문구는 목록의 `rule.openCount`(규칙별) | O |
| `getApprovalDetail`(ISSUE_TRANSITION) | `ApprovalService.js:316-331` → 어댑터 `describe`(`TransitionTargetAdapter.js:87-107`) `target.transition`, describe 실패 시 `snapshotOf` 의 `transition:null` | `ApprovalDetail.jsx:341` `target.transition ?? null` → `TransitionTargetHeader`(null 이면 생략), `modal.jsx:124-131` 재요청은 `target.transition?.toStatusId ?? parseTransitionTargetKey(target.key)` | O |
| `getApprovalCertificate` | `CertificateService.js:44-84` 최상위 `[certificateKey='transition']`, `target` 은 `snapshotOf`(transition null) | `CertificateSheet.jsx:101` `data.transition`(최상위만), `exportCertificatePdf.jsx:32` `data.transition?.consumedBy` | O |
| `listInbox` | `InboxService.js:149-151` 모든 행 `transition`(비전환 null) | `InboxTable.jsx:108`, `exportInboxExcel.js:86` `transitionLabel(null)===null` → 생략 | O |
| `listNotifications` | `NotificationService.js:243-260` `templateKey`(transition 3종) + `transition` | `NotificationPanel.jsx:25-26` | O |
| `decideApproval`/`bulkApprove` | `ApprovalService.js:773-781` `TRANSITION_STATE_CHANGED` + cause | `modal.jsx:100`(승인 경로 재조회), 일괄은 `error.${code}` 문구 | O (반려 경로는 R4) |
| 정책 키 2개 | `SettingsRepository.js:43-44,88-90,112` | `PolicySettings`·`ProjectPolicyModal` | O |

## 점검표

**등록**
- [x] 신규 5개 `guardedDefine`(`TransitionController.js:5-23`) + `PermissionMap.js:142-147` + `index.js:16,53` — 계약 테스트(`test/permission/permissionMap.contract.test.js`) 통과
- [x] 프론트 fn 이름 = 등록 이름(`transitionApi.js` 5개 grep 대조)
- [x] `validateTransition`·`onIssueChanged` 는 resolver 가 아니라 function export(`index.js:27-29`) — manifest `function` 키와 일치

**shape**
- [x] `content` 이중 접근 없음
- [x] snake → camel: `rowToTransition`(`TransitionRepository.js:32-56`), `ruleFromRow`(`TransitionRuleRepository.js:15-27`) — 응답·화면 필드명 일치
- [x] 에러 분기 `error.code`. `TRANSITION_*` 6개 + 사용 코드(`STORAGE_NOT_READY`, `INVALID_APPROVER_CONFIGURATION`, `ALREADY_OPEN`, `CONCURRENT_MODIFICATION`, `INVALID_TARGET`) kr/en `error.json` 존재
- [x] 시각 epoch ms(`fromSqlTimestamp`), 바인딩 `toSqlTimestamp`(insertDraft·arm·consume·rule insert/update)

**불변식**
- [x] 1 scopeKey `TRANSITION:{issueId}:{toStatusId}`(`scopeKey.js` 빌더) → `ApprovalRepository.js:123` `openDedupeKey(target)` UNIQUE. 테스트 `transitions.test.js:304-308`, ALREADY_OPEN 경로 `TransitionService.test.js`. 생성 실패 시 고아 부속 행 정리(`TransitionService.js:296-299`)
- [x] 2 소비는 `transition_request.consumed_at` 사실, `approval_request` 상태 무변경(APPROVED 유지). usability 는 파생(`usability.js`)
- [x] 3 `src/domain` 에 `Date.now()`·`new Date()`·fetch·SQL 없음(grep 결과 주석만). 도메인 transition 파일 전부 순수, 사전도 인자 주입(`messages.js`)
- [x] 4 CAS `rev = rev + 1`: `transition_rule` update(`TransitionRuleRepository.js:129`), `transition_request` arm·consume(`TransitionRepository.js:141,151`). 만료는 엔진 `closeBySystem`/`casAggregate`(`rev = rev + 1 ... AND status='PENDING'`)
- [x] 5 승인자 행 무접촉(전환 코드에 `approval_approver` 쓰기 없음)
- [x] 6 CONSUMED id = `deterministicEventId({requestId, eventType:'CONSUMED', actorKey:null, discriminator:'CONSUMED'})`(`TransitionChangeService.js:52-55`), consume 1행일 때만 + `appendEvent` ON DUPLICATE. 만료 discriminator `${reason}:${contentVersion}`(`transitions.js` `expireByTargetChange`)
- [x] 7 목록: 업무함·알림은 `filterVisibleRows` → 어댑터 `filterVisible`(permissions/check 일괄, 빈 입력 가드 `TransitionTargetAdapter.js:135`). 상세·이력·증명서·결정은 `assertTargetVisible`/`canView`(asUser 이슈 접근)
- [x] 8 asApp 은 `IssueStateReader.issueForValidator`(사유 `transition-validate`)·`statusHistorySince`(`transition-changelog`) 두 곳뿐이고 호출자는 `TransitionValidatorService.js:121,142` 하나. 결과는 판정에만 쓰이고 반환값은 `{result, errorMessage}`(문구에는 payload 의 이슈 키만). 코멘트는 asUser(`TransitionCommentNotifier.js:90`)
- [x] 9 엔티티·이슈 프로퍼티 읽기 없음. 판정은 DB(규칙·부속 행) + Jira 원천 사실(payload·상태·changelog)
- [x] 10 manifest `jira:workflowValidator` 는 `function: transitionValidator` 만(expression 없음)

**권한 범위**
- [x] 같은 데이터(전환 요청)를 내주는 형제: `getIssueTransitionApprovals`(이슈 view 가드), `getApprovalDetail`/`History`/`Certificate`(SELF + 어댑터 canView), `listInbox`/`listNotifications`(건별 permissions/check), `exportExpiredApprovals`(admin) — 전부 이슈 열람 범위 이상
- [x] 읽기/쓰기 대칭: 읽기 이슈 view ↔ 요청 생성 이슈 view + asUser 실행 가능 전환(`TransitionService.js:216-227`), 결정은 canView 재확인 + beforeDecide. 규칙 list/save/delete 모두 `{project:'admin'}`, 수정·삭제 SQL 에 `project_id` 조건(`TransitionRuleRepository.js:130,146`) — 다른 프로젝트 ruleId 는 INVALID_TARGET
- [x] Flow 는 그 프로젝트에 적용된 활성 Flow 만(`availableFlows(projectId)`), 결재선 고정(payload.steps 무시)
- [x] SELF/actor 는 가드가 넣은 `request.principal.accountId`(`requirePrincipal`)
- (팀장 범위: 이 기능 해당 없음)

**프론트·배포 단위**
- [x] 엔트리 `issue` 3곳: `craco.config.js:35` · `static/ui/public/issue.html` · `manifest.yml` `resources[0].entry.issue`. 빌드 산출 `build/issue.html` 확인
- [x] manifest 이슈 모듈: `jira:issueAction` `transition-approval-action`(main/modal), `jira:issueContext` `transition-approval-context`(main/issue, `label`), `jira:issuePanel` `transition-approval-panel`(main/issue, `icon`). main/modal 을 쓰는 issueAction 은 이것 하나(worklog 는 main/worklog) — `resolveModalTarget` 판정 전제 성립. 키 이름은 X18
- [x] i18n: 화면 리터럴 키 전수(정규식 스캔) + 동적 키(`transition.usability.*`, `notEnforced.*`, `consumeSource.*`, `state.expiry.ISSUE_*`, `cert.target.issue_transition`, `inbox.type.issue_transition`, `detail.event.consumed`, `policy.audit.area.transitionRule`, `policy.audit.action.save`) merge 결과 kr·en 모두 존재. 서버 templateKey 3종·`server.validator.*`(REJECT_* 6)·`server.comment.*`(7) 양쪽 존재. 하드코딩 한글/영문 텍스트 노드 없음
- [x] 쿼리키 `transitionKeys` 팩토리만 사용(인라인 배열 0건), `100vh` 없음
- [x] 마이그레이션 `v029_create_transition_rule_table`·`v030_create_transition_request_table` — v028 뒤, 중복·역순 없음, `migrate.test.js` 목록 반영. 프로브: `TransitionRuleRepository.ready()`, `TransitionRepository.ready()`(transition_request + approval_request), validator `isTableReady` 3개(DDL 미실행), 보관 `RetentionRepository.ready()` 가 CHILD_TABLES 전체 확인
- [x] 부속 행 JOIN 컬럼(`commit_state`·`deleted_at`·`is_open`·`current_step_name`·`step_count`·`transition_id`·`target_kind VARCHAR(24)`) 실제 DDL 에 존재
- [x] `manifest.yml` app id 가 `REPLACE-WITH-forge-register` 유지(Confluence id 아님)
- [x] scope 추가 없음 — 코멘트 POST 는 기존 `write:jira-work`

## 권고 (고치지 않음 — 다음 회차 판단)

- **R1 [backend · 우선]** `TransitionRuleRepository.js:56-63` `findByStatus` 의 `LIMIT 500` 이 조용히 잘린다. 회사 관리형 프로젝트는 상태 id("Done" 등)를 공유하므로, 같은 목적 상태에 규칙이 500개를 넘는 사이트에서는 잘려 나간 프로젝트의 전환이 `PASS_NO_RULE` 로 **통과(fail-open)** 한다(`TransitionValidatorService.js:112-115`). 설계 §5.4(주요 쿼리)가 정한 값이라 이번에는 고치지 않았다. 고치는 법: payload 에 `projectId` 가 있으면 `AND project_id = ?` 를 붙이고, 없으면 결과가 상한에 닿았을 때 이슈를 확인한 뒤 `findForProject` 로 다시 매칭한다(상한 도달 = REJECT_UNAVAILABLE 도 가능). 지금 고객 규모(200명)에서는 닿지 않는다.
- **R2 [backend · 제품 결정]** `judge.js:57`/`TransitionValidatorService.js:107` — payload 에 `transition.to.id` 가 없으면 `PASS_NO_ISSUE` 로 통과한다(X21). X1 이 틀리면 강제가 통째로 꺼진다. 이슈는 확인되는데 목적 상태만 없을 때 거부로 바꿀지는 Q66.
- **R3 [backend]** `TransitionTargetAdapter.js:114` `canRequest` 는 "그 목적 상태로 가는 전환이 있는가"만 본다. 그래서 상세(`getApprovalDetail`)의 최신 요청이 쓸 수 있는 승인(USABLE)이어도 `canRequest:true` 가 되고, 재요청 버튼을 누르면 `TRANSITION_ALREADY_APPROVED` 로 막힌다(문구는 정상이라 해는 없다). 상세의 `canRequest` 에 "최신이 USABLE 아님"을 더하면 이슈 화면 목록(`TransitionService.js:199`)과 같아진다.
- **R4 [frontend]** `DecisionForm.jsx:34` 반려 경로는 `TRANSITION_STATE_CHANGED` 를 받으면 문구만 띄우고 상세를 다시 받지 않는다(승인 경로 `modal.jsx:100` 은 다시 받는다). 서버는 이미 요청을 만료시켰으므로 화면이 "결재 중"으로 남는다. `onDone` 호출부나 여기서 같은 무효화를 하면 된다.
- **R5 [backend · 경미]** `TransitionRepository.js:161` `statusNamesFor` 는 LIVE JOIN 없이 최신 부속 행 이름을 고른다. 생성 실패 뒤 고아 행 정리(best-effort)가 실패하면, 그 고아 행의 이름이 같은 대상의 업무함·알림 행 보조 문구로 보일 수 있다(같은 이슈·목적 상태라 이름은 대개 같다). 다른 조회처럼 `LIVE_JOIN` 을 쓰면 일관된다.
- **R6 [frontend · 경미]** 증명서 이력 표의 `reason` 이 원시 값(`TRIGGER`·`LAZY`·`VALIDATOR_CHANGELOG`·`ISSUE_STATE_CHANGED`)으로 찍힌다(프론트 보고서 §9 와 같은 지적). 상세 타임라인의 번역 맵을 재사용하면 된다.

## 미검증

- X1~X31 그대로 유효 — 전부 배포 회차 실측(특히 X1·X21 validator payload, X2 실행 컨텍스트, X3 시간 제한, X8 트리거 changelog, X18 manifest 키, X27·X28 모듈 컨텍스트). `forge lint` 는 금지라 실행하지 않았다(X18 미검증 유지).
- 이번 회차에 새 플랫폼 실측 항목은 없다(R1~R6 은 코드 판단으로 결론이 난다).

## 새 질문 (`_workspace/QUESTIONS.md` 에 추가)

- **Q66** validator payload 에 목적 상태 id 가 없을 때 통과(현행) vs 거부 — 권장: 이슈가 확인되면 거부(fail-closed)
- **Q67** 앱 접근 제한(`restrictAccess`) 사이트에서 명부 미등록자의 전환 승인 요청·조회 — 권장: 이슈 화면 조회·요청 resolver 를 게이트에서 면제(Q22 와 같은 이유)

## 재검증 회차

- 1회차(2026-10-03): 최초 검증. 필수 수정 0건, PASS.
