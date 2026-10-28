# 설계 — 운영 모드(단독 / 워크포스 연동) 표시 분리 (프론트 전용)

작성: 2026-10-12 리더가 코드 실측 뒤 직접 작성(백엔드 변경 없음 → architect 단계 생략). 전제: settings-restructure(설정 묶음·탭) 가 적용된 트리 위에서 작업한다.

## 1. 모드 원천 (순수 + 훅)

`static/ui/src/features/settings/operatingModeModel.js` (순수):
```js
export const OPERATING_MODES = Object.freeze(['LINKED', 'STANDALONE']);
/** 정책 객체 → 모드. 정책을 모르면(null/undefined) null — 호출부는 null 이면 **전부 보여 준다**(표시 fail-open). */
export const operatingModeOf = (policy) => (policy == null ? null : (policy.workforceLinkEnabled !== false ? 'LINKED' : 'STANDALONE'));
export const isStandalone = (mode) => mode === 'STANDALONE';
```
`static/ui/src/features/settings/useOperatingMode.js` (훅):
- `useQuery({ queryKey: settingsKeys.policy(), queryFn: () => invokeApproval('getApprovalSettings'), staleTime: 5분, enabled })` 를 쓰고 `operatingModeOf(data)` 를 돌려준다. 실패·로딩은 null.
- 기존 정책 화면들과 **같은 쿼리키**라 캐시를 공유한다. 워크포스 연동 토글(`EnabledToggle`)이 `setQueryData(settingsKeys.policy())` 로 교체하므로 토글 즉시 모든 소비처가 따라온다.
- `getApprovalSettings` 는 `{admin:true}` 가드다. 업무함에서는 설정 뷰가 열렸을 때만(`enabled: view === 'settings'`) 묻고, 거부되면 null(전부 보임).

## 2. 단독 모드에서 접히는 요소 (전수)

| 위치 | 연동 모드(지금 그대로) | 단독 모드 |
|---|---|---|
| 설정 메뉴 `workforce` 항목 (`settingsNavigation`) | 배지 `workforce.mode.linked` "연동 중" | 배지 `workforce.mode.standalone` "단독" |
| `WorkforceLinkSettings` | 제목·안내·토글·저장소 미준비·StatusCard·RepublishActions·InboundCard·FailureTable | 제목·안내·**토글**·`SectionMessage(information)` `workforce.mode.standaloneHint` + 접힌 상태 섹션(기본 접힘, "연동 상태 자세히 보기" 버튼 `workforce.mode.showStatus` 로 펼침 → StatusCard·InboundCard·FailureTable. RepublishActions 는 꺼짐이면 이미 `offHint` 가 있으니 펼침 안에 그대로) |
| `WorklogControlSettings` PhaseTable 의 **Phase C(LINKED_ALL)** 행 | 그대로 | 켜기 버튼 대신 `Lozenge default` `worklogControl.mode.linkedOnly` "연동 전용" + 한 줄 `worklogControl.mode.linkedOnlyHint`. 관문 사유 목록은 숨긴다(연동 자체가 전제). 이미 켜져 있으면(scope === 'LINKED_ALL') 행은 그대로 보이고 끄기 안내만 유지 — 서버가 무시 중이라는 `worklogControl.mode.inactiveWhileStandalone` 경고 추가 |
| `WorklogControlSettings` ForeignSettings 범위 선택 | `LINKED` / `ALL` | 선택지는 그대로 두고, 현재 값이 `LINKED` 면 `SectionMessage(warning)` `worklogControl.mode.foreignLinkedInactive`("단독 모드에서는 연동분 범위가 비어 있어 감지가 동작하지 않습니다. 전체로 바꾸거나 연동을 켜세요") |
| `AuditPage` RetentionNote (worklog 탭) | 일반분 + 연결분 문구 | 연결분 문구 생략 |
| `RecordRetentionSection`(데이터 관리) `WORKLOG_HISTORY_LINKED` 행 | 그대로 | 행을 접는다 — `Text subtlest` 한 줄 `data.retention.linkedCollapsed`("워크포스 연동을 켜면 연결분 보관 기간을 따로 정할 수 있습니다"). 저장값 유지 |
| `WorklogHistoryList` `WorkforceLinkedBadge` | 그대로 | 배지 숨김(단독이면 전부 false 라 노이즈). 컴포넌트 prop `showLinked`(기본 true) — 호출부(감사 > 워크로그 변경 탭 `WorklogHistoryAuditSettings`)가 모드로 넘긴다 |

