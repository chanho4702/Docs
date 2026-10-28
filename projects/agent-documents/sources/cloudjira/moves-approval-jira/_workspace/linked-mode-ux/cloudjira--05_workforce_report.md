# linked-mode-ux 워크포스 보고서 (WF-L1~L16)

- 작성 2026-10-13 · 워크포스 구현자 · 1회차
- 리포: `C:\CloudJira\moves-workforce`(브랜치 `RFC-220`, 기준 ff76a9d). 승인 앱 리포는 읽기만 했다(계약 파일 복사 원본).
- 입력: `01_architect_design.md` §0 Q1·§3·§6·§7.2·§16·§17, `02_backend_report.md` §3(계약), `00_input/requirement.md`(Q142 a, Q146 a).
- 커밋·`git add`·`forge` 없음. 이전 세션의 미추적 파일(pptx 2·png·custom-scopes.yaml·LeaderTeamBackfill.test.js)은 건드리지 않았다. git 인덱스는 비어 있다(`git diff --cached` 없음).

## 결과 요약

| 항목 | 결과 |
|---|---|
| 백엔드 jest | **171 suites / 2361 tests 전부 통과**(시작 169 / 2307, 그중 4건 실패 — 아래 §5.1) |
| 프론트 jest | **171 suites / 2711 tests 전부 통과**(시작 170 / 2658) |
| 프론트 빌드 | `CI=true npm run build` 성공(app·panel 두 번들, 번들 예산 안). 경고는 node_modules 소스맵 3건뿐(기존과 같음) |
| i18n | `locales/{kr,en}/{issuePanel,issueApprovalSetting,setting}.json` 수정 → `npm run merge` 로 `ko-KR.json`·`en-US.json` 재생성 |
| 계약 해시 | `contract.js` `cb3e80c2d39485ea302e8d0f16d06d37dce199c0cbc29a23cd549ffe01916012`, `vectors.json` `c85d6c779dd9b7e40d2ae4281a351b7f2d931f170e5da369812e6f145a69adc7` — **백엔드 보고서와 일치**, 승인 앱 원본과 바이트 동일 |
| 워크포스 DB·manifest·scope | 무변경 |

---

## 1. 설계와 다르게 한 점 (검증자 필독)

| # | 위치 | 설계 | 실제 | 이유 |
|---|---|---|---|---|
| WD1 | 수정·삭제·이동 창구 (`resolveEditChannel`) | W1(스위치 OFF) = 작성·수정·삭제 모두 DIRECT | 작성은 설계대로. **수정·삭제·이동은 OFF 라도 서버가 `linked:true`(서명 검증된 승인 앱 통제 문서)를 주면 HANDOFF** | 종전(worklog-control WF-8) 동작 유지. 스위치 OFF 여도 승인 앱이 통제 중인 이슈의 기록을 워크포스가 직접 PUT/DELETE 하면 승인 앱 인증·잠금을 우회한다. 승인 앱 없는 설치는 `linked` 가 항상 false 라 영향 없음 |
| WD2 | 조회 호출 | "OFF = 호출 없이 DIRECT" | 작성 창구는 OFF 면 서버 응답을 기다리지 않고 DIRECT. 다만 `getIssueWorklogControl` 호출 자체는 종전처럼 한다(패널은 표식이 있거나 ON 일 때, 모달·드래그는 항상) | WD1 의 `linked` 와 숨긴 본인 기록(WF-7)을 받아야 한다. 호출 수는 종전과 같다 |
| WD3 | 공유 판정 파일 위치 | `components/worklog/writeChannel.js` 에 `createHandoffPath`·`remainingHandoffDates` 이동 | `writeChannel.js` 는 서버 `src/domain/approvalLink/writeChannel.js` 와 **글자 그대로 같은 파일**(테스트가 대조). 화면 전용 함수(`resolveWriteChannel`·`resolveEditChannel`·`createHandoffPath`·`remainingHandoffDates`)는 `components/worklog/writeChannelView.js` | 두 파일을 바이트 대조로 고정하려면 화면 전용 함수를 분리해야 한다 |
| WD4 | `writeChannelFor` 반환 | `'DIRECT'|'HANDOFF'|'BLOCKED'` | `{write, edit, control}` | 드래그 넘김 토스트에 수정 경로(control.globalPagePath)가 필요하다 |
| WD5 | `rx` 없음 저장 | "pol 무시(400 아님, ISSUE_SETTING_UNSUPPORTED)" | 새 칸(pol·fl)을 보낸 항목 중 하나라도 그 이슈 ctl `rx` 에 토큰이 없으면 **저장 전체를 `ISSUE_SETTING_UNSUPPORTED` 로 거부**(아무것도 쓰지 않음). 화면은 능력 없는 행에는 애초에 새 칸을 싣지 않는다 | 일괄 적용이 일부만 적용되는 것을 막는다. 화면 경로에서는 발생하지 않고 직접 호출·경쟁 상태만 걸린다 |
| WD6 | 결재선 목록 | 페이지 칸 `flows:{req,def,options}|null` | `flowsByProject: {jiraProjectId: {req,def,options}|null}` + 행 `jiraProjectId` | 워크포스 프로젝트 하나가 Jira 프로젝트 여럿에 걸칠 수 있고 `movesApproval.flows` 는 Jira 프로젝트마다 다르다. 일괄 모달은 대상이 한 Jira 프로젝트일 때만 결재선 지정(`flowMixed` 안내) |
| WD7 | 결재선 열 표시 조건 | rx `approval.flows` ∧ 검증된 문서 ∧ `req===true` | rx `approval.flows` ∧ 검증된 문서가 하나라도 있으면 | `req=false` 프로젝트에서도 팀장이 이슈별로 `pa:REQUIRED` 를 걸 수 있고 그때 결재선이 쓰인다 |
| WD8 | 결재선 문서 읽는 자격 | (asApp ⑧ 한 줄 추가) | **asUser** GET(`project/{id}/properties/movesApproval.flows`) | 승인 설정 표는 조회자 화면이고 Browse 권한이면 읽힌다. asApp 예외를 늘리지 않았다. AGENTS ⑧ 에 "asUser 만" 으로 적었다 |
| WD9 | **PM 읽기 전용 표시** | 표 머리 "이 프로젝트 PM: {이름}"(`project.pmKeys`) | **구현하지 않음** | 워크포스 데이터에 "프로젝트 PM" 이 정의돼 있지 않다 — `project` 테이블에 PM 칸이 없고, `projectusers.role_key` 는 고객이 정의하는 KVS 역할, `PM` 은 권한 세트 프리셋 이름일 뿐이다. 추측으로 표시하면 틀린 사람이 나온다. **결정 필요(§6 Q-WF1)** |
| WD10 | 진단 `FLOWS_DOC` | 항목 추가 | 추가. 통제 문서 `rx` 에 `approval.flows` 가 없으면 증거 없음(null), 있으면 서명 검증 결과. 응답에는 결재선 개수·필수 여부만(이름 없음) | 진단 응답에 고객 데이터를 싣지 않는 기존 규칙 |
| WD11 | `vectors.test.js` 형제 대조 | (변경 없음) | 승인 앱 원본과의 로컬 대조를 **LF 정규화 후** 비교로 바꿈 | 시작 시점에 4건(base64url·canonical·ed25519·signature) 실패 중이었다. 원인은 내용이 아니라 승인 앱 체크아웃의 CRLF(core.autocrlf=true) — LF 정규화 sha256 은 양쪽 같다. 지문 표 대조(정본)는 원래부터 LF 정규화였다 |

