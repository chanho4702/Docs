# worklog-control 프론트 보고서 (1회차)

> 작성: frontend-engineer · 2026-10-11 · 입력: `01_architect_design.md` 2판 §0.4·§7·§8, `02_backend_report.md`(shape·D1~D17·에러 12, **우선**), `codex-review.md`
> `src/` 무수정. 커밋·배포 없음. 엔트리 추가 없음(manifest·craco·public html 무수정 — manifest 변경분은 백엔드 `preUninstall`).

## 1. 결과

| 항목 | 결과 |
|---|---|
| `npm run merge` | 성공(ko-KR.json·en-US.json 생성, 두 언어 키 집합 일치) |
| `npm run test:ui -- --runInBand` | **58 suites / 521 tests 중 519 통과, 2 실패** — 실패 2건은 `features/audit/__test__/AuditTrail.test.jsx`(「탭 4개…필터를 옮긴다」, 「결재 행의 링크로 설정 변경 탭에…」)로, **이번 작업 전 기준선에서도 똑같이 실패**했다(54 suites/477 tests 중 같은 2건). 오늘 날짜(2026-10-11)에 따라 `to` 가 하루 어긋나는 날짜 의존 실패이며 이번 변경과 무관. 신규·변경 테스트는 전부 통과(+44) |
| `npm run build:ui` | **성공**(Compiled with warnings — Atlaskit source map·postcss-calc 경고, 기존과 같음) |
| i18n 키 대조 | 변경 파일의 리터럴·열거 키 전부 kr/en 에 있음(테스트 + 스크립트 확인) |

## 2. 파일

신규
```
static/ui/src/features/worklog/
  windowPrecheck.js        기간 창 사전 판정(서버 window/judgeMutation 과 같은 규칙, fail-close, previousStarted)
  rowActions.jsx           행 수정·삭제 버튼 상태(rowActionsOf) + 비활성 버튼 툴팁(RowAction)
  ControlBadges.jsx        controlled·foreign·via 배지
  adfText.js               참고 사본 ADF → 평문
  handoffPath.js           넘김 경로 판독(worklog/{issueId}/{worklogId})
  WorklogHandoffPage.jsx   넘김 화면
  __test__/worklogControlPure.test.js, __test__/WorklogHandoffPage.test.jsx
static/ui/src/features/worklogControl/
  worklogControlModel.js   관문·단계·에러 문장·대상 문자열(순수)
  WorklogControlSettings.jsx  설정 화면(단계 표·다른 경로 처리·기간 창/시작일 필드·제한 대상 + 아래 4개 조립)
  ControlStatusPanel.jsx   현황(counts)·재시도·통제 해제
  GateDiagnostics.jsx      실측 진단(관문 15개)
  ReadinessTable.jsx       프로젝트 권한 점검 표
  ForeignWorklogList.jsx   다른 경로 입력 목록
  TypedConfirmModal.jsx    RELEASE·DELETE 확인 입력 모달
  __test__/worklogControlModel.test.js, __test__/WorklogControlSettings.test.jsx
locales/{kr,en}/worklogControl.json
```
변경: `entries/inbox.jsx`(하위 경로 라우팅), `features/worklog/{WorklogTab,WorklogDialog,LockBadge,lockText,worklogTime}`, `features/settings/{settingsNavigation,SettingsPage}`, `features/worklogPolicy/{policyFields,WorklogPolicyPanel}`, `utils/queryKey/approvalKeys.js`, 테스트 2개(WorklogTab·WorklogDialog — 통제 describe 추가, WorklogTab 테스트 mock 이 testId 를 넘기도록), `locales/{kr,en}/{worklog,error,worklogPolicy,worklogHistory,policy}.json`.

## 3. 소비하는 resolver · 접근 경로

