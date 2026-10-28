# worklog-history 검증 리포트 (회차 1)

> 작성: integration-verifier · 2026-10-04 · autopilot 무인 회차(Phase 5)
> 기준: `01_architect_design.md`(계약) + `02_backend_report.md` D1~D14(실제 구현 우선) + `02_frontend_report.md` F1~F5
> forge 명령·git 쓰기 없음. 소스 수정 없음.

## 판정: **PASS**

통과 31 / 실패 0 / 미검증 2(실측 필요 — 아래)

## 실행 결과 (직접 재실행, 보고서 수치 아님)

| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공 — `ko-KR.json`·`en-US.json` 생성, `worklogHistory` 네임스페이스 포함 |
| 백엔드 `npx jest --runInBand` | **72 suites / 966 tests 전부 통과**(기준선 64/866 → +8/+100) |
| UI `npm run test:ui -- --runInBand --watchAll=false` | **31 suites / 240 tests 전부 통과**(기준선 27/203 → +4/+37) |
| `npm run build:ui` | **성공(exit 0)**. html 6개(inbox·issue·modal·projectSettings·settings·worklog) 생성 |

## 필수 수정 (F)

없음.

## 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자 (반환 shape) | 소비자 (접근 경로) | 일치 |
|---|---|---|---|
| `getWorklogHistory` | `WorklogHistoryService.js:116-150` `{issueId, worklogId, authorAccountId, enabled, since, items, truncated, users}`(행 없음·미준비 = 빈 뷰) | `features/worklogHistory/WorklogHistoryPanel.jsx:31-73` `data.enabled/since/items/users/truncated` | 일치 |
| `getIssueWorklogs`(+history) | `WorklogService.js:129-139` `history:{enabled,since}`, `worklogs[].history: {changeCount,entryCount,lastChangedAt}|null` (D12: 주입 없으면 키 없음) | `WorklogTab.jsx` `historyButtonOf(worklog.history)`, `first?.history ?? null` → `?.enabled`·`since` | 일치(null·부재 동일 취급) |
| `getTimesheetWorklogHistory` | `WorklogHistoryService.js:180-230` `{…meta, items(+afterSubmission/afterApproval/issue), hiddenCount, truncated, afterApprovalCount, users}` | `TimesheetHistorySection.jsx:102-142` | 일치 |
| `listWorklogHistory` | `WorklogHistoryService.js:263-285` `{items, hiddenCount, nextCursor, users}` | `WorklogHistoryAuditSettings.jsx:111-123`(useInfiniteQuery `lastPage.nextCursor`), `exportWorklogHistoryExcel.js:77-92` | 일치 |
| `getWorklogHistoryRetention` | `WorklogHistoryRetentionService.js:55-71` `{months, monthOptions, cutoff, expiredCount, oldestChangedAt, purgeableCount, lastExport}` | `WorklogHistoryRetentionSection.jsx` `data.*` | 일치 |
| `exportExpiredWorklogHistory` | `…RetentionService.js:85-124` `{cutoff, items, users, nextCursor}` | `exportWorklogHistoryExcel.js:111-126` | 일치 |
| `confirmWorklogHistoryExport` | `…RetentionService.js:127-140` → HistoryRetentionView | `exportWorklogHistoryExcel.js:136` → `result.retention` → `setQueryData(settingsKeys.worklogHistoryRetention())` | 일치 |
| `purgeExportedWorklogHistory` | `…RetentionService.js:146-178` `{deleted, mirrorsDeleted, remaining}` | `WorklogHistoryRetentionSection.jsx:18-26` `deleted`·`remaining` 반복 | 일치 |
| `saveApprovalSettings`(정책 3키) | `SettingsService.saveApprovalSettings` → `{...policy, approvalGroups}` | 보관 기간 `{worklogHistoryRetentionMonths:number}` → `settingsKeys.policy()` set / 정책 폼 `toTimesheetPatch` boolean 2 | 일치(숫자 enum, 문자열 거부) |

- `invokeApproval` 가 `content` 를 벗긴다 — 소비자 중 `.content` 재접근 없음.
- HistoryItem 필드(snake→camel): `WorklogHistoryRepository.historyFromRow` → `historyItemOf` → `maskForViewer` → `historyFormat`/`WorklogHistoryList` 의 `item.*`·`comment.{empty,head,headTruncated,full,masked}`·`issue.{visible,issueKey,summary}` 까지 일관.
- 시각은 모두 epoch ms 응답, SQL TIMESTAMP 바인딩은 `toSqlTimestamp`/`fromSqlTimestamp` 경유. `before/after_started` 는 BIGINT(ms) 이고 `listByAuthorPeriod` 의 기간 값(`findSubmission` → `fromSqlTimestamp` ms)과 단위가 같다.
- 에러 분기는 `error.code` — `PERMISSION_TARGET_VIEW_DENIED`(전용 문구), 그 밖 `error.<code>`. 쓰이는 코드(`WORKLOG_NOT_FOUND`·`REQUEST_NOT_FOUND`·`INVALID_TARGET`·`RETENTION_EXPORT_REQUIRED`·`STORAGE_NOT_READY`·`PERMISSION_ISSUE_VIEW_DENIED`·`PERMISSION_DENIED`·`UNKNOWN_ERROR`)가 `locales/{kr,en}/error.json` 양쪽에 있음. 새 에러 코드 없음.

