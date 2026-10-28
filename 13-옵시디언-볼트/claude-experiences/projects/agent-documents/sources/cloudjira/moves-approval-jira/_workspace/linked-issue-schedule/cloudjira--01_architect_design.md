# 연동 이슈 일정·사전 승인 + 입력 화면 단일화 + 인원 구조 동기화 — 설계서

> 2026-10-12 작성 · slug `linked-issue-schedule` · 근거: `00_input/requirement.md`(사용자 결정 1~5, 확정)
> 두 리포를 모두 읽고 썼다. 승인 앱 경로는 `C:\CloudJira\moves-approval-jira` 기준, 워크포스 경로는 앞에 `WF:` 를 붙였다(`C:\CloudJira\moves-workforce` 기준).
> 앞쪽 §0~§8 은 사람이 읽는 설명, §9 부터는 구현 계약이다. 실측 관문은 §16, 단계별 작업은 §17, 테스트는 §18, 결정이 필요한 질문은 §19 에 모았다(설계는 §19 의 권고안으로 진행했다).
> **사용자 결정 반영(QUESTIONS Q139): Q1~Q18 확정 — §19 결정표. schedule-window-fields 는 폐기. 6회차 잔여 위험은 수용하고 착수(§5.8).**
> 2026-10-12 코덱스 독립 검증(`02_codex_verify.md`, P0 3·P1 8·P2 2·인용 오류 4)을 반영했다. 지적별 반영 위치와 반박은 §21, 요구 추적은 §20.

---

## 0. 한눈에 보기

**결론**

1. 워크포스 작업관리에 **"승인 설정" 보기**를 하나 더 만든다(표·트리·간트·맵 옆). 팀장만 고칠 수 있고, 여러 이슈를 골라 한 번에 정한다.
2. 정하는 값은 두 가지다. **작성 가능 기간(시작일~종료일)**, **사전 승인(필요 / 불필요 / 기본 따름)**.
3. 워크포스는 이 값을 **새 문서 `rms.issue`** 로 서명해 이슈 프로퍼티 `movesRms.issue` 에 건다. 기존 연동 신호(`rms.policy`)는 건드리지 않는다. 워크포스 DB 는 **늘지 않는다**(프로퍼티 자체가 상태).
4. 승인 앱은 이 문서를 **쓰기 직전마다** 다시 읽어 서명을 확인하고 자기 DB(`workforce_inbound`)에 저장한 뒤, 그 값으로 작성·수정·삭제·사전 승인을 판정한다. 새 테이블은 만들지 않는다.
5. 승인 앱의 **Jira 이슈 재정의 계층은 없앤다.** 정책은 "사이트 기본 → Jira 프로젝트 예외 → (연동 이슈) 워크포스 이슈 설정" 세 단이 된다. 옛 데이터는 지우지 않고 "폐지됨"으로 남긴다.
6. 연동 이슈의 **작성 화면은 승인 앱 작업 로그 탭 하나**로 모은다. 모양은 워크포스 패널과 같다 — KPI 카드 4개, 날짜·시작~종료·코멘트 입력(연속 입력), 최근 기록.
7. KPI 의 계획·투입·내 몫은 사실 **Jira 값**(원래 추정치·소요 시간·워크로그)이다. 워크포스 DB 에만 있는 것은 **하루 근무 시간과 공휴일**뿐이라, 이것만 새 문서 `rms.kb` 로 서명해 프로젝트 프로퍼티에 건다.
8. 워크포스의 생성 경로(패널·마이워크·캘린더)는 연동 이슈면 **승인 앱 전역 페이지의 새 작성 화면으로 넘긴다**. 확인이 안 되면 직접 작성으로 돌아가지 않고 멈춘다. 기간 일괄 입력은 1단계에서 연동 이슈에 대해 끄고, 2단계에서 승인 앱으로 옮긴다.
9. 인원 구조는 워크포스가 **사용자 프로퍼티 `movesRms.org` 의 팀 칸을 실제로 채워** 보내게 한다(지금은 비어 있다). 연동 모드에서 승인 앱은 결재자·팀장 범위를 이것만으로 정한다.
10. 새 스케줄은 없다. 승인 앱 유휴 SQL 은 지금과 같다(미연동 27·연동 38).
11. **보장 범위**: 승인 앱 화면과 새 워크포스를 거친 기록은 미리 막는다. Jira 기본 화면·REST·자동화로 직접 쓴 기록은 막을 수 없어 사후에 표시하고 타임시트 결재에서 위반으로 보여 준다(§5.7). 코덱스 검증 반영 내역은 §21.

**한 장면으로 보면**

> 워크포스 프로젝트 "신사옥 설계"의 팀장 김팀장이 작업관리 › 승인 설정에서 이슈 12건을 골라 "작성 기간 3/2~3/27, 사전 승인 필요"로 저장한다. 워크포스는 12건 각각에 서명 문서를 건다.
>
> 팀원 이철수가 워크포스 마이워크 캘린더에서 3월 5일을 누른다. 연동 이슈라 워크포스는 직접 기록하지 않고 승인 앱 화면(3월 5일이 미리 채워진 작성 화면)으로 넘긴다. 승인 앱은 그 순간 이슈의 서명 문서를 다시 읽어 "3/2~3/27, 사전 승인 필요"를 확인한다. 기록 버튼 대신 "승인 요청" 버튼이 보인다.
>
> 이철수가 3월 30일 날짜로 적으려 하면 승인 앱이 "작성 기간(3/2~3/27) 밖입니다"로 막는다. 누군가 Jira 프로퍼티를 손으로 고쳐 "4/30 까지"로 바꿔도 서명이 맞지 않아 무시된다.
>
> 3월 타임시트를 제출하면 결재자는 워크포스가 알려 준 이철수의 팀장, 즉 김팀장이다. 김팀장은 같은 워크포스 팀 구조 때문에 승인 설정을 고칠 수 있었고, 같은 구조 때문에 결재한다.

---

## 1. 지금 모습 (조사 결과)

### 1.1 워크포스 → 승인 앱 신호는 "연동됨" 표시뿐이다

- 워크포스는 이슈·프로젝트 프로퍼티 `movesRms.policy` 에 연동 신호를 건다. 그런데 `values`·`locks` 는 **항상 비어 있다**(WF:`src/integration/approval/policySignal.js:13`, `:51`). 워크포스는 "정책 값의 권위가 아니다"라고 명시돼 있다.
- 이 신호의 유효 기간은 28일이고 남은 기간이 7일보다 짧으면 다시 건다(WF:`policySignal.js:23-27`). 다시 거는 때는 워크포스 이슈 탭 조회·워크로그 작성·관리자 일괄 게시뿐이다(WF:`src/resolver/approvalLink/IssueWorklogControlService.js:171`, `:273`, WF:`src/resolver/approvalLink/ApprovalLinkAdminService.js:182-220`). 즉 **워크포스 화면을 안 쓰는 이슈는 신호가 만료된다.** 작성이 승인 앱으로 옮겨 가면 이런 이슈가 늘어난다(§5.4 에서 대비).
- 승인 앱은 이 신호를 `WorklogPolicyAuthority.refreshOne` 으로 읽고(`src/resolver/worklogPolicy/WorklogPolicyAuthority.js:13-33`) 검증해 `workforce_inbound`(typ `rms.policy`, entity `I:{id}`·`P:{id}`)에 둔다(`src/rdb/schema/ddl/workforceLink.sql.js:53-70`). 화면 경로는 1시간 안에 다시 읽지 않는다(`src/resolver/worklogControl/IssueSignalRefresher.js:8`).
- 연동 판정은 `controlLinkOf`(`src/domain/worklogControl/rules.js:88-102`): 이슈 신호 FRESH/STALE 이면 연동, 서명된 `ctl:'NONE'` 이면 해제, 만료되면 비연동. 다만 이미 통제 중인 기록은 명시 해제가 아니면 풀지 않는다(`rules.js:108` `keepControlled`).
- **이슈별 작성 기간·사전 승인을 워크포스가 보내는 경로는 없다.** 지금의 "이슈 기간 창"은 승인 앱 정책 `worklogDateWindow` 가 켜졌을 때 Jira 시작일~기한으로 막는 것이다(`src/domain/worklogPolicy/catalog.js:20`, `src/resolver/worklogControl/WorklogControlContext.js:59-91`).

### 1.2 승인 앱의 정책 계층 (이슈 재정의 포함)

- 병합 순서: 사이트 → WORKFORCE_PROJECT → WORKFORCE_ISSUE → JIRA_PROJECT → **JIRA_ISSUE**(`src/domain/worklogPolicy/merge.js:10-31`, 순서는 `:13`).
- 이슈 재정의 저장: `saveIssueWorklogPolicy` → `WorklogPolicyService.saveIssue`(`src/resolver/worklogPolicy/WorklogPolicyService.js:31-36`) → 테이블 `worklog_policy_issue_override`(`src/rdb/schema/ddl/worklogPolicy.sql.js:3-6`, 마이그레이션 `v043`, `src/rdb/schema/migrate.js:113`). 삭제 API 는 없고 `{}` 저장이 사실상 삭제다.
- 판정에 쓰는 곳: `WorklogPolicyResolver.resolveBatch`(`src/resolver/worklogPolicy/WorklogPolicyResolver.js:8-21`) → `WorklogService.checkPolicy`(`src/resolver/worklog/WorklogService.js:106-124`), 사전 승인 `WorklogApprovalPolicy.read`(`src/resolver/worklogApproval/WorklogApprovalPolicy.js:25-26`), 타임시트 상한(`src/resolver/timesheet/TimesheetService.js:252-271`).
- 권한: `getIssueWorklogPolicy`·`saveIssueWorklogPolicy` 등 8개(`src/permission/PermissionMap.js:37-44`), 등록은 `src/index.js:21`, `:55`.
- 감사 기록: 이슈·프로젝트 계층 저장은 **감사에 남지 않는다**(`recordSettingsAudit` 호출 없음). 옛 경로 `SettingsService.saveProjectPolicy` 만 남긴다(`src/resolver/settings/SettingsService.js:504-509`).
- 과거 증거: 타임시트 제출 때 `policy_evidence` 에 키별 값·출처·리비전을 **복사**해 둔다(`TimesheetService.js:269-271`, 컬럼 `v045`). 이슈 재정의는 `source:'JIRA_ISSUE'`, `revision:'issue:{id}:{rev}'` 문자열로만 남는다. 행을 참조(FK)하지 않으므로 재정의를 없애도 과거 증거는 그대로 읽힌다.
- 작업 로그 탭의 이슈 정책 패널은 2026-10-12 에 뺐다(커밋 전 작업 사본, `static/ui/src/features/worklog/WorklogTab.jsx`). 이슈 범위 패널을 쓰는 곳은 이제 테스트뿐이다(`static/ui/src/features/worklogPolicy/WorklogPolicy.test.jsx:94-98`).

### 1.3 입력 화면과 생성 경로 — 구멍 세 개

| # | 구멍 | 근거 |
|---|---|---|
| H1 | 워크포스의 생성 경로 다섯(패널·마이워크·캘린더·단건 모달·기간 일괄)은 모두 `createIssueWorklog` 하나로 모이고, **연동 이슈도 그대로 만든다.** 승인 앱의 기간 잠금·상한·사전 승인을 거치지 않는다. 기간 창(`dw`)만 본다 | WF:`IssueWorklogControlService.js:225-282`, 창 검사 `:180-205` |
| H2 | 기간 일괄 입력이 중간에 실패하면 이미 만든 기록을 **Jira 에서 직접 지운다** — 연동 이슈여도 승인 앱을 거치지 않는다 | WF:`static/ui/src/pages/myWork/modal/WorklogModal.jsx:444-456`, WF:`static/ui/src/components/worklog/worklogWrite.js:137` |
| H3 | 승인 앱 쪽도 연동 이슈 작성을 **탭의 버튼 숨김으로만** 막는다. ••• › Log work 대화상자와 서버 `createWorklog` 는 막지 않는다 | `WorklogTab.jsx:214`, `:233`, `WorklogDialog.jsx:130`, `WorklogService.js:470-517` |

H3 은 이번 설계에서 승인 앱이 연동 이슈의 정식 창구가 되므로 자연히 사라진다. H1·H2 는 §7 에서 막는다.

### 1.4 인원 구조 — 계약은 있는데 데이터가 비어 있다

- 승인 앱은 워크포스 팀 구조를 사용자 프로퍼티 `movesRms.org`(typ `rms.org`)로 받도록 이미 만들어 두었다. 본문은 `{teamKey, teamName, leaderKeys≤10, leads≤50[{teamKey, teamName, memberKeys≤500}], cap, rev}`(`src/integration/workforce/contract.js:258-267`).
- 읽기: 본인 것만 Jira 에서 읽고(5분 캐시), 남의 것은 캐시만 본다(`src/resolver/workforce/WorkforceInbound.js:165-180`). 검증된 값은 프로퍼티가 지워져도 유지된다(sticky).
- 쓰임: 결재선 `TimesheetRouting.resolve` 가 `workforce.forSubject` 를 먼저 보고(`src/resolver/timesheet/TimesheetRouting.js:68-81`), 없으면 앱 명부(ROSTER)로 간다(`:83-84`). 팀장 범위 `TeamScope.leadScope` 는 명부 + 워크포스 `leads` 를 합친다(`src/resolver/timesheet/TeamScope.js:24-33`). 권한 축 `{teamLead:true}` 판정도 같은 TeamScope 다(`src/permission/permissionGuard.js:71-73`). 워크로그 인증도 같은 싱글턴을 쓴다(`src/resolver/worklogCert/WorklogCertService.js:23`, `:170-178`).
- **그런데 워크포스는 팀 칸을 비워서 보낸다.** `cap:['wlorigin']` 만 채운다(WF:`src/integration/approval/orgCap.js:10-14`, 주석 "워크포스는 아직 팀 구조를 게시하지 않는다"). 그래서 지금 WORKFORCE 결재선은 실제로는 한 번도 타지 않고 전부 명부로 간다.
- 그 밖의 빈 곳: 남의 org 를 끌어오는 경로가 없음(본인 접속 때만), 팀장 문서와 팀원 문서 대조 없음, 다중 팀 소속 모델 없음, 소속 이력 없음(제출의 `link_json` 에는 org 의 kid·rev 만, `TimesheetService.js:511-519`).
- 워크포스 쪽 원천: 팀은 KVS 엔티티 `team`(`leaderAccountId`, `parentTeamKey`)(WF:`manifest.yml:271-288`), 소속은 `users.team_key`(WF:`src/rdb/schema/ddl/users.sql.js:23-26`), 프로젝트 담당 팀은 `project_team`(WF:`src/rdb/schema/ddl/projectTeam.sql.js:8-20`). 팀장 판정은 `resolveTeamContext`(WF:`src/permission/PrincipalResolver.js:104-145`).

### 1.5 KPI 의 실제 원천 — 요구서의 가정을 하나 바로잡는다

요구서는 "계획·진행률·MM 환산 기준은 워크포스 DB 에만 있다"고 적었다. 코드를 보면 다르다(WF:`static/ui/src/panel/panelMetrics.js:42-85`).

| 카드 | 원천 | 워크포스 DB 필요? |
|---|---|---|
| 계획 작업량 | Jira `timeoriginalestimate` | 아니요 |
| 투입 공수 | Jira `timespent` | 아니요 |
| 내 몫 | 이 이슈의 내 워크로그 합 | 아니요 |
| 진행률 | 투입 ÷ 계획 | 아니요 |
| **MD 환산** | 하루 근무 시간 `hourRate`(기본 8, 0.5~24) | **예** — WF:`src/resolver/backoffice/setting/SettingDefaults.js:7` |
| **MM 환산** | 이번 달 근무일 수(주말 0, 공휴일은 `workRatio`, 평일 1) | **예** — 공휴일 KVS, WF:`static/ui/src/utils/workday.js:23-27`, `:42-50` |

그래서 워크포스가 서명해 보낼 것은 **하루 근무 시간과 공휴일 목록 두 가지**다. 이슈마다 바뀌는 값이 아니라 사이트 값이다.

---

## 2. 전체 그림

```
 [워크포스]                                       [Jira 엔티티 프로퍼티]                       [승인 앱]
 작업관리 › 승인 설정 (팀장)
   └ saveIssueApprovalSettings ─서명(asApp PUT)─▶ 이슈     movesRms.issue (rms.issue) ──┐
 근무시간·공휴일 저장 / 일괄 게시 ─서명(asApp)──▶ 프로젝트 movesRms.kb    (rms.kb)    ──┤ 쓰기 직전·탭 조회 때
 팀·소속 변경 / 본인 접속 ─────────서명────────▶ 사용자   movesRms.org   (rms.org 팀칸) ┤ asUser 로 읽고 서명 검증
 이슈 탭 조회·관리자 게시 ─────────서명────────▶ 이슈·프로젝트 movesRms.policy (기존)  ──┘        │
                                                                                                  ▼
                                                                         workforce_inbound (검증본, sticky, rev CAS)
                                                                           ├ 작성·수정·삭제 판정(기간 창)
                                                                           ├ 정책 병합 LINKED_ISSUE 층(사전 승인)
                                                                           ├ 결재선·팀장 범위(연동 모드 = 워크포스만)
                                                                           └ 작업 로그 탭 KPI·설정 요약 표시
 [승인 앱 → 워크포스]
   movesApproval.ctl (기존, 큐 게시) 에 ch:'APP' 추가 ─▶ 워크포스: 연동 이슈 작성은 승인 앱 전역 페이지로 넘김
                                                         /jira/apps/{app}/{env}/worklog/{issueId}/new/{date}
```

**원칙**
- 판정은 승인 앱 DB 하나(불변식 9). 워크포스는 값을 정하고 서명할 뿐 판정하지 않는다. 승인 앱은 프로퍼티 원문을 판정에 쓰지 않고 검증본만 쓴다.
- 앱끼리 직접 부를 수 없으므로(`docs/DESIGN.md:151-160`) 모든 교환은 프로퍼티 + 서명이다. 화면 이동은 전역 페이지 링크다.

---

## 3. 계약 — 문서 타입

### 3.1 왜 `rms.policy` 를 넓히지 않고 새 문서를 만드나

| 기준 | `rms.policy` 확장 | 새 문서 `rms.issue` (권고) |
|---|---|---|
| 수명 | 28일 만료 신호. 화면 접속으로 갱신 → 설정도 함께 만료된다. 팀장이 정한 값이 "아무도 안 열어서" 사라지면 안 된다 | 만료 없음. 팀장 저장 때만 바뀐다 |
| 재서명 | 워크포스가 신호를 다시 걸 때마다 설정 값을 알아야 한다 → 워크포스 DB 저장이 필요해지거나, 걸린 값을 읽어 옮겨 실어야 한다 | 연동 신호 갱신과 무관 |
| 배포 순서 | `values` 에 모르는 키가 들어가면 **구버전 승인 앱이 신호 전체를 거부**한다(`normalizeOverride` 실패 → `POLICY_INVALID`, `src/domain/worklogPolicy/authority.js:19`) → 연동 자체가 끊긴다 | 구버전 승인 앱은 모르는 프로퍼티를 읽지 않는다 → 영향 없음 |
| 서명 경로 | 전용 봉투(`moves-link/policy/1`) | 공용 `moves-link/1`(`src/integration/workforce/signature.js`) — 새 서명 코드 없음 |
| 계약 7파일 | `contract.js`·`vectors.json` 변경 | 같음(`contract.js`·`vectors.json`) |

계약 비용은 같고 위험은 새 문서가 훨씬 작다. **`rms.issue` 와 `rms.kb` 를 새로 만들고, `approval.ctl` 에 선택 칸 하나를 더한다.**

### 3.2 `rms.issue` — 연동 이슈 설정 (워크포스 → 승인 앱)

| 항목 | 값 |
|---|---|
| 프로퍼티 | 이슈 `movesRms.issue` |
| typ / 계열 | `rms.issue` / `Family.WORKFORCE` |
| 서명 | `moves-link/1` 공용(`signature.js:12`, `:18`, `:38-42`) — `{v, typ, cloudId, ent, kid, iat, body}` |
| ent 결속 | `{projectId, issueId}`(Jira 프로젝트 id, 이슈 id). 저장하지 않고 "어디서 읽었나"로 다시 만든다 |
| 본문 | `{ s, e, pa, by, tk, rev }` |
| `s`, `e` | 작성 시작일·종료일 `'YYYY-MM-DD'` 또는 `null`. 둘 다 있으면 `s ≤ e`. 실제 달력 날짜만(2/30 거부). 뜻은 **작업 날짜**(기존 기간 창과 같다) |
| `pa` | 사전 승인 `'REQUIRED'` \| `'NOT_REQUIRED'` \| `null`(기본 따름) |
| `by` | 저장한 팀장 accountId(감사용). 판정에는 쓰지 않는다 |
| `tk` | 그 팀장이 이 프로젝트를 이끄는 근거 팀 키 하나(감사용) 또는 `null` |
| `rev` | 0 이상 안전 정수. 워크포스는 `max(now_ms, 걸린 자기 문서 rev + 1)`(§4.4) |
| 만료 | **없음.** 설정은 결정이지 생존 신호가 아니다 |
| rev 판정(§5.3.1) | 기존 수신 규칙(`src/resolver/workforce/WorkforceInbound.js:85-88`)으로 최고 rev 를 저장한다. 다만 Jira 에 걸린 서명 문서가 저장본과 다르고 rev 가 같거나 낮으면(`DIVERGED`) **두 문서 중 더 엄한 쪽을 적용**한다(§5.3.1, 3회차 N2) |
| 비우기 | 세 값 모두 `null` 인 서명 문서(명시적 비움). **프로퍼티 삭제는 "정보 없음"** 이라 승인 앱은 마지막 검증본을 유지한다(sticky — 기존 `rms.org` 와 같은 규칙) |
| 키 철회 | 발행 kid 가 신뢰 집합에서 빠지거나 키 목록에서 지워지면, 그 kid 로 저장된 검증본은 **판정에 쓰지 않는다**(미해결 → 연동 이슈 쓰기 거부). 새 키로 다시 게시돼야 풀린다(§5.3.2) |
| 해제·재연결 | 해제는 연동 신호 NONE 이 결정한다(설정은 적용 중지). 재연결 때 워크포스는 **설정 비우기를 먼저 성공시킨 뒤에** 연동 신호를 건다(§4.5). 순서로 막으므로 승인 앱에 별도 세대 기록이 없다 |
| 크기 | 약 400바이트 |

contract.js 추가분(두 리포 동일):
```js
TYP.RMS_ISSUE = 'rms.issue'; TYP_FAMILY[TYP.RMS_ISSUE] = Family.WORKFORCE; PROPERTY_KEY.RMS_ISSUE = 'movesRms.issue';
// entOf: case TYP.RMS_ISSUE: return pick('projectId', 'issueId');
// validators[TYP.RMS_ISSUE]:
//   nullable(b.s, isIsoDate) && nullable(b.e, isIsoDate) && (b.s == null || b.e == null || b.s <= b.e)
//   && nullable(b.pa, (v) => v === 'REQUIRED' || v === 'NOT_REQUIRED')
//   && typeof b.by === 'string' && ACCOUNT_ID.test(b.by) && nullable(b.tk, (v) => typeof v === 'string' && TEAM_KEY.test(v))
//   && nonNegInt(b.rev)
// isIsoDate: /^\d{4}-\d{2}-\d{2}$/ + 달력 검사(UTC 로 만들어 같은 문자열이 나오는지). contract.js 는 import 금지라 안에 둔다.
```

### 3.3 `rms.kb` — KPI 환산 기준 (워크포스 → 승인 앱, 표시 전용)

| 항목 | 값 |
|---|---|
| 프로퍼티 | 프로젝트 `movesRms.kb` — 연동 이슈가 있는 **Jira 프로젝트마다** |
| typ / 계열 / 서명 | `rms.kb` / WORKFORCE / `moves-link/1` |
| ent | `{projectId}` |
| 본문 | `{ dm, hol, from, to, rev }` |
| `dm` | 하루 근무 시간(분). 30~1440, 30의 배수(`hourRate × 60`). 정규화 JSON 이 안전 정수만 받으므로(`src/integration/workforce/canonical.js:39`) 분으로 둔다 |
| `hol` | `[['YYYY-MM-DD', 비율%(0~100 정수)], …]` ≤ 400개, 날짜 오름차순·중복 없음. 워크포스 공휴일의 `workRatio × 100` |
| `from`, `to` | 이 목록이 다루는 달 범위 `'YYYY-MM'`(예: 올해 1월~내년 12월). 범위 밖 달은 "기준 없음" |
| `rev` | 단조 증가 |
| 만료 | 없음. 대신 승인 앱은 이번 달이 `from~to` 밖이면 MM 을 표시하지 않는다 |
| 크기 | 공휴일 400개 기준 약 9KB |

판정에는 쓰지 않는다(표시 전용). 그래도 서명하는 이유는 사용자 결정 4("워크포스가 서명해 보냄")와, 남이 고친 숫자가 화면에 "워크포스 기준"으로 보이지 않게 하기 위해서다. 승인 앱은 이 값으로 이번 달 근무일 수를 **직접 계산**한다. 워크포스 `getMonthMm` 과 같은 결과가 나와야 하므로 같은 입력·출력 벡터를 두 리포 테스트에 각각 둔다(계약 파일 밖).

### 3.4 `approval.ctl` 에 `ch`·`rx` 추가 (승인 앱 → 워크포스)

- 본문에 칸 두 개를 더한다.
  - `ch: 'APP' | 'WORKFORCE'` — 연동 워크로그 **작성** 창구. 새 승인 앱은 **항상** 싣는다(`linkedInputChannel` 값 그대로, 기본 `'WORKFORCE'`). `'WORKFORCE'` 는 "직접 작성해도 된다"는 **서명된 명시 허가**다. 워크포스는 이 명시 허가가 있을 때만 직접 작성한다(§7.4, 3회차 P0-3).
  - `rx: ['rms.issue', 'rms.kb']` — 이 승인 앱이 받아서 판정할 수 있는 워크포스 문서. 워크포스는 읽을 때마다 보고(기억하지 않는다) `rms.issue` 가 있을 때만 "승인 설정" 편집을 연다.
