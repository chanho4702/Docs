# AGENTS.md

이 리포지토리에서 작업하는 코딩 에이전트를 위한 지침입니다.
아키텍처·디렉토리 구조·도메인 규약은 `CLAUDE.md`가 단일 진실이며, 이 문서는 그 위에 얹히는 작업 규칙만 다룹니다.

> 현행화 기준: **2026-08-10 / 소스 `03857aa`(2026-08-10)**

## 이 앱이 무엇인지

Atlassian Jira Cloud용 Forge 앱 (Moves RMS). 프로젝트 인력·팀 관리, 워크로그 추적, MD/MM·가동률·진척도·비용 분석, 간트.
단일 고객 사이트 설치를 전제로 하며, 여기 있는 코드는 **프로덕션에 그대로 나갑니다.**

- Forge runtime `nodejs22.x`, arm64, 256MB
- **Custom UI** — `static/ui`의 React 18 + Atlaskit 앱을 빌드해 `static/ui/build`로 서빙
- Backend — `src/index.js` → Controller → Service → (Repository) → Forge SQL / Forge KVS / Jira REST

> ⚠ 이 앱은 **UI Kit(`@forge/react`) 앱이 아닙니다.** 일반 React 컴포넌트와 Atlaskit(`@atlaskit/*`)을 그대로 사용합니다.
> `@forge/react`에서 컴포넌트를 가져오거나 `<div>` 사용을 피하려 들지 마세요. 신규 화면도 Custom UI 규약을 따릅니다.
> 프론트↔백엔드 통신은 `@forge/bridge`의 `invoke()`, Jira 직접 호출은 `@forge/bridge`의 `requestJira()`입니다.

## 코드 스타일

- 바닐라·관용적 JavaScript. 기존 파일의 주석 밀도·네이밍·관용구를 따라갑니다.
- 주석은 **왜**를 적습니다. 무엇을 하는지 다시 쓰는 주석, 방어적 부연, 장식용 배너는 넣지 않습니다.
- 버그 수정에 테스트·주석·부가 UI를 함께 부풀리지 않습니다. 요청 범위를 지킵니다.
- 3단 중첩 루프가 나오면 대개 중간 단계가 헛도는 신호입니다. 구조를 다시 봅니다.
- 파일을 만들기 전에 기존 공용 지점(`static/ui/src/components/`)을 먼저 확인합니다.

## 반드시 지켜야 할 불변식

- resolver는 `src/index.js`의 **`CONTROLLER_REGISTRARS` 배열**에 등록하고 **`guardedDefine`**으로 정의합니다.
  `src/permission/PermissionMap.js`에 선언되지 않은 함수는 deny-by-default로 거부되어 런타임에서 `PERMISSION_UNMAPPED`로 죽습니다.
- `SELF` mutation은 `context.accountId`를 SQL row owner predicate까지 전달합니다.
- Forge SQL DML은 공통 계층의 `rowsAffected` alias를 사용하고, raw mock은 `{ rows: { affectedRows } }`를 재현합니다.
- 일반 resource DTO에 `salary`를 포함하지 않습니다. 비용 데이터는 `PROJECT_COST` 전용 경로로만 나갑니다.
- 신규·수정 TanStack Query key는 `static/ui/src/utils/queryKey/` 팩토리를 사용합니다.
- KVS 엔티티 속성을 추가하면 `manifest.yml` schema를 먼저 바꾸고 deploy 합니다. KVS는 **빈 문자열 저장을 거부**하므로 선택 필드는 속성 자체를 생략합니다.
- KVS `findAll()`은 **100건 하드캡**이고 커서를 버려 초과분이 조용히 잘립니다. 전량이 필요하면 `findAllPaged(indexName, pageLimit, maxItems)`를 쓰고, 목록 조회와 이름 중복 판정은 **같은 상한 상수**를 공유합니다(갈리면 "목록엔 없는데 저장은 거부"가 생깁니다).
- 번역은 `locales/kr/*.json`·`locales/en/*.json`에 넣고 `npm run merge`로 생성합니다. `ko-KR.json`/`en-US.json`은 직접 수정하지 않습니다.
- 라이선스 원문이나 사용자 민감정보를 frontend console에 출력하지 않습니다. 라이선스 차단은 **명시적 INACTIVE 하나뿐**입니다 — 판정 불가(UNAVAILABLE)는 통과시킵니다(이 가드가 모든 resolver를 감싸므로 상류 장애가 앱 전면 정지가 됩니다). 단, License API가 200으로 응답했는데 활성 라이선스가 없으면 "판정 불가"가 아니라 INACTIVE입니다. 프론트·백엔드가 같은 경계여야 합니다.

