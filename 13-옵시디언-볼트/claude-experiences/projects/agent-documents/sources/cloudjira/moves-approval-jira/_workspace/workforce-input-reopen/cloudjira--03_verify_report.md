# 검증 리포트 (회차 1) — workforce-input-reopen

> 2026-10-14 · integration-verifier · 기준: `01_architect_design.md`(H안·결정 절), `02_backend_report.md`, `02_workforce_report.md`, 두 리포 작업 트리(linked-mode-fix 위)
> 수정 없음. 교차 테스트 파일 1개만 추가(승인 앱 `src/integration/workforce/__test__/workforceGate.cross.test.js`). 커밋·forge 배포·터널 조작 없음(`forge lint` 만 실행).

## 요약

통과 27 / 실패 2 / 미검증 10

| 실패 | 담당 | 심각도 |
|---|---|---|
| F1 워크포스 `.gitattributes` 에 `writeGate.js`·`writeGateVectors.json` `text eol=lf` 없음 | 워크포스 | 낮음(커밋·재체크아웃 시 바이트 동일성 붕괴) |
| F2 [발견 5 실제] ALL_ISSUES 프로젝트에서 이슈만 해제(I: rms.policy ctl NONE)된 경우, 승인 앱=비연동인데 워크포스는 P: ctl 로 gated 판정 | 워크포스 | 중간(우회 아님 — 더 엄한 쪽 오판정: 승인 앱이 허용하는 작성을 DENY/DEFER) |

"판정 불가 = 저장 안 함" 위반은 0건이다. 우회 경로(`wa` 직접 수락·36h iat)는 남아 있지 않다.

---

## 실패

### F1 [워크포스] `C:\CloudJira\moves-workforce\.gitattributes` — 2줄 누락

- 현재 7줄(contract·canonical·ed25519·signature·base64url·keyring·vectors.json)뿐이다. `writeGate.js`·`writeGateVectors.json` 이 없다.
- 두 리포 모두 `core.autocrlf=true` 다. 지금은 두 파일이 미추적이라 작업 트리 바이트가 같지만(LF, CR 0), 커밋 후 다른 PC·재체크아웃에서 CRLF 로 풀려 원시 바이트가 갈린다. 승인 앱은 같은 줄을 추가했다(`git diff .gitattributes`).
- 워크포스 `vectors.test.js` 는 LF 정규화로 비교하므로 테스트는 이 결함을 못 잡는다.
- **고치는 방법**: 아래 2줄 추가.
  ```
  src/integration/approval/writeGate.js text eol=lf
  src/integration/approval/writeGateVectors.json text eol=lf
  ```

### F2 [워크포스] 이슈만 해제된 ALL_ISSUES 프로젝트 — 두 앱의 연동 판정이 갈린다 (백엔드 보고 §8-2 "발견" 확인: **실제**)

**코드 근거**
- 승인 앱: `src/domain/worklogControl/rules.js:89-91` `controlLinkOf` — 이슈 신호가 VERIFIED ∧ `ctl==='NONE'` 이면 `{linked:false, released:true}`(프로젝트 ALL_ISSUES 보다 먼저 본다). `src/resolver/worklogControl/WorklogControlCtl.js:184` `bodyFor` — `body.ctl === 'NONE'` 이면 I: ctl 문서를 지운다. 쓰기 판정(`WorklogControlContext.contextFor:79-92`)은 `linked=false` 라 Jira 기간 창(wd)을 적용하지 않는다.
- 워크포스: `src/resolver/approvalLink/ApprovalControlLookup.js:97-101` `forIssue` — 이슈 ctl 이 없으면 `projectControl` 로 내려가 `{linked:true, basis:'PROJECT'}`. `LinkedWriteGate.js:34` `gatedOf` 가 참 → `writeChannel.js` WG 행 DIRECT → `judgeLinkedWriteFor` 가 P: `wr`(wd·pq·ix 등)로 판정한다. 워크포스 자신의 해제 신호(`movesRmsPolicy`, `IssueWorklogControlService.js` `PROPS` 로 이미 함께 읽는 이슈 프로퍼티)는 보지 않는다.
- 해제 신호는 실제로 발행된다: `ApprovalLinkSignals.js:129`(소속 아님 → RELEASED NONE), `:220` `withdrawIssues`(연결 해제).

