import { asApp, route } from '../../api/jira/RequestJira';
import {
  ForeignAction, ForeignScope, ForeignState, LockMethod, VisibilityScope, VisState,
} from '../../domain/worklogControl/rules';
import {
  appOpOf, APP_OP_PROPERTY, Origin, originOf, PREAPPROVAL_PROPERTY, PROVEN_ORIGINS, propertyValue,
} from '../../domain/worklogControl/origin';
import { INTENT_MATCH_WINDOW_MS, matchWorkforceIntent } from '../../domain/worklogControl/intentMatch';
import { detectedFingerprint, ForeignAct, foreignDecision } from '../../domain/worklogControl/foreign';
import { isForeignRestriction } from '../../domain/worklogControl/visibility';
import { HistorySource } from '../../domain/timesheet/worklogHistory';
import { gatesForEnvironment, missingGates } from '../../domain/worklogControl/gates';
import channelState from '../channel/ChannelState';
import worklogControlRepository from './WorklogControlRepository';
import worklogControlGateway, { ControlReason } from './WorklogControlGateway';
import worklogControlState from './WorklogControlState';
import worklogControlWorker, { DELETE_GRACE_SECONDS, RECHECK_SECONDS } from './WorklogControlWorker';
import controlLinkJudge from './ControlLinkJudge';
import liveOf from './live';
import { kvs } from '@forge/kvs';
import linkedIssueSettingSource, { LINKED_SETTING_MARKER } from '../workforce/LinkedIssueSettingSource';
import worklogApprovalRepository from '../worklogApproval/WorklogApprovalRepository';
import worklogControlLogRepository from './WorklogControlLogRepository';
import settingsRepository from '../settings/SettingsRepository';
import { WorklogPolicyResolver } from '../worklogPolicy/WorklogPolicyResolver';
import { linkedViolationOf } from '../../domain/linkedIssue/violation';
import { deterministicEventId } from '../../domain/approval/eventId';
import worklogRequests from '../worklogCertification/WorklogRequestService';
import { RULE_VIOLATION_REASON } from '../../domain/worklogControl/ruleViolation';
import workforceRuleCheck from './WorkforceRuleCheck';

/**
 * 사후 규칙 판정 대상 출처 — 워크포스 경유 쓰기(코덱스 P1-1·P1-2). 채널 판은 write.judge 가 저장 전에 현재 DB 로 판정하지만,
 * judge 와 Jira 쓰기 사이에 마감·승인이 끼면 다를 수 있어 이벤트에서 한 번 더 본다(같은 도메인 함수).
 */
export const RULE_CHECK_ORIGINS = Object.freeze([Origin.WORKFORCE, Origin.WF_CHANGED]);
/** 통제 일지 동작 — 워크포스 입력 규칙 위반 표시(VARCHAR(24) 안). */
export const RULE_VIOLATION_ACTION = 'RULE_VIOLATION_FLAGGED';

const NUMERIC_ID = /^\d{1,20}$/;

/** 트리거 경로의 이슈 → 프로젝트(사용자 컨텍스트 없음 — asApp, 사유 trigger). 프로젝트 id 외에는 읽지 않는다. */
export const projectOfAsApp = async (issueId) => {
  const res = await asApp(
    route`/rest/api/3/issue/bulkfetch`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issueIdsOrKeys: [String(issueId)], fields: ['project'] }) },
    { reason: ControlReason.TRIGGER, allowStatuses: [400, 403, 404] },
  );
  const projectId = res.body?.issues?.[0]?.fields?.project?.id;
  return res.status === 200 && projectId != null ? String(projectId) : null;
};

/**
 * 워크로그 이벤트의 통제 분기(설계 §4.4) — **통제 적용(visibility)과 외부 입력 처리를 따로 켠다.**
 * 둘 다 꺼져 있으면 SQL 0·Jira 0 으로 돌아간다(KVS 만 읽는다).
 * ⚠ throw 하지 않는다(트리거 규칙) — 호출부(onWorklogChanged)도 감싸지만 여기서 먼저 삼킨다.
 */
