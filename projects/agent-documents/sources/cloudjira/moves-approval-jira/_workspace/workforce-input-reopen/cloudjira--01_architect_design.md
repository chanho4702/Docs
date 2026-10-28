# workforce-input-reopen 설계서 — 워크포스 앱 내부 입력 재개방(승인 앱 판정 동일성 보장)

> 작성 2026-10-14 · feature-architect · 입력 `00_input/requirement.md`(R1~R3, 완료 기준, 범위 밖)
> **기준 트리**
> - 승인 앱: `master`(ccb5aa1) + 작업 트리의 linked-mode-fix 미커밋 변경(R1 ctl 즉시 게시·R3 기본 승인자)
> - 워크포스: `RFC-220`(03bdfa8) + linked-mode-fix 미커밋 변경(R2 팀 구조 게시·R4 이슈 패널 제거·`panelApproval.js` → `components/worklog/approvalHandoff.js` 이동)
>
> **이 설계는 linked-mode-fix 가 병합된 뒤를 전제한다.** 경로 앞 `WF:` 는 워크포스 리포다.
> 근거 등급: **코드**(리포에서 확인) / **문서**(CLAUDE.md "공식 문서로 확인") / **미검증**(§14).
> 코드 수정 없음 — 이 문서가 backend·워크포스 구현자의 단일 진실 원천이다.

---

## 0. 결론 요약

1. **창구 신호는 `ch` 가 아니라 ctl 의 새 칸 `wr`(write rules)다.** `ch` 는 `'APP'` 그대로 둔다. 계약 validator 가 `ch ∈ {APP, WORKFORCE}` 만 받는다. 그래서 `'ANY'` 를 쓰면 구판 워크포스가 ctl 문서 **전체**를 검증 실패로 버리고, 넘김까지 막힌다(§5.1).
2. **판정 동일성은 "해석된 입력 게시 + 작은 판정 계약 파일"(H안)로 맞춘다.**
   - 정책 병합(사이트·프로젝트·이슈 예외·연동 층)은 승인 앱만 한다. 그 결과값을 ctl `wr` 에 싣는다.
   - 워크포스는 자기완결 계약 파일 `writeGate.js`(두 리포 바이트 동일, import 없음)로 판정만 한다.
   - 승인 앱에 **대조 테스트**를 둔다. `writeGate` 와 승인 앱 도메인 함수(`evaluateWorklogLock`·`judgeCreate`·`judgeMutation`·`mutationNotices`)가 같은 답을 내는지 확인한다(§3).
3. **워크포스가 정확히 판정할 수 없는 경우는 전부 `DEFER`다(저장 안 함 + 승인 앱으로 넘김).**
   - 해당 경우: 사전 승인 필요, 승인 앱 이슈 예외, BLOCK 모드의 하루·주 상한, 판정 지평 밖 날짜, 승인 앱이 아직 관찰하지 않은 기록, 문서를 읽지 못함.
   - DEFER 는 거부의 한 형태다. 따라서 "판정 불가 = 거부"를 만족한다.
4. **사후 검증·자동 접수는 승인 앱 변경 없이 그대로 돈다.**
   - 워크포스 서명 출처(`movesRms.origin`)는 PROVEN 이다.
   - 트리거가 승인 앱 화면 작성과 같은 `requestAutomatically` 를 태운다. 그래서 기본 승인자 규칙(linked-mode-fix R3)도 두 창구에서 같다(§6).
5. **새로 생기는 것이 없다.** 새 테이블·SQL 마이그레이션·manifest 변경·워크포스 locales 변경이 없고, 사용자별 추가 PUT 도 0 이다.
   - 추가 비용 ①: ctl 문서를 3일마다 다시 서명하는 PUT(대상 수 ÷ 3 / 일)
   - 추가 비용 ②: 워크포스 쓰기 1건당 Jira GET 1~3회(§13)

---

## 열린 질문 (제품 결정만 — 설계는 각 질문의 **기본값**으로 진행)

| # | 질문 | 선택지 | 기본값(설계 반영) | 근거 |
|---|---|---|---|---|
| Q1 | 정책 위반 처리가 **BLOCK**이고 하루·주 상한이 켜진 사이트에서, 워크포스 작성·수정은 어떻게 처리하나? | (a) **승인 앱으로 넘김(DEFER)** (b) 워크포스가 그 주의 본인 워크로그 합계를 직접 계산한다. 이슈 전반을 Jira 로 조회하고, 숨긴 기록은 인증 문서로 보충한다 | **(a)** | 기본 설정이 WARN 이라 대부분 사이트는 영향이 없다. (b) 는 쓰기 1건당 Jira 조회가 수~수십 회 늘고, 승인 앱 `collectMine`(숨김 보충 포함)과 합계를 똑같이 맞추기 어렵다 |
| Q2 | 연동 이슈의 **기간 일괄 입력**(워크포스 모달 기간 모드)은 어떻게 하나? | (a) **날짜별로 먼저 판정(`dryRun`)하고, 하나라도 거부되면 아무것도 저장하지 않는다. 저장 도중 실패하면 되돌리지 않고 남은 날짜를 안내한다** (b) 첫 날만 저장한다(지금 넘김과 같은 범위) (c) 계속 승인 앱으로 넘긴다 | **(a)** | 지금 구조는 실패하면 이미 만든 기록을 DELETE 로 되돌린다. 연동 이슈에서 이렇게 하면 승인 요청 생성과 취소가 쌍으로 남는다. 사전 판정으로 이런 경우를 줄인다 |
| Q3 | 거부 사유 문구는 어떻게 보여 주나? (완료 기준이 **워크포스 locales 불변**이다) | (a) **기존 키를 재사용하고, "승인 앱에서 열기"로 정확한 사유를 승인 앱에서 보게 한다(§12 대응표)** (b) 동결이 풀린 뒤 전용 키 5개를 추가한다(후속) | **(a), 동결 해제 뒤 (b)** | 기간 밖·잠금은 기존 키(`error.outsideWindow`·`issueApprovalSetting.lockHint`)로 정확히 표현된다. 정책 위반은 DEFER 로 넘겨, 승인 앱 문구가 사유를 말하게 한다 |
| Q4 | 워크포스 입력을 다시 막는 **비상 스위치**(승인 앱 정책 키)를 둘까? | (a) **두지 않는다.** 되돌릴 때는 승인 앱 이전 판을 재배포해 `wr` 이 사라지게 한다(≤ 하루, 늦어도 7일 뒤 만료) (b) GLOBAL_ONLY 키 `workforceInputEnabled`(기본 true)를 둔다 | **(a)** | 키를 추가하면 기본값·KVS 맵 계약·설정 화면·i18n 이 따라온다. 필요해지면 (b) 는 `bodyFor` 에서 `wr` 을 빼는 한 줄로 붙는다 |
| Q5 | 워크포스에서 **방금 쓴 기록**을 곧바로 수정·삭제하면? (승인 앱 인증 문서에 아직 실리기 전, 보통 45초~수 분) | (a) **작성 후 10분 안이고, 워크포스가 자기 서명 봉투를 확인하면 허용한다** (b) 문서에 실릴 때까지 넘긴다 | **(a)** | 승인 앱이 이 기록에 더 거는 잠금(승인·인증)은 사람의 결정이 있어야 생긴다. 10분 안에 결정과 게시가 모두 끝난 뒤 수정이 들어오는 경우만 남는다. 이 경우도 승인 앱이 "승인 후 변경"으로 잡는다(§6 R-2) |

---

## 1. 현황 진단 — 요구서 전제 중 코드와 다른 곳

### F-1 워크포스 서버는 이미 연동 이슈 작성을 DIRECT 로 받는다

- **사실(코드)**: 워크포스 **서버** `createIssueWorklogService` 는 ctl 에 `wa.v===1` 이 있고 서명 키가 있으면 연동 이슈 작성을 DIRECT 로 받는다(WF:`IssueWorklogControlService.js:132-134`, 4e84b69).
  - 대신 검사가 근사치다. 마감은 "월 + closeDays"만 본다(주 단위·수동 마감·재개방 무시). s/e·dw 는 본다.
  - 사이트 기록 규칙 7키·본인 제출 잠금·사전 승인은 보지 않는다(`:293-310`).
  - **화면**은 `writeChannel`(HANDOFF)만 쓰므로 이 경로를 타지 않는다.
- **영향**: 낡은 번들이나 직접 `invoke` 로 **부분 우회**가 지금도 열려 있다. 요구서의 "워크포스 신판은 무조건 넘긴다"는 화면에만 맞는 말이다.
- **처분**: 이 근사 검사를 지우고 §3 `writeGate` 로 바꾼다(T-W4). 승인 앱은 ctl 에서 `wa` 를 뺀다(§4.1). 그러면 구판 워크포스 서버도 HANDOFF 로 닫힌다.

### F-2 36시간 나이 검사는 잠복 결함이다

- **사실(코드)**: 같은 경로는 `now - ctl.iat > 36h` 이면 `WORKLOG_LINK_UNCONFIRMED` 를 낸다. 그런데 승인 앱 `drainCtl` 은 내용이 같으면 PUT 을 생략해 iat 를 갱신하지 않는다(`WorkforcePublisher.js:592-595`).
- **영향**: 설정이 바뀌지 않으면, 게시 후 36시간이 지난 뒤로 그 경로는 영구히 거부된다.
- **처분**: 나이 검사 대신 `wr.exp`(서명된 만료)를 쓴다. 3일 버킷으로 내용 자체를 바꿔 정기 재서명한다(§2 신선도).

### F-3 `ch` validator 는 두 값만 받는다

