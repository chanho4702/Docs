# 02 프론트 보고서 — 승인 종류 명확화 (approval-kind-naming)

작성: 2026-10-12 frontend-engineer. 백엔드·manifest·엔트리 3곳 변경 없음, resolver·쿼리키 변경 없음.
소비 경로: 업무함 `listInbox` 행의 `targetKind`, 알림 `listNotifications` 행의 `targetKind`(vars.targetKind 가 있으면 우선), 상세 `target.kind`, 맥락 `getTimesheetContext.features`(칩 노출).

## 1. 바뀐 파일

### 신규
| 파일 | 내용 |
|---|---|
| `static/ui/src/features/approval/approvalKindModel.js` | `APPROVAL_KINDS`(auditModel.TARGET_KINDS 에서 파생, 사람 순서), `kindLabelKey`·`kindHintKey`·`kindAppearance`·`kindLabel`·`isApprovalKind`·`FEATURE_OF_KIND`·`enabledKinds(features)` |
| `static/ui/src/components/ApprovalKindBadge.jsx` | 공용 배지(Lozenge, `data-kind`). kind 없으면 null |
| `static/ui/src/features/approval/KindSectionHead.jsx` | 이슈 화면 칸 머리 — 배지 + 한 줄 설명 |
| `static/ui/src/features/approval/ApprovalKindTable.jsx` | 설정용 종류 표(`SettingsRows`: 배지 · 한 줄 · 선택적으로 속한 기능) |
| `static/ui/src/features/inbox/InboxKindFilter.jsx` | 업무함 종류 칩 한 줄 |
| `locales/{kr,en}/approvalKind.json` | `label.*`·`hint.*`(6종), `filter.all`·`filter.label`, `column`, `table.*`, `feature.*` |

### 수정
| 파일 | 내용 |
|---|---|
| `features/inbox/InboxTable.jsx` | 유형 열 → 종류 열(width 7→14, 머리 `approvalKind.column`, `ApprovalKindBadge`). `kindFilter` 가 있으면 빈 상태 `inbox.empty.kind` |
| `features/inbox/InboxPage.jsx` | 칩(켜진 기능의 종류만, URL `kind`), `visibleItems` 클라이언트 필터(표·일괄 승인 선택·전체 선택), 내보내기에 kind 전달, 상세 모달 제목 "{종류} 상세" |
| `features/inbox/inboxUrl.js` | `parseInboxSearch` 에 `filters.kind`(6종 외 버림), `filterByKind`. `toInboxFilters` 는 kind 를 **보내지 않음** |
| `features/inbox/exportInboxExcel.js` | 종류 열(`approvalKind.column`, `kindLabel`), `kind` 로 받은 행 거름 |
| `features/notification/NotificationPanel.jsx` | `notificationKindOf`·`notificationMessageOf`·`KIND_PREFIXED_TEMPLATES` — 11종 결재 알림에 `[종류]` 접두(종류 모르면 원문), 행에 배지. 미사용 import 제거 |
| `features/issueApproval/IssueApprovalOverview.jsx` · `features/fieldChange/FieldChangeSection.jsx` · `entries/modal.jsx` | 세 칸 머리를 `KindSectionHead`(이슈 결재 / 상태 변경 승인 / 필드 변경 승인 + 한 줄)로. `showHints`·`labelKey` prop 제거(호출부 modal.jsx 정리) |
| `features/request/RequestForm.jsx` | 머리에 "이슈 결재" 배지 + 한 줄 |
| `features/detail/ApprovalDetail.jsx` | 머리에 종류 배지 + 한 줄(`detail-kind`, `detail-kind-hint`) |
| `features/settings/IssueApprovalSettings.jsx` | 소개 아래 3종 표 |
| `features/settings/FeatureSelectionSettings.jsx` | "승인 종류" 섹션(6종 표 · 속한 기능) |
| `features/settings/exportRetentionExcel.js` · `features/worklogApproval/worklogApprovalModel.js` | `inbox.type.*` → `approvalKind.label.*`/`kindLabel` |

