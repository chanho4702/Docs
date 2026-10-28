# 검증 리포트 (회차 1) — audit-retention-sync

작성 2026-10-11 · 검증자 integration-verifier · 기준: 승인 앱 `master`(HEAD `01e7441` + 미커밋 66파일), 워크포스 `RFC-220`(HEAD `4788a77` + 미커밋)
입력: `00_input/requirement.md`(Q131~Q135), `01_design_notes.md`, `02_backend_report.md`, `02_frontend_report.md`, `05_workforce_report.md`
보고서 수치는 믿지 않고 전부 직접 다시 실행했다. 커밋·배포·forge deploy 없음. 소스 수정 없음.

## 요약  통과 34 / 실패 0 / 미검증 8 (+ 관찰 7)

차단 결함 없음. 두 리포 테스트·빌드·lint 전부 통과, 계약 파일 7개 sha256(LF 정규화) 일치.
워크포스 UI 첫 실행에서 무관 파일 1건(`kanbanPagination.test.jsx`, 이번 변경 밖·미수정)이 병렬 부하 중 실패 → 단독 3회·전체 재실행 모두 통과(부하성 flaky, 관찰 O7).

## 실패

없음.

## 미검증

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| U1 | 큐 `delayInSeconds:45` 가 지연 전에 배달되지 않는가(디바운스 전제) | 실측 필요 | dev 에서 10초 간격 인증 2회 → `[WF][publish][cert-now]` 1회, `movesApproval.cert.YYYY-MM` updatedAt 1회 |
| U2 | 인증 → 워크포스 반영 지연(목표 수 분) | 실측 필요 | U1 시나리오의 인증 시각 ↔ 프로퍼티 updatedAt |
| U3 | `worklog_control_log` CREATE(인라인 인덱스 2) 적용·major upgrade | 배포 필요 | 배포(`--approve MAJOR_VERSION_RULE`) 후 `getRecordRetentionOverview` CONTROL_LOG 가 STORAGE 에러 없이 응답 |
| U4 | 운영 싱글턴 journal 배선(관리자 해제 → 이력 행) | 단위 테스트는 주입 대역 | 해제 후 `listWorklogHistory({includeControl:true})` 에 `FOREIGN_CLEARED`+note |
| U5 | 인증 정리 DELETE 가 `ix_wcert_period_author` 를 타는가 | Forge SQL EXPLAIN 불가 | 소량 데이터로 시간 관찰 |
| U6 | 워크포스 asApp 으로 타 사용자 프로퍼티 GET(S1')·앱 간 키 격리(S3) | 실측 필요 — W1 의 전제 | 비관리자 계정 비용 탭의 `certification` 이 관리자 조회와 같은지. 403 이면 조용히 기존 계산 |
| U7 | 워크포스 비용 탭 호출량(S7' — 앞뒤 한 달·참여 인원 확장) | 실측 필요 | 대형 프로젝트 비용 탭 응답 시간 |
| U8 | 옛 워크포스 검증자(HEAD 판 contract)로 새 벡터(`di` 포함) 서명 검증 | 실행 대역 없음 — 코드 판독으로만 확인(옛 `validateBody` 는 모르는 키를 보지 않음, `w` 튜플 길이 2~3 유지) | 배포 순서 시험: 승인 앱만 먼저 배포 → 기존 워크포스 비용 탭에서 인증 적용 유지 |

## 통과

### 등록·경계면

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `acknowledgeForeignWorklog` | `WorklogControlController.js:43` → `WorklogControlService.acknowledgeForeign` `{worklogId,state,eventId,acknowledgedAt}` | `ForeignWorklogList.jsx:45-46` `{worklogId, reason}`, 응답 미사용·무효화 | O |
| `clearForeignWorklog` | `WorklogControlService.clearForeign`(reason 필수, `{worklogId,state,eventId}`) | 같은 mutation, `INVALID_TARGET{field:'reason'}` 분기 | O |
| `listForeignWorklogs` | `items[].review{action,at,by,note}|null`, `users[by]` | `ForeignWorklogList` review 칸 | O |
| `listWorklogHistory` | `WorklogHistoryService.listMerged` `rowType`·합성 커서 | `WorklogHistoryAuditSettings.jsx:60`, `exportWorklogHistoryExcel.js:179`(커서 무해석 반환) | O |
| `getRecordRetentionOverview` | `RecordRetentionService.overview` `{kinds[]}` | `RecordRetentionSection.jsx:50` | O |
| `exportExpiredRecords`/`confirmRecordExport` | kind 별 페이지 + `{sessionId,cutoff,nextCursor}` | `exportRecordArchive.js:69,94` — 끝까지 받고 파일 저장 뒤 확정 | O |
| `purgeExportedRecords` | `{deleted,remaining}` | `exportRecordArchive.js:143` 반복 | O |
| `downloadRecords` | kind 별 페이지 + `nextCursor`(+결재 `hiddenCount`) | `exportRecordArchive.js:111` | O |
| `getIssueWorklogs`/`getWorklogEditorContext` `control.linkUnavailable` | `WorklogControlContext.controlView` | `worklogControlModel.linkStateOf` → `WorklogTab.jsx:211`, `WorklogDialog.jsx:165-169` | O |

- [x] 신규 6 resolver 3단계 등록(guardedDefine · `PermissionMap.js:80-84,236` `{admin:true}` · `index.js:73`) — 계약 테스트 통과
- [x] 에러 코드 `WORKLOG_CONTROL_STORAGE`·`RETENTION_EXPORT_REQUIRED`·`STORAGE_NOT_READY`·`WORKLOG_CONTROL_CONFLICT`·`WORKLOG_NOT_FOUND` 가 `ErrorCodes`·`locales/{kr,en}/error.json` 에 있음. 신규 코드 없음
- [x] 새 화면 문자열 하드코딩 없음(신규 jsx/js 의 한글은 주석뿐), merge 통과, 쿼리키 팩토리(`settingsKeys.recordRetention`)
- [x] 마이그레이션 v060 단일·v059 다음, 인덱스 인라인(신규 테이블). manifest 무변경(새 scheduledTrigger·consumer 0)

### R1 통제 이력
- [x] append-only: `worklog_control_log` 에 대한 UPDATE 문 0, DELETE 는 `WorklogControlLogRepository.js:184 purgeBatch` 하나(보관 정리, 세션 CONFIRMED + 지문 일치 항목만). `TRUNCATE`/`DROP` 없음
- [x] 결정적 id: `deterministicEventId('wctl:'+worklogId, action, actor, discriminator)` — change `{createdAt}:{rev+1}`(CAS 가 판마다 하나), insert `ins:{now}` 는 `insertIgnore` 가 실제로 넣었을 때만 기록되므로 재시도 중복 없음, 확인 `ack:{createdAt}:{rev}:{sha(note)}`
- [x] 사유 필수: `normalizeReasonNote`(NFC·trim·1~500 코드 포인트) → 없으면 상태 변경 전 `INVALID_TARGET{field:'reason'}`. 사유 원문은 로그에 없음(journal 은 error.code 만 로그)
- [x] 이력 실패 시 원장: 앱 조치는 CAS 성공 뒤 기록·실패 삼킴(원장 정상, 이력 한 줄 누락 가능 — 설계 수용). 관리자 해제는 이력 테이블 미준비면 **상태 변경 전** `STORAGE_NOT_READY`, CAS 뒤 기록 실패는 `WORKLOG_CONTROL_STORAGE` → 재시도가 `reviewed` 분기로 같은 상태 재기록(새 rev 이벤트)
- [x] `listWorklogHistory includeControl`: 두 원천을 각자 limit 만큼 읽어 상위 limit 만 내보내고 커서를 **내보낸 마지막 행**에 둠 — 누락·중복 없음(판독 + `WorklogHistoryControlMerge.test`). 모드 간 커서 혼용은 `INVALID_TARGET{field:'cursor'}`, 프론트는 모드 전환 시 쿼리키가 바뀌어 커서 초기화
- [x] 불변식 7: CONTROL 행도 조회자 asUser 이슈 열람으로 걸러 `hiddenCount` 합산. 보관 내보내기는 기존 Q73 대로 가린 채 포함

### R2·R3 보관 5종
- [x] 확정 전 삭제 불가(서버 강제): 모든 종류의 삭제가 `sessions.get` → `pending()`(status≠CONFIRMED 면 `RETENTION_EXPORT_REQUIRED`) → `acquirePurge`(CONFIRMED 조건부) → 세션 항목 지문 = 현재 지문인 것만. 결재(`RetentionService`)·이력 2종(`WorklogHistoryRetentionService` 변형)·인증·통제(`RowRecordRetention`) 공통. 자동 삭제 경로(스윕·스케줄) 없음
- [x] 내려받기 전용은 세션·확정을 만들지 않는다 — `RetentionService.download`·`WorklogHistoryRetentionService.download`·`RowRecordRetention.download` 모두 세션 API 무호출
- [x] 연결/일반 분리: 일반 = `wf_linked IS NULL OR <> 1`, 연결 = `= 1`, 칼럼 미준비면 연결 `1=0`(fail-open 아님). 정리 시 `findExpiredByIds` 에 종류 술어를 다시 걸어 옛 일반 세션의 연결 행은 SKIPPED. 미러는 이력이 남은 워크로그면 지우지 않음
- [x] 옛 이력 보관 resolver 4개는 `worklogHistoryRetentionService`(GENERAL 변형) 그대로 → 일반분만, 응답 `kind:'WORKLOG_HISTORY'` 가산
- [x] 인증 1년 제외 근거: `CERT_RETENTION_YEAR_OPTIONS=[0,3,5,7,10]` — 워크포스 인증 문서 재게시 범위(올해·작년, `touchCertYears`)와 겹치지 않게. 최소 3년 cutoff 이전에 만들어진 묶음은 재게시 범위 밖. 게시 문서는 정리하지 않음. 인증 삭제 SQL 은 `CertRetentionRepository` 에만(`WorklogCertRepository` DELETE 0 유지)
- [x] 개요는 조회 시점 COUNT, 무기한이면 SQL 없음 → 유휴 SQL 0

### R4 즉시 게시
- [x] 새 스케줄 0. `workforce-cert` 는 `EVENT_JOBS`, `DAILY_JOBS` 무변경, 기존 `approval-sweep-queue` consumer 재사용
- [x] 큐 push 0 조건: 정책 OFF(`DISABLED`)·서명 불가(`BLOCKED`)·디바운스(`DEBOUNCED`)·미연결(`NOT_LINKED`, SQL ≤1) — 모두 push 전 반환, 예외도 삼킴(`WorkforceCertWake.js`)
- [x] 디바운스: KVS `approval:workforce:certWake.until`, 45초 창 안 touch 는 이미 예약된 작업이 아웃박스 행(dirty_rev)으로 가져감. push 뒤 표식(실패 시 창 잠김 없음)
- [x] 호출 지점: `WorklogCertService.js:707`(인증·재인증·본인), `WorklogCertObserver.js:48`(MISMATCH/DELETED) 두 곳뿐. `touchCertYears`(정책·연동 재개)는 깨우지 않음
- [x] `idleSqlBudget` 수정 타당: `workforce-cert` 는 일일 트리거가 절대 넣지 않음을 별도 단언(push 목록에 없음 + SQL 0) → 일일 합계 루프에서 빼는 것이 맞다. 누가 넣어도 미연동이면 관문 SQL ≤1. 미연동 합계 ≤27, 연동 workforce ≤13(합계 38) 유지
- [x] `publishCertNow` 는 일일 tick 과 같은 리스(PUBLISH_JOB), 인증 문서 행만(`listDueCert`, 표식 행 제외), 던지지 않음

### R5 계약
- [x] `di` 최상위 키(`CERT_DELETED_ISSUES_KEY`), validator: 객체·키는 w 의 삭제 비트 항목에만·키/값 숫자 id·≤1000. 옛 검증자는 모르는 키를 보지 않음(HEAD 판 `validateBody` 판독)
- [x] 600건 상한·`wt`: `CERT_DOC_BODY_BUDGET = 30,000 − 봉투 최악(계정 128·kid 16·시각 13·sig 86)`, 이분 탐색으로 최대 n, 합계는 전체 기준. 테스트가 최악 조합 600건 고정. 본문은 전부 ASCII 라 `JSON.stringify().length` = 바이트
- [x] 서명 벡터: `approval.cert` di 벡터 1건 추가, 기존 8건 무변경, 승인 앱 `src/integration` 테스트 통과
- [x] **두 리포 계약 파일 7개 sha256(CR 제거) 직접 대조 — 7/7 일치**: base64url `c6828c…c963`, canonical `3ed794…aa3a`, contract `529f11…414b`, ed25519 `bdb61d…e3ae`, keyring `bc6821…5609`, signature `978274…0e9a`, vectors.json `40b440…957f`(02 보고서 §8.3 표와 동일). `contract.js` import 0, 워크포스 `period.js`·`catalog.js` 삭제 후 참조 0
- [x] `rms.policy` 의미 검증 이동: 승인 앱 수신 경로 `WorklogPolicyAuthority` → `verifyPolicyEnvelope`(authority.js:19 `normalizeOverride`) 유지. 워크포스는 `rms.policy` 생산 쪽 검증 의존 없음
- [x] 워크포스 W2: `di[worklogId]` 의 이슈가 **이 프로젝트 이슈 집합**에 있을 때만, Jira 에 같은 worklogId 가 보이면 제외(liveIds), 문서 여러 개면 `seen` 으로 1회, 인증 초 0(ZERO) 제외 → 이중 계산 없음

### R6
- [x] `linked`(판정된 연동만)/`windowLinked`(창 판정) 분리. strict(LINKED_ALL)·통제 행·`channel` 은 `linked`, `judgeCreate`·`judgeMutation`·`dateWindow` 는 `windowLinked`. 불명이 제한 대상 아님을 테스트로 고정(`WorklogControlContext.test`)
- [x] 프론트는 `linkUnavailable` 로 UNAVAILABLE 경고, 연동 단정은 `channel==='WORKFORCE'`

### 워크포스
- [x] W1: `as:'app'` 은 `certifyCostRows`(호출처 `ProjectCostService.js:151,270`) 한 곳, 배지 `withCertBadges` 는 `as:'user'`. 캐시 키 자격별 분리. 응답(`assembleResponse`)에는 집계(`certification` 요약·`certCost`·byIssue/monthly 집계)만 — 문서 원문·건별 인증 값 없음. 워크포스 AGENTS ⑦ 추가
- [x] W3: confirmed = 인증 적용 행(+삭제 유지분), expected = Jira 현재 기록 + 삭제 유지분, 산식은 `estimatedCost` 와 같음(하루 단가 × MD), 문서 없는 사용자×월은 양쪽 동일, 미적용이면 null, 캐시 미저장(hit 경로 재계산)
- [x] W4: 덮는 문서 → 같은 작성자 다른 문서 worklogId 탐색(최근 서명) → 미인증/null. 이동분 월 원가는 인증 달 1일로. 승인 앱은 이동(시작 시각 변경)을 MISMATCH 로 다룸(DELETED 아님) → 삭제 유지분과 겹치지 않음

## 관찰 (실패 아님 — 판단 필요 시 리더)

- O1 `AGENTS.md:35` 리더 반영 문구가 앞 문장과 붙어 있다: "수신(워크포스 게시물 읽기)은 전부 asUser 게시 PUT·대조 GET 은 …" → "asUser." 뒤 마침표·줄바꿈 필요(리더).
- O2 즉시 게시 지연의 꼬리: 일일 tick 이 리스를 쥔 동안 `publishCertNow` 는 완료로 끝난다. tick 이 이미 `listDue` 를 지난 뒤의 touch 는 다음 일일까지 남는다(유실 아님, 지연). 큐 조기 배달(U1)도 같은 결과. 필요하면 리스 실패 시 `complete:false` 로 1회 재push(approval-backend).
- O3 W4 는 앞뒤 한 달까지만 찾는다 — 두 달 이상 옮긴 인증분은 덮는 문서 기준 미인증/주장값. 제품 판단(workforce).
- O4 W2 의 프로젝트 이슈 집합은 asUser(`fetchAllProjectIssues`)라, 조회자에게 안 보이는 이슈의 삭제 유지분은 조회자마다 원가가 달라질 수 있다 — Q133 의 "조회자 무관 원가" 목표와 경계(workforce, 기존 byIssue 와 같은 한계).
- O5 `WorklogControlLogRepository.latestReviews` 는 페이지 워크로그 전체에 `LIMIT 500` 하나 — 판단이 매우 많은 워크로그가 있으면 다른 행의 최신 판단이 밀려 `review:null` 이 될 수 있다(approval-backend, 저빈도).
- O6 인증 보관 정리로 현재본 인증 행이 지워지면 통제 CERTIFIED 숨김 재계산 대상에서 빠질 수 있다(백엔드 발견 3과 동일, 최소 3년이라 영향 작음).
- O7 워크포스 UI `src/pages/projectKanban/__test__/kanbanPagination.test.jsx` 가 두 리포 동시 실행 부하에서 1회 실패(`loadMoreOld` 버튼 미발견) — 이번 변경 밖·미수정 파일, 단독 3회·전체 재실행 통과. 부하성 flaky.

## 실행 결과

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npx jest --runInBand` | **142 suites / 2,185 tests 통과** |
| 승인 앱 | `npm run merge` | 통과(locales 변경분 외 추가 diff 없음) |
| 승인 앱 | `npm run test:ui -- --runInBand` | **60 suites / 549 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공(경고: atlaskit source map·postcss-calc 기존분만, `src/` ESLint 경고 0) |
| 승인 앱 | `forge lint` | No issues found |
| 워크포스 | `npx jest --runInBand` | **152 suites / 2,090 tests 통과** |
| 워크포스 | `static/ui npx jest --runInBand` | 1차 160/161(무관 flaky 1, O7) → 재실행 **161 suites / 2,605 tests 통과** |
| 워크포스 | `static/ui CI=true npm run build` | 성공, 번들 예산 안(main gzip 491,864/950,000 · panel 329,459/350,000) |
| 워크포스 | `forge lint` | No issues found(경고 "PermissionLinter Unknown product" — 기존) |
| 두 리포 | 계약 파일 7개 sha256(CR 제거) 대조 | 7/7 일치 |
