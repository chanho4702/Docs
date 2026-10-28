# workforce-input-reopen — 워크포스 구현 보고(T-W1~T-W7)

> 2026-10-14 · 대상 리포 `C:\CloudJira\moves-workforce`(RFC-220 + linked-mode-fix 미커밋 변경 위에 이어서) · 커밋·배포·터널 조작 없음
> 입력: `01_architect_design.md` 전부, `00_input/requirement.md`(결정 절 포함)

## 1. 결과 요약

- 워크포스 4화면(마이워크·프로젝트 캘린더 공용 모달의 단건 작성·기간 입력·수정·삭제, 두 캘린더 드래그)이 연동 이슈에서 **입력 폼으로 돌아왔다**. 단 승인 앱 통제 문서에 `wr` 가 있고 만료 전일 때(gated)만 열린다.
- 저장 허가는 실행 resolver(`createIssueWorklog`·`updateIssueWorklog`·`deleteIssueWorklog`)가 매번 `writeGate.judgeLinkedWrite` 로 다시 판정한다. 결과별 처리:
  - ALLOW: asUser 로 저장한다(작성은 기존 `movesRms.origin` 봉투 그대로).
  - DENY: 승인 앱과 같은 코드로 거부한다.
  - DEFER: 저장하지 않고 넘김 코드와 승인 앱 경로를 준다.
- F-1(`wa` 기반 직접 수락·근사 검사)과 F-2(36시간 iat 검사)는 **삭제**했다. 구판 ctl(`wa` 만 있고 `wr` 없음)은 작성·수정·삭제 모두 넘긴다.
- 계약 파일 4종(`contract.js`·`writeGate.js`·`vectors.json`·`writeGateVectors.json`)은 승인 앱 원본과 **바이트 동일**하다(§6).
- 검증 결과:
  - 백엔드 180 suites / 2,749 tests 통과
  - 프론트 167 / 2,665 통과
  - `build:app`·`bundle:check` 통과
  - `forge lint` No issues
  - locales·미추적 파일 sha1 불변

## 2. 바뀐 파일

### 계약(승인 앱에서 바이트 복사)
| 파일 | 내용 |
|---|---|
| `src/integration/approval/contract.js` | 수정. `wr` validator(`ctlWriteRulesValid`, 닫힌 키 집합, v≠1 은 문서를 살리고 소비 쪽이 버림), `WR_*`·`WF_FRESH_GRACE_MS` 상수 |
| `src/integration/approval/writeGate.js` | 신규. 판정 계약, import 0 |
| `src/integration/approval/writeGateVectors.json` | 신규. 골든 벡터 |
| `src/integration/approval/vectors.json` | 수정. `wr` 이 실린 ctl 서명 골든 1건 추가 |

### 백엔드
| 파일 | 내용 |
|---|---|
| `src/integration/approval/controlDoc.js` | `control.wr` 노출, `wa` 노출 제거, 머리 주석 갱신 |
| `src/integration/approval/timesheetDoc.js` | **신규**. v1 `movesApproval.{YYYY}` 검증 읽기(§7.3). 엔트리 하나라도 실패하면 문서 전체 실패, 404 는 `[]` |
| `src/resolver/approvalLink/LinkedWriteGate.js` | **신규**. 아래 두 함수 |
| `src/resolver/approvalLink/IssueWorklogControlService.js` | 아래 표 |
| `src/domain/approvalLink/writeChannel.js` = `static/ui/src/components/worklog/writeChannel.js` | WG 행 추가(`ctl.verified ∧ ctl.gated → DIRECT`). 두 파일은 글자까지 같다 |
| `src/utils/errors/ErrorCodes.js` | `WORKLOG_PERIOD_LOCKED`·`WORKLOG_CERTIFIED_LOCKED` 상수 |

`LinkedWriteGate.js` 의 두 함수:
- `gatedOf(link, now)`: 연동 ∧ `wrFreshAt` ∧ 서명 키 준비.
- `judgeLinkedWriteFor({op, issue, link, accountId, cloudId, now, next, worklog})`: 자기 rms.issue, 본인 v1·cert 문서, freshOwn, visibility 를 모아 `judgeLinkedWrite` 를 부른다.

