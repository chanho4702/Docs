# 02 백엔드 보고서 — audit-trail

작성: 2026-10-10 · backend-engineer · 입력 `01_architect_design.md` + 리더 지시(인증 백엔드 미커밋 반영, §5.3 인덱스 인라인 채택, 일일 스윕 구조, 유휴 SQL 0)
회차: 1회차(최초 구현)

## 결과 요약

| 항목 | 결과 |
|---|---|
| `npm test -- --runInBand` | **125 suites / 1,820 tests 전부 통과** (착수 전 118 / 1,727 → +7 suites, +93 tests) |
| `forge lint` | **No issues found** |
| 계약 테스트 | `permissionMap.contract`(3단계 등록 — 신규 3) 통과 · `auditReadOnly.contract`(감사 쓰기 resolver 없음) 통과 · `SettingsPolicyKeys`(신규 키 1) 통과 · `migrate.test` 통과 |
| `idleSqlBudget.test.js` | **상한 무변경으로 통과**(파일 수정 안 함) — 유휴 SQL 증가 0 |
| 마이그레이션 | v053 `worklog_history.wf_linked` ALTER · v054~v056 `approval_event` 인덱스. 인증 인덱스 2개는 v050·v051 CREATE 에 **인라인**(설계 v057·v058 없음). `LATEST_MIGRATION` = `v056_index_approval_event_delegate`(KVS `schema:version` 마커도 이 값) |
| 커밋·배포·`static/ui`·`locales`·`AGENTS.md`·`.claude` | 건드리지 않음 |
| 새 에러 코드 | **없음** (`ErrorCodes` 무변경). 사용 코드: `INVALID_TARGET`(cause `{field}`) · `REQUEST_NOT_FOUND` · `PERMISSION_DENIED`(주체 없음) |

## 불변식 점검

| # | 이 구현에서 |
|---|---|
| 1 | 해당 없음(요청 생성 없음) |
| 2 | 결재 감사는 `approval_event` 를 그대로 투영. 단계 이름만 `approval_approver` 원천에서 붙임. 상태 재계산 없음 |
| 3 | `src/domain/audit/*` 순수 — 정적 단언 테스트(`Date.now`·무인자 `new Date()` 없음) |
| 4 | 새 UPDATE 없음 |
| 5 | `approval_approver` 읽기만 |
| 6 | 행 key = `event_id`(결재) · `batch_id`(인증 묶음) · `worklogId`(펼침 건). `wf_linked` 는 기존 `(worklog_id, seq)` INSERT IGNORE 에 칼럼만 추가 |
| 7 | 결재 감사: 이슈 묶인 행(`issue_id` 숫자)을 조회자 asUser `filterVisibleIssues` 로 걸러 **행 제외 + `hiddenCount`**, 판정 throw·불완전이면 이슈 행 전부 제외(fail-close), TIMESHEET 행은 가시성 호출 없이 통과. 인증 펼침·`includeItems` 도 같은 규칙. 인증 묶음 요약은 숫자만 |
| 8 | 새 Jira 호출은 전부 asUser(`permissions/check`·`issue/bulkfetch`·`user/bulk`). asApp 추가 없음 → AGENTS 허용 목록 무변경 |
| 9 | 연결 판정은 `workforce_inbound` `status='VERIFIED'`(서명 검증 통과) 행만. `movesRmsLink` 등 프로퍼티 원문 미사용. 테스트: 묻지 않은 id·`I:` 정책 행이 섞여 와도 신호에 넣지 않음 |
| 10 | 해당 없음 |

---

## 1. resolver 목록과 실제 응답 shape

공통: `{success:true, content: <아래>}` / 실패 `{success:false, error:{name,code,message,cause}}`. 아래는 전부 `res.content`.

### 1.1 신규 3개 — `src/resolver/audit/AuditController.js` · `PermissionMap`(`{admin:true}` ×3) · `CONTROLLER_REGISTRARS.registerAuditController`

