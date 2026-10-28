# workforce-link 검증 리포트 (Phase 5 · 회차 1)

> 작성: integration-verifier · 2026-10-03 · autopilot 무인 회차. forge·git 쓰기 명령 없음, 리포 밖 수정 없음.
> 기준: `01_architect_design.md`(계약), 실제 소스. 보고서(02_*)의 "통과"는 전부 직접 다시 실행했다.

## 판정: **PASS** (필수 수정 2건 발견 → 검증자가 직접 수정·재검증 완료)

| 구분 | 수 |
|---|---|
| 통과 | 31 |
| 실패(발견) | 2 — 둘 다 이번 회차에 수정·재검증 완료 |
| 미검증 | W1~W26(기존) + W27·W28(신규) — 전부 배포 회차 실측 |

## 실행 결과 (직접 실행)

| 명령 | 수정 전 | 수정 후 |
|---|---|---|
| `npm run merge` | exit 0 | exit 0 — kr/en 평탄 키 집합 차이 0, `workforce` 네임스페이스 양쪽 병합 확인 |
| `npm test -- --runInBand` | 55 suites / 709 tests 통과(보고 수치와 일치) | **55 suites / 713 tests 통과** (+4: 스캔 상한 2, 쓰기 대칭 1, 컨텍스트 원천 1) |
| `npm run test:ui -- --runInBand` | 20 / 160 통과(일치) | **20 suites / 161 tests 통과** (+1: `wf:` URL 왕복) |
| `npm run build:ui` | exit 0 | exit 0 — `Compiled with warnings` 3건 전부 node_modules(기준선 동일: @atlaskit source map ENOENT 2, react-select postcss-calc 1) |

## 필수 수정 (FAIL → 처리 완료)

### F1. [frontend] 워크포스 팀(`wf:`) 선택이 URL 파싱에서 버려져 항상 "전체 팀"으로 돌아감 — **수정함**
- 위치: `static/ui/src/features/inbox/inboxUrl.js:61` `const TEAM_KEY = /^t_[0-9a-f]{12}$/;`
- 경로: `TeamTimesheetPage` 팀 선택 → `onChange({team})` → `InboxPage.changeTimesheet` 가 URL `team=wf:…` 기록 → `parseTimesheetSearch` 가 정규식 불일치로 `team:null` → `getTeamTimesheetMatrix` 에 teamKey 가 안 가고 선택기도 "전체"로 표시. 설계 §2.2/§7 "wf: teamKey 를 가공 없이 되돌려 보냄"이 화면에서 끊겨 있었다(프론트 보고서는 "teamKey 그대로 payload 로"라고 했지만 URL 단계에서 탈락). 기존 테스트는 컴포넌트에 teamKey 를 직접 넣어 이 경로를 못 봤다.
- 수정: `/^(t_[0-9a-f]{12}|wf:[A-Za-z0-9:_-]{1,64})$/` — 계약 `TEAM_KEY`(1..64자) + `wf:` 접두와 같은 형식. 파싱(분해)은 하지 않는다.
- 테스트: `inboxUrl.test.js` "워크포스 팀 키(wf:)는 가공 없이 왕복한다"(updateInboxParams → parse 왕복, 빈 키·65자·`/` 거부).

