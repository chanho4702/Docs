# worklog-control 백엔드 보고서 (1회차)

> 작성: backend-engineer · 2026-10-11 · 입력: `01_architect_design.md` 2판, `codex-review.md`, QUESTIONS Q119~Q129(전부 확정, Q127 승인)
> 기준 트리: `b2532b0` + 리더의 CLAUDE.md 불변식 8 예외 문구. 커밋·배포 없음. `AGENTS.md`·`.claude/`·`static/ui`·`locales` 무수정.

## 0. 설계·불변식 충돌

**없음.** 설계 2판을 그대로 구현했다. 다만 설계에 빈칸이 있어 메운 곳은 §5 D-목록에 적었다(프론트가 읽을 shape 에 영향이 있는 것은 D1~D6).

## 1. 결과 요약

| 항목 | 결과 |
|---|---|
| `npx jest --runInBand` | **134 suites / 2042 tests 통과**(기존 126/1836 → 신규 8 파일·+206 테스트, 기존 테스트 4곳 갱신 — §8) |
| `forge lint` | **No issues found** (`preUninstall` 모듈 포함) |
| 신규 resolver | 9 — 3단계 등록 완료, 계약 테스트(`permissionMap.contract.test.js`) 통과 |
| 마이그레이션 | `v057_create_worklog_control`, `v058_create_worklog_control_intent`, `v059_create_worklog_control_counter`(신규 테이블 → major, `--approve MAJOR_VERSION_RULE`) |
| manifest | `modules.preUninstall` 1개 + `function onPreUninstall` 추가. **scope 변경 없음** |
| 유휴 SQL | **미연동 27 · 연동 38 그대로**. worklog-control 작업은 표식 없으면 SQL 0, 일일 목록(DAILY_JOBS)에 없음 |
| 기본 동작(Phase A) | 승인·인증 잠금 켬, 기간 창 OFF, 다른 경로 입력 FLAG(연동 이슈만), 출처 op 결속, 진단 도구 |
| B~D·권한 스킴 | 구현 완료, **기본 OFF**. 저장 시 서버가 사이트 관문 기록을 요구(`WORKLOG_CONTROL_GATE_REQUIRED`) |

## 2. 파일

신규
```
src/domain/worklogControl/{rules,window,origin,foreign,visibility,gates}.js  (+ __test__/rules, originForeign)
src/rdb/schema/ddl/worklogControl.sql.js
src/resolver/worklogControl/
  WorklogControlController.js   guardedDefine 9
  WorklogControlService.js      상태·관문·점검·해제·재시도·다른 경로 목록·설정 저장 검증(prepareSave/afterSave)
  WorklogControlRepository.js   worklog_control / _intent / _counter (CAS rev+1)
  WorklogControlGateway.js      asApp 전용, 사유 11개 고정
  WorklogControlState.js        KVS 상태·관문·작업 표식, 스위치 6개 읽기
  WorklogControlContext.js      WorklogService 쓰기·조회 경로 재료(설계 §4.2)
  WorklogControlWorker.js       큐 작업: 해제·세대 재계산·확정 증분·백필·제한·조정·다른 경로 입력
  WorklogControlDetector.js     트리거 분기·출처 판정·이력 귀속
  WorklogControlHooks.js        인증 직후·일괄 승인 직후·연동 신호 갱신 훅
  WorklogControlDiagnostics.js  자동 관문 시험
  WorklogControlReadiness.js    프로젝트 점검 표
  WorklogControlCtl.js          movesApproval.ctl 본문 원천
  ControlLinkJudge.js, StartDateField.js, HiddenAwareCollector.js, live.js
  __test__/ (Gateway·Worker(+Detector)·Service(+Hidden·preUninstall)·Ctl)
src/integration/workforce/controlDoc.js (+ __test__/controlDoc.test.js)
src/trigger/onPreUninstall.js, src/trigger/sweepQueue.js
src/resolver/worklog/__test__/WorklogServiceControl.test.js
```
변경(가산): `WorklogService`, `WorklogGateway`(writeBody export·visibility), `PeriodLockService`(lockApproved), `domain/timesheet/lock.js`, `domain/worklogPolicy/{catalog,authority}.js`, `domain/timesheet/worklogHistory.js`(source CONTROL), `WorklogHistoryRecorder`(attribution·properties prefetch), `WorklogCollector`(properties 옵션), `WorklogApprovalService.apply`(출처 op), `WorklogCertService`(숨김 대체 조회·훅), `TimesheetService`(숨김 수집·훅), `WorklogPolicyAuthority`(연동 신호 훅), `WorklogPolicyService`(덮어쓰기 기간 창 관문), `SettingsRepository`·`SettingsService`(키 7·검증), `WorkforceLinkRepository`, `WorkforcePropertyGateway`, `WorkforcePublisher`(ctl), `contract.js`, `onWorklogChanged`, `sweepJobs`·`runSweep`·`runSweepJob`, `PermissionMap`, `permissionGuard`, `ResponseWrapper`, `ErrorCodes`, `migrate.js`, `index.js`, `manifest.yml`.

## 3. resolver — 실제 응답 shape (`{success:true, content: …}` 의 content)

### 3.1 신규 9

| resolver | 권한 축(PermissionMap 그대로) |
|---|---|
| `getWorklogControlStatus` | `{ admin: true, licenseInactiveAllowed: true }` |
| `runWorklogControlDiagnostic` | `{ admin: true }` |
| `recordWorklogControlGate` | `{ admin: true }` |
| `getWorklogControlReadiness` | `{ admin: true }` |
| `releaseWorklogControl` | `{ admin: true, licenseInactiveAllowed: true }` |
| `retryWorklogControl` | `{ admin: true }` |
| `listForeignWorklogs` | `{ admin: true }` |
| `clearForeignWorklog` | `{ admin: true }` |
| `getWorklogHandoff` | `{ issue: 'view', issueIdKey: 'issueId', appAccess: false }` |

