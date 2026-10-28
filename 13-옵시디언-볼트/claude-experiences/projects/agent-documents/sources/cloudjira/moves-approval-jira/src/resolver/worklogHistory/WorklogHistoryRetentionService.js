import { kvs } from '@forge/kvs';
import {
  decodeCursor, encodeCursor, historyItemOf, maskForViewer, monthsCutoff, RETENTION_MONTH_OPTIONS,
} from '../../domain/timesheet/worklogHistory';
import { LogicalError } from '../../error/LogicalError';
import { filterVisibleIssues } from '../../permission/JiraPermission';
import { ErrorCodes } from '../../utils/errors/ErrorCodes';
import settingsRepository, { DEFAULT_APPROVAL_SETTINGS, SETTINGS_KEYS } from '../settings/SettingsRepository';
import { recordSettingsAudit } from '../settings/SettingsAuditRepository';
import { loadUsers } from '../timesheet/userDisplay';
import worklogHistoryRepository from './WorklogHistoryRepository';
import { userMapOf } from './WorklogHistoryService';
import exportSessionRepository, { exportFingerprint } from '../retention/ExportSessionRepository';
import {
  DEFAULT_LINKED_HISTORY_MONTHS, LINKED_HISTORY_MONTH_OPTIONS, parseDownloadRange,
} from '../../domain/retention/recordRetention';

/** 결재 기록 보관(approval:retention)과 독립 — 기간·내보내기 기록을 따로 든다. */
const STATE_KEY = 'approval:retention:worklogHistory';

/**
 * 보관 종류(audit-retention-sync R2, Q132 b) — 일반분과 워크포스 연결분(행의 wf_linked = 1, 기록 당시)은 보관 기간·내보내기 세션·
 * 마지막 내보내기 기록이 따로다. 연결 여부는 기록 당시 값이라 지금 연동이 풀려도 바뀌지 않는다.
 */
export const HISTORY_VARIANTS = Object.freeze({
  GENERAL: Object.freeze({
    kind: 'WORKLOG_HISTORY',
    linked: false,
    stateKey: STATE_KEY,
    monthsKey: 'worklogHistoryRetentionMonths',
    options: RETENTION_MONTH_OPTIONS,
    fallbackMonths: DEFAULT_APPROVAL_SETTINGS.worklogHistoryRetentionMonths,
    actions: { export: 'historyExport', purge: 'historyPurge' },
  }),
  LINKED: Object.freeze({
    kind: 'WORKLOG_HISTORY_LINKED',
    linked: true,
    stateKey: 'approval:retention:worklogHistory:linked',
    monthsKey: 'worklogHistoryLinkedRetentionMonths',
    options: LINKED_HISTORY_MONTH_OPTIONS,
    fallbackMonths: DEFAULT_LINKED_HISTORY_MONTHS,
    actions: { export: 'historyLinkedExport', purge: 'historyLinkedPurge' },
  }),
});
const EXPORT_PAGE = 200;
const PURGE_BATCH = 100;
const PURGE_BUDGET_MS = 20_000;

const fail = (code) => new LogicalError(code, code);

/**
 * 워크로그 이력 보관 정리 — RetentionService 의 흐름 그대로(내보낸 것만 지운다, Q77: 자동 삭제 없음).
 * 이 서비스의 purge 가 worklog_history 의 유일한 삭제 경로다(append-only 의 예외).
 */
export class WorklogHistoryRetentionService {
  constructor({
    repository = worklogHistoryRepository,
    settings = settingsRepository,
    store = kvs,
    audit = recordSettingsAudit,
    issueVisibility = filterVisibleIssues,
    userLoader = loadUsers,
    clock = Date.now,
    sessions = exportSessionRepository,
    variant = HISTORY_VARIANTS.GENERAL,
  } = {}) {
    this.variant = variant;
    this.repository = repository;
    this.settings = settings;
    this.store = store;
    this.audit = audit;
    this.issueVisibility = issueVisibility;
    this.userLoader = userLoader;
    this.clock = clock;
    this.sessions = sessions;
  }

  async months() {
    const value = Number(await this.settings.getValue(SETTINGS_KEYS[this.variant.monthsKey]).catch(() => undefined));
    return this.variant.options.includes(value) ? value : this.variant.fallbackMonths;
  }

  async loadState() {
    const raw = (await this.store.get(this.variant.stateKey)) ?? {};
    return { lastExport: raw.lastExport ?? null };
  }

  async getRetention(request = {}) {
    const [months, state] = await Promise.all([this.months(), this.loadState()]);
    const cutoff = monthsCutoff(months, this.clock());
    const scope = { linked: this.variant.linked };
    const expired = cutoff === null ? { count: 0, oldest: null } : await this.repository.countExpired(cutoff, null, scope);
    let purgeable = 0;
    if (cutoff !== null && state.lastExport?.sessionId && state.lastExport.by === request?.principal?.accountId) {
      try {
        const session = await this.sessions.get(state.lastExport.sessionId, this.variant.kind, request.principal.accountId, this.clock());
        if (session.status === 'CONFIRMED') purgeable = (await this.repository.countExpired(Math.min(session.cutoff, cutoff), session.id, scope)).count;
      } catch (error) { if (error.code !== ErrorCodes.RETENTION_EXPORT_REQUIRED) throw error; }
    }
    return {
      kind: this.variant.kind,
      months,
      monthOptions: [...this.variant.options],
      cutoff,
      expiredCount: expired.count,
      oldestChangedAt: expired.oldest,
      purgeableCount: purgeable,
      purgeableIsUpperBound: true,
      lastExport: state.lastExport,
    };
  }

