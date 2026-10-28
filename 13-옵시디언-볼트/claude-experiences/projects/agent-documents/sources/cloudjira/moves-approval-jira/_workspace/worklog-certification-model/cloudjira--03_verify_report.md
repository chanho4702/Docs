# 검증 리포트 (회차 1) — worklog-certification-model

작성: 2026-10-10 · integration-verifier
입력: `00_input/requirement.md`(D1~D9) · `01_architect_design.md` · `02_backend_report.md`(1·2회차) · `02_frontend_report.md` · `05_workforce_report.md`(계약 대조만) · 작업 트리(`git status`/`git diff`, 미커밋)
범위 주의: 감사(audit-trail) 백엔드(v053~v056, `src/resolver/audit`, `src/domain/audit`)가 같은 트리에 섞여 있다. 감사 UI 는 다른 에이전트가 작업 중 — 이번 실행 시점에 `static/ui` 에 감사 관련 신규/수정 파일은 없었고 UI 테스트·빌드에서 "감사 진행 중"으로 분리할 실패도 없었다.

## 요약  통과 34 / 실패 3 / 미검증 7

실패 3건은 모두 **저심각도**(경계면 계약이 깨진 곳은 없다). 인증 모델의 shape·등록·권한 축·CAS·에러 코드·i18n·유휴 비용은 교차 비교로 일치했다.

## 실패

1. **[`src/resolver/worklogCert/__test__/WorklogCertService.test.js`] 최초 인증 INSERT 경합 경로에 테스트가 없다** (담당: backend)
   - `WorklogCertService.certifyFor` ①(`WorklogCertService.js:619-640`)은 `INSERT IGNORE` 가 다른 묶음에 밀리면 `findMany` 로 다시 읽어 `batchId !== batchKey` 인 건을 ②(`certifyOne`, plan=null → 재계획)로 넘긴다. 코드 논리는 맞다(재계획 결과 UNCHANGED/UPGRADE/RECERTIFY). 그러나 목 `insertMany`(test:80)는 이미 행이 있으면 건너뛸 뿐, "findMany 직후 다른 묶음이 끼어든" 상황을 만드는 테스트가 없다 — 점검표 "열린 요청 하나 보장(동시 제출 테스트)" 의 인증판 대응물이 비어 있다.
   - 고치는 방법: `insertMany` 목이 첫 호출에서 다른 `batchId` 로 같은 worklogId 를 먼저 심게 하고(경합 재현), 결과가 `ok:true, unchanged:true`(같은 지문) 또는 `upgraded:true`(앞선 쪽이 본인 서명)로 수렴하며 `worklog_cert_log` 보관이 1행인지 단언.

2. **[`src/rdb/schema/migrate.js:117-118`, `src/rdb/schema/ddl/worklogCert.sql.js:100`] v052 를 "실패해도 뒤가 막히지 않게 맨 뒤에 둔다"는 전제가 감사 마이그레이션 추가로 깨졌다** (담당: backend — 감사 담당과 조율)
   - v052(`ALTER TABLE worklog_mirror ADD INDEX IF NOT EXISTS …`, U6 TiDB 멱등성 미검증) 뒤에 v053(`worklog_history.wf_linked` 칼럼)·v054~v056(인덱스)이 붙었다. v052 가 실측에서 실패하면 v053 칼럼까지 영원히 안 붙는다. `WorklogHistoryRepository`(:114) 가 `wf_linked` 준비를 프로브하므로 기록은 안 깨지지만, 감사의 워크포스 연결 신호가 조용히 사라진다.
   - 고치는 방법(아직 미배포라 이름 변경 가능): 칼럼 마이그레이션을 인덱스 묶음 앞으로 — `v052_alter_worklog_history_wf_linked`, `v053_index_worklog_mirror_author_started`, v054~v056 그대로. `worklogCert.sql.js:100` 주석을 "인덱스 마이그레이션은 칼럼 마이그레이션 뒤" 로 갱신. `migrate.test` 의 이름 단언 동반 수정.

