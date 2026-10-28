# 승인 엔진 정합성 수정 설계 — REVIEW.md R01·R02·R03·R04

> 작성 2026-10-28. 대상 `src/resolver/approval/ApprovalRepository.js`(decideReady·claimDecision·casAggregate·updateProjection·closeBySystem·cancel),
> `src/resolver/inbox/InboxRepository.js`(myturn 탭). 도메인(`src/domain/approval/*`)은 **바꾸지 않는다**(순수 전이는 그대로 맞다 — 문제는 저장 순서).
> 재현: `tmp/full-audit-2026-10-28/engine.repro.test.js` R01~R04(수정 전 결함 동작을 고정한 것 — 수정 뒤에는 깨지는 게 정상. 정식 회귀 테스트로 바꿔 `src/resolver/approval/__test__/` 에 둔다).
> 트랜잭션 없음(Forge SQL). 멀티 테이블 UPDATE 는 Forge SQL 에서 미실측이라 **쓰지 않는다** — 단일 테이블 UPDATE + 서브쿼리만.

## 0. 불변식(이 수정이 지켜야 하는 것)

- I-A **최종 상태는 결정 행의 파생과 같다**: 요청이 종료(APPROVED/REJECTED)되면 `deriveStatus(steps, 결정 행 전체) === 저장 status`. (R01)
- I-B **클레임된 결정은 반드시 최종 판정에 반영된다**, 아니면 클레임을 되돌린다(늦은 결정 = ALREADY_DECIDED). 반영되지도 되돌려지지도 않는 상태를 남기지 않는다.
- I-C **같은 사용자의 재시도는 수렴한다**: 클레임 뒤 어느 단계(이벤트·aggregate·투영)에서 끊겨도 같은 입력의 재호출이 나머지를 끝낸다. (R02)
- I-D **투영은 세대를 거슬러 덮지 않고, 이미 결정한 사람은 내 차례가 아니다.** (R03)
- I-E **CAS 에서 진 회수·만료의 이벤트는 남지 않는다**(성공한 전이의 이벤트만 감사에 남는다). 반대로 CAS 성공 뒤 이벤트가 없는 상태도 만들지 않는다 — 그래서 이벤트는 CAS **앞**에 쓰고(지금 순서), CAS 에서 지면 **거둔다**. (R04)
- 유휴 SQL 0 추가. 결정 1건당 SQL 은 지금 4(클레임·이벤트·CAS·투영 2문장) → **+1 SELECT**(클레임 뒤 재조회)까지 허용. CAS 재시도 경로는 기존과 같이 상한 `MAX_CAS_ATTEMPTS`.

## 1. R01 — 결정 수락과 최종 확정의 결속

### 1.1 클레임은 부모가 PENDING 일 때만
`claimDecision` 의 UPDATE 에 조건 추가:
```sql
AND EXISTS (SELECT 1 FROM approval_request r WHERE r.request_id = approval_approver.request_id AND r.status = 'PENDING' AND r.commit_state = 'LIVE')
```
(기존 `decision_type='PENDING'`·재개 기간 NOT EXISTS 는 그대로.)

### 1.2 aggregate CAS 는 "내가 본 결정 수"가 실제와 같을 때만
`casAggregate(requestId, expectedRev, next, { decidedCount })` 에 조건 추가:
```sql
AND (SELECT COUNT(*) FROM approval_approver p WHERE p.request_id = approval_request.request_id AND p.decision_type <> 'PENDING') = ?
```
`decidedCount` = 호출자가 aggregate 를 계산한 스냅숏(`state.decisions`)에서 `decisionType !== 'PENDING'` 인 항목 수. (`load()` 가 PENDING 행도 Map 에 넣는지 확인하고 그에 맞게 센다.) 내 스냅숏 뒤에 다른 클레임이 들어왔으면 CAS 가 지고 → 재조회 → 전체 결정으로 재계산. **종료 상태를 쓰는 CAS 는 결정 행 전체를 본 스냅숏에서만 성공한다.**
`closeBySystem`·`cancel` 의 CAS 는 결정 수 조건을 걸지 않는다(결정을 반영하는 전이가 아님) — 인자 생략 시 조건 없음.

