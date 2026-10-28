# T4 — ApprovalRepository (낙관적 동시성 CAS 5종)

## 배경

Confluence DC 승인 앱의 Forge(Cloud) 이식 프로젝트다. **이 작업이 전체 설계의 심장이다.**

DC는 Beehive 클러스터 락으로 상태 전이를 직렬화했다. **Forge에는 락이 없고 트랜잭션도 없다.**
그래서 락이 지키던 것을 "UNIQUE 제약 + 조건부 UPDATE의 affectedRows + 순수 함수로 재계산 가능한
파생 상태"로 옮긴다.

핵심 성질:
> `approval_approver`의 결정 행이 **유일한 진실**이고,
> `approval_request.status`/`current_step_order`는 **언제든 재계산 가능한 캐시**다.
> 그래서 CAS가 실패해도 재조회 → 재계산 → 재시도가 항상 같은 값으로 수렴한다.

**반드시 먼저 읽을 것**:
- 저장소 루트 `CLAUDE.md`(불변식 9개 — 특히 2·3·4·5), `AGENTS.md`
- `src/domain/approval/transitions.js` — 이미 구현된 순수 전이 함수. **규칙을 다시 구현하지 말 것.**
  이 Repository는 `transitions`가 돌려주는 `changes` 를 SQL 바인딩으로 옮기기만 한다.
- `src/domain/approval/derive.js`, `scopeKey.js`, `eventId.js`
- `src/rdb/query/CommonQuery.js` — `executeQuery`, `NOOP_WRITE`, `isDuplicateKeyError`
- `src/rdb/schema/ddl/` — 테이블 정의 (T1에서 만들어진 상태)

## 건드릴 파일 (이 목록 밖의 파일은 수정하지 말 것)

```
src/resolver/approval/ApprovalRepository.js          (신규)
src/resolver/approval/__test__/ApprovalRepository.test.js  (신규)
```

## 구현할 것

### 공통

- 모든 SQL은 `executeQuery(sql, params)`를 경유한다. `sql.prepare`를 직접 부르지 않는다.
- UUID PK는 `BINARY(16)`이다. 쓰기는 `UUID_TO_BIN(?)`, 읽기는 `BIN_TO_UUID(col)`.
- **DML 결과는 `rowsAffected` alias로만 읽는다.** SDK 원본(`rows.affectedRows`)을 직접 읽지 않는다.
- **모든 CAS UPDATE의 SET 절에 `rev = rev + 1`을 반드시 포함한다.**
  MySQL의 affectedRows는 "값이 **실제로 바뀐** 행"이라, 같은 상태로의 전이가 CAS 실패로 오판된다.
  이걸 빠뜨리면 재시도가 무한 루프한다.

### ① 요청 생성 — DRAFT → LIVE 단계적 커밋

`createRequest({ target, steps, requester, page, expiresAt, requestMessage, now })`

```
[사전 계산 — 락이 필요 없다. 결과가 INSERT 의 UNIQUE 판정에 영향을 주지 않는다]
  a. 만료된 열린 요청 lazy 정리 (조건부 UPDATE 한 문장):
       UPDATE approval_request
          SET status='EXPIRED', is_open=0,
              dedupe_key = CONCAT('closed:', BIN_TO_UUID(request_id)),
              updated_at=?, rev = rev + 1
        WHERE dedupe_key=? AND status='PENDING'
          AND expires_at IS NOT NULL AND expires_at <= ?
     → rowsAffected 1 이면 **내가 만료시킨 것**이므로 EXPIRED 이벤트·알림도 내 책임이다.
       (이 판정이 곧 DC 가 "락 안 반환값"으로 하던 중복 알림 방지다.)
  b. nextRevision: SELECT MAX(revision) ... WHERE page_id=? AND resource_type=? AND region_id <=> ?

[커밋 구간]
  ① INSERT approval_request (commit_state='DRAFT', dedupe_key='open:'+scopeKey, rev=1, 전 컬럼)
       ↳ 중복키(1062) ⇒ 409 ALREADY_OPEN   ← **여기가 상호배제 지점**
  ② INSERT approval_approver  (다중 행 1문장)
  ③ INSERT approval_event     (REQUESTED, 결정적 id)
  ④ INSERT approval_inbox     (다중 행 1문장 — APPROVER 행 + REQUESTER 행)
  ⑤ UPDATE approval_request SET commit_state='LIVE', rev=rev+1
       WHERE request_id=? AND commit_state='DRAFT'        ← **커밋 지점**
  ⑥ INSERT approval_notification (다중 행 1문장, INSERT IGNORE)
```

**왜 보상 삭제가 아니라 DRAFT 인가**: 보상 DELETE 가 실패하면 `open:` 키가 **영구 점유**되어
그 페이지에 다시는 요청을 만들 수 없고 사용자가 스스로 복구할 방법이 없다.
DRAFT 행은 모든 조회가 `commit_state='LIVE'` 로 걸러 **보이지 않고**, dedupe 는 계속 점유해
동시 생성을 막으며, 리퍼가 정리해 자동 복구된다.

⑤ 이후 실패(⑥ 알림)는 **무해**하다 — 알림 누락은 리컨실이 backfill 한다.
⑤ 이전 실패는 전부 "없던 일"이 된다. 실패 지점을 이 둘로만 나누는 것이 이 설계의 전부다.

⚠ `dedupe_key` INSERT 에 `ON DUPLICATE KEY UPDATE` 를 **절대 쓰지 않는다.**
   중복은 예외로 드러나야 409 가 된다. upsert 로 감추면 남의 요청을 조용히 빼앗는다.

### ② 결정 클레임 (승인/반려)

