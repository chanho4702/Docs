# 웹트리거와 API 라우트 질의응답

작성일: 2026-10-19
대상: moves-approval-jira(승인 앱), moves-workforce(워크포스)
관련 문서: WEBTRIGGER_VS_APIROUTE.md (같은 폴더)

근거 표기

- [공식] Atlassian 개발자 문서 (2026-10-19 조회, 링크는 7장)
- [실측] 개발 사이트에서 직접 확인한 결과
- [미검증] 아직 확인하지 않은 항목

---

## 요약

| 질문 | 답 |
|---|---|
| 웹트리거를 쓰면 인증을 전부 코드로 만들어야 하나? | 네. Forge는 웹트리거를 인증하지 않습니다 |
| 웹트리거를 쓰면 Runs on Atlassian 자격을 잃나? | 받는 쪽은 static이면 유지, dynamic이면 실격. 부르는 쪽 Forge 앱은 실격 |
| API 라우트도 똑같지 않나? | 앱끼리 부를 때는 똑같이 부르는 쪽이 실격. 차이는 인증을 누가 하느냐 |
| 웹트리거가 API 라우트 기능을 전부 대신할 수 있나? | 기능은 dynamic으로 흉내 가능. 신원·권한 범위·관리자 통제·자격 유지는 대신 못 함 |
| 웹트리거로 우리 앱 데이터를 조회·업데이트할 수 있나? | 가능. 쓰기는 static으로 자격 유지, 조회는 dynamic이라 실격 |
| 다른 Forge 앱이 호출하는 경우 | 서명 property 추천. 두 앱 모두 자격 유지 |
| 다른 플랫폼이 호출하는 경우 | API 라우트 추천. 조회·업데이트하면서 자격 유지 |

---

## 1. 웹트리거를 쓰면 인증을 전부 코드로 만들어야 하나?

네. Forge는 웹트리거 URL을 인증하지 않습니다. URL을 아는 사람은 누구나 호출할 수 있고, 사용자 컨텍스트도 없어서 asUser 호출이 안 됩니다. [공식: Web trigger 모듈]

우리가 직접 만들어야 하는 것

1. 서명 검증: 보낸 쪽이 진짜인지 확인
2. 재전송 방지: 발급 시각 유효 시간, 일회용 번호
3. 키 보관과 회전, URL 유출 시 재발급(getUrl의 forceCreate)과 폐기(deleteUrl) [공식: Web trigger 런타임 API]
4. 검증 순서: 위조 요청이 SQL까지 닿지 않게 DB 조회보다 먼저 검증

처음부터 만들 필요는 없습니다. 두 앱 사이에 이미 Ed25519 서명 체계(property의 sig 검증, writeGate.js)가 있어 재사용할 수 있습니다.

---

## 2. 웹트리거를 쓰면 Runs on Atlassian 자격을 잃나?

받는 쪽과 부르는 쪽이 다릅니다.

| 위치 | 자격 | 근거 |
|---|---|---|
| 받는 쪽, static 웹트리거 | 유지 | static 웹트리거만 허용 [공식: Runs on Atlassian] |
| 받는 쪽, dynamic 웹트리거 | 실격 | dynamic 웹트리거는 실격 항목 [공식: Runs on Atlassian] |
| 부르는 쪽 Forge 앱 | 실격 | 외부 도메인 fetch 선언은 분석용을 빼면 실격이고, Atlassian 도메인도 허용 목록에 넣을 수 없음 [공식: Runs on Atlassian] |
| 부르는 쪽이 외부 서버 | 해당 없음 | 우리 앱에서 밖으로 나가는 요청이 없음 |

---

## 3. API 라우트도 똑같지 않나?

앱끼리 직접 부르는 경우에는 똑같습니다. 부르는 쪽이 자격을 잃습니다.

### 같은 점: 자격

