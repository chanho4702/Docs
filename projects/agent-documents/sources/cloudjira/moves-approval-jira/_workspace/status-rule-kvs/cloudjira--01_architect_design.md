# status-rule-kvs 설계서 — 상태 변경 승인: 규칙 KVS 이전 · 막힐 때 자동 요청 · 프로젝트 초기 세팅 · 검사 연결 표시

> 2026-10-21 · feature-architect · 입력 `00_input/requirement.md`
> 선행: `_workspace/product-polish-2026-10-20/`(상태 변경 승인 재활성화, 커밋 002ad3c·fdb0abe·3fe95ae), T1 실측(2026-10-21) — payload = `context, contextToken, issue{id,key}, modifiedFields, transition{from,to}, user`.
> 범위 밖: 기능 기본 켜기, 앱이 워크플로 수정, 워크포스 변경, 필드 변경 승인(`FieldChangeRuleRepository` 는 SQL 그대로).

## 보류 결정 (사용자: "결정은 나중에, 빠르게" — 기본값으로 진행)

| # | 질문 | 정한 기본값 | 이유 / 바꿀 때 영향 |
|---|---|---|---|
| B1 | 옛 `transition_rule` SQL 행 이관 | **이관하지 않는다.** 테이블·DDL(v029)은 남기고 코드에서 읽지 않는다. dev 규칙은 다시 만든다 | 고객 배포 전. 1회 복사는 "프로젝트 기록 없음 + 테이블 있음"마다 SQL 을 치게 돼 "규칙 없는 화면 SQL 0" 목표와 충돌. 기존 열린 요청의 `rule_id` 가 새 규칙 id 와 달라 자동 적용이 `RULE_CHANGED` 로 BLOCKED 될 수 있다(dev 만) |
| B2 | 사이트 템플릿을 프로젝트가 **상속**할지 **복사**할지 | **복사.** 초기 세팅 시 프로젝트 기록에 값을 써 넣는다. 이후 템플릿을 바꿔도 기존 프로젝트는 그대로 | validator 가 설정 KVS 를 더 읽지 않는다. 상속이 필요해지면 `effectiveAutoRequest` 에 세 번째 인자를 더하면 된다 |
| B3 | 자동 요청을 만드는 막힘 코드 | **`REJECT_NO_REQUEST` 만**(최신 요청이 EXPIRED·CANCELLED 여서 NO_REQUEST 로 떨어진 경우 포함). `REJECT_REJECTED`·`REJECT_CONSUMED`·`REJECT_STATE_MISMATCH` 는 지금처럼 안내만 | 반려 직후 같은 전환을 다시 누르면 곧바로 재상신되는 것은 결재자 입장에서 소음. 요구 문언도 NO_REQUEST |
| B4 | 사람/자동화 판별 | asApp `GET /rest/api/3/user?accountId=` → **`accountType === 'atlassian' && active === true` 만 사람**. 그 밖(app·customer·조회 실패·시간 초과)은 자동 요청 안 함 | "모르면 안 만든다". 자동화 규칙의 실행자를 특정 사람으로 둔 경우는 사람으로 보인다 — 그 사람이 요청자가 된다(수용) |
| B5 | Jira 그룹이 든 결재선 | **자동 요청 안 함**(기존 거부 문구). 사용자 지정(CUSTOM) 승인 그룹·개인은 지원. Jira 그룹·JIRA 유형 승인 그룹은 구성원 조회가 asUser(`group/member`)라 validator 에서 못 부른다 | asApp 그룹 조회를 새 사유로 열면 지원 가능(후속). 화면이 결재선 옆에 "자동 요청 불가" 표시 |
| B6 | 결재자 이슈 열람 확인(정책 `approverAccessCheck`) | 워크로그 자동 요청 선례(`AutomaticApproverAccess`)대로 **asApp `user/viewissue/search`**(새 사유 `transition-auto-request-approver`). **true 가 아닌 결과(false·응답 못 받음·비정상·시간 초과) 하나라도 → 자동 요청 안 함**(2026-10-21 통합 검증 F1·리더 결정 "모르면 안 만든다", 불변식 8 ⓓ). 결재자 명부 조회 실패도 자동 요청 안 함(O1) | 엔진(`assertApproversAllowed`)보다 엄하다 — 엔진의 "null 은 통과"는 수동 경로 그대로 |
| B7 | 자동 적용 전환 id | **validator 에서 찾지 않는다.** `transition_id = NULL` 로 저장하고, 승인 뒤 `TransitionExecutor` 사전 확인(요청자 offline asUser 의 전환 목록)에서 `to = 목적 상태` 인 전환이 **정확히 하나**면 그것으로 POST, 0개 `TRANSITION_NOT_AVAILABLE`, 2개 이상 **`TRANSITION_AMBIGUOUS`**(BLOCKED, 요청자 직접 전환 안내) | validator 시간·Jira 호출 절약 + 실제 실행자의 현재 전환 목록이 가장 정확. 출발 상태는 사전 확인의 `STATE_CHANGED` 검사가 지킨다 |
| B8 | 자동 요청 문구의 약속 범위 | "승인되면 자동 전환을 **시도**하고, 안 되면 다시 전환하면 통과" | 요청자가 앱에 동의하지 않았으면 offline impersonation 이 실패한다(CLAUDE.md 채널 실측 S2 와 같은 플랫폼 규칙, T8). 과약속 금지 |
| B9 | 자동 요청의 `target_title` | **비운다**(`''`). 목록은 이슈 키로 표시하고, 상세는 열람 시 asUser `describe` 가 채운다 | asApp 으로 읽은 이슈 요약을 저장·표시하면 AGENTS asApp #4("판정에만") 를 넘는다. 넓히려면 사유 추가 결정 필요 |
| B10 | 검사 연결 감지(워크플로 API) | **후속으로 미룬다.** 이번에는 scope 추가 없이 "검사 호출 관찰" 표시(§6.3)만 | 워크플로 조회는 `manage:jira-configuration`(또는 granular `read:workflow:jira`, Forge 지원 미검증) scope 추가 = major·재동의 + 마켓 심사 노출 scope 확대. "누락 N개"는 후속 |
| B11 | 규칙 있음 + SQL 테이블 미준비 | 기존 판정 표 그대로 `PASS_NOT_READY` | 완료 기준 "기존 판정 표 동일". 규칙 저장 resolver 가 먼저 `ensureMigratedOnce` 를 지나므로 실제로는 거의 생기지 않는다 |
| B12 | 초기 세팅 한 번에 고를 목적 상태 수 | **최대 10개** | KVS transaction 한 번의 작업 수(프로젝트 1 + 상태 색인 ≤10) 를 미검증 한도(K1) 안에 둔다 |

**정말 막히는 제품 결정: 없음.** 다만 B10(검사 누락 N개)을 이번에 꼭 원하면 scope 추가 결정이 필요하다(§6.3).

---

## 1. 개요·영향 범위

| 축 | 변경 |
|---|---|
| 도메인 | 신규 `src/domain/transition/ruleStore.js`(프로젝트 기록·상태 색인 변환·한도), `src/domain/transition/autoRequest.js`(자격 판정·사람 판별·전환 선택). `judge.js` 에 `ValidatorCode.REJECT_AUTO_REQUESTED` 추가(판정 표 자체는 무변경). `messages.js` 무변경(vars 일반화돼 있음) |
| resolver | `TransitionRuleRepository` **KVS 구현으로 교체**(같은 메서드 이름 + 색인 메서드). `TransitionValidatorService` 검사 순서 변경 + 자동 요청 호출. 신규 `TransitionAutoRequestService`. `TransitionService` 규칙 응답 확장 + 신규 resolver 2개. `TransitionExecutor`·`TransitionOfflineGateway` 전환 id 미정 처리. `SettingsRepository` 정책 키 2개 |
| 스키마 | **SQL 마이그레이션 없음.** `transition_rule` 미사용으로 남김 |
| manifest | `app.storage.entities` 에 `transition-rules` 추가(K0: major 여부 확인). scope·egress 무변경 |
| asApp | 사유 2개 추가(AGENTS.md 보안 4번 확장): `transition-auto-request-actor`, `transition-auto-request-approver` |
| 엔트리 | 새 엔트리 없음. `projectSettings`(초기 세팅 단계·자동 요청 열·검사 관찰 열), `admin`(상태 변경 승인 탭에 "새 프로젝트 기본값" 섹션) |
| i18n | `transition.json`(server.validator 2키, rules.setup.*, rules.autoRequest.*, rules.seen.*, apply 코드 1), `transitionApply.json`(TRANSITION_AMBIGUOUS), `policy.json`(template 섹션), `error.json`(새 에러 코드 1) |
| 워크포스 | 없음 |

