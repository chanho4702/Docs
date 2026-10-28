# 최종 검증 리포트 — 코덱스 검토 반영분 (workforce-input-reopen · linked-mode-fix · workforce-approval-display)

> 2026-10-14 · integration-verifier · 기준: `00_input/requirement.md` 끝 "코덱스 검토 반영 결정", `codex-review.md`
> 수정 없음. 교차 테스트 파일 1개만 추가: 승인 앱 `src/resolver/workforce/__test__/RuleViolationCross.verify.test.js`(7 테스트).
> 커밋·forge 배포·터널 조작 없음. `forge lint` 는 두 리포에서 실행(배포 아님). 승인 앱 lint 의 수정 확인은 scratch 사본에서만 했다(작업 트리 무변경).
> 경로 표기: AP = `C:\CloudJira\moves-approval-jira`, WF = `C:\CloudJira\moves-workforce`.

## 요약 — 통과 19 / 실패 2 / 미검증 9

| 판정 | 항목 |
|---|---|
| **실패 F1 (P1, 배포 차단)** | 승인 앱 `forge lint` 실패. 테스트 파일 2개에 중복 속성 키가 있다. `forge deploy` 도 lint 를 먼저 돌리므로 그대로 두면 승인 앱 배포가 막힌다 |
| 실패 F2 (P3, 문서) | 승인 앱 `AGENTS.md:45` 에 "작성 창구는 항상 승인 앱(linked-mode-ux ①)"이 남아 있다. P2-10 의 "AGENTS 현행화"가 워크포스 쪽만 됐다 |
| 통과 | 코덱스 P1 5건, P2 5건 전부 결정대로 닫힘(아래 표). 사후 감지 교차, `getIssueWorklogApproval`, ctl 5분류·단독 경로, 계약 4종 sha1, 깨우기 큐·유휴 SQL, locales·미추적 파일, 테스트·빌드 전부 |

---

## 실패

### F1 (P1) — 승인 앱 `forge lint` 실패 → `forge deploy` 차단 — 담당: backend

```
Error: An object literal cannot have multiple properties with the same name.
in C:/CloudJira/moves-approval-jira/src/domain/worklogControl/__test__/ruleViolation.test.js
at line 18, column 69
```

TypeScript AST 로 두 리포의 `src` 전체를 훑어 같은 종류의 결함을 찾았다. 3곳이 나왔고 모두 승인 앱 테스트 파일이다(워크포스는 0곳).

- `src/domain/worklogControl/__test__/ruleViolation.test.js:18` — `lock: base, ...over, lock: {...}`
- `src/integration/workforce/__test__/writeGateHarness.js:86`(`rules: DEFAULT_RULES`)와 `:105` 의 `rules` 가 겹친다
- `src/integration/workforce/__test__/writeGateHarness.js:99-101`(`cert: {...}`)과 `:106` 의 `cert` 가 겹친다

**고치는 방법**: 앞쪽 중복(`:18` 의 첫 `lock: base,`, 하네스 `:86` 의 `rules`, `:99-101` 의 `cert`)을 지운다.
- JS 에서는 뒤 속성이 이기므로 동작이 바뀌지 않는다.
- scratch 사본에 이 세 곳만 고쳐 `forge lint` 를 돌렸고 `No issues found.` 가 나왔다.
- 이 lint 오류는 이번 회차 보고서들의 lint 기록에서 빠져 있었다. 그 기록은 워크포스 lint 만 실행한 것이다.

### F2 (P3) — 승인 앱 `AGENTS.md:45` 현행화 누락 — 담당: backend(문서)

- 현재 문장: "연동 이슈의 워크포스 직접 작성(작성 창구는 항상 승인 앱, 2026-10-13 linked-mode-ux ①)은 append-only 관찰 로그만 남긴다".
- 지금 계약에서 워크포스 출처는 정상 입력이고, 위반만 `WorklogControlDetector` 가 "규칙 위반 입력"(FLAGGED·RULE_VIOLATION)으로 표시한다.
- 고칠 곳:
  - `AGENTS.md:45` 를 사후 감지 규칙으로 바꾼다.
  - 다음 항목을 AGENTS 에 한 줄씩 추가한다: `WorkforcePublishWake`(기존 `workforce` 큐, 15초 디바운스), 관문 근거 `DEV_MEMO|MEASURED`.
  - `CLAUDE.md` 변경 이력에 코덱스 반영 한 줄을 추가한다.

