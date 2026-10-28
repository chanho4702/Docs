# ui-polish 2026-10-21 — 프론트 보고서

요청: "폰트랑 볼드 처리 구림 + 모달 드롭다운이 안으로 먹힘". 백엔드·resolver·i18n 키·manifest·엔트리 변경 없음(프론트 표시만). testId·동작·쿼리키 무변경.

## A. 바닥 글꼴 (app/base.css — mount 공통)
- `body` font = `var(--ds-font-body, normal 400 14px/20px <Jira 글꼴 스택>)`, color = `--ds-text`, 글꼴 smoothing.
- `button/input/select/textarea/optgroup` font·color inherit, `h1~h6` font-family inherit.
- `summary` 공용 모양(링크색·pointer·fit-content·hover·focus-visible) — 화면별 inline style 제거.
- body margin 0 유지(iframe-resizer 함정). 배경은 칠하지 않음(이슈 패널 surface / Forge 모달 overlay 가 비쳐야 다크 모드 일치) — 요청의 "bg 토큰"은 의도적으로 보류.
- `@atlaskit/css-reset` 은 쓰지 않음(h·ol 여백까지 바꿔 전 화면이 흔들림).

## B. 타이포 정리
- Forge 모달 본문 제목 `Heading medium` → `small`: ApprovalDetail, DecisionForm, RequestForm, FieldChangeRequestForm, WorklogDetailModal, WorklogDialog, entries/modal.jsx (TransitionRequestForm 은 이미 small). as(h1/h2) 의미는 유지. 계약 테스트로 고정.
- 이슈 사이드바 상태 변경 승인 카드: PageSection `level="sub"`(Heading xsmall 14px) + `headingAs="h2"`(PageSection 에 선택 prop 추가, 기존 테스트의 h2 유지).
- `Text weight="medium"` 정리: CertifyBar 확인 제목·WorklogHistoryPanel 머리 → 새 `components/typography/MinorHeading`(= Heading xsmall 값, primitives 무의존 — 부분 모의 테스트 호환), GateDiagnostics legend → SectionLabel. 유지: TimesheetSummary 합계(핵심 값), IssueExceptionList 이슈 키(행 식별자).
- 하드코딩 px: DecisionStamp(12/600 → typeScale.bodySmall/semibold), ApprovalStepper(14 → typeScale.body), settingsNavigation 배지(대체값 없는 token → typeScale), appShell.css 토글 22px → heading-medium 토큰(굵기 400)·툴팁 10px → body-small, PersonAvatar 이니셜 최소 11px(16px xsmall 원만 9px 예외 — 11px 두 글자가 원을 넘음).
- FieldChangeRuleSettings: `Heading medium` 페이지 제목 → SettingsSection(형제 TransitionRuleSettings 와 동일), testId 유지.
- 문장인데 small 이던 것 → 본문: WorklogPolicyPanel 잠금 안내(tightenOnly/noOverride), CertificationAuditTab 내보내기 제외 안내. 나머지 small 은 라벨·날짜·건수(메타)라 유지. SMALL_TEXT_CAP 135 → 133.
- LicenseGuidePage: 생 h3/ol → MinorHeading + 토큰 여백 ol, 가운데 464px 폭.
- typeScale 역할표에 MinorHeading·사이드바 카드·Forge 모달 제목 행 추가, `headingXsmall` 값 추가.
- CertificateSheet 는 건드리지 않음.

## C. 모달 안 드롭다운
공용 헬퍼 `static/ui/src/components/form/selectMenuInModal.js`:
`{ menuPortalTarget: document.body, menuPosition: 'fixed', menuPlacement: 'auto', styles.menuPortal.zIndex = 511 }`(Atlaskit modal 층 510 위, 호출부 styles 보존).
적용(모든 `<Select`): TransitionRuleFormModal(5), FieldChangeRuleFormModal(3), FlowFormModal(1), ApprovalLineEditor(2), GroupFormModal(1), TeamFormModal(1), RequestForm(2 — CcPicker 포함, Transition/FieldChange 요청 폼도 CcPicker 재사용), TransitionRequestForm(1), FieldChangeValueInput(2), WorklogApprovalPanel(1).
- react-select menu-placer 는 fixed 일 때 `window.innerHeight` 기준으로 위/아래 뒤집기·높이 축소를 한다 → Forge iframe 바닥·sticky 버튼 줄 위로 뜸.
- **DatePicker/TimePicker/DateTimePicker 에는 적용하지 않음**: 두 피커는 Menu 를 자체 FixedLayer(Popper v1, flip 포함, zIndex 300)로 그려 menuPortalTarget 을 주면 MenuPortal 과 Popper 가 이중 배치된다(node_modules 코드 확인). zIndex 300 이라 sticky 버튼 줄(1) 위에는 이미 뜬다.
- ApproverSearchDialog: Select 없음(Textfield + 표) — 조치 불필요.
- 테스트: `components/form/__test__/selectMenuInModal.test.jsx`(헬퍼 props·styles 병합·10개 파일의 모든 `<Select` 적용 계약). 실제 Atlaskit Select 렌더는 jsdom 에서 compiled primitives 오류라 생략.