**재현 테스트**(추가, 통과 상태로 현재 동작을 고정): 승인 앱 `src/integration/workforce/__test__/workforceGate.cross.test.js` describe `[발견 5]`
- `승인 앱은 이 이슈를 비연동으로 보고…(허용)` — `controlLinkOf` → `linked:false, released:true`, `judgeCreate` ok.
- `재현(현재 동작)` — 워크포스 실제 `createApprovalControlLookup`·`judgeLinkedWriteFor`(서명된 P: ctl + 이슈의 서명된 NONE 신호) → `{linked:true, basis:'PROJECT', gated:true, verdict:'DENY', code:'WORKLOG_WINDOW_UNRESOLVED'}`(wd=true·sf 없음 사이트).
- `기대(test.failing)` — `gated === false`. 지금은 실패가 기대값이다.

**영향**: 저장 우회는 없다(워크포스가 더 엄하다). 대신 승인 앱이 허용하는 작성이 워크포스에서 DENY(wd 창 미해결·rms.issue s/e)나 DEFER(pa·ix)로 막혀, 사용자는 "승인 앱에서 열기"로 가야 한다. 같은 `forIssue` 를 쓰는 `isApprovalHidden`(집계 숨김 판정)도 같은 근거를 쓴다(해제 이슈는 승인 앱이 숨기지 않으므로 실질 영향은 낮음).

**고치는 방법(원칙: 승인 앱 판정이 비연동이면 워크포스도 비연동 규칙)**: `forIssue` 에 이슈의 자기 서명 정책 신호(`POLICY_PROPERTY_KEY`)를 넘겨, **자기 키로 검증된** `ctl:'NONE'` 이면 프로젝트 ctl 로 내려가지 않고 `NOT_LINKED('RELEASED')` 를 돌려준다(승인 앱 `controlLinkOf` 순서와 같게). 그러면 `creationState` 는 W1/W2(DIRECT, 판정 없음)로 떨어진다. 검증 실패·없음은 지금처럼 프로젝트로 내려간다. 고친 뒤 위 `test.failing` → `test`, `재현(현재 동작)` 테스트는 삭제(또는 기대값 반전).

---

## 미검증 (실측 필요 — 개발 사이트, Tom Kim)

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| U-1 | 워크포스 asUser 로 **본인** `movesApproval.{YYYY}` GET 200 | Jira 실측 | 승인 앱에서 타임시트 제출 → 워크포스 모달 그 기간 작성 → `WORKLOG_PERIOD_LOCKED` |
| U-2 | cert 문서 게시 지연 p50/p95(R-2 창) | 실측 | 승인 직후 10초 간격 GET `movesApproval.cert.2026-10` |
| U-3 | wr 포함 ctl PUT·3일 버킷 재서명, `wa` 제거 | 배포 필요 | 첫 일일 tick 뒤 GET project/issue property `movesApproval.ctl` → `value.wr.exp = floor(now/3d)*3d+7d`, `wa` 없음 |
| U-4 | 규칙 저장 → workforce 큐 → scanCtl 재게시 | 배포 필요 | `timesheetBackdateMaxDays` 변경·기간 마감 → 수 분 안 `wr.r.pd`·`wr.cr` 반영 |
| U-5 | 두 런타임 Intl 동일 | 런타임 | 두 리포 테스트는 로컬 Node 에서 통과(158 골든 + DST). Forge nodejs22.x 에서 재확인은 배포 후 |
| U-6 | 워크포스 작성 → 승인 앱 트리거 WORKFORCE → 자동 접수·기본 승인자(완료 기준 1) | 실측 | 워크포스 모달 작성 → 승인 앱 작업 로그 탭 '요청됨', `worklog_control.origin='WORKFORCE'` |
| U-7 | 숨긴 기록·권한 회수 사이트 asUser GET/PUT/DELETE 상태 코드(403/404 → DEFER 매핑) | 실측 | 통제 Phase C ON → 승인분 수정 시도 → 넘김 |
| 거부 3종 | 팀장 작성 기간 밖 / 승인된 기록 수정 / 마감 기간 작성 → 워크포스 저장 거부 + 열기 버튼 | 실측 | 완료 기준 2 |
| expand=properties | 단건 `GET …/worklog/{id}?expand=properties` 가 `movesRms.origin` 을 주는가(Q5 freshOwn) | 실측 | 안 주면 freshOwn 항상 false → 방금 쓴 기록 수정은 DEFER(안전 쪽) |
| PUT 후 봉투 | 워크포스 PUT 이 워크로그 프로퍼티(`movesRms.origin`)를 보존하는가 | 실측 | 승인 앱은 `originFor` 가 기존 PROVEN 행을 고정(sticky)하므로 생성 이벤트를 받았다면 영향 없음. 생성 이벤트 누락 + 프로퍼티 소실이면 NONE 으로 잡힘 |