---

## 2. 파일별 변경

### 2.1 백엔드 (`src/`)

| 파일 | WF | 변경 |
|---|---|---|
| `domain/approvalLink/writeChannel.js` **신규** | L2 | `WriteChannel`, `writeChannelOf({linkMode, target, ctl})`(W1~W6, `ch` 무시), `createHandoffPathOf({globalPagePath, issueId, startedMs, seconds, timeZone})`(프리필), `isHandoffBase`. 순수, import 없음 |
| `resolver/approvalLink/IssueWorklogControlService.js` | L2 | `createChannelOf` 삭제 → `writeChannelOf`. `creationState` 가 `{target, writeChannel, createChannel}`(createChannel = 같은 값, 한 릴리스 호환) — 소속 판정 실패는 `target:null` → BLOCKED. `getIssueWorklogControl` 응답에 `writeChannel`, 연동 이슈 조회 때 `ensureOrgCap` 병렬 호출(§0 Q1, 6시간 메모, 실패 무시). `createIssueWorklog` HANDOFF cause.path = `createHandoffPathOf`(ctl.tz 로 날짜·시작~종료). **`assertOwnSetting` 삭제**(DIRECT 대상 경로가 없어짐), `assertWindow` 유지 |
| `integration/approval/contract.js`·`vectors.json` | L9 | 승인 앱 원본 바이트 복사 |
| `integration/approval/issueSetting.js` | L10 | `issueSettingPlan` 확장 — `changes.pol`(키별 값=SET, null=CLEAR, 빠진 키=KEEP), `changes.fl`(칸을 보낸 경우만, `keep.fl`), 결과가 비면 본문에서 칸 자체를 뺀다(구판 문서와 같은 바이트). 구판 화면이 s/e/pa 만 보내도 걸린 pol·fl 보존. `issuePolicyValueValid`·`isFlowId` export |
| `integration/approval/flowsDoc.js` **신규** | L10 | `FLOWS_PROPERTY_KEY`, `verifyFlowsDoc({entry, cloudId, projectId, now, keyring, trustedKids, verifyImpl})` → `{req, def, options:[{id,label}], rev, kid, iat}|null`(APPROVAL 계열, `ent {projectId}`, 계약 validator 통과분만) |
| `resolver/approvalLink/IssueApprovalSettingService.js` | L11 | 목록: 행 `jiraProjectId`·`capabilities{policy,flows}`(그 행 ctl `rx`)·`setting.pol/fl`·`leaderKeys`(담당자 `users.team_key` → 팀 색인 `leaderAccountId`, 실패는 빈 표시), 페이지 `capabilities`·`flowsByProject`(rx 에 `approval.flows` 인 Jira 프로젝트만 asUser GET 1회씩). 저장: `pol`(키 닫힌 집합·계약 범위·초)·`fl`(UUID|null)·`keep.fl` 입력 검증, 쓰기 전 `assertNewFields` — v2 토큰 없으면 `ISSUE_SETTING_UNSUPPORTED`, 결재선이 검증된 목록 밖이면 `ISSUE_SETTING_FLOW_INVALID`(쓰기 0). DI: `readFlows`·`leaders`·`env`·`keyring` |
| `utils/errors/ErrorCodes.js` | L12 | `ISSUE_SETTING_UNSUPPORTED`, `ISSUE_SETTING_FLOW_INVALID` |
| `resolver/approvalLink/ApprovalLinkAdminService.js` | L16 | `flowsDocCheck`(export) + 진단 `FLOWS_DOC` 항목 |

