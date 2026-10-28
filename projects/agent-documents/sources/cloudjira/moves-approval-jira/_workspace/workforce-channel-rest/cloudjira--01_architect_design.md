# 워크포스 연동 채널 재설계 설계서 — property → webtrigger(앱 간) + apiRoute(외부)

> 작성 2026-10-19 · feature-architect · 입력 `00_input/requirement.md`(D1~D6)
> 기준 코드: 승인 앱 `0c52170` + 작업 트리(미커밋 `WorkforceOrganizationApi*` 포함), 워크포스 `80e7d31`
> 실측 근거: `C:\CloudJira\spikes\app-channel\RESULTS.md`(W0~W6, R0~R4) · 보안·한도 근거: `_workspace/app-channel/CHANNEL_DECISION.md`
> 이 문서는 설계만 한다. 코드·manifest·배포·커밋 변경 없음.

---

## 열린 질문 — 결정됨 (2026-10-19 사용자 답, `00_input/requirement.md` 하단)

| # | 결정 | 설계 반영 위치 |
|---|---|---|
| Q1 | **한 번에 전환 — 이중 운행 없음.** 새 판부터 property 코드 없음, 미페어링 = "연결 필요"(연동 기능 꺼짐과 같은 동작 + 관리자 안내) | §12(단일 major 릴리스로 재구성), §11, §14 |
| Q2 | **추천안 (다)** — 앱이 자기 게시분을 지우고, 못 지우는 것은 검증 코드 삭제로 무효화 | §4.5, §9.3, §12 P3 |
| Q3 | **막기(fail-close)** — "확인 불가" 상태, 기존 잠금 유지, 연동 이슈 쓰기는 거부·승인 앱 화면으로 넘김. 자동 단독 전환 없음 | §4.3, §4.6 |
| Q4 | **이번엔 외부 API 없음** — apiRoute·custom scope 추가 안 함. 외부 API 는 후속 과제(§6.3 로 축소) | §1.5, §6.1, §6.3, §10(S10 후속), §11, §14 |
| Q5 | **추천안 (가)** — 워크포스 `/v1/organization/teams`(`TeamsReadApi.js`) 외부 API 로 유지, 승인 앱 호출자(D5)만 철거 | §6.1, §11.2(철거 대상 아님) |
| Q6 | **양쪽 모두** 연결 코드 만들기·붙여넣기 가능 | §2.4, §2.7, §7 |

<details><summary>결정 전 질문과 선택지(기록)</summary>

| # | 질문 | 선택지 | 추천 | 추천 이유 |
|---|---|---|---|---|
| Q1 | **이행 방식** — 두 앱의 새 판이 모두 깔리고 페어링될 때까지 property 게시를 같이 돌릴까? | (가) 이중 운행 한 판(N판은 미페어링이면 property 계속, N+1판에서 삭제) (나) 한 번에 전환(N판부터 property 코드 없음, 미페어링 = 연동 정지 + "다시 연결" 안내) | **(나)** — 단, 운영 고객 중 연동 모드를 실제로 켠 사이트가 있으면 (가) | 이중 운행은 철거 대상 코드(약 1.5만 줄)를 한 판 더 유지·검증해야 한다. 현재 연동 모드는 개발 사이트 외 실사용 근거가 없다(스트라드비전 대응 문서에도 연동 운영 약속 없음). 확인되면 (가) |
| Q2 | **남은 property 데이터 정리** | (가) 앱이 자기 게시분을 지운다(승인 앱: `workforce_publish` 목록 기준 일회성 큐 작업, 워크포스: 자기 SQL 의 연동 이슈·프로젝트 + 본인 org 는 접속 시) (나) 지우지 않고 신뢰 kid 를 빼서 무효화만 (다) (가)+(나) | **(다)** | 남은 문서는 무해하지만(검증 안 함) 32KB×수천 건이 고객 Jira 에 영구히 남는다. 지울 수 없는 것(타 사용자 user property 중 워크포스가 asApp 권한 없는 것)은 kid 제거로 무효화 |
| Q3 | **상대 앱 장애·연결 끊김 시 동작** | (가) "확인 불가" 상태 — 기존 잠금 유지, 연동 이슈 쓰기는 fail-close(승인 앱 화면으로 넘김), 표시는 마지막 값 + 경고 (나) 자동으로 단독 모드 전환 | **(가)** | `PROPERTY_INTEGRATION_FULL_REVIEW.md` §2 "연동 중 상대가 사라졌다고 단독으로 자동 전환하면 안 된다"와 같은 결론. 단독 전환은 관리자가 연결 해제할 때만 |
| Q4 | **외부 apiRoute 1차 범위** | (가) 이전 `WorklogReadApi` 2개만 복원(`/v1/worklogs/approval`, `/v1/worklogs/history`, 기존 dev scope 재사용) (나) (가) + SAP 월 인증 시간 `/v1/timesheets/certified`(새 scope 1개) | **(나)** | 고객 요구(SAP 월 1회)는 월 인증 합계다. (가)만으로는 건별 조회 N 회가 필요. scope 는 삭제·개명 불가라 이름은 이번에 확정 |
| Q5 | 워크포스의 기존 apiRoute `/v1/organization/teams`(커밋됨, `TeamsReadApi.js`)를 어떻게 할까 | (가) 외부 공개 API 로 유지(승인 앱은 안 씀) (나) 제거 | **(가)** | D2 의 "외부는 apiRoute" 에 맞는 자산이고 권한 판정이 guarded handler 재사용이다. 승인 앱 쪽 호출자(D5)만 철거 |
| Q6 | 페어링 코드를 **어느 앱에서 만들까** | (가) 양쪽 다 만들기·붙여넣기 가능 (나) 승인 앱이 만들고 워크포스에 붙여넣기만 | **(가)** | 고객 관리자가 두 앱 관리자가 다를 수 있다. 프로토콜은 대칭이라 비용 차이가 없다 |

</details>

---

## 1. 개요·영향 범위

### 1.1 원칙 (이번 재설계의 한 줄 규칙)

1. **원장 주인이 답한다.** 데이터는 복제 문서(property)로 미리 게시하지 않는다. 필요한 쪽이 그 순간 주인 앱에 묻는다(pull, dynamic webtrigger). 승인 판정·잠금은 승인 앱 DB, 팀·연결·작성 기간은 워크포스 DB 가 그 자리에서 답한다.
2. **바뀌면 알린다.** 주인은 변경 직후 작은 알림(`change.notify`)을 보낸다(best effort, 멱등). 알림은 캐시를 무효화할 뿐 판정 근거가 아니다. 놓쳐도 캐시 TTL 이 메운다.
3. **사람이 일으킨 호출은 그 사람으로 처리한다(D6).** 모든 요청 봉투에 행위자(actor)를 서명해 싣고, 받는 앱이 그 사람 기준으로 다시 범위를 좁힌다. 사람이 없는 호출은 `SYSTEM` 으로 구분하고 허용 작업을 따로 닫는다(§2.6).
4. **사이트당 연결 하나, 첫 연결은 붙여넣기 한 번(D3).** property 를 발견용으로도 쓰지 않는다.

이 원칙으로 property 방식의 결함이 구조적으로 사라진다: 누락 재게시 생략(FULL_REVIEW P0-1) — 게시물이 없다 / 승인 직후 잠금 전파 지연(P0-2) — 워크포스 쓰기마다 승인 앱이 현재 DB 로 판정 / 옛 정상 문서 재부착(P1-1) — 응답이 요청 nonce 에 묶임 / 오래된 팀장(P1-2) — 팀 변경 알림 + 5분 TTL / 32KB 잘림(P2-2) — 응답 1MB 묶음.

### 1.2 정보 흐름 전수 목록 (현재 property 방식 — 코드 근거)

`contract.js` 의 `TYP`·`PROPERTY_KEY` 13종 + 계약 밖 암묵 흐름 3종. 두 리포의 `contract.js` 는 바이트 동일(diff 확인).

| # | 서명 문서(typ) · 위치·키 | 방향 | 게시자(코드) | 게시 계기·주기 | 소비자(코드) | 읽는 시점·신선도 | 크기 |
|---|---|---|---|---|---|---|---|
| F01 | `rms.org` · 사용자 `movesRms.org` | WF→AP | WF `ApprovalLinkSignals.ensureOrgCap`(본인 asUser) | 워크포스 접속(`PermissionController` 앱 진입·`IssueWorklogControlService`) 때, 인스턴스 메모 6h + KVS `approvalLink:orgEpoch`(팀 쓰기 9곳에서 bump) | AP `WorkforceInbound.orgOf`(본인 asUser, `ORG_MAX_AGE_MS` 5분) → `WorkforceOrgSource` → `TeamScope`·`TimesheetRouting`·`WorklogRequestService`; `AutomaticApproverAccess`(트리거 asApp, 작성자 1명); `WorkforceTeamsService.listWorkforceTeams`(관리자, 수신 캐시) | 5분, 실패 시 sticky | leads ≤50 × members ≤500 상한(검증기), 보통 1KB 미만, 최대 32KB |
| F02 | `rms.policy` · 이슈/프로젝트 `movesRms.policy` | WF→AP | WF `ApprovalLinkSignals.ensure*`(asApp) — `IssueWorklogControlService`, 관리자 `publishApprovalLinkSignals`, 해제 `withdrawIssues`(`ProjectLinkWriter`·`ProjectDeletionWorker`) | 연결·해제·관리자 일괄. 서명 TTL 28일, 남은 7일이면 재게시 | AP `WorklogPolicyAuthority.refreshOne`(이슈 조회 `properties=` 동승 asUser) / `IssueSignalRefresher`(워크로그 트리거 asApp, 이슈당 1h) / `ControlLinkJudge` | 1h, 삭제는 sticky | < 1KB |
| F03 | `rms.issue` · 이슈 `movesRms.issue` | WF→AP | WF `IssueApprovalSettingService.save`(팀장, asApp PUT), `clearSetting` | 팀장 저장 시 | AP `LinkedIssueSettingSource.receive`(이슈 조회 동승 asUser, `SETTING_RECHECK_MS` 1h, 제출 시 재조회) · `WorklogControlDetector`(트리거 asApp) · `WorklogPolicyResolver` | 1h·제출 즉시 | < 1KB |
| F04 | `rms.kb` · 프로젝트 `movesRms.kb` | WF→AP | WF `ensureKb`(asApp) — 관리자 일괄·팀장 저장·이슈 탭 | 저장·`kbStale` | AP `LinkedIssueSettingSource`(KPI 카드: 하루 근무 시간·공휴일), `WorklogService` | 1h | hol ≤400건 ≈ 7KB |
| F05 | `rms.pm` · 프로젝트 `movesRms.pm` | WF→AP | **없음**(워크포스 코드에 게시자 0) | — | AP `WorkforceInbound.pmOf`(`PM_MAX_AGE_MS` 1h) | — | — |
| F06 | `rms.check` · 워크로그 `movesRms.check` | WF→AP | **없음** | — | AP `WorklogCollector`(`expand=properties`, `withChecks`) | — | — |
| F07 | `rms.wlorigin` · 워크로그 `movesRms.origin` | WF→AP | WF `IssueWorklogControlService.create`(asUser POST 본문에 동승) | 워크포스 작성마다 | AP `domain/worklogControl/origin.js` ← `WorklogControlDetector`(트리거) / WF 자신 `LinkedWriteGate.freshOwnOf`(10분 유예 Q5) | 작성 직후 | < 1KB |
| F08 | `approval.timesheet`(v1) · 사용자 `movesApproval.{YYYY}` | AP→WF | AP `WorkforcePublisher.drain`(asApp, 큐) | 결정·제출·마감 직후 `WorkforcePublishWake`(15s 지연) + 일일 `workforce` 작업 | WF `LinkedWriteGate`(본인 asUser, 제출·승인 잠금) | 쓰기 직전 | ≤ 30,000B(`DOC_SIZE_LIMIT`) |
| F09 | `approval.cert`(v2) · 사용자 `movesApproval.cert.{YYYY-MM}` (+`approval` 건별 승인 칸) | AP→WF | AP `WorkforcePublisher.drain/publishCertNow` | 인증·재인증·관찰 전이 직후 `WorkforceCertWake`(45s) + 일일 | WF `ApprovalCertReader`(원가 asApp, 배지 asUser, 승인 통계 `applyWorklogApproval`) — 소비 서비스 15개(§11 목록) · `LinkedWriteGate` | 메모리 5분 | ≤ 30,000B, 1,000건 상한 `wt:true` |
| F10 | `approval.ctl` · 프로젝트/이슈 `movesApproval.ctl` (`vs`·`vt`·`ch`·`rx`·`dw`·`sf`·`tz`·`ui`·`gen`·`wr`) | AP→WF | AP `WorkforcePublisher.drainCtl/publishCtlNow`(요청당 3건) + 일일 `scanCtl` | 연동 신호 최초 VERIFIED·통제 설정·기록 규칙·마감·예외 저장 | WF `ApprovalControlLookup`(이슈 탭 asUser, 협업·원가 asApp, 프로젝트 60s 캐시) → `CollabWorklogFetcher.isApprovalHidden`, `IssueWorklogControlService`(WF-7 숨김 본인 기록, WF-8 창구), `LinkedWriteGate`(`wr`+`writeGate.js`) | 화면 열 때 | `wr.ix` ≤500 → 최대 ≈ 12KB |
| F11 | `approval.flows` · 프로젝트 `movesApproval.flows` | AP→WF | AP `WorkforcePublisher.drainFlows`(원장 `F:{projectId}`) | 결재선 저장(`FlowService`·`WorklogApprovalPolicy`→`flowsTouch`) | WF `IssueApprovalSettingService`(결재선 선택지, asUser), 진단 | 화면 열 때 | ≤20 × 170B ≈ 4KB |
| F12 | `approval.worklog` / `approval.issue` · `movesApproval` | AP→WF | **없음**(계약 자리만) | — | 없음 | — | — |
| F13 | (암묵) **연결 발견 관문** — "워크포스 게시물을 한 번이라도 VERIFIED 수신했나" | WF→AP | F01~F04 의 부산물 | — | AP `WorkforcePublisher.gate`, `WorkforceCertWake`/`PublishWake`(NOT_LINKED), `IssueSignalRefresher` 관문, KVS `approval:linkedSetting:any` | — | — |
| F14 | (암묵) **능력 협상** — ctl `rx`(받을 수 있는 문서·칸 토큰 6종), org `cap`('wlorigin'), ctl `ch`(APP) | 양방향 | F10·F01 안 | — | 양쪽 게이트 | — | — |
| F15 | (미커밋) **조직 조회 API** — AP 관리자가 WF apiRoute `/v1/organization/teams` 를 3LO 토큰으로 호출 | AP→WF | — | 관리자 요청 시 | AP `WorkforceOrganizationApiService` | 즉시 | 512KiB 상한 |

**교환이 아닌 property — 이번 범위에서 유지**(근거: 상대 앱이 읽지 않는다):

| 키 | 주인 | 용도 | 유지 이유 |
|---|---|---|---|
| `movesApproval.origin`·`movesApproval.op`·`moves.approval.worklog` | 승인 앱 자기 워크로그 | DB intent 행을 찾는 키(불변식 9 — 값은 신뢰 안 함) | 앱 내부 표식. 워크포스는 읽지 않는다 |
| `movesRms`·`movesRmsLink`·앱 필드 `moves_RMS_projectId` | 워크포스 자기 이슈 | 간트·진척·패널 노출 표식 | 워크포스 내부. 승인 앱은 읽지 않는다 |
| 워크로그 `visibility` | Jira | B 단계 통제 | 요구 범위 밖(채널 문제 아님) |

### 1.3 흐름 → webtrigger 작업 대응

