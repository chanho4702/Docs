# 02 백엔드 보고서 — 사용할 기능 선택 (feature-selection)

작성: 2026-10-12 backend-engineer · 1회차 · 입력 `01_architect_design.md`(§2·§4·§11·§12 그대로)
설계와 불변식이 충돌한 곳은 없다. `static/ui` 는 손대지 않았다. git add/commit 없음. forge 명령 없음.

## 1. 바뀐 파일

### 프로덕션 코드
| 파일 | 변경 |
|---|---|
| `src/domain/settings/features.js` (신규) | `Feature`, `featureOfTargetKind(kind)`, `effectiveFlag(value, fallback)` — 순수 |
| `src/domain/transition/judge.js` | 입력 `featureEnabled = true`(기본), `ValidatorCode.PASS_FEATURE_DISABLED`, 맨 앞 판정 |
| `src/resolver/settings/SettingsRepository.js` | `SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`(true)·`GLOBAL_ONLY_KEYS` 에 두 키. `isIssueApprovalEnabled()`·`isTimesheetApprovalEnabled()`·`featureFlags()`·`isTransitionApprovalEnforced()`·`countEnabledProjects()`. `transitionApprovalEnabled` 주석을 "비상 해제"로 교체 |
| `src/resolver/settings/SettingsService.js` | 정규화 2키(`booleanValue`), `getApprovalSettings` 두 키 boolean 정규화, 감사 분리(`changedSwitches`·`recordPolicyAudit`), `getFeatureOverview()`, 생성자 `teams = teamRepository`, export `getFeatureOverview` |
| `src/resolver/settings/SettingsController.js` | `guardedDefine(resolver, 'getFeatureOverview', …)` |
| `src/permission/PermissionMap.js` | `getFeatureOverview: { admin: true }` (SettingsController 는 이미 `CONTROLLER_REGISTRARS` 에 있음) |
| `src/resolver/timesheet/TeamRepository.js` | `countEnabled()` |
| `src/utils/errors/ErrorCodes.js` | `ISSUE_APPROVAL_FEATURE_DISABLED`, `TIMESHEET_APPROVAL_FEATURE_DISABLED` |
| `src/resolver/transition/projectEnablement.js` | `isTransitionApprovalEnabled` → `settings.isTransitionApprovalEnforced()` 위임(동작 동일), `isIssueApprovalEnabled` 래퍼 추가 |
| `src/resolver/approval/ApprovalService.js` | 생성자 `featureEnabled(feature)`, `assertFeatureOpen(kind)`(createForTarget 맨 앞, requirePrincipal 직후), `requestGate` 일반화(기능 → 프로젝트), `createIssueApproval` 코드 분기 |
| `src/resolver/transition/TransitionService.js` | `featureEnabled` 주입, 생성 차단(Jira 전), 조회 사유 `FEATURE_DISABLED`, `listTransitionRules.featureEnabled` |
| `src/resolver/transition/TransitionValidatorService.js` | `featureEnabled` 주입, 비상 스위치와 **병렬** 판정, 끔이면 SQL·Jira 0 으로 `PASS_FEATURE_DISABLED` |
| `src/resolver/transition/TransitionExecutor.js` | `featureEnabled` 주입, POST 전 `FEATURE_DISABLED` → BLOCKED |
| `src/resolver/fieldChange/FieldChangeService.js` | `featureEnabled` 주입, `loadRequestable` 차단(Jira 전), 조회 사유, `listFieldChangeRules.featureEnabled` |
| `src/resolver/fieldChange/FieldChangeEventService.js` | `featureEnabled` 주입, 규칙 매칭 뒤 `projectOn && featureOn` 병렬, 끔이면 skipped(A2) |
| `src/resolver/timesheet/TimesheetService.js` | 생성자 `features`·`timesheetEnabled`, `submitTimesheet` 조기 차단, `getMyTimesheet` 최우선 코드, `getTimesheetContext.features` |
| `locales/kr/error.json`, `locales/en/error.json` | 신규 2키(값 = 설계 §8.2 문구). 기존 키 순서·서식 유지(파일 끝에 추가) |

