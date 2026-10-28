# 검증 리포트 (회차 1) — worklog-control

> 검증: integration-verifier · 2026-10-11 · 기준: `01_architect_design.md` 2판, `codex-review.md`, `02_backend_report.md` 1·2회차, `02_frontend_report.md` 1~3회차, QUESTIONS Q119~Q130
> 실제 변경은 `git status`(83개: 수정 64 + 신규 19 경로)로 확정. 코드·문서 무수정(이 파일만 작성). 커밋·배포 없음.

## 요약  통과 44 / 실패 6 / 미검증 11

실행 5종 전부 통과(BE 134/2051, FE 58/522, build·merge·lint 성공). 보안 핵심(쓰기 검사 순서·작성자 판정·Phase D 서버 차단·라이선스 예외·유휴 SQL)은 코드로 확인했다.
실패는 기능 1건(P1: FLAG 의 "인증 제외"가 화면 문구에만 있고 서버에 없음), 범위·fail-close 2건(P2), 경미 2건(P3), 문서 1건이다.

## 실패

### F1 [P1] FLAG(다른 경로 입력)의 "인증 제외"가 구현되지 않았다 — 화면은 제외된다고 안내한다 (담당: architect 결정 → backend, 또는 frontend 문구)
- 설계 §4.4: "FLAG 효과: 탭 배지, **인증 제외(`certifiable:false`, 사유 `FOREIGN`)**, 감사 표, 작성자 알림".
- 화면 문구: `locales/kr/worklogControl.json` `foreign.description` "표시된 기록은 인증에서 빠집니다", `foreign.action.FLAG` "표시만(인증 제외)"(en 동일).
- 서버: `src/resolver/worklogCert/WorklogCertService.js:389` `certifiable` 이 `worklog_control.foreign_state` 를 보지 않는다. `certifyFor`(:540~) 쓰기 경로도 마찬가지 — `src/` 전체에 FLAGGED 를 인증에서 거르는 코드가 없다(`grep -rn "FLAGGED\|foreignState" src` → WorklogService 표시용만). 백엔드 보고서 D-목록에도 없다.
- 주의(결정 필요): 기본값 Phase A = FLAG·LINKED 이고 워크포스 출처 증명(WF-7)이 아직 없어, 연동 이슈(이슈 단위 `rms.policy I:` 신호가 VERIFIED 인 이슈)의 **정상 워크포스 탭 입력도 전부 FLAG** 된다. 이대로 인증 제외를 넣으면 그 이슈 워크로그가 전부 인증 불가가 된다.
- 고치는 방법(둘 중 하나, 리더·architect 결정):
  (a) 인증 제외 구현 — `listFor` 의 `certifiable` 과 `certifyFor` 쓰기 경로에 같은 조건(읽기·쓰기 대칭)으로 `foreign_state ∈ {FLAGGED, RECHECK, DELETE_PENDING, DELETING}` 이면 제외 + 건별 코드. 단 WF-7 전에는 `reason=NONE ∧ linked` 를 제외 대상에서 빼거나 기본 범위를 조정.
  (b) WF-7 전까지 제외하지 않기로 하고 kr/en 문구에서 "인증 제외"를 뺀다(frontend).

### F2 [P2] 쓰기 경로의 숨김분 asApp 조회에 SQL 소유자 조건이 없다 — 남의 숨김 워크로그도 asApp 으로 읽고, 응답 코드로 존재가 드러난다 (담당: backend)
- `src/resolver/worklogControl/WorklogControlContext.js:108-115` `loadHidden(issueId, worklogId)` 은 통제 행의 이슈·상태만 보고 `author_account` 를 보지 않은 채 asApp GET 한다. 작성자 대조는 그 뒤 `src/resolver/worklog/WorklogService.js:227` 에서 한다.
- 설계 §2.4 조건 2("후보는 SQL 소유자 조건으로 **먼저** 줄이고") 위반. 결과 본문은 사용자에게 안 나가지만, 이슈 열람자가 임의 worklogId 로 update/delete/handoff 를 부르면 숨김분이면 `WORKLOG_NOT_OWNER`, 아니면 `WORKLOG_NOT_FOUND` — 남의 숨김 워크로그 존재 여부가 구별된다. 테스트 `src/resolver/worklog/__test__/WorklogServiceControl.test.js:199` 가 이 동작을 고정하고 있다.
- 고치는 방법: `loadHidden(issueId, worklogId, accountId)` 로 받아 `row.authorId !== accountId` 면 `null`(원래 404/403 그대로 던짐) — asApp 호출 없음. 테스트 :199 를 "남의 숨김분은 asApp 미호출 + NOT_FOUND" 로 바꾼다. `HiddenAwareCollector` 의 `findHiddenByIssueAuthor`·`certSupplement`(authorId 필터) 와 같은 규칙이 된다.

### F3 [P2] 연동 판정 실패가 기간 창을 끈다(fail-open) (담당: architect 결정 → backend)
- `src/resolver/worklogControl/ControlLinkJudge.js:40-43` 은 SQL·KVS 오류를 `linked:false, unavailable:true` 로 돌려주고, `WorklogControlContext.js:62-66` 은 `linked` 가 false 면 창을 만들지 않으며 `rules.js:160·177` 도 `linked && dateWindowOn` 일 때만 창을 검사한다. → 창 ON 사이트에서 `workforce_inbound` 조회가 실패하면 연동 이슈의 기간 밖 쓰기가 통과한다.
- 주석은 의도(비연동 사용자를 막지 않으려고)라고 적었지만, 과제의 "기간 창 fail-close" 와 codex P1(Start date fail-open)의 취지와 어긋난다. 필드 미해결은 막으면서 연동 미해결은 연다.
- 고치는 방법: `dateWindowOn && link.unavailable` 이면 `window={status:'READ_FAILED'}` 로 두고 창 검사를 적용(→ `WORKLOG_WINDOW_UNRESOLVED`). 창 OFF 사이트는 영향 없음. 테스트 1개(링크 판정 throw + 창 ON → 거부).

### F4 [P3] resolver 안에서 await 하지 않는 SQL(fire-and-forget) (담당: backend)
- `WorklogControlContext.js:144` `cleanupIntents(...).catch(()=>{})`, `:188` `cleanupInline(...).catch(()=>{})` — 응답 뒤 실행 보장이 없다(점검표 "resolver 응답 후 fire-and-forget 금지"). 정리 실패는 무해하지만 규칙 위반이고 테스트의 SQL 횟수 단언을 흔든다.
- 고치는 방법: `await ….catch(() => {})` 로 바꾸거나(작성 1건당 +1 SQL 은 이미 표에 있음) 워커 정리로 옮긴다.