---

## 1. 코덱스 P1·P2 판정 (파일:줄)

### P1-1·P1-2 ① 즉시 재게시 — 통과
| 사건 | 연결 | 근거 |
|---|---|---|
| 깨우기 본체 | 정책(KVS) → 서명 가능 → 디바운스 표식(KVS) → 연동 관문(SQL ≤1) → 기존 `workforce` 작업 `{event:1}` push. 예외를 던지지 않는다 | AP `src/resolver/workforce/WorkforcePublishWake.js:37-52` |
| v1·연도·인증 연도 touch | touch 가 성공했을 때만 깨운다 | AP `src/resolver/workforce/WorkforceOutbox.js:52-55`, `:58`, 운영 싱글턴 `:87` |
| 타임시트 제출 | `TimesheetService.touchPublish` → `touchMany`(깨우기 포함) | AP `src/resolver/timesheet/TimesheetService.js:400-402` |
| 단건·일괄 결정 | `TimesheetTargetAdapter.afterDecide` → `touchMany`. 응답 shape 무변경(`APPLY_KINDS` 밖) | AP `src/resolver/approval/target/TimesheetTargetAdapter.js:48-59`, `ApprovalService.js:981-1007` |
| 회수 | `notifyExternal` 의 CANCELLED → `touchMany` | 같은 파일 `:65-69`, 호출 `ApprovalService.js:1060-1076`(target 동봉) |
| 마감·재개방 | 연도 표식 touch + `ctlRulesChanged` | AP `PeriodCloseService.js:176-180`, `PeriodReopenService.js:30`, `:154` |
| 기록 규칙 7키·이슈·프로젝트 예외·결재 설정 | `ctlRulesChanged` | `SettingsService.js:338`, `:522`, `WorklogPolicyService.js:51`, `:66`, `WorklogApprovalPolicy.js:83` |
| ctl 상한 초과·스코프 밖·즉시 게시 실패 | 이전에는 touch 만 했다(코덱스 §5 지적). 지금은 깨운다 | AP `src/resolver/worklogControl/WorklogControlHooks.js:113-117` |
| consumer | `payload.event===1` 이면 일일 대조 없이 `publishNow`. continuation 도 payload 를 유지한다 | AP `src/trigger/sweepJobs.js:93-103`, `runSweepJob.js:24`, `:44`, `WorkforcePublisher.js:808-830` |

### P1-1·P1-2 ② 사후 감지 — 통과
- 판정 함수(순수, 쓰기 시각 기준, 쓰기 뒤 생긴 마감·제출로 오탐하지 않음): AP `src/domain/worklogControl/ruleViolation.js:25-87`.
- 재료 수집(SQL·KVS 만, Jira 0): AP `src/resolver/worklogControl/WorkforceRuleCheck.js:18-36`.
- 감지기:
  - 자동 접수 전에 판정한다: `WorklogControlDetector.js:148-150`.
  - 위반이면 FLAGGED·RULE_VIOLATION 을 남기고 결정적 일지 id 를 쓴다: `:206-253`.
  - 대상은 출처 WORKFORCE·WF_CHANGED 뿐이다. 승인 앱 op 쓰기는 제외한다.
- 자동 접수 중지: `WorklogRequestService.js:275-277`(`EXPLANATION_REQUIRED`). 대기 요청의 내용이 바뀌었으면 만료시킨다.
- 인증 문서: `WorklogCertificationRepository.js:24-33`(`ruleViolation`), `WorkforcePublisher.js:378`(승인 전 e[5]=INVALID, 승인 후 원래 출처). 엔트리 길이는 변하지 않는다.
- 인증 화면 신호: `WorklogCertService.js:150-151`, `:395`, `:630`, `summary.js:35`(비트 512).

