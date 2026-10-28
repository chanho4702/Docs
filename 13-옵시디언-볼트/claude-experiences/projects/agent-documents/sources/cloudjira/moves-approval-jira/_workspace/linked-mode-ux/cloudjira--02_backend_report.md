# linked-mode-ux 백엔드 보고서 (승인 앱)

- 작성 2026-10-13 · backend-engineer · 1회차 / 2회차(D8·D4) / **수정 회차 1(범위 축소 Q149·F-2/4/5·코덱스 P1/P2·기록 규칙 예외 재허용)**
- 입력: `01_architect_design.md`(전부), `00_input/requirement.md`(Q142 a·Q146 a·Q144 a, 나머지 기본안)
- 범위: 승인 앱 백엔드 전부 — Phase ① → ③ → ⑤ → ④a → ④b → ② 순서로 구현, Phase 마다 jest 녹색 유지. 커밋·`forge`·워크포스 리포 변경 없음.
- 최종 테스트: `npm test -- --runInBand` → **178 suites / 2725 tests 전부 통과**(2회차 기준)(시작 167 / 2591). `npm run merge` 실행(에러 문구 1키 추가 반영).
- 스키마: **DDL·마이그레이션 없음**(새 테이블·컬럼·인덱스 0). `idleSqlBudget.test` 숫자 무변경.

> **응답 래핑(기존 규약 그대로)**: 모든 resolver 는 `{ success:true, content:{…} }` 이다(`ResponseWrapper` 가 `{content}` 를 펼침). 설계서 §2 의 "응답 shape" 는 `content` 안쪽이다. 프론트는 `res.content.<칸>` 로 읽는다(`invokeApproval` 이 이미 그렇게 푼다면 무관).

---

## 수정 회차 1 (2026-10-13) — 범위 축소 Q149 · 검증 F-2/F-4/F-5 · 코덱스 P1/P2 · 기록 규칙 예외 재허용

> 이 절이 아래 1회차·2회차 내용보다 우선한다. 본문 표는 이 절에 맞춰 고쳤고, 바뀐 곳에 "(수정 1)"을 붙였다.
> 최종 `npm test -- --runInBand` → **Test Suites 179 passed / Tests 2723 passed**(사전 승인 거부 반영 후), 실패 0. `npm run check:bundle` OK(초기화 순환 없음). `npm run merge` 실행.

### R1. F-1 범위 축소 — 기록 규칙 `pol` 전부 제거
- **계약**: `contract.js` 에서 `ISSUE_POLICY_KEYS`·`issuePolicyValid`·`rms.issue` 의 `nullable(b.pol, …)` 삭제. `rms.issue` 신규 칸은 `fl` 하나(`nullable(b.fl, UUID)`). `approval.flows`·`FLOWS_DOC_KEY`·`DocKind.FLOWS` 는 유지.
- **옛 문서 호환**: validator 는 모르는 최상위 키를 무시하므로 `pol` 이 실린 옛 문서도 **유효**하다. 소비 쪽(`stricterSetting`·`mergePolicy`)이 `pol` 을 읽지 않는다. 테스트로 고정: `linkedModeContract.test.js` "옛 문서에 pol 이 실려 와도 문서는 유효", `LinkedIssueSettingSource.test.js` "옛 문서의 pol … 정책에는 쓰이지 않는다", `WorklogPolicy.test.js` "옛 문서의 pol 은 적용하지 않는다".
- **승인 앱 소비에서 제거**: `stricterSetting(a,b)` 는 `{s, e, pa, fl}` 만 돌려준다(`base`·`polOpen`·`stricterPolicy` 삭제). `WorklogPolicyResolver.linkedWithBase` 삭제. `merge.js` 의 `LINKED_POLICY_KEYS` 와 LINKED_ISSUE `pol` 적용 삭제. `getLinkedIssueOverview.setting.policy` 칸 삭제. `listIssueWorklogExceptions` 의 `workforce.pol` 칸 삭제. 2회차 D8 장치와 그 테스트(`setting.test.js`·`IssueExceptions.test.js` D8)도 삭제.
- **D-2 토큰 이름 결정: `rms.issue.v2` → `rms.issue.fl` 로 바꾼다.** 배포된 적이 없어 호환 부담이 없고, 이제 뜻하는 것이 `fl`(결재선) 하나뿐이라 이름에 드러나게 했다. `CTL_RX = ['rms.issue','rms.kb','rms.issue.fl','approval.flows']`, `publicationVersion() = 'linked-issue:2:{ctlRev}:rms.issue,rms.kb,rms.issue.fl,approval.flows'`. **워크포스는 `rx` 에 `'rms.issue.fl'` 가 있을 때만 결재선(`fl`) 칸을 쓰고**, 결재선 선택지는 `'approval.flows'` 토큰 + 검증된 flows 문서로 연다. 작성 기간·사전 승인(`s/e/pa`)은 기존 `'rms.issue'` 토큰 그대로.
- **벡터 재생성**: `signatures[]` 끝 3건 — ① `rms.issue` + `fl`(pol 없음, `I:10003`) ② `rms.issue` 구판(`I:10004`) ③ `approval.flows`(`P:10000`). 어느 벡터에도 `pol` 없음(단언).

### R2. 계약 해시(승인 앱 확정본, LF)
- `src/integration/workforce/contract.js` sha256 **`e09c253422a339103a872bcef7705a0d49935673f06fc318d6431d180c833c5a`**
- `src/integration/workforce/vectors.json` sha256 **`7b746bdc4b4805d078d4eac679998abee3140b8075c47fb504b6adcd006a5f51`**
- 워크포스 현재본은 1회차 해시(`cb3e80c2…` / `c85d6c77…`) — **다시 복사해야 한다**.
- 줄끝 주의: 이번 회차 중 파이썬 텍스트 쓰기로 제가 고친 파일 49개가 CRLF 로 바뀐 것을 발견해 전부 HEAD 와 같은 LF 로 되돌렸다(위 해시는 LF 기준). 워크포스로 복사할 때도 바이트 그대로(LF) 옮겨야 해시가 같다.