### F5 [P3] `listForeignWorklogs` 의 `nextCursor` 가 걸러진 행의 worklogId 일 수 있다 (담당: backend)
- `src/resolver/worklogControl/WorklogControlService.js:273` `nextCursor: page.at(-1).worklogId` — `page` 는 이슈 열람 필터 **전** 목록이라, 관리자가 못 보는 이슈의 worklogId 가 커서로 나갈 수 있다(행 자체는 `hiddenCount` 로 숨겼는데 id 하나가 샌다).
- 고치는 방법: 커서를 그대로 쓰되 응답에는 불투명화(예: base64) 하거나, 감수(관리자·id 만)로 결정하고 설계 §2.4 표에 적는다.

### F6 [문서] 불변식 8 예외 조건이 리포 밖 파일을 가리킨다 + 문서 갱신 누락 (담당: 리더)
- `CLAUDE.md:62` "조건 6가지는 `_workspace/worklog-control/01_architect_design.md` §2.4" — `_workspace/` 는 `.gitignore:4` 로 추적되지 않는다. AGENTS.md asApp 5번은 조건 2~5 만 담고 조건 1(호출자 = resolver principal)·조건 6(count·합계·내보내기·캐시 동일 범위, 캐시 키에 조회자)이 없다. → 6조건을 AGENTS.md 5번(또는 `docs/DESIGN.md`)에 옮기고 CLAUDE.md 는 그쪽을 가리킨다.
- `CLAUDE.md` 제품 변경 이력에 2026-10-11 worklog-control 행 없음. `docs/DESIGN.md §2.0` 갱신(설계 §1 "문서" 행) 안 됨 — 무변경.
- `04_spike_todo.md` 는 백엔드 보고서 §10·§11 을 그대로 붙여 "`04_spike_todo.md` 는 이번 회차에 만들지 않았다" 문장과 §11(발견)까지 들어가 있다 — 정리 필요.

## 미검증

| 항목 | 이유 | 확인 방법 |
|---|---|---|
| G_ROLE·G_BLOCK·G_POST·G_PRESERVE·G_AGG·G_RECOVER·G_FIELD·G_ORIGIN·G_DELETE·G_TEAM_MANAGED·G_SCHEME(앱 역할 멤버십, visibility-only PUT, 작성자·관리자 차단, 404/403, notifyUsers, 닫힌 이슈 400, author/updateAuthor, 타 앱 프로퍼티) | 플랫폼 실측 필요 | 개발 사이트에서 진단 도구 실행 + 수동 기록(04_spike_todo) |
| G_HANDOFF — 전역 페이지 하위 경로가 iframe `location.pathname` 으로 오는지 | 실측 필요 | 배포 후 `/jira/apps/{id}/{env}/worklog/{issueId}/{worklogId}` 직접 진입 |
| `preUninstall` 실제 실행·55초 | 실측 필요(lint 는 통과) | 별도 설치에서 제거 |
| 연동 사이트 Phase A 오탐 규모 — 이슈 단위 `rms.policy I:` 신호가 있는 이슈에서 워크포스 탭 정상 입력이 전부 FLAG(+RECHECK 큐 1회) | WF-7 미배포, 운영 데이터 필요 | 연동 개발 사이트에서 워크포스 탭 입력 → 다른 경로 목록 확인. F1 결정과 연결 |
| 통제 알림 5종(FLAG 작성자 알림 포함) | Q130 미해결(알림 테이블 `request_id NOT NULL`) — 설계상 보류 | Q130 답 후 재검증 |
| 워크포스 WF-7~13(출처 서명·ctl 소비·연동 ALL_ISSUES) | 이 하네스 범위 밖 | 워크포스 리포 |
| 비활성 버튼 툴팁이 이슈 탭 iframe 에서 뜨는지 | 실측 필요 | 배포 후 확인(aria-label 로는 읽힘) |
| 라이선스 INACTIVE 실환경에서 설정 화면 현황·해제 동작 | 개발 설치에 라이선스 없음 | 테스트 라이선스 조건(codex V15) |
| 권한 점검 표 — 실제 권한 스킴 응답 모양 | 실측 필요 | 점검 표 실행 |
| asApp DELETE/PUT 이벤트의 op 귀속(이력 행위자) | 이벤트 페이로드 실측 필요 | G_ORIGIN·이력 화면 대조 |
| Forge Queue payload 크기·delay 600초 실제 전달 | 실측 필요 | 큐 지연 이벤트 관찰 |

## 통과

### 경계면 표 (생산자 ↔ 소비자)

| resolver | 생산자 | 소비자 | 일치 |
|---|---|---|---|
| getWorklogControlStatus | `WorklogControlService.js:113-161` settings·state(releaseRemaining)·gates(parts·versionChanged)·allowed·blockers(DELETE 끝 NOTIFICATIONS)·counts 12·deletesToday·deleteDailyMax | `WorklogControlSettings.jsx`·`worklogControlModel.js:42,111,128`(deleteNotificationsBlocked) | 일치 |
| runWorklogControlDiagnostic | `WorklogControlDiagnostics.js:64-101` `{gateId,result,steps,recorded,leftovers?}`, 키→id `issueRef` | `GateDiagnostics.jsx` | 일치 |
| recordWorklogControlGate | `Service.recordGate` `{gateId,result,at}` | 무효화만 | 일치 |
| getWorklogControlReadiness | `WorklogControlReadiness.js` `{items,nextCursor}` | `ReadinessTable.jsx` | 일치 |
| releaseWorklogControl | `{generation,pending}`, 입력 `{confirm:'RELEASE'}` | `ControlStatusPanel`·`TypedConfirmModal` | 일치 |
| retryWorklogControl | `{queued}` | `ControlStatusPanel` | 일치 |
| listForeignWorklogs | `Service.js:242-275` 행 필터·hiddenCount·users | `ForeignWorklogList.jsx`(hiddenCount 합산) | 일치(F5 별도) |
| clearForeignWorklog | `{worklogId,state:'CLEARED'}` | 무효화 | 일치 |
| getWorklogHandoff | `WorklogService.js:441-449` 편집 컨텍스트 + `issueKey`(asUser, 실패 null) + `worklogId` | `WorklogHandoffPage.jsx:38,79,94` | 일치 |
| getIssueWorklogs(가산) | `WorklogService.js:333-352` `control`·`removedForeign`, WorklogView `blocked·controlled·foreign·via` | `WorklogTab.jsx:206-266`, `rowActions.jsx` | 일치 |
| getWorklogEditorContext(가산) | `:419-434` `control`, `worklog.blocked` | `WorklogDialog.jsx:77-89,164,198` | 일치 |
| saveApprovalSettings | `SettingsService.js:226-245` `payload.patch ?? payload` + `payload.worklogControl` | `WorklogControlSettings.jsx:351` `{patch, worklogControl}` | 일치 |
| 에러 12개 + NOT_OWNER·STORAGE_NOT_READY·INVALID_TARGET·PERIOD_LOCKED | `ErrorCodes.js` | `locales/{kr,en}/error.json` 각 1회 — 스크립트 대조 | 일치 |