| resolver | 호출 지점 | 소비 경로(백엔드 보고서 §3 기준) |
|---|---|---|
| `getIssueWorklogs` | WorklogTab | `pages[0].control.{visibilityScope, channel, dateWindow}`, `pages[0].removedForeign[]`(`started, seconds, deletedAt, snapshot.comment(ADF), snapshot.commentTruncated`), `worklogs[].{canEdit, canDelete, blocked, controlled, foreign, via}` |
| `getWorklogEditorContext` | WorklogDialog | `control.dateWindow`, `control.channel`, `worklog.{canEdit, blocked}`, `timeZone` |
| `getWorklogHandoff` `{issueId, worklogId}` | WorklogHandoffPage | D2 상위집합 그대로 `WorklogForm` 에 editor 로 넘김 + `worklog`, `policy`, `timeZone` |
| `createWorklog`·`updateWorklog`·`deleteWorklog` | 대화상자·탭·넘김 화면 | 응답 shape 는 기존대로만 사용(D6 — 쓰기 뒤 목록 무효화) |
| `getWorklogControlStatus` `{}` / `{withFieldCandidates:true}` | 설정(상태) / 시작일 후보 버튼 | `settings.*`, `settings.startDateField.{fieldId, verified, candidates[]}`, `state.{releasing, releaseRemaining, invariantApproved, since}`, `gates[id].{result, parts.auto/manual, at, appVersion, note, versionChanged}`, `allowed`, `blockers`, `counts`, `deletesToday`, `deleteDailyMax` |
| `runWorklogControlDiagnostic` `{gateId, issueId, closedIssueId?}` | GateDiagnostics | `result, steps[].{key, expected, observed, ok}, leftovers?` |
| `recordWorklogControlGate` `{gateId, result, note?}` | GateDiagnostics | 응답은 무효화 트리거로만 |
| `getWorklogControlReadiness` `{cursor?}` | ReadinessTable(버튼 눌러야 시작) | `items[].{projectKey, name, app.*, scheme.{readable, addonRole.*, userHolders.*}, verdict}`, `nextCursor` |
| `releaseWorklogControl` `{confirm:'RELEASE'}` | ControlStatusPanel | `pending`(직후 잔여 표시) |
| `retryWorklogControl` `{}` | ControlStatusPanel | `queued` |
| `listForeignWorklogs` `{limit:50, state?, cursor?}` | ForeignWorklogList | `items[]`, `users`, `hiddenCount`(쪽마다 합산), `nextCursor` |
| `clearForeignWorklog` `{worklogId}` | ForeignWorklogList | — |
| `saveApprovalSettings` | 설정 화면 | **`{ patch, worklogControl? }` 모양으로 보낸다** — 서버가 `payload.patch ?? payload` 를 패치로 읽어, `worklogControl` 을 패치와 같은 층에 섞으면 `normalizeSettingsPatch` 가 모르는 키로 거부한다. `worklogControl.{sampleIssueId, confirmDelete}`(D3) |

에러 분기는 전부 `error.code`. `WORKLOG_CONTROL_GATE_REQUIRED` 는 `cause.missing` 을 관문 이름(+`FIELD_UNVERIFIED`·`WF_WLORIGIN`)으로 풀어 보인다(설정 화면과 `WorklogPolicyPanel` — 프로젝트·이슈 덮어쓰기에서 기간 창을 켤 때도). `INVALID_TARGET` 은 `cause.field` 별 문장.

## 4. 화면별 구현

### 4.1 작업 로그 탭
- 통제 응답(`blocked` 키 존재)이면 **본인 행은 수정·삭제 버튼을 항상 그리고**, `canEdit/canDelete=false` 면 비활성 + 툴팁(`blockedText` — NOT_OWNER·OUTSIDE_WINDOW(`{start}~{end}`, previousStarted 면 "원래 기간" 덧붙임)·WINDOW_UNRESOLVED(상태 4종)·CERTIFIED/MISMATCH·PERIOD_*·FOREIGN_PENDING·NO_JIRA_PERMISSION·CONTROL_UNAVAILABLE·CONTROL_BUSY). 서버가 사유를 하나만 주므로 허용된 쪽 버튼에는 사유를 붙이지 않는다(FOREIGN_PENDING 은 수정만 막힘).
- 남의 행(`blocked.code==='NOT_OWNER'`)은 버튼 없음(D1). 통제 응답이 아니면 옛 규칙 그대로(기존 테스트 유지).
- 배지: 잠김 배지에 인증·기간 밖·미해결 추가, `controlled` → 앱 관리 / 관리 처리 중 / 관리 실패, `via==='APP'` → 숨김(본인만 보임), `foreign` → 다른 경로 입력(삭제 예정은 따로, 사유 툴팁). 모두 본인 행에만 온다(D1).
- `channel==='WORKFORCE'` → Log work 버튼 숨김 + 안내(수정·삭제는 유지). 대화상자(생성)에도 같은 안내.
- `dateWindow` OK → "입력 가능 기간 …", 그 밖 → 경고 + 관리자 문의.
- `visibilityScope!=='OFF'` → "승인·인증 잠금은 다음 일일 동기화 때 반영될 수 있습니다"(D15).
- `removedForeign` → 참고 사본(ADF 평문) + "복원 아님" + [다시 입력(새 기록)](생성 대화상자).