### R3. 기록 규칙 예외는 연동 이슈에서도 승인 앱이 저장·적용 (코디네이터 추가 지시)
- Q140(a) "연동 이슈 편집 불가"는 **작성 기간·사전 승인·결재선(s/e/pa/fl)에만** 적용한다.
- `saveIssueWorklogPolicy` 는 연동 이슈에도 기록 규칙 예외(7키)를 저장하고 병합이 적용한다. **단 override 에 사전 승인(`approvalMode`)이 있으면 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`(cause `{issueId, keys:['approvalMode']}`)로 거부한다**(리더 결정 — 저장되는데 적용 안 되는 값을 두지 않음). 비연동 이슈는 무변경.
- `mergePolicy({issueLinked:true})` 는 Jira 이슈 예외 층에서 **사전 승인(`approvalMode`)만** 건너뛰고 `keys.approvalMode.ignored` 에 `{source:'JIRA_ISSUE', reason:'MANAGED_BY_WORKFORCE'}` 를 남긴다. 나머지 키(작성·수정·삭제 기간, 하루·주 상한 등)는 그대로 적용된다.
- `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` 는 **연동 이슈의 결재선 값 지정(`selectIssueWorklogApprovalFlow`)과 사전 승인 예외 저장(`saveIssueWorklogPolicy` 의 `approvalMode`)** 에서만 나간다. 결재선 해제(`flowId:null`)·기록 규칙 저장은 허용.
- 문구를 좁혔다: kr "결재선·작성 기간·사전 승인은 워크포스 연동 작업이라 워크포스 작업관리 › 승인 설정에서 바꿔 주세요." / en "Approval line, entry period and pre-approval for linked Workforce work items are changed in Workforce Work › Approval settings."
- **프론트 참고**: 연동 이슈 행의 예외 편집 모달에서 사전 승인(`approvalMode`) 항목은 감춘다(보내면 거부된다). 병합의 `approvalMode` 무시는 기존 저장분 방어로 남겨 둔다. `getIssueWorklogPolicy.managedBy`·`listIssueWorklogExceptions.items[].managedBy` 의 `'WORKFORCE'` 는 이제 "결재선·사전 승인은 워크포스 관리"라는 뜻이다(기록 규칙 편집은 연다).
- 테스트: `WorklogPolicy.test.js` "issueLinked=true — 기록 규칙 이슈 예외는 그대로 적용, 사전 승인만 무시", `IssueExceptions.test.js` "연동 이슈라도 기록 규칙 예외 저장은 성공…" · 해석기 "연동 이슈 → 기록 규칙 이슈 예외는 적용", `WorklogApprovalFlowSelect.test.js` "③ 연동 이슈 값 지정 → MANAGED_BY_WORKFORCE" · "③ 해제는 허용"(1회차부터).

### R4. F-2 (불변식 7) — `listAllApprovals` 의 WORKLOG_CREATE 범위
- 이슈 열람(`filterVisible`) 통과 뒤 **참여자 판정**을 더한다. 볼 수 있는 사람은 요청자 본인, 결재자 본인, 또는 열린 요청의 현재 단계 미결정자에게서 지금 위임받은 사람이다. 상세 `canView`·`sendApprovalReminder` 와 같은 범위이고, 위임 규칙은 `ApprovalService.delegatorFor` 와 같다. 아니면 숨기고 `hiddenCount` 로만 센다.
- 다른 종류(ISSUE·ISSUE_TRANSITION·FIELD_CHANGE)는 어댑터 `canView` 가 이슈 열람뿐이라 `filterVisible` 과 범위가 같다. WORKLOG_CERTIFICATION 은 아래 "발견 4".
- 테스트: `ApprovalAdminService.test.js` "F-2 WORKLOG_CREATE 는 이슈 열람만으로 보이지 않는다"(참여자 아님 → 숨김, 결재자·요청자 → 표시, 위임 대리 → 표시).

### R5. 코덱스 P1 — 이슈 예외 목록 프로젝트 재확인
- `listIssueWorklogExceptions` 는 행마다 **열람 ∧ 현재 메타 `projectId === projectId`** 를 요구한다. 다른 프로젝트로 옮겨진 이슈나 메타가 없는 이슈(bulkfetch 실패)는 빼고 `hiddenCount` 로만 센다.
- 테스트: `IssueExceptions.test.js` "코덱스 P1 — 다른 프로젝트로 옮겨진 이슈·메타 조회 실패(bulkfetch)는 목록에서 빼고".

### R6. F-4 — `listAllApprovals` 기간 필수
- `filters.from`·`filters.to` 가 하나라도 없으면 `INVALID_TARGET` + `cause:{field:'from'|'to'}` 로 거부하고 SQL 은 없다. 상한 3660일 검사가 항상 걸린다.
- 코드는 기존 `INVALID_TARGET` 을 쓴다(이 resolver 의 다른 입력 오류와 같은 코드, 새 코드·i18n 불필요). 화면은 `cause.field` 로 어느 칸인지 안다.

### R7. F-5 — `listWorkforceTeams.truncated`
- 다섯째 페이지만 201건을 요청해서, 1,000건을 **넘을 때만** `true` 다. 정확히 1,000건이면 `false`.
- 테스트 2건(1,001건 → true, 1,000건 → false, 마지막 페이지 `limit:201`).

### R8. 코덱스 P2 — `touchDocKey` 범위 · SQL 상한 실측
- `touchDocKey(docKey, now, { accountPrefix:'F:' })` 는 `WHERE account_id >= 'F:' AND account_id < 'F;' AND doc_key = 'flows'` 이다. PK(account_id, doc_key) 범위 스캔이라 원장 전체를 훑지 않는다. 접두를 안 주면 던진다. 호출부는 `flowsTouch.touchAll` 하나.
- **SQL 상한 실측과 구조 변경**: 실제 `TimesheetAccess`·`TeamScope`·`WorkforceOrgSource`(inbound)·`DelegationService`·`ApprovalRepository` 를 연결하고 `executeQuery` 만 바꿔 문장을 셌다(`ApprovalAdminSqlBudget.test.js`).
  - 처음 구조는 **행마다 위임 조회 1회**였다. 최악(4창·625행 훑음)에서 **SQL 635회**로, 2회차에 적은 "8+2N" 설명보다 훨씬 컸다.
  - 그래서 위임 조회를 **창마다 한 번**(그 창 결재자 전부를 한 번에, `delegatorsInWindow`)으로 묶었다. 타임시트 판정 규칙은 그대로 `createTimesheetAccess` 한 곳이고, 위임 데이터만 창 단위 결과를 넘긴다.
  - 고친 뒤 같은 최악에서 **SQL 14회** = 요청 4 + 결재자 4 + 위임 4 + 명부 팀장 범위 1 + 워크포스 org 1.
- **상한 공식(최종)**: `SQL ≤ 3W + S`. W = 창 수 ≤ 4, 창마다 요청 키셋 1·결재자 일괄 1·위임 일괄 1(위임 정책 꺼짐이면 0). S = 조회자 공유 비용 ≤ 4, invocation memo 로 첫 창에서만 나간다(명부 팀장 범위 + 워크포스 org 문서 + 제외 집합). **행 수와 무관**하고 최악 16 이하다. 위임·연동 끔이면 `≤ 2W + 2`.
  - 비용에 넣지 않은 것: 이슈 계열 열람은 Jira(permissions/check·bulkfetch, 창마다 ≤2)라 SQL 0. 스키마 프로브(`isTableReady`)는 실행 환경 캐시라, 콜드일 때 information_schema 몇 회는 별도다.
  - 단언: `W ≤ 4`, 결재자 = W, 위임 = W, 공유 ≤ 4, 합계 ≤ 3W+4 ≤ 16, 훑은 행 > 100.
- 2회차에 넣은 모의 객체 기반 D4 테스트는 이 실측 테스트로 대체해 삭제했다.

### R9. 이번 회차 신규·변경 테스트
- 신규: `src/resolver/approval/__test__/ApprovalAdminSqlBudget.test.js`.
- 변경: `linkedModeContract.test.js`(전면), `setting.test.js`(pol 제거·옛 pol 무시), `WorklogPolicy.test.js`, `LinkedIssueSettingSource.test.js`, `LinkedIssueOverview.test.js`, `IssueExceptions.test.js`(P1·R3, D8 삭제), `ApprovalAdminService.test.js`(F-2·F-4·창당 위임 1회, 기간 기본값), `WorkforceTeamsService.test.js`(F-5), `WorklogApprovalFlowsDoc.test.js`(touchDocKey 범위), `WorklogControlCtl.test.js`·`LinkedCtlPagination.test.js`(토큰 이름).

---

## 0. 설계와 다르게 한 점 (실제 ≠ 설계 계약) — 프론트·검증자 필독

| # | 위치 | 설계 | 실제 | 이유 |
|---|---|---|---|---|
| D1 | `selectIssueWorklogApprovalFlow` §5.4 ③ | 연동 모드 ∧ 연동 이슈면 무조건 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` | **`flowId:null`(해제)은 허용**, 값 지정만 거부 | §5.5 "연동 이슈 행은 삭제만(승인 앱 저장분 정리) = override `{}` + flowId null" 과 §5.4 ③ 이 충돌. `saveIssueWorklogPolicy` 의 "비우기 허용"과 대칭으로 맞췄다 |
| D2 | `selectIssueWorklogApprovalFlow` 해제 응답 | `{binding:{issueId, flowId\|null, rev}}` | 해제면 `rev:0` 고정(행이 사라짐). 행이 없는데 `flowId:null, rev:0` 이 오면 SQL 없이 같은 응답(no-op, 감사 없음) | 다음 지정은 rev 0(INSERT)부터 |
| D3 | `getIssueWorklogApprovalPolicy.policy.source` | `'WORKFORCE'\|'ISSUE'\|'PROJECT_DEFAULT'\|null` | 같음. 단 **결재선이 허용 목록에 없어 `selectedFlow` 가 null 이면 `source` 도 null** | 화면이 "선택됨" 칩과 이름을 따로 맞추지 않게 |
| D4 | `listAllApprovals` SQL 예산(§13.2 "≤4") | ≤4 | **(수정 1) 실측 후 구조 변경** — `SQL ≤ 3W + S`(W 창 ≤4, 창마다 요청·결재자·위임 1씩, S 조회자 공유 ≤4), 행 수와 무관, 최악 16. 상세는 위 R8 | 관리자 수동 조회라 W ≤4 는 수용(2회차 결정) |
| D5 | `listAllApprovals` 기간 필터 | 생성일 `from/to` | 같음. **범위 상한 3660일**(내 이력은 366일), 형식·역전·초과는 `INVALID_TARGET` | 무제한 범위 방지 |
| D6 | `listInbox` history 의 기간 기준 시간대 | `historyFilterOf({timeZone})` | `request.context.timezone`(조회자 Jira 시간대), 없거나 잘못되면 UTC | 사이트 정책 KVS 를 더 읽지 않으려고 |
| D7 | `sendApprovalReminder` 날짜 기준 | 사이트 tz | 사이트 `timesheetTimezone`(KVS 정책), 잘못되면 Asia/Seoul. 라이선스로 알림 생성이 막혀 있으면 `{notified:0, already:false}`(오류 아님) | 트리거·스윕과 같은 "라이선스는 알림 생성만 막는다" 규칙 |
| D8 | `stricterSetting(a,b,base)` 의 `base` | 하위 층 유효값과 비교 | **(수정 1) 폐기** — 범위 축소(Q149)로 `pol` 자체가 사라져 `base`·`polOpen`·`linkedWithBase` 를 모두 삭제했다(R1) | — |
| D9 | flows 문서 삭제 조건 | (설계 미명시) | 프로젝트 신호 `rms.policy P:{id}` 가 VERIFIED ∧ `ctl:'NONE'`(명시 해제)일 때만 DELETE | 이슈 단위(I:)만 연동된 프로젝트는 판별 비용이 커서 삭제하지 않는다 |
| D10 | flows 재게시 표식 | "saveWorklogApprovalConfig·흐름 이름 변경 때 touch" | 설정 저장 = **이미 원장에 있는 `F:{projectId}` 행만** UPDATE(`touchExisting`). 결재선 수정·켜기/끄기·삭제 = `doc_key='flows'` 전부 UPDATE(`touchDocKey`). 둘 다 **연동 모드에서만**(단독 SQL 0), 실패는 삼킴 | 연동 대상이 아닌 프로젝트에 문서를 새로 만들지 않기 위해. 대상 추가는 ctl 스캔이 한다 |
| D11 | 감사 행 | `recordSettingsAudit({action:'worklogApproval/bindIssue', projectId, issueId, before, after})` | `{area:'worklogApproval', action:'bindIssue', detail:{projectId, issueId, before:{flowId}, after:{flowId}}}` — 기존 설정 감사 형식(area·action 각 32자) | 기존 테이블 칸에 맞춤. **프론트 i18n `policy.audit.area.worklogApproval`·`policy.audit.action.bindIssue` 필요** |
| D12 | vectors.json | 3건 추가(v2·구판·flows) | 3건 추가(`rms.issue` v2 I:10003 · `rms.issue` 구판 I:10004 · `approval.flows` P:10000). 기존 `linkedIssueContract.test` 의 `slice(-4)` → `slice(-7,-3)` | 벡터가 뒤에 붙어서 |

