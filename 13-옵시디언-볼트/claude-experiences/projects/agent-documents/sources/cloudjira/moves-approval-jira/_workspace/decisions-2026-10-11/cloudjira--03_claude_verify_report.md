# 검증 리포트 — decisions-2026-10-11 (Claude 독립 검증, 회차 1)

2026-10-11. 구현은 Codex(gpt-6.1-sol, medium). 코덱스의 `03_verify_report.md` 는 참고만 했고, 수치·"통과" 주장은 코드와 직접 실행으로 다시 확인했다.
범위 확정 방법: 코덱스가 착수 전에 남긴 `baseline.diff`·`baseline-files.json` 으로 기준 트리를 스크래치에 복원(`git archive HEAD` + `git apply baseline.diff`)하고 현재 파일과 비교해 **코덱스가 바꾼 파일만**(수정 106, 신규 21) 골라 검토했다.

## 요약

통과 21 / 실패 8 / 미검증 7

가장 큰 결함: **한국어 번역 24개와 영어 5개가 `?` 로 깨진 채 저장됐다**(F1). 테스트가 키만 보기 때문에 전부 통과했고, 코덱스 검증 리포트도 "번역 연결됨"으로 통과시켰다.
개인정보 정리에서는 **다른 사람의 업무함 행을 영구 삭제**하는 문제(F2)와, 일상적인 `updated` 응답마다 **워크포스 검증 캐시를 지우는** 문제(F4)가 있다.

## 실패

### F1. [높음] 한국어 번역 24개·영어 5개 문자열 손상 (담당: codex-frontend)
- `locales/kr/timesheet.json:22,109,188,203-217`, `locales/kr/audit.json:52,79,114`, `locales/kr/detail.json:35`, `locales/kr/worklogCert.json:55`, `locales/kr/worklogControl.json:304,317`
  예: `"edit": "???? ??"`, `"PERIOD_REOPENED": "????? ?? ??"`, `"appApplied": "? ???? ??"`. 기준 트리에는 이 파일들에 `??` 가 0개였다. 모두 이번에 추가된 T2·T3 문구다.
- `locales/en/audit.json:114`, `locales/en/timesheet.json:22,205,208`, `locales/en/worklogCert.json:55`: 구분자(— 또는 ·)가 `?` 로 바뀌었다(`"Reopened ? Reapproval required"`).
- 영향: 기간 관리의 "수정까지 허용" 버튼·경고·사유 입력란·진행 단계, 재승인·재인증 필요 배지, 감사 "앱 권한으로 적용"·"재개방 해제" 라벨이 한국어 화면에서 전부 `???` 로 보인다. 병합 사전 `locales/ko-KR.json` 에도 24곳이 들어 있다.
- 수정: UTF-8 로 다시 써야 한다. PowerShell `Set-Content` 기본 인코딩이 원인으로 보인다. 재발 방지용으로 `locales/**/*.json` 에 `\?{2,}` 와 ` \? ` 가 없는지 확인하는 테스트를 추가한다.

### F2. [높음] 탈퇴 계정 정리가 다른 사용자의 업무함 행을 영구 삭제 (담당: codex-backend)
- `src/resolver/personalData/PersonalDataRepository.js:87`: `['approval_inbox', 'actor_key', 'requester_key', 'subject_account']` 이라서 `DELETE … WHERE actor_key=? OR requester_key=? OR subject_account=?` 가 된다.
- `approval_inbox` 의 PK 는 `(actor_key, request_id, role)` 이다. 탈퇴자가 **요청자·대상자**인 요청이 결재자 업무함에 있으면 그 행은 결재자의 것이다. 행 생성은 요청 생성 시 `INSERT`(`ApprovalRepository.js:347`) 한 번뿐이고, 이후에는 `updateProjection` 이 `UPDATE` 만 하므로 **복구되지 않는다**.
- 영향: 탈퇴자의 대기 중 타임시트나 요청이 팀장 업무함에서 사라지고(my_turn 포함), 결재자의 "내가 결재한 것" 이력도 사라진다. 요청 자체는 PENDING 으로 남아 만료될 때까지 아무도 처리하지 않을 수 있다.
- 수정: 지우는 대상을 `actor_key = 탈퇴자`(본인 사본)로만 좁힌다. 요청자·대상자 칸은 감사 식별자와 같은 성격이므로 보존한다. `purgeAll` 은 앱 제거 경로라 그대로 둬도 된다. 가이드 `docs/guide/{ko,en}/11-data-security-privacy.md:64` 의 "요청·대상자로 포함된 업무함 기능 사본" 문구도 함께 고친다. 다른 결재자의 행이 남는지 확인하는 회귀 테스트를 추가한다.

