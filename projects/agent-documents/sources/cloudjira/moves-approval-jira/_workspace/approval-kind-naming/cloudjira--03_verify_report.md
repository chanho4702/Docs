# 검증 리포트 (회차 1) — approval-kind-naming

검증: 2026-10-12 integration-verifier. 기준 = `01_architect_design.md` + 실제 소스. 보고서 수치는 직접 다시 실행해 확인했다.
범위 판정: 설계서 작성(16:57) 이후 수정된 파일을 이번 작업분으로 봤다. 이후 `src/`·manifest·craco·public 수정 0건.

## 요약  통과 13 / 실패 3 / 미검증 5

## 실패

1. **[static/ui/src/features/inbox/InboxTable.jsx:251-254 · locales/{kr,en}/inbox.json `empty.kind`] 종류 필터가 클라이언트 필터라는 한계가 빈 상태 문구에 안 드러난다** (담당: frontend)
   - 종류 필터는 받은 페이지(50건)만 거른다(`InboxPage.jsx:264` `filterByKind(items, filters.kind)`). 그런데 빈 상태 머리는 단정형 "`{kind} 건이 없습니다.`" / "No {kind} items." 이고 설명은 일반 `inbox.empty.help` 다. `CursorPagingTable.jsx:39` 는 행 0건이어도 `hasMore` 면 "더 보기"를 같이 그린다 → "타임시트 승인 건이 없습니다" 아래에 "더 보기"가 붙고, 다음 쪽에 실제로 있을 수 있다. 02 보고서 §2.4 에 한계로 적혔지만 화면 문구에는 반영되지 않았다.
   - 재현: 첫 쪽 50건이 모두 ISSUE 이고 `hasMore=true` 인 `listInbox` 목으로 `?kind=TIMESHEET` 진입 → "타임시트 승인 건이 없습니다." + `inbox-load-more` 동시 표시.
   - 고치는 방법: `kindFilter && hasMore` 일 때 별도 키(예 `inbox.empty.kindPartial` "불러온 목록에는 {kind} 건이 없습니다. 더 보기로 이어서 찾아보세요.")를 쓰고, 칩 줄 옆에도 "불러온 목록에서만 거릅니다" 류 한 줄을 둔다. kr/en 동시 + merge.

2. **[locales/{kr,en}/approvalKind.json:20,24,25] 고아 키 3개 — `approvalKind.filter.label`, `approvalKind.table.name`, `approvalKind.table.hint`** (담당: frontend)
   - 비테스트 소스 소비처 0(리터럴·동적 접두 모두 없음). 보고서의 "고아 키 0"과 다르다. `filter.label` 은 칩 줄 그룹 이름으로 의도된 듯한데 `InboxKindFilter.jsx` 의 `Inline` 에 `role="group"`·`aria-label` 이 없다(동류 `CertFilterBar.jsx:11` 은 있음).
   - 재현: `grep -rF "approvalKind.filter.label" static/ui/src src --include=*.js --include=*.jsx`(테스트 제외) → 0건, `table.name`·`table.hint` 동일.
   - 고치는 방법: `InboxKindFilter` 에 `role="group" aria-label={t('approvalKind.filter.label')}` 를 붙이고, `table.name`·`table.hint` 는 `ApprovalKindTable` 이 머리로 쓰지 않으면 삭제.

3. **[용어 잔존 — 경미] 옛 이름이 kr 문구에 남아 있다** (담당: frontend)
   - `locales/kr/request.json:75` `request.approvalGroup.label` "승인 그룹"(결재선 편집기·결재자 검색 대화상자 `ApprovalLineEditor.jsx:83`·`ApproverSearchDialog.jsx:92` 에 보임) — 설정 메뉴는 "결재 그룹".
   - `locales/kr/error.json:45` `GROUP_NAME_CONFLICT` "같은 이름의 승인 그룹이…".
   - `locales/kr/transition.json:60` `transition.list.globalDisabled` "전역 정책에서 상태 변경 승인이 해제돼 있습니다." — 메뉴는 "결재 공통 정책".
   - 보고서 §2.7 은 "승인 그룹·전역 정책" 같은 옛 이름을 같은 이름으로 맞췄다고 했다. en 은 "Approval groups"로 일관되어 문제없음.
   - 고치는 방법: 세 값을 "결재 그룹"/"결재 공통 정책"으로(키 무변경), merge. (`timesheet.json` 의 "예외 승인 그룹"은 별개 개념이면 유지.)

## 미검증
- 업무함 종류 열(14%)에서 영문 긴 이름("Worklog certification (legacy)") 줄바꿈·행 높이 — 실기기.
- 칩 줄이 좁은 폭에서 감기는 모양 — 실기기.
- 이슈 패널 세 칸 머리 설명 한 줄 추가로 인한 패널 높이 — 실기기.
- 알림 행 배지 + `[종류]` 접두 중복감 — 사용자 판단.
- Forge Modal 제목 "{종류} 상세" 표시 — 실기기.