- validator: `optional(b.ch, (v) => v === 'APP' || v === 'WORKFORCE') && optional(b.rx, (v) => Array.isArray(v) && v.length <= 8 && v.every((t) => typeof t === 'string' && t.length <= 32))`. 모르는 칸도 서명 바이트에 포함된다(`signature.js:16`, `:45`). 구버전 워크포스의 `verifyControlDoc` 는 `ch` 를 옮기지 않는다(WF:`src/integration/approval/controlDoc.js:35-47`).
- 게시 조건: 지금은 "신호 없음·해제·(통제 OFF 이고 기간 창 끔)이면 문서 삭제"다(`src/resolver/worklogControl/WorklogControlCtl.js:61`). 새 규칙은 **"해제되지 않은 연동 신호가 있는 대상에는 늘 문서를 건다"** 하나다(`ch` 가 늘 실리므로 통제 OFF 여도 유지). 해제(NONE)·신호 없음이면 지금처럼 삭제한다. 본문이 바뀌므로 배포·토글 때 `ctlRev` 를 올려 전부 다시 게시한다(기존 일일 `workforce` 큐 작업, 새 스케줄 없음).
- **대상 1,000건 한도는 기존 결함이다(3회차 N9).** `signals()` 가 `LIMIT 1000` 에 정렬·커서가 없고(`WorklogControlCtl.js:32-37`), `targets()`·`bodyFor()` 가 모두 그것을 쓴다(`:48-50`, `:56-58`). 대상이 1,000건을 넘으면 넘는 이슈의 문서가 영구히 게시되지 않는다. 고친다:
  - `targets({after, limit})` 를 `entity_id` 키셋(`WHERE … AND entity_id > ? ORDER BY entity_id LIMIT ?`) 로 바꾸고, 게시 작업(`WorkforcePublisher.drainCtl`)이 기존 예산·커서 방식으로 다음 배치에 이어 준다(미완주면 워터마크 전진 금지 — AGENTS 트리거 규칙).
  - `bodyFor(target)` 는 전체 목록을 다시 읽지 않고 그 대상 한 행을 PK 로 읽는다(SQL 1).
  - 단계 2c 에 넣는다(§17). 테스트: 1,001건 이상·프로젝트 문서 없음·APP 토글 뒤 전체 수렴(A47).
- 넘김 경로는 이미 실린 `ui.globalPagePath` 를 쓴다(`WorklogControlCtl.js:18-27`).

### 3.5 `rms.org` — 계약은 그대로, 칸을 채운다

본문 형식은 바꾸지 않는다(`contract.js:258-267`). 워크포스가 `teamKey`·`teamName`·`leaderKeys`·`leads` 를 실제로 채운다(§8). `cap` 에 새 값은 넣지 않는다 — 만료 없는 문서의 능력 표시는 상대 앱 롤백 뒤에도 남아 현재 버전을 보장하지 못한다(2회차 N6). 버전 확인은 승인 앱 DB 의 관찰로 한다(§17.1). 크기: `leads` 합계 accountId 약 900개까지가 30,000자 예산 안이다(accountId 하나 약 30바이트). 200명 기준으로는 넉넉하다. 넘으면 게시하지 않고 진단에 `ORG_TOO_LARGE` 로 드러낸다.

### 3.6 계약 7파일 영향

| 파일 | 변경 |
|---|---|
| `contract.js` | `TYP`·`TYP_FAMILY`·`PROPERTY_KEY`·`entOf`·`validators` 에 `rms.issue`, `rms.kb` 추가, `approval.ctl` 에 `ch`·`rx`, 날짜 검사 함수 |
| `vectors.json` | `signatures` 에 `rms.issue`(값 있음·전부 null 두 건), `rms.kb` 한 건, `approval.ctl` + `ch`·`rx` 한 건 골든 추가 |
| `canonical.js`, `signature.js`, `ed25519.js`, `base64url.js`, `keyring.js` | 변경 없음 |

두 리포에 바이트 동일하게 복사하고, 워크포스 `src/integration/approval/__test__/vectors.test.js:111-119` 의 지문 표(contract.js, vectors.json 두 줄)를 갱신한다. 지금 지문 검사는 줄끝을 LF 로 맞춘 뒤 비교한다(`vectors.test.js:123-126`) — Windows 체크아웃의 autocrlf 를 견디기 위해서다. 그래서 "바이트 동일"을 실제로 보장하려고 ① 두 리포에 `.gitattributes` 로 7파일 `eol=lf` 를 고정하고 ② 형제 리포가 있을 때 도는 원본 대조(`:133-140`)를 **정규화 없는 `Buffer.equals`** 로 바꾼다(검증 P2-13). 승인 앱 `src/integration/workforce/__test__/contractSelfContained.test.js`(import 금지)를 통과해야 한다. 키(`keyring.js`)는 그대로다 — 기존 ap-/wf- dev·stg 키로 서명·검증한다.

---

## 4. 워크포스 — 작업관리 "승인 설정" 보기

### 4.1 어디에, 어떻게

- 작업관리 탭(`projectIssue`, WF:`static/ui/src/constants/tabs.js:162-172`)의 셸 `ProjectWorkPanel` 은 `?view=` 로 표·트리·간트·맵을 고른다(WF:`static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx:32-35`, `:95-118`). 여기에 **`view=approval`("승인 설정")** 을 더한다. 탭 배열 구조(`children`)를 바꾸지 않아 기존 URL·브레드크럼이 그대로다.
  - 요구 1의 "작업관리 하위 탭"과 같은 경험인가: 작업관리 안의 표·트리·간트·맵이 이미 이 `view` 전환으로 된 하위 탭이다. 같은 줄에 "승인 설정" 버튼이 하나 더 생기고, 주소 `?tab=projectIssue&view=approval` 로 바로 들어오고 공유할 수 있다. `children` 하위 탭으로 만들면 작업관리 전체의 URL·브레드크럼 구조가 바뀌어 기존 링크가 깨진다(WF:`ProjectDetailTabs.jsx:8-29`).
- 보이는 조건: 승인 앱 연동이 확인된 사이트(서명 키 준비 + 이 프로젝트에 검증된 `approval.ctl` 이 있고 그 `rx` 에 `rms.issue` 가 있음)이고, 조회자가 작업관리를 볼 수 있을 때. `rx` 가 없으면(구버전 승인 앱) 보기 자체를 숨긴다 — 받지 못하는 설정을 고치게 하지 않는다(검증 P1-10). 고치기는 팀장만(§4.2).

**화면**

| 영역 | 내용 |
|---|---|
| 상단 | 안내 한 줄("여기서 정한 값은 승인 앱이 작성·수정·삭제를 판정할 때 씁니다"), 필터(전체 / 설정 있음 / 설정 없음 / 서명 확인 불가), 검색 |
| 표 | 선택 체크박스 · 이슈 키·요약 · 담당자 · Jira 시작일~기한 · 계획 MD · **작성 기간** · **사전 승인** · 마지막 저장(팀장·시각) · 상태 배지(설정됨 / 없음 / 서명 확인 불가) |
| 선택 바 | "N건 선택 · 승인 설정 일괄 적용" — 기존 일괄 적용 바(WF:`static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx:403-432`)와 같은 모양 |
| 일괄 적용 모달 | 작성 기간: 변경 안 함 / 날짜 지정(시작·종료, 한쪽만 가능) / **Jira 시작일~기한 복사** / 비우기. 사전 승인: 변경 안 함 / 필요 / 불필요 / 기본 따름. 미리보기(바뀌는 건수) 후 저장 |
| 행 편집 | 행의 작성 기간·사전 승인 칸을 누르면 같은 모달을 한 건으로 연다 |

- 일괄 적용은 기존 패턴(WF:`issue/bulkApply.js:9-207`, `issue/BulkApplyModal.jsx:25`, `issue/useBulkApply.js:36` 동시 실행 3)을 따라 **새 순수 함수 `approvalBulk.js`** 와 모달을 둔다. 한 번 저장 요청은 50건까지, 그보다 많이 고르면 50건씩 순서대로 보낸다.
- "Jira 시작일~기한 복사"는 화면이 이미 읽은 행 값으로 채운다(서버가 다시 읽지 않는다).

### 4.2 팀장 판정 (워크포스 기준)

**정의**: 프로젝트 P 의 승인 설정을 고칠 수 있는 사람 = **P 를 맡은 팀을 직접 이끄는 팀장**(직속 — 후손 팀은 포함하지 않는다).

```
leadProjectIds(principal) =
    projectusers 에 (principal.leadingTeamKeys 팀원) 이 있는 프로젝트
  ∪ project_team 에 principal.leadingTeamKeys 가 배정된 프로젝트      // 직속만, 후손 팀 제외
```
- 팀장 색인은 이미 계산된다(WF:`src/permission/PrincipalResolver.js:117-125`). TEAM_ONLY 의 프로젝트 합집합 계산(WF:`PrincipalResolver.js:417-435`)과 같은 두 저장소 함수(`projectusers`·`project_team`)를 쓰되, 입력을 아래 직속 집합으로 바꾼다.
  - **최종 기준(3회차 N10): 직속.** 입력을 `leadingTeamKeys`(WF:`PrincipalResolver.js:117-119`, 후손 제외)와 그 팀원으로 좁힌다 — 결재 관계(직속)와 같은 규칙이다. 후손 팀 포함 집합(`leadingScope*`)은 쓰지 않는다. §19 Q15 는 이 기준을 확인받는 질문으로 남긴다.
- **가드만으로는 "팀장만"을 보장할 수 없다(검증 P0-1, 동의).** 워크포스 가드는 자원 권한(`isSatisfied`)과 팀장 축(`isTeamLeadOver`)을 **OR** 로 묶고, 관리자는 `isSatisfied` 에서 무조건 통과한다(WF:`permissionGuard.js:26-30`, `:149-150`). 또 팀장 경로로 통과하면 payload 를 `TEAM_LEAD_WRITE_ALLOWLIST` 로 좁히는데, 미등록 resolver 는 payload 가 통째로 비워진다(WF:`src/permission/TeamLeadFieldPolicy.js:29-66`, `:68-75`). 그래서 세 겹으로 한다.
  1. PermissionMap: `saveIssueApprovalSettings` 는 **자원 grant 없이** `teamLead:{projectTargets:['projectId']}` 만 선언한다. 그래도 관리자는 `isSatisfied` 로 통과하므로 2가 필수다.
  2. 서비스 첫 줄: `TeamLeadAuthority.assertLeads(principal, projectId)` — `req.grantedBy` 와 무관하게, 관리자 여부와 무관하게 `projectId ∈ leadProjectIds(principal)` 가 아니면 `ISSUE_SETTING_NOT_TEAM_LEAD`. 이 검사가 진짜 경계다.
  3. allowlist: `TEAM_LEAD_WRITE_ALLOWLIST.saveIssueApprovalSettings = ['projectId', 'items']`. 계약 테스트(`teamLead 보유 키 ⊆ allowlist`)가 등록을 강제한다.
  - 가드에 새 대상 축 `projectTargets` 를 더한다: `isTeamLeadOver`(WF:`permissionGuard.js:107-138`)가 `payload.projectId ∈ leadProjectIds(principal)` 을 본다. 해석 안 되면 거부(fail-close). 판정 함수는 **새 공용 모듈 `TeamLeadAuthority`** 에 두고, §8 의 org 문서 빌더도 같은 모듈의 팀 색인을 쓴다.
  - 테스트로 고정할 경로: 관리자·비팀장 → 거부(서비스), 자원 write 보유·비팀장 → 거부, 일반 팀장·담당 프로젝트 → 성공(payload 보존), 일반 팀장·남의 프로젝트 → 거부.
- 관리자(`isAdmin`)라도 팀장이 아니면 고칠 수 없다(사용자 결정 "팀장 권한으로만"). 조회는 작업관리 열람 권한과 같다(§19 Q4). `listIssueApprovalSettings` 의 `canEdit` 도 같은 `assertLeads` 판정으로 만든다.
- 이슈 단위 검사: 저장하는 이슈가 실제로 그 워크포스 프로젝트 소속인지 확인한다. 지금의 건별 `IssueMembership`(WF:`src/resolver/approvalLink/IssueMembership.js:15-27`)을 JQL `issue in (…) AND moves_RMS_projectId = "P"` 1회로 묻는 일괄판 `filterMembers` 로 넓힌다.

### 4.3 저장 위치 — 워크포스 DB 를 늘리지 않는 근거

- 워크포스에는 "작업" 테이블이 없다. 작업은 Jira 이슈 그 자체이고 소속은 앱 필드 `moves_RMS_projectId` 다(WF:`manifest.yml:51-55`). 이슈 설정을 DB 에 두려면 **새 테이블**이 필요하다.
- 이미 "게시 원장 없이 Jira 프로퍼티 자체가 상태"라는 원칙으로 연동 신호를 운영한다(WF:`src/resolver/approvalLink/ApprovalLinkSignals.js:11`).
- 목록은 JQL 한 번에 100건씩 프로퍼티까지 받아 온다 — 이미 쓰는 방식이다(WF:`src/api/jira/issue/IssueApi.js:377`, `&properties=`). 화면에 보일 때 **자기 공개 키로 서명을 확인**하고, 남이 쓴 값·깨진 값은 "서명 확인 불가"로 보인다.
- 판정 원본은 승인 앱 DB 라서, 워크포스가 값을 잃어도 판정은 흔들리지 않는다.
- 남는 위험: 이슈 편집 권한자가 프로퍼티를 지우면 워크포스 화면은 "없음"인데 승인 앱은 마지막 값을 계속 적용한다. 승인 앱 작업 로그 탭이 "적용 중인 값·저장한 팀장·시각"을 보여 주므로 사람이 알아챌 수 있고, 팀장이 다시 저장하면 맞춰진다(rev 가 더 크다). 이 위험을 없애려면 작은 테이블이 필요하다 → §19 Q7.

### 4.4 서명 게시 절차 (`saveIssueApprovalSettings`)

1. 가드: `projectTargets` 팀장 축.
2. 입력 검증: 50건 이하, 날짜 형식·순서, `pa` 값, 이슈 id 중복 없음.
3. 서명 키 확인(`LinkSigner.ready()`, WF:`src/resolver/approvalLink/LinkSigner.js:41-44`). 없으면 `ISSUE_SETTING_SIGNER_UNAVAILABLE` — Jira 호출 0.
4. cloudId(`InstallCloudId`, WF:`src/resolver/approvalLink/InstallCloudId.js:29-49`). 못 얻으면 거부 — 결속 없는 서명은 만들지 않는다.
5. 소속 일괄 확인(JQL 1회). 소속 아닌 이슈는 `NOT_MEMBER` 결과로 돌려주고 건너뛴다.
6. 현재 값 읽기: 같은 JQL 에 `properties=movesRms.issue` 를 실어 함께 받는다(추가 호출 0). 낙관적 잠금: 요청의 `expectedRev`(화면이 본 rev, 없으면 0)와 걸린 검증본 rev 가 다르면 그 건은 `CONFLICT`. 새 rev = `max(now_ms, 걸린 자기 문서 rev + 1)`.
7. 일괄 모달의 "변경 안 함" 칸은 걸린 값에서 가져온다.
8. 서명 → **asApp PUT** `/rest/api/3/issue/{id}/properties/movesRms.issue`, 동시 5개. 결과는 건별 `{issueId, result:'SAVED'|'UNCHANGED'|'CONFLICT'|'NOT_MEMBER'|'FAILED', rev}`.
9. **쓰기 뒤 대조**: PUT 한 이슈를 다시 GET(JQL 1회)해 걸린 문서가 방금 서명한 것과 같은지 본다. 다르면 `CONFLICT` 로 돌려주고 화면이 다시 읽는다. 이것은 화면 안내용이다 — 상대 PUT 이 대조 뒤에 오면 못 잡는다.
10. 같은 Jira 프로젝트의 `movesRms.kb` 가 없거나 이번 달을 덮지 않으면 함께 게시한다(§7.2).
11. 응답에 문서 원문·서명은 싣지 않는다.
- **동시 저장(2·3회차 N2) — 시각 기반 rev + 어긋나면 더 엄한 쪽.** rev 는 저장 시각(ms)이고 같은 ms 면 +1 이다(`max(now_ms, 걸린 rev + 1)`). 두 팀장이 몇 초 안에 같은 이슈를 고치면 Jira 에 마지막으로 걸린 문서와 승인 앱이 받은 최고 rev 문서가 다를 수 있다(높은 rev 가 먼저 걸리고 낮은 rev 가 나중에 덮는 경우). 이때 승인 앱은 **두 문서 중 더 엄한 쪽을 적용**한다(§5.3.1). 그래서 "허용 문서가 남고 제한 문서가 버려지는" 일이 없다 — 3회차가 지적한 허용 쪽 열림을 닫는다. 어긋남은 `DIVERGED` 로 승인 앱 탭·연동 진단에 보이고, 팀장이 다시 저장하면(새 rev = 그 시각 ms, 앞선 두 rev 보다 크다) 풀린다. 이슈별 리스·게시 의도 영속화는 저장소와 복구 절차를 늘려 택하지 않았다.

asApp 사유: 팀장에게 그 이슈의 편집 권한이 없을 수 있다(기존 ⑧ 게시와 같은 이유, WF:`AGENTS.md:57`). 워크포스 AGENTS ⑧ 에 "`movesRms.issue`·`movesRms.kb` PUT/GET" 을 더한다(§13).

### 4.5 해제·재연결 — 순서로 해결 (2회차 P1-10)

- **해제**: 연동 신호를 서명된 NONE 으로 먼저 바꾸고(필수), 그다음 `movesRms.issue` 를 전부 null 인 서명 문서로 바꾼다(보조). 승인 앱은 NONE 을 보면 설정 적용을 멈춘다. 보조 단계가 실패해도 해제는 이미 끝났다.
- **재연결**: 연동 신호를 거는 곳은 `ensure`(WF:`src/resolver/approvalLink/ApprovalLinkSignals.js:70-97`) 하나다. `ensure` 가 걸린 신호가 NONE 이거나 없는 이슈에 연동 신호를 걸기 **직전**, 같은 GET 으로 받은 `movesRms.issue` 가 값이 있는 자기 문서면 먼저 null 서명 문서(새 rev)로 바꾼다. 이 PUT 이 실패하면 신호를 걸지 않는다 — 승인 앱에서 그 이슈는 계속 해제 상태(설정 미적용)라 안전하다. 재시도는 다음 이슈 탭 접속·관리자 일괄 게시의 `ensure` 가 같은 순서로 한다. 설정이 없거나 이미 null 이면 추가 PUT 이 없다.
- 이 순서로 정상 실패 경로(해제를 승인 앱이 못 본 채 재연결)는 닫힌다 — 재연결 시점 Jira 에는 null 문서(더 높은 rev)가 걸린다.
- 승인 앱은 해제(NONE)를 볼 때 그 이슈의 저장본에 `released:true` 를 남기고, 그 뒤로는 **저장본보다 높은 rev 문서가 올 때까지** 설정을 적용하지 않는다(행 본문의 칸 하나, 스키마 변경 없음). 그래서 해제를 본 경우에는 null 수신 전에 옛 문서를 다시 걸어도(rev 가 같거나 낮다) 적용되지 않는다. 해제를 한 번도 보지 못한 채 null 수신 전에 옛 문서가 다시 걸린 경우만 옛 문서(그 이슈의 마지막 진짜 팀장 결정)가 적용될 수 있다 — 1·2회차의 "무조건 막힌다"는 주장은 정정한다. 이 경우도 null 문서가 걸려 있으면 `DIVERGED` → 더 엄한 쪽이라 null(제한 없음)보다 옛 문서가 엄하면 옛 문서가 적용되는 것은 같다. **보장 범위 밖**으로 명시한다.

---

## 5. 승인 앱 — 수신·저장·판정

### 5.1 언제 읽나 (유휴 SQL 0 유지)

새 서비스 `LinkedIssueSettingSource`(`src/resolver/workforce/`)가 한 곳에서 읽는다. **스케줄에서는 읽지 않는다.**

| 시점 | 방식 | Jira | SQL |
|---|---|---|---|
| 작성·수정·삭제·사전 승인 요청 직전(쓰기 경로) | **항상** 프로퍼티를 다시 읽는다 — 이미 하는 asUser 이슈 조회에 `properties=movesRms.policy,movesRms.issue` 를 얹는다 | +0(얹을 수 없는 경로면 +1) | 검증본 SELECT 1(이미 읽는 `findInboundMany` 에 typ 추가), 바뀐 때만 CAS 쓰기 1 + 감사 1 |
| 작업 로그 탭·작성 화면 조회 | 검증본의 `checked_at` 이 1시간 넘었을 때만 다시 읽는다(기존 `IssueSignalRefresher` 와 같은 간격) | 0~1 | 1 |
| **타임시트 제출·미리보기**(3회차 N8) | **항상 다시 읽는다** — 이미 하는 asUser 기간 이슈 검색(`WorklogCollector.js:105-125`, `POST /rest/api/3/search/jql`, 페이지 100)에 `properties: ['movesRms.policy','movesRms.issue']` 를 얹는다. 검색에 나온 연동 이슈마다 §5.3.1 표로 반영한다. 연동 이슈인데 검색 결과에 없거나 검색이 실패하면 → 미리보기는 경고, **제출은 `TIMESHEET_LINKED_SETTING_UNRESOLVED` 로 거부**(fail-close) | +0(기존 검색 페이지 그대로) | 설정 SELECT 0(기존 `workforceRows` 1회에 typ 추가), 바뀐 이슈마다 감사 1 + 쓰기 1, 사전 승인 대조 SELECT 1 |
| 워크로그 이벤트 트리거(생성·수정) | 연동 이슈 설정이 있는 사이트(KVS 표식 `approval:linkedSetting:any`)에서만, 기존 이슈 신호 갱신과 **같은 asApp 이슈 GET**(사유 `worklog-control-trigger`)에 `movesRms.issue` 를 얹어 받는다 — 같은 이슈 1시간 간격. 사후 관찰(§5.7)에 쓴다. 결과는 사용자에게 돌려주지 않는다 | 0(기존 갱신 호출에 얹음) | §15 |
| 관리자 "다시 읽기"(`refreshWorkforcePolicies`) | 프로젝트·이슈 100건, 기존 경로에 typ 추가 | ≤ 건수 | ≤ 건수 |

- 쓰기 경로는 매번 읽으므로 **팀장이 바꾼 값은 다음 쓰기부터 바로 적용**된다.
- 내용이 같으면 쓰지 않는다. `checked_at` 갱신(touch)도 1시간에 한 번만 한다 — 쓰기마다 UPDATE 하지 않게.

### 5.2 검증

`verifyEntry`(`src/integration/workforce/signature.js:74-113`) 그대로 + `validateBody(TYP.RMS_ISSUE)`. 결속은 "읽은 이슈 id + 그 순간 이슈의 Jira 프로젝트 id"로 서명 바이트를 다시 만들어 검증하는 방식이다. 이슈가 다른 프로젝트로 옮겨졌으면 다시 만든 바이트가 달라 **`BAD_SIGNATURE`** 로 실패한다(공용 `verifyEntry` 에는 `TARGET_MISMATCH` 코드가 없다 — 그 코드는 `rms.policy` 전용 봉투 `authority.js:12` 의 것이다. 인용 정정). 저장본도 `body.projectId` 가 지금 프로젝트와 다르면 쓰지 않는다(기존 이슈 행의 프로젝트 일치 규칙과 같다, `WorklogPolicyResolver.js:17-19`). 실패는 저장값을 바꾸지 않고 `last_result`·`fail_count` 만 올린다.

### 5.3 저장 — 새 테이블 없이 `workforce_inbound`

| typ | entity_id | body_json |
|---|---|---|
| `rms.issue` | `I:{issueId}` | `{s, e, pa, by, tk, rev, projectId, issueId, iat}` |
| `rms.kb` | `P:{projectId}` | `{dm, hol, from, to, rev, projectId, iat}` |

- PK `(typ, entity_id)` 점 조회라 판정 비용이 작다. rev 판정·CAS(`rev = rev + 1`, 불변식 4)·sticky 는 **기존 수신 코드(`WorkforceInbound.js:80-138`)를 그대로 쓴다.** 더하는 것은 세 가지뿐이다: 같은 본문이면 1시간 안 쓰기 생략, `DIVERGED` 표시, 감사 선기록(§5.3.1·§5.3.3).
- **schedule-window-fields 설계는 폐기됐다(Q11 결정, QUESTIONS Q139).** 그 설계의 `issue_schedule`·앱 전용 필드·승인 일정은 만들지 않는다. 이슈별 작성 기간은 연동 이슈에 한해 워크포스 설정(`rms.issue`)으로만 정하고, 비연동 이슈는 사이트·Jira 프로젝트 정책만 쓴다. 마이그레이션 v064 부터는 이 설계가 쓴다(§12).

#### 5.3.1 rev 판정과 쓰기 (검증 P1-8, 2회차 N2 — 기존 규칙으로 되돌려 단순화)

| 받은 문서 vs 저장본 | 결과(기존 `nextRow`) | 더하는 것 | SQL(준비된 스키마·무경합) |
|---|---|---|---|
| 저장본 없음 | 반영(최초 수신) | 감사 선기록 | 감사 INSERT IGNORE 1 + INSERT 1 |
| rev 큼 | 반영 | 감사 선기록 | 감사 1 + UPDATE 1 |
| rev 같음·본문 같음 | 유지 | `checked_at` 1시간 안이면 쓰기 생략 | 0(1시간 지났으면 UPDATE 1) |
| rev 같음·본문 다름 / rev 작음 | `STALE_REV`, 저장본 유지 | `last_result='DIVERGED'` + **충돌 제한 누적값** `conflictLimit` 을 행에 둠: `conflictLimit = stricterSetting(이전 conflictLimit ?? 저장본, Jira 문서)`. 판정은 늘 `stricterSetting(저장본, conflictLimit)` | 누적값이 바뀌면 감사 1 + UPDATE 1, 같으면 0~1(touch) |
| 서명 실패·없음(404) | 저장본 유지(sticky) | — | 0~1 |

