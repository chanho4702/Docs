# 2026-10-11 제품 결정 T1~T4 구현 설계

작성: 2026-10-11. 근거: requirement.md, AGENTS.md·CLAUDE.md, feature-design·백엔드·프론트 규약 및 현행 코드 조사. 실제 구현 계약의 변경은 02_codex_report.md에 남긴다.

## 1. 개요·영향 범위

- T1: 라이선스 배너·공통 mount. INACTIVE만 차단하는 경계는 유지한다.
- T2: SITE 전체 기간에 EDIT 재개방을 추가한다. approval_approver의 결정과 APPROVED 요청은 보존하며 timesheet_submission drift, 현행 worklog_cert, 통제 원장, Workforce outbox를 재사용한다.
- T3: fieldChangeApplyFallback 기본 OFF, APP일 때 asUser PUT의 확정 거절 뒤 앱 PUT 한 번.
- T4: 개인정보 보고·closed 정리·공통 사용자 표시·감사 엑셀·관리자 가이드.
- 새 scheduledTrigger와 프론트 엔트리 없음. manifest는 report:personal-data scope 추가.
- 수정 금지 파일·다른 작업 디렉터리·워크포스 리포를 건드리지 않는다. git add/commit/push·forge 명령을 실행하지 않는다. 요구 마지막 npx forge lint와 명령 금지의 충돌은 리더가 최종 보고에 명시한다.

기존 코드 근거:
1. PeriodCloseService 범위는 SITE 전체 기간뿐이다.
2. domain/timesheet/lock.js는 APPROVED여도 driftDetectedAt이 있으면 승인 잠금을 풀고 재제출을 허용한다.
3. 현행 인증 원장은 worklog_cert다. 옛 worklog_certification 요청형은 동결되어 T2 대상이 아니다.
4. planObservation은 MISMATCH 지문이 원본과 같아지면 CERTIFIED로 자동 복원한다. 재개방에는 REOPENED 별도 상태가 필요하다.
5. WorklogControlRepository.approvedWorklogIds/listApprovedRefsAfter는 현재 drift를 무시한다. 함께 고쳐야 재숨김을 막는다.
6. DirectoryService.resolveUsers → userDisplay.loadUsers가 공통 이름 경로다.

## 2. 경계면 계약

아래 성공 값은 invokeApproval이 벗긴 result다. Controller의 기존 content 래핑을 따른다. 신규 resolver는 guardedDefine + PermissionMap + CONTROLLER_REGISTRARS 계약에 포함한다.

| resolver | 권한 | 입력 | 성공 result | 오류 | 소비 |
|---|---|---|---|---|---|
| listPeriodCloses | admin | 기존 입력 | 기존 items에 reopenOperation:{operationId,status,phase,counts,complete} 추가 | 기존 | 기간 관리 |
| previewPeriodReopen | admin | {periodKey,rev} | {previewToken,periodKey,rev,scope:'SITE',counts:{approvals,certifications,hidden},expiresAt} | INVALID_TARGET, TIMESHEET_PERIOD_INVALID, STORAGE_NOT_READY, CONCURRENT_MODIFICATION | EDIT 경고 모달 |
| reopenPeriod | admin | 기존 {periodKey,rev}; mode 기본 INPUT. EDIT는 {periodKey,rev,mode:'EDIT',reason,previewToken} | INPUT 기존 {item}; EDIT {item,operationId,status,phase,counts,complete} | 기존 + PERIOD_REOPEN_PREVIEW_STALE, PERIOD_REOPEN_REASON_REQUIRED, PERIOD_REOPEN_IN_PROGRESS | 두 재개방 버튼 |
| continuePeriodReopen | admin | {operationId} | {item,operationId,status,phase,counts,complete} | INVALID_TARGET, STORAGE_NOT_READY, PERIOD_REOPEN_IN_PROGRESS | 이어하기 |
| 기존 정책 resolver | 기존 | patch.fieldChangeApplyFallback:'OFF' 또는 'APP' | 기존 policy | 기존 검증 오류 | 정책 설정 |
| applyFieldChange | 기존 | 기존 | 기존 결과에 appliedBy:'APP', applyMode:'APP' 가능 | 기존 | 필드 변경 |
| resolveUsers와 형제 목록 | 기존 | 기존 | closed 계정은 accountStatus:'closed', closedLabel, avatarUrl:null; deactivated 이름 유지 | 기존 | 사용자 표시 전체 |