### 1.1 불변식 대조

| # | 이 설계에서 |
|---|---|
| 1 | 자동 요청도 `approvalRepository.createRequest` → `dedupe_key` UNIQUE. 동시 두 validator 는 하나만 성공, 진 쪽은 `ALREADY_OPEN` → `REJECT_PENDING` 문구 |
| 2·4·5·6 | 엔진 무변경. 결정적 이벤트 id 는 `createRequestLive` 가 이미 만든다 |
| 3 | 새 도메인 함수 전부 `now`·`elapsedMs` 인자. KVS·Jira 무호출 |
| 7 | 규칙 resolver 는 `{project:'admin'}` + 저장 키를 서버가 `p:{projectId}` 로 고정(가드가 본 프로젝트 밖은 못 건드림). 색인은 서버만 씀 |
| 8 | validator = 사용자 컨텍스트 없는 경로. 자동 요청 경로에 **asUser 0회**(§4.3 지도). asApp 결과는 판정에만, 응답(거부 문구)엔 payload 이슈 키 + 규칙에 저장된 상태 이름만 |
| 9 | Jira 엔티티·프로젝트 프로퍼티 미사용. 앱 전용 KVS 만 |
| 10 | validator 는 함수형 그대로 |

---

## 2. 경계면 계약

### 2.1 resolver 표

| resolver | 권한 축 | 입력 | 응답 shape (success, `content` 아래) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `listTransitionRules` (확장) | `{project:'admin', projectIdKey:'projectId'}` | `{projectId}` | `{project, globalEnabled, projectEnabled, featureEnabled, rules:[RuleView], issueTypes, statuses, flows:[{flowId,name,enabled:true, autoRequestCapable:boolean}], projectDefaults:{autoRequest:boolean}, setup:{completed:boolean, completedAt:number\|null}, template:{flowId:string\|null, autoRequest:boolean}, gen:number\|null, limits:{rules:200, setupStatuses:10}}` | `INVALID_TARGET` | 프로젝트 설정 › 상태 변경 승인 |
| `saveTransitionRule` (확장) | 동일 | 기존 `{projectId, ruleId?, rev?, issueTypeId, toStatusId, flowId, enabled}` + **`autoRequest?: true\|false\|null`**(생략 = 수정 시 기존 값 유지, 생성 시 null) | `{rule: RuleView}` | `INVALID_TARGET`, `INVALID_APPROVER_CONFIGURATION`, `TRANSITION_RULE_CONFLICT`(cause.ruleId), `CONCURRENT_MODIFICATION`, **`TRANSITION_RULE_LIMIT`** | 규칙 폼 모달 |
| `deleteTransitionRule` (무변경 계약) | 동일 | `{projectId, ruleId, rev}` | `{ruleId, deleted:true, openCount}` | `INVALID_TARGET`, `CONCURRENT_MODIFICATION` | 규칙 표 |
| **`saveTransitionProjectDefaults`** (신규) | 동일 | `{projectId, autoRequest:boolean}` | `{projectDefaults:{autoRequest}, gen}` | `INVALID_TARGET`, `CONCURRENT_MODIFICATION` | 규칙 섹션 상단 "자동 요청 기본값" |
| **`setupTransitionProject`** (신규) | 동일 | `{projectId, toStatusIds:string[1..10], issueTypeId?:'*'\|id (기본 '*'), flowId, autoRequest:boolean}` | `{rules:[RuleView], created:string[] (ruleId), skipped:[{toStatusId, reason:'EXISTS'}], projectDefaults:{autoRequest}, setup:{completed:true, completedAt}}` | `INVALID_TARGET`, `INVALID_APPROVER_CONFIGURATION`, `TRANSITION_RULE_LIMIT`, `CONCURRENT_MODIFICATION` | 초기 세팅 단계 |
| `saveApprovalSettings` (기존, 키 2개 추가) | `{admin:true}` (기존) | patch 에 `statusChangeTemplateFlowId: ''\|uuid`, `statusChangeTemplateAutoRequest: boolean` | 기존 정책 응답(두 키 포함) | `INVALID_TARGET`(형식) | 앱 설정 › 상태 변경 승인 › 새 프로젝트 기본값 |
| `getIssueTransitionApprovals` (무변경 계약) | `{issue:'view'}` | `{issueId}` | 기존. `history[].autoRequested:boolean` **추가**(요청 이벤트 actor 가 null 인 ISSUE_TRANSITION) | 기존 | 이슈 화면 카드 |

**RuleView** (기존 키 유지 + 추가):
```
{ ruleId, projectId, issueTypeId, issueTypeName, toStatusId, toStatusName, flowId, flowName, flowMissing, enabled,
  openCount, updatedAt, updatedBy:null (KVS 에 계정 id 를 두지 않는다 — §5.4), rev,
  autoRequest: true|false|null,          // 규칙 덮어쓰기(null = 프로젝트 기본값 따름)
  autoRequestEffective: boolean,          // rule.autoRequest ?? projectDefaults.autoRequest
  autoRequestBlockedReason: null|'GROUP_FLOW'|'FLOW_MISSING',  // 켜져 있어도 만들 수 없는 이유(화면 경고)
  validatorSeenAt: number|null }          // §6.3 검사 호출 관찰(epoch ms)
```

`flows[].autoRequestCapable` = 단계 principals 가 `USER` 또는 CUSTOM 승인 그룹(`AGROUP` 중 type CUSTOM)뿐인가. JIRA 유형 승인 그룹 판정을 위해 서비스가 승인 그룹 목록(SQL 1)을 함께 읽는다.

### 2.2 신규 에러 코드 (`ErrorCodes`)

| code | 언제 |
|---|---|
| `TRANSITION_RULE_LIMIT` | 프로젝트 규칙 200개 초과, 초기 세팅 목적 상태 0개·10개 초과 |

나머지는 기존 코드 재사용. `CONCURRENT_MODIFICATION` = KVS gen 충돌 3회 재시도 후에도 실패, 또는 rule rev 불일치.

### 2.3 validator 계약 (Forge 가 부름 — 변경점만)

| 판정 | 기존 | 신규 |
|---|---|---|
| 새 code `REJECT_AUTO_REQUESTED` | — | 자동 요청을 방금 만들었다. `requestId` 포함. `result:false`, 문구 `server.validator.REJECT_AUTO_REQUESTED`(vars `{statusName}`), 이름이 없으면 `REJECT_AUTO_REQUESTED_NONAME` |
| 자동 요청 경합 패배(`ALREADY_OPEN`) | — | `REJECT_PENDING` |
| 자동 요청 실패·시간 초과·자격 없음 | — | `REJECT_NO_REQUEST`(기존 문구). 로그 `[VALIDATOR] auto <reason>` |

`REJECT_AUTO_REQUESTED` 는 `isPassDecision` 이 false 인 거부 코드다 — **요청 생성 성공이 전환 통과가 되지 않는다.**

---

## 3. 도메인 (순수)

### 3.1 `src/domain/transition/ruleStore.js`

```js
export const RULE_LIMITS = Object.freeze({ perProject: 200, setupStatuses: 10, indexProjects: 5000 });

/** KVS 원문 → 정규화 프로젝트 기록. 모르는 키·형식은 버린다(값 불신, 앱 전용이어도 방어). */
projectRecordOf(projectId, raw) → { projectId, projectKey:string|null, defaults:{autoRequest:boolean}, setup:{completed:boolean, completedAt:number|null},
                                    rules:[{ruleId, issueTypeId, toStatusId, flowId, enabled, autoRequest:boolean|null,
                                             issueTypeName, toStatusName, updatedAt, rev}] }
emptyProjectRecord(projectId) → 위 모양, defaults.autoRequest=false

/** 저장(생성·수정). 키 중복 → {error:'CONFLICT', ruleId}, rev 불일치 → {error:'STALE'}, 없음·다른 프로젝트 → {error:'NOT_FOUND'}, 한도 → {error:'LIMIT'} */
applyRuleSave(record, input, { now, newRuleId }) → { record, rule } | { error, ruleId? }
applyRuleDelete(record, { ruleId, rev }) → { record } | { error }
applyDefaults(record, { autoRequest }) → { record }
/** 초기 세팅 — 이미 같은 (유형, 상태) 규칙이 있으면 skipped. defaults·setup 도 함께 */
applySetup(record, { toStatusIds, issueTypeId, flowId, autoRequest, now, newRuleIds }) → { record, created, skipped } | { error }

/** 이 기록이 validator 색인에 올려야 하는 목적 상태 = enabled 규칙의 toStatusId 집합 */
indexedStatusesOf(record) → Set<string>
/** 저장 전·후 기록 → 색인에 추가/제거할 상태 */
indexDiff(beforeRecord, afterRecord) → { add:string[], remove:string[] }
/** 상태 색인 본문 조작. body = {projects:{[projectId]: projectKey|null}} */
indexWith(body, projectId, projectKey) / indexWithout(body, projectId) → body
statusIndexOf(raw) → { projects: Map<projectId, projectKey|null> }

effectiveAutoRequest(rule, defaults) → boolean   // rule.autoRequest ?? defaults.autoRequest ?? false
```
`matchRule`·`rulesForIssueType`·`normalizeRuleKey`(rule.js)는 그대로 재사용한다 — 기록의 `rules` 배열에 projectId 를 붙여 넘긴다.