---

## 1. resolver 별 실제 응답 shape (`content` 안쪽, 코드 그대로)

### 1.1 신규

**`getPrincipalContext`** — `'SELF'` · `src/resolver/principal/PrincipalController.js`
```js
{ accountId: string|null, isAdmin: boolean, isJiraAdmin: boolean }
// isAdmin = 앱 설정 관리자 명부(KVS approval:settings:managers) ∪ Jira 관리자. 판정 실패는 false.
```

**`listAllApprovals`** — `{admin:true}` · `src/resolver/approval/ApprovalAdminService.js`
- 입력: `{ scope:'OPEN'|'CLOSED'(필수), filters?:{ targetKinds?:TargetKind[]≤6, from?:'YYYY-MM-DD', to?:'YYYY-MM-DD', projectId?:numeric }, cursor?:string, limit?:1..50(기본 25) }`
```js
{
  items: [{
    requestId, targetKind, title /* 어댑터 실시간 제목 ?? target_title */, issueKey: string|null, projectKey: string|null,
    status, isOpen: boolean, requesterKey: string|null,
    currentStep: { order: number, name: string|null, pendingApproverKeys: string[] } | null,   // 닫힌 요청은 null
    createdAt: number /*epoch ms*/, updatedAt: number, expiresAt: number|null,
    canCancel: boolean,   // 열림 ∧ PENDING ∧ 조회자 Jira 관리자(앱 설정 관리자는 false)
    canRemind: boolean,   // 열림 ∧ PENDING ∧ 현재 단계 대기자 ≥1
  }],
  hiddenCount: number,       // 조회자가 열람 못 해 뺀 행 수(이 페이지 범위만)
  nextCursor: string|null,
  incomplete: boolean,       // 열람 판정 일부 실패(그 행들은 숨김 처리됨)
}
```
- 에러: `INVALID_TARGET`(scope·limit·종류·projectId·날짜·커서), `STORAGE_NOT_READY`, 가드 `PERMISSION_ADMIN_REQUIRED`.
- `targetKinds:[]` → SQL 없이 `{items:[], hiddenCount:0, nextCursor:null, incomplete:false}`.
- 타임시트 행: 기존 열람 규칙(대상자·참여자·위임·현재 팀장, Q144 a). 관리자도 못 보면 `hiddenCount` 로만.

