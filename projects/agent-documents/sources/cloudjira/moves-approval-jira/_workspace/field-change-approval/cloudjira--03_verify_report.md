# field-change-approval — 검증 리포트 (회차 1)

> 작성: integration-verifier · 2026-10-04 · autopilot 무인 회차(Phase 5)
> 기준: `01_architect_design.md` §2 계약 + `02_backend_report.md` D1~D10 + `02_frontend_report.md` F-D1~F-D9
> 금지 준수: forge 명령·git 조작 없음, 리포 밖 수정 없음.

## 결론: **PASS** (필수 수정 1건을 직접 고치고 재검증 통과)

## 요약  통과 31 / 실패 1(수정 완료) / 미검증 C1~C24(실측 필요 — 04_spike_todo.md)

## 필수 수정 (직접 수정함)

- **[src/resolver/fieldChange/FieldChangeRepository.js `displayFor`]** 업무함·알림 행의 "필드: 이전 → 새" 보강 쿼리만 `approval_request` LIVE JOIN 이 없었다.
  요청 생성은 부속 행을 **먼저** 쓰므로(insertDraft → createForTarget), `ALREADY_OPEN` 등으로 생성이 실패하고 `deleteOrphan`(best-effort)이 실패하면,
  created_at 이 더 새로운 고아 행이 같은 target_key 의 **결재 중 요청 행에 다른 값으로** 붙어 결재자가 엉뚱한 "이전 → 새"를 보고 승인할 수 있었다.
  다른 요약 조회는 전부 LIVE_JOIN 을 쓰는데 이 하나만 빠짐.
  → `${LIVE_JOIN} AND fc.issue_id IN (...)` 로 바꿈(컬럼 `fc.` 접두). 회귀 테스트 `displayFor 도 LIVE 요청만 본다` 추가(`__test__/FieldChangeRepositories.test.js`).
  재검증: 백엔드 89 / 1278 통과.

## 권고 (이번 회차 필수 아님 — 담당 backend 다음 회차)

- **R1** `displayFor` 는 설계대로 "target_key 별 **최신** 요청"을 돌려준다. 그래서 같은 필드에 새 요청이 생긴 뒤 업무함 **완료/상신** 탭의 과거 요청 행에는
  새 요청의 이전 → 새 값이 붙는다(결재 중 탭은 dedupe 로 항상 최신이라 정확). 알림 패널은 fieldName 만 써 영향 없음.
  고치려면 어댑터 `filterVisible` 이 requestId 도 받아 `field_change_request.request_id` 로 조회해야 한다(엔진 인터페이스 변경 → 설계 범위).
- **R2 (프론트 "백엔드 요청" 판정)** `exportExpiredApprovals.fieldChange` 에 `fieldName`·`fromDisplay`·`toDisplay` 추가 — **권고**로 판정.
  근거: 설계 §2.2 계약(`{fieldId, fromValue, toValue, applyStatus, appliedAt}`)과 백엔드 응답·프론트 소비가 정확히 일치하고, 화면이 깨지지 않는다(F-D9 로 "제목 · fieldId: from → to" 표기).
  다만 보관 정리 후에는 내보낸 파일이 유일한 기록이고 부속 행(`field_name`·`*_display`)도 함께 지워지므로, accountId·옵션 id 만으로는 사람이 읽을 수 없다 — 다음 회차 우선순위 높음.
  DB 에 컬럼이 이미 있어 `findByRequestIds` SELECT 3칼럼 + 엑셀 표기만 바꾸면 된다(마이그레이션 없음).
- **R3** C24(우회 행위자가 앱·자동화 계정일 때 이름 표시)는 실측 항목이지 계약 차이가 아니다 — 미검증 유지.
- **R4** `supersedeOlder` 는 `apply_status IN (WAITING, FAILED)` 만 보므로, 이미 REJECTED·EXPIRED 로 끝난 이전 요청(부속 행 WAITING)도 SUPERSEDED 로 바뀐다.
  화면 상태는 `fieldChangeState` 가 status 를 먼저 보므로 영향 없지만, 증명서·보관 내보내기의 `applyStatus` 가 "대체됨"으로 찍힌다. `JOIN approval_request r ... r.status='APPROVED'` 로 좁히는 것을 권장.
