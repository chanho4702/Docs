# status-rule-kvs — 백엔드 보고서

> backend-engineer · 2026-10-21 · 입력 `01_architect_design.md`, `00_input/requirement.md`, `04_spike_todo.md`
> 재작업 회차: 5회차(2회차 Codex 검수 3건, 3회차 통합 검증 F1·O1·O5, 4회차 자동 요청 큐 비동기 전환, **5회차 consumer 멱등·일시 오류 재시도** — 맨 아래 각 절. 4·5회차가 §2.8·§5 의 자동 요청 설명을 대체한다)
> 결과: **root `npx jest` 199 suites / 2,980 tests 전부 통과**(기준선 192 / 2,832; 1회차 198 / 2,945; 2회차 199 / 2,950; 3회차 199 / 2,956; 4회차 199 / 2,973). `npm run merge` 실행함. `forge`·git 명령 실행 안 함.

## 불변식 충돌: 없음

## 1. resolver 목록(3단계 등록)

| resolver | Controller | PermissionMap | CONTROLLER_REGISTRARS |
|---|---|---|---|
| `listTransitionRules`(확장) | 기존 | 기존 `{project:'admin', projectIdKey:'projectId'}` | 기존 `registerTransitionController` |
| `saveTransitionRule`(확장) | 기존 | 기존 | 기존 |
| `deleteTransitionRule`(계약 무변경) | 기존 | 기존 | 기존 |
| **`saveTransitionProjectDefaults`**(신규) | `TransitionController.js` guardedDefine | `{ project: 'admin', projectIdKey: 'projectId' }` | 기존 등록에 포함 |
| **`setupTransitionProject`**(신규) | `TransitionController.js` guardedDefine | `{ project: 'admin', projectIdKey: 'projectId' }` | 기존 등록에 포함 |
| `saveApprovalSettings`(기존, 키 2개 추가) | 기존 | 기존 `{admin:true}` | 기존 |
| `getIssueTransitionApprovals`(history 필드 1개 추가) | 기존 | 기존 | 기존 |

`test/permission/permissionMap.contract.test.js` 통과.

## 2. 실제 응답 shape (글자 그대로)

모든 resolver 응답은 `ResponseWrapper` 로 `{ success: true, content: {...} }`. 아래는 `content`.

### 2.1 `listTransitionRules({projectId})`

```json
{
  "project": { "projectId": "10000", "projectKey": "OPS", "name": "Ops", "style": "classic" },
  "globalEnabled": true,
  "projectEnabled": true,
  "featureEnabled": false,
  "rules": [RuleView],
  "issueTypes": [{ "id": "10001", "name": "Bug", "iconUrl": null }],
  "statuses": [{ "id": "5", "name": "Done", "categoryKey": "done", "issueTypeIds": ["10001"] }],
  "flows": [{ "flowId": "1111…", "name": "Release", "enabled": true, "autoRequestCapable": false }],
  "projectDefaults": { "autoRequest": false },
  "setup": { "completed": false, "completedAt": null },
  "template": { "flowId": "1111…", "autoRequest": true },
  "gen": 4,
  "limits": { "rules": 200, "setupStatuses": 10 }
}
```
- `gen`: 프로젝트 기록의 KVS gen. 기록이 없으면 `null`. 입력으로 받지는 않는다(정보용).
- `template`: 앱 설정의 새 프로젝트 템플릿. `flowId` 는 UUID 또는 `null`(미지정·형식 불량). 이 프로젝트에 적용되는 결재선인지는 거르지 않는다 — 프론트가 `flows[]` 에 있을 때만 미리 선택(설계 §4.7).
- `template` 조회 실패 시 `{flowId:null, autoRequest:false}`.
- `flows[].autoRequestCapable`: 모든 단계 principals 가 USER 또는 CUSTOM 승인 그룹(켜짐)이면 true. 승인 그룹 조회 실패는 false.

