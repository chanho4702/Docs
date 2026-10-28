# worklog-history 설계서 — 워크로그 변경 이력 감사

> 작성: feature-architect · 2026-10-04 · autopilot 무인 회차(Phase 2)
> 입력: `00_input/requirement.md`. 재사용 기반: 실제 코드(`src/trigger/{onWorklogChanged,runTimesheetSweep}.js`, `src/resolver/timesheet/{TimesheetDriftService,WorklogCollector,TimesheetAccess,TeamScope,TimesheetService}.js`,
> `src/resolver/worklog/{WorklogService,WorklogGateway}.js`, `src/resolver/retention/*`, `src/resolver/settings/{SettingsRepository,SettingsService}.js`, `src/domain/timesheet/{snapshot,worklogInput}.js`, `src/permission/*`)
> + 선례 설계서 `_workspace/{timesheet-approval,period-lock,transition-approval}/01_architect_design.md`.
> 기준선: 백엔드 64 suites / 866 tests, UI 27 suites / 203 tests. 최신 마이그레이션 `v030_create_transition_request_table` → **이번 기능은 v031·v032**.
> 플랫폼 근거 등급: **문서**(공식 문서 확인, 실측 전) / **미검증**(추정 — `04_spike_todo.md` H 번호).

## 열린 질문

QUESTIONS.md 의 Q68·Q69(이미 등록)와 새 Q70~Q77. 답이 없으면 **기본 가정**으로 구현한다. "제품" 표시는 사람이 정해야 하는 제품·보안 결정이다.

| # | 구분 | 질문 | 선택지 | 기본 가정(이 설계) | 권장·근거 |
|---|---|---|---|---|---|
| Q68 | 제품 | 설명(comment) 원문 보관 | (a) 지문+앞부분 (b) 원문 전체 | **(a)** 지문(64비트 해시 11자) + 앞 40자. 정책 `worklogHistoryKeepComment`(기본 false)를 켜면 원문(최대 4,000자)도 남긴다 | (a). 원문은 Jira 에 남아 있다. 켜면 200명 연 +약 60MB(§9.1) |
| Q69 | 제품 | 보관 기간 | 3/6/12/24/36개월/무기한 | **12개월**(정책 `worklogHistoryRetentionMonths`, 선택지 `[0,3,6,12,24,36]`, 0=무기한). 기간 지난 이력은 엑셀 내보내기 확정 뒤에만 삭제(기존 결재 기록 보관과 같은 흐름) | 12. 용량 목표(연 150MB)가 12개월 정상 상태 기준이다 |
| Q70 | 제품 | 수집 범위 기본값 | (a) 전역 스위치만 (b) 전역 스위치 + 프로젝트 사용 여부 | **(b)**. 전역 `worklogHistoryEnabled`(기본 **true**) + 프로젝트 사용 여부는 Q58 과 같은 규칙(`isProjectEnabled`: 적용 프로젝트를 한 번도 고르지 않았으면 전체, 고른 뒤엔 켠 프로젝트만) | (b). 감사 기록은 "켜 두었는데 안 남았다"가 가장 큰 사고다. 기본 켬 + 프로젝트 고름이 기존 사용 여부와 한 규칙 |
| Q71 | 제품·보안 | 제한 공개(visibility 그룹·역할) 워크로그의 설명 | (a) 작성자만 설명 표시 (b) 열람 가능자 모두 (c) 행 자체 숨김 | **(a)** 작성자가 아니면 설명 앞부분·원문을 가린다(`masked:true`). 시간·종류·행위자는 보인다(타임시트 상세가 이미 초를 보여 주는 것과 같은 수준) | (a). 그룹 소속 확인은 사람마다 Jira 호출이 필요해 목록에서 못 한다. 작업 로그 탭에서는 asUser 목록에 나온 워크로그만 펼치므로 가릴 필요가 없지만, 경로마다 규칙이 다르면 검증이 어려워 **모든 경로 같은 규칙** |
| Q72 | **보안(사람 확인 필요)** | asApp 으로 읽은 워크로그 값을 이력으로 저장해 사용자에게 보여 줘도 되는가 + 이슈의 프로젝트 id 를 asApp 으로 읽어도 되는가 | (a) 허용 — 보여 줄 때 조회자 asUser 이슈 열람 권한으로 다시 좁히고 Q71 로 가린다 (b) 금지 — 트리거·스윕은 "변경 있음"만 기록, 값은 asUser 화면에서만 | **(a)**. `AGENTS.md` asApp 허용 1번 문구를 확장한다(§6.3 문안). 구현 회차가 AGENTS.md 를 고친다 | (a). (b)면 Jira 화면·REST·자동화 경로의 변경 내용이 비어 감사 목적(무엇이 어떻게)을 못 채운다. 위험은 "이슈를 못 보는 사람에게 보인다"인데 모든 조회 경로가 `permissions/check` 로 다시 좁힌다(불변식 7) |
| Q73 | 제품 | 보관 정리 내보내기에서 조회자가 열람할 수 없는 이슈의 행 | (a) 행은 넣되 이슈 키·제목·설명을 가림 (b) 빼고, 빠진 게 있으면 삭제 차단 (c) 가리지 않음(기존 결재 기록 내보내기 선례) | **(a)**. 화면 목록(타임시트 상세·감사 검색)은 **행을 뺀다**(불변식 7). 보관 내보내기만 "내보낸 것만 지운다"를 지키려고 행을 넣고 가린다(이슈 id·사람·시각·시간은 남는다) | (a). (b)는 모든 프로젝트를 볼 수 있는 관리자가 없으면 영원히 못 지운다. (c)는 불변식 7 위반 |
| Q74 | 제품 | 설치·켜기 이전부터 있던 워크로그의 기준선 일괄 수집(backfill) | (a) 안 함 — 처음 바뀔 때 "기준선 관측" (b) 켤 때 최근 N개월 일괄 수집 | **(a)** | (a). (b)는 asApp 으로 사이트 전체 워크로그를 읽고 미러 행이 한꺼번에 늘어난다(24만 행·약 40MB). 단점: 한 번도 안 본 워크로그가 **삭제**되면 기록이 남지 않는다(한계 L2) |
| Q75 | 제품 | 작업 로그 탭의 "이력 N회" 숫자 | (a) 수정(UPDATED) 횟수 (b) 생성·삭제·기준선 포함 전체 행 수 | **(a)** "수정 N회", 0이면 링크만("이력"). 펼친 목록은 전체 행 | (a). 고객 문구가 "몇 번 수정했는지" |
| Q76 | 제품 | 본인·팀장용 검색 화면(업무함 사이드바 "워크로그 이력") | (a) 없음 — 탭·타임시트 상세로만 (b) 추가 | **(a)** 이번 범위 밖 | (a). 요구 화면은 3곳. 검색 resolver 는 관리자 전용으로 시작해 형제 범위를 단순하게 둔다 |
| Q77 | 제품 | 내보내기 없이 기간 지난 이력을 자동 삭제 | (a) 안 함(기존 흐름) (b) 스윕이 자동 삭제 | **(a)**. 사용량 게이지(데이터 관리)에 테이블 크기가 그대로 보인다 | (a). 감사 기록의 자동 삭제는 고객 승인 없이 하지 않는다. 단, 관리자가 내보내지 않으면 무한히 쌓인다 — 데이터 관리 화면에 "기간 지난 이력 N건" 경고 |

## 1. 개요·영향 범위

워크로그 생성·수정·삭제마다 **누가 / 언제 / 무엇이 어떻게(이전 → 이후)** 를 append-only 로 남기고 워크로그별 수정 횟수를 보여 준다.
원천은 세 경로다. **같은 변경을 두 번 기록하지 않는 장치는 "미러 CAS + (worklog_id, seq) 기본키"** 하나다(§4.3).

| 출처 `source` | 경로 | 행위자 | 이전 값 | 변경 시각 |
|---|---|---|---|---|
| `APP` | 우리 화면 쓰기(`WorklogService.create/update/deleteWorklog`, asUser) | 호출한 사용자(principal) — 확실 | 쓰기 직전 asUser 로 읽은 값(`loadOwn`) — 확실 | 서버 `now` |
| `JIRA` | `avi:jira:*:worklog` 트리거(Jira 화면·REST·자동화·모바일) | 워크로그 `updateAuthor`(생성은 `author`). 삭제는 이벤트 페이로드의 사용자 — 미검증 H1, 없으면 `null`("알 수 없음") | 미러 | 워크로그 `updated`(삭제는 이벤트 수신 시각) |
| `SWEEP` | 누락 보정 스윕(`worklog/updated`·`deleted` since) + APP 경로가 미러와 다른 "직전 값"을 발견한 경우 | `updateAuthor`(마지막 수정자) / 삭제는 `null` | 미러 | `updated` / 피드의 `updatedTime` |

`SWEEP` 는 화면에 **"보정 감지(중간 변경 누락 가능)"** 로 표시한다 — 이벤트 사이의 중간 수정은 복구할 수 없다는 사실을 숨기지 않는다.

| 영역 | 변경 |
|---|---|
| 도메인(순수) | 신규 `src/domain/timesheet/worklogHistory.js`(상태 정규화·설명 지문·차이 비트·관측 계획·미러 재구성·가림·월 cutoff·이벤트 파싱). `snapshot.js`·`worklogInput.js`(`adfToPlainText`·`parseJiraDateTime`) 재사용, **무변경**. 승인 엔진(`src/domain/approval/**`) **무변경** |
| resolver | 신규 7: `getWorklogHistory`·`getTimesheetWorklogHistory`·`listWorklogHistory`·`getWorklogHistoryRetention`·`exportExpiredWorklogHistory`·`confirmWorklogHistoryExport`·`purgeExportedWorklogHistory`. 변경 6: `getIssueWorklogs`(필드 추가), `createWorklog`·`updateWorklog`·`deleteWorklog`(APP 기록 — 응답 무변경), `getApprovalSettings`·`saveApprovalSettings`(정책 키 3) |
| 서비스 | 신규 `src/resolver/worklogHistory/{WorklogHistoryController,WorklogHistoryService,WorklogHistoryRecorder,WorklogHistoryRepository,WorklogHistoryRetentionService,JobLease}.js`. 변경 `WorklogService`(APP 기록 훅·탭 카운트), `WorklogCollector.currentOf`(필드 추가), `TimesheetDriftService.handleEvent`(선택 인자 `prefetched`), `SettingsRepository`(정책 키 3 + `getProjectStateDetails`), `SettingsService`(검증 3 + 켜짐 시각 훅), `index.js`(등록·트리거 export), `PermissionMap`(7) |
| 트리거·스윕 | `onWorklogChanged`: 이벤트 파싱 1회 + asApp 조회 1회를 두 서비스가 공유. 신규 `runWorklogHistorySweep`(시간당, 별도 예산 20초 — 기존 `timesheet-sweep` 와 한 실행에 넣으면 25초 한도를 넘는다) |
| 스키마 | `v031_create_worklog_history_table`, `v032_create_worklog_mirror_table` |
| manifest | `scheduledTrigger` 1(`worklog-history-sweep`) + `function` 1. scope 추가 없음(`read:jira-work` 로 덮임 — 미검증 H3) |
| 프론트 | 엔트리 추가 없음. `worklog`(탭 "수정 N회" + 펼침 목록), `modal`(타임시트 상세 이력 섹션), `settings`(새 탭 "워크로그 이력" 감사 검색 + 엑셀, 데이터 관리 "워크로그 이력 보관" 섹션, 타임시트 정책 스위치 2) |
| i18n | 신규 `locales/{kr,en}/worklogHistory.json`, `data.json`·`policy.json` 추가 키. 새 에러 코드 없음 |
| 워크포스 연동 | 없음(요구: 워크포스 리포 무변경, 승인 앱 DB 에만 쌓는다). 엔티티 프로퍼티 미사용(불변식 9) |