### 테스트
| 파일 | 내용 |
|---|---|
| `src/domain/settings/__test__/features.test.js` (신규) | 6개 kind 매핑(2개 null)·모르는 kind·프로토타입 키 → null, `effectiveFlag` undefined/null/true/false/`'false'`/`'true'`/0 |
| `src/domain/transition/__test__/judge.test.js` | §3.2 세 케이스 |
| `src/resolver/settings/__test__/SettingsPolicyKeys.test.js` | 두 키 DEFAULT·SETTINGS_KEYS·GLOBAL_ONLY 포함·PROJECT_OVERRIDABLE 제외, 정규화(비 boolean → INVALID_TARGET). 기존 "키 맵 같은 집합" 계약 통과 |
| `src/resolver/settings/__test__/SettingsFeatureFlags.test.js` (신규) | 판정 함수(미저장·null→true, true, false, `'true'`→false, KVS 1회), `featureFlags` 병렬, KVS 실패 → UNKNOWN_ERROR, `isTransitionApprovalEnforced` 미저장→true, `countEnabledProjects`, `getApprovalSettings` 항상 boolean, 감사 분리 7케이스, 개요 4케이스, `TeamRepository.countEnabled` |
| `src/resolver/approval/__test__/ApprovalServiceFeatureGate.test.js` (신규) | createForTarget 4종 차단 + describe·supersede·load·createRequest 미호출, 한쪽만 끔, WORKLOG_CREATE·WORKLOG_CERTIFICATION 통과(판정 미호출), 판정 실패 close, createIssueApproval 코드 분기 3, viewForTarget ISSUE·TIMESHEET `FEATURE_DISABLED`·fail-open, **끔 상태 decide·bulkApprove·cancel 처리 + 판정 미호출** |
| `src/resolver/transition/__test__/TransitionService.test.js` | 생성 차단(reader·insertDraft·엔진 미호출), 판정 실패 close, 조회 사유 + history 유지 + onStatusObserved, 사유 우선순위 3, 조회 fail-open, `listTransitionRules.featureEnabled`(끔/켬/실패), 끔 상태 규칙 저장 |
| `src/resolver/transition/__test__/TransitionValidatorService.test.js` | 끔 + PENDING 후보 → `{result:true}`·규칙/후보/이슈/tableReady 미조회·arm 없음·로그 코드, 판정 실패 → 강제(REJECT), 두 판정 병렬 |
| `src/resolver/transition/__test__/TransitionExecutor.test.js` | WAITING + 끔 → BLOCKED/FEATURE_DISABLED·canRetry·POST 0, 끔→켬 후 retry → APPLIED, 판정 실패 → 진행, postStartedAt 행 + 끔 → reconcile EXACT → APPLIED(판정 미호출) |
| `src/resolver/fieldChange/__test__/FieldChangeService.test.js` | 폼·생성 차단(reader·insertDraft·엔진 미호출), 폼 fail-close, 조회 FEATURE_DISABLED + canRequest false + canApply·history 유지, 사유 우선순위, 끔 상태 applyFieldChange 정상(A1), `listFieldChangeRules.featureEnabled` |
| `src/resolver/fieldChange/__test__/FieldChangeEventService.test.js` | 끔 → skipped·우회/만료/알림 없음, 규칙 없으면 판정 미호출, 판정 실패 → 기록 |
| `src/resolver/timesheet/__test__/TimesheetService.test.js` | submit 차단(정책·수집·부속 행·엔진 미호출), supersedes 재제출 차단, submit fail-close, `getMyTimesheet` 최우선 코드(ALREADY_OPEN+changedSinceSubmit 이어도), 표시 fail-open, `getTimesheetContext.features`/실패 null, 끔 상태 decideTimesheets 정상 |
| `test/feature/featureGateScope.contract.test.js` (신규) | 판정 참조 파일 = 허용 목록 10개 정확 일치, `SETTINGS_KEYS.issue/timesheetApprovalEnabled` 직접 참조는 SettingsRepository 하나, 인증·통제·워크포스·사전 승인·이력·위임·트리거·기간 마감/재개/잠금/팀/drift 모듈 미참조 |
| `src/trigger/__test__/idleSqlBudget.test.js` | "두 기능 끔(KVS false)" — 작업별 상한(EXPIRY 10·TRANSITION_APPLY 4·TIMESHEET 5·WORKLOG_HISTORY 6)·하루 합계 27 이하. **상한 수치 변경 없음** |
| 기존 테스트 스캐폴드 주입 | `ApprovalService.test.js`(2곳)·`ApprovalServiceIssueApproval`·`ApprovalServiceTargetHooks`·`IssueApprovalIsolation`·`TimesheetIntegration`(2)·`FieldChangeIsolation`(2)·`FieldChangeService`·`TransitionService`·`TransitionValidatorService`·`TransitionExecutor`·`TimesheetService`·`TimesheetWorkforce`(미커밋 파일, 생성자 1줄만) 에 `featureEnabled: jest.fn(async () => true)` 또는 `timesheetEnabled`·`features` 더블 1줄. 기본값이 실제 KVS(`@forge/kvs`)를 부르면 jest 에서 `__forge_fetch__` 부재로 실패하기 때문. `SettingsController.test.js` 는 resolver 수 11 → 12 + 목에 `getFeatureOverview` |