export class WorklogControlDetector {
  constructor({
    repository = worklogControlRepository,
    gateway = worklogControlGateway,
    state = worklogControlState,
    worker = worklogControlWorker,
    links = controlLinkJudge,
    channel = channelState,
    projectLoader = projectOfAsApp,
    clock = Date.now,
    logger = console,
    store = () => kvs,
    settingSource = () => linkedIssueSettingSource,
    approvalEntries = () => worklogApprovalRepository,
    journal = () => worklogControlLogRepository,
    policyLoader = () => settingsRepository.getPolicy(),
    requests = null,
    // 워크포스 출처 입력의 사후 규칙 판정(코덱스 P1-1·P1-2). null 이면 판정하지 않는다(단위 테스트 기본).
    ruleCheck = null,
    // 이벤트에서 검증한 값만 재사용해야 계층 계산 중 asUser 조회가 섞이지 않는다.
    // observeLinked 는 wants 에서 연동 모드(isLinked)를 확인한 뒤에만 돈다 — 연동 판정을 명시로 넘긴다(미주입은 연동 아님).
    hierarchy = (setting) => new WorklogPolicyResolver({ settingSource: () => ({ read: async () => setting }), enabledLoader: async () => true }),
  } = {}) {
    Object.assign(this, {
      repository, gateway, state, worker, links, channel, projectLoader, clock, logger,
      store, settingSource, approvalEntries, journal, policyLoader, hierarchy,
      requests, ruleCheck,
    });
  }

  /** 이 이벤트에 할 일이 있는가 — KVS 만. 없으면 null. */
  async wants(parsed) {
    try {
      const settings = await this.state.settings();
      const scopeOn = settings.visibilityScope !== VisibilityScope.OFF;
      const appWrites = scopeOn || settings.lockMethod === LockMethod.PERMISSION_SCHEME;
      const foreignOn = settings.foreignAction !== ForeignAction.OFF;
      const observeLinked = ['created', 'updated'].includes(parsed.kind)
        && await this.store().get(LINKED_SETTING_MARKER).catch(() => false) === true
        // 연동 모드 단일 판정(스위치 ∧ PAIRED, product-polish B.3) — 정책 원문 workforceLinkEnabled 를 직접 읽지 않는다.
        && await this.channel.isLinked().catch(() => false) === true;
      const want = parsed.kind === 'created' ? Boolean(this.requests)||scopeOn||foreignOn
        : parsed.kind === 'updated' ? Boolean(this.requests)||appWrites
          : appWrites || foreignOn;
      if (!want && !observeLinked) return null;
      return { settings, state: want ? await this.state.read() : null, observeLinked, controlWanted: want };
    } catch (error) {
      this.logger.error('[WORKLOG_CONTROL] wants failed', String(error?.message || error));
      return null;
    }
  }

  /**
   * 이력 행위자 귀속(설계 §4.3) — op 프로퍼티가 통제 행의 마지막 우리 op 와 **같을 때만**. 다르거나 없으면 null(추정하지 않는다).
   *   last_app_op_id 일치 → APP(호출 사용자) / vis_op_id 일치 → CONTROL(사람 아님)
   * 삭제는 우리 DELETE 가 성공 응답을 받은 행(last_app_op=DELETE ∧ OK)만 APP, 다른 경로 입력 삭제(DELETING·DELETED·UNKNOWN)는 CONTROL.
   */
  async attribution(parsed, current, ctx) {
    try {
      if (!ctx || ctx.controlWanted === false || !(await this.repository.controlReady())) return null;
      if (parsed.kind === 'deleted') {
        const row = await this.repository.findOne(parsed.worklogId);
        if (!row) return null;
        if (row.lastAppOp === 'DELETE' && row.lastAppResult === 'OK') return { source: HistorySource.APP, actorId: row.lastAppActor };
        if ([ForeignState.DELETING, ForeignState.DELETED, ForeignState.UNKNOWN].includes(row.foreignState)) return { source: HistorySource.CONTROL, actorId: null };
        return null;
      }
      const op = appOpOf(current?.props, APP_OP_PROPERTY);
      if (!op) return null;
      const row = await this.repository.findOne(parsed.worklogId);
      if (!row) return null;
      if (row.lastAppOpId === op) return { source: HistorySource.APP, actorId: row.lastAppActor };
      if (row.visOpId === op) return { source: HistorySource.CONTROL, actorId: null };
      return null;
    } catch (error) {
      this.logger.error('[WORKLOG_CONTROL] attribution failed', String(error?.message || error));
      return null;
    }
  }

