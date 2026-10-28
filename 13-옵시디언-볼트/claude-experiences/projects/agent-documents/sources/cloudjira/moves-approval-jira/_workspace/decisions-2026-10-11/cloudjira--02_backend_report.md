# 백엔드 구현 보고 — decisions-2026-10-11

2026-10-11. 중단된 이전 구현을 후속 백엔드 에이전트가 검토하고 보강했다. 기존 미커밋 작업을 보존했고 git/forge/build 명령은 실행하지 않았다.

## 실제 resolver 계약

모든 성공 값은 Controller의 `{content: result}`를 invokeApproval이 벗긴 result다. 신규 두 resolver는 TimesheetController/PermissionMap에 등록했으며 이 Controller는 기존 CONTROLLER_REGISTRARS에 등록되어 있다.

| 이름 | 권한 | 입력 | 실제 result |
|---|---|---|---|
| listPeriodCloses | admin | 기존 count/beforePeriodKey | 기존 응답. 각 item에 `reopenOperation:null 또는 {operationId,status,phase,counts,complete}` |
| previewPeriodReopen | admin | `{periodKey,rev}` | `{previewToken,periodKey,rev,scope:'SITE',counts:{approvals,certifications,hidden},expiresAt}` |
| reopenPeriod | admin | `{periodKey,rev,mode?:'INPUT'}` | 기존 `{item}` |
| reopenPeriod | admin | `{periodKey,rev,mode:'EDIT',reason,previewToken}` | `{item,operationId,status,phase,counts:{approvals,certifications,hidden},complete}` |
| continuePeriodReopen | admin | `{operationId}` | EDIT와 동일 |
| saveApprovalSettings | 기존 admin | `{patch:{fieldChangeApplyFallback:'OFF' 또는 'APP'}}` | 기존 settings. getApprovalSettings에 기본 OFF 포함 |
| applyFieldChange | 기존 권한 | 기존 입력 | 앱 시도 시 `applyMode:'APP'`; 성공 `appliedBy:'APP'`, 실패/UNKNOWN은 `appliedBy:null` |
| resolveUsers·Directory 형제 목록 | 기존 권한 | 기존 입력 | closed이면 `accountStatus:'closed',closedLabel:'A'/'B'/…,'avatarUrl':null,active:false`; displayName은 `Deleted user A` 형태의 표시용 fallback. FE는 closedLabel을 번역한다. |

T2 status는 RUNNING/COMPLETE, phase는 APPROVALS/CERTIFICATIONS/VISIBILITY/FINALIZE/COMPLETE. counts는 실행한 항목 누적 수다. `complete:true`는 효력 해제와 visibility 해제 **예약** 완료이며 Jira visibility 실제 복구는 기존 worker가 잇는다. 미완료면 같은 operationId로 continue. 다른 관리자도 이어받을 수 있다. 사유는 시작 때 고정되어 이어하기 입력으로 바꾸지 않는다. previewToken이 operationId이므로 시작 호출 실패 후에도 목록의 진행 중 작업이나 token으로 이어갈 수 있다.

T2 새 오류: `PERIOD_REOPEN_PREVIEW_STALE`, `PERIOD_REOPEN_REASON_REQUIRED`, `PERIOD_REOPEN_IN_PROGRESS`. ErrorCodes와 kr/en error.json 추가 완료. 기존 `INVALID_TARGET`, `TIMESHEET_PERIOD_INVALID`, `PERIOD_NOT_CLOSED`, `STORAGE_NOT_READY`, `CONCURRENT_MODIFICATION`도 발생한다. accountId/subjectId 입력과 SITE 이외 scope는 거부한다. reason은 NFC/trim 후 1~500자다.

## 프론트가 함께 소비해야 하는 필드

- 타임시트 상태는 APPROVED를 보존하고 `driftDetectedAt`+선택 필드 `driftKind:'REOPENED'`로 재승인 필요를 표현한다. 상세 drift.kind도 REOPENED다.
- 이벤트 `PERIOD_REOPENED`의 actorKey·occurredAt·reason에 관리자와 사유를 남긴다. approver 결정 행은 변경하지 않는다.
- 인증 저장/표시 상태에 `REOPENED`, 인증 감사 outcome에 `HAS_REOPENED`, current.reopened(0이 아니면 선택 필드)를 추가했다. 인증 목록에서 certifiable=true이며 명시적 재인증이 새 certRev를 만든다.
- 통제 감사 action `HIDE_RELEASE_REQUESTED`, reasonCode `PERIOD_REOPENED`가 해제 예약 관리자·사유를 남긴다. 실제 해제는 기존 HIDE_RELEASED 등으로 남는다.
- closed DTO는 userDisplay.userMapOf 및 인증·통제 user map, Timesheet/Certification 매트릭스에도 전달된다. 타임시트 상세는 `subjectAccountStatus:'closed',subjectClosedLabel`; 기간 관리 item은 `closedByClosedLabel`/`reopenedByClosedLabel` 선택 필드다.
- FIELD_APPLIED 이벤트의 `reason:'APP_FALLBACK'`이면 `appliedBy:'APP'`를 파생하며 실제 actorKey는 유지한다(root의 ApprovalService·CertificateService·감사 DTO 연결 포함).

