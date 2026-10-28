# linked-mode-fix 설계서 (2026-10-14)

> 범위: R1(승인 앱 ctl 즉시 게시) · R2(워크포스 팀 구조 게시) · R3(승인 앱 수신 측 고정) · R4(워크포스 이슈 패널 제거).
> 새 SQL 테이블·컬럼 없음, 승인 앱 manifest 변경 없음, 워크포스 manifest 는 **모듈·resource 삭제만**.
> 코드 근거는 이 문서 작성 시점(승인 앱 `ccb5aa1`, 워크포스 `03bdfa8`)에서 직접 읽은 것이다.

## 열린 질문 (답 확정 — 2026-10-14 사용자, requirement.md "열린 질문 답")

| # | 질문 | 선택지 | 답 |
|---|---|---|---|
| Q1 | 설정 "전체 재게시(ALL)"에 ctl·flows 문서 재스캔도 포함할까 | 가) 포함 — KVS 워터마크 `approval:link:ctlScan` 삭제 1회(SQL 0) / 나) 범위 밖 | **가) 포함** — R1-b 유지 |
| Q2 | 팀장 A 의 상위 팀에 팀장이 비어 있을 때 A 의 결재자 | 가) 빈 배열 → 본인 결재 / 나) 가장 가까운 조상 팀의 팀장(`nearestAncestorWith`) | **나)** 끝까지 없으면 `leaderKeys:[]` → 본인 결재 |
| Q3 | 일반 팀원의 소속 팀에 팀장이 없을 때 | 가) 빈 배열 → 명부 경로 / 나) 위로 올라가 가장 가까운 조상 팀장 | **나)** Q2 와 같은 규칙. 끝까지 없으면 `[]` → 승인 앱 명부(승인자 선택) 경로 |
| Q4 | 상위 팀장 B 의 `leads[].memberKeys` 에 하위 팀 팀장 A 를 넣을까 | 가) 직속 팀원만 / 나) "결재자가 B 로 계산되는 사람" 전부 | **나)** 결재선·열람 범위 대칭. `approverOf(P) = B` 인 모든 P 를 넣는다(§2 표, §3 `approverOf`). ORG_MAX_MEMBER_KEYS 계산에 포함 |
| Q5 | 팀원(memberKeys) 500 초과 | 가) 게시 실패·로그 / 나) 팀 칸만 비우고 cap 게시 | **가)** |
| Q6 | 명부(단독) 모드 본인 결재(LINKED-ISSUE-SCHEDULE Q16) | 이번 범위에 넣을지 | **범위 밖** — `eligibility` 그대로 |
| Q7 | 워크포스 `worklogOwner` 표식 정리 | 가) 되돌림 / 나) 남김 | **가) 되돌림** — 이미 써진 칸은 무시 |

## 1. 개요·영향 범위

| 구분 | 승인 앱 (`moves-approval-jira`) | 워크포스 (`moves-workforce`) |
|---|---|---|
| 도메인 | 없음 | `integration/approval/orgCap.js` — 순수 함수 `buildOrgTeam`, `orgCapPlan` 확장 |
| resolver/서비스 | `WorklogControlHooks`(새 훅 `ctlTargetChanged`), `WorklogPolicyAuthority`(기본 onLinkChanged), `WorkforcePublisher.publishCtlNow`(요청 id 우선 배출), `WorkforceLinkService.republishWorkforceLink`(R1-b), `WorklogRequestService`(기본 승인자 규칙) | `ApprovalLinkSignals.ensureOrgCap`(팀 칸 채움·memo 키에 epoch), `PermissionController.userPermissionCheck`(앱 열 때 호출), 팀 쓰기 경로에 epoch bump |
| 스키마 | 없음 | 없음(KVS 키 1개 추가: `approvalLink:orgEpoch`) |
| manifest | 없음 | `jira:issueActivity`·`jira:issueContext` 모듈, `resources[issue-panel]` 삭제 |
| 프론트 | 없음(기존 화면이 실데이터를 표시하는지 실측만) | `static/ui/src/panel/**` 삭제(단 `panelApproval.js` 는 이동), craco PANEL 분기·`build:panel` 스크립트·CI artifact 삭제 |
| i18n | 없음 | **건드리지 않음**(사용자 지시 — locales 수정 중). 패널 전용 키는 미사용으로 남는다 |
| 연동 계약 | `rms.org` 본문 형식 무변경(이미 teamKey·leaderKeys·leads 를 받는 계약) | 같은 계약에 실제 값을 채운다 |

## 2. 경계면 계약

새 resolver 없음. 바뀌는 것은 **기존 resolver 응답의 값**과 **앱 간 문서 내용**뿐이다.

