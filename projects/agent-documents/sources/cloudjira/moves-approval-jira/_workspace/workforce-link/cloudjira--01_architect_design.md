# workforce-link 설계서 — 워크포스 연동 (서명 계약 · 사용자×기간 승인 상태 게시 · 워크포스 게시물 검증)

> 작성: feature-architect · 2026-10-03 · autopilot 무인 회차(Phase 2)
> 입력: `00_input/requirement.md`, `docs/DESIGN.md` §3·§4·§5·§10, `CLAUDE.md`·`AGENTS.md`(불변식 1~10, asApp 허용 목록),
> 선행 `_workspace/{timesheet-approval,period-lock}/{01_architect_design,02_backend_report,03_verify_report}.md`,
> 실제 코드 `src/domain/timesheet/*`(특히 `snapshot.js` — ts1 지문), `src/resolver/timesheet/{TeamScope,TimesheetAccess,TimesheetRouting,TimesheetService,TimesheetDriftService,WorklogCollector,PeriodCloseService}.js`,
> `src/domain/approval/normalizeSteps.js`, `src/rdb/schema/{migrate.js,ddl/*}`, `src/permission/{permissionGuard,InvocationScope}.js`, `manifest.yml`.
> 워크포스 리포(읽기만): `src/api/jira/issue/IssuePropertyApi.js`(이슈 프로퍼티 `movesRms` 사용 실측), `src/resolver/utils/worklog/WorklogService.js`(JQL 검색 응답 인라인 워크로그 + 20건 초과 시 추가 조회),
> `_workspace/leader-team-unify/*`(RFC-204 — 팀장 = 이끄는 팀의 구성원, 한 사람은 한 팀만 이끈다, 팀은 상하위 트리, 쓰기 5경로), `src/queue/consumer.js`(비동기 큐 있음), `manifest.yml`(워크로그 트리거 없음, runtime nodejs22.x).
> 기준선: 백엔드 46 suites / 529 tests, UI 17 suites / 140 tests. 최신 마이그레이션 `v023_create_timesheet_close_drift_table` → **이번 기능은 v024~v028**.
> 플랫폼 근거 등급: **문서**(공식 문서 확인, 실측 전) / **미검증**(추정 — 이 문서 §10 의 W 번호).

## 열린 질문

QUESTIONS.md 에 **Q31~Q41** 로 올린다. 답이 없으면 **기본 가정**으로 구현한다(막히는 질문 없음).

| # | 질문 | 선택지 | 기본 가정(이 설계) | 권장·근거 |
|---|---|---|---|---|
| Q31 | 승인 상태 게시 단위 | (a) 사용자×기간 — 사용자 프로퍼티 `movesApproval.{YYYY}` (b) 워크로그 단위 — 워크로그 프로퍼티 | **(a)**. (b)는 계약(typ `approval.worklog`)과 순수 빌더만 만들고 게시 경로는 W2 가 실패했을 때 연다 | (a). 팀장 일괄 승인 50명 = PUT 50회. (b)는 워크로그 수(월 수십 건 × 50명) 만큼 PUT |
| Q32 | 연동 기본값 | 켬 / 끔 | **켬**(정책 `workforceLinkEnabled=true`). 서명 맞는 게시물이 없으면 실제 효과는 없다 | 켬. 모드 판정이 "검증된 게시물이 있는가"라 미설치 사이트에서는 아무것도 바뀌지 않는다 |
| Q33 | 연동 시 팀장 원천 · 2단계 그룹 | 워크포스 우선(폴백 명부) / 명부 우선 / 명부만 · 워크포스 원천일 때 명부의 `secondStepGroup` 적용 여부 | **워크포스 우선, 게시물이 없거나 검증 실패면 명부.** 워크포스 원천이면 **2단계 그룹 없음**(팀장 1단계 + 위반 시 예외 단계) | 워크포스 우선. 2단계는 명부 팀에 붙은 설정이라 워크포스 팀에 대응물이 없다. 필요하면 전역 정책 `workforceSecondStepGroup` 을 다음 회차에 |
| Q34 | 워크포스 위반 코드 처리 | 자체 제한선과 같은 `timesheetViolationAction` / 별도 정책 | **같은 값**(기본 `WARN`). `EXTRA_STEP` 이면 위반 워크로그가 속한 프로젝트의 **워크포스 PM**(`movesRms.pm`) 단계, PM 이 없으면 `timesheetExceptionGroup` 단계, 둘 다 없으면 `INVALID_APPROVER_CONFIGURATION` | 같은 값. 정책 하나로 시작해 고객 회신 후 나눈다 |
| Q35 | 워크포스 점검(`movesRms.check`)이 없는 워크로그 | 무시 / 위반(`CHECK_MISSING`)으로 계산 | **워크포스가 그 사용자 게시물에 `cap:['check']` 를 선언했을 때만 `CHECK_MISSING` 위반**, 아니면 무시 | 위반. 워크로그 프로퍼티는 작성자가 지울 수 있다 — 부재를 "위반 없음"으로 읽으면 사용자가 지워서 예외 단계를 피한다 |
| Q36 | 워크포스 쪽 롤백 재생 한계 | 수용 / 워크포스가 상태 저장 | **수용**. 워크포스는 상태가 없어(DB 무증가) 같은 기간의 옛 서명 항목을 사용자가 되돌려 써도 거부할 수 없다. 완화: 지문 재계산(내용이 같아야만 통과) + 승인 앱 일일 대조가 원래 값으로 재게시 | 수용. 피해 범위는 "예전에 실제로 승인된 내용과 똑같은 워크로그"뿐이다 |
| Q37 | 연동을 끌 때 이미 게시한 프로퍼티 | 둔다 / 지운다 | **둔다**(게시만 멈춘다). 다시 켜면 전량 재게시 | 둔다. 삭제는 asApp DELETE 수백 건이고, 워크포스는 오래된 값을 "확인 중"으로 처리할 수 있다 |
| Q38 | 워크포스 측 작업 명세(§12) 승인 | 승인 / 수정 요청 | 이 회차는 문서만. 워크포스 리포는 손대지 않는다 | — 사람 승인 필요 |
| Q39 | 서명 키 운영 | 환경별(dev/stg/prd) 키 분리 + 신뢰 kid 환경 변수 / 단일 키 | **환경별 키 분리**, 검증자는 `MOVES_LINK_TRUSTED_KIDS`(쉼표 목록)에 든 kid 만 신뢰. 미설정이면 키링의 `prd` 표시 kid 만 | 분리. dev 키는 개발자 PC 를 거치므로 그 서명을 운영 사이트가 받으면 안 된다 |
| Q40 | 마감 정보를 누구에게 싣나 | 우리가 아는 사용자만 / 별도 공용 채널 | **우리가 아는 사용자만**(제출 이력·명부 구성원·검증된 워크포스 게시물의 대상·팀원). 모르는 사용자의 마감 여부는 워크포스가 "모름"으로 본다 | 수용. 앱끼리 사이트 단위 공용 저장소가 없다(DESIGN §4.4) |
| Q41 | 워크포스 게시물 유효기간 | 없음 / N일 지나면 무효 | **없음.** 사라지거나(404) 위조되면 **마지막으로 검증된 값을 유지**(sticky)하고, 소속 해제는 워크포스의 서명된 빈 게시물(tombstone)로만 받는다 | 없음 + sticky. 사용자가 자기 프로퍼티를 지워 결재선을 명부로 돌리는 것을 막는다. 워크포스를 지운 사이트는 관리자가 연동을 끈다 |

## 1. 개요·영향 범위

두 앱은 **Jira 엔티티 프로퍼티 + Ed25519 서명**으로만 대화한다(DESIGN §4). 이 회차는 승인 앱 쪽 절반이다.

```
 승인 앱(우리 DB 가 진실)                                 Jira 엔티티 프로퍼티(운반만)                워크포스(상태 없음)
 ─────────────────────────                               ───────────────────────────               ─────────────────
 제출·결정·회수·만료·감지·마감 ── touch ─▶ workforce_publish(아웃박스)
                                 5분 스윕(asApp PUT) ─▶ user  movesApproval.{YYYY}  ─▶ GET + 서명검증 + ts1 재계산 → 배지·원가 "승인분만"
 getMyTimesheet/submit (asUser self GET) ◀────────── user  movesRms.org     ◀── 팀·팀장 변경 시 서명 게시
 {teamLead} 가드·매트릭스 (asUser self GET) ◀─────── user  movesRms.org(leads)
 submit 수집 (asUser worklog?expand=properties) ◀─── worklog movesRms.check ◀── 워크로그 이벤트 시 제한선 판정 게시
 EXTRA_STEP 예외 단계 (asUser GET) ◀──────────────── project movesRms.pm    ◀── PM 지정 시 게시
```

| 영역 | 변경 |
|---|---|
| 계약(순수) | 신규 `src/integration/workforce/` — `canonical.js`(정규화 JSON), `base64url.js`, `signature.js`(메시지 바이트·서명·검증, 키 주입), `keyring.js`(공개키 내장), `contract.js`(typ 등록부·프로퍼티 키·본문 스키마), `approvalDoc.js`(승인 문서 빌더), `inbound.js`(org·check·pm 본문 해석), `vectors.json`(교차 구현 시험 벡터). **Jira·SQL·`Date.now()` 없음** |
| 도메인(순수) | `src/domain/timesheet/limits.js` — 워크포스 위반 코드 순서·병합(`mergeViolations`). `snapshot.js`·`status.js`·`lock.js` **무변경**(ts1 형식 동결) |
| 엔진 | **무변경.** `normalizeSteps` 에 단계 하나를 더 넘길 뿐(DESIGN §5) |
| resolver | 신규 2: `getWorkforceLinkStatus`, `republishWorkforceLink`. 변경 7(추가 필드만): `getTimesheetContext`·`getMyTimesheet`·`submitTimesheet`·`getTeamTimesheetMatrix`·`getTimesheetDetail`·`getApprovalSettings`·`saveApprovalSettings` |
| 서비스 | 신규 `src/resolver/workforce/{WorkforceLinkController,WorkforceLinkService,WorkforceOutbox,WorkforcePublisher,WorkforceInbound,WorkforceOrgSource,WorkforcePropertyGateway,WorkforceLinkRepository,WorkforceSigner}.js`. 변경 `TeamScope`(원천 합성)·`TimesheetRouting`(원천 선택·PM 단계)·`TimesheetService`(touch·검증 결과 저장)·`WorklogCollector`(`expand=properties`, `project.id`)·`TimesheetDriftService`·`PeriodCloseService`·`SettingsService`(touch)·`InvocationScope`(호출 주체) |
| 트리거·스윕 | 신규 scheduledTrigger `workforce-publish`(fiveMinute) → `runWorkforcePublish`. 일일 `runSweep` 에 게시물 대조·로그 정리 추가 |
| 스키마 | `v024_alter_timesheet_submission_routing_source`, `v025_alter_timesheet_submission_link_json`, `v026_create_workforce_publish_table`, `v027_create_workforce_inbound_table`, `v028_create_workforce_link_log_table` |
| manifest | scheduledTrigger 1 + function 1. **scope 추가 없음**(W11 — 사용자 프로퍼티 쓰기 scope 실측 결과에 따라 추가 가능) |
| 환경 변수 | `MOVES_LINK_SIGNING_KEY`(암호화), `MOVES_LINK_SIGNING_KID`, `MOVES_LINK_TRUSTED_KIDS`(선택) — 설정은 배포 회차(이번 회차 forge 금지) |
| 프론트 | 설정 탭 `workforce` 신규(`WorkforceLinkSettings.jsx`), 내 타임시트·팀 매트릭스·상세의 원천 배지·워크포스 위반 문구 |
| i18n | 신규 네임스페이스 `workforce.json`(kr/en), `timesheet.json`·`error.json`·`policy.json` 키 추가 |
| AGENTS.md | asApp 허용 2번 문구에 "자기 게시물 대조용 GET" 추가(§6.3) |

### 1.1 모드 판정 — 기능 단위 부분 폴백 (DESIGN §3)

설치 감지를 하지 않는다. 기능마다 "그 기능이 쓰는 게시물이 서명 검증을 통과했는가"로만 정한다.

| 기능 | 워크포스 경로 조건 | 아니면 |
|---|---|---|
| 결재선 1단계(팀장) | 대상자의 `movesRms.org` VERIFIED + `leaderKeys`(본인 제외) 1명 이상 | 명부(`timesheet_team`) |
| 팀장 범위(가드·매트릭스·열람) | 팀장 본인의 `movesRms.org.leads` VERIFIED | 명부만 |
| 워크포스 위반 | 워크로그의 `movesRms.check` VERIFIED + 내용 일치 | 자체 제한선만(Q35 예외) |
| 예외 단계 승인자 | 위반 워크로그 프로젝트의 `movesRms.pm` VERIFIED | `timesheetExceptionGroup` |
| 승인 상태 게시 | 정책 켬 + 서명 키·cloudId 준비 | 게시 안 함(관리 화면에 사유) |

정책 `workforceLinkEnabled=false` 이면 위 다섯 가지 모두 단독 경로, Jira 추가 호출 0.

## 2. 경계면 계약

공통: 성공 `{ success:true, content }`, 실패 `{ success:false, error:{ name, code, message, cause } }`. **아래 shape 은 전부 `res.content`**. 시각 epoch ms, 시간 양 초. 사람이 읽는 문구는 서버가 만들지 않는다.

### 2.1 신규 resolver