| # | 새 경로 | 방식 | actor | 비고 |
|---|---|---|---|---|
| F01 | WF `org.get`(주인 = WF SQL) + 캐시 `workforce_inbound`(typ `org`) TTL 5분 + WF→AP `change.notify{kind:ORG}` | pull + 무효화 | USER(조회 화면의 사람) / SYSTEM(트리거의 작성자 1명) | 팀장 교체가 그 사람이 워크포스에 들어올 때까지 안 반영되던 결함(P1-2) 해소 |
| F01(관리자 목록) + F15 | WF `org.teams`(페이지) | pull | USER(승인 앱 관리자) | D5 대체. 3LO·KVS secret·`api.atlassian.com` egress 철거 |
| F02+F03 | WF `link.resolve{issueIds≤100}` → 이슈별 {연결 여부, WF 프로젝트, Jira 프로젝트, 팀장 설정 s·e·pa·fl·tk·by·rev} + WF→AP `change.notify{kind:LINK|SETTING, data?}` | pull + 무효화(설정은 값 동봉) | USER / SYSTEM(트리거의 이슈 1건) | 28일 서명 TTL·재게시·sticky 규칙·"더 엄한 쪽" 병합 폐기(주인이 현재 값을 답한다) |
| F04 | WF `kb.get{projectIds≤20}` | pull, 캐시 24h | USER | 공휴일·근무 시간 |
| F05 | **삭제** | — | — | 게시자 없음. `pmOf`·`PM_MAX_*` 제거 |
| F06 | **삭제** | — | — | 게시자 없음. `WorklogCollector.withChecks`·`CHECK_PROPERTY_KEY`·`HiddenAwareCollector` 점검 불가 안내 제거 |
| F07 | AP `write.judge`(ALLOW 응답에 `op` 발급 → `worklog_control_intent` source=`WF` 행) → WF 가 Jira 에 POST → AP `write.commit{op, worklogId}` | 동기 판정 + 확정 알림 | USER(작성자) | 출처 판정은 intent 의 op 결속, `write.commit` 이 유실되면 지문(작성자·이슈·started·seconds, 15분 창)으로 결속. 워크로그 property 0 |
| F08 | AP `period.status{accountIds, periodKeys}` | pull | USER | 잠금 판정은 `write.judge` 가 한다. 이 작업은 표시용 |
| F09 | AP `cert.query{pairs≤50, purpose}` | pull, WF 메모리 캐시 5분 + AP→WF `change.notify{kind:CERT}`(WF KVS epoch) | USER(purpose `COST`·`STATS`·`BADGE`) | 200명 집계가 Jira 400회 → webtrigger 4회 |
| F10 | AP `issue.control{issueIds — ROWS≤50·AGGREGATE≤100}` → {통제 여부, 우리가 숨긴 워크로그 id(범위 제한), 쓰기 창구 OPEN/HANDOFF, 넘김 경로} + `write.judge` | pull | USER / (집계) USER purpose `AGGREGATE` | `wr`·`writeGate.js` 폐기(§1.4). `vt` 일치 추정 대신 **실제 숨긴 id 목록**(불변식 8 ④ 를 더 좁게) |
| F11 | AP `flows.list{projectId}` | pull | USER(워크포스 팀장 화면) | |
| F12 | **삭제** | — | — | 계약 자리만 |
| F13 | 페어링 상태(KVS `link:channel`) | — | — | `isLinked` 판정 = 연동 스위치 ON ∧ PAIRED |
| F14 | `sys.ping` 응답의 `{proto, ops[]}` | pull | USER(관리자) / 페어링 직후 | 모르는 작업은 서명된 `OP_UNKNOWN` → 호출자가 "그 기능 없음"으로 처리 |

### 1.4 공유 판정 파일 `writeGate.js` — **폐기** (두 리포)

- 지금: 워크포스가 승인 앱이 게시한 `wr`(병합 끝난 기록 규칙·마감 행·이슈 예외, `exp` 3일 버킷) + 본인 v1·cert 문서로 **로컬 판정**한다. 그래서 같은 판정 코드를 두 리포에 바이트 동일로 두고(420줄 × 2), 골든 158·무작위 2,000 대조 벡터(10,173줄 × 2)로 동일성을 강제했다.
- 새 채널: 워크포스가 저장 직전 `write.judge` 로 승인 앱에 묻는다(약 0.2초, 실측 W4). 승인 앱은 자기 도메인(`domain/worklogControl`·`worklogPolicy`·`timesheet/lock`)과 **현재 DB** 로 판정한다. 같은 판정의 두 번째 사본이 필요 없다.
- 효과: 승인 직후 잠금 전파 지연(P0-2) 소멸, `wr` 만료·버킷·`ix` 500 상한 소멸, `F-1`·`F-2` 류 근사 경로 재발 불가.
- 대가: 워크포스 연동 이슈 쓰기 1건당 webtrigger 2회(judge + commit). 승인 앱 장애 시 연동 이슈 쓰기는 fail-close(`DEFER` → 승인 앱 화면으로 넘김) — 현재 `DEFER` 의미와 같다.
- 같이 폐기: `contract.js`(13 typ 계약 → 새 `channel/ops.js`), `vectors.json`(property 서명 벡터 → 새 봉투 벡터 `rpcVectors.json` 로 교체), `writeGateVectors.json`, 워크포스 `domain/approvalLink/writeChannel.js`(창구 판정 → `issue.control.channel`).
- **새 공유 파일(두 리포 바이트 동일 유지)**: `src/integration/channel/{envelope.js, ops.js, pairingCode.js, canonical.js, base64url.js, ed25519.js, keyring.js, rpcVectors.json}` — 봉투·작업 스키마만. 판정 로직은 넣지 않는다. 동일성은 기존 방식(`.gitattributes eol=lf` + 해시 대조 테스트)으로 강제한다.

### 1.5 영향 범위 요약

| 층 | 승인 앱 | 워크포스 |
|---|---|---|
| 도메인 | `origin.js`(WORKFORCE 출처를 intent 로), `worklogPolicy/authority.js`(서명 envelope 검증 제거), `writeRules.js`(`wr` 빌더) 삭제 | `domain/approvalLink/writeChannel.js` 삭제 |
| 통합 | `integration/workforce/*` → `integration/channel/*`(공유) | `integration/approval/*` → `integration/channel/*`(공유) |
| resolver | `resolver/workforce/*` 재구성(§4), 페어링 resolver 5개 신설, `republishWorkforceLink` 삭제, `WorkforceOrganizationApi*` 4개 삭제 | `resolver/approvalLink/*` 재구성, 페어링 resolver 5개 |
| 서버 진입점 | webtrigger 함수 `channelServer`(dynamic) | 같음 |
| 스키마 | **SQL 마이그레이션 없음**(기존 테이블 재사용, §5) | 없음(DB 무증가 유지 — KVS 키 4개만) |
| manifest | webtrigger 1(dynamic) + function 1 + egress 1 — **major**(apiRoute·custom scope 추가 없음, Q4) | webtrigger 1(dynamic) + function 1 + egress 1 — **major** |
| 프론트 | 설정 > 워크포스 연동 카드 재작성(페어링), 조직 API 섹션 삭제 | 설정 `ApprovalLinkCard` 재작성 |
| i18n | `workforce.json` `channel.*` 신설, `organizationApi.*` 삭제 | 해당 namespace |

---

## 2. 경계면 계약

### 2.1 webtrigger 모듈 (두 앱 대칭)

| 앱 | module key | function | response | urlFormat |
|---|---|---|---|---|
| 승인 앱 | `approval-link-channel` | `channelServer` → `index.channelServer` | **dynamic**(데이터 응답) | v2(기본) |
| 워크포스 | `workforce-link-channel` | `channelServer` | dynamic | v2 |

한 URL 로 받고 봉투의 `op` 로 분기한다(작업마다 모듈을 만들면 URL 교환·회전 비용이 작업 수만큼 는다). dynamic 이라 받는 쪽도 Runs on Atlassian 실격(D4 수용).

### 2.2 요청·응답 봉투 (보안 명세)

**전송 형식**

```
POST {peerUrl}
Content-Type: application/json
x-moves-link-sig: <Ed25519 서명 base64url 86자>
body: <UTF-8 JSON 문자열 그대로 = 서명 대상의 일부>
```

**서명 대상 바이트** = `UTF-8("moves-link-rpc/1\n") ‖ rawBody`
- 원문 바이트에 서명한다(실측 W1·W2 가 이 방식). 재직렬화 정규화 문제를 없앤다. property 서명(`moves-link/1\n`)과 **도메인 접두가 달라** 옛 property 서명을 RPC 로, RPC 서명을 property 로 옮겨 쓰지 못한다.
- 본문 해시를 따로 싣지 않는다 — 본문 전체가 서명 대상이다.

**요청 본문**

```json
{
  "env": {
    "v": 1,
    "linkId": "<페어링 때 정한 22자>",
    "op": "cert.query",
    "from": "workforce", "to": "approval",
    "cloudId": "<사이트 cloudId>",
    "kid": "wf-prd-1",
    "iat": 1792390000000,
    "nonce": "<16바이트 base64url 22자>",
    "actor": { "type": "USER", "accountId": "5f…" },
    "idem": "<선택 — 쓰기 작업의 멱등 키>"
  },
  "data": { … 작업별 입력 … }
}
```

`actor` 는 둘 중 하나다:
- `{type:'USER', accountId}` — **보내는 앱 resolver context 의 `principal.accountId` 를 서버가 읽어 넣는다.** payload·클라이언트 값 금지(ChannelClient 가 `InvocationScope.currentAccountId()` 만 받는다. 인자로 accountId 를 받는 시그니처를 두지 않는다).
- `{type:'SYSTEM', reason, subject?}` — 트리거·큐 작업. `reason` 은 허용 목록(§2.6) 값, `subject` 는 **서버가 Jira 데이터에서 정한** 대상(예: 워크로그 작성자 accountId, 이슈 id).

**응답 본문**(HTTP 200, 서명 헤더 동일 규칙)

```json
{
  "env": { "v":1, "linkId", "op", "from":"approval", "to":"workforce", "cloudId", "kid", "iat", "re":"<요청 nonce>" },
  "ok": true,
  "data": { … } | "error": { "code": "…", "retryable": false }
}
```

호출자는 응답도 검증한다: 서명, `re == 요청 nonce`, from/to/linkId/cloudId/op 일치, |now − iat| ≤ 120s. 응답이 요청에 묶이므로 옛 응답을 다시 끼워 넣지 못한다(P1-1 의 "옛 정상 문서 재사용" 대체).

**수신 검증 순서 — SQL·KVS 전에 CPU 만으로 거른다**

| 단계 | 검사 | 실패 HTTP·코드(서명 없는 최소 응답) | 비용 |
|---|---|---|---|
| 1 | method POST, `event.body` 길이 ≤ 262,144B | 405 / 413 `TOO_LARGE` | 0 |
| 2 | JSON 파싱, `env` 형태·`v===1`, `to===self`, `from` = 상대 계열 | 400 `MALFORMED` | 0 |
| 3 | (구현: 7단계 뒤로 옮김 — §15.2) `op` ∈ 이 방향 허용 목록(§2.3). 서명·사이트 확인을 통과한 뒤에만 판정해 서명 응답으로 답한다(서명 없는 요청에 작업 목록을 드러내지 않는다) | 400 `OP_UNKNOWN`(서명 응답 — 버전 협상용) | 0 |
| 4 | |now − iat| ≤ 120,000ms | 401 `STALE_REQUEST` | 0 |
| 5 | `kid` ∈ 상대 계열 신뢰 집합(빌드 내장 keyring ∩ `MOVES_LINK_TRUSTED_KIDS`) | 401 `UNTRUSTED_KID` | 0 |
| 6 | Ed25519 검증 | 401 `BAD_SIGNATURE` | CPU |
| 7 | `env.cloudId` == 이 설치의 cloudId(webtrigger context `installContext` ARI, 실측 있음) | 403 `SITE_MISMATCH` | 0 |
| 8 | 인스턴스 nonce LRU(2,000건·5분) 중복 | 409 `REPLAYED` | 0 |
| 9 | 페어링 상태(KVS `link:channel`, 인스턴스 메모 30초): `status=PAIRED` ∧ `linkId` 일치(단 `pair.complete` 는 `link:pending`) | 403 `NOT_PAIRED` / 409 `STALE_LINK` | KVS 1 |
| 10 | 라이선스(context.license 있으면 `isActive`) | 402 `LICENSE_INACTIVE`(서명 응답) | 0 |
| 11 | actor 정책(§2.6): 작업이 USER 필수인데 SYSTEM, reason 미허용 | 403 `ACTOR_NOT_ALLOWED`(서명 응답) | 0 |
| 12 | 작업 핸들러 — actor 재확인(§2.5) → Service | 작업별 코드(서명 응답) | SQL·Jira |

- 1~8 실패는 **SQL 0·KVS 0**. 위조 폭주가 설치당 초당 300회 한도를 먹을 수는 있어도(CHANNEL_DECISION §5.3) DB 비용은 만들지 않는다.
- 실패는 `workforce_link_log`(결정적 id, `hit_count`)에 남기되 9단계 이후만 SQL 로 남긴다(1~8 은 `console.warn` 한 줄, 원문 금지).
- 시계 오차 120초: 두 앱 모두 Forge 런타임(같은 클라우드 시계)이라 수 초 이내 예상. 큐 지연은 iat 를 **보내는 순간** 찍으므로 영향 없다.

**재전송 방지를 영속 nonce 저장소 없이 하는 근거**
- 영속 nonce(KVS/SQL)를 쓰면 요청마다 쓰기 1회가 붙는다(cert 집계 화면 하나에 4회, 쓰기 1건에 2회). 대신:
  1. 창 120초 + 인스턴스 LRU(같은 컨테이너 재전송 차단),
  2. **모든 쓰기 작업은 멱등**: `write.commit` 은 op PK(이미 결속이면 no-op), `change.notify` 는 rev/epoch 단조(낮거나 같으면 no-op), `pair.complete` 는 `link:pending` 1회 소비(KVS 삭제), `sys.unpair` 는 상태 전이 1회.
  3. 읽기 재전송은 응답이 TLS 로만 보호된다 — 재전송자가 응답을 얻으려면 원 요청을 TLS 안에서 가로채야 한다. 이 위험은 수용하고, 응답 데이터 최소화(설명 원문 제외, §2.5)로 피해 상한을 둔다.
- 영속 nonce 가 필요해지면 KVS TTL 지원 여부(미검증 S9)를 보고 다시 판단한다.

**키** — 기존 계열 키를 재사용한다(새 비밀 없음).
- 서명: 각 앱 `MOVES_LINK_SIGNING_KEY`(seed, `forge variables --encrypt`)·`MOVES_LINK_SIGNING_KID`. 검증: 빌드 내장 `keyring.js` 상대 계열 공개키 ∩ `MOVES_LINK_TRUSTED_KIDS`. `WorkforceSigner`·`LinkSigner` 재사용.
- **운영 전 필수**: 현재 keyring 에는 `ap-dev-1`·`ap-stg-1`·`wf-dev-1`·`wf-stg-1` 만 있고 **prd 키가 없다**. production 배포 전 `scripts/workforce-link/gen-key.mjs` 로 prd 키 생성·양쪽 keyring 등록이 선행이다.
- 회전(기존 §3.1.5 절차 그대로): 새 kid 를 두 keyring 에 추가·양쪽 배포 → 서명 kid 전환 → 옛 kid 제거 배포. 혼합 구간은 신뢰 집합에 둘 다 있어 끊기지 않는다.
- 설치별 세션 키(페어링 때 Ed25519 쌍 생성)는 **채택하지 않는다**: 회전을 배포 없이 할 수 있는 이점보다, KVS secret 키 보관·요청마다 getSecret·재페어링 시 키 교체 경합 비용이 크다. 설치 단위 폐기는 `linkId` 교체(재페어링)로 충분하다(옛 linkId 요청은 9단계에서 거부).

**URL 관리**
- 자기 URL: `webTrigger.getUrl('…-link-channel')`(실측 W6 = CLI URL, 재배포 후 유지 W5).
- 재발급: 관리자 "주소 바꾸기" → `getUrl(key, true)`(forceCreate)로 새 URL → **옛 URL 로 아직 받는 상대에게** `sys.rekey{url}` 를 보내 상대가 새 URL 저장 → 응답 확인 뒤 `deleteUrl(옛 URL)`. 상대가 응답하지 않으면 옛 URL 을 지우지 않고 "상대 확인 실패"를 보여 준다(관리자가 강제 폐기 선택 가능 → 상대는 재페어링 필요).
- 받은 상대 URL 검증(SSRF·오지정 방지): `^https://{peerAppId}\.hello\.atlassian(-dev)?\.net/x1/[A-Za-z0-9_-]{20,64}$` — `peerAppId` 는 환경별 상수(빌드 내장). production 도메인은 미검증 S1 — 확인 후 정규식·egress 확정.

**해제**: 어느 쪽 관리자든 "연결 해제" → 상대에게 `sys.unpair`(best effort) → 자기 `link:channel` 를 `REVOKED` 로 → 자기 URL `deleteUrl` + 새 URL 은 다음 페어링 때 forceCreate. 상대가 못 받아도 다음 요청은 9단계 `NOT_PAIRED` 로 끝난다.

### 2.3 webtrigger 작업 계약

방향: **WF→AP** = 워크포스가 승인 앱 URL 로 보낸다. 크기 상한은 직렬화 본문 바이트.

**승인 앱이 받는 작업**

