# linked-mode-fix — 요구서 (2026-10-14)

## 배경 (실측, ARS-14 · 개발 사이트)
- 연동 모드에서 이슈 화면에 패널이 둘 보인다: 워크포스 `jira:issueActivity`(Moves Workforce) + 승인 앱 `Work log`.
  워크포스 패널은 `movesApproval.ctl` 의 `wa.v == 1`(이슈 또는 프로젝트 프로퍼티)이 있을 때만 숨겨지는데,
  승인 앱은 이 ctl 문서를 **일일 스윕의 `scanCtl`** 에서만 대상 등록한다(24h 워터마크). 이슈 신호(rms.policy I:)를
  새로 검증해도(`WorklogPolicyAuthority.refreshOne` → `onLinkChanged`) ctl 은 touch 되지 않는다. 설정 "전체 재게시"도 ctl 을 포함하지 않는다.
  → 연결 직후 하루 이상 패널 중복. ARS-14 는 신호 검증(13:15) 뒤에도 ctl 없음(REST 로 404 확인).
- 승인자 검색: 작성자 본인은 후보에서 빠진다(자기 승인은 워크포스 팀장일 때만). 그런데 워크포스는 `movesRms.org` 에
  팀 구조(teamKey·teamName·leaderKeys·leads)를 **게시하지 않는다**(WF `src/integration/approval/orgCap.js` 주석, 실측 Tom Kim 문서
  `teamKey:null, leaderKeys:[], leads:[]`). → `isWorkforceTeamLead` 항상 false, 기본 승인자(소속 팀장)도 항상 빈 값.
  설계서 `docs/LINKED-ISSUE-SCHEDULE.md` W-8a/Q16 이 "실측 뒤"로 미뤄 둔 항목.

## 사용자 결정 (2026-10-14)
1. **워크포스의 Jira 이슈 패널은 없애도 된다.** → 워크포스 manifest 의 `jira:issueActivity`(moves-rms-issue-activity)·`jira:issueContext`(moves-rms-issue-context) 제거.
   워크로그 입력은 승인 앱 이슈 화면(Work log 탭·Log work 액션) 또는 워크포스 앱 내부 화면만.
2. **팀장은 본인 결재가 가능해야 한다.** 팀장의 결재는 위 팀장, 위가 없으면 본인(설계 W-8a/Q16 그대로). 일반 팀원의 기본 승인자는 소속 팀장.
3. 두 수정 모두 지금 진행("둘 다 진행").

## 요구
### R1 (승인 앱) ctl 즉시 게시
- `rms.policy`(I:·P:) 신호가 새로 VERIFIED 되거나 `ctl` 값이 바뀐 직후, 그 대상의 ctl 행(workforce_publish account_id 'I:{id}'/'P:{id}', doc_key 'ctl')을 touch 하고
  `WorkforcePublisher.publishCtlNow([entityId])` 를 1회 시도한다(설정 저장 경로 `WorklogControlService.publishCtl` 과 동일 규약: 던지지 않음, 실패는 일일 스윕이 잇는다).
- 호출 주체가 사용자 컨텍스트(asUser) 인 화면 경로에서 발생하므로, 게시 PUT 은 기존대로 asApp(AGENTS 허용 2번) 경로를 그대로 쓴다. 새 SQL·manifest 없음.
- 유휴 SQL 예산: 신호가 **바뀔 때만**(accepted && (status 변경 || ctl 변경)) 동작. UNCHANGED 경로에 SQL 추가 금지.

### R2 (워크포스, W-8a) 팀 구조 게시 — 본인 문서 경로
- 기존 능력 신호 경로(`ApprovalLinkSignals` org cap: 본인 `movesRms.org` 를 **asUser** 로 씀)에서 본문의 팀 칸을 채운다:
  `teamKey`(소속 팀), `teamName`, `leaderKeys`(결재자 = 소속 팀 팀장, 본인 제외; 본인이 그 팀의 팀장이면 **상위 팀 팀장**, 상위가 없으면 빈 배열),
  `leads: [{teamKey, teamName, memberKeys}]`(본인이 이끄는 팀과 팀원 accountId). 계약 `validateBody(TYP.RMS_ORG)` 상한(ORG_MAX_*) 준수 — 초과 시 잘라내지 말고 게시 실패·로그.