| 위치 | 웹트리거 | API 라우트 |
|---|---|---|
| 부르는 쪽 Forge 앱 | 상대 URL로 fetch, egress 선언, 실격 [공식] | api.atlassian.com 으로 fetch, egress 선언, 실격 [공식, 실측 승인 앱 4.2.0] |
| 받는 쪽 | static이면 유지 [공식] | 유지 [공식, 실측] |

### 다른 점: 누가 문을 지키는가

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 인증 | 우리 코드 [공식] | Atlassian 게이트웨이가 OAuth 3LO 토큰과 scope 검사 [공식: Forge app REST APIs] |
| 위조 요청 비용 | 우리 함수가 매번 실행됨 | 토큰이 없으면 게이트웨이에서 401, 함수 실행 안 됨 [실측 2026-09-16] |
| 호출자 준비 | URL, 서명 키 | 3LO 동의 토큰, 고객 관리자의 App REST APIs 활성화 [공식: Forge app REST APIs] |
| 응답 | static이면 고정 응답만 [공식] | JSON [공식: API route 모듈] |
| 성숙도 | 정식 | Preview [공식: API route 모듈] |

### 정리

| 상황 | 판단 |
|---|---|
| 앱끼리 | 둘 다 부르는 쪽이 실격. API 라우트는 토큰이 사람에게 묶이는 문제까지 더해져 더 불리 |
| 외부 시스템이 우리를 부름 | 자격 문제 없음. 인증을 플랫폼이 해 주고 조회가 가능한 API 라우트가 유리 |

---

## 4. 웹트리거가 API 라우트 기능을 전부 대신할 수 있나?

기능은 dynamic 웹트리거로 거의 흉내 낼 수 있습니다. 하지만 플랫폼이 대신 해 주던 일을 우리가 떠안고, 자격도 잃습니다. static 웹트리거는 고정 응답만 돌려주므로 조회 API가 될 수 없습니다. [공식: Web trigger 모듈]

### 웹트리거로도 되는 것 (dynamic 기준)

| API 라우트 기능 | 웹트리거 | 근거 |
|---|---|---|
| 메서드 구분 | event.method | [공식: Web trigger 이벤트] |
| 경로별 엔드포인트 | event.userPath 로 분기 | [공식: Web trigger 이벤트] |
| 쿼리 파라미터, JSON 응답 | queryParameters, 자유 응답 | [공식: Web trigger 이벤트] |
| 실행 한도 | 최대 55초, 페이로드 5MB | [공식: 함수 실행 한도] |

### 웹트리거로는 대신 못 하는 것

| API 라우트가 해 주는 것 | 웹트리거로 하려면 |
|---|---|
| 호출자 신원(Atlassian 사용자 기준, accountId 전달은 [미검증]) | API 키를 발급해 사용자와 연결. 사실상 인증 서버를 직접 만듦 |
| scope로 읽기·쓰기 범위 제한 | 키마다 권한 표를 직접 관리 |
| 고객 관리자가 Atlassian 관리 화면에서 켜고 끄기 [공식] | 우리 설정 화면에 끄기·폐기 기능 구현 |
| 게이트웨이 단계에서 위조 요청 차단 | 위조 요청도 매번 함수 실행 |
| 동적 응답을 하면서 자격 유지 | dynamic이면 실격 |
| 표준 OAuth로 고객 보안 심사 설명 | 자체 방식이라 설명 부담 |

### 웹트리거만 되는 것

| 장점 | 설명 |
|---|---|
| 정식 기능 | API 라우트는 Preview라 폐기 예고 기간이 짧을 수 있음 [공식] |
| 고객 준비가 거의 없음 | 관리자 활성화, 사용자 동의 불필요 |
| JSON 외 형식 | API 라우트는 application/json 만 [공식] |
| OAuth를 못 하는 호출자 | URL만 받는 외부 웹훅도 연결 가능 |

---

## 5. 웹트리거로 우리 앱 데이터를 조회·업데이트할 수 있나?