`IssueWorklogControlService.js` 변경:
| 부분 | 변경 |
|---|---|
| `creationState` | `createChannel` 특례(F-1) 삭제. `gated` 를 계산해 `writeChannelOf` 에 넘기고 응답에 싣는다 |
| `createIssueWorklogService` | F-1·F-2 블록 삭제. `dryRun` 지원. 연동 이슈는 판정 뒤 저장. 봉투를 만들 수 없으면 DEFER `SIGNER_UNAVAILABLE` |
| `assertDirectEdit` | 통제 문서를 먼저 조회한다. 대상 워크로그는 `?expand=properties` 로 GET 한다. gated 면 `judge('edit'\|'delete')` 를 부른다 |
| 수정·삭제 실행 | gated 에서 Jira 가 403·401 을 주면 넘김으로 처리한다 |

### 프론트(`static/ui/src`)
| 파일 | 내용 |
|---|---|
| `components/worklog/approvalHandoff.js` | 대응표 확장(§12.2, 기존 키만). 신규 `approvalWriteErrorOf(error)` → `{key, path, openKey, kind:'DENIED'\|'HANDOFF'\|'UNCONFIRMED'}` |
| `components/worklog/worklogMoveGuard.js` | `channelOfWriteError` 가 DENY 4코드와 넘김 2코드를 받는다. DENY 는 `channel:'DENIED'`+`key` 이고 캐시를 유지한다. `notifyBlockedMove` 는 DENY 면 사유 토스트와 "승인 앱에서 수정" 동작을 띄운다 |
| `components/worklog/worklogWrite.js` | `createWorklog({…, dryRun})` 전달 |
| `pages/myWork/modal/WorklogModal.jsx` | 아래 목록 |

`WorklogModal.jsx` 변경:
- gated 이슈는 서버 `writeChannel=DIRECT` 이므로 폼이 그대로 열린다.
- 거부·넘김이면 사유 문구와 "승인 앱에서 열기/기록" 버튼(서버 `cause.path`)을 보인다. 이 버튼은 선택 이슈에 묶여 있다.
- 기간 입력(Q2 a)은 `addLinkedRange` 로 처리한다:
  1. 날짜마다 dryRun 판정을 받는다.
  2. 하나라도 거부되면 저장하지 않는다. 사유와 거부된 날짜를 보인다.
  3. 모두 통과하면 순차 저장한다.
  4. 도중에 실패하면 되돌리지 않고 남은 날짜를 보인다.
- `remainingHandoffDates`·첫 날 넘김은 ¬gated HANDOFF 에서만 쓴다.

### 테스트
| 파일 | 내용 |
|---|---|
| `src/integration/approval/__test__/writeGate.test.js` | **신규**. §7.1 케이스 1~16, D1~D6·J1~J5, 골든 벡터 전부 실행 |
| `src/integration/approval/__test__/timesheetDoc.test.js` | **신규**. 정상·404·빈 문서·ent 복사·cloud·미신뢰 키·부분 변조 |
| `src/resolver/approvalLink/__test__/LinkedWriteGate.test.js` | **신규**. gatedOf, 서명 문서 판정, resolver 통합(아래) |
| `src/integration/approval/__test__/vectors.test.js` | 골든 위치 고정(slice 11–15·15–18 — 승인 앱과 같게), `wr` ctl 골든 검증, SYNCED 에 writeGate.js·writeGateVectors.json 추가, 지문 갱신 |
| `src/integration/approval/__test__/testKeys.js` | v1 문서 빌더 `timesheetDocValue` |
| `src/resolver/approvalLink/__test__/IssueWorklogControlService.test.js` | 응답 `gated:false`, 대상 GET URL `?expand=properties` |
| `src/domain/approvalLink/__test__/writeChannel.test.js`, `static/ui/src/components/worklog/__test__/writeChannel.test.js` | WG 행 |
| `static/ui/src/components/worklog/__test__/approvalHandoff.test.js` | `approvalWriteErrorOf` |
| `static/ui/src/pages/myWork/modal/__test__/WorklogModalSpaceFilter.test.jsx` | gated 화면 복귀. 거부·넘김 문구와 열기. 기간 선판정 거부·전부 통과·도중 실패. 수정 거부 |
| `static/ui/src/__test__/linkedNoDirectWrite.test.jsx` | gated 드래그 실행, 거부 3종 revert·토스트·열기, DEFER 넘김. 정적 검사 추가: 화면 코드의 Jira 워크로그 REST 직접 POST/PUT/DELETE 0 |