**`sendApprovalReminder`** — `{admin:true}`
- 입력 `{ requestId: uuid }`
```js
{ requestId, notified: number, already: boolean }
// already:true = 오늘(사이트 현지) 이 단계 독촉을 이미 보냄. 이벤트 키 `reminder:manual:{requestId}:{stepOrder}:{YYYY-MM-DD}`
```
- 에러: `INVALID_TARGET`(uuid 형식), `REQUEST_NOT_FOUND`(없음·열람 불가 구분 없음), `REQUEST_NOT_PENDING`(닫힘 또는 대기자 0).

**`listWorkforceTeams`** — `{admin:true}` · `src/resolver/workforce/WorkforceTeamsService.js`
```js
{
  enabled: boolean,                       // false 면 나머지 빈 값, SQL 0
  teams: [{ teamKey /* 'wf:' 접두 */, teamName: string|null, leaderKeys: string[], memberKeys: string[], memberCount: number,
            lastReceivedAt: number|null, state: 'VERIFIED'|'STALE'|'NONE', rosterOverlap: string[] }],
  orgDocs: { verified: number, stale: number, total: number },
  refreshCandidates: string[],            // ≤50, NONE·STALE 팀의 팀장 → 화면이 refreshWorkforceCapabilities({accountIds}) 로
  truncated: boolean,                     // (수정 1) 1,000 문서를 넘을 때만 true(마지막 페이지 201건 요청)
}
```
- 에러: `STORAGE_NOT_READY`. 지금 워크포스가 팀 칸을 안 채우므로(Q146 a) 실데이터는 `teams:[]` 가 정상.

