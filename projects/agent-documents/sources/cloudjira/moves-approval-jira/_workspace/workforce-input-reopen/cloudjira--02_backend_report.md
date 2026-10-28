# workforce-input-reopen — 백엔드 보고서(승인 앱 T-A1~T-A7)

> 2026-10-14 · backend-engineer · 1회차 · 입력: `01_architect_design.md`, `00_input/requirement.md`(결정 절 포함)
> 커밋·forge 없음. 새 SQL·manifest·resolver 없음. 워크포스 리포 수정 없음(읽기만).

## 0. 설계 불변식 충돌

없음. 불변식 8(asApp 경로 무변경 — ctl PUT 은 기존 게시기 asApp 허용 2번), 9(wr 은 우리 DB·서명 검증된 수신 캐시로만 계산), 3(writeRules·writeGate 순수, now 주입), 유휴 SQL 예산(새 스케줄·consumer 0, ctl 대상 0 이면 wr SQL 0) 모두 유지.

## 1. writeGate 계약 파일 — 워크포스가 그대로 복사할 것

| 파일(승인 앱 원본) | 워크포스 경로 | sha1(LF) | 바이트 |
|---|---|---|---|
| `src/integration/workforce/writeGate.js` | `src/integration/approval/writeGate.js` | `e5a057907b66129ef01104fe8bc738d5257b7f5c` | 20,812 |
| `src/integration/workforce/writeGateVectors.json` | `src/integration/approval/writeGateVectors.json` | `2039cda3d42117b595b2b2c036ccabf18d145cf0` | 179,049 |
| `src/integration/workforce/contract.js` | `src/integration/approval/contract.js` | `95b508fb0ec68258d9bf980f575de20aaa5ec6fc` | 24,460 |
| `src/integration/workforce/vectors.json` | `src/integration/approval/vectors.json` | `3bb52e4497538a2d06f475b0623454984daa97e2` | 33,183 |

- sha256: writeGate.js `c0989af371d241ca97932544606e4f396b4ef6412cdc6549b8a7ebd21f468073`, writeGateVectors.json `d29c31524f73c4b9876c7128c9651678ec8f993aeaf80e39c48bd16c6c90af24`, contract.js `4a04015a21bfc01b53c5547a54713e198e879261338f4e871e83738e3e5a81ca`, vectors.json `f86bd0f21f49a349254dbbfecf58328b57e9fe398520089aa3667d1259eab5d1`.
- 보고 시점에 워크포스 작업 트리의 네 파일이 이미 위 sha1 과 같다(읽기로 확인).
- `.gitattributes` 에 `writeGate.js`·`writeGateVectors.json` 을 `text eol=lf` 로 추가했다. 이 리포는 `core.autocrlf=true` 라 이 줄이 없으면 체크아웃 때 CRLF 가 되어 두 리포의 바이트가 갈린다. 워크포스 쪽도 같은 줄이 필요하다.

### 1.1 시그니처·반환 shape

```js
judgeLinkedWrite({
  op,                    // 'create'|'edit'|'delete'
  now,                   // ms
  timeZone,              // ctl.tz
  wr,                    // validateBody(APPROVAL_CTL) 통과한 ctl.wr
  basis,                 // 'ISSUE'|'PROJECT' — ctl 을 이슈/프로젝트 어느 프로퍼티에서 읽었나
  issueId,
  setting,               // 자기 rms.issue 본문 {s,e,pa,wa}|null (서명 검증 통과분)
  jiraWindow,            // {status:'OK'|'NO_FIELD'|'READ_FAILED'|'INVALID'|'FIELD_UNVERIFIED', start, end}|null — wr.wd ∧ s/e 없음일 때
  started, seconds,      // create·edit 의 새 값(delete 는 안 씀)
  prevStarted, prevSeconds, // edit·delete 의 현재 값(edit 는 필수)
  own,                   // v1 문서 엔트리 [{periodKey, ps, pe, st}] — 404 면 []
  cert,                  // edit·delete: certOfBody(인증 문서 본문|null, worklogId) 결과. 읽기 실패면 null
  freshOwn,              // edit·delete: 자기 봉투 검증 ∧ now - created ≤ WF_FRESH_GRACE_MS
  visibilityControlled,  // edit·delete: isControlledVisibility(worklog.visibility, ctl.vt)
})
// → { verdict: 'ALLOW'|'DENY'|'DEFER', code: string|null, cause: object|null, notices: [{code, severity, vars}] }
```

