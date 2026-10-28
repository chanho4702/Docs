# status-rule-kvs — 검증 리포트 (회차 1)

> integration-verifier · 2026-10-21 · 입력 `00_input/requirement.md`, `01_architect_design.md`(계약 기준), `02_backend_report.md`(2회차), `02_frontend_report.md`(1회차), `04_spike_todo.md`, 실제 소스·`git status`/`git diff`
> 코드 수정 없음. git·forge·stash 명령 실행 안 함(읽기 전용 `git status`·`git diff` 만).

## 요약  통과 27 / 실패 1 / 미검증 12

실패 1건은 불변식 8 ⓓ 위반(결재자 열람 asApp 조회 오류를 "허용"으로 처리)이다. 전환이 통과되는 경로는 아니고, 자동 요청이 결재자 열람 확인 없이 만들어질 수 있는 문제다. 설계 B6 이 그렇게 정했으므로 리더가 결정한 뒤 백엔드에 돌려야 한다.

## 실패

### F1. 결재자 이슈 열람 asApp 조회의 오류·비정상 응답을 "통과"로 처리 — 불변식 8 ⓓ 위반 (담당: backend, 설계 B6 수정 동반)

- 위치
  - `src/resolver/transition/IssueStateReader.js:200-213` `approverCanViewForValidator` — `status !== 200`·배열 아님·예외 → `null`
  - `src/resolver/transition/TransitionAutoRequestService.js:199-202` — `.catch(() => null)` 후 `result === false` 만 거절, `null` 은 통과
  - `AGENTS.md` 보안 4번의 새 문단(42행 부근) "오류 null = 엔진 규칙대로 통과"
  - 설계 `01_architect_design.md:16` B6 "null(응답 못 받음) → 엔진 규칙대로 통과"
- 무엇이 어긋나나
  - `CLAUDE.md` 불변식 8 의 asApp 타 사용자 권한 조회 조건 ⓓ: "응답이 정확히 그 한 사람일 때만 허용, **빈 목록·오류·시간 초과는 거부**". 이 경로는 빈 목록만 거부하고 오류(400/401/403/404 허용 상태, 예외)는 허용한다.
  - 설계가 근거로 든 "엔진 규칙(`ApprovalService.assertApproversAllowed:585`)"은 **asUser** `userCanView` 에 대한 규칙이다. asApp 으로 다른 사용자를 조회할 때는 ⓓ 가 우선한다. 설계가 따른다고 한 워크로그 선례 `src/resolver/worklogCertification/AutomaticApproverAccess.js:8-21` 는 오류를 `false`(거부)로 돌려준다. 같은 API·같은 성격의 경로인데 의미가 반대다.
  - 실측 미검증 A4(validator 안에서 asApp `user/viewissue/search` 가 200 인가)와 겹치면 문제가 커진다. 실제로 403 등이 오면 **모든 결재자 열람 확인이 아무 로그 없이 통과**하고, A4 실측으로도 실패를 알아챌 수 없다(`APPROVER_ACCESS` 로 빠지지 않으니 "성공"처럼 보인다).
- 재현(단위 수준)
  - `TransitionAutoRequestService` 에 `reader.approverCanViewForValidator = async () => null`(또는 `requestAsApp` 이 `{status:403, body:{}}` 를 돌려주게) 주입 → 정책 `approverAccessCheck` 켬 상태에서 `tryCreate` → `createRequest` 1회, `REJECT_AUTO_REQUESTED`. ⓓ 대로라면 생성 0회, `auto APPROVER_ACCESS` 여야 한다.