- **사실(코드)**: `validateBody(APPROVAL_CTL)` 는 `ch` 로 `'APP'`·`'WORKFORCE'` 만 허용한다(`contract.js` APPROVAL_CTL validator).
- **영향**: `ch:'ANY'` 를 게시하면 구판 검증자가 문서 전체를 거부한다. 그러면 워크포스는 BLOCKED 가 되어 넘김 버튼도 사라진다.
- **처분**: `ch` 는 `'APP'` 로 고정한다. 신호는 `wr` 로 보낸다(§5.1).
  - `'WORKFORCE'` 는 다시 쓰지 않는다. linked-issue-schedule 시절 워크포스가 이 값을 무조건 직접 기록으로 해석하기 때문이다.

### F-4 연동 사전 승인 위반은 사후 감지가 꺼져 있다

- **사실(코드)**: 승인 앱 트리거의 연동 사전 승인 위반 감지가 꺼져 있다. `observeLinked` 가 `body.pa='NOT_REQUIRED'` 로 덮어쓴다(`WorklogControlDetector.js:167`, cc5d082). 워크포스 승인 설정 표에도 사전 승인 열이 없다.
- **영향**: 사전 승인은 사후에 잡히지 않는다. 그래서 사전에 막아야 한다.
- **처분**: 사전 승인이 필요하면 작성은 무조건 DEFER 한다(§2 행 3).

### F-5 낡은 주석

- **사실(코드)**: `WorklogControlDetector.js:172` 주석이 "워크포스 출처 봉투가 붙은 새 기록은 구버전의 직접 작성"이라고 쓴다. 해당 관찰 코드는 이미 없다.
- **영향**: 오해 소지가 있다.
- **처분**: 주석만 고친다(T-A6).

### F-6 승인 앱 설정 문구가 틀려진다

- **사실(코드)**: 승인 앱 설정 문구 `workforce.writeChannel`(kr:138)이 "워크포스 화면의 기록 버튼은 이 앱으로 넘어옵니다"라고 쓴다.
- **영향**: 이번 변경 뒤에는 사실과 다르다.
- **처분**: 문구를 교체한다(§12).

---

## 2. 판정 항목 × 원천 표 (R1)

**공통 규칙**
- 워크포스는 서명이 검증된 문서만 쓴다(불변식 9).
- 문서가 없거나, 서명이 틀리거나, 만료됐거나, 읽기에 실패하면 그 항목은 **DEFER**(저장 안 함 + 승인 앱 경로)다.
- DEFER 사유는 **판정보다 먼저** 본다. DEFER 는 언제나 안전한 쪽이라, 순서가 승인 앱과 달라도 결과가 느슨해지지 않는다.

### 2.1 원천과 추가 게시

| # | 항목 | 승인 앱 판정 지점(코드) | 승인 앱 입력 원천 | 워크포스가 읽는 서명 문서 | 지금 계약 | 추가 게시(최소) |
|---|---|---|---|---|---|---|
| 1 | **작성 기간 s/e**(팀장 지정) | `WorklogControlContext.contextFor` settingWindow → `rules.judgeCreate`/`judgeMutation` windowVerdict | `workforce_inbound` rms.issue(수용본, DIVERGED 면 더 엄한 쪽) | 이슈 프로퍼티 `movesRms.issue`(워크포스 **자기** 서명, `verifyOwnIssueSetting`) — 이미 읽음 | 있음 | 없음 |
| 2 | **Jira 기간 창**(s/e 없고 `worklogDateWindow` ON) | 같은 곳 `windowLinked && dateWindowOn` → `StartDate.windowOf` | 유효 정책 `worklogDateWindow`(프로젝트·이슈 층이 덮을 수 있음), Start date 필드 상태 | ctl `sf`·`tz`(있음) + **`wr.wd`**(유효값). 이슈 필드는 asUser GET(이미 함) | 일부 — `dw` 는 **사이트값**이라 부족 | `wr.wd` |
| 3 | **사전 승인** | 승인 앱 화면은 `approvalRequired` 면 직접 작성 대신 사전 승인 요청을 만든다. 서버 `WorklogApprovalPolicy.read`: pa 가 있으면 pa, 없으면 유효 `approvalMode==='PREAPPROVAL'` ∨ 프로젝트 `config.required` | rms.issue `pa` + 정책 계층 + `worklog_approval_config` | rms.issue `pa`(자기 문서) + **`wr.pq`** | pa 는 있음, 기본값은 없음 | `wr.pq` |
| 4 | **승인분·인증 잠금**(수정·삭제) | `WorklogControlContext.certStates`: `approvedIds`(건별 승인 APPROVED) ∪ `worklog_cert.state ∈ {CERTIFIED, MISMATCH}` → `judgeMutation` CERT_LOCKED | 승인 원장·인증 원장 | 사용자 프로퍼티 `movesApproval.cert.{YYYY-MM}`(본인, asUser) — `approval.entries[i]=[id,status,…,origin(5),…,closeAt(9)]`, `w`(인증 목록·flag) | 있음(워크포스 `approvalOfWorklog` 가 이미 해석) | 없음 |
| 5 | **사이트 마감·자동 마감**(cl) | `PeriodLockService.evaluate` → `lock.evaluateWorklogLock` closedAt(덮는 마감 행이 있으면 행만, 없으면 단위 기간 자동 마감) | `period_close`(SITE) + 유효 `periodAutoCloseDays`·`approvalUnit`·`timeZone`(+ 연동 `wa.closeDays` 덮어쓰기) | ctl **`wr.cr`**(마감 행) + **`wr.u`·`wr.acd`** + rms.issue `wa.closeDays`(자기 문서) + ctl `tz` | 일부 — cert 엔트리 closeAt 은 **기존 기록에만** 있고 새 날짜에는 없음 | `wr.cr`·`wr.u`·`wr.acd`·`wr.hz` |
| 6 | **본인 제출·승인 잠금**(lk: PERIOD_SUBMITTED·PERIOD_APPROVED) | 같은 함수 ownLockAt(최신 제출 PENDING·APPROVED, `lockSubmitted`, 쓰기 경로 `lockApproved=true`) | 타임시트 요청 행 | 사용자 프로퍼티 `movesApproval.{YYYY}`(본인, asUser) 기간별 `{st, cl, lk, ps, pe}` + **`wr.ls`** | 문서는 있음(워크포스 미사용) | `wr.ls` |
| 7 | **사이트 기록 규칙 7키**(createWindowDays·editWindowDays·deleteWindowDays·pastDateMaxDays·futureDateAllowed·dailyMaxSeconds·weeklyMaxSeconds) + violationAction | `WorklogService.checkPolicy` → `worklogPolicy/mutation.mutationNotices`(날짜 5키). BLOCK 이면 throw | 정책 계층 병합(사이트 관리자 + 프로젝트·이슈 예외) | **`wr.r`·`wr.va`** | 없음 | `wr.r`(7값)·`wr.va` |
| 8 | **하루·주 상한**(BLOCK 일 때만 합계 계산) | `checkPolicy` 의 `collectMine` + `evaluateLimits` — 숨긴 기록 포함 주간 합계 | Jira(숨김 보충 asApp) | — | 없음 | 없음 |
| 9 | **승인 앱 이슈 예외**(JIRA_ISSUE 층 — 연동 이슈에도 기록 규칙은 적용됨, `merge.js` 주석) | `mergePolicy` | `worklog_policy_issue_override` 등 | I: ctl 이면 `wr` 에 이미 반영. P: ctl 이면 **`wr.ix`**(예외 이슈 id 목록)·`wr.ixa` | 없음 | `wr.ix`·`wr.ixa` |
| 10 | **출처·통제 상태**(남의 경로 기록 삭제 대기·통제 작업 중·숨김) | `judgeMutation` foreignState·controlBusy, `executorOf` | `worklog_control` | cert 엔트리 `origin`(e[5]) + 워크로그 `visibility` + ctl `vt` | 있음 | 없음 |

### 2.2 신선도와 판정 불가 처리

| # | 신선도 | 판정 불가일 때 |
|---|---|---|
| 1 | 워크포스 자기 문서가 원본이다. 승인 앱은 트리거 `observeLinked` 에서 같은 문서를 다시 읽어 수용한다 | 서명 실패 → DEFER. 승인 앱은 이때 미해결 창으로 거부한다 |
| 2 | ctl `wr.exp` | 필드 읽기 실패 → `WORKLOG_WINDOW_UNRESOLVED`(DENY, 승인 앱과 같음) |
| 3 | `wr.exp` | 필요 조건 = `pa==='REQUIRED'` ∨ (`pa==null` ∧ `wr.pq`). 필요하면 작성은 **DEFER**(`PREAPPROVAL_REQUIRED`). 사전 승인 요청은 승인 앱에서만 만들 수 있다(앱 간 호출 불가). 수정·삭제는 승인 앱도 approvalMode 를 보지 않으므로 해당 없음 |
| 4 | 변경 즉시 게시(`touchCert` → `workforce-cert`, 45초 디바운스). 만료 없음 — 지연 창은 §6 R-2 | 엔트리가 없음(아직 관찰 안 됨, 또는 1,000건 초과 `truncated`) → DEFER(`NOT_OBSERVED`). 단 Q5 10분 유예. 문서 읽기 실패 → DEFER |
| 5 | `wr.exp`. 마감·재개방 시 즉시 재게시(§8.1) | 날짜 < `wr.hz`(지평 밖) → DEFER(`OUT_OF_HORIZON`) |
| 6 | 변경 즉시 게시(제출·결정 touch). 만료 없음 | 404(문서 없음) = 제출 없음. 그 밖의 읽기 실패·서명 실패 → DEFER |
| 7 | `wr.exp` | — |
| 8 | — | `wr.va==='BLOCK'` ∧ (`dm`>0 ∨ `wm`>0) 이면 작성·수정 → **DEFER**(`LIMIT_NEEDS_TOTAL`, Q1). WARN 이면 승인 앱도 합계를 내지 않으므로 결과가 같다 |
| 9 | `wr.exp` | P: 문서인데 이슈가 `ix` 에 있거나 `ixa` → DEFER(`ISSUE_EXCEPTION`) |
| 10 | — | origin ∉ {APP, WORKFORCE, APP_CHANGED, WF_CHANGED} → DEFER(`ORIGIN_UNPROVEN`). visibility 가 ctl `vt` 와 같으면(우리가 숨긴 기록) → DEFER(`CONTROLLED`) — 실행 주체가 앱이다 |