### F3. [중간] 재개방 진행 중이면 타임시트 결재 상세 "조회"가 실패 (담당: codex-backend)
- `src/resolver/approval/ApprovalService.js:332`: `viewForTarget`(상세·이슈 화면 공용 조회)이 `assertRequestNotReopening` 을 호출해 `PERIOD_REOPEN_IN_PROGRESS` 를 던진다.
- 영향: EDIT 재개방이 도는 동안 그 기간의 타임시트 결재를 열면 상세 화면 전체가 오류로 바뀐다. 이미 결정된 이력도 마찬가지다. 작업이 중단된 채 남으면(리스 만료 전 실패, 관리자가 "이어하기"를 누르지 않음) 계속 이 상태다. 조회할 때마다 SQL 2회(`findSubmission`·`findCovering`)도 늘어난다.
- 수정: 결정 경로 가드(`:895`)와 제출·재인증 가드는 이미 있다. 조회 경로에서는 가드를 빼거나, 던지지 말고 결정 버튼만 막는 표시 플래그로 바꾼다.

### F4. [중간] 개인정보 `updated` 응답마다 워크포스 검증 캐시 문서를 삭제 (담당: codex-backend)
- `PersonalDataService.js:61` 의 `updated` 처리가 `invalidateUserCache` → `PersonalDataRepository.js:167` `purgeCache` 를 부른다. 이 쿼리는 `DELETE FROM workforce_inbound WHERE (typ='rms.org' AND entity_id=?) OR LOCATE("<accountId>", body_json)>0` 이다.
- `updated` 는 사용자가 프로필을 바꿀 때마다 오는 흔한 응답이다. 서명된 inbound 본문은 계정 id 만 담고 이름·메일 같은 프로필 값은 없다. 그래서 갱신할 내용이 없는데도 **그 계정이 언급된 다른 사람의 조직 문서와 `rms.policy` 검증본까지** 지운다.
- 영향: 팀장 범위(TeamScope), 워크로그 정책 검증본(`WorklogPolicyAuthority`), 게시 관문 `hasAnyVerifiedInbound`(전부 지워지면 NOT_LINKED)가 다시 읽힐 때까지 무너진다. `closed` 에서도 같은 함수가 다른 팀장의 명부 문서를 통째로 지운다.
- 수정: `updated` 는 앱이 실제로 캐시한 프로필 데이터만 무효화한다. inbound 서명 문서는 건드리지 않는다. `closed` 는 `entity_id = 탈퇴자` 인 문서만 지우고, 남의 문서는 다음 정상 갱신에 맡긴다.

### F5. [중간] 개인정보 수집이 JSON 원천을 행 하나당 SQL 1회로 읽음 — 데이터가 있는 설치의 SQL 비용 (담당: codex-backend)
- `PersonalDataRepository.js:105-115`: JSON 원천 9개(`approval_settings_audit.detail`, `timesheet_submission.policy_evidence`, `worklog_control.snapshot_json`, `worklog_certification(_request).snapshot_json`, `approval_export_entry.access_json` 등)를 `ORDER BY key LIMIT 1` 로 한 행씩 읽는다.
- 유휴 테스트(빈 설치 67회)는 통과하지만, 실제 설치에서는 7일 주기마다 이 9개 테이블의 **행 수만큼** SQL 이 나간다. 예를 들어 통제 행·감사 행이 수만 개면 수만 회다. 20초 예산으로 하루에 끝나지 않으면 주기를 넘겨 보고가 계속 밀린다.
- 계정마다 `collect` 에서 KVS get·set 2~3회가 들고, 상태 전체를 저장(`save`)하는 일도 출현 1회마다 반복된다. 65개 원천에서 같은 계정이 반복해 나오므로 KVS 호출도 수만 회 단위다.
- 수정: JSON 원천은 N행(예: 200) 단위로 페이징한다. 컬럼 원천이 이미 같은 계정을 덮는 JSON 원천(예: `worklog_control.snapshot_json` 과 `author_account`)은 뺀다. 상태 저장은 배치 단위로 한다. 데이터가 있는 설치(행 1만)를 가정한 SQL 횟수 상한 테스트도 추가한다.