### F2. [backend] 변경 스캔 커서가 아직 커밋 안 된 요청 행을 앞질러 게시가 영구 누락될 수 있음 — **수정함**
- 위치: `src/resolver/workforce/WorkforceLinkRepository.js` `listChangedRequests`, `WorkforcePublisher.changeScan`
- 원인: `approval_request.updated_at` 은 결정 호출이 **시작할 때** 잡은 `now`(초 단위 저장)다. 호출이 Jira·SQL 로 몇 초 걸리는 동안 5분 스윕이 같은 구간의 다른 행을 읽고 커서를 `(T, id)` 로 옮기면, 뒤늦게 커밋된 행(`updated_at ≤ T`)은 키셋 조건을 영원히 통과하지 못한다. 엔진 경로(단건 결정·반려·회수·만료)는 touch 가 없어(설계 §4.2) 스캔이 **유일한** 게시 계기이고, 일일 대조는 원격↔게시 지문만 비교하므로(DB↔게시 아님) 다음 변경 전까지 워크포스가 옛 상태를 본다. "미완주·실패 시 watermark 미전진"(AGENTS)은 지켜져 있었지만, 이 경우는 완주했는데 앞지른 경우다.
- 수정: 스캔 상한 `updated_at < now − SCAN_SETTLE_MS`(3분, `export`)를 SqlTime 경계로 바인딩. 최근 3분 구간은 다음 tick 이 본다(게시 지연 ≤ 약 8분, 설계 "5분 안"보다 3분 늘어남 — 정합 우선).
- 테스트: `WorkforcePublisher.test.js` "② 변경 스캔 — 커밋 지연 상한(settle)" 2건(호출 인자, SQL `AND updated_at < ?` + `'YYYY-MM-DD HH:MM:SS'` 바인딩).
- 상한 3분이 가장 긴 호출보다 긴지는 실측 필요 → **W27**.

### (보강, FAIL 아님) 직접 고친 작은 것
- `TimesheetService.getTimesheetContext` — 워크포스 org 의 `teamKey` 는 계약상 nullable 인데 `myTeam.source` 를 teamKey 접두로만 판정해, teamKey 없는 워크포스 결재선이 `source:'ROSTER'` 로 잘못 나갔다. 어디서 골랐는지(`wfTeam`)로 `WORKFORCE` 를 정하게 고침 + 테스트 1건. 현재 이 필드를 소비하는 화면은 없어 사용자 영향은 없었다.
- 설계 §4.11 이 요구한 "다른 팀장의 워크포스 팀원 요청 → 거부(쓰기 대칭)" 테스트가 없었다 → `WorkforceLinkService.test.js` 에 `TimesheetAccess.canView`(상세·결정 공통 판정) 경유 테스트 추가: 명부 팀장 leadR 은 워크포스 전용 팀원 m9·워크포스가 결재자를 정한 m2 를 못 보고, 워크포스 팀장 leadW 는 m9 를 본다. 코드 변경 없음(통과).

## 경계면 표

| resolver | 생산자(반환 shape) | 소비자(접근 경로) | 일치 |
|---|---|---|---|
| `getWorkforceLinkStatus` | `WorkforceLinkService.js:43-92` — `{enabled, storageReady, crypto{available,selfTest}, signing{configured,kid,publicKeyFingerprint,inKeyring}, trustedPeerKids, cloudIdKnown, publish{pending,failed,stalled,published,lastPublishedAt,lastError{code,at}\|null,state}, inbound{org,pm{verified,invalid,lastVerifiedAt},check{lastSeenAt}}, recentFailures[{direction,typ,entityId,code,firstAt,lastAt,count}]}` | `WorkforceLinkSettings.jsx` StatusCard·InboundCard·FailureTable·RepublishActions(`status.data.*`, `.content` 재접근 없음 — `invokeApproval` 가 벗김) | 일치. `enabled` 는 미사용(토글은 정책값 — 같은 `!== false` 규칙) |
| `republishWorkforceLink` | `{scope, resetCount, markerCount}`; 에러 `INVALID_TARGET`·`WORKFORCE_LINK_DISABLED`·`WORKFORCE_SIGNING_UNAVAILABLE`·`STORAGE_NOT_READY` | `republishDoneText(mutation.data)` → `scope`/`resetCount`; `REPUBLISH_ERROR_HINTS[error.code]` | 일치(`error.code` 분기, 4코드 모두 error.json kr/en 존재) |
| `getApprovalSettings`/`saveApprovalSettings` | `workforceLinkEnabled` boolean(기본 true, 비 boolean `INVALID_TARGET`) | `EnabledToggle` — patch `{workforceLinkEnabled}` 하나, `setQueryData(policy)` | 일치 |
| `getMyTimesheet` | `routing{teamKey,teamName,approverKeys,extraStepGroup,source,extraStepSource}\|null`, `workforce{org,checks}`, `violations[]`(+`source:'WORKFORCE'`, `rawCode`) | `MyTimesheetPage`(`routing.source` 배지, `routing.extraStepSource` 안내), `SubmitBar`(`routing.teamName` 빈 값 대체), `violationText`(rawCode null → `_NO_CODE`) | 일치. `workforce.*` 는 화면 미표시(설계 §7) |
| `submitTimesheet` | `routingSource`, `extraStepSource`, `extraStepAdded`(PM 포함) | `submitDoneKey` — `extraStepSource` 우선 | 일치 |
| `getTimesheetDetail` | `routingSource\|null`, `extraStepSource\|null` | `TimesheetSnapshotSection` — null 미표시 | 일치 |
| `getTeamTimesheetMatrix` | `teams[{teamKey,displayName,source}]`, `rows[].teamSource`, payload `teamKey` ≤80자 | `TeamTimesheetPage` — `teamLabel`, 선택값을 payload 로 그대로 | **F1 수정 후 일치**(URL 단계 탈락 해소) |
| `getTimesheetContext` | `myTeam{…,source}`, `ledTeams[].source` | 화면 미소비(`isTeamLead` 만) | 일치(보강: teamKey null 원천) |