**RuleView**
```json
{
  "ruleId": "2222…", "projectId": "10000",
  "issueTypeId": "*", "issueTypeName": null,
  "toStatusId": "5", "toStatusName": "Done",
  "flowId": "1111…", "flowName": "Release", "flowMissing": false,
  "enabled": true, "openCount": 2,
  "updatedAt": 1700000000000, "updatedBy": null, "rev": 1,
  "autoRequest": null,
  "autoRequestEffective": false,
  "autoRequestBlockedReason": "GROUP_FLOW",
  "validatorSeenAt": 1699999999995
}
```
- `updatedBy` 는 **항상 null**(KVS 기록에 계정 id 를 두지 않음 — 설계 §5.4). 기존 화면이 이 값을 표시하면 빈 값이 된다.
- `autoRequest`: `true|false|null`(null = 프로젝트 기본값 따름).
- `autoRequestEffective`: `rule.autoRequest ?? projectDefaults.autoRequest`.
- `autoRequestBlockedReason`: `null | 'GROUP_FLOW' | 'FLOW_MISSING'` — **자동 요청 켬/끔과 무관하게** 결재선 기준으로 채운다(켜져 있을 때 경고할지는 프론트가 `autoRequestEffective` 와 함께 판단). 결재선이 이 프로젝트에서 안 보이면(`flowMissing:true`) `'FLOW_MISSING'`.
- `validatorSeenAt`: epoch ms 또는 null.

### 2.2 `saveTransitionRule`

입력: 기존 `{projectId, ruleId?, rev?, issueTypeId, toStatusId, flowId, enabled}` + `autoRequest?: true|false|null`.
- 키 생략(`undefined`) = 수정 시 기존 값 유지, 생성 시 null. **`null` 을 보내면 "기본값 따름"으로 바뀐다** — 프론트는 `undefined` 와 `null` 을 구분해 보내야 한다.
- 그 밖의 값(`'true'` 등) → `INVALID_TARGET`.

응답: `{ "rule": RuleView }`.

### 2.3 `deleteTransitionRule` — 무변경 `{ "ruleId", "deleted": true, "openCount" }`

### 2.4 `saveTransitionProjectDefaults({projectId, autoRequest:boolean})`
```json
{ "projectDefaults": { "autoRequest": true }, "gen": 5 }
```

### 2.5 `setupTransitionProject({projectId, toStatusIds:string[1..10], issueTypeId?:'*'|id, flowId, autoRequest:boolean})`
```json
{
  "rules": [RuleView, …],
  "created": ["<ruleId>", …],
  "skipped": [{ "toStatusId": "5", "reason": "EXISTS" }],
  "projectDefaults": { "autoRequest": true },
  "setup": { "completed": true, "completedAt": 1700000000000 }
}
```
- `rules` 는 세팅 후 **프로젝트 전체 규칙**(새로 만든 것만이 아님).
- 만든 규칙의 `autoRequest` 는 `null`(프로젝트 기본값을 따름), 기본값은 입력 `autoRequest` 로 기록.
- `issueTypeId` 생략·null·'' = `'*'`.

### 2.6 `saveApprovalSettings` — patch 키 2개 추가
- `statusChangeTemplateFlowId: '' | UUID` (그 밖 `INVALID_TARGET`)
- `statusChangeTemplateAutoRequest: boolean`
- 둘 다 GLOBAL_ONLY, 기본 `''`·`false`. `getApprovalSettings` 의 정책 응답에 두 키가 함께 나온다(기본값 포함).

### 2.7 `getIssueTransitionApprovals` — `history[]`·`targets[].latest` 의 요약에 `autoRequested: boolean` 추가
- REQUESTED 이벤트의 actor 가 null 인 요청(검사가 만든 요청) = true. `listForIssue` 쿼리의 열 하나(EXISTS 서브쿼리)라 SQL 수 무변경.
- `targets[].latest` 는 같은 `summaryOf` 를 쓰므로 거기에도 있다. 다만 `latest` 를 만드는 행은 `listForIssue` 결과라 값이 정확하다.

### 2.8 validator(Forge 가 부름)
| 상황 | 반환 |
|---|---|
| 자동 요청 생성 | `{result:false, errorMessage}` — 문구 `server.validator.REJECT_AUTO_REQUESTED`(vars `{statusName}` = 규칙에 저장된 상태 이름). 이름 없으면 `REJECT_AUTO_REQUESTED_NONAME` |
| 자동 요청 경합 패배(ALREADY_OPEN) | `REJECT_PENDING` 문구 |
| 자동 요청 실패·시간 초과·자격 없음 | `REJECT_NO_REQUEST`(기존 문구). 로그 `[VALIDATOR] auto <OFF|NOT_ELIGIBLE_CODE|NO_ACTOR|NOT_HUMAN|ACTOR_UNKNOWN|FLOW_MISSING|GROUP_FLOW|APPROVER_ACCESS|LATE|FAILED|ALREADY_OPEN|CREATED>` |