실제 반환값 예(골든 벡터에서 그대로):

```json
{"verdict":"ALLOW","code":null,"cause":null,"notices":[{"code":"BACKDATED","severity":"WARN","vars":{"days":3}}]}
{"verdict":"DENY","code":"WORKLOG_PERIOD_LOCKED","cause":{"reasonCode":"PERIOD_CLOSED","periodKey":"2026-09","which":"previousStarted"},"notices":[]}
{"verdict":"DENY","code":"WORKLOG_OUTSIDE_ISSUE_WINDOW","cause":{"which":"started","start":"2026-10-10","end":"2026-10-20"},"notices":[]}
{"verdict":"DENY","code":"WORKLOG_WINDOW_UNRESOLVED","cause":{"status":"NO_FIELD"},"notices":[]}
{"verdict":"DENY","code":"WORKLOG_CERTIFIED_LOCKED","cause":{"state":"CERTIFIED"},"notices":[]}
{"verdict":"DEFER","code":"PREAPPROVAL_REQUIRED","cause":null,"notices":[]}
{"verdict":"DEFER","code":"POLICY_BLOCKED","cause":null,"notices":[{"code":"BACKDATED","severity":"BLOCK","vars":{"days":3}}]}
```

- DENY `code` 4종은 승인 앱 `ErrorCodes`·`MutationError` 와 같은 문자열이다(테스트가 묶는다).
- DEFER `code` 는 `PREAPPROVAL_REQUIRED|ISSUE_EXCEPTION|OUT_OF_HORIZON|CONTROLLED|NOT_OBSERVED|ORIGIN_UNPROVEN|POLICY_BLOCKED|LIMIT_NEEDS_TOTAL|DOC_UNREADABLE` 중 하나다. `SIGNER_UNAVAILABLE` 은 상수만 두었다. 판정 전에 호출부가 쓴다.
- 던지지 않는다. 입력이 잘못됐거나, `wr` 이 만료(`now >= exp`)·판 불일치이거나, 타임존 오류면 `{verdict:'DEFER', code:'DOC_UNREADABLE', cause:null, notices:[]}` 를 돌려준다.
- 보조 export(워크포스가 같은 규칙으로 쓰도록):
  - `wrFreshAt(wr, now)`
  - `certOfBody(certBody, worklogId) → {entry, certified, truncated}`: certified 는 w 에 있고 삭제 비트 2 가 없을 때다.
  - `submissionsOfV1(own)`, `closesOfWr(cr, tz)`, `notices(...)`, 시간 함수(`localDateOf`·`zonedMidnight`·`periodKeyOf`·`periodRange`·`daysBetween`·`autoCloseAtOf`·`closedAtOf`·`ownLockOf`)
  - 상수 `Verdict`·`DenyCode`·`DeferReason`·`PROVEN_ORIGINS`·`WRITE_GATE_VERSION`

## 2. ctl 본문 — 실제 예시(P: 대상, bodyFor 출력 그대로)

조건: 서울, 월 단위, 자동 마감 3일, 과거 14일·수정/삭제 7일, 8월 CLOSED·9월 REOPENED, 이슈 10007 에 editWindowDays 예외, now = 2026-10-14T03:00Z. 서명 문서 전체 675B.

```json
{"vs":"OFF","dw":false,"ch":"APP","rx":["rms.issue","rms.kb","rms.issue.fl","approval.flows","rms.issue.wa","approval.worklog.v1"],"sf":null,"tz":"Asia/Seoul","vt":{"type":"role","value":"atlassian-addons-project-access"},"ui":{"globalPagePath":null},"gen":0,"rev":2,
 "wr":{"v":1,"exp":1792454400000,"u":"MONTH","acd":3,"ls":true,"va":"WARN","r":{"pd":14,"fa":false,"cw":0,"ew":7,"xw":7,"dm":43200,"wm":187200},"wd":false,"pq":false,"hz":1730386800000,"cr":[[1785510000000,1788188400000,"C"],[1788188400000,1790780400000,"R"]],"ix":["10007"]}}
```

