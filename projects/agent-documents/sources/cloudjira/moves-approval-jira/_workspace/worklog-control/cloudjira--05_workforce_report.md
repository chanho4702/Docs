# 05 워크포스 리포 보고서 — worklog-control WF-7~13

작성 2026-10-11 · 대상 `C:\CloudJira\moves-workforce` 브랜치 `RFC-220`(HEAD `4788a77`, 미커밋 — 직전 audit-retention-sync 작업트리 위에 얹음)
입력: `01_architect_design.md` 2판 §0.4·§2.4·§3.3·§4.2·§4.4·§6.3·§12, `02_backend_report.md` 1~3회차, `codex-review.md`(P0-1·P0-2), 승인 앱 `CLAUDE.md` 불변식 8 예외, `src/integration/workforce/{contract,controlDoc}.js`, `domain/worklogControl/origin.js`, `domain/worklogPolicy/authority.js`
방향: 작성자 = 본인(asUser 작성) 유지. "앱 대행 작성"은 손대지 않음. 커밋·배포·`forge deploy` 하지 않음. 원래 미추적 파일(pptx 3·`캡처.png`·`custom-scopes.yaml`·`LeaderTeamBackfill.test.js`)은 건드리지 않음.

## 결과 요약

| 항목 | 결과 |
|---|---|
| 워크포스 백엔드 `npx jest --runInBand` | **158 suites / 2,181 tests 통과**(작업 전 152 / 2,090 → +6 suites, +91 tests) |
| 워크포스 UI `npx jest --runInBand` | **163 suites / 2,622 tests 통과**(작업 전 161 / 2,605 → +2 suites, +17 tests) |
| 워크포스 UI `CI=true npm run build` | 통과(경고는 기존 source map 3건), 번들 예산 안(main gzip 492,469 / 950,000 · panel 330,552 / 350,000) |
| 워크포스 `forge lint` | **No issues found**(경고 "PermissionLinter Unknown product"는 기존 상태). manifest·scope 무변경 |
| 승인 앱 `npx jest src/integration` | **7 suites / 154 tests 통과**(148 → +6, 골든 벡터 추가분) |
| 계약 바이트 대조 | 복사 대상 7개 동일(contract.js 지문 그대로, vectors.json 만 양쪽 갱신). 워크포스 봉투 2종(wlorigin·policy)·통제 문서·능력 신호를 **양 리포가 같은 벡터로** 교차 시험 |
| 워크포스 DB | 무증가(새 SQL 테이블·KVS 키 없음). 상태는 Jira 프로퍼티 자체 |

## 1. 구현 — WF 항목별

### WF-7 연동 모드 asApp 본인 워크로그 조회
- 신규 resolver **`getIssueWorklogControl`**(`'SELF'`) — `src/resolver/approvalLink/IssueWorklogControlService.js`.
  - 연동 판정 = 이슈 프로퍼티 `movesApproval.ctl`(이슈 단위) → 없으면 Jira 프로젝트 프로퍼티(프로젝트 단위)를 **서명 검증**(`integration/approval/controlDoc.verifyControlDoc` = `verifyEntry` family approval, ent `{projectId[,issueId]}`). 조회기는 `ApprovalControlLookup`(신뢰 키·cloudId·Ed25519 가 없으면 Jira 0, 프로젝트 문서 60초 캐시 — 키에 자격·조회자).
  - 연동이면 asApp `GET issue/{id}/worklog`(1000건×최대 5페이지)에서 6조건(§3)을 통과한 **본인 숨김 기록만** `via:'APP'` 로 반환. 응답 `{linked, control:{basis, vs, dw, sf, tz, globalPagePath}|null, hidden[], truncated}`.
  - 승인 앱도 우리 서명 키도 없는 사이트는 **Jira 호출 0**(패널 비용 불변).
- 패널(`useIssuePanelData`) — `issuePanelKeys.control(issueId)` 쿼리로 받아 Jira 목록에 합침(`panelApproval.mergeHiddenWorklogs`, 같은 id 는 Jira 쪽 우선). "전체 N건"·내 몫에 합친 본인 숨김분만 더함. 숨김 행 배지 "숨김"(툴팁: Jira 화면엔 안 보임·본인에게만).
- 협업 집계(⑥ 앱 자격 경로) — `CollabWorklogFetcher.isUnrestrictedWorklog` 제외는 그대로 두고, **승인 앱 통제분만** 별도 판정기(`collabControlOf` → `isApprovalHidden`: 서명 검증된 통제 문서 + visibility = vt)로 통과. 대시보드 히트맵·lineStack, 캘린더, 이슈 드로어 3경로 모두. cloudId 는 context 에서만(payload 불가) 컨트롤러가 넘김. 연동을 볼 수 없으면 검색 요청이 종전과 바이트 동일(`fields:['worklog']`, properties 없음 — 테스트 고정).
- 원가(⑦) — `ApprovalCertReader.hiddenCertifiedRowsOf`: 서명 검증된 인증 문서의 건별 id 중 Jira 행에 없고 삭제 비트가 아닌 것만 asApp `POST worklog/list`(1회 ≤1000) → 문서 작성자=응답 author, 이슈 ∈ 조회자 프로젝트 이슈 목록, 통제분(vt) 인 것만 원가 입력 행으로 보충. 응답은 기존처럼 집계뿐. (CONFIRMED_ONLY 를 켜면 인증분이 asUser 수집에서 통째로 빠져 원가가 줄던 결함을 막는다.)

