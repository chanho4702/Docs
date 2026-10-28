# 승인 엔진 정합성 수정 보고 — R01·R02·R03·R04

> 2026-10-28 · 설계 `engine-fix-design.md` · 대상 `src/resolver/approval/ApprovalRepository.js`, `src/resolver/inbox/InboxRepository.js`
> 도메인(`src/domain/approval/*`) 무수정. SQL 마이그레이션·컬럼·테이블 추가 없음. 멀티 테이블 UPDATE·트랜잭션 없음. git·forge 명령 실행 없음.

## 1. 바꾼 함수와 새 저장 순서

| 함수 | 변경 |
|---|---|
| `claimDecision` | WHERE 에 부모 `status='PENDING' AND commit_state='LIVE'` EXISTS 추가(1.1) |
| `retractClaim` (신규) | 늦은 클레임 되돌림 — 내가 쓴 값과 정확히 같을 때만 PENDING 으로 조건부 UPDATE(불변식 5). 실패는 로그 코드만 |
| `retractEvent` (신규) | `DELETE FROM approval_event WHERE request_id=? AND event_id=?` best-effort |
| `casAggregate(id, rev, next, { decidedCount })` | `decidedCount` 가 정수면 결정 수 COUNT 서브쿼리 조건 추가. 생략 시 조건 없음(회수·만료) |
| `updateProjection` | my_decided 문장을 **먼저**(actorKey 있을 때만), aggregate 문장에 `my_decided = 0`·`req_rev <= ?` |
| `actorProjectionCurrent` (신규) | 재시도 수렴용 — 행위자 업무함 행의 `my_decided=1 AND req_rev >= rev` 확인 SELECT |
| `decideReady` | 클레임 뒤 `settleDecision` 으로 위임. 이미 내 결정이 행에 있으면 `convergeDecision` |
| `convergeDecision`·`settleDecision`·`completeReflected`·`rejectLateDecision`·`replayedDecisionEvent` (신규) | §2 참조 |
| `discardUnconfirmedEvent` (신규), `closeBySystem`, `cancel` | CAS 에서 진 전이 이벤트 거두기(R04) |
| 모듈 함수 `aggregateOf`·`isLagging`·`decidedCountOf`·`withEvent`·`warnTerminalMismatch` | 신규 |
| `InboxRepository.INBOX_TABS.myturn` + `applyTab` | `decided:false` → `my_decided = 0` (목록·`statusCounts` 모두 applyTab 경유) |
| `InboxRepository.myTurnCount` (배지) | `my_decided = 0` 추가 |

### 결정 경로 순서

```
load → (REJECT 이면서 내 REJECT 행 존재 | APPROVE idempotent) → convergeDecision
     → 도메인 전이(검증) → claimDecision(부모 PENDING EXISTS)
       실패: APPROVE → load 반환 / REJECT → ALREADY_DECIDED (기존 그대로)
     → settleDecision 루프(최대 3회):
         load(재조회)
         종료 상태:  파생 == 저장 → completeReflected(내 이벤트 없으면 INSERT + 투영) → 반환
                    파생 != 저장 → retractClaim + (이번 호출이 쓴 이벤트면) retractEvent
                                   → APPROVE: 종료 상태 반환 / REJECT: ALREADY_DECIDED
         PENDING:   aggregateOf(결정 전체) → appendEvent → casAggregate(rev, decidedCount)
                    성공 → updateProjection[my_decided → aggregate(req_rev <= rev+1)] → 반환
                    실패 → sleep(20·2^n + jitter) → 다음 시도
       소진 → CONCURRENT_MODIFICATION (클레임은 남음 — 재시도가 수렴)
```

`convergeDecision`: 종료+파생 일치 → `completeReflected`(이벤트·투영 빠진 것만) / 종료+불일치 → `[APPROVAL] terminal mismatch` 경고(APPROVED·REJECTED 일 때만) 후 그대로 반환 / PENDING+뒤처짐 없음 → `completeReflected` / PENDING+뒤처짐 → 클레임 생략한 `settleDecision`.

