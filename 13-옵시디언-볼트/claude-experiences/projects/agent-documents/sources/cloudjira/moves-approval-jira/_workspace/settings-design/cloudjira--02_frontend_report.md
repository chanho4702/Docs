# 02 프론트 보고서 — 설정 화면 디자인 정리

작성: 2026-10-12 frontend-engineer · 회차 1 · operating-mode 와 같은 회차(WorkforceLinkSettings·WorklogControlSettings·AuditPage·RecordRetentionSection 은 두 설계를 한 번에 반영)
원칙 준수: 동작·resolver 호출·쿼리키·testId 무변경(보이는 모양만), 색·간격·테두리는 Atlaskit 토큰, 새 lazy 청크·엔트리 없음.

## 공용 컴포넌트 (신규 `static/ui/src/components/settings/`)
| 파일 | 내용 |
|---|---|
| `SettingsSection.jsx` | `<section class="settings-section">` 카드 — `border color.border` · `radius.medium` · `padding space.250`(sub 는 `space.200`) · 배경 `elevation.surface`(sub 는 `color.background.neutral.subtle`). 머리줄: 제목(문자열이면 Heading small/xsmall, 노드면 그대로)+설명 한 줄(Text small subtle) / 오른쪽 `actions`. 본문 Stack `space.200`. `testId` 는 카드에, `className` 추가 가능 |
| `SettingsRows.jsx` | 키/값 그리드(`.settings-rows`), falsy 행 건너뜀, `testId` 는 값 칸 |
| `SettingsPageIntro.jsx` | 한 줄 설명(Text subtle) + 선택 `<details>`("자세히" 기본 `common.action.moreInfo`). 내용 없으면 null |
| `app/appShell.css` (추가) | `.settings-rows`(그리드 `minmax(140px,200px) 1fr`), `.settings-form{max-width:720px}`, ≤760px 에서 섹션 패딩 12px·행 1열 |

토큰 이름 주의: 설치된 `@atlaskit/tokens@10.1.0` 에는 설계서의 `border.radius.200`/`border.radius.100` 이 없다(`radius.*` 체계). `radius.medium`·`radius.small`·`radius.full` 을 썼고, 기존 `RecordRetentionSection` 의 `border.radius.100`(존재하지 않는 토큰)도 `radius.medium` 으로 고쳤다.

## 페이지별 적용
| 페이지 | 적용 |
|---|---|
| `PolicySettings` | `Heading large`+`<p>` 제거 → `SettingsPageIntro(policy.hint)`. FormSection 3개 → `SettingsSection`(policy-section-deadline/notify/security). 숫자 `Textfield width="medium"`(독촉 일수는 기존 small). 폼 래퍼 `.settings-form`. 저장 성공/실패 메시지를 저장 버튼 아래로 |
| `IssueApprovalSettings` | `Heading large`+hint → `SettingsPageIntro(policy.issueApproval.hint)` + Tabs |
| `IssueApprovalPolicySettings` | `Heading medium` 제거, `SettingsSection(policy.issueApproval.policyTitle, .settings-form)` + `SettingsSection(policy.statusLabels)`, 메시지는 버튼 아래 |
| `FlowSettings` | Heading 제거 → Intro(`policy.flows.hint`) + 목록 카드(actions=추가). 미리보기는 `SettingsSection level=sub title=결재선 이름` |
| `GroupSettings` | Heading 제거 → Intro + 카드(actions=검색 `width=large`·추가) |
| `MemberListSettings`(승인자·설정 관리자) | Heading 제거 → Intro(`hintKey`, details=`hintMoreKey`+`noticeKey`). 카드(actions=추가, 설명=인원 수), 저장 메시지는 저장 버튼 아래. `titleKey` 는 표 `label` 로 |
| `ProjectSettings` | Heading 제거 → Intro(`project.hint`) + 카드(제목 자리=적용 범위 로젠지, actions=검색·검색 버튼) |
| `TimesheetSettings` 탭 | 정책 탭 간격 `space.400→300` |
| `TimesheetPolicySettings` | Heading medium 제거 → Intro(`timesheet.notice.acceptance`). WorklogPolicyPanel·Diagnostics 를 각각 카드로 감쌈. 폼 → `SettingsSection(timesheet.settings.title, .settings-form)`, 제한선·잠금·이력 묶음은 `level=sub` 카드, 메시지 버튼 아래 |
| `WorklogCertSettings` | Heading 제거 → Intro(description) + 폼 카드(.settings-form), 신호 기준 sub 카드, 메시지 버튼 아래 |
| `PeriodCloseSettings` | Heading small 제거 → Intro(hint) + 카드(설명 줄=자동 마감 정책) |
| `TimesheetTeamSettings` | Heading medium 제거 → Intro(hint) + 카드(actions=검색·추가) |
| `TimeTrackingProviderGuide` | `SettingsSection level=sub` — 라이선스 경고는 보이게, 설정 방법 4줄·강제 범위 안내는 `details`(기본 접힘) |
| `WorkforceLinkSettings` | 두 안내 → Intro(신규 한 줄 `workforce.notice.summary`, details=acceptance(`workforce-acceptance` 유지)+requirements). 토글+모드 로젠지 카드. 상태·게시(+재게시)·수신·실패 = `SettingsSection` 4개, `Row` → `SettingsRows` |
| `WorklogControlSettings` | Heading medium·Guide 제거 → Intro(description, details=guide 5줄, 라벨=`worklogControl.guide.title`). `Section`(border-top) → `SettingsSection` 9개(현황·단계·다른 경로·시작일·대상·관문·점검·목록). 하위 컴포넌트(ControlStatusPanel·GateDiagnostics·ReadinessTable·ForeignWorklogList)의 Heading·설명은 카드 머리줄로 올림. 단계 행: 사유가 3개 넘으면 `details` "켤 수 없는 사유 n개"(`wc-phase-X-reasons`). 현황 타일 radius 4px → `radius.small` |
| `AuditPage` | Heading large 제거 → Intro(`audit.hint`) + Tabs, RetentionNote 그대로 |
| `DataSettings` | 저장소 → `SettingsSection`(actions=새로 고침) + `SettingsRows`(사용량·집계 시각) + 표. 사용량 막대 높이·radius 토큰화. `RecordRetentionSection` → `SettingsSection` |
| `WorklogHistoryAuditSettings`·`AuditSettings` | 필터·검색·내보내기 줄을 `SettingsSection level=sub`(wlh-filters / sa-filters)로 감쌈. 비-embedded 용 Heading large 제거 |

