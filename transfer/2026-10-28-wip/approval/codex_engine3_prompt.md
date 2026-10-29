너는 Forge Jira 앱 moves-approval-jira(이 디렉터리)의 독립 코드 검토자(3차, 최종). **결함만** 찾아라. 없으면 "결함 없음"이라고만. 발견 시 P1/P2/P3·근거 파일:행·재현 순서를 한국어로. 파일은 네가 직접 읽어라(읽기 전용; 테스트 실행 불가 가정).

## 배경
승인 엔진 결정 저장 정합성(R01~R04). 2차 검토(P1 1·P2 7) 뒤 리더가 "단순 규칙"으로 재정리했다 — `_workspace/full-audit-2026-10-28/engine-fix-report.md` 의 "검토 반영 (재작업 2회차 — 최종)" 표와 "한계" 절(8개)을 먼저 읽어라. **한계 절에 이미 적힌 것은 다시 지적하지 마라.** 그 밖의 결함, 특히 ① 규칙 1~7 의 구현이 표와 다른 곳 ② 새 코드가 만든 **P1 급**(종료 상태 ≠ 결정 파생, 데이터 유실, 권한 확대, 무한 루프/영구 실패) ③ 기존 테스트 단언 변경이 숨긴 회귀 ④ 결정 1건 SQL 12문장 중 줄일 수 있는 것.

## 대상
`src/resolver/approval/ApprovalRepository.js`(atTerminal·contradictsTerminal·undoLateDecision·reprojectActor·discardUnconfirmedEvent·appendOwnEvent·convergeDecision·decideReady·closeBySystem·cancel·updateProjection), `src/resolver/approval/ApprovalService.js`(decideApproval 의 ownEvent·idempotent·recovered 처리, delegatorFor), `src/resolver/inbox/InboxRepository.js`, 테스트 `src/resolver/approval/__test__/{EngineConsistency,ApprovalServiceDecisionRetry,ApprovalRepository}.test.js`.
diff --git a/src/resolver/approval/ApprovalRepository.js b/src/resolver/approval/ApprovalRepository.js
index 8094a0d..beb9f7a 100644
--- a/src/resolver/approval/ApprovalRepository.js
+++ b/src/resolver/approval/ApprovalRepository.js
@@ -10,6 +10,12 @@ import {
   expireByDeadline as expireByDeadlineTransition,
 } from '../../domain/approval/transitions';
 import { assertRestoredSteps, stepNameOf } from '../../domain/approval/normalizeSteps';
+import {
+  currentStepOpenedAt as derivedStepOpenedAt,
+  currentStepOrder as derivedStepOrder,
+  deriveStatus,
+  stepOrderOf,
+} from '../../domain/approval/derive';
 import { deterministicEventId } from '../../domain/approval/eventId';
 import { openDedupeKey, targetKeyOf } from '../../domain/approval/scopeKey';
 import {
@@ -74,6 +80,59 @@ const notificationId = ({ requestId, eventKey, recipientKey, kind }) => determin
   discriminator: eventKey,
 });
 