| 경계 | 권한 축 | 입력 | 출력(성공) | 실패 | 소비 |
|---|---|---|---|---|---|
| (승인) `listWorklogApprovalCandidates`·`getWorklogCertification`(owner 일 때 내부 호출) → `WorklogRequestService.candidates` | 기존 그대로 | `{issueId, worklogId, query?}` | `{users[], defaultApproverIds[], needsApprover, scope, selfApprovalAllowed}` — **`defaultApproverIds` 규칙 변경**: 상위 팀장이 있으면 상위 팀장만, 없고 `selfApprovalAllowed` 면 `[본인]` | 기존 코드 | 이슈 작업 로그 상세 > 승인 요청 |
| (승인) `getWorklogApprovalIdentity` → `WorklogRequestService.identity` | 기존 | 없음 | `{status, team, leaders[], isWorkforceTeamLead, ledTeams[], selfApprovalAllowed}` — 무변경, 값이 채워짐 | — | 설정 |
| (승인) `listWorkforceTeams` | 기존 `{admin:true}` | 없음 | 무변경, 값이 채워짐 | — | 설정 > 팀 탭 |
| (워크포스) `userPermissionCheck` | PUBLIC(기존) | 없음 | **무변경**(부수 효과로 `ensureOrgCap` 1회, 결과는 응답에 안 싣는다) | ensureOrgCap 실패는 삼킨다 | 앱 부트스트랩 |
| (문서) 사용자 프로퍼티 `movesRms.org` (워크포스 asUser 본인 쓰기 → 승인 앱 서명 검증 후 수신) | — | — | `{teamKey:string\|null, teamName:string(1..120)\|null, leaderKeys:string[≤10], leads:[{teamKey, teamName\|null, memberKeys:string[≤500]}] (≤50), cap:['wlorigin',...], rev}` | `validateBody(TYP.RMS_ORG)` 불통과 → 게시 안 함·로그 `ORG_INVALID` | 승인 앱 `WorkforceInbound.orgOf` → `orgViewOf` |
| (문서) 이슈/프로젝트 프로퍼티 `movesApproval.ctl` | — | — | 무변경 | — | 워크포스 내부 화면(넘김 버튼 등) |

### `movesRms.org` 팀 칸 의미 (R2 확정)

| 칸 | 값 |
|---|---|
| `teamKey` | `users.team_key`(인덱스에 있는 팀만, 없으면 null). 접두 없음 — 승인 앱이 `wf:` 를 붙인다 |
| `teamName` | 그 팀 `name`. 1..120자가 아니면 **null**(표시용 칸이라 null 허용 — 잘라내지 않는다) |
| `leaderKeys` | **결재자** = `approverOf(me)` 가 있으면 `[그 사람]`, 없으면 `[]`. `approverOf(P)`: 출발 팀 = P 가 이끄는 팀이 있으면(`leadingTeamKeyOf`) 그 팀의 `effectiveParentKey`, 아니면 P 의 `users.team_key`. 출발 팀부터 루트 방향으로 `nearestAncestorWith(index, 출발, t => t.leaderAccountId && t.leaderAccountId !== P)` — 출발 팀 자신 포함. 출발 팀이 null 이거나 끝까지 없으면 없음(Q2·Q3 나) |
| `leads` | 본인이 이끄는 팀(`leadingTeamKeyOf`)이 있으면 `[{teamKey: 그 팀, teamName, memberKeys}]`, 없으면 `[]`. **`memberKeys` = `approverOf(P) === me` 인 모든 P(본인 제외), 정렬·중복 제거**(Q4 나). 구성: ⓐ 팀원 — `users.team_key ∈ S(me)` 이고 어떤 팀도 이끌지 않는 사람, ⓑ 하위 팀장 — 팀을 이끄는 A 중 `approverOf(A) === me`. `S(me)` = 내 팀과, 내 팀 아래에서 팀장 없는 팀만 거쳐 내 팀에 닿는 하위 팀들(그 팀 소속 팀원의 결재자가 나로 계산되는 팀 집합). 결과적으로 팀장 없는 하위 팀의 팀원도 들어간다(Q3 나의 역방향) |
| `cap`·`rev` | 기존 규칙: cap 은 기존 cap ∪ {'wlorigin'}(≤8), rev = max(now, current.rev+1) |

## 3. 도메인 (순수)

### 워크포스 `src/integration/approval/orgCap.js`

```js
// 전부 순수. index = buildTeamIndex 결과(사이클·미존재 부모는 이미 루트로 강등, pathOf 유한). 시각 무관.

/** P 의 결재자 accountId 또는 null. 출발 팀 규칙은 §2 표. nearestAncestorWith 는 출발 팀 자신부터 본다. */
approverOf(index, accountId, userTeamKey) => string | null

/** me 의 결재 대상 팀원이 소속될 수 있는 팀 집합 S(me) — 내 팀 + 팀장 없는 팀만 거쳐 내 팀에 닿는 하위 팀. SQL 대상. */
memberTeamsOf(index, me) => string[]          // me 가 팀을 이끌지 않으면 []

/** 하위 팀장 중 approverOf(A) === me 인 A(인덱스만, SQL 0). A 의 출발 팀은 A 가 이끄는 팀의 부모(RFC-204 팀장 소속 불변식). */
subLeadsOf(index, me) => string[]

buildOrgTeam({ accountId, index, userTeamKey, memberRows }) =>
  { teamKey, teamName, leaderKeys, leads }
// memberRows: [{accountId, teamKey}] — 호출부가 findAccountTeamPairsByTeamKeys(memberTeamsOf(...)) 로 읽음(팀장 아니면 []).
// memberKeys = (memberRows 중 leadingTeamKeyOf 가 null 인 사람) ∪ subLeadsOf, − 본인, 정렬.
//   memberRows 안의 팀장(레거시로 team_key 가 다른 팀장)은 ⓐ 에서 빼고 ⓑ 규칙으로만 판정 — 같은 사람이 두 규칙으로 다르게 들어가지 않게.

sameTeam(a, b) => boolean   // 4칸 정규화(정렬된 배열) 비교

orgCapPlan({ current, rev, team }) =>
  { publish:false } | { publish:false, reason:'ORG_INVALID' } | { publish:true, body }
// team === undefined(로더 실패) → 지금처럼 current 팀 칸 보존(덮어쓰지 않는다)
// current 에 cap wlorigin 이 있고 sameTeam(current, team) → publish:false
// 그 외 body = {...team, cap, rev}; validateBody 실패(하위 팀장 포함 memberKeys > 500 등) → reason ORG_INVALID (잘라내지 않음, Q5)
```