### i18n (kr/en 동시)
- **삭제**: `inbox.type.*`(소비처 5곳 grep 후 전부 교체), `issueApproval.section.title`, `issueApproval.overview.{general,transition,generalHint,transitionHint,fieldChange}`, `transition.list.title`, `fieldChange.section.title`, `fieldChange.overview.*` — 화면·백엔드(`src/`) 모두 소비처 0 확인.
- **추가**: `notification.templateWithKind.*`(11), `inbox.empty.kind`, `inbox.modal.detailTitleKind`, `policy.features.kinds.{title,description}`.
- **값 변경**: `inbox.nav.work` 승인 업무→**결재함**; `audit.approval.kind.*` = `approvalKind.label.*`(키 유지); `cert.target.*` 같은 이름; `policy.settings.tab.policy`·`audit.area.policy` → **결재 공통 정책**, `policy.hint` 설계 문구; `policy.approvalSetup.hint` 설계 문구; `approver.title`·`settings.tab.approver`·`audit.area.approvers` → **결재자 명부**; `policy.groups.*`·`settings.tab.group`·`common.groupSettings.*`·`audit.area.group` → **결재 그룹**; `policy.features.issue.description`(세 종류 이름); "승인"만 있던 문구에 종류(`issueApproval.section.{none,projectDisabled,request}`, `transition.list.notEnforced.*`·`list.empty`, `fieldChange.section.projectDisabled`); `request.issueTitle`·`issueDialogTitle`; kr "전환 승인"→"상태 변경 승인", "사전승인"→"사전 승인", en "transition approval"→"status change approval", "preapproval"→"pre-approval"(값만, 일괄 42건 — 키·열거 코드 무변경); `worklogCertification.title` → "워크로그 인증(이전 방식)"; "전역 정책"을 가리키던 문구(flows.form.deadlineHint, approver.accessHint, project.policy.lede/noOverride) → 결재 공통 정책.

## 2. 설계와 다르게 한 점과 이유

1. **이슈 화면 칸 제목 = 배지 하나.** 설계는 "제목(고정 이름) + 옆에 배지"였으나 제목 글자와 배지 글자가 같아 "이슈 결재 [이슈 결재]"로 두 번 보인다. 배지가 제목 역할을 하고 아래에 한 줄 설명(`approvalKind.hint.*`)을 둔다. 한 줄 설명은 종류 선택 모달(showHints)뿐 아니라 이슈 패널에서도 **항상** 보인다(어떤 승인인지 늘 보이게가 이 과제의 목적). 그래서 기존 `showHints` 전용 설명 키들은 제거.
2. **알림 접두 템플릿 키 위치** — 설계의 `*.withKind` 는 `notification.template.approved` 가 문자열이라 하위 키를 둘 수 없다. 형제 트리 `notification.templateWithKind.<name>` 으로 뒀다. 종류는 행의 `targetKind`(백엔드 `listNotifications` 가 이미 싣는다)를 쓰고, `vars.targetKind` 가 오면 그것을 우선한다. 종류 전용 문장(transitionApproved·fieldChange* 등)은 문장에 종류가 이미 있어 접두하지 않는다.
3. **상세 제목** — 설계 "{kind} 요청" 대신 업무함 상세 모달 제목을 "{kind} 상세"(`inbox.modal.detailTitleKind`)로 했다. 기존 제목이 "승인 상세"였고(요청 화면이 아니라 상세 화면), 열 때 행의 targetKind 를 알 수 있다. 상세 본문 머리에는 배지 + 한 줄을 넣었다(이슈 화면 등 다른 오프너가 연 상세에도 보임).
4. **종류 필터는 클라이언트 필터.** 서버(`listInbox`)에 kind 필터가 없어 받은 페이지에서 거른다 — 서버 조회·상태 카운트·쿼리키 불변. 한계: 한 페이지(50건)에 해당 종류가 없으면 빈 상태 + "더 보기"가 함께 보일 수 있다. 일괄 승인·전체 선택은 보이는 행만 대상. 내보내기도 같은 기준으로 거른다. → **백엔드 요청(선택)**: 서버 `filters.targetKind` 가 생기면 `toInboxFilters` 에 넣고 클라이언트 필터를 걷어 낸다.
5. **칩 노출 규칙** — `features` 가 null 이면 6종 전부. 이슈 승인 꺼짐 → 이슈 결재·상태 변경·필드 변경 칩 숨김, 타임시트 승인 꺼짐 → 타임시트 칩 숨김. 워크로그 사전 승인·인증은 기능 선택과 무관하게 각자 설정대로 동작하므로 항상 둔다. URL 로 들어온 꺼진 종류는 해제할 수 있게 칩을 남긴다.
6. **"사용할 기능" 6종 표 위치** — `features.issue.description` 아래(이슈 승인 섹션 안)에 두면 타임시트·워크로그 종류가 이슈 승인 소속처럼 보인다. 별도 섹션 "승인 종류"를 이슈 승인 섹션 바로 위에 두고, 각 행에 "속한 기능"을 적었다.
7. **용어 일괄 정리 범위** — 설계 §6 외에 "전환 승인"·"사전승인"·"승인 그룹"·"전역 정책" 같은 옛 이름이 남은 문장도 같은 이름으로 맞췄다(값만, 키 무변경). 백엔드가 읽는 `transition.json`(validator·코멘트 문구)도 값이 바뀌었으나 백엔드 jest 전부 통과.
8. **`.settings-rows` CSS** 는 worklog-table 회차에서 컴포넌트 import 로 옮겼다(설정 화면 결과 동일).

## 3. 테스트·빌드 (명령·수치)