| resolver | 축 | payload |
|---|---|---|
| `listApprovalAudit` | `{admin:true}` | `{ from:int, to:int (to>from, to-from ≤ 366*86400000, to 배타), actorAccountId?, requesterAccountId?, projectId?: 숫자문자열≤18, targetKinds?: TargetKind[], eventTypes?: EventType[], cursor?: 'ms\|uuid', limit?: 1..200(기본 50) }` |
| `listCertificationAudit` | `{admin:true}` | `{ from, to (≤366일, 인증 시각 created_at 기준), actorAccountId?, subjectAccountId?, periodKey?: 'YYYY-MM', modes?: ('ENTRY'\|'MONTH')[], selfOnly?: boolean, outcomes?: CertOutcome[], includeItems?: boolean, cursor?, limit?: 1..50(기본 25) / includeItems 면 1..10(기본 10) }` |
| `getCertificationBatchAudit` | `{admin:true}` | `{ batchId: uuid }` (대소문자 무시 — 소문자로 정규화) |

- `from`·`to` 는 **정수(safe integer)** 여야 한다. 숫자 문자열 `'1'` 은 `INVALID_TARGET {field:'from'}` (기존 `listWorklogHistory` 는 `Number()` 변환을 허용 — 프론트는 숫자로 보낼 것).
- 집합 필터의 빈 배열·생략 = 필터 없음. 계정 id `/^[A-Za-z0-9:_-]{1,128}$/`.
- 에러: 형식 밖 → `INVALID_TARGET` + `cause:{field}` (field ∈ `from·to·actorAccountId·requesterAccountId·subjectAccountId·projectId·targetKinds·eventTypes·periodKey·modes·selfOnly·outcomes·includeItems·cursor·limit·batchId`). 묶음 없음·인증 테이블 미준비(펼침) → `REQUEST_NOT_FOUND`.

**`listApprovalAudit` content** (`ApprovalAuditService.listApprovalAudit` 그대로)
```js
{
  items: [{                         // occurredAt 내림차순 → eventId 내림차순
    eventId: 'uuid',                // React key
    eventType: 'REQUESTED'|'APPROVED'|'REJECTED'|'EXPIRED'|'CANCELLED'|'CHANGED_AFTER_APPROVAL'|'CONSUMED'|'FIELD_APPLIED'|'APPLY_FAILED'|'APPLY_CONFLICT',
    occurredAt: number,             // epoch ms(초 정밀 — TIMESTAMP)
    actorAccountId: string|null,    // 명의자. 시스템 이벤트 null
    delegateAccountId: string|null, // 대리 결재 시 실제로 누른 사람
    reason: string|null,
    contentVersion: number|null,
    step: { order: number, name: string|null } | null,   // APPROVED·REJECTED 만
    request: {
      requestId: 'uuid', targetKind, title: string|null,
      issueId: string|null,         // 숫자 문자열일 때만, 아니면 null
      issueKey: string|null,        // bulkfetch 현재 키 우선, 없으면 저장 issue_key
      projectId: string|null, projectKey: string|null,     // projectKey 는 bulkfetch 현재값(이슈 없는 행은 null)
      subjectAccountId: string|null, periodKey: string|null,
      requesterAccountId: string|null,
      status: 'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'|'CANCELLED',
      revision: number,
    },
  }],
  hiddenCount: number,              // 이 SQL 페이지에서 열람 불가 이슈라 뺀 행 수
  nextCursor: string|null,          // SQL 페이지가 꽉 찼으면(뺀 행이 있어도) 있음
  users: { [accountId]: { displayName: string|null, avatarUrl: string|null, accountType: 'atlassian'|'app'|'customer'|null } },
}
```
미준비(결재 테이블 없음) → `{ items: [], hiddenCount: 0, nextCursor: null, users: {} }`.