**getWorklogControlStatus** — payload `{ withFieldCandidates?: true }` (D3)
```js
{
  settings: {
    visibilityScope: 'OFF'|'CONFIRMED_ONLY'|'LINKED_ALL',
    lockMethod: 'NONE'|'PERMISSION_SCHEME',
    foreignAction: 'OFF'|'FLAG'|'DELETE',
    foreignScope: 'LINKED'|'ALL',
    target: { type: 'role', value } | { type: 'group', identifier },
    startDateField: { fieldId: string|null, verified: boolean, verifiedAt: number|null,
                      candidates?: [{ fieldId, name, datePicker: boolean, nameMatch: boolean }] },
    dateWindowOn: boolean,                 // 사이트 정책 worklogDateWindow
  },
  state: { generation, since: number|null, deleteSince: number|null, releasing: boolean,
           invariantApproved: boolean /* 상수 true — Q127 */, workforceOriginCapable: boolean,
           releaseRemaining: number /* D4, releasing 일 때만 실제 수, 아니면 0 */ },
  gates: { [gateId]: { result: 'PASS'|'FAIL'|'NONE', at, by, mode: 'AUTO'|'MANUAL'|null, appVersion, note,
                       parts: { auto: 'PASS'|'FAIL'|'NONE'|null, manual: 'PASS'|'FAIL'|'NONE'|null },  // D5
                       versionChanged: boolean } },   // 15개 gateId 전부
  allowed: { CONFIRMED_ONLY, LINKED_ALL, DELETE, PERMISSION_SCHEME, dateWindow },   // boolean
  blockers: { CONFIRMED_ONLY: gateId[], LINKED_ALL: [...], DELETE: [...|'WF_WLORIGIN'], PERMISSION_SCHEME: [...], dateWindow: [...], groupTarget: [...] },
  counts: { applying, restricted, pending, failed, unknown, skippedRestricted, notEditable, releasing, released, flagged, deletePending, deleted },
  deletesToday: number, deleteDailyMax: 50 /* 진단 상한 모드면 3 */,
}
```
에러: `STORAGE_NOT_READY`(v057 미적용).

**runWorklogControlDiagnostic** — payload `{ gateId, issueId, closedIssueId? }`
```js
{ gateId, result: 'PASS'|'FAIL', steps: [{ key, expected: string, observed: string|null, ok: boolean }], recorded: true, leftovers?: [worklogId] }
```
자동 가능 관문: G_ROLE, G_BLOCK(관리자 몫), G_POST, G_PRESERVE, G_AGG, G_RECOVER, G_FIELD, G_LINK(판정 모의), G_ORIGIN, G_DELETE, G_TEAM_MANAGED, G_SCHEME. 에러: `INVALID_TARGET`(cause `{field:'gateId'|'issueId'}` — 수동 전용 관문·이슈 열람 불가), `WORKLOG_CONTROL_DIAG_BUSY`(2분 잠금).

**recordWorklogControlGate** — payload `{ gateId, result:'PASS'|'FAIL', note? ≤500 }` → `{ gateId, result, at }`. 자동 전용(G_ROLE·G_PRESERVE·G_DELETE·G_TEAM_MANAGED)에 수동 기록 → `INVALID_TARGET`.

**getWorklogControlReadiness** — payload `{ cursor? }`(숫자 문자열)
```js
{ items: [{ projectId, projectKey, name, style: 'classic'|'next-gen'|null,
            app: { browse, workOn, editAll, deleteAll },
            scheme: { readable, schemeId: string|null, addonRole: { editAll, deleteAll },
                      userHolders: { editOwn: string[], editAll: string[], deleteOwn: string[], deleteAll: string[] } },  // 'role:Developers'·'group:x'·'user:acc'·'reporter' 등
            verdict: 'READY'|'TEAM_MANAGED'|'APP_MISSING'|'SCHEME_UNREADABLE'|'USERS_CAN_EDIT' }],
  nextCursor: string|null }
```

**releaseWorklogControl** — `{ confirm: 'RELEASE' }` → `{ generation, pending }`(pending = 해제 남은 수). 스위치를 OFF 로 저장하고 releasing·세대 증가(D7).
**retryWorklogControl** — `{}` → `{ queued }`.
**listForeignWorklogs** — `{ state?, cursor?, limit ≤50 }`
```js
{ items: [{ worklogId, issueId, issueKey, authorAccountId, started: number|null, seconds: number|null /* D8 */, state, reason, detectedAt, actedAt, linked: boolean|null }],
  hiddenCount, users: { [accountId]: { displayName, avatarUrl } }, nextCursor: worklogId|null }
```
**clearForeignWorklog** — `{ worklogId }` → `{ worklogId, state: 'CLEARED' }`. 에러 `WORKLOG_NOT_FOUND`(열람 불가 포함), `WORKLOG_CONTROL_CONFLICT`(삭제 중·삭제됨).
**getWorklogHandoff** — `{ issueId, worklogId }` → **getWorklogEditorContext 응답 전체 + `worklogId`**(D2): `{ issueId, policy?, issueKey:null, timeZone, unit, now, permissions, lockRanges, worklog: WorklogView, approvalPolicy: null, control, worklogId }`. 에러 `WORKLOG_NOT_FOUND`, `WORKLOG_NOT_OWNER`.

### 3.2 변경 resolver(가산 — 기존 필드 의미 유지)

**WorklogView** 가산(통제 컨텍스트가 있는 응답: 탭 목록·편집 컨텍스트·넘김):
```js
{ ...기존, canEdit, canDelete /* 서버 판정으로 재계산 */,
  blocked: { code, cause? } | null,   // 본인 행. 남의 행은 { code: 'NOT_OWNER' }
  controlled: { state: VisState } | null,   // 본인 행·NONE/GONE 아님
  foreign: { state, reason } | null,        // 본인 행·CLEARED 아님 (D1)
  via: 'USER'|'APP' }
```
`blocked.code` ∈ NOT_OWNER·OUTSIDE_WINDOW·WINDOW_UNRESOLVED·CERTIFIED·PERIOD_CLOSED·PERIOD_SUBMITTED·PERIOD_APPROVED·FOREIGN_PENDING·NO_JIRA_PERMISSION·CONTROL_BUSY. `cause` 는 OUTSIDE_WINDOW `{which,start,end}`, WINDOW_UNRESOLVED `{status}`, CERTIFIED `{state}`, PERIOD_* `{reasonCode,periodKey,which}`. (`CONTROL_UNAVAILABLE` 은 쓰기 에러로만 — 목록에서 미리 알 수 없다.)

**getIssueWorklogs** 가산: `control: { visibilityScope, linked, channel: 'APP'|'WORKFORCE', dateWindow: DateWindow|null }`, `removedForeign: [{ worklogId, started, seconds, deletedAt, reason, snapshot: { comment /*ADF*/, commentTruncated } | null }]`(작성자 본인·이 이슈·≤20, 삭제 모드를 켠 적 없으면 SQL 없이 `[]`). 본인 숨김분은 `worklogs` 에 `via:'APP'` 로 합쳐진다(B 이상). `truncated` 는 asUser 목록 기준. 창 미해결은 에러 없이 `control.dateWindow.status` 로.
`DateWindow = { status: 'OK'|'NO_FIELD'|'FIELD_UNVERIFIED'|'READ_FAILED'|'INVALID', start: 'YYYY-MM-DD'|null, end, timeZone, fieldId }`

