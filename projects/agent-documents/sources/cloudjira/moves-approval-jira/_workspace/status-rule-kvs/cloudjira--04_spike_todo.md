# status-rule-kvs — 실측 목록 (미검증)

> 작성: feature-architect · 2026-10-21. 설계서 `01_architect_design.md` §10 의 상세.
> 개발 사이트 `tom-chkim-dev`(development). WORK 전환 21 "Selected for Development" 에 validator 가 붙어 있다(product-polish T1).
> 확인 원칙: `forge logs` 는 늦다 — 결과는 resolver 반환값·DB·화면으로. 기능 켜기는 사용자 확인 후.

## 관문 (배포 직후, 기능 켜기 전)

| # | 항목 | 왜 | 확인 방법 | 실패 시 |
|---|---|---|---|---|
| **K0** | manifest 엔티티 `transition-rules` 추가가 major 인가 | 배포 절차·재동의 | `forge deploy -e development` 출력, `forge install --upgrade` 가 동의 없이 끝나는지 | major 면 `--approve MAJOR_VERSION_RULE`(dev). 고객 배포 묶음 때 다른 major 와 합침 |
| **K1** | `kvs.transact()` 에 엔티티 조건부 set **여러 개**(최대 11) — 하나라도 조건 실패면 전부 미적용인가, 작업 수 한도 | 원자성 1안 가능 여부 | 임시 진단 코드(배포 전 제거) 또는 `C:\CloudJira\spikes` 스파이크 앱: 11 op 중 1개 gen 틀리게 → `CONDITIONAL_CHECK_FAILED` + 나머지 미적용. 26 op 로 한도 확인 | 2안(순서 쓰기 + 재확인 보상)으로 전환 — 같은 인터페이스 뒤 플래그 |
| **K2** | 엔티티 `get` 이 쓰기 직후 다른 컨테이너에서 새 값을 보는가 | 저장 직후 무단 통과 창 | 규칙 저장 직후 1초 안에 WORK 이슈를 목적 상태로 전환 → 거부(`REJECT_NO_REQUEST` 또는 자동 요청)인지 | 창이 있으면 화면에 "저장 후 수 초 뒤 적용" 문구, 또는 저장 응답 전에 확인 읽기 |

## 흐름 (기능 켠 뒤 — 사용자 확인 후)

| # | 항목 | 확인 방법 | 기대 | 실패 시 |
|---|---|---|---|---|
| S1 | 규칙 없는 상태로 전환 | WORK 이슈를 규칙 없는 상태로 전환 | 통과, 로그 `PASS_NO_RULE`, SQL 0(단위 테스트로 고정 — 실측은 통과 여부만) | — |
| S2 | 규칙 있음 + 자동 요청 끔 | 전환 21 시도 | 기존 문구 `REJECT_NO_REQUEST` | 판정 경로 수정 |
| S3 | 자동 요청 켬 | 같은 시도 | 거부 문구 "승인 요청을 올렸습니다…", 이슈 카드에 PENDING 요청 1건·"자동 요청" 배지, 업무함에 결재자 행 | 로그 `auto <reason>` 로 원인 |
| S4 | 같은 전환 재시도 | S3 직후 다시 | `REJECT_PENDING` 문구, 요청 1건 그대로 | dedupe·candidates 확인 |
| S5 | 승인 → 자동 적용 | 결재자 승인 | 상세 `apply.status=APPLIED`, 전환 id 가 기록됨(B7), 이력 작성자 = 요청자 | `TRANSITION_AMBIGUOUS`/`REQUESTER_IMPERSONATION_UNAVAILABLE` 면 A6 |
| A1 | payload `user` 하위 필드 이름 | `[VALIDATOR] shape` 로그에 `user` 하위 키 이름 추가 | `accountId` 외 무엇이 오는지 | 오면 `/user` 호출 생략 검토 |
| A2 | 자동화 실행자 판별 | Automation 규칙(실행자 "Automation for Jira")으로 전환 21 실행 | 자동 요청 없음, 로그 `auto NOT_HUMAN`, 결과 기록(거부) | accountType 값이 다르면 `humanActorOf` 수정 |
| A3 | validator 시간 | S3 의 로그 시각(콜드·웜) | 자동 요청 포함 4초 안. 콜드에서 `LATE` 가 잦으면 startBy 조정 | 예산 재설계 |
| A4 | 결재자 asApp 열람 확인 | S3 | `APPROVER_ACCESS` 로 빠지지 않음 | 응답 형태 확인(S2b 와 같은 계열) |
| A5 | 거부 문구 표시 | 이슈 화면 전환 버튼·보드 드래그 | 두 줄(한·영) 문구가 잘리지 않고 보임 | 문구 축약 |
| A6 | 앱 미사용 계정의 자동 적용 | 앱 화면을 연 적 없는 계정으로 S3→승인 | `FAILED/REQUESTER_IMPERSONATION_UNAVAILABLE` 이면 B8 문구대로 "다시 전환" 안내가 맞는지 | 문구·안내 조정 |
| V1 | 검사 호출 관찰(기능 끔) | 기능 끔 상태로 규칙 저장 → 전환 21 → 프로젝트 설정 새로 고침 | 규칙 행 "확인됨 · 날짜" | projectKey 대조 확인 |
| V2 | 검사 호출 관찰(기능 켬) | S2 뒤 새로 고침 | 같음 | — |

