# 02 백엔드 보고서 — worklog-certification-model

작성: 2026-10-10 · backend-engineer · 입력 `01_architect_design.md` + 리더 지시(스케줄 구조 변경 1523ee1 우선)
회차: 1회차(최초 구현)

## 결과 요약

| 항목 | 결과 |
|---|---|
| `npm test -- --runInBand` | **118 suites / 1,727 tests 전부 통과** (착수 전 111 / 1,512 → +7 suites, +215 tests) |
| `forge lint` | **No issues found** |
| 계약 테스트 | `permissionMap.contract`(3단계 등록) 통과 · `SettingsPolicyKeys`(기본값 ↔ KVS 키 같은 집합 + CATALOG siteOnly ⊂ GLOBAL_ONLY_KEYS + 인증 5키) 통과 |
| 마이그레이션 | v049 `worklog_cert` · v050 `worklog_cert_batch` · v051 `worklog_cert_log` · v052 `worklog_mirror` 인덱스. `LATEST_MIGRATION` 은 배열 마지막에서 자동으로 `v052_index_worklog_mirror_author_started` 가 된다(KVS `schema:version` 마커도 그 값). `SCHEMA_TABLES` 에 새 테이블 3개 자동 포함 → 트리거 경로 readiness 는 KVS 마커로(information_schema 무조회) |
| 커밋·배포·forge deploy | 하지 않음 |
| `static/ui`·`locales`·`AGENTS.md`·`.claude/skills` | 건드리지 않음 |

## 불변식 점검(1~10)

| # | 이 구현에서 |
|---|---|
| 1 | `worklog_cert` PK `worklog_id` — 워크로그당 현재 인증본 하나. 재인증은 CAS 로 덮고 이전 판은 log |
| 2 | 인증 레코드가 원천. 표시 상태는 `effectiveState(row, live)` 파생 |
| 3 | 도메인 6파일 전부 순수(now·타임존·정책 인자). `Date.now()` 없음 |
| 4 | `worklog_cert` UPDATE 2종(`recertify`·`applyObservation`) 모두 `WHERE rev=?` + `rev = rev + 1` — 테스트가 소스를 읽어 단언 |
| 5 | 결재 엔진을 타지 않음(해당 없음) |
| 6 | `worklog_cert_log` PK `(worklog_id, cert_rev)` + INSERT IGNORE |
| 7 | 팀장 경로는 매 호출 `TeamScope.leads`/`membersOf`, 현재값은 팀장 asUser. 삭제 행은 `filterVisibleIssues` 로 다시 거름. 탭 배지는 이력 카운트와 같은 `eligibleOf` |
| 8 | 새 asApp 호출 없음. 인증 쓰기 직전 현재값은 asUser `worklog/list`, 프로젝트는 asUser `bulkfetch` |
| 9 | 엔티티 프로퍼티로 판정하지 않음. 게시는 서명 문서(v2) |
| 10 | 해당 없음 |

## 1. resolver 목록과 실제 응답 shape

공통: `{success:true, content: <아래>}` / 실패 `{success:false, error:{name,code,message,cause}}`. 프론트는 `error.code` 로 분기.

### 1.1 신규 5개 (3단계 등록: `src/resolver/worklogCert/WorklogCertController.js` · `PermissionMap` · `CONTROLLER_REGISTRARS.registerWorklogCertController`)

| resolver | 축 | payload |
|---|---|---|
| `getCertificationMatrix` | `{teamLead:true}` | `{periodKey?:'YYYY-MM'(없으면 이번 달), teamKey?: string≤80}` |
| `listMemberCertifications` | `{teamLead:true}` | `{accountId, periodKey?}` (없으면 이번 달) |
| `certifyWorklogs` | `{teamLead:true}` | `{accountId, periodKey, mode:'ENTRY'|'MONTH', batchKey: uuid v4, setDigest?: 16자, items:[{worklogId, fp:16자, lastSeq:int|null}] (1~200), pin?}` |
| `listOwnCertifications` | `'SELF'` | `{periodKey?}` |
| `certifyOwnWorklogs` | `'SELF'` | `certifyWorklogs` 와 같고 **accountId 는 무시**(대상 = 호출자) |