**`listCertificationAudit` content** (`CertAuditService.listCertificationAudit`)
```js
{
  items: [{                          // createdAt 내림차순 → batchId 내림차순
    batchId: 'uuid',
    createdAt: number,
    actorAccountId: string,          // 인증자
    subjectAccountId: string,        // 대상자(작성자)
    selfCertified: boolean,          // actor === subject
    periodKey: 'YYYY-MM',
    mode: 'ENTRY'|'MONTH',
    pinVerified: boolean,
    itemCount: number,               // 묶음 행 item_count(인증 시점)
    policy: { unit: 'ENTRY'|'MONTH', deletedHandling: 'KEEP'|'ZERO', revision: string|null } | null,  // policy_json 형식 밖이면 null
    current: { certified: number, mismatch: number, deleted: number, superseded: number, certifiedSeconds: number },
    outcome: 'ALL_VALID'|'HAS_MISMATCH'|'HAS_DELETED'|'HAS_SUPERSEDED',   // DELETED > MISMATCH > SUPERSEDED > ALL_VALID
  }],
  filteredCount: number,             // outcomes 후처리로 이 페이지에서 뺀 묶음 수
  nextCursor: string|null,           // SQL 마지막 묶음 기준(outcomes 로 items 가 비어도 계속될 수 있다)
  users: UserMap,                    // 남은 묶음의 인증자·대상자
  // includeItems:true 일 때만 ↓ (false 면 키 자체가 없다)
  itemsByBatch: { [batchId]: CertBatchItem[] },   // items 의 모든 batchId 가 키로 있음(보이는 건이 없으면 [])
  hiddenCount: number,               // 페이지 전체에서 열람 불가 이슈라 뺀 건 수
}
```
미준비 → `{ items: [], filteredCount: 0, nextCursor: null, users: {} }` (+ includeItems 면 `itemsByBatch: {}, hiddenCount: 0`).

**`getCertificationBatchAudit` content**
```js
{
  batch: CertBatchSummary,           // 위 items[] 와 같은 shape
  items: CertBatchItem[],            // worklogId 숫자 오름차순, 최대 200
  hiddenCount: number,
  users: UserMap,                    // 인증자·대상자
}

CertBatchItem = {
  worklogId: string, issueId: string,
  issue: { issueKey: string|null, summary: string|null, projectKey: string|null },
  certifiedStarted: number, certifiedSeconds: number,
  countedSeconds: number|null,       // 현재본만 — **지금 사이트 정책**의 KEEP/ZERO(cert counting.countedSeconds). SUPERSEDED 는 null
  state: 'CERTIFIED'|'MISMATCH'|'DELETED'|'SUPERSEDED',
  stateChangedAt: number|null,       // MISMATCH·DELETED 현재본만. CERTIFIED·SUPERSEDED 는 null
  superseded: { byBatchId: string|null, at: number|null } | null,     // SUPERSEDED 만
  selfCertified: boolean,
  frozen: { firstStarted: number|null, firstSeconds: number|null, editCount: number, lastSeq: number|null,
            signals: ('LATE_ENTRY'|'NEAR_CLOSE_EDIT'|'GROWTH'|'OTHER_ACTOR'|'OUTSIDE_APP'|'OBSERVED_LATE'|'NO_HISTORY')[], lateDays: number|null },
}
```

### 1.2 기존 resolver 가산(기존 필드 무변경)

| resolver | 가산(코드 그대로) |
|---|---|
| `listWorklogHistory` | 입력 `linkedOnly?: boolean`(기본 false, boolean 아니면 `INVALID_TARGET {field:'linkedOnly'}`). v053 미적용 설치에서 `linkedOnly:true` → 빈 페이지(SQL 없음) |
| `listWorklogHistory`·`getWorklogHistory`·`getTimesheetWorklogHistory`·`exportExpiredWorklogHistory` | `items[].workforceLinked: boolean \| null` (null = 칼럼 추가 전 행·PROJECT 모드·신호 조회 실패) · `users[id].accountType: 'atlassian'\|'app'\|'customer'\|null` |
| `getApprovalSettings`/`saveApprovalSettings` | 정책 키 `worklogHistoryScope: 'PROJECT'\|'PROJECT_OR_LINKED'\|'LINKED_ONLY'` (기본 `'PROJECT_OR_LINKED'`, GLOBAL_ONLY, 다른 값은 `INVALID_TARGET`). CATALOG 에는 넣지 않음(인증 5키와 같은 이유 — 프론트 `policyFields` 가 모르는 키에서 깨짐) |
| `resolveUsers`·`searchUsers` 등 `DirectoryService.normalizeUser` 를 거치는 응답 | `accountType: string\|null` 가산(user/bulk 원문값, 없으면 null) |
| `listSettingsAudit` | 무변경 |