U-8(G-HANDOFF `router.navigate`)은 기존 실측 항목 그대로.

---

## 통과

### 1. 계약 파일 동일성 — 통과(단 F1)

| 파일 | 승인 앱 sha1 | 워크포스 sha1 | `cmp` |
|---|---|---|---|
| `writeGate.js` | e5a057907b66129ef01104fe8bc738d5257b7f5c | e5a057907b66129ef01104fe8bc738d5257b7f5c | 같음 |
| `writeGateVectors.json` | 2039cda3d42117b595b2b2c036ccabf18d145cf0 | 2039cda3d42117b595b2b2c036ccabf18d145cf0 | 같음 |
| `contract.js` | 95b508fb0ec68258d9bf980f575de20aaa5ec6fc | 95b508fb0ec68258d9bf980f575de20aaa5ec6fc | 같음 |
| `vectors.json` | 3bb52e4497538a2d06f475b0623454984daa97e2 | 3bb52e4497538a2d06f475b0623454984daa97e2 | 같음 |

- 보고서 sha1 과 일치. writeGate.js·벡터는 두 리포 모두 CR 0.
- 승인 앱 `.gitattributes` 2줄 추가 확인. 워크포스는 F1.
- 골든 벡터 테스트 각자 실행: 승인 앱 `writeGate.parity.test.js`(파일 재현 포함)·워크포스 `writeGate.test.js`(158건) 모두 통과(전체 실행에 포함).
- 참고(이번 작업 아님): 공용 서명 파일 4종(canonical·ed25519·signature·base64url)은 두 리포 작업 트리 모두 CRLF 로 같은 상태이고 LF 정규화 시 동일하다. 원시 sha1 은 리포 간 같다.

### 2. 판정 동일성 — 통과

