# 작업 규칙

> 아키텍처·디렉터리·도메인 규약의 단일 진실은 `CLAUDE.md` 다. 이 문서는 그 위에 얹히는 작업 규칙이다.
> 현행화 기준: 2026-10-03 · Confluence 판 `fa07591` 에서 복사 후 Jira 기준으로 고침

## 코드 스타일

- 바닐라·관용적 JavaScript. 기존 파일의 주석 밀도·네이밍을 따라간다.
- **주석은 "왜"를 적는다.** 무엇을 하는지 다시 쓰는 주석, 방어적 부연, 장식 배너는 쓰지 않는다.
  이 저장소는 "왜 이 방어가 필요한가 + 언제 사고가 났는가"를 남기는 쪽이다.
- 버그 수정에 테스트·주석·부가 UI 를 부풀리지 않는다. 요청 범위를 지킨다.
- 파일을 만들기 전에 `static/ui/src/components/` 와 `src/rdb/query/` 의 공용 지점을 먼저 확인한다.

## 불변식 체크리스트 (변경 전 훑을 것)

- [ ] resolver 3종 세트 — `guardedDefine` + `PermissionMap` + `CONTROLLER_REGISTRARS`
- [ ] `SELF` mutation 은 `context.accountId` 를 SQL row owner predicate 까지 전달했는가
- [ ] CAS UPDATE 의 SET 절에 `rev = rev + 1` 이 있는가
- [ ] 조건부 UPDATE 로 남의 결정을 덮을 수 없는가 (`WHERE decision_type='PENDING'`)
- [ ] 도메인 함수에 `Date.now()`·in-place 변경이 섞이지 않았는가
- [ ] 목록 resolver 가 건별 이슈 열람 권한(`/rest/api/3/permissions/check` 일괄)으로 좁히는가, 팀장은 자기 팀원만 보는가
- [ ] 엔티티 프로퍼티 값을 판정에 쓰지 않았는가(서명 검증 전에는 표시용)
- [ ] 신규 테이블 참조 전 `isTableReady()` 프로브를 했는가
- [ ] `whereIn` 에 빈 배열이 갈 수 있는 경로를 가드했는가 (fail-open 금지)
- [ ] 쿼리키는 `utils/queryKey/` 팩토리를 썼는가
- [ ] 마이그레이션 이름을 **배포 후 바꾸지 않았는가**

## 보안

