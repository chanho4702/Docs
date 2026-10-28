# 백엔드 구현 보고

2026-10-06. transition 자동 적용과 독립 worklog certification을 구현했다. frontend, build, forge, 배포, commit은 실행하지 않았다. 기존 WORKLOG_CREATE 사전승인은 수동 apply 호환 모드로 유지하며 자동 워크로그 생성은 추가하지 않았다.

## 실제 API 계약

모든 controller 성공 응답은 기존 `{success:true, content:...}` envelope를 사용한다.

### Transition

- `retryTransitionApply`: SELF, 입력 `{requestId}`. 공통 engine 대상 열람 검증 후 요청자 또는 Jira 관리자만 허용한다. 실제 Jira 실행 주체는 관리자 여부와 관계없이 원 요청자다.
- `reconcileTransitionApply`: SELF, 입력 `{requestId}`. 같은 권한 검사를 사용한다. cursor 입력은 구현하지 않았다.
- 두 API의 content는 **중첩 apply 객체가 아닌 flat 응답**이다: `{requestId,mode,status,code,attempts,claimedAt,postStartedAt,appliedAt,appliedBy,evidenceChangelogId,canRetry,canReconcile,manualReviewRequired,already?}`. reconcile은 `complete,scanned`도 반환한다.
- 기존 issue transition 목록 요약과 승인 detail의 `target.transition.apply`, 증명서 transition 부가 블록에는 위 필드 중 requestId/추가 실행 필드를 제외한 apply view가 들어간다.
- mode는 `LEGACY_MANUAL|AUTO`, status는 `WAITING|APPLYING|APPLIED|FAILED|UNKNOWN|BLOCKED`다. legacy의 WAITING은 자동 실행 대기라는 의미가 아니므로 UI에서 mode를 먼저 해석해야 한다.
- code: `POST_204`, `PROJECT_DISABLED`, `RULE_CHANGED`, `REQUESTER_NO_PERMISSION`, `REQUESTER_IMPERSONATION_UNAVAILABLE`, `STATE_CHANGED`, `TARGET_REACHED_WITHOUT_PROOF`, `TRANSITION_NOT_AVAILABLE`, `SCREEN_FIELDS_REQUIRED`, `JIRA_REJECTED`, `AMBIGUOUS_POST_RESULT`, `AMBIGUOUS_CHANGELOG`, `RECONCILED_APPROVED_TRANSITION`, `BUDGET_DEFERRED`.

### Worklog certification

- `getWorklogCertification`: issue view + appAccess:false, 입력 `{issueId,worklogId}`. 현재 Jira 원본을 **조회자 asUser GET**으로 읽은 뒤 fingerprint를 갱신한다. content `{certification,canRequest,availableFlows:[{id,label}]}`.
- `createWorklogCertification`: 같은 guard, 입력 `{issueId,worklogId,flowId,requestMessage?}`. Jira 작성자와 principal이 같아야 한다. server의 해당 프로젝트 available Flow를 다시 로드하고 group 확장한 steps를 공통 engine에 전달한다. content `{requestId,status,certification,currentSnapshotMatched}`. false는 요청 생성 도중 원본 fingerprint가 바뀌어 현재 ledger를 PENDING으로 연결하지 못한 경우다. 그 요청은 변경 검사에서 승인할 수 없다.
- certification shape: `{worklogId,issueId,projectId,authorId,fingerprint,snapshot,state,requestId,verifiedFingerprint,verifiedAt,deletedAt,sourceUpdatedAt,rev}`.
- snapshot: `{worklogId,issueId,authorId,started,seconds,sourceUpdatedAt,fingerprint}`. started/sourceUpdatedAt은 epoch ms다. 설명과 visibility는 fingerprint에 포함하되 원문은 snapshot/ledger에 복제하지 않는다.
- state는 `UNVERIFIED|PENDING|VERIFIED|REJECTED|CHANGED_AFTER_VERIFICATION`이다. 승인 요청/결정 자체는 공통 engine의 `WORKLOG_CERTIFICATION` target으로 처리한다. scope는 `WORKLOG_CERTIFICATION:<issueId>:<worklogId>`로 timesheet와 WORKLOG_CREATE에 독립적이다.
- 최종 APPROVED이면 현재 원본을 다시 관찰한 뒤 owner + latest request + immutable fingerprint 조건으로 VERIFIED 처리한다. REJECTED는 REJECTED가 된다. 결정 직전 Jira 읽기 실패는 fail-closed다. 원본 변경은 CONTENT_CHANGED로 만료한다.
- VERIFIED 이후 내용/설명/visibility 변경 또는 삭제 관찰은 CHANGED_AFTER_VERIFICATION으로 바뀐다. 이전 내용을 다시 입력해도 자동으로 VERIFIED가 복구되지 않는다. 새 인증 요청이 필요하다.
- 결정 후 후속 SQL이 실패해 PENDING이 남으면 get API가 공통 요청의 종료 상태를 읽어 fingerprint 조건으로 상태를 수렴시킨다. 승인 기록과 현재 원본 인증 상태는 구분한다.
- 삭제된 원본은 GET 404로 사용자 조회/요청을 거부한다. ledger의 삭제·변경 표식은 trigger/sweep에서 유지한다. 삭제된 원본을 별도 표시하는 사용자 API는 이번 범위에 없다.
- 새 error `WORKLOG_CERTIFICATION_CHANGED`를 ErrorCodes 및 kr/en error.json에 추가했다.