- `cd static/ui && CI=true npx jest --runInBand` → **80 suites / 709 tests passed**(A·B 합산 최종).
- `cd static/ui && CI=false npm run build` → 성공. 경고는 node_modules(source map 누락·`@atlaskit/react-select` postcss-calc)뿐, 우리 코드 eslint 경고 0.
- 리포 루트 `npm run merge` → 성공(`locales\ko-KR.json`·`en-US.json` 생성, kr/en 키 집합 일치 — 고아 키 0).
- 백엔드 `npx jest`(프론트와 순차) → 157 suites / 2460 tests passed.

새·수정 테스트(설계 §7): `features/approval/__test__/approvalKindModel.test.js`(신규 — 키·appearance·미지 kind·enabledKinds·kr 고정 이름·감사 라벨 동일·사전 존재), `InboxPage.test.jsx`(칩 → URL `kind`·서버 미전송·재조회 없음, URL 진입·잘못된 값, 꺼진 기능 칩 숨김, 상세 제목), `InboxTable.test.jsx`(종류 배지·미지 kind 원문·`inbox.empty.kind`), `NotificationPanel.test.jsx`(targetKind 있/없/미지·전용 템플릿 제외·11종 사전), `IssueApprovalOverview.test.jsx`·`FieldChangeSection.test.jsx`(칸 머리 배지·설명), `IssueApprovalSettings.test.jsx`(3종 표), `FeatureSelectionSettings.test.jsx`(6종 표·속한 기능), i18n 대조 3종(`issueApproval`·`fieldChange`·`transition`)과 `exportRetentionExcel.test.js` 를 새 키로.

주의: Lozenge 실물은 일부 테스트의 primitives 목(xcss 없음)과 충돌한다(설계 §8). `InboxPage.test`·`IssueApprovalSettings.test` 에 lozenge 목을 추가했다. 배지는 설정 네비 모듈(settingsNavigation.js)에는 넣지 않았다.

## 4. 미검증 (실기기 필요)

- 업무함 종류 열(14%)에서 영문 긴 이름("Worklog certification (legacy)")이 줄바꿈되며 행 높이가 늘어나는지.
- 칩 한 줄이 좁은 폭에서 두 줄로 감기는 모양(`shouldWrap`).
- 이슈 패널(compact) 세 칸 머리에 설명 한 줄씩이 늘어 패널 높이가 커진 것 — 이슈 화면 체감.
- 알림 행 배지 + `[종류]` 접두가 함께 보여 중복감이 있는지(설계 요구대로 둘 다 넣음 — 과하면 배지를 뺄 수 있다).
- Forge Modal 제목 "{종류} 상세"가 Jira 모달 머리에 그대로 표시되는지.

## 5. 검증 지적 반영 (03_verify_report.md, 2026-10-12)

| # | 지적 | 수정 |
|---|---|---|
| 3 | 종류 필터 빈 상태가 다음 페이지 가능성을 무시 | `InboxTable.jsx` — `kindFilter` 이고 `hasMore` 면 `inbox.empty.kindMore`("불러온 목록에는 {kind} 건이 없습니다. '더 보기'로 다음 페이지를 확인하세요." / "No {kind} items in the loaded list. Use 'Load more' to check the next page."), 아니면 `inbox.empty.kind` |
| 4 | 고아 키 `approvalKind.filter.label`·`table.name`·`table.hint` | `filter.label` 은 `InboxKindFilter` 칩 줄을 감싼 `<div role="group" aria-label=…>` 로 사용. `table.name`·`table.hint` 는 `SettingsRows` 에 열 머리가 없어 삭제(`table.feature` 는 사용 중) |
| 5 | 옛 용어 | kr `request.approvalGroup.label` 승인 그룹→결재 그룹, `error.GROUP_NAME_CONFLICT` 같은 교정, `transition.rules.globalDisabled` 전역 정책→결재 공통 정책(en "global policy"→"common approval policy"). 같은 김에 kr `timesheet` 의 "예외 승인 그룹"(2곳)→"예외 결재 그룹". 이제 kr 에 "승인 그룹"·"전역 정책", en 에 "global policy" 잔존 0 |

테스트 추가: `InboxTable.test.jsx`(kindMore 문구), `InboxPage.test.jsx`(칩 줄 role=group·aria-label).
재검증: `cd static/ui && CI=true npx jest --runInBand` → **80 suites / 711 tests passed**. `CI=false npm run build` 성공(우리 코드 경고 0). 리포 루트 `npm run merge` 성공 — kr/en 키 집합 일치, 이번에 추가한 키는 모두 소비처 있음. 백엔드가 직접 읽는 `transition.json` 값이 바뀌어, 프론트 jest 가 끝난 뒤 백엔드 `npx jest src/resolver/transition src/domain/transition` 을 따로 돌려 171 tests 통과를 확인했다.