| op | 방향·성격 | actor | 요청 `data` | 응답 `data` | 오류 code | 멱등 키 | 상한 |
|---|---|---|---|---|---|---|---|
| `pair.complete` | WF→AP 쓰기 | USER(WF 관리자) | `{pin, url, kid, proto, ops[]}` | `{pairedAt, proto, ops[]}` | `PAIR_EXPIRED`, `PAIR_PIN_MISMATCH`, `PAIR_URL_INVALID`, `PAIR_ALREADY_PAIRED` | `linkId`(pending 1회 소비) | 요청 2KB |
| `sys.ping` | WF→AP 읽기 | USER / SYSTEM(`pair-verify`) | `{}` | `{proto:1, ops[], app:'approval', version, linkEnabled}` | — | — | 1KB |
| `sys.rekey` | WF→AP 쓰기 | USER(WF 관리자) | `{url}` | `{}` | `PAIR_URL_INVALID` | `url` 같으면 no-op | 1KB |
| `sys.unpair` | WF→AP 쓰기 | USER(WF 관리자) | `{}` | `{}` | — | 상태 전이 1회 | 1KB |
| `cert.query` | WF→AP 읽기 | USER | `{purpose:'COST'|'STATS'|'BADGE', pairs:[[accountId, 'YYYY-MM'], …≤50], issueIds?:[…≤20](BADGE 만)}` | `{docs:[{accountId, periodKey, complete, body}]}` — `body` 는 현 `approval.cert` v2 본문과 같은 모양(`w`·`cs`·`cn`·`mn`·`dn`·`sc`·`sn`·`wn`·`di`·`approval.entries`, `wt` 대신 `complete`). BADGE 는 actor 가 볼 수 있는 이슈의 항목만 | `CERT_SCOPE_TOO_LARGE`, `ACTOR_INACTIVE`, `ACTOR_PERMISSION_UNVERIFIED` | — | 응답 1,048,576B(초과 시 `complete:false` + `next` 커서) |
| `period.status` | WF→AP 읽기 | USER | `{accountIds≤50, periodKeys≤12}` | `{rows:[{accountId, periodKey, st, cl, lk?, at?}]}`(현 v1 칸) | — | — | 256KB |
| `issue.control` | WF→AP 읽기 | USER | `{issueIds, purpose:'ROWS'|'AGGREGATE'}` — ROWS ≤50, AGGREGATE ≤100 | `{issues:{[issueId]:{controlled, linked, channel:'OPEN'|'HANDOFF', handoffPath, hidden:[worklogId…]}}}` — `hidden` 은 ROWS 면 **actor 작성분만**, AGGREGATE 면 전원(숫자 집계 전용 — WF 가 행으로 내보내면 안 됨) | `ISSUE_SCOPE_TOO_LARGE`. 권한 확인 실패 이슈는 호출 전체를 실패시키지 않고 그 이슈만 `hidden:[]`·`permission:'UNVERIFIED'` | — | 512KB |
| `write.judge` | WF→AP 읽기(+intent 쓰기) | USER(작성자 본인) | `{action:'CREATE'|'UPDATE'|'DELETE', issueId, worklogId?, started, seconds, timeZone}` | `{verdict:'ALLOW', op, exp}` / `{verdict:'DENY', code}` / `{verdict:'DEFER', reason, handoffPath}` | DENY code = 현 승인 앱 쓰기 판정 코드 그대로(`WORKLOG_PERIOD_LOCKED`, `WORKLOG_CERTIFIED_LOCKED`, `WORKLOG_WINDOW_CLOSED`, `WORKLOG_DAILY_LIMIT`, …) + `ACTOR_NO_ACCESS`(권한 조회가 `[]`). 권한 조회 실패·예산 초과는 DENY 가 아니라 `DEFER{reason:'ACTOR_PERMISSION_UNVERIFIED'}` | `idem` = WF 쪽 작성 시도 id(같은 idem 재요청이면 같은 op 반환) | 4KB |
| `write.commit` | WF→AP 쓰기 | USER(작성자 본인) | `{op, result:'CREATED'|'UPDATED'|'DELETED'|'FAILED', worklogId?}` | `{bound:true}` | `OP_UNKNOWN_OR_EXPIRED`, `OP_ACTOR_MISMATCH` | `op` | 1KB |
| `flows.list` | WF→AP 읽기 | USER(WF 팀장) | `{projectId}` | `{req, def, fo:[{id, n}]}`(현 `approval.flows` 본문) | `PROJECT_NOT_LINKED` | — | 8KB |
| `change.notify` | WF→AP 쓰기 | USER / SYSTEM(`link-withdraw`, `team-batch`) | `{kind:'ORG'|'LINK'|'SETTING'|'KB', epoch, accountIds?, issueIds?, projectIds?, all?:true, data?:{[issueId]:{s,e,pa,fl,tk,by,rev}}}` | `{applied:n}` | `NOTIFY_TOO_LARGE` | `(kind, epoch)` 단조 + 설정 `rev` CAS | 128KB |

**워크포스가 받는 작업**

| op | 방향·성격 | actor | 요청 `data` | 응답 `data` | 오류 code | 멱등 키 | 상한 |
|---|---|---|---|---|---|---|---|
| `pair.complete` | AP→WF 쓰기 | USER(AP 관리자) | 위와 같음 | 위와 같음 | 위와 같음 | `linkId` | 2KB |
| `sys.ping` / `sys.rekey` / `sys.unpair` | AP→WF | 위와 같음 | | | | | |
| `org.get` | AP→WF 읽기 | USER / SYSTEM(`auto-request-author`) | `{accountIds≤50}` | `{orgs:{[accountId]:{teamKey, teamName, leaderKeys[], leads:[{teamKey, teamName, memberKeys[]}], rev}}}` — 현 `rms.org` 본문 모양 그대로(파서 `orgViewOf` 재사용) | `ORG_INDEX_TRUNCATED`(판단 보류) | — | 512KB |
| `org.teams` | AP→WF 읽기 | USER(AP 관리자) | `{offset}` | 현 `TeamsReadApi` 응답 모양(`teams[]`, `page`, `limits`) | `ORG_INDEX_TRUNCATED` | — | 512KB |
| `link.resolve` | AP→WF 읽기 | USER / SYSTEM(`worklog-event-issue`) | `{issueIds≤100}` | `{issues:{[issueId]:{linked, released, wfProjectId, projectId, setting:{s,e,pa,fl,tk,by,rev}|null}}}` | — | — | 256KB |
| `kb.get` | AP→WF 읽기 | USER | `{projectIds≤20}` | `{kb:{[projectId]:{dm, hol, from, to, rev}}}` | `KB_HOLIDAYS_TRUNCATED` | — | 256KB |
| `change.notify` | AP→WF 쓰기 | USER / SYSTEM(`cert-observe`, `period-autoclose`) | `{kind:'CERT'|'PERIOD'|'CONTROL'|'FLOWS', epoch, accountIds?, issueIds?, projectIds?}` | `{applied}` | — | `(kind, epoch)` 단조 | 64KB |

합계: **승인 앱 10개 + 워크포스 8개 = 18 작업**(고유 이름 14 — `pair.complete`·`sys.ping`·`sys.rekey`·`sys.unpair`·`change.notify` 는 양쪽 공통).

공통 논리 오류 code(서명 응답 `error.code`): `OP_UNKNOWN`, `ACTOR_NOT_ALLOWED`, `ACTOR_INACTIVE`, `ACTOR_NO_ACCESS`(권한 조회가 actor 를 돌려주지 않음), `ACTOR_PERMISSION_UNVERIFIED`(권한 조회 실패·시간 예산 초과 — `retryable:true`, fail-close), `LICENSE_INACTIVE`, `LINK_DISABLED`(연동 스위치 OFF), `STORAGE_NOT_READY`, `INTERNAL`(재시도 가능 표시 `retryable:true`). 서버는 사람이 읽을 문구를 만들지 않는다.

### 2.4 페어링 시퀀스 (D3)

**연결 코드 형식**

```
MLNK1.<base64url(JSON payload)>.<base64url(Ed25519 서명)>
payload = { v:1, app:'approval'|'workforce', env:'prd'|'stg'|'dev', cloudId, url, linkId, pin, kid, iat, exp }
서명 대상 = UTF-8("moves-link-pair/1\n") ‖ payloadJSON바이트
linkId = 16바이트 랜덤 base64url(22자), pin = 16바이트 랜덤(22자), exp = iat + 30분
```
길이 약 600자. 코드 자체가 비밀(`pin`)을 담으므로 화면은 복사 버튼만, 로그·감사에 원문 금지(`pinHash` 만).

**시퀀스 (A = 코드를 만든 앱, B = 붙여넣은 앱)**

```
A 관리자 "연결 코드 만들기"   (resolver, actor = A 관리자)
  A: url = getUrl(key)  ·  linkId, pin 생성
  A: KVS link:pending = {linkId, pinHash=sha256(pin), exp, createdBy}   (기존 pending 덮어씀)
  A → 화면: 코드 문자열
          ─ 관리자가 복사해 B 관리자에게 전달 ─
B 관리자 "연결 코드 붙여넣기"   (resolver, actor = B 관리자)
  B: 서명 검증(A 계열 내장 공개키, 신뢰 kid) · app 이 상대 계열인가 · env 일치
  B: payload.cloudId == B 설치 cloudId (아니면 PAIR_SITE_MISMATCH, 서버는 아무 것도 안 씀)
  B: exp 미경과 · url 정규식(peerAppId 일치)
  B: 자기 url = getUrl(key)
  B → A  op=pair.complete  env.linkId=payload.linkId  actor=B 관리자
         data={pin, url:B url, kid, proto:1, ops}
  A: 수신 검증 1~8 → link:pending 의 linkId 일치·exp·sha256(pin) 일치
  A: actor(B 관리자) 재확인 — 실재·활성(§2.5)
  A: KVS link:channel = {status:PAIRED, linkId, peerUrl:B url(secret), peerApp, pairedAt, pairedBy:createdBy, peerActor:B 관리자}
  A: link:pending 삭제(1회 소비) · 감사 `link/paired`
  A → B  서명 응답 {pairedAt, proto, ops}
  B: 응답 검증(re=nonce 등) → KVS link:channel = {PAIRED, linkId, peerUrl:A url, …} · 감사
  B → 화면: "연결됨"
```

- **한쪽 붙여넣기로 양방향 완성**: A 는 B 의 URL 을 `pair.complete` 로, B 는 A 의 URL 을 코드에서 얻는다.
- **원자성**: A 가 PAIRED 를 쓴 뒤 응답이 유실되면 A=PAIRED, B=미연결. B 화면은 "확인 실패, 다시 붙여넣기"를 보여 주고, 재시도는 `PAIR_ALREADY_PAIRED`(같은 linkId·같은 B url 이면 A 가 **성공 응답을 다시** 준다 — 멱등) 로 끝난다. 다른 linkId 면 새 코드가 필요하다.
- **사이트 불일치 거부**: B 쪽 cloudId 대조(위) + A 쪽 수신 7단계 대조, 두 번.
- **재연결**: 어느 쪽이든 새 코드를 만들면 새 linkId. 완료 순간 양쪽 `link:channel` 이 새 linkId 로 바뀌고 옛 linkId 요청은 `STALE_LINK`. 재연결 중(새 코드 발급 ~ 완료)에도 기존 연결은 계속 동작한다(pending 과 channel 이 별도 키).
- **연동 스위치와의 관계**: 연동 모드 = `isWorkforceLinkEnabled() === true` ∧ `link:channel.status === 'PAIRED'`. 스위치 ON·미페어링 = "연결 필요" 상태(연동 기능 꺼진 것과 같게 동작 + 관리자 경고). 판정 함수는 `SettingsRepository.isWorkforceLinkEnabled()` 옆에 `ChannelState.isPaired()` 하나만 둔다(직접 KVS 읽기 금지 — 2026-10-12 운영 모드 교훈).

### 2.5 행위자(actor) 재확인 — 받는 쪽 (D6)

webtrigger 핸들러에는 사용자 세션이 없다(실측 `principal: null`). 그래서 `asUser()` 는 못 쓰고, 다음 셋 중 작업별로 고른다.

| 수준 | 방법 | Jira 호출 | 근거·상태 |
|---|---|---|---|
| R0 | 보내는 앱의 asUser 1차 확인만 믿음 + 데이터가 민감하지 않음 | 0 | — |
| R1 | **actor 실재·활성 + 우리 DB 규칙** — `GET /rest/api/3/user?accountId={actor}` asApp(사유 `channel-actor-verify`, 인스턴스 메모 10분) → `active===true`·`accountType==='atlassian'`. 이어서 기존 DB 규칙(작성자 본인, `TeamScope` 팀장 범위, 앱 관리자 여부) | 0~1 | 공식 API. 비소속·제품 접근 없는 계정의 응답 형태는 **미검증 S8** |
| R2 | **Jira 권한을 actor 기준으로 확인 — 기본 경로: asApp 타 사용자 권한 조회.** ① 이슈 id→key: asApp `POST /rest/api/3/issue/bulkfetch`(≤100, `fields=project`) 1회(이미 키를 아는 경로는 생략) ② 이슈마다 asApp `GET /rest/api/3/user/permission/search?permissions={필요 권한}&issueKey={key}&accountId={actor}&maxResults=1` — 응답이 **정확히 `[actor]`** 일 때만 허용, `[]`·다른 계정·오류는 거부(fail-close). 병렬 6, 인스턴스 메모 (actor, issueId, 권한) 5분. 사유 `channel-actor-permission` | 이슈당 1 (+ 묶음당 1) | **실측(2026-10-19, S2 후퇴안)**: 동의 여부와 무관하게 200, 0.4~0.6s. 권한 있으면 `[그 계정]`, 비활성 `[]`. **권한 없는 활성 계정 → `[]` 는 미측정(§10 S2b)** |
| R2+ | **최적화(선택)** — actor 가 이 앱에 동의한 적이 있으면 `asUserOffline(actor)` 로 `POST /rest/api/3/permissions/check`(accountId 없이 = 본인) 묶음 1회. **401(`MISSING_USER_CONSENT`·`MISSING_OR_INELIGIBLE_USER`)이면 즉시 R2 로 후퇴**하고 "동의 없음"을 인스턴스 메모 10분(같은 actor 로 다시 시도하지 않음). R2+ 의 거부는 그대로 거부(후퇴는 401 일 때만) | ≤100 이슈당 1 | 실측: 동의한 사용자만 200(0.6s). 동의 안 한 활성 사용자 401 — 워크포스만 쓰는 사용자는 승인 앱 동의가 없을 수 있어 **기본 경로로 삼지 않는다** |
| (기각) | asApp `permissions/check` 에 `accountId` 지정 | 1 | **실측 403** "Only Jira administrators and Connect apps" |
| (보조) | asApp `GET /rest/api/3/user/viewissue/search?issueKey&accountId` | 이슈당 1 | 실측 200(동의 무관). 열람(BROWSE)만 볼 때 permission/search 와 같은 값 — `AutomaticApproverAccess` 가 이미 씀. 새 코드는 permission/search 하나로 통일 |

**R2 대상을 줄이는 규칙**(이슈당 1회라 묶음 상한이 비용을 정한다):
- `issue.control` ROWS: R2 는 **actor 작성 숨김 워크로그가 실제로 있는 이슈에만** 한다(그 밖의 칸 `controlled`·`linked`·`channel`·`handoffPath` 는 연결 사실이라 R1 로 충분). 보통 0~몇 건.
- `cert.query` BADGE: 요청 `issueIds` 중 응답 항목에 실제로 등장하는 이슈만.
- `write.judge`: 대상 이슈 1건, 권한 콤마 목록(`BROWSE_PROJECTS,WORK_ON_ISSUES` + UPDATE `EDIT_OWN_WORKLOGS` / DELETE `DELETE_OWN_WORKLOGS`) — 여러 권한 동시 조건의 의미는 **미검증 S2c**, 확인 전에는 권한마다 1회(최대 3회) 호출.
- 핸들러 시간 예산: webtrigger 함수는 `timeoutSeconds` 지정 불가(실측) → 플랫폼 한도 55초 안에서 우리 예산은 호출자 timeout(8초)보다 짧은 **6초**. R2 가 예산 안에 못 끝나면 끝난 이슈만 판정하고 나머지는 거부(`ACTOR_PERMISSION_UNVERIFIED`, `retryable:true`).

**작업별 재확인 수준**

| op | 보내는 쪽 1차(asUser) | 받는 쪽 재확인 | Jira 호출(받는 쪽) |
|---|---|---|---|
| 승인 앱 `cert.query` COST·STATS | WF 가드(PROJECT_COST·CostAccess 등) | R1(actor 활성) — 원가는 "보는 사람마다 달라지면 안 된다"(Q133) → 이슈 열람으로 좁히지 않고, 응답에 설명·이름 없음(숫자·id 만) | 0~1 |
| 승인 앱 `cert.query` BADGE | WF 이슈 열람 | **R2**(BROWSE_PROJECTS) — 응답 항목에 등장하는 이슈만 확인, actor 가 못 보는 이슈 항목은 뺀다 | bulkfetch 1 + 등장 이슈 수(≤20) |
| `period.status` | WF 가드 | R1 + 대상 accountIds 는 actor 본인 또는 actor 의 `TeamScope` 팀원·관리자만 | 0~1 |
| `issue.control` ROWS | WF 이슈 열람(asUser) | R1 + **actor 숨김 기록이 있는 이슈만 R2**(BROWSE_PROJECTS) + `hidden` 은 actor 작성분만(불변식 8 ①⑤) | 0~1 + 숨김 있는 이슈 수 |
| `issue.control` AGGREGATE | WF CollabAccess | R1 + `hidden` id 만(설명 없음) | 0~1 |
| `write.judge` / `write.commit` | WF asUser 이슈 열람·워크로그 작성 권한 | **R2**(BROWSE_PROJECTS + WORK_ON_ISSUES, UPDATE 면 EDIT_OWN_WORKLOGS, DELETE 면 DELETE_OWN_WORKLOGS) + 승인 앱 DB 규칙(현 쓰기 판정 순서 그대로: 본인 작성분 → 통제 작업 중 → 기간 창 → 인증 잠금 → 기간 잠금 → 정책) | judge: 이슈 key 1 + permission/search 1~3(+ UPDATE/DELETE 기존 워크로그 asApp 읽기 1 — 숨김분 포함, 작성자 = actor 대조). 동의 사용자는 R2+ 1. `write.commit` 은 judge 의 op·actor 일치만(Jira 0) |
| `flows.list` | WF 팀장 화면 | R1 (결재선 이름·id 만 — 민감도 낮음) | 0~1 |
| `change.notify` | — | R0 (캐시 무효화만, 판정 아님) / `data` 동봉 SETTING 은 R1 + 감사에 actor 기록 | 0~1 |
| `pair.complete`·`sys.*` | 보내는 쪽 앱 관리자 가드 | R1(actor 활성). 받는 쪽 관리자 여부는 확인 불가(상대 앱 권한 체계) — 대신 pin 이 증명 | 0~1 |
| 워크포스 `org.get` | AP 가드 | R1 — WF 사용자 테이블에 actor 가 있거나 SYSTEM(`auto-request-author`, subject=작성자 1명 ∧ 요청 accountIds ⊆ {작성자}) | 0(WF SQL) |
| 워크포스 `org.teams` | AP 앱 관리자 가드 | R1 — WF 쪽 권한 테이블로 actor 확인 불가 → **R0 + 응답 최소화**(현 `TeamsReadApi` 필드만, 이메일·급여·권한 없음) | 0 |
| 워크포스 `link.resolve`·`kb.get` | AP asUser 이슈 조회 | R0 (연결 여부·작성 기간·공휴일 — 민감도 낮음) | 0 |