- 승인 앱 대조 테스트는 실제 도메인 함수를 부른다(`writeGateHarness.js` import: `evaluateWorklogLock`·`judgeCreate`·`judgeMutation`·`mutationNotices`·`mergePolicy`·`legacyPolicy`·`writeRulesOf`·`entryBodyOf`·`certEntryBodyOf`). 골든 + 시드 고정 2,000건, DEFER 는 명세의 첫 사유와 코드까지 일치를 요구.
- **교차 대조(신규, 통과)** `workforceGate.cross.test.js`: 승인 앱 **실제 생산자**(writeRulesOf → ctl `signEntry`, `entryBodyOf`+`buildDoc` v1 문서, `certEntryBodyOf`+`buildCertDoc` 인증 문서) → 워크포스 **실제 경로**(`createApprovalControlLookup`·`verifyControlDoc` → `judgeLinkedWriteFor` 의 `readTimesheetDoc`·`readCertDoc`→`certOfBody` 재구성·`verifyOwnIssueSetting`·`freshOwnOf`(서명 봉투)·`isControlledVisibility`·`dateWindowOf`). 골든 전부 + 무작위 500건에서 verdict·code·cause·notices 가 하네스 입력의 `judgeLinkedWrite` 와 같다(ALLOW·DENY·DEFER 각 다수). 필드 단위 shape 어긋남 0.
- `02_backend_report §2` ctl 예시 본문(문자 그대로)이 워크포스 `validateBody`·`wrFreshAt` 를 통과하고 8월 CLOSED → `PERIOD_LOCKED`, 9월 REOPENED → ALLOW+BACKDATED(WARN), ix 이슈 10007 → DEFER `ISSUE_EXCEPTION`.
- 워크포스 입력 대조: wr(서명 검증 후 `control.wr`), 본인 v1(`{periodKey,ps,pe,st,lk}` — writeGate 는 st 로 재계산), cert(`approval.entries`·`w[id,seconds,flag]`·`wt`), 10분 유예(`WF_FRESH_GRACE_MS` 계약 상수), dryRun(판정 뒤 POST 전 반환) 모두 승인 앱 생산 shape 과 일치.

### 3. DEFER 규칙 — 통과

워크포스 `LinkedWriteGate.test.js` 225-382 확인(쓰기 0 단언 포함):
- 작성 DEFER: PREAPPROVAL_REQUIRED·ISSUE_EXCEPTION·OUT_OF_HORIZON·POLICY_BLOCKED·LIMIT_NEEDS_TOTAL·DOC_UNREADABLE → `WORKLOG_CREATE_HANDOFF_REQUIRED`, POST 0.
- 수정·삭제 DEFER: CONTROLLED·NOT_OBSERVED·ORIGIN_UNPROVEN·POLICY_BLOCKED·LIMIT_NEEDS_TOTAL·DOC_UNREADABLE → `WORKLOG_EDIT_HANDOFF_REQUIRED`, 쓰기 0.
- 대상 워크로그 404(gated) → 넘김 CONTROLLED. 저장 403 → 넘김.
- 판정 경로 예외 전부 `catch → DOC_UNREADABLE`(`LinkedWriteGate.js:178-181`), `gatedOf` 거짓이면 판정 전 DEFER(`:128`), 봉투 실패 → `SIGNER_UNAVAILABLE` 넘김(`IssueWorklogControlService.js` create). 연동 ∧ ¬gated 는 `writeChannelOf` 상 DIRECT 가 될 수 없다(서명 검증 ctl 이면 gated 아니면 HANDOFF/BLOCKED).

### 4. 우회 폐쇄 — 통과

- 워크포스 src/static: `control.wa`·`wa.v`·36시간·`ctl.iat` 검사 0건(grep). 남은 `wa` 는 이슈 단위 `rms.issue.wa`(팀장 설정, 별개)뿐.
- 승인 앱 `WorklogControlCtl.bodyFor`: `ch:'APP'`, `wa` 없음, `wr` 만(`WorklogControlCtl.test.js:65` 단언).
- 조합표: 신 승인×신 WF(gated 판정)·구 승인(wa 만)×신 WF(HANDOFF, `LinkedWriteGate.test.js:247,256,323`) 테스트 고정. 신 승인×구 WF 는 "본문에 wa 없음" 단언으로 간접 고정(구판 서버 조건 `wa.v===1` 이 거짓). 구×구는 현행.

### 5. 발견 사항 — 실제(F2)

### 6. 불변식·예산 — 통과