회수·만료(`cancel`·`closeBySystem`): appendEvent → CAS 실패 → 재조회. 재조회 상태가 이 전이의 목표 상태와 다르면(다른 전이로 종료 또는 시도 소진 후 PENDING) 이벤트를 DELETE 하고 반환 상태의 events 에서도 뺀다. 같은 목표 상태면 남긴다. `cancel` 은 마지막 시도 뒤에도 재조회한다(이전엔 마지막 시도 뒤 재조회 없이 throw).

## 2. SQL 전·후

**클레임**
```sql
-- 전
UPDATE approval_approver SET decision_type=?, decided_at=?
 WHERE request_id=UUID_TO_BIN(?) AND step_order=? AND actor_key=? AND decision_type='PENDING'
   AND NOT EXISTS (… 재개 기간 …)
-- 후 (바인딩 순서 동일)
   … AND decision_type='PENDING'
   AND EXISTS (SELECT 1 FROM approval_request r
     WHERE r.request_id=approval_approver.request_id AND r.status='PENDING' AND r.commit_state='LIVE')
   AND NOT EXISTS (… 재개 기간 …)
```

**결정 CAS** (회수·만료는 전과 같음)
```sql
-- 후: 기존 WHERE request_id=? AND rev=? AND status='PENDING' 뒤에
   AND (SELECT COUNT(*) FROM approval_approver p
         WHERE p.request_id=approval_request.request_id AND p.decision_type <> 'PENDING') = ?
-- SET 절 rev = rev + 1 유지. 바인딩 끝에 decidedCount 1개 추가.
```

**투영**
```sql
-- 전: ① aggregate(WHERE request_id=?) ② my_decided
-- 후: ① (actorKey 있을 때만)
UPDATE approval_inbox SET my_decided=1 WHERE request_id=UUID_TO_BIN(?) AND actor_key=? AND role='APPROVER'
--     ②
UPDATE approval_inbox
   SET status=?, is_open=?, current_step_order=?, current_step_name=?, updated_at=?, req_rev=?,
       my_turn = CASE WHEN ? = 1 AND role='APPROVER' AND step_order = ? AND my_decided = 0 THEN 1 ELSE 0 END
 WHERE request_id=UUID_TO_BIN(?) AND req_rev <= ?
```

**신규 문장**: `retractClaim`(UPDATE approval_approver SET decision_type='PENDING', decided_at=NULL … AND decision_type=? AND decided_at=?), `retractEvent`(DELETE FROM approval_event …), `actorProjectionCurrent`(SELECT my_decided, req_rev FROM approval_inbox … LIMIT 1).

**업무함**: myturn 목록·상태 count·배지 count 에 `my_decided = 0`(리터럴 whereRaw).

## 3. 결정 1건당 SQL 수 (테이블 준비 프로브 제외)

| 경로 | 전 | 후 |
|---|---|---|
| 정상 결정(경합 없음) | load 3 + 클레임 1 + 이벤트 1 + CAS 1 + 투영 2 = **8** | load 3 + 클레임 1 + **재조회 3** + 이벤트 1 + CAS 1 + **이벤트 재기록 1**(검토 P2-3) + 투영 2 = **12** |
| 성공한 회수·만료 | 이벤트 1 + CAS 1 + 투영 2 | + 이벤트 재기록 1(검토 P2-3) |
| 경합에서 진 쪽(상대가 내 결정까지 반영해 종료) | 이벤트 쓴 뒤 종료 상태 반환 — 내 my_decided 미반영 | + 이벤트(중복 무해) + 투영 2 |
| 진짜 멱등 재클릭 | load 3 | load 3 + 업무함 SELECT 1(쓰기 0) |
| 시스템 투영(만료·회수 actor 없음) | 투영 2 | 투영 1(actor NULL 이면 my_decided 문장 생략) |
| CAS 실패 재시도 1회당 | sleep + load 3 + 이벤트 + CAS | 같음 |

