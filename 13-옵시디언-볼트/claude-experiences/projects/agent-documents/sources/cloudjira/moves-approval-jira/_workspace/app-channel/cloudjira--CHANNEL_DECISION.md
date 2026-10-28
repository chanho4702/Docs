# 통신 채널 결정: 앱 간은 웹트리거, 외부 노출은 API 라우트

작성일: 2026-10-19
대상: moves-approval-jira(승인 앱), moves-workforce(워크포스)
상태: 결정 (설계 전)

근거 표기

- [공식] Atlassian 개발자 문서 (2026-10-19 조회, 링크는 6장)
- [실측] 2026-10-19 스파이크 결과, C:\CloudJira\spikes\app-channel\RESULTS.md (개발 사이트 tom-chkim-dev, development 환경)
- [실측-과거] 리포 안 기존 검증 기록
- [미검증] 아직 확인하지 않은 항목

---

## 1. 결정

| 용도 | 채널 | 인증 |
|---|---|---|
| 앱 간 통신 (승인 앱과 워크포스) | 웹트리거 | 기존 Ed25519 서명 (우리 코드) |
| 외부 API 노출 (SAP, 사내 시스템 등) | API 라우트 | OAuth 2.0 3LO (Atlassian 게이트웨이) |

---

## 2. 앱 간 통신을 웹트리거로 하는 근거

### 2.1 사람 없이 앱끼리 동작한다

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 호출자 신원 | 없음, 서명으로 상대 앱을 인증 [실측] | 토큰을 발급한 사람 1명의 accountId [실측 R3] |
| 트리거·스윕처럼 사용자가 없는 경로 | 그대로 동작 [실측 W1] | 저장해 둔 refresh token으로만 동작. 토큰 주인이 퇴사하거나 권한을 잃으면 연동 정지 [실측 R4] |
| 토큰 없이 앱 신원만으로 호출 | 해당 없음 | 401. 플랫폼이 앱 신원으로 통과시켜 주지 않음 [실측 R1] |

앱 간 통신은 대부분 트리거와 스윕처럼 사용자 컨텍스트가 없는 경로에서 일어납니다. API 라우트는 이 경로를 "특정 사람의 토큰"에 의존하게 만듭니다.

### 2.2 빠르다

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 앱 백엔드끼리 호출 지연 | 0.12~0.4초, 연속 5회 평균 약 0.23초 [실측 W4] | 1.7~1.9초 [실측 R3] |

웹트리거가 약 8배 빠릅니다.

### 2.3 고객 설치 절차가 없다

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 고객 관리자 작업 | 없음 | 사이트마다 App REST APIs 활성화 [공식], OAuth 앱 생성, scope 연결, callback, 사용자 동의 [실측] |
| 상대 주소 교환 | 앱이 webTrigger.getUrl 로 자기 URL을 만들어 상대에게 게시. CLI로 만든 URL과 동일 [실측 W6] | 해당 없음 |
| 재배포 후 주소 | 그대로 유지 [실측 W5, 공식] | 해당 없음 |

### 2.4 인증 수단이 이미 있다

| 항목 | 결과 |
|---|---|
| Forge 런타임(Node 22)에서 Ed25519 서명 검증 | 성공 [실측 W1] |
| 본문 변조 감지 | 서명 검증 실패로 감지 [실측 W2] |
| 기존 자산 | 두 앱 사이에 이미 Ed25519 keyring과 서명 검증 코드가 있음 (property sig 검증, writeGate.js) |

API 라우트를 쓰면 client secret과 매번 회전되는 refresh token을 원자적으로 저장하는 새 비밀 관리가 필요합니다. [실측 R4]

### 2.5 property 한계를 벗어난다

| 항목 | 웹트리거 | entity property |
|---|---|---|
| 한 번에 보낼 수 있는 크기 | 200KB 본문 정상 처리 [실측 W3], 한도 5MB [공식] | 값 하나 최대 32KB [공식] |
| 반영 시점 | 호출 즉시 | 상대가 읽을 때. 즉시 반영 보장 없음 |
| 위변조 | 서명 검증 | 편집 권한자가 쓸 수 있어 서명 필수 |

### 2.6 정식 기능이다

