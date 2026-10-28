# 설계 — 설정 화면 재구성 (프론트 전용)

작성: 2026-10-12 리더가 코드 실측 뒤 직접 작성(백엔드 변경 없음 → architect 단계 생략). 근거 코드:
`static/ui/src/features/settings/{SettingsPage,settingsNavigation,TimesheetSettings,PolicySettings}.jsx`,
`static/ui/src/app/AppShell.jsx`, `static/ui/src/features/inbox/InboxPage.jsx`, `static/ui/src/features/audit/AuditPage.jsx`(탭 선례).

## 1. 목표 메뉴 구조

| 묶음(label 키) | 항목 key | 라벨 키 | 내용 |
|---|---|---|---|
| `policy.settings.group.general` 일반 | `policy` | `policy.settings.tab.policy` 전역 정책 | 기한·마감 임박·반려 사유·알림·서명·위임·독촉·PIN·승인자 접근 확인·댓글 알림·접근 제한 (**이슈 승인 전용 항목 제거**) |
| | `projects` | `policy.settings.tab.project` | 그대로 |
| | `managers` | `policy.settings.tab.manager` | 그대로 |
| `policy.settings.group.issue` 이슈 승인 | `approval` (**신규**) | `policy.settings.tab.approval` "이슈 승인" | 탭 4개: `policy`(전환 승인 켬·필드 변경 적용 대체·상태 표시명) / `flows` / `groups` / `approvers` |
| `policy.settings.group.worklog` 워크로그·타임시트 | `timesheet` | `policy.settings.tab.timesheet` | 탭 4개: `policy`(TimesheetPolicySettings + 하단에 TimeTrackingProviderGuide) / `cert`(WorklogCertSettings) / `periodClose`(PeriodCloseSettings) / `teams`(TimesheetTeamSettings) |
| | `worklogControl` | 그대로 | 그대로 |
| | `workforce` | 그대로 | 그대로 |
| `policy.settings.group.records` 기록 | `audit` | 그대로 | 그대로(탭 4개 기존) |
| | `data` | 그대로 | 그대로 |

11 → 9 항목(3+1+3+2). 아이콘: `approval` 은 `@atlaskit/icon/core/check-circle`(기존 approvers 아이콘 재사용), 나머지 유지.

## 2. `settingsNavigation.js` 계약

```js
export const SETTINGS_GROUPS = Object.freeze([
  { key: 'general', labelKey: 'policy.settings.group.general', items: ['policy', 'projects', 'managers'] },
  { key: 'issue',   labelKey: 'policy.settings.group.issue',   items: ['approval'] },
  { key: 'worklog', labelKey: 'policy.settings.group.worklog', items: ['timesheet', 'worklogControl', 'workforce'] },
  { key: 'records', labelKey: 'policy.settings.group.records', items: ['audit', 'data'] },
]);
export const SETTINGS_NAVIGATION  // 평평한 8개 — 기존 소비자(AuditTrail.test 등) 호환. 각 item 에 group 키 포함
// 옛 값 → 새 위치. section 은 하위 탭.
const LEGACY_SETTINGS = {
  worklogHistory: { key: 'audit', section: 'worklog' },
  flows: { key: 'approval', section: 'flows' },
  groups: { key: 'approval', section: 'groups' },
  approvers: { key: 'approval', section: 'approvers' },
};
export const normalizeSetting(value) → key      // 기존 시그니처 유지, 미지 값은 'policy'
export const legacySectionOf(rawSetting) → section | null   // 옛 setting 값이 가리키는 하위 탭
export const settingsNavigation(t)        → 평평한 8개 [{key,label,icon,group}]  (업무함 children 용. group = 묶음 라벨 문자열)
export const settingsNavigationGroups(t)  → [{key,label,items:[{key,label,icon}]}]  (설정 엔트리 groups 용)
```

## 3. 하위 탭 URL 계약 (업무함 `InboxPage`)