대칭 불변식(테스트로 고정): 어떤 인덱스·소속에서도 `P ∈ buildOrgTeam(B).leads[0].memberKeys ⇔ buildOrgTeam(P).leaderKeys = [B]`.

테스트 케이스(`src/integration/approval/__test__/orgCap.test.js` 신규):
1. 팀원(팀장 L) → `leaderKeys:[L]`, `leads:[]`
2. 팀장 A, 부모 팀 팀장 B → A: `leaderKeys:[B]`, `leads:[{A팀, memberKeys:A팀원 − A}]` / B: `memberKeys` 에 **A 포함**(Q4)
3. 루트 팀 팀장 → `leaderKeys:[]`
4. **조상 올라가기(Q2)**: 루트 G(팀장 g) ⊃ 중간 M(팀장 없음) ⊃ A팀(팀장 a) → a: `leaderKeys:[g]`, g: memberKeys 에 a 포함
5. **조상 올라가기(Q3)**: G(팀장 g) ⊃ M(팀장 없음), M 팀원 m → m: `leaderKeys:[g]`, g: memberKeys 에 m 포함(S(g) = [G, M])
6. 끝까지 팀장 없음: 팀장 a 의 모든 조상 팀장 없음 → `leaderKeys:[]`(본인 결재) / 팀원 → `[]`(명부 경로)
7. 경계: 팀장 있는 하위 팀 C(팀장 c) 의 팀원 x → x 의 결재자는 c, g 의 memberKeys 에 **x 없음**, c 는 있음(S 가 팀장 있는 팀에서 끊긴다)
8. 소속 없음 / 인덱스에 없는 team_key → `teamKey:null, teamName:null, leaderKeys:[]`
9. 팀 이름 121자 → `teamName:null`, 검증 통과
10. **사이클·미존재 부모**: `buildTeamIndex` 가 강등한 팀은 루트 취급 → 무한 루프 없음, 강등 팀 팀장 `leaderKeys:[]`, 조상 쪽 팀장 memberKeys 에 들어가지 않음(대칭 유지)
11. 깊이 10 초과 서브트리(`MAX_TEAM_DEPTH`) — `pathOf` 기준으로만 올라가며 결과가 대칭
12. leaderAccountId === 본인(레거시 겸임, 두 팀 팀장) → `leadingTeamKeyOf` 첫 팀 기준, 결재자에서 본인 제외, memberKeys 에 본인 없음
13. **상한(Q5)**: 직속 팀원 490 + 하위 팀장 11 = 501 → `orgCapPlan` `ORG_INVALID`, 정확히 500 이면 게시
14. `orgCapPlan`: cap 있음 + 같은 팀 → no publish / 팀 바뀜 → publish, rev 단조 / team undefined → current 팀 칸 보존
15. 대칭 속성 테스트: 시드 고정 무작위 트리(팀 ≤30, 팀장 비율 다양)에서 위 대칭 불변식 전수 확인

승인 앱 도메인 변경 없음. `eligibility.js` 그대로.

## 4. 백엔드

### R1 (승인 앱) ctl 즉시 게시

**순환 import 확인 결과**: `WorkforcePublisher → WorklogPolicyResolver → WorklogPolicyAuthority → WorklogControlHooks`(실제 경로, 스크립트로 추적). 따라서 Authority 나 Hooks 가 `WorkforcePublisher` 를 **정적 import 하면 순환**이다. → Hooks 안에서 **호출 시점 lazy `require`**(리포 전례: `WorklogCertificationTargetAdapter.js:61`, `LinkedIssueSettingSource.js:109`)로 받는다.

1. `src/resolver/worklogControl/WorklogControlHooks.js`
   - `createWorklogControlHooks({ ..., publisher = null })` — 주입 없으면 호출 시 `require('../workforce/WorkforcePublisher').default`.
   - 새 메서드
     ```js
     /** 연동 신호(rms.policy I:/P:)가 새로 VERIFIED 되거나 ctl 이 바뀐 직후 — 그 대상의 ctl 문서 touch + 동기 1회. 던지지 않는다. */
     ctlTargetChanged: guarded('ctl', async ({ projectId, issueId } = {}) => {
       const entityId = issueId ? `I:${issueId}` : projectId ? `P:${projectId}` : null;
       if (!entityId || !/^[PI]:\d{1,18}$/.test(entityId)) return { skipped: true };
       return (publisher ?? lazyPublisher()).publishCtlNow([entityId], { limit: 1 });
     }),
     ```
   - 통제 스위치(visibilityScope)와 무관하게 동작한다 — `WorklogControlCtl.bodyFor` 도 스위치와 무관하게 본문을 만들고(`vs` 칸에 값만 싣는다), 설정 저장 경로 `publishCtl` 도 같다.
