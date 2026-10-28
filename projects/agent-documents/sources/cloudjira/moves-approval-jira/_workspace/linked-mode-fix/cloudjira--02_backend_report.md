# linked-mode-fix — 백엔드 보고서 (승인 앱 몫, 1회차, 2026-10-14)

> 범위: 설계서 §11 "승인 앱 (backend)" — R1·R1-b·R3. 워크포스 리포는 건드리지 않았다.
> 새 SQL·마이그레이션·manifest·resolver 없음. 커밋·forge 명령 없음.

## 바뀐 파일

| 파일 | 변경 |
|---|---|
| `src/resolver/worklogControl/WorklogControlHooks.js` | `publisher` 주입 인자(기본 `null` → 호출 시 `require('../workforce/WorkforcePublisher').default` 지연 로드), 새 훅 `ctlTargetChanged` |
| `src/resolver/worklogPolicy/WorklogPolicyAuthority.js` | 기본 `onLinkChanged` 만 교체(호출 조건 56행 그대로) |
| `src/resolver/workforce/WorkforcePublisher.js` | `publishCtlNow` 배출 순서(요청 id 우선), `resetCtlScan()` 추가 |
| `src/resolver/workforce/WorkforceLinkService.js` | `republishWorkforceLink` scope `ALL` → `publisher.resetCtlScan()` (실패 삼킴) |
| `src/resolver/worklogCertification/WorklogRequestService.js` | `candidates`·`requestAutomatically` 기본 승인자 규칙 |
| 테스트(신규) | `src/resolver/worklogControl/__test__/WorklogControlHooks.test.js`(T-A1), `src/resolver/workforce/__test__/WorkforcePublisherCtlNow.test.js`(T-A3), `src/resolver/workforce/__test__/LinkedOrgReceive.test.js`(T-A6·T-A8·T-A9) |
| 테스트(수정) | `WorklogPolicyAuthority.test.js`(T-A2, build 에 `onLinkChanged` mock 주입), `WorkforceLinkService.test.js`(T-A4, 서비스 팩토리에 `publisher` 인자), `WorklogRequestService.test.js`(T-A5 + 기존 1건 기대값 변경), `teamsFromOrgs.test.js`(T-A7) |

## 실제 시그니처·반환 shape

```js
// WorklogControlHooks.js
createWorklogControlHooks({ worker, state, repository, logger, tableReady, blocksCertification, publisher = null })
hooks.ctlTargetChanged({ projectId = null, issueId = null } = {})
//  → 대상 무효(없음·/^[PI]:\d{1,18}$/ 불일치): { skipped: true }
//  → 게시기 예외:                                { failed: true }  (logger.error('[WORKLOG_CONTROL][hook] ctl failed', code|message))
//  → 정상: publishCtlNow 반환 그대로 — { touched, published, failed } 또는 { touched, published, failed, state }(관문에 막힘)
//  호출: publisher.publishCtlNow([`I:${issueId}`] 또는 [`P:${projectId}`], { limit: 1 })  — issueId 가 있으면 I: 우선

// WorklogPolicyAuthority.js (기본값만)
onLinkChanged = (target) => Promise.all([worklogControlHooks.linkSignalChanged(), worklogControlHooks.ctlTargetChanged(target)])
//  target = { projectId, issueId }  (refreshOne 의 인자, issueId 는 프로젝트 대상이면 null)
//  refreshOne 반환 shape 무변경 — 훅 결과는 응답에 싣지 않는다(불변식 8)

// WorkforcePublisher.js
async resetCtlScan()                       // this.ctlStore.delete(CTL_SCAN_KEY) — KVS 1회, SQL 0. 던질 수 있음(호출부가 삼킨다)
async publishCtlNow(accountIds, { limit = 10 } = {})   // 반환 shape 무변경 { touched, published, failed[, state] }
//  배출 순서: listDue(now,200) 의 ctl 행 중 accountIds 에 든 행 먼저, 나머지는 기존(next_attempt_at) 순서 → slice(0, limit)

// WorkforceLinkService.republishWorkforceLink — 반환 shape 무변경 { scope, resetCount, markerCount }

// WorklogRequestService.candidates — 반환 shape 무변경
// { users[], defaultApproverIds[], needsApprover, scope, selfApprovalAllowed }
```

### 기본 승인자 규칙 (R3)

| 작성자 | `upperLeadsOf` | `selfApprovalAllowed` | `defaultApproverIds` | `users` 에 본인 | 자동 접수 approverKeys |
|---|---|---|---|---|---|
| 워크포스 팀장, 상위 팀장 B | {B} | true | `['B']` | 포함 | `['B']` (이전: `['B','owner']`) |
| 워크포스 팀장, 상위 없음 | {} | true | `['owner']` | 포함 | `['owner']` |
| 팀원, 팀장 L | {L} | false | `['L']` | 없음 | `['L']` |
| 팀원, 팀장 없음 | {} | false | `[]`, `needsApprover:true` | 없음 | `NEEDS_APPROVER` |