### 4.2 대화상자·넘김 화면
- `windowPrecheck` 로 기간 밖·미해결이면 저장 비활성 + 사유. DatePicker `minDate/maxDate` 는 안내용(브라우저 날짜 ≠ 정책 타임존 날짜일 수 있어 판정은 precheck·서버).
- 수정 허용은 통제 응답이면 `worklog.canEdit`(서버 판정) — **앱 대행이면 `permissions.canEditOwn=false` 여도 열린다**. 막혔으면 `blocked` 문장.
- 통제 거부 코드(인증·기간 창·삭제 예정·CONFLICT)는 편집 컨텍스트와 `worklogControlKeys.all` 을 다시 받는다.
- **넘김**: 엔트리 추가 없이 `entries/inbox.jsx` 에서 `location.pathname` 끝이 `worklog/{숫자}/{숫자}` 면 `WorklogHandoffPage`(지연 로드), 아니면 업무함. pathname 이 앱 기준 상대인지 전체 경로인지 미검증(G-HANDOFF)이라 **끝부분만** 본다. 화면: 안내(수정·삭제는 승인 앱이 판정, 작업 로그 탭에서도 가능) + 기록 요약·배지 + [수정](대화상자 폼 `WorklogForm` 재사용) / [삭제](DeleteConfirm → `deleteWorklog`). 업무함 엔트리라 LicenseGate 는 block 모드.

### 4.3 설정 > 워크로그 통제
- **설정 네비 별도 항목 `worklogControl`**(설계 §7.3 은 타임시트 탭 안 — 아래 §6 편차). 설정 엔트리(adminPage)·업무함 설정 둘 다에서 열린다.
- 이 화면은 `getApprovalSettings` 를 읽지 않고 `getWorklogControlStatus` 하나로 그린다 → **라이선스 INACTIVE 에서 설정 엔트리(LicenseGate `banner` 모드 — `entries/settings.jsx` 확인)로 들어오면 현황·해제가 동작**한다. 재시도·진단 등은 라이선스 에러가 그대로 보인다(예외 아님). 업무함 경로는 block 모드라 INACTIVE 면 안내 화면.
- 단계 표 A~D·권한 스킴: 상태(켜짐/꺼짐) + 막힌 이유(보안 검토 미승인 → 해제 중 → 빠진 관문 이름) + [켜기](확인 모달 → `{patch:{worklogVisibilityScope}}` 또는 `worklogLockMethod`). B·C 끄기는 "통제 해제로" 안내(해제가 스위치를 OFF 로 저장 — D7). 권한 스킴 끄기는 바로 저장.
- **Phase D**: `DELETE_NOTIFICATIONS_READY=false`(Q130) — 서버 allowed.DELETE 가 true 여도 버튼·DELETE 옵션 비활성 + "알림 준비 전 사용 불가" 안내. 알림이 준비되면 상수만 바꾸면 DELETE 확인 모달(`DELETE` 입력 → `worklogControl.confirmDelete`)이 열린다(구현·연결 완료).
- 다른 경로 입력 처리: 처리(OFF/FLAG/DELETE)·범위(LINKED/ALL), 오늘 삭제 수/상한.
- 이슈 기간 창: 현재 필드·확인 여부, [후보 불러오기](`withFieldCandidates`, 키 `status(true)`), 필드 ID 입력/선택 + 표본 이슈 ID → [표본 이슈로 확인 후 저장] = `{patch:{issueStartDateField}, worklogControl:{sampleIssueId}}`, 결과 미확인이면 실패 안내. 기간 창 켜기는 `allowed.dateWindow` 일 때만, 빠진 것(FIELD_UNVERIFIED·G_FIELD) 표시. 정책 화면(`policyFields`)에 `worklogDateWindow` 추가(프로젝트·이슈 덮어쓰기용).
- 제한 대상: 앱 역할(기본)/프로젝트 역할/그룹, 잔여(숨김·처리 중·실패·해제 중)나 해제 중이면 비활성, G_GROUP 미통과 표시.
- 현황: counts 12종, 통제 시작 시각, 지연 문구(D15), [실패·불명 재시도], [통제 해제](`RELEASE` 입력 → `{confirm:'RELEASE'}`), 해제 중이면 "남은 N건" + "0 전에는 완료 아님"(D4).
- 실측 진단: 관문 15개 — 결과 배지, 종류(자동/사람 확인/둘 다 — `parts` 의 null 여부로 판단, D5), 둘 다인 관문은 부분별 결과, 필요한 단계, 기록 시각·버전·메모, `versionChanged` 경고. 자동은 시험 이슈 ID(숫자, 선택적으로 닫힌 이슈)가 있어야 [실행], 결과 단계(key/기대/관측/ok)와 `leftovers` 경고. 사람 확인은 [통과로 기록]/[실패로 기록] → 관문별 확인 방법 안내 + 메모(≤500).
- 프로젝트 권한 점검 표: [점검] 눌러야 조회(프로젝트마다 Jira 호출), 더 보기, 판정 배지 + 판정별 가이드.
- 다른 경로 입력 목록: 상태 필터, 작성자 아바타, 사유, 연동 여부, [오탐 해제], `hiddenCount` 합산 안내.