### 2.9 자동 적용(executor) — apply 코드 1개 추가
- `apply.code = 'TRANSITION_AMBIGUOUS'`, `apply.status = 'BLOCKED'`, `apply.canRetry = false`(재시도 제외 목록에 넣음).
- 자동 요청은 `transition_id = NULL` 로 저장 → 승인 뒤 사전 확인이 고른 전환 id·이름을 "POST 시작 표시" UPDATE 에 함께 기록. 그래서 `summary.transitionId/transitionName` 은 **승인·적용 전까지 null** 이다(이슈 카드에서 전환 이름 표시가 비면 목적 상태 이름으로 대체 필요).

## 3. 에러 코드
| code | 언제 | 로케일 |
|---|---|---|
| **`TRANSITION_RULE_LIMIT`**(신규) | 프로젝트 규칙 200개 초과, 기록 200KB 초과, 초기 세팅 목적 상태 0개·11개 이상, 색인 5,000 프로젝트 초과 | `locales/{kr,en}/error.json` 추가함 |
| `INVALID_TARGET` | 형식 불량, 이 프로젝트에 없는 유형·상태, 다른 프로젝트·없는 ruleId, setup 의 중복 상태 id | 기존 |
| `INVALID_APPROVER_CONFIGURATION` | 결재선이 활성·이 프로젝트 적용이 아님 | 기존 |
| `TRANSITION_RULE_CONFLICT`(cause.ruleId) | 같은 (유형, 상태) 규칙 존재 | 기존 |
| `CONCURRENT_MODIFICATION` | rule rev 불일치, 또는 KVS gen 경쟁 3회 재시도 후 실패 | 기존 |

## 4. 저장소·스키마
- **SQL 마이그레이션 없음.** `transition_rule`(v029)은 DDL 유지, 코드에서 읽지 않음(B1 이관 없음 — dev 규칙은 다시 만들어야 함. 옛 열린 요청의 `rule_id` 는 새 ruleId 와 달라 자동 적용이 `RULE_CHANGED` 로 BLOCKED 될 수 있다 — dev 만).
- manifest `app.storage.entities` 에 `transition-rules`(`gen: integer`, `body: any`). scope·egress 무변경.
- KVS 키: 엔티티 `p:{projectId}`(원천), `s:{toStatusId}`(색인 `{projects:{[projectId]: projectKey|null}}`), 일반 키 `transitionRule:seen:{projectId}:{toStatusId}` = `{at}`.
- 쓰기 방식 `INDEX_WRITE_MODE = TRANSACT`(1안). 2안 `ORDERED` 도 구현·테스트됨 — K1 실패 시 상수 한 줄 변경. ORDERED 는 **색인 항목을 제거하지 않는다**(과잉 색인 허용, 2회차).
- 정책 키 2개(`statusChangeTemplateFlowId`·`statusChangeTemplateAutoRequest`) — `DEFAULT_APPROVAL_SETTINGS`·`SETTINGS_KEYS`·`GLOBAL_ONLY_KEYS` 세 곳. 판정 함수 `SettingsRepository.getStatusChangeProjectTemplate()`.

## 5. 호출 지도(검증 포인트)
- validator 규칙 없음(색인 미스): KVS 3(전역·기능·색인) + 라이선스, **SQL 0·Jira 0** — `TransitionValidatorService.test.js` "SQL 0" describe 가 실제 `TransitionRepository`(query 모의)로 고정. 색인 적중·다른 프로젝트: SQL 0·asApp 1. 유형 불일치: SQL 0. 기능 끔: SQL 0·Jira 0(관찰 KVS 0~2).
- 테이블 준비 확인은 규칙 적중 뒤에만, 대상 `transition_request`·`approval_request`(`transition_rule` 제외).
- 자동 요청 경로 asUser **0회** — `TransitionAutoRequestService.test.js` 가 실제 `IssueStateReader`·`ApprovalService`·`TransitionTargetAdapter` 의 asUser 주입점(reader.requestAsUser·그룹 구성원 2종·otherUserViewChecker·accessLoader·visibleFilter·commentNotifier·엔진 policyLoader/registryLoader)을 함정으로 두고 고정. asApp 사유는 `transition-auto-request-actor`·`transition-auto-request-approver` 둘만 쓰임을 단언. AGENTS.md 보안 4번에 두 사유 기록함.

