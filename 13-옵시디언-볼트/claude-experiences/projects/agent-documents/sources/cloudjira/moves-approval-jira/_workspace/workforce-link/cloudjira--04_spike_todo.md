# workforce-link 플랫폼 실측 목록 (미검증)

> 작성: backend-engineer · 2026-10-03 (Phase 3). 설계서 §10 의 W1~W16 + 구현 중 생긴 W17~W21. 배포 회차에 리더가 확인하고 `결과` 칸을 채운다.
> 확인 원칙(AGENTS.md): iframe 클릭은 자동화에서 신뢰할 수 없다 — 결과는 resolver 반환값(`getWorkforceLinkStatus`, `getMyTimesheet.workforce`·`routing.source`)과 DB 상태로 본다. `forge logs` 는 늦다.
> 배포 전제: `forge install --upgrade`(scheduledTrigger·function 추가), SQL 테이블 추가로 `--approve MAJOR_VERSION_RULE` 가능. 환경 변수(`MOVES_LINK_SIGNING_KEY` 암호화·`MOVES_LINK_SIGNING_KID`·선택 `MOVES_LINK_TRUSTED_KIDS`)는 **사람이** 설정. 키링(`src/integration/workforce/keyring.js`)이 비어 있으면 아래 대부분이 `UNKNOWN_KID`/`inKeyring:false` 로만 보인다 → 먼저 W21.

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| W1 | Forge runtime(nodejs22.x)에서 `node:crypto` Ed25519 서명·검증, PKCS#8/SPKI DER 적재 | 연동 전체 | 설정 > 워크포스 연동(`getWorkforceLinkStatus`) `crypto.selfTest==='OK'` | `CRYPTO_UNAVAILABLE` — 게시 중지·수신 전부 단독 경로. `ed25519.js` 인터페이스로 `@noble/ed25519`(SHA-512 는 node:crypto 주입)를 끼운다(의존성은 그때 추가) | |
| W2 | 앱(asApp)이 **다른 사용자**의 사용자 프로퍼티 PUT/GET | 게시 경로 전체 | 승인 1건 후 5분 내 `publish.published≥1`. 403 이면 `publish.state:'WRITE_DENIED'`(403 5연속). Jira REST(관리자)로 그 사용자 `movesApproval.2026` GET | Q31 후퇴안(워크로그 단위 — `approval.worklog` 계약·`worklogEntryBodyOf` 는 있음, 게시 경로 신설 필요) | |
| W3 | 사용자가 asUser 로 **자기** 사용자 프로퍼티 GET(타 앱이 쓴 키 포함) | 결재선·팀장 원천 | 시험 서명 org 문서를 관리자 REST 로 써 넣고 `getMyTimesheet.routing.source==='WORKFORCE'` | 항상 명부(단독). 로그에 실패 없음(5xx/403 은 판정 불가로 캐시 유지) | |
| W4 | `GET issue/{id}/worklog?…&expand=properties` 가 **타 앱이 쓴** 워크로그 프로퍼티를 싣는가 | 워크포스 위반 | 워크로그에 서명된 `movesRms.check` 를 써 두고 `getMyTimesheet.workforce.checks`(`VERIFIED`/`PARTIAL` 기대) | `properties` 배열이 아예 안 오면 `checks:'UNAVAILABLE'`, 위반 0(CHECK_MISSING 도 없음) | |
| W5 | 엔티티 프로퍼티가 앱별로 격리되지 않고 같은 키를 두 앱이 읽고·덮을 수 있는가 | 계약 성립 | 두 앱 동시 설치 dev 사이트에서 서로의 키 GET/PUT | 격리되면 상대 게시물을 못 읽는다 → 전 기능 단독(`inbound.*.verified=0`) | |
| W6 | 프로퍼티 값 32,768자 한도·키에 `.` 허용·13자리 ms 정밀도 보존 | 문서 크기·지문 대조 | 최악 크기 문서 PUT→GET 후 일일 대조에서 `TAMPERED` 가 안 생기는지 | 한도가 작으면 `PUBLISH_TOO_LARGE` 상한(30,000) 하향, 키 분할 설계 | |
| W7 | scheduledTrigger 핸들러의 `context.cloudId` / `installContext` | 게시 | 배포 직후 관리 화면을 열지 않은 상태에서 승인 → 5분 뒤 `cloudIdKnown`·`published` | 없으면 resolver(관리 화면·연동 수신 경로)가 학습한 KVS `approval:link:cloudId` 를 쓴다. 그것도 없으면 `CLOUD_ID_UNKNOWN` | |
| W8 | 일반 사용자가 자기 사용자 프로퍼티를 쓰고 지울 수 있는가 | 위협 모델 | 비관리자 토큰으로 `movesRms.org` PUT/DELETE | 사실이면 설계대로(서명·sticky). 아니면 위협 축소(코드 변경 없음) | |
| W9 | `forge variables --encrypt` 값이 resolver·trigger 모두에서 `process.env` 로 보이는가 | 서명 | `signing.configured===true`(관리 화면) + 5분 스윕 `published` 증가 | 트리거에서만 안 보이면 게시가 `KEY_NOT_CONFIGURED` 로 멈춘다 — 잡 `wf-publish.last_error` 확인 | |
| W10 | 프로젝트 열람 권한자(비 관리자)가 asUser 로 프로젝트 프로퍼티 GET | PM 예외 단계 | EXTRA_STEP 정책 + 위반 워크로그로 제출 → `submitTimesheet.extraStepSource==='WORKFORCE_PM'` | 실패(403)는 판정 불가 → PM 없음 → 예외 그룹(`GROUP`) | |
| W11 | 사용자 프로퍼티 쓰기·읽기에 필요한 scope(`read:jira-user`·`read/write:jira-work` 로 충분한가) | 배포·게시 | `forge lint` + W2 결과 | scope 추가(`write:jira-user` 등) + `forge install --upgrade`, manifest 주석 갱신 | |
| W12 | 앱 제거 시 그 앱이 쓴 엔티티 프로퍼티가 남는가 | 워크포스 제거 사이트의 stale org(Q41) | 제거 후 GET | 남으면 관리자가 연동을 끈다(문서화) | |
| W13 | 5분 tick 당 PUT 60·연속 수백 PUT 의 rate limit | 마감 펼침 속도 | 200명 펼침 후 429 여부·`publish.failed` | 429 는 `PUBLISH_FAILED` 백오프. 필요 시 `MAX_REQUESTS` 하향 | |
| W14 | 사용자 프로퍼티 GET 응답이 저장 JSON 을 의미 보존(키 순서 무관) | 일일 대조 오탐 | W6 과 함께 — 대조 후 `recentFailures` 에 `TAMPERED` 없음 | 오탐이면 매일 재게시만 늘어난다(정합 문제 없음). 비교를 정규화 전 값 대신 서명 항목 단위로 바꾼다 | |
| W15 | 가시성 제한 워크로그의 asUser(대상자)·asApp(워크포스) 차이 | ts1 재계산 불일치(과소 승인) | 가시성 제한 워크로그를 넣고 워크포스 재계산과 `h` 비교 | 수용(안전한 방향). 문서화 | |
| W16 | `InvocationScope` 호출 주체 전달(AsyncLocalStorage) | selfRead 판정 | 워크포스 팀장 첫 진입 시 매트릭스 행이 바로 보이는지 | 없으면 캐시만 → 본인 org 갱신이 안 돼 워크포스 원천이 늦게(또는 영영) 반영. 대안: 서비스에서 principal 을 직접 넘긴다 | |
| W17 | Forge SQL 에서 `information_schema.columns` 조회(`isColumnReady`) | v024·v025 컬럼 사용 | 제출 후 `getTimesheetDetail.routingSource` 가 null 이 아닌지 | 조회 불가면 컬럼이 있어도 판정 기록을 안 쓴다(제출은 정상, routingSource null). 대안: `SELECT routing_source … LIMIT 0` 프로브 | |
| W18 | 스케줄 트리거 핸들러 인자 형태 — `(event, context)` 인지, cloudId 가 `event.context` 에 오는지 | W7 의 전제 | `runWorkforcePublish` 에 키 이름만 남기는 로그를 스파이크 빌드에 1회 추가(값은 남기지 않는다) | 둘 다 없으면 W7 대안(KVS) | |
| W19 | 사용자 프로퍼티 GET 응답이 `{ key, value }` 인가, PUT 성공 상태(200/201), 404 본문 | 수신·대조 | REST 로 직접 확인 | 형태가 다르면 `WorkforcePropertyGateway.valueOfResponse` 수정 | |
| W20 | TiDB 에서 `ORDER BY verified_at IS NULL DESC, verified_at`(일일 대조), `period_key LIKE 'YYYY%'` 가 `ix_request_subject` 를 타는가, 다중 VALUES upsert 100행 | 대조·문서 재구성·touch 성능 | `EXPLAIN`(스파이크) 또는 5,000 사용자 펼침 tick 시간 | 느리면 대조는 `verified_at` 에 COALESCE 상수, LIKE 는 범위(`>= 'YYYY' AND < 'YYYY+1'`)로 | |
| W21 | 키 없는 초기 상태 → dev 키 등록 절차 | 연동 시험 자체 | `node scripts/workforce-link/gen-key.mjs ap-dev-1`(승인 앱)·`wf-dev-1`(워크포스) → 두 공개키를 `keyring.js` 에 `env:'dev'` 로 → 배포 → `forge variables set --encrypt` → 관리 화면 `signing.inKeyring===true`·`trustedPeerKids` 에 `wf-dev-1`(`MOVES_LINK_TRUSTED_KIDS=wf-dev-1`) | 키링 비면 모든 수신 `UNKNOWN_KID`, 게시는 되지만 워크포스가 검증 못 함(`inKeyring:false`) | |

