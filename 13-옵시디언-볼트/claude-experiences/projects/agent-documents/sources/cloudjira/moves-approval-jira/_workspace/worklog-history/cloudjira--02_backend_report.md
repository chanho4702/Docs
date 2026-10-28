# worklog-history 백엔드 보고서 (Phase 3)

> 작성: backend-engineer · 2026-10-04 · autopilot 무인 회차 · 재작업 회차 0(최초)
> 입력: `01_architect_design.md`(§3·§4·§5·§6·§11.1), `04_spike_todo.md`, QUESTIONS Q70~Q77(답 없음 → 설계 기본 가정. **Q72 포함 — AGENTS.md 반영함**)
> forge 명령·git 쓰기 없음. 프론트(static/ui) 무변경.

설계와 불변식의 충돌: **없음.**

## 테스트 결과

| 대상 | 기준선 | 지금 |
|---|---|---|
| 백엔드 `npx jest` | 64 suites / 866 tests | **72 suites / 966 tests 전부 통과** (+8 suites / +100 tests) |
| UI `npm run test:ui -- --runInBand --watchAll=false` | 27 / 203 | **27 / 203 통과**(무변경 확인) |

완료 기준 테스트(필수) 위치:
- 같은 이벤트 중복 → 1행: `WorklogHistoryRecorder.test.js` "1." + 도메인 "2."
- 이벤트/스윕 이중 기록 없음: Recorder "2a."(이벤트→스윕 → JIRA 1행) "2b."(스윕→이벤트 → SWEEP 1행) "3a/3b."(동시 처리, 메모리 Repository 가 INSERT IGNORE·CAS 를 흉내, `holdMirrorReads` 로 같은 rev 읽기 재현) "4."(삽입 후 미러 갱신 전 실패 → 채택·행 추가 없음)
- append-only: `WorklogHistoryRepository.test.js` "append-only 계약" — ① Repository 소스에 `UPDATE worklog_history` 없음 ② `DELETE FROM worklog_history` 는 `purgeHistoryBatch` 하나 ③ PERMISSION_MAP 의 `*WorklogHistory*` 7개 중 쓰기는 `confirmWorklogHistoryExport`·`purgeExportedWorklogHistory` 뿐(둘 다 `{admin:true}`)

## 구현 파일

신규
- `src/domain/timesheet/worklogHistory.js` — 순수(상수·`commentDigest`·`visibilityFp`·`visibilityKeyOf`·`worklogStateOf`·`diffMask`·`planObservation`·`applyRow`·`historyItemOf`·`maskForViewer`·`monthsCutoff`·`parseWorklogEvent`·커서/historyId·`isAfterApproval`·`inPeriod`·`approvedAtOf`)
- `src/rdb/schema/ddl/worklogHistory.sql.js` — v031·v032 DDL(설계 §5.1 그대로, 머리 주석에 칼럼 근거)
- `src/resolver/worklogHistory/WorklogHistoryRepository.js` — 두 테이블 SQL 전부
- `src/resolver/worklogHistory/WorklogHistoryRecorder.js` — 쓰기 측(트리거·스윕·APP)
- `src/resolver/worklogHistory/WorklogHistoryState.js` — KVS `approval:worklogHistory:state` = `{startedAt, enabledSince}`
- `src/resolver/worklogHistory/JobLease.js` — approval_job_state 리스·커서(drift 와 같은 의미, drift 코드는 무변경)
- `src/resolver/worklogHistory/WorklogHistoryService.js` — 조회 측(탭 펼침·탭 카운트·타임시트·감사 검색)
- `src/resolver/worklogHistory/WorklogHistoryRetentionService.js` — 보관 4종
- `src/resolver/worklogHistory/WorklogHistoryController.js` — guardedDefine 7
- `src/trigger/runWorklogHistorySweep.js`
- 테스트: `src/domain/timesheet/__test__/worklogHistory.test.js`, `src/resolver/worklogHistory/__test__/{WorklogHistoryRecorder,WorklogHistoryService,WorklogHistoryRepository,JobLease}.test.js` + `memoryHistoryRepo.js`(테스트 헬퍼), `src/trigger/__test__/onWorklogChanged.test.js`, `src/resolver/settings/__test__/SettingsWorklogHistory.test.js`, `src/resolver/worklog/__test__/WorklogServiceHistory.test.js`