### 2.2 프론트 (`static/ui/src/`)

| 파일 | WF | 변경 |
|---|---|---|
| `components/worklog/writeChannel.js` **신규** | L1 | 서버 `domain/approvalLink/writeChannel.js` 와 글자 그대로 같음 |
| `components/worklog/writeChannelView.js` **신규** | L1 | `resolveWriteChannel({linkMode, server})`(OFF → DIRECT, 그 외 서버 `writeChannel` 만, 모르면 BLOCKED — 옛 `createChannel` 칸은 믿지 않음), `resolveEditChannel`(WD1), `createHandoffPath`·`remainingHandoffDates`(구 `createChannel.js` 에서 이동) |
| `components/worklog/createChannel.js`·`__test__/createChannel.test.js` | L1 | **삭제**(작업 트리에서만, 인덱스 무변경) |
| `components/worklog/worklogWrite.js` | L3 | `isApprovalLinkedIssue`(실패 = false = 직접) 삭제 → `writeChannelFor(issueIdOrKey, {linkMode})` → `{write, edit, control}`(실패 = BLOCKED, OFF 면 DIRECT) |
| `components/worklog/worklogMoveGuard.js` **신규** | L6·L7 | `checkWorklogMove`(이슈별 5분 캐시 `myWorkKeys.writeChannel`, BLOCKED 는 캐시 안 함), `notifyBlockedMove`(HANDOFF = 정보 토스트 + "승인 앱에서 수정" 동작, BLOCKED = 오류 토스트) |
| `utils/queryKey/myWorkKeys.js` | L6 | `writeChannel(issueIdOrKey, linkMode)` 키 팩토리 |
| `components/feedback/ToastFlags.js` | L6 | `showInfo`·`showError` 에 선택 인자 `actions`(Atlaskit Flag) |
| `panel/useIssuePanelData.js` | L4 | 통제 조회를 표식(`movesRmsLink`)과 무관하게 `linkMode==='ON'` 이면 실행. `approval.writeChannel`·`editChannel`(조회 중·실패 = BLOCKED, OFF 예외)·`retry` |
| `panel/panelApproval.js` | L4 | `resolveApprovalRowMode({worklog, accountId, editChannel})` → NONE/DIRECT/HANDOFF/BLOCKED(모르는 값 = BLOCKED) |
| `panel/PanelWorklogForm.jsx` | L4 | `approval.writeChannel` 만 사용(없으면 BLOCKED). HANDOFF = "승인 앱에서 기록"(프리필), BLOCKED = 안내 + "다시 시도" |
| `panel/PanelRecentWorklogs.jsx` | L4 | BLOCKED 행은 수정·삭제 아이콘 비활성 + 툴팁(`issuePanel.approval.blocked.row`) |
| `pages/myWork/modal/WorklogModal.jsx` | L5 | 작성·수정·삭제 모두 `resolveWriteChannel`/`resolveEditChannel`(linkMode = `settingData.approvalLinkMode`). 조회 실패를 `{failed}` 로 기록(종전엔 무시 → 수정이 직접 PUT). 수정 BLOCKED = 입력 비활성 + 안내 + 다시 시도(재조회), 폼 Enter 제출도 `editChannel !== 'DIRECT'` 면 PUT 0, 삭제도 같은 가드 |
| `pages/myWork/worklogMove.js` **신규** · `WorklogPage.jsx` | L6 | `onEventDrop` 을 `moveMyWorklog` 로 뽑음(테스트 가능). HANDOFF/BLOCKED → revert + 토스트, DIRECT 만 PUT. 페이지에 `ToastFlags` 추가, 안 쓰는 import 정리 |
| `pages/projectDetail/calender/worklogDrop.js` · `ProjectCalender.jsx` | L7 | `isApprovalLinked` 주입 → `checkMove`(+`linkMode`·`navigate`). 같은 판정·안내 |
| `pages/projectDetail/issue/approvalBulk.js` | L13 | `POLICY_KEYS`, 폼 `pol`(키별 KEEP/SET/CLEAR, 시간은 **분 입력 → 초**)·`flow`(KEEP/SET/DEFAULT)·`flowId`, `policyPatch`·`invalidPolicy`·`policyFormOf`·`policySummary`("하루 6시간 · 수정 7일"), `approvalItem` 이 능력 있는 행에만 pol·fl 을 싣는다, 미리보기에 pol·fl 차이 반영, `saveApprovalBatches` 가 배치 거부 사유 `errorCode` 를 남긴다 |
| `pages/projectDetail/issue/IssueApprovalBulkModal.jsx` | L13 | 기록 규칙 7키(능력 있을 때만, 없으면 `v2Missing` 안내), 일부 행만 능력 있으면 `policyPartial`, 결재선(같은 Jira 프로젝트·검증된 목록일 때만 지정, 아니면 `flowMixed`/`flowUnavailable`), 행 편집 1건이면 지금 정책을 초기값으로, 거부 사유 문구(`errorCode.*`) |
| `pages/projectDetail/issue/IssueApprovalSettingTable.jsx` | L13 | 열 `leader`(항상, 이름은 `useUserInfoMap`), `policy`(페이지 capabilities.policy), `flow`(WD7) — 행 능력 없으면 "—". `pa` 라벨 "작업 시간 승인 방식". rx v2 없는 연동 프로젝트에 `v2Missing` 한 줄 |
| `backoffice/page/setting/approvalLinkDiag.js` | L16 | `CHECK_ORDER` 에 `FLOWS_DOC` |