유휴 SQL 0 추가 — `idleSqlBudget.test.js` 무변경(결정 경로를 세지 않음).

## 4. 설계와 다르게 한 곳

1. **재조회 비용 +3 SELECT**(설계 "+1 SELECT"). 설계대로 `load()` 를 재사용했는데 load 가 요청·결재자·이벤트 3문장이다. 결재자·요청만 읽는 경량 재조회로 줄일 수 있으나(+2) 이벤트 목록이 내 이벤트 존재 판정에 필요해 그대로 두었다. 리더 판단 필요.
2. **재계산은 도메인 전이 재호출 대신 `aggregateOf`**(derive 함수 조합, transitions.js `settle` 과 동일). 재조회 스냅숏에서 내 결정을 빼고 `approve/reject` 를 다시 부르면, 같은 단계의 다른 결정이 이미 그 단계를 통과시킨 경우(1명 통과 단계에 a·c 동시 승인 — 흔한 경합) 전이가 `APPROVER_STEP_NOT_REACHED` 로 던진다. 이벤트는 첫 전이 결과의 것(결정적 id)을 그대로 쓴다. 테스트 "재계산한 aggregate 는 도메인 전이의 next 와 같다"로 대조.
3. **"종료 + 파생 일치 → return state" 에 내 이벤트·투영 채우기 추가**. 설계 그대로면 경합에서 진 쪽의 감사 이벤트(반려 사유 포함)와 my_decided 가 영영 안 쓰인다(R01 ③·① 에서 확인).
4. **R02 ③: 재시도는 my_decided 문장만이 아니라 투영 2문장을 같은 세대로 다시 쓴다.** 투영 중 어느 문장에서 끊겼는지 모르고, my_turn 갱신은 aggregate 문장에 있다. `req_rev <= ?` 라 같은 세대 재투영은 무해.
5. **R02 ④: "SQL 0" 대신 쓰기 0 + SELECT 1.** 설계 §2 의 "!lag && !eventMissing → return state" 로는 "CAS 성공 뒤 투영에서 끊김"(R02 ③)을 감지할 수 없다 — 둘을 함께 만족하려면 업무함 행을 읽어야 한다.
6. **REJECT 재시도 수렴 추가.** 도메인 `reject` 에는 멱등 분기가 없어 설계 §2(`result.idempotent`)가 APPROVE 만 덮는다. 내 REJECT 가 이미 행에 있으면 `convergeDecision` 으로 보낸다. 부수 효과: 이미 내가 반려해 종료된 요청을 다시 반려하면 전에는 `REQUEST_NOT_PENDING`, 이제는 종료 상태 반환(APPROVE 멱등과 대칭). 서비스 계층(`decideApproval`)은 열어 보기만 했고 그 앞단 검사는 그대로다.
7. **늦은 결정 판정에 CANCELLED·EXPIRED 포함.** 재조회 상태가 CANCELLED·EXPIRED 면 파생(PENDING/APPROVED/REJECTED)과 항상 달라 늦은 결정으로 되돌린다. 수렴 경로의 mismatch 경고는 APPROVED·REJECTED 일 때만(회수·만료는 다른 게 정상).
8. 늦은 APPROVE 반환 상태는 되돌림이 성공했으면 `decisions` 의 내 항목을 `{PENDING, null}` 로, 이벤트 DELETE 가 성공했으면 `events` 에서 뺀다.
9. 좁은 창 시뮬레이션: §5 "R01 ②" 의 "이벤트 DELETE" 는 설계 순서상 첫 시도에서는 일어나지 않는다(이벤트를 쓰기 전에 종료를 본다). 그래서 ②를 셋으로 나눴다 — 부모 조건 우회(DELETE 없음, REJECT→ALREADY_DECIDED), APPROVE 늦은 클레임(그 사이 회수, 종료 상태 반환), 결정 수 조건까지 우회해 이벤트까지 쓴 경우(DELETE 1).

