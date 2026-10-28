# 앱 간 webtrigger · 외부 apiRoute 기능 검증 보고서 (종합, 실측 2026-10-20)

> 질문: "승인 앱 ↔ 워크포스 통신을 webtrigger(+Ed25519 서명)로, 외부 서비스 통신을 apiRoute(+3LO)로 하면 **기능이 실제로 되는가**?"
> 결론: **된다.** 다만 첫 실측에서 결함 2건(F01·F04)이 나와 고친 뒤(워크포스 10.2.0, 승인 앱 5.5.0) 다시 실측해 통과했다. 사람 결정이 필요한 2개 흐름(결재 → 워크포스 반영, 워크포스 조직 변경 알림)은 실측하지 못했다(§4).

- 환경: tom-chkim-dev(cloudId `119d766c-…`), 승인 앱 development, 워크포스 moves-rms(Development). 두 앱 페어링 상태(linkId `gOeuj5Cq…`).
- 증거: `evidence/functional/`(F01~F07 캡처·`NOTES.md`), `evidence/webtrigger/`(보안), `evidence/apiroute/`(외부 API). 화면 응답은 브라우저에서 resolver 응답을 가로채 확인했다(토큰·이메일 제외).
- 관련 문서: 보안 `05_webtrigger_security_report.md`, 외부 API `06_apiroute_verification_report.md`, 고객 가이드 `C:\CloudJira\moves-workforce\docs\external-api\README.md`.

## 1. 요구(결정)별 판정

| 결정 | 내용 | 판정 | 근거 |
|---|---|---|---|
| D1 | 앱 간 = webtrigger + Ed25519, property 교환 전부 제거 | **충족** | §2 기능 F01~F07 실측, 보안 05(위조 26종·폭주 80건 전부 거부) |
| D2 | 외부 = apiRoute + 3LO, 기존 가드 재사용 | **충족**(워크포스 샘플) | 06: 토큰 없음 401, 정상 200, sns 누락 403, 화면과 응답 일치. 권한 없는 사용자 거부는 미측정 |
| D3 | 첫 연결 = 연결 코드 붙여넣기 | **충족** | 05 evidence/webtrigger 01~05(코드 발급 → 붙여넣기 → 양쪽 "연결됨") |
| D4 | Runs on Atlassian 자격 포기 | 확인 | `forge deploy` 출력 "not eligible" — 공식 [Build Runs on Atlassian apps](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/)(dynamic webtrigger·egress 실격) |
| D6 | 요청은 일으킨 사람(actor) 기준, 받는 쪽 재확인 | **충족(수정 후)** | F01: 워크포스가 actor 의 워크포스 권한 세트로 판정. F06: 숨긴 워크로그는 작성자 본인 것만 반환. F07: 워크포스 입력을 승인 앱이 actor 기준으로 판정 |

## 2. 기능 실측 — webtrigger 채널

| # | 채널 작업(방향) | 사용자 화면 → 확인한 결과 | 1차 | 수정 후 | 증거 |
|---|---|---|---|---|---|
| F00 | `pair.complete`·`sys.ping` (양방향) | 설정 > 워크포스 연동 · 워크포스 설정 > 승인 앱 연결 — "연결됨", 연결 확인 응답 + 상대 버전 | 통과 | 통과(5.4.0 표시) | webtrigger/04·05·07·08 |
| F01 | `org.teams` (승인→워크포스) | 승인 설정 > 승인 기간·팀 > 팀 "워크포스에서 받은 팀" — A팀·A-1·A-2, 팀장, 팀원 수, "확인됨" | **실패** `ACTOR_NO_ACCESS`(화면 "응답하지 않습니다") | **통과** | F01a·F01b → F01c |
| F02 | `org.get` (승인→워크포스) | 승인 기간·팀 > 정책 "내 Workforce 결재자 구성" — 내 팀 A-2, 팀장 Rax Yang | 표시됨 | — | F02 (캐시 72h 가능성 — 실시간 호출은 F07 결재자 지정으로 간접 확인) |
| F03 | `link.resolve` + `kb.get` (승인→워크포스) | 연동 이슈 VODF-2 Work log 탭 — `linked:true`, `layout:LINKED`, 업무 기준 하루 480분·10월 근무일 22일 / 비연동 WORK-104 는 `linked:false` | 통과(비연동) | 통과(연동) | F03 · F03b |
| F04 | `flows.list` (워크포스→승인) | 워크포스 프로젝트 > 작업 관리 > 승인 설정 — 이슈 5건, `flowsByProject` 수신 | **실패** `ISSUE_SETTING_UNREADABLE` | **통과** | F04 → F04b |
| F05 | `cert.query` (워크포스→승인) | 워크포스 My Work 달력 — 승인분 잠금 아이콘, "확인 중 N시간 제외" | 통과 | 통과 | F05 |
| F06 | `issue.control` (워크포스→승인) | 승인된 워크로그 모달 "승인됨 · 수정 불가", 응답 `linked:true`·`channel:OPEN`·`hidden`(작성자 본인분) | 통과 | 통과 | F06 |
| F07 | `write.judge` → `write.commit` (워크포스→승인) | 워크포스에서 VODF-2 10/20 1h 입력("승인 앱 규칙으로 판정해 저장합니다") → `{id:24598, signed:true, approvalStatus:PROCESSING}` → 승인 앱 이슈 화면 "승인 대기", 업무함에 워크로그 승인 요청 자동 생성(1단계) | — | **통과** | F07a·F07b·F07c·F07d |