### F6. [중간·결정 필요] 탈퇴자 하나 때문에 결재 그룹·결재선 전체를 비활성화 (담당: codex-backend, 리더 확인)
- `PersonalDataRepository.js:146`(`approval_group … enabled=0`), `:159`(`approval_flow … enabled=0`).
- 요구는 "팀 명부 등록 등 기능용 정보 삭제"였다. 코덱스는 "결재자가 줄어 더 적은 승인으로 통과하는 것"을 막으려고 그룹·결재선을 통째로 끈다. 그러면 남은 구성원의 결재 라우팅이 조용히 멈춘다. 관리자 가이드(`docs/guide/{ko,en}/09-admin-guide.md:52`)와 개인정보 가이드에 이 동작이 없고, 관리자 알림도 없다.
- 조치: 사용자 결정 사항으로 `QUESTIONS.md` 에 올린다. 유지한다면 가이드에 명시하고 관리자 알림이나 설정 화면 배지를 추가한다.

### F7. [낮음] 서버가 사람이 읽을 문구 `Deleted user A` 를 만듦 + 영문 가이드 표기 불일치 (담당: codex-backend / 문서)
- `src/resolver/personalData/PersonalDataState.js:16`: `displayName: \`Deleted user ${label}\``. CLAUDE.md 의 "서버는 사람이 읽을 문구를 만들지 않는다"에 어긋난다. 프론트 `invokeApproval` 의 `normalizeUserDisplay` 가 `closedLabel` 로 덮어써서 화면 영향은 줄었지만, 프론트를 거치지 않는 경로(로그·알림 vars 등)에는 영문 그대로 남는다.
- `docs/guide/en/09-admin-guide.md:50` 은 `Former user` 라고 쓰는데, 실제 문구(`locales/en/common.json` `common.user.closed`)는 `Deleted user {label}` 이다.
- 수정: 서버는 `displayName: null`(또는 accountId)과 `closedLabel` 만 보낸다. 가이드 표기를 실제 문구에 맞춘다.

### F8. [낮음] 만료 당일 배너 문구 "0일 후 라이선스가 만료됩니다" (담당: codex-frontend)
- `static/ui/src/features/license/TrialExpiryBanner.jsx:52`: `daysLeft === 0` 도 같은 문구다. "오늘 만료" 용 키를 따로 둔다.

