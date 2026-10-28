# 검증 리포트 (회차 1) — workforce-channel-rest

> 2026-10-19 · integration-verifier · 코드 수정 없음(보고만), 배포·커밋 없음
> 기준: `01_architect_design.md` §2(계약)·§13(불변식 개정안)·§15(백엔드 반영 결정), `SHARED_READY.md` 판 2
> 대상: 승인 앱 `C:\CloudJira\moves-approval-jira`(작업 트리, 223개 변경) · 워크포스 `C:\CloudJira\moves-workforce`(작업 트리, 100개 변경)
> 보고서의 "통과"는 전부 직접 다시 실행해 확인했다(아래 §실행 결과).

## 요약

| 구분 | 수 |
|---|---|
| 통과 | 31 |
| 실패 | 10 (중 4 · 낮음 6) — 보안 차단(높음) 없음 |
| 미검증 | 9 (실측 필요) |

판정: **보안 봉투(수신 1~8단계 SQL·KVS 0, 응답 서명·nonce 결속, iat 창, cloudId·linkId 대조, 서명 없는 STALE_LINK 무시)는 두 앱 모두 설계대로이고 테스트로 고정돼 있다.** 테스트·빌드·lint 는 두 리포 모두 통과.
다만 **F1(강제 주소 바꾸기 후 승인 앱만 "연결됨"으로 남는 반쪽 연결)** 과 **F2(승인 앱이 연결 판정 실패를 `linked:false` 로 접어 보내 워크포스가 PROJECT 근거 이슈를 판정 없이 직접 쓰는 fail-open 틈)** 은 배포 전에 고치는 것을 권한다. F7(CLAUDE.md·AGENTS.md 미갱신)은 체크리스트상 출시 차단.

---

## 실패

### F1 [중] 강제 주소 바꾸기 — 두 앱 동작이 다르고, 승인 앱은 반쪽 연결을 "연결됨"으로 보인다 (담당: 승인 앱 BE + 승인 앱 FE)
- 승인 앱 `src/resolver/channel/PairingService.js:189-206` `rotate({force:true})`: 상대 확인 실패여도 옛 URL 을 `deleteUrl` 하고 **상태는 PAIRED 그대로**.
- 워크포스 `src/resolver/approvalChannel/PairingService.js:163-166`: 같은 경우 `state.revoke('ROTATED_WITHOUT_PEER')` — 자기를 REVOKED 로.
- 재현(논리): 승인 앱 관리자가 워크포스 무응답 중 "워크포스 확인 없이 바꾸기" → 워크포스는 아직 옛(삭제된) 승인 앱 URL 을 가짐 → 워크포스→승인 앱 호출(`write.judge`·`cert.query`·`issue.control`)은 전부 404(서명 없음) → 워크포스 연동 이슈 쓰기 전부 DEFER/BLOCKED, 원가 인증 반영 중지. 반면 승인 앱→워크포스 방향은 그대로 동작하므로 승인 앱 화면은 "연결됨", **[연결 확인](ping)도 성공** → 문구 `locales/kr/workforce.json:65` "연결 확인이 실패하면 다시 연결하세요"의 조건이 영영 오지 않는다. 운영자가 원인을 찾을 단서가 없다.
- 보안 판정: fail-close 라 데이터 유출·통제 우회는 없다. **일관성·운영 문제**.
- 고치는 법: 승인 앱도 force + 미확인이면 `markRevoked({reason:'ROTATED_WITHOUT_PEER'})`(워크포스와 같은 규칙, 설계 §2.2 "강제 폐기 → 상대는 재페어링 필요") + `rotatedUnconfirmed` 문구를 워크포스(`setting.json:135`)처럼 "연결이 끊어졌다, 연결 코드로 다시 연결"로. 덧붙여 비강제 시도가 실패할 때마다 `getUrl(key,true)` 로 만든 새 URL 이 지워지지 않고 남는다(두 앱 공통 — 다음 시도의 `oldUrl` 이 그 URL 이 되면 최초 URL 이 살아남을 수 있음, S18 과 함께 실측).

### F2 [중] `issue.control` 이 승인 앱 쪽 "연결 확인 불가"를 `linked:false` 로 접는다 → PROJECT 근거 이슈 fail-open (담당: 승인 앱 BE + 워크포스 BE, 공유 `ops.js` 판 3)
- 승인 앱 `src/resolver/workforce/LinkedIssueSettingSource.js:240` 은 실패 시 `{linked:false, unavailable:true}` 를 만들지만, `src/resolver/channel/handlers/issueControl.js:57,62-72` 는 `link.linked === true` 만 보고 `unavailable` 을 버린다 → 응답 행 `linked:false, controlled:false(LINKED_ALL 일 때), channel:'HANDOFF'`.
- 워크포스 `src/resolver/approvalLink/ApprovalControlLookup.js:64` `rowToLink` 는 이를 `ABSENT`(비연동)로 읽고, `writeChannelOf` 는 `target`(워크포스 자체 소속 판정)에 맡긴다. `IssueWorklogControlService.js:102-117` `creationTarget` 은 **앱 필드(`moves_RMS_projectId`)만** 보므로, `link.resolve` 가 `basis:'PROJECT'`(무필터 SPACE 구독, 판 2 ⑤)로 연결이라 답하는 이슈는 `target=false` → `DIRECT` → `IssueWorklogControlService.js:279` `if (link.linked)` 가 거짓이라 **`write.judge` 없이 Jira 에 바로 쓴다**.
- 같은 결과가 오류 없이도 난다: 워크포스 `ProjectSubscriptionService`(구독 생성·변경)는 `notifyLinkChanged` 를 부르지 않는다(`ProjectLinkWriter`·`ProjectDeletionWorker` 만 부름) → 승인 앱 `link` 캐시(FRESH 1시간)가 새 무필터 구독 프로젝트 이슈를 최대 1시간 `linked:false` 로 답한다.
- 재현(논리): 무필터 SPACE 구독 프로젝트의 새 이슈(앱 필드 백필 전) + 승인 앱의 중첩 `link.resolve` 실패/지연(S16) 또는 캐시 미갱신 → 워크포스 이슈 탭 작성 → 판정 없이 저장. 승인 앱 감지기는 출처 NONE(외부 입력)으로 처리하므로 "조용한" 우회는 아니지만, 설계 §15.2 W5 가 막으려던 통제 구멍이 다시 열린다.
- 고치는 법: (1) `ops.js` 판 3 — `issue.control` 행에 선택 칸 `linkUnknown: true`(또는 `permission` 처럼 `link:'UNVERIFIED'`) 추가, 승인 앱은 `link.unavailable` 이면 싣는다. 워크포스 `rowToLink` 는 그 칸이 있으면 `UNVERIFIED`(→ BLOCKED). (2) 워크포스 `creationTarget` 도 `linkResolve.js` 의 `isWholeProjectSubscription` 규칙으로 PROJECT 근거를 소속으로 본다. (3) 구독 생성·변경·삭제 뒤 `notifyLinkChanged`(또는 `change.notify{LINK, all}`).