**getWorklogEditorContext** 가산: `control`(위와 같음), `worklog` 에 WorklogView 가산 필드.
**createWorklog**: `worklog.controlled: { state } | null`(통제 컨텍스트 있으면 항상 키 존재). op 는 응답에 없다(테스트 단언).
**updateWorklog**: 앱 대행일 때만 `worklog.controlled` 키 존재. **deleteWorklog**: 변화 없음 `{ worklogId, deleted: true, policy? }`.
쓰기 응답의 `worklog` 에는 blocked·foreign·via 가 없다(재조회 없이 Jira 응답만으로 만든다 — D6).
**saveApprovalSettings**: 입력 가산 `payload.worklogControl: { confirmDelete?: 'DELETE', sampleIssueId?: string }`(D3), 정책 키 7개(§6). 응답은 기존 `getApprovalSettings` 그대로(새 키 포함).
**saveProjectWorklogPolicy / saveIssueWorklogPolicy**: 덮어쓰기에서 `worklogDateWindow:true` 를 새로 켜면 사이트 필드 검증 + G_FIELD 요구(`WORKLOG_CONTROL_GATE_REQUIRED`).

### 3.3 쓰기 검사 순서(구현 그대로, 테스트로 고정)

update/delete: ① principal·입력 → ② 정책 계층 → ③ asUser GET, 404/403 이면 **통제 행(HIDDEN 상태·같은 이슈)이 있을 때만** asApp GET → ④ 이슈 일치 → ⑤ 본인(Jira 응답 author) — **남의 것이면 여기서 끝, 이후 SQL·KVS 0** → ⑥ 통제 컨텍스트(스위치·연동·창) + 기간 잠금 로드 → `judgeMutation`: 통제 작업 중(CONFLICT)/삭제 예정(FOREIGN_LOCKED, 수정만) → 기간 창(미해결 거부) → 인증(CERTIFIED·MISMATCH) → 기간 잠금(승인은 정책 무관) → ⑦ 정책 → ⑧ 실행 주체: 통제 행 RESTRICTED·UNKNOWN 또는 PERMISSION_SCHEME 이면 **claim(op·호출 사용자 기록) → asApp PUT/DELETE(op 프로퍼티) → 결과 기록**, 아니면 asUser.
create: 창 → 잠금 → 정책(사전 승인 포함) → intent INSERT → asUser POST(`movesApproval.origin` 프로퍼티, G_POST PASS ∧ LINKED_ALL ∧ 연동이면 visibility 동봉) → 결속 + 통제 행(origin APP) → (LINKED_ALL ∧ 연동 ∧ 미동봉) 같은 호출에서 제한.
통제 컨텍스트를 주지 않은 WorklogService(기존 테스트·도구)는 기존 순서 그대로.

## 4. 에러 코드(`ErrorCodes` 에만 추가 — `locales/{kr,en}/error.json` 미반영, 프론트 몫)

`WORKLOG_OUTSIDE_ISSUE_WINDOW`(cause `{which,start,end}`), `WORKLOG_WINDOW_UNRESOLVED`(`{status}`), `WORKLOG_CERTIFIED_LOCKED`(`{state}`), `WORKLOG_FOREIGN_LOCKED`, `WORKLOG_CONTROL_UNAVAILABLE`(`{status}` — 앱 대행 Jira 거부, 5xx·유실은 `status:null`), `WORKLOG_CONTROL_STORAGE`, `WORKLOG_CONTROL_CONFLICT`, `WORKLOG_CONTROL_RELEASE_RUNNING`, `WORKLOG_CONTROL_INVARIANT_PENDING`, `WORKLOG_CONTROL_DELETE_CONFIRM`, `WORKLOG_CONTROL_GATE_REQUIRED`(`{switch, missing}` — missing 에 gateId 외에 `'FIELD_UNVERIFIED'`·`'WF_WLORIGIN'` 이 올 수 있다), `WORKLOG_CONTROL_DIAG_BUSY`. (12개 — 설계 §2.3 과 동일)

## 5. 설계 대비 D-목록

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| D1 | WorklogView `controlled`·`foreign` | **본인 행에만**, 남의 행은 null + blocked NOT_OWNER | 남의 인증·다른 경로 판정 누출 방지(불변식 7) |
| D2 | getWorklogHandoff `{issueId, worklogId, worklog}` | 편집 컨텍스트 전체 + worklogId(상위집합) | 다이얼로그 재사용에 timeZone·lockRanges·permissions 가 필요 |
| D3 | 필드 후보·표본 이슈·DELETE 확인 입력 경로 없음 | status `withFieldCandidates`, saveApprovalSettings `payload.worklogControl.{sampleIssueId, confirmDelete}` | 계약에 빠진 입력 |
| D4 | — | status.state.releaseRemaining | 해제 진행률(§7.3 "잔여") |
| D5 | gates[] `{result,at,by,mode,appVersion,note}` | + `parts`, `versionChanged` | 자동·수동 겸용 관문은 두 부분 모두 PASS 여야 PASS — 화면이 어느 쪽이 빠졌는지 보여야 함 |
| D6 | 쓰기 응답 worklog | controlled 만 가산 | 재조회하지 않는 기존 원칙. 프론트는 쓰기 후 목록 무효화 |
| D7 | release = 세대 증가·신규 제한 중지 | + 스위치 `worklogVisibilityScope='OFF'` 저장 | 안 끄면 해제 완료 뒤 워커가 다시 제한한다 |
| D8 | listForeign `seconds` | 삭제 참고 사본이 있을 때만, 아니면 null | DDL 에 seconds 칼럼 없음 |
| D9 | DDL | `worklog_control.started_ms BIGINT NULL` 추가, vis_state `GONE`(종결) 추가 | 숨김 보충 기간 조회, 삭제 확인된 행 종결 |
| D10 | `invariantApproved` 상태(KVS) | 상수 `INVARIANT_8_EXCEPTION_APPROVED = true`(WorklogControlState) | Q127 승인 확정. 철회 시 false 로 |
| D11 | 알림 템플릿 5종(foreignFlagged 등) | **미구현** | `approval_notification` 이 `request_id NOT NULL` + 목록이 `approval_request` JOIN — 요청 없는 알림을 저장·표시할 수 없다. 스키마 결정 필요(§9 발견). Phase D 의 S3 "작성자·팀장 알림"이 없으므로 D 관문 통과 전 해결 필요 |
| D12 | ctl 문서 대상 | 검증된 rms.policy P:·I: 신호 전부(ctl 값 무관). 통제·기간 창 둘 다 꺼짐 또는 신호 없음/NONE 이면 DELETE | 워크포스 탭이 이슈 단위 신호만으로도 넘김 경로가 필요 |
| D13 | `HiddenAwareCollector` 의 checksById 건별 불가 표시 | `checksUnavailableIds: string[]` 가산(소비처 아직 없음) | 기존 shape 에 건별 칸 없음 |
| D14 | 400 = 닫힌 이슈 | 제한 PUT 400 → NOT_EDITABLE 로 분류 | 본문을 읽지 않는 규칙(RequestJira) — 미검증, G-PRESERVE 로 확인 |
| D15 | B·C 확정 반영 | 즉시 훅: 인증 직후·`decideTimesheets`(일괄 승인). 단건 `decideApproval`·반려·재오픈은 **일일 증분**(worker.scanConfirmChanges — worklog_cert.updated_at·approval_request(TIMESHEET).updated_at) | 엔진 경로 전부에 훅을 넣지 않음. 지연 최대 하루(B 이상 켠 사이트에서만 표식 유지) |
| D16 | `WorklogApprovalService.apply` 기간 창 | 출처 op·제한만 적용, 창 재검사 없음(요청 시점 판정) | 승인 후 적용 경로 |
| D17 | 권한 스킴 방식 asApp 대행 | 통제 행 없으면 claim 시 `origin BACKFILL, vis NONE` 행을 만든다 | op·행위자 귀속에 행이 필요 |

