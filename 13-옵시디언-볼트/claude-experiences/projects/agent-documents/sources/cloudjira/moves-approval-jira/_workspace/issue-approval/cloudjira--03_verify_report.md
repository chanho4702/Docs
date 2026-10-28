# issue-approval 검증 리포트 (회차 1)

> 작성: integration-verifier · 2026-10-04 · autopilot 무인 회차(Phase 5). 기준: `01_architect_design.md` 계약, `02_backend_report.md`(D1~D9), `02_frontend_report.md`(F-D1~D5), 실제 소스·`git diff`.
> 금지 준수: `forge` 명령·`git add/commit/push/stash/mv`·브랜치 조작 없음. 소스 수정 없음(필수 수정 0건).
> 참고: 작업 트리에는 직전 기능 worklog-history 의 미커밋 변경도 함께 있다(asApp 추가·v031/v032·manifest 스케줄 트리거 등). 이번 검증 범위는 issue-approval 변경분이고, 테스트·빌드는 트리 전체로 돌렸다.

## 판정: **PASS**

## 요약  통과 34 / 실패 0 / 미검증 18(I1~I18, 전부 플랫폼 실측 — 기존 목록, 추가 없음)

## 실패
없음.

## 실행 결과 (직접 재실행 — 보고서 수치를 믿지 않고 확인)

| 명령 | 결과 |
|---|---|
| `npx jest` (루트, 백엔드) | **79 suites / 1050 tests 통과** (7.2s). `permissionMap.contract.test.js` 포함 |
| `npm run merge` | 통과. 생성된 `locales/ko-KR.json`·`en-US.json` 이 실행 전과 바이트 동일(프론트 Phase 의 merge 결과가 최신) |
| `CI=true npm run test:ui -- --runInBand --watchAll=false` | **35 suites / 284 tests 통과**, exit 0 |
| `npm run build:ui` | 통과(exit 0). `issue.*.js` 7.67KB gz, `modal.*.js` 25.03KB gz. "Compiled with warnings" 는 node_modules 소스맵 누락(`@atlaskit/analytics-next-stable-react-context`)뿐, 우리 소스 경고 0 |

## 경계면 표 (생산자 ↔ 소비자)