### WF-8 수정·삭제는 승인 앱으로 넘김
- 패널: 연동 이슈의 본인 행은 ✎/🗑 대신 **넘김 버튼 하나**(`resolveApprovalRowMode` → `HANDOFF`) → `PanelWorklogHandoff`: 안내 + `router.navigate(ctl.ui.globalPagePath + "{issueId}/{worklogId}")`. 경로를 모르면(서명 문서에 없음·형식 밖) 안내 문구만("이슈의 작업 로그 탭에서"). 경로 형식은 서버·화면 둘 다 `/jira/apps/{uuid}/{uuid}/worklog/` 만 허용.
- 마이워크 모달: 기존 기록 편집을 열 때 `getIssueWorklogControl` 로 판정 → 연동이면 입력·저장·삭제 비활성 + 넘김 버튼/안내.
- 캘린더 드래그(마이워크 `WorklogPage.onEventDrop`, 프로젝트 캘린더 `worklogDrop.moveProjectWorklog`): 연동 이슈면 Jira 쓰기 없이 revert(+프로젝트 캘린더는 안내 토스트).
- **asApp 쓰기 실행기 없음**, 서명 문서로 허가 판단 없음(codex P0-2). 판정 실패는 "연동 아님"(화면 편의 판정 — 최종 거부는 Jira·승인 앱).

### WF-9 연동 신호 게시 (`movesRms.policy`)
- 봉투: `integration/approval/policySignal.js` — 승인 앱 `authority.verifyPolicyEnvelope` 형식(`moves-link/policy/1\n` + canonical, `{v,typ,iss,cloud,ent,kid,iat,exp,body:{rev,values:{},locks:{},ctl?}}`). 워크포스는 정책 값 권위가 아니므로 values·locks 는 빈 객체. TTL 28일(승인 앱 상한 30일), 남은 기간 7일 미만이면 재게시. rev = 발행 ms.
- 게시 시점(`ApprovalLinkSignals`, asApp ⑧):
  - **이슈 신호(I:)** — 패널 열람·패널 작성 때 그 이슈가 워크포스 연결 표식(`movesRmsLink.linked`)을 가졌고 우리 신호가 없거나·남의 서명·대상 불일치·만료 임박이면 PUT(이미 신선하면 PUT 0, 값은 같은 GET 응답에 실려 와 추가 GET 0). 관리자 일괄 게시(`publishApprovalLinkSignals`, JQL `moves_RMS_projectId is not EMPTY`, 100건/호출 커서).
  - **프로젝트 신호(P:)** — 관리자 일괄 게시 첫 페이지에서 스페이스(Jira 프로젝트) 구독으로 판정: 활성 ∧ 이슈 유형 필터 없음 ∧ 추가 JQL 없음 ∧ 하위 작업 포함 ∧ 백필(baseline 없음)이면 `ctl:'ALL_ISSUES'`, 아니면 **이미 걸려 있을 때만** `ctl:'NONE'`.
  - **해제** — `ProjectLinkWriter.clearProjectLink`(프로젝트에서 제외 등)·프로젝트 삭제 워커에서 이슈 신호 프로퍼티 DELETE(서명 키 없으면 호출 0, 실패는 해제를 막지 않음). cloudId 를 모르는 큐·스윕 경로라 서명된 NONE 대신 삭제다 — §5-1.
- `ctl:'ALL_ISSUES'|'NONE'` 은 이미 계약(contract.js RMS_POLICY validator `optional(b.ctl)`)·승인 앱 검증기에 있음 — 계약 변경 없음.

### WF-10 (Q123 b 프로젝트 기간) — 설계대로 **후속**, 손대지 않음.

### WF-11 계약 사본
- 복사 7개(`base64url·canonical·contract·ed25519·keyring·signature`·`vectors.json`)는 이미 승인 앱 현재본과 동일(`APPROVAL_CTL`·`RMS_WLORIGIN` TYP 포함) — 이번엔 **vectors.json 만** 양쪽 갱신(§2). `vectors.test.js` 지문 표 갱신.
- 워크포스 소유 순수 모듈 4개 추가(복사 대상 아님): `wlorigin.js`·`policySignal.js`·`controlDoc.js`(ctl 검증·vt 비교·넘김 경로·기간 창)·`orgCap.js`.
- CATALOG `worklogDateWindow`: 워크포스는 rms.policy 에 정책 값을 싣지 않으므로(values `{}`) 카탈로그 사본이 필요 없다(직전 작업에서 catalog.js 삭제 그대로).
- 간트 Start date 를 `ctl.sf` 로: **전환 보류**. 워크포스는 `customfield_10015` 를 간트·캘린더·이슈 표·진척·생성 모달 15곳 이상에 고정으로 쓰고 쓰기 경로도 있어, 필드를 바꾸면 다른 칸에 쓰게 된다. 대신 진단(WF-13 `START_FIELD`)이 `ctl.dw ∧ ctl.sf ≠ customfield_10015` 를 실패로 표시하고, **작성 경로는 ctl.sf 로 승인 앱과 같은 경계를 적용**한다(아래).