## 점검표

**등록**
- [x] 7개 resolver 가 `WorklogHistoryController.js`(guardedDefine 7) + `PermissionMap.js`(7) + `index.js` `CONTROLLER_REGISTRARS`(`registerWorklogHistoryController`) 세 곳에 있다. `permissionMap.contract.test.js` 통과
- [x] 프론트 `invokeApproval` 이름 7종이 등록 이름과 정확히 같다(그 밖 `listProjects`·`searchUsers`·`getApprovalSettings`·`saveApprovalSettings`·`getIssueWorklogs` 는 기존)
- [x] `manifest.yml` — scheduledTrigger `worklog-history-sweep` + function `runWorklogHistorySweep`, `index.js` export 일치. app id 변경 없음. scope 추가 없음

**불변식**
- [x] 1 (열린 요청 하나) — 이 기능은 요청을 만들지 않음. 해당 없음
- [x] 3 도메인 순수 — `src/domain/timesheet/worklogHistory.js` 에 `Date.now()`·무인자 `new Date()` 없음(`new Date(now)` 만), SQL·fetch 없음
- [x] 4 CAS — `casMirror` `SET … rev = rev + 1 WHERE worklog_id=? AND rev=?`, `JobLease` 두 UPDATE 모두 `rev = rev + 1`. 미러 신규는 `INSERT IGNORE`
- [x] 5 결재자 행 — 건드리지 않음
- [x] 6 결정적 id — 이력 PK `(worklog_id, seq)`, `historyId = worklogId:seq`, seq 는 미러 `last_seq+1`. 같은 이벤트 2회·이벤트/스윕 경합 테스트(Recorder 1·2a·2b·3a·3b·4) 통과
- [x] 7 범위 — 형제 resolver 전수:
  - 탭 펼침 `getWorklogHistory`: 가드 `{issue:'view'}` + 행 `issueId ≠ payload` 면 `WORKLOG_NOT_FOUND` + 작성자/현재 팀장(`TimesheetAccess.canView`→`TeamScope.leads`)/앱 관리자
  - 탭 카운트 `countsForIssue`: asUser 목록의 워크로그만, 같은 규칙(`TeamScope.membersOf` — `leads` 와 같은 함수) — 카운트만 내보냄
  - 타임시트 `getTimesheetWorklogHistory`: `TimesheetAccess.canView`(getTimesheetDetail 과 동일) + 행마다 `filterVisibleIssues`(asUser `permissions/check`), 실패 시 전부 숨김(fail-close)
  - 감사 검색 `listWorklogHistory`: `{admin:true}` + `filterVisibleIssues` 로 행 제외·`hiddenCount`
  - 보관 내보내기 `exportExpiredWorklogHistory`: 열람 불가 이슈 행은 가린 채 포함(Q73 기본 가정, 설계 의도) — 이슈 메타 null·설명 가림
  - 제한 공개 워크로그 설명은 작성자에게만(`maskForViewer`) — 모든 경로 동일
- [x] 8 asApp — 새 호출은 `WorklogCollector.fetchWorklogsByIdAsApp(…, {detail})`(사유 `worklog-history-trigger`/`-sweep`)과 `fetchIssueProjectsAsApp`(사유 `worklog-history-project`) 둘, 호출부는 `WorklogHistoryRecorder` 의 트리거·스윕 경로뿐. APP 경로(우리 화면 쓰기)는 `ctx.loadProject`(asUser `loadIssue`)만 쓴다(`Recorder.js:123-127`). asApp 결과는 DB 저장에만 쓰이고, 조회는 전부 위 7 의 재좁힘을 거친다. `WorklogGateway` 는 asApp 미import 유지. `AGENTS.md` asApp 1번 확장 문안 반영(Q72 "사람 확인 전" 표시)
- [x] 9 엔티티 프로퍼티 — 사용 없음
- [x] 10 validator — 해당 없음
- [x] append-only — `worklog_history` UPDATE 문 없음, DELETE 는 `purgeHistoryBatch` 하나, 쓰기 resolver 는 `confirmWorklogHistoryExport`·`purgeExportedWorklogHistory`(둘 다 `{admin:true}`) — 계약 테스트 통과
- [x] 트리거 throw 금지 — `onWorklogChanged` 세 단계 각각 try/catch, Recorder 전 경로 삼킴. 설명 원문 로그 없음

