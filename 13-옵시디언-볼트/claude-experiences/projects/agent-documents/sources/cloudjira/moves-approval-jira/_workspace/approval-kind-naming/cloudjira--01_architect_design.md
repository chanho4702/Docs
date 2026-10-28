# 설계 — 승인 종류 명확화 (approval-kind-naming, 프론트·i18n 전용)

작성: 2026-10-12 리더. 사용자 원문: "승인 기능이 모호해. 상태 변경에 대한 승인인지 워크로그에 대한 승인인지 모르겠음". 요구서는 이 문서가 겸한다. 백엔드 변경 없음(알림은 `{templateKey, vars}` 를 프론트가 렌더하므로 문구만).

## 1. 용어 고정 (모든 화면·알림·설정에서 이 이름만 쓴다)

| targetKind | 고정 이름(kr) | en | 한 줄 설명(kr) |
|---|---|---|---|
| `ISSUE` | **이슈 결재** | Issue sign-off | 이슈 내용을 검토·결재합니다. 이슈 상태는 바뀌지 않습니다. |
| `ISSUE_TRANSITION` | **상태 변경 승인** | Status change approval | 승인되면 이슈 상태가 바뀝니다. |
| `FIELD_CHANGE` | **필드 변경 승인** | Field change approval | 승인되면 요청한 값이 적용됩니다. |
| `TIMESHEET` | **타임시트 승인** | Timesheet approval | 사람별 주·월 작업 시간을 승인합니다. |
| `WORKLOG_CREATE` | **워크로그 사전 승인** | Worklog pre-approval | 기록하기 전 작업 시간 1건을 승인합니다. |
| `WORKLOG_CERTIFICATION` | **워크로그 인증(이전 방식)** | Worklog certification (legacy) | 이미 기록된 시간을 확인합니다. |

- 순수 모델 `static/ui/src/features/approval/approvalKindModel.js`: `APPROVAL_KINDS`(순서 위 표), `kindLabelKey(kind)` → `approvalKind.label.<kind>`, `kindHintKey(kind)` → `approvalKind.hint.<kind>`, `kindAppearance(kind)` → Lozenge appearance(ISSUE `default`, ISSUE_TRANSITION `inprogress`, FIELD_CHANGE `new`, TIMESHEET `success`, WORKLOG_CREATE `moved`, WORKLOG_CERTIFICATION `default`). 미지 kind 는 원문 반환.
- 공용 배지 `components/ApprovalKindBadge.jsx` `{ kind, t, testId }` → Lozenge. 모든 자리에서 이 컴포넌트만 쓴다.
- 신규 네임스페이스 `locales/{kr,en}/approvalKind.json`: `label.*`, `hint.*`, `filter.all` "모든 종류", `column` "종류".
- 기존 `inbox.type.*`(이슈/전환 승인/…) 는 **삭제**하고 `approvalKind.label.*` 로 통일(소비처 grep 후 교체). `audit.json` 의 targetKind 라벨도 같은 값으로 맞춘다(키는 유지).

## 2. 업무함 (`InboxPage`·`InboxTable`·`InboxFilters`)
- 유형 열(`type`, width 7) → **종류 열** width 14, `ApprovalKindBadge`. 헤더 `approvalKind.column`.
- 탭 아래 **종류 필터 칩** 한 줄: "모든 종류" + 6종(해당 사이트에서 켜진 기능만 — `features` 가 null 이면 전부). 선택은 URL `kind`(기존 `updateInboxParams`), 기존 필터 모델에 `kind` 가 이미 있으면 재사용, 없으면 프론트 필터(목록 응답에 targetKind 가 있으므로 클라이언트 필터 허용. 서버 카운트는 건드리지 않는다).
- 빈 상태 문구: 종류 필터가 걸려 있으면 `inbox.empty.kind` "{kind} 건이 없습니다." 로.
- 메뉴 묶음 `inbox.nav.work` "승인 업무" → "결재함". 탭 라벨은 그대로(내 차례·내 요청·진행 중·처리한 건·참조).