`LinkedWriteGate.test.js` 의 내용:
- gatedOf: 신판·구판·만료·미연동·서명 키 없음.
- 서명 문서 판정:
  - v1 문서: 제출 기간 DENY, 서명 실패·읽기 실패는 DEFER, 연 경계 인접 연도 읽기.
  - rms.issue: 작성 기간 DENY, 서명 깨짐은 DEFER.
  - wd 필드 읽기.
  - cert 문서: APPROVED·MISMATCH·PENDING, 출처 미증명, 미관찰.
  - Q5 freshOwn: 10분 안·밖·남·변조.
  - CONTROLLED.
- resolver 통합: create/update/delete × {구판 HANDOFF, 신판 ALLOW, DENY 4종, DEFER 6종, 숨김 404, 403}, dryRun POST 0.

## 3. 판정 흐름

```
화면: getIssueWorklogControl → writeChannel (gated 면 DIRECT = 폼 열기만)
저장: createIssueWorklog / updateIssueWorklog / deleteIssueWorklog (asUser)
  1 이슈 asUser 읽기(properties: ctl·policy·movesRmsLink·rms.issue)
  2 ApprovalControlLookup.forIssue → 서명 검증된 ctl (wr 포함)
  3 creationState → writeChannel
      HANDOFF(¬gated, 구판 ctl·wr 만료·서명 키 없음) → *_HANDOFF_REQUIRED {path}   ← 지금과 같음
      BLOCKED → WORKLOG_LINK_UNCONFIRMED
      DIRECT ∧ 비연동 → 종전 그대로 저장
      DIRECT ∧ 연동(gated) ↓
  4 (수정·삭제) 대상 워크로그 GET ?expand=properties → issueId·id·작성자 대조. gated 에서 403/404 면 DEFER CONTROLLED
  5 LinkedWriteGate.judgeLinkedWriteFor
      · 자기 rms.issue(verifyOwnIssueSetting) — 있는데 서명 실패면 DEFER DOC_UNREADABLE
      · wd ∧ s/e 없음이면 이슈 duedate·sf asUser
      · 본인 v1 movesApproval.{YYYY} asUser(연 경계 ±7일이면 인접 연도도). 404=제출 없음, 그 밖의 실패 → DEFER
      · 수정·삭제: 본인 cert movesApproval.cert.{YYYY-MM}(원래·새 날짜 달) → writeGate.certOfBody, 두 달이면 엄한 쪽 합침
      · freshOwn: 워크로그의 movesRms.origin 을 자기 키로 검증 + cloud·issue·author 일치 + created 10분 안
      · visibilityControlled: visibility == ctl.vt
      → writeGate.judgeLinkedWrite (D1~D6 → J1~J5)
  6 ALLOW → dryRun 이면 반환 / 아니면 POST(+봉투)·PUT·DELETE
    DENY  → 같은 코드 {path, ...cause}
    DEFER → WORKLOG_CREATE_HANDOFF_REQUIRED / WORKLOG_EDIT_HANDOFF_REQUIRED {path, reason}
  7 (gated) PUT/DELETE 가 403·401 → WORKLOG_EDIT_HANDOFF_REQUIRED {path, reason:'CONTROLLED'}
```

구판·신판 호환은 설계 §5.1 표대로 동작하고, 테스트로 고정했다.
- 구판 승인 앱(wa 만): HANDOFF.
- 신판(wr): gated 판정.
- wr 만료: HANDOFF.
- 서명 키 없음: HANDOFF.

## 4. 응답 shape

| resolver | 성공 | 실패 code(cause) |
|---|---|---|
| `getIssueWorklogControl` | 기존 + `gated:boolean`. `createChannel`=`writeChannel`(옛 번들 호환) | 기존 |
| `createIssueWorklog` | `{id, issueId, signed, approvalStatus?:'PROCESSING'}`. `dryRun:true` 면 `{dryRun:true, verdict:'ALLOW', notices}`(POST 없음) | DENY 4종 `{path, which?/reasonCode?/periodKey?/status?/state?}`, `WORKLOG_CREATE_HANDOFF_REQUIRED {path, reason?}`, `WORKLOG_LINK_UNCONFIRMED`, 기존 입력·Jira 오류 |
| `updateIssueWorklog` | `{worklog}` (무변경) | DENY 4종 `{path, …}`, `WORKLOG_EDIT_HANDOFF_REQUIRED {path, reason?}`, 기존 |
| `deleteIssueWorklog` | `{deleted:true}` (무변경) | 같음 |

