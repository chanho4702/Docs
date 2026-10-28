# 02 백엔드 보고 — 워크포스(moves-workforce) · workforce-channel-rest

> 작성 2026-10-19 · backend-engineer(워크포스 담당) · 1회차
> 대상 리포 `C:\CloudJira\moves-workforce`(기준 `80e7d31` + 작업 트리). 커밋·배포·`forge deploy/install` 없음.
> 입력: `00_input/requirement.md`(D1~D6, Q1~Q6), `01_architect_design.md` §2·§4.4·§11.2·§12·§14, `04_spike_todo.md`, `SHARED_READY.md` 판 1.

## 결과 요약

| 항목 | 결과 |
|---|---|
| 백엔드 테스트 `npx jest --runInBand` | **180 suites / 2,511 tests 전부 통과** (작업 전 183 / 2,850 — writeGate 골든·무작위 벡터 등 property 계약 시험 삭제분) |
| 공유 채널 시험(워크포스 쪽) | `src/integration/channel/__test__` 3 suites / 67 tests 통과 — **옆 리포 바이트 대조 포함** |
| 관련 프론트 시험(무변경 확인) | `static/ui` worklog·setting·issue·myWork 27 suites / 416 tests 통과. 프론트 파일 변경 없음, 전체 빌드는 돌리지 않음 |
| `forge lint` | **0 errors, 0 warnings**, approval 1건 `MAJOR_VERSION_RULE`(egress 추가 — 예상대로). 별도 출력 `PermissionLinter … "Unknown product"` 경고 1줄(기존 Confluence 호환 설정 때문으로 추정, 미확인) |
| 공유 파일 sha256 | 13개 전부 `SHARED_READY.md` 판 1 과 일치(아래 표) |
| 설계와 충돌하는 불변식 | 없음. 설계와 다른 점 13건은 아래 §5 |

---

## 1. 공유 파일 복사·대조 (승인 앱 원본 → 워크포스)