### F3 [중] 이관 순서 — 옛 `movesApproval.ctl` 정리가 설계가 가정한 "배포 직후 몇 분~수 시간"보다 훨씬 늦다 (담당: 승인 앱 BE)
- `src/resolver/channel/PropertyCleanup.js:17` 회당 Jira 60건 + 재큐 최대 3회 = **하루 최대 약 240건**, 그리고 첫 실행은 다음 일일 스윕(배포 후 최대 24시간). ctl·flows 를 먼저 지우는 정렬(`WorkforceLinkRepository.js:232-238`)은 맞다.
- 영향: 워크포스가 major 동의 전 구판에 머무는 구간(S13)에서, 구판은 남은 `ctl.wr`(exp ≤ 7일)로 연동 이슈 직접 쓰기를 계속 허용한다. ctl 이 수백 건이면 정리가 그 창을 줄이지 못하고 사실상 `wr` 만료(7일)가 상한이 된다. 설계 §12 주의 문단의 가정과 다르다.
- 고치는 법(택1): ctl·flows 단계만 예산을 키우고(예: 회당 300, 재큐 허용) 배포 후 첫 관리자 화면 진입 때 정리 작업을 큐에 한 번 넣기 / 또는 설계 §12 문구를 "최대 7일(wr 만료)"로 고치고 사용자 확인. 덧붙여 `purgeLegacyInbound` 는 1회 LIMIT 1000 이라(`WorkforceLinkRepository.js:219-224`), 옛 수신 행이 1,000 초과이고 아웃박스가 비면 완료 표식 뒤 잔여가 남는다(읽지 않아 무해 — 낮음).

### F4 [중] 문서 미갱신 — 불변식 8·9 개정안과 asApp 허용 목록 (담당: 리더/docs, 두 리포)
- 승인 앱 `CLAUDE.md` 불변식 8·9·확정 결정 표 "워크포스 연동 | Jira 엔티티 프로퍼티 + 서명" 그대로. `AGENTS.md:35`(WorkforcePublisher 게이트웨이), `AGENTS.md:62`(`worklog-approval-author-org` 예외)가 삭제된 경로를 허용 목록으로 기술하고, 새 사유 `channel-actor-verify`·`channel-actor-permission`·`channel-write-judge`·`channel-cleanup` 은 목록에 없다.
- 워크포스 `AGENTS.md:58,60` 이 `wr`·`movesRms.*` 게시 기준.
- 코드는 §13 개정안대로 동작한다(아래 통과 표) — 규칙 문서만 뒤처져 있다. 점검표 "asApp 사용처가 AGENTS 허용 목록 안"을 문서상 만족하지 못하므로 출시 전 필수(설계 §14 docs).

### F5 [낮음] 워크포스 수신 순서 — 서명된 OP_UNKNOWN 을 재전송·페어링 확인보다 먼저 준다 (담당: 워크포스 BE)
- 워크포스 `ChannelServer.js:114-117` 은 `verifyRequest` 가 OP_UNKNOWN 이면 곧바로 서명 응답. 승인 앱 `ChannelServer.js:131-148` 은 nonce LRU → 페어링(linkId) 확인 뒤에야 서명 OP_UNKNOWN.
- 영향: 승인 앱 계열 키로 서명됐지만 이 설치와 페어링되지 않은(다른 linkId) 요청에도 워크포스가 서명 응답을 내준다(재전송도 무제한). 데이터 노출은 없음(작업 목록 협상용 코드 하나).
- 고치는 법: 워크포스도 `replayed` → 9단계 → OP_UNKNOWN 순으로(승인 앱과 동일).

### F6 [낮음] 워크포스 수신에 연동 스위치(LINK_DISABLED)·행위자 속도 상한(RATE_LIMITED) 없음 (담당: 워크포스 BE)
- 설계 §2.3 공통 코드 `LINK_DISABLED`, §2.6 M7 "actor 당 분당 120". 승인 앱은 `ChannelServer.js:151`(스위치)·`:156`(속도) 구현. 워크포스 `ChannelServer.js` 에는 둘 다 없다 — 워크포스 관리자가 `approvalLinkMode` 를 OFF 로 해도 페어링만 돼 있으면 `org.get`·`link.resolve` 를 계속 답하고, 승인 앱은 그 팀 구조로 결재선을 정한다.
- 고치는 법: 연결 관리 4작업 외에는 `approvalLinkMode !== 'ON'` 이면 서명 `LINK_DISABLED`, 인스턴스 actor 당 분당 120 소프트 상한.

### F7 [낮음] 공유 `ops.js` — `actorViolation` 의 `subject` 검사가 예외를 삼키지 않는다 + 승인 앱 송신 전 스키마 검사 없음 (담당: 승인 앱 BE — 공유 원본)
- `src/integration/channel/ops.js:469` `spec.subject(data, actor.subject)` 를 `run()` 없이 호출. 서버는 `actorViolation` 을 `validateRequestData` 보다 먼저 부르므로(두 앱 같음) SYSTEM `org.get`/`link.resolve` 에 `accountIds`/`issueIds` 가 빠진 요청이면 TypeError → 워크포스는 서명 `INTERNAL`(retryable, `ChannelServer.js:162-164`) → 승인 앱이 1회 재시도. `MALFORMED` 여야 한다.
- 승인 앱 `ChannelClient.js:86-122` 는 보내기 전 `validateRequestData` 를 하지 않는다(워크포스 `ChannelClient.js:117` 은 함). 예: `kb.get` 에 projectId 가 null 이면 `"null"` 을 보내 상대에서 MALFORMED.
- 고치는 법: `ops.js` 에서 `run(() => spec.subject(data, actor.subject))`(판 3 에 F2 칸과 함께), 승인 앱 ChannelClient `send` 앞에 `validateRequestData(App.WORKFORCE, op, data)`.

### F8 [낮음] 연결 코드 붙여넣기 오류 코드 비대칭 (담당: 승인 앱 BE)
- 승인 앱이 받는 `pair.complete` 에서 pending linkId 가 다르면(관리자가 새 코드를 만들어 덮어씀·만료 후 삭제) 9단계가 **서명 없는** `NOT_PAIRED` 를 준다(`ChannelServer.js:103-107`). 워크포스는 같은 경우 서명 `PAIR_EXPIRED`(`PairingService.js:183-191`).
- 결과: 워크포스에서 붙여넣으면 `PAIR_PEER_UNREACHABLE`("도달 실패")로 보이고, 승인 앱에서 붙여넣으면 `PAIR_PEER_REJECTED/PAIR_EXPIRED` 로 보인다. 같은 상황, 다른 문구.
- 고치는 법: 승인 앱 9단계에서 `pair.complete` 의 pending 불일치는 핸들러로 넘겨 서명 `PAIR_EXPIRED` 로(워크포스와 동일). 서명 검증 통과 요청이라 SQL 0 원칙도 지킨다(KVS 1).

### F9 [낮음] SYSTEM 사유 오독 — CONTROL·FLOWS 알림이 `period-autoclose` 로 나간다 (담당: 승인 앱 BE)
- `src/resolver/workforce/WorkforceChangeNotifier.js:58`: 사람 없는 경로의 CERT 외 모든 종류(PERIOD·CONTROL·FLOWS)가 `period-autoclose`. 판 2 에서 `link-withdraw` 를 `link-change` 로 바꾼 이유("뜻과 이름이 어긋나면 감사 기록을 오독")와 같은 문제. 워크포스는 reason 을 판정에 쓰지 않아 동작 영향은 없다.
- 고치는 법: 트리거 경로의 CONTROL·FLOWS 는 실제 발생 경로가 있는지 확인하고, 있으면 사유를 추가(판 3)하거나 PERIOD 외에는 보내지 않기.