테스트(`src/domain/transition/__test__/ruleStore.test.js`):
- 생성 → 색인 add=[to]; 같은 키 재생성 → CONFLICT(기존 ruleId); `'*'` 와 정확 유형은 공존.
- enabled true→false → remove=[to] (같은 to 의 다른 enabled 규칙이 있으면 remove 없음).
- toStatus 변경 수정 → add=[new], remove=[old](old 에 다른 규칙 없을 때).
- rev 불일치 STALE, 다른 프로젝트 ruleId NOT_FOUND, 201번째 LIMIT.
- applySetup: 10개 초과 LIMIT, 0개 LIMIT, 일부 존재 skipped, defaults.autoRequest·setup.completed 기록.
- effectiveAutoRequest: null→기본값, false 덮어쓰기, 기본값 없음→false.
- projectRecordOf: 알 수 없는 필드·잘못된 id·문자열 boolean 버림.

### 3.2 `src/domain/transition/autoRequest.js`

```js
export const AutoSkip = Object.freeze({
  OFF:'OFF', NOT_ELIGIBLE_CODE:'NOT_ELIGIBLE_CODE', NO_ACTOR:'NO_ACTOR', NOT_HUMAN:'NOT_HUMAN', ACTOR_UNKNOWN:'ACTOR_UNKNOWN',
  FLOW_MISSING:'FLOW_MISSING', GROUP_FLOW:'GROUP_FLOW', APPROVER_ACCESS:'APPROVER_ACCESS', LATE:'LATE', FAILED:'FAILED',
});

/** 자동 요청을 시도할지(쓰기 전 1차). verdict = judgeTransition 결과 */
autoRequestGate({ verdict, rule, defaults, accountId, elapsedMs, startByMs }) → { go:boolean, reason:AutoSkip|null }
  // go 조건: verdict.code === REJECT_NO_REQUEST && effectiveAutoRequest && accountId && elapsedMs <= startByMs

/** asApp /user 응답 → 사람인가. 200 + accountType 'atlassian' + active true 만 true. 그 밖 false/null(모름) */
humanActorOf({ status, body }, accountId) → true | false | null   // body.accountId 가 다르면 null

/** 결재선 단계(principals) 지원 여부 — USER·CUSTOM AGROUP 만. groupsByKey: Map<groupKey,{type,enabled}> */
flowAutoCapability(flow, groupsByKey) → { capable:boolean, reason:null|'GROUP_FLOW'|'FLOW_MISSING' }

/** 실행 시점 전환 선택(B7) */
pickTransitionFor(transitions, toStatusId) → { transitionId:string|null, code:null|'TRANSITION_NOT_AVAILABLE'|'TRANSITION_AMBIGUOUS' }
```
테스트(`autoRequest.test.js`): 코드별(PENDING·REJECTED·CONSUMED 에서 go=false), 끔/규칙 덮어쓰기, accountId 없음, 늦음, `humanActorOf`(app·customer·inactive·404·다른 accountId·timeout→null), 결재선(USER only / JIRA GROUP / AGROUP JIRA / AGROUP CUSTOM / 빈 단계), `pickTransitionFor`(0·1·2개, 다른 목적 상태 섞임).

### 3.3 `judge.js`

`ValidatorCode.REJECT_AUTO_REQUESTED`, `REJECT_AUTO_REQUESTED_NONAME` 추가만. `judgeTransition` 의 행 순서·결과는 **무변경**(완료 기준). 서비스가 규칙 없음 조기 반환을 위해 `judgeTransition({...base, tablesReady:true, issue:{issueId}, rule:null})` 대신 쓸 순수 상수 `noRuleVerdict = pass(PASS_NO_RULE)` 를 export 한다(판정 표의 "규칙 없음 → PASS_NO_RULE" 행과 같은 값).

---

## 4. 백엔드

### 4.1 KVS 저장소 설계

**엔티티 `transition-rules`** (manifest `app.storage.entities`, attributes `gen: integer`, `body: any` — `channel-state` 와 같은 모양). @forge/kvs 2.0.4 의 transaction 조건은 엔티티에만 걸린다(ChannelState 머리 주석) → 엔티티를 쓴다.

| 키 | 값 | 쓰는 쪽 | 읽는 쪽 |
|---|---|---|---|
| `p:{projectId}` | `{gen, body: ProjectRecord}` — 원천 | 규칙 resolver | 화면·이슈 화면·validator(규칙 적중 후보일 때만)·executor |
| `s:{toStatusId}` | `{gen, body:{projects:{[projectId]: projectKey\|null}}}` — **파생 색인**, enabled 규칙이 그 상태를 가진 프로젝트 | 규칙 resolver 만 | validator 첫 읽기 |

**일반 KVS 키**(엔티티 아님, 조건부 쓰기 불필요): `transitionRule:seen:{projectId}:{toStatusId}` → `{at:number}`(§6.3).

**크기**: 규칙 1개 직렬화 약 300B → 200개 ≈ 60KB(< KVS 값 240KiB). 색인: 프로젝트당 ≈ 20B → 5,000 프로젝트 ≈ 100KB. 한도 초과 시 `TRANSITION_RULE_LIMIT`(색인은 `indexProjects` 넘으면 저장 거부 — 실제로는 도달 불가).

**원자성 (색인 ⊇ 실제 규칙 — fail-open 방지가 목표)**

validator 는 색인만 보고 "규칙 없음 → 통과"를 결정한다. 따라서 **색인이 실제보다 작아지는 순간(stale-negative)이 곧 무단 통과**다. 반대로 색인이 큰 것(stale-positive)은 이슈 조회 1회가 더 들 뿐 판정은 맞다.

- **1안(기본, K1 통과 시)**: `kvs.transact()` 한 번에 `p:{projectId}` 조건부 set(gen 일치, 처음은 gen notExists) + 바뀐 `s:{to}` 각각 조건부 set(각자 읽은 gen). 하나라도 조건 실패(`CONDITIONAL_CHECK_FAILED`) → 전부 다시 읽고 재계산, 최대 3회 → `CONCURRENT_MODIFICATION`.
- **2안(K1 실패 — 다중 키 transaction 불가·작업 수 한도 미달 시)**: 순서로 불변식을 지킨다.
  1. **추가할 상태 색인 먼저** CAS(단일 키 transact — S20 실측된 형태)
  2. 프로젝트 기록 CAS
  3. **제거할 상태 색인은 마지막에**, 그리고 제거 직전에 프로젝트 기록을 **다시 읽어** 그 상태의 enabled 규칙이 정말 없을 때만 CAS 제거. 제거 뒤 한 번 더 읽어 gen 이 바뀌었고 그 상태 규칙이 생겼으면 다시 추가(보상).
  2 에서 실패하면 1 의 추가분은 남긴다(stale-positive, 안전). 다음 저장 때 `indexDiff` 가 정리한다.
- 두 안 모두 `createEntityCas` 를 일반화한 `src/rdb/kvs/EntityCas.js`(이름 제안)로 뽑아 ChannelState 와 공유하지 **않는다** — ChannelState 는 검수가 끝난 코드라 건드리지 않는다. 같은 패턴을 `TransitionRuleStore` 안에 둔다.