`.content` 이중 접근 없음(`grep "\.content\b"` — 테스트 표 셀만). 쿼리키는 `worklogControlKeys` 팩토리(원시 배열 0건).

### 보안 핵심 — asApp 쓰기 경로 검사 순서 (`WorklogService.js:519-613`, `rules.js:150-171`)
- 순서: 정책 계층 로드 → asUser GET(404/403 이면 통제 행 HIDDEN·같은 이슈일 때만 asApp GET) → 이슈 일치 → **본인(Jira 응답 author, :227)** → 통제 작업 중(APPLYING·DELETING → CONFLICT) → 다른 경로 삭제 예정(수정만 FOREIGN_LOCKED) → 기간 창(미해결 거부, 수정은 새·이전 started 둘 다) → 인증(CERTIFIED·MISMATCH) → 기간 잠금(`lockApproved` 정책 무관) → 정책 → claim(`claimApp` — Jira 호출 전, CAS) → asApp PUT/DELETE(op 프로퍼티) → 결과 기록. AGENTS 5번 문구와 일치. — 통과
- 남의 워크로그: `loadForWrite` 에서 던져 그 뒤 통제·인증·잠금·정책 조회 0(테스트 :107 단언). — 통과(F2 의 사전 asApp 조회는 별도)
- asApp 은 `WorklogControlGateway` 만, 사유 11개 고정 + 집합 밖은 Jira 호출 전 throw(`Gateway.js:15-38`), `WorklogService` 는 asApp 직접 사용 없음(테스트 :299). 트리거의 bulkfetch 만 Detector 직접 — AGENTS 허용 범위. — 통과
- 불변식 8 예외 6조건: 조건 1 principal(`WorklogService`·`HiddenAwareCollector` 호출 인자) / 조건 2 `findHiddenByIssueAuthor`·`findHiddenByAuthorRange`·`certSupplement` 소유자 필터 + `accepted()` 응답 id·author·issue 재대조(F2 의 쓰기 경로 제외) / 조건 3 팀장 경로 `forAuthorRange` 의 `filterVisibleIssues`(조회자 asUser), 인증 실행은 `WorklogCertService.js:566` 재확인 보존, 이슈 탭은 가드 / 조건 4 `HIDDEN_STATES` + `isOurRestriction` / 조건 5 팀장 `stripComment`, `certSupplement` 설명 없음 / 조건 6 merge 후 MAX_ISSUES·MAX_WORKLOGS 재적용, 캐시는 invocation memo. 팀장 경로 진입 전 `scope.leads`(`WorklogCertService.js:284`). — 통과
- 형제 resolver: listForeign 행 필터·hiddenCount, clearForeign 열람 불가 = NOT_FOUND(:284), 진단 `accessCheck(issue,'view')`, 넘김 `issue:view` + 본인. 상태 counts 는 관리자 전역 집계(행 정보 없음). — 통과

### Phase 관문 서버 강제 (`WorklogControlService.prepareSave` :304-376, `SettingsService.js:235` 저장 전 호출)
- B/C: Q127 상수 → 해제 중이면 RELEASE_RUNNING → 관문(REQUIRED, 자동·수동 겸용은 두 부분 모두 PASS) → 저장소. 권한 스킴: Q127 + G_SCHEME. 대상 변경: 해제 중·잔여>0 거부, 그룹은 G_GROUP. 기간 창: 필드 검증 + G_FIELD(프로젝트·이슈 덮어쓰기도 `WorklogPolicyService` dateWindowGuard). — 통과
- **D: `CONTROL_NOTIFICATIONS_READY=false`(`WorklogControlState.js:33`) 면 다른 모든 검사보다 먼저 `GATE_REQUIRED{gate:'NOTIFICATIONS'}`**(:338). 감지기 `deleteReadiness` 가 알림 불가면 gatesOk=false → FLAG(`Detector.js:172`), 워커 `foreignDeleteOne` 은 claim 직후 Jira·상한·DELETE 전에 `FLAG_NOTIFICATIONS`(`Worker.js:265`). DELETE 호출부는 워커 1곳 + 진단의 자기 시험 워크로그 정리뿐. 상태 API 부재 시 닫힘. 테스트 3종 확인. — 통과
- 위험 키 7개는 GLOBAL_ONLY(worklogDateWindow 만 CATALOG) — 다른 저장 경로로 우회 없음. — 통과

### codex P0/P1 → 설계 2판 → 구현 대조