## 보안

- **가드 통과는 데이터 범위 확정이 아닙니다.** 가드(`guardedDefine`)는 "이 함수를 부를 수 있나"만 봅니다. 재무·인사 데이터를 내주는 resolver는 `principal`을 서비스까지 전달해 **응답 내용을 따로 좁혀야** 합니다.
  - 급여·원가는 급여 정책(`SalaryVisibility`)과 **별개로** `CostAccess.canReadCost(principal)`를 함께 요구합니다.
  - 인력 명부는 `TeamAnalyticsScope.resolveTeamAnalyticsScope(principal)` 단일 출처를 따릅니다.
  - **한 화면만 막으면 형제 resolver로 우회됩니다.** 같은 데이터를 내주는 경로를 전부 찾아 같은 판정을 통과시킵니다.
  - 읽기에만 있고 쓰기에 없는 검증을 조심하고, 검증은 **공용 함수로 뽑아** 두 경로가 같은 것을 보게 합니다.
  - `principal` 누락은 **fail-close** 입니다 — 컨트롤러가 전달을 빠뜨려도 조용히 열리지 않아야 합니다.
- Jira product REST 호출은 **`asUser()`가 기본**입니다. `asUser()`는 자체 인가 검사를 수행합니다.
- `asApp()`은 아키텍처 문서에 열거된 플랫폼 예외에만 사용합니다 (마켓플레이스 심사 부담). 부득이 사용할 때는 해당 product permission API로 인가를 직접 확인합니다.
  - **이슈 공수 Custom field value function (2026-10-13)** — `src/customField/effortValues.js`만 `issue/bulkfetch`로 `timeoriginalestimate`·`timespent`·`project`와 표시 표식 `movesRmsLink`를 읽는다. 플랫폼 value function은 asUser를 지원하지 않으며 결과는 이슈 공유 필드에 저장된다. 조회는 입력 이슈 id 100건씩, 최대 1,000건이며 워크로그 본문·작성자·설명·승인 문서는 읽지 않는다. 표식은 표시 범위만 정하고 권한이나 승인 판정에 쓰지 않는다. 숫자는 Jira 원기록 합계이며 승인 확정 공수로 간주하지 않는다.
  - **⑦·⑧ 승인 앱 연동 — 채널(webtrigger) 전환(2026-10-19 workforce-channel-rest, 승인 앱 설계 `_workspace/workforce-channel-rest/01_architect_design.md`)** — 엔티티 프로퍼티 교환(`movesRms.org/policy/issue/kb/origin`·`movesApproval.*` 읽기·게시)은 **전부 없앴다**. 두 앱은 페어링된 dynamic webtrigger(`workforce-link-channel` ↔ 승인 앱 `approval-link-channel`)와 Ed25519 봉투(`src/integration/channel/*`, 승인 앱 원본과 바이트 동일 — 고치지 말고 승인 앱 담당에 요청, `SHARED_READY.md`)로만 주고받는다. 코드는 `src/resolver/approvalChannel/`·`src/resolver/approvalLink/`.
    - **행위자(actor)**: 보내는 요청은 resolver context `accountId` 를 `ActorScope`(guardedDefine 이 감싼다)에서 읽어 서명 봉투에 싣는다 — `ChannelClient` 에 accountId 인자는 없다. 사람 없는 경로는 `actor:SYSTEM` + 공유 `ops.js` 허용 reason 만(`link-change`·`team-batch`, 포트폴리오 배치 STATS 는 `portfolio-batch`). 받는 요청은 서명·사이트(cloudId)·linkId·작업 허용 목록·iat 창을 DB 접근 전에 확인하고(`ChannelServer`), 핸들러는 서명 actor 의 `ActorScope`(via `APPROVAL_CHANNEL`)로 실행한다. 서명 없는 오류 응답으로 연결 상태를 바꾸지 않는다.
    - **asApp(채널)**: ① `GET /rest/api/3/user?accountId={서명 actor}` — `pair.complete`·`sys.rekey`·`sys.unpair` 의 actor 실재·활성 확인(boolean, 메모 10분) ② `POST /rest/api/3/search/jql` `id IN (…)` fields project·앱 필드 — `link.resolve` 의 연결 판정(앱 필드 `moves_RMS_projectId` + 활성 프로젝트 SQL, 프로젝트 단위 무필터 구독 포함). 승인 앱에는 연결 여부·Jira 프로젝트 id·팀장 설정만 답한다
    - **인증·원가(옛 ⑦)**: 승인 앱 `cert.query`(purpose COST·STATS·BADGE, 50쌍 묶음)로 묻는다 — 사용자 프로퍼티 asApp 읽기 없음. 원가는 숫자만 계산에 쓰고 원문·건별 값은 응답에 싣지 않는다. BADGE 가 20 이슈를 넘어 STATS 로 강등된 결과는 **자기 asUser 로 읽은 행에 결합할 때만** 쓴다. 메모리 캐시 키 = 조회자·목적·CERT epoch(`change.notify`).
    - **숨긴 본인 기록 읽기(이슈 탭, `getIssueWorklogControl`)**: 승인 앱이 visibility 로 숨긴 워크로그는 작성자도 asUser 로 못 읽으므로 `GET issue/{id}/worklog` 를 앱 자격으로 읽는다. 조건(승인 앱 불변식 8 예외 6조건과 같다): ① 호출자는 `context.accountId` 뿐 ② 응답 **전 건**의 author·issueId·worklogId 를 다시 대조해 본인 것만 ③ 먼저 조회자 asUser 로 이슈를 읽는다 ④ 승인 앱 `issue.control`(ROWS, actor = 조회자)이 돌려준 **hidden id 에 있는 기록만**(vt 추정 폐기) — 원래부터 제한된 기록은 싣지 않는다 ⑤ 설명은 본인에게만 ⑥ 남의 숨김 기록 수·존재를 응답에 싣지 않고 서버 캐시를 두지 않는다.
    - **집계 포함**: 협업 페처는 공개 기록 + `issue.control`(AGGREGATE) 이 답한 통제분만 싣는다. **2026-10-28 사용자 결정(RFC-220 검토 F1·F2·F3)으로 옛 Q127 "숨긴 기록은 행으로 본인 것만(ROWS), 남의 것은 집계만(AGGREGATE)"을 대체했다** — 협업 캘린더·드로어도 승인 앱이 숨긴 남의 기록을 행으로 싣는다(⑨). 원래부터 그룹·역할로 제한한 기록은 어디에도 싣지 않는다. 원가는 asUser 로 읽은 경우(연동 OFF)에만 `cert.query` 응답 id 중 Jira 행에 없는 것을 `worklog/list`(asApp)로 보충한다 — 앱 자격 읽기(연동 ON)면 숨긴 승인분이 이미 행에 있어 보충하지 않는다(`certifyCostRows` `appRead`, 중복 합산 금지).
  - **⑨ 연동 모드 프로젝트 워크로그 = 앱 자격 읽기(2026-10-28, RFC-220 검토 F1·F2·F3 — 사용자 결정 "워크포스에서는 승인 여부와 관계없이 워크포스 권한으로 볼 수 있어야 한다. 앱 권한으로 보여 주면 된다")** — 승인 연동 모드(`approvalLinkMode === 'ON'`)에서 프로젝트 범위 워크로그 읽기는 asApp 으로 한다. 승인 앱이 승인·확정분을 Jira visibility 로 숨기므로(목적은 수정 잠금) asUser 로는 승인할수록 진척도·대시보드·개인 목록이 줄어든다.
    - 판정: `src/permission/WorklogReadAuthority.js`(`resolveWorklogReadAuthority`·`resolveWorklogRead` — 절대 throw 하지 않고 실패는 `'user'`). 연동 OFF 는 지금 동작 그대로(asUser).
    - **보여 줄 범위는 워크포스 권한 모델**이 정한다 — 호출 resolver 가드(프로젝트 스코프 `scopedProjectIds`·팀장 `leadingScopeAccountIds`·협업 `CollabAccess`)를 통과한 조회자는 그 프로젝트 워크로그를 승인 여부와 무관하게 본다. Jira Browse 로 다시 좁히지 않는다(`applyWorklogApproval` `readAs:'app'` 은 asUser `permissions/check`·`worklog/list` 재확인을 하지 않는다). **이슈 키·id 로 들어오는 경로**(이슈 분석 상세·일반 이슈 드로어)는 `src/permission/IssueWorklogReadAuthority.js` 가 `link.resolve` 핸들러와 같은 연결 판정(`createIssueLinkResolver` — asApp `search/jql` project·`moves_RMS_projectId` + 활성 프로젝트 SQL + 무필터 SPACE 구독, 인스턴스 60초 캐시)으로 이슈의 워크포스 프로젝트를 구하고, 그 프로젝트가 조회자 `scopedProjectIds`(관리자·ALL 은 전부) 안일 때만 `'app'` — 비연결·스코프 밖·판정 실패는 기존 asUser 경로. 내 작업 화면은 선택 프로젝트가 전부 조회자 스코프 안일 때만 `'app'`.
    - **포함하는 숨김 기록은 승인 앱이 숨긴 것 + 조회자가 원래 볼 수 있던 것** — `issue.control`(AGGREGATE, 전원 id)의 hidden ∋ worklogId 면 포함. hidden 에 없는 제한 행(원래부터 그룹·역할 제한)과 판정 불가 행(UNVERIFIED·NO_TRUST)은 그 id 만 조회자 **asUser** `worklog/list`(1,000건 묶음)로 되묻고 돌아온 것만 남긴다(조회자가 그 그룹·역할이면 전처럼 보이고, 아니면 빠진다 — fail-close). 해당 행이 없으면 asUser 호출 0. `visibility` 없는 행은 공개 행.
    - 승인 상태는 남은 행의 (작성자 × 월) 쌍으로 `cert.query` STATS 를 1회 묻고 덧씌운다(캐시 키 `linked|{조회자}`). 인증 문서 기반 숨김 복원(`hiddenCertifiedRowsOf`)은 쓰지 않는다. 승인 후 삭제분 보충(`deletedApprovedRowsOf`)은 요청 쌍·호출자가 읽은 프로젝트 이슈 범위로 유지.
    - **기존에 보이던 것은 계속 보인다** — 행 범위는 기존 화면 그대로: 작성자 필터가 없던 화면(내 작업 표·내 이슈 목록·프로젝트 캘린더·이슈 분석 상세 등)은 행 전부, 작성자=본인으로 거르던 화면(내 캘린더)만 `selfOnly`. 일반 이슈 드로어는 행 상태는 본인 것만, 합계는 목록 전체.
    - 호출자(새 호출자는 `ApprovalDisplayPaths.test` 허용 목록에 의식적으로 추가): 진척도·원가·인력 분석·관계 그래프(`ResourceWorklogFetcher` `as:'app'`), 대시보드 히트맵·lineStack(`WorklogService.getProjectWorklogs`·협업 `getProjectWorklogsAsApp`), 프로젝트 캘린더, 이슈 분석 상세, 내 작업(표·캘린더·이슈 목록·드로어), 협업 캘린더·드로어(`approvalFromDocs`). Portfolio 배치·쓰기 경로(`write.judge`)·`src/integration/channel/*` 는 바뀌지 않는다.
    - **쓰기 실행**: 워크포스는 asApp 으로 워크로그를 쓰지 않는다. `createIssueWorklog`·`updateIssueWorklog`·`deleteIssueWorklog` 가 연동 이슈에서 **저장 직전 승인 앱 `write.judge`** 로 묻고(승인 앱이 현재 DB 로 판정) ALLOW 만 **asUser** 로 저장한 뒤 `write.commit` 으로 op 를 결속한다. DENY 는 승인 앱 코드 그대로, DEFER·상대 장애·응답 검증 실패는 저장하지 않고 `WORKLOG_CREATE/EDIT_HANDOFF_REQUIRED`(cause.path = 승인 앱 화면, `issue.control` 의 `globalPagePath`·`timeZone`) — fail-close(Q3). `movesRms.origin` 봉투·10분 유예·`LinkedWriteGate`·`writeGate.js` 는 없다.
    - **쓰기 창구**: 판정은 `src/domain/approvalLink/writeChannel.js`(UI 사본과 글자까지 같은 파일) 하나이고 화면은 `getIssueWorklogControl.writeChannel` 만 믿는다. 입력은 `issue.control.channel`(`OPEN` = gated)과 페어링 상태다.
    - **결재선 목록**: 승인 앱 `flows.list` 로 묻는다(페어링 ops 에 있을 때만). 고른 id 는 팀장 설정 `fl` 로 저장 — 판정은 승인 앱이 다시 한다. 기록 규칙은 승인 앱 사이트 관리자 설정에만 있다(Q149).
    - **팀장 이슈 설정 원장 = KVS** `approvalLink:issueSetting:{issueId}`(이슈 프로퍼티가 아니다 — 편집 권한자가 못 고친다). 저장은 직속 담당 프로젝트 팀장만, 저장 뒤 `change.notify{SETTING, data}`. 칸: 작성 기간 `s·e`·사전 승인 `pa`·결재선 `fl`·워크로그 승인 방식 `wa`.
    - 서명 키(`MOVES_LINK_SIGNING_KEY`/`_KID`)·페어링이 없으면 채널 호출 0(연동 기능 꺼짐과 같은 동작).
    - 연결 화면(`getApprovalLinkStatus`·연결 코드 만들기/붙여넣기·주소 회전·해제·ping, SETTINGS)은 상태·코드·지연만 낸다. 연결 코드는 비밀(pin 포함) — 로그 금지.