| resolver | 권한 축 | 입력 | 응답 shape (success) | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getWorkforceLinkStatus` | `{ admin:true }` | `{}` | `LinkStatus`(§2.1.1) | `STORAGE_NOT_READY` 없음(미준비는 필드로) | 설정 > 워크포스 연동 |
| `republishWorkforceLink` | `{ admin:true }` | `{ scope: 'FAILED' \| 'ALL' }` | `{ scope, resetCount: number, markerCount: number }` | `INVALID_TARGET`(scope), `WORKFORCE_LINK_DISABLED`, `WORKFORCE_SIGNING_UNAVAILABLE`, `STORAGE_NOT_READY` | 설정 > 워크포스 연동 [재게시] |

#### 2.1.1 `LinkStatus`

```js
{
  enabled: boolean,                         // 정책 workforceLinkEnabled
  storageReady: boolean,                    // v026~v028 프로브
  crypto: { available: boolean, selfTest: 'OK' | 'FAIL' },   // RFC 8032 벡터 왕복(§3.1.6)
  signing: {
    configured: boolean,                    // 개인키·kid 환경 변수 둘 다 있고 형식이 맞음
    kid: string | null,
    publicKeyFingerprint: string | null,    // 'ab12 cd34 ef56 7890' — sha256(raw32 공개키) hex 앞 16자, 4자씩 공백
    inKeyring: boolean,                     // 내 공개키가 빌드 키링(approval 계열)에 있고 kid 가 같다 — false 면 워크포스가 검증 못 한다
  },
  trustedPeerKids: string[],                // 신뢰하는 워크포스 kid
  cloudIdKnown: boolean,
  publish: {
    pending: number,                        // pending=1 행(표식 제외)
    failed: number,                         // attempts>=1 이고 pending
    stalled: number,                        // attempts>=8
    published: number,                      // published_at 있는 행
    lastPublishedAt: number | null,
    lastError: { code: string, at: number } | null,
    state: 'OK' | 'DISABLED' | 'KEY_NOT_CONFIGURED' | 'CRYPTO_UNAVAILABLE' | 'CLOUD_ID_UNKNOWN' | 'WRITE_DENIED' | 'STORAGE_NOT_READY',
  },
  inbound: {
    org:   { verified: number, invalid: number, lastVerifiedAt: number | null },
    pm:    { verified: number, invalid: number, lastVerifiedAt: number | null },
    check: { lastSeenAt: number | null },   // 점검은 캐시하지 않는다 — 로그 기준 마지막 검증 시각
  },
  recentFailures: [{                         // workforce_link_log last_at 내림차순 20건
    direction: 'IN' | 'OUT',
    typ: string,                            // 'rms.org' | 'rms.check' | 'rms.pm' | 'approval.timesheet'
    entityId: string,                       // accountId | projectId | 'issueId/worklogId' | 'accountId/movesApproval.2026'
    code: string,                           // §3.1.7 검증 결과 코드 / 게시 오류 코드
    firstAt: number, lastAt: number, count: number,
  }],
}
```

- `entityId` 는 accountId 를 포함한다. 관리자 화면이라 노출 범위 문제 없음(기존 `listTimesheetTeams` 도 accountId 를 준다). 이름 해석은 프론트가 기존 사용자 표시 경로로.
- 미준비 테이블이면 `storageReady:false` + 카운트 0, `publish.state:'STORAGE_NOT_READY'`. 에러로 던지지 않는다(관리자가 상태를 보러 오는 화면).

#### 2.1.2 `republishWorkforceLink`

- `FAILED`: `attempts>0 AND pending=1` 행의 `attempts=0, next_attempt_at=now` (CAS 아님 — 큐 재무장, `rev = rev + 1`). `resetCount` = 영향 행 수.
- `ALL`: 현재·이전 연도 표식 행 2개(`account_id='*'`) touch. `markerCount=2`. 실제 펼침·게시는 다음 5분 스윕.
- 정책 꺼짐 → `WORKFORCE_LINK_DISABLED`. 키 미설정·자가 시험 실패 → `WORKFORCE_SIGNING_UNAVAILABLE`.
- 감사: `listSettingsAudit` 항목 `area:'workforceLink'`, `action:'republish'`, `detail:{ scope }`.

### 2.2 변경 resolver (추가 필드만 — 기존 키·의미 무변경)

| resolver | 추가 |
|---|---|
| `getTimesheetContext` | `myTeam.source: 'ROSTER' \| 'WORKFORCE'`, `ledTeams[].source` 동일. 워크포스 팀의 `teamKey` 는 `'wf:' + 워크포스 teamKey` |
| `getMyTimesheet` | `routing.source: 'ROSTER' \| 'WORKFORCE'`, `routing.extraStepSource: null \| 'GROUP' \| 'WORKFORCE_PM' \| 'GROUP_AND_PM'`. `violations[]` 에 워크포스 위반(§2.3) 섞임(정렬은 자체 코드 뒤). `workforce: { org: 'VERIFIED' \| 'NONE' \| 'DISABLED', checks: 'VERIFIED' \| 'PARTIAL' \| 'NONE' \| 'UNAVAILABLE' \| 'DISABLED' }` |
| `submitTimesheet` | `routingSource`, `extraStepSource`(위와 같은 값). 에러 코드 무변경 |
| `getTeamTimesheetMatrix` | `teams[].source`, `rows[].teamSource`. 워크포스 팀 `teamKey`(`wf:` 접두)를 payload 로 받는다(형식: 1..80자 문자열) |
| `getTimesheetDetail` | `routingSource: 'ROSTER' \| 'WORKFORCE' \| null`(v024 이전 제출은 null), `extraStepSource`, `violations[]` 워크포스 위반 포함(제출 시점 저장값) |
| `getApprovalSettings` / `saveApprovalSettings` | 정책 키 `workforceLinkEnabled`(boolean, 기본 true, `GLOBAL_ONLY_KEYS`). 형식 오류 `INVALID_TARGET`. false→true 전환 저장은 전량 재게시 표식 touch |

### 2.3 워크포스 위반 객체 (Violation 확장)

```js
// 기존 자체 위반 4종은 그대로(source 키 없음 = 자체)
{ code: 'OVER_PLAN',      source: 'WORKFORCE', worklogId, issueId, date }   // 계획 대비 초과
{ code: 'OUT_OF_PERIOD',  source: 'WORKFORCE', worklogId, issueId, date }   // 참여 기간 밖
{ code: 'NOT_MEMBER',     source: 'WORKFORCE', worklogId, issueId, date }   // 프로젝트 미소속
{ code: 'WORKFORCE_OTHER',source: 'WORKFORCE', worklogId, issueId, date, rawCode }  // 모르는 코드(rawCode 는 ^[A-Z_]{1,32}$ 만, 아니면 버림)
{ code: 'CHECK_MISSING',  source: 'WORKFORCE', worklogId, issueId, date }   // Q35 — cap 'check' 선언 사용자만
// 정렬: DAILY_MAX, WEEKLY_MAX, FUTURE_DATE, BACKDATED, OVER_PLAN, OUT_OF_PERIOD, NOT_MEMBER, WORKFORCE_OTHER, CHECK_MISSING → date → worklogId(숫자)
// date = 정책 타임존 현지 날짜(워크로그 started 기준). 상한 50 + violationCount 전체 수(기존 규칙)
```

### 2.4 에러 코드 (신규 2)

| code | name | 언제 |
|---|---|---|
| `WORKFORCE_LINK_DISABLED` | `LogicalError` | 연동 꺼짐 상태에서 재게시 |
| `WORKFORCE_SIGNING_UNAVAILABLE` | `LogicalError` | 서명 키 미설정·형식 오류·Ed25519 자가 시험 실패 상태에서 재게시 |

검증 실패는 **에러가 아니다** — 단독 경로로 떨어지고 로그(`workforce_link_log`)에 남는다. resolver 응답에서는 §2.2 의 `workforce.*`·`routing.source` 로만 드러난다.

## 3. 도메인·계약 (순수 함수)

규칙: `src/integration/workforce/**` 와 `src/domain/**` 는 `@forge/*`·`fetch`·SQL·`Date.now()`·`new Date()`(인자 없는) 금지. 시각은 `now` 인자, 키는 주입. `node:crypto` 는 결정적 계산(SHA-256·Ed25519 — Ed25519 서명은 결정적)이라 허용(기존 `snapshot.js` 와 같은 기준).

### 3.1 서명 계약 — 바이트 수준 명세 (워크포스가 독립 구현할 수 있는 수준)

#### 3.1.1 정규화 JSON (`canonical.js` — `canonicalize(value) → string`)

RFC 8785(JCS)의 **부분집합**. 허용 값만 쓰므로 JCS 와 같은 결과가 나온다.

| 값 | 규칙 |
|---|---|
| 객체 | 키를 **UTF-16 코드 단위 오름차순**(JS 기본 `Array.prototype.sort()`)으로 정렬, `{"k":v,...}`, 공백 없음. 중복 키 불가(JS 객체라 생기지 않음). 값이 `undefined` 인 키 → **오류**(생략하지 않는다 — 서명자·검증자 차이를 만든다) |
| 배열 | 순서 유지, `[a,b]`, 공백 없음 |
| 문자열 | ECMAScript `JSON.stringify(str)` 출력 그대로(제어문자·`"`·`\` 만 이스케이프, 비 ASCII 는 원문 UTF-8). 고립 서로게이트 포함 문자열 → 오류 |
| 숫자 | **안전 정수만**(`Number.isSafeInteger`), 10진, 지수·소수점·`+` 없음. `-0`·소수·NaN·Infinity → 오류 |
| 불리언·null | `true` `false` `null` |
| 그 외(BigInt·함수·Date·Map) | 오류 |
| 한도 | 깊이 ≤ 6, 결과 길이 ≤ 32,768 자 → 넘으면 오류 |

오류는 `CanonicalizationError`(코드 `MALFORMED`)로 던지고, 검증 경로는 이를 `MALFORMED` 결과로 바꾼다.

#### 3.1.2 서명 대상 바이트 (`signature.js` — `messageBytes(...)`)

```
message = UTF-8( "moves-link/1\n" + canonicalize(S) )

S = {
  "v":       1,                       // 계약 버전(정수). 검증자는 아는 버전만 받는다
  "typ":     "<typ>",                 // §3.1.3 등록부
  "cloudId": "<cloudId>",             // 사이트 cloudId(UUID 문자열, Forge context 의 값 그대로 — 소문자 하이픈 형식)
  "ent":     { ...엔티티 결속 필드 },  // §3.1.3 — 전부 문자열. 저장된 값에서 오지 않고 "읽은 위치"에서 검증자가 다시 만든다
  "kid":     "<kid>",
  "iat":     <issuedAt epoch ms 정수>,
  "body":    { ...저장 항목에서 kid·iat·sig 를 뺀 나머지 키 전부 }
}
```

- 접두 `"moves-link/1\n"` 은 13바이트 ASCII(`6d 6f 76 65 73 2d 6c 69 6e 6b 2f 31 0a`) — 다른 용도의 Ed25519 서명과 섞이지 않게 하는 도메인 분리.
- **`cloudId`·`ent` 는 저장하지 않는다.** 검증자가 "어느 사이트의 어느 엔티티 키에서 읽었나"로 만든다. 그래서 다른 사이트·다른 사용자·다른 기간·다른 워크로그로 복사하면 바이트가 달라져 서명이 깨진다(요구 1 — 복사 재사용 방지).
- `body` 는 저장 항목에 **있는 키 전부**다. 검증자는 모르는 키도 그대로 서명 대상에 넣는다(앞으로 필드를 더해도 옛 검증자가 서명은 확인 가능 — 해석만 무시). 서명자는 값이 null 인 선택 키를 **생략한다**(바이트 절약). 키를 하나라도 빼거나 더하면 서명이 깨진다.
- `body` 안에 `kid`·`iat`·`sig` 키는 둘 수 없다(예약어).

#### 3.1.3 typ 등록부 (`contract.js`)

| typ | 서명자 | 운반 위치(Jira) | `ent` 결속 필드 | 이번 회차 |
|---|---|---|---|---|
| `approval.timesheet` | 승인 앱 | 사용자 프로퍼티 `movesApproval.{YYYY}` 의 `periods[periodKey]` 항목 | `{ accountId, periodKey }` | 게시 구현 |
| `approval.worklog` | 승인 앱 | 워크로그 프로퍼티 `movesApproval` | `{ issueId, worklogId }` | 계약·빌더만(Q31 후퇴안) |
| `approval.issue` | 승인 앱 | 이슈 프로퍼티 `movesApproval` | `{ issueId }` | 자리만(`transition-approval`) |
| `rms.org` | 워크포스 | 사용자 프로퍼티 `movesRms.org` | `{ accountId }` | 검증·사용 |
| `rms.check` | 워크포스 | 워크로그 프로퍼티 `movesRms.check` | `{ issueId, worklogId }` | 검증·사용 |
| `rms.pm` | 워크포스 | 프로젝트 프로퍼티 `movesRms.pm` | `{ projectId }` | 검증·사용 |

- **서명자 계열 분리**: `approval.*` 은 승인 앱 키링의 kid 로만, `rms.*` 는 워크포스 키링의 kid 로만 검증한다. 한쪽 키가 새도 다른 쪽 typ 을 위조하지 못한다.
- 프로퍼티 키는 앱별 접두(`movesApproval*` / `movesRms*`)라 두 앱이 같은 키를 쓰지 않는다. 워크포스의 기존 이슈 키 `movesRms`·`movesRmsLink`·`movesDocs` 와 겹치지 않는다(사용자·워크로그·프로젝트 엔티티의 `movesRms.*` 는 신규). 키 공유·덮어쓰기 가능성 자체는 W5.

#### 3.1.4 저장 형식·인코딩

- 서명 항목 = `{ ...body, "kid": "<kid>", "iat": <ms>, "sig": "<base64url>" }`.
- `sig`: Ed25519(RFC 8032, 순수 Ed25519 — prehash 아님) 64바이트 서명의 **base64url(RFC 4648 §5), 패딩 없음** = 정확히 86자. 디코더는 `=`·알파벳 밖 문자·길이 ≠ 86 을 거부한다(엄격).
- `kid`: `^[a-z0-9-]{3,16}$`. 권장 `ap-prd-1`, `ap-dev-1`, `wf-prd-1`.
- `iat`: 서명 시각 epoch ms(안전 정수).
- 키 형식(환경 변수·키링):
  - 개인키 `MOVES_LINK_SIGNING_KEY` = **32바이트 Ed25519 seed 의 base64url(패딩 없음, 43자)**. 런타임 적재: PKCS#8 DER = `302e020100300506032b657004220420` (16바이트) ‖ seed(32) → `crypto.createPrivateKey({ key, format:'der', type:'pkcs8' })`.
  - 공개키(키링) = **32바이트 raw 공개키의 base64url(43자)**. 적재: SPKI DER = `302a300506032b6570032100` (12바이트) ‖ raw(32) → `crypto.createPublicKey({ key, format:'der', type:'spki' })`.
  - 서명 `crypto.sign(null, message, privateKey)`, 검증 `crypto.verify(null, message, publicKey, sig)`.
  - 지문 = SHA-256(raw32 공개키) hex 앞 16자.
- 키 생성 절차(운영 문서·스크립트 `scripts/workforce-link/gen-key.mjs` — 백엔드가 만들고 실행은 사람): `generateKeyPairSync('ed25519')` → `privateKey.export({format:'der',type:'pkcs8'}).subarray(16)` = seed, `publicKey.export({format:'der',type:'spki'}).subarray(12)` = raw. 출력은 seed·raw base64url 과 지문. seed 는 `forge variables set --encrypt MOVES_LINK_SIGNING_KEY` 로만 들어간다(파일·커밋 금지).

#### 3.1.5 키링·키 회전 (`keyring.js`)

```js
export const KEYRING = Object.freeze({
  approval: { /* kid → { x: '<raw32 base64url>', env: 'prd'|'stg'|'dev', notAfter: null|epochMs } */ },
  workforce: { /* 같은 형식 */ },
});
```

- 두 앱 빌드에 **같은 키링 파일**을 둔다(워크포스는 복사 — §12). 자기 계열 공개키도 들어 있어 관리 화면이 "내 키가 키링에 있나"(`inKeyring`)를 보여 준다.
- 신뢰 집합 = `KEYRING[계열]` ∩ (`MOVES_LINK_TRUSTED_KIDS` 가 있으면 그 목록, 없으면 `env==='prd'` 인 kid). `notAfter` 가 있고 `iat > notAfter` 면 `UNTRUSTED_KID`(폐기 키로 새로 서명한 것 거부, 그 전에 서명된 것은 계속 유효).
- 회전 순서: ① 새 kid 공개키를 양쪽 키링에 추가해 **두 앱 모두 배포** ② 서명 측 `MOVES_LINK_SIGNING_KEY/KID` 교체 ③ 승인 앱은 게시 행의 `published_kid ≠ 현재 kid` 를 감지해 전량 재게시(5분 스윕이 자동, §4.4) ④ 충분한 기간 뒤 옛 kid 에 `notAfter` 기록 또는 키링에서 삭제 후 배포.
- 키 유출: 해당 kid 를 키링에서 빼고 양 앱 배포 → 그 kid 의 모든 서명이 즉시 무효(검증 실패 → 단독 경로·확인 중).

#### 3.1.6 Ed25519 가용성(W1)과 대체안

- 1차: `node:crypto` Ed25519(Forge runtime `nodejs22.x`, OpenSSL 3 계열 — 지원이 정상이나 실측 전).
- 자가 시험 `selfTest()`: RFC 8032 §7.1 TEST 1 벡터(빈 메시지)로 seed→공개키 유도·서명 바이트 일치·검증 통과를 확인. 실패하면 `crypto.available=false`. 벡터 값은 백엔드가 RFC 원문에서 옮기고 테스트로 고정한다.
- 2차(실측 실패 시에만 도입): 순수 JS 구현 `@noble/ed25519`(무의존, SHA-512 는 `node:crypto` 로 주입). 어댑터 인터페이스 `{ sign(seed32, msg) → sig64, verify(raw32, msg, sig64) → bool }` 로 감싸 바꿔 끼울 수 있게 한다. 이번 회차엔 의존성을 추가하지 않는다.
- **HMAC 은 대체안이 아니다.** 검증자가 같은 비밀을 가져야 하므로 워크포스 빌드·환경에 승인 앱 서명 능력이 생긴다(한 앱이 뚫리면 양방향 위조). 공개키 내장(비밀 배포 없음)이라는 DESIGN §4.1 전제가 무너진다.
- 둘 다 안 되면: 게시 중지(`publish.state:'CRYPTO_UNAVAILABLE'`), 수신 검증은 전부 실패로 처리 → **전 기능 단독 경로**. 기존 동작과 같다(안전한 실패).

#### 3.1.7 검증 알고리즘과 결과 코드 (`signature.js` — `verifyEntry(...)`)

입력: `{ family:'approval'|'workforce', typ, cloudId, ent, entry, now, keyring, trustedKids, verifyImpl }` → `{ ok:true, body, kid, iat } | { ok:false, code }`.

| 순서 | 검사 | 실패 code |
|---|---|---|
| 1 | entry 가 일반 객체 | `MALFORMED` |
| 2 | `kid` 형식, `iat` 안전 정수, `sig` 86자 엄격 base64url → 64바이트 | `MALFORMED` |
| 3 | typ 이 등록부에 있고 계열이 일치, `S.v` 지원(1) | `VERSION_UNSUPPORTED` |
| 4 | `kid` 가 계열 키링에 있음 | `UNKNOWN_KID` |
| 5 | `kid` 가 신뢰 집합, `notAfter` 조건 | `UNTRUSTED_KID` |
| 6 | `iat ≤ now + 300,000`(5분 시계 오차) | `FUTURE_IAT` |
| 7 | `canonicalize(S)` 성공 | `MALFORMED` |
| 8 | Ed25519 검증 | `BAD_SIGNATURE` |
| 9 | typ 별 본문 스키마(§3.3) | `MALFORMED` |
| — | 프로퍼티 없음(404)·항목 없음 | `ABSENT`(실패가 아니라 부재) |
| — | 서명 구현 불가 | `CRYPTO_UNAVAILABLE` |

수신 쪽 추가 판정(승인 앱만 — 우리는 DB 가 있다):

| code | 조건 |
|---|---|
| `STALE_REV` | `body.rev` < 저장된 수락 rev, 또는 같은 rev 인데 본문 지문이 다름 → 저장값 유지 |
| `STALE_CONTENT` | `rms.check` 의 결속 내용(started·seconds·authorId)이 현재 워크로그와 다름 → 그 점검은 없음 |
| `DISAPPEARED` | 이전에 VERIFIED 였던 org·pm 이 404·검증 실패 → 마지막 VERIFIED 유지(sticky, Q41) |

**재생 방지 범위**(요구 1):
- 다른 사이트·다른 엔티티로의 복사 → `cloudId`·`ent` 결속으로 차단(서명 실패).
- 같은 엔티티의 옛 값으로 되돌리기:
  - 워크포스→승인: `rev` 단조 증가(워크포스는 발행 시각 ms 를 rev 로 쓴다 — 상태 저장 불필요) + 승인 앱 DB 의 수락 rev 로 거부(`STALE_REV`). 점검(`rms.check`)은 캐시하지 않으므로 내용 결속(`started`·`seconds`·`authorId`)으로 막는다 — 옛 점검은 워크로그가 그대로일 때만 유효하다.
  - 승인→워크포스: 워크포스는 상태가 없어 막지 못한다(Q36). 완화 ① `h`(ts1 지문)가 현재 워크로그와 같아야 상태가 적용된다 ② 승인 앱 일일 대조(§4.5)가 우리 기록과 다른 문서를 재게시 ③ 미래 `iat` 거부.

### 3.2 `worklogSetHash` — 기존 ts1 지문과 같은 것이다

- **정의: `worklogSetHash ≡ timesheet_submission.content_hash`(`ts1:<hex64>`)**. 새 해시를 만들지 않는다. `snapshot.js` 의 `contentHashOf` 가 이미 "workforce-link 의 계약, 형식 변경 금지"로 동결돼 있다.
- 계산식(워크포스가 재구현할 바이트):
  ```
  lines  = 대상 워크로그를 worklogId 숫자 오름차순(길이 먼저, 같은 길이는 사전순)으로 정렬해
           각각 "<worklogId>|<issueId>|<startedMs>|<timeSpentSeconds>\n"
  input  = "ts1\n" + accountId + "\n" + periodKey + "\n" + lines.join("")
  hash   = "ts1:" + hex(SHA-256(UTF-8(input)))           // 소문자 hex 64
  ```
- 대상 워크로그 집합(정확히 `normalizeWorklogs`): 작성자 `author.accountId === accountId`, `ps ≤ startedMs < pe`, `timeSpentSeconds` 양의 정수, worklogId·issueId 는 `^\d{1,20}$`, 같은 id 중복은 하나.
- `startedMs` = Jira `started` 문자열(`2026-10-01T09:00:00.000+0900`)을 절대 시각 ms 로 파싱한 값(`parseJiraDateTime`). 워크포스는 같은 파싱을 써야 한다(시험 벡터에 경계 사례 포함).
- 기간 경계 `ps`·`pe` 는 **게시 항목에 실어 준다** — 워크포스가 우리 정책 타임존·단위를 알 필요가 없다.
- 상태별 `h` 의 의미:

| `st` | `h` 가 가리키는 스냅샷 | 워크포스 판정 |
|---|---|---|
| `SUBMITTED` | 제출 스냅샷 | 재계산 ≠ h → "제출 후 변경"(승인 앱은 곧 만료 처리) |
| `APPROVED` | 승인된 스냅샷 | 재계산 = h → **승인분**(원가 "승인분만"에 포함). ≠ → "승인 후 변경"(워크포스가 스스로 판정 — 우리 갱신을 기다리지 않는다, DESIGN §4.2) |
| `CHANGED_AFTER_APPROVAL` | 승인됐던 스냅샷 | 승인분 아님 |
| `REJECTED` | 반려된 스냅샷 | 승인분 아님 |
| `NOT_SUBMITTED` | 없음(h 생략) | 승인분 아님 |

- 한계: 재계산은 사용자×기간 **전체** 워크로그가 필요하다(프로젝트 화면의 일부만으로는 불가). 워크포스 화면별 요구 수준은 §12.5.
- 가시성 한계: 제출 지문은 대상자 asUser 수집이고, 워크포스가 asApp 으로 읽으면 대상자가 못 보던 자기 워크로그(가시성 제한)가 섞일 수 있다 → 불일치 쪽으로 틀린다(승인분 과소 — 안전한 방향). 실측 W15.

### 3.3 게시물 본문 스키마

#### 3.3.1 `approval.timesheet` — 사용자 프로퍼티 `movesApproval.{YYYY}`

`YYYY` = `periodKey.slice(0, 4)`(월 `2026-10` → 2026, ISO 주 `2026-W01` → ISO 주 연도 2026). 문서 값:

```js
{
  "v": 1,                                   // 봉투 버전(서명 안 됨 — 해석용)
  "kind": "movesApproval.timesheet",
  "accountId": "<대상자>",                  // 정보용, 서명 안 됨. 검증자는 조회한 URL 의 accountId 를 쓴다
  "year": "2026",
  "updatedAt": 1760000000000,               // 정보용
  "periods": {
    "<periodKey>": {                        // ← 서명 항목. ent = { accountId: URL 값, periodKey: 이 키 }
      "st":  "SUBMITTED" | "APPROVED" | "REJECTED" | "CHANGED_AFTER_APPROVAL" | "NOT_SUBMITTED",
      "cl":  true | false,                  // 사이트 마감 효력(발행 시점)
      "lk":  "PERIOD_CLOSED" | "PERIOD_SUBMITTED" | "PERIOD_APPROVED",   // 생략 = 잠김 아님. periodLockOf 결과 그대로
      "h":   "ts1:<hex64>",                 // NOT_SUBMITTED 면 생략
      "rq":  "<requestId uuid>",            // 최신 요청 id. 없으면 생략
      "sa":  1760000000000,                 // 최신 요청 제출 시각(created_at). 없으면 생략
      "at":  1760000000000,                 // 결정 시각(APPROVED·REJECTED·CHANGED_AFTER_APPROVAL 은 승인/반려 시각). 없으면 생략
      "ps":  1759244400000, "pe": 1761922800000,   // 기간 [ps, pe). 제출 스냅샷 값, 없으면 발행 시점 정책으로 계산
      "kid": "ap-prd-1", "iat": 1760000000000, "sig": "<86>"
    }
  }
}
```

- 항목을 **싣지 않는** 기간: `st=NOT_SUBMITTED` 이고 `cl=false` 이고 요청 이력도 없는 기간(부재 = 미제출·마감 아님으로 해석).
- 한 날짜를 두 항목이 덮을 수 있다(연중 단위 변경 MONTH↔WEEK). 워크포스 선택 규칙: 덮는 항목 중 `sa` 가 가장 큰 것, `sa` 없는 항목은 맨 뒤.
- **크기 상한 증명**(W6 — 32,768자): 항목 최대 = 위 키 전부 + 최장 값(`CHANGED_AFTER_APPROVAL`, kid 16자) ≈ 412자(맵 키·쉼표 포함). 한 문서의 항목 수 ≤ 12(월) + 53(주) = 65 → 65 × 412 + 봉투 ~150 ≈ **26,930자**. 테스트로 최악 조합 문서를 만들어 `≤ 30,000` 을 단언한다. 런타임에 30,000 을 넘으면 게시하지 않고 `PUBLISH_TOO_LARGE` 로그(나눌 키 설계는 넘는 사례가 생길 때).
- 상태 파생(순수 `approvalDoc.entryOf`): `periodStatusOf(latest)` 와 같은 규칙. PENDING→SUBMITTED, APPROVED(감지 없음)→APPROVED, APPROVED(감지)→CHANGED_AFTER_APPROVAL, REJECTED→REJECTED, EXPIRED·CANCELLED·없음→NOT_SUBMITTED(EXPIRED·CANCELLED 은 `rq`·`sa` 만 싣고 `h`·`at` 생략). `lk` 는 `periodLockOf({range, now, timeZone, autoCloseDays, lockSubmitted, closeRow, latest})` 결과.

#### 3.3.2 `approval.worklog` (후퇴안 — 계약만)

워크로그 프로퍼티 `movesApproval` 값 = 서명 항목 하나: `{ st, pk:"<periodKey>", h, rq, at, cl, lk, kid, iat, sig }`, `ent={issueId, worklogId}`. 빌더·검증 테스트만 만들고 게시 경로는 없다(`PUBLISH_MODE='USER'` 상수).

#### 3.3.3 `rms.org` — 사용자 프로퍼티 `movesRms.org` (워크포스가 쓴다)

```js
{
  "teamKey":  "<워크포스 teamKey>" | null,        // 대상자의 소속 팀(RFC-204: 팀장도 자기가 이끄는 팀 소속)
  "teamName": "<팀 표시 이름>" | null,             // 데이터(관리자 입력) — 결재선 단계 이름에 쓴다
  "leaderKeys": ["<accountId>", ...],             // 이 사람의 타임시트 결재자(≤10). 규칙은 §12.2
  "leads": [{ "teamKey", "teamName", "memberKeys": ["<accountId>", ...] }],   // 이 사람이 결재하는 팀원(팀장일 때). memberKeys ≤ 500
  "cap": ["check"],                               // 선택: 이 사용자 워크로그에 점검을 게시한다는 선언(Q35)
  "rev": 1760000000000,                           // 단조 증가 정수(권장: 발행 시각 ms)
  "kid", "iat", "sig"
}
```

- tombstone(소속 해제·사용자 삭제): `{ teamKey:null, teamName:null, leaderKeys:[], leads:[], rev, kid, iat, sig }`. 404·위조와 달리 **서명된 빈 값**이라 sticky 를 해제한다.
- 스키마 검증: accountId 는 `^[A-Za-z0-9:_-]{1,128}$`, teamKey `^[A-Za-z0-9:_-]{1,64}$`, teamName 1..120자 문자열, 배열 상한 초과 → `MALFORMED`.

#### 3.3.4 `rms.check` — 워크로그 프로퍼티 `movesRms.check`

```js
{ "codes": ["OVER_PLAN" | "OUT_OF_PERIOD" | "NOT_MEMBER" | <기타 ^[A-Z_]{1,32}$>],   // 빈 배열 = 점검 통과
  "authorId": "<accountId>", "started": <ms>, "seconds": <int>,                     // 내용 결속 — 현재 워크로그와 같아야 유효
  "rev": <int>, "kid", "iat", "sig" }