### 1.1 미러는 타임시트 스냅샷과 합칠 수 있는가 — **합치지 않는다**

| 비교 | `timesheet_submission.snapshot_blob`(ts1z) | 필요한 미러 |
|---|---|---|
| 대상 | **제출된** 기간의 워크로그만 | 수집 범위 프로젝트의 **모든** 워크로그 |
| 성격 | 제출 시점 고정(승인한 내용 — 바뀌면 안 된다). 지문 `ts1` 은 워크포스 계약이라 형식 고정 | "마지막으로 본 상태" — 변경마다 덮어쓴다 |
| 필드 | id·이슈·시작·초 | + 작성자·설명 지문·공개 범위 지문·프로젝트·삭제 여부·마지막 seq |
| 조회 | 요청 행 하나의 압축 JSON — 워크로그 하나를 찾으려면 blob 을 풀어야 한다 | 워크로그 id 기본키 조회 |

스냅샷을 가변 미러로 쓰면 "승인한 내용"이 사라지고, 미러를 스냅샷에 넣으면 미제출 기간의 변경을 잃는다. `timesheet_worklog_ref`(워크로그→최신 요청)는 역할이 다르다(요청 연결).
후속 개선 여지(이번 범위 밖): 미러가 쌓이면 period-lock 한계 L1(미제출 마감 기간의 삭제는 기간을 모른다)을 미러의 `started` 로 풀 수 있다.

### 1.2 전체 흐름

```
우리 화면 쓰기(asUser) ── Jira 쓰기 성공 ─→ Recorder.recordAppWrite(knownBefore=loadOwn 값, after=Jira 응답) ── source APP
                                              (실패해도 사용자 쓰기는 성공으로 응답 — 트리거가 JIRA 로 메운다)
avi:jira:*:worklog ─→ onWorklogChanged ─ parseWorklogEvent(1회) ─ asApp worklog/list(1회, 공유)
                                        ├→ TimesheetDriftService.handleEvent(event, {prefetched})   (기존)
                                        └→ Recorder.handleEvent(parsed, {prefetched})               source JIRA
worklog-history-sweep(시간당) ─ worklog/deleted·updated since(전용 커서) ─ asApp worklog/list ─→ Recorder.observe  source SWEEP

Recorder.observe(변경) : 수집 범위(전역 스위치·프로젝트) → 미러 조회 → planObservation(순수) → 이력 INSERT IGNORE(PK worklog_id,seq)
                        → 실제 저장된 행 재조회(경합 시 이긴 행을 채택) → 미러 CAS(rev = rev + 1) → 실패면 최대 3회 다시
```

## 2. 경계면 계약

모든 응답은 기존 규약 그대로 `{ success:true, content:<아래> }` / `{ success:false, error:{name,code,message,cause} }`. **아래 shape 은 전부 `res.content`.** 시각은 epoch ms(number), 시간 양은 초(number).

### 2.1 신규 resolver

| resolver | 권한 축 | 입력(payload) | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getWorklogHistory` | `{issue:'view', issueIdKey:'issueId', appAccess:false}` | `{ issueId: string(숫자), worklogId: string(숫자) }` | `WorklogHistoryView` (§2.3) | `PERMISSION_ISSUE_VIEW_DENIED`(가드), `WORKLOG_NOT_FOUND`(id 형식·이 이슈의 이력 아님), `PERMISSION_TARGET_VIEW_DENIED`(본인·팀장·관리자 아님) | `worklog` 엔트리 탭(`WorklogTab` 행 펼침 → `WorklogHistoryList`) |
| `getTimesheetWorklogHistory` | `'SELF'` | `{ requestId: string(uuid) }` | `TimesheetHistoryView` (§2.4) | `INVALID_TARGET`(requestId 없음·TIMESHEET 아님), `REQUEST_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED`(`TimesheetAccess.canView` 거짓) | `modal` 엔트리 승인 상세(`ApprovalDetail` → `TimesheetHistorySection`) |
| `listWorklogHistory` | `{admin:true}` | `{ from: number, to: number (to-from ≤ 366일), accountId?: string, projectId?: string(숫자), kinds?: Kind[], sources?: Source[], cursor?: string, limit?: int 1..200 (기본 50) }` | `HistoryPage` (§2.5) | `INVALID_TARGET`(cause `{field}` — 범위·형식·limit·cursor) | 설정 > 워크로그 이력(`WorklogHistoryAuditSettings`) + 엑셀(`exportWorklogHistoryExcel`) |
| `getWorklogHistoryRetention` | `{admin:true}` | `{}` | `HistoryRetentionView` (§2.6) | — | 설정 > 데이터 관리(`WorklogHistoryRetentionSection`) |
| `exportExpiredWorklogHistory` | `{admin:true}` | `{ cutoff?: number, cursor?: string }` | `{ cutoff: number\|null, items: HistoryItem[], users: UserMap, nextCursor: string\|null }` — 열람 불가 이슈 행은 **가린 채 포함**(Q73) | `INVALID_TARGET`(cursor) | 데이터 관리(엑셀 생성) |
| `confirmWorklogHistoryExport` | `{admin:true}` | `{ cutoff: number, count: int }` | `HistoryRetentionView` | `INVALID_TARGET`(cutoff 없음·무기한 정책) | 데이터 관리 |
| `purgeExportedWorklogHistory` | `{admin:true}` | `{}` | `{ deleted: int, mirrorsDeleted: int, remaining: int }` | `RETENTION_EXPORT_REQUIRED`, `STORAGE_NOT_READY` | 데이터 관리 |

권한 축 결정 근거:
- `getWorklogHistory` 는 탭(`getIssueWorklogs`)과 같은 축·같은 `appAccess:false`(Q22 — 탭 사용자가 명부 미등록자일 수 있다). 이슈 열람은 가드가, **누구의 이력인지는 서비스가** 본다: 조회자 = 작성자, 또는 `TimesheetAccess.canView(principal, {accountId: 작성자})`(본인·**현재** 팀장 — 타임시트와 같은 공용 함수), 또는 앱 관리자(`resolveAdminPrincipal(...).isAdmin`). 가드는 payload `issueId` 만 보므로 **이력 행의 `issue_id` 가 payload 와 같은지** 확인해 다른 이슈의 worklogId 를 섞는 우회를 막는다(`WorklogService.loadOwn` 과 같은 방어).
- `getTimesheetWorklogHistory` 는 `getTimesheetDetail` 과 같은 `SELF` + `TimesheetAccess.canView(principal, target, state)`. 상세를 볼 수 있는 사람(대상자·참여자·위임받은 사람·현재 팀장)이 그 기간 이력도 본다.
- 감사 검색·보관 4종은 `{admin:true}`. 팀장·본인용 검색은 Q76 으로 범위 밖.
- **이력 수정·삭제 resolver 는 없다.** 예외는 보관 정리 `purgeExportedWorklogHistory` 하나(내보내기 확정 범위 안만 지운다). 계약 테스트로 단언(§4.10).

### 2.2 변경 resolver (추가 필드만, 기존 필드 무변경)

| resolver | 추가 |
|---|---|
| `getIssueWorklogs` | 최상위 `history: { enabled: boolean, since: number\|null }` (`since` = 수집 시작 시각, 미준비·꺼짐이면 `enabled:false`). `worklogs[].history: WorklogHistoryCount \| null` — 조회자가 그 워크로그의 이력을 볼 수 없거나 꺼짐·미준비면 `null` |
| `createWorklog`·`updateWorklog`·`deleteWorklog` | **응답 무변경.** 쓰기 성공 뒤 `Recorder.recordAppWrite` 를 부른다(던지지 않는다 — 실패해도 응답은 성공) |
| `getApprovalSettings`·`saveApprovalSettings` | 정책 키 `worklogHistoryEnabled`(boolean, 기본 true), `worklogHistoryKeepComment`(boolean, 기본 false), `worklogHistoryRetentionMonths`(enum `[0,3,6,12,24,36]`, 기본 12). 셋 다 `GLOBAL_ONLY_KEYS`. 검증 실패 `INVALID_TARGET` |
| `listSettingsAudit` | shape 무변경. `area:'retention'` 에 새 `action: 'historyExport' \| 'historyPurge'`, `detail: { cutoff, count }` / `{ cutoff, deleted, remaining }` |

```js
// WorklogHistoryCount
{ changeCount: 2,          // kind=UPDATED 행 수(Q75)
  entryCount: 3,           // 전체 행 수(생성·기준선·수정)
  lastChangedAt: 1696000000000 }
```

### 2.3 `WorklogHistoryView` / `HistoryItem`

```js
// WorklogHistoryView — getWorklogHistory
{
  issueId: '10002',
  worklogId: '10234',
  authorAccountId: '5b10…',
  enabled: true,                 // 수집 스위치(정책) — 꺼져 있어도 남아 있는 행은 보여 준다
  since: 1696000000000 | null,   // 수집 시작 시각("이 시각 이후만 기록" 안내)
  items: HistoryItem[],          // seq 내림차순(최신 먼저), 최대 200
  truncated: false,
  users: UserMap,                // { [accountId]: { displayName, avatarUrl } } — 작성자·행위자
}

// HistoryItem — 모든 목록 resolver 공통
{
  historyId: '10234:3',          // `${worklogId}:${seq}` — 결정적 키(PK 그대로)
  worklogId: '10234',
  seq: 3,
  issueId: '10002',
  projectId: '10000' | null,
  issue: { visible: true, issueKey: 'OPS-12' | null, summary: '…' | null, projectKey: 'OPS' | null } | null,
                                 // 탭(getWorklogHistory)은 null(이미 이슈 화면). 목록은 조회자 기준 메타.
                                 // visible=false 는 보관 내보내기에서만 나온다(Q73) — 화면 목록은 행을 뺀다
  authorAccountId: '5b10…',
  actorAccountId: '5b10…' | null,  // null = 알 수 없음
  source: 'APP' | 'JIRA' | 'SWEEP',
  kind: 'CREATED' | 'UPDATED' | 'DELETED' | 'BASELINE',
  changed: { started: boolean, seconds: boolean, comment: boolean, visibility: boolean },
  before: HistoryValues | null,  // CREATED·BASELINE 은 null
  after: HistoryValues | null,   // DELETED 는 null
  restricted: boolean,           // 제한 공개 워크로그(앞뒤 어느 쪽이든)
  changedAt: number,
  observedAt: number,
  gapPossible: boolean,          // source==='SWEEP'
  // getTimesheetWorklogHistory 만:
  afterSubmission?: boolean,     // changedAt > 제출 시각
  afterApproval?: boolean,       // 승인 완료 후 변경
}

// HistoryValues
{
  started: number | null,
  seconds: number | null,
  comment: CommentView | null,   // 이 행에 설명이 실리지 않았으면 null(UPDATED 이고 설명이 안 바뀐 경우)
}