**건드리지 않는 것**: `WorklogTab` 채널 배너(이미 `linkStateOf` 로 조건부), 팀 명부·`TeamFormModal`(Jira 그룹 가져오기는 워크포스 아님), 타임시트 정책·인증·기간 마감, `WorklogPolicyPanel`(`data.workforce.lastResult` 는 서버가 없으면 안 준다).

## 3. 메뉴 배지 전달 경로
- `settingsNavigation(t, { mode })`, `settingsNavigationGroups(t, { mode })` — 두 번째 인자 옵션. `mode` 가 null 이면 배지 없음. 배지는 AppShell 이 이미 지원하는 `item.badge`(문자열 또는 노드). Lozenge 를 쓴다면 `appearance`: LINKED → `success`, STANDALONE → `default`.
- `SettingsPage`: `useOperatingMode({ enabled: true })`.
- `InboxPage`: `useOperatingMode({ enabled: view === 'settings' })`, `groups` useMemo 의존성에 mode 추가.

## 4. 토글 문구
- `workforce.enabled.help` 는 그대로. 토글 아래 현재 모드 Lozenge 한 개(`workforce.mode.linked|standalone`) 를 `testId="workforce-mode"` 로 둔다 — 화면 안에서도 모드가 보이게.

## 5. i18n (kr/en 동시, `npm run merge`)
`workforce.json`:
- `mode.linked` 연동 중 / Linked · `mode.standalone` 단독 / Standalone
- `mode.standaloneHint` 단독 모드입니다. 워크포스 연동 전용 설정은 접혀 있고 저장된 값은 유지됩니다. 연동을 켜면 다시 보입니다. / Standalone mode. Workforce-only settings are collapsed and their saved values are kept. Turn the link on to show them again.
- `mode.showStatus` 연동 상태 자세히 보기 / Show link status · `mode.hideStatus` 연동 상태 접기 / Hide link status
`worklogControl.json`:
- `mode.linkedOnly` 연동 전용 / Linked only
- `mode.linkedOnlyHint` 워크포스 연동을 켜야 쓸 수 있는 단계입니다. / Requires the Workforce link.
- `mode.inactiveWhileStandalone` 연동이 꺼져 있어 이 단계는 지금 동작하지 않습니다. 저장된 값은 유지됩니다. / The link is off, so this phase is not active right now. The saved value is kept.
- `mode.foreignLinkedInactive` 단독 모드에서는 연동분 범위가 비어 있어 감지가 동작하지 않습니다. 범위를 전체로 바꾸거나 연동을 켜세요. / In standalone mode the linked scope is empty, so detection does nothing. Switch the scope to all or turn the link on.
`data.json`:
- `retention.linkedCollapsed` 워크포스 연동을 켜면 연결분 보관 기간을 따로 정할 수 있습니다. / Turn on the Workforce link to set a separate retention for linked entries.

## 6. 테스트
- 신규 `operatingModeModel.test.js`(null → null, true/undefined → LINKED, false → STANDALONE).
- `settingsNavigation.test.js` 에 배지 유무 2건.
- `WorkforceLinkSettings.test.jsx`: 단독이면 상태 섹션이 접혀 있고 펼치기 버튼으로 나타남, 연동이면 그대로.
- `WorklogControlSettings.test.jsx`: 단독 + scope OFF → Phase C 켜기 버튼 없음·연동 전용 로젠지; 단독 + foreignScope LINKED → 경고; 연동이면 기존 테스트 그대로.
- `RecordRetention.test.jsx`: 단독이면 연결분 행 접힘, 저장 호출 없음.
- `AuditTrail.test.jsx` RetentionNote: 단독이면 연결분 문구 없음.
- 모드 null(정책 실패) 이면 모든 화면이 연동 모드와 같게 보이는 케이스 1건(WorkforceLinkSettings 또는 RecordRetention).

