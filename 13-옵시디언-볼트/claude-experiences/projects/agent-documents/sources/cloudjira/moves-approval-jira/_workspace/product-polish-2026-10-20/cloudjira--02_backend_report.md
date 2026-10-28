# product-polish-2026-10-20 — 백엔드 보고 (A·B 백엔드)

> 작성: backend-engineer · 2026-10-20 · 1회차
> 범위: 설계서 A(상태 변경 승인 재활성화)·B(연동/단독 구분)의 **백엔드만**. static/ui·docs 무변경, git·forge 미실행.
> 결과: 루트 `npx jest` **192 suites / 2,808 tests 전부 통과**(기준 190 / 2,767 → 신규 2 파일·41 tests), `npm run merge` OK, `npm run check:bundle` OK.
> SQL 마이그레이션 없음 · 새 resolver 없음(3단계 등록 변경 없음) · 새 asApp 사유 없음 · 유휴 SQL 예산 테스트(`idleSqlBudget`) 무변경 통과.

## 1. 프론트가 소비할 실제 응답 shape

**아래 resolver 는 전부 컨트롤러가 `{ content: <서비스 반환값> }` 으로 감싼다** → 래핑 후 `{ success: true, content: {...} }`. 아래 블록은 `content` 안의 모양이다(기존 소비 경로 그대로).

### 1.1 `getApprovalSettings` ({admin}) — 키 2개 추가

```js
content: {
  ...policy,                              // 기존 정책 키 전부
  workforceLinkEnabled: boolean,          // 기존(스위치)
  issueApprovalEnabled: false,            // 기존(고정)
  timesheetApprovalEnabled: boolean,      // 기존
  statusChangeApprovalEnabled: boolean,   // 신규 — 항상 boolean. 미저장 = false(기본 꺼짐), 저장값 `=== true` 만 true
  linkActive: boolean | null,             // 신규 — ChannelState.isLinked() = workforceLinkEnabled ∧ 채널 PAIRED. 판정 실패 = null(모름)
  approvalGroups: [...],
}
```
프론트 3상태 판정(설계 D9): `workforceLinkEnabled !== true` → `STANDALONE` / `workforceLinkEnabled && linkActive === false` → `LINKED_PENDING` / `linkActive === true` → `LINKED` / `linkActive === null`(또는 응답 없음) → 모름(전부 표시).
예: `{ workforceLinkEnabled: true, linkActive: false, statusChangeApprovalEnabled: false, ... }` = 연결 필요.

### 1.2 `saveApprovalSettings` ({admin})
- patch 에 `statusChangeApprovalEnabled: boolean` 허용(비 boolean → `INVALID_TARGET`, 아무것도 저장 안 함). 한 키만 보내면 된다.
- 응답 = `getApprovalSettings` 와 같은 shape(위).
- 감사: 값이 실제로 바뀐 경우만 `{area:'feature', action:'enable'|'disable', detail:{feature:'statusChangeApproval'}}` 1행. `policy/update` detail 에는 이 키가 안 들어간다.
- `issueApprovalEnabled:true` 거부(`ISSUE_APPROVAL_FEATURE_DISABLED`)는 그대로.

### 1.3 `getTimesheetContext` (SELF) — `features` 에 키 1개

```js
features: { issueApproval: boolean, timesheetApproval: boolean, statusChangeApproval: boolean } | null
// statusChangeApproval: 서버값 `=== true` 만 true(기본 꺼짐). features 조회 실패면 features 전체가 null(기존과 같음)
```
예: `{ issueApproval: false, timesheetApproval: true, statusChangeApproval: false }`

### 1.4 `getIssueTransitionApprovals` ({issue:'view'}) — 기능 끔: 신규 대상 없음, 기존 이력은 유지 (3회차 갱신)