3. **[`static/ui/src/features/worklogCert/CertificationListView.jsx:57`, `static/ui/src/features/settings/WorkforceLinkSettings.jsx:83-104`] 백엔드 2회차 가산 필드(B1·B2)를 프론트가 소비하지 않는다** (담당: frontend)
   - B1: 서버는 `totals.certifiedCount`(숨김·목록 밖 포함 정확값, `WorklogCertService.js:441`)를 주는데 화면은 여전히 `items.filter(state==='CERTIFIED').length` 로 센다 → 숨김 이슈 건이 있으면 "인증 N건" 이 서버·매트릭스(`rows[].certifiedCount`)와 다르게 보인다.
   - B2: 서버 `certPublish.selfSeconds·selfCount`(`WorkforceLinkService`)가 왔는데 `CertPublishRow` 가 그리지 않는다. 설계 §8 `workforce.selfSeconds` 키(locales 에는 있음)가 미사용으로 남았다.
   - 고치는 방법: `certified: Number(totals.certifiedCount ?? items.filter(...).length)` 로 바꾸고, `CertPublishRow` 연결 상태 줄에 `tFormat(t,'worklogCert.workforce.selfSeconds',{time: formatSeconds(certPublish.selfSeconds)})`(selfCount>0 일 때) 추가. 테스트 1줄씩.

## 미검증

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| V1 | **U3 — 인증 쓰기 경로의 이슈 열람 범위**. 읽기(`listMemberCertifications`)는 팀장 asUser JQL(`worklogAuthor=`)이라 Browse 권한으로 좁혀지지만, 쓰기(`certifyFor`)는 asUser `POST /worklog/list` 응답 존재만으로 판정한다(`WorklogCertService.js:556`). Jira 문서상 이 API 는 **워크로그 공개 범위**만 언급하고 이슈 Browse 권한은 언급하지 않는다 → 팀장이 못 보는 이슈의 팀원 워크로그 id·지문을 알면 인증할 수 있을 가능성 | 실측 필요(설계 U3) | dev 에서 팀장 계정이 열람 불가 이슈의 팀원 워크로그 id 로 호출. **권고**: 실측 전이라도 `lives` 의 issueId 로 `filterVisibleIssues` 1회(호출 +1)를 선제 추가하면 읽기·쓰기 대칭이 코드로 보장된다(점검표 "읽기 범위 검증이 쓰기에도"). 리더 판단 |
| V2 | U10 — 워크포스 `leaderKeys` 와 명부가 어긋나면 `upperLeadsOf` 가 비어 본인 인증이 열리거나, 반대로 상위자가 있는데 `leads(X,A)` 가 false 라 아무도 인증 못 하는 교착 | 두 앱 dev 데이터 필요 | 두 앱 설치 후 팀장 A(상위자 X)로 `getTimesheetContext.certification.selfCertEligible` 과 X 의 `listMemberCertifications(A)` 가 동시에 거부되지 않는지 |
| V3 | U1/W11 — 승인 앱 asApp 의 타 사용자 프로퍼티 쓰기 | 배포 필요 | `04_spike_todo.md` |
| V4 | U6 — TiDB `ALTER TABLE … ADD INDEX IF NOT EXISTS` 멱등성(v052, v054~v056) | 배포 필요 | dev 배포 후 첫 resolver 호출로 마이그레이션 → KVS `schema:version` 이 v056 인지 |
| V5 | 워크포스 측 월 귀속(`ps ≤ started < pe`) 과 승인 앱 `period_key`(인증 시점 TZ) 불일치: 인증 후 작업일이 다른 달로 옮겨진 MISMATCH 건, 또는 사이트 TZ 변경 후 월 경계 건은 워크포스가 옛 달 문서를 읽지 않아 "미인증(제외)"로 본다 → 승인 앱 `cs`(KEEP 면 인증값 포함)와 워크포스 원가 합이 어긋날 수 있다 | 계약 해석 문제, 실측 전 | 워크포스 리포 후속: 후보 달 문서에서 **worklogId 로도** 찾도록(문서 ps/pe 는 보조). 승인 앱 계약 변경은 불필요 |
| V6 | 워크포스 보고서 §5 요구 1(계약 파일 도메인 의존 제거)·요구 2(`w` 에 issueId — DELETED 건 프로젝트 귀속) | 사용자·리더 결정 사항 | `QUESTIONS.md` 로 올릴 것 |
| V7 | 감사 UI(설정 > 감사 탭)의 `listCertificationAudit`·`getCertificationBatchAudit` 소비 경로 | 다른 에이전트 작업 중(감사 진행 중) | 감사 UI 완료 후 경계면 표에 추가 — 서버 shape: `{items, filteredCount, nextCursor, users, itemsByBatch?, hiddenCount?}` / `{batch, items, hiddenCount, users}` |

## 통과