```

#### 3.3.5 `rms.pm` — 프로젝트 프로퍼티 `movesRms.pm`

`{ "pmKeys": ["<accountId>", ...] (0..20 — 빈 배열은 PM 해제 tombstone), "rev": <int>, "kid", "iat", "sig" }`

### 3.4 순수 함수 시그니처

| 파일 | 함수 | 입력 → 출력 |
|---|---|---|
| `canonical.js` | `canonicalize(value)` | → string · 오류 `CanonicalizationError` |
| `base64url.js` | `encode(buf)`, `decodeStrict(str, expectedLen)` | → string / Buffer \| null |
| `signature.js` | `messageBytes({typ, cloudId, ent, kid, iat, body})` | → Buffer |
| | `signEntry({typ, cloudId, ent, body, kid, iat, signer})` | → `{...body, kid, iat, sig}` (signer = `{sign(msg)→Buffer64}` 주입) |
| | `verifyEntry({...§3.1.7})` | → `{ok, body, kid, iat}` \| `{ok:false, code}` |
| | `selfTest(impl)` | → `'OK' \| 'FAIL'` |
| | `fingerprint(raw32)` | → `'ab12 cd34 ef56 7890'` |
| `keyring.js` | `trustedKids(family, {envList, keyring})`, `publicKeyOf(family, kid)` | → `Set` / raw32 \| null |
| `contract.js` | `TYP`, `PROPERTY_KEY`, `docKeyOf(periodKey)`(`movesApproval.2026`), `entOf(typ, ctx)`, `validateBody(typ, body)` | |
| `approvalDoc.js` | `entryBodyOf({periodKey, latest, submission, closeRow, policy, now})` | → body \| null(싣지 않음) |
| | `buildDoc({accountId, year, entries:[{periodKey, body}], cloudId, kid, now, signer})` | → `{ value, contentDigest, byteSize, entryCount }` |
| | `contentDigestOf(accountId, year, entries, kid)` | → hex64 — `iat`·`sig`·`updatedAt` 제외(바뀐 게 없으면 PUT 생략) |
| `inbound.js` | `orgViewOf(body, accountId)` | → `{teamKey:'wf:'+k, teamName, leaderKeys(본인 제외), leads:[{teamKey:'wf:'+k, teamName, memberKeys(본인 제외)}], capCheck}` |
| | `checkViolationsOf({checks: Map<worklogId, {ok, body}|{ok:false,code}>, entries, issues, timeZone, capCheck})` | → `{ violations, summary:{verified, stale, invalid, absent} }` |
| | `pmKeysOf(body, subjectId)` | → string[] |
| `domain/timesheet/limits.js` | `mergeViolations(self, workforce)` | → `{ violations(≤50, 정렬), total }` |

### 3.5 테스트 케이스 (도메인·계약)

1. 정규화: 키 정렬(대소문자·숫자 키 `"10"` vs `"9"`·한글 키) / 중첩 / 배열 순서 / `undefined`·소수·-0·NaN·BigInt·고립 서로게이트 거부 / 깊이·길이 한도.
2. `vectors.json` 골든: 고정 seed·cloudId·ent·body → message hex·sig 를 파일로 고정하고 재생성 결과와 비교(워크포스가 같은 파일로 교차 시험).
3. 서명 왕복(approval·rms 각 typ).
4. 변조: body 값 1개 변경 / 키 추가 / 키 삭제 / `iat` 변경 / `kid` 교체 / sig 1비트 → `BAD_SIGNATURE`.
5. 타 사이트 재사용: 다른 cloudId 로 검증 → `BAD_SIGNATURE`. 타 엔티티: 다른 accountId·periodKey·worklogId·projectId → `BAD_SIGNATURE`. 다른 typ(같은 본문을 `rms.org` ↔ `approval.timesheet`) → 계열 불일치 `UNKNOWN_KID`.
6. 키 불일치: 모르는 kid → `UNKNOWN_KID`, 신뢰 목록 밖 → `UNTRUSTED_KID`, `notAfter` 이후 iat → `UNTRUSTED_KID`, 다른 키로 서명된 같은 kid → `BAD_SIGNATURE`.
7. `iat` = now+5분 통과, +5분+1ms → `FUTURE_IAT`.
8. base64url 엄격: 패딩·`+`/`/`·85자 → `MALFORMED`.
9. `selfTest` 가 RFC 8032 TEST 1 로 OK.
10. `entryBodyOf` 상태 파생 표(§3.3.1) 전 분기 + 싣지 않는 경우 + `lk` 3종 + 정책 `lockSubmitted=false`.
11. 최악 크기 문서(65항목) `byteSize ≤ 30,000`.
12. `contentDigestOf` 는 `now`·`iat` 가 달라도 같다, 항목 하나 바뀌면 달라진다, kid 가 바뀌면 달라진다.
13. `worklogSetHash` = `contentHashOf` 동일성(같은 입력, 프리픽스 `ts1:`) + 경계 사례(started 가 `ps` 정확히 / `pe` 정확히 / `+0900` 과 `Z` 표기 같은 순간).
14. `orgViewOf`: 본인 제외, `wf:` 접두, leads 빈 배열, tombstone.
15. `checkViolationsOf`: 코드 매핑·모르는 코드 `WORKFORCE_OTHER`·형식 불량 rawCode 버림·내용 불일치 `stale`·`capCheck` 에 따른 `CHECK_MISSING` 유무·`date` 타임존.
16. `mergeViolations`: 정렬 순서·50 상한·total.
17. 순수성 grep: `src/integration/workforce`·`src/domain` 에 `Date.now`·`new Date()`·`@forge`·`requestJira` 0건.

## 4. 백엔드

### 4.1 구성 (`src/resolver/workforce/`)

| 파일 | 책임 | 부작용 |
|---|---|---|
| `WorkforceSigner.js` | 환경 변수 적재(지연·1회), 자가 시험 캐시, `sign(msg)`, `status()` | `process.env` 읽기만 |
| `WorkforcePropertyGateway.js` | 프로퍼티 GET/PUT. **asUser 함수와 asApp 함수를 분리**(WorklogCollector 와 같은 원칙). 404 → `null` | Jira |
| `WorkforceLinkRepository.js` | 3 테이블 SQL, `ready()` 프로브, SqlTime 경계 | SQL |
| `WorkforceOutbox.js` | `touch(accountId, periodKey, now)`, `touchYear(year, now)`, `touchMany(...)` — **절대 throw 안 함** | SQL |
| `WorkforcePublisher.js` | 펼침·변경 스캔·게시 배출·대조 | SQL + Jira asApp |
| `WorkforceInbound.js` | 수신 GET(asUser)·검증·캐시 반영·로그 | SQL + Jira asUser |
| `WorkforceOrgSource.js` | TeamScope·Routing 에 꽂히는 원천: `forSubject`, `ledScope`, `overriddenSubjects` | 위 Inbound 위임 |
| `WorkforceLinkService.js` / `WorkforceLinkController.js` | 신규 resolver 2 | |

`cloudId` 확보: resolver 는 `request.context.cloudId`, 트리거는 `context.cloudId` → 없으면 `context.installContext`(`ari:cloud:jira::site/<cloudId>`) 파싱(W7). 처음 얻은 값을 KVS `approval:link:cloudId` 에 저장(정책 키 맵 밖의 별도 키 — `SettingsPolicyKeys` 대조 대상 아님)하고 스윕은 저장값을 쓴다. 없으면 게시 `CLOUD_ID_UNKNOWN`·수신 검증 전부 단독 경로.

### 4.2 게시 — 아웃박스와 핫패스 touch

**핫패스는 PUT 하지 않는다.** touch(upsert 1문장)만 하고 예외는 삼킨다(`console.warn('[WF][touch] failed', code)`). Jira 호출은 5분 스윕만 한다 → 결정 50건 일괄 승인이 18초 예산을 잃지 않는다.

| touch 지점 | 함수 | 대상 |
|---|---|---|
| 제출 성공 | `TimesheetService.submitTimesheet` 끝 | (대상자, periodKey) |
| 팀장 일괄 결정 | `TimesheetService.decideTimesheets` 끝 — ok 결과 requestId 들로 `TimesheetRepository` 1회 조회 → touchMany | 각 (대상자, periodKey) |
| 감지(만료·CHANGED_AFTER_APPROVAL·마감 후 변경) | `TimesheetDriftService` 의 `closeBySystem`·`markDrift`·close drift 기록 성공 직후 | (대상자, periodKey) |
| 수동 마감·재개방 | `PeriodCloseService.closePeriod`·`reopenPeriod` 성공 | `touchYear(YYYY)` |
| 자동 마감 기록 | `PeriodCloseService.recordAutoCloses` 가 새 행을 남겼을 때 | `touchYear(YYYY)` |
| 정책 저장 | `SettingsService` — `approvalUnit`·`timesheetTimezone`·`timesheetLockSubmitted`·`timesheetAutoCloseDays` 변경 또는 `workforceLinkEnabled` false→true | 현재·이전 연도 `touchYear` |
| 엔진 경로(단건 결정·반려·회수·일괄 승인·기한 만료) | **touch 없음 → 변경 스캔(§4.3 ②)이 5분 안에 잡는다** | — 엔진 무변경 |

touch SQL(`account_id='*'` 는 연도 펼침 표식):

```sql
INSERT INTO workforce_publish
  (account_id, doc_key, pending, dirty_rev, published_rev, dirty_at, next_attempt_at, attempts, rev, created_at, updated_at)
