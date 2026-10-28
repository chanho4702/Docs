# 사용자 결정 T1~T4 구현 보고

기준: 2026-10-11, `00_input/requirement.md`. 중단된 작업의 구현·문서를 검토하여 이어서 보강했다. 다른 기능의 미커밋 변경을 보존했으며 금지 파일, 워크포스 리포, Git 스테이징·커밋·푸시 및 배포·설치 명령은 변경하거나 실행하지 않았다. 기존 관리자·개인정보 가이드 변경은 실제 구현 범위와 일치하여 유지했다.

## T1 — 라이선스 만료 경고

정식 구독과 평가판 모두 만료 7일 전부터 공통 mount의 모든 엔트리에 경고한다. 날짜를 알 수 없으면 경고를 계산하지 않으며 제공자 지정 여부를 알 수 없으므로 조건부 문구를 사용한다. INACTIVE 차단 경계는 유지한다. 닫기는 만료일+현지 날짜로 기억한다. 열린 화면도 자정에 경고·남은 일수를 갱신하고, 만료 8일에서 7일로 넘어가면 경고를 시작한다. 만료 안내에 Jira 기본 시간 추적 제공자 복원 3단계를 추가했다.

파일: `static/ui/src/stores/useLicenseStore.js`, `static/ui/src/features/license/{TrialExpiryBanner,LicenseGuidePage}.jsx`, `static/ui/src/features/license/licenseConstants.js`, `static/ui/src/app/mount.jsx`, `locales/{kr,en}/license.json`, 각 테스트, `docs/guide/{ko,en}/09-admin-guide.md`. 전체 목록과 집중 검증은 [T1 보고](cloudjira--02_license_report.md)에 있다. 새 resolver·SQL·마이그레이션은 없다.

## T2 — 두 단계 재개방

INPUT은 마감 잠금만 해제하는 기존 동작이다. EDIT는 승인·인증·숨김 건수를 미리 보여 주고 확인 및 사유(정규화·trim 후 1~500자)를 받는다. 기존 재개방 범위인 SITE 전체 기간을 그대로 사용하며 accountId/subjectId나 다른 scope 입력은 거부한다.

`approval_request.APPROVED`와 결재자 결정은 보존한다. `timesheet_submission.drift_kind='REOPENED'`와 결정적 `PERIOD_REOPENED` 이벤트로 현재 승인 효력을 해제하여 기존 승인 후 변경/재제출 흐름에 연결한다. 결재자 행을 덮거나 삭제하지 않는다. 인증은 기존 원본·certRev를 보존하고 `REOPENED` 상태로 전이한다. 단순 MISMATCH로 처리하면 원본 지문이 복구될 때 자동 인증 복귀할 수 있어 별도 상태를 택했다. 인증 시간은 KEEP/ZERO 모두 0이며 명시적인 재인증이 필요하다.

20초 예산, 25초 리스, CAS 작업 원장과 pending/cursor로 부분 진행을 이어받는다. 진행 중에는 기간 표식으로 수정·재승인·재인증 경합을 막는다. 감사와 outbox까지 처리한 뒤 cursor를 전진하며 새 인증 판을 옛 pending으로 덮지 않는다. visibility는 기존 통제 원장을 해제 예약 상태로 전환하고 기존 worker로 복구한다. 원래 제한된 워크로그를 건드리지 않는다. 재개방 해제 표식을 유지하여 LINKED_ALL 정책이 즉시 다시 숨기지 않도록 했다. `complete:true`는 효력 해제와 **숨김 해제 예약** 완료이며 실제 Jira 복구는 비동기다.