## 6. 설계와 다른 점
1. **`AutoRequestApproverAccess` 별도 파일 대신 `IssueStateReader.approverCanViewForValidator`**, 사람 판별도 `IssueStateReader.userForValidator` — 전환 기능의 Jira 단일 지점에 모았다(사유 상수 `ASAPP_REASON.AUTO_REQUEST_ACTOR/APPROVER`).
2. **결재자 자격 검사를 `ApprovalService.assertApproversAllowed` 대신 같은 의미로 재구현** — 엔진 함수는 `policyLoader`(= `getEffectivePolicy` → KVS 70여 키를 5개씩 순차)를 불러 validator 시간 예산을 넘길 수 있다. 대신 privacy.assertOpen(같은 객체) + 명부(`loadApproverList`, KVS 1) + `SettingsRepository.isApproverAccessCheckOn(projectId)`(신규, KVS 1 + 프로젝트 덮어쓰기 SQL 0~1). 명부 밖 결재자도 `APPROVER_ACCESS` 로 묶었다(AutoSkip 집합 확장 없이).
3. **`ApprovalGroupRepository.findByKeys(keys)` 신규**(SQL 1, IN) — 설계의 "승인 그룹 목록 SQL 1". 기존 `list` 는 20개 페이지라 쓰지 않았다.
4. `noRuleVerdict` 는 상수 대신 **함수**(`noRuleVerdict()`) — 공유 객체 변형 방지.
5. `messages.validatorMessage` 에 선택 인자 `vars` 추가(설계는 "무변경"이라 했지만 기존 format 이 issueKey 만 넣었다). 기존 호출 동작 동일.
6. `TransitionRuleRepository.findById(ruleId, projectId)` — 시그니처에 projectId 추가(설계대로). 기존 호출부 없음.
7. 경로 보강: 생성 transaction 응답을 잃고 재시도할 때 같은 ruleId 충돌은 성공으로 본다(중복 생성·오류 방지).
8. executor: 전환 id 미정인데 사전 확인이 id 를 못 주면 `TRANSITION_NOT_AVAILABLE` 로 BLOCKED(POST 안 함). 기존 실행기 테스트 고정 행에 `transitionId:'31'` 을 넣었다(실제 행은 항상 있음).
9. 로케일: 설계 §8 은 프론트 몫이지만 서버가 쓰는/코드 키 4개는 백엔드에서 넣었다 — `transition.server.validator.REJECT_AUTO_REQUESTED(_NONAME)`, `error.TRANSITION_RULE_LIMIT`, `transitionApply.code.TRANSITION_AMBIGUOUS`(kr·en). 나머지(`rules.setup.*`, `rules.autoRequest.*`, `rules.seen.*`, `list.autoRequested`, `policy.statusChange.template.*`)는 **프론트가 추가해야 한다.**

## 7. 테스트
- 신규: `src/domain/transition/__test__/ruleStore.test.js`, `autoRequest.test.js`, `src/resolver/transition/__test__/TransitionRuleRepository.test.js`(두 쓰기 방식 × 무작위 500회 "색인 ⊇ 규칙", 경쟁 재시도, 원자성, ORDERED 경쟁 시나리오(2회차), seen, KVS 어댑터), `TransitionAutoRequestService.test.js`(asUser 0 고정 포함 20건), `src/resolver/settings/__test__/SettingsStatusChangeTemplate.test.js`, `src/resolver/directory/__test__/ApprovalGroupRepository.test.js`. 메모리 가짜 저장소 `__test__/memoryRuleStore.js`(조건 실패·KEY_NOT_FOUND 동작 동일).
- 수정: `TransitionValidatorService.test.js`(KVS 저장소로 전환 + SQL 0 쿼리 수 7건 + 자동 요청 연결 6건), `TransitionService.test.js`(+12), `TransitionExecutor.test.js`(+3), `TransitionOfflineGateway.test.js`(+2), `TransitionRepositories.test.js`(옛 SQL 규칙 저장소 3건 삭제).
- 유휴 SQL 예산(`idleSqlBudget.test.js`)·PermissionMap 계약·featureGateScope 계약·정책 키 계약: 무변경 통과. 새 파일은 기능 판정 함수를 참조하지 않는다(featureGateScope 허용 목록 무변경).

## 8. 미검증(`04_spike_todo.md` 에 구현 메모 추가)
K0(엔티티 추가 major 여부) · **K1(kvs.transact 다중 키·작업 수 한도 — 후퇴안 구현 완료, 플래그 전환)** · K2(쓰기 직후 다른 컨테이너 읽기) · A1(payload user 하위 키 — 로그 추가) · A2(Automation 계정 accountType) · A3(validator 시간, 상수 1500/1200/2200ms) · A4(결재자 viewissue asApp 200) · A5(거부 문구 표시) · A6(offline impersonation 동의) · `kvs.batchGet` 20개 단위 분할(한도 추정).