2. `src/resolver/worklogPolicy/WorklogPolicyAuthority.js` — 기본 `onLinkChanged` 만 교체(호출 조건 55행 `accepted && (status 변경 || ctl 변경)` 은 **그대로**):
   ```js
   onLinkChanged = (target) => Promise.all([
     worklogControlHooks.linkSignalChanged(),
     worklogControlHooks.ctlTargetChanged(target),
   ])
   ```
   UNCHANGED 경로(47행)·CAS 패배·검증 실패 경로는 손대지 않는다 → 유휴/무변경 SQL 0 추가.
3. `src/resolver/workforce/WorkforcePublisher.js` `publishCtlNow` — SQL 무변경, 배출 순서만: `listDue` 결과 중 ctl 행을 **요청한 accountId 우선**으로 정렬한 뒤 `slice(0, limit)`. (지금은 `next_attempt_at` 오름차순이라 방금 touch 한 행이 가장 뒤로 가서, 밀린 행이 10건 넘으면 이번 요청의 문서가 빠진다.) 기존 호출부(`WorklogControlService.publishCtl`, limit 10)는 요청 id 가 전체 대상이라 동작 동일.
   - 한계(문서화만): 밀린 due 행이 200건 넘으면 이번 행이 `listDue(now,200)` 페이지에 안 들어올 수 있다 → 일일 `scanCtl`/배출이 잇는다(요구서 규약 "실패는 일일 스윕이 잇는다").
4. **R1-b (Q1 가)** `WorkforceLinkService.republishWorkforceLink` scope `ALL` — 마커 touch 뒤 `await this.publisher.resetCtlScan().catch(() => {})`. `WorkforcePublisher.resetCtlScan()` = `this.ctlStore.delete(CTL_SCAN_KEY)`(KVS 1회, SQL 0). 다음 일일 `scanCtl` 이 워터마크 없이 전량 touch → ctl·flows 재배출(내용 같으면 PUT 생략은 기존 `drainCtl` 규칙).

asApp: 게시 PUT/DELETE 는 기존 `appGateway`(AGENTS asApp 허용 2번 "통제 설정 문서 게시"). 반환값은 훅이 삼키고 사용자 응답에 싣지 않는다(불변식 8).

### R2 (워크포스) 팀 구조 게시

1. `src/resolver/approvalLink/ApprovalLinkSignals.js`
   - deps 추가: `loadOrgTeam = defaultLoadOrgTeam`, `readOrgEpoch = defaultReadOrgEpoch`.
   - `defaultLoadOrgTeam(accountId)` (동적 import 로 팀 모듈을 불러 순환 회피 — 이 파일 기존 `readKbInputs` 전례):
     1. `index = await getTeamIndex()`(TTL 60s 캐시, KVS)
     2. `rows = await findUserRowsByAccountIds([accountId])`(SQL 1). 행 없음 → `buildOrgTeam` 에 `userTeamKey:null`
     3. `teams = memberTeamsOf(index, accountId)`; 비어 있지 않으면 `findAccountTeamPairsByTeamKeys(teams)`(SQL 1, 기존 함수. 결과가 크면 `orgCapPlan` 이 ORG_INVALID 로 막는다)
     4. `return buildOrgTeam({ accountId, index, userTeamKey, memberRows })` — 하위 팀장(ⓑ)은 인덱스만으로 계산(SQL 0)
     - `index.truncated === true`(팀 500 초과) → `undefined` 반환(팀 칸 보존, 게시 판단 보류) + 로그
   - `ensureOrgCap({cloudId, accountId})` 변경
     ```
     DISABLED 조건 그대로(!signer.ready() 등)
     epoch = await readOrgEpoch().catch(() => null)        // KVS 1회
     memoKey = `${cloudId}|${accountId}|${signer.kid}|${epoch ?? '-'}`
     memo hit(6h) → 'UNCHANGED'                              // Jira 0, SQL 0
     team = await loadOrgTeam(accountId).catch(() => undefined)
     entry GET(asUser) → verifyOwnOrg → current
     plan = orgCapPlan({ current, rev: now, team })
     plan.reason === 'ORG_INVALID' → logger.error('[APPROVAL LINK] org body invalid', {accountId 길이만/size}) ; memo set ; return 'FAILED'
     plan.publish → PUT(asUser 본인 사용자 프로퍼티, 기존 write)
     team === undefined 이면 memo 를 **남기지 않는다**(다음 열람에 재시도)
     ```
2. `src/resolver/approvalLink/orgEpoch.js` (신규, 작은 모듈)
   - `ORG_EPOCH_KEY = 'approvalLink:orgEpoch'`
   - `readOrgEpoch()` → `kvs.get` 숫자 또는 null
   - `bumpOrgEpoch()` → `kvs.set(ORG_EPOCH_KEY, Date.now())`, **던지지 않음**(로그만). 다중 인스턴스에서 메모 무효화가 동작하는 이유: memo 키에 epoch 가 들어가므로 다른 인스턴스도 다음 호출의 KVS 읽기에서 새 키를 본다.