### 2.3 문서·i18n

| 파일 | 변경 |
|---|---|
| `AGENTS.md` (L15) | asApp ⑧ 아래 두 줄: "쓰기 창구 통일(①)" — 판정 파일·BLOCKED·OFF 예외(WD1)·cap 조회 게시, "결재선 목록 읽기(④b)" — **asUser 만**, 서명 검증, rx 게이트·`ISSUE_SETTING_UNSUPPORTED` |
| `locales/{kr,en}/issuePanel.json` (L14) | `approval.edit.open`, `approval.move.handoff`, `approval.blocked.{retry,row}` |
| `locales/{kr,en}/issueApprovalSetting.json` (L14) | `pa`("작업 시간 승인 방식"), `paMode`(먼저 승인받고 기록 / 기록 뒤 팀장 확인 / 기본 따름), `leader`, `policy`, `policyNone`, `policyMode`, `policyKey.*`(승인 앱 `worklogPolicy.key.*` 와 같은 문구), `policyShort.*`, `policyInvalid`, `policyPartial`, `unit.*`, `bool.*`, `flow`, `flowSelect`, `flowMode`, `flowDefault`, `flowDefaultNamed`, `flowUnknown`, `flowMixed`, `flowUnavailable`, `v2Missing`, `errorCode.*` |
| `locales/{kr,en}/setting.json` (L16) | `approvalLink.check.HANDOFF_PATH` 문구에 "작성·수정·삭제", `check.FLOWS_DOC` |
| `locales/ko-KR.json`·`en-US.json` | `npm run merge` 생성물 |

---

## 3. 도메인 함수·테스트

| 함수 | 테스트 파일 | 고정한 것 |
|---|---|---|
| `writeChannelOf` (서버·화면 동일 파일) | `src/domain/approvalLink/__test__/writeChannel.test.js`, `static/ui/src/components/worklog/__test__/writeChannel.test.js` | W1~W6 전 분기, `ch` 3종(APP/WORKFORCE/없음) 무영향, 경로 형식 밖 → BLOCKED, **두 파일 글자 대조**, 같은 표를 화면·서버 모듈 양쪽으로 실행 |
| `createHandoffPathOf` | 위 두 파일 | 같은 날 시작~종료, 자정 넘김·종료가 자정 → 날짜만, 소요 0 → 날짜만, 잘못된/없는 tz → 이슈만, tz 가 날짜를 바꿈, 형식 밖 → null |
| `resolveWriteChannel`·`resolveEditChannel` | `components/worklog/__test__/writeChannel.test.js` | OFF·ON·모름 × 서버 응답(없음·DIRECT·HANDOFF·BLOCKED·옛 createChannel 만·모르는 값), OFF + linked → 수정 HANDOFF(WD1) |
| `issueSettingPlan` (pol·fl) | `src/integration/approval/__test__/issueSetting.test.js` | 구판 화면 저장이 pol·fl 보존, 키별 SET/CLEAR/KEEP·정렬, 전부 비우면 칸 삭제, fl SET/DEFAULT/KEEP, 값 같으면 게시 안 함(순서 무관), 계약 범위 거부 5종, 대문자 UUID 거부, v2 본문 서명·검증 |
| `verifyFlowsDoc` | `src/integration/approval/__test__/flowsDoc.test.js` | 승인 앱 골든 벡터 읽기, 다른 프로젝트·사이트·위조·신뢰 밖 → null, 계약 밖(기본 결재선 목록 밖·대문자·21개) → null |
| 골든 벡터 | `vectors.test.js` | linked-mode-ux 3건 존재·형태, 기존 lis 4건 `slice(-7,-3)`, 지문 표 갱신 |

### 서비스·화면 테스트