- T2 accountId/subjectId 입력은 명시 거부한다. SITE 범위를 사용자별로 확장하지 않는다.
- previewToken은 서버 저장 preview 식별자로 SITE·기간·rev·범위·시각·건수에 결속한다. 실행 시 재조회한다.
- INPUT은 현행 동작 그대로다. 이미 REOPENED인 기간도 EDIT로 승격할 수 있다.
- 사유 trim 1~500자, 감사에는 원문을 저장하되 console에 쓰지 않는다.
- T4는 내부 큐 서비스여서 새 공개 resolver가 불필요하다.

## 3. 도메인

### T1
computeLicenseExpiryBanner(license, now)는 active이고 유효 만료일이 오늘부터 7일 이내일 때 반환한다. 평가판은 evaluationEndDate/trialEndDate, 정식은 subscriptionEndDate를 우선한다. 잘못된 날짜·8일 이상·만료 뒤는 null. 기존 computeTrialBanner는 호환 별칭 가능.

닫기 키는 만료일+현지 YYYY-MM-DD다. 메모리 dismissed도 날짜 키로 두어 자정 이후 재노출을 막지 않는다. 로컬 저장 실패는 표시를 유지한다.

### T2
- StoredState.REOPENED와 CertState.REOPENED, 순수 planReopen(row,now).
- CERTIFIED 및 MISMATCH의 유효 인증을 REOPENED로 전이한다. MISMATCH도 현재 인증 시간/잠금을 유지하므로 포함한다. DELETED는 수정 대상에서 제외한다.
- planObservation은 REOPENED를 자동 CERTIFIED로 복원하지 않는다. 삭제 관찰은 DELETED 전이 가능.
- effectiveState는 지문이 같아도 REOPENED 유지. planCertify의 RECERTIFY만 새 certRev로 복원한다.
- countedSeconds는 REOPENED에서 KEEP/ZERO 모두 0. summary·selfCertifiedCount·lastCertifiedAt에서도 해제분 제외.
- 승인 요청 APPROVED와 결재자 결정은 그대로 둔다. timesheet_submission의 drift_kind='REOPENED', drift_detected_at과 결정적 PERIOD_REOPENED 이벤트가 현재 효력 해제를 표현한다.

### T3
shouldFallback(policy,result)는 APP이며 asUser PUT의 명확한 400/401/403 실패일 때만 true. 네트워크·시간 초과·5xx·UNKNOWN·404·조회 불가·값 충돌에서는 false. 현재 400은 NOT_EDITABLE로 뭉쳐 화면 문제와 값 검증 거절의 완전 구분은 한계다.

### T4
closedLabel(accountId)는 결정적이고 안정적인 알파벳 표식이다. 충돌 없는 UTF-8 바이트→정수→base26 규칙 또는 UNIQUE 표식 영속 배정을 사용한다. 짧은 해시 충돌을 무시하지 않는다. 동일 계정은 언어·화면·세션과 무관하게 같은 표식이다. 프론트에서 “탈퇴한 사용자 {label}”/“Deleted user {label}”로 번역한다.

## 4. 백엔드·부분 진행·동시성

### T2
PeriodReopenService/Repository를 TimesheetController에 연결한다. 서버 작업 원장, 호출 20초, 페이지 50~100건, 키셋 cursor를 사용한다.