  async handle(parsed, { prefetched, ctx } = {}) {
    try {
      if (!ctx || !parsed?.worklogId || !NUMERIC_ID.test(String(parsed.worklogId))) return { skipped: 'NO_CONTEXT' };
      let observed = null;
      if (ctx.observeLinked) {
        try { observed = await this.observeLinked(parsed, prefetched); }
        catch (error) { this.logger.error('[WORKLOG_CONTROL] linked observation failed', String(error?.code ?? 'OBSERVATION_FAILED')); }
      }
      if (ctx.controlWanted === false) return observed ?? { skipped: 'OBSERVATION_ONLY' };
      if (parsed.kind === 'deleted') return await this.handleDeleted(parsed, ctx);
      if (!['created','updated'].includes(parsed.kind)) return { skipped: 'NOT_CREATED' };
      const result=await this.handleCreated(parsed, prefetched, ctx);
      // 사후 규칙 판정을 자동 접수보다 먼저 — 위반이면 자동 접수가 소명 필요로 멈춘다(WorklogRequestService).
      const rule = RULE_CHECK_ORIGINS.includes(result.origin) ? await this.checkWorkforceRules(parsed, prefetched, observed) : null;
      if (rule?.code) result.ruleViolation = rule.code;
      if(this.requests&&PROVEN_ORIGINS.includes(result.origin)) {
        const live=await this.currentOf(parsed.worklogId,prefetched);
        const response=await this.gateway.getWorklog(live.issueId,live.worklogId,ControlReason.TRIGGER);
        if(response.ok)await this.requests.requestAutomatically({raw:{...response.body,issueId:live.issueId},projectId:await this.projectLoader(live.issueId)});
      }
      return result;
    } catch (error) {
      this.logger.error('[WORKLOG_CONTROL][trigger] failed', String(error?.code ?? error?.message ?? error));
      return { failed: true };
    }
  }

  async observeLinked(parsed, prefetched) {
    const live = await this.currentOf(parsed.worklogId, prefetched);
    if (!live) return { skipped: 'UNREADABLE' };
    const projectId = await this.projectLoader(live.issueId);
    if (!projectId) return { skipped: 'NO_PROJECT' };
    const target = { issueId: live.issueId, projectId };
    const link = await this.links.linkOf({ ...target, refresh: 'APP' });
    // 연결 판정(linkOf refresh 'APP')이 방금 link.resolve 로 설정까지 받아 두었다 — 캐시를 읽는다(채널 추가 0).
    const setting = await this.settingSource().readCached(target);
    if (setting.settingUnresolved || (!setting.active && !link.linked)) return { skipped: 'NO_SETTING' };
    const policy = await this.policyLoader();
    const effective = await this.hierarchy(setting).resolveOne(target);
    const body = { ...(setting.active ? setting.body : {}), approvalMode: effective.values?.approvalMode };
    if (body.pa == null && (await this.approvalEntries().requiredForProjects([projectId])).get(String(projectId))) body.approvalMode = 'PREAPPROVAL';
    body.pa='NOT_REQUIRED';
    const required = false;
    const approvedEntry = required ? await this.approvalEntries().appliedEntryFor(live.worklogId, live.issueId, live.authorId) : null;
    const reason = linkedViolationOf({ worklog: live, setting: body, timeZone: policy.timesheetTimezone ?? 'Asia/Seoul', approvedEntry });
    const reasons = reason ? [reason] : [];
    // 연동 이슈의 정상 입력 창구는 승인 앱 이슈 화면과 워크포스 앱 내부 화면 둘이다(workforce-input-reopen). 워크포스 작성은
    // 저장 전 채널 write.judge 로 승인 앱이 판정했고(출처 WORKFORCE, PROVEN), 여기서는 팀장 작성 기간 위반만 다시 본다.
    const journal = this.journal();
    if (reasons.length && await journal.ready()) {
      const now = this.clock();
      await journal.append(reasons.map((reasonCode) => ({
        eventId: deterministicEventId({ requestId: `wctl:${live.worklogId}`, eventType: reasonCode,
          discriminator: `${parsed.kind}:${live.updated ?? live.created}:${live.started}` }),
        worklogId: live.worklogId, issueId: live.issueId, projectId, authorId: live.authorId,
        actorId: null, action: 'LINKED_OBSERVED', reasonCode, wfLinked: true, occurredAt: now,
      })));
    }
    return { linkedViolation: reason };
  }