## 후속 (B10 — 이번 범위 밖)

| # | 항목 |
|---|---|
| W1 | 워크플로 조회 API(`/rest/api/3/workflows/search`·`POST /workflows`·`/workflowscheme/project`)의 필요 scope 와 Forge 의 granular `read:workflow:jira` 선언 가능 여부 |
| W2 | 응답에 Forge validator 가 어떤 형태(모듈 키·app id)로 나오는가 |
| W3 | team-managed 프로젝트 워크플로 조회 형태 |

## 백엔드 구현 메모 (backend-engineer · 2026-10-21)

| # | 구현 상태 | 확인 후 바꿀 곳 |
|---|---|---|
| K0 | manifest `app.storage.entities` 에 `transition-rules`(gen integer, body any) 추가. 배포·`forge` 명령은 실행하지 않음 | major 로 나오면 `--approve MAJOR_VERSION_RULE`(dev) |
| K1 | 1안(TRANSACT, 다중 키 조건부 set 한 transaction)이 기본. 2안(ORDERED: 추가 색인 먼저 → 프로젝트 CAS, 색인 제거 없음 — 과잉 색인 허용, Codex P1)도 같은 인터페이스 뒤에 구현·테스트(메모리 저장소 `multiKey:false`) | 실패로 판명되면 `src/resolver/transition/TransitionRuleRepository.js` 의 `INDEX_WRITE_MODE` 를 `IndexWriteMode.ORDERED` 로 한 줄 변경. 한 번에 쓰는 op 수 = 1 + 바뀐 상태 수(초기 세팅 최대 11, 규칙 하나 수정 최대 3) |
| K1 보조 | 조건 실패 판정은 `error.code === 'CONDITIONAL_CHECK_FAILED'`(ChannelState S20 실측과 같은 코드). 다중 op 에서 다른 코드가 오면 경쟁이 아니라 오류로 던진다(재시도 없음 → 화면 UNKNOWN_ERROR) | 실측 코드가 다르면 `createKvsRuleStore.commit` 의 판정 확장 |
| K2 | 저장 직후 읽기 확인 없음(설계 그대로) | 창이 있으면 저장 응답 전 `statusIndex` 확인 읽기 추가 검토 |
| A1 | `[VALIDATOR] shape` 로그에 `user` 하위 키 이름 추가(값 없음) | — |
| A2 | `humanActorOf`: `accountType` 없으면 null(모름 → 자동 요청 안 함, 로그 `auto ACTOR_UNKNOWN`) | Automation 실행 결과가 `ACTOR_UNKNOWN` 이면 응답 형태 확인 |
| A3 | **실측(2026-10-21, 5.13.x, WORK-104 전환 21)**: 동기 생성 콜드 gate 1715 / prep 2712 / write 6076ms(쓰기만 3.4초) → 예산 4000ms 초과, 사용자는 REJECT_UNAVAILABLE 인데 요청은 CREATED. 웜 gate 593 / prep 1129. Jira 는 6.3초 응답도 받아 줌. → **큐 비동기로 전환**: validator 는 시작 ≤2500ms·넣기 ≤800ms(`AUTO_QUEUE_*`) | 넣기 `auto LATE`·`QUEUE_FAILED` 가 잦으면 상수 조정 |
| A4 | 결재자 열람 = asApp `user/viewissue/search`(사유 `transition-auto-request-approver`), 200 + 정확히 그 한 명 → true, 200 + 빈 목록 → false, 그 밖(오류·비정상·시간 초과) → null — **true 가 아니면 전부 자동 요청 안 함**(검증 F1). 실측에서 `APPROVER_ACCESS` 가 나오면 응답 상태·형태부터 확인 | S2b(권한 없는 활성 계정의 빈 목록)와 같은 계열 |
| R1 | 기존 엔진 갭(DRAFT 잔존 시 dedupe 점유) — 수정 안 함. 자동 경로는 쓰기 시작 마감으로 확률만 낮춤 | 별도 과제 |

## 실측 (2026-10-21)
- **K0 통과** — 엔티티 transition-rules 추가 배포가 minor(5.12.0 → 5.13.0), install --upgrade 불필요.

## 큐 비동기 전환 뒤 확인할 것 (2026-10-21, backend 4회차)

