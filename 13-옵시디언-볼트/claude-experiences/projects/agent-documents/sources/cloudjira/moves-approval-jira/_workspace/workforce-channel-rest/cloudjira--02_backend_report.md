# 백엔드 보고서 — workforce-channel-rest (승인 앱)

> 2026-10-19 · backend-engineer · 재작업 회차 **1차(최초)**
> 입력: `01_architect_design.md`(§2·§2.2·§2.5·§4·§11·§12·§14 backend 승인 앱), `00_input/requirement.md`(D1~D6, Q1~Q6), `04_spike_todo.md` 실측
> 배포·커밋·`forge deploy/install` 없음. `forge lint` 만 실행.

## 0. 설계·불변식 충돌

구현을 멈출 충돌은 없었다. 다만 **P0 미검증 하나가 전송 형식 전체를 좌우한다**: dynamic webtrigger 가 응답의 사용자 헤더(`x-moves-link-sig`)를 호출자에게 그대로 넘기는지(§6 S14). 안 되면 공유 봉투를 판 2(응답 본문에 서명 동봉)로 바꿔야 하고 두 리포가 같은 날 바뀐다.

## 1. 결과 요약

| 검사 | 결과 |
|---|---|
| `npm test -- --runInBand` | **186 suites / 2,709 tests 전부 통과**(기준선: 212 suites 중 3 실패 — 옆 리포를 읽는 교차 테스트, 이번에 철거) |
| `npm run check:bundle` | OK — export `channelServer` 포함 11개, 순환 TDZ 없음 |
| `forge lint` | 오류 0 · 경고 0 · 승인 1(`MAJOR_VERSION_RULE` — egress 추가) |
| 공유 파일 동일성 | 워크포스 리포 `src/integration/channel/` 13개 sha256 이 승인 앱과 같음(`SHARED_READY.md` 판 1) |
| SQL 마이그레이션 | **없음**(설계 §5 그대로) |

## 2. 구현 목록

### 2.1 P1 — 미커밋 D5 되돌림
`git checkout --` 로 5개 파일의 D5 hunk 만 되돌림: `manifest.yml`(egress `https://api.atlassian.com`), `src/index.js`(등록), `src/permission/PermissionMap.js`(4행), `WorkforceOrganizationApiController.js`(주석), `test/permission/permissionMap.contract.test.js`(추가분). 이어서 커밋돼 있던 보존 구현 `WorkforceOrganizationApiController.js`·`WorkforceOrganizationApiService.js`·그 테스트를 **삭제**(설계 §11 D). `docs/worklog-approval/*`·`locales/*`·`static/ui/*` 의 미커밋 변경은 손대지 않았다(프론트·문서 단계).

### 2.2 공유 파일 `src/integration/channel/*` (승인 앱 원본, 판 1)
`base64url.js` · `canonical.js` · `ed25519.js` · `keyring.js` · `ops.js` · `envelope.js` · `pairingCode.js` · `peerUrl.js` · `rpcVectors.json` + `__test__/{envelope,pairingOps,sharedHash}.test.js`, `__test__/rpcVectors.gen.js`(벡터 생성기, `GEN_RPC_VECTORS=1` 일 때만). 디렉터리 밖 import 없음(테스트가 강제). `.gitattributes` 에 `src/integration/channel/** text eol=lf`. 해시·사용법은 `SHARED_READY.md`.

### 2.3 채널 서버·클라이언트 (`src/resolver/channel/`)
| 파일 | 내용 |
|---|---|
| `ChannelState.js` | KVS `approval:channel:state` / secret `approval:channel:peerUrl` / `approval:channel:pending`. `isPaired()`, `isLinked()`(= `isWorkforceLinkEnabled()` ∧ PAIRED, 판정 함수 하나), 인스턴스 메모 30초, `lastOkAt` 10분에 한 번만 쓰기 |
| `ChannelClient.js` | `call(op, data, {system?, idem?})` — actor 는 InvocationScope 에서만(인자 없음), resolver 스코프에서 SYSTEM 금지, timeout 8초, `redirect:'manual'`, 응답 서명·`re`·형태 검증 후 data, 읽기만 1회 재시도, 실패는 `workforce_link_log`. `callUnpaired()`(pair.complete) |
| `ChannelServer.js` | webtrigger 진입 §2.2 1~12단계. 1~8 CPU·인스턴스 메모리만(SQL 0·KVS 0), 9 KVS, 10 라이선스, 11 행위자 정책, 닫힌 스키마, actor 당 분당 120, 핸들러는 `runInInvocation` + `bindInvocation({accountId: actor, via:'WORKFORCE_CHANNEL'})`. **절대 throw 하지 않음** |
| `ActorVerifier.js` | R1(`GET /user?accountId`, 사유 `channel-actor-verify`, 메모 10분) · R2(`issue/bulkfetch` + `user/permission/search` 이슈·권한마다, 사유 `channel-actor-permission`, 병렬 6, 메모 5분, 예산 6초) |
| `PairingService.js` · `PairingController.js` | 연결 코드 발급·붙여넣기·주소 회전·해제·확인 + 상대 요청 처리(`pair.complete`·`sys.*`) |
| `PropertyCleanup.js` | 옛 property 일회성 정리(Q2 다) |
| `handlers/` | `certQuery.js` · `periodStatus.js` · `issueControl.js` · `writeJudge.js` · `index.js`(writeCommit·flowsList·changeNotify + 라우팅 표) |
| `src/trigger/channelServer.js` | webtrigger 얇은 어댑터(서버는 첫 호출에 생성 — TDZ 회피) |

### 2.4 RequestJira·InvocationScope
- `bindInvocation({..., via})`, `currentVia()`, `inChannelScope()`, `CHANNEL_VIA = 'WORKFORCE_CHANNEL'`.
- `asUser()` 는 채널 스코프에서 **거부 Promise**(`JiraApiError JIRA_API_FAILED 'asUser is not available in channel scope'`). 테스트로 고정.
- 새 asApp 사유: `channel-actor-verify` · `channel-actor-permission` · `channel-write-judge` · `channel-cleanup`. 삭제된 asApp 경로: `workforce-publish` · `workforce-publish-verify` · `worklog-approval-author-org` · 트리거의 `movesRms.policy/issue` 읽기(`worklog-control-trigger` 중 property 부분, `WorklogControlGateway.signalRequest` 삭제).

