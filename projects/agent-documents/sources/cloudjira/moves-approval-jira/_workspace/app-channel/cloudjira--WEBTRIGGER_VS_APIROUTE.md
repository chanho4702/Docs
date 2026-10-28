# 웹트리거 vs API 라우트 검토

작성일: 2026-10-19
대상: moves-approval-jira(승인 앱), moves-workforce(워크포스)
범위: 두 앱 사이의 통신, 외부 시스템(SAP) 연동

근거 표기

- [공식] Atlassian 개발자 문서 (2026-10-19 조회)
- [실측] 개발 사이트에서 직접 확인한 결과
- [문서] 리포 안의 기존 결정 문서
- [미검증] 아직 확인하지 않은 항목

---

## 1. 결론

| 쓰임새 | 추천 | 이유 |
|---|---|---|
| 승인 앱과 워크포스 사이의 통신 | 지금처럼 서명된 entity property 유지 | 웹트리거든 API 라우트든 앱이 상대 앱을 HTTP로 부르는 순간, 부르는 쪽 앱이 Runs on Atlassian 자격을 잃는다 |
| 외부 시스템(SAP)이 데이터를 가져가는 경우 | API 라우트 (1차는 xlsx 추출) | 플랫폼이 OAuth 토큰을 검사해 주고, 조회 API로 쓸 수 있다. 호출자가 외부 시스템이라 우리 앱의 자격에는 영향이 없다 |
| 외부 시스템이 우리에게 이벤트를 보내는 경우 | static 웹트리거 | 받는 쪽만 static으로 만들면 자격이 유지된다. 단, 인증은 우리가 코드로 만든다 |

한 줄 요약: 앱끼리는 우편함(property)으로 주고받고, 밖에서 들어오는 요청에만 웹트리거나 API 라우트를 쓴다.

---

## 2. 자주 묻는 질문

### 웹트리거를 쓰면 인증을 전부 코드로 만들어야 하나?

네. Forge는 웹트리거 URL을 전혀 인증하지 않습니다. URL을 아는 사람은 누구나 호출할 수 있습니다. [공식]

우리가 직접 만들어야 하는 것은 다음과 같습니다.

1. 서명 검증 (보낸 쪽이 진짜인지)
2. 재전송 방지 (같은 요청을 다시 보내는 공격을 막는 발급 시각, 일회용 번호)
3. 키 보관과 회전, URL이 유출됐을 때의 재발급
4. 위조 요청이 SQL까지 닿지 않게 하는 순서 (검증을 DB 조회보다 먼저)

다만 처음부터 만드는 것은 아닙니다. 두 앱 사이에는 이미 Ed25519 서명 체계(property의 sig 검증, writeGate.js)가 있어서 이를 재사용할 수 있습니다.

### 웹트리거를 쓰면 Runs on Atlassian 자격을 잃나?

받는 쪽과 보내는 쪽이 다릅니다.

| 위치 | 자격 | 근거 |
|---|---|---|
| 받는 쪽, static 웹트리거 | 유지 | "static 웹트리거만 사용 가능" [공식] |
| 받는 쪽, dynamic 웹트리거 | 잃음 | dynamic 웹트리거는 실격 항목 [공식] |
| 보내는 쪽 (Forge 앱이 상대 웹트리거 URL을 fetch) | 잃음 | manifest에 외부 도메인(permissions.external.fetch)을 선언하면 실격. Atlassian 도메인도 예외로 허용되지 않음 [공식] |

즉 승인 앱이 워크포스 웹트리거를 부르면 승인 앱이 자격을 잃습니다. 반대 방향도 마찬가지입니다. 양방향이면 두 앱 모두 잃습니다.

API 라우트도 같습니다. 상대 앱의 API 라우트를 부르려면 api.atlassian.com 으로 나가는 fetch가 필요하고, 승인 앱 4.2.0이 바로 이 이유로 실격됐다가 제거한 4.6.0에서 회복했습니다. [실측]

결국 Forge 앱이 다른 Forge 앱을 HTTP로 직접 부르면, 방식과 상관없이 부르는 쪽이 자격을 잃습니다. 외부 시스템(SAP, curl 등)이 우리를 부르는 경우는 우리 앱에 egress가 생기지 않으므로 상관없습니다.

### API 라우트도 똑같지 않나?

앱끼리 직접 부르는 경우에는 똑같습니다. 부르는 쪽이 Runs on Atlassian 자격을 잃는다는 점에서 차이가 없습니다.

**같은 점: 자격**

| 위치 | 웹트리거 | API 라우트 |
|---|---|---|
| 부르는 쪽 (다른 Forge 앱) | 상대 URL로 fetch, egress 선언 필요, 실격 [공식] | api.atlassian.com 으로 fetch, egress 선언 필요, 실격 [공식, 실측 4.2.0] |
| 받는 쪽 | static이면 유지 [공식] | 유지 [공식, 실측] |