- `path`:
  - 작성: `createHandoffPathOf`(날짜·시작~종료 프리필)
  - 수정·삭제: `handoffPathOf`
  - 경로를 모르면 null
- `reason`: DEFER 사유(진단용). 화면은 `code` 로만 문구를 고른다.

## 5. 화면 문구 대응(기존 키만, Q3)

| 서버 code | 문구 키 | 버튼 |
|---|---|---|
| `WORKLOG_OUTSIDE_ISSUE_WINDOW` | `issuePanel.approval.error.outsideWindow` | `issuePanel.approval.handoff.open` |
| `WORKLOG_WINDOW_UNRESOLVED` | `issuePanel.approval.error.windowUnresolved` | 같음 |
| `WORKLOG_PERIOD_LOCKED`·`WORKLOG_CERTIFIED_LOCKED` | `issueApprovalSetting.lockHint` | 같음 |
| `WORKLOG_CREATE_HANDOFF_REQUIRED` | `issuePanel.approval.create.required` | `issuePanel.approval.create.open` |
| `WORKLOG_EDIT_HANDOFF_REQUIRED` | `issuePanel.approval.handoff.description` | `issuePanel.approval.handoff.open` |
| 드래그 DENY | 위 사유 키(오류 토스트) | `issuePanel.approval.edit.open` |
| 드래그 DEFER | `issuePanel.approval.move.handoff` | `issuePanel.approval.edit.open` |

기간 입력 문구:
- 거부: `{사유 문구} (날짜, …)`.
- 도중 실패: `worklog.error.saveFailed (남은 날짜, …)`.

## 6. 계약 파일 동일성(승인 앱 원본 대조, diff 0)

| 파일 | sha1(원시 바이트, 두 리포 같음) | sha256(LF, SYNCED 표) |
|---|---|---|
| `writeGate.js` | **e5a057907b66129ef01104fe8bc738d5257b7f5c** | c0989af371d241ca97932544606e4f396b4ef6412cdc6549b8a7ebd21f468073 |
| `writeGateVectors.json` | 2039cda3d42117b595b2b2c036ccabf18d145cf0 | d29c31524f73c4b9876c7128c9651678ec8f993aeaf80e39c48bd16c6c90af24 |
| `contract.js` | 95b508fb0ec68258d9bf980f575de20aaa5ec6fc | 4a04015a21bfc01b53c5547a54713e198e879261338f4e871e83738e3e5a81ca |
| `vectors.json` | 3bb52e4497538a2d06f475b0623454984daa97e2 | f86bd0f21f49a349254dbbfecf58328b57e9fe398520089aa3667d1259eab5d1 |

- base64url·canonical·ed25519·keyring·signature 도 같다.
- `vectors.test.js` 의 "승인 앱 리포와 계약 파일 동일(로컬 전용)" 이 9개를 대조하며 통과한다.
- **주의**: 승인 앱 에이전트가 이 파일들을 다시 고치면 워크포스 쪽을 다시 복사하고 SYNCED 지문을 갱신해야 한다. 로컬 대조 테스트가 차이를 잡는다.
- 처음에는 원본이 없어 설계서 명세로 초안을 만들었다. 원본이 나온 뒤 초안을 버리고 원본을 그대로 채택했다.

## 7. 테스트·빌드·lint

| 항목 | 결과 |
|---|---|
| 백엔드 `jest`(루트) | 180 suites / 2,749 passed |
| 프론트 `jest`(static/ui) | 167 suites / 2,665 passed |
| `npm run build:app` | 성공 |
| `npm run bundle:check` | main.js gzip 494,935 B / 예산 950,000 → withinBudget |
| `forge lint` | No issues found(PermissionLinter "Unknown product" 경고는 기존) |
| 보호 파일 sha1(작업 중 기록 → 빌드 뒤 재확인) | `locales/en-US.json` db11b147…, `locales/ko-KR.json` 9accd802…, `custom-scopes.yaml`, pptx 3종, `캡처.png`, `LeaderTeamBackfill.test.js` 모두 OK(불변) |

- `npm run build` 는 `prebuild` 가 merge 로 locales 를 다시 쓰므로 실행하지 않았다.
- locales 의 git `M` 표시는 작업 전부터 사용자가 바꾸던 상태다.
- 바뀐 UI 파일은 CRA eslint 설정으로 확인했다. 오류 0이고, 경고 3건은 기존 effect 의존성 경고다.

