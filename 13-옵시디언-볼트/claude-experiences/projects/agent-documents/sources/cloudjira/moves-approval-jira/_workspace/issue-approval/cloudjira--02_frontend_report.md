# issue-approval 프론트 보고서 (Phase 4)

> 작성: frontend-engineer · 2026-10-04 · autopilot 무인 회차. 입력: `01_architect_design.md`(§2·§7·§8·§11.2), `02_backend_report.md`(실제 shape, D1~D9 — 설계와 다르면 백엔드 우선), `04_spike_todo.md`, QUESTIONS Q81~Q89(전부 기본 가정).
> 금지 준수: `forge` 명령·`git add/commit/push/mv/stash` 미실행, `src/` 백엔드 무변경, 리포 밖 무변경, **엔트리 3곳(craco ENTRIES·public html·manifest resources) 무변경** — 새 엔트리가 필요 없다.

## 결과 요약

| 검증 | 결과 |
|---|---|
| `npm run merge` | 통과(`locales/ko-KR.json`·`en-US.json` 생성, 두 언어 키 집합 일치) |
| `CI=true npm run test:ui -- --runInBand` | **35 suites / 284 tests 통과**(백엔드 Phase 기준 31 / 240 → +4 suites / +44 tests) |
| `npm run build:ui` | 통과. issue 엔트리 `issue.*.js` 22.3KB(**7.7KB gz**, X30 기준 6.3KB gz 대비 +1.4KB), modal 엔트리 84.5KB(25.1KB gz). 번들 예산 설정 없음. "Compiled with warnings" 는 전부 node_modules 기존 경고(`@atlaskit/analytics-next-stable-react-context` 소스 맵 누락, `@atlaskit/react-select` CSS postcss-calc) — 우리 소스 경고 0 |
| `npm test -- --runInBand`(백엔드) | **79 suites / 1050 tests 통과**(validator 문구 테스트 `TransitionValidatorService.test.js` 는 사전에서 값을 읽어 바뀐 문구로도 녹색) |