// CommentView
{
  empty: boolean,                // 설명 없음
  head: string | null,           // 앞 40자(가렸으면 null)
  headTruncated: boolean,
  full: string | null,           // 정책 keepComment 로 저장된 원문(가렸거나 저장 안 했으면 null)
  fingerprint: string,           // 11자 — 같은/다른 내용 비교용
  masked: boolean,               // Q71 제한 공개 & 조회자≠작성자, 또는 Q73 열람 불가 이슈(보관 내보내기)
}
```

### 2.4 `TimesheetHistoryView`

```js
{
  requestId: 'uuid',
  subjectAccountId: '5b10…',
  periodKey: '2026-09',
  period: { start, end },        // 제출 시점 고정 경계(timesheet_submission)
  submittedAt: number,           // timesheet_submission.created_at
  approvedAt: number | null,     // status=APPROVED 일 때 마지막 APPROVE 결정 시각
  items: HistoryItem[],          // 작성자=대상자 AND (이전 또는 이후 시작 시각이 기간 안), changedAt 내림차순, 최대 500
  hiddenCount: number,           // 조회자가 열람할 수 없는 이슈라 뺀 행 수
  truncated: boolean,
  afterApprovalCount: number,    // items 중 afterApproval
  users: UserMap,
}
```

### 2.5 `HistoryPage` (감사 검색)

```js
{
  items: HistoryItem[],          // changedAt 내림차순 → worklogId → seq
  hiddenCount: number,           // 이 페이지에서 열람 불가 이슈라 뺀 행 수
  nextCursor: string | null,     // SQL 페이지가 꽉 찼으면 다음 커서(뺀 행 때문에 items 가 limit 보다 적어도 계속 있음)
  users: UserMap,
}
```
엑셀: 프론트가 `limit:200` 으로 반복 호출, **최대 10,000행**에서 멈추고 "잘림" 표시(`exportCapped`). 뺀 행 수 합계를 시트 머리에 적는다.

### 2.6 `HistoryRetentionView`

```js
{
  months: 12,
  monthOptions: [0, 3, 6, 12, 24, 36],
  cutoff: number | null,         // 0(무기한)이면 null
  expiredCount: number,
  oldestChangedAt: number | null,
  purgeableCount: number,        // 마지막 확정 내보내기 cutoff 이전 행 수
  lastExport: { cutoff, at, count, by } | null,
}
```
보관 기간 값은 `saveApprovalSettings({ worklogHistoryRetentionMonths })` 로 바꾼다(설정 감사가 이미 남는다 — 별도 setter 를 두지 않는다).

### 2.7 에러 코드

새 코드 없음. 재사용: `INVALID_TARGET`(cause `{field}`), `WORKLOG_NOT_FOUND`, `PERMISSION_TARGET_VIEW_DENIED`, `REQUEST_NOT_FOUND`, `RETENTION_EXPORT_REQUIRED`, `STORAGE_NOT_READY`.
테이블 미준비는 조회 resolver 에서 **에러가 아니라 빈 결과**(`items:[]`, `enabled:false`)다 — 배포 직후 탭이 깨지지 않게. 쓰기(purge)만 `STORAGE_NOT_READY`.

### 2.8 프론트 호출 대응

| 화면 | 호출 | 쿼리키 | 무효화 |
|---|---|---|---|
| `WorklogTab` 행 | `getIssueWorklogs`(기존, `history` 필드 소비) | `worklogKeys.issue(issueId)` | 쓰기·삭제 후 기존대로 `worklogKeys.all` + **`worklogHistoryKeys.all`** |
| `WorklogHistoryList`(펼침) | `getWorklogHistory` | `worklogHistoryKeys.worklog(issueId, worklogId)` | 위와 같음 |
| `TimesheetHistorySection` | `getTimesheetWorklogHistory` | `worklogHistoryKeys.timesheet(requestId)` | 결정·제출 시 `timesheetKeys.all` 와 함께 |
| `WorklogHistoryAuditSettings` | `listWorklogHistory`(useInfiniteQuery) | `worklogHistoryKeys.audit(filters)` | 없음(읽기 전용) |
| `WorklogHistoryRetentionSection` | `getWorklogHistoryRetention` / export / confirm / purge / `saveApprovalSettings` | `settingsKeys.worklogHistoryRetention()` | 확정·삭제·기간 변경 후 그 키 + `settingsKeys.storage`(기존 사용량 키) |

## 3. 도메인 (순수 — `Date.now()`·무인자 `new Date()` 금지. 시각·정책·수집 시작 시각은 인자)

### 3.1 `src/domain/timesheet/worklogHistory.js`

```js
export const HistorySource = Object.freeze({ APP: 'APP', JIRA: 'JIRA', SWEEP: 'SWEEP' });
export const HistoryKind = Object.freeze({ CREATED: 'CREATED', UPDATED: 'UPDATED', DELETED: 'DELETED', BASELINE: 'BASELINE' });
export const ChangeBit = Object.freeze({ STARTED: 1, SECONDS: 2, COMMENT: 4, VISIBILITY: 8 });
export const COMMENT_HEAD_CHARS = 40;
export const COMMENT_FULL_MAX = 4000;
export const RETENTION_MONTH_OPTIONS = Object.freeze([0, 3, 6, 12, 24, 36]);
export const ACTOR_SAME_AS_AUTHOR = '=';   // 저장 표식(용량 — §5.1). Repository 가 풀어서 내보낸다
```

| 함수 | 입력 → 출력 | 규칙 |
|---|---|---|
| `worklogStateOf(raw)` | Jira 워크로그(asApp list·asUser GET·POST/PUT 응답) 또는 `WorklogCollector` current → `WorklogState \| null` | `{worklogId, issueId, authorId, updateAuthorId, started, seconds, commentText, visibilityKey, created, updated}`. id·issueId 숫자 아니면 null. `commentText` 는 `adfToPlainText`(이미 평문이면 그대로). `visibilityKey` = `${type}:${value ?? identifier}` 또는 null |
| `commentDigest(text, { keepFull })` | → `{ fp, head, headTruncated, full }` | 정규화: NFC, CRLF→LF, 앞뒤 공백 제거. 빈 문자열 → `fp:''`, head null. `fp` = sha256(정규화 텍스트) 앞 8바이트 base64url(11자). `head` = 앞 40 **코드포인트**(서로게이트 쌍 안 자름). `full` 은 keepFull 일 때만, 4,000자에서 자름 |
| `visibilityFp(key)` | → `string \| null` | null 이면 null, 아니면 같은 해시 11자(그룹 이름을 DB 에 남기지 않는다) |
| `diffMask(base, state)` | Mirror·State 비교 → 정수 | started·seconds·comment fp·visibility fp 를 비교해 비트 OR. `updated` 시각만 바뀐 경우 0 |
| `planObservation(input)` | §3.2 → `{ rows: HistoryRow[], next: Mirror \| null, outcome }` | 결정 표 §3.2. **같은 입력 → 같은 출력**(결정적) |
| `applyRow(mirror, row)` | Mirror(또는 null)+행 → Mirror | 경합에서 진 쪽이 **저장된 행**으로 미러를 재구성할 때 쓴다(§4.3) |
| `historyIdOf(worklogId, seq)` / `parseHistoryId(s)` | ↔ `'10234:3'` | 형식 밖이면 null |
| `encodeCursor({changedAt, worklogId, seq})` / `decodeCursor(s)` | ↔ `'<ms>|<id>|<seq>'` | 형식 밖이면 null → 서비스가 `INVALID_TARGET` |
| `maskForViewer(item, { viewerId, issueVisible })` | HistoryItem → HistoryItem | `restricted && viewerId !== author` → before/after comment 의 head·full 을 null, `masked:true`. `issueVisible === false` → issue 메타 null + comment 가림(보관 내보내기 전용) |
| `monthsCutoff(months, now)` | → `number \| null` | 0 이면 null. UTC 달력 월 빼기, 말일은 그 달 말일로 맞춤(3/31 − 1개월 = 2/28·29) |
| `parseWorklogEvent(event)` | 트리거 이벤트 → `{ worklogId, kind: 'created'\|'updated'\|'deleted'\|null, actorId, issueId }` | id 는 `event.worklog.id ?? event.worklogId`(기존 `handleEvent` 와 같은 규칙). actor 후보 `event.atlassianId ?? event.user?.accountId ?? event.worklog?.updateAuthor?.accountId`(H1) — 형식 밖이면 null |
| `isAfterApproval(changedAt, approvedAt)` / `inPeriod(row, range)` | 표시 플래그 | 경계: `changedAt > approvedAt`, 기간 `[start, end)` |

```js
// WorklogState
{ worklogId, issueId, authorId, updateAuthorId, started, seconds, commentText, visibilityKey, created, updated }
// Mirror (worklog_mirror 한 행)
{ worklogId, issueId, projectId, authorId, started, seconds, commentFp, visibilityFp, deleted, lastSeq, lastChangedAt, rev }
// HistoryRow (worklog_history 한 행 — 저장 형태)
{ worklogId, seq, issueId, projectId, authorId, actorId /* '=' | id | null */, source, kind, changedMask, restricted,
  beforeStarted, afterStarted, beforeSeconds, afterSeconds,
  beforeCommentFp, afterCommentFp, beforeCommentHead, afterCommentHead, beforeCommentFull, afterCommentFull,
  afterVisibilityFp, changedAt, observedAt }