## 5. 테스트

**신규** `src/resolver/approval/__test__/EngineConsistency.test.js` — 25건. 실제 `ApprovalRepository`(load 포함) + 조건부 UPDATE 의 WHERE 를 흉내 내는 상태 있는 SQL 모의.
- R01(8): ① 동시 APPROVE·REJECT(APPROVED CAS 가 count 조건으로 짐, 종료 CAS 1회, 두 이벤트·my_decided) ② 부모 조건 우회 늦은 반려 ② 늦은 승인(회수됨) ② 좁은 창(이벤트 DELETE) ③ 2명 전원 승인 동시(currentStepOrder 3) ④ 클레임·CAS SQL 모양과 바인딩 ④ 회수 CAS 에 count 조건 없음 · 재계산 = 도메인 next
- R02(6): ① 이벤트 실패 ② CAS 실패 ③ 투영 실패 ④ 진짜 멱등 ⑤ 반려 재시도 ⑥ 종료 불일치는 고치지 않음
- R03(5): ① SQL 순서·조건 ① 시스템 투영은 1문장 ② 옛 세대 투영 0행 ② 전원 승인 중간 결정자 my_turn 0 ③ myturn 목록·count·배지 SQL
- R04(6): ① 회수 패배 DELETE ② 같은 전이 성공 시 유지 ③ 만료 시도 소진 DELETE ③ 만료 중 다른 종료 DELETE ③ 회수 시도 소진 DELETE+CONCURRENT_MODIFICATION · 성공 시 유지

**수정** `src/resolver/approval/__test__/ApprovalRepository.test.js` — 2건 단언 갱신 + 1건 추가(22건):
- CAS 3회 실패: request load 3 → 4(클레임 뒤 재조회), sleep [20,40,80] 유지
- 투영 2문장: 순서 my_decided → aggregate, `req_rev <= ?` 단언 추가
- 신규 "결정 저장 순서" — load 3 → 클레임 → load 3 → 이벤트 → CAS → my_decided → aggregate

**결과**: `src/resolver/approval`·`src/resolver/inbox/__test__/InboxRepository.test.js`·`src/trigger/__test__/idleSqlBudget.test.js` — 23 suites / 306 tests 통과.

**백엔드 전체**: §7 참조.

**진단 재현** `tmp/full-audit-2026-10-28/engine.repro.test.js`: R01·R02·R03 은 예상대로 깨진다. **R04 는 아직 통과한다** — 그 하네스가 `DELETE` 를 모델링하지 않아(UNEXPECTED_QUERY 를 던지고 `retractEvent` 가 best-effort 로 삼킨다) 이벤트 배열이 그대로 남기 때문이다. 하네스 한계라 수정하지 않았다(규칙상 tmp/ 수정 금지). 정식 회귀는 EngineConsistency R04 ①.

## 6. 미검증

- **TiDB 실측 없음**: ① UPDATE approval_request 의 WHERE 안 `approval_approver` COUNT 상관 서브쿼리 ② UPDATE approval_approver 의 WHERE 안 `approval_request` EXISTS 상관 서브쿼리. 둘 다 대상 테이블과 다른 테이블을 참조하므로 MySQL 1093 제약에는 걸리지 않는다고 보지만 Forge SQL 에서 실행해 보지 않았다. 기존 `claimDecision` 의 NOT EXISTS(timesheet_submission JOIN) 와 `abandonDraft` 이후 업무함 DELETE 의 EXISTS 는 운영 중인 같은 형태라 근거는 있다.
- **격리 수준**: 문장 내 서브쿼리가 보는 스냅숏 시점(TiDB 비관 트랜잭션 기본, 문장 단위 자동 커밋). 두 문장이 겹친 창에서 늦은 클레임이 통과하는 경우는 재조회 되돌림으로 막지만, 실제 창 크기와 결정 수 조건의 CAS 거절률은 실측 전이다.
- 확인 방법(배포 후 dev): 1명 통과 단계의 두 결재자가 같은 초에 승인·반려 → `approval_request.status` 와 결재자 행 파생이 같은지, `approval_event` 두 건 확인. 리더가 `04_spike_todo.md` 류에 옮길 항목(이 작업에서는 `_workspace/` 의 해당 파일을 만들지 않았다).