워크포스는 R2 를 쓰지 않는다 → **워크포스 manifest 에 `allowImpersonation` 추가 불필요**(scope 동의 변경 회피). 승인 앱도 R2 기본 경로(asApp permission/search)는 impersonation 이 필요 없다 — 기존 `allowImpersonation` 은 R2+ 최적화와 전환 자동 적용에만 쓴다.

**보내는 쪽 규칙**: ChannelClient 는 resolver 경로에서만 `actor:USER` 를 만든다. 보내기 전에 그 resolver 의 기존 가드·asUser 확인을 이미 통과해 있어야 한다(가드 → Service → ChannelClient 순서. Controller 에서 바로 부르지 않는다).

### 2.6 신뢰 모델의 위험과 완화 · SYSTEM 작업

**위험**: 받는 앱은 "상대 앱이 서명한 actor 가 그 작업을 일으켰다"를 믿는다. 상대 앱 서명 키(seed)가 유출되면 유출자는 **그 사이트의 임의 사용자를 사칭**해 요청을 만들 수 있다(linkId·URL 도 알아야 하지만 URL 은 비밀이 아니라고 가정한다).

**완화**

| # | 완화 | 막는 것 |
|---|---|---|
| M1 | 방향별 **작업 허용 목록**(§2.3). 승인 앱이 받는 작업에 결정·승인·반려·정책 변경·삭제 실행이 **없다**. `write.judge` 는 판정과 intent 행만 만들고 Jira 를 쓰지 않는다 | 사칭해도 승인 상태를 바꿀 수 없다 |
| M2 | R2 — 받는 앱이 actor 의 Jira 권한을 다시 확인(asApp `user/permission/search` 에 accountId 지정, 응답이 정확히 `[actor]` 일 때만 허용. 동의 사용자는 impersonation 묶음 확인) | 사칭자가 actor 가 못 보는 이슈 데이터를 받지 못한다(받아도 actor 가 볼 수 있는 범위) |
| M3 | R1 — actor 실재·활성·사이트 사용자 확인, SYSTEM 은 reason 허용 목록 + subject 제약 | 가짜·비활성 계정, 임의 대량 조회 |
| M4 | 응답 최소화 — 설명 원문은 작성자 본인 ROWS 경로 외 금지, 원가는 숫자·id 만, 개인 정보(이메일 등) 없음 | 유출 피해 상한 |
| M5 | 감사 — 채널 경유 모든 쓰기·SETTING 동봉 알림은 감사 이벤트에 `{actorAccountId, via:'WORKFORCE_CHANNEL', linkId, kid, op}` 기록, 실패는 `workforce_link_log` | 사후 추적 |
| M6 | 페어링 단위 폐기 — 재페어링(새 linkId) 즉시 옛 요청 거부. 키 단위 폐기 — keyring 에서 kid 제거 배포 | 유출 대응 |
| M7 | 작업별 상한(pairs≤50 등) + 인스턴스별 actor 당 분당 120요청 소프트 상한(초과 `RATE_LIMITED`) | 대량 덤프 속도 제한 |
| M8 | cloudId 결속(서명 + 수신 7단계) | 다른 사이트 설치의 키 유출이 이 사이트로 번지는 것 — 단, 계열 키는 환경 공통이라 키 자체 유출은 전 사이트 영향(설치별 키를 쓰지 않는 대가, §2.2) |

**키 유출 탐지·대응 (2026-10-19 추가, 후속 과제 — 이번 구현 범위 밖)**

M1~M8 은 피해 상한과 사후 추적이고 **탐지가 없다**. 유출 키의 요청은 1~8단계를 통과하므로 서명 실패만으로는 못 잡는다. 1~8 거부는 `console.warn` 한 줄뿐이라(§2.2) 집계·보존도 안 된다.

| # | 과제 | 내용 | 비용 원칙 |
|---|---|---|---|
| T1 | 송신·수신 대조 | 두 앱이 (cloudId, 시간 버킷, op) 별 **보낸 수**·**받아서 처리한 수**(9단계 통과)를 센다. 하루 1회 서명된 요약 op(예: `sys.digest`)로 교환·대조, 받은 수 > 상대가 보낸 수면 경보. 키 유출을 추정이 아니라 **확인**하는 유일한 수단 | 카운터는 기존 쓰기에 동승 또는 인스턴스 메모 → 일일 1행 flush. 유휴 SQL 예산 안 |
| T2 | 1~8 거부 사유 집계 | 사유(STALE·UNTRUSTED_KID·BAD_SIGNATURE·SITE_MISMATCH·REPLAYED)별 인스턴스 메모 카운터, 임계 초과 때만 `workforce_link_log` 1행(결정적 id·`hit_count`). **keyring 에서 제거한 kid** 는 1건이라도 즉시 기록·경보 → 폐기 kid 목록을 keyring 옆에 유지 | 1~8 무 SQL 원칙 유지(임계 초과 때만 1행) |
| T3 | 유출 정황 지표 | 서명 통과 후 `ACTOR_NO_ACCESS`·`ACTOR_INACTIVE`·`RATE_LIMITED` 비율을 사이트별 일 단위로 집계(기존 `workforce_link_log` 활용) | 추가 쓰기 없음 |
| T4 | 대응 런북 | 판정(관찰 / 유출 간주: 폐기 kid 사용·T1 불일치·T3 급증) → 차단(`MOVES_LINK_TRUSTED_KIDS` 에서 제거 + 두 앱 배포, 전 사이트 동시) → 복구(새 kid 생성·등록) → 조사(감사 이벤트 `kid`·기간 추출) → 고지 | 문서 |
| T5 | 예방 | Forge 앱 기여자 최소화·정기 검토, 기여자 Atlassian 계정 2FA, 커밋 전 비밀 탐지(gitleaks 등), seed 정기 회전(주기 미정) | 운영 |

미검증: 환경 변수 변경이 재배포 없이 반영되는지(차단 소요 시간 결정), Forge 개발자 콘솔에서 사이트별 호출 수·오류율을 볼 수 있는 범위.
고객용 설명: `_workspace/app-channel/ED25519_SELF_AUTH_CUSTOMER.md` 10.3~10.4(T1·T2·예방은 "적용 예정"으로 표기).

**SYSTEM(사람 없는 흐름) — 흐름별 판단**

| 현재 흐름 | 사람 시점으로 옮길 수 있나 | 결정 | 허용 범위 |
|---|---|---|---|
| AP 자동 승인 요청(워크로그 생성 트리거) — 작성자 org 필요(`AutomaticApproverAccess`) | 부분. 승인 앱·워크포스 화면 작성은 `write.judge`/resolver 시점에 actor=작성자로 `org.get` → 캐시. Jira 기본 화면·REST 작성은 사람 시점이 없음 | 캐시 우선, 미스면 SYSTEM | `org.get` reason `auto-request-author`, subject = 이벤트 워크로그 작성자(asApp 으로 읽은 Jira 값), `accountIds = [subject]` 만 |
| AP 워크로그 트리거의 이슈 연결 여부(`IssueSignalRefresher`) | 아니오(이벤트 경로) | SYSTEM | `link.resolve` reason `worklog-event-issue`, `issueIds = [이벤트 이슈]` 만 |
| AP 일일 게시·대조(`WorkforcePublisher.runDaily`·`verifyPublished`) | 필요 없음(pull 이라 게시 자체가 없다) | **삭제** | — |
| AP 인증·관찰 전이 후 게시(`WorkforceCertWake`) | 결정자(사람) 시점에 `change.notify{CERT}` 를 resolver 에서 바로 보냄. 관찰 전이(트리거)는 SYSTEM | 대체 | `change.notify` reason `cert-observe` |
| AP 기간 자동 마감(일일 스윕) | 아니오 | SYSTEM | `change.notify{PERIOD}` reason `period-autoclose` |
| WF 연결 해제 신호(`ProjectLinkWriter.withdrawIssues`, `ProjectDeletionWorker` 큐) | 예 — 큐 payload 에 시작한 관리자 accountId 를 실어 actor=그 사람 | USER(시작자) 우선, 없으면 SYSTEM | `change.notify{LINK}` reason `link-withdraw` |
| WF 팀 구조 일괄 변경(백필 등) | 대부분 resolver | USER, 일괄 작업은 SYSTEM | `change.notify{ORG, all:true}` reason `team-batch` |
| WF 능력 신호 `ensureOrgCap` | 필요 없음 | **삭제** | — |

SYSTEM 으로 허용되는 것은 위 6개 reason 뿐이고, 전부 **읽기 1건 범위이거나 캐시 무효화**다. SYSTEM 으로 데이터 범위가 넓어지는 작업은 없다.

### 2.7 resolver 계약 (UI ↔ 서버)

**승인 앱**

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getWorkforceLinkStatus`(기존, 응답 변경) | `{admin:true}` | — | `{content:{enabled, channel:{status:'UNPAIRED'|'PENDING'|'PAIRED'|'REVOKED', pairedAt, pairedBy, peerApp, peerVersion, lastOkAt, lastErrorCode, pendingExp}, signer:{ready, kid, fingerprint}, recentFailures:[{op, code, lastAt, hitCount}]}}` — 게시 통계 칸(`publishStats`) 삭제 | — | 설정 > 워크포스 연동 |
| `createWorkforcePairingCode`(신규) | `{admin:true}` | — | `{content:{code, exp}}` | `SIGNER_NOT_READY`, `LINK_DISABLED` | 같음 |
| `acceptWorkforcePairingCode`(신규) | `{admin:true}` | `{code}` | `{content:{status:'PAIRED', pairedAt}}` | `PAIR_CODE_MALFORMED`, `PAIR_CODE_UNTRUSTED`, `PAIR_SITE_MISMATCH`, `PAIR_EXPIRED`, `PAIR_ENV_MISMATCH`, `PAIR_PEER_UNREACHABLE`, `PAIR_PEER_REJECTED` | 같음 |
| `rotateWorkforceChannelUrl`(신규) | `{admin:true}` | `{force?:boolean}` | `{content:{rotated, peerConfirmed}}` | `NOT_PAIRED`, `PAIR_PEER_UNREACHABLE` | 같음 |
| `unpairWorkforce`(신규) | `{admin:true}` | — | `{content:{status:'REVOKED', peerNotified}}` | — | 같음 |
| `pingWorkforce`(신규) | `{admin:true}` | — | `{content:{ok, latencyMs, proto, ops[], peerVersion}}` | `NOT_PAIRED`, `PAIR_PEER_UNREACHABLE` | 같음 |
| `listWorkforceTeams`(기존, 원천 변경) | `{admin:true}` | `{offset?}` | 현재 shape 유지 + `source:'WORKFORCE_CHANNEL'`, `page` | `NOT_PAIRED`, `WORKFORCE_UNAVAILABLE` | 설정 > 타임시트 > 팀 |
| `republishWorkforceLink` | — | — | **삭제** | — | — |
| `getWorkforceOrganizationApiStatus` 외 3개 | — | — | **삭제**(미커밋) | — | — |

나머지 기존 resolver(작업 로그 탭·제출·타임시트 등)는 이름·응답 shape 를 바꾸지 않는다. 연동 데이터를 얻는 내부 경로만 property → 채널로 바뀐다. 상대 장애일 때의 새 상태 코드는 기존 필드에 실린다: `linkState:'UNAVAILABLE'`(현재 `WORKLOG_LINK_UNCONFIRMED`·`settingUnresolved` 의미 재사용).

**워크포스**(대칭, 축은 워크포스 가드 `W('SETTINGS')`): `getApprovalLinkStatus`(기존 `getApprovalLinkDiagnostics` 대체), `createApprovalPairingCode`, `acceptApprovalPairingCode`, `rotateApprovalChannelUrl`, `unpairApproval`, `pingApproval`. `publishApprovalLinkSignals` 삭제. `getIssueWorklogControl`·`create/update/deleteIssueWorklog`·`list/saveIssueApprovalSettings` 는 이름 유지, 내부만 채널.

---

## 3. 도메인 (순수 함수)

| 위치 | 함수 | 입력 → 출력 | 테스트 케이스 |
|---|---|---|---|
| `integration/channel/envelope.js`(공유) | `buildRequest({linkId, op, from, to, cloudId, kid, iat, nonce, actor, idem, data, signer})` → `{body:string, sig}` | 순수(시각·nonce·signer 인자) | 벡터 대조(rpcVectors), actor 누락·USER 인데 accountId 형식 불량이면 throw |
| | `verifyRequest({rawBody, sig, self, now, cloudId, trusted, keyring, impl})` → `{ok, code, env, data}` | §2.2 단계 2~7 만(KVS·LRU 는 Service) | 단계별 실패 코드 각 1개, 본문 1바이트 변조, 다른 도메인 접두(property 서명) 거부, iat ±120s 경계, 다른 cloudId |
| | `buildResponse` / `verifyResponse({…, nonce})` | `re` 불일치·op 불일치·from/to 뒤바뀜 거부 | |
| `integration/channel/ops.js`(공유) | `OPS` 방향별 허용 목록, `validateData(op, dir, data)`, `ACTOR_POLICY[op]`(USER only / SYSTEM reasons), 상한 상수 | 모르는 키는 거부(요청은 닫힌 스키마 — 응답은 모르는 키 무시) | 작업마다 정상 1·상한 초과 1·SYSTEM reason 미허용 1 |
| `integration/channel/pairingCode.js`(공유) | `buildPairingCode(payload, signer)`, `parsePairingCode(code, {now, cloudId, env, trusted, keyring})` → `{ok, code, payload}` | | 형식·서명·만료·사이트·env·자기 계열 코드(자기 앱 코드 붙여넣기) 거부 |
| `integration/channel/peerUrl.js`(공유) | `isPeerUrl(url, peerAppId)` | | dev·prod 도메인, 다른 appId, 경로·쿼리·userinfo 거부 |
| 승인 앱 `domain/worklogControl/origin.js`(수정) | `originOf({props, appIntent, wfIntent, bound, current})` — `wfVerdict`(property 서명 검증) → `wfIntent`(source `WF` intent 행) | 기존 규칙 유지: 값 같으면 WORKFORCE, 다르면 WF_CHANGED, 재사용 REUSED | 기존 originForeign 테스트를 intent 기반으로 재작성 + "commit 유실·지문 결속" |
| 승인 앱 `domain/worklogControl/intentMatch.js`(신규) | `matchWorkforceIntent(candidates, worklog, now)` → intent 또는 null | 작성자·이슈·started·seconds 완전 일치, created_at ∈ [now−15분, now], 미결속, 후보 2개 이상이면 null(모호 = INVALID 아님, 다음 이벤트·commit 대기) | 0·1·2 후보, 창 경계, 값 변경 |
| 승인 앱 `domain/worklogPolicy/authority.js`(수정) | 서명 envelope 검증 제거, 입력을 `link.resolve` 결과(이미 검증된 채널 응답)로 | | 기존 테스트에서 서명 케이스 제거 |

시각은 전부 `now` 인자(불변식 3). nonce·linkId·pin 생성(`crypto.randomBytes`)은 Service 에 둔다.

---

## 4. 백엔드

### 4.1 승인 앱 구성

```
src/integration/channel/           (공유 — 두 리포 바이트 동일)
  envelope.js  ops.js  pairingCode.js  peerUrl.js  canonical.js  base64url.js  ed25519.js  keyring.js  rpcVectors.json
src/resolver/channel/
  ChannelState.js       KVS link:channel / link:pending — isPaired(), 인스턴스 메모 30초, peerUrl 은 setSecret
  ChannelClient.js      call(op, data, {actor}) — USER actor 는 InvocationScope 에서만. fetch 8초 timeout, redirect:'manual',
                        읽기만 네트워크 오류 1회 재시도. 응답 검증 실패 = 실패(데이터 안 씀). 실패는 workforce_link_log
  ChannelServer.js      webtrigger 진입(§2.2 1~11) → handlers[op]. 절대 throw 하지 않고 서명 응답/최소 응답
  ActorVerifier.js      R1(user 활성, 메모 10분) · R2(asApp bulkfetch + user/permission/search 이슈당, 병렬 6, 메모 5분)
                        · R2+(동의 있으면 asUserOffline permissions/check, 401 즉시 R2 후퇴 + 동의 없음 메모 10분) · 예산 6초
  PairingService.js     코드 발급·수락·rekey·unpair·ping
  PairingController.js  resolver 5개(guardedDefine) — PermissionMap·CONTROLLER_REGISTRARS 등록(3단계)
  handlers/
    certQuery.js        ← WorkforcePublisher.buildCertFor 의 본문 계산(certificationDoc 빌더 재사용, 서명만 뺌)
    periodStatus.js     ← approvalDoc 본문 계산 재사용
    issueControl.js     ← WorklogControlCtl 의 vs/channel/globalPagePathOf + worklog_control 숨김 행
    writeJudge.js       ← WorklogService 쓰기 판정(현 resolver 가 쓰는 같은 Service 함수) + intent 기록
    writeCommit.js      ← worklog_control_intent bind
    flowsList.js        ← WorklogApprovalFlowsDoc 본문
    changeNotify.js     ← workforce_inbound 무효화(KVS epoch) / SETTING 동봉 rev CAS 반영 + 감사