| resolver / 값 | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getIssueApproval` → `{approval, target, canRequest, notAvailableReason, pin?}` | `ApprovalService.js:361-372` → `viewForTarget` `:295-331` (무요청 시 `{approval:null, target, canRequest, notAvailableReason}`) | `IssueGeneralApprovalSection.jsx` `invokeApproval('getIssueApproval',{issueId})` → `generalSummaryOf(query.data)`(`view.approval`·`view.canRequest`·`view.notAvailableReason`), `modal.jsx` `ApprovalModalFlow` | 일치. `.content` 이중 접근 없음(`invokeApproval` 이 벗김) |
| `approval.changeSinceRequest` `{checked,basis,since,changed,changedAt,fields[{fieldId,name}],truncated}` \| null | `changeSince.js` `toChangeSince`, `IssueTargetAdapter.changeSince`, `ApprovalService.approvalContent` 에서 항상 키 존재(`change ?? null`) | `issueApprovalModel.js` `isChanged`(checked!==false && changed===true)·`changedFieldsText`(`fields[].name`)·`issueChangeNotice`(`changedAt` null 허용, `truncated`) | 일치. D6(`changed:true`+`changedAt:null`+`fields:[]`) 조합을 F4 테스트가 실렌더로 확인 |
| `isStale`/`contentVersion:null`(ISSUE) | `approvalContent` — change 있으면 `pendingStale\|\|approvedStale` | `ApprovalDetail.jsx` `staleNoticeKind` 가 `changeSinceRequest` 를 먼저 보고, null 일 때만 LEGACY 리비전 문구 | 일치("v0→v" 문구 차단 — 백엔드 보고서 발견 항목 해소) |
| `canResubmit` | `approvalContent`: `pendingStale && requesterKey === principal.accountId`(Q82, `\|\| canEdit` 제거) | `generalSummaryOf`(`changed && approval.canResubmit===true`), `ApprovalDetail.jsx:306`(`approval.canResubmit`) | 일치. 프론트는 서버값만 사용, 재계산 없음 |
| `canRequest`(최상위) | `needEdit && canEdit && requestGate.allowed` | `generalSummaryOf` `view.canRequest===true`, `ApprovalModalFlow` 초기 intent | 일치 |
| `notAvailableReason` | `requestGate` → `'PROJECT_DISABLED'\|null`(D2·D3·D4) | `summary.notAvailableReason === 'PROJECT_DISABLED'` 일 때만 안내 | 일치 |
| `getApprovalDetail` | `:375-392`, `isLatest = latestId === requestId` | `ApprovalModalFlow`(contextRequestId) → `ApprovalDetail` | 일치(D2 — `notAvailableReason` 키 추가는 소비자 무해) |
| `createIssueApproval({..., supersedes?})` → `{requestId,status,currentStepOrder}` | `:591-612` | `RequestForm`(`supersedes = intent==='resubmit' ? approval.requestId : null`) → `finish(result)` 의 `result.requestId` | 일치. 승인됨 뒤 새 요청은 supersedes 없이 → 서버 자동 prev 연결 |
| 에러 code | `ErrorCodes.RESUBMIT_NOT_ALLOWED`·`ISSUE_APPROVAL_PROJECT_DISABLED`, `PERMISSION_TARGET_VIEW_DENIED`(회수) | `modal.jsx` `STALE_FORM_ERRORS`(`ALREADY_OPEN`·`RESUBMIT_NOT_ALLOWED` → 무효화 후 상세), 나머지 `t('error.'+code)` | 일치. 전부 `error.code` 분기, kr/en `error.json` 에 존재 |
| 알림 `notification.template.issueDeleted` | `NotificationService.notificationTemplate` — ISSUE 분기가 전환 분기보다 앞 | `NotificationPanel`(무변경), 문구 `{title}` — 기존 `transitionIssueDeleted` 와 같은 방식 | 일치 |
| `getIssueTransitionApprovals` | 무변경 | `TransitionApprovalList`(무변경), `transitionKeys.issue` | 일치 |

## 점검표

**ISSUE / TRANSITION 비혼합 (설계 §3.4)**
- [x] dedupe 접두: `open:ISSUE:{id}` vs `open:TRANSITION:{id}:{status}` — `scopeKey.isolation.test.js`(B1), `IssueApprovalIsolation.test.js`(b)(c) 가 메모리 저장소로 두 키 공존·두 번째 ISSUE `ALREADY_OPEN` 확인
- [x] 조회 조건: `getIssueApproval` 은 `findLatestForTarget({targetKind:'ISSUE', ...})` 로만 호출(B4-a 가 인자 단언), `findLatestRequestId` 는 target_kind 바인딩(B3)
- [x] 부속 JOIN: 전환 요약은 `FROM transition_request ... JOIN approval_request` (B5)
- [x] 어댑터 선택: `targetRegistry.get(state.targetKind)`. ISSUE 결정 시 전환 `beforeDecide` 미호출(B4-e), 전환 상세의 `changeSinceRequest` null·changelog 0콜(B4 마지막)
- [x] 재상신 교차 금지: `supersedes` 에 전환 requestId → `INVALID_TARGET`, 회수 없음(B4-d)
- [x] 트리거: `IssueApprovalChangeService` 는 `:deleted:issue` + `target_kind='ISSUE'` 만, `updated:issue` SQL 0. `onIssueChanged` 두 처리 각자 try/catch(B7)
- [x] 쿼리키: `approvalKeys.issue` = `['approval','issue',id]` vs `transitionKeys.issue` = `['transition','issue',id]` (F5), 두 칸 독립 조회·한쪽 실패 격리(F2)

**권한·가드**
- [x] `supersede` 요청자 가드: `state.status===PENDING && requesterKey !== principal.accountId → RESUBMIT_NOT_ALLOWED{requestId}`, cancel 전(B6). TIMESHEET 은 target.accountId=principal 이라 영향 없음(`TimesheetService.js:408`), TRANSITION 은 supersedes 를 넘기지 않음
- [x] `cancelApproval`: 요청자/Jira 관리자 확인 → `assertTargetVisible` → 회수. 열람 불가 시 회수 없음(B6). 호출처는 Controller 1곳뿐
- [x] 형제 resolver 범위(설계 §4.10): 상세·이력·증명서·결정·회수 모두 `assertTargetVisible`, 목록은 `filterVisible`
- [x] `SELF` 는 서버 `principal.accountId` 사용

**등록·배포 단위**
- [x] 신규 resolver 0 — `getIssueApproval`·`createIssueApproval`·`getApprovalDetail`·`cancelApproval` 은 기존 3단계 등록 그대로(PermissionMap 은 주석만 변경), 계약 테스트 녹색
- [x] 프론트 `invokeApproval` 함수명이 등록 이름과 동일
- [x] 엔트리 3곳 무변경: `craco.config.js`·`public/*.html` diff 없음, manifest 는 `transition-approval-action` title(`Request approval`)·주석만(resources·키·scope 무변경)
- [x] manifest app id 는 HEAD 와 같은 자리표시자(`REPLACE-WITH-forge-register`) — Confluence 앱 id 로 돌아가지 않음
- [x] 마이그레이션 없음(최신 v032, 번호 중복·역순 없음)

**불변식 1~10**
- [x] 1 dedupe UNIQUE (위)  · [x] 2 "수정됨"은 저장 안 하는 조회 파생, 상태 머신 무변경
- [x] 3 `src/domain/issue/changeSince.js` 에 `Date.now()`/무인자 `new Date()` 없음(grep), 시각 전부 인자. (`worklogHistory.js:519` 의 `new Date(now)` 는 인자 있음)
- [x] 4·5 새 UPDATE 없음(만료 `closeBySystem`, 회수 기존 `cancel`)  · [x] 6 삭제 만료 이벤트 id 는 `expireByTargetChange` 결정적 규칙
- [x] 7 회수 열람 확인 추가  · [x] 8 issue-approval 신규 코드에 asApp 없음(`IssueChangeReader` 는 asUser, grep 일치는 주석뿐), 트리거는 Jira 호출 없음
- [x] 9·10 이슈 프로퍼티·validator 무관
- [x] route 인코딩: `IssueChangeReader` 는 template strings 배열을 직접 만들어 id·숫자만 보간(`RequestJira.repeatedQueryRoute` 와 같은 방식)

**i18n**
- [x] `locales/{kr,en}/issueApproval.json` 26/26 키 대칭, `error`(62/62)·`notification`(27/27)·`transition`(69/69) 대칭
- [x] D1 4건 존재: `error.ISSUE_APPROVAL_PROJECT_DISABLED`, `error.RESUBMIT_NOT_ALLOWED`, `notification.template.issueDeleted`, `transition.server.validator.REJECT_NO_REQUEST`(두 언어 모두 `"Request approval"` 메뉴 이름 — manifest title 과 일치)
- [x] 화면이 부르는 `issueApproval.*` 리터럴 키 전부 사전에 있음, 새 JSX 에 하드코딩 문구 없음, 인라인 쿼리키 없음

## 권고 (필수 아님)

- **R1** (frontend) `ApprovalDetail.jsx:307` 재상신 버튼이 `detail.resubmit`("새 버전으로 다시 상신" / "Resubmit for the new version")을 쓴다. ISSUE 는 버전 개념이 없어 문구가 어색하다 → `approval.targetKind==='ISSUE'` 이면 `issueApproval.section.resubmit`("다시 상신") 사용.
- **R2** (frontend) ••• 모달 `OverviewModalFlow` 에서 일반 승인 **상세**로 들어간 뒤에는 종류 선택으로 돌아갈 길이 없다(`onBack` 은 요청 폼 취소에만 연결). 상세 화면 닫기 옆에 "뒤로"를 두거나 현 동작을 수용.
- **R3** (backend) `getApprovalDetail` 에서 `describe` 가 실패하면 `snapshot=null` → `updatedAt` 모름 → `needsChangelog` true 로 changelog 를 항상 읽는다. 일시 오류 때만이라 비용은 작지만, describe 실패 시 판정을 생략(`checked:false`)하는 편이 호출량 산정(§9.2)과 맞다.
- **R4** (backend) `createIssueApproval` 에서 `findLatestForTarget` 으로 이전 회차를 이은 뒤 `supersede()` 가 같은 요청을 `repository.load` 로 한 번 더 읽는다(SQL 1회 중복). 동작 문제 없음.
- **R5** (운영) 이슈 화면 로드마다 PENDING/APPROVED 요청이 있으면 `updated` 거름 뒤 changelog 1~2콜 — 전환 승인을 쓰는 이슈는 상태 전환만으로도 `updated` 가 갱신되어 거름이 자주 통과할 수 있다(I1·I9 실측 대상).

## 미검증 (플랫폼 실측 — `04_spike_todo.md` I1~I18, 이번 회차 추가 없음)

전부 배포 후 실측 필요. 특히 배포 회차 우선순위: **I2**(changelog 정렬·total — 끝 페이지 선택), **I6**(••• 진입이 overview 로 가는 moduleKey 판정), **I10/I8**(워크로그·Rank·Sprint 오탐), **I11**(`created` 형식), **I15**(medium 모달 폭), **I17**(••• 모달 제출 뒤 이슈 요약 갱신).

## 질문
새 질문 없음. 백엔드 N1·N2 는 이미 `QUESTIONS.md` Q88·Q89 로 올라가 있다(기본 가정 유지 중).

## 회차 이력
| 회차 | 날짜 | 결과 |
|---|---|---|
| 1 | 2026-10-04 | PASS — 실패 0, 권고 R1~R5, 백엔드 79/1050 · UI 35/284 · merge·build 통과 |