## 7. 백엔드 전체 테스트와 환경

- 작업 전 기준 실행: **205 suites 중 1 실패, 3,064 tests 중 2 실패**(다른 작업자의 진행 중 파일 — `src/resolver/inbox/__test__/InboxListIncomplete.test.js`·`InboxService.test.js`, 이 작업과 무관).
- 작업 후 전체 실행 중 다른 작업자가 의존성을 갱신하고 있어(`package-lock.json` 15:20 수정, `node_modules/@babel/preset-env` 일시 소실) 다수 스위트가 `Cannot find module '@babel/preset-env'` 로 실행 불가였다. npm 설치는 하지 않았다(병렬 작업 금지 사항). 설치가 끝난 뒤 다시 돌렸다.
- **최종 `npx jest --silent`: 212 suites / 3,122 tests 전부 통과**(다른 작업자의 새 테스트 포함. 이 작업분은 신규 25건 + 기존 파일 1건 추가).

## 8. 문서

- `CLAUDE.md` 변경 이력(제품)에 2026-10-28 행.
- `AGENTS.md` 불변식 체크리스트에 결정 저장 순서 한 줄.

## 발견(범위 밖, 고치지 않음)

- `cancel` 이 투영에 `actorKey: input.actorKey`(요청자)를 넘겨 요청자가 같은 요청의 결재자이기도 하면 그 결재자 행 my_decided 가 1 이 된다(기존 동작).
- `waiting` 탭(`my_turn = 0`)에는 이제 전원 승인 단계에서 이미 결정한 사람도 들어간다(전에는 myturn 에 남았다). 의도에 맞다고 보지만 화면 문구 확인 필요.
- 경합에서 진 APPROVE 호출이 REJECTED 종료 상태를 받으면, 서비스는 `lastEvent` 가 APPROVED 라 APPROVED 알림을 보낸다(요청 상태는 REJECTED). 기존에도 같은 경로가 있었다. `ApprovalService` 는 다른 작업자 소관이라 열어 보기만 했다.

## 검토 반영 (재작업 1회차 — Codex gpt-6-astra xhigh 독립 검토, 2026-10-28)