기능 끔(기본)일 때:
```js
// 이 이슈에 상태 변경 승인 요청 이력이 없음(대부분) — KVS 1 + 테이블 준비 확인 + SQL 1, Jira 0
content: { issue: { issueId: '10001' }, enforced: false, notEnforcedReason: 'FEATURE_DISABLED', targets: [], history: [] }
// 기존 요청(PENDING·승인·반려 등)이 있음 — Jira 1(현재 상태) + 지연 판정 후 이력
content: { issue: { issueId, issueKey, title, projectId, projectKey, issueTypeId, statusId, statusName },
           enforced: false, notEnforcedReason: 'FEATURE_DISABLED', targets: [], history: [ /* 기존 summaryOf 행 */ ] }
```
- 신규 요청 대상(`targets`)은 항상 빈 배열 — "신규 접수만 중지". 기존 이력은 숨기지 않는다.
- 이력이 없을 때 `issue` 에는 **`issueId` 만** 있다. 카드는 `enforced===false && history.length===0` → 렌더 없음 규칙 그대로.
- 판정 실패는 켬으로 본다(표시 fail-open). 켬이면 기존 shape 그대로: `{ issue:{...}, enforced, notEnforcedReason: null|'GLOBAL_DISABLED'|'PROJECT_DISABLED'|'NO_RULE', targets:[{toStatusId,toStatusName,toStatusCategoryKey,transitions:[{transitionId,name}],ruleId,flow,latest,usability,canRequest}], history:[...] }`.

### 1.5 `createTransitionApproval`
- 기능 끔 → `{success:false, error:{code:'STATUS_CHANGE_APPROVAL_DISABLED', ...}}` (Jira 호출 전, 이 경로만 새 코드). 판정 실패는 그대로 던짐(fail-close, `UNKNOWN_ERROR`).
- `ApprovalService.createForTarget` 공통 경계도 `ISSUE_TRANSITION` 이면 같은 `STATUS_CHANGE_APPROVAL_DISABLED`. `ISSUE`·`FIELD_CHANGE` 는 `ISSUE_APPROVAL_FEATURE_DISABLED` 유지.

### 1.6 `getProjectWorklogPolicy`·`saveProjectWorklogPolicy`(WorklogPolicyService.project, 설정 > 적용 프로젝트 정책 모달) — 키 1개

```js
content: { projectId: '10000', linkMode: boolean, override: {...}, overrideRevision: number, workforce: object|null, effective: {...} }
// linkMode = 연동 모드(스위치 ∧ PAIRED). false 면 workforce 는 항상 null(워크포스 수신 행을 읽지도 합치지도 않는다)
```
"워크포스 정책 다시 받기" 버튼·워크포스 고정 문단은 `linkMode === false` 면 숨기면 된다. `refreshWorkforcePolicies`(refresh)는 연동 모드가 아니면 여전히 `WORKFORCE_LINK_DISABLED` 를 던진다(코드 무변경, 판정 기준만 isLinked).

### 1.7 `getWorklogControlStatus` — `settings` 에 키 1개

```js
settings: {
  visibilityScope, lockMethod, foreignAction,
  foreignScope: 'LINKED' | 'ALL',        // 유효값 — 미저장이면 연동 모드 LINKED, 단독·미연결 ALL, 판정 실패 LINKED
  foreignScopeDefaulted: boolean,         // 신규 — true = 저장값 없음(위 foreignScope 는 기본값). 저장하지 않는다
  target, startDateField, dateWindowOn,
}
```
예(단독 새 설치): `{ foreignAction: 'FLAG', foreignScope: 'ALL', foreignScopeDefaulted: true, ... }`

### 1.8 그 외 shape 무변경 — 판정 기준만 바뀜
`listIssueWorklogExceptions` 의 `content.linkMode`, `getIssueWorklogPolicy` 의 `content.managedBy`·`content.effective.linkMode`, `resolveWorklogPolicies` 의 `effective.linkMode/issueLinked`, 이력 행 `wfLinked` 가 이제 **스위치가 아니라 연동 모드(스위치 ∧ PAIRED)** 기준이다. 스위치만 켜고 미연결이면 전부 "연동 아님"으로 나온다.

## 2. 바꾼 것