```

### 3.2 `planObservation` 결정 표

입력: `{ mirror, current, deleted, knownBefore, source, eventKind, actorId, projectId, changedAt, now, collectionStartedAt, staleBefore, keepComment, previousComment }`
- `current`: WorklogState 또는 null. `deleted:true` 는 "삭제 확인"(삭제 이벤트·삭제 피드·APP 삭제). `current:null && !deleted` = **읽지 못함 → 아무것도 안 한다**(삭제로 추정하지 않는다 — 삭제 피드가 알려 준다).
- `knownBefore`: APP 경로에서만, 쓰기 직전 asUser 로 읽은 State.
- `previousComment`: `{head, full}` — 설명이 바뀐 행·삭제 행의 이전 앞부분. 서비스가 직전 설명 실린 행에서 읽어 넘긴다(미러는 지문만 가진다 — 용량 §9.1).
- `staleBefore`: 마지막 (재)켜짐 시각(전역 스위치·프로젝트 사용 여부 중 늦은 것). 미러의 `lastChangedAt < staleBefore` 이면 그 사이 꺼져 있던 동안의 변경이 섞였을 수 있다 → **JIRA 를 SWEEP 으로 낮춘다**(표시 "중간 변경 누락 가능").
- seq = `(mirror?.lastSeq ?? 0) + 1`, 행이 둘이면 +1, +2.

| # | 미러 | 입력 | 결과 행 | 다음 미러 | outcome |
|---|---|---|---|---|---|
| 1 | 삭제 표식 | 무엇이든 | 없음 | 그대로 | `none`(id 는 재사용되지 않는다) |
| 2 | 있음 | `deleted` | DELETED(before=미러+previousComment, actor=actorId) | 삭제 표식 | `recorded` |
| 3 | 없음 | `deleted`, knownBefore 있음(APP) | DELETED(before=knownBefore) seq 1 | 삭제 표식 | `recorded` |
| 4 | 없음 | `deleted`, knownBefore 없음 | 없음 | 없음 | `unknown-deleted`(한계 L2) |
| 5 | 무엇이든 | `current:null`, `!deleted` | 없음 | 그대로 | `unreadable` |
| 6 | 없음 | current, APP 생성(`eventKind:'created'`) | CREATED(actor=principal, changedAt=now) | after | `recorded` |
| 7 | 없음 | current, APP 수정(knownBefore 있음) | UPDATED(before=knownBefore, after=current, APP) | after | `recorded` |
| 8 | 없음 | current, JIRA `created` 이벤트 | CREATED(actor=author, changedAt=current.created ?? now) | after | `recorded` |
| 9 | 없음 | current, SWEEP, `created ≥ collectionStartedAt` 이고 `created === updated` | CREATED(SWEEP) | after | `recorded` |
| 10 | 없음 | 그 밖(설치·켜기 전 생성, 생성 이벤트를 놓치고 이미 수정됨) | BASELINE(before 없음, actor null, changedAt=current.updated ?? now) | after | `recorded` |
| 11 | 있음 | current, APP(knownBefore 있음) | ① `diffMask(미러, knownBefore)≠0` 이면 SWEEP 보정 행(미러→knownBefore, actor=knownBefore.updateAuthorId, changedAt=knownBefore.updated) ② `diffMask(knownBefore, current)≠0` 이면 APP 행 | 마지막 행의 after | `recorded` / 둘 다 0이면 `none` |
| 12 | 있음 | current, JIRA·SWEEP | `diffMask(미러, current)≠0` 이면 UPDATED(actor=current.updateAuthorId, changedAt=current.updated ?? now; 미러가 staleBefore 이전이면 source=SWEEP) | after | `recorded` / `none` |

행 내용 규칙(용량 §9.1 — 바뀐 것만 싣는다):
- `before_started/seconds`: UPDATED·DELETED. `after_started/seconds`: CREATED·BASELINE·UPDATED.
- 설명: CREATED·BASELINE 은 after 만, UPDATED 는 COMMENT 비트일 때만 before·after, DELETED 는 before 만. 원문(`*_comment_full`)은 `keepComment` 일 때 같은 자리.
- `after_visibility_fp`: after 쪽이 제한 공개일 때만(경합 재구성용). `restricted` = 앞 또는 뒤가 제한 공개.
- `actor`: 작성자와 같으면 `'='`, 모르면 null.

### 3.3 테스트 케이스(`src/domain/timesheet/__test__/worklogHistory.test.js`)

1. 생성 이벤트·미러 없음 → CREATED seq 1, after 전체·설명 지문·앞부분
2. 같은 State 를 두 번 관측 → 두 번째 `none`(**같은 이벤트 2회 → 1행**의 도메인 근거)
3. 초만 변경 → mask 2, before/after seconds, 설명 칸 null
4. 설명 변경 → mask 4, before 앞부분은 `previousComment`, 40자 자름·서로게이트 쌍 보존·`headTruncated`
5. 공백·줄바꿈(CRLF↔LF)만 다른 설명 → `none`
6. 공개 범위 추가 → mask 8, `restricted:true`, `after_visibility_fp`
7. 삭제·미러 있음 → DELETED + 삭제 표식, 다시 삭제 → `none`
8. 삭제·미러 없음(이벤트·스윕) → `unknown-deleted`, APP 삭제(knownBefore) → DELETED seq 1
9. 읽지 못함(`current:null`, `!deleted`) → `unreadable`, 행 없음
10. 스윕·미러 없음: `created ≥ 시작 && created===updated` → CREATED(SWEEP) / 시작 이전 → BASELINE / 시작 이후지만 수정됨 → BASELINE
11. APP 수정·미러가 knownBefore 와 다름 → 2행(SWEEP 보정 + APP), seq r+1·r+2
12. APP 저장했지만 값 동일 → `none`
13. 미러 `lastChangedAt < staleBefore` → JIRA 가 SWEEP 으로
14. `applyRow(mirror, row)` 가 `planObservation().next` 와 같다(모든 kind)
15. 결정성: 같은 입력 두 번 → 깊은 동등. 입력 객체 불변(in-place 변경 없음)
16. `monthsCutoff`: 0 → null, 12 → 1년 전, 3/31 −1 → 2/29(윤년)·2/28
17. `maskForViewer`: 제한+타인 → 가림, 제한+작성자 → 그대로, issueVisible false → 이슈 메타·설명 가림
18. `parseWorklogEvent`: id 위치 두 형태, kind 정규식, actor 후보 순서, 형식 밖 → null
19. `encodeCursor/decodeCursor`·`historyIdOf/parseHistoryId` 왕복과 거부
20. 이 파일에 `Date.now`·무인자 `new Date()` 가 없다(정적 단언 — 기존 도메인 테스트 방식)

## 4. 백엔드

### 4.1 파일 배치

```
src/domain/timesheet/worklogHistory.js                         신규(순수)
src/resolver/worklogHistory/WorklogHistoryRepository.js        신규 — SQL 전부(두 테이블)
src/resolver/worklogHistory/WorklogHistoryRecorder.js          신규 — 쓰기 측(트리거·스윕·APP)
src/resolver/worklogHistory/JobLease.js                        신규 — approval_job_state 리스·커서(§4.5)
src/resolver/worklogHistory/WorklogHistoryService.js           신규 — 조회 측(탭·타임시트·감사 검색)
src/resolver/worklogHistory/WorklogHistoryRetentionService.js  신규 — 보관 정리
src/resolver/worklogHistory/WorklogHistoryController.js        신규 — guardedDefine 7
src/trigger/runWorklogHistorySweep.js                          신규 — 얇은 어댑터
src/trigger/onWorklogChanged.js                                변경 — 파싱·조회 공유, 두 서비스 각각 try/catch
src/resolver/timesheet/TimesheetDriftService.js                변경 — handleEvent(event, { prefetched } = {})
src/resolver/timesheet/WorklogCollector.js                     변경 — currentOf 에 updateAuthorId·commentText·visibilityKey
src/resolver/worklog/WorklogService.js                         변경 — history 주입, 탭 카운트, 쓰기 뒤 recordAppWrite
src/resolver/settings/SettingsRepository.js                    변경 — 정책 키 3(세 곳 동시), getProjectStateDetails
src/resolver/settings/SettingsService.js                       변경 — normalizers 3, 켜짐 시각 훅
src/rdb/schema/ddl/worklogHistory.sql.js · ddl/index.js · migrate.js   v031·v032
src/permission/PermissionMap.js · src/index.js                 등록
manifest.yml                                                   scheduledTrigger·function
AGENTS.md                                                      asApp 허용 1번 문구(§6.3, Q72)
```

### 4.2 Repository (`WorklogHistoryRepository`)

| 메서드 | SQL 요지 |
|---|---|
| `ready()` | `isTableReady('worklog_history') && isTableReady('worklog_mirror')` |
| `findMirrors(ids)` | `SELECT … FROM worklog_mirror WHERE worklog_id IN (…)` — 빈 배열이면 SQL 없이 빈 Map(fail-open 금지) |
| `insertMirror(m)` | `INSERT IGNORE INTO worklog_mirror (…) VALUES (…)` → `rowsAffected === 1` |
| `casMirror(worklogId, rev, next)` | `UPDATE worklog_mirror SET started=?, seconds=?, comment_fp=?, visibility_fp=?, project_id=?, deleted=?, last_seq=?, last_changed_at=?, rev = rev + 1 WHERE worklog_id=? AND rev=?` → `rowsAffected === 1`(불변식 4) |
| `insertHistory(rows)` | `INSERT IGNORE INTO worklog_history (…) VALUES (…),(…)` — 한 문장(행 1~2). **UPDATE 문은 이 테이블에 없다** |
| `findHistoryRows(worklogId, seqs)` | PK 조회 — 경합 시 "실제 저장된 행" 재조회 |
| `findPreviousComment(worklogId, beforeSeq)` | `SELECT after_comment_head, after_comment_full FROM worklog_history WHERE worklog_id=? AND seq<? AND after_comment_fp IS NOT NULL ORDER BY seq DESC LIMIT 1` — 설명 변경·삭제 때만(수정의 약 10%) |
| `countByWorklogIds(ids)` | `SELECT worklog_id, SUM(kind='UPDATED'), COUNT(*), MAX(changed_at) … WHERE worklog_id IN (…) GROUP BY worklog_id` |
| `listByWorklog(worklogId, limit)` | PK 앞부분, `ORDER BY seq DESC LIMIT 201` |
| `listByAuthorPeriod(authorId, start, end, limit)` | `WHERE author_account=? AND ((after_started>=? AND after_started<?) OR (before_started>=? AND before_started<?)) ORDER BY changed_at DESC, worklog_id, seq LIMIT 501` — `ix_wlh_author_changed` 앞부분(작성자당 연 약 1,800행) |
| `search({from,to,authorId,projectId,kinds,sources,cursor,limit})` | `WHERE changed_at >= ? AND changed_at < ?` (+ `author_account=?` 면 작성자 인덱스) (+ project·kind·source 필터) + 키셋 `(changed_at, worklog_id, seq) < (?,?,?)` `ORDER BY changed_at DESC, worklog_id DESC, seq DESC LIMIT n` |
| `countExpired(cutoff)` / `pageExpired(cutoff, cursor, limit)` | `changed_at < ?` 오름차순 키셋 |
| `purgeHistoryBatch(cutoff, n)` | `DELETE FROM worklog_history WHERE changed_at < ? LIMIT n` |
| `purgeMirrorBatch(cutoff, n)` | `DELETE FROM worklog_mirror WHERE last_changed_at < ? AND worklog_id NOT IN (SELECT worklog_id FROM worklog_history WHERE changed_at >= ?) LIMIT n` — **이력이 남은 워크로그의 미러는 지우지 않는다**(지우면 seq 1 이 다시 쓰여 남은 행과 PK 가 겹친다). 이력 배치가 0 이 된 뒤에만 돈다 |

시각 칼럼은 전부 `toSqlTimestamp`/`fromSqlTimestamp`(SqlTime 경계). `started` 는 BIGINT ms(스냅샷과 같은 단위 — 비교에 타임존 변환이 끼지 않게).
`actor_account` 저장 표식 `'='` 은 Repository 가 읽을 때 작성자 id 로 풀어 서비스에는 실제 id 또는 null 만 나간다.

### 4.3 `WorklogHistoryRecorder` — 쓰기 측(멱등·중복 방지의 핵심)

**보장 키: `worklog_history` 기본키 `(worklog_id, seq)` + 미러 CAS(`rev`).** seq 는 미러의 `last_seq + 1` 이다.

```
observeOne(change, ctx):                       // 최대 3회
  mirror = findMirrors([id]).get(id)
  if (COMMENT 비트 또는 삭제) previousComment = findPreviousComment(id, mirror.lastSeq + 1)
  plan = planObservation({...})
  if (!plan.rows.length) return plan.outcome
  insertHistory(plan.rows)                     // INSERT IGNORE — 같은 seq 가 이미 있으면 무시
  stored = findHistoryRows(id, plan.rows.map(seq))
  next = stored.reduce(applyRow, mirror)       // 내가 쓴 행이든 남이 먼저 쓴 행이든 **저장된 행**으로 미러를 만든다
  ok = mirror ? casMirror(id, mirror.rev, next) : insertMirror(next)
  if (!ok) continue                            // 남이 미러를 먼저 옮겼다 → 다시 읽어 차이가 남았는지 본다
  if (stored ≠ plan.rows) continue             // 경합에서 졌다 → 내 current 와 채택한 미러의 차이를 다음 seq 로
  return 'recorded'