- **가드 통과 ≠ 데이터 범위 확정.** 같은 데이터를 내주는 형제 resolver 를 전수 확인한다.
- Jira REST 는 **`asUser()` 가 기본**. `asApp()` 은 아래만 허용하고, 늘릴 때는 사유를 여기 적는다:
  1. 워크로그 이벤트 트리거·누락 보정 스윕의 워크로그 조회 **와 그 워크로그가 속한 이슈의 프로젝트 id 조회**(`issue/bulkfetch fields=project`, 이력 수집 범위 판정) — 사용자 컨텍스트가 없다. 사유 `timesheet-drift-*` / `worklog-history-trigger` / `worklog-history-sweep` / `worklog-history-project`.
     (2026-10-04 worklog-history — QUESTIONS Q72 기본 가정 (a)로 확장. 사람 확인 전이다)
  2. 워크포스 연동 프로퍼티 게시(사용자×기간 승인 상태)와 **게시물 대조용 재조회** — 결정 시점에 대상자가 접속해 있지 않다.
     `WorkforcePublisher` 만 asApp 게이트웨이를 쓴다(사유 `workforce-publish` / `workforce-publish-verify`). 게시물은 사용자×기간 결재 문서(`movesApproval.{YYYY}`)와 사용자×월 인증 문서(`movesApproval.cert.{YYYY-MM}`, 2026-10-10 인증 모델) 세 종류다 — 사용자×기간 결재·사용자×월 인증 + 통제 설정 문서(`movesApproval.ctl`, 프로젝트·이슈 프로퍼티 PUT/DELETE/대조 GET, `WorkforcePublisher.drainCtl`·`publishCtlNow`, 2026-10-11 worklog-control). 수신(워크포스 게시물 읽기)은 전부 asUser. 게시 PUT·대조 GET 은 **큐 작업에서만** 한다 — 일일 `workforce` 작업과, 인증·재인증·관찰 전이 직후 `WorkforceCertWake` 가 넣는 이벤트성 `workforce-cert` 작업(`WorkforcePublisher.publishCertNow`, 인증 문서 행만, 일일 tick 과 같은 리스). resolver·트리거는 아웃박스 touch 와 깨우기(KVS 표식·큐 push)만 하고 Jira 를 부르지 않는다. 깨우기는 정책 꺼짐·서명 불가·미연결(검증 수신 없음)이면 아무것도 넣지 않고, 지연 45초 창 안의 반복 인증은 한 번으로 합친다(2026-10-11 audit-retention-sync, Q134 가). 리스 경합으로 못 내보내면 리스 상한 뒤로 한 번만 다시 넣는다(payload retry:1, 무한 재시도 없음).
  3. 라이선스 self-query
  4. **워크플로 validator** 의 이슈 조회(프로젝트·유형·현재 상태)와 무장된 승인의 changelog 재확인 — validator 실행에 사용자 컨텍스트가 보장되지 않는다(X2). `TransitionValidatorService` 만 쓴다(사유 `transition-validate` / `transition-changelog`, 호출은 `IssueStateReader`). 읽은 값은 판정에만 쓰고 거부 문구에는 payload 의 이슈 키 외에 아무것도 싣지 않는다. X2 실측에서 asUser 가 되면 asUser 로 바꾼다.
  5. **워크로그 통제(worklog-control)** — `WorklogControlGateway` 만 쓴다(사유 고정 집합 `worklog-control-{read,edit,delete,restrict,release,foreign-delete,trigger,reconcile,backfill,readiness,diagnostic}` — 집합 밖 사유는 Jira 호출 전에 던진다). 트리거 경로의 이슈→프로젝트 조회(`issue/bulkfetch fields=project`, 사유 `worklog-control-trigger`)만 `WorklogControlDetector` 가 직접 부른다.
     - 수정·삭제의 허가는 **승인 앱 현재 DB 상태로만** 판정한다(서명 문서·워크포스 판정으로 대신하지 않는다). 순서: 본인 작성분(Jira 응답 author) → 통제 작업 중·다른 경로 처리 중 → 기간 창(미해결이면 거부) → 인증 잠금 → 기간 잠금(승인은 정책 무관) → 정책. 실행 전 통제 행에 op id·호출 사용자를 claim 하고, PUT 에 `movesApproval.op` 프로퍼티를 실어 이력 행위자를 op 일치로만 귀속한다. asApp 은 통제 행(RESTRICTED·UNKNOWN)이 있거나 권한 스킴 방식일 때만.
     - **asApp 조회 결과를 사용자에게 돌려주는 예외**(CLAUDE.md 불변식 8, Q127 승인): 우리 통제로 가려진 워크로그 중 ① 작성자 = 호출자, 또는 ② `TeamScope.leads` 를 통과한 대상자의 것 — 호출자는 서버 `principal.accountId` 로만 정하고(①), 둘 다 SQL 소유자 조건을 **asApp 호출 전에** 먼저 걸고 + 응답 author·worklogId·issueId 재대조 + 조회자 이슈 열람 재확인(`HiddenAwareCollector`)을 거치고, 설명은 작성자에게만, 합계·상한은 합친 뒤 재적용, count·내보내기·캐시도 같은 범위이고 캐시 키에 조회자를 넣는다(⑥). 남의 숨김 워크로그는 존재 여부도 드러내지 않는다(NOT_FOUND 와 같은 응답). 원래부터 제한된 워크로그는 보충하지 않는다.
     - 제한·해제 PUT 은 visibility(와 op 프로퍼티)만 보낸다. 다른 경로 입력 삭제는 출처 증명 부재(`NONE`)일 때만, 안전장치 S1~S11 을 모두 거친다. 실행 직전 재확인(S4)에서 하나라도 어긋나면 FLAG 로 강등한다.
     - `mypermissions` 는 앱 자신의 권한만, 진단은 관리자가 지정한 시험 이슈에서만 쓴다.
     - 워크포스 연동 신호(`movesRms.policy` 이슈·프로젝트 프로퍼티) 읽기: 화면(작업 로그 탭·편집·넘김·쓰기)은 asUser, 워크로그 이벤트 경로만 asApp(사유 `worklog-control-trigger`) — `IssueSignalRefresher` 가 읽고 `WorklogPolicyAuthority.refreshOne` 의 서명 검증을 거친 것만 반영한다(불변식 9). 같은 이슈는 1시간 안에 다시 읽지 않는다.
     - 능력 신호 다시 읽기(`refreshWorkforceCapabilities`, 앱 관리자): 다른 사용자의 `rms.org` 사용자 프로퍼티를 **호출 관리자 asUser** 로 읽는다(최대 50명). 읽기 거부는 `UNREADABLE` 로 두고 저장값을 바꾸지 않는다. 결과는 서명 검증 후 DELETE 관문 판정에만 쓴다.
     - 연동 이슈 설정 관찰: 검증 수신 KVS 표식이 있는 생성·수정 이벤트에서 `movesRms.issue`를 asApp(사유 `worklog-control-trigger`)으로 읽고 서명 검증된 DB 설정과 실제 적용된 사전 승인 행을 대조한다. 위반과 APP 창구의 워크포스 직접 작성은 append-only 관찰 로그만 남긴다(삭제·숨김·알림 없음). 화면·타임시트 제출 재조회는 asUser이며, 사전 승인 프로퍼티 표식은 위반 판정에 쓰지 않는다.
     (2026-10-11 worklog-control)
  이 경로로 읽은 워크로그는 지문 계산·상태 판정 **과 워크로그 변경 이력(`worklog_history`) 저장** 외에 쓰지 않는다. 이력을 사용자에게 보여 줄 때는 조회자 asUser 이슈 열람 권한(`permissions/check`)으로 다시 좁히고, 제한 공개 워크로그의 설명은 작성자에게만 보인다.
