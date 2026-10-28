# 통합 검증 리포트 (회차 1)

2026-10-11. integration-verifier 독립 점검. requirement·설계·backend/frontend/license 보고서와 실제 변경 코드를 대조했다. integration-verify 및 backend/frontend 규약을 읽고 적용했다. 코드·금지 파일·Git 상태를 수정하지 않았으며 이 보고서만 작성했다. 전체 merge/backend/UI/build와 lint 판단은 리더의 최종 실행 결과가 원천이다.

## 요약

점검 범주 통과 12 / 미해결 코드 결함 0 / 실환경 미검증 5. 검토 중 T4 결함 2건을 리더에게 전달했으며 수정 코드와 회귀 테스트를 다시 확인했다.

## 발견 및 수정 확인

1. `FieldChangeTargetAdapter.certificateExtra`가 USER from/to의 과거 이름을 그대로 반환해 증명서에 closed 표식이 없었다. 리더가 `overlayUserFieldValues`와 주입 가능한 privacy를 적용했다. 증명서·상세·목록·form·충돌 응답이 같은 표식을 쓰며 원본 값은 보존한다. adapter 회귀 테스트 통과.
2. `PersonalDataRepository.purgeSimple`이 `approval_inbox`의 CC까지 삭제했다. `ApprovalRepository.findCcKeys`는 이 행을 원본 참조 명부로 사용하므로 감사 식별자 보존과 충돌했다. 리더가 closed 정리와 `purgeAll`에 모두 `role <> 'CC'`를 적용했다. 보고 source의 actor 수집은 유지되며 보관 export의 ccKeys·감사 계정 이름 대조 시트도 연결돼 있다. repository 회귀 테스트 통과.

## 경계면 대조

Controller의 `{content: result}`는 guardedDefine에서 성공 래핑되고 `invokeApproval`은 success 확인 후 content를 한 번만 벗긴다. 아래 소비 코드는 `.content`를 다시 읽지 않는다.

| resolver | 생성 계약·근거 | 소비·권한·일치 |
|---|---|---|
| listPeriodCloses | PeriodCloseService.js:119, items에 reopenOperation:{operationId,status,phase,counts,complete} | PeriodCloseSettings query 및 item.reopenOperation, admin, 일치 |
| previewPeriodReopen | PeriodReopenService.js:37, {previewToken,periodKey,rev,scope:'SITE',counts:{approvals,certifications,hidden},expiresAt} | PeriodCloseSettings preview→모달, admin, 일치 |
| reopenPeriod INPUT | PeriodCloseService.js:219/316, {periodKey,rev}, 기존 {item} | 기존 새 입력 허용 확인, admin, 일치 |
| reopenPeriod EDIT | PeriodReopenService.js:53/175, {periodKey,rev,mode:'EDIT',reason,previewToken}→{item,operationId,status,phase,counts,complete} | PeriodCloseSettings edit·progress, admin, 일치 |
| continuePeriodReopen | PeriodReopenService.js:123/175, {operationId}→EDIT와 동일 | 목록/응답 미완료 작업 이어하기, admin, 일치 |
| saveApprovalSettings | 기존 flat patch 또는 payload.patch, fieldChangeApplyFallback:'OFF'/'APP' | PolicySettings checkbox→정책 값, 기존 admin, 일치 |
| applyFieldChange | FieldChangeService apply→{requestId,apply:{status,code,current,appliedBy,applyMode,…}} | fieldChangeModel applyNotice(result.apply), SELF+참여자/Jira 관리자+이슈 열람 재확인, 일치 |
| resolveUsers 및 형제 목록 | DirectoryService→items, closedLabel/accountStatus/아바타 없음 | invokeApproval→normalizeUserDisplay, 중첩 사용자와 prefixed 표식 번역, 기존 권한, 일치 |
| getIssueFieldChanges/getFieldChangeForm/상세/목록/증명서 | USER FieldValue의 from/to/current/conflictValue에 closedLabel 보충 | invokeApproval의 display 번역, account id·원본 audit snapshot 유지, 일치 |

## 통과