```

왜 이 순서인가:
- **이벤트 2회(Forge 재시도·중복 전달)**: 두 번째는 미러가 이미 그 상태 → `diffMask = 0` → 행 없음.
- **이벤트 경로와 스윕 경로가 같은 변경을 본다**: 먼저 처리한 쪽이 미러를 옮기고, 나중 쪽은 차이 0. 동시에 처리하면 둘 다 같은 seq 를 계획 → `INSERT IGNORE` 로 한 행만 남고, 진 쪽은 저장된 행을 채택한 뒤 다시 비교한다. 같은 상태였으면 끝, 더 새 상태를 읽었으면 seq+1 로 한 행 더(실제로 있었던 두 상태라 중복이 아니다).
- **이력 삽입과 미러 갱신 사이에 죽으면**: 다음 처리자가 같은 seq 를 계획 → 무시됨 → 저장된 행을 채택해 미러를 옮긴다. 기록이 사라지지 않는다(미러 먼저 옮기는 순서였다면 그 변경 행을 잃는다).
- 미러 CAS 는 `rev = rev + 1`(불변식 4), `last_seq` 는 별도 칼럼(행이 2개면 +2).

진입점:
| 메서드 | 호출자 | 동작 |
|---|---|---|
| `wants()` | 트리거 어댑터 | `worklogHistoryEnabled`(KVS 키 1개만 읽음 — `isTransitionApprovalEnabled` 방식) && `ready()` |
| `fetchCurrent(ids)` | 트리거 어댑터 | `collector.fetchWorklogsByIdAsApp(ids, 'worklog-history-trigger')` |
| `handleEvent(parsed, { prefetched, eventAt })` | `onWorklogChanged` | 삭제면 `{deleted:true}`, 아니면 `prefetched.get(id) ?? null`(없으면 직접 조회) → `observe([...], {source: JIRA, eventKind, actorId})`. **던지지 않는다** |
| `recordAppWrite({ kind, issueId, principalId, beforeRaw, afterRaw, policy, now })` | `WorklogService` | 정책 꺼짐·미준비면 끝. knownBefore=`worklogStateOf(beforeRaw)`, current=`worklogStateOf(afterRaw)`(삭제는 `deleted:true`). source APP. **던지지 않는다**(catch + `[WORKLOG_HISTORY][app]` 로그, 사용자 텍스트 없음) |
| `observe(changes, ctx)` | 위 셋 + 스윕 | ① 수집 범위(§4.4) ② 건별 `observeOne`(건별 try/catch) → 요약 `{changes, recorded, none, unknownDeleted, unreadable, outOfScope, failed}` |
| `sweep()` | `runWorklogHistorySweep` | §4.5 |

APP 경로의 이전 값(`knownBefore`)은 `WorklogService.loadOwn` 이 이미 asUser 로 읽은 원시 값을 그대로 넘긴다(추가 호출 없음). 생성은 knownBefore 없음.
APP 기록과 트리거의 경합(트리거가 APP 기록보다 먼저 처리): 트리거가 JIRA(행위자 = updateAuthor = 같은 사용자)로 기록하고 APP 기록은 차이 0 → 출처만 JIRA 로 남는다(한계 L6 — 내용·행위자는 같다).

### 4.4 수집 범위·켜짐 시각

- 전역: 정책 `worklogHistoryEnabled`. 꺼짐 → 트리거는 아무것도 안 하고(asApp 도 안 부른다), 스윕은 리스를 잡아 **watermark 만 지금으로 옮기고** 읽지 않는다(기존 drift 의 "제출 없음" 처리와 같다 — 꺼진 동안의 변경은 수집하지 않는다).
- 프로젝트: `isProjectEnabled` 와 같은 규칙. 워크로그의 프로젝트는 ① 미러의 `project_id` ② 없으면(처음 보는 워크로그) asApp `POST /rest/api/3/issue/bulkfetch` `fields:['project']`(이슈 100개당 1회, 사유 `worklog-history-project`) ③ APP 경로는 asUser `loadIssue(issueId)`(생성 때만, Jira 쓰기와 병렬). 프로젝트를 못 정하면 수집하지 않는다(`outOfScope` — 범위를 넓히는 쪽으로 틀리지 않는다).
- 켜짐 시각: KVS `approval:worklogHistory:state` = `{ startedAt, enabledSince }`. 처음 `wants()` 가 참일 때 없으면 둘 다 now 로 만든다. `SettingsService.saveApprovalSettings` 가 `worklogHistoryEnabled` false→true 전환을 보면 `enabledSince = now`(workforce `relinking` 훅과 같은 자리). 프로젝트 켜짐 시각은 `approval_project_config.updated_at`(켜진 상태일 때) — `SettingsRepository.getProjectStateDetails(ids) → Map<id, {enabled, updatedAt}>` 신규. `staleBefore = max(enabledSince, 프로젝트 updatedAt)`.
- `collectionStartedAt = startedAt`(규칙 9·10 의 CREATED/BASELINE 구분).

### 4.5 스윕 `runWorklogHistorySweep` + `JobLease`

- 잡 키 `wlh-worklog-deleted`, `wlh-worklog-updated`(approval_job_state, 32자 안). 순서·예산은 drift 와 같다: deleted 먼저, 예산 20초·요청 30, 미완주 시 watermark 고정·cursor 만 남김, 같은 cursor 24회 연속 실패 시 건너뜀(`MAX_PAGE_FAIL_STREAK`), 첫 실행 lookback 24시간.
- `JobLease` 는 `TimesheetDriftService` 의 `acquireLease`·`releaseLease`·`parseCursor`·`formatCursor` 와 **같은 의미**를 가진 독립 모듈로 만든다. drift 코드는 이번에 옮기지 않는다(검증된 경로를 건드리지 않기 위해 — 통합은 후속 권고).
- 페이지 처리: updated → `fetchWorklogsByIdAsApp(ids)` → 없는 id 는 `unreadable`(삭제는 deleted 피드가 알려 준다). deleted → `{deleted:true, changedAt: updatedTime ?? now}`, actor null.
- 이벤트 경로와 같은 `observe` 를 쓰므로 이미 기록된 변경은 차이 0 으로 지나간다 — 스윕이 "보정 감지"로 남기는 것은 **트리거가 놓친 것뿐**이다.
- 마이그레이션은 스윕이 돌리지 않는다(기존 규칙). 테이블 미준비면 리스도 잡지 않고 끝.

### 4.6 트리거 어댑터 `onWorklogChanged`

```js
export const onWorklogChanged = async (event) => {
  const parsed = parseWorklogEvent(event);
  let prefetched;
  try {
    if (parsed.kind !== 'deleted' && parsed.worklogId && await worklogHistoryRecorder.wants()) {
      prefetched = await worklogHistoryRecorder.fetchCurrent([parsed.worklogId]);
    }
  } catch (e) { console.error('[TRIGGER][worklog] prefetch failed', …); }
  try { await timesheetDriftService.handleEvent(event, { prefetched }); } catch (e) { … }
  try { await worklogHistoryRecorder.handleEvent(parsed, { prefetched, eventAt: Date.now() }); } catch (e) { … }
};
```
- 한쪽 실패가 다른 쪽을 막지 않는다. **throw 하지 않는다.**
- `TimesheetDriftService.handleEvent(event, { prefetched } = {})`: `prefetched` 가 있으면 `fetchWorklogsByIdAsApp` 를 부르지 않고 `prefetched.get(id) ?? null` 을 쓴다. 없으면 기존 그대로(기존 테스트 무변경 통과). "제출·마감 없음이면 asApp 안 부름" 조건도 그대로 — 이력이 꺼져 있으면 이벤트당 asApp 호출 수는 지금과 같다.
- `WorklogCollector.currentOf` 추가 필드 `updateAuthorId`, `commentText`(adfToPlainText), `visibilityKey`. drift 는 이 필드를 읽지 않는다. 설명 원문은 메모리에서 지문·앞부분으로 바뀌어 이력 테이블에만 들어간다(로그 금지).

### 4.7 조회 측 `WorklogHistoryService`

공통: `ready()` 거짓 → 빈 결과. 표시 이름은 `loadUsers`(user/bulk 일괄) 1회. 가림은 `maskForViewer`.

| resolver | 범위 판정(불변식 7) | 이슈 열람 재축소 |
|---|---|---|
| `getWorklogHistory` | 행의 `issue_id === payload.issueId`(아니면 `WORKLOG_NOT_FOUND`) → 조회자=작성자 / `TimesheetAccess.canView(principal, {accountId: 작성자})` / `resolveAdminPrincipal(context).isAdmin`(앞 둘이 거짓일 때만 — 호출 절약) | 가드가 그 이슈 열람을 확인했다 |
| `getIssueWorklogs` 카운트 | 페이지 워크로그 중 작성자=나 / 내가 이끄는 팀원(`teamScope.membersOf(나)` 1회, invocation memo) / 관리자(필요할 때만 1회) 인 것만 `history` 채움, 나머지 null | 가드 |
| `getTimesheetWorklogHistory` | `getTimesheetDetail` 과 같은 순서: load → TIMESHEET 확인 → `TimesheetAccess.canView(principal, target, state)` | `filterVisibleIssues(행의 issueId 집합)` → 못 보는 이슈 행은 **빼고** `hiddenCount` |
| `listWorklogHistory` | 가드 `{admin:true}` | 페이지 행의 issueId 를 `filterVisibleIssues` → 빼고 `hiddenCount`. 이슈 메타(키·제목·프로젝트 키)도 같은 호출의 bulkfetch 결과 |
| `exportExpiredWorklogHistory` | 가드 `{admin:true}` | `filterVisibleIssues` → 못 보는 이슈 행은 **넣고 가림**(Q73) |

`approvedAt`: 요청 상태가 APPROVED 이면 결정들 중 APPROVE 결정 시각의 최댓값(엔진의 `decisions` Map — 순수 헬퍼로 계산, 엔진 무변경). `submittedAt` = `timesheet_submission.created_at`.

### 4.8 보관 `WorklogHistoryRetentionService`

`RetentionService` 의 흐름을 그대로 따른다(키만 다르다).
- 상태 KVS `approval:retention:worklogHistory` = `{ lastExport }`. 기간 값은 정책 `worklogHistoryRetentionMonths`(KVS 정책 키 — 키 맵 계약).
- `exportExpired`: 첫 호출이 cutoff 를 정하고(정책 cutoff 보다 미래로 못 늘림 — `clampCutoff` 동일) 오름차순 200행씩. `confirmExport`: lastExport 기록 + 설정 감사 `retention/historyExport`. `purgeExported`: 이력 배치 100 → 0 이 되면 미러 배치 100, 예산 20초, 남은 수 반환 + 감사 `retention/historyPurge`.
- 결재 기록 보관(`approval:retention`)과 **서로 독립**(기간·내보내기 기록이 따로).

### 4.9 정책 키 (`SettingsRepository` 세 곳 동시 + `SettingsService` 검증)

| 키 | KVS 키 | 기본 | 검증 | GLOBAL_ONLY |
|---|---|---|---|---|
| `worklogHistoryEnabled` | `approval:settings:worklogHistoryEnabled` | true | booleanValue | 예 |
| `worklogHistoryKeepComment` | `approval:settings:worklogHistoryKeepComment` | false | booleanValue | 예 |
| `worklogHistoryRetentionMonths` | `approval:settings:worklogHistoryRetentionMonths` | 12 | `enumValue([0,3,6,12,24,36])` | 예 |

`DEFAULT_APPROVAL_SETTINGS`·`SETTINGS_KEYS`·`GLOBAL_ONLY_KEYS` 를 함께 고친다(어긋나면 모듈 로드 시 throw — 정책 조회 전체가 죽는다). 정책 키 32 → 35, `getPolicy` 청크 5 기준 왕복 7회 그대로.
`keepComment` 를 켜도 **켠 뒤의 행부터** 원문이 남는다(과거 행은 앞부분뿐) — 화면 안내.

### 4.10 불변식·완료 기준 대조

| 항목 | 이 설계 |
|---|---|
| 1 열린 요청 하나 | 승인 요청을 만들지 않는다. 대신 "워크로그 상태 하나당 이력 한 행"을 PK `(worklog_id, seq)` + 미러 CAS 로 보장 |
| 2 결정이 진실 | 해당 없음(엔진 무변경) |
| 3 도메인 순수 | `worklogHistory.js` 는 now·collectionStartedAt·staleBefore·정책을 인자로. 해시는 `crypto`(snapshot.js 선례) |
| 4 CAS `rev = rev + 1` | `casMirror` |
| 5 승인자 행 | 해당 없음 |
| 6 결정적 id | `historyId = worklogId:seq`. 같은 이벤트 2회·이벤트+스윕 → 1행(테스트 §4.11) |
| 7 범위 재축소 | §4.7 표 — 형제 5개(탭 펼침·탭 카운트·타임시트·검색·보관 내보내기) 모두 |
| 8 asUser 기본 | 조회 resolver 는 전부 asUser. asApp 은 트리거·스윕의 워크로그 조회 + 프로젝트 id(§6.3) |
| 9 프로퍼티 불신 | 엔티티 프로퍼티 미사용 |
| 10 validator | 해당 없음 |
| append-only | `worklog_history` 에 UPDATE 문 없음, DELETE 는 `purgeHistoryBatch` 하나. 계약 테스트: ① Repository 소스에 `UPDATE worklog_history` 문자열 없음 ② `PERMISSION_MAP` 키 중 `/WorklogHistory/` 를 포함하는 mutation 은 `confirmWorklogHistoryExport`·`purgeExportedWorklogHistory` 뿐 |

### 4.11 필수 테스트(완료 기준)

`src/resolver/worklogHistory/__test__/WorklogHistoryRecorder.test.js` — 메모리 가짜 Repository(INSERT IGNORE·CAS 의미를 흉내):
1. **같은 이벤트 2회 → 1행**(handleEvent 두 번, 같은 prefetched)
2. **이벤트 → 스윕 같은 변경 → 1행(source JIRA)**, **스윕 → 이벤트 → 1행(source SWEEP)**
3. **동시 처리**: 두 observe 가 같은 미러 rev 를 읽고 같은 상태 → 1행, 미러 rev+1 한 번 / 다른 상태(B·C) → 2행(seq r+1=먼저 저장된 것, r+2=나머지), 미러 최종 = C
4. 이력 삽입 뒤 미러 갱신 전 실패 → 다음 observe 가 채택해 미러를 맞추고 행 추가 없음
5. APP 쓰기 → 트리거 → 1행(source APP). APP 기록 실패(Repository throw) → `updateWorklog` 응답은 성공
6. APP 수정 시 미러가 직전 값과 다름 → SWEEP 보정 + APP 2행
7. 꺼짐 → 트리거 asApp 0회·행 0, 스윕 watermark 전진·행 0. 프로젝트 꺼짐 → `outOfScope`
8. 건별 실패가 다른 건을 막지 않고 던지지 않는다

`WorklogHistoryService.test.js`: 형제 범위 — 각 resolver 에서 ① 남(팀 밖) 작성자 거부/null ② 팀장은 자기 팀원만 ③ 관리자 전체 ④ 열람 불가 이슈 행은 빠지고 `hiddenCount`(보관 내보내기는 가림) ⑤ 제한 공개 설명은 작성자만 ⑥ 다른 이슈의 worklogId → `WORKLOG_NOT_FOUND`.
`onWorklogChanged.test.js`: asApp 조회 1회 공유, drift 실패가 이력을 막지 않음(역도), throw 없음.
`TimesheetDriftService` 기존 테스트 무변경 통과 + `prefetched` 사용 시 collector 미호출 1건.

## 5. 스키마·마이그레이션

### 5.1 `src/rdb/schema/ddl/worklogHistory.sql.js`

```sql
-- v031
CREATE TABLE IF NOT EXISTS worklog_history (
    worklog_id           VARCHAR(20)  NOT NULL,
    seq                  INT          NOT NULL,
    issue_id             VARCHAR(20)  NOT NULL,
    project_id           VARCHAR(20)  NULL,
    author_account       VARCHAR(128) NOT NULL,
    actor_account        VARCHAR(128) NULL,
    source               VARCHAR(8)   NOT NULL,
    kind                 VARCHAR(10)  NOT NULL,
    changed_mask         TINYINT      NOT NULL DEFAULT 0,
    restricted           TINYINT(1)   NOT NULL DEFAULT 0,
    before_started       BIGINT       NULL,
    after_started        BIGINT       NULL,
    before_seconds       INT          NULL,
    after_seconds        INT          NULL,
    before_comment_fp    VARCHAR(12)  NULL,
    after_comment_fp     VARCHAR(12)  NULL,
    before_comment_head  VARCHAR(48)  NULL,
    after_comment_head   VARCHAR(48)  NULL,
    before_comment_full  TEXT         NULL,
    after_comment_full   TEXT         NULL,
    after_visibility_fp  VARCHAR(12)  NULL,
    changed_at           TIMESTAMP    NOT NULL,
    observed_at          TIMESTAMP    NOT NULL,
    PRIMARY KEY (worklog_id, seq),
    INDEX ix_wlh_author_changed (author_account, changed_at),
    INDEX ix_wlh_changed (changed_at)
)