| # | 항목 | 확인 방법 | 기대 | 실패 시 |
|---|---|---|---|---|
| Q1 | manifest consumer·function(`transition-auto-request-consumer`, function key `transitionAutoReq` → handler `index.runTransitionAutoRequest`, timeoutSeconds 60) 추가가 major 인가 | `forge deploy -e development` 출력 | **실측 5.17.0: minor**. function key 는 23자 초과 시 lint `MANIFEST_INVALID_RULE` → 리더가 `transitionAutoReq` 로 줄임 | — |
| Q2 | validator 안 `Queue.push` 시간·성공 | 전환 21 시도 → 로그 `[VALIDATOR] auto QUEUED {"ms":…}` | 800ms 안 | `auto LATE`/`QUEUE_FAILED <code>` 면 상수·원인 |
| Q3 | consumer 지연·결과 | 거부 직후 이슈 카드 새로 고침 → PENDING 1건·"자동 요청" 배지. 로그 `[AUTO_REQUEST] CREATED {"ms":…}` | 수 초 안 | `[AUTO_REQUEST] <reason>` 로 원인 |
| Q4 | 웜 겹친 두 번째 시도의 `auto FAILED`(원인 불명, 동기 판 실측) | 큐 판에서 같은 전환 연속 2회 → 두 번째는 validator 가 PENDING 을 보고 `REJECT_PENDING`(요청 생성 전이면 QUEUED 두 건 → consumer 하나는 `NOT_ELIGIBLE_CODE` 또는 `ALREADY_OPEN`) | 요청 1건 | `[AUTO_REQUEST] FAILED <code>` 의 코드(이제 error.code/name 을 남긴다) |
| Q5 | consumer 안 asApp 3종(issue·user·viewissue) 200 | Q3 성공 여부 | 성공 | 응답 형태 확인 |

### 실측 결과 (리더, 2026-10-21, dev 5.17.0)

| # | 결과 |
|---|---|
| Q1 | **통과** — 배포 minor. function key 23자 제한(lint `MANIFEST_INVALID_RULE`)으로 `transitionAutoReq` 로 변경(handler `index.runTransitionAutoRequest` 유지) |
| Q2 | **통과** — WORK-103: validator `[VALIDATOR] auto QUEUED {"ms":2962}` → `REJECT_AUTO_REQUEST_QUEUED` 문구 정상 표시. 2962ms 는 validator 시작 기준(콜드 포함), 시작 상한 2500ms·넣기 800ms 안이지만 여유가 작다 — 콜드에서 `LATE` 가 보이면 상수 재검토 |
| Q3 | **통과** — consumer `[AUTO_REQUEST] CREATED {"ms":5586}`(콜드), 이슈 카드 "결재 중 · 검사에서 자동으로 요청함" |
| Q4 | **통과** — WORK-104(열린 요청 있음) → `REJECT_PENDING`, push 안 함 |
| Q5 | 통과(Q3 성공 = consumer asApp 3종 200) |

### 재시도·멱등(backend 5회차) 뒤 확인할 것
| # | 항목 | 확인 방법 | 기대 |
|---|---|---|---|
| Q6 | consumer 가 돌려준 InvocationError(`{_retry:true, retryOptions:{retryAfter:30, retryReason:'FUNCTION_RETRY_REQUEST'}}`)로 Forge 가 재전달하는가, `retryContext.retryCount` 가 늘어나는가 | 임시로 일시 오류를 내기 어렵다 — 로그 `[AUTO_REQUEST] RETRY <reason>` 뒤 같은 jobId 재처리·`GIVE_UP` 관찰(자연 발생 시) | 30초 뒤 재처리, 3번째 뒤 `GIVE_UP` |
| Q7 | 재전달 멱등 — 같은 메시지 재처리 시 `ALREADY_HANDLED` | Q6 과 함께 | 요청 1건 |

## 실측 (2026-10-21, 5.18.0 · 7f341bf)
- WORK-102 두 번 연속 막힘 → 둘 다 QUEUED(콜드 2928ms·웜 1059ms) → consumer 두 개가 동시에 처리: 하나 `CREATED {"ms":5486}`, 하나 `RETRY TRANSIENT SQL_EXECUTION_ERROR`(동시 쓰기 충돌로 추정, duplicate key 가 아니라 ALREADY_OPEN 으로 안 바뀜 — Q4 의 원인 불명 FAILED 와 같은 것으로 보임) → 약 70초 뒤 재시도에서 `ALREADY_HANDLED`. 요청은 1건만.
- **Q6·Q7 통과** — Forge 가 InvocationError 로 재전달하고, 재처리가 멱등으로 끝난다.
- 후속: 동시 쓰기 오류를 ALREADY_OPEN 과 같이 조용히 끝낼지(지금은 재시도 1회 낭비) — 낮은 우선순위.
