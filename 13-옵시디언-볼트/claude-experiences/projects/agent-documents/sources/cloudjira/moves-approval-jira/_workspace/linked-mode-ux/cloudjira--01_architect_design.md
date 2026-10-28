# linked-mode-ux 설계서 — 워크포스 연동 모드 UX 통합

> 작성 2026-10-13 · feature-architect · 입력 `00_input/requirement.md`(사용자 결정 ①~⑤, ⑥ 범위 밖, ③ 은 같은 날 갱신본 — "이슈 화면에서 하는 일은 네 가지뿐")
> **기준 트리(중요)**: 승인 앱은 `master`(b23524f)가 아니라 **`linked-issue-schedule` 브랜치(3c9368f, 작업트리 `C:\CloudJira\moves-approval-jira-lis`)** 를 기준으로 썼다. 이 브랜치가 이미 master 를 병합했고(48415c0), 작성 창구 `ch`·`rx`, `rms.issue`·`rms.kb`, `linkedInputChannel`, 새 작성 넘김 경로 `worklog/{issueId}/new/{date}/{HHmm}-{HHmm}`, `LinkedWorklogPanel` 을 갖고 있다. 이 설계는 **그 브랜치가 master 에 병합된 뒤**를 전제한다(§15 Phase 0). 경로는 병합 뒤 리포 기준이다.
> 워크포스는 `C:\CloudJira\moves-workforce` 브랜치 `RFC-220`(ff76a9d, linked-issue-schedule W-1·W-3·W-4·W-6 반영) 기준. 경로 앞에 `WF:` 를 붙였다.
> 선행 설계: `workforce-link`(서명 계약)·`worklog-control`(통제·HANDOFF·불변식 8 예외)·`linked-issue-schedule`(rms.issue·ch·rx·인원 구조 §8)·`operating-mode`·`settings-restructure`·`approval-kind-naming`·`worklog-policy-ux`.
> 근거 등급: **코드**(리포 확인) / **문서**(CLAUDE.md "공식 문서로 확인") / **미검증**(§13).

---

## 열린 질문

설계는 각 질문의 **기본안**으로 진행했다. 번호는 `QUESTIONS.md` 다음(Q140~).

| # | 질문 | 선택지 | 기본안(설계 반영) | 근거 |
|---|---|---|---|---|
| Q140 | 연동 모드에서 **연동 이슈**에 남아 있는 승인 앱 쪽 이슈 예외(`worklog_policy_issue_override` 행)·결재선 지정(`worklog_approval_binding` 행)은? | (a) 연동 이슈면 **적용하지 않고** 편집 불가, 목록에서 "워크포스 관리" 배지 + 삭제만 허용 (b) 워크포스가 정하지 않은 키만 계속 적용 (c) 그대로 적용, 편집만 막음 | **(a)** | 한 이슈의 예외를 고치는 곳이 하나여야 한다(③ "연동 모드: 이슈별 재정의 편집은 ④에서"). (b)·(c) 는 "고칠 수 없는데 적용되는 값"이 생긴다 |
| Q141 | linked-issue-schedule 남은 단계 **A-7(Jira 이슈 재정의 계층 제거, Q139-Q10)** 은? | (a) **폐기** — 단독 모드의 이슈 예외 목록이 이 계층을 쓴다 (b) 유지하고 이슈 예외를 새 저장소로 | **(a)** | ③ 갱신본이 "기존 resolver(`getWorklogPolicy`/`saveWorklogPolicy` scope=issue) 재사용"을 명시. 새 저장소는 SQL 추가(major)만 늘린다 |
| Q142 | 연동 모드의 **이슈별 결재선 선택**을 워크포스 표로 옮기려면 승인 앱 결재선 목록을 워크포스가 알아야 한다(앱 간 호출 불가). | (a) 새 서명 문서 `approval.flows`(프로젝트 프로퍼티)로 알리고 `rms.issue.fl` 로 받는다 (b) 연동 모드에서도 결재선 선택은 승인 앱 프로젝트 설정(이슈 예외 목록 열)에서, 워크포스 표는 이름만 읽기 전용 | **(a)** — 단 독립 Phase(④b)로 분리해 잘라낼 수 있게 | 코디네이터 지시("연동 모드 = ④ 워크포스 승인 설정 표"). 계약 1종 추가가 비용 |
| Q143 | 단독 모드 "이슈 예외" 목록을 어디에 두나 | (a) **Jira 프로젝트 설정 › Moves Approval 페이지**(`jira:projectSettingsPage`, 이미 "워크로그 사전 승인 결재선" 설정이 있음, 권한 = 프로젝트 관리자) (b) 앱 설정 › 프로젝트 › 정책 모달 | **(a)** + (b) 모달에는 위치 안내 한 줄 | 결재선 열과 같은 화면에 있어야 하고, 쓰기 resolver 축이 이미 `{project:'admin'}`. 두 곳에 편집기를 두면 worklog-policy-ux 가 없앤 "같은 값 두 편집기"가 재발 |
| Q144 | '승인 관리' 전체 현황에 **타임시트** 건을 관리자에게 보이나 | (a) 기존 열람 규칙(대상자·참여자·팀장만) — 관리자도 못 보면 숨기고 건수만 (b) 관리자에게 상태·대상자·기간만(시간·이슈 제외) | **(a)** | 불변식 7. 관리자 축은 "부를 수 있나"만이다. (b) 는 제품 결정 필요 |
| Q145 | 업무함 '처리한 건' 탭을 '내 이력'으로 바꾸나 | (a) **대체** — `tab=done` 은 `tab=history&role=processed` 로 읽기 호환 (b) 둘 다 둠 | **(a)** | 요구 "흩어진 이력을 한 화면". 둘 다 두면 다시 흩어진다 |
| Q146 | ② 워크포스 팀 표시는 워크포스가 `movesRms.org` 팀 칸을 채워야(linked-issue-schedule **W-8a**) 내용이 생긴다. 지금은 비어 있다(WF:`src/integration/approval/orgCap.js:17-19`). W-8a 를 이 묶음에 넣나 | (a) 넣지 않음 — ② 화면은 빈 상태 안내로 먼저 배포, 데이터는 W-8a 이후 (b) 넣음 | **(a)** | W-8a 는 실측 관문 G1(앱의 타 사용자 프로퍼티 쓰기) 뒤로 이미 잡혀 있다. 요구 ②의 "판정은 이미 동기화됨"은 **코드 경로만** 사실이고 데이터는 비어 있다(§0 Q2) |
| Q147 | 승인 앱 정책 키 `linkedInputChannel`(작성 창구 선택, 기본 WORKFORCE)의 저장값 | (a) **키 삭제**(KVS 값은 남아도 읽지 않음) (b) 'APP' 고정 읽기 전용 표시 | **(a)** | ① 결정으로 선택지가 사라졌다. 키를 남기면 기본값·키맵 계약 테스트·설정 화면이 계속 그것을 다룬다 |
| Q148 | 관리자 수동 독촉 빈도 | (a) 요청·단계당 **하루 1회**(결정적 이벤트 id) (b) 제한 없음 | **(a)** | 불변식 6, 알림 폭주 방지 |

---

## 0. 선행 질문 답 (Q1~Q4) — 범위 확정

### Q1. `movesRms.origin` 봉투를 없앨 수 있나 → **없애지 않는다. 생산·검증 모두 유지, 바꾸는 것은 두 곳뿐.**

근거:
1. ① 이후에도 워크포스는 **비대상 이슈**(워크포스 연동 스위치 OFF·워크포스 프로젝트 비소속)에 직접 POST 한다(WF:`IssueWorklogControlService.js:98-103` `createChannelOf` 의 `!target → DIRECT`). 승인 앱 `foreignWorklogScope='ALL'` 이면 이 기록들이 "다른 경로 입력" 후보가 되고, 정상 출처 증명은 봉투뿐이다(`domain/worklogControl/origin.js` `originOf`, DELETE 후보는 `NONE` 만 — worklog-control §3.3).
2. 기존 데이터: `worklog_control_intent`(source WF) 는 90일 보관(worklog-control §5), `worklog_control.origin='WORKFORCE'` 행이 있다. 지연·중복 이벤트가 같은 봉투를 다시 검증한다.
3. 승인 앱 `WorklogControlDetector.observeLinked` 의 위반 관찰 `LINKED_DIRECT_WF`(lis `WorklogControlDetector.js:162-165`)는 봉투로 "구버전 워크포스가 연동 이슈에 직접 쓴 기록"을 찾는다. ① 뒤에는 이것이 유일한 탐지 수단이다.
4. DELETE 관문 `WF_ORIGIN_CAPABILITY='WF_WLORIGIN'`(lis `WorklogControlService.js:58`, `:183`, `:477`): 목적은 "워크포스 정상 입력을 지우지 않기"다. 봉투 없이 쓰는 옛 워크포스(WF-12 이전)가 남아 있을 수 있으므로 관문은 유지한다.

바꾸는 것:
| 대상 | 지금 | 바꾼 뒤 | 이유 |
|---|---|---|---|
| `LINKED_DIRECT_WF` 관찰 조건 | `policy.linkedInputChannel === 'APP' && link.linked` | `link.linked` (연동 모드는 `observeLinked` 진입 조건이 이미 본다) | `linkedInputChannel` 삭제(Q147) |
| 능력 신호(`rms.org.cap=['wlorigin']`) 게시 시점 | 서명 작성 성공 후에만(WF:`IssueWorklogControlService.js:339-344`) | + `getIssueWorklogControl`(패널·모달 조회)에서도 `ensureOrgCap`(6시간 메모, 이미 있음) | ① 뒤 연동 이슈만 쓰는 사용자는 워크포스에서 작성하지 않아 cap 이 영영 안 걸리고, DELETE 관문이 영구히 막힌다 |

통제 Phase 게이트(B~D)·`wlorigin.js`·`verifyWorkforceOrigin`·계약 `rms.wlorigin`·벡터는 **무변경**. G-HANDOFF 관문은 의미가 "수정·삭제 넘김"에서 "작성·수정·삭제 넘김"으로 넓어진다(관문 id·저장 조건 무변경, 진단 문구만).

워크포스 `assertOwnSetting`(DIRECT 경로의 `rms.issue` 검사, WF:`IssueWorklogControlService.js:128-141`)은 **삭제**한다 — 대상 이슈의 DIRECT 경로가 없어져 호출되지 않는다. `assertWindow`(`dw` 창)는 남긴다(비용 0 — `link.linked` 일 때만, 방어용).

### Q2. 관리자 팀 탭을 위한 org 게시물 열거 → **승인 앱 수신 캐시(`workforce_inbound`, typ `rms.org`) 키셋 조회 + 관리자 "다시 읽기"(기존 resolver). 워크포스 변경·계약 추가 없음.**

| 안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| A. 수신 캐시 조회 | SQL 1~5, Jira 0, 새 계약 없음. PK `(typ, entity_id)` 로 키셋 가능(`ddl/workforceLink.sql.js:54-69`) | 승인 앱을 한 번도 안 연 사람의 문서는 캐시에 없다 | **채택** |
| B. Jira 사용자 프로퍼티 전수 | 완전 | 사용자 열거 API + 사용자당 GET(200명 = 200+ 호출), 남의 프로퍼티 읽기 권한 미검증(W3) | 기각 |
| C. 워크포스가 사이트 요약 문서 게시 | 완전·1회 읽기 | 사이트 단위 프로퍼티 자리가 없다(앱 프로퍼티는 앱별) → 특정 프로젝트·사용자에 얹어야 함, 계약·게시·크기 예산 추가 | 기각(필요해지면 후속) |

A 의 빈 곳은 이렇게 메운다.
- **팀장 문서 하나가 팀 전체를 말한다.** `rms.org` 의 `leads[{teamKey, teamName, memberKeys≤500}]`(contract.js `RMS_ORG` validator). 팀장은 결재하러 승인 앱에 반드시 들어오므로(본인 읽기 5분 캐시, `WorkforceInbound.orgOf` selfRead) 팀장 문서는 캐시에 있을 가능성이 높다.
- **팀원 문서만 있고 팀장 문서가 없는 팀**은 팀원 문서의 `teamKey/teamName/leaderKeys` 로 "팀장 문서 없음(NONE)" 상태로 보인다.
- **다시 읽기**: 응답의 `refreshCandidates`(문서가 없거나 오래된 팀장 accountId, ≤50)를 화면이 기존 `refreshWorkforceCapabilities({accountIds})`(`{admin:true}`, lis `WorklogControlService.js:141` → `WorkforceInbound.refreshOrgs`, 관리자 asUser 로 남의 사용자 프로퍼티 읽기)로 보낸다. 새 resolver 를 만들지 않는다. 403 이면 그 사람은 `UNREADABLE`(미검증 W3, §13).
- 유휴 비용: 관리자가 화면을 열 때만. 스케줄 없음.
- **데이터 전제**: 워크포스가 팀 칸을 채워 게시해야 내용이 생긴다(W-8a, Q146). 지금은 `cap` 만 실린 빈 문서다.

### Q3. `TYP.RMS_ISSUE` 확장 시 구판 호환 → **버전 필드를 두지 않는다. 키 부재 = 미설정(기본 따름). 쓰는 쪽은 `approval.ctl.rx` 능력 토큰으로 막는다.**

- 지금 validator 는 **모르는 키를 무시한다**(lis `contract.js:292-297` — 나열한 칸만 검사). 그래서 새 칸 `pol`·`fl` 을 단 문서도 구판 승인 앱은 "유효, 새 칸 무시"로 받는다.
- 버전 필드(`v:2`)를 본문에 넣어도 구판 독자는 그 필드를 모르므로 **더 엄하게 만들 수 없다** — 버전 필드는 구판 보호에 쓸모가 없다.
- 그래서 보호는 **쓰는 쪽(워크포스)** 에서 한다: 승인 앱이 서명해 거는 `approval.ctl` 의 `rx` 에 `'rms.issue.v2'` 가 있을 때만 워크포스 화면이 `pol`·`fl` 칸을 보이고 저장한다(이미 `rx` 에 `'rms.issue'` 가 있어야 승인 설정 보기를 여는 같은 방식 — WF:`IssueApprovalSettingService.js:72`).
- 구판 문서(`s/e/pa` 만): `pol`·`fl` 없음 = "워크포스가 정한 값 없음" → 하위 층(Jira 프로젝트 → 사이트) 값을 따른다. 기존 `pa` 의미 무변경.
- 남는 위험: 승인 앱을 v2 이전으로 **롤백**하면 이미 걸린 `pol` 은 무시된다(느슨해짐). 롤백 절차에 "워크포스 승인 설정에서 정책 칸 비우기 불필요 — 롤백 동안 사이트·프로젝트 값으로 판정됨"을 적고 수용한다(linked-issue-schedule §5.8 의 보장 범위 밖 목록에 한 줄 추가).
- `pol` **안**의 키는 닫힌 집합으로 검증한다(모르는 키 → 문서 무효). 미래에 키를 늘리면 새 토큰(`rms.issue.v3`)으로 게이트한다 — 무효 문서는 연동 이슈 쓰기를 미해결(fail-close)로 만드므로 열린 집합보다 안전하다.

### Q4. '내 이력'·'승인 관리' 데이터 양 → **새 인덱스 없음, SQL 추가 없음(major upgrade 아님).**