### 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| `getCertificationMatrix` | `WorklogCertService.js:179-250` | `TeamCertificationPage.jsx:34-40`, `CertMatrixTable.jsx` (`rows[].certifiedCount/claimedCount/uncertifiedCount`, `coverage.mirror`, `summary`, `teams`, `periodKey/period/timeZone/unit`) | O — `.content` 이중 접근 없음, 펼침은 `matrix.periodKey` 를 넘겨 같은 달 |
| `listMemberCertifications` | `listFor` `:315-447` | `MemberCertificationPanel.jsx:24`, `CertificationListView` | O (B1 미소비는 실패 3) |
| `listOwnCertifications` | `:276-307` (+`selfCert{eligible,reason,upperLeadCount}`) | `OwnCertificationPanel.jsx:24` | O — 요청에 accountId 없음 |
| `certifyWorklogs` | `:483-500`·`certifyFor` | `CertifyBar` → `certifyRunner` (`results/remaining/monthTotals`, 요청 `fp=currentFp`, `lastSeq=summary.lastSeq`, MONTH 만 `setDigest`) | O — 서버 상한 200 > 프론트 CHUNK 100, uuid v4 키 |
| `certifyOwnWorklogs` | `:503-511` | `OwnCertificationPanel.jsx:57` fnName | O — `accountId` 미전송, 서버도 무시 |
| `getTimesheetContext.certification` | `TimesheetService.js` 가산 `{selfCertEligible}` | `InboxPage` 탭 노출 | O — 쓰기 판정과 같은 함수(`selfAuthority`) |
| `getMyTimesheet.certification` | `forMyTimesheet` | `MyCertificationSummary` | O |
| `getIssueWorklogs.worklogs[].certification` | `forIssueWorklogs`(eligibleOf 자격) | `WorklogTab` 배지 | O — 이력 카운트와 같은 자격 |
| `getTimesheetWorklogHistory.worklogs` | `forTimesheetHistory`(조회자 permissions/check 후) | `TimesheetHistorySection` → `WorklogSummaryTable mode="review"` | O |
| `getWorkforceLinkStatus.certPublish` | `WorkforceLinkService` | `WorkforceLinkSettings.CertPublishRow` | O (selfSeconds 미소비는 실패 3) |
| `get/saveApprovalSettings` 5키 | `SettingsRepository` 기본값·GLOBAL_ONLY | `WorklogCertSettings` | O — `SettingsPolicyKeys` 계약 테스트 통과 |
| `createWorklogCertification` | 제거(PermissionMap·Controller) | 프론트 호출 0(테스트의 `not.toHaveBeenCalledWith` 만) | O |
| 워크포스 v2 문서 | `certificationDoc.js`·`contract.js`(TYP `approval.cert`, ent `{accountId,periodKey}`) | 워크포스 `certification.js`(복사본 9개 바이트 동일 — 05 보고) | O — `vectors.json` approval.cert 벡터로 양쪽 `signature.test` 통과(이번 실행 포함) |

### 점검표

**등록**
- [x] 신규 5 + 감사 3 resolver 가 `guardedDefine`(`WorklogCertController.js`, `AuditController.js`) · `PermissionMap.js:137-145,212-214` · `index.js` `CONTROLLER_REGISTRARS` 세 곳에 있다. `permissionMap.contract` 통과
- [x] 프론트 fnName 5개가 등록 이름과 일치(grep)

**shape**
- [x] `invokeApproval` 이 content 를 벗기고 소비자는 1단 접근
- [x] snake → camel 매핑(`certFromRow`) → 응답 → 화면 일관(`certifiedSeconds`·`countedSeconds`·`selfCertified`·`currentFp`)
- [x] 에러 분기 `error.code`. `ErrorCodes` 102개 전부 kr/en `error.json` 에 있음(node 대조, 누락 0). `cause` 는 `ResponseWrapper` → `ApprovalError.cause` 로 전달되어 `SELF_DENIED.cause.reason` 분기가 동작
- [x] 시각 epoch ms, TIMESTAMP 바인딩은 `SqlTime.toSqlTimestamp`(`WorklogCertRepository.js:2`, `CertAuditRepository.js:2`)