### 2.3 `wr.exp` 규칙

- `wr.exp = floor(now / 3일) × 3일 + 7일`(결정적)이다.
  - 같은 3일 버킷 안에서는 본문이 같아 PUT 이 없다.
  - 버킷이 바뀌면 본문이 바뀌어 기존 `drainCtl` 이 PUT 한다.
  - 결과: 대상마다 3일에 한 번 재서명되고, 만료까지 최소 4일 여유가 있다.
  - 기존 일일 `scanCtl` 이 대상을 매일 전량 touch 하므로, 새 스케줄도 특별 분기도 필요 없다.
- 워크포스는 `now < wr.exp` 일 때만 `wr` 을 쓴다. 만료됐으면 `gated=false` → HANDOFF 다(§5.2). 승인 앱이 연동을 끄거나 게시가 막히면, 늦어도 7일 안에 워크포스 입력이 닫힌다.
- 사용자별 문서(cert·v1)는 변경 즉시 게시되고 만료가 없다. 잠금이 생기는 사건(승인·인증·제출·마감)은 전부 그 문서를 touch 한다(코드). 남는 것은 게시 지연뿐이다(§6 R-2).

---

## 3. 판정 함수 동일성 전략 (R1)

### 3.1 세 안 비교

- **B안**: 승인 앱 도메인 함수를 워크포스로 복사한다.
- **P안**: 승인 앱이 판정 결과를 미리 계산해 게시한다.
- **H안**(권고): 승인 앱이 해석된 입력을 게시하고, 워크포스는 작은 판정 계약 파일로 판정한다.

| 기준 | B안 | P안 | **H안** |
|---|---|---|---|
| 무엇을 옮기나 | `lock.js`·`period.js`·`mutation.js`·`rules.js`·`window.js`·`merge.js`·`catalog.js`(+ import 사슬 `approval/constants`·`eventId`·`canonical`) | 없음 — 승인 앱이 "이 이슈·이 날짜 허용?"을 미리 계산 | `writeGate.js` 하나(자기완결·import 없음, ~250줄) |
| 입력이 다 있나 | **없다.** 병합 입력인 프로젝트·이슈 예외(KVS·SQL), `config.required`, 마감 행은 게시되지 않는다 → 어차피 게시가 필요하다 | 판정은 날짜·시각·now 에 따라 달라진다. 미리 계산하려면 사용자×날짜 표가 필요해 크기가 폭발한다 | 병합은 승인 앱이 끝낸 **값**을 싣는다. 워크포스는 날짜 계산만 한다 |
| 지연 | 입력 게시와 같음 | 날짜가 바뀔 때마다 재게시 필요 | 규칙 변경 시 즉시 tick, 그 밖에는 3일 재서명 |
| 용량 | — | 사용자×기간×이슈 → 수천 PUT | ctl 1건당 +3~10KB, 사용자별 문서 무변경 |
| SQL 예산 | 같음 | 사용자 수에 비례해 게시 SQL 증가 | 일일 scan 의 bodyFor 에 메모 SQL +1 + 2×프로젝트(§13) |
| 동일성 보장 | 파일 복사는 바이트 대조로 지킨다. 대신 계약 변경이 도메인 변경으로 번진다(`contract.js` 머리 주석의 2026-10-11 교훈 재발) | 승인 앱만 판정하므로 자명 | 대조 테스트가 승인 앱 도메인 함수와 같은 답을 강제한다(§3.3) |
| 변경 파급 | 병합 규칙이 바뀌면 워크포스도 재배포해야 한다 | — | 병합 규칙 변경은 승인 앱만 고친다. 잠금·창 규칙이 바뀌면 `writeGate` 와 대조 테스트가 함께 깨진다(의도) |

**권고: H안.**
- 병합처럼 자주 바뀌는 판단은 승인 앱에만 둔다.
- 시간 계산처럼 안정된 판단만 계약 파일로 공유한다.
- 정확히 맞출 수 없는 판단(Q1 합계 등)은 DEFER 로 뺀다. 그러면 워크포스의 결과는 "승인 앱과 같음" 아니면 "승인 앱으로 넘김" 둘 중 하나뿐이다.

### 3.2 계약 파일 `writeGate.js`

- 승인 앱 `src/integration/workforce/writeGate.js` = WF `src/integration/approval/writeGate.js` 이며 **바이트 동일**, import 0 이다.
- WF `vectors.test.js` 의 SYNCED 지문 표와 `no import` 검사에 추가한다.
- 승인 앱 런타임 경로는 이 파일을 **쓰지 않는다**(테스트 전용 대조 대상). 승인 앱의 쓰기 판정은 지금 도메인 함수 그대로이므로, 승인 앱 동작 변경은 0 이다.

```js
/** @returns {{verdict:'ALLOW'|'DENY'|'DEFER', code:string|null, cause:object|null, notices:Array<{code,severity,vars}>}} */
export const judgeLinkedWrite = ({
  op,            // 'create'|'edit'|'delete'
  now,           // ms
  timeZone,      // ctl.tz (사이트 timesheetTimezone — timeZone 은 siteOnly 키라 대상과 무관)
  wr,            // 검증된 ctl.wr (now < wr.exp 는 호출부가 이미 확인)
  basis,         // 'ISSUE'|'PROJECT' — ctl 을 어디서 읽었나(ix 는 PROJECT 만)
  issueId,
  setting,       // 자기 rms.issue 본문 {s,e,pa,wa}|null (서명 검증 통과분만)
  jiraWindow,    // {status:'OK'|'NO_FIELD'|'READ_FAILED'|..., start, end}|null — wd ∧ s/e 없음일 때만 호출부가 채움
  started, seconds,          // create·edit 의 새 값
  prevStarted, prevSeconds,  // edit·delete 의 현재 값
  own,           // v1 문서 엔트리 [{ps,pe,st,lk}] | [] (404) — 읽기 실패는 호출부가 DEFER
  cert,          // edit·delete: {entry:[...]|null, certified:boolean, truncated:boolean}
  freshOwn,      // edit·delete: 자기 봉투 검증 ∧ now - created ≤ 10분 (Q5)
  visibilityControlled, // edit·delete: isControlledVisibility(worklog.visibility, ctl.vt)
})
```

**판정 순서(계약).** 승인 앱 `createWorklog`/`updateWorklog`/`deleteWorklog` 의 순서(창 → 인증 잠금 → 기간 잠금 → 정책)를 따르고, DEFER 확인을 앞에 둔다.

| 단계 | create | edit | delete | 결과 |
|---|---|---|---|---|
| D1 | 사전 승인 필요(§2 행 3) | — | — | DEFER `PREAPPROVAL_REQUIRED` |
| D2 | `basis==='PROJECT'` ∧ (`ix∋issueId` ∨ `ixa`) | 같음 | 같음 | DEFER `ISSUE_EXCEPTION` |
| D3 | started < `wr.hz` | started·prevStarted 중 하나 < hz | prevStarted < hz | DEFER `OUT_OF_HORIZON` |
| D4 | — | `visibilityControlled` | 같음 | DEFER `CONTROLLED` |
| D5 | — | cert 엔트리 없음 ∧ ¬freshOwn, 또는 truncated | 같음 | DEFER `NOT_OBSERVED` |
| D6 | — | 엔트리 origin ∉ PROVEN | 같음 | DEFER `ORIGIN_UNPROVEN` |
| J1 창 | started | started, prevStarted | prevStarted | DENY `WORKLOG_OUTSIDE_ISSUE_WINDOW` / `WORKLOG_WINDOW_UNRESOLVED` |
| J2 인증 잠금 | — | cert.certified ∨ 엔트리 status APPROVED | 같음 | DENY `WORKLOG_CERTIFIED_LOCKED` |
| J3 기간 잠금 | started | started, prevStarted | prevStarted | DENY `WORKLOG_PERIOD_LOCKED`(cause reasonCode·periodKey·which) |
| J4 정책 날짜 | mutationNotices(create) | (edit) | (delete) | BLOCK 공지 → **DEFER** `POLICY_BLOCKED`(사유 문구는 승인 앱이 보여 준다, Q3). WARN 은 notices 로 반환하고 ALLOW |
| J5 상한 | `va==='BLOCK'` ∧ (dm∨wm) | 같음 | — | DEFER `LIMIT_NEEDS_TOTAL`(Q1) |
| — | | | | ALLOW |

**J1 창 해석** — `contextFor` 와 같다.
- `setting.s`·`setting.e` 중 하나라도 있으면 그 창(source LINKED_ISSUE)을 쓴다.
- 없고 `wr.wd` 면 `jiraWindow` 를 쓴다. 상태가 OK 가 아니면 UNRESOLVED 다.
- 둘 다 아니면 창 검사를 하지 않는다.

**J3 기간 잠금 입력**
- `acd` 는 `setting.wa.closeDays` 가 있으면 그 값(`mergePolicy` 의 LINKED_ISSUE 덮어쓰기와 같음), 없으면 `wr.acd` 다.
- `closes = wr.cr.map(([start,end,s]) => ({start,end,state: s==='C'?'CLOSED':'REOPENED'}))`
- `submissions` 는 `own` 을 `{start:ps,end:pe,status,driftDetectedAt}` 로 바꾼 것이다.
  - st `SUBMITTED` → PENDING
  - st `APPROVED` → APPROVED
  - st `CHANGED_AFTER_APPROVAL` → APPROVED + drift
- `lockSubmitted=wr.ls`, `lockApproved=true`(쓰기 경로 `PeriodLockService` 기본값).