### F10 [낮음] 낡은 주석·죽은 선택지 (담당: 승인 앱 BE/FE, 워크포스 BE/FE)
- 승인 앱: `src/resolver/approval/target/TimesheetTargetAdapter.js:44`(movesApproval.{YYYY} touch), `src/resolver/worklogApproval/WorklogApprovalPolicy.js:80`(flows 재게시), `static/ui/src/features/timesheet/RoutingSourceBadge.jsx:5`·`static/ui/src/features/worklogControl/CapabilityRefresh.jsx:18`(`movesRms.org` 서명·cap).
- 워크포스: `src/utils/errors/ErrorCodes.js:229-230,235`(writeGate J2/J3, movesApproval.flows), `IssueApprovalSettingTable.jsx` 의 `state==='UNVERIFIED'` 필터(더 이상 안 나옴 — 프론트 보고 §5).

---

## 미검증 (실측 필요)

| # | 항목 | 이유 | 확인 방법 |
|---|---|---|---|
| U1 | S1 production webtrigger 도메인 | 미측정. 승인 앱 egress 는 dev 와일드카드만(production 줄 주석), 워크포스는 `{approvalAppId}.hello.atlassian.net` 가정까지 등록 — **두 앱 egress 비대칭**. 공유 `peerUrl.js` 정규식은 둘 다 허용 | 스파이크 production 배포 후 `getUrl` |
| U2 | S15 와일드카드 egress(승인 앱) 배포 수용 | lint 만 통과 | `forge deploy -e development` 후 ping |
| U3 | S14 확장 — **4xx/5xx** 응답에서도 `x-moves-link-sig` 헤더·본문이 그대로 오는가 | 리더 실측은 200 응답. 서명 오류 응답은 402·403·409·429·500 상태로 나간다(`HTTP_OF`) | 서명 `ACTOR_NOT_ALLOWED`(403)를 일부러 유도해 caller 에서 헤더 확인 |
| U4 | S16 `write.judge` 지연 | 승인 앱 judge 는 R1·bulkfetch·permission/search 2~3·워크로그·이슈 읽기 + 중첩 `link.resolve` 가능 — 워크포스 timeout 8초 | 캐시 비운 이슈로 워크포스 저장 |
| U5 | S18 `deleteUrl` 뒤 `getUrl(key)` 동작 | 워크포스 `unpair` 는 URL 삭제 뒤 다음 `createCode` 에서 `getUrl(key)`(forceCreate 없음, `ChannelState.js` selfUrl) — 지운 URL 을 코드에 실을 수 있다. 승인 앱은 `selfUrlDeleted` 면 forceCreate. **두 앱 처리 다름** | 해제 → 새 코드 → 상대 붙여넣기 |
| U6 | S2b·S2c·S3·S17 | 기존 목록 그대로 | `04_spike_todo.md` |
| U7 | S19 `layersFor` UNION ALL·OR 묶음 TiDB 동작 | 모의 executeQuery 만 | 원가 화면 50명 1회 |
| U8 | 클립보드·iframe `visibilityState` | jsdom 만 | 개발 사이트 |
| U9 | prd 서명 키 | keyring 에 `ap-prd-1`·`wf-prd-1` 없음 — 운영 배포 전 필수 | `scripts/workforce-link/gen-key.mjs` |

---

## 통과

### 1. 공유 파일·줄바꿈
| 항목 | 결과 |
|---|---|
| `src/integration/channel/*` 13개 sha256 두 리포 | **동일**(직접 `sha256sum` 비교, `SHARED_READY.md` 판 2 해시와 일치). CR 0바이트 |
| `.gitattributes` | 두 리포 `src/integration/channel/** text eol=lf`, `git check-attr` = `eol: lf`. 워크포스 `core.autocrlf=true` 에서도 안전. 옛 `integration/{workforce,approval}/*` 줄 제거 |
| 공유 파일 디렉터리 밖 import | 없음(테스트 강제), 옆 리포 바이트 대조 테스트 두 리포 통과 |
| 워크포스 `writeChannel.js` 두 사본 | `cmp` 동일 |

### 2. 앱 간 계약 교차 (생산자 ↔ 소비자)
| op(받는 앱) | 보내는 쪽(파일) | 받는 쪽(파일) | 일치 |
|---|---|---|---|
| `org.get`(WF) | AP `WorkforceInbound.js:86,107` `{accountIds}` 중복 제거, SYSTEM 은 subject=작성자 1명 | WF `handlers/orgGet.js` SYSTEM subject 재대조·USER 는 users 테이블 R1 | O |
| `org.teams`(WF) | AP `WorkforceTeamsService.js:35` `{offset}` | WF `orgTeams.js` → `TeamsReadApi`(가드 재사용, 필드 제한) | O |
| `link.resolve`(WF) | AP `LinkedIssueSettingSource.js:214` ≤100·중복 제거·SYSTEM 1건 | WF `linkResolve.js` ISSUE/PROJECT `basis`, `wa` 동봉 | O (F2 별도) |
| `kb.get`(WF) | AP `LinkedIssueSettingSource.js:290` | WF `kbGet.js` | O (F7 null 가능성) |
| `change.notify`(양방향) | AP `WorkforceChangeNotifier.js` / WF `ApprovalNotifier.js`·`orgEpoch.js`·`IssueApprovalSettingService.js:188` | 각 `changeNotify` — epoch 단조, SETTING 은 rev | O |
| `cert.query`(AP) | WF `ApprovalCertReader.js:123` ≤50쌍, BADGE 만 issueIds, SYSTEM 은 STATS 일 때만 | AP `certQuery.js` SQL ≤4, BADGE R2, `next` 이어 묻기 | O |
| `issue.control`(AP) | WF `ApprovalControlLookup.js:104` ROWS≤50/AGGREGATE≤100 | AP `issueControl.js` ROWS=actor 작성분만+R2, `globalPagePath`·`timeZone`·`handoffPath` 규칙 | O (F2 별도) |
| `write.judge`/`write.commit`(AP) | WF `IssueWorklogControlService.js:220,234` — `timeZone` 은 issue.control 값, 실패 시 넘김, commit 실패 무시 | AP `writeJudge.js`(결정적 op, R2, 현재 DB 판정)·`handlers/index.js` writeCommit(작성자 CAS) | O |
| `flows.list`(AP) | WF `IssueApprovalSettingService.js:90` | AP `createFlowsList` | O |
| `period.status`(AP) | 워크포스는 보내지 않음(보고와 일치) | AP 범위 = 본인·TeamScope·설정 관리자 명부 | O |
| 페어링 `pair.complete`·`sys.*` | 양쪽 `opsReceivedBy`·pin sha256·`isPeerUrl` | 1회 소비·같은 linkId+URL 멱등 | O (F8 문구) |