**`getCertificationMatrix` content** (코드 그대로 — `WorklogCertService.getCertificationMatrix`)
```js
{
  periodKey, timeZone, period: { start, end },
  unit: 'ENTRY'|'MONTH', deletedHandling: 'KEEP'|'ZERO',
  teams: [{ teamKey, displayName, source: 'ROSTER'|'WORKFORCE' }], teamKey: string|null,
  coverage: { mirror: boolean, since: number|null },
  rows: [{
    accountId, displayName, avatarUrl, teamKey, teamSource,
    certifiedSeconds, certifiedCount, mismatchCount, deletedCount, selfCertifiedCount,
    claimedSeconds: number|null, claimedCount: number|null, uncertifiedCount: number|null,   // coverage.mirror=false 면 null
    lastCertifiedAt: number|null,
  }],   // displayName 오름차순
  summary: { total, fullyCertified, withMismatch, withUncertified },
}
```
- `uncertifiedCount` = 미러(삭제 제외, 그 월 시작)에 있는데 **인증 행이 아예 없는** 건수. MISMATCH 는 `mismatchCount` 로 따로.
- `fullyCertified` = `mismatchCount===0 && uncertifiedCount===0 && certifiedCount>0`(coverage false 면 0).
- coverage false 조건: 이력 수집 OFF · 이력 테이블 미준비 · `mirrorTotals` 쿼리 실패(v052 인덱스 미적용 포함).

**`listMemberCertifications` content** (`listFor`)
```js
{
  accountId, displayName, periodKey, period: { start, end }, timeZone,
  unit, deletedHandling,
  thresholds: { lateDays, nearCloseHours, growthPercent },
  items: WorklogCertRow[],      // 팀장 asUser 로 보이는 그 월 워크로그. started 오름차순
  deleted: WorklogCertRow[],    // 그 월 귀속 DELETED 중 조회자에게 보이는 이슈만(current:null, certifiable:false)
  hiddenCount: number,          // (그 월 인증 행 중 지금 목록에 없는 비삭제 + 안 보이는 삭제) + (미러에만 있는 id)
  setDigest: string(16),        // items 의 (worklogId, currentFp) 지문 — MONTH 인증 시 되돌려 보낸다(증거로 묶음 행에 저장)
  totals: { claimedSeconds, certifiedSeconds, uncertifiedCount, mismatchCount, deletedCount },
  history: { enabled: boolean, since: number|null, truncated: boolean },   // truncated 는 설계 대비 가산(D7)
  users: { [accountId]: { displayName, avatarUrl } },                     // 대상자 + 인증자
}

WorklogCertRow = {
  worklogId, issueId,
  issue: { issueKey, summary, projectKey },        // 삭제 행은 permissions/check bulkfetch 메타
  current: { started, seconds, created, updated } | null,
  currentFp: string|null,
  state: 'UNCERTIFIED'|'CERTIFIED'|'MISMATCH'|'DELETED_AFTER_CERT',
  certification: null | {
    storedState: 'CERTIFIED'|'MISMATCH'|'DELETED', periodKey,
    certifiedStarted, certifiedSeconds, countedSeconds,
    certifiedAt: number|null, certifiedBy: accountId|null, certRev, mode: 'ENTRY'|'MONTH'|null,
    selfCertified: boolean,
    frozen: WorklogSummary,     // 인증 시점 동결 요약(final = 인증값)
  },
  summary: WorklogSummary,      // 지금 계산(lastSeq 는 미러 last_seq — D6)
  certifiable: boolean,         // UNCERTIFIED·MISMATCH, 또는 상위자 화면(펼침)에서 본인 서명 CERTIFIED(승격)
}

WorklogSummary = {
  first: { started, seconds } | null, firstIsBaseline: boolean,
  final: { started, seconds } | null,
  editCount, lastSeq: number|null, lateDays: number|null, growthPercent: number|null,
  signals: ('LATE_ENTRY'|'NEAR_CLOSE_EDIT'|'GROWTH'|'OTHER_ACTOR'|'OUTSIDE_APP'|'OBSERVED_LATE'|'NO_HISTORY')[],
}
```
- 화면 관찰: 저장 상태와 지금 값이 어긋난 인증 행(최대 50)을 그 자리에서 CAS 로 MISMATCH/복구 반영하고 touch 한다 — 응답은 반영된 새 상태.
- `certifiable` 판정에 쓰는 `lastSeq` 는 응답 `summary.lastSeq` 를 그대로 `items[].lastSeq` 로 되돌려 보내면 된다.

