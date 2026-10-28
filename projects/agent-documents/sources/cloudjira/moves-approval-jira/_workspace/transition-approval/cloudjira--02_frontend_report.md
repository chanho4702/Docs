# transition-approval 프론트 보고서 (Phase 4)

> frontend-engineer · 2026-10-03 · autopilot 무인 회차. 계약 원천은 `02_backend_report.md`(실제 shape), 설계는 `01_architect_design.md` §7·§8.
> `forge`·`git add/commit/mv/stash` 실행 안 함. 리포 밖 파일 수정 없음. `src/` 백엔드 로직 무변경.

## 결과 요약

| 검증 | 결과 |
|---|---|
| `npm run merge` | 통과(ko-KR.json / en-US.json 생성) |
| `npm run test:ui -- --runInBand` | **27 suites / 203 tests 통과** (기준선 20 / 161 → +7 suites / +42 tests) |
| `npm run build:ui` | 통과("Compiled with warnings" — node_modules 의 source map·postcss-calc 경고만, 기존과 같음. 우리 코드 eslint 경고 없음) |
| `npm test -- --runInBand`(루트) | **64 suites / 866 tests 통과** — 백엔드 보고서 수치와 같음(회귀 없음) |

## 1. 변경 파일

**신규**
- 엔트리: `static/ui/src/entries/issue.jsx`, `static/ui/public/issue.html`
- 화면: `static/ui/src/features/transition/{transitionModel.js, transitionApi.js, UsabilityLozenge.jsx, TransitionTargetRow.jsx, TransitionApprovalList.jsx, TransitionLatestProgress.jsx, TransitionRequestForm.jsx, TransitionTargetHeader.jsx, TransitionRuleSettings.jsx, TransitionRuleFormModal.jsx}`
- 테스트: `static/ui/src/features/transition/__test__/{transitionModel.test.js, TransitionApprovalList.test.jsx, TransitionRequestForm.test.jsx, TransitionRuleSettings.test.jsx, TransitionRuleFormModal.test.jsx, transitionI18n.test.js}`, `static/ui/src/features/certificate/__test__/CertificateSheet.test.jsx`

**변경**
- 엔트리 3곳: `static/ui/craco.config.js`(ENTRIES `issue`), `manifest.yml`(`resources[0].entry.issue` + 모듈 3 — 아래 §2), `static/ui/public/issue.html`
- `static/ui/src/entries/modal.jsx` — `ApprovalModalFlow`(기존 흐름 분리, 동작 무변경) + `TransitionModalFlow`(transitionPick → transitionRequest/detail, 같은 모달 안 전환) + ISSUE_TRANSITION 재요청 분기 + `TRANSITION_STATE_CHANGED` 시 상세 재조회 + 결정 뒤 `transitionKeys.all` 무효화
- `static/ui/src/entries/projectSettings.jsx` — 정적 안내 → `TransitionRuleSettings`(안내는 상단 두 줄로 축약)
- `static/ui/src/utils/queryKey/approvalKeys.js` — `transitionKeys { all, issue(issueId), rules(projectId) }`
- `features/detail/ApprovalDetail.jsx` — ISSUE_TRANSITION 헤더 줄(`TransitionTargetHeader`), CONSUMED 이벤트 배지·색, 사유 문구(ISSUE_STATE_CHANGED·ISSUE_DELETED·TRIGGER·LAZY·VALIDATOR_CHANGELOG)
- `features/inbox/InboxTable.jsx`·`exportInboxExcel.js` — 유형 `ISSUE_TRANSITION`, 제목 아래 "출발 → 목적", 엑셀 열 `inbox.column.transition`
- `features/inbox/InboxTable.test.jsx` — 케이스 1 추가
- `features/notification/NotificationPanel.jsx`(+ `.test.jsx`) — `notificationTitle` export: 전환 행 `{title}` = "제목 · 출발 → 목적"
- `features/certificate/CertificateSheet.jsx`·`exportCertificatePdf.jsx` — 최상위 `transition` 블록(전환·사용 시각·사용자), 대상 종류 라벨
- `features/settings/PolicySettings.jsx` — `commentNotifyEnabled`·`transitionApprovalEnabled` 체크박스(기본 켬)
- `features/settings/ProjectPolicyModal.jsx` — `commentNotifyEnabled` 덮어쓰기 라벨(서버 overridableKeys 로 노출)
- `features/request/RequestForm.jsx` — `CcPicker` 를 export 만(전환 요청 폼이 재사용)
- 로케일(kr·en 같은 키): `transition.json`(키 13개 추가, `rules.guide.classic` 의 `**` 마크다운 제거), `notification.json`(3), `policy.json`(4), `cert.json`(3), `inbox.json`(2), `detail.json`(1), `state.json`(2), `project.json`(`placeholder.body`·`hint` 문구 수정) → `npm run merge`
- `_workspace/transition-approval/04_spike_todo.md`(X27~X31), `_workspace/QUESTIONS.md`(Q64·Q65)