src/resolver/workforce/            (재구성)
  WorkforceInbound.js   property GET → ChannelClient(org.get · link.resolve · kb.get). 캐시 규칙 §4.3
  WorkforceOrgSource.js 그대로(입력 원천만 바뀜)
  LinkedIssueSettingSource.js  receive({entry}) 제거 → resolve(issueIds)
  WorkforceTeamsService.js     org.teams
  WorkforceLinkService.js / Controller / Repository  상태·실패 로그만(게시 메서드 삭제)
  WorkforceSigner.js · WorkforceCloudId.js  유지
```

**계층 규약**: webtrigger 핸들러는 `guardedDefine`·`PermissionMap` 을 거치지 않는다(실측-과거). 그래서 핸들러는 **resolver 와 같은 Service 함수**를 부르고, 가드가 하던 일(라이선스 10단계·actor 범위 §2.5·`ensureMigratedOnce`·`isTableReady`)을 ChannelServer 가 명시적으로 한다. `InvocationScope` 에는 `principal = actor.accountId`, `via = 'WORKFORCE_CHANNEL'` 로 넣어 기존 Service 의 `currentAccountId()` 가 actor 를 보게 한다 — 단 **asUser() 호출은 이 scope 에서 throw** 하도록 `RequestJira` 에 가드를 둔다(webtrigger 에는 사용자 토큰이 없다. 실수로 asUser 를 부르면 앱 자격으로 새는 대신 실패해야 한다). Jira 사용자 권한이 필요한 곳은 `asUserOffline(actor)` 를 명시적으로 쓴다.

### 4.2 쓰기 경로 (워크포스 연동 이슈 작성)

```
WF resolver createIssueWorklog (actor = 작성자, asUser 이슈 열람·작성 권한 확인)
  → AP write.judge {CREATE, issueId, started, seconds, tz}  idem = WF 시도 id
       AP: R2(actor) → 쓰기 판정(현 순서) → ALLOW 면 INSERT worklog_control_intent(op, source='WF', author=actor, …)
  ← ALLOW{op, exp=now+15분} | DENY{code} | DEFER{reason, handoffPath}
  WF: ALLOW 만 asUser POST /issue/{id}/worklog (property 없음)
  → AP write.commit {op, CREATED, worklogId}   (실패해도 사용자 응답은 성공 — AP 가 지문으로 결속)
       AP: UPDATE intent SET worklog_id, bound_at WHERE op_id=? AND bound_at IS NULL AND author=actor
  AP 트리거(avi:jira:created:worklog): intent(op 결속 또는 지문 matchWorkforceIntent) → Origin.WORKFORCE