## 실행 경계

1. 신규 transition 부속 행만 AUTO로 생성된다. 기존 행은 migration 기본값 LEGACY_MANUAL이며 sweep/claim에서 배제한다.
2. 최종 APPROVED 이후 afterDecide가 executor를 호출한다. PENDING/REJECTED/EXPIRED/CANCELLED 및 legacy는 POST 0이다. bulk 공통 `{startedAt,limitMs}` 예산을 사용하고 소진 시 WAITING을 남긴다.
3. ledger claim은 owner predicate, expected rev, AUTO/APPROVED/LIVE, marker 없음, consumed 없음 조건과 rev 증가를 사용한다. 이후 write는 fencing token을 검증한다.
4. global/project enablement와 현재 ruleId를 확인하고 requester offline issue/transition/mypermissions를 읽는다. 출발 상태, 고정 transition/to, 프로젝트/유형 및 필수 screen 입력을 검사한다.
5. changelog anchor를 저장하고 post_started_at marker CAS가 확인된 뒤에만 requester `api.asUser(accountId)` POST를 호출한다. SQL 확인 실패로 marker가 남으면 재POST하지 않는다.
6. 204는 APPLIED + 조건부 CONSUMED. 명확한 4xx 거절만 FAILED로 marker를 지우고 사용자 retry를 허용한다. network/timeout/5xx 및 결과 저장 불확실성은 UNKNOWN이고 재POST하지 않는다. 따라서 'marker가 기록된 모든 요청은 영구 재POST 금지'라는 문구보다 실제 계약은 **명확한 거절 응답을 받은 시도만 retry 가능**이다.
7. reconcile은 anchor 이후, requester actor, 정확한 from/to, marker 이후(5초 skew 허용), 후보 정확히 한 개, consumed 증명 조건을 모두 요구한다. 현재 목적 상태만으로 성공 판정하지 않는다. id 크기는 비교하지 않는다.
8. validator 후보는 active marker를 우선하고 기존 arm/changelog 방어를 유지한다. 한 상태 변경은 최대 한 승인만 소비한다. SQL 소비 결과가 불확실하면 다른 승인에 대체 소비하지 않는다.
9. 5분 job sweep은 최대 6개 후보/15초 실행 예산으로 WAITING을 처리하고 stale APPLYING marker를 UNKNOWN으로 수렴시킨다. cursor는 inclusive createdAt이며 완주 때만 watermark를 전진시킨다. UNKNOWN은 자동 재전송하거나 sweep에서 자동 대조하지 않는다. 사용자 reconcile을 사용한다.
10. certification 원본 관찰은 기존 WorklogHistoryRecorder의 native/REST 이벤트, app 쓰기 및 updated/deleted 누락 보정 sweep을 재사용한다. 이력 보관을 꺼도 인증 관찰은 유지한다. history mirror가 없는 삭제는 인증 ledger 프로젝트 문맥을 batch 조회하여 처리한다. 프로젝트 수집 범위와 읽기 실패는 기존 fail-closed 범위를 따른다.

## Migration / 등록 / 보관

- v039 `v039_alter_transition_request_auto_apply`: transition_request apply columns, 기본 LEGACY_MANUAL. 신규 CREATE DDL에도 동기화했다. 모든 신규 apply column readiness를 검사한다.
- v040 `v040_create_worklog_certification`: 현재 fingerprint/state/검증 흔적 ledger. worklog_id PK.
- v041 `v041_create_worklog_certification_request`: 요청 시 immutable fingerprint/snapshot. request_id BINARY UUID PK.
- certification target/constants/scope builder/TargetRegistry 등록. certification controller + PermissionMap + CONTROLLER_REGISTRARS 등록. retry/reconcile은 기존 transition controller에서 등록.
- manifest scopes를 map으로 바꾸고 read:jira-work/write:jira-work만 allowImpersonation:true로 지정했다. storage:app/read:jira-user는 impersonation 없이 유지했다. 5분 scheduled function을 추가했다. 배포 시 설치 upgrade는 root가 수행해야 한다.
- retention은 UNKNOWN/APPLYING 및 승인됐지만 WAITING/FAILED/BLOCKED인 AUTO transition을 보호한다. transition export에는 apply ledger가 포함된다. certification request snapshot은 batch export하고 요청과 함께 정리한다. 현재 certification ledger는 현재 원본 상태이므로 요청 부속 삭제에 포함하지 않는다.
- 새 APPLIED 전용 알림 종류나 별도 apply 감사 이벤트는 추가하지 않았다. 기존 APPROVED 및 CONSUMED 감사 이벤트와 apply ledger로 상태를 표현한다.