## 발견(범위 밖, 고치지 않음)
- R1(설계 기록): `createRequestLive` DRAFT 삽입 뒤 커밋 전 중단 시 dedupe 를 쥔 DRAFT 가 남아 이후 생성이 모두 `ALREADY_OPEN` — 정리 경로 없음.
- `AutomaticApproverAccess.automaticApproverCanView`(워크로그)는 viewissue 응답에 `some()` 을 써서 "정확히 그 한 명" 조건(불변식 8 ⓓ)보다 느슨하다 — 이번 경로는 `length === 1` 로 구현.
- ESLint 설정 파일(eslint.config.*)이 없어 `npx eslint` 가 실행되지 않는다(ESLint 10).

## 재작업 2회차 (Codex 백엔드 검수 지적 3건)

| # | 지적 | 수정 | 테스트 |
|---|---|---|---|
| P1 | ORDERED 모드 경쟁(A 마지막 규칙 삭제 ↔ B 같은 상태 규칙 추가)에서 색인 영구 누락 → PASS_NO_RULE | `TransitionRuleRepository.commitOrdered` 가 색인 **제거를 하지 않는다**(추가 먼저 → 프로젝트 CAS 만). 과잉 색인은 validator 가 프로젝트 기록으로 다시 걸러 판정 동일(비용 이슈 조회 1회). TRANSACT(기본)는 그대로 원자적 제거 | `TransitionRuleRepository.test.js` "A 의 마지막 규칙 삭제와 B 의 같은 상태 규칙 추가가 겹쳐도 색인이 남는다"(지적 순서 그대로 deferred 로 재현), ORDERED 삭제 후 색인 유지로 기존 기대값 변경, 옛 "보상" 테스트 삭제 |
| P2-1 | CUSTOM 확인 뒤 `expandRequestedSteps` 가 그룹을 재조회 → 사이에 JIRA 유형으로 바뀌면 asUser 그룹 구성원 조회 | 엔진 확장을 쓰지 않고 **검증한 `findByKeys` 스냅샷으로만 펼침**(`stepsFromSnapshot`, export). 엔진과 같은 규칙(단계당 그룹 하나·개인 혼합 금지·requireAll → 전원) + `normalizeSteps`. CUSTOM·켜짐·구성원 있음 외는 외부 호출 전 Skip. 서비스에서 `approvals` 의존 제거 | 재조회가 JIRA 를 돌려줘도 findByKey 0회·asUser 0·요청 생성, 혼합/그룹 둘/빈 그룹 → FLOW_MISSING |
| P2-2 | 자동 요청에 요청자 앱 접근 제한(restrictAccess) 누락 | `AppAccess.accountHasAppAccess(accountId)` 신규 — `restrictAccess` 키 하나(KVS 1)만 읽고, 켜져 있으면 승인자·설정 관리자·활성 팀원 명부(KVS 2 + SQL 1)로 판정. **Jira 관리자 판정은 하지 않는다**(asUser 필요) → 명부 밖·조회 실패 = 자동 요청 안 함, 새 로그 코드 `AutoSkip.APP_ACCESS`. 사람 판별·결재선 조회와 병렬 | `accountHasAppAccess.test.js`(꺼짐 → 명부 미조회 true / 켬 → 명부만 true), 자동 요청 APP_ACCESS(false·throw 모두 생성 0·asUser 0) |

- 계약 변화 없음(resolver 응답 shape·에러 코드 동일). validator 로그 코드에 `auto APP_ACCESS` 추가.
- 알려진 한계: 제한이 켜진 사이트에서 명부에 없는 Jira 관리자는 자동 요청이 만들어지지 않는다(수동 요청은 가드가 Jira 관리자로 통과시킨다). 거부 문구는 기존 `REJECT_NO_REQUEST`.

## 재작업 3회차 (통합 검증 `03_verify_report.md` F1·O1·O5, 리더 결정 "모르면 자동 요청 안 만든다")