## 3. 알림 (`NotificationPanel`·`notification.json`)
- 모든 결재 알림 문장 앞에 `[{kind}]` 접두: 템플릿 vars 에 `targetKind` 가 오면 `approvalKind.label` 로 바꿔 `tFormat` 에 `kind` 로 넘긴다. 문구 예: `requested` "[{kind}] {requester}님이 {title} 승인을 요청했습니다." 11개 템플릿(`approved`·`cancelled`·`completed`·`dueSoon`·`editedAfterApproval`·`editedWhilePending`·`expired`·`myTurn`·`rejected`·`requested`·`reminder`) 전부. `targetKind` 가 vars 에 없으면 접두 생략(옛 알림 호환) — `kind` 빈 문자열이면 `[]` 가 남지 않게 템플릿을 둘로(`*.withKind` / 기존).
- 알림 행에도 `ApprovalKindBadge`(kind 있을 때만).

## 4. 이슈 화면 (`IssueApprovalOverview` 및 하위 섹션)
- "검토·결재" 섹션 제목 → **"이슈 결재"**, 첫 줄 `approvalKind.hint.ISSUE`.
- "전환 승인" 섹션 제목 → **"상태 변경 승인"**, 첫 줄 `approvalKind.hint.ISSUE_TRANSITION`.
- 필드 변경 섹션(있으면) 제목 → "필드 변경 승인", 첫 줄 hint.
- 각 섹션 제목 옆에 `ApprovalKindBadge`.
- `transition.json`·`issueApproval.json`·`fieldChange.json` 의 "승인"만 있는 문구(예: "이 프로젝트는 승인을 사용하지 않습니다")는 종류를 넣는다("이 프로젝트는 상태 변경 승인을 사용하지 않습니다").

## 5. 요청 폼·상세
- 요청 폼 머리(`RequestForm`)와 상세 머리(`ApprovalDetail`/`DetailHeader`)에 `ApprovalKindBadge` + 한 줄 hint. 상세 제목 "승인 요청" → "{kind} 요청".
- 결정 버튼·결과 문구는 그대로(승인/반려는 동작 이름).

## 6. 설정
- `policy.settings.tab.policy` "전역 정책" → **"결재 공통 정책"**, `policy.hint` → "모든 승인 종류에 공통으로 적용되는 기본값입니다(기한·알림·서명·위임·접근)."
- `policy.settings.tab.approvalSetup` "결재 구성" 유지, hint 에 "결재선·승인 그룹·결재자 명부는 모든 승인 종류가 함께 씁니다."
- `approver.title` "승인자" → **"결재자 명부"**, `policy.groups.title` "승인 그룹" → "결재 그룹".
- `policy.settings.group.issue` "이슈 승인" → **"이슈 승인(결재·상태 변경·필드 변경)"** 은 길다 → 묶음 라벨은 "이슈 승인" 유지하되 `IssueApprovalSettings` 페이지 소개에 세 종류 표(이름 + 한 줄)를 `SettingsRows` 로.
- "사용할 기능" 페이지: `features.issue.description` 아래에 6종 표(이름 · 한 줄 · 어느 기능에 속하나) — `approvalKind.*` 재사용.

## 7. 테스트
- `approvalKindModel.test.js`(라벨 키·appearance·미지 kind).
- `InboxPage.test.jsx`: 종류 열 배지, 필터 칩 → URL `kind`, 빈 상태 문구.
- `NotificationPanel` 테스트: `targetKind` 있/없 문구.
- 이슈 패널 테스트: 섹션 제목 키 교체.
- 기존 테스트에서 `inbox.type.*` 를 찾는 단언은 새 키로.

## 8. 함정
- `targetKind` 값 집합은 `auditModel.TARGET_KINDS` 와 같다 — 모델 상수를 거기서 import 해 중복 정의하지 않는다.
- 배지 Lozenge 는 `settingsNavigation.js` 처럼 jest 에서 `xcss` 문제를 일으키는 자리(네비 모듈)에서는 쓰지 않는다. 테이블·패널 안은 기존 Lozenge 사용처가 있어 안전.