## 5. 쿼리키

`worklogControlKeys = { all, status(withFieldCandidates), readiness(), foreign(state), handoff(issueId, worklogId) }`. 저장·진단·관문 기록·해제·재시도·오탐 해제 뒤 `worklogControlKeys.all` 무효화. 설정 저장은 `worklogPolicyKeys.all`·`worklogKeys.all` 도 함께. 대화상자 쓰기 성공은 `worklogKeys.all`+`worklogControlKeys.all`(넘김 화면 캐시). 넘김 화면 쓰기 뒤 `worklogControlKeys.all`·`worklogKeys.all`·`worklogHistoryKeys.all`.

## 6. 설계 대비 차이

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| F1 | `WorklogControlSettings` 를 설정 > 타임시트 탭 안에 | 설정 네비 **별도 항목** `worklogControl`(`policy.settings.tab.worklogControl`) | 섹션 8개(관문 15개·점검 표·목록)라 타임시트 탭이 지나치게 길어진다 |
| F2 | 넘김 = 업무함 라우터 규칙 | pathname **끝부분 정규식** 판독(`handoffPath.js`) | 업무함은 `?tab=` 쿼리 라우팅이고, Forge history pathname 형태(상대·전체)가 미검증(G-HANDOFF) |
| F3 | 진단 단계 결과 번역 | 단계 `key`(예: `appRead`)는 원문 표시 | 서버 키 30여 개가 기술 항목이고 기대·관측 값도 원문 문자열이라 관리자 진단 도구로는 원문이 더 정확 |
| F4 | `notification.worklogControl.*` 5종 | **추가 안 함** | 백엔드 D11 — 알림 미구현이라 소비처 없음(Q130 해결 때 함께) |
| F5 | 시험·표본 이슈 선택 | 숫자 이슈 ID 입력(키 불가 안내) | 서버가 숫자 id 만 받고(`/^\d{1,18}$/`) 키→id 변환 resolver 가 없다 |
| F6 | `blocked.code` 에 `CONTROL_UNAVAILABLE` | 문장은 준비, 목록에서는 오지 않음(백엔드 §3.2 — 쓰기 에러로만) | — |

## 7. 추가 i18n 키

- 신규 namespace `worklogControl`(kr/en): title·description·blockers·hiddenCount, guide.{title,visibility,permissionScheme,sideEffects,channel}, phase.{title,A,B,C,D,scheme,on,off,turnOn,turnOff,offViaRelease,deleteViaForeign,confirmScheme,desc.*}, phaseShort.*, reason.{invariantPending,releasing,notificationsNotReady}, missing.{FIELD_UNVERIFIED,WF_WLORIGIN}, invalid.*(7), status.*, counts.*(12), release.*, gate.{…, result.*, kind.*, name.*(15), desc.*(15), manual.*(15)}, foreign.{…, action.*, scope.*, reason.*(6), state.*(7), list.*}, delete.confirmBody, startField.*, target.*, readiness.{…, perm.*, verdicts.*, guide.*}
- `error`: 신규 12개(§4 그대로) — 테스트가 `ErrorCodes.js` 와 kr/en 존재를 대조
- `worklog`: tab.{channelWorkforce,window,windowContact,controlDelay,removedForeign,snapshotNote,reenter,deletedAt}, lock.reason.{CERTIFIED,MISMATCH,OUTSIDE_WINDOW,WINDOW_UNRESOLVED}, window.status.*(4), blocked.*(5+unknown), control.badge.*·control.hint.*(3), via.{app,appHint}, foreign.{badge,badgePending,hint}, handoff.{title,notice,deleted}
- `worklogPolicy.key.worklogDateWindow`, `worklogHistory.source.CONTROL`, `policy.settings.tab.worklogControl`

## 8. 테스트(+44)