- 1회차에 넣었던 "같은 rev·다른 본문은 Jira 쪽 채택(`EQUAL_REV_REPLACED`)"은 **철회**한다. 과거 허용값 재생의 문이 되고(2회차 N2), 높은 rev 가 먼저·낮은 rev 가 나중에 PUT 되는 경우는 어차피 못 고친다. 최고 rev 유지 + 표시 + 재저장이 더 단순하고 안전하다(§4.4).
- CAS 에 지면 저장본을 다시 읽어 위 표를 다시 적용한다(기존 `apply`, 최대 2회). 다시 적용해 저장에 성공한 행으로 판정한다. 2회 모두 실패하면 §5.3.3 의 저장 실패 계약(쓰기·제출 거부)을 따른다.
- **"더 엄한 쪽"(순수 함수 `stricterSetting(a, b)`, `src/domain/linkedIssue/setting.js`)**: 작성 기간은 두 구간의 교집합(한쪽 끝이 비면 다른 쪽 값, 교집합이 비면 모든 날짜 거부), 사전 승인은 `REQUIRED` > `null`(기본 따름) > `NOT_REQUIRED` 순으로 엄한 값.
- **누적 병합(4회차 N2)**: 충돌 제한은 덮어쓰지 않고 **누적**한다. 저장본보다 높은 rev 문서를 정상 수신(서명 검증 + 감사 + CAS 성공)하기 전까지 `conflictLimit` 은 받은 충돌 문서마다 `stricterSetting` 으로 계속 좁아지기만 한다 — 기간 교집합이 쌓이고 사전 승인은 가장 엄한 값이 남는다. 그래서 옛 문서를 여러 개 번갈아 걸어도(예: rev 300 저장 뒤 200, 100 연속) 앞서 본 제한이 풀리지 않는다. 더 높은 rev 문서가 정상 수신되면 그 문서가 새 저장본이 되고 `conflictLimit` 은 지운다(팀장 재저장이 유일한 해제 길).
- **1시간 쓰기 생략은 판정을 생략하지 않는다**: 생략되는 것은 `checked_at` touch 쓰기뿐이다. 누적값이 바뀌지 않으면 쓰기를 생략하고 저장본·`conflictLimit` 으로 판정한다. 이번 Jira 문서로 누적값이 좁아지면 쓰기를 생략하지 않고 저장하며, 그 저장이 실패하면 §5.3.3 의 저장 실패 계약(쓰기·제출 거부, 미리보기·탭 경고)을 따른다.
- 이 규칙으로 옛 문서 재생은 "더 엄하게"만 만들 수 있다 — 허용 쪽으로는 절대 열리지 않는다. 남용(일부러 옛 엄한 문서를 걸어 동료를 막기)은 팀장 재저장으로 풀린다.

#### 5.3.2 키 철회와 재생 (검증 P1-9)

- 저장본의 `kid` 가 지금 신뢰 집합(`keyring.js:51-56` `trustedKids`)에 없거나 키 목록에서 지워졌으면, 그 저장본은 **판정에 쓰지 않는다** → 연동 이슈 쓰기는 `WORKLOG_WINDOW_UNRESOLVED`(fail-close), 화면은 "설정 재게시 필요". sticky 는 "프로퍼티가 사라졌을 때"에만 적용하고 "신뢰를 거둔 키"에는 적용하지 않는다.
- 키가 침해되면 `notAfter` 로는 부족하다 — `notAfter` 는 그 뒤에 서명된 것만 거부하므로(`signature.js:89`) 과거 iat 로 위조한 문서가 통과한다. 운영 절차(`docs/ops/WORKFORCE-LINK-SIGNING-KEYS.md` §7 유출 시 즉시 제거)대로 **키 목록에서 지운다**. 그러면 그 kid 문서는 전부 `UNKNOWN_KID` 가 되고 위 규칙으로 판정에서 빠진다. 워크포스는 새 키로 `rms.issue` 를 일괄 다시 게시한다(`publishApprovalLinkSignals` 에 재서명 단계 — 걸린 자기 문서를 같은 본문·새 rev 로 새 키 서명).
- 같은 대상의 옛 서명 재생: 저장본이 있으면 rev 로 막힌다. 저장본이 없을 때(처음 읽는 이슈) 옛 문서를 걸어 두는 것은 막을 수 없다 — 그 문서도 그 이슈에 대한 진짜 팀장 결정이었고, 재연결 순서(§4.5)로 해제 이전 것은 null 문서보다 rev 가 낮다. **보장 범위 밖**으로 명시한다.
- 캐시 삭제로 최고 rev 가 사라지는 경로를 막는다: 개인정보 정리의 `purgeCache`(`src/resolver/personalData/PersonalDataRepository.js:189-193`)는 accountId 가 없으면 `workforce_inbound` 를 **통째로** 지운다. `rms.issue`·`rms.kb` 행은 이 삭제에서 제외하고(`typ NOT IN ('rms.issue','rms.kb')`), 특정 계정 정리 때는 `rms.issue` 본문의 `by` 만 `null` 로 지운다(rev·설정은 남긴다).

#### 5.3.3 감사 — 반영 전에 남긴다 (검증 P1-8, 2회차 N4 — 단순화)

- 감사 id = `UUIDv5(linkedIssueSetting, issueId + ':' + srcRev + ':' + bodyDigest)` → `approval_settings_audit.audit_id`(BINARY(16), `auditDelegation.sql.js:3-12`)에 `INSERT IGNORE`. 같은 문서는 몇 번 받아도 한 줄이다(불변식 6).
- **순서를 뒤집는다: 감사 INSERT IGNORE → CAS.** 감사 INSERT 가 실패하면 CAS 를 하지 않는다.
- **검증된 변경을 저장하지 못하면(감사 실패 또는 CAS 2회 실패) 그 호출은 판정을 내리지 않는다(4회차)**:
  - 작성·수정·삭제·사전 승인 요청: `LINKED_SETTING_PERSIST_FAILED` 로 거부(재시도 안내). 옛 저장본으로 통과시키지 않는다.
  - 타임시트 제출: 같은 코드로 거부.
  - 미리보기·작업 로그 탭: 거부하지 않고 "설정 반영 미해결" 경고(`settingUnresolved:true`)를 싣는다.
  - 예외는 없다(5회차). 받은 문서가 엄한 쪽이든 허용 쪽이든, 저장해야 할 변경(새 문서·`conflictLimit` 누적 변화)을 저장하지 못하면 위 계약을 그대로 따른다. 저장할 변경이 없는 호출(`UNCHANGED`, 누적값 그대로)만 저장본으로 판정한다.
- 그 문서가 실제로 적용됐는지는 `workforce_inbound` 행(현재 rev)과 쓰기 응답의 `rev` 로 본다. 감사 화면은 "받음" 줄을 rev 순으로 보여 주고, 현재 적용 중인 rev 에 표시를 단다.

### 5.4 판정 연결

**(1) 작성 기간 → 기존 "이슈 기간 창"의 재료만 바꾼다**

`WorklogControlContext.contextFor`(`src/resolver/worklogControl/WorklogControlContext.js:59-91`)에서 창을 정하는 순서:

1. 연동 이슈 설정이 **적용 중**이고 `s` 또는 `e` 가 있으면 → `window = {status:'OK', start:s, end:e, source:'LINKED_ISSUE', rev}`. `worklogDateWindow` 스위치와 무관하다.
2. 1이 아니고 `worklogDateWindow` 가 켜져 있으면 → 지금처럼 Jira 시작일~기한(§19 Q3 권고: 유지).
3. 설정을 읽지 못했고 저장본도 없는데 연동 이슈이거나 연동 불명이면 → `status:'READ_FAILED'` 로 쓰기 거부(fail-close, 기존 `:67-76` 과 같은 방향).

"적용 중" = 검증본이 있고, 이슈가 **명시 해제(`released`)되지 않음**. 연동 신호가 28일 만료돼도 설정은 계속 적용한다 — 만료는 "워크포스 화면을 안 열었다"는 뜻일 뿐이다(`keepControlled` 와 같은 규칙, `rules.js:108`).

**창을 채우는 것만으로는 집행되지 않는다(검증 P0-2, 동의).** `judgeCreate`·`judgeMutation` 은 `linked && dateWindowOn` 일 때만 창을 검사하고(`rules.js:160`, `:177`), 호출부는 `linked` 자리에 `ctx.windowLinked`, `dateWindowOn` 자리에 사이트·계층 스위치를 넘긴다(`WorklogService.js:158-159`, `:242-243`, `:486-487`). 응답의 `dateWindow` 도 같은 조건이다(`WorklogControlContext.js:103`). 그래서 `contextFor` 가 **판정용 플래그를 새로 하나 만들고 모든 호출부가 그것만 쓴다.**

```
windowEnforced =
     (설정 적용 중 ∧ (s ≠ null ∨ e ≠ null))          // §5.4 (1)-1, 사이트 스위치·연동 신호 만료와 무관
  ∨  (설정 미해결 ∧ (연동 ∨ 연동 불명 ∨ 저장본 있음))  // (1)-3, 스위치 OFF 여도 거부
  ∨  (windowLinked ∧ dateWindowOn)                   // (1)-2, 기존 Jira 시작일~기한 경로
```
- `contextFor` 반환에 `windowEnforced`·`window` 를 넣고, 호출부 세 곳은 `judgeCreate/judgeMutation({ linked: ctx.windowEnforced, dateWindowOn: ctx.windowEnforced, window: ctx.window, … })` 로 넘긴다. 순수 함수 `rules.js` 는 바꾸지 않는다(인자 뜻만 "창 검사 여부"가 된다).
- `controlView.dateWindow` 조건도 `ctx.windowEnforced ? ctx.window : null`.
- 통제용 `linked`(LINKED_ALL 숨김 범위·작성 제한)는 그대로 둔다 — 설정이 있다고 숨김 대상이 넓어지면 안 된다(기존 주석 `WorklogControlContext.js:53-57` 의 분리 원칙).
- 같은 플래그를 쓰는 경로 전부(계약으로 고정): 작성(`createWorklog`), 수정·삭제(`judgeWrite`), 목록의 canEdit/canDelete(`WorklogService.js:158`), 편집 컨텍스트·넘김 화면(`getWorklogEditorContext`, `getWorklogHandoff`), 사전 승인 생성·재사용·적용(아래 (2)).

수정은 원래 날짜와 새 날짜 둘 다, 삭제는 원래 날짜를 본다(기존 규칙). 거부 코드는 기존 `WORKLOG_OUTSIDE_ISSUE_WINDOW`(cause `{which, start, end}`)에 `source:'LINKED_ISSUE'` 를 더한다(`src/utils/errors/ErrorCodes.js:155-158`).

**(2) 사전 승인 → 정책 병합의 새 마지막 층**

`mergePolicy` 를 이렇게 바꾼다(`src/domain/worklogPolicy/merge.js:10-31`):
```
SITE_DEFAULT → WORKFORCE_PROJECT → WORKFORCE_ISSUE → JIRA_PROJECT → LINKED_ISSUE
```
- `JIRA_ISSUE` 층과 `jiraIssue` 인자를 없앤다(§6).
- `LINKED_ISSUE` 층은 `approvalMode` 한 키만 낸다: `pa:'REQUIRED'` → `PREAPPROVAL`, `'NOT_REQUIRED'` → `CERTIFICATION`, `null` → 아무것도 덮지 않음.
- 팀장 값이 마지막에 오므로 **팀장 값이 최종**이다(§19 Q1 권고). "더 엄한 쪽"을 고르면 이 층만 `compareStrictness` 로 바꾸면 된다.
- 만료 분류(`classifyAuthorityCache`, `merge.js:6-9`)는 이 층에 적용하지 않는다 — 문서에 만료가 없고, "적용 중" 판정은 §5.4 (1) 의 규칙을 쓴다.
- 출처 `source:'LINKED_ISSUE'`, 리비전 `li:{issueId}:{rev}` — 타임시트 `policy_evidence` 에 그대로 실린다.

기존 코드가 이어 처리하는 곳: 작성 차단 `WorklogService.checkPolicy`(`WorklogService.js:110`, `WORKLOG_APPROVAL_REQUIRED`).

**사전 승인 경로의 빈 곳 두 개(검증 P1-5, 동의)**
- `WorklogApprovalPolicy.read` 는 effective 가 PREAPPROVAL 일 때 `config.required=true` 로 **올리기만** 한다(`src/resolver/worklogApproval/WorklogApprovalPolicy.js:25-26`). 프로젝트 설정(`config.required`)이 이미 필요인데 팀장이 "불필요"를 정하면 풀리지 않는다. 바꾼다:
  - `effective.keys.approvalMode.source === 'LINKED_ISSUE'` 이면 `config.required = (approvalMode === 'PREAPPROVAL')` — 올리기·내리기 둘 다.
  - 그 밖(팀장 "기본 따름" 또는 비연동)은 지금처럼 올리기만.
  - `assertDirectAllowed`(`:44-`)·`create` 의 `WORKLOG_APPROVAL_NOT_REQUIRED`(`WorklogApprovalService.js:93`)가 모두 이 `read` 결과를 쓰므로 한 곳 수정으로 맞춰진다. "불필요"로 바뀐 뒤 열린 요청은 그대로 결재된다(이미 시작된 결재는 정책 변경으로 취소하지 않는다 — 기존 규칙).
  - 결재선(흐름)은 프로젝트 설정의 것을 쓴다. 팀장이 "필요"로 정했는데 프로젝트에 사전 승인 흐름이 없으면 `WORKLOG_POLICY_INVALID`(`read` 의 `valid`)로 막히고 화면이 "프로젝트 관리자가 사전 승인 결재선을 정해야 합니다"를 보인다(§19 Q13 과 연결).
- 사전 승인은 **작성 기간을 다시 보지 않는다.** `open()` 은 정책·기간 잠금만 보고(`WorklogApprovalService.js:30-39`), intent 재사용은 바로 `finalizeCreate` 로 가며(`:91`, `:58`), 적용 직전 `contextFor` 는 `timeZone:'UTC'` 로 불려 창을 판정하지 않는다(`:156`). 바꾼다:
  - `open()` 안에서 `contextFor({issueId, effective, timeZone: 사이트 타임존})` → `judgeCreate({linked: windowEnforced, dateWindowOn: windowEnforced, …})`. 실패면 그 코드로 던진다.
  - 이 `open()` 이 요청 생성(`create`, `:99`)·재사용(`finalizeCreate` 진입부)·승인 후 적용 직전(`:154`) 세 곳에서 불리게 한다. 재사용 경로에도 `open()` 을 넣는다.
  - 적용 직전의 설정 읽기는 쓰기 경로와 같은 "항상 다시 읽기"(§5.1)다. 결재 중에 팀장이 기간을 줄였으면 적용은 `BLOCKED`(`WORKLOG_POLICY_CHANGED`, 기존 코드, `:151`)로 끝난다.
  - `contextFor` 의 `timeZone:'UTC'` 는 사이트 타임존으로 바꾼다(창 판정이 타임존을 쓴다).

**(3) 그 밖**: 기간 잠금·인증 잠금·상한 순서는 바꾸지 않는다(AGENTS "본인 → 통제 작업 중 → 기간 창 → 인증 잠금 → 기간 잠금 → 정책").

### 5.5 감사 기록

- 반영하려는 새 문서마다(§5.3.3, CAS 전) `approval_settings_audit`(`src/rdb/schema/ddl/auditDelegation.sql.js:3-12`)에 한 줄: `area:'linkedIssueSetting'`, `action:'received'`, `actorKey: by`(워크포스 팀장), `detail:{issueId, projectId, from:{s,e,pa}, to:{s,e,pa}, srcRev, kid, tk, via:'WORKFORCE'}`. 결정적 id 라 중복이 없다.
- 거부(서명 불일치·rev 역행)는 감사가 아니라 `workforce_inbound.last_result` 로 남긴다(기존 방식, 진단 화면이 집계한다).
- 감사 화면(설정 탭 기록)에 `area` 라벨 하나와 상세 템플릿을 더한다. 서버는 문구를 만들지 않는다.
- 쓰기 거부 결과(작성 기간 밖)는 기존처럼 에러 cause 로만 돌려준다.

### 5.6 연동 판정과 화면 모양

`linkedLayout = controlLink.linked || (설정 적용 중)`. 작업 로그 탭은 이 값으로 워크포스식 화면(§7)을 고른다. 기존 `control.channel` 은 남기되(구버전 화면 호환) 새 칸 `layout` 을 더하고, **모든 이슈에서 작성 버튼을 보인다**(H3 해소).

### 5.7 보장 범위 — 사전 차단과 승인 앱 DB 대조 (검증 P1-4, 2회차 N1·N5)

승인 앱이 **미리 막을 수 있는 것은 자기 화면을 거친 쓰기뿐**이다. Jira 기본 Log work(제공자 미선택 사이트), REST·자동화·모바일, 구버전 워크포스의 직접 작성은 기록이 생긴 뒤에야 안다. 기존 감지기는 출처·숨김·다른 경로 입력 정책만 보고 기간·사전 승인은 보지 않으며(`WorklogControlDetector.js:60-74` `wants`, `src/domain/worklogControl/foreign.js:20-30`), 출처가 증명된 워크포스 작성은 `PROVEN` 으로 무시된다(`foreign.js:24`).

| 경로 | 보장 |
|---|---|
| 승인 앱 화면(탭·전역 페이지·넘김) | **사전 차단** — §5.4 |
| 새 워크포스(넘김 판정) | 사전 차단 — 직접 작성하지 않는다(§7.4) |
| Jira 기본 UI·REST·자동화·구버전 워크포스 | **사전 차단 불가(보장 범위 밖)** → 아래 **타임시트 제출 대조**가 최종 보장, 이벤트 관찰은 화면 표시용 |

**공용 판정 함수 하나 — `linkedViolationOf` (2회차 N1: 표식 존재가 아니라 DB 대조)**

```
linkedViolationOf({ worklog:{worklogId, issueId, authorId, started}, setting, timeZone, approvedEntry })
  → null | 'LINKED_WINDOW' | 'LINKED_PREAPPROVAL'          // 순수, src/domain/linkedIssue/violation.js
  · 작업 날짜(사이트 타임존)가 [s, e] 밖 → LINKED_WINDOW (출처와 무관 — 승인 앱 화면에서 쓴 것도 나중에 밖으로 옮겨졌으면 위반)
  · 설정 pa 가 사전 승인 필요(effective approvalMode = PREAPPROVAL)인데 approvedEntry 가 없으면 → LINKED_PREAPPROVAL
approvedEntry = WorklogApprovalRepository.appliedEntryFor(worklogId, issueId, authorId)   // SQL
  SELECT … FROM worklog_approval_entry
   WHERE worklog_id = ? AND issue_id = ? AND requester_account = ? AND apply_status = 'APPLIED'
  + 그 요청의 approval_request 상태가 APPROVED, + 스냅샷 draft 의 작업 날짜 = 지금 작업 날짜(사이트 타임존)
```
- 워크로그 프로퍼티 `moves.approval.worklog`(사전 승인 표식)는 **보지 않는다.** 누구나 붙일 수 있고 다른 기록에서 복사할 수 있다(불변식 9). 근거는 오직 `worklog_approval_entry` 의 적용 결과(`src/rdb/schema/ddl/worklogApproval.sql.js:11-22` — `worklog_id`·`apply_status`·`requester_account`·`snapshot_json` 칸이 이미 있다). 기존 감지기의 `pendingApplyMatches`(`src/resolver/worklogControl/WorklogControlRepository.js:480-490`)는 "적용 중 결과 유실" 판별용이라 이 목적에 쓰지 않는다.
- 승인 뒤 다른 날짜로 고쳐진 기록은 날짜 불일치로 `LINKED_PREAPPROVAL`(승인받은 그 기록이 아니다). 같은 날짜 안의 시간 변경은 사전 승인 위반으로 보지 않는다(작성 기간·상한 판정이 따로 있다).
- 출처(APP·PROVEN·NONE)로 면제하지 않는다. 승인 앱 화면에서 쓴 기록은 이미 이 조건을 만족하므로 결과가 null 이고, 그 뒤 외부에서 바뀌면 위반으로 잡힌다.

**어디서 쓰나**
1. **타임시트 제출·미리보기(최종 보장)**: 설정을 그 자리에서 다시 읽고(§5.1 표의 제출 행 — 기존 검색에 얹음, 읽기 실패면 제출 거부) 그 기간 항목 전부를 `linkedViolationOf` 로 본다(`TimesheetService.js:252-271` 의 계층 위반과 같은 자리). 사전 승인 대조는 기간 내 연동 이슈 항목의 worklog id 묶음으로 SQL 1회(IN). 위반은 `violations` 에 `LINKED_WINDOW`·`LINKED_PREAPPROVAL` 로 실려 결재자(팀장)가 본다. 정책 `violationAction` 이 BLOCK 이면 제출이 막힌다. 캐시에 의존하지 않으므로 이벤트 관찰·승인 앱 접속이 없어도 최신 설정으로 대조한다 — 그래서 이것이 보장이다.
2. **작업 로그 탭 행 배지**: 목록 응답에서 같은 함수로 계산(`linkedViolation` 칸). 기록하지 않고 매번 계산한다.
3. **이벤트 관찰(선택적 기록)**: `wants` 에 조건 하나 — 사이트에 검증된 연동 이슈 신호·설정이 있으면(KVS 표식 `approval:linkedSetting:any`) 생성·수정 이벤트를 받아 같은 함수로 보고, 위반이면 append-only `worklog_control_log` 에 `reason:'LINKED_WINDOW'|'LINKED_PREAPPROVAL'` 한 줄. 표식이 없으면 지금과 같다(이벤트당 SQL 0 추가). 같은 처리에서 `linkedInputChannel=APP` 인데 출처가 `PROVEN`(워크포스 서명 작성)인 **생성**이면 위반 여부와 상관없이 `reason:'LINKED_DIRECT_WF'` 한 줄을 남긴다 — §17.1 의 "APP 이후 워크포스 직접 기록 N건"이 이 줄을 센다. 이 기록들은 감사·진단용이고 판정을 바꾸지 않는다.
- **삭제·숨김으로 키우지 않는다.** 자동 삭제는 기존 S1~S11 관문을 거친 "다른 경로 입력"에만 있다.
- **작성자 알림은 두지 않는다(2회차 N5).** 지금 알림은 결재 요청에 매여 있어(`src/resolver/notification/NotificationService.js:181` requestId 필수, `NotificationRepository.js:82` `approval_request` INNER JOIN) 요청 없는 알림을 만들려면 저장·조회·권한·보관 모델을 새로 짜야 한다. 사용자는 행 배지와 제출 화면의 위반 목록으로 알고, 팀장은 결재 화면에서 안다. 따로 알림이 필요해지면 별도 slug 로 한다.

### 5.8 보장 범위 밖 (모음)

설계가 막지 않는 것을 한곳에 모았다. 각 항목의 근거는 표시한 절에 있다.

| # | 범위 밖 | 남는 영향 | 근거 |
|---|---|---|---|
| X1 | 승인 앱 화면을 거치지 않은 쓰기(Jira 기본 UI·REST·자동화·구버전 워크포스)의 **사전** 차단 | 기록은 생기고, 제출 대조·배지로 사후에 드러난다 | §5.7 |
| X2 | 승인 앱이 처음 읽는 이슈에 옛 서명 문서가 걸려 있는 경우 | 그 이슈의 옛 팀장 결정이 적용될 수 있다 | §5.3.2 |
| X3 | 해제를 승인 앱이 한 번도 못 본 채 null 수신 전에 옛 문서가 다시 걸린 경우 | 옛 팀장 결정(더 엄한 쪽)이 적용될 수 있다 | §4.5 |
| X4 | 조직 문서 게시 실패 후 30일 유효 기간 안의 옛 관계 | 최대 30일 옛 팀장 열람·인증 | §8.3 |
| X5 | 승인 앱 롤백 중 설정 미적용 | 운영 절차(④ 먼저 끄기) | §17.1 |
| X6 | **저장 실패 + 동시 저장 + 옛 문서 재생이 한꺼번에 겹치는 경우(6회차 잔여 P1, 사용자 수용)** | 그 호출은 `LINKED_SETTING_PERSIST_FAILED` 로 거부돼 쓰기는 열리지 않지만, 겹침이 이어지는 동안 그 이슈의 정상 쓰기·제출도 계속 실패할 수 있고 어느 문서가 최종인지는 팀장 재저장 전까지 확정되지 않는다 | §5.3.1·§5.3.3, QUESTIONS Q139 |

---

## 6. Jira 이슈 재정의 계층 제거

### 6.1 순서 (작성 기간 대체가 먼저)

1. §5 가 배포돼 연동 이슈의 작성 기간·사전 승인이 워크포스 설정으로 판정되는 것을 확인한다(실측 관문 G4).
2. 그다음 아래 6.2 를 한 번에 배포한다. 거꾸로 하면 이슈별 예외를 줄 길이 사라진 채 운영된다.

### 6.2 지우는 것 / 남기는 것

| 대상 | 처리 |
|---|---|
| `mergePolicy` 의 `JIRA_ISSUE` 층·`jiraIssue` 인자 | 삭제 |
| `WorklogPolicyResolver.resolveBatch` 의 `repo.issues()` 조회 | 삭제 — 판정당 SQL 1회 감소 |
| `WorklogPolicyService.issue`·`saveIssue`, `WorklogPolicyRepository.issues`·`saveIssue` | 삭제 |
| resolver `saveIssueWorklogPolicy` | **삭제** — Controller(`src/resolver/worklogPolicy/WorklogPolicyController.js:4-6`)·PermissionMap(`:41`)·계약 테스트 동시 삭제 |
| resolver `getIssueWorklogPolicy` | **읽기 전용으로 축소** — `{issueId, projectId, effective, linkedSetting}` 만. `override`·`overrideRevision`·`canAdmin` 칸 삭제. 권한 `{issue:'view'}` 그대로(`:40`). 이슈 화면 "이 이슈에 적용되는 정책" 표시용 |
| `refreshWorkforcePolicies` | 유지(`rms.issue` 다시 읽기 포함) |
| 프론트 `WorklogPolicyPanel` 의 `scope='issue'` 분기·기본값 `'issue'`(`WorklogPolicyPanel.jsx:14`, `:22`, `:25-26`) | 삭제, 기본값 `'project'`. 테스트 `WorklogPolicy.test.jsx:94-98` 갱신 |
| i18n 이슈 범위 문구(`worklogPolicy.scope.issue` 등) | 삭제(kr·en, `npm run merge`) |
| 테이블 `worklog_policy_issue_override` | **보존**(DROP 하지 않음). 코드는 더 이상 읽지 않는다. 개인정보 원천 목록(`src/resolver/personalData/PersonalDataRepository.js:43`)에는 남겨 둔다 — 남은 계정 id 를 보고서에서 찾을 수 있어야 한다 |
| `worklog_policy_feature_index` 의 `scope_kind='ISSUE'` 행 | 마이그레이션으로 삭제(아래). `WF_ISSUE`(워크포스 출처) 행은 남긴다 |
| 과거 타임시트 `policy_evidence` | 손대지 않는다. 값이 복사돼 있어 원본 행 없이도 읽힌다. 증명서·제출 상세에서 `source:'JIRA_ISSUE'` 라벨이 계속 보이도록 i18n 키는 **남긴다**("이슈 재정의(폐지됨)") |