### 프론트(Phase 4) 추가 — W22~W26

> 작성: frontend-engineer · 2026-10-03. 화면은 iframe 클릭 자동화를 신뢰할 수 없으니 결과는 resolver 응답과 화면 스크린샷으로 본다.

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| W22 | 설정 > **워크포스 연동** 탭이 `jira:adminPage`(셸 nav)와 업무함 설정 패널(Tabs) 두 곳에 모두 뜨고, 비관리자에게는 `getWorkforceLinkStatus` 가 `PERMISSION_DENIED` 로 막히는가 | 관리 화면 진입 | 관리자/비관리자 각각으로 탭 열기 → 관리자는 상태 카드, 비관리자는 `error.PERMISSION_DENIED` 문구 | 탭이 안 보이면 `SettingsPage.jsx` FEATURES·nav 확인. 엔트리 추가 없음(3곳 변경 없음) | |
| W23 | 최근 실패 표의 accountId(`rms.org`·`approval.timesheet`) 이름 해석 — `resolveUsers`(SELF, ≤100) 가 관리자 iframe 에서 타 사용자 이름·아바타를 주는가 | 표 가독성 | `recentFailures` 에 org 실패가 있는 상태에서 화면 확인 | 이름을 못 받으면 accountId 원문 + 이니셜 아바타(동작은 정상) | |
| W24 | 실제 워크포스 org 게시물의 팀 이름이 빈 문자열(`displayName=''`)로 오는 경우 — 매트릭스 팀 선택기·내 타임시트 결재 문구 | 표시 | W3 시험 서명 org 문서에 `teamName` 없이 넣고 매트릭스·내 타임시트 확인 | 화면은 "워크포스 팀" 으로 대신 표시(테스트 단언) — 이름이 늘 비면 백엔드에 팀 이름 전달 요청 | |
| W25 | 제출 후 상세(`getTimesheetDetail.routingSource`·`extraStepSource`)가 실제로 채워져 원천 배지·PM 안내가 보이는가 (W17 의 화면 쪽 확인) | 상세 표시 | 워크포스 결재선으로 제출 → 모달 상세 스냅샷에 "워크포스 팀" 배지 | null 이면 배지·안내가 조용히 빠진다(오류 없음). W17 대안 적용 후 재확인 | |
| W26 | `getWorkforceLinkStatus` 응답 시간 — 탭을 열 때마다 SQL 카운트·연동 로그 20행 조회. 200명·180일 로그에서 체감 지연 | 관리 화면 UX | 운영 크기 데이터에서 탭 진입 시간 측정(브라우저 Network) | 느리면 프론트 `staleTime` 을 두거나 백엔드에 카운트 캐시 요청 | |