3. epoch bump 호출 지점(팀 구조 쓰기 직후, 성공 경로에서만):
   | 파일 | 함수 |
   |---|---|
   | `backoffice/team/TeamService.js` | 팀 등록(457~479), 팀 수정(503~565, 팀장·부모 변경 포함), 팀 삭제(633~642), `assignUsersToTeamService`(674), `unassignUsersFromTeamService`(687) |
   | `backoffice/user/UserService.js` | 사용자 등록(teamKey 지정 시), `updateUserService`(teamChanged 일 때), 사용자 삭제(471 `clearTeamLeadershipOfUser` 뒤) |
   | `backoffice/team/TeamLeadership.js` | `clearTeamLeadershipOfUser`(정리한 팀 > 0), `backfillLeaderTeamMembership`(moved > 0) |
   — 판정 정확성이 epoch 에 달려 있지 않다(놓쳐도 6h memo 만료 뒤 재계산). 그래서 best-effort.
4. `src/resolver/backoffice/permission/PermissionController.js` `userPermissionCheck` — 
   ```js
   const [result] = await Promise.all([
     userPermissionCheckService(context?.accountId),
     approvalLinkSignals.ensureOrgCap({ cloudId: context?.cloudId, accountId: context?.accountId }).catch(() => 'FAILED'),
   ]);
   return result;
   ```
   승인 앱이 없는 사이트는 `signer.ready()` false → 즉시 DISABLED(KVS·SQL·Jira 0). 기존 두 호출 지점(`getIssueWorklogControlService`·`createIssueWorklogService`)은 유지(WorklogModal 이 계속 쓴다).
5. `orgCap.js` 상단 주석의 "워크포스는 아직 팀 구조를 게시하지 않는다" 문단을 새 의미로 교체.

권한·불변식: 본인 사용자 프로퍼티만 asUser 로 쓴다(G1 미사용). 타 사용자 프로퍼티 쓰기 없음.

### R3 (승인 앱) 수신 측

코드 변경은 **기본 승인자 규칙 두 곳**뿐, 나머지는 테스트 고정.

1. `WorklogRequestService.candidates`(116~117행)
   ```js
   const upper=[...await this.scope.upperLeadsOf(owner)];
   const defaultKeys=upper.length?upper:(self.allowed?[owner]:[]);
   ```
   후보 목록(`keys`)에는 지금처럼 `self.allowed` 면 본인이 들어간다(`defaultKeys ∪ registry ∪ 검색` 에 owner 를 명시 추가: `[...defaultKeys, ...(self.allowed?[owner]:[]), ...registry, ...found]`).
2. `WorklogRequestService.requestAutomatically`(268행) 같은 규칙: 상위 팀장이 있으면 그들만, 없고 `self.allowed` 면 본인.
3. 수동 요청(180행 `defaults[0] ?? self`)은 이미 이 규칙 — 무변경.
4. **Q4 대칭 확인(코드 변경 없음, 테스트 고정)** — 승인 앱은 B 의 문서만으로 B 범위를 정한다: `WorkforceOrgSource.ledScope(B)` = B 문서 `leads[].memberKeys` → `TeamScope.leadScope(B).members` 에 A·(팀장 없는 하위 팀 팀원)가 들어간다 → `TeamScope.leads(B, A)`·`membersOf(B)` 참. 반대 방향 `upperLeadsOf(A)` = A 문서 `leaderKeys` = {B}(A 는 `overriddenSubjects` 에 들어가 명부 팀장은 빠진다). 두 문서가 같은 워크포스 인덱스에서 계산되므로 대칭이고, 갱신 시차(각자 열람 시점 + memo + 승인 앱 5분 캐시) 동안만 어긋날 수 있다 → §10 V7.
   - 시차 중에는 "A 의 결재자는 B 인데 B 범위에 A 없음"이 가능하다. 이때 B 는 결재선(approver 행)으로 결정은 할 수 있고 TeamScope 화면에서만 안 보인다(범위 축소 쪽이라 안전).
5. `teamsFromOrgs` — 팀장 A 문서의 `teamKey=A팀, leaderKeys=[B]` 는 ② 팀원 문서 경로에서 B 를 A팀 `memberLeaders` 에 넣는다. A 의 ① 팀장 문서(`leads`)가 같은 문서에 있어 `hasLeaderDoc` 이 참이 되므로 표시 결과는 맞다 → 코드 변경 없이 테스트로 고정(아래 T-A7). Q4 로 B 의 `leads`(B팀)에 A·하위 팀원이 실리므로 표시상 A 는 B팀 팀원**이자** A팀 팀장으로 두 번 나온다(⑤ "두 팀 문서에 있으면 둘 다 표시" 규칙 — 결재 기준 소속으로 읽힌다). 표시 변경은 범위 밖.

## 5. 스키마·마이그레이션

없음. (워크포스 KVS 키 `approvalLink:orgEpoch` 1개 추가 — KVS 는 마이그레이션 대상 아님.)