`C:\CloudJira\moves-approval-jira\src\integration\channel\` 디렉터리 전체(`__test__` 포함)를 `C:\CloudJira\moves-workforce\src\integration\channel\` 에 바이트 그대로 복사했다. 수정 없음.
워크포스 `.gitattributes` 는 옛 `src/integration/approval/*` 9줄을 지우고 `src/integration/channel/** text eol=lf` 한 줄로 바꿨다(워크포스 작업 트리는 `core.autocrlf=true` — 이 줄이 없으면 체크아웃 때 CRLF 가 되어 해시가 깨진다).

| 파일 | 워크포스 sha256 | SHARED_READY 판 1 |
|---|---|---|
| base64url.js | 8f5d5d6a05bc05a436640e73b64241994e347cf4e265da4e000c9df2ab4abb87 | 일치 |
| canonical.js | 49461d79e171c3dc01c085f3db8905c1fbe6b902d1c78639b945a4bb95b87358 | 일치 |
| ed25519.js | cb1446f21631b77635b5f3384cf929e585f160e84cae2733e9b777142e3f99c3 | 일치 |
| envelope.js | 447c71c6b537ae3adf0161b82fcc80ece5dd8adb29d3111f11896e79428884d0 | 일치 |
| keyring.js | 3df89e952c691f98ab90274cbe3b97428bed3c0b0f689ecb93838028f49de77d | 일치 |
| ops.js | 347da390a8c10b5f18879c745cabdeb6c1bdc149a7bc7c6e99696c297a22bf3c | 일치 |
| pairingCode.js | 4360316801ba3f0dcbf2bc249ec0a77d821d70de09628f2787327e81a6fa760c | 일치 |
| peerUrl.js | d91fe6b6eaf5282a005849e2e139ff5976adeda5139b67dd544a7433b9d1a8cd | 일치 |
| rpcVectors.json | 331a79b428d7d602903c6d4dfe4cdf528967d8e5cd73af78d31078fc3bb172fa | 일치 |
| __test__/envelope.test.js | dc31e3513d92ab9cd90b0cc869fd701c242aadd43ea3f16eb89fb5a15276c046 | 일치 |
| __test__/pairingOps.test.js | 2ae3166db90240fe31d02249fb494e69f28fea9ba00d3259dc6bf0f80a92aa92 | 일치 |
| __test__/rpcVectors.gen.js | 5d1e6f47af2c1879f934b2972fb2f57450e267ccd1b08de5971a5b56e12dbdb1 | 일치 |
| __test__/sharedHash.test.js | ec0d4a320dbe99b6291f4719dcee958dac1123723ab530ad6a1fe2ab7c83e101 | 일치 |

## 2. 구현·삭제 목록

### 2.1 신규

| 경로 | 내용 |
|---|---|
| `src/integration/channel/*` | 공유 파일(위 표) |
| `src/resolver/approvalChannel/ActorScope.js` | AsyncLocalStorage 행위자 scope. `guardedDefine` 이 모든 resolver 를 `context.accountId` 로 감싼다. ChannelClient 는 accountId 인자가 없고 여기서만 읽는다(D6) |
| `…/ChannelState.js` | KVS `link:channel`(상태), secret `link:channel:peerUrl`, `link:pending`. `isPaired()` 단일 판정, 인스턴스 메모 30초, 성공 기록은 10분에 1회만 쓰기 |
| `…/ChannelClient.js` | `callApproval(op, data, {system?, idem?, cloudId?})` — **던지지 않음**, `{ok:true,data}` / `{ok:false, code, retryable, unavailable?}`. 서명 키·페어링·스키마(`validateRequestData`)·`isPeerUrl` 사전 검사, 8초 timeout, `redirect:'manual'`, 응답 `verifyResponse`(서명·nonce·from/to·linkId·cloudId·op·iat·응답 형태), 읽기만 1회 재시도, `STALE_LINK` 받으면 자기 상태 REVOKED |
| `…/ChannelServer.js` | webtrigger 진입 `channelServer`(§2.2 1~12단계). 1~8단계 KVS 0·최소 응답, 9 페어링(`pair.complete` 는 pending), 10 라이선스(명시적 비활성만), 11 `actorViolation`, `validateRequestData`, R1(sys·pair 만 asApp `/user` 활성, 메모 10분), 12 핸들러를 서명 actor 의 `ActorScope`(via `APPROVAL_CHANNEL`)로 실행. 던지지 않음 |
| `…/PairingService.js` | 코드 만들기(Q6)·붙여넣기·ping·rotate(새 URL → `sys.rekey` 확인 → 옛 URL 삭제, force)·unpair, 수신 `pair.complete`(pin sha256·1회 소비·같은 linkId+URL 재전송 멱등)·`sys.ping/rekey/unpair` |
| `…/handlers/orgGet.js` | `org.get` — 팀 인덱스·users(SQL 1~2)로 팀 칸 계산, rev = 팀 구조 세대, R1 = actor 가 워크포스 사용자, SYSTEM 은 subject 1명 |
| `…/handlers/orgTeams.js` | `org.teams` — `TeamsReadApi`(무변경, Q5)에 apiRoute 모양 요청을 넣어 같은 조립·가드 재사용 |
| `…/handlers/linkResolve.js` | `link.resolve` — asApp 검색 1회(앱 필드 `moves_RMS_projectId`) + 활성 프로젝트 SQL + KVS 설정. 표식 `movesRmsLink` 는 보지 않음 |
| `…/handlers/kbGet.js` | `kb.get` — 사이트 하루 근무 시간·공휴일(요청 프로젝트마다 같은 본문), rev = 본문 지문 |
| `…/handlers/changeNotify.js` + `ChannelEpoch.js` | AP→WF `change.notify` — KVS `approvalLink:epoch:{CERT|PERIOD|CONTROL|FLOWS}` 단조 갱신(멱등). 캐시 키에 epoch |
| `…/IssueSettingStore.js` | 팀장 설정 원장 KVS `approvalLink:issueSetting:{issueId}`(§5-1), batchGet 20건 단위, 깨진 값은 던짐 |
| `…/ApprovalNotifier.js` | WF→AP `change.notify` LINK(500건 단위)·KB. 사람 없으면 SYSTEM `link-withdraw` |
| `…/LegacyPropertyCleanup.js` | Q2 정리 — 본인 `movesRms.org` 앱 진입 때 asUser DELETE(인스턴스당 1회, 2027-04-01 이후 중지), 관리자 페이지 정리(연결 이슈 `movesRms.policy`·`movesRms.issue`, Jira 프로젝트 `movesRms.policy`·`movesRms.kb` asApp DELETE) |
| `src/domain/approvalLink/orgTeam.js` | `approverOf`·`memberTeamsOf`·`subLeadsOf`·`buildOrgTeam`(옛 orgCap.js 규칙 그대로)·상한 검사 |
| `src/domain/approvalLink/issueSetting.js` · `kb.js` | 설정 형식·저장 계획·채널 칸, 환산 기준 본문 — 순수 |
| 시험 | `approvalChannel/__test__/{ChannelServer,ChannelClient,PairingService,handlers,notifyAndScope}.test.js` + `channelTestKit.js`, `domain/approvalLink/__test__/orgTeam.test.js`(옛 orgCap 대칭·무작위 40 시드 이식), `integration/approval/__test__/certFixtures.js` |

### 2.2 재작성 (호출부 시그니처 유지)

| 경로 | 바뀐 것 |
|---|---|
| `resolver/approvalLink/ApprovalCertReader.js` | `loadApprovalCertDocs` 내부만 property 2단 읽기 → `cert.query`(purpose COST/STATS/BADGE, 50쌍 묶음, `next` 이어 묻기, 캐시 키 = 조회자·목적·CERT epoch). **export 이름·인자·반환 무변경**(삭제는 `approvalTrust` 하나) — 소비 서비스 11곳 import 무변경 |
| `…/ApprovalControlLookup.js` | `issue.control`(ROWS=조회자 / AGGREGATE=집계) + 같은 tick 묶음 + `prefetch` + 60초 메모. `isApprovalHidden` = 승인 앱이 답한 hidden id 포함 여부(vt 추정 폐기). 실패 → NO_TRUST/UNVERIFIED(비연동으로 접지 않음) |
| `…/IssueWorklogControlService.js` | 작성·수정·삭제 = `write.judge` → asUser 쓰기 → `write.commit`. DENY 그대로, DEFER·상대 장애·검증 실패 = 넘김(Q3). 숨김 본인 기록은 hidden id 가 있을 때만 asApp 스캔. 출처 봉투·신호 게시·org cap 제거 |
| `…/IssueApprovalSettingService.js` | KVS 저장 + `change.notify{SETTING, data}`, 결재선은 `flows.list`(페어링 ops 에 있을 때만) |
| `…/ApprovalLinkAdminService.js` · `ApprovalLinkController.js` | 진단·일괄 게시 → 연결 resolver 6개 + 정리 1개, `publishLinkedKbService` 는 KB 알림 |
| `…/LinkSigner.js` | import 를 `integration/channel/*` 로, property 전용 메서드(`verifyOwn`·`ownKeyring`) 삭제 |
| `…/orgEpoch.js` | `bumpOrgEpoch()` 시그니처 유지 + `change.notify{ORG, all}`(USER, 사람 없으면 SYSTEM `team-batch`) — 팀 쓰기 9곳 무변경 |
| `…/IssueMembership.js` | 검색의 property 동봉 제거 |
| `integration/approval/certification.js` | `readCertDoc`(서명 검증) → `docOfCertBody`(응답 본문 해석), `CertFlag` 지역 정의, `certPeriodsOfKeys` 삭제. 판정 함수 무변경 |
| `integration/approval/worklogApproval.js` | `localDateOf` 지역화(controlDoc 삭제). 판정 무변경 |
| `api/jira/worklog/CollabWorklogFetcher.js` | `collabControlOf` 가 행 경로 ROWS·집계 AGGREGATE, `prefetch`, 검색 property 없음 |
| `api/jira/field/ProjectLinkWriter.js` · `resolver/project/ProjectDeletionWorker.js` | 신호 회수 → `notifyLinkChanged`(연결·해제 모두, 삭제 큐는 묶음당 1회) |
| `resolver/backoffice/permission/PermissionController.js` | `ensureOrgCap` → 옛 org 프로퍼티 정리 |
| `permission/permissionGuard.js` | `withActor` 래퍼(ActorScope) 추가 — 가드 판정 무변경 |
| `permission/PermissionMap.js` · `src/index.js` · `manifest.yml` · `.gitattributes` | §3 |

### 2.3 삭제

`src/integration/approval/` 의 `contract.js`·`signature.js`·`controlDoc.js`·`flowsDoc.js`·`issueSetting.js`·`kbDoc.js`·`orgCap.js`·`policySignal.js`·`timesheetDoc.js`·`wlorigin.js`·**`writeGate.js`**·`writeGateVectors.json`·`vectors.json`·`canonical.js`·`base64url.js`·`ed25519.js`·`keyring.js`(→ channel 로 대체) 17개, 시험 8개(`flowsDoc`·`issueSetting`·`linkEnvelopes`·`orgCap`·`timesheetDoc`·`vectors`·`writeGate` test, `testKeys.js`).
`src/resolver/approvalLink/ApprovalLinkSignals.js`·`LinkedWriteGate.js`, 시험 5개(`ApprovalLinkResign`·`ApprovalLinkSettingSignals`·`ApprovalLinkSignals`·`KbMutationPublishing`·`LinkedWriteGate`).
합계 **삭제 32 파일**, git 기준 약 17,400줄 감소(벡터 JSON 포함). git 인덱스는 건드리지 않았다(`rm` 만, 스테이징 없음). 미추적 파일(`LeaderTeamBackfill.test.js`·`custom-scopes.yaml`·pptx·png)은 손대지 않았다.

**유지(무변경)**: `src/api/organization/TeamsReadApi.js`, manifest `organization-teams-read-api`, `organization-custom-scopes.yaml`(Q5), `ApprovalCertReader` 소비 서비스 11곳, `domain/approvalLink/writeChannel.js`(§5-7).

## 3. 등록·manifest

**resolver 3단계** (`guardedDefine` → `PermissionMap` → `CONTROLLER_REGISTRARS`(기존 `registerApprovalLinkController` 그대로)) — 계약 시험 `test/permission/permissionMap.contract.test.js` 통과.

| resolver | 축 | 비고 |
|---|---|---|
| `getApprovalLinkStatus` | `W('SETTINGS')` | 신규(옛 `getApprovalLinkDiagnostics` 대체) |
| `createApprovalPairingCode` / `acceptApprovalPairingCode` / `rotateApprovalChannelUrl` / `unpairApproval` / `pingApproval` | `W('SETTINGS')` | 신규 |
| `cleanupApprovalLinkProperties` | `W('SETTINGS')` | 신규(설계 밖 — §5-6) |
| `getApprovalLinkDiagnostics` · `publishApprovalLinkSignals` | — | **삭제** |
| `getIssueWorklogControl` · `create/update/deleteIssueWorklog` | `SELF` | 이름 유지, 내부만 채널 |
| `listIssueApprovalSettings` · `saveIssueApprovalSettings` | 기존 그대로 | 내부만 KVS·채널 |

**manifest** (major — lint `MAJOR_VERSION_RULE`)
```yaml
modules:
  webtrigger:
    - key: workforce-link-channel
      function: channelServer
      response:
        type: dynamic
  function:
    - key: channelServer
      handler: index.channelServer
permissions:
  external:
    fetch:
      backend:
        - address: "1bd06760-bb28-4180-a231-23e9029c7ea7.hello.atlassian-dev.net"
        - address: "1bd06760-bb28-4180-a231-23e9029c7ea7.hello.atlassian.net"   # production 도메인 미검증 S1
```
scope 변경 없음, `allowImpersonation` 추가 없음(워크포스는 R2 를 쓰지 않음). apiRoute 추가 없음.
`src/index.js`: `export { channelServer } from './resolver/approvalChannel/ChannelServer';`
SQL 마이그레이션 없음(워크포스 DB 무증가). 새 KVS 키: `link:channel`, `link:channel:peerUrl`(secret), `link:pending`, `approvalLink:epoch:{CERT|PERIOD|CONTROL|FLOWS}`, `approvalLink:issueSetting:{issueId}`(§5-1), 기존 `approvalLink:orgEpoch`.

## 4. 실제 응답 shape (글자 그대로)

워크포스 `responseWrapper` 는 서비스 반환을 펼친다 → `{ success: true, ...result }` / 실패 `{ success: false, error: { name, code, message, cause } }`. 승인 앱처럼 `content` 로 감싸지 않는다.

### 4.1 연결 화면 resolver (프론트 재작성 대상)

```js
// getApprovalLinkStatus() →
{ success: true,
  enabled: true | false | null,            // approvalLinkMode === 'ON' (설정 읽기 실패 null)
  channel: {
    status: 'UNPAIRED' | 'PENDING' | 'PAIRED' | 'REVOKED',   // PENDING = 미연결 + 유효한 내 코드 있음
    pairedAt: number | null, pairedBy: accountId | null,      // PAIRED 일 때만
    peerApp: 'approval', peerVersion: string | null, peerOps: string[],
    lastOkAt: number | null, lastErrorCode: string | null, pendingExp: number | null,
  },
  signer: { ready: boolean, kid: string | null, fingerprint: string | null, inKeyring: boolean, trustedApprovalKids: string[] } }

// createApprovalPairingCode() → { success: true, code: 'MLNK1.….…', exp: number }
//   error.code: SIGNER_NOT_READY | LINK_DISABLED(연동 스위치 OFF) | CLOUD_ID_UNAVAILABLE

// acceptApprovalPairingCode({ code }) → { success: true, status: 'PAIRED', pairedAt: number }
//   error.code: PAIR_CODE_MALFORMED | PAIR_CODE_UNTRUSTED | PAIR_ENV_MISMATCH | PAIR_SITE_MISMATCH | PAIR_EXPIRED | PAIR_URL_INVALID
//             | PAIR_PEER_UNREACHABLE | PAIR_PEER_REJECTED (둘 다 error.cause.peerCode = 상대 코드) | SIGNER_NOT_READY | ACTOR_REQUIRED

// rotateApprovalChannelUrl({ force?: boolean }) → { success: true, rotated: true, peerConfirmed: boolean }
//   error.code: NOT_PAIRED | PAIR_PEER_UNREACHABLE (force 없이 상대 무응답 — 옛 URL 유지)
//   force:true + 무응답 → peerConfirmed:false, 자기 상태 REVOKED(재연결 필요)

// unpairApproval() → { success: true, status: 'REVOKED', peerNotified: boolean }

// pingApproval() → { success: true, ok: true, latencyMs: number, proto: 1, ops: string[], peerVersion: string | null, peerLinkEnabled: boolean }
//   error.code: NOT_PAIRED | PAIR_PEER_UNREACHABLE (cause.peerCode)

// cleanupApprovalLinkProperties({ cursor?: string }) → { success: true, scanned: number, removed: number, failed: number, nextCursor: string | null }
//   error.code: INVALID_TARGET
```

### 4.2 기존 이름 유지 resolver (shape 변화)

```js
// getIssueWorklogControl({ issueId }) →
{ success: true, linked: boolean,
  control: { basis: 'ISSUE', channel: 'OPEN' | 'HANDOFF', globalPagePath: '/jira/apps/{app}/{env}/worklog/' | null, permission: 'UNVERIFIED' | null } | null,
  hidden: [{ id, issueId, author: { accountId, displayName, avatarUrls }, started, timeSpentSeconds, comment, created, updated, via: 'APP' }],
  truncated: boolean, target: boolean,
  writeChannel: 'DIRECT' | 'HANDOFF' | 'BLOCKED', createChannel: (writeChannel 과 같음), gated: boolean /* = channel === 'OPEN' */ }