| codex | 설계 2판 | 구현 | 판정 |
|---|---|---|---|
| P0 워크포스 정상 입력 FOREIGN 오탐 → DELETE 위험 | §4.4 op 원자 결속, D 저장 조건 | intent PK + `bindIntent … WHERE worklog_id IS NULL`, D 는 알림·관문·`WF_WLORIGIN` 으로 서버 차단 | 반영(DELETE 불가). FLAG 오탐은 미검증 표·F1 |
| P0 서명 문서로 쓰기 허가 | §0.4 승인 앱 현재 DB 만 | 쓰기 판정 재료가 전부 DB(인증·잠금·통제 행)·KVS | 반영 |
| P1 asApp 보충 범위 | §2.4 6조건 | HiddenAwareCollector, listForeign 행 필터 | 반영(F2 쓰기 경로 예외) |
| P1 제한 PUT 값 덮어쓰기 | §4.6 visibility 만 | `putVisibility` 본문 visibility + op 만 | 반영 |
| P1 Jira 성공·SQL 실패 | APPLYING 선기록 + 조정 | claim 후 호출, 10분 APPLYING·UNKNOWN reconcile, 해제 대상 RELEASE_STATES | 반영 |
| P1 영속 재개 | DB 원장 + KVS 표식 | `wake`→`markPending`, runSweep 표식 시만 push, payload 이어달리기 보존 | 반영 |
| P1 전환 순서·기존 데이터 | §4.10 | 세대·backfill·`shouldRestrict` 재계산, 옛 세대 무시 | 반영 |
| P1 통제용 연동 판정 분리 | `controlLinkOf` | 신선도·ctl NONE·ALL_ISSUES | 반영(F3 실패 처리) |
| P1 Start date fail-open | 5상태 fail-close | `window.js` + 칸 부재 = READ_FAILED | 반영(F3 은 연동 판정 쪽) |
| P1 인증 실행 asUser | 숨김 대체 조회 | `certSupplement` + 기존 issueVisibility | 반영 |
| P2 행위자 추정 | op 대조 | `attribution` op 일치만 | 반영 |
| P2 ctl 게시 계약 | §6.3 | `WorkforcePublisher.drainCtl/publishCtlNow`, AGENTS 2번 | 반영 |
| S4·S5·S8·S11 | §4.5 | `deleteRecheck`(세대·설정·지문·출처·인증·잠금·연동), 참고 사본, 원자 상한, UNKNOWN 재DELETE 금지 | 반영 |
| NONE/OFF 이면 감지까지 꺼짐 | 통제·외부 처리 분리 | `Detector.wants`/`scopeOf` 분리 | 반영 |
| preUninstall | 보조 해제 | `onPreUninstall` 45초 예산, throw 없음 | 반영 |
| 라이선스 만료 시 status·release | 예외 2 | PermissionMap 2개 + guard 가 admin 동반일 때만 전달, 테스트가 면제 목록 = 2개 고정 | 반영 |

### 점검표
- 등록: 신규 9 resolver — guardedDefine(`WorklogControlController.js`) + PermissionMap(:220-229) + `CONTROLLER_REGISTRARS`(index.js:71). 프론트 invoke 이름 11종 모두 등록명과 일치. — 통과
- 라이선스 예외: `licenseInactiveAllowed` 는 `meta.admin===true` 일 때만 ResponseWrapper 로 전달(`permissionGuard.js:124`), 관리자 가드 유지, FE 설정 엔트리 `license:'banner'`. — 통과
- 불변식 3: `src/domain/worklogControl` 에 `Date.now`·`new Date()` 무인자 0건. — 통과
- 불변식 4: `worklog_control` 갱신 전부 `rev = rev + 1`(Repository :187, retry SQL). intent·counter 는 rev 칼럼 없이 조건부 UPDATE(원자). — 통과
- 불변식 9: 연동 판정은 `workforce_inbound` VERIFIED 만, 워크포스 출처는 서명 검증. — 통과
- 유휴 SQL: 새 scheduledTrigger·consumer 없음(manifest 은 `preUninstall` + function 1개만 추가). `idleSqlBudget.test.js` 27·38 상한 불변, worklog-control 표식 없으면 SQL 0·DAILY_JOBS 밖, 표식+빈 원장 ≤4 후 표식 삭제. 트리거는 스위치 꺼지면 KVS 만(`Detector.wants`). — 통과
- 마이그레이션 v057~v059 신규 테이블, v056 뒤 순서·중복 없음, migrate.test 갱신. — 통과
- manifest app id 변경 없음(diff 에 없음), `forge lint` 통과. — 통과
- i18n kr/en·merge 통과, 신규 `worklogControl.json` 양쪽 존재(`missing.NOTIFICATIONS` 포함). — 통과
- 엔트리 추가 없음(inbox 하위 경로, lazy + `importWithReloadOnce`). — 통과

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 — ko-KR.json·en-US.json 생성 |
| `npx jest --runInBand` (= `npm test`) | 통과 — **134 suites / 2051 tests** |
| `npm run test:ui -- --runInBand` | 통과 — **58 suites / 522 tests** (AuditTrail 날짜 의존 실패 해소 확인) |
| `npm run build:ui` | 통과 — "The build folder is ready to be deployed"(기존 Atlaskit 경고만) |
| `npx forge lint` | 통과 — No issues found (CLI 13.4.0 → 14.1.0 업데이트 권고 경고) |

---

# 검증 리포트 (회차 2) — 1회차 실패 6건 재검증

> 입력: `02_backend_report.md` 3회차(R3-1~5), `02_frontend_report.md` 4회차, 리더 문서 수정. 보고서의 "통과"는 믿지 않고 코드·실행으로 다시 확인했다.

## 요약  통과 6(1회차 실패 F1~F5 해소 + F6 대부분) / 실패 1(문서 잔여, 경미) / 미검증 1회차 표 그대로

## 실패

- [문서·경미] `_workspace/worklog-control/04_spike_todo.md:34` 에 "`04_spike_todo.md` 는 이번 회차에 만들지 않았다 — 위 표가 그 내용이다(리더가 옮길 것)." 문장이 아직 남아 있다(앞부분은 우선순위·시험 계정으로 정리됨). → 그 줄 삭제 (담당: 리더)

## 1회차 실패 재검증