## 추가·변경 i18n (kr/en 동시)
- 추가: `common.action.moreInfo`, `workforce.notice.summary`, `worklogControl.phase.reasonCount`, `data.storage.usageLabel`, `data.storage.generatedAtLabel`, `data.storage.hintMore`, `data.records.hintMore`, `approver.hintMore`, `manager.hintMore` (+ 운영 모드 키는 operating-mode 보고서)
- 문구 분할(2문장 이하로): `approver.hint`, `manager.hint`, `data.storage.hint`, `data.records.hint` — 잘라 낸 문장은 `*.hintMore` 로 옮겨 `details` 에 표시(정보 손실 없음).

## 설계와 다르게 한 점 (이유)
1. 토큰 이름 `border.radius.*` → `radius.*` (설치 버전에 없음, 위 참고).
2. `SettingsRows` 의 열 너비는 inline 이 아니라 `.settings-rows` CSS — 모바일 1열 전환을 `!important` 없이 하려고. 간격(gap)은 inline 토큰.
3. 탭 안 페이지는 `SettingsSection` 에 제목을 넣지 않은 곳이 있다(결재선·그룹·팀·기간 마감·프로젝트 목록) — 탭 라벨/AppShell 제목과 같은 말이 다시 나오는 중복을 피하려고. 머리줄은 actions 만.
4. 이슈 승인 정책의 "상태 표시명"(StatusFlow 그림) 카드는 720px 제한에서 뺐다(그림 폭 필요). 첫 카드만 `.settings-form`.
5. TimeTrackingProviderGuide 의 라이선스 만료 경고는 접지 않았다 — 기존 주석(Q23)이 "놓치면 사이트 전체가 시간 입력을 잃는다"며 따로 둔 경고라서.
6. 감사 탭 안의 탭별 안내(`policy.audit.hint`·`worklogHistory.audit.hint`)는 유지 — 탭마다 검색 대상이 달라 빼면 정보가 준다. 그래서 감사 화면은 "항상 보이는 안내" 가 Intro 1 + 탭 힌트 1 + 보관 안내 1 줄이다(모두 Text 한 줄, SectionMessage 아님).
7. 하위 컴포넌트 `WorklogPolicyPanel` 은 이슈·프로젝트 화면과 공용이라 안쪽(자체 Heading·안내)은 손대지 않고 카드로만 감쌌다.
8. `FormFooter align="start"` — 저장 버튼과 결과 메시지를 폼 아래 한 자리(왼쪽)에 모으려고.