**내부 시간 함수**(`localDateOf`·`zonedMidnight`·`periodKeyOf`·`periodRange`·`autoCloseAtOf`·`daysBetween`)는 승인 앱 `domain/timesheet/period.js`·`lock.js` 와 **같은 규칙의 지역 함수**로 둔다. `contract.js` 의 `isPeriodKey` 를 지역화한 것과 같은 방식이다.

### 3.3 대조 계약 테스트

| 테스트 | 위치 | 내용 |
|---|---|---|
| **바이트 동일** | WF `src/integration/approval/__test__/vectors.test.js` SYNCED 표 | `writeGate.js` 의 LF sha256 고정. import 0 검사 |
| **골든 벡터** | 두 리포 `writeGateVectors.json`(바이트 동일, SYNCED 에 추가) | 아래 구성으로 `{input, expected:{verdict, code, notices}}` ≥ 120건 |
| **승인 앱 대조(parity)** | 승인 앱 `src/integration/workforce/__test__/writeGate.parity.test.js` | 아래 규칙. 골든 벡터 전부 + 시드 고정 무작위 2,000건 |
| **v1·cert 문서 왕복** | 승인 앱 같은 파일 | `approvalDoc.entryBodyOf`·인증 문서 빌더로 만든 본문을 writeGate 입력 변환(§3.2)에 넣는다. 그 결과가 원래 submissions/certStates 판정과 같아야 한다 |
| **`wr` 생산 대조** | 승인 앱 `WorklogControlCtl` 테스트 | `bodyFor` 가 만든 `wr.r`/`va`/`acd`/`ls`/`wd`/`pq` 가 같은 대상의 `policyHierarchy.resolveOne` 유효값과 같다(`legacyViolationAction` EXTRA_STEP→WARN 포함) |

**골든 벡터 구성**
- tz: Asia/Seoul, America/Los_Angeles(DST 3월·11월 경계), UTC
- unit: MONTH, WEEK(ISO 53주 연도 2026)
- acd: 0, 3, 31
- 마감 행: 없음, CLOSED, REOPENED, 단위 혼합
- 경계 시각: 기간 끝 −1ms·정각·자동 마감 시각 ±1ms
- op 3종
- D1~D6 각 사유 1건 이상

**parity 비교 규칙**
- 같은 입력으로 승인 앱 쪽을 합성한다.
  1. `evaluateWorklogLock({…, closes, submissions, lockApproved:true})`
  2. `judgeCreate`/`judgeMutation`(certState 는 cert 입력에서 CERTIFIED/null)
  3. `mutationNotices`
- 그 결과를 `judgeLinkedWrite` 와 비교한다.
- writeGate 가 ALLOW/DENY 면 코드까지 같아야 한다.
- DEFER 는 D1~D6·J4(BLOCK)·J5 사유일 때만 허용한다.

---

## 4. 경계면 계약

### 4.1 ctl(`movesApproval.ctl`) 본문 변경 — 승인 앱이 게시, 워크포스가 읽음

| 칸 | 지금 | 바꾼 뒤 | 비고 |
|---|---|---|---|
| `ch` | `'APP'` | **`'APP'` 유지** | §5.1 |
| `wa` | `{v:1, autoRequest:true, lockApproved:true, closeDays}` | **삭제** | 아래 참고 |
| `rx` | `[... 'rms.issue.wa','approval.worklog.v1']` | 무변경 | `wr` 은 승인 앱이 **보내는** 칸이라 rx(받을 수 있는 것) 대상이 아니다 |
| **`wr`** | — | 아래 표 | 있고 유효하면 "워크포스 입력 허용 + 판정 재료"라는 뜻 |

`wa` 를 지우는 이유:
- 소비처는 WF 서버의 F-1 근사 경로와 (R4 로 사라진) 패널뿐이다.
- 빼면 구판 워크포스 서버도 HANDOFF 로 닫힌다.
- linked-mode-fix §6 의 "wa 유지" 메모를 이 설계가 대체한다.
- 이슈 단위 `rms.issue.wa`(팀장 설정)는 별개라 무변경이다.

`wr` 필드(전부 필수, `ix`·`ixa` 만 선택):

| 키 | 타입·범위 | 의미(승인 앱 원천) |
|---|---|---|
| `v` | `1` | 판 |
| `exp` | safe int ms, `exp > 0` | §2.3 신선도 |
| `u` | `'MONTH'\|'WEEK'` | `lockSettingsOf(effective).unit` |
| `acd` | int 0..3650 | 대상 유효 `periodAutoCloseDays`. **연동 `wa.closeDays` 적용 전** 값이다 — 연동 이슈 칸은 워크포스가 자기 rms.issue 로 적용한다 |
| `ls` | boolean | 유효 `lockSubmittedPeriod` |
| `va` | `'WARN'\|'BLOCK'` | `checkPolicy` 의 action(`legacyViolationAction==='EXTRA_STEP'` → WARN) |
| `r` | `{pd:int 0..3650, fa:boolean, cw:int 0..3650, ew:int 0..3650, xw:int 0..3650, dm:int 0..86400, wm:int 0..604800}` | pastDateMaxDays·futureDateAllowed·create/edit/deleteWindowDays·daily/weeklyMaxSeconds 유효값 |
| `wd` | boolean | 유효 `worklogDateWindow` |
| `pq` | boolean | pa 미지정 시 사전 승인 필요 여부 = 유효 approvalMode(연동 층 제외)==='PREAPPROVAL' ∨ `worklog_approval_config.required` |
| `hz` | safe int ms | 현재 기간에서 `CLOSE_RANGE_PERIODS`(24)기간 전의 시작(`PeriodLockService.rangesFor` 와 같은 지평) |
| `cr` | `[[start:int, end:int, 'C'\|'R']]`, ≤ 64, start<end, start 오름차순 | `[hz, 현재 기간 end)` 와 겹치는 SITE 마감 행. `reopenOperationId` 가 있거나 CLOSED → `'C'`, REOPENED → `'R'` |
| `ix` | 숫자 id 문자열 배열 ≤ 500, 중복 없음 | **P: 문서만.** 이 프로젝트에서 JIRA_ISSUE 층 값이 있는 이슈 |
| `ixa` | `true` | ix 가 500 을 넘음 → P: 로 판정하는 이슈 전부 DEFER |

- 크기: r 7개 + cr 64×~40B + ix 500×~12B ≈ 최대 9KB. 기존 ctl 본문 상한 `DOC_SIZE_LIMIT`(30,000B) 안이다.
- 다음 경우에는 `wr` 을 **싣지 않는다**(= 워크포스 입력 닫힘): `assertAuthority` 실패(워크포스 층 잠금 만료 등), 정책 읽기 실패, 마감 행 조회 실패. 이때 `bodyFor` 는 throw 하지 않고 `wr` 없이 게시한다.

### 4.2 `contract.js` 변경 (두 리포 바이트 동일, `CONTRACT_VERSION` 1 유지 — 가산)

- APPROVAL_CTL validator 에 `&& optional(b.wr, ctlWriteRulesValid)` 를 추가한다.
  - 검사 규칙은 §4.1 표 그대로다.
  - 키 집합은 닫는다. 모르는 `wr` 하위 키가 있으면 `wr` 을 무효로 본다.
  - 구판 검증자는 `wr` 을 모르는 최상위 키로 무시하므로 서명 검증이 그대로 통과한다.
- `ch` validator 는 무변경이다(값 `'ANY'` 를 만들지 않는다).
- 새 상수: `WR_VERSION = 1`, `WR_TTL_MS = 7*86_400_000`, `WR_BUCKET_MS = 3*86_400_000`, `WR_CLOSE_ROWS_MAX = 64`, `WR_ISSUE_EXCEPTIONS_MAX = 500`, `WF_FRESH_GRACE_MS = 600_000`(Q5).
- `vectors.json` 에 `wr` 이 있는 ctl 서명 골든 1건을 추가한다.

### 4.3 워크포스 resolver 계약 (승인 앱 resolver 는 **신규·변경 없음**)

| resolver(WF) | 권한 | 입력 | 응답(success) 변경 | 에러 code(신규·의미 변경) | 소비 화면 |
|---|---|---|---|---|---|
| `getIssueWorklogControl` | 기존(이슈 asUser 열람) | `{issueId}` | `writeChannel` 의미 변경(§5.2), 신규 `gated:boolean`. `createChannel` 은 `writeChannel` 과 같은 값(옛 번들 호환, 한 릴리스 뒤 삭제) | — | 모달·캘린더 |
| `createIssueWorklog` | 기존 | `{issueIdOrKey, started, timeSpentSeconds, comment?, dryRun?:boolean}` | `dryRun` 이면 POST 없이 `{dryRun:true, verdict:'ALLOW', notices:[]}`. 그 밖에는 지금과 같음(`approvalStatus:'PROCESSING'`) | `WORKLOG_CREATE_HANDOFF_REQUIRED`(DEFER, cause `{path, reason}`), DENY 코드 4종(cause `{path, reasonCode?, periodKey?, which?}`) | 모달(단건·기간) |
| `updateIssueWorklog` | 기존 | 무변경 | 무변경 | `WORKLOG_EDIT_HANDOFF_REQUIRED`(DEFER, cause `{path, reason}`), DENY 코드 | 모달·캘린더 드래그 |
| `deleteIssueWorklog` | 기존 | 무변경 | 무변경 | 같음 | 모달 |

- **DENY 코드 4종**: `WORKLOG_OUTSIDE_ISSUE_WINDOW`·`WORKLOG_WINDOW_UNRESOLVED`·`WORKLOG_PERIOD_LOCKED`·`WORKLOG_CERTIFIED_LOCKED`.
  - 승인 앱 `ErrorCodes`/`MutationError` 와 같은 문자열이다.
  - WF `ErrorCodes` 에 상수로 추가한다(locales 아님). 지금 WF 는 앞의 세 개를 문자열 리터럴로 던진다(`:301-305`).