- 8: 워크포스 저장·읽기 asUser(`api.asUser()` POST/PUT/DELETE, `getPropertyValue('user', …)`). 승인 앱 ctl PUT 은 기존 게시기 asApp 경로, `ctlRulesChanged` 는 `CTL_IMMEDIATE_PER_INVOCATION=3` 을 `ctlTargetChanged` 와 같은 할당량 키로 공유(`WorklogControlHooks.js`, 테스트 `WorklogControlHooksRules.test.js:58`). 결과는 사용자 응답에 안 실림.
- 9: 워크포스는 서명 검증 통과분만 사용(ctl `verifyControlDoc`, v1 `readTimesheetDoc` 엔트리 하나라도 실패 시 문서 전체 실패, cert `readCertDoc`, rms.issue `verifyOwnIssueSetting`, freshOwn 자기 키 검증 + cloud·issue·author 대조). 승인 앱 wr 은 DB·VERIFIED 수신 행에서만 계산.
- 3: `writeRules.js`·`writeGate.js` 에 `Date.now`/`new Date()` 0, 승인 앱 런타임에서 writeGate import 0.
- 유휴 SQL: manifest 무변경(새 스케줄·consumer 0), `idleSqlBudget.test.js` 무변경 통과, bodyFor SQL 예산 테스트(`WorklogControlCtlWriteRules.test.js:154` 마감 1·결재 설정 1·예외 1·프로젝트 1·P: 수신 1, I: 추가 0), 단독 모드 KVS 1·SQL 0.
- 용량: `writeGateContract.test.js:192-221` 최악 ctl ≤ 30,000B(실측 < 16,000B). `drainCtl` 크기 가드 추가.

### 7. 사후 경로 — 통과

- 트리거 `WorklogControlDetector.handle`: `PROVEN_ORIGINS`(WORKFORCE·WF_CHANGED 포함) → `requestAutomatically`(linked-mode-fix R3 승인자 규칙: `upperLeadsOf` ‖ 본인 허용 시 본인).
- 10분 유예 수정과 지문: `originFor` 는 기존 PROVEN 행을 고정하고, 봉투 검증의 시간 조건은 워크로그 `created` 기준(지금 시각 아님)이라 유예 수정·이후 수정이 INVALID 로 뒤집히지 않는다. 값이 바뀌면 WF_CHANGED(PROVEN) → `requestAutomatically` 가 contentHash 차이로 재접수(PENDING 은 CONTENT_CHANGED). 승인 직후 유예 수정은 R-3(수용 위험, MISMATCH 로 잡힘).

### 8. 금지 구역·회귀 — 통과

- 워크포스 보호 파일 sha1 — 검증 시작 시점 기록과 빌드·테스트 뒤가 같다(보고서 값과도 일치): `locales/en-US.json` db11b147…, `locales/ko-KR.json` 9accd802…, `custom-scopes.yaml` 92d0a1dc…, pptx 3종(0c1094f2…·c869bc3b…·f32c701a…), `캡처.png` cfca194f…, `LeaderTeamBackfill.test.js` 3e7619fe…. locales 의 git `M` 은 작업 전부터의 사용자 변경(보고서 진술, 이번 검증 중 불변).
- 승인 앱 영역 분리: `ApprovalService.js`(APPLY_KINDS)·`modal.jsx`(APPLY_NOTICE_KINDS)·inbox·approvalAdmin diff 에 writeGate·wr·ctlRulesChanged 흔적 0 — 별개 작업으로 보존됨.
- i18n: 승인 앱 `workforce.writeChannel` kr/en 이 설계 §12 문구 그대로, merge 통과. 워크포스 화면이 쓰는 기존 키 11개 모두 ko-KR/en-US 에 존재.

### 관찰(실패 아님 — 보강 권장)