## T2 구현 판단과 보존

approval_request.APPROVED와 approval_approver 결정을 그대로 보존했다. timesheet_submission의 기존 drift 경로에 REOPENED를 기록하면 기존 기간 승인 잠금이 풀리고 기존 재제출 경로를 재사용할 수 있다.

인증은 MISMATCH와 별도로 REOPENED를 뒀다. 원본 cert_*·batch·certRev·인증자는 보존한다. 관찰로 원본 지문이 돌아와도 인증이 자동 복귀하지 않는다. KEEP/ZERO 모두 0시간, 본인 인증 수와 최근 인증 시각에서 제외되며 Workforce 인증 문서의 목록에서도 빠진다. 인증 감사에 재개방 상태와 결과를 추가했다.

SQL 작업 원장에 preview·사유·고정 범위·진행 phase/cursor·pending 항목·누적 수를 기록한다. 20초 예산과 25초 SQL 리스를 적용한다. pending을 효과보다 먼저 저장하고 감사/outbox까지 끝나야 cursor를 전진한다. 부분 실패는 원장을 보존한다. 완료 요청 재전송은 추가 전이를 실행하지 않는다.

기간 행의 reopen_operation_id와 rev가 수정 허용 중간 상태를 잠근다. 기존 REOPENED를 EDIT로 승격해도 진행 중에는 기간 잠금으로 판정한다. 인증 서비스·타임시트 제출/결정에 진행 중 검사를 추가했고 인증 INSERT/재인증 CAS 및 결재자 PENDING 결정 SQL도 진행 중 마감 표식을 확인한다. 마지막에 잔여 항목을 다시 스캔한다. 인증 관찰만 rev를 올렸으면 같은 certRev의 최신 rev로 재시도한다. 새 인증 판은 옛 pending으로 덮지 않는다.

인증/통제 범위는 기간키가 아닌 저장된 start/end로 조회한다(주간 재개방이 월 인증 행에 적용됨). 통제 원장의 reopen_release_id를 보존하므로 LINKED_ALL도 재숨김하지 않는다. 새 명시적 인증 또는 타임시트 결정 훅에서만 해제 표식을 지운다. marker가 있는 종료 행은 90일 통제 정리에서 제외한다. visibility 원장/worker.releaseOne과 원래 공개 범위를 재사용한다. 원래부터 제한된 워크로그는 건드리지 않는다.

인증 outbox.touchCert는 기존 workforce-cert wake를 사용하고 완료 시 workforce 큐도 깨워 승인 문서를 갱신한다. resolver가 Jira property PUT을 실행하지 않는다.

## T3

SettingsRepository 키/기본값/전역 전용 목록과 SettingsService enum 검증에 fieldChangeApplyFallback을 등록했다. 기본 OFF, 값 APP만 선택 가능하다. 엔진/Gateway/전송 fence/테스트는 root 보고서 참조. overrideScreenSecurity는 사용하지 않는다. 400은 화면 오류를 내부에서 식별한 경우에만, 401/403은 확정 거절일 때만 앱 대체를 허용한다. UNKNOWN/네트워크/5xx는 재전송하지 않는다.

공식 [Edit issue 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put)는 Forge의 화면 우회를 Administer Jira 사용자를 대신하는 호출에 한정한다. 이번 asApp 경로가 그 조건을 충족한다는 근거가 없어 overrideScreenSecurity를 추가하지 않았다. 따라서 앱 권한으로도 화면 밖 필드 적용은 실패할 수 있으며 실측 전 성공을 보장하지 않는다. 승인자는 actorKey, 앱 적용자는 appliedBy=APP로 구분한다.

## T4 보고·closed 정리

manifest에 `report:personal-data` scope를 추가했다. 새 scheduledTrigger 없이 DAILY_JOBS에 personal-data를 추가했다. 작업의 첫 KVS due 검사에서 비주기는 SQL 0으로 종료한다. 첫 실행은 수집을 시작해 기존 설치 데이터를 놓치지 않는다.

PersonalDataRepository는 SQL의 65개 account column/JSON source를 명시하고 DISTINCT GROUP BY+keyset 또는 JSON row+offset으로 나눈다. KVS managers/approvers도 포함한다. 수집 단계에서 계정별 최초 시각 최솟값을 통합한 뒤 보고 단계로 넘어가므로 뒤 source의 오래된 시각을 놓치지 않는다. 최초 수집 시각을 증명할 수 없는 값은 epoch를 사용한다. now로 오래된 개인정보 나이를 숨기지 않는다.