VALUES (?, ?, 1, 1, 0, ?, ?, 0, 1, ?, ?)
ON DUPLICATE KEY UPDATE
  pending = 1, dirty_rev = dirty_rev + 1, dirty_at = VALUES(dirty_at),
  next_attempt_at = VALUES(next_attempt_at), attempts = 0, rev = rev + 1, updated_at = VALUES(updated_at)
```

(affectedRows 1·2 를 판정에 쓰지 않는다 — 함정 표.) 테이블 미준비면 touch 는 아무것도 하지 않는다(`ready()` 1회 memo).

### 4.3 5분 스윕 `runWorkforcePublish` (scheduledTrigger `workforce-publish`, fiveMinute)

리스: `approval_job_state` job `wf-publish`(리스 4분, 휴지 0 — 매 tick 실행 가능). 예산 **잔여 20초·Jira 요청 60**. 정책 꺼짐·키 미준비·cloudId 없음·자가 시험 실패면 ①②는 돌고(표식·dirty 는 쌓아 둔다) ③만 건너뛰며 `last_status`·`last_error` 에 상태 코드.

| 단계 | 내용 | 실패 시 |
|---|---|---|
| ① 펼침 | `account_id='*'` pending 행마다 연도 우주(아래) 계정을 100개씩 `touchMany`(다중 VALUES upsert). 끝까지 펼쳤을 때만 표식 `published_rev = 읽은 dirty_rev` | 중단 — 표식은 pending 유지, 다음 tick 이 처음부터 다시(멱등) |
| ② 변경 스캔 | job `wf-change-scan` 커서. `approval_request` 를 `ix_request_retention (is_open, updated_at, request_id)` 로 is_open=0·1 각각 키셋 페이지(`(updated_at, request_id) > (?, ?)` AND `target_kind='TIMESHEET'`, 200행) → touchMany → **touch 가 성공한 행까지만** 커서 전진 | 커서 미전진(AGENTS — 미완주 시 watermark 미전진). 첫 실행 커서 = now − 7일 + 현재·이전 연도 표식 touch(초기 전량 게시) |
| ③ 배출 | `pending=1 AND next_attempt_at <= now ORDER BY next_attempt_at LIMIT 50`. 행마다: DB 로 문서 재구성(§4.4) → `content_digest` 와 `published_kid` 가 같으면 PUT 생략 → 아니면 asApp PUT → 성공 처리 | 행 단위 실패: `attempts+1`, `next_attempt_at = now + min(5분 × 2^attempts, 6시간)`, `last_error_code`. 8회 이상은 24시간 간격(`stalled`). 403 이 한 tick 에 5회 연속이면 그 tick 중단 + `last_error='WRITE_DENIED'`(W2 실패 신호 — 관리 화면 `publish.state`) |

연도 우주(YYYY): `approval_request` TIMESHEET 중 `period_key LIKE 'YYYY%'` 의 `subject_account` ∪ `timesheet_team_member` MEMBER·LEAD ∪ `workforce_inbound` `rms.org` VERIFIED 계정 ∪ 그 본문 `leads[].memberKeys`. 상한 5,000(초과분은 로그 `UNIVERSE_TRUNCATED`).

성공 처리 SQL:

```sql
UPDATE workforce_publish
   SET published_rev = ?, pending = CASE WHEN dirty_rev > ? THEN 1 ELSE 0 END,
       content_digest = ?, published_digest = ?, published_kid = ?, published_at = ?,
       entry_count = ?, byte_size = ?, attempts = 0, last_error_code = NULL,
       rev = rev + 1, updated_at = ?
 WHERE account_id = ? AND doc_key = ? AND published_rev < ?