- 새 파라미터 **`section`** = 탭 있는 설정 페이지(approval·timesheet·audit)의 하위 탭. 값은 각 페이지의 탭 상수 중 하나.
- **`auditTab` 은 읽기 호환만** — `section` 이 없을 때 `auditTab` 을 읽는다. 쓰기는 `section` 으로만. 옛 `setting=worklogHistory` 는 `setting=audit&section=worklog` 로 replace, `setting=flows` 는 `setting=approval&section=flows` 로 replace(`legacySectionOf`).
- 설정 항목을 바꾸면(`selectSetting`) `section: null, auditTab: null`. 설정을 벗어나면 `setting·section·auditTab` 모두 제거(기존 `auditTab: null` 처리 자리).
- `SettingsPanel({ selected, section, onSectionChange })` — 기존 `auditTab/onAuditTabChange` prop 은 `section/onSectionChange` 로 대체. 탭 페이지(audit·approval·timesheet)에는 모두 같은 이름 `initialTab/onTabChange` 로 넘긴다. 설정 엔트리(`SettingsPage`, URL 없음)는 메모리 state 로만 유지.
- `auditModel.auditTabOf(rawSetting, section)` 은 그대로 쓴다(옛 worklogHistory → 'worklog').
- `inboxUrl.js` 의 `updateInboxParams` 가 `section` 키를 다룰 수 있는지 확인(화이트리스트가 있으면 추가).

## 4. 탭 페이지 두 개 (AuditPage 패턴 복제)

### 4.1 `features/settings/IssueApprovalSettings.jsx` (신규)
- `ISSUE_APPROVAL_TABS = ['policy','flows','groups','approvers']`, 기본 `policy`. 상수는 `issueApprovalModel.js`(순수)에.
- 각 탭 내용은 `React.lazy(importWithReloadOnce)` 로 분리(IssueApprovalPolicySettings·FlowSettings·GroupSettings·ApproverSettings).
- 상단 `Heading large` = `policy.issueApproval.title`, 힌트 `policy.issueApproval.hint`. 탭 라벨은 `policy.settings.tab.flow|group|approver`(기존 키 재사용) + `policy.issueApproval.tab.policy`.
- 탭 `testId`: `issue-approval-tab-${key}`. `initialTab/onTabChange` prop.

### 4.2 `features/settings/IssueApprovalPolicySettings.jsx` (신규 — PolicySettings 에서 분리)
- 쿼리 `settingsKeys.policy()` / `getApprovalSettings`, 뮤테이션 `saveApprovalSettings` 에 **이 폼의 키만** patch: `transitionApprovalEnabled`, `fieldChangeApplyFallback('APP'|'OFF')`, `statusLabels`. `onSuccess` 로 `settingsKeys.policy()` 캐시 교체(기존 방식).
- `StatusFlow` + `fieldChangeApplyFallback` 경고 SectionMessage 는 기존 코드를 **그대로 옮긴다**(Q53 주석 포함). 저장 버튼 비활성 조건(`!dirty && !statusLabelsDirty`)도 그대로.
- 머리: `Heading medium` `policy.issueApproval.policyTitle`(이슈 승인 정책) — 페이지 Heading large 는 4.1 이 가진다.
- `PolicyFallback.test.jsx` 는 이 컴포넌트를 렌더하도록 바꾼다(기대 동작 동일).

### 4.3 `PolicySettings.jsx` (수정)
- 위 세 키·`StatusFlow`·`statusLabels` 상태 제거. `formKey` 에서도 제거. 저장 patch 에서도 제거.
- 나머지 필드를 `FormSection` 세 묶음으로만 정리(제목 키 신규): `policy.section.deadline`(기한·마감 임박·반려 사유), `policy.section.notify`(알림·댓글 알림·독촉 켬·첫 독촉·반복), `policy.section.security`(서명·PIN·위임·승인자 접근 확인·접근 제한). 필드 순서 외 동작 변경 없음.