- `wa` 는 더 이상 싣지 않는다. 이 변경으로 구판 워크포스 서버의 F-1 근사 경로가 닫힌다.
- `ch` 는 `'APP'` 그대로다.
- I: 대상에는 `ix`·`ixa` 를 싣지 않는다. 이슈 예외 층은 `r`·`va` 등 값에 이미 병합돼 있다.
- 다음 경우에는 `wr` 칸이 없다. 이때 워크포스는 넘김으로 동작한다.
  - 권한층 만료(`assertAuthority` 실패)
  - 결재 설정·마감 행·정책 조회 실패
  - 마감 행 64개 초과
  - I: 대상의 projectId 를 모름
- `publicationVersion` = `linked-issue:3:{ctlRev}:{CTL_RX}:wr1`. 배포 뒤 첫 일일 scan 이 전량 touch 하며 `wa` 를 제거하고 `wr` 을 게시한다.

## 3. 바뀐 파일

**신규**
- `src/integration/workforce/writeGate.js` — 계약 파일(import 0)
- `src/integration/workforce/writeGateVectors.json` — 골든 158건
- `src/domain/worklogControl/writeRules.js` — `writeRulesOf`·`wrExpOf`·`writeViolationActionOf`·`WR_HORIZON_PERIODS`(=24)
- 테스트
  - `src/domain/worklogControl/__test__/writeRules.test.js`
  - `src/integration/workforce/__test__/writeGate.parity.test.js`
  - `src/integration/workforce/__test__/writeGateContract.test.js`
  - `src/integration/workforce/__test__/writeGateHarness.js`(헬퍼)
  - `src/integration/workforce/__test__/writeGateCases.js`(헬퍼)
  - `src/resolver/worklogControl/__test__/WorklogControlCtlWriteRules.test.js`
  - `src/resolver/worklogControl/__test__/WorklogControlHooksRules.test.js`
  - `src/resolver/worklogControl/__test__/ctlRulesCallSites.test.js`

**수정**
- `src/integration/workforce/contract.js`
  - 상수 `WR_VERSION`·`WR_TTL_MS`·`WR_BUCKET_MS`·`WR_CLOSE_ROWS_MAX`·`WR_ISSUE_EXCEPTIONS_MAX`·`WF_FRESH_GRACE_MS` 추가
  - `ctlWriteRulesValid` 추가
  - APPROVAL_CTL validator 에 `optional(b.wr, …)` 가산. `CONTRACT_VERSION` 1 유지
- `src/integration/workforce/vectors.json` — wr 이 실린 approval.ctl 서명 골든 1건을 끝에 추가
- `src/resolver/worklogControl/WorklogControlCtl.js` — `wr` 생산, `wa` 삭제, 배출 한 번(now) 단위 메모, `publicationVersion` 3판, `WR_AUTHORITY_KEYS`·`CTL_BODY_VERSION`
- `src/resolver/worklogPolicy/WorklogPolicyResolver.js` — `resolveTarget({projectId, issueId, issueRow}, {cache})` 추가. 연동 이슈 층을 넣지 않은 유효 정책을 낸다
- `src/resolver/worklogPolicy/WorklogPolicyRepository.js` — `issueOverridesOfProject({projectId, limit})`(프로젝트 단위 이슈 예외, ≤500+1 행)
- `src/resolver/worklogControl/WorklogControlHooks.js` — `ctlRulesChanged({projectId?, issueId?})`
- 호출 지점
  - `src/resolver/settings/SettingsService.js` — `WR_AFFECTING_KEYS` 가 patch 에 있을 때, `saveProjectPolicy`
  - `src/resolver/timesheet/PeriodCloseService.js` — `touchYear`: 마감·재개방
  - `src/resolver/timesheet/PeriodReopenService.js` — 수정 재개방 `finishClose` 뒤
  - `src/resolver/worklogPolicy/WorklogPolicyService.js` — `saveProject`·`saveIssue`
  - `src/resolver/worklogApproval/WorklogApprovalPolicy.js` — `saveConfig`