### P1-3 ctl 상태 5분류 — 통과
- 분류: WF `src/resolver/approvalLink/ApprovalControlLookup.js:60-66`(`ctlStateOf`).
- 이슈 문서 검증 실패를 ABSENT 로 접지 않는다: `:126-127`. 해제 신호 우선: `:131-137`.
- 판정표: WF `src/domain/approvalLink/writeChannel.js:39-50`. UI 사본 `static/ui/src/components/worklog/writeChannel.js` 와 diff 0.
- UNVERIFIED 는 스위치와 무관하게 BLOCKED. NO_TRUST 는 ON 이면 BLOCKED, OFF 면 DIRECT. RELEASED 는 DIRECT.

### P1-4 예상 원가 단일 판정 — 통과
- WF `src/resolver/approvalLink/ApprovalCertReader.js:261-276`: 행마다 `approvalOfWorklog` 를 한 번 돌리고 확정=`approvedSecondsOf`, 예상=`countableSeconds` 를 만든다. 판정 원천은 주장 초다.
- `rescopeApprovalBasis` 가 `currentPeriodEnd` 를 보존한다: WF `src/integration/approval/worklogApproval.js:176-179`.

### P1-5 관문 근거 DEV_MEMO/MEASURED, 운영에서는 불인정 — 통과(잔여 R5)
- AP `src/domain/worklogControl/gates.js` `GateEvidence`·`evidenceOf`·`gatesForEnvironment`(운영이면 근거 없는 수동 PASS 를 NONE 으로 내림).
- 적용 지점:
  - 스위치 판정: `WorklogControlService.js:180-187`, `:190-205`
  - 화면 `productionBlocked`: `:221-226`
  - 작성 시 숨김 관문: `WorklogControlContext.js:161`
  - 삭제 후보: `WorklogControlDetector.js:313`
- MEASURED 로 PASS 하려면 메모가 필수다: `WorklogControlService.js:274-276`.
- 환경 판정: 모르면 운영으로 본다. `WorklogControlState.js:148-153`.

### P2-6 팀장 자기 승인 허용 유지 — 통과
- AP `src/resolver/worklogCertification/WorklogRequestService.js:191`(주석).
- 테스트 `__test__/WorklogRequestService.test.js:346-354`(팀장 허용 1건, 팀원 불가 1건).

### P2-7 10분 유예 결속 — 통과(잔여: Jira `updated` 실측)
- WF `src/resolver/approvalLink/LinkedWriteGate.js:65-80`. 확인 항목: 우리 kid·자기 서명, cloud·이슈·작성자, op, 원래 started·seconds 일치, created ∈ [iat, exp]±5분, updated−created ≤ 60초, 생성 후 10분.

### P2-8 일반 드로어 배지·협업 캘린더 — 통과
- 새 resolver 는 3절에서 다룬다.
- 화면: WF `static/ui/src/pages/projectDetail/work/useIssueWorklogs.js:52-66`.
  - `invoke` 응답은 `responseWrapper` 가 `{success:true, ...result}` 로 펼친다. 소비자는 `judged.success`·`judged.linked`·`judged.worklogs` 를 읽으므로 shape 이 일치한다(`src/utils/ResponseWrapper.js:9-14`).
- 협업 캘린더: WF `src/resolver/projectCollab/CollabCalendarService.js:59-61` 가 `approvalFromDocs` 를 쓴다. 협업 드로어(`CollabIssueWorklogService.js:47`)와 같은 기준이다.

### P2-9 UTF-8 바이트 — 통과
- 봉투 전체를 `Buffer.byteLength(JSON.stringify(value),'utf8')` 로 잰다: AP `controlDoc.js:26`, `flowsDoc.js:22`, `approvalDoc.js:113`, `certificationDoc.js:141`. 게시 상한 판정은 `WorkforcePublisher.js:516`, `:600`, `:661`.
- 테스트: `certificationDoc.test.js:135`, `writeGateContract.test.js:219`, `:236`.
- 참고: `certificationDoc.js:96` 의 본문 예산 `fits()` 는 문자 길이로 잰다. 다만 본문이 ASCII 전용(주석 `:14`)이고 최종 상한은 바이트로 다시 보므로 결함은 아니다.