### A. 상태 변경 승인
| 파일 | 변경 |
|---|---|
| `src/domain/settings/features.js` | `Feature.STATUS_CHANGE_APPROVAL='statusChangeApproval'`, `ISSUE_TRANSITION → STATUS_CHANGE_APPROVAL`(ISSUE·FIELD_CHANGE 는 ISSUE_APPROVAL 유지) |
| `src/resolver/settings/SettingsRepository.js` | `SETTINGS_KEYS.statusChangeApprovalEnabled='approval:settings:statusChangeApprovalEnabled'`, `DEFAULT_APPROVAL_SETTINGS.statusChangeApprovalEnabled=false`, `GLOBAL_ONLY_KEYS` 포함, `isStatusChangeApprovalEnabled()`(= `effectiveFlag(stored,false)`, KVS 1), `featureFlags()` 3키(KVS 2 — issueApproval 은 고정값이라 안 읽음). `isIssueApprovalEnabled()` false 고정 유지 |
| `src/resolver/settings/SettingsService.js` | 검증 `booleanValue`, 응답 boolean + `linkActive`, `FEATURE_SWITCH_KEYS`·`SEPARATE_AUDIT_KEYS`·`changedSwitches` reader 추가, 싱글턴에 `linkActive: () => channelState.isLinked()` 주입 |
| `src/resolver/transition/projectEnablement.js` | `isStatusChangeApprovalEnabled(settings)` export |
| `TransitionService.js`·`TransitionValidatorService.js`·`TransitionExecutor.js` | 기본 주입 `featureEnabled = () => isStatusChangeApprovalEnabled()`. Service: 조회 조기 반환(1.4), 생성 새 코드(1.5) |
| `src/resolver/approval/ApprovalService.js` | `featureEnabled` 분기에 STATUS_CHANGE_APPROVAL, 거부 코드 매핑 |
| `src/resolver/timesheet/TimesheetService.js` | `features.statusChangeApproval` |
| `src/utils/errors/ErrorCodes.js` + `locales/{kr,en}/error.json` | `STATUS_CHANGE_APPROVAL_DISABLED` (kr "상태 변경 승인이 꺼져 있어 새 요청을 받지 않습니다." / en "Status change approval is turned off. New requests are not accepted.") |
| `manifest.yml` | `jira:issueAction` `transition-approval-action` 주석 해제, title **"Request status change approval"**, resource `main/modal`, viewportSize medium. 키 유지 |
| `test/feature/featureGateScope.contract.test.js` | 정규식에 `isStatusChangeApprovalEnabled`·RAW 키 추가 — **허용 파일 목록은 그대로**(범위 확대 없음 고정) |

validator: 끔 → `PASS_DISABLED`(기존 판정 순서 첫 단계), 판정 실패는 기존대로 켬(강제). 자동 적용(Executor)은 끔이면 기존처럼 `BLOCKED/FEATURE_DISABLED`.

### B. 연동/단독 판정 통일(설계 B.3)
| 파일 | 변경 | 실패 방향 |
|---|---|---|
| `worklogControl/WorklogControlWorker.js` | LINKED_ALL 백필 연동 단계(신호·프로젝트 순회) 앞에서 `linkedLoader()`(= `channelState.isLinked`) false·실패 → 연동 단계 건너뜀(`cursor.issuesDone/projectsDone/linkedSkipped=true`), Jira·PENDING 삽입 0 | 건너뜀 |
| `worklogPolicy/WorklogPolicyResolver.js` | `enabledLoader` 미주입 = 연동 아님(옛 기본 true·`site.raw` 경로 제거). 싱글턴 = `channelState.isLinked()`. 이미 연동을 확인한 호출부 2곳(TimesheetService 제출 계층, Detector observeLinked)은 `enabledLoader: async () => true` 명시 | 연동 아님 |
| `worklogControl/WorklogControlDetector.js` | `wants().observeLinked` 를 `policyLoader().workforceLinkEnabled===true` → `this.channel.isLinked()` | 관찰 생략 |
| `worklogPolicy/WorklogPolicyService.js` | `workforceEnabled` 기본 = `channelState.isLinked()`(project·refresh·listIssueExceptions·이슈 예외 저장 공통). `project()` 는 연동 아니면 `workforceRows` 안 읽음 + `linkMode` 응답 | 빈 Map |
| `workforce/LinkedIssueSettingSource.js` `resolveMany` | 연동 판정을 맨 앞으로 — 아니면 VERIFIED 캐시가 있어도 `{setting:{active:false,code:'NOT_LINKED',...}, link:{linked:false,released:false,unavailable:false}}`, SQL·채널 0 | NOT_LINKED |
| `worklogHistory/WorklogHistoryRecorder.js` | 연결 신호 관문을 `settings.isWorkforceLinkEnabled()` → `linkedLoader()`(isLinked) | OFF(비연결) |
| `worklogControl/WorklogControlState.js` + `WorklogControlService.js` | `foreignWorklogScope` 미저장 시 유효 기본값 `defaultForeignScopeOf(isLinked)` — 단독·미연결 ALL, 연동 LINKED, 실패 LINKED. 저장값 있으면 연동 판정 KVS 를 읽지 않음. 상태 응답 `foreignScopeDefaulted` | LINKED |