- **DEFER `reason`** 은 `PREAPPROVAL_REQUIRED|ISSUE_EXCEPTION|OUT_OF_HORIZON|CONTROLLED|NOT_OBSERVED|ORIGIN_UNPROVEN|POLICY_BLOCKED|LIMIT_NEEDS_TOTAL|DOC_UNREADABLE|SIGNER_UNAVAILABLE` 중 하나다. 진단용이며, 화면은 이 값으로 문구를 고르지 않는다.
- **`cause.path`** 는 승인 앱 경로다. 작성은 `createHandoffPathOf`(프리필), 수정·삭제는 `handoffPathOf` 로 만든다.
- 서버는 사람이 읽을 문구를 만들지 않는다(코드만).

### 4.4 재사용하는 기존 문서 (무변경)

| 문서 | 방향 | 이번에 쓰는 칸 |
|---|---|---|
| 이슈 `movesRms.issue`(rms.issue) | WF→승인 | s, e, pa, wa.closeDays |
| 워크로그 `movesRms.origin`(rms.wlorigin) | WF→승인 | 작성 시 봉투(지금과 같음). 서명 키가 없으면 연동 이슈 작성은 DEFER(`SIGNER_UNAVAILABLE`) — 봉투 없는 기록은 승인 앱에서 NONE(남의 경로)으로 잡히기 때문이다 |
| 사용자 `movesApproval.cert.{YYYY-MM}` | 승인→WF | approval.entries(status·origin·closeAt), w, wt, approval.truncated |
| 사용자 `movesApproval.{YYYY}`(approval.timesheet) | 승인→WF | 기간별 st, lk, ps, pe — **워크포스가 처음 읽는다**(읽기 모듈 신규, 서명 검증은 기존 `signature.verifyEntry`) |
| 사용자 `movesRms.org` cap `wlorigin` | WF→승인 | 무변경(조회·작성 때 `ensureOrgCap`) |

---

## 5. 창구 전환 (R2)

### 5.1 `ch` 결정과 구판 호환

**결정: `ch` 는 `'APP'` 그대로 두고, 열림 신호는 `wr`(유효·미만료)로 한다.** `'ANY'` 를 쓰지 않는 이유는 두 가지다.
- F-3: 구판 검증자가 문서 전체를 거부한다.
- `ch` 하나로는 판정 재료가 전달되지 않는다.

| 승인 앱 | 워크포스 | 결과 | 안전성 |
|---|---|---|---|
| 구판(ch APP, wa, wr 없음) | 구판(지금) | 화면은 넘김, 서버 작성은 F-1 근사 경로 | 지금 상태(부분 우회 잔존) |
| **신판**(ch APP, wa 없음, wr) | 구판 | 구판 서버의 `createChannel` 조건(`wa.v===1`)이 거짓 → HANDOFF. 화면도 넘김 | 더 엄해짐(F-1 닫힘) |
| 구판 | **신판** | `wr` 없음 → `gated=false` → HANDOFF/BLOCKED(지금 화면과 같음) | 같음 |
| 신판 | 신판 | gated → 워크포스 화면에서 저장하고, 서버가 writeGate 로 판정 | 목표 |
| 신판 → 승인 앱 롤백 | 신판 | 구판 승인 앱이 다음 일일 scan 에서 `wr` 없는 본문을 게시한다(publicationVersion 이 달라 전량 touch). 그 전까지는 남은 `wr`(≤7일)로 판정한다. 규칙 원천은 같은 사이트 설정이라 의미가 바뀌지 않는다 | 허용 |
| 신판 | 신판 → 워크포스 롤백 | 구판 워크포스는 `wa` 가 없어 HANDOFF | 안전 |

배포 순서는 **워크포스 먼저, 승인 앱 나중**을 권장한다. 어느 쪽이 먼저여도 안전하다. 워크포스 신판만 나간 동안은 화면 변화가 없다.

### 5.2 `writeChannelOf` 표 변경

대상 파일: WF `src/domain/approvalLink/writeChannel.js` = `static/ui/src/components/worklog/writeChannel.js`(글자 동일).

입력 `ctl` 에 `gated:boolean` 을 더한다. 서버가 `ctl.verified ∧ wr 유효 ∧ now < wr.exp ∧ linkSigner.ready()` 로 계산한다.

| # | linkMode | target | ctl | 결과 | 바뀐 점 |
|---|---|---|---|---|---|
| W0 | 모름 | — | — | BLOCKED | 무변경 |
| **WG** | ON·OFF | 무관 | verified ∧ **gated** | **DIRECT**(판정 경유 저장) | 신규 — 실행 resolver 가 writeGate 로 판정 |
| W3 | ON·OFF | 무관 | verified ∧ ¬gated ∧ 경로 있음 | HANDOFF | 무변경 |
| W3' | ON·OFF | 무관 | verified ∧ ¬gated ∧ 경로 없음 | BLOCKED | 무변경 |
| W1/W2 | OFF / ON∧false | — | 없음 | DIRECT(판정 없음) | 무변경 — 승인 앱 없는 설치·비연동 |
| W4/W5 | ON | true/null | 없음·실패 | BLOCKED | 무변경 |

- 화면은 여전히 서버 `writeChannel` 만 믿는다.
- **WG 의 DIRECT 는 "폼을 연다"는 뜻일 뿐이다.** 실제 허가는 실행 resolver 가 매번 다시 판정한다. 그래서 캘린더 5분 캐시가 낡아도 안전하다(코덱스 P1 원칙 유지).
- `IssueWorklogControlService.creationState` 의 `createChannel` 특례(`:132-134`)는 삭제한다(F-1).

### 5.3 워크포스 화면 복귀 범위 (R4 로 이슈 패널이 빠진 뒤의 4화면)

| # | 화면·동작 | 지금(WF 코드) | 바꾼 뒤(WG) | 거부·DEFER 시 |
|---|---|---|---|---|
| 1 | 마이워크·프로젝트 캘린더 공용 `WorklogModal` **작성(단건)** | `createBlocked = !worklog_id && createChannel!=='DIRECT'` → 넘김 버튼(`:515`) | 입력 폼 활성, `createIssueWorklog` 로 저장 | `submitError`(§12 대응표). `cause.path` 가 있으면 "승인 앱에서 열기"(`issuePanel.approval.handoff.open`) |
| 1' | 같은 모달 **기간 일괄 입력** | 연동이면 첫 날 넘김(`remainingHandoffDates`) | Q2 (a): 날짜별 `dryRun` → 전부 ALLOW 면 순차 저장. 연동 이슈는 실패 시 되돌림 DELETE 없음 | 거부된 날짜 목록 + 열기 |
| 2 | 같은 모달 **수정·삭제** | `handoffOnly`/`editBlocked`(`:185-186`), 넘김 버튼(`:510`) | `isEditable`(본인 ∧ WG), `updateIssueWorklog`/`deleteIssueWorklog` | 같음(`WORKLOG_EDIT_HANDOFF_REQUIRED` 는 `handoff.description`) |
| 3 | 마이워크 캘린더 **드래그 이동**(`pages/myWork/worklogMove.js`) | `checkWorklogMove` → HANDOFF 면 revert + 토스트 | WG → PUT(서버 판정) | `channelOfWriteError` 가 DENY 코드도 받아 revert + 토스트(대응표 키) + 열기 동작 |
| 4 | 프로젝트 캘린더 **드래그 이동**(`calender/worklogDrop.js`) | 같음 | 같음 | 같음 |

- 넘김 경로(`approvalHandoff.js`·`createHandoffPath*`)는 **삭제하지 않는다.** ¬gated 일 때의 HANDOFF(W3)와 거부·DEFER 사유 안내에 계속 쓴다.
- 정적 테스트 `linkedNoDirectWrite.test.jsx` 의 단언을 바꾼다.
  - 지금: "연동 이슈 POST/PUT/DELETE 0"
  - 바꾼 뒤: "연동 이슈의 쓰기는 resolver(`createIssueWorklog`·`updateIssueWorklog`·`deleteIssueWorklog`) 경유만, 프론트 직접 `requestJira` 0"

### 5.4 승인 앱 이슈 화면 무변경 확인

**무변경**
- `static/ui/src/features/worklog/**`(WorklogTab·Linked*·LogWork·핸드오프 페이지 `WorklogCreateHandoffPage`·`WorklogHandoffPage`)
- `WorklogService`/`WorklogController` 와 그 resolver 응답
- `PermissionMap`, manifest

**승인 앱 변경 범위**
1. `contract.js`(validator 가산)
2. `writeGate.js`·벡터(런타임 미사용)
3. `WorklogControlCtl.bodyFor`(`wr` 추가, `wa` 삭제)·`publicationVersion`
4. 규칙 변경 시 ctl 재게시 훅(설정·마감/재개방·정책 예외·결재 설정 저장)
5. 설정 문구 1키(§12)
6. 주석(F-5)

워크포스에서 쓴 기록은 승인 앱 작업 로그 탭에 승인 앱 기록과 똑같이 나타난다. 출처 배지 `via`·승인 상태·이력은 트리거가 채우는 기존 경로다.

---

## 6. 사후 검증·자동 접수 (R3)

### 6.1 흐름 — 워크포스 정상 입력