- 고치는 방법
  1. `TransitionAutoRequestService.prepare` 에서 `result !== true` 이면 `Skip(AutoSkip.APPROVER_ACCESS)` 로 거절한다(null 포함). 후퇴값은 기존 `REJECT_NO_REQUEST` 라 전환 판정은 그대로 안전하고, 사용자는 수동 요청(asUser 열람 확인 경로)으로 갈 수 있다.
  2. `IssueStateReader.approverCanViewForValidator` 주석과 `AGENTS.md` 해당 문단을 "오류·시간 초과 = 거부(자동 요청 안 함)"로 고친다.
  3. 설계 B6·§6.2 문장을 고치고, `TransitionAutoRequestService.test.js` 에 "열람 조회 null/403 → 생성 0·`APPROVER_ACCESS`" 케이스를 넣는다.
  4. `04_spike_todo.md` A4 의 "그 밖 → null(통과)" 메모를 고친다.

## 관찰 (실패 아님 — 리더 판단용)

- O1. 결재자 명부 조회 실패 시 명부 검사 생략 — `TransitionAutoRequestService.js:192` `registryLoader().catch(() => [])` → 빈 배열 = 제한 없음. 엔진 `ApprovalService.js:576` 과 같은 동작이지만, 이 파일 머리 주석의 원칙("모르면 안 만든다")과는 반대 방향이다. F1 을 고칠 때 같이 "조회 실패 → `APPROVER_ACCESS`"로 맞추는 것을 권한다.
- O2. 기능 스위치 조회 실패 시 켬으로 간주 — `TransitionValidatorService.js:124-125`. 판정이 거부(강제) 쪽으로 가는 것은 Q53 대로 맞지만, 그 상태에서 자동 요청까지 만들어진다. KVS 장애면 색인 읽기도 실패해 `REJECT_UNAVAILABLE` 로 끝날 가능성이 높아 실제 영향은 작다.
- O3. `stepsFromSnapshot`(`TransitionAutoRequestService.js:55-60`)은 엔진 `ApprovalService.js:546-550` 과 달리 그룹 단계에 `displayName` 을 싣지 않는다. `normalizeSteps`·`ApprovalRepository` 는 이 값을 쓰지 않아(grep 0건) 지금은 영향 없다.
- O4. `listForIssue` 의 `autoRequested` 는 "REQUESTED 이벤트 actor_key IS NULL"로 판정한다. 개인정보 처리 경로(`PersonalDataRepository.js:20` `approval_event.actor_key`)가 actor_key 를 NULL 로 지우는 방식이라면, 지운 계정이 수동으로 올린 요청도 "자동 요청" 배지가 붙는다. 처리 방식(행 삭제인지 NULL 처리인지)은 확인하지 못했다. 표시 문제일 뿐이다.
- O5. 새 테스트 `src/permission/__test__/accountHasAppAccess.test.js` 는 git 에 추적되지 않은 상태(`??`)다. 다른 새 파일은 `A`(스테이징)다. 커밋할 때 빠뜨리지 않아야 한다. `docs/` 아래 변경·미추적 파일은 커밋 금지 규칙 대상이다.

## 미검증

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| K0 | 엔티티 `transition-rules` 추가가 major 인가 | 배포 필요(forge 금지) | `forge deploy -e development` 출력 |
| K1 | `kvs.transact()` 다중 키 조건부 set(최대 11 op)의 원자성과 한도 | 실측 필요. 기본 모드가 TRANSACT 라 **"색인 ⊇ 원본" 보장이 이 실측에 걸려 있다** | 스파이크(04 K1). 실패하면 `INDEX_WRITE_MODE` 를 ORDERED 로 |
| K1-b | 다중 op 조건 실패 오류 코드가 `CONDITIONAL_CHECK_FAILED` 인가 | 실측 필요 | 같은 스파이크. 다르면 경쟁 대신 오류로 보고 UNKNOWN_ERROR(통과 경로는 아님) |
| K2 | 엔티티 쓰기 직후 다른 컨테이너 읽기 일관성 | 실측 필요 | 저장 1초 안에 전환 21 시도 |
| A1 | payload `user` 하위 필드 | 실측 | `[VALIDATOR] shape` 로그 |
| A2 | Automation 실행자 accountType | 실측 | 04 A2 |
| A3 | validator 시간(1500/1200/2200ms 상수) | 실측 | 04 A3 |
| A4 | asApp viewissue 결재자 조회가 validator 안에서 200 인가 | 실측. **F1 을 고치기 전에는 실패해도 드러나지 않는다** | 04 A4 |
| A5 | 거부 문구(두 줄) 표시 | 화면 실측 | 이슈 화면·보드 드래그 |
| A6 | 앱 미사용 계정의 자동 적용(offline impersonation) | 실측 | 04 A6 |
| V1·V2 | 검사 호출 관찰 표시 | 실측 | 04 V1·V2 |
| S1~S5 | 흐름 실측(규칙 없음 통과 → 자동 요청 → 재시도 → 승인 → 자동 적용) | 기능 켜기는 사용자 확인 후 | 04 흐름 표 |

