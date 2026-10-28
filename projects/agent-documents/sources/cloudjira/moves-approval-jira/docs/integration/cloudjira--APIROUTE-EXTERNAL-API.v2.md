# 외부 시스템 → Workforce 조직 조회 API — apiRoute + OAuth 2.0(3LO)

> **문서 성격** 내부 공유 + 고객 설명용 · **기준일** 2026-10-20 · **검증 환경** 개발 사이트(development)
> **관련 문서** 승인 앱 ↔ 워크포스 연동(webtrigger 채널) · 고객 연동 가이드(`moves-workforce/docs/external-api/README.md`)
> ℹ️ 정보 패널로: "§1~§4 는 고객과 공유할 수 있습니다. §5~§7 은 기술 검토자·연동 개발자용 상세입니다."

---

## 1. 한 장 요약

| 질문 | 답 |
|---|---|
| **무엇을 하나** | 고객의 인사·그룹웨어·BI·ERP(SAP 등) 시스템이 **Workforce의 조직 정보(사용자·팀·팀장)를 REST API로 읽습니다**. |
| **지금 열려 있는 API** | `GET /v1/organization/users`(사용자·소속 팀), `GET /v1/organization/teams`(팀·상위 팀·팀장·구성원). **읽기 전용**입니다. |
| **어떻게 인증하나** | Atlassian 공식 **OAuth 2.0(3LO)** 토큰. Atlassian 플랫폼이 토큰과 권한 범위(scope)를 먼저 확인한 뒤에만 앱으로 요청을 넘깁니다. |
| **얼마나 볼 수 있나** | **토큰 주인이 Workforce 화면에서 볼 수 있는 만큼만**입니다. 외부 API용 권한 로직을 새로 만들지 않고 화면과 같은 권한 검사를 그대로 거칩니다. |
| **어떤 정보는 안 나가나** | 이메일·급여·권한 세트·직무 역할·등급은 응답에 **없습니다**. 응답 필드는 명시적 허용 목록으로만 구성합니다. |
| **고객이 할 일** | ① 사이트 관리자가 앱 REST API 켜기 ② 연동 담당자가 OAuth 앱 만들기·권한 연결 ③ 토큰 주인 동의 ④ Secret 보관 — §3에 단계별 안내 |
| **검증 결과** | 개발 사이트에서 고객 설정 절차를 그대로 따라 하며 캡처, 호출 시나리오 **9종 모두 기대대로 동작**, 화면과 응답 대조 일치 |
| **한계** | Atlassian 기능이 **Preview** 단계입니다(정식 전 변경 가능). Isolated Cloud 고객은 쓸 수 없습니다. 첫 호출은 9~11초, 이후 약 2초입니다. |

---

## 2. 왜 이 방식인가

### 2.1 앱 간 연동과 외부 연동을 나눈 이유

| 구분 | 앱 ↔ 앱 (Approval ↔ Workforce) | 외부 시스템 → 앱 |
|---|---|---|
| 방식 | 서명된 webtrigger 채널 | **apiRoute + OAuth 3LO (이 문서)** |
| 호출자 | 같은 사이트의 우리 앱 | 고객이 운영하는 시스템 |
| 인증 주체 | 개발사가 관리하는 서명 키 | **고객이 만든 OAuth 앱 + 고객 사용자의 동의** |
| 고객 통제 | 연결 코드 붙여 넣기·해제 | 사이트 관리자가 켜고 끔, OAuth 앱 삭제·동의 철회로 즉시 차단 |

외부 시스템에는 **고객이 직접 열고 닫을 수 있는 문**이 필요합니다. apiRoute는 Atlassian이 토큰·scope를 검사해 주는 공식 경로라, 고객 보안팀이 Atlassian의 표준 OAuth 통제 체계를 그대로 적용할 수 있습니다.

### 2.2 다른 방법과 비교

| 방법 | 문제 |
|---|---|
| CSV 내보내기 후 수작업 업로드 | 사람 손이 필요하고 최신성이 떨어짐. 소량·비정기 연동에는 여전히 유효 |
| Jira REST API로 직접 조회 | Workforce의 팀·팀장 정보는 Jira가 아닌 앱 저장소에 있어 조회 불가 |
| 개발사 서버를 거치는 API | 고객 데이터가 Atlassian 밖으로 나감 — 채택하지 않음 |
| **apiRoute + 3LO** | 고객 설정 부담이 있으나, 데이터가 Atlassian 안에 머물고 고객이 통제 |