### 2.5 소비자 전환
| 대상 | 변화 |
|---|---|
| `WorkforceInbound` | org.get(채널) + 캐시 typ `org`, FRESH 5분·STALE 72시간, KVS 표식 `approval:wf:epoch:ORG`, `refreshOrgs()`(org.get 1회 ≤50명), sticky·서명 검증·PM·점검 삭제 |
| `WorkforceOrgSource` | `enabled` = `ChannelState.isLinked()`. **권한을 넓히는 판단은 FRESH 만**: `ledScope`·`identityOf.isWorkforceTeamLead`. `pmKeysFor`·`capCheckOf` 는 빈 값 고정 |
| `LinkedIssueSettingSource` | link.resolve(≤100/회)·kb.get, 캐시 `link`(I:·P:)·`linkset`·`kb`, `resolveMany()` 신설, 실패 시 캐시 또는 `settingUnresolved+unavailable`(fail-close), `onNotify()`(change.notify), 연결 신규·해제 시 통제 백필 깨우기 |
| `WorkforceTeamsService` | org.teams(채널) |
| `WorkforceChangeNotifier`(신규) | 옛 `WorkforceOutbox`·`CertWake`·`PublishWake` 대체. `touch*` 이름 유지 → change.notify(best effort, 종류별 5초 1회, 3초 timeout) |
| `WorklogPolicyAuthority` | 서명 envelope 검증 제거 → `LinkedIssueSettingSource.read({force:true})` 창구 |
| `WorklogPolicyResolver/Repository/Service` | `propertiesFromIssue` 제거, typ `rms.policy`→`link`(VERIFIED 만), `rms.issue`→`linkset` |
| `ControlLinkJudge` | 캐시 SQL 1 + (refresh 면) `resolveMany`, 실패면 `unavailable` |
| `WorklogControlDetector` | 워크포스 출처 = intent(write.commit 결속 또는 지문 `matchWorkforceIntent`), `movesRms.origin` 무시, `workforceOriginCapable` = 연결 여부 |
| `WorklogControlHooks` | `ctlTargetChanged`·`ctlRulesChanged` → change.notify{CONTROL} |
| `WorklogControlService` | publishCtl → CONTROL 알림, 능력 판정 = 연결 여부 |
| `TimesheetService` | 연동 설정은 `resolveMany`(제출 force), 워크포스 점검 삭제(checks 상태 늘 `DISABLED`) |
| `WorklogCollector`·`HiddenAwareCollector` | `properties`·`expand=properties`·`withChecks`·`checksUnavailableIds` 삭제 |
| `WorklogService` | 이슈 GET 의 `properties=` 제거, kb typ |
| `FlowService`·`WorklogApprovalPolicy` | flowsTouch → change.notify{FLOWS} |
| `AutomaticApproverAccess` | 작성자 org asApp 읽기 삭제(→ org.get SYSTEM) |
| `PersonalDataRepository`·`WorklogControlReadiness`·`WorklogControlRepository` | typ 문자열 교체, `findHiddenByIssues`·`findWorkforceIntentFor`·`listOpenWorkforceIntents`·`bindWorkforceIntent` 추가 |
| `sweepJobs` | `workforce`·`workforce-cert` 삭제, `workforce-cleanup` 일일 목록에 추가 |
| `domain/worklogControl/origin.js` | `originOf({wfIntent})` — 워크포스 envelope 검증 함수 삭제 |
| `domain/worklogControl/intentMatch.js`(신규) · `domain/workforce/{orgView,channelBodies}.js`(신규) | 순수 함수 |
| `ErrorCodes` | `WORKFORCE_API_*` 8개 삭제, 채널 코드 12개 추가(§3.3) |
| `manifest.yml` | webtrigger `approval-link-channel`(dynamic) + function `channelServer` + egress `'*.hello.atlassian-dev.net'`, production 은 주석(S1 미측정) |
| `jest.config.js` | `<rootDir>/tmp/` 제외(아래 §7) |

## 3. resolver 응답 shape (프론트 소비 계약 — 코드 그대로)

모두 `{ success: true, content: … }` / 실패 `{ success: false, error: { name, code, message, cause } }`. 권한 축 전부 `{admin:true}`.

### 3.1 `getWorkforceLinkStatus` (payload 없음)
```js
content: {
  enabled: boolean,                       // 연동 스위치(isWorkforceLinkEnabled)
  channel: {
    status: 'UNPAIRED' | 'PENDING' | 'PAIRED' | 'REVOKED',   // PENDING = 미연결 + 살아 있는 내 연결 코드
    pairedAt: number | null,              // PAIRED 일 때만
    pairedBy: string | null,              // accountId(내가 붙여넣었으면 나, 상대가 붙여넣었으면 코드를 만든 관리자)
    peerApp: 'workforce' | null,
    peerVersion: string | null,           // pingWorkforce 뒤 채워짐(지금 워크포스는 null 을 보낼 수 있음)
    lastOkAt: number | null,
    lastErrorCode: string | null,         // 최근 채널 실패 코드(서명 없는 STALE_LINK·NOT_PAIRED 도 여기만 — 상태를 자동으로 바꾸지 않음)
    pendingExp: number | null,            // 살아 있는 내 연결 코드 만료(PAIRED 중 재연결 코드도 표시)
  },
  signer: { ready: boolean, kid: string | null, fingerprint: string | null },   // 'ab12 cd34 ef56 7890'
  recentFailures: [{ op: string, code: string, lastAt: number | null, hitCount: number }],  // ≤20, op = 채널 작업명(IN/OUT 섞임)
}
```
설계 §8 의 `UNAVAILABLE`(연결 확인 필요)은 상태값이 아니다 — 화면이 `status==='PAIRED' && lastErrorCode` 로 판단한다. 옛 `publish`·`certPublish`·`inbound`·`crypto`·`signing`·`trustedPeerKids` 칸은 **없다**.

### 3.2 연결 관리
```js
createWorkforcePairingCode   payload {}                 → content: { code: string /* 'MLNK1.…' 약 600자, 비밀 */, exp: number }
acceptWorkforcePairingCode   payload { code: string }   → content: { status: 'PAIRED', pairedAt: number }
rotateWorkforceChannelUrl    payload { force?: boolean }→ content: { rotated: true, peerConfirmed: boolean }  // force 없이 상대 실패면 오류
unpairWorkforce              payload {}                 → content: { status: 'REVOKED', peerNotified: boolean }
pingWorkforce                payload {}                 → content: { ok: true, latencyMs: number, proto: number, ops: string[], peerVersion: string | null }
listWorkforceTeams           payload { offset?: number }→ content: {
  enabled: boolean,
  teams: [{ teamKey: 'wf:…', teamName: string | null, leaderKeys: string[], memberKeys: string[], memberCount: number,
            lastReceivedAt: number, state: 'VERIFIED', membersTruncated: boolean, rosterOverlap: string[] }],
  orgDocs: { verified: number, stale: 0, total: number },
  refreshCandidates: [],
  truncated: boolean,
  source: 'WORKFORCE_CHANNEL',
  page: { offset: number, nextOffset: number | null, truncated: boolean } | null,   // 연동 꺼짐이면 null
}
```
`refreshWorkforceCapabilities`(기존, 이름 유지) → `content: { checked, capable, items: [{ accountId, status: 'VERIFIED'|'NONE', capable: boolean /* = 연결됨 */, result: 'OK'|'UNREADABLE' }], workforceOriginCapable: boolean }`.

### 3.3 오류 code (프론트 문구 필요 — `locales/{kr,en}/error.json` 미반영, 프론트 몫)
| resolver | code | cause |
|---|---|---|
| 공통(만들기·붙여넣기) | `LINK_DISABLED`, `SIGNER_NOT_READY`, `CLOUD_ID_UNKNOWN` | — |
| `acceptWorkforcePairingCode` | `PAIR_CODE_MALFORMED`, `PAIR_CODE_UNTRUSTED`(서명·자기 앱 코드·URL 형식 불량 포함), `PAIR_ENV_MISMATCH`, `PAIR_SITE_MISMATCH`, `PAIR_EXPIRED`, `PAIR_PEER_REJECTED`, `PAIR_PEER_UNREACHABLE` | REJECTED `{peerCode}` · UNREACHABLE `{reason}` |
| `rotate…`·`ping…` | `NOT_PAIRED`, `PAIR_PEER_REJECTED`, `PAIR_PEER_UNREACHABLE` | 위와 같음 |
| `listWorkforceTeams` | `NOT_PAIRED`, `WORKFORCE_UNAVAILABLE` | `{reason}` |

삭제된 resolver(프론트가 아직 부름 → `PERMISSION_UNMAPPED`): `republishWorkforceLink`, `getWorkforceOrganizationApiStatus`, `saveWorkforceOrganizationApiConnection`, `deleteWorkforceOrganizationApiConnection`, `listWorkforceOrganizationApiTeams`.

이름·shape 를 바꾸지 않은 기존 resolver(작업 로그 탭·제출·타임시트 등)는 내부 원천만 채널로 바뀌었다. 바뀐 값: 내 타임시트 `workforce.checks` 는 늘 `'DISABLED'`(점검 삭제), 제출 `link_json.checks` = `{ state: 'DISABLED' }`.

## 4. webtrigger 응답 shape (승인 앱이 받는 11 작업 — `ops.js` 응답 검증과 동일)

전송: `POST`, 응답 `statusCode` 200(성공) / 오류는 `HTTP_OF[code]`(없으면 200, `INTERNAL` 500), 헤더 `{'Content-Type': ['application/json'], 'x-moves-link-sig': [sig]}`. 본문 `{env:{v,linkId,op,from:'approval',to:'workforce',cloudId,kid,iat,re}, ok:true, data}` 또는 `{env, ok:false, error:{code, retryable}}`. 1~9단계 실패는 서명 없이 `{"error":{"code":"…"},"ok":false}`.