### 6.3 마이그레이션

```sql
-- v064_alter_worklog_policy_issue_override_retired
ALTER TABLE worklog_policy_issue_override ADD COLUMN IF NOT EXISTS retired_at TIMESTAMP NULL
-- v065_retire_worklog_policy_issue_override
UPDATE worklog_policy_issue_override SET retired_at = CURRENT_TIMESTAMP WHERE retired_at IS NULL
-- v066_delete_worklog_policy_feature_issue
DELETE FROM worklog_policy_feature_index WHERE scope_kind = 'ISSUE'
```
- 문장 하나에 쿼리 하나(`migrate.js:59-69` 규칙). 숫자 바인딩이 없어 SqlTime 경계 문제가 없다.
- v065 는 1회성이다. 배포 전 개발 사이트에서 남은 행 수를 확인한다(운영 배포 전이라 행이 거의 없을 것이다 — 운영 서명 키 `prd` 도 아직 없다, `src/integration/workforce/keyring.js:23-26`).
- `feature_index` 의 ISSUE 행은 이력 수집 범위의 "사전 거르기"다. 남겨도 거짓 양성만 생기지만(`WorklogPolicyRepository.js:23` 주석) 정리해 둔다.
- `src/rdb/schema/__test__/migrate.test.js:13-77` 의 이름 목록을 갱신한다. SQL 추가 = major upgrade(`--approve MAJOR_VERSION_RULE`).
- 관리자에게 보일 것: 설정 › 데이터 관리에 "폐지된 이슈 재정의 N건 — 내보내기"(CSV: 이슈 id·프로젝트 id·정책 JSON·저장자·시각). 기존 보관 내보내기 화면에 한 줄로 붙인다. §19 Q10.

### 6.4 감사 증거가 끊기지 않는 이유

- 타임시트: `policy_evidence` 가 값을 들고 있다.
- 워크로그 이력: 정책 리비전을 저장하지 않는다(`src/resolver/worklogHistory/WorklogHistoryRecorder.js:273` 은 넘기기만 한다).
- 인증: 사이트 인증 정책만 쓴다(`WorklogCertService.js:551`).
- 원본 행: 보존 + `retired_at` 표시.

---

## 7. 연동 모드 입력 화면 단일화

### 7.1 승인 앱 작업 로그 탭 — 워크포스식 화면 (연동 이슈)

```
WorklogTab
 ├ (layout = LINKED) LinkedWorklogPanel                    ← 신규, 전역 페이지 새 작성 화면과 공용
 │   ├ LinkedSettingSummary   작성 기간 · 사전 승인 · "워크포스 팀장 ○○ · 10/12 설정"
 │   ├ LinkedKpiCards         계획 / 투입(MM·MD) / 내 몫 / 진행률 (워크포스 PanelKpi 와 같은 배치)
 │   ├ LinkedWorklogForm      날짜 · 시작~종료 · 소요(자동) · 코멘트 · [기록] 또는 [승인 요청]
 │   └ (기존) 작업 로그 표 · 이력 패널 · 내 승인 요청 탭
 └ (그 밖) 기존 화면 — 작성 버튼은 이제 연동 여부와 관계없이 보인다
```

**입력 폼**(워크포스 WF:`static/ui/src/panel/PanelWorklogForm.jsx:33-235` 와 같은 동작)
- 날짜(DatePicker) · 시작 시간 · 종료 시간(기본 09:00~18:00) · 소요 시간 표시 · 코멘트(4000자) · 기록 버튼.
- `started = 날짜 + 시작 시간`(사용자 타임존, 기존 `fromLocalParts` 그대로), `timeSpentSeconds = 종료 − 시작`. 종료 ≤ 시작이면 저장 불가(자정 넘김 불가), 최소 1분·최대 24시간.
- **연속 입력**: 저장 성공 뒤 날짜·시간은 그대로 두고 코멘트만 비운다(워크포스 WF:`PanelWorklogForm.jsx:89-90` 과 같다).
- 사전 판정: 작성 기간(`windowPrecheck.js`)·기간 잠금(`lockPrecheck.js`)을 그대로 써서 날짜 선택기를 기간 안으로 좁히고 미리 안내한다. 서버 판정이 최종이다.
- 사전 승인 필요(`approvalMode=PREAPPROVAL`)면 기록 버튼 대신 "승인 요청" — 기존 `createWorklogApproval` 을 부른다.
- 서버는 기존 `createWorklog` 를 그대로 쓴다. 작성용 새 resolver 는 없다.

**KPI 카드**
- 계획 `timeoriginalestimate`, 투입 `timespent` 는 새 resolver `getLinkedIssueOverview` 가 asUser 이슈 조회 1회로 준다.
- 내 몫은 화면이 이미 받은 작업 로그 목록(숨긴 본인 기록 포함)에서 더한다. 목록이 전체보다 적으면 "근사치" 표시(워크포스 `isMineApproximate`, WF:`panelMetrics.js:81-83` 과 같다).
- MD·MM 환산은 검증된 `rms.kb` 로 계산한다. 순수 함수 `src/domain/linkedIssue/kpi.js`(워크포스 `computeIssueMetrics` 포팅)와 `src/domain/linkedIssue/workday.js`(`getMonthMm` 포팅). 화면은 서버가 준 `basis` 만 쓰고 계산식을 따로 갖지 않는다 — 계산은 공용 순수 함수를 프론트에도 같은 파일로 두지 않고, 서버가 `basis:{dayMinutes, month, monthWorkdays}` 를 계산해 내려 준다.
- 기준이 없거나(문서 없음·서명 실패) 이번 달이 범위 밖이면: MD 는 `dm` 이 있으면 표시, MM 은 "—" + "환산 기준 없음" 안내. **0 으로 접지 않는다**(워크포스 원칙과 같다, WF:`panelMetrics.js:10-11`).
- 계획이 비면 진행률도 "—".

### 7.2 워크포스 서명 요약 계약 (KPI 데이터)

§3.3 `rms.kb` 가 전부다. 게시 시점:
1. 관리자 일괄 게시(`publishApprovalLinkSignals`) 첫 페이지에서 프로젝트 신호를 맞출 때 함께(WF:`ApprovalLinkAdminService.js:147-175`).
2. 팀장 승인 설정 저장 때 그 프로젝트(§4.4 ⑨).
3. 워크포스 설정의 근무 시간·공휴일을 저장할 때 — 연동 신호가 걸린 Jira 프로젝트 전부. 50개 넘으면 앞 50개만 동기로 하고 나머지는 다음 접속(이슈 탭 `touchSignal`) 때 "kb 가 낡았으면 다시 건다"로 따라잡는다.
- "낡았다" = 걸린 문서의 서명이 자기 것이 아니거나, `from~to` 가 이번 달을 덮지 않거나, 지금 계산한 본문 지문과 다르다.

### 7.3 승인 앱 전역 페이지의 "새 작성" 화면 (넘김 받는 곳)

- 경로: `/jira/apps/{appId}/{envId}/worklog/{issueId}/new`, `/new/{YYYY-MM-DD}`, `/new/{YYYY-MM-DD}/{HHmm}-{HHmm}`. **쿼리스트링은 쓰지 않는다**(전역 페이지 하위 경로 파싱은 경로명만 본다, `static/ui/src/features/worklog/handoffPath.js:8-13`).
- `handoffPath.js` 에 `parseCreateHandoffPath` 를 더하고 `static/ui/src/entries/inbox.jsx` 라우트에 `WorklogCreateHandoffPage` 를 붙인다(수정·삭제 넘김 `WorklogHandoffPage` 와 같은 자리). 화면은 이슈 머리말(키·요약·"이슈로 돌아가기") + `LinkedWorklogPanel`.
- 데이터: `getLinkedIssueOverview`(이슈 열람 확인 포함) + 기존 `getIssueWorklogs` 첫 페이지.
- 비연동 이슈로 들어와도 같은 화면에서 작성할 수 있다(설정 요약만 빠진다).

### 7.4 워크포스의 생성 경로 넘기기

워크포스 판정표(서버 `createIssueWorklog` 와 화면 공통 순수 함수 `createChannelOf`). 3회차 지적(확정 요구 R:17 "연동 확인 불가 시 직접 입력 자동 복귀 금지")에 맞춰 **연동 대상이면 fail-close** 로 바꿨다. "연동 대상"은 워크포스가 **자기 저장소로** 안다:

- 워크포스 설정에 스위치 **"승인 앱 연동"**(`approvalLinkMode: 'ON'|'OFF'`, 기본 OFF) 하나를 둔다 — 기존 KVS `settings` 엔티티의 속성 하나(WF:`manifest.yml` `settings` 엔티티 schema 를 먼저 바꾸고 배포 — 워크포스 AGENTS 규칙). 새 테이블·행 없음. 승인 앱을 함께 쓰는 사이트의 워크포스 관리자가 켠다. 설정 화면은 승인 앱 문서(`rx`)가 보이는데 OFF 면 "승인 앱이 감지됐습니다 — 연동을 켜세요"를 보여 준다.
- 연동 대상 = 스위치 ON ∧ 워크포스 프로젝트 소속(`IssueMembership`, WF:`src/resolver/approvalLink/IssueMembership.js:15-27`).

| 연동 대상? | 승인 앱 문서(`ApprovalControlLookup.forIssue`, 이슈→프로젝트) | 결과 |
|---|---|---|
| 아니요(스위치 OFF 또는 비소속) | — | 지금처럼 직접 작성 |
| 예 | 검증됨, `ch:'APP'`, `globalPagePath` 있음 | **넘김** |
| 예 | 검증됨, `ch:'WORKFORCE'`(서명된 명시 허가) | 직접 작성 + 기존 기간 창(`dw`) + **자기 `rms.issue` 기간 검사**, 사전 승인 필요면 `WORKLOG_APPROVAL_APP_REQUIRED` |
| 예 | 그 밖 전부 — 404(문서 없음)·서명 실패·신뢰 키 없음(`NO_TRUST`)·읽기 실패(`READ_FAILED`)·`ch` 없음(구버전 승인 앱)·경로 없음 | **멈춤 + 안내** `WORKLOG_LINK_UNCONFIRMED` — "승인 앱 연동을 확인하지 못했습니다. 승인 앱 화면에서 기록하거나 관리자에게 문의하세요." 승인 앱 경로를 알면 "승인 앱에서 기록" 버튼을 함께 보인다. **직접 작성으로 돌아가지 않는다** |

- 워크포스는 여전히 아무것도 기억하지 않는다(2회차 N3 의 경합 없음). 문서를 지우거나 옛 문서(`ch` 없음)를 걸어도 결과는 "멈춤"이라 우회가 되지 않는다. 직접 작성을 여는 유일한 길은 승인 앱이 서명한 `ch:'WORKFORCE'` 이고, 그 문서의 옛 버전 재생은 승인 앱이 `ch:'WORKFORCE'` 를 썼던 기간이 있어야만 가능하다 — 그 경우에도 기록은 제출 대조(§5.7)에 걸린다.
- 승인 앱을 지운 사이트: 워크포스 관리자가 스위치를 끈다(멈춤 안내에 그 방법을 적는다).
- 2회차의 "조작할 사람은 REST 로도 쓸 수 있다" 논리는 워크포스 화면 밖의 사후 보장(§5.7)에만 쓴다. 화면 안의 확정 경계(R:17)는 위 표로 지킨다(3회차 지적 수용).

- 서버도 같은 판정으로 넘김 대상이면 `WORKLOG_CREATE_HANDOFF_REQUIRED`(cause `{path}`)로 거부한다 — 화면이 낡아도 우회되지 않게.
- 경로별 화면 처리:

| 경로 | 지금 | 바꾼 뒤 |
|---|---|---|
| 이슈 패널(WF:`panel/PanelWorklogForm.jsx:87`) | 직접 작성 | 연동 이슈면 폼 자리에 "승인 앱에서 기록" 버튼(KPI 는 그대로). 고른 날짜·시간을 경로에 실어 넘긴다 |
| 마이워크 날짜 클릭·등록(WF:`pages/myWork/WorklogPage.jsx:317-321`, `:510-519`) | 모달 단건 작성 | 모달에서 이슈를 고른 뒤 연동 이슈면 저장 버튼이 "승인 앱에서 기록"으로 바뀐다 |
| 프로젝트 캘린더(WF:`ProjectCalender.jsx:310-314`) | 같은 모달 | 같음 |
| 기간 일괄 입력(WF:`WorklogModal.jsx:421-459`) | 날짜마다 직접 작성, 실패 시 직접 삭제 | **1단계: 연동 이슈면 범위 모드의 "기록" 버튼을 "승인 앱에서 첫 날부터 기록"으로 바꾼다.** 고른 시작일·시작~종료 시간을 경로에 실어 넘기고(`/new/{시작일}/{HHmm}-{HHmm}`), 승인 앱 화면은 연속 입력(날짜·시간 유지)이라 날짜만 넘기며 이어서 기록할 수 있다. 화면에 "연동 이슈는 하루씩 기록합니다 · 남은 날짜 N일(주말·공휴일 제외)" 안내와 남은 날짜 목록을 보여 준다. 범위 자체는 승인 앱으로 넘기지 않는다(경로가 길어지고 2단계와 겹친다). H2 도 이로써 닫힌다. 2단계는 §7.6 |
| 드래그 이동 | 이미 원위치 + 안내(WF:`WorklogPage.jsx:340-345`, `calender/worklogDrop.js:32-37`) | 그대로 |

- 넘김은 기존 수정·삭제 넘김과 같은 `router.navigate` 다(WF:`panel/PanelWorklogHandoff.jsx:15-27`, `panel/panelApproval.js:29-34`). 경로 검사(`/jira/apps/{uuid}/{uuid}/worklog/`, WF:`src/integration/approval/controlDoc.js:17`) 뒤에 `{issueId}/new…` 를 붙인다.

### 7.5 제공자를 고르지 않은 사이트

- 승인 앱의 작업 로그 탭·Log work 동작은 `timeTrackingProviderEnabled` 조건으로 숨는다(`manifest.yml:45-54`, `:83-91`). 그 사이트에는 지금 승인 앱 작성 진입점이 없다.
- 이번 설계로 생기는 진입점:
  1. **워크포스에서 넘김**(§7.4) — 연동 이슈의 주 경로. 제공자 선택과 무관하다.
  2. **승인 앱 이슈 패널**(`transition-approval-panel`, `main/issue`, 조건 없음, `manifest.yml:75-81`)에 연동 이슈일 때만 "작업 시간 기록" 줄 하나 — 전역 페이지 새 작성 화면으로 연다. 제공자 선택 사이트에서는 탭이 있으므로 숨기고 싶지만, 제공자 선택 여부를 앱이 알 방법이 확인되지 않았다(실측 관문 G7). 확인 전에는 늘 보인다(해는 없다). §19 Q9.
- 이 사이트의 Jira 기본 Log work 는 막을 수 없다. 기존 다른 경로 입력 감지(worklog-control)가 그대로 처리한다.

### 7.6 기간 일괄 입력 — 단계 분리 (§19 Q8)

- **1단계(이번)**: 연동 이슈의 범위 모드를 워크포스에서 끈다.
- **2단계(별도 slug 권고 `linked-range-input`)**: 승인 앱에 `createWorklogRange` — 서버가 날짜별로 판정(작성 기간·잠금·상한·사전 승인)을 **먼저 전부** 돌리고, 하나라도 막히면 하나도 만들지 않는다. 만들다 실패하면 승인 앱 자기 경로로 되돌린다. 공휴일 제외는 `rms.kb.hol` 로 된다. 개인 일정(연차) 제외는 워크포스 DB(`user_schedule`)에만 있어 2단계에서도 빠진다 — 필요하면 사용자별 문서가 또 필요하다.

### 7.7 연동 확인 불가 처리 정리

| 어디서 | 무엇을 모르나 | 동작 |
|---|---|---|
| 워크포스 생성 | 승인 앱 창구(`approval.ctl`) | 멈춤 + 다시 시도. 직접 작성 금지 |
| 승인 앱 쓰기 | 연동 설정(읽기 실패 + 저장본 없음 + 연동/불명) | `WORKLOG_WINDOW_UNRESOLVED` 로 거부 |
| 승인 앱 쓰기 | 연동 설정(읽기 실패 + 저장본 있음) | 저장본으로 판정, 응답 `settingStale:true` |
| 승인 앱 화면 | 연동 판정 자체(`linkUnavailable`) | 작성은 연다(승인 앱이 창구이므로), 경고만. 판정은 위 두 줄 |

---

## 8. 인원 구조 동기화

### 8.1 지금 받는 방식 (근거)

- 계약·검증·캐시: §1.4. `WorkforceInbound.orgOf`(`src/resolver/workforce/WorkforceInbound.js:165-180`), 저장 `workforce_inbound`(typ `rms.org`, entity = accountId), 조회 `verifiedOrgBodies`(`src/resolver/workforce/WorkforceLinkRepository.js:523-533`), 화면용 변환 `orgViewOf`(`src/integration/workforce/inbound.js:28-41`, teamKey 앞에 `wf:`).
- 결재선: `TimesheetRouting.js:68-133` — 워크포스 우선(`WorkforceOrgSource.forSubject`, `src/resolver/workforce/WorkforceOrgSource.js:40-46`), 없으면 명부. 팀장 범위: `TeamScope.js:24-33` — 명부 + 워크포스 합집합, 워크포스가 정한 사람은 명부에서 뺀다(`WorkforceInbound.js:278-285`).
- 제출 스냅샷: `timesheet_submission.routing_source`·`link_json`(`workforceLink.sql.js:18-24`).

### 8.2 빈 곳

| # | 빈 곳 | 영향 |
|---|---|---|
| E1 | 워크포스가 팀 칸을 비워 보낸다(WF:`orgCap.js:10-14`) | WORKFORCE 결재선이 실제로 안 탄다 |
| E2 | 다른 사용자의 org 는 그 사람이 승인 앱을 열어야 들어온다(`WorkforceInbound.js:162-178`) | 팀장 범위가 팀원 접속 여부에 달린다 |
| E3 | 연동 모드에서도 명부로 조용히 떨어진다(`TimesheetRouting.js:83-84`) | 두 구조가 섞여 "팀장 = 결재자"가 깨진다 |
| E4 | 팀장 문서 `leads` 와 팀원 문서 `leaderKeys` 를 대조하지 않는다 | 어긋나도 모른다 |
| E5 | 소속 이력 없음, 제출에는 org rev 만(`TimesheetService.js:511-519`) | 과거 결재선 근거가 약하다 |

### 8.3 설계

**워크포스 쪽 — `TeamLeadAuthority` 하나에서 세 가지를 만든다**

**결재 관계는 "간선 목록" 하나에서 두 문서를 만든다(검증 P1-7, 동의).** 처음 설계는 팀원 문서의 `leaderKeys` 와 팀장 문서의 `leads` 를 따로 계산해, 자식 팀장이 부모 팀장을 `leaderKeys` 로 받는데 부모 팀장의 `leads` 에는 빠지는 어긋남이 생길 수 있었다(부모 팀의 `users.team_key` 에 자식 팀장이 없으면). 바꾼다:

```
approvalEdges() → [{subject, approver, teamKey}]   // TeamLeadAuthority, 순수 + 팀 색인
  팀 T 의 팀장 L(T) (= team.leaderAccountId)
  ① users.team_key = T 인 사람 u (u ≠ L(T))          → (u, L(T), T)
  ② L(T) 자신                                         → (L(T), L(parent(T)), parent(T))
     단 L(parent(T)) = L(T)(겸직)이면 한 단계 더 위로
     위로 끝까지 팀장이 없으면 → 간선 없음 + 그 사람의 문서에 "최상위 팀장" 사실(leaderKeys=[], leads≠[])이 남는다
  ③ 팀장이 자기 팀의 users.team_key 에 없거나 다른 팀 소속이어도 ②만 적용(소속보다 리더십이 우선)
  ④ subject = approver 인 간선은 만들지 않는다(자기 승인 금지)
팀원 문서(subject s): leaderKeys = {approver | (s, approver) ∈ edges}
팀장 문서(approver a): leads = group by teamKey {subject | (subject, a) ∈ edges}
```
- 같은 간선 목록의 두 투영이라 서로 어긋날 수 없다. 테스트로 고정한다(§18 W22~W23·W28).
- **최상위 팀장은 본인 결재(사용자 결정, §19 Q16)**: 팀장의 타임시트는 기본으로 한 단계 위 팀장이 결재한다(②). 위에 아무도 없으면 **본인이 결재할 수 있다.** 승인 앱에는 이미 같은 규칙이 워크로그 인증에 있다 — 상위자 없음이 **확인된** 팀장만 본인 서명을 연다(`src/domain/worklogCertification/authority.js:17-28`, 상위자 조회 실패는 "있음" 쪽으로 닫음). 타임시트 결재선에는 아직 없다 — 지금은 본인을 모든 단계에서 빼고(`TimesheetRouting.js:21`, `:51`) 비면 `TIMESHEET_NO_APPROVER`(`:52`). 바꾼다:
  - 연동 모드에서 제출자 본인 문서(본인 읽기 성공, 5분 캐시)가 `leaderKeys=[]` 이고 `leads` 가 비어 있지 않으면(= 워크포스가 확인한 최상위 팀장) 결재선을 **본인 1단계**로 만든다. 본인 읽기 실패·문서 없음이면 본인 결재를 열지 않는다(`TIMESHEET_WORKFORCE_TEAM_MISSING`) — 인증의 fail 방향과 같다.
  - 결재 엔진은 요청자=결재자를 막지 않는다(본인 제외는 결재선 계산에서만 한다). 제출 `link_json` 에 `selfApproval:true`, 결재 이력·증명서에 "본인 결재(상위 팀장 없음)" 라벨(인증의 `selfCertified` 표시와 같은 방식, `src/domain/audit/certAudit.js:141`).
  - **명부(ROSTER) 모드에도 본인 결재를 연다(Q16 결정).** 워크로그 인증의 본인 서명 규칙(`certAuthority`, `src/domain/worklogCertification/authority.js:17-28`)과 같은 조건·같은 fail 방향을 쓴다. 한 순수 함수 `selfApprovalAllowed({ subjectIsTeamLead, upperLeads })` 를 두 경로(인증·타임시트)가 함께 쓴다:
    - 열리는 조건: ① 제출자가 팀장이다(명부: `TeamScope.isTeamLead`, `src/resolver/timesheet/TeamScope.js:87-90` / 연동: 본인 문서 `leads≠[]`) ② 상위 팀장 조회가 **성공했고** 결과가 비어 있다(명부: `TeamScope.upperLeadsOf`, `:64-77` — 명부에서 팀장이 다른 팀의 MEMBER 이면 그 팀 팀장이 상위자 / 연동: 본인 문서 `leaderKeys=[]`) ③ 일반 결재선 계산이 결재자 없음으로 끝났다(명부: `rosterSteps` 의 `TIMESHEET_NO_TEAM`·`TIMESHEET_NO_APPROVER`, `TimesheetRouting.js:50-52`).
    - 상위자가 있으면 그 사람이 결재한다(본인 결재 아님). 상위자 조회 실패는 "있음"으로 닫아 본인 결재를 열지 않고 기존 오류를 낸다. 팀장이 아닌 사람은 결재자가 없어도 본인 결재가 열리지 않는다(기존 `TIMESHEET_NO_APPROVER`).
    - 열리면 결재선은 본인 1단계. `timesheet_submission.link_json` 에 `selfApproval:true`(명부·연동 공통, 컬럼 추가 없음), 결재 이벤트·감사 이력·업무함·증명서에 "본인 결재(상위 팀장 없음)" 라벨 — 인증의 `selfCertified` 표시와 같은 방식(`src/domain/audit/certAudit.js:141`). 결재 엔진은 바꾸지 않는다(요청자=결재자를 막는 규칙이 없다, 본인 제외는 결재선 계산에서만).
- 한 팀의 팀장은 하나(`team.leaderAccountId` 단일 칸, WF:`manifest.yml:271-288`)라 "복수 팀장"은 "한 사람이 여러 팀을 이끄는 경우"만 있다 — 그 사람의 `leads` 에 팀이 여럿 실린다.

**관계 행렬 — 같은 출처, 관계는 일부러 다르다**

| 관계 | 누가 | 범위 | 원천 |
|---|---|---|---|
| 승인 설정 편집 | 프로젝트를 맡은 팀의 팀장 | 직속 팀이 맡은 프로젝트(최종 기준, Q15 확인) | `TeamLeadAuthority.leadProjectIds` |
| 타임시트 결재 | `approvalEdges` 의 approver | 직속(①②) | `rms.org` ← `approvalEdges` |
| 팀장 화면 열람(TeamScope) | 같음 | 같음 | 같음 |
| 워크로그 인증(상위자 포함) | 같음 + `upperLeadsOf` | 직속 + 한 단계 위 | 같음 |

편집은 "프로젝트"에 대한 관계이고 결재는 "사람"에 대한 관계라 문자 그대로 같은 판정일 수는 없다(반박 — 요구 5의 "같은 판정"은 같은 팀 색인·같은 직속 리더십 규칙에서 나온다는 뜻으로 해석했다). Q15 를 (가)로 정하면 두 관계 모두 "직속 리더십"이라는 같은 규칙을 쓴다.
- 게시(`publishOrgDocs`): `rms.org` 본문을 위 계산으로 채우고 기존 `cap` 을 보존한다(`orgCapPlan` 의 보존 규칙과 반대 방향 — 팀 칸은 새로 쓰고 cap 은 옮긴다, WF:`orgCap.js:26-41`).
  - 팀 저장(팀장·부모 변경), 사용자 소속 변경, 사용자 비활성 → 영향받는 사람들의 문서를 **asApp PUT** `/rest/api/3/user/properties/movesRms.org?accountId=`. **미검증**(실측 관문 G1, CLAUDE.md 미검증 표 "앱이 타 사용자 프로퍼티 쓰기").
  - G1 이 안 되면 후퇴: ① 본인이 워크포스를 열 때 asUser 로 자기 문서 갱신(지금 cap 경로 `ensureOrgCap` 을 확장, WF:`ApprovalLinkSignals.js:177-202`) ② 워크포스 관리자의 "인원 구조 게시" 버튼 — 관리자 asUser(Jira 관리자면 남의 문서도 쓸 수 있다).
  - rev = `max(now, 걸린 rev + 1)`, 한 번의 팀 변경으로 쓰는 문서들은 같은 rev 를 쓴다(대조용).