## 점검표

**등록**
- [x] `getWorkforceLinkStatus`·`republishWorkforceLink` — `WorkforceLinkController.js` guardedDefine / `PermissionMap.js:136-137` `{admin:true}` / `index.js:15,48` `registerWorkforceLinkController`. 계약 테스트 통과.
- [x] 프론트 `invokeApproval` fn 이름 = 등록 이름.
- [x] `runWorkforcePublish` — `index.js:25` export, manifest `function`·`scheduledTrigger`(fiveMinute) 양쪽.

**shape**
- [x] `.content` 재접근 없음. Repository snake→camel 매핑(`valueOf(row, snake, camel)`) 일관.
- [x] 시각 epoch ms 출력(`fromSqlTimestamp`), SQL 바인딩 전부 `toSqlTimestamp`(ts) 경유 — `issued_at`·`verified_at`·`checked_at`·`next_attempt_at`·스캔 커서 포함.
- [x] ErrorCodes 54개 전부 kr/en `error.json` 존재(신규 2 포함).

**불변식**
1. [x] 열린 요청 하나 — 이번 기능 무변경(scopeKey·dedupe 경로 미접촉).
2. [x] 결정이 진실 — 결재선은 제출 시 approver 행 고정, 판정 근거는 `routing_source`·`link_json` 에 저장.
3. [x] 도메인·계약 순수 — `src/domain`·`src/integration` 에 `Date.now(`·`new Date()`·`@forge`·`executeQuery`·`requestJira` 0건(주석 제외). 스캔 상한도 `now` 주입.
4. [x] CAS·갱신 UPDATE 전부 `rev = rev + 1`(publish 성공·실패·재무장·kid 재게시·verified·inbound CAS·잡 상태).
5. [x] 승인자 행 무변경.
6. [x] 연동 로그 id = sha256(direction|typ|entityId|code|sig16) 결정적, 중복은 hit_count.
7. [x] 범위 판정은 `TeamScope`(목록·가드·매트릭스) + `TimesheetAccess`(상세·이력·증명서·결정, TeamScope 위임) 두 곳. 매트릭스는 `membersOf(principal, {teamKey})` 로 이끌지 않는 `wf:` 키 `INVALID_TARGET`. 쓰기 대칭 테스트 추가.
8. [x] asApp — `createAppPropertyGateway` import 는 `WorkforcePublisher.js` 하나(테스트 단언). 사유 `workforce-publish`(PUT)·`workforce-publish-verify`(대조 GET) — AGENTS 허용 2번 문구와 일치(요청서의 `workforce-verify` 는 설계·AGENTS 표기 `workforce-publish-verify` 로 구현됨, 차이 아님). asApp GET 값은 `remoteDigestOf` 비교에만, 어떤 resolver 응답에도 실리지 않음. 수신(org·pm·check)은 전부 asUser, 남의 org 는 Jira 0회(캐시만).
9. [x] 엔티티 프로퍼티 불신 — 수신값은 `verifyEntry`(서명·계열·kid 신뢰·FUTURE_IAT·**검증자가 만든 ent** 결속 accountId/projectId/issueId·worklogId·cloudId) 통과분만 `workforce_inbound` 에 VERIFIED 로 저장, 판정(TeamScope·Routing·위반)은 그 행만 쓴다. 부재·위조는 sticky(마지막 검증 유지), 해제는 서명된 tombstone 만. 점검은 내용 결속(authorId·started·seconds) 불일치 시 STALE. 우리가 게시한 문서를 우리가 다시 읽어 판정에 쓰는 경로 없음.
10. [x] validator 무관(이번 범위 밖).