## 2. 엔트리·manifest

- 엔트리 `issue` 3곳 동시: craco ENTRIES `issue: 'entries/issue.jsx'` · `public/issue.html` · manifest `entry.issue: issue.html`.
- manifest 모듈(설계 §6.1 그대로, 백엔드가 넣은 validator·trigger·function 무변경):
  - `jira:issueAction` 기존 목록에 `transition-approval-action`(`resource: main/modal`, `viewportSize: medium`, 조건 없음)
  - `jira:issueContext` `transition-approval-context`(`label: Approvals`, `resource: main/issue`)
  - `jira:issuePanel` `transition-approval-panel`(`icon: resource:main;logo.png`, `resource: main/issue`)
  - projectSettingsPage 주석을 "규칙 관리"로 갱신, workflowValidator 주석의 "프론트 회차에서 붙인다" 문장을 현재 상태로 갱신
- js-yaml 파싱 확인(issueAction 키 `worklog-log-action`, `transition-approval-action` / entry 6개). `forge lint` 미실행(금지) — 키 이름은 X18.

## 3. 소비한 resolver 와 접근 경로 (전부 `invokeApproval` → `content`)

| resolver | 화면 | 읽는 경로 | 쿼리키 / 무효화 |
|---|---|---|---|
| `getIssueTransitionApprovals({issueId})` | `TransitionApprovalList`(issue 엔트리·모달 transitionPick), `TransitionRequestForm` | `issue.{issueKey,statusName,projectId}`, `enforced`, `notEnforcedReason`, `targets[].{toStatusId,toStatusName,transitions[0].transitionId,flow,latest.requestId,latest.status,usability,canRequest}`, `history[].{requestId,usability,fromStatusName,toStatusName,createdAt}` | `transitionKeys.issue(issueId)` — 요청 성공·실패(ALREADY_APPROVED·ALREADY_OPEN·NOT_AVAILABLE·RULE_NOT_FOUND) 후 무효화, issue 엔트리는 모달 `onClose` 에서 무효화 |
| `createTransitionApproval` | `TransitionRequestForm` | 보냄: `{issueId, toStatusId, transitionId?, requestMessage?, expiresAt?(사용자가 고친 경우만), ccKeys?}` — **steps·flowId 안 보냄**(Q56). 받음: `requestId` | 성공 시 `transitionKeys.issue` + `approvalKeys.all` |
| `listTransitionRules({projectId})` | `TransitionRuleSettings`·`TransitionRuleFormModal` | `project.style`, `globalEnabled`, `projectEnabled`, `rules[]`(`issueTypeId '*'`, `issueTypeName/toStatusName/flowName` null → "Jira 에서 찾을 수 없음", `flowMissing`, `openCount`, `rev`), `issueTypes`, `statuses[].issueTypeIds`, `flows` | `transitionKeys.rules(projectId)` |
| `saveTransitionRule` | `TransitionRuleFormModal` | 보냄: 생성 `{projectId, issueTypeId, toStatusId, flowId, enabled}` / 편집 + `ruleId, rev`. 받음: `content.rule` | 저장 뒤 `transitionKeys.rules` |
| `deleteTransitionRule` | `TransitionRuleSettings` | 보냄 `{projectId, ruleId, rev}`. 확인 문구의 `{count}` 는 **그 규칙의 `openCount`**(규칙별 — 백엔드 차이 3) | 성공·실패 모두 `transitionKeys.rules` |
| `getApprovalDetail` | 모달 상세, issuePanel 순서표(`TransitionLatestProgress`, 지연 청크) | `target.kind === 'ISSUE_TRANSITION'` 이면 `target.transition`(null 가능 — 줄 생략), 재요청은 `target.transition.toStatusId` 없으면 `target.key` `<issueId>:<toStatusId>` 파싱 | `approvalKeys.detail(requestId)` |
| `getApprovalCertificate` | `CertificateSheet` | **최상위 `transition`**(`fromStatusName,toStatusName,transitionName,consumedAt,consumedBy`). `target.transition` 은 읽지 않는다(항상 null — 차이 2) | — |
| `listInbox` | `InboxTable`·엑셀 | `items[].transition`(비전환 행 null — 차이 4) | 기존 |
| `listNotifications` | `NotificationPanel` | `templateKey`(transition* 3종), `items[].transition`(null 가능) | 기존 |
| `getApprovalSettings`/`saveApprovalSettings` | `PolicySettings` | `commentNotifyEnabled`, `transitionApprovalEnabled` | `settingsKeys.policy()` |
| `getProjectPolicy`/`saveProjectPolicy` | `ProjectPolicyModal` | `overridableKeys` 에 `commentNotifyEnabled` 가 오면 라벨로 노출(`transitionApprovalEnabled` 는 GLOBAL_ONLY 라 안 옴) | 기존 |
| `decideApproval`/`bulkApprove` | 모달·업무함 | `error.code === 'TRANSITION_STATE_CHANGED'` → 상세 재조회(모달), 일괄은 기존 `results[].code` 표시 경로가 `error.TRANSITION_STATE_CHANGED` 문구를 그린다 | — |