**`listOwnCertifications` content** = 위와 같은 shape + 
```js
selfCert: { eligible: boolean, reason: null|'NOT_TEAM_LEAD'|'UPPER_LEAD_EXISTS'|'UPPER_LEAD_UNKNOWN', upperLeadCount: number }
```
(본인 목록에서 `certifiable` 의 승격 분기는 꺼져 있다 — 본인은 승격 주체가 아니다.)

**`certifyWorklogs` / `certifyOwnWorklogs` content**
```js
{
  batchKey,
  results: [   // 요청 items 순서. 예산 초과로 처리 안 한 건은 results 에 없고 remaining 에만
    { worklogId, ok: true, state: 'CERTIFIED', certRev, unchanged: boolean, selfCertified: boolean, upgraded: boolean }
  | { worklogId, ok: false, code, cause? }
  ],
  certified, unchanged, failed,
  remaining: string[],          // 15초 예산 초과(최소 1건 진전 후). 프론트는 새 batchKey 로 이어 부른다
  monthTotals: { certifiedSeconds, certifiedCount },
}
```
- 같은 `batchKey` 재시도는 멱등(이미 쓴 건은 `unchanged:true` 로 수렴). 다른 대상·월·모드·인증자로 재사용하면 `WORKLOG_CERT_BATCH_CONFLICT`.

### 1.2 기존 resolver 가산 필드(실제)

| resolver | 가산 필드(코드 그대로) |
|---|---|
| `getTimesheetContext` | `certification: { selfCertEligible: boolean }` — 판정 실패 false. (인증 모듈 미주입이면 `null` — 기본 인스턴스는 항상 객체) |
| `getMyTimesheet` | `certification: null | { unit, deletedHandling, certifiedSeconds, counts:{certified,mismatch,deleted,uncertified}, byWorklog: { [worklogId]: { state, certifiedSeconds, countedSeconds, certifiedAt, selfCertified } } }` — live 항목만이라 `counts.deleted` 는 사실상 0 |
| `getIssueWorklogs` | `worklogs[].certification: { state, certifiedSeconds, countedSeconds, selfCertified } | null` (자격 없음·인증 행 없음 = null) + 최상위 `certification: { unit } | null`(미준비·실패 null) |
| `getTimesheetWorklogHistory` | `worklogs: WorklogSummaryRow[]` = `[{ worklogId, issueId, issue:{issueKey,summary,projectKey}, submitted:{started,seconds}, summary: WorklogSummary, certification: {state,certifiedSeconds,countedSeconds,selfCertified}|null }]`. 미준비·실패 `[]` |
| `getWorkforceLinkStatus` | `certPublish: { state: 'OK'|'NOT_LINKED'|PublishState.*, linkedAt: number|null, pending, failed, published, lastPublishedAt }` |
| `getApprovalSettings`/`saveApprovalSettings` | 키 5개: `certificationUnit`('MONTH'), `deletedCertifiedHandling`('KEEP'), `certSignalLateDays`(7, 0~365), `certSignalNearCloseHours`(24, 0~720), `certSignalGrowthPercent`(50, 0~1000) |
| `getWorklogCertification` | shape 동일, `canRequest:false`·`availableFlows:[]` 고정, 조회 시 옛 원장 관찰 안 함 |
| `createWorklogCertification` | **제거**(Controller·PermissionMap) |

## 2. 에러 코드(프론트 번역 대상 — `ErrorCodes` 에 추가, `locales` 미반영)

신규 8개: `WORKLOG_CERT_STALE`(cause `{reason:'FINGERPRINT'|'SEQ'}`) · `WORKLOG_CERT_DELETED` · `WORKLOG_CERT_OUT_OF_PERIOD` · `WORKLOG_CERT_SUBJECT_MISMATCH` · `WORKLOG_CERT_SELF_DENIED`(cause `{reason:'NOT_TEAM_LEAD'|'UPPER_LEAD_EXISTS'|'UPPER_LEAD_UNKNOWN'|'TEAM_LEAD_AXIS', upperLeadCount}`) · `WORKLOG_CERT_UNIT_MISMATCH`(cause `{unit}`) · `WORKLOG_CERT_BATCH_CONFLICT` · `WORKLOG_CERT_CONFLICT`