## 8. 설계와 다른 점

1. **writeGate API 이름**: 승인 앱 원본을 따랐다.
   - 이름: `Verdict`·`DenyCode`·`certOfBody`·`closesOfWr`.
   - 원본은 던지지 않고 예외를 DEFER 로 바꾼다.
   - 원본은 `cert.truncated` 를 엔트리 유무와 상관없이 DEFER 로 본다(설계 표보다 엄하다).
2. **cert 해석**: 원래 날짜·새 날짜의 달이 다르면 두 문서를 각각 `certOfBody` 로 해석한 뒤 합친다. entry 는 처음 찾은 것, certified·truncated 는 하나라도 참이면 참(엄한 쪽)이다.
3. **숨긴 기록**: gated 이슈에서 대상 워크로그 GET 이 403·404 면 입력 오류 대신 DEFER(`CONTROLLED`) 넘김이다(설계 §6.2 "D4 또는 404 → DEFER" 구체화). 비연동은 종전처럼 입력 오류다.
4. **freshOwn**: 설계 조건(자기 키 검증 + 10분)에 몇 가지를 더했다.
   - 봉투 `kid`=자기 kid.
   - `cloudId`·`issueId`·`authorId` 일치.
   - 미래 `created` 5분 허용.
5. **v1 연도 후보**: `periodKeyOf(t, wr.u)` 의 연도와 `t±7일` 의 현지 연도를 합쳤다. 보통 1회, 연말·연초 경계에서 2회 GET 이다.
6. **`approvalStatus:'PROCESSING'`**: 조건을 "스위치 ON" 에서 "스위치 ON ∨ 연동 이슈"로 넓혔다. gated 는 스위치 OFF 에서도 열린다(D-1).
7. **dryRun**: 비연동 DIRECT 에서도 POST 없이 ALLOW 를 반환한다. 화면은 gated 에서만 dryRun 을 쓴다.
8. **기간 입력 거부 문구**: 기존 키 뒤에 날짜 목록을 붙인다(새 키를 추가하지 않는다).
9. **문서 미갱신**: 워크포스 `AGENTS.md` ⑧ "쓰기 실행기 없음·쓰기 창구 통일" 문단과 끝 절 "생성은 … `wa` 지원 신호가 있어야" 는 이제 사실과 다르다. 범위(T-W1~7) 밖이라 고치지 않았다. 문서 정리 때 함께 갱신해야 한다(설계 §15 "문서").

## 9. 미검증(실측 필요)

| # | 항목 |
|---|---|
| U-1 | 워크포스 resolver 가 asUser 로 **본인** `movesApproval.{YYYY}` 사용자 프로퍼티를 GET 할 수 있는가(본인 제출 잠금) |
| U-6 | 워크포스 모달 작성 → 승인 앱 트리거가 봉투로 WORKFORCE 판정 → 자동 접수·기본 승인자(완료 기준 1) |
| U-7 | 승인 앱이 숨긴 기록·권한 스킴 회수 사이트에서 asUser GET/PUT/DELETE 의 실제 상태 코드(403/404 → DEFER 매핑) |
| 신규 | 단건 워크로그 GET `…/worklog/{id}?expand=properties` 가 `movesRms.origin` 을 돌려주는가(Q5 freshOwn 근거). 안 돌려주면 freshOwn 은 항상 false 가 되어 방금 쓴 기록 수정은 DEFER(넘김)로 안전하게 떨어진다 |
| 신규 | 승인 앱 신판 배포 전(wr 미게시)에는 화면 변화가 없다. 배포 순서는 워크포스 → 승인 앱 |
| 실측 | 완료 기준 거부 3종(팀장 작성 기간 밖 / 승인된 기록 수정 / 마감 기간 작성)을 개발 사이트에서 확인 |

## 10. 검증 후 수정(03_verify_report F1·F2)

### F1 — 워크포스 `.gitattributes` 에 writeGate 두 파일 eol=lf 고정
- 승인 앱 `.gitattributes` 와 같은 형식으로 2줄을 추가했다.
  ```
  src/integration/approval/writeGate.js text eol=lf
  src/integration/approval/writeGateVectors.json text eol=lf
  ```