## 통과

### 경계면 표 (`invokeApproval` 가 `content` 를 벗긴 값 기준)

| resolver | 생산자(파일:라인, 반환 shape) | 소비자(파일:라인, 접근 경로) | 일치 |
|---|---|---|---|
| `listTransitionRules` | `TransitionService.js:427-460` `{project, globalEnabled, projectEnabled, featureEnabled, rules:[RuleView], issueTypes, statuses, flows[{flowId,name,enabled,autoRequestCapable}], projectDefaults{autoRequest}, setup{completed,completedAt}, template{flowId,autoRequest}, gen, limits{rules,setupStatuses}}` | `TransitionRuleSettings.jsx`(`view.projectDefaults.autoRequest`·`rules`·`setup`), `transitionModel.js`(`shouldShowSetup`=`setup.completed`+`rules.length`, `setupStatusLimit`=`limits.setupStatuses`, `templateFlowId`=`template.flowId`∈`flows`, `defaultSetupStatusIds`=`statuses[].categoryKey`), `TransitionProjectSetup.jsx:34-35,140` | 일치 |
| RuleView | `TransitionService.js:363-394` `autoRequest`(bool\|null)·`autoRequestEffective`·`autoRequestBlockedReason`(null\|GROUP_FLOW\|FLOW_MISSING)·`validatorSeenAt`·`updatedBy:null` | `transitionModel.js` `autoRequestLabelKey`·`autoRequestWarningKey`(실효 켬일 때만 경고), `TransitionRuleSettings.jsx:146-152`. `updatedBy` 표시 없음 | 일치 |
| `saveTransitionRule` | 입력 `autoRequest` true\|false\|null\|undefined(`TransitionService.js` `autoRequestInput`), 응답 `{rule}` | `transitionApi.js` undefined 일 때만 키 생략·null 은 전송, `TransitionRuleFormModal.jsx:82` 편집 무변경이면 undefined | 일치 |
| `deleteTransitionRule` | 무변경 `{ruleId, deleted, openCount}` | 기존 | 일치 |
| `saveTransitionProjectDefaults` | `TransitionService.js` `{projectDefaults:{autoRequest}, gen}` | `TransitionRuleSettings.jsx:58,269` `result.projectDefaults` 병합 후 재조회 | 일치 |
| `setupTransitionProject` | `{rules(프로젝트 전체), created, skipped[{toStatusId,reason}], projectDefaults, setup}`, `issueTypeId` 생략·''·null=`'*'` | `transitionApi.js`(issueTypeId 비면 생략), `TransitionRuleSettings.jsx:216-228` `rules`·`projectDefaults`·`setup`·`skipped.length` | 일치 |
| `saveApprovalSettings`/`getApprovalSettings` | `SettingsService` 검증 `statusChangeTemplateFlowId`(''\|UUID)·`statusChangeTemplateAutoRequest`(bool), 기본값 `''`/`false` | `IssueApprovalSettings.jsx` 키 하나씩 patch, '선택 안 함' = `''` | 일치 |
| `getIssueTransitionApprovals` | `TransitionService.js` `summaryOf.autoRequested`(`TransitionRepository.listForIssue` EXISTS 열, SQL 수 무변경) | `AutoRequestedBadge`·`TransitionApprovalList`·`StatusChangeApprovalCard`·`TransitionTargetRow` | 일치 |
| validator 문구 | `TransitionValidatorService.js:101-111` vars `{statusName}`(규칙 저장값) → `server.validator.REJECT_AUTO_REQUESTED(_NONAME)` | Forge 표시(A5 미검증) | 키 존재 |
| apply 코드 | `TransitionOfflineGateway.preflight` → `TRANSITION_AMBIGUOUS`, `applyPlan.js` canRetry 제외 | `TransitionApplyPanel` `transitionApply.code.${code}` | 일치 |