**불변식**
- [x] 1 — `worklog_cert` PK `worklog_id`(대상당 현재본 하나), 묶음은 `batch_id` PK + 같은 키 재시도 멱등 테스트(test:220)
- [x] 2 — 인증 레코드가 원천, 표시 상태는 `effectiveState` 파생
- [x] 3 — `src/domain/worklogCertification`, `src/domain/audit` 에 `Date.now`/`new Date()`/fetch/SQL 없음(grep)
- [x] 4 — `recertify`·`applyObservation` 둘 다 `WHERE worklog_id=? AND rev=?` + `rev = rev + 1`, `rowsAffected` 는 `CommonQuery` alias
- [x] 5 — 결재 엔진 미경유(해당 없음)
- [x] 6 — `worklog_cert_log` PK `(worklog_id, cert_rev)` + INSERT IGNORE
- [x] 7 — 팀장 경로 매 호출 `TeamScope.leads/membersOf`, 본인 대상은 팀장 축에서 `TEAM_LEAD_AXIS`·펼침 `VIEW_DENIED`, 다른 팀 팀원 거부 테스트(test:253), 삭제 행은 `filterVisibleIssues`, 감사 건은 permissions/check 후 `hiddenCount`(fail-close). (쓰기 쪽 이슈 열람은 V1)
- [x] 8 — 인증·감사 경로에 새 asApp 없음. 게시는 기존 `WorkforcePublisher` 게이트웨이·사유 재사용(AGENTS asApp 2번 갱신 확인)
- [x] 9 — 엔티티 프로퍼티로 판정 없음, 게시는 서명 문서
- [x] 10 — 해당 없음
- [x] D8 본인 인증 — SELF 축 별도 resolver, 대상=`principal.accountId`, 자격(`isTeamLead ∧ upperLeads=∅`)을 매 호출·PIN 전에 재판정, 상위자 조회 실패는 `UPPER_LEAD_UNKNOWN`(닫힘, test:369). `upperLeadsOf` 는 실패 시 throw(본인 인증이 열리는 방향을 막음)
- [x] D9 — 재인증도 같은 경로/규칙, 상위자의 같은 값 재인증은 UPGRADE(강등 없음)

**권한 범위(형제 resolver)**
- [x] 매트릭스·펼침·인증·본인 목록·본인 인증·감사 목록·감사 묶음·작업 로그 탭 배지·결재 상세 요약·내 타임시트 — worklog_cert 를 읽는 resolver 전수(grep `worklogCertRepository|worklog_cert`) 확인. 숫자 집계(매트릭스·`totals`·감사 묶음 요약)는 이슈 정체 없이 숫자만, 건 단위 노출은 모두 조회자 asUser 로 좁힘
- [x] `SELF` 는 서버 `principal.accountId` 사용(payload 무시)

**유휴 비용**
- [x] `manifest.yml` 무변경 — `scheduledTrigger` 는 일일 `approval-sweep` 하나, consumer 추가 없음
- [x] `idleSqlBudget.test.js` — 워크포스 연동 13회(인증 스캔 SELECT 정확히 1회 단언), 미연동 관문에서 종료(+0), 옛 커서 1회 이관 테스트. AGENTS 수치(27/38)와 일치
- [x] 새 테이블 readiness 는 `isTableReady`(KVS 마커 우선)
- [x] 인증 기능 미사용 설치 추가 비용 0(미연동)/+1(연동)
- [x] 트리거 경로 Observer 는 기존 옛 테이블 관찰을 **대체**(횟수 동일), 절대 throw 안 함
- [x] resolver 후 fire-and-forget 없음 — `touchCert` 는 await, 게시는 일일 스윕(화면 문구 "다음 일일 동기화" 와 일치)

**프론트·배포 단위**
- [x] 엔트리 3곳 무변경(업무함 view 추가만, lazy + `importWithReloadOnce`)
- [x] i18n — 화면이 쓰는 리터럴 키 224개 + 템플릿 키(state 5·signal 7·signalHint 7·result.code 5·own.denied 3·filter 4·settings.unit/deleted) 전부 kr/en merge 결과에 존재. `npm run merge` 통과
- [x] 쿼리키 `worklogCertKeys` 팩토리 사용, 인증 후 `worklogCertKeys.all`+`timesheetKeys.all` 무효화
- [x] 마이그레이션 v049~v056 연번·중복 없음(순서 문제는 실패 2)
- [x] `manifest.yml` app id 무변경

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand` | **통과** — 125 suites / 1,823 tests (워크포스 보고서가 언급한 `WorklogCertService.test` 부하 실패는 재현되지 않음) |
| `npm run merge` | 통과 — `ko-KR.json`·`en-US.json` 생성 |
| `npm run test:ui -- --runInBand` | **통과** — 52 suites / 440 tests (감사 진행 중 분리 대상 없음) |
| `npm run build:ui` | **통과** — "The build folder is ready to be deployed." (기존 소스맵·postcss 경고만) |
| `npx forge lint` | **통과** — No issues found |

커밋·배포·forge deploy 하지 않음. 소스 수정 없음(이 리포트만 작성).