### P2-10 주석·AGENTS — 부분(F2)
- AP `controlDoc.js:5-14`, `contract.js:48` 현행화 확인. WF `AGENTS.md` 갱신(보고서 §11).
- AP `AGENTS.md:45` 는 미갱신(F2).

---

## 2. 사후 감지 생산자 → 소비자 교차 — 통과 (새 테스트)

AP `src/resolver/workforce/__test__/RuleViolationCross.verify.test.js` — **7/7 통과**.

- 생산자(실제 코드): `WorklogCertificationRepository.forMonth`(SQL 행 → `ruleViolation`) → `WorkforcePublisher.buildCertFor` → `buildCertDoc` 서명.
- 소비자(WF 리포 실제 코드): `readCertDoc`(서명·계약 검증) → `approvalOfWorklog` / `approvedSecondsOf` / `approvalBasisOf`.

| 경우 | 게시 e[1]/e[5] | 워크포스 결과 |
|---|---|---|
| 위반 + UNSUBMITTED(자동 접수 중지) | UNSUBMITTED / **INVALID**, 길이 10 | countable 0, normalOrigin false, `excludedReason=UNVERIFIED`("확인 중"), basis `excludedUnverifiedSeconds=3600` |
| 위반 + PENDING(소명 대기) | PENDING / INVALID | 같음 |
| 위반, 다음 달로 넘어감 | — | countable 0, `PAST_UNAPPROVED` |
| 대조군: 표시 없음 + PENDING | PENDING / WORKFORCE | countable 3600(이번 달 포함) |
| 다른 경로 표시(사유 ≠ RULE_VIOLATION) | 원래 출처 유지 | 이 규칙으로는 INVALID 가 되지 않음 |
| 소명 승인 후(WORKFORCE·WF_CHANGED, 통제 행은 FLAGGED 그대로) | **APPROVED / 원래 출처** | countable 3600, approved 3600, lockReason APPROVED. 다음 달에도 3600 |

- 워크포스 화면 표시: 상태 Lozenge 는 e[1] 을 그대로 쓴다("승인 요청 전"·"승인 대기"). 여기에 "통계 제외" 문구가 붙고, 집계 안내 줄에 "확인 중 n시간 제외"가 나온다.
- "규칙 위반"이라는 별도 문구는 없다(잔여 R3, 계약 칸 추가 필요 — 보고서에 이미 범위 밖으로 기록돼 있음).

## 3. `getIssueWorklogApproval`(워크포스) — 통과

| 점검 | 결과 | 근거 |
|---|---|---|
| 3단계 등록 | `guardedDefine` + PermissionMap `'SELF'` + 기존 `registerMyWorkController`. 권한 계약 테스트 통과 | WF `MyWorkController.jsx:26-28`, `PermissionMap.js:236`, `src/index.js:19`, `:78` |
| 조회자 | resolver context 의 `accountId` 만 쓴다(payload 는 `issueKey` 만) | `MyWorkController.jsx:27` |
| 범위 | 행 상태는 본인 작성분만 싣고, 남의 행은 숫자 합계에만 들어간다 | WF `MyWorkService.jsx:260-281` |
| 이슈 열람 재확인 | 워크로그를 asUser 로 읽는다(`WorklogApi.js:4` 기본 `as='user'`). `applyWorklogApproval(selfOnly)` 가 permissions/check·worklog/list 로 다시 확인한다 | `MyWorkService.jsx:264-267` |
| 연동 OFF 시 Jira 0 | 잘못된 키·조회자 없음·OFF 면 Jira 를 부르기 전에 `{linked:false}`. 설정 조회는 Forge 저장소 | `MyWorkService.jsx:261-263`, 테스트 `ApprovalDisplayPaths.test.js:169-181` |