**승인 앱 쪽**
1. **연동 모드 = 워크포스 구조만**(§19 Q5 권고). **기준은 하나 — 정책 `workforceTeamSource === 'WORKFORCE'`**(3회차 N10, 관리자 토글, 기본 `'ROSTER'`). `workforceLinkEnabled`·신뢰 키는 이 토글을 켤 수 있는 전제 조건(설정 화면 검사)일 뿐 판정 기준이 아니다. Routing·TeamScope·`{teamLead:true}` 축·인증 상위자 판정이 모두 이 한 값만 본다. 이때:
   - `TimesheetRouting` 은 명부로 떨어지지 않는다. org 가 없으면 `TIMESHEET_WORKFORCE_TEAM_MISSING`(새 코드, cause `{subjectId}`).
   - `TeamScope.leadScope` 는 워크포스 `leads` 만 쓴다. 명부 팀은 범위에서 뺀다.
   - 명부 화면(`static/ui/src/features/settings/TimesheetTeamSettings.jsx`)은 읽기 전용 + "연동 모드에서는 워크포스 팀 구조를 씁니다" 안내. 저장값은 보존(단독 모드로 돌아가면 다시 쓴다).
2. **팀원 문서가 없을 때 팀장 문서로 거꾸로 찾기**: `forSubject(subject)` 가 본인 문서 → 없으면 검증된 팀장 문서 중 `memberKeys` 에 subject 가 있는 것의 주인을 결재자로. SQL 은 검증된 `rms.org` 중 `leads` 가 있는 행만 1회(팀장 수만큼, 200명 기준 수십 행). 팀장 문서는 팀장이 승인 앱을 열 때 본인 읽기로 들어온다 — 팀장은 결재하러 반드시 들어온다.
3. **대조(E4)와 권한 회수(검증 P1-6, 동의)**: 승인 앱은 남의 org 를 캐시로만 읽으므로(`WorkforceInbound.js:162-178`), 사람이 팀을 옮겨도 옛 팀장 문서가 sticky 로 남아 옛 팀장의 열람·인증 범위가 유지될 수 있다. 그래서:
   - **TeamScope 는 교집합으로 좁힌다.** 팀장 a 의 범위 = a 의 `leads` 에 있는 subject 중, **subject 의 팀원 문서가 캐시에 있으면 그 `leaderKeys` 에 a 가 있는 사람만.** 팀원 문서가 없으면 팀장 문서만으로 인정한다(문서가 하나뿐일 때는 대조할 것이 없다).
   - 결재선(제출)은 팀원 문서를 따르고(제출자 본인 읽기라 5분 안 최신), 팀장 문서와 다르면 `link_json.orgMismatch:true` 와 관리자 진단 건수.
   - 팀장 본인 문서 읽기가 실패하고 캐시가 24시간보다 오래됐으면, 그 팀장의 **새 열람·인증·일괄 결정(`{teamLead:true}` 축)은 거부**한다(빈 범위, fail-close). 이미 결재선에 들어간 요청의 결정(`approval_approver` 행)은 기존 규칙대로 진행된다(불변식 2·5 — 결재자 행은 제출 때 굳는다).
   - 이동·비활성·팀장 교체 시 워크포스는 **본인·옛 팀장·새 팀장** 문서를 같은 rev 로 다시 쓴다(§18 W26). 옛 팀장 문서에서 그 사람이 빠지는 것이 회수 문서다. 승인 앱은 옛 팀장이 다음에 들어올 때(본인 읽기, 5분) 받는다.
   - **스스로 고치는 경로(2회차 P1-6, 장치 추가 없이 기존 접속 경로 재사용)**: 워크포스는 사람이 워크포스를 열 때마다 이미 본인 `movesRms.org` 를 확인한다(`ensureOrgCap`, WF:`ApprovalLinkSignals.js:177-202`). 이 확인을 "걸린 본인 문서의 팀 칸이 지금 DB 의 간선과 같은가"로 넓혀, 다르면 그 자리에서 다시 쓴다(asUser 본인). 팀장은 승인 설정·팀 화면 때문에 워크포스를 자주 연다 — 옛 팀장 문서는 그 팀장의 다음 워크포스 접속에서 고쳐진다.
   - **모든 조직 관계의 유효 기간 — 30일(3회차 P1-6)**: 팀원 문서·팀장 문서 모두 서명 시각(`iat`)이 30일을 넘으면 **그 문서는 관계 근거로 쓰지 않는다**(캐시가 있어도). 그래서 "양쪽 문서가 모두 옛것"인 관계도 최대 30일 뒤 닫힌다 — 갱신되지 않으면 권한이 없다. 결과: 30일 넘은 팀장 문서의 주인은 `{teamLead:true}` 축·팀장 범위가 비고, 30일 넘은 팀원 문서의 주인은 (살아 있는 팀장 문서의 역조회가 없으면) `TIMESHEET_WORKFORCE_TEAM_MISSING`. 이미 결재선에 들어간 요청의 결정(`approval_approver`)은 그대로 진행된다.
   - **갱신**: 워크포스는 ① 본인 접속 때 자기 문서를 확인해 팀 칸이 다르거나 `iat` 가 7일을 넘으면 다시 서명한다(asUser 본인, 스케줄 없음). ② G1 이 통과하면 워크포스의 **기존** 일일 스케줄 작업(WF:`manifest.yml:189` `scheduledTrigger`)에 "`iat` 7일 넘은 문서 다시 서명"을 더한다(200명이면 하루 약 30건 PUT) — 승인 앱 쪽 스케줄은 늘지 않는다. G1 이 실패하면 ①과 관리자 "인원 구조 게시"만 남고, 30일 안에 아무도 갱신하지 않으면 권한이 꺼진다(안전한 쪽). 인원 구조 카드에 "30일 안에 만료될 관계 N건"을 보인다.
   - 게시 실패·크기 초과: 워크포스 저장 화면이 "인원 구조 게시 실패 N명"을 보이고, 관리자 "인원 구조 게시"(`publishOrgDocs`, 현재 DB 기준 전량·멱등)로 복구한다. 그 사이 노출은 팀원 문서가 갱신된 관계는 즉시(교집합), 그 밖은 최대 30일(유효 기간)로 묶인다. 이 30일 상한 안의 노출만 남는 위험이다.
4. **스냅샷(E5)**: 제출 `link_json.org` 에 `{kid, rev, iat}` 에 더해 `teamKey`·`leaderKeys` 를 남긴다. JSON 칸이라 컬럼 추가가 필요 없다.
5. **준비 점검 카드**: 설정 › 워크포스 연동에 "인원 구조" 카드 — 검증된 org 문서 수, 팀장 수, 팀원 문서 없음·대조 불일치 건수. 관리자 "다시 읽기"(`refreshWorkforceCapabilities` → `inbound.refreshOrgs`, `src/resolver/worklogControl/WorklogControlService.js:141`, `WorkforceInbound.js:188-221`, 50명)를 팀 칸까지 반영하도록 넓힌다.

**"팀장 = 이슈 설정 편집자 = 결재자"가 같은 판정에서 나오는가**

| 판정 | 어디서 | 원천 |
|---|---|---|
| 이슈 설정 편집 | 워크포스 가드 `projectTargets` | `TeamLeadAuthority`(팀 KVS·`users.team_key`·`project_team`) |
| 타임시트 결재자 | 승인 앱 `TimesheetRouting` | `rms.org` ← `TeamLeadAuthority` |
| 팀장 화면 범위·`{teamLead:true}` | 승인 앱 `TeamScope` | `rms.org` ← `TeamLeadAuthority` |
| 워크로그 인증 상위자 | 승인 앱 `TeamScope.upperLeadsOf` | `rms.org` ← `TeamLeadAuthority` |

연동 모드에서 명부가 빠지므로 넷 다 워크포스 팀 색인 하나에서 나온다.

---

# 부록 — 구현 계약

## 9. 경계면 계약

### 9.1 승인 앱 resolver