| # | 1회차 지적 | 수정 확인(파일:라인) | 판정 |
|---|---|---|---|
| F1 | FLAG "인증 제외" 미구현·문구 불일치 | 리더 결정 = 인증 비차단 + 신호. **생산자** `summary.js:19,31` `Signal.FOREIGN_ORIGIN`(비트 256, 128 BASELINE 과 충돌 없음, SMALLINT 안), `SIGNAL_ORDER = Object.keys(SIGNAL_BITS)` 라 `signalsFrom`·`decodeFrozen` 출력에 포함된다. `WorklogCertService.js:375`(목록 `listFor` → 항목 `summary.signals`), `:607`(인증 실행 동결 `signal_mask`), 근거 `WorklogControlHooks.foreignOrigins` → `Repository.foreignFlaggedIds:417`(FLAGGED·RECHECK·DELETE_PENDING·DELETING·UNKNOWN, 테이블 없으면 SQL 0, 실패 빈 집합). `certifiable` 무변경, 차단 훅 `FOREIGN_BLOCKS_CERTIFICATION=false`. **소비자** `static/ui/src/features/worklogCert/certFormat.js:14` `SIGNALS` 에 `'FOREIGN_ORIGIN'` → `SignalBadges` 가 `item.summary.signals` 를 그린다, `worklogCert.signal/signalHint.FOREIGN_ORIGIN` kr/en 존재. **문자열·위치 일치.** 금지 문구("인증에서 빠/인증 제외/excluded from certification") locales·static/ui 전체 0건. 신호 마스크는 워크포스 계약으로 나가지 않는다(`src/integration`·`resolver/workforce` 에 signal 사용 없음) | 해소 |
| F2 | `loadHidden` 소유자 조건 없음·존재 노출 | `WorklogControlContext.js:118-121` `row.authorId !== accountId` 면 asApp 없이 null → asUser 원래 에러(NOT_FOUND). 호출 `WorklogService.js:220` 이 accountId 전달. 응답 author 2차 대조 유지(:227). 테스트 `WorklogServiceControl.test`·신규 `WorklogControlContext.test` | 해소 |
| F3 | 연동 판정 실패 → 창 fail-open | `WorklogControlContext.js:66-75` `link.unavailable && dateWindowOn` → `linked:true` + `window.status='READ_FAILED'` → `judgeMutation`/`judgeCreate` 가 `WORKLOG_WINDOW_UNRESOLVED`. channel 은 판정될 때만 WORKFORCE. 창 OFF 영향 없음. 작성 경로는 `judgeCreate`(WorklogService:486)가 `beginCreate` 보다 먼저라 불명 상태에서 `strict`(LINKED_ALL 제한)까지 가지 않는다 — 확인 | 해소(아래 관찰 1) |
| F4 | await 없는 정리 SQL | `WorklogControlContext` 의 `cleanupIntents/cleanupInline` 호출 제거, `await state.ensurePending(now)`(:160)만. 정리는 `WorklogControlWorker.js:568-574`(표식 있는 날, 각 ≤500행). `.catch(() => {})` 비대기 호출 잔존 0. `idleSqlBudget.test.js:211` 표식 있는 날 ≤6, 미연동 27·연동 38 상한 불변(:223) | 해소 |
| F5 | `nextCursor` 로 걸러진 행 id 노출 | `WorklogControlService.js:36-45` base64url(JSON `{a}`) 인코딩·검증, 숫자 직접 입력 = INVALID_TARGET(:263). 프론트 `ForeignWorklogList.jsx:33,36` 이 `nextCursor` 를 그대로 `cursor` 로 되돌린다(형식 무의존) | 해소(관찰 2) |
| F6 | 문서 | `CLAUDE.md:62-63` 6조건 인라인, `:121` 제품 이력 2026-10-11 행. `AGENTS.md:40` ①·⑥·"존재 여부도 드러내지 않는다" 추가. `docs/DESIGN.md:68-69` 4층(통제권 이관)·단계 A~D·D 서버 차단 추가. `04_spike_todo.md` 머리·우선순위·시험 계정 정리 | 대부분 해소(위 실패 1줄 잔여) |

## 관찰 (실패 아님 — 다음 변경 때 주의)
1. F3 수정은 `ctx.linked` 를 "창 판정용 연동"과 "통제 연동"에 함께 쓴다. 지금은 `judgeCreate` 가 먼저 막아 안전하지만, 앞으로 작성 순서가 바뀌거나 창 판정 전에 `ctx.linked` 를 쓰는 코드(`beginCreate`·`finishCreate` 의 `strict`, `controlView.linked`)가 생기면 불명 이슈가 LINKED_ALL 제한 대상으로 잡힐 수 있다. 별도 칸(`windowLinked`)으로 나누는 것을 권한다(backend).
2. 커서는 base64url 인코딩이라 **복호화 가능**(비밀이 아니다). 1회차 지적의 수준(관리자에게 id 하나)에는 충분하다고 판단해 통과로 둔다. 진짜 비노출이 필요하면 HMAC/서버 저장 커서.
3. 정리 대상이 `foreign_state='DELETED'` 행까지 넓어졌다(`Repository.cleanupExpired`) — 참고 사본 90일 보관과 일치. 삭제 사실은 `worklog_history`(CONTROL/DELETED)에 남는다.

## 실행 결과 (회차 2)

| 명령 | 결과 |
|---|---|
| `npm run merge` | 통과 |
| `npx jest --runInBand` (= `npm test`) | 통과 — **135 suites / 2069 tests** |
| `npm run test:ui -- --runInBand` | 통과 — **59 suites / 525 tests** |
| `npm run build:ui` | 통과 — "The build folder is ready to be deployed"(기존 Atlaskit 경고만) |
| `npx forge lint` | 통과 — No issues found |

---

# 검증 리포트 (회차 3) — 승인 앱 BE 4회차·FE 5회차 + 워크포스 WF-7~13 (두 리포)

> 대상: 승인 앱 `IssueSignalRefresher`·`refreshWorkforceCapabilities`·서명 NONE 수신, `CapabilityRefresh`; 워크포스 `C:\CloudJira\moves-workforce`(RFC-220, HEAD 4788a77 + 미커밋) `05_workforce_report.md` 1·2회차.
> 범위 구분: 승인 앱 트리의 audit-retention-sync(보관·통제 이력 `WorklogControlJournal`/`LogRepository`·v060·`RecordRetention*`·`WorkforceCertWake`)와 `docs/*-DESIGN.md` 신규 3개는 **이번 판정 밖**(실행 결과에는 포함). 워크포스의 ProjectDeletion·`period.js`/`catalog.js` 삭제 중 WF 와 무관한 부분도 판정 밖. 수정·커밋 없음.

## 요약  통과 21 / 실패 4 / 미검증 10

## 실패

### R3-F1 [P1] 워크포스 협업 집계가 **남의** 통제 숨김 기록을 설명(comment)까지 참여자에게 내준다 — Q127 범위·조건 ⑤ 초과 (담당: workforce + 리더/사용자 결정)
- `moves-workforce/src/api/jira/worklog/CollabWorklogFetcher.js` `accept`: 제한된 기록도 `isApprovalHidden` 이면 통과 → `map` = `src/resolver/projectCollab/CollabDto.js:110-118` `toCollabWorklog` 가 **`comment` 포함**. 대시보드·캘린더·이슈 드로어로 작성자가 아닌 참여자에게 나간다.
- 승인 앱 CLAUDE.md 불변식 8 예외 ⑤ "설명은 작성자 본인에게만, 팀장에게는 시간·일자·이슈만"과 Q127 답("내가 쓴 나의 워크로그를 볼 수 있게")은 **본인(+팀장 인증 경로)** 만이다. `05_workforce_report.md` §3 표의 ⑤ 칸("공개 기록과 같은 DTO")은 사실과 다르다 — 그 DTO 에 설명이 있다.
- "원래 공개였던 기록이라 숫자 보존"이라는 근거는 이해되지만 승인된 예외 밖이다.
- 고치는 방법: (1) 최소 — 협업 경로에서 `isApprovalHidden` 으로 통과한 기록은 `comment` 를 지운 축소 DTO(작성자 = 조회자일 때만 설명)로 싣는다. (2) 남의 숨김 기록을 협업 화면(개별 행)에 싣는 것 자체는 리더가 사용자에게 Q127 확장으로 확인받는다. 확인 전에는 집계 숫자(히트맵 합계)만 포함하고 개별 행에는 넣지 않는 안을 권한다.