**`listIssueWorklogExceptions`** — `{project:'admin', projectIdKey:'projectId'}` · `WorklogPolicyService.listIssueExceptions`
- 입력 `{ projectId, cursor?: issueId(숫자 문자열), limit?: 1..50(기본 25) }`
```js
{
  linkMode: boolean,
  items: [{
    issueId, issueKey: string|null, summary: string|null,
    linked: boolean, managedBy: 'APP'|'WORKFORCE',
    policy: { override: {키:값}, overrideRevision: number, keys: string[] /*정렬*/ } | null,   // 빈 override 는 null
    flow: { flowId, label: string|null, rev: number, valid: boolean } | null,                 // 이 이슈의 승인 앱 결재선 지정
    workforce: { s, e, pa, fl, by, srcRev } | null,                                         // 연동 모드·검증된 rms.issue 만 (수정 1: pol 삭제)
  }],
  hiddenCount: number,
  nextCursor: string|null,      // 다음 issueId 커서(문자열 키셋)
  flows: { required: boolean, defaultFlowId: string|null, options: [{ id, label }] },        // 허용 목록 ∧ 단계 있음
}
```
- 에러: `INVALID_TARGET`(입력), `STORAGE_NOT_READY`(두 테이블 중 하나라도 없음).

**`lookupProjectIssue`** — `{project:'admin', projectIdKey:'projectId'}`
- 입력 `{ projectId, issueKey }`(대소문자 무관, 대문자로 조회)
```js
{ issueId, issueKey, summary: string|null, linked: boolean }
```
- 에러: `INVALID_TARGET`(형식·없음·열람 불가 구분 없음), `PROJECT_ISSUE_MISMATCH`.

### 1.2 변경

**`selectIssueWorklogApprovalFlow`** — 축 **`{project:'admin', projectIdKey:'projectId'}`**(이전 `{issue:'edit', appAccess:false}`)
- 입력 `{ projectId, issueId, flowId: uuid|null, rev }`
```js
{ binding: { issueId, flowId: string|null, rev: number } }     // 이전 { policy } 는 삭제
```
- 검사 순서: 형식(`INVALID_TARGET`) → 이슈 소속(`PROJECT_ISSUE_MISMATCH`) → 연동 이슈 값 지정(`WORKLOG_POLICY_MANAGED_BY_WORKFORCE`, D1) → 허용 목록·단계(`WORKLOG_POLICY_NOT_ALLOWED`) → rev(`WORKLOG_POLICY_CONFLICT`). 해제는 `DELETE … WHERE issue_id=? AND project_id=? AND rev=?`(0행 = CONFLICT). 값이 바뀌면 감사 1행(D11).

**`getIssueWorklogApprovalPolicy`** — 축 무변경
```js
{ policy: {
  required: boolean,
  selectedFlow: { id, label: string|null } | null,
  source: 'WORKFORCE'|'ISSUE'|'PROJECT_DEFAULT'|null,
  managedBy: 'PROJECT_ADMIN'|'WORKFORCE_LEAD',
  configRev: number,
  reasonCode: 'WORKLOG_POLICY_INVALID'|null,
} }
// 삭제된 칸: options, canSelect, bindingRev, selectedFlowId
```
- 같은 `view()` 를 `getWorklogEditorContext.approvalPolicy` 도 쓴다(새 shape).

**`createWorklogApproval`** — 결재선 없음 거부가 `WORKLOG_POLICY_INVALID` + `cause:{ managedBy:'PROJECT_ADMIN'|'WORKFORCE_LEAD' }`.

**`getIssueWorklogPolicy`** — 기존 칸 + `linked: boolean`, `managedBy: 'APP'|'WORKFORCE'`. `effective` 객체에 `linkMode`, `issueLinked` 가 추가로 실리고, 연동 이슈의 이슈 예외 키는 `effective.keys[k].ignored` 에 `{source:'JIRA_ISSUE', revision, reason:'MANAGED_BY_WORKFORCE'}` 로 남는다.

**`saveIssueWorklogPolicy`** — (수정 1) 연동 이슈에도 기록 규칙 예외를 저장·적용한다. 연동 이슈 override 에 `approvalMode` 가 있으면 `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`, cause `{issueId, keys:['approvalMode']}`(R3).

**`getLinkedIssueOverview`** — `setting` 에 가산:
```js
setting: { …기존, flow: { id, label: string|null } | null, flowInvalid: boolean } | null   // (수정 1) policy 칸 삭제
```
- `fl` 이 프로젝트 허용 목록 밖·단계 없음이면 `flow:null, flowInvalid:true`. 구판 문서는 `policy:null, flow:null, flowInvalid:false`(결재선 조회 없음).

**`getIssueWorklogs` / `getWorklogEditorContext`** — `control.channel` **삭제**(그 외 무변경).

**`listInbox`** — `tab:'history'` 추가.
- `filters.targetKinds?: TargetKind[]`(모든 탭, 서버 `target_kind IN`; 빈 배열 = 결과 없음; 모르는 값·7개 이상 = `INVALID_TARGET`)
- history 전용: `filters.role?: 'ALL'|'PROCESSED'|'REQUESTED'`(대소문자 무관), `filters.updatedFrom?/updatedTo?: 'YYYY-MM-DD'`(조회자 tz, 끝 포함, ≤366일). 다른 탭에 오면 `INVALID_TARGET`.
- 응답 무변경 `{ items, nextCursor, hasMore }`. history 는 **본인 actor_key 만**(위임자 행 제외), 같은 요청의 APPROVER·REQUESTER 두 행은 한 줄(먼저 온 행). 행의 `role` 칸으로 역할 구분 가능.

**`getInboxCounts`** — `tab:'history'` 면 `statusCounts:{}`(세지 않음), `myTurnCount` 는 그대로.

**`saveApprovalSettings` / `getApprovalSettings`** — `linkedInputChannel` 삭제. patch 에 오면 `INVALID_TARGET`(아무것도 저장 안 함), 응답 정책 객체에 칸 없음.

**`saveWorklogApprovalConfig`** — 응답 무변경, 내부에서 flows 재게시 표식(D10).

---

## 2. PermissionMap 변경