## 3. 발견한 결함과 수정

| # | 결함 | 원인(확정) | 수정 | 테스트 |
|---|---|---|---|---|
| F01 | 워크포스 Admin 세트 보유자도 `org.teams` 거부 | ① 워크포스 가드가 Jira 관리자 판정을 **asUser** `/mypermissions` 로 함 — webtrigger 에는 사용자 세션이 없어 던짐(스파이크 S2, 워크포스 스케줄 트리거의 401 AUTH_TYPE_UNAVAILABLE 과 같은 계열) ② `guardedDefine` 이 scope 를 다시 열며 채널 표시(`via`)를 덮어씀 ③ 팀 서비스가 이름을 **asUser** `/user/bulk` 로 조회 | 워크포스: 채널 경로에서 Jira 관리자 판정 생략(워크포스 권한 세트만, 좁히기만), principal 캐시 키 분리, 안쪽 scope 가 바깥 채널 표시 상속, 채널에서 이름 조회 생략(승인 앱이 이름을 자기 asUser 로 해석) | `PrincipalResolverChannel.test.js`(3), `ActorScopeNesting.test.js`(5) |
| F01' | 권한 거부가 "워크포스가 응답하지 않습니다"로 보임 | 승인 앱이 채널 오류를 전부 `WORKFORCE_UNAVAILABLE` 로 바꿈 | `ACTOR_NO_ACCESS` → `WORKFORCE_ACCESS_DENIED`, `LINK_DISABLED` → `WORKFORCE_LINK_DISABLED`(원인은 `cause.reason`) | `WorkforceTeamsService.test.js` +1 |
| F04 | 팀장 이슈 설정이 하나도 없으면 목록·연동 판정 실패 | KVS `batchGet` 은 **없는 키를 `failedKeys` 에 `KEY_NOT_FOUND` 로** 돌려준다(@forge/kvs 테스트로 확인, 승인 앱 `PersonalDataState` 는 이미 처리). 테스트용 가짜 저장소가 없는 키를 그냥 빼서 단위 테스트가 못 잡음 | `KEY_NOT_FOUND` 만 "없음", 그 밖 실패는 그대로 거부. 가짜 저장소를 플랫폼과 같게 | `handlers.test.js` +1, 기존 실패 테스트 보강 |

교훈: 채널 핸들러가 **기존 guarded resolver 를 재사용**하면 그 안의 asUser 호출이 webtrigger 에서 깨진다. 단위 테스트의 모의 객체는 이걸 숨긴다 → 채널로 노출하는 기존 서비스는 asUser 호출 지도를 먼저 만든다(이번 감사: 워크포스 채널 핸들러 9개 중 `org.teams` 만 해당).

검증: 워크포스 BE 184 suites / 2,603, 승인 앱 189 / 2,762 통과. 배포 워크포스 moves-rms 10.2.0, 승인 앱 development 5.5.0. **커밋 안 함.**

## 4. 실측하지 못한 것

| 흐름 | 이유 | 하는 법 |
|---|---|---|
| `change.notify`(승인→워크포스, CERT) + `cert.query` 갱신 — 결재하면 워크포스 화면이 "승인됨"으로 바뀌는가 | F07 요청의 결재자가 Tom 이 아님(업무함 "내 차례" 0) — 결재자 계정 필요 | 결재자(Rax Yang 추정) 로그인 → 업무함 승인 → 워크포스 My Work 에서 10/20 VODF-2 배지 확인 |
| `change.notify`(워크포스→승인, ORG·KB) | 워크포스 팀·시급 설정을 바꿔야 함(개발 데이터 변경) | 워크포스 팀 관리에서 팀장 변경 → 승인 앱 "워크포스에서 받은 팀" 새로 고침 |
| `period.status` | 워크포스 쪽 호출부가 없음(받는 핸들러만 있음) | 계약 정리 대상 — 쓰지 않으면 ops 에서 제거 검토 |
| `sys.rekey`·`sys.unpair` 실사용 | 재페어링이 필요해 생략(05 와 같음) | 운영 전 별도 |
| apiRoute 권한 없는 사용자 403 | 사용자 보류("나중에") | 06 §7 |
| production 환경 | 이번 범위 밖 | prd 키 생성 후 |

관찰(결함 아님, 확인 필요): 워크포스 워크로그 모달의 "Worklog 작성자: 할당되지 않음" 표시. 1차 F01 의 콜드 응답 13초(apiRoute 실측) — 채널 클라이언트 8초 제한을 넘을 수 있어 콜드 직후 첫 조회는 실패할 수 있다(다시 시도하면 통과).

## 5. 출처

| 주장 | 근거 |
|---|---|
| webtrigger 는 플랫폼 인증이 없다 → 우리 서명이 인증 | 공식 [Web triggers](https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/) "Web trigger URLs are not authenticated by the Forge platform" |
| webtrigger 안에서 asUser 불가(동의 사용자만 offline impersonation) | 스파이크 S2(`04_spike_todo.md`), 이번 F01 |
| KVS batchGet 의 `KEY_NOT_FOUND` | `@forge/kvs` 1.6.1 패키지 테스트(`node_modules/@forge/kvs/out/__test__/index.test.js`), 이번 F04 |
| apiRoute·3LO | 06 §8 출처 표 |