변경
- `src/trigger/onWorklogChanged.js` — 파싱 1회 + 이력 켜짐이면 asApp 조회 1회를 drift·이력이 공유. 세 단계 각각 try/catch, throw 없음
- `src/resolver/timesheet/TimesheetDriftService.js` — `handleEvent(event, { prefetched } = {})`(있으면 collector 미호출). 나머지 무변경
- `src/resolver/timesheet/WorklogCollector.js` — `fetchWorklogsByIdAsApp(ids, reason, { detail })` + `fetchIssueProjectsAsApp(issueIds, reason)`
- `src/resolver/worklog/WorklogService.js` — `history`·`historyReader`·`issueLoader` 주입, `getIssueWorklogs` 카운트, 쓰기 3종 뒤 `recordAppWrite`(던지지 않음, 응답 무변경)
- `src/resolver/settings/SettingsRepository.js` — 정책 키 3(`SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`·`GLOBAL_ONLY_KEYS` 동시) + `getProjectStateDetails(ids)`
- `src/resolver/settings/SettingsService.js` — normalizers 3 + `worklogHistoryEnabled` false→true 시 `historyState.markEnabled(now)`
- `src/rdb/schema/{ddl/index.js, migrate.js}` + `__test__/migrate.test.js` — v031·v032 뒤에만 추가(기존 이름 무변경)
- `src/permission/PermissionMap.js`(7) · `src/index.js`(`registerWorklogHistoryController`, `export { runWorklogHistorySweep }`)
- `manifest.yml` — scheduledTrigger `worklog-history-sweep`(hour) + function `runWorklogHistorySweep`. scope·모듈 추가 없음
- `AGENTS.md` — asApp 허용 1번 확장(§6.3 문안 + "Q72 기본 가정, 사람 확인 전" 표시)

## 마이그레이션

- `v031_create_worklog_history_table` — PK `(worklog_id, seq)`, `ix_wlh_author_changed(author_account, changed_at)`, `ix_wlh_changed(changed_at)`
- `v032_create_worklog_mirror_table` — PK `(worklog_id)`, `ix_wlm_changed(last_changed_at)`, `rev INT NOT NULL DEFAULT 1`
- 읽는 모든 경로가 `repository.ready()`(두 테이블 isTableReady) 뒤. `RetentionRepository.CHILD_TABLES` 에는 넣지 않음

## resolver 3단계 등록

| resolver | PermissionMap | 서비스 |
|---|---|---|
| `getWorklogHistory` | `{ issue:'view', issueIdKey:'issueId', appAccess:false }` | `WorklogHistoryService.getWorklogHistory` |
| `getTimesheetWorklogHistory` | `'SELF'` | `WorklogHistoryService.getTimesheetWorklogHistory` |
| `listWorklogHistory` | `{ admin:true }` | `WorklogHistoryService.listWorklogHistory` |
| `getWorklogHistoryRetention` | `{ admin:true }` | `WorklogHistoryRetentionService.getRetention` |
| `exportExpiredWorklogHistory` | `{ admin:true }` | `.exportExpired` |
| `confirmWorklogHistoryExport` | `{ admin:true }` | `.confirmExport` |
| `purgeExportedWorklogHistory` | `{ admin:true }` | `.purgeExported` |

`CONTROLLER_REGISTRARS` 에 `registerWorklogHistoryController` 추가 → `test/permission/permissionMap.contract.test.js` 통과.

## 실제 응답 shape (전부 `res.content` — 래퍼는 기존 `{success:true, content}`)

시각 epoch ms, 시간 양 초. 아래는 코드가 실제로 만드는 키 그대로다.

