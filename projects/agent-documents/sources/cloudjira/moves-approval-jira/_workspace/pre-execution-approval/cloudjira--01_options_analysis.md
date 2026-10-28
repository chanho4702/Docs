# 실행 전 승인과 정책 선택 옵션 분석

작성일: 2026-10-06. `feature-design` 적용. 이 문서는 초기 옵션 비교 기록이다. 리더가 합리적 기본안을 사용자에게 명시한 뒤 작성한 구현 기준은 `01_architect_design.md`이며, 충돌하면 구현 기준을 따른다.

## 1. 현행 동작과 추가 요구

| 기능 | 현재 코드 근거와 동작 | 이번 요구에 필요한 추가 |
|---|---|---|
| 상태 전환 | `TransitionService`가 project/type/toStatus SQL rule을 찾고 `rule.flowId`의 결재선을 자동 확정한다. 요청 때 임의 Flow를 고르는 구조가 아니다. | 이슈별 정책 선택 binding, 실행 의도에서 자동 요청 생성, 중복 클릭 dedupe, 승인 후 적용 방식 선택 |
| 전환 강제 | `TransitionValidatorService`가 SQL 규칙과 승인 요청을 판정한다. 설치된 workflow validator가 관문이다. | 전체 대상 workflow 연결 확인과 누락 고지; 아래 PASS 조건의 제품 정책 결정 |
| 워크로그 생성 | `WorklogService.createWorklog`: 입력 검증 → 기간 잠금 evaluate → `WorklogGateway.create`의 요청자 asUser POST. | 아직 Jira에 쓰지 않은 입력안/허가의 승인 및 실행 ledger |
| 타임시트 | 이미 기록된 워크로그 묶음을 제출하고 승인·변경 지문·잠금을 관리한다. `TimesheetService`가 routing을 자동 계산한다. | 사전 허가와 사후 기간 승인을 별개로 유지·표시 |
| 대상 확장 | `TargetRegistry`에 ISSUE, TIMESHEET, ISSUE_TRANSITION, FIELD_CHANGE. FIELD_CHANGE는 최종 결재자 asUser의 적용 hook을 가진다. | WORKLOG_CREATE 등 새 대상 adapter와 요청/실행 부속 테이블 |
| 선택 필드 | 현행 manifest에 `jira:customField` 없음. | 앱 패널 selector 또는 신규 custom field 모듈 |

`src/domain/transition/judge.js`의 현행 PASS 조건: 전역 비활성, 라이선스 비활성, table 미준비, issue/toStatus 없음, 매칭 rule 없음, 프로젝트 비활성. 활성 규칙의 미승인/대기/반려/소비된 요청은 거부한다. 따라서 현행 기능을 “모든 상태 변경은 언제나 승인 필수”라고 안내할 수 없다. strict 정책을 원한다면 라이선스 종료·SQL 장애·설치 초기·생성 전환까지 어떤 상황에서 차단할지 별도 결정해야 한다. 이는 기존 동작 변경이며 단순 UI 자동화와 분리해 검토한다.

## 2. 워크로그 승인 단위 비교

| 항목 | A. 건별 입력안 승인 | B. 기간·한도 사전 허가 |
|---|---|---|
| 결재 대상 | 작성자, issue, started, seconds, comment, policy revision의 고정 snapshot | 작성자, 기간, 프로젝트/이슈 범위, 허가 총 seconds, policy revision |
| 입력 시점 | 입력안 저장/자동 상신 → 승인 → Jira 등록 | 허가 자동 상신 → 승인 → 범위 안에서 Jira 등록 |
| 승인 후 수정 | 값이 달라지면 기존 승인 재사용 불가, 새 요청 | 범위·잔여한도 안이면 개별 요청 없이 입력 |
| 열린 요청 단위 | `WORKLOG_CREATE:{accountId}:{draftId}` 후보, stable client intent 별 UNIQUE | `WORKLOG_PERMIT:{accountId}:{scope}:{periodKey}` 후보, 같은 scope의 중복 허가 방지 |
| UI | 등록 예정 기록·승인 상태·등록 상태를 분리 | 허가 범위·사용량·잔여량·추가 허가 신청 |
| 복잡성 | 승인 건수가 많음; 실행 timeout 중복 해결 필요 | 예약/소비 ledger·동시성·취소·한도반환·외부 입력 사용량 대조까지 필요 |
| 사후 기간 승인 | 기존 타임시트 승인은 실제 입력된 묶음을 별도로 승인 | 동일 |