### 점검표

**등록**
- [x] 새 resolver 2개 — `TransitionController.js:28-34` guardedDefine, `PermissionMap.js:213-214` `{project:'admin', projectIdKey:'projectId'}`, `src/index.js:75` `registerTransitionController`(기존). 계약 테스트 통과
- [x] 프론트 `invokeApproval` 이름 = 등록 이름(`saveTransitionProjectDefaults`, `setupTransitionProject`)

**shape**
- [x] 소비자가 `.content` 를 다시 읽지 않는다
- [x] 오류 분기는 `error.${code}` — `TRANSITION_RULE_LIMIT` 이 `ErrorCodes`·`locales/{kr,en}/error.json` 에 있다
- [x] 시각 epoch ms(`validatorSeenAt`, `setup.completedAt`, `updatedAt`). SQL 시각 바인딩 신규 없음

**불변식**
- [x] 1 — 자동 요청도 `ApprovalRepository.createRequest`(dedupe UNIQUE). `ALREADY_OPEN` → `REJECT_PENDING` + `deleteOrphan`(`TransitionAutoRequestService.js:253-258`). 테스트 있음
- [x] 3 — `src/domain/transition` 에 `Date.now`·`new Date()` 0건. 새 도메인 함수는 KVS·Jira 호출 없음
- [x] 2·4·5·6 — 엔진 무변경. `applyUpdate` 에 `transition_id/name` 열만 추가(기존 UPDATE 에 합침)
- [x] 7 — 규칙 쓰기 키는 서버가 `p:{가드가 본 projectId}` 로 고정, 다른 프로젝트 ruleId 는 NOT_FOUND → `INVALID_TARGET`. 결재선은 `availableFlows(projectId)` 로 거름
- [~] 8 — validator·자동 요청 경로 asUser 0회: 실제 `IssueStateReader`·`ApprovalService`·`TransitionTargetAdapter` 의 asUser 주입점을 함정으로 둔 테스트가 고정(`TransitionAutoRequestService.test.js:39-64`), 결재선 펼치기는 검증한 스냅샷만(재조회 0). asApp 사유 2개 `AGENTS.md` 기록. 결과는 응답·로그에 싣지 않음(제목 `''`, 문구는 규칙 저장 상태 이름). **단 ⓓ 는 F1 로 실패**
- [x] 9 — Jira 엔티티·프로젝트 프로퍼티 미사용, 앱 전용 커스텀 엔티티만
- [x] 10 — validator 는 함수형 그대로(manifest 모듈 무변경)
- [x] 요청 생성 실패가 통과가 되지 않는다 — `REJECT_AUTO_REQUESTED` 는 거부 코드, `tryCreate` 는 모든 예외를 원래 verdict(거부)로 후퇴, 외곽 마감은 `REJECT_UNAVAILABLE`