- `src/resolver/workforce/WorkforcePublisher.js` — `drainCtl` 에 `DOC_SIZE_LIMIT` 초과 시 `PUBLISH_TOO_LARGE` 가드 추가(flows 와 같음)
- `src/resolver/worklogControl/WorklogControlDetector.js` — F-5 주석 교체
- i18n `workforce.writeChannel`: `locales/kr/workforce.json`·`locales/en/workforce.json`. 설계 §12 문구 그대로이고 `npm run merge` 를 실행했다(ko-KR/en-US 는 gitignore 대상)
- `.gitattributes` — 2줄
- 기존 테스트 수정(이번 결정 때문에 기대값이 바뀐 것)
  - `WorklogControlCtl.test.js`: 3판 버전, wa 없음·wr 있음
  - `linkedIssueContract.test.js`·`linkedModeContract.test.js`: 골든 위치를 고정 인덱스로. 끝에 wr 골든이 붙었기 때문
  - **리더 작업 트리의 미추적 `src/resolver/worklogPolicy/__test__/LinkedCtlImmediate.e2e.test.js`**: `wa` 단언을 `wr` 존재·`wa` 부재로 바꾸고, wr 저장 계층 가짜를 주입했다

손대지 않은 것: `src/resolver/inbox/*`, `ApprovalAdminService.js`, `ApprovalService.js`, `static/ui/**`, `locales/*/inbox.json`·`worklogApproval.json`.

## 4. 재게시 훅 `ctlRulesChanged` 동작

1. `isWorkforceLinkEnabled()` 가 false 면 `{skipped:true}` 로 끝난다(KVS 1, SQL 0, 큐 0).
2. `publisher.resetCtlScan()`(KVS delete) → 다음 workforce 작업의 `scanCtl` 이 전 대상을 touch 한다. 배출이 wr 을 다시 계산하고, 내용이 같으면 PUT 하지 않는다.
3. projectId·issueId 가 있으면 `rms.policy` 수신 행을 SQL 1회로 조회한다. **이미 VERIFIED 인 대상만** `publishCtlNow` 로 즉시 게시한다.
   - 요청당 상한은 `CTL_IMMEDIATE_PER_INVOCATION`(3)이다. `ctlTargetChanged` 와 같은 할당량 키를 공유한다.
   - 요청 스코프 밖이면 touch 만 한다.
4. `pushSweepJobs(approval-sweep-queue, [{job:'workforce', round:0}])` 를 넣는다. 기존 큐·consumer 를 그대로 쓴다.
5. 던지지 않는다. 실패하면 `{failed:true}` 와 로그만 남긴다.

반환 shape: `{skipped:true}` | `{queued:true, immediate:[{entityId, touched, published, failed, deferred?}]}` | `{failed:true}`. 호출부는 결과를 사용자 응답에 싣지 않는다.

## 5. 테스트 결과

`npm test -- --runInBand` 결과: **Test Suites 201 passed / 201, Tests 3008 passed / 3008**. 실패 0이다.

| 테스트 | 내용 |
|---|---|
| `writeGate.parity.test.js` | 골든 158건 + 시드 고정 무작위 2,000건. 규칙은 설계 §3.3 보다 엄하다(아래 참고). 2,000건 분포 ALLOW>100·DENY>150·DEFER>150. 골든 파일 = 생성기 결과(바이트 안정), 파일 재현 |
| `writeGateContract.test.js` | wr validator 양·음 21종, v≠1 관용, 상수 값, vectors.json wr 골든(메시지 바이트·서명 재생성), writeGate import·require·Date.now·CR 0, DenyCode=ErrorCodes·PROVEN_ORIGINS 동일, 지역 시간 함수 = 도메인(5 타임존 × 14개월 매일 × 2 단위 × autoClose 4종, Lord_Howe 30분 DST 포함), 판정 불가 입력 → DEFER, **용량**: 최악 ctl(cr 64·ix 500·경로 256·tz 64)이 30,000B 이하이고 16,000B 미만 |
| `writeRules.test.js` | exp 버킷(같은 버킷 동일, 경계 +3일, 여유 ≥4일), hz = CLOSE_RANGE_PERIODS, EXTRA_STEP→WARN, cr 필터·정렬·'C'/'R'·65행→null, ix 정렬·중복 제거·501→ixa, pq(연동 층 제외·required), 생산 대조, validator 통과 |
| `WorklogControlCtlWriteRules.test.js` | P:/I:/ix/ixa/권한층 만료·설정 조회 실패·행 초과 → wr 없음, **resolveOne 유효값 대조**(EXTRA_STEP 포함), 3일 버킷 본문 동일, SQL 예산(같은 now 의 대상 3건 = 마감 1·결재 설정 1·예외 1·프로젝트 1·P: 수신 1, I: 대상 추가 0), now 바뀌면 재조회, 대상 0 → SQL 0 |
| `WorklogControlHooksRules.test.js` | 단독 모드 0, 사이트 사건, VERIFIED 대상만 즉시 게시, 상한 공유, 스코프 밖 touch 만, 던지지 않음, 형식 오류 id 무시 |
| `ctlRulesCallSites.test.js` | SettingsService(키 6종 → 호출, 무관 키 → 없음, 프로젝트 정책), PeriodCloseService.touchYear, WorklogPolicyService saveProject·saveIssue·실패 시 미호출, WorklogApprovalPolicy.saveConfig |
| 기존 | `idleSqlBudget.test.js` 무변경 통과(빈 상태 상한 그대로), `permissionMap.contract.test.js` 통과(resolver 추가 없음) |