PREVIEW → APPROVALS → CERTIFICATIONS → VISIBILITY → FINALIZE → COMPLETE:
1. preview를 CAS claim하며 actor·reason·cutoffAt·sourceRev·저장된 기간 범위를 고정한다.
2. APPROVALS: 범위 안 최신 LIVE APPROVED 중 유효 승인에 결정적 PERIOD_REOPENED 이벤트(operationId+requestId)를 append한 뒤 markDrift한다. 이미 drift인 요청은 유효 승인 수에서 제외한다.
3. CERTIFICATIONS: cert_started >= start AND cert_started < end로 선택한다. 인증 period_key는 항상 월이므로 주간 기간키로 비교하면 안 된다. 원본 cert 값/인증자/batch를 보존하며 state만 REOPENED CAS. 작업 id+worklog id의 설정 감사로 누가·언제·사유를 기록한다. cert_log의 PK를 임의로 소비해 다음 재인증 감사와 충돌시키지 않는다.
4. VISIBILITY: started_ms와 서버 범위로 우리 통제 원장만 고른다. RELEASING/해제 대기로 넘기고 기존 worker.releaseOne 경로를 재사용한다. 원래부터 제한된 SKIPPED_RESTRICTED는 건드리지 않는다. 통제 감사에 관리자·사유 기록.
5. FINALIZE: 잔여와 경합 대상 재조회 뒤 close 행을 기대 rev로 REOPENED 처리하고 설정 감사 기록. 이미 REOPENED 승격은 sourceRev/작업 일치를 확인한다.
6. 타임시트 year outbox와 인증 account×month outbox touch. 인증 즉시 게시 wake 재사용. resolver에서 Jira property PUT 금지.

부분 진행 중 CLOSED는 유지한다. 이미 REOPENED 상태의 승격은 in-progress 작업 표식을 잠금 경로에 적용해 변경을 fail-close한다. closePeriod는 작업 진행 중 거부한다. 재승인·재인증도 해당 기간 진행 여부를 확인한다. 트랜잭션이 없으므로 cutoff+sourceRev, 행별 CAS, 전이 전후 진행 표식 재확인, 마지막 잔여 스캔을 조합한다. 경합으로 생긴 새 certRev·새 승인에 옛 작업을 무조건 덮지 않고 미완료로 남겨 조정한다.

cursor/처리 수는 페이지 감사·전이·outbox가 모두 끝나야 전진한다. 실패한 페이지는 재처리하고 미완료를 성공 완료로 응답하지 않는다. 결정적 감사 id와 원장 처리 상태가 중복 카운트를 막는다.

통제 추가 조건:
- approvedWorklogIds/listApprovedRefsAfter에서 drift가 있는 승인 refs 제외.
- LINKED_ALL은 linked만으로 다시 숨긴다. 원장에 reopen_release_id/reopen_release_at 등 해제 표식을 보존하고 재분류 시 우선한다. 새 명시적 재승인·재인증 때만 표식을 해제한다.
- visibility 실패/UNKNOWN은 기존 재조회·백오프를 재사용하며 원장을 지우지 않는다.
- 완료는 승인·인증 효력 해제 및 visibility 해제 예약 완료다. 실제 Jira 해제 잔여는 별도로 표시한다.

### T3
FieldChangeApplier에 정책 loader와 앱 writer 주입. 기존 asUser 현재값 조회→planApply→PUT을 유지한다. 확정 거절과 APP 정책일 때 같은 token의 전송 fence를 유지/갱신하고 앱 PUT을 한 번 실행한다. 앱 시도 직전 asUser 현재값 재확인으로 새 충돌을 덮지 않는 것이 권장된다.

apply_mode='APP', appliedBy='APP'를 일관되게 반환하고 실제 승인자는 approval_approver와 이벤트 actorKey에 보존한다. FIELD_APPLIED reason은 APP_FALLBACK 같은 고정 코드. UNKNOWN은 재전송하지 않는다.

### T4
PersonalDataService/Repository/Gateway + KVS 상태. 일일 fan-out PERSONAL_DATA 작업의 첫 단계에서 KVS due 검사. 주기 아닌 날 SQL 0. 20초·POST 90개·테이블/컬럼/마지막 accountId cursor.