| 항목 | 수정 | 위치 |
|---|---|---|
| **P1-1** 남의 늦은 반려가 내 정상 승인을 되돌림 | 늦은 결정 판정을 "저장 상태 ≠ 파생"에서 **"내 결정이 종료 상태와 모순"**(`contradictsTerminal`: APPROVED + 내 REJECT)으로 좁혔다. APPROVED + 내 APPROVE, REJECTED + 어떤 결정은 성공 반환(내 이벤트·투영 채움). 이번 호출이 클레임했고 종료가 CANCELLED·EXPIRED 면 여전히 내 클레임만 되돌린다(아래 '설계와 다른 점' a) | `ApprovalRepository.settleDecision` |
| **P1-2** 끊긴 되돌림이 재시도로 복구 안 됨 | 되돌림을 `undoLateDecision` 하나로 묶어 수렴 경로도 쓴다. 재시도에서 APPROVED + 내 REJECT 행이면 클레임(DB 값 그대로)과 내 REJECTED 이벤트를 다시 되돌리고 ALREADY_DECIDED | `convergeDecision`·`undoLateDecision` |
| **P2-3** 거두기가 남의 성공 이벤트를 지움 | ① 아직 PENDING 이라 판정한 거두기 DELETE 에 `AND EXISTS (SELECT 1 FROM approval_request r WHERE r.request_id=approval_event.request_id AND r.status='PENDING')`(`retractEvent(..., { whilePending: true })`) ② 성공한 결정·회수·만료는 CAS 직후 같은 이벤트를 `appendEvent` 로 한 번 더 기록(멱등, +1 SQL — 성공 경로만, 유휴 0) | `retractEvent`·`discardUnconfirmedEvent`·`settleDecision`·`closeBySystem`·`cancel` |
| **P2-4** 목표가 같아도 다른 id 의 진 이벤트가 남음 | CAS 패배 후 재조회 상태가 목표 상태와 같을 때, 재조회 이벤트에 **같은 종류의 다른 id** 가 있으면 내 것을 지운다(요청자·관리자 동시 회수, 만료 사유 경합). 내 id 뿐이면 같은 id 의 다른 호출이 성공한 것이라 남긴다. 둘 다 있고 내 id 의 다른 호출이 승자였던 드문 경우는 승자의 ②재기록이 복원한다(타이밍상 재기록이 거두기보다 앞서면 유실 가능 — 한계) | `discardUnconfirmedEvent` |
| **P2-5** REJECT 재시도가 Jira 반려 코멘트·멘션을 중복 발행 | 저장소가 이번 호출에서 새로 기록한 것이 없으면 `idempotent: true`(진짜 멱등 재시도, 이미 반영된 수렴, 늦은 결정 되돌림 반환, APPROVE 클레임 0행 반환, CANCELLED·EXPIRED 수렴). `ApprovalService.decideApproval` 은 그 표식이면 앱 내 알림·STEP_OPENED·afterDecide·notifyExternal(Jira 코멘트 포함) 없이 같은 shape(`{requestId,status,currentStepOrder[,apply:null]}`)으로 반환 | `ApprovalRepository`·`ApprovalService.decideApproval` |
| **P2-6** 지연 투영이 my_turn=1·my_decided=1 을 남김 | my_decided 문장을 `SET my_decided=1, my_turn=0` 으로 | `updateProjection` |
| **P2-7** 대리 결재 부분 실패가 수렴 경로에 못 감 | `delegatorFor(state, principal, { recover: true })`(결정 경로만): 위임자 중 **결정 행은 있는데 그 결정의 이벤트(결정적 id 로 대조)가 없거나 진행 중 aggregate 가 파생보다 뒤처진** 사람을 먼저 후보로 본다. 종료된 요청이라도 이벤트가 빠졌으면 후보. 화면 조회·WorklogCreate 어댑터의 기본 호출은 기존 규칙 그대로 | `ApprovalService.delegatorFor`·`unconvergedDecisionKeys` |

