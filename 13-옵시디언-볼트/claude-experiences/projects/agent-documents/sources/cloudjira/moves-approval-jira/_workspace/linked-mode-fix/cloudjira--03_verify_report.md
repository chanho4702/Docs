# 검증 리포트 (회차 1, 2026-10-14) — linked-mode-fix

> 검증 대상: 승인 앱 작업 트리(기준 `ccb5aa1`) + 워크포스 작업 트리(기준 `03bdfa8`). 보고서(02_backend·02_workforce)의 "통과"는 모두 직접 다시 실행했다.
> 검증자가 추가한 파일: `src/integration/workforce/__test__/orgBodyCrossContract.test.js`(교차 테스트, 20건). 그 밖의 소스 수정 없음. 커밋·forge 명령 없음.

## 요약  통과 24 / 실패 0 / 미검증 9 / 경고(리더 판단) 6

계약·규칙·R1·R4·불변식·금지 구역 모두 어긋남을 찾지 못했다. 다만 R1 이 **한 요청 안에서 여러 대상을 처음 검증하는 경로**(타임시트 제출)에서 ctl PUT 을 대상 수만큼 직렬로 실행할 수 있어 지연·시간 초과 위험이 있다(경고 W1, 승인 앱 수정 권장).

## 실패

없음.

## 경고 (실패는 아니나 리더 판단·후속 필요)

| # | 위치 | 내용 | 권장 조치 | 담당 |
|---|---|---|---|---|
| W1 | `src/resolver/timesheet/TimesheetService.js:279` (루프 안 `refreshOne`) → `WorklogPolicyAuthority.js:56` → `WorklogControlHooks.ctlTargetChanged` → `publishCtlNow` | 타임시트 처리는 기록이 있는 **이슈마다 순서대로** `refreshOne` 을 부른다. 워크포스 `ApprovalLinkAdminService.js:251` 의 일괄 이슈 연결 직후라면 이 이슈들이 모두 "최초 VERIFIED" 가 되고, 이슈마다 SQL 4회와 asApp PUT 1회가 **같은 resolver 요청 안에서 직렬로** 실행된다. 30건이면 PUT 30회가 되어 25초 한도를 넘길 수 있다. `WorklogPolicyService.refresh`(최대 101대상, 5개씩 병렬, 20초 예산)도 같은 비용을 진다. 유휴 비용 규칙은 지켰다(바뀔 때만 실행) | 호출(invocation)당 즉시 배출 횟수에 상한을 둔다. 예: `memo` 카운터로 첫 1~3건만 `publishCtlNow`, 나머지는 `touchMany` 만 해서 원장에 남기고 일일 스윕이 배출하게 한다. 또는 `ctlTargetChanged` 를 `{ limit: 1 }` 로 부르되 루프 경로에서는 touch 만 하는 옵션을 둔다. 테스트: 대상 10건을 처음 검증하면 PUT ≤ 상한 | 승인 앱 backend |
| W2 | `WorkforcePublisher.js:719-724` | `publishCtlNow` 는 정책·서명 관문(`blockedState`)보다 **먼저** `touchMany` 를 실행한다(원래 있던 동작, backend 보고서 "발견"과 같은 내용). 연동이 꺼진 상태에서 신호가 VERIFIED 로 바뀌는 경우에는 SQL 2~3회를 쓰고 끝난다. 신호가 바뀔 때만 생기므로 유휴 비용은 아니다 | 이번 범위에서는 그대로 둔다. 바꾸려면 관문을 touch 앞으로 옮긴다 | 승인 앱(후속) |
| W3 | `WorklogRequestService.js:121`(후보에 본인), `:180`(수동 `approverId`), `WorklogCertificationTargetAdapter.js:56-66`(결정 시 본인 결재 판정) | **상위 팀장이 있어도** 팀장 본인이 승인자로 자기 자신을 직접 고르면 접수되고, 결정할 때도 `isWorkforceTeamLead` 만 확인한다. 기본값(자동·`defaultApproverIds`)은 상위 팀장만 쓰므로 설계 §4 R3-1, 요구 R3("후보에 본인 포함")과는 맞는다. 하지만 사용자 결정 2 "팀장의 결재는 위 팀장, 위가 없으면 본인"을 **강제 규칙**으로 읽으면 어긋난다 | 의도대로라면 그대로 둔다. 강제할 생각이면 `create` 와 `beforeDecide` 에서 `upperLeadsOf(owner)` 가 비어 있을 때만 본인을 허용한다 | 리더 판단 |
| W4 | `WorkforceInbound.js:341-347`(`overriddenSubjects`), `TeamScope.js:64-77` | 최상위 팀장(워크포스 `leaderKeys:[]`)은 override 되지 않는다. 그래서 승인 앱 **명부**에 이 사람이 다른 팀의 MEMBER 로 들어가 있으면 명부 팀장이 `upperLeadsOf` 에 들어가 기본 승인자가 되고, 본인 결재로 가지 않는다. 연동 모드에서 명부를 함께 쓰는 사이트에서만 생긴다 | 기본 동작으로 받아들일지 리더가 정한다(Q6 단독/명부는 범위 밖) | 리더 판단 |
| W5 | `WorkforcePublisher.js:592-597` | R1-b `resetCtlScan` 은 워터마크만 지운다. `drainCtl` 은 원장의 digest 가 같으면 PUT 을 건너뛰므로, 누군가 Jira 에서 `movesApproval.ctl` 을 지워 버린 경우 "전체 재게시"로도 다시 써지지 않는다(원래 있던 동작). ARS-14 처럼 원장 행이 아예 없던 경우는 정상적으로 복구된다 | 문서화하거나 후속으로 ALL 일 때 digest 를 비우는 처리를 추가 | 승인 앱(후속) |
| W6 | 검증 과정 | 처음에 `CI=true npm run build:ui` 로 돌렸더니 node_modules 의 원래 있던 경고(`postcss-calc … @atlaskit/react-select multi-value.compiled.css`)가 오류로 취급되어 실패했다. CRA 는 컴파일 전에 `static/ui/build` 를 비우므로 **승인 앱 터널이 서빙하는 build 폴더가 몇 분간 비어 있었을 수 있다**. 곧바로 `npm run build:ui`(CI 없음)로 다시 빌드해 복구했다(EXIT 0, 엔트리 html 8개 확인). 프론트 코드는 바뀌지 않았으므로 산출물 내용은 같다 | 터널 화면이 비었다면 새로고침하면 된다 | — |