```

(`?` 의 읽은 `dirty_rev` 를 세 곳에. 게시 중 새 touch 가 오면 `dirty_rev` 가 커져 pending 이 1 로 남고 다음 tick 이 다시 게시 — 멱등.)

### 4.4 문서 재구성 — 진실은 우리 DB

`WorkforcePublisher.buildFor(accountId, year)`:
1. `TimesheetRepository` 신규 `listLatestForSubjectYear(accountId, 'YYYY')` — 그 사용자·그 연도 periodKey 별 최신 요청(revision 최대) + 부속 행(content_hash, period_start/end, drift_detected_at). SQL 1회(`ix_request_subject (subject_account, period_key)` + `period_key LIKE 'YYYY%'`).
2. `PeriodCloseRepository` — 그 연도 마감 행. SQL 1회.
3. 정책(KVS, tick 당 1회 memo).
4. 순수 `entryBodyOf` → `buildDoc`(서명). 큐 페이로드가 아니라 **현재 DB 로 매번 다시 만든다** → 순서가 뒤섞이거나 중복 실행돼도 결과가 같다.

### 4.5 일일 대조 (기존 `runSweep` 에 추가, job `wf-verify`)

- `published_at IS NOT NULL ORDER BY verified_at IS NULL DESC, verified_at LIMIT 100` → asApp GET 자기 게시물(사유 `workforce-publish-verify`) → `canonicalize(GET 값)` 의 SHA-256 ≠ `published_digest` 면 touch + 로그 `TAMPERED`, 404 면 touch + `MISSING_REMOTE`. `verified_at = now`.
- `workforce_link_log` 180일 지난 행 1,000건 정리.
- 예산 초과 시 남은 행은 다음 날(커서 불필요 — `verified_at` 순서가 커서 역할).

### 4.6 수신 — 검증·캐시·sticky (`WorkforceInbound`)

| 메서드 | 호출 | Jira |
|---|---|---|
| `orgOf(accountId, { selfRead, maxAgeMs=300_000 })` | Routing(대상자=호출자), TeamScope(팀장=호출자) | `selfRead && (캐시 없음 \|\| checked_at < now-maxAge)` 일 때만 asUser `GET /rest/api/3/user/properties/movesRms.org?accountId=` 1회. 남의 계정은 캐시만 |
| `pmOf(projectIds, { maxAgeMs=3_600_000 })` | Routing(EXTRA_STEP + 워크포스 위반일 때만) | 캐시 지난 프로젝트만 asUser `GET /rest/api/3/project/{id}/properties/movesRms.pm`, 최대 10개 |
| `checksOf(worklogs)` | TimesheetService(수집 직후) | **0** — `WorklogCollector` 가 `expand=properties` 로 함께 받은 값만 검증(W4). 캐시하지 않는다 |

캐시 반영 규칙(`workforce_inbound`, typ·entity_id 한 행):

| 이번 결과 | 저장 행 상태 | 반영 |
|---|---|---|
| VERIFIED, rev ≥ 저장 rev | 무엇이든 | `status='VERIFIED'`, `body_json`, `src_rev`, `kid`, `issued_at`, `verified_at=now`, `last_result='OK'` |
| VERIFIED, rev < 저장 rev(또는 같은 rev·다른 본문) | VERIFIED | 본문 유지, `last_result='STALE_REV'` + 로그 |
| ABSENT / 검증 실패 | VERIFIED | **본문 유지(sticky)**, `last_result=<code>`·`fail_count+1` + 로그(`DISAPPEARED` 또는 실패 코드) |
| ABSENT / 검증 실패 | 없음·NONE | `status='NONE'`, `last_result=<code>` (+ 실패면 로그) |
| tombstone(VERIFIED, 빈 본문) | 무엇이든 | VERIFIED + 빈 본문 → 워크포스 원천 없음으로 해석 |

- 갱신은 `rev` CAS(`WHERE typ=? AND entity_id=? AND rev=?`, `SET … rev = rev + 1`). CAS 실패는 재조회 1회 후 포기(다른 호출이 방금 갱신).
- Jira GET 실패(5xx·네트워크)는 "판정 불가" → 캐시 그대로 사용, 로그 안 남김(대신 `checked_at` 미갱신이라 다음 호출이 다시 시도).
- 로그 id = SHA-256(`direction|typ|entityId|code|sig 앞 16자`) — 결정적(불변식 6과 같은 정신). `INSERT … ON DUPLICATE KEY UPDATE last_at = VALUES(last_at), hit_count = hit_count + 1` — 같은 위조물이 반복돼도 행이 늘지 않는다.

### 4.7 팀장 원천 전환 — TeamScope·TimesheetAccess 두 곳 규칙 유지

범위 판정 지점은 여전히 **`TeamScope`(목록·가드·매트릭스) 와 `TimesheetAccess`(상세·이력·증명서·결정)** 두 곳뿐이다. `TimesheetAccess` 는 코드 변경 없음 — 이미 `scope.leads(viewer, subject)` 로 TeamScope 에 위임하므로 원천 전환을 그대로 물려받는다. 원천 합성은 TeamScope 의 `leadScope` 한 곳에 꽂는다.

```js
// TeamScope.createTeamScope({ repository, org = workforceOrgSource })
const leadScope = (leadId) => memo(`teamLead:${leadId}`, async () => {
  const roster = await repository.findLeadScope(leadId);                  // 기존. 실패 → throw(가드 false, fail-close)
  const wf = await org.ledScope(leadId).catch(() => EMPTY_SCOPE);         // 워크포스 실패 → 명부만(범위 축소 쪽)
  const overridden = await org.overriddenSubjects(roster.members.map((m) => m.accountId));   // 실패 → throw(fail-close)
  return {
    teams:   [...roster.teams.map(withSource('ROSTER')), ...wf.teams],     // wf.teams: teamKey 'wf:…', source 'WORKFORCE'
    members: [...roster.members.filter((m) => !overridden.has(m.accountId)), ...wf.members],
  };
});
```

- `org.ledScope(leadId)`: 정책 꺼짐 → 빈 값. `leadId === currentAccountId()`(호출 주체 — `InvocationScope` 에 `guardedDefine` 이 principal accountId 를 함께 넣는다, 신규 `currentAccountId()`)면 `selfRead:true`, 아니면 캐시만. VERIFIED 본문의 `leads` → teams·members(본인 제외).
- `org.overriddenSubjects(ids)`: `workforce_inbound` `rms.org` 에서 VERIFIED 이고 `leaderKeys`(본인 제외)가 비지 않은 계정 집합(SQL 1회, `whereIn` 빈 배열 가드). **이 사람들은 명부 팀장 범위에서 빠진다** — 워크포스가 결재자를 정한 사람에게 명부 팀장이 계속 접근하지 않게(우선순위 규칙 Q33).
- `isTeamLead(id)` = `ledTeams(id).length > 0` 그대로 → 워크포스 `leads` 만 있는 팀장도 `{teamLead}` 가드를 통과한다.
- `memberTeamOf` 는 명부 전용으로 남기고, Routing 이 원천을 고른다(아래).
- 결정 당시 결재자는 approver 행(제출 시점 고정)이 진실이다(불변식 2). 워크포스가 팀장을 바꿔도 진행 중 요청의 결재자는 바뀌지 않고, 새 팀장은 "현재 팀장"으로 열람만 된다 — 명부 모드와 같은 동작.

`TimesheetRouting.resolve(subjectId, { violations, policy, issues, workforce })`:

```
org = workforce.org(subjectId, selfRead:true)                 // 정책 꺼짐이면 null
if org VERIFIED && org.leaderKeys(본인 제외).length:
    steps = [{ approverKeys: leaderKeys, requiredApprovals: 1, stepName: org.teamName }]
    team  = { teamKey: 'wf:'+org.teamKey, teamName: org.teamName }, source = 'WORKFORCE'      // 2단계 그룹 없음(Q33)
else:
    기존 명부 경로(TIMESHEET_NO_TEAM / TIMESHEET_NO_APPROVER 그대로), source = 'ROSTER'
decision = violationDecision(allViolations, policy.timesheetViolationAction)                  // Q34 — 같은 정책
if decision.extraStep:
    self = 자체 위반 존재, wfv = 워크포스 위반 존재
    if self: steps.push(groupStep(timesheetExceptionGroup))                                    // 기존(없으면 INVALID_APPROVER_CONFIGURATION)
    if wfv:
        pms = workforce.pm(위반 워크로그 issueId → projectId 들, ≤10) 합집합 − 대상자
        if pms.length: steps.push({ approverKeys: pms, requiredApprovals: 1, stepName: null })  // 표시 이름은 프론트(extraStepSource)
        else if !self: steps.push(groupStep(timesheetExceptionGroup))                         // PM 없음 → 예외 그룹(없으면 INVALID_APPROVER_CONFIGURATION)