### HistoryItem (모든 목록 공통 — `historyItemOf` + 서비스가 `issue` 를 채운 뒤 `maskForViewer`)
```js
{
  historyId: '10234:3', worklogId: '10234', seq: 3, issueId: '10002', projectId: '10000' | null,
  issue: null                                   // getWorklogHistory(탭)
       | { visible: true, issueKey, summary, projectKey }     // 타임시트·감사 검색·내보내기(볼 수 있는 이슈)
       | { visible: false, issueKey: null, summary: null, projectKey: null }, // 보관 내보내기의 열람 불가 이슈만
  authorAccountId: '5b10…', actorAccountId: '5b10…' | null,  // null = 알 수 없음
  source: 'APP' | 'JIRA' | 'SWEEP', kind: 'CREATED' | 'UPDATED' | 'DELETED' | 'BASELINE',
  changed: { started: bool, seconds: bool, comment: bool, visibility: bool },   // UPDATED 외에는 전부 false
  before: { started, seconds, comment: CommentView | null } | null,  // UPDATED·DELETED 만 객체, CREATED·BASELINE 은 null
  after:  { started, seconds, comment: CommentView | null } | null,  // DELETED 는 null
  restricted: bool, changedAt: number, observedAt: number,
  gapPossible: bool,                            // source === 'SWEEP'
  // getTimesheetWorklogHistory 만:
  afterSubmission: bool, afterApproval: bool,
}
// UPDATED 는 started·seconds 를 앞뒤 모두 싣는다(바뀌지 않았어도). comment 는 changed.comment 일 때만 객체, 아니면 null.
// CommentView
{ empty: bool, head: string | null, headTruncated: bool, full: string | null, fingerprint: string /*11자, 빈 설명은 ''*/, masked: bool }
```
가림 규칙(`maskForViewer`): `restricted && viewer !== author` 또는 `issue.visible === false` → 존재하는 before/after comment 의 `head:null, headTruncated:false, full:null, masked:true`(fingerprint·empty 는 남는다).

### `getWorklogHistory` → WorklogHistoryView
```js
{ issueId: '10002', worklogId: '10234', authorAccountId: '5b10…' | null,
  enabled: bool, since: number | null,          // since = 처음 수집 시작 시각(startedAt)
  items: HistoryItem[] /* seq 내림차순, 최대 200 */, truncated: bool,
  users: { [accountId]: { displayName: string | null, avatarUrl: string | null } } }
```
- 이력 행이 하나도 없으면 에러가 아니라 `{…, authorAccountId: null, items: [], truncated:false, users:{}}`.
- 테이블 미준비 → 같은 빈 형태 + `enabled:false`.
- 에러: `WORKLOG_NOT_FOUND`(id 형식 밖 / 행의 issueId ≠ payload issueId), `PERMISSION_TARGET_VIEW_DENIED`(작성자·현재 팀장·앱 관리자 아님), 가드 `PERMISSION_ISSUE_VIEW_DENIED`.

### `getIssueWorklogs` 추가 필드(기존 필드 무변경)
```js
{ …기존,
  history: { enabled: bool, since: number | null },
  worklogs: [{ …기존 WorklogView, history: { changeCount, entryCount, lastChangedAt: number | null } | null }] }
```
- `history: null` = 조회자가 그 워크로그 이력을 볼 수 없음(작성자·현재 팀장·관리자 아님) 또는 꺼짐·미준비.
- 볼 수 있는데 이력이 없으면 `{ changeCount: 0, entryCount: 0, lastChangedAt: null }`(null 아님 — 프론트는 `entryCount>0` 로 "이력" 버튼).
- 이력 조회 자체가 실패하면 `history: {enabled:false, since:null}` + 전부 null(탭은 뜬다).

### `getTimesheetWorklogHistory` → TimesheetHistoryView
```js
{ requestId, subjectAccountId, periodKey: '2026-09', period: { start, end },
  submittedAt: number /* timesheet_submission.created_at */, approvedAt: number | null,
  items: HistoryItem[] /* changedAt 내림차순 → worklogId → seq, 최대 500, 볼 수 없는 이슈는 뺌 */,
  hiddenCount: number, truncated: bool, afterApprovalCount: number, users: UserMap }
```
에러: `INVALID_TARGET`(requestId 없음·TIMESHEET 아님), `REQUEST_NOT_FOUND`(요청·제출 행 없음), `PERMISSION_TARGET_VIEW_DENIED`. 미준비 → items 빈 배열(나머지 메타는 채움).