+/** 결재자 행 스냅숏의 결정 수 — aggregate CAS 의 결정 수 조건 바인딩(R01). load() 는 PENDING 행도 Map 에 넣는다. */
+const decidedCountOf = (decisions) => [...decisions.values()]
+  .filter((decision) => decision?.decisionType && decision.decisionType !== DecisionType.PENDING).length;
+
+/**
+ * 결정 행 전체에서 aggregate 를 다시 계산한다 — 도메인 `settle`(transitions.js)과 같은 파생 함수만 조합한다.
+ * 클레임 뒤 재조회한 스냅숏에는 내 결정이 이미 들어 있어 도메인 전이(approve/reject)를 다시 부를 수 없다
+ * (내 단계가 다른 결정으로 이미 통과됐으면 전이가 APPROVER_STEP_NOT_REACHED 로 던진다). 테스트가 도메인 next 와 대조한다.
+ */
+const aggregateOf = (state, now) => {
+  const status = deriveStatus(state.steps, state.decisions);
+  return {
+    status,
+    currentStepOrder: status === ApprovalStatus.PENDING
+      ? derivedStepOrder(state.steps, state.decisions)
+      : state.steps.length + 1,
+    currentStepOpenedAt: derivedStepOpenedAt(state.steps, state.decisions, state.createdAt),
+    updatedAt: now,
+  };
+};
+
+/** 저장된 aggregate 가 결정 행의 파생보다 뒤처졌는가. */
+const isLagging = (state, next) => (
+  next.status !== state.status || next.currentStepOrder !== state.currentStepOrder
+);
+
+const hasEvent = (events, eventId) => (events ?? []).some((item) => item.eventId === eventId);
+
+const ownEventIn = (events, eventId) => (events ?? []).find((item) => item.eventId === eventId) ?? null;
+
+const withEvent = (events, event) => (
+  events.some((item) => item.eventId === event.eventId) ? events : [...events, event]
+);
+
+/** 결정을 반영해 만들어지는 종료 상태. CANCELLED·EXPIRED 는 결정과 무관하게 닫힌다. */
+const DECISIVE_STATUSES = new Set([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED]);
+
+/**
+ * 내 결정이 종료 상태와 모순인가(검토 1·2차) — APPROVED + 내 REJECT, REJECTED + 내 APPROVE 두 조합뿐이다.
+ * (REJECTED + 내 APPROVE 의 되돌림은 내 이벤트가 아직 없을 때만 — atTerminal.) 같은 종류끼리는 모순이 아니다.
+ * "저장 상태 ≠ 결정 전체의 파생"을 조건으로 쓰면 다른 결재자의 늦은 반려 때문에 내 정상 승인을 되돌린다.
+ */
+const contradictsTerminal = (status, decisionType) => (
+  (status === ApprovalStatus.APPROVED && decisionType === DecisionType.REJECT)
+  || (status === ApprovalStatus.REJECTED && decisionType === DecisionType.APPROVE)
+);
+
+/** 이미 잘못 종료된 요청(R01 수정 전 데이터) — 자동으로 뒤집지 않고 코드만 남긴다. 회수·만료는 파생과 다른 게 정상이다. */
+const warnTerminalMismatch = (status, derived) => {
+  if (status !== ApprovalStatus.APPROVED && status !== ApprovalStatus.REJECTED) return;
+  console.warn('[APPROVAL] terminal mismatch', String(status), String(derived));
+};
+
 const normalizeDecisionArguments = (requestIdOrInput, input) => (
   typeof requestIdOrInput === 'string'
     ? { ...(input ?? {}), requestId: requestIdOrInput }
@@ -521,6 +580,11 @@ export class ApprovalRepository {
     return requestId ? this.load(requestId) : null;
   }
 
+  /**
+   * 결정 클레임. 결재자 행이 PENDING 이고 **부모 요청이 아직 PENDING·LIVE 일 때만** 쓴다(R01 — 종료된 요청에
+   * 늦은 결정이 붙지 않게). 두 문장이 겹친 극히 짧은 창에서 통과한 늦은 클레임은 decideReady 의 재조회가
+   * "종료 + 파생 불일치"로 잡아 되돌린다(retractClaim).
+   */
   async claimDecision(requestId, approverRow) {
     const reopeningReady = await this.columnReady('approval_period_close', 'reopen_operation_id');
     if (!reopeningReady) throw new LogicalError(ErrorCodes.STORAGE_NOT_READY, ErrorCodes.STORAGE_NOT_READY);
@@ -529,6 +593,8 @@ export class ApprovalRepository {
          SET decision_type=?, decided_at=?
        WHERE request_id=UUID_TO_BIN(?) AND step_order=? AND actor_key=?
          AND decision_type='PENDING'
+         AND EXISTS (SELECT 1 FROM approval_request r
+           WHERE r.request_id=approval_approver.request_id AND r.status='PENDING' AND r.commit_state='LIVE')
          AND NOT EXISTS (SELECT 1 FROM timesheet_submission s JOIN approval_period_close p
            ON p.period_start < s.period_end AND p.period_end > s.period_start
            WHERE s.request_id=approval_approver.request_id AND p.reopen_operation_id IS NOT NULL)
@@ -539,6 +605,28 @@ export class ApprovalRepository {
     return result.rowsAffected === 1;
   }
 
+  /**
+   * 늦은 클레임 되돌림(R01 I-B). 삭제-재삽입이 아니라 **내가 쓴 값과 정확히 같을 때만** PENDING 으로 돌리는
+   * 조건부 UPDATE 다(불변식 5). 실패해도 던지지 않는다 — 호출부는 이미 결정 거부(ALREADY_DECIDED)를 돌려줄 참이다.
+   */
+  async retractClaim(requestId, approverRow) {
+    try {
+      const result = await this.execute(`
+        UPDATE approval_approver
+           SET decision_type='PENDING', decided_at=NULL
+         WHERE request_id=UUID_TO_BIN(?) AND step_order=? AND actor_key=?
+           AND decision_type=? AND decided_at=?
+      `, [
+        requestId, approverRow.stepOrder, approverRow.actorKey,
+        approverRow.decisionType, ts(approverRow.decidedAt),
+      ]);
+      return result.rowsAffected === 1;
+    } catch (error) {
+      console.error('[APPROVAL] retract claim failed', String(error?.code ?? error?.name ?? 'Error'));
+      return false;
+    }
+  }
+
   async appendEvent(requestId, event) {
     try {
       return await this.execute(`
@@ -557,7 +645,39 @@ export class ApprovalRepository {
     }
   }
 
-  async casAggregate(requestId, expectedRev, next) {
+  /**
+   * 이번 호출이 CAS 앞에 써 두었으나 확정되지 못한 전이의 이벤트를 거둔다(R04·R01 늦은 결정).
+   * best-effort — 실패는 로그 코드만 남긴다.
+   * `whilePending` 이면 요청이 아직 PENDING 일 때만 지운다(검토 P2-3) — 시도 소진 판정(PENDING 스냅숏) 뒤에
+   * 같은 id 의 다른 호출이 종료 CAS 에 성공했으면 그 성공 이벤트를 지우지 않는다. 그래도 겹친 경우는
+   * 성공한 쪽의 CAS 직후 재기록(appendEvent 멱등)이 복원한다.
+   */
+  async retractEvent(requestId, eventId, { whilePending = false } = {}) {
+    try {
+      const result = await this.execute(`
+        DELETE FROM approval_event
+         WHERE request_id=UUID_TO_BIN(?) AND event_id=UUID_TO_BIN(?)
+         ${whilePending ? `AND EXISTS (SELECT 1 FROM approval_request r
+           WHERE r.request_id=approval_event.request_id AND r.status='PENDING')` : ''}
+      `, [requestId, eventId]);
+      return Number(result?.rowsAffected ?? 0) >= 1;
+    } catch (error) {
+      console.error('[APPROVAL] retract event failed', String(error?.code ?? error?.name ?? 'Error'));
+      return false;
+    }
+  }
+
+  /**
+   * aggregate CAS. `decidedCount` 를 주면 **호출자가 계산에 쓴 스냅숏의 결정 수가 지금 결재자 행의 결정 수와
+   * 같을 때만** 성공한다(R01) — 스냅숏 뒤에 들어온 클레임이 있으면 지고, 재조회한 전체 결정으로 다시 계산한다.
+   * 요청이 PENDING 인 동안 결정 수는 늘기만 한다(되돌림은 종료 뒤에만 일어나고 종료 뒤 CAS 는 status 조건으로 진다).
+   * 회수·만료(closeBySystem·cancel)는 결정을 반영하는 전이가 아니라 생략한다(조건 없음).
+   */
+  async casAggregate(requestId, expectedRev, next, { decidedCount = null } = {}) {
+    const countGuard = Number.isInteger(decidedCount)
+      ? `AND (SELECT COUNT(*) FROM approval_approver p
+               WHERE p.request_id=approval_request.request_id AND p.decision_type <> 'PENDING') = ?`
+      : '';
     const result = await this.execute(`
       UPDATE approval_request
          SET status=?, is_open=?, current_step_order=?, current_step_opened_at=?,
@@ -566,6 +686,7 @@ export class ApprovalRepository {
                                ELSE dedupe_key END,
              updated_at=?, current_step_name=?, rev = rev + 1
        WHERE request_id=UUID_TO_BIN(?) AND rev=? AND status='PENDING'
+         ${countGuard}
     `, [
       next.status,
       next.isOpen,
@@ -576,28 +697,48 @@ export class ApprovalRepository {
       next.currentStepName ?? null,
       requestId,
       expectedRev,
+      ...(countGuard ? [decidedCount] : []),
     ]);
     return result.rowsAffected === 1;
   }
 
+  /**
+   * 업무함 투영(R03). ① 행위자의 my_decided 를 먼저 세우고 ② aggregate 를 **같거나 새 세대일 때만**
+   * (`req_rev <= ?`) 덮는다 — 지연된 옛 세대 투영이 종료된 요청을 다시 열지 못하고, 같은 세대 재투영(재시도 수렴)은 허용한다.
+   * my_turn 은 이미 결정한 사람에게 켜지지 않는다(my_decided=0 조건 — ①이 먼저라 같은 호출의 행위자도 반영).
+   * ①은 my_turn=0 도 함께 쓴다(검토 P2-6) — ②가 세대 조건에 막혀도 행위자 행이 my_turn=1·my_decided=1 로 남지 않는다.
+   */
   async updateProjection({
     requestId, status, isOpen, currentStepOrder, currentStepName = null, updatedAt, reqRev, actorKey,
   }) {
+    const actor = actorKey ? await this.execute(`
+      UPDATE approval_inbox SET my_decided=1, my_turn=0
+       WHERE request_id=UUID_TO_BIN(?) AND actor_key=? AND role='APPROVER'
+    `, [requestId, actorKey]) : NOOP_WRITE;
     const aggregate = await this.execute(`
       UPDATE approval_inbox
          SET status=?, is_open=?, current_step_order=?, current_step_name=?, updated_at=?, req_rev=?,
-             my_turn = CASE WHEN ? = 1 AND role='APPROVER' AND step_order = ?
+             my_turn = CASE WHEN ? = 1 AND role='APPROVER' AND step_order = ? AND my_decided = 0
                             THEN 1 ELSE 0 END
-       WHERE request_id=UUID_TO_BIN(?)
+       WHERE request_id=UUID_TO_BIN(?) AND req_rev <= ?
     `, [
       status, isOpen, currentStepOrder, currentStepName ?? null, ts(updatedAt), reqRev,
-      isOpen, currentStepOrder, requestId,
+      isOpen, currentStepOrder, requestId, reqRev,
     ]);
-    const actor = await this.execute(`
-      UPDATE approval_inbox SET my_decided=1
+    return [actor, aggregate];
+  }
+
+  /** 재시도 수렴용 — 행위자 업무함 행이 이 세대까지 투영됐는가. 행이 없으면(투영 대상 아님) 참. */
+  async actorProjectionCurrent(requestId, actorKey, rev) {
+    const result = await this.execute(`
+      SELECT my_decided, req_rev FROM approval_inbox
        WHERE request_id=UUID_TO_BIN(?) AND actor_key=? AND role='APPROVER'
+       LIMIT 1
     `, [requestId, actorKey]);
-    return [aggregate, actor];
+    const row = result.rows?.[0];
+    if (!row) return true;
+    return Number(valueOf(row, 'my_decided', 'myDecided')) === 1
+      && Number(valueOf(row, 'req_rev', 'reqRev')) >= rev;
   }
 
   async approve(requestIdOrInput, input) {
@@ -626,6 +767,18 @@ export class ApprovalRepository {
     }
   }
 
+  /**
+   * 결정 저장 순서(R01·R02, 2026-10-28 — 검토 2차 정리):
+   *   load → 도메인 검증 → 클레임(부모 PENDING 일 때만) → [재조회 → 전체 결정으로 aggregate 재계산 → 이벤트 → CAS(결정 수 일치)
+   *   → 이벤트 재기록(멱등) → 투영]
+   * 트랜잭션이 없어 "내 클레임이 다른 호출의 종료 CAS 에 포함됐는가"를 증명할 데이터는 없다. 그래서 재조회에서 종료를 만나면:
+   * - CANCELLED·EXPIRED(결정에서 파생되지 않는 종료): 아무것도 되돌리지 않고 종료 상태 반환(`idempotent`).
+   * - 내 결정이 종료와 **확실히 모순**일 때만 되돌린다(`undoLateDecision`): APPROVED + 내 REJECT(포함됐다면 REJECTED 였다),
+   *   REJECTED + 내 APPROVE 이면서 내 이벤트가 아직 없을 때. 내 이벤트가 이미 있는 REJECTED + 내 APPROVE 는 그대로 둔다.
+   * - 그 밖(APPROVED + 내 APPROVE, REJECTED + 내 REJECT)은 반영된 것 — 내 이벤트·투영만 채운다.
+   * 반환 표식: `ownEvent` = 이번 결정의 이벤트(내 actor·종류) · `idempotent: true` = 이번 호출이 새로 기록한 결정이 없다
+   * (서비스가 알림·후속 처리를 건너뛴다) · `recovered: true` = 재시도가 끊긴 결정의 이벤트를 새 행으로 넣었다.
+   */
   async decideReady(kind, input) {
     const transition = kind === DecisionType.APPROVE ? approveTransition : rejectTransition;
     const transitionInput = {
@@ -637,71 +790,163 @@ export class ApprovalRepository {
         reasonRequired: input.reasonRequired,
       } : {}),
     };
-    let state = await this.load(input.requestId);
+    const state = await this.load(input.requestId);
     if (!state) {
       throw new LogicalError(ErrorCodes.REQUEST_NOT_FOUND, ErrorCodes.REQUEST_NOT_FOUND);
     }
+    const sleep = input.sleep ?? this.sleep;
+    const jitter = input.jitter ?? this.jitter;
+    const mine = state.decisions.get(input.actorKey)?.decisionType ?? DecisionType.PENDING;
+    const replayed = this.replayedDecisionEvent(kind, state, input);
+
+    // 되돌림 중단 뒤 잔존 이벤트(검토 2차 P2-7): 클레임은 되돌렸는데 모순 이벤트가 남았다 — 이벤트를 다시 거둔다.
+    if (mine === DecisionType.PENDING && DECISIVE_STATUSES.has(state.status)
+      && contradictsTerminal(state.status, kind) && hasEvent(state.events, replayed.eventId)) {
+      const removed = await this.retractEvent(input.requestId, replayed.eventId);
+      return this.lateDecisionResult(kind, {
+        ...state,
+        events: removed ? state.events.filter((item) => item.eventId !== replayed.eventId) : state.events,
+      });
+    }
 
-    let result = transition(state, transitionInput);
-    if (result.idempotent) return state;
+    // 도메인 reject 에는 멱등 분기가 없다 — 내 REJECT 가 이미 행에 있는 재시도는 APPROVE 의 idempotent 와 같게 수렴시킨다(I-C).
+    if (kind === DecisionType.REJECT && mine === DecisionType.REJECT) {
+      return this.convergeDecision(kind, state, input, replayed, { sleep, jitter });
+    }
+    const result = transition(state, transitionInput);
+    if (result.idempotent) return this.convergeDecision(kind, state, input, replayed, { sleep, jitter });
 
     const claimed = await this.claimDecision(input.requestId, result.changes.approverRow);
     if (!claimed) {
-      if (kind === DecisionType.APPROVE) return this.load(input.requestId);
+      if (kind === DecisionType.APPROVE) {
+        const current = await this.load(input.requestId);
+        return current ? { ...current, idempotent: true, ownEvent: ownEventIn(current.events, replayed.eventId) } : current;
+      }
       throw new ConcurrencyError(ErrorCodes.ALREADY_DECIDED, ErrorCodes.ALREADY_DECIDED, {
         retryable: false,
       });
     }
 
-    const sleep = input.sleep ?? this.sleep;
-    const jitter = input.jitter ?? this.jitter;
+    return this.settleDecision({
+      kind,
+      input,
+      event: result.changes.event,
+      approverRow: result.changes.approverRow,
+      converging: false,
+      ctx: { inserted: false },
+      sleep,
+      jitter,
+    });
+  }
+
+  /**
+   * 재시도 수렴(R02). 내 결정이 이미 결재자 행에 있을 때 — 앞선 호출이 이벤트·CAS·투영 중 어디서 끊겼어도 마저 끝낸다.
+   * 이번 호출의 이벤트 INSERT 가 새 행을 넣었으면 `recovered`(앞선 호출은 예외로 끝나 후속 처리를 하지 않았다),
+   * 아니면 `idempotent`(투영만 뒤처졌거나 진짜 멱등 — 동시 재시도가 후속 처리를 겹쳐 내지 않게).
+   */
+  async convergeDecision(kind, state, input, event, { sleep, jitter }) {
+    const ctx = { inserted: false };
+    let out;
+    if (state.status !== ApprovalStatus.PENDING) {
+      out = await this.atTerminal({
+        kind, requestId: input.requestId, state, event, approverRow: null, actorKey: input.actorKey, ctx, projectionStale: false,
+      });
+    } else if (!isLagging(state, aggregateOf(state, input.now))) {
+      out = await this.completeReflected(input.requestId, state, event, input.actorKey, { projectionStale: false, ctx });
+    } else {
+      out = await this.settleDecision({
+        kind, input, event, approverRow: null, initialState: state, converging: true, ctx, sleep, jitter,
+      });
+    }
+    if (out.idempotent) return out;
+    return ctx.inserted ? { ...out, recovered: true } : { ...out, idempotent: true };
+  }
+
+  /**
+   * 도메인 전이가 만들었을 결정 이벤트를 재시도 입력으로 다시 만든다(id 는 결정적 — 같은 행위자·종류면 같은 id).
+   * 발생 시각은 결재자 행의 결정 시각(초 단위 저장)을 쓴다. 반려 사유·대리인은 같은 사용자의 재시도 입력에서 온다.
+   */
+  replayedDecisionEvent(kind, state, input) {
+    const eventType = kind === DecisionType.APPROVE ? EventType.APPROVED : EventType.REJECTED;
+    return {
+      eventId: deterministicEventId({ requestId: state.requestId, eventType, actorKey: input.actorKey }),
+      eventType,
+      actorKey: input.actorKey,
+      delegateKey: input.delegateKey ?? null,
+      occurredAt: state.decisions.get(input.actorKey)?.decidedAt ?? input.now,
+      reason: kind === DecisionType.REJECT ? (input.reason ?? null) : null,
+      contentVersion: state.contentVersion,
+    };
+  }
+
+  /** 이벤트 INSERT 를 하고, 새 행이 들어갔는지(ON DUPLICATE 무변경 = 0 이 아님) ctx 에 남긴다. */
+  async appendOwnEvent(requestId, event, ctx) {
+    const written = await this.appendEvent(requestId, event);
+    if (Number(written?.rowsAffected ?? 0) >= 1) ctx.inserted = true;
+    return written;
+  }
+
+  /** 클레임 뒤 확정 루프. 매 시도마다 신선한 결정 전체를 읽어 aggregate 를 다시 계산하고, 그 스냅숏의 결정 수를 CAS 조건으로 건다. */
+  async settleDecision({
+    kind, input, event, approverRow, initialState = null, converging, ctx, sleep, jitter,
+  }) {
+    const { requestId, actorKey } = input;
+    let state = initialState;
     for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
-      await this.appendEvent(input.requestId, result.changes.event);
-      const currentStepName = stepNameOf(state.steps, result.next.currentStepOrder);
-      const updated = await this.casAggregate(input.requestId, state.rev, {
-        ...result.next,
-        isOpen: result.changes.projection.isOpen,
+      if (!state) {
+        state = await this.load(requestId);
+        if (!state) throw new LogicalError(ErrorCodes.REQUEST_NOT_FOUND, ErrorCodes.REQUEST_NOT_FOUND);
+      }
+
+      if (state.status !== ApprovalStatus.PENDING) {
+        // 새 결정이 다른 호출의 종료 CAS 에 반영된 경우 그 호출은 내 이벤트·my_decided 를 쓰지 않았다 — 투영을 반드시 다시 쓴다.
+        return this.atTerminal({
+          kind, requestId, state, event, approverRow, actorKey, ctx, projectionStale: !converging,
+        });
+      }
+
+      const next = aggregateOf(state, input.now);
+      // 재시도 수렴 중 그 사이 다른 호출이 내 결정까지 반영해 확정했다 — CAS 없이 이벤트·투영만 채운다.
+      if (converging && attempt > 0 && !isLagging(state, next)) {
+        return this.completeReflected(requestId, state, event, actorKey, { projectionStale: false, ctx });
+      }
+
+      await this.appendOwnEvent(requestId, event, ctx);
+      const currentStepName = stepNameOf(state.steps, next.currentStepOrder);
+      const isOpen = next.status === ApprovalStatus.PENDING ? 1 : 0;
+      const updated = await this.casAggregate(requestId, state.rev, {
+        ...next,
+        isOpen,
         currentStepName,
-      });
+      }, { decidedCount: decidedCountOf(state.decisions) });
       if (updated) {
+        // CAS 앞 INSERT 와 CAS 사이에 다른 호출의 거두기 DELETE 가 끼었어도 성공한 전이의 이벤트를 복원한다(검토 P2-3, 멱등).
+        await this.appendOwnEvent(requestId, event, ctx);
         await this.updateProjection({
-          requestId: input.requestId,
-          ...result.changes.projection,
+          requestId,
+          status: next.status,
+          isOpen,
+          currentStepOrder: next.currentStepOrder,
           currentStepName,
-          updatedAt: result.next.updatedAt,
+          updatedAt: next.updatedAt,
           reqRev: state.rev + 1,
-          actorKey: input.actorKey,
-        });
-        const decisions = new Map(state.decisions);
-        decisions.set(input.actorKey, {
-          decisionType: result.changes.approverRow.decisionType,
-          decidedAt: result.changes.approverRow.decidedAt,
+          actorKey,
         });
         return {
           ...state,
-          ...result.next,
+          ...next,
           currentStepName,
           rev: state.rev + 1,
-          decisions,
-          events: [...state.events, result.changes.event],
+          events: withEvent(state.events, event),
+          ownEvent: event,
         };
       }
 
       await sleep(20 * (2 ** attempt) + Number(jitter()));
-      if (attempt === MAX_CAS_ATTEMPTS - 1) break;
-      state = await this.load(input.requestId);
-      if (!state) {
-        throw new LogicalError(ErrorCodes.REQUEST_NOT_FOUND, ErrorCodes.REQUEST_NOT_FOUND);
-      }
-      if (state.status !== ApprovalStatus.PENDING) return state;
-
-      // 클레임은 이미 사실이다. Map 복사본에서 내 결정만 빼고 순수 전이를 재생해
-      // 그 사이 들어온 다른 결정까지 포함한 aggregate 를 다시 계산한다.
-      const beforeOwnClaim = new Map(state.decisions);
-      beforeOwnClaim.delete(input.actorKey);
-      result = transition({ ...state, decisions: beforeOwnClaim }, transitionInput);
+      state = null;
     }
 
+    // 클레임은 남아 있다 — 같은 사용자의 재시도가 convergeDecision 으로 수렴시킨다.
     throw new ConcurrencyError(
       ErrorCodes.CONCURRENT_MODIFICATION,
       ErrorCodes.CONCURRENT_MODIFICATION,
@@ -709,6 +954,97 @@ export class ApprovalRepository {
     );
   }
 
+  /** 재조회에서 요청이 이미 종료돼 있을 때의 판정(클레임 뒤 확정 루프·재시도 수렴 공용). */
+  async atTerminal({
+    kind, requestId, state, event, approverRow, actorKey, ctx, projectionStale,
+  }) {
+    // 회수·만료는 결정에서 파생되지 않는다 — 남은 결정 행·이벤트가 파생 상태와 모순을 만들지 않으니 아무것도 되돌리지 않는다.
+    if (!DECISIVE_STATUSES.has(state.status)) {
+      return { ...state, idempotent: true, ownEvent: ownEventIn(state.events, event.eventId) };
+    }
+    const mine = state.decisions.get(actorKey);
+    const decisionType = mine?.decisionType ?? approverRow?.decisionType;
+    const present = hasEvent(state.events, event.eventId);
+    if (contradictsTerminal(state.status, decisionType)) {
+      // APPROVED + 내 REJECT 는 이벤트가 있어도 반영된 적이 없다(반영됐다면 REJECTED). REJECTED + 내 APPROVE 는
+      // 내 이벤트가 이미 있으면 앞선 호출이 CAS 전에 쓴 것이라 반영 여부를 알 수 없다 — 그대로 둔다.
+      if (state.status === ApprovalStatus.REJECTED && present) {
+        // 결정 행·이벤트는 사실이니 업무함만 "처리함"으로 맞춘다(같은 세대 재투영). 알림·후속 처리는 내지 않는다.
+        if (projectionStale) await this.reprojectActor(requestId, state, actorKey);
+        return { ...state, idempotent: true, ownEvent: ownEventIn(state.events, event.eventId) };
+      }
+      return this.undoLateDecision({
+        kind,
+        requestId,
+        state,
+        approverRow: approverRow ?? {
+          stepOrder: stepOrderOf(state.steps, actorKey),
+          actorKey,
+          decisionType,
+          decidedAt: mine?.decidedAt ?? null,
+        },
+        event,
+        removeEvent: present,
+      });
+    }
+    const derived = deriveStatus(state.steps, state.decisions);
+    if (derived !== state.status) warnTerminalMismatch(state.status, derived);
+    return this.completeReflected(requestId, state, event, actorKey, { projectionStale, ctx });
+  }
+
+  /** 내 결정이 이미 aggregate 에 반영된 상태 — 빠진 내 이벤트와 업무함 투영(같은 세대 재투영)만 채운다. */
+  async completeReflected(requestId, state, event, actorKey, { projectionStale, ctx }) {
+    const eventMissing = !hasEvent(state.events, event.eventId);
+    if (eventMissing) await this.appendOwnEvent(requestId, event, ctx);
+    const stale = projectionStale || eventMissing
+      || !(await this.actorProjectionCurrent(requestId, actorKey, state.rev));
+    if (stale) await this.reprojectActor(requestId, state, actorKey);
+    return {
+      ...state,
+      events: eventMissing ? [...state.events, event] : state.events,
+      ownEvent: eventMissing ? event : ownEventIn(state.events, event.eventId),
+    };
+  }
+
+  /** 저장된 aggregate 그대로 같은 세대 재투영 + 행위자 my_decided. */
+  reprojectActor(requestId, state, actorKey) {
+    return this.updateProjection({
+      requestId,
+      status: state.status,
+      isOpen: state.status === ApprovalStatus.PENDING ? 1 : 0,
+      currentStepOrder: state.currentStepOrder,
+      currentStepName: state.currentStepName ?? null,
+      updatedAt: state.updatedAt,
+      reqRev: state.rev,
+      actorKey,
+    });
+  }
+
+  /** 늦은 결정 되돌림(I-B) — 내 클레임(내가 쓴 값과 정확히 같을 때만)과 내 이벤트(`removeEvent`)만 되돌린다. */
+  async undoLateDecision({
+    kind, requestId, state, approverRow, event, removeEvent,
+  }) {
+    const retracted = await this.retractClaim(requestId, approverRow);
+    const eventRetracted = removeEvent ? await this.retractEvent(requestId, event.eventId) : false;
+    const decisions = new Map(state.decisions);
+    if (retracted) decisions.set(approverRow.actorKey, { decisionType: DecisionType.PENDING, decidedAt: null });
+    return this.lateDecisionResult(kind, {
+      ...state,
+      decisions,
+      events: eventRetracted ? state.events.filter((item) => item.eventId !== event.eventId) : state.events,
+    });
+  }
+
+  /** 늦은 결정의 결과 — REJECT 는 ALREADY_DECIDED, APPROVE 는 종료 상태(새로 기록한 결정 없음). */
+  lateDecisionResult(kind, state) {
+    if (kind === DecisionType.REJECT) {
+      throw new ConcurrencyError(ErrorCodes.ALREADY_DECIDED, ErrorCodes.ALREADY_DECIDED, {
+        retryable: false,
+      });
+    }
+    return { ...state, idempotent: true, ownEvent: null };
+  }
+
   /** 같은 대상의 요청 전부(최근 20건) + 각 요청의 이벤트. "회차별 승인 이력" 화면용. */
   async listHistory({ targetKind, targetKey, limit = 20, beforeRevision = null }) {
     if (!targetKind || !targetKey) return [];
@@ -937,8 +1273,25 @@ export class ApprovalRepository {
     }));
   }
 
+  /**
+   * CAS 앞에 써 둔 회수·만료 이벤트가 확정되지 못했으면 거둔다(R04 I-E). CAS 에서 진 뒤 재조회한 상태로 판정한다:
+   * **최종 상태 ≠ 이 전이의 목표 상태일 때만** 지운다(검토 2차 — 상태가 같으면 다른 actor 의 회수가 이겼든 같은 id 가
+   * 이겼든 남긴다. 서로 다른 두 사람의 동시 회수는 이벤트 둘이 남는다 — 보고서 한계).
+   * 아직 PENDING(시도 소진·전이 조건 미충족)이면 요청이 PENDING 일 때만 지운다 — 그 사이 같은 id 의 다른 호출이 성공했으면
+   * 지우지 않는다. 겹친 경우는 성공한 쪽의 CAS 직후 재기록이 복원한다.
+   */
+  async discardUnconfirmedEvent(requestId, state, pending) {
+    if (!pending || !state || state.status === pending.status) return state;
+    const options = state.status === ApprovalStatus.PENDING ? { whilePending: true } : {};
+    const removed = await this.retractEvent(requestId, pending.eventId, options);
+    return removed
+      ? { ...state, events: (state.events ?? []).filter((item) => item.eventId !== pending.eventId) }
+      : state;
+  }
+
   /**
    * 사용자 없이 요청을 닫는다(만료·자동 회수). 결정 경로와 같은 CAS 루프지만 결정 행 클레임이 없다.
+   * 이벤트는 CAS **앞**에 쓰고(성공한 전이에 이벤트가 빠지지 않게), CAS 에서 지면 거둔다(R04).
    * 반환: `null`(저장소 미준비/요청 없음) · `{closed:false}`(이미 닫혔거나 전이 조건 미충족) · `{closed:true, state, event}`
    */
   async closeBySystem(requestId, transition) {
@@ -946,18 +1299,28 @@ export class ApprovalRepository {
     try {
       let state = await this.load(requestId);
       if (!state) return null;
+      let pending = null;
 
       for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
-        if (state.status !== ApprovalStatus.PENDING) return { state, closed: false, reason: 'not pending' };
+        if (state.status !== ApprovalStatus.PENDING) {
+          return { state: await this.discardUnconfirmedEvent(requestId, state, pending), closed: false, reason: 'not pending' };
+        }
         const result = transition(state);
-        if (!result.ok) return { state, closed: false, reason: result.reason };
+        if (!result.ok) {
+          return { state: await this.discardUnconfirmedEvent(requestId, state, pending), closed: false, reason: result.reason };
+        }
 
         await this.appendEvent(requestId, result.changes.event);
+        pending = {
+          eventId: result.changes.event.eventId, eventType: result.changes.event.eventType, status: result.next.status,
+        };
         const updated = await this.casAggregate(requestId, state.rev, {
           ...result.next,
           isOpen: result.changes.projection.isOpen,
         });
         if (updated) {
+          // 성공한 전이의 이벤트 재기록(멱등) — 그 사이 다른 호출의 거두기가 지웠어도 복원한다(검토 P2-3).
+          await this.appendEvent(requestId, result.changes.event);
           await this.updateProjection({
             requestId,
             ...result.changes.projection,
@@ -976,7 +1339,7 @@ export class ApprovalRepository {
         state = await this.load(requestId);
         if (!state) return null;
       }
-      return { state, closed: false, reason: 'cas' };
+      return { state: await this.discardUnconfirmedEvent(requestId, state, pending), closed: false, reason: 'cas' };
     } catch (error) {
       if (isMissingTableError(error)) return null;
       throw error;
@@ -996,6 +1359,7 @@ export class ApprovalRepository {
     return this.closeBySystem(requestId, (state) => cancelTransition(state, { actorKey: null, reason, now }));
   }
 
+  /** 요청자·관리자 회수. CAS 에서 진 회수의 이벤트는 거둔다(R04) — 시도 소진 땐 마지막 재조회 상태로 판정한다. */
   async cancel(input) {
     if (!(await this.tablesReady(DECISION_TABLES))) return null;
 
@@ -1007,6 +1371,7 @@ export class ApprovalRepository {
 
       const sleep = input.sleep ?? this.sleep;
       const jitter = input.jitter ?? this.jitter;
+      let pending = null;
       for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
         const result = cancelTransition(state, {
           actorKey: input.actorKey,
@@ -1014,11 +1379,16 @@ export class ApprovalRepository {
           now: input.now,
         });
         await this.appendEvent(input.requestId, result.changes.event);
+        pending = {
+          eventId: result.changes.event.eventId, eventType: result.changes.event.eventType, status: result.next.status,
+        };
         const updated = await this.casAggregate(input.requestId, state.rev, {
           ...result.next,
           isOpen: result.changes.projection.isOpen,
         });
         if (updated) {
+          // 성공한 전이의 이벤트 재기록(멱등) — 그 사이 다른 호출의 거두기가 지웠어도 복원한다(검토 P2-3).
+          await this.appendEvent(input.requestId, result.changes.event);
           await this.updateProjection({
             requestId: input.requestId,
             ...result.changes.projection,
@@ -1030,19 +1400,21 @@ export class ApprovalRepository {
             ...state,
             ...result.next,
             rev: state.rev + 1,
-            events: [...state.events, result.changes.event],
+            events: withEvent(state.events, result.changes.event),
           };
         }
 
         await sleep(20 * (2 ** attempt) + Number(jitter()));
-        if (attempt === MAX_CAS_ATTEMPTS - 1) break;
         state = await this.load(input.requestId);
         if (!state) {
           throw new LogicalError(ErrorCodes.REQUEST_NOT_FOUND, ErrorCodes.REQUEST_NOT_FOUND);
         }
-        if (state.status !== ApprovalStatus.PENDING) return state;
+        if (state.status !== ApprovalStatus.PENDING) {
+          return this.discardUnconfirmedEvent(input.requestId, state, pending);
+        }
       }
 
+      await this.discardUnconfirmedEvent(input.requestId, state, pending);
       throw new ConcurrencyError(
         ErrorCodes.CONCURRENT_MODIFICATION,
         ErrorCodes.CONCURRENT_MODIFICATION,
diff --git a/src/resolver/approval/ApprovalService.js b/src/resolver/approval/ApprovalService.js
index 7c4d547..282373b 100644
--- a/src/resolver/approval/ApprovalService.js
+++ b/src/resolver/approval/ApprovalService.js
@@ -1,7 +1,7 @@
 import personalDataState from '../personalData/PersonalDataState';
 import { assertRequestNotReopening } from '../timesheet/PeriodReopenGuard';
 import { asUser, route } from '../../api/jira/RequestJira';
-import { canDecideNow, approvedContentVersion as approvedVersionOf } from '../../domain/approval/derive';
+import { canDecideNow, approvedContentVersion as approvedVersionOf, stepOrderOf } from '../../domain/approval/derive';
 import {
   ApprovalStatus, CancelReason, DecisionType, EventType, REQUEST_MESSAGE_MAX, TargetKind,
 } from '../../domain/approval/constants';
@@ -16,7 +16,7 @@ import settingsRepository from '../settings/SettingsRepository';
 import approvalGroupRepository from '../directory/ApprovalGroupRepository';
 import { absoluteAvatarUrl } from '../directory/DirectoryService';
 import { listAvailableFlows } from '../flow/FlowService';
-import { createNotificationsBestEffort } from '../notification/NotificationService';
+import { createNotificationsBestEffort, STEP_OPENED_KIND } from '../notification/NotificationService';
 import pinService from '../signature/PinService';
 import delegationService from '../delegation/DelegationService';
 import { targetRegistry } from './target/TargetRegistry';
@@ -36,6 +36,8 @@ const BULK_MAX = 50;
 // 일괄 승인에서 결정 직후 훅(필드 변경 적용 — 건당 Jira 2콜)을 돌리는 시간 예산. Forge 함수 한도 25초 안에
 // 결정 기록은 끝까지 하고, 예산을 넘긴 건은 적용만 미룬다(WAITING — 상세에서 다시 적용).
 const BULK_AFTER_DECIDE_BUDGET_MS = 15_000;
+/** 일괄 승인 전체 마감(D02) — UI resolver 한도 25초 안에서 응답하기 위한 상한. 넘긴 뒤의 건은 손대지 않고 `remaining` 으로 돌려준다. */
+const BULK_TOTAL_BUDGET_MS = 20_000;
 const NUMERIC_ID = /^\d{1,18}$/;
 
 const payloadOf = (request) => request?.payload ?? request ?? {};
@@ -128,9 +130,19 @@ export const searchDirectory = async (term, siteUrl = null) => {
   return { users: (await personalDataState.overlay(users)).filter((user) => user.accountStatus !== 'closed'), groups };
 };
 
+/** 명부를 끝까지 읽지 못했다 — 일부 인원으로 결재선을 만들면 전원 승인(requireAll)의 인원수가 줄어든다(R12). 호출부 코드와 같게 거부. */
+const incompleteRoster = (groupName, cause) => new LogicalError(
+  ErrorCodes.INVALID_APPROVER_CONFIGURATION,
+  ErrorCodes.INVALID_APPROVER_CONFIGURATION,
+  { reason: 'GROUP_MEMBERS_INCOMPLETE', group: String(groupName), ...cause },
+);
+
 /**
  * Jira 그룹 구성원(활성 사람만). 결재선·승인 그룹(JIRA 유형)은 그룹 **이름**을 키로 저장한다.
- * 그룹 멤버 조회 권한이 없으면 Jira 가 403 을 준다 → 빈 목록 → 호출부가 INVALID_APPROVER_CONFIGURATION.
+ * 그룹 멤버 조회 권한이 없으면 Jira 가 첫 페이지에서 403 을 준다 → 빈 목록 → 호출부가 INVALID_APPROVER_CONFIGURATION.
+ * **끝까지 읽은 명부만 돌려준다**(2026-10-28 전수 점검 R12): 뒤 페이지에서 끊기거나(403·429·5xx) 페이지 상한(20×50=1,000명)에 닿으면
+ * 일부만 읽은 것이라 INVALID_APPROVER_CONFIGURATION(cause.reason GROUP_MEMBERS_INCOMPLETE)을 던진다 — 전원 승인 그룹의
+ * requiredApprovals 가 그 길이로 정해지기 때문. 참조(CC)·팀 동기화처럼 best-effort 인 호출부는 자기 catch 로 빈 목록 처리한다.
  */
 export const loadGroupMembersByName = async (groupName) => {
   const members = [];
@@ -143,16 +155,23 @@ export const loadGroupMembersByName = async (groupName) => {
       undefined,
       { allowStatuses: [400, 401, 403, 404] },
     );
-    if (status !== 200) break;
-    const values = body?.values ?? [];
+    if (status !== 200) {
+      if (page === 0) return [];
+      throw incompleteRoster(groupName, { status, page });
+    }
+    const values = Array.isArray(body?.values) ? body.values : null;
+    if (!values) throw incompleteRoster(groupName, { status, page, shape: 'values' });
     values.forEach((user) => {
       if (user?.accountId && isPerson(user)) members.push(String(user.accountId));
     });
-    if (body?.isLast !== false || values.length === 0) break;
+    if (body?.isLast !== false) return [...new Set(members)];
+    // 마지막이 아니라는데 빈 페이지 — 더 읽을 길이 없다(startAt 을 못 올린다). Jira 는 조회 중 빈 페이지가 올 수 있다고 적는다.
+    // 앞 페이지만으로 확정하면 R12 그대로라 미확정으로 거부한다(Codex 검토 P2).
+    if (values.length === 0) throw incompleteRoster(groupName, { status, page, shape: 'empty-page' });
     startAt += values.length;
   }
 
-  return [...new Set(members)];
+  throw incompleteRoster(groupName, { status: 200, page: MAX_GROUP_MEMBER_PAGES, limit: MAX_GROUP_MEMBER_PAGES * GROUP_MEMBER_LIMIT });
 };
 
 const statusLabelKey = (status) => `state.status.${String(status).toLowerCase()}`;
@@ -849,11 +868,22 @@ export class ApprovalService {
     if (!ids.length || ids.length > BULK_MAX) {
       throw new LogicalError(ErrorCodes.INVALID_TARGET, ErrorCodes.INVALID_TARGET);
     }
+    const startedAt = this.clock();
     await this.pinVerifier(principal.accountId, payload.pin);
 
     const results = [];
-    const budget = { startedAt: this.clock(), limitMs: BULK_AFTER_DECIDE_BUDGET_MS };
-    for (const requestId of ids) {
+    const remaining = [];
+    const budget = { startedAt, limitMs: BULK_AFTER_DECIDE_BUDGET_MS };
+    let longestMs = 0;
+    for (const [index, requestId] of ids.entries()) {
+      // 전체 마감(D02) — UI resolver 실행 한도 25초 안에서 응답을 돌려준다. "지금까지 가장 오래 걸린 한 건"이 더 들어갈 자리가 없으면
+      // 멈춘다(마감을 넘긴 뒤 멈추면 그 한 건이 한도를 넘긴다 — Codex P2). PIN 확인 시간도 포함. 남은 건은 손대지 않고 `remaining` 으로
+      // 돌려주어 사용자가 그 건만 이어서 누른다(일부는 저장되고 응답은 끊기는 상태를 만들지 않는다). 첫 건은 항상 시도한다.
+      if (index > 0 && this.clock() - startedAt + longestMs > BULK_TOTAL_BUDGET_MS) {
+        remaining.push(...ids.slice(index));
+        break;
+      }
+      const itemStartedAt = this.clock();
       try {
         // eslint-disable-next-line no-await-in-loop
         const result = await this.decideApproval(
@@ -868,11 +898,14 @@ export class ApprovalService {
       } catch (error) {
         results.push({ requestId, ok: false, code: error?.code ?? ErrorCodes.UNKNOWN_ERROR });
       }
+      longestMs = Math.max(longestMs, this.clock() - itemStartedAt);
     }
     return {
       results,
       approved: results.filter((item) => item.ok).length,
       failed: results.filter((item) => !item.ok).length,
+      // 마감으로 처리하지 못한 건(순서대로). 비어 있으면 전부 처리했다는 뜻 — 화면은 이 수를 따로 보여 준다.
+      remaining,
     };
   }
 
@@ -963,10 +996,24 @@ export class ApprovalService {
       result = await this.repository.approve(input);
     }
     if (!result) throw new LogicalError(ErrorCodes.STORAGE_NOT_READY, ErrorCodes.STORAGE_NOT_READY);
+    // 새로 기록한 결정이 없다(멱등 재클릭·이미 반영된 재시도·늦은 결정 되돌림) — 알림·다음 단계 알림·후속 처리(afterDecide)·
+    // 외부 알림(Jira 코멘트·멘션)을 다시 내지 않는다(검토 P2-5). 응답 shape 은 그대로.
+    if (result.idempotent === true) {
+      return {
+        requestId,
+        status: result.status,
+        currentStepOrder: result.currentStepOrder,
+        ...(typeof adapter.afterDecide === 'function' && APPLY_KINDS.has(adapter.kind) ? { apply: null } : {}),
+      };
+    }
 
     const kind = decision === DecisionType.REJECT ? EventType.REJECTED : EventType.APPROVED;
     const cc = await this.repository.findCcKeys?.(requestId) ?? [];
-    const lastEvent = (result.events ?? []).at(-1) ?? null;
+    // 알림·다음 단계 알림·외부 알림(Jira 코멘트)은 **이번 결정의 이벤트**로 판정한다(검토 2차 P2-8) — 마지막 이벤트는 경합·재시도에서
+    // 다른 사람의 것일 수 있다. 저장소가 ownEvent 를 주지 않는 구현(테스트 대역)은 예전처럼 마지막 이벤트.
+    const lastEvent = Object.prototype.hasOwnProperty.call(result, 'ownEvent')
+      ? (result.ownEvent ?? null)
+      : ((result.events ?? []).at(-1) ?? null);
     if (lastEvent && lastEvent.eventType === kind) {
       // 앱 내 알림(업무함 알림 탭). 수신자 규칙은 NotificationService 가 정한다(행위자 제외 등).
       // 결정 응답을 막지 않도록 background 로 넘긴다.
@@ -981,6 +1028,21 @@ export class ApprovalService {
         background: true,
       });
     }
+    // 다음 단계 개방(R06) — 중간 승인으로 단계가 넘어갔으면 새 차례 결재자에게 "승인 차례" 알림. 최종 승인·같은 단계 안의 승인은 해당 없음.
+    // 수신자·중복 방지는 NotificationService(STEP_OPENED: 현재 단계 미결 결재자, id = 승인 이벤트 기준). 실패해도 결정은 이미 끝났다.
+    if (lastEvent && kind === EventType.APPROVED && result.status === ApprovalStatus.PENDING
+      // 비교 대상은 결정 주체(대리 결재면 위임한 결재자 = input.actorKey) — 대리인 본인의 단계가 아니다(Codex P2).
+      && Number(result.currentStepOrder) > Number(stepOrderOf(result.steps, input.actorKey) || 0)) {
+      await this.appNotifier({
+        kind: STEP_OPENED_KIND,
+        request: result,
+        event: lastEvent,
+        approvers: approversForNotification(result),
+        requesterAccountId: state.requesterKey,
+        actorAccountId: principal.accountId,
+        background: true,
+      });
+    }
     const hasAfterDecide = typeof adapter.afterDecide === 'function';
     const effect = hasAfterDecide
       ? await this.afterDecide(adapter, { ...result, requestId }, {
diff --git a/src/resolver/inbox/InboxRepository.js b/src/resolver/inbox/InboxRepository.js
index b6ffc56..bfab23a 100644
--- a/src/resolver/inbox/InboxRepository.js
+++ b/src/resolver/inbox/InboxRepository.js
@@ -8,7 +8,8 @@ import { toSqlTimestamp } from '../../rdb/query/SqlTime';
 const TABLE = 'approval_inbox';
 
 export const INBOX_TABS = Object.freeze({
-  myturn: Object.freeze({ role: 'APPROVER', myTurn: 1, isOpen: 1 }),
+  // 내 차례 = 현재 단계 + 아직 결정 안 함(R03 — 전원 승인 단계의 중간 결정자는 my_turn 투영이 늦어도 빠진다).
+  myturn: Object.freeze({ role: 'APPROVER', myTurn: 1, isOpen: 1, decided: false }),
   waiting: Object.freeze({ role: 'APPROVER', myTurn: 0, isOpen: 1 }),
   requested: Object.freeze({ role: 'REQUESTER' }),
   done: Object.freeze({ role: 'APPROVER', decided: true }),
@@ -57,7 +58,8 @@ const applyTab = (builder, tab, history = null) => {
   builder.whereEq('role', condition.role);
   if (condition.myTurn !== undefined) builder.whereEq('my_turn', condition.myTurn);
   if (condition.isOpen !== undefined) builder.whereEq('is_open', condition.isOpen);
-  if (condition.decided) builder.whereRaw('(my_decided = 1 OR acted_by_me = 1)');
+  if (condition.decided === true) builder.whereRaw('(my_decided = 1 OR acted_by_me = 1)');
+  if (condition.decided === false) builder.whereRaw('my_decided = 0');
   return builder;
 };
 
@@ -201,6 +203,7 @@ export class InboxRepository {
       .whereIn('actor_key', Array.isArray(actorKey) ? actorKey : [actorKey])
       .whereEq('my_turn', 1)
       .whereEq('is_open', 1)
+      .whereRaw('my_decided = 0')
       .build();
 
     const result = await this.query(statement.sql, statement.params);