1. 신규 resolver 2개는 TimesheetController guardedDefine, PermissionMap admin, 기존 Timesheet CONTROLLER_REGISTRARS에 모두 연결됐다. 등록 계약 테스트 통과.
2. T2는 기존 SITE 기간 범위만 지원하고 accountId/subjectId·다른 scope 입력을 거절한다. ADMIN 가드와 principal.accountId로 행위자를 고정한다. 범위는 서버 기간 start/end와 SQL predicate로 결정한다.
3. 미리 보기 rev·기간·건수·만료를 재검증하고 reason trim 1~500자를 요구한다. active_key UNIQUE, 작업 lease/CAS, 원장 pending/cursor 및 결정적 감사 id로 중첩 실행과 중단 복구를 다룬다.
4. APPROVED 요청/결재자 결정은 보존하고 submission drift_kind='REOPENED'와 PERIOD_REOPENED 이벤트로 효력을 해제한다. 승인 refs 재숨김 조회에서 drift를 제외한다.
5. 인증 REOPENED는 관찰 지문이 같아도 CERTIFIED로 자동 복원되지 않는다. 재인증만 certRev를 올리고 원본을 갱신한다. KEEP/ZERO 집계·selfCertifiedCount·lastCertifiedAt과 Workforce 문서에서 해제분을 제외한다. UI에는 재승인/재인증 필요로 표시한다.
6. 진행 중 재마감·재승인·재인증과 기간 잠금을 guard/SQL predicate로 방어한다. visibility는 우리 통제 원장만 해제 예약하며 원래부터 제한된 SKIPPED_RESTRICTED는 유지한다. 예약 완료와 Jira 실제 공개 복구를 UI가 구분한다.
7. T3 기본 OFF. APP은 확정 권한/화면 실패만 대체하며 앱 직전 asUser 현재값을 재조회한다. token fence 및 UNKNOWN 재전송 금지를 유지한다. 승인자 actorKey와 appliedBy=APP/APP_FALLBACK 감사 표현이 분리돼 있다. overrideScreenSecurity는 쓰지 않는다.
8. T1 공통 mount 기본 배너로 issue/worklog/settings 등 기존 전 엔트리를 포함한다. 정식 subscriptionEndDate·평가판 만료 0~7일, 일별 dismiss key, 열린 화면 자정 갱신과 만료 후 기본 제공자 복원 단계가 있다. INACTIVE 차단 경계는 유지된다.
9. T4 보고는 기존 approval-sweep fan-out PERSONAL_DATA이며 새 scheduledTrigger가 없다. 비주기 KVS gate는 SQL 진입 전 반환한다. 보고 수집은 65 source, POST 최대90, 20초 예산·이어하기·응답 pending 선저장·Cycle-Period/Retry-After를 구현한다.
10. closed tombstone이 정리보다 먼저 저장된다. SQL 개인정보 리스 아래 단조 ordinal의 영속 A/B/…/AA 표식을 재사용한다. 비활성화의 Jira 표시명은 유지한다. 기능용 서명/PIN/알림/위임/명부/캐시 등을 정리하고 감사·결재·인증·통제 복구 원장·CC는 유지한다. 새 등록·알림·게시 경로에도 closed 방어가 연결됐다.
11. 감사 Excel 사람 칸은 이름과 id를 함께 넣고 원본 JSON 보관에는 별도 감사 계정 대조 시트를 붙인다. 공개·숨김 열람 범위는 기존 resolver 경로를 재사용한다. queryKey 팩토리, kr/en error 코드 및 REOPENED 관련 번역이 연결됐다.
12. 신규 v061~v063은 현재 v060 다음에 순서대로 있고 readiness·SqlTime 경계를 사용한다. domain에서 Date.now/무인자 new Date 실행 코드를 추가하지 않았다. 비주기 유휴27/38, 개인정보 due일 빈 설치67회 추가, pending 통제 비유휴 상한7을 테스트로 고정했다.

## 미검증

- 개인정보 report:personal-data scope 업그레이드, raw requestAtlassian의 실제 설치 응답·closed/updated·Cycle-Period/Retry-After: 시험 설치 API 응답과 DB/KVS 전후 대조 필요.
- Forge context의 정식 구독 만료일 필드 실제 제공: 정식 라이선스 설치에서 확인 필요. 날짜 부재 시 계산하지 않는다.
- asApp 필드 적용의 Jira 권한/화면 조건: 정책 OFF/APP 시험과 Jira 이력 작성자 확인 필요. overrideScreenSecurity를 사용하지 않아 화면 밖 필드 성공을 보장하지 않는다.
- TiDB 대량 재개방/동시 승인·인증·UNKNOWN visibility와 실제 공개 복구: 실환경 경합·중단 후 이어하기 및 worker 잔여 원장 검증 필요.
- preUninstall 제한 시간과 대량 개인정보 전량 정리: 기존 visibility 복구 우선·남은 예산 정리이며 전량 완료를 보장하지 않는다. 실제 제거 훅 관찰 필요.

## 실행 결과

- 집중 backend: permissionMap 계약, PeriodReopenService, PersonalDataService/Repository, FieldChangeAppFallback, idleSqlBudget — 6 suites / 107 tests 통과(3.254초).
- 집중 UI: PeriodCloseSettings, PolicyFallback, userDisplay, exportRetentionExcel, TrialExpiryBanner, LicenseGuidePage, mount, useLicenseStore — 8 suites / 39 tests 통과(3.873초). exportAuditExcel 파일명 패턴은 실제 별도 suite가 없어서 실행 수에 포함하지 않았다.
- 발견 2건 수정 후 PersonalDataRepository·FieldChangeTargetAdapter 집중 재검증 — 2 suites / 32 tests 통과(1.259초).
- merge·전체 backend/UI·build·lint는 역할 지시에 따라 실행하지 않았다. 모든 agent 완료 뒤 리더가 수행한다. forge 명령과 git add/commit/push는 실행하지 않았다.

검토 시 git diff/status에는 기존 다른 기능과 금지 문서의 미커밋 변경이 함께 있었다. baseline 부재로 이를 이번 T1~T4 변경이라고 귀속하지 않으며 되돌리지 않았다. 경험 Vault INDEX는 읽었으나 workspace 밖 쓰기 권한이 없어 Vault 기록은 추가하지 않았다.