재사용(이미 번역 있음): `INVALID_TARGET`(cause `{field}`) · `PERMISSION_TARGET_VIEW_DENIED` · `PERMISSION_TEAM_LEAD_REQUIRED`(가드) · `PIN_REQUIRED`·`PIN_INVALID`·`PIN_LOCKED`·`PIN_NOT_SET` · `STORAGE_NOT_READY` · `TIMESHEET_TOO_LARGE` · `WORKLOG_NOT_FOUND`(건별) · `UNKNOWN_ERROR`(건별)

어디서 나오나: 건별(`results[].code`) = STALE·DELETED·OUT_OF_PERIOD·SUBJECT_MISMATCH·CONFLICT·WORKLOG_NOT_FOUND·UNKNOWN_ERROR. 묶음(throw) = 나머지.
**`locales/{kr,en}/error.json` 에 8개 키 추가가 필요하다(프론트 단계).**

## 3. 유휴 SQL(스케줄 경로, 사용자 0명·이벤트 0건)

| 작업 | 착수 전 | 이후 | 비고 |
|---|---|---|---|
| expiry | 10 | 10 | |
| transition-apply | 4 | 4 | |
| timesheet | 5 | 5 | |
| worklog-history | 6 | 6 | 사이트 이력 OFF 면 `hasTracked` 가 `SELECT 1 FROM worklog_cert LIMIT 1` 1회 — 옛 테이블 조회를 대체(횟수 동일) |
| workforce(미연동) | 2 | **2** | 기존 관문(`NOT_LINKED`)에서 끝. 인증 SQL 0 |
| workforce(연동, 할 일 없음) | 12 | **13** | 인증 행 변경 스캔 SELECT 1회(`worklog_cert` 키셋). `idleSqlBudget.test.js` 상한 12→13 갱신 |
| **하루 합계(미연동)** | 27 | **27** | 상한 그대로 |

인증 기능 미사용 설치(인증 행 0)의 추가 비용: 미연동 0, 연동 +1/일. 처음 한 번(커서에 `w` 가 없는 옛 커서)만 인증 연도 표식 INSERT 1 + 커서 UPDATE 1 이 더 나간다(테스트 고정).

## 4. 워크포스 v2 문서 — 실제 본문과 바이트

사용자 프로퍼티 키 `movesApproval.cert.2026-10`(25자). 시험 키로 실제 생성한 값(3건, 본인 서명 1건, MISMATCH 1건):
```json
{
  "v": 2, "kind": "movesApproval.certification",
  "accountId": "712020:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "periodKey": "2026-10", "updatedAt": 1791000000000,
  "entry": {
    "u": "MONTH", "dh": "KEEP", "cs": 50400, "cn": 2, "mn": 1, "dn": 0, "sc": 7200, "sn": 1,
    "pr": "cp1:f50c8dde", "ps": 1790780400000, "pe": 1793458800000,
    "w": [["10234567", 28800], ["10234570", 14400, 1], ["10234588", 7200, 4]],
    "wn": 3, "at": 1790990000000,
    "kid": "ap-test-1", "iat": 1791000000000,
    "sig": "LaKxe0VenuXHhoKCFSwiNDpnbx0GPGTNO58gqr7GLuGrOUMOpcNx3CF7lNCt4HnxbPydN_0UyHHkt35oXMDtDw"
  }
}
```
| 경우 | 바이트(JSON.stringify, 전부 ASCII) |
|---|---|
| 위 3건 | **516** |
| 평균 월 100건 | **2,239** |
| 상위 월 150건 | **3,139** |
| 최악 1,000건(id 10자리·초 5자리·flag 6) | **23,453** (DOC_SIZE_LIMIT 30,000 · 프로퍼티 32,768 안) |
| 1,001건 이상 | 앞 1,000건 + `wt:true`, `cs`·`cn`·`wn` 은 전체 기준 |

- 서명: typ `approval.cert`, family APPROVAL, ent `{accountId, periodKey}` — 다른 달·다른 사용자로 옮기면 `BAD_SIGNATURE`(테스트). 서명 메시지 `v` 는 `CONTRACT_VERSION=1` 그대로(올리지 않음 — v1 전량 재게시 방지).
- flag 비트: 생략=CERTIFIED·제3자, 1=MISMATCH, 2=DELETED, 4=본인 서명(D8). 허용값 {1,2,4,5,6}.
- `cs`·`w[i][1]` 는 `countedSeconds`(KEEP/ZERO 정책 적용값). `ps`·`pe` 는 **게시 시점 사이트 타임존**의 월 경계(설계 "인증 시점 TZ" 와 다름 — D11).

