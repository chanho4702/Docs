// 결함을 재현하는 진단이다. 통과는 정상 동작이 아니라 현재 결함의 재현을 뜻한다.
import { ApprovalRepository } from '../../src/resolver/approval/ApprovalRepository';
import { ApprovalService } from '../../src/resolver/approval/ApprovalService';
import { FlowRepository } from '../../src/resolver/flow/FlowRepository';
import { PinService } from '../../src/resolver/signature/PinService';
import { DelegationService } from '../../src/resolver/delegation/DelegationService';
import { RegionService } from '../../src/resolver/region/RegionService';
import { ExpiryService } from '../../src/resolver/approval/ExpiryService';
import { InboxService } from '../../src/resolver/inbox/InboxService';
import { NotificationService, selectNotificationRecipients } from '../../src/resolver/notification/NotificationService';
import { ApprovalGroupRepository } from '../../src/resolver/directory/ApprovalGroupRepository';
import { PrivacyReporter } from '../../src/resolver/privacy/PrivacyReporter';
import settingsRepository from '../../src/resolver/settings/SettingsRepository';
import { deriveStatus } from '../../src/domain/approval/derive';
import { hashRegionBody } from '../../src/domain/approval/regionHash';

const NOW = 1_700_000_000_000;
const ID = '11111111-1111-4111-8111-111111111111';
const REGION = '22222222-2222-4222-8222-222222222222';
const initial = () => ({
  requestId: ID, pageId: '123', spaceKey: 'SPACE', status: 'PENDING', rev: 1,
  resourceType: 'PAGE', contentVersion: 1, createdAt: NOW, updatedAt: NOW, expiresAt: null,
  currentStepOrder: 1, currentStepOpenedAt: NOW, requesterKey: 'requester', stepCount: 1,
  steps: [{ stepOrder: 1, approverKeys: ['a', 'b'], requiredApprovals: 1 }],
  decisions: new Map(), events: [],
});
const input = () => ({ target: { resourceType: 'PAGE', pageId: '123' }, steps: initial().steps,
  requester: 'requester', page: { contentVersion: 1 }, expiresAt: null, now: NOW });
