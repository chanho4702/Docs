# 설계 — 설정 화면 디자인 정리 (프론트 전용)

작성: 2026-10-12 리더. 사용자 원문: "너무 복잡해 보임. 디자인 개선 좀 해주셈 설정 부분". 요구서는 이 문서가 겸한다.
전제: settings-restructure(묶음·탭) 적용 트리. operating-mode(`_workspace/operating-mode/01_architect_design.md`) 와 **같은 회차**에 구현한다 — 같은 파일(WorkforceLinkSettings·WorklogControlSettings)을 두 번 고치지 않기 위해.

## 0. 원칙 (하나라도 어기면 되돌린다)
1. **동작·resolver 호출·쿼리키·testId 는 바꾸지 않는다.** 보이는 모양만 바꾼다. 기존 테스트가 testId·키 문자열로 찾으므로 그대로 둔다(제목 텍스트를 찾는 테스트만 갱신).
2. 색·간격·테두리는 **Atlaskit 토큰만**(`token('color.border')`, `space.*`, `color.background.neutral.subtle`…). 다크 모드가 공짜로 따라와야 한다.
3. 새 lazy 청크·엔트리 없음. 공용 컴포넌트는 가벼운 순수 프레젠테이션(react + primitives) 만.

## 1. 지금 복잡해 보이는 이유 (실측)
- **제목 3중**: AppShell `app-title`(메뉴 라벨) → 페이지 `Heading large`(예: "승인 정책") → 섹션 `Heading medium/small`. 탭 페이지는 탭 라벨까지 4중.
- **안내문 과다**: 페이지마다 `SectionMessage information` 1~2개가 3~4문장. WorkforceLinkSettings 는 상단에 2개 연속.
- **섹션 경계 제각각**: WorklogControl 은 상단 border 선, Workforce 는 Heading small + Stack, 정책 폼은 FormSection, 나머지는 Stack 간격만.
- **상태 행 포맷 제각각**: Workforce `Row`(label/value), WorklogControl Lozenge+Text 나열, 데이터 관리 테이블.
- **폼 너비**: 숫자 입력이 화면 너비 끝까지 늘어난다(`Textfield` 기본).

## 2. 공용 컴포넌트 (신규 `static/ui/src/components/settings/`)

### `SettingsSection.jsx`
```jsx
<SettingsSection title description actions testId level="section"|"sub">children</SettingsSection>
```
- 카드: `border: 1px solid token('color.border')`, `borderRadius: token('border.radius.200')`(없으면 6px), `padding: token('space.250')`, `background: token('elevation.surface')`. 섹션 사이 간격은 **호출부 Stack `space.300`** 으로 통일.
- 머리줄: 왼쪽 `Heading size="small"`(level sub 는 `xsmall`) + 오른쪽 `actions`(Inline). 아래 `description` 은 `Text size="small" color="color.text.subtle"` **한 줄**.
- 본문: `Stack space="space.200"`.
- `className="settings-section"` 을 붙여 `appShell.css` 에 모바일(≤760px) 패딩 축소 규칙만 둔다.

### `SettingsRows.jsx` — 상태·요약용 키/값 표
```jsx
<SettingsRows rows={[{ key, label, value, testId }]} />
```
- CSS grid `minmax(140px, 200px) 1fr`, 행 사이 `space.100`, 라벨 `Text color="color.text.subtle"`. 좁은 화면(≤760px)은 1열.
- WorkforceLinkSettings 의 `Row`, WorklogControlSettings 의 상태 나열, 데이터 관리 StorageSection 의 요약 줄에 적용.

### `SettingsPageIntro.jsx`
```jsx
<SettingsPageIntro description details={<…/>} detailsLabel />
```
- 페이지 맨 위 **한 줄 설명**(`Text color subtle`) + 선택적 `<details>` "자세히"(기존 WorklogControl `Guide` 패턴 재사용). **페이지 `Heading large` 를 대체한다** — 제목은 AppShell `app-title` 이 이미 보여 준다.

## 3. 페이지별 적용 (전수)