| op | 성공 `data` | 대표 오류 code |
|---|---|---|
| `pair.complete` | `{ pairedAt, proto: 1, ops: string[] }` | `NOT_PAIRED`, `PAIR_EXPIRED`, `PAIR_PIN_MISMATCH`, `PAIR_URL_INVALID`, `PAIR_ALREADY_PAIRED`, `LINK_DISABLED`, `ACTOR_INACTIVE` |
| `sys.ping` | `{ proto: 1, ops, app: 'approval', version: null, linkEnabled }` | — |
| `sys.rekey` / `sys.unpair` | `{}` | `PAIR_URL_INVALID` |
| `cert.query` | `{ docs: [{ accountId, periodKey, complete, body: {u,dh,cs,cn,mn,dn,sc,sn,pr,ps,pe,wn,w,di?,approval?,at?} \| null }], next?: [[accountId, periodKey]] }` — 문서를 못 만들면 그 문서만 `complete:false, body:null` | `ACTOR_INACTIVE`, `ACTOR_PERMISSION_UNVERIFIED`, `STORAGE_NOT_READY` |
| `period.status` | `{ rows: [{ accountId, periodKey, st, cl, lk?, at? }] }` | `ACTOR_NOT_ALLOWED`(범위 밖 대상 하나라도) |
| `issue.control` | `{ issues: { [issueId]: { controlled, linked, channel: 'OPEN'\|'HANDOFF', handoffPath: string\|null, hidden: string[], permission?: 'UNVERIFIED' } } }` | — |
| `write.judge` | `{verdict:'ALLOW', op, exp}` / `{verdict:'DENY', code, cause?}` / `{verdict:'DEFER', reason, handoffPath}` | — |
| `write.commit` | `{ bound: boolean }` | `OP_UNKNOWN_OR_EXPIRED`, `OP_ACTOR_MISMATCH` |
| `flows.list` | `{ req, def, fo: [{id, n}], rev }` | — |
| `change.notify` | `{ applied: number }` | — |

`write.judge` 의 실제 값 집합 — DENY code: `ACTOR_NO_ACCESS` · `WORKLOG_NOT_FOUND`(남의 기록도 같은 코드) · `WORKLOG_INVALID_INPUT`(`cause.field`) · `WORKLOG_POLICY_BLOCKED`(`cause.code`) · 도메인 판정 코드 그대로(`WORKLOG_PERIOD_LOCKED` `cause{reasonCode,periodKey,which}`, `WORKLOG_CERTIFIED_LOCKED`, `WORKLOG_OUTSIDE_ISSUE_WINDOW`, `WORKLOG_WINDOW_UNRESOLVED`, `WORKLOG_CONTROL_CONFLICT` 등). DEFER reason: `ACTOR_PERMISSION_UNVERIFIED` · `ISSUE_UNRESOLVED` · `WORKLOG_CONTROL_STORAGE` · `WORKLOG_POLICY_AUTHORITY_UNAVAILABLE` · `LINKED_SETTING_PERSIST_FAILED` · `APP_EXECUTION_REQUIRED`(숨김분·권한 스킴 방식) · `LIMIT_NEEDS_TOTAL` · `PREAPPROVAL_REQUIRED`. ALLOW `op` = actor·idem(없으면 nonce)로 만든 결정적 UUID, `exp = now + 15분`.

승인 앱이 워크포스에 보내는 작업과 actor: `org.get`(USER / SYSTEM `auto-request-author`), `org.teams`(USER), `link.resolve`(USER / SYSTEM `worklog-event-issue`, 이슈 1건), `kb.get`(USER), `change.notify`(USER / SYSTEM `cert-observe`·`period-autoclose`), `pair.complete`·`sys.ping`·`sys.rekey`·`sys.unpair`(USER).

## 5. 설계와 다른 점과 이유

1. **OP_UNKNOWN 판정을 서명 확인 뒤로**(설계는 3단계). 서명 응답이 가능하고, 서명 없는 요청에 작업 목록을 드러내지 않는다. SQL·KVS 0 은 같다.
2. **캐시 typ 을 둘로**: `link`(연결 신호) + `linkset`(팀장 설정). `link` 본문은 옛 `rms.policy` 모양(`values:{}`, `locks:{}`, `exp`, 해제 시 `ctl:'NONE'`)이라 `controlLinkOf`·`mergePolicy`·워커 백필이 그대로 돈다. 연결 이슈를 본 프로젝트는 `link P:{projectId}` 표식 행(INSERT IGNORE 1회)으로 남겨 이력 수집 범위(`verifiedLinkSignals`)를 유지한다. 프로젝트 행엔 `ctl` 이 없어 프로젝트 전체 연동으로 읽히지 않는다.
3. **intent source `'WF'`**(설계 `'WORKFORCE'`): 칼럼이 `VARCHAR(8)` 이라 9자가 안 들어간다. property 판 WF intent 와 같은 값.
4. **write.judge op 결정적 생성**: idem 칼럼이 없어 `sha256(actor|idem)` → UUID 형식. 같은 idem 재요청은 INSERT IGNORE 로 같은 op.
5. **서명 없는 오류 code 는 상태를 바꾸지 않는다**: `STALE_LINK`·`NOT_PAIRED` 를 받아도 자동 `REVOKED` 로 바꾸지 않고 `lastErrorCode` 만 남긴다(서명 없는 응답으로 연결을 끊게 두지 않는다). 화면이 안내한다.
6. **change.notify 무효화는 종류별 전역 표식**(KVS `approval:wf:epoch:{ORG,LINK,KB}`): accountIds·issueIds 범위를 SQL 로 지우지 않는다(SQL 0). SETTING 동봉 값만 행에 반영(rev 단조). 수신 비용 0, 대신 표식 뒤 첫 조회가 다시 묻는다.
7. **알림기 throttle**: 인스턴스·종류별 5초 1회, 창 안 대상은 다음 알림에 합친다(꼬리 알림은 보장 안 함 — 워크포스 캐시 TTL 5분이 메움).
8. **SQL 상한**: `cert.query` 는 쌍당 2(인증 행·승인 항목) + 월당 마감 1 + 정책 해석 묶음 1회(≈3) — 설계 "≤4"는 50쌍 기준으로는 넘는다(배치 SQL 메서드를 새로 만들지 않았다). `period.status` 는 사람×연도 1 + 연도 1. 핸들러별 SQL 상한을 숫자로 고정한 테스트는 아직 없다(§8).
9. `flows.list` 의 `PROJECT_NOT_LINKED` 미구현(채널 판에 프로젝트 연결 원장이 없다 — 워크포스가 자기 연결 프로젝트만 묻는다).
10. `period.status` 범위의 "관리자"는 **앱 설정 관리자 명부만** — Jira 관리자 여부는 채널에서 asUser 로 확인할 수 없다.
11. R2+(동의 사용자 impersonation 묶음 확인) 미구현 — 기본 경로(asApp permission/search)만. 최적화라 기능 영향 없음.
12. `WorkforceLinkService.js` 삭제(상태는 `PairingService.status()`), `IssueSignalRefresher.js` 삭제(ControlLinkJudge 가 `resolveMany` 를 직접), `domain/worklogPolicy/authority.js` 삭제(설계는 R).
13. 옛 수신 행(typ `rms.*`) DELETE 를 `PERSONAL_DATA` 가 아니라 정리 작업(`workforce-cleanup`)에 넣었다 — 같은 일회성 작업 하나로 끝나고 완료 표식 뒤 SQL 0.
14. `WorkforceOrgSource` 가 본인 아닌 사람의 org 도 채널로 다시 묻는다(property 판은 본인만 읽을 수 있었다). TeamScope 경로에서 5분에 한 번 채널 1회(약 0.5초)가 붙을 수 있다.
15. `WorkforceSigner.ready()` 가 **키링 공개키 일치(inKeyring)** 까지 요구 — 상대가 검증할 수 없는 키로 서명하지 않게.
16. egress 는 리더 지시대로 와일드카드 `'*.hello.atlassian-dev.net'`(호스트는 `isPeerUrl` 이 워크포스 app id 로 다시 좁힌다).
17. `issue.control.controlled` 정의: `visibilityScope === CONFIRMED_ONLY` 또는 (`LINKED_ALL` ∧ 연결 이슈).
18. `workforce_link_log` 보관 정리(옛 게시기가 180일로 지움)는 돌지 않는다 — 행이 결정적 id 라 실패 종류 수만큼만 쌓인다.

## 6. 미검증 (실측 필요 — `04_spike_todo.md` 하단 표에 확인 방법)