### 설계·지시와 다른 점
a. **P1-1 의 CANCELLED·EXPIRED.** 지시는 "APPROVED + 내 REJECT 만 늦은 결정"이지만, **이번 호출이 방금 클레임한** 결정이 회수·만료로 닫힌 요청에 붙은 경우는 계속 되돌린다. 회수·만료 CAS 는 결정 수를 보지 않아 내 클레임은 반영된 적이 없고, 되돌리는 것은 내 행뿐이라 P1-1 의 위험(다른 사람의 결정 때문에 내 결정을 되돌림)과 무관하다. 성공으로 두면 회수된 요청에 승인 이벤트가 새로 생긴다. 재시도 수렴 경로(클레임이 이번 호출 것이 아님 — 앞 단계의 정상 결정일 수 있음)에서는 되돌리지 않는다.
b. **P2-5 의 `recovered`.** 지시는 "진짜 멱등·수렴 재시도 모두 idempotent" 였지만, 앞선 호출이 이벤트·CAS·투영 중간에 끊겼다면 그 호출은 예외로 끝나 서비스 후속 처리(알림·afterDecide·Jira 코멘트)를 한 번도 하지 않았다. 그 재시도가 표식 때문에 후속 처리까지 건너뛰면 상태 변경 자동 적용·필드 적용·알림이 영영 나가지 않는다. 그래서 **이번 호출이 무엇이든 새로 기록한 수렴은 `recovered: true`(idempotent 아님)** 로 두어 후속 처리를 한 번 하게 했다. 중복 위험이 있는 쪽(저장소는 끝났고 그 뒤 서비스 단계가 돌았을 수 있는 경우)은 "새로 쓴 것 없음"이라 항상 idempotent 다. 남는 한계: 저장소 기록이 끝난 뒤 서비스 후속 처리 도중 런타임이 죽은 경우, 같은 입력의 재시도는 idempotent 라 후속 처리를 다시 하지 않는다(필드 변경은 기존 "다시 적용", 상태 변경은 Jira 쪽에서 사람이 진행).
c. **P2-3 ② 결정 경로 +1 SQL** — 결정 1건 12문장. 결정 이벤트를 지우는 경로는 늦은 결정 되돌림(내 모순 결정의 이벤트)뿐이라 결정 경로에서 실제 복원이 일어날 일은 거의 없지만, 지시대로 세 경로 모두 넣었다.

### 새·수정 테스트
- `EngineConsistency.test.js` 25 → **36건**: 검토 반영 11건(P1-1 2 · P1-2 1 · P2-3 4(① 1 + ② 회수·만료·결정 3) · P2-4 2 · P2-5 1 · P2-6 1). 기존 단언 3건 갱신(투영 SQL `my_turn=0`, R02 ③ 문장 정규식, R02 ⑥ — 옛 불일치 종료에서 상태는 그대로 두고 내 이벤트·투영만 채움). 하네스: 가드된 DELETE 흉내, `beforeDelete` 훅, my_decided 문장의 my_turn=0.
- 신규 `ApprovalServiceDecisionRetry.test.js` **7건**: P2-5 3(APPROVE·REJECT idempotent 건너뛰기 2, 새 결정·recovered 는 후속 처리 1) · P2-7 4(이벤트 빠진 위임자 → 위임자 이름, 종료 요청도 대상, 수렴된 위임자 제외, 화면 조회 기본값은 미적용).
- `ApprovalRepository.test.js` 저장 순서 단언에 이벤트 재기록 추가.

### 결과
- 백엔드 전체 `npx jest --silent`: **213 suites / 3,143 tests 전부 통과**.

### 추가 미검증
- 거두기 DELETE 의 `EXISTS (approval_request …)` 상관 서브쿼리(단일 테이블 DELETE + 다른 테이블 서브쿼리) — TiDB 실측 없음.
- P2-4 의 "같은 id 승자 + 다른 id 패자 이벤트가 둘 다 있는" 경합에서 승자 재기록이 거두기보다 먼저 끝나면 승자 이벤트가 유실될 수 있다(이론상, 단위 테스트로 재현하지 않음).

## 검토 반영 (재작업 2회차 — 최종, 리더 지시 "단순 규칙")