  /**
   * 워크포스 출처 작성·수정을 승인 앱 DB 기준으로 다시 판정(코덱스 P1-1·P1-2). 위반이면 통제 행에 "규칙 위반 입력"
   * (foreign_state FLAGGED + foreign_reason RULE_VIOLATION — 기존 칼럼, 새 칼럼 없음)을 남기고 통제 일지에 사유 코드를 쓴다.
   * 결과: 이슈 Work log 탭·이력·팀장 인증 화면 경고, 자동 접수 중지(소명 필요), 워크포스 집계 제외(인증 문서 출처 INVALID — 승인 전까지).
   * 이미 표시된 행은 풀지 않는다(해제는 소명 승인 또는 관리자 확인). 재료를 못 모으면 표시하지 않는다(오탐 금지). **던지지 않는다.**
   * 다음 수정의 "원래 시각"을 위해 통제 행 started_ms 를 현재 값으로 맞춘다(같은 CAS).
   */
  async checkWorkforceRules(parsed, prefetched, observed) {
    if (!this.ruleCheck || !['created', 'updated'].includes(parsed.kind)) return null;
    try {
      const live = await this.currentOf(parsed.worklogId, prefetched);
      if (!live) return null;
      const row = await this.repository.findOne(live.worklogId);
      if (!row || !RULE_CHECK_ORIGINS.includes(row.origin) || row.issueId !== live.issueId || row.authorId !== live.authorId) return null;
      // 승인 앱 화면이 판정·실행한 쓰기(op 프로퍼티가 마지막 우리 op) — 이미 현재 DB 로 판정했다.
      const op = appOpOf(live.props, APP_OP_PROPERTY);
      if (op && op === row.lastAppOpId) return null;
      const now = this.clock();
      const changedAt = Number.isFinite(live.updated) ? live.updated : Number.isFinite(live.created) ? live.created : now;
      const editing = parsed.kind === 'updated' && Number.isFinite(row.startedMs);
      const flagged = Boolean(row.foreignState) && row.foreignState !== ForeignState.CLEARED;
      let verdict = null;
      if (!flagged) {
        const projectId = await this.projectLoader(live.issueId);
        if (!projectId) return null;
        verdict = await this.ruleCheck.judge({
          live,
          projectId,
          op: editing ? 'edit' : 'create',
          previousStarted: editing ? row.startedMs : null,
          changedAt,
          linkedViolation: observed?.linkedViolation ?? null,
        });
      }
      const patch = {};
      if (row.startedMs !== live.started) patch.startedMs = live.started;
      if (verdict) Object.assign(patch, { foreignState: ForeignState.FLAGGED, foreignReason: RULE_VIOLATION_REASON, detectedAt: now, nextAttemptAt: null });
      if (Object.keys(patch).length) await this.repository.change(row, patch, now);
      if (verdict) {
        const journal = this.journal();
        if (await journal.ready()) {
          await journal.append([{
            eventId: deterministicEventId({ requestId: `wctl:${live.worklogId}`, eventType: RULE_VIOLATION_ACTION,
              discriminator: `${parsed.kind}:${live.updated ?? live.created}:${live.started}:${verdict.code}` }),
            worklogId: live.worklogId, issueId: live.issueId, projectId: null, authorId: live.authorId,
            actorId: null, action: RULE_VIOLATION_ACTION, reasonCode: verdict.code, wfLinked: true, occurredAt: now,
          }]);
        }
      }
      return verdict;
    } catch (error) {
      this.logger.error('[WORKLOG_CONTROL] workforce rule check failed', String(error?.code ?? error?.message ?? 'RULE_CHECK_FAILED'));
      return null;
    }
  }