- **R5** 다시 적용 자격(D6/Q99)의 `isParticipant` 는 결재선 `approverKeys` 에 accountId 가 **직접** 있을 때만 참이다. 결재선이 `group:`·`agroup:` 키로 확장되지 않은 채 저장되는 경우(그룹 결재자)가 있으면 그 구성원은 버튼이 안 보이고 서버도 거부한다. `expandRequestedSteps` 결과가 항상 개인 accountId 인지 확인 필요(테스트 1건 추가 권장).
- **R6** 백엔드 보고 "발견" 제안대로 `TargetRegistry` 머리 주석에 "어댑터 그래프는 NotificationService·InboxService 를 import 하지 않는다"를 적어 둘 것(`moduleCycle.test.js` 는 FIELD_CHANGE 기준만 지킨다).

## 미검증 (실측 필요 — 기존 `04_spike_todo.md` C1~C24 그대로, 새 항목 없음)

- 특히 배포 최우선: C1·C2·C3(트리거 페이로드 `changelog.id`·`items[].fieldId`·`issue.fields.project/issuetype`), C5(PUT 실패 코드), C16(이슈 GET `fields=` 에 타 프로젝트 필드 id 혼입 시 400), C17(요약 조회 상관 서브쿼리 TiDB 허용).
- 화면 연결: C21(결정 안내 → 닫기 → 이슈 엔트리 갱신)은 `modal.jsx` 가 import 시 mount 해 렌더 테스트가 없다 — `decisionNotice` 단위 테스트만 있음.

## 통과

### 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자 | 소비자(invokeApproval 이 content 를 벗긴 값) | 일치 |
|---|---|---|---|
| getIssueFieldChanges | `FieldChangeService.js:174` `{issue,enabled,notEnabledReason,fields[],bypass[],history[]}` | `FieldChangeSection` (`fieldChangeApi.js:8`) | O (D1 NO_RULE 시 bypass·history 채움 ↔ F-D6) |
| getFieldChangeForm | `:295` `{issue,field,current,options,optionsSource,rule,flow,pendingApprovedRequestId}` | `FieldChangeRequestForm` | O (D2 options:null ↔ 요청 차단) |
| searchFieldChangeUsers | `:371` `{users:[{accountId,displayName,avatarUrl}]}` | `FieldChangeValueInput` (2자 미만 미호출 ↔ D7) | O |
| createFieldChangeApproval | `:435` `{requestId,status,currentStepOrder,fieldId,state}` — steps·flowId 무시 | 폼 payload `{issueId,fieldId,value:string\|null,requestMessage,expiresAt?,ccKeys?}` | O |
| applyFieldChange | `:526` `{requestId, apply:FieldApplyResult}` | `useApplyFieldChange` → `applyNotice(apply)` | O |
| list/save/deleteFieldChangeRule | `:588`/`:629`/`:689` | `FieldChangeRuleSettings`·`FieldChangeRuleFormModal` (rev 전달, `error.cause.reason`) | O |
| decideApproval | `ApprovalService` — afterDecide 훅 있는 종류만 `apply` 키 | `modal.jsx:110` `decisionNotice` → `Object.hasOwn(result,'apply')` | O (D3 null ↔ `fieldChange.decision.unknown`) |
| bulkApprove | `results[].applyStatus?`(apply 있을 때만) | `BulkApproveBar` → `bulkApplySummary` | O (F-D5 FAILED·CONFLICT 별도 집계) |
| getApprovalDetail | `FieldChangeTargetAdapter.describe` → `target.fieldChange` 블록(§2.7 키 전부) | `ApprovalDetail` → `FieldChangeTargetHeader` | O |
| getApprovalCertificate | `CertificateService:84` `[certificateKey='fieldChange']` 최상위, `target.fieldChange` null(D4) | `CertificateSheet.jsx:118` `data.fieldChange` | O |
| listInbox / listNotifications | `InboxService` / `NotificationService.toItem` `fieldChange` (FIELD_CHANGE 행만) | `InboxTable:111` / `NotificationPanel:28` | O |
| exportExpiredApprovals | `RetentionService` `fieldChange:{fieldId,fromValue,toValue,applyStatus,appliedAt}` | `exportRetentionExcel.js:64` | O (R2) |