- `worklog/__test__/worklogControlPure.test.js`(12): windowPrecheck 5상태·경계·타임존·previousStarted, handoffPath, blockedText·에러 문장, rowActionsOf(옛 규칙/본인 비활성/NOT_OWNER/FOREIGN_PENDING), 배지, ADF.
- `WorklogTab.test.jsx` +4: 비활성+사유·남의 행 버튼 없음, 처리 중·기간 밖·배지 3종·지연 문구, 워크포스 창구·기간 줄, 미해결 경고·참고 사본·다시 입력.
- `WorklogDialog.test.jsx` +4: 기간 밖 저장 불가→안으로 옮기면 풀림, 미해결 fail-close, 서버 판정 수정(인증 잠금 사유 / 앱 대행 canEditOwn=false 에도 열림), 통제 거부 코드 문장 + 컨텍스트 재조회.
- `WorklogHandoffPage.test.jsx`(4): 조회 payload·배지·폼 수정, 막힌 사유, 삭제, NOT_OWNER.
- `worklogControlModel.test.js`(11): **서버 소스 대조**(GATES 집합·REQUIRED 표·에러 12개가 ErrorCodes 와 kr/en 에 존재·BlockCode/ForeignState/ForeignReason 사전 존재), 관문 줄, 단계 이유 순서, D 알림 미준비, 에러 문장, 대상 문자열, 잔여.
- `WorklogControlSettings.test.jsx`(9): blockers 이름 표시·D 비활성, 보안 검토·해제 중 이유 + 잔여 표시, 켜기 → `{patch}` 저장 + GATE_REQUIRED 빠진 관문, RELEASE 입력 확인, 진단 실행 payload·결과·leftovers·관문 15개·부분 결과·버전 경고·수동 기록, 진단 INVALID_TARGET, 시작일 필드 확인 payload, 다른 경로 목록 hiddenCount·오탐 해제, STORAGE_NOT_READY.

## 9. 백엔드 요청

1. **Phase D 서버 차단** — 지금 서버는 관문(G_ORIGIN·G_DELETE)만 보므로 두 관문이 통과로 기록되면 알림 없이(Q130 미해결) DELETE 저장이 열린다. 화면은 상수로 막았지만, 서버 `prepareSave` 에도 "알림 준비 전 DELETE 거부"(예: `WORKLOG_CONTROL_GATE_REQUIRED` missing `NOTIFY_READY`)를 두는 것을 권한다 — 화면만 막으면 resolver 직접 호출로 열린다.
2. (선택) 진단·표본 이슈 입력에 **이슈 키 허용** — 관리자가 숫자 id 를 찾기 어렵다. 서버에서 키→id 를 asUser 로 해석하면 화면도 키를 받을 수 있다.
3. (선택) 넘김 화면 안내를 이슈 링크로 만들려면 `getWorklogHandoff` 에 `issueKey` 가 필요하다(지금은 편집 컨텍스트처럼 null).

## 10. 확인 필요(실측)

- G-HANDOFF: 전역 페이지 하위 경로로 들어올 때 Forge history `location.pathname` 형태 — `handoffPath` 가 끝부분만 보므로 둘 다 받지만, 실제로 하위 경로가 iframe 까지 전달되는지는 실측 전.
- 비활성 버튼 툴팁(span 래핑)이 Jira 이슈 탭 iframe 에서 뜨는지 — aria-label 로도 사유가 읽힌다.
- 백엔드 §11-3: `lockSubmittedPeriod=false` 사이트에서도 승인 기간이 `lockRanges` 에 들어와 대화상자 사전 판정 문구(`PERIOD_APPROVED`)가 보인다 — 의도(요구 §1-2)와 맞음.

---

## 2회차 (2026-10-11) — AuditTrail 날짜 의존 실패 수정

### 원인
`features/audit/__test__/AuditTrail.test.jsx` 의 두 테스트(「AuditPage › 탭 4개, 탭별 보관 안내, 다른 탭 링크로 필터를 옮긴다」, 「설정 변경 탭(listSettingsAudit 2회차) › 결재 행의 링크로 설정 변경 탭에 행위자·기간이 옮겨진다」)는 `AuditPage` 를 그린다. `AuditPage` 는 탭에 `now` 를 넘기지 않으므로 탭이 기본값 `Date.now` 를 쓴다. 기대값 `to: startOfLocalDay('2026-10-11')` 은 파일의 `NOW`(2026-10-10 15:30) 기준으로 계산한 "오늘 다음 날 0시(반열림 끝)"라서, 실제 실행일이 2026-10-11 이 되자 하루가 밀렸다(`followUpRangeOf` 가 기간 끝을 오늘로 넓힌다).
**제품 코드의 경계 계산은 틀리지 않았다.** 같은 함수를 `now` 주입으로 부르는 다른 테스트(`followUpRangeOf(..., NOW)` → `toDate: '2026-10-10'`)는 그대로 통과한다. 제품 코드는 고치지 않았다.