  async handleDeleted(parsed, ctx) {
    if (!(await this.repository.controlReady())) return { skipped: 'NOT_READY' };
    const row = await this.repository.findOne(parsed.worklogId);
    if (!row || row.visState === VisState.GONE) return { skipped: 'NO_ROW' };
    const foreignState = [ForeignState.DELETING, ForeignState.UNKNOWN].includes(row.foreignState) ? ForeignState.DELETED : row.foreignState;
    await this.repository.change(row, { visState: VisState.GONE, foreignState, ...(foreignState === ForeignState.DELETED ? { actedAt: this.clock() } : {}) }, this.clock());
    return { gone: true };
  }

  async currentOf(worklogId, prefetched) {
    const found = prefetched?.get?.(String(worklogId));
    if (found && Object.hasOwn(found, 'props')) return liveOf(found);
    const raws = await this.gateway.listWorklogs([worklogId], ControlReason.TRIGGER);
    const raw = raws.get(String(worklogId));
    return raw ? liveOf(raw) : null;
  }

  /** 출처 판정 + op 결속(원자). 승인 앱 op 는 intent CAS, 워크포스 op 는 intent INSERT(PK) — 재사용은 REUSED. */
  async originFor(live, existing) {
    if (existing && PROVEN_ORIGINS.includes(existing.origin)) return { origin: existing.origin };
    const props = live.props ?? [];
    const appOp = appOpOf(props);
    if (appOp) {
      const intent = (await this.repository.findIntents([appOp])).get(appOp) ?? null;
      let bound = false;
      if (intent && intent.source === 'APP') bound = !(await this.repository.bindIntent(appOp, live.worklogId, this.clock()));
      return { origin: originOf({ props, appIntent: intent, bound, current: live }) };
    }
    // 워크포스 출처 — write.commit 이 결속한 intent, 없으면 지문(작성자·이슈·started·seconds, 15분 창)으로 찾아 결속한다(§4.2).
    let wfIntent = await this.repository.findWorkforceIntentFor(live.worklogId);
    if (!wfIntent && live.authorId) {
      const reference = Number.isFinite(live.created) ? live.created : this.clock();
      const candidates = await this.repository.listOpenWorkforceIntents(live.authorId, reference - INTENT_MATCH_WINDOW_MS);
      const matched = matchWorkforceIntent(candidates, live, this.clock());
      if (matched && (await this.repository.bindIntent(matched.opId, live.worklogId, this.clock()))) wfIntent = { ...matched, worklogId: live.worklogId };
    }
    if (wfIntent) {
      const bound = Boolean(wfIntent.worklogId) && wfIntent.worklogId !== live.worklogId;
      return { origin: originOf({ props, wfIntent, bound, current: live }) };
    }
    const preapproval = propertyValue(props, PREAPPROVAL_PROPERTY)?.operationId;
    const pendingApplyMatch = preapproval
      ? await this.repository.pendingApplyMatches(preapproval, live.issueId, live.authorId).catch(() => false)
      : false;
    return { origin: Origin.NONE, pendingApplyMatch };
  }

  async deleteReadiness(settings) {
    if (settings.foreignAction !== ForeignAction.DELETE) return { gatesOk: false, workforceOriginCapable: false };
    // Q130 — 알림을 못 남기는 동안은 저장 거부와 별개로 여기서도 삭제 후보를 만들지 않는다(FLAG 로 낮춘다).
    if (this.state.notificationsReady?.() !== true) return { gatesOk: false, workforceOriginCapable: false };
    const recorded = await this.state.gates().catch(() => ({}));
    // 운영 환경이면 실측 근거 없는 수동 PASS 를 인정하지 않는다(코덱스 P1-5) — 저장 거부와 같은 규칙.
    const gates = gatesForEnvironment(recorded, { production: this.state.production?.() === true });
    const gatesOk = missingGates('DELETE', gates).length === 0;
    // 워크포스가 저장 전 write.judge 로 묻는다 = 연결(페어링)돼 있으면 정상 워크포스 기록은 intent 로 출처가 증명된다(S1).
    const workforceOriginCapable = await this.channel.isLinked().catch(() => false);
    return { gatesOk, workforceOriginCapable };
  }