| 파일 | 내용 |
|---|---|
| `resolver/approvalLink/__test__/IssueWorklogControlService.test.js` | W16 판정표를 조회 응답 `writeChannel` 로 재작성(`ch:'WORKFORCE'`·ch 없음 → HANDOFF, OFF → DIRECT), 소속 판정 장애 → BLOCKED, W17(넘김·확인 불가에서 POST 0·게시 0) — `ch:'WORKFORCE'` 케이스 추가, cause.path 프리필(같은 날·자정 넘김), 조회 시 cap 1회·실패 무시·미연동은 안 부름, ch:WORKFORCE 문서에 자기 설정이 있어도 직접 작성 안 함. `assertOwnSetting` 표 테스트 삭제 |
| `resolver/approvalLink/__test__/IssueApprovalSettingService.test.js` | rx v2 없으면 UNSUPPORTED·쓰기 0, v2 면 저장 + 다음 s/e/pa 저장이 pol 보존, 입력 검증 5종(Jira 0), 결재선 목록 안/밖/위조/토큰 없음, DEFAULT(null)는 목록 안 읽음, 목록 응답 capabilities·flowsByProject·leaderKeys, 구판 승인 앱은 결재선 문서 안 읽음·팀장 조회 실패는 빈 표시, 저장된 v2 가 목록에 pol·fl |
| `resolver/approvalLink/__test__/ApprovalLinkAdminService.test.js` | `flowsDocCheck` — 증거 없음(null), 통과(이름 미노출), 없음·읽기 실패·위조 실패 |
| **`static/ui/src/__test__/linkedNoDirectWrite.test.jsx` 신규 (WF-L8)** | 이슈 패널 작성 폼(HANDOFF·BLOCKED·창구 없음 → create 0, BLOCKED 다시 시도, DIRECT 는 작성), 패널 행(HANDOFF → 넘김만, BLOCKED·창구 없음 → 아이콘 비활성·편집 폼 안 열림), **마이워크·프로젝트 캘린더 드래그를 실제 판정 체인으로**(ON + 넘김/확인 불가/조회 실패/조회 거부 → `updateWorklog` 0·revert, OFF → 종전처럼 PUT, OFF + 조회 실패 → PUT) |
| `pages/myWork/modal/__test__/WorklogModalSpaceFilter.test.jsx` | 응답 칸 `writeChannel` 로 갱신 + 신규 3건: 넘김이면 승인 앱 수정 화면만·PUT/DELETE 0·삭제 버튼 없음, ON + 조회 실패 → BLOCKED·PUT 0·다시 시도가 재조회, OFF + 비연동 → 종전처럼 직접 수정·삭제 |
| `components/worklog/__test__/worklogWrite.test.js` | `writeChannelFor` — 서버 값 사용·linked 넘김, ON 실패 = BLOCKED, OFF 실패 = DIRECT |
| `panel/__test__/panelApproval.test.js`·`PanelWorklogCreate.test.jsx` | `editChannel` 판정표, `writeChannel` 칸으로 갱신 |
| `pages/projectDetail/calender/__test__/worklogDrop.test.js` | 넘김 → PUT 0 + 정보 토스트 동작이 수정 경로로 이동, BLOCKED → PUT 0 + 다시 시도 안내 |
| `pages/projectDetail/issue/approvalBulk.test.js` | 분→초·일수 그대로·KEEP 생략, 능력 없는 행에 pol·fl 안 실음, 범위·형식 밖 무효, 미리보기(같은 값 SET = 0), 행 편집 초기값(초→분), 요약 문구, 배치 거부 사유 코드 |
| `IssueApprovalSettingTable.test.jsx`·`IssueApprovalBulkModal.test.jsx` | 기록 규칙·결재선 열 표시 조건, 모달에서 분 입력 → 초 저장·능력 없는 행 제외, v2 없으면 안내만·거부 사유 문구 |

마이워크 캘린더 드래그 단독 파일(설계의 `WorklogPageDrop.test.jsx`)은 만들지 않았다 — 핸들러를 `pages/myWork/worklogMove.js` 로 뽑아 `linkedNoDirectWrite.test.jsx` 가 실제 판정 체인으로 덮는다.

---

## 4. UI 변경 (화면별)

| 화면 | 연동 스위치 ON + 워크포스 소속 이슈 | 스위치 OFF / 비소속 |
|---|---|---|
| 이슈 패널 작성 폼(활동 탭·우측 요약) | HANDOFF: 날짜·시작·종료만 고르고 "승인 앱에서 기록"(경로에 프리필). BLOCKED(조회 중·실패·문서 없음): 안내 + **다시 시도** | 종전 폼 |
| 이슈 패널 최근 기록 행 | HANDOFF: 본인 행은 "승인 앱에서 수정·삭제" 하나. BLOCKED: 수정·삭제 아이콘 비활성 + 툴팁 | 종전 수정·삭제(OFF 라도 승인 앱 통제 이슈면 넘김 — WD1) |
| 마이워크 모달 — 새 기록·기간 입력 | HANDOFF: "승인 앱에서 기록"/"첫 날부터 기록"(남은 날짜 표시). BLOCKED: 안내 + 다시 시도 | 종전(기간 입력 루프·롤백 삭제 포함) |
| 마이워크 모달 — 기존 기록 수정·삭제 | HANDOFF: 입력 비활성 + "승인 앱에서 열기", 삭제 버튼 없음. BLOCKED: 입력 비활성 + 안내 + 다시 시도 | 종전 |
| 마이워크 캘린더 드래그 | 원위치 + 토스트("연동 작업은 승인 앱에서 옮길 수 있습니다" + "승인 앱에서 수정" 동작) / BLOCKED 는 "확인하지 못했습니다" 토스트 | 종전 PUT |
| 프로젝트 캘린더 드래그 | 같음 | 종전 |
| 작업 관리 › 승인 설정 표 | 열 추가: 담당자 팀장(읽기 전용), 기록 규칙(rx v2 일 때, 요약 칩 — 누르면 행 편집), 결재선(rx `approval.flows` + 검증된 목록이 있을 때, "기본(이름)"/결재선 이름). `pa` 라벨 "작업 시간 승인 방식". rx v2 없으면 "승인 앱을 업데이트하면…" 한 줄 | 같음(표는 승인 앱 연동이 보일 때만 의미) |
| 승인 설정 일괄 적용 모달 | 기록 규칙 7키(변경 안 함/값 지정/비우기, 시간은 분), 결재선(변경 안 함/지정/프로젝트 기본), 거부 사유 문구 | — |
| 백오피스 설정 › 승인 앱 연동 진단 | `FLOWS_DOC` 항목, `HANDOFF_PATH` 문구 "작성·수정·삭제" | — |