### 수정
- 테스트만 고쳤다. `AuditPage` 를 그리는 위 두 테스트에서만 `jest.spyOn(Date, 'now').mockReturnValue(NOW)`(`fixNow()`)로 시계를 고정하고, `afterEach` 에서 복원한다.
- fake timers(`setSystemTime`)는 쓰지 않았다 — 파일의 `waitFor` 가 `setTimeout` 으로 돌기 때문에 타이머까지 멈춘다.

### 검증
| 항목 | 결과 |
|---|---|
| `npm run test:ui -- --runInBand` | **58 suites / 521 tests 전부 통과** |
| `npm run build:ui` | 성공(Compiled with warnings — 기존 Atlaskit source map·postcss-calc 경고) |

### 대기 중(백엔드 보고서 2회차 이후)
`getWorklogHandoff.issueKey` 가 추가되면 넘김 화면의 이슈 링크를, 표본 이슈 키 입력이 허용되면 진단·표본 이슈 입력의 키 입력을 연결한다(§9-2·§9-3). 지금은 연결하지 않았다.

---

## 3회차 (2026-10-11) — 백엔드 2회차(R2-1·R2-2) 연결

### 소비 변경
| 백엔드 | 프론트 |
|---|---|
| R2-1 `blockers.DELETE` 끝에 `'NOTIFICATIONS'`, `allowed.DELETE` 항상 false, 저장 거부 cause `{switch:'DELETE', gate:'NOTIFICATIONS', missing:['NOTIFICATIONS']}` | 1회차의 화면 상수 `DELETE_NOTIFICATIONS_READY` 를 **없앴다**. 이제 `deleteNotificationsBlocked(status)`(= `blockers.DELETE` 에 NOTIFICATIONS 가 있는가)로만 판단한다. 서버가 표식을 떼면 화면도 풀린다. 단계 표 D 행에서 NOTIFICATIONS 는 관문 목록에서 빼고 따로 "알림 준비 전 사용 불가" 사유(`worklogControl.reason.notificationsNotReady`)로 보인다. 나머지 관문은 그 뒤에 이어 보인다. 저장 거부 문장은 `missingText` 가 `worklogControl.missing.NOTIFICATIONS` 로 푼다. 다른 경로 처리의 DELETE 옵션과 안내 박스도 같은 판정을 쓴다 |
| R2-2 `getWorklogHandoff.issueKey: string\|null` | 넘김 화면에 "이슈 ABC-12" 링크(기존 `components/IssueLink` — `/browse/{key}`, bridge router 로 이동). `null` 이면 링크를 그리지 않는다. 수정 폼 제목에도 키를 넘긴다(`worklog.dialog.editTitle · ABC-12`) |
| R2-2 진단 `issueId`·`closedIssueId`, 저장 `worklogControl.sampleIssueId` 에 이슈 키 허용 | 입력 검증 `isIssueId`(숫자 전용) → **`isIssueRef`**(숫자 1~18자리 또는 `^[A-Za-z][A-Za-z0-9_]*-\d+$`). 값은 trim 만 하고 그대로 보낸다(대소문자는 서버가 무관하게 처리). 못 바꾸면 진단은 `INVALID_TARGET`(문장도 "키나 숫자 ID 확인"으로 바꿈), 표본은 `verified:false` → 1회차의 "확인 실패" 안내가 그대로 뜬다 |

### i18n (kr/en 동시)
- 추가: `worklogControl.missing.NOTIFICATIONS`, `worklog.handoff.issue`
- 문구 변경: `worklogControl.reason.notificationsNotReady`(서버가 저장을 거부한다는 말 추가), `worklogControl.gate.{issueId,closedIssueId,issueHint}`, `worklogControl.startField.sampleIssue`, `worklogControl.invalid.issueId` — 숫자 ID 전용 → "키 또는 숫자 ID"
- `npm run merge` 성공, 변경 파일 리터럴·열거 키 kr/en 전부 존재(스크립트 확인)

### 테스트
- `worklogControlModel.test.js`: D 행이 NOTIFICATIONS 를 따로 사유로 뽑고 남은 관문만 blockers 로, 서버가 표식을 떼면 allowed(화면 상수로 막지 않음), `isIssueRef` 허용·거부 표, `missingText(['NOTIFICATIONS'])`.
- `WorklogControlSettings.test.jsx`: 상태 고정값을 서버 2회차 모양(`blockers.DELETE:['NOTIFICATIONS']`, `allowed.DELETE:false`)으로. 진단 입력 `ABC` 비활성 → `ABC-12` 실행(payload 그대로), 표본 `ABC-12` 저장 payload.
- `WorklogHandoffPage.test.jsx`: issueKey 링크 href `/browse/ABC-12`, 폼 제목에 키, `issueKey:null` 이면 링크(`<a>`) 없음.