**다른 점: 누가 문을 지키는가**

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 인증 | 우리가 코드로 직접 구현 | Atlassian 게이트웨이가 OAuth 토큰 검사 |
| 위조 요청 비용 | 우리 함수가 매번 실행됨 | 게이트웨이에서 401로 차단, 함수 실행 안 됨 [실측] |
| 호출자 준비 | URL, 서명 키 | 사람이 동의해 받은 3LO 토큰, 고객 관리자의 활성화 |
| 응답 | static이면 고정 응답만 | 자유로운 JSON 조회 |

**정리**

| 상황 | 판단 |
|---|---|
| 앱끼리 (승인 앱과 워크포스) | 둘 다 부르는 쪽이 실격. API 라우트는 토큰이 사람에게 묶이는 문제까지 더해져 더 불리함. property 유지 |
| 외부 시스템이 우리를 부름 (SAP 등) | 우리 앱에 egress가 없어 자격 문제 없음. 인증을 플랫폼이 해 주고 조회가 가능한 API 라우트가 유리함 |

---

## 3. 웹트리거와 API 라우트 비교

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 성숙도 | 정식 [공식] | Preview, 폐기 예고 기간이 짧을 수 있음 [공식] |
| 인증 | 없음. 전부 우리 코드 [공식] | OAuth 2.0 3LO 토큰만 받음. 게이트웨이가 먼저 검사 [공식], 토큰 없으면 401 [실측 2026-09-16] |
| 사용자 정보 | 없음. asUser 불가 [공식] | 토큰 주인 기준. 핸들러에 accountId가 오는지는 [미검증] |
| 고객 관리자 작업 | URL 발급과 전달 | 사이트마다 App REST APIs 켜기 필수, 기본 꺼짐 [공식] |
| 호출자 준비물 | URL, 서명 규칙 | 3LO 연동 생성, 사용자 동의, 토큰 보관·갱신·철회 대응 [공식] |
| 응답 | static: 미리 정한 응답만. dynamic: 자유 [공식] | JSON만 [공식] |
| 버전 영향 | dynamic 첫 추가는 메이저, static은 마이너 [공식] | 모듈 추가만으로 메이저 [실측 2026-09-16] |
| 받는 쪽 Runs on Atlassian | static만 유지 [공식] | 유지 [공식, 실측] |
| 되돌리기 어려운 것 | 없음 | custom scope 환경당 20개, 삭제·개명 불가 [공식, 실측] |
| 우리 권한 가드 | guardedDefine, PermissionMap 우회 | 마찬가지로 우회 [실측]. 핸들러에서 직접 검사 |
| 실행 한도 | 최대 55초, 5MB, 설치당 분당 7,000·초당 300 [공식] | 일반 함수 한도 [공식] |
| 아무나 호출할 때 비용 | 우리 함수가 매번 실행됨 | 토큰 없으면 게이트웨이에서 차단, 함수 실행 안 됨 [실측] |

---

## 4. 우리 상황에 대입

### 4.1 승인 앱과 워크포스 사이

**API 라우트가 맞지 않는 이유**

1. 토큰이 사람에게 묶입니다. 3LO는 사용자가 동의해서 받는 토큰이고, 무인 앱 간 호출용 자격은 문서에 없습니다. [공식] 동의한 사람이 퇴사하거나 토큰이 철회되면 연동이 끊깁니다.
2. 콜백, 토큰 갱신, 재동의 운영을 모두 만들어야 합니다. 예전에 이 이유로 접었습니다. [문서]
3. 고객 관리자가 사이트마다 App REST APIs를 켜야 합니다. [공식]
4. 부르는 쪽이 Runs on Atlassian 자격을 잃습니다. [공식, 실측]

**웹트리거도 맞지 않는 이유**

1. 인증을 전부 직접 만들어야 합니다. [공식]
2. 조회용으로 쓰면 asApp으로 읽은 데이터를 돌려주게 되어 불변식 8(asApp 결과를 사용자에게 반환하지 않음)과 부딪힙니다.
3. 데이터를 담아 응답하려면 dynamic이어야 하고, dynamic은 받는 쪽도 실격입니다. [공식]
4. 설치마다 URL이 달라서 서로의 URL을 알려 줄 방법이 따로 필요합니다. [공식]
5. 부르는 쪽이 Runs on Atlassian 자격을 잃습니다. [공식]

**정정 사항:** 이전 초안에서는 지연을 줄이는 방법으로 static 웹트리거 "초인종" 추가를 권했습니다. 받는 쪽 자격은 유지되지만, 보내는 쪽이 fetch egress 때문에 자격을 잃는다는 것을 공식 문서로 확인했습니다. 그래서 권장안에서 뺍니다. 지연 문제는 2026-10-14에 넣은 즉시 게시(publishCtlNow)로 대응하고, 남는 지연은 읽기 시점 재조회와 일일 보정으로 메웁니다.

### 4.2 외부 시스템(SAP 월 1회)

1. 외부 시스템이 데이터를 가져가는 구조라 조회 API가 필요합니다. API 라우트가 맞습니다.
2. static 웹트리거는 고정 응답만 돌려주므로 가져가기용 API가 될 수 없습니다. [문서]
3. 이미 정한 순서는 1차 xlsx 수동 추출, 2차 API 라우트입니다. 담당은 워크포스입니다. [문서]
4. 남은 확인: 핸들러에 호출자 accountId가 오는지. 오면 기존 권한 판정을 재사용하고, 안 오면 scope를 권한 단위로 설계합니다. [미검증]