### 1.3 decideReady 의 순서
```
state = load(id); result = transition(state, input)
if result.idempotent → return converge(state, input)            # §2
claimed = claimDecision(id, result.changes.approverRow)           # 1.1
if !claimed → 기존 그대로(APPROVE 는 load 반환, REJECT 는 ALREADY_DECIDED)
for attempt in 0..MAX:
  state = load(id)                                                 # 내 클레임 포함 신선한 결정 전체 (+1 SELECT)
  if state.status !== PENDING:
     if deriveStatus(state.steps, state.decisions) === state.status → return state    # 내 결정이 누군가의 CAS 에 이미 반영됨(성공)
     else → retractClaim(id, approverRow); retractEvent(id, result.changes.event.eventId) (이번 호출이 썼을 때만)
            APPROVE: return state(종료 상태 그대로) / REJECT: throw ALREADY_DECIDED            # 늦은 결정(I-B)
  own = new Map(state.decisions); own.delete(actorKey)
  result = transition({...state, decisions: own}, input)          # 다른 사람 결정까지 포함해 재계산(기존 beforeOwnClaim 과 같은 방식)
  appendEvent(id, result.changes.event)                            # 멱등(ON DUPLICATE)
  ok = casAggregate(id, state.rev, next, { decidedCount: decided(state.decisions) })   # 1.2
  if ok → updateProjection(...reqRev: state.rev+1) → return 병합 상태
  sleep(backoff)
throw CONCURRENT_MODIFICATION   # 클레임은 남아 있다 — 같은 사용자의 재시도가 §2 로 수렴시킨다
```
`retractClaim`: `UPDATE approval_approver SET decision_type='PENDING', decided_at=NULL WHERE request_id=? AND step_order=? AND actor_key=? AND decision_type=? AND decided_at=?`(내가 쓴 값과 정확히 같을 때만). 실패해도 던지지 않고 로그.
`retractEvent`: `DELETE FROM approval_event WHERE request_id=UUID_TO_BIN(?) AND event_id=UUID_TO_BIN(?)` best-effort. **이번 호출이 쓴 이벤트**만(루프 첫 appendEvent 전에는 부르지 않는다).

### 1.4 왜 충분한가(논증을 테스트 이름에 그대로)
- a APPROVE·b REJECT 동시(1명 승인 통과): 둘 다 클레임 → a 재조회에 b 포함 여부와 무관하게, a 의 CAS 는 `decidedCount` 가 실제(2)와 같을 때만 성공 → 전체 결정으로 계산한 REJECTED 만 쓰인다. b 도 같다. 둘 중 하나가 쓰고 다른 하나는 재조회에서 "종료 + 파생 일치" → 성공 반환.
- a 의 종료 CAS 뒤 b 의 클레임: 1.1 의 EXISTS(PENDING) 가 막는다. 두 문장이 완전히 겹친 극히 짧은 창에서 클레임이 통과하면 b 는 재조회에서 "종료 + 파생 불일치" → 클레임 되돌림 + ALREADY_DECIDED(I-B).

## 2. R02 — 재시도 수렴 `converge(state, input)`
`result.idempotent`(내 결정이 이미 행에 있음)일 때:
```
own = Map(state.decisions) − actorKey; replay = transition({...state, decisions: own}, input)   # 내 결정을 다시 얹어 전체 재계산
eventMissing = !state.events.some(e => e.eventId === replay.changes.event.eventId)
lag = state.status === PENDING && (replay.next.status !== state.status || replay.next.currentStepOrder !== state.currentStepOrder)
if !lag && !eventMissing → return state                         # 진짜 멱등 — SQL 0
if eventMissing → appendEvent(replay.changes.event)              # 반려 사유·대리인은 같은 입력에서 다시 온다
if lag → §1.3 의 루프를 "클레임 생략"으로 수행(재조회·재계산·CAS·투영). 종료 상태를 만나면 파생 일치 확인만(내 결정이 이미 반영) → return
else(이벤트만 빠짐) → updateProjection 의 my_decided 문장만 다시(§3) → return state
```
종료 상태인데 파생이 불일치하는(이미 잘못 종료된) 요청은 여기서 고치지 않는다 — 로그 `[APPROVAL] terminal mismatch` 코드만 남기고 반환(감사·외부 적용이 이미 나갔을 수 있어 자동 뒤집기 금지). 그런 데이터는 R01 수정 뒤에는 새로 생기지 않는다.

## 3. R03 — 투영 세대 가드·내 차례
`updateProjection`:
1. **순서를 바꾼다**: 먼저 `UPDATE approval_inbox SET my_decided=1 WHERE request_id=? AND actor_key=? AND role='APPROVER'`(actorKey 있을 때만), 그다음 aggregate 문장.
2. aggregate 문장:
```sql
UPDATE approval_inbox
   SET status=?, is_open=?, current_step_order=?, current_step_name=?, updated_at=?, req_rev=?,
       my_turn = CASE WHEN ?=1 AND role='APPROVER' AND step_order=? AND my_decided=0 THEN 1 ELSE 0 END
 WHERE request_id=UUID_TO_BIN(?) AND req_rev <= ?
```
`req_rev <= ?`(같은 세대 재투영 허용 — §2 의 재시도, 더 낮은 세대의 지연 투영은 차단). `req_rev` 는 `INT NOT NULL`(DDL 확인됨), 생성 시 1 로 들어가는지 `createRequestLive` 의 inbox INSERT 에서 확인.
3. `InboxRepository.INBOX_TABS.myturn` 에 `decided:false` → `my_decided = 0` 조건 추가(목록·count 같은 applyTab 경유인지 확인). 배지 count 도 같은 조건.