## 6. 정책 키(SETTINGS_KEYS·DEFAULT·GLOBAL_ONLY + normalizeSettingsPatch)

`worklogVisibilityScope`('OFF'), `worklogLockMethod`('NONE'), `foreignWorklogAction`('FLAG'), `foreignWorklogScope`('LINKED'), `worklogControlTarget`(''), `issueStartDateField`('') — GLOBAL_ONLY. `worklogDateWindow`(false) — CATALOG(계층) 키.
KVS 상태: `approval:worklogControl:state` `{generation, since, deleteSince, releasing, startDateField:{fieldId,verified,verifiedAt}, backfill, confirmScanAt, ctlRev, diagBusyUntil, releasedAt}`, `approval:worklogControl:gates`, `approval:worklogControl:pending`.

## 7. 비용

### 7.1 유휴 SQL(`idleSqlBudget.test.js`)
- 하루 합계 **미연동 27 · 연동 38 불변**(상한 숫자 안 고침).
- `runSweep` 은 KVS 표식만 읽는다 — 표식 없으면 큐 push 내용이 기존 5작업 그대로(테스트).
- `worklog-control` 작업: 표식 없음·스위치 OFF → **SQL 0**(테스트). 표식 있고 원장 빔 → ≤4 후 표식 삭제(테스트).
- 기본 FLAG 모드는 `active` 가 아니라서 표식을 남기지 않는다. B 이상을 켠 사이트만 표식이 유지돼 하루 1회 증분 재계산이 돈다(기능 ON 비용).

### 7.2 이벤트·화면(추가분)
| 경로 | Jira | SQL·KVS |
|---|---|---|
| 워크로그 created 이벤트(기본 FLAG, 비연동 이슈) | 0 | KVS 7 + 연동 신호 SQL ≤1(연동 꺼짐·테이블 없음이면 0) |
| created(연동 이슈) | 이력 prefetch 재사용(expand=properties) 또는 asApp 1 | 통제 행 1 + intent 1~2 + 쓰기 1 |
| updated/deleted(스위치 OFF·권한 스킴 아님) | 0 | KVS 만 |
| 작업 로그 탭 | +0(숨김 보충은 B 이상) | +연동 1 + 통제 행 1 + 인증 1 |
| 작성 | +0 | intent 1 + 결속 1 + 통제 행 1 + 인라인 정리 ≤2 |
| 수정·삭제(통제분) | asUser GET + asApp GET + asApp 쓰기 | 통제 1 + 인증 1 + 잠금 기존 + claim 1 + 결과 1 |
| prefetch | 이력 prefetch 가 `worklog/list?expand=properties` 로 바뀜(호출 수 동일, 응답 크기 증가) | — |

## 8. 테스트

신규: `domain/worklogControl/__test__/{rules,originForeign}.test.js`, `resolver/worklog/__test__/WorklogServiceControl.test.js`, `resolver/worklogControl/__test__/{WorklogControlGateway,WorklogControlWorker,WorklogControlService,WorklogControlCtl}.test.js`, `integration/workforce/__test__/controlDoc.test.js`. 가산: `idleSqlBudget`, `runSweep`, `onWorklogChanged`, `ResponseWrapperLicense`.
고정한 계약: 검사 순서(남의 것 → 하위 SQL 0 단언 포함), asApp 은 통제 행 있을 때만·claim 이 Jira 호출보다 먼저, 창 5상태 fail-close, 승인 잠금 정책 무관, op 응답 비노출, 출처(양 앱 정상·값 변경·재사용·서명/cloud/이슈/작성자/시각 실패·NONE), DELETE S1~S11(S3 알림 제외), 원자 상한, 해제 잔여>0 이면 완료 보고 안 함, 숨김 보충 6조건, 스위치별 저장 거부, 수동 관문 기록, 라이선스 면제 2개만, 사유 11개 고정, ctl 서명 결속.
기존 테스트 수정 4곳(의도된 동작 변경): `PeriodCloseService.test`(lockSubmitted=false 여도 승인 잠금 — 요구 §1-2), `WorklogHistoryRecorder.test`(prefetch properties 옵션), `migrate.test`(v057~v059), `runSweep.test`(통제 작업은 DAILY_JOBS 밖).

## 9. AGENTS.md 문구 초안(리더가 반영 — 이 에이전트는 수정하지 않았다)

asApp 허용 **5번** 신설:
> 5. **워크로그 통제(worklog-control)** — `WorklogControlGateway` 만 쓴다(사유 고정 집합 `worklog-control-{read,edit,delete,restrict,release,foreign-delete,trigger,reconcile,backfill,readiness,diagnostic}` — 집합 밖 사유는 Jira 호출 전에 던진다). 트리거 경로의 이슈→프로젝트 조회(`issue/bulkfetch fields=project`, 사유 `worklog-control-trigger`)만 `WorklogControlDetector` 가 직접 부른다.
>    - 수정·삭제의 허가는 **승인 앱 현재 DB 상태로만** 판정한다(서명 문서·워크포스 판정으로 대신하지 않는다). 순서: 본인 작성분(Jira 응답 author) → 통제 작업 중·다른 경로 처리 중 → 기간 창(미해결이면 거부) → 인증 잠금 → 기간 잠금(승인은 정책 무관) → 정책. 실행 전 통제 행에 op id·호출 사용자를 claim 하고, PUT 에 `movesApproval.op` 프로퍼티를 실어 이력 행위자를 op 일치로만 귀속한다. asApp 은 통제 행(RESTRICTED·UNKNOWN)이 있거나 권한 스킴 방식일 때만.
>    - **asApp 조회 결과를 사용자에게 돌려주는 예외**(CLAUDE.md 불변식 8, Q127 승인): 우리 통제로 가려진 워크로그 중 ① 작성자 = 호출자, 또는 ② `TeamScope.leads` 를 통과한 대상자의 것 — 둘 다 SQL 소유자 조건 + 응답 author·worklogId·issueId 재대조 + 조회자 이슈 열람 재확인(`HiddenAwareCollector`)을 거치고, 설명은 작성자에게만, 합계·상한은 합친 뒤 재적용. 원래부터 제한된 워크로그는 보충하지 않는다.
>    - 제한·해제 PUT 은 visibility(와 op 프로퍼티)만 보낸다. 다른 경로 입력 삭제는 출처 증명 부재(`NONE`)일 때만, 안전장치 S1~S11 을 모두 거친다. 실행 직전 재확인(S4)에서 하나라도 어긋나면 FLAG 로 강등한다.
>    - `mypermissions` 는 앱 자신의 권한만, 진단은 관리자가 지정한 시험 이슈에서만 쓴다.
>    (2026-10-11 worklog-control)