### 4.4 `TimesheetSettings.jsx` (수정 → 탭)
- `TIMESHEET_SETTINGS_TABS = ['policy','cert','periodClose','teams']`, 기본 `policy`. 상수는 `timesheetSettingsModel.js`(순수).
- `policy` 탭 = `<TimesheetPolicySettings/>` + `<TimeTrackingProviderGuide/>`(Stack space.400). 나머지 1:1.
- 탭 내용 lazy. 페이지 상단 Heading 은 두지 않는다(각 섹션이 자기 Heading 을 이미 가짐). 탭 라벨 키 `timesheet.settings.tab.policy|cert|periodClose|teams`.
- 파일 상단 주석("탭을 나누면 오가기만 늘어난다")은 사용자 결정(2026-10-12)으로 뒤집혔다고 고쳐 쓴다.
- `testId`: `timesheet-settings-tab-${key}`. `initialTab/onTabChange` prop.

## 5. `AppShell` 확장 (업무함 하위 메뉴 묶음 표시)
- `item.children` 의 각 child 가 선택적 `group`(라벨 문자열)을 가질 수 있다. 렌더 시 **직전 child 와 group 이 다르면** `<div className="app-nav-group-label app-nav-child-group">{group}</div>` 를 끼운다. 접힘 상태에서는 기존 `.app-nav-group-label` 규칙으로 숨겨진다.
- 설정 엔트리 `SettingsPage` 는 `nav` 대신 `groups={settingsNavigationGroups(t)}` 를 쓴다(AppShell 이 이미 지원).
- CSS: `.app-nav-child-group { padding-top: 8px; }` 정도. 다크 모드 변수 그대로.

## 6. i18n (kr/en 동시, `npm run merge`)
`policy.json`:
- `settings.group.{general,issue,worklog,records}` = 일반 / 이슈 승인 / 워크로그·타임시트 / 기록 — General / Issue approval / Worklogs & timesheets / Records
- `settings.tab.approval` = 이슈 승인 / Issue approval
- `issueApproval.title` = 이슈 승인 설정 / Issue approval settings
- `issueApproval.hint` = 이슈 상태 변경·필드 변경 승인 정책과 결재선·승인 그룹·승인자 명부를 관리합니다. / Manage transition and field-change approval policy, approval lines, groups and approver rosters.
- `issueApproval.policyTitle` = 이슈 승인 정책 / Issue approval policy
- `issueApproval.tab.policy` = 정책 / Policy
- `section.deadline` = 기한 / Deadlines, `section.notify` = 알림·독촉 / Notifications & reminders, `section.security` = 서명·접근 / Signature & access
- `settings.tab.worklogHistory` 는 쓰는 곳이 없으면 제거(grep 후).
`timesheet.json`: `settings.tab.{policy,cert,periodClose,teams}` = 정책 / 인증 / 기간 마감 / 팀 — Policy / Certification / Period close / Teams

## 7. 테스트
- 신규: `settingsNavigation.test.js`(그룹↔평평 집합 일치, legacy 매핑, 미지 값 → policy), `IssueApprovalSettings.test.jsx`(탭 전환·lazy 내용·onTabChange), `TimesheetSettings.test.jsx`(탭 4개, 기본 policy 에 제공자 안내 포함), `AppShell.test.jsx` 에 child group 라벨 1건.
- 갱신: `PolicyFallback.test.jsx`(새 컴포넌트), `InboxPage.test.jsx`(`section` 파라미터·legacy flows 링크 replace), `AuditTrail.test.jsx` 252행(worklogHistory → audit 유지).
- 모든 테스트가 `t` 를 키 그대로 돌려주는 목을 쓰므로 라벨은 키로 검사.

## 8. 불변식·함정 점검
- 백엔드·resolver·쿼리키 무변경. 부분 patch 는 서버가 이미 지원(`normalizeSettingsPatch`).
- lazy 청크 추가 → `importWithReloadOnce` 필수(배포 직후 백지 함정).
- 엔트리 3곳(craco ENTRIES·public html·manifest) 변경 없음 — 엔트리를 추가하지 않는다.
- 설정 엔트리 iframe 높이: 탭이 늘어나도 내용이 높이를 정한다(100vh 금지).
- 작업 트리에 이미 다른 미커밋 변경(AGENTS.md·package.json·IssueSignalRefresher.js·integration-verify SKILL.md·scripts/check-bundle-load.js)이 있다 — **건드리지 않는다**.
