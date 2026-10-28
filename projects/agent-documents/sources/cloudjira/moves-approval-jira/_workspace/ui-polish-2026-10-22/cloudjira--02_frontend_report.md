# ui-polish 2026-10-22 — 프론트 보고서

요구: `00_input/requirement.md`(A 이슈 오른쪽 패널, B 활동 탭 Work log, C 설정). **프론트 전용** — 서버·resolver·manifest·SQL·쿼리키 변경 없음. 기존 testId 유지(새 testId만 추가), 동작 유지(아래 "동작 변화"에 적은 화면 배치 변경만).

## A. 이슈 오른쪽 패널(issueContext compact)

| 전 | 후 |
|---|---|
| 안내 문장 한 줄 + 폭 전체 "작업 시간 기록" 버튼(Stack 이 버튼을 늘림) | 안내(짧게, subtle) + 일반 크기 compact 버튼을 한 줄(`Inline spread`, 좁으면 줄바꿈). 문구 "승인 상태와 이력은 작업 로그 탭에서 봅니다." |
| 규칙 행: `→ 상태` [사용됨] [검사에서 자동으로 요청함] + primary "상태 변경 승인 요청" | 배지는 지금 알아야 할 쓸모 하나만(PENDING·USABLE·STALE·REJECTED). 요청 전·사용됨·닫힘(NONE·CONSUMED·CLOSED)은 생략. 요청 버튼 **default** compact. 자동 요청은 작은 보조 글씨(MetaText) |
| 밑에 "Jira 적용 상태: Jira 적용 확인" | compact 에서는 끝났거나 해당 없음(APPLIED·LEGACY_MANUAL·NOT_APPLICABLE·APPROVAL_REQUIRED)은 숨김, 대기·진행·실패·불명확·조건 미충족만 보조 글씨 |
| 최근 요청 한 줄(배지·→ 상태·자동 배지·날짜) + 아래 들여쓴 "상세"·"전체 보기" 두 줄 | 한 줄 footer: 왼쪽 "최근 요청 [상태 배지] 날짜", 오른쪽 subtle "상세"·"전체 보기". 목적 상태가 위 행과 같으면 "→ 상태" 생략. 행 구분선 제거(compact) |

- `TransitionTargetRow` 에 `compact` prop(기본 false — 모달의 `TransitionApprovalList` 는 그대로).
- 순수 판정 추가: `transitionModel.compactShowsUsability`, `transitionApplyModel.compactApplyKey`.
- 높이는 내용이 정함(100vh 없음), 로딩 중 자리 차지 없음은 유지.

## B. 활동 탭 Work log(`WorklogTab`)

| 전 | 후 |
|---|---|
| 오른쪽 "새로고침" 텍스트 subtle 버튼 | `IconButton`(refresh 아이콘, 라벨·툴팁 "새로고침", testId `worklog-refresh`), 오른쪽 끝 |
| "이 이슈의 기록 규칙: 미래 날짜 기록 허용 끔 [사이트 기본값] 하루 최대 기록 시간 720분 [사이트 기본값] …" | "기록 규칙: 미래 날짜 기록 안 됨 · 하루 최대 기록 시간 12시간 · 한 주 최대 기록 시간 52시간 [사이트 기본값]" — 출처가 모두 같으면 칩은 끝에 하나(섞이면 항목마다), 항목 사이 점은 CSS, 입력 가능 기간은 같은 줄 끝 |
| 그 밑 "설정: Jira 프로젝트 설정 › …", "…부터 변경 이력을 기록합니다. · 잠금은 …" 작은 글씨 두 줄 | 접힌 "기록 안내" 하나(details)에 설정 위치·이력 시작·잠금 반영 지연 |

- 시간 표시: `WorklogPolicySummary.readablePolicyValueText`(초 → 시간·분, 예 5400 → 1시간 30분). 규칙 줄과 기록 전 안내(WorklogPolicySummary)에만 쓴다. 설정 폼 옆 "지금 적용 값"(WorklogPolicyPanel)·이슈 예외 목록·스냅샷은 입력 단위(분)와 맞춰 `policyValueText` 유지.
- `WorklogRulesLine`: `linked` prop 제거(설정 위치는 `RulesWhere` 로 분리), `extra` prop(같은 줄 끝 보조), `ruleItemText`·`sharedSource` export.

## C. 설정(adminPage)