- `vectors.test.js` 에 테스트를 더했다. 기존 비교는 LF 로 정규화하므로 줄끝 차이를 잡지 못한다.
  - 두 파일은 작업 트리에 CR 0.
  - `.gitattributes` 에 위 2줄이 있다.
  - (로컬 대조) 두 파일의 **원시 바이트 sha1** 이 승인 앱 원본과 같다.
- writeGate.js sha1 은 두 리포 모두 e5a057907b66129ef01104fe8bc738d5257b7f5c 로 변동 없다.

### F2 — ALL_ISSUES 프로젝트에서 이슈만 해제된 경우의 연동 판정
- `src/integration/approval/policySignal.js` 에 `isOwnIssueRelease` 를 추가했다. 이슈 신호가 아래를 모두 만족하면 해제로 본다.
  - `movesRms.policy` 가 **우리 키**로 서명됐다.
  - cloud·ent(projectId·issueId)가 일치한다.
  - `body.ctl === 'NONE'` 이다.
  - 만료는 보지 않는다. 승인 앱 controlLinkOf 의 VERIFIED NONE 과 같다(해제는 sticky).
- `src/resolver/approvalLink/ApprovalControlLookup.js` `forIssue`:
  - 이슈 ctl 이나 프로젝트 ctl 로 연동이 나오더라도, 해제 신호가 있으면 `{linked:false, code:'RELEASED'}` 를 돌려준다. 승인 앱 controlLinkOf 의 순서(이슈 NONE → 프로젝트 ALL_ISSUES)와 같다.
  - 신호는 새 인자 `policyEntry` 로 받는다. 서비스 3곳은 이미 받은 이슈 프로퍼티를 넘겨 GET 이 늘지 않는다. `isApprovalHidden` 은 검색 응답에 있으면 그것을 쓴다.
  - 신호를 모르면(undefined) 연동일 때만 GET 1회 한다.
  - 다음 경우는 해제로 보지 않는다(연동 쪽 = 더 엄하다): 읽기 실패, 남이 쓴 신호, 다른 이슈의 신호, 연동(ctl 없음) 신호, 서명 키 없는 설치.
- 테스트 `LinkedWriteGate.test.js` "검증 F2":
  - 재현 조건: 해제 신호가 없으면 P: 연동이 되고, wd 창 미해결로 `WORKLOG_WINDOW_UNRESOLVED` 다.
  - 수정 뒤: 해제 신호가 있으면 인자로 받든 GET 으로 받든, 만료됐든 아니든 `RELEASED` 이고 gated=false 다.
  - 위조·다른 이슈·연동 신호·서명 키 없음이면 연동을 유지한다.
  - resolver 통합: 해제된 이슈는 판정(judge) 없이 비연동 규칙으로 POST 된다.
- 승인 앱 교차 테스트 `[발견 5]` 는 손대지 않았다(리더 정리).

### 재검증
| 항목 | 결과 |
|---|---|
| 백엔드 jest | 180 suites / 2,758 passed |
| 프론트 jest | 167 / 2,665 passed |
| `build:app` | 성공(node_modules source map 경고만 — 기존) |
| `bundle:check` | gzip 494,935 / 950,000 withinBudget |
| 보호 파일 sha1 | locales 2·pptx 3·png·custom-scopes.yaml·LeaderTeamBackfill.test.js 모두 불변 |

## 11. 코덱스 반영(codex-review.md + 요구서 "코덱스 검토 반영 결정") — 워크포스 입력 경로

### P1-3 — 통제 문서 상태 구분(검증 실패·읽기 실패·신뢰 키 없음은 비연동이 아니다)

`ApprovalControlLookup.forIssue` 를 고쳤다.
- 이슈 문서가 있는데 검증에 실패했고 프로젝트로도 연동이 확인되지 않으면, 그 실패 코드(`BAD_SIGNATURE`·`READ_FAILED`·…)를 결과로 낸다. 예전에는 프로젝트 ABSENT 로 접혔다.
- 신뢰 키가 없는데 이슈에 통제 문서가 걸려 있으면 `UNVERIFIABLE` 이다.
- 우리 서명 해제 신호는 연동·검증 실패보다 먼저 본다.

새 `ctlStateOf(link)` 가 상태를 VERIFIED·RELEASED·ABSENT·NO_TRUST·UNVERIFIED 로 나눈다. `writeChannel.js`(두 사본)는 `ctl:{verified:false, state}` 를 받는다.