### WF-12 작성 출처 서명
- 프론트 직접 POST 제거: `components/worklog/worklogWrite.createWorklog` → `invoke('createIssueWorklog')`(패널·마이워크 모달·기간 일괄 입력 공용). 실패 시 `error.cause.message` 에 Jira 본문이 그대로 있어 "시간 추적 꺼짐" 판정(`isTimeTrackingUnsupportedError`)이 종전과 같다(테스트).
- 신규 resolver **`createIssueWorklog`**(`'SELF'`): asUser POST, 서명 키가 있으면 본문 `properties:[{key:'movesRms.origin', value:봉투}]`. 봉투 body = `{cloudId(context), issueId(Jira 응답 id), authorId(context.accountId), op(randomUUID), started(ms), seconds, iat, exp=iat+15분}`. 봉투·op 는 응답에 싣지 않음(`{id, issueId, signed}`).
  - 연동 이슈 ∧ `ctl.dw` 면 승인 앱과 같은 기간 창(fail-close): `ctl.sf`·duedate 를 asUser 로 읽어 현지 날짜(ctl.tz) 경계 포함 판정, 필드 모름·칸 없음·형식 오류·역전은 `WORKLOG_WINDOW_UNRESOLVED`, 밖이면 `WORKLOG_OUTSIDE_ISSUE_WINDOW`(POST 하지 않음). 패널·모달이 사유 문구로 표시.
  - 승인 앱도 서명 키도 없으면 이슈 선조회 없이 종전과 같은 POST 한 번.
- **능력 신호** `rms.org.cap = ['wlorigin']`: 서명 작성이 성공하면 작성자 본인 `movesRms.org`(asUser — Jira 는 본인 레코드 쓰기 허용)에 게시. 팀 칸은 비우되(`teamKey:null, leaderKeys:[], leads:[]` — 승인 앱 `forSubject` 는 결재자 없음 = 명부 사용), **이미 우리 서명 org 가 팀 칸을 가졌으면 보존하고 cap 만 더함**(남이 쓴 값은 옮겨 서명하지 않음). 인스턴스 메모 6시간.
- 서명 키: `LinkSigner`(승인 앱 `WorkforceSigner` 와 같은 env 규약, 계열 반대): `MOVES_LINK_SIGNING_KEY`·`MOVES_LINK_SIGNING_KID`(wf-*), 기존 `MOVES_LINK_TRUSTED_KIDS`(승인 앱 kid). RFC 8032 자가 시험 실패면 서명하지 않음.

### WF-13 워크포스 진단(관리자 전용)
- 신규 resolver **`getApprovalLinkDiagnostics`**(`W('SETTINGS')`) + 설정 > 기타 카드 `ApprovalLinkCard`. 항목: `SIGNER_READY`·`SIGNER_IN_KEYRING`·`APPROVAL_TRUST`·`ORG_CAP`(G_ORIGIN) / 시험 이슈(키·id 입력) 있으면 `CTL_DOC`(조회자 자격, G_LINK)·`CTL_DOC_APP`(앱 자격 — 협업·원가 경로가 같은 문서를 읽는가, G_WF)·`HANDOFF_PATH`(G_HANDOFF 자동 부분)·`START_FIELD`(G_FIELD)·`ISSUE_SIGNAL`·`APP_READ_HIDDEN`(앱 계정이 숨긴 기록을 실제로 읽는가 — **건수만** `{total, restricted, controlled}`, G_WF). 결과 PASS/FAIL/증거 없음 → 사람이 승인 앱 관문 화면에 기록(앱 사이 resolver 호출 없음).
- 같은 카드에 **연동 신호 일괄 게시** 버튼(`publishApprovalLinkSignals`, 커서 이어 부르기, 누계 표시). 서명 키 없으면 `APPROVAL_LINK_SIGNER_UNAVAILABLE`.

## 2. 계약 대조 (승인 앱 ↔ 워크포스)

| 계약 | 승인 앱(검증·생산) | 워크포스(생산·검증) | 고정 |
|---|---|---|---|
| `rms.wlorigin` 봉투 | `domain/worklogControl/origin.verifyWorkforceOrigin`·`workforceOriginMessage`(`moves-link/wlorigin/1\n`) | `integration/approval/wlorigin.buildWloriginEnvelope`·`wloriginMessage` | vectors.json `wlorigin[]`(envelope·created·messageHex): 승인 앱 signature.test 가 메시지 바이트+검증 `{ok:true, valuesMatch:true}`, 워크포스 vectors.test 가 **재서명 결과 = 벡터**(Ed25519 결정적) |
| `rms.policy` 봉투 | `domain/worklogPolicy/authority.verifyPolicyEnvelope`·`policyMessage` | `policySignal.buildPolicySignal`·`policyMessage` | vectors.json `policy[]`(이슈 신호·프로젝트 ALL_ISSUES 2건) — 양쪽 같은 방식 |
| `approval.ctl` | `integration/workforce/controlDoc.buildCtlDoc`(signEntry) | `controlDoc.verifyControlDoc`(verifyEntry family approval) | vectors.json `signatures[]` 에 approval.ctl 1건(양쪽 signEntry 재생성 it.each 자동 포함) + 워크포스가 검증·다른 이슈로 옮기면 실패 |
| `rms.org` cap wlorigin | `WorkforceLinkRepository.workforceOriginCapable`(VERIFIED org 중 cap) | `orgCap.buildOrgEntry`(signEntry) | vectors.json `signatures[]` 에 rms.org(cap wlorigin) 1건 |
| vt 비교 | `visibility.isOurRestriction`(그룹 identifier 소문자·역할 value) | `controlDoc.isControlledVisibility`(같은 규칙, 그룹 이름 불사용) | 단위 시험 |
| 기간 창 | `window.dateWindowOf`·`inWindow`(fail-close, 경계 포함, 현지 날짜) | `controlDoc.dateWindowOf`·`inWindow`(같은 규칙, 응답에 칸 없음 = READ_FAILED) | 단위 시험(서울/UTC 경계) |
| 넘김 경로 | `WorklogControlCtl.globalPagePathOf` = `/jira/apps/{appId}/{envId}/worklog/` | `handoffPathOf`/`approvalHandoffPath` 형식 검증 후 `{issueId}/{worklogId}` 덧붙임 | 단위 시험 |

