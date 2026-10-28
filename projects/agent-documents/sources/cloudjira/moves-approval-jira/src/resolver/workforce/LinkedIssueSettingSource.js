import { kvs } from '@forge/kvs';
import { currentAccountId, memo } from '../../permission/InvocationScope';
import { kbBodyValid, LIMITS, settingBodyValid, SystemReason } from '../../integration/channel/ops';
import { effectiveSetting } from '../../domain/linkedIssue/setting';
import { LogicalError } from '../../error/LogicalError';
import channelState from '../channel/ChannelState';
import channelClient from '../channel/ChannelClient';
import settingsAudit from '../settings/SettingsAuditRepository';
import links, { InboundTyp } from './WorkforceLinkRepository';

/**
 * 연동 이슈의 연결 여부·팀장 설정(작성 기간·사전 승인·결재선)·프로젝트 근무 기준(kb) — 원장 주인(워크포스)에게 묻는다(§1.3 F02~F04).
 *
 *   link.resolve {issueIds≤100} → 캐시 link(I:) + linkset(I:) [+ 연결 이슈의 프로젝트 표식 link(P:)]
 *   kb.get {projectIds≤20}     → 캐시 kb(P:)
 *
 * 신선도: link·linkset 1시간(SETTING_RECHECK_MS), kb 24시간. 쓰기·제출은 force 로 즉시 다시 묻는다(현 규칙).
 * change.notify{LINK|SETTING|KB} 는 KVS 표식(approval:wf:epoch:*)만 남겨 그 전 확인분을 다시 묻게 한다. SETTING 의 data 동봉은 바로 반영한다.
 * 통신 실패: 캐시가 있으면 그 값(settingStale), 없으면 settingUnresolved + unavailable(판정 불명 — 기간 창이 켜진 쓰기는 거부, Q3 fail-close).
 * sticky·서명 검증·rev 충돌 병합(property 판)은 폐기 — 주인이 현재 값을 답한다.
 * 연동 모드(스위치 ∧ 페어링)가 아니면 채널을 부르지 않는다.
 */
export const SETTING_RECHECK_MS = 3_600_000;
export const KB_RECHECK_MS = 86_400_000;
/** 연결 신호 캐시의 유효 기간 — controlLinkOf 가 exp 로 FRESH/STALE/EXPIRED 를 가른다. 표시는 72시간까지 허용(§4.3). */
export const LINK_EXP_MS = 72 * 3_600_000;
export const LINKED_SETTING_MARKER = 'approval:linkedSetting:any';
export const LINK_EPOCH_KEY = 'approval:wf:epoch:LINK';
export const KB_EPOCH_KEY = 'approval:wf:epoch:KB';
export const SETTING_TYP = InboundTyp.SETTING;
export const KB_TYP = InboundTyp.KB;

const isKbTyp = (typ) => typ === InboundTyp.KB || typ === 'rms.kb';

/**
 * 캐시 행 → 화면·정책이 쓰는 설정 뷰. 순수 — 묶음 조회(cert.query 의 WorklogPolicyRepository.layersFor)도 같은 함수로 읽는다.
 * 본문은 워크포스 응답 그대로(wa 포함 — 팀장 closeDays·autoRequest 를 merge·자동 요청이 쓴다).
 */
/**
 * 설정 미해결의 원인 코드(화면 문구 분기) — 저장 실패 · 저장소 미준비 · 그 밖(워크포스 응답 없음·통신 실패·판정 불명).
 * @returns 'LINKED_SETTING_PERSIST_FAILED' | 'STORAGE_NOT_READY' | 'WORKFORCE_UNAVAILABLE' | null(미해결 아님)
 */
export const settingCodeOf = (setting) => {
  if (!setting?.settingUnresolved) return null;
  if (setting.code === 'LINKED_SETTING_PERSIST_FAILED' || setting.code === 'STORAGE_NOT_READY') return setting.code;
  return 'WORKFORCE_UNAVAILABLE';
};

export const settingViewOf = (row, projectId, result = {}) => {
  const trusted = row?.status === 'VERIFIED' && row.body?.projectId === String(projectId);
  const active = trusted && !row.body?.released && !result.settingUnresolved;
  return {
    ...result,
    row,
    status: trusted ? 'VERIFIED' : 'NONE',
    active,
    body: active ? (row.typ === InboundTyp.SETTING ? { ...row.body, ...effectiveSetting(row.body) } : row.body) : null,
    rev: trusted ? row.srcRev : null,
    settingUnresolved: Boolean(result.settingUnresolved),
  };
};