  async handleCreated(parsed, prefetched, ctx) {
    const { settings, state } = ctx;
    const now = this.clock();
    if (!(await this.repository.controlReady())) return { skipped: 'NOT_READY' };
    const scopeOf = (link) => ({
      needControl: settings.visibilityScope === VisibilityScope.LINKED_ALL && link.linked,
      needForeign: settings.foreignAction !== ForeignAction.OFF && (settings.foreignScope === ForeignScope.ALL || link.linked),
    });
    // 트리거 시점에 그 이슈의 워크포스 신호를 읽어 반영한다(asApp, 이미 신선하면 Jira 0) — 연동 이슈를 관리자 지정 없이 알게 된다.
    const linkFor = (issueId) => this.links.linkOf({ issueId, projectLoader: () => this.projectLoader(issueId), refresh: 'APP' });
    // 이벤트에 이슈 id 가 있으면 연동 범위를 먼저 본다 — 범위 밖(대부분)이면 워크로그를 읽지 않는다.
    let linkNow = parsed.issueId ? await linkFor(String(parsed.issueId)) : null;
    if (linkNow) {
      const early = scopeOf(linkNow);
      if(!this.requests&&!early.needControl&&!early.needForeign)return {skipped:'OUT_OF_SCOPE'};
    }
    const live = await this.currentOf(parsed.worklogId, prefetched);
    if (!live) return { skipped: 'UNREADABLE' };
    if (!linkNow || String(parsed.issueId) !== live.issueId) linkNow = await linkFor(live.issueId);
    const { needControl, needForeign } = scopeOf(linkNow);
    if(!this.requests&&!needControl&&!needForeign)return {skipped:'OUT_OF_SCOPE'};
    if (Number.isFinite(state.since) && Number.isFinite(live.created) && live.created < state.since) return { skipped: 'BEFORE_SINCE' };

    const existing = await this.repository.findOne(live.worklogId);
    const { origin, pendingApplyMatch = false } = await this.originFor(live, existing);
    const preRestricted = isForeignRestriction(live.visibility, settings.target);
    const patch = {};
    let wake = null;

    // [통제 적용] 출처와 무관 — 외부 생성분도 제한한다. 원래 남의 범위로 제한된 기록은 워커가 SKIPPED_RESTRICTED 로 남긴다.
    if (needControl && PROVEN_ORIGINS.includes(origin) && (!existing || [VisState.NONE, VisState.RELEASED, VisState.RELEASED_FOREIGN].includes(existing.visState))) {
      Object.assign(patch, {
        visState: VisState.PENDING, visReason: 'LINKED', linked: true, generation: state.generation, nextAttemptAt: null,
      });
      wake = { op: 'restrict', delaySeconds: 0 };
    }

    // [외부 처리]
    if (needForeign && !PROVEN_ORIGINS.includes(origin) && !existing?.foreignState) {
      if (origin === Origin.NONE && !pendingApplyMatch && Number.isFinite(live.created) && now - live.created < RECHECK_SECONDS * 1000) {
        // 우리 화면 작성의 결속이 아직 안 끝났을 수 있다 — 한 번 더 본다.
        Object.assign(patch, { foreignState: ForeignState.RECHECK, detectedAt: now, nextAttemptAt: live.created + RECHECK_SECONDS * 1000 });
        wake = { op: 'foreign-recheck', delaySeconds: RECHECK_SECONDS };
      } else {
        const decision = await this.decideForeign({
          live, origin, linked: linkNow.linked, settings, state, pendingApplyMatch, preRestricted,
        });
        Object.assign(patch, decision.patch);
        if (decision.wake) wake = decision.wake;
      }
    }
    if (!Object.keys(patch).length&&(!this.requests||!PROVEN_ORIGINS.includes(origin))) return { skipped: 'NOTHING', origin };
    await this.write(existing, live, origin, patch, state, now);
    if(PROVEN_ORIGINS.includes(origin))await this.state.ensurePending?.(now);
    if (wake) await this.worker.wake({ ...wake, generation: state.generation });
    return { origin, ...patch };
  }