에러 분기는 전부 `error.code`. 문구는 `t(\`error.${code}\`)`.

### 백엔드 실제 shape 차이 6건 반영

1. 응답은 `content` 아래 — `invokeApproval` 이 벗긴 값을 읽는다(`res.content.content` 이중 접근 없음, 테스트가 `invokeApproval` 반환값=content 로 고정).
2. 증명서 `target.transition` 은 항상 null → 최상위 `data.transition` 만 읽는다(`CertificateSheet.test.jsx`).
3. `openCount` 는 rule_id 별 → 규칙 행·삭제 확인 문구가 그 규칙의 값을 쓴다.
4. 업무함·알림 `transition` 은 비전환 행 null → `transitionLabel(null) === null` 이면 줄·접미사를 생략(테스트 2곳).
5. `listTransitionRules` 미준비 시 `rules: []` → 빈 표 문구 `transition.rules.empty`. 저장·삭제의 `STORAGE_NOT_READY` 는 `error.STORAGE_NOT_READY` 문구.
6. 코멘트에 업무함 링크 없음(X24) — 프론트 영향 없음(서버 문구 `server.comment.open` 키는 남겨 둠).

## 4. 화면

- **issue 엔트리**(`entries/issue.jsx`): `extension.type` 으로 compact(issueContext)/full(issuePanel). 목적 상태 행 = "→ 상태" + usability 배지 + [승인 요청]/[상세]/안내(지금 전환 가능·결재선 없음·전환 불가). full 은 결재 중 요청의 순서표(`ApprovalStepper` 재사용, `importWithReloadOnce` 지연 청크)와 최근 이력. 요청·상세는 `new Modal({resource:'main/modal'})`, onClose 에서 `transitionKeys.issue` 무효화. 높이는 내용 — 100vh 없음.
- **모달**: ••• 메뉴(`transition-approval-action`) → 목록(full) → 같은 모달 안에서 요청 폼/상세로 전환. 이슈 엔트리가 넘긴 `intent:'transitionRequest'` 는 바로 폼. 그 외 진입(업무함 detail 등)은 기존 흐름 그대로(Q1 의 `getIssueApproval` 경로도 무변경).
- **요청 폼**: 결재선은 `FlowPreview`(RequestForm 의 것) 읽기 전용 + "결재선은 프로젝트 규칙이 정합니다", 전환이 둘 이상이면 선택, 마감(Flow 기본값 표시 — 고치지 않으면 미전송), 참조(`CcPicker` 재사용), 메시지 500자.
- **규칙 화면**(프로젝트 설정): 표(유형·목적 상태·결재선·사용·진행 중) + 추가/편집 모달(유형 → 그 유형의 상태로 좁힘 → Flow) + 삭제 확인. 수용 기준 문장 `transition.rules.guide.acceptance` 를 상단 안내에 고정, company/team-managed 별 부착 안내, 전역 해제·프로젝트 꺼짐 경고.
- **상세·업무함·알림·증명서·정책**: §1 변경 목록 참조.
- 재사용: `CommonTable`, `ModalLayout`/`SectionLabel`, `ApprovalStepper`, `FlowPreview`·`CcPicker`(RequestForm), `ApprovalSkeleton`. `ApprovalLineEditor` 는 편집기라 쓰지 않았다(결재선 고정 — 읽기 전용 미리보기가 맞다).

