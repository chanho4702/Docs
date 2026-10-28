# 검증 리포트 (회차 1) — audit-trail

작성: 2026-10-10 · integration-verifier · 입력 `01_architect_design.md`(계약), `02_backend_report.md`(1·2회차 + 마이그레이션 재정렬 기록), `02_frontend_report.md`(1·2회차), 실제 소스·`git status`.
열린 질문 Q112~Q118: 설계 기본 가정으로 확정해 검증했다(`_workspace/QUESTIONS.md` 454~473행에 등록돼 있음).

## 요약  통과 27 / 실패 1 / 미검증 7

실행 5종은 전부 통과(직접 다시 돌림). 경계면에서 실패 1건 — 결재 감사 행의 "상세 열기"가 관리자에게 열리지 않는 종류가 있다.

## 실패

- **[static/ui/src/features/audit/ApprovalAuditTab.jsx:28-47 (`openDetail`·`TargetCell`) ↔ src/resolver/approval/ApprovalService.js:379-384 (`getApprovalDetail` → `assertTargetVisible`)]**
  결재 감사의 모든 행에 대상 제목 버튼(→ `main/modal` intent `detail` → `getApprovalDetail`)이 붙는다. 그런데 상세 resolver 는 어댑터의 `canView` 로 다시 판정한다:
  - `TIMESHEET` → `src/resolver/timesheet/TimesheetAccess.js:20-32` — 본인·참여자·위임받은 사람·현재 팀장만. 주석 그대로 "관리자는 못 본다(Q9)".
  - `WORKLOG_CREATE` → `src/resolver/approval/target/WorklogCreateTargetAdapter.js:24-29` — 이슈 열람 **그리고** 참여자/위임자.
  - `WORKLOG_CERTIFICATION`(옛 요청형) → `WorklogCertificationTargetAdapter.js:16-17` — 워크로그 자체가 asUser 로 읽혀야 함(제한 공개 워크로그면 거부).

  감사 화면 사용자는 `{admin:true}` 라 위 종류에서 참여자가 아니면 버튼을 눌렀을 때 모달이 `PERMISSION_DENIED` 로 뜬다. 감사 목록은 관리자에게 그 행을 보여 주는데 상세는 막는다 — 같은 화면 안에서 두 resolver 의 범위가 어긋난다. 프론트 테스트는 상세 모달 호출을 mock 으로만 확인해서 이 경로를 잡지 못한다.
  → 고치는 방법(택1, 리더가 결정):
  (a) **frontend**: `targetKind ∈ {TIMESHEET, WORKLOG_CREATE, WORKLOG_CERTIFICATION}` 이면 제목을 버튼 대신 텍스트로 보여 준다(`ISSUE`·`ISSUE_TRANSITION`·`FIELD_CHANGE` 는 이슈 열람만 보므로, 감사가 이미 가시성으로 거른 행이면 열린다). 테스트에 종류별 버튼 유무 단언을 추가한다.
  (b) **backend**: 감사 응답 `request` 에 `canOpenDetail` 을 가산하는 것은 행마다 어댑터 판정이 필요해 비용이 크다 — 권장하지 않는다.
  (c) 관리자에게 상세를 열어 주려면 `TimesheetAccess` 의 Q9 결정을 바꾸는 일이라 사람 확인이 먼저다(아래 미검증 U1).
  담당: **frontend**(a 기준).