## 7. 함정·불변식
- 숨김 ≠ 비활성. 접힌 요소의 저장값은 그대로 두고 서버 동작은 바꾸지 않는다(서버가 이미 연동 꺼짐이면 무시). 단, "켜져 있는데 무시 중"인 상태(Phase C on·foreignScope LINKED)는 **반드시 경고로 드러낸다**.
- `getApprovalSettings` 는 관리자 전용 — 비관리자 업무함에서 호출되지 않도록 `enabled` 를 지키고, 거부 응답은 에러 토스트 없이 null 처리.
- lazy·엔트리·쿼리키 신규 없음. 쿼리키는 기존 `settingsKeys.policy()` 재사용.
- 서버 기본값은 **꺼짐(false)** 으로 바꾼다(§8). 새 사이트는 단독 모드로 시작하고, 관리자가 켜야 연동한다.

## 8. 백엔드 — 기본값 꺼짐 + 판정 단일화 (backend-engineer)

사용자 결정(2026-10-12): 두 앱이 다 설치돼 있어도 연동은 관리자가 명시적으로 켜야 한다. 지금은 기본값이 `true` 이고,
소비처 다섯 곳이 KVS 값을 **직접** 읽어 `=== false` 로만 판정해서 **미저장 = 연동 켬** 이 된다. 둘 다 고친다.

1. `SettingsRepository.DEFAULT_APPROVAL_SETTINGS.workforceLinkEnabled = false`. 주석도 "기본 꺼짐 — 연동은 명시적 선택" 으로.
2. `SettingsRepository` 에 **단일 판정 함수** 추가: `async isWorkforceLinkEnabled()` → `const v = await this.getValue(SETTINGS_KEYS.workforceLinkEnabled); return v === undefined || v === null ? DEFAULT_APPROVAL_SETTINGS.workforceLinkEnabled : v === true;`
   (`WorkforceOrgSource.js:19-20` 의 로직을 여기로 옮기고 그곳은 이 함수를 부른다.)
3. 직접 읽던 소비처를 전부 이 함수로 바꾼다(동작: 미저장이면 이제 **꺼짐**):
   - `worklogControl/ControlLinkJudge.js:33`, `worklogControl/IssueSignalRefresher.js:46`, `worklogHistory/WorklogHistoryRecorder.js:121`, `workforce/WorkforceOrgSource.js:19`
   - `settings/SettingsService.js:243-244` relinking 판정: "이전 유효값이 false(미저장 포함) 이고 patch 가 true" 면 relinking. 즉 `!(await this.repository.isWorkforceLinkEnabled())`.
   - 테스트 더블(`settings: { getValue }`)을 쓰는 테스트는 `isWorkforceLinkEnabled` 를 제공하도록 갱신.
4. `policy.workforceLinkEnabled !== false` / `=== false` 로 **정책 객체**(getPolicy — 기본값 적용됨)를 읽는 곳(WorkforceCertWake·WorkforceLinkService·WorkforcePublisher)은 기본값 변경만으로 맞게 동작한다. 단, `!== false` 는 `=== true` 로 바꿔 두 표현을 통일한다(미저장 정책 객체가 올 일은 없지만 의미를 분명히).
5. 정책 기본값 ↔ KVS 키 맵 계약 테스트(`DEFAULT ↔ SETTINGS_KEYS` 집합)는 키가 바뀌지 않으니 그대로. 기본값을 단언하는 테스트가 있으면 갱신.
6. 신규 테스트: `isWorkforceLinkEnabled` 3건(미저장 → false, true → true, false → false); ControlLinkJudge·WorklogHistoryRecorder·IssueSignalRefresher 가 **미저장**일 때 연동 아님으로 처리하는 케이스 각 1건; relinking 이 미저장→true 에서도 전량 재게시를 트리거하는 케이스 1건.
7. 프론트는 `getApprovalSettings` 응답(기본값 적용)만 보므로 추가 변경 없음 — `workforceLinkEnabled !== false` 는 응답에 항상 boolean 이 들어오니 그대로 동작한다. 다만 프론트 `operatingModeOf` 는 `=== true` 로 맞춘다(frontend-engineer 에게 전달).
8. 유휴 SQL 예산: 판정 함수는 KVS 1회(기존과 동일), SQL 0. 변화 없음.