## 5. 설계와 다른 점(D-목록)

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| D1 | 정책 5키를 `CATALOG` 에 `siteOnly:true` 로 | **CATALOG 에 넣지 않고** `SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`·`GLOBAL_ONLY_KEYS`·정규화기만 | CATALOG 에 넣으면 ① 계층 정책 site revision digest 가 모든 설치에서 바뀌고 ② 프론트 `policyFields`·`sitePolicyPatch` 가 모르는 키를 만나 `field.legacy` 에서 깨진다(프론트 범위 밖). 목적(프로젝트 덮어쓰기 불가 · `rms.policy` 가 못 바꿈)은 동일하게 달성: GLOBAL_ONLY 로 프로젝트 덮어쓰기 차단, `normalizeOverride` 는 CATALOG 밖 키를 거부. 계약 테스트에 "CATALOG siteOnly ⊂ GLOBAL_ONLY" 와 "인증 5키 ∈ GLOBAL_ONLY" 둘 다 넣음 |
| D2 | `TeamRepository.findTeamLeads(teamKey)` 추가 | 추가 안 함 | `findMemberTeam` 이 이미 활성 팀 + `leadKeys` 를 준다 |
| D3 | 연결 판정 `certLinkState()`(30일 내 검증 수신) + `listDue` 에서 인증 문서 제외 | **기존 게시 관문 재사용**(`hasAnyVerifiedInbound`, sticky) | 리더 지시(1523ee1). 관문이 tick 전체를 막으므로 `listDue` 제외 조건이 불필요하다. `certPublish.state` 의 NOT_LINKED 도 같은 판정 |
| D4 | 5분 스윕 · 잡 `wf-cert-scan` | 일일 큐 `workforce` 작업 안. 별도 잡 키 대신 **기존 `wf-change-scan` 커서 JSON 에 `w` 필드** 추가 | 잡 행·리스·커서 읽기를 늘리지 않으려고(유휴 +1 로 고정). 옛 커서(`w` 없음)는 첫 실행으로 보고 인증 연도 표식을 한 번 남김 |
| D5 | v052 `CREATE INDEX IF NOT EXISTS` | `ALTER TABLE worklog_mirror ADD INDEX IF NOT EXISTS ix_wlm_author_started (author_account, started)` | 설계 U6 의 대안 그대로. `migrate.test` 의 멱등 형태 단언이 이 형태만 허용 |
| D6 | lastSeq = 이력 마지막 seq | **미러 `last_seq`**(목록·인증 같은 함수 `lastSeqs`) | 이력 조회 상한·보관 정리와 무관하게 정확. 응답 `summary.lastSeq` 도 미러 값 |
| D7 | `listByWorklogIds(ids,{perWorklogCap:50,totalCap:5000})` | `totalCap` 만, `truncated: boolean` | 워크로그별 자르기는 editCount 를 틀리게 한다. 넘치면 응답 `history.truncated:true`(가산) |
| D8 | `vectors.json` 갱신 | **수정 안 함** | 파일에 "수정 금지 — 두 리포가 같은 파일로 대조" 명시. 대신 `certificationDoc.test` 에 서명 왕복·ent 변조 검증. WF-1 때 두 리포 동시 갱신 필요 |
| D9 | 매트릭스 `STORAGE_NOT_READY` | 인증 테이블 미준비면 매트릭스·펼침·본인 목록·인증 모두 throw. 가산 필드는 null/[] | — |
| D10 | `listMemberCertifications` 의 `periodKey` 필수 | 없으면 이번 달 | 매트릭스와 같은 규칙 |
| D11 | 문서 `ps`·`pe` = 인증 시점 TZ | 게시 시점 사이트 TZ 의 그 달 경계 | 행에 TZ 를 저장하지 않는다. 사이트 TZ 변경 시 인증 연도 표식을 touch 해 재게시한다 |
| D12 | 정책 변경 touch: 단위·삭제 처리 | 단위·삭제 처리 + **신호 기준값 3 + `timesheetTimezone`** 도 인증 연도 표식 touch | 기준값은 `pr`(정책 rev)에, TZ 는 `ps`·`pe` 에 들어간다 |
| D13 | 팀장 축 본인 대상 → `SELF_DENIED`(`TEAM_LEAD_AXIS`) | 인증은 그대로. **펼침**(`listMemberCertifications`)에 본인을 주면 `PERMISSION_TARGET_VIEW_DENIED` | 펼침은 팀원 범위만(본인은 "내 워크로그" 탭) |
| D14 | 옛 `createWorklogCertification` "제거(3곳)" | Controller·PermissionMap 에서 제거. `WorklogCertificationService.create` 메서드는 남김(도달 불가) | 기존 단위 테스트가 직접 부른다. 정리는 후속 |
| D15 | PIN 위치 | 팀장 경로: 형식→본인 차단→`leads`→정책 단위→**PIN**. 본인 경로: 형식→자격→단위→**PIN** | 자격 없는 사람의 PIN 실패 횟수를 올리지 않는다 |
| D16 | `setDigest` | 형식만 검증, 묶음 행에 증거로 저장(서버 목록과 대조하지 않음) | 설계 §4.3 그대로(검증 단계에 대조가 없다) |