## 미검증

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| U1 | **제품 확인**: 결재 감사가 관리자에게 `TIMESHEET`·`WORKLOG_CREATE` 이벤트(제목·대상자·사유 포함)를 보여 준다 | 설계 §2.6 이 "TIMESHEET 는 관리자에게 그대로"로 정했고 Q118(a)로 관리자 전용이다. 다만 타임시트 열람의 단일 출처(`TimesheetAccess`, Q9)는 "관리자는 못 본다"이고, Q9 의 대안이 바로 "`{admin}` 축 읽기 전용 resolver 추가"다 — 이번 기능이 그 대안을 사실상 채택한 셈이다. 코드 결함은 아니지만 Q9 기본 가정과 겹친다 | 사람이 Q9·Q118 을 함께 보고 "감사 목적이면 관리자가 타임시트 결재 이력을 본다"를 확정. 확정되면 Q9 에 각주, 아니면 TIMESHEET 행을 가리는 규칙 추가(backend) |
| U2 (A7) | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS …`(v054~v056)가 TiDB 에서 멱등·성공 | 실측 필요(dev 배포 금지 회차) | 배포 → 아무 화면 1회 → KVS `schema:version` = `v056_index_approval_event_delegate`, 재호출에 `[MIGRATE]` 오류 없음 |
| U3 (A8) | `listApprovalAudit` 행위자 필터의 `e.event_id IN (SELECT … UNION SELECT …)` 허용·인덱스 사용 | 실측 필요 | 감사 > 결재에서 행위자 지정 검색, 합성 1만 행 응답 시간. 안 되면 두 질의 키셋 병합 |
| U4 (A10) | `rms.org` VERIFIED sticky(워크포스 게시물 삭제 뒤에도 연결 판정 유지) | 두 앱 dev 필요. 코드상으로는 `WorkforceInbound.nextRow` 가 저장 VERIFIED 를 유지함을 확인 | `04_spike_todo.md` A10 |
| U5 (A11·A5) | `user/bulk` 의 `accountType` 이 앱·비활성 계정에도 오는지, 자동화 워크로그의 `updateAuthor` 종류 | 실측 필요 | `04_spike_todo.md` A11·A5 |
| U6 | 업무함 iframe 안 실제 탭 전환·링크 왕복·엑셀 다운로드 | 배포 금지 회차. jsdom 테스트로만 확인 | dev 배포 후 감사 4탭에서 "같은 사람·같은 기간" 링크 왕복, `?setting=worklogHistory` 직접 진입 |
| U7 | 인증 묶음 요약 `current.certifiedSeconds` 와 인증 매트릭스 숫자 차이 | 감사 요약은 설계 §2.4 대로 현재본 `cert_seconds` **원값 합**이고, 매트릭스(`monthTotals`)는 정책 `ZERO` 일 때 감소·삭제를 반영한 `countedSeconds` 합이다. `ZERO` 사이트에서 두 화면 숫자가 다를 수 있다(결함 아님 — 의미가 "인증 당시 시간"). 건별 펼침의 `countedSeconds` 는 매트릭스와 같은 함수 | 사람이 라벨("인증 시간")로 충분한지 확인. 필요하면 요약에 `countedSeconds` 가산(backend) |

## 통과

### 경계면 표

| resolver | 생산자(파일:라인, 반환 shape) | 소비자(파일:라인, 접근 경로) | 일치 |
|---|---|---|---|
| `listApprovalAudit` | `src/resolver/audit/ApprovalAuditService.js:47-80` → `{items, hiddenCount, nextCursor, users}`, 항목은 `domain/audit/approvalAudit.js:140-163` | `ApprovalAuditTab.jsx:76-90`(`page.items`·`hiddenCount`·`nextCursor`·`users`), `exportAuditExcel.js:105-140`(`request.{targetKind,title,issueKey,requesterAccountId,subjectAccountId,periodKey,status,requestId}`, `step.{order,name}`) | 일치. `content` 이중 접근 없음 |
| `listCertificationAudit` | `CertAuditService.js:66-103` → `{items, filteredCount, nextCursor, users}` + includeItems 일 때 `itemsByBatch`·`hiddenCount` | `CertificationAuditTab.jsx:106-118`, `exportAuditExcel.js:234`(includeItems, limit 10) | 일치 |
| `getCertificationBatchAudit` | `CertAuditService.js:105-125` → `{batch, items, hiddenCount, users}` | `CertBatchItems.jsx:31-40`(`items[].{worklogId,issueId,issue,certifiedStarted,certifiedSeconds,countedSeconds,state,stateChangedAt,selfCertified,frozen}`) | 일치. `DELETED`→`DELETED_AFTER_CERT` 배지 매핑, `SUPERSEDED` 전용 배지 |
| `listWorklogHistory`(가산) | `WorklogHistoryService.js:262-285`(`linkedOnly` boolean 검증), Repository `search` 314·333행(`wf_linked = 1`, 칼럼 미준비면 빈 결과) | `WorklogHistoryAuditSettings.jsx:56`, `worklogHistoryAuditModel.js:33`(체크 시에만 `linkedOnly:true`) | 일치 |
| `listSettingsAudit`(2회차) | `SettingsService.js` `createListSettingsAudit` → `{items, nextCursor, users}`, from·to 함께·≤366일 | `AuditSettings.jsx:49-54`(`settingsPayloadOf` 가 from·to 를 늘 함께), `exportAuditExcel.js:287` | 일치. 입력 없으면 예전 동작 |
| `getRetention`·`getWorklogHistoryRetention`·`listProjects` | 기존(`{admin:true}`) | `AuditPage.jsx:30,36`, `AuditFilters.jsx:57` | 일치 |
| `get/saveApprovalSettings` `worklogHistoryScope` | `SettingsService.js:138` enum 3값 | `TimesheetPolicySettings.jsx` Select | 일치 |

### 점검표

**등록**
- [x] 신규 3개 — `AuditController.js` `guardedDefine` ×3, `PermissionMap.js:212-214` `{admin:true}` ×3, `src/index.js:23,67` `registerAuditController`. 계약 테스트(`permissionMap.contract`·`auditReadOnly.contract`) 통과
- [x] 프론트 fn 이름 = 등록 이름(`listApprovalAudit`·`listCertificationAudit`·`getCertificationBatchAudit`·`listSettingsAudit`·`listWorklogHistory`)
- [x] 변경된 `listSettingsAudit`(`PermissionMap.js:67`)·`listWorklogHistory`(203) 축 무변경

**shape**
- [x] 필드 snake → camel: `approval_event`·`approval_request` 칼럼(`ddl/approvalEvent.sql.js`·`approvalRequest.sql.js`) ↔ `ApprovalAuditRepository.eventFromRow` ↔ 도메인 투영 ↔ 화면. `worklog_cert*` 칼럼(`ddl/worklogCert.sql.js`) ↔ `CertAuditRepository` `CERT_SELECT`·`LOG_SELECT`·`batchFromRow` / `certFromRow` — 칼럼명·BINARY(16) `BIN_TO_UUID` 처리 일치
- [x] 실패 분기 `error.code`(+`cause.field`) — `AuditFilters.jsx:108-113`. 사용 코드 `INVALID_TARGET`·`REQUEST_NOT_FOUND`·`PERMISSION_DENIED` 모두 `locales/{kr,en}/error.json` 에 있음. 새 코드 없음
- [x] 시각: 응답 epoch ms(`fromSqlTimestamp`), 바인딩 `toSqlTimestamp`(결재·인증·설정 감사 Repository 전부). 프론트는 정수 ms 만 보냄(서버는 문자열 거부)
- [x] 커서 `'ms|uuid'` — `event_id`·`batch_id` 모두 `UUID_TO_BIN(?)`(swap 없음)로 저장되고 커서 비교도 같은 변환이라 정렬·키셋 일치

**불변식**
- [x] 3 도메인 순수 — `src/domain/audit/*` 에 `Date.now`·무인자 `new Date()`·SQL 없음(정적 단언 테스트 포함)
- [x] 4·5 — 감사 경로 UPDATE 없음. `approval_approver` 읽기만
- [x] 6 — 행 key `event_id`·`batch_id`·`worklogId`, `wf_linked` 는 기존 `(worklog_id, seq)` INSERT IGNORE 에 칼럼만
- [x] **7 이슈 열람 가림** — 결재: `isIssueBound` 행만 asUser `filterVisibleIssues`, `visible` 에 있는 것만 남기고 `hiddenCount = rows - kept`. `filterVisibleIssues` 는 판정 실패 묶음을 `visible` 에 넣지 않고(JiraPermission.js:202-212), 서비스는 throw 를 `EMPTY_VISIBILITY` 로 받아 이슈 행 전부 제외(**fail-close**). TIMESHEET 는 가시성 호출 없이 통과(설계대로 — U1 참고). 인증: 요약은 숫자만, 건(펼침·includeItems)은 같은 규칙. `nextCursor` 는 SQL 페이지 기준이라 가림으로 멈추지 않음
- [x] 8 — 새 Jira 호출 전부 asUser(`permissions/check`·`bulkfetch`·`user/bulk`). asApp·AGENTS 허용 목록 변경 없음
- [x] **9 프로퍼티 불신** — `WorkforceLinkRepository.verifiedLinkSignals`(413-451행)는 `workforce_inbound WHERE status = 'VERIFIED'` 만, 묻지 않은 id·`I:` 정책 행은 버림. VERIFIED 는 `WorkforceInbound.nextRow`(서명 `verifyEntry` 통과 시)·`WorklogPolicyAuthority.refreshOne`(`verifyPolicyEnvelope` 통과 시)만 쓴다. `rms.policy` entity_id `P:{projectId}` 형식이 쓰는 쪽(WorklogPolicyAuthority.js:12)과 읽는 쪽 일치. `movesRmsLink` 등 프로퍼티 원문 읽기 없음
- [x] 감사 resolver 쓰기 없음 — `auditReadOnly.contract.test.js`(이름 list/get·소스에 INSERT/UPDATE/DELETE 없음·`worklog_history` UPDATE 없음) 통과, 직접 소스 확인. `listSettingsAudit` 도 읽기만
- [x] 1·2·10 해당 없음(요청 생성·상태 재계산·validator 없음)

**인증 모델 교차(`listCertificationAudit`)**
- [x] 상태 값 = `StoredState`(CERTIFIED/MISMATCH/DELETED) + 감사 전용 SUPERSEDED. 묶음 요약의 상태별 건수 기준(저장 state)이 매트릭스 `monthTotals` 와 같다
- [x] `countedSeconds` 는 cert `counting.countedSeconds` 재사용(재구현 없음), 정책은 `certPolicyOf(getPolicy())` — 매트릭스와 같은 출처
- [x] 신호는 cert `summary.decodeFrozen` 재사용, `policy_json` 키(`u`·`d`·`rev`)가 `policyJsonOf` 와 일치
- [x] `mode` 값 = 인증 쓰기 경로가 강제하는 `certPolicy.unit`(ENTRY/MONTH)

**정책 키 `worklogHistoryScope`**
- [x] `SETTINGS_KEYS`(KVS `approval:settings:worklogHistoryScope`)·`DEFAULT_APPROVAL_SETTINGS`(`PROJECT_OR_LINKED`)·`GLOBAL_ONLY_KEYS` 세 곳 + normalizer enum 3값. `SettingsPolicyKeys.test.js` 통과. Recorder 는 모르는 값이면 기본으로

**마이그레이션**
- [x] 순서: v049~v051 인증 테이블(인증 인덱스 인라인) → **v052 `wf_linked` 칼럼** → v053 미러 인덱스 → v054~v056 `approval_event` 인덱스. 칼럼·테이블이 모든 인덱스 마이그레이션보다 앞
- [x] v049 이후는 HEAD 에 없음(`git show HEAD:src/rdb/schema/migrate.js` 는 v048 까지) — 미배포 재정렬이라 이름 변경 허용 범위
- [x] 번호 중복·역순 없음, `LATEST_MIGRATION` = `v056_index_approval_event_delegate`, `migrate.test` 통과
- [x] `wf_linked` 읽기·쓰기는 `isColumnReady` 뒤에만(마커 현재면 SQL 0), 미준비면 기존 INSERT·SELECT

**유휴 비용**
- [x] manifest 무변경(`git diff --stat manifest.yml` 비어 있음) — 새 `scheduledTrigger`·`consumer` 없음
- [x] `idleSqlBudget.test.js` 통과. 이번 diff 의 수정(12→13)은 인증 모델 몫이고 audit-trail 은 상한을 바꾸지 않음
- [x] 빈 피드: `Recorder.observe` 가 `valid.length === 0` 이면 신호 조회 전에 반환. `PROJECT` 모드는 신호 SQL 0. 연동 끔(KVS)·테이블 미준비면 SQL 전 `OFF`
- [x] 감사 조회는 화면을 열 때만, fire-and-forget 없음

**프론트·배포 단위**
- [x] 엔트리 추가 없음(설정 화면 안 탭) — craco·public·manifest 무변경
- [x] i18n: `audit`·`worklogHistory`·`policy`·`error` 네임스페이스 kr/en 키 집합 동일(직접 대조), `npm run merge` 통과, 소비 키(`state.status.*`·`audit.approval.stepOrder`·`policy.settings.tab.audit` 등) 병합본에 존재. 엑셀 ID 칼럼 영문 라벨('Request ID' 등)은 기존 `exportWorklogHistoryExcel` 관례와 같음
- [x] 쿼리키 팩토리 — `auditKeys.{approval,certification,certBatch}`, `settingsKeys.auditSearch`(기존 `settingsKeys.audit()` 접두 무효화 유지)
- [x] **링크 왕복** — `makeSeed`/`applySeed`(auditModel.js): 결재(행위자→actor, 대상자/요청자→requester) ↔ 인증(인증자→actor, 대상자→subject, 월 키면 `periodKey`) ↔ 워크로그(`accountId`) ↔ 설정(행위자). 대상 탭이 seed 로 사람 필터 state 까지 초기화(`WorklogHistoryAuditSettings.jsx:44`, `AuditSettings.jsx:42`)
- [x] **옛 `setting=worklogHistory`** — `normalizeSetting` 이 `audit` 로, `InboxPage.jsx:177-184` 가 `auditTab=worklog` 로 replace, `auditTabOf` 테스트 있음. 서버가 이 링크를 만드는 곳 없음(grep)

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 — `ko-KR.json`·`en-US.json` 생성 |
| `npm test -- --runInBand` | 통과 — **126 suites / 1,836 tests** (백엔드 2회차 보고와 같은 수) |
| `npm run test:ui -- --runInBand` | 통과 — **54 suites / 471 tests** (프론트 2회차 보고와 같은 수) |
| `npm run build:ui` | 통과 — "Compiled with warnings": 기존 경고뿐(`@atlaskit/analytics-next-stable-react-context` source map, `react-select` postcss-calc) |
| `npx forge lint` | 통과 — No issues found |

## 참고(범위 밖, 판정에 넣지 않음)

- 작업 트리의 `src/integration/workforce/contract.js`·`vectors.json` 수정은 인증 모델(`APPROVAL_CERT`) 변경이다. audit-trail 은 계약을 바꾸지 않았다(설계 §1 "계약 무변경"과 일치).
- `listWorklogHistory` 는 `from`·`to` 문자열을 `Number()` 로 받아 주고 새 감사 resolver 는 정수만 받는다(백엔드 보고 "발견"). 프론트는 정수만 보내므로 지금은 문제없다.