### 검증
| 항목 | 결과 |
|---|---|
| `npm run test:ui -- --runInBand` | **58 suites / 522 tests 전부 통과** |
| `npm run build:ui` | 성공(Compiled with warnings — 기존 Atlaskit source map·postcss-calc 경고) |

### 변경 파일
`static/ui/src/features/worklogControl/{worklogControlModel.js, WorklogControlSettings.jsx, GateDiagnostics.jsx}`, `static/ui/src/features/worklog/WorklogHandoffPage.jsx`, 테스트 3개, `locales/{kr,en}/{worklogControl,worklog}.json`. `src/` 무수정.

### 1회차 §9 백엔드 요청 상태
1·2·3 모두 백엔드 2회차에서 반영됐고, 위와 같이 연결했다.

---

## 4회차 (2026-10-11) — 다른 경로 입력 FLAG 는 인증을 막지 않고 경고만(리더 결정, 통합 검증 1번)

### 문구 수정(kr/en — "인증에서 빠진다" 약속 제거)
| 키 | 바뀐 뜻 |
|---|---|
| `worklogControl.phase.desc.A` | "다른 경로 입력을 표시해 인증에서 뺍니다" → "표시합니다. 표시된 기록도 인증할 수 있고, 팀장이 인증할 때 경고로 보입니다" |
| `worklogControl.foreign.description` | "표시된 기록은 인증에서 빠집니다" → "인증할 수 있으며 팀장 인증 때 '다른 경로 입력' 경고로 보입니다. 워크포스 출처 증명 전에는 정상 입력도 표시될 수 있습니다" |
| `worklogControl.foreign.action.FLAG` | "표시만(인증 제외)" → "표시만 — 인증 때 경고" |
| `worklog.foreign.hint`(탭 배지 툴팁) | "인증에서 빠집니다" → "인증은 막지 않고, 팀장이 인증할 때 경고로 보입니다" |
테스트가 kr/en 의 `worklogControl.json`·`worklog.json` 에 "인증에서 빠/인증 제외/인증에서 뺍/excluded from certification" 이 없는지 확인한다.

### 인증 화면 "다른 경로 입력" 신호
- `features/worklogCert/certFormat.js` `SIGNALS` 에 `FOREIGN_ORIGIN` 추가. `SignalBadges` 는 코드별로 그리지만 `SIGNALS` 밖 코드는 원문 그대로 떨어지므로, 목록에 넣어야 번역된다. `WorklogSummaryTable` 은 `SignalBadges` 를 쓰므로 따로 고칠 것이 없다. 신호 필터('signals')에도 걸린다.
- 번역: `worklogCert.signal.FOREIGN_ORIGIN`(다른 경로 입력 / Other-path entry), `worklogCert.signalHint.FOREIGN_ORIGIN`(경로 설명 + "출처 증명 전에는 정상 입력도 표시될 수 있으니 확인 후 인증").
- 배지 색은 다른 경고 신호와 같은 `moved`. 인증 버튼 활성은 지금처럼 서버 `certifiable` 만 따른다(신호가 막지 않음).
- **백엔드 3회차 미확인**: 이 시점에 `02_backend_report.md` 에 3회차가 없고 `src/` 에도 `FOREIGN_ORIGIN` 이 없다. 그래서 키·배지만 넣고 목 데이터로 시험했다. 서버가 `summary.signals` 에 `'FOREIGN_ORIGIN'` 을 실으면 추가 연결 없이 표시된다. 다른 이름이나 다른 위치(예: 별도 필드)로 오면 맞춰야 한다 — 검증자 확인 지점.

### 테스트
신규 `features/worklogCert/__test__/foreignOriginSignal.test.jsx`(3): 신호 목록·라벨·툴팁 키 + kr/en 존재, 배지 렌더(목 summary)·신호 필터·certifiable 유지, 통제 문구 금지어.

### 검증
| 항목 | 결과 |
|---|---|
| `npm run merge` | 성공 |
| `npm run test:ui -- --runInBand` | **59 suites / 525 tests 전부 통과** |
| `npm run build:ui` | 성공(Compiled with warnings — 기존 경고) |

### 변경 파일
`static/ui/src/features/worklogCert/certFormat.js`, 신규 테스트 1개, `locales/{kr,en}/{worklogControl,worklog,worklogCert}.json`. `src/` 무수정.

---

## 5회차 (2026-10-11) — 백엔드 4회차(R4-2·연동 안내) 연결