| 페이지 | 바꿀 것 |
|---|---|
| `PolicySettings` | `Heading large` 제거 → `SettingsPageIntro`(`policy.hint`). 세 `FormSection` 을 `SettingsSection`(title = `policy.section.*`) 로. 숫자 `Textfield` 는 `width="medium"`. 저장/성공/실패 메시지는 폼 아래 한 자리 |
| `IssueApprovalSettings` | `Heading large` 제거 → `SettingsPageIntro`(`policy.issueApproval.hint`) 바로 아래 Tabs |
| `IssueApprovalPolicySettings` | `Heading medium` 제거(탭 라벨이 제목). 전환 승인·필드 변경 대체 → `SettingsSection`(`policy.issueApproval.policyTitle`), 상태 표시명 → `SettingsSection`(`policy.statusLabels`) |
| `FlowSettings`·`GroupSettings`·`MemberListSettings`(승인자·관리자)·`ProjectSettings` | `Heading large` 제거(탭 안이거나 AppShell 제목과 중복). 힌트는 `SettingsPageIntro`. 도구줄(검색·추가 버튼)은 `SettingsSection` 의 `actions` 로 올리고 표는 본문. `MemberListSettings` 의 `noticeKey` 안내는 `details` 로 |
| `TimesheetSettings` 탭 내용 | `TimesheetPolicySettings`·`WorklogCertSettings`·`PeriodCloseSettings`·`TimesheetTeamSettings` 의 최상위 `Heading medium/small` → `SettingsSection` title. `TimeTrackingProviderGuide` 는 정책 탭 맨 아래 `SettingsSection(level sub)` 안에 `details` 로 접힘(기본 접힘) |
| `WorkforceLinkSettings` | 두 안내 → `SettingsPageIntro`(한 줄 `workforce.notice.acceptance` 첫 문장, details 에 나머지 + requirements). 토글 + 모드 로젠지 한 줄. 연동 상태·게시·수신·실패 = `SettingsSection` ×4(또는 운영 모드 설계대로 단독이면 접힘). `Row` → `SettingsRows` |
| `WorklogControlSettings` | `Section`(border-top) → `SettingsSection`. `Guide` details 는 `SettingsPageIntro.details` 로. 단계 표 각 행: 단계명+로젠지 한 줄, 설명 한 줄, 사유는 `details` "사유 n개" 로 접기(사유가 3개 넘을 때만) |
| `AuditPage` | `Heading large` 제거 → `SettingsPageIntro`(`audit.hint`) + Tabs. RetentionNote 는 탭 내용 위 한 줄 유지 |
| `DataSettings` | 저장소 요약(퍼센트·레벨) → `SettingsSection` + `SettingsRows`, 테이블은 그 안. `RecordRetentionSection` → `SettingsSection` |
| `WorklogHistoryAuditSettings`·`AuditSettings` | `embedded` 일 때 이미 제목 없음 — 필터 줄을 `SettingsSection(level sub)` 로 감싸기만 |

## 4. 공통 CSS (`appShell.css` 추가)
```css
.settings-section { }                       /* 토큰은 inline style, 클래스는 반응형만 */
@media (max-width: 760px) { .settings-section { padding: 12px !important; } .settings-rows { grid-template-columns: 1fr; } }
.settings-form { max-width: 720px; }        /* 정책·이슈 승인 정책·타임시트 정책 폼 래퍼 */
```

## 5. 테스트
- 신규 `components/settings/__test__/SettingsSection.test.jsx`(title·description·actions·children 렌더, testId 전달), `SettingsRows.test.jsx`(행 수·testId).
- 기존 테스트 중 제거한 `Heading large` 텍스트(`policy.title`·`policy.flows.title`·`audit.title` 등)를 찾는 단언만 갱신. testId 기반 단언은 손대지 않는다.

## 6. 보고서에 넣을 자가 점검표
| 항목 | 기준 |
|---|---|
| 제목 중복 | AppShell 제목 아래에 같은 뜻의 `Heading large` 가 없다 |
| 안내문 | 페이지당 항상 보이는 안내 ≤ 1개, ≤ 2문장. 나머지는 details |
| 섹션 | 모든 설정 페이지의 최상위 블록이 `SettingsSection` |
| 폼 너비 | 숫자 입력 `width="medium"` 이하, 폼 래퍼 ≤ 720px |
| 토큰 | 하드코딩 색·px(반응형 CSS 제외) 없음 |
| testId | 기존 testId 전부 유지(`git diff` 에서 `testId=` 삭제 0건) |