- scope는 최소로 유지하고, 실제로 필요한 API가 생겼을 때만 추가합니다.
- Forge SQL / KVS / Custom Entity는 클라이언트 API가 없습니다. 반드시 백엔드 resolver에서 접근합니다.
- Entity property CRUD는 전용 클라이언트 API가 없으므로 해당 REST API(예: Jira Issue Properties)를 사용합니다.

## 검증

변경 후 아래를 실행합니다. Forge CLI 명령은 **app root**에서 실행하며, 직전에 `pwd`로 경로를 확인합니다.

```powershell
# backend
npm test -- --runInBand

# frontend
Set-Location static/ui
npm test -- --runInBand
npm run build          # CI 조건 재현: CI=true npm run build
Set-Location ../..

# Forge
pwd
forge lint
```

프론트 빌드는 CI에서 `CI=true`로 돌아갑니다. 로컬에서 통과했는데 CI가 깨지면 이 조건 차이부터 확인하세요.

## 배포·설치

- **연동 이슈 작성 기간·사전 승인**(작업관리 "승인 설정", 연동 작업 새 기록 넘김)의 원본 문서는 승인 앱 리포 `docs/LINKED-ISSUE-SCHEDULE.md` 다. 판정 규칙의 원천은 승인 앱이다 — 워크포스는 팀장 확인·KVS 저장·`change.notify` 와, 저장 직전 승인 앱 `write.judge` 질의(판정 불가면 넘김)만 한다(2026-10-19 채널 전환).
- **승인 앱 연동 서명 키**(`MOVES_LINK_SIGNING_KEY`·`MOVES_LINK_SIGNING_KID`·`MOVES_LINK_TRUSTED_KIDS`, 공개 키 목록 공유 파일 `src/integration/channel/keyring.js`) 설정·교체·폐기 절차는 승인 앱 리포 `docs/ops/WORKFORCE-LINK-SIGNING-KEYS.md` 가 원본이다. 키 생성도 승인 앱의 `scripts/workforce-link/gen-key.mjs` 로 한다. `src/integration/channel/*` 은 승인 앱 원본을 바이트 그대로 복사하고 `sharedHash.test.js` 가 대조한다(`.gitattributes` `eol=lf`). **운영(prd) 키가 아직 없다** — 운영 배포 전 생성·등록. 비밀 키(seed)는 `forge variables set --encrypt` 로만, 파일·커밋 금지.
- **승인 앱 연결(페어링)**: 어느 앱에서든 관리자가 연결 코드를 만들고 상대 앱 설정에 붙여넣으면 양방향 연결이 끝난다(30분 만료, 사이트 불일치 거부). 두 앱 manifest 에 dynamic webtrigger·egress(상대 앱 webtrigger 도메인)가 있어 **major 업그레이드이고 Runs on Atlassian 자격이 없다**(사용자 결정 D4). 한쪽만 신판이면 "연결 필요"(연동 기능 꺼짐과 같은 동작).