| 목록 | 쿼리 | 인덱스 | 200명 기준 규모 |
|---|---|---|---|
| 내 이력 (`listInbox` tab `history`) | `approval_inbox WHERE actor_key = ? AND ((role='APPROVER' AND (my_decided=1 OR acted_by_me=1)) OR (role='REQUESTER' AND is_open=0))` 키셋 `(updated_at, request_id)` | PK `(actor_key, request_id, role)` 접두 + `ix_inbox_open (actor_key, role, is_open, updated_at, request_id)` — 사람당 행이 연 수백이라 정렬 비용 무시 | 요청 연 1.2만~1.5만 → 업무함 행 연 ~4만, 사람당 ~200/년 |
| 승인 관리 (`listAllApprovals`) | `approval_request WHERE is_open = ? [AND target_kind IN …] [AND created_at 범위] [AND project_id = ?]` 키셋 `(updated_at DESC, request_id DESC)` | `ix_request_retention (is_open, updated_at, request_id)` — **진행 중/종료를 필수 분기**로 해서 이 인덱스를 탄다. 종류·기간·프로젝트는 잔여 조건 | 연 1.2만~1.5만 행, 종료분 누적 3년 ~4.5만 |

- 둘 다 기존 업무함의 "넘치게 읽고 열람 권한으로 거르기" 방식(`InboxService` 창 = max(1.5×limit, limit+10) ≤200, 최대 4회)을 그대로 쓴다.
- 규모 산정: 타임시트 200×12=2,400, 이슈 결재·상태 변경 ~4,000, 워크로그 사전 승인 ~6,000(사람당 30건 가정) → 연 ~1.2만.
- 확인: 개발 사이트에서 두 쿼리 `EXPLAIN` 으로 인덱스 사용 확인(§13 V-9, 플랫폼 아님·구현 단계 점검).

### 범위 확정

| 요구 | 범위 | 비고 |
|---|---|---|
| ① | 승인 앱: `linkedInputChannel` 삭제, `channel` 항상 APP, ctl `ch:'APP'` 고정 + 게시 버전 올림. 워크포스: 작성·수정·삭제·드래그·기간 입력을 **한 판정 함수**로, 확인 불가는 직접 쓰기 금지 | 서버측 수정·삭제 강제는 워크포스에 없다(프론트 직접 PUT/DELETE). §1.5 보장 범위 |
| ② | 승인 앱: 팀 탭 "워크포스에서 받은 팀" 읽기 전용, 내 타임시트·상세 결재자 이름 | 데이터는 W-8a 이후(Q146) |
| ③ | 승인 앱: 이슈 화면 편집 UI 전부 제거(정책 패널·결재선 선택), 읽기 전용 두 줄, 프로젝트 설정 이슈 예외 목록, 문구 재작성, `selectIssueWorklogApprovalFlow` 축·화면 이동 | A-7 폐기(Q141) |
| ④ | 계약: `rms.issue` 에 `pol`·`fl`, 새 문서 `approval.flows`, ctl `rx` 토큰 `'rms.issue.v2'`. 워크포스 표·일괄 모달 확장, PM·팀장 읽기 전용 | ④a(정책 키) / ④b(결재선) 분리 |
| ⑤ | 승인 앱: `getPrincipalContext`, 업무함 관리 묶음 관리자만, '내 이력', '승인 관리', '기록' 1차 메뉴, 설정 축소 | 새 resolver 3 + `listInbox` tab 1 |

---

## 1. 개요·영향 범위

| 영역 | 승인 앱 | 워크포스 |
|---|---|---|
| 도메인(순수) | 신규 `domain/workforce/teamsFromOrgs.js`(②), `domain/linkedIssue/setting.js` 확장(`stricterSetting` 에 `pol`·`fl`), `domain/worklogPolicy/merge.js`(LINKED_ISSUE 층 `pol` 적용·연동 이슈 JIRA_ISSUE 층 생략), `domain/inbox/historyFilter.js`(⑤ 기간·역할 → 필터) | `components/worklog/writeChannel.js`(① 단일 판정), `integration/approval/issueSetting.js`(`pol`·`fl`), 신규 `integration/approval/flowsDoc.js`(검증) |
| resolver | 신규 `getPrincipalContext`·`listAllApprovals`·`sendApprovalReminder`·`listWorkforceTeams`·`listIssueWorklogExceptions`·`lookupProjectIssue`. 변경 `selectIssueWorklogApprovalFlow`(축·입력)·`getIssueWorklogApprovalPolicy`(응답)·`listInbox`(tab `history`·`targetKinds`)·`getLinkedIssueOverview`(응답 가산)·`getIssueWorklogs`(`control.channel` 삭제)·`saveIssueWorklogPolicy`(연동 이슈 거부)·`saveWorklogApprovalConfig`(flows 게시 touch)·`saveApprovalSettings`(`linkedInputChannel` 거부) | 변경 `getIssueWorklogControl`(응답 `writeChannel`·cap touch)·`createIssueWorklog`(cause.path 전체)·`listIssueApprovalSettings`·`saveIssueApprovalSettings`(pol·fl·flows·PM·팀장) |
| 스키마 | **없음** | 없음(워크포스 DB 무증가) |
| 게시 | ctl 본문 `ch:'APP'` 고정·`rx` 에 `'rms.issue.v2'`, 신규 프로젝트 프로퍼티 `movesApproval.flows`(같은 `workforce_publish` 원장, `account_id='F:{projectId}'`, `doc_key='flows'`) | `movesRms.issue` 본문 `pol`·`fl` |
| 계약 7파일 | `contract.js`·`vectors.json`(두 리포 바이트 동일) | 같음 |
| manifest | 무변경(모듈·scope 추가 없음) | 무변경 |
| 엔트리 | 추가 없음. `inbox` 엔트리 뷰 3개(`history`·`manage`·`records`), `projectSettings` 엔트리에 이슈 예외 섹션 | 추가 없음 |
| i18n | `inbox`·`worklog`·`worklogApproval`·`worklogPolicy`(재작성)·`project`·`workforce`·`timesheet`·`error` | `issueApprovalSetting`·`issuePanel` |

---

## 2. 경계면 계약 (승인 앱 resolver — 전부)

권한 축 표기는 `PermissionMap` 그대로. 응답은 `{success:true, ...아래}`.