편집 권한은 현행 그대로(직속 팀장 `assertLeads`, 관리자 우회 없음). 비편집자는 표만 읽는다.

---

## 5. 테스트 결과

```
# 백엔드 (C:\CloudJira\moves-workforce)
npx jest            → Test Suites: 171 passed, 171 total / Tests: 2361 passed, 2361 total
# 프론트 (static/ui)
npx jest            → Test Suites: 171 passed, 171 total / Tests: 2711 passed, 2711 total
CI=true npm run build → 성공(exit 0). app main gzip 494,149B(예산 950,000), panel main gzip 331,252B(예산 350,000)
```

### 5.1 시작 시점의 실패 (이번에 고침)
`src/integration/approval/__test__/vectors.test.js` 의 "승인 앱 리포와 계약 파일 동일(로컬 전용)" 4건(base64url·canonical·ed25519·signature) — 승인 앱 작업 트리가 CRLF 로 체크아웃돼 원시 바이트가 달랐다(LF 정규화 sha256 은 같음). 비교를 LF 정규화로 바꿨다(WD11). contract.js·vectors.json 은 원시 바이트까지 같다.

---

## 6. 미검증 · 결정 필요

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| U-1 | `router.navigate` 로 승인 앱 전역 페이지 하위 경로(`…/worklog/{issueId}/new/{date}/{HHmm}-{HHmm}`, `…/{issueId}/{worklogId}`) 이동 | ① 전체 — 실패면 HANDOFF 가 실질 BLOCKED("열지 못했습니다" 안내) | 두 앱 설치 개발 사이트에서 패널·마이워크 모달·드래그 토스트 동작 |
| U-5 | 워크포스가 조회자 자격(asUser)으로 승인 앱이 쓴 Jira 프로젝트 프로퍼티 `movesApproval.flows` 를 읽을 수 있는가 | ④b 결재선 열이 안 보임(목록 없음 = 읽기 전용 안내) | 진단 `FLOWS_DOC`(시험 이슈), 승인 설정 표 결재선 열 |
| U-W1 | 토스트 동작 버튼 — `ToastFlags` 는 2.5초 뒤 자동으로 닫힌다 | 드래그 넘김 토스트의 "승인 앱에서 수정" 을 누를 시간이 짧다(행을 눌러 모달에서 넘기는 경로는 그대로) | 화면 확인. 필요하면 정보 토스트만 표시 시간을 늘리는 후속 |
| U-W2 | 담당자 팀장 열 — `users.team_key` + 팀 색인(60초 캐시) | 표시만(판정 무관). 팀장이 없거나 담당자 본인이 팀장이면 "—" | 화면 확인 |
| Q-WF1 | **프로젝트 PM 읽기 전용 표시(WD9)** — 워크포스에 PM 정의가 없다 | 설계 §6.4 "이 프로젝트 PM" 미구현 | 결정 필요: (a) PM 표시를 빼고 "담당자 팀장" 만 (b) 권한 세트가 `PM` 프리셋인 프로젝트 참여자를 PM 으로 본다 (c) 프로젝트에 PM 칸을 추가(워크포스 DB 무증가 원칙과 충돌) |
| 범위 | 수정·삭제는 워크포스 서버 경로가 없다(프론트 직접 PUT/DELETE) — 화면 판정이 유일한 관문 | 낡은 번들·REST 는 막지 못함 | 승인 앱 사후 감지(다른 경로 입력·`LINKED_DIRECT_WF`) 몫 — 설계 §3.5 그대로 |

배포 순서(설계 §17): ①(Phase 2)은 승인 앱 배포와 순서 무관(구판 승인 앱의 `ch:'WORKFORCE'` 문서도 HANDOFF). 계약 7파일은 양쪽 같은 회차 커밋. ④a·④b 화면은 승인 앱이 `rx` 토큰을 실은 ctl 을 재게시해야 보인다 — 승인 앱 백엔드는 두 토큰을 한 번에 싣는다(02 보고서 §3).

`forge deploy`·`forge lint`·커밋은 하지 않았다.

---

## 수정 회차 1 (2026-10-13)

근거: 요구서 "범위 축소"(사용자 결정 Q149), `03_verify_report.md`(F-1·D-1), `codex-review.md`(P1), 코디네이터 계약 확정 통보(토큰 `rms.issue.fl`). 커밋·`forge` 없음, git 인덱스 비어 있음.

### R1-1. F-1 범위 축소 — 기록 규칙 7키 제거
- 팀장 승인 설정 표에는 **담당자 팀장(읽기 전용)·작성 기간·작업 시간 승인 방식(pa)·결재선(fl)**만 남겼다. 기록 규칙 열·일괄 모달의 7키 입력·분↔초 변환·요약 칩은 제거했다.
- **PM 표시(Q-WF1)는 요구에서 명시 제외(a)** — 워크포스에 프로젝트 PM 데이터가 없어 담당자 팀장만 표시한다.
- 백엔드:
  - `issueSetting.js`: `issueSettingPlan` 은 s/e/pa + `fl`(칸을 보낸 때만, 없으면 본문에서 칸 삭제)만 다룬다. `issuePolicyValueValid`·`pol` 경로를 삭제했다.
  - `IssueApprovalSettingService.js`: 항목에 `pol` 을 보내면 `INVALID_TARGET` 으로 거부하고 Jira 는 부르지 않는다.