- 참고(R4, P3): `countedTotalSeconds` 는 목록 전체(남의 행 포함)의 승인 규칙 초 합이다.
  - 남의 행이 하나뿐이면 Jira 원본 합계와 비교해 그 행이 집계 제외인지 추정할 수 있다.
  - 이슈 열람 권한 안의 집계 숫자이고, 다른 집계 화면과 같은 수준이라 결함으로 보지 않았다.

## 4. ctl 상태 분류 — 단독 경로·ON+소속 ABSENT — 통과(잔여 R1·R2)

- **승인 앱 미설치 단독**: 이슈·프로젝트 프로퍼티가 404 → ABSENT → OFF 면 DIRECT. 운영 키링에는 prd 승인 앱 키가 없다(WF `keyring.js:18-21`, dev·stg 만). 그래서 운영 사이트는 신뢰 키 없음 → `usable=false` → Jira 를 부르지 않고 NO_TRUST → OFF 면 DIRECT. 테스트로 고정돼 있다(보고서 §11).
- **연동 OFF + 승인 앱 설치**: VERIFIED 면 지금처럼 판정한다. UNVERIFIED 는 BLOCKED.
- **ON + 소속 + ABSENT = BLOCKED**: 의도대로다(`writeChannel.js:48-49`).
- **ARS-14 류(워크포스가 막 연결한 이슈, ctl 404)는 워크포스 입력이 막힌다.** 즉시 게시 경로로 풀리는 조건:
  - 승인 앱이 그 이슈의 신호를 처음 VERIFIED 하는 순간에만 `onLinkChanged` → `ctlTargetChanged` → 같은 요청 안에서 ctl PUT 한다(`WorklogPolicyAuthority.js:56`, `WorklogControlHooks.js:110-118`).
  - 승인 앱이 신호를 읽는 계기는 셋뿐이다: 승인 앱 이슈 화면 열기(asUser), 그 이슈의 워크로그 이벤트(asApp), 관리자 refresh(`IssueSignalRefresher.js:46-66`).
  - `WorkforcePublishWake` 는 승인 앱이 모르는 신호를 발견하지 않는다.
  - 결론: **워크로그가 0건인 새 연결 이슈는 누군가 승인 앱 이슈 화면을 한 번 열기 전까지 워크포스 입력이 BLOCKED** 다. 그 뒤에는 즉시 PUT 으로 풀린다(테스트 `LinkedCtlImmediate.e2e.test.js`). 프로젝트 캐시 60초 안이면 1분까지 더 걸릴 수 있다.
  - BLOCKED 안내(`WORKLOG_LINK_UNCONFIRMED`)가 "승인 앱 화면에서 기록"을 권하므로, 안내를 따르면 해소된다. 다만 이는 이번 회귀가 아니라 기존 동작이다(linked-mode-ux 때부터 ABSENT+ON+소속은 BLOCKED). → 실측 필요(아래 S2).
- R2(P3): 승인 앱 키를 신뢰하는 사이트에서는 프로퍼티 GET 이 일시적으로 5xx·429 이면 READ_FAILED → UNVERIFIED → **OFF 라도 BLOCKED** 다. 결정("읽기 실패는 DEFER")대로지만 안내 문구가 승인 앱을 가리킨다.

## 5. 계약 파일 4종·`.gitattributes` — 통과

| 파일 | AP sha1 | WF sha1 | CR |
|---|---|---|---|
| contract.js | 020622effbdec63a3b0a4d8ec5e26c1e24e3a00e | 같음 | 0 / 0 |
| writeGate.js | e5a057907b66129ef01104fe8bc738d5257b7f5c | 같음 | 0 / 0 |
| vectors.json | 3bb52e4497538a2d06f475b0623454984daa97e2 | 같음 | 0 / 0 |
| writeGateVectors.json | 2039cda3d42117b595b2b2c036ccabf18d145cf0 | 같음 | 0 / 0 |