### 2.1 신규

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getPrincipalContext` | `'SELF'` | `{}` | `{accountId, isAdmin:boolean, isJiraAdmin:boolean}` — `isAdmin` = 앱 관리자 명부(KVS `approval:settings:managers`) ∪ Jira 관리자(`mypermissions ADMINISTER`), 서버 `resolveAdminPrincipal` 판정. 실패 부분은 false | `PERMISSION_DENIED`(미인증) | 업무함 메뉴(`InboxPage` groups), 설정 엔트리 |
| `listAllApprovals` | `{admin:true}` | `{scope:'OPEN'\|'CLOSED', filters?:{targetKinds?:TargetKind[]≤6, from?:'YYYY-MM-DD', to?:'YYYY-MM-DD'(생성일, 포함), projectId?:numeric}, cursor?:string, limit?:1..50(기본 25)}` | `{items:[{requestId, targetKind, title, issueKey\|null, projectKey\|null, status, isOpen, requesterKey, currentStep:{order, name\|null, pendingApproverKeys:string[]}\|null, createdAt, updatedAt, expiresAt\|null, canCancel:boolean, canRemind:boolean}], hiddenCount:number, nextCursor:string\|null, incomplete:boolean}` — 행은 `filterVisibleRows`(조회자 asUser 열람)로 **걸러서 뺀다**, 뺀 수는 `hiddenCount`. `canCancel` = 조회자 Jira 관리자 ∧ 열림(기존 `cancelApproval` 규칙). `canRemind` = 열림 ∧ 현재 단계 대기자 ≥1 | `INVALID_TARGET`(입력), `STORAGE_NOT_READY` | 업무함 › 승인 관리 |
| `sendApprovalReminder` | `{admin:true}` | `{requestId:uuid}` | `{requestId, notified:number, already:boolean}` — 현재 단계 미결정 결재자에게 알림 `REMINDER`, 이벤트 키 `reminder:manual:{requestId}:{stepOrder}:{YYYY-MM-DD(사이트 tz)}`(UNIQUE `uq_notif` 로 하루 1회, Q148). 대상 열람은 `assertTargetVisible`(조회자) | `REQUEST_NOT_FOUND`(열람 불가 포함), `REQUEST_NOT_PENDING` | 승인 관리 행 "독촉" |
| `listWorkforceTeams` | `{admin:true}` | `{}` | `{enabled:boolean, teams:[{teamKey /*'wf:'접두*/, teamName\|null, leaderKeys:string[], memberKeys:string[], memberCount, lastReceivedAt:number\|null, state:'VERIFIED'\|'STALE'\|'NONE', rosterOverlap:string[] /*명부 팀에도 있는 팀원 = 워크포스 우선*/}], orgDocs:{verified, stale, total}, refreshCandidates:string[]≤50, truncated:boolean}` — `enabled=false`(연동 꺼짐)이면 `teams:[]`, SQL 0 | `STORAGE_NOT_READY` | 설정 › 타임시트 › 팀 탭 |
| `listIssueWorklogExceptions` | `{project:'admin', projectIdKey:'projectId'}` | `{projectId, cursor?:issueId, limit?:1..50(기본 25)}` | `{linkMode:boolean, items:[{issueId, issueKey\|null, summary\|null, linked:boolean, managedBy:'APP'\|'WORKFORCE', policy:{override:object, overrideRevision:number, keys:string[]}\|null, flow:{flowId, label\|null, rev, valid:boolean}\|null, workforce:{s,e,pa,pol,fl, by, srcRev}\|null}], hiddenCount, nextCursor\|null, flows:{required:boolean, defaultFlowId\|null, options:[{id,label}]}}` — 대상 이슈 = 이 프로젝트의 비어 있지 않은 이슈 예외 ∪ 결재선 지정 행. 키·요약은 asUser `filterVisibleIssues`(못 보면 행 제외·`hiddenCount`) | `STORAGE_NOT_READY` | Jira 프로젝트 설정 › 이슈 예외 |
| `lookupProjectIssue` | `{project:'admin', projectIdKey:'projectId'}` | `{projectId, issueKey:string(≤255, /^[A-Za-z][A-Za-z0-9_]*-\d+$/)}` | `{issueId, issueKey, summary, linked:boolean}` — asUser `GET issue/{key}?fields=summary,project` | `INVALID_TARGET`(형식 오류·없음·열람 불가 — 셋을 구분하지 않는다), `PROJECT_ISSUE_MISMATCH`(다른 프로젝트 이슈) | 이슈 예외 "이슈 추가" |

### 2.2 변경

| resolver | 권한 축 | 입력 변경 | 응답 변경 | 에러 변경 | 소비 화면 |
|---|---|---|---|---|---|
| `selectIssueWorklogApprovalFlow` | **`{issue:'edit'}` → `{project:'admin', projectIdKey:'projectId'}`** | `{projectId, issueId, flowId:uuid\|null, rev}` — `projectId` 추가, `flowId:null` = 지정 해제(프로젝트 기본) | `{binding:{issueId, flowId\|null, rev}}` (기존 `{policy}` 삭제 — 이슈 화면 소비처가 사라짐) | + `PROJECT_ISSUE_MISMATCH`(이슈가 그 프로젝트 소속 아님), + `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`(연동 모드 ∧ 연동 이슈, Q140). 기존 `WORKLOG_POLICY_NOT_ALLOWED`·`WORKLOG_POLICY_CONFLICT` 유지 | 이슈 예외 목록 "결재선" 열(단독·비연동 이슈) |
| `getIssueWorklogApprovalPolicy` | `{issue:'view'}` 그대로 | — | **`{policy:{required, selectedFlow:{id,label}\|null, source:'WORKFORCE'\|'ISSUE'\|'PROJECT_DEFAULT'\|null, managedBy:'PROJECT_ADMIN'\|'WORKFORCE_LEAD', configRev, reasonCode:string\|null}}`** — `options`·`canSelect`·`bindingRev`·`selectedFlowId` 삭제 | 무변경 | 이슈 화면 읽기 전용 한 줄(`WorklogApprovalFlowLine`) |
| `saveIssueWorklogPolicy` | `{project:'admin'}` 그대로 | 무변경 | 무변경 | + `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`(연동 모드 ∧ 연동 이슈 ∧ override 가 `{}` 가 아님 — 비우기는 허용) | 이슈 예외 편집 모달 |
| `getIssueWorklogPolicy` | `{issue:'view'}` 그대로 | 무변경 | + `linked:boolean`, `managedBy:'APP'\|'WORKFORCE'` | 무변경 | 이슈 예외 편집 모달, 작업 로그 탭 요약 |
| `getLinkedIssueOverview` | 그대로 | — | `setting` 에 + `policy:object\|null`(검증된 `pol`, 키→값), `flow:{id,label}\|null`(`fl` 해석 결과), `flowInvalid:boolean` | 무변경 | `LinkedSettingSummary` |
| `getIssueWorklogs` / `getWorklogEditorContext` | 그대로 | — | `control.channel` **삭제** | — | `WorklogTab`(`linkStateOf`) |
| `listInbox` | `'SELF'` 그대로 | `tab` 에 `'history'` 추가. `filters` 에 + `targetKinds?:TargetKind[]`(서버 필터 — 모든 탭), + `role?:'ALL'\|'PROCESSED'\|'REQUESTED'`(history 전용), + `updatedFrom?/updatedTo?:'YYYY-MM-DD'`(history 전용, 끝은 다음 날 미포함) | 무변경(`{items, nextCursor, hasMore}`) | `INVALID_TARGET`(history 아닌 탭에 role) | 업무함 '내 이력' |
| `getInboxCounts` | 그대로 | `tab:'history'` 는 세지 않음(입력에 와도 무시) | 무변경 | — | — |
| `saveApprovalSettings` | `{admin:true}` 그대로 | `linkedInputChannel` 키 **삭제** — patch 에 있으면 `INVALID_TARGET` | 응답 정책 객체에서 `linkedInputChannel` 사라짐 | — | 워크포스 연동 설정 |
| `getApprovalSettings` | 그대로 | — | `linkedInputChannel` 삭제 | — | 같음 |
| `saveWorklogApprovalConfig` | 그대로 | 무변경 | 무변경 — 내부적으로 `approval.flows` 게시 touch(§6.3) | — | Jira 프로젝트 설정 |
| `getTimesheetDetail` | 그대로 | — | **무변경**(결재자는 `getApprovalDetail.steps` 에 이미 있다 — §4.3) | — | — |

### 2.3 에러 코드 신규 (`ErrorCodes` + `locales/{kr,en}/error.json`)

| code | cause | 의미 |
|---|---|---|
| `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` | `{issueId}` | 연동 모드의 연동 이슈 — 이슈 예외·결재선은 워크포스 작업관리 › 승인 설정에서 |

기존 `WORKLOG_POLICY_INVALID` 는 사전 승인 필수인데 결재선이 없을 때 cause 에 `{managedBy:'PROJECT_ADMIN'|'WORKFORCE_LEAD'}` 를 싣는다(`getIssueWorklogApprovalPolicy.reasonCode`·`createWorklogApproval` 거부 공통). 화면은 `managedBy` 로 "프로젝트 관리자에게" / "워크포스 팀장에게" 안내를 고른다(③ "누구에게 가서 설정하라").

---

## 3. ① 워크로그 쓰기 창구 통일

### 3.1 상태 머신 — 누가 실행하고 누가 넘기나

정의:
- **연동 모드** = 승인 앱 `SettingsRepository.isWorkforceLinkEnabled() === true` (operating-mode, 단일 판정).
- **워크포스 연동 대상(target)** = 워크포스 `settings.approvalLinkMode === 'ON'` ∧ 워크포스 프로젝트 소속(`creationTarget` — 앱 필드 `moves_RMS_projectId` + `filterMembers`, WF:`IssueWorklogControlService.js:106-121`).
- **ctl 확인** = 워크포스 `ApprovalControlLookup.forIssue` 가 서명 검증한 `movesApproval.ctl`(이슈 → 프로젝트) 이고 `ui.globalPagePath` 가 형식(`/jira/apps/{uuid}/{uuid}/worklog/`)에 맞음.
- 승인 앱 쪽 **연동 이슈** = `ControlLinkJudge.linkOf(...).linked`(rms.policy I:/P:ALL_ISSUES, 신선도).

#### 3.1.1 승인 앱 (실행자)

| 연동 모드 | 이슈 | 작업 | 작업 로그 탭 | Log work 대화상자(••• 메뉴) | 전역 페이지 `worklog/{issueId}/new…` · `worklog/{issueId}/{worklogId}` |
|---|---|---|---|---|---|
| 꺼짐 | 무관 | 작성 | 실행(STANDARD 레이아웃) | 실행 | 실행 |
| 꺼짐 | 무관 | 수정·삭제 | 실행(상세 모달) | — | 실행 |
| 켜짐 | 비연동 | 작성·수정·삭제 | 실행(STANDARD) | 실행 | 실행 |
| 켜짐 | 연동 | 작성 | **실행(LINKED 레이아웃 `LinkedWorklogPanel`)** — 지금도 서버는 받는다(lis H3: 숨김만 있었다) | **실행** | **실행**(`WorklogCreateHandoffPage`, `forceCreate`) |
| 켜짐 | 연동 | 수정·삭제 | 실행(통제분은 asApp, worklog-control §4.2) | — | 실행(`WorklogHandoffPage`) |
| 켜짐 | 판정 불명(`linkUnavailable`) | 전부 | 실행 + 경고(기간 창 ON 이면 미해결로 쓰기 거부 — 기존 fail-close) | 같음 | 같음 |

- 바뀌는 것: `WorklogControlContext.contextFor` 의 `channel` 칸 삭제(lis `:108`), `controlView` 의 `channel` 삭제(`:120`), 프론트 `linkStateOf` 의 `channel === 'WORKFORCE' → 'LINKED'` 분기 삭제(`worklogControlModel.js:216` — 이제 `UNAVAILABLE` 또는 `NOT_LINKED`; 연동 표시는 `getLinkedIssueOverview.layout` 이 이미 한다).
- 서버 판정·검사 순서·asApp 실행 주체는 **무변경**(worklog-control §4.2).

#### 3.1.2 워크포스 (넘기는 쪽) — 단일 판정 함수

신규 순수 함수 WF:`static/ui/src/components/worklog/writeChannel.js`(서버도 같은 파일을 `src/domain/approvalLink/writeChannel.js` 로 복제 — 워크포스는 UI·백엔드 패키지가 분리돼 공유 import 불가, 같은 표 테스트를 양쪽에 둔다):

```js
/** @returns 'DIRECT' | 'HANDOFF' | 'BLOCKED' */
writeChannelOf({ linkMode /*'ON'|'OFF'|null*/, target /*true|false|null(모름)*/, ctl /*{verified, globalPagePath}|null*/ })
```

| # | `approvalLinkMode` | 대상(target) | ctl | 결과 | 작성·수정·삭제·드래그·기간 입력 공통 |
|---|---|---|---|---|---|
| W1 | OFF | — | — | DIRECT | 지금처럼 워크포스가 직접 POST/PUT/DELETE (**단독 경로 무변경**) |
| W2 | ON | false(비소속) | — | DIRECT | 같음 |
| W3 | ON | true | 검증됨 + 경로 있음(`ch` 값 무관 — `APP`·`WORKFORCE`·없음 모두) | **HANDOFF** | 직접 쓰기 없음, "승인 앱에서 기록/수정" 버튼 |
| W4 | ON | true | 문서 없음·서명 실패·신뢰 키 없음·읽기 실패·경로 없음 | **BLOCKED** | 직접 쓰기 없음, 안내(`create.unconfirmed`) + 다시 시도 |
| W5 | ON | null(소속 판정 실패·필드 없음) | — | **BLOCKED** | 같음 |
| W6 | 모름(화면이 설정을 아직 못 읽음) | — | — | 서버 응답 대기 → 실패면 BLOCKED | 같음 |

- **`ch` 를 더는 보지 않는다.** 지금의 "`ch:'WORKFORCE'` = 직접 작성 허가"(WF:`IssueWorklogControlService.js:100`, UI `createChannel.js:7`)를 없앤다. 승인 앱 신버전은 `ch:'APP'` 만 쓰고(§3.3), 구판 승인 앱이 건 `ch:'WORKFORCE'` 문서여도 승인 앱 서버는 연동 이슈 작성을 받으므로(§3.1.1) 넘김이 안전하다 → 두 리포 배포 순서가 서로 묶이지 않는다.
- 판정 입력 출처: `linkMode` 는 워크포스 기존 설정 조회(`getSettingDataService` 결과를 화면이 이미 갖는 설정 스토어) — OFF 면 서버를 부르지 않는다(단독 사이트 비용 무변경). ON 이면 `getIssueWorklogControl` 응답의 새 칸 `writeChannel` 이 정답이고 화면은 그것만 쓴다.

#### 3.1.3 워크포스 화면별 처분 (W3 HANDOFF / W4·W5 BLOCKED 일 때)

| 화면 | 작업 | 지금 (WF 코드) | 바꾼 뒤 |
|---|---|---|---|
| 이슈 패널 `PanelWorklogForm.jsx` | 작성 | `createChannelOf(approval)` — HANDOFF 면 넘김 버튼(:128-140), DIRECT 면 `write.create`(:92) | 같은 자리, 판정만 `writeChannel`. **패널 control 조회를 표식(`movesRmsLink.linked`)과 무관하게** `linkMode==='ON'` 이면 항상(`useIssuePanelData.js:117,128` 조건 교체 — 표식은 누구나 지우거나 위조할 수 있다) |
| 이슈 패널 `PanelRecentWorklogs`/`PanelWorklogRowActions` | 수정·삭제 | `resolveApprovalRowMode` 가 `linked` 로 판정(`panelApproval.js:22-26`) → 판정 실패면 DIRECT PUT/DELETE(:59, :183) | `resolveApprovalRowMode({worklog, accountId, writeChannel})` — HANDOFF 면 넘김(`PanelWorklogHandoff`), BLOCKED 면 행 버튼 비활성 + 툴팁, DIRECT 만 기존 |
| 마이워크 모달 `WorklogModal.jsx` | 작성(단건) | `createBlocked = !worklog_id && createChannel !== 'DIRECT'`(:176), 넘김 버튼 `create.open`(:498-501) | 판정 `writeChannel`. 넘김 경로에 날짜·시작·종료(§3.2) |
| 같음 | 기간 일괄 입력 | 첫 날 넘김(:777-780), 비대상은 날짜별 POST + 실패 시 직접 DELETE 되돌림(:449-470) | 무변경(HANDOFF 면 첫 날 넘김, DIRECT 만 루프·되돌림) |
| 같음 | 수정 | `handoffOnly = linked && (내 것)`(:177) — `getIssueWorklogControl` 실패면 linked 모름 → **DIRECT PUT**(:429-438) | `writeChannel !== 'DIRECT'` 이면 입력 비활성. HANDOFF 면 `handoff.open`(:493-496), BLOCKED 면 안내 + 다시 시도. **실패 = BLOCKED**(linkMode ON 일 때) |
| 같음 | 삭제 | `handoffOnly` 일 때 숨김(:503-508), 아니면 직접 DELETE(:392-405) | DIRECT 일 때만 버튼 |
| 마이워크 캘린더 `WorklogPage.jsx` | 드래그 이동 | `isApprovalLinkedIssue` true → 말없이 revert(:342-345), 실패면 false → **직접 PUT**(:355) | 이동 전 `writeChannel`(같은 이슈 캐시 5분): HANDOFF → revert + 토스트 "승인 앱에서 수정" + 링크(수정 넘김 경로), BLOCKED → revert + 토스트 unconfirmed, DIRECT 만 PUT |
| 같음 | 날짜 클릭·추가·행 클릭 | `WorklogModal` | 모달 규칙 |
| 프로젝트 캘린더 `calender/worklogDrop.js` | 드래그 이동 | `isApprovalLinked` true → revert + 토스트(:33-37), 실패면 **직접 PUT**(:44-48) | 마이워크와 같은 규칙(`isApprovalLinked` 를 `writeChannelOf` 로 교체, 실패 = BLOCKED) |
| 같음 | 작성·수정 | `WorklogModal` 공용 | 모달 규칙 |
| (리사이즈) | — | `eventDurationEditable={false}`(`FullCalendar.jsx:163`) | 무변경 |

- `isApprovalLinkedIssue`(`worklogWrite.js:112-119`, 실패 = false = DIRECT)는 **삭제**하고 `writeChannelFor(issueIdOrKey)` 로 바꾼다(실패 = BLOCKED, 단 linkMode OFF 면 호출 없이 DIRECT).
- 서버 `createIssueWorklog`: W3 이면 `WORKLOG_CREATE_HANDOFF_REQUIRED` cause `{path}` 의 path 를 **프리필 전체 경로**로(§3.2), W4·W5 면 `WORKLOG_LINK_UNCONFIRMED`(지금과 같음). 수정·삭제는 워크포스 서버 경로가 없다(프론트 직접 PUT/DELETE) — 화면 판정이 유일한 관문(§3.5 보장 범위).

### 3.2 HANDOFF 경로 — payload 와 `globalPagePath` 출처

| 항목 | 값 |
|---|---|
| 출처 | 승인 앱 `WorklogControlCtl.globalPagePathOf()` — `getAppContext().appAri`·`environmentAri` 에서 앱·환경 UUID → `/jira/apps/{appId}/{envId}/worklog/`(lis `WorklogControlCtl.js:18-27`). 못 얻으면 null |
| 운반 | 서명 문서 `movesApproval.ctl` 본문 `ui.globalPagePath`(이슈 프로퍼티 I: 또는 프로젝트 프로퍼티 P:) — 게시는 `WorkforcePublisher`(원장 `workforce_publish`) |
| 검증 | 워크포스 `controlDoc.verifyControlDoc`(서명·cloud·ent) + 경로 형식 `HANDOFF_BASE`(WF:`controlDoc.js:16-17`, `:43`). 형식 밖이면 null → BLOCKED(W4) |
| 작성 경로 | `{globalPagePath}{issueId}/new` · `/new/{YYYY-MM-DD}` · `/new/{YYYY-MM-DD}/{HHmm}-{HHmm}` — 쿼리스트링 금지(경로명만 파싱) |
| 프리필 규칙 | 날짜 = 폼의 작업 날짜(현지). 시작·종료 = 폼의 시작 시각과 `시작 + 소요`(같은 날 안, `end > start`). 소요만 있고 시각이 없거나 자정을 넘기면 날짜만. 기존 `createHandoffPath(control, issueId, date, startTime, endTime)`(WF:`createChannel.js:11-17`) 재사용 |
| 서버 cause.path | 지금 `…/{issueId}/new`(:308-311) → 서버가 받은 `started`·`timeSpentSeconds` 를 `ctl.tz` 로 현지 변환해 같은 규칙으로 전체 경로. 화면은 이 path 를 우선 쓰고, 없으면 자체 생성 |
| 수정·삭제 경로 | `{globalPagePath}{issueId}/{worklogId}`(기존 `approvalHandoffPath`, WF:`panelApproval.js:29-34`) |
| 승인 앱 수신 | `parseCreateHandoffPath`·`parseHandoffPath`(lis `static/ui/src/features/worklog/handoffPath.js`) → `inbox` 엔트리 라우트 `WorklogCreateHandoffPage`(`forceCreate`, `initialDraft={date,startTime,endTime}`) / `WorklogHandoffPage` — **무변경** |
| 이동 | `@forge/bridge` `router.navigate(path)`(미검증 G-HANDOFF, §13) |

### 3.3 승인 앱 게시 변경 (`approval.ctl`)

| 칸 | 지금 | 바꾼 뒤 |
|---|---|---|
| `ch` | `policy.linkedInputChannel === 'APP' ? 'APP' : 'WORKFORCE'`(lis `WorklogControlCtl.js:74`) | 항상 `'APP'` |
| `rx` | `['rms.issue','rms.kb']` | ④a 배포 때 `['rms.issue','rms.kb','rms.issue.v2']`, ④b 배포 때 `+ 'approval.flows'` |
| `publicationVersion()` | `linked-issue:1:{ctlRev}:{linkedInputChannel}`(:51) | `linked-issue:2:{ctlRev}:{rxDigest}` — 버전이 바뀌면 기존 일일 `workforce` 큐 작업이 전량 touch → 재게시(새 스케줄 없음). `rxDigest` 는 `rx` 배열 문자열(토큰이 늘면 다시 전량) |
| `SettingsService` `linkedInputChannel` patch 시 `ctlRev+1`(lis `SettingsService.js:317-319`) | 삭제 | — |

### 3.4 `linkedInputChannel` 삭제 (Q147)

`SettingsRepository`: `SETTINGS_KEYS.linkedInputChannel`(lis `:46`)·`DEFAULT_APPROVAL_SETTINGS.linkedInputChannel`(`:164`)·GLOBAL_ONLY 목록(`:190`) 셋을 **같이** 뺀다(정책 기본값 ↔ KVS 키맵 계약 테스트가 대조). `SettingsService.normalizeSettingsPatch` 의 `enumValue(['APP','WORKFORCE'])`(`:144`) 삭제 → 알 수 없는 키로 `INVALID_TARGET`. 소비처 `WorklogControlContext:108`·`WorklogControlCtl:51,74`·`WorklogControlDetector:162`·`WorkforceLinkSettings.jsx:39-47` 정리. KVS 에 남은 값은 읽지 않는다(삭제 마이그레이션 불필요).

### 3.5 보장 범위 (① 뒤)

- 워크포스 **화면**에서 연동 대상 이슈로 나가는 워크로그 POST/PUT/DELETE 는 0(테스트로 고정, §15).
- 워크포스 서버는 작성만 강제(`createIssueWorklog` 판정). 수정·삭제는 프론트 직접 Jira 호출이라 낡은 번들·REST 는 막지 못한다 — 승인 앱 사후 감지(다른 경로 입력·LINKED_DIRECT_WF·타임시트 제출 대조)가 그대로 처리한다(worklog-control §0.2, linked-issue-schedule §5.7).
- Jira 기본 화면·REST·자동화: 범위 밖(요구서).

---

## 4. ② 결재자 표시

### 4.1 원천과 경계

- 원천은 `workforce_inbound` 의 **검증된** `rms.org` 뿐(불변식 9). 프로퍼티 원문은 읽지 않는다. 워크포스 DB 무증가.
- 팀 목록은 관리자 축 `{admin:true}`. 사람 이름은 화면이 기존 `resolveUsers`(`'SELF'`, asUser bulk)로 — 관리자 조회자 권한으로 displayName(불변식 7: 가드 통과 후에도 이름은 조회자 자격).
- 연동 꺼짐이면 SQL 0(기존 `WorkforceOrgSource` 와 같은 규칙: `isWorkforceLinkEnabled()` 하나로 판정).

### 4.2 `listWorkforceTeams` 처리

1. `isWorkforceLinkEnabled()` false → `{enabled:false, teams:[], orgDocs:{0,0,0}, refreshCandidates:[], truncated:false}`.
2. `WorkforceLinkRepository.pageOrgRows({after, limit:200})` 신규: `SELECT entity_id, status, body_json, kid, issued_at, verified_at, checked_at FROM workforce_inbound WHERE typ='rms.org' AND entity_id > ? ORDER BY entity_id LIMIT 200` — 최대 5페이지(1,000 문서). 넘으면 `truncated:true`.
3. 순수 `teamsFromOrgs({rows, now, maxIatAgeMs: 30일})`(§7.1).
4. 겹침: 팀원 accountId 집합으로 `TeamRepository.rosterMembership(accountIds)` 신규(`SELECT account_id FROM timesheet_team_member WHERE account_id IN (…) AND role='MEMBER'`, 500개씩) → 팀별 `rosterOverlap`. 이 사람들은 결재선·팀장 범위에서 워크포스가 우선이다(`TeamScope` 의 `overriddenSubjects` 와 같은 규칙 — 표시만, 판정은 무변경).
5. `refreshCandidates` = 팀원 문서의 `leaderKeys` 중 팀장 문서가 캐시에 없거나 `STALE` 인 accountId, ≤50.

SQL: 1~5(문서) + ⌈팀원/500⌉(명부). Jira 0.

### 4.3 화면

| 위치 | 내용 | 데이터 |
|---|---|---|
| 설정 › 타임시트 › 팀 탭(`TimesheetTeamSettings.jsx`) 아래 새 섹션 `WorkforceTeamsSection` | 연동 모드에서만(모드 null 이면 표시 — operating-mode fail-open). 제목 "워크포스에서 받은 팀"·한 줄 안내. 표: 팀명 · 팀장(이름) · 팀원 수(펼치면 이름) · 마지막 수신 · 상태 로젠지(VERIFIED 확인됨/STALE 오래됨/NONE 팀장 문서 없음) · "워크포스 우선 N명" 배지(rosterOverlap). 비었으면 "워크포스가 아직 팀 구조를 보내지 않았습니다(워크포스 버전 확인)" (Q146). 버튼 "팀장 문서 다시 읽기"(`refreshCandidates` 가 있을 때) → `refreshWorkforceCapabilities({accountIds})` → 목록 무효화 | `listWorkforceTeams`, `resolveUsers`, `refreshWorkforceCapabilities` |
| 내 타임시트 `MyTimesheetPage`·`SubmitBar` | 지금 `RoutingSourceBadge` + 팀명. 가산: "결재자: {이름들}"(첫 단계 `routing.approverKeys` — 이미 응답에 있음, lis `TimesheetService.js:428-435`) + 출처 배지. 이름은 `resolveUsers` | 기존 `getMyTimesheet` |
| 타임시트 상세 `TimesheetSnapshotSection` | 지금 출처 배지만. 가산: "결재자: {이름들}" — 부모 `ApprovalDetail` 이 이미 가진 `approval.steps[].approvers`(이름 해석 완료, `ApprovalDetail.jsx:297-308`)를 prop `approverNames` 로 받는다. **백엔드 변경 없음** | 기존 `getApprovalDetail` |

---

## 5. ③ 이슈 화면 정리 · 이슈 예외 · 결재선 선택 이동

### 5.1 원칙 (사용자, 2026-10-13)

이슈 화면(우측 "Moves Approval" 칸 `IssueApprovalOverview`·하단 패널·작업 로그 탭)에서 하는 일은 **기록 / 기록한 것 보기 / 승인 요청 / 이력 보기** 넷뿐. 이슈별 정책을 손보는 UI 는 하나도 두지 않는다.

### 5.2 이슈 화면에서 빼는 것 / 남기는 것

| 위치 | 지금 (lis) | 바꾼 뒤 |
|---|---|---|
| `WorklogTab` 작업 로그 표 아래 `<details data-testid="worklog-issue-policy">` + `WorklogPolicyPanel scope="issue"`(`WorklogTab.jsx:294-301`) | 편집 가능한 이슈 정책 패널 | **삭제**. 대신 표 위 `WorklogPolicySummary` 한 줄(기존 컴포넌트, 제한이 걸린 항목만 — 기록 가능 일수·하루 상한·주 상한, 전부 기본이면 "제한 없음") + 출처 칩("사이트 기본값"/"이 프로젝트"/"이 이슈 예외"/"워크포스 팀장") |
| `WorklogTab` '승인 요청' 하위 탭의 `WorklogApprovalPolicyPanel`(`:309`) | 결재선 `<select>`(`selectIssueWorklogApprovalFlow`) | **삭제** → `WorklogApprovalFlowLine`(읽기 전용) |
| `IssueApprovalOverview` 의 `WorklogApprovalPolicyPanel`(`IssueApprovalOverview.jsx:39`) | 같음 | **삭제** → `WorklogApprovalFlowLine` |
| `LinkedWorklogPanel` › `LinkedSettingSummary` | 기간·사전 승인·저장 팀장 | + 정책 키 요약(`setting.policy`)·결재선 이름(`setting.flow`) 읽기 전용 |

`WorklogApprovalFlowLine`(신규, `features/worklogApproval/`) — `getIssueWorklogApprovalPolicy` 응답으로:
- `required=false` → 렌더 안 함(사전 승인 안 쓰는 이슈엔 말할 것이 없다).
- `required=true ∧ selectedFlow` → "이 이슈의 워크로그는 **{결재선}** 으로 승인됩니다" + 출처 칩(`source`: 워크포스 팀장 / 이 이슈 지정 / 프로젝트 기본).
- `required=true ∧ reasonCode` → 경고 한 줄: `managedBy==='WORKFORCE_LEAD'` 면 "결재선이 정해지지 않았습니다. 워크포스 작업관리 › 승인 설정에서 팀장이 지정해야 합니다", 아니면 "… 프로젝트 관리자가 Jira 프로젝트 설정 › Moves Approval 에서 지정해야 합니다".

`WorklogApprovalPolicyPanel.jsx` 와 그 테스트의 선택 관련 단언(`WorklogApproval.test.jsx:95-97`)은 삭제·교체.

### 5.3 결재선 해석 규칙 (`WorklogApprovalPolicy.read`)

```
flow 결정 순서(사전 승인 required 일 때):
 1. 연동 모드 ∧ 연동 이슈 ∧ 검증된 rms.issue.fl 이 있고 그 id 가 프로젝트 allowedFlowIds 안(그리고 steps≥1) → fl  (source WORKFORCE)
    fl 이 목록 밖 → 무시하고 2로, 응답 flowInvalid=true
 2. 비연동(또는 연동 모드 꺼짐) ∧ worklog_approval_binding(issueId, 현재 projectId) → 그 flow (source ISSUE)
    연동 이슈의 binding 행은 Q140(a)로 적용하지 않는다
 3. 프로젝트 기본 defaultFlowId (source PROJECT_DEFAULT)
 managedBy = (연동 모드 ∧ 연동 이슈) ? 'WORKFORCE_LEAD' : 'PROJECT_ADMIN'