**2번** 확장: "게시물은 … 두 종류다" → "세 종류다 — … + 통제 설정 문서(`movesApproval.ctl`, 프로젝트·이슈 프로퍼티 PUT/DELETE/대조 GET, `WorkforcePublisher.drainCtl`·`publishCtlNow`)".
**라이선스 절** 추가: "예외 — 워크로그 통제 상태·해제(`getWorklogControlStatus`·`releaseWorklogControl`)는 INACTIVE 에서도 연다(PermissionMap `licenseInactiveAllowed`, admin 축과 함께만). 앱 제거·만료 전 숨긴 기록을 되돌릴 수 있어야 한다."
**트리거·스케줄 절** 추가: "`worklog-control` 큐 작업은 일일 목록에 없다 — KVS 표식(`approval:worklogControl:pending`)이 있을 때만 일일 트리거가 넣는다. 원장은 SQL 행이고 큐는 깨우기다. `preUninstall` 은 보조 해제(55초)다."

## 10. 미검증·관문(실측 필요 — 진단 자동 + 사람 확인)

| 항목 | 관문 | 비고 |
|---|---|---|
| 앱(Forge) 계정이 `atlassian-addons-project-access` 멤버인가, Edit/Delete all 보유 | G_ROLE | KB 는 Connect 로만 기술 |
| visibility 만 PUT 수용·값 보존·`visibility:null` 로 해제 | G_PRESERVE | 실패하면 후퇴 모드(값 전체 PUT) 미구현 — C 금지로 처리 |
| 제한분에 작성자·관리자 직접 GET/PUT/DELETE 차단 | G_BLOCK | 일반 사용자·토큰·모바일은 수동 |
| asUser POST 에 제한 visibility 동봉 가능 | G_POST | 불가면 POST→PUT 공백 존재 |
| asUser GET 이 숨김분에 404 인지 403 인지 | G_BLOCK | 둘 다 숨김 후보로 처리 |
| 이슈 집계(timespent)·JQL·리포트 | G_AGG | 진단은 asApp timespent 만 자동 |
| `notifyUsers=false` 를 앱이 쓸 수 있나 | G_PRESERVE | |
| 제한 PUT 400 = 닫힌 이슈 | G_PRESERVE(closedIssueId) | D14 |
| asApp PUT 시 author 유지·updateAuthor=앱, asApp DELETE 이벤트 행위자 | G_PRESERVE·G_ORIGIN | 귀속은 op 일치로만 |
| 타 앱 프로퍼티 `expand=properties` 읽기 | G_ORIGIN | 워크포스 출처 증명 전제 |
| Start date 필드 탐색·응답에 칸 존재 여부 | G_FIELD | 칸 없음 = 미해결 |
| `getAppContext().appAri.appId`·`environmentAri.environmentId` 형태, 전역 페이지 하위 경로 | G_HANDOFF | 모르면 ctl `ui.globalPagePath:null` |
| `preUninstall` 실행·55초 | G_RECOVER(수동) | |
| team-managed 프로젝트 | G_TEAM_MANAGED | |
| 워크포스 WF-7~13 | G_WF·G_LINK·G_HANDOFF | 이 하네스 범위 밖 — WF-9 전까지 통제용 연동은 사실상 false, WF-12 전까지 연동 사이트 DELETE 저장 불가 |
| Forge Queue `payload` 크기·delay 900 이하 | — | 사용 지연 90·600초 |

`04_spike_todo.md` 는 이번 회차에 만들지 않았다 — 위 표가 그 내용이다(리더가 옮길 것).

## 11. 발견(요청 범위 밖 — 고치지 않음)

1. **알림 저장소가 요청 없는 알림을 못 담는다**(D11) — `approval_notification.request_id NOT NULL` + `page()` 가 `approval_request` JOIN. 통제 알림(다른 경로 입력 FLAG·삭제 예정·삭제됨·상한 도달·통제 실패)을 넣으려면 스키마·목록 쿼리 결정이 필요.
2. `WorklogCollector.fetchWorklogsByIdAsUser` 주석의 U3(asUser worklog/list 가 열람 불가 이슈를 빼는가) 미검증은 그대로 — 인증 경로는 기존대로 `issueVisibility` 로 재확인.
3. `PeriodLockService` 의 승인 잠금(lockApproved)이 이제 `lockSubmittedPeriod=false` 사이트의 내 타임시트 화면 잠금 범위(`rangesFor`)에도 승인 기간을 표시한다 — 요구 §1-2 의 의도로 판단했지만 화면 문구 확인이 필요.
4. `forge` CLI 13.4.0 — 14.1.0 업데이트 권고 경고.

---

# 2회차 (2026-10-11) — 리더 후속 2건

## R2-1. Phase D 서버 차단 — 알림 미구현(D11·Q130) 동안 무조건 닫힘

- 상수 `CONTROL_NOTIFICATIONS_READY = false`, `NOTIFICATIONS_GATE = 'NOTIFICATIONS'`(`src/resolver/worklogControl/WorklogControlState.js`, 상태 API `notificationsReady()`). Q130 이 해결되면 이 상수만 true 로 바꾼다.
- **저장 거부**(`WorklogControlService.prepareSave`): `foreignWorklogAction` 을 `DELETE` 로 바꾸는 저장은 다른 어떤 검사보다 먼저 거부한다 — 관문(G_ORIGIN·G_DELETE)·확인 입력·워크포스 출처 능력을 다 갖춰도.
  에러 `WORKLOG_CONTROL_GATE_REQUIRED`, cause `{ switch: 'DELETE', gate: 'NOTIFICATIONS', missing: ['NOTIFICATIONS'] }`.