-- v032
CREATE TABLE IF NOT EXISTS worklog_mirror (
    worklog_id       VARCHAR(20)  NOT NULL,
    issue_id         VARCHAR(20)  NOT NULL,
    project_id       VARCHAR(20)  NULL,
    author_account   VARCHAR(128) NOT NULL,
    started          BIGINT       NULL,
    seconds          INT          NULL,
    comment_fp       VARCHAR(12)  NULL,
    visibility_fp    VARCHAR(12)  NULL,
    deleted          TINYINT(1)   NOT NULL DEFAULT 0,
    last_seq         INT          NOT NULL,
    last_changed_at  TIMESTAMP    NOT NULL,
    rev              INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (worklog_id),
    INDEX ix_wlm_changed (last_changed_at)
)
```

칼럼 결정 근거(파일 머리 주석에 옮긴다):
- **기본키가 곧 결정적 id** — 별도 UUID 칼럼(16B + 인덱스)을 두지 않는다. Jira 워크로그 id 는 사이트 전체에서 유일.
- `actor_account`: `'='`(작성자와 같음 — 대부분) / id / NULL(알 수 없음). 계정 id 40여 바이트를 행마다 두 번 싣지 않기 위해서.
- 설명 앞부분 `VARCHAR(48)`: 40 코드포인트 + 여유(VARCHAR 는 문자 수 기준). 지문은 11자.
- 공개 범위는 지문만 — 그룹·역할 이름을 감사 테이블에 복제하지 않는다. 이력에는 `restricted` 와 재구성용 after 지문만.
- 프로젝트 인덱스는 두지 않는다 — 감사 검색은 기간 필수라 `ix_wlh_changed` 범위 안에서 거른다(연 36만 행, 한 달 약 3만 행 범위 스캔).
- `last_seq` 와 `rev` 를 나눈 이유: 한 관측이 2행(보정+APP)을 쓸 수 있는데 CAS 는 `rev = rev + 1` 이어야 한다(불변식 4).

### 5.2 migrate.js (뒤에만 붙인다)

```js
  .enqueue('v031_create_worklog_history_table', CREATE_WORKLOG_HISTORY_TABLE)
  .enqueue('v032_create_worklog_mirror_table', CREATE_WORKLOG_MIRROR_TABLE);
```
`ddl/index.js` 에 re-export 추가. 새 테이블을 읽는 모든 경로는 `ready()` 프로브 뒤에만(트리거·스윕·APP 기록·조회 5종). `RetentionRepository.CHILD_TABLES` 에는 **넣지 않는다**(요청에 딸린 행이 아니다 — 보관 흐름이 별도).
SQL 모듈은 이미 있으므로 major upgrade 규칙(`--approve MAJOR_VERSION_RULE`)은 새 테이블만으로는 해당 없음(scheduledTrigger 추가는 minor 로 본다 — 미검증 H10).

## 6. Jira 연결

### 6.1 manifest

```yaml
  scheduledTrigger:
    # 워크로그 변경 이력 — 트리거 누락 보정(전용 커서 wlh-*). timesheet-sweep 과 한 실행에 넣으면 25초 한도를 넘는다(각 20초 예산).
    - key: worklog-history-sweep
      function: runWorklogHistorySweep
      interval: hour
  function:
    - key: runWorklogHistorySweep
      handler: index.runWorklogHistorySweep
```
`src/index.js`: `export { runWorklogHistorySweep } from './trigger/runWorklogHistorySweep';`, `CONTROLLER_REGISTRARS` 에 `registerWorklogHistoryController`.
모듈·scope 추가 없음. 기존 `worklog-changed` 트리거(created·updated·deleted) 재사용.

### 6.2 REST 목록

| 호출 | 주체 | 경로 | 횟수 |
|---|---|---|---|
| `POST /rest/api/3/worklog/list` | asApp(허용 1번) | 트리거(이력·drift 공유), 스윕 | 이벤트당 1 / 스윕 ⌈n/1000⌉ |
| `GET /rest/api/3/worklog/updated?since=`·`/deleted?since=` | asApp(허용 1번) | 스윕(전용 커서) | 페이지당 1 |
| `POST /rest/api/3/issue/bulkfetch` (`fields:['project']`) | asApp(허용 1번 확장 — §6.3) | 트리거·스윕, **미러에 없는 워크로그만** | 이슈 100개당 1 |
| `GET /rest/api/3/issue/{id}?fields=summary,project` (`loadIssue`) | asUser | APP 생성 경로 | 생성당 1(Jira 쓰기와 병렬) |
| `POST /rest/api/3/permissions/check` + `issue/bulkfetch` (`filterVisibleIssues`) | asUser | 타임시트 이력·감사 검색·보관 내보내기 | 이슈 100개당 각 1 |
| `POST /rest/api/3/user/bulk`(`loadUsers`) | asUser | 조회 5종 | 사람 50명당 1 |
| `mypermissions ADMINISTER`(`isJiraAdmin`) | asUser | 탭 펼침·카운트(본인·팀장이 아닐 때만) | 0~1(런타임 캐시) |

### 6.3 `AGENTS.md` asApp 허용 1번 문구 변경안(Q72 — 구현 회차가 반영)

> 1. 워크로그 이벤트 트리거·누락 보정 스윕의 워크로그 조회 **와 그 워크로그가 속한 이슈의 프로젝트 id 조회**(`issue/bulkfetch fields=project`, 이력 수집 범위 판정) — 사용자 컨텍스트가 없다. 사유 `timesheet-drift-*` / `worklog-history-trigger` / `worklog-history-sweep` / `worklog-history-project`.

그리고 마지막 문장을 다음으로 바꾼다:

> 이 경로로 읽은 워크로그는 지문 계산·상태 판정 **과 워크로그 변경 이력(`worklog_history`) 저장** 외에 쓰지 않는다. 이력을 사용자에게 보여 줄 때는 조회자 asUser 이슈 열람 권한(`permissions/check`)으로 다시 좁히고, 제한 공개 워크로그의 설명은 작성자에게만 보인다.

## 7. 프론트

### 7.1 엔트리

추가 없음. `worklog`(탭), `modal`(승인 상세), `settings`(설정) 기존 엔트리 안에서 끝난다. 세 곳 동시 수정 대상 없음.

### 7.2 화면 트리

```
features/worklogHistory/                    신규
  WorklogHistoryList.jsx      항목 목록(탭 펼침·타임시트 섹션·감사 표 공용 렌더러): 종류 로젠지, 출처 배지(SWEEP 은 경고색 + 툴팁),
                              "필드: 이전 → 이후"(시작·시간·설명), 행위자(PersonAvatar, null 이면 "알 수 없음"), 변경 시각
  HistoryChange.jsx           before/after 한 필드 표시(설명: 앞부분·말줄임·원문 펼침·가림 문구·빈 설명)
  historyFormat.js            초→"1h 30m"(worklog/durationInput 재사용), 시각(worklogTime 재사용), 출처·종류 i18n 키
  TimesheetHistorySection.jsx 승인 상세 안 섹션: "승인 후 변경 N건" 요약, afterApproval 행 강조, hiddenCount·truncated 안내
  exportWorklogHistoryExcel.js utils/excel.js(동적 import) — 감사 검색 결과·보관 내보내기 공용 시트 빌더