- DEFER reason 집합: AP 실제 값 8종 ↔ WF `approvalHandoff.js` 분류(일시 장애 5종·사전 승인·나머지 기본 문구) 일치. `write.commit` 실패 = 저장 성공(설계 §4.2) 양쪽 일치.
- 멱등 키: judge op = sha256(actor|idem) 결정적 UUID + INSERT IGNORE, commit = op 조건부 UPDATE(`bindWorkforceIntent`), notify = epoch 단조, pair = pending 1회 소비. 크기 상한: 요청 256KiB·응답 1.25MiB·작업별 bytes 를 공유 `ops.js` 가 양쪽에서 강제.
- **actor 처리**: 두 앱 모두 ChannelClient 에 accountId 인자가 없다. 승인 앱 `InvocationScope`(guard 가 `principal.accountId` 로 bind), 워크포스 `ActorScope`(`guardedDefine` 이 `context.accountId` 로 감쌈). 받는 쪽은 서명된 env.actor 로만 scope 를 연다. 승인 앱은 resolver scope 에서 SYSTEM 송신을 막는다(`ACTOR_SYSTEM_IN_USER_SCOPE`). 프론트 payload 가 actor 로 가는 경로 없음.
- 응답 데이터 내 출처 위조 방어: `originOf` 가 intent 의 issueId·author 를 실제 워크로그와 다시 대조(`origin.js:71-75`), 지문 결속은 후보 1건일 때만.

### 3. 보안 봉투
| 항목 | 결과 |
|---|---|
| 수신 1~8단계 SQL·KVS 0 | 두 앱 코드 경로 확인 + 테스트(변조·서명 없음·GET·JSON 불량·사이트 불일치에서 KVS 읽기 0·로그 0·핸들러 0) |
| 응답 서명 검증 | `verifyResponse` — 서명·`re`=요청 nonce·from/to 반전·linkId·cloudId·op·iat ±120s·작업별 응답 형태. 실패면 데이터 버림(양쪽) |
| iat 창 / nonce | ±120s, 인스턴스 LRU 2,000·5분(양쪽). 쓰기 작업 멱등이라 컨테이너 밖 재전송 무해 |
| cloudId·linkId | 7단계 cloudId(설치 ARI), 9단계 linkId → `STALE_LINK` |
| 서명 없는 STALE_LINK/NOT_PAIRED | **양쪽 동일** — 상태 불변, `lastErrorCode` 만(승인 앱 `ChannelClient` recordOutcome, 워크포스 `ChannelState.recordOutcome`), 화면이 UNAVAILABLE 로 계산 |
| 도메인 접두 분리 | RPC `moves-link-rpc/1`·코드 `moves-link-pair/1`·옛 property `moves-link/1` |
| 강제 주소 바꾸기 차이 | **F1** — 보안 문제 아님(fail-close), 일관성 문제 |

### 4. resolver ↔ 프론트
| 항목 | 결과 |
|---|---|
| 승인 앱 3단계 등록 | 신규 5개 `guardedDefine`(PairingController) + `PermissionMap {admin:true}` + `CONTROLLER_REGISTRARS`, `republishWorkforceLink`·조직 API 4개 삭제, 계약 테스트 통과 |
| 워크포스 3단계 | 7개 `W('SETTINGS')`, 옛 2개 삭제, 계약 테스트 통과 |
| 프론트 호출 이름 ⊆ PermissionMap | 승인 앱 130개·워크포스 163개 전부 등록됨(직접 대조) — 삭제 resolver 호출 0 |
| shape | 승인 앱 `getWorkforceLinkStatus`(light·direction·settingCode 포함)·연결 5개 ↔ `WorkforceLinkSettings.jsx` 소비 일치, `.content` 이중 접근 없음. 워크포스 펼친 응답 ↔ `ApprovalLinkCard.jsx`·`approvalLinkDiag.js` 일치. 오류는 `error.code` 분기, 새 코드 12개 `ErrorCodes`·`error.json` 양쪽 |

### 5. 불변식·권한
| 항목 | 결과 |
|---|---|
| 1·2·4·5·6 | 이번 변경이 상태 머신·CAS·결재자 UPDATE 를 건드리지 않음. intent 결속은 조건부 UPDATE |
| 3 도메인 순수 | 신규 `intentMatch.js`·`orgView.js`·`channelBodies.js` 에 `Date.now`/fetch/SQL 없음, 공유 파일은 시각·nonce·서명자 인자 |
| 8(§13 개정안) | 채널 스코프 `asUser()` 거부(`RequestJira.js`), asApp 은 `reason` 필수 + 새 사유 4개, 권한 조회는 actor 1명·결과는 boolean·메모 키에 actor·정확히 `[actor]` 만 허용, ROWS hidden = actor 작성분 + R2, 워크포스 숨김 본인 기록 asApp 스캔은 hidden id·작성자·visibility 대조 후(① ~ ⑥) |
| 9 | 판정에 property 를 쓰지 않음. 남은 property 사용은 자기 표식(`movesApproval.origin/op`)·정리·이관 전용 |
| 권한 범위 | `period.status` 남의 행 = TeamScope 팀원·설정 관리자만, 범위 밖 하나라도 있으면 전체 거부. `cert.query` COST/STATS R1(Q133 설계 수용), BADGE R2. 쓰기(`write.judge`)는 읽기보다 엄한 R2(+EDIT/DELETE_OWN) |
| 워크포스 UsersReadApi | 신원 = 플랫폼 `principal.accountId`+installContext(다른 cloudId 섞이면 401), query `accountId` 는 대상일 뿐, 가드 `R('USER_MANAGEMENT')` 재사용, 응답 = accountId·displayName·active·팀만(이메일·급여·levelBand·권한·역할 없음 — DTO 화이트리스트 `toUser` 확인), 오류 원인 미노출 |
| 팀장 설정 이관 | 자기 계열 키·cloudId·projectId·issueId 결속 서명만 KVS 로, KVS 값 우선, 표식 전에는 `movesRms.issue` 삭제 안 함(`LegacyPropertyCleanup.js` MIGRATE→CLEANUP) |

### 6. property 철거 잔존
- 승인 앱: 남은 참조 = 자기 워크로그 표식(`movesApproval.origin/op`, 설계상 유지) · 정리(`PropertyCleanup`) · 개인정보 삭제에서 아웃박스 ctl 제외(`PersonalDataRepository`) · 주석(F10). 판정·수신 경로 0.
- 워크포스: 남은 참조 = 자기 앱 필드·`movesRms`/`movesRmsLink`(간트·진척, 설계상 유지) · 이관(`IssueSettingMigration`)·정리(`LegacyPropertyCleanup`) · 주석(F10). `movesApproval.*` 읽기 0, `writeGate` 0.

### 7. manifest·i18n·유휴 SQL
| 항목 | 결과 |
|---|---|
| webtrigger·function | 승인 앱 `approval-link-channel`·워크포스 `workforce-link-channel` dynamic + `index.channelServer` export(번들 점검에 포함) |
| egress | 승인 앱 `*.hello.atlassian-dev.net`(S15), 워크포스 승인 앱 app id 호스트. `api.atlassian.com`(D5) 제거. apiRoute 추가 없음(승인 앱) / 워크포스 `organization-users-read-api` 추가(사용자 결정) |
| app id | 승인 앱 `1bd06760-…`(Confluence 앱 id 아님), `peerUrl.APP_IDS` 와 두 manifest 일치 |
| i18n kr/en | 두 리포 모든 namespace 키 집합 동일(직접 대조), merge 통과 |
| 유휴 SQL | 새 scheduledTrigger·consumer 없음, `workforce`·`workforce-cert` 작업 삭제, `workforce-cleanup` 완료 표식 뒤 SQL 0, 유휴 하루 27 이하 테스트 고정(연동 38→27), 핸들러별 SQL 상한 테스트(cert ≤4·period ≤2) |
| SQL 마이그레이션 | 없음(두 앱) |