---

## 3. 고객 관점 — 무엇을 하면 되나

### 3.1 설정 4단계

| 단계 | 누가 | 무엇을 | 비고 |
|---|---|---|---|
| ① 앱 REST API 켜기 | 사이트(조직) 관리자 | admin.atlassian.com › 연결된 앱 › Moves Workforce › REST API "사용" | **사이트마다 기본 꺼짐**. 끄면 즉시 모든 호출 차단. 화면에 기본 URL 표시 |
| ② OAuth 앱 만들기·권한 연결 | 고객 사이트 구성원(연동 담당자) | developer.atlassian.com › 내 앱 › OAuth 2.0 통합 생성 → 권한에 **Moves Workforce `read:organization:custom`** + Jira **`read:forge-app:jira`** 추가 | **외부 업체는 직접 만들 수 없음** — 고객 계정이 필요 |
| ③ 동의 | 토큰 주인(조직 조회 권한이 있는 사용자) | Developer Console의 **Authorization URL generator**가 만든 URL로 동의 | 무인 주기 실행이면 `offline_access` 추가 |
| ④ Secret·토큰 보관 | 연동 시스템 운영자 | Client Secret, refresh token을 비밀 저장소에 보관·회전 | §3.3 |

> 🖼️ (기존 캡처 유지: 관리자 REST API 켜기 / OAuth 앱 권한 연결 / 동의 화면 sns 포함 / 동의 화면 sns 없음)

**가장 흔한 실수** — 동의 URL에 `sns={appId}.{envId}` 파라미터가 빠지면 **동의는 성공한 것처럼 보이지만** Workforce 권한이 토큰에 빠져 403이 납니다. 공식 튜토리얼에는 없고 Developer Console의 URL generator에만 있습니다. 반드시 generator가 만든 URL을 쓰세요.

개발사가 고객에게 전달하는 값: `app-id`, `environment-id`. cloudId는 `https://<사이트>/_edge/tenant_info`로 조회합니다(토큰의 `accessible-resources`는 빈 목록으로 옵니다 — 실측).

### 3.2 보장하는 것

| 보장 | 근거 |
|---|---|
| 토큰 없이·가짜 토큰으로는 아무것도 못 봄 | Atlassian 게이트웨이가 401로 차단, 앱 코드에 도달하지 않음(실측 0.08~0.1초) |
| 권한(scope)이 빠진 토큰은 차단 | 게이트웨이가 403 `Missing required scopes` |
| 토큰이 권한을 넓히지 않음 | 응답 범위 = 토큰 주인의 Workforce 화면 권한(인력 관리 Read). scope는 "문을 여는 열쇠"일 뿐 "볼 수 있는 범위"를 늘리지 않음 |
| 다른 사이트의 데이터를 섞을 수 없음 | 신원은 플랫폼이 준 사용자·사이트로만 판정, 다른 사이트 cloudId가 섞이면 401 |
| 민감 정보 미노출 | 응답 필드 허용 목록(§5.3). 화면에 있는 급여·권한·역할·등급은 응답에 없음(실측 대조) |
| 읽기만 가능 | GET만 선언. 다른 메서드는 플랫폼이 404(앱 코드 미도달, 실측) |
| 고객이 즉시 차단 가능 | REST API 끄기 / OAuth 앱 삭제 / Secret 재발급 / 동의 철회 |

### 3.3 운영 시 주의

| 항목 | 내용 | 권장 |
|---|---|---|
| refresh token 회전 | 쓸 때마다 새 refresh token이 발급됨. 옛 값은 10분 재사용 구간 안에서 한 번 더 통과(공식 동작, 결함 아님) | 회전 결과를 **원자적으로** 저장 |
| 미사용 만료 | 90일 동안 안 쓰면 만료 → 재동의 필요 | 최소 월 1회 주기 호출 |
| 토큰 주인 퇴사·권한 변경 | 그 사람 권한으로만 조회되므로 응답이 줄거나 실패 | **연동 전용 계정**을 토큰 주인으로 권장 |
| 호출 한도 | 설치당 분당 7,000·초당 300, 사용자당 분당 1,200 | 429면 `X-Ratelimit-Reset`까지 대기 후 재시도 |
| 지연 | 첫 호출 9~11초, 이후 약 2초 | 타임아웃 30초 이상 |
| 필드 추가 | `v1`에는 필드 **추가만** 함 | 모르는 필드는 무시하도록 구현 |