## 미검증 (실측 필요)

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| V1 | 신호 최초 검증 직후 같은 요청 안에서 ctl PUT(asApp) 성공 | 실 Jira 필요. 단위 테스트는 구간별로만 있다(Authority→훅 mock, 훅→게시기 mock, 게시기 정렬·SQL 수에서 drainCtl mock). Authority → 실제 훅 → 실제 게시기 → PUT 을 한 번에 잇는 테스트는 없다 | ARS-14 류 새 연결 이슈 화면 → `workforce_publish` 의 `I:{id}`/`ctl` 행 `pending=0`·`published_at` 갱신 + `GET /rest/api/3/issue/{id}/properties/movesApproval.ctl` 200 |
| V2 | Tom Kim(팀장)이 워크포스를 열면 본인 `movesRms.org` 에 leads 가 실리는가(U1) | 실사이트·터널 재시작 필요 | `GET /rest/api/3/user/properties/movesRms.org?accountId=…` |
| V3 | 개발 사이트 `team_key` 가 계약 정규식 `^[A-Za-z0-9:_-]{1,64}$` 를 만족하는가(U2) | 실데이터 | `forge logs` 에 `[APPROVAL LINK] org body invalid` 가 있는지 확인 |
| V4 | manifest 모듈 삭제 배포에 major 가 필요 없는가, 패널이 바로 사라지는가(U3·설계 V4) | 배포 필요. **워크포스 manifest 가 바뀌었으므로 터널 재시작 필요** | `forge deploy` 출력 + ARS-14 화면 |
| V5 | 승인 앱이 5분 안에 갱신 본문을 받아 "내 Workforce 결재자 구성"·팀 탭에 표시하는가(V2·V5) | 실측 | 스크린샷 |
| V6 | ARS-14 승인 요청 → 후보에 본인(팀장) 포함, 기본 승인자 자동 선택(요구서 완료 기준) | 실측. 같은 로직을 교차 테스트 §4 에서 실제 본문으로 확인했다 | 터널 실측 |
| V7 | 팀 구조 변경 뒤 A·B 문서 재게시 시차(설계 V7) | 실측 | 설계 §10 |
| V8 | `forge lint`(워크포스) | 지시에 따라 forge 명령을 실행하지 않았다. 보고서는 `No issues found` 라고 했다. 대신 webpack 번들 로드 검사로 manifest 핸들러 export 를 확인했다 | 리더가 `forge lint` 실행 |
| V9 | R1-b "전체 재게시" 뒤 다음 일일 스윕에서 ctl·flows 전량 touch | 스케줄 대기 필요 | 스윕 뒤 ctl 행 `updated_at` |