```
UPDATE approval_approver
   SET decision_type=?, decided_at=?
 WHERE request_id=UUID_TO_BIN(?) AND step_order=? AND actor_key=?
   AND decision_type='PENDING'
```
- rowsAffected 0 ⇒ 이미 결정됨.
  - APPROVE 재시도면 **멱등 성공**으로 처리(재조회 후 현재 상태 반환)
  - REJECT 면 409 `ALREADY_DECIDED`
- 이 조건부 UPDATE 가 "남의 결정을 덮을 수 없다"를 구조적으로 보장한다(불변식 5).

### ③ aggregate CAS

```
UPDATE approval_request
   SET status=?, is_open=?, current_step_order=?, current_step_opened_at=?,
       updated_at=?, rev = rev + 1
 WHERE request_id=UUID_TO_BIN(?) AND rev=? AND status='PENDING'
```
- rowsAffected 1 ⇒ 성공
- rowsAffected 0 ⇒ 다른 노드가 먼저 갱신함. **②를 되돌리지 않고** 재조회 → 재계산 → ③만 재시도.
  결정은 사실이고 상태는 파생이므로 재계산은 수렴한다.

### ④ 감사 이벤트 (멱등)

```
INSERT INTO approval_event (...) VALUES (...)
ON DUPLICATE KEY UPDATE event_id = event_id
```
`event_id` 는 `deterministicEventId()` 가 만든 결정적 값이다. 랜덤 UUID 를 쓰면
CAS 재시도마다 새 이벤트가 쌓여 감사 이력이 재시도 횟수만큼 부풀고 승인 카운트까지 오염된다.

### ⑤ 업무함 투영 갱신 — **DML 2문장**

```
UPDATE approval_inbox
   SET status=?, is_open=?, current_step_order=?, updated_at=?, req_rev=?,
       my_turn = CASE WHEN ? = 1 AND role='APPROVER' AND step_order = ?
                      THEN 1 ELSE 0 END
 WHERE request_id=UUID_TO_BIN(?)
```
```
UPDATE approval_inbox SET my_decided=1
 WHERE request_id=UUID_TO_BIN(?) AND actor_key=? AND role='APPROVER'
```
`my_turn` 이 **행 내부 비교**(step_order == current_step_order)로 환원되므로 결재자 수와 무관하게
2문장이면 전체 투영이 갱신된다. 행별 UPDATE 루프를 돌리면 결재자 10명에 10 round-trip 이
결정 응답 시간에 직렬로 붙는다.

### ⑥ 재시도 루프

```
for attempt in 1..3:
   state = await load(requestId)            // LIVE 만
   result = transitions.approve|reject(state, {...})   // 순수 함수
   claim  = await claimDecision(...)        // ②
   await appendEvent(...)                   // ④
   ok = await casAggregate(state.rev, ...)  // ③
   if (ok) { await updateProjection(...); return }
   await sleep(20 * 2^(attempt-1) + jitter)  // 20·40·80ms + 지터
throw ConcurrencyError(CONCURRENT_MODIFICATION)
```
`sleep` 은 테스트에서 주입 가능하게 인자로 받는다(테스트가 실제로 기다리면 안 된다).

### 재시도 정책 (표대로 정확히)

| 신호 | 재시도 | 결과 |
|---|---|---|
| aggregate CAS rowsAffected=0 | ✅ 3회 | 실패 시 409 `CONCURRENT_MODIFICATION` |
| `dedupe_key` 1062 | ❌ | 409 `ALREADY_OPEN` (설계된 상호배제다) |
| 결정 클레임 rowsAffected=0 | ❌ | APPROVE=멱등 성공 / REJECT=409 `ALREADY_DECIDED` |
| event/notification 1062 | ❌ | 무시(멱등) |
| 테이블 없음(1146) | ❌ | `isTableReady` 로 사전 차단, 기능 스킵 |

## 테스트 (`__test__/ApprovalRepository.test.js`)

`CommonQuery`를 목으로 만든다(`jest.mock('../../../rdb/query/CommonQuery')`).
DML 결과는 `{ rows: { affectedRows: n }, rowsAffected: n }` 형태를 재현한다.

최소한 아래를 덮는다:

1. 생성이 DRAFT → LIVE 순서로 진행되고, **커밋 UPDATE가 마지막에서 두 번째**다(알림이 그 뒤)
2. `dedupe_key` 1062 → `ALREADY_OPEN`, **재시도하지 않는다**(executeQuery 호출 횟수로 단언)
3. 커밋 전 실패 시 **보상 DELETE를 발행하지 않는다** (DRAFT로 남긴다)
4. 결정 클레임 SQL에 `AND decision_type='PENDING'`이 들어 있다
5. 모든 CAS UPDATE SQL에 `rev = rev + 1`이 들어 있다 (정규식으로 전수 검사)
6. aggregate CAS 실패 → 재조회 후 재시도, **3회 실패 시 CONCURRENT_MODIFICATION**
7. CAS 재시도 시 **결정 클레임을 되돌리는 SQL이 발행되지 않는다**
8. 투영 갱신이 **정확히 2문장**이다 (결재자가 5명이어도)
9. 이벤트 INSERT에 `ON DUPLICATE KEY UPDATE`가 있다
10. APPROVE 멱등: 클레임 0행 → 예외 없이 현재 상태를 반환한다
11. **`minimum_approvals`를 읽는 SELECT가 발행되지 않는다** (판정 경로가 파생값을 읽지 않음을 못 박는다)

## 완료 기준

- `npx jest --runInBand` 전부 통과
- 도메인 규칙을 Repository에서 재구현하지 않았을 것 (`transitions`/`derive` 호출만)
- `Date.now()`를 Repository 안에서 직접 읽지 않을 것 — `now`는 호출부가 넘긴다