KVS index는 90개씩, API POST도 최대90개다. 20초 soft budget, SQL 작업 리스30초, API timeout5초를 적용한다. 응답 pending을 먼저 저장하고 closed/updated 정리를 끝내기 전에는 보고 cursor를 전진하지 않는다. 부분 수집·부분 삭제를 이어받는다. 204를 정상 처리한다. Cycle-Period 숫자는 일 단위(없으면7일), Retry-After는 초/HTTP날짜로 처리한다. per-account nextDue로 source 중복/같은 주기 재보고를 막고 closed는 이후 보고에서 제외한다.

closed tombstone은 정리보다 먼저 기록한다. SQL 개인정보 작업 리스를 보유한 흐름이 KVS 단조 번호를 먼저 예약해 A/B/…/AA 표식을 영속화한다. 같은 계정의 표식은 사이트 전체에서 유지된다. 번호 예약 후 중단은 빈 번호만 남기며 이미 배정된 표식은 바꾸지 않는다. deactivated/inactive는 Jira가 준 이름을 유지한다.

표식의 결정성은 영속 계정 조회를 우선하는 배정 원장으로 보장한다. accountId만으로 A/B를 산출하는 순수 함수는 아니며 최초 배정 순서는 수집 순서에 따른다. 짧은 해시 충돌을 무시하는 설계는 채택하지 않았다. 개인정보 작업 리스 안에서 번호를 예약하고 이미 저장한 표식을 재사용하므로 같은 사이트의 재실행·다른 화면에서 변하지 않는다.

후속 검토에서 두 주기 경계 결함을 수정했다. KVS 커서를 읽은 뒤 SQL 리스를 얻는 사이 다른 실행이 완료했으면 리스 뒤 상태를 다시 읽어 중복 보고하지 않는다. 수집된 계정의 보고 주기가 아직 남아 보고 POST를 생략했을 때도 해당 nextDue 최솟값을 보존한다. 회귀 테스트 3건(경합, 이른 nextDue, 저장 표식 재사용)을 추가했다. 이번 후속 단계에서 바꾼 파일은 PersonalDataService.js와 PersonalDataService.test.js 및 이 보고서다.

