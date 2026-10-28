# 전체 검수 후속 개선 설계

기준: 2026-10-08 현재 코드. 기존 미배포/배포 여부를 가정하지 않고 v001~v045 마이그레이션 이름은 보존한다. 승인 상태 머신과 scopeKey는 유지한다. 적용 상태·보관 허가·조회 범위를 강화한다.

## 열린 질문과 구현 가정

- 앱 관리자라도 Jira 이슈를 볼 수 없으면 승인 원문을 내보내거나 그 내보내기를 근거로 삭제하지 못한다. TIMESHEET는 현재 TimesheetAccess를 통과해야 한다. 가장 보수적인 기존 상세 열람 계약을 사용한다.
- 스윕의 영구 장애 한 페이지가 후속 처리를 막는 문제는 남을 수 있다. 이번에는 24회 실패 후 버리는 동작을 제거하여 누락을 먼저 막는다. 독립적인 영속 재처리 큐는 별도 기능이다.
- 필드 PUT의 조회와 쓰기 사이를 Jira가 원자적으로 묶는다는 가정을 하지 않는다. UNKNOWN 자동 재전송을 막고 남은 경쟁 한계를 명시한다.
- 삭제 시점까지 모든 부속 테이블 변경과 원자적 fencing을 하려면 각 생산자의 SQL 경계를 함께 바꿔야 한다. 이번 완료 기준은 서버가 내보낸 ID 및 읽은 자료의 fingerprint로 허가를 제한하고, 삭제 직전 현재 자료와 적용 보호 조건을 재검사하는 것이다. 이 검사가 모든 외부/부속 변경 경쟁을 완전히 제거한다고 표시하지 않는다.

## 1. 개요·영향 범위

현재 확인한 결함: RetentionService.confirmExport는 클라이언트 cutoff/count를 저장하고 purgeExpiredBatch는 조건을 만족하는 전체 요청을 다시 조회한다. PIN은 read-modify-write 및 무조건 upsert/delete다. FieldChangeApplier는 stale APPLYING을 reclaim하고 PUT timeout/5xx를 FAILED로 돌린다. TimesheetDriftService/WorklogHistoryRecorder는 24회 실패 페이지를 건너뛰고 watermark를 전진한다. 알림 후보는 100행 한 번이며 이미 발송/비활성 정책 행이 다음 후보를 막는다. 업무함·미읽음 건수는 현재 가시성 필터가 없다. FIELD_CHANGE는 보관 적용 보호 대상이 아니다. 필드 내보내기 및 타임시트 연동 metadata가 빠진다.

영향: retention, signature, fieldChange, approval/ExpiryService, timesheet drift, worklog history sweep, inbox, notification, SQL schema/readiness, 설정 Excel helper, 필드 적용 UI/i18n. manifest·scope·새 엔트리·Workforce 게시 계약 변경 없음.

## 2. 경계면 계약

기존 resolver 이름과 PermissionMap/guardedDefine/CONTROLLER_REGISTRARS 등록은 유지한다. 아래 success shape는 공통 ResponseWrapper 내부 자료다.

| 기존 resolver 동작 | 권한 축 | 입력 | success 자료 | 오류·경계 | 소비 |
|---|---|---|---|---|---|
| 보관 상태 조회 | admin | 기존 | 기존 필드 + lastExport.sessionId, purgeableCount는 허가 집합에만 | 예전 cutoff 기록은 표시만 가능하고 삭제 허가로 사용 금지 | 설정 |
| 만료 승인 내보내기 | admin+현재 대상 열람 | 첫 페이지 기존 cutoff, 다음부터 sessionId+서버 cursor | 기존 cutoff/requests/approvers/events/nextCursor + sessionId | 소유자 불일치·만료·건너뛴 cursor·판정 실패는 거부 또는 해당 행 제외. 제외된 행은 허가 집합에도 없음 | exportRetentionExcel |
| 내보내기 완료 | admin+세션 소유자 | sessionId; 기존 count/cutoff는 권한 근거 아님 | 기존 상태 | 서버 완주 확인 전 RETENTION_EXPORT_REQUIRED/INVALID_TARGET. count는 서버 집계 | 파일 다운로드 성공 뒤 |
| 내보낸 요청 삭제 | admin+현재 대상 열람 | 기존 | deleted, remaining; 변경·권한 상실 행은 삭제하지 않음 | 정책 무기한/완료 세션 없음은 RETENTION_EXPORT_REQUIRED | 설정 |
| PIN 등록·변경·삭제·검증 | SELF | 기존 | 기존 | 동시 상태/세대 변경은 PIN_INVALID 등 기존 코드로 실패. 새 PIN 세대에 이전 검증 결과 적용 금지 | PIN UI |
| 필드 변경 적용/재시도 | 기존 대상 권한 | 기존 | 기존 applyResult.status에 UNKNOWN 추가, code는 결과 불명확 코드 | UNKNOWN 또는 stale APPLYING은 재PUT 금지. 확정적 거부 FAILED만 재시도 | FieldApplyStatus |
| 업무함 건수 | SELF | 기존 tab/filters | statusCounts/myTurnCount 유지, 예산 제한이면 정확성 메타데이터 추가 | 목록과 동일 현재 가시성. 완전 집계가 불가하면 추정값으로 숨겨 전달하지 않음 | badges |
| 미읽음 집계 | SELF | 기존 | 기존 count + 필요 시 정확성 메타데이터 | 현재 대상 가시성 적용, SQL 원시 COUNT 그대로 반환 금지 | notification badge |