---

## 2. 설계 대비 D-목록

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| D1 | v057·v058 인증 인덱스 별도 마이그레이션(§5.3 은 선택) | **v050·v051 CREATE 인라인**(`ix_wcb_created (created_at, batch_id)`, `ix_wcl_period_author (period_key, author_account)`) | 리더 지시(첫 배포 전). 인증 테스트 무영향 확인 |
| D2 | v054~v056 `CREATE INDEX IF NOT EXISTS` | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS …` | 인증 v052(D5)와 같은 멱등 형태. `migrate.test` 의 형태 단언이 이것만 허용 |
| D3 | `linkGate()` = `workforceLinkEnabled` + `hasAnyVerifiedInbound()`(SQL 1) 후 `verifiedLinkSignals`(SQL 1) | 관문 SQL 없이 **`verifiedLinkSignals` 직접**(KVS `workforceLinkEnabled` + `links.ready()` 테이블 프로브만 앞에) | 신호 조회 자체가 SQL 1회라 관문이 비용을 못 줄인다. 미연결 사이트도 관측 묶음당 SQL 1(같음), 연결 사이트는 1 절약. 컨테이너 간 memo(설치 혼선 위험)도 필요 없어짐 |
| D4 | 신호 조회 실패 처리 미기술 | 실패 = 판정 불가(`linked=null`). 프로젝트로 이미 범위 안이면 `wf_linked NULL` 로 기록, 범위 밖이 될 건은 **failed** 로 집계 → 스윕이 같은 페이지를 다시 봄 | 감사 기록을 조용히 빠뜨리지 않으려고. 인증 관찰은 그 앞에서 이미 수행(막지 않음) |
| D5 | `stepOf`: `decidedAt === occurredAt` 1개일 때만 | 위가 0개면 **같은 명의자의 결정 종류(APPROVE/REJECT) 행이 1개일 때** 그 행 | 결정 행 `decided_at` 과 이벤트 `occurred_at` 이 다른 now 로 찍히는 경로가 있으면 단계가 전부 null 이 되는 것을 막는다. 2개 이상이면 여전히 null(추측 안 함) |
| D6 | 인증 쌍 조회 `(period_key, author_account) IN ((?,?),…)` | `(period_key = ? AND author_account = ?) OR …` | A9(튜플 IN 바인딩·인덱스) 미검증 회피. 두 인덱스 모두 접두 일치 |
| D7 | `CertBatchItem.countedSeconds` 정책 출처 미명시 | **지금 사이트 정책**(`certPolicyOf(getPolicy())`) | 매트릭스·게시 문서와 같은 숫자. 묶음 당시 정책은 `batch.policy` 로 따로 보인다 |
| D8 | `stateChangedAt` "인증 후 변경·삭제 감지 시각(현재본)" | MISMATCH·DELETED 현재본만 값, CERTIFIED 는 null | 인증 INSERT 가 `state_changed_at` 을 인증 시각으로 채워(`writeParams`) CERTIFIED 행에선 "변경 감지"가 아니다 |
| D9 | superseded = log `batch_id` 일치 수 | 같은 워크로그는 1회만, 그 묶음이 지금도 현재본인 워크로그는 제외 | 재시도·경합 방어(숫자가 건수를 넘지 않게) |
| D10 | `getCertificationBatchAudit` 미준비 처리 미기술(§2.7 "빈 결과") | 미준비 → `REQUEST_NOT_FOUND` | 단건 조회라 "빈 결과" 표현이 없다. 목록은 빈 결과 그대로 |
| D11 | UserMap `accountType` | 이력·감사 응답(`WorklogHistoryService.userMapOf` 공용)만. **`WorklogCertService` 의 `users`(인증 매트릭스·펼침)는 무변경** | 설계 범위가 "이력·감사 응답". 인증 화면에도 필요하면 같은 한 줄 추가 |
| D12 | 정책 `historyEnabled=false` 이슈의 연결 워크로그 수집 | `(정책 historyEnabled ?? 사이트값) \|\| (linked && 사이트 worklogHistoryEnabled)` | 설계 그대로의 해석: 사이트 스위치 off 면 전부 끔 |

## 3. 스키마·마이그레이션

| 이름 | DDL |
|---|---|
| (v050 인라인) | `INDEX ix_wcb_created (created_at, batch_id)` |
| (v051 인라인) | `INDEX ix_wcl_period_author (period_key, author_account)` |
| `v053_alter_worklog_history_wf_linked` | `ALTER TABLE worklog_history ADD COLUMN IF NOT EXISTS wf_linked TINYINT(1) NULL` |
| `v054_index_approval_event_occurred` | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS ix_event_occurred (occurred_at, event_id)` |
| `v055_index_approval_event_actor` | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS ix_event_actor_occurred (actor_key, occurred_at)` |
| `v056_index_approval_event_delegate` | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS ix_event_delegate_occurred (delegate_key, occurred_at)` |