위 scopeKey는 초안이며 답변 후 정확한 대상 단위·재요청 규칙을 확정한다. 기간 허가만 선택한 경우 “모든 워크로그 내용이 사전 검토됨”이라는 고지는 부정확하다.

## 3. 작성자 보존과 실행 주체

현행 `WorklogGateway`는 asUser만 사용하며 원래 작성자를 보존하는 것이 명시된 이유다. 워크로그 POST의 다른 작성자 강제 설정은 검증되지 않았고 도입 근거가 없다. 승인자의 invocation에서 asUser로 등록하면 요청자 대신 승인자 이름으로 남을 가능성이 있어 요구와 맞지 않는다. [공식 워크로그 REST](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/)의 POST body/작성자 동작을 실측해야 한다.

| 실행 방식 | 평가 |
|---|---|
| 요청자가 승인 후 앱에서 실행 | 요청자 context.accountId와 SQL owner predicate를 재검사하고 권한·잠금·정책·snapshot을 재판정한 뒤 asUser POST. 현행 규약과 가장 잘 맞는 후보 |
| 승인 후 요청자의 열린 화면에서 자동 실행 | 위와 같은 요청자 invocation. 화면이 닫혀 있으면 자동 등록을 보장하지 못하므로 “승인됨·등록 대기” 표시 필요 |
| 최종 승인자 invocation의 asUser 실행 | FIELD_CHANGE 패턴을 그대로 복제하면 작성자가 달라질 수 있음. 워크로그에는 무조건 적용하지 않는다 |
| 백그라운드에서 요청자 대행 | 현재 허용된 asApp 목록에 워크로그 작성 없음. offline impersonation 지원·사용자 동의·scope·작성자 실측·AGENTS 허용 변경을 모두 검토해야 하며 현재 옵션으로 보장하지 않는다 |

승인 결정 status와 적용 status는 별도 원천으로 둔다. 승인 성공 후 Jira 권한이 없어졌다면 결정은 APPROVED로 유지하고 실행을 FAILED/PERMISSION으로 표시한다. 반려 사유·comment 등 사용자 텍스트는 로그로 남기지 않는다.

## 4. Jira POST 중복·타임아웃 설계

SQL CAS와 Jira POST는 하나의 트랜잭션이 아니다. `requestId` property marker를 넣어도 Jira가 중복을 원자적으로 막는 증거가 없으며, 문서화된 idempotency key 보장도 확인되지 않았다. **marker만으로 exactly-once라고 주장하지 않는다.** [공식 Add worklog](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-worklogs/)에서 properties를 POST에 포함할 수 있는지·조회 방법은 실측 대상으로 둔다.

제안하는 실행 ledger는 WAITING → APPLYING → APPLIED/FAILED/UNKNOWN. claim은 owner·APPROVED·rev 조건의 CAS(`rev=rev+1`)와 stable operationId UNIQUE로 한 invocation만 POST하도록 한다. POST 성공이면 worklogId와 원본 snapshot hash를 저장한다. 재호출은 APPLIED의 같은 worklogId를 돌려준다.

