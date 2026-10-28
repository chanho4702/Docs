import { ApprovalRepository } from '../../src/resolver/approval/ApprovalRepository';
import { deriveStatus } from '../../src/domain/approval/derive';
import { expireByTargetChange } from '../../src/domain/approval/transitions';
import { selectNotificationRecipients } from '../../src/resolver/notification/NotificationService';
import { WorklogControlWorker } from '../../src/resolver/worklogControl/WorklogControlWorker';
import { FlowRepository } from '../../src/resolver/flow/FlowRepository';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = 1_700_000_000_000;
const fresh = () => ({
  requestId: ID, targetKind: 'WORKLOG_CERTIFICATION', status: 'PENDING', rev: 1,
  steps: [{ stepOrder: 1, approverKeys: ['a', 'b'], requiredApprovals: 1 }],
  decisions: new Map(), events: [], createdAt: NOW, updatedAt: NOW,
  contentVersion: 1, currentStepOrder: 1, expiresAt: null, requesterKey: 'owner',
});

// 이 테스트는 수정 후 통과 조건이 아니라 현재 결함을 고정하는 진단이다.
const harness = ({ concurrent = false, failEvent = false } = {}) => {
  const state = fresh();
  const events = [];
  const projections = [];
  let claims = 0;
  let releaseClaims;
  const allClaimed = new Promise((resolve) => { releaseClaims = resolve; });
  let releaseApproved;
  const approved = new Promise((resolve) => { releaseApproved = resolve; });
  const execute = jest.fn(async (sql, values) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('UPDATE approval_approver')) {
      const [decisionType, , , , actor] = values;
      if (state.decisions.has(actor)) return { rowsAffected: 0 };
      state.decisions.set(actor, { decisionType, decidedAt: NOW + 1 });
      claims += 1;
      if (concurrent) {
        if (claims === 2) releaseClaims();
        await allClaimed;
      }
      return { rowsAffected: 1 };
    }
    if (q.startsWith('INSERT INTO approval_event')) {
      if (failEvent) throw new Error('SIMULATED_EVENT_WRITE_FAILURE');
      events.push({ eventType: values[2], actorKey: values[3] });
      return { rowsAffected: 1 };
    }
    if (q.startsWith('UPDATE approval_request')) {
      const [status, , currentStepOrder] = values;
      if (concurrent && status === 'REJECTED') await approved;
      if (state.status !== 'PENDING' || state.rev !== values[values.length - 1]) return { rowsAffected: 0 };
      Object.assign(state, { status, currentStepOrder, rev: state.rev + 1 });
      if (status === 'APPROVED') releaseApproved();
      return { rowsAffected: 1 };
    }
    if (q.startsWith('UPDATE approval_inbox')) {
      projections.push({ q, values });
      return { rowsAffected: 1 };
    }
    throw new Error(`UNEXPECTED_QUERY ${q}`);
  });
  const repo = new ApprovalRepository({ execute, tableReady: async () => true,
    columnReady: async () => true, sleep: async () => {}, jitter: () => 0 });
  repo.load = async () => ({ ...state, decisions: new Map(state.decisions), events: [...events] });
  return { repo, state, events, projections, execute };
};

test('R01: 승인·반려 동시 저장 후 저장 상태 APPROVED, 결정 원본 파생 상태 REJECTED', async () => {
  const h = harness({ concurrent: true });
  await Promise.all([
    h.repo.approve({ requestId: ID, actorKey: 'a', now: NOW + 1 }),
    h.repo.reject({ requestId: ID, actorKey: 'b', reason: '반려', reasonRequired: true, now: NOW + 1 }),
  ]);
  expect(h.state.status).toBe('APPROVED');
  expect(deriveStatus(h.state.steps, h.state.decisions)).toBe('REJECTED');
});

test('R02: 결정 클레임 후 이벤트 저장 실패는 재승인으로 복구되지 않는다', async () => {
  const h = harness({ failEvent: true });
  await expect(h.repo.approve({ requestId: ID, actorKey: 'a', now: NOW + 1 }))
    .rejects.toThrow('SIMULATED_EVENT_WRITE_FAILURE');
  const retry = await h.repo.approve({ requestId: ID, actorKey: 'a', now: NOW + 2 });
  expect(retry.status).toBe('PENDING');
  expect(deriveStatus(retry.steps, retry.decisions)).toBe('APPROVED');
  expect(h.events).toEqual([]);
});