- O1 [승인 앱] `writeGate.parity.test.js:80-85` 무작위 2,000건은 `SKIPPED` 0 을 단언하지 않는다(골든은 단언). `expect(counts.SKIPPED ?? 0).toBe(0)` 추가 권장.
- O2 [승인 앱] `WorklogControlCtlWriteRules.test.js:177-183` "대상 0 → wr SQL 0" 은 다른 `world()` 의 카운터를 확인해 동어반복이다. 실제 보장은 무변경 `idleSqlBudget.test.js` 가 한다. scanCtl→drain 경로로 대상 0 을 세는 테스트로 바꾸길 권장.
- O3 [워크포스] 수정 DEFER 6종 루프가 삭제 경로만 돈다(`LinkedWriteGate.test.js:355-365`), 서명 키 준비 상태에서 봉투 생성 실패(`SIGNER_UNAVAILABLE`) 경로 테스트 없음.
- O4 [잔여 위험] v1 문서 404 = "제출 없음" → 승인 앱 게시 실패(PUBLISH_TOO_LARGE)·지연 동안 제출 기간 작성이 ALLOW 된다. 설계 R-1/R-2 와 같은 성격(승인 앱 사후 대조가 잡음).
- O5 [문서] 워크포스 `AGENTS.md` ⑧, 승인 앱 `docs/LINKED-ISSUE-SCHEDULE.md`·`CLAUDE.md` 제품 변경 이력 미갱신(설계 §15 "문서").

---

## 실행 결과

| 명령 | 결과 |
|---|---|
| 승인 앱 `npm test -- --runInBand`(교차 테스트 추가 전) | 201 suites / 3,008 tests 통과 |
| 승인 앱 `npm test -- --runInBand`(교차 테스트 포함) | **202 / 3,014 통과** |
| 승인 앱 `npx jest …workforceGate.cross.test.js` | 6 통과(골든·무작위 500·예시 본문·발견 5 재현 3) |
| 승인 앱 `npm run merge` + `npm run check:bundle` | 통과(`[bundle-check] OK`) |
| 승인 앱 `npm run test:ui -- --runInBand` | 94 / 825 통과 |
| 승인 앱 `npm run build:ui`(CI 플래그 없음) | 성공 — `static/ui/build` 정상 상태 |
| 워크포스 `npx jest`(루트) | 180 / 2,749 통과 |
| 워크포스 `static/ui` `npx jest` | 167 / 2,665 통과 |
| 워크포스 `npm run build:app` + `bundle:check` | 성공, main.js gzip 494,935B / 950,000 withinBudget |
| 워크포스 `forge lint` | No issues found(PermissionLinter "Unknown product" 경고는 기존). 빌드와 동시에 돈 첫 실행은 build 폴더 재작성 중이라 index.html 누락 오류 — 빌드 완료 뒤 재실행 통과 |

---

## 담당별 수정 요청

### 워크포스
1. **F1** `.gitattributes` 에 `src/integration/approval/writeGate.js text eol=lf`·`src/integration/approval/writeGateVectors.json text eol=lf` 추가.
2. **F2** `ApprovalControlLookup.forIssue`(또는 `creationState`/`gatedOf` 앞단)에서 이슈의 **자기 서명 검증된** rms.policy `ctl:'NONE'` 이면 프로젝트 ctl 로 내려가지 않고 비연동(`NOT_LINKED('RELEASED')`)으로 — 승인 앱 `controlLinkOf` 순서와 동일하게. 수정 뒤 승인 앱 교차 테스트 `[발견 5]` 의 `test.failing` → `test`, `재현(현재 동작)` 은 삭제/반전(이 파일은 승인 앱 리포에 있으므로 리더가 함께 정리).
3. (권장) O3 테스트 보강, O5 `AGENTS.md` ⑧ 갱신.

### 승인 앱
1. (권장) O1 무작위 parity 에 SKIPPED 0 단언.
2. (권장) O2 "대상 0 → SQL 0" 테스트를 실제 scanCtl/drain 경로로 교체.
3. (문서) `docs/LINKED-ISSUE-SCHEDULE.md` §3·§4·§5·§7·§9, `CLAUDE.md` 제품 변경 이력 1행.

## 남은 미검증(실측)

U-1 · U-3 · U-4 · U-5 · U-6 · U-7 · 거부 3종(작성 기간 밖 / 승인된 기록 수정 / 마감 기간 작성) · `worklog/{id}?expand=properties` 봉투 반환 · (추가) 워크포스 PUT 후 `movesRms.origin` 보존 · U-2 · U-8