**parity 비교 규칙(구현):**
- ① D1~D6 중 하나라도 해당하면 writeGate 는 명세 순서상 **첫 사유**로 DEFER 해야 한다.
- ② 그렇지 않고 승인 앱이 DENY 면 writeGate 도 DENY 이고, 코드·cause(`which`·`reasonCode`·`periodKey`, 창은 `which`·`status`)까지 같아야 한다.
- ③ 승인 앱에 BLOCK 공지가 있으면 DEFER `POLICY_BLOCKED` 이고 공지가 같아야 한다. 상한 합계가 필요하면 DEFER `LIMIT_NEEDS_TOTAL` 이다.
- ④ 나머지는 ALLOW 이고 WARN 공지가 같아야 한다.

**입력 생산:** 실제 생산자로 만든다.
- `mergePolicy`(사이트 원본은 `legacyPolicy`)
- `writeRulesOf`
- v1 문서 `entryBodyOf` → own: 문서 왕복
- 인증 문서 `certEntryBodyOf` → `certOfBody`: 문서 왕복
- 연동 이슈 `wa.closeDays` 는 `mergePolicy` 의 linkedIssue 층으로 승인 앱 쪽을 계산한다

**재생성:** `WRITE_GATE_REGEN=1 npx jest src/integration/workforce/__test__/writeGate.parity.test.js src/integration/workforce/__test__/writeGateContract.test.js`. vectors.json 은 wr 골든이 없을 때만 덧붙인다.

## 6. 설계와 다른 점

1. **재게시 훅이 `ctlRev+1` 을 하지 않는다.**
   - 대신 `resetCtlScan`(KVS)·대상 즉시 게시·workforce 큐 1건을 쓴다.
   - 이유: ctlRev 는 본문 `rev` 에 들어가므로, 올리면 규칙이 안 바뀐 대상까지 **전량 PUT** 한다(§13 "바뀐 대상만 PUT" 과 충돌).
   - 워터마크 삭제만으로도 다음 scan 이 전량 touch 하고, 배출은 내용이 같으면 PUT 을 생략한다.
2. **호출 지점 2곳 추가.**
   - `SettingsService.saveProjectPolicy`: 설정 화면의 프로젝트 정책도 같은 층을 바꾼다.
   - `PeriodReopenService`: 수정 재개방 경로는 `touchYear` 를 거치지 않는다. 기존 `publishWake` 는 `finishClose` **전에** 불려 'C' 가 남을 수 있어서 `finishClose` 뒤에 한 번 더 부른다.
3. **wr validator 의 판 관용.**
   - `v===1` 이면 닫힌 키 집합으로 엄격하게 검사하고, 틀리면 ctl 전체가 무효다(설계대로).
   - `v≠1` 이면 문서를 살리고 `wrFreshAt` 이 wr 만 버린다.
   - 이유: 나중에 wr 판을 올릴 때 구판 워크포스의 **넘김까지** BLOCKED 로 막히지 않게 하려는 것이다.
4. **`ix` 원천.**
   - `exceptionIssueIds`(결재선 지정 행 포함)를 재사용하지 않았다.
   - `issueOverridesOfProject` 로 프로젝트 이슈 예외를 한 번에 읽고, **쓰기 판정 키(WR_AUTHORITY_KEYS 12개, approvalMode 포함)를 바꾸는 행 + 깨진 행**만 넣는다.
   - 결재선 지정만 있는 이슈가 불필요하게 넘김되지 않는다.
   - 같은 묶음을 I: 대상의 이슈 예외 층으로도 써서 I: 대상당 SQL 을 0으로 만들었다.