### R3-F2 [P2] 서명 안 된 엔티티 프로퍼티(`movesRmsLink.linked`)만 보고 서명된 연동 신호를 발급한다 (담당: workforce)
- `moves-workforce/src/resolver/approvalLink/IssueWorklogControlService.js` `touchSignal`(:139 부근) — `issue.properties.movesRmsLink.linked === true` 이면 패널 열람(`getIssueWorklogControl`, :159)·작성(`createIssueWorklog`, :261) 때 asApp 으로 `movesRms.policy` I: 신호를 **서명해 PUT** 한다. 워크포스 DB 와 대조하지 않는다.
- 이슈 편집 권한자는 누구나 `movesRmsLink` 를 쓸 수 있다(승인 앱 불변식 9 와 같은 위협). 쓴 뒤 패널을 한 번 열면 승인 앱이 그 이슈를 **서명 검증된 연동 이슈**로 판정한다 → 승인 앱 작성 창구가 워크포스로 바뀌고, 기간 창·다른 경로 FLAG 범위·(LINKED_ALL 이면) **그 이슈의 모든 워크로그 visibility 제한**이 걸린다. 서명이 위조된 프로퍼티를 정당한 것처럼 바꾼다.
- 고치는 방법: 서명 직전에 워크포스 DB(구독·프로젝트-이슈 연결)로 그 이슈가 실제 워크포스 프로젝트 소속인지 확인하고, 아니면 서명하지 않는다(표식은 표시용으로만). 관리자 일괄 게시의 JQL(`moves_RMS_projectId is not EMPTY`)도 같은 DB 대조를 거친다.

### R3-F3 [P2] 신호가 바뀌지 않은 이슈는 1시간 신선도가 동작하지 않는다 — 매 열람·이벤트마다 Jira 1 + SQL (담당: approval-backend)
- `IssueSignalRefresher.js:43-44` 은 `stored.checkedAt` 이 1시간 안이면 건너뛴다. 그런데 `WorklogPolicyAuthority.js` `refreshOne` 은 `code==='UNCHANGED'`(같은 rev·같은 본문 — 안정된 연동 이슈의 평상시)이면 **행을 갱신하지 않고 return** 한다 → `checked_at` 이 첫 수신 시각에 멈춘다. 첫 1시간 뒤로는 그 이슈의 작업 로그 탭 열람·편집·쓰기·워크로그 이벤트마다 `findInbound` + Jira GET + 검증 + `findInbound` 가 다시 돈다. 보고서의 "1시간 안이면 Jira 0, SQL 2"는 신호가 **없거나 바뀌는** 이슈에만 맞다(그 경로는 `updateInbound` 가 `checked_at` 을 갱신).
- 테스트(`IssueSignalRefresher.test.js:70-79`)는 `checkedAt` 을 직접 주입해 이 상호작용을 보지 못한다.
- 고치는 방법: `UNCHANGED` 일 때 `checked_at` 만 갱신하는 조건부 UPDATE(`… SET checked_at=?, rev=rev+1 WHERE typ=? AND entity_id=? AND rev=?`)를 두거나, refresher 가 "마지막 확인" 을 별도로 기록한다. 테스트: 실제 `refreshOne` 대역으로 UNCHANGED 뒤 두 번째 호출이 FRESH 인지.

### R3-F4 [문서] 승인 앱 AGENTS.md asApp 5번에 새 asApp 용도가 없다 (담당: 리더)
- 워크로그 이벤트 경로에서 이슈 프로퍼티 `movesRms.policy` 를 asApp 으로 읽는다(`WorklogControlGateway.signalRequest`, 사유 `worklog-control-trigger` → `WorklogPolicyAuthority.refreshOne`). AGENTS.md 5번은 trigger 사유를 "이슈→프로젝트 조회(bulkfetch)"로만 적고 있다. 규칙("늘릴 때는 사유를 여기 적는다")대로 한 줄 추가: "트리거 경로의 이슈 연동 신호(`movesRms.policy`) 읽기 — 서명 검증 후 수신 캐시에만, 사용자에게 반환 없음". 같은 김에 `refreshWorkforceCapabilities`(관리자 asUser 로 남의 사용자 프로퍼티 읽기)도 "수신은 전부 asUser" 문장 옆에 적는다.

## 통과

### 승인 앱
- `refreshWorkforceCapabilities` — guardedDefine(`WorklogControlController.js:47`) + PermissionMap `{admin:true}` + 기존 registrar. 입력 검증(배열 ≤50·형식, 프로젝트 숫자 → asUser `user/assignable/search`, `atlassian` 계정만), `STORAGE_NOT_READY`, 응답 `{checked, capable, items[{accountId,status,capable,result}], workforceOriginCapable}` ↔ `CapabilityRefresh.jsx:32-101` 소비(필드명·`UNREADABLE` 분기) 일치. 끝나면 `worklogControlKeys.all` 무효화. 판정 함수는 DELETE 관문과 같은 `workforceOriginCapable()`.
- 이슈 신호 자동 수신: 검증·반영은 기존 `refreshOne`(서명·cloud·ent 결속·rev·삭제 sticky) 그대로(불변식 9). 프로젝트 id 는 Jira 에서(asUser `loadIssue` / asApp bulkfetch) — 클라이언트 값 아님. asApp 결과는 수신 캐시에만, 응답 반환 없음(불변식 8). 워커·백필은 `refresh` 없음(유휴 경로 Jira 0).
- 서명 NONE: 새 rev → released, 옛 rev → STALE_REV, 다른 이슈로 옮긴 NONE → TARGET_MISMATCH, 삭제 → sticky — 테스트 고정 확인.
- 유휴 SQL: `idleSqlBudget.test.js` 미연동 합계 ≤27(:240), 워크포스 작업 ≤13(:135) 유지. 새 scheduledTrigger·consumer 없음.
- 프론트: `CapabilityRefresh` i18n kr/en 존재, merge 통과, 쿼리키 팩토리.