| resolver | 축 |
|---|---|
| `getPrincipalContext` (신규) | `'SELF'` |
| `listAllApprovals` (신규) | `{ admin: true }` |
| `sendApprovalReminder` (신규) | `{ admin: true }` |
| `listWorkforceTeams` (신규) | `{ admin: true }` |
| `listIssueWorklogExceptions` (신규) | `{ project: 'admin', projectIdKey: 'projectId' }` |
| `lookupProjectIssue` (신규) | `{ project: 'admin', projectIdKey: 'projectId' }` |
| `selectIssueWorklogApprovalFlow` (변경) | `{ issue:'edit', appAccess:false }` → `{ project: 'admin', projectIdKey: 'projectId' }` |

등록 3단계: 새 컨트롤러 `registerPrincipalController`(`src/resolver/principal/PrincipalController.js`)·`registerApprovalAdminController`(`src/resolver/approval/ApprovalAdminController.js`)를 `src/index.js` `CONTROLLER_REGISTRARS` 에 추가. `listIssueWorklogExceptions`·`lookupProjectIssue` 는 `WorklogPolicyController`, `listWorkforceTeams` 는 `WorkforceLinkController` 에 `guardedDefine`. `test/permission/permissionMap.contract.test.js` 통과.

---

## 3. 계약(contract.js · vectors.json) 변경 — 워크포스 쪽에 바이트 동일 복사 필요

해시(승인 앱 확정본):
- (1회차, 폐기) `src/integration/workforce/contract.js` sha256 `cb3e80c2…` — **현재 확정본은 R2 `e09c2534…`**
- (1회차, 폐기) `src/integration/workforce/vectors.json` sha256 `c85d6c77…` — **현재 확정본은 R2 `7b746bdc…`**
- 워크포스 현재본은 아직 이전 해시(`4710d182…` / `ebdf589c…`) — 복사 전이라 정상. `CONTRACT_VERSION` 1 유지(가산), import 없음 유지(`contractSelfContained.test` 통과).

`contract.js` diff 요약(+45/−1):
- `TYP.APPROVAL_FLOWS = 'approval.flows'`, `TYP_FAMILY[...] = Family.APPROVAL`, `PROPERTY_KEY.APPROVAL_FLOWS = 'movesApproval.flows'`, `entOf(approval.flows) = pick('projectId')`.
- 신규 export: `FLOWS_DOC_KEY = 'flows'`, `FLOWS_MAX = 20`, `FLOW_NAME_MAX = 120`, `ISSUE_POLICY_KEYS = { createWindowDays:'days', editWindowDays:'days', deleteWindowDays:'days', pastDateMaxDays:'days', dailyMaxSeconds:'daySec', weeklyMaxSeconds:'weekSec', futureDateAllowed:'bool' }`.
- `DocKind.FLOWS = 'FLOWS'`, `docKindOf('flows') → DocKind.FLOWS`.
- `validators[rms.issue]` 가산: `nullable(b.pol, issuePolicyValid) && nullable(b.fl, UUID)` — `pol` 은 닫힌 집합(모르는 키·범위 밖·60의 배수 아닌 초 → 문서 전체 무효). days 0~3650, daySec 0~86400, weekSec 0~604800.
- `validators[approval.flows]`: `req:boolean`, `def: uuid|null`(fo 안), `fo: [{id:uuid, n:1~120자}] ≤20, id 중복 금지`, `rev ≥0`.
- 계약 UUID 정규식은 **소문자만**(기존 그대로) — 승인 앱 결재선 id 가 대문자면 flows 문서에서 빠진다(`flowsBodyOf` 가 거름).

`vectors.json`: `signatures[]` 뒤에 3건 — ① `rms.issue` v2(`ent {projectId:'10000', issueId:'10003'}`, pol·fl 포함) ② `rms.issue` 구판(`I:10004`, s/e/pa 만) ③ `approval.flows`(`P:10000`, 승인 앱 키). 생성 고정 테스트 `src/integration/workforce/__test__/linkedModeContract.test.js`(`slice(-3)`), 기존 lis 고정은 `slice(-7,-3)`.

워크포스가 함께 맞출 것: `vectors.test.js` 지문 표 갱신, `rx` 토큰 `rms.issue.fl`(수정 1)·`approval.flows` 게이트, flows 문서 검증은 승인 앱 키(ap-*)·`ent {projectId}`.

ctl 게시(승인 앱):
- `ch` 항상 `'APP'`, `rx = ['rms.issue','rms.kb','rms.issue.fl','approval.flows']`(`CTL_RX`, `WorklogControlCtl.js`) — (수정 1) 토큰 이름 `rms.issue.v2` → `rms.issue.fl`.
- `publicationVersion() = 'linked-issue:2:{ctlRev}:rms.issue,rms.kb,rms.issue.fl,approval.flows'` → 배포 후 일일 `workforce` 작업이 ctl 전량 + flows(대상 프로젝트별) 1회 재게시.
- 설계 §17 은 ④a(v2)·④b(flows) 를 따로 배포하라고 하지만 이번 구현은 두 토큰을 한 번에 싣는다. 나눠 배포하려면 `CTL_RX` 에서 `'approval.flows'` 를 빼고 내보내면 된다(publicationVersion 이 따라 바뀜).

---

## 4. Phase 별 구현 파일

**① 창구 통일**
- `src/resolver/settings/SettingsRepository.js` — `linkedInputChannel` 을 KVS 키맵·기본값·GLOBAL_ONLY 셋에서 같이 삭제(계약 테스트 통과).
- `src/resolver/settings/SettingsService.js` — normalizer 삭제(→ unknown key `INVALID_TARGET`), `ctlState` 의존·ctlRev 증가 삭제.
- `src/resolver/worklogControl/WorklogControlContext.js` — `channel` 칸 삭제(contextFor·controlView).
- `src/resolver/worklogControl/WorklogControlCtl.js` — `ch:'APP'`, `CTL_RX`, publicationVersion 2판, `targetRows()`(대상 + 소속 프로젝트, 같은 SQL 1회).
- `src/resolver/worklogControl/WorklogControlDetector.js` — `LINKED_DIRECT_WF` 조건 = `created ∧ link.linked`.