1. **반복 카드 제거** — 같은 `WorklogApprovalSettings` 가 "기본 승인 규칙"(features)과 "승인 기간 · 팀 > 정책" 두 화면에 통째로 나왔고, 결재 구성에도 모드 카드·결재자 구성 카드가 있었다.
   - 기본 승인 규칙(variant `rules`, 기본): 운영 모드 상세 카드 · 내 결재자 구성 · 승인 정책 폼("연동 이슈 승인 정책"/"단독 운영 승인 정책") · 입력 창구 안내 — **여기 한 곳**. "고급 설정" 접힘(세부 정책 폼 중복) → 링크 "단위·시간대·한도 같은 세부 정책은 승인 기간 · 팀에서"(`onNavigate('timesheet','policy')`).
   - 승인 기간 · 팀 > 정책(variant `period`): 한 줄 모드 표시 + 세부 정책 폼(TimesheetPolicySettings)을 펼쳐서.
   - 결재 구성: 한 줄 모드 표시(+ 단독이면 "결재선은 건별 승인에 안 씀" 안내). 결재자 구성 카드 없음. `SettingsPage` NAVIGATING 에 `approvalSetup` 추가(모드 줄의 "기본 승인 규칙에서 자세히" 링크).
   - 한 줄 모드 표시 = `WorklogApprovalModeContext compact` → `ModeStrip`("운영 모드 [배지] 모드 이름 · 기본 승인 규칙에서 자세히", testId `worklog-approval-mode-strip`). 연결 대기 경고는 기존대로 설정 맨 위 `LinkPendingNotice`.
2. **검색바·입력 폭**
   - 신규 공용 `components/settings/SettingsSearch`(+ `settingsSearch.css`): 입력+버튼을 한 덩어리로 묶어 버튼만 다음 줄로 떨어지지 않음, 입력 폭 상한 320px, Enter 제출. 적용: 적용 프로젝트(검색 버튼 default — primary 는 쓰지 않음), 결재 그룹·팀(즉시 거르기, 버튼 없음).
   - 기본 승인 규칙 "언제 승인 요청하나요?" 셀렉트 → `.settings-control`(max 360px), 마감 일수 Textfield `width="small"`.
   - 감사 필터: 날짜·사람·프로젝트를 같은 폭 격자 한 줄(`FilterGrid`, `audit.css` `.audit-filter-grid`), 종류·결과(인증 탭은 방식·결과)는 접히는 선택(`FilterChoices` — 닫히면 "종류 · 전체"/"2개 선택"). 결재·인증·설정 변경·워크로그 이력 탭 공통 격자.
3. **상태 변경 승인 페이지** — 소개 문장 밑 `[상태 변경 승인] 승인되면 이슈 상태가 바뀝니다.` 종류 표 제거(`ApprovalKindTable` 는 이제 미사용 — 파일은 남김).
4. **설정 관리자·결재자 명부(MemberListSettings 공용)** — 계정 id 원문 열 제거. 저장 버튼은 바꾼 게 있을 때만 카드 머리줄 오른쪽(+ "저장하지 않은 변경" 문구), 그때 추가 버튼은 default 로 낮춤.
5. **감사 표** — 행마다 늘어놓던 "같은 사람·같은 기간 보기 · 인증 · 워크로그 변경 · 설정 변경" → 접힘 버튼 하나 "관련 기록"(details, 링크 testId `…-links-<id>-<tab>` 유지). 결재 탭은 대상 칸 첫 줄(종류·이슈 키 옆)에. 시각 칸 → `AuditAtCell`(짧은 형식 "10. 21. 15:56", 다른 해는 연도, nowrap, 전체 형식은 title).
6. **전반** — 새 CSS 는 토큰 변수만(`var(--ds-…)`), 글자 크기 리터럴 없음. 한 줄 모드 띠(`.settings-mode-strip`)로 카드 한 겹을 줄임. 표 헤더 회색 등 Atlaskit 기본 계층은 건드리지 않음.

## 추가·변경 i18n 키 (kr·en 동시, `npm run merge` 완료)

| 키 | kr | en |
|---|---|---|
| `worklogApprovalFlow.issueHint`(변경) | 승인 상태와 이력은 작업 로그 탭에서 봅니다. | See approval status and history in the Work log tab. |
| `worklog.tab.rulesLabel`(변경) | 기록 규칙: | Logging rules: |
| `worklog.tab.notes` | 기록 안내 | About logging |
| `worklog.tab.futureBlocked` | 미래 날짜 기록 안 됨 | No future dates |
| `worklogPolicy.unit.hours` | 시간 | " h" |
| `worklogApprovalFlow.settings.mode.label` | 운영 모드 | Operating mode |
| `worklogApprovalFlow.settings.mode.details` | 기본 승인 규칙에서 자세히 | Details in Approval rules |
| `worklogApprovalFlow.settings.advancedLink` | 단위·시간대·한도 같은 세부 정책은 승인 기간 · 팀에서 | Units, time zone, limits and other details are in Periods and teams |
| `audit.filter.all` | 전체 | All |
| `audit.filter.selectedCount` | {count}개 선택 | {count} selected |
| `audit.link.related` | 관련 기록 | Related records |