## 6. 미검증(U1~U10 중 구현으로 바뀐 것)

| # | 상태 |
|---|---|
| U1 (=W2·W11) 타 사용자 프로퍼티 asApp 쓰기 | 그대로 미검증. 실패 시 기존 `PUBLISH_FORBIDDEN`→`WRITE_DENIED` 경로를 v2 도 공유 |
| U2 32KB 실측 | 그대로. 계산상 최악 23,453B(위 표) |
| U3 asUser `worklog/list` 가 안 보이는 워크로그를 빼는가 | 그대로. 섞여 오면 `certifyFor` 에 `filterVisibleIssues` 1회 추가 필요 |
| U4·U5 | 그대로 |
| U6 인덱스 마이그레이션 | **형태 변경**: `ALTER TABLE … ADD INDEX IF NOT EXISTS`(D5). 실패 시 v052 제거 또는 매트릭스 `coverage.mirror:false` 로 자동 후퇴(쿼리 실패 catch 구현됨) |
| U7 JQL `worklogAuthor = "<id>"` 팀장 컨텍스트 | 그대로(`collectForAuthor`) |
| U8 연결 신호 | **판정 바뀜**: 30일 창이 아니라 기존 관문(검증 수신 이력 sticky). 워크포스 org 미설정 사이트는 여전히 미연결로 남을 수 있다 |
| U9 `bulkfetch` asUser project id | 그대로(`fetchIssueProjectsAsUser`, 못 받으면 `project_id NULL` — 판정에 안 씀) |
| U10 `leaderKeys` 의미 | 그대로. 구현은 "A 의 워크포스 결재자 ∪ (A 가 overridden 이 아니면) 명부 팀 LEAD" − {A}. 워크포스 데이터가 "X 의 org 엔 A 가 팀원, A 의 org 엔 X 가 결재자 아님"처럼 어긋나면 위험 방향(본인 인증 열림)이 생길 수 있다 — 두 앱 dev 에서 확인 필요 |

확인 방법은 `04_spike_todo.md`.

## 7. 리더에게(내가 고치지 않은 것)

1. **AGENTS.md asApp 2번에 한 줄 추가 필요**: "사용자×월 인증 문서(`movesApproval.cert.{YYYY-MM}`, typ `approval.cert`) 게시·대조 — 사유 문자열은 기존 `workforce-publish`/`workforce-publish-verify` 재사용". 새 asApp 호출 지점은 없다(같은 게이트웨이·같은 사유).
2. **AGENTS.md "유휴 비용" 표/문구**: 연동 설치 workforce 작업 12→13(인증 스캔 1). 미연동 하루 합계 27 그대로.
3. `locales/{kr,en}/error.json` 에 신규 에러 코드 8개(§2) — 프론트 단계.
4. manifest 변경 없음. 배포 시 SQL 추가라 `--approve MAJOR_VERSION_RULE` 필요할 수 있음(테이블 추가 = 기존 `sql` 모듈 그대로라 major 는 아닐 가능성이 높지만 확인).

## 발견(범위 밖, 고치지 않음)

