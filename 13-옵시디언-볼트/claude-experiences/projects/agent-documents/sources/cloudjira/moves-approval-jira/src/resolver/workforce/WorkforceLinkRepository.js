import { createHash } from 'crypto';
import { executeQuery, inClause } from '../../rdb/query/CommonQuery';
import { fromSqlTimestamp, toSqlTimestamp as ts } from '../../rdb/query/SqlTime';
import { isTableReady } from '../../rdb/schema/TableReadiness';

export const INBOUND = 'workforce_inbound';
export const LOG = 'workforce_link_log';

/**
 * 채널 응답 캐시의 typ(workforce-channel-rest §4.3). property 판의 'rms.*' 행은 읽지 않는다.
 *   org      entity accountId      — org.get 본문(rms.org 와 같은 모양)
 *   link     entity I:{issueId}    — link.resolve 의 연결 신호. 본문은 통제 판정(controlLinkOf)이 읽는 모양
 *                                    {rev, values:{}, locks:{}, ctl?('NONE' = 해제), projectId, issueId, iat, exp, linked, released, wfProjectId}
 *            entity P:{projectId}  — 연결 이슈를 한 번이라도 본 프로젝트(이력 수집 범위용). ctl 칸이 없어 프로젝트 전체 연동으로 읽히지 않는다
 *   linkset  entity I:{issueId}    — link.resolve 의 팀장 설정(rms.issue 와 같은 모양 + projectId·issueId·iat·released)
 *   kb       entity P:{projectId}  — kb.get 본문(rms.kb 와 같은 모양 + projectId)
 */
export const InboundTyp = Object.freeze({
  ORG: 'org', LINK: 'link', SETTING: 'linkset', KB: 'kb',
});

const valueOf = (row, snake, camel = snake) => row?.[snake] ?? row?.[camel];
const num = (v) => (v === null || v === undefined ? null : Number(v));

const parseBody = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const inboundFromRow = (row) => ({
  typ: String(valueOf(row, 'typ')),
  entityId: String(valueOf(row, 'entity_id', 'entityId')),
  status: String(valueOf(row, 'status') ?? 'NONE'),
  body: parseBody(valueOf(row, 'body_json', 'bodyJson')),
  srcRev: num(valueOf(row, 'src_rev', 'srcRev')),
  kid: valueOf(row, 'kid') ?? null,
  issuedAt: fromSqlTimestamp(valueOf(row, 'issued_at', 'issuedAt')),
  lastResult: valueOf(row, 'last_result', 'lastResult') ?? null,
  failCount: Number(valueOf(row, 'fail_count', 'failCount') ?? 0),
  checkedAt: fromSqlTimestamp(valueOf(row, 'checked_at', 'checkedAt')),
  verifiedAt: fromSqlTimestamp(valueOf(row, 'verified_at', 'verifiedAt')),
  rev: Number(valueOf(row, 'rev') ?? 0),
});

/** 결정적 로그 id(불변식 6 과 같은 정신) — 같은 실패가 반복돼도 한 행. */
export const linkLogId = ({
  direction, typ, entityId, code, sig = '',
}) => createHash('sha256')
  .update(`${direction}|${typ}|${entityId}|${code}|${String(sig ?? '').slice(0, 16)}`, 'utf8')
  .digest('hex');

const INBOUND_COLUMNS = 'typ, entity_id, status, body_json, src_rev, kid, issued_at, last_result, fail_count, checked_at, verified_at, rev';

/**
 * 워크포스 연동 테이블 3개 SQL — 채널 응답 캐시(workforce_inbound)·실패 로그(workforce_link_log)·옛 아웃박스(workforce_publish, 정리 작업 전용).
 * CAS UPDATE 는 전부 `rev = rev + 1`(불변식 4). 시각은 SqlTime 경계로만 바인딩한다. 새 테이블·칼럼 없음(SQL 마이그레이션 없음, §5).
 */
export class WorkforceLinkRepository {
  constructor({ query = executeQuery, tableReady = isTableReady } = {}) {
    this.query = query;
    this.tableReady = tableReady;
  }

  async ready() {
    return (await Promise.all([INBOUND, LOG].map((name) => this.tableReady(name)))).every(Boolean);
  }

  // ── 채널 응답 캐시 ─────────────────────────────────────────────────────

  async findInbound(typ, entityId) {
    const rows = await this.findInboundMany(typ, [entityId]);
    return rows.get(String(entityId)) ?? null;
  }