## 2. 실제 응답 shape (프론트가 그대로 소비)

모든 resolver 는 `guardedDefine` → `ResponseWrapper` 로 `{ success: true, content: <아래> }`. 실패는 `{ success: false, error: { name, code, message, cause } }` — 분기는 `error.code`.

### 2.1 `getApprovalSettings` / `saveApprovalSettings` (admin) — `content`
기존 필드 전부 + 두 키(**항상 boolean**). `transitionApprovalEnabled` 는 기존대로 `getPolicy` 값(미저장 = 기본 true).
```json
{
  "defaultDeadlineDays": 7,
  "...": "기존 정책 키 그대로",
  "workforceLinkEnabled": false,
  "transitionApprovalEnabled": true,
  "issueApprovalEnabled": true,
  "timesheetApprovalEnabled": false,
  "approvalGroups": ["group-a"]
}
```
- `saveApprovalSettings` payload 는 기존 그대로(`{ issueApprovalEnabled: false }` 또는 `{ patch: {...} }`). 두 키는 boolean 만 — 그 외 `INVALID_TARGET`(아무것도 저장 안 함).
- 응답은 저장 후 `getApprovalSettings()` 와 같은 shape.

### 2.2 `getFeatureOverview` (신규, `{admin:true}`) — `content`
```json
{ "projects": { "configured": true, "enabledCount": 3 }, "teams": { "enabledCount": 2 } }
```
- 적용 프로젝트를 고른 적 없음: `{ "projects": { "configured": false, "enabledCount": null }, ... }` → 화면은 "모든 프로젝트". 이때 프로젝트 COUNT SQL 은 내지 않는다.
- 테이블 미준비·SQL 실패: 해당 `enabledCount` 만 `null`(→ '—'). `isProjectScopeConfigured` KVS 실패는 `{ configured: false, enabledCount: null }`.
- 에러 코드 없음(부분 실패는 값 null). 입력 없음.

### 2.3 `getTimesheetContext` (SELF) — `content`
기존 필드 + `features`.
```json
{
  "unit": "MONTH",
  "timeZone": "Asia/Seoul",
  "currentPeriodKey": "2026-10",
  "previousPeriodKey": "2026-09",
  "myTeam": { "teamKey": "t_a", "displayName": "A", "source": "ROSTER" },
  "isTeamLead": true,
  "ledTeams": [{ "teamKey": "t_a", "displayName": "A", "memberCount": 2, "source": "ROSTER" }],
  "certification": null,
  "features": { "issueApproval": true, "timesheetApproval": false }
}
```
- KVS 조회 실패면 `"features": null`(모름 → 프론트는 전부 보임). 그 외 필드는 영향 없음.

