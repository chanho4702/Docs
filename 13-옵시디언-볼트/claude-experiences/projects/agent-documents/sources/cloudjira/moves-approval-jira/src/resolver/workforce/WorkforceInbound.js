import { kvs } from '@forge/kvs';
import { currentAccountId, memo } from '../../permission/InvocationScope';
import { orgBodyValid, SystemReason } from '../../integration/channel/ops';
import channelState from '../channel/ChannelState';
import channelClient from '../channel/ChannelClient';
import workforceLinkRepository, { InboundTyp } from './WorkforceLinkRepository';

/**
 * 워크포스 조직(org) — 원장 주인(워크포스)에게 org.get 으로 묻고 workforce_inbound(typ org)에 캐시한다(§1.3 F01, §4.3).
 *
 * 신선도: 5분 FRESH. 그 뒤 72시간까지는 STALE — 표시·결재 라우팅만 쓰고, **권한을 넓히는 판단**(팀장 본인 결재·팀장 범위 조회)은
 * FRESH 만 쓴다(P1-2, 호출부 WorkforceOrgSource). 워크포스의 change.notify{ORG} 는 KVS 표식(wf:epoch:ORG)을 남기고
 * 그 시각 전에 확인한 행을 STALE 로 본다 — 놓쳐도 5분 TTL 이 메운다.
 * 사람 호출이면 actor = 그 사람(InvocationScope), 사람 없는 자동 요청이면 SYSTEM(auto-request-author, subject = 작성자 1명)만.
 * 통신 실패는 캐시를 그대로 쓴다(sticky 규칙은 폐기 — 주인이 답하는 값이 진실이다).
 */
export const ORG_MAX_AGE_MS = 300_000;
export const ORG_STALE_MS = 72 * 3_600_000;
export const ORG_EPOCH_KEY = 'approval:wf:epoch:ORG';
export const InboundStatus = Object.freeze({ VERIFIED: 'VERIFIED', NONE: 'NONE' });

export const createWorkforceInbound = ({
  repository = workforceLinkRepository,
  client = channelClient,
  state = channelState,
  store = kvs,
  principal = currentAccountId,
  clock = Date.now,
  logger = console,
} = {}) => {
  const epochAt = () => memo('wf:epoch:ORG', async () => {
    try {
      const value = await store.get(ORG_EPOCH_KEY);
      return Number.isFinite(value?.at) ? value.at : 0;
    } catch {
      return 0;
    }
  });

  const viewOf = (row, now, freshAfter) => {
    if (!row || row.status !== InboundStatus.VERIFIED || !Number.isFinite(row.checkedAt) || now - row.checkedAt > ORG_STALE_MS) {
      return { status: InboundStatus.NONE };
    }
    return {
      status: InboundStatus.VERIFIED,
      body: row.body ?? {},
      kid: row.kid,
      rev: row.srcRev,
      iat: row.issuedAt,
      fresh: row.checkedAt >= freshAfter,
    };
  };

  const store1 = async (accountId, org, now) => {
    const ok = org && orgBodyValid(org);
    return repository.upsertInbound({
      typ: InboundTyp.ORG,
      entityId: accountId,
      status: ok ? InboundStatus.VERIFIED : InboundStatus.NONE,
      body: ok ? org : null,
      srcRev: ok ? org.rev : null,
      kid: null,
      issuedAt: now,
      lastResult: 'OK',
      failCount: 0,
      verifiedAt: ok ? now : null,
    }, now);
  };

  return {
    /**
     * @param automaticRead 사람 없는 자동 요청 — 작성자 한 명만 SYSTEM 으로 묻는다(principal 이 있으면 무시)
     * @returns {{status:'VERIFIED', body, kid, rev, iat, fresh} | {status:'NONE'}}
     */
    async orgOf(accountId, { automaticRead = false, maxAgeMs = ORG_MAX_AGE_MS, now = clock() } = {}) {
      if (!accountId || !(await repository.ready())) return { status: InboundStatus.NONE };
      let row = await repository.findInbound(InboundTyp.ORG, accountId);
      const freshAfter = Math.max(now - maxAgeMs, await epochAt());
      const stale = !row || !Number.isFinite(row.checkedAt) || row.checkedAt < freshAfter;
      if (stale && (await state.isLinked().catch(() => false))) {
        const caller = principal();
        const system = !caller && automaticRead === true
          ? { reason: SystemReason.AUTO_REQUEST_AUTHOR, subject: accountId } : null;
        if (caller || system) {
          try {
            const data = await client.call('org.get', { accountIds: [String(accountId)] }, system ? { system } : {});
            row = (await store1(String(accountId), data.orgs?.[accountId] ?? null, now)) ?? row;
          } catch (error) {
            logger.warn('[WF][org] fetch failed', String(error?.code ?? error?.message ?? error));
          }
        }
      }
      return viewOf(row, now, freshAfter);
    },

    /**
     * 관리자 "다시 묻기" — 지정한 사용자들(≤50)을 org.get 한 번으로 묻고 캐시를 갱신한다(actor = 호출 관리자).
     * @returns Array<{accountId, status, capable, result}> — capable 은 연결(페어링) 여부, result 'OK'|'UNREADABLE'
     */
    async refreshOrgs(accountIds, { now = clock() } = {}) {
      const ids = [...new Set((accountIds ?? []).filter(Boolean).map(String))].slice(0, 50);
      if (!ids.length || !(await repository.ready())) return [];
      const linked = await state.isLinked().catch(() => false);
      let orgs = null;
      if (linked && principal()) {
        try {
          orgs = (await client.call('org.get', { accountIds: ids })).orgs ?? {};
        } catch (error) {
          logger.warn('[WF][org] refresh failed', String(error?.code ?? error?.message ?? error));
        }
      }
      const out = [];
      for (const accountId of ids) {
        // eslint-disable-next-line no-await-in-loop
        const row = orgs ? await store1(accountId, orgs[accountId] ?? null, now) : await repository.findInbound(InboundTyp.ORG, accountId);
        out.push({
          accountId,
          status: row?.status === InboundStatus.VERIFIED ? InboundStatus.VERIFIED : InboundStatus.NONE,
          capable: linked,
          result: orgs ? 'OK' : 'UNREADABLE',
        });
      }
      return out;
    },

    /** 검증된 org 중 워크포스가 결재자(leaderKeys, 본인 제외)를 정한 계정 — 명부 팀장 범위에서 뺀다. 캐시만(SQL 1). */
    async overriddenSubjects(accountIds) {
      const ids = [...new Set((accountIds ?? []).filter(Boolean).map(String))];
      if (!ids.length || !(await repository.ready())) return new Set();
      const bodies = await repository.verifiedOrgBodies(ids);
      return new Set([...bodies.entries()]
        .filter(([id, body]) => (Array.isArray(body?.leaderKeys) ? body.leaderKeys : []).some((key) => key !== id))
        .map(([id]) => id));
    },

    /** change.notify{ORG} — 표식만 남긴다(SQL 0). 같은 시각보다 오래된 표식은 덮지 않는다. */
    async invalidate(now = clock()) {
      const current = await store.get(ORG_EPOCH_KEY).catch(() => null);
      if (Number.isFinite(current?.at) && current.at >= now) return false;
      await store.set(ORG_EPOCH_KEY, { at: now });
      return true;
    },
  };
};

export const workforceInbound = createWorkforceInbound();

export default workforceInbound;