세션 전달 계약 변경은 프론트가 함께 반영한다. 내보내기 중 빈 가시 페이지에도 원본 cursor가 있으면 계속 받아야 한다. 파일 실패/중간 페이지 실패 시 confirm 하지 않는다.

## 3. 도메인

- `fingerprintExportRecord({request,approvers,events})`: 부속 스냅샷을 포함한 canonical JSON SHA-256. 배열 순서와 객체 키 순서를 안정화한다. 진짜 내용이 달라지면 삭제 허가 불일치로 판정한다. DB에서 시각/정책을 읽지 않는다.
- 필드 `outcomeOf(plan, put)`: 명확한 2xx 성공=APPLIED, 전송하지 않은 읽기 실패/확정적 4xx=FAILED, timeout/네트워크/5xx 및 전송 가능성이 있는 예외=UNKNOWN. UNKNOWN은 자동 WRITE 계획에 진입하지 않는다.
- 기존 cutoffFor(now)는 그대로 now 주입.
- 테스트: 세션 건너뛰기·위조 count·소유자·새로 eligible된 ID·부속 metadata 변경·현재 정책 확대·숨긴 행; PIN 5회 병렬 실패/잠금 중 성공/세대 교체 뒤 과거 성공·실패/초기등록 경합/변경과 삭제 경합; PUT timeout 후 from으로 돌아온 값에서도 재PUT 0회; 25회 실패 후 cursor/watermark 보존; 첫100건 sent/disabled 뒤101번째 알림; counts hidden/mixed/empty; 미적용 FIELD_CHANGE 보관 제외.

## 4. 백엔드

### 보관 허가와 자료

세션 생성 시 서버 sessionId, owner, cutoff, TTL, 진행 cursor, COMPLETE/CONFIRMED 상태 및 rev를 관리한다. 페이지를 반환하기 전에 실제 반환 ID별 fingerprint와 rev/updatedAt를 서버에 저장한다. 다음 페이지는 서버가 저장한 진행 cursor만 허용한다. 중간 SQL/부속 조회 실패는 완료로 전환하지 않는다. replay는 동일 페이지 자료를 반환하거나 명확히 실패하며 ID 집합에 다른 자료를 덮어쓰지 않는다.

일괄 이슈 가시성은 filterVisibleRows를 재사용하되 TIMESHEET는 이 함수의 형식 검사 결과를 권한으로 사용하면 안 된다. 각 TIMESHEET의 approval state를 load하고 adapter.canView(target, principal, {state})를 확인한다. 다른 미등록 종류/검사 실패는 fail-close. 부속자료는 가시 행만 조회한다. 워크로그 제한 공개 설명은 기존 상세의 작성자 제한 계약을 함께 적용해야 한다. 가리는 자료가 저장된 원문과 다르면 그 원문 삭제 허가는 부여하지 않는다.

purge는 CONFIRMED 세션의 ID만 다루며 현 정책 cutoff와 교집합을 사용한다. 현재 가시성과 완전한 부속자료 fingerprint를 재검사하고 현재 적용 보호 조건으로 다시 좁힌다. 변한 요청은 새 export가 필요하다. 허가가 없는 다른 요청은 부모 updated_at이 오래됐어도 삭제 불가. 자식부터 삭제하는 기존 재개 계약을 보존하되 중간 실패 후 성공으로 허가를 소비하지 않는다. 세션 소유자 전용으로 제한한다.