```
- 이슈가 다른 프로젝트로 옮겨졌으면 binding 의 `project_id` 가 달라 무시된다(기존 `binding(issueId, projectId)` 조회 규칙 유지).
- `createWorklogApproval` 의 결재선 확정도 같은 `read()` 를 쓴다(이미 그렇다) — 해석 규칙 변경이 요청 경로에 자동 반영.

### 5.4 `selectIssueWorklogApprovalFlow` — 권한 축·호출 화면·저장 방식

| 항목 | 지금 | 바꾼 뒤 |
|---|---|---|
| 권한 축 | `{issue:'edit', appAccess:false}`(lis `PermissionMap.js:33`) — 이슈 편집자 누구나 | `{project:'admin', projectIdKey:'projectId'}` — 프로젝트 관리자(정책 편집과 같은 축, `saveIssueWorklogPolicy`·`saveWorklogApprovalConfig` 와 일치) |
| 호출 화면 | 이슈 화면 `WorklogApprovalPolicyPanel` | Jira 프로젝트 설정 › Moves Approval › **이슈 예외** 목록의 "결재선" 열(Q143). 연동 모드의 연동 이슈 행은 읽기 전용(워크포스 `fl` 표시) |
| 입력 | `{issueId, flowId, rev}` | `{projectId, issueId, flowId:uuid\|null, rev}` |
| 검사 순서 | 옵션 포함·rev | ① 가드: 프로젝트 관리자 ② `issueLoader(issueId)`(asUser) — 없거나 `projectId` 불일치 → `PROJECT_ISSUE_MISMATCH` ③ 연동 모드 ∧ 연동 이슈 → `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` ④ `flowId` 가 null 이 아니면 `config.allowedFlowIds` ∧ steps≥1 아니면 `WORKLOG_POLICY_NOT_ALLOWED` ⑤ `rev` 불일치 → `WORKLOG_POLICY_CONFLICT` |
| 저장 | `worklog_approval_binding`(PK issue_id, project_id, flow_id, rev) INSERT/조건부 UPDATE `rev=rev+1` | 같은 테이블·같은 CAS. **`flowId:null` = 행 삭제** `DELETE … WHERE issue_id=? AND project_id=? AND rev=?`(affectedRows 0 → CONFLICT). 프로젝트 범위 목록은 기존 인덱스 `idx_worklog_binding_project (project_id, flow_id)` 접두로 조회 |
| 감사 | 없음 | `recordSettingsAudit({action:'worklogApproval/bindIssue', projectId, issueId, before:{flowId}, after:{flowId}})` — 기존 설정 감사 행 형식(templateKey) |

### 5.5 이슈 예외 목록 (단독 모드 + 연동 모드의 비연동 이슈)

위치: `static/ui/src/entries/projectSettings.jsx`(`jira:projectSettingsPage`) — `WorklogApprovalConfig` 다음 섹션 `IssueExceptionList`(신규 `features/worklogPolicy/IssueExceptionList.jsx`). 앱 설정 › 프로젝트 › 정책 모달(`ProjectPolicyModal`)에는 "이슈별 예외는 Jira 프로젝트 설정 › Moves Approval 에서 정합니다" 한 줄(Q143).

| 요소 | 동작 | resolver |
|---|---|---|
| 목록 | 열: 이슈(키·요약) · 바꾼 항목(칩, 예 "하루 최대 6시간") · 결재선(이름 또는 "프로젝트 기본") · 관리(편집·삭제). 연동 이슈 행(연동 모드)은 "워크포스 관리" 로젠지 + 워크포스 값 요약, 편집 버튼 없음, 삭제만(승인 앱 저장분 정리) | `listIssueWorklogExceptions` |
| 이슈 추가 | 이슈 키 입력 → 확인 → 편집 모달 | `lookupProjectIssue` |
| 편집 모달 | `WorklogPolicyPanel scope="issue"`(기존 컴포넌트를 이 모달 안에서만 씀 — 이슈 화면에서는 쓰지 않는다) + 결재선 select(사전 승인 required 프로젝트에서만) | `getIssueWorklogPolicy`, `saveIssueWorklogPolicy`(expectedRevision·override), `selectIssueWorklogApprovalFlow` |
| 삭제 | 정책 `override:{}` 저장 + 결재선 `flowId:null` | 두 resolver |
| 빈 상태 | "이슈별 예외가 없습니다. 모든 이슈가 프로젝트 정책을 따릅니다." | — |

`listIssueWorklogExceptions` 처리:
1. 대상 id: `SELECT issue_id FROM worklog_policy_issue_override WHERE project_id=? AND issue_id>? AND policy_json <> '{}' UNION SELECT issue_id FROM worklog_approval_binding WHERE project_id=? AND issue_id>? ORDER BY issue_id LIMIT ?` (SQL 1, 두 테이블 모두 `(project_id, …)` 인덱스 접두).
2. 상세: `repo.issues(ids)`(기존), `WorklogApprovalRepository.bindingsOf(ids, projectId)` 신규(SQL 1).
3. 연동(연동 모드일 때만): `workforce.findInboundMany('rms.policy', ['I:…', 'P:{projectId}'])` + `findInboundMany('rms.issue', …)`(SQL 2) → `controlLinkOf`.
4. 열람: `filterVisibleIssues(ids)`(asUser permissions/check + bulkfetch, 기존).
5. 결재선 옵션: `WorklogApprovalPolicy.config(projectId)` + `listAvailableFlows`(기존).

### 5.6 정책 계층 변경 (`mergePolicy`)

| 층 | 지금 | 바꾼 뒤 |
|---|---|---|
| SITE → WORKFORCE_PROJECT → WORKFORCE_ISSUE → JIRA_PROJECT | 무변경 | 무변경 |
| JIRA_ISSUE | 항상 적용 | **연동 모드 ∧ 연동 이슈면 생략**(Q140 a). 생략 사실은 `keys[k].ignored.push({source:'JIRA_ISSUE', reason:'MANAGED_BY_WORKFORCE'})` 로 남겨 지원용 정보에 보인다 |
| LINKED_ISSUE | `pa` → `approvalMode` 만 | + `pol` 의 키(7개)를 그대로 적용(source `LINKED_ISSUE`, sourceRevision `li:{issueId}:{rev}`) — Q139-Q1 "팀장 값 우선"과 같다(느슨하게도 가능) |

입력: `resolveBatch` 가 이미 읽는 `rms.policy` I:/P: 행으로 `controlLinkOf` 를 계산해(SQL 0 추가) `mergePolicy({…, linkedIssue, issueLinked})` 로 넘긴다.

### 5.7 문구 재작성 (`worklogPolicy.*`) — 내부 용어 제거, 안내 2문장 이내

| 키 | 지금(요지) | 새 값(kr) |
|---|---|---|
| `hierarchy` | "사이트 기본값 → Workforce 프로젝트 → … 순서로 항목별 적용…" | 정한 항목만 바뀌고 나머지는 위 단계(프로젝트 → 사이트 기본값)를 따릅니다. 워크포스 연동 작업은 워크포스 팀장이 정한 값이 우선합니다. |
| `hierarchyShort` | "체크한 항목만 … 워크포스가 고정한 항목은 …" | 체크한 항목만 여기서 바뀝니다. |
| `lockNotice` | "Workforce 잠금은 완화할 수 없습니다 … 서버가 최종 검증합니다." | 워크포스가 고정한 항목은 더 엄격하게만 바꿀 수 있습니다. |
| `retentionNotice` | "보존 기간·승인 단위·시간대는 사이트 전용 … 정리 절차를 유지합니다." | 승인 단위·시간대·이력 보관 기간은 사이트 설정에서만 정합니다. |
| `writeNotice` | "… BLOCK 시간 상한 … EXTRA_STEP …" | 저장할 때 기록 가능 기간과 마감 여부를 다시 확인합니다. 시간 상한을 넘으면 설정에 따라 막히거나 타임시트에서 안내됩니다. |
| `refreshHelp` | "서명 오류는 … kid/trustedKids … rev …" | 워크포스 값을 받지 못하면 관리자에게 연동 상태 확인을 요청하세요. |
| `preapprovalFloor` | "… 계층 정책을 CERTIFICATION 으로 …" | 프로젝트에서 '먼저 승인받고 기록'을 필수로 정했다면 여기서 바꿔도 그대로 유지됩니다. |
| `migration` | "정수 리비전을 확인할 수 없어 …" | 설정 정보를 갱신하는 중이라 지금은 저장할 수 없습니다. 잠시 뒤 다시 열어 주세요. |
| `authority.FRESH` | 유효한 검증 캐시 | 최신 |
| `authority.STALE` | 만료 후 24시간 유예 · 마지막 검증본 적용 | 확인 기한 지남(하루 동안 마지막 값 사용) |
| `authority.EXPIRED` | 유예 종료 · 잠금 항목 관련 쓰기 차단 … | 확인 만료(고정 항목 관련 기록이 막힐 수 있음) |
| `authority.INVALID` | 검증 캐시 없음/유효하지 않음 | 확인할 수 없음 |
| `authority.ABSENT` | 수신 정책 없음 · 상위/로컬 정책 사용 | 받은 값 없음 |
| `counterNotice` | "카운터는 현재 응답 범위 … cache의 last_result …" | 지원 담당자용 수치입니다. 운영 통계가 아닙니다. (`diagnosticsSupport` details 안에만) |
| `notice.DAILY_MAX` / `WEEKLY_MAX` | `{limitSeconds}초` | 하루 최대 {limit} / 한 주 최대 {limit} — `limit` 은 화면이 분·시간으로 포맷(`formatDuration`) |
| `scope.issue` | 이 이슈에서 다르게 적용할 항목 | 이 이슈에만 다르게 적용할 항목 (편집 모달 제목) |
| 신규 `source.LINKED_ISSUE` | — | 워크포스 팀장 |
| 신규 `ignored.MANAGED_BY_WORKFORCE` | — | 워크포스 연동 작업이라 적용하지 않음 |

진단·수신 상태(authority 상태 표, 리비전, 카운터)는 관리자 설정의 `<details>` "상태 정보(지원용)"(`supportInfo`) 안에만. 경고(`authorityWarn.*`)는 접지 않는다(worklog-policy-ux §5 유지).

---

## 6. ④ 계약 변경 — `rms.issue` v2 · `approval.flows`

### 6.1 `contract.js` 변경 (두 리포 바이트 동일, `CONTRACT_VERSION` 1 유지 — 가산)

```js
// 이슈 범위 정책 키 — 승인 앱 catalog.js 의 이슈 허용 키와 같은 집합·범위(contract.js 는 import 금지라 인라인)
export const ISSUE_POLICY_KEYS = Object.freeze({
  createWindowDays: 'days', editWindowDays: 'days', deleteWindowDays: 'days', pastDateMaxDays: 'days',
  dailyMaxSeconds: 'daySec', weeklyMaxSeconds: 'weekSec', futureDateAllowed: 'bool',
});
const issuePolicyValid = (p) => isObj(p) && Object.keys(p).length <= 7 && Object.entries(p).every(([k, v]) => {
  const kind = ISSUE_POLICY_KEYS[k];
  if (kind === 'days') return Number.isSafeInteger(v) && v >= 0 && v <= 3650;
  if (kind === 'daySec') return Number.isSafeInteger(v) && v >= 0 && v <= 86400 && v % 60 === 0;
  if (kind === 'weekSec') return Number.isSafeInteger(v) && v >= 0 && v <= 604800 && v % 60 === 0;
  if (kind === 'bool') return typeof v === 'boolean';
  return false;                                   // 모르는 키 → 문서 무효(Q3)
});