## 미검증

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| 개인정보 보고 API 호출 형태(`api.asApp().requestAtlassian(route\`/app/report-accounts\`)`), `Cycle-Period` 단위(일), 200/204/429 응답 | 실제 설치·scope 업그레이드 필요 | `forge install --upgrade` 뒤 시험 계정으로 1주기 실행, KVS `approval:personalData:state`·DB 전후 대조 |
| Forge context 의 정식 구독 `subscriptionEndDate` 제공 여부 | production 라이선스 필요 | 정식 설치에서 `view.getContext().license` 확인 |
| asApp 필드 적용(T3)의 권한·화면 제약 | `overrideScreenSecurity` 미사용 | 정책 APP 로 화면 밖 필드·권한 없는 결재자 시험, Jira 이력 작성자 확인 |
| 새 컬럼 참조 쿼리의 마이그레이션 의존성 | 결재 결정 UPDATE(`ApprovalRepository` approver `NOT EXISTS … reopen_operation_id`), 인증 INSERT·UPDATE(`WorklogCertRepository.js:197,231`), 마감 UPDATE 가 `isColumnReady` 없이 `approval_period_close.reopen_operation_id` 를 참조한다. v063 이 적용되기 전이나 실패하면 **모든 결재 결정·인증 SQL 이 실패**한다 | 배포 직후 첫 resolver 의 `ensureMigratedOnce` 적용을 실측하고, 실패 시 폴백(컬럼 준비 전에는 조건 생략)을 둘지 결정 |
| TiDB 에서 `UNIX_TIMESTAMP(period_start)*1000` 비교, 대량 재개방·경합·이어하기 | 실 DB 필요 | 개발 사이트에서 승인·인증·숨김 각 수십 건으로 EDIT 재개방 → 중간 중단 → 이어하기 |
| preUninstall 52초 안 정리 범위 | 제거 훅 실측 필요 | 시험 사이트에서 제거 훅 로그 관찰 |
| `npx forge lint` | exit 1. 오류·경고 0, `report:personal-data` scope 추가에 따른 MAJOR_VERSION_RULE 승인 항목 1건 | 배포 시 `--approve MAJOR_VERSION_RULE` + `install --upgrade`. scope 추가에 따른 정상 신호이고 코드 결함은 아니다 |

## 통과

### 경계면 표

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| previewPeriodReopen | `PeriodReopenService.js:37-55` → `{previewToken, periodKey, rev, scope:'SITE', counts:{approvals,certifications,hidden}, expiresAt}` | `PeriodCloseSettings.jsx:57-60` `setEditPreview({...result,item})` | 일치 |
| reopenPeriod(mode EDIT) | `PeriodCloseService.js` → `PeriodReopenService.start` → `{...closeService.respond, operationId, status, phase, counts, complete}` | `PeriodCloseSettings.jsx:62-69` `progress.counts/phase/complete/operationId` | 일치 |
| reopenPeriod(INPUT) | 기존 `periodCloseService.reopenPeriod`, mode 기본 'INPUT' | `PeriodCloseSettings.jsx:72` (mode 없이 호출) | 일치(기존 동작 유지) |
| continuePeriodReopen | `PeriodReopenService.continue` | `PeriodCloseSettings.jsx:64`, 목록 `item.reopenOperation.operationId` | 일치 |
| listPeriodCloses | items 에 `reopenOperation: operationView(...)` | `PeriodCloseSettings.jsx` actions 칸 | 일치 |
| saveApprovalSettings(fieldChangeApplyFallback) | `SettingsService` `enumValue(['OFF','APP'])`, 기본 'OFF', KVS 키 맵·기본값 같은 집합(계약 테스트 통과) | `PolicySettings.jsx:70,89,189-199` boolean ↔ 'APP'/'OFF' | 일치 |
| applyFieldChange | `FieldChangeApplier` `resultOf` 의 `applyMode:'APP'`, `appliedBy:'APP'` | `fieldChangeModel`·`ApprovalAuditTab` `item.appliedBy==='APP' \|\| reason==='APP_FALLBACK'` | 일치 |
| 사용자 표시(형제 목록 전반) | `accountStatus:'closed', closedLabel` | `invokeApproval.js` → `normalizeUserDisplay` → `common.user.closed` | 일치(F7 은 문구 생성 위치 문제) |

### 점검표