| # | 우선 | 항목 |
|---|---|---|
| **S14** | **P0** | dynamic webtrigger **응답 사용자 헤더** `x-moves-link-sig` 전달 여부 — 안 되면 봉투 판 2(두 리포) |
| S1 | P0 | production webtrigger 도메인(manifest 주석·`isPeerUrl` 정규식 가정 `hello.atlassian.net`) |
| S15 | P0 | 와일드카드 egress 배포·설치 수용 |
| S3 | P0 | webtrigger `context.license`(없으면 통과로 구현) |
| S2b | P0 | 권한 없는 활성 계정 `[]` 여부(구현: `[]`→`ACTOR_NO_ACCESS`, 그 밖→`UNVERIFIED`) |
| S16 | P1 | write.judge 중첩 link.resolve 지연 |
| S17 | P1 | webtrigger 에서 `getAppContext()`(넘김 경로) |
| S18 | P1 | `kvs.deleteSecret`·`deleteUrl` 뒤 `getUrl(key,true)` |
| S2c | P1 | 권한 콤마 목록 의미(지금 권한마다 1회) |

**운영 전 필수(코드 밖)**: keyring 에 prd 키가 없다(`ap-prd-1`·`wf-prd-1` 생성·등록 — `scripts/workforce-link/gen-key.mjs`, 안내 경로를 `integration/channel/keyring.js` 로 고침).

## 7. 삭제 파일 (61개, 전부 `rm` — 스테이징 안 함)

- `src/integration/workforce/` 전체 30개(소스 14 + 테스트 16): `approvalDoc.js`, `base64url.js`, `canonical.js`, `certificationDoc.js`, `contract.js`, `controlDoc.js`, `ed25519.js`, `flowsDoc.js`, `inbound.js`, `keyring.js`, `signature.js`, `vectors.json`, `writeGate.js`, `writeGateVectors.json` + `__test__/` 16개(`approvalDoc`, `canonical`, `certificationDoc`, `contractSelfContained`, `controlDoc`, `inbound`, `linkedIssueContract`, `linkedModeContract`, `orgBodyCrossContract`, `signature`, `workforceGate.cross`, `writeGate.parity`, `writeGateContract` 테스트 + `testKeys.js`, `writeGateCases.js`, `writeGateHarness.js`)
- `src/resolver/workforce/`: `WorkforcePublisher.js`, `WorkforceOutbox.js`, `WorkforceCertWake.js`, `WorkforcePublishWake.js`, `WorkforcePropertyGateway.js`, `WorkforceOrganizationApiController.js`, `WorkforceOrganizationApiService.js`, `WorkforceLinkService.js` + `__test__/` `LinkedCtlPagination`, `RuleViolationCross.verify`, `WorkforceCertWake`, `WorkforceLinkService`, `WorkforceOrganizationApiService`, `WorkforcePublishWake`, `WorkforcePublisher`, `WorkforcePublisherCert`, `WorkforcePublisherCertBoundary.verify`, `WorkforcePublisherCtlNow` 테스트
- `src/resolver/worklogControl/`: `WorklogControlCtl.js`, `IssueSignalRefresher.js` + 테스트 `WorklogControlCtl`, `WorklogControlCtlWriteRules`, `WorklogControlHooksRules`, `IssueSignalRefresher`
- `src/resolver/worklogApproval/`: `WorklogApprovalFlowsDoc.js`, `flowsTouch.js` + `WorklogApprovalFlowsDoc.test.js`
- `src/domain/worklogControl/writeRules.js` + 테스트, `src/domain/worklogPolicy/authority.js`
- `src/resolver/worklogPolicy/__test__/LinkedCtlImmediate.e2e.test.js`

신규 테스트: `src/integration/channel/__test__/*`(공유 4), `src/resolver/channel/__test__/{ChannelServer,ChannelClient,PairingService,handlers}.test.js` + `testChannel.js`, `src/resolver/worklogControl/__test__/WorkforceIntentOrigin.test.js`. 재작성: `WorkforceInbound`, `LinkedIssueSettingSource`, `WorkforceTeamsService`, `WorklogControlHooks`, `WorklogPolicyAuthority`, `idleSqlBudget`(연동 유휴 38 → 27 고정) 테스트 외 다수 기대값 갱신.

## 8. 발견 (범위 밖 — 고치지 않음)

1. **프론트**가 삭제된 resolver 5개를 부르고, 새 상태 shape(§3.1)·오류 코드 12개(§3.3) 문구가 없다 — 다음 단계(frontend). `static/ui` 의 미커밋 D5 변경(`WorkforceOrganizationApiSection` 등)도 프론트 단계에서 철거.
2. **문서**: `CLAUDE.md` 불변식 8·9, `AGENTS.md` asApp 허용 목록(추가 4 사유·삭제 4 경로), DESIGN §4 — docs 단계(설계 §14 docs).
3. 사용자 미추적 `tmp/property-audit-repro.test.js` 가 삭제된 게시기를 import 해 `npm test` 를 깨뜨렸다 — 지우지 않고 `jest.config.js` 에 `<rootDir>/tmp/` 제외를 넣었다. 필요 없으면 사용자가 지우면 된다.
4. 핸들러별 SQL 횟수 고정 테스트(설계 §14 "SQL 상한 테스트")는 cert.query·period.status 배치화와 함께 다음 회차에 넣는 것이 좋다(§5-8).
5. 워크포스 쪽은 `write.judge` 응답 `DEFER reason` 집합(§4)과 `write.commit` 실패 시에도 저장 성공 처리(설계 §4.2)를 맞춰야 한다.

---

## §15 반영 (재작업 2회차, 2026-10-19 — 설계 §15.3 '승인 앱 백엔드' 7개)

### 결과
| 검사 | 결과 |
|---|---|
| `npm test -- --runInBand` | **187 suites / 2,722 tests 전부 통과**(옆 리포 바이트 대조 포함 — 워크포스가 판 2 를 이미 복사) |
| `npm run check:bundle` | OK |
| `forge lint` | 오류 0 · 경고 0 · 승인 1(egress major) |
| S14(응답 헤더 전달) | 리더 실측 통과 — 헤더 방식 유지 |

