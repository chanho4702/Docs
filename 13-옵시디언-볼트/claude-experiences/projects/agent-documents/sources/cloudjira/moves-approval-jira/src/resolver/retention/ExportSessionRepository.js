import { randomUUID, createHash } from 'crypto';
import { executeQuery } from '../../rdb/query/CommonQuery';
import { isTableReady } from '../../rdb/schema/TableReadiness';
import { toSqlTimestamp, fromSqlTimestamp } from '../../rdb/query/SqlTime';
import { LogicalError } from '../../error/LogicalError';
import { ErrorCodes } from '../../utils/errors/ErrorCodes';

const SESSION = 'approval_export_session';
const ENTRY = 'approval_export_entry';
const TTL_MS = 7 * 86_400_000;
const fail = () => new LogicalError(ErrorCodes.RETENTION_EXPORT_REQUIRED, ErrorCodes.RETENTION_EXPORT_REQUIRED);
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
export const exportFingerprint = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export class ExportSessionRepository {
  constructor({ query = executeQuery, tableReady = isTableReady, uuid = randomUUID } = {}) {
    this.query = query; this.tableReady = tableReady; this.uuid = uuid;
  }

  async ready() {
    if (!(await this.tableReady(SESSION)) || !(await this.tableReady(ENTRY))) {
      throw new LogicalError(ErrorCodes.STORAGE_NOT_READY, ErrorCodes.STORAGE_NOT_READY);
    }
  }

  async create({ kind, owner, cutoff, now }) {
    await this.ready();
    if (!owner) throw fail();
    const id = this.uuid();
    await this.query(`INSERT INTO ${SESSION}
      (session_id,kind,owner_account,cutoff,expires_at,status,cursor_json,record_count,rev)
      VALUES (UUID_TO_BIN(?),?,?,?,?,'OPEN',NULL,0,1)`,
    [id, kind, owner, toSqlTimestamp(cutoff), toSqlTimestamp(now + TTL_MS)]);
    return this.get(id, kind, owner, now);
  }

  async get(id, kind, owner, now) {
    await this.ready();
    const result = await this.query(`SELECT BIN_TO_UUID(session_id) AS id, kind, owner_account,
      cutoff,expires_at,status,cursor_json,record_count,rev FROM ${SESSION}
      WHERE session_id=UUID_TO_BIN(?) AND kind=? AND owner_account=? AND expires_at>?`,
    [id, kind, owner, toSqlTimestamp(now)]);
    const row = result.rows?.[0];
    if (!row) throw fail();
    return { id: row.id, kind: row.kind, owner, cutoff: fromSqlTimestamp(row.cutoff),
      status: row.status, cursor: row.cursor_json ? JSON.parse(row.cursor_json) : null,
      count: Number(row.record_count), rev: Number(row.rev) };
  }

  async beginPage(session, cursor) {
    if (session.status !== 'OPEN' || exportFingerprint(session.cursor) !== exportFingerprint(cursor ?? null)) throw fail();
    const result = await this.query(`UPDATE ${SESSION} SET status='WRITING',rev=rev+1
      WHERE session_id=UUID_TO_BIN(?) AND owner_account=? AND status='OPEN' AND rev=?`,
    [session.id, session.owner, session.rev]);
    if (result.rowsAffected !== 1) throw fail();
    return { ...session, rev: session.rev + 1 };
  }

  async finishPage(session, entries, nextCursor) {
    if (entries.length) await this.query(`INSERT IGNORE INTO ${ENTRY}
      (session_id,record_id,fingerprint,parent_fingerprint,access_json,state,rev)
      VALUES ${entries.map(() => "(UUID_TO_BIN(?),?,?,?,?, 'READY',1)").join(',')}`,
    entries.flatMap((entry) => [session.id, entry.id, entry.fingerprint, entry.parentFingerprint ?? null, entry.access ? JSON.stringify(entry.access) : null]));
    // 페이지 저장 도중 중단되면 WRITING에 남아 불완전한 자료가 삭제 허가가 되지 않는다.
    const result = await this.query(`UPDATE ${SESSION} SET status=?,cursor_json=?,
      record_count=(SELECT COUNT(*) FROM ${ENTRY} WHERE session_id=UUID_TO_BIN(?)),rev=rev+1
      WHERE session_id=UUID_TO_BIN(?) AND owner_account=? AND status='WRITING' AND rev=?`,
    [nextCursor ? 'OPEN' : 'COMPLETE', nextCursor ? JSON.stringify(nextCursor) : null, session.id, session.id, session.owner, session.rev]);
    if (result.rowsAffected !== 1) throw fail();
  }

  async confirm(id, kind, owner, now) {
    const session = await this.get(id, kind, owner, now);
    if (session.status === 'CONFIRMED') return session;
    if (session.status !== 'COMPLETE') throw fail();
    const result = await this.query(`UPDATE ${SESSION} SET status='CONFIRMED',rev=rev+1
      WHERE session_id=UUID_TO_BIN(?) AND owner_account=? AND status='COMPLETE' AND rev=?`,
    [id, owner, session.rev]);
    if (result.rowsAffected !== 1) throw fail();
    return { ...session, status: 'CONFIRMED', rev: session.rev + 1 };
  }

  async pending(session, limit = 100) {
    if (session.status !== 'CONFIRMED') throw fail();
    const result = await this.query(`SELECT record_id,fingerprint,parent_fingerprint,access_json,state FROM ${ENTRY}
      WHERE session_id=UUID_TO_BIN(?) AND state IN ('READY','PURGING') ORDER BY record_id LIMIT ${Math.max(1, Math.min(200, limit))}`, [session.id]);
    return (result.rows ?? []).map((row) => ({ id: row.record_id, fingerprint: row.fingerprint,
      parentFingerprint: row.parent_fingerprint, access: row.access_json ? JSON.parse(row.access_json) : null, state: row.state }));
  }

  async setEntryState(session, id, state, expected) {
    const result = await this.query(`UPDATE ${ENTRY} SET state=?,rev=rev+1 WHERE session_id=UUID_TO_BIN(?)
      AND record_id=? AND state=?`, [state, session.id, id, expected]);
    return result.rowsAffected === 1;
  }

  async remaining(session) {
    const result = await this.query(`SELECT COUNT(*) AS cnt FROM ${ENTRY} WHERE session_id=UUID_TO_BIN(?)
      AND state IN ('READY','PURGING')`, [session.id]);
    return Number(result.rows?.[0]?.cnt ?? 0);
  }

  async acquirePurge(session, now) {
    const token = this.uuid();
    const result = await this.query(`UPDATE ${SESSION} SET purge_token=?,purge_until=?,rev=rev+1
      WHERE session_id=UUID_TO_BIN(?) AND owner_account=? AND status='CONFIRMED'
      AND (purge_until IS NULL OR purge_until<=?)`,
    [token, toSqlTimestamp(now + 60_000), session.id, session.owner, toSqlTimestamp(now)]);
    if (result.rowsAffected !== 1) throw fail();
    return token;
  }

  async releasePurge(session, token) {
    await this.query(`UPDATE ${SESSION} SET purge_token=NULL,purge_until=NULL,rev=rev+1
      WHERE session_id=UUID_TO_BIN(?) AND owner_account=? AND purge_token=?`, [session.id, session.owner, token]);
  }

  async cleanup(now) {
    await this.ready();
    const result = await this.query(`SELECT BIN_TO_UUID(session_id) AS id FROM ${SESSION} WHERE expires_at<=?
      AND (purge_until IS NULL OR purge_until<=?) LIMIT 2`, [toSqlTimestamp(now), toSqlTimestamp(now)]);
    for (const row of result.rows ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await this.query(`DELETE FROM ${ENTRY} WHERE session_id=UUID_TO_BIN(?) LIMIT 1000`, [row.id]);
      // eslint-disable-next-line no-await-in-loop
      await this.query(`DELETE FROM ${SESSION} WHERE session_id=UUID_TO_BIN(?) AND expires_at<=?
        AND NOT EXISTS (SELECT 1 FROM ${ENTRY} WHERE session_id=UUID_TO_BIN(?))`, [row.id, toSqlTimestamp(now), row.id]);
    }
  }
}

export const exportSessionRepository = new ExportSessionRepository();
export default exportSessionRepository;