`defaultApproverIds` 는 지금처럼 이슈 열람 가능자(`allowed`)로 다시 거른다. 수동 요청(`create`, `defaults[0] ?? self`)은 무변경.

## SQL·호출량 (설계 §9 고정)

| 경로 | 결과 | 고정한 테스트 |
|---|---|---|
| 신호 UNCHANGED | 훅 0회, 저장소 호출 `findInbound` 1 + `touchInbound` 1 (기존과 같음), `update/insert/feature` 0 | `WorklogPolicyAuthority.test.js` "UNCHANGED 경로는 훅 0회…" |
| 검증 실패·CAS 패배(2회)·같은 ctl 새 리비전 | 훅 0회 | 같은 파일 3건 |
| 신호 변경(최초 VERIFIED·ctl 변경) | 훅 1회. 게시기: `ready`(테이블 준비 캐시) 1 + `touchMany` 1 + `listDue` 1 (+ drainCtl 의 `bodyFor` 1·`markPublished` 1) | `WorkforcePublisherCtlNow.test.js` "SQL 횟수" |
| 관리자 ALL | KVS delete 1, SQL 0 | `WorkforceLinkService.test.js` R1-b |

## 테스트

```
npm test -- --runInBand
Test Suites: 193 passed, 193 total
Tests:       2899 passed, 2899 total
```
(`npm run merge` 는 locales 변경이 없어 돌리지 않았다. `npx eslint` 는 리포에 eslint.config 가 없어 실행 불가 — 기존 상태.)

## 설계와 다르게 한 점

1. **기존 테스트 1건 기대값 변경** — `WorklogRequestService.test.js` "연동 이슈의 Workforce 팀장 본인 기록은 자동 결재선 마지막 후보에 본인을 둔다"(`['upper','owner']`) → "상위 팀장이 있으면 상위 팀장에게만 자동 접수한다"(`['upper']`). 설계 §4 R3-2 규칙의 직접 결과다.
2. **`ctlTargetChanged` 의 유효성 검사** — 설계 코드 그대로(`/^[PI]:\d{1,18}$/`)이되 상수 `CTL_ENTITY` 로 뺐다. 인자 기본값 `{ projectId = null, issueId = null } = {}`.
3. **`resetCtlScan` 호출은 `this.publisher.resetCtlScan?.()`** — 옛 테스트 픽스처처럼 메서드가 없는 publisher 주입에도 ALL 재게시가 깨지지 않게 했다(동작은 같음).
4. **`requestAutomatically`** 의 상위 팀장 목록에 `new Set` 을 한 번 더 씌웠다(upperLeadsOf 는 이미 Set 이라 결과 동일, 방어용).

## 동작 변화로 확인이 필요한 점 (리더 판단)

- **상위 팀장 B 가 이슈를 볼 수 없을 때** 이전에는 `defaultKeys = {B} ∪ {owner}` 라서 본인이 기본 승인자·자동 결재자로 남았다. 이제는 `defaultApproverIds:[]`·`needsApprover:true`(본인은 후보 목록에 남아 직접 선택 가능), 자동 접수는 `NEEDS_APPROVER`. 설계 규칙("상위 팀장이 있으면 그 사람만")과 CLAUDE.md "팀장 부재를 자기 승인으로 처리하지 않는다"에 맞춘 것이며 테스트 2건으로 고정했다.

## 미검증 (실측 필요 — `04_spike_todo.md` 에 같은 목록)

| # | 항목 | 확인 방법 |
|---|---|---|
| V1 | 신호 최초 검증 직후 같은 요청 안에서 ctl PUT(asApp)이 성공하는가 | 새 연결 이슈 화면 열기 → `workforce_publish` 의 `I:{id}`/`ctl` 행 `pending=0`·`published_at` 갱신, REST `GET /rest/api/3/issue/{id}/properties/movesApproval.ctl` 200 |
| V2 | 워크포스가 채운 `movesRms.org` 를 5분 안에 받아 "내 Workforce 결재자 구성"에 `isWorkforceTeamLead:true` 표시 | Tom Kim 이 워크포스 열기 → 5분 뒤 승인 앱 설정 |
| V5 | 설정 화면이 채워진 `leaders`·`ledTeams`·팀 탭 `memberKeys` 를 표시 | 스크린샷 |
| V6 | `listDue(now,200)` 밖으로 밀린 행 | 일일 스윕 로그 |
| — | ARS-14 승인 요청 → 후보에 본인(팀장) 포함·기본 승인자 자동 선택 | 터널 실측(요구서 완료 기준) |

## 발견 (범위 밖, 고치지 않음)