- `.gitattributes` 는 두 리포 모두 `writeGate.js`·`writeGateVectors.json` 에 `text eol=lf` 를 추가했다.
- `git check-attr eol` 결과는 8개 파일 모두 `lf`.
- `writeChannel.js` 의 백엔드·UI 두 사본도 diff 0 이다.

## 6. 깨우기 큐·유휴 SQL — 통과

- 새 consumer·스케줄이 없다. AP `manifest.yml` 무변경(`git diff --stat` 0). 기존 approval-sweep 큐의 `workforce` 작업에 payload 만 얹는다.
- 디바운스는 KVS `approval:workforce:publishWake{until}` 15초다. 리스 경합이면 한 번만 다시 넣는다(`WorkforcePublisher.js:821-832`).
- 유휴 SQL:
  - 일일 트리거는 이벤트 작업을 넣지 않는다.
  - 누가 넣었더라도 연동 꺼짐이면 SQL 0, 미연동이면 ≤1, 연동 유휴면 ≤10 이고 일일 작업보다 적다(`src/trigger/__test__/idleSqlBudget.test.js:262-295`).
- 깨우기 단위 테스트: `WorkforcePublishWake.test.js:33-142`(디바운스, OFF·미서명·미연동 미투입, 던지지 않음, touch 실패 시 미투입, afterDecide·회수, 상한 초과·스코프 밖 큐).
- 참고(미세): 첫 push 와 `until` 쓰기 사이에 동시 요청이 오면 작업이 둘 들어갈 수 있다. 두 번째 작업은 리스 경합으로 한 번 재투입된 뒤 끝나므로 비용은 작다.

## 7. 금지 구역 — 통과

- 워크포스 locales:
  - 원천(`kr/*.json`·`en/*.json`)을 merge 와 같은 로직으로 **scratch 에 임시 출력**해 비교했다. `ko-KR.json`·`en-US.json` 모두 **바이트 동일**이다.
  - 원천 diff 는 추가뿐이다(`issuePanel.postCheck`, `worklog.approval.*`, `myPage` 1줄). 산출물의 삭제 4줄은 JSON 콤마 이동뿐이다.
  - 실제 `npm run merge` 는 실행하지 않았다.
- 승인 앱 locales: kr/en 키 집합이 같다. 산출물 네임스페이스도 원천과 같다.
- 미추적·보호 파일 sha1 을 전후로 대조했고 모두 OK 다: WF pptx 3개, `캡처.png`, `custom-scopes.yaml`, `src/resolver/backoffice/team/__test__/LeaderTeamBackfill.test.js`.
- `git status` 항목 수: WF 160 → 160(불변). AP 136 → 137(내 교차 테스트 1개).

## 8. 실행 결과

| 명령 | 결과 |
|---|---|
| AP `npm test -- --runInBand` | **207 suites / 3,068 tests 통과**(새 교차 테스트 추가 전 전체 실행). 새 파일 단독 실행 7/7 통과 |
| AP `npm run test:ui -- --runInBand` | **94 suites / 828 tests 통과** |
| AP `npm run build:ui`(CI 플래그 없음) | 성공(Compiled with warnings: node_modules source map·postcss-calc 기존 경고). build 폴더는 성공 산출물 |
| AP `npm run check:bundle` | OK(번들 로드·export 10개) |
| AP `forge lint` | **실패(F1)** — scratch 사본에서 3곳을 고치면 `No issues found` |
| WF `npx jest`(백엔드) | **183 suites / 2,850 tests 통과** |
| WF `static/ui npx jest` | **169 suites / 2,691 tests 통과** |
| WF `npm run build:app` + `bundle:check` | 성공. main.js gzip 495,949 / 950,000 withinBudget |
| WF `forge lint`(빌드 후) | No issues found(PermissionLinter "Unknown product" 경고는 기존) |

---

## 남은 결함(담당)