  async decideForeign({
    live, origin, linked, settings, state, pendingApplyMatch, preRestricted,
  }) {
    const readiness = await this.deleteReadiness(settings);
    const decision = foreignDecision({
      action: settings.foreignAction,
      scope: settings.foreignScope,
      linked,
      origin,
      created: live.created,
      controlSince: state.since,
      deleteSince: state.deleteSince,
      authorAccountType: live.authorAccountType,
      pendingApplyMatch,
      storageOk: true,
      workforceOriginCapable: readiness.workforceOriginCapable,
      gatesOk: readiness.gatesOk,
      preRestricted,
    });
    const now = this.clock();
    if (decision.act === ForeignAct.FLAG) {
      return { patch: { foreignState: ForeignState.FLAGGED, foreignReason: decision.reason, detectedAt: now, nextAttemptAt: null } };
    }
    if (decision.act === ForeignAct.DELETE_PENDING) {
      return {
        patch: {
          foreignState: ForeignState.DELETE_PENDING,
          foreignReason: decision.reason,
          foreignGen: state.generation,
          detectedFp: detectedFingerprint(live),
          detectedAt: now,
          nextAttemptAt: now + DELETE_GRACE_SECONDS * 1000,
        },
        wake: { op: 'foreign-delete', delaySeconds: DELETE_GRACE_SECONDS },
      };
    }
    return { patch: {} };
  }

  async write(existing, live, origin, patch, state, now) {
    if (!existing) {
      const inserted = await this.repository.insertIgnore({
        worklogId: live.worklogId,
        issueId: live.issueId,
        authorId: live.authorId,
        startedMs: live.started,
        origin,
        generation: state.generation,
        visState: VisState.NONE,
        jiraCreated: live.created,
        ...patch,
      }, now);
      if (inserted) return true;
      existing = await this.repository.findOne(live.worklogId);
      if (!existing) return false;
    }
    return this.repository.change(existing, { ...patch, origin: PROVEN_ORIGINS.includes(existing.origin) ? existing.origin : origin }, now);
  }

  /** 워커가 부른다 — RECHECK 행을 지금 값으로 다시 판정. */
  async recheck(row, ctx) {
    const live = await this.currentOf(row.worklogId, null);
    if (!live) return this.repository.change(row, { foreignState: null, visState: VisState.GONE }, this.clock(), "AND foreign_state = 'RECHECK'");
    const { origin, pendingApplyMatch = false } = await this.originFor(live, row);
    if (PROVEN_ORIGINS.includes(origin) || pendingApplyMatch) {
      return this.repository.change(row, { foreignState: null, foreignReason: null, origin, nextAttemptAt: null }, this.clock(), "AND foreign_state = 'RECHECK'");
    }
    const link = await this.links.linkOf({ issueId: row.issueId, projectLoader: () => this.projectLoader(row.issueId) });
    const decision = await this.decideForeign({
      live, origin, linked: link.linked, settings: ctx.settings, state: ctx.state, pendingApplyMatch, preRestricted: isForeignRestriction(live.visibility, ctx.settings.target),
    });
    const patch = Object.keys(decision.patch).length ? decision.patch : { foreignState: null, nextAttemptAt: null };
    const ok = await this.repository.change(row, { ...patch, origin }, this.clock(), "AND foreign_state = 'RECHECK'");
    if (ok && decision.wake) await this.worker.wake({ ...decision.wake, generation: ctx.state.generation });
    return ok ? (patch.foreignState ?? 'CLEARED') : 'CONTENDED';
  }
}

export const worklogControlDetector = new WorklogControlDetector({
  requests: { requestAutomatically: (...args) => worklogRequests.requestAutomatically(...args) },
  ruleCheck: workforceRuleCheck,
});

export default worklogControlDetector;