- 복사 7개 LF sha256: `contract.js 529f1194…414b`(무변경), `vectors.json 6201e626…0cb2`(신규 — 워크포스 `vectors.test.js` 표 갱신). 나머지 5개 무변경. 로컬 형제 대조(`describeSibling`) 통과.
- **승인 앱에서 바꾼 파일은 `src/integration/workforce/vectors.json` 과 그 계약 테스트 `__test__/signature.test.js` 두 개뿐**(describe 「vectors.json 골든 — 워크포스 봉투(wlorigin·policy)」 + approval.ctl·rms.org cap 존재 단언).

## 3. 불변식 8 예외 6조건 충족 근거 (WF-7 경로별)

| 조건 | 이슈 탭 `getIssueWorklogControl` | 협업 집계(대시보드·캘린더·드로어) | 원가 보충 |
|---|---|---|---|
| ① 호출자 = 서버 context | `principalOf(context.accountId)` — 없으면 `PERMISSION_PRINCIPAL_UNRESOLVED`, payload 의 accountId 무시(테스트: payload 에 남의 id 를 넣어도 본인만) | 가드 PROJECT read·detail + `CollabAccess`(기존 ⑥), cloudId 는 context 에서만 | 가드 PROJECT_COST read·detail + CostAccess(기존 ⑦) |
| ② 선제한 + 응답 재대조 | SQL 후보가 없으므로 asApp 응답 **전 건**에서 `author.accountId === 호출자 ∧ issueId === 요청 이슈 ∧ id 숫자`(테스트: 다른 이슈 id·형식 위반 제외) | 기존 author 필터(keep)가 통제분에도 그대로 적용(테스트) | 후보 = 서명 검증 인증 문서 건별 id, 응답 author = 문서 주인 대조(테스트: 다른 작성자 제외) |
| ③ 조회자 이슈 열람 | asApp 전에 asUser `GET issue` — 403/404 면 `APPROVAL_LINK_ISSUE_NOT_FOUND`, asApp 0(테스트) | 협업 모드의 기존 규칙(참여자에게 프로젝트 이슈 조회를 연 경로 — 공개 기록과 같은 범위) | 이슈가 조회자 asUser 프로젝트 이슈 목록에 있어야 함(테스트: 목록 밖 이슈 제외) |
| ④ 통제분만 | 서명 검증된 ctl + `isControlledVisibility(visibility, vt)`(테스트: 원래 그룹 제한된 본인 기록 제외) | `isApprovalHidden` 같은 판정(테스트: 판정기 없으면 제한분 전부 제외 = 종전) | 같은 판정(테스트: 통제분 아니면 제외) |
| ⑤ 설명은 작성자에게만 | 본인 기록만 남으므로 comment 는 작성자 본인 것. visibility 원문은 응답에서 뺌 | **(3회차 수정)** 1·2회차엔 캘린더·드로어가 숨긴 **남의** 기록을 설명까지 행으로 냈다(위반). 지금은 행 경로(`collabControlOf(cloudId,{viewerId})`)가 조회자 본인 숨긴 기록만 통과 — 그 행의 설명은 작성자=조회자. 남의 숨긴 기록은 대시보드 집계 숫자(`{aggregateOnly:true}`)에만 들어가고 행·설명·개별 작성자로는 나가지 않는다(드로어 total 에서도 빠짐) | 행에 설명·이름 없음(계산 입력) |
| ⑥ 합계·캐시도 같은 범위 | 응답에 남의 숨김 기록 수·존재 없음(테스트: OTHER 문자열 부재, total 키 없음). 서버 캐시 없음, 화면 캐시는 조회자 iframe | 기존 `Collab:` KVS 캐시(앱 자격 전용 키, 참여자 공용) — 캐시에 드는 것은 집계 숫자뿐(남의 숨긴 기록은 숫자로만). 행 경로(캘린더·드로어)는 캐시 없음 | 응답은 집계뿐, `certCost` 캐시 미저장(기존) |

- 판정 원천은 승인 앱 현재 DB 가 아니라 **서명 문서**지만, 여기서는 "표시·집계 포함"만 정하고 쓰기 허가에 쓰지 않는다(P0-2). 낡은 ctl 은 표시만 바꾼다.
- 남의 숨김 기록 존재 비노출: 이슈 탭은 본인 것만 반환하고 건수도 본인 합친 수만 더한다. 협업 행 경로(캘린더·드로어)도 3회차부터 본인 것만, 남의 것은 대시보드 집계 숫자에만. 진단(관리자)은 시험 이슈 건수만.

## 4. 바꾼 파일 (이번 작업분 — 직전 audit-retention-sync 변경은 제외)

워크포스 신규
- `src/integration/approval/{wlorigin,policySignal,controlDoc,orgCap}.js`
- `src/resolver/approvalLink/{LinkSigner,ApprovalControlLookup,ApprovalLinkSignals,IssueWorklogControlService,ApprovalLinkAdminService,ApprovalLinkController}.js`
- `static/ui/src/panel/{panelApproval.js,PanelWorklogHandoff.jsx}`, `static/ui/src/backoffice/page/setting/{ApprovalLinkCard.jsx,approvalLinkDiag.js}`
- 테스트: `src/integration/approval/__test__/linkEnvelopes.test.js`, `src/resolver/approvalLink/__test__/{IssueWorklogControlService,ApprovalLinkSignals,ApprovalControlLookup,ApprovalLinkAdminService}.test.js`, `src/api/jira/worklog/__test__/CollabApprovalHidden.test.js`, `static/ui/src/panel/__test__/panelApproval.test.js`, `static/ui/src/backoffice/page/setting/__test__/approvalLinkDiag.test.js`