// validators[TYP.RMS_ISSUE] 에 가산:
//   && nullable(b.pol, issuePolicyValid) && nullable(b.fl, (v) => typeof v === 'string' && UUID.test(v))

TYP.APPROVAL_FLOWS = 'approval.flows'; TYP_FAMILY[TYP.APPROVAL_FLOWS] = Family.APPROVAL;
PROPERTY_KEY.APPROVAL_FLOWS = 'movesApproval.flows';
// entOf: case TYP.APPROVAL_FLOWS: return pick('projectId');
// validators[TYP.APPROVAL_FLOWS]:
//   typeof b.req === 'boolean' && nullable(b.def, uuid)
//   && Array.isArray(b.fo) && b.fo.length <= 20
//   && b.fo.every((f) => isObj(f) && typeof f.id === 'string' && UUID.test(f.id) && typeof f.n === 'string' && f.n.length >= 1 && f.n.length <= 120)
//   && (b.def == null || b.fo.some((f) => f.id === b.def)) && nonNegInt(b.rev)
```

| 항목 | 내용 |
|---|---|
| typ | `rms.issue`(기존, 칸 가산) / `approval.flows`(신규) |
| body 필드 | `rms.issue`: `{s, e, pa, by, tk, rev}` + **`pol: {키:값}\|null`**, **`fl: uuid\|null`**. `approval.flows`: `{req, def, fo:[{id, n}], rev}` |
| `pa` 와 `approvalMode` | 같은 뜻이다(`REQUIRED`=PREAPPROVAL, `NOT_REQUIRED`=CERTIFICATION, null=기본). ④ "approvalMode 선택"은 **`pa` 칸 재사용**(새 키 없음), 워크포스 화면 라벨만 "작업 시간 승인 방식"으로 |
| version | 본문 버전 없음(Q3). 쓰는 쪽 게이트 = ctl `rx` 토큰 `'rms.issue.v2'`(pol·fl), `'approval.flows'`(결재선 옵션) |
| validateBody | 위. `pol` 안 모르는 키·범위 밖 → 문서 전체 무효 |
| keyring | **무변경** — `rms.issue` 는 WORKFORCE 계열 키(wf-*), `approval.flows` 는 APPROVAL 계열 키(ap-*)로 서명. 기존 dev·stg 키 그대로 |
| vectors.json | `signatures[]` 에 ① `rms.issue` + `pol`·`fl` ② `rms.issue` 구판(`s/e/pa` 만 — 신판 validator 통과 고정) ③ `approval.flows` 1건. 워크포스 `vectors.test.js` 지문 표(contract.js·vectors.json) 갱신 |
| 크기 | `rms.issue` ≈ 400B → ≈ 650B. `approval.flows` ≤ 20×(36+120+여유) ≈ 4KB(엔티티 프로퍼티 32KB 안) |

### 6.2 구판 문서 호환 규칙

| 상황 | 독자 | 규칙 |
|---|---|---|
| 구판 `rms.issue`(pol·fl 없음) | 신판 승인 앱 | 유효. `pol`·`fl` 부재 = 미설정 → LINKED_ISSUE 층은 `pa` 만, 결재선은 §5.3 의 2·3 |
| 신판 `rms.issue`(pol·fl 있음) | 구판 승인 앱 | 유효, 새 칸 무시(느슨) — `rx` 게이트로 워크포스가 쓰지 않음. 롤백 때만 발생(수용, §0 Q3) |
| 신판 `rms.issue` | 구판 워크포스(`verifyOwnIssueSetting`) | 유효(모르는 칸 무시). 표에 pol·fl 이 안 보일 뿐 |
| `approval.flows` | 구판 워크포스 | 읽지 않음(키를 모름) |
| DIVERGED(걸린 문서 ≠ 저장 최고 rev, lis §5.3.1) | 신판 승인 앱 | 기간·`pa` 는 기존 규칙. `pol` 은 **키별 더 엄한 쪽**(`compareStrictness`), 한쪽만 키가 있으면 그 값과 **하위 층 유효값** 중 엄한 쪽(§7.1 `stricterPolicy`). `fl` 은 저장본(최고 rev) 값 — 결재선은 엄격함 비교가 없다 |
| 해제(NONE) 뒤 | 신판 승인 앱 | 기존 `released` 규칙이 `pol`·`fl` 에도 그대로(본문 통째로 적용 중지) |

### 6.3 승인 앱 소비 지점

| 지점 | 파일·함수 | 변경 |
|---|---|---|
| 수신·검증·저장 | `resolver/workforce/LinkedIssueSettingSource.js`, `WorkforceInbound.applySetting` | 무변경(서명 본문 통째 저장 — `receivedBody` 가 칸을 버리지 않는다) |
| 누적·더 엄한 쪽 | `domain/linkedIssue/setting.js` `stricterSetting`·`effectiveSetting` | **지금 `s/e/pa` 만 돌려줘 `pol`·`fl` 을 버린다(lis `setting.js:3-7`)** → `pol`·`fl` 포함하도록 확장(§7.1) |
| 정책 병합 | `domain/worklogPolicy/merge.js` `mergePolicy` | §5.6 |
| 결재선 | `resolver/worklogApproval/WorklogApprovalPolicy.read` | §5.3 — `effective.linkedSetting.body.fl` |
| 작업 로그 탭 요약 | `WorklogService.getLinkedIssueOverview` | `setting.policy`·`setting.flow`·`flowInvalid` |
| 타임시트 상한·증거 | `aggregateTimesheetPolicy`, `policy_evidence` | 자동(유효 정책 경유, source `LINKED_ISSUE`) |
| 위반 관찰 | `domain/linkedIssue/violation.js` | 무변경(기간·사전 승인만 — 상한은 타임시트 제출 판정 몫) |
| 이슈 예외 목록 | `listIssueWorklogExceptions` | `workforce` 칸 |
| ctl 게시 | `WorklogControlCtl.bodyFor` | `ch:'APP'`, `rx` 토큰 |
| flows 게시 | 신규 `WorklogApprovalFlowsDoc`(`resolver/worklogApproval/`) + `WorkforcePublisher` 문서 종류 `flows` | 대상 = ctl 대상의 프로젝트 id 집합(I: 행 body 의 projectId ∪ P:) — `WorklogControlCtl.targets` 커서 순회 재사용. 본문 = `config(projectId)` + `listAvailableFlows`(steps≥1 만, 이름 120자 자름). touch 시점: `saveWorklogApprovalConfig`·흐름 이름 변경·`publicationVersion` 변경. 원장 `workforce_publish(account_id='F:{projectId}', doc_key='flows')`. 게시 = asApp `PUT project/{id}/properties/movesApproval.flows`(사유 `workforce-publish`, ctl 과 같은 게이트웨이 `putProjectProperty`) |

### 6.4 워크포스 화면 (④) — 요약 (상세 작업은 §14)

`IssueApprovalSettingTable` 열(지금 `select, issue, assignee, jiraWindow, md, window, pa, lastSaved, state`, WF:`:35`):
- `pa` 라벨 → "작업 시간 승인 방식"(필요=먼저 승인받고 기록 / 불필요=기록 뒤 팀장 확인 / 기본 따름).
- **+ `policy`**(rx 에 `rms.issue.v2` 일 때만): 정한 키 칩 요약("하루 6시간 · 수정 7일"), 누르면 행 편집 모달.
- **+ `flow`**(rx 에 `approval.flows` ∧ 검증된 flows 문서 ∧ `req===true` 일 때만): 결재선 이름 / "기본(이름)".
- **+ `leader`** 읽기 전용: 담당자의 직속 팀장 이름(워크포스 DB `TeamLeadAuthority` 팀 색인 — 표시만).
- 표 머리 읽기 전용: "이 프로젝트 PM: {이름}"(워크포스 프로젝트 PM, 워크포스 DB).
- 일괄 적용 모달: 키마다 "변경 안 함 / 값 지정 / 비우기(기본 따름)", 시간은 **분** 입력(저장 ×60), 결재선 "변경 안 함 / 지정 / 기본". 직속 팀장만 저장(현행 `assertLeads`).

---

## 7. 도메인 (순수 함수 + 테스트 케이스)

### 7.1 승인 앱

```js
// src/domain/workforce/teamsFromOrgs.js
/** rows: [{entityId(accountId), status, body, verifiedAt, issuedAt(iat)}]
 *  @returns {teams:[{teamKey, teamName, leaderKeys, memberKeys, lastReceivedAt, state}], refreshCandidates:string[], orgDocs:{verified, stale, total}} */
teamsFromOrgs({ rows, now, maxIatAgeMs = 30 * 86400000, refreshMax = 50 })
```
규칙: ① 팀장 문서(`leads[]`)가 팀의 1차 원천 — teamKey 별 memberKeys 합집합, leaderKeys = 문서 주인 ② 팀원 문서(`teamKey`, `teamName`, `leaderKeys`)로 팀 보충 — 팀장 문서가 없는 팀은 `state:'NONE'` ③ 기여 문서 중 하나라도 `status≠VERIFIED` 거나 iat 가 `maxIatAgeMs` 초과면 `STALE` ④ teamKey 는 `'wf:'` 접두(`orgViewOf` 와 같게) ⑤ 같은 사람이 두 팀 문서에 → 둘 다 표시(판정은 `forSubject` 가 한다) ⑥ refreshCandidates = NONE·STALE 팀의 leaderKeys, 정렬·중복 제거·상한.
테스트: 팀장 문서만 / 팀원 문서만(NONE) / 둘 다 / 31일 지난 iat → STALE / status INVALID 행 → STALE / 빈 입력 / 상한 50 / teamKey 접두.

```js
// src/domain/linkedIssue/setting.js (확장)
stricterSetting(a, b, base /* 하위 층 유효값 {key:value} — 없으면 {} */)
  → { s, e, pa, pol, fl }
//  pol: 키 합집합. 양쪽 값 → compareStrictness 로 엄한 쪽. 한쪽만 → (그 값 vs base[key]) 중 엄한 쪽.
//  fl: a.fl(호출부가 a = 저장본 최고 rev 로 넘긴다)
effectiveSetting(body, base)
```
테스트: 기존 s/e/pa 케이스 유지 + pol 양쪽(하루 6h vs 8h → 6h, 0=무제한 vs 4h → 4h) / 한쪽만(+base 비교) / futureDateAllowed true vs false → false / fl 저장본 유지 / pol null 양쪽 → null.

```js
// src/domain/worklogPolicy/merge.js (변경)
mergePolicy({ site, workforceProject, workforceIssue, jiraProject, jiraIssue, linkedIssue, issueLinked = false, now })
```
테스트: issueLinked=true → JIRA_ISSUE 무시 + ignored 기록 / false → 기존 / linkedIssue.pol 키 적용(source LINKED_ISSUE) / pol 이 사이트보다 느슨해도 적용(Q1) / pol + pa 동시.

```js
// src/domain/worklogApproval/flowChoice.js (신규 — WorklogApprovalPolicy.read 에서 분리)
flowChoice({ required, linkMode, issueLinked, linkedFl, binding, config, options })
  → { flowId|null, source:'WORKFORCE'|'ISSUE'|'PROJECT_DEFAULT'|null, flowInvalid:boolean, managedBy }