| # | 수정 | 테스트 |
|---|---|---|
| F1 | `TransitionAutoRequestService.prepare` — 결재자 열람 확인 결과가 **`true` 가 아니면 하나라도 `APPROVER_ACCESS`**(기존 REJECT_NO_REQUEST 로 후퇴). 오류·403·5xx·배열 아님·다른 사람·시간 초과 모두 생성 0. `IssueStateReader.approverCanViewForValidator` 주석 정정. 엔진(`assertApproversAllowed`, 수동 경로)의 "null 은 통과"는 그대로 | `TransitionAutoRequestService.test.js` it.each 5건(403·500·200 null·다른 사람·시간 초과) — 생성·부속 행 0 |
| O1 | 결재자 명부(`loadApproverList`) 조회 실패 → 자동 요청 안 함(`APPROVER_ACCESS`). 수동·엔진 경로는 그대로 "실패 = 제한 없음" | 명부 throw → 생성 0 |
| 문서 | AGENTS.md 보안 4번 문구, 설계 01 B6·§6.2(+변경 이력), `04_spike_todo.md` A4 메모 | — |

### O5 — 이번 작업의 신규 파일 전체 목록
- 코드: `src/domain/transition/ruleStore.js`, `src/domain/transition/autoRequest.js`, `src/resolver/transition/TransitionAutoRequestService.js`
- 테스트: `src/domain/transition/__test__/ruleStore.test.js`, `src/domain/transition/__test__/autoRequest.test.js`, `src/resolver/transition/__test__/TransitionRuleRepository.test.js`, `src/resolver/transition/__test__/TransitionAutoRequestService.test.js`, `src/resolver/settings/__test__/SettingsStatusChangeTemplate.test.js`, `src/resolver/directory/__test__/ApprovalGroupRepository.test.js`, `src/permission/__test__/accountHasAppAccess.test.js`
- 테스트 도우미(테스트로 실행되지 않음): `src/resolver/transition/__test__/memoryRuleStore.js`
- 수정 파일: `manifest.yml`, `AGENTS.md`, `locales/{kr,en}/{transition,error,transitionApply}.json`, `src/domain/transition/{judge,messages,applyPlan}.js`, `src/permission/{PermissionMap,AppAccess}.js`, `src/utils/errors/ErrorCodes.js`, `src/resolver/settings/{SettingsRepository,SettingsService}.js`, `src/resolver/directory/ApprovalGroupRepository.js`, `src/resolver/transition/{IssueStateReader,TransitionController,TransitionExecutor,TransitionOfflineGateway,TransitionRepository,TransitionRuleRepository,TransitionService,TransitionValidatorService}.js` 와 그 테스트(`TransitionExecutor`·`TransitionOfflineGateway`·`TransitionRepositories`·`TransitionService`·`TransitionValidatorService`)

## 재작업 4회차 — 자동 요청을 Forge 큐 비동기 생성으로 (dev 실측 A3 뒤 리더 결정)

**왜**: 동기 생성이 콜드에서 gate 1715 / prep 2712 / write 6076ms → validator 예산 4000ms 초과로 사용자는 `REJECT_UNAVAILABLE` 을 봤는데 쓰기는 계속돼 요청이 생겼다.

### 흐름
| 단계 | 하는 일 | Jira | SQL |
|---|---|---|---|
| validator `TransitionAutoRequestService.enqueue` | 판정이 `REJECT_NO_REQUEST` + 실효 자동 요청 켬 + payload `user.accountId` + 시작 ≤ 2500ms → 큐 `transition-auto-request-queue` 에 `{issueId, issueKey, projectId, issueTypeId, ruleId, fromStatusId, toStatusId, accountId, at}` 1건, 넣기 상한 800ms. 사람 판별은 consumer 로 옮겼다(validator 를 빠르게) | 0 | 0 |
| consumer `runTransitionAutoRequest` → `process` | 메시지 형식·나이(15분) → 병렬 재확인(기능·비상 스위치·프로젝트 사용·KVS 규칙 재조회·asApp 이슈) → 출발 상태 그대로·같은 ruleId·실효 자동 요청 → 테이블 준비 → 기존 판정 표(`findCandidates` + `judgeTransition` = `REJECT_NO_REQUEST` 일 때만) → prepare(사람·앱 접근·결재선 스냅샷·명부·열람 = 3회차 fail-closed 그대로) → 부속 행 + `createRequest` | asApp 3종 | 약 15 |