  /**
   * 관리자 팀 탭 — org 캐시 키셋 페이지. PK(typ, entity_id) 접두라 정렬·범위가 인덱스로 끝난다.
   */
  async pageOrgRows({ after = '', limit = 200 } = {}) {
    const size = Math.max(1, Math.min(Number(limit) || 200, 500));
    const result = await this.query(`
      SELECT ${INBOUND_COLUMNS}
        FROM ${INBOUND}
       WHERE typ = ? AND entity_id > ?
       ORDER BY entity_id
       LIMIT ${size}
    `, [InboundTyp.ORG, String(after ?? '')]);
    return (result.rows ?? []).map(inboundFromRow);
  }

  /** typ 가 배열이면 키는 `${typ}|${entityId}`. 빈 입력은 SQL 없이 빈 Map(fail-open 아님 — 결과 없음). */
  async findInboundMany(typ, entityIds) {
    const ids = [...new Set((entityIds ?? []).filter(Boolean).map(String))];
    const types = [...new Set((Array.isArray(typ) ? typ : [typ]).filter(Boolean).map(String))];
    if (!ids.length || !types.length) return new Map();
    const result = await this.query(`
      SELECT ${INBOUND_COLUMNS}
        FROM ${INBOUND}
       WHERE typ ${Array.isArray(typ) ? `IN ${inClause(types.length)}` : '= ?'} AND entity_id IN ${inClause(ids.length)}
    `, [...types, ...ids]);
    return new Map((result.rows ?? []).map(inboundFromRow).map((row) => [Array.isArray(typ) ? `${row.typ}|${row.entityId}` : row.entityId, row]));
  }