test('R03: 업무함 투영 SQL에 세대 역행 및 기결정자 내 차례 방어가 없다', async () => {
  const h = harness();
  for (const input of [
    { status: 'APPROVED', isOpen: 0, currentStepOrder: 2, reqRev: 3 },
    { status: 'PENDING', isOpen: 1, currentStepOrder: 1, reqRev: 2 },
  ]) {
    await h.repo.updateProjection({ requestId: ID, updatedAt: NOW, actorKey: 'a', ...input });
  }
  const aggregate = h.projections.filter((p) => p.q.includes('req_rev=?'));
  expect(aggregate.map((p) => p.values[5])).toEqual([3, 2]);
  expect(aggregate[1].q.split('WHERE')[1]).toBe(' request_id=UUID_TO_BIN(?)');
  expect(aggregate[1].q).not.toMatch(/my_decided\s*=\s*0|decision_type\s*=\s*'PENDING'/);
});

test('R04: 회수 CAS 패배 후에도 CANCELLED 감사 이벤트가 남는다', async () => {
  const h = harness();
  h.repo.casAggregate = async () => { h.state.status = 'APPROVED'; return false; };
  const result = await h.repo.cancel({ requestId: ID, actorKey: 'owner', now: NOW + 1 });
  expect(result.status).toBe('APPROVED');
  expect(h.events.map((e) => e.eventType)).toEqual(['CANCELLED']);
});

test('R05: 워크로그 어댑터와 자동 요청이 쓰는 CONTENT_CHANGED가 공통 만료 함수에서 거절된다', () => {
  expect(expireByTargetChange(fresh(), { reason: 'CONTENT_CHANGED', now: NOW + 1 }))
    .toEqual({ ok: false, reason: 'bad reason' });
});

test('R06: 다음 단계로 넘어간 중간 승인에는 새 차례 결재자 알림이 없다', () => {
  expect(selectNotificationRecipients({ kind: 'APPROVED', request: { status: 'PENDING', currentStepOrder: 2 },
    requesterAccountId: 'owner', actorAccountId: 'a', approvers: [
      { accountId: 'a', stepOrder: 1, decisionType: 'APPROVE' },
      { accountId: 'b', stepOrder: 2, decisionType: 'PENDING' },
    ] })).toEqual([]);
});

test('R07: 통제 증분 조회가 가득 차면 같은 첫 묶음만 반복하고 커서를 전진시키지 않는다', async () => {
  const firstPage = Array.from({ length: 200 }, (_, i) => String(i + 1));
  const repository = { listConfirmChangesSince: jest.fn(async () => ({ ids: firstPage, full: true })) };
  const reevaluate = jest.fn(async () => {});
  const state = { update: jest.fn() };
  const worker = { repository, reevaluate, state };
  const ctx = { now: NOW, state: { confirmScanAt: NOW - 60_000 } };
  await WorklogControlWorker.prototype.scanConfirmChanges.call(worker, ctx);
  await WorklogControlWorker.prototype.scanConfirmChanges.call(worker, ctx);
  expect(repository.listConfirmChangesSince.mock.calls).toEqual([[NOW - 60_000, 200], [NOW - 60_000, 200]]);
  expect(reevaluate.mock.calls.map(([ids]) => ids)).toEqual([firstPage, firstPage]);
  expect(state.update).not.toHaveBeenCalled();
});

test('R08: 결재선 적용 프로젝트 교체 중 INSERT 실패하면 제한 목록이 비어진다', async () => {
  let projects = ['10001'];
  const query = async (sql) => {
    if (sql.startsWith('DELETE')) { projects = []; return { rowsAffected: 1 }; }
    if (sql.startsWith('INSERT')) throw new Error('SIMULATED_INSERT_FAILURE');
    throw new Error('UNEXPECTED_QUERY');
  };
  const repo = new FlowRepository({ query, tableReady: async () => true });
  await expect(repo.replaceFlowProjects(ID, ['10002'])).rejects.toThrow('SIMULATED_INSERT_FAILURE');
  expect(projects).toEqual([]);
});