## 1. 변경 파일

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `static/ui/src/features/issueApproval/issueApprovalModel.js` | 순수 모델: `isChanged`·`generalSummaryOf`(7 state + actions)·`changedFieldsText`·`changedLozengeKey`·`actionLabelKey`·`staleNoticeKind`·`issueChangeNotice` |
| 신규 | `static/ui/src/features/issueApproval/IssueGeneralApprovalSection.jsx` | 일반 승인 칸(`getIssueApproval`, `approvalKeys.issue`). compact 는 주 버튼 하나, full 은 진행 단계·수정 시각·바뀐 항목·버튼 전부. 오류는 이 칸만 |
| 신규 | `static/ui/src/features/issueApproval/IssueApprovalOverview.jsx` | 일반 칸 + 기존 `TransitionApprovalList`. `showHints` 면 종류 선택 화면 설명 |
| 신규(테스트) | `features/issueApproval/__test__/issueApprovalModel.test.js` | F1 + F5 |
| 신규(테스트) | `features/issueApproval/__test__/IssueApprovalOverview.test.jsx` | F2 |
| 신규(테스트) | `features/issueApproval/__test__/ApprovalDetailIssueChange.test.jsx` | F4(ApprovalDetail 실렌더) |
| 신규(테스트) | `features/issueApproval/__test__/issueApprovalI18n.test.js` | 화면·서버 키 두 언어 대조, validator 문구 메뉴 이름 |
| 변경 | `static/ui/src/entries/issue.jsx` | `TransitionApprovalList` → `IssueApprovalOverview`. 일반 칸 요청·재상신은 `openModal({intent})`, 상세는 `{intent:'detail', requestId}`. `onClose` 무효화(`transitionKeys.issue` + `approvalKeys.all`) 기존 그대로 |
| 변경 | `static/ui/src/entries/modal.jsx` | `OverviewModalFlow`(종류 선택 → 일반 `ApprovalModalFlow` / 전환 `TransitionRequestForm` 을 같은 모달 안에서 전환, 폼 취소는 종류 선택으로 복귀). `ApprovalModalFlow` 에 `onBack` prop, 요청 폼 오류 `ALREADY_OPEN`·`RESUBMIT_NOT_ALLOWED` → 쿼리 무효화 후 상세로(오류 문구는 상세 상단) |
| 변경 | `static/ui/src/features/transition/transitionModel.js` | `resolveModalTarget`: issueAction 진입·intent 없음 → `{flow:'overview', issueId}`(이전엔 transition/transitionPick). `transition*` intent 는 그대로 transition |
| 변경 | `static/ui/src/features/transition/__test__/transitionModel.test.js` | F3 — 위 분기 기대값 갱신 + 일반 intent 케이스 |
| 변경 | `static/ui/src/features/detail/ApprovalDetail.jsx` | `staleNoticeKind` 로 먼저 분기: `changeSinceRequest` 가 있으면 새 경고(또는 아무것도), null 이면 기존 리비전 분기. 기존 `pendingStale` 변수 제거 |
| 변경 | `static/ui/src/features/request/RequestForm.jsx` | 상단 `issueApproval.form.kindHint`(information), `onError` prop(호출부가 처리하면 폼에 오류를 다시 그리지 않음) |
| 신규 | `locales/{kr,en}/issueApproval.json` | §3 키 |
| 변경 | `locales/{kr,en}/error.json` | `ISSUE_APPROVAL_PROJECT_DISABLED`, `RESUBMIT_NOT_ALLOWED` |
| 변경 | `locales/{kr,en}/notification.json` | `template.issueDeleted` |
| 변경 | `locales/{kr,en}/transition.json` | `server.validator.REJECT_NO_REQUEST` 값 — 메뉴 이름 `"Request approval"` > 상태 변경 승인 / Transition approval |
| 생성물 | `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 결과(직접 수정 안 함) |
| 변경 | `_workspace/issue-approval/04_spike_todo.md` | I15~I18 추가 |

## 2. 소비한 resolver ↔ 실제 shape 대조 (`invokeApproval` 이 `content` 를 벗긴 값)

| resolver | 호출 위치 | 소비 필드 | 백엔드 보고서 근거 | 비고 |
|---|---|---|---|---|
| `getIssueApproval({issueId})` | `IssueGeneralApprovalSection`(issue 엔트리·종류 선택), `ApprovalModalFlow`(기존) | `approval`(null 가능), `canRequest`, `notAvailableReason`, `approval.{requestId,status,statusLabelKey,currentStepOrder,stepCount,canResubmit,changeSinceRequest}` | §2.2 | `notAvailableReason:'PROJECT_DISABLED'` 일 때만 안내(D3·D4 — 조회 실패·진행 중·권한 없음은 null 이라 문구 없음, 버튼은 `canRequest` 만 따른다) |
| `getApprovalDetail({requestId})` | `ApprovalModalFlow` → `ApprovalDetail` | `approval.changeSinceRequest`(모든 종류에 키, 값 null 가능), `isStale`, `canResubmit`, `requestedContentVersion`, `contentVersion` | §2.2, D2 | **`changeSinceRequest` 분기를 먼저**: ISSUE `isStale:true`+`contentVersion:null` 에서 "v0→v" 문구가 나오지 않음(테스트) |
| `ChangeSince` | 모델 `isChanged`·`changedFieldsText`·`issueChangeNotice` | `checked`,`changed`,`changedAt`(null 가능),`fields[].name`,`truncated` | §2.2, D6 | `checked:false` 는 수정 아님. `changed:true`+`changedAt:null`+`fields:[]`+`truncated:true` → "변경 이력이 길어 바뀐 항목을 모두 확인하지 못했습니다." + 안내, 자리표시 잔존 없음(테스트). `basis`·`since` 는 화면에서 쓰지 않음(상태로 PENDING/APPROVED 를 가른다) |
| `createIssueApproval({issueId, steps, flowId?, requestMessage?, expiresAt?, ccKeys?, supersedes?})` | `RequestForm`(기존 payload 그대로) | 응답 `requestId` | §2.3 | 재상신 = `supersedes: approval.requestId`(intent `resubmit`). 승인됨 뒤 새 요청은 `supersedes` 없이(서버가 이전 회차 자동 연결). 오류 `ISSUE_APPROVAL_PROJECT_DISABLED` → 폼 상단 `error.{code}`, `ALREADY_OPEN`·`RESUBMIT_NOT_ALLOWED` → 재조회 후 상세 |
| `cancelApproval` | `DecisionForm`(무변경) | — | §2.4, D8 | `PERMISSION_TARGET_VIEW_DENIED` 는 기존 `error.{code}` 출력 |
| `getIssueTransitionApprovals({issueId})` | `TransitionApprovalList`(무변경) | 무변경 | — | 일반 칸과 다른 쿼리키 `transitionKeys.issue` |
| `listNotifications` | `NotificationPanel`(무변경) | `templateKey:'notification.template.issueDeleted'`, `{title}` | §2.5 | 문구에 `{title}` 사용 — 패널이 대상 제목을 채운다(기존 템플릿과 같은 방식) |

에러 분기는 전부 `error.code`. 문자열 비교 없음.

### 설계와 다른 점(프론트)

| # | 차이 | 이유 |
|---|---|---|
| F-D1 | `ChangedLozenge.jsx` 별도 파일을 만들지 않고 섹션 안 `Lozenge` + `changedLozengeKey` 로 | 쓰는 곳이 한 곳 |
| F-D2 | 상세 경고 문구를 설계 §8.1 의 한 문장(`{time}`·`{fields}` 자리표시 포함) 대신 **줄 단위 조합**(`detail.changedAt`·`changed.fields`·`changed.unknownFields`·`detail.changedPending/Approved`) | D6(`changedAt:null`·`fields:[]`) 조합에서 자리표시가 남거나 "()" 가 생기지 않게 |
| F-D3 | APPROVED 수정됨 제목을 기존 `state.pill.reapproval` 대신 `issueApproval.detail.changedApprovedTitle` | ISSUE 는 재승인 강제가 아니라 표시만(Q84) — 문구가 그 의미에 맞게 |
| F-D4 | 키 추가: `section.newRequest`(승인됨·반려 뒤 버튼), `section.progress`, `overview.general`·`overview.transition`(종류 선택 칸 제목) | 화면 구성상 필요 |
| F-D5 | 승인됨(수정 없음)에서도 서버 `canRequest` 면 full 레이아웃에 "새로 요청" 보조 버튼 | 서버 판단을 다시 계산하지 않는다는 원칙. compact 는 주 버튼(상세) 하나 |

## 3. i18n 키

`locales/{kr,en}/issueApproval.json`(신규):
`section.{title,none,request,newRequest,detail,resubmit,projectDisabled,loadFailed,progress}`,
`changed.{pending,approved,fields,more,truncated,unknownFields}`,
`detail.{changedPendingTitle,changedApprovedTitle,changedAt,changedPending,changedApproved}`,
`form.kindHint`, `overview.{title,general,transition,generalHint,transitionHint}`.

기존 네임스페이스(D1 4건): `error.ISSUE_APPROVAL_PROJECT_DISABLED`, `error.RESUBMIT_NOT_ALLOWED`, `notification.template.issueDeleted`, `transition.server.validator.REJECT_NO_REQUEST`(값만, kr·en).
대조 테스트 `issueApprovalI18n.test.js` 가 화면 리터럴 키·서버 키·`ErrorCodes` 신규 2개·validator 메뉴 이름을 두 언어로 검증한다.

## 4. 화면 동작 요약

- **이슈 우측 요약(compact)**: "검토·결재" 라벨 → 상태 배지(또는 "진행 중인 결재가 없습니다.") + "요청 이후 수정됨"/"승인 이후 수정됨" 배지 + 주 버튼 하나, 그 아래 "전환 승인" 라벨 + 기존 목록.
- **이슈 패널(full)**: 위 + 진행 단계, 마지막 수정 시각, 바뀐 항목(3개 + "외 n"/"등"), 버튼 전부.
- **버튼**: 요청 없음 → 승인 요청(서버 `canRequest`) / 진행 중 → 상세, 수정됨이고 서버 `canResubmit`(=요청자) 이면 다시 상신이 주 버튼(Q82·Q89) / 승인 이후 수정됨 → 새로 요청 + 상세(Q84) / 반려·만료·회수 → 새로 요청(가능할 때) + 상세.
- **••• > Request approval**: 종류 선택 화면(일반 칸·전환 칸 + 설명) → 같은 모달 안에서 일반 폼·상세 또는 전환 폼. 폼 취소 → 종류 선택으로.
- **상세**: ISSUE 수정됨이면 경고(시각·항목·안내), 요청자에게 다시 상신 버튼(기존 `canResubmit` 버튼 재사용).

## 5. 테스트 목록

| # | 파일 | 케이스 |
|---|---|---|
| F1 | `issueApprovalModel.test.js` | 7 state × 버튼 10케이스, canResubmit 없으면 재상신 없음(Q89), PROJECT_DISABLED, checked=false 는 수정 아님, 깨진 입력, 문구 키, 필드 라벨(3개·외 n·등·이름 없음 null) |
| F3 | `transitionModel.test.js` | ••• 진입 → overview(moduleKey 있음/없음), request·resubmit → approval, transitionPick → transition |
| F2 | `IssueApprovalOverview.test.jsx` | **같은 이슈 일반 PENDING(수정됨) + 전환 USABLE → 각 칸이 자기 상태만**, invoke 2종 이름·인자·횟수, 재상신·상세 콜백 인자, compact 주 버튼 하나, 일반 실패 시 전환 정상·역방향, PROJECT_DISABLED 안내·버튼 없음, 요청 가능·설명 |
| F4 | `ApprovalDetailIssueChange.test.jsx` | PENDING 수정됨 새 경고(리비전 문구 없음), APPROVED 수정됨, D6 조합, isStale 이지만 수정 아님 → 경고 없음, null(다른 종류) → 기존 분기, 재상신 버튼은 canResubmit 일 때만 |
| F5 | `issueApprovalModel.test.js` | `approvalKeys.issue('1')[0] !== transitionKeys.issue('1')[0]` |
| — | `issueApprovalI18n.test.js` | 키 대조 3 |

## 6. 미검증 (`04_spike_todo.md` I15~I18 추가)

- **I15** ••• 메뉴 모달 `viewportSize: medium` 안의 일반 요청 폼 폭(이슈 엔트리에서는 large 로 연다).
- **I16** compact 두 칸 높이·번들 7.7KB gz(I7 확장).
- **I17** ••• 메뉴 모달(Jira 가 연 모달)에서 요청한 뒤 이슈 요약 갱신 — `onClose` 훅이 없어 `refetchOnWindowFocus` 에 기댐.
- **I18** `fields[].name` 원문 표시의 locale 혼재(I8 연동).

## 7. 새 질문

없음. Q81~Q89 기본 가정을 그대로 따랐다(Q89 — 재상신 버튼은 수정됨 + 서버 `canResubmit` 일 때만).

## 8. 백엔드 요청

없음(필수 아님). 참고: 이슈 요약에 "요청 시각"을 넣으려면 `ApprovalContent` 에 `createdAt` 이 있으면 편하다(지금은 `events` 에서 구해야 함) — 이번 화면에는 넣지 않아 요청하지 않는다.

## 재작업 회차

| 회차 | 날짜 | 내용 |
|---|---|---|
| 1 | 2026-10-04 | 최초 구현 |