```
WF createIssueWorklog(asUser) ── writeGate ALLOW ── POST + movesRms.origin 봉투(op, iat, exp ≤ 15분)
   │
   └─ avi:jira:created:worklog → 승인 앱 onWorklogChanged
        → WorklogControlDetector.wants: requests 주입됨 → controlWanted=true
        → handleCreated: originFor → verifyWorkforceOrigin OK → Origin.WORKFORCE(값 다르면 WF_CHANGED) ∈ PROVEN
        → worklog_control 행 기록(origin) → (통제 범위면 숨김 예약 — 기존)
        → requests.requestAutomatically({raw, projectId})           ← 승인 앱 화면 작성 직후와 **같은 함수**
             proof(PROVEN) → observe → touchCert(인증 문서 게시 45초 디바운스)
             → autoRequest(rms.issue wa.autoRequest ?? worklogAutoRequest) → 기간 잠금 → 승인됨?
             → 기본 승인자 = upperLeadsOf(작성자) ‖ (selfApproval.allowed ? [작성자] : [])  (linked-mode-fix R3)
             → submit(purpose AUTO)
   └─ observeLinked: rms.issue 다시 읽기·수용, linkedViolationOf(LINKED_WINDOW) — writeGate 를 통과한 기록은 위반 0
```

**두 창구가 같은 결과를 내는 이유**
- 승인 앱 화면 작성(`WorklogService.createWorklog`)은 저장 직후 같은 `requestAutomatically` 를 `request` 와 함께 동기 호출한다. 이어서 트리거가 한 번 더 부른다(같은 contentHash → attach, 멱등).
- 워크포스 작성은 트리거 한 번으로 끝난다.
- `submit` 의 AUTO 경로는 `request` 를 쓰지 않는다(`WorklogRequestService.js:212-221`, 코드).
- 따라서 **승인자·상태가 두 창구에서 같다.** 다른 점은 접수 시각(트리거 지연 수 초)뿐이다.

**수동 요청**
- 승인자 고르기는 승인 앱 화면에서만 할 수 있다(앱 간 호출 불가). 워크포스 화면에는 상태 `PROCESSING` 만 보인다.
- 자동 접수가 꺼져 있거나(`UNSUBMITTED`) 승인자가 없으면(`NEEDS_APPROVER`), 승인 앱 작업 로그 탭에서 요청한다(기존 화면).

**수정·삭제**
- 수정: `avi:jira:updated:worklog` → `handleCreated`(updated 포함) → origin WF_CHANGED(PROVEN). 이어 `requestAutomatically` 가 PENDING 요청을 CONTENT_CHANGED 로 만료시키고 다시 접수한다. 승인 앱 화면에서 수정했을 때와 같다.
- 삭제: `handleDeleted`(기존).

### 6.2 다른 경로 입력 감지·재승인·통제 — 무변경

- 봉투 없는 기록(Jira 기본 화면·REST·자동화)은 NONE → 기존 foreign 처리다.
- 봉투가 깨졌거나 재사용되면 INVALID/REUSED → FLAG 다.
- 통제 Phase(가시성 숨김)가 켜진 사이트에서는 승인·인증된 워크포스 기록이 숨김 대상이 된다. 그 뒤에는 워크포스 asUser 로 보이지 않으므로 수정·삭제는 D4(CONTROLLED) 또는 404 → DEFER 다.

### 6.3 남는 위험 (수용 — 승인 앱 사후 감지가 잡는다)

| # | 상황 | 창 | 사후 처리 |
|---|---|---|---|
| R-1 | 규칙(사이트 설정·예외·마감) 변경 직후, ctl 재게시가 끝나기 전의 워크포스 판정 | 즉시 tick(수 분). 실패하면 다음 일일 scan, 최대 `wr.exp`(≤7일) | 기간 잠금이 걸린 기록은 승인 앱 `requestAutomatically` 가 CLOSED/LOCKED 로 보고 접수하지 않는다. 마감 후 변경(`isChangeAfterClose`)·타임시트 제출 대조가 잡는다 |
| R-2 | 승인·인증 결정 직후, cert 문서 게시 전의 워크포스 수정(45초 디바운스, 리스 경합 시 최대 ~4.5분) | 위와 같음 | 승인 후 변경 → cert MISMATCH·요청 재접수(기존). 승인 앱 자기 화면에도 같은 경쟁(판정과 PUT 사이)이 있다 |
| R-3 | Q5 10분 유예 중에 결정·게시가 모두 끝난 기록의 수정 | ≤10분 | R-2 와 같음 |
| R-4 | 워크포스 rms.issue 가 승인 앱 수용본보다 새롭고 느슨함(동시 저장·재생) | 승인 앱이 다음에 읽을 때까지(트리거 `observeLinked` 가 즉시 읽음) | LINKED_WINDOW 위반 기록 + 제출 대조. linked-issue-schedule §8 잔여와 같은 성격 |
| R-5 | 워크포스는 WARN 모드 공지(과거 날짜 등)를 표시하지 않는다(문구 키 없음, Q3) | 상시 | 타임시트 제출·팀장 결재 화면 경고(기존) |

---

## 7. 도메인 (순수 함수 + 테스트 케이스)

### 7.1 공유 계약 `writeGate.js`

- `judgeLinkedWrite(input)` — §3.2
- 테스트 대조용 내부 export:
  - `localDateOf(ms,tz)`, `zonedMidnight(y,m,d,tz)`, `periodKeyOf(ms,{unit,timeZone})`, `periodRange(key,{timeZone})`
  - `autoCloseAtOf(end,{autoCloseDays,timeZone})`, `closedAtOf(t,{closes,now,unit,timeZone,autoCloseDays})`
  - `ownLockOf(t,submissions,{lockSubmitted,lockApproved})`, `submissionsOfV1(entries)`
  - `notices({r,va,op,started,prevStarted,now,timeZone})`, `wrFreshAt(wr,now)`
- 케이스(골든 벡터에 포함):
  1. 기간 밖 s/e → DENY OUTSIDE_WINDOW(which=started). 수정은 prevStarted 가 밖이어도 DENY
  2. s/e 없음 + wd + jiraWindow NO_FIELD → DENY WINDOW_UNRESOLVED. wd false 면 창 검사 없음
  3. 수동 CLOSED 행 → PERIOD_LOCKED. REOPENED 행 + 자동 마감 시각 지남 → 열림(재개방 우선). 행 없음 + acd=3 → 종료 후 3일째 자정 −1ms 는 열림, 정각부터 마감
  4. WEEK 단위 + 행이 MONTH 범위(단위 혼합) → 행만 본다
  5. LA DST 전환일의 autoCloseAt(밀리초 덧셈으로 계산하면 1시간 어긋나는 사례)
  6. 수정으로 마감 기간에서 열린 기간으로 이동 → which=previousStarted 로 DENY
  7. own: SUBMITTED + ls=true → PERIOD_SUBMITTED / ls=false → 열림 / APPROVED + ls=false → PERIOD_APPROVED(lockApproved) / CHANGED_AFTER_APPROVAL → 열림
  8. cert entry status APPROVED → CERTIFIED_LOCKED / w 에 있음(MISMATCH flag) → CERTIFIED_LOCKED / 삭제 flag 만 있음 → 잠금 아님
  9. D1: pa REQUIRED → DEFER / pa NOT_REQUIRED ∧ pq → ALLOW / pa null ∧ pq → DEFER
  10. D2: PROJECT basis + ix 포함 → DEFER / ISSUE basis 는 ix 무시
  11. D3: hz 직전 → DEFER
  12. D5: entry 없음 ∧ freshOwn → 통과 / ¬freshOwn → DEFER / truncated → DEFER
  13. D6: origin NONE → DEFER
  14. J4: pastDateMaxDays 초과 + WARN → ALLOW + notices[BACKDATED] / BLOCK → DEFER POLICY_BLOCKED. futureDateAllowed=false + 내일 → FUTURE_DATE. editWindowDays 는 **원래 날짜** 기준
  15. J5: BLOCK + dm>0 → 작성·수정은 DEFER, 삭제는 ALLOW 가능
  16. 자기 문서의 wa.closeDays 가 wr.acd 를 덮는다

### 7.2 승인 앱 (신규 순수 — `src/domain/worklogControl/writeRules.js`)

`writeRulesOf({effective, configRequired, closes, now, unit, timeZone, issueExceptionIds, basis})` → `wr | null`. 순수 함수이며 `now` 를 주입받는다.
- `exp = Math.floor(now / WR_BUCKET_MS) * WR_BUCKET_MS + WR_TTL_MS`
- `hz = periodRange(recentPeriodKeys(currentPeriodKey({now,unit,timeZone}), 24).at(-1)).start`
- `cr` 은 `[hz, 현재 end)` 와 겹치는 행만 담는다. start 오름차순. 64개를 넘으면 null(wr 미게시 = 닫힘, 로그를 남긴다)
- `ix` 는 basis PROJECT 일 때만 담는다. 정렬·중복 제거. 500개를 넘으면 `ixa:true` 로 하고 ix 는 생략
- `pq = (effective.keys.approvalMode.source !== 'LINKED_ISSUE' && effective.values.approvalMode === 'PREAPPROVAL') || configRequired`. 연동 층 값은 워크포스가 pa 로 직접 안다

케이스:
- 같은 버킷의 두 시각 → 같은 exp / 버킷 경계 → exp +3일
- EXTRA_STEP → va WARN
- 마감 행 65개 → null
- ix 501개 → ixa
- 결과가 `validateBody(APPROVAL_CTL, {...ctl, wr})` 를 통과

### 7.3 워크포스 (신규 순수 — `src/integration/approval/timesheetDoc.js`)

`readTimesheetDoc({value, cloudId, accountId, year, now, keyring, trustedKids, verifyImpl})` → `{ok, entries:[{periodKey,ps,pe,st,lk}]} | {ok:false, code}`
- 엔트리마다 `verifyEntry(typ approval.timesheet, ent {accountId, periodKey})` 로 검증한다.
- 하나라도 실패하면 그 엔트리만 버리지 않고 **문서 전체를 실패**로 처리한다. 잠금이 빠진 채로 허용되는 것을 막기 위해서다.

케이스: 정상 / 다른 사용자 ent 복사 → 실패 / 다른 cloud → 실패 / 키 미신뢰 → 실패 / 빈 entries → ok·[]

---

## 8. 백엔드