### 할 일별 반영
| # | 할 일 | 반영 |
|---|---|---|
| 1 | 공유 `ops.js` 판 2 | `SystemReason.PORTFOLIO_BATCH`(`cert.query` SYSTEM — 새 칸 `systemData`: purpose `STATS` 만), `LINK_WITHDRAW`→`LINK_CHANGE`(`'link-change'`, 별칭 없음), `issue.control` 응답 최상위 `globalPagePath` · 행 `timeZone` · `handoffPath` 는 null 이거나 `globalPagePath` 로 시작(검증기 강제), `settingWaValid`(`wa:{autoRequest, lockApproved:true, closeDays 0..90}` 닫힌 키), `link.resolve` 행 `basis:'ISSUE'|'PROJECT'`, `CONTRACT_REVISION = 2`. 벡터 요청 4번(portfolio-batch STATS) 추가·재생성, 동일성 해시 갱신, **`SHARED_READY.md` 판 2**(해시 표·변경 요약·변경 이력). 공유 테스트에 판 2 케이스 4개 |
| 2 | `cert.query` SYSTEM `portfolio-batch` 수신 | SYSTEM 이면 행위자 확인(R1)을 건너뛴다(ops 가 STATS 만 통과시킴). 시험: COST+SYSTEM → 서명 `ACTOR_NOT_ALLOWED`, STATS+SYSTEM → 숫자 본문 |
| 3 | `issue.control`·`write.judge` 넘김 규칙 | `handoffPathOf(base, issueId)` = `${globalPagePath}${issueId}/new`(경로 모르면 null). `issue.control` 행 `timeZone` = 사이트 기간 시간대(`timesheetTimezone`, 기본 `Asia/Seoul` — 옛 ctl `tz` 와 같은 값). `write.judge` DEFER 도 같은 함수(요청마다 새로 만들어 동시 요청이 공유하지 않게) |
| 4 | `wa` 수신 시험 | link.resolve → `linkset` 캐시 → 설정 뷰 본문에 `wa` 그대로(`settingViewOf` 로 분리·공용), `mergePolicy` 가 `wa.closeDays` 로 `periodAutoCloseDays` 를 덮음(출처 `LINKED_ISSUE`), `WorklogRequestService` 가 `wa.autoRequest=false` 면 `UNSUBMITTED`, `true` 면 사이트 끔도 덮음 — `settingWa.test.js`·`WorklogRequestService.test.js` |
| 5 | `basis:'PROJECT'` 를 연결로, 캐시 행 형식 하나로 | `link` I: 행 본문에 `basis`(없으면 ISSUE). P: 프로젝트 행도 **I: 행과 같은 본문 형식**(`linked:true, released:false, basis`, `ctl` 없음 — 프로젝트 전체 연동으로 읽히지 않는다). 처음 볼 때 INSERT, 근거가 PROJECT 로 바뀔 때만 갱신. 판정은 지금처럼 이슈별 응답(I: 행)으로 — 워크포스가 PROJECT 근거로 `linked:true` 를 준다 |
| 6 | 배치 SQL + 횟수 시험 | **cert.query 호출당 SQL ≤ 4**(쌍 수 무관): 인증 행 `WorklogCertRepository.listForDocMany`(OR 묶음 1) · 승인 항목 `WorklogCertificationRepository.forMonths`(OR 묶음 1, 쌍당 1,001 상한은 묶음 뒤) · 마감 행 `findCovering` 전체 범위 1 · 정책 층 `WorklogPolicyRepository.layersFor`(프로젝트 예외·이슈 예외·`linkset` 을 **UNION ALL 한 문장**) 1. 승인 항목이 없으면 2. **period.status ≤ 2**: `TimesheetRepository.listLatestForSubjectsPeriods`(사람×기간 IN 1) + 마감 `findCovering` 1(남의 행이면 범위 확인 TeamScope 가 추가). 시험은 실제 Repository 에 `executeQuery` 만 대역으로 센다(`handlers.test.js` "핸들러별 SQL 횟수": 50쌍 ≤4, 승인 없음 =2, 50명×12기간 ≤2) |
| 7 | 서명 없는 STALE_LINK 로 상태 안 바꿈 | 실제 `ChannelState` 로 시험: PAIRED 유지·`isLinked()` true·`lastErrorCode='STALE_LINK'` 만 기록 |
| + | 설계서 표기 | §1.3·§3·§4.2·§5 intent `'WF'`, §2.2 표 3단계에 "7단계 뒤로" 주석, §15.3 체크 |

### 판 2 로 바뀐 실제 응답 shape (`issue.control`)
```js
data: {
  globalPagePath: '/jira/apps/{appId}/{envId}/worklog/' | null,
  issues: { [issueId]: {
    controlled: boolean, linked: boolean, channel: 'OPEN' | 'HANDOFF',
    handoffPath: `${globalPagePath}${issueId}/new` | null,
    timeZone: string | null,            // 승인 앱 기간 시간대(사이트 값). 워크포스는 넘김 날짜·write.judge 요청 timeZone 에 이 값을 쓴다
    hidden: string[], permission?: 'UNVERIFIED',
  } },
}
```
`write.judge` DEFER: `{ verdict:'DEFER', reason, handoffPath: `${globalPagePath}${issueId}/new` | null }`. `link.resolve` 소비 쪽(승인 앱 `resolveMany`) 링크 뷰: `{ linked, released, unavailable, basis? }`.

### 설계와 다른 점(이번 회차)
1. **정책 층 묶음에서 워크포스 정책 층(`link` 행)을 읽지 않는다** — 워크포스가 values 를 늘 비워 보내 마감 시각 계산에 영향이 없고, 읽으면 SQL 5가 된다. 화면·쓰기 판정 경로(`resolveBatch` 기본 저장소)는 그대로 읽는다.
2. `layersFor` 는 서로 다른 테이블을 `CAST(… AS CHAR)` 로 맞춘 UNION ALL 이다 — **TiDB 실측 전**(아래 S19).
3. `issue.control.timeZone` 은 이슈별 유효 정책이 아니라 사이트 `timesheetTimezone`(옛 ctl `tz` 와 같은 출처) — 기간 경계는 사이트 시간대 하나라서다.

### 미검증 추가
| # | 우선 | 항목 | 확인 방법 | 실패하면 |
|---|---|---|---|---|
| S19 | P1 | `layersFor` UNION ALL(CAST CHAR, `approval_project_config`·`worklog_policy_issue_override`·`workforce_inbound`)과 `forMonths` OR 묶음이 Forge SQL(TiDB)에서 그대로 도는가·50쌍 지연 | 배포 후 워크포스 원가 화면(50명) 1회 — `cert.query` 응답 `complete` 와 지연 | UNION 을 2문장(정책 테이블 · linkset)으로 나눠 SQL 5(설계 상한 초과를 보고) |

### 새·바뀐 파일(이번 회차)
공유: `src/integration/channel/{ops.js, rpcVectors.json, __test__/pairingOps.test.js, __test__/rpcVectors.gen.js, __test__/sharedHash.test.js}`.
승인 앱: `src/resolver/channel/handlers/{certQuery, periodStatus, issueControl, writeJudge}.js`, `src/resolver/workforce/LinkedIssueSettingSource.js`(`settingViewOf`·`basis`), `src/resolver/worklogPolicy/WorklogPolicyRepository.js`(`layersFor`), `src/resolver/worklogCert/WorklogCertRepository.js`(`listForDocMany`), `src/resolver/worklogCertification/WorklogCertificationRepository.js`(`forMonths`), `src/resolver/timesheet/TimesheetRepository.js`(`listLatestForSubjectsPeriods`). 시험: `src/resolver/channel/__test__/{handlers, ChannelServer, ChannelClient, settingWa}.test.js`, `src/resolver/workforce/__test__/LinkedIssueSettingSource.test.js`, `src/resolver/worklogCertification/__test__/WorklogRequestService.test.js`.

---

## 프론트 요청 반영 (재작업 3회차, 2026-10-19 — `02_frontend_report.md` §7 의 3건)

결과: **188 suites / 2,731 tests 통과**, `check:bundle` OK. 새 시험 `src/resolver/channel/__test__/frontendRequests.test.js`.

### (1) `getWorkforceLinkStatus` 비용과 폴링 판정
| 경로 | 호출 1회 비용(정상 상태 — 스키마 표식·테이블 확인 메모 뒤) |
|---|---|
| 가드 `{admin:true}` | KVS 1(설정 관리자 명부) + Jira 1(`isJiraAdmin`, asUser) — 모든 관리자 resolver 공통 |
| 기본 `payload {}` | KVS 3(연동 스위치·연결 상태·대기 코드) + **SQL 1**(최근 실패 `workforce_link_log`) |
| **`payload { light: true }`(신규)** | KVS 3 + **SQL 0** — 최근 실패를 읽지 않고 `recentFailures: null` |

- **판정: `light:true` 로 부르면 폴링 허용**(SQL 0). 유휴 SQL 예산(스케줄 경로)과 무관하다 — 관리자가 화면을 열어 둔 동안만 생기는 호출이고 SQL 을 치지 않는다. 5초 간격·최대 30분이면 호출 360회 = KVS 약 1,440 + Jira 360(관리자 확인)이다. Jira 호출을 줄이려면 10초 간격을 권한다. 기본(최근 실패 포함)은 폴링에 쓰지 않는다(화면 첫 진입·수동 새로 고침에만).
- 상태는 이제 **인스턴스 메모(30초)를 건너뛰고** 읽는다(`ChannelState.read({fresh:true})`). 상대가 다른 인스턴스(webtrigger)에서 PAIRED 를 써도 다음 폴링에 바로 보인다. 폴링을 멈출 조건은 `channel.status !== 'PENDING'`(PAIRED 가 되거나 코드 만료로 `UNPAIRED`/`REVOKED`)이다.

### (2) 설정 미해결 원인 코드 `settingCode`(신규 칸)
`settingUnresolved: true` 가 실리는 곳에 같이 싣는다.
| 위치 | 바뀐 shape |
|---|---|
| `getLinkedIssueOverview` | `content: { …, settingUnresolved: true, settingCode }` |
| `getIssueWorklogs`·`getWorklogEditorContext` 의 `control` 블록 | `control: { …, settingUnresolved: true, settingCode }` |
| 내 타임시트·제출 미리보기 `linkedSettingWarnings[]` | `{ issueId, code, settingCode }` |