export const createLinkedIssueSettingSource = (deps = {}) => {
  const dep = {
    get links() { return deps.links ?? links; },
    get client() { return deps.client ?? channelClient; },
    get state() { return deps.state ?? channelState; },
    get audit() { return deps.audit ?? settingsAudit; },
    get store() { return deps.store ?? kvs; },
  };
  const clock = deps.clock ?? Date.now;
  const principal = deps.principal ?? currentAccountId;
  const logger = deps.logger ?? console;
  const onLinkChanged = deps.onLinkChanged ?? null;

  const epochOf = (key) => memo(`wf:epoch:${key}`, async () => {
    try {
      const value = await dep.store.get(key);
      return Number.isFinite(value?.at) ? value.at : 0;
    } catch {
      return 0;
    }
  });

  const view = settingViewOf;

  const systemFor = (issueIds, system) => {
    if (principal()) return {};
    if (system && issueIds.length === 1) return { system: { reason: SystemReason.WORKLOG_EVENT_ISSUE, subject: issueIds[0] } };
    return null;
  };

  /** link.resolve 결과 한 이슈 → 캐시 두 행(link·linkset). 바뀐 경우만 쓴다. */
  const applyIssue = async (issueId, requestedProjectId, answer, stored, now) => {
    const projectId = answer?.projectId ?? requestedProjectId ?? null;
    const linked = answer?.linked === true;
    const released = answer?.released === true;
    const linkBody = {
      rev: 0,
      values: {},
      locks: {},
      projectId: projectId == null ? null : String(projectId),
      issueId,
      iat: now,
      exp: now + LINK_EXP_MS,
      linked,
      released,
      wfProjectId: answer?.wfProjectId ?? null,
      // 연결 근거(판 2) — ISSUE(이슈 앱 필드) | PROJECT(무필터 SPACE 구독 프로젝트). 둘 다 이 이슈를 연결로 본다.
      basis: answer?.basis === 'PROJECT' ? 'PROJECT' : 'ISSUE',
      ...(released && !linked ? { ctl: 'NONE' } : {}),
    };
    const linkRow = {
      typ: InboundTyp.LINK,
      entityId: `I:${issueId}`,
      status: linked || released ? 'VERIFIED' : 'NONE',
      body: linkBody,
      srcRev: 0,
      kid: null,
      issuedAt: now,
      lastResult: 'OK',
      failCount: 0,
      verifiedAt: linked || released ? now : null,
    };
    const setting = linked && answer?.setting && settingBodyValid(answer.setting) ? answer.setting : null;
    const settingRow = {
      typ: InboundTyp.SETTING,
      entityId: `I:${issueId}`,
      status: setting || (released && stored.setting?.status === 'VERIFIED') ? 'VERIFIED' : 'NONE',
      body: setting
        ? { ...setting, projectId: linkBody.projectId, issueId, iat: now }
        : released && stored.setting?.body ? { ...stored.setting.body, released: true } : null,
      srcRev: setting ? setting.rev : null,
      kid: null,
      issuedAt: now,
      lastResult: 'OK',
      failCount: 0,
      verifiedAt: setting ? now : null,
    };
    const wroteLink = await dep.links.upsertInbound(linkRow, now);
    const settingChanged = setting && (stored.setting?.status !== 'VERIFIED' || stored.setting?.srcRev !== setting.rev
      || JSON.stringify(stored.setting?.body?.s ?? null) !== JSON.stringify(setting.s ?? null));
    if (settingChanged) {
      await dep.audit.recordLinkedIssueSetting({
        typ: InboundTyp.SETTING, entityId: settingRow.entityId, body: setting, iat: now, now,
      }).catch(() => false);
    }
    const wroteSetting = await dep.links.upsertInbound(settingRow, now);
    if (setting) await dep.store.set(LINKED_SETTING_MARKER, true).catch(() => {});
    // 연결 이슈를 본 프로젝트 행(이력 수집 범위) — I: 행과 같은 본문 형식(linked·released·basis, ctl 없음 = 프로젝트 전체 연동으로 읽히지 않는다).
    // 처음 볼 때 INSERT, 근거가 PROJECT 로 바뀌었을 때만 갱신(그 밖 SQL 0).
    if (linked && linkBody.projectId && (!stored.project || (linkBody.basis === 'PROJECT' && stored.project.body?.basis !== 'PROJECT'))) {
      const projectRow = {
        typ: InboundTyp.LINK,
        entityId: `P:${linkBody.projectId}`,
        status: 'VERIFIED',
        body: {
          rev: 0, values: {}, locks: {}, projectId: linkBody.projectId, iat: now, exp: now + LINK_EXP_MS, linked: true, released: false, basis: linkBody.basis,
        },
        srcRev: 0,
        issuedAt: now,
        lastResult: 'OK',
        verifiedAt: now,
      };
      await (stored.project ? dep.links.upsertInbound(projectRow, now) : dep.links.insertInbound(projectRow, now)).catch(() => false);
    }
    const wasLinked = stored.link?.status === 'VERIFIED' && stored.link?.body?.linked === true;
    const wasReleased = stored.link?.status === 'VERIFIED' && stored.link?.body?.released === true;
    if ((linked && !wasLinked) || (released && !wasReleased)) {
      await Promise.resolve(onLinkChanged?.({ projectId: linkBody.projectId, issueId })).catch(() => {});
    }
    return { link: wroteLink ?? linkRow, setting: wroteSetting ?? settingRow };
  };

  const source = {
    /**
     * 여러 이슈를 한 번에(타임시트 제출·트리거) — Map<issueId, {setting: view, link: {linked, released, unavailable}}>.
     * @param targets [{issueId, projectId}]
     * @param options.force 캐시가 신선해도 다시 묻는다(쓰기·제출)
     * @param options.system 사람 없는 경로(트리거) — 이슈 1건일 때만 SYSTEM(worklog-event-issue)으로 묻는다
     */
    async resolveMany(targets, { force = false, system = false, now = clock(), recheckMs = SETTING_RECHECK_MS } = {}) {
      const list = [...new Map((targets ?? []).filter((t) => t?.issueId).map((t) => [String(t.issueId), { issueId: String(t.issueId), projectId: t.projectId == null ? null : String(t.projectId) }])).values()];
      const out = new Map();
      if (!list.length) return out;
      // 연동 모드(스위치 ∧ PAIRED)가 **명시적으로 아니면** 캐시가 VERIFIED 로 남아 있어도 연결로 보지 않는다(product-polish B.3) — SQL·채널 0.
      // 판정 **오류**는 미연결과 다르다(Codex 검수 #1): 미해결(settingUnresolved·unavailable)로 돌려 쓰기·제출이 거부되게 한다(fail-close).
      // 이미 연동으로 확인된 제출 중 이 재조회만 실패해 작성 기간·사전 승인을 버리고 진행하는 일이 없게.
      let linkedMode;
      try {
        linkedMode = (await dep.state.isLinked()) === true;
      } catch (error) {
        logger.warn('[WF][link] link state unknown', String(error?.code ?? error?.message ?? error));
        list.forEach((t) => out.set(t.issueId, {
          setting: view(null, t.projectId, { settingUnresolved: true, code: 'LINK_STATE_UNKNOWN' }), link: { linked: false, released: false, unavailable: true },
        }));
        return out;
      }
      if (!linkedMode) {
        list.forEach((t) => out.set(t.issueId, { setting: view(null, t.projectId, { code: 'NOT_LINKED' }), link: { linked: false, released: false, unavailable: false } }));
        return out;
      }
      if (!(await dep.links.ready())) {
        list.forEach((t) => out.set(t.issueId, { setting: view(null, t.projectId, { settingUnresolved: true, code: 'STORAGE_NOT_READY' }), link: { linked: false, released: false, unavailable: true } }));
        return out;
      }
      const entities = list.flatMap((t) => [`I:${t.issueId}`, ...(t.projectId ? [`P:${t.projectId}`] : [])]);
      const rows = await dep.links.findInboundMany([InboundTyp.LINK, InboundTyp.SETTING], entities);
      const storedOf = (t) => ({
        link: rows.get(`${InboundTyp.LINK}|I:${t.issueId}`) ?? null,
        setting: rows.get(`${InboundTyp.SETTING}|I:${t.issueId}`) ?? null,
        project: t.projectId ? rows.get(`${InboundTyp.LINK}|P:${t.projectId}`) ?? null : null,
      });
      const freshAfter = Math.max(now - recheckMs, await epochOf(LINK_EPOCH_KEY));
      const due = list.filter((t) => {
        const stored = storedOf(t).link;
        return force || !stored || !Number.isFinite(stored.checkedAt) || stored.checkedAt < freshAfter;
      });
      const answered = new Map();
      const failed = new Set();
      for (let i = 0; i < due.length; i += LIMITS.LINK_ISSUES) {
        const part = due.slice(i, i + LIMITS.LINK_ISSUES);
        const options = systemFor(part.map((t) => t.issueId), system);
        if (!options) {
          part.forEach((t) => failed.add(t.issueId));
          continue;
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const data = await dep.client.call('link.resolve', { issueIds: part.map((t) => t.issueId) }, options);
          part.forEach((t) => answered.set(t.issueId, data.issues?.[t.issueId] ?? { linked: false, released: false, setting: null }));
        } catch (error) {
          logger.warn('[WF][link] resolve failed', String(error?.code ?? error?.message ?? error));
          part.forEach((t) => failed.add(t.issueId));
        }
      }
      for (const t of list) {
        const stored = storedOf(t);
        let linkRow = stored.link;
        let settingRow = stored.setting;
        let result = { code: 'UNCHANGED' };
        if (answered.has(t.issueId)) {
          // eslint-disable-next-line no-await-in-loop
          const written = await applyIssue(t.issueId, t.projectId, answered.get(t.issueId), stored, now);
          linkRow = written.link;
          settingRow = written.setting;
          result = { code: 'UPDATED', updated: true };
        } else if (failed.has(t.issueId)) {
          // 캐시 대체는 표시용(force 아님)만 — 쓰기·제출(force)의 재조회 실패는 캐시가 있어도 미해결(=거부, 설계 §4.3·Q3, 코덱스 검수 #1).
          // 팀장이 기간을 좁히거나 사전 승인을 필수로 바꾼 뒤 알림이 유실되고 워크포스가 장애면, 캐시로 허용하면 느슨한 옛 설정으로 기록된다.
          const fallback = !force && linkRow && Number.isFinite(linkRow.checkedAt) && now - linkRow.checkedAt <= LINK_EXP_MS;
          result = fallback ? { code: 'READ_FAILED', settingStale: true } : { code: 'READ_FAILED', settingStale: true, settingUnresolved: true };
        }
        const linkView = linkRow?.status === 'VERIFIED'
          ? {
            linked: linkRow.body?.linked === true, released: linkRow.body?.released === true, unavailable: false, basis: linkRow.body?.basis ?? 'ISSUE',
          }
          : { linked: false, released: false, unavailable: Boolean(result.settingUnresolved) };
        out.set(t.issueId, { setting: view(settingRow, t.projectId, result), link: linkView });
      }
      return out;
    },

    async readCached({ projectId, issueId = null, typ = SETTING_TYP }) {
      if (!(await dep.links.ready())) return view(null, projectId, { settingUnresolved: true, code: 'STORAGE_NOT_READY' });
      const row = await dep.links.findInbound(isKbTyp(typ) ? InboundTyp.KB : InboundTyp.SETTING, issueId && !isKbTyp(typ) ? `I:${issueId}` : `P:${projectId}`);
      return view(row, projectId);
    },

    assertWritable(setting) {
      if (setting.settingUnresolved) {
        const code = setting.code === 'LINKED_SETTING_PERSIST_FAILED' ? setting.code : 'WORKLOG_WINDOW_UNRESOLVED';
        throw new LogicalError(code, code);
      }
      return setting;
    },

    /**
     * 한 대상 — 이슈 설정(typ linkset) 또는 프로젝트 근무 기준(typ kb).
     * @returns view {row, status, active, body, rev, settingUnresolved, settingStale?, code}
     */
    async read({
      projectId, issueId = null, typ = SETTING_TYP, force = false, now = clock(), recheckMs, system = false,
    }) {
      if (isKbTyp(typ)) return source.readKb({ projectId, force, now, recheckMs: recheckMs ?? KB_RECHECK_MS });
      const result = await source.resolveMany([{ issueId, projectId }], {
        force, system, now, recheckMs: recheckMs ?? SETTING_RECHECK_MS,
      });
      return result.get(String(issueId))?.setting ?? view(null, projectId, { settingUnresolved: true, code: 'READ_FAILED' });
    },

    /** 연결 신호만(통제 판정용) — {linked, released, unavailable}. */
    async linkOf({ issueId, projectId = null, force = false, system = false }) {
      const result = await source.resolveMany([{ issueId, projectId }], { force, system });
      return result.get(String(issueId))?.link ?? { linked: false, released: false, unavailable: true };
    },

    async readKb({
      projectId, force = false, now = clock(), recheckMs = KB_RECHECK_MS,
    }) {
      const entityId = `P:${projectId}`;
      if (!(await dep.links.ready())) return view(null, projectId, { settingUnresolved: true, code: 'STORAGE_NOT_READY' });
      const stored = await dep.links.findInbound(InboundTyp.KB, entityId);
      const freshAfter = Math.max(now - recheckMs, await epochOf(KB_EPOCH_KEY));
      if (!force && stored && Number.isFinite(stored.checkedAt) && stored.checkedAt >= freshAfter) return view(stored, projectId, { code: 'UNCHANGED' });
      if (!principal() || !(await dep.state.isLinked().catch(() => false))) return view(stored, projectId, { code: 'UNCHANGED' });
      try {
        const data = await dep.client.call('kb.get', { projectIds: [String(projectId)] });
        const kb = data.kb?.[String(projectId)] ?? null;
        const ok = kb && kbBodyValid(kb);
        const row = await dep.links.upsertInbound({
          typ: InboundTyp.KB,
          entityId,
          status: ok ? 'VERIFIED' : 'NONE',
          body: ok ? { ...kb, projectId: String(projectId) } : null,
          srcRev: ok ? kb.rev : null,
          issuedAt: now,
          lastResult: 'OK',
          verifiedAt: ok ? now : null,
        }, now);
        return view(row, projectId, { code: 'UPDATED', updated: true });
      } catch (error) {
        logger.warn('[WF][kb] fetch failed', String(error?.code ?? error?.message ?? error));
        return view(stored, projectId, { code: 'READ_FAILED', settingStale: true, settingUnresolved: !stored });
      }
    },

    /** 연결 해제 반영(관리 경로) — 설정 행을 해제 표시로. */
    async release({ projectId, issueId, now = clock() }) {
      if (!(await dep.links.ready())) return { settingUnresolved: true, code: 'STORAGE_NOT_READY' };
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          const row = await dep.links.findInbound(InboundTyp.SETTING, `I:${issueId}`);
          if (!row || row.body?.released || row.body?.projectId !== String(projectId)) return { updated: false };
          // eslint-disable-next-line no-await-in-loop
          if (await dep.links.updateInbound({ ...row, body: { ...row.body, released: true } }, row.rev, now)) return { updated: true };
        }
      } catch {
        return { settingUnresolved: true, code: 'LINKED_SETTING_PERSIST_FAILED' };
      }
      return { settingUnresolved: true, code: 'LINKED_SETTING_PERSIST_FAILED' };
    },

    /** change.notify — 종류별 표식(SQL 0), SETTING 동봉 값은 바로 반영(rev 가 낮거나 같으면 무시). */
    async onNotify({ kind, data = null, now = clock() }) {
      const key = kind === 'KB' ? KB_EPOCH_KEY : LINK_EPOCH_KEY;
      const current = await dep.store.get(key).catch(() => null);
      if (!Number.isFinite(current?.at) || current.at < now) await dep.store.set(key, { at: now });
      let applied = 0;
      if (kind === 'SETTING' && data && (await dep.links.ready())) {
        const ids = Object.keys(data);
        const stored = ids.length ? await dep.links.findInboundMany(InboundTyp.SETTING, ids.map((id) => `I:${id}`)) : new Map();
        for (const issueId of ids) {
          const body = data[issueId];
          const before = stored.get(`I:${issueId}`) ?? null;
          if (!before?.body?.projectId) continue;
          if (body && Number.isFinite(before.srcRev) && body.rev <= before.srcRev) continue;
          const row = body
            ? { ...before, status: 'VERIFIED', body: { ...body, projectId: before.body.projectId, issueId, iat: now }, srcRev: body.rev, lastResult: 'OK', verifiedAt: now }
            : { ...before, status: 'NONE', body: null, srcRev: null, lastResult: 'OK' };
          // eslint-disable-next-line no-await-in-loop
          if (body) await dep.audit.recordLinkedIssueSetting({ typ: InboundTyp.SETTING, entityId: `I:${issueId}`, body, iat: now, now }).catch(() => false);
          // eslint-disable-next-line no-await-in-loop
          if (await dep.links.updateInbound(row, before.rev, now)) applied += 1;
        }
      }
      return applied;
    },
  };
  return source;
};

/** 연결 신호가 새로 생기거나 해제되면 통제 백필을 깨운다 — 순환 import 를 피해 호출 시점에 꺼낸다. */
const wakeControlBackfill = () => require('../worklogControl/WorklogControlHooks').default.linkSignalChanged();

export default createLinkedIssueSettingSource({ onLinkChanged: wakeControlBackfill });