**판정 기준표**(작성·수정·삭제·드래그 공통, 서버 `writeChannelOf`)

| 통제 문서 상태 | 연동 스위치 | 워크포스 소속 | 결과 |
|---|---|---|---|
| (스위치 값 모름) | — | — | BLOCKED |
| VERIFIED + 미만료 `wr` + 서명 키(gated) | ON·OFF | 무관 | DIRECT(폼) → 실행 시 writeGate 판정 |
| VERIFIED, `wr` 없음·만료 | ON·OFF | 무관 | HANDOFF(경로 없으면 BLOCKED) |
| RELEASED(우리 서명 이슈 해제, 만료 무관) | ON·OFF | 무관 | **DIRECT(비연동)** — 승인 앱 controlLinkOf 와 같음. 소속 이슈도 DIRECT(코덱스 §3 지적 해소) |
| UNVERIFIED(서명·형식·키 검증 실패, 읽기 실패, 검증 못 하는 문서) | ON·OFF | 무관 | **BLOCKED**(확인 불가 → `WORKLOG_LINK_UNCONFIRMED`: "승인 앱 화면에서 기록…") |
| NO_TRUST(신뢰 키 없음) | ON | 무관 | **BLOCKED** |
| NO_TRUST | OFF | 무관 | DIRECT(승인 앱 키 미설정 단독) |
| ABSENT(이슈·프로젝트 모두 문서 없음) | OFF | 무관 | DIRECT |
| ABSENT | ON | false | DIRECT |
| ABSENT | ON | true·null | BLOCKED(연동 신호를 걸었는데 문서가 아직 없음) |

- 단독 사용은 깨지지 않는다.
  - 승인 앱 신뢰 키도 서명 키도 없고 스위치 OFF 면, 이슈 선조회 없이 요청 1회로 종전 그대로 쓴다(테스트 고정).
  - 스위치 OFF 이고 신뢰 키만 없으면 DIRECT 다.
  - 승인 앱 미설치 사이트는 문서가 없어 ABSENT 다.
- DEFER 와 BLOCKED 의 관계:
  - 검증되지 않은 문서에는 승인 앱 화면 경로가 없다. 그래서 DEFER 가 넘김 코드가 아니라 `WORKLOG_LINK_UNCONFIRMED`(BLOCKED)로 나간다.
  - 기존 문구 그대로, 승인 앱 화면에서 기록하거나 관리자에게 문의하라고 안내한다.
  - 저장은 하지 않는다.

### P2-7 — 10분 유예 결속

`LinkedWriteGate.freshOwnOf` 는 아래를 **모두** 확인한다. 하나라도 모자라면 유예하지 않는다. 미관찰 기록이면 DEFER `NOT_OBSERVED` 다.
1. 우리 kid·자기 키 서명, cloud·이슈·작성자 일치, op 있음
2. 봉투의 원래 `started`·`seconds` = 지금 기록 값(작성 뒤 바뀐 기록 제외)
3. 기록 `created` 가 봉투 [iat, exp] 안(±5분)(옛 봉투 복사 제외)
4. `updated − created ≤ 60초`(생성 뒤 미수정)
5. 생성 후 10분 안

남는 한계는 하나다.
- 봉투에 worklogId 가 없어 op↔기록 1:1 은 증명할 수 없다.
- 같은 작성자가 같은 이슈·같은 값의 다른 기록에 15분 안에 봉투를 복사한 경우만 남는다.
- 그 기록은 승인 앱 트리거가 REUSED 로 관찰하면 인증 문서 엔트리가 생긴다. 그 뒤에는 D6 `ORIGIN_UNPROVEN` 으로 DEFER 된다.
- 위 4번(`updated − created ≤ 60초`)은 Jira 동작에 기댄다. 실측이 필요하다(아래 미검증).