- `publishCtlNow` 는 정책·서명 관문(`blockedState`)보다 **먼저** `touchMany` 를 한다(기존 동작). 연동이 꺼진 상태에서 Authority 가 신호를 VERIFIED 로 받는 경로가 있다면 ctl 행 1개를 쓰고 끝난다(SQL 2~3). 신호 수신 자체가 연동 모드 경로라 실영향은 낮다고 보았으나, 유휴 예산 관점에서 확인 필요.
- `WorklogPolicyAuthority.test.js` 의 기존 테스트는 기본 `onLinkChanged` 를 그대로 써서 실제 `linkSignalChanged` 가 KVS 를 부르다 실패 로그를 남기고 있었다(통과는 함). 이번에 build 에 mock 을 주입해 소음을 없앴다.

## 2회차 — W1 (검증 보고서 03 지적, 2026-10-14)

**지적:** `TimesheetService.js:279` 가 이슈마다 순서대로 `refreshOne` 을 부르므로, 일괄 연결 직후에는 한 요청 안에서 이슈 수만큼 ctl PUT 이 직렬로 실행돼 25초를 넘길 수 있다.

**수정:**

| 파일 | 변경 |
|---|---|
| `src/permission/InvocationScope.js` | `takeInvocationQuota(key, max) => boolean` 추가. 요청 범위 저장소(AsyncLocalStorage 의 invocation Map)의 카운터를 쓰며 동기로 판정하므로 병렬 호출에도 원자적이다. **스코프 밖이면 false**를 돌려준다. 모듈 전역 변수는 쓰지 않는다 |
| `src/resolver/worklogControl/WorklogControlHooks.js` | `export const CTL_IMMEDIATE_PER_INVOCATION = 3`. `ctlTargetChanged` 는 할당량이 남으면 `publishCtlNow([id], {limit:1})`(PUT), 넘으면 `publishCtlNow([id], {limit:0})`(touch 만) 후 `{...result, deferred:true}` |
| `src/resolver/workforce/WorkforcePublisher.js` | `publishCtlNow` 에서 `limit <= 0` 이면 `touchMany` 직후 `{touched, published:0, failed:0}` 를 반환한다. 정책 KVS·`listDue`·PUT 은 없다(SQL: ready + touchMany) |

**반환 shape (`ctlTargetChanged`)**
- 상한 안: `{touched, published, failed[, state]}`
- 상한 초과 또는 요청 스코프 밖: `{touched:1, published:0, failed:0, deferred:true}`
- 기존과 같음: 대상 무효면 `{skipped:true}`, 예외면 `{failed:true}`

**설계와 다른 점:** 요청 스코프 밖(트리거·큐 소비자. `guardedDefine` 을 거치지 않는 경로)은 **즉시 게시하지 않고 touch 만** 한다. 모듈 전역 카운터를 쓰지 않고는 그런 경로의 상한을 셀 수 없기 때문이다. R1 의 목표 경로(이슈 화면·타임시트 제출 = resolver 요청)는 모두 스코프 안이다. 트리거에서 처음 검증된 신호는 일일 스윕이 내보낸다.

**테스트**
- `WorklogControlHooks.test.js`(+4)
  - 10건 순차 호출 시 limit 이 `[1,1,1,0,…]` 순서로 나가고 `deferred` 7건, 예외 없음
  - 병렬 8건에서 PUT 3건
  - 요청이 바뀌면 할당량이 새로 시작됨
  - 스코프 밖은 limit 0
  - 기존 2건은 `runInInvocation` 안에서 돌도록 바꿨다
- `WorkforcePublisherCtlNow.test.js`(+1): limit 0 이면 touch 만 하고 `listDue`·`policyLoader`·배출은 0회
- **V1 종단** `src/resolver/worklogPolicy/__test__/LinkedCtlImmediate.e2e.test.js`(신규 3건)
  - 실제 모듈 조합: `WorklogPolicyAuthority`(기본 onLinkChanged) → 싱글턴 `WorklogControlHooks` → 지연 require 된 싱글턴 `WorkforcePublisher` → 실제 `createWorklogControlCtl.bodyFor` → `buildCtlDoc`(실제 서명기) → `appGateway.putEntityProperty`
  - 가짜는 SQL 저장소·query, `@forge/kvs`, Jira 게이트웨이(신호 GET·ctl PUT)뿐이다
  - ① 최초 VERIFIED 이면 같은 `refreshOne` 호출 안에서 `putEntityProperty(target{issueId}, 'movesApproval.ctl', {ch:'APP', wa:{v:1,…}})` 1회가 불리고, 원장 행이 `pending:false, publishedAt` 이 된다. `refreshOne` 응답에는 게시 결과가 없다
  - ② 같은 신호를 다시 받으면(UNCHANGED) PUT 0
  - ③ 한 요청에서 이슈 5건을 처음 검증하면 PUT 3, `I:4`·`I:5` 는 원장 대기
- 전체: `npm test -- --runInBand` → **Test Suites 195 passed / Tests 2927 passed**

손대지 않은 파일: `src/resolver/approval/ApprovalService.js`, `static/ui/src/entries/modal.jsx`(리더 작업 중).