- 응답 칸:
  - `capabilities` 가 `{policy, flows}` 에서 **`{fl, flows}`** 로 바뀌었다(행·페이지 모두).
  - `setting.pol` 칸은 삭제했다.
- 게이트(WD5·WD7 재판정, 토큰 `rms.issue.fl`):
  - 결재선 저장(지정·프로젝트 기본 모두)은 그 이슈 ctl `rx` 에 **`rms.issue.fl`** 이 있어야 한다. 지정은 **`approval.flows`** 도 있어야 하고, 검증된 목록 안이어야 한다.
  - 어긋나면 저장 전체를 거부하고 아무것도 쓰지 않는다(`ISSUE_SETTING_UNSUPPORTED` / `ISSUE_SETTING_FLOW_INVALID`).
  - 결재선 열은 `fl` 토큰 ∧ `approval.flows` 토큰 ∧ 검증된 목록이 하나라도 있을 때만 보인다. 행에 두 토큰이 없으면 "—"로 표시한다.
  - `fl` 토큰이 없으면 표에 `flowMissing` 안내 한 줄을 띄운다.
- i18n(`issueApprovalSetting`):
  - 삭제: `policy*`·`unit`·`bool`·`v2Missing`
  - 추가: `flowMissing`·`flowPartial`
  - `errorCode.*` 문구는 결재선 기준으로 고쳤다. kr/en 키 집합은 같고, `npm run merge` 를 실행했다.
- `vectors.test.js`:
  - `toHaveProperty('pol')` 단언을 지우고 "rms.issue 벡터에 pol 없음"·"v2 벡터에 fl 있음"으로 바꿨다.
  - 지문 표를 새 해시로 갱신했다.
- `AGENTS.md` ⑧ 의 결재선 줄을 `rms.issue.fl`·Q149 기준으로 고쳤다.

### R1-2. 코덱스 P1 — 수정·삭제를 서버 resolver 경유로
- 신규 resolver 두 개를 3단계로 등록했다: `ApprovalLinkController` 의 `guardedDefine`, `PermissionMap` `SELF`, 기존 `CONTROLLER_REGISTRARS`.
  - `updateIssueWorklog` — 받은 칸(started·timeSpentSeconds·comment)만 PUT 한다. comment 가 없으면 Jira 가 원본 ADF 를 보존한다(LOCKED 가드 유지).
  - `deleteIssueWorklog`
- 두 resolver 는 **실행 직전에** `assertDirectEdit` 로 지금 연동 판정(`creationState` → `writeChannelOf`)을 다시 하고, DIRECT 일 때만 asUser 로 PUT·DELETE 한다.
  - HANDOFF → `WORKLOG_EDIT_HANDOFF_REQUIRED`(cause.path = 승인 앱 수정 화면)
  - BLOCKED → `WORKLOG_LINK_UNCONFIRMED`
  - Jira 거부 → `WORKLOG_UPDATE_FAILED`·`WORKLOG_DELETE_FAILED`(신규 ErrorCodes)
  - 승인 앱 없는 단독 설치(스위치 OFF + 신뢰 키 없음)는 이슈 선조회 없이 요청 하나로 끝난다(종전 화면 직접 호출과 같은 비용).
- 프론트:
  - `worklogWrite.updateWorklog`·`deleteWorklog`·`moveWorklog`(신규, 드래그용 started 만)가 모두 `invoke` 를 거친다.
  - 마이워크·프로젝트 캘린더 드래그는 `executeRequest('updateWorklog')` 대신 `moveWorklog` 를 쓴다.
  - 실행 시점 거부를 받으면 revert 하고, 5분 캐시를 버리고, 넘김·다시 시도 안내를 띄운다(`channelOfWriteError`).
  - 모달·패널 행은 거부 사유 문구를 보이고, 모달은 창구를 재조회해 넘김 화면으로 바꾼다.
- 화면 판정(캐시)은 이제 편의일 뿐이다. 판정이 낡아도 연동 이슈에 대한 PUT·DELETE 는 서버가 막는다.
- 테스트:
  - `IssueWorklogControlService.test.js` 에 수정·삭제 거부 4종(PUT·DELETE 0), 경로, 비연동 실행·받은 칸만, 단독 설치 요청 1, 입력 거부, 호출자 없음, Jira 거부를 추가했다.
  - `linkedNoDirectWrite.test.jsx` 의 드래그 테스트가 이제 실행 resolver(`updateIssueWorklog`)까지 탄다.
    - ON 넘김·확인 불가·조회 실패·조회 거부 → 실행 0
    - D-1: OFF + 통제 문서 → 실행 0
    - **화면 판정 DIRECT 인데 서버가 실행 시점 거부 → revert + 넘김 안내**
    - OFF → 실행
  - 같은 파일에 **정적 검사**를 추가했다: 화면 코드에 `executeRequest('updateWorklog'|'deleteWorklog')` 호출이 0건이다.
  - `worklogWrite.test.js`·`worklogDrop.test.js` 는 갱신했다.