워크포스 수정
- 등록·권한: `src/index.js`(CONTROLLER_REGISTRARS + `registerApprovalLinkController`), `src/permission/PermissionMap.js`(4: `getIssueWorklogControl`·`createIssueWorklog` = SELF, `getApprovalLinkDiagnostics`·`publishApprovalLinkSignals` = W SETTINGS), `src/utils/errors/ErrorCodes.js`(6: `APPROVAL_LINK_INVALID_INPUT`·`_ISSUE_NOT_FOUND`·`_SIGNER_UNAVAILABLE`·`WORKLOG_CREATE_FAILED`·`WORKLOG_OUTSIDE_ISSUE_WINDOW`·`WORKLOG_WINDOW_UNRESOLVED`)
- 협업: `src/api/jira/worklog/CollabWorklogFetcher.js`, `src/api/jira/issue/CollabIssueFetcher.js`(`findIssueInCollabProject`·캘린더 extraProperties), `src/resolver/projectCollab/{CollabCalendarService,CollabIssueWorklogService,ProjectCollabController}.js`, `src/resolver/projectDashboard/{ProjectDashboardService,ProjectDashboardController}.js`(cloudId 전달)
- 원가: `src/resolver/approvalLink/ApprovalCertReader.js`(`hiddenCertifiedRowsOf`), `src/resolver/projectCost/ProjectCostService.js`(이슈 색인에 Jira projectId)
- 신호 해제: `src/api/jira/field/ProjectLinkWriter.js`, `src/resolver/project/ProjectDeletionWorker.js`
- 구독 조회: `src/rdb/query/ProjectSubscriptionQuery.js`(`FIND_SPACE_SOURCES`), `src/resolver/projectSubscription/ProjectSubscriptionRepository.js`(`findSpaceSubscriptionsRepository`)
- 계약: `src/integration/approval/vectors.json`(승인 앱과 동일 바이트), `__test__/vectors.test.js`
- 기존 테스트 기대값 갱신 2곳(의도된 변경): `DashboardCollabAuthority.test.js`(collab 집계 인자에 `cloudId:null`), `ProjectCostCertification.test.js`(이슈 색인에 `projectId`)
- 프론트: `components/worklog/worklogWrite.js`(+test), `panel/{useIssuePanelData.js,PanelRecentWorklogs.jsx,PanelWorklogForm.jsx,IssueActivityPanel.jsx}`, `pages/myWork/modal/WorklogModal.jsx`, `pages/myWork/WorklogPage.jsx`, `pages/projectDetail/calender/worklogDrop.js`(+test), `backoffice/page/setting/EtcSetting.jsx`, `utils/queryKey/issuePanelKeys.js`(+factories test)
- 번역: `locales/{kr,en}/issuePanel.json`(`approval.*` 12키), `locales/{kr,en}/setting.json`(`approvalLink.*` 31키), `npm run merge` 산출 `ko-KR.json`·`en-US.json`
- 문서: `AGENTS.md` 보안 절 asApp **⑧** 추가. gitignore 대상 `CLAUDE.md` Jira API 절에 한 줄(로컬만)

승인 앱 수정: `src/integration/workforce/vectors.json`, `src/integration/workforce/__test__/signature.test.js` — 둘뿐.

## 5. 미검증·주의

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | ~~해제 경로의 신호 회수가 삭제~~ → **2회차에서 서명된 NONE 으로 바꿈**(§8). cloudId 를 끝내 못 얻을 때만 삭제 후퇴 | 진단 `CLOUD_ID_SOURCE` |
| 2 | 앱(Forge) 계정이 `movesRms.policy` 이슈·**프로젝트** 프로퍼티를 PUT 할 수 있는가(프로젝트 프로퍼티는 Administer projects 필요 — 승인 앱 ctl 게시와 같은 미검증) | 진단 일괄 게시 결과의 failed, 개발 사이트 실측 |
| 3 | 워크포스 앱 계정이 승인 앱 통제 visibility(앱 역할) 기록을 읽는가(G_WF) | 진단 `APP_READ_HIDDEN`(통제분 있는 시험 이슈) |
| 4 | asUser 로 **본인** 사용자 프로퍼티 PUT(`movesRms.org`) 허용 여부·scope(`write:jira-work`) | 서명 작성 후 진단 `ORG_CAP` |
| 5 | 검색 `properties:['movesApproval.ctl']` 응답에서 프로퍼티가 없을 때 키가 빠지는지/빈 객체인지 — 빠지면 이슈별 GET 이 생김(정확성은 유지, 비용만) | 협업 캘린더 호출 수 관찰 |
| 6 | `router.navigate` 로 다른 앱 전역 페이지 하위 경로 이동(G_HANDOFF) | 두 앱 설치 화면 |
| 7 | Jira 가 POST 본문 `properties` 를 asUser 생성에서 받아 들이는가, 타 앱(승인 앱)이 `expand=properties` 로 읽는가(G_ORIGIN) | 승인 앱 G_ORIGIN 자동 진단 + 워크포스 탭 작성 |
| 8 | 키링 두 계열이 운영에서 비어 있음 — 키 등록(`keyring.js` 양쪽 + `forge variables set --encrypt`) 전엔 WF-7~13 전부 휴면(작성은 서명 없이 종전대로) | 키 등록 시 진단 |
| 9 | 간트·캘린더·이슈 표의 시작일은 여전히 `customfield_10015` 고정 — 승인 앱 `sf` 가 다르면 화면 경계와 작성 경계가 갈린다(작성은 sf 기준) | 진단 `START_FIELD` |
| 10 | 숨김 대조 상한(이슈당 5,000건) 초과 시 `truncated` 만 알리고 화면은 아직 표시하지 않음 | 대형 이슈에서 |