- `WorklogCertificationService.create`·옛 테스트가 남아 있다(D14). 옛 요청형 전체 정리(서비스 메서드·i18n `worklogCertification.*` 일부)는 후속 정리 항목.
- `SettingsRepository` 주석의 "정책은 KVS 34키" 는 이미 실제(44키)와 다르다 — 청크 읽기라 동작 문제는 없다.

## 파일

신규: `src/domain/worklogCertification/{state,authority,counting,summary,policy}.js` + `__test__/certDomain.test.js` · `src/resolver/worklogCert/{WorklogCertController,WorklogCertService,WorklogCertRepository,WorklogCertObserver}.js` + `__test__/{WorklogCertService,WorklogCertRepository,WorklogCertWiring}.test.js` · `src/integration/workforce/certificationDoc.js` + `__test__/certificationDoc.test.js` · `src/rdb/schema/ddl/worklogCert.sql.js` · `src/resolver/timesheet/__test__/TeamScopeUpperLeads.test.js` · `src/resolver/workforce/__test__/WorkforcePublisherCert.test.js`

수정: `fingerprint.js`(certFingerprintOf·setDigestOf 추가) · `contract.js`(TYP·키·validator·docKindOf) · `migrate.js` · `ErrorCodes.js` · `PermissionMap.js` · `index.js` · `SettingsRepository.js`·`SettingsService.js` · `TeamScope.js`(upperLeadsOf) · `TimesheetService.js` · `WorklogCollector.js`(collectForAuthor·fetchWorklogsByIdAsUser·fetchIssueProjectsAsUser) · `WorklogHistoryRepository.js`(listByWorklogIds·mirrorTotals·mirrorIds) · `WorklogHistoryService.js`(eligibleOf 추출·worklogs) · `WorklogHistoryRecorder.js`(새 Observer 주입) · `WorklogService.js`(배지) · `WorkforceOutbox.js`·`WorkforcePublisher.js`·`WorkforceLinkRepository.js`·`WorkforceLinkService.js` · `WorklogCertificationController.js`·`WorklogCertificationService.js`(동결) · 테스트 5개(`migrate`·`SettingsPolicyKeys`·`TimesheetService`·`WorkforceLinkService`·`idleSqlBudget`·`WorklogHistoryRecorder`)

---

## 2회차 (2026-10-10) — 프론트 보고서 §6 B1·B2

착수 전에 작업 트리를 다시 읽었다(감사 백엔드가 v053~v056·`worklogCert.sql.js` 인덱스·WorklogHistory·Settings·WorkforceLinkRepository 를 고친 상태 그대로 위에 얹음). 이번 회차가 고친 파일은 아래 5개뿐이다.

| # | 변경 | 응답 shape(코드 그대로) |
|---|---|---|
| B1 | `WorklogCertService.listFor` — `totals.certifiedCount` 가산 | `totals: { claimedSeconds, certifiedSeconds, certifiedCount, uncertifiedCount, mismatchCount, deletedCount }`. `certifiedCount` = 그 월 귀속 인증 행 중 저장 상태 `CERTIFIED` 건수(화면 관찰 반영 후). 숨김 이슈·지금 목록 밖 건 포함 — `items` 로 세는 값과 다를 수 있다. `listOwnCertifications` 도 같은 필드 |
| B2 | `WorkforceLinkService.getWorkforceLinkStatus` — `certPublish.selfSeconds`·`selfCount` 가산(번역 키 `worklogCert.workforce.selfSeconds` 에 맞춘 이름) | `certPublish: { state, linkedAt, selfSeconds, selfCount, pending, failed, published, lastPublishedAt }`. 게시 문서 `sc`·`sn` 과 같은 계산(KEEP=인증값, ZERO=MISMATCH 는 min·DELETED 는 0)을 **게시 범위(작년 1월~)** 전체로 합산. 인증 테이블 미준비·조회 실패는 0 |

- 저장소: `WorklogCertRepository.selfCertifiedTotals(fromPeriodKey)` — `WHERE period_key >= ? AND self_certified = 1 GROUP BY state` 1문(관리 화면 상태 조회 때만, 스케줄 경로 아님 → 유휴 SQL 변화 없음).
- B3(알 수 없는 `PublishState`)·B4(`claimedSeconds` 칸)는 백엔드 변경 없음 — 응답은 이미 그 값을 준다.
- 테스트: `WorklogCertService.test`(B1 숨김 CERTIFIED 포함 1건 + 기존 totals 단언 갱신), `WorkforceLinkService.test`(KEEP·ZERO·실패 0, 기존 shape 단언 갱신), `WorklogCertRepository.test`(SQL 조건·바인딩).
- 결과: **`npm test -- --runInBand` 125 suites / 1,823 tests 통과**(감사 작업 포함 트리 기준), **`forge lint` No issues found**. `static/ui`·`locales` 무변경.