`worklogApprovalFlow.settings.advanced` 는 메뉴 묶음 라벨로 계속 쓰여 남김.

## 바꾼 파일 (static/ui/src)

- 신규: `components/settings/SettingsSearch.jsx`, `components/settings/settingsSearch.css`, `features/audit/audit.css`
- 화면: `entries/issue.jsx`, `app/appShell.css`, `features/transition/{StatusChangeApprovalCard,TransitionTargetRow}.jsx`, `features/transition/{transitionModel,transitionApplyModel}.js`, `features/worklog/{WorklogTab.jsx,WorklogTab.css}`, `features/worklogPolicy/{WorklogRulesLine,WorklogPolicySummary}.jsx`, `features/worklogHistory/historyFormat.js`, `features/audit/{ActorCell,ApprovalAuditTab,AuditFilters,CertificationAuditTab}.jsx`, `features/settings/{ApprovalSetupSettings,AuditSettings,GroupSettings,IssueApprovalSettings,MemberListSettings,ProjectSettings,SettingsPage,TimesheetSettings,TimesheetTeamSettings,WorklogApprovalModeContext,WorklogApprovalSettings,WorklogHistoryAuditSettings}.jsx`
- 테스트 갱신: `features/transition/__test__/StatusChangeApprovalCard.test.jsx`(+3), `features/worklog/__test__/WorklogTab.test.jsx`(IconButton 모의, 시간 단위, 접힌 안내, +1), `features/worklog/__test__/WorklogApprovalFlow.test.jsx`(+2 variant), `features/worklogPolicy/WorklogPolicy.test.jsx`(시간 단위, +1), `features/settings/__test__/{ApprovalSetupSettings,IssueApprovalSettings}.test.jsx`(새 의도로 교체)
- 테스트 신규: `components/settings/__test__/SettingsSearch.test.jsx`, `features/settings/__test__/MemberListSettings.test.jsx`, `features/audit/__test__/auditLayout.test.jsx`
- 로케일: `locales/{kr,en}/{audit,worklog,worklogApprovalFlow,worklogPolicy}.json` (생성물 ko-KR·en-US 는 merge 가 갱신)

## 테스트가 묶여 있던 곳 — 의도대로 갱신한 것

- WorklogTab "정책 패널(details) 없음": `details` 0개 → "details 안에 select·input 없음"(읽기 전용 "기록 안내" 접힘 허용, 편집 UI 없음 의도 유지).
- 규칙 줄 textContent: 설정 위치가 줄에서 빠지고 "기록 안내"로 이동, 480분 → 8시간.
- 결재 구성 상단 결재자 구성 노출 테스트 2건 → "한 줄 모드 표시만, 결재자 구성 카드 없음, 자세히 → features".
- 상태 변경 승인 종류 표 테스트 → "종류 표 없음".

## 검증 결과

- `npm run merge`(루트): `locales\ko-KR.json 생성`, `locales\en-US.json 생성`
- `npx jest`(static/ui 전체): **Test Suites 103 passed, Tests 983 passed**(직전 954 + 이번 신규 포함, 실패 0). `typographyRules.contract.test` 통과(작은 Text 개수는 줄기만 함)
- `npm run build`(static/ui): Compiled with warnings(기존 react-select CSS 경고만), "The build folder is ready to be deployed."
- `npm run check:bundle`(루트): `[bundle-check] OK — exports: channelServer, onInstall, …, handler`

## 참고·남은 것

- 작업 중 `features/inbox/{InboxPage,InboxTable}.jsx`·`inboxUrl.js` 가 다른 작업으로 수정되어 있었다(이번 작업 아님, 손대지 않음). 위 테스트·빌드는 그 변경을 포함한 작업 트리 기준이다.
- 시각 확인(dev 배포)은 하지 않았다(무배포 지시). 확인 포인트: 이슈 사이드 패널 500px 에서 규칙 행·footer 한 줄 여부, Work log 규칙 줄 줄바꿈, 감사 필터 격자 1524px 에서 한 줄(날짜 2 + 사람 2 + 프로젝트 = 5칸 × 180px 이상), "관련 기록" 펼침 시 행 높이.
- "관련 기록"은 details 펼침이라 열면 그 행이 길어진다. 팝업(드롭다운)으로 바꾸려면 Atlaskit dropdown-menu 를 쓰면 되나, 링크가 닫힌 상태에서 DOM 에 없어 기존 테스트(링크 testId 클릭)를 고쳐야 한다 — 이번엔 보류.
- `features/approval/ApprovalKindTable.jsx` 는 이제 쓰는 곳이 없다(삭제 여부는 결정 필요).