네트워크 timeout/응답 소실/프로세스 종료/lease 만료는 실패가 아니라 UNKNOWN이다. 이 상태에서 자동 POST를 재시도하지 않는다. 서버가 만든 operationId+서명 marker와 SQL 원본 hash로 후보 워크로그를 대조하고, 일치 1건이면 APPLIED로 복구한다. marker는 transport proof 후보이며 권한 판정의 진실은 SQL이다. 복수 후보·marker 누락·목록 잘림·권한 부족·조회 지연·삭제 등 불확실성이 있으면 수동 확인 대상으로 유지한다. “조회에서 안 보임”은 “POST가 실행되지 않음”의 증거가 아니다.

요청자 작성자·issue·started·seconds·comment hash까지 일치해야 복구 후보가 된다. 현행 listIssueWorklogs는 최대 1000건이므로 복구 로직에 그대로 쓰면 누락 위험이 있다. pagination·검색 범위·제한 공개 권한을 검토한다. marker를 POST와 별도 PUT로 쓰면 그 사이 crash가 생기므로 복구 proof가 더 약해진다.

기간 허가 옵션에서는 소비량을 먼저 reserve하고 같은 operationId에 묶는다. 확실한 미실행 실패만 예약을 반환하고 UNKNOWN은 예약을 유지한다. 외부 워크로그와 수정/삭제가 한도에 어떤 영향을 주는지도 답변 후 결정한다.

## 5. 앱 필드 선택 비교

| 항목 | C. Moves Approval 패널 dropdown | D. 실제 Jira custom field |
|---|---|---|
| 저장 원천 | 앱 SQL의 issue→policy binding + rev | Jira field는 사용자 입력 채널, 앱 SQL binding이 실행 판정 원천 |
| 화면 | 기존 패널 확장, 앱 정책 목록/미적용 사유 표시 | Jira field 화면/검색/컨텍스트에 통합 |
| 권한 | read는 issue:view, save는 issue:edit에 정책 할당 권한 추가 검토 | 일반 Edit issue/REST/automation 변경을 신뢰하면 정책 완화 우회 가능 |
| 플랫폼 변경 | 기존 panel/resolver 추가, manifest 변화 최소 | `jira:customField` 모듈·resource·scope 검토·install upgrade·관리자 field context/screen 설정 |
| 동기화 | 저장 transaction 뒤 다음 요청에 즉시 SQL binding 적용 | Jira field와 SQL 불일치·event 지연·복구가 새 문제 |
| read-only 대안 | 해당 없음 | SQL 선택을 읽기 전용 field로 게시 가능하나 Jira 화면 직접 선택은 불가 |

Forge는 `jira:customField`와 Custom UI edit를 지원한다. readOnly field는 일반 UI/Edit issue REST로 편집할 수 없고 create/transition 화면에 표시되지 않는다. [공식 custom field 모듈](https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-custom-field/).

이슈 edit 권한자가 policy=None/느슨한 policy로 바꾸어 승인 경로를 우회하지 않도록, project 관리자가 허용 policy 집합·default/required/floor를 관리한다. 사용자 선택은 그 집합에서만 가능하고 공개되지 않은 policyId 전달은 서버가 거부한다. mutation은 guardedDefine+PermissionMap+CONTROLLER_REGISTRARS 세 곳을 등록하고 SQL WHERE에 issue/project 범위를 포함한다.

프로퍼티에 policyId를 저장하는 shortcut은 판정 원천으로 쓰지 않는다. custom field 값을 선택 채널로 채택해도 승인 규칙·policy revision·binding CAS는 SQL에서 검증한다. generic Jira REST 편집 이벤트만 보고 SQL을 뒤늦게 바꾸는 구조에서는 변경 직후의 strict 차단을 보장할 수 없다. 단일 권한있는 선택 경로, read-only mirror, 또는 pending-sync 차단 중 어떤 모델인지 확정해야 한다.

## 6. 정책 자동 적용과 자동 상신의 경계