### 2.4 `getMyTimesheet` (SELF) — shape 무변경
`submitBlockedCode` 에 `"TIMESHEET_APPROVAL_FEATURE_DISABLED"` 가 **최우선**으로 올 수 있다(열린 요청·제출 뒤 변경·기간 오류보다 앞). `latest`·`changedSinceSubmit`·`live`·`periods`·`lock` 은 그대로 → 회수 버튼은 기존 판정대로.
```json
{ "periodKey": "2026-10", "...": "...", "latest": { "requestId": "…", "periodStatus": "SUBMITTED" }, "changedSinceSubmit": true, "submitBlockedCode": "TIMESHEET_APPROVAL_FEATURE_DISABLED" }
```
판정 실패면 이 코드를 내지 않는다(표시 fail-open, 쓰기는 `submitTimesheet` 가 막음).

### 2.5 `getIssueApproval` / `getApprovalDetail` — shape 무변경
`notAvailableReason` 값 집합: `null | 'PROJECT_DISABLED' | 'FEATURE_DISABLED'`. `FEATURE_DISABLED` 이면 `canRequest: false`. 대상 종류 ISSUE·ISSUE_TRANSITION·FIELD_CHANGE(이슈 승인)·TIMESHEET(타임시트 승인) 공통 — 상세의 재상신/재제출 버튼이 사라진다.
```json
{ "approval": null, "target": { "...": "..." }, "canRequest": false, "notAvailableReason": "FEATURE_DISABLED" }
```

### 2.6 `getIssueTransitionApprovals` — shape 무변경
`notEnforcedReason` 값 집합: `null | 'FEATURE_DISABLED' | 'GLOBAL_DISABLED' | 'PROJECT_DISABLED' | 'NO_RULE'`(우선순위 이 순서). `FEATURE_DISABLED` 이면 `enforced: false`, `targets: []`, `history` 는 유지.
```json
{ "issue": { "issueId": "100", "...": "..." }, "enforced": false, "notEnforcedReason": "FEATURE_DISABLED", "targets": [], "history": [{ "requestId": "p1", "...": "..." }] }
```

### 2.7 `getIssueFieldChanges` — shape 무변경
`notEnabledReason` 값 집합: `null | 'NO_RULE' | 'FEATURE_DISABLED' | 'PROJECT_DISABLED'`(우선순위 이 순서). `FEATURE_DISABLED` 는 규칙이 있을 때만 → `enabled: false`, `fields[]` 는 채워지고 각 `canRequest: false`, `canApply`·`history`·`bypass` 유지.
```json
{ "issue": {}, "enabled": false, "notEnabledReason": "FEATURE_DISABLED", "fields": [{ "fieldId": "duedate", "canRequest": false, "canApply": true }], "bypass": [], "history": [] }
```

### 2.8 `listTransitionRules` / `listFieldChangeRules` (project admin) — 필드 추가
기존 + `"featureEnabled": boolean`(조회 실패 = `true`, 표시 fail-open).
```json
{ "project": {}, "globalEnabled": true, "projectEnabled": true, "featureEnabled": false, "rules": [], "...": "..." }
```
(`listFieldChangeRules` 는 `globalEnabled` 없이 `projectEnabled`·`featureEnabled`.)

### 2.9 전환 적용 상태(`retryTransitionApply` 등 `transitionApplyView`)
끔 상태에서 자동 적용 시도 → `status: 'BLOCKED'`, `code: 'FEATURE_DISABLED'`, `canRetry: true`. 다시 켠 뒤 요청자 재시도로 POST. (기존 상세의 apply 블록 키 이름 그대로: `{ mode, status, code, attempts, ..., canRetry, canReconcile, manualReviewRequired }`.)