### 워크포스
- 계약 사본 7개 LF sha256 양쪽 동일: base64url `c6828cb1`, canonical `3ed7940b`, contract `529f1194`, ed25519 `bdb61df9`, keyring `bc68218c`, signature `97827437`, **vectors.json `6201e626` 바이트 동일**(`cmp`).
- WF-12 생산자↔소비자: 속성 키 `movesRms.origin` 양쪽 같음(승인 앱 `origin.js:17` `WORKFORCE_ORIGIN_PROPERTY`). 바이트 사슬 — 워크포스 `vectors.test.js` 가 `buildWloriginEnvelope` 재서명 = 벡터, 승인 앱 `signature.test.js:104-` 가 같은 벡터를 `workforceOriginMessage` 바이트 일치 + `verifyWorkforceOrigin` `{ok, valuesMatch}` 통과. policy 봉투 2건도 같은 방식. 봉투 body 값 출처: cloudId = context, authorId = context.accountId, issueId = Jira 응답 id, op = 서버 UUID, 응답에 봉투·op 없음.
- WF-7 이슈 탭(`getIssueWorklogControl`, SELF): ① context.accountId(없으면 거부) ③ asApp 전 asUser 이슈 GET(403/404 → asApp 0) ② 응답 author·issueId·id 재대조 ④ 서명 검증 ctl + `isControlledVisibility` ⑤ 본인 것만이라 설명도 본인 것 ⑥ 남의 수·존재 없음. (② 의 "SQL 선제한"은 워크포스에 통제 DB 가 없어 asApp 목록을 메모리에서 거른다 — DB 무증가 결정의 귀결, 반환 범위는 지켜진다.)
- WF-7 원가 보충: 서명 인증 문서 id → asApp `worklog/list` → 문서 작성자 = 응답 author, 조회자 asUser 프로젝트 이슈 목록 안, 통제분만, 집계만 반환.
- WF-8: 워크포스 asApp **워크로그** 쓰기 없음(asApp 은 조회·프로퍼티 PUT 뿐). 연동 이슈 본인 행은 넘김 버튼, 드래그는 revert.
- WF-9: 서명 NONE 해제(cloudId 출처 순서, 실패 시만 DELETE 후퇴 + 경고), 큐 본문에 installContext 안 실음.
- WF-13 진단 ↔ 승인 앱 관문: 매핑 대상 G_ORIGIN·G_LINK·G_WF·G_HANDOFF·G_FIELD 모두 승인 앱 `GATES` 에 있고 수동 기록 가능 모드(MANUAL/BOTH)다.
- 등록: 신규 resolver 4개 guardedDefine + PermissionMap(:421-424) + `registerApprovalLinkController`(index.js:95).
- DB 무증가: 새 테이블·ALTER·KVS 키 없음. SQL 변경은 조회 1개(`FIND_SPACE_SOURCES`)뿐. 캐시는 인스턴스 메모리.

## 미검증
| 항목 | 이유 / 확인 방법 |
|---|---|
| asApp 이 이슈 프로퍼티 `movesRms.policy` 를 읽는가(트리거 자동 수신) | 실측 — 연동 이슈 워크로그 작성 후 `workforce_inbound` I: 행 |
| 관리자 asUser 로 남의 사용자 프로퍼티 GET | 실측 — `refreshWorkforceCapabilities` 의 UNREADABLE 비율 |
| `user/assignable/search?project=` 가 숫자 id 를 받는가 | 실측 — 프로젝트 모드 checked=0 여부 |
| 워크포스 큐 컨슈머 context 의 installContext·`getAppContext().installation` | 배포 후 진단 `CLOUD_ID_SOURCE` |
| 워크포스 앱 계정이 승인 앱 통제 visibility(앱 역할) 기록을 읽는가(G_WF) | 진단 `APP_READ_HIDDEN` |
| asUser 본인 `movesRms.org` PUT 허용 | 진단 `ORG_CAP` |
| `router.navigate` 로 다른 앱 전역 페이지 하위 경로 이동(G_HANDOFF) | 두 앱 설치 화면 |
| Jira 가 started 를 정규화할 때 `valuesMatch`(정상 출처라 FLAG 는 아님, `WF_CHANGED` 로 기록) | G_ORIGIN 실측 |
| 운영 키링이 비어 있음 — 키 등록 전 WF-7~13 휴면 | 키 등록 시 진단 |
| 자동 수신이 남기는 `workforce_inbound` NONE 행(열람 이슈 수만큼) 보관 정리 없음 | 설계 결정 필요(백엔드 §11-5) |

## 실행 결과 (회차 3)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` | 통과 |
| 승인 앱 | `npx jest --runInBand` | 통과 — 143 suites / 2215 tests (audit-retention-sync 포함 트리) |
| 승인 앱 | `npm run test:ui -- --runInBand` | 통과 — 60 suites / 553 tests |
| 승인 앱 | `npm run build:ui` | 통과 — ready to be deployed(기존 source map 경고) |
| 승인 앱 | `npx forge lint` | 통과 — No issues found |
| 워크포스 | `npx jest --runInBand` | 통과 — 160 suites / 2193 tests |
| 워크포스 | `static/ui: npx jest` | 통과 — 163 suites / 2622 tests |
| 워크포스 | `static/ui: npm run build`(merge·app·panel·예산) | 통과 — main gzip 492,471/950,000, panel 330,552/350,000 |
| 워크포스 | `npx forge lint` | 통과 — No issues found |
| 두 리포 | 계약 7파일 LF sha256 | 7/7 동일 |

---

# 검증 리포트 (회차 4) — 3회차 실패 4건 재검증 (두 리포)

> 입력: `02_backend_report.md` 5회차, `05_workforce_report.md` §13~16, 리더 문서(AGENTS 양쪽). 보고서 주장은 코드·실행으로 다시 확인했다. 범위 구분은 회차 3과 같다. 수정·커밋 없음.

## 요약  통과(3회차 실패 4건 전부 해소) / 실패 0 / 미검증 회차 3 표 + 아래 2건

## 실패

없음.

## 3회차 실패 재검증