`settingCode` 값: `'WORKFORCE_UNAVAILABLE'`(워크포스 응답 없음·통신 실패·캐시 없음 — `READ_FAILED` 와 그 밖 전부) · `'LINKED_SETTING_PERSIST_FAILED'`(받은 설정을 저장하지 못함) · `'STORAGE_NOT_READY'`(테이블 미준비). 미해결이 아니면 칸이 없다. 판정 함수는 `LinkedIssueSettingSource.settingCodeOf` 하나다. 기존 `code`(타임시트 경고의 `TIMESHEET_LINKED_SETTING_UNRESOLVED`/`LINKED_SETTING_PERSIST_FAILED`)는 바꾸지 않았다.

### (3) 최근 실패 방향
`recentFailures: [{ direction: 'OUT' | 'IN', op, code, lastAt, hitCount }] | null` — `OUT` = 승인 앱이 워크포스로 보낸 호출의 실패, `IN` = 워크포스가 보낸 요청을 받다가 난 실패(수신 9단계 이후만 기록 — 위조·변조 요청은 SQL 을 쓰지 않아 목록에 없다). `light:true` 면 `null`.

### 최종 `getWorkforceLinkStatus` shape
```js
content: {
  enabled: boolean,
  channel: { status: 'UNPAIRED'|'PENDING'|'PAIRED'|'REVOKED', pairedAt, pairedBy, peerApp, peerVersion, lastOkAt, lastErrorCode, pendingExp },
  signer: { ready: boolean, kid: string|null, fingerprint: string|null },
  recentFailures: [{ direction: 'OUT'|'IN', op: string, code: string, lastAt: number|null, hitCount: number }] | null,  // light 면 null
}
```
바뀐 파일: `src/resolver/channel/{ChannelState,PairingService}.js`, `src/resolver/workforce/{WorkforceLinkController,LinkedIssueSettingSource}.js`, `src/resolver/worklog/WorklogService.js`, `src/resolver/worklogControl/WorklogControlContext.js`, `src/resolver/timesheet/TimesheetService.js`, 시험 `src/resolver/channel/__test__/frontendRequests{.test,Helpers}.js`.

---

## 검증 1차 수정 (재작업 4회차, 2026-10-19 — `03_verify_report.md` 승인 앱 BE 항목)

결과: **188 suites / 2,743 tests 통과**(옆 리포 바이트 대조 포함 — 워크포스가 판 3 을 이미 복사, `ops.js` 해시 일치 확인), `check:bundle` OK, `forge lint` 오류 0·경고 0(승인 1).

### 공유 `ops.js` 판 3 (가장 먼저 — `SHARED_READY.md` 판 3)
- `issue.control` 행 `link: 'UNVERIFIED'`(선택 — 연결 확인 불가, `linked:true` 와 함께 오면 검증기 거부) · 행 `basis: 'ISSUE'|'PROJECT'`(linked 일 때 근거).
- SYSTEM 사유 `control-change`(워크포스가 받는 `change.notify`).
- `actorViolation` 범위 검사(`subject`·`systemData`)가 예외를 삼키고 형식 오류면 `MALFORMED`, 형식은 맞고 범위가 넓으면 `ACTOR_NOT_ALLOWED`.
- `CONTRACT_REVISION = 3`. 벡터는 바이트 동일.

### 항목별
| # | 수정 | 바뀐 응답 shape |
|---|---|---|
| **F1** 강제 주소 바꾸기 | `rotate({force:true})` 가 상대 미확인이면 상대가 알던 URL 을 지우고 **자기 상태를 REVOKED(`revokedReason:'ROTATED_WITHOUT_PEER'`)** — 워크포스와 같은 규칙, 반쪽 연결을 "연결됨"으로 두지 않는다. 덧붙여 "상대가 실제로 아는 내 URL"(`selfUrl`, 연결 때 기록)과 "상대에게 못 알린 URL"(`orphanUrls`, 비강제 실패 때 기록)을 상태에 남겨, 다음 성공·강제·해제 때 함께 지운다(검증이 지적한 "실패한 새 URL 이 다음 시도의 옛 URL 이 되어 최초 URL 이 살아남는" 문제 해소). | `rotateWorkforceChannelUrl` → `content: { rotated: true, peerConfirmed: boolean, status: 'PAIRED' \| 'REVOKED' }`(**`status` 추가**). 비강제 실패는 그대로 오류 `PAIR_PEER_UNREACHABLE`/`PAIR_PEER_REJECTED`. `getWorkforceLinkStatus.channel` 에 **`revokedReason: 'ROTATED_WITHOUT_PEER' \| null`** 추가(REVOKED 일 때만 값) — 화면이 "연결이 끊어졌다, 연결 코드로 다시 연결" 문구를 고를 근거 |
| **F2** fail-open | `issueControl` 이 `link.unavailable`(워크포스 응답 없음·캐시 없음) 또는 그 이슈 정보가 아예 없으면 `linked:false` 와 함께 **`link:'UNVERIFIED'`** 를 싣는다. linked 면 `basis`. | `issue.control` 행: `{ controlled, linked, channel, handoffPath, timeZone, hidden, permission?, link?: 'UNVERIFIED', basis?: 'ISSUE'\|'PROJECT' }` |
| **F3** 옛 ctl 정리 시점 | `PropertyCleanup.kick()` — **전환 뒤 첫 resolver 호출**(`permissionGuard` 의 `withSchema`, 마이그레이션 직후)과 **첫 채널 수신**(`ChannelServer`, 핸들러 직전)이 정리 작업을 지연 0 으로 큐에 넣는다. 인스턴스당 1회, 다른 인스턴스가 10분 안에 넣었으면 생략(KVS `approval:channel:cleanupKick`), 완료 뒤엔 KVS 1(완료 표식)만. 예산을 실행당 Jira 60 → **300**, 동시 6 으로 키웠고 ctl·flows 를 먼저(기존 정렬), 옛 수신 행(`rms.*`)은 맨 뒤에 1,000건씩 끝까지 지운다. | 없음 |
| **F7** | 승인 앱 `ChannelClient.call`/`callUnpaired` 가 보내기 전에 `validateRequestData` — 틀리면 `REQUEST_INVALID` 로 던지고 네트워크·연결 상태 기록 0. (공유 쪽은 판 3) | 없음(내부 오류 코드 `REQUEST_INVALID` 추가) |
| **F8** | 9단계가 `pair.complete` 를 거르지 않는다 — 대기 코드 없음·불일치는 핸들러가 **서명된 `PAIR_EXPIRED`**(워크포스와 같은 코드). 서명·사이트를 통과한 요청만 오므로 SQL 0 원칙 유지(KVS 1, 실패 로그 SQL 1). | 워크포스 화면: 이 경우 `PAIR_PEER_UNREACHABLE` 대신 `PAIR_PEER_REJECTED`(peerCode `PAIR_EXPIRED`) |
| **F9** | 사람 없는 알림 사유: CERT→`cert-observe`, PERIOD→`period-autoclose`, **CONTROL·FLOWS→`control-change`**(판 3). 실제 발생 경로: CONTROL = 자동 마감 기록(일일)·기간 재개방 큐 작업, FLOWS = 사람 없는 경로 없음(현재 resolver 에서만). | 없음 |
| **F10** | 백엔드 낡은 주석 22곳 정리(TimesheetTargetAdapter·WorklogApprovalPolicy·SettingsService·PeriodClose/Reopen·WorklogPolicyService·TeamScope·SettingsRepository·WorklogHistoryRecorder·worklogHistory·rules·ruleViolation·teamsFromOrgs·PermissionMap·ErrorCodes·workforceLink DDL 주석·보관 2곳) — "재게시·ctl wr·서명 수신 캐시" 표현을 채널 판(알림·write.judge·채널 응답 캐시)으로. 프론트 주석(`RoutingSourceBadge`·`CapabilityRefresh`)은 프론트 몫. | 없음 |