**스윕**
- [x] 펼침 예산 중단 → 표식 미완료(다음 tick 처음부터), 변경 스캔 touch 실패 → 그 페이지에서 커서 정지, `listChangedRequests` 예외 → 커서 미기록. **F2 로 "완주했는데 앞지름"도 차단.**
- [x] 정책 꺼짐·키 없음·cloudId 없음·자가 시험 실패 → ③ 배출만 건너뜀(PUT 0), 대기열 유지. 트리거·스윕 throw 없음.

**권한 범위**
- [x] 형제 resolver: 관리 화면 2개 모두 `{admin:true}`. 타임시트 형제(컨텍스트·매트릭스·상세·결정)는 TeamScope 단일 출처를 공유해 워크포스 원천이 같은 규칙으로 들어감.
- [x] 읽기/쓰기 대칭 — 결정도 TimesheetAccess.canView 경유(테스트 추가).
- [x] 팀장 범위 — 워크포스 팀장은 자기 org 의 서명된 `leads[].memberKeys` 만, 명부 팀장은 워크포스가 결재자를 정한 사람 제외. 제외 집합 조회 실패 fail-close.
- [x] SELF/principal — `bindInvocation` 이 가드 통과 직후 서버 principal 을 넣는다(클라이언트 값 불신).

**프론트·배포 단위**
- [x] 신규 엔트리 없음(탭 추가만 — `SettingsPage.jsx` nav·Tabs 두 목록).
- [x] i18n kr/en 키 대조 차이 0, 화면이 정적으로 고르는 키 전부 존재(스크립트 대조), 동적 키(코드 17+UNKNOWN·상태 7·typ 5·방향 2) 존재.
- [x] 쿼리키 팩토리 `settingsKeys.workforceLink()`·`userKeys.resolve()`.
- [x] 마이그레이션 v024~v028 — v023 뒤 순서대로 append, 이름 중복 없음, ALTER 문장당 컬럼 하나·`IF NOT EXISTS`, 신규 테이블 `CREATE TABLE IF NOT EXISTS`. 컬럼 미적용 시 `isColumnReady` 로 옛 INSERT(제출 비차단).
- [x] manifest app id 는 `REPLACE-WITH-forge-register`(Confluence id 로 회귀 없음).

## 권고 (R — 이번 판정과 무관, 담당 지정)

- **R1 [backend]** `WorkforceLinkService` 가 `yearsAround` 하나를 쓰려고 `WorkforcePublisher` 를 import 해 resolver 번들에 asApp 게이트웨이 인스턴스가 생긴다(호출은 없음). import 그래프 단언은 `createAppPropertyGateway` 직접 import 만 본다. `yearsAround` 를 순수 헬퍼(예: `integration/workforce/approvalDoc.js` 또는 `domain/timesheet`)로 옮기면 관리 resolver 가 Publisher 모듈을 끌지 않는다.
- **R2 [backend]** 일일 대조는 원격↔게시 지문만 비교한다. DB↔게시 불일치(스캔 누락 등)는 다음 변경 전까지 복구되지 않는다. F2 로 알려진 원인은 막았지만, 저비용 안전망(예: 대조 대상 행을 `buildFor` 로 재구성해 `content_digest` 와 비교 — SQL 2회/행, Jira 추가 0)을 검토할 것. 비용·주기는 제품 판단 → 열린 질문 V1.
- **R3 [backend]** `publishStats` 의 마지막 오류 조회(`WHERE last_error_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1`)는 인덱스가 없어 행 수에 비례한다(표식 행도 포함). 200명 규모에선 무시 가능, W26 측정 결과에 따라 `ix (last_error_code, updated_at)` 또는 잡 상태 캐시.
- **R4 [backend]** `WorkforceOrgSource.enabledLoader` 는 `value === true`, 다른 경로는 `!== false` 로 판정한다. 저장은 boolean 검증을 거쳐 현재는 같은 결과지만, KVS 에 비 boolean 이 들어가면 두 판정이 갈린다 — 한 함수로 통일 권장.
- **R5 [backend]** `SettingsService.saveApprovalSettings` 는 게시 영향 키가 patch 에 **있기만 해도**(값이 같아도) 연도 전량 재게시를 건다(백엔드 보고 "발견" 항목). 비용은 표식 2행 + 펼침이지만 정책 화면 저장마다 발생 — 이전 값 비교 후 touch 권장.
- **R6 [frontend]** `TeamTimesheetPage` 등 기존 테스트는 teamKey 를 props 로 직접 주입해 URL 경로를 지나지 않는다. F1 같은 탈락을 잡으려면 `InboxPage` 수준에서 `?tab=teamTimesheet&team=wf:x` → `getTeamTimesheetMatrix` payload 를 단언하는 통합 테스트 1건 권장.