`isWorkforceLinkEnabled()` 직접 사용으로 남은 곳(설계 B.3 허용 목록): `ChannelState.isLinked` 내부, `PairingService`, `ChannelServer`, `SettingsService`(재연동 판정), `certQuery`(채널 핸들러), `WorkforceTeamsService` 등 — 이번에 건드리지 않음.

`wa` 확인(설계 B.2 요청): `WorklogRequestService.js:279` 가 **아직 읽는다** — 출처는 엔티티 프로퍼티가 아니라 채널 `link.resolve` 응답의 setting 본문(`ops.js:184` `settingWaValid` — `autoRequest`·`lockApproved`·`closeDays`, optional). 연동 이슈의 자동 요청 on/off 는 워크포스 팀장 설정이 이긴다는 문구가 맞다. 이번 B 변경으로 연동 모드가 아니면 linkedSetting 이 없어 사이트 `worklogAutoRequest` 만 쓴다.

## 3. 테스트(신규·변경)
- 신규 `src/resolver/transition/__test__/statusChangeGateWiring.test.js` — 전환 3서비스 기본 주입이 새 판정, 필드 변경 2서비스는 `isIssueApprovalEnabled` 유지.
- 신규 `src/resolver/worklogControl/__test__/ForeignScopeDefault.test.js` — 미저장×{단독 ALL, 연동 LINKED, 실패 LINKED}, 저장값 유지·연동 판정 미호출.
- `SettingsFeatureFlags.test.js` — `isStatusChangeApprovalEnabled` 5값·KVS 1, 켜도 이슈 승인 false, featureFlags 3키(KVS 2), 응답 boolean 5값, `linkActive` true/false/실패 null/미주입 null, 저장·감사 enable/disable/중복 0행, 비 boolean 거부.
- `TransitionService.test.js` — 끔 조기 반환(reader·rules·listForIssue·onStatusObserved 미호출, shape 정확), 끔+잘못된 id → INVALID_TARGET, 생성 `STATUS_CHANGE_APPROVAL_DISABLED`.
- `ApprovalServiceFeatureGate.test.js` — ISSUE_TRANSITION 끔 → 새 코드, 이슈 승인 끔이어도 ISSUE_TRANSITION 통과.
- `TimesheetService.test.js` — features 3키.
- `WorklogControlWorker.test.js` — LINKED_ALL 백필: 미연결·판정 실패 건너뜀 / 연동 모드 기존 동작.
- `LinkedIssueSettingSource.test.js` — 미연결·판정 실패 시 VERIFIED 캐시 무시, SQL·채널 0.
- `LinkedObservation.test.js` — 판정을 `channel.isLinked` 로, 스위치 켬·미연결·실패 관찰 안 함.
- `WorklogPolicy.test.js` — 미주입 = 연동 아님, `project().linkMode` 3경우·workforceRows 호출 수.
- `WorklogHistoryRecorderScope.test.js` — 스위치 켬 + 미연결 → 신호 SQL 0·wfLinked false.
- `featureGateScope.contract.test.js` — 허용 목록 동일.