핵심 파일: `src/resolver/timesheet/PeriodReopen{Repository,Service,Guard}.js`, `PeriodClose{Repository,Service}.js`, `Timesheet{Controller,Repository,Service}.js`, `src/resolver/worklogCert/WorklogCert{Repository,Service}.js`, `src/resolver/worklogControl/WorklogControl{Repository,Worker,Hooks}.js`, `src/resolver/approval/{ApprovalRepository,ApprovalService}.js`, `src/domain/timesheet/lock.js`, `src/domain/worklogCertification/{state,counting}.js`, `src/domain/audit/certAudit.js`, `src/domain/approval/constants.js`, `src/integration/workforce/certificationDoc.js`, `src/resolver/workforce/{WorkforceOutbox,WorkforceLinkService}.js`, `src/rdb/schema/ddl/periodReopen.sql.js`, `src/rdb/schema/migrate.js`, `src/permission/PermissionMap.js`, `src/utils/errors/ErrorCodes.js`, 관련 테스트. UI는 `static/ui/src/features/settings/PeriodCloseSettings.jsx`, `timesheet/{PeriodStatusBadge,MyTimesheetPage,TeamMatrixTable}.jsx`, `worklogCert/certFormat.js`, `audit/auditModel.js`, `detail/ApprovalDetail.jsx`와 관련 테스트·번역이다.

## T3 — 필드 변경 앱 대체 적용

`fieldChangeApplyFallback`의 기본값은 OFF, 켜짐 값은 APP이다. 최종 결재자 asUser 적용을 먼저 수행하며 확정 권한 거절이나 식별된 화면 오류일 때만 앱 PUT을 한 번 시도한다. 앱 PUT 직전에 현재값을 호출자 권한으로 다시 확인하고 전송 fence를 갱신한다. 값 충돌·조회 실패·네트워크/5xx·UNKNOWN은 대체 적용 또는 재전송 근거가 되지 않는다. 앱 성공에는 `appliedBy:'APP'`, `applyMode:'APP'`, 이벤트 사유 `APP_FALLBACK`을 남기고 실제 승인자 actorKey·결재 결정은 유지한다.

파일: `src/domain/fieldChange/applyPlan.js`, `src/resolver/fieldChange/{FieldChangeApplier,FieldChangeAppGateway,FieldChangeRepository,FieldChangeService,IssueFieldReader}.js`, `src/resolver/settings/{SettingsRepository,SettingsService}.js`, `src/resolver/approval/target/FieldChangeTargetAdapter.js`, `src/resolver/approval/{ApprovalService,CertificateService}.js`, `src/domain/audit/approvalAudit.js`, 관련 테스트. UI는 켤 때 Jira 이력 수정자가 앱으로 남는다고 안내한다.

프론트 파일: `static/ui/src/features/settings/PolicySettings.jsx`, `settings/__test__/PolicyFallback.test.jsx`, `fieldChange/{fieldChangeModel.js,FieldChangeTargetHeader.jsx}`, `certificate/CertificateSheet.jsx`, `audit/ApprovalAuditTab.jsx`, `locales/{kr,en}/policy.json` 및 감사·상세 번역. flat settings patch와 `{patch}` 모두 기존 서비스가 수용한다.

[Jira Edit issue 공식 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put)의 Forge `overrideScreenSecurity` 조건은 Administer Jira 사용자를 대신하는 호출이다. 이번 asApp 경로의 충족 근거가 없어 플래그를 넣지 않았다. 앱의 권한·화면 제약 때문에 대체 적용도 실패할 수 있다.

## T4 — 개인정보 보고·탈퇴 계정