  /** 첫 호출이 cutoff 를 정하고 이후 호출은 넘겨받는다. 정책 cutoff 보다 미래로 늘릴 수 없다. */
  async clampCutoff(requested) {
    const policyCutoff = monthsCutoff(await this.months(), this.clock());
    if (policyCutoff === null) return null;
    const value = Number(requested);
    return Number.isFinite(value) && value > 0 ? Math.min(value, policyCutoff) : policyCutoff;
  }

  /**
   * 기간 지난 이력을 오름차순 200행씩. 열람 불가 이슈의 행은 **가린 채 포함**한다(Q73) —
   * 빼면 "내보낸 것만 지운다"가 깨지고, 모든 프로젝트를 볼 수 있는 관리자가 없으면 영원히 못 지운다.
   */
  async exportExpired(request) {
    const payload = request?.payload ?? {};
    let cursor = null;
    if (payload.cursor !== undefined && payload.cursor !== null && payload.cursor !== '') {
      cursor = decodeCursor(payload.cursor);
      if (!cursor) throw new LogicalError(ErrorCodes.INVALID_TARGET, ErrorCodes.INVALID_TARGET, { field: 'cursor' });
    }
    const policyCutoff = await this.clampCutoff(payload.cutoff);
    if (policyCutoff === null) {
      if (payload.sessionId) throw fail(ErrorCodes.RETENTION_EXPORT_REQUIRED);
      return {
        sessionId: null, cutoff: null, items: [], users: {}, nextCursor: null,
      };
    }
    if (!(await this.repository.ready())) throw fail(ErrorCodes.STORAGE_NOT_READY);
    const owner = request?.principal?.accountId;
    let session = payload.sessionId
      ? await this.sessions.get(payload.sessionId, this.variant.kind, owner, this.clock())
      : await this.sessions.create({ kind: this.variant.kind, owner, cutoff: policyCutoff, now: this.clock() });
    session = await this.sessions.beginPage(session, cursor);
    const cutoff = session.cutoff;
    const rows = await this.repository.pageExpired(cutoff, cursor, EXPORT_PAGE, { linked: this.variant.linked });
    const { items, users } = await this.present(rows, request);
    const last = rows.at(-1);
    const nextCursor = rows.length === EXPORT_PAGE && last ? encodeCursor(last) : null;
    // 복호화한 원본 커서를 세션과 대조하여 임의로 페이지를 건너뛰지 못하게 한다.
    await this.sessions.finishPage(session, rows.map((row) => ({ id: `${row.worklogId}:${row.seq}`, fingerprint: exportFingerprint(row) })),
      nextCursor ? decodeCursor(nextCursor) : null);
    return {
      sessionId: session.id,
      cutoff,
      items,
      users: userMapOf(users),
      nextCursor,
    };
  }

  /** 파일 행 — 열람 불가 이슈의 행은 가린 채 포함(Q73). 내보내기와 내려받기가 같은 모양을 쓴다. */
  async present(rows, request) {
    const visibility = await this.issueVisibility(rows.map((row) => row.issueId))
      .catch(() => ({ visible: new Set(), issues: new Map() }));
    const viewerId = request?.principal?.accountId ?? null;
    const items = rows.map((row) => {
      const visible = visibility.visible.has(row.issueId);
      const meta = visible ? visibility.issues.get(row.issueId) : null;
      const base = {
        ...historyItemOf(row),
        issue: visible ? {
          visible: true, issueKey: meta?.issueKey ?? null, summary: meta?.title ?? null, projectKey: meta?.projectKey ?? null,
        } : null,
      };
      return maskForViewer(base, { viewerId, issueVisible: visible });
    });
    const users = await this.userLoader(
      items.flatMap((item) => [item.authorAccountId, item.actorAccountId]).filter(Boolean),
      { siteUrl: request?.context?.siteUrl ?? null },
    ).catch(() => new Map());
    return { items, users };
  }

  /**
   * 내려받기만(삭제 없음, R3) — 기간 [from, to) 의 이력, 세션·삭제 허가 없음. 일반 종류는 일반·연결 전부(행마다 workforceLinked),
   * 연결 종류는 연결분만. 모양은 내보내기 페이지와 같다(sessionId·cutoff 없음).
   */
  async download(request) {
    const payload = request?.payload ?? {};
    const range = parseDownloadRange(payload);
    if (!range.ok) throw new LogicalError(ErrorCodes.INVALID_TARGET, ErrorCodes.INVALID_TARGET, { field: range.field });
    let cursor = null;
    if (payload.cursor !== undefined && payload.cursor !== null && payload.cursor !== '') {
      cursor = decodeCursor(payload.cursor);
      if (!cursor) throw new LogicalError(ErrorCodes.INVALID_TARGET, ErrorCodes.INVALID_TARGET, { field: 'cursor' });
    }
    if (!(await this.repository.ready())) return { items: [], users: {}, nextCursor: null };
    const rows = await this.repository.pageExpired(range.to, cursor, EXPORT_PAGE, {
      from: range.from, linked: this.variant.linked ? true : undefined,
    });
    const { items, users } = await this.present(rows, request);
    const last = rows.at(-1);
    return { items, users: userMapOf(users), nextCursor: rows.length === EXPORT_PAGE && last ? encodeCursor(last) : null };
  }