### F3 — 남는 창(구판 워크포스가 옛 `ctl.wr` 로 직접 쓰기를 허용할 수 있는 시간)
| 상황 | 창 |
|---|---|
| 승인 앱 새 판 배포 뒤 누군가 승인 앱을 쓰거나(어떤 resolver 든) 새 판 워크포스가 채널을 부름 | 그 첫 호출 시각 + 큐 지연(수 초~수십 초) + 처리. 처리 속도: 실행당 ≤300건(동시 6, 약 20초), 이어달리기 3회 포함 **깨우기 1번에 최대 1,200건 ≈ 2분**. 연동 프로젝트·이슈 ctl 수백 건이면 **첫 호출 뒤 약 1~2분** |
| ctl 이 1,200건 초과 | 다른 인스턴스의 다음 첫 호출(10분 간격 제한)마다 1,200건씩 + 일일 스윕 |
| 배포 뒤 아무도 승인 앱을 안 쓰고(유휴 사이트) 새 판 워크포스도 없음 | 다음 일일 스윕(배포 후 ≤24시간) + 1,200건/일 |
| 상한 | 그래도 남는 ctl 은 `wr.exp`(≤7일) 만료로 닫힌다 — 구판은 문서 없음·만료 → 넘김. 정리 전 들어온 워크포스 기록은 승인 앱 감지기가 출처 없음(NONE, 외부 입력)으로 처리 |

비용: kick 은 인스턴스당 KVS 1~2 + 큐 push 1(완료 전), 완료 뒤 KVS 1. SQL 0 — 유휴 SQL 예산(27) 불변.

### S18(해제 뒤 URL 재발급) 두 앱 대조
- 승인 앱: 해제 때 지금 URL·`selfUrl`·`orphanUrls` 를 전부 `deleteUrl` → `selfUrlDeleted` 표식 → 다음 연결 코드에서 `getUrl(key, true)`(forceCreate) 후 표식 해제.
- 워크포스(`approvalChannel/ChannelState.js:18,107-119`): `link:selfUrlDeleted` 표식 → `selfUrl()` 이 forceCreate — **같은 규칙으로 이미 맞춰져 있다.** 맞출 쪽 없음.
- 남은 차이 하나(워크포스가 맞출 것): 워크포스 `rotate` 는 `oldUrl = state.selfUrl()`(지금 URL)을 옛 URL 로 쓴다 — 비강제 실패 뒤 다시 시도하면 미확인 URL 을 지우고 상대가 실제로 쓰는 최초 URL 이 남는다(승인 앱이 F1 에서 고친 것과 같은 문제). 승인 앱처럼 "상대가 아는 URL"과 "미확인 URL"을 따로 기록하는 것을 권한다. 해제(`unpair`)도 지금 URL 하나만 지운다.
- 플랫폼 실측(S18 — `deleteUrl` 뒤 `getUrl(key)` 가 지운 URL 을 돌려주는가)은 여전히 미검증이지만, 두 앱 모두 forceCreate 로 피하므로 결과와 무관하게 안전하다.

### 바뀐 파일(이번 회차)
공유: `src/integration/channel/{ops.js, __test__/pairingOps.test.js, __test__/sharedHash.test.js}`. 승인 앱: `src/resolver/channel/{ChannelClient, ChannelServer, ChannelState, PairingService, PropertyCleanup}.js`, `handlers/issueControl.js`, `src/resolver/workforce/WorkforceChangeNotifier.js`, `src/permission/permissionGuard.js` + F10 주석 파일들. 시험: `src/resolver/channel/__test__/{ChannelClient, ChannelServer, PairingService, handlers}.test.js`.

---

## 재검증 1회차 수정 (재작업 5회차, 2026-10-19 — `03_verify_report.md` R1·R3·R4)

결과: **189 suites / 2,750 tests 통과**(+1 suite `ChannelState.test.js`, +7 tests), `check:bundle` OK, `forge lint` 0 errors·0 warnings·approval 1. 공유 `src/integration/channel/*` **무변경 — 판 3 유지**(R3 은 공유 `RETRYABLE` 문제가 아니었다: 거기엔 원래 `RATE_LIMITED` 가 없고, 비대칭은 워크포스 서버가 `true` 로 서명하고 승인 앱 클라이언트가 그걸 따르던 것). `SHARED_READY.md` 에는 해시 변경 없이 "재검증 1회차 메모"(워크포스가 맞출 운영 규칙 3개)만 덧붙였다.

| # | 수정 | 파일 |
|---|---|---|
| **R1** 해제 | URL(지금·상대가 알던·미확인)마다 `deleteUrl(...).then(true, false)` 로 따로 처리. `selfUrlDeleted` = 지금 URL 을 지웠거나 지금 URL 이 없음(`getUrl` 실패 포함 → 다음 코드 forceCreate). 못 지운 URL 은 `orphanUrls` 로 남기고 `selfUrl:null`. `markPaired` 가 이전 상태의 `orphanUrls`+`selfUrl` 을 새 연결의 지울 대상으로 이어받는다(워크포스 `savePaired` 와 같음). 강제 REVOKED 때 `setSelfUrls({selfUrl:newUrl, orphanUrls:[]})` 후 `markRevoked` — 해제가 이미 지운 옛 URL 이 아니라 새 URL 을 지운다 | `PairingService.js`(rotate·unpair), `ChannelState.js`(markPaired) |
| **R3** RATE_LIMITED | 서버: `fail(..., { retryable: false })` 명시. 클라이언트: 서명 오류 코드가 `RATE_LIMITED` 면 상대 `retryable` 무시하고 `retryable:false`(읽기 즉시 재시도 0) | `ChannelServer.js`, `ChannelClient.js` |
| **R4** 미확인 URL 상한 | **규칙: `ORPHAN_URL_LIMIT = 10` 에 닿으면 비강제 주소 바꾸기를 새 URL 을 만들기 전에 거부**(`PAIR_PEER_UNREACHABLE`, cause `reason:'ORPHAN_LIMIT'` — 기존 오류 코드라 화면 문구 추가 없음, "상대에 닿지 않음 → 강제로 바꾸기" 안내가 그대로 맞다). 강제·성공·해제는 언제나 허용되고 목록 전부를 지운다. `setSelfUrls` 는 목록을 자르지 않는다(`slice(-10)` 제거, 중복·빈 값만 정리) — 밀려나 영영 남는 URL 0. 크기 상한: rotate 경로로는 10, 해제 실패 이월분은 해제 1회당 최대 (지금+아는+미확인) 개수라 실무상 한 자리 | `PairingService.js`, `ChannelState.js` |

응답 shape 변화: **없음**(rotate 거부는 기존 `PAIR_PEER_UNREACHABLE` 오류 경로, cause 에 `reason:'ORPHAN_LIMIT'` 만 추가).

워크포스가 맞출 것(같은 규칙): ① `ChannelServer.js:164` `signedError(RATE_LIMITED, true)` → `false` + 클라이언트 무시 규칙 ② `ChannelState.js:72,81` `slice(-10)` 제거 + rotate 앞 `orphanUrls.length >= 10 && !force` 거부. R1 해제 방식·강제 REVOKED `selfUrl` 갱신은 워크포스가 이미 그렇다.

추가 시험: `PairingService.test.js` 4건(강제 REVOKED 뒤 해제가 새 URL 만 지움·해제 부분 실패·지금 URL 실패 시 `selfUrlDeleted:false`·상한 거부/강제 허용), `ChannelClient.test.js` 1건(RATE_LIMITED 재시도 0), `ChannelState.test.js` 신설 2건(자르지 않음·markPaired 이월). 강제 REVOKED 시험에 `selfUrl` 새 URL 단언 추가.

---

## 코덱스 검수 수정 (재작업 6회차, 2026-10-19 — `codex-review.md` 승인 앱 몫 #1·#2·#3 + ActorVerifier 예산)

결과: **189 suites / 2,762 tests 통과**(+12), `check:bundle` OK, `forge lint` 0 errors·0 warnings·approval 1. 공유 `src/integration/channel/*` 무변경(판 3). `SHARED_READY.md` 에 **"상태 전이 규칙"**(키·필드·조건, 두 앱 공통) 추가. 미검증 S20 을 `04_spike_todo.md` 에 추가.