**캐시**: validator 는 **교차 호출 메모를 두지 않는다**(규칙 저장은 다른 컨테이너에서 일어나 무효화할 수 없고, 음성 메모는 그대로 fail-open 창이 된다). 한 invocation 안에서는 `memo('transitionRules:p:{id}')` 로 1회. 화면 resolver 도 invocation memo 만.

### 4.2 `TransitionRuleRepository` (KVS 판으로 교체 — 같은 파일 이름, 같은 default export)

| 메서드 | 동작 | KVS |
|---|---|---|
| `ready()` | 항상 `true`(KVS 는 마이그레이션이 없다). `assertReady()` no-op | 0 |
| `statusIndex(toStatusId)` **신규** | `s:{to}` get → `Map<projectId, projectKey>`(없으면 빈 Map). 읽기 실패는 던진다(validator 가 REJECT_UNAVAILABLE) | 1 |
| `loadProject(projectId)` **신규** | `p:{id}` get → `{gen, record}`(없으면 `{gen:null, record: empty}`) | 1 |
| `findForProject(projectId)` | `loadProject` 의 `record.rules` 에 projectId 를 붙여 반환(기존 shape: `ruleId, projectId, issueTypeId, toStatusId, flowId, enabled, issueTypeName, toStatusName, updatedAt, updatedBy:null, rev` + `autoRequest`) | 1 |
| `findById`·`findByKey` | `findForProject` 에서 찾는다(호출부가 projectId 를 안다 — 시그니처에 projectId 추가) | 1 |
| `insert`·`update`·`delete` | `ruleStore.applyRuleSave/Delete` + §4.1 커밋. 오류 매핑: CONFLICT→`TRANSITION_RULE_CONFLICT`, STALE→`CONCURRENT_MODIFICATION`, NOT_FOUND→`INVALID_TARGET`, LIMIT→`TRANSITION_RULE_LIMIT` | 읽기 1+k, 쓰기 1 transact |
| `saveDefaults`·`setup` **신규** | `applyDefaults`·`applySetup` + 커밋 | 동일 |
| `findByStatus` | **삭제**(SQL 시절 validator 전용). 호출부는 `statusIndex` + `findForProject` | — |

`projectKey` 는 규칙 저장 때 `projectMeta.project.projectKey` 로 기록·색인에 함께 쓴다(§6.3 의 기능 끔 관찰에만 쓴다 — 판정에는 안 쓴다).

### 4.3 검사(validator) 새 흐름 — `TransitionValidatorService.evaluate`

```
0. parse(payload)                                    (기존)
1. 병렬: featureEnabled(KVS) · globalEnabled(KVS) · rules.statusIndex(p.toStatusId)(KVS, to 있을 때만) · licenseBlocked(context)
2. feature off / global off / license INACTIVE → 기존 PASS_*                      ← 기능 끔이어도 §6.3 관찰(best-effort)은 여기서
3. issueId·issueKey 둘 다 없음 → PASS_NO_ISSUE (기존)
4. to 없음 → 기존 경로(asApp 이슈 → projectEnabled → REJECT_TARGET_UNKNOWN/PASS_PROJECT_DISABLED) — 무변경
5. 색인이 비었다 → noRuleVerdict  ★ SQL 0 · Jira 0
6. asApp 이슈 조회(issueForValidator, 기존 사유 transition-validate)  — Jira 1
   이슈 없음 → PASS_NO_ISSUE
7. issue.projectId ∉ 색인 → noRuleVerdict  ★ SQL 0 · Jira 1
8. rules.findForProject(projectId)(KVS 1) → matchRule → 없음 → noRuleVerdict  ★ SQL 0
9. tablesReady(['transition_request','approval_request'])  (transition_rule 제외)
   미준비 → PASS_NOT_READY (B11)
10. 병렬: projectEnabled(KVS 1~2 + SQL 0~1) · transitions.findCandidates(SQL 1) · seen 갱신(KVS 1~2, best-effort, §6.3)
11. judgeTransition(기존 표) → NEED_CHANGELOG·PASS_ARM 처리(기존)
12. verdict.code === REJECT_NO_REQUEST → autoRequest.tryCreate(...) (§4.4) → 결과로 verdict 교체
```

변경 요점: 테이블 준비 확인(information_schema SQL 가능)은 **9 단계로 이동**(규칙 적중 때만). 기존 1 단계의 `['transition_rule', ...]` 확인은 삭제. 이 이동으로 "규칙 없음 + 테이블 미준비"의 로그 코드가 `PASS_NOT_READY` → `PASS_NO_RULE` 로 바뀐다(둘 다 통과 — 동작 차이 없음).

**호출 수 표 (validator 1회)**

| 경우 | KVS | SQL | Jira |
|---|---|---|---|
| 기능 끔(대부분 설치의 현재 상태) | 3 (+관찰 0~2) | 0 | 0 |
| 목적 상태에 규칙 없음(색인 미스) | 3 | **0** | **0** |
| 색인 적중, 다른 프로젝트 이슈 | 3 | **0** | 1 (asApp 이슈) |
| 프로젝트 적중, 유형 불일치 | 4 | **0** | 1 |
| 규칙 적중, 승인 없음, 자동 요청 끔 | 4 + 1~2(projectEnabled) + 1~2(seen) | 0~2(readiness) + 1(candidates) + 0~1(project_config) | 1 |
| 규칙 적중, 승인됨(무장 첫 통과) | 위 + 0 | 위 + 1(arm) | 1 |
| 규칙 적중, 무장 재통과(changelog) | 위 | 위 + 0~1(consume) | 2~3 |
| **자동 요청 생성** | 위 + 2(registry·privacy) + 승인그룹 0 | 위 + flow 1~2 + 승인그룹 0~1 + draft 1 + createRequest ≈ 7(expire select·update, revision, insert, approvers, event, inbox, commit) ≈ **12~15** | 위 + 1(`/user`) + 결재자 수 N(viewissue, 병렬 6, N ≤ 10) |

### 4.4 자동 요청 — `TransitionAutoRequestService` (신규 `src/resolver/transition/TransitionAutoRequestService.js`)

**생성 경로 함수 재사용 지도 (validator 안 asUser 금지 확인)**

| 수동 경로(`TransitionService.createTransitionApproval` → `ApprovalService.createForTarget`) | Jira 호출 | 자동 경로에서 |
|---|---|---|
| `requirePrincipal` | — | 쓰지 않음. 요청자 = payload `user.accountId`(Forge 가 준 값, 클라이언트 값 아님) |
| `reader.issueWithTransitions` | **asUser** | ✗ → validator 가 이미 읽은 asApp `issueForValidator` 결과 재사용(projectId·issueTypeId·currentStatusId·issueKey) |
| `featureEnabled`·`globalEnabled`·`projectEnabled`·`tablesReady` | — | validator 가 이미 판정 — 재호출 없음 |
| `matchRule(findForProject)` | — | validator 의 rule 재사용 |
| `findCandidates` + usability | SQL | validator 의 candidates 재사용(이미 REJECT_NO_REQUEST 로 판정) |
| `getFlowForRequest(rule.flowId, projectId)` | SQL | ✓ 재사용 |
| `approvals.expandRequestedSteps(rawStepsOf(flow))` | `GROUP:` → `loadGroupMembersByName` **asUser**, JIRA 유형 `AGROUP:` → **asUser**, CUSTOM `AGROUP:` → SQL | **사전 판정** `flowAutoCapability` 로 asUser 가 필요한 단계가 있으면 시도 전에 `GROUP_FLOW` 로 포기. 통과한 결재선만 `expandRequestedSteps` 호출(→ asUser 경로에 닿지 않음이 보장됨) |
| `adapter.describe(target)` (createForTarget 이 snapshot 없을 때) | **asUser** | ✗ → `knownSnapshot` 을 직접 구성: `{title:'', issueId, issueKey(payload/asApp), projectId, projectKey:null, projectName:null, revision:null, transition:{transitionId:null, transitionName:null}}` (B9) |
| `assertApproversAllowed` → `privacy.assertOpen`(KVS) · `registryLoader`(KVS) · `policyLoader`(KVS) · `adapter.userCanView` | userCanView = **asUser** viewissue | privacy·registry·policy ✓ 그대로(같은 함수 호출). userCanView ✗ → 신규 `AutoRequestApproverAccess.canView(issueKey, accountId)` asApp `user/viewissue/search`(사유 `transition-auto-request-approver`, B6) |
| `expandCc` | asUser(그룹) | ✗ cc = [] |
| `supersede` | SQL | ✗ 없음 |
| `repository.createRequest(...)` | SQL | ✓ **직접 호출**(워크로그 자동 요청 선례 `WorklogRequestService.submit`), `systemRequested:true`(REQUESTED 이벤트 actor = null → "자동 요청" 표시), `requester = accountId`, `requestMessage:null`, `flowId: rule.flowId`, `expiresAt` = flow 기본 마감일수 |
| `notifyExternal` → `TransitionCommentNotifier` | **asUser** 코멘트 | ✗ 부르지 않음(배경 경로 규칙과 같음 — `background:true` 와 동치) |
| `transitions.insertDraft` / `deleteOrphan` | SQL | ✓ 재사용. `transitionId:null`, `fromStatusId = p.fromStatusId ?? issue.currentStatusId`, `toStatusName = rule.toStatusName` |