## 열린 질문 (제품 결정 — 추측하지 않음, 기존 + 신규)

- 백엔드 O1~O4(CHECK_MISSING 범위·dev 키 절차·백오프 식·extraStepAdded 확장), 프론트 F1~F4(재게시 버튼 사전 차단·위반 출처 표시·엑셀 팀 열 접미·checks 표시)는 각 보고서 기본값 그대로 — 검증상 문제 없음, 결정은 사람 몫.
- **V1(신규)** 게시 안전망: DB↔게시 재구성 대조를 일일 대조에 넣을지(R2). 선택지 (a) 넣는다 — 행당 SQL 2회, Jira 0 (b) 넣지 않는다 — 스캔 상한(F2)으로 충분하다고 본다. 검증자 권장 (a).
- **V2(신규)** 스캔 상한으로 엔진 경로 게시 지연이 최대 약 8분(설계 "5분 안")이 됐다. 워크포스 쪽 표시 지연 허용치가 이보다 짧아야 하면 상한·주기 재조정 필요.

## 새 미검증 (`04_spike_todo.md` 에 추가)

- **W27** 스캔 상한 3분이 `updated_at` 을 쓰는 가장 긴 호출(resolver·`runSweep`·`runTimesheetSweep`)보다 긴지 — 실행 시간 실측.
- **W28** `team=wf:<키>` URL 파라미터가 Jira 페이지 iframe 라우터에서 그대로 왕복하는지(새로고침 후 선택 유지·payload 확인).

## 이번 회차 직접 수정한 파일

| 파일 | 내용 |
|---|---|
| `static/ui/src/features/inbox/inboxUrl.js` | F1 — `TEAM_KEY` 에 `wf:` 형식 허용 |
| `static/ui/src/features/inbox/inboxUrl.test.js` | F1 테스트 |
| `src/resolver/workforce/WorkforceLinkRepository.js` | F2 — `listChangedRequests({beforeUpdatedAt})` 상한 |
| `src/resolver/workforce/WorkforcePublisher.js` | F2 — `SCAN_SETTLE_MS`(3분) 전달 |
| `src/resolver/workforce/__test__/WorkforcePublisher.test.js` | F2 테스트 2 |
| `src/resolver/timesheet/TimesheetService.js` | 컨텍스트 `myTeam.source` 원천 판정 |
| `src/resolver/timesheet/__test__/TimesheetWorkforce.test.js` | 위 테스트 1 |
| `src/resolver/workforce/__test__/WorkforceLinkService.test.js` | 쓰기 대칭 테스트 1(TimesheetAccess) |
| `_workspace/workforce-link/04_spike_todo.md` | W27·W28 추가 |

## 회차 기록

| 회차 | 날짜 | 결과 |
|---|---|---|
| 1 | 2026-10-03 | FAIL 2(F1 frontend, F2 backend) 발견 → 직접 수정 → 재실행 전부 녹색 → PASS |