  /** 화면이 파일을 실제로 만든 뒤 부른다. 이때부터 그 cutoff 까지 지울 수 있다. */
  async confirmExport(request) {
    const payload = request?.payload ?? {};
    const session = await this.sessions.confirm(payload.sessionId, this.variant.kind, request?.principal?.accountId, this.clock());
    const cutoff = session.cutoff;
    const lastExport = {
      sessionId: session.id, cutoff, at: this.clock(), count: session.count, by: request?.principal?.accountId ?? null,
    };
    await this.store.set(this.variant.stateKey, { ...(await this.loadState()), lastExport });
    await this.audit({
      actorKey: lastExport.by, area: 'retention', action: this.variant.actions.export, detail: { cutoff, count: lastExport.count },
    });
    return this.getRetention(request);
  }

  /**
   * 내보내기 확정 범위 안만 지운다. 이력이 0 이 된 뒤에만 미러를 정리한다(이력이 남은 워크로그의 미러는 남긴다).
   * 확정 뒤 보관 기간을 늘렸으면 지금 정책 cutoff 까지만 — 확정 기록이 정책보다 많이 지우게 두지 않는다.
   */
  async purgeExported(request) {
    const state = await this.loadState();
    const policyCutoff = monthsCutoff(await this.months(), this.clock());
    if (!state.lastExport?.sessionId || policyCutoff === null) throw fail(ErrorCodes.RETENTION_EXPORT_REQUIRED);
    const session = await this.sessions.get(state.lastExport.sessionId, this.variant.kind, request?.principal?.accountId, this.clock());
    if (!(await this.repository.ready())) throw fail(ErrorCodes.STORAGE_NOT_READY);
    const cutoff = Math.min(session.cutoff, policyCutoff);

    const startedAt = this.clock();
    const purgeToken = await this.sessions.acquirePurge(session, startedAt);
    let deleted = 0;
    let mirrorsDeleted = 0;
    let historyDone = false;
    try {
    for (let batch = 0; batch < 10; batch += 1) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await this.sessions.pending(session, PURGE_BATCH);
      if (!entries.length) { historyDone = true; break; }
      // eslint-disable-next-line no-await-in-loop
      // 종류 술어를 다시 건다 — 옛 일반 세션이 연결분을 담고 있어도 그 행은 일반 기간으로 지워지지 않는다(SKIPPED).
      const current = await this.repository.findExpiredByIds(cutoff, entries.map((entry) => entry.id), { linked: this.variant.linked });
      const eligible = new Set(current.filter((row) => entries.some((entry) => entry.id === `${row.worklogId}:${row.seq}`
        && entry.fingerprint === exportFingerprint(row))).map((row) => `${row.worklogId}:${row.seq}`));
      // eslint-disable-next-line no-await-in-loop
      const count = await this.repository.purgeHistoryBatch(cutoff, PURGE_BATCH, [...eligible], current);
      deleted += count;
      // eslint-disable-next-line no-await-in-loop
      const retained = await this.repository.findExpiredByIds(null, entries.map((entry) => entry.id));
      const retainedIds = new Set(retained.map((row) => `${row.worklogId}:${row.seq}`));
      for (const entry of entries) {
        // eslint-disable-next-line no-await-in-loop
        await this.sessions.setEntryState(session, entry.id, !retainedIds.has(entry.id) ? 'DELETED' : 'SKIPPED', entry.state);
      }
      if (this.clock() - startedAt > PURGE_BUDGET_MS) break;
    }
    for (let batch = 0; historyDone && batch < 10 && this.clock() - startedAt <= PURGE_BUDGET_MS; batch += 1) {
      // eslint-disable-next-line no-await-in-loop
      const count = await this.repository.purgeMirrorBatch(cutoff, PURGE_BATCH);
      mirrorsDeleted += count;
      if (count < PURGE_BATCH) break;
    }
    } finally {
      await this.sessions.releasePurge(session, purgeToken);
    }
    const remaining = await this.sessions.remaining(session);
    await this.audit({
      actorKey: request?.principal?.accountId, area: 'retention', action: this.variant.actions.purge, detail: { cutoff, deleted, remaining },
    });
    return { deleted, mirrorsDeleted, remaining };
  }
}

export const worklogHistoryRetentionService = new WorklogHistoryRetentionService();
export const linkedWorklogHistoryRetentionService = new WorklogHistoryRetentionService({ variant: HISTORY_VARIANTS.LINKED });

export default worklogHistoryRetentionService;