→ **자동 경로의 Jira 호출은 asApp 3종뿐**: `issueForValidator`(기존), `/user`(신규 사유 `transition-auto-request-actor`), `user/viewissue/search`(신규 사유 `transition-auto-request-approver`, + 그 API 가 issueKey 를 요구하므로 payload/asApp 의 issueKey 사용 — 추가 조회 없음). `ApprovalService.createForTarget` 은 부르지 않는다(엔진 무변경).

`RequestJira` 에 validator 실행 표시가 없으므로, 회귀 방지는 **테스트로 고정**한다: `TransitionAutoRequestService.test.js` 에서 asUser 주입 모의 객체가 한 번이라도 불리면 실패.

**순서·시간 예산**

```
tryCreate({ p, issue, rule, defaults, verdict, startedAt, now })
  gate = autoRequestGate(...)            startByMs = 1500 (validator 시작 기준)
  if !gate.go → return fallback(reason)
  준비(쓰기 없음, 상한 1200ms — 넘으면 LATE):
    병렬: humanActorOf(asApp /user) · getFlowForRequest · approvalGroups 목록(CUSTOM 판정용)
    사람 아님/모름 → NOT_HUMAN|ACTOR_UNKNOWN,  flow 없음 → FLOW_MISSING,  flowAutoCapability ✗ → GROUP_FLOW
    steps = expandRequestedSteps(rawStepsOf(flow))
    privacy.assertOpen([accountId, ...approvers]) · registry 검사 · (policy.approverAccessCheck !== false) 결재자 asApp 열람 확인
    false 하나 → APPROVER_ACCESS
  쓰기 시작 조건: 경과 ≤ 2200ms (아니면 LATE — 쓰기 없이 포기)
  쓰기(중간에 끊지 않는다 — 끝까지 await):
    insertDraft → createRequest(systemRequested) → 실패 시 deleteOrphan
    ALREADY_OPEN → verdict REJECT_PENDING
    성공 → { decision:REJECT, code:REJECT_AUTO_REQUESTED, requestId, statusName: rule.toStatusName }
  그 밖 예외 → FAILED → 기존 REJECT_NO_REQUEST
```
- validator 전체 마감 `VALIDATOR_BUDGET_MS = 4000` 은 그대로. 쓰기 단계 예상 0.5~1.0초(SQL ≈ 10회)라 2200ms 에 시작해도 마감 안에 끝난다. 외곽 마감이 쓰기 중에 걸리면 기존대로 `REJECT_UNAVAILABLE`(통과 아님 — 안전). 
- **잔존 DRAFT 위험(기존 엔진 갭)**: `createRequestLive` 가 DRAFT 삽입 뒤 커밋 전에 런타임이 멈추면 `dedupe_key` 를 쥔 DRAFT 가 남아 이후 수동·자동 생성이 모두 `ALREADY_OPEN` 이 된다(정리 경로 없음 — grep 확인). 이번 설계는 "쓰기 시작 마감"으로 확률을 낮추기만 한다. 엔진 정리는 범위 밖 → §10 R1, 백엔드는 보고서에 기록.
- 실패는 절대 던지지 않는다(validator 규칙). 로그는 `[VALIDATOR] auto <AutoSkip|CREATED>` 코드만.

**사람/자동화 판별(B4)**: `humanActorOf` — asApp `GET /rest/api/3/user?accountId={payload user.accountId}`(채널 `channel-actor-verify` 와 같은 API, 실측 0.6초·`active` 제공 S8). `accountType` 필드 존재는 문서 기준(미실측 → A2). invocation memo.

### 4.5 `TransitionService` 변경

- `listTransitionRules`: `rules.loadProject` 로 기록·gen, `projectDefaults`, `setup`, 템플릿(`settings.getStatusChangeProjectTemplate()`), `flows[].autoRequestCapable`(승인 그룹 목록 SQL 1 + `flowAutoCapability`), `rules[].autoRequestEffective/BlockedReason`, `validatorSeenAt`(§6.3 batchGet). `ready` 분기 삭제(KVS 항상 준비).
- `saveTransitionRule`: `autoRequest` 입력 검증(`true|false|null|undefined`), `findById/findByKey` 에 projectId 전달. 감사 `detail` 에 `autoRequest` 추가. `projectKey` 를 기록에 저장.
- 신규 `saveTransitionProjectDefaults`, `setupTransitionProject`: 둘 다 `requirePrincipal`, projectMeta 로 상태·유형 검증(기존 `saveTransitionRule` 검증 재사용 — 상태별 루프는 같은 meta 1회), flow 는 `availableFlows(projectId)`. 감사 `area:'transitionRule'`, action `defaults` / `setup`(`recordSettingsAudit`, SQL 1).
- `getIssueTransitionApprovals`: `rules.findForProject` 가 KVS 가 됨(호출부 무변경). `history[].autoRequested` 는 `transitions.listForIssue` 가 REQUESTED 이벤트 actor 를 이미 주지 않으므로 — **`approval_request.requester_key` 와 REQUESTED 이벤트의 `actor_key IS NULL` 여부**를 `listForIssue` SELECT 에 서브쿼리 1열로 추가(같은 쿼리, SQL 수 무변경).
- `createTransitionApproval`: 무변경(rules 소스만 KVS).

### 4.6 `TransitionExecutor` / `TransitionOfflineGateway` (B7)

- `ruleRepo.findForProject` — KVS 판(무변경 호출).
- `gateway.preflight(row)`: `row.transitionId` 가 null 이면 이미 받은 요청자 전환 목록에서 `pickTransitionFor(transitions, row.toStatusId)` → `{code:null, transitionId}` 또는 `TRANSITION_NOT_AVAILABLE`/`TRANSITION_AMBIGUOUS`. 선택된 전환의 필수 필드 검사(`SCREEN_FIELDS_REQUIRED`)는 그 전환에 그대로.
- executor 는 preflight 가 돌려준 `transitionId` 를 `applyUpdate` 로 `transition_id`·`transition_name` 에 기록(컬럼 맵에 `transitionId:'transition_id'`, `transitionName:'transition_name'` 추가 — 컬럼은 이미 있음, SQL 수 무변경: 기존 "POST 시작 표시" UPDATE 에 합친다) 후 `post({...row, transitionId})`.
- 새 apply 코드 `TRANSITION_AMBIGUOUS` 는 `applyPlan.js` 의 재시도 가능 목록에 넣지 않는다(요청자 직접 전환).

### 4.7 정책 키·`SettingsRepository`

| 키 | KVS 키 | 기본 | 분류 | 판정 함수 |
|---|---|---|---|---|
| `statusChangeTemplateFlowId` | `approval:settings:statusChangeTemplateFlowId` | `''` | GLOBAL_ONLY | `getStatusChangeProjectTemplate()` |
| `statusChangeTemplateAutoRequest` | `approval:settings:statusChangeTemplateAutoRequest` | `false` | GLOBAL_ONLY | 〃 → `{flowId: uuid\|null, autoRequest: boolean}` |

- `DEFAULT_APPROVAL_SETTINGS`·`SETTINGS_KEYS`·`GLOBAL_ONLY_KEYS` 세 곳 동시(계약 테스트가 대조). 저장 검증: flowId 는 `''` 또는 UUID, autoRequest 는 boolean(그 밖 `INVALID_TARGET`).
- 템플릿 flowId 가 특정 프로젝트에 적용 안 되는 결재선이면 초기 세팅 화면이 미리 선택하지 않는다(서버는 저장 때 `availableFlows(projectId)` 로 다시 거른다).
- **자동 요청 판정은 SettingsRepository 를 거치지 않는다**: 값의 원천은 프로젝트 기록(`defaults.autoRequest`)과 규칙(`autoRequest`)이고, 판정 함수는 순수 `effectiveAutoRequest` 하나. 사이트 기본값 = 끔(템플릿 기본 false, 기록 없음 = false).