```
테스트: §5.3 표 전 분기(연동·fl 유효 / fl 목록 밖 → 기본 + flowInvalid / 연동 이슈의 binding 무시 / 비연동 binding / 이동된 이슈 binding 무시 / required=false).

```js
// src/domain/inbox/historyFilter.js (신규)
historyFilterOf({ role, updatedFrom, updatedTo, timeZone }) → { roleCond:'ALL'|'PROCESSED'|'REQUESTED', updatedFromTs|null, updatedToTsExclusive|null } | throws INVALID_TARGET
```
테스트: 날짜 형식·역전·366일 초과 거부, 끝은 다음 날 미포함, 타임존 경계.

### 7.2 워크포스

```js
// static/ui/src/components/worklog/writeChannel.js  (+ src/domain/approvalLink/writeChannel.js 동일 표)
writeChannelOf({ linkMode, target, ctl }) → 'DIRECT'|'HANDOFF'|'BLOCKED'   // §3.1.2 표 W1~W6
createHandoffPathOf({ globalPagePath, issueId, startedMs, seconds, timeZone }) → string|null  // §3.2 프리필
```
테스트: W1~W6 전 분기, `ch` 값 3종(APP/WORKFORCE/없음)이 결과에 영향 없음, 경로 형식 밖 → BLOCKED, 프리필(같은 날·자정 넘김·소요 0·잘못된 tz).

```js
// src/integration/approval/issueSetting.js (확장)
issueSettingPlan({ current, changes:{ s?, e?, pa?, pol?:{key: value|null}, fl?:uuid|null }, keep:{window, pa, pol:string[], fl}, by, tk, now })
// src/integration/approval/flowsDoc.js (신규)
verifyFlowsDoc({ entry, cloudId, projectId, now, signer, keyring }) → { req, def, options:[{id,label}] } | null
```
테스트: pol 키별 KEEP/SET/CLEAR 조합, 빈 pol → null, fl KEEP/SET/DEFAULT, 계약 validator 와 같은 범위 거부(분 단위 아닌 초), flows 서명 위조·다른 프로젝트 ent → null.

---

## 8. 백엔드 (승인 앱)

| 파일 | 변경 |
|---|---|
| `src/resolver/principal/PrincipalController.js`(신규) | `getPrincipalContext` — `resolveAdminPrincipal(context)`(KVS managers 1 + mypermissions 1, invocation memo) |
| `src/index.js` `CONTROLLER_REGISTRARS` | + `registerPrincipalController`, + 승인 관리(`registerApprovalAdminController`), 나머지는 기존 컨트롤러에 추가 |
| `src/resolver/approval/ApprovalAdminService.js`(신규) | `listAllApprovals`(`ApprovalRepository.searchAll({isOpen, kinds, createdFrom, createdTo, projectId, cursor, limit})` 키셋 `(updated_at, request_id)` + `filterVisibleRows` 넘치게 읽기 ≤4회), `sendApprovalReminder`(`ExpiryService` 의 알림 행 생성 함수를 공용으로 분리해 재사용 — 이벤트 키만 `reminder:manual:…`) |
| `src/resolver/inbox/InboxRepository.js` | tab 조건 `history`: `actor_key = ?`(**본인만** — 위임자 행 제외) `AND ((role='APPROVER' AND (my_decided=1 OR acted_by_me=1)) OR (role='REQUESTER' AND is_open=0))`, role 필터로 한쪽만, `updated_at` 범위. `targetKinds` → `target_kind IN (…)` 모든 탭 |
| `src/resolver/inbox/InboxService.js` | tab 화이트리스트에 `history`, `historyFilterOf`, counts 무시 |
| `src/resolver/workforce/WorkforceTeamsService.js`(신규) | `listWorkforceTeams` (§4.2). 컨트롤러는 기존 workforce 컨트롤러에 등록 |
| `src/resolver/workforce/WorkforceLinkRepository.js` | + `pageOrgRows({after, limit})` |
| `src/resolver/timesheet/TeamRepository.js` | + `rosterMembership(accountIds)` |
| `src/resolver/worklogPolicy/WorklogPolicyService.js` | + `listIssueExceptions`, `lookupProjectIssue`; `saveIssue` 연동 거부; `issue` 응답 `linked`·`managedBy` |
| `src/resolver/worklogPolicy/WorklogPolicyResolver.js` | `resolveBatch` 가 `controlLinkOf` 로 `issueLinked` 계산해 `mergePolicy` 에 전달(연동 모드일 때만) |
| `src/resolver/worklogApproval/WorklogApprovalPolicy.js` | `read` → `flowChoice`; `view` 새 shape; `select` 새 검사 순서·null 삭제·감사 |
| `src/resolver/worklogApproval/WorklogApprovalRepository.js` | + `bindingsOf(ids, projectId)`, + `deleteBinding({issueId, projectId, rev})` |
| `src/resolver/worklogApproval/WorklogApprovalFlowsDoc.js`(신규) | flows 본문·대상·touch |
| `src/resolver/workforce/WorkforcePublisher.js` | 문서 종류 `flows`(F: 원장) — ctl 과 같은 drain·예산·커서 |
| `src/resolver/worklogControl/{WorklogControlContext,WorklogControlCtl,WorklogControlDetector}.js` | §3.1.1·§3.3·§0 Q1 |
| `src/resolver/settings/{SettingsRepository,SettingsService}.js` | §3.4 |
| `src/domain/...` | §7.1 |
| `src/permission/PermissionMap.js` | §8.1 |
| `src/utils/errors/ErrorCodes.js` | + `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` |

CAS 지점: `worklog_approval_binding` UPDATE/DELETE `rev`(기존 규칙, DELETE 는 rev 조건만), `worklog_policy_issue_override` 기존. 새 스케줄·트리거 없음.

### 8.1 PermissionMap 변경 (계약 테스트 `permissionMap.contract.test.js` 세 곳 대조)

| resolver | 축 |
|---|---|
| `getPrincipalContext` | `'SELF'` |
| `listAllApprovals` | `{admin:true}` |
| `sendApprovalReminder` | `{admin:true}` |
| `listWorkforceTeams` | `{admin:true}` |
| `listIssueWorklogExceptions` | `{project:'admin', projectIdKey:'projectId'}` |
| `lookupProjectIssue` | `{project:'admin', projectIdKey:'projectId'}` |
| `selectIssueWorklogApprovalFlow` | `{issue:'edit', appAccess:false}` → **`{project:'admin', projectIdKey:'projectId'}`** |

---

## 9. 스키마·마이그레이션

**없음.** 새 테이블·컬럼·인덱스 없음 → major upgrade 아님(SQL 기준). 근거: §0 Q4(인덱스), `workforce_inbound` PK 키셋(②), 이슈 예외·binding 은 기존 `(project_id, …)` 인덱스, flows 원장은 기존 `workforce_publish`(account_id VARCHAR(128) 에 `F:{id}`, doc_key VARCHAR(32) 에 `flows`).

마이그레이션 이름 변경 없음. lis 의 계획 마이그레이션 v064~v066(A-7)은 **만들지 않는다**(Q141) — lis 브랜치에 아직 없음(확인: 마지막 `v063`).

---

## 10. Jira 연결

| 호출 | 주체 | 사유 / 비고 | 언제 |
|---|---|---|---|
| `GET mypermissions?permissions=ADMINISTER` | asUser | 기존 `isJiraAdmin` | `getPrincipalContext` |
| `POST permissions/check` + `issue/bulkfetch` | asUser | 기존 `filterVisibleIssues` | 승인 관리·이슈 예외 목록 |
| `GET issue/{key}?fields=summary,project` | asUser | — | `lookupProjectIssue` |
| `GET user/properties/movesRms.org?accountId=` | asUser(관리자) | 기존 `refreshOrgs`(미검증 W3) | 팀 탭 "다시 읽기" |
| `PUT project/{id}/properties/movesApproval.flows` | **asApp** | AGENTS asApp 허용 2번(통제 설정 문서 게시)에 "결재선 목록 문서(`movesApproval.flows`)" 추가 — 사용자 컨텍스트 없는 큐 게시, 결과를 사용자에게 돌려주지 않음(불변식 8) | flows 게시 |
| `PUT/DELETE issue|project/{id}/properties/movesApproval.ctl` | asApp | 기존 | ctl 재게시(버전 변경 1회) |

scope 추가 없음. 워크포스: `GET project/{id}/properties/movesApproval.flows` 또는 기존 JQL `properties=` 에 얹기(asUser/asApp 은 기존 ctl 읽기와 같은 자격) — WF AGENTS ⑧ 에 "movesApproval.flows 읽기" 한 줄.

---

## 11. 프론트 (승인 앱)

### 11.1 엔트리·화면 트리

```
inbox 엔트리 (InboxPage)
 ├ groups
 │  ├ work(결재함): myturn · waiting · requested · cc · timesheet · teamTimesheet* · teamCertification* · notifications · **history(내 이력)**   (done 삭제 — Q145)
 │  ├ personal(내 설정): signature · delegation
 │  └ admin(관리) — principal.isAdmin === true 일 때만
 │     ├ **manage(승인 관리)**   → ApprovalAdminPage (신규 features/approvalAdmin/)
 │     ├ **records(기록)**       → RecordsPage (신규 features/records/) = 기존 AuditPage 탭 4 + DataSettings 탭 1
 │     └ settings(설정) children = settingsNavigation(t, {mode, features, surface:'inbox'}) — records 묶음 없음
 ├ view=history  → HistoryPage: 역할 칩(전체/처리한 건/내 요청) · 종류 칩(ApprovalKindBadge 6종, features 로 거름) · 기간(30일/90일/1년/직접) · CursorPagingTable(InboxTable 재사용)
 ├ view=manage   → 진행 중/종료 토글 · 종류·기간·프로젝트 필터 · 표(종류·제목·상태·요청자·현재 단계 대기자·갱신) · 행 동작 [독촉](canRemind) [취소](canCancel → 기존 cancelApproval) · hiddenCount 안내
 └ view=records  → section ∈ approval|certification|worklog|settings|data