## 통과

### 1. 계약 교차 — 워크포스 실제 본문 → 승인 앱 검증 (검증자 테스트)
- **보고서 본문이 진짜 출력인지 확인**: 워크포스 코드(`buildTeamIndex` → `memberTeamsOf` → `buildOrgTeam` → `orgCapPlan`)를 보고서 §2 의 팀 구조로 직접 실행했다(scratchpad jest, 워크포스 babel). 4개 본문이 보고서와 값까지 같고, 모두 `publish:true` 였다. acc-p2 는 acc-p1 과 같은 칸이다.
- **계약 파일 일치**: 승인 `src/integration/workforce/contract.js` 와 워크포스 `src/integration/approval/contract.js` 를 `diff` 하니 같았다(ACCOUNT_ID·TEAM_KEY·ORG_MAX_* 공통).
- `src/integration/workforce/__test__/orgBodyCrossContract.test.js`(20건 통과)
  - ① 4개 본문 모두 `validateBody(TYP.RMS_ORG)` 를 통과한다. memberKeys 500건은 통과, 501건은 거부되어 워크포스의 ORG_INVALID 경계와 같다. 실제 accountId(`712020:uuid`)와 `team-<uuid>`(41자)도 통과한다.
  - ② `orgViewOf`: `wf:` 접두를 붙이고, 본인을 빼고, 하위 팀장을 포함한다.
  - ③ 5명 전원의 `identityOf.isWorkforceTeamLead`·`upperLeadsOf`·`membersOf`·`worklogSelfApprovalOf` 기대값과, 모든 (L,P) 쌍의 대칭(P ∈ membersOf(L) ⇔ L ∈ upperLeadsOf(P))
  - ④ 실제 `WorklogRequestService` + 실제 OrgSource·TeamScope 조합에서 `candidates`·`requestAutomatically` 결과