| # | 심각도 | 내용 | 담당 |
|---|---|---|---|
| F1 | **P1 배포 차단** | AP `forge lint` 중복 키 3곳(`ruleViolation.test.js:18`, `writeGateHarness.js:86`·`:99-101`). 앞쪽 중복을 지우면 해결된다(scratch 확인) | backend |
| F2 | P3 | AP `AGENTS.md:45` 옛 창구 문장 + 깨우기·관문 근거 항목 + `CLAUDE.md` 변경 이력 한 줄 | backend(문서) |
| R1 | P2(기존 동작) | 새 연결 이슈(ctl 404) + ON + 소속이면 승인 앱 화면을 한 번 열기 전까지 워크포스 입력이 BLOCKED. 발견 경로(WF 신호 → AP)가 없다. 안내 문구 확인 또는 후속 설계 | 설계(후속)·실측 |
| R2 | P3 | 승인 앱 키를 신뢰하는 사이트에서 프로퍼티 읽기 일시 실패면 OFF 라도 BLOCKED(결정대로). 안내가 승인 앱을 가리킨다 | workforce(문구 검토) |
| R3 | P3 | 워크포스는 규칙 위반을 "승인 대기 + 통계 제외 / 확인 중"으로만 보인다. 별도 문구는 계약 칸 추가 후속 | 승인 앱+워크포스 후속 |
| R4 | P3 | `getIssueWorklogApproval.countedTotalSeconds` 의 남의 행 집계로 단일 행 상태를 추정할 수 있다(열람 권한 안의 숫자) | workforce(검토) |
| R5 | 운영 절차 | MEASURED 는 관리자 자기 신고다(메모 필수). 운영 실측 절차·증거 보관이 필요하다 | 운영 |
| R6 | P3 | `ruleViolation.closesAt`: 재개방 진행 중(`reopenOperationId`) 행은 `closedAt > 쓰기 시각` 이어도 마감으로 본다. 오탐 여지가 좁게 있다 | backend(후속) |

## 배포 전 필수 실측 (개발 사이트 https://tom-chkim-dev.atlassian.net)

**사전 절차**
1. F1 을 고친 뒤 AP `forge lint` 가 `No issues found` 인지 본다.
2. `forge tunnel` 잔존 여부를 확인한다(iframe localhost 백지 함정).
3. 순서: 워크포스 신판 배포 → 승인 앱 신판 배포(`forge deploy -e development`, AP 는 SQL 추가가 없으므로 major 승인 불필요 예상). 이어서 두 앱의 `forge install --upgrade` 설치 버전을 확인한다.
4. 워크포스는 manifest 가 바뀌었으므로 터널을 다시 시작해야 한다.

| # | 실측 | 절차 | 기대 증거 |
|---|---|---|---|
| S1 | 사후 감지 전 흐름 | ① 승인 앱 관리자가 지난달 마감 → **15초 안에** 워크포스에서 그 달 작성(옛 wr 가 허용하는 구간). 안 잡히면 `cr` 이 없는 ctl 이 남아 있는 상태에서 시도 ② 승인 앱 Work log 탭 | "규칙 위반 입력" 배지, 자동 접수 없음(`EXPLANATION_REQUIRED`), 이력 사유. `GET /rest/api/3/user/properties/movesApproval.cert.{YYYY-MM}?accountId=` 의 e[5]=`INVALID`. 워크포스 화면 "통계 제외/확인 중" |
| S1b | 소명 → 집계 복귀 | 작성자 사유 입력 → 소명 요청 → 팀장 승인 | 인증 문서 e[1]=APPROVED·e[5]=WORKFORCE. 워크포스 집계·확정 원가 포함 |
| S2 | ARS-14 류 첫 입력 | 워크포스에서 새 이슈 연결(워크로그 0건) → 워크포스 모달에서 작성 시도 → BLOCKED 확인 → 승인 앱 이슈 화면 열기 → 다시 시도 | 첫 시도 `WORKLOG_LINK_UNCONFIRMED`. AP 화면을 연 뒤 `workforce_publish` 의 `I:{id}`/`ctl` 행 `pending=0`·`published_at` 갱신, REST ctl 200, 워크포스 작성 성공(≤60초) |
| S3 | 이벤트 큐 지연 | 타임시트 제출·단건 결정·회수·마감·재개방 직후 | v1 `movesApproval.{YYYY}` 의 `st`·`cl` 반영 시각 − 사건 시각(목표: 15초 + 큐 지연). `forge logs` 는 늦으므로 프로퍼티 GET 으로 확인 |
| S4 | `environmentType` 실값 | 관문 화면 `environment.type`. 트리거 경로(삭제 후보)에서 `getAppContext` 가 null 이면 운영으로 취급되는지 | DEVELOPMENT 이면 DEV_MEMO 인정, PRODUCTION·null 이면 운영 배너 |
| S5 | 10분 유예의 `updated` | 워크포스 작성 직후 단건 GET(`?expand=properties`), 승인 앱이 워크로그 프로퍼티를 쓴 뒤 다시 GET | `updated − created ≤ 60s` 유지 여부. 아니면 유예가 꺼져 DEFER(안전 쪽) |
| S6 | 거부 3종 | 작성 기간 밖·승인분 수정/삭제·마감 기간 작성을 모달·캘린더 드래그·resolver 직접 호출로 시도 | 오류 코드 + **Jira 기록 무변경** |
| S7 | 일반 드로어 배지 | 트리·맵 드로어에서 본인·남의 기록이 섞인 이슈 | 본인 행만 배지, 합계 = 서버 `countedTotalSeconds`, 호출 수(worklog GET 1 + permissions/check 1 + worklog/list 1 + 문서) |
| S8 | 워크포스 패널 소멸 | 워크포스 배포 출력의 major 경고 유무, ARS-14 화면 | 패널 2개가 사라지고 승인 앱 Work log 만 남음 |