## 테스트
- 신규 `components/settings/__test__/SettingsSection.test.jsx`(SettingsSection 2건: 제목·설명·actions·본문·testId·토큰 / sub·노드 제목·머리줄 없음, SettingsPageIntro 1건: 한 줄+details 기본 접힘+DOM 존재, 빈 입력 null), `SettingsRows.test.jsx`(행 수·falsy 건너뜀·testId 값 칸·토큰 gap).
- 기존 테스트 갱신(제목·목만): `IssueApprovalSettings.test.jsx` 의 `policy.issueApproval.title` 단언 → `policy.issueApproval.hint`; `PolicyFallback.test.jsx` 의 `@atlaskit/primitives` 목에 `Inline`·`Text` 추가; `WorkforceLinkSettings.test.jsx` 의 lozenge 목이 `testId` 를 넘기게. testId 기반 단언은 손대지 않음.

## 검증 결과
- `cd static/ui && CI=true npx jest` → **Test Suites 73 passed, Tests 614 passed**.
- `cd static/ui && CI=false npm run build` → 성공(`Compiled with warnings.` — 소스맵 누락 2건·`@atlaskit/react-select` postcss-calc 1건, 우리 코드 eslint 경고 0).
- 리포 루트 `npm run merge` → 성공(ko-KR.json·en-US.json 생성, git 미추적).
- `git diff | grep -c "^-.*testId="` → **32**. 전부 이동·재작성된 줄이다: 삭제 줄의 testId 32개 값을 추출해 현재 `static/ui/src` 전체에서 찾은 결과 **누락 0건**(예: WorkforceLinkSettings 의 `testId="workforce-crypto"` 가 `SettingsRows` 행 객체 `testId: 'workforce-crypto'` 로, PhaseTable 사유 줄이 `PhaseReasons` 로 이동). 이 수치에는 settings-restructure 의 미커밋 변경분도 섞여 있다.

## 자가 점검표 (설계서 §6)
| 항목 | 기준 | 결과 |
|---|---|---|
| 제목 중복 | AppShell 제목 아래 같은 뜻의 `Heading large` 없음 | 충족 — `features/settings`·`features/audit`·`features/worklogControl` 에서 `Heading size="large"` 0건(grep). 탭/섹션 Heading 은 카드 머리줄(small/xsmall)만 |
| 안내문 | 페이지당 항상 보이는 안내 ≤1, ≤2문장, 나머지 details | 대체로 충족 — 각 페이지 Intro 1줄. 3문장이던 approver/manager/storage/records 힌트는 2문장으로 나누고 나머지는 details. 예외: 감사 화면 탭 힌트·보관 안내 한 줄(위 6), 워크포스 단독 안내(SectionMessage, 모드 상태 고지), 조건부 상태 메시지(미구성 프로젝트·저장소 미준비 등)는 안내가 아니라 상태라 유지 |
| 섹션 | 모든 설정 페이지의 최상위 블록이 `SettingsSection` | 충족 — Intro 와 조건부 메시지·모달 외 최상위 블록은 전부 SettingsSection. 예외: 공용 `WorklogPolicyPanel` 은 카드로 감싸기만(위 7) |
| 폼 너비 | 숫자 입력 `width="medium"` 이하, 폼 래퍼 ≤720px | 충족 — 정책·이슈 승인 정책(첫 카드)·타임시트 정책·인증 폼에 `.settings-form`(720px). 숫자 Textfield 는 medium/small. 예외: 상태 표시명 그림 카드(위 4) |
| 토큰 | 하드코딩 색·px 없음(반응형 CSS 제외) | 새·고친 코드 충족(색은 전부 token, radius·막대 높이 토큰화, 메뉴 배지 font 토큰). 남은 px 는 이번에 손대지 않은 기존 Select 래퍼 `maxWidth`(240/320/360/420)·`width:220`·현황 그리드 `minmax(140px…)` — 레이아웃 폭이라 토큰 대상 아님 |
| testId | 기존 testId 전부 유지 | 충족 — 삭제 0건(위 검증: 32줄 이동, 누락 0) |

## 미검증 (실기기)
- 개발 사이트 iframe 에서 카드 테두리·배경이 라이트/다크 모두 자연스러운지(`elevation.surface` vs 상위 `.app-card` 배경 대비), sub 카드 중첩(타임시트 정책 폼 안) 위계가 읽히는지.
- 760px 이하(모바일·좁은 패널)에서 `SettingsRows` 1열 전환, 카드 머리줄 actions(검색 Textfield `width=large` + 버튼) 줄바꿈.
- `<details>` 열고 닫을 때 iframe 높이 재계산(자동 높이 iframe — 100vh 미사용이라 문제 없을 것으로 예상).
- `FormFooter align="start"` 로 저장 버튼이 왼쪽으로 옮겨진 것이 다른 폼(모달)과 어색하지 않은지.