## 3. 새 에러 코드 / 판정 코드

| 종류 | 값 | 나오는 곳 |
|---|---|---|
| ErrorCodes(= error.json 키) | `ISSUE_APPROVAL_FEATURE_DISABLED` | `createIssueApproval`, `createTransitionApproval`, `getFieldChangeForm`, `createFieldChangeApproval`, 공통 `createForTarget`(ISSUE·ISSUE_TRANSITION·FIELD_CHANGE) |
| ErrorCodes(= error.json 키) | `TIMESHEET_APPROVAL_FEATURE_DISABLED` | `submitTimesheet`(신규·재제출), 공통 `createForTarget`(TIMESHEET), `getMyTimesheet.submitBlockedCode` |
| 사유 문자열 | `'FEATURE_DISABLED'` | `notAvailableReason`·`notEnforcedReason`·`notEnabledReason` |
| 전환 적용 code | `'FEATURE_DISABLED'` | `transition_request.apply_code`(BLOCKED) |
| validator 로그 | `PASS_FEATURE_DISABLED` | `[VALIDATOR]` 로그만(사용자 문구 없음 — 통과라 errorMessage 불필요) |

판정 KVS 오류(KvsError)는 쓰기 경로에서 그대로 던져 `UNKNOWN_ERROR`(fail-close).

## 4. 감사 action 값 (`approval_settings_audit`)

| 바뀐 키 | area | action | detail |
|---|---|---|---|
| `issueApprovalEnabled` | `feature` | `enable` \| `disable` | `{ "feature": "issueApproval" }` |
| `timesheetApprovalEnabled` | `feature` | `enable` \| `disable` | `{ "feature": "timesheetApproval" }` |
| `transitionApprovalEnabled` | `transitionEnforce` | `enable`(강제 복귀) \| `disable`(비상 해제) | `{ "transitionApprovalEnabled": false }` |
| 그 외 키·`approvalGroups` | `policy` | `update` | 세 키를 뺀 patch(남는 게 없으면 행 없음) |

- 값이 **실제로 바뀐** 경우만 행을 쓴다(이전 유효값은 저장 전에 판정 함수로 읽음, patch 에 그 키가 있을 때만 KVS 1). 이전 값 읽기 실패 = 바뀜으로 기록.
- 기록 순서: feature(issue) → feature(timesheet) → transitionEnforce → policy/update.

## 5. 설계와 다르게 한 점 (이유)

1. **`TransitionExecutor.apply` — 끔이면 규칙 조회(SQL)를 건너뛴다.** 설계 코드 조각대로 `code = 'FEATURE_DISABLED'` 뒤에 기존 규칙 매칭을 그대로 두면 규칙 불일치 시 `RULE_CHANGED`(재시도 불가 코드)가 덮어써 "다시 켜면 재시도" 요구가 깨진다. `if (featureOff) … else { 기존 PROJECT_DISABLED·RULE_CHANGED }` 로 바꿔 끔 코드를 보존하고 SQL 1회를 아꼈다. 켬 경로 동작은 기존과 동일.
2. **`getFeatureOverview` — `isProjectScopeConfigured` 실패 시 `configured:false`.** 계약상 `configured` 는 boolean 이라 null 대신 false + `enabledCount:null`(화면 "모든 프로젝트" 대신 '—' 를 원하면 프론트가 `enabledCount===null && configured===false` 를 구별할 수 없다는 점 주의 — 지금 계약에서는 "모든 프로젝트"로 보인다).
3. **판정 위치 미세 조정**: `createForTarget` 은 `requirePrincipal` 직후(무인증 호출이 KVS 를 치지 않게), `createTransitionApproval` 은 `adapter.parse`·`optionalTransitionId` 직후(입력 형식 오류는 기존대로 `INVALID_TARGET`). 둘 다 Jira 호출·describe·supersede 전이라 설계 의도(전) 그대로.
4. **`getTimesheetContext.features`** 는 `featureFlags()` 결과를 `!== false` 로 한 번 더 정규화해 항상 boolean 2개 또는 null.
5. **테스트 스캐폴드 주입**(§1 테스트 표 마지막 행) — 설계에 없는 기존 테스트 수정이지만 생성자 더블 1줄 추가뿐, 단언은 바꾸지 않았다(예외: `SettingsController.test` 11→12, `TimesheetService.test` 컨텍스트 기대값에 `features` 추가).
6. 감사 기록은 기존 `recordSettingsAudit`(모듈 import)를 그대로 쓴다 — 테스트는 기존 관례(`jest.mock('../SettingsAuditRepository')`)로 검증.