### 점검표
- [x] resolver 3단계: `FieldChangeController`(guardedDefine 8) + `PermissionMap.js:153-163` + `index.js:18,58`. 프론트 fn 이름 8개 일치. 계약 테스트 통과
- [x] 권한 축: issue:view 4 / SELF+assertTargetVisible+참여자 1(D6) / project:admin 3. 규칙 UPDATE·DELETE 는 `WHERE project_id=?`
- [x] 형제 범위: 이슈 화면 `canApply` 와 `applyFieldChange` 가 같은 `isParticipant`+Jira 관리자, 상세·이력·증명서는 엔진 SELF+대상 열람, 업무함·알림은 어댑터 `filterVisible`(permissions/check 일괄, fail-close)
- [x] 응답 `error.code` 분기: `FIELD_CHANGE_CONFLICT`(modal 재조회)·`FIELD_CHANGE_APPLY_IN_PROGRESS`(2초 재조회)·STALE_CODES·`cause.reason`. `ApprovalError.cause` 전달 확인
- [x] 불변식 1: `FIELD_CHANGE:{issueId}:{fieldId}` scopeKey, FIELD_ID 정규식이 숫자만 값을 거부해 TRANSITION 키와 역파싱 혼동 없음. ISSUE·TRANSITION·FIELD_CHANGE 동시 열림 테스트(`FieldChangeIsolation`)
- [x] 불변식 2: 적용은 결정 뒤 afterDecide, 실패해도 결정 응답 유지
- [x] 불변식 3: `src/domain/fieldChange` 에 Date.now·new Date()·fetch·SQL 없음
- [x] 불변식 4: claim·finish·markSuperseded·supersedeOlder·rule update 모두 `rev = rev + 1`. finish 는 `apply_token` fencing
- [x] 불변식 5: 엔진 결재자 UPDATE 무변경
- [x] 불변식 6: FIELD_APPLIED·APPLY_CONFLICT·APPLY_FAILED:{attempts}·만료·우회(bypassIdOf sha256) 결정적 id
- [x] 불변식 8: fieldChange 경로 asApp 0건. `IssueFieldReader` asUser 전용, 트리거는 Jira 0콜. AGENTS.md 의 diff 는 worklog-history 분(이번 기능 무관)
- [x] 불변식 9·10: 엔티티 프로퍼티·validator 미사용
- [x] 마이그레이션 v033~v035 순번·이름 정상(v031·v032 뒤), 모든 신규 테이블 참조 전 `isTableReady`/`ready()`
- [x] whereIn 빈 배열 가드: findByFieldIds·findLatestPerField·displayFor·findByRequestIds·Retention 호출부 모두 길이 0 조기 반환
- [x] 쿼리키 `fieldChangeKeys` 팩토리(`approvalKeys.js`), 하드코딩 키 없음
- [x] i18n: kr/en 전 네임스페이스 키 집합 차이 0(스크립트 대조), `FIELD_CHANGE_*` 에러 코드 12 = ErrorCodes 12 = error.json kr/en 12
- [x] 엔트리 3곳(craco ENTRIES·public html·manifest resources) 무변경. manifest diff 는 주석·타 기능분, app id 는 placeholder 그대로
- [x] 순환 import: `moduleCycle.test.js` 통과(D9)

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 (ko-KR.json·en-US.json 생성) |
| `npm test -- --runInBand` (수정 전) | 89 스위트 / 1277 테스트 통과 |
| `npm test -- --runInBand` (수정 후) | **89 스위트 / 1278 테스트 통과** |
| `npm run test:ui -- --runInBand` | **42 스위트 / 340 테스트 통과** |
| `npm run build:ui` | 성공 ("Compiled with warnings" — node_modules source map·postcss-calc, 우리 코드 경고 없음) |
| `forge lint` | 실행 안 함(지시) |

## 새 질문

없음(R1~R5 는 기술 결정이라 QUESTIONS.md 에 올리지 않음).