**③ 이슈 예외·결재선 이동**
- 도메인: `src/domain/worklogApproval/flowChoice.js`(신규), `src/domain/worklogPolicy/merge.js`(`issueLinked`·`LINKED_POLICY_KEYS`·LINKED_ISSUE pol).
- `src/resolver/worklogPolicy/WorklogPolicyResolver.js` — 이미 읽은 rms.policy 행으로 `controlLinkOf` → `issueLinked`(SQL +0), `effective.linkMode/issueLinked`.
- `src/resolver/worklogApproval/WorklogApprovalPolicy.js` — `read`(flowChoice), `view`(새 shape), `select`(새 검사 순서·해제·감사), saveConfig flows touch.
- `src/resolver/worklogApproval/WorklogApprovalRepository.js` — `deleteBinding`, `bindingsOf`.
- `src/resolver/worklogApproval/WorklogApprovalService.js` — 거부 cause `managedBy`.
- `src/resolver/worklogPolicy/WorklogPolicyService.js` — `issue` 응답 가산, `saveIssue` 연동 거부, `listIssueExceptions`, `lookupProjectIssue`(asUser `GET issue/{key}?fields=summary,project`).
- `src/resolver/worklogPolicy/WorklogPolicyRepository.js` — `exceptionIssueIds`(UNION 1문장, `policy_json<>'{}'`).
- `src/utils/errors/ErrorCodes.js` + `locales/{kr,en}/error.json` — `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`.

**⑤ 메뉴·역할**
- `src/domain/inbox/historyFilter.js`(신규 — `historyFilterOf`, `dateRangeOf`).
- `src/resolver/inbox/InboxRepository.js`(history 조건·targetKinds), `InboxService.js`(`normalizeInboxFilters` export, history 본인만·중복 제거, counts 생략).
- `src/resolver/approval/ApprovalAdminService.js`·`ApprovalAdminController.js`(신규), `ApprovalRepository.searchAll`·`approversOf`, `ExpiryService` 에서 `reminderRowsOf`·`currentStepPending` 공용 export(스윕 독촉 알림 id 무변경 — 기존 테스트 통과).
- `src/resolver/principal/PrincipalController.js`(신규).

**④a 계약·독자**: `contract.js`, `vectors.json`, `src/domain/linkedIssue/setting.js`(`stricterSetting` 에 `pol`·`fl`, `effectiveSetting(body, base)`), `WorklogService.getLinkedIssueOverview`(`linkedFlowOf`).

**④b flows 게시**
- `src/domain/worklogApproval/flowsBody.js`(신규, 순수), `src/integration/workforce/flowsDoc.js`(신규 — `buildFlowsDoc`, `flowsAccountOf`, `flowsTargetOf`; 승인 앱 전용, 계약 파일 아님).
- `src/resolver/worklogApproval/WorklogApprovalFlowsDoc.js`(본문 원천), `flowsTouch.js`(재게시 표식).
- `src/resolver/workforce/WorkforcePublisher.js` — `flowsSource`(기본 null, 운영 인스턴스만 연결), `drainFlows`, 스캔 시 대상 프로젝트별 `F:` touch, 대조(verify)에서 flows 프로퍼티 GET.
- `src/resolver/workforce/WorkforceLinkRepository.js` — `touchExisting`, `touchDocKey`, 개인정보 overlay 에서 `F:` 제외.
- `src/resolver/flow/FlowService.js` — 결재선 수정·켜기/끄기·삭제 뒤 `flowsTouch.touchAll()`.
- `AGENTS.md` asApp 2번에 `movesApproval.flows` 게시 한 줄(+ 관찰 문구에서 "APP 창구" 정리).

**② 결재자 표시**: `src/domain/workforce/teamsFromOrgs.js`(신규), `src/resolver/workforce/WorkforceTeamsService.js`(신규), `WorkforceLinkRepository.pageOrgRows`, `TeamRepository.rosterMembership`, `WorkforceLinkController` 등록. 결재자 이름 2곳(§4.3)은 기존 응답(`routing.approverKeys`, `approval.steps[].approvers`)이라 **백엔드 변경 없음**.

---

## 5. 테스트

전체: `npm test -- --runInBand` → **Test Suites 178 passed / Tests 2725 passed**(2회차). 실패 0.

신규·변경 테스트 파일:
- 신규: `src/domain/worklogApproval/__test__/flowChoice.test.js`, `flowsBody.test.js`, `src/domain/inbox/__test__/historyFilter.test.js`, `src/domain/workforce/__test__/teamsFromOrgs.test.js`, `src/resolver/worklogApproval/__test__/WorklogApprovalFlowSelect.test.js`, `WorklogApprovalFlowsDoc.test.js`, `src/resolver/worklogPolicy/__test__/IssueExceptions.test.js`, `src/resolver/inbox/__test__/InboxHistory.test.js`, `src/resolver/approval/__test__/ApprovalAdminService.test.js`, `src/resolver/workforce/__test__/WorkforceTeamsService.test.js`, `src/integration/workforce/__test__/linkedModeContract.test.js`.
- 2회차 추가: `setting.test.js` D8 3건(하위 층 유지·느슨하면 문서 값·누적 충돌), `IssueExceptions.test.js` D8 해석기 3건, `ApprovalAdminService.test.js` D4 SQL 상한 1건.
- 갱신: `setting.test.js`(pol·fl), `WorklogPolicy.test.js`(issueLinked·pol·집계), `SettingsPolicyKeys.test.js`·`SettingsService.test.js`(키 삭제·거부), `WorklogControlCtl.test.js`(ch APP·rx·publicationVersion 2), `WorklogControlContext.test.js`(channel 부재), `LinkedObservation.test.js`, `LinkedCtlPagination.test.js`, `WorklogServiceControl.test.js`, `LinkedIssueOverview.test.js`, `LinkedIssueSettingSource.test.js`(pol 보존·무효), `linkedIssueContract.test.js`(slice), `idleSqlBudget.test.js`.
- `idleSqlBudget.test.js`: 기존 단언·상한(미연동 ≤27, 연동 ≤38, 워크포스 연동 유휴 ≤13) **무변경**. 테스트 헬퍼 `runnersWith` 에 `flowsSource` 인자만 추가하고 "flows 원천을 붙여도 연동 유휴 SQL 수가 같다(+0), 꺼짐 ≤1" 단언 1건 추가. 옛 KVS `linkedInputChannel` 값(WORKFORCE/APP)을 남긴 채 같은 상한을 지키는 기존 케이스가 그대로 녹색 — "저장값은 읽지 않는다"도 함께 고정됨.