**SQL·스키마**
- [x] `whereIn` 빈 배열 가드 — `findMirrors`·`countByWorklogIds`·`findHistoryRows`·`insertHistory`·`getProjectStateDetails`·`search`(kinds/sources 길이 조건) 모두 빈 입력에서 SQL 미발행
- [x] `isTableReady` 프로브 — 모든 읽기 경로 `repository.ready()`(두 테이블) 뒤, `countExpired` 는 자체 프로브, 스윕은 `primeTableReadiness` + `approval_job_state` 확인, 트리거는 `wants()` 에서 확인. 미준비 = 빈 결과(에러 아님)
- [x] 마이그레이션 `v031_create_worklog_history_table`·`v032_create_worklog_mirror_table` — 끝에만 추가, 기존 이름 무변경, 중복·역순 없음, `migrate.test.js` 이름 목록·PK·rev 단언 통과
- [x] 정책 키 3개(`worklogHistoryEnabled` true / `worklogHistoryKeepComment` false / `worklogHistoryRetentionMonths` 12)가 `SETTINGS_KEYS`·`DEFAULT_APPROVAL_SETTINGS`·`GLOBAL_ONLY_KEYS`·`normalizeSettingsPatch` 에 같은 집합으로 있다. `SettingsPolicyKeys.test.js`·`SettingsWorklogHistory.test.js` 통과

**프론트·배포 단위**
- [x] 엔트리 추가 없음(기존 `worklog`·`modal`·`settings` 안) → craco·public·manifest 3곳 변경 불필요. 감사 화면은 `React.lazy` + `importWithReloadOnce`
- [x] i18n 키 대칭 — 직접 대조: `worklogHistory` 79/79, `data` 63/63, `policy` 175/175, `error` 60/60, 한쪽에만 있는 키 0. `worklogHistoryI18n.test.js` 가 화면 사용 키(리터럴+동적)를 두 사전에서 확인
- [x] 화면 하드코딩 한글 없음(주석 제외 grep 0건)
- [x] 쿼리키 팩토리 — `worklogHistoryKeys{all,worklog,timesheet,audit}`, `settingsKeys.worklogHistoryRetention()`. 탭 쓰기·삭제 뒤 `worklogKeys.all`+`worklogHistoryKeys.all` 함께 무효화
- [x] `TimesheetPolicySettings` 의 새 2키는 전역 설정 화면에서만 쓰인다(프로젝트 정책 저장 경로 아님 — `GLOBAL_ONLY_KEYS` 거부와 충돌 없음)

## 권고 (R) — 고치지 않음

- **R1** `AGENTS.md` asApp 1번 확장은 Q72 기본 가정(사람 확인 전). 사람 답이 (a)가 아니면 `fetchIssueProjectsAsApp`·트리거 이력 기록 경로 재설계 필요.
- **R2** 전역 수집을 끄면 `countsForIssue` 가 모든 `history` 를 null 로 내 탭에서 기존 이력 버튼이 사라진다(이미 쌓인 이력은 관리자 감사 검색으로만 접근). 감사 목적상 "꺼도 과거 이력은 탭에서 보기"가 맞는지 제품 판단 — 열린 질문 Q80 으로 올림.
- **R3** `getIssueWorklogs` 한 번에 이력 쪽 호출이 추가된다(KVS 2 + `isTableReady` 2 + `leadScope` + 필요 시 관리자 판정 + GROUP BY 1). 탭 첫 표시 지연을 배포 회차에 측정.
- **R4** 탭 목록(asUser)에 보이지 않는 제한 공개 워크로그라도 worklogId 를 알면 팀장·관리자는 `getWorklogHistory` 로 시작·시간을 본다(설명은 가림). Q71 규칙과 일치하지만 H14 실측 결과에 따라 탭 경로도 "목록에 없는 워크로그는 거부"로 좁힐지 검토.
- **R5** `TimesheetDriftService` 와 `JobLease` 의 리스·커서 코드 중복(설계상 임시) — 후속 통합.
- **R6** `purgeMirrorBatch` 의 전체 `NOT IN` 서브쿼리(H8·H17) — 실측 실패 시 2단계 삭제로.

## 열린 질문

- **Q80** 전역 이력 수집을 끈 동안 작업 로그 탭에서 이미 쌓인 이력(“수정 N회” 버튼·펼침)을 계속 보여 줄 것인가. 현재 구현: 숨김(카운트 null). 기본 가정: 현재 구현 유지.

## 미검증

- 배포 환경 동작 전부 — `04_spike_todo.md` H1~H21(특히 H4 두 읽기 경로 정규화 일치, H7 `INSERT IGNORE` 복합 PK, H8/H17 서브쿼리 DELETE, H10 scheduledTrigger 추가·major 여부). 무인 회차는 forge 금지라 실행 불가. 확인 방법은 spike_todo 표대로.
- 새 항목 **H22**: `getIssueWorklogs` 응답 지연(R3) — 워크로그 50건 탭을 팀장 계정으로 열어 이력 추가 전후 응답 시간 비교.