| # | 규칙 | 구현 위치 |
|---|---|---|
| 1 | 다시 읽었을 때 요청이 CANCELLED·EXPIRED 로 끝나 있으면 클레임·이벤트를 되돌리지 않고, APPROVE·REJECT 모두 종료 상태를 `idempotent:true` 로 반환. `claimedNow` 분기 삭제 | `atTerminal` |
| 2 | 되돌림(`undoLateDecision`)은 모순이 확실할 때만: APPROVED + 내 REJECT, 또는 REJECTED + 내 APPROVE 이면서 내 이벤트가 아직 없을 때. 이벤트가 이미 있으면 그대로 두고 `idempotent`, 업무함 my_decided 만 같은 세대로 재투영 | `contradictsTerminal`, `atTerminal`, `reprojectActor` |
| 3 | 결정 행은 PENDING 으로 돌아갔는데 종료 요청에 모순인 내 이벤트가 남아 있으면 재시도가 다시 지운다(REJECT → ALREADY_DECIDED, APPROVE → 종료 상태 idempotent) | `decideReady` 첫 분기 |
| 4 | 회수·만료 패자의 이벤트는 최종 상태 ≠ 내 목표 상태일 때만 지운다. "다른 id 가 있으면 지운다" 분기 삭제. PENDING 때 DELETE 의 `EXISTS(status='PENDING')` 가드·승자의 CAS 직후 재기록 유지 | `discardUnconfirmedEvent` |
| 5 | `recovered:true` 는 이번 호출의 이벤트 INSERT 가 새 행을 넣었을 때만(rowsAffected ≥ 1). 이벤트가 이미 있던 재시도는 `idempotent` | `appendOwnEvent`(ctx.inserted), `convergeDecision` |
| 6 | 대리인 경유 복구 삭제 — `delegatorFor` 원래 규칙, `unconvergedDecisionKeys`·`{recover}` 제거 | `ApprovalService.delegatorFor` |
| 7 | 저장소 반환 `ownEvent`(이번 결정의 내 이벤트)로 앱 내 알림·STEP_OPENED·외부 알림 판정 | `ApprovalService.decideApproval` |

1회차와 달라진 동작: 동시 승인·반려는 어느 경우든 결정 전체의 REJECTED; 회수로 닫힌 요청의 늦은 클레임은 되돌리지 않음; 요청자·관리자 동시 회수는 이벤트 둘 남음; 대리인 재시도는 APPROVER_NOT_ELIGIBLE/REQUEST_NOT_PENDING. 결정 1건 SQL 12, 유휴 SQL 0 추가.
테스트: EngineConsistency 42건(규칙 테스트 12 추가, 1회차 6 삭제), ApprovalServiceDecisionRetry 8건, ApprovalRepository 22건. 백엔드 전체 213 suites / 3,150 tests.

## 한계
1. 종료 CAS 에 내 클레임이 포함됐는지 증명할 수 없다 — REJECTED + 내 APPROVE + 이벤트 있음: 반영되지 않은 승인 이벤트가 남을 수 있다(상태는 REJECTED, 감사엔 "반려 뒤 승인 시도"); 이벤트 없음: 실제 포함된 승인이어도 지워진다(상태 동일).
2. 회수·만료로 닫힌 요청에 종료 직전·직후의 결정 행·이벤트가 남는다(상태 모순 없음).
3. 서로 다른 두 사람의 동시 회수·만료 사유 경합은 이벤트가 둘 남는다("시도 둘").
4. 대리 결재 중 부분 실패는 대리인 재시도로 복구되지 않는다(위임자 본인 재시도만, 그때 delegateKey 는 빈다).
5. `idempotent` 재시도는 알림·afterDecide·Jira 코멘트를 내지 않는다 — 앞 호출이 이벤트까지 쓰고 CAS·투영에서 끊긴 경우, 저장 뒤 후속 처리 중 런타임이 죽은 경우 후속 처리가 안 나갈 수 있다.
6. 같은 id 승자의 이벤트 유실(이론상): PENDING 판정 DELETE 와 승자의 CAS 직후 재기록이 겹치고 재기록이 먼저 끝나는 경우.
7. 반려 사유·대리인 정보는 같은 사용자의 재시도 입력에서만 복원(outbox 는 SQL 추가 — 상용 뒤).
8. **TiDB 실측 없음**: 상관 서브쿼리 3종(결정 CAS COUNT·클레임 EXISTS·이벤트 DELETE EXISTS). dev 에서 승인·반려·회수 1회씩 실측 필요.