정책 템플릿에는 허용 프로젝트/유형, 보호 전환, worklog approval mode, Flow 참조/결재자 routing, 한도/기간, revision을 둔다. selection은 이슈별 binding만 저장한다. 템플릿을 요청마다 새로 만들지 않는다. 적용 규칙은 서버에서 project default→허용된 issue binding→mandatory floor로 계산하되 precedence는 답변 후 확정한다.

**정책 선택만으로 입력 내용이 없는 워크로그 요청을 생성하지 않는다.** A에서는 사용자가 내용을 작성해 실행을 시도할 때 draft snapshot과 자동 상신을 한 번 만든다. B에서는 사용자·기간·한도·scope가 정해진 허가 신청 이벤트가 필요하다. 상태 전환은 목표 전환을 선택하거나 실행 시도하는 시점에 현재 rule.flowId로 자동 상신하는 UX를 설계할 수 있다.

workflow validator 안에서 승인 요청 생성·알림·DDL 등의 side effect를 추가하지 않는다. validator는 승인 여부만 판단한다. Jira 기본 전환 클릭을 앱이 완전히 가로채는 기능은 미검증이므로 패널의 전환 의도 UI/전환 화면 지원을 비교하고, 기존 기본 버튼에서는 요청 안내 후 앱으로 이동하는 경로도 남긴다. 승인 후 즉시 자동 전환과 승인 후 원래 사용자가 실행 가능한 상태로 만드는 방식은 별도 결정이다.

정책 변경 시 이미 열린 요청을 새 Flow로 재작성하면 안 된다. 요청 시 policy/flow revision을 snapshot하고 변경 시 만료·유지·재승인 중 규칙을 결정한다. 승인 후 실행에는 해당 snapshot과 현재 mandatory floor를 다시 비교한다.

## 7. 강제 범위와 고지

Jira workflow validator는 연결된 전환에서만 판정한다. 설치/연결 누락·비보호 rule·현재 PASS 설정을 앱에서 확인 가능하게 안내해야 한다. team-managed·bulk·REST·automation·생성 전환 등 경로별 실측을 마치기 전 전체 차단을 약속하지 않는다.

워크로그 앱 UI의 서버 승인 검사는 Jira REST·automation·타 앱 입력 자체를 차단하지 않는다. 현행 timeTrackingProvider는 화면 대체와 사후 drift 감지이며 사용자에게 Work on work items 권한이 있으면 외부 POST 경로가 남을 수 있다. 권한 회수는 요청자 asUser 등록도 막는다. 따라서 “Jira 모든 경로에서 승인 전 입력 불가”는 현재 구현으로 보장할 수 없다. 별도 Jira 권한 운영과 대행 모델의 성립 여부를 확인해야 한다.

사용자 고지는 최소한 신청/승인/실행의 상태 차이, 작성자 보존 때문에 재접속이 필요할 수 있음, 거부/만료/권한 실패, 앱 경로의 제약과 외부 변경 감지, 기간 사후 승인과 사전승인의 차이를 포함한다. Workforce는 아직 등록되지 않은 draft를 워크로그로 보지 않으며 실제 Jira 등록 이후 기존 서명 연동/기간 승인 정책이 적용된다는 점을 별도 가이드와 연결한다.

## 8. 답변 후 확정할 것·실측

1. 질문 두 축 A/B 및 C/D의 답변을 요구사항에 추가한다.
2. 상태 변경을 승인 즉시 실행할지, 승인 후 요청자 실행을 허용할지 결정한다.
3. mandatory 정책의 변경 권한과 fail-open 기존 조건을 유지/변경할지 확정한다.
4. TargetKind/scopeKey/부속 ledger schema, adapter describe/visibility/beforeDecide/afterDecide 책임, resolver 계약 표와 i18n/설치 고지를 확정한다.
5. 건별 POST의 author, 원자적 properties 포함, timeout 성공·응답소실·marker삭제·1000건초과·권한변경·동시재호출을 실측한다. 실패 시 UNKNOWN 유지 전략으로 중복을 막는다.
6. custom field 선택이면 편집 validation·REST/automation 우회·readOnly mirror·event 지연·project context·team-managed 지원·manifest resource 연결을 실측한다.
7. 호출량: A는 기존 Jira POST 1회 외 승인 SQL/ledger; UNKNOWN 복구는 issue worklog 페이지 수만큼 GET 가능. B는 매 입력당 reserve/commit SQL 및 범위 판정. 200명 저장량은 선택 단위·월 기록 수 확정 후 산정한다.