---

## 실행 결과

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` → `npm test -- --runInBand` | **188 suites / 2,731 tests 통과** (96s) |
| 승인 앱 | `npm run check:bundle` | OK — exports 11개(`channelServer` 포함) |
| 승인 앱 | `npm run test:ui -- --runInBand` | **94 suites / 869 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공(기존 node_modules source map 경고만) |
| 승인 앱 | `forge lint` | 0 errors · 0 warnings · approval 1(`MAJOR_VERSION_RULE` — egress) |
| 워크포스 | `npx jest --runInBand` | **183 suites / 2,567 tests 통과** (109s) |
| 워크포스 | `static/ui: npx jest --runInBand` | **170 suites / 2,733 tests 통과** (snapshot 1) |
| 워크포스 | `static/ui: CI=true npm run build`(+ `bundle:check`) | 성공, main gzip 496,295 / 950,000 `withinBudget:true` |
| 워크포스 | `forge lint` | 0 errors · 0 warnings · approval 1(`MAJOR_VERSION_RULE`) + PermissionLinter "Unknown product" 경고 1줄(기존 추정, W-g) |

## 다음 회차 재검증 순서
F1 → F2(판 3 이면 공유 해시·`SHARED_READY.md` 갱신·옆 리포 대조) → F3 → F5·F6·F7·F8 → F4(문서) → 전체 테스트·빌드 재실행.

---

# 재검증 1회차 (2026-10-19)

> 입력: 네 보고서의 '검증 1차 수정' 절, `SHARED_READY.md` 판 3, 두 리포 `CLAUDE.md`·`AGENTS.md`. 코드는 직접 읽어 확인했고 테스트·빌드·lint 는 전부 다시 실행했다.

## 요약 — F1~F10 전부 해소. 남은 실패 4건(전부 낮음, 수정으로 생긴 것 3 + 기존 1), 출시 차단 없음

## F1~F10 해소 여부

| # | 판정 | 근거(파일:줄) |
|---|---|---|
| F1 강제 주소 바꾸기 | **해소** | 승인 앱 `src/resolver/channel/PairingService.js:200-228` — 상대가 아는 URL(`selfUrl`)·미확인 URL(`orphanUrls`) 따로 기록, force+미확인이면 `markRevoked({reason:'ROTATED_WITHOUT_PEER'})`, 응답 `status`. 워크포스 `approvalChannel/PairingService.js:158-180` 같은 규칙·같은 칸 이름·같은 사유. 승인 앱 FE 확인 모달·`rotatedRevoked`·`revokedReason` 문구, 옛 `rotatedUnconfirmed` 삭제 |
| F2 fail-open | **해소** | 승인 앱 `handlers/issueControl.js`(forEach 블록) — `unavailable` 또는 정보 없음이면 `link:'UNVERIFIED'`, linked 면 `basis`. 공유 `ops.js:344-353` 검증기(`link:'UNVERIFIED'` ∧ `linked:true` 거부). 워크포스 `ApprovalControlLookup.js` `rowToLink` 첫 줄 → `NOT_LINKED('UNVERIFIED')` → `writeChannelOf` BLOCKED(스위치 무관). `IssueWorklogControlService.js` `creationTarget`+`wholeProjectSubscribed` 가 무필터 SPACE 구독을 소속으로(조회 실패 = 확인 불가). `ProjectSubscriptionService.js:550,627,651` 구독 생성·수정·해제 뒤 `notifySubscriptionChanged`(SPACE 만, `change.notify{LINK, all}`) |
| F3 ctl 정리 시점 | **해소** | `PropertyCleanup.js:16-27,66-80` — `kick()` 을 첫 resolver(`permissionGuard.js:93`, 마이그레이션 직후)·첫 채널 수신(`ChannelServer.js:162`)에서 인스턴스당 1회, KVS 10분 간격, 실행당 Jira 60 → 300·동시 6. 완료 뒤 KVS 1 만(유휴 SQL 테스트 27 이하 그대로 통과). 상한은 여전히 `wr.exp` ≤7일이지만 활동 사이트에선 첫 호출 뒤 수 분 — 설계 가정 충족 |
| F4 문서 | **해소** | 승인 앱 `CLAUDE.md:19`(확정 결정)·`:72-78`(불변식 8 ⓐ~ⓔ·9), `AGENTS.md:35-40`(새 사유 4개, 옛 `workforce-publish*` 삭제 기록)·`:67`(`worklog-approval-author-org` 삭제). 워크포스 `AGENTS.md:53-59,94`(채널 기준). 워크포스 `CLAUDE.md` 에는 원래 property 서술이 없었다(grep 0) |
| F5 OP_UNKNOWN 순서 | **해소** | 워크포스 `ChannelServer.js` — 재전송(8) → 페어링·linkId(9) 뒤에야 서명 `OP_UNKNOWN`(승인 앱과 같음) |
| F6 LINK_DISABLED·RATE_LIMITED | **해소** | 워크포스 `ChannelServer.js` — 연결 관리 4작업 외 `approvalLinkMode!=='ON'` 이면 서명 `LINK_DISABLED`(메모 30초, 읽기 실패 = 꺼짐), 행위자당 분당 120 `RATE_LIMITED`(429) |
| F7 subject 예외·송신 전 검사 | **해소** | `ops.js:470-480` — `run()` 으로 감싸고 형식 오류 `MALFORMED` / 범위 초과 `ACTOR_NOT_ALLOWED`. 승인 앱 `ChannelClient.js:117` 송신 전 `validateRequestData` → `REQUEST_INVALID`(네트워크·상태 기록 0) |
| F8 붙여넣기 오류 비대칭 | **해소** | 승인 앱 `ChannelServer.js:108-114` 9단계가 `pair.complete` 를 거르지 않고 `PairingService.js:291-292` 가 서명 `PAIR_EXPIRED`. 서명·사이트 통과분만 도달하므로 1~8 SQL 0 유지 |
| F9 SYSTEM 사유 | **해소** | 판 3 `control-change`(`ops.js:100,444`), `WorkforceChangeNotifier.js:21,62` CERT/PERIOD/CONTROL·FLOWS 매핑 |
| F10 낡은 주석·죽은 선택지 | **해소** | 운영 코드 grep 잔여는 "삭제했다"는 이력 주석뿐. 워크포스 `IssueApprovalSettingTable.jsx` 필터 `ALL·SET·NONE`, `stateMode.UNVERIFIED` 키 삭제 |
| S18(해제 뒤 URL) | **해소(코드)** | 승인 앱 `selfUrlDeleted` 표식 → 다음 코드 forceCreate, 워크포스 `ChannelState.js:19-20,126-136` 같은 규칙. 두 앱 해제 시 지금·아는·미확인 URL 전부 삭제. 플랫폼 실측은 여전히 미검증이나 두 앱 모두 forceCreate 로 피한다 |

## 공유 파일

- 13개 sha256 두 리포 **동일**(직접 `sha256sum` diff), `SHARED_READY.md` 판 3 표와 일치 — `ops.js` `9a59ab6c…ab8c2`, `pairingOps.test.js` `9d30f3a0…14b79`, `sharedHash.test.js` `3f5a0331…02678`, 나머지 10개 판 2 와 같음. `CONTRACT_REVISION = 3`.
- 판 3 양쪽 대칭: `link:'UNVERIFIED'` — 승인 앱 생산(issueControl) ↔ 워크포스 소비(rowToLink → BLOCKED). `basis` — 승인 앱 linked 일 때만 생산 ↔ 워크포스 `link.basis` 보관, 소속 판정은 워크포스가 자기 SQL 로 독립적으로도 본다(승인 앱 답과 무관하게 fail-close). `control-change` — 승인 앱 송신, 워크포스는 reason 을 판정에 쓰지 않음.

## 남은 실패 (전부 낮음)

### R1 [낮음] 승인 앱 `unpair` — URL 하나라도 삭제 실패하면 `selfUrlDeleted` 를 세우지 않는다 (담당: 승인 앱 BE)
- `src/resolver/channel/PairingService.js:244-248`: `Promise.all(urls.map(deleteUrl))` 에 개별 `.catch` 가 없다. 강제 주소 바꾸기로 REVOKED 된 뒤(`:218-223` 은 `selfUrl` 을 이미 지운 옛 URL 로 남겨 둔다) 해제하면 목록에 이미 지운 URL 이 들어가고, 그 삭제가 실패하면 나머지는 지워졌는데도 `selfUrlDeleted=false` → 다음 연결 코드가 `getUrl(key)`(forceCreate 없음)로 지운 URL 을 실을 수 있다(S18 플랫폼 동작에 따라).
- 워크포스는 URL 마다 `.catch` + 지금 URL 이 없으면 표식(`PairingService.js:188-194`)이라 안전 — 두 앱 처리 다름.
- 고치는 법: URL 마다 `.catch`, 지금 URL 삭제 성공 여부로 `selfUrlDeleted` 판정. 강제 REVOKED 때 `selfUrl` 을 새 URL 로 갱신(워크포스 `:174` 처럼).

### R2 [낮음] 승인 앱 화면 — 워크포스가 보낸 `LINK_DISABLED` 가 최근 실패·연결 상태에서 "알 수 없는 오류"로 보인다 (담당: 승인 앱 FE)
- F6 수정으로 워크포스가 스위치 OFF 이면 서명 `LINK_DISABLED` 를 준다 → 승인 앱 `channel.lastErrorCode='LINK_DISABLED'`(UNAVAILABLE 배지). 그런데 `static/ui/src/features/settings/workforceLinkModel.js:52-57` `KNOWN_FAILURES` 에 없어 `failure.UNKNOWN` + 원문. 붙여넣기 거부 문구(`peerError.LINK_DISABLED`)는 있다.
- 동작 참고: 이 상태가 72시간을 넘기면 승인 앱 쪽 연동 이슈 기록도 `settingUnresolved` 로 막힌다(Q3 fail-close 그대로 — 설계 의도와 맞음). 관리자가 원인을 바로 알 수 있게 문구가 필요하다.
- 고치는 법: `KNOWN_FAILURES` 에 `LINK_DISABLED` 추가, `workforce.channel.failure.LINK_DISABLED`("워크포스에서 승인 앱 연동이 꺼져 있습니다") kr/en.

### R3 [낮음] `RATE_LIMITED` 재시도 표시 비대칭 (담당: 승인 앱 BE 또는 공유 `ops.js`)
- 워크포스 서버는 `RATE_LIMITED` 를 `retryable:true` 로, 승인 앱 서버(`ChannelServer.js:156`, `RETRYABLE` 기본값)는 `false` 로 서명한다. 승인 앱 클라이언트는 워크포스의 `retryable:true` 를 보고 읽기 작업을 **곧바로** 1회 재시도한다(분 단위 창이라 거의 확실히 또 429).
- 고치는 법: 한쪽으로 통일 — 권장은 둘 다 `retryable:false`(즉시 재시도 무의미, 화면이 "잠시 뒤" 안내), 또는 공유 `RETRYABLE` 에 명시하지 않는다는 규칙을 `SHARED_READY.md` 에 적기.

### R4 [낮음] `orphanUrls` 10개 상한 — 넘으면 오래된 미확인 URL 이 기록에서 빠지고 영영 지워지지 않는다 (담당: 승인 앱 BE·워크포스 BE)
- 승인 앱 `ChannelState.js:110`, 워크포스 `ChannelState.js:81` `slice(-10)`. 비강제 주소 바꾸기를 11번 넘게 연속 실패해야 생긴다. 남은 URL 도 서명 없이는 무력하다.
- 고치는 법: 상한에 닿으면 비강제 재시도를 막거나(`PAIR_PEER_UNREACHABLE` + 강제만 허용), 밀려나는 URL 을 그 자리에서 `deleteUrl`.

## 미검증 (1차 표 그대로, 변동만)
- U5(S18)는 코드상 두 앱 모두 forceCreate 로 회피 — 실측은 여전히 필요(R1 과 함께).
- 신규: F3 `kick()` 의 큐 push 가 resolver 첫 호출에 붙는 지연(KVS 2 + push 1, 인스턴스당 1회) — 개발 사이트에서 첫 화면 진입 시간 확인.
- 나머지(U1~U4, U6~U9) 그대로.

## 실행 결과 (재검증 1회차)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` → `npm test -- --runInBand` | **188 suites / 2,743 tests 통과** (1차 2,731 → +12) |
| 승인 앱 | `npm run check:bundle` | OK — exports 11개(순환 TDZ 없음 — `permissionGuard`→`PropertyCleanup` import 추가 후에도) |
| 승인 앱 | `npm run test:ui -- --runInBand` | **94 suites / 871 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공 |
| 승인 앱 | `forge lint` | 0 errors · 0 warnings · approval 1(`MAJOR_VERSION_RULE`) |
| 워크포스 | `npx jest --runInBand` | **183 suites / 2,580 tests 통과** (1차 2,567 → +13) |
| 워크포스 | `static/ui: npx jest --runInBand` | **170 suites / 2,737 tests 통과** |
| 워크포스 | `static/ui: CI=true npm run build`(+`bundle:check`) | 성공, gzip 496,337 / 950,000 `withinBudget:true` |
| 워크포스 | `forge lint` | 0 errors · 0 warnings · approval 1 + PermissionLinter "Unknown product" 1줄(기존) |
| 두 리포 | i18n kr/en 키 대칭 | 전 namespace 일치 |