## 6. 승인 앱에 요구할 변경

1. **이슈 연동 신호(I:) 자동 수신 경로** — 지금 승인 앱은 `rms.policy` 를 관리자 `refreshWorkforcePolicies({projectId, issueIds≤100})` 로만 읽는다. 워크포스는 이슈 단위로 신호를 걸지만 승인 앱이 이슈 id 를 모르면 수신되지 않아 `controlLinkOf` 가 사실상 false(ctl 미게시 → 워크포스 연동 모드도 미발동). 제안: 워크로그 이벤트·작업 로그 탭 열람 때 그 이슈의 `movesRms.policy` 를 asUser 로 읽어 검증·반영(신선도 캐시), 또는 프로젝트 refresh 가 JQL 로 신호가 걸린 이슈를 찾게(엔티티 프로퍼티 색인 필요).
2. **프로젝트 신호(P:)** 는 워크포스가 필터 없는 전체 스페이스 구독에만 `ALL_ISSUES` 를 건다 — 승인 앱 관리자 refresh(프로젝트)로 수신된다. 이 규칙을 승인 앱 안내 문구에 반영 요청.
3. **cap 신호 수신 지연** — `workforceOriginCapable()` 은 `workforce_inbound` 의 VERIFIED rms.org 만 보는데, rms.org 는 그 사용자가 승인 앱을 쓸 때(selfRead)만 갱신된다. DELETE 저장 화면의 "워크포스 능력 신호 없음"이 실제와 다를 수 있다 — 관리자 본인 org 를 즉시 refresh 하는 버튼(또는 진단 시 selfRead) 요청.
4. ~~삭제(ABSENT) 처리 결정~~ — 코디네이터 결정(2회차): 워크포스가 서명된 NONE 을 보낸다. 승인 앱은 "서명된 NONE 즉시 해제" 수신 확인만(다른 에이전트 담당).
5. 승인 앱 리포의 `vectors.json`·`signature.test.js` 변경을 **워크포스 변경과 같은 회차에 커밋**(지문 표가 서로를 고정한다).
6. (참고) 승인 앱 ctl `ui.globalPagePath` 가 null 이면 워크포스는 "작업 로그 탭에서 수정" 안내만 한다 — G_HANDOFF 통과 전에는 이 경로가 주 경로다.

## 7. 검증 명령(실행 결과)

```
moves-workforce   npx jest --runInBand                → 158 suites / 2,181 tests passed
moves-workforce   static/ui: npx jest --runInBand     → 163 suites / 2,622 tests passed
moves-workforce   static/ui: CI=true npm run build    → OK (main 492,469 · panel 330,552 gzip)
moves-workforce   forge lint                          → No issues found
moves-approval    npx jest src/integration            → 7 suites / 154 tests passed
```


---

# 2회차 (2026-10-11) — 코디네이터 결정: 해제는 서명된 NONE

> 결정: 해제가 최대 29일 늦는 것은 받지 않는다. 큐·스윕 경로에서도 저장 없이 Forge 설치 컨텍스트에서 cloudId 를 얻어 **서명된 `ctl:'NONE'`** 을 보내고, 못 얻을 때만 삭제로 후퇴(로그·진단 표시).

## 8. 구현

- 신규 `src/resolver/approvalLink/InstallCloudId.js` — `resolveInstallCloudId({explicit, invocation})`. 순서: ① resolver `context.cloudId`(EXPLICIT) ② 트리거·컨슈머 context/event 의 `cloudId` 또는 `installContext` ARI `ari:cloud:jira::site/{cloudId}`(INSTALL_CONTEXT) ③ `getAppContext().installation.contexts[].cloudId`(또는 그 ARI 문자열)(APP_CONTEXT) ④ `__getRuntime().contextAri`(RUNTIME_ARI) ⑤ 없음(NONE). 저장 없음(KVS·SQL 0).
- `ApprovalLinkSignals.withdrawIssues(ids, {cloudId, invocation})` 재작성:
  - cloudId 확보 → 이슈마다 앱 자격 `GET issue/{id}?fields=project&properties=movesRms.policy` 1회 → **우리 신호가 걸려 있을 때만** Jira 프로젝트 id 로 서명된 NONE(`ensure` — 이미 신선한 NONE 이면 PUT 0). 신호가 없는 이슈엔 아무 것도 만들지 않는다. 결과 `{mode:'SIGNED_NONE', cloudIdSource, released, unchanged, failed}`.
  - 확보 실패 → 그때만 프로퍼티 DELETE + `console.warn('[APPROVAL LINK] signal withdraw fallback — cloudId unavailable …')`, 결과 `mode:'DELETE_FALLBACK'`.
  - 서명 키 없음 → `mode:'DISABLED'`, Jira 0(종전과 같음).
- 호출 경로 cloudId 전달:
  - 큐: `queue/consumer.projectDeletion` 이 컨슈머 `context` 를 `runProjectDeletionRound(body, {invocation})` 로 → `runRound` → `unlinkBatch` → `withdrawIssues([id], {invocation})`. **큐 재적재 본문에는 싣지 않는다**(테스트).
  - resolver: `updateProjectIdField`·`deleteProjectIssue` 컨트롤러가 `context.cloudId` 를 서비스 → `clearProjectLink({…, cloudId})` 로.
  - 그 밖(스윕 등 context 를 안 넘긴 호출)은 ③·④ 런타임 설치 정보로 얻는다.