### 2. 규칙 일치 (Q2·Q3·Q4)
| 작성자 | 워크포스 leaderKeys / leads | 승인 앱 upperLeadsOf | selfAllowed | defaultApproverIds | 자동 접수 keys | 후보에 본인 |
|---|---|---|---|---|---|---|
| acc-tomkim(하위 팀장) | [director] / [플랫폼팀: p1,p2] | {director} | true | [director] | [director] | 포함 |
| acc-director(최상위) | [] / [개발본부: q1,tomkim] | {} | true | [director] | [director] | 포함 |
| acc-p1(팀원) | [tomkim] / [] | {tomkim} | false | [tomkim] | [tomkim] | 없음 |
| acc-q1(팀장 없는 팀) | [director] / [] (Q3 나) | {director} | false | [director] | [director] | 없음 |
- 워크포스 `approverOf`(조상 쪽으로 올라가며 본인 제외)와 `memberTeamsOf`·`subLeadsOf`는 같은 `nearestAncestorWith` 를 써서 대칭이 구조적으로 보장된다. orgCap 테스트의 무작위 트리 전수 검사(T-W1 #15)도 통과했다.
- 승인 앱 `candidates`(116~121행)·`requestAutomatically`(269~271행) 모두 "상위가 있으면 상위만, 없고 self 가 허용되면 본인" 규칙으로 바뀌었다. 수동 `create`(180행)는 원래 같은 규칙이었다.

### 3. R1
- 조건: `WorklogPolicyAuthority.js:56` 의 `accepted&&(stored?.status!=='VERIFIED'||stored?.body?.ctl!==row.body?.ctl)` 는 바뀌지 않았다. UNCHANGED(47행)·검증 실패·CAS 패배 경로에는 훅이 없고 테스트로 고정돼 있다(UNCHANGED 는 findInbound 1 + touchInbound 1, update·insert·feature 0).
- 순환: `WorkforcePublisher.js:14 → WorklogPolicyResolver.js:8 → WorklogPolicyAuthority → WorklogControlHooks` 경로가 실제로 있음을 확인했다. Hooks 는 `lazyPublisher` 로 호출 시점에 `require` 한다(25행, 앞선 사례 `WorklogCertificationTargetAdapter.js:61` 과 같은 방식). `npm run check:bundle` OK.
- 예외가 밖으로 나가지 않는다: `guarded('ctl')` 가 `{failed:true}`·로그로 처리하고, Authority 쪽은 `Promise.resolve(...).catch(()=>{})` 로 한 번 더 막는다. `refreshOne` 반환 형태는 바뀌지 않아 게시 결과가 응답에 실리지 않는다(불변식 8).
- `publishCtlNow` 는 요청한 id 를 먼저 배출하고, 기존 limit 10 호출부의 동작은 같다(테스트 고정).
- R1-b: `republishWorkforceLink` ALL → `resetCtlScan?.()` 를 호출하고 실패해도 무시한다. FAILED 범위에서는 호출하지 않는다(테스트). KVS delete 1회, SQL 0회.

### 4. R4 (워크포스)
- `manifest.yml` 에 `issueActivity`·`issueContext`·`issue-panel`·`build-panel` 이 없다. resources 는 main·images 만 남았다. 커스텀 필드 displayConditions 는 유지됐다.
- `static/ui/src/panel` 이 없다. `approvalHandoff.js` 를 쓰는 곳은 `worklogMoveGuard.js`·`WorklogModal.jsx` 두 곳이고 테스트도 함께 옮겨졌다.
- `worklogOwner` 되돌림: c434b98^ 와 비교하면 두 커밋(11파일·5파일, manifest 제외)이 건드린 파일 가운데 차이가 남은 것은 `IssueLinkPropertyApi.js` 머리 주석 2줄(패널 → 커스텀 필드로 정정)과 `ApprovalLinkMode.test.js`(T-W5 단언 교체)뿐이다. 둘 다 의도된 변경이다.
- 남은 참조 grep 결과: `worklogOwner|WORKLOG_OWNER|PANEL_MODULE|build:panel|bundle:check:panel|panelApproval|OWNER_BACKFILL|linkMarkerSync|ensureIssueLinkOwnerBackfill|PANEL_BUILD` 는 코드에서 0건이다. 남은 것은 `.gitignore:6-7`(build-panel 무시 줄), `check-bundle-budget.js:62`(범용 `--dir` 예시 주석), 파일명 `issuePanelKeys.js`(`issueLinkBackfillKeys` 를 담고 있어 유지), approvalHandoff 의 이동 이력 주석이다. 모두 무해하다. 작업 트리의 `static/ui/build-panel/` 은 gitignore 된 옛 산출물이라 지워도 된다.
- 워크포스 백엔드 webpack 번들 로드 검사(승인 앱 `check-bundle-load.js` 를 워크포스 루트로 바꿔 실행): OK. `PermissionController → ApprovalLinkSignals` 정적 import 를 추가했지만 TDZ 는 없다.

### 5. 불변식
- 8: 워크포스 org 쓰기는 `write('user', …)` → `clientOf('user')=api.asUser()` 이고, accountId 는 `context.accountId` 다(payload 를 쓰지 않음). 승인 앱 ctl PUT 은 기존 `appGateway`(asApp 허용 2번)를 쓰고 결과를 응답에 싣지 않는다.
- 9: 승인 앱의 새 소비 경로는 모두 `WorkforceOrgSource`(inbound.orgOf `status==='VERIFIED'` 일 때만 orgViewOf)와 `overriddenSubjects`(검증된 본문 DB)를 거친다. 워크포스 `verifyOwnOrg` 는 자기 kid 로 서명된 것만 현재 값으로 인정한다.
- 7: Q4 로 넓어진 범위는 `TeamScope.leadScope` 단일 출처로 열람(membersOf·leads·ledTeams)과 역방향(upperLeadsOf)에 똑같이 반영되며, 교차 테스트 대칭 검사로 확인했다. 불변식 8 예외 ②("TeamScope 대상자")도 같은 출처라 넓어진 범위가 그대로 적용된다(사용자 결정 Q4 나).
- 유휴 SQL: 두 앱 모두 새 scheduledTrigger·consumer 가 없다(승인 앱 manifest 무변경, 워크포스는 삭제만). R1 은 바뀔 때만 동작한다. 워크포스 `ensureOrgCap` 은 memo 가 맞으면 KVS 1회·SQL 0회이고, signer 가 없으면 즉시 DISABLED 로 끝난다.

### 6. 금지 구역 (워크포스)
- `locales/en-US.json`·`ko-KR.json`: 수정 시각 13:47 로 작업 폴더 생성(14:42)보다 이르다. 검증자의 빌드 전후 sha1 이 같다(`LOCALES_UNCHANGED`). diff 에 이번 작업 관련 키도 없다.
- 미추적 pptx 2개·`캡처.png`·`custom-scopes.yaml`·`LeaderTeamBackfill.test.js`: 수정 시각이 9/14~10/04 로 이번 작업 전이고, 스테이징된 것은 없다(`git status` 에 인덱스 변경 없음).

## 실행 결과

| 명령 | 결과 |
|---|---|
| 승인 `npm test -- --runInBand`(교차 테스트 추가 후) | **194 suites / 2,919 tests 통과**(추가 전 193 / 2,899) |
| 승인 `npm run test:ui -- --runInBand` | **92 / 816 통과** |
| 승인 `npm run check:bundle` | OK |
| 승인 `npm run build:ui` | **통과**(EXIT 0). `CI=true` 로 돌리면 node_modules 의 기존 postcss-calc 경고 때문에 실패한다(W6) |
| 워크포스 `npx jest --runInBand`(루트) | **177 / 2,491 통과** |
| 워크포스 `static/ui` `npx jest --runInBand` | **167 / 2,640 통과** |
| 워크포스 `CI=true npm run build:app && npm run bundle:check` | **통과**. main gzip 494,264B ≤ 950,000B. 경고는 node_modules source map 3건뿐 |
| 워크포스 백엔드 번들 로드(검증자 임시 스크립트) | OK |
| 승인 `npm run merge` | 실행하지 않음(승인 앱 locales 무변경) |

## 담당별 수정 요청

| 담당 | # | 요청 | 우선 |
|---|---|---|---|
| 승인 앱 backend | W1 | ctl 즉시 게시에 호출당 상한 추가(넘는 대상은 touch 만 하고 일일 스윕이 배출) + "대상 N건을 처음 검증해도 PUT ≤ 상한" 테스트 | 중(배포 전 권장) |
| 승인 앱 backend | V1 보강 | Authority(실제) → Hooks(실제) → Publisher(repo·appGateway mock)를 한 번에 잇는 테스트 1건: 최초 VERIFIED 에서 `putEntityProperty` 가 1회 호출되고 `markPublished` 가 실행되는지 | 낮음 |
| 승인 앱 backend | W2·W5 | 후속(이번 범위 밖) — 관문을 touch 앞으로 옮기기, ALL 일 때 digest 를 비워 PUT 강제 | 낮음 |
| 리더 | W3·W4 | 상위 팀장이 있을 때 팀장 본인 직접 선택을 허용할지, 명부와 섞였을 때 최상위 팀장의 기본 승인자를 어떻게 할지 결정 | 결정 필요 |
| 워크포스 | — | 필수 수정 없음. 선택 사항: `static/ui/build-panel/` 폴더·`.gitignore` 의 build-panel 줄 정리, 사용처가 0인 `useWorklogWrite.js`·`utils/effort.js` 정리, 큐 consumer 의 팀 변경 경로에서 epoch bump(U5) | 낮음 |

## 남은 미검증 (실측 필요) 요약
V1 ctl 즉시 PUT · V2 Tom Kim org 게시 · V3 team_key 정규식 · V4 manifest 모듈 삭제 배포·터널 재시작 · V5 설정 화면 표시 · V6 ARS-14 후보·기본 승인자 · V7 재게시 시차 · V8 `forge lint` · V9 ALL 재게시 뒤 스윕.