### 4.8 resolver 등록 3단계 (신규 2개)

1. `TransitionController`: `guardedDefine(resolver, 'saveTransitionProjectDefaults', ...)`, `'setupTransitionProject'`
2. `PermissionMap`: 두 이름 `{ project: 'admin', projectIdKey: 'projectId' }`
3. `CONTROLLER_REGISTRARS`: `registerTransitionController` 이미 등록 — 무변경. 계약 테스트 통과 확인

---

## 5. 스키마·저장소

### 5.1 SQL
마이그레이션 **없음**. `transition_rule`(v029) 는 DDL 유지·코드 미사용. `PersonalDataRepository` 의 `columns('transition_rule', ['updated_by'])` 는 남겨 둔다(옛 dev 행의 계정 id 정리 경로 유지, 비용은 개인정보 스윕 때만).

### 5.2 manifest
```yaml
app:
  storage:
    entities:
      - name: channel-state      # 기존
        ...
      - name: transition-rules   # 신규
        attributes:
          gen: { type: integer }
          body: { type: any }
```
scope·egress 무변경. 엔티티 추가가 major 인지 미검증(K0) — 배포 출력 확인. major 로 나오면 `--approve MAJOR_VERSION_RULE` 로 dev 에만(고객 배포 전).

### 5.3 용량
200명·프로젝트 50개·프로젝트당 규칙 5개 가정: 프로젝트 기록 50 × 1.5KB = 75KB, 색인 ≤ 50 키 × 수백 B, seen 키 250개 × 30B. 연 증가 없음(설정). SQL 행 증가는 요청·결재만(기존과 같음 — 자동 요청으로 요청 수가 늘 수 있으나 "막힌 시도 1회당 최대 1건, 열린 요청 하나" 상한).

### 5.4 개인정보
KVS 기록에 accountId 를 두지 않는다(`updatedBy` 없음 → RuleView `updatedBy:null`). 누가 바꿨는지는 `recordSettingsAudit`(SQL, 기존 개인정보 처리 경로)에 남는다.

---

## 6. Jira 연결

### 6.1 모듈
무변경: `jira:workflowValidator transition-approval-validator`, `jira:projectSettingsPage`, `jira:adminPage`, issueAction.

### 6.2 REST

| 호출 | 경로 | 컨텍스트 | 사유 |
|---|---|---|---|
| 이슈 프로젝트·유형·상태 | `GET /issue/{id}?fields=project,issuetype,status` | asApp (validator) | `transition-validate`(기존) |
| 실행자 사람 판별 | `GET /user?accountId=` | asApp (validator, 자동 요청 시) | **`transition-auto-request-actor`**(신규) — 결과 boolean 만, 로그·응답 없음 |
| 결재자 이슈 열람 | `GET /user/viewissue/search?issueKey&accountId&maxResults=1` | asApp (validator, 자동 요청 시) | **`transition-auto-request-approver`**(신규) — CLAUDE.md 불변식 8 의 asApp 타 사용자 조회 조건 ⓒⓓ(판정에만, 정확히 그 한 명일 때만 true — 빈 목록·오류·시간 초과는 거부 = 자동 요청 안 함) 준수. ⓐ(subject 가 actor 이거나 서버가 정한 대상)는 "서버가 규칙 결재선에서 정한 결재자"로 해석 — 워크로그 `worklog-approval-approver-access` 선례와 같다 |
| 프로젝트 메타 | `GET /project/{id}`, `/project/{id}/statuses` | asUser | 기존 |
| 요청자 전환 목록·POST | offline `asUser(accountId)` | executor | 기존(`TransitionOfflineGateway`) |

AGENTS.md 보안 4번 문장에 두 사유를 추가하는 것은 **백엔드 작업 항목**이다(규약상 asApp 확장은 사유를 여기 적어야 한다).

### 6.3 검사 연결 감지 — 이번: "호출 관찰", 후속: 워크플로 스캔

**후속으로 미루는 이유(B10)**: 목적 상태로 가는 전환과 그 validator 목록을 읽으려면 워크플로 조회 API(`POST /rest/api/3/workflows` 또는 `GET /rest/api/3/workflows/search` + 프로젝트→워크플로 스킴 `GET /rest/api/3/workflowscheme/project`)가 필요하고, 문서상 scope 는 classic `manage:jira-configuration`(granular `read:workflow:jira` 의 Forge 선언 가능 여부 미검증)이다. 현재 manifest 에 없다 → scope 추가 = major + 설치 재동의 + 마켓 동의 화면에 "Jira 설정 관리" 노출. team-managed 워크플로는 별도 형태(미검증). → 비용 큼. 결정이 나면 `W1~W3` 스파이크(§10) 후 `getTransitionValidatorCoverage` resolver 하나로 추가한다.

**이번에 하는 것 — 관찰 표시(scope 0)**:
- validator 가 규칙 적중 경로(4.3 의 10단계)에서 `transitionRule:seen:{projectId}:{toStatusId}` 를 읽어 12시간보다 오래됐거나 없으면 `{at: now}` 로 쓴다(best-effort, 실패 무시, 판정 무관).
- **기능 끔** 경로에서도(관리자가 켜기 전에 연결을 확인할 수 있게): 색인에 그 상태가 있으면 payload `issue.key` 의 접두(프로젝트 키)를 색인 값의 projectKey 와 대조해 **하나로 맞을 때만** 같은 seen 키를 쓴다. Jira·SQL 0. 판정은 그대로 `PASS_FEATURE_DISABLED`. (프로젝트 키를 판정에 쓰지 않는 이유: 키 변경 시 낡을 수 있다 — 표시용이라 괜찮다.)
- 화면은 규칙별 `validatorSeenAt` 으로 "검사 호출 확인됨 · {날짜}" / "아직 확인 안 됨 — 이 상태로 한 번 전환해 보세요" 를 보인다. **"누락 N개"는 보이지 않는다**(같은 상태로 가는 다른 전환에 검사가 빠졌는지는 관찰로 알 수 없음) — 안내 문구에 그 한계를 그대로 적는다(기존 `guide.enforcementLimits` 문장 유지).
- 읽기: `kvs.batchGet` 으로 규칙 수만큼. **`KEY_NOT_FOUND` 는 "없음"으로**(CLAUDE.md 함정 — 실패로 보면 화면이 죽는다). 실패 키는 null.

---

## 7. 프론트

### 7.1 엔트리
새 엔트리 없음 → craco ENTRIES·public html·manifest resources 무변경.

### 7.2 화면 트리 — `entries/projectSettings.jsx`

```
ProjectSettingsApp
 ├ IssueExceptionList (무변경)
 └ TransitionRuleSettings (변경)
    ├ (setup.completed=false 이고 rules 0개) → TransitionProjectSetup (신규, 4단계)
    │    1 목적 상태 고르기  — statuses 체크박스(최대 10, statusCategory 'done' 미리 선택), 이슈 유형 '전체' 기본(고급: 유형 하나)
    │    2 결재선           — flows 셀렉트, template.flowId 가 목록에 있으면 미리 선택, autoRequestCapable=false 면 경고
    │    3 자동 요청        — 토글(template.autoRequest 미리 선택), 설명 "막힌 사람 이름으로 승인 요청을 바로 올립니다"
    │    4 검사 연결 안내   — guideKey(style) 문구 + "저장 뒤 이 상태로 한 번 전환해 보세요" + [저장] → setupTransitionProject
    │    [건너뛰고 직접 규칙 추가] → 기존 표(빈 상태)
    ├ ProjectDefaultsRow (신규) — "자동 요청 기본값" 토글 → saveTransitionProjectDefaults
    ├ 기존 안내 SectionMessage 들
    ├ CommonTable 규칙 표 — 열 추가: "자동 요청"(기본값 따름(켬)/켬/끔 + 불가 경고 Lozenge), "검사 연결"(seen Lozenge)
    └ TransitionRuleFormModal — 필드 추가: 자동 요청 셀렉트 [프로젝트 기본값 따름 / 켬 / 끔] → saveTransitionRule.autoRequest(null/true/false)
```
- 저장 후 `transitionKeys.rules(projectId)` 무효화(기존 refresh). 신규 쿼리키 없음.
- 기능 끔(`featureEnabled=false`)이어도 세팅·편집 허용(기존 원칙 — 켜기 전 준비). 단계 4 에 "앱 설정에서 상태 변경 승인을 켜야 실제로 막습니다" 한 줄.
- 오류는 `error.code` 로: `TRANSITION_RULE_LIMIT`, `CONCURRENT_MODIFICATION`(다시 불러오기 안내), `INVALID_APPROVER_CONFIGURATION`.
- 디자인 규칙: `SettingsSection`·`SettingsRows`·토큰만, 안내문 2문장, 폼 너비 720px(settings-design).