## 검증

`backend-final-test.log`: 아래 관련 테스트를 실행하여 **22 suites / 349 tests 모두 통과**, exit 0.

`npm.cmd test -- --runInBand --testPathPatterns=transition --testPathPatterns=WorklogCertification --testPathPatterns=WorklogHistoryRecorder --testPathPatterns=ApprovalService --testPathPatterns=TargetRegistry --testPathPatterns=scopeKey --testPathPatterns=migrate --testPathPatterns=permissionMap.contract --testPathPatterns=retention`

- 미승인/legacy/schema 미준비 POST 0, 동시 claim POST 1, UNKNOWN 자동/수동 재POST 0, preflight 차단 retry, marker 이후 SQL 확인 실패 무재POST, owner/rev SQL, 정확 증거/다른 actor/중복 증거, 한 건 소비, bounded sweep/lease/no-throw.
- 인증 owner 요청 및 남의 원본 차단, 원본 mutation 0, APPROVED/REJECTED hooks, immutable fingerprint 결정 predicate, 내용/visibility/시간 변경과 삭제, 복원 무자동인증, native/REST/app 및 이력 없는 삭제 sweep 연동.
- 이전 개별 실행 로그도 backend-transition-test.log/backend-certification-test.log에 남겼다. PowerShell stderr redirection 때문에 그 실행 wrapper는 exit 1로 표시되었지만 Jest 결과 자체는 pass였다. 최종 로그는 cmd redirect로 실행하여 실제 exit 0을 확인했다.
- 최종 이후 변경은 adapter fingerprint(target,state)를 기존 인터페이스에 맞춘 단순 서명 보정 한 건이다. 전체 backend/UI/build/lint는 root/verifier가 실행한다.

## 설계 대비 제한 / 실측 위험

- reconcile은 매번 시작 페이지부터 최대 5페이지/500 항목/15초를 검사한다. persistent cursor는 없다. 전체 changelog가 500건을 넘으면 자동 성공 확정 없이 UNKNOWN/수동 확인으로 남는다.
- sweep은 job 기본 infra를 재사용한다. HTTP 한 호출이 길어지는 경우 hard timeout까지 직접 취소하는 기능은 없다. bulk 예산은 실행 시작 시 검사하므로 실행 중인 요청 한 건은 예산을 초과할 수 있다.
- 현재 rule 재검사는 ruleId/enablement/대상 매칭이다. 같은 ruleId의 Flow 편집을 요청 시 raw 구조와 비교하는 transition policy snapshot은 추가하지 않았다. 원 요청 steps는 immutable이다. 규칙·권한·상태의 preflight 후 Jira write까지 race가 완전히 제거된다고 보장하지 않는다. 실제 Jira workflow validator가 최종 방어선이다.
- certification은 단건 get/create와 공통 inbox/detail/decision 단위까지 구현했다. 별도 issue-wide 인증 목록 resolver, 프로젝트 인증 mode 설정 UI, 이미 오래된 모든 워크로그 baseline backfill은 없다. 조회한 기존 원본은 get API가 baseline을 만들고, 자동 sweep의 최초 lookback은 기존 24시간이다.
- 수집 프로젝트를 끈 경우 background 관찰은 해당 범위를 확장하지 않는다. 사용자 get/create에서는 실제 asUser 원본을 읽어 현재 fingerprint를 재확인한다. unreadable 결과를 삭제로 추정하지 않는다.
- certification 요청 생성은 기존 다중 문장 engine DRAFT/LIVE 계약을 따른다. 생성 실패의 고아 immutable request snapshot 자동 청소/재생성은 추가하지 않았다. LIVE 요청과 JOIN하므로 고아는 조회/판정에 사용하지 않는다.
- 현재 ledger는 워크로그당 한 행을 추가한다. bulk history sweep의 관찰 SQL 비용이 늘었으므로 실제 tenant에서 cursor 진행·호출량·storage를 확인해야 한다.
- Forge SQL v039 multi-clause ALTER, offline impersonation consent/계정 제한, REST가 Forge validator를 재진입하는지, requester actor 기록, changelog 정렬/노출/지연, restricted worklog/list 권한, trigger/executor 순서 및 5분 schedule 허용은 미실측이다. asApp transition write는 없다.

## 변경 파일

transition: domain/transition/applyPlan.js, judge.js; RequestJira.js; transitionApply.sql.js, transition.sql.js, migrate.js; TransitionRepository/OfflineGateway/Executor/Service/Controller/ChangeService; TransitionTargetAdapter; runTransitionApplySweep, index.js, manifest.yml, PermissionMap; 관련 신규/기존 테스트.

certification: domain/worklogCertification/fingerprint.js; worklogCertification.sql.js; WorklogCertificationRepository/Service/Controller; WorklogCertificationTargetAdapter; constants/scopeKey/TargetRegistry/ApprovalService; WorklogHistoryRecorder 및 테스트; RetentionRepository/Service; ErrorCodes, locales/kr/error.json, locales/en/error.json; migration/permission 계약 테스트.