**색인 ⊇ 원본**
- [x] TRANSACT 모드: 프로젝트 기록 + 바뀐 색인 전부를 각자 읽은 gen 으로 조건부 set 한 transaction(`TransitionRuleRepository.js:230-245`), 경쟁이면 재계산 3회 → `CONCURRENT_MODIFICATION`
- [x] ORDERED 모드: 추가 색인 먼저 → 프로젝트 CAS, 색인 제거 없음(과잉 색인만 허용)(`:273-280`). Codex P1 경쟁 재현 테스트 있음
- [x] 색인 읽기 실패 → throw → `REJECT_UNAVAILABLE`(fail-closed). 교차 호출 음성 캐시 없음
- [x] `indexedStatusesOf`(enabled 규칙) ↔ `matchRule`(enabled !== false) 같은 기준. 무작위 500회 테스트 있음
- 단, 원자성 자체는 K1 실측에 달려 있다(미검증 표)

**검사 경로 SQL 0**
- [x] `TransitionValidatorService.test.js:245-335` — 실제 `TransitionRepository`(query 모의)로 색인 미스·다른 프로젝트·유형 불일치·기능 끔·꺼진 규칙에서 `query`·`tableReady` 0회, 색인 미스는 asApp·asUser 0회. 테이블 준비 확인은 규칙 적중 뒤에만(`:165`), `transition_rule` 제외

**유휴 SQL 예산**
- [x] manifest 변경은 엔티티 추가뿐 — 새 scheduledTrigger·consumer 없음. `idleSqlBudget.test.js` 통과
- [x] 기능 끔·규칙 없음은 SQL 진입 전에 반환

**권한 범위**
- [x] 신규 resolver 2개 축 `{project:'admin'}` — 규칙 CRUD 와 같다. 읽기(`listTransitionRules`)와 쓰기(save/defaults/setup/delete) 대칭
- [x] 감사 `actorKey` 는 서버 `principal.accountId`(`requirePrincipal`)
- [x] 자동 요청 요청자 = Forge payload `user.accountId`(클라이언트 값 아님). 앱 접근 제한(restrictAccess) 명부 판정 추가(`AppAccess.accountHasAppAccess`)

**번들·프론트·배포 단위**
- [x] `npm run check:bundle` OK
- [x] 새 엔트리 없음(craco·public·manifest resources 무변경)
- [x] i18n kr/en 키 대칭 — `locales/kr` vs `locales/en` 전 파일 키 차이 0. merge 산출물(`ko-KR.json`·`en-US.json`)에 새 키 존재. 변경된 프론트 파일 9개의 리터럴 키(transition·policy·error·common·transitionApply) 전부 양 언어에 문자열로 존재, 동적 키(`setup.step.${step}`·`autoRequestLabelKey`·`autoRequestWarningKey`)도 확인
- [x] 신규 쿼리키 없음(`transitionKeys.rules`·`settingsKeys.policy`·`requestKeys.defaults` 재사용)
- [x] SQL 마이그레이션 추가 없음
- [x] manifest app id `ari:cloud:ecosystem::app/1bd06760-…`(Confluence 판 아님), 엔티티 `transition-rules`(gen integer, body any)는 `channel-state` 와 같은 모양

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run merge`(root) | 통과 — `locales\ko-KR.json`·`locales\en-US.json` 생성 |
| `npx jest`(root) | **통과** — Test Suites 199 passed / Tests 2,950 passed (백엔드 보고와 같음) |
| `npx jest --watchAll=false`(static/ui, craco 미사용) | **통과** — Test Suites 98 passed / Tests 939 passed (프론트 보고와 같음) |
| `npm run build`(static/ui) | **통과** — "Compiled with warnings." 경고는 외부 패키지 source map ENOENT 뿐, "The build folder is ready to be deployed." |
| `npm run check:bundle`(root) | **통과** — `[bundle-check] OK — exports: channelServer, onInstall, onIssueChanged, onPreUninstall, onWorklogChanged, runMigration, runSweep, runSweepJob, validateTransition, CONTROLLER_REGISTRARS, handler` |

## 회차 기록

| 회차 | 날짜 | 결과 |
|---|---|---|
| 1 | 2026-10-21 | 통과 27 / 실패 1(F1 backend·설계) / 미검증 12 |
