import { KB_TYP, SETTING_TYP } from '../workforce/LinkedIssueSettingSource';

/**
 * 워크포스 연동 신호·설정 "지금 다시 묻기" — 채널 판(workforce-channel-rest §3 authority.js 재작성).
 * property 판은 여기서 서명 envelope 를 검증하고 rev 규칙으로 수신 캐시를 갱신했다. 이제 원장 주인(워크포스)이 link.resolve·kb.get 으로
 * 현재 값을 답하므로, 이 객체는 LinkedIssueSettingSource 에 force 를 넘기는 얇은 창구다(관리자 refresh·화면·트리거 공용).
 * 워크포스가 정책 값(values·locks)을 보내지 않는다 — 그 층은 늘 비어 있다(워크포스 policySignal 이 이미 빈 값만 보냈다).
 */
const lazySource = () => require('../workforce/LinkedIssueSettingSource').default;

export class WorklogPolicyAuthority {
  constructor({ settingSource = null } = {}) {
    this.settingSource = settingSource;
  }

  source() {
    return this.settingSource ?? lazySource();
  }

  /**
   * @param target {projectId, issueId?} — 이슈면 연결 신호+팀장 설정, 프로젝트면 근무 기준(kb)
   * @param options.system 트리거(사람 없음) — 이슈 1건 SYSTEM(worklog-event-issue)으로 묻는다
   * @returns {{code, updated, released?, setting}}
   */
  async refreshSettings(target, { system = false } = {}) {
    const setting = await this.source().read({
      ...target, typ: target.issueId ? SETTING_TYP : KB_TYP, force: true, system,
    });
    return {
      code: setting.settingUnresolved ? (setting.code ?? 'WORKLOG_WINDOW_UNRESOLVED') : setting.updated ? 'UPDATED' : (setting.code ?? 'UNCHANGED'),
      updated: setting.updated === true,
      released: setting.row?.body?.released === true,
      setting,
    };
  }

  refreshOne(target, options) {
    return this.refreshSettings(target, options);
  }
}

export default new WorklogPolicyAuthority();