### 8.1 승인 앱

**`WorklogControlCtl.bodyFor(target)`**
- `wa` 를 삭제하고 `wr = writeRulesOf(...)` 를 싣는다.
- 입력은 다음 다섯 가지로 모은다.
  1. `effective`: I: 대상은 `policyHierarchy.resolveOne({issueId, projectId})`. P: 대상은 프로젝트 수준 해석(`issueId` 없이 JIRA_ISSUE 층 생략). 지금 `resolveOne` 이 issueId 를 요구하면 `WorklogPolicyResolver` 에 `resolveProject(projectId)` 를 추가한다
  2. `assertAuthority(effective, [7키, violationAction, periodAutoCloseDays, lockSubmittedPeriod, approvalMode, worklogDateWindow])` — 실패하면 wr 없음
  3. `WorklogApprovalRepository.config(projectId).required`
  4. `PeriodCloseRepository.findCovering(SITE_SCOPE, hz, end-1)`
  5. P: 대상이면 이슈 예외 id 목록(`listIssueWorklogExceptions` 의 저장소 쿼리 재사용 — id 만, LIMIT 501)
- 메모: ④는 tick 안에서 메모한다(`InvocationScope.memo`). ③·⑤는 프로젝트별로 메모한다.
- 실패해도 throw 하지 않고 wr 없이 게시한다.

**`WorklogControlCtl.publicationVersion()`**
- `linked-issue:3:{ctlRev}:{CTL_RX}:wr1` 로 바꾼다.
- 배포 뒤 첫 일일 scan 이 전량 touch 한다 → `wr` 게시·`wa` 제거.

**규칙 변경 훅(신규 `WorklogControlHooks.ctlRulesChanged()`)**
- `WorklogControlState` 의 `ctlRev+1`(CAS, 불변식 4) + `pushSweepJobs([{job:'workforce', round:0}])`(선례 `PeriodReopenService.publishWake`). 던지지 않는다.
- 새 스케줄은 없다. 전량 touch 는 `scanCtl` 이 한다. 내용이 같으면 PUT 을 생략한다.
- 호출 지점(관리자 사건이라 드물다):
  1. `SettingsService` 정책 patch 에 `WR_AFFECTING_KEYS` 가 있을 때 — 7키 + legacy 키, `timesheetViolationAction`, `approvalMode`, `approvalUnit`, `timesheetTimezone`, `timesheetAutoCloseDays`, `timesheetLockSubmitted`, `worklogDateWindow`
  2. `PeriodCloseService.closePeriod`·`PeriodReopenService`(이미 workforce 를 깨움 — ctlRev 만 추가)
  3. `WorklogPolicyService` 프로젝트·이슈 범위 저장·삭제
  4. `WorklogApprovalPolicy` 결재 설정(`config.required`) 저장

**그 밖**
- `WorklogControlDetector.js:172` 주석을 사실대로 교체한다(F-5).
- `idleSqlBudget.test.js`: 빈 상태 상한(27·38·13) **무변경** 단언을 유지하고, "ctl 대상이 0이면 wr 계산 SQL 0" 을 추가한다(§13).

### 8.2 워크포스

**계약 파일**: `integration/approval/contract.js`·`writeGate.js`·`writeGateVectors.json`·`vectors.json` 을 승인 앱에서 바이트 복사하고 SYNCED 지문을 갱신한다.

**`integration/approval/controlDoc.verifyControlDoc`**: `control.wr`(validator 통과분)을 노출하고 `wa` 노출은 삭제한다.

**`integration/approval/timesheetDoc.js`**: 신규(§7.3).

**`resolver/approvalLink/LinkedWriteGate.js`(신규)** — `judge({op, issue, link, accountId, now, input, worklog?})`:
1. `gatedOf(link, now)`
2. 자기 rms.issue(`verifyOwnIssueSetting`, 이미 받은 이슈 프로퍼티)
3. wd ∧ s/e 없음이면 이슈 필드 asUser(기존 `dateWindowOf`)
4. v1 문서 asUser GET `/rest/api/3/user/properties/movesApproval.{YYYY}?accountId={self}`. 날짜가 연 경계 7일 안이면 인접 연도도 읽는다
5. edit·delete 면 cert 문서 asUser GET(원래 날짜·새 날짜의 월, 같으면 1회) → `approvalOfWorklog` 류 해석 + `w` 대조
6. `freshOwn` = 그 워크로그의 `movesRms.origin` 을 **자기 키로** 검증 ∧ `now - created ≤ 10분`
7. `judgeLinkedWrite`

읽기 실패(404 제외)·서명 실패 → DEFER `DOC_UNREADABLE`. 캐시는 두지 않는다(쓰기 판정은 매번 새로 읽는다).

**`IssueWorklogControlService`**
- `creationState`: `createChannel` 특례를 삭제한다. `writeChannelOf({..., ctl:{verified, globalPagePath, gated}})` 를 쓰고 응답에 `gated` 를 싣는다.
- `createIssueWorklogService`:
  - F-1·F-2 근사 블록(`:292-307`)을 삭제한다.
  - channel DIRECT ∧ `link.linked` 이면 `LinkedWriteGate.judge('create')` 를 부른다.
  - ALLOW → dryRun 이면 반환, 아니면 POST + 봉투. 봉투를 만들 수 없으면 DEFER `SIGNER_UNAVAILABLE`.
  - DEFER → `WORKLOG_CREATE_HANDOFF_REQUIRED`. DENY → 해당 코드.
- `assertDirectEdit`:
  - 이미 읽은 대상 워크로그(`:381-386` — author·issueId 대조)를 judge 입력으로 넘긴다.
  - WG 면 `judge('edit'|'delete')` 를 부른다. DEFER → `WORKLOG_EDIT_HANDOFF_REQUIRED`. DENY → 해당 코드.
  - Jira PUT/DELETE 가 403 이면 DEFER 와 같게 처리한다(권한 스킴 회수 방식 `lockMethod` 사이트).

**`ErrorCodes`**: `WORKLOG_PERIOD_LOCKED`·`WORKLOG_CERTIFIED_LOCKED`·`WORKLOG_WINDOW_UNRESOLVED`·`WORKLOG_OUTSIDE_ISSUE_WINDOW` 상수를 추가한다(서버 전용, locales 무관).

**SQL·KVS**: **무증가.** 소속 판정(`filterMembers`) 등 기존 호출만 쓴다.

---

## 9. 스키마·마이그레이션

두 리포 모두 없다. 승인 앱은 `workforce_publish` 의 기존 ctl 행을 재사용하고, KVS 키 추가도 없다. major upgrade 가 아니다.

## 10. Jira 연결

| 앱 | 호출 | 자격 | 근거 |
|---|---|---|---|
| 승인 앱 | ctl 이슈·프로젝트 프로퍼티 PUT(3일 주기 + 규칙 변경 시) | asApp | AGENTS asApp 허용 2번(통제 설정 문서 게시) — 기존 경로, 사유 무변경 |
| 워크포스 | 본인 사용자 프로퍼티 `movesApproval.{YYYY}`·`movesApproval.cert.{YYYY-MM}` GET | asUser(본인) | cert 문서를 본인 asUser 로 읽는 것은 기존 `withCertBadges` 경로(코드). v1 키는 처음 읽음 → 미검증 U-1 |
| 워크포스 | 워크로그 POST/PUT/DELETE | asUser | 기존 |
| 두 앱 | manifest·scope | 무변경 | — |

---

## 11. 프론트

### 11.1 워크포스 (`static/ui`)

- `components/worklog/writeChannel.js`: §5.2 표를 반영한다(서버 파일과 글자 동일, 대조 테스트는 기존).
- `components/worklog/approvalHandoff.js`: `APPROVAL_CREATE_ERROR_KEY` 를 §12 대응표로 확장한다. 신규 `approvalWriteErrorOf(error)` → `{key, path}`.
- `pages/myWork/modal/WorklogModal.jsx`: §5.3 1·1'·2. 기간 모드의 연동 이슈는 Q2 (a)를 따른다. `remainingHandoffDates` 는 ¬gated 넘김일 때만 쓴다.
- `components/worklog/worklogMoveGuard.js`:
  - `channelOfWriteError` 가 DENY 4코드 + `WORKLOG_CREATE/EDIT_HANDOFF_REQUIRED` 를 받아 `{channel:'DENIED'|'HANDOFF', key, path}` 를 돌려준다.
  - `notifyBlockedMove` 는 key 로 토스트를 띄우고, path 가 있으면 열기 동작을 붙인다.
- 쿼리키: 무변경(`myWorkKeys.writeChannel`). 저장 성공 후 기존 무효화 그대로.
- 엔트리·빌드: 무변경.

### 11.2 승인 앱

화면 변경 없음(§5.4). 설정 문구 1키만 바뀐다.

## 12. i18n

### 12.1 승인 앱 (`locales/kr`·`en` + merge)

| 키 | kr | en |
|---|---|---|
| `workforce.writeChannel` | 연동 이슈의 작업 시간은 이 앱 작업 로그 탭이나 워크포스 화면에서 기록·수정·삭제할 수 있습니다. 두 곳 모두 이 앱의 작성 기간·잠금·기록 규칙으로 판정합니다. | Time on linked issues can be logged, edited and deleted in this app's Work log tab or in Workforce. Both apply this app's entry window, locks and logging rules. |

### 12.2 워크포스 — 키 추가 없음(locales 동결)

서버 코드 → 기존 키 대응표(Q3 a):