전용 export 조회를 사용하여 FIELD_CHANGE의 fieldType/fromDisplay/toDisplay/applyAttempts/applyCode/appliedBy/conflictValue/conflictDisplay/rev, TIMESHEET의 snapshotFormat/routingSource/link/policyEvidence/drift/rev 및 기타 부속 행의 적용·취소 metadata를 빠짐없이 보존한다. 일반 상세/목록 findByRequestIds 소비자에 불필요한 shape 변경을 퍼뜨리지 않는다. timesheet_worklog_ref는 스냅샷의 재구성 자료가 모두 있는지 확인 후 필요하면 별도 포함한다.

### PIN 동시성

approval_pin에 rev를 추가한다. 새 PIN salt를 세대 식별자로 사용하고 모든 확인 결과 SQL에 account_id+salt+rev 및 현재 unlocked 조건을 건다. 실패는 SQL에서 `fail_count = fail_count + 1`/임계값 잠금 계산을 수행하거나 bounded CAS 재읽기 루프로 최신 세대의 실패를 정확히 누적한다. 성공도 항상 조건부 초기화/CAS를 수행하여 concurrent 잠금과 PIN 교체 후 오래된 검증을 차단한다. CAS 실패 시 이전 matches 결과로 성공시키지 않는다.

첫 등록은 INSERT IGNORE 결과1만 성공. 기존 PIN 변경은 검증한 동일 세대+검증 후 rev 조건 UPDATE; delete도 동일 조건 DELETE. unconditional upsert/delete 제거. zero affected는 최신 record를 다시 읽고 기존 오류코드로 실패한다. 무한 CAS loop 금지. SQL SET에는 rev=rev+1. 사용자 원문/해시 로그 금지.

### 필드 적용과 보관

UNKNOWN 상태 추가 및 enum/조회/i18n에 반영한다. 전송 직전 UNKNOWN(또는 전송단계)을 token fencing으로 영속 표시하면 PUT 후 프로세스 종료도 재전송되지 않는다. 정확한 재시도 가능 FAILED는 전송 이전 읽기 실패/확정 거부에 한정한다. stale APPLYING을 새 PUT claim으로 가져오지 않는다. 성공 상태 저장 실패도 UNKNOWN 경로로 남는다. UNKNOWN 확인은 현재값이 to여도 과거 적용의 확정 증거가 아니라는 한계를 유지하며 자동 재POST/PUT을 하지 않는다.

보관 EXPIRED_WHERE에 FIELD_CHANGE APPLYING/UNKNOWN, APPROVED의 WAITING/FAILED를 제외한다. 새 ENUM이면 기존 생성DDL 대신 ALTER migration을 뒤에 추가한다.

### 스윕·알림·집계

두 worklog sweep의 MAX_PAGE_FAIL_STREAK skip 분기를 제거한다. 실패 페이지 이후 since로 이동하지 않고 PARTIAL/cursor를 보존, watermark null로 release한다. 24회 이후도 진단 실패 수를 남길 수 있으나 삭제/건너뛰기의 조건은 아니다. 핫패스 trigger throw 금지는 유지한다.

dueSoon은 (expires_at,request_id), reminders는 (current_step_opened_at,request_id) keyset. ApprovalRepository 기존 메서드에 optional cursor를 추가한다. 조회 candidate 원본 마지막 행으로 cursor를 전진한다. sent/비활성 정책을 제거한 배열 길이로 완주 판단하지 않는다. 공통 잔여시간·최대페이지/SQL 호출 예산 안에서 처리하며 예산 소진 cursor는 approval_job_state에 job별 저장. 완주하면 cursor 초기화, 미완주면 다음 실행이 이어받고 REST_MS를 짧게 조정한다. insert 실패 페이지는 cursor 이동하지 않는다. summary는 건수를 누적한다. 만료 findDue도 실패 첫배치 seen 때문에 뒤가 가려지므로 동일 keyset 원칙을 적용한다.

업무함/미읽음 count는 raw SQL COUNT가 아니라 participation/recipient 범위의 최소 target 행을 keyset으로 스캔하고 같은 가시성 필터를 일괄 적용한다. 전체 행 상세 refresh/N+1는 하지 않는다. 예산을 사용하면 truncated/정확성 메타데이터를 응답하고 UI가 정확한 총건수로 표시하지 않게 한다. hidden 행 수는 따로 내보내지 않는다.

## 5. 스키마·마이그레이션