| resolver | 권한 축 | 입력 | 성공 응답(result) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getLinkedIssueOverview` **신규** | `{issue:'view', issueIdKey:'issueId', appAccess:false}` | `{issueId}` | `{issueId, issueKey, projectId, linked, linkUnavailable, layout:'LINKED'\|'STANDARD', setting:{active, entryStart, entryEnd, preapproval:'REQUIRED'\|'NOT_REQUIRED'\|null, by, byTeam, srcRev, verifiedAt, stale}\|null, approvalRequired, entryWindow:{status,start,end,source}\|null, kpi:{plannedSeconds, spentSeconds, basis:{dayMinutes, month, monthWorkdays}\|null}}` | `INVALID_TARGET`, `PERMISSION_DENIED`, `STORAGE_NOT_READY` | 작업 로그 탭(연동), 전역 페이지 새 작성 |
| `getIssueWorklogs` 변경 | 기존 | 기존 | `control` 에 `layout` 추가. `channel` 유지(구 화면 호환). 행에 `linkedViolation: 'LINKED_WINDOW'\|'LINKED_PREAPPROVAL'\|null`(§5.7) | 기존 | 작업 로그 탭 |
| `getWorklogEditorContext` 변경 | 기존 | 기존 | `control.dateWindow.source`(`'LINKED_ISSUE'`\|`'ISSUE_FIELDS'`) 추가 | 기존 | 작성·수정 폼 |
| `createWorklog`·`updateWorklog`·`deleteWorklog` 변경 | 기존 | 기존 | 기존 + `settingStale?` | 기존 + `WORKLOG_OUTSIDE_ISSUE_WINDOW`(cause `source:'LINKED_ISSUE'`, `rev`), `WORKLOG_WINDOW_UNRESOLVED`, `LINKED_SETTING_PERSIST_FAILED` | 폼, 넘김 화면 |
| `createWorklogApproval` 변경 | 기존 | 기존 | 기존 | 위와 같음 | 사전 승인 |
| `getIssueWorklogPolicy` **축소** | 기존(`PermissionMap.js:40`) | `{issueId}` | `{issueId, projectId, effective, linkedSetting}` | 기존 | 정책 요약 |
| `saveIssueWorklogPolicy` **삭제** | — | — | — | — | — |
| `refreshWorkforcePolicies` 변경 | 기존(`:43`) | 기존 | `items[].typ` 추가(`rms.policy`\|`rms.issue`\|`rms.kb`) | 기존 | 연동 진단 |
| 워크포스 연동 상태 resolver(기존) 변경 | 기존 | 기존 | `org:{verified, leads, missingMembers, mismatches}`, `linkedIssue:{verified, failed}` 추가 | 기존 | 설정 › 워크포스 연동 |
| `refreshWorkforceCapabilities` 변경 | 기존 | 기존 | 팀 칸 반영 건수 추가 | 기존 | 같음 |
| `getApprovalSettings`·`saveApprovalSettings` 변경 | 기존 | `patch.linkedInputChannel:'APP'\|'WORKFORCE'`, `patch.workforceTeamSource:'WORKFORCE'\|'ROSTER'` | 기존 policy | `POLICY_INVALID` | 설정 › 워크포스 연동 |
| 타임시트 제출·미리보기(기존) 변경 | 기존 | 기존 | 기존 | + `TIMESHEET_WORKFORCE_TEAM_MISSING`(연동 모드) | 내 타임시트 |

- 새 resolver 는 3단계 등록(Controller `guardedDefine` + `PermissionMap` + `CONTROLLER_REGISTRARS`) — `WorklogController` 에 붙인다.
- 정책 키 `linkedInputChannel` 은 `SettingsRepository` 키 맵·기본값 두 곳에 동시에(`approval:settings:linkedInputChannel`). 기본 `'WORKFORCE'`(지금 동작) → 실측 관문 G9 통과 뒤 기본 `'APP'` 으로 바꾸는 작은 후속 변경. 계약 테스트(`src/resolver/settings/__test__/SettingsPolicyKeys.test.js`)가 두 집합을 대조한다.

### 9.2 워크포스 resolver

| resolver | 권한 | 입력 | 성공 응답 | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `listIssueApprovalSettings` **신규** | 작업관리 열람과 같은 `R(...)` + project mode `detail` | `{projectId, cursor?, filter?}` | `{items:[{issueId, issueKey, summary, assignee, startDate, dueDate, plannedSeconds, setting:{s,e,pa,by,rev,at}\|null, state:'SET'\|'NONE'\|'UNVERIFIED'}], nextCursor, canEdit, approvalPresent}` | `PROJECT_NOT_FOUND`, `APPROVAL_LINK_UNAVAILABLE` | 작업관리 › 승인 설정 |
| `saveIssueApprovalSettings` **신규** | grant 없음 + `teamLead:{projectTargets:['projectId']}`(+ 서비스 `assertLeads` 필수, allowlist `['projectId','items']`, §4.2) | `{projectId, items:[{issueId, expectedRev, s?, e?, pa?, keep:{window?, pa?}}] ≤50}` | `{results:[{issueId, result, rev}]}` | `ISSUE_SETTING_NOT_TEAM_LEAD`(서비스 필수 검사, §4.2), `ISSUE_SETTING_SIGNER_UNAVAILABLE`, `ISSUE_SETTING_INVALID_RANGE`, `TOO_MANY_TARGETS` | 같음 |
| `createIssueWorklog` 변경 | `SELF`(WF:`src/permission/PermissionMap.js:422`) | 기존 | 기존 | + `WORKLOG_CREATE_HANDOFF_REQUIRED`(cause `{path}`), `WORKLOG_LINK_UNCONFIRMED`, `WORKLOG_APPROVAL_APP_REQUIRED` | 패널·마이워크·캘린더 |
| `getIssueWorklogControl` 변경 | `SELF`(`:421`) | 기존 | `createChannel:'APP'\|'DIRECT'\|'UNCONFIRMED'`, `createPath`, `settingEditable`(`rx` 에 `rms.issue`) 추가 | 기존 | 패널 |
| `publishApprovalLinkSignals` 변경 | `W('SETTINGS')`(`:424`) | 기존 | `kb` 게시 결과 건수 추가 | 기존 | 관리자 |
| `publishOrgDocs` **신규** | `W('SETTINGS')` | `{cursor?}` | `{published, skipped, failed, nextCursor}` | `ISSUE_SETTING_SIGNER_UNAVAILABLE` | 관리자 "인원 구조 게시" |
| `getApprovalLinkDiagnostics` 변경 | `W('SETTINGS')` | 기존 | 항목 `ISSUE_SETTING_DOC`, `KB_DOC`, `ORG_DOC_WRITE`, `ORG_TOO_LARGE`, `CREATE_CHANNEL` 추가 | 기존 | 진단 |

워크포스도 3단계 등록(`CONTROLLER_REGISTRARS` + `guardedDefine` + `PermissionMap`, WF:`AGENTS.md:31-32`).

## 10. 도메인(순수 함수)

**승인 앱** (`Date.now()` 금지, now·타임존 인자)
- `src/domain/linkedIssue/setting.js`
  - `normalizeLinkedSetting(body) → {s, e, pa}`
  - `isSettingActive({row, link}) → boolean` (검증본 있음 ∧ `link.released !== true`)
  - `entryWindowOf({setting, active}) → {status, start, end, source, rev} | null`
  - `approvalModeOf(pa) → 'PREAPPROVAL'|'CERTIFICATION'|null`
- `src/domain/linkedIssue/kpi.js` — `kpiBasisOf({kb, now, timeZone}) → {dayMinutes, month, monthWorkdays} | null`
- `src/domain/linkedIssue/workday.js` — `monthWorkdays({year, month, holidays})`(주말 0, 공휴일 비율, 평일 1) — 워크포스 `getMonthMm` 과 같은 벡터.
- `src/domain/worklogPolicy/merge.js` — `mergePolicy({site, workforceProject, workforceIssue, jiraProject, linkedIssue, now})`.
- `src/integration/workforce/inbound.js` — `linkedIssueViewOf(body)`, `kbViewOf(body)`.
- 프론트 순수: `static/ui/src/features/worklog/timeRange.js`(시작~종료 → 초, 검증), `linkedKpiView.js`(초 → MD·MM 표시값, null 유지).

**워크포스**
- `src/integration/approval/issueSetting.js` — `buildIssueSettingEntry`, `verifyOwnIssueSetting`, `mergeBulkItem({current, item})`.
- `src/integration/approval/kbDoc.js` — `buildKbBody({hourRate, holidays, now})`, `kbStale({current, body, now})`.
- `src/permission/TeamLeadAuthority.js` — `leadProjectIds`, `leaderKeysOf(accountId)`, `leadsOf(accountId)`.
- `static/ui/src/pages/projectDetail/issue/approvalBulk.js` — 일괄 값 계산·미리보기.
- `static/ui/src/components/worklog/createChannel.js` — `createChannelOf({member, ctl, readError})`.

## 11. 백엔드 세부

### 11.1 승인 앱 파일

| 파일 | 변경 |
|---|---|
| `src/resolver/workforce/LinkedIssueSettingSource.js` 신규 | 읽기·검증·CAS 저장·감사, `forIssue({issueId, projectId, mode, propertiesFromIssue})` |
| `src/resolver/workforce/WorkforceInbound.js` | `rms.issue`·`rms.kb` typ 처리, 팀장 문서 역조회 |
| `src/resolver/workforce/WorkforceLinkRepository.js` | `findInboundMany` 에 typ 목록, `verifiedLeadBodies()` |
| `src/resolver/worklogControl/WorklogControlContext.js` | 창 재료 순서(§5.4), `layout` |
| `src/resolver/worklogControl/IssueSignalRefresher.js` | 프로퍼티 단건 GET → 이슈 GET `properties=movesRms.policy,movesRms.issue`(호출 수 같음) |
| `src/resolver/worklogControl/WorklogControlCtl.js` | `ch` 칸, 삭제 조건, `ctlRev` 올림 |
| `src/resolver/worklog/WorklogService.js`, `WorklogController.js` | 쓰기 경로 이슈 조회에 properties 얹기, `getLinkedIssueOverview` |
| `src/resolver/worklogPolicy/*`, `src/domain/worklogPolicy/merge.js` | §5.4 (2), §6.2 |
| `src/resolver/timesheet/TimesheetRouting.js`, `TeamScope.js`, `src/resolver/workforce/WorkforceOrgSource.js`, `TimesheetService.js` | 연동 모드 워크포스 전용, 역조회, 대조, 스냅샷 |
| `src/resolver/settings/SettingsRepository.js`, `SettingsService.js` | `linkedInputChannel` |
| `src/utils/errors/ErrorCodes.js` | `TIMESHEET_WORKFORCE_TEAM_MISSING` |
| `src/permission/PermissionMap.js`, `src/index.js` | 신규 1·삭제 1 |

### 11.2 CAS·동시성

- `workforce_inbound` 쓰기: 기존 `rev = rev + 1` CAS. 두 쓰기 경로가 같은 문서를 동시에 받으면 한쪽만 이긴다. 감사는 결정적 id 라 양쪽이 써도 한 줄이다(§5.3.3).
- CAS 에 지면 저장본을 다시 읽어 §5.3.1 표를 다시 적용한다(최대 2회). 저장에 성공한 행으로 판정하고, 2회 모두 실패하면 쓰기·제출은 `LINKED_SETTING_PERSIST_FAILED`, 미리보기·탭은 `settingUnresolved` 경고(§5.3.3).
- 결재자 행(`approval_approver`)은 바꾸지 않는다. 결재선은 제출 때 굳힌다(불변식 2·5 무관).

### 11.3 트리거·스윕

- 새 스케줄·새 큐 작업 없음. `approval.ctl` 재게시는 기존 일일 `workforce` 작업의 `drainCtl` 이 한다.
- 워크로그 이벤트 트리거는 §5.7 사후 관찰만 한다. 이슈 신호 갱신과 같은 asApp GET 에 `movesRms.issue` 를 얹어 받고(§5.1), 관찰 실패는 삼킨다(핫패스 throw 금지 규칙 그대로). 처음 설계의 "이벤트는 `rms.issue` 를 읽지 않는다"는 철회한다(검증 P1-11 이 지적한 모순).

## 12. 스키마·마이그레이션

| 이름 | 내용 |
|---|---|
| `v064_alter_worklog_policy_issue_override_retired` | `retired_at TIMESTAMP NULL` |
| `v065_retire_worklog_policy_issue_override` | `UPDATE … SET retired_at = CURRENT_TIMESTAMP WHERE retired_at IS NULL` |
| `v066_delete_worklog_policy_feature_issue` | `DELETE … WHERE scope_kind='ISSUE'` |

- 새 테이블 없음. `workforce_inbound.typ VARCHAR(16)` 에 `rms.issue`(9자)·`rms.kb` 가 들어간다.
- 개인정보: `workforce_inbound.body_json` 에 `by`(accountId)가 생긴다. 이미 `rms.org` 본문이 accountId 를 담고 있으므로 원천 목록에 이 테이블이 있는지 확인하고, 없으면 JSON 원천으로 추가한다(`src/trigger/__test__/idleSqlBudget.test.js:252-253` 의 65·67 이 바뀔 수 있다).
- 워크포스: 마이그레이션 없음, KVS 스키마 변경 없음.

## 13. Jira 연결·asApp 사유

**이 표의 asApp 은 전부 "현행 규칙 안"이 아니라 규칙 확장이다(검증 P1-11, 동의).** 해당 AGENTS 문구 변경을 각 단계의 **선행 조건**으로 둔다(§17). 승인 앱 공유 `IssueSignalRefresher` 는 USER·APP 두 모드를 이미 가지므로(`src/resolver/worklogControl/IssueSignalRefresher.js:39`), 호출자가 모드를 고르는 지금 구조를 유지하되 아래 표대로 용도를 나눈다.

| 앱 | 자격 | 호출자 | REST | 읽는·쓰는 칸 | 용도 | 사유·AGENTS |
|---|---|---|---|---|---|---|
| 승인 | asUser | 작업 로그 탭·전역 페이지·쓰기 resolver 의 조회자 | `GET /rest/api/3/issue/{id}?fields=project,timeoriginalestimate,timespent&properties=movesRms.policy,movesRms.issue` | 연동 신호·설정·계획·소요 | 판정·표시 | 변경 없음(보안 절 5번 "화면은 asUser"에 `movesRms.issue` 추가) |
| 승인 | asUser | 같음 | `GET /rest/api/3/project/{id}/properties/movesRms.kb` | 환산 기준 | 표시 | 같음 |
| 승인 | **asApp** | 워크로그 이벤트 트리거(`WorklogControlDetector` → Refresher APP) | `GET /rest/api/3/issue/{id}?fields=project&properties=movesRms.policy,movesRms.issue` | 연동 신호·설정 | 수신 저장·§5.7 관찰. 사용자에게 돌려주지 않음 | 기존 사유 `worklog-control-trigger` — 보안 절 5번 "워크로그 이벤트 경로만 asApp" 문장에 `movesRms.issue` 를 더하는 **문구 변경 필요** |
| 승인 | asUser(호출 관리자) | 설정 › 워크포스 연동 "다시 읽기" | `GET /rest/api/3/user/properties/movesRms.org?accountId=` ≤50명 | org 팀 칸 | TeamScope·결재선 캐시 | 현행은 "DELETE 관문 판정에만" 쓴다고 제한(보안 절 5번) — 용도를 "결재선·팀장 범위"로 넓히는 **문구 변경 필요** |
| 워크포스 | asApp | `saveIssueApprovalSettings`, withdraw, 일괄 게시 | `PUT/GET /rest/api/3/issue/{id}/properties/movesRms.issue` | 설정 문서 | 게시·쓰기 뒤 대조 | ⑧ "게시"는 지금 `movesRms.policy` 만 허용(WF:`AGENTS.md:57`) → **⑧ 확장 필요** |
| 워크포스 | asApp | 설정 저장·일괄 게시·이슈 탭 갱신 | `PUT/GET /rest/api/3/project/{id}/properties/movesRms.kb` | 환산 기준 | 게시 | **⑧ 확장 필요** |
| 워크포스 | asUser | 본인 접속 | `PUT /rest/api/3/user/properties/movesRms.org?accountId=본인` | 본인 org(팀 칸 포함) | 게시 | 현행 그대로(본인 asUser) |
| 워크포스 | asApp | 팀·소속 변경 저장, `publishOrgDocs` | `PUT/GET /rest/api/3/user/properties/movesRms.org?accountId=남` | 남의 org | 게시·rev 취득(GET 후 `max(now, rev+1)`)·쓰기 뒤 대조 | **G1 통과 시에만** ⑧ 확장. 인가: 호출 resolver 가 팀 관리 권한(`W('TEAM')` 류) 가드를 통과해야 하고, 쓰는 대상은 그 변경으로 간선이 바뀐 사람으로 서버가 계산한다(payload 의 사람 목록을 받지 않는다). 실패는 건별 결과로 돌려주고 `publishOrgDocs` 로 복구 |
| 워크포스 | asUser(Jira 관리자) | G1 실패 시 관리자 "인원 구조 게시" | 위와 같음 | 남의 org | 후퇴 경로 | 현행 asUser 범위 — 관리자가 아니면 403 을 건별 결과로 |

승인 앱 manifest·scope 변경 없음. 워크포스 scope 는 G1 에서 남의 사용자 프로퍼티 쓰기에 추가 scope 가 필요한지 확인한다(필요하면 `forge install --upgrade`).

## 14. 프론트·i18n

### 14.1 승인 앱

| 파일 | 내용 |
|---|---|
| `features/worklog/LinkedWorklogPanel.jsx` 신규 | 요약·KPI·폼 묶음 |
| `features/worklog/LinkedKpiCards.jsx`, `LinkedWorklogForm.jsx`, `LinkedSettingSummary.jsx` 신규 | |
| `features/worklog/timeRange.js`, `linkedKpiView.js` 신규 | 순수 |
| `features/worklog/WorklogCreateHandoffPage.jsx` 신규, `handoffPath.js`, `entries/inbox.jsx` | 새 작성 경로 |
| `features/worklog/WorklogTab.jsx` | `layout` 분기, 작성 버튼 조건에서 `!workforceChannel` 삭제(`:233`, `:291`), 연동 안내 문구 교체(`:253-255`) |
| `features/worklog/WorklogDialog.jsx` | 생성 모드 연동 안내(`:165-170`) 삭제 |
| 이슈 패널(`entries/issue.jsx` 아래 구성) | 연동 이슈 "작업 시간 기록" 줄 |
| `features/worklogPolicy/WorklogPolicyPanel.jsx` | 이슈 범위 삭제 |
| `features/settings/WorkforceLinkSettings.jsx` | 인원 구조 카드, `linkedInputChannel` 토글 |
| `features/settings/TimesheetTeamSettings.jsx` | 연동 모드 읽기 전용 |
| `features/audit/*` | `linkedIssueSetting` 라벨·상세 |

- 쿼리키(`static/ui/src/utils/queryKey/approvalKeys.js`): `worklogKeys.linkedOverview(issueId)`, `worklogControlKeys.createHandoff(issueId)`. 작성 성공 시 무효화 목록(`WorklogDialog.jsx:111` 과 같은 자리)에 `linkedOverview` 추가.
- 새 엔트리 없음(전역 페이지·작업 로그·이슈 엔트리 재사용) — 엔트리 3곳 수정 없음. lazy 로드는 `importWithReloadOnce`. 높이는 내용이 정한다(100vh 금지).

### 14.2 승인 앱 i18n (kr / en, `npm run merge`)

| 키 | kr | en |
|---|---|---|
| `worklog.linked.summary.window` | 작성 기간 {start} ~ {end} | Entry period {start} – {end} |
| `worklog.linked.summary.windowOpen` | 작성 기간 제한 없음 | No entry period limit |
| `worklog.linked.summary.preapproval.REQUIRED` | 사전 승인 필요 | Pre-approval required |
| `worklog.linked.summary.preapproval.NOT_REQUIRED` | 사전 승인 불필요 | No pre-approval |
| `worklog.linked.summary.preapproval.DEFAULT` | 사전 승인은 기본 설정을 따릅니다 | Pre-approval follows the default |
| `worklog.linked.summary.source` | 워크포스 팀장 {name} · {date} 설정 | Set by Workforce team lead {name} · {date} |
| `worklog.linked.summary.stale` | 최신 설정을 확인하지 못해 마지막으로 확인한 값을 씁니다 | Could not check the latest setting; using the last confirmed one |
| `worklog.kpi.planned` / `spent` / `mine` / `progress` | 계획 작업량 / 투입 공수 / 내 몫 / 진행률 | Planned / Spent / Mine / Progress |
| `worklog.kpi.unit.mm` / `unit.md` | MM / MD | MM / MD |
| `worklog.kpi.none` | — | — |
| `worklog.kpi.noBasis` | 환산 기준이 없어 MM 을 표시하지 않습니다 | No conversion basis, MM not shown |
| `worklog.kpi.approximate` | 기록이 많아 근사치입니다 | Approximate (many entries) |
| `worklog.form.startTime` / `endTime` / `duration` | 시작 / 종료 / 소요 | Start / End / Duration |
| `worklog.form.endBeforeStart` | 종료 시간이 시작 시간보다 늦어야 합니다 | End time must be after start time |
| `worklog.form.record` / `requestApproval` | 기록 / 승인 요청 | Log / Request approval |
| `worklog.form.savedContinue` | 기록했습니다. 이어서 입력할 수 있습니다 | Logged. You can keep entering |
| `worklog.handoff.create.title` | 작업 시간 기록 | Log time |
| `worklog.handoff.create.back` | 이슈로 돌아가기 | Back to issue |
| `worklog.issueEntry` | 작업 시간 기록 | Log time |
| `error.TIMESHEET_WORKFORCE_TEAM_MISSING` | 워크포스에 팀 정보가 없어 결재자를 정할 수 없습니다. 워크포스 관리자에게 문의하세요 | No Workforce team found, so no approver can be set. Contact your Workforce admin |
| `audit.area.linkedIssueSetting` | 워크포스 이슈 설정 | Workforce issue setting |
| `audit.linkedIssueSetting.received` | {issue} 작성 기간 {from} → {to}, 사전 승인 {paFrom} → {paTo} | {issue} entry period {from} → {to}, pre-approval {paFrom} → {paTo} |
| `worklog.linked.violation.LINKED_WINDOW` / `LINKED_PREAPPROVAL` | 작성 기간 밖에 기록됨 / 사전 승인 없이 기록됨 | Logged outside entry period / Logged without pre-approval |
| `worklog.linked.diverged` | 워크포스 화면 값과 적용 값이 다릅니다. 팀장이 다시 저장하면 맞춰집니다 | The Workforce value differs from the applied one. Saving again from Workforce fixes it |
| `timesheet.selfApproval` | 본인 결재(상위 팀장 없음) | Self-approved (no higher team lead) |
| `workforce.inputChannel.directSinceApp` | 승인 앱 창구로 바꾼 뒤 워크포스에서 직접 기록된 연동 이슈 기록 {n}건(최근 7일) — 워크포스 버전을 확인하세요 | {n} linked entries logged directly in Workforce since switching (last 7 days) — check the Workforce version |
| `workforce.org.card.*` | 인원 구조 · 검증된 문서 {n} · 팀장 {n} · 팀 정보 없음 {n} · 불일치 {n} | Team structure · … |
| `workforce.inputChannel.label` / `.APP` / `.WORKFORCE` | 연동 이슈 작성 창구 / 승인 앱 / 워크포스(이전 방식) | Linked issue entry channel / Approval app / Workforce (legacy) |
| `settings.timesheetTeam.linkedReadOnly` | 연동 모드에서는 워크포스 팀 구조를 씁니다. 이 명부는 보관만 됩니다 | In linked mode the Workforce team structure is used. This roster is kept but not used |
| `policySource.LINKED_ISSUE` | 워크포스 이슈 설정 | Workforce issue setting |
| `policySource.JIRA_ISSUE`(유지, 문구만 변경) | 이슈 재정의(폐지됨) | Issue override (retired) |
| `data.retiredOverride.*` | 폐지된 이슈 재정의 {n}건 · 내보내기 | Retired issue overrides: {n} · Export |

### 14.3 워크포스

| 파일 | 내용 |
|---|---|
| `pages/projectDetail/work/ProjectWorkPanel.jsx` | `view=approval` |
| `pages/projectDetail/issue/IssueApprovalSettingTable.jsx`, `IssueApprovalBulkModal.jsx`, `approvalBulk.js` 신규 | 표·일괄 |
| `panel/PanelWorklogForm.jsx`, `panel/PanelApp.jsx` | 연동 이슈 넘김 |
| `pages/myWork/modal/WorklogModal.jsx` | 단건 저장 넘김, 범위 모드 끔 |
| `panel/panelApproval.js` | 새 작성 경로, 오류 문구 매핑(`:37-42` 옆) |
| `locales/kr|en/issueApprovalSetting.json` 신규 | `view.label` 승인 설정 · `column.window` 작성 기간 · `column.preapproval` 사전 승인 · `preapproval.REQUIRED/NOT_REQUIRED/DEFAULT` 필요/불필요/기본 따름 · `bulk.*` · `state.SET/NONE/UNVERIFIED` 설정됨/없음/서명 확인 불가 · `result.*` · `notTeamLead` 팀장만 고칠 수 있습니다 |
| `locales/kr|en/issuePanel.json` | `approval.createHandoff` 승인 앱에서 기록 · `approval.error.unconfirmed` 승인 앱 연동을 확인하지 못했습니다. 잠시 뒤 다시 시도하세요 · `approval.error.approvalAppRequired` 이 작업은 사전 승인이 필요해 승인 앱에서만 기록할 수 있습니다 · `approval.rangeDisabled` 연동 이슈는 승인 앱에서 하루씩 기록합니다 |

## 15. 용량·호출량·유휴 SQL

**행·바이트(200명, 연동 이슈 5,000건 가정)**
- 승인 앱 `workforce_inbound`: `rms.issue` 5,000행 × 약 0.6KB = 3MB, `rms.kb` 프로젝트 수(≈50) × 10KB = 0.5MB, `rms.org` 200행(기존).
- 감사 `approval_settings_audit`: 설정 변경 연 1만 건 × 0.5KB = 5MB.
- Jira 프로퍼티: 이슈 5,000 × 0.4KB, 프로젝트 50 × 10KB, 사용자 200 × ≤30KB.
- 워크포스 DB: 0.

**resolver 1회당 Jira 호출**

| 경로 | 호출 |
|---|---|
| 승인 앱 작성·수정·삭제 | 기존 + 0(이슈 조회에 properties 얹기). 얹을 수 없는 경로면 +1 |
| 승인 앱 `getLinkedIssueOverview` | 이슈 GET 1 + 프로젝트 kb GET(프로젝트당 하루 1회) |
| 워크포스 `listIssueApprovalSettings` | JQL 1(100건, properties 포함) |
| 워크포스 `saveIssueApprovalSettings`(50건) | JQL 1 + PUT 50(동시 5) + kb 최대 2 |
| 워크포스 생성 넘김 판정 | 기존과 같음(이미 ctl 을 읽는다, WF:`IssueWorklogControlService.js:238-245`) |
| 팀 저장 → org 게시 | 영향 인원 수만큼 PUT(팀 이동 1명 = 본인 + 옛·새 팀장 = 3) |

**SQL 비용 — 유휴와 활성을 나눠 적는다(검증 P2-12, 동의)**

① 유휴(사용자 0명·이벤트 0건, 스케줄만 도는 하루)
- 새 스케줄·큐 없음. 읽기는 모두 resolver·이벤트 경로.
- `drainCtl` 대상 수는 `rms.policy` 검증 행 수 그대로(`WorklogControlCtl.js:33-45`). 삭제 조건만 바뀌어 "삭제 대신 유지"가 된다. 단 **내용이 같아도 `markPublished` 를 부르는** 현재 동작(`src/resolver/workforce/WorkforcePublisher.js:535`)은 이번 변경과 무관하게 이미 있는 비용이고, 유지되는 문서 수가 늘면 그만큼 늘 수 있다 → 일일 `workforce` 작업은 지금도 "할 일 없음이면 13회" 상한 안에서 돈다(`idleSqlBudget.test.js:145-153`). `ch` 로 유지되는 문서가 늘어도 그 상한을 넘지 않는지 테스트로 고정한다(대상이 있는 무접속 설치 = 아래 ③).
- 하루 합계: **빈 설치** 미연동 27, 연동 38 그대로(`idleSqlBudget.test.js:257-296`). 테스트 추가: `linkedInputChannel=APP` 이어도 같은 수.

② 활성 경로의 **추가** 비용(준비된 스키마·KVS 스키마 마커 있음·무경합 기준. 기존 정책 쿼리·프로브·실패 로그·CAS 재시도는 제외)

| 경로 | 지금 | 추가 |
|---|---|---|
| 쓰기(작성·수정·삭제)에서 설정 변화 없음 | 기존 | SELECT 0(기존 `findInboundMany` 에 typ 를 더해 같은 1회), 쓰기 0(1시간 안), 1시간 지났으면 touch UPDATE 1 |
| 쓰기에서 설정 최초 수신 | 기존 | INSERT 1 + 감사 INSERT 1 |
| 쓰기에서 설정 변경 수신 | 기존 | UPDATE 1 + 감사 INSERT 1 |
| 작업 로그 탭 조회 | 기존 | `getLinkedIssueOverview`: SELECT 1(`rms.issue`·`rms.kb` 한 번에) + 위와 같은 수신 비용 |
| 이벤트(표식 있음, 같은 이슈 1시간 안) | 신호 갱신 관문: 미수신 설치 SELECT 1, 신선한 행 SQL 2(`IssueSignalRefresher.js:18-19`) | 관찰 판정 SELECT 0~1(사전 승인 필요 이슈만 `appliedEntryFor` 1회), 위반 시 로그 INSERT 1 |
| 이벤트(표식 없음) | 기존 | 0 |
| 작업 로그 탭 목록(사전 승인 필요 연동 이슈) | 기존 | 행 배지용 `appliedEntryFor` SELECT 1(그 페이지 worklog id IN) |
| 타임시트 제출·미리보기 | 기존 | Jira +0(기존 검색에 properties 얹음), 설정 SELECT 0(기존 `workforceRows` 에 typ 추가), 바뀐 이슈마다 감사 1 + 쓰기 1, 사전 승인 대조 SELECT 1(사전 승인 필요 이슈가 있을 때만) |
| 정책 판정 1회 | `repo.issues()` SELECT 1 | **−1**(이슈 재정의 제거, §6) |

③ 데이터는 있으나 접속이 없는 설치(검증된 `rms.policy` 대상 N건, 사용자 접속 0) — **빈 설치 27/38 과 별개 항목**(2회차 P2-12)
- 스케줄은 `rms.issue`·`rms.kb` 를 읽지 않는다(추가 0).
- 일일 `workforce` 작업의 `drainCtl` 은 지금도 대상(검증된 `rms.policy` P:·I: 행, `WorklogControlCtl.js:33-45`)마다 본문을 만들고, 내용이 같아도 `markPublished` 를 부른다(`WorkforcePublisher.js:535`). 그래서 이 설치의 하루 SQL 은 `빈 설치 상한 + c × N` 꼴이다(c = 대상당 기존 비용). **이번 변경은 N 을 늘리지 않는다** — 대상 집합은 `rms.policy` 검증 행 그대로이고, 바뀌는 것은 대상별 "삭제 대신 유지" 뿐이다. 테스트는 두 개로 나눈다: 빈 설치 27/38 불변(기존), "N=3·변화 없음" 설치에서 `linkedInputChannel` 이 WORKFORCE 일 때와 APP 일 때 쿼리 수가 같음(신규).
- 관찰 표식(`approval:linkedSetting:any`)이 있어도 이벤트 0건이면 SQL 0.

---

## 16. 미검증·실측 관문

| # | 무엇 | 왜 필요한가 | 확인 방법(배포 후) | 안 되면 |
|---|---|---|---|---|
| G1 | 워크포스 앱이 **asApp 으로 다른 사용자의** `movesRms.org` 를 쓸 수 있나 | 팀원이 접속하지 않아도 구조가 들어간다 | 개발 사이트에서 관리자 아닌 사용자 A 의 팀을 바꾸고, Jira REST `GET /rest/api/3/user/properties/movesRms.org?accountId=A`(관리자 계정)로 값·서명 확인 | §8.3 후퇴(본인 접속 + 관리자 asUser 게시) |
| G2 | 승인 앱이 asUser 이슈 GET 의 `properties=movesRms.issue` 로 **다른 앱이 쓴** 이슈 프로퍼티를 받나 | 쓰기 경로 추가 호출 0 | 작업 로그 탭 `getLinkedIssueOverview` 응답의 `setting` 이 채워지는지 | 프로퍼티 단건 GET(+1) — 지금 `IssueSignalRefresher` 가 쓰는 방식 |
| G3 | 일반 사용자가 asUser 로 프로젝트 프로퍼티 `movesRms.kb` 를 읽나 | KPI MM 표시 | 개발자 아닌 계정으로 탭을 열어 MM 이 보이는지 | 이슈 문서에 `dm` 만 싣고 MM 은 "—" |
| G4 | 연동 이슈 작성 기간·사전 승인이 실제로 판정에 걸리나(§6 의 선행 조건) | 재정의 제거 순서 | 작업관리에서 기간 지정 → 승인 앱에서 기간 밖 날짜 작성 거부, 사전 승인 필요 시 "승인 요청" 버튼 | §6 배포 보류 |
| G5 | 전역 페이지 하위 경로 `/worklog/{id}/new/{date}` 로 **다른 앱에서** `router.navigate` 해 들어오나 | 생성 넘김 | 워크포스 패널 "승인 앱에서 기록" 클릭 → 날짜가 채워진 화면 | 기존 G-HANDOFF 와 같은 문제 — 전역 페이지 첫 화면 + 이슈 검색으로 후퇴 |
| G6 | Jira `timespent` 에 제한 공개(visibility) 워크로그가 포함되나 | 투입 카드가 숨긴 기록을 빠뜨리지 않는지 | 통제로 숨긴 기록이 있는 이슈에서 `timespent` 와 전체 합 비교 | 투입을 승인 앱 집계로 계산(조회자 범위 주의 — 불변식 8 예외 ⑥) |
| G7 | 앱이 "시간 추적 제공자로 선택됐는지" 알 수 있나 | 이슈 패널 "작업 시간 기록" 줄을 제공자 선택 사이트에서 숨김 | `GET /rest/api/3/configuration/timetracking` 를 asUser·asApp 으로 호출해 응답·권한 확인 | 줄을 늘 보인다(해 없음) |
| G8 | displayConditions `timeTrackingProviderEnabled`(기존 P3) | 미선택 사이트에서 탭이 숨는지 | 기존 관문 | 기존 설명대로 |
| G9 | `approval.ctl` 의 `ch` 가 워크포스에서 검증되고 넘김이 실제로 일어나나 | 구멍 H1 | 승인 앱 `linkedInputChannel=APP` → 일일 작업 1회 → 워크포스 패널에서 넘김 | 기본값 `WORKFORCE` 유지 |
| G10 | 팀장 문서 30,000자 예산 | 큰 팀 | 실제 최대 팀 인원으로 문서 크기 측정 | `ORG_TOO_LARGE` 진단, 팀원 문서 경로만 사용 |
| G11 | 신·구 버전 조합(§17.1 표) | 배포 순서가 실제로 안전한가 | 개발 사이트에서 구버전 워크포스 + 새 승인 앱 APP → 직접 작성이 그대로 되고 설정 › 워크포스 연동의 "APP 이후 워크포스 직접 기록" 건수가 올라가는지, 새 워크포스 + 구버전 승인 앱(`rx` 없음) → 승인 설정 보기가 숨는지 | 경고 문구·건수 조건 재검토 |
| G12 | 사후 관찰이 Jira 기본 Log work·REST 작성을 실제로 잡는가 | §5.7 보장 | 제공자 미선택 사이트에서 기간 밖 날짜로 기본 Log work → 작업 로그 탭 배지·타임시트 제출 위반 확인 | 관찰 조건 재검토 |
| G13 | 사전 승인 DB 대조가 실제 적용 결과와 맞나 | §5.7 N1 | 사전 승인 받아 만든 기록 → 배지 없음, 같은 표식을 다른 기록에 복사 → `LINKED_PREAPPROVAL`, 승인 뒤 날짜를 Jira 에서 바꿈 → `LINKED_PREAPPROVAL` | 대조 조건 재검토 |

---

## 17. 단계별 작업 — 코덱스 작업 지시 단위 (최종)

> 각 행이 코덱스 한 번의 작업 지시다. 크기: S = 파일 3~5개·반나절, M = 파일 6~12개·하루. 무인 회차는 `forge`·`git add/commit/push` 를 하지 않는다. 위임 설정은 메모리 규칙대로(gpt-6.1-sol + medium). 모든 승인 앱 단계는 끝에 `npm test` 전체와 `npm run check:bundle` 을, 워크포스 단계는 `npm test` 전체를 돌린다(아래 "실행할 테스트"는 그 전에 먼저 돌릴 대상).
> 공통 명령 — 승인 앱(`C:\CloudJira\moves-approval-jira`): `npm test -- <경로>`, `npm run test:ui -- <경로>`, `npm run build:ui`, `npm run merge`, `npm run check:bundle`. 워크포스(`C:\CloudJira\moves-workforce`): `npm test -- <경로>`, `npm --prefix static/ui test -- <경로>`, `npm --prefix static/ui run merge`, `npm --prefix static/ui run build`.

### 17.0 작업 지시

**W-1 계약 확장** · 두 리포 · S · 선행 없음
- 파일: 두 리포 `contract.js`·`vectors.json`(승인 앱 `src/integration/workforce/`, 워크포스 `src/integration/approval/`), 워크포스 `src/integration/approval/__test__/vectors.test.js`(지문 표·원본 대조 `Buffer.equals`), 두 리포 `.gitattributes`(7파일 `eol=lf`).
- 내용: §3.2·§3.3·§3.4·§3.6 — `rms.issue`·`rms.kb` typ, `approval.ctl` 의 `ch:'APP'|'WORKFORCE'`·`rx`, 날짜 검사.
- 완료: 두 리포 7파일 raw byte 동일, 골든 4건(issue 값/전부 null, kb, ctl+ch·rx) 통과.
- 테스트: 승인 앱 `npm test -- src/integration/workforce` · 워크포스 `npm test -- src/integration/approval`.

**A-2a 승인 앱 수신·저장** · 승인 앱 · M · 선행 W-1
- 파일: `src/resolver/workforce/LinkedIssueSettingSource.js`(신규), `WorkforceInbound.js`, `WorkforceLinkRepository.js`, `src/domain/linkedIssue/setting.js`(신규 — `stricterSetting`·누적), `src/resolver/worklogControl/IssueSignalRefresher.js`, `src/resolver/worklogPolicy/WorklogPolicyAuthority.js`·`WorklogPolicyService.js`(refresh typ), `src/resolver/personalData/PersonalDataRepository.js`(`purgeCache` 제외·`by` 지움), `src/resolver/settings/SettingsAuditRepository.js`(결정적 id).
- 내용: §5.1~§5.3(기존 rev 규칙, 1시간 쓰기 생략, `DIVERGED`·`conflictLimit` 누적, 감사 선기록, 저장 실패 계약, 철회 kid 제외, 해제 `released`).
- 완료: §18 A1~A8, A2'·A3'·A5'·A28'·A48·A48'·A48''·A49·A51 통과, `idleSqlBudget` 27·38 불변.
- 테스트: `npm test -- src/resolver/workforce src/domain/linkedIssue src/resolver/worklogControl/__test__/IssueSignalRefresher.test.js src/resolver/personalData src/trigger/__test__/idleSqlBudget.test.js`.

**A-2b 승인 앱 판정 연결** · 승인 앱 · M · 선행 A-2a
- 파일: `src/resolver/worklogControl/WorklogControlContext.js`(`windowEnforced`), `src/resolver/worklog/WorklogService.js`(호출부 3곳·properties 얹기·에러 cause), `src/domain/worklogPolicy/merge.js`(`LINKED_ISSUE` 층, `JIRA_ISSUE` 는 아직 유지), `src/resolver/worklogPolicy/WorklogPolicyResolver.js`, `src/resolver/worklogApproval/WorklogApprovalPolicy.js`(required 내리기)·`WorklogApprovalService.js`(`open()` 3지점·사이트 타임존), `src/utils/errors/ErrorCodes.js`(`LINKED_SETTING_PERSIST_FAILED`).
- 완료: A9~A16, A9'~A9''', A13'·A14' 통과.
- 테스트: `npm test -- src/resolver/worklog src/resolver/worklogControl src/domain/worklogPolicy src/resolver/worklogPolicy src/resolver/worklogApproval src/domain/worklogControl`.

**A-2c 승인 앱 overview·ctl** · 승인 앱 · M · 선행 A-2b
- 파일: `src/resolver/worklog/WorklogController.js`·`WorklogService.js`(`getLinkedIssueOverview`), `src/permission/PermissionMap.js`, `src/index.js`(등록 확인), `src/domain/linkedIssue/kpi.js`·`workday.js`(신규), `src/resolver/worklogControl/WorklogControlCtl.js`(`ch` 항상·`rx`·게시 조건·**키셋 커서·`bodyFor` PK**), `src/resolver/workforce/WorkforcePublisher.js`(`drainCtl` 이어받기·`ctlRev`), `src/resolver/settings/SettingsRepository.js`·`SettingsService.js`(`linkedInputChannel`).
- 완료: A17~A22, A43, A47, permissionMap 계약 테스트, `SettingsPolicyKeys` 테스트.
- 테스트: `npm test -- src/domain/linkedIssue src/resolver/worklogControl src/resolver/workforce src/resolver/settings test/permission` · `npm run check:bundle`.

**A-2d 승인 앱 DB 대조·제출 재조회** · 승인 앱 · M · 선행 A-2c
- 파일: `src/domain/linkedIssue/violation.js`(신규 `linkedViolationOf`), `src/resolver/worklogApproval/WorklogApprovalRepository.js`(`appliedEntryFor`), `src/resolver/timesheet/WorklogCollector.js`(검색에 properties)·`TimesheetService.js`(재조회·위반·`TIMESHEET_LINKED_SETTING_UNRESOLVED`), `src/resolver/worklog/WorklogService.js`(목록 `linkedViolation`), `src/resolver/worklogControl/WorklogControlDetector.js`(`wants` 표식·관찰 로그·`LINKED_DIRECT_WF`), `AGENTS.md` 보안 절 5번 문구.
- 완료: A37~A40, A42, A44, A50 통과.
- 테스트: `npm test -- src/domain/linkedIssue src/resolver/timesheet src/resolver/worklogApproval src/resolver/worklogControl src/trigger/__test__/idleSqlBudget.test.js`.

**W-3 워크포스 설정 백엔드** · 워크포스 · M · 선행 W-1
- 파일: `src/permission/TeamLeadAuthority.js`(신규, 직속 `leadProjectIds`), `src/permission/permissionGuard.js`(`projectTargets`), `src/permission/TeamLeadFieldPolicy.js`(allowlist), `src/permission/PermissionMap.js`, `src/index.js`, `src/resolver/approvalLink/IssueApprovalSettingService.js`·`Controller`(신규 list/save), `src/resolver/approvalLink/IssueMembership.js`(일괄판), `src/integration/approval/issueSetting.js`·`kbDoc.js`(신규), `src/resolver/approvalLink/ApprovalLinkSignals.js`(해제·재연결 순서, kb), `ApprovalLinkAdminService.js`(재서명·kb), `manifest.yml`(`settings` 엔티티에 `approvalLinkMode`), 설정 resolver, `AGENTS.md` ⑧.
- 완료: W1~W10, W2'·W6'·W9'·W29·W32 통과.
- 테스트: `npm test -- src/permission src/resolver/approvalLink src/integration/approval`.

**W-4 워크포스 설정 화면** · 워크포스 · M · 선행 W-3
- 파일: `static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx`, `static/ui/src/pages/projectDetail/issue/IssueApprovalSettingTable.jsx`·`IssueApprovalBulkModal.jsx`·`approvalBulk.js`(신규), 설정 화면(스위치), `static/ui/src/utils/queryKey/`, `locales/kr|en/issueApprovalSetting.json`(신규).
- 완료: W11~W15 통과, 빌드 성공.
- 테스트: `npm --prefix static/ui test -- src/pages/projectDetail` · `npm --prefix static/ui run merge` · `npm --prefix static/ui run build`.

**A-5 승인 앱 화면** · 승인 앱 · M · 선행 A-2d
- 파일: `static/ui/src/features/worklog/LinkedWorklogPanel.jsx`·`LinkedKpiCards.jsx`·`LinkedWorklogForm.jsx`·`LinkedSettingSummary.jsx`·`WorklogCreateHandoffPage.jsx`·`timeRange.js`·`linkedKpiView.js`(신규), `WorklogTab.jsx`, `WorklogDialog.jsx`, `handoffPath.js`, `static/ui/src/entries/inbox.jsx`, 이슈 패널, `features/settings/WorkforceLinkSettings.jsx`, `features/audit/*`, `utils/queryKey/approvalKeys.js`, `locales/kr|en/*.json`.
- 완료: F1~F10 통과, `npm run build:ui` 성공.
- 테스트: `npm run test:ui -- src/features/worklog src/features/settings src/features/audit` · `npm run merge` · `npm run build:ui` · `npm run check:bundle`.

**W-6 워크포스 생성 넘김** · 워크포스 · S · 선행 W-3
- 파일: `static/ui/src/components/worklog/createChannel.js`(신규), `src/resolver/approvalLink/ApprovalControlLookup.js`(`ch`·`rx` 옮기기)·`IssueWorklogControlService.js`(서버 판정·거부 코드), `src/integration/approval/controlDoc.js`, `static/ui/src/panel/PanelWorklogForm.jsx`·`PanelApp.jsx`·`panelApproval.js`, `static/ui/src/pages/myWork/modal/WorklogModal.jsx`, `locales/kr|en/issuePanel.json`.
- 완료: W16~W21, W16'·W21' 통과.
- 테스트: `npm test -- src/resolver/approvalLink src/integration/approval` · `npm --prefix static/ui test -- src/panel src/pages/myWork src/components/worklog`.

**사람: 배포·실측** · 선행 A-2a~A-2d, A-5, W-1, W-3, W-4, W-6 — §16 G2·G3·G4·G5·G9·G11·G12·G13.

**A-7 이슈 재정의 제거** · 승인 앱 · S · 선행 실측 G4
- 파일: `src/domain/worklogPolicy/merge.js`, `src/resolver/worklogPolicy/*`, `src/permission/PermissionMap.js`, `src/rdb/schema/ddl/worklogPolicy.sql.js`·`migrate.js`(v064~v066), `src/rdb/schema/__test__/migrate.test.js`, `static/ui/src/features/worklogPolicy/WorklogPolicyPanel.jsx`·테스트, 데이터 관리 내보내기, `locales`.
- 완료: A23~A28, permissionMap 계약 테스트, 마이그레이션 이름 목록 테스트.
- 테스트: `npm test -- src/domain/worklogPolicy src/resolver/worklogPolicy src/rdb test/permission` · `npm run test:ui -- src/features/worklogPolicy` · `npm run check:bundle`.

**W-8a 워크포스 org 게시** · 워크포스 · M · 선행 W-3, 실측 G1
- 파일: `src/permission/TeamLeadAuthority.js`(`approvalEdges`), `src/integration/approval/orgCap.js`(팀 칸), `src/resolver/approvalLink/ApprovalLinkSignals.js`(본인 접속 자기 확인·7일 재서명), `publishOrgDocs` resolver·PermissionMap, 팀·사용자 저장 경로 훅(`src/resolver/backoffice/team/*`, 사용자 소속 저장), (G1 통과 시) 기존 일일 스케줄 작업.
- 완료: W22~W28, W30 통과.
- 테스트: `npm test -- src/permission src/integration/approval src/resolver/approvalLink src/resolver/backoffice/team`.

**A-8b 승인 앱 연동 모드 구조·본인 결재** · 승인 앱 · M · 선행 A-2d, W-8a 배포
- 파일: `src/resolver/timesheet/TimesheetRouting.js`(`workforceTeamSource` 단일 기준·본인 결재), `TeamScope.js`(교집합·30일·24시간), `src/resolver/workforce/WorkforceOrgSource.js`·`WorkforceInbound.js`(역조회·30일), `src/domain/worklogCertification/authority.js`(공용 `selfApprovalAllowed` 추출), `TimesheetService.js`(`link_json`·`selfApproval`), 결재 이력·증명서 라벨, `src/resolver/settings/*`(`workforceTeamSource`), `static/ui/src/features/settings/TimesheetTeamSettings.jsx`·`WorkforceLinkSettings.jsx`, `locales`.
- 완료: A29~A36, A30'·A30''·A45·A46·A52·A53, F11~F12 통과.
- 테스트: `npm test -- src/resolver/timesheet src/resolver/workforce src/domain/worklogCertification src/resolver/worklogCert` · `npm run test:ui -- src/features/settings` · `npm run check:bundle`.

**(범위 밖) 기간 일괄 입력 이전** — 별도 slug `linked-range-input`(§7.6).

### 17.0.1 의존 순서

| 작업 | 선행 | 병렬 가능 |
|---|---|---|
| W-1 | — | — |
| A-2a → A-2b → A-2c → A-2d | W-1 | W-3·W-4·W-6 과 병렬 |
| W-3 | W-1 | A-2 계열과 병렬 |
| W-4, W-6 | W-3 | 서로 병렬 |
| A-5 | A-2d | W-4·W-6 과 병렬 |
| 배포·실측 | A-2a~A-5, W-1~W-6 | — |
| A-7 | 실측 G4 | W-8a 와 병렬 |
| W-8a | W-3, 실측 G1 | A-7 과 병렬 |
| A-8b | A-2d, W-8a 배포 | — |

### 17.0.2 배포 순서 (요약 — 활성화 조건·되돌리기는 §17.1)

| 순서 | 배포 | 포함 작업 | 배포 후 켤 것 |
|---|---|---|---|
| 1 | 승인 앱 | A-2a~A-2d, A-5 (+ W-1 계약 사본) | 없음(`linkedInputChannel=WORKFORCE` 기본, `ch:'WORKFORCE'`·`rx` 게시 시작) |
| 2 | 워크포스 | W-1, W-3, W-4, W-6 | 관리자: 스위치 `approvalLinkMode` ON |
| 3 | (실측) | G2·G3·G4·G5·G9·G11~G13 | — |
| 4 | 승인 앱 | 설정 | 관리자: `linkedInputChannel=APP` |
| 5 | 승인 앱 | A-7 | 없음(SQL 추가 = `--approve MAJOR_VERSION_RULE`) |
| 6 | 워크포스 | W-8a | (G1 결과에 따라) 인원 구조 게시 |
| 7 | 승인 앱 | A-8b | 관리자: `workforceTeamSource=WORKFORCE`(인원 구조 카드 확인 뒤) |

### 17.1 배포·활성화 순서와 버전 조합 (검증 P1-10, 2회차 N6 — 능력 신호 대신 DB 관찰)

| 순서 | 무엇 | 켜지는 조건 | 되돌리기 |
|---|---|---|---|
| ① | 승인 앱 2a~2d 배포. `ctl` 에 `rx` 와 `ch:'WORKFORCE'`(기본)를 싣기 시작 | — | 코드 롤백해도 저장된 검증본은 남는다(무해) |
| ② | 워크포스 1·3·6 배포. 스위치 `approvalLinkMode` 기본 OFF | — | 롤백 시 넘김 없음 = 지금 동작 |
| ②' | 워크포스 관리자가 스위치 ON | 설정 화면이 승인 앱 문서(`rx`)를 확인했을 때 켜기 권장. ON 이면 연동 대상 이슈는 `ch` 가 서명돼 있어야만 작성된다(§7.4) | OFF 로 끄면 지금 동작 |
| ③ | 워크포스 "승인 설정" 보기 | 읽을 때마다 `ctl.rx` 에 `rms.issue` 가 있을 때만(§4.1) | 보기 숨김. 걸린 설정은 승인 앱이 계속 판정 |
| ④ | 승인 앱 `linkedInputChannel=APP` | 관리자 토글(사전 조건 없음). 토글 화면에 "워크포스가 이 버전 이상이어야 넘김이 동작합니다" 안내와 "APP 이후 워크포스에서 직접 기록된 연동 이슈 기록 N건(최근 7일)"(§5.7 관찰 로그의 `LINKED_DIRECT_WF`). 0 이 아니면 경고 | `WORKFORCE` 로 되돌리면 다음 `ctl` 게시에서 **명시적 `ch:'WORKFORCE'`** 가 실린다(문서는 지우지 않는다) → 워크포스 연동 대상은 직접 작성 + 자기 `rms.issue` 검사 |
| ⑤ | 이슈 재정의 제거(7) | G4 통과 | 마이그레이션은 되돌리지 않는다(행 보존, `retired_at` 은 옛 코드가 무시) |
| ⑥ | 워크포스 org 팀 칸 게시(8a) | G1 판정에 따라 asApp/후퇴 | 팀 칸을 다시 비우는 게시 |
| ⑦ | 승인 앱 `workforceTeamSource=WORKFORCE`(8b) | 관리자 토글. 인원 구조 카드의 "팀 정보 없음" 수를 보여 주고, 0 이 아니면 확인 문구를 한 번 더 받는다 | `ROSTER` 로 되돌리면 명부 결재선(명부 데이터 보존) |

- **능력 신호(cap)를 쓰지 않는 이유(2회차 N6)**: 만료 없는 서명 문서의 능력 표시는 상대 앱이 롤백돼도 남아 "지금 버전"을 보장하지 못한다. 유효기간·세대 번호를 붙이면 또 갱신 장치가 필요하다. 대신 **실제로 일어난 일**을 승인 앱 DB 에서 본다 — APP 인데 워크포스가 직접 쓴 기록이 생기면 그것이 구버전(또는 롤백)의 증거다. 판정은 바꾸지 않고(그 기록도 제출 대조에 걸린다) 관리자에게 드러낸다.

| 조합 | 결과 |
|---|---|
| 구 워크포스 + 새 승인 앱(① 만) | 구버전은 `ch` 를 몰라 지금과 같다. 승인 설정 보기 없음 |
| 구 워크포스 + 새 승인 앱 + ④ | 워크포스는 `ch` 를 몰라 직접 작성. 승인 앱 DB 관찰 건수가 올라가 관리자에게 경고, 그 기록은 제출 대조로 위반 판정 |
| 새 워크포스 + 구 승인 앱 | 스위치 OFF 면 지금과 같다. ON 이면 `ch` 가 없어 연동 대상 작성이 **멈춘다**(안내: 승인 앱을 올리거나 스위치를 끄세요) — 확정 요구대로 직접 작성으로 돌아가지 않는다 |
| 새 워크포스(ON) + 새 승인 앱(④ 전) | `ch:'WORKFORCE'` → 직접 작성 + 자기 `rms.issue` 검사. 설정 편집 가능 |
| 둘 다 새 + ④ | 목표 상태 |
| 둘 다 새 + ④ 뒤 워크포스 롤백 | 위 "구 워크포스 + ④" 와 같다(경고 + 제출 대조) |
| 승인 앱 롤백(①→이전) | 구버전은 `rms.issue` 를 모른다 → 설정 미적용, `ctl` 에 남은 `rx` 로 워크포스 보기는 다음 `ctlRev` 게시까지 보인다. **운영 절차**: 승인 앱 롤백 전에 ④ 를 끈다. 롤백 중 설정 미적용은 보장 범위 밖 |

- 마이그레이션 번호 v064~v066 은 지금 비어 있다(`src/rdb/schema/migrate.js:138` 이 v063). 구현 시점에 다시 확인하고 밀렸으면 다음 빈 번호로 바꾼다(배포 후에는 이름 변경 금지).

---

## 18. 테스트 목록

**승인 앱 — 도메인·서비스**
- A1 `rms.issue` 검증: 정상 / 서명 불일치 / 다른 이슈 결속 / 다른 프로젝트 결속 / 날짜 역순 / 2월 30일 / `pa` 이상값 → 각각 코드.
- A2 rev 규칙(기존 `nextRow`): 낮은 rev·같은 rev 다른 본문 `STALE_REV`(저장본 유지, `DIVERGED`), 같은 본문 `UNCHANGED`(1시간 안 쓰기 0).
- A3 프로퍼티 삭제(404) → 저장본 유지, 감사 없음.
- A4 전부 null 문서 → `received` 감사, 창 없음.
- A5 CAS 경합 두 건 → 감사 1줄(결정적 id, CAS 전 기록).
- A6 쓰기 경로: 읽기 성공 + 바뀜 → 저장 1·감사 1 후 새 값으로 판정.
- A7 쓰기 경로: 읽기 실패 + 저장본 있음 → 저장본 판정, `settingStale:true`.
- A8 쓰기 경로: 읽기 실패 + 저장본 없음 + 연동 → `WORKLOG_WINDOW_UNRESOLVED`.
- A9 `entryWindowOf`: s만 / e만 / 둘 다 / 둘 다 null.
- A10 연동 신호 만료(EXPIRED) + 설정 있음 → 창 적용(sticky).
- A11 명시 해제(`ctl:'NONE'`) → 창·사전 승인 적용 안 함, 재연결 뒤에는 null 문서(더 높은 rev)가 걸려 옛 설정 미적용.
- A12 수정: 원래 날짜 기간 안·새 날짜 밖 → 거부, 반대도 거부. 삭제: 원래 날짜 밖 → 거부.
- A13 `mergePolicy` LINKED_ISSUE: REQUIRED → PREAPPROVAL, NOT_REQUIRED 가 프로젝트 PREAPPROVAL 을 덮음(Q1 권고), null 은 덮지 않음, 출처·리비전 문자열.
- A14 `checkPolicy` 연동 이슈 PREAPPROVAL → `WORKLOG_APPROVAL_REQUIRED`.
- A15 타임시트 `policy_evidence` 에 `LINKED_ISSUE` 출처가 실림.
- A16 이슈가 다른 프로젝트로 이동 → 옛 설정 무시.
- A17 `monthWorkdays` 가 워크포스와 같은 벡터(평월·공휴일 50%·주말 공휴일).
- A18 `kpiBasisOf`: 문서 없음·범위 밖 → null, `dm` 만 있으면 dayMinutes 만.
- A19 `getLinkedIssueOverview`: 이슈 열람 불가 → 거부, Jira 호출 수 1(+kb 캐시 미스 1).
- A20 `WorklogControlCtl.bodyFor`: `linkedInputChannel=APP` + 통제 OFF + dw 끔 → 문서 유지·`ch:'APP'`. `WORKFORCE` → 기존과 같음.
- A21 정책 키 맵·기본값 대조(`SettingsPolicyKeys.test.js`).
- A22 `idleSqlBudget`: `linkedInputChannel=APP` 이어도 27·38.
- A23 `saveIssueWorklogPolicy` 미등록 — permissionMap 계약 테스트가 세 곳에서 사라졌는지.
- A24 `getIssueWorklogPolicy` 응답에 `override` 없음.
- A25 `resolveBatch` 가 `worklog_policy_issue_override` 를 읽지 않음(SQL 수 1 감소).
- A26 옛 제출의 `policy_evidence`(`JIRA_ISSUE`)가 상세 응답에 그대로 나옴.
- A27 마이그레이션 이름 목록(v064~v066), `retired_at` 채움, feature_index ISSUE 삭제·WF_ISSUE 보존.
- A28 개인정보 원천 목록에 override 테이블이 남아 있음.
- A29 연동 모드 + 팀원 org 있음 → WORKFORCE 결재선, 명부 무시.
- A30 연동 모드 + org 없음 → `TIMESHEET_WORKFORCE_TEAM_MISSING`(명부로 떨어지지 않음).
- A31 단독 모드 → 기존 명부 결재선 그대로.
- A32 팀원 문서 없음 + 팀장 문서에 있음 → 역조회로 결재자 결정.
- A33 두 문서 불일치 → 팀원 문서 우선, `link_json.orgMismatch:true`.
- A34 TeamScope 연동 모드: 명부 팀원이 범위에 없음, `{teamLead:true}` 판정이 워크포스 leads 기준.
- A35 인증 `upperLeadsOf` 가 같은 원천.
- A36 제출 `link_json.org` 에 teamKey·leaderKeys.

*검증 반영 추가(1·2회차 최종)*
- A2' rev 표(§5.3.1) 5행 각각의 결과와 **SQL 횟수**. 같은 rev·다른 본문은 저장본 유지 + `DIVERGED`(1회차의 채택 규칙 없음).
- A5' 감사 선기록: 감사 INSERT 뒤 CAS 전 중단 → 다음 수신에서 CAS 완료, 감사 1줄 그대로. CAS 1회 패배 → 다시 적용해 성공한 행으로 판정. CAS 2회 패배 → 쓰기·제출 `LINKED_SETTING_PERSIST_FAILED`, 미리보기 경고.
- A9' `windowEnforced`: 사이트 스위치 OFF + 설정 있음 → 작성·수정·삭제·목록 canEdit·편집 컨텍스트·넘김 화면 모두 거부/표시(경로별 1건씩).
- A9'' 스위치 OFF + 설정 미해결(읽기 실패·저장본 없음·연동) → 거부. 비연동·설정 없음 → 통과.
- A9''' 통제용 `linked` 는 설정만으로 true 가 되지 않음(LINKED_ALL 숨김 범위 불변).
- A13' `WorklogApprovalPolicy.read`: 프로젝트 required + LINKED NOT_REQUIRED → required false, LINKED null → required 유지, LINKED REQUIRED + 흐름 없음 → `valid:false`.
- A14' 사전 승인 생성·intent 재사용·적용 직전 세 지점 모두 기간 밖이면 거부/`BLOCKED`, 적용 직전 `contextFor` 타임존이 사이트 값.
- A3' 철회 kid: 신뢰 집합에서 빠진 kid 의 저장본 → 쓰기 `WORKLOG_WINDOW_UNRESOLVED`, 새 kid 문서 수신 → 정상.
- A28' `purgeCache(null)` 이 `rms.issue`·`rms.kb` 를 지우지 않음, `purgeCache(accountId)` 는 `by` 만 null.
- A30' TeamScope 교집합: 팀원 문서가 새 팀장을 가리키면 옛 팀장 범위에서 빠짐, 팀원 문서 없음 → 팀장 문서 인정.
- A30'' 팀장 본인 읽기 실패 + 캐시 24시간 초과 → `{teamLead:true}` 축 resolver 거부, 기존 `approval_approver` 결정은 진행.
- A37 `linkedViolationOf`(순수): 기간 밖 → `LINKED_WINDOW`(출처 무관), 사전 승인 필요 + `approvedEntry` 없음 → `LINKED_PREAPPROVAL`, 있음·같은 날짜 → null, 있음·다른 날짜 → `LINKED_PREAPPROVAL`.
- A38 **사전 승인 표식 위조(N1)**: 표식만 붙인 직접 기록 → 위반, 다른 기록의 표식 복사 → 위반(worklog_id 불일치), 승인 뒤 Jira 에서 날짜 변경 → 위반, `apply_status` 가 APPLIED 가 아닌 항목 → 위반. 프로퍼티는 판정에 쓰이지 않음(테스트에서 프로퍼티 유무를 바꿔도 결과 불변).
- A39 타임시트 제출: 기간 내 위반이 `violations` 에 `LINKED_*` 로 실림, 사전 승인 대조 SQL 1회(IN), `violationAction=BLOCK` 이면 제출 거부. 이벤트 관찰이 없어도 같은 결과.
- A40 `wants`: 표식 없음 → 기존과 같음(SQL 0 추가), 표식 있음 → 생성·수정 이벤트에서 같은 함수로 관찰 로그 1줄, 삭제·숨김 0, 알림 0.
- A42 `linkedInputChannel=APP` 저장은 조건 없이 됨, 화면에 "APP 이후 워크포스 직접 기록 N건" 집계(`LINKED_DIRECT_WF` 로그), 되돌리면 다음 게시에서 명시적 `ch:'WORKFORCE'`(문서 유지).
- A43 `ctl` 에 `rx` 실림, APP 이면 통제 OFF 여도 해제 안 된 대상의 문서 유지.
- A44 유휴: 빈 설치 27·38 불변 + "대상 N=3·변화 없음" 설치에서 `linkedInputChannel` WORKFORCE/APP 쿼리 수 동일(별개 테스트).
- A45 최상위 팀장 본인 결재(연동): 본인 문서 `leaderKeys=[]`·`leads≠[]` → 본인 1단계, `link_json.selfApproval:true`, 이력 라벨. 본인 읽기 실패 → `TIMESHEET_WORKFORCE_TEAM_MISSING`. 명부 모드는 A52.
- A46 org 문서 30일 유효 기간: 팀원·팀장 문서 모두 `iat` 30일 초과면 관계 근거에서 빠짐 — 양쪽 다 옛것인 관계도 30일 뒤 범위·결재선에서 사라짐, 기존 `approval_approver` 결정은 진행.
- A47 `WorklogControlCtl` 커서: 대상 1,001건 이상에서 모든 대상에 `ch`·`rx` 문서가 결국 게시됨(여러 배치), 미완주 시 워터마크 불변, `bodyFor` 는 PK 1회.
- A48 `DIVERGED` + 더 엄한 쪽: 허용 문서(rev 높음) 저장 뒤 제한 문서(rev 같거나 낮음)가 Jira 에 걸림 → 판정은 제한(교집합·REQUIRED), 반대 순서도 제한. 재저장(rev 큼) → 그 문서만, `conflictLimit` 삭제.
- A48' **연속 재생 누적**: rev 300(기간 3/1~3/31, 불필요) 저장 → rev 200(3/10~3/20, 필요) 걸림 → rev 100(3/1~3/15, 기본) 걸림 → 판정은 3/10~3/15·필요(누적), 그 뒤 다시 rev 300 문서가 걸려도 누적 유지. rev 400 정상 수신 → 400 만 적용.
- A48'' 1시간 쓰기 생략 구간에 새 충돌 문서가 걸림 → 누적값이 좁아지므로 생략 없이 저장 후 판정, 그 저장 실패 → `LINKED_SETTING_PERSIST_FAILED`. 누적값 그대로인 호출은 쓰기 0.
- A52 명부 모드 본인 결재: 팀장이고 상위자 조회 성공·비어 있음·결재자 없음 → 본인 1단계, `link_json.selfApproval:true`, 이력·업무함·증명서 "본인 결재" 라벨. 상위자 있음 → 상위자 결재. 상위자 조회 실패 → 기존 오류(본인 결재 안 열림). 팀장 아님 + 결재자 없음 → `TIMESHEET_NO_APPROVER`.
- A53 `selfApprovalAllowed` 공용 함수: 인증(`certAuthority`)과 타임시트 결재선이 같은 입력에 같은 결과(표 기반 테스트), 인증 기존 테스트 불변.
- A51 저장 실패(예외 없음): 새 문서(허용 쪽·엄한 쪽 각각)를 받았는데 감사 INSERT 실패, CAS 2회 실패, `conflictLimit` 누적 저장 실패 — 세 경우 모두 작성·수정·삭제·사전 승인 요청·제출은 `LINKED_SETTING_PERSIST_FAILED`, 미리보기·탭은 `settingUnresolved:true` 경고. 저장할 변경이 없는 호출(`UNCHANGED`)은 저장본으로 정상 판정.
- A49 해제 표시: NONE 을 본 뒤 같은/낮은 rev 문서 → 미적용, 더 높은 rev → 적용.
- A50 타임시트 제출·미리보기 설정 재조회(N8): 이벤트 0건·최초 제출에서 Jira 의 새 제한을 반영해 위반, 허용→제한 변경 직후 제출에서 제한 적용, 연동 이슈가 검색에 없음·검색 실패 → 미리보기 경고·제출 `TIMESHEET_LINKED_SETTING_UNRESOLVED`. Jira 호출 수는 기존과 같음.

**승인 앱 — 화면**
- F1 연동 이슈 탭: KPI 4장·폼·요약 렌더, 비연동 이슈는 기존 화면 + 작성 버튼 보임.
- F2 시작~종료 → 소요 계산, 종료 ≤ 시작이면 저장 불가.
- F3 연속 입력: 저장 뒤 날짜·시간 유지, 코멘트만 비움, 무효화 키.
- F4 사전 승인 필요 → "승인 요청" 버튼, `createWorklogApproval` 호출.
- F5 작성 기간 밖 날짜 선택 불가 + 서버 거부 메시지(cause source).
- F6 `settingStale` 안내.
- F7 새 작성 경로 파싱: `/new`, `/new/2026-03-05`, `/new/2026-03-05/0900-1800`, 잘못된 값 무시.
- F8 이슈 패널 "작업 시간 기록" 줄은 연동 이슈만.
- F9 KPI 기준 없음 → MM "—" + 안내, 0 표시 없음.
- F10 감사 목록 `linkedIssueSetting` 라벨.
- F11 연동 모드 명부 화면 읽기 전용.
- F12 인원 구조 카드 건수 표시.

**워크포스**
- W1 `leadProjectIds`(직속): 직속 팀원이 `projectusers` 에 있는 프로젝트·직속 팀이 `project_team` 에 배정된 프로젝트는 포함, **후손 팀만 맡은 프로젝트는 제외**, 소속 팀만 같은 비팀장은 제외.
- W2 가드 `projectTargets`: 대상 불명 → 거부, 팀장 아님 → 거부, 관리자이지만 팀장 아님 → 거부.
- W3 저장: 50건 초과 거부, 날짜 역순 거부.
- W4 서명 키 없음 → Jira 0, `ISSUE_SETTING_SIGNER_UNAVAILABLE`.
- W5 소속 아닌 이슈 → `NOT_MEMBER`, 나머지는 저장.
- W6 `expectedRev` 불일치 → `CONFLICT`.
- W7 "변경 안 함" 칸이 걸린 값을 보존.
- W8 rev 단조(`max(now, 걸린 rev+1)`).
- W9 withdraw → 전부 null 서명 문서.
- W10 kb 본문: 분 단위, 공휴일 비율 %, 범위, `kbStale`.
- W11 목록: 자기 서명만 `SET`, 남이 쓴 값 `UNVERIFIED`.
- W12 `view=approval` 노출 조건(승인 앱 없음 → 숨김).
- W13 일괄 모달 미리보기 건수.
- W14 "Jira 시작일~기한 복사".
- W15 50건 단위 순차 저장·결과 표시.
- W16 `createChannelOf` 판정표 5행.
- W17 서버 `createIssueWorklog`: 넘김 대상이면 `WORKLOG_CREATE_HANDOFF_REQUIRED`, ctl 읽기 실패면 `WORKLOG_LINK_UNCONFIRMED`(직접 POST 0회).
- W18 승인 앱 없음(404) + 자기 설정 사전 승인 필요 → `WORKLOG_APPROVAL_APP_REQUIRED`.
- W19 패널: 연동 이슈 폼 대신 넘김 버튼, 경로에 날짜·시간.
- W20 마이워크·캘린더 모달 넘김.
- W21 범위 모드: 연동 이슈 선택 시 꺼짐 + 안내, 롤백 직접 삭제 경로 미도달.
- W22 `leaderKeysOf`: 팀원 → 팀장, 팀장 본인 → 부모 팀장, 루트 팀장 → 빈 배열.
- W23 `leadsOf`: 직속 팀만.
- W24 org 게시 크기 예산 초과 → 게시 안 함, `ORG_TOO_LARGE`.
- W25 cap 보존.
- W26 팀 이동 1명 → 본인·옛 팀장·새 팀장 문서 3건.
- W27 asApp 쓰기 실패(G1 미통과) 시 후퇴 경로.

*검증 반영 추가(1·2회차 최종)*
- W2' 가드 세 겹: 관리자·비팀장 → 서비스에서 `ISSUE_SETTING_NOT_TEAM_LEAD`, 자원 write 보유·비팀장 → 거부, 일반 팀장 → allowlist 통과 후 payload 보존·성공. allowlist 계약 테스트(`teamLead` 보유 키 ⊆ allowlist).
- W6' 쓰기 뒤 대조: PUT 뒤 걸린 문서가 다르면 `CONFLICT`. 새 rev = `max(now, 걸린 rev + 1)`.
- W9' 해제·재연결 순서: 해제는 NONE 먼저, 재연결(`ensure`)은 값 있는 `rms.issue` 를 null 로 먼저 바꾸고 실패하면 신호를 걸지 않음.
- W12' 보기 노출: 읽은 `ctl.rx` 에 `rms.issue` 없으면 숨김(기억 없음).
- W16' 판정표(§7.4): 스위치 OFF·비소속 → 직접, `ch:'APP'` → 넘김, `ch:'WORKFORCE'` → 직접 + 자기 검사, 404·서명 실패·`NO_TRUST`·`READ_FAILED`·`ch` 없음 → 멈춤(직접 POST 0회). 워크포스 저장소 쓰기 0.
- W16'' 직접 작성 경로: 자기 `rms.issue` 기간 밖이면 거부, 사전 승인 필요면 `WORKLOG_APPROVAL_APP_REQUIRED`.
- W21' 범위 모드 연동 이슈: "첫 날부터 기록" 경로에 시작일·시간, 남은 날짜 목록(주말·공휴일 제외).
- W28 `approvalEdges` 두 투영 일치(무작위 팀 트리 속성 테스트), 자식 팀장이 부모 팀 `users.team_key` 에 없어도 성립, 겸직, 최상위 팀장은 간선 없음 + `leaderKeys=[]`·`leads≠[]`, 자기 승인 간선 없음.
- W29 키 교체 재서명: 걸린 자기 `rms.issue` 를 같은 본문·새 rev 로 새 kid 서명.
- W30 org 남의 문서 쓰기 대상은 서버가 계산한 간선 변화 대상뿐(payload 무시). 본인 접속 자기 확인: 팀 칸이 DB 와 다르거나 `iat` 7일 초과면 다시 씀.
- W32 스위치 `approvalLinkMode`: KVS settings 속성, 기본 OFF, `rx` 감지 시 켜기 권장 표시.
- W31 계약 7파일 원본 대조가 정규화 없는 `Buffer.equals`, `.gitattributes` 의 `eol=lf`.

---

## 19. 사용자 결정 (확정 — QUESTIONS Q139)

| # | 질문(짧게) | 결정 | 반영 |
|---|---|---|---|
| Q1 | 팀장 "불필요" vs 프로젝트 "필요" 충돌 | 팀장 값이 최종 | §5.4 (2) |
| Q2 | 사전 승인 선택지 수 | 필요 / 불필요 / 기본 따름 세 개 | §3.2, §4.1 |
| Q3 | 작성 기간 미설정 연동 이슈 | 지금처럼(기간 창 스위치 켜져 있으면 Jira 시작일~기한) | §5.4 (1) |
| Q4 | 승인 설정 보기 권한 | 작업관리 열람자 모두 보기, 팀장만 고치기 | §4.2 |
| Q5 | 연동 모드에서 워크포스 팀 없는 사람의 제출 | 막고 안내(명부로 대신하지 않음) | §8.3 |
| Q6 | 타임시트 결재 범위 | 직속 팀원만 | §8.3 |
| Q7 | 팀장 설정을 워크포스 DB 에 저장 | 저장하지 않음(프로퍼티 자체가 상태) | §4.3 |
| Q8 | 기간 일괄 입력 | 이번엔 연동 이슈에서 "첫 날부터 기록"으로 대체, 이전은 별도 작업 | §7.4, §7.6 |
| Q9 | 제공자 미선택 사이트의 직접 기록 길 | 승인 앱 이슈 패널에 연동 이슈만 "작업 시간 기록" | §7.5 |
| Q10 | 옛 이슈 재정의 데이터 | 보존 + 폐지 표시 + 내보내기 | §6 |
| Q11 | schedule-window-fields(승인 일정·앱 전용 필드) | **폐기** | §5.3 |
| Q12 | 비연동 이슈 탭도 워크포스식으로 | 이번엔 연동 이슈만 | §7.1 |
| Q13 | 연동 이슈 사전 승인 결재자 | 기존 사전 승인 결재선 설정 | §5.4 (2) |
| Q14 | 워크포스 사이트 기억 | 철회(기억 없음) | §7.4 |
| Q15 | 승인 설정 편집 범위 | 직속 팀이 맡은 프로젝트 | §4.2 |
| Q16 | 팀장 타임시트 결재 | 위 팀장이 결재, 위가 없으면 본인 결재. **명부 모드에도 본인 결재 허용**(같은 조건, 이력에 "본인 결재") | §8.3, A45·A52·A53 |
| Q17 | 화면 밖 기록의 위반 처리 | 배지 + 제출 위반(막기 정책이면 제출 거부), 삭제·숨김·알림 없음 | §5.7 |
| Q18 | 워크포스 "승인 앱 연동" 스위치 | 둔다(기본 꺼짐) | §7.4 |
| (잔여) | 6회차 잔여 P1(저장 실패 + 동시 저장 + 옛 문서 재생 겹침) | 수용하고 착수 | §5.8 X6 |

---

## 20. 요구 추적 (검증 P2-13)

| 요구(`00_input/requirement.md`) | 구현(절) | 검증(테스트·관문) | 완료 조건 |
|---|---|---|---|
| 1. 워크포스 작업관리 하위 탭, 팀장만 편집, 일괄 | §4.1·§4.2·§4.4, 단계 3·4 | W1~W15, W2'·W6'·W12' | 팀장이 담당 프로젝트에서 50건 일괄 저장 성공, 관리자·비팀장 거부, 승인 앱 구버전이면 보기 숨김 |
| 2. 서명 넘김 → 승인 앱 DB 판정, 위조 무시 | §3.2·§5.1~§5.4·§5.7, 단계 1·2a·2b·2d | A1~A16, A2'~A14', A37~A40, G2·G4·G12·G13 | 기간 밖·사전 승인 위반이 승인 앱 화면에서 거부, 외부 작성은 관찰·제출 위반, 위조·옛 rev·철회 kid 무시 |
| 3. 이슈 재정의 계층 제거, 데이터 보존 | §6, 단계 7 | A23~A28 | `saveIssueWorklogPolicy` 미등록, 판정이 override 를 읽지 않음, 옛 `policy_evidence` 표시 유지, 행 보존 |
| 4. 입력 화면 단일화(워크포스식 UI, 생성 넘김, 확인 불가 시 복귀 금지, 기간 일괄 단계 분리) | §7, 단계 5·6, §17.1 | F1~F10, W16~W21, W16'·W16''·W21', G5·G9·G11 | 연동 이슈 작성이 워크포스 어느 경로에서도 승인 앱 화면으로 넘어가고, 확인 불가·문서 소실에서 멈춤, 범위 모드는 "첫 날부터 기록"으로 대체 |
| 5. 인원 구조 동기화 — 팀장 = 편집자 = 결재자 | §8, 단계 8a·8b, §17.1 ⑥⑦ | A29~A36, A30'·A30'', W22~W28, G1·G10 | 연동 모드 결재선·팀장 범위가 워크포스 간선만으로 나오고, 이동 시 옛 팀장 범위가 교집합으로 줄며, 게시 실패는 진단에 드러난다 |
| 제약: 계약 7파일 바이트 동일 | §3.6 | W31, 기존 `vectors.test.js` | 정규화 없는 원본 대조 통과 |
| 제약: 유휴 SQL 예산 | §15 | A22·A44, `idleSqlBudget` | 27·38 불변 |

---

## 21. 검증 반영표 (`02_codex_verify.md`)

| # | 지적 | 판단 | 반영 위치 |
|---|---|---|---|
| P0-1 | 가드 OR·관리자 통과로 "팀장만" 보장 불가, allowlist 누락 | 동의 | §4.2(세 겹: grant 없는 선언 + 서비스 `assertLeads` 필수 + allowlist), §9.2, W2' |
| P0-2 | 창만 채우면 `linked && dateWindowOn` 조건에서 건너뜀 | 동의 | §5.4 (1) `windowEnforced` 와 호출부·`controlView`·사전 승인 경로 고정, A9'~A9''' |
| P0-3 | ctl 삭제·옛 문서 재사용으로 직접 작성 재개 | 동의(범위 한정) | §3.4 `ch` 에 `'WORKFORCE'` 명시 해제·`ctlRev`, §7.4 사이트 기억 키와 7행 판정표, Q14. **반박 일부**: 워크포스 화면은 보안 경계가 아니므로 화면 밖 우회는 §5.7 로 넘기고 "보장 범위 밖"으로 명시 |
| P1-4 | 이벤트 경로가 기간·사전 승인을 집행하지 않음 | 동의 | §5.7(사전 차단/사후 관찰 범위, 관찰·기록·제출 위반·알림, 삭제로 확대 안 함), §5.1 이벤트 행, 단계 2d, A37~A41, G12, Q17 |
| P1-5 | 사전 승인 경로 기간 재검증 없음, NOT_REQUIRED 가 최종이 안 됨 | 동의 | §5.4 (2) `read` 내리기 규칙·`open()` 세 지점·타임존, A13'·A14' |
| P1-6 | 조직 변경 게시와 권한 회수 미연결 | 동의(일부 범위 밖) | §8.3 3(교집합, 24시간 fail-close, 세 문서 동시 게시, 게시 실패 복구). 게시 실패 구간은 앱 간 호출 불가로 **보장 범위 밖** 명시 |
| P1-7 | 편집·결재 관계 불일치, 자식 팀장 누락 | 동의(표현은 반박) | §8.3 `approvalEdges` 단일 출처·관계 행렬, Q15·Q16, W28. 반박: 편집(프로젝트)과 결재(사람)는 대상이 달라 문자 그대로 같은 판정일 수 없다 — 같은 팀 색인·같은 직속 규칙으로 정의 |
| P1-8 | rev·CAS·감사 재사용 조건 불일치, Jira PUT 경쟁 | 동의 | §3.2 rev 행, §5.3.1(전용 rev 표·SQL 수), §5.3.4(결정적 감사 id·`AUDIT_PENDING`), §4.4 ⑨ 쓰기 뒤 대조, §11.2. 이슈별 리스는 두지 않음(근거 §4.4) (2회차에 §5.3.1·§5.3.3 으로 재정리 — §21.1) |
| P1-9 | 철회·최초 재생·캐시 삭제 후 재생 | 동의 | §3.2 키 철회 행, §5.3.2(철회 kid 판정 제외, 키 목록 제거 절차, `purgeCache` 제외·`by` 만 지움). 저장본 없는 최초 재생은 **보장 범위 밖** 명시 |
| P1-10 | 버전 불일치·재연결·부분 해제 | 동의 | §3.4 `rx`, §4.1 노출 조건, §4.5·§5.3.3 연결 세대, §17.1 순서·조합표, G11 (2회차에 연결 세대 철회, §4.5 순서로 대체 — §21.1) |
| P1-11 | asApp 은 규칙 확장, Refresher APP 모드와 모순 | 동의 | §13 호출별 표(자격·호출자·REST·칸·용도·AGENTS 변경), §11.3 "이벤트는 읽지 않음" 철회, 단계별 선행 조건 |
| P2-12 | 유휴와 활성 비용 구분 | 동의 | §15 ①유휴 ②활성 추가 ③무접속 설치, A44 |
| P2-13 | 요구 추적·범위 입력 대체·바이트 동일 | 동의(바이트 비교는 방식 조정) | §20, §4.1(view 가 하위 탭인 근거), §7.4 범위 모드 "첫 날부터 기록", §3.6. 반박 일부: 지문 검사의 LF 정규화는 Windows autocrlf 때문이라 없애지 않고, `.gitattributes eol=lf` + 형제 원본 `Buffer.equals` 로 바이트 동일을 보장 |
| 인용 D:147 | `WorkforceInbound.js:85-88` 은 EQUIVOCATION 이 아니라 STALE_REV | 정정 | §3.2 rev 행(기존 규칙을 정확히 적고 이 typ 전용 규칙을 따로 둠) |
| 인용 D:184 | 삭제 조건은 `WorklogControlCtl.js:61` | 정정 | §3.4 |
| 인용 D:284 | 공용 `verifyEntry` 에 TARGET_MISMATCH 없음 | 정정 | §5.2(BAD_SIGNATURE, TARGET_MISMATCH 는 `authority.js:12` 의 policy 봉투 전용) |
| 인용 D:294 | 사용된 번호는 v061~v063 | 정정 | §5.3(v064·v065 는 비어 있음) |

### 21.1 2회차 (`03_codex_reverify.md`) — "장치를 더 얹기보다 구조를 단순하게"

| # | 지적 | 판단 | 반영(단순화 방향) |
|---|---|---|---|
| N1 (P0) | 사전 승인 표식 존재만 보면 위조로 우회 | 동의 | §5.7 공용 순수 함수 `linkedViolationOf` + `appliedEntryFor` — `worklog_approval_entry` 의 `worklog_id`·`issue_id`·`requester_account`·`apply_status='APPLIED'`·승인 상태·작업 날짜를 DB 로 대조. 프로퍼티는 판정에 쓰지 않음. 출처(APP·PROVEN)로 면제하지 않음. A37·A38, G13 |
| N2 (P1) | Jira 마지막 값과 최고 rev 의 영구 어긋남 | 동의(해법은 단순안) | 리스·의도 영속화 대신 **기존 수신 규칙(최고 rev 유지)으로 되돌림** + `DIVERGED` 표시 + 재저장으로 해소(새 rev 는 `now` 라 반드시 큼). 1회차 "같은 rev 채택" 철회(재생 문). 적용 값은 늘 서명된 팀장 결정이라 허용 쪽으로 열리지 않음. §4.4, §5.3.1 |
| N3 (P1) | 사이트 KVS 기억의 동시 갱신 | 동의(장치 자체를 없앰) | 워크포스 기억 키 **철회**. 판정표 4행(넘김 / 읽기 실패 멈춤 / 그 밖 직접 + 자기 설정 검사). 최종 보장은 승인 앱 DB 의 제출 대조. 근거: 조작 가능한 사람은 REST 로도 쓸 수 있음. §3.4, §7.4, Q14 철회 |
| N4 (P1) | 감사 대기 표식 유실 구간 | 동의(순서로 해결) | 감사 선기록(결정적 id `INSERT IGNORE`) → CAS. 감사 뜻을 "받음"으로. `AUDIT_PENDING` 철회. §5.3.3, §5.5 |
| N5 (P1) | 요청 없는 알림을 현재 모델로 못 만듦 | 동의 | 작성자 알림 **제외**(배지·제출 위반 목록으로 대신). 필요하면 별도 slug. §5.7, Q17 |
| N6 (P1) | sticky capability 로 현재 버전 보장 불가 | 동의 | `cap` `handoff`·`orgteam` **철회**. APP 토글은 조건 없이 켜고, 승인 앱 DB 관찰("APP 이후 워크포스 직접 기록 N건")로 구버전·롤백을 드러냄. 판정은 제출 대조가 계속 지킴. §3.5, §17.1 |
| N7 (P2) | §9·§17·§18 계약 불일치 | 동의 | §9 `saveIssueApprovalSettings` 권한을 "grant 없음 + teamLead + 서비스 `assertLeads`"로 통일, §17 표·권고 순서에 2d 포함·내용 갱신, §18 의 EQUIVOCATION·AUDIT_PENDING·releasedIat·알림·cap 항목 정리 |
| P0-3 부분 | 기억의 원자성 | 위 N3 | 기억을 없애 문제 자체를 제거 |
| P1-4 부분 | 표식 위조·알림 | 위 N1·N5 | 제출 대조를 최종 보장으로 명시 |
| P1-6 부분 | 게시 실패 뒤 권한 무기한 유지 | 동의(상한 추가) | 기존 본인 접속 경로를 "팀 칸 자기 확인 + 7일 재서명"으로 넓히고(장치 추가 없음), 승인 앱은 팀원 문서 없는 관계를 팀장 문서 `iat` 30일 안에서만 인정 → 최대 30일 뒤 닫힘. 남는 30일과 양쪽 문서가 모두 옛것인 경우는 근거와 함께 보장 범위 밖. §8.3 3, A46, W30 |
| P1-8 부분 | rev 순서·감사 중단 | 위 N2·N4 | 기존 규칙 회귀 + 감사 선기록 |
| P1-10 부분 | 관측 못 한 해제·null 게시 실패·capability 롤백 | 동의(순서로 해결) | 승인 앱 세대 기록(`releasedIat`) **철회**. 워크포스가 "해제는 NONE 먼저, 재연결은 설정 비우기 성공 뒤에 신호"로 순서를 지켜 문제 자체를 없앰. 롤백은 §17.1 표(승인 앱 롤백은 운영 절차 + 보장 범위 밖 명시). §4.5 |
| P2-12 부분 | 대상 N건 무접속 비용 | 동의 | §15 ③ 을 "빈 설치 상한 + c×N(기존), 이번 변경은 N 불변"으로 분리, 테스트 두 개로 나눔. A44 |
| 사용자 결정 | 팀장은 위 팀장 결재, 위가 없으면 본인 결재 | 반영 | 워크로그 인증의 기존 본인 서명 규칙(`authority.js:17-28`)과 같은 fail 방향으로 타임시트 결재선에 추가. §8.3, Q16(결정됨 + 명부 모드 보조 질문), A45 |


### 21.2 3회차 (`04_codex_reverify3.md`, 결론 "착수 불가") — 단순한 규칙으로 닫기

| # | 지적 | 판단 | 반영 |
|---|---|---|---|
| P0-3 | 404·서명 실패·신뢰 키 없음에서 직접 작성 → 확정 요구 R:17 위반 | 동의(2회차 반박 철회) | §7.4: 워크포스 자기 설정 스위치 `approvalLinkMode` + 소속으로 "연동 대상"을 정하고, 연동 대상은 서명된 `ch:'APP'`(넘김)·`ch:'WORKFORCE'`(직접) 외 전부 **멈춤 + 안내**. §3.4 `ch` 항상 게시·`'WORKFORCE'` 명시 허가 부활. 기억 없음 유지. Q18, W16', W32 |
| N2 | 허용 문서가 남고 제한 문서가 버려지는 역전 | 동의 | 시각 기반 rev(이미 그렇다) + **`DIVERGED` 면 두 문서 중 더 엄한 쪽 적용**(`stricterSetting`: 기간 교집합, REQUIRED>기본>NOT_REQUIRED). 근거: 리스·영속화 없이 허용 쪽 열림만 정확히 닫고, 재생은 더 엄하게만 만든다. §3.2, §4.4, §5.3.1, A48 |
| P1-6 | 양쪽 문서가 모두 옛것이면 무기한 | 동의 | **모든 org 문서 30일 유효 기간**(갱신 없으면 권한 없음). 갱신은 본인 접속 7일 재서명 + (G1 통과 시) 워크포스 **기존** 일일 스케줄 작업. §8.3, A46 |
| N8 | 제출 대조가 캐시만 봄 | 동의 | 타임시트 제출·미리보기에서 기존 asUser 기간 이슈 검색에 `properties` 를 얹어 **항상 재조회**(Jira +0), 실패·누락이면 제출 거부 `TIMESHEET_LINKED_SETTING_UNRESOLVED`. §5.1·§5.7·§15, A50 |
| N9 | `WorklogControlCtl` `LIMIT 1000`(기존 결함) | 동의 | 키셋 커서 `targets({after,limit})`·`bodyFor` PK 조회·`drainCtl` 이어받기, 단계 2c. 근거 `WorklogControlCtl.js:32-37`(LIMIT 1000 은 `:37`), `:48-50`, `:56-58`. §3.4, A47 |
| N10 | 직속 범위·조직 모드 기준 이중 명세 | 동의 | 편집 범위 **직속** 하나로(§4.2, W1 기대값 수정), 조직 모드 기준 **`workforceTeamSource` 하나**로(§8.3 1, §9, §17.1) |
| N6 부분 | DB 관찰이 버전을 보장하지 않음 | 동의(구조로 해결) | 새 워크포스 + 구 승인 앱은 `ch` 가 없어 **멈춤**(fail-close), 구 워크포스 + 새 승인 앱은 기존 동작 + 제출 대조. 버전 보장이 판정에 필요 없어졌다 |
| P1-10 부분 | null 수신 전 재생 | 동의(주장 정정) | 해제를 본 경우 `released` 표시로 같은/낮은 rev 재적용 금지, 못 본 경우만 남는다고 정정(§4.5), A49 |
| P1-8 부분 | 재저장이 저장 최고 rev 를 넘는 보장 | 동의(정정) | rev 가 저장 시각 ms 라 나중 저장이 앞선 rev 보다 크다(같은 ms 면 +1). 같은 ms 경합은 더 엄한 쪽 규칙이 받친다(§4.4) |
| N4 조건 | 감사 저장 실패 시 CAS 진행 금지 | 수용 | §5.3.3 순서: 감사 INSERT 실패면 CAS 하지 않고 판정은 저장본으로 |


### 21.3 4회차 (`05_codex_reverify4.md`)

| # | 지적 | 반영 |
|---|---|---|
| N2 연속 재생(P1) | 충돌 제한을 **누적 병합**(`conflictLimit` — 기간 교집합 누적, 사전 승인 최엄), 더 높은 rev 정상 수신 때만 해제. 1시간 쓰기 생략은 touch 만 생략하고 이번 호출 판정에는 늘 이번 Jira 문서까지 합쳐 적용. §5.3.1, A48'·A48'' |
| 감사 실패 처리(P1) | 검증된 변경 저장 실패(감사·CAS) 시 작성·수정·삭제·사전 승인 요청·제출 `LINKED_SETTING_PERSIST_FAILED`, 미리보기·탭 `settingUnresolved` 경고. "기존 저장본으로 판정" 문구 삭제. 엄하기만 한 문서는 저장 없이도 적용(5회차에 삭제 — §21.4). §5.3.3, A51 |
| P2 | §4.2 정의를 직속으로, §17.1 ④ 되돌리기를 명시적 `ch:'WORKFORCE'`(문서 유지)로, A42 동일 |


### 21.4 5회차 (`06_codex_reverify5.md`)

| # | 지적 | 반영 |
|---|---|---|
| §5.3.3 예외 반례 | "엄한 문서는 저장 실패해도 적용" 예외 삭제. 저장(감사·CAS·`conflictLimit` 누적) 실패면 **언제나** 쓰기·제출 `LINKED_SETTING_PERSIST_FAILED`, 미리보기·탭 경고. 저장할 변경이 없는 호출만 저장본으로 판정. §5.3.1·§5.3.3·§11.2, A5'·A48''·A51 |

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-12 | 최초 작성 | requirement.md 사용자 결정 1~5 |
| 2026-10-12 | 코덱스 검증(P0 3·P1 8·P2 2·인용 4) 반영 — 가드 세 겹, `windowEnforced`, 사이트 창구 기억·`ch` 해제·`rx`, 사후 관찰(§5.7), 사전 승인 내리기·창 재검증, 전용 rev 표·결정적 감사, 키 철회·연결 세대·purgeCache 제외, `approvalEdges`·TeamScope 교집합, 호출별 asApp 표, 비용 3분할, 배포 순서(§17.1), 요구 추적(§20)·반영표(§21), Q14~Q17 | `02_codex_verify.md` |
| 2026-10-12 | 코덱스 2회차(N1~N7·부분 6) 반영 — 단순화: 워크포스 기억 키·cap·`releasedIat`·`AUDIT_PENDING`·같은 rev 채택·작성자 알림 철회, 사전 승인 DB 대조(`linkedViolationOf`), 기존 rev 규칙 + `DIVERGED`, 감사 선기록, 해제·재연결 순서, 팀장 문서 30일 상한, 최상위 팀장 본인 결재(Q16 결정), §9·§17·§18 통일, 무접속 N건 비용 분리, §21.1 | `03_codex_reverify.md` |
| 2026-10-12 | 코덱스 3회차 반영 — 연동 대상 fail-close(워크포스 스위치 + 서명된 `ch` 만 허용), `DIVERGED` 시 더 엄한 쪽, org 문서 30일 유효 기간, 제출·미리보기 설정 재조회, `WorklogControlCtl` 1,000건 한도 결함 수정 단계화, 직속·`workforceTeamSource` 단일 기준, §21.2, Q18 | `04_codex_reverify3.md` |
| 2026-10-12 | 코덱스 4회차 반영 — 충돌 제한 누적 병합, 저장 실패 시 판정 거부(`LINKED_SETTING_PERSIST_FAILED`), 직속 정의·명시적 `ch:'WORKFORCE'` 문구, §21.3 | `05_codex_reverify4.md` |
| 2026-10-12 | 코덱스 5회차 반영 — 저장 실패 예외 삭제, 저장 실패 계약 단일화(§5.3.1·§5.3.3·§11.2·A5'·A48''·A51), §21.4 | `06_codex_reverify5.md` |
| 2026-10-12 | 사용자 결정 Q139 반영 — §19 결정표, Q11 schedule-window-fields 폐기, Q16 명부 모드 본인 결재(`selfApprovalAllowed` 공용, A52·A53), §5.8 보장 범위 밖 모음(X6 잔여 위험), §17 코덱스 작업 지시 단위 확정(파일·완료 기준·테스트 명령·의존·배포 순서) | QUESTIONS Q139 |