## 6. Jira 연결

| 앱 | 변경 |
|---|---|
| 승인 앱 | 모듈·scope 무변경. 새 호출: 신호 변경 시 이슈/프로젝트 프로퍼티 PUT·DELETE 1회(asApp, 기존 허용 2번) |
| 워크포스 | manifest `modules.jira:issueActivity`(moves-rms-issue-activity)·`modules.jira:issueContext`(moves-rms-issue-context) 블록과 그 위 주석 블록(19~30행), `resources` 의 `issue-panel` 항목과 주석 삭제. scope 무변경(남은 기능이 같은 scope 를 쓴다 — 패널 전용 scope 는 없음). **모듈 삭제는 Forge 에서 major 아님(미검증 V4)**. `jira:customField` 의 `movesRmsLink.linked` displayConditions 는 유지 |

### R4 (워크포스) 이슈 패널 제거 — 정리 범위

| 구분 | 대상 | 처리 |
|---|---|---|
| manifest | 위 표 | 삭제 |
| 프론트 패널 | `static/ui/src/panel/` 의 `index.js, PanelApp.jsx, IssueActivityPanel.jsx, IssueContextSummary.jsx, PanelKpi.jsx, PanelOpenInAppLink.jsx, PanelRecentWorklogs.jsx, PanelWorklogForm.jsx, PanelWorklogHandoff.jsx, PanelWorklogRowActions.jsx, useIssuePanelData.js, panelMetrics.js, panelStates.js` + `__test__/{panelMetrics,panelStates,PanelWorklogCreate}` | 삭제 |
| 공유 모듈 | `panel/panelApproval.js`(main 의 `worklogMoveGuard.js`·`WorklogModal.jsx` 가 `approvalHandoffPath`·`approvalCreateErrorKey` 를 쓴다) | `src/components/worklog/approvalHandoff.js` 로 **이동**, 두 import 갱신, 테스트 `panelApproval.test.js` 도 이동. 패널에서만 쓰던 `mergeHiddenWorklogs`·`resolveApprovalRowMode` 는 사용처 grep 후 0 이면 삭제 |
| 쿼리키 | `utils/queryKey/issuePanelKeys.js` 의 `issuePanelKeys` | 사용처 0 이면 export 삭제. `issueLinkBackfillKeys` 는 백오피스가 쓰므로 유지 |
| 빌드 | `craco.config.js` PANEL_BUILD `paths` 훅, `scripts/build-panel.js`, `package.json` 의 `build:panel`·`bundle:check:panel`(그리고 `build` 체인에서 제거), `bitbucket-pipelines.yml` 두 곳의 `static/ui/build-panel/**` artifact | 삭제 |
| 테스트 | `src/__test__/cracoPanelPaths.test.js` 삭제, `src/__test__/linkedNoDirectWrite.test.jsx` 의 패널 컴포넌트 단언 제거(WorklogModal 단언 유지), `utils/__test__/forgeAppUrl.test.js` 의 `LOCAL_ID` 픽스처 문자열은 모듈 키와 무관한 파싱 입력이라 그대로 두어도 되나 혼동 방지로 `moves-rms` 로 바꾼다 |
| 서버 | `getIssueWorklogControl`·`create/update/deleteIssueWorklog`·`findProjectById`·`getSettingData` | **유지** — main 앱(WorklogModal 등)이 쓴다 |
| 화면 소유자 표식(Q7 가) | `IssueLinkPropertyApi`(`WORKLOG_OWNER`, `buildLinkValue`/`writeIssueLink`/`bulkSetIssueLink` 의 `worklogOwner`), `ProjectLinkWriter`(설정 읽기·인자), `queue/consumer.js`(설정 읽기·인자), `IssueLinkBackfillService.ensureIssueLinkOwnerBackfillService`·`OWNER_BACKFILL_MARKER_KEY`, `SettingController`(`getSettingData` 의 ensure 호출, `updateSetting` 의 모드 변경 시 `linkMarkerSync` force 백필) | 되돌린다. `backfillIssueLinkMarkersService({force})` 인자는 다른 호출자가 없으면 함께 제거. 관련 테스트 6개(`ProjectLinkWriter`, `IssueLinkPropertyApi`, `IssueLinkBackfillConsumer`, `KbMutationPublishing`, `ApprovalLinkMode`, `IssueLinkBackfillService`)의 worklogOwner 단언 제거. `IssueLinkPropertyApi.js` 5행 주석의 패널 displayConditions 설명 정리 |
| 유지 | ctl 문서 소비(`ApprovalControlLookup`, `ui.globalPagePath` 넘김 버튼), `movesRmsLink` 의 `linked`·`projectId` | 그대로 |
| 손대지 않음 | `locales/*`, 미추적 파일(pptx·png·custom-scopes.yaml·`LeaderTeamBackfill.test.js`) | — |

참고: 승인 앱 `WorklogControlCtl.bodyFor` 의 `wa.v` 는 원래 워크포스 패널 숨김 조건이었지만 워크포스 내부 화면도 `wa`(autoRequest·lockApproved·closeDays)를 읽으므로 **유지**한다.

## 7. 프론트