- **상태 표시**(`getWorklogControlStatus`): `blockers.DELETE` 끝에 `'NOTIFICATIONS'` 가 붙고 `allowed.DELETE` 는 항상 false.
- **이중 방어**:
  - 감지기 `deleteReadiness` — 알림 불가면 `gatesOk:false` → `foreignDecision` 이 DELETE_PENDING 대신 FLAG.
  - 워커 `foreignDeleteOne` — claim 직후, Jira 조회·상한 확보·DELETE **전에** `FLAG_NOTIFICATIONS` 로 낮춘다(DELETE_PENDING 행이 어떤 경로로 생겼든).
  - 상태 API 가 없는 대역(테스트·잘못된 주입)도 닫힌 쪽으로 판정한다.
- 테스트: 저장 거부(모든 조건 충족 + 알림 false), 실제 모듈 기본값 false, 감지기 FLAG, 워커가 Jira·상한·DELETE 를 하나도 부르지 않음. 기존 S1~S11 시험은 "알림 해결 후"를 가정해 `notificationsReady: true` 를 주입해 유지했다.

## R2-2. 넘김 화면 issueKey · 이슈 키 입력 허용

- `getWorklogHandoff` 응답에 **`issueKey: string|null`** 추가(asUser `loadIssue` — invocation 캐시 공유, 못 읽으면 null). 나머지 shape 은 1회차 §3.1 그대로:
  `{ issueId, policy?, issueKey, timeZone, unit, now, permissions, lockRanges, worklog: WorklogView, approvalPolicy: null, control, worklogId }`
- 이슈 키 입력: 신규 `src/resolver/worklogControl/issueRef.js` `resolveIssueId(input)` — 숫자 id 는 그대로, `ABC-12`(대소문자 무관)는 **asUser** `GET /rest/api/3/issue/{KEY}?fields=project` 의 id 로, 형식 오류는 Jira 를 부르지 않고 null.
  - `runWorklogControlDiagnostic`: `issueId`·`closedIssueId` 에 키 허용. 못 바꾸면 진단기가 `INVALID_TARGET`(cause `{field:'issueId'}`), `closedIssueId` 는 null 로 넘긴다(그 단계만 건너뜀).
  - `saveApprovalSettings` `payload.worklogControl.sampleIssueId`: 키 허용. 못 바꾸면 검증 없이 `verified:false`(저장은 됨 — 1회차와 같은 규칙).
  - 저장·비교는 전부 숫자 id(`startDateField` 기록, 관문 기록, 진단 대상).
- 테스트: handoff issueKey·실패 시 null·NOT_OWNER, 진단 키 변환, 표본 키 변환·미해결, resolveIssueId 4경우.

## 결과

- `npx jest --runInBand`: **134 suites / 2051 tests 통과**(1회차 대비 +9).
- `forge lint`: No issues found.
- 이번 회차 수정 파일: `WorklogControlState.js`, `WorklogControlService.js`, `WorklogControlDetector.js`, `WorklogControlWorker.js`, `WorklogService.js`, 신규 `issueRef.js`, 테스트 3개(`WorklogControlWorker.test`, `WorklogControlService.test`, `WorklogServiceControl.test`). 마이그레이션·manifest·scope·에러 코드 변경 없음.
- 작업 트리의 `static/ui`·`locales`·`AGENTS.md` 변경은 프론트 에이전트·리더 몫이다(이 에이전트는 수정하지 않았다).

---

# 3회차 (2026-10-11) — 통합 검증(03_verify_report.md) 백엔드 몫 + 리더 결정

## R3-1 [P1 결정] 다른 경로 FLAG → 인증 차단 없음, 신호 `FOREIGN_ORIGIN`
- `domain/worklogCertification/summary.js`: `Signal.FOREIGN_ORIGIN`, 비트 **256**(128 은 BASELINE 표식, `signal_mask` SMALLINT 여유 안). `summarizeWorklog({..., foreignOrigin})` 입력 가산. 마이그레이션 없음.
- `WorklogCertService`:
  - `listMemberCertifications`·`listOwnCertifications`(공통 `listFor`) 항목 `summary.signals` 에 `'FOREIGN_ORIGIN'`. **`certifiable` 은 그대로**(인증을 막지 않는다).
  - 인증 실행(`certifyFor`)은 같은 신호를 동결 요약(`signal_mask`)에 남긴다 → 인증 감사·결재 상세의 `decodeFrozen` 요약에도 보인다.
  - 표시 기준: `worklog_control.foreign_state ∈ FLAGGED·RECHECK·DELETE_PENDING·DELETING·UNKNOWN`(오탐 해제 CLEARED·삭제 확정 DELETED 제외). 조회 1 SQL(통제 테이블 없으면 0), 실패는 빈 집합(신호만 빠짐).
- 정책 훅: `WorklogControlHooks.FOREIGN_BLOCKS_CERTIFICATION = false`(기본 끔). 켜면 목록 `certifiable:false`, 인증 실행 건별 `{ ok:false, code:'WORKLOG_FOREIGN_LOCKED' }`. 출처 증명(WF-12) 가동 후 리더 결정으로 켠다.
- **프론트 몫**: 신호 라벨 `FOREIGN_ORIGIN` 의 i18n 키(기존 인증 신호 라벨과 같은 자리) — 백엔드는 코드만 싣는다.

## R3-2 [P2] `loadHidden` 소유자 선검사
- `WorklogControlContext.loadHidden(issueId, worklogId, accountId)` — SQL 행 `author_account ≠ 호출자`(또는 호출자 없음)면 **asApp 없이 null** → `WorklogService` 는 원래 asUser 에러(`WORKLOG_NOT_FOUND`)를 그대로 던진다. 남의 숨김 기록의 존재를 NOT_OWNER 로 드러내지 않는다.
- 응답 author 두 번째 대조(`loadForWrite`)는 유지 — SQL 행은 본인인데 응답이 다르면 NOT_OWNER.
- 테스트: `WorklogServiceControl.test`(NOT_FOUND·asApp 미호출·호출 인자 / 두 번째 대조), 신규 `WorklogControlContext.test`(4경우 null).

## R3-3 [P2 결정] 연동 판정 불명 + 기간 창 ON → READ_FAILED
- `WorklogControlContext.contextFor`: `link.unavailable && dateWindowOn` 이면 `linked:true` 로 보고 `window = { status:'READ_FAILED', start:null, end:null, timeZone, fieldId }` → 쓰기 경로 `judgeMutation`/`judgeCreate` 가 `WORKLOG_WINDOW_UNRESOLVED`(cause `{status:'READ_FAILED'}`)로 거부. 목록은 `control.dateWindow.status:'READ_FAILED'`, 본인 행 `blocked.code:'WINDOW_UNRESOLVED'`.
- `channel` 은 판정이 될 때만 WORKFORCE(불명은 APP 유지). 창 OFF 면 영향 없음. 감지기(외부 입력 처리)는 불명을 범위 밖으로 둔다(FLAG 오탐 방지) — ControlLinkJudge 주석 갱신.
- 테스트: `WorklogControlContext.test` 3경우.