---

# 재검증 2회차 (2026-10-19) — 코덱스 검수 #1~#5 + ActorVerifier 예산 + S20·S21

> 입력: `codex-review.md`, 두 백엔드 보고서 '코덱스 검수 수정'·'S20 실측 반영'·'추가 — 리더 실측 S20·S21 반영', `SHARED_READY.md` '상태 전이 규칙', `04_spike_todo.md` S20·S21. 코드는 직접 확인했고 전체를 다시 실행했다.

## 요약 — 코덱스 #1~#5와 ActorVerifier 예산 모두 해소, 1회차 R1~R4도 해소. 남은 실패 2건(낮음), 출시 차단 없음

## 코덱스 지적 해소

| # | 판정 | 근거(파일:줄) |
|---|---|---|
| #1 강제 재조회 실패 시 캐시로 허용 | **해소** | 승인 앱 `LinkedIssueSettingSource.js:232-236` — 캐시 대체는 `!force` 일 때만, force 실패는 `settingUnresolved`. 쓰기 경로 `WorklogService.js:567`(`refresh:true`)·`WorklogControlContext.js:309`(settingReader refresh) → 거부. `writeJudge.js:121` `refresh:true`, `:135` 미해결이면 DEFER `LINKED_SETTING_UNRESOLVED`/`PERSIST_FAILED`(intent 0). 워크포스는 이 reason 을 `WORKLOG_LINK_UNCONFIRMED`(확인 불가)로 처리 |
| #2 recordOutcome 경쟁 | **해소** | 연결 상태 = 엔티티 `channel-state`/`current`/`{gen, body}`, 모든 전이 조건부(승인 앱 `ChannelState.js` `createEntityCas`·`transition`, 워크포스 `AtomicDoc.js`+`ChannelState.js` `transition`). 표시는 별도 키 `channel:outcome:{linkId}` — 두 앱 `recordOutcome` 이 엔티티를 쓰지 않는다. 클라이언트는 호출에 쓴 linkId 를 넘긴다(승인 앱 `ChannelClient.js:160,164`, 워크포스 `ChannelClient.js:143`) |
| #3 해제가 pending 남김 | **해소** | pending 이 body 안에 있다. 해제·PAIRED 전이가 같은 전이에서 `pending:null`(승인 앱 `markRevoked`·`pairedBody`, 워크포스 `revoke`·`savePaired`). pair.complete 는 읽은 gen 으로만 PAIRED — 승인 앱 `PairingService.js` `onPairComplete`(`readRecord`→`completeFrom`, 경쟁 → `PAIR_EXPIRED`), 워크포스 `receiveComplete`(`savePaired` guard 안에서 pending 검사, 경쟁 → `PAIR_EXPIRED`) |
| #4 팀장 설정 비원자 저장 | **해소** | 워크포스 엔티티 `approval_issue_setting`(`rev`·`doc`), `IssueSettingStore.write` = `putIf(expectedRev)`(0 = notExists), `IssueApprovalSettingService.js:179-180` 조건 실패 → CONFLICT, 이관은 `createIfAbsent`(`IssueSettingMigration.js:125`) |
| #5 PROJECT 판정 500 잘림 | **해소** | 워크포스 `linkResolve.js:37,72` — 이슈의 Jira 프로젝트마다 `FIND_BY_SOURCE`(PK `source_type, source_id` 라 1건), 조회 실패 → `INTERNAL`(retryable) → 승인 앱은 확인 불가로 처리. 비용은 요청 이슈들의 서로 다른 프로젝트 수만큼 SQL(보통 1~수 건) |
| ActorVerifier 6초 | **해소** | 승인 앱 `ActorVerifier.js:151,155` `Promise.race(작업, 예산)` — 예산이 지나 확정되지 않은 이슈는 `null`(거부/DEFER). 진행 중 HTTP 는 백그라운드에서 끝난다(Forge requestJira 는 중단 불가 — 보고와 일치) |