승인 앱: 변경 없음. "내 Workforce 결재자 구성"(identity)·팀 탭(`listWorkforceTeams`)이 채워진 값을 그대로 표시하는지 실측만(§10 V5).
워크포스: §6 R4 표.

## 8. i18n

없음(워크포스 locales 는 사용자 지시로 동결. 패널 전용 키 정리는 locales 작업이 끝난 뒤 별건).

## 9. 용량·호출량

| 경로 | 빈도 | SQL | Jira | 비고 |
|---|---|---|---|---|
| 승인 R1, 신호 UNCHANGED | 이슈 화면마다 | **+0** | +0 | 훅 미호출 |
| 승인 R1, 신호 변경(최초 VERIFIED·ctl 변경) | 연결·해제 시 1회/대상 | +4 (ready 캐시 제외: touchMany 1, listDue 1, bodyFor 1, markPublished 1) | +1 PUT/DELETE(asApp) | KVS: 정책·cloudId·state |
| 승인 R1-b, 관리자 ALL | 수동 | 0 | 0 | KVS delete 1 |
| 승인 유휴(사용자 0명) | — | **+0** | 0 | 새 스케줄 없음 |
| 워크포스 `userPermissionCheck`, memo hit | 앱 열 때 | 0 | 0 | KVS get 1(epoch) |
| 워크포스 memo miss(6h·epoch 변경·콜드 컨테이너) | 사용자당 하루 수 회 | +1~2 (users 1, 팀원 1[팀장만 — S(me) 팀 전부를 `IN` 한 번]) | +1 GET, 변경 시 +1 PUT | 팀 인덱스는 60s 캐시. 조상 올라가기·하위 팀장 계산은 인덱스 순회(팀 ≤500, 깊이 ≤10) — SQL 0 |
| 문서 크기 | 팀장 1명당 | — | — | memberKeys(직속 + 팀장 없는 하위 팀 팀원 + 하위 팀장) ≤500 × ~30B ≈ 15KB < 32KB 프로퍼티 한도 |
| 상한 위험(Q3·Q4 나) | — | — | — | 팀장 없는 하위 팀이 많으면 상위 팀장 memberKeys 가 커진다. 200명 고객은 전원이 한 팀장 아래여도 199 < 500. 초과는 인원 500+ 이고 중간 팀장이 비어 있을 때만 → ORG_INVALID 로그로 드러난다 |

200명 기준(Q4 반영 후에도 문서 수·SQL 수는 같고 memberKeys 길이만 는다): 하루 앱 열기 200~600회 → memo miss 상한 ≈ 200×4 = 800 GET/일, SQL ≈ 1,000/일(워크포스 SQL, 사용자 활동 비례 — 유휴 0).

## 10. 미검증

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| V1 | 승인 앱 신호 최초 검증 직후 같은 요청 안에서 ctl PUT 이 성공하는가(asApp 이슈 프로퍼티 쓰기) | R1 효과 | ARS-14 류 새 연결 이슈에서 이슈 화면 열기 → `workforce_publish` 의 `I:{id}|ctl` 행 `pending=0, published_at` 갱신 + REST `GET /issue/{id}/properties/movesApproval.ctl` 200 |
| V2 | 사용자 프로퍼티 `movesRms.org` 를 승인 앱이 본인 asUser 로 읽을 때 갱신된 본문을 5분(ORG_MAX_AGE_MS) 안에 받는가 | R3 실측 지연 | Tom Kim 이 워크포스 열기 → 5분 뒤 승인 앱 설정 "내 Workforce 결재자 구성"에서 `isWorkforceTeamLead` |
| V3 | 사용자 프로퍼티 크기 한도(32KB) 근처 문서의 PUT | 큰 팀 | 테스트 사이트에 큰 팀 없음 — 계산상 15KB, 실측 생략 가능 |
| V4 | Forge 모듈 삭제 배포가 major upgrade 를 요구하지 않는가, 삭제 후 이슈 화면에서 패널이 즉시 사라지는가 | 배포 | `forge deploy` 출력(major 경고 유무) + ARS-14 화면 |
| V5 | 승인 앱 설정 화면이 채워진 `leaders`·`ledTeams`·팀 탭 `memberKeys` 를 깨짐 없이 표시 | R3 화면 | 실측 스크린샷 |
| V7 | 팀 구조 변경 직후 A(하위 팀장)·B(상위 팀장) 문서의 재게시 시차 | Q4 대칭이 잠시 어긋남(축소 쪽) | 개발 사이트에서 팀 부모 변경 → 두 사람이 각각 워크포스 열기 → 승인 앱 `listWorkforceTeams`·B 의 팀 화면 |
| V6 | `listDue` 페이지(200) 밖으로 밀린 행 | R1 지연 | 개발 사이트 due 행 수가 작아 영향 없음 — 일일 스윕 로그로만 확인 |

## 11. 작업 분해