//   control 의 옛 칸 vs·dw·sf·tz·ch·rx 는 없어졌다(화면은 globalPagePath 만 썼다 — 확인함).

// createIssueWorklog({ issueId|issueIdOrKey, started, timeSpentSeconds, comment?, dryRun? }) →
{ success: true, id, issueId, signed: boolean /* 승인 앱 op 에 묶여 저장됨 */, approvalStatus?: 'PROCESSING', postCheck?: true }
// dryRun → { success: true, dryRun: true, verdict: 'ALLOW', notices: [], postCheck?: true }   (notices 는 항상 [] — 채널 judge 에 없음)
//   error.code: 승인 앱 DENY 코드 그대로(WORKLOG_PERIOD_LOCKED 등, cause 동봉) | WORKLOG_CREATE_HANDOFF_REQUIRED(cause {path, reason})
//             | WORKLOG_LINK_UNCONFIRMED | WORKLOG_CREATE_FAILED | APPROVAL_LINK_INVALID_INPUT | PERMISSION_PRINCIPAL_UNRESOLVED
//   cause.reason: 승인 앱 DEFER reason | 'APPROVAL_UNAVAILABLE'(상대 장애·응답 검증 실패) | 'ACTOR_PERMISSION_UNVERIFIED' 등 상대 오류 코드

// updateIssueWorklog → { success: true, worklog, postCheck?: true }
// deleteIssueWorklog → { success: true, deleted: true, postCheck?: true }
//   error.code: WORKLOG_EDIT_HANDOFF_REQUIRED(cause {path, reason: 'CONTROLLED'|…}) | 승인 앱 DENY 코드 | PERMISSION_DENIED | WORKLOG_UPDATE/DELETE_FAILED …