### `listWorklogHistory` → HistoryPage
```js
{ items: HistoryItem[], hiddenCount: number, nextCursor: string | null /* '<ms>|<worklogId>|<seq>' */, users: UserMap }
```
입력 검증 실패는 `INVALID_TARGET` + `cause: { field }`, field ∈ `from`·`to`(없음·to≤from·366일 초과)·`accountId`·`projectId`·`kinds`·`sources`(배열 아님 포함)·`cursor`·`limit`(정수 1..200, 기본 50). 미준비 → 빈 페이지.

### `getWorklogHistoryRetention` / `confirmWorklogHistoryExport` → HistoryRetentionView
```js
{ months: 12, monthOptions: [0,3,6,12,24,36], cutoff: number | null, expiredCount: number,
  oldestChangedAt: number | null, purgeableCount: number,
  lastExport: { cutoff, at, count, by } | null }
```
`confirmWorklogHistoryExport` 에러: `INVALID_TARGET`(cutoff 없음 / 무기한 정책). 감사 `area:'retention', action:'historyExport', detail:{cutoff,count}`.

### `exportExpiredWorklogHistory`
```js
{ cutoff: number | null, items: HistoryItem[] /* changedAt 오름차순, 200행 */, users: UserMap, nextCursor: string | null }
```
열람 불가 이슈 행은 **포함**하고 `issue:{visible:false,…null}` + 설명 가림(Q73). `INVALID_TARGET`(cursor 형식, cause `{field:'cursor'}`). 무기한·미준비 → `{cutoff, items:[], users:{}, nextCursor:null}`.

### `purgeExportedWorklogHistory`
```js
{ deleted: number, mirrorsDeleted: number, remaining: number }
```
에러: `RETENTION_EXPORT_REQUIRED`(확정 기록 없음 또는 현재 정책이 무기한), `STORAGE_NOT_READY`. 감사 `action:'historyPurge', detail:{cutoff, deleted, remaining}`. `remaining > 0` 이면 화면이 다시 부른다.

### 정책(`getApprovalSettings`·`saveApprovalSettings`)
`worklogHistoryEnabled: boolean`(기본 true), `worklogHistoryKeepComment: boolean`(기본 false), `worklogHistoryRetentionMonths: 0|3|6|12|24|36`(기본 12, 숫자 — 문자열 '12' 는 INVALID_TARGET). 셋 다 전역 전용(프로젝트 정책 저장에 넣으면 INVALID_TARGET).