- 진단: 사이트 항목 `CLOUD_ID_SOURCE` 추가 — resolver context 를 보지 않고 **런타임 설치 정보만으로** cloudId 를 얻는지(큐 경로가 서명 NONE 을 보낼 수 있는지)와 그 값이 사이트 cloudId 와 같은지. 실패 표시는 "NONE (fallback: property delete)". 화면 카드 순서·번역(kr/en) 반영.
- `AGENTS.md` asApp ⑧ "게시" 항목에 해제 규칙(서명 NONE 기본 · cloudId 출처 순서 · 후퇴 조건) 추가.

## 9. 테스트로 고정한 것(신규 12)

- `InstallCloudId.test.js`(6): ARI 해석, explicit 우선, 컨슈머 installContext·이벤트 cloudId, 런타임 contexts(cloudId·ARI 문자열)→contextAri 순, 못 얻으면 NONE(실제 @forge/api 런타임 밖에서도 던지지 않음).
- `ApprovalLinkSignals.test.js`: ① 큐 경로 — 컨슈머 `installContext` 로 cloudId 확보 → 서명된 NONE PUT(`cloud`·`ent{projectId,issueId}`·`body.ctl:'NONE'`, 우리 키로 서명 검증) ② 우리 신호가 없는 이슈는 PUT 0 ③ 확보 실패 시에만 DELETE 후퇴 + 경고 로그.
- `ProjectDeletionWorker.test.js`: 컨슈머 context 가 이슈별 `withdrawIssues([id], {invocation})` 까지 전달, 재적재 큐 본문에 installContext 없음.
- 신규 `queue/__test__/ProjectDeletionConsumer.test.js`(2): 컨슈머가 context 를 `{invocation}` 으로 넘김, context 없으면 null.
- `ApprovalLinkAdminService.test.js`: `CLOUD_ID_SOURCE` 통과(런타임 값 = 사이트)·실패(불일치·없음).
- 기존 기대값 갱신 1곳(의도된 변경): `ProjectLinkPaths.test.js` — `clearProjectLink` 인자에 `cloudId: null`.
- 서명 NONE 의 바이트는 1회차 골든(`vectors.json policy[]`, 승인 앱 `verifyPolicyEnvelope` 통과)과 같은 빌더(`buildPolicySignal`)라 별도 벡터를 추가하지 않았다(`ctl` 만 다름 — 골든 2건 중 하나가 `ALL_ISSUES` 로 ctl 경로를 이미 고정).

## 10. 바꾼 파일(2회차)

신규: `src/resolver/approvalLink/InstallCloudId.js`, `src/resolver/approvalLink/__test__/InstallCloudId.test.js`, `src/queue/__test__/ProjectDeletionConsumer.test.js`
수정: `src/resolver/approvalLink/{ApprovalLinkSignals,ApprovalLinkAdminService}.js`(+테스트 2), `src/api/jira/field/ProjectLinkWriter.js`, `src/resolver/project/ProjectDeletionWorker.js`(+테스트), `src/queue/consumer.js`, `src/resolver/projectIssue/{ProjectUsersController,ProjectUsersService}.js`(+`ProjectLinkPaths.test.js`), `static/ui/src/backoffice/page/setting/approvalLinkDiag.js`, `locales/{kr,en}/setting.json`(+merge 산출), `AGENTS.md`
승인 앱: 이번 회차 변경 없음.

## 11. 결과

| 항목 | 결과 |
|---|---|
| 워크포스 백엔드 jest | **160 suites / 2,193 tests 통과**(1회차 158 / 2,181) |
| 워크포스 UI jest | 163 suites / 2,622 tests 통과 |
| `CI=true npm run build` | 통과(main 492,471 · panel 330,552 gzip, 예산 안) |
| `forge lint` | No issues found(manifest·scope 무변경) |
| 승인 앱 `npx jest src/integration` | 7 suites / 154 tests 통과 |

## 12. 미검증

- 실제 Forge 큐 컨슈머 context 에 `installContext` 가 실리는지, `getAppContext().installation.contexts` 가 이 앱 런타임 버전(@forge/api 7)에서 채워지는지 — 배포 후 관리자 진단 `CLOUD_ID_SOURCE`(런타임 경로)와 프로젝트 삭제 1건의 `[APPROVAL LINK] signal withdraw fallback` 경고 부재로 확인.
- 해제 대상 이슈를 앱 자격으로 GET(프로젝트·신호) 하는 1회가 해제 건수만큼 는다(프로젝트 삭제 시 이슈당 +GET 1, 신호가 있으면 +PUT 1). 서명 키가 없는 사이트는 0.


---

# 3회차 (2026-10-11) — 교차 검증(03_verify_report 회차 3) 워크포스 몫 2건

## 13. [P1] 협업 화면이 숨긴 남의 기록을 설명까지 냄 → 행은 본인만, 남의 것은 집계 숫자만

