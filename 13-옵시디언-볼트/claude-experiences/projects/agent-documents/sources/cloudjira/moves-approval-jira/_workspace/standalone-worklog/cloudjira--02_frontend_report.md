# 02 frontend report — standalone-worklog (화면)

> 2026-10-21 · 1회차 · frontend-engineer. 커밋·forge·docs 손대지 않음. 백엔드 shape 은 `02_backend_report.md` 2회차 기준.

## 소비하는 resolver·접근 경로

| resolver | 화면 | 읽는 값 |
|---|---|---|
| `getWorklogApprovalIdentity` (SELF) | `WorklogApprovalModeContext` (워크로그 승인 설정·결재 구성 상단) | `status`(VERIFIED·NONE… / **ROSTER** / **ROSTER_UNAVAILABLE**), `team.displayName`, `leaders[]`, `selfApprovalAllowed` — **이제 두 모드 모두 조회**(정책을 알면 항상) |
| `getFeatureOverview` ({admin:true}) | `WorklogApprovalModeContext` → `TeamRosterWarning` (워크로그 승인 설정에서만, 단독 문구일 때만) | `teams.enabledCount === 0` 이면 경고, null·오류면 표시 안 함 |
| `listWorklogApprovalCandidates` | 새 `WorklogApproverPrompt` (저장 다이얼로그) | `users[]`, `defaultApproverIds` |
| `requestWorklogApproval` | 새 `WorklogApproverPrompt` | 요청 `{issueId, worklogId, approverId, reason?}` (작업 로그 상세 요청과 같은 경로) |
| `createWorklog` / `updateWorklog` | `WorklogDialog` | `approval.status === 'NEEDS_APPROVER'` + `worklog.worklogId` → 그 자리에서 승인자 선택 |

## 모드 판정 (요구 5)

- 서버: `ChannelState.isLinked()` (스위치 ∧ 채널 PAIRED) false = 단독 — 연결 대기 포함(백엔드 보고서 판정표).
- 화면: `operatingModeModel.worklogModeKeyOf(policy, identityStatus)` 신설.
  1. identity 응답이 있으면 그것이 서버 판정: `ROSTER`·`ROSTER_UNAVAILABLE` → 단독, 그 밖 → 연동.
  2. 없으면 정책: `LINKED` → 연동, `STANDALONE`·`LINKED_PENDING` → 단독.
  3. 둘 다 모르면(linkActive null) 관리자가 고른 쪽.
- 연결 대기: 단독 문구 + 기존 "연결 필요" 배지·경고(배지 규칙은 그대로).
- `WorklogApprovalSettings` 의 정책 폼 문구·제공자 안내 펼침은 정책만으로 판정(identity 없이) — 연결 대기는 단독.

## 요구별 처리

1. 팀 0개 경고: `TeamRosterWarning` — 제목 `policy.features.timesheet.teamsCount`(count 0), 본문 `worklogApprovalFlow.settings.noTeams`(신설), 링크 `policy.features.link.teams` → `onNavigate('timesheet','teams')`. "사용할 기능" 첫 화면(FeatureSelectionSettings)과 타임시트 > 정책 탭 모두 `WorklogApprovalSettings` 를 쓴다. 타임시트 탭에도 `onNavigate` 를 넘기고, 같은 항목 안 이동이면 `TimesheetSettings` 가 `initialTab` 변경을 따라 탭을 바꾸게 함(useEffect).
2. 내 팀·기본 승인자: 단독은 `identity.standalone.*` 문구(제목 "내 팀·기본 승인자", 행 라벨 "기본 승인자", "팀 명부의 팀장"). `ROSTER` 도 팀·팀장 표시 대상. 위 단계 팀장 없음 + 자기 승인 허용이면 기본 승인자 칸에 `selfDefault`("본인"). `ROSTER_UNAVAILABLE` → `identity.rosterUnavailable` 경고.
3. 팀 탭 문구 `timesheet.settings.team.hint`·`deleteHint`(파일 내 실제 경로) — 워크로그 기본 승인자 의미, 다단계는 "그 팀장을 상위 팀의 구성원으로 추가".
4. `setupShared` 정정: "건별 워크로그 승인은 팀 명부(기본 승인자)와 결재자 명부(승인자 후보)만 씁니다. 결재선·결재 그룹은 다른 승인 기능에서." 근거: `WorklogRequestService.candidates` 가 `registry`(결재자 명부)를 후보에 넣고, 요청은 `skipRegistry:true`(명부 밖도 허용). 즉 결재자 명부는 **후보 제안용**이지 제한이 아니다 — 문구도 "승인자 후보"로 썼다.
6. 시간 추적 제공자 안내 `<details open>` (단독일 때), `error.WORKLOG_ORIGIN_UNPROVEN` 에 "Jira 기본 Log work·REST·자동화 기록은 대상 아님, 이 앱의 작업 로그 탭에서 다시 입력" 추가.
7. `WorklogDialog`: 저장 응답 `NEEDS_APPROVER` + worklogId 가 있으면 배너 `saved.NEEDS_APPROVER_INLINE`(신설) + `WorklogApproverPrompt`(승인자 Select — `selectMenuInModal`, 선택 사유). 요청 성공 시 배너는 `saved.PENDING`, 관련 키 무효화(worklogCertification·worklog·history·approval·inbox·timesheet). 실패는 `error.<code>`.
8. 글꼴·제목: 새 화면은 SettingsSection·SectionMessage·Text 본문 크기만, 굵은 글씨 추가 없음, 모달 Select 는 헬퍼.

