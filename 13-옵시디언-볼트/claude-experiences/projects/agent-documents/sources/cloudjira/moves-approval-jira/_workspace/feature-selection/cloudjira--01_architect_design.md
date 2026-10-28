# "사용할 기능" 선택 + 라벨 평문화 설계서 (feature-selection)

작성: 2026-10-12 feature-architect. 입력: `00_input/requirement.md`(결정 포함), `codex-review.md`(전수표·라벨 15), 선행 미커밋 설계
`operating-mode`(§8 판정 단일화)·`settings-restructure`(묶음·`section` URL)·`settings-design`(SettingsSection 등).
**사용자 결정(고정):** 끔 = **신규 접수만 중지**. `transitionApprovalEnabled` 는 비상 스위치로 분리 유지. 새 키 기본값 `true`.
코덱스 전수표는 출발점으로만 쓰고, 아래 `파일:행` 은 이번에 직접 다시 읽어 확인한 위치다(미커밋 트리 기준).

## 열린 질문

없음. 다만 요구서가 정하지 않은 두 지점은 **가장 보수적인 해석**으로 확정했다(뒤집으려면 §2.2 해당 행만 바꾸면 된다).
- A1. **필드 변경 "승인 후 적용"은 끔이어도 계속한다.** 요구서는 전환 자동 적용만 중지를 명시했다. 필드 변경 적용은 이미 승인된 결재의 마무리이고, 전환과 달리 우회 통과(validator)가 없어 멈추면 "승인됐는데 안 바뀐" 상태로 남는다.
- A2. **필드 직접 변경 감지(우회 기록)는 끔이면 건너뛴다** — 프로젝트 "사용 안 함"과 같은 처리. 끔 상태의 직접 편집은 우회가 아니다(기록하면 이슈 패널에 거짓 "우회"가 쌓인다). 결재 중 요청의 낡음은 패널 지연 판정(`FieldChangeService.expireStale`)과 적용 직전 최신 확인이 계속 잡는다.

## 1. 개요·영향 범위

| 층 | 변경 |
|---|---|
| 도메인 | 신규 `src/domain/settings/features.js`(순수: 기능↔대상 종류 매핑·유효값 해석). `src/domain/transition/judge.js` 에 `featureEnabled` 입력·`PASS_FEATURE_DISABLED` 코드 추가 |
| resolver | **신규 1개** `getFeatureOverview`(admin). 기존 응답에 필드 **추가만**: `getApprovalSettings`, `getTimesheetContext`, `getMyTimesheet`(코드값), `getIssueApproval`/`getApprovalDetail`(reason 값), `getIssueTransitionApprovals`(reason 값), `getIssueFieldChanges`(reason 값), `listTransitionRules`·`listFieldChangeRules`(`featureEnabled`) |
| 서버 게이트 | `ApprovalService.createForTarget`·`requestGate`, `TransitionService`, `TransitionValidatorService`, `TransitionExecutor`, `FieldChangeService`, `FieldChangeTargetAdapter`, `FieldChangeEventService`, `TimesheetService` |
| 정책 저장 | `SettingsRepository`(키 2·기본값·전역 전용·판정 함수), `SettingsService`(정규화·감사 분리·개요) |
| 스키마 | **없음**(KVS boolean 2개. SQL 마이그레이션 불필요 — 코덱스 §비용 확인) |
| manifest | **없음**(모듈·scope·엔트리 무변경) |
| 프론트 | 설정 새 항목 `features`(첫 진입)·`approvalSetup`(결재 구성), 이슈 승인 화면 재구성(비상 해제 섹션), 메뉴 배지, 업무함·이슈 패널·내 타임시트·팀 타임시트 표시 |
| i18n | `policy`·`error`·`timesheet`·`issueApproval`·`fieldChange`·`transition`·`transitionApply`·`worklogControl`·`workforce` (kr/en 동시) |
| 워크포스 연동 | **없음**(수신 계약·게시 포맷·서명 무변경. `workforceLinkEnabled` 는 같은 키·같은 캐시로 첫 화면에 한 번 더 노출만) |

**끔이 건드리지 않는 것(명시):** 워크로그 사전 승인(`WORKLOG_CREATE`), 옛 요청형 인증(`WORKLOG_CERTIFICATION`), 팀장·본인 인증, 기간 마감·재개, drift·게시·통제, 시간 추적 제공자 화면, 업무함 목록·결정·회수·위임·독촉·만료·증명서·내보내기.

## 2. 경계면 계약

### 2.1 정책 키 계약

| 항목 | `issueApprovalEnabled` | `timesheetApprovalEnabled` |
|---|---|---|
| KVS 키(`SETTINGS_KEYS`) | `approval:settings:issueApprovalEnabled` | `approval:settings:timesheetApprovalEnabled` |
| 기본값(`DEFAULT_APPROVAL_SETTINGS`) | `true` | `true` |
| 전역 전용(`GLOBAL_ONLY_KEYS`) | **포함**(빠지면 `PROJECT_OVERRIDABLE_KEYS` 로 분류돼 프로젝트 덮어쓰기가 열린다 — `SettingsRepository.js:195`) | **포함** |
| 정규화(`normalizeSettingsPatch`) | `booleanValue`(그 외 `INVALID_TARGET`) | `booleanValue` |
| 판정 함수(단일) | `SettingsRepository.isIssueApprovalEnabled()` | `SettingsRepository.isTimesheetApprovalEnabled()` |
| 의미 | 이슈 일반·상태 변경·필드 변경 승인의 **새 요청**(재상신 포함) 접수 | 타임시트 **새 제출·재제출** 접수 |

`SettingsRepository` 추가(위치: `isWorkforceLinkEnabled` 옆, `SettingsRepository.js:275`):

```js
import { effectiveFlag } from '../../domain/settings/features';
/** 이슈 승인 신규 접수 — 미저장(undefined·null)은 기본값(true), 그 외는 `=== true`. KVS 1회, SQL 0. 실패는 KvsError 로 던진다. */
async isIssueApprovalEnabled() {
  return effectiveFlag(await this.getValue(SETTINGS_KEYS.issueApprovalEnabled), DEFAULT_APPROVAL_SETTINGS.issueApprovalEnabled);
}
async isTimesheetApprovalEnabled() { /* 같은 형태, timesheetApprovalEnabled */ }
/** 둘을 병렬로. 응답 노출용 — 호출부가 catch 해서 null(모름)로 내린다. */
async featureFlags() {
  const [issueApproval, timesheetApproval] = await Promise.all([this.isIssueApprovalEnabled(), this.isTimesheetApprovalEnabled()]);
  return { issueApproval, timesheetApproval };
}
/** 비상 스위치(기존 의미 그대로 `!== false`). projectEnablement.isTransitionApprovalEnabled 가 이 함수를 부르게 바꾼다(동작 동일). */
async isTransitionApprovalEnforced() {
  return (await this.getValue(SETTINGS_KEYS.transitionApprovalEnabled)) !== false;
}
```
- **직접 `getValue(...) === false` 판정 금지**(운영 모드 §8 과 같은 규칙). 소비처는 전부 위 함수 또는 주입된 래퍼를 쓴다.
- 기본값 주석: "기능 사용(feature-selection). 끔 = 신규 접수만 중지. 기본 켬 — 기존 설치가 갑자기 꺼지지 않게. 판정은 isXxxEnabled() 하나로."
- `transitionApprovalEnabled` 기본값 주석을 "비상 해제(승인 확인 강제의 일시 해제). 기능 사용 여부는 issueApprovalEnabled" 로 고친다.
- `getApprovalSettings`(`SettingsService.js:225`) 응답: `issueApprovalEnabled: effectiveFlag(policy.issueApprovalEnabled, true)`, `timesheetApprovalEnabled: 같은 형태` — **항상 boolean**. `workforceLinkEnabled` 정규화와 같은 자리.

### 2.2 감사 action 분리 (`SettingsService.saveApprovalSettings`, `SettingsService.js:234-270`)

| 바뀐 키 | area / action | detail | 비고 |
|---|---|---|---|
| `issueApprovalEnabled` | `feature` / `enable` \| `disable` | `{ feature: 'issueApproval' }` | 값이 **실제로 바뀐 경우만** 1행 |
| `timesheetApprovalEnabled` | `feature` / `enable` \| `disable` | `{ feature: 'timesheetApproval' }` | 동일 |
| `transitionApprovalEnabled` | `transitionEnforce` / `enable`(강제 복귀) \| `disable`(비상 해제) | `{ transitionApprovalEnabled }` | 동일. "기능 끔"과 "장애 우회"를 같은 `false` 로 구별 못 하던 문제(코덱스 §겸용 위험) 해소 |
| 그 외 키·`approvalGroups` | `policy` / `update` (기존) | 위 세 키를 **뺀** patch | 남은 키가 없으면 이 행을 쓰지 않는다 |

- "이전 값"은 `savePolicy` **전에** 읽는다: patch 에 해당 키가 있을 때만 `isIssueApprovalEnabled()`·`isTimesheetApprovalEnabled()`·`isTransitionApprovalEnforced()` 를 부른다(각 KVS 1). 읽기 실패는 "바뀜"으로 보고 기록한다(감사 누락보다 중복이 낫다). relinking 판정(`:244`)과 같은 자리.
- action 값은 기존 i18n(`policy.audit.action.enable|disable`) 재사용, area 라벨 2개만 신규(§8).
- `recordSettingsAudit` 는 던지지 않는다(기존) — 저장 결과를 뒤집지 않는다.

### 2.3 resolver 경계면 계약