가능합니다. 웹트리거 핸들러도 우리 앱 안에서 실행되는 함수라서 Forge SQL과 KVS를 읽고 쓸 수 있고, asApp으로 Jira API도 부를 수 있습니다.

### 조회와 업데이트는 조건이 다름

| 작업 | 형태 | 받는 쪽 자격 |
|---|---|---|
| 업데이트 | static. 함수 안에서 저장하고, 미리 정한 결과(ok, invalid, unauthorized, conflict 등) 중 하나를 응답 | 유지 |
| 조회 | 데이터를 응답에 담아야 해서 dynamic | 실격 |

static 응답에는 새로 만든 id 같은 값을 담을 수 없습니다. 그래서 쓰기는 호출하는 쪽이 id를 정해 보내는 멱등 방식으로 설계합니다.

### 우리가 떠안는 일

1. 인증과 신원: API 키 발급, 키와 사용자 연결, 폐기
2. 권한 가드 우회: guardedDefine, PermissionMap 이 적용되지 않음. 핸들러가 resolver와 같은 서비스 계층을 쓰고 권한 판정을 직접 수행
3. 불변식 유지: SQL을 바로 고치지 말고 서비스 계층을 거쳐 CAS(rev = rev + 1), 승인자 행 규칙, 감사 이벤트를 지킴
4. 감사 기록: 사용자 컨텍스트가 없으니 변경자를 키 id 기준으로 기록
5. 불변식 8 충돌: 조회 응답은 asApp으로 읽은 데이터를 밖으로 내보내는 것이라 공개 범위 정책이 별도로 필요
6. 위조 요청 비용: 서명 검증을 DB 조회보다 먼저

### 같은 일을 API 라우트로 하면

| 항목 | 웹트리거 | API 라우트 |
|---|---|---|
| 조회하면서 자격 유지 | 불가 | 가능 |
| 쓰기하면서 자격 유지 | static으로 가능 | 가능 |
| 인증과 신원 | 직접 구현 | OAuth 3LO |
| 권한 가드 | 직접 구현 | 이것도 직접 구현(우회됨) [실측] |
| 준비 작업 | 거의 없음 | 관리자 활성화, 3LO 동의 |
| 성숙도 | 정식 | Preview |

---

## 6. 호출자별 결론

### 6.1 다른 Forge 앱이 우리 데이터를 조회·업데이트

다른 Forge 앱이 HTTP로 우리를 부르면, 방식과 상관없이 부르는 앱이 자격을 잃습니다. [공식: Runs on Atlassian]

| 방식 | 조회 | 업데이트 | 우리 앱 | 상대 앱 | 비고 |
|---|---|---|---|---|---|
| 1. 서명 property | 우리가 property에 게시, 상대가 읽음 | 상대가 서명된 요청 문서 게시, 우리가 검증 후 반영 | 유지 | 유지 | 즉시 반영 아님 |
| 2. 웹트리거 | dynamic | static | 조회하면 실격 | 실격 | Ed25519 재사용 |
| 3. 조회는 property, 쓰기는 static 웹트리거 | property | static 웹트리거 | 유지 | 실격 | 1과 2의 절충 |
| 4. API 라우트 | 가능 | 가능 | 유지 | 실격 | 3LO 토큰이 사람에게 묶여 무인 통신에 부적합 |

**추천: 1번 서명 property.** 두 앱 모두 자격을 지키는 방법은 이것뿐입니다. 즉시 반영이 꼭 필요하면 3번이 차선이고, 이때 부르는 앱의 자격 상실은 사업 판단으로 정합니다.

entity property의 값 하나는 최대 32KB이므로 큰 데이터는 나눠서 게시합니다. [공식: Jira entity properties]

참고: Forge 앱끼리 egress 없이 서로 부르는 공식 기능은 이번 조사에서 찾지 못했습니다. [미검증]

### 6.2 다른 플랫폼(SAP, 사내 서버 등)이 우리 데이터를 조회·업데이트