```powershell
pwd
forge lint
forge deploy --non-interactive --e development
forge install --non-interactive --site <site-url> --product jira --environment development
```

- 지정이 없으면 `development` 환경을 사용합니다.
- scope 또는 permission을 바꿨다면 deploy 후 `--upgrade`로 기존 설치를 갱신합니다.
- `--no-verify`는 사용자가 명시적으로 요청하지 않는 한 쓰지 않습니다.
- **운영 사이트에는 단일 환경 앱만 설치합니다.** dev/prod 앱이 한 사이트에 공존하면 같은 이름의 커스텀 필드가 2벌 생겨 JQL 이름 매칭이 모호해집니다.

## 터널링

- `manifest.yml`을 바꿨으면 redeploy 후 터널을 재시작합니다.
- 코드 파일만 바꿨으면 redeploy 없이 hot reload로 반영됩니다.

## 진단

```powershell
pwd
forge logs -e development --since 15m -n 100
```

진단 로그를 백엔드 `console.log`로 심지 말고, **resolver 반환값에 담아 브라우저 콘솔에서 확인**할 수 있게 설계합니다.

## 커밋

- 커밋 메시지에 `Co-Authored-By: Claude` 트레일러를 넣지 않습니다.
- 커밋·푸시는 사용자가 요청했을 때만 수행합니다.