### 4.3 현재 작업 트리 주의

커밋하지 않은 변경 두 가지가 있습니다.

1. manifest.yml 에 https://api.atlassian.com backend egress 추가
2. WorkforceOrganizationApiController 를 CONTROLLER_REGISTRARS 에 다시 등록 (2026-10-15 "관리자 팀 조회 임시 재개")

이대로 배포하면 승인 앱이 Runs on Atlassian 자격을 다시 잃습니다. 근거는 4.2.0 실측 사례와 공식 실격 조건입니다. 계속 진행할지 먼저 결정하고, 배포 전에 forge eligibility 로 확인해야 합니다.

---

## 5. 도입한다면 준비할 것

### 외부 이벤트 수신용 static 웹트리거

- [ ] response type static, urlFormat v2
- [ ] 서명 검증: 본문 전체 대상, 발급 시각 유효 시간과 일회용 번호로 재전송 방지, DB 조회보다 먼저 검증
- [ ] 받으면 큐에 넣고 바로 응답 (55초 한도), 중복은 이벤트 id로 거르기
- [ ] 관리자 화면에서 URL 발급(getUrl), 재발급(forceCreate), 폐기(deleteUrl)
- [ ] 버전 영향 확인 (static은 마이너)

### SAP용 API 라우트

- [ ] Preview 기능이라는 점을 고객 계약에 명시
- [ ] custom scope 이름 확정 후 등록 (삭제·개명 불가)
- [ ] 고객 관리자용 App REST APIs 켜기 가이드
- [ ] 핸들러마다 신원, 권한, 범위, 원가 가시성, 라이선스를 직접 검사. resolver 판정 로직을 공용 함수로 분리
- [ ] 커서 기반 페이지 응답
- [ ] 메이저 업그레이드에 따른 고객 재승인 일정

---

## 6. 아직 확인하지 않은 것

스파이크 위치: C:\CloudJira\spikes\app-channel (결과 파일 RESULTS.md 는 2026-10-19 현재 없음)

| 번호 | 질문 | 영향 |
|---|---|---|
| 1 | 웹트리거 호출 때 context에 설치 정보가 오는가, 헤더 이름은 소문자인가 | 서명 검증 코드 기준 |
| 2 | API 라우트 핸들러에 토큰 주인의 accountId가 오는가 | SAP API 권한 모델 |
| 3 | Forge 런타임에서 Ed25519 서명 검증이 동작하고, 변조된 본문을 거부하는가 | 웹트리거 인증 구현 |

---

## 7. 출처

### Atlassian 공식 문서

| 문서 | 확인한 내용 | 링크 |
|---|---|---|
| Runs on Atlassian | 실격 조건: 외부 도메인 선언(분석용 제외), remote, dynamic 웹트리거. Atlassian 도메인 fetch 허용 불가 | https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/ |
| Web trigger 모듈 | 인증 없음, static/dynamic, 버전 영향 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ |
| Web trigger 이벤트 | 요청·응답 형식, 헤더 값은 배열, 형식 오류 시 500 | https://developer.atlassian.com/platform/forge/events-reference/web-trigger/ |
| Web trigger 런타임 API | getUrl, queryUrls, deleteUrl, URL 범위 | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/ |
| Web trigger 한도 | get 분당 1,000, create·delete 분당 500 | https://developer.atlassian.com/platform/forge/limits-web-trigger/ |
| 함수 실행 한도 | 웹트리거 55초, 5MB, 설치당 분당 7,000·초당 300 | https://developer.atlassian.com/platform/forge/limits-invocation/ |
| API route 모듈 | Preview, JSON만, scope 필수 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/ |
| Forge app REST APIs | 3LO 전용, 관리자 활성화, scope 20개, Runs on Atlassian 적격 | https://developer.atlassian.com/platform/forge/app-rest-apis/ |

### 리포 안 근거

| 파일 | 내용 |
|---|---|
| docs/worklog-approval/PROPERTY_INTEGRATION_DECISION.md | property 방식 선택 이유, 대체 방안 비교 |
| docs/worklog-approval/API_INTEGRATION.md | API 라우트 비활성 기록, 2026-10-14 제거 |
| docs/worklog-approval/VALIDATION.md | 4.2.0 egress로 Runs on Atlassian 실격, 4.6.0 회복 |
| docs/worklog-approval/WORKFORCE_APPROVAL_ARCHITECTURE.html | API 라우트 정의와 무인 자동 호출은 별개 |
| _workspace/stradvision-2026-10-13/codex-review-prompt.md | SAP 방식 비교, API 라우트 실측(메이저 상승, 배지 유지, 무토큰 401, 가드 우회) |
| CLAUDE.md | 불변식 8·9, 2026-10-10 유휴 SQL 비용 결정, 2026-10-14 즉시 게시 보정 |