### 3.4 자주 받는 질문

**Q. API 토큰(Basic 인증)으로는 안 되나요?**
A. Atlassian 공식 문서가 apiRoute 인증 수단으로 안내하는 것은 OAuth 2.0(3LO)뿐이고, API 토큰 사용은 언급이 없습니다. 저희도 3LO로만 검증했습니다.

**Q. 외부 연동 업체가 설정해 줄 수 있나요?**
A. OAuth 앱은 그 사이트 구성원만 만들 수 있습니다(Atlassian 정책). 업체에 고객 사이트 계정을 부여하거나, 고객 담당자가 ②단계를 직접 수행해야 합니다.

**Q. 승인 결과(인정 시간)도 API로 받을 수 있나요?**
A. 현재 열린 것은 Workforce 조직 조회입니다. **승인 결과·월별 인정 시간 API는 후속 개발 범위**이며, 그전까지는 기존 파일 출력(엑셀)으로 SAP 전달 자료를 제공합니다.

**Q. Preview라는데 운영에 써도 되나요?**
A. Atlassian은 Preview 기능의 폐기 예고 기간이 짧을 수 있다고 명시합니다. 저희는 ① 버전 경로(`/v1/`)로 계약을 고정하고 ② 응답 필드를 허용 목록으로만 내보내며 ③ Atlassian 변경 시 새 버전 경로를 추가해 대응합니다. 핵심 승인 업무는 이 API에 의존하지 않으므로, API가 멈춰도 승인·잠금 기능은 영향이 없습니다.

**Q. Isolated Cloud를 쓰는데요?**
A. Atlassian이 apiRoute를 Isolated Cloud에서 지원하지 않아 사용할 수 없습니다. 파일 출력으로 대체합니다.

---

## 4. 전체 구조

```
고객 시스템 ──(Bearer 3LO 토큰)──▶ {사이트}/gateway/api/svc/jira/apps/{appId}_{envId}/v1/organization/users
                                    │ Atlassian 게이트웨이: REST API 켜짐? 토큰 유효? scope 포함?
                                    ▼  (아니면 401/403 — 앱 코드에 도달하지 않음)
                             Workforce 함수 organization-users-read   (principal = 토큰 주인)
                                    │ 신원 = 플랫폼이 준 principal + installContext 만, query 검사
                                    ▼
                             기존 화면용 조회 로직 + 권한 가드(인력 관리 Read) — 화면과 같은 판정
                                    ▼
                             응답 필드 허용 목록만 반환
```

설계 원칙: **새 권한 로직을 만들지 않는다** — "화면에서 못 보면 API로도 못 본다".

---

## 5. 기술 상세 (검토자·연동 개발자용)

> Confluence에서는 이 장을 **확장(expand) 매크로**로 접어 두기를 권합니다.

### 5.1 기술적으로 가능한가

| 질문 | 답 | 근거 |
|---|---|---|
| Forge 앱이 외부에 REST API를 열 수 있나 | 가능 — manifest `apiRoute` 모듈(Preview) | 공식 [1] |
| 인증 | **3LO 토큰만**. 토큰 없으면 401 — 다른 Forge 앱이라도 통과하지 않음 | 공식 [2] · 사전 실측 |
| 호출자 신원 | 핸들러 `principal.accountId` = 토큰을 발급받은 사람, `installContext` = 사이트 | 사전 실측 |
| 권한 범위 | 개발사가 정의한 custom scope(`read:organization:custom`) + 고객 3LO 앱이 그 scope 연결 | 공식 [3] |
| 함정 | 동의 URL에 `sns={appId}.{envId}`가 없으면 custom scope 누락 → 403 | 사전 실측 · 이번 실측 #9 |
| 무인 주기 실행 | 동의 URL에 `offline_access` → refresh token, 회전 강제 | 공식 [4] |

### 5.2 공식 제약과 대응