- 앱의 타 사용자 프로퍼티 쓰기(G1 미검증)는 **쓰지 않는다**. 갱신 시점은 본인이 워크포스 화면을 열 때(기존 memo 주기). 팀 구조가 바뀌면(팀 이동·팀장 변경) memo 를 무효화해 다음 열람 때 재게시.
- 원천: `TeamRepository`(users.team_key) + `TeamTreeCache`(KVS team.leaderAccountId, parentKey) + `TeamLeadership.leadingTeamKeyOf`.
- `cap`·`rev` 규칙 유지(rev 단조 증가, 'wlorigin' 보존).

### R3 (승인 앱) 수신 측 확인
- `orgViewOf`·`identityOf`·`worklogSelfApprovalOf`·`TeamScope.upperLeadsOf` 가 채워진 leads/leaderKeys 로 동작하는지 테스트로 고정:
  팀장 본인 → `selfApprovalAllowed:true`, 후보에 본인 포함, `defaultApproverIds` = 상위 팀장(있으면). 팀원 → 기본 승인자 = 소속 팀장.
- 설정 "내 Workforce 결재자 구성"·팀 탭 "워크포스에서 받은 팀" 이 실데이터를 표시.

### R4 (워크포스) 이슈 패널 제거
- manifest 에서 `jira:issueActivity`·`jira:issueContext` 모듈 삭제, 관련 resource/엔트리/`panelStates.PANEL_MODULE` 분기·displayConditions 주석 정리, 테스트 갱신.
- 워크포스 앱 내부 화면의 "넘김" 버튼·통제 문서 소비는 유지(ctl 의 `ui.globalPagePath` 등).

## 완료 기준
- 승인 앱: 이슈 신호 최초 검증 직후(동일 요청 안) ctl PUT 시도 로그·행 상태 확인 테스트. jest 녹색.
- 워크포스: Tom Kim(팀장)이 워크포스를 열면 본인 `movesRms.org` 에 leads 가 채워져 게시. jest 녹색. manifest 에 이슈 패널 모듈 없음.
- 승인 앱 실측(개발 사이트, 터널): ARS-14 작업 로그 상세 → 승인 요청 → 후보에 본인(팀장) 포함, 기본 승인자 자동 선택.
- 두 리포 모두 테스트·빌드 통과. SQL 추가 없음.

## 범위 밖
- 앱의 타 사용자 프로퍼티 쓰기(G1) 실측·전환.
- `approval.flows` 프로젝트 프로퍼티 "쓰기 거부"(F:10300) — 별도 조사.
- 워크포스 표시용 팀 트리 화면 변경.

## 제약
- 두 앱 모두 `forge tunnel` 실행 중(승인 앱 8000). 배포·커밋은 사용자 요청 때만. AGENTS.md 규약.
- 워크포스 리포 작업 트리에 미추적 파일(pptx·png·custom-scopes.yaml·LeaderTeamBackfill.test.js)과 locales 수정이 있다 — 건드리지 않는다.

## 열린 질문 답 (2026-10-14, 사용자)
- Q1 전체 재게시에 ctl·flows 재스캔 포함: **가)** 포함(설계 기본값).
- Q2·Q3 팀장이 비어 있는 팀: **나)** 위로 올라가 **가장 가까운 조상 팀의 팀장**. 끝까지 없으면 팀장 본인은 본인 결재, 팀원은 명부(승인자 선택) 경로. 팀장 A 의 상위 팀과 일반 팀원의 소속 팀 모두 같은 규칙.
- Q4 상위 팀장 B 의 `leads[].memberKeys` 에 하위 팀 팀장 A: **나)** 포함("결재자가 나인 하위 팀 팀장"도 넣는다 — 결재선과 열람 범위 대칭).
- Q5 500명 초과: **가)** 게시 실패·로그(설계 기본값).
- Q6 단독(명부) 모드 본인 결재: 이번 범위 밖(설계 기본값).
- Q7 `worklogOwner` 표식: **가)** 되돌림(설계 기본값).