웹트리거는 정식 모듈이고, API 라우트는 Preview입니다. Preview는 폐기 예고 기간이 짧을 수 있습니다. [공식]

---

## 3. 외부 API 노출을 API 라우트로 하는 근거

### 3.1 노출하는 우리 앱이 Runs on Atlassian 자격을 지킨다

| 방식 | 데이터를 JSON으로 돌려주는 조회 API | 노출하는 앱의 자격 |
|---|---|---|
| API 라우트 | 가능 | 유지 [공식, 실측-과거] |
| 웹트리거 static | 불가, 고정 응답만 | 유지 [공식] |
| 웹트리거 dynamic | 가능 | 실격 [공식] |

외부에 조회 API를 열면서 자격을 지키는 방법은 API 라우트뿐입니다. 호출자가 외부 서버라 우리 앱에서 밖으로 나가는 요청도 없습니다.

### 3.2 인증을 Atlassian이 해 준다

| 항목 | 결과 |
|---|---|
| 토큰 없는 호출 | 게이트웨이에서 401, 우리 함수가 실행되지 않음 [실측 R0] |
| scope 부족 | 403 Missing required scopes [실측 R0'] |
| 효과 | 위조 요청이 우리 함수와 SQL까지 오지 않음. 인증 코드를 직접 만들지 않음 |

### 3.3 호출자가 누구인지 안다

| 항목 | 결과 |
|---|---|
| 핸들러가 받는 principal.accountId | 토큰을 발급한 사용자 [실측 R3] |
| 함께 오는 정보 | installContext(사이트 ARI), installation [실측 R3] |
| 효과 | 기존 권한 판정(팀장 범위, 이슈 열람)을 그 사용자 기준으로 재사용 가능 |

외부 연동에서는 연동 담당자 한 명이 동의하는 구조가 자연스럽습니다. 앱 간 통신에서 단점이던 "토큰이 사람에게 묶임"이 여기서는 오히려 감사 추적의 근거가 됩니다.

### 3.4 고객이 통제할 수 있다

| 항목 | 내용 |
|---|---|
| 켜고 끄기 | 고객 관리자가 Atlassian Administration에서 사이트 단위로 켜고 끔. 끄면 모든 호출 중단 [공식] |
| 권한 범위 | scope로 읽기·쓰기 범위를 나눔 [공식] |
| 보안 심사 | 표준 OAuth 2.0이라 고객 보안 검토에서 설명하기 쉬움 |

---

## 4. 이 결정으로 감수하는 것

### 4.1 앱 간 웹트리거: Runs on Atlassian 자격 상실

| 위치 | 결과 | 근거 |
|---|---|---|
| 부르는 앱 | 실격. 상대 웹트리거 URL로 fetch하려면 egress 선언이 필요하고(*.atlassian-dev.net 등), Atlassian 도메인도 예외가 아님 | [공식: Runs on Atlassian, Manifest permissions], [실측 W1] |
| 받는 앱이 조회 응답을 줄 때 | 실격. 데이터를 담아 응답하려면 dynamic | [공식: Runs on Atlassian] |
| 받는 앱이 쓰기만 받을 때 | 유지 가능. static 응답 | [공식: Runs on Atlassian] |

양방향으로 서로 부르면 **승인 앱과 워크포스 모두 자격을 잃습니다.** API 라우트로 바꿔도 부르는 쪽 실격은 똑같아서, 이 점은 두 채널의 차이가 아닙니다.

주의: 승인 앱은 4.6.0에서 egress를 걷어내 자격을 회복했습니다. [실측-과거] 웹트리거 호출을 넣으면 다시 실격됩니다.

### 4.2 앱 간 웹트리거: 인증은 우리 책임

| 할 일 | 내용 |
|---|---|
| 서명 검증 | 본문 전체 대상, 기존 Ed25519 재사용 |
| 재전송 방지 | 발급 시각 유효 시간, 일회용 번호 |
| 검증 순서 | DB 조회보다 먼저. 위조 요청이 SQL 비용을 만들지 않게 |
| 권한 가드 | 웹트리거는 guardedDefine, PermissionMap 을 거치지 않음. 핸들러가 서비스 계층과 판정을 직접 사용 |
| URL 관리 | getUrl 로 게시, 유출 시 forceCreate 로 재발급, deleteUrl 로 폐기 [공식] |
| 불변식 8 | 응답은 asApp으로 읽은 데이터. 상대 앱에게만, 필요한 범위만 |

### 4.3 외부 API 라우트: 운영 부담

| 항목 | 내용 | 근거 |
|---|---|---|
| Preview | 계약서에 명시 | [공식] |
| 메이저 업그레이드 | 모듈 추가만으로 메이저, 고객 재승인 필요 | [실측-과거 2026-09-16] |
| custom scope | 환경당 20개, :custom 으로 끝남, 삭제·개명 불가 | [공식, 실측-과거] |
| 동의 URL 함정 | sns={appId}.{envId} 파라미터가 없으면 custom scope 미부여(403). 공식 튜토리얼에 없고 Developer Console의 Authorization URL generator 에만 있음 | [실측 R0', R2] |
| 토큰 갱신 | access 수명 3600초, 갱신 때마다 refresh token도 새 값 | [실측 R4] |
| 권한 가드 | 마찬가지로 우회됨. 핸들러에서 신원, 권한, 범위, 원가 가시성, 라이선스를 직접 검사 | [실측-과거] |

---

## 5. 한도

### 5.1 들어오는 요청 (웹트리거, API 라우트로 받을 때)

| 항목 | 제한 | 근거 |
|---|---|---|
| 요청 크기 | 5MB | [공식: 함수 실행 한도] |
| 응답 크기 | 약 5MB (5,242,880바이트) | 문서에 없음. 커뮤니티 측정과 에러 메시지 "Response must not exceed 5242880 bytes"로 추정 [미검증] |
| 실행 시간 | 웹트리거 최대 55초 | [공식: 함수 실행 한도] |
| 호출 빈도 | 설치당 분당 7,000회, 초당 300회 중 먼저 걸리는 쪽. 사용자당 분당 1,200회 | [공식: 함수 실행 한도] |
| 메모리 | 기본 512MB, 최대 1,024MB | [공식: 함수 실행 한도] |
| 웹트리거 URL 관리 API | getUrl 분당 1,000회, create·delete 분당 500회 | [공식: Web trigger 한도] |
| API 라우트 | 전용 한도는 문서에 없음. 일반 함수 한도를 적용받는 것으로 추정 | [미검증] |

### 5.2 나가는 요청 (우리 앱이 fetch로 외부를 부를 때)

| 항목 | 제한 | 근거 |
|---|---|---|
| 함수 1회 실행당 egress | 실행 시간 1분당 100회(올림). 넘으면 429와 FETCH_LIMIT_EXCEEDED | [공식: 함수 실행 한도], [커뮤니티: ECO-491] |
| 앱 전체 egress | 분당 50,000회 (requestJira 제외) | [공식: 함수 실행 한도] |
| 네트워크 요청 전체 | 앱당 분당 300만 회, 앱·사이트당 분당 10만 회 (requestJira 포함) | [공식: 함수 실행 한도] |
| 요청 1건 타임아웃 | async 이벤트에서 180초 | [공식: 함수 실행 한도, 검색 요약 기준] |
| 응답 크기 | 공식 수치 없음 | [미검증] |

### 5.3 우리 설계에 주는 영향

| 상황 | 영향 | 대응 |
|---|---|---|
| 앱 간 웹트리거 본문 | 200KB 정상 처리 [실측 W3]. 5MB 아래면 됨 | property 32KB 한도보다 훨씬 여유 |
| 스윕에서 상대 앱을 여러 번 부를 때 | 한 번 실행에 분당 100회 상한 | 큐 fan-out으로 나누거나 여러 건을 한 요청에 묶기 |
| 받는 쪽 웹트리거 | 55초 안에 끝나야 함 | 무거운 처리는 큐에 넣고 바로 응답 |
| 외부 API(API 라우트) 조회 | 응답 약 5MB 초과 불가 | 커서 기반 페이지 응답 |
| 위조 요청 폭주 | 위조 요청이 설치당 초당 300회 한도를 소진할 수 있음 | 서명 검증을 맨 앞에, 실패하면 즉시 거절 |

---

## 6. 남은 확인

| 번호 | 항목 | 왜 필요한가 |
|---|---|---|
| 1 | production 환경 웹트리거 URL 도메인 | egress 선언 주소 확정. development는 {appId}.hello.atlassian-dev.net [실측] |
| 2 | HMAC 인증 웹트리거 (forge webtrigger create --readSecretKey) | 플랫폼 인증이 있다면 서명 구현 범위가 달라짐 [미검증] |
| 3 | 부르는 앱에 forge eligibility 실행 | 4.1의 실격 판단을 직접 확인 |
| 4 | 웹트리거 호출 한도, 동시성, 응답 크기 5MB, API 라우트 전용 한도, fetch 응답 크기 (5장 미검증 항목) | 스윕 fan-out 설계, 외부 API 페이지 크기 |
| 5 | CLAUDE.md 확정 결정 "워크포스 연동 = 엔티티 프로퍼티 + 서명" 갱신 | 이 결정과 충돌 |
| 6 | 스파이크 정리: OAuth 앱 spike-app-channel-3lo 의 client secret 재발급 또는 삭제, 스파이크 앱 2개 제거 | 비밀 노출 정리 |

---

## 7. 출처

### Atlassian 공식 문서

| 문서 | 확인한 내용 | 링크 |
|---|---|---|
| Runs on Atlassian | 외부 도메인 선언(분석용 제외)과 dynamic 웹트리거는 실격. Atlassian 도메인은 fetch 허용 목록에 넣을 수 없음 | https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/ |
| Manifest permissions | fetch.backend 에 선언하지 않은 도메인 호출은 거부 | https://developer.atlassian.com/platform/forge/manifest-reference/permissions/ |
| Web trigger 모듈 | 인증 없음, static/dynamic, 버전 영향 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ |
| Web trigger 런타임 API | getUrl, queryUrls, deleteUrl, URL은 재배포해도 유지 | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/ |
| 함수 실행 한도 | 웹트리거 55초, 요청 5MB, 메모리, 호출 빈도, egress·네트워크 요청 수 | https://developer.atlassian.com/platform/forge/limits-invocation/ |
| Web trigger 한도 | getUrl 분당 1,000, create·delete 분당 500 | https://developer.atlassian.com/platform/forge/limits-web-trigger/ |
| API route 모듈 | Preview, JSON만, scope 필수 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/ |
| Forge app REST APIs | 3LO 전용, 관리자 활성화(기본 꺼짐), scope 환경당 20개, Runs on Atlassian 적격 | https://developer.atlassian.com/platform/forge/app-rest-apis/ |
| Jira entity properties | 값 최대 32,768바이트 | https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/ |

### 커뮤니티 자료 (비공식)

| 자료 | 내용 | 링크 |
|---|---|---|
| ECO-491 | 함수 1회 실행당 egress 100회 초과 시 429, FETCH_LIMIT_EXCEEDED | https://jira.atlassian.com/browse/ECO-491 |
| 웹트리거 요청 한도 문의 | 웹트리거 요청·응답 약 5MB 측정 보고 | https://community.developer.atlassian.com/t/whats-the-request-limit-for-webtriggers/78479 |
| 5242880 bytes 응답 제한 | 백엔드 응답 5MB 초과 시 에러 메시지 | https://community.developer.atlassian.com/t/how-to-work-around-the-response-must-not-exceed-5242880-bytes-in-size-limitation-in-forge-back-end-response/90107 |
| RFC-57 | egress 한도를 실행 1회당에서 분당으로 전환 계획 | https://community.developer.atlassian.com/t/rfc-57-long-running-forge-functions/82471/20 |

### 실측 기록

| 파일 | 내용 |
|---|---|
| C:\CloudJira\spikes\app-channel\RESULTS.md | 2026-10-19 웹트리거 W0~W6, API 라우트 R0~R4 |
| docs/worklog-approval/VALIDATION.md | 승인 앱 4.2.0 api.atlassian.com egress로 실격, 4.6.0 회복 |
| _workspace/stradvision-2026-10-13/codex-review-prompt.md | 2026-09-16 API 라우트 실측: 메이저 상승, 배지 유지, 무토큰 401, 가드 우회 |