---

## 6. 미검증 (→ `04_spike_todo.md` 후보, 설계 §14 와 같은 번호)

| # | 항목 | 확인 방법 |
|---|---|---|
| U-3 | 관리자 asUser 로 남의 `movesRms.org` 사용자 프로퍼티 GET(팀 탭 "다시 읽기") | 개발 사이트 팀 탭 → `refreshWorkforceCapabilities` 결과의 unreadable 수 |
| U-4 | 승인 앱 asApp 의 프로젝트 프로퍼티 PUT `movesApproval.flows`(ctl 과 같은 자격) | 배포 후 `workforce_publish` 의 `F:*`/`flows` 행 `last_error_code`, 프로젝트 프로퍼티 GET |
| U-5 | 워크포스가 승인 앱이 쓴 `movesApproval.flows` 를 읽을 수 있는가 | 워크포스 진단 `FLOWS_DOC`(워크포스 작업) |
| U-7 | `getAppContext().appAri/environmentAri` 운영 채움 → ctl `ui.globalPagePath` | 승인 앱 진단 `HANDOFF_PATH` |
| V-8 | `listAllApprovals`(`is_open = ? … ORDER BY updated_at DESC, request_id DESC`)·history(`approval_inbox` role/is_open 조건) 실행 계획 | 개발 사이트 TiDB `EXPLAIN` — `ix_request_retention`·`ix_inbox_open` 사용 확인 |
| V-9 | (플랫폼 아님) `touchDocKey`(`WHERE doc_key = ?`)는 PK 선두가 아니라 `workforce_publish` 전체 스캔 | 연동 모드에서 결재선 수정 때만 실행. 원장 행 수(사용자×연도 + ctl + flows) 기준 비용 확인, 커지면 `account_id LIKE 'F:%'` 범위로 바꾸기 |

`forge`·배포 명령은 실행하지 않았다.

---

## 7. 프론트(frontend-engineer)가 바꿔야 할 소비 지점 — 백엔드가 이미 바꾼 것

| 파일 | 현재 소비 | 바뀐 서버 |
|---|---|---|
| `static/ui/src/features/settings/WorkforceLinkSettings.jsx` | `linkedInputChannel` select | 저장하면 `INVALID_TARGET`(키 삭제) — 반드시 제거 |
| `static/ui/src/features/worklogControl/worklogControlModel.js:216` | `control.channel === 'WORKFORCE' → 'LINKED'` | `channel` 칸 없음 |
| `static/ui/src/features/worklog/WorklogDialog.jsx:170` | `policy.options?.find(id===policy.selectedFlowId)?.label` | `policy.selectedFlow?.label` 로 |
| `static/ui/src/features/worklogApproval/WorklogApprovalPolicyPanel.jsx` | `options`·`canSelect`·`bindingRev`, `selectIssueWorklogApprovalFlow({issueId, flowId, rev})` | 응답 칸 삭제·축이 프로젝트 관리자·입력에 `projectId` 필수 → 설계대로 삭제 후 `WorklogApprovalFlowLine` |
| `static/ui/src/features/worklog/WorklogTab.jsx:79` | `getIssueWorklogApprovalPolicy` | 새 shape(§1.2) |
| 감사 화면 | — | `policy.audit.area.worklogApproval`, `policy.audit.action.bindIssue` 문구 필요(D11) |
| `worklogPolicy.ignored.MANAGED_BY_WORKFORCE` | — | `effective.keys[k].ignored[].reason` 에 새 값 |

---

## 발견 (범위 밖 — 고치지 않음)

1. `WorkforcePublisher.drainCtl` 은 문서 크기 상한(`DOC_SIZE_LIMIT`) 검사를 하지 않는다(사용자 문서·새 flows 경로는 한다). ctl 본문은 작아서 실제 피해는 없다.
2. `InboxService.listInbox` 의 일반 탭에서도 같은 요청이 여러 역할 행으로 오면(예: 요청자 = 결재자) 키셋 커서 `(updated_at, request_id)` 가 두 번째 행을 건너뛸 수 있다(PK 에 role 포함). history 에서는 중복 제거로 증상이 없고, 다른 탭은 tab 이 role 을 하나로 고정해 영향 없음.
3. `TimesheetTargetAdapter.filterVisible` 은 "목록 행이 이미 참여자로 좁혀져 있다"는 전제로 형식만 맞으면 전부 보이게 한다 — 업무함 밖(관리자 목록 등)에서 이 어댑터를 그대로 쓰면 불변식 7 위반이 된다. `listAllApprovals` 는 이 경로를 쓰지 않고 `TimesheetAccess.canView` 를 직접 부른다. 어댑터 주석에 "목록 전용" 경고를 두는 것을 권장.
4. (수정 1) `WorklogCertificationTargetAdapter.canView` 는 이슈 열람 ∧ **워크로그가 아직 있음**(Jira GET)인데, 업무함·관리자 목록의 `filterVisible` 은 이슈 열람만 본다. 그래서 워크로그가 지워진 옛 인증 요청은 목록에는 보이고 상세는 거부된다. 이 종류는 동결(Q106) 상태라 이번 범위에서 고치지 않았다(관리자 목록에서도 같은 차이).