features/worklog/WorklogTab.jsx   행에 "수정 N회"(history.changeCount>0) / "이력"(entryCount>0) 버튼 → 아래로 펼쳐 WorklogHistoryList
                                  (useQuery enabled=펼침). history===null 이면 버튼 없음. 상단 안내 "{since}부터 기록"
features/timesheet/TimesheetSnapshotSection.jsx  아래에 <TimesheetHistorySection requestId/> (ApprovalDetail 은 무변경)
features/settings/
  SettingsPage.jsx            탭 추가 { key:'worklogHistory', label: t('policy.settings.tab.worklogHistory') } — audit 다음
  WorklogHistoryAuditSettings.jsx  필터(기간 from/to DatePicker — 기본 최근 30일, 사용자 UserPickerDialog, 프로젝트 Select(listProjects),
                                   종류·출처 Checkbox) + DynamicTable(useInfiniteQuery "더 보기") + 엑셀 버튼(진행 수, 10,000행 상한)
  DataSettings.jsx            WorklogHistoryRetentionSection 추가(RetentionSection 과 같은 모양: 기간 Select → saveApprovalSettings,
                              기간 지난 N건, 내보내기 → 확정 → 삭제(0 될 때까지 반복), 가린 행 안내 Q73)
  TimesheetPolicySettings.jsx 스위치 2(worklogHistoryEnabled, worklogHistoryKeepComment) + 원문 보관 용량 경고 문구