return { steps: normalizeSteps(steps), team, source, extraStepGroup, extraStepSource }
```

- 엔진 무변경: 예외 단계는 `normalizeSteps` 입력 배열에 한 항목을 더할 뿐이다. 같은 사람이 팀장·PM 이면 I6(앞 단계 우선 dedup)으로 PM 단계에서 빠지고, 비면 단계가 사라진다 — 팀장이 이미 승인하므로 통제가 약해지지 않는다.
- `extraStepSource`: 그룹만 `'GROUP'`, PM 만 `'WORKFORCE_PM'`, 둘 다 `'GROUP_AND_PM'`, 없음 null.

### 4.8 제출 경로의 판정 기록 (불변식 2 — "판정 결과는 우리 DB")

`submitTimesheet` 가 `timesheet_submission` 에 추가로 저장:
- `routing_source` (`'ROSTER'|'WORKFORCE'`)
- `link_json`(TEXT, ≤ 4KB): `{ v:1, org:{kid, rev, iat}|null, pm:[{projectId, kid, rev}], checks:{verified, stale, invalid, absent, missing}, extraStepSource }`
- 워크포스 위반은 기존 `violation_json`·`violation_count` 에 함께(위 §2.3 객체).
결재선 자체는 approver 행(기존). 증명서는 이번 회차에 필드 추가 없음(필요하면 `certificateExtra` 에 `routingSource` — 범위 밖 권고).

### 4.9 수집 변경 (`WorklogCollector.collectMine`)

- 이슈 워크로그 GET 에 `&expand=${'properties'}` 를 **별도 보간**으로 추가(route 인코딩 함정). 응답 워크로그의 `properties: [{key, value}]` 중 `movesRms.check` 만 남겨 `checksById` 로 돌려준다(W4 — 타 앱 프로퍼티가 안 실리면 `checks:'UNAVAILABLE'`, 위반 0, `CHECK_MISSING` 도 만들지 않는다: 플랫폼 탓을 사용자 위반으로 만들지 않는다).
- 검색 `fields` 의 `project` 에서 `id` 도 남겨 `issues` 맵에 `projectId`.
- 반환 shape 에 `checksById: Map`, `checksAvailable: boolean` 추가(기존 키 무변경).
- `getMyTimesheet`·`submitTimesheet` 의 `live`·`issues[]` 응답 shape 무변경(`projectId` 는 내부에서만).

### 4.10 asApp 사용 (불변식 8)

| 호출 | 사유 문자열 | 허용 근거 |
|---|---|---|
| `PUT /rest/api/3/user/properties/{key}?accountId=` | `workforce-publish` | AGENTS 허용 2번 |
| `GET /rest/api/3/user/properties/{key}?accountId=`(자기 게시물 대조) | `workforce-publish-verify` | 허용 2번 확장 — AGENTS.md 문구 갱신: "워크포스 연동 프로퍼티 게시(사용자×기간 승인 상태)와 **게시물 대조용 재조회**" |

- 수신(org·pm·check)은 **전부 asUser**(본인 프로퍼티·본인 워크로그·열람 가능한 프로젝트). 새 asApp 허용 항목 없음.
- asApp 결과는 지문 비교에만 쓰고 어떤 resolver 응답에도 싣지 않는다. `WorkforcePropertyGateway` 의 asApp 함수는 `WorkforcePublisher` 만 import 한다(테스트로 단언 — import 그래프 grep).

### 4.11 백엔드 테스트 목록

- Outbox: touch 가 SQL 예외를 삼킨다 / 미준비면 no-op / 같은 키 두 번 → dirty_rev 2.
- Publisher: 펼침 중단 시 표식 pending 유지 / 변경 스캔 touch 실패 시 커서 미전진 / 키셋 동률(같은 updated_at) / 배출 성공 SQL 에 `rev = rev + 1`·`published_rev < ?` / 게시 중 touch → pending 유지 / content_digest 같으면 PUT 0회 / kid 바뀌면 PUT / 403 5연속 → tick 중단·`WRITE_DENIED` / 백오프 계산 / 정책 꺼짐이면 PUT 0회·dirty 유지 / 30,000자 초과 → `PUBLISH_TOO_LARGE`.
- Inbound: sticky(VERIFIED 뒤 404·위조 → 본문 유지 + 로그) / tombstone 해제 / `STALE_REV` / 남의 계정은 Jira 0회 / GET 5xx → 캐시 사용·로그 없음 / 로그 id 결정적·반복 시 hit_count.
- TeamScope: 워크포스 leads 만 있는 팀장 가드 통과 / overridden 명부 구성원 제외 / 워크포스 실패 → 명부만 / overridden SQL 실패 → 가드 false / 다른 팀장의 워크포스 팀원 요청 결정 → 건별 `PERMISSION_TARGET_VIEW_DENIED`(쓰기 대칭, 기존 R4 테스트 확장).
- Routing: 워크포스 원천 1단계 / leaderKeys 가 본인뿐 → 명부 폴백 / EXTRA_STEP + 워크포스 위반 + PM → PM 단계 / PM 없음 → 예외 그룹 / 둘 다 없음 → `INVALID_APPROVER_CONFIGURATION` / 팀장=PM dedup / WARN 이면 단계 없음 / BLOCK 이면 `TIMESHEET_LIMIT_BLOCKED` cause 에 워크포스 위반 포함.
- 연동 꺼짐·게시물 없음: **기존 529 테스트가 그대로 녹색**(요구 완료 기준) + Jira 추가 호출 0 단언(collectMine 의 expand 는 켜짐일 때만 붙인다).
- 계약 테스트: 신규 resolver 2 의 3단계 등록, 정책 키 `workforceLinkEnabled` 기본값↔KVS 맵.

## 5. 스키마·마이그레이션 (뒤에만 append, 기존 이름 무변경)

| 이름 | 내용 |
|---|---|
| `v024_alter_timesheet_submission_routing_source` | `ALTER TABLE timesheet_submission ADD COLUMN IF NOT EXISTS routing_source VARCHAR(16) NULL` |
| `v025_alter_timesheet_submission_link_json` | `ALTER TABLE timesheet_submission ADD COLUMN IF NOT EXISTS link_json TEXT NULL` |
| `v026_create_workforce_publish_table` | 아래 |
| `v027_create_workforce_inbound_table` | 아래 |
| `v028_create_workforce_link_log_table` | 아래 |

ALTER 는 문장당 컬럼 하나(Forge SQL 단일 문장·멱등). `migrate.test.js` 의 멱등 DDL 정규식이 `ADD COLUMN IF NOT EXISTS` 를 허용하는지 확인하고 아니면 그 형태만 추가 허용.

```sql
CREATE TABLE IF NOT EXISTS workforce_publish (
    account_id        VARCHAR(128) NOT NULL,          -- '*' = 연도 펼침 표식
    doc_key           VARCHAR(32)  NOT NULL,          -- 'movesApproval.2026'
    pending           TINYINT(1)   NOT NULL DEFAULT 1,
    dirty_rev         INT          NOT NULL DEFAULT 1,
    published_rev     INT          NOT NULL DEFAULT 0,
    dirty_at          TIMESTAMP    NOT NULL,
    next_attempt_at   TIMESTAMP    NOT NULL,
    attempts          INT          NOT NULL DEFAULT 0,
    last_error_code   VARCHAR(32)  NULL,
    content_digest    CHAR(64)     NULL,
    published_digest  CHAR(64)     NULL,
    published_kid     VARCHAR(16)  NULL,
    published_at      TIMESTAMP    NULL,
    verified_at       TIMESTAMP    NULL,
    entry_count       INT          NULL,
    byte_size         INT          NULL,
    rev               INT          NOT NULL DEFAULT 1,
    created_at        TIMESTAMP    NOT NULL,
    updated_at        TIMESTAMP    NOT NULL,
    PRIMARY KEY (account_id, doc_key),
    INDEX ix_wf_pub_due (pending, next_attempt_at),
    INDEX ix_wf_pub_verify (verified_at)
)

CREATE TABLE IF NOT EXISTS workforce_inbound (
    typ           VARCHAR(16)  NOT NULL,              -- 'rms.org' | 'rms.pm'
    entity_id     VARCHAR(128) NOT NULL,              -- accountId | projectId
    status        VARCHAR(16)  NOT NULL,              -- 'VERIFIED' | 'NONE'
    body_json     TEXT         NULL,                  -- 검증 통과 본문만(kid·iat·sig 제외)
    src_rev       BIGINT       NULL,
    kid           VARCHAR(16)  NULL,
    issued_at     TIMESTAMP    NULL,
    last_result   VARCHAR(24)  NOT NULL,              -- 'OK' | 'ABSENT' | 검증 결과 코드
    fail_count    INT          NOT NULL DEFAULT 0,
    checked_at    TIMESTAMP    NOT NULL,
    verified_at   TIMESTAMP    NULL,
    rev           INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (typ, entity_id),
    INDEX ix_wf_in_status (typ, status, verified_at)
)

CREATE TABLE IF NOT EXISTS workforce_link_log (
    log_id      CHAR(64)     NOT NULL,                -- sha256(direction|typ|entityId|code|sig16) hex
    direction   VARCHAR(4)   NOT NULL,                -- 'IN' | 'OUT'
    typ         VARCHAR(24)  NOT NULL,
    entity_id   VARCHAR(160) NOT NULL,
    code        VARCHAR(32)  NOT NULL,
    first_at    TIMESTAMP    NOT NULL,
    last_at     TIMESTAMP    NOT NULL,
    hit_count   INT          NOT NULL DEFAULT 1,
    PRIMARY KEY (log_id),
    INDEX ix_wf_log_last (last_at)
)
```

- 시각 바인딩은 전부 `SqlTime.toSqlTimestamp`. `issued_at`·`published_at` 등 epoch → TIMESTAMP 경계 동일.
- 프로브: `WorkforceLinkRepository.ready()` = 세 테이블 `isTableReady`. 신규 컬럼(v024·v025)은 `TableReadiness` 에 `isColumnReady(table, column)`(`information_schema.columns`, invocation memo)를 추가해 확인한다. 미적용이면 `insertSubmission` 은 기존 컬럼만으로 INSERT 하고(판정 기록만 빠짐, 제출은 막지 않음) `getTimesheetDetail.routingSource` 는 null.
- 보관: `RetentionRepository` 무변경(요청 자식 테이블 아님). 로그 180일 정리는 §4.5. `StorageService` 는 테이블 전체를 자동 나열(무변경).

## 6. Jira 연결

### 6.1 manifest

```yaml
scheduledTrigger:
  # 워크포스 연동 게시 — 아웃박스 배출 + 변경 스캔. 핫패스는 touch 만 하고 PUT 은 여기서만(asApp, AGENTS 허용 2번).
  - key: workforce-publish
    function: runWorkforcePublish
    interval: fiveMinute
function:
  - key: runWorkforcePublish
    handler: index.runWorkforcePublish