| # | 지적 | 확인(파일:라인) | 판정 |
|---|---|---|---|
| R3-F1 [P1] | 협업 화면이 남의 숨김 기록·설명을 냄 | `moves-workforce/src/api/jira/worklog/CollabWorklogFetcher.js:44-52` `collabControlOf(cloudId,{viewerId,aggregateOnly})` — 행 경로는 `author.accountId === viewerId` 일 때만, viewerId 없으면 0(fail-close). 호출처: 캘린더 `CollabCalendarService.js:45`·드로어 `CollabIssueWorklogService.js:26` 가 `principal.accountId` 전달, 집계 `getProjectWorklogsAsApp`(:169)만 `aggregateOnly` 이고 그 호출처는 히트맵·lineStack 2곳(:252,:260) — 결과는 `aggregateByDate`/`aggregateByUserDate` 행(날짜·사람별 초)뿐, `map` 에 comment 없음, `Collab:` 캐시도 집계만. 신규 테스트 `CollabApprovalHiddenRows.test.js`(드로어 total 에서도 남의 숨김 제외). 워크포스 AGENTS ⑧ "집계 포함" 문단 정정 | 해소 |
| R3-F2 [P2] | 위조 가능한 표식으로 서명 | `IssueMembership.js` — 워크포스 DB 활성 프로젝트 + 앱 자격 JQL `moves_RMS_projectId = "{projectId}"` 둘 다(실패·형식 오류 false, SQL·Jira 0). `ensureIssueLinked({verifyMember})` 는 서명이 필요할 때만 확인, 소속 아님이면 미서명/걸린 신호는 서명 NONE. **앱 필드 쓰기 근거**: manifest `jira:customField` `projectIdField` `readOnly: true`(:50-55) + `AppFieldValueApi.js:1-8`(RFC-171 운영 기록 — 일반 이슈 PUT 은 "Field does not support update", 쓰기는 앱 전용 `PUT /rest/api/3/app/field/{id}/value` asApp 뿐). 일반 사용자·REST 토큰으로는 값을 못 쓴다 | 해소(아래 미검증 1) |
| R3-F3 [P2] | UNCHANGED 시 `checked_at` 정지 | `WorklogPolicyAuthority.js:23` UNCHANGED → `touchInbound(…, stored.rev, now)`; `WorkforceLinkRepository.js:425-431` `SET checked_at=?, rev = rev + 1 WHERE … AND rev = ?`(불변식 4). `IssueSignalRefresher.test` 가 실제 `refreshOne` 과 엮어 UPDATED → UNCHANGED(touch) → 10분 뒤 FRESH(Jira 호출 수 불변) 고정. 유휴 경로 무관(`idleSqlBudget` 통과) | 해소 |
| R3-F4 [문서] | AGENTS asApp 5번 누락 | 승인 앱 `AGENTS.md:43`(연동 신호 읽기 — 화면 asUser·이벤트만 asApp, 서명 검증 후 반영, 1시간), `:44`(능력 신호 다시 읽기 — 관리자 asUser, ≤50, UNREADABLE). 워크포스 `AGENTS.md` ⑧ 게시 항목에 `IssueMembership` 서명 전 소속 확인 | 해소 |

## 미검증·관찰 (실패 아님)
1. **소속 판정 JQL 이 필드 표시 이름**(`moves_RMS_projectId`)을 쓴다(`IssueApi.js:565`). 같은 이름의 필드가 따로 생기면(Jira 관리자, 또는 team-managed 프로젝트 관리자의 프로젝트 전용 필드) 이름이 겹친다. Jira 가 겹친 이름을 어떻게 풀지는 미검증이다. 그런 필드를 만들 수 있는 사람만 할 수 있는 공격이라 위험은 낮다. 권고: `FieldApi` 가 이미 해석하는 `cf[id]` 로 바꾼다(workforce, P3).
2. **남의 숨김 기록을 lineStack 의 사람별·일별 합계에 넣는 것**은 코디네이터 결정대로 구현됐다. 다만 한 사람·하루짜리 합계는 사실상 그 사람의 기록 시간이다(codex 3번 지적과 같은 성격). Q127 의 사용자 답은 "내 워크로그"까지이므로, 이 집계 포함은 `QUESTIONS.md` 에 결정으로 남겨 사용자 확인을 받기를 권한다(리더).
3. 회차 3 미검증 표(신호 asApp 읽기, 남의 사용자 프로퍼티 읽기, installContext, G_WF/G_HANDOFF/G_ORIGIN 실측, 키링, NONE 행 보관)는 그대로다.

## 실행 결과 (회차 4)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` | 통과 |
| 승인 앱 | `npx jest --runInBand` | 통과 — 143 suites / 2218 tests |
| 승인 앱 | `npm run test:ui -- --runInBand` | 통과 — 60 suites / 553 tests |
| 승인 앱 | `npm run build:ui` | 통과 |
| 승인 앱 | `npx forge lint` | 통과 — No issues found |
| 워크포스 | `npx jest --runInBand` | 통과 — 162 suites / 2211 tests |
| 워크포스 | `static/ui: npx jest` | 통과 — 163 suites / 2622 tests (보고서의 `kanbanPagination` 간헐 실패는 이번 실행에서 재현 안 됨) |
| 워크포스 | `static/ui: npm run build` | 통과 — main gzip 492,471/950,000, panel 330,552/350,000 |
| 워크포스 | `npx forge lint` | 통과 — No issues found |
| 두 리포 | 계약 7파일 LF sha256 | 7/7 동일(base64url c6828cb1·canonical 3ed7940b·contract 529f1194·ed25519 bdb61df9·keyring bc68218c·signature 97827437·vectors.json 6201e626) |

## 결론

**worklog-control 통합 검증 통과.** 1~3회차에서 나온 실패(코드 13건, 문서 3건)가 모두 해소됐고 남은 실패는 없다. 두 리포의 실행 9종과 계약 대조가 전부 통과했다.
보안 핵심은 회차 1~4에서 코드로 확인했다:
- 쓰기 검사 순서와 작성자 판정(Jira 응답 author 기준)
- 남의 숨김 기록 존재 비노출
- Phase D 서버 차단
- 라이선스 예외 2개(admin 축과 함께만)
- 불변식 8 예외 6조건 — 워크포스 행 경로는 본인만, 남의 숨김분은 집계 숫자만
- 불변식 9 — 서명 검증만, 서명 전 소속 확인
- 유휴 SQL — 승인 앱 27·38 유지
- 워크포스 DB 무증가

배포 전 남은 일은 미검증 표의 플랫폼 실측(관문 진단·키 등록)과, 위 관찰 2의 사용자 확인이다.