```
iframe 함정: 펼침 목록은 내용 높이(100vh 금지). 감사 표는 페이지 50행 + "더 보기".

### 7.3 쿼리키 (`utils/queryKey/approvalKeys.js`)

```js
export const worklogHistoryKeys = {
  all: ['worklogHistory'],
  worklog: (issueId, worklogId) => [...worklogHistoryKeys.all, 'worklog', String(issueId), String(worklogId)],
  timesheet: (requestId) => [...worklogHistoryKeys.all, 'timesheet', String(requestId)],
  audit: (filters) => [...worklogHistoryKeys.all, 'audit', filters ?? null],
};
// settingsKeys 에 추가
worklogHistoryRetention: () => [...settingsKeys.all, 'worklogHistoryRetention'],
```

### 7.4 재사용

`PersonAvatar`, `utils/excel.js`(`HEADER_BG`·`CELL_BORDER`·`isoLocal`·동적 import), `features/worklog/{durationInput,worklogTime}.js`, `UserPickerDialog`, `exportRetentionExcel.js` 의 진행·확정 흐름, `invokeApproval` 의 `error.code` 분기.

## 8. i18n 키 (kr / en) — `npm run merge` 필수 (merge 는 폴더의 json 을 자동 수집 — 네임스페이스 = 파일명)

### 8.1 신규 `locales/{kr,en}/worklogHistory.json`

| 키 | kr | en |
|---|---|---|
| `tab.editedCount` | 수정 {count}회 | Edited {count} times |
| `tab.history` | 이력 | History |
| `tab.collapse` | 이력 접기 | Hide history |
| `tab.since` | {date}부터 변경 이력을 기록합니다. | Changes are recorded since {date}. |
| `kind.CREATED` / `UPDATED` / `DELETED` / `BASELINE` | 생성 / 수정 / 삭제 / 기준선 관측 | Created / Updated / Deleted / First observed |
| `source.APP` / `JIRA` / `SWEEP` | 승인 앱 화면 / Jira / 보정 감지 | Approval app / Jira / Reconciled |
| `source.sweepHint` | 이벤트를 놓쳐 나중에 발견한 변경입니다. 사이에 있었던 중간 수정은 남지 않았을 수 있습니다. | Detected later by reconciliation. Intermediate edits may be missing. |
| `baseline.hint` | 처음 관측한 값입니다. 이전 변경은 기록되지 않았습니다. | First observed value. Earlier changes were not recorded. |
| `field.started` / `seconds` / `comment` / `visibility` | 시작 / 소요 시간 / 설명 / 공개 범위 | Start / Time spent / Description / Visibility |
| `change.arrow` | {before} → {after} | {before} → {after} |
| `actor.unknown` | 알 수 없음 | Unknown |
| `comment.empty` | (설명 없음) | (No description) |
| `comment.masked` | 공개 범위가 제한된 워크로그라 설명을 표시하지 않습니다. | Description hidden — restricted worklog. |
| `comment.headOnly` | 앞부분만 보관합니다. 원문은 Jira 에 있습니다. | Only the beginning is kept. The full text is in Jira. |
| `comment.showFull` / `hideFull` | 원문 보기 / 원문 접기 | Show full text / Hide full text |
| `visibility.changed` | 공개 범위 변경 | Visibility changed |
| `timesheet.title` | 워크로그 변경 이력 | Worklog change history |
| `timesheet.afterApproval` | 승인 후 변경 | Changed after approval |
| `timesheet.afterApprovalCount` | 승인 후 변경 {count}건 | {count} changes after approval |
| `timesheet.afterSubmission` | 제출 후 변경 | Changed after submission |
| `timesheet.hidden` | 볼 수 없는 이슈의 변경 {count}건은 표시하지 않습니다. | {count} changes on issues you cannot view are hidden. |
| `timesheet.truncated` | 최근 500건만 표시합니다. | Showing the latest 500 changes. |
| `timesheet.empty` | 이 기간에 기록된 변경이 없습니다. | No recorded changes in this period. |
| `audit.title` / `hint` | 워크로그 변경 이력 / 사용자·프로젝트·기간·변경 종류로 워크로그 변경을 찾습니다. 볼 수 없는 이슈의 변경은 제외됩니다. | Worklog change history / Search worklog changes by user, project, period and kind. Changes on issues you cannot view are excluded. |
| `audit.filter.from` / `to` / `user` / `project` / `kind` / `source` | 시작일 / 종료일 / 사용자 / 프로젝트 / 변경 종류 / 출처 | From / To / User / Project / Kind / Source |
| `audit.filter.rangeInvalid` | 기간은 1년 이내로 지정하세요. | Choose a period of up to one year. |
| `audit.search` / `loadMore` / `empty` | 검색 / 더 보기 / 조건에 맞는 변경이 없습니다. | Search / Load more / No matching changes. |
| `audit.hiddenCount` | 볼 수 없는 이슈의 변경 {count}건 제외 | {count} changes on hidden issues excluded |
| `audit.export` / `exporting` / `exportCapped` | 엑셀로 내보내기 / {count}건 받는 중… / 10,000건까지만 내보냈습니다. 기간을 나눠 다시 내보내세요. | Export to Excel / Fetching {count}… / Exported the first 10,000 rows. Split the period and export again. |
| `audit.column.changedAt` / `author` / `actor` / `source` / `kind` / `issue` / `worklog` / `started` / `seconds` / `comment` | 변경 시각 / 사용자 / 변경한 사람 / 출처 / 종류 / 이슈 / 워크로그 / 시작 / 시간 / 설명 | Changed at / User / Changed by / Source / Kind / Issue / Worklog / Start / Time / Description |
| `excel.sheet` / `excel.hiddenNote` | 워크로그 이력 / 볼 수 없는 이슈의 변경 {count}건은 포함하지 않았습니다. | Worklog history / {count} changes on hidden issues are not included. |
| `policy.enabled` / `enabledHint` | 워크로그 변경 이력 기록 / 앱을 사용하는 프로젝트의 워크로그 생성·수정·삭제를 기록합니다. | Record worklog change history / Records worklog creation, edits and deletions in projects using the app. |
| `policy.keepComment` / `keepCommentHint` | 설명 원문 보관 / 끄면 설명의 앞 40자와 지문만 남깁니다. 켜면 저장 용량이 늘어납니다(켠 뒤 변경부터). | Keep full descriptions / When off, only the first 40 characters and a fingerprint are kept. Turning it on increases storage (applies to later changes). |

### 8.2 기존 네임스페이스 추가

| 파일 | 키 | kr | en |
|---|---|---|---|
| `policy.json` | `settings.tab.worklogHistory` | 워크로그 이력 | Worklog history |
| `policy.json` | `audit.action.historyExport` / `historyPurge` | 이력 내보내기 / 이력 삭제 | History export / History purge |
| `data.json` | `worklogHistory.title` / `hint` | 워크로그 이력 보관 / 기간이 지난 워크로그 변경 이력은 엑셀로 내보낸 뒤에만 삭제할 수 있습니다. 결재 기록 보관과 따로 정합니다. | Worklog history retention / Expired worklog history can be deleted only after exporting to Excel. Set separately from approval records. |
| `data.json` | `worklogHistory.months` / `monthsOption` / `forever` | 보관 기간 / {count}개월 / 무기한 | Retention / {count} months / Forever |
| `data.json` | `worklogHistory.expired` / `purgeable` | 기간 지난 이력 {count}건 / 삭제 가능 {count}건 | {count} expired / {count} deletable |
| `data.json` | `worklogHistory.export` / `exporting` / `confirmed` / `purge` / `purgeDone` | 내보내기 / {count}건 받는 중… / {date}까지 {count}건 내보냄 / 내보낸 이력 삭제 / {count}건 삭제했습니다 | Export / Fetching {count}… / Exported {count} up to {date} / Delete exported history / Deleted {count} |
| `data.json` | `worklogHistory.maskedNote` | 볼 수 없는 이슈의 행은 이슈·설명을 가린 채 포함됩니다. | Rows on issues you cannot view are included with issue and description hidden. |
| `data.json` | `worklogHistory.neverExported` | 기간 지난 이력이 쌓이고 있습니다. 내보낸 뒤 삭제하세요. | Expired history is accumulating. Export and delete it. |

## 9. 용량·호출량

### 9.1 용량 (200명, 12개월 보관 정상 상태, 실측 전)

가정: 연 워크로그 생성 24만(200명 × 하루 약 5건 × 240일), 수정 9.6만·삭제 1.2만·기준선 소수 → **이력 약 36만 행/년**, 미러 = 보관 기간 안에 바뀐 워크로그 약 24만 행. 계정 id 평균 32자(24자 신형·43자 구형 혼재), 설명 앞부분 평균 30바이트(한글 10자 내외), 설명 변경은 수정의 30%.
선례 산정 방식(`DESIGN §8`·timesheet-approval §9.1)대로 **칼럼 바이트 합 × 2(행 오버헤드·인덱스)**.

| 칼럼 묶음 | `worklog_history` 행 평균 바이트 | 근거 |
|---|---|---|
| worklog_id·seq·issue_id·project_id | 9+4+7+6 = 26 | |
| author_account / actor_account | 32 / 4 | actor 는 대부분 `'='`(1B), 남이 고친 경우만 id |
| source·kind·mask·restricted | 4+7+1+1 = 13 | |
| 시작·초(바뀐 쪽만) | 약 13 | 생성은 after 만(12B), 수정은 앞뒤(24B), 삭제는 before 만 |
| 설명 지문·앞부분(바뀐 쪽만) | 약 47 | 생성·기준선 24만 × (11+30) + 설명 변경 2.9만 × 82 + 삭제 1.2만 × 41, 36만으로 나눔 |
| 원문(정책 꺼짐) / 공개 범위 지문 | 0 / 약 1 | |
| changed_at·observed_at | 10 | |
| **합계** | **약 146B → ×2 ≈ 290B** | |

| 테이블 | 행 수(정상 상태) | 행 크기(×2) | 용량 |
|---|---|---|---|
| `worklog_history` | 36만 | 약 290B | **약 104MB** |
| `worklog_mirror` | 24만 | (9+7+6+32+8+4+11+1+1+4+5+4 ≈ 92B) × 2 ≈ 184B | **약 44MB** |
| **합계** | | | **약 148MB / 년(12개월 보관)** — 목표 150MB 이하, 여유 약 1% |

- **여유가 거의 없다.** 이 수치는 칼럼 다이어트(바뀐 쪽만 싣기, `actor='='`, 지문 11자, 프로젝트 인덱스 없음, 미러에 설명 앞부분 없음)를 전제로 한다. 하나라도 풀면 넘는다 — 구현은 §5.1 을 그대로 지킨다.
- 실제 값은 TiDB 통계(`getStorageUsage` 의 테이블별 추정치)로 확인한다(H6). 넘으면 첫 조치는 보관 기간 6개월(정책), 그다음 `ix_wlh_author_changed` 를 `(author_account)` 단일로 줄이는 것.
- 원문 보관을 켜면(Q68 대안): 설명 평균 90B(한글 30자) × 실린 행 약 30만 → +27MB × 2 ≈ **+54MB**.
- 1,000명이면 선형 5배(약 740MB/년) — 1 GiB 한도 안에서 결재 기록과 함께 쓰기 어렵다. 1,000명 고객은 보관 3~6개월 권장(데이터 관리 화면 안내).
- 기존 예산(연 약 110MB, 3년 약 330MB)과 합치면 3년차 약 480MB — 1 GiB 의 절반.

### 9.2 호출량

| 경로 | Jira 호출 | SQL | 비고 |
|---|---|---|---|
| 트리거 1건(이력 켬) | asApp worklog/list 1(**drift 와 공유** — 제출이 없던 사이트는 +1) + 미러에 없으면 bulkfetch 1 | 미러 1 + (설명 변경 시 1) + INSERT 1 + 재조회 1 + CAS 1 + KVS 2 + 프로젝트 1~2 | 200명 × 하루 5건 ≈ 1,000회/일, bulkfetch 는 생성 건만(약 1,000회/일) |
| 스윕 1회 | deleted 1 + updated 1~2 + list ⌈n/1000⌉ + bulkfetch ⌈새 이슈/100⌉ | 건당 위와 같음 | 대부분 트리거가 이미 처리 → 차이 0 이라 쓰기 없음. 하루 24회 ≈ 70~100 호출 |
| `createWorklog`(APP 기록) | +1(asUser loadIssue, 쓰기와 병렬) | +5~6 | 사용자 체감 +수십 ms(SQL) |
| `updateWorklog`·`deleteWorklog` | +0(loadOwn 재사용, 미러에 프로젝트) | +5~6 | |
| `getIssueWorklogs` | +0~1(관리자 판정이 필요할 때만) | +1(GROUP BY) + 팀 범위(memo) | |
| `getWorklogHistory` | user/bulk 1 + 0~1 | 1~2 | |
| `getTimesheetWorklogHistory` | permissions/check ⌈이슈/100⌉ + bulkfetch ⌈/100⌉ + user/bulk 1 ≈ 3 | 3~4 | 상세와 같은 수준 |
| `listWorklogHistory`(50행) | ≈ 3 | 1 | 엑셀 1만 행 = 50 페이지 ≈ 150 호출(사용자 1회 작업) |
| 보관 내보내기 200행 | ≈ 3~5 | 1 | |

N+1 없음: 프로젝트·이슈 가시성·사용자 이름은 전부 일괄 API, 탭 카운트는 GROUP BY 한 번.

## 10. 미검증

`04_spike_todo.md` 의 H1~H14. 요지:

| # | 항목 | 영향 |
|---|---|---|
| H1 | 삭제 이벤트 페이로드에 행위자(`atlassianId` 등)·`issueId` 가 오는가 | JIRA 삭제의 "누가" — 없으면 "알 수 없음" |
| H2 | asApp `worklog/list` 응답에 `comment`(ADF)·`updateAuthor`·`visibility`·`created`·`updated` 가 오는가 | 설명·행위자·제한 판정 전부 |
| H3 | asApp `issue/bulkfetch` 가 보안 수준 걸린 이슈의 `project` 도 주는가, `read:jira-work` 로 충분한가 | 수집 범위 판정(못 받으면 수집 안 함) |
| H4 | **같은 워크로그의 asUser POST/PUT 응답과 asApp list 응답의 정규화 값(started ms·초·설명 평문·공개 범위)이 같은가** | 다르면 APP 기록 직후 트리거가 가짜 UPDATED 를 만든다 — **최우선** |
| H5 | 트리거가 APP 기록보다 늦게 도착하는가(보통 수 초) | 출처 표시(L6) |
| H6 | 실제 행 크기(TiDB data_length) — 1천 건 쌓은 뒤 `getStorageUsage` | 용량 목표 |
| H7 | `INSERT IGNORE` 가 복합 PK 중복에서 오류 없이 `rowsAffected 0` | 중복 방지 장치 |
| H8 | `DELETE … WHERE … NOT IN (SELECT …) LIMIT n` 이 Forge SQL 에서 되는가 | 미러 정리 |
| H9 | `worklog/updated` 피드에 **생성**도 포함되는가 | 스윕의 생성 보정 |
| H10 | 시간당 scheduledTrigger 4개째 추가 가능·실행 한도, major 버전 여부 | 배포 |
| H11 | 값 변화 없는 PUT 이 `updated` 를 올리고 이벤트를 내는가 | 행 0 이어야 정상(설계상 차이 0) |
| H12 | 이슈 삭제 시 워크로그 삭제 이벤트·피드가 오는가 | 이슈째 지운 경우 이력(L4) |
| H13 | `user/bulk` 가 비활성 계정을 어떻게 주는가 | 표시 이름만 |
| H14 | 제한 공개 워크로그가 asUser 탭 목록에서 빠지는가(그룹 밖 사용자) | Q71 근거 |

구조적 한계(실측과 무관 — 화면·문서에 적는다):
- **L1** 이벤트 처리 시점의 최신 값을 읽으므로 빠른 연속 수정은 한 행으로 합쳐질 수 있다(JIRA 행도).
- **L2** 한 번도 관측하지 않은 워크로그(설치·켜기 전 생성, 그 뒤 변경 없음)의 삭제는 남지 않는다(Q74).
- **L3** 꺼져 있던 동안(전역·프로젝트)의 변경은 수집하지 않는다. 다시 켠 뒤 첫 변경은 "보정 감지"로 표시해 섞였을 수 있음을 알린다.
- **L4** 이슈째 삭제는 H12 결과에 따른다. **L5** 이슈가 다른 프로젝트로 옮겨지면 이전 행의 `project_id` 는 옮기기 전 값이다.
- **L6** APP 기록보다 트리거가 먼저 처리되면 출처가 JIRA 로 남는다(행위자·내용은 같다).

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] `src/domain/timesheet/worklogHistory.js` + 테스트 §3.3(20건)
- [ ] DDL `worklogHistory.sql.js`(머리 주석에 §5.1 근거), `ddl/index.js`, `migrate.js` v031·v032, 마이그레이션 테스트
- [ ] `WorklogHistoryRepository`(§4.2, 빈 IN 가드, SqlTime, `'='` 풀기, UPDATE 문 없음)
- [ ] `JobLease`(drift 와 같은 의미 — 연속 실패 24회 건너뜀 포함) + 테스트
- [ ] `WorklogHistoryRecorder`(§4.3~4.5) + 필수 테스트 §4.11(1~8)
- [ ] `WorklogCollector.currentOf` 필드 3 추가(기존 테스트 통과)
- [ ] `TimesheetDriftService.handleEvent(event, { prefetched })` + 테스트 1건
- [ ] `onWorklogChanged` 공유 조회 + `runWorklogHistorySweep` 어댑터 + 테스트
- [ ] `WorklogService`: history 주입, `getIssueWorklogs` 의 `history`·`worklogs[].history`, 쓰기 3종 뒤 `recordAppWrite`(실패 무시), 생성 시 `loadIssue` 병렬
- [ ] `WorklogHistoryService`(조회 3) + `WorklogHistoryRetentionService`(보관 4) + 형제 범위 테스트
- [ ] `WorklogHistoryController`(7) + `PermissionMap`(7, 주석에 범위 근거) + `CONTROLLER_REGISTRARS` → 계약 테스트 통과
- [ ] append-only 계약 테스트(§4.10)
- [ ] 정책 키 3: `SettingsRepository` 세 곳 + `SettingsService` normalizers + `enabledSince` 훅 + `getProjectStateDetails`
- [ ] manifest scheduledTrigger·function, `index.js` export
- [ ] `AGENTS.md` asApp 1번 문구(§6.3) — Q72 기본 가정으로 반영하고 보고서에 명시
- [ ] `npm test -- --runInBand` (기준선 866 + 신규)

### 11.2 frontend 체크리스트

- [ ] `worklogHistoryKeys`·`settingsKeys.worklogHistoryRetention`
- [ ] `features/worklogHistory/*`(§7.2) + UI 테스트(렌더러: 종류·출처·가림·빈 설명·SWEEP 툴팁, 섹션: hidden·truncated·afterApproval)
- [ ] `WorklogTab` "수정 N회"/"이력" 펼침, 쓰기 후 `worklogHistoryKeys.all` 무효화
- [ ] `TimesheetSnapshotSection` 아래 `TimesheetHistorySection`
- [ ] 설정 탭 `worklogHistory`(감사 검색 + 엑셀 1만 행 상한), `DataSettings` 보관 섹션, `TimesheetPolicySettings` 스위치 2
- [ ] i18n §8(kr/en 동시) → `npm run merge`(차이 0)
- [ ] `npm run test:ui -- --runInBand`(기준선 203 + 신규), `npm run build:ui`(settings 청크 증가 확인 — 감사 화면은 lazy 로)

### 11.3 순서·의존

도메인 → DDL·Repository → Recorder(+트리거·스윕) → WorklogService 훅 → 조회·보관 서비스 → 등록 → 프론트. 프론트는 §2 계약만으로 병행 가능(가짜 응답).

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-04 | 초안 | autopilot Phase 2 |