- 칼럼(v053)을 인덱스보다 앞에 — 인덱스 실패가 기록 경로를 막지 않게. 인덱스는 성능만이라 준비 프로브 없음.
- `wf_linked` 읽기·쓰기는 `isColumnReady('worklog_history','wf_linked')` 뒤에만(마커가 현재면 SQL 0). 미준비면 기존 23칼럼 INSERT·SELECT 그대로.
- DDL 파일: `src/rdb/schema/ddl/audit.sql.js`(migrate.js 가 직접 import — 인증 DDL 과 같은 방식, `ddl/index.js` 무변경).

## 4. 유휴 SQL·호출량

| 경로 | 이전 | 이후 |
|---|---|---|
| 일일 `approval-sweep` + 큐 작업(빈 상태) | 미연동 27 / 연동 38 | **동일**(`idleSqlBudget.test.js` 무수정 통과). 새 트리거·새 큐 작업 없음. 빈 피드면 `observe` 가 변경 0 으로 SQL 전에 반환 |
| 감사 조회 3종 | — | 화면을 열 때만. `listApprovalAudit` SQL 1~2(검색 + 결정 있으면 단계 1) · `listCertificationAudit` SQL 3(묶음·현재본·로그, 묶음 0이면 1) · 펼침 SQL 3(묶음·현재본·로그). Jira asUser: permissions/check·bulkfetch ⌈이슈/100⌉ 각 1, user/bulk ⌈사람/50⌉ |
| 워크로그 이벤트·스윕 페이지 1회(`observe`) | — | `PROJECT` 모드: +KVS 1(범위 키). 그 외: +KVS 2(범위·`workforceLinkEnabled`) + SQL 1(`verifiedLinkSignals`, 작성자·프로젝트 모두 비면 0). Jira +0 |
| `wf_linked` 칼럼 프로브 | — | 마커가 현재면 0. v053 적용 전(마커 불일치) 설치는 이력 INSERT·SELECT 때 information_schema 1회씩(true 만 캐시) — 첫 resolver 호출·일일 스윕이 마이그레이션하면 사라짐 |

**기본값 효과(릴리스 노트용)**: `worklogHistoryScope` 기본 `PROJECT_OR_LINKED` 라 배포 즉시 "앱을 끈 프로젝트의 워크포스 연결 워크로그"가 이력 수집 대상이 된다. 적용 프로젝트를 고르지 않은 사이트(전체 수집)와 워크포스 미연결 사이트는 변화 없음.