### validator 응답(사용자에게 보이는 것)
| 상황 | 코드 | 문구 키 |
|---|---|---|
| 큐에 넣음 | `REJECT_AUTO_REQUEST_QUEUED`(상태 이름 있음) / `REJECT_AUTO_REQUEST_QUEUED_NONAME` | `transition.server.validator.*` kr/en — "승인 요청을 올리고 있습니다. 잠시 후 이슈의 상태 변경 승인에서 확인하세요. 승인되면 자동으로 '{statusName}'(으)로 바뀝니다." |
| 넣기 실패·800ms 초과·게이트 불통과 | 기존 `REJECT_NO_REQUEST` | 기존 |
| 이미 열린 요청 | 기존 `REJECT_PENDING`(push 안 함) | 기존 |
- `REJECT_AUTO_REQUESTED(_NONAME)` 코드·문구 키는 **삭제**(서버 전용 키, static/ui 미사용 확인).
- 큐에 넣은 뒤 consumer 가 재확인에서 만들지 않을 수 있다(예: 그사이 상태가 바뀜·결재자 열람 불가) — 사용자는 "올리고 있습니다"를 봤지만 요청이 없다. **요청자에게 실패를 알리는 기존 알림 template 이 없다**(현재 서버 templateKey 는 `fieldChangeApplyFailed`·`timesheetChanged` 둘). → **후속 과제**: `notification.template.transitionAutoRequestFailed`(vars: issueKey·reason 코드) + 프론트 문구. 이번에는 코드 로그만.

### 중복·경합
- 같은 메시지 중복 전달: 두 번째 처리는 첫 요청을 `findCandidates` 에서 PENDING 으로 보고 `SKIPPED/NOT_ELIGIBLE_CODE`.
- 동시 처리 두 건: `dedupe_key` UNIQUE → 진 쪽 `ALREADY_OPEN` → 고아 부속 행 정리 후 조용히 종료(`{outcome:'ALREADY_OPEN'}`). 불변식 1 충족.
- consumer 는 던지지 않고 아무것도 돌려주지 않는다(재시도 없음). 결과 로그: `[AUTO_REQUEST] CREATED {"ms"}` / `[AUTO_REQUEST] <reason>` / `[AUTO_REQUEST] FAILED <error.code|name>`. validator 로그: `[VALIDATOR] auto QUEUED {"ms"}` / `[VALIDATOR] auto <reason>` / `[VALIDATOR] auto QUEUE_FAILED <error.code|name>`.

### 판정 불가 처리
consumer 의 기능·비상 스위치·프로젝트 사용 판정 실패는 **만들지 않음**(`DISABLED`). validator 의 "모르면 강제"와 같은 방향(만들지 않음 = 사용자는 기존처럼 막힘).

### manifest
- `consumer: transition-auto-request-consumer`(queue `transition-auto-request-queue`) + function key **`transitionAutoReq`**(handler `index.runTransitionAutoRequest`, `timeoutSeconds: 60` — key 23자 제한으로 리더가 변경). scope·egress 추가 없음 → **dev 실측 5.17.0 minor(Q1 통과)**.
- 유휴 SQL: 이벤트 없으면 consumer 가 돌지 않는다 — 새 스케줄 없음, `idleSqlBudget.test.js` 무변경 통과.

### 코드 변경
- 신규: `src/trigger/transitionAutoRequestQueue.js`(큐 키·push), `src/trigger/runTransitionAutoRequest.js`(consumer 어댑터), `src/index.js` export.
- `TransitionAutoRequestService.js` 재작성 — `enqueue`·`process`·`prepare`·`write`, 동기 상수 `AUTO_START_BY_MS/AUTO_PREP_MS/AUTO_WRITE_BY_MS` 삭제 → `AUTO_QUEUE_START_BY_MS=2500`, `AUTO_QUEUE_PUSH_MS=800`, `AUTO_MESSAGE_MAX_AGE_MS=15분`. 리더가 넣은 timing 로그는 단계 구조가 바뀌어 `ms` 하나로 줄였다. 리더가 한 prepare 병렬화는 유지.
- `IssueStateReader.issueForAutoRequest` + asApp 사유 `transition-auto-request-issue`(AGENTS.md 보안 4번 갱신).
- `AutoSkip` 에 `QUEUE_FAILED·INVALID_MESSAGE·STALE·DISABLED·STATE_CHANGED·RULE_CHANGED` 추가.
- `test/feature/featureGateScope.contract.test.js` 허용 목록에 `resolver/transition/TransitionAutoRequestService.js` 추가(consumer 가 새 접수 경로라 `isStatusChangeApprovalEnabled` 를 읽는다).