- 원인: 1회차의 `collabControlOf(cloudId)` 판정기가 작성자를 보지 않아, 캘린더(`collectRangeWorklogsAsApp` → `toCollabWorklog`)·이슈 드로어가 승인 앱이 숨긴 **남의** 기록을 설명(comment)·작성자까지 행으로 냈다. 사용자 결정 Q127 은 "내 워크로그"만이다. 1회차 보고서 §3 ⑤ 칸("공개 기록과 같은 DTO")은 사실과 달랐다 — 고쳐 적었다.
- 수정(`CollabWorklogFetcher.collabControlOf(cloudId, {viewerId, aggregateOnly})`):
  - **행 경로**(캘린더 `getCollabCalendarWorklog`, 드로어 `getCollabIssueWorklogs`): `viewerId = principal.accountId` — 숨긴 기록은 `author.accountId === 조회자` 일 때만 통과. viewerId 가 없으면 숨긴 기록은 하나도 통과하지 않는다(fail-close). 본인 행의 설명은 작성자=조회자라 ⑤ 충족. 드로어 `total` 에서도 남의 숨긴 기록은 빠진다(존재 비노출).
  - **집계 경로**(대시보드 히트맵·lineStack, `getProjectWorklogsAsApp` → `aggregateByDate`·`aggregateByUserDate`): `{aggregateOnly:true}` — 남의 숨긴 기록도 **숫자에만** 포함. 응답·`Collab:` 캐시에는 날짜·사람별 초 합계만 있고 행·설명은 없다. `getProjectWorklogsAsApp` 의 호출처는 이 두 집계뿐(전수 확인).
  - 공개 기록(visibility 없음)의 처리는 종전과 같다.
- 테스트 신규 `projectCollab/__test__/CollabApprovalHiddenRows.test.js`(4): 판정기(본인만·viewerId 없음 → 0·집계 경로는 작성자 무관), 드로어(남의 숨긴 기록이 행·설명·total 에 없음, 본인 숨긴 기록은 설명과 함께), 캘린더(본인 것만 행), 대시보드 집계(남의 숨긴 기록이 숫자에 포함, 설명 문자열 없음).

## 14. [P2] 위조 가능한 표식만 보고 연동 신호를 서명 → 서명 직전 소속 확인

- 원인: `touchSignal` 이 이슈 편집 권한자 누구나 쓸 수 있는 `movesRmsLink.linked` 만 보고 앱 키로 연동 신호를 서명했다. 위조 표식 → 승인 앱 `LINKED_ALL` 에서 그 이슈 워크로그 전체가 숨겨질 수 있었다.
- 수정:
  - 신규 `src/resolver/approvalLink/IssueMembership.isWorkforceProjectIssue({projectId, issueId})` — ① 워크포스 DB 에 그 프로젝트가 **활성**(`findActiveProjectByIdRepository`) ② 이슈 앱 필드 `moves_RMS_projectId` 가 그 프로젝트(앱 자격 JQL, 기존 `findLinkedProjectDeletionIssueIdsAsApp`) — 앱 필드는 앱만 쓴다(사용자 PUT 불가). 표식의 projectId 는 무엇을 확인할지 고르는 힌트일 뿐. 형식 오류·조회 실패 = false(fail-close).
  - `ApprovalLinkSignals.ensureIssueLinked({…, verifyMember})` — 신호가 이미 신선한 우리 것이면 확인을 부르지 않고(비용 0), 서명이 필요할 때만 확인. 소속 아님이면 **연동 신호를 서명하지 않고**, 무엇이든 신호가 걸려 있으면 서명된 NONE 으로 바꾼다(`RELEASED`), 없으면 아무 것도 안 씀(`NOT_MEMBER`).
  - `IssueWorklogControlService.touchSignal`(패널 열람·작성 공용)이 표식 projectId 를 힌트로 `verifyMember` 를 넘긴다. 표식도 신호도 없으면 게시 경로를 타지 않는다.
  - 관리자 일괄 게시(`publishApprovalLinkSignals`)는 대상 자체가 앱 필드 JQL(`moves_RMS_projectId is not EMPTY`, 앱 자격)이라 표식에 의존하지 않는다 — 변경 없음.
- 비용: 신호 갱신이 필요한 패널 열람·작성에만 SQL 1 + Jira 1(서명 키 없는 사이트 0).
- 테스트: 신규 `IssueMembership.test.js`(8 — 소속/표식 projectId 위조/이슈 id 형식/DB 비활성/앱 필드 불일치/조회 실패/형식 오류 시 SQL·Jira 0), `ApprovalLinkSignals.test.js` +5(소속 아님+신호 없음 → 서명 0, 소속 아님+걸린 신호 → 서명 NONE, 확인 실패 = 소속 아님, 신선한 신호면 확인 미호출, 소속이면 서명), `IssueWorklogControlService.test.js` +2(표식 projectId 로 확인 호출·표식도 신호도 없으면 미호출, 기존 1건 기대값을 `objectContaining` 으로).

## 15. 바꾼 파일(3회차)

신규: `src/resolver/approvalLink/IssueMembership.js`, `src/resolver/approvalLink/__test__/IssueMembership.test.js`, `src/resolver/projectCollab/__test__/CollabApprovalHiddenRows.test.js`
수정: `src/api/jira/worklog/CollabWorklogFetcher.js`, `src/resolver/projectCollab/{CollabCalendarService,CollabIssueWorklogService}.js`, `src/resolver/approvalLink/{ApprovalLinkSignals,IssueWorklogControlService}.js`(+테스트 2), `AGENTS.md`(asApp ⑧ 집계 포함·게시 항목)
프론트·번역·manifest·승인 앱: 변경 없음.

## 16. 결과

| 항목 | 결과 |
|---|---|
| 워크포스 백엔드 jest | **162 suites / 2,211 tests 통과**(2회차 160 / 2,193) |
| 워크포스 UI jest | 163 suites / 2,622 tests 통과(첫 실행에서 `kanbanPagination.test.jsx` 1건 실패 → 이번 회차 UI 무변경, 단독 3회·전체 재실행 모두 통과 — 타이밍성 불안정으로 판단) |
| `CI=true npm run build` | 통과(main 492,471 · panel 330,552 gzip, 예산 안) |
| `forge lint` | No issues found |
| 승인 앱 `npx jest src/integration` | 7 suites / 154 tests 통과 |