settings 엔트리(jira:adminPage SettingsPage) — settingsNavigationGroups(t, {surface:'adminPage'}) 는 records 묶음(audit·data)을 **유지**(업무함이 없는 화면이라 기록 진입점이 따로 없다)
projectSettings 엔트리 — WorklogApprovalConfig · **IssueExceptionList(신규)** · TransitionRuleSettings · FieldChangeRuleSettings
issue 화면 — WorklogTab(정책 패널·결재선 선택 삭제, WorklogPolicySummary 한 줄, WorklogApprovalFlowLine) · IssueApprovalOverview(WorklogApprovalFlowLine)
설정 › 타임시트 › 팀 탭 — + WorkforceTeamsSection
설정 › 워크포스 연동 — 작성 창구 select 삭제
```

### 11.2 메뉴 노출 규칙
- `principal` 쿼리: `principalKeys.context()` → `getPrincipalContext`, `staleTime 5분`, `retry:false`. **관리 묶음은 `data?.isAdmin === true` 일 때만**(로딩·실패면 숨김 — 서버 가드는 그대로). 비관리자가 `?tab=settings` 로 직접 오면 페이지는 열리되 서버 거부 → 기존 권한 안내.
- 팀장 탭은 지금처럼 `getTimesheetContext.isTeamLead`.

### 11.3 URL 호환 (`inboxUrl.js`, `settingsNavigation.js`)

| 옛 URL | 새 위치 | 방식 |
|---|---|---|
| `tab=done` | `tab=history&role=processed` | `replace` |
| `tab=settings&setting=audit[&section=X]` | `tab=records&section=X`(없으면 `approval`) | `replace` |
| `tab=settings&setting=audit&auditTab=X` | `tab=records&section=X` | 읽기 호환 → `replace` |
| `tab=settings&setting=data` | `tab=records&section=data` | `replace` |
| `tab=settings&setting=worklogHistory` | `tab=records&section=worklog` | `replace`(기존 legacy 를 records 로 재지정) |
| 기존 `setting=flows|groups|approvers`·`approval&section=…` | 무변경(approvalSetup) | 기존 |
- `INBOX_VIEWS` += `history`, `manage`, `records`. `RECORDS_SECTIONS = ['approval','certification','worklog','settings','data']`(순수 `recordsModel.js`, `auditModel.AUDIT_TABS` + data).
- `canonicalSettingLocation` 반환에 `view` 를 추가해 settings 밖으로 보낼 수 있게(`{view:'records', section}`).
- `SETTINGS_GROUPS` 에서 `records` 를 뺀 `SETTINGS_GROUPS_INBOX` 와 adminPage 용 전체를 `surface` 옵션으로 고른다. `SETTINGS_NAVIGATION`(평평 목록, 테스트 소비자 호환)은 adminPage 기준 유지.

### 11.4 쿼리키 (`utils/queryKey/approvalKeys.js`)
`principalKeys.context()`, `inboxKeys.history(filters)`(기존 list 키에 tab 포함이면 재사용), `approvalAdminKeys.list(scope, filters)`, `workforceKeys.teams()`, `worklogPolicyKeys.exceptions(projectId)`, `worklogApprovalKeys.flowLine(issueId)`(기존 `policy(issueId)` 재사용 가능). 무효화: 독촉·취소 → `approvalAdminKeys.all`; 예외 저장·결재선 → `worklogPolicyKeys.exceptions(projectId)`·`worklogPolicyKeys.all`·`worklogApprovalKeys.all`; 다시 읽기 → `workforceKeys.teams()`.

### 11.5 재사용
`InboxTable`·`CursorPagingTable`·`ApprovalKindBadge`·`SettingsSection/SettingsRows`·`WorklogPolicyPanel`(모달 안)·`WorklogPolicySummary`·`AuditPage` 탭 컴포넌트·`DataSettings` 섹션·`PersonAvatar`·`resolveUsersInChunks`·`importWithReloadOnce`(새 lazy 청크 3: HistoryPage·ApprovalAdminPage·RecordsPage).

---

## 12. i18n 키 (kr / en, `npm run merge`)

### 12.1 승인 앱

| 네임스페이스.키 | kr | en |
|---|---|---|
| `inbox.nav.history` | 내 이력 | My history |
| `inbox.nav.manage` | 승인 관리 | Approval management |
| `inbox.nav.records` | 기록 | Records |
| `inbox.history.role.{ALL,PROCESSED,REQUESTED}` | 전체 / 처리한 건 / 내 요청 | All / Handled by me / My requests |
| `inbox.history.period.{d30,d90,d365,custom}` | 30일 / 90일 / 1년 / 직접 지정 | 30 days / 90 days / 1 year / Custom |
| `inbox.history.empty` | 이 조건의 이력이 없습니다. | No history for these filters. |
| `inbox.manage.title` · `.hint` | 승인 관리 · 열람할 수 있는 모든 결재를 종류·상태·기간으로 봅니다. | Approval management · All approvals you can view, by kind, status and period. |
| `inbox.manage.scope.{OPEN,CLOSED}` | 진행 중 / 종료 | Open / Closed |
| `inbox.manage.column.{kind,title,status,requester,currentStep,updated,actions}` | 종류 / 제목 / 상태 / 요청자 / 현재 단계 대기 / 갱신 / 작업 | Kind / Title / Status / Requester / Waiting on / Updated / Actions |
| `inbox.manage.remind` · `.remindDone` · `.remindAlready` | 독촉 · {count}명에게 알렸습니다. · 오늘 이미 독촉했습니다. | Remind · Notified {count}. · Already reminded today. |
| `inbox.manage.cancel` | 취소 | Cancel |
| `inbox.manage.hidden` | 열람 권한이 없는 {count}건은 표시하지 않았습니다. | {count} items you can't view are hidden. |
| `inbox.records.section.data` | 보관·내보내기 | Retention & export |
| `workforce.teams.title` · `.hint` | 워크포스에서 받은 팀 · 워크포스가 서명해 보낸 팀 구조입니다. 여기서는 바꿀 수 없습니다. | Teams from Workforce · Signed team structure from Workforce. Read-only here. |
| `workforce.teams.column.{team,leader,members,received,state}` | 팀 / 팀장 / 팀원 / 마지막 수신 / 상태 | Team / Lead / Members / Last received / Status |
| `workforce.teams.state.{VERIFIED,STALE,NONE}` | 확인됨 / 오래됨 / 팀장 문서 없음 | Verified / Stale / No lead document |
| `workforce.teams.override` | 워크포스 우선 {count}명 | Workforce takes precedence for {count} |
| `workforce.teams.empty` | 워크포스가 아직 팀 구조를 보내지 않았습니다. 워크포스 버전과 연동 설정을 확인하세요. | Workforce hasn't sent a team structure yet. Check the Workforce version and link settings. |
| `workforce.teams.refresh` · `.refreshResult` | 팀장 문서 다시 읽기 · 확인 {checked} · 갱신 {updated} · 읽지 못함 {unreadable} | Re-read lead documents · Checked {checked} · Updated {updated} · Unreadable {unreadable} |
| `workforce.teams.truncated` | 문서가 많아 처음 1,000개만 보았습니다. | Showing the first 1,000 documents only. |
| `timesheet.routing.approvers` | 결재자: {names} | Approver: {names} |
| `worklogApproval.flowLine.selected` | 이 이슈의 워크로그는 {flow}(으)로 승인됩니다. | Worklogs on this issue are approved via {flow}. |
| `worklogApproval.flowLine.source.{WORKFORCE,ISSUE,PROJECT_DEFAULT}` | 워크포스 팀장 지정 / 이 이슈 지정 / 프로젝트 기본 | Set by Workforce lead / Set for this issue / Project default |
| `worklogApproval.flowLine.missing.{PROJECT_ADMIN,WORKFORCE_LEAD}` | 결재선이 정해지지 않았습니다. 프로젝트 관리자가 Jira 프로젝트 설정 › Moves Approval 에서 지정해야 합니다. / … 워크포스 작업관리 › 승인 설정에서 팀장이 지정해야 합니다. | No approval line set. A project admin must set it in Jira project settings › Moves Approval. / … The team lead must set it in Workforce Work › Approval settings. |
| `project.issueExceptions.title` · `.hint` | 이슈 예외 · 특정 이슈에만 다른 기록 규칙이나 결재선을 적용합니다. | Issue exceptions · Apply different logging rules or approval lines to specific issues. |
| `project.issueExceptions.{add,issueKey,lookup,edit,remove,removeConfirm,empty,changed,flow,flowDefault,managedByWorkforce,managedHint}` | 이슈 추가 / 이슈 키 / 확인 / 편집 / 삭제 / 이 이슈의 예외를 지우고 프로젝트 정책을 따르게 할까요? / 이슈별 예외가 없습니다. 모든 이슈가 프로젝트 정책을 따릅니다. / 바꾼 항목 / 결재선 / 프로젝트 기본 / 워크포스 관리 / 워크포스 연동 작업은 워크포스 작업관리 › 승인 설정에서 팀장이 정합니다. | Add issue / Issue key / Look up / Edit / Remove / Remove this issue's exception and follow the project policy? / No issue exceptions. All issues follow the project policy. / Changed / Approval line / Project default / Managed by Workforce / Linked Workforce work items are set by the team lead in Workforce Work › Approval settings. |
| `project.policy.issueExceptionsWhere` | 이슈별 예외는 Jira 프로젝트 설정 › Moves Approval 에서 정합니다. | Per-issue exceptions are set in Jira project settings › Moves Approval. |
| `worklogPolicy.*` | §5.7 표 | 같은 뜻 |
| `worklog.tab.rulesLine` | 이 이슈의 기록 규칙: {rules} | Logging rules for this issue: {rules} |
| `error.WORKLOG_POLICY_MANAGED_BY_WORKFORCE` | 워크포스 연동 작업입니다. 워크포스 작업관리 › 승인 설정에서 바꿔 주세요. | This is a linked Workforce work item. Change it in Workforce Work › Approval settings. |

삭제: `workforce.inputChannel.*`(작성 창구), `worklog.tab.channelWorkforce`(남아 있으면), `inbox.tab.done`(내 이력으로 대체 — 업무함 외 사용처 grep 후), `worklogApproval.policy.{label,choose,defaultHint,distinction}`(선택 UI 삭제 — 사용처 grep 후).

### 12.2 워크포스 (`locales/{kr,en}/issueApprovalSetting.json`, `issuePanel.json`)
`issueApprovalSetting.pa` → "작업 시간 승인 방식", `paMode.{REQUIRED,NOT_REQUIRED,DEFAULT}` → "먼저 승인받고 기록 / 기록 뒤 팀장 확인 / 기본 따름", 신규 `policy`·`policyMode.{KEEP,SET,CLEAR}`·`policyKey.{createWindowDays,editWindowDays,deleteWindowDays,pastDateMaxDays,dailyMaxSeconds,weeklyMaxSeconds,futureDateAllowed}`(승인 앱 `worklogPolicy.key.*` 와 같은 문구)·`unit.{days,minutes}`·`flow`·`flowMode.{KEEP,SET,DEFAULT}`·`flowDefault`·`leader`·`pm`·`v2Missing`("승인 앱을 업데이트하면 기록 규칙도 여기서 정할 수 있습니다"). `issuePanel.approval.edit.open`("승인 앱에서 수정"), `approval.move.handoff`("연동 작업은 승인 앱에서 옮길 수 있습니다"), `approval.blocked.retry`("다시 시도").

---

## 13. 용량·호출량·유휴 SQL

### 13.1 행
새 테이블 없음. `workforce_publish` 에 프로젝트당 flows 1행(연동 Jira 프로젝트 수, 수십). 엔티티 프로퍼티: 프로젝트당 `movesApproval.flows` 1개(≤4KB), 이슈 `movesRms.issue` +250B.

### 13.2 resolver 1회당

| resolver | SQL | Jira |
|---|---|---|
| `getPrincipalContext` | 0 (KVS 1) | 1 (mypermissions, memo) |
| `listInbox` history | 기존 done 과 같음(창당 1, ≤4) | 열람 확인 창당 ≤2 |
| `listAllApprovals` | ≤4 | ≤4×(permissions/check 1 + bulkfetch 1) |
| `sendApprovalReminder` | load 1~2 + 알림 INSERT 1 | 열람 확인 1 |
| `listWorkforceTeams` | 1~5 + ⌈팀원/500⌉ | 0 |
| `listIssueWorklogExceptions` | 1(UNION) + 2(상세) + 0~2(연동) + 설정 1 | 2(열람) + flows 목록 기존 |
| `lookupProjectIssue` | 0~2(연동) | 1 |
| `selectIssueWorklogApprovalFlow` | read 기존 + CAS 1 + 감사 1 | 기존 issueLoader 1 |
| 정책 해석(`resolveBatch`) | +0(연동 판정은 이미 읽은 행) | 0 |

### 13.3 게시
배포 직후 1회: ctl 전량 재게시(대상 N건 PUT, 기존 커서·예산으로 며칠에 나눠 수렴) + flows 프로젝트 수만큼 PUT. 이후는 설정 변경 때만.

### 13.4 유휴 SQL (사용자 0명·이벤트 0건)
**변화 없음.** 새 스케줄·스윕 작업 없음. flows 는 기존 `workforce` 일일 작업이 `workforce_publish` 의 `pending` 행만 보는 같은 쿼리로 처리(F: 행이 없으면 추가 쿼리 0). `publicationVersion` 비교는 기존 KVS 읽기. `idleSqlBudget.test.js` 의 미연동 ≤27·연동 ≤38·Workforce 연동 유휴 ≤13 단언을 **수정하지 않고** 통과해야 한다(+ flows 종류가 pending 0 일 때 SQL 0 추가 단언 1건).

---

## 14. 미검증 (04_spike_todo 후보)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| U-1 | `router.navigate` 로 **다른 앱** 전역 페이지 하위 경로 `…/worklog/{issueId}/new/{date}/{HHmm}-{HHmm}` 이동(G-HANDOFF 확장) | ① 전체 — 실패면 W3 가 실질 BLOCKED | 두 앱 설치 개발 사이트: 워크포스 패널·마이워크·캘린더에서 넘김 → 승인 앱 새 작성 화면에 날짜·시간 프리필 확인 |
| U-2 | Forge 전역 페이지가 넘겨주는 pathname 형식(앱 기준 상대 vs 전체) — `parseCreateHandoffPath` 는 끝부분만 봄 | 프리필 누락 | U-1 과 같이, 콘솔에 pathname 기록 |
| U-3 | 관리자 asUser 로 **남의** 사용자 프로퍼티(`movesRms.org`) GET(W3) | ② 다시 읽기 — 실패면 캐시만 | 팀 탭 "다시 읽기" 결과의 `unreadable` 수 |
| U-4 | 승인 앱 asApp 의 **프로젝트 프로퍼티 PUT**(`movesApproval.flows`) — ctl 프로젝트 게시와 같은 미검증(Administer projects) | ④b 결재선 옵션이 워크포스에 안 보임 | 게시 원장 `last_error_code`, 워크포스 진단 |
| U-5 | 워크포스가 승인 앱이 쓴 프로젝트 프로퍼티(`movesApproval.flows`)를 JQL `properties=`·project GET 으로 읽는가(타 앱 프로퍼티 읽기) | ④b | 워크포스 진단 `CTL_DOC` 와 같은 방식의 `FLOWS_DOC` 항목 |
| U-6 | 시간 추적 제공자를 고르지 않은 사이트에서 승인 앱 이슈 패널 "작업 시간 기록" 진입(lis G7) | 연동 이슈 작성 진입점 | lis 관문 G7 결과 재사용 |
| U-7 | `getAppContext().appAri/environmentAri` 가 운영 환경에서 채워지는가(`globalPagePath` null 이면 W4) | ① | 승인 앱 진단 `HANDOFF_PATH` |
| V-8 | (플랫폼 아님) `listAllApprovals`·history 쿼리 실행 계획 | §0 Q4 | 개발 사이트 TiDB `EXPLAIN` |

---

## 15. 백엔드 → 프론트 경계면 계약 표 (소비 경로)

| resolver | 호출 위치(프론트) | 쓰는 응답 칸 | 분기(`error.code`) |
|---|---|---|---|
| `getPrincipalContext` | `features/inbox/usePrincipal.js`(신규) → `InboxPage` groups | `isAdmin` | 실패 → 관리 묶음 숨김 |
| `listInbox`(history) | `features/history/HistoryPage.jsx` | `items[]`(InboxTable 칸), `nextCursor`, `hasMore` | `INVALID_TARGET` → 필터 초기화 안내 |
| `listAllApprovals` | `features/approvalAdmin/ApprovalAdminPage.jsx` | `items[].{requestId,targetKind,title,issueKey,projectKey,status,isOpen,requesterKey,currentStep,createdAt,updatedAt,expiresAt,canCancel,canRemind}`, `hiddenCount`, `nextCursor`, `incomplete` | `PERMISSION_ADMIN_REQUIRED` → 권한 안내 |
| `sendApprovalReminder` | 같은 화면 행 동작 | `notified`, `already` | `REQUEST_NOT_PENDING` → 행 새로 고침 |
| `cancelApproval`(기존) | 같은 화면 | 기존 | 기존 |
| `listWorkforceTeams` | `features/settings/WorkforceTeamsSection.jsx` | `enabled`, `teams[]`, `orgDocs`, `refreshCandidates`, `truncated` | `STORAGE_NOT_READY` → 경고 |
| `refreshWorkforceCapabilities`(기존) | 같은 섹션 | `items[].result` 집계 | 기존 |
| `getMyTimesheet`(기존) | `MyTimesheetPage`·`SubmitBar` | `routing.approverKeys`(신규 소비) | — |
| `getApprovalDetail`(기존) | `ApprovalDetail` → `TimesheetSnapshotSection` prop `approverNames` | `steps[].approvers` | — |
| `getIssueWorklogApprovalPolicy` | `features/worklogApproval/WorklogApprovalFlowLine.jsx` | `policy.{required,selectedFlow,source,managedBy,reasonCode}` | 실패 → 렌더 안 함 |
| `listIssueWorklogExceptions` | `features/worklogPolicy/IssueExceptionList.jsx` | 전부 | `STORAGE_NOT_READY` |
| `lookupProjectIssue` | 같은 화면 "이슈 추가" | `issueId, issueKey, summary, linked` | `PROJECT_ISSUE_MISMATCH`·`INVALID_TARGET` → 입력 오류 |
| `getIssueWorklogPolicy`(변경) | 예외 편집 모달 `WorklogPolicyPanel scope="issue"` | + `linked`, `managedBy` | 기존 |
| `saveIssueWorklogPolicy` | 같은 모달 | 기존 | + `WORKLOG_POLICY_MANAGED_BY_WORKFORCE` |
| `selectIssueWorklogApprovalFlow`(변경) | 같은 모달·목록 결재선 열 | `binding.{flowId,rev}` | `WORKLOG_POLICY_CONFLICT` → 다시 읽기, `PROJECT_ISSUE_MISMATCH`, `WORKLOG_POLICY_MANAGED_BY_WORKFORCE`, `WORKLOG_POLICY_NOT_ALLOWED` |
| `getLinkedIssueOverview`(변경) | `LinkedSettingSummary` | `setting.policy`, `setting.flow`, `flowInvalid` | 기존 |
| `getIssueWorklogs`(변경) | `WorklogTab` → `linkStateOf` | `control.channel` **소비 삭제** | — |
| `getApprovalSettings`/`saveApprovalSettings` | `WorkforceLinkSettings` | `linkedInputChannel` **소비 삭제** | — |

---

## 16. 워크포스 리포 작업 목록

| # | 파일 · 함수 | 변경 | 테스트 |
|---|---|---|---|
| WF-L1 | `static/ui/src/components/worklog/writeChannel.js`(신규, `createChannel.js` 대체 — `createHandoffPath`·`remainingHandoffDates` 는 이 파일로 이동) | `writeChannelOf`, `createHandoffPathOf` | `__test__/writeChannel.test.js`(W1~W6, ch 3종 무영향, 프리필) — 기존 `createChannel.test.js` 이관 |
| WF-L2 | `src/domain/approvalLink/writeChannel.js`(신규, 같은 표) · `src/resolver/approvalLink/IssueWorklogControlService.js` `createChannelOf`→`writeChannelOf`, `creationState` 반환 `writeChannel`, `getIssueWorklogControlService` 응답 `writeChannel`(기존 `createChannel` 은 같은 값으로 한 릴리스 유지), `ensureOrgCap` 호출 추가(조회 경로), `createIssueWorklogService` HANDOFF cause.path 프리필 전체, `assertOwnSetting` 삭제 | 서버 판정 | `IssueWorklogControlService.test.js`: W16 표 갱신(`ch:'WORKFORCE'` → HANDOFF), W17(넘김·확인 불가에서 POST 0) 유지, cause.path 프리필, 조회 시 cap touch 1회(메모), assertOwnSetting 관련 테스트 삭제 |
| WF-L3 | `static/ui/src/components/worklog/worklogWrite.js` `isApprovalLinkedIssue` 삭제 → `writeChannelFor(issueIdOrKey, {linkMode})`(실패 = BLOCKED, OFF = 호출 없이 DIRECT) | — | `worklogWrite.test.js` 갱신 |
| WF-L4 | `static/ui/src/panel/useIssuePanelData.js`(:117,:128 조건 → linkMode ON), `panelApproval.js` `resolveApprovalRowMode({worklog, accountId, writeChannel})`, `PanelWorklogForm.jsx`, `PanelRecentWorklogs.jsx`·`PanelWorklogRowActions.jsx`(BLOCKED 비활성) | §3.1.3 | `PanelWorklogCreate.test.jsx` 갱신, 신규 `PanelRowActionsChannel.test.jsx`(HANDOFF·BLOCKED 에서 executeRequest 미호출) |
| WF-L5 | `static/ui/src/pages/myWork/modal/WorklogModal.jsx`(:163-177, :313-316, :392-438, :493-508) | 편집·삭제도 `writeChannel`, 실패 = BLOCKED | `WorklogModalSpaceFilter.test.jsx`: 연동 편집에서 `updateWorklog`·`deleteWorklog` 미호출, 조회 실패 시 BLOCKED, 기존 DIRECT(비대상) 유지 |
| WF-L6 | `static/ui/src/pages/myWork/WorklogPage.jsx` `onEventDrop`(:332-366) | HANDOFF/BLOCKED → revert + 토스트, DIRECT 만 PUT | 신규 `WorklogPageDrop.test.jsx`(지금 테스트 없음) |
| WF-L7 | `static/ui/src/pages/projectDetail/calender/worklogDrop.js`(:11-48) | 같은 규칙, `isApprovalLinked` 주입을 `writeChannelFor` 로 | `worklogDrop.test.js` 갱신(실패 시 PUT 0) |
| WF-L8 | **POST 0 고정 테스트** 신규 `static/ui/src/__test__/linkedNoDirectWrite.test.jsx` — 네 화면(패널·모달·마이워크 캘린더·프로젝트 캘린더)을 linkMode ON + 대상 + (HANDOFF/BLOCKED/조회 실패) 로 렌더해 작성·수정·삭제·이동을 시도, `invoke('createIssueWorklog')`·`executeRequest('updateWorklog'|'deleteWorklog')` 호출 0 단언. linkMode OFF 에서는 기존처럼 호출됨 단언 | 완료 기준 |
| WF-L9 | `src/integration/approval/{contract.js,vectors.json}` | §6.1 바이트 동일 복사 | `vectors.test.js` 지문 갱신, `issueSetting.test.js` pol·fl |
| WF-L10 | `src/integration/approval/issueSetting.js` `issueSettingPlan`(pol·fl·keep), 신규 `flowsDoc.js` `verifyFlowsDoc` | §7.2 | `issueSetting.test.js`, 신규 `flowsDoc.test.js` |
| WF-L11 | `src/resolver/approvalLink/IssueApprovalSettingService.js` `list`: 응답 + `setting.pol`·`setting.fl`, 페이지 칸 `capabilities:{policy, flows}`(행 ctl `rx` 로), `flows:{req, def, options}\|null`(검증된 flows 문서, 프로젝트별 1회 읽기 — 같은 JQL 응답에 없으므로 `GET project/{id}/properties/movesApproval.flows` 1회), `project.pmKeys`, 행 `leaderKeys`(담당자 직속 팀장, `TeamLeadAuthority` 팀 색인). `save`/`validateItems`: `pol`(키·범위·분 단위 → 초)·`fl`(flows 옵션 안)·`keep.pol`·`keep.fl` | ④ | `IssueApprovalSettingService.test.js` + pol 저장·범위 거부·rx 없으면 pol 무시(400 아님, `ISSUE_SETTING_UNSUPPORTED`)·fl 옵션 밖 거부 |
| WF-L12 | `src/utils/errors/ErrorCodes.js` | + `ISSUE_SETTING_UNSUPPORTED`(rx 에 v2 없음), `ISSUE_SETTING_FLOW_INVALID` | — |
| WF-L13 | `static/ui/src/pages/projectDetail/issue/{IssueApprovalSettingTable.jsx, IssueApprovalBulkModal.jsx, approvalBulk.js}` | 열 `policy`·`flow`·`leader`, 머리 PM, 모달 키별 KEEP/SET/CLEAR(분 입력)·flow, `approvalItem` 확장 | `IssueApprovalSettingTable.test.jsx`, `IssueApprovalBulkModal.test.jsx`, `approvalBulk.test.js`(분→초, KEEP 보존) |
| WF-L14 | `locales/{kr,en}/issueApprovalSetting.json`, `issuePanel.json` + merge | §12.2 | — |
| WF-L15 | `AGENTS.md` asApp ⑧ | "movesApproval.flows 읽기" 한 줄 | — |
| WF-L16 | `src/resolver/approvalLink/ApprovalLinkAdminService.js` 진단 | + `FLOWS_DOC`(U-5), `HANDOFF_PATH` 설명에 작성 넘김 | `ApprovalLinkAdminService.test.js` |

워크포스 DB·manifest·scope 무변경.

---

## 17. 두 리포 배포 순서

원칙: **계약을 읽는 쪽이 먼저 구판 호환을 깐다.** ① 은 순서 무관하게 안전하도록 설계했다(§3.1.2 `ch` 무시).

| 순 | 리포 | 내용 | 전제·확인 |
|---|---|---|---|
| 0 | 승인 앱 | `linked-issue-schedule` → master 병합(이 설계의 기준 트리) | lis 문서 §10 "병합" — 실측 G 관문 상태 확인 |
| 1 | 승인 앱 | Phase 1(①-A): 창구 APP 고정, `linkedInputChannel` 삭제, ctl `publicationVersion` 2 | 배포 후 ctl 재게시 수렴(원장 pending 0) |
| 2 | 워크포스 | Phase 2(①-W): 단일 판정·POST 0 | 1 과 순서 무관(구판 승인 앱의 `ch:'WORKFORCE'` 도 HANDOFF 로 안전) |
| 3 | 승인 앱 | Phase 3(③)·Phase 4(⑤) | 단독 기능, 워크포스 무관 |
| 4 | **양쪽 같은 회차 커밋** | 계약 7파일(`contract.js`·`vectors.json`) — 지문 표가 서로를 고정 | 워크포스 `vectors.test.js` 형제 대조 |
| 5 | 승인 앱 **먼저** 배포 | Phase 5(④a 독자): validator·`stricterSetting`·merge·소비 지점 + `rx` 에 `'rms.issue.v2'` | rx 토큰이 실린 ctl 재게시 수렴 |
| 6 | 워크포스 | Phase 6(④a 작성자): 정책 칸·일괄 모달(`rx` 게이트) | 5 이전 배포돼도 rx 없으면 칸이 안 보임 |
| 7 | 승인 앱 먼저 | Phase 7(④b): flows 게시 + `rx` 에 `'approval.flows'` + `fl` 소비 | U-4 확인 |
| 8 | 워크포스 | Phase 8(④b): 결재선 열 | U-5 확인 |
| 9 | 승인 앱 | Phase 9(②): 팀 탭·결재자 이름 | 데이터는 W-8a 이후(Q146) |

롤백: 승인 앱을 5 이전으로 되돌리면 `pol`·`fl` 무시(느슨) — §0 Q3 수용. 워크포스 롤백은 rx 와 무관하게 안전(구판은 새 칸을 안 씀, 구판 ①은 DIRECT 경로가 살아남 — 이 경우 LINKED_DIRECT_WF 관찰이 잡는다).

---

## 18. 구현 순서 (Phase) · 완료 기준 · 테스트

권장 순서는 요구서의 ①→③→②→④→⑤ 를 **①→③→⑤→④a→④b→②** 로 바꿨다. 이유: ② 는 외부 데이터(W-8a)를 기다리고 화면만 먼저 나가도 빈 상태다 — 가장 뒤로. ⑤ 는 승인 앱 단독이고 ③ 의 프로젝트 설정 화면과 겹치지 않아 ④(두 리포 계약)보다 먼저 끝낼 수 있다. ④ 는 독자 먼저/작성자 나중이라 a·b 를 쪼갠다.

### Phase 1 — ①-A 승인 앱 창구 고정
- 백엔드: §3.1.1·§3.3·§3.4·§0 Q1(LINKED_DIRECT_WF 조건). 프론트: `WorkforceLinkSettings` 작성 창구 삭제, `linkStateOf` 정리, i18n 삭제.
- 완료 기준: 연동 이슈에서 탭·Log work·전역 페이지 작성/수정/삭제 성공(기존 테스트 + 신규), ctl 본문 `ch:'APP'`, `linkedInputChannel` 이 키맵·기본값·화면 어디에도 없음.
- 테스트: `SettingsRepository` 키맵 계약(집합 일치), `SettingsService` patch 거부 1, `WorklogControlCtl.bodyFor` ch APP·publicationVersion 2, `WorklogControlContext` `channel` 부재, `WorklogControlDetector` LINKED_DIRECT_WF(연동이면 항상), `worklogControlModel.linkStateOf` 3분기, `WorkforceLinkSettings.test.jsx` select 없음.

### Phase 2 — ①-W 워크포스 단일 판정
- WF-L1~L8. 완료 기준: **WF-L8 의 POST/PUT/DELETE 0 테스트 녹색**, linkMode OFF 단독 경로 기존 테스트 그대로 녹색, 워크포스 백엔드·UI jest·빌드·`forge lint`.

### Phase 3 — ③ 이슈 화면·이슈 예외·결재선 이동
- 백엔드: §5.3~§5.6, `listIssueWorklogExceptions`·`lookupProjectIssue`·`selectIssueWorklogApprovalFlow` 축/입력·`getIssueWorklogApprovalPolicy` 응답·`saveIssueWorklogPolicy` 연동 거부·`mergePolicy` issueLinked·`flowChoice`, PermissionMap 3, 감사. 프론트: §5.2 삭제·`WorklogApprovalFlowLine`·`WorklogPolicySummary` 한 줄·`IssueExceptionList`(projectSettings 엔트리)·`ProjectPolicyModal` 안내·문구 §5.7.
- 완료 기준: 이슈 화면 어디에도 `selectIssueWorklogApprovalFlow`·`saveIssueWorklogPolicy` 호출 경로가 없다(정적 grep 테스트), `worklog-issue-policy` testId 부재, 프로젝트 설정에서 예외 추가·편집·삭제·결재선 지정 가능, 연동 이슈 저장 거부.
- 테스트: `flowChoice.test.js`, `merge.test.js` issueLinked, `WorklogApprovalPolicy.test.js`(축은 계약 테스트, 검사 순서 ①~⑤, null 삭제 CAS, 감사 1행), `WorklogPolicyService.test.js`(목록 UNION·빈 override 제외·hiddenCount·연동 칸, lookup 불일치), `permissionMap.contract.test.js`, `WorklogTab.test.jsx`(정책 패널·select 없음, 규칙 한 줄), `IssueApprovalOverview.test.jsx`, `WorklogApprovalFlowLine.test.jsx`(required false 미렌더·source 3·missing 2), `IssueExceptionList.test.jsx`(추가·편집 모달·삭제 두 호출·연동 행 편집 없음), `WorklogPolicy.test.jsx` 문구 키, 정적 테스트 `issueScreenNoPolicyEdit.test.js`(issue·worklog 엔트리 번들 경로에서 두 resolver 이름 미등장).

### Phase 4 — ⑤ 메뉴·역할
- 백엔드: `getPrincipalContext`, `listInbox` history·targetKinds, `listAllApprovals`, `sendApprovalReminder`, PermissionMap 3, 등록 3단계. 프론트: §11.
- 완료 기준: 비관리자 업무함에 '관리' 묶음 없음, 관리자에게 '승인 관리'·'기록'·'설정', 옛 URL 5종 replace, 설정 메뉴에 audit·data 없음(업무함), adminPage 에는 유지.
- 테스트: `PrincipalController.test.js`(명부/Jira 관리자/둘 다 아님), `InboxRepository.test.js` history SQL(actor_key 본인만·role·기간·targetKinds), `historyFilter.test.js`, `ApprovalAdminService.test.js`(키셋·열람 제외 hiddenCount·canCancel·독촉 이벤트 키 결정적·이미 보냄·닫힌 요청 거부), `ExpiryService` 공용 분리 회귀, `InboxPage.test.jsx`(isAdmin false/null/true 묶음, history·manage·records 뷰, URL replace 5종), `settingsNavigation.test.js`(surface inbox/adminPage 집합), `inboxUrl.test.js`, `RecordsPage.test.jsx`(section 5), i18n merge.

### Phase 5 — ④a 계약·승인 앱 독자
- 계약 7파일(양쪽 같은 회차), §6.3 소비 지점(정책), `stricterSetting` 확장, `rx` 토큰.
- 완료 기준: 구판·신판 `rms.issue` 벡터 통과, pol 이 유효 정책·타임시트 상한·증거에 반영, DIVERGED 키별 엄한 쪽.
- 테스트: `signature.test.js`/`contractSelfContained.test.js`, `setting.test.js`(§7.1), `merge.test.js`(LINKED_ISSUE pol), `LinkedIssueSettingSource.test.js`(pol 보존 저장), `TimesheetService` 상한 집계 1건, `getLinkedIssueOverview` 응답.

### Phase 6 — ④a 워크포스 작성자
- WF-L9~L14(정책 부분). 완료 기준: rx v2 없는 ctl 에서 정책 칸 미표시·저장 시 `ISSUE_SETTING_UNSUPPORTED`, 있으면 저장·재조회 일치.

### Phase 7 — ④b 승인 앱 flows
- `approval.flows` 게시·`fl` 소비(§5.3 1단계)·rx 토큰. 완료 기준: 프로젝트 설정 저장 → flows 문서 touch, `fl` 유효/무효 분기. 테스트: `WorklogApprovalFlowsDoc.test.js`(본문·대상 커서·삭제), `WorkforcePublisher` flows 종류, `flowChoice` WORKFORCE 분기, `idleSqlBudget` flows pending 0 → SQL 0 추가.

### Phase 8 — ④b 워크포스 결재선 열
- WF-L10(flowsDoc)·L11(flow)·L13(열)·L16. 완료 기준: 검증된 flows 문서가 있을 때만 열, 옵션 밖 저장 거부.

### Phase 9 — ② 결재자 표시
- `listWorkforceTeams`·`teamsFromOrgs`·`pageOrgRows`·`rosterMembership`, `WorkforceTeamsSection`, 결재자 이름 2곳.
- 완료 기준: 연동 모드 팀 탭에 섹션(빈 상태 포함), 내 타임시트에 결재자 이름, 워크포스 DB·스키마 무변경, 연동 꺼짐 SQL 0.
- 테스트: `teamsFromOrgs.test.js`(§7.1), `WorkforceTeamsService.test.js`(꺼짐 SQL 0·5페이지 상한 truncated·겹침), `WorkforceTeamsSection.test.jsx`(상태 3·빈 상태·다시 읽기 호출 인자), `SubmitBar.test.jsx`/`MyTimesheetPage.test.jsx` 결재자 이름, `TimesheetSnapshotSection.test.jsx` prop.

### 공통 완료 기준 (요구서)
양쪽 jest·빌드 통과, `permissionMap.contract`·i18n merge·`idleSqlBudget`(숫자 무변경), 워크포스 DB 스키마 무변경, 승인 앱 SQL DDL 없음.

---

## 19. 작업 분해 체크리스트

### backend (승인 앱)
- [ ] P1: `WorklogControlContext`/`Ctl`/`Detector`, `SettingsRepository`·`SettingsService` 키 삭제, 테스트
- [ ] P3: `flowChoice`·`mergePolicy(issueLinked)`·`WorklogPolicyResolver` 연동 판정 전달, `WorklogApprovalPolicy.read/view/select`, `WorklogApprovalRepository.bindingsOf/deleteBinding`, `WorklogPolicyService.listIssueExceptions/lookupProjectIssue/saveIssue 거부/issue 응답`, PermissionMap 3(+select 축 변경), `ErrorCodes` 1 + error.json, 감사
- [ ] P4: `PrincipalController`, `InboxRepository/Service` history·targetKinds, `historyFilter`, `ApprovalAdminService`(+`ApprovalRepository.searchAll`, 독촉 공용화), PermissionMap 3, `CONTROLLER_REGISTRARS`
- [ ] P5: 계약 7파일, `stricterSetting`/`effectiveSetting`, `merge` LINKED_ISSUE pol, `getLinkedIssueOverview`, rx 토큰
- [ ] P7: `WorklogApprovalFlowsDoc`, `WorkforcePublisher` flows, `flowChoice` WORKFORCE, AGENTS asApp 2번 문구, `idleSqlBudget` 단언 1
- [ ] P9: `teamsFromOrgs`, `WorkforceTeamsService`, `pageOrgRows`, `rosterMembership`, PermissionMap 1
- [ ] 문서: CLAUDE.md 제품 변경 이력, `docs/LINKED-ISSUE-SCHEDULE.md` §10 남은 일에서 A-7 삭제(Q141)·작성 창구 문구, DESIGN.md 입력 창구 절

### frontend (승인 앱)
- [ ] P1: `WorkforceLinkSettings` 창구 삭제, `linkStateOf`
- [ ] P3: `WorklogTab`(패널·select 삭제·규칙 한 줄), `IssueApprovalOverview`, `WorklogApprovalFlowLine`, `IssueExceptionList`(projectSettings 엔트리), `ProjectPolicyModal` 안내, `LinkedSettingSummary` 가산, `worklogPolicy.*` 문구, 정적 테스트
- [ ] P4: `usePrincipal`, `InboxPage` groups·뷰 3(lazy+`importWithReloadOnce`), `HistoryPage`, `ApprovalAdminPage`, `RecordsPage`, `inboxUrl`/`settingsNavigation` 호환·surface, i18n
- [ ] P9: `WorkforceTeamsSection`, `SubmitBar`/`MyTimesheetPage` 결재자, `TimesheetSnapshotSection` prop
- [ ] 모두: kr/en 동시, `npm run merge`, 엔트리 3곳 변경 없음 확인, 100vh 금지

### workforce — §16 WF-L1~L16

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-13 | 초판 | 요구서(사용자 결정 ①~⑤) |
| 2026-10-13 | 초판 작성 중 반영 — ③ 갱신본: 이슈 화면 편집 UI 전면 제거 원칙, 우측 칸 "워크로그 승인 결재선" 선택(`WorklogApprovalPolicyPanel` → `selectIssueWorklogApprovalFlow`) 제거·읽기 전용 한 줄, 선택은 단독 = 프로젝트 설정 이슈 예외 목록 열 / 연동 = ④ 워크포스 표. `selectIssueWorklogApprovalFlow` 축 `{issue:'edit'}` → `{project:'admin'}`·입력 `projectId`·`flowId:null` 해제, 연동 모드 결재선용 계약 `approval.flows`·`rms.issue.fl`(④b 분리) | 코디네이터 전달 사용자 요구 변경 |