### 검증(Phase 5) 추가 — W27~W28

> 작성: integration-verifier · 2026-10-03.

| # | 항목 | 영향 | 확인 방법 | 실패 시 동작 / 대안 | 결과 |
|---|---|---|---|---|---|
| W27 | 변경 스캔 상한 `SCAN_SETTLE_MS`(3분)가 `approval_request.updated_at` 을 쓰는 가장 긴 호출(resolver 25초·스케줄 트리거 `runSweep`/`runTimesheetSweep` 실행 시간)보다 긴가 | 엔진 경로(단건 결정·반려·회수·만료) 결과의 게시 누락 | 운영 크기에서 스윕 실행 시간(`[WF][publish]`·`[TRIGGER][sweep]` 로그 시각 차) 측정. 단건 승인 후 8분 안에 `publish.published` 가 늘고 워크포스가 새 상태를 읽는지 | 실행 시간이 3분에 가까우면 상한을 늘린다(게시 지연만 늘고 정합은 유지) | |
| W28 | 팀 매트릭스 URL 파라미터 `team=wf:<키>` 가 Jira 전역 페이지·adminPage iframe 라우터에서 그대로 왕복하는가(콜론 인코딩) | 워크포스 팀 선택 | 워크포스 팀장으로 팀 선택기에서 워크포스 팀 선택 → 새로고침 후에도 같은 팀이 선택돼 있는지, `getTeamTimesheetMatrix` payload `teamKey` 가 `wf:` 로 가는지 | 콜론이 깨지면 URL 에는 인코딩 값을 쓰고 parse 에서 decode(현재 `URLSearchParams` 가 처리) | |