현재 단계에서는 신규 구현·DDL·scope를 확정하지 않는다. 질문 답변 후 설계→backend→frontend→검증 순서로 진행한다.

## 9. 권장 기본안과 이번 변경의 경계

답변이 아직 없을 때 검토할 기본안은 **건별 입력안 승인 → 작성자 본인의 asUser 실행**, **패널의 허용 preset selector → SQL binding**이다. 기존 전환 SQL rule의 Flow 고정 방식은 유지한다. 프로젝트 관리자의 mandatory 정책이 승인 필요 여부를 결정하고 사용자는 허용된 preset만 고를 수 있으며 None 선택으로 강제를 풀 수 없다. 이는 권장 분석안이며 이번 sidebar·가이드 변경에서 사전승인 소스를 구현하라는 확정은 아니다.

현재 전환 fail-open 동작은 이번 작업에서 변경하지 않는다. 향후 strict 정책(판정 불가 시 차단)과 운영 해제 정책(해당 범위 승인 강제를 해제)의 선택·권한·사용자 안내를 설계해야 한다.

| 현행 validator PASS 조건 | 사용자에게 고지할 의미 | 향후 strict 검토 |
|---|---|---|
| 전역 비활성 | 앱에서 전환 승인 강제가 꺼져 있음 | 관리자 운영 해제 권한·감사 |
| 라이선스 비활성 | 현행 코드에서는 validator가 승인 강제를 통과시킴 | 결제/만료 때 업무 차단과 해제 중 제품 결정 |
| table 미준비 | 설치 초기 또는 저장소 판정 불가에서 강제되지 않을 수 있음 | 초기 설치/장애 시 fail-closed 정책 |
| issue 또는 목표 상태 없음 | 판정할 대상이 없으면 승인 강제를 적용하지 않음 | 생성 전환 지원 및 거부 고지 |
| 매칭 rule 없음 | 모든 전환이 아니라 규칙에 매칭된 전환만 승인 대상 | mandatory 보호 전환 집합 검증 |
| 프로젝트 비활성 | 해당 프로젝트에는 강제가 적용되지 않음 | 프로젝트 해제 권한·감사 |
| validator 미설치/미연결 | 앱의 승인 SQL이 있어도 Jira 전환 경로에 관문이 없음 | 관리자 설치 완료 진단 및 가이드 |

마지막 행은 judge PASS 분기 자체가 아니라 Jira workflow의 실행 관문 부재다. 설정의 UI 고지는 이 차이를 구분하며, “미승인 전환은 항상 차단됨”이라는 전역 표현을 사용하지 않는다.

## 10. 구현 기본안 승계

건별 승인과 패널 selector로 구현 설계를 진행했다. preset은 기존 Flow의 허용 목록과 기본 Flow로 표현하고 별도 preset CRUD를 만들지 않는다. project 정책/binding/entry 3테이블만 추가하며 KVS latch를 사용하지 않는다. schema 미준비 시 앱 워크로그 생성은 일시 거부하지만 정상 readiness에서 정책 미설정 project는 기존 입력을 유지한다. 요청자 asUser 실행, UNKNOWN 재POST 금지, 기존 전환 fail-open 유지 및 고지 강화는 그대로다. 구체 resolver·schema·adapter·UI 계약은 `01_architect_design.md`를 따른다.