| 서버 코드 / DEFER | 화면 키(기존) | 열기 버튼 |
|---|---|---|
| `WORKLOG_OUTSIDE_ISSUE_WINDOW` | `issuePanel.approval.error.outsideWindow` | 있음 |
| `WORKLOG_WINDOW_UNRESOLVED` | `issuePanel.approval.error.windowUnresolved` | 있음 |
| `WORKLOG_PERIOD_LOCKED` · `WORKLOG_CERTIFIED_LOCKED` | `issueApprovalSetting.lockHint` | 있음 |
| `WORKLOG_CREATE_HANDOFF_REQUIRED`(모든 DEFER) | `issuePanel.approval.create.required` | `issuePanel.approval.create.open` |
| `WORKLOG_EDIT_HANDOFF_REQUIRED`(모든 DEFER) | `issuePanel.approval.handoff.description` | `issuePanel.approval.handoff.open` |
| `WORKLOG_LINK_UNCONFIRMED` | `issuePanel.approval.create.unconfirmed` | 다시 시도 |
| 드래그 DEFER | `issuePanel.approval.move.handoff` | `issuePanel.approval.edit.open` |

동결이 풀린 뒤 추가할 후보(Q3 b): `approval.deny.periodLocked`·`certifiedLocked`·`policyBlocked`·`preapprovalRequired`·`notObserved`.

---

## 13. 용량·호출량 (200명 기준)

| 경로 | 빈도 | 승인 앱 SQL | Jira | 워크포스 SQL/KVS | 비고 |
|---|---|---|---|---|---|
| WF 작성(연동) | 200명 × 3건/일 ≈ 600/일 | 0(동기). 트리거 경로는 승인 앱 화면 작성과 같거나 적음(동기 `requestAutomatically` 1회가 없음) | +1 GET(v1 문서). 기존 이슈·ctl GET 은 그대로 | 0 | 지금(넘김 → 승인 앱에서 작성)과 비교하면 승인 앱 resolver 호출이 1회 줄어든다 |
| WF 수정·삭제(연동) | ≈ 200/일 | 0 | +2(cert 1~2, v1 1) | 0 | 기존 `assertDirectEdit` GET 2회는 유지 |
| WF 기간 일괄(Q2) | 드묾 | 0 | 날짜 수 × (dryRun 판정 GET + POST) | 0 | 판정 문서는 요청 안에서 메모 |
| ctl 재서명 | 대상 T 개 ÷ 3 / 일 | 증가 없음(일일 scan 이 이미 대상마다 bodyFor·markPublished 를 한다) | T/3 PUT(asApp) | — | T≈320(프로젝트 20 + 활성 이슈 신호 300) → ≈107 PUT/일 |
| wr 계산 | 일일 scan 1회 | +1(마감 행) + 2 × 연동 프로젝트(설정·예외) ≈ +41/일 | 0 | — | 메모 덕분에 대상 수와 무관 |
| 규칙 변경 사건 | 월 수 회 | T × ~3(bodyFor 재계산) | 바뀐 대상만 PUT | — | 관리자 사건 |
| **유휴**(사용자 0명) | — | 대상이 0이면 **+0**. 대상이 있어도 신호 만료(28일) 뒤로 대상이 줄어 scan 이 비게 된다 | 같음 | 0 | `idleSqlBudget` 상한 무변경 |
| 사용자별 PUT | — | — | **+0** | — | cert·v1 문서 게시 규칙 무변경 |
| 행 수 | — | 새 테이블 0, 연 행 증가 0(같은 기록이 다른 창구로 들어올 뿐) | — | 0 | 워크포스 DB 무증가 |
| 문서 크기 | ctl 1건 | — | +≤9KB(32KB 한도 안) | — | |

---

## 14. 미검증

| # | 항목 | 영향 | 확인 방법(개발 사이트, Tom Kim) |
|---|---|---|---|
| U-1 | 워크포스 resolver 가 asUser 로 **본인** `movesApproval.{YYYY}` 사용자 프로퍼티를 GET 할 수 있는가 | 본인 제출 잠금(§2 행 6) | 승인 앱으로 타임시트 제출 → 워크포스 모달에서 그 기간 작성 → `WORKLOG_PERIOD_LOCKED` + 서버 로그에 GET 200 |
| U-2 | cert 문서 게시 지연(결정 → 프로퍼티 반영)의 p50/p95 | R-2 창 | 승인 직후 10초 간격으로 `GET /user/properties/movesApproval.cert.2026-10` → 갱신 시각 기록, 3회 |
| U-3 | `wr` 포함 ctl(최대 ~9KB) PUT 과 3일 버킷 재서명. 워크포스가 새 `exp` 를 읽는가 | 신선도 | `publicationVersion` 변경 배포 뒤 `workforce_publish` ctl 행 published_at 확인, REST GET 으로 `wr.exp` 확인. 버킷 경계는 테스트 시계로 단위 테스트 |
| U-4 | resolver(설정·마감·정책 저장)에서 `workforce` 큐 작업을 push 하면 tick 이 scanCtl 을 실행하는가 | R-1 창 | 기간 마감 → 수 분 안에 ctl `wr.cr` 에 행 반영(REST GET) |
| U-5 | 두 앱 런타임(둘 다 nodejs22.x, 코드)의 `Intl` 시간대 데이터가 같은가 | parity | 골든 벡터를 두 리포 CI 에서 모두 통과(DST 사례 포함) |
| U-6 | 워크포스 asUser POST(본문 properties 에 봉투) → 승인 앱 트리거가 봉투를 읽어 WORKFORCE 로 판정 → 자동 접수 | 완료 기준 1 | 워크포스 모달 작성 → 승인 앱 작업 로그 탭 '요청됨' + `worklog_control.origin='WORKFORCE'` |
| U-7 | 승인 앱이 숨긴 기록·권한 스킴 회수 사이트에서 워크포스 asUser PUT/DELETE 실패 코드(403/404) | DEFER 매핑 | 통제 Phase C 를 켠 개발 사이트에서 승인분 수정 시도 → DEFER(넘김) |
| U-8 | G-HANDOFF `router.navigate` 앱 간 이동(기존 미검증 그대로) | 거부 시 열기 버튼 | 기존 실측 항목 재사용 |

---

## 15. 작업 분해

**전제**: linked-mode-fix(두 리포)가 병합된 뒤 시작한다. 무인 회차는 `forge`·`git commit` 을 하지 않는다.

### 승인 앱 (backend-engineer)

- [ ] **T-A1** `contract.js`: `wr` validator(닫힌 키 집합)·상수(§4.2), `vectors.json` 골든 1건
- [ ] **T-A2** `src/integration/workforce/writeGate.js`(§3.2, import 0) + `writeGateVectors.json`(≥120건)
- [ ] **T-A3** `src/domain/worklogControl/writeRules.js`(§7.2) + 테스트
- [ ] **T-A4** `WorklogControlCtl.bodyFor`: `wr` 생산·`wa` 삭제·실패 시 wr 생략, `publicationVersion` 3판. 필요하면 `WorklogPolicyResolver.resolveProject`
- [ ] **T-A5** `WorklogControlHooks.ctlRulesChanged` + 호출 4곳(§8.1)
- [ ] **T-A6** 주석 F-5, i18n `workforce.writeChannel` kr/en + merge
- [ ] **T-A7** 테스트
  - `writeGate.parity.test.js`(골든 + 무작위 2,000, §3.3 규칙)
  - v1·cert 왕복, `wr` 생산 대조
  - `bodyFor` I:/P:/ix/ixa/권한 불가
  - 훅(ctlRev CAS·push·던지지 않음)
  - `idleSqlBudget` 무변경
  - `permissionMap.contract`(resolver 추가 없음 확인)
- [ ] `npm test` 녹색

### 워크포스 (backend + UI, 워크포스 리포)

- [ ] **T-W1** 계약 파일 4종 바이트 복사(contract.js·writeGate.js·writeGateVectors.json·vectors.json), SYNCED 지문 갱신, writeGate 골든 벡터 실행 테스트
- [ ] **T-W2** `controlDoc` 의 `wr` 노출·`wa` 제거, `timesheetDoc.js`(§7.3)
- [ ] **T-W3** `LinkedWriteGate.js`(§8.2) + 테스트(DEFER 사유별, 404=제출 없음, 서명 실패=DEFER, 연 경계 인접 연도, freshOwn)
- [ ] **T-W4** `IssueWorklogControlService`: creationState·create(dryRun 포함)·assertDirectEdit 통합, F-1·F-2 블록 삭제, `ErrorCodes` 상수
- [ ] **T-W5** `writeChannel.js` 두 사본(§5.2) + 표 테스트(WG 행)
- [ ] **T-W6** UI: `approvalHandoff.js` 대응표, `WorklogModal`(§5.3 1·1'·2), `worklogMoveGuard` 거부 처리, `linkedNoDirectWrite.test.jsx` 단언 교체(§5.3)
- [ ] **T-W7** 테스트
  - 서버 create/update/delete × {ALLOW, DENY 4종, DEFER, ¬gated HANDOFF, 구판 ctl(wa 만) → HANDOFF}
  - UI: 모달 활성·거부 문구·열기, 드래그 revert
- [ ] `npm test`(루트) + `cd static/ui && npm test && npm run build` 녹색, `forge lint`. **locales·미추적 파일 sha1 전후 대조**

### 실측(완료 기준)

- [ ] 워크포스 모달에서 연동 이슈(ARS-14 류) 작성 → 승인 앱에 '승인 요청 전/요청됨' 표시, 기본 승인자 = 팀장(U-6)
- [ ] 거부 3종(작성 기간 밖(팀장 s/e) / 승인된 기록 수정 / 마감 기간 작성) → 워크포스 저장 거부 + 열기 버튼(U-1 포함)
- [ ] 배포 순서: 워크포스 → 승인 앱. 각 단계 뒤 화면 회귀 확인(§5.1 표)

### 문서(구현 완료 시)

- [ ] `docs/LINKED-ISSUE-SCHEDULE.md` §3·§4·§5·§7·§9 갱신(입력 창구 두 곳, 판정 위치)
- [ ] `CLAUDE.md` 제품 변경 이력 1행(linked-mode-ux ① 정정 — "진입점 하나" 해석 변경)