> 시작 전 현재 트리를 다시 읽었다. 이전 회차 작업은 `01e7441` 로 커밋됐고, 그 위에 audit-retention-sync 등 다른 에이전트의 미커밋 변경(`worklogControlModel.js`·`ForeignWorklogList.jsx`·`ReasonModal.jsx`·`WorklogTab.jsx` 등)이 있다. 그 변경은 그대로 두고 그 위에 더했다.

### 능력 신호 다시 읽기 — `refreshWorkforceCapabilities`
- 신규 `features/worklogControl/CapabilityRefresh.jsx` — 설정 > 워크로그 통제 > **다른 경로 입력 처리(삭제 모드 D) 영역** 맨 아래.
  - 대상: [사용자 선택](기존 `settings/UserPickerDialog` 재사용, 여러 명 누적·중복 제거) 또는 [프로젝트](숫자 프로젝트 ID).
  - 입력: `capabilityPayloadOf` → `{accountIds}`(1~50명) 또는 `{projectId}`. 그 밖이면 버튼 비활성, 51명 이상이면 경고(서버도 `INVALID_TARGET`).
  - 결과: 요약 "확인 {checked}명 · 출처 증명 가능 {capable}명", 사이트 판정 배지(`workforceOriginCapable`), 사람별 줄(이름 — 선택한 사용자 이름 또는 accountId, 가능/불가, 결과 코드 `OK`·`ABSENT`·`UNREADABLE` 번역, 그 밖 검증 코드는 "검증 실패(코드)"). `UNREADABLE` 이 있으면 "Jira 관리자로 다시 실행, 기존 값 유지" 안내.
  - 성공·실패 모두 끝나면 `worklogControlKeys.all` 무효화 → 상태(`blockers.DELETE` 의 `WF_WLORIGIN`) 다시 받음.
  - 에러는 `controlErrorText`(`INVALID_TARGET`·`STORAGE_NOT_READY` 등 code 분기).
- 모델 가산: `CAPABILITY_MAX_USERS=50`, `capabilityPayloadOf`, `capabilityResultKey`.

### 연동 안내 문구
`worklogControl.guide.linkScope` — "프로젝트 단위 연동은 워크포스가 필터 없는 전체 스페이스 구독에만 겁니다. 그 밖에는 이슈를 열거나 워크로그가 바뀔 때 이슈 단위로 반영됩니다(같은 이슈는 1시간 간격)." 다른 경로 입력 처리 설명 아래와 설정 가이드(펼침)에 둘 다 보인다.

### i18n (kr/en)
`worklogControl.guide.linkScope`, `worklogControl.capability.{title, description, modeLabel, mode.{users,project}, pickUsers, projectId, run, tooMany, summary, siteCapable, siteNotCapable, capable, notCapable, result.{OK,ABSENT,UNREADABLE,other}, unreadableHint}`. `npm run merge` 성공, 리터럴 키 kr/en 전부 존재.

### 테스트
- `worklogControlModel.test.js` +2: 입력(중복 제거·0명·51명·50명·숫자 프로젝트·키 거부), 결과 코드 키.
- `WorklogControlSettings.test.jsx` +2(사용자 선택 모달은 목): 안내 문구 표시, 사용자 선택 → `{accountIds:['u1','u2']}`, 결과 줄 OK/UNREADABLE·사이트 판정·안내, 끝난 뒤 상태 재조회 / 프로젝트 모드 `ABC` 비활성 → `{projectId:'10000'}`, `STORAGE_NOT_READY` 문장.

### 검증
| 항목 | 결과 |
|---|---|
| `npm run test:ui -- --runInBand` | **60 suites / 553 tests 전부 통과**(다른 에이전트 미커밋 변경 포함 트리) |
| `npm run build:ui` | 성공(Compiled with warnings — 기존 경고) |

### 변경 파일
신규 `static/ui/src/features/worklogControl/CapabilityRefresh.jsx`. 변경: `worklogControlModel.js`(끝에 가산), `WorklogControlSettings.jsx`(import·안내 2곳·컴포넌트 배치), 테스트 2개, `locales/{kr,en}/worklogControl.json`. `src/` 무수정, 커밋 없음.

### 확인 필요(실측 — 백엔드 4회차 미검증과 같음)
- 관리자 asUser 로 남의 사용자 프로퍼티를 읽을 수 있는지 → 화면에서 `UNREADABLE` 비율로 바로 보인다.
- `user/assignable/search?project=` 가 숫자 프로젝트 id 를 받는지 → 프로젝트 모드 실행 결과(checked=0 이면 의심).