## 설계서와의 계약 차이

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| D1 | `WorklogCollector.currentOf` 에 필드 3 항상 추가 | `fetchWorklogsByIdAsApp(ids, reason, { detail:true })` 일 때만 덧붙임 | drift 경로는 지금처럼 "대조용 필드만"(기존 테스트가 설명을 버리는 것을 단언). 트리거 공유 조회는 detail 로 읽으므로 drift 도 같은 Map 을 쓴다 |
| D2 | asApp `issue/bulkfetch fields=project` 위치 미지정 | `WorklogCollector.fetchIssueProjectsAsApp` (asApp 단일 지점 유지) | |
| D3 | 미러 `last_changed_at` = 행의 changedAt | **관측 시각(observedAt)** | BASELINE 의 changedAt 은 설치 전 Jira `updated` 일 수 있어, 그 값이면 수집 시작 뒤 첫 변경이 모두 "보정 감지"로 틀린다(staleBefore 비교) |
| D4 | 규칙 2(미러 있음 + 삭제) before=미러 | APP 삭제에 knownBefore 가 있고 미러와 다르면 규칙 11 처럼 SWEEP 보정 행 + DELETED(before=knownBefore) | APP 수정과 같은 일관성 |
| D5 | 규칙 7(미러 없음 + APP 수정) | 값이 같으면(`diffMask=0`) `none` — 행·미러 없음 | 다음 트리거·스윕이 BASELINE 으로 잡는다 |
| D6 | `purgeMirrorBatch` 서브쿼리 `WHERE changed_at >= ?` | `NOT IN (SELECT worklog_id FROM worklog_history)`(조건 없음) | SWEEP 삭제 행은 changed_at 이 피드 시각이라 cutoff 이전일 수 있다 — 이력이 남은 미러를 지우면 seq 1 이 다시 쓰여 PK 가 겹친다 |
| D7 | purge cutoff = lastExport.cutoff | `min(lastExport.cutoff, 현재 정책 cutoff)`, 정책이 무기한이면 `RETENTION_EXPORT_REQUIRED` | 확정 뒤 보관 기간을 늘렸을 때 정책보다 많이 지우지 않게 |
| D8 | `getWorklogHistory` 행 없음 처리 미지정 | 빈 뷰(`authorAccountId:null`) — 에러 아님 | 이력이 없는 워크로그 펼침이 에러로 뜨지 않게 |
| D9 | 탭 카운트 `history` 는 볼 수 있으면 WorklogHistoryCount | 볼 수 있는데 행이 없으면 `{0,0,null}` | 프론트가 null(권한·꺼짐)과 "아직 없음"을 구분 |
| D10 | `since` 정의 "수집 시작 시각" | `startedAt`(처음 켜진 시각). 다시 켠 시각(`enabledSince`)은 응답에 없음 | |
| D11 | 설명 앞부분 VARCHAR(48) | 40 코드포인트 + 잘림 표식 `…`(41번째) 저장 → 읽을 때 `headTruncated` 복원 | 정확히 40자 원문과 잘린 원문 구분 |
| D12 | `getIssueWorklogs` 필드 항상 | 운영 싱글턴(`historyReader` 주입)에서만 추가. 주입 없는 테스트 인스턴스는 기존 shape | 기존 `toEqual` 테스트 무변경. 운영 응답에는 항상 있다 |
| D13 | APP 경로 프로젝트: 생성은 asUser loadIssue | 생성: 쓰기와 병렬 loadIssue. 수정·삭제: 미러가 없을 때만 asUser loadIssue(지연) — **APP 경로는 asApp bulkfetch 를 쓰지 않는다** | 불변식 8 |
| D14 | — | 작성자를 모르는 current(`authorId` 없음)는 `unreadable` 로 본다 | `author_account NOT NULL`, 주인 없는 이력 금지 |

## 미검증(04_spike_todo.md 에 추가)

기존 H1~H14 그대로 유효. 새로 **H15~H19**:
- H15 Jira 가 설명 없는 워크로그의 `comment` 를 생략하는가(구현: 없음=빈 설명) — H2 실패와 구분 불가 위험
- H16 TIMESTAMP 초 정밀도 vs staleBefore(ms) — 표시만 영향
- H17 `purgeMirrorBatch` 의 전체 `NOT IN` 서브쿼리 성능(H8 과 함께)
- H18 asApp bulkfetch 403/400 시 그 묶음 미수집(H3 축)
- H19 `approval_project_config.updated_at` 이 정책 저장에도 바뀜 → 그 프로젝트 다음 변경 1건이 "보정 감지" 표시

배포 회차 메모: scheduledTrigger 4개째(approval-sweep·timesheet-sweep·workforce-publish·worklog-history-sweep) — `--upgrade` 필요, major 여부는 H10.

## 새 질문

없음(Q78 미추가). Q72 는 기본 가정 (a)로 AGENTS.md 에 반영했고, 문구에 "사람 확인 전" 을 남겼다.

## 발견(범위 밖 — 고치지 않음)

- `TimesheetDriftService` 와 `JobLease` 의 리스·커서 코드가 중복이다(설계 §4.5 의 의도된 임시 상태). 통합은 후속.
- i18n: 새 에러 코드 없음 → `locales/*/error.json` 변경 불필요. 설계 §8 의 `worklogHistory.json`·`policy.json`·`data.json` 키는 프론트 몫.

## 프론트가 알아야 할 것(요약)

- 탭: `getIssueWorklogs` 의 `worklogs[].history`(null 이면 버튼 없음, `changeCount>0` "수정 N회", `entryCount>0` "이력"), 최상위 `history.since`.
- 펼침: `getWorklogHistory({issueId, worklogId})` → `items[]`(최신 먼저). `issue` 는 null.
- `before`/`after` 가 null 일 수 있고, `comment` 는 바뀐 행에서만 객체다. `masked:true` 면 `comment.masked` 문구.
- 쓰기 후 `worklogHistoryKeys.all` 무효화(응답 shape 은 무변경).