### 테스트
- `TransitionAutoRequestService.test.js` 재작성(46건): enqueue 10건(push 내용·NONAME·게이트 5종·push 실패·800ms 초과·형식 불량) + process 36건 — **asUser 0회 고정을 consumer 경로로 옮김**(실제 IssueStateReader·TargetAdapter 의 asUser 주입점 함정, 모든 거부 사유 표에서 `asUserCalls=[]`), asApp 사유가 issue·actor·approver 셋뿐임을 단언, 중복 전달·ALREADY_OPEN·생성 실패 로그(코드만, 본문 미노출)·consumer 어댑터.
- `TransitionValidatorService.test.js` — `enqueue` 연결·`REJECT_AUTO_REQUEST_QUEUED` 문구로 갱신.

### 신규 파일 목록 추가(O5 보강)
- `src/trigger/transitionAutoRequestQueue.js`, `src/trigger/runTransitionAutoRequest.js`

## 재작업 5회차 — consumer 멱등·일시 오류 재시도 (Codex P2 2건, dev 실측 통과 뒤)

dev 실측(리더, 5.17.0): WORK-103 `auto QUEUED {"ms":2962}` → QUEUED 문구 정상, consumer `CREATED {"ms":5586}`(콜드), 이슈 카드 "검사에서 자동으로 요청함" 표시. WORK-104(열린 요청 있음) → REJECT_PENDING. 배포 minor. → `04_spike_todo.md` Q1~Q5 통과 기록.

| # | 지적 | 수정 |
|---|---|---|
| P2-a | 최소 1회 전달 — 생성 → 사용자 취소 → 재전달이면 CANCELLED 는 REJECT_NO_REQUEST 이고 dedupe 도 풀려 새 요청이 또 생김 | **멱등 검사**: 기존 `findCandidates`(같은 대상 issueId+toStatusId, 최신 5건, LIVE) 결과에 **메시지 `at`(validator 시각) 이후 만들어진 요청이 상태 무관 하나라도 있으면 `SKIPPED/ALREADY_HANDLED`**. `created_at` 이 초 단위(SqlTime)라 `at` 을 초 시작으로 내려 비교(같은 초에 만든 요청도 "이후"). 새 저장소 없음, SQL 수 무변경. 메시지 이전의 요청(앞선 막힘의 취소분)은 막지 않는다 |
| P2-b | 일시 오류도 FAILED 로 삼켜 유실 | 결과를 셋으로: `SKIPPED`(영구 사유 — 자격 미달·규칙·상태 바뀜·이미 처리됨·명부 밖 등), `FAILED`(형식·테이블 미준비), **`RETRY`**(Skip 이 아닌 모든 예외 — Jira 5xx/네트워크, SQL·KVS 실패, 기능 판정 조회 실패 — 와 사람 판별 응답 없음·5xx). 어댑터 `createAutoRequestConsumer` 가 RETRY 이고 `event.retryContext.retryCount < 2` 이면 `new InvocationError({retryAfter: 30, retryReason: FUNCTION_RETRY_REQUEST, retryData:{reason}})` 를 돌려준다(@forge/events 2.1.7 — 생성자가 `{_retry:true, retryOptions}` 를 반환, consumer 반환값으로 재시도 요청). 상한 도달 시 로그 `[AUTO_REQUEST] GIVE_UP <reason> {"retryCount"}` 후 정상 종료. 15분 만료는 그대로(재시도도 `at` 기준) |

- 변경: 기능·비상 스위치·프로젝트 사용 판정 조회 **실패**는 이제 `DISABLED`(영구)가 아니라 `RETRY`. 판정 결과가 끔이면 여전히 `DISABLED`.
- 결재자 열람 확인 null(F1)·명부 조회 실패(O1)·앱 접근 판정 실패는 리더 결정대로 **영구**(`APPROVER_ACCESS`·`APP_ACCESS`) — 재시도하지 않는다.
- 로그: `[AUTO_REQUEST] RETRY <reason> <error.code|name>` — 본문 없음.
- 테스트(+7): 재전달 멱등(취소된 요청 at 이후 → ALREADY_HANDLED, at 이전 → CREATED), 일시 오류 5종 → RETRY(이슈 5xx throw·기능 판정 실패·규칙 KVS 실패·후보 SQL 실패·사람 판별 5xx), 어댑터 재시도 요청·상한 포기·서비스 throw → 재시도, 핸들러 반환값, 생성 실패 → RETRY + 정리·본문 비노출. 사람 판별 4xx 는 영구 ACTOR_UNKNOWN.
- 알려진 한계: 같은 초 안에 "앞선 요청 취소 → 즉시 다시 막힘"이면 새 메시지가 ALREADY_HANDLED 로 건너뛴다(안전 방향 — 사용자는 다시 시도하면 된다).