## 4. manifest major/minor 판단
- 변경: `jira:issueAction` 모듈 1개 추가(주석 해제). scope·egress·permissions·function·SQL·라이선스 무변경.
- 판단: **minor 로 본다** — Forge 가 major 로 치는 것은 권한(scopes·egress·external·remote) 변경이고, 새 scope 를 요구하지 않는 UI 모듈 추가는 사용자 재동의가 필요 없다. 이 모듈은 2026-10-13 이전 배포에도 있었다. **미검증**(04 T0) — `forge deploy` 출력으로 확인. `forge install --upgrade` 는 모듈 변경이라 실행 필요(AGENTS 배포 규칙).

## 5. 미검증 (배포 후 — `04_spike_todo.md` 기존 항목에 해당)
- T0 manifest minor 여부, T1 validator payload `to.id`(기능 켜기 전 관문), T4·T16 issueAction moduleKey 판독·새 title 반영, T15 끔 상태 이슈 화면 비용(조기 반환 KVS 1 — 단위 테스트로만 확인).
- `foreignScope` 단독 기본 ALL 의 실제 효과: 단독 사이트에서 Jira 기본 Log work·REST 입력이 "다른 경로 입력(FLAG)"으로 표시되기 시작한다(`foreignAction` 기본 FLAG). 개발 사이트에서 이슈 Work log 탭·감사에 표시가 늘어나는지 확인 필요(새 항목 아님 — U2 와 함께 보면 된다).

## 2회차 (2026-10-20) — 발견 1 수정: 건너뛴 LINKED_ALL 백필 연동 단계 자동 재개

- `WorklogControlWorker.backfillStep` 이 연동 단계를 건너뛸 때 상태(KVS)에 `linkedBackfillSkipped: <generation>` 을 남긴다.
- 신규 `WorklogControlWorker.resumeLinkedBackfill()` — 표식 = 현재 세대 ∧ 범위 LINKED_ALL ∧ 지금 연동 모드(isLinked)일 때만 `backfill = {generation, cursor:{certDone:true, refsDone:true}, kind:'LINKED_ALL'}` 로 연동 단계만 다시 열고 표식을 지운 뒤 `wake({op:'backfill'})`. 쓰는 순간 세대가 바뀌었으면 손대지 않음. 반환 `'RESUMED'|'NONE'|'NOT_LINKED'|'FAILED'`, 던지지 않음. **KVS·큐만, SQL 0**.
- 호출 지점(이벤트 시점 1회, 유휴 경로 아님): `PairingService.acceptCode`(내가 코드 붙여넣기)·`onPairComplete`(상대가 내 코드 소비) PAIRED 전이·감사 직후(`onLinked` 주입, 기본은 늦은 require), `SettingsService.saveApprovalSettings` 에서 patch `workforceLinkEnabled === true` 저장 직후(`linkedResume` 주입). 훅 실패는 결과를 바꾸지 않음.
- 유휴 SQL 예산 무변경(`idleSqlBudget` 통과). 테스트: Worker 재개 7건(재개·표식 없음/옛 세대/범위 다름/미연동/경합/읽기 실패)+표식 기록 1건, PairingService 2경로 호출·실패 무영향·거부 시 미호출, SettingsService 스위치 켬 1회·끔/무관 0회. 루트 jest **192 suites / 2,820 tests 통과**.

## 3회차 (2026-10-20) — Codex 백엔드 검수 4건