## R3-4 [P3] await 없는 정리 SQL 제거
- `beginCreate`·`finishCreate` 의 `cleanupIntents`·`cleanupInline` 호출 삭제. 대신 intent 를 남기면 `state.ensurePending(now)`(KVS 읽기 1, 없을 때만 쓰기 1)로 표식만 세운다.
- 정리는 통제 큐 작업(`WorklogControlWorker.run`)이 표식이 있는 날 묶어서: `cleanupIntents(before)`(intent 90일), `cleanupExpired(before)`(종료 행 NONE·GONE·RELEASED·RELEASED_FOREIGN ∧ foreign 없음/CLEARED/DELETED, 90일 — 참고 사본 90일 포함), 각 500행. 그 뒤 할 일이 없으면 표식을 지운다.
- 비용: 작성 1건당 KVS +1(표식이 있으면 읽기만). 유휴는 그대로 0 — 표식이 있는 날의 큐 작업 상한을 4 → **6**(정리 DELETE 2)으로 테스트 갱신(`idleSqlBudget.test`). 미연동 27·연동 38 불변.
- 리포지토리: `cleanupInline(authorId, before)` → `cleanupExpired(before, limit)`, `cleanupIntents(authorId, before)` → `cleanupIntents(before, limit)`.

## R3-5 [P3] `listForeignWorklogs` 불투명 커서
- `nextCursor` = base64url(JSON `{a: 마지막으로 읽은 원본 행 worklogId}`) — 가린 행이어도 id 가 그대로 보이지 않는다. 입력 커서는 같은 형식만(숫자 문자열 직접 → `INVALID_TARGET`).
- **프론트 영향**: 커서를 받은 그대로 되돌려 보내면 된다(형식에 의존하지 않을 것).
- 테스트: 가린 행 위치로 이어 읽기·직접 숫자 거부.

## 결과
- `npx jest --runInBand`: **135 suites / 2069 tests 통과**.
- `forge lint`: No issues found.
- 수정: `summary.js`, `WorklogCertService.js`, `WorklogControl{Hooks,Repository,Context,Worker,Service,State}.js`, `ControlLinkJudge.js`(주석), `WorklogService.js`(loadHidden 인자). 테스트: `WorklogCertService.test`, `originForeign.test`, `WorklogServiceControl.test`, `WorklogControlWorker.test`, `WorklogControlService.test`, `idleSqlBudget.test`, 신규 `WorklogControlContext.test`. 마이그레이션·manifest·scope·에러 코드 변경 없음.

---

# 4회차 (2026-10-11) — 워크포스 WF-7~13 대응(05_workforce_report.md §6)

## R4-1 이슈 연동 신호(rms.policy I:) 자동 수신
- 신규 `src/resolver/worklogControl/IssueSignalRefresher.js` — 그 이슈의 `movesRms.policy` 를 읽어 **기존 `WorklogPolicyAuthority.refreshOne`** 으로 서명 검증·반영(rev 규칙·대상 결속·삭제 sticky 그대로, 불변식 9). `controlLinkOf` 신선도 규칙은 무변경.
- 호출 시점: `ControlLinkJudge.linkOf({..., refresh})` 에서 판정 직전.
  - 화면(작업 로그 탭·편집 컨텍스트·넘김·쓰기 — `WorklogControlContext.contextFor`): `refresh:'USER'` → 호출자 asUser.
  - 워크로그 이벤트(`WorklogControlDetector.handleCreated`): `refresh:'APP'` → `WorklogControlGateway.signalRequest`(asApp, 사유 **`worklog-control-trigger`** — 기존 고정 사유 안).
  - 워커(재계산·백필)·reevaluate 는 refresh 없이 캐시만(유휴·배치 경로 Jira 0).
- `WorklogPolicyAuthority.refreshOne(target, { request })` — 요청 주체 주입 인자 가산(기본 asUser 그대로).
- 비용: 연동 끔(KVS) → SQL 0 / 워크포스 게시물을 검증 수신한 적 없는 설치 → **SQL 1**(`hasAnyVerifiedInbound`)로 끝, Jira 0 / 그 이슈 행을 **1시간 안에** 확인했으면(있음·없음 모두 — 없으면 refreshOne 이 NONE 행을 남긴다) Jira 0, SQL 2 / 그 밖만 Jira 1 + 반영 SQL. invocation 당 이슈 1회(memo). **유휴 SQL 불변**(일일 경로에서 부르지 않음 — `idleSqlBudget` 그대로 통과).
- 주의: 연동 사이트에서는 열람·이벤트가 있었던 이슈마다 `workforce_inbound` 에 `rms.policy I:{id}` 행(신호 없음 = NONE)이 생긴다(행당 ~200B). 보관 정리는 없다 — 필요하면 후속(§11 발견 5).

## R4-2 능력 신호 즉시 갱신 — 신규 resolver `refreshWorkforceCapabilities`
- 권한 `{ admin: true }`(PermissionMap·Controller·CONTROLLER_REGISTRARS(기존 registrar) — 계약 테스트 통과).
- 입력: `{ accountIds: string[] ≤50 }` **또는** `{ projectId }`(asUser `GET user/assignable/search?project=&maxResults=50` → 사람 계정(`accountType:'atlassian'`)만). 둘 다 없거나 형식 오류·51명 이상 → `INVALID_TARGET`. 수신 테이블 미준비 → `STORAGE_NOT_READY`.
- 동작: `WorkforceInbound.refreshOrgs(ids)` — 관리자 asUser 로 각 사용자 `movesRms.org` 를 **지금** 읽어 서명 검증·반영(기존 orgOf 와 같은 nextRow/apply — 삭제는 sticky). Jira 가 남의 사용자 프로퍼티 읽기를 거부하면 그 사람은 `UNREADABLE`(캐시 그대로).
- 응답(content):
```js
{ checked: number, capable: number,
  items: [{ accountId, status: 'VERIFIED'|'NONE', capable: boolean, result: 'OK'|'ABSENT'|'UNREADABLE'|<검증 코드> }],
  workforceOriginCapable: boolean }   // DELETE 관문 판정과 같은 함수(검증된 rms.org 중 cap wlorigin)
```
- DELETE 관문 근거: `WorklogControlService.switchStatus`·`prepareSave` 가 이미 쓰는 `links.workforceOriginCapable()`(수신 캐시)를 이 resolver 가 갱신한다 — 별도 판정 경로를 만들지 않았다. (Phase D 는 R2 `CONTROL_NOTIFICATIONS_READY=false` 로 여전히 닫혀 있다.)
- 감사: 설정 감사 `area:'worklogControl', action:'refreshCapabilities', detail:{checked}`.