### R1-3. D-1 — 스위치 OFF + 승인 앱 통제 문서 = 작성도 넘김
- `writeChannelOf` 표를 바꿨다(서버·화면 두 파일은 여전히 글자 그대로 같다). 서명 검증된 통제 문서가 있으면 스위치·소속과 무관하게 HANDOFF 다(경로 없으면 BLOCKED). 문서가 없으면 다음 표대로다.

  | 스위치 | 소속 | 결과 |
  |---|---|---|
  | OFF | 무관 | DIRECT |
  | ON | false | DIRECT |
  | ON | true | BLOCKED |
  | ON | null(판정 실패) | BLOCKED |
  | 모름 | — | BLOCKED |

- 화면:
  - `resolveWriteChannel` 은 서버 `writeChannel` 이 있으면 그것을 따른다. 없을 때만 OFF 는 DIRECT, 그 밖은 BLOCKED 다.
  - `resolveEditChannel` 은 같은 판정을 쓴다(WD1 의 작성·수정 비대칭 해소).
- 서버 `createIssueWorklog` 도 같은 표로 OFF + 통제 문서면 `WORKLOG_CREATE_HANDOFF_REQUIRED` 를 낸다. 이에 따라 연동 이슈 직접 작성 경로가 없어져 `assertWindow`(dw 기간 창) 는 죽은 코드가 되어 삭제했다. 기간 창은 승인 앱이 판정한다.
- 통제 문서 없는 OFF 이슈(승인 앱 없는 설치 포함)는 종전처럼 직접 작성한다.

### R1 결과
| 항목 | 결과 |
|---|---|
| 백엔드 jest | **171 suites / 2367 tests 전부 통과** |
| 프론트 jest | **171 suites / 2712 tests 전부 통과** |
| `CI=true npm run build` | 성공(exit 0). 경고는 node_modules 소스맵뿐 |
| 번들 | app main gzip **494,322B** / 950,000(52.0%). **panel main gzip 331,300B / 350,000(94.7%, 여유 18,700B)** — 회차 전 331,252B 에서 +48B. 패널 변경 시 예산 주의는 그대로 |
| 계약 해시(LF) | `contract.js` **`e09c253422a339103a872bcef7705a0d49935673f06fc318d6431d180c833c5a`**, `vectors.json` **`7b746bdc4b4805d078d4eac679998abee3140b8075c47fb504b6adcd006a5f51`** — 승인 앱 확정본과 일치(마지막 단계에 복사·재대조) |
| rx 토큰 | `rms.issue.fl`(결재선 칸), `approval.flows`(결재선 목록) — 승인 앱 `CTL_RX` 와 같음 |

### R1 미검증 (기존 §6 에 더해)
- 실행 시점 재판정은 수정·삭제마다 이슈 asUser GET 1회와 통제 문서 조회를 더한다. 단독 설치는 0회다. 연동 사이트의 드래그·저장 체감 지연은 실측하지 않았다.
- `WORKLOG_EDIT_HANDOFF_REQUIRED` 의 cause.path 는 `router.navigate` 실측(U-1)에 함께 묶여 있다.

---

## 수정 회차 2 (재검증 1 권고, 2026-10-13)

- **R-U1·R-1 — 대상 워크로그 대조**: `IssueWorklogControlService.assertDirectEdit`(수정·삭제 공용)에 대조 단계를 넣었다. 연동 판정이 필요한 경로(plain 아님)에서는 판정 전에 대상 워크로그를 asUser 로 GET(`/rest/api/3/issue/{issueId}/worklog/{worklogId}`)해 본다.
  - 응답 `issueId`·`id` 가 요청과 다르거나 401·403·404 면 `APPROVAL_LINK_INVALID_INPUT`(소속 불일치)로 거부한다. 다른 이슈 id 로 판정만 비연동 이슈에서 받는 우회가 여기서 막힌다.
  - `author.accountId` 가 호출자와 다르면 `PERMISSION_DENIED` 로 거부한다.
  - 그 밖의 읽기 실패는 `WORKLOG_LINK_UNCONFIRMED`(fail-close)다.
  - 추가 Jira 호출은 연동 판정 경로에서만 1회다. 승인 앱 없는 단독 설치(스위치 OFF + 신뢰 키 없음)는 대조 없이 요청 1회 그대로다.
  - 대조가 판정보다 먼저라, 연동 이슈의 남의 워크로그는 넘김이 아니라 `PERMISSION_DENIED` 로 거부된다.
- **R-2**: 화면 직접 쓰기 정적 검사 패턴에 `addWorklog` 를 추가했다(`executeRequest('addWorklog'|'updateWorklog'|'deleteWorklog')` 0건).
- 테스트(`IssueWorklogControlService.test.js` "수정 회차 2" 6건):
  - 다른 이슈의 워크로그·응답 id 불일치·남의 워크로그 → 수정·삭제 모두 PUT·DELETE 0
  - 404 → 소속 불일치
  - 대조는 asUser GET 1회 후 실행
  - plain 경로는 요청 1회 그대로
  - 기존 수정·삭제 테스트의 Jira 흉내에 워크로그 GET 응답을 추가했다.
- 결과:
  - 워크포스 백엔드 jest **171 suites / 2373 tests 통과**
  - 프론트 jest **171 suites / 2712 tests 통과**
  - 계약 파일 무변경(해시는 회차 1과 같음)
  - 빌드는 백엔드·테스트 변경뿐이라 다시 돌리지 않았다. 패널 번들 무변경.