외부 서버가 부르는 경우라 우리 앱에 egress가 생기지 않습니다.

| 방식 | 조회 | 업데이트 | 우리 앱 자격 | 인증 |
|---|---|---|---|---|
| 1. API 라우트 | 가능 | 가능 | 유지 | OAuth 3LO(플랫폼 검사) |
| 2. 웹트리거 | dynamic, 실격 | static, 유지 | 조회하면 실격 | API 키·서명 직접 구현 |

**추천: 1번 API 라우트.** 조회와 업데이트를 하면서 자격을 지킬 수 있는 방식은 이것뿐입니다.

주의할 점

1. 3LO 토큰은 사람에게 묶입니다. 외부 연동 전용 Jira 사용자를 두고 그 사용자가 동의하게 합니다. 토큰 갱신은 외부 시스템이 맡습니다.
2. 고객 관리자가 App REST APIs를 켜야 합니다. 기본은 꺼짐입니다. [공식: Forge app REST APIs]
3. 모듈을 추가하기만 해도 메이저 업그레이드가 됩니다. [실측 2026-09-16]
4. Preview 기능이라는 점을 계약에 명시합니다. [공식: API route 모듈]
5. custom scope는 환경당 20개이고, 이름은 :custom 으로 끝나야 하며, 삭제·개명이 안 됩니다. [공식: Forge app REST APIs, 실측]
6. 핸들러에 호출자 accountId가 오는지 [미검증]. 결과에 따라 권한 설계가 갈립니다.
7. 상대 플랫폼이 OAuth를 못 하면 웹트리거가 대안입니다. 쓰기는 static으로 자격 유지, 조회까지 하면 실격입니다.

### 6.3 두 경우 공통

웹트리거와 API 라우트 모두 우리 권한 가드를 거치지 않습니다. [실측] 핸들러가 resolver와 같은 서비스 계층과 권한 판정을 다시 써야 불변식이 지켜집니다.

---

## 7. 공식 문서 링크

| 약칭 | 확인한 내용 | 링크 |
|---|---|---|
| Runs on Atlassian | 실격 조건: 외부 도메인 선언(분석용 제외), remote, dynamic 웹트리거. Atlassian 도메인 fetch 허용 불가. static 웹트리거만 허용 | https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/ |
| Web trigger 모듈 | 인증 없음, asUser 불가, static/dynamic, 버전 영향 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ |
| Web trigger 이벤트 | method, path, userPath, headers, queryParameters, body. 형식 오류 시 500 | https://developer.atlassian.com/platform/forge/events-reference/web-trigger/ |
| Web trigger 런타임 API | getUrl(forceCreate), queryUrls, deleteUrl | https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger-api/ |
| Web trigger 한도 | get 분당 1,000, create·delete 분당 500 | https://developer.atlassian.com/platform/forge/limits-web-trigger/ |
| 함수 실행 한도 | 웹트리거 55초, 페이로드 5MB, 설치당 분당 7,000·초당 300 | https://developer.atlassian.com/platform/forge/limits-invocation/ |
| API route 모듈 | Preview, application/json 만, scope 필수 | https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/ |
| Forge app REST APIs | 3LO 전용, 관리자 활성화(기본 꺼짐), scope 환경당 20개, Runs on Atlassian 적격 | https://developer.atlassian.com/platform/forge/app-rest-apis/ |
| Jira entity properties | property 값 최대 32KB | https://developer.atlassian.com/cloud/jira/platform/jira-entity-properties/ |

### 실측 근거 (리포 안)

| 파일 | 내용 |
|---|---|
| docs/worklog-approval/VALIDATION.md | 승인 앱 4.2.0이 api.atlassian.com egress로 Runs on Atlassian 실격, 4.6.0에서 회복 |
| _workspace/stradvision-2026-10-13/codex-review-prompt.md | API 라우트 실측(2026-09-16): 메이저 상승, 배지 유지, 무토큰 401, 권한 가드 우회 |