5. **`resolveProject` 대신 `resolveTarget`.**
   - P:/I: 를 함께 처리하고 연동 이슈 층(rms.issue)은 넣지 않는다. 그래서 `acd` 는 `wa.closeDays` 적용 전 값이고, `pq` 는 pa 를 반영하지 않는다(설계 의도).
   - I: 대상은 bodyFor 첫 SQL 이 읽은 수신 행을 재사용한다.
6. **SQL 예산.** 일일 scan 의 wr 계산은 `1(마감 행) + 4 × 연동 프로젝트(프로젝트 정책·P: 수신 행·결재 설정·이슈 예외)` 다. 설계 추정은 `+1 + 2×` 였다.
   - 프로젝트 20개 기준 ≈ +81/일이다. I: 대상 수와는 무관하다.
   - 대상 0 → 0 은 테스트로 고정했다.
7. **writeGate 세부.**
   - `own` 엔트리에 선택 `periodKey` 를 받는다. 사유의 periodKey 에 쓴다. 마감 행은 `[start,end]` 가 정확히 한 기간이면 그 키를 되찾고, 아니면 null 이다.
   - 같은 시각을 덮는 마감 행이 둘 이상(단위 혼합)이면 승인 앱도 SQL 행 순서로 하나를 고른다. 이 경우 사유 periodKey 는 후보 중 하나면 같다고 본다.
   - `cert:null` 은 DEFER `NOT_OBSERVED` 다. 문서 404 는 `certOfBody(null)` 로 넘겨야 freshOwn 유예가 산다.
   - `edit` 에 `prevStarted` 가 없으면 DEFER `DOC_UNREADABLE` 이다.
8. **`drainCtl` 크기 가드 추가.** 용량 테스트상 도달할 수 없지만 방어용이다.

## 7. 미검증 → `04_spike_todo.md` 후보(배포 후 리더 실측)

| # | 항목 | 확인 방법 |
|---|---|---|
| U-3 | wr 포함 ctl PUT, 3일 버킷 재서명 | 배포 뒤 첫 일일 tick 후 `GET /rest/api/3/project/{id}/properties/movesApproval.ctl` → `value.wr.exp` 가 `floor(now/3d)*3d+7d` 이고 `wa` 가 없음 |
| U-4 | 규칙 저장 → workforce 큐 → scanCtl 재게시 | 설정에서 `timesheetBackdateMaxDays` 변경 또는 기간 마감 → 수 분 안에 같은 GET 의 `wr.r.pd`·`wr.cr` 반영. 연동 프로젝트 이슈 예외 저장 → 즉시(같은 호출) P: 문서 `wr.ix` 반영 |
| U-5 | 두 런타임 Intl 동일 | 워크포스 CI 가 `writeGateVectors.json` 158건을 통과(DST·53주 포함) |
| — | 구판 워크포스 + 신판 승인 앱 | 승인 앱만 배포한 상태에서 워크포스 모달 → 넘김(F-1 닫힘, `wa` 없음) |

## 8. 발견(범위 밖 — 고치지 않음)

1. `PeriodReopenService` 의 기존 `publishWake` 가 `finishClose`(행 REOPENED 전환) **전에** 불린다. 그 tick 이 먼저 돌면 v1·cert 문서가 '마감'으로 게시된 채 다음 일일 scan 까지 남을 수 있다(안전한 쪽). wr 은 이번 변경에서 `finishClose` 뒤 훅으로 보완했다.
2. 프로젝트가 `ALL_ISSUES` 인데 이슈만 `ctl:'NONE'` 으로 해제된 경우가 엇갈린다.
   - 승인 앱: I: ctl 문서를 지우고 그 이슈를 비연동으로 본다.
   - 워크포스: 이슈 ctl 이 없으면 프로젝트 ctl(basis PROJECT)로 판정할 수 있다.
   - 이때 승인 앱 쪽은 연동 규칙(설정 창 등)을 적용하지 않으므로 판정 기준이 다를 수 있다. 워크포스 `LinkedWriteGate` 가 "해제된 이슈 = 비연동(W1/W2)"으로 다루는지 확인이 필요하다.