| 제약(공식) | 대응 |
|---|---|
| **Preview** — 폐기 예고 기간이 짧을 수 있음 | `/v1/` 버전 경로, 응답 필드 허용 목록, 변경 시 v2 경로 추가 |
| Jira·Confluence 앱만, Isolated Cloud 불가 | Workforce는 Jira 앱 — 해당 없음. Isolated Cloud 고객은 파일 출력 |
| 사이트마다 기본 꺼짐, 끄면 즉시 차단 | 고객 가이드 1단계 |
| 3LO만, 토큰은 고객 동의 후 발급 | 연동 서버가 토큰·refresh 보관·회전 |
| 3LO 앱은 그 사이트 구성원만 생성 | 고객 담당자가 생성 |
| custom scope 앱·환경당 20개, **이름 변경·비활성화·삭제 불가** | 현재 `read:organization:custom` 1개(users·teams 공용). 실험용 `read:probe:custom`은 지울 수 없어 apiRoute에 매핑하지 않은 채 둠. 새 scope는 신중히 |
| scope는 환경별 등록, apiRoute 매핑 전에 등록 | 개발 환경마다 등록 확인, 운영은 배포 전 등록 |
| `application/json`만, 응답에 `statusCode` 필수 | GET만 선언 — 다른 메서드는 플랫폼 404 |
| 경로 와일드카드 `*`·`**`, query는 정확한 경로에 | 고정 경로 + query(`offset`·`accountId`) |
| 3LO 앱에 Forge 제품 scope `read:forge-app:jira` 필요 | 읽기 전용이라 `write:`는 넣지 않음 |
| Marketplace 배포 시 REST API ↔ scope 대응 개발자 문서 공개 | 고객 가이드의 요청·응답·오류 장을 공개 문서로 다듬어야 함 |
| `environment-id`·`app-id`는 고객에게 전달, cloudId는 `tenant_info` | §3.1 |
| apiRoute 앱도 다른 조건을 만족하면 Runs on Atlassian 가능 | Workforce는 webtrigger(dynamic)·egress로 이미 실격 |
| refresh token 회전·재사용 10분·미사용 90일 만료 | §3.3 |
| 실행 시간·크기·호출 한도(apiRoute 문서엔 수치 없음 → Forge 공통) | 페이지 크기 20명·10팀, 429는 `X-Ratelimit-Reset`까지 대기 |

### 5.3 구현 내용

| 항목 | 내용 |
|---|---|
| custom scope | `read:organization:custom` "Read organization teams and users" — 설명에 "인증된 사용자의 기존 Workforce 팀·사용자 관리 권한 안에서"를 명시(동의 화면에 그대로 표시) |
| 경로 | `GET /v1/organization/users`, `GET /v1/organization/teams` — 둘 다 위 scope 하나 |
| 핸들러 | ① 신원은 `principal.accountId`·`installContext`만(query의 accountId는 조회 대상일 뿐), 다른 사이트 cloudId 섞이면 401 ② query 허용 목록(`offset` 20의 배수, `accountId` 1명, 둘 동시·모르는 키 → 400) ③ 화면과 같은 권한 가드 ④ 실패 → 권한·라이선스 403, 없음 404, 그 밖 503(원인 문구 없음) ⑤ 응답 필드 허용 목록 |
| 테스트 | 신원·query·권한 거부(403)·필드 허용 목록 |

**응답 필드 — 사용자** `content.users[]`: `accountId`, `displayName`, `active`, `team{teamKey, teamName, isLeader}`
**응답 필드 — 팀** `content.teams[]`: `teamKey`, `teamName`, `parentTeamKey`, `leaderAccountId`·`leaderName`, `memberCount`, `members[]{accountId, displayName, isLeader}`, `membersTruncated`
**공통**: `content.page{offset, size, nextOffset, total/truncated}`, `content.limits`, `content.source = "WORKFORCE_API"`
**응답에 없는 것**: 이메일·급여·권한 세트·직무 역할·등급

---

## 6. 검증 — 방법과 결과

### 6.1 고객 설정 절차를 그대로 따라 하며 캡처 (dev, 2026-10-20)

| 단계 | 결과 |
|---|---|
| scope 등록·배포·업그레이드 | 개발 환경에 `read:organization:custom` 등록 |
| 관리자 App REST API 켜기 | "사용" + 기본 URL 표시 |
| OAuth 앱 + 권한 연결 | Moves Workforce 1개 + Jira `read:forge-app:jira` |
| 동의(sns 포함) | 동의 화면에 "In Moves … Read organization teams and users" 표시 |
| 동의(sns 없음) | Moves 항목 **없음** → 호출 시 403 |