수정 파일: `src/resolver/worklogCert/WorklogCertService.js` · `src/resolver/worklogCert/WorklogCertRepository.js` · `src/resolver/workforce/WorkforceLinkService.js` · `src/resolver/worklogCert/__test__/{WorklogCertService,WorklogCertRepository}.test.js` · `src/resolver/workforce/__test__/WorkforceLinkService.test.js`

---

## 3회차 (2026-10-10) — 통합 검증(03_verify_report) 백엔드 몫 3건

| # | 지적 | 조치 |
|---|---|---|
| 1 | INSERT 경합 경로 테스트 없음 | `WorklogCertService.test` 에 재현 추가 — 다른 묶음이 먼저 넣어 `INSERT IGNORE` 가 무시되면 재조회해 같은 값은 `unchanged:true`(상대 묶음 유지), 다른 지문은 `RECERTIFY`(상대 판을 log `(worklog_id,1)` 로 보관, CAS 로 cert_rev 2). 코드 변경 없음(경로는 1회차부터 있었다) |
| 2 | 인덱스 마이그레이션(U6) 뒤에 감사 칼럼이 붙어 함께 막힘 | **재정렬**: `v052_alter_worklog_history_wf_linked`(감사, 옛 v053) → `v053_index_worklog_mirror_author_started`(인증, 옛 v052) → v054~v056 감사 인덱스. 칼럼·테이블이 전부 인덱스보다 앞. `LATEST_MIGRATION`/`schema:version` 은 `v056_index_approval_event_delegate` 그대로. 첫 프로덕션 배포 전이라 이름 변경 허용. `migrate.js` 주석, `migrate.test`(이름 목록·v052 칼럼 단언), `worklogCert.sql.js`·`audit.sql.js`·`WorklogHistoryRepository.js`·`WorklogCertService.js` 주석의 번호, `WorklogHistoryRepository.test` describe 이름 갱신. 감사 보고서(`_workspace/audit-trail/02_backend_report.md`) 끝에 번호 변경 한 줄 |
| 3 | V1 읽기·쓰기 대칭(불변식 7) | `certifyFor` 가 asUser `worklog/list` 결과의 이슈들을 **`filterVisibleIssues` 1회**(목록의 삭제 행 거름과 같은 함수)로 다시 거른다. 열람 불가 → 건별 `WORKLOG_NOT_FOUND`, 판정 실패 → 전부 숨김(fail-close). `certifyWorklogs`·`certifyOwnWorklogs` 가 같은 `certifyFor` 를 타므로 본인 경로도 같다(테스트로 확인). Jira 호출 +1(permissions/check, 100 이슈/호출 — 200건 묶음이면 최대 2) + bulkfetch 메타(기존 함수가 함께 부름) |

- 응답 shape 변화 없음. 새 에러 코드 없음.
- U3 은 여전히 미검증이지만, 이제 `worklog/list` 가 열람 불가 워크로그를 섞어 줘도 쓰기는 막힌다(설계 U3 의 "실패 시 대안"을 선제 적용).
- 테스트 +4(경합 1, 대칭 2, 본인 경로 1). **`npm test -- --runInBand` 125 suites / 1,827 tests 통과, `forge lint` No issues found.** `static/ui`·`locales` 무변경.

수정 파일: `src/resolver/worklogCert/WorklogCertService.js` · `src/rdb/schema/migrate.js` · `src/rdb/schema/__test__/migrate.test.js` · `src/rdb/schema/ddl/worklogCert.sql.js` · `src/rdb/schema/ddl/audit.sql.js`(주석) · `src/resolver/worklogHistory/WorklogHistoryRepository.js`(주석) · `src/resolver/worklogHistory/__test__/WorklogHistoryRepository.test.js`(describe 이름) · `src/resolver/worklogCert/__test__/WorklogCertService.test.js` · `_workspace/audit-trail/02_backend_report.md`(한 줄)
