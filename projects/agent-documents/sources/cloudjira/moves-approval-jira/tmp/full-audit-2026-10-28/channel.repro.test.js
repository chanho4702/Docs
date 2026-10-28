import { createChannelServer } from '../../src/resolver/channel/ChannelServer';
import { getLicenseDecision } from '../../src/utils/license/LicenseGuard';
import { approvalSigner, CLOUD_ID, LINK_ID, NOW, webtriggerContext, wfRequest }
  from '../../src/resolver/channel/__test__/testChannel';

test('R09: 같은 active:false가 공통 가드는 INACTIVE, 채널은 요청 실행으로 갈라진다', async () => {
  const handler = jest.fn(async () => ({ docs: [] }));
  const server = createChannelServer({
    handlers: { 'cert.query': handler }, signer: approvalSigner(),
    state: { read: async () => ({ status: 'PAIRED', linkId: LINK_ID }) },
    settings: { isWorkforceLinkEnabled: async () => true },
    cloudIds: { learn: async () => CLOUD_ID }, links: { recordLog: async () => {} },
    migrate: async () => {}, clock: () => NOW,
    logger: { warn: jest.fn(), error: jest.fn() },
  });
  const context = { ...webtriggerContext(), license: { active: false } };
  expect((await getLicenseDecision({ context })).state).toBe('INACTIVE');
  const event = wfRequest({ op: 'cert.query', data: { purpose: 'COST', pairs: [['acc-2', '2026-10']] } }).event;
  const response = await server.handle(event, context);
  expect(response.statusCode).toBe(200);
  expect(handler).toHaveBeenCalledTimes(1);
});