## 상태 전이 규칙 두 앱 대조 (`SHARED_READY.md` 표 기준)

| 항목 | 승인 앱 | 워크포스 | 일치 |
|---|---|---|---|
| 엔티티·키·값 | `channel-state` / `current` / `{gen, body}` | 같음 | O |
| body 칸 15개 | 같은 이름 | 같은 이름 | O |
| 조건 | `gen equalTo(g)`, 레코드 없으면 `gen notExists`, 저장 gen = g+1(첫 저장 1) | 같음 | O |
| outcome 키 | `channel:outcome:{linkId}` `{lastOkAt, lastErrorCode, lastErrorAt, peerVersion, peerProto, peerOps}` | 같음 | O |
| peerUrl secret | `channel:peerUrl:{linkId}`, rekey 는 env.linkId 키만 | 같음 | O |
| pending 위치 | body.pending `{linkId, pinHash, exp, createdBy, createdAt, selfUrl}` | 같음 | O |
| 재시도 | 해제 3 · URL/selfUrlDeleted 2 · 코드 만들기/붙여넣기 0(`PAIR_STATE_CHANGED`) · pair.complete 0(`PAIR_EXPIRED`), 상대 해제·rotate 기록은 linkId 일치 때만 | 같음(`Retries` 상수) | O |
| `CONDITIONAL_CHECK_FAILED` | 이 code 면 곧바로 경쟁 | 같음 | O |
| 그 밖의 오류 | **다시 읽어 gen 이 바뀌었으면 경쟁, 아니면 원래 오류**(`ChannelState.js:69`, 규칙 문구와 같음) | **다시 읽지 않고 그대로 던짐**(`AtomicDoc.js:46-47`) | **X — R5** |
| 경쟁 오류 내부 code | `CHANNEL_STATE_CONFLICT`(규칙 문구) | `STORAGE_CONFLICT`(`AtomicDoc.js:22`) | **X — R5** |
| PAIRED 전이의 `selfUrlDeleted` | 늘 `false` | 이전 값을 이어감(`ChannelState.js:113`) — `selfUrl()` 이 forceCreate 직후 표식을 지우므로 정상 흐름에선 결과가 같다 | 사실상 O(R5 에 함께 적음) |
| @forge/kvs | 2.0.4 | 1.6.1(보고: transaction·오류 변환 파일 비교 결과 동일, `@forge/api` 8 의존 회피) | 수용 — S20 실측은 2.0.4 기준, 1.6.1 은 코드 대조만(미검증 U10) |

## S21 — 엔티티 integer에 2^31 이상이 들어가는 경로 전수

- 승인 앱: 엔티티는 `channel-state` 하나, integer 는 `gen`(1 부터 +1) 뿐이다. 시각은 전부 `body`(any) 안에 있다. **경로 없음.**
- 워크포스(이번 변경분): `channel-state.gen`(1 부터 +1), `approval_issue_setting.rev` — `planIssueSetting` 이 `current.rev+1`(`domain/approvalLink/issueSetting.js:63`), 이관은 `rev:1`(`IssueSettingMigration.js:78`), 검증은 `rev ≤ REV_MAX(2^31-1)`(`:34,45`), 저장 시각은 `updatedAt`(doc 안). 쓰기 경로는 `IssueSettingStore.write` 하나(호출 2곳)뿐. **경로 없음.**
- 참고(이번 범위 밖, 기존): 워크포스 기존 엔티티에 integer 칸이 13개 있다(`team.sortOrder`, `level.salaryMin/Max/Representative`, `monthRate`, 배치 카운터 등). 급여 칸이 원 단위 연봉이면 21.4억 원을 넘을 때 같은 오류가 난다 — 이번 변경과 무관해 실패로 세지 않았다(후속 확인 권고).

## 회귀 — 워크포스 setting.rev(epoch ms → 작은 정수)와 승인 앱 단조 비교