1. **[P1] 연동 판정 오류 = 미해결(fail-close)**: `LinkedIssueSettingSource.resolveMany` — 명시적 미연결만 `NOT_LINKED`, `isLinked()` 오류는 `setting:{settingUnresolved:true, code:'LINK_STATE_UNKNOWN'}`·`link:{unavailable:true}` → 타임시트 제출 거부. 강제 경로 재점검: `TimesheetService.computeLive` 가 연동 판정 오류를 삼키던 것(`enabled().catch(()=>false)`, 기존 코드)을 제출(enforceAuthority)에서는 `TIMESHEET_LINKED_SETTING_UNRESOLVED` 로 거부하게 바꿈(`WorkforceOrgSource.enabledStrict` 신설, 미리보기는 단독처럼). `WorklogPolicyResolver`(오류 전파)·`ControlLinkJudge`(unavailable) 는 이미 fail-close. "실패=연동 아님"은 비강제 경로만 남음: 정책 모달 `linkMode`, Detector 관찰, 백필 건너뜀(아래 재개로 복구), 이력 배지(UNAVAILABLE), 감지 범위 기본값(LINKED).
2. **[P1] 재개 경합**: 훅(`resumeLinkedBackfill`, 페어링·스위치 켬)은 **상태를 쓰지 않고** LINKED_ALL 이면 깨우기만(표식이 아직 없어도). 재개는 워커 실행 안 `resumeSkippedLinked(ctx)` 에서만 — 매 실행(일일 포함) 표식 = 현재 세대 ∧ LINKED_ALL ∧ 연동 모드면 연동 단계 커서(+`resumeId`)로 재설정·표식 제거, 같은 실행에서 바로 백필. 표식이 없으면 KVS 추가 0. 일시적 판정 실패도 다음 실행이 복구. `backfillStep` 의 커서·완료(null)·표식 쓰기는 읽은 백필과 세대·`resumeId` 가 같을 때만(재개가 쓴 새 백필을 옛 실행이 덮지 않음). KVS 에 CAS 가 없어 동시 실행 간 창은 남지만 다음 실행이 메운다.
3. **[P2] 세대만 오를 때 이월**: `WorklogControlService.afterSave` — 범위 그대로·세대 증가(다른 경로 처리·잠금·대상 변경)면 현재 세대의 미완료 `backfill` 과 `linkedBackfillSkipped` 를 새 세대로 이월.
4. **[P2] 기능 끔 이력 유지**: 1.4 참고. 비용 테스트(T15) 기대치 = 이력 없음 Jira 0·규칙 SQL 0·listForIssue 1, 테이블 미준비 SQL 0.

테스트 추가: LinkedIssueSettingSource 오류 미해결, TimesheetLinked 판정 오류 제출 거부·미리보기 정상, LINK_STATE_UNKNOWN 제출 거부, Worker 훅 깨우기만/NONE/FAILED, 실행 안 재개·표식 없음 KVS 0·옛 세대·미연동/실패 유지·세대 경합, run() 자가 재개, backfillStep 덮어쓰기 방지, afterSave 이월·비이월, TransitionService 끔 3경우. 루트 jest **192 suites / 2,829 tests 통과**, `check:bundle` OK, 유휴 SQL 예산 무변경.

## 발견 (이번 범위 밖 — 고치지 않음)
1. ~~**백필 연동 단계 건너뜀 후 재개 경로**~~ → 2회차에서 수정. 원문: **백필 연동 단계 건너뜀 후 재개 경로**: 미연결 상태에서 LINKED_ALL 백필이 연동 단계를 건너뛰면(`linkedSkipped`) 나중에 연결이 생겨도 자동으로 다시 돌지 않는다. 범위·관문을 다시 저장해 세대가 올라갈 때만 처음부터 돈다(`WorklogControlService.js:548`, 범위가 바뀐 경우만 세대 증가). 페어링 완료 시 백필 재시작 훅이 필요하면 별도 과제.
2. `TransitionExecutor` 는 기능 끔이면 자동 적용을 `BLOCKED/FEATURE_DISABLED` 로 보류한다 — "끔 = 신규 접수만 중지" 원칙과 엄밀히는 어긋난다(이미 승인된 요청의 자동 전환까지 멈춤). 기존 동작이라 유지했고, validator 는 통과(PASS_DISABLED)이므로 요청자가 직접 전환하면 된다.
3. ••• 메뉴(`transition-approval-action`)는 기능 끔이어도 모든 이슈에 보인다(앱 설정 기반 displayConditions 없음). 모달이 `FEATURE_DISABLED` 안내를 해야 한다 — frontend 몫.