- `api.asUser(accountId)` offline impersonation 은 `TransitionOfflineGateway` 에서 승인 요청자 본인의 상태 전환 사전 확인·POST·결과 대조에만 쓴다. 최종 결재자나 `asApp` 권한으로 바꾸지 않으며, `UNKNOWN` 결과는 재POST하지 않는다.
- scope 는 최소로. 실제로 필요할 때만 추가하고 `forge install --upgrade` 를 함께 돌린다.
- Forge SQL/KVS 는 클라이언트 API 가 없으니 반드시 백엔드 resolver 를 경유한다.
- 로그에 사용자 텍스트(반려 사유·페이지 제목)를 남기지 않는다. `executeQuery` 는 쿼리 본문만 남기고 파라미터는 버린다.
- 통제 판단·조치 이력(`worklog_control_log`)은 append-only — UPDATE 없음, DELETE 는 보관 정리(내보내기 확정 범위) 하나. 관리자 해제·확인은 사유 필수이고 사유 원문은 로그에 남기지 않는다.
- **유료 앱 — 라이선스 차단은 두 겹, 경계는 하나.** manifest `app.licensing.enabled: true` 가 전제다(없으면 `context.license` 가 안 온다).
  백엔드는 `ResponseWrapper` 의 `assertLicenseAllowed` 가 모든 resolver 를 감싸고, 프론트는 `app/mount.jsx` 의 `LicenseGate` 가
  모든 엔트리를 감싼다 — 엔트리에 `mount` 말고 `createRoot` 를 직접 쓰지 않는다. 차단은 **명시적 INACTIVE 하나뿐**이다.
  판정 불가(UNAVAILABLE)는 통과시킨다(상류 5xx 한 번이 앱 전면 정지가 된다). 단 License API 가 200 으로 답했는데 활성
  레코드가 없으면 "판정 불가" 가 아니라 INACTIVE 다. 프론트·백엔드가 같은 경계여야 "서버는 답하는데 화면만 안내"가 안 생긴다.
  `displayConditions: appIsLicensed` 는 넣지 않는다(개발 설치에 라이선스가 없어 전 화면이 막힌다). 라이선스 원문을 로그·콘솔에 찍지 않는다.

## 트리거·스케줄