## 5. 미검증(실측 필요)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| A7 | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS` 가 TiDB 에서 멱등·성공 | v054~v056 | dev 배포 후 첫 resolver 호출 → `schema:version` 이 `v056_…` 인지, 재실행 무오류. 실패면 해당 항목 제거(결과는 같고 느릴 뿐) |
| A8 | `e.event_id IN (SELECT … UNION SELECT …)` 가 Forge SQL 단일 문장으로 허용되고 인덱스를 타는지 | 결재 감사 행위자 필터 | 행위자 필터로 `listApprovalAudit` 호출(오류 여부) + 합성 1만 행 응답 시간. 안 되면 actor/delegate 두 질의 키셋 병합 |
| A10 | `rms.org` VERIFIED 가 워크포스 게시물 삭제 뒤에도 남는지(sticky) | 연결 판정이 갑자기 꺼지지 않는다는 전제 | 두 앱 dev 에서 org 게시물 삭제 → 본인 접속 → 행 status |
| A11 | `user/bulk` 의 `accountType` 이 앱·비활성 계정에도 오는지 | "앱 계정" 배지 | 앱 계정 id 로 `resolveUsers` |
| A5 | 자동화 규칙 워크로그의 `updateAuthor` 가 앱 계정인지 | 배지 해석 | 자동화로 워크로그 추가 → 이력 행 actor 의 `accountType` |

확인 방법은 `04_spike_todo.md` 에도 같은 표로 남김.

## 6. 테스트(신규·변경)

신규: `src/domain/audit/__test__/{approvalAudit,certAudit}.test.js` · `src/resolver/audit/__test__/{ApprovalAuditService,CertAuditService,auditReadOnly.contract}.test.js`(Repository SQL 계약 포함) · `src/resolver/worklogHistory/__test__/WorklogHistoryRecorderScope.test.js`(3모드 × 프로젝트 × 연결 12건, PROJECT 모드 신호 미조회, 미연결 SQL 0, 묶음당 1회, 프로젝트 조회 실패 + 작성자 연결, 정책 historyEnabled=false 연결분, 신호 실패) · `src/resolver/workforce/__test__/WorkforceLinkSignals.test.js`

가산: `worklogHistory.test.js`(범위 판정·linkedOf·wfLinked 투영) · `WorklogHistoryRepository.test.js`(wf_linked 쓰기·읽기·linkedOnly, 기존 capture 에 `columnReady` 주입) · `WorklogHistoryService.test.js`(linkedOnly·accountType) · `SettingsPolicyKeys.test.js`(worklogHistoryScope) · `migrate.test.js`(v053~v056 + 인라인 인덱스)

기대값만 고침(가산 필드): `worklogHistory.test.js` historyItemOf 계약(`workforceLinked:null`) · `WorklogHistoryService.test.js` UserMap(`accountType:null`) · `DirectoryService.test.js` resolveUsers(`accountType`)

## 7. 프론트·리더에게

1. **새 에러 코드 없음** — `locales/*/error.json` 추가 불필요.
2. 프론트가 숫자로 보낼 것: `from`·`to` 정수 epoch ms(문자열 불가).
3. `includeItems:true` 엑셀은 `limit ≤ 10`, 묶음당 건 최대 200. `itemsByBatch` 키는 그 페이지 `items` 의 batchId 전부.
4. `outcomes` 필터 시 `items` 가 비어도 `nextCursor` 가 있을 수 있다 — "더 보기"를 막지 말 것.
5. AGENTS.md 변경 필요 없음(asApp 무변경). 단 "유휴 비용" 문단은 그대로 맞다(27/38).
6. manifest 변경 없음. 배포 시 인덱스·칼럼 추가가 major 인지 확인(`--approve MAJOR_VERSION_RULE` 준비).

## 발견(범위 밖, 고치지 않음)

- `listWorklogHistory.parseSearch` 는 `from`·`to` 를 `Number()` 로 변환해 문자열도 받는다. 새 감사 resolver 는 정수만 받는다 — 두 화면의 입력 규칙이 다르다(프론트가 숫자를 보내면 문제 없음).
- `WorklogCertService.userMapOf` 는 `WorklogHistoryService.userMapOf` 와 같은 일을 하는 복제본이다(D11). 합치면 인증 화면도 accountType 을 받는다.
- 작업 트리에 `src/integration/workforce/vectors.json` 수정이 보인다(내 변경 아님 — 인증 보고서 D8 은 "수정 금지"라 적었다). 누가 고쳤는지 확인 필요.