> 🖼️ (기존 캡처 4장 + 호출 결과 캡처 유지)

### 6.2 호출 결과

| # | 요청 | 기대 | 결과 |
|---|---|---|---|
| 1 | 토큰 없음·가짜 토큰(사이트형·svc형) | 401 | ✅ 401 (0.08~0.1초) |
| 2 | 사용자 목록 | 200 | ✅ 200, 5명 (콜드 8.8초 → 1.9초) |
| 3 | 1명 / 없는 사람 | 200 / 404 | ✅ 200 / 404 `USER_NOT_FOUND` |
| 4 | `offset=20`(5명뿐) | 빈 페이지 | ✅ 200 `users:[]` |
| 5 | 잘못된 query | 400 | ✅ 400 `API_INVALID_QUERY` |
| 6 | POST·없는 경로 | 거부 | ✅ 404 (플랫폼, 앱 코드 미도달) |
| 7 | 같은 토큰으로 teams | 200 | ✅ 200 (같은 scope) |
| 8 | refresh 회전 | 둘 다 새 값 | ✅ 새 값. 옛 refresh도 10분 안 1회 통과(공식 재사용 구간) |
| 9 | sns 없는 토큰 | 403 | ✅ 403 `Missing: [read:organization:custom]` |

**화면 대조** — Workforce 설정 › 인력 관리의 5명과 응답이 이름·팀·팀장까지 일치. 화면에 있는 급여·권한·역할·등급은 응답에 없음.

### 6.3 운영 전 확인할 항목

| 항목 | 현재 상태 | 확인 방법 |
|---|---|---|
| 권한 없는 사용자 거부(403 `PERMISSION_DENIED`) | 단위 테스트로만 확인 | 인력 관리 Read가 없는 계정(예: Member 세트)으로 동의 → 호출 |
| 라이선스 없는 설치 | 미확인 | 운영 전 |
| production 환경 | 미확인 | 운영 전 |
| 여러 사이트에 동의한 토큰 | 미확인(코드는 다른 cloudId → 401) | 운영 전 |

### 6.4 다시 검증하려면 (내부)

1. 고객 가이드 1~3단계대로 켜기·OAuth 앱·동의.
2. 측정 도우미 스크립트: `consent`(동의 서버), `call <이름> <token|none|bogus|nosns> <site|svc> <GET> <경로>`, `refresh`. Client ID·Secret은 별도 파일에 사용자가 직접 저장하고, 스크립트는 값을 출력하지 않음. Git Bash에서는 `MSYS_NO_PATHCONV=1`.
3. 끝나면 검증용 OAuth 앱 삭제(또는 Secret 재발급), 동의 철회, 토큰 파일 삭제.

---

## 7. 앞으로의 범위

| 항목 | 상태 |
|---|---|
| Workforce 조직 조회(users·teams) | ✅ 개발 환경 구현·검증 완료 |
| Approval 승인 결과·월별 인정 시간 API | 후속 개발 (그전까지 파일 출력) |
| SAP 자동 전달 | 별도 개발 범위 — 고객 측 호출 프로그램·항목 매핑 합의 필요 |
| 쓰기 API | 계획 없음 |

## 8. 용어

| 용어 | 뜻 |
|---|---|
| apiRoute | Forge 앱이 외부에 REST API를 여는 manifest 모듈(Preview) |
| OAuth 2.0 3LO | 사용자가 동의해 외부 시스템에 토큰을 발급하는 3자 인증 방식 |
| scope | 토큰이 열 수 있는 API 범위. `…:custom`은 앱 개발사가 정의한 것 |
| refresh token | 만료된 접근 토큰을 다시 받는 장기 토큰. Atlassian은 쓸 때마다 회전 |
| `sns` | 동의 URL에서 대상 앱·환경을 지정하는 파라미터. 빠지면 custom scope 누락 |

## 각주

> 링크는 기존 Confluence 페이지 각주의 링크를 그대로 유지하세요.

1. API route (manifest)
2. Forge app REST APIs
3. Expose Forge app REST APIs
4. OAuth 2.0 (3LO) apps — Jira · Implementing the Refresh Token Flow