1. **금지 파일 미수정.** `AGENTS.md`·`CLAUDE.md`·`docs/DESIGN.md`·`docs/APP-MANAGED-WORKLOG-DESIGN.md`·`docs/WORKLOG-IDENTITY-PROPERTIES-DESIGN.md`·`.claude/**` 의 해시와 diff 가 기준선과 같다. 단, 다른 세션의 미추적 파일 3개(`src/domain/worklogControl/journal.js`, `static/ui/src/features/settings/{exportRecordArchive.js, __test__/RecordRetention.test.jsx}`)는 코덱스가 수정했다. 금지 목록에는 없지만 다른 세션의 작업이므로 리더가 알아 둘 필요가 있다.
2. **resolver 3단계.** `previewPeriodReopen`·`continuePeriodReopen` 이 `TimesheetController.js` `guardedDefine`, `PermissionMap.js` `{admin:true}`, 기존 Timesheet registrar 세 곳에 모두 있다. 계약 테스트도 통과했다.
3. **에러 코드.** `PERIOD_REOPEN_PREVIEW_STALE / _REASON_REQUIRED / _IN_PROGRESS` 가 `ErrorCodes.js` 와 kr/en `error.json` 에 있고 손상 없이 정상이다.
4. **마이그레이션.** v061(테이블, 인덱스 인라인) → v062·v063(컬럼) 순서로 v060 바로 다음이다. 기존 이름은 바꾸지 않았다. `LATEST_MIGRATION` 마커가 자동으로 갱신된다.
5. **T2 불변식 2.** `approval_request.status`·`approval_approver` 를 건드리지 않는다. 효력 해제는 `timesheet_submission.drift_kind='REOPENED'` 로 표현하고, 기존 `PERIOD_APPROVED` 잠금 해제(`lock.js:94,198` 의 drift 조건)와 재제출 흐름에 맞물린다.
6. **T2 불변식 4.** 새 UPDATE 전부(`PeriodReopenRepository` claim·lease·save·reopenApproval·reopenCert·lockClose·finishClose, `clearReopenRelease`, `markAppSending`)에 `rev = rev + 1` 이 있다(`approval_group` 은 rev 칼럼이 없는 기존 테이블).
7. **T2 불변식 5.** 결재자 UPDATE 는 `decision_type='PENDING'` 조건을 유지하고 재개방 중 차단 조건만 더했다. 결재자 행 삭제·재삽입은 없다.
8. **T2 불변식 6.** `PERIOD_REOPENED` 이벤트·설정 감사·통제 이력의 id 가 `deterministicEventId(operationId, type, actor, item)` 로 결정적이다. `appendEvent` 는 `ON DUPLICATE KEY` 로 멱등이다.
9. **T2 인증 전이.** `REOPENED` 저장 상태를 새로 추가했다. 관찰은 자동 복귀하지 않고(삭제만 DELETED), 재인증은 RECERTIFY 로 certRev 를 올리고, 집계·자기인증·lastCertifiedAt·워크포스 인증 문서(`certificationDoc.js` 필터, 전부 해제되면 `entry:null` 로 재게시)에서 해제분을 뺀다. 통제 판정 `CERT_LOCKED` 에서도 빠지므로 수정할 수 있다.
10. **T2 범위.** SITE 기간 하나다(기존 재개방 범위와 같다). `accountId/subjectId`·다른 scope 입력은 거부한다. 승인·인증·숨김 후보 모두 기간 start/end 로 제한한다. 원래 제한된 워크로그(`SKIPPED_RESTRICTED`)는 제외한다.
11. **T2 미리 보기·사유·예산.** 미리 보기 rev·건수·10분 만료를 재검증하고, 사유는 NFC·trim 후 1~500자다. 20초 예산·25초 리스·pending/cursor 로 이어하기, `active_key` UNIQUE 로 중복 실행을 막는다. 진행 중에는 마감·재마감·제출·결정·인증 SQL 이 조건으로 막힌다.
12. **T2 워크포스.** 승인 문서는 drift 로 `CHANGED_AFTER_APPROVAL` 이 되어 승인분에서 빠지고(`touchYear`), 인증 문서는 `touchCert` 로 즉시 재게시된다.
13. **T3 기본값.** OFF·'APP' 값 열거형이고 사이트 전용 키다.
14. **T3 대체 조건.** asUser PUT 의 확정 거절(401/403, 화면 판정 400)일 때만, 정책을 다시 읽어 APP 일 때만, 예산이 남았을 때만 대체한다. 앱 PUT 직전에 호출자 asUser 로 현재값을 다시 확인하고 `markAppSending` fence 를 둔다. timeout·5xx·UNKNOWN 은 재전송하지 않는다(재claim 은 WAITING/FAILED 만).
15. **T3 감사.** 이벤트 `actorKey` 는 실제 승인자이고, `reason:'APP_FALLBACK'`·`appliedBy:'APP'` 를 남긴다. asApp 사유는 고정 `field-change-apply-fallback` 이고 `asApp()` 은 사유 없이 호출하면 던진다. 앱 응답 본문은 반환하지 않는다(ok/status 만). AGENTS 문구 초안은 `02_codex_report.md` 에 있다.
16. **T1.** `computeTrialBanner` 가 정식(`subscriptionEndDate`)과 평가판 모두 0~7일일 때 띄우고, `mount` 기본 `trialBanner=true` 로 worklog·issue·modal·projectSettings·inbox·settings 전 엔트리에 나온다. 닫기 키는 만료일+현지 날짜라서 매일 다시 뜨고, 자정에 갱신된다. 안내 화면에 제공자 되돌리기 3단계가 있다. 차단 판정(`licenseDecision`)과 백엔드 가드는 바꾸지 않았다(명시적 INACTIVE 만 차단). 문구는 조건문 형태이고 kr/en 모두 정상이다.
17. **T4 manifest·스케줄.** `report:personal-data: {}` 를 추가했고 새 `scheduledTrigger`·consumer 는 없다. 일일 `approval-sweep` fan-out(`DAILY_JOBS`)에 `personal-data` 를 넣었다.
18. **T4 유휴 SQL.** 주기가 아닌 날은 KVS 1회 확인 후 SQL 0으로 반환한다(`PersonalDataService.run` 첫 줄). `idleSqlBudget` 의 미연동 ≤27·연동 ≤38 을 유지하고, 개인정보 작업 0·보고일 빈 설치 67회를 숫자로 고정했다. 통제 표식 경로는 6→7 이고 근거는 주석에 있다.
19. **T4 감사 보존.** `SIMPLE_PURGES`·group·flow·cache·export 정리 대상에 `approval_request/approver/event/settings_audit`, `worklog_cert(_log)`, `worklog_history`, `worklog_control(_log)` 이 없다. CC 행(`role <> 'CC'`)과 통제 게시 문서(`movesApproval.ctl`)도 보존한다. 테스트("감사·결재·인증·통제 복구 원천에는 DELETE 를 보내지 않는다")가 있다. 단, 업무함 비CC 행은 F2.
20. **T4 표식.** SQL 리스 안에서 KVS 순번 A/B/…/AA 를 예약하고 계정별 KVS 에 영속한다. 한 번 배정되면 같은 계정은 사이트 전체에서 같은 표식이다. accountId 에서 계산하는 순수 함수가 아니라 최초 배정 순서에 따라 정해진다(보고서에도 명시). 비활성 계정은 Jira 이름을 그대로 쓴다.
21. **T4 엑셀·가이드.** 감사·이력·보관·업무함 엑셀 사람 칸이 `이름 (accountId)` 형식이고, 보관 JSON 에는 감사 계정 대조 시트가 붙는다. `preUninstall` 은 통제 해제가 먼저이고 남은 예산으로 정리한다. ko/en 가이드에 "삭제 대신 비활성화, 삭제 전 감사 기록 내려받기, 감사 식별자 보존"이 있다(F6·F7 누락·불일치는 별도).

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand` | 통과 — 149 suites / 2,325 tests (25.0초) |
| `npm run merge` | 통과 — ko-KR.json·en-US.json 생성(손상 문자열 24곳 포함, F1) |
| `npm run test:ui -- --runInBand --watchAll=false` | 통과 — 65 suites / 574 tests (41.1초) |
| `npm run build:ui` | 통과 — exit 0, 기존 의존 패키지 source map 경고만 |
| `npx forge lint` | exit 1 — `0 errors, 0 warnings, 1 approval`: "major version upgrade … Change due to scope modification (MAJOR_VERSION_RULE)" |

코덱스 보고의 테스트 수(2,325 / 574)는 실제와 같다. 테스트 통과가 F1~F5 를 잡지 못한 이유는 다음과 같다. 번역 테스트는 키 존재만 보고, 개인정보 정리 테스트는 SQL 문자열의 감사 테이블 제외만 보며, 유휴 테스트는 빈 설치만 센다.

---

# 2회차 검증 (2026-10-12)

Codex 수정 회차(`02_codex_report.md` "수정 회차" 절)의 보고를 믿지 않고 코드와 직접 실행으로 다시 확인했다.

## 요약

통과 10 / 실패 0 / 미검증 6(1회차와 같은 실환경 항목, 새 컬럼 의존성은 해소)

## 1회차 실패 항목 재검증

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| F1 | 번역 손상 | 통과 | `locales/{kr,en}/*.json` 과 병합 사전 `ko-KR.json`·`en-US.json` 에서 `??`·U+FFFD·` ? ` 가 모두 0이다. 실제 문자열을 표본으로 읽어 문맥이 맞는지 확인했다. 예: `edit` "수정까지 허용", `editCounts` "승인 {approvals}건 · 인증 {certifications}건 · 숨김 {hidden}건", `state REOPENED` "재개방 · 재승인 필요", `appApplied` "앱 권한으로 적용", `PERIOD_REOPENED` "재개방으로 승인 해제", en "Reopened · Reapproval required". 새 테스트 `static/ui/src/utils/__test__/localeIntegrity.test.js` 는 단독 실행해 통과를 확인했다. 검사 로직이 실제로 잡는지는 locale 사본에 1회차 손상값 4종(`???? ??`, `? ???? ??`, `Reopened ? Re…`, U+FFFD)을 넣고 같은 정규식으로 돌려 확인했다. 4종 모두 잡혔고, 정상 문구의 단독 `?`("삭제할까요?")는 오탐하지 않았다 |
| F2 | 업무함 삭제 범위 | 통과 | `PersonalDataRepository.js:89` `['approval_inbox', 'actor_key']` 에 `role <> 'CC'` 보존을 더했다. 요청자·대상자 기준 삭제는 없다. 회귀 테스트(`PersonalDataRepository.test.js:54`)가 다른 결재자 행(leader·other)이 남는지 확인한다. 가이드도 고쳤다 |
| F3 | 재개방 중 상세 조회 | 통과 | `viewForTarget` 에서 가드를 제거했다(`ApprovalService.js:325-335`). 결정 경로 `decideApproval`(`:894`)의 가드는 그대로이고, 거부 테스트(`ApprovalService.test.js:196-201`)도 있다. 제출·재인증 가드도 유지된다 |
| F4 | `updated` 시 워크포스 검증본 | 통과 | `invalidateUserCache` 는 SQL 없이 `{complete:true}` 를 반환한다(서버는 프로필 캐시를 저장하지 않는다). `closed` 의 `purgeCache` 는 `typ='rms.org' AND entity_id=?`(본인 문서)만 지우고 `LOCATE` 는 사라졌다. 테스트 `:138`, `:143` 이 있다 |
| F5 | 수집 SQL 배치화 | 통과 | JSON 원천을 `LIMIT 200` 페이지와 row/offset 커서로 읽는다(`PersonalDataRepository.js:109-123`). "1만 행 = SQL 51회" 상한 테스트(`:160`)가 있다. 유휴 테스트도 그대로다: 비주기일 0, 보고일 빈 설치 67, 하루 미연동 ≤27·연동 ≤38 |
| F6 | 그룹·결재선 비활성화 | 통과 | `enabled=0` 을 제거하고 탈퇴자만 뺀다(그룹은 member_keys CAS, 결재선은 rev CAS로 해당 USER 단계 행만 삭제). 빈 단계나 빈 그룹을 참조하는 결재선에는 KVS `needsReview` 표식을 남긴다. 표식이 없어도 SQL `empty_group` 으로 판정한다. 그런 결재선은 `FlowService.js:261` 이 신규 요청 후보에서 빼고, `FlowSettings.jsx:114` 가 "검토 필요" 배지를 표시한다. ko/en 가이드 09·11 에 반영했다 |
| F7 | 서버 표시 문구 | 통과 | `deletedUserOf` 가 `displayName: null` 과 `closedLabel`·`accountStatus` 만 보낸다. `src` 에 "Deleted user"·"탈퇴한 사용자" 문자열은 0건이다. 프론트 `normalizeUserDisplay` 가 `common.user.closed` 로 렌더한다. 서버 정렬 경로 2곳(`TimesheetService.js:627`, `WorklogCertService.js:250`)은 `displayName ?? accountId` 로 채운 뒤 정렬하므로 null 로 죽지 않는다. 영문 가이드가 `Deleted user A` 로 실제 문구와 맞는다 |
| F8 | 만료 당일 | 통과 | `TrialExpiryBanner.jsx:52` 는 `daysLeft === 0` 이면 `license.banner.expiresToday`("라이선스가 오늘 만료됩니다…" / "Your license expires today…")를 쓴다 |
| 새 컬럼 | v063 미적용 시 | 통과(fail-closed) | 결정(`ApprovalRepository.claimDecision:498`), 인증 INSERT·UPDATE(`WorklogCertRepository.js:195,230`), 마감·재개방(`PeriodCloseRepository.js:144,158`) 모두 `columnReady` 를 먼저 확인한다. 컬럼이 없으면 SQL 을 보내지 않고 `STORAGE_NOT_READY` 를 던진다. 조건을 생략하는 fail-open 은 없다. 컬럼 유무 두 경우를 `ReopenColumnReadiness.test.js` 가 확인한다. 트리거 관찰 경로(`applyObservation`)는 새 컬럼을 참조하지 않아 트리거가 throw 하지 않는다 |
| 금지 파일 | AGENTS.md·CLAUDE.md·.claude | 통과 | 해시가 착수 기준선과 같다. `docs/DESIGN.md`·`docs/APP-MANAGED-*`·`docs/WORKLOG-IDENTITY-*` 는 지시대로 다른 세션 변경으로 보고 판정에서 제외했다 |

## 남은 주의(실패 아님)

- 새 컬럼 의존 경로는 fail-closed 다. 그래서 v063 이 적용되기 전에는 결재 결정과 인증이 `STORAGE_NOT_READY` 로 막힌다. 첫 resolver 의 `ensureMigratedOnce` 가 적용하므로 배포 직후 실측으로 확인한다.
- 탈퇴자를 뺀 뒤 단계가 비지 않은 결재선은 필요한 승인자 수가 줄어든 채 그대로 쓰인다(리더 기본안대로). 정책상 문제가 되면 후속 질문으로 남긴다.

## 미검증(1회차와 같음)

개인정보 보고 API 실제 응답·`Cycle-Period` 단위, 정식 구독 만료일 필드, asApp 필드 적용의 화면 제약, TiDB 대량 재개방·경합, preUninstall 시간 한도, v063 적용 직후 첫 호출 실측.

## 실행 결과 (2회차)

| 명령 | 결과 |
|---|---|
| `npm test -- --runInBand` | 통과 — 151 suites / 2,342 tests |
| `npm run merge` | 통과 — ko-KR.json·en-US.json 생성, 손상 0 |
| `npm run test:ui -- --runInBand --watchAll=false` | 통과 — 67 suites / 577 tests(`localeIntegrity` 단독 실행으로도 통과 확인) |
| `npm run build:ui` | 통과 — exit 0, 기존 source map 경고만 |
| `npx forge lint` | exit 1 — 0 errors / 0 warnings / 1 approval(`report:personal-data` scope 추가에 따른 MAJOR_VERSION_RULE). 코드 결함 아님. 배포 시 `--approve MAJOR_VERSION_RULE` + `install --upgrade` |

## 결론

1회차 실패 F1~F8 과 새 컬럼 의존성 위험이 모두 해소됐다. 남은 실패는 없다. **decisions-2026-10-11 통합 검증 통과.** 남은 것은 실환경 미검증 6건과, 배포 시 scope 업그레이드 승인 절차다.