- **핫패스 트리거는 절대 throw 하지 않는다.** Forge 가 재시도하는데, 부분 적용된 만료 위에 재시도가 겹치면 알림이 중복된다. 실패는 리컨실 배치로 넘긴다.
- `worklog-control` 큐 작업은 일일 목록에 없다 — KVS 표식(`approval:worklogControl:pending`)이 있을 때만 일일 트리거가 넣는다. 원장은 SQL 행이고 큐는 깨우기다. `preUninstall` 은 보조 해제(55초)다. `workforce-cert` 큐 작업도 일일 목록에 없다(`EVENT_JOBS`) — 인증 이벤트로만 들어온다. 인증 없는 날 실행 0·SQL 0. 유휴 합계(27·38)에 들어가지 않는다.
- 라이선스 예외: 워크로그 통제 상태·해제(`getWorklogControlStatus`·`releaseWorklogControl`)는 INACTIVE 에서도 연다(PermissionMap `licenseInactiveAllowed`, admin 축과 함께만) — 앱 제거·만료 전 숨긴 기록을 되돌릴 수 있어야 한다.
- 라이선스로 트리거를 막지 않는다 — 상태 정합이 깨진 채 남는다. 대신 **알림 생성만** 막는다(`shouldEmitNotifications`).
- 배치는 예산(잔여 시간·요청 수)을 두고 못 끝내면 커서를 남겨 다음 주기가 이어받는다. **미완주 시 watermark 를 전진시키지 않는다.**
- **유휴 비용은 0에 가깝게.** Forge SQL 은 요청 수·실행 시간마다 과금된다. 스케줄 트리거는 **일일 `approval-sweep` 하나**뿐이고 배치 작업은 거기서 큐로 fan-out 한다(2026-10-10 결정 — 5분·시간당 스윕 3개가 사용자 0명에 월 30만 요청). 새 작업은 트리거를 늘리지 말고 fan-out 목록에 넣는다. 현재 빈 상태 하루 합계: 워크포스 미연동 27회, 연동 설치는 workforce 작업 13회 포함 38회(`idleSqlBudget.test.js`). 빈 상태 SQL 횟수를 테스트로 고정하고, `information_schema` 는 KVS 스키마 마커가 없을 때만, 리스는 조건부 UPDATE 1회, 기능 OFF·미연결이면 SQL 전에 반환한다. 지연 요구(수분 내 반영)는 스케줄이 아니라 결정 직후 동기 실행으로 푼다.

## 검증

- **`npm run check:bundle` 을 반드시 돌린다.** Forge 와 같은 webpack 번들을 만들어 require 해 본다. Jest 는 순환 import 의 TDZ("Cannot access 'X' before initialization")를 재현하지 못해, 테스트가 전부 통과해도 배포하면 모든 resolver 가 시작 단계에서 죽을 수 있다(2026-10-12 실측). 싱글턴을 만들 때 다른 모듈 기본 export 를 매개변수 기본값으로 즉시 잡지 말고 호출 시점에 꺼낸다.

변경 후 순서대로:
```
npm test -- --runInBand          # 백엔드 + 계약 테스트
npm run test:ui -- --runInBand   # 프론트
npm run build:ui                 # 번들 예산 확인
forge lint
```
진단은 백엔드 `console.log` 대신 **resolver 반환값에 담아** 확인하도록 설계한다.
서버 로그는 `forge logs -e development --since 15m -n 100`.

**iframe 안 버튼 클릭은 자동화에서 신뢰할 수 없다.** 검증 화면은 페이지 로드만으로 실행되게 만들고
결과를 `forge logs` 로도 남긴다(스파이크에서 확립).

## 병렬 작업 중 금지 사항

**Codex 에이전트가 도는 동안 빌드·배포하지 않는다.**
파일이 절반만 쓰인 상태로 번들에 들어가 화면이 통째로 뜨지 않는다(실제로 겪었다).
빌드는 **모든 에이전트가 완료 보고를 낸 뒤** 한 번에 한다.

같은 이유로, 에이전트가 도는 중에는  로 뭉뚱그려 커밋하지 않는다 —
남의 미완성 변경이 섞인다. 경로를 특정해 스테이징한다.

## 배포

> ⚠ `manifest.yml` 의 app id 가 `REPLACE-WITH-forge-register` 인 동안은 배포하지 않는다. `forge register` 로 새 id 를 받은 뒤 바꾼다(Confluence 앱 id 를 쓰면 그 앱을 덮어쓴다).

```
forge deploy --non-interactive -e development
forge install --upgrade --site tom-chkim-dev.atlassian.net --product jira -e development
```
- **scope·모듈이 바뀌면 `--upgrade` 필수.** 안 하면 배포는 되는데 사이트는 옛 권한으로 돈다.
- `sql` 모듈 추가처럼 major version 이 올라가는 변경은 `--approve MAJOR_VERSION_RULE` 이 필요하다.
- 엔트리를 추가할 때는 **세 곳을 함께** 고친다: `craco.config.js` 의 `ENTRIES`,
  `static/ui/public/<key>.html`, `manifest.yml` 의 `resources[].entry`.

## 커밋

- 커밋 메시지에 `Co-Authored-By` 트레일러를 **넣지 않는다** (고객 배포 저장소라 도구 흔적을 남기지 않는다).
- 커밋·푸시는 사용자가 요청했을 때만 한다.
- 메시지는 한국어. **무엇을 바꿨는지보다 왜 그렇게 했는지**를 적는다.
- 빌드 산출물(`static/ui/build`)은 커밋하지 않는다.