| resolver | 권한 축 | 입력 | 응답 shape (success) — **굵게 = 이번 추가** | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getApprovalSettings` | `{admin:true}` | — | 기존 + **`issueApprovalEnabled:boolean`, `timesheetApprovalEnabled:boolean`** | 기존 | 설정 전 화면(쿼리키 `settingsKeys.policy()`) |
| `saveApprovalSettings` | `{admin:true}` | patch 에 **두 키 허용** | `getApprovalSettings` 와 같음 | `INVALID_TARGET`(형식) | 사용할 기능·비상 해제·워크포스 토글 |
| **`getFeatureOverview`** (신규) | `{admin:true}` | — | `{ projects:{ configured:boolean, enabledCount:number\|null }, teams:{ enabledCount:number\|null } }` | 없음(부분 실패는 해당 값 `null`) | 사용할 기능 "현재 상태" |
| `getTimesheetContext` | `SELF` | — | 기존 + **`features: { issueApproval:boolean, timesheetApproval:boolean } \| null`**(조회 실패 = null) | 기존 | 업무함 부트스트랩(이미 항상 호출 — `InboxPage.jsx:243`), 팀 타임시트 |
| `getMyTimesheet` | `SELF` | 기존 | shape 무변경. `submitBlockedCode` 에 **`TIMESHEET_APPROVAL_FEATURE_DISABLED`** 가 올 수 있다(최우선) | 기존 | 내 타임시트 `SubmitBar` |
| `submitTimesheet` | `SELF` | 기존 | 기존 | **`TIMESHEET_APPROVAL_FEATURE_DISABLED`** | 내 타임시트 |
| `getIssueApproval` / `getApprovalDetail` | issue view / `SELF` | 기존 | shape 무변경. `notAvailableReason` 에 **`'FEATURE_DISABLED'`** 추가(ISSUE·ISSUE_TRANSITION·FIELD_CHANGE·TIMESHEET 대상 공통), 그때 `canRequest:false` | 기존 | 이슈 일반 승인 섹션, 승인 상세(재상신 버튼) |
| `createIssueApproval` | issue edit | 기존 | 기존 | **`ISSUE_APPROVAL_FEATURE_DISABLED`** | 이슈 일반 승인 요청 폼 |
| `getIssueTransitionApprovals` | issue view | 기존 | shape 무변경. `notEnforcedReason` 에 **`'FEATURE_DISABLED'`**(이때 `enforced:false`, `targets:[]`, `history` 유지) | 기존 | 이슈 전환 섹션·transitionPick 모달 |
| `createTransitionApproval` | issue view | 기존 | 기존 | **`ISSUE_APPROVAL_FEATURE_DISABLED`** | 전환 요청 폼 |
| `getIssueFieldChanges` | issue view | 기존 | shape 무변경. `notEnabledReason` 에 **`'FEATURE_DISABLED'`**(규칙 있음일 때만. `fields[].canRequest:false`, `canApply`·`history`·`bypass` 유지) | 기존 | 필드 변경 섹션 |
| `getFieldChangeForm` / `createFieldChangeApproval` | issue view | 기존 | 기존 | **`ISSUE_APPROVAL_FEATURE_DISABLED`** | 필드 변경 요청 폼 |
| `listTransitionRules` / `listFieldChangeRules` | project admin | 기존 | 기존 + **`featureEnabled:boolean`**(실패 = true, 표시 fail-open) | 기존 | 프로젝트 규칙 화면 경고 |
| `retryTransitionApply` | `SELF` | 기존 | 기존(끔이면 `applyStatus:'BLOCKED'`, `applyCode:'FEATURE_DISABLED'`) | 기존 | 전환 적용 상태 |

**새 에러 코드**(`ErrorCodes` 값 = `locales/*/error.json` 키, 규칙 그대로):
`ISSUE_APPROVAL_FEATURE_DISABLED`, `TIMESHEET_APPROVAL_FEATURE_DISABLED`. 기존 `*_PROJECT_DISABLED`(프로젝트 단위)와 **다른 코드**다 — 프로젝트 사용 여부와 사이트 기능 끔을 화면이 구별해야 안내가 정확하다.

**새 apply/판정 코드(문자열, ErrorCodes 아님):** 전환 적용 `FEATURE_DISABLED`(BLOCKED 사유), validator `PASS_FEATURE_DISABLED`(로그 전용).

## 3. 도메인 (순수)

### 3.1 `src/domain/settings/features.js` (신규)
```js
export const Feature = Object.freeze({ ISSUE_APPROVAL: 'issueApproval', TIMESHEET_APPROVAL: 'timesheetApproval' });
/** 대상 종류 → 기능. WORKLOG_CREATE(사전 승인)·WORKLOG_CERTIFICATION(옛 인증)은 null — 이 스위치 밖이다(요구 범위 밖). */
export const featureOfTargetKind = (kind) => ({
  ISSUE: 'issueApproval', ISSUE_TRANSITION: 'issueApproval', FIELD_CHANGE: 'issueApproval', TIMESHEET: 'timesheetApproval',
})[kind] ?? null;
/** 미저장(undefined·null) → fallback, 그 외 `=== true`. 모든 기능 판정·응답 정규화가 이 하나를 쓴다. */
export const effectiveFlag = (value, fallback) => (value === undefined || value === null ? fallback === true : value === true);
```
테스트(`src/domain/settings/__test__/features.test.js`): 6개 kind 매핑(2개 null), 모르는 kind → null, `effectiveFlag` undefined/null/true/false/`'false'`(문자열 → false).

ErrorCodes 매핑은 서비스 쪽(`ApprovalService.featureDisabledCode`)에 둔다 — 도메인이 응답 코드를 고르지 않게.

### 3.2 `src/domain/transition/judge.js`
- 입력에 `featureEnabled = true`(기본값 — 기존 호출·테스트 무변경), `ValidatorCode.PASS_FEATURE_DISABLED` 추가.
- 순서: `if (!featureEnabled) return pass(PASS_FEATURE_DISABLED);` → 기존 `if (!enabled) PASS_DISABLED` → …  
  (둘 다 꺼짐이면 계획된 끔이 원인이다. 어느 쪽이든 통과라 동작 차이는 로그 코드뿐)
- 테스트(`judge.test.js` 추가): featureEnabled=false + pending 후보 → PASS/PASS_FEATURE_DISABLED; 둘 다 false → PASS_FEATURE_DISABLED; featureEnabled 생략 → 기존 결과 동일.

## 4. 백엔드

### 4.1 서버 게이트 전수표 (직접 재확인)

판정 실패(KVS 오류) 처리 열: **close** = 요청을 막거나 강제 쪽, **open** = 기존 동작 유지.

#### 이슈 승인 끔 (`issueApprovalEnabled=false`)

| # | 진입점 (`파일:행`) | 처리 | 구체 | 판정 실패 |
|---|---|---|---|---|
| I1 | `ApprovalService.createForTarget` (`ApprovalService.js:635`) | **막는다** | 함수 맨 앞(describe·supersede **전**)에 `await this.assertFeatureOpen(adapter.kind)`. `featureOfTargetKind` 가 `issueApproval` 이면 `ISSUE_APPROVAL_FEATURE_DISABLED`, `timesheetApproval` 이면 `TIMESHEET_APPROVAL_FEATURE_DISABLED`, null 이면 통과. **공통 경계** — 아래 전용 검사가 빠져도 여기서 막힌다. supersede 전이라 기존 PENDING 이 회수되지 않는다 | close(KvsError 그대로 → `UNKNOWN_ERROR`) |
| I2 | `ApprovalService.requestGate` (`:359`) | **막는다(표시)** | 대상 kind 의 기능을 먼저 본다 → 끔이면 `{allowed:false, reason:'FEATURE_DISABLED'}`. 그다음 기존 ISSUE 프로젝트 판정. viewForTarget(`:312-320`)이 이 값으로 `canRequest`·`notAvailableReason` 을 채운다 → 이슈 패널·상세의 요청/재상신 버튼이 사라진다 | open(실패 = 기능 켬으로 보고 프로젝트 판정 진행. 쓰기는 I1 이 다시 막는다) |
| I3 | `ApprovalService.createIssueApproval` (`:600-622`) | **막는다** | `gate.reason === 'FEATURE_DISABLED'` 면 `ISSUE_APPROVAL_FEATURE_DISABLED`, 그 외 거부는 기존 `ISSUE_APPROVAL_PROJECT_DISABLED` | I1 이 close |
| I4 | `TransitionService.createTransitionApproval` (`TransitionService.js:214`) | **막는다** | `issueWithTransitions` **전**(Jira 호출 전) 맨 앞에서 `featureEnabled()` → `ISSUE_APPROVAL_FEATURE_DISABLED`. `insertDraft` 전이라 고아 부속 행 없음 | close |
| I5 | `TransitionService.getIssueTransitionApprovals` (`:143`, 사유 `:176-179`) | **응답에 상태만** | `Promise.all` 에 `featureEnabled().catch(() => true)` 추가. 사유 우선순위: `FEATURE_DISABLED` > `GLOBAL_DISABLED` > `PROJECT_DISABLED` > `NO_RULE`. `onStatusObserved`(만료·소비 지연 판정)는 **그대로 먼저 실행** | open |
| I6 | `TransitionValidatorService.evaluate` (`TransitionValidatorService.js:95-108`) | **통과(강제 없음)** | `const [enabled, featureEnabled] = await Promise.all([this.globalEnabled().catch(()=>true), this.featureEnabled().catch(()=>true)])` — 병렬이라 지연 0 추가. `featureEnabled` 를 `judgeTransition` 에 넘기고, 조기 반환 조건(`:107`)·`tablesReady` 계산(`:100`)에 `featureEnabled` 를 더한다. 끔이면 SQL 0·Jira 0 으로 `PASS_FEATURE_DISABLED`. **무장(arm)·소비 없음** | close(실패 = 켬 = 강제, 기존 Q53 fail-closed 와 같은 방향) |
| I7 | `TransitionExecutor.apply` (`TransitionExecutor.js:42`) | **자동 적용 중지** | `if (!(await this.featureEnabled().catch(() => true))) code = 'FEATURE_DISABLED'; else if (!globalEnabled \|\| !projectEnabled) code = 'PROJECT_DISABLED';` → 기존 BLOCKED 경로(`:46-48`). POST 전이라 안전. DECIDE(`TransitionTargetAdapter.js:241`)·SWEEP(`runTransitionApplySweep.js:24`)·재시도(`TransitionService.js:457`) 세 경로가 모두 이 지점을 지난다. BLOCKED 는 `canRetry`(`applyPlan.js:6`) 라 다시 켠 뒤 요청자가 재시도할 수 있다 | open(실패 = 기존처럼 진행 — 이미 승인된 결재) |
| I8 | `TransitionExecutor.apply` 의 `postStartedAt` 분기(`:27-29`)·`reconcile`(`:68`) | **그대로** | 이미 POST 한 건의 결과 대조는 끔과 무관하게 계속(요구 "결과 대조 유지"). I7 검사는 `:42` 라 이 분기 뒤 | — |
| I9 | `runTransitionApplySweep` (`trigger/runTransitionApplySweep.js`) | **그대로** | WAITING·APPLYING 만 줍는다. 끔이면 각 행이 I7 에서 BLOCKED 가 되어 다음 날부터 후보에서 빠진다 | — |
| I10 | `TransitionService.listTransitionRules` (`:346`) | **응답에 상태만** | `featureEnabled` 추가(실패 true). 규칙 저장·삭제는 그대로(끔 상태에서 미리 구성 가능) | open |
| I11 | `FieldChangeService.loadRequestable` (`FieldChangeService.js:349-353`) | **막는다** | `reader.issueWithFields` **전**에 `featureEnabled()` → `ISSUE_APPROVAL_FEATURE_DISABLED`. 폼(`getFieldChangeForm`)·생성(`createFieldChangeApproval:438`) 공통 | close |
| I12 | `FieldChangeService.getIssueFieldChanges` (`:178`, 사유 `:240-243`) | **응답에 상태만** | `Promise.all`(`:207`)에 `featureEnabled().catch(()=>true)`. 사유: `NO_RULE` > `FEATURE_DISABLED` > `PROJECT_DISABLED`. `enabled=false` → 각 field `canRequest:false`. `expireStale`·`canApply`·`history`·`bypass` 는 그대로 | open |
| I13 | `FieldChangeTargetAdapter.canRequest` (`FieldChangeTargetAdapter.js:156`) | **그대로** | viewForTarget 에서 I2(requestGate)가 먼저 막으므로 어댑터는 손대지 않는다(이중 판정 회피) | — |
| I14 | `FieldChangeService.applyFieldChange` (`:529`) + 결정 직후 적용(FieldChangeApplier) | **그대로**(A1) | 승인된 변경의 적용·재적용은 기존 결재 마무리 | — |
| I15 | `FieldChangeEventService.onIssueUpdated` (`FieldChangeEventService.js:124`) | **건너뛴다**(A2) | 기존 `projectEnabled` 확인 줄을 `projectEnabled && featureEnabled` 로(둘 다 `.catch(() => true)`). 규칙 매칭 후라 대부분의 이벤트는 여전히 SQL 0 으로 끝난다 | open(실패 = 기존처럼 기록) |
| I16 | `FieldChangeService.listFieldChangeRules` (`:591`) | **응답에 상태만** | `featureEnabled` 추가 | open |
| I17 | `decideApproval`(`ApprovalService.js:852`)·`bulkApprove`(`:798`)·`cancelApproval`(`:981`)·위임 결재·만료·독촉·증명서 | **그대로** | 기존 PENDING 마무리. `beforeDecide`(`:877`)에 게이트를 넣지 않는다(예외가 삼켜지는 구조, 요구 2) | — |
| I18 | 전환 상태 관찰(소비·만료) 트리거, `IssueApprovalChangeService` | **그대로** | 기존 요청의 낡음·소비 판정 | — |
| I19 | 워크로그 사전 승인(`WorklogApprovalService`, `WORKLOG_CREATE`) | **그대로** | `featureOfTargetKind` = null. 적용 프로젝트 규칙은 기존대로 적용 | — |

#### 타임시트 끔 (`timesheetApprovalEnabled=false`)

| # | 진입점 | 처리 | 구체 | 판정 실패 |
|---|---|---|---|---|
| T1 | `TimesheetService.submitTimesheet` (`TimesheetService.js:442`) | **막는다** | `requirePrincipal` 직후, 정책 로드·`computeLive`(Jira 수집)·`upsertWorklogRefs`(`:507`) **전**에 `featuresEnabled.timesheet()` → `TIMESHEET_APPROVAL_FEATURE_DISABLED`. 재제출(supersedes)도 같은 함수라 함께 막힌다 | close |
| T2 | 공통 `createForTarget` 의 TIMESHEET | **막는다** | I1 과 같은 지점(종류 매핑으로). T1 이 먼저 막지만 공통 경계가 2차 방어 | close |
| T3 | `TimesheetService.getMyTimesheet` (`:324`, 사유 `:360-368`) | **응답에 상태만** | `submitBlockedCode` 계산 맨 앞에 `if (featureOff) submitBlockedCode = TIMESHEET_APPROVAL_FEATURE_DISABLED`(ALREADY_OPEN+changedSinceSubmit 재제출보다 우선). 판정은 `isTimesheetApprovalEnabled().catch(() => true)`(표시 open — 쓰기는 T1). 수집·회수 가능 여부(`latest`)는 그대로 | open |
| T4 | `TimesheetService.getTimesheetContext` (`:186-214`) | **응답에 상태만** | `features: await this.features().catch(() => null)` 추가(`featureFlags()`). 기존 필드 무변경 | null(모름) |
| T5 | `ApprovalService.requestGate` 의 TIMESHEET | **막는다(표시)** | I2 와 같은 일반화 — 승인 상세의 타임시트 재제출 버튼(`ApprovalDetail.jsx:456`)이 사라진다 | open |
| T6 | `decideTimesheets`(`:655`)·`getTeamTimesheetMatrix`·`getTimesheetDetail`·`cancelApproval` | **그대로** | 기존 결재 마무리·읽기 | — |
| T7 | 팀 명부 CRUD·Jira 그룹 가져오기 | **그대로** | 인증 권한 범위의 원천 | — |
| T8 | `closePeriod`·`recordAutoCloses`·`reopenPeriod`·`previewPeriodReopen`·`continuePeriodReopen` | **그대로** | 별도 기간 정책·복구 경로 | — |
| T9 | 기간 잠금 판정(`PeriodLockService`) | **그대로** | 승인 기간 잠금은 끔과 무관 | — |
| T10 | drift·일일 누락 보정·고아 정리, 워크포스 게시(타임시트·인증·통제 문서) | **그대로** | 기존 결과 갱신 | — |
| T11 | 시간 추적 제공자 화면·`create/update/deleteWorklog`·사전 승인 | **그대로** | 제공자 화면에는 타임시트 제출 버튼이 없다(`features/worklog` 확인) → 응답 추가도 불필요 | — |
| T12 | 팀장·본인 인증, 통제 전부 | **그대로** | 독립 경로 | — |

**정적 범위 보증:** `test/feature/featureGateScope.contract.test.js`(신규) — `src/` 에서 `isIssueApprovalEnabled|isTimesheetApprovalEnabled|featureFlags` 를 참조하는 파일이 아래 허용 목록과 **정확히 같음**을 단언한다. "인증만 사용·숨김 복구·재개 가능" 회귀를 구조로 막는다.
허용: `SettingsRepository.js`, `SettingsService.js`, `ApprovalService.js`, `TransitionService.js`, `TransitionValidatorService.js`, `TransitionExecutor.js`, `FieldChangeService.js`, `FieldChangeEventService.js`, `TimesheetService.js`, `transition/projectEnablement.js`(래퍼를 둔다면).

### 4.2 주입 형태 (테스트 더블 일관)

| 클래스 | 생성자 인자(기본값) |
|---|---|
| `ApprovalService` | `featureEnabled = (feature) => (feature === Feature.TIMESHEET_APPROVAL ? settingsRepository.isTimesheetApprovalEnabled() : settingsRepository.isIssueApprovalEnabled())` |
| `TransitionService`·`TransitionValidatorService`·`TransitionExecutor` | `featureEnabled = () => settingsRepository.isIssueApprovalEnabled()` (`projectEnablement.js` 에 `isIssueApprovalEnabled` re-export 래퍼를 두고 거기서 가져와도 된다 — 기존 import 줄 하나로) |
| `FieldChangeService`·`FieldChangeEventService` | 같음 |
| `TimesheetService` | `features = () => settingsRepository.featureFlags()`, `timesheetEnabled = () => settingsRepository.isTimesheetApprovalEnabled()` |
| `SettingsService` | 기존 `repository` 로 충분(신규 `teams = teamRepository` 만 추가 — 개요 카운트) |

`ApprovalService.assertFeatureOpen(kind)`:
```js
async assertFeatureOpen(kind) {
  const feature = featureOfTargetKind(kind);
  if (!feature) return;
  if (!(await this.featureEnabled(feature))) {
    const code = feature === Feature.TIMESHEET_APPROVAL ? ErrorCodes.TIMESHEET_APPROVAL_FEATURE_DISABLED : ErrorCodes.ISSUE_APPROVAL_FEATURE_DISABLED;
    throw new LogicalError(code, code);
  }
}
```

### 4.3 `getFeatureOverview` (신규, admin)
- 3단계 등록: `SettingsController` 에 `guardedDefine(resolver, 'getFeatureOverview', …)` → `PermissionMap` 에 `getFeatureOverview: { admin: true }` → SettingsController 는 이미 `CONTROLLER_REGISTRARS` 에 있다(추가 불필요, 계약 테스트가 대조).
- `SettingsService.getFeatureOverview()`:
  - `projects.configured` = `repository.isProjectScopeConfigured()`(KVS 1)
  - `projects.enabledCount` = `repository.countEnabledProjects()` — 신규, `SELECT COUNT(*) AS c FROM approval_project_config WHERE enabled = 1`. 테이블 미준비면 `null`(던지지 않음). `configured=false` 면 쿼리하지 않고 `null`(화면은 "모든 프로젝트").
  - `teams.enabledCount` = `teamRepository.countEnabled()` — 신규, `SELECT COUNT(*) AS c FROM timesheet_team WHERE enabled = 1`(인덱스 `ix_ts_team_list (enabled, …)` 사용). 미준비·실패 `null`.
  - 각 항목 `.catch(() => null)` — 개요 일부 실패가 화면 전체를 막지 않게.
- 워크포스 연결 상태는 이 resolver 에 넣지 않는다 — 기존 `getWorkforceLinkStatus`(같은 쿼리키 `settingsKeys.workforceLink()`)를 연동 켬일 때만 화면이 부른다(무거운 8 SQL 을 끔 상태에서 피한다).

### 4.4 CAS·트리거·스윕
- CAS·스키마 변경 없음. 새 트리거·스케줄 없음. 스윕 fan-out 작업 추가 없음.

## 5. 스키마·마이그레이션

없음. KVS boolean 2개는 미저장 = 기본값 true 라 이전 작업도 없다(기존 설치 그대로 켬).

## 6. Jira 연결

- 모듈·scope 무변경. 새 REST 호출 없음.
- 끔 상태의 **줄어드는** 호출: `submitTimesheet` 수집, `createTransitionApproval` 의 `issueWithTransitions`, 필드 폼의 `issueWithFields`, validator 의 SQL·changelog 조회, 자동 전환 POST.
- asApp 신규 없음. validator·executor 는 기존 경로 그대로(불변식 8 무관).
- **미검증 의존 없음** — Jira 플랫폼 동작에 새로 기대는 것이 없다(validator 가 `{result:true}` 를 돌려주면 통과하는 것은 기존 `PASS_DISABLED` 와 같은 경로).

## 7. 프론트

### 7.1 기능 상태 원천 (순수 + 훅)

`static/ui/src/features/settings/featureStateModel.js` (신규, 순수):
```js
/** 정책 → 기능 상태. 모르면(null/undefined) null — 호출부는 null 이면 **전부 보여 준다**(표시 fail-open). */
export const featureStateOf = (policy) => (policy == null ? null : {
  issueApproval: policy.issueApprovalEnabled !== false,
  timesheetApproval: policy.timesheetApprovalEnabled !== false,
  transitionEnforced: policy.transitionApprovalEnabled !== false,
});
/** SELF 맥락(getTimesheetContext.features) → 같은 모양. null 이면 null. */
export const featureStateOfContext = (context) => (context?.features == null ? null : {
  issueApproval: context.features.issueApproval !== false,
  timesheetApproval: context.features.timesheetApproval !== false,
  transitionEnforced: null,
});
/** 메뉴 배지 — 'off' | 'submissionsOff' | 'bypass' | null */
export const featureBadgeOf = (key, features) => {
  if (!features) return null;
  if (key === 'approval') return features.issueApproval === false ? 'off' : (features.transitionEnforced === false ? 'bypass' : null);
  if (key === 'timesheet') return features.timesheetApproval === false ? 'submissionsOff' : null;
  return null;
};
```
- 기본 켬 키라 `!== false`(운영 모드의 `=== true` 와 반대 방향 — 각 키의 서버 기본값과 같은 쪽). 서버가 항상 boolean 을 주므로 실제 차이는 없다.

`useFeatureState({ enabled })` (신규 훅, `useOperatingMode.js` 옆): `useQuery({ queryKey: settingsKeys.policy(), queryFn: getApprovalSettings, staleTime: 5분, enabled, retry:false })` → `featureStateOf(data)`, 실패·로딩은 null. **`useOperatingMode` 와 같은 쿼리키**라 요청은 1번.

### 7.2 설정 메뉴 (`settingsNavigation.js`)

| 묶음 | 항목(순서) | 변경 |
|---|---|---|
| `general` 일반 | **`features`**, `policy`, `projects`, `managers`, **`approvalSetup`** | `features` 신규(첫 항목·기본 진입), `approvalSetup` 신규(결재선·승인 그룹·승인자 탭) |
| `issue` 이슈 승인 | `approval` | 탭 없는 단일 화면으로(§7.4). 배지 `off`/`bypass` |
| `worklog` 워크로그·타임시트 | `timesheet`, `worklogControl`, `workforce` | `timesheet` 배지 `submissionsOff`. 나머지 그대로(운영 모드 배지 유지) |
| `records` 기록 | `audit`, `data` | 그대로(항상 보임) |

- 아이콘: `features` → `@atlaskit/icon/core/list-checklist`, `approvalSetup` → `@atlaskit/icon/core/tree`(둘 다 설치본에 존재 확인).
- 라벨 키: `policy.settings.tab.features`, `policy.settings.tab.approvalSetup`.
- `settingsNavigation(t, { mode, features })`·`settingsNavigationGroups(t, { mode, features })` — 옵션 추가. 배지는 기존 `badgeOf` 토큰 span 패턴을 일반화: `appearance` `default`(off·submissionsOff) / `moved`(bypass, 토큰 `color.background.warning`·`color.text.warning`). `data-testid`: `settings-nav-${key}-feature-${badge}`.
- **접기 규칙(운영 모드와 일관)**: 메뉴 항목은 **절대 빼지 않는다**. 끈 기능은 항목 이름 + 배지를 남기고, 세부는 **화면 안에서** 접는다(§7.4·§7.5). 이슈 묶음은 항목이 하나뿐이라 화면 단위 접기가 곧 "세부 접기"다. 워크로그 묶음은 인증·마감·팀·통제·연동이 끔과 독립이라 접을 세부가 없다 — 배지와 화면 상단 안내만 둔다.
- `normalizeSetting` 미지 값 → **`'features'`**(기존 `'policy'`). `SettingsPage` 초기 `selected` = `'features'`.
- 옛 위치 정규화 — `LEGACY_SETTINGS` 갱신 + 순수 함수 추가:
  ```js
  const LEGACY_SETTINGS = {
    worklogHistory: { key: 'audit', section: 'worklog' },
    flows: { key: 'approvalSetup', section: 'flows' }, groups: { key: 'approvalSetup', section: 'groups' },
    approvers: { key: 'approvalSetup', section: 'approvers' },
  };
  /** (setting, section) → 정규 위치. approval + flows|groups|approvers(오늘 미커밋 settings-restructure 의 위치)도 approvalSetup 으로. */
  export const canonicalSettingLocation = (rawSetting, section) => { … return { key, section } };
  ```
  `InboxPage` 의 replace effect(`InboxPage.jsx:178-185`)는 `canonicalSettingLocation` 결과가 현재 URL 과 다르면 `setting`·`section` 을 replace 한다(`auditTab` 은 지금처럼 읽기 호환만).
- `SettingsPanel` `TABBED` = `['approvalSetup', 'timesheet', 'audit']`(`approval` 제거). `SettingsPanel` 에 **`onNavigate(key, section?)`** prop 추가 → `features` 화면·`FeatureOffNotice` 의 링크가 쓴다. `SettingsPage` 는 `setSelected(key); setSection(section ?? null)`, `InboxPage` 는 `updateInboxParams({ setting:key, section })`.

### 7.3 "사용할 기능" 화면 — `features/settings/FeatureSelectionSettings.jsx` (신규, lazy)

구조(SettingsPageIntro + SettingsSection ×3, settings-design 규칙):
```
SettingsPageIntro  policy.features.intro
[경고] 두 승인 기능이 모두 꺼짐 → SectionMessage warning policy.features.bothOff
SettingsSection 이슈 승인 (testId feature-issueApproval)
  FeatureToggle(issueApprovalEnabled)  + 설명 policy.features.issue.description
  SettingsRows: 적용 프로젝트(모든 프로젝트 | 선택한 프로젝트 n개 | '—') · 상태 변경 전 승인 확인(켜짐 | Lozenge moved "비상 해제 중")
  링크: 적용 프로젝트 고르기(projects) · 이슈 승인 설정(approval) · 결재선·승인 그룹(approvalSetup)