- 단조 비교는 한 곳뿐이다: 승인 앱 `LinkedIssueSettingSource.js:342`, `change.notify{SETTING}` 에 동봉된 값 — `body.rev <= before.srcRev` 면 건너뛴다. 캐시에 옛 epoch rev(≈1.79e12)가 남은 이슈는 새 설정(rev 2·3…)의 **즉시 반영이 건너뛰어진다.**
- 그러나 같은 `onNotify` 가 그 앞에서 `LINK_EPOCH_KEY` 를 `now` 로 올려(`:333`) 모든 link/linkset 행을 STALE 로 만든다. 다음 읽기의 `link.resolve` 반영(`applyIssue`, `:125-149`)은 rev 비교 없이 덮어쓴다. 쓰기·제출은 `force` 재조회라 캐시를 쓰지 않는다. → **새 설정이 버려지지 않는다(통과).** 그 밖의 rev 비교(`settingChanged`)는 `!==` 라 무관하다.
- 권고(실패 아님): 동봉 반영의 비교를 `updatedAt` 기준으로 바꾸거나, `srcRev` 가 `REV_MAX` 를 넘으면(옛 epoch) 비교 없이 덮어쓰게 한다. 채널 판은 아직 배포 전이라 옛 epoch rev 는 개발 사이트 캐시에만 있다.

## manifest·프론트·i18n

| 항목 | 결과 |
|---|---|
| 엔티티 선언 | 승인 앱 `app.storage.entities: channel-state{gen:integer, body:any}`, 워크포스는 같은 `channel-state` + `approval_issue_setting{rev:integer, doc:any}`. lint 0 errors(approval 1건 — egress·엔티티 major) |
| `PAIR_STATE_CHANGED` | 승인 앱: `ErrorCodes.js:18`, `error.json` kr/en, `workforceLinkModel.js:103,151`, 화면이 상태 재조회. **워크포스: 백엔드는 던지지만(`PairingService.js:30`) 화면 문구가 없다 — R6** |
| `LINKED_SETTING_UNRESOLVED` | 승인 앱은 DEFER reason 을 만들기만 한다(화면 소비 없음). 워크포스는 `WORKLOG_LINK_UNCONFIRMED` 로 바꿔 기존 "확인 불가" 문구를 쓴다 |
| `ORPHAN_LIMIT` | 승인 앱 `isOrphanLimit`·`workforce.channel.orphanLimit`, 워크포스 `failureKeyOf`·`setting.approvalLink.error.ORPHAN_LIMIT`(`{count}`) — kr/en 양쪽 |
| 1회차 이월 R2·R3 | **해소** — 승인 앱 `workforceLinkModel.js:56` `KNOWN_FAILURES` 에 `LINK_DISABLED`·`channel.failure.LINK_DISABLED` 문구, `RATE_LIMITED` 는 두 앱 모두 `retryable:false`(승인 앱 `ChannelServer.js:157`, 워크포스 `ChannelServer.js:165`) |
| 1회차 이월 R1·R4 | **해소** — 해제 시 URL 마다 실패를 따로 처리하고, `orphanUrls` 는 자르지 않으며 상한(`ORPHAN_URL_LIMIT`)에 닿으면 비강제 바꾸기를 거부(두 앱) |
| i18n 대칭 | 두 리포 전 namespace kr/en 키 일치 |
| 공유 파일 | 13개 sha256 동일(판 3 그대로, `ops.js 9a59ab6c…`) |

## 남은 실패 (낮음)

### R5 [낮음] 상태 전이 규칙이 "글자 그대로" 같지 않은 곳 2개 (담당: 워크포스 BE)
- `AtomicDoc.js:46-47`: `CONDITIONAL_CHECK_FAILED` 가 아닌 오류를 다시 읽지 않고 던진다. 규칙(`SHARED_READY.md`)과 승인 앱(`ChannelState.js:69`)은 "다시 읽어 gen 이 바뀌었으면 경쟁"이다. 영향: 쓰기는 성공했는데 응답이 다른 오류(타임아웃류)로 온 경우 워크포스만 실패로 처리한다 — 해제를 재시도하지 않고 오류를 낸다.
- 내부 경쟁 code 가 `STORAGE_CONFLICT`(`AtomicDoc.js:22`)로, 규칙의 `CHANNEL_STATE_CONFLICT` 와 다르다. 밖으로는 `PAIR_STATE_CHANGED`/`PAIR_EXPIRED` 로 바뀌지만, 재시도를 다 쓴 해제·URL 기록은 `STORAGE_CONFLICT` 가 그대로 resolver 오류로 나간다(R6 참고).
- 고치는 법: 그 밖의 오류도 다시 읽어 판정(승인 앱과 같게). 또는 규칙 문구를 두 앱 공통 "그대로 던진다"로 바꾸고 승인 앱도 맞춘다 — 어느 쪽이든 하나로. code 이름도 통일하거나, 규칙에 "내부 이름은 각 앱 자유"라고 적는다. PAIRED 전이의 `selfUrlDeleted` 도 승인 앱처럼 `false` 로 고정하면 표의 모든 항목이 같아진다.

### R6 [낮음] 워크포스 화면에 `PAIR_STATE_CHANGED`(·`STORAGE_CONFLICT`) 문구가 없다 (담당: 워크포스 FE)
- `static/ui/src/backoffice/page/setting/approvalLinkDiag.js:40` `KNOWN_ERRORS` 에 없고, `locales/{kr,en}/setting.json` 에도 `error.PAIR_STATE_CHANGED` 가 없다 → 코드 만들기·붙여넣기가 경쟁하면 "알 수 없는 오류"로 보인다. 승인 앱은 문구와 상태 재조회가 있다.
- 고치는 법: `KNOWN_ERRORS`·kr/en 에 `PAIR_STATE_CHANGED` 추가("다른 화면에서 연결 상태가 바뀌었습니다. 새로 고친 뒤 다시 시도하세요" — 승인 앱과 같은 뜻), 이 오류면 상태 쿼리를 무효화한다. `STORAGE_CONFLICT` 는 R5 에서 code 를 정리하거나 같은 문구로 보인다.

## 미검증 (추가)
- U10: 워크포스 @forge/kvs 1.6.1 에서 `CONDITIONAL_CHECK_FAILED` code 가 실제로 오는가(S20 실측은 2.0.4 스파이크) — 개발 사이트에서 두 화면이 동시에 코드를 만들어 확인.
- U11: 엔티티 추가 후 첫 저장(레코드 없음 → `notExists`)이 두 앱 실제 설치에서 동작하는가(S20 스파이크는 통과).

## 실행 결과 (재검증 2회차)

| 리포 | 명령 | 결과 |
|---|---|---|
| 승인 앱 | `npm run merge` → `npm test -- --runInBand` | **189 suites / 2,765 tests 통과** |
| 승인 앱 | `npm run check:bundle` | OK — exports 11개 |
| 승인 앱 | `npm run test:ui -- --runInBand` | **94 suites / 876 tests 통과** |
| 승인 앱 | `npm run build:ui` | 성공 |
| 승인 앱 | `forge lint` | 0 errors · 0 warnings · approval 1 |
| 워크포스 | `npx jest --runInBand` | **184 suites / 2,610 tests 통과** |
| 워크포스 | `static/ui: npx jest --runInBand` | **170 suites / 2,739 tests 통과** |
| 워크포스 | `static/ui: CI=true npm run build`(+`bundle:check`) | 성공, gzip 496,336 / 950,000 |
| 워크포스 | `forge lint` | 0 errors · 0 warnings · approval 1 + PermissionLinter "Unknown product"(기존) |
| 두 리포 | i18n kr/en 키 대칭 · 공유 파일 해시 | 일치 · 동일 |