[Forge 공식 가이드](https://developer.atlassian.com/platform/forge/user-privacy-guidelines/)에 따라 accounts[{accountId,updatedAt}]를 보고한다. 204 정상 처리, Cycle-Period·Retry-After 준수. updatedAt은 가장 오래된 개인정보 수집 시각이며 now로 오래된 데이터의 나이를 숨기지 않는다. closed는 재보고 제외, updated는 캐시를 지우고 다음 asUser 조회에서 갱신.

SDK privacy.reportPersonalData는 headers를 버리므로 설치된 @forge/api의 asApp().requestAtlassian raw Response를 쓰는 gateway가 필요하다. 메서드의 공개 문서/실배포 보장은 미검증이다. API 경로는 /app/report-accounts이며 Jira API와 별도다.

Cycle-Period 숫자는 일 단위다. 14→14일, 부재→7일 테스트. [Atlassian 개발자 답변](https://community.developer.atlassian.com/t/cycle-period-header-example/26940/2)을 참고하며 실제 응답 형식은 배포 후 확인한다. Retry-After는 초 단위다.

여러 source에 같은 계정이 있어도 per-account reportedAt/nextDue로 주기 안 중복 POST를 막는다. 응답 closed/updated 처리 목록을 먼저 영속화하고 정리 완료 뒤 cursor 전진. 정리 실패를 건너뛰거나 lastCompletedAt을 앞당기지 않는다.

## 5. 스키마·개인정보 지도

v060 다음부터 추가:
- v061 approval_period_reopen: 작업/preview id, SITE/period, source_rev, start/end, actor_account, reason(500), cutoff/created/updated/expires, status/phase, cursor/counts, rev. 동일 범위 작업 중첩 방지.
- v062 이후 통제 원장 재개방 해제 표식 컬럼. 기존 vis 상태 재사용.
- T4 tombstone/보고 상태는 KVS 가능. SQL 채택 시 다음 번호와 ready probe.
- REOPENED는 기존 state VARCHAR(10)에 들어감. 기존 migration 이름 변경 금지. 인덱스는 테이블/컬럼 뒤.

| 기능용 저장소 | closed 처리 |
|---|---|
| approval_signature, approval_pin | account_id 삭제 |
| approval_notification | recipient 삭제 및 후속 생성 제외 |
| approval_delegation | delegator 또는 delegate 일치 삭제 |
| approval_inbox | closed 소유 projection 삭제 |
| timesheet_team_member | MEMBER·LEAD 등록 제거 |
| approval_group.member_keys | CUSTOM 명부에서 제거, 경합 보호 |
| approval_flow_step USER principal | 계정 제거, 불완전 flow 비활성화(필수 승인자 감소로 자동 통과 금지) |
| KVS settings.managers·approvers | 등록 제거, AppAccess cache 무효화 |
| approval_export_session/entry | 소유자의 임시 세션·entry 정리 |
| workforce_inbound | rms.org 및 body_json 사용자 참조 캐시 무효화; 서명 본문을 부분 수정하지 않음 |
| workforce_publish | closed 계정의 기능용 게시 작업 제거/억제 |
| 사용자·사용자 필드 캐시 | 영속·메모리·프론트 갱신, tombstone 우선 |
| worklog_control_intent | 기능용 완료 intent 정리, 진행 중 복구와 분리 |
| KVS secrets | 계정 소유 키 전수 확인, PIN/인증 등 기능용 키가 존재하면 함께 제거; 앱 서명키는 계정 개인정보로 오인해 지우지 않음 |

보존:
- approval_request/approver/event/cc, 타임시트·필드변경·전환·사전승인 부속 snapshot의 감사 식별자.
- worklog_cert/batch/log, worklog_history, worklog_control_log, approval_settings_audit.
- worklog_control은 visibility 복구 전 삭제 금지. worklog_mirror author/seq는 이력 정합상 유지.
- 필드 USER from/to/conflict 및 bypass는 감사 id를 보존하며 화면 이름은 tombstone 우선.
- 설정 created_by/updated_by는 감사 의미로 보존.
- 과거 자유문/설명/snapshot까지 완전 삭제·익명화했다고 주장하지 않는다.

보고 수집은 기능용 및 보존 감사의 모든 account 컬럼, CUSTOM 명부, USER flow, KVS managers/approvers, 인증 batch 및 JSON 사용자 참조를 포함한다. =, *, unknown, APP 특수값 제외. 고정 allowlist에 table/column/수집시각/정규화 규칙을 선언하고 DISTINCT keyset 페이지를 사용한다. 명부에만 있는 계정을 놓치지 않는다.

preUninstall은 기존 visibility 복구 45초를 우선하고 잔여 예산에 기능용 정리. 개인정보 정리 실패가 복구를 건너뛰게 하지 않는다. 55초 한도로 전량 보장은 못 하며 미완료를 보고한다.

## 6. Jira 연결

- T1 새 호출 0. 제공자 선택을 확인할 수 없어 조건문으로 안내한다.
- T2 resolver는 SQL/KVS/큐. worker는 기존 허용된 visibility 복구 API.
- T3 고정 asApp 사유 field-change-apply-fallback, 관리자 APP 정책 + 승인 확정 + asUser 확정 거절 조건.
- [Edit issue 공식 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put)의 overrideScreenSecurity는 Forge 관리자 사용자 대행 조건이다. asApp 지원을 가정하지 않고 normal PUT만 구현한다.
- report:personal-data scope 변경 후 배포 담당자가 install --upgrade해야 한다. 이번 작업에서 실행하지 않는다.
- 감사 id 보존은 사용자 제품 결정이다. GDPR/Atlassian 준수를 단정하지 않고 실제 삭제 범위와 한계를 문서화한다.

## 7. 프론트·파일 목록

T1: stores/useLicenseStore, features/license/{TrialExpiryBanner,LicenseGate,LicenseGuidePage,licenseConstants}, app/mount. 공통 게이트 배너로 worklog·issue·settings·inbox를 모두 덮는다. 안내 화면에 Jira 설정→이슈/작업 항목→시간 추적→Jira 기본 제공자 및 관리자 권한 필요 설명. 배너 줄바꿈 허용.

T2: PeriodCloseSettings에 두 버튼·preview·사유·강한 경고·부분 진행·이어하기. 기존 ModalLayout/ReasonModal 재사용. approvalKeys 팩토리의 기간/타임시트/인증/통제/Workforce 키를 무효화. PeriodStatusBadge·인증 상태·감사 상태에 재승인/재인증 필요 표시.

T3: PolicySettings/정책 검증·store, FieldChange 적용자 표시. APP 설정 위치에 Jira 이력 작성자가 앱으로 남는다고 안내.

T4: DirectoryService/userDisplay와 IssueFieldReader.user 등 중앙 표시 우회 경로 확인. exportAuditExcel(approval/cert/settings), exportWorklogHistoryExcel(history/control), exportRetentionExcel, exportRecordArchive 및 업무함·팀 시트 전체 확인. 사람마다 이름과 accountId를 함께 싣고 별도 id 열 권장. RetentionService/export 응답에 users가 부족하면 resolveUsers로 보충한다. raw JSON에 id만 있는 것은 이름+id 요구 충족이 아니다.

백엔드 핵심: PeriodCloseService/Repository, 신규 PeriodReopenService/Repository, TimesheetRepository, domain/approval/constants, domain/worklogCertification/{state,counting,summary}, WorklogCertService/Repository, WorklogControlRepository/Worker/Hooks, integration/workforce/certificationDoc, FieldChangeApplier, IssueFieldReader, SettingsRepository/Service, 신규 개인정보 서비스, trigger/{sweepJobs,runSweep,onPreUninstall}, rdb/schema, PermissionMap, ErrorCodes.
문서: docs/guide/{ko,en} 관리자 가이드. “퇴사자는 삭제보다 비활성화, 삭제 전 감사 내보내기”와 감사 식별자 보존 및 개인정보 처리 범위.

## 8. i18n

기존 namespace에 kr/en 같은 키를 추가하고 npm run merge:
- license.banner.message: N일 후 만료, 제공자로 설정된 경우 시간 입력 중단, 갱신/기본 제공자 복원.
- license.guide.restore.*, settings.periodClose.{reopenInput,reopenEdit,preview,reason,continue,inProgress}.
- worklogCert.state.REOPENED / audit.cert.state.REOPENED, audit.approval.event.PERIOD_REOPENED 및 timeline.
- settings.policy.fieldChangeApplyFallback/help, fieldChange.appliedByApp.
- directory.closedUser, 감사 accountId 열, 신규 ErrorCodes 대응 error.json.

## 9. 용량·호출량·유휴 비용

200명 월별 승인 연 2,400건. 하루 4워크로그×240근무일이면 인증/통제는 연 약 192,000건이며 새 전체 사본 없이 기존 행 상태를 갱신한다. 재개방 작업은 월 1회 기준 연 12행, 실제 변경 건수만큼 결정적 감사가 늘어난다.

| 작업 | Jira 호출 | 유휴 추가 SQL |
|---|---|---|
| T1 | 0 | 0 |
| T2 preview/실행 | resolver 0; worker 건당 기존 GET 1+PUT 최대 1 | 작업 없는 날 0 |
| T3 일반 | GET 1+PUT 1 | 0 |
| T3 fallback | 재확인 GET 1+APP PUT 1 추가 | 0 |
| T4 주기 보고 | 고유 200계정이면 POST 최소 3 | 비주기 0; due일 source별 DISTINCT 비용 |

T4 비주기에는 27/38을 유지한다. due일 빈 설치의 테이블별 조회는 추가 비용이므로 idleSqlBudget에서 비주기와 보고 due일을 나누어 고정한다. 빈 설치 존재 KVS gate로 SQL 0 최적화 시 기존 설치 backfill 누락을 막아야 한다. 신규 scheduledTrigger 없음.

## 10. 미검증·검증

| 미검증 | 확인 |
|---|---|
| 정식 라이선스 날짜 실제 제공 | production context 필드 존재 확인, 원문 로그 금지 |
| APP PUT 실제 권한/화면 | 시험 이슈 asUser 거절→앱 성공/실패 |
| raw requestAtlassian/Cycle-Period | scope upgrade 후 공식 시험 계정과 200/204·헤더 확인 |
| 재개방/재승인/재인증 경합 | cutoff·rev·in-progress와 중간 실패 테스트 |
| preUninstall 전량 | 제한 시간과 부분 완료 표시 |
| 감사 id/자유문 보존 | 삭제 범위를 명확히 문서화, 완전 삭제나 준수 단정 금지 |

테스트:
- T1 정식/평가판 0~7일, 8일, 만료 뒤, 날짜 없음, 다음 날 재노출, 각 엔트리.
- T2 INPUT 무변경, REOPENED→EDIT 승격, 승인 결정 보존, 인증 자동 복원 금지, KEEP/ZERO 0, 주간 경계, 타 기간 불변, 재숨김 방지, 부분 실패/중복/경합/이어하기.
- T3 OFF/APP 성공/실패, asUser timeout·5xx면 앱 금지, APP UNKNOWN 재전송 금지, 실제 승인자 유지.
- T4 account source 중복, closed 재보고 제외, updated·204·429·Cycle-Period 14일, 비주기 SQL 0, 기능용 삭제와 감사 id 보존, 이름+id 엑셀.
- 모든 에이전트 완료 후 npm test → npm run merge → npm run test:ui → npm run build:ui. forge 명령 금지와 lint 요구 해석은 리더 보고.

## 11. 금지 문서 반영 초안

AGENTS: “관리자가 fieldChangeApplyFallback=APP를 설정한 경우 승인된 필드 변경의 asUser PUT 확정 권한/편집 실패 뒤 FieldChangeApplier가 고정 사유 field-change-apply-fallback으로 asApp PUT 1회를 허용한다. 조회/접근 검증은 asUser이며 UNKNOWN은 재전송하지 않는다. 실제 승인자를 보존하고 앱 적용을 감사에 남긴다.”

CLAUDE: “기간 재개방은 새 입력 허용과 승인·인증 효력 해제를 동반하는 수정 허용의 두 단계다. 결정/인증 원본을 보존하며 재승인·재인증을 요구한다. 개인정보 보고는 기존 일일 큐의 KVS 주기 gate로 실행하며 closed의 기능용 정보를 정리하고 사용자 결정에 따라 감사 식별자는 보존한다.”