### #1(높음) 쓰기·제출 강제 재조회 실패 = 거부
- `LinkedIssueSettingSource.resolveMany`: 통신 실패 시 72시간 캐시 대체를 **`force` 가 아닐 때만**(표시용) 허용. `force:true`(쓰기·제출·관리자 refresh) 실패는 캐시가 있어도 `settingUnresolved:true, code:'READ_FAILED'`, `active:false`. 그 결과 기존 경로가 그대로 거부한다 — 워크로그 쓰기는 `contextFor` 의 `unresolved` → 창 `READ_FAILED` → `judgeCreate/judgeMutation` 거부, 타임시트 제출은 `TIMESHEET_LINKED_SETTING_UNRESOLVED`. 표시용은 STALE 유지.
- `write.judge`: 정책 계층을 `refresh: true` 로 강제 조회(→ 워크포스 `link.resolve` 를 같은 actor 로 다시 묻는다, 중첩 호출 1회). `linkedSetting.settingUnresolved` 면 **DEFER** — reason `LINKED_SETTING_UNRESOLVED`(신규) 또는 `LINKED_SETTING_PERSIST_FAILED`. intent 기록 0.
- 재현 테스트: 2시간 캐시 + 통신 실패 + `force:true` → `active:false, settingUnresolved:true`, `assertWritable` 이 `WORKLOG_WINDOW_UNRESOLVED`; 같은 조건 표시용은 `settingStale` 캐시. write.judge 는 `refresh:true` 호출·DEFER 단언.
- 워크포스 영향: DEFER reason 문자열 `LINKED_SETTING_UNRESOLVED` 가 새로 온다(넘김 화면 문구가 reason 별이면 추가 필요). 장애 중엔 연동 이슈 쓰기·제출이 승인 앱·워크포스 모두에서 막힌다(Q3 의도대로).

### #2(높음) recordOutcome 경쟁 — 상태와 표시 분리 + gen 조건부 전이
- **API 확인 결과**: `@forge/kvs` 2.0.4 에 `kvs.transact()`(set·delete·check·execute)가 있으나 **조건(conditions)은 사용자 지정 엔티티에만** 걸린다. 일반 키 조건부 set 은 없다(`kvs.set` 은 `keyPolicy: FAIL_IF_EXISTS|OVERRIDE` 뿐). → 연결 상태를 엔티티 `channel-state`(키 `current`, `{gen:int, body:any}`)로 옮기고 조건 `gen equalTo(읽은 gen)` / 처음은 `gen notExists` 로 저장, gen+1. manifest `app.storage.entities` 추가(lint 통과).
- 조건 실패 판별: 오류 코드가 문서에 없어(S20) 실패 후 다시 읽어 gen 이 바뀌었으면 `ChannelStateConflict`, 아니면 원래 오류.
- 성공·실패 표시: `channel:outcome:{linkId}` 별도 키, `recordOutcome` 은 **연결 상태를 쓰지 않는다**. 클라이언트는 호출에 쓴 `linkId` 를 넘긴다. 상태 화면은 현재 linkId 의 키만 읽는다.
- 상대 URL secret 도 `channel:peerUrl:{linkId}` 로 linkId 별(옛 연결에 대한 늦은 rekey 가 새 연결 URL 을 덮지 못한다).
- 전이별 경쟁 처리: 해제(로컬·상대) 3회 재시도로 이긴다 / URL 기록·selfUrlDeleted 해제 2회 / 코드 만들기·코드 붙여넣기 완료는 `PAIR_STATE_CHANGED`(신규 ErrorCodes) / pair.complete 수신은 `PAIR_EXPIRED`. rotate 의 URL 기록·강제 끊김과 상대 해제는 body.linkId 가 같을 때만.
- 재현 테스트(`ChannelState.test.js`): 인스턴스 A·B 가 같은 저장소, B 가 옛 PAIRED 를 메모한 채 A 가 해제 → B 의 늦은 실패 기록 → 상태 REVOKED·gen 2 그대로, 실패는 `channel:outcome:old-link` 에만. 재연결 뒤 옛 linkId 의 늦은 성공도 새 연결에 영향 0.

### #3(중) 해제가 미사용 코드를 남김
- pending 을 연결 상태 body 안으로(별도 키 폐지) — **PAIRED 전이·모든 해제가 같은 전이에서 `pending:null`**. pair.complete 수신은 레코드를 읽어 pending 을 검사하고, 행위자 확인(네트워크) 뒤 **그 gen 으로만** PAIRED 전이(`completeFrom`) — 사이에 해제·새 코드가 끼면 `PAIR_EXPIRED`.
- 테스트: 상대 해제 뒤 보관 코드 → `PAIR_EXPIRED`·REVOKED 유지 / 로컬 해제 뒤 같음 / 확인 중 해제 → PAIRED 전이 안 됨 / 코드 만들기 경쟁 → `PAIR_STATE_CHANGED`.

### 추가 — ActorVerifier 6초 예산
- `permitted()` 전체(키 조회 + 권한 조회)를 `Promise.race(작업, 6초 타이머)` 로 끊는다. 예산이 지나면 그 시점까지 확정된 결과만으로 답하고 나머지는 `null`(호출부 기존 규칙: `ACTOR_PERMISSION_UNVERIFIED` 거부 / write.judge DEFER). 늦게 끝난 요청은 답을 바꾸지 않는다(메모에만). `AbortController` 는 쓰지 않았다 — `RequestJira`(Forge `requestJira`)에 중단 신호 전달 경로가 없어, 진행 중 HTTP 는 백그라운드에서 끝까지 간다(호출 수 상한 PARALLEL 6 은 그대로).
- 테스트: 400ms 걸리는 권한 응답 + 예산 40ms → 300ms 안에 답, 그 이슈 null·확정된 이슈 false 유지 / 키 조회가 늦어도 null.

### 바뀐 응답 shape·코드
- `getWorkforceLinkStatus.channel`: shape 동일. `lastOkAt`·`lastErrorCode`·`peerVersion` 원천이 표시 키로 바뀜(표시 기록이 아직 없으면 `lastOkAt = pairedAt`, 나머지 null).
- 신규 오류 코드 `PAIR_STATE_CHANGED`(코드 만들기·코드 붙여넣기에서 다른 인스턴스와 겹침) — **프론트 번역 필요**(`locales/*/error.json`, 이번 범위 밖이라 손대지 않았다). 문구 제안: "다른 화면에서 연결 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요."
- write.judge DEFER reason `LINKED_SETTING_UNRESOLVED` 신규.

### 바뀐 파일
`src/resolver/channel/{ChannelState.js(재작성), PairingService.js, ChannelClient.js, ActorVerifier.js, handlers/writeJudge.js}`, `src/resolver/workforce/LinkedIssueSettingSource.js`, `src/utils/errors/ErrorCodes.js`, `manifest.yml`(storage.entities). 시험: `src/resolver/channel/__test__/{ChannelState(재작성), PairingService, ChannelClient, handlers, frontendRequests}.test.js`, `src/resolver/workforce/__test__/LinkedIssueSettingSource.test.js`.

### 미검증·대안
- S20(위). 엔티티 조건이 기대와 다르게 동작하면 대안: 상태를 gen 별 불변 키 `channel:state:{gen}` 에 `keyPolicy:'FAIL_IF_EXISTS'` 로 만들고(먼저 만든 쪽이 이김) 포인터 키로 최신 gen 을 가리키는 방식 — 포인터 갱신이 원자적이지 않아 읽기가 "포인터 gen 이상 중 존재하는 최대"를 찾아야 해서 더 복잡하다. 엔티티 판이 실측에서 통과하면 쓰지 않는다.
- 엔티티 추가가 major 승인을 요구하는지 미확인 — 이번 배포는 SQL 추가로 이미 `MAJOR_VERSION_RULE` 승인 대상이라 배포 절차는 같다.

### S20 실측 반영 (재작업 6-1회차)
리더 실측 통과 — `createEntityCas.commit` 이 오류 `code === 'CONDITIONAL_CHECK_FAILED'` 면 다시 읽지 않고 바로 `ChannelStateConflict`(상수 `CONDITIONAL_CHECK_FAILED`), 그 밖의 오류만 다시 읽어 판별. `ChannelState.test.js` 에 엔티티 어댑터 시험 3건(조건·gen+1·notExists / 조건 실패 즉시 경쟁·재조회 0 / 기타 오류 판별). 위 "미검증·대안"의 S20 항목과 gen 별 키 대안은 불필요해졌다. `SHARED_READY.md` 상태 전이 규칙도 같은 내용으로 갱신. `PAIR_STATE_CHANGED` 문구는 프론트 몫(리더가 전달).