## 통과

### 경계면 표
| 소비 | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| listNotifications 행 `targetKind`·`templateKey` | `NotificationService.js:268-275` `templateKey: notificationTemplate({kind, reason, targetKind})`(`notification.template.<name>`), `targetKind` 행에 실림 | `NotificationPanel.jsx:49-61` `vars.targetKind ?? item.targetKind` → `isApprovalKind` 일 때만 `notification.templateWithKind.<name>` + `vars.kind` | O |
| listInbox 행 `targetKind` | 기존 | `filterByKind`(`targetKind`/`target_kind`), `InboxTable` 배지, `exportInboxExcel.js:69,85-96` | O |
| getTimesheetContext `features` | feature-selection 선행분 | `enabledKinds(featureStateOfContext(...))` — `FEATURE_OF_KIND` 가 서버 `src/domain/settings/features.js:12-17` `FEATURE_BY_KIND` 와 동일 매핑(WORKLOG_* 는 null) | O |

### C. 용어 일관성
- `APPROVAL_KINDS` = `auditModel.TARGET_KINDS` 에서 파생(재정의 없음), 서버 `src/domain/approval/constants.js:59-66` `TargetKind` 6종과 같은 집합. **통과**
- `audit.approval.kind.*` 6개 값 = `approvalKind.label.*`(kr/en 모두 일치), `label`·`hint` 키 집합 동일. **통과**
- `inbox.type.*` 참조 0(`static/ui/src`·`src`·테스트 전부), 키도 삭제. **통과**
- 알림 `templateWithKind.*` kr/en 각 11개, 전부 `template.*` 에 짝 존재, 접두 외 placeholder 동일. `targetKind` 없음·미지면 원래 키로(`notificationMessageOf` 59행). 종류 전용 문장(transitionApproved·fieldChange*)은 목록 밖이라 접두 안 함. **통과**
- 업무함 종류 필터: URL `kind`(`parseInboxSearch` 가 6종 외 버림), `toInboxFilters` 미전송(서버 조회·카운트·쿼리키 불변), 칩 변경 시 선택 초기화, 내보내기도 같은 기준. 탭 전환·설정 이동 시 `kind` 는 지우지 않고 유지 — 기존 필터(q·statuses·project 등)와 같은 규칙(`setView` 가 필터를 건드리지 않음)이며 설계에 정리 요구 없음. 결함 아님으로 판정. **통과**
- 설정 네비 모듈(`settingsNavigation.js`)에 배지 미사용(설계 §8). **통과**

### D. i18n
- `npm run merge` 성공. kr/en 키 집합 차이 0. 변경 값의 placeholder 집합 HEAD 대비 변화 0(kr 140·en 120 값 변경), kr↔en placeholder 불일치 0. **통과**
- HEAD 대비 삭제 키 27개(선행 작업분 포함) 전부 소비처 0(리터럴·템플릿 접두 검색). 백엔드가 locales 를 직접 읽는 곳은 `TransitionCommentNotifier.js:7-8`·`TransitionValidatorService.js:15-16`(`transition.json` `server.*` 만) — 삭제 키 `transition.list.title` 은 무관, `server.validator.REJECT_NO_REQUEST` en 값만 "Status change approval"로 바뀜(placeholder 불변, 백엔드 jest 통과). **통과**
- 고아 키: 실패 2 참조.

### F. 범위
- `src/`·manifest·엔트리 3곳·쿼리키 무변경. resolver 호출 집합 HEAD 대비 증가는 `getFeatureOverview`(feature-selection 선행분, `PermissionMap.js:62`) 하나. **통과**
- `.settings-rows` CSS 이동: 정의 한 곳(`components/settings/settingsRows.css`), `appShell.css` 잔존 없음, 클래스 참조 3종이 CSS 와 일치, 설정 공용 `.settings-section`·`.settings-form` 규칙 유지. 이동 전 규칙과의 바이트 대조는 원본이 미커밋이라 불가(worklog-table 리포트 미검증 항목). **통과**

## 실행 결과
| 명령 | 결과 |
|---|---|
| `static/ui: CI=true npx jest --runInBand` | 80 suites / 709 tests passed, EXIT 0 |
| 루트 `npx jest`(UI 종료 후 단독) | 157 suites / 2460 tests passed, EXIT 0 |
| 루트 `npm run merge` | 성공(`ko-KR.json`·`en-US.json` 생성) |
| `static/ui: CI=false npm run build` | 성공, 경고는 node_modules 3건뿐, 우리 코드 0 |
| `npm run check:bundle` | `[bundle-check] OK` |
| testId 삭제(HEAD literal 대비) | 이 작업분 0건 |