  /** @returns {Promise<boolean>} 새 행을 넣었으면 true(이미 있으면 false → 호출부가 CAS 로) */
  async insertInbound(row, now) {
    const result = await this.query(`
      INSERT IGNORE INTO ${INBOUND}
        (${INBOUND_COLUMNS})
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      String(row.typ), String(row.entityId), row.status, row.body ? JSON.stringify(row.body) : null,
      row.srcRev ?? null, row.kid ?? null, ts(row.issuedAt ?? null), String(row.lastResult ?? 'OK').slice(0, 24),
      row.failCount ?? 0, ts(now), ts(row.verifiedAt ?? null),
    ]);
    return result.rowsAffected === 1;
  }

  /** rev CAS — 다른 호출이 방금 갱신했으면 false. */
  async updateInbound(row, expectedRev, now) {
    const result = await this.query(`
      UPDATE ${INBOUND}
         SET status = ?, body_json = ?, src_rev = ?, kid = ?, issued_at = ?, last_result = ?, fail_count = ?,
             checked_at = ?, verified_at = ?, rev = rev + 1
       WHERE typ = ? AND entity_id = ? AND rev = ?
    `, [
      row.status, row.body ? JSON.stringify(row.body) : null, row.srcRev ?? null, row.kid ?? null,
      ts(row.issuedAt ?? null), String(row.lastResult ?? 'OK').slice(0, 24), row.failCount ?? 0,
      ts(now), ts(row.verifiedAt ?? null),
      String(row.typ), String(row.entityId), expectedRev,
    ]);
    return result.rowsAffected === 1;
  }

  /** 응답 반영 — 없으면 INSERT, 있으면 rev CAS 1회 재시도. 진 쪽은 방금 남이 갱신한 값이 더 새롭다. */
  async upsertInbound(row, now) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const current = await this.findInbound(row.typ, row.entityId);
      // eslint-disable-next-line no-await-in-loop
      const won = current ? await this.updateInbound(row, current.rev, now) : await this.insertInbound(row, now);
      if (won) return { ...row, rev: (current?.rev ?? 0) + 1, checkedAt: now };
    }
    return null;
  }

  /**
   * 워크로그 이력 수집 범위의 "워크포스 연결" 신호 — 채널 응답 캐시만 본다(엔티티 프로퍼티 원문은 읽지 않는다, 불변식 9).
   * org(VERIFIED = 워크포스 사용자) · link P:{projectId}(연결 이슈를 본 프로젝트). 빈 입력 절은 빼고 둘 다 비면 SQL 없이 빈 집합.
   * @returns {Promise<{orgAccounts: Set<string>, projects: Set<string>}>}
   */
  async verifiedLinkSignals({ accountIds = [], projectIds = [] } = {}) {
    const accounts = [...new Set((accountIds ?? []).filter(Boolean).map(String))];
    const projects = [...new Set((projectIds ?? []).filter(Boolean).map(String))];
    const out = { orgAccounts: new Set(), projects: new Set() };
    if (!accounts.length && !projects.length) return out;
    const clauses = [];
    const params = [];
    if (accounts.length) {
      clauses.push(`(typ = ? AND entity_id IN ${inClause(accounts.length)})`);
      params.push(InboundTyp.ORG, ...accounts);
    }
    if (projects.length) {
      clauses.push(`(typ = ? AND entity_id IN ${inClause(projects.length)})`);
      params.push(InboundTyp.LINK, ...projects.map((id) => `P:${id}`));
    }
    const result = await this.query(`
      SELECT typ, entity_id FROM ${INBOUND}
       WHERE status = 'VERIFIED' AND (${clauses.join(' OR ')})
    `, params);
    (result.rows ?? []).forEach((row) => {
      const typ = String(valueOf(row, 'typ') ?? '');
      const entityId = String(valueOf(row, 'entity_id', 'entityId') ?? '');
      if (typ === InboundTyp.ORG && accounts.includes(entityId)) out.orgAccounts.add(entityId);
      else if (typ === InboundTyp.LINK && entityId.startsWith('P:') && projects.includes(entityId.slice(2))) out.projects.add(entityId.slice(2));
    });
    return out;
  }

  /**
   * 워크로그 통제용 연동 신호 — 이 이슈의 link(I:) 와 프로젝트 행(P:) 전부를 한 번에(controlLinkOf 재료).
   * 프로젝트 행은 ctl 칸이 없어 프로젝트 전체 연동(ALL_ISSUES)으로 읽히지 않는다 — 채널 판에서 이슈 연결은 워크포스가 이슈마다 답한다.
   */
  async controlSignals(issueId) {
    const result = await this.query(`
      SELECT ${INBOUND_COLUMNS}
        FROM ${INBOUND}
       WHERE typ = ? AND status = 'VERIFIED' AND entity_id = ?
    `, [InboundTyp.LINK, `I:${issueId}`]);
    const rows = (result.rows ?? []).map(inboundFromRow);
    return { issue: rows.find((row) => row.entityId === `I:${issueId}`) ?? null, projects: new Map() };
  }

  /** 검증된 org 본문들(팀장 범위 축소 — 워크포스가 결재자를 정한 사람). 빈 입력은 조회하지 않는다. */
  async verifiedOrgBodies(accountIds) {
    const ids = [...new Set((accountIds ?? []).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const result = await this.query(`
      SELECT entity_id, body_json FROM ${INBOUND}
       WHERE typ = ? AND status = 'VERIFIED' AND entity_id IN ${inClause(ids.length)}
    `, [InboundTyp.ORG, ...ids]);
    return new Map((result.rows ?? []).map((row) => [
      String(valueOf(row, 'entity_id', 'entityId')), parseBody(valueOf(row, 'body_json', 'bodyJson')),
    ]));
  }

  // ── 채널 로그 ─────────────────────────────────────────────────────────

  async recordLog({
    direction, typ, entityId, code, sig = '', now,
  }) {
    const logId = linkLogId({
      direction, typ, entityId, code, sig,
    });
    await this.query(`
      INSERT INTO ${LOG} (log_id, direction, typ, entity_id, code, first_at, last_at, hit_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE last_at = VALUES(last_at), hit_count = hit_count + 1
    `, [
      logId, String(direction).slice(0, 4), String(typ).slice(0, 24), String(entityId).slice(0, 160),
      String(code).slice(0, 32), ts(now), ts(now),
    ]);
    return logId;
  }

  /** 관리 화면 최근 실패. */
  async recentFailures(limit = 20) {
    const result = await this.query(`
      SELECT direction, typ, entity_id, code, first_at, last_at, hit_count
        FROM ${LOG}
       WHERE code <> 'SEEN'
       ORDER BY last_at DESC
       LIMIT ${Math.max(1, Math.min(100, Number(limit) || 20))}
    `);
    return (result.rows ?? []).map((row) => ({
      direction: String(valueOf(row, 'direction')),
      typ: String(valueOf(row, 'typ')),
      entityId: String(valueOf(row, 'entity_id', 'entityId')),
      code: String(valueOf(row, 'code')),
      firstAt: fromSqlTimestamp(valueOf(row, 'first_at', 'firstAt')),
      lastAt: fromSqlTimestamp(valueOf(row, 'last_at', 'lastAt')),
      count: Number(valueOf(row, 'hit_count', 'hitCount') ?? 1),
    }));
  }

  async purgeLogs(before, batch = 1000) {
    const result = await this.query(
      `DELETE FROM ${LOG} WHERE last_at < ? LIMIT ${Math.max(1, Math.min(5000, Number(batch) || 1000))}`,
      [ts(before)],
    );
    return Number(result.rowsAffected ?? 0);
  }
}

export const workforceLinkRepository = new WorkforceLinkRepository();

export default workforceLinkRepository;