## 워크로그 사후 승인 집계 예외 (2026-10-13)

- 사용자 요청에 따라 진행월은 정상 출처 기록, 마감 뒤에는 정상 출처의 승인 기록만 집계한다. 타인 사용자 프로퍼티의 asUser 제한으로 집계가 비는 문제를 해결하기 위해 `ApprovalCertReader.applyWorklogApproval`에 한해 승인 서명 문서를 asApp으로 읽는다.
- **2026-10-28 갱신(RFC-220 검토 F1·F2·F3, 위 ⑨):** 연동 모드의 프로젝트 워크로그는 **앱 자격으로 읽고 범위는 워크포스 권한 모델**(가드의 프로젝트 스코프·팀장·협업)이 정한다(`readAs:'app'`). 아래 두 항목(asUser 재확인·숨김 승인분 보충)은 asUser 로 읽는 경로(`readAs` 미지정 — 연동 OFF 또는 앱 자격 판정을 쓰지 않는 호출)에만 해당한다. 앱 자격 경로는 승인 앱 `issue.control`(AGGREGATE) hidden id 에 있는 숨김 행만 남기고 원래부터 제한된 기록은 버리며, 승인 상태는 `cert.query` STATS 로 덧씌운다. 리소스 상세·캘린더도 승인 앱이 숨긴 남의 기록을 행으로 싣는다(옛 "남의 숨김 행을 내보내지 않는다" 대체).
- 공개 행은 조회자 asUser `permissions/check`와 `worklog/list`로 다시 제한하고 id·issueId·author 및 현재 지문을 대조한다. 승인 문서 원문과 타인 결정자·결정시각·requestId는 반환하지 않는다. 원가 캐시와 일반/숨김 집계 캐시는 각각 분리하고 조회자 키를 포함한다.
- 숨김 승인분은 숫자 집계에만 보충한다. `resolvePrincipal`의 본인 및 `leadingScopeAccountIds` 범위로 문서를 먼저 제한하고, 조회자의 `permissions/check`+`issue/bulkfetch`를 통과한 이슈 집합만 사용한다. 기존 `hiddenCertifiedRowsOf`의 author·issue 재대조와, 승인 앱 `issue.control` 이 답한 hidden id 대조를 모두 유지한다.
- 연동 작성은 승인 이슈 패널과 Workforce 앱 내부 두 경로를 허용한다. Workforce의 Jira 이슈 패널 중복 작성 UI는 제외한다. Workforce 쪽 작성·수정·삭제는 저장 직전 승인 앱 채널 `write.judge` 로 판정하고(ALLOW 만 asUser 저장 후 `write.commit`, DENY 거부, DEFER·상대 장애는 저장하지 않고 승인 앱으로), 페어링이 없으면 승인 앱으로 넘긴다(2026-10-19).