## 변경 파일 (static/ui/src)
app/base.css, app/appShell.css, components/form/selectMenuInModal.js(신규), components/form/__test__/selectMenuInModal.test.jsx(신규), components/typography/MinorHeading.jsx(신규), components/typography/typeScale.js, components/layout/PageSection.jsx, components/settings/SettingsPageIntro.jsx, components/DecisionStamp.jsx, components/PersonAvatar.jsx, __test__/typographyRules.contract.test.js, entries/modal.jsx, features/approval/ModalLayout.jsx(주석), features/audit/CertificationAuditTab.jsx, features/detail/{ApprovalDetail,ApprovalStepper,DecisionForm}.jsx, features/fieldChange/{FieldChangeRequestForm,FieldChangeRuleFormModal,FieldChangeRuleSettings,FieldChangeValueInput}.jsx, features/license/LicenseGuidePage.jsx, features/request/{ApprovalLineEditor,RequestForm}.jsx, features/settings/{FlowFormModal,GroupFormModal,TeamFormModal,TimesheetPolicySettings}.jsx, features/settings/settingsNavigation.js, features/transition/{StatusChangeApprovalCard,TransitionRequestForm,TransitionRuleFormModal}.jsx, features/worklog/{WorklogApprovalPanel,WorklogDetailModal,WorklogDialog}.jsx, features/worklogCert/CertifyBar.jsx, features/worklogControl/{GateDiagnostics,WorklogControlSettings}.jsx, features/worklogHistory/WorklogHistoryPanel.jsx, features/worklogPolicy/{WorklogPolicyPanel,WorklogPolicySummary}.jsx
(TransitionRuleFormModal.jsx 에는 사용자의 미커밋 변경이 있었고 Select props 한 줄씩만 더함.)

## 검증
- `npm run merge`: ko-KR.json·en-US.json 생성(키 추가 없음)
- `npx jest`(static/ui): Test Suites 99 passed, Tests 954 passed (기존 940 + 신규 14)
- `npm run build`: Compiled with warnings(기존 sourcemap·react-select CSS 경고만), build folder ready
- 줄 끝 CRLF 유지 확인

## 시각 확인 못 함(배포 후 dev 사이트 확인 필요)
1. Atlaskit 모달 안 Select 메뉴가 모달 위로 뜨고 클릭·검색·키보드가 되는지(포커스 잠금과 portal 상호작용) — 팀 편집(본문 맨 아래 2단계 그룹), 결재선 편집(프로젝트·결재자·필수 인원), 승인 그룹 편집, 상태 변경/필드 변경 규칙 편집.
2. Forge 모달(main/modal) 승인 요청·상태 변경 요청·필드 변경 요청: 참조자(CC)·결재선 Select 가 버튼 줄에 덮이지 않고, 아래 공간이 없으면 위로 열리는지. 내용이 짧아 iframe 이 낮으면 메뉴 높이가 줄어드는 것은 정상.
3. 워크로그 모달(main/worklog) 날짜·시간 피커 달력: 헬퍼 미적용(Popper 자체 뒤집기). iframe 이 달력보다 낮으면 여전히 잘릴 수 있음 — 남으면 보고 바람(다음 대응: 피커 열림 동안 본문 최소 높이 확보).
4. 바닥 글꼴: 라이선스 안내, 접힘 머리(설정 각 "자세히"·고급 설정·워크포스 팀 인원수·워크로그 이력), 다크 모드 글자색.
5. 이슈 사이드바 상태 변경 승인 카드 제목 크기가 Jira 사이드바 섹션 제목과 맞는지.
6. 승인 상세의 결재 도장·단계 원 숫자, 설정 메뉴 배지·접힌 메뉴 툴팁(12px 로 커짐 — 48px 폭에서 줄바꿈 늘 수 있음).
