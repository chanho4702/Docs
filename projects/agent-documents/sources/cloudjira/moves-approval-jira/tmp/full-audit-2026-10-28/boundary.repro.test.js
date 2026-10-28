import { TransitionValidatorService } from '../../src/resolver/transition/TransitionValidatorService';
import { TransitionRuleRepository } from '../../src/resolver/transition/TransitionRuleRepository';
import { createMemoryPlainStore, createMemoryRuleStore } from '../../src/resolver/transition/__test__/memoryRuleStore';
import { isTableReady, resetTableReadinessCache } from '../../src/rdb/schema/TableReadiness';
import * as commonQuery from '../../src/rdb/query/CommonQuery';
import { InboxService } from '../../src/resolver/inbox/InboxService';
import { ApprovalService, loadGroupMembersByName } from '../../src/resolver/approval/ApprovalService';
import * as requestJira from '../../src/api/jira/RequestJira';

afterEach(() => { jest.restoreAllMocks(); resetTableReadinessCache(); });

test('R10: 승인 규칙이 있어도 테이블 프로브와 후보 조회가 SQL 장애이면 validator가 통과한다', async () => {
  resetTableReadinessCache();
  jest.spyOn(commonQuery, 'executeQuery').mockRejectedValue(new Error('SIMULATED_SQL_UNAVAILABLE'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const rules = new TransitionRuleRepository({
    store: createMemoryRuleStore(), plain: createMemoryPlainStore(),
    uuid: () => '22222222-2222-4222-8222-222222222222',
  });
  await rules.insert({ projectId: '10000', projectKey: 'OPS', issueTypeId: '*', toStatusId: '5',
    enabled: true, flowId: '11111111-1111-4111-8111-111111111111', now: 1_700_000_000_000 });
  const service = new TransitionValidatorService({ rules, tableReady: isTableReady,
    transitions: { findCandidates: async () => { throw new Error('SIMULATED_SQL_UNAVAILABLE'); } },
    globalEnabled: async () => true, featureEnabled: async () => true,
    projectEnabled: async () => true, licenseBlocked: async () => false,
    reader: { issueForValidator: async () => ({ issueId: '100', issueKey: 'OPS-1', projectId: '10000',
      issueTypeId: '10001', currentStatusId: '3' }) }, autoRequest: null,
    logger: { log: jest.fn(), error: jest.fn() },
  });
  const result = await service.validate({ issue: { id: '100', key: 'OPS-1' },
    transition: { from: { id: '3' }, to: { id: '5' } } }, {});
  expect(commonQuery.executeQuery).toHaveBeenCalled();
  expect(result).toEqual({ result: true });
});

test('R11: 권한 조회 장애가 업무함 정상 빈 결과와 구별되지 않는다', async () => {
  const service = new InboxService({
    repository: { page: async () => [{ request_id: '11111111-1111-4111-8111-111111111111',
      target_kind: 'ISSUE', target_key: '100', updated_at: '2026-10-28 00:00:00' }] },
    permissionFilter: async () => { throw new Error('SIMULATED_PERMISSION_OUTAGE'); },
    delegations: { activeDelegatorsOf: async () => [] }, worklogSnapshots: async () => new Map(),
  });
  expect(await service.listInbox({ principal: { accountId: 'viewer' }, payload: { tab: 'myturn' } }))
    .toEqual({ items: [], nextCursor: null, hasMore: false, limit: 20 });
});

test('R12: Jira 그룹의 두 번째 페이지가 403이면 전원 승인 그룹이 첫 페이지 인원만 요구한다', async () => {
  jest.spyOn(requestJira, 'asUser')
    .mockResolvedValueOnce({ status: 200, body: { values: [{ accountId: 'first-member', active: true }], isLast: false } })
    .mockResolvedValueOnce({ status: 403, body: {} });
  const service = new ApprovalService({ groupMemberByNameLoader: loadGroupMembersByName,
    approvalGroups: { findByKey: async () => ({ enabled: true, type: 'JIRA', groupKey: 'all-reviewers', requireAll: true }) },
  });
  const step = await service.expandApprovalGroup('all-reviewers');
  expect(requestJira.asUser).toHaveBeenCalledTimes(2);
  expect(step.approverKeys).toEqual(['first-member']);
  expect(step.requiredApprovals).toBe(1);
});