추가: 팀 저장·삭제 후 `settingsKeys.worklogApprovalIdentity()`·`featureOverview()` 도 무효화(`TimesheetTeamSettings`).

## 추가 i18n 키 (kr·en 동시)

- `worklogApprovalFlow.settings.noTeams`
- `worklogApprovalFlow.settings.identity.rosterUnavailable`
- `worklogApprovalFlow.settings.identity.standalone.{title,description,leaders,loading,unavailable,noneTeam,none,selfDefault,selfAllowed,selfDenied}`
- `worklogApprovalFlow.saved.NEEDS_APPROVER_INLINE`
- 수정: `worklogApprovalFlow.settings.mode.standalone.setupShared`, `timesheet.settings.team.hint`·`deleteHint`, `error.WORKLOG_ORIGIN_UNPROVEN`

## 바뀐 파일

- `static/ui/src/features/settings/WorklogApprovalModeContext.jsx` (재작성)
- `static/ui/src/features/settings/operatingModeModel.js` (`worklogModeKeyOf`)
- `static/ui/src/features/settings/WorklogApprovalSettings.jsx`
- `static/ui/src/features/settings/TimesheetSettings.jsx`
- `static/ui/src/features/settings/TimesheetTeamSettings.jsx`
- `static/ui/src/features/worklog/WorklogDialog.jsx`
- `static/ui/src/features/worklog/WorklogApproverPrompt.jsx` (신규)
- 테스트: `features/settings/__test__/{LinkPending,ApprovalSetupSettings}.test.jsx`, `features/settings/__test__/operatingModeModel.test.js`, `features/worklog/__test__/{WorklogApprovalFlow,WorklogDialog}.test.jsx`, `components/form/__test__/selectMenuInModal.test.jsx`
- `locales/{kr,en}/{worklogApprovalFlow,timesheet,error}.json`

의도적으로 바꾼 기존 테스트 3건: "단독·연결 대기에서는 identity 를 묻지 않는다" → D2·D3 로 이제 묻고 팀 명부 기준으로 표시한다.

## 결과

- 루트 `npm run merge`: ko-KR.json·en-US.json 생성(두 언어 키 집합 일치)
- `npx jest` (static/ui): Test Suites 99 passed, **Tests 962 passed** (직전 954 + 8)
- `npm run build` (static/ui): Compiled with warnings(기존 sourcemap 경고만), build folder ready

## 백엔드 요청 / 보류

- 없음(필요한 값은 기존 응답에 다 있음). "기본 승인자 미정 기록 수" 경고는 백엔드 보류에 따라 만들지 않음.
- identity 의 `leaders` 에서 표시 정보를 못 읽은 팀장이 빠지면 화면엔 "기본 승인자 없음"으로 보인다(백엔드 미검증 항목과 같음).

## dev 에서 볼 화면(미검증)

1. 설정 > 사용할 기능(워크로그 승인) — 단독: "Approval 단독 모드" + 내 팀·기본 승인자, 팀 0개면 경고와 "팀 명부" 링크(타임시트 > 팀 탭으로 이동), 입력 창구 안내 펼쳐짐.
2. 같은 화면 — 연동 스위치 켬 + 미페어링: "연결 필요" 배지 + 단독 문구 + 팀 명부 기준 내 팀.
3. 설정 > 결재 구성 상단 — 단독 안내 문구 정정 확인.
4. 설정 > 타임시트 > 팀 — 안내·삭제 확인 문구.
5. 작업 로그 기록 모달 — 팀장 없는 사용자로 저장 → 승인자 선택 → 요청 → "승인 대기 중" 으로 바뀌는지, 드롭다운이 버튼 줄 위로 뜨는지.
6. Jira 기본 Log work 기록의 승인 요청 → 출처 미증명 안내 문구.