### 7.3 앱 설정 — `features/settings/IssueApprovalSettings.jsx`
`StatusChangeFeatureSection` 아래 새 섹션 `StatusChangeTemplateSection`: 결재선 셀렉트(flowLister — 기존 `getRequestDefaults`(projectId 없이) 의 flows 재사용, "선택 안 함" 포함) + 자동 요청 토글 → `saveApprovalSettings` 부분 patch 2키. 성공 시 `settingsKeys.policy()` setQueryData(기존 패턴).

### 7.4 이슈 화면
`StatusChangeApprovalCard`·`TransitionApprovalList` 의 이력 행에서 `autoRequested=true` 면 "검사에서 자동으로 요청함" 작은 배지(`transition.list.autoRequested`). 그 외 무변경.

### 7.5 재사용
`SettingsSection`, `CommonTable`, Atlaskit `Checkbox`·`Select`·`Toggle`·`ProgressTracker`(단계 표시 — 없으면 번호 Heading), `tFormat`, `transitionModel.guideKey`.

---

## 8. i18n (kr / en) — `locales/{kr,en}/*.json`, 프론트 merge 그대로

| 네임스페이스.키 | kr | en |
|---|---|---|
| `transition.server.validator.REJECT_AUTO_REQUESTED` | 승인 요청을 올렸습니다. 승인되면 '{statusName}'(으)로 자동 전환을 시도합니다. 바뀌지 않으면 승인 뒤 다시 전환하세요. | Approval requested. Once approved, we'll try to move the issue to '{statusName}' automatically. If it doesn't move, try the transition again after approval. |
| `transition.server.validator.REJECT_AUTO_REQUESTED_NONAME` | 승인 요청을 올렸습니다. 승인되면 자동 전환을 시도합니다. 바뀌지 않으면 승인 뒤 다시 전환하세요. | Approval requested. Once approved, we'll try to apply this transition automatically. If it doesn't, try again after approval. |
| `transition.rules.setup.title` | 상태 변경 승인 시작하기 | Set up status change approval |
| `transition.rules.setup.step.statuses` | 승인을 받을 상태 고르기 | Choose statuses that need approval |
| `transition.rules.setup.step.flow` | 결재선 고르기 | Choose an approval flow |
| `transition.rules.setup.step.autoRequest` | 막힐 때 자동 요청 | Auto-request when blocked |
| `transition.rules.setup.step.validator` | 워크플로에 검사 연결 | Connect the workflow check |
| `transition.rules.setup.statusesHint` | 최대 {max}개까지 고를 수 있습니다. | You can choose up to {max}. |
| `transition.rules.setup.autoRequestHint` | 승인 없이 전환하려다 막히면 그 사람 이름으로 승인 요청을 바로 올립니다. | When someone is blocked, an approval request is filed in their name right away. |
| `transition.rules.setup.validatorHint` | 저장한 뒤 이 상태로 한 번 전환해 보세요. 검사가 연결돼 있으면 아래 표에 '확인됨'이 표시됩니다. | After saving, try one transition to this status. If the check is connected, the table shows "Seen". |
| `transition.rules.setup.featureOff` | 앱 설정에서 상태 변경 승인을 켜야 실제로 막습니다. | Turn on status change approval in app settings to enforce it. |
| `transition.rules.setup.save` | 저장하고 시작 | Save and start |
| `transition.rules.setup.skip` | 직접 규칙 추가 | Add rules manually |
| `transition.rules.setup.skipped` | 이미 있는 규칙 {count}개는 건너뛰었습니다. | Skipped {count} existing rule(s). |
| `transition.rules.autoRequest.column` | 자동 요청 | Auto-request |
| `transition.rules.autoRequest.inherit` | 프로젝트 기본값 따름 | Use project default |
| `transition.rules.autoRequest.inheritOn` | 기본값(켬) | Default (on) |
| `transition.rules.autoRequest.inheritOff` | 기본값(끔) | Default (off) |
| `transition.rules.autoRequest.projectDefault` | 자동 요청 기본값 | Auto-request default |
| `transition.rules.autoRequest.groupFlow` | 이 결재선은 Jira 그룹이 있어 자동 요청을 만들 수 없습니다. | This flow includes a Jira group, so auto-requests can't be created. |
| `transition.rules.autoRequest.flowMissing` | 결재선을 찾을 수 없어 자동 요청을 만들 수 없습니다. | The flow is missing, so auto-requests can't be created. |
| `transition.rules.seen.column` | 검사 연결 | Check connected |
| `transition.rules.seen.yes` | 확인됨 · {date} | Seen · {date} |
| `transition.rules.seen.no` | 아직 확인 안 됨 | Not seen yet |
| `transition.rules.seen.hint` | 이 상태로 전환할 때 검사가 실제로 호출됐는지만 보여 줍니다. 다른 전환에 검사가 빠졌는지는 워크플로에서 직접 확인하세요. | Shows only whether the check ran on a transition to this status. Check other transitions in the workflow editor. |
| `transition.list.autoRequested` | 검사에서 자동으로 요청함 | Auto-requested by the check |
| `transitionApply.code.TRANSITION_AMBIGUOUS` | 이 상태로 가는 전환이 여러 개라 자동으로 고를 수 없습니다. 직접 전환하세요. | Several transitions lead to this status, so it couldn't be chosen automatically. Transition it yourself. |
| `policy.statusChange.template.title` | 새 프로젝트 기본값 | Defaults for new projects |
| `policy.statusChange.template.description` | 프로젝트 설정에서 상태 변경 승인을 처음 시작할 때 미리 채워 둘 값입니다. 이미 시작한 프로젝트는 바뀌지 않습니다. | Prefilled when a project first sets up status change approval. Projects already set up don't change. |
| `policy.statusChange.template.flow` | 기본 결재선 | Default flow |
| `policy.statusChange.template.flowNone` | 선택 안 함 | None |
| `policy.statusChange.template.autoRequest` | 자동 요청 기본으로 켜기 | Turn on auto-request by default |
| `error.TRANSITION_RULE_LIMIT` | 규칙 수 한도를 넘었습니다. | Rule limit exceeded. |

(키 이름은 기존 파일 구조에 맞춰 프론트가 조정 가능 — 바꾸면 이 표를 갱신. `apply` 코드 라벨의 실제 위치는 `transitionApply.json` 기존 코드 키 옆.)

---

## 9. 용량·호출량

- **validator**: §4.3 표. 핵심 — 규칙 없는 목적 상태 SQL 0·Jira 0(기존 SQL 1 + readiness 0~3 → 0). 기능 끔도 SQL 0.
- **유휴 SQL**: 새 스케줄·큐 작업 **없음**. 사용자 0명·이벤트 0건일 때 이 기능의 SQL = 0. 기존 `idleSqlBudget.test.js` 무변경 통과가 기준.
- **프로젝트 설정 화면 1회**(`listTransitionRules`): Jira asUser 2(projectMeta) · KVS 1(기록) + 2(템플릿) + 1(seen batchGet) + 1~2(projectEnabled) · SQL: flows 1~2, openCounts 1, 승인 그룹 1 (기존 대비 rule SELECT 1 감소, 승인 그룹 1 증가).
- **저장 1회**: KVS 읽기 1 + k(색인), transact 1, Jira asUser 2(meta), SQL flows 1~2 + 감사 1 + openCounts 1.
- **이슈 화면**(`getIssueTransitionApprovals`): rule SELECT 1 → KVS 1.
- 자동 요청 1건: SQL ≈ 12~15, Jira asApp 2 + N.

---