3. `WorklogControlCtl` 의 vt 기본값이 `parseTarget('')` 이라 `{type:'role', value:'atlassian-addons-project-access'}` 로 게시된다(기존 동작). 워크포스 D4(`visibilityControlled`)는 이 값으로 대조하므로 기존 그대로 두었다.

## 코덱스 반영 (2026-10-14, 리더 기록 — 에이전트의 파일 쓰기가 막혀 보고 내용을 옮김)

- 검증: 백엔드 207 스위트 / 3,068 테스트, UI 94 / 828 통과, `npm run build:ui` 성공. contract.js sha1 = `020622effbdec63a3b0a4d8ec5e26c1e24e3a00e`(§1 표의 옛 값 95b508… 대체, 워크포스 사본 동일). writeGate.js·writeGateVectors.json·vectors.json 불변.
- 수정 전 확인: 타임시트 제출·팀장 일괄 승인은 v1 문서를 아웃박스에 표시만 하고 깨우지 않았고, 단건 결정·회수는 표시조차 없었다(일일 변경 스캔 의존) → 제출 직후 공백 최대 하루(P1-2 실재).
- P1-1·P1-2 즉시 재게시: `WorkforcePublishWake` — 기존 `workforce` 큐에 `{event:1}` 작업(15초 디바운스, 일일 대조 없이 publishNow, 리스 실패 시 1회 재투입). 깨우는 곳: touchMany·touch·touchYears·touchCertYears 직후, `TimesheetTargetAdapter.afterDecide`(단건 결정), `notifyExternal` CANCELLED(회수), ctl 상한 초과·요청 범위 밖·게시 실패, `ctlRulesChanged`. 동기 3건 상한은 ctl 만.
- P1-1·P1-2 사후 감지: `WorklogControlDetector` 가 WORKFORCE·WF_CHANGED 작성·수정을 자동 접수 전에 재판정(`domain/worklogControl/ruleViolation.js`, 기존 evaluateWorklogLock·인증/승인 잠금·mutationNotices BLOCK·LINKED_WINDOW). 쓰기 시각 기준(쓰기 뒤 생긴 마감·제출로 오탐하지 않음, `findLatestCovering` 에 기존 `updated_at` 읽기 추가). 위반 = `foreign_state=FLAGGED`, `foreign_reason=RULE_VIOLATION`(새 칼럼 없음) → Work log 탭 "규칙 위반 입력" 배지, 이력 사유, 팀장 인증 신호 비트 512·인증 불가(`WORKLOG_RULE_VIOLATION`), 자동 접수 중지(`EXPLANATION_REQUIRED`), 소명은 기존 흐름(사유 필수, 기간 잠금 중에도 접수), 인증 문서 엔트리 e[5]=INVALID 로 워크포스 집계 0(계약 길이 불변). SQL: 워크포스 출처 쓰기 이벤트당 약 +8, 유휴 +0(유휴 예산 테스트에 이벤트 작업 블록 추가).
- P1-5 관문 근거: 기록에 `evidence: DEV_MEMO | MEASURED`(옛 기록 = DEV_MEMO). `getAppContext().environmentType` 가 PRODUCTION 또는 불명이면 운영 — 운영에서는 DEV_MEMO 불인정(스위치 저장·삭제 준비·작성 시 숨김 관문). `GateDiagnostics` 근거 선택·배지·운영 배너, kr/en + merge.
- P2-9: controlDoc·flowsDoc·approvalDoc·certificationDoc 를 봉투 전체 UTF-8 바이트로 측정(한글 255자 그룹 이름 테스트). P2-10: controlDoc.js 머리 주석·contract.js:48 현행화.
- P2-6: 동작 불변(팀장은 상위 팀장 있어도 본인 지정 가능, 팀원은 불가) — 주석 + 테스트 2건.
- 실측 필요: 이벤트 큐 지연(제출·결정·회수 뒤 v1 `st` 반영 시간), 개발 사이트 `environmentType` 실제 값, 사후 감지 전 흐름(ctl 재게시 전 마감 → 워크포스 작성 → 배지·자동 접수 없음·e[5]=INVALID → 소명 승인 → 집계 복귀).
- 범위 밖: 자동 접수 재시도 후보가 규칙 위반 행을 매 순환 다시 읽음(소량). 워크포스가 "규칙 위반"을 별도 문구로 보이려면 인증 엔트리 칸 추가 필요(워크포스 선배포 후속).