const node = (text) => ({ type: 'bodiedExtension', attrs: {
  extensionKey: 'approval-region', localId: 'macro-1', parameters: { regionId: REGION },
}, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const regionState = () => ({ ...initial(), resourceType: 'CONTENT_REGION', regionId: REGION,
  regionHash: hashRegionBody(node('원문')) });
const page = (text) => ({ id: '123', version: 2, title: '진단 문서', spaceKey: 'SPACE',
  adf: { type: 'doc', version: 1, content: [node(text)] } });
const service = (state, overrides = {}) => new ApprovalService({
  repository: { load: async () => state, findCcKeys: async () => [],
    approve: jest.fn(async () => ({ ...state, status: 'APPROVED', currentStepOrder: 2 })) },
  pageLoader: async () => page('원문'), permissionChecker: async () => true,
  spaceEnabled: async () => true, registryLoader: async () => [],
  policyLoader: async () => ({}), userPermissionChecker: async () => true,
  pinVerifier: async () => {}, pinStatusLoader: async () => ({ required: true, hasPin: true }),
  delegations: { activeAmong: async () => [] }, nativeNotifier: { notify: async () => ({}) },
  appNotifier: async () => ({}), clock: () => NOW, ...overrides,
});
afterEach(() => jest.restoreAllMocks());

test('R01 동시 승인·반려: 반려 원본이 있어도 APPROVED로 종결된다', async () => {
  let state = initial();
  let claims = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const repo = new ApprovalRepository({ tableReady: async () => true, sleep: async () => {}, jitter: () => 0 });
  repo.load = async () => ({ ...state, decisions: new Map(state.decisions), events: [...state.events] });
  repo.claimDecision = async (_, row) => {
    state.decisions.set(row.actorKey, { decisionType: row.decisionType, decidedAt: row.decidedAt });
    if (++claims === 2) release();
    await barrier;
    return true;
  };
  repo.appendEvent = async (_, event) => { state.events.push(event); };
  repo.casAggregate = async (_, rev, next) => {
    if (state.rev !== rev || state.status !== 'PENDING') return false;
    state = { ...state, ...next, rev: rev + 1 };
    return true;
  };
  repo.updateProjection = async () => {};
  await Promise.all([
    repo.approve({ requestId: ID, actorKey: 'a', now: NOW }),
    repo.reject({ requestId: ID, actorKey: 'b', now: NOW, reason: '반려', reasonRequired: true }),
  ]);
  expect(deriveStatus(state.steps, state.decisions)).toBe('REJECTED');
  expect(state.status).toBe('APPROVED');
});

test('R02 결정 클레임 뒤 SQL 실패: 재시도는 승인 완료 원본만 보고 복구를 생략한다', async () => {
  const state = initial();
  const repo = new ApprovalRepository({ tableReady: async () => true });
  repo.load = async () => ({ ...state, decisions: new Map(state.decisions) });
  repo.claimDecision = async (_, row) => {
    state.decisions.set(row.actorKey, { decisionType: row.decisionType, decidedAt: row.decidedAt });
    return true;
  };
  repo.appendEvent = jest.fn().mockRejectedValueOnce(new Error('SQL 장애')).mockResolvedValue({});
  repo.casAggregate = jest.fn();
  await expect(repo.approve({ requestId: ID, actorKey: 'a', now: NOW })).rejects.toThrow('SQL 장애');
  const retried = await repo.approve({ requestId: ID, actorKey: 'a', now: NOW });
  expect(retried.status).toBe('PENDING');
  expect(deriveStatus(retried.steps, retried.decisions)).toBe('APPROVED');
  expect(repo.appendEvent).toHaveBeenCalledTimes(1);
  expect(repo.casAggregate).not.toHaveBeenCalled();
});

test('R03 생성 중 자식 INSERT 실패: DRAFT가 무기한 dedupe를 점유한다', async () => {
  let draft = false;
  const query = jest.fn(async (sql) => {
    if (sql.includes('SELECT MAX(revision)')) return { rows: [{ max_revision: draft ? 1 : 0 }] };
    if (sql.includes('INSERT INTO approval_request')) {
      if (draft) throw Object.assign(new Error('Duplicate entry'), { code: 1062 });
      draft = true;
    }
    if (sql.includes('INSERT INTO approval_approver')) throw new Error('자식 저장 실패');
    if (sql.includes("SET status='EXPIRED'")) return { rows: [], rowsAffected: 0 };
    return { rows: [], rowsAffected: 1 };
  });
  const repo = new ApprovalRepository({ query, tableReady: async () => true, uuid: () => ID });
  await expect(repo.createRequest(input())).rejects.toThrow('자식 저장 실패');
  await expect(repo.createRequest(input())).rejects.toMatchObject({ code: 'ALREADY_OPEN' });
  expect(query.mock.calls.some(([sql]) => /DELETE FROM approval_request/.test(sql))).toBe(false);
});

test('R04 CAS에서 진 회수도 CANCELLED 감사 이벤트를 남긴다', async () => {
  let state = initial();
  const events = [];
  const repo = new ApprovalRepository({ tableReady: async () => true, sleep: async () => {}, jitter: () => 0 });
  repo.load = async () => ({ ...state, events: [...events] });
  repo.appendEvent = async (_, event) => { events.push(event); };
  repo.casAggregate = async () => { state = { ...state, status: 'APPROVED', rev: 2 }; return false; };
  const result = await repo.cancel({ requestId: ID, actorKey: 'requester', now: NOW });
  expect(result.status).toBe('APPROVED');
  expect(events.map((event) => event.eventType)).toEqual(['CANCELLED']);
});

test('R05 KVS 장애가 나면 필수 PIN 검증이 생략된다', async () => {
  const repository = { get: jest.fn() };
  const pins = new PinService({ repository, policyLoader: async () => { throw new Error('KVS 장애'); } });
  await expect(pins.verifyIfRequired('a')).resolves.toBe(false);
  expect(repository.get).not.toHaveBeenCalled();
});

test('R06 스페이스에서 PIN 필수여도 기본 PinService는 전역 정책만 읽는다', async () => {
  const global = jest.spyOn(settingsRepository, 'getPolicy').mockResolvedValue({ pinRequired: false });
  const effective = jest.spyOn(settingsRepository, 'getEffectivePolicy').mockResolvedValue({ pinRequired: true });
  const pins = new PinService({ repository: { get: jest.fn() } });
  await expect(pins.verifyIfRequired('a', undefined, { spaceKey: 'SPACE' })).resolves.toBe(false);
  expect(global).toHaveBeenCalled();
  expect(effective).not.toHaveBeenCalled();
});

test('R06 스페이스의 위임 금지도 기본 DelegationService에 전달되지 않는다', async () => {
  jest.spyOn(settingsRepository, 'getPolicy').mockResolvedValue({ delegationEnabled: true });
  const effective = jest.spyOn(settingsRepository, 'getEffectivePolicy').mockResolvedValue({ delegationEnabled: false });
  const delegations = new DelegationService({ repository: {
    activeAmong: async () => [{ delegatorKey: 'a', delegateKey: 'delegate' }],
  } });
  const approvals = service(initial(), { delegations });
  await expect(approvals.delegatorFor(initial(), { accountId: 'delegate' })).resolves.toBe('a');
  expect(effective).not.toHaveBeenCalled();
});

test('R07 변경된 영역: 상세 조회에서는 금지하지만 동일 서버 결정 경로는 승인한다', async () => {
  const state = regionState();
  const approvals = service(state);
  const regions = new RegionService({ repository: approvals.repository,
    pageLoader: async () => page('수정된 본문'), findLatestRequest: async () => state,
    approvalService: approvals, permissionChecker: async () => true, clock: () => NOW });
  const details = await regions.getRegionApproval({ principal: { accountId: 'a' },
    payload: { pageId: '123', regionId: REGION } });
  expect(details.regionHashMatches).toBe(false);
  expect(details.approval.canApprove).toBe(false);
  await expect(approvals.decideApproval({ principal: { accountId: 'a' },
    payload: { requestId: ID, decision: 'APPROVE' } })).resolves.toMatchObject({ status: 'APPROVED' });
  expect(approvals.repository.approve).toHaveBeenCalled();
});

test('R08 영역 응답은 필수 PIN 정보를 빠뜨린다', async () => {
  const state = regionState();
  const pinStatusLoader = jest.fn(async () => ({ required: true, hasPin: true }));
  const approvals = service(state, { pinStatusLoader });
  const regions = new RegionService({ repository: approvals.repository, pageLoader: async () => page('원문'),
    findLatestRequest: async () => state, approvalService: approvals, clock: () => NOW });
  const details = await regions.getRegionApproval({ principal: { accountId: 'a' },
    payload: { pageId: '123', regionId: REGION } });
  expect(details.approval.canApprove).toBe(true);
  expect(details.pin).toBeUndefined();
  expect(pinStatusLoader).not.toHaveBeenCalled();
});

test('R09 콜론이 있는 정상 accountId가 CC에서 조용히 제거된다', async () => {
  const ccAccount = '557058:6b97ff00-3a2a-4a51-a1c0-a2a4213a3d43';
  const approvals = service(initial());
  const prepared = await approvals.prepareRequest({ steps: initial().steps, ccKeys: [ccAccount, 'plain-user'] },
    page('원문'), { accountId: 'requester' }, NOW);
  expect(prepared.cc).toEqual(['plain-user']);
});

test('R10 Flow 교체 INSERT 실패로 기존 결재선이 사라진다', async () => {
  let steps = ['원래 결재자'];
  const repo = new FlowRepository({ tableReady: async () => true, query: async (sql) => {
    if (sql.includes('DELETE FROM approval_flow_step')) steps = [];
    return { rowsAffected: 1 };
  } });
  repo.insertSteps = async () => { throw new Error('새 단계 저장 실패'); };
  await expect(repo.updateFlow({ flowId: ID, rev: 1, now: NOW,
    name: '결재선', steps: [{ stepOrder: 1, principals: [] }] })).rejects.toThrow('새 단계 저장 실패');
  expect(steps).toEqual([]);
});

test('R11 독촉 후보 101개: 앞 100개를 모두 보냈어도 101번째를 읽지 않는다', async () => {
  const candidates = Array.from({ length: 101 }, (_, i) => ({ requestId: `req-${i}`,
    currentStepOrder: 1, currentStepOpenedAt: NOW - 10 * 86_400_000, spaceKey: 'SPACE' }));
  const loaded = [];
  const sent = new Set();
  const expiry = new ExpiryService({ repository: {
    findReminderCandidates: async (_, limit) => candidates.slice(0, limit),
    load: async (id) => { loaded.push(id); return { ...initial(), requestId: id }; },
  }, notificationStore: {
    findExistingEventKeys: async () => sent,
    insertIgnore: async (rows) => { rows.forEach((row) => sent.add(row.eventKey)); return { rowsAffected: rows.length }; },
  } });
  const context = { earliestReminderDays: 3, policyFor: () => ({ reminderEnabled: true, reminderFirstDays: 3, reminderRepeatDays: 3 }) };
  await expiry.notifyReminders(NOW, context, {});
  await expiry.notifyReminders(NOW, context, {});
  expect(loaded).toHaveLength(100);
  expect(loaded).not.toContain('req-100');
});

test('R12 앱 알림 OFF여도 요청 생성은 notification 테이블에 직접 쓴다', async () => {
  const policy = jest.spyOn(settingsRepository, 'getPolicy').mockResolvedValue({ notificationsEnabled: false });
  const query = jest.fn(async () => ({ rows: [], rowsAffected: 1 }));
  const repo = new ApprovalRepository({ query, tableReady: async () => true, uuid: () => ID });
  await repo.createRequest(input());
  expect(query.mock.calls.some(([sql]) => sql.includes('INSERT IGNORE INTO approval_notification'))).toBe(true);
  expect(policy).not.toHaveBeenCalled();
});

test('R13 다음 단계로 넘어가도 다음 승인자의 앱 알림 수신자가 없다', () => {
  const recipients = selectNotificationRecipients({ kind: 'APPROVED',
    request: { ...initial(), currentStepOrder: 2, status: 'PENDING' }, requesterAccountId: 'requester',
    actorAccountId: 'a', approvers: [{ accountId: 'a', decisionType: 'APPROVE', stepOrder: 1 },
      { accountId: 'next', decisionType: 'PENDING', stepOrder: 2 }] });
  expect(recipients).toEqual([]);
});

test('R14 목록의 숨겨진 페이지도 업무함·미읽음 집계에는 포함된다', async () => {
  const permissionFilter = jest.fn(async () => ({ visible: new Set(), pages: new Map() }));
  const inbox = new InboxService({ repository: { statusCounts: async () => [{ status: 'PENDING', count: 7 }],
    myTurnCount: async () => 7 }, visibleSpacesLoader: async () => ['SPACE'], permissionFilter,
    delegations: { activeDelegatorsOf: async () => [] } });
  const notifications = new NotificationService({ repository: { unreadCount: async () => 7 }, permissionFilter });
  expect(await inbox.getInboxCounts({ principal: { accountId: 'a' }, payload: {} })).toMatchObject({ myTurnCount: 7 });
  expect(await notifications.getUnreadCount({ principal: { accountId: 'a' } })).toEqual({ unread: 7 });
  expect(permissionFilter).not.toHaveBeenCalled();
});

test('R15 요청 폼은 승인 그룹 21개 중 첫 20개만 읽고 커서를 버린다', async () => {
  const groups = new ApprovalGroupRepository({ tableReady: async () => true,
    query: async () => ({ rows: Array.from({ length: 21 }, (_, i) => ({ group_key: `g${i}`,
      group_type: 'CUSTOM', enabled: 1, member_keys: '["a"]' })) }) });
  const approvals = service(initial(), { approvalGroups: groups, flowLister: async () => ({ items: [] }) });
  const result = await approvals.getRequestDefaults({ principal: { accountId: 'a' }, payload: { pageId: '123' } });
  expect(result.approvalGroups).toHaveLength(20);
  expect(result).not.toHaveProperty('nextCursor');
});

test('R16 개인정보 보고 스캔은 커스텀 승인 그룹의 member_keys를 읽지 않는다', async () => {
  const reporter = new PrivacyReporter({ tableReady: async () => true, settings: {
    getApprovers: async () => [], getManagers: async () => [],
  } });
  const union = await reporter.readyUnion();
  expect(union).not.toContain('approval_group');
  expect(await reporter.registryAccounts()).toEqual([]);
});

test('R17 한 배치 안에서는 시간 예산을 확인하지 않아 60초 예산도 초과한다', async () => {
  let now = NOW;
  const ids = Array.from({ length: 50 }, (_, i) => `req-${i}`);
  const expiry = new ExpiryService({ clock: () => now, repository: {
    findDue: async () => ids,
    expireByDeadline: async () => { now += 2000; return { closed: false }; },
  } });
  const summary = { expired: 0, failed: 0 };
  await expiry.expireDue(NOW, summary);
  expect(now - NOW).toBe(100_000);
  expect(summary.dueScanned).toBe(50);
});