### 승인 앱 (backend)
- [ ] `WorklogControlHooks`: `publisher` 주입 + lazy require, `ctlTargetChanged` 추가
- [ ] `WorklogPolicyAuthority`: 기본 `onLinkChanged` = linkSignalChanged + ctlTargetChanged(target)
- [ ] `WorkforcePublisher.publishCtlNow`: 요청 id 우선 정렬 / `resetCtlScan()` 추가
- [ ] `WorkforceLinkService.republishWorkforceLink` ALL → `resetCtlScan` (Q1 가)
- [ ] `WorklogRequestService.candidates`·`requestAutomatically`: 기본 승인자 = 상위 팀장 ‖ 본인
- [ ] 테스트
  - T-A1 `WorklogControlHooks.test.js`(신규): ctlTargetChanged → `publishCtlNow(['I:10001'],{limit:1})`; `P:` 경로; 잘못된 id → skipped·호출 0; publisher 가 던져도 `{failed:true}`; 순환 없이 모듈 로드(`require` 만으로 import 성공)
  - T-A2 `WorklogPolicyAuthority.test.js`: 최초 VERIFIED·ctl 변경 → onLinkChanged 가 `{projectId, issueId}` 로 1회 / UNCHANGED·검증 실패·CAS 패배 → 0회 / UNCHANGED 경로 query 수 기존과 동일
  - T-A3 `WorkforcePublisher.test.js`: publishCtlNow 가 due 목록 뒤쪽의 요청 행을 먼저 배출 / `resetCtlScan` 뒤 scanCtl 이 워터마크 없이 전량 touch
  - T-A4 `WorkforceLinkService` ALL → resetCtlScan 호출, FAILED → 미호출
  - T-A5 `WorklogRequestService.test.js`: 팀장(leads 있음)+상위 B → `selfApprovalAllowed:true`, users 에 본인, `defaultApproverIds:[B]` / 팀장·상위 없음 → `[본인]` / 팀원 → `[팀장]` / 자동 요청 후보 동일 규칙
  - T-A6 `inbound.test.js`·`WorkforceOrgSource` 테스트: 채워진 leads → `isWorkforceTeamLead:true`, ledScope members, 본인 제외
  - T-A7 `teamsFromOrgs` 테스트: 팀장 A 문서(teamKey=A팀, leaderKeys=[B], leads=[A팀]) + B 문서(leads=[B팀, memberKeys⊇A]) → A팀 leaderKeys=[A], B 는 A팀 팀장으로 표시되지 않음, A 는 B팀 memberKeys 에도 표시
  - T-A8 `TeamScopeUpperLeads.test.js`: A 의 wf leaderKeys=[B] → upperLeadsOf(A)={B}, 명부 팀장 제외(overridden)
  - T-A9 TeamScope 대칭(Q4): B 문서 leads.memberKeys=[A, m] + A 문서 leaderKeys=[B] → `leads(B,A)` 참·`membersOf(B)` 에 A·m, `upperLeadsOf(A)`={B} / B 문서에 A 없음(시차) → `leads(B,A)` 거짓이지만 `upperLeadsOf(A)` 는 {B}
- [ ] `npm test` 녹색

### 워크포스 (backend)
- [ ] `orgCap.js`: `buildOrgTeam`, `sameTeam`, `orgCapPlan({current,rev,team})`, 주석 교체
- [ ] `orgEpoch.js` 신규 + 팀 쓰기 지점 bump(§4 R2-3 표)
- [ ] `ApprovalLinkSignals.ensureOrgCap`: loadOrgTeam·epoch memo 키·ORG_INVALID 처리
- [ ] `PermissionController.userPermissionCheck`: ensureOrgCap 병행 호출
- [ ] R4 manifest·패널·빌드·CI·worklogOwner 되돌림(§6 표)
- [ ] 테스트
  - T-W1 orgCap 순수(§3 케이스 1~15 — 조상 올라가기·하위 팀장 포함·사이클·상한·대칭 속성)
  - T-W2 `ApprovalLinkSignals.test.js`: 팀장 → PUT 본문에 leads·leaderKeys, 로더가 `findAccountTeamPairsByTeamKeys` 를 S(me) 팀 목록으로 1회 호출(팀장 아니면 0회) / 같은 팀·cap 있음 → PUT 0 / epoch 바뀜 → memo 무시 재평가 / loadOrgTeam 실패 → 기존 팀 칸 보존·memo 미기록 / 501명 → FAILED·로그·PUT 0
  - T-W3 PermissionController: ensureOrgCap 실패해도 응답 동일
  - T-W4 TeamService·UserService·TeamLeadership: 쓰기 성공 시 bumpOrgEpoch 1회, 실패(throw) 경로 0회
  - T-W5 `ApprovalLinkMode.test.js`(manifest 정규식 테스트) → "manifest 에 `jira:issueActivity`·`jira:issueContext`·`issue-panel` 없음"으로 교체
  - T-W6 패널 테스트 삭제, `panelApproval.test.js` 이동, `linkedNoDirectWrite.test.jsx` 갱신
- [ ] `npm test`(루트) + `cd static/ui && npm test && npm run build` 녹색, `forge lint`

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-14 | 열린 질문 답 반영 — Q2·Q3 나)(조상 올라가기), Q4 나)(B 의 memberKeys = approverOf(P)=B 인 모든 P). 바뀐 곳: 열린 질문 표, §2 팀 칸 의미, §3 순수 함수·테스트, §4 R2 로더, §4 R3 4·5항, §9, §10 V7, §11 T-A7·T-A9·T-W1·T-W2 | 사용자 답 |