[Forge 개인정보 공식 가이드](https://developer.atlassian.com/platform/forge/user-privacy-guidelines/)를 확인하여 `report:personal-data`, `/app/report-accounts`, 최대 90계정, 기본 7일·Cycle-Period·Retry-After 계약을 적용했다. 새 scheduledTrigger를 만들지 않고 기존 일일 큐에 `personal-data`를 넣었다. 비보고일은 KVS 검사 후 SQL 0으로 종료한다. 보고일에는 20초 예산, DISTINCT/keyset 및 JSON row/offset cursor, per-account 최초 수집일 최솟값·nextDue로 분할한다. 응답 pending을 저장한 뒤 삭제/캐시 갱신을 마쳐야 cursor를 전진한다. SQL 리스 획득 뒤 KVS 상태를 다시 읽어 경합에 의한 중복 보고를 막는다.

closed 표식을 먼저 저장한 뒤 기능용 개인정보를 삭제한다. 표식은 SQL 작업 리스 안에서 A/B/…/AA 영속 순번을 예약하고 이후 계정 원장에서 재사용한다. 같은 계정은 사이트의 모든 화면에서 같은 표식이다. **accountId만으로 A/B를 계산하는 순수 함수는 아니며 최초 배정 순서는 수집 순서에 의존한다.** 결정성은 저장된 배정 원장을 기준으로 보장하고 짧은 해시 충돌은 가정하지 않는다. 비활성 계정은 Jira 이름을 유지한다.

| 저장소 | closed 처리 |
|---|---|
| approval_signature, approval_pin | 계정 행 삭제 |
| approval_notification, approval_inbox | 알림 및 소유자/요청자/대상자의 기능 사본 삭제. 원본 CC 명부는 보존 |
| approval_delegation, timesheet_team_member | 위임 양쪽·팀 등록 삭제 |
| approval_group, approval_flow_step | CUSTOM 명부·USER principal 정리, 승인자 감소로 자동 통과하지 않도록 그룹/flow 비활성화 |
| approval_export_session/entry | 임시 내보내기 세션·항목 정리 |
| workforce_inbound, workforce_publish | 기능 캐시 문서 전체 무효화·계정 게시 작업 정리, 이후 재생성 방어 |
| KVS managers/approvers, AppAccess cache | 등록 제거 및 캐시 무효화 |
| request/approver/event/cc, 인증·변경·통제·설정 감사 | 사용자 결정에 따라 감사 식별자 보존 |
| worklog_control·복구용 intent·mirror | 공개 범위 복구·이력 정합에 필요한 원장 보존 |

updated는 기능 캐시를 무효화하여 다음 조회에서 갱신한다. 과거 자유문·snapshot의 모든 개인정보를 완전히 삭제한다고 주장하지 않는다. preUninstall은 기존 visibility 복구를 먼저 실행하고 남은 예산에서 기능용 정보를 정리한다. 대량 데이터가 제거 훅 한도 안에 모두 정리된다는 보장은 없다.

파일: `src/resolver/personalData/PersonalData{State,Gateway,Service,Repository}.js` 및 테스트, `src/resolver/directory/{DirectoryService,ApprovalGroupRepository}.js`, `src/resolver/timesheet/{userDisplay,TeamRepository}.js`, `src/resolver/{delegation/DelegationRepository,flow/FlowRepository,notification/NotificationRepository,settings/SettingsRepository}.js`, `src/resolver/workforce/{WorkforceLinkRepository,WorkforcePublisher,WorkforceOutbox}.js`, `src/trigger/{sweepJobs,onPreUninstall}.js`, `src/trigger/__test__/idleSqlBudget.test.js`, `manifest.yml`, `docs/guide/{ko,en}/{09-admin-guide,11-data-security-privacy}.md`. 65개 SQL account/JSON 수집 source와 KVS 명부의 상세 조사는 [백엔드 보고](cloudjira--02_backend_report.md)에 있다.

프론트 파일: `static/ui/src/utils/userDisplay.js`·테스트, `api/invokeApproval.js`, `features/audit/exportAuditExcel.js`, `features/worklogHistory/exportWorklogHistoryExcel.js`, `features/settings/{exportRetentionExcel,exportRecordArchive}.js`, `features/inbox/exportInboxExcel.js` 및 기존 Excel 테스트. 이름+id 사람 칸과 보관 JSON에 대한 감사 계정 대조 시트를 추가했다. 팀 타임시트는 기존 이름/Account ID 열을 유지한다. 번역은 `common`, `timesheet`, `worklogCert`, `audit`, `detail`, `worklogControl`의 kr/en 양쪽을 변경했다. 전체 목록·추가 회귀 8건은 [프론트 보고](cloudjira--02_frontend_report.md)에 있다.

추가 경계면 보강: `PersonalDataState.overlayUserFieldValues`가 USER 필드의 from/to/current/conflictValue에 동일한 closedLabel을 넣는다. `FieldChangeService` 폼·목록, 대상 adapter의 상세·가시성 목록·증명서, applier 충돌 응답에 연결했다. 새 값으로 closed 계정을 지정하면 FIELD_CHANGE_INVALID_VALUE다. 원본 감사 스냅샷은 바꾸지 않는다. `PersonalDataDisplay.test.js`, `FieldChangeService.test.js`, `FieldChangeTargetAdapter.test.js`에 보존·타입 범위·폼·신규 값 거부·증명서 회귀 5건을 추가했다.

독립 검토에서 `approval_inbox.role='CC'`가 기능 사본이 아닌 원본 참조 명부라는 점을 확인했다. 개인정보 정리·앱 제거 모두 `role <> 'CC'`로 좁혀 감사 CC 식별자를 보존하고, 기존 개인정보 보고 source는 CC를 계속 포함한다. `PersonalDataRepository.test.js`에 양쪽 정리 및 보고 범위를 검증하는 회귀 1건을 추가했고 가이드에도 예외를 명시했다. 자세한 계약 검증은 [독립 검증 보고](cloudjira--03_verify_report.md)에 있다.

## 실제 resolver 계약

성공 전송은 기존 `{success:true,content:result}`이며 `invokeApproval`은 result를 반환한다. 실패는 기존 `{success:false,error:{name,code,message,cause}}`다.

| 이름 | 권한 축 | 입력 | result |
|---|---|---|---|
| listPeriodCloses | `{admin:true}` | 기존 count/beforePeriodKey | 기존 목록, item.reopenOperation 추가 |
| previewPeriodReopen | `{admin:true}` | `{periodKey,rev}` | `{previewToken,periodKey,rev,scope:'SITE',counts:{approvals,certifications,hidden},expiresAt}` |
| reopenPeriod | `{admin:true}` | `{periodKey,rev,mode?:'INPUT'}` | 기존 `{item}` |
| reopenPeriod | `{admin:true}` | `{periodKey,rev,mode:'EDIT',reason,previewToken}` | `{item,operationId,status,phase,counts,complete}` |
| continuePeriodReopen | `{admin:true}` | `{operationId}` | EDIT와 동일 |
| saveApprovalSettings | 기존 admin | `{patch:{fieldChangeApplyFallback:'OFF'/'APP'}}` | 기존 settings |
| applyFieldChange | `'SELF'` + 대상 열람·참여자/Jira 관리자 서비스 검증 | `{requestId}` | `{requestId,apply:{status,already,code,current,appliedAt,appliedBy,attempts,applyMode?:'APP'}}` |
| resolveUsers | `'SELF'` | `{accountIds}` | `{items}`; closed 계정에 accountStatus/closedLabel/avatarUrl null/active false |
| 형제 사용자 목록 | 기존 SELF/admin 축 | 기존 입력 | 같은 closed 계정 메타데이터 |

신규 두 resolver는 guardedDefine·PermissionMap에 선언했고 기존 TimesheetController registrar를 재사용한다. 개인정보 보고는 내부 큐 서비스로 공개 resolver를 추가하지 않는다. 새 오류는 `PERIOD_REOPEN_PREVIEW_STALE`, `PERIOD_REOPEN_REASON_REQUIRED`, `PERIOD_REOPEN_IN_PROGRESS`다. ErrorCodes 및 kr/en error.json을 함께 반영했다. 기존 INVALID_TARGET, TIMESHEET_PERIOD_INVALID, PERIOD_NOT_CLOSED, STORAGE_NOT_READY, CONCURRENT_MODIFICATION도 반환할 수 있다. T3 기존 UNKNOWN·FIELD_CHANGE_* 오류 경계를 유지한다.

## 마이그레이션·manifest·유휴 SQL

- v061_create_approval_period_reopen: 미리 보기·작업 원장, active_key UNIQUE.
- v062_alter_worklog_control_reopen: reopen_release_id.
- v063_alter_approval_period_close_reopen: reopen_operation_id.
- 기존 migration 이름을 바꾸지 않았고 테이블/컬럼 readiness를 확인한다. 신규 인덱스는 CREATE TABLE 내부다.
- manifest는 `report:personal-data` scope 추가. 배포 담당자의 install --upgrade가 필요하다. 이번에는 배포·설치를 실행하지 않았다.
- 개인정보 비보고일 유휴 일합계 미연동 27회·연동 38회 이하 유지. 보고일의 빈 설치는 65 source+리스/해제 2회로 **67회 추가**, 기본 7일 주기. 테스트를 숫자로 고정했다.
- 통제 pending이 있는 비유휴 경로에는 재개방 해제 조회 1회가 추가되어 기존 6회 상한을 7회로 조정했다. 신규 scheduledTrigger·consumer·프론트 엔트리는 없다.

## AGENTS/CLAUDE 반영 초안

AGENTS asApp 허용 목록 추가안:

> 관리자가 fieldChangeApplyFallback=APP를 켠 경우 승인된 필드 변경의 asUser PUT 확정 권한/편집 화면 실패 뒤 FieldChangeAppGateway만 고정 사유 field-change-apply-fallback으로 asApp PUT 1회를 허용한다. 실제 승인자와 앱 적용자를 함께 감사에 남기고 UNKNOWN은 재전송하지 않는다. 개인정보 보고 API는 PersonalDataGateway의 asApp.requestAtlassian('/app/report-accounts')에서만 호출한다.

CLAUDE 제품 결정 추가안:

> 기간 재개방은 새 입력 허용과 수정까지 허용의 두 단계다. 수정 허용은 기존 결정·인증 원본을 보존하고 현재 효력을 해제하여 재승인·재인증을 요구한다. 개인정보 보고는 기존 일일 큐와 KVS 주기 관문을 사용하며 closed 계정의 기능용 정보를 삭제하고 사용자 결정에 따라 감사 식별자를 보존한다. 삭제 계정은 사이트 공통 영속 구분 표식으로 표시한다.

금지 문서에는 실제로 반영하지 않았다.

## 최종 검증

| 명령 | 결과 |
|---|---|
| npm test -- --runInBand | PASS, 149 suites / 2,325 tests, 17.127초 |
| npm run merge | PASS, ko-KR.json·en-US.json 생성 |
| npm run test:ui -- --runInBand --watchAll=false | PASS, 65 suites / 574 tests, 20.357초 |
| npm run build:ui | PASS, 모든 에이전트 종료 후 실행, 번들 예산 초과 없음 |
| npx forge lint | exit 1, 코드 오류 0·경고 0, scope 변경에 따른 MAJOR_VERSION_RULE 승인 항목 1개 |

유휴 예산 집중 21 tests, T1 집중 37 tests 통과. 최초 필드 tombstone 연결 테스트에서 외부 KVS를 호출하던 6건은 서비스 개인정보 의존성 주입과 test double로 수정하여 최종 전체 통과했다. PowerShell의 정규식 인자 pipe는 따옴표로 전달했다. 검증용 `npx forge lint`만 요구사항의 구체적 예외로 실행하고 배포·설치 등 일반 forge 명령은 실행하지 않는다.

UI 빌드에는 의존 패키지의 기존 경고가 남았다: `@atlaskit/analytics-next-stable-react-context`의 누락된 source map 원본과 `@atlaskit/react-select` CSS의 postcss-calc 해석 경고다. 주요 엔트리 gzip 크기는 inbox 51.5 kB, modal 37.49 kB, issue 13.37 kB, settings 12.37 kB, worklog 6.38 kB, projectSettings 13.56 kB다. 빌드는 exit 0으로 완료했다.

Forge lint의 승인 항목은 `report:personal-data` scope로 기본 환경의 major version upgrade가 발생한다는 뜻이다. lint 통과로 표시하지 않았으며, 승인이나 배포·설치 업그레이드를 실행하지 않았다.

## 미검증·실환경 확인

- Forge context의 정식 구독 만료일 필드 제공 및 시간 추적 제공자 변경 화면 실측.
- 개인정보 API scope 업그레이드 후 실제 closed/updated·204·Cycle-Period 응답, raw requestAtlassian 연결.
- 실제 TiDB 재개방 동시 승인/인증 경합 및 대량 visibility 복구, 제거 훅 시간 한도.
- asApp 필드 적용 권한·화면 제약. overrideScreenSecurity를 사용하지 않으므로 성공을 보장하지 않는다.
- 감사 식별자 보관은 요청된 제품 결정이며 법률·Atlassian 적합성을 단정하지 않는다.

경험 기록: 개인정보 작업은 리스 전 읽은 커서를 리스 뒤 재확인해야 하며 POST를 생략한 계정의 nextDue도 최솟값 계산에 포함해야 한다. 외부 Obsidian Vault는 이번 실행의 쓰기 허용 범위 밖이어서 이 보고서에 기록을 남긴다.

## 수정 회차 — 2026-10-12

`codex-fix-prompt.md`와 독립 검증의 F1~F8 및 새 컬럼 의존성을 기준으로 중단된 회차의 현재 코드·diff·테스트를 검토했다. 올바른 기존 수정은 유지하고, 경계면 검토에서 발견한 누락과 재개 경합을 보완했다. 위의 최초 구현 설명 중 업무함 삭제 범위·그룹 비활성화·워크포스 캐시 삭제 설명은 아래 수정 내용으로 대체한다.

| 항목 | 최종 수정과 검증 |
| --- | --- |
| F1 번역 손상 | kr/en 기간 재개방·재승인·재인증·앱 적용 문구 복구. `localeIntegrity.test.js`가 전체 locale 값의 연속 물음표·U+FFFD·손상 구분자를 검사한다. `npm run merge`로 병합 사전을 재생성했다. |
| F2 업무함 소유권 | 계정 정리는 `actor_key` 본인 사본만 삭제하고 타인의 requester/subject 행 및 원본 CC를 보존한다. 실제 다른 결재자의 행이 남는 회귀 테스트와 ko/en 가이드를 확인했다. |
| F3 상세 조회 | `viewForTarget`의 재개방 차단을 제거하고 결정 경로는 유지한다. 진행 중 상세 조회 성공과 결정 거부를 함께 검증한다. |
| F4 프로필 갱신 | updated는 서명 검증 문서를 삭제하지 않는다. 표시 이름·아바타는 서버에 저장하지 않아 다음 asUser 조회에서 갱신된다. closed는 본인 `rms.org` 문서만 삭제하며 body_json의 타인 언급을 삭제 조건에 사용하지 않는다. |
| F5 배치 수집 | JSON 9개 원천을 200행 페이지와 row/offset 커서로 읽고 최대 200계정 결과를 90계정 처리 페이지로 나눈다. KVS 계정 상태는 25개 batchGet/batchSet을 사용하며 상태 저장도 페이지 단위다. 1만 행 수집은 SQL 51회로 제한된다. 인덱스 페이지를 넘긴 뒤 계정 쓰기가 실패한 경우 `collectBatch.indexPage`부터 재개해 170계정이 중복 없이 보고되는 테스트를 추가했다. |
| F6 구성원 정리 | 그룹·결재선의 enabled는 유지하며 탈퇴자의 등록만 제거한다. 빈 USER 단계와 빈 CUSTOM 그룹을 참조한 AGROUP 결재선에 검토 표식을 남긴다. `FlowService.flowSummary`가 needsReview를 실제 설정 응답에 전달하도록 수정했다. 관리자가 동시에 저장해 KVS 표식이 없어져도 상세·설정·요청 후보의 기존 SQL에서 빈 그룹을 판정해 경고와 신규 요청 제외를 유지한다. 별도 데이터 SQL 호출은 추가하지 않았다. ko/en 가이드와 UI 경고 테스트를 확인했다. |
| F7 서버 문구 | 서버는 displayName:null과 accountStatus/closedLabel 토큰만 반환한다. 프론트가 `탈퇴한 사용자 A` / `Deleted user A`로 표시하며 양쪽 가이드도 동일하다. |
| F8 만료 당일 | expiresToday 키를 사용하여 `오늘 만료` / `expires today`로 표시한다. 당일 배너 회귀 테스트를 확인했다. |
| 새 컬럼 준비 | 결정·인증 INSERT/재인증·마감/재개방은 `isColumnReady('approval_period_close', 'reopen_operation_id')`를 선행한다. v063 미적용 시 SQL을 실행하지 않고 STORAGE_NOT_READY로 차단한다. 조건을 생략하는 fail-open을 사용하지 않는다. 스키마 마커가 현재이면 readiness는 기존 경로대로 SQL 프로브를 생략한다. 컬럼 유무 각각 5경로 회귀가 있다. |

신규 resolver·scope·마이그레이션·스케줄은 이 수정 회차에서 추가하지 않았다. 기존 v061~v063 이름과 manifest 변경을 유지했다. 전체 테스트의 idleSqlBudget은 미연동 27회·연동 38회 이하 및 개인정보 비보고일 SQL 0, 보고일 빈 설치 추가 67회 계약을 통과했다.

독립 검증 에이전트는 읽기 전용으로 검토했으며 빌드 전에 완료했다. 금지 파일과 다른 세션의 변경을 보존했다. git add/commit/push·배포·설치는 실행하지 않았고, Forge 명령은 요청에 명시된 lint만 실행 대상으로 삼았다. Vault 쓰기는 허용 범위 밖이어서 경험을 이 보고서에 남긴다: UI 테스트의 fixture가 실제 resolver 변환을 우회하면 누락된 필드도 통과할 수 있으므로 생산자→서비스 DTO→UI 경계를 함께 확인해야 한다. 배치 저장 실패 회귀는 인덱스 페이지 경계와 부분 성공을 포함해야 한다.

### 수정 회차 검증

| 명령 | 결과 |
| --- | --- |
| npm test -- --runInBand | PASS — 151 suites / 2,342 tests |
| npm run merge | PASS — ko-KR.json·en-US.json 생성 |
| npm run test:ui -- --runInBand --watchAll=false | PASS — 67 suites / 577 tests |
| npm run build:ui | PASS — exit 0, 기존 Atlaskit source map·postcss-calc 경고만 |
| npx forge lint | exit 1 — 0 errors, 0 warnings, 기존 scope 변경 MAJOR_VERSION_RULE approval 1건만 |

node UTF-8 검사는 locale·ko/en 가이드·수정한 한국어 회귀 테스트·보고서 99개 파일에서 연속 물음표와 U+FFFD가 없음을 확인했다. JavaScript 소스의 정상 nullish coalescing 연산자는 문자열 손상으로 취급하지 않는다. 전체 `git diff --check`도 통과했다. 실제 Atlassian 개인정보 API·TiDB·라이선스 context·Jira visibility 복구 실측은 이전 미검증 목록대로 남으며, 이번에 배포나 설치로 확인하지 않았다.

lint 시작이 오래 대기하여 설치된 Forge CLI를 직접 실행한 lint 결과도 대조했다. 두 실행 모두 위와 동일한 MAJOR_VERSION_RULE 1건으로 종료했다. 승인·scope 변경·CLI 업데이트·배포·설치는 수행하지 않았다. 이번 요청에서 허용한 lint exit 1 예외에 해당한다.