## 10. 미검증 (상세 `04_spike_todo.md`)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| K0 | 엔티티 `transition-rules` 추가가 major 인가 | 배포 절차 | `forge deploy -e development` 출력 |
| K1 | `kvs.transact()` 다중 키(엔티티 set 여러 개 + 각 조건) 지원·작업 수 한도 | 원자성 1안/2안 선택 | dev 진단 resolver(임시) 또는 스파이크 앱에서 11 op 조건부 transact, 하나를 틀린 gen 으로 → 전부 미적용 확인 |
| K2 | 엔티티 `get` 읽기 일관성(쓰기 직후 다른 컨테이너 읽기) | 저장 직후 validator 가 옛 색인을 볼 창 | 규칙 저장 직후(1초 내) 전환 → `REJECT_NO_REQUEST` 인지 |
| A1 | payload `user` 의 하위 필드(accountId 외 accountType 등이 오는가) | 오면 `/user` 호출 생략 가능 | `[VALIDATOR] shape` 로그에 `user` 하위 키 이름 추가(값 없음) |
| A2 | asApp `/user?accountId` 의 `accountType`(atlassian/app) — Automation for Jira 계정에서 `app` 인가 | 사람 판별 | 자동화 규칙(실행자 기본)으로 규칙 걸린 전환 → 로그 `auto NOT_HUMAN` |
| A3 | validator 플랫폼 시간 제한(X3/T2) | 자동 요청 예산 | 자동 요청 성공 경로의 `[VALIDATOR]` 시작→끝 시각, 콜드 포함 |
| A4 | asApp `user/viewissue/search` 가 결재자에 대해 validator 안에서 200 | B6 | 자동 요청 성공 여부(`APPROVER_ACCESS` 로 빠지지 않는지) |
| A5 | 보드 드래그·이슈 화면 전환에서 거부 문구(두 줄, 긴 문장)가 잘리지 않고 보이는가 | 사용자가 "요청을 올렸다"를 알아야 함 | 화면 캡처 |
| A6 | 자동 적용 시 요청자 offline impersonation 동의(T8) — 앱 화면을 한 번도 안 연 사용자 | B8 문구의 정확성 | 앱 미사용 계정으로 막힘 → 승인 → `apply` 결과 |
| W1~W3 | (후속) 워크플로 조회 API scope·Forge granular 지원·team-managed 형태 | B10 | 후속 설계 때 |
| R1 | (기존 엔진 갭) DRAFT 잔존 시 dedupe 점유 | 대상 영구 `ALREADY_OPEN` | 코드 확인 완료(정리 경로 없음) — 엔진 수정은 별도 과제로 보고 |

---

## 11. 작업 분해

### backend
- [ ] `domain/transition/ruleStore.js` + 테스트(§3.1)
- [ ] `domain/transition/autoRequest.js` + 테스트(§3.2)
- [ ] `judge.js` 코드 2개 + `noRuleVerdict` export, judge 테스트 무변경 통과
- [ ] `TransitionRuleRepository` KVS 판(§4.2) — 1안 transact, K1 실패 대비 2안 순서 쓰기를 같은 인터페이스 뒤에 두고 플래그 상수로 선택. 메모리 가짜 저장소(조건 실패·`KEY_NOT_FOUND` 동작 동일)
- [ ] `TransitionValidatorService` 순서 변경(§4.3) + seen 관찰 + 자동 요청 호출
- [ ] `TransitionAutoRequestService`(§4.4) + `AutoRequestApproverAccess`(asApp viewissue, 사유 상수) + `IssueStateReader.userForValidator`(asApp /user, 사유 상수)
- [ ] `TransitionService` 확장·신규 resolver 2개·감사(§4.5), `listForIssue` autoRequested 열
- [ ] `TransitionOfflineGateway.preflight`·`TransitionExecutor` 전환 id 미정 처리(§4.6), `applyPlan` 코드
- [ ] `SettingsRepository` 키 2개·`getStatusChangeProjectTemplate()`·저장 검증, 계약 테스트
- [ ] Controller·PermissionMap 등록(§4.8), 계약 테스트
- [ ] `ErrorCodes.TRANSITION_RULE_LIMIT`
- [ ] manifest 엔티티 추가
- [ ] locales `server.validator.*` 2키(kr·en)
- [ ] AGENTS.md 보안 4번에 asApp 사유 2개 문장 추가
- [ ] 테스트(아래)

**테스트 계획(백엔드)**
1. **쿼리 수 고정**: `TransitionValidatorService.test.js` — 색인 미스: `query` 모의 0회·Jira 모의 0회(asApp·asUser 모두); 색인 적중·다른 프로젝트: SQL 0·asApp 1; 유형 불일치: SQL 0; 기능 끔: SQL 0·Jira 0(관찰 경로 포함).
2. 기존 판정 표 회귀: 규칙 적중 경로의 기존 케이스 전부(PASS_APPROVED/ARM/NEED_CHANGELOG/REJECT_*) 같은 결과 — 저장소만 가짜 KVS 로 교체.
3. 자동 요청: 켬 → createRequest 1회·`REJECT_AUTO_REQUESTED`·requestId; 두 번째 시도 → candidates PENDING → `REJECT_PENDING`(생성 0회); 동시 경합 ALREADY_OPEN → `REJECT_PENDING` + deleteOrphan; 실패(throw) → `REJECT_NO_REQUEST` 이고 **`result:false`**; 늦음(clock 주입) → 쓰기 0회; 사람 아님/모름 → 생성 0; GROUP_FLOW → 생성 0·asUser 0; 끔 → 기존 동작; 규칙 덮어쓰기 false 가 프로젝트 기본 true 를 이김.
4. **asUser 0 고정**: 자동 요청 전 경로에서 asUser·`loadGroupMembersByName`·commentNotifier 모의가 호출되면 실패.
5. 저장소: 색인 ⊇ 규칙 불변식(무작위 저장·삭제·토글 500회 후 `indexedStatusesOf(모든 기록) ⊆ 색인`), 조건 실패 재시도 3회, 2안 순서(추가 먼저·제거 나중·재확인).
6. Executor: transitionId null → 1개 POST·기록, 2개 BLOCKED `TRANSITION_AMBIGUOUS`, 0개 `TRANSITION_NOT_AVAILABLE`.
7. 유휴 SQL 예산(`idleSqlBudget.test.js`)·PermissionMap 계약·정책 키 계약 무변경 통과.

### frontend
- [ ] `TransitionProjectSetup.jsx`(신규, §7.2) + 테스트(단계 이동·10개 제한·템플릿 미리 선택·skipped 안내)
- [ ] `TransitionRuleSettings` 열 2개·`ProjectDefaultsRow`·세팅 분기, `TransitionRuleFormModal` 자동 요청 셀렉트
- [ ] `transitionApi.js`: `saveTransitionProjectDefaults`, `setupTransitionProject`, `saveTransitionRule.autoRequest`(null 도 전송 — `undefined` 와 구분)
- [ ] `IssueApprovalSettings` 템플릿 섹션(§7.3)
- [ ] 이슈 카드 이력 `autoRequested` 배지
- [ ] i18n §8 (kr·en), apply 코드 라벨
- [ ] UI 테스트·빌드

## 변경 이력
| 날짜 | 변경 |
|---|---|
| 2026-10-21 | 최초 작성 |
| 2026-10-21 | B6·§6.2 — 결재자 열람 확인은 true 만 허용(오류·비정상·시간 초과 = 자동 요청 안 함), 결재자 명부 조회 실패도 자동 요청 안 함(통합 검증 F1·O1, 리더 결정) |
| 2026-10-21 | §4.4 자동 요청을 validator 안 동기 생성 → **Forge 큐 비동기 생성**으로 변경(dev 실측 A3: 콜드 write 6076ms 로 예산 4000ms 초과, 사용자는 REJECT_UNAVAILABLE 을 보는데 요청은 생김). validator 는 게이트(REJECT_NO_REQUEST·실효 자동 요청·accountId)만 보고 `transition-auto-request-queue` 에 넣고 `REJECT_AUTO_REQUEST_QUEUED` 로 거부(넣기 실패·800ms 초과 → REJECT_NO_REQUEST). consumer `runTransitionAutoRequest` 가 기능·규칙·이슈 현재 상태(asApp 사유 `transition-auto-request-issue` 추가)·기존 판정 표·사람·앱 접근·결재자 자격을 다시 확인해 생성. 코드 REJECT_AUTO_REQUESTED(_NONAME) 삭제 |
| 2026-10-21 | §4.4 consumer 멱등(메시지 at 이후 같은 대상 요청 있으면 상태 무관 건너뜀 — ALREADY_HANDLED)·일시 오류 재시도(InvocationError, 최대 2회, 30초) 추가. manifest function key `transitionAutoReq`(23자 제한) |