v046 이후에만 추가. PIN rev, FIELD_CHANGE UNKNOWN enum/전송단계는 실제 DDL에 필요한 ALTER만 생성. 서버 허가를 SQL로 구현하면 session(session_id UUID, owner, cutoff, expires_at, status, cursor, count, rev)와 entry(session_id,request_id, fingerprint, req_rev, exported_updated_at, 처리상태)의 두 테이블을 추가한다. UNIQUE(session_id,request_id), 세션 expiry/owner 인덱스. KVS 구현을 선택하면 큰 ID배열 한 value 대신 페이지별 bounded immutable records 및 소유자·완주를 검증하는 서버 chain을 사용하고 세션 진행 경쟁이 허가집합을 확장하지 않는 증거를 테스트로 남긴다.

신규 테이블/컬럼은 isTableReady/isColumnReady. 미준비는 STORAGE_NOT_READY이며 빈 내보내기 완료로 답하지 않는다. 새 테이블은 TableReadiness priming에도 등록한다. 기존 마이그레이션 이름/숫자 바꾸지 않는다.

## 6. Jira 연결

현재 asUser permissions/check 일괄 및 TimesheetAccess를 사용한다. 신규 asApp/offline impersonation/scope 없음. 트리거·스윕 워크로그 조회는 AGENTS의 기존 허용 사유만 유지한다. 외부 PUT 원자성/타임아웃 결과 판정은 플랫폼 미검증 한계로 남긴다.

## 7. 프론트

기존 설정 export helper가 sessionId와 원본 cursor를 반복 전달하고 최종 파일 성공 뒤 sessionId만 confirm한다. 상세JSON chunk 계약 유지. 필드 UNKNOWN은 결과 확인 필요 상태로 표시하고 재시도 버튼을 숨긴다. count가 incomplete이면 정확한 숫자로 오인하지 않는 표시를 적용한다. 엔트리/쿼리키 추가 불필요; 기존 factories 유지.

## 8. i18n

kr/en의 기존 필드 applyStatus 네임스페이스에 UNKNOWN, 결과 불명확 안내 추가. 필요 시 집계 incomplete 문구 추가. 기술 token/sessionId/DB 내용은 제품 UI에 표시하지 않는다.

## 9. 용량·호출량

200명×월12건=최소 연2,400 TIMESHEET 요청. 상세 event/approver는 결재단계 수에 비례한다. 보관 session entry는 요청당 ID16+hash32+metadata 수십 bytes이며 연2,400건 약 수백KB, 대량 worklog별 승인 시 선형 증가. TTL 지난 미완료 세션과 소비한 entries는 bounded cleanup한다. 200행 export 페이지 이슈 visibility는 일괄 permissions/check를 기본으로 한다. TIMESHEET state load/팀 검사에서 N+1이 남으면 배치 state loader 도입을 검토하되 조회1회 예산과 tableReady 실패 처리를 보장한다. counts는 200행 window당 일괄 권한 조회, 전체 participation 행 수에 비례하며 필요 시 incomplete 계약 사용.

## 10. 미검증

| 항목 | 영향 | 검증 |
|---|---|---|
| 실제 Forge SQL enum ALTER/UUID batch/CAS affectedRows | 미준비·경합·허가 저장 | lint 및 계약 테스트 후 개발 사이트 실측 |
| 삭제 직전 child 변경 경쟁 | fingerprint 조회 뒤 변경 완전 봉쇄 아님 | 생산자 claim과 purge 동시 실험; 완전 fencing 별도 설계 |
| Jira field read-PUT 원자성 없음 | 외부 사용자 변경 overwrite 가능 | timeout 및 직접 변경 사이 실행으로 재PUT 금지 확인 |
| 스윕 영구 poison page | 누락은 막지만 후속 sweep 정체 가능 | cursor·watermark·실패횟수 진단, 향후 durable retry 큐 |
| 대량 대상 가시성 호출 지연 | count/export 예산 | 개발 환경 대상수별 호출수·시간 확인 |

## 11. 작업 분해

1. PIN 세대/CAS/병렬 실패 회귀 테스트 → 독립 커밋.
2. 내보내기 서버 허가·권한·완전 metadata·미적용 보관보호 + Excel session 전달 → 독립 커밋.
3. 필드 UNKNOWN/fencing/UI/회귀 → 독립 커밋.
4. 스윕 cursor 누락방지·알림 keyset예산·가시성 집계 및 UI → 독립 커밋.
5. backend/front 역할 모두 완료 뒤 전체 backend/UI tests, UI build, Forge lint. root만 검증된 경로를 staging하고 한국어 사유 중심 commit, push/deploy 안 함.

## 변경 이력

- 2026-10-08: 현재 코드로 잔존9건 확인, 후속 개선 계약 및 경쟁 한계 명시.