SettingsSection 기간별 작업 시간 승인 (testId feature-timesheetApproval)
  FeatureToggle(timesheetApprovalEnabled) + 설명 + Text subtle policy.features.timesheet.independent
  SettingsRows: 승인 단위(월|주 — 정책 approvalUnit) · 팀 명부(팀 n개 | '—')
  링크: 타임시트 설정(timesheet) · 팀 명부(timesheet, section teams)
SettingsSection 워크포스 연동 (testId feature-workforceLink)
  WorkforceLinkToggle (WorkforceLinkSettings 의 EnabledToggle 을 파일로 떼어 export — 두 곳이 같은 컴포넌트·같은 mutation·같은 캐시)
  설명 policy.features.workforce.description
  SettingsRows: 연결 상태 한 줄(아래)
  링크: 워크포스 연동 설정(workforce)
```
- 쿼리: `settingsKeys.policy()`(getApprovalSettings), **`settingsKeys.featureOverview()`**(신규 키, getFeatureOverview), 연동 켬일 때만 `settingsKeys.workforceLink()`(getWorkforceLinkStatus, 기존 키 재사용).
- 연결 상태 순수 함수(`featureStateModel.js`): `workforceLinkLineOf({ enabled, status, failed })` → `'OFF'`(정책 꺼짐) | `'LINKED'`(`status.certPublish.linkedAt` 숫자) | `'WAITING'`(켜짐, linkedAt 없음) | `'UNKNOWN'`(조회 실패). LINKED 는 `{time}` 에 linkedAt 포맷.
- `FeatureToggle({ policyKey, feature })`:
  - 켜기 → 바로 `saveApprovalSettings({ [policyKey]: true })`.
  - 끄기 → **확인 모달**(`ModalDialog`, 제목/본문 `policy.features.confirm.{issueOff|timesheetOff}.*`, 확인 버튼 `policy.features.confirm.turnOff` appearance warning). 취소 시 호출 없음.
  - `onSuccess`: `setQueryData(settingsKeys.policy(), settings)` + invalidate `settingsKeys.audit()`·`settingsKeys.featureOverview()`·`timesheetKeys.context()`.
  - testId: `feature-toggle-${feature}`, 모달 `feature-off-confirm`.
- 정책 조회 실패 → 기존 패턴(`policy.loadFailed` + errorText), 토글 없음. 개요 실패 → 해당 행 '—'.

### 7.4 이슈 승인 화면 재구성

- **`IssueApprovalSettings.jsx`**: 탭 제거. `SettingsPageIntro`(`policy.issueApproval.hint` — 문구 교체) 아래
  - 기능 켬 또는 모름: `<IssueApprovalPolicySettings/>` + `<EmergencyBypassSection/>`
  - 기능 끔: `<FeatureOffNotice feature="issueApproval" onNavigate>` 안에 같은 두 컴포넌트(기본 접힘).
- **`IssueApprovalPolicySettings.jsx`**: 폼에서 `transitionApprovalEnabled` 를 **제거**(formKey·submit patch·BooleanField 모두). 남는 키: `fieldChangeApplyFallback`, `statusLabels`. 상태 표시명 저장이 비상 스위치를 건드리지 않게 된다(감사 `transitionEnforce` 행이 엉뚱하게 생기지 않음).
- **`EmergencyBypassSection.jsx`** (신규): `SettingsSection` title `policy.emergency.title`, description `policy.emergency.description`.
  - Toggle `policy.emergency.toggle`("승인 없이 상태 변경 허용") — 체크 = `transitionApprovalEnabled === false`. testId `emergency-bypass-toggle`.
  - 켜기(=비상 해제) → 확인 모달 `policy.emergency.confirm.*`(testId `emergency-bypass-confirm`) → `saveApprovalSettings({ transitionApprovalEnabled: false })`. 끄기(=강제 복귀) → 바로 `{ transitionApprovalEnabled: true }`.
  - 해제 중이면 상단 `SectionMessage warning` `policy.emergency.activeWarning`(testId `emergency-bypass-active`).
  - 이슈 승인 기능이 꺼져 있으면 Text subtle 한 줄 `policy.emergency.moot`("이슈 승인이 꺼져 있어 지금은 승인 확인이 동작하지 않습니다").
  - 섹션 순서: 정책 카드 → 상태 표시명 → **비상 해제(맨 아래)**.
- **`FeatureOffNotice.jsx`** (신규, `features/settings/`): `SectionMessage information` title `policy.features.off.{feature}.title`, 본문 `.body`, actions: `policy.features.off.turnOn`(onNavigate('features')), `policy.features.off.showSettings|hideSettings`(children 펼침 토글, 기본 접힘). testId `feature-off-${feature}`. 저장값은 손대지 않는다(숨김 ≠ 비활성, 운영 모드 §7 원칙).
- **`ApprovalSetupSettings.jsx`** (신규) + `approvalSetupModel.js`: 기존 IssueApprovalSettings 의 탭 구조를 그대로 옮긴다. `APPROVAL_SETUP_TABS = ['flows','groups','approvers']`, 기본 `flows`, testId `approval-setup-tab-${key}`, 탭 라벨 기존 키(`policy.settings.tab.flow|group|approver`), intro `policy.approvalSetup.hint`. 내용 lazy(`importWithReloadOnce`) 유지. `issueApprovalModel.js`(settings) 의 탭 상수는 삭제(소비처 없음 확인 후).

### 7.5 타임시트 설정 (기능 끔)
- `TimesheetSettings.jsx` 의 `policy` 탭 맨 위에 `FeatureOffNotice feature="timesheetApproval"` 를 **접기 없이 안내만**(children 없이) 표시 — 정책 탭 값(단위·시간대·제한선·잠금·자동 마감)은 인증·기간 마감·사전 승인 정책과 공유되므로 접지 않는다. 다른 탭(cert·periodClose·teams)은 무변경.
- `lockSubmitted` 체크박스 아래 도움말 `timesheet.settings.lockSubmittedHelp`(라벨 9 교정).

### 7.6 업무함·일반 사용자
- 비관리자 화면은 **`getApprovalSettings` 를 부르지 않는다.** 원천은 `getTimesheetContext.features`(업무함이 이미 항상 호출, 5분 stale).
- `InboxPage`:
  - `const contextFeatures = featureStateOfContext(timesheetContext)` (null = 모름 → 전부 보임).
  - 설정 뷰 메뉴 배지: `useFeatureState({ enabled: view === 'settings' })`(관리자 전용, 거부 시 null) — `groups` useMemo 의존성에 추가, `settingsNavigation(t, { mode, features })`.
  - `TeamTimesheetPage` 에 `submissionsOff={contextFeatures?.timesheetApproval === false}` 전달 → 페이지 상단 `SectionMessage information` `timesheet.team.submissionsOff`(testId `team-timesheet-submissions-off`). 결정 버튼 무변경.
  - 탭(`visibleTabKeys`)은 바꾸지 않는다 — 내 타임시트 탭에는 본인 인증 패널·기존 기록이 있다.
- 내 타임시트: 서버 `submitBlockedCode` 가 진실(§2.3). `submitPlan` 은 그대로 `blocked` 가 되어 제출 버튼이 사라지고 회수 버튼은 남는다. `SubmitBar.jsx:40` appearance 조건에 `TIMESHEET_APPROVAL_FEATURE_DISABLED` 를 `information` 으로 추가.
- 이슈 패널:
  - `IssueGeneralApprovalSection.jsx:91` — `notAvailableReason === 'FEATURE_DISABLED'` 면 `issueApproval.section.featureDisabled`(testId `issue-approval-feature-disabled`). 버튼은 서버 `canRequest` 그대로라 자동으로 사라진다.
  - `transitionModel.notEnforcedKey`(`transitionModel.js:31-35`) 허용 목록에 `'FEATURE_DISABLED'` 추가 → `transition.list.notEnforced.FEATURE_DISABLED`.
  - `FieldChangeSection.jsx:90` — `'FEATURE_DISABLED'` 면 `fieldChange.section.featureDisabled`(testId `field-change-feature-disabled`). `sectionVisible` 은 `NO_RULE` 외 true 라 그대로 보인다(기록 유지).
  - `FieldChangeRequestForm.jsx:24` `STALE_CODES` 에 `ISSUE_APPROVAL_FEATURE_DISABLED` 추가(폼을 연 사이 꺼진 경우 다시 조회). 전환·일반 승인 요청 폼은 에러 코드 문구 표시로 충분.
  - 프로젝트 규칙 화면: `FieldChangeRuleSettings.jsx:148` 옆, `TransitionRuleSettings.jsx` 같은 자리에 `view?.featureEnabled === false` → `SectionMessage warning` `fieldChange.rules.featureDisabled` / `transition.rules.featureDisabled`.
  - 전환 적용 코드 `transitionApply.code.FEATURE_DISABLED` 문구(기존 code 맵이 자동 사용).
- 승인 상세(`ApprovalDetail.jsx:341,456`): 서버 `canRequest` 가 false 가 되므로 코드 변경 없음.
- 시간 추적 제공자 화면: **변경 없음**(제출 버튼 없음, 사전 승인은 범위 밖).

### 7.7 쿼리키·URL
- 신규 `settingsKeys.featureOverview: () => [...settingsKeys.all, 'featureOverview']`.
- 재사용: `settingsKeys.policy()`(기능·모드·비상 스위치 공통), `settingsKeys.workforceLink()`, `timesheetKeys.context()`.
- `section` URL: `setting=approvalSetup&section=flows|groups|approvers` 신설. `setting=approval` 은 `section` 을 쓰지 않는다(들어오면 §7.2 정규화). `setting` 미지정·미지 값 → `features`.
- 엔트리 3곳(craco·public html·manifest) 무변경. lazy 청크 추가(FeatureSelectionSettings·ApprovalSetupSettings) → `importWithReloadOnce` 필수.
- 설정 iframe 높이: 모달은 내용 높이(100vh 금지).

### 7.8 감사 화면
- `AuditSettings.jsx:23` `AREA_APPEARANCE` 에 `feature: 'new'`, `transitionEnforce: 'moved'` 추가. 라벨 `policy.audit.area.feature|transitionEnforce`.

## 8. i18n 키 (kr / en — 모두 신규, `npm run merge`)

### 8.1 `policy.json`
| 키 | kr | en |
|---|---|---|
| `settings.tab.features` | 사용할 기능 | Features in use |
| `settings.tab.approvalSetup` | 결재 구성 | Approval setup |
| `settings.badge.off` | 사용 안 함 | Off |
| `settings.badge.submissionsOff` | 제출 중지 | Submissions off |
| `settings.badge.bypass` | 비상 해제 중 | Bypass on |
| `features.intro` | 이 앱에서 쓸 기능을 고릅니다. 끈 기능은 새 요청과 제출만 받지 않고, 진행 중인 결재와 기록은 그대로 둡니다. | Choose the features this app uses. A feature that is off stops taking new requests and submissions; approvals in progress and records stay as they are. |
| `features.bothOff` | 이슈 승인과 기간별 작업 시간 승인이 모두 꺼져 있습니다. 새 요청과 제출을 받지 않습니다. | Issue approval and timesheet approval are both off. No new requests or submissions are accepted. |
| `features.issue.title` | 이슈 승인 | Issue approval |
| `features.issue.toggle` | 이슈 승인 사용 | Use issue approval |
| `features.issue.description` | 일반 승인, 상태 변경 승인, 필드 변경 요청에 사용합니다. 적용 프로젝트는 아래에서 고릅니다. | Used for general approvals, status change approvals and field change requests. Choose the projects below. |
| `features.issue.projectsLabel` | 적용 프로젝트 | Projects |
| `features.issue.projectsAll` | 모든 프로젝트 | All projects |
| `features.issue.projectsSome` | 선택한 프로젝트 {count}개 | {count} selected projects |
| `features.issue.enforceLabel` | 상태 변경 전 승인 확인 | Approval check before status change |
| `features.issue.enforceOn` | 켜짐 | On |
| `features.issue.enforceBypassed` | 비상 해제 중 — 승인 없이 상태를 바꿀 수 있습니다 | Bypassed — status can change without approval |
| `features.timesheet.title` | 기간별 작업 시간 승인 | Timesheet approval |
| `features.timesheet.toggle` | 기간별 작업 시간 승인 사용 | Use timesheet approval |
| `features.timesheet.description` | 사람별 주·월 기록을 제출하고 승인받습니다. 여러 프로젝트의 시간이 포함됩니다. | People submit their weekly or monthly hours for approval. Hours from several projects are included. |
| `features.timesheet.independent` | 작업 시간 인증, 기간 마감, 워크로그 통제는 이 선택과 상관없이 각자의 설정대로 동작합니다. | Worklog certification, period close and worklog control follow their own settings regardless of this choice. |
| `features.timesheet.unitLabel` | 승인 단위 | Approval unit |
| `features.timesheet.teamsLabel` | 팀 명부 | Team roster |
| `features.timesheet.teamsCount` | 팀 {count}개 | {count} teams |
| `features.workforce.title` | 워크포스 연동 | Workforce link |
| `features.workforce.description` | 검증된 워크포스 팀장 정보를 우선 쓰고, 없으면 이 앱의 팀 명부를 씁니다. 점검 기준·인증 결과·통제도 함께 연동됩니다. | Verified Workforce team leads are used first; if there are none, this app's team roster is used. Check criteria, certification results and control are linked as well. |
| `features.workforce.stateLabel` | 연결 상태 | Connection |
| `features.workforce.state.OFF` | 꺼짐 — 이 앱의 팀 명부로 결재자를 정합니다 | Off — approvers come from this app's team roster |
| `features.workforce.state.WAITING` | 켜짐 — 아직 검증된 워크포스 정보를 받지 못했습니다 | On — no verified Workforce data received yet |
| `features.workforce.state.LINKED` | 연결됨 — 마지막 확인 {time} | Linked — last verified {time} |
| `features.workforce.state.UNKNOWN` | 연결 상태를 확인하지 못했습니다 | Couldn't check the connection |
| `features.link.projects` | 적용 프로젝트 고르기 | Choose projects |
| `features.link.issueSettings` | 이슈 승인 설정 | Issue approval settings |
| `features.link.approvalSetup` | 결재선·승인 그룹 | Approval lines & groups |
| `features.link.timesheetSettings` | 타임시트 설정 | Timesheet settings |
| `features.link.teams` | 팀 명부 | Team roster |
| `features.link.workforce` | 워크포스 연동 설정 | Workforce link settings |
| `features.confirm.issueOff.title` | 이슈 승인을 끌까요? | Turn off issue approval? |
| `features.confirm.issueOff.body` | 새 일반 승인, 상태 변경 승인, 필드 변경 요청을 받지 않습니다. 진행 중인 결재는 마무리할 수 있고 기록은 그대로 남습니다. 워크플로에 붙인 승인 확인은 통과로 바뀌어 승인 없이 상태를 바꿀 수 있고, 승인된 상태 변경의 자동 적용도 멈춥니다. 다시 켜면 저장된 규칙대로 바로 확인합니다. | New general, status change and field change requests won't be accepted. Approvals in progress can still be completed and records are kept. Approval checks on workflows will pass, so status can change without approval, and approved status changes won't be applied automatically. Turning it back on enforces the saved rules right away. |
| `features.confirm.timesheetOff.title` | 기간별 작업 시간 승인을 끌까요? | Turn off timesheet approval? |
| `features.confirm.timesheetOff.body` | 새 제출과 다시 제출을 받지 않습니다. 결재 중인 기간은 승인·반려·회수할 수 있고, 승인된 기간의 잠금과 인증·마감 기록은 그대로 유지됩니다. | New submissions and resubmissions won't be accepted. Periods under approval can still be approved, rejected or withdrawn, and locks, certifications and close records for approved periods are kept. |
| `features.confirm.turnOff` | 끄기 | Turn off |
| `features.off.issueApproval.title` | 이슈 승인을 사용하지 않습니다 | Issue approval is off |
| `features.off.issueApproval.body` | 새 요청을 받지 않습니다. 저장된 설정은 그대로이며 다시 켜면 바로 적용됩니다. | New requests aren't accepted. Saved settings are kept and apply again as soon as you turn it back on. |
| `features.off.timesheetApproval.title` | 기간별 작업 시간 승인을 사용하지 않습니다 | Timesheet approval is off |
| `features.off.timesheetApproval.body` | 새 제출을 받지 않습니다. 인증, 기간 마감, 팀 명부는 계속 쓸 수 있습니다. | New submissions aren't accepted. Certification, period close and the team roster keep working. |
| `features.off.turnOn` | 사용할 기능에서 켜기 | Turn on in Features in use |
| `features.off.showSettings` | 저장된 설정 보기 | Show saved settings |
| `features.off.hideSettings` | 설정 접기 | Hide settings |
| `emergency.title` | 비상 해제 | Emergency bypass |
| `emergency.description` | 승인 앱에 문제가 있을 때 워크플로의 승인 확인을 잠시 풀어 업무를 이어 가게 합니다. 이슈 승인을 쓰지 않으려면 "사용할 기능"에서 끄세요. | Temporarily lifts approval checks on workflows so work can continue when the approval app has a problem. To stop using issue approval, turn it off in Features in use. |
| `emergency.toggle` | 승인 없이 상태 변경 허용 | Allow status changes without approval |
| `emergency.activeWarning` | 비상 해제 중입니다. 승인 없이 상태를 바꿀 수 있습니다. | Emergency bypass is on. Status can change without approval. |
| `emergency.moot` | 이슈 승인이 꺼져 있어 지금은 승인 확인이 동작하지 않습니다. | Issue approval is off, so approval checks aren't running right now. |
| `emergency.confirm.title` | 비상 해제를 켤까요? | Turn on emergency bypass? |
| `emergency.confirm.body` | 승인 없이 상태 변경이 허용됩니다. 저장된 규칙은 유지되며 비상 해제를 끄면 바로 다시 강제됩니다. | Status changes will be allowed without approval. Saved rules are kept and are enforced again as soon as you turn the bypass off. |
| `emergency.confirm.confirm` | 비상 해제 켜기 | Turn on bypass |
| `approvalSetup.hint` | 이슈 승인, 작업 시간 사전 승인, 타임시트 추가 단계가 함께 쓰는 결재선·승인 그룹·승인자 명부입니다. | Approval lines, approval groups and approver rosters shared by issue approval, worklog pre-approval and extra timesheet steps. |
| `audit.area.feature` | 사용할 기능 | Features in use |
| `audit.area.transitionEnforce` | 상태 변경 전 승인 확인 | Approval check before status change |

**문구 교체**(기존 키): `issueApproval.hint` → "이슈 상태 변경·필드 변경 승인 정책과 비상 해제를 관리합니다." / "Manage status change and field change approval policy and the emergency bypass."
요구서 3번 확인 모달 원문의 "다시 켜면"은 토글이 "승인 없이 허용"(반대 방향)이라 오독되므로 "비상 해제를 끄면"으로 바꿨다 — 뜻은 같다.

### 8.2 기타 네임스페이스
| 파일.키 | kr | en |
|---|---|---|
| `error.ISSUE_APPROVAL_FEATURE_DISABLED` | 이슈 승인을 사용하지 않아 새로 요청할 수 없습니다. | Issue approval is turned off, so you can't make a new request. |
| `error.TIMESHEET_APPROVAL_FEATURE_DISABLED` | 기간별 작업 시간 승인을 사용하지 않아 새로 제출할 수 없습니다. | Timesheet approval is turned off, so you can't submit. |
| `issueApproval.section.featureDisabled` | 관리자가 이슈 승인을 꺼 두어 새로 요청할 수 없습니다. 진행 중인 결재와 기록은 볼 수 있습니다. | An administrator has turned off issue approval, so you can't make a new request. You can still view approvals in progress and records. |
| `fieldChange.section.featureDisabled` | (위와 같은 문장) | (same as above) |
| `fieldChange.rules.featureDisabled` | 사이트 관리자가 이슈 승인을 꺼 두었습니다. 규칙은 저장되지만 다시 켤 때까지 적용되지 않습니다. | A site administrator has turned off issue approval. Rules are saved but won't apply until it's turned back on. |
| `transition.rules.featureDisabled` | (위와 같은 문장) | (same as above) |
| `transition.list.notEnforced.FEATURE_DISABLED` | 관리자가 이슈 승인을 꺼 두어 상태 변경에 승인이 필요하지 않습니다. | An administrator has turned off issue approval, so status changes don't need approval. |
| `transitionApply.code.FEATURE_DISABLED` | 이슈 승인 사용 안 함 | Issue approval turned off |
| `timesheet.team.submissionsOff` | 기간별 작업 시간 승인이 꺼져 있어 새 제출을 받지 않습니다. 결재 중인 기간은 계속 처리할 수 있습니다. | Timesheet approval is off, so no new submissions are accepted. Periods under approval can still be processed. |
| `timesheet.settings.lockSubmittedHelp` | 승인된 기간은 이 설정과 상관없이 항상 잠깁니다. | Approved periods are always locked regardless of this setting. |

### 8.3 라벨 15 교정 표 (kr 값 교체, en 은 같은 뜻으로)

| # | 파일:키 | 현재 kr → 대체 kr | 현재 en → 대체 en |
|---|---|---|---|
| 1 | `policy:transitionApprovalEnabled` | 전환 승인 강제(끄면 모든 validator 가 통과) → **상태 변경 전 승인 확인** | Enforce transition approvals (off = every validator passes) → **Approval check before status change** |
| 2 | `policy:statusFlow.title` | 전이가 고정된 승인 워크플로 → **승인 처리 순서** | Fixed approval workflow → **Approval processing order** |
| 3 | `policy:approverAccessCheck` | 요청 시 승인자의 대상 열람 권한 확인 → **결재자가 이슈를 볼 수 있는지 확인** | Check that approvers can view the target when requesting → **Check that approvers can see the issue** |
| 4 | `policy:restrictAccess` | 등록된 사용자만 앱 사용 (…) → **앱을 사용할 사람 제한** | Only registered users can use the app (…) → **Limit who can use the app** |
| 5 | `timesheet:settings.unit.WEEK` | 주(ISO) → **주 단위 — 월요일부터 일요일까지** | Week (ISO) → **Weekly — Monday to Sunday** |
| 6 | `timesheet:settings.limits` | 제한선 → **기록 시간·날짜 기준** | Limits → **Hour and date rules** |
| 7 | `timesheet:settings.backdate` | 소급 입력 허용 일수(0=끔) → **일한 뒤 기록할 수 있는 일수(0=제한 없음)** | Days allowed for late logging (0 = off) → **Days allowed to log after the work (0 = no limit)** |
| 8 | `timesheet:settings.exceptionGroup` | 예외 승인 그룹 → **기준을 넘긴 기록의 추가 결재자 그룹** | Exception approval group → **Extra approver group for entries over the rules** |
| 9 | `timesheet:settings.lockSubmitted` | 제출·승인된 기간의 작업 로그 입력 잠금 → **결재 중인 기간에 작업 시간 추가 금지** (+ `lockSubmittedHelp` "승인된 기간은 이 설정과 상관없이 항상 잠깁니다.") | Lock work logs in submitted and approved periods → **Block new hours in periods under approval** (+ help) |
| 10 | `timesheet:periodClose.edit` | 수정까지 허용 → **승인·인증을 해제하고 수정 허용** (`editWarning` 유지) | Allow edits too → **Release approvals and certifications and allow edits** |
| 11 | `worklogControl:phase.B` | B · 확정분 숨김 → **B · 승인·인증된 기록을 앱에서만 관리** (확인 화면의 Jira 화면·검색·집계 영향 문구 유지) | B · Hide confirmed entries → **B · Manage approved and certified entries only in this app** |
| 12 | `worklogControl:phase.C` | C · 연동 이슈 전체 숨김 → **C · 워크포스 연동 이슈의 모든 기록을 앱에서만 관리** (영향 문구 유지) | C · Hide all on linked issues → **C · Manage all entries on Workforce-linked issues only in this app** |
| 13 | `worklogControl:startField.title` | 이슈 기간 창 → **이슈 시작일~마감일 안에서만 작업 시간 기록** | Issue date window → **Log hours only between the issue start and due dates** |
| 14 | `workforce:signing.fingerprint` | 공개키 지문 → **연동 확인용 키 식별값** | Public key fingerprint → **Link verification key ID** |
| 15 | `workforce:publish.title` | 승인 상태 게시 → **워크포스에 승인 결과 보내기** | Approval status publishing → **Send approval results to Workforce** |

- 1번은 사용할 기능 화면에 두지 않는다 — 비상 해제 섹션의 상태 줄·감사 area 라벨로만 쓴다(조작 토글은 `emergency.toggle`).
- 11·12번은 operating-mode 의 `worklogControl.mode.*` 문구와 충돌 없음(단계 머리만 바뀜). Phase 라벨을 찾는 테스트는 키로 찾으므로 영향 없음.
- 5번 키가 다른 화면(기간 선택기 등)에서도 쓰이면 그대로 따라 바뀐다 — 의도(같은 뜻).

## 9. 용량·호출량

| 경로 | 이전 | 이후 |
|---|---|---|
| 행 수 | — | **0**(테이블 무변경. 감사 행은 토글 시에만 1행) |
| `getPolicy`(캐시 없음) | KVS 51키(청크 11회) | KVS 53키(청크 11회 그대로, 60초 컨테이너 캐시). SQL 0 |
| `getTimesheetContext` | 기존 | +KVS 2(병렬). SQL 0 |
| `getMyTimesheet` | 기존 | +KVS 1. SQL 0 |
| `submitTimesheet` 켬/끔 | 기존 / — | +KVS 1 / **KVS 1 로 종료**(Jira 수집·SQL 0) |
| 생성 resolver 3종 | 기존 | +KVS 1(전용 검사) +KVS 1(createForTarget 공통 경계) |
| viewForTarget(요청 가능 판정 시) | 기존 | +KVS 1 |
| validator(규칙 있는 전환) | KVS 1 + SQL | KVS 2 **병렬**(지연 증가 없음). 끔이면 SQL 0 으로 종료 |
| `TransitionExecutor.apply` | 기존 | +KVS 1(POST 전) |
| `FieldChangeEventService` | 기존 | 규칙 매칭 후에만 +KVS 1 |
| `getFeatureOverview` | — | KVS 1 + SQL ≤ 2(COUNT, 인덱스) — 관리자 화면 진입 시만 |
| Jira 호출 | — | 증가 0. 끔 상태에서 감소 |

**유휴 SQL 예산: 변화 없음.** 새 스케줄 트리거·fan-out 작업 없음. 추가된 판정은 전부 KVS(사용자·이벤트 경로)이고, 사용자 0명·이벤트 0건인 날의 일일 `approval-sweep` 작업은 한 줄도 바뀌지 않는다. `idleSqlBudget.test.js` 의 상한(TIMESHEET 5, 미연동 합계 27, 연동 38)은 **그대로** 두고, "두 기능 끔(KVS false)" 케이스를 추가해 같은 상한 이하임을 고정한다. 끔 상태의 빈 설치 조기 종료 최적화는 하지 않는다(기존 기록이 있는 끔 설치와 구별하려면 COUNT 가 필요해 절감이 상쇄된다 — 코덱스 §유휴 SQL).

## 10. 미검증

| 항목 | 영향 | 확인 방법 |
|---|---|---|
| (플랫폼) 없음 | 새 Jira/Forge 동작에 기대지 않는다. validator 통과는 기존 `PASS_DISABLED` 와 같은 `{result:true}` 경로 | — |
| (제품) 끔 상태에서 validator 가 붙은 워크플로의 실제 전환 | 통과해야 한다 | 개발 사이트에서 이슈 승인 끔 → 규칙 있는 전환 실행 → 성공, `forge logs` 대신 결과 상태(이슈 상태 변경 + `transition_request` 무장 없음) 확인 |
| (제품) 자동 적용 중 끔 | WAITING 행이 BLOCKED/FEATURE_DISABLED, 다시 켠 뒤 재시도로 APPLIED | 승인 직후 끔 → 상세 화면 적용 상태 확인 → 켬 → 재시도 |

## 11. 작업 분해

### backend 체크리스트
1. `src/domain/settings/features.js` + 테스트.
2. `SettingsRepository`: `SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`(true)·`GLOBAL_ONLY_KEYS` 에 두 키, `isIssueApprovalEnabled`·`isTimesheetApprovalEnabled`·`featureFlags`·`isTransitionApprovalEnforced`·`countEnabledProjects`. `transitionApprovalEnabled` 주석 교체. `projectEnablement.isTransitionApprovalEnabled` 는 `isTransitionApprovalEnforced` 위임(동작 동일).
3. `TeamRepository.countEnabled()`.
4. `SettingsService`: 정규화 2키, `getApprovalSettings` boolean 정규화, 감사 분리(§2.2), `getFeatureOverview`.
5. `SettingsController`·`PermissionMap`: `getFeatureOverview`(admin).
6. `ErrorCodes` 2개.
7. `ApprovalService`: `featureEnabled` 주입, `assertFeatureOpen`(createForTarget 맨 앞), `requestGate` 일반화, `createIssueApproval` 코드 분기.
8. `judge.js` `featureEnabled`·`PASS_FEATURE_DISABLED`; `TransitionValidatorService` 병렬 판정; `TransitionExecutor` `FEATURE_DISABLED`; `TransitionService` 생성 차단·사유·`listTransitionRules.featureEnabled`.
9. `FieldChangeService` `loadRequestable` 차단·`getIssueFieldChanges` 사유·`listFieldChangeRules.featureEnabled`; `FieldChangeEventService` 건너뛰기.
10. `TimesheetService`: `submitTimesheet` 조기 차단, `getMyTimesheet` 최우선 코드, `getTimesheetContext.features`.
11. 테스트(§12), `npm run check:bundle`, 백엔드 jest, `idleSqlBudget`.
12. `locales/*/error.json` 2키 kr/en(백엔드가 코드와 같이 넣는다 — 키 = 값 규칙).

### frontend 체크리스트
1. `featureStateModel.js`(+ `workforceLinkLineOf`), `useFeatureState`.
2. `settingsNavigation.js`: 항목 2개·순서·아이콘·배지·기본 `features`·`LEGACY_SETTINGS`·`canonicalSettingLocation`.
3. `SettingsPage`·`SettingsPanel`(`TABBED`, `onNavigate`, 초기 `features`), `InboxPage`(정규화 effect, 배지, `TeamTimesheetPage submissionsOff`, onNavigate 연결).
4. `FeatureSelectionSettings.jsx`, `FeatureToggle`, `WorkforceLinkToggle`(EnabledToggle 분리 — WorkforceLinkSettings 는 import 로 교체, 동작·testId 동일).
5. `IssueApprovalSettings` 단일화, `IssueApprovalPolicySettings` 에서 `transitionApprovalEnabled` 제거, `EmergencyBypassSection`, `FeatureOffNotice`, `ApprovalSetupSettings`·`approvalSetupModel`.
6. `TimesheetSettings` 정책 탭 안내, `TimesheetPolicySettings` lockSubmitted 도움말.
7. `SubmitBar` appearance, `IssueGeneralApprovalSection`·`FieldChangeSection`·`transitionModel`·`FieldChangeRequestForm` STALE_CODES·규칙 화면 2곳·`TeamTimesheetPage` 배너.
8. `AuditSettings` area 2개.
9. `settingsKeys.featureOverview`.
10. i18n(§8 전부 + 라벨 15) kr/en, `npm run merge`, UI jest, UI 빌드.

## 12. 테스트 목록 (회귀 시나리오 → 파일)

### 백엔드
| 시나리오(요구 완료 기준) | 파일 | 케이스 |
|---|---|---|
| 키 계약 | `src/resolver/settings/__test__/SettingsPolicyKeys.test.js`(갱신) | 두 키가 DEFAULT·SETTINGS_KEYS·GLOBAL_ONLY 에 있고 PROJECT_OVERRIDABLE 에 없음, 키 맵 집합 일치 |
| 판정 함수 | `src/resolver/settings/__test__/SettingsFeatureFlags.test.js`(신규) | 각 키 미저장→true, null→true, true→true, false→false; `featureFlags` 병렬; KVS 실패 → KvsError; `isTransitionApprovalEnforced` 미저장→true |
| 정규화·응답·감사 | 같은 파일 | 비 boolean → INVALID_TARGET; `getApprovalSettings` 항상 boolean; 끔 저장 → `feature/disable` 1행 + `policy/update` 없음; 같은 값 재저장 → 감사 0행; `transitionApprovalEnabled:false` → `transitionEnforce/disable`; 혼합 patch → 세 종류가 각자 행, `policy/update` detail 에 세 키 없음 |
| 개요 | 같은 파일 | 미구성 → `{configured:false, enabledCount:null}`(COUNT 미발행); 구성 → COUNT 값; 테이블 미준비 → null |
| 판정 순서 | `src/domain/transition/__test__/judge.test.js` | §3.2 세 케이스 |
| 기능 매핑 | `src/domain/settings/__test__/features.test.js` | §3.1 |
| **OFF 직접 호출 거부 코드** | `src/resolver/approval/__test__/ApprovalServiceFeatureGate.test.js`(신규) | createForTarget: ISSUE/ISSUE_TRANSITION/FIELD_CHANGE → `ISSUE_APPROVAL_FEATURE_DISABLED`, TIMESHEET → `TIMESHEET_APPROVAL_FEATURE_DISABLED`, WORKLOG_CREATE·WORKLOG_CERTIFICATION 은 통과; 차단 시 describe·supersede·createRequest 미호출(기존 PENDING 유지); `createIssueApproval` 코드 분기; viewForTarget `canRequest:false`·`notAvailableReason:'FEATURE_DISABLED'`(ISSUE·TIMESHEET) |
| **기존 pending 결재 처리 가능** | 같은 파일 | 끔 상태에서 `decideApproval`·`bulkApprove`·`cancelApproval` 이 PENDING 을 처리(기능 판정 미호출 단언) |
| 전환 생성·표시 | `src/resolver/transition/__test__/TransitionService.test.js` | 끔 → `ISSUE_APPROVAL_FEATURE_DISABLED`, reader·insertDraft 미호출; 조회 `notEnforcedReason:'FEATURE_DISABLED'` + history 유지 + onStatusObserved 호출; 사유 우선순위; `listTransitionRules.featureEnabled` |
| **validator 설치 상태에서 OFF** | `src/resolver/transition/__test__/TransitionValidatorService.test.js` | 끔 + 규칙·PENDING 후보 → `{result:true}`, rules·transitions 미조회, arm 없음; 판정 실패 → 강제(기존 REJECT 흐름); 두 판정 병렬 |
| **자동 적용 중 OFF** | `src/resolver/transition/__test__/TransitionExecutor.test.js` | WAITING + 끔 → BLOCKED/`FEATURE_DISABLED`, `jira.post` 미호출; `postStartedAt` 행 + 끔 → reconcile 정상(EXACT → APPLIED); 끔→켬 후 `retry:true` → POST 진행 |
| 필드 변경 | `src/resolver/fieldChange/__test__/FieldChangeService.test.js` | 폼·생성 → 코드(reader 미호출); 조회 사유 `FEATURE_DISABLED` + canRequest false + canApply 유지; 끔 상태 `applyFieldChange` 정상(A1) |
| 필드 변경 이벤트 | `src/resolver/fieldChange/__test__/FieldChangeEventService.test.js` | 끔 → skipped, bypass 미기록(A2) |
| 타임시트 | `src/resolver/timesheet/__test__/TimesheetService.test.js` | 끔 submit → 코드, collector·upsertWorklogRefs·createForTarget 미호출; supersedes 재제출도 동일; `getMyTimesheet` 최우선 코드(ALREADY_OPEN+changedSinceSubmit 이어도); `getTimesheetContext.features` / 실패 → null; 끔 상태 `decideTimesheets` 정상 |
| **인증만 사용·숨김 복구·재개 가능** | `test/feature/featureGateScope.contract.test.js`(신규) | §4.1 허용 목록 정적 대조(인증·마감·재개·통제·워크포스 모듈이 플래그를 읽지 않음) |
| resolver 등록 | `test/permission/permissionMap.contract.test.js`(자동) | `getFeatureOverview` 3곳 대조 |
| 유휴 SQL | `src/trigger/__test__/idleSqlBudget.test.js` | KVS 두 키 false 케이스 추가 — 기존 상한 이하 |

### 프론트
| 시나리오 | 파일 | 케이스 |
|---|---|---|
| 상태 원천 | `features/settings/__test__/featureStateModel.test.js`(신규) | null→null; 키 없음→true; false→false; context 변환; 배지 3종; `workforceLinkLineOf` 4상태 |
| 메뉴 | `features/settings/__test__/settingsNavigation.test.js` | features 첫 항목·기본값; approvalSetup 이 general 에; 옛 flows/groups/approvers → approvalSetup; `approval`+`flows` 정규화; 배지(off/bypass/submissionsOff); features null → 배지 없음·항목 수 동일 |
| 사용할 기능 | `features/settings/__test__/FeatureSelectionSettings.test.jsx`(신규) | 세 섹션; 끄기 → 모달 → 확인 시 단일 키 patch, 취소 시 호출 없음; 켜기 모달 없음; 워크포스 토글이 `settingsKeys.policy()` 캐시 교체; 상태 줄(모든 프로젝트 / n개 / 팀 n개 / 연결 상태); 링크 → onNavigate(key, section); 개요 실패 → '—' |
| 이슈 승인 | `features/settings/__test__/IssueApprovalSettings.test.jsx`(재작성) | 탭 없음; 기능 끔 → FeatureOffNotice + 접힘, 펼치기; 비상 해제 켜기 → 모달 → `{transitionApprovalEnabled:false}`, 취소 무호출; 해제 중 경고; 강제 복귀 모달 없음 |
| 이슈 승인 정책 폼 | `features/settings/__test__/PolicyFallback.test.jsx` | 저장 patch 에 `transitionApprovalEnabled` 없음 |
| 결재 구성 | `features/settings/__test__/ApprovalSetupSettings.test.jsx`(신규) | 탭 3개·기본 flows·onTabChange·lazy 내용 |
| 타임시트 설정 | `features/settings/__test__/TimesheetSettings.test.jsx` | 끔 → 정책 탭 안내, 다른 탭 무변경; lockSubmitted 도움말 |
| 업무함 | `features/inbox/InboxPage.test.jsx` | 설정 기본 진입 `features`; 옛 링크 replace; context features 끔 → 팀 타임시트 배너; **context 실패 → 전부 보임(fail-open)**; 설정 뷰가 아닐 때 getApprovalSettings 미호출 |
| 내 타임시트 | `features/timesheet/__test__/timesheetPure.test.js`(submitPlan) + `MyTimesheetPage.test.jsx`(SubmitBar) | `TIMESHEET_APPROVAL_FEATURE_DISABLED` → blocked·information·제출 버튼 없음·회수 버튼 유지 |
| 이슈 패널 | `features/issueApproval/__test__/*`, `features/fieldChange/__test__/*`, `features/transition/__test__/*` | FEATURE_DISABLED 문구 키 표시·요청 버튼 없음·이력 보임; notEnforcedKey 매핑; i18n 테스트 kr/en 키 존재 |
| 감사 | `features/audit/__test__/AuditTrail.test.jsx` | area `feature`·`transitionEnforce` 라벨 |
| 운영 모드 공존 | `WorkforceLinkSettings.test.jsx` | 토글 분리 뒤 testId·동작 동일 |

완료 조건: 백엔드·프론트 jest, UI 빌드, `npm run merge`, `npm run check:bundle`, `idleSqlBudget`(상한 수치 변경 없음).

## 변경 이력
| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-12 | 최초 작성 | feature-selection 요구 |