```

- UPDATE/DELETE 도 같은 judge/commit. 판정이 승인 앱 현재 DB 이므로 "승인·마감된 기록 수정·삭제 차단"이 즉시 성립한다(CLAUDE.md 2026-10-13 요구).
- 승인 앱 장애·타임아웃 → WF 는 DEFER(저장 안 함, 승인 앱 화면으로 넘김). 판정 불가 = 거부(현 규칙).
- WF 의 10분 유예(`WF_FRESH_GRACE_MS`, Q5)·`freshOwnOf` 폐기 — 승인 앱이 intent 로 "방금 워크포스가 쓴 기록"을 안다.

### 4.3 캐시 (승인 앱 `workforce_inbound` 재사용)

| typ(새 값) | entity_id | TTL(FRESH) | STALE 허용 | 무효화 |
|---|---|---|---|---|
| `org` | accountId | 5분(현 `ORG_MAX_AGE_MS`) | 72시간 — 표시·요청 라우팅만. **권한을 넓히는 판단(팀장 본인 결재, 팀장 범위 조회)은 FRESH 만**(P1-2) | `change.notify{ORG}` → KVS `wf:epoch:ORG` 갱신, 행 `checked_at < epochAt` 이면 STALE |
| `link` | `I:{issueId}` | 1시간(현 `SETTING_RECHECK_MS`) | 72시간 — 표시만. 쓰기·제출은 **즉시 재조회**(현 규칙: 제출 시 재조회, 실패 시 `TIMESHEET_LINKED_SETTING_UNRESOLVED`) | `change.notify{LINK|SETTING}` 해당 행 `checked_at=0` 또는 `data` 반영 |
| `kb` | `P:{projectId}` | 24시간 | 30일 | `change.notify{KB}` |

- `status`·`body_json`·`src_rev`·`checked_at`·`verified_at` 칸을 그대로 쓴다. `kid`·`issued_at` 은 응답 kid·iat. sticky 규칙(property 삭제 공격 대비)은 **폐기** — 주인이 "연결 해제"를 답하면 즉시 반영한다. 통신 실패는 sticky 대신 STALE/EXPIRED 신선도로 다룬다.
- 기존 typ 값(`rms.org`·`rms.policy`·`rms.issue`·`rms.kb`·`rms.pm`) 행은 전환 릴리스(§12 P2)부터 읽지 않고, 배포 후 첫 일일 스윕 `PERSONAL_DATA` 정리 경로에서 1회 DELETE(SQL 1).

### 4.4 워크포스 구성

```
src/integration/channel/*        (공유)
src/resolver/approvalChannel/
  ChannelState.js · ChannelClient.js · ChannelServer.js · PairingService.js · PairingController.js
  handlers/ orgGet.js(← orgCap.buildOrgTeam·defaultLoadOrgTeam) · orgTeams.js(← TeamsReadApi 내부)
            linkResolve.js(← IssueMembership.isWorkforceProjectIssue + issueSetting 본문) · kbGet.js(← buildKbBody)
            changeNotify.js(← KVS approvalLink:epoch:{CERT|PERIOD|CONTROL|FLOWS})
  ApprovalCertReader.js     property 2단(키 목록 + 문서) → cert.query 묶음. 캐시 키 = (조회자, 목적, epoch:CERT)
  ApprovalControlLookup.js  → issue.control. isApprovalHidden(log) = hidden id 포함 여부(vt 추정 폐기)
  IssueWorklogControlService.js  wlorigin·LinkedWriteGate 제거 → write.judge/commit
  IssueApprovalSettingService.js  property PUT 제거(자기 SQL 저장은 기존 그대로) → 저장 후 change.notify{SETTING, data}
```
- 워크포스 DB 무증가 유지: KVS 키 `link:channel`, `link:pending`, `approvalLink:epoch:*`(4) — 새 테이블 없음.
- 팀 쓰기 9곳의 `bumpOrgEpoch()` 옆에서 `change.notify{ORG}` 를 큐로(같은 요청 안 여러 번이면 1회로 합침, 15초 지연 — 현 PublishWake 패턴을 워크포스 큐에 이식하지 않고, `orgEpoch` 값을 실어 받는 쪽이 단조 비교).

### 4.5 트리거·스윕

- 승인 앱 `sweepJobs`: `SweepJob.WORKFORCE`(일일 게시·대조)와 이벤트 작업 `WORKFORCE_CERT` **삭제**. `EVENT_JOBS` 에서 제거. 새 스케줄 없음.
- 일일 스윕에 "property 정리" 일회성 작업 추가(Q2 (다) 결정, §9.3·§12 P3): 완료 표식 KVS 가 있으면 SQL 0.
- `WorklogControlDetector`: `movesRms.issue` asApp 읽기 제거 → `link.resolve` SYSTEM(캐시 우선).

### 4.6 실패·재시도·멱등

| 상황 | 보내는 쪽 동작 | 받는 쪽 |
|---|---|---|
| 네트워크 오류·5xx·타임아웃(8초) | 읽기: 1회 재시도 후 캐시 STALE 사용 또는 `UNAVAILABLE`. 쓰기 판정(`write.judge`): 재시도 없음 → DEFER. `write.commit`·`change.notify`: 1회 재시도 후 포기(지문·TTL 이 메움) | — |
| 401/403(서명·페어링) | 재시도 없음. `link:channel.lastErrorCode` 기록 → 관리자 화면 "연결 확인 필요" | 최소 응답 |
| 409 `STALE_LINK` | 상대가 재페어링됨 → 자기 상태 `REVOKED` 표시, 관리자에게 재연결 안내 | |
| 서명 응답 `error.retryable:true` | 읽기만 1회 재시도 | |
| `OP_UNKNOWN` | 상대 구판 → 기능 없음으로(DEFER·표시 생략), 상태 화면에 "상대 앱 업데이트 필요" | |
| 429(플랫폼 한도) | 재시도 없음, UNAVAILABLE | |

트리거·큐 경로에서 채널 호출은 **함수 1회 실행당 최대 20회**(egress 실행 1분당 100회 한도 대비 여유, CHANNEL_DECISION §5.2). 넘는 일은 다음 큐 작업으로 넘긴다.

---

## 5. 스키마·마이그레이션

**SQL 마이그레이션 없음.**

| 테이블 | 처리 | 근거 |
|---|---|---|
| `workforce_inbound` | 재사용(채널 캐시, typ 값 `org`·`link`·`kb`) | 칸이 그대로 맞는다 |
| `workforce_link_log` | 재사용 — `direction` 'IN'/'OUT', `typ` 칸에 op(24자 안), `code` 에 채널 코드 | 결정적 id·hit_count 그대로 |
| `worklog_control_intent` | 재사용 — `source='WF'`(칼럼 VARCHAR(8) — 'WORKFORCE' 9자는 안 들어간다, §15.2), 지문 조회는 `ix_wcti_author(author_account, created_at)` | 새 칸 불필요 |
| `workforce_publish` | **쓰기 중지**. 이행 정리 작업의 "지울 property 목록"으로만 읽고, 정리 완료 후 `DELETE` 로 비운다(DROP 하지 않는다 — DDL 변경·major 회피). `PersonalDataRepository` 의 참조 2곳 정리 | 원장이 아니라 아웃박스였다 |
| `timesheet_submission.link_json` | 유지 — `{source:'WORKFORCE_CHANNEL', rev, checkedAt}` 로 형식만 바뀜 | 제출 근거 기록(불변식 2) |

KVS 키(승인 앱): `link:channel`(secret 칸 peerUrl), `link:pending`, `wf:epoch:{ORG|LINK|KB}`, `approval:channel:cleanupDone`. 정책 기본값·KVS 키 맵 계약(CLAUDE.md 함정)은 정책 키가 아니라 해당 없음.

---

## 6. Jira·Forge 연결

### 6.1 manifest (두 앱 모두 major)

| 항목 | 승인 앱 | 워크포스 |
|---|---|---|
| `webtrigger` | `approval-link-channel`, `response.type: dynamic` | `workforce-link-channel`, dynamic |
| `function` | `channelServer` | `channelServer` |
| `permissions.external.fetch.backend` | 워크포스 webtrigger 도메인(dev `*.hello.atlassian-dev.net`, prod **미검증 S1**) | 승인 앱 webtrigger 도메인(같음) |
| egress 철거 | 미커밋 `https://api.atlassian.com` 제거(D5) | — |
| scope | 변경 없음(`allowImpersonation` 이미 있음) | 변경 없음 |
| apiRoute(외부, §6.3) | **추가 없음**(Q4 — 후속 과제) | 기존 `organization-teams-read-api` 유지(Q5), 변경 없음 |

- Runs on Atlassian: 두 앱 모두 실격(D4). `forge eligibility` 로 실격 사유가 "egress + dynamic webtrigger" 뿐인지 확인(S4).
- dynamic webtrigger 첫 추가 = major(CHANNEL_DECISION §3 비교표). egress 추가도 고객 재동의 대상.

### 6.2 REST 와 asApp 사유 (AGENTS.md 허용 목록 갱신안)

| 호출 | 자격 | 사유 키 | 비고 |
|---|---|---|---|
| `GET /rest/api/3/user?accountId=` | asApp | `channel-actor-verify` | R1. 결과는 boolean 판정에만 |
| `POST /rest/api/3/issue/bulkfetch`(fields=project) | asApp | `channel-actor-permission` | R2 ① id→key. 결과는 권한 조회 입력에만 |
| `GET /rest/api/3/user/permission/search?permissions&issueKey&accountId` | asApp | `channel-actor-permission` | **R2 기본.** actor 1명·이슈 1건, 결과는 boolean 판정에만, 응답에 싣지 않음. 허용 조건은 §13 불변식 8 |
| `POST /rest/api/3/permissions/check`(accountId 없이) | asUserOffline(actor) | — | R2+ 최적화. 401 이면 후퇴 |
| `POST /rest/api/3/permissions/check`(accountId 지정) | asApp | — | **사용 금지** — 실측 403 |
| `GET /rest/api/3/issue/{id}/worklog/{wid}` | asApp | `channel-write-judge` | UPDATE/DELETE 판정에서 숨긴 기록 포함 원본 확인 — 불변식 8 예외 ①~④(작성자 = actor 대조, 우리 통제분만) |
| 기존 `WorkforcePublisher` asApp(`workforce-publish`·`-verify`) | — | **삭제** | |
| 기존 `AutomaticApproverAccess` 의 `movesRms.org` asApp(`worklog-approval-author-org`) | — | **삭제**(→ `org.get` SYSTEM) | `user/viewissue/search` 부분은 유지 |
| 기존 `movesRms.policy`·`movesRms.issue` 트리거 asApp(`worklog-control-trigger`) | — | **삭제**(→ `link.resolve` SYSTEM) | |

워크포스 AGENTS ⑧ 의 asApp 항목 중 `movesRms.policy`/`movesRms.issue`/`movesRms.kb` PUT·DELETE·GET, 인증 문서 asApp 읽기 삭제.

### 6.3 외부 apiRoute (D2) — **후속 과제**(Q4: 이번 범위에서 apiRoute·custom scope 추가 없음)

이번 단계에서는 승인 앱 manifest 에 apiRoute 를 넣지 않고, custom scope 도 등록하지 않는다(삭제·개명 불가 자산을 늘리지 않음). 워크포스 기존 `/v1/organization/teams` 는 그대로 둔다(Q5). 아래는 후속 과제를 시작할 때의 출발점 기록이다 — 구현·작업 분해 대상이 아니다.

**후속 과제 메모.** 이전 `WorklogReadApi`(커밋 `bd289ae`, 제거 `165790b`)를 복원하는 것이 출발점이다. 패턴: **실제 Controller 의 guardedDefine 래핑 handler 를 수집해 호출**(별도 느슨한 서비스 진입 금지) → PermissionMap·라이선스·`ensureMigratedOnce`·InvocationScope·asUser 이슈 권한·작성자/팀장/관리자 범위·설명 마스킹을 그대로 거친다. 신원은 함수 두 번째 인자의 `principal.accountId` 와 `installContext`(실측 R3 — 토큰 발급자)만, `installation.contexts` 의 다른 cloudId 는 거부.

apiRoute 에서 `asUser()` 는 토큰 주인으로 동작하는지 — **미검증 S10**(R3 은 principal 만 확인했다). 동작하지 않으면 핸들러를 `asUserOffline(principal.accountId)` 로 돌린다.

| 메서드·경로 | custom scope | 재사용 handler | 상태 |
|---|---|---|---|
| GET `/v1/worklogs/approval?issueId&worklogId[&historyBeforeRevision]` | `read:worklog-approval:custom` | `getWorklogCertification` | dev 에 scope 등록돼 있음(삭제 불가 자산 재사용) |
| GET `/v1/worklogs/history?issueId&worklogId[&offset]` | `read:worklog-history:custom` | `getWorklogHistory` | 같음 |
| GET `/v1/timesheets/certified?period=YYYY-MM[&cursor]`(후보) | 신규 scope 이름 미정 | 월 인증 합계 — 해당 handler 는 후속 과제에서 확정 | SAP 월 1회 요구 대응 후보 |

- 응답 5MB 이하(커서 페이지), 에러는 code 만(`error.cause/message` 외부 미노출), 401/403/404/400/503 매핑은 이전 구현 그대로.
- 고객 가이드: `docs/worklog-approval/EXTERNAL_API_GUIDE.md` 신설 — 스파이크 `GUIDE.md` §3 순서(App REST API 켜기 → OAuth 2.0 앱(Resource-level) → custom app scope + `read:forge-app:jira` → callback → **동의 URL 에 `sns={appId}.{envId}`**(실측 R0'/R2 함정) → refresh token 회전 저장)를 고객 문장으로 옮기고 화면 캡처 재사용.
- custom scope 환경당 20개·삭제·개명 불가 → 후속 과제에서 이름 확정 후 등록.
- 이번 채널 설계와의 관계: 외부 API 는 채널(webtrigger)과 독립이다. 채널 철거·이행(§11·§12)에 외부 API 작업은 들어가지 않는다.

---

## 7. 프론트

### 7.1 승인 앱 (`static/ui`)

| 위치 | 변경 |
|---|---|
| `features/settings/WorkforceLinkSettings.jsx` | "연결" 섹션 재작성: 상태 배지(미연결/코드 대기 중(만료 시각)/연결됨(연결한 사람·시각·상대 버전)/확인 필요(마지막 오류 code)), [연결 코드 만들기] → 코드 표시 + 복사 + 만료 카운트다운, [연결 코드 붙여넣기] textarea + [연결], [연결 확인](ping), 고급 details: [주소 바꾸기]·[연결 해제](확인 모달). 게시 통계·재게시 버튼 삭제 |
| `WorkforceOrganizationApiSection.jsx` + 테스트 | **삭제**(미커밋) |
| `WorkforceTeamsSection.jsx` | 데이터 원천 문구만(`source` 칩 '워크포스 연결') |
| `workforceLinkModel.js` | 상태 모델에 `channel.status` 반영. 운영 모드 판정 = 스위치 ∧ PAIRED |
| `utils/queryKey/approvalKeys.js` | `workforceLink.status` 유지, 미커밋 `organizationApi*` 키 제거, `workforceLink.ping` 추가 |
| 공용 컴포넌트 | `SettingsSection`·`SettingsRows`·`SettingsPageIntro` 재사용, 토큰만 |

엔트리 추가 없음(3곳 수정 불필요).

### 7.2 워크포스

`backoffice/page/setting/ApprovalLinkCard.jsx`·`approvalLinkDiag.js` 재작성(같은 구성), `components/worklog/writeChannel` 소비부를 `issue.control.channel` 로, `IssueApprovalSettingTable.jsx` 결재선 선택지 원천만 변경.

---

## 8. i18n 키 (승인 앱 `locales/{kr,en}/workforce.json`)

| 키 | kr | en |
|---|---|---|
| `channel.title` | 워크포스와 연결 | Connection to Workforce |
| `channel.status.UNPAIRED` | 연결 안 됨 | Not connected |
| `channel.status.PENDING` | 연결 코드 대기 중 | Waiting for connection code |
| `channel.status.PAIRED` | 연결됨 | Connected |
| `channel.status.REVOKED` | 연결 해제됨 | Disconnected |
| `channel.status.UNAVAILABLE` | 연결 확인 필요 | Connection needs attention |
| `channel.createCode` | 연결 코드 만들기 | Create connection code |
| `channel.codeHint` | 이 코드를 워크포스 설정 > 승인 앱 연동에 붙여넣으세요. {{minutes}}분 뒤 만료됩니다. | Paste this code in Workforce settings > Approval link. It expires in {{minutes}} minutes. |
| `channel.pasteCode` | 연결 코드 붙여넣기 | Paste connection code |
| `channel.connect` | 연결 | Connect |
| `channel.ping` | 연결 확인 | Test connection |
| `channel.rotate` | 주소 바꾸기 | Change address |
| `channel.unpair` | 연결 해제 | Disconnect |
| `channel.unpairConfirm` | 연결을 해제하면 워크포스 연결 이슈의 승인 연동이 멈춥니다. 이미 승인·마감된 기록의 잠금은 유지됩니다. | Disconnecting stops approval linking for Workforce issues. Locks on approved or closed work logs stay. |
| `channel.pairedBy` | {{name}}님이 {{date}}에 연결 | Connected by {{name}} on {{date}} |
| `channel.peerOutdated` | 워크포스를 최신 버전으로 업데이트해야 이 기능을 쓸 수 있습니다. | Update Workforce to use this feature. |
| `channel.error.PAIR_SITE_MISMATCH` | 다른 사이트의 연결 코드입니다. | This code is from a different site. |
| `channel.error.PAIR_EXPIRED` | 만료된 연결 코드입니다. 새로 만들어 주세요. | This code has expired. Create a new one. |
| `channel.error.PAIR_CODE_UNTRUSTED` | 워크포스가 만든 코드가 아닙니다. | This code was not created by Workforce. |
| `channel.error.PAIR_CODE_MALFORMED` | 코드 형식이 올바르지 않습니다. 전체를 복사했는지 확인하세요. | The code is malformed. Make sure you copied all of it. |
| `channel.error.PAIR_ENV_MISMATCH` | 다른 환경(개발·운영)의 코드입니다. | This code is for a different environment. |
| `channel.error.PAIR_PEER_UNREACHABLE` | 워크포스에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요. | Couldn't reach Workforce. Try again later. |
| `channel.error.PAIR_PEER_REJECTED` | 워크포스가 연결을 거부했습니다. 코드를 새로 만들어 주세요. | Workforce rejected the connection. Create a new code. |
| `channel.error.NOT_PAIRED` | 아직 연결되지 않았습니다. | Not connected yet. |
| `channel.error.SIGNER_NOT_READY` | 서명 키가 설정되지 않아 연결할 수 없습니다. | Signing key isn't configured. |

삭제: `organizationApi.*`(미커밋분), 게시 통계 관련 `publish.*` 키. 워크포스 locale 은 대칭 문구(상대 앱 이름만 교체). 병합은 `locales` merge 스크립트로.

---

## 9. 용량·호출량

### 9.1 사람 작업 1회당 호출 (200명 기준)

| 작업 | 현재(property) | 새 채널 |
|---|---|---|
| 승인 앱 연동 이슈 작업 로그 탭 열기 | 이슈 GET 에 `properties=` 동승(추가 0) + 1h 재확인 | 캐시 FRESH 면 0, 아니면 `link.resolve` 1(+ `kb.get` 하루 1) |
| 승인 앱 타임시트 제출(이슈 30개) | 이슈 프로퍼티 재조회 30 + org 1 | `link.resolve` 1(≤100 묶음) + `org.get` 1 |
| 워크포스 연동 이슈 기록 1건 작성 | 사용자 프로퍼티 2~3 GET + 이슈 ctl 1 | `issue.control` 1(폼 열 때) + `write.judge` 1 + `write.commit` 1. 승인 앱 쪽 Jira: judge 에 key 1 + permission/search 1~3(병렬 0.4~0.6s) → judge 왕복 약 1.0~1.3초, 작성 전체 약 1.5~2초(동의 사용자는 R2+ 로 약 1초) |
| 워크포스 원가 화면(200명 × 1개월) | 사용자당 키 목록 1 + 문서 1 = **Jira 400회** | `cert.query` **4회**(50쌍 묶음) |
| 워크포스 협업 캘린더(이슈 100개) | 이슈 ctl 100 + 프로젝트 60s 캐시 | 행 경로 ROWS: `issue.control` 2(50 묶음) — 승인 앱 Jira = bulkfetch 1~2 + **조회자 숨김 기록 있는 이슈 수만큼** permission/search(보통 0~5). 집계 경로 AGGREGATE: 1, Jira 0~1 |
| 워크포스 이슈 화면 인증 배지(이슈 1개) | 본인 cert 문서 GET | `cert.query` BADGE 1 — 승인 앱 Jira = bulkfetch 1 + permission/search 1 |
| 팀장 일괄 결정 50건 | 아웃박스 touch + 15s 뒤 큐에서 사용자 50 PUT | `change.notify{CERT}` 1(사람 시점, 결정 resolver 끝에서) |

Jira 호출 상한(승인 앱 핸들러 1회): R2 permission/search ≤ 20(ROWS·BADGE 의 실제 대상 상한, 넘으면 나머지 `UNVERIFIED`) + bulkfetch ≤ 1 + user 1, 6초 예산 안. 플랫폼 한도(앱·사이트당 분당 네트워크 요청 10만, requestJira 포함 — CHANNEL_DECISION §5.2)는 200명 규모에서 여유가 크다.

받는 쪽 비용(1회): 승인 앱 `cert.query` SQL ≤ 4(인증·승인 항목·마감 행·정책 KVS), `write.judge` SQL = 현 쓰기 판정과 동일(측정해 상한을 테스트로 고정) + intent INSERT 1 + Jira 2~4(R2: key 1 + 권한 1~3, UPDATE/DELETE 원본 1), `issue.control` SQL ≤ 3, 워크포스 `org.get` SQL 2(users 1 + 팀 소속 1).

### 9.2 유휴 SQL (사용자 0명·이벤트 0건, 하루)

| 작업 | 현재 | 새 채널 |
|---|---|---|
| 승인 앱 일일 `workforce` 작업(게이트) | 0~1 | **0**(작업 삭제) |
| 승인 앱 `wf-verify` | 0~1 | 0(삭제) |
| property 정리 일회성(Q2) | — | 완료 표식 KVS 1, SQL 0 |
| 채널 수신(위조 포함) | — | 0(SQL 은 9단계 통과 후에만) |
| 워크포스 | 0 | 0 |

새 스케줄 트리거 없음. `idleSqlBudget.test.js` 의 WORKFORCE 케이스를 "작업 없음"으로 바꾸고 채널 위조 요청 SQL 0 케이스를 추가.

### 9.3 행 수·저장

- 새 SQL 행: `worklog_control_intent` source=WORKFORCE — 워크포스 작성 건수만큼(200명 × 하루 3건 × 250일 ≈ 15만 행/년, 행 ≈ 150B → 약 22MB/년). 기존 통제 보관 정리(90일)에 같이 들어간다 → 상시 약 4만 행.
- `workforce_inbound`: org ≤ 사용자 수(200), link ≤ 연동 이슈 수(수천), kb ≤ 프로젝트 수 — 현재와 같은 규모.
- `workforce_publish`: 신규 행 0, 정리 후 0.
- property 정리 작업(Q2): 승인 앱 게시분 = 사용자×연도(200×2) + 사용자×월(200×12) + ctl·flows(프로젝트·이슈 수백) ≈ 3,000 DELETE. 큐 작업당 Jira 60회 예산(현 `MAX_REQUESTS`) → 약 50 작업, 일일 스윕 fan-out 에 붙여 하루 10 작업씩이면 5일.

---

## 10. 미검증 (플랫폼) — `04_spike_todo.md` 와 같은 목록

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| S1 | **production 환경 webtrigger URL 도메인** | egress 선언·`peerUrl` 정규식 | 스파이크 앱을 production 환경에 배포 → `webTrigger.getUrl` 값 확인 |
| S2 | webtrigger 안 offline impersonation — **실측 완료(부분 실패)**: 동의한 사용자만 동작, 미동의 401 `MISSING_USER_CONSENT`, asApp `permissions/check`(accountId) 403 | R2 기본을 asApp `user/permission/search` 로 바꿈(§2.5) | `04_spike_todo.md` 실측 결과 |
| S2b | **권한 없는 활성 계정**에 대한 asApp `user/permission/search`·`user/viewissue/search` 응답이 `[]` 인가 | R2 거부 판정. 설계는 "정확히 `[actor]` 일 때만 허용"이라 다른 응답도 거부(fail-close) — 다만 `[]` 가 아니면 오류 코드(`ACTOR_NO_ACCESS` vs `ACTOR_PERMISSION_UNVERIFIED`)와 재시도 여부가 달라진다 | 개발 사이트에 프로젝트 권한 없는 활성 계정을 만들어 두 API 호출 |
| S2c | `user/permission/search` 의 `permissions` 콤마 목록이 "모두 가진 사용자" 뜻인가 | write.judge 호출 수(1 vs 3) | 권한 일부만 가진 계정으로 콤마 목록 조회 |
| S3 | webtrigger context 에 `license` 가 오는가(유료 설치) | 수신 10단계 | 승인 앱 staging(라이선스 있는 설치)에서 webtrigger context 출력 |
| S4 | `forge eligibility` 결과 — 실격 사유가 egress·dynamic 뿐인가 | D4 범위 확인 | 두 앱 브랜치 빌드에서 실행 |
| S5 | HMAC webtrigger(`forge webtrigger create --readSecretKey`) 동작 | 플랫폼 인증을 한 겹 더 얹을 수 있는가(선택) | 스파이크 |
| S6 | webtrigger 호출 한도·동시성, 응답 5MB, resolver(25초)·트리거에서 fetch 지연 P95(콜드 포함) | 상한·timeout 8초 타당성 | 스파이크 caller 에서 동시 20·연속 100 |
| S7 | major 업그레이드 + `install --upgrade` 후 URL 유지 — **실측 통과**. 재설치(uninstall→install)는 미측정 | 재설치 시 재연결 안내 | 스파이크 재설치 |
| S8 | `GET /rest/api/3/user?accountId` asApp — **실측 완료**: 200(0.6s), `active` 제공(비활성 false) | R1 그대로 | — |
| S9 | Forge KVS TTL 지원 여부 | 영속 nonce 필요 시 비용 | 문서·스파이크 |
| S10 | (후속 과제 — Q4) apiRoute 핸들러에서 `asUser()` 가 토큰 주인으로 동작하는가 | 외부 API 의 이슈 권한 재사용 | 외부 API 착수 때 스파이크 callee route 에서 `/myself` asUser |
| S11 | getUrl(forceCreate)·deleteUrl — **실측 통과**: 새 URL 발급 뒤 옛 URL 200 유지, `deleteUrl` 직후 404 | rekey 2단계 그대로 | — |
| S12 | webtrigger 에서 `kvs.setSecret/getSecret` — **실측 통과** | peerUrl secret 저장 확정 | — |
| S13 | Marketplace 고객이 major(egress+dynamic webtrigger) 동의 전 구판에 머무는 동안의 동작 | 혼합 버전 구간(§12) | staging 설치를 구판으로 두고 신판 배포 |

---

## 11. 철거 목록

### 11.1 승인 앱 — 삭제(D) / 재작성(R) / 이동(M)

| 경로 | 처리 | 비고 |
|---|---|---|
| `src/integration/workforce/approvalDoc.js` · `certificationDoc.js` · `controlDoc.js` · `flowsDoc.js` | D (본문 계산 부분은 handlers 로 M) | property 문서 빌더 |
| `src/integration/workforce/writeGate.js` · `writeGateVectors.json` · `vectors.json` | D | §1.4 |
| `src/integration/workforce/contract.js` · `signature.js` · `inbound.js` | R → `integration/channel/ops.js` · `envelope.js`, `orgViewOf` 는 `domain/workforce/orgView.js` 로 M | |
| `src/integration/workforce/canonical.js` · `base64url.js` · `ed25519.js` · `keyring.js` | M → `integration/channel/` | |
| `src/integration/workforce/__test__/*` (16) | D 11 / R 5(canonical·signature→envelope·orgBodyCross→orgView·testKeys·contractSelfContained) | |
| `src/resolver/workforce/WorkforcePublisher.js`(1,011줄) · `WorkforceOutbox.js` · `WorkforceCertWake.js` · `WorkforcePublishWake.js` · `WorkforcePropertyGateway.js` | D | |
| `src/resolver/workforce/WorkforceOrganizationApiController.js` · `WorkforceOrganizationApiService.js` · `__test__/WorkforceOrganizationApiService.test.js` | D (미커밋 — `git checkout`/삭제로 되돌림) | D5 |
| `src/resolver/workforce/WorkforceInbound.js` · `LinkedIssueSettingSource.js` · `WorkforceLinkService.js` · `WorkforceLinkController.js` · `WorkforceLinkRepository.js` · `WorkforceTeamsService.js` | R | |
| `src/resolver/workforce/__test__/*` (16) | D 9(Publisher·Cert·Wake·Outbox·CtlNow·Pagination·Signals·OrganizationApi·RuleViolationCross) / R 7 | |
| `src/resolver/worklogControl/WorklogControlCtl.js` | D (`globalPagePathOf`·`vs` 계산은 `handlers/issueControl.js` 로 M) | |
| `src/domain/worklogControl/writeRules.js` + 테스트 | D | `wr` 빌더 |
| `src/resolver/worklogApproval/WorklogApprovalFlowsDoc.js` · `flowsTouch.js` | D (본문 → `handlers/flowsList.js`) | |
| `src/resolver/worklogCertification/AutomaticApproverAccess.js` | R (org 읽기 → `org.get` SYSTEM) | |
| `src/domain/worklogControl/origin.js` · `src/domain/worklogPolicy/authority.js` · `merge.js` | R | |
| `src/resolver/worklogControl/{WorklogControlDetector, IssueSignalRefresher, ControlLinkJudge, WorklogControlService, WorklogControlDiagnostics, WorklogControlGateway, HiddenAwareCollector}.js` | R (property 읽기 제거) | |
| `src/resolver/worklogPolicy/{WorklogPolicyAuthority, WorklogPolicyResolver, WorklogPolicyService, WorklogPolicyRepository}.js` | R | |
| `src/resolver/timesheet/{TimesheetService, WorklogCollector, PeriodCloseService, PeriodReopenService, TimesheetDriftService, TeamScope, TimesheetRouting}.js` | R (Outbox touch → `change.notify`, `withChecks` 삭제) | |
| `src/resolver/{settings/SettingsService, settings/SettingsAuditRepository, worklog/WorklogService, worklogCert/WorklogCertService, worklogCert/WorklogCertObserver, worklogCertification/ApprovalCertificationProjection, worklogCertification/WorklogRequestService, approval/target/TimesheetTargetAdapter, flow/FlowService, worklogApproval/WorklogApprovalPolicy, worklogHistory/WorklogHistoryRecorder, personalData/PersonalDataRepository}.js` | R (touch·참조 제거) | |
| `src/trigger/sweepJobs.js` · `runSweep.js` · `__test__/idleSqlBudget.test.js` | R | |
| `src/index.js` · `src/permission/PermissionMap.js` · `test/permission/permissionMap.contract.test.js` | R (미커밋 4 resolver 삭제, 신규 5 등록, `republishWorkforceLink` 삭제, webtrigger export) | |
| `manifest.yml` | R (§6.1) | |
| `static/ui/src/features/settings/WorkforceOrganizationApiSection.jsx` + `__test__/WorkforceOrganizationApiSection.test.jsx` | D | |
| `static/ui/src/features/settings/{WorkforceLinkSettings, workforceLinkModel, featureStateModel, WorkforceTeamsSection}.jsx/js` + 테스트 | R | |
| `static/ui/src/utils/queryKey/approvalKeys.js` · `locales/{kr,en}/workforce.json` | R | |
| `docs/DESIGN.md` §4 · `docs/worklog-approval/{ENTITY_PROPERTY_INTEGRATION, API_INTEGRATION, README}.md` · `docs/LINKED-ISSUE-SCHEDULE.md` §4 · `CLAUDE.md`(확정 결정 "워크포스 연동" 행·불변식 8/9·플랫폼 함정) · `AGENTS.md` asApp 목록 | R | 문서 |

승인 앱 집계: **삭제 약 37 파일**(소스 18 + 테스트 19, JSON 벡터 3 포함) · **재작성 약 55 파일** · 신규 약 20 파일(공유 9 + channel 11, 테스트 별도).

### 11.2 워크포스

| 경로 | 처리 |
|---|---|
| `src/integration/approval/` — `certification.js`(R: 계산 함수 `applyCertToCostRows` 등은 유지, `readCertDoc` 서명 검증 D) · `controlDoc.js` · `flowsDoc.js` · `issueSetting.js` · `kbDoc.js` · `orgCap.js`(빌더 `buildOrgTeam` 은 handlers 로 M) · `policySignal.js` · `timesheetDoc.js` · `wlorigin.js` · `worklogApproval.js`(R) · `writeGate.js` · `writeGateVectors.json` · `vectors.json` · `contract.js` · `signature.js` | D 12 / R 3 |
| `src/integration/approval/{canonical, base64url, ed25519, keyring}.js` | M → `integration/channel/` |
| `src/integration/approval/__test__/*` (11) | D 8 / R 3 |
| `src/resolver/approvalLink/ApprovalLinkSignals.js` · `LinkedWriteGate.js` · `orgEpoch.js`(epoch 은 change.notify 값으로 M) · `InstallCloudId.js`(R) | D 3 / R 1 |
| `src/resolver/approvalLink/{ApprovalCertReader, ApprovalControlLookup, ApprovalLinkAdminService, ApprovalLinkController, IssueApprovalSettingService, IssueWorklogControlService, IssueMembership, LinkSigner}.js` | R |
| `src/resolver/approvalLink/__test__/*` (14) | D 6(Signals·Resign·SettingSignals·KbMutationPublishing·LinkedWriteGate·Aggregate) / R 8 |
| `src/domain/approvalLink/writeChannel.js` + 테스트 | D |
| `src/api/jira/field/ProjectLinkWriter.js` · `src/resolver/project/ProjectDeletionWorker.js` · `src/api/jira/worklog/CollabWorklogFetcher.js` · `PermissionController.js` · 팀 쓰기 3 파일(`TeamService`·`TeamLeadership`·`UserService`) · cert 소비 서비스 11개(`IssueAnalysisService`·`PortfolioAggregator`·`PortfolioDashboardService`·`ProjectCalendarService`·`CollabCalendarService`·`CollabIssueWorklogService`·`ProjectCostService`·`ProjectProgressService`·`ResourceAnalysisService`·`ResourceWorklogFetcher`·`utils/worklog/WorklogService`) · `SettingController`·`SettingDefaults`·`SettingService`·`PublicHolidayController` | R (대부분 호출부 1~2줄 — 인터페이스(`ApprovalCertReader`) 유지) |
| `static/ui/src/backoffice/page/setting/{ApprovalLinkCard.jsx, approvalLinkDiag.js, EtcSetting.jsx}` + 테스트 2 · `components/worklog/__test__/writeChannel.test.js` · `pages/myWork/{WorklogPage, modal/WorklogModal}.jsx` · `ProjectCalender.jsx` · `IssueApprovalSettingTable.jsx` | R / D(writeChannel 테스트) |
| `manifest.yml` | R(webtrigger·function·egress 추가. 기존 apiRoute `organization-teams-read-api` 유지 — Q5) |

워크포스 집계: **삭제 약 33 파일** · **재작성 약 40 파일** · 신규 약 16 파일.

**두 리포 합계: 철거(삭제) 약 70 파일**(미커밋 `WorkforceOrganizationApi*` 4 포함), 재작성 약 95.

**Q4·Q5 로 범위에서 빠지거나 남는 것**
- 승인 앱: `src/api/worklog/WorklogReadApi.js` **복원하지 않음**, `custom-scopes.yaml` **만들지 않음**, manifest apiRoute **추가 없음**. 남아 있는 `src/api/worklog/__test__/` 는 이번 철거·재작성 대상이 아니다(후속 과제에서 판단). 신규 파일 수(약 20)에 외부 API 파일은 들어 있지 않다.
- 워크포스: `src/api/organization/TeamsReadApi.js`·manifest `organization-teams-read-api`·`organization-custom-scopes.yaml` **유지**(철거 목록 밖). `orgTeams` 핸들러는 그 내부 조립 로직을 공유하되 apiRoute 진입점은 건드리지 않는다. 미추적 `custom-scopes.yaml`(probe)은 이 작업과 무관 — 손대지 않는다.

---

## 12. 단계별 이행·배포 순서

| 단계 | 내용 | 배포 | 혼합 버전 구간의 동작 |
|---|---|---|---|
Q1 결정(한 번에 전환)에 따라 **채널 도입과 property 철거를 같은 릴리스(각 앱 major 1회)에 넣는다.** property 와 채널이 함께 도는 판은 없다.

| 단계 | 내용 | 배포 |
|---|---|---|
| P0 | 남은 스파이크 S1·S2b·S2c·S3·S4·S7(재설치)·S13 + prd 서명 키 생성·keyring 등록(S2·S8·S11·S12 완료) | 없음(스파이크 앱) |
| P1 | 미커밋 D5 변경 되돌림(`WorkforceOrganizationApi*` 4 resolver·Service·테스트·UI 섹션, `api.atlassian.com` egress) | 커밋만(배포 없음). 다른 작업보다 먼저 — egress 가 남은 채 배포되면 이 릴리스와 무관하게 RoA 실격 |
| P2 | **전환 릴리스** — 공유 `integration/channel/*`, 두 앱 ChannelServer·페어링·18 작업 전부, 소비자 전환, 쓰기 경로(`write.judge`·`write.commit`), `change.notify`, **property 게시·수신 코드와 `writeGate.js`·벡터 삭제**, 일일 `workforce`·`workforce-cert` 작업 삭제 | **두 앱 major 1회씩**(webtrigger dynamic·egress). 승인 앱 먼저, 워크포스 같은 날 |
| P3 | property 정리(Q2 (다)) — 승인 앱: `workforce_publish` 목록 기준 일회성 큐 작업(일일 스윕 fan-out, 하루 10 작업), 워크포스: 자기 SQL 의 연동 이슈·프로젝트 property 삭제 + 본인 `movesRms.org` 는 접속 시 삭제. 못 지우는 잔여분은 P2 에서 검증 코드가 사라져 이미 무효 | P2 릴리스에 포함(배포 후 자동 실행, 완료 표식 KVS) |
| P4 | 문서 갱신(CLAUDE.md·AGENTS.md·DESIGN §4·`ENTITY_PROPERTY_INTEGRATION.md` 폐기 기록) | — |

**혼합 버전 구간**(한쪽만 신판 — major 동의 대기 포함, S13)

| 승인 앱 | 워크포스 | 동작 |
|---|---|---|
| 신판 | 구판 | 페어링 불가 → 승인 앱은 "연결 필요"(연동 기능 꺼짐과 같은 동작, 관리자 배너 "워크포스 업데이트 후 연결 코드로 연결"). 구판 워크포스는 property(`ctl`·`wr`·cert)를 더 받지 못해 연동 이슈 쓰기를 넘김(DEFER) — Q3 fail-close 와 같은 결과. 기존 승인·마감 잠금은 승인 앱 DB 에 그대로 |
| 구판 | 신판 | 대칭 — 워크포스는 "연결 필요", 연동 이슈 쓰기는 승인 앱 화면으로 넘김 |
| 신판 | 신판 | 관리자가 연결 코드를 붙여넣기 전까지 "연결 필요", 붙여넣은 순간부터 채널 |

- **주의 — 남은 `ctl.wr` 의 유효 기간**: 이미 게시된 `ctl` 의 `wr` 은 `exp` 가 최대 7일 뒤라, 구판 워크포스는 그동안 옛 판정 재료로 직접 쓰기를 허용할 수 있다. 그래서 P3 정리 작업은 **`movesApproval.ctl` 삭제를 맨 먼저**(배포 직후 첫 큐 작업, 연동 프로젝트·이슈 수백 건 = 큐 작업 수 개) 한다. 삭제되면 구판 워크포스는 문서 없음 → 넘김. 이렇게 해도 정리 완료 전 몇 분~수 시간의 창은 남으며, 그 사이 들어온 워크포스 기록은 승인 앱 감지기가 출처 없음(NONE)으로 보고 기존 외부 입력 처리로 다룬다.
- 이 구간에서 워크포스 원가·통계의 인증 반영은 멈춘다(표시는 "승인 확인 불가"). 이중 운행을 하지 않은 대가로 받아들인다(Q1).
- 승인 앱을 먼저 배포하는 이유: 신판 승인 앱은 구판 워크포스를 만나도 넘김으로 안전하게 수렴한다.
- 기존 property 데이터: P3 부터 읽지 않는다(신뢰하지 않음) → P5 에서 지운다. 승인 앱 `workforce_inbound` 의 옛 typ 행은 P3 배포 후 첫 일일 `PERSONAL_DATA` 작업에서 삭제(1회 DELETE, SQL 1).

---

## 13. 불변식 개정안 (CLAUDE.md)

**불변식 8 (현행 → 개정)**

> 8. **`asUser()` 가 기본, 앱 간 호출은 행위자 기준.**
> - `asApp()` 은 사용자 컨텍스트가 없는 경로(트리거·스윕·**채널 핸들러**)만, 그 결과를 사용자에게 반환하지 않는다.
> - **앱 간 채널(webtrigger) 요청은 그것을 일으킨 사람(actor)으로 처리한다.** 보내는 앱은 resolver context 의 `principal.accountId` 를 서버가 읽어 서명 봉투 `actor` 에 넣는다(클라이언트 값 금지). 보내기 전에 자기 가드와 asUser 로 1차 확인한다. 받는 앱은 actor 의 실재·활성을 확인하고, 이슈 범위가 걸린 데이터는 actor 의 Jira 권한을 다시 확인한 뒤, 기존 DB 규칙(작성자 본인·팀장 범위·관리자)으로 좁힌다. 채널 핸들러 안의 `asUser()`(세션 토큰)는 금지 — 실패해야 한다.
> - **asApp 으로 다른 사용자의 권한을 조회해도 되는 조건**(`user/permission/search`·`user/viewissue/search` 에 accountId 지정). 전부 만족해야 한다: ① 조회 대상 accountId 는 서명 검증된 채널 봉투의 actor, 또는 SYSTEM 작업에서 서버가 Jira 데이터로 정한 subject 뿐(요청 data 에 실린 다른 사람 id 로 조회하지 않는다) ② 사용자 컨텍스트가 없는 경로(채널 핸들러·트리거)에서만 — resolver 는 asUser 를 쓴다 ③ 결과는 허용/거부 판정에만 쓰고 응답·로그로 내보내지 않는다(메모 캐시 키에 actor 포함) ④ 응답이 정확히 그 한 사람일 때만 허용, 빈 목록·오류·시간 초과는 거부 ⑤ 사유 키 `channel-actor-permission`(트리거는 기존 `worklog-approval-approver-access`)를 강제한다. actor 가 이 앱에 동의한 경우의 `asUser(actor)` offline impersonation 은 같은 판정의 최적화로만 쓰고, 401 이면 즉시 asApp 조회로 후퇴한다.
> - 사람 없는 채널 요청은 `actor:SYSTEM` + 허용된 reason 만, 범위는 서버가 Jira 데이터에서 정한 대상 1건(또는 캐시 무효화)으로 제한한다.
> - 채널 응답은 **상대 앱에게만** 돌려준다. 상대 앱은 그 응답을 자기 권한 판정을 거친 사용자에게만 보이고, 설명 원문은 작성자 본인 경로에서만 싣는다.
> - **예외(2026-10-10 Q127)** 는 그대로 — 우리 통제로 숨긴 워크로그의 asApp 읽기 6조건. 채널로 같은 데이터를 상대 앱에 줄 때도 ①의 "호출자" 를 actor 로 읽고 ①~⑥ 을 모두 적용한다(`issue.control` ROWS 의 `hidden` = actor 작성분만).

**불변식 9 (현행 → 개정)**

> 9. **엔티티 프로퍼티는 신뢰하지 않고, 앱 간 교환에도 쓰지 않는다** — 편집 권한자 누구나 쓸 수 있다. 판정은 우리 DB.
> 앱 간 교환은 페어링된 채널(webtrigger)의 **서명 검증된 요청·응답**으로만 한다: 서명(도메인 접두 `moves-link-rpc/1`, 원문 바이트)·사이트(cloudId)·linkId·방향(from/to)·작업 허용 목록·iat 창(±120초)·응답의 요청 nonce 결속을 **DB 접근 전에** 모두 확인한다. 받은 값은 캐시일 뿐 원장이 아니며, 원장 주인 앱에 다시 물을 수 있어야 한다. 앱이 자기 기록에 붙이는 표식 property(`movesApproval.origin` 등)는 DB 를 찾는 키로만 쓴다.

**CLAUDE.md 확정 결정 표** — "워크포스 연동 | Jira 엔티티 프로퍼티 + 서명. 워크포스 DB 무증가" → "**앱 간 webtrigger + Ed25519(행위자 기준, D1·D6), 외부 apiRoute + 3LO(D2 — 후속 과제, Q4), 연결 코드 페어링(D3), Runs on Atlassian 포기(D4)**. 워크포스 DB 무증가 유지(KVS 키만)".

---

## 14. 작업 분해

### backend (승인 앱)
- [ ] P1: 미커밋 D5 되돌림(Controller·Service·테스트·PermissionMap 4행·index 등록·manifest egress·계약 테스트)
- [ ] `integration/channel/*` 공유 파일 + `rpcVectors.json` + 바이트 동일 해시 테스트(워크포스와 같은 해시)
- [ ] `ChannelState`·`ChannelClient`(actor 는 InvocationScope 만)·`ChannelServer`(§2.2 1~11, throw 금지)·`ActorVerifier`(R1/R2)
- [ ] `RequestJira`: 채널 scope 에서 `asUser()` throw 가드, asApp 사유 `channel-actor-verify`·`channel-write-judge`
- [ ] `PairingService`·`PairingController` resolver 5개 — guardedDefine·PermissionMap(`{admin:true}`)·CONTROLLER_REGISTRARS 3단계, 계약 테스트
- [ ] handlers 7개(§4.1) — 각각 기존 Service 재사용, SQL 상한 테스트
- [ ] 소비자 전환: `WorkforceInbound`·`LinkedIssueSettingSource`·`WorkforceTeamsService`·`AutomaticApproverAccess`·`IssueSignalRefresher`·`WorklogControlDetector`·`WorklogPolicyAuthority/Resolver`·`TimesheetService`·`WorklogService`
- [ ] `origin.js`+`intentMatch.js`(WORKFORCE intent), `writeCommit` 결속 CAS
- [ ] Outbox touch 호출부 10곳 → `change.notify`(사람 시점) / 삭제
- [ ] 철거: Publisher·Outbox·Wake 2·PropertyGateway·Ctl·FlowsDoc·flowsTouch·writeRules·writeGate·벡터, sweepJobs WORKFORCE/WORKFORCE_CERT, idleSqlBudget 갱신
- [ ] `WorklogCollector.withChecks`·`pmOf` 삭제
- [ ] property 정리 일회성 큐 작업(Q2 (다), §12 P3) — 전환 릴리스에 포함
- [ ] 테스트: 위조·변조·사이트·STALE_LINK·REPLAYED 각 SQL 0 확인, 페어링 원자성(응답 유실 재시도), 혼합 버전 `OP_UNKNOWN`→DEFER

### backend (워크포스) — 같은 목록의 대칭 + `writeGate` 소비부 제거, `ApprovalCertReader` 인터페이스 유지(호출부 11개 무변경 목표). `TeamsReadApi`(apiRoute)는 유지·무변경(Q5)

### 범위 밖(후속 과제, Q4)
- 승인 앱 외부 apiRoute(`WorklogReadApi` 복원, 월 인증 합계 API), custom scope 등록, `EXTERNAL_API_GUIDE.md`, 스파이크 S10
- 키 유출 탐지·대응 T1~T5(§2.6) — 송신·수신 대조, 1~8 거부 집계·폐기 kid 경보, 유출 정황 지표, 런북, 예방. 두 리포 대칭

### frontend (승인 앱)
- [ ] `WorkforceLinkSettings` 연결 섹션(§7.1), `workforceLinkModel` 상태
- [ ] `WorkforceOrganizationApiSection` + 테스트 삭제, `approvalKeys` 정리
- [ ] i18n `channel.*`(kr/en) + merge, `organizationApi.*` 삭제
- [ ] 테스트: 코드 생성·복사·만료, 붙여넣기 오류 code 별 문구, 해제 확인 모달

### docs
- [ ] CLAUDE.md(확정 결정·불변식 8/9·플랫폼 함정에 webtrigger 실측 W0~W6), AGENTS.md asApp 목록, DESIGN §4 재작성, `ENTITY_PROPERTY_INTEGRATION.md` 를 "폐기 기록"으로, `API_INTEGRATION.md` 에 "외부 API 는 후속 과제" 한 줄(`EXTERNAL_API_GUIDE.md` 는 후속 과제에서 작성)

---

## 15. 백엔드 반영 결정 (2026-10-19, `02_backend_report.md`·`02_backend_workforce_report.md` 검토)

원칙: **기존 기능 유지가 기본.** 기능이 사라지는 선택은 제품 결정으로 따로 묻는다.

### 15.1 공유 파일 `ops.js` 변경 요청 4건 → **판 2** (승인 앱 원본에서 고쳐 두 리포 같은 날 복사, `SHARED_READY.md` 판 2·해시 갱신, `rpcVectors.json` 재생성)

| # | 요청 | 결정 | 근거 |
|---|---|---|---|
| ① | `cert.query` SYSTEM reason(포트폴리오 배치 STATS) | **허용.** reason `portfolio-batch`, **purpose `STATS` 일 때만**(그 밖 purpose + SYSTEM 은 `ACTOR_NOT_ALLOWED`), pairs ≤50 그대로. 단 큐 payload 에 작업을 시작한 사람의 accountId 가 있으면 USER 로 보낸다(§2.6 "사람 시점으로 옮김" 우선) | 지금 포트폴리오 집계는 인증분을 반영한다(asApp property 읽기). 막으면 연동 모드 포트폴리오가 늘 "확인 중" = 기능 후퇴. STATS 는 숫자·상태만이라 COST 와 같은 R1 수준 위험 |
| ② | 연결 생성 알림 reason | **`link-withdraw` → `link-change` 로 이름 변경**(생성·해제 공통). 같은 판에서 두 리포가 함께 바뀌므로 별칭 없이 교체 | 뜻과 이름이 어긋나면 감사 기록을 오독한다 |
| ③ | `issue.control` 행 `timeZone`·`handoffPath` 모양 | **둘 다 계약에 넣는다.** 응답 최상위 `globalPagePath: string\|null`(옛 ctl `ui.globalPagePath` 와 같은 값 `/jira/apps/{appId}/{envId}/worklog/`), 행 `timeZone: string\|null`(그 이슈에 적용되는 승인 앱 기간 시간대 — 옛 ctl `tz`, IANA ≤64자), 행 `handoffPath` = `${globalPagePath}${issueId}/new` 또는 null. 검증기: `handoffPath` 가 null 이 아니면 `globalPagePath` 로 시작해야 한다. 워크포스는 그 뒤에 `/{date}/{HHmm-HHmm}` 를 붙인다. `write.judge` DEFER 의 `handoffPath` 도 같은 규칙, `write.judge` 요청의 `timeZone` 은 `issue.control` 이 준 값을 쓴다(사용자 시간대 아님) | 옛 ctl 이 `tz`·`ui.globalPagePath` 를 실었다 — 빠지면 넘김 날짜가 사용자 시간대로 어긋난다(기능 후퇴) |
| ④ | 팀장 이슈 설정 `wa` 칸 | **넣는다.** `settingBodyValid` 에 선택 칸 `wa: {autoRequest:boolean, lockApproved:true, closeDays:0..90 정수}`(옛 `rms.issue` 검증과 같은 규칙) → `link.resolve`·`change.notify{SETTING}` 에 그대로 실린다 | **승인 앱이 아직 소비한다**: `domain/worklogPolicy/merge.js:42`(팀장 `wa.closeDays` 가 자동 마감 일수를 덮음), `WorklogRequestService.js:279`(팀장 `wa.autoRequest`). 칸이 없으면 이 두 기능이 소리 없이 사라진다 |

판 2 에 함께 넣을 것(아래 15.2 결정에서 나온 것): `link.resolve` 행에 선택 칸 `basis: 'ISSUE'|'PROJECT'`(15.2 W5).

### 15.2 "설계와 다른 점" 판정

**설계 의도를 깨는 것(고쳐야 함) — 5건**

| 출처 | 내용 | 왜 깨는가 | 할 일 |
|---|---|---|---|
| WF §5-1 | 팀장 이슈 설정 원장을 KVS 로 옮기고 **옛 property 값은 이관하지 않음** | 원장을 KVS 로 옮긴 것 자체는 옳다(property 를 원장으로 두면 서명이 다시 필요). 그러나 이관 없이 정리 작업(`LegacyPropertyCleanup`)이 `movesRms.issue` 를 지우면 **팀장이 정한 작성 기간·사전 승인·결재선·wa 가 사라진다** = 기존 기능 데이터 손실 | **일회성 이관을 정리보다 먼저.** 워크포스가 **자기 서명**(자기 키, 자기 cloudId·issueId 결속)을 검증한 `movesRms.issue` 만 KVS 로 옮긴다(위조값 유입 없음 — 워크포스가 서명자). 옛 검증 코드는 이관 모듈 안에만 남기고 이관 완료 표식 뒤 삭제 대상. `LegacyPropertyCleanup` 은 이관 완료 표식이 있을 때만 `movesRms.issue` 를 지운다 |
| WF §5-2 | `wa` 제외 | 위 ④ — 승인 앱 기능 2개 소실 | ④ 반영 + 워크포스 저장·조회 경로 복원(`capabilities.worklogApproval:true`, `ISSUE_SETTING_UNSUPPORTED` 제거) |
| WF §5-3 | 포트폴리오 배치 승인 정보 없음 | 기능 후퇴 | ① 반영 |
| WF §5-5 | **프로젝트 단위 연동(ALL_ISSUES) 폐기** — 앱 필드 백필 전 이슈는 "연동 아님" | Jira 프로젝트 전체가 무필터로 구독된 경우(옛 `projectSignalOf`: `sourceType==='SPACE'` ∧ 필터 없음) 새 이슈가 백필 전까지 연동 밖으로 답해진다 → 그 사이 **통제(LINKED_ALL 숨김)·쓰기 규칙이 안 걸린다**(fail-open). 기능 후퇴이자 통제 구멍 | `link.resolve` 가 이슈 앱 필드 **또는** 그 이슈의 Jira 프로젝트가 무필터 SPACE 구독인지를 워크포스 SQL 로 같이 본다. 응답 `basis:'ISSUE'|'PROJECT'`(판 2) |
| AP §5-8 | `cert.query` SQL 이 쌍당 2 + 월당 1(50쌍이면 약 100) — 설계 ≤4 | 워크포스 원가 화면 1회 = `cert.query` 12회(WF §5-11) × 약 100 = **SQL 약 1,200**. 유휴 SQL 원칙(2026-10-10 교훈)과 같은 비용 폭주. 기능은 맞지만 비용 의도를 깬다 | **배치 SQL 로 다시 쓴다**: 인증 행·승인 항목은 `(account_id, period_key) IN (…)` 한 번씩, 마감 행은 월 목록 한 번, 정책 1 → 호출당 SQL ≤ 4(쌍 수와 무관). `period.status` 도 같은 방식 ≤ 2. 핸들러별 SQL 횟수 고정 테스트를 이번에 넣는다(AP §8-4 를 다음 회차로 미루지 않음) |

**설계 의도를 깨지 않음(수용) — 조건부 포함**

| 출처 | 판정 |
|---|---|
| AP §5-1 OP_UNKNOWN 을 서명 뒤로 | 수용 — 더 안전, SQL·KVS 0 동일. 설계 §2.2 표 3단계 주석만 갱신 |
| AP §5-2 캐시 typ `link`+`linkset`, 프로젝트 표식 행 | 수용. 단 15.2 W5 의 `basis:'PROJECT'` 를 받으면 `link P:{projectId}` 를 프로젝트 전체 연동 행으로도 쓸 수 있게 형식을 하나로 정할 것(지금 "프로젝트 행엔 ctl 이 없어 전체 연동으로 안 읽힌다" 는 가정이 W5 와 충돌) |
| AP §5-3 intent source `'WF'` | 수용(칼럼 폭). 설계 §1.3·§4.2·§5 표기를 `'WF'` 로 |
| AP §5-4 결정적 op(sha256(actor\|idem)) | 수용 — 멱등 키 설계와 같은 효과 |
| AP §5-5 서명 없는 오류로 상태 자동 변경 안 함 | 수용(더 안전). 워크포스 ChannelClient 는 `STALE_LINK` 를 받으면 자기 상태를 REVOKED 로 바꾼다고 보고 — **양쪽을 승인 앱 규칙(서명 없는 응답으로 상태 변경 금지)에 맞춘다** |
| AP §5-6 종류별 전역 epoch 무효화 | 수용 — 수신 SQL 0. 표식 뒤 첫 조회가 다시 묻는 비용은 TTL 대비 작다 |
| AP §5-7 알림 throttle 5초·꼬리 미보장 | 수용 — 알림은 판정 근거가 아니다(§1.1 원칙 2). 쓰기·제출은 강제 재조회 |
| AP §5-9 `PROJECT_NOT_LINKED` 미구현 | 수용 |
| AP §5-10 period.status 관리자 = 앱 관리자 명부 | 수용 |
| AP §5-11 R2+ 미구현 | 수용(최적화) |
| AP §5-12 `WorkforceLinkService`·`IssueSignalRefresher`·`authority.js` 삭제 | 수용. §11 표 갱신 |
| AP §5-13 옛 수신 행 정리를 `workforce-cleanup` 으로 | 수용. 완료 표식 뒤 SQL 0 인지 `idleSqlBudget` 에 케이스 고정 |
| AP §5-14 타인 org 도 채널로 | 수용 — property 판보다 정확(P1-2) |
| AP §5-15 `signer.ready()` 에 inKeyring | 수용 |
| AP §5-16 와일드카드 egress | 수용(S15 실측 조건). 호스트는 `isPeerUrl` 이 다시 좁힌다 |
| AP §5-17 `controlled` 정의 | 수용 |
| AP §5-18 `workforce_link_log` 정리 없음 | 수용(결정적 id) |
| WF §5-4 연결 생성도 알림 | 수용 — ② 로 reason 정리 |
| WF §5-6 `cleanupApprovalLinkProperties` 수동 resolver | 조건부 수용 — Q2 는 "앱이 지운다"였고 수동 실행도 그 범위. 15.2 이관을 먼저 끝낸 뒤에만 `movesRms.issue` 를 지우도록 묶을 것. 자동화(큐)는 후속 |
| WF §5-7 `writeChannel.js` 유지 | 수용 — 프론트 단계에서 UI 사본과 함께 주석 정리 |
| WF §5-8·9 시간대·넘김 경로 | ③ 으로 해소 |
| WF §5-10 BADGE 20 이슈 초과 시 STATS | 조건부 수용 — STATS 응답은 상태·숫자만이고, 워크포스가 **자기 asUser 로 읽은 행에만 결합**할 때에 한해 R2 생략과 같은 위험으로 본다. 워크포스는 STATS 결과를 행 결합 외 용도(새 행 생성·존재 노출)에 쓰지 않는다 — 코드 주석·시험으로 고정 |
| WF §5-11 cert.query 12회 | 수용 — 호출 수 자체는 문제없다(SQL 은 15.2 AP §5-8 수정으로 해소). §9.1 추정을 12회로 갱신 |
| WF §5-12 R1 범위 | 수용(설계 §2.5 와 같음) |
| WF §5-13 `ApprovalLinkCard` 런타임 실패 | 설계 의도 위반은 아니나 **출시 차단 조건**. P2 전환 릴리스는 두 앱 프론트 재작성과 함께여야 한다(§12 P2 에 이미 한 릴리스). 프론트 단계 전에는 배포 금지 |
| AP 보고 §8-5 | 워크포스 쪽 `write.commit` 실패 = 저장 성공 처리(설계 §4.2)와 DEFER reason 집합 일치 — 워크포스 보고 §4.2 와 대조해 프론트·검증 단계에서 확인 |

### 15.3 리포별 할 일

**승인 앱(backend 재호출)**
- [ ] `ops.js` 판 2(①②③④ + `basis`), 벡터 재생성, `SHARED_READY.md` 판 2 해시·변경 이력
- [ ] `cert.query` SYSTEM `portfolio-batch`(STATS 만) 수신 처리
- [ ] `issue.control` 응답에 `globalPagePath`·행 `timeZone`·`handoffPath` 규칙, `write.judge` DEFER `handoffPath` 같은 규칙
- [ ] `linkset` 캐시·`merge.js`·`WorklogRequestService` 가 `wa` 를 받는지 시험(팀장 `closeDays`·`autoRequest` 덮어쓰기 케이스)
- [ ] `link.resolve` `basis:'PROJECT'` 를 연결로 반영(캐시 행 형식 하나로)
- [ ] `cert.query`·`period.status` 배치 SQL(호출당 ≤4 / ≤2) + 핸들러별 SQL 횟수 고정 시험
- [x] 설계서 표기 정리: intent `'WF'`, OP_UNKNOWN 단계(backend 2026-10-19)

**워크포스(backend 재호출)**
- [ ] 공유 파일 판 2 복사·해시 대조
- [ ] 팀장 설정 **이관**: 자기 서명 검증된 `movesRms.issue` → KVS(`approvalLink:issueSetting:{issueId}`), 완료 표식, `LegacyPropertyCleanup` 이 표식 없이는 `movesRms.issue` 를 지우지 않게
- [ ] `wa` 저장·조회·`change.notify{SETTING}`·`link.resolve` 복원
- [ ] `link.resolve` 프로젝트 단위 연동(무필터 SPACE 구독) → `basis:'PROJECT'`
- [ ] 포트폴리오 배치 `cert.query` — 시작자 accountId 있으면 USER, 없으면 SYSTEM `portfolio-batch`(STATS)
- [ ] 연결 생성·해제 알림 reason `link-change`
- [ ] 넘김 경로를 `issue.control` 의 `timeZone`·`handoffPath` 로(사용자 시간대 대체 제거), `write.judge` 요청 `timeZone` 도 같은 값
- [ ] ChannelClient: 서명 없는 `STALE_LINK` 로 자기 상태를 바꾸지 않기(승인 앱 규칙과 통일)
- [ ] BADGE→STATS 강등 결과는 asUser 로 읽은 행 결합에만 쓰도록 시험 고정

**프론트(두 앱)**: 설계 §7 + `ApprovalLinkCard`·`WorkforceLinkSettings` 재작성은 P2 출시 차단 조건(15.2 WF §5-13).

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-10-19 | 초안. D6(행위자 기준 처리) 반영 — §2.2 actor 칸, §2.5 재확인 수준, §2.6 위험·SYSTEM 표, §13 불변식 8 |
| 2026-10-19 | 사용자 답 Q1~Q6 반영 — 열린 질문 → 결정됨, §12 이행을 단일 전환 릴리스(이중 운행 없음)로 재구성, Q3 fail-close 명시, Q4 외부 apiRoute·custom scope 를 후속 과제로 축소(§1.5·§6.1·§6.3·§10 S10·§11·§14), Q5 워크포스 `TeamsReadApi` 유지 명시 |
| 2026-10-19 | 리더 실측(S2 부분 실패, S7·S8·S11·S12 통과, webtrigger `timeoutSeconds` 불가) 반영 — R2 기본을 asApp `user/permission/search`(이슈당 1, 병렬 6, 대상 축소 규칙, 예산 6초)로, impersonation 은 동의 있을 때 최적화(401 즉시 후퇴). `issue.control` ROWS≤50, `cert.query` BADGE issueIds≤20, `ACTOR_PERMISSION_UNVERIFIED` 신설, §9 호출량, §10(S2b·S2c 신규), §13 불변식 8(asApp 타 사용자 권한 조회 조건) |
| 2026-10-19 | §15 백엔드 반영 결정 신설 — `ops.js` 판 2(`cert.query` SYSTEM `portfolio-batch`(STATS), `link-withdraw`→`link-change`, `issue.control` `globalPagePath`·행 `timeZone`·`handoffPath` 규칙, 팀장 설정 `wa` 칸, `link.resolve` `basis`), 설계 의도 위반 5건(팀장 설정 미이관, `wa` 누락, 포트폴리오 배치, 프로젝트 단위 연동 폐기, `cert.query` SQL 폭증) 수정 지시, 나머지 차이 수용 판정 |
| 2026-10-19 | §2.6 키 유출 탐지·대응 T1~T5 를 후속 과제로 추가(§14 범위 밖 목록) — 이번 구현 범위·계약 무변경 |