> **번호 변경(2026-10-10, worklog-certification-model 3회차)**: 인덱스 실패(U6·A7)가 칼럼을 막지 않게 재정렬했다 — `v052_alter_worklog_history_wf_linked`(위 표의 v053 → v052), 인증 미러 인덱스가 `v053_index_worklog_mirror_author_started`(v052 → v053). v054~v056·`LATEST_MIGRATION`(`v056_index_approval_event_delegate`) 그대로. 첫 프로덕션 배포 전이라 이름 변경 허용.

---

## 2회차 (2026-10-10) — `listSettingsAudit` 기간·사람 검색 + `users`

요청: 프론트 보고서(`02_frontend_report.md`) — 설정 변경 탭이 기간 검색과 "같은 사람·같은 기간" 링크 대상이 되도록.

### 마이그레이션 번호 정정(인증 백엔드 재정렬 반영)

1회차 §3 의 번호는 그 사이 바뀌었다. 현재 트리: `v052_alter_worklog_history_wf_linked` · `v053_index_worklog_mirror_author_started` · `v054~v056` approval_event 인덱스. `LATEST_MIGRATION`(= `schema:version`) 은 여전히 `v056_index_approval_event_delegate`. **이번 회차 마이그레이션 추가 없음** — `approval_settings_audit` 에 이미 `ix_settings_audit_time (occurred_at, audit_id)`(v014 인라인)가 있어 기간 범위 스캔·키셋이 그 인덱스를 탄다. 행위자는 기간 안에서 거른다(1년 보관이라 작다). `migrate.test`·마커 기대값 무변경.

### 변경된 계약 — `listSettingsAudit`(`{admin:true}`, 무변경)

입력(전부 선택):
```js
{ cursor?: string /* 기존 불투명 base64url 그대로 */, from?: int, to?: int, actorAccountId?: string }
```
- `from`·`to` 중 하나라도 주면 둘 다 정수 epoch ms, `to > from`, `to - from ≤ 366일`(다른 감사 resolver 와 같은 `parseRange`). 위반 → `INVALID_TARGET {field:'from'|'to'}`. 계정 형식 위반 → `INVALID_TARGET {field:'actorAccountId'}`.
- **입력 없음 = 예전 동작 그대로**(최신 50건, 잘못된 커서는 처음부터). 페이지 크기는 50 고정 그대로.

응답(`content`):
```js
{
  items: [{ auditId, occurredAt, actorKey, area, action, detail }],   // 무변경
  nextCursor: string|null,                                            // 무변경(불투명)
  users: { [accountId]: { displayName: string|null, avatarUrl: string|null, accountType: 'atlassian'|'app'|'customer'|null } },  // 가산 — 행의 actorKey 들
}
```
행이 없으면 `users: {}`(이름 조회 호출 없음).

### 구현

- `SettingsAuditRepository.list({cursor, limit, from, to, actorKey})` — 조건을 AND 로, 필터가 없으면 WHERE 없음(기존 SQL 그대로).
- `SettingsService.createListSettingsAudit({repository, userLoader})` 팩토리 + `listSettingsAudit = createListSettingsAudit()`(Controller 무변경).
- `userMapOf` 를 `src/resolver/timesheet/userDisplay.js` 로 옮겼다(설정 서비스가 이력 서비스 전체를 끌어오지 않게). `WorklogHistoryService` 는 같은 이름으로 re-export — 기존 import 무영향. 감사 서비스 2개는 userDisplay 에서 직접 import.

### 결과

- `npm test -- --runInBand`: **126 suites / 1,836 tests 통과**(+1 suite `SettingsAuditList.test.js`, +16 tests)
- `forge lint`: No issues found
- 유휴 SQL: 무변화(조회 resolver 만 변경). 새 에러 코드 없음. `static/ui`·`locales` 무수정.