## 6. 테스트 결과

| 명령 | 결과 |
|---|---|
| `npx jest` (리포 루트, 백엔드 전체) | **Test Suites 157 passed / 157, Tests 2460 passed / 2460** |
| `npm run check:bundle` | `[bundle-check] OK — exports: onInstall, onIssueChanged, onPreUninstall, onWorklogChanged, runMigration, runSweep, runSweepJob, validateTransition, CONTROLLER_REGISTRARS, handler` |
| `npm run merge` | `locales\ko-KR.json`·`locales\en-US.json` 생성(오늘 미커밋 locales 포함 전체 재병합) |
| `test/permission/permissionMap.contract.test.js` | 통과(`getFeatureOverview` 3단계 대조) |
| `src/trigger/__test__/idleSqlBudget.test.js` | 23 passed — 상한 수치(TIMESHEET 5, 미연동 합계 27, 연동 38) 변경 없음, 두 기능 끔 케이스 추가 |

## 7. 미검증

| 항목 | 이유·확인 방법 |
|---|---|
| (플랫폼) 없음 | 새 Jira/Forge 동작에 기대지 않는다. validator 통과는 기존 `PASS_DISABLED` 와 같은 `{result:true}` 경로 |
| (제품) 끔 상태 + validator 붙은 워크플로의 실제 전환 | 개발 사이트에서 이슈 승인 끔 → 규칙 있는 전환 실행 → 성공 + `transition_request` 무장(armed_at) 없음 확인 (설계 §10) |
| (제품) 자동 적용 중 끔 → 켬 → 재시도 | 승인 직후 끔 → 상세 apply `BLOCKED/FEATURE_DISABLED` → 켬 → 재시도 `APPLIED` |
| 배포 | `forge lint`/`deploy` 미실행(리더 몫). SQL 스키마 변경 없음 → major upgrade 불필요. manifest 무변경 |

## 8. 프론트에 넘길 것

- `locales/*/error.json` 의 두 키는 넣었다. 나머지(§8.1·§8.2·라벨 15)는 프론트 단계.
- 비관리자 화면의 기능 상태 원천은 `getTimesheetContext.features`(null = 모름 → 전부 보임).
- 관리자 개요 쿼리키 `settingsKeys.featureOverview()` → `getFeatureOverview`.
- 감사 화면 area 라벨 2개: `feature`, `transitionEnforce`(action 은 기존 `enable|disable` 재사용).

## 발견 (범위 밖, 고치지 않음)

- `FieldChangeEventService` 의 A2(끔이면 건너뜀)로 **끔 상태의 결재 중 필드 변경 요청은 트리거로 만료되지 않는다** — 설계 A2 대로 패널 지연 판정(`expireStale`)과 적용 직전 확인에 맡긴다. 끔 동안 패널을 아무도 열지 않으면 PENDING 이 남아 결재자가 결정할 수 있고, 적용 직전 확인이 막는다(기존 경로).
- 작업 트리의 `src/resolver/settings/__test__/SettingsWorkforceLink.test.js`, `src/rdb/query/__test__/noBoundLimit.test.js` 는 이번 작업 전부터 있던 미추적 파일(오늘 다른 작업) — 건드리지 않았다.