### P1-1·P1-2 — "사후 감지 + 즉시 재게시 강화"(승인 앱 몫), 워크포스는 숨기지 않기만
- resolver 응답: 연동 이슈의 작성(dryRun 포함)·수정·삭제 성공에 `postCheck: true` 를 싣는다.
- 화면: gated 이슈 모달에 안내 1줄을 띄운다(`issuePanel.approval.postCheck`). 문구: "승인 앱 규칙으로 판정해 저장합니다. 저장 뒤 승인 앱이 최신 마감·제출·규칙으로 다시 점검해 위반이면 표시하고 집계에서 뺄 수 있습니다." 영문도 있다.
- 기존 키 중 맞는 문구가 없어 새 키 1개를 넣었다.
  - 원천 `locales/kr/issuePanel.json`·`locales/en/issuePanel.json` 에 1줄씩.
  - 산출물 `ko-KR.json`·`en-US.json` 에 1줄씩 텍스트 삽입.
  - 사용자 기존 줄은 그대로 두었고, merge 는 실행하지 않았다.
  - 산출물이 원천 merge 결과와 같음을 확인했다(두 파일 모두 true).

### P2-10 — 워크포스 `AGENTS.md`
- ⑧ "쓰기 실행기 없음" 문단을 "쓰기 실행(workforce-input-reopen)" 으로 바꿨다. 내용: wr·writeGate·asUser·ALLOW/DENY/DEFER·10분 유예 결속·postCheck·`wa` 경로 없음.
- "쓰기 창구 통일" 문단을 "쓰기 창구(코덱스 P1-3)" 로 바꿨다. 상태 구분·RELEASED·UNVERIFIED·단독 설치 규칙을 담았다.
- 배포 절의 "판정은 승인 앱, 워크포스는 넘김만" 문장을 고쳤다.
- 끝 절의 "생성은 `wa` 지원 신호 필요" 문장을 현재 계약으로 바꿨다.

### 계약 파일 재동기화
- 승인 앱이 `contract.js` 주석 1줄을 고쳐(P2-10) 다시 복사했다. SYNCED 지문도 갱신했다.

| 파일 | sha1 | 승인 앱과 |
|---|---|---|
| `contract.js` | 020622effbdec63a3b0a4d8ec5e26c1e24e3a00e | 같음 |
| `writeGate.js` | e5a057907b66129ef01104fe8bc738d5257b7f5c | 같음(변동 없음) |
| `vectors.json` | (변동 없음) | 같음 |
| `writeGateVectors.json` | (변동 없음) | 같음 |

### 바뀐 파일(이번 회차)
- `src/resolver/approvalLink/ApprovalControlLookup.js`(`ctlStateOf`, 상태 보존)
- `src/domain/approvalLink/writeChannel.js` = `static/ui/src/components/worklog/writeChannel.js`
- `src/resolver/approvalLink/IssueWorklogControlService.js`(ctl 상태 전달, postCheck)
- `src/resolver/approvalLink/LinkedWriteGate.js`(freshOwn 결속)
- `static/ui/src/pages/myWork/modal/WorklogModal.jsx`(사후 점검 안내)
- `locales/{kr,en}/issuePanel.json`, `locales/{ko-KR,en-US}.json`(1키)
- `AGENTS.md`
- `src/integration/approval/contract.js`(재동기화)
- 테스트:
  - `LinkedWriteGate.test.js`(P1-3 상태·기준표 9행·단독 설치, P2-7 결속 6건, postCheck)
  - `writeChannel.test.js` 두 사본
  - `WorklogModalSpaceFilter.test.jsx`
  - `vectors.test.js` 지문
- 승인 표시 쪽(`ApprovalCertReader.js`·드로어·캘린더·원가)과 승인 앱 리포는 손대지 않았다.

### 재검증
| 항목 | 결과 |
|---|---|
| 백엔드 jest | 183 suites / 2,850 passed(재동기화 뒤 integration 421 passed 재확인) |
| 프론트 jest | 169 / 2,691 passed |
| `build:app` | 성공(경고는 node_modules source map·기존 effect 의존성만) |
| `bundle:check` | gzip 495,949 / 950,000 withinBudget |
| `forge lint` | No issues found |
| 보호 파일 | pptx 3·png·custom-scopes.yaml·LeaderTeamBackfill.test.js 불변 |
| locales | postCheck 1키 삽입 외 불변. 산출물 = 원천 merge 결과 |

### 미검증(추가)
- Jira 워크로그의 `updated` 가 작성 직후 `created` 와 같은지(60초 안). 다음 두 경우에도 같은지 확인해야 한다.
  - 작성 본문 `properties` 를 같은 요청에 실었을 때
  - 승인 앱이 그 뒤 워크로그 프로퍼티를 쓸 때
- 다르면 10분 유예가 꺼진다. 그러면 결과는 DEFER(넘김)이고, 안전한 쪽이다.