## R4-3 서명된 NONE 즉시 해제 — 확인·테스트 고정
- 수신 경로(`refreshOne` → `authorityRevisionResult` → `verifyPolicyEnvelope` 가 `ctl` 보존)로 **더 새 rev 의 서명 NONE** 이 오면 행 본문이 `ctl:'NONE'` 으로 바뀌고 `controlLinkOf` 가 즉시 `{linked:false, released:true}`(기존 통제 행은 `keepControlled` 가 해제 대상으로 본다). 테스트로 고정:
  - 새 rev NONE → UPDATED·released / 옛 rev NONE → STALE_REV·연동 유지 / 다른 이슈로 옮긴 NONE → TARGET_MISMATCH·연동 유지 / **프로퍼티 삭제(ABSENT) → VERIFIED 유지(sticky, 위조 방지 규칙 그대로)**.
- 화면·이벤트 시점 자동 수신(R4-1) 덕분에 워크포스가 NONE 을 게시하면 그 이슈의 다음 열람·이벤트(최대 1시간 재확인 간격)에 반영된다. 이벤트·열람이 없는 이슈는 관리자 refresh 전까지 그대로다.

## 프론트(다음 단계) 연결 필요
- 워크로그 통제 설정 > 다른 경로 입력/DELETE 영역에 "능력 신호 다시 읽기"(사용자 선택 또는 프로젝트 지정) → `invoke('refreshWorkforceCapabilities', {accountIds}|{projectId})`, 결과 표(items) + `workforceOriginCapable`, 끝나면 `worklogControl.status()` 무효화(blockers.DELETE 의 `WF_WLORIGIN` 갱신).
- 안내 문구(05 §6-2): 프로젝트 신호(P: ALL_ISSUES)는 워크포스가 **필터 없는 전체 스페이스 구독**에만 건다 — 그 밖은 이슈 단위 신호(자동 수신)로 연동된다.
- i18n: 결과 코드 `UNREADABLE`(남의 사용자 프로퍼티를 읽을 권한 없음 — Jira 관리자로 실행 권장).

## 미검증 추가
| 항목 | 확인 |
|---|---|
| 앱(asApp)이 이슈 프로퍼티 `movesRms.policy` 를 읽는가(트리거 자동 수신) | 연동 이슈 워크로그 작성 후 `workforce_inbound` I: 행 |
| 관리자 asUser 로 남의 사용자 프로퍼티 GET(Jira 관리자/앱 관리자 차이) | `refreshWorkforceCapabilities` 결과 UNREADABLE 여부 |
| `user/assignable/search?project=` 가 프로젝트 id 를 받는가(문서상 key·id 모두) | 프로젝트 지정 실행 |

## 결과
- `npx jest --runInBand`: **143 suites / 2215 tests 통과**(작업 트리의 audit-retention-sync 등 다른 미커밋 변경 포함 상태).
- `forge lint`: No issues found.
- 이번 회차 수정: `WorklogPolicyAuthority.js`(request 주입), `WorkforceInbound.js`(`refreshOrgs`), `WorklogControl{Gateway,Context,Detector,Service,Controller}.js`, `ControlLinkJudge.js`, `PermissionMap.js`, 신규 `IssueSignalRefresher.js`, 신규 테스트 `IssueSignalRefresher.test.js`(20). `docs/`·`static/ui`·`locales`·`AGENTS.md` 무수정, manifest·scope·마이그레이션·에러 코드 변경 없음.
- §11 발견 5: 자동 수신이 남기는 `workforce_inbound` NONE 행(열람 이슈 수만큼)의 보관 정리 정책 없음.

---

# 5회차 (2026-10-11) — 교차 검증 [P2] 신선도 갱신

## 원인
`WorklogPolicyAuthority.refreshOne` 이 `UNCHANGED`(같은 rev·같은 본문)일 때 행을 건드리지 않고 돌아가서 `workforce_inbound.checked_at` 이 첫 수신 시각에 멈췄다 → 4회차 `IssueSignalRefresher` 의 1시간 관문이 안정된 연동 이슈에서 영영 "오래됨"으로 보여, 열람·이벤트마다 Jira 1회 + SQL 이 다시 돌았다.

## 수정
- `WorkforceLinkRepository.touchInbound(typ, entityId, expectedRev, now)` 신규 — `UPDATE workforce_inbound SET checked_at = ?, rev = rev + 1 WHERE typ = ? AND entity_id = ? AND rev = ?`(rev CAS, 불변식 4). 진 쪽(false)은 방금 다른 호출이 갱신한 것이라 그대로 둔다.
- `refreshOne`: `UNCHANGED` 면 본문·상태는 그대로 두고 `touchInbound` 로 확인 시각만 갱신(실패는 삼킴 — 판정 결과는 UNCHANGED 그대로). 다른 결과(UPDATED·STALE_REV·검증 실패·ABSENT)는 기존대로 `updateInbound`/`insertInbound` 가 `checked_at` 을 남긴다.
- 관리자 refresh(`refreshWorkforcePolicies`)도 같은 함수라 UNCHANGED 시 SQL 1회(touch)가 늘었다 — 관리자 실행 경로, 유휴 무관.

## 테스트
- `WorklogPolicyAuthority.test`: "UNCHANGED 면 내용 UPDATE 없음 + `touchInbound('rms.policy','P:1',7,now)`" 로 기대값 갱신(의도된 변경).
- `IssueSignalRefresher.test` 신규 describe「신선도 — 실제 refreshOne 과 IssueSignalRefresher 를 엮어서」: 메모리 inbound(insert/update/touch 가 checked_at·rev CAS 를 흉내, `checkedAt` 직접 주입 없음) + 실제 서명 신호.
  - 연동 이슈: 1차 UPDATED(Jira 1) → 재확인 간격 경과 후 UNCHANGED(Jira 2, touch 1, update 0) → 10분 뒤 **FRESH(Jira 그대로 2)**.
  - 신호 없는 이슈: NONE 행도 같은 간격으로 Jira 0.
  - `touchInbound` SQL 형태(rev CAS·`rev = rev + 1`).

## 결과
- `npx jest --runInBand`: **143 suites / 2218 tests 통과**. `idleSqlBudget` 그대로(일일 경로 무관 — 미연동 27·연동 38).
- `forge lint`: No issues found.
- 수정 파일: `WorklogPolicyAuthority.js`, `WorkforceLinkRepository.js`, 테스트 `WorklogPolicyAuthority.test.js`·`IssueSignalRefresher.test.js`. manifest·scope·마이그레이션·에러 코드 변경 없음. 커밋하지 않음.