```

scheduledTrigger 3개(한도 5). `src/index.js` 에 `export { runWorkforcePublish } from './trigger/runWorkforcePublish'`(얇은 어댑터, throw 안 함). 배포 시 `--upgrade`(모듈 추가).

### 6.2 REST

| 호출 | 주체 | 언제 | 등급 |
|---|---|---|---|
| `GET /rest/api/3/user/properties/movesRms.org?accountId=<self>` | asUser | getTimesheetContext·getMyTimesheet·submit·{teamLead} 가드(캐시 5분) | 문서(경로) / 미검증 W3(본인 읽기 권한) |
| `GET /rest/api/3/issue/{id}/worklog?…&expand=properties` | asUser | 수집(기존 호출에 파라미터만) | 미검증 W4 |
| `GET /rest/api/3/project/{id}/properties/movesRms.pm` | asUser | EXTRA_STEP + 워크포스 위반(캐시 1시간, ≤10) | 미검증 W10 |
| `PUT /rest/api/3/user/properties/movesApproval.{YYYY}?accountId=` | asApp | 5분 스윕 | 미검증 W2 |
| `GET` 같은 경로 | asApp | 일일 대조 | 미검증 W2 |

### 6.3 scope

추가 없음으로 시작: 사용자 프로퍼티 읽기 `read:jira-user`, 쓰기·프로젝트/워크로그 프로퍼티 `read:jira-work`·`write:jira-work` 로 덮인다고 **가정**(W11). 실측에서 `write:jira-user` 등이 필요하면 scope 추가 + `forge install --upgrade` — manifest 주석에 W11 을 적는다.

### 6.4 환경 변수 (배포 회차, 사람이 설정)

```
forge variables set --encrypt -e <env> MOVES_LINK_SIGNING_KEY <seed base64url 43자>
forge variables set -e <env> MOVES_LINK_SIGNING_KID ap-<env>-1
forge variables set -e <env> MOVES_LINK_TRUSTED_KIDS wf-<env>-1      # 선택
```

환경 변수는 환경 단위(설치 단위 아님) — 같은 환경의 모든 설치가 같은 키를 쓴다. 사이트 간 재사용은 `cloudId` 결속이 막는다(W9 — `process.env` 접근 실측).

## 7. 프론트

| 화면 | 변경 |
|---|---|
| 설정(adminPage) | `SettingsPage.jsx` 탭 맵에 `workforce: WorkforceLinkSettings` 추가. 신규 `features/settings/WorkforceLinkSettings.jsx`: ① 연동 켬/끔 토글(기존 정책 저장 `saveApprovalSettings({workforceLinkEnabled})`) ② 상태 카드(`crypto`·`signing`(지문·kid·inKeyring)·`cloudIdKnown`·`publish.state`) ③ 게시 요약(pending·failed·stalled·published·마지막 게시·마지막 오류) ④ 수신 요약(org·pm 검증 수·마지막 검증) ⑤ 최근 실패 표(방향·종류·대상·코드·횟수·마지막 시각, 대상 accountId 는 기존 사용자 표시 컴포넌트로 이름) ⑥ [실패분 재게시]·[전체 재게시] 버튼(`republishWorkforceLink`) — 결과 `resetCount`·`markerCount` 를 토스트로 ⑦ 수용 문장(아래) |
| 내 타임시트 | `routing.source==='WORKFORCE'` 면 팀 이름 옆 배지 "워크포스". `routing.extraStepSource` 로 예외 단계 안내 문구. 위반 목록이 새 코드(§2.3)를 문구로 — `source==='WORKFORCE'` 면 출처 태그. `workforce.checks==='UNAVAILABLE'` 는 표시 안 함(관리자 화면에서만 의미) |
| 팀 매트릭스 | 팀 선택기 항목에 `source` 배지. `teamKey` 에 `wf:` 접두가 와도 그대로 다시 보낸다(파싱 금지) |
| 타임시트 상세 | `routingSource`·`extraStepSource` 표시, 워크포스 위반 문구 |
| 쿼리키 | `settingsKeys.workforceLink: () => [...settingsKeys.all, 'workforceLink']`(팩토리). 재게시·정책 저장 후 무효화. 정책 저장은 기존 `settingsKeys.policy()` 무효화에 더해 `workforceLink()` |

에러 분기는 `error.code`: `WORKFORCE_LINK_DISABLED` → 토글 안내, `WORKFORCE_SIGNING_UNAVAILABLE` → 상태 카드 안내. 신규 엔트리 없음(엔트리 3곳 변경 없음). `100vh` 금지 규칙 유지.

수용 문장(설정 화면, 의미 유지):
> **워크포스 연동은 두 앱이 서명한 Jira 프로퍼티로만 정보를 주고받습니다. 게시는 몇 분 늦을 수 있고, 서명이 맞지 않는 정보는 쓰지 않고 이 앱 자체 설정으로 동작합니다.**

## 8. i18n 키 (kr / en 동시, `npm run merge`)

### 8.1 `workforce.json` (신규 네임스페이스)

| 키 | kr | en |
|---|---|---|
| `workforce.title` | 워크포스 연동 | Workforce integration |
| `workforce.notice.acceptance` | (§7 수용 문장) | Workforce integration exchanges information only through Jira properties signed by both apps. Publishing may lag by a few minutes, and unsigned or invalid information is ignored in favor of this app's own settings. |
| `workforce.enabled.label` | 워크포스 연동 사용 | Use Workforce integration |
| `workforce.enabled.help` | 끄면 게시와 검증을 멈추고 이 앱 설정(팀 명부·자체 제한선)만 씁니다. 이미 게시한 정보는 지우지 않습니다. | When off, publishing and verification stop and only this app's settings (team roster, own limits) are used. Already-published data is not removed. |
| `workforce.crypto.ok` | 서명 기능 정상 | Signing available |
| `workforce.crypto.fail` | 이 환경에서 서명 기능을 쓸 수 없습니다 | Signing is not available in this environment |
| `workforce.signing.kid` | 키 ID | Key ID |
| `workforce.signing.fingerprint` | 공개키 지문 | Public key fingerprint |
| `workforce.signing.notConfigured` | 서명 키가 설정되지 않았습니다 | Signing key is not configured |
| `workforce.signing.notInKeyring` | 이 키가 앱에 내장된 공개키 목록에 없어 워크포스가 검증할 수 없습니다 | This key is not in the embedded key ring, so Workforce cannot verify it |
| `workforce.cloudId.unknown` | 사이트 정보를 아직 확인하지 못했습니다. 앱 화면을 한 번 열면 확인됩니다 | Site information is not known yet. Open any app page once to record it |
| `workforce.publish.title` | 승인 상태 게시 | Approval status publishing |
| `workforce.publish.state.OK` | 정상 | Normal |
| `workforce.publish.state.DISABLED` | 꺼짐 | Off |
| `workforce.publish.state.KEY_NOT_CONFIGURED` | 서명 키 없음 | No signing key |
| `workforce.publish.state.CRYPTO_UNAVAILABLE` | 서명 기능 없음 | Signing unavailable |
| `workforce.publish.state.CLOUD_ID_UNKNOWN` | 사이트 정보 없음 | Site unknown |
| `workforce.publish.state.WRITE_DENIED` | Jira 가 사용자 프로퍼티 쓰기를 거부합니다 | Jira denies writing user properties |
| `workforce.publish.state.STORAGE_NOT_READY` | 저장소 준비 중 | Storage not ready |
| `workforce.publish.pending` | 대기 {{count}}건 | {{count}} pending |
| `workforce.publish.failed` | 실패 {{count}}건 | {{count}} failed |
| `workforce.publish.stalled` | 반복 실패 {{count}}건 | {{count}} repeatedly failing |
| `workforce.publish.published` | 게시됨 {{count}}건 | {{count}} published |
| `workforce.publish.lastAt` | 마지막 게시 | Last published |
| `workforce.publish.lastError` | 마지막 오류 | Last error |
| `workforce.inbound.title` | 워크포스 정보 검증 | Workforce data verification |
| `workforce.inbound.org` | 팀·팀장 | Teams and leads |
| `workforce.inbound.pm` | 프로젝트 PM | Project PMs |
| `workforce.inbound.check` | 워크로그 점검 | Worklog checks |
| `workforce.inbound.verified` | 검증 {{count}} | {{count}} verified |
| `workforce.inbound.invalid` | 검증 실패 {{count}} | {{count}} failed |
| `workforce.failures.title` | 최근 실패 | Recent failures |
| `workforce.failures.empty` | 최근 실패가 없습니다 | No recent failures |
| `workforce.failures.direction.IN` | 받기 | Inbound |
| `workforce.failures.direction.OUT` | 게시 | Outbound |
| `workforce.failures.count` | {{count}}회 | {{count}} times |
| `workforce.typ.approval.timesheet` | 타임시트 승인 상태 | Timesheet approval status |
| `workforce.typ.rms.org` | 팀·팀장 | Team and lead |
| `workforce.typ.rms.check` | 워크로그 점검 | Worklog check |
| `workforce.typ.rms.pm` | 프로젝트 PM | Project PM |
| `workforce.code.MALFORMED` | 형식 오류 | Malformed |
| `workforce.code.VERSION_UNSUPPORTED` | 지원하지 않는 버전 | Unsupported version |
| `workforce.code.UNKNOWN_KID` | 모르는 키 | Unknown key |
| `workforce.code.UNTRUSTED_KID` | 신뢰하지 않는 키 | Untrusted key |
| `workforce.code.FUTURE_IAT` | 미래 시각 서명 | Signed in the future |
| `workforce.code.BAD_SIGNATURE` | 서명 불일치 | Signature mismatch |
| `workforce.code.STALE_REV` | 이전 버전 | Older revision |
| `workforce.code.STALE_CONTENT` | 워크로그 내용과 다름 | Does not match worklog |
| `workforce.code.DISAPPEARED` | 사라지거나 바뀜(이전 값 유지) | Removed or altered (previous value kept) |
| `workforce.code.CRYPTO_UNAVAILABLE` | 서명 기능 없음 | Signing unavailable |
| `workforce.code.PUBLISH_FORBIDDEN` | 쓰기 거부 | Write denied |
| `workforce.code.PUBLISH_FAILED` | 게시 실패 | Publish failed |
| `workforce.code.PUBLISH_TOO_LARGE` | 크기 초과 | Too large |
| `workforce.code.TAMPERED` | 게시물이 바뀌어 재게시 | Altered, republished |
| `workforce.code.MISSING_REMOTE` | 게시물이 없어져 재게시 | Missing, republished |
| `workforce.code.UNIVERSE_TRUNCATED` | 대상 사용자 수 상한 초과 | Too many users |
| `workforce.code.UNKNOWN` | 알 수 없는 오류 | Unknown error |
| `workforce.republish.failed` | 실패분 재게시 | Retry failed |
| `workforce.republish.all` | 전체 재게시 | Republish all |
| `workforce.republish.done` | 재게시를 예약했습니다. 몇 분 안에 반영됩니다 | Republish scheduled. It will apply within a few minutes |
| `workforce.source.ROSTER` | 앱 명부 | App roster |
| `workforce.source.WORKFORCE` | 워크포스 | Workforce |

(프론트는 모르는 code 를 `workforce.code.UNKNOWN` 으로.)

### 8.2 `timesheet.json` 추가

| 키 | kr | en |
|---|---|---|
| `timesheet.violation.OVER_PLAN` | {{date}} 계획 대비 초과(워크포스) | {{date}} exceeds plan (Workforce) |
| `timesheet.violation.OUT_OF_PERIOD` | {{date}} 참여 기간 밖(워크포스) | {{date}} outside participation period (Workforce) |
| `timesheet.violation.NOT_MEMBER` | {{date}} 프로젝트 미소속(워크포스) | {{date}} not a project member (Workforce) |
| `timesheet.violation.WORKFORCE_OTHER` | {{date}} 워크포스 점검 위반({{rawCode}}) | {{date}} Workforce check violation ({{rawCode}}) |
| `timesheet.violation.CHECK_MISSING` | {{date}} 워크포스 점검 결과 없음 | {{date}} no Workforce check result |
| `timesheet.routing.source.WORKFORCE` | 워크포스 팀 | Workforce team |
| `timesheet.routing.source.ROSTER` | 앱 팀 명부 | App team roster |
| `timesheet.routing.extraStep.WORKFORCE_PM` | 워크포스 위반으로 프로젝트 PM 승인 단계가 추가됩니다 | A project PM approval step is added due to Workforce violations |
| `timesheet.routing.extraStep.GROUP_AND_PM` | 위반으로 예외 승인 그룹과 프로젝트 PM 단계가 추가됩니다 | Exception group and project PM steps are added due to violations |
| `timesheet.routing.extraStep.pmStepName` | 프로젝트 PM 예외 승인 | Project PM exception approval |

(기존 `GROUP` 문구는 기존 키 재사용.)

### 8.3 `error.json` / `policy.json`

| 키 | kr | en |
|---|---|---|
| `error.WORKFORCE_LINK_DISABLED` | 워크포스 연동이 꺼져 있습니다 | Workforce integration is turned off |
| `error.WORKFORCE_SIGNING_UNAVAILABLE` | 서명 키가 없거나 서명 기능을 쓸 수 없어 게시할 수 없습니다 | Cannot publish: signing key missing or signing unavailable |
| `policy.audit.area.workforceLink` | 워크포스 연동 | Workforce integration |
| `policy.audit.action.republish` | 재게시 | Republish |

## 9. 용량·호출량 (200명, 월 단위 기본)

### 9.1 저장

| 테이블 | 연 행 수 | 행 크기 | 연 용량 |
|---|---|---|---|
| `workforce_publish` | 사용자 × 연도 ≈ 200 × 2(올해·작년 유지) + 표식 = 약 400(누적 3년 600) | ~400B | < 1MB |
| `workforce_inbound` | org 200 + pm ~50 = 250(갱신만, 증가 없음) | 일반 ~1KB, 팀장 최대 ~25KB | ~1MB |
| `workforce_link_log` | 서로 다른 실패만(결정적 id), 180일 정리 | ~250B | 수백 KB |
| `timesheet_submission` 추가 컬럼 | 2,400 요청/년 | +~300B | ~0.7MB |
| **합계** | | | **연 3MB 미만** (1 GiB 대비 무시) |

워크포스 쪽: DB 증가 0(§12). Jira 저장소: 사용자당 연 1문서(≤27KB, 보통 12항목 ≈ 5KB).

### 9.2 Jira 호출

| 경로 | 기존 | 추가 |
|---|---|---|
| `getTimesheetContext`(모든 사용자의 업무함 진입) | — | org GET 0~1(캐시 5분) |
| `getMyTimesheet` | 수집 N | org 0~1, **check 0**(expand), pm 0~10(EXTRA_STEP+워크포스 위반일 때만, 캐시 1시간) |
| `submitTimesheet` | 수집 N | 위와 같음 |
| `{teamLead}` 가드 resolver(매트릭스·일괄 결정) | — | org 0~1(같은 호출 안 memo, 캐시 5분) |
| 팀장 일괄 승인 50명 | — | resolver 안 **0**(touch SQL 1회) → 5분 스윕이 PUT 50(한 tick 예산 60 안) |
| 사이트 마감 1회 | — | 펼침 200 touch → PUT 200 = 4 tick(약 20분) |
| 5분 스윕 평시 | — | 변경 스캔 SQL 2~4, 배출 PUT 0~60 |
| 일일 대조 | — | GET ≤100(600문서 6일 주기) |

N+1 없음: 점검은 기존 워크로그 GET 에 동봉, PM 은 위반 프로젝트만·상한 10, org 는 호출 주체 본인 1건.

## 10. 미검증 (W 번호 — 배포 회차 스파이크)

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| W1 | Forge runtime(nodejs22.x)에서 `node:crypto` Ed25519 서명·검증, PKCS#8/SPKI DER 적재 | 연동 전체. 실패 시 noble 대체(§3.1.6) | 배포 후 설정 > 워크포스 연동 `crypto.selfTest==='OK'` |
| W2 | 앱(asApp)이 **다른 사용자**의 사용자 프로퍼티 PUT/GET | 게시 경로 전체. 실패 시 Q31 후퇴안(워크로그 단위) | 승인 1건 후 5분 내 `publish.published≥1`, 403 이면 `state:'WRITE_DENIED'`. Jira REST 로 그 사용자 프로퍼티 GET |
| W3 | 사용자가 asUser 로 **자기** 사용자 프로퍼티 GET(타 앱이 쓴 키 포함) | 결재선·팀장 원천. 실패 시 항상 명부 | 테스트용 서명 org 문서를 관리자 REST 로 써 넣고 `getMyTimesheet.routing.source` |
| W4 | `GET issue/{id}/worklog?expand=properties` 가 **타 앱이 쓴** 워크로그 프로퍼티를 싣는가 | 워크포스 위반. 실패 시 `checks:'UNAVAILABLE'`(위반 0) | 워크로그에 `movesRms.check` 를 써 두고 `getMyTimesheet.workforce.checks` |
| W5 | 엔티티 프로퍼티가 앱별로 격리되지 않고 같은 키를 두 앱이 읽고·덮을 수 있는가(키 충돌·권한) | 계약 성립. 격리되면 상대 게시물을 못 읽는다(전 기능 단독) | 두 앱 동시 설치 dev 사이트에서 서로의 키 GET/PUT |
| W6 | 프로퍼티 값 32,768자 한도·키에 `.` 허용·숫자(13자리 ms) 정밀도 보존 | 문서 크기·지문 대조 | 최악 크기 문서 PUT→GET 후 `published_digest` 일치 |
| W7 | scheduledTrigger·product trigger 의 `context.cloudId` / `installContext` | 게시. 없으면 resolver 에서 학습한 KVS 값 | 스윕 로그 `cloudIdKnown` |
| W8 | 일반 사용자가 자기 사용자 프로퍼티를 쓰고 지울 수 있는가(위협 모델 가정) | 사실이면 sticky·서명이 필요(설계대로), 아니면 위협 축소 | 비관리자 토큰으로 PUT/DELETE |
| W9 | `forge variables --encrypt` 값이 모든 함수 컨텍스트(resolver·trigger)에서 `process.env` 로 보이는가 | 서명 | `signing.configured` |
| W10 | 프로젝트 열람 권한자(비 관리자)가 asUser 로 프로젝트 프로퍼티 GET | PM 예외 단계. 실패 시 예외 그룹 | EXTRA_STEP 정책 + 위반 워크로그로 제출 → `extraStepSource` |
| W11 | 사용자 프로퍼티 쓰기·읽기에 필요한 scope(현재 `read:jira-user`·`read/write:jira-work` 로 충분한가) | 배포·게시 | `forge lint` + W2 결과 |
| W12 | 앱 제거 시 그 앱이 쓴 엔티티 프로퍼티가 남는가 | 워크포스 제거 사이트의 stale org(Q41) | 제거 후 GET |
| W13 | 5분 tick 당 PUT 60·연속 수백 PUT 의 rate limit | 마감 펼침 속도 | 200 PUT 펼침 후 429 여부·`attempts` |
| W14 | 사용자 프로퍼티 GET 응답이 저장 JSON 을 의미 보존(키 순서 무관) — 정규화 지문 비교 | 일일 대조 오탐 | W6 과 함께 |
| W15 | 가시성 제한 워크로그의 asUser(대상자)·asApp(워크포스) 차이 | ts1 재계산 불일치(과소 승인 쪽) | 가시성 제한 워크로그를 넣고 워크포스 재계산 비교 |
| W16 | `InvocationScope` 호출 주체 전달(AsyncLocalStorage — 기존 T10 과 같은 전제) | selfRead 판정. 없으면 캐시만 → 워크포스 팀장 범위가 늦게 반영 | 워크포스 팀장 첫 진입 시 매트릭스 행 |

## 11. 작업 분해

### 11.1 backend 체크리스트

- [ ] `src/integration/workforce/{canonical,base64url,signature,keyring,contract,approvalDoc,inbound}.js` + `vectors.json` + 테스트(§3.5 1~15, 17)
- [ ] `keyring.js` 는 dev 공개키 자리만(`approval`·`workforce` 빈 맵 + 주석으로 등록 절차). 실제 키는 사람이 생성(Q39)
- [ ] `scripts/workforce-link/gen-key.mjs`(실행하지 않는다)
- [ ] `limits.js` `mergeViolations`·코드 순서(§3.5-16)
- [ ] 마이그레이션 v024~v028 + `ddl/workforceLink.sql.js` + `ddl/index.js` + `migrate.test.js` 정규식 + `TableReadiness.isColumnReady`
- [ ] `src/resolver/workforce/*`(§4.1) — Gateway asUser/asApp 분리, Outbox throw 금지, Publisher 3단계·예산·리스·백오프, Inbound sticky·rev CAS·결정적 로그, Signer 지연 적재·자가 시험
- [ ] `InvocationScope.currentAccountId()` + `permissionGuard` 가 principal 을 넣는다
- [ ] `TeamScope` 원천 합성(§4.7), `TimesheetRouting` 원천 선택·PM 단계, `TimesheetAccess` 무변경 확인
- [ ] `WorklogCollector` `expand=properties`(정책 켬일 때만)·`project.id`·`checksById`
- [ ] `TimesheetService` — context/my/submit/matrix/detail 추가 필드(§2.2), 제출 `routing_source`·`link_json` 저장, touch 지점(§4.2)
- [ ] `TimesheetRepository.listLatestForSubjectYear`, `insertSubmission` 신규 컬럼
- [ ] `TimesheetDriftService`·`PeriodCloseService`·`SettingsService` touch
- [ ] `SettingsRepository` 정책 키 `workforceLinkEnabled`(기본 true, GLOBAL_ONLY) + KVS 맵
- [ ] `ErrorCodes` 2개
- [ ] 신규 resolver 2: Controller `guardedDefine` + `PermissionMap`(`{admin:true}`) + `CONTROLLER_REGISTRARS`(`registerWorkforceLinkController`)
- [ ] `src/trigger/runWorkforcePublish.js` + `index.js` export + manifest(§6.1), 일일 `runSweep` 에 대조·로그 정리
- [ ] KVS `approval:link:cloudId` 학습(첫 resolver 호출, 실패 무시)
- [ ] AGENTS.md asApp 허용 2번 문구(§4.10)
- [ ] 테스트 §4.11 + 기존 529 녹색, 연동 꺼짐/게시물 없음에서 Jira 추가 호출 0 단언
- [ ] `02_backend_report.md` 에 실제 shape·차이·W 결과 칸

### 11.2 frontend 체크리스트

- [ ] `SettingsPage.jsx` 탭 `workforce` + `WorkforceLinkSettings.jsx`(§7) + 테스트(상태별 표시, 재게시 결과, 에러 코드 2 분기)
- [ ] `settingsKeys.workforceLink()` 팩토리, 무효화 규칙
- [ ] 내 타임시트·팀 매트릭스·상세: 원천 배지, `extraStepSource` 안내, 새 위반 코드 문구(`WORKFORCE_OTHER` 의 `rawCode` 보간), `wf:` teamKey 투명 전달
- [ ] locales kr/en: `workforce.json` 신규, `timesheet.json`·`error.json`·`policy.json` 추가(§8), `npm run merge`, kr/en 키 집합 차이 0
- [ ] `npm run test:ui -- --runInBand`, `npm run build:ui`

## 12. 워크포스 측 작업 명세 (문서만 — 이번 회차 워크포스 리포 무변경, Q38 승인 요청)

> 원칙: **워크포스 DB 무증가**(새 SQL 테이블·KVS 키 없음). 검증은 상태 없이(공개키 내장). 교환물은 Jira 엔티티 프로퍼티. 워크포스 AGENTS 의 asApp 규칙에 새 사유 2개를 추가해야 한다(아래 ★).

### 12.1 공통 — 서명 라이브러리

- 승인 앱 `src/integration/workforce/{canonical,base64url,signature,keyring,contract}.js` 와 `vectors.json` 을 **그대로 복사**(`src/integration/approval/` 등). 수정 금지 — 두 리포가 같은 시험 벡터 파일로 교차 시험한다(차이가 나면 계약 위반).
- 서명 키: `forge variables set --encrypt MOVES_LINK_SIGNING_KEY`(워크포스 자기 seed), `MOVES_LINK_SIGNING_KID=wf-<env>-1`, 승인 앱 kid 신뢰 목록 `MOVES_LINK_TRUSTED_KIDS=ap-<env>-1`(선택).
- `cloudId` 는 resolver `context.cloudId`(트리거는 `installContext` 파싱).

### 12.2 게시 `movesRms.org` (사용자 프로퍼티, asApp ★)

- 내용: §3.3.3. `leaderKeys` 규칙(RFC-204 기준 — 한 사람은 한 팀만 이끌고 팀장은 그 팀 소속):
  - 대상이 팀장이 아니면 `[소속 팀 leaderAccountId]`(팀장 미지정이면 `[]`)
  - 대상이 자기 팀의 팀장이면 `[상위 팀 leaderAccountId]`(상위 팀·팀장이 없으면 `[]` → 승인 앱은 명부로 폴백)
  - `leads`: 대상이 이끄는 팀의 구성원(본인 제외) + 그 팀의 **하위 팀 팀장들**(위 규칙의 대칭 — 하위 팀장의 결재자가 나이므로). 500명 초과면 앞 500명만 싣고 나머지는 승인 앱이 명부로 처리(경고 로그)
- 시점: RFC-204 쓰기 경로 — `addTeamService`·`updateTeamService`(팀장 변경·상위 팀 변경)·`updateUserService`(소속 변경)·`assignUsersToTeamService`·`unassignUsersFromTeamService`, 팀 삭제, 사용자 삭제(tombstone), 설치 백필(onInstall `SEED_VERSION` 올림 — 전 사용자 1회).
- 영향 대상 계산: 소속이 바뀐 사용자 + 옛/새 팀의 팀장 + (팀장 변경 시) 그 팀 전 구성원과 하위 팀 팀장. 건수가 많으면 기존 `src/queue` 소비자로 비동기(큐 메시지는 저장이 아니라 DB 증가 아님).
- `rev` = 발행 시각 ms. 실패는 큐 재시도에 맡기고 사용자 경로에서 throw 하지 않는다.
- 선택 `cap:['check']` 는 12.3 을 켠 사이트에서만.

### 12.3 게시 `movesRms.check` (워크로그 프로퍼티, asApp ★)

- 새 트리거 `avi:jira:{created,updated}:worklog` → 그 워크로그 하나에 대해 워크포스 데이터로 판정: `OVER_PLAN`(월 계획 대비 초과), `OUT_OF_PERIOD`(프로젝트 참여 기간 밖), `NOT_MEMBER`(프로젝트 미소속). 빈 배열도 게시(점검 통과 표시).
- 내용 결속 필수: `authorId`·`started`(ms)·`seconds` 를 판정에 쓴 워크로그 값으로. 워크로그가 바뀌면 다시 게시.
- 비용: 워크로그 이벤트당 GET 1 + PUT 1. 대량 입력 시 큐로.
- 이 단계를 하지 않으면 승인 앱은 워크포스 위반 없이 자체 제한선만 쓴다(그리고 `cap` 을 선언하지 않으면 `CHECK_MISSING` 도 없다).

### 12.4 게시 `movesRms.pm` (프로젝트 프로퍼티, asApp ★)

- PM 지정·변경 시 `{pmKeys, rev}` 서명 게시. 해제는 프로퍼티 삭제가 아니라 서명된 `{pmKeys:[], rev, …}`(tombstone, §3.3.5 — 삭제·위조는 승인 앱이 sticky 로 무시한다).

### 12.5 읽기 `movesApproval.{YYYY}` (사용자 프로퍼티)

- 읽기: `GET /rest/api/3/user/properties/movesApproval.{YYYY}?accountId=<대상>`. 다른 사용자 프로퍼티는 asUser 로 못 읽을 가능성이 커(W3) **asApp ★**(사유 "승인 상태 검증 — 결과는 서명·지문 판정 후 배지·집계에만"). invocation 안에서 (accountId, YYYY) 별 1회 memo.
- 연도 선택: 워크로그 `started` 의 연도 Y 문서, 날짜가 연말·연초 7일 안이면 Y±1 문서도. 항목 선택은 `[ps,pe)` 가 덮는 것 중 `sa` 최대(§3.3.1).
- 검증: `verifyEntry({family:'approval', typ:'approval.timesheet', cloudId, ent:{accountId: 조회한 accountId, periodKey: 항목 키}, …})`. 실패·부재 = **"확인 중"**(승인분 아님).
- 지문 재계산(§3.2): 대상자×`[ps,pe)` 전체 워크로그를 모아 `ts1` 계산 → `h` 와 비교.
  - **필수**: 원가·정산·SAP 내보내기의 "승인분만" — 재계산 일치 + `st==='APPROVED'` 인 사용자×기간의 워크로그만 포함.
  - **권장**: 내 워크로그 화면 배지(사용자 범위라 이미 데이터가 있다).
  - **허용**: 프로젝트·이슈 맵의 배지는 재계산 없이 `st` 만 표시하되 "변경 확인 안 함" 상태로 구분(판정이 아닌 표시).
- 배지 매핑: `SUBMITTED`(일치)→제출, (불일치)→제출 후 변경 / `APPROVED`(일치)→승인, (불일치)→승인 후 변경 / `CHANGED_AFTER_APPROVAL`→승인 후 변경 / `REJECTED`→반려 / 부재·`NOT_SUBMITTED`→미제출 / 검증 실패→확인 중. 운영 지표(진척·가동률)는 전체 기준(DESIGN §3 표시 원칙).
- 입력 잠금: 워크포스 화면의 워크로그 입력·수정·삭제는 검증된 항목의 `lk` 가 있으면 막고 사유를 표시(소프트 통제 — DESIGN §2.2 "워크포스 내 워크로그 입력 포함").

### 12.6 워크포스 테스트

- `vectors.json` 교차 시험(서명·검증·정규화 바이트 일치), 변조·타 사이트·타 엔티티·모르는 kid, `ts1` 재계산 골든(승인 앱 `snapshot.test.js` 와 같은 입력), 연도 경계 문서 선택, "승인분만" 집계에서 불일치·검증 실패가 빠지는지.

### 12.7 워크포스가 하지 않는 것

새 테이블·KVS 키, 승인 앱 데이터 미러, 승인 상태 판정 로직(상태는 승인 앱이 정하고 워크포스는 서명·지문만 확인), 승인 앱 resolver 호출(불가 — DESIGN §4.4).

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-03 | 초판 | workforce-link Phase 2 |