// listIssueApprovalSettings → { success: true, items: [{ issueId, issueKey, summary, jiraProjectId, assignee, startDate, dueDate, plannedSeconds,
//     setting: { s, e, pa, fl, wa: null, by, rev, at } | null, capabilities: { worklogApproval: false, fl, flows }, leaderKeys, state: 'SET' | 'NONE' }],
//   nextCursor, canEdit, approvalPresent /* = 페어링됨 */, approvalLinkRecommended, capabilities: { fl, flows }, flowsByProject: { [jiraProjectId]: { req, def, options: [{ id, label }] } | null } }
//   'UNVERIFIED' state 는 더 이상 나오지 않는다(KVS 는 위조 불가). KVS 값 손상 → error.code ISSUE_SETTING_UNREADABLE
// saveIssueApprovalSettings → { success: true, results: [{ issueId, result: 'SAVED'|'UNCHANGED'|'CONFLICT'|'NOT_MEMBER'|'FAILED', rev }], kbStale: false, approvalNotified: boolean }
//   item.wa 를 보내면 ISSUE_SETTING_UNSUPPORTED(§5-2)
```

### 4.3 webtrigger 작업 응답 `data` (승인 앱이 받는 모양 — 전부 `ops.js` 응답 형태 검증을 시험으로 통과)

```js
// org.get    → { orgs: { [accountId]: { teamKey, teamName, leaderKeys: [], leads: [{ teamKey, teamName, memberKeys: [] }], rev /* 팀 구조 세대 epoch ms, 없으면 0 */ } } }
//              워크포스 사용자가 아니면 { teamKey:null, teamName:null, leaderKeys:[], leads:[], rev }. 오류: ACTOR_NO_ACCESS, ACTOR_NOT_ALLOWED, ORG_INDEX_TRUNCATED
// org.teams  → TeamsReadApi content 그대로 { teams: [...], page: { offset, size, nextOffset, truncated }, limits } (+ 잘렸으면 truncated:true)
//              오류: ACTOR_NO_ACCESS(워크포스 권한 거부), MALFORMED, INTERNAL. offset 은 0·10·…·990 만(TeamsReadApi 규칙)
// link.resolve → { issues: { [issueId]: { linked, released, wfProjectId: uuid|null, projectId: jiraProjectId|null, setting: { s, e, pa, fl, tk, by, rev } | null } } }
//              released = 앱 필드에 값이 있는데 그 프로젝트가 비활성(삭제·삭제 중). 못 찾은 이슈는 전부 false/null
// kb.get     → { kb: { [projectId]: { dm, hol: [['YYYY-MM-DD', percent]], from: 'YYYY-01', to: 'YYYY+1-12', rev } } }   오류: KB_HOLIDAYS_TRUNCATED
// change.notify → { applied: 0 | 1 }
// pair.complete → { pairedAt, proto: 1, ops: [워크포스가 받는 9개] }   오류: PAIR_EXPIRED, PAIR_PIN_MISMATCH, PAIR_URL_INVALID, PAIR_ALREADY_PAIRED
// sys.ping   → { proto: 1, ops, app: 'workforce', version: appVersion|null, linkEnabled }
// sys.rekey / sys.unpair → {}
```

워크포스가 보내는 작업: `pair.complete`·`sys.ping`·`sys.rekey`·`sys.unpair`·`cert.query`·`issue.control`·`write.judge`·`write.commit`·`flows.list`·`change.notify`(ORG/LINK/SETTING/KB). **`period.status` 는 쓰지 않는다**(워크포스에 v1 상태 표시 소비자가 없음 — 옛 사용처는 삭제된 LinkedWriteGate 뿐).

## 5. 설계와 다른 점

1. **팀장 이슈 설정 원장 = KVS** — 설계 §4.4 는 "자기 SQL 저장은 기존 그대로"라고 했지만 실제 원장은 이슈 프로퍼티 `movesRms.issue` 뿐이었다(SQL 없음). property 를 원장으로 계속 쓰면 편집 권한자 누구나 고칠 수 있어 서명 코드가 다시 필요하므로 KVS `approvalLink:issueSetting:{issueId}` 로 옮겼다. **옛 property 값은 이관하지 않는다**(서명 검증 없이 들이면 위조값이 원장이 된다) — 팀장이 다시 저장해야 한다. 운영 사이트에 설정이 있으면 이관 방법 결정 필요.
2. **`wa`(이슈별 워크로그 승인 방식) 칸 제외** — 채널 계약(`settingBodyValid`·`link.resolve`)에 없어 `capabilities.worklogApproval:false`, 저장 시 `ISSUE_SETTING_UNSUPPORTED`. 필요하면 공유 `ops.js` 에 칸 추가 요청.
3. **포트폴리오 배치(`applyWorklogApprovalForBatch`)는 승인 정보 없음** — 큐 소비자라 사람이 없고 `cert.query` 는 USER 전용 → 연동 모드 집계에서 "확인 중"(fail-close). 지금처럼 집계하려면 공유 `ops.js` 에 `cert.query` SYSTEM reason(예: `portfolio-batch`, STATS 한정) 추가 요청.
4. **연결 생성도 알린다** — `writeProjectLink` 뒤 `change.notify{LINK}`. 큐 경로(구독 백필)에는 사람이 없어 SYSTEM `link-withdraw` reason 을 그대로 쓴다(이름이 뜻과 다름). 공유 `ops.js` 에 `link-change` 같은 reason 추가 또는 이름 변경 요청.
5. **프로젝트 단위 연동 신호(ALL_ISSUES) 폐기** — `link.resolve` 는 이슈별 앱 필드만 본다. 백필 전 이슈는 연동 아님으로 답한다.
6. **`cleanupApprovalLinkProperties` resolver 신설**(설계 resolver 목록 밖) — Q2 의 "워크포스: 자기 SQL 의 연동 이슈·프로젝트 property 삭제"를 관리자가 페이지 단위로 실행(옛 일괄 게시 화면 자리). 자동 실행이 필요하면 큐 작업으로 옮겨야 함(manifest consumer 추가).
7. **`domain/approvalLink/writeChannel.js` 유지** — 설계는 삭제였지만 UI 사본과 바이트 동일 시험(`static/ui/.../writeChannel.test.js`)이 묶여 있고 프론트 범위라 남겼다. 판정 표는 그대로 쓴다(`gated` = 승인 앱 `channel === 'OPEN'`). **파일 주석이 옛 writeGate 설명** — 프론트 담당이 두 사본을 같이 고쳐야 한다.
8. **넘김 경로의 시간대** — `issue.control` 에 승인 앱 사이트 시간대가 없어 새 작성 넘김 경로(`…/new/{date}/{HHmm-HHmm}`)는 resolver context `timezone`(사용자)으로 만든다. 정확히 맞추려면 `issue.control` 행에 `timeZone` 추가 요청. `write.judge` 의 `timeZone` 도 같은 값.
9. **`issue.control.handoffPath` 해석** — 앞부분이 `/jira/apps/{app}/{env}/worklog/` 이면 그 접두를 화면 기반 경로(`globalPagePath`)로 쓴다. 승인 앱이 다른 모양을 주면 넘김 경로가 null(안내만). 계약 문구 확정 요청.
10. **배지 BADGE 는 이슈 20개 이하만** — 넘으면 STATS(상태 값만 쓰고 설명·결정자 없음). 승인 앱이 BADGE 이슈 좁히기를 STATS 에서 안 하므로, 21개 이상 화면은 actor 가 못 보는 이슈의 상태가 섞일 수 있다(숫자·상태만, 설명 없음).
11. **cert.query 호출 수** — `certPairsOfRows` 가 앞뒤 한 달까지 넣어(V5 월 귀속) 200명 × 1개월 = 600쌍 → 12회(설계 추정 4회). 화면당 상한 24회(1,200쌍), 넘는 쌍은 문서 없음.
12. **R1(actor 활성)은 `pair.complete`·`sys.rekey`·`sys.unpair` 만** — asApp `GET /rest/api/3/user?accountId`(메모 10분). `sys.ping` 은 R0. `org.get` 은 워크포스 users 테이블, `org.teams` 는 워크포스 guarded handler, `link.resolve`·`kb.get`·`change.notify` 는 R0(설계 §2.5 대로).
13. **옛 resolver 2개 삭제로 설정 화면 `ApprovalLinkCard` 는 런타임에서 실패**한다(`getApprovalLinkDiagnostics`·`publishApprovalLinkSignals` 호출) — 지시대로 프론트는 손대지 않았다(import 가 깨지는 곳은 없음, 관련 UI 시험 통과). 프론트 재작성 시 §4.1 shape 사용.

## 6. asApp 사용(새로 생기거나 바뀐 것 — AGENTS.md ⑦⑧ 갱신 필요, 문서 단계)

| 호출 | 자격 | 경로 | 결과 쓰임 |
|---|---|---|---|
| `GET /rest/api/3/user?accountId={서명 actor}` | asApp | ChannelServer R1 (pair·rekey·unpair) | boolean 판정만, 응답 미포함 |
| `POST /rest/api/3/search/jql` `id IN (…)` fields project·앱 필드 | asApp | `link.resolve` | 연결 판정(승인 앱에 연결 여부·Jira 프로젝트 id 만) |
| `DELETE …/properties/movesRms.{policy,issue,kb}` | asApp | 관리자 정리 | 정리 건수만 |
| `DELETE /user/properties/movesRms.org?accountId=본인` | asUser | 앱 진입 | 없음 |
| `GET issue/{id}/worklog` (숨긴 본인 기록) | asApp | 이슈 탭 — 승인 앱이 hidden id 를 줄 때만 | 본인 기록만(불변식 8 예외 ①~⑥) |
| `POST worklog/list` (숨김 인증분 보충) | asApp | 원가·집계(기존 유지) | 숫자 집계만, 후보는 cert.query 응답 id, 숨김 판정은 issue.control AGGREGATE |

삭제된 asApp: `movesRms.policy/issue/kb` PUT·GET, `movesApproval.cert.*` 사용자 프로퍼티 GET(원가·집계), `movesApproval.ctl` GET(협업·원가).

## 7. 미검증 (`04_spike_todo.md` 와 대응)

| # | 항목 | 코드에서의 가정 | 확인 방법 |
|---|---|---|---|
| S1 | production webtrigger 도메인 | egress 에 `{approvalAppId}.hello.atlassian.net` 을 넣어 둠(공유 `peerUrl.js` 와 같은 가정) | 스파이크 production 배포 |
| S3 | webtrigger context `license` | `context.license.isActive === false` 일 때만 거부, 없으면 통과 | staging 유료 설치에서 context 출력 |
| W-a | Forge `fetch` 의 `redirect:'manual'`·응답 `headers.get` | 스파이크 caller 는 기본 옵션만 실측 | 페어링 후 ping 1회로 확인 |
| W-b | 8초 timeout 은 `Promise.race` — 기반 요청은 취소되지 않음 | 호출자는 8초 뒤 넘김(DEFER) | 승인 앱 핸들러 지연 주입 |
| W-c | KVS `batchGet` 1회 상한 | 20건으로 나눔 | 문서 확인 또는 100건 시험 |
| W-d | resolver context `timezone` 존재(Custom UI) | 없으면 `UTC` | 이슈 탭 작성 1회 |
| W-e | asUser 로 본인 user property DELETE | 옛 코드는 asUser PUT 이 동작했음 | 앱 진입 후 `movesRms.org` 사라짐 확인 |
| W-f | `webTrigger.getUrl(key, true)` 뒤 `getUrl(key)` 가 새 URL 을 주는가 | rotate 는 새 URL 을 직접 `sys.rekey` 로 보내므로 영향 작음 | 스파이크 |
| W-g | `forge lint` 의 PermissionLinter "Unknown product" 경고가 기존부터 있었는가 | 이번 변경과 무관하다고 봄 | 작업 전 HEAD 에서 lint |

## 8. 발견(범위 밖 — 고치지 않음)

- 워크포스 `CLAUDE.md`(Jira API ⑦⑧ 절)·`AGENTS.md`(보안 ⑦⑧, 배포·설치 "연동 이슈 작성 기간", "워크로그 사후 승인 집계 예외")가 property·writeGate 기준으로 남아 있다 — 문서 단계(§14 docs)에서 갱신 필요.
- `ErrorCodes.js` 의 `WORKLOG_PERIOD_LOCKED`·`WORKLOG_CERTIFIED_LOCKED` 주석이 "writeGate J2/J3" 를 가리킨다(코드 값은 승인 앱 DENY 코드로 그대로 쓰임).
- `ProjectLinkWriter.clearProjectLink` 의 `cloudId`·`invocation` 인자는 이제 쓰이지 않는다(호출부 호환으로 남김).
- `IssueMembership.isWorkforceProjectIssue` 는 이제 호출부가 없다(시험만).

## 9. 공유 파일 변경 요청 (승인 앱 담당)

1. `ops.js` — `cert.query` 의 SYSTEM reason(포트폴리오 배치 STATS) 허용 여부 결정(§5-3).
2. `ops.js` — 연결 생성 알림용 reason(`link-change`) 또는 `link-withdraw` 의 뜻 확장(§5-4).
3. `ops.js` — `issue.control` 행에 선택 칸 `timeZone`(승인 앱 사이트 시간대) 추가 검토(§5-8), `handoffPath` 의 모양(접두가 global page 기반 경로) 계약 문구 확정(§5-9).
4. `ops.js` — `settingBodyValid`·`link.resolve`·`change.notify{SETTING}` 에 `wa` 칸이 필요한지 결정(§5-2).

---

## §15 반영 (2회차, 2026-10-19 — 설계 §15.3 '워크포스 백엔드' 9건)

| 항목 | 결과 |
|---|---|
| 백엔드 시험 | **182 suites / 2,548 tests 전부 통과**(1회차 180 / 2,511 → 신규 2 스위트·37건) |
| `forge lint` | 0 errors, 0 warnings, approval 1(`MAJOR_VERSION_RULE`, egress — 1회차와 같음). PermissionLinter "Unknown product" 경고 1줄 그대로 |
| 공유 파일 판 2 | 13개 sha256 전부 `SHARED_READY.md` 판 2 와 일치(`sharedHash.test.js` 옆 리포 바이트 대조 통과) |

### 판 2 sha256 대조

| 파일 | sha256 | 판 2 |
|---|---|---|
| base64url.js | 8f5d5d6a05bc05a436640e73b64241994e347cf4e265da4e000c9df2ab4abb87 | 일치 |
| canonical.js | 49461d79e171c3dc01c085f3db8905c1fbe6b902d1c78639b945a4bb95b87358 | 일치 |
| ed25519.js | cb1446f21631b77635b5f3384cf929e585f160e84cae2733e9b777142e3f99c3 | 일치 |
| envelope.js | 447c71c6b537ae3adf0161b82fcc80ece5dd8adb29d3111f11896e79428884d0 | 일치 |
| keyring.js | 3df89e952c691f98ab90274cbe3b97428bed3c0b0f689ecb93838028f49de77d | 일치 |
| ops.js | 46ae4396ab07d3687e1462b3bfc06407ba3c4689abc2955da0e34c7170dc2002 | 일치(바뀜) |
| pairingCode.js | 4360316801ba3f0dcbf2bc249ec0a77d821d70de09628f2787327e81a6fa760c | 일치 |
| peerUrl.js | d91fe6b6eaf5282a005849e2e139ff5976adeda5139b67dd544a7433b9d1a8cd | 일치 |
| rpcVectors.json | 3168e730d9f133518bc424c69f2ae9ed1e3c22bf2c66ae68cf624b08b82947e0 | 일치(바뀜) |
| __test__/envelope.test.js | dc31e3513d92ab9cd90b0cc869fd701c242aadd43ea3f16eb89fb5a15276c046 | 일치 |
| __test__/pairingOps.test.js | 10bb0501427bde259309a5b41cf457e470eef5e6b7e1e9f43e627c5a3fbb3f9e | 일치(바뀜) |
| __test__/rpcVectors.gen.js | e44621a9f9c8b7f208a10b9b778709f99139efd76dec9689275588dc7407ebbe | 일치(바뀜) |
| __test__/sharedHash.test.js | 69a3f74b4df1d10cc20238090729b535f1180808435c117ccd84041b27193a6f | 일치(바뀜) |

### 9건 처리

| # | §15.3 할 일 | 구현 | 시험 |
|---|---|---|---|
| 1 | 판 2 복사·대조 | 디렉터리 통째 재복사(수정 없음) | `sharedHash.test.js` |
| 2 | 팀장 설정 이관 | 신규 `resolver/approvalChannel/IssueSettingMigration.js` — 옛 property 서명 형식(`moves-link/1\n`+canonical{v:1, typ:'rms.issue', cloudId, ent:{projectId, issueId}, kid, iat, body})을 **워크포스 계열 키(현재 서명 키 공개키 + keyring workforce 계열)로만** 검증, 통과분만 KVS 로(KVS 에 값이 있으면 덮지 않음, wa 옛 모양 `{v:1,…}` 은 계약 모양으로). 완료 표식 KVS `approvalLink:issueSettingMigration = {doneAt}`. **두 경로**: ① 관리자 `cleanupApprovalLinkProperties` 가 표식 전에는 `phase:'MIGRATE'`(이관만, 아무것도 안 지움) → 끝 페이지에서 표식 → 다음 실행부터 `phase:'CLEANUP'` 에서 `movesRms.issue` 포함 네 키 삭제 ② 표식 전에는 `link.resolve`·팀장 설정 표(목록·저장)가 검색에 옛 키를 함께 받아 KVS 에 없는 이슈를 그 자리에서 이관(이관 전 기능 공백 방지). 옛 검증 코드는 이 모듈 안에만 있다(표식 뒤 삭제 대상). `LinkSigner.ownPublicKey()` 추가 | `IssueSettingMigration.test.js` 10(위조 키·다른 이슈·다른 프로젝트·다른 사이트·미등록 kid·본문 변조·형식 불량 거부, 페이지·표식, KVS 우선), 정리 2단계(`notifyAndScope`), 설정 표 이관 동봉(`IssueApprovalSettingService`), link.resolve 이관(`handlers`) |
| 3 | `wa` 복원 | `domain/approvalLink/issueSetting.js` `isValidWa`·`normalizeWa`(닫힌 3칸 — 판 2 `settingWaValid` 와 같은 규칙), 저장 계획·KVS·`settingWireOf`(link.resolve·change.notify{SETTING})에 실림. 목록 `setting.wa` 는 화면 호환으로 `{v:1, …}`, `capabilities.worklogApproval = 페어링됨`. 잘못된 wa → `INVALID_TARGET`, 미페어링 wa 저장 → `ISSUE_SETTING_UNSUPPORTED` | 설정 시험 wa 4건 + link.resolve PROJECT 행 wa |
| 4 | link.resolve `basis:'PROJECT'` | 앱 필드로 연결이 안 잡힌 이슈가 있을 때만 구독 SQL 1(`findSpaceSubscriptionsRepository`) — **무필터 SPACE 구독**(활성·이슈 타입·추가 JQL·기준 시각 없음·하위 작업 포함, 옛 `projectSignalOf` 와 같은 규칙) ∧ 구독 워크포스 프로젝트 활성이면 그 Jira 프로젝트 이슈 전체 `linked:true, basis:'PROJECT'`. 앱 필드 연결은 `basis:'ISSUE'` | `handlers.test.js` PROJECT·필터 6종·SQL 생략 |
| 5 | 포트폴리오 배치 | `applyWorklogApprovalForBatch` — ActorScope 에 사람이 있으면 USER, 없으면 `system:{reason:'portfolio-batch'}`(purpose STATS 일 때만 붙인다). 수동 재집계 `triggerAggregationService` 가 큐 payload 에 `requestedBy`(ActorScope) 를 싣고 컨슈머 `aggregatePortfolio` 가 그 사람 scope 로 집계. 스케줄 스냅샷은 SYSTEM | `PortfolioBatchActor.test.js` 2, `WorklogApprovalAggregate` 1 |
| 6 | reason `link-change` | `ApprovalNotifier.notifyLinkChanged`(연결 생성·해제·삭제 큐 공통) | `notifyAndScope`·`ChannelClient` |
| 7 | 넘김·판정 시간대 | `ApprovalControlLookup` 이 응답 최상위 `globalPagePath`(없으면 행 `handoffPath` 접두)와 행 `timeZone`(IANA 형식 검사) 보관. 새 작성 넘김 경로 `…/{issueId}/new/{date}/{HHmm-HHmm}` 과 `write.judge` 요청 `timeZone` 은 이 값만 쓴다 — **사용자 시간대 대체 제거**. 승인 앱이 주지 않으면 경로는 `…/new` 까지, judge 는 `UTC` | `IssueWorklogControlService` 시험(사용자 UTC·승인 앱 Asia/Seoul 로 일부러 다르게, null 케이스), `ApprovalControlLookup` 2 |
| 8 | 서명 없는 `STALE_LINK` | `ChannelClient` 가 자기 상태를 바꾸지 않는다(REVOKED 전환 삭제). 마지막 오류 코드로만 남김 | `ChannelClient.test.js` STALE_LINK·NOT_PAIRED |
| 9 | BADGE→STATS 강등 | 주석으로 규칙 고정(호출자가 asUser 로 읽어 넘긴 행에만 붙임) | `ApprovalCertReader.test.js` — 21 이슈 STATS, 응답에 행 밖 기록이 있어도 출력 행 수·순서 그대로, 새 행·`certification` 외 칸 없음 |

### shape 변화(1회차 §4 대비)

```js
// cleanupApprovalLinkProperties({ cursor? }) →
//   이관 전: { success:true, phase:'MIGRATE', scanned, migrated, skipped, removed:0, failed:0, nextCursor, done, migrationDone }
//   이관 후: { success:true, phase:'CLEANUP', scanned, removed, failed, migrationDone:true, nextCursor }
//   화면은 nextCursor 가 null 이 될 때까지 이어 부르고, migrationDone 이 막 true 가 되면 한 번 더 처음부터(CLEANUP) 부른다.
// listIssueApprovalSettings items[].setting.wa → { v:1, autoRequest, lockApproved:true, closeDays } | null
//   items[].capabilities.worklogApproval → 페어링됐으면 true
// saveIssueApprovalSettings item.wa → { autoRequest, lockApproved:true, closeDays 0..90 } (v 칸 있어도 됨)
// getIssueWorklogControl.control → { basis, channel, globalPagePath, permission } (timeZone 은 서버 내부만 — 화면 칸 무변경)
// link.resolve 행 → { linked, released, wfProjectId, projectId, basis?: 'ISSUE'|'PROJECT'(linked 일 때), setting: { s, e, pa, fl, tk, by, rev, wa? } | null }
```

### 남은 미검증·주의

- 이관 표식 전에는 `link.resolve`·설정 표 검색에 `movesRms.issue` 를 동봉한다(추가 Jira 호출 없음 — 같은 검색). 표식 뒤에는 동봉하지 않는다.
- PROJECT 판정은 구독 SQL 상한 500행(옛 `publishProjectSignals` 와 같은 상한). 그보다 많으면 일부 프로젝트가 PROJECT 로 안 잡힌다(ISSUE 판정은 영향 없음).
- 옛 property 형식의 검증은 이관 모듈 안에만 있다. 표식이 모든 사이트에 생긴 뒤 `IssueSettingMigration.js`·`LinkSigner.ownPublicKey` 를 지우는 것은 후속 판.
- KVS `batchGet` 상한(20 가정), Forge `fetch` `redirect:'manual'` 등 1회차 §7 미검증 항목은 그대로.

---

## 사용자 조회 샘플 API (3회차, 2026-10-19 — 사용자 결정)

외부용 `GET /v1/organization/users` apiRoute 를 열었다. `TeamsReadApi`(`/v1/organization/teams`) 패턴 그대로.

| 항목 | 내용 |
|---|---|
| 파일 | 신규 `src/api/organization/UsersReadApi.js`, 시험 `src/api/organization/__test__/UsersReadApi.test.js` |
| manifest | `apiRoute` `organization-users-read-api`(path `/v1/organization/users`, GET, `accept: application/json`, scopes `read:organization:custom`) + `function` `organization-users-read` → `index.getOrganizationUsersApi`. `src/index.js` export 추가 |
| custom scope | **기존 `read:organization:custom` 하나로 teams·users 둘 다.** `organization-custom-scopes.yaml` 은 displayName "Read organization teams and users"·description 만 수정(이름 무변경). `forge custom-scopes create` 실행 안 함 — 등록은 리더 |
| 신원 | 함수 두 번째 인자 `principal.accountId` + `installContext`(site ARI) 만. `installation.contexts` 에 다른 cloudId 가 섞이면 401. query `accountId` 는 **조회 대상**일 뿐 신원으로 쓰지 않는다 |
| 권한 | 기존 guarded handler 재사용 — 목록 `getUserListWithPaging`, 1명 `findUserByAccountId`(둘 다 `PermissionMap` `R('USER_MANAGEMENT')`). custom scope 는 권한을 늘리지 않는다(가드가 workforce 권한 세트로 판정) |
| query | `accountId`(1명, 형식 `^[A-Za-z0-9:_-]{1,128}$`) **또는** `offset`(0·20·…·9980, 페이지 20명). 둘 다·모르는 키·배열·형식 위반 → 400(가드 호출 0) |
| 응답 | `{ success:true, content:{ users:[{ accountId, displayName, active: boolean|null, team: { teamKey, teamName, isLeader } | null }], source:'WORKFORCE_API', page?:{ offset, size:20, nextOffset|null, total|null }, limits?:{ usersPerPage:20, maxOffset:9980 } } }` — 1명 조회는 `page`·`limits` 없음 |
| 민감 정보 | 이메일·급여(`salary`·`levelBand`)·권한 세트·역할·등급·아바타·생성 시각을 싣지 않는다(시험: 서비스가 그런 칸을 줘도 응답에 없음) |
| 오류 매핑 | 신원 없음 401 `API_AUTHENTICATION_REQUIRED`, 메서드 405, query 400 `API_INVALID_QUERY`, 가드 거부·라이선스 403(그 code), 대상 없음(`USER_NOT_FOUND`) 404, 그 밖 503 `API_READ_FAILED`. `error.message`·`cause` 는 싣지 않는다. (TeamsReadApi 는 404·503 갈래가 없이 실패를 전부 403 으로 낸다 — 사용자 조회는 대상 없음·일시 장애를 구분하도록 갈래를 더했다) |
| 백엔드 변경 | `UserService` 의 사용자 DTO 두 곳(`mapUserRowsToDto`·`findUserByAccountIdService`)에 `userActive`(Jira 계정 `active`, 모르면 null) 칸 추가 — 기존 UI 는 읽지 않는 추가 칸. UI 파일 변경 없음 |
| 시험 | `UsersReadApi.test.js` 19건(전체 183 suites / 2,567 tests 통과, `forge lint` 0 errors·0 warnings·approval 1 MAJOR_VERSION_RULE) — 신원 없음 401(3종), 권한 없음 403·라이선스 403·404·503(원인 미노출), 민감 필드 미포함(목록·1명), 페이지 20명 상한·nextOffset·마지막 페이지, query 위반 400(7종), POST 405, 위장 accountId 를 신원으로 쓰지 않음 |

미검증: apiRoute 에서 `principal.accountId` 가 토큰 발급자(실측 R3 — teams 와 같은 조건), custom scope 미등록 상태라 개발 환경에서 실제 호출은 등록 후에만 가능.

---

## 검증 1차 수정 (4회차, 2026-10-19 — `03_verify_report.md` 워크포스 BE 항목)

### 공유 파일 판 3 대조

`SHARED_READY.md` 판 3 으로 디렉터리 전체 재복사. 13개 sha256 전부 일치 — 바뀐 것 `ops.js` `9a59ab6c044105f0f5ff983fd14f9fcf8bbfce71e42854733dccf488c69ab8c2`, `__test__/pairingOps.test.js` `9d30f3a0742cd60a6f6323fa526abe5eed923613b55a7f21f67f5c3e41e14b79`, `__test__/sharedHash.test.js` `3f5a033154fc12645fa3b2ab7db2bf96d83b4a9a8278e48c19df4c5285502678`, 나머지 10개는 판 2 와 같은 값(옆 리포 바이트 대조 시험 통과).

### 항목별

| 지적 | 수정 | 파일 | 시험 |
|---|---|---|---|
| **F2** ① 승인 앱 "연결 확인 불가"를 비연동으로 읽음 | 판 3 행 `link:'UNVERIFIED'` → `NOT_LINKED('UNVERIFIED')`(스위치 무관 BLOCKED). 행 `basis` 를 `link.basis` 로 보관 | `approvalLink/ApprovalControlLookup.js` | `ApprovalControlLookup.test.js` 판 3 케이스 |
| **F2** ② `creationTarget` 이 PROJECT 근거를 모름 | 앱 필드 소속이 아니면 그 이슈 Jira 프로젝트의 구독을 `findSubscriptionBySourceRepository('SPACE', jiraProjectId)` 로 보고, `isWholeProjectSubscription`(link.resolve 와 같은 규칙) ∧ 구독 워크포스 프로젝트 활성이면 소속 → 승인 앱이 ABSENT 로 답해도 BLOCKED(직접 쓰기·판정 생략 없음). 구독 조회 실패는 모름(BLOCKED) | `approvalLink/IssueWorklogControlService.js` | `IssueWorklogControlService.test.js` 검증 F2 2건(무필터 → BLOCKED·POST 0 / 필터 구독·비활성 프로젝트 → 종전 / 조회 실패 → BLOCKED) |
| **F2** ③ 구독 생성·변경 시 승인 앱 캐시 틈 | `notifySubscriptionChanged(sourceType)` — SPACE 구독 생성·수정·해제 직후 `change.notify{LINK, all:true}`(사람 없으면 SYSTEM `link-change`). 보드 구독은 PROJECT 근거가 아니라 안 보냄. 실패는 구독 작업을 실패시키지 않음 | `approvalChannel/ApprovalNotifier.js`, `projectSubscription/ProjectSubscriptionService.js`(3곳) | `notifyAndScope.test.js` |
| **F5** 서명 OP_UNKNOWN 순서 | `verifyRequest` 가 OP_UNKNOWN 이어도 바로 서명하지 않고 재전송(8) → 페어링·linkId(9) 확인 뒤에 서명 `OP_UNKNOWN`(승인 앱과 같음). 미페어링·다른 linkId 는 최소 응답 | `approvalChannel/ChannelServer.js` | `ChannelServer.test.js` F5 |
| **F6** `LINK_DISABLED` | 연동 스위치(`approvalLinkMode`)가 `ON` 이 아니면 연결 관리 4작업(`pair.complete`·`sys.ping`·`sys.rekey`·`sys.unpair`) 외에는 서명 `LINK_DISABLED`. 스위치 값은 인스턴스 메모 30초(설정 읽기 실패 = 꺼짐 취급 — fail-close) | 같은 파일 | F6 스위치 |
| **F6** `RATE_LIMITED` | 인스턴스별 행위자(USER accountId / SYSTEM reason)당 분당 120회 고정 창, 초과 서명 `RATE_LIMITED`(429, retryable). 키 상한 2,000 | 같은 파일 | F6 120회 + 다른 행위자 영향 없음 |
| **F10** 낡은 주석 | `ErrorCodes.js`(writeGate J2/J3·`movesApproval.flows`·rx 문구), `CollabIssueFetcher`·`CollabWorklogFetcher`·`CollabIssueWorklogService`·`ProjectCollabController`·`ProjectCostService`·`ProjectDashboardController/Service` 의 "통제 문서 서명 검증·vt" 문구를 채널 `issue.control` 기준으로. `listIssueApprovalSettings` 의 `filter:'UNVERIFIED'` 는 KVS 원장에서 생기지 않는 상태라고 주석 — 옛 화면 번들 호환으로 받되 0건(거부하면 화면이 오류). UI `IssueApprovalSettingTable.jsx` 필터 선택지는 프론트 담당 | 위 파일들 | — |
| **S18** 해제 뒤 지운 URL | `ChannelState.deleteSelfUrl(url, {current})` — 지금 쓰는 URL 을 지우면(해제) KVS `link:selfUrlDeleted` 표식, 다음 `selfUrl()` 은 `getUrl(key, true)` 로 새로 만들고 표식 삭제(승인 앱 규칙과 같음). 주소 바꾸기에서 옛 URL 삭제는 `current:false`(새 URL 이 현재). 덧붙여(F1 덧붙임) 비강제 주소 바꾸기가 상대 무응답으로 실패하면 방금 만든 새 URL 을 지운다 | `approvalChannel/ChannelState.js`, `PairingService.js` | `PairingService.test.js` S18·rotate |

판 3 의 `actorViolation` → `MALFORMED`(F7)는 워크포스 서버가 그 코드를 그대로 서명 응답한다(추가 코드 없음). 받는 `change.notify` 의 SYSTEM `control-change`(F9)는 판정에 쓰지 않아 변경 없음.

### 시험·lint

- 백엔드 **183 suites / 2,578 tests 전부 통과**(3회차 2,567 → +11: 판 3 UNVERIFIED·F2 2·F5·F6 2·S18·구독 알림 등)
- `forge lint` 0 errors, 0 warnings, approval 1(`MAJOR_VERSION_RULE`, 기존과 같음)
- 남은 실측: S18 `deleteUrl` 뒤 `getUrl(key)` 동작(지금은 표식으로 forceCreate 해 어느 쪽이든 안전), 비강제 rotate 실패 뒤 새 URL 삭제가 옛 URL 을 `getUrl(key)` 현재값으로 되돌리는지(미검증 — 다음 rotate 의 oldUrl).

### 추가 — S18 대조 반영(승인 앱 `02_backend_report.md` '검증 1차 수정' S18)

| 지적 | 수정 |
|---|---|
| `rotate` 가 지금 URL(`getUrl`)을 옛 URL 로 씀 → 비강제 실패 뒤 재시도 때 상대가 실제로 쓰는 URL 이 남음 | `link:channel` 에 **`selfUrl`(상대가 아는 우리 URL)**·**`orphanUrls`(상대 확인 없이 만든 URL, 최대 10)** 를 따로 기록(승인 앱과 같은 칸 이름·규칙). 페어링 때 `selfUrl` = 연결 코드에 실은 URL(만든 쪽은 pending 에 같이 저장)·`pair.complete` 로 보낸 URL. `rotate`: 확인되면 아는 URL + 미확인 URL 전부 삭제 → `selfUrl`=새 URL / 비강제 실패면 **아무것도 지우지 않고** 새 URL 을 `orphanUrls` 에(1차 수정의 "새 URL 즉시 삭제"는 되돌림 — 승인 앱과 같게) / force 실패면 새 URL 외 전부 삭제 후 REVOKED |
| 강제 실패 REVOKED 사유 | `revokedReason: 'ROTATED_WITHOUT_PEER'`, `revokedBy`(ActorScope) 기록 — 승인 앱 `markRevoked({reason:'ROTATED_WITHOUT_PEER'})` 와 같은 사유. 응답에 `status: 'PAIRED'|'REVOKED'` 추가(승인 앱 응답과 같은 모양) |
| `unpair` 가 지금 URL 하나만 삭제 | 지금 URL·`selfUrl`·`orphanUrls` 전부 삭제, `link:selfUrlDeleted` 표식(다음 코드 forceCreate), 기록 비움. 사유 `UNPAIRED` |

`rotateApprovalChannelUrl` 응답 shape: `{ success:true, rotated:true, peerConfirmed:boolean, status:'PAIRED'|'REVOKED' }`(비강제 실패는 종전처럼 `PAIR_PEER_UNREACHABLE`).

시험: `PairingService.test.js` — 비강제 실패(삭제 0·orphan 기록) → 재시도 성공(최초 URL + 미확인 URL 함께 삭제, 새 URL 유지), force 실패(REVOKED·`ROTATED_WITHOUT_PEER`·revokedBy), unpair(세 종류 URL 전부 삭제·표식), pending·channel 의 `selfUrl` 기록. 전체 **183 suites / 2,580 tests 통과**, `forge lint` 0 errors·0 warnings·approval 1(`MAJOR_VERSION_RULE`).

---

## 재검증 1회차 수정 (5회차, 2026-10-19 — `03_verify_report.md` R3·R4, 승인 앱 규칙에 맞춤)

공유 파일은 **판 3 유지**(판 4 없음, `SHARED_READY.md` 메모 확인) — 워크포스 사본 해시 변동 없음.

| 지적 | 수정 | 파일 |
|---|---|---|
| **R3** `RATE_LIMITED` 재시도 표시 | 서버: 행위자당 분당 120 초과 응답을 `retryable:false` 로 서명(승인 앱과 같음). 클라이언트: `RATE_LIMITED` 는 상대가 `retryable:true` 로 서명해 와도 즉시 재시도하지 않는다. 덧붙여 서명 없는 429(플랫폼 속도 상한)도 재시도 안 함(설계 §4.6) | `approvalChannel/ChannelServer.js`, `ChannelClient.js` |
| **R4** `orphanUrls` 10개 상한 | `slice(-10)` 제거(잘라 내면 잘린 URL 이 영영 안 지워진다). `ORPHAN_URL_LIMIT = 10` — 미확인 URL 이 10개 쌓이면 **비강제 rotate 를 새 URL 만들기 전에 거부**: `PAIR_PEER_UNREACHABLE`, `cause {reason:'ORPHAN_LIMIT', orphanCount}`(상대 호출·URL 발급 0). 강제·성공·해제는 언제나 허용하고 아는 URL·미확인 목록 전부 삭제 | `approvalChannel/ChannelState.js`, `PairingService.js` |

시험: `ChannelServer.test.js`(RATE_LIMITED `retryable:false`), `ChannelClient.test.js` +2(서명 RATE_LIMITED retryable:true 여도 1회만·서명 없는 429 1회만), `PairingService.test.js` +4(상한 거부·URL 발급 0 / 강제 상한에서도 11개 전부 삭제 / 해제 11개 삭제 / 9개 → 10번째 기록·잘림 없음). 전체 **183 suites / 2,586 tests 통과**, `forge lint` 0 errors·0 warnings·approval 1(`MAJOR_VERSION_RULE`).

화면 영향(프론트 참고): `rotateApprovalChannelUrl` 비강제 실패에 `error.cause.reason === 'ORPHAN_LIMIT'` 가 오면 "강제로 바꾸기 또는 연결 해제 필요" 안내가 맞다.

---

## 코덱스 검수 수정 (6회차, 2026-10-19 — `codex-review.md` 워크포스 몫 #2·#3·#4·#5)

### 상태 전이 규칙 — `SHARED_READY.md` "상태 전이 규칙"과 글자 그대로

확인한 API(@forge/kvs **1.6.1**, 워크포스 `node_modules/@forge/kvs/out/interfaces/transaction.d.ts`·`types.d.ts`): `transact().set(key, value, {entityName, conditions})`·`check`·`delete`·`execute()`, 조건(`Filter`·`FilterConditions.equalTo/notExists`)은 **entity 에만** 걸린다. 일반 키 `kvs.set` 은 `keyPolicy: 'FAIL_IF_EXISTS'|'OVERRIDE'` 뿐. 그래서 entity 로 옮겼다(승인 앱 2.0.4 와 같은 결론).

| 대상 | 워크포스 구현 | 승인 앱 규칙과 |
|---|---|---|
| 연결 상태 | entity **`channel-state`**, 키 **`current`**, 값 **`{gen, body}`** (manifest `app.storage.entities`: `gen: integer`, `body: any`). body = `{status, linkId, peerApp, pairedAt, pairedBy, peerActor, peerProto, peerOps, selfUrl, orphanUrls, selfUrlDeleted, revokedAt, revokedBy, revokedReason, pending}` | 같음(옛 `proto`·`ops`·`peerVersion` 칸, 별도 키 `link:pending`·`link:selfUrlDeleted` 폐기) |
| 전이 | 공용 `approvalChannel/AtomicDoc.js` — `transact().set('current', {gen:g+1, body}, {entityName:'channel-state', conditions: gen == g})`, 레코드 없으면 `gen notExists`(저장 gen 1). 실패 뒤 다시 읽어 gen 이 바뀌었으면 경쟁, 그대로면 원래 오류 | 같음 |
| pending | body.pending `{linkId, pinHash, exp, createdBy, createdAt, selfUrl}` — PAIRED 전이(코드 붙여넣기 완료·pair.complete)와 모든 해제(로컬·상대·강제 rotate)는 같은 전이에서 `pending: null`. pair.complete 는 읽은 gen 에서 pending 을 검사하고 **그 gen 으로** PAIRED | 같음 |
| 경쟁 재시도 | 해제(로컬·상대) 3회, URL 기록·selfUrlDeleted 해제 2회, 코드 만들기·코드 붙여넣기 완료 0회 → **`PAIR_STATE_CHANGED`**, pair.complete 수신 0회 → **`PAIR_EXPIRED`**. 상대 해제·rotate 결과 기록은 body.linkId 가 요청 linkId 일 때만 | 같음 |
| 표시 | 일반 키 **`channel:outcome:{linkId}`** `{lastOkAt, lastErrorCode, lastErrorAt, peerVersion, peerProto, peerOps}` — 호출이 쓴 linkId 키에만, 연결 상태는 안 씀. ping 결과(상대 버전·작업 목록)도 여기 | 같음 |
| 상대 URL | secret **`channel:peerUrl:{linkId}`** — 해제 때 그 linkId 의 secret 삭제, sys.rekey 는 env.linkId 키만 | 같음 |

### 항목별

| # | 수정 | 재현 시험 |
|---|---|---|
| **#2** recordOutcome 경쟁 | 위 규칙. 표시 기록은 별도 키라 해제·재연결을 되돌릴 수 없고, 모든 전이가 gen 조건부라 늦은 쓰기가 앞선 전이를 덮지 않는다 | `ChannelStateAtomic.test.js` — 인스턴스 B 가 옛 PAIRED 를 메모한 채 실패 기록해도 REVOKED 유지 / 옛 linkId 의 URL 기록은 새 연결에 안 닿음 / 읽기·쓰기 사이 다른 인스턴스 해제 → 재시도에서 REVOKED 위에만 쓴다 / 경쟁 계속 → STORAGE_CONFLICT / 경쟁 아닌 실패는 원래 오류 |
| **#3** pending 폐기·같은 gen | 로컬 해제·상대 해제(그 linkId 일 때만)·상대 코드 수락·강제 rotate 가 pending 을 같은 전이로 비운다. pair.complete 는 pending 검사와 PAIRED 를 한 조건부 쓰기로 | 로컬 해제 pending 삭제 / 상대 해제 linkId 대조 / 해제 뒤 보관 코드 pair.complete → PAIR_EXPIRED / pair.complete 와 해제 경쟁 → PAIR_EXPIRED·REVOKED 유지 / 정상 pair.complete 한 전이 / 상대 코드 수락 시 우리 pending 폐기 / 코드 만들기 경쟁 → PAIR_STATE_CHANGED(1회 시도) / 해제 4회·URL 기록 3회 시도 / 첫 저장 gen 1·`{gen, body}` |
| **#4** 팀장 설정 원자 저장 | entity **`approval_issue_setting`**(키 = 이슈 id, 값 `{rev, doc}`, manifest `rev: integer`, `doc: any`). 저장 = `rev == expectedRev` 조건부(없던 설정은 `rev notExists`) — 같은 AtomicDoc. 조건 실패 → `CONFLICT`. 이관은 원자적 "없을 때만 생성"(그 사이 팀장 저장이 있으면 이관 안 하고 새 값을 쓴다) | `IssueApprovalSettingService.test.js` — 같은 rev 동시 저장 2건 → SAVED 1·CONFLICT 1(쓰기 1회), 기존 값 위 동시 저장도 하나만 / `IssueSettingMigration.test.js` — 이관이 "없음"을 읽은 뒤 팀장 저장 → 이관이 덮지 않음 |
| **#5** PROJECT 판정 500 잘림 | `link.resolve` 가 앱 필드로 안 잡힌 이슈들의 **Jira 프로젝트 id 마다 `findSubscriptionBySourceRepository('SPACE', id)`** 로 직접 조회(사이트 전체 500행 목록 폐기). 조회 실패는 "연동 아님"이 아니라 작업 전체 `INTERNAL`(retryable) → 승인 앱이 확인 불가로 | `handlers.test.js` — 프로젝트당 1회 조회·PROJECT 판정 / 조회 실패 → INTERNAL |

### 승인 앱 `write.judge` DEFER `LINKED_SETTING_UNRESOLVED`

워크포스는 DEFER 를 받으면 저장하지 않는다(종전). 이 사유는 "넘김"이 아니라 **확인 불가**로 다루도록 바꿨다 — `UNVERIFIED_DEFER_REASONS = {LINKED_SETTING_UNRESOLVED, ACTOR_PERMISSION_UNVERIFIED}` 이면 `WORKLOG_LINK_UNCONFIRMED`(cause `{reason, path}`), 그 밖 DEFER 는 `WORKLOG_CREATE/EDIT_HANDOFF_REQUIRED`. 화면(`approvalWriteErrorOf`)은 이 코드를 UNCONFIRMED(다시 시도 안내)로 분기한다. 시험 2건(POST 0).

### manifest

`app.storage.entities` 에 `channel-state`(`gen: integer`, `body: any`)·`approval_issue_setting`(`rev: integer`, `doc: any`) 추가. **미검증**: entity 추가가 major 를 요구하는가(lint 는 egress 로 이미 major), 조건 실패의 오류 code, 레코드 없음 + `notExists` 조건 동작, `integer` 가 epoch ms(rev ≈ 1.79e12)를 담는가(S20, 승인 앱과 같은 항목).

### 시험·lint

- 백엔드 **184 suites / 2,609 tests 전부 통과**(직전 2,586 → +23: ChannelStateAtomic 15·설정 원자 저장 2·이관 1·link.resolve 2·DEFER 2·기타)
- `forge lint` 0 errors, 0 warnings, approval 1(`MAJOR_VERSION_RULE`)


### 추가 — 리더 실측 S20·S21 반영

- **S20 조건 실패 판정**: `AtomicDoc` 이 다시 읽지 않고 `error.code === 'CONDITIONAL_CHECK_FAILED'` 로 경쟁을 판정한다(그 밖의 오류는 그대로 던짐). 시험 가짜 저장소도 같은 code 를 던진다.
- **@forge/kvs 버전**: **1.6.1 유지(올리지 않음).** 두 판의 `out/storage-api.js` 는 바이트 동일, `utils/error-handling.js` 는 컴파일 산출 순서 차이뿐, `transaction-request-builder`·`interfaces/*.d.ts` 동일 — 조건부 transaction 요청과 `ForgeKvsAPIError.code`(서버 code 그대로) 변환이 같다. 반면 2.0.4 는 `@forge/api ^8` 을 의존해 워크포스(`@forge/api ^7`, 전 resolver 공용)와 다른 판이 중첩 설치된다 — 이번 변경 범위에 비해 위험이 크다. 2.x 전환은 `@forge/api` 8 전환과 함께 별도 작업으로 권한다.
- **S21 엔티티 integer 32비트**: `approval_issue_setting` 의 `rev` 를 **1 부터 저장마다 +1** 하는 작은 정수로(상한 `REV_MAX = 2147483647`, 넘는 값은 원장으로 받지 않음), 저장 시각(옛 rev 의미)은 본문 `updatedAt`(epoch ms, `any` 칸 안이라 32비트 제한 없음). 이관 값은 `rev: 1`, `updatedAt` = 옛 epoch rev. `channel-state.gen` 은 원래 1 부터 증가. 승인 앱 쪽 영향: `link.resolve`·`change.notify{SETTING}` 의 `setting.rev` 가 작은 정수로 바뀜(이슈별 단조 증가는 그대로).
- 시험: 설정 rev 1·4 증가·`updatedAt`·32비트 초과 rev 거부, 이관 rev 1/updatedAt, CONDITIONAL_CHECK_FAILED 경쟁·그 밖 오류 재던짐. **전체 결과는 아래 줄.**
- **전체 결과(S20·S21 후)**: jest 184 스위트 / 2,610 시험 통과, `forge lint` 0 errors · 0 warnings(approval 1건은 기존 scope 승인 안내, 자동 수정 대상 아님).

## 재검증 2회차 R5 반영

- `AtomicDoc.js` tryWrite: `CONDITIONAL_CHECK_FAILED` 면 바로 경쟁. 그 밖의 오류는 **다시 읽어 버전이 expected 와 다르면 경쟁**(재시도 대상), 같거나 다시 읽기도 실패하면 원래 오류 — 승인 앱 `ChannelState.js` createEntityCas.commit 과 같은 규칙. `putIf`(팀장 설정 저장)도 같은 판정.
- 경쟁 code `STORAGE_CONFLICT` → **`CHANNEL_STATE_CONFLICT`**(승인 앱과 같음, `AtomicDoc.CHANNEL_STATE_CONFLICT` 상수). `PairingService.isConflict` 가 이 상수로 판정해 밖으로는 `PAIR_STATE_CHANGED`/`PAIR_EXPIRED`, 재시도를 다 쓴 해제·URL 기록은 `CHANNEL_STATE_CONFLICT` 로 나간다(R6 — 워크포스 FE 문구는 이 code 기준으로).
- `ChannelState.savePaired`: PAIRED 전이의 `selfUrlDeleted` 를 늘 `false`(승인 앱 `:159` 와 같음).
- 시험 3건 추가(그 밖의 오류 + 버전 바뀜 → 재시도 성공 / 다시 읽기 실패 → 원래 오류 / REVOKED(selfUrlDeleted true) → PAIRED 는 false). jest **184 스위트 / 2,613 시험 통과**, `forge lint` 0 errors · 0 warnings · approval 1(기존).