## 5. 추가 i18n 키 (kr·en 동시, 자리표시 `{name}` 관례)

- `transition.*`: `list.empty`, `list.progress`, `form.transition`, `form.line`, `rules.form.required`, `rules.noFlows`, `rules.guide.acceptance`, `rules.empty`, `rules.deleteTitle`, `consumeSource.{TRIGGER,LAZY,VALIDATOR_CHANGELOG}` + `rules.guide.classic` 수정
- `notification.template.{transitionApproved,transitionStateChanged,transitionIssueDeleted}` — `{actor}`·`{title}`(프론트가 "제목 · 출발 → 목적" 으로 채움)
- `policy.{commentNotifyEnabled,transitionApprovalEnabled}`, `policy.audit.area.transitionRule`, `policy.audit.action.save`(설정 이력 action `save` — 기존 사전에 없던 값)
- `cert.{transition,consumedAt}`, `cert.target.issue_transition`
- `inbox.column.transition`, `inbox.type.issue_transition`
- `detail.event.consumed`, `state.expiry.{ISSUE_STATE_CHANGED,ISSUE_DELETED}`
- `project.placeholder.body`, `project.hint` 문구 수정(이제 강제 지점이 있다 — Q58)
- `error.TRANSITION_*` 6개는 백엔드가 이미 넣음(확인만). `transitionI18n.test.js` 가 화면 리터럴 키 + 서버 templateKey + `ErrorCodes` 의 `TRANSITION_*` 를 두 언어 원본 사전에 대조한다.

## 6. 번들(설계 §7.4)

`npm run build:ui` 기준(gzip):
- `issue` 고유 JS `issue.*.js` **6.3KB**. HTML 초기 로드 전체는 공유 청크 포함 약 **206KB / 8파일**(최대 공유 청크 5509 ≈ 92KB — `@atlaskit/button` 이 끄는 feature-gate·statsig·top-layer, 697 ≈ 79KB — react/react-dom). 참고: worklog 90KB(본문 전부 지연), modal 279KB, projectSettings 347KB.
- 순서표(`TransitionLatestProgress`)는 별도 청크(full 에서만 요청). 요청 폼은 modal 엔트리의 지연 청크.
- 상시 로드 비용 실측은 X30.

## 7. 미검증 (`04_spike_todo.md` X27~X31 추가)

X27 issueContext `extension.type` 값(compact 판정) · X28 issueAction 모달의 moduleKey 위치 · X29 issueContext/issuePanel 에서 연 Modal 의 onClose · X30 issue 엔트리 첫 로드 크기 · X31 projectSettingsPage `extension.project.id`. 기존 X11(이슈 모듈 컨텍스트)·X17(프로젝트 관리자 가드)·X18(manifest 키)이 이 화면들의 전제다.

## 8. 제품 질문 (QUESTIONS.md, 기본 가정으로 진행)

- Q64 issuePanel 을 issueContext 와 함께 둘 것인가 — 기본: 둘 다(패널은 사용자가 펼칠 때만 로드)
- Q65 전역 "전환 승인 강제" 끄기에 확인 단계 — 기본: 없음(다른 정책과 같은 저장)

## 9. 백엔드에 요청 / 발견 (고치지 않음)

- **없음(필수)**. 화면 요구는 현재 shape 로 다 채웠다.
- 선택: 증명서 이력 표의 `reason` 열은 기존처럼 원시 값(`TRIGGER` 등)을 찍는다 — 상세 타임라인은 번역하지만 증명서는 기존 동작을 유지했다(범위 밖). 필요하면 다음 회차에 증명서도 사유 번역.
- 선택: `getIssueTransitionApprovals` 의 `targets[]` 에 결재선 사용자 표시 이름은 없어 `FlowPreview` 가 `resolveUsers` 를 1회 더 부른다(기존 요청 폼과 같은 비용).

## 재작업 회차

- 1회차(2026-10-03): 최초 구현.