## 4. R04 — 진 회수·만료의 이벤트 거두기
`closeBySystem`·`cancel` 루프: appendEvent → CAS 실패 → 재조회에서
- `state.status !== PENDING`: `state.status !== result.next.status` 이면 `retractEvent(requestId, result.changes.event.eventId)`(같은 전이가 다른 호출로 성공한 경우 — 상태가 같으면 — 이벤트는 그 호출의 것과 id 가 같으니 남긴다). 그 뒤 기존 반환.
- 시도 소진(`reason:'cas'` / CONCURRENT_MODIFICATION): 마지막 재조회 상태가 PENDING 이면 이벤트가 유령이다 → retractEvent 뒤 반환/던짐.
`decideReady` 루프의 재시도에서 이벤트 id 는 actor·type 으로 고정이라 같은 id 를 다시 얹는다(ON DUPLICATE). 늦은 결정 되돌림(§1.3)에서만 거둔다.

## 5. 테스트(전부 `src/resolver/approval/__test__/`에, 실제 `ApprovalRepository` + execute 모의 — 재현 하네스 방식)
- `EngineConsistency.test.js`
  - R01 ① a APPROVE·b REJECT 동시(클레임 둘 다 통과시키는 하네스) → 최종 status === deriveStatus(결정 전체) === REJECTED, 종료 CAS 는 decidedCount 조건으로 1회만 성공, APPROVED 가 저장되는 순간이 없다(모든 `UPDATE approval_request` 호출 기록 검사).
  - R01 ② 종료 뒤 늦은 클레임이 통과한 척(하네스가 EXISTS 를 무시) → 재조회 종료+파생 불일치 → 클레임 되돌림 UPDATE 1 + 이벤트 DELETE + REJECT 는 ALREADY_DECIDED / APPROVE 는 종료 상태 반환.
  - R01 ③ 2명 전원 승인(requiredApprovals 2) a·b 동시 APPROVE → 둘 다 성공 반환, 최종 APPROVED, currentStepOrder 3.
  - R01 ④ 클레임 SQL 에 EXISTS(PENDING) 가 있고, 결정 CAS SQL 에 COUNT 조건과 바인딩 값이 있다(SQL 모양 고정).
  - R02 ① 클레임 뒤 이벤트 INSERT 실패 → 같은 사용자 재시도 → 이벤트 1건·aggregate APPROVED·투영 갱신, 반환 status APPROVED. ② 이벤트까지 쓰고 CAS 전에 끊김 → 재시도 수렴. ③ CAS 까지 성공하고 투영에서 끊김 → 재시도는 my_decided 문장만. ④ 진짜 멱등(아무것도 빠지지 않음) → SQL 0(load 제외).
  - R03 ① 투영 SQL 에 `req_rev <= ?`·`my_decided=0` 이 있고 my_decided 문장이 먼저다. ② rev 3 투영 뒤 rev 2 투영 호출 → 하네스가 WHERE 를 흉내 내 0행. ③ myturn 탭 SQL 에 `my_decided = 0`.
  - R04 ① 회수 CAS 패배(다른 승인이 APPROVED 로 종료) → CANCELLED 이벤트 DELETE 호출, 반환 status APPROVED, events 에 CANCELLED 없음. ② 같은 전이가 다른 호출로 성공(상태 CANCELLED) → DELETE 없음. ③ closeBySystem 시도 소진 → DELETE.
- 기존 `ApprovalRepository.test.js` 의 결정 경로 SQL 순서·횟수 단언을 새 순서(클레임 → 재조회 → 이벤트 → CAS → 투영[my_decided → aggregate])에 맞게 고친다. 유휴 SQL 예산 테스트(`src/trigger/__test__/idleSqlBudget.test.js`)는 결정 경로를 세지 않으므로 바뀌지 않아야 한다(확인).
- 백엔드 전체 녹색.

## 6. 문서
- `CLAUDE.md` 불변식 2·4 아래 또는 "변경 이력"에 2026-10-28 행: "결정 수락·확정 결속(클레임은 부모 PENDING 일 때만, 종료 CAS 는 결정 수 일치 때만, 늦은 결정은 되돌림), 재시도 수렴, 투영 세대 가드, 진 회수·만료 이벤트 거두기".
- `AGENTS.md` 에 결정 저장 순서 한 줄(있는 절에 맞춰).

## 7. 하지 않는 것
- 결정 작업 기록(outbox)·복구 커서 — SQL 추가(major)라 상용 뒤. 사유·대리인은 같은 사용자 재시도에서만 복원된다(REVIEW 가 말한 "시스템 복구"는 후속).
- 외부 적용(상태 변경 자동 전환) 순서 변경 — 종료 CAS 가 결정 전체와 결속되므로 잘못된 종료 자체가 생기지 않는다.
- 멀티 테이블 UPDATE·트랜잭션. 도메인 함수 수정.
- git/forge 명령. `tmp/`·`_workspace/` 는 커밋 대상 아님.