## 운영 배포 전 필수

1. **운영 서명 키**
   - 승인 앱 prd 키(`ap-prd-*`)와 워크포스 prd 키(`wf-prd-*`)를 두 앱 `keyring.js` 에 **같은 바이트**로 넣는다. 지금은 dev·stg 만 있다.
   - 이 파일은 계약 동일성 대상이다. 넣은 뒤 sha1 을 다시 대조한다.
   - 운영 환경에 `forge variables set --encrypt -e production MOVES_LINK_SIGNING_KEY/KID` 를 설정한다.
   - prd 키가 없으면 운영의 ON 사이트에서 워크포스 연동 이슈 쓰기가 전부 NO_TRUST → BLOCKED 다.
2. **관문 MEASURED**
   - 운영에서는 DEV_MEMO PASS 가 인정되지 않는다.
   - 수동 관문 3건을 일반 사용자·모바일·REST 우회·복구 실측 뒤 근거 "MEASURED"와 실측 메모로 다시 기록한다(개발 사이트의 "운영 전 재확인" 메모는 무효).
3. **개발자 콘솔 배포 상태·기여자**
   - developer.atlassian.com 콘솔에서 두 앱의 production 배포 버전, 설치 사이트 버전(major 대기 여부), 기여자(배포 권한)를 확인한다.
   - 승인 앱 app id 가 Confluence 판 id 로 돌아가지 않았는지도 본다.
4. **워크포스 manifest 모듈 삭제의 major 여부**
   - 삭제분: `jira:issueActivity`·`jira:issueContext`·resource `issue-panel`. scope 변경은 없다.
   - 공식 문서상 minor 예상이지만, `forge deploy -e development` 출력과 설치 버전으로 확정한 뒤 운영에 반영한다.
   - CI 아티팩트에서 `build-panel/**` 의존이 빠졌는지도 확인한다.
5. **배포 순서·롤백**
   - 워크포스 → 승인 앱 순서로 배포한다. 승인 앱 배포 뒤 ctl·flows 전체 재게시(ALL)를 한다.
   - 롤백할 때는 이미 게시된 ctl(`wr`) 만료(≤7일)와 워크포스 프로젝트 캐시 60초를 고려한다. 코덱스 §9 조합표대로 재게시하고 확인한다.
6. **F1 수정 후 최종 재실행**: AP `forge lint`, `npm test`, `test:ui`, `build:ui`, 그리고 계약 4종 sha1·CR 재대조.