공식 [Forge 개인정보 가이드](https://developer.atlassian.com/platform/forge/user-privacy-guidelines/)로 report:personal-data, /app/report-accounts, 최대 90개, 최초 수집 시각, closed/updated, 기본 7일·Cycle-Period·Retry-After 계약을 확인했다. 실제 Forge 설치의 응답과 주기 헤더 형식은 미검증이다.

기능용 삭제: 서명·PIN·알림·업무함 projection·위임·팀 명부·CUSTOM 그룹 명부·USER flow principal·임시 export session/entry·Workforce 수신 캐시/게시 작업. 그룹/flow는 필수 승인자 감소로 자동 통과하지 않게 비활성화한다. 서명 본문 캐시는 부분 수정하지 않고 문서 전체를 무효화한다. KVS managers/approvers를 정리하고 AppAccess cache를 무효화한다. updated도 해당 캐시 무효화를 완료한 뒤 cursor를 전진한다.

감사 식별자: request/approver/event/cc, 타임시트·필드·전환·사전승인 snapshot, worklog_cert/batch/log, worklog_history, worklog_control_log, settings_audit를 유지한다. worklog_control과 출처증명/복구에 필요한 intent는 복구를 위해 유지하며 기존 보관 정리 규칙을 따른다. 사용자 자유문/snapshot의 모든 개인정보를 완전히 삭제한다고 주장하지 않는다. 사용자 계정별 별도 KVS secret 저장은 현재 코드에서 확인되지 않았고 앱 서명키는 삭제하지 않는다.

후속 재생성 방어: 알림 recipient·Workforce outbox/직접 touchMany·게시 직전에서 closed를 제외한다. 관리자/승인자 명부, 팀·그룹·flow USER principal·위임 저장도 tombstone을 검사한다. root가 요청자/대상자/CC/새 승인자 등록 및 ApprovalService의 직접 검색/그룹 확장을 보강했다. 과거 감사 화면은 조회 가능하다.

preUninstall은 기존 visibility 복구45초를 먼저 수행하고 남은52초 한도 내 예산을 개인정보 정리에 쓴다. 정리 실패는 복구를 건너뛰지 않는다. `{personalData:{complete,cursor,deleted}}`를 내부 실행 요약으로 남기고 대량 데이터 전량 정리를 보장하지 않는다.

## 파일

신규: `src/resolver/timesheet/PeriodReopen{Repository,Service,Guard}.js`, `src/rdb/schema/ddl/periodReopen.sql.js`, `src/resolver/personalData/PersonalData{State,Gateway,Service,Repository}.js`, 관련 tests.

T2 변경: PeriodCloseService/Repository, TimesheetController/Service/Repository, WorklogCertService/Repository, WorklogControlRepository/Worker/Hooks, ApprovalRepository/Service, WorklogHistoryRepository, WorkforceOutbox/LinkService, domain/timesheet/lock, domain/worklogCertification/state·counting, domain/audit/certAudit, domain/approval/constants, domain/worklogControl/journal, integration/workforce/certificationDoc, PermissionMap, ErrorCodes, error.json.

T4 변경: DirectoryService, userDisplay, IssueFieldReader, NotificationRepository, SettingsRepository, TeamRepository, ApprovalGroupRepository, FlowRepository, DelegationRepository, WorkforceLinkRepository/Publisher, trigger/sweepJobs·onPreUninstall, manifest.yml. root의 직접 구현 파일/최종 종합 목록은 02_codex_report에 통합한다.

## 마이그레이션·비용·검증

- v061_create_approval_period_reopen: 작업/미리 보기 원장. UNIQUE active_key로 기간별 동시 작업 제한.
- v062_alter_worklog_control_reopen: reopen_release_id.
- v063_alter_approval_period_close_reopen: reopen_operation_id.
- 신규 테이블·컬럼 readiness 확인. 기존 migration 이름 변경 없음. 신규 인덱스는 CREATE 내부다.
- manifest scope upgrade 필요. 새 테이블 major 배포 승인 규칙도 배포 담당자가 확인해야 한다. 이번 작업에서는 forge를 실행하지 않았다.
- 비주기 유휴 SQL 기존27/38 유지. 개인정보 due일 빈 설치는 65 source 조회+리스2 = 추가67회이며7일 기본 주기로만 발생한다. 통제 pending marker가 있고 정책OFF인 비유휴 경로는 재개방 해제 예약 확인1회가 추가되어 기존6→7 상한이다.
- 2026-10-11 전체 BE148 suites/2312 tests PASS. 이후 개인정보 due일 SQL 고정 테스트1건 추가, 해당2 suites/28 tests PASS. 마지막 소규모 표시/인증 집계 보강 후 최종 전체 재검증은 아래 갱신한다.
- 프론트/i18n merge/UI test/build/forge lint는 root 단계이며 이 에이전트는 실행하지 않았다.
- 후속 최종 전체 `npm test -- --runInBand`: 148 suites / 2318 tests PASS(17.747초). 집중 7 suites / 120 tests PASS 및 후속 수정 파일 `git diff --check` 통과. 추가 에이전트 생성 없음.

## 미검증·후속 실측

- Forge raw `asApp().requestAtlassian(route\`/app/report-accounts\`)`는 설치 SDK에서 확인했으나 실배포 scope/200·204·Cycle-Period 응답은 미검증.
- privacy API closed는 시험 계정으로 확인해야 한다. 감사 식별자 보관은 사용자 결정이며 법률/Atlassian 적합성을 단정하지 않는다.
- TiDB 조건부 인증 INSERT SELECT·UNION ALL 및 재개방 표식이 있는 동시 승인/인증의 실환경 경합, 앱 제거의55초 제한/대량 복구는 미검증.
- 재개방은 원장 예약 완료 뒤 visibility worker가 비동기로 실행한다. Jira 권한을 잃거나 UNKNOWN이면 기존 해제 잔여/백오프가 남는다.
- 새 certRev를 외부 코드가 진행 표식 방어를 우회해 만든 경우 옛 작업은 덮지 않고 CONCURRENT_MODIFICATION으로 미완료에 남는다. 현재 서비스와 SQL 쓰기 경로에는 재인증 방어를 추가했다.

## 금지 문서 반영 초안

AGENTS: “관리자가 fieldChangeApplyFallback=APP를 설정한 경우 승인된 필드 변경의 asUser PUT 확정 권한/편집 화면 실패 뒤 FieldChangeAppGateway가 고정 사유 field-change-apply-fallback으로 asApp PUT1회를 허용한다. UNKNOWN은 재전송하지 않으며 실제 승인자와 앱 적용을 함께 감사에 남긴다.”

CLAUDE: “기간 재개방은 새 입력 허용과 승인·인증 효력 해제를 동반하는 수정 허용 두 단계다. 결정·인증 원본을 보존하고 재승인·재인증을 요구한다. 개인정보 보고는 기존 일일 큐의 KVS 주기 gate를 사용하며 closed의 기능용 정보를 정리하고 사용자 결정에 따라 감사 식별자를 유지한다.”
