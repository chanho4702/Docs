# apiRoute(외부 REST) 개설·등록·검증 보고서 (실측, 2026-10-20)

- 대상 API: 워크포스 `GET /v1/organization/users` (apiRoute `organization-users-read-api`, custom scope `read:organization:custom`)
- 환경: tom-chkim-dev(cloudId `119d766c-47d4-4c52-9b89-72646f2bbc53`), 워크포스 moves-rms(Development) 10.1.0
  - appId `f8962f17-9f12-43d0-91f5-7f3a626c1bbf`, envId `6a429133-1034-43cc-8201-71fd054b1497`
- 호출자: 검증용 OAuth 2.0(3LO) 앱 `moves-workforce-api-verify`(Resource-level), 로컬 도우미 `evidence/apiroute/tools/wf3lo.js`
- 증거: `evidence/apiroute/` (번호는 아래 단계와 같다). accountId 는 앞 6·뒤 4 자만 남겼고, 토큰·Client Secret 은 증거에 없다.

고객용으로 다듬은 판: `C:\CloudJira\moves-workforce\docs\external-api\README.md`(캡처 `img/` 13장).

이 문서는 **고객 설치 가이드의 원본**(1~4장)과 **검증 결과**(5~7장)를 겸한다. 1장은 개발사(우리), 2~4장은 고객 사이트 관리자·연동 담당자가 하는 일이다.

## 1. 개발사: API 열기 (CLI)

| 단계 | 내용 | 증거 |
|---|---|---|
| 1-1 | custom scope 정의 `scope.yml` — `read:organization:custom` "Read organization teams and users", 설명에 "인증된 사용자의 기존 워크포스 팀·사용자 관리 권한 안에서" 명시 | 01 |
| 1-2 | `forge scope create` 로 환경별 등록(development·moves-rms 각각). 전/후 목록 | 02·02b·03·03b·04·04b |
| 1-3 | manifest `apiRoute` 에 경로·operation(GET)·scopes 선언 후 배포 | 05 |
| 1-4 | `forge install --upgrade` (scope 추가는 업그레이드 필요) | 06 |

- custom scope 는 **환경마다 따로** 만든다. 콘솔의 앱 선택 목록에도 같은 이름이 환경 수만큼 "DEVELOPMENT" 로 나온다(13) — scope 목록이나 기본 URL 의 envId 로 구분해야 한다(14b).
- moves-rms 에는 실험용 `read:probe:custom` 이 남아 있다. **custom scope 는 삭제·비활성화·이름 변경이 안 된다**(공식 [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/)) — apiRoute 에 매핑하지 않은 채 두고, 앱·환경당 20개 한도에서 1개를 쓴 것으로 본다.

## 2. 고객 사이트 관리자: App REST API 켜기

admin.atlassian.com → 조직 → 앱 → 사이트 → (사이트) → **연결된 앱** → 앱 검색 → 환경 펼치기 → **앱 세부 정보 보기** → 아래쪽 **앱 REST API** → "앱 REST API 사용으로 설정" → 확인.

| 화면 | 증거 |
|---|---|
| 연결된 앱 목록(검색 "Workforce") | 07 |
| 앱 세부(환경 moves-rms (Development), 버전 10.1.0, 앱 키) | 08 |
| 끈 상태 / 확인 창 — 이번에는 이미 켠 뒤라 **어제 스파이크 앱 화면으로 대체** | 09a·09b |
| 켠 상태 "앱 REST API **사용**" + 기본 URL | 09 |

- 기본 URL(사이트 gateway 형): `https://{site}.atlassian.net/gateway/api/svc/jira/apps/{appId}_{envId}`
- 같은 함수로 가는 다른 형: `https://api.atlassian.com/svc/jira/{cloudId}/apps/{appId}_{envId}` — 두 형 모두 아래 5장에서 같은 결과.
- 사이트 **감사 로그에는 켠 기록이 없었다**(지난 7일 0건). 누가 언제 켰는지 고객이 추적하려면 별도 기록이 필요하다.

## 3. 고객 연동 담당자: OAuth 2.0(3LO) 앱 만들기

Developer Console → My apps → Create → **OAuth 2.0 integration**.

| 단계 | 내용 | 증거 |
|---|---|---|
| 3-1 | 이름, 접근 유형 **Resource-level**(동의 때 고른 사이트 하나만), 약관 동의(사람) → Create. 상단 안내: 새 앱은 **refresh token 회전 강제** | 10·11 |
| 3-2 | Permissions → **Add Marketplace or custom app** → 사이트 → 앱(**MOVES-RMS** 확인) → scope `read:organization:custom` 만 | 12·13 |
| 3-3 | 추가 직후 기본 URL 표시(닫으면 다시 안 보여 줌, ID 로 재구성 가능). 제품 기본값이 confluence 라 **jira 로 바꿔야** Jira 용 URL 이 나온다 | 14·14b |
| 3-4 | Jira API → Add → Configure → Granular scopes → **`read:forge-app:jira`** 만 체크(바로 아래 `write:forge-app:jira` 는 체크하지 않음) → Save | 15 |
| 3-5 | 권한 요약: Jira API 1, Moves Workforce for Jira MOVES-RMS 1 | 16 |
| 3-6 | Authorization → OAuth 2.0 (3LO) Add → Callback URL 저장. 아래 **Authorization URL generator** 의 "Marketplace App" URL 끝에 `sns={appId}.{envId}` | 17 |
| 3-7 | Settings 의 Client ID·Secret 을 연동 서버에 보관(사람이 복사 — 이번엔 로컬 파일, 화면·로그에 남기지 않음) | — |

## 4. 사용자: 동의

동의 URL = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=…&scope=read:organization:custom read:forge-app:jira offline_access&redirect_uri=…&state=…&response_type=code&prompt=consent&sns={appId}.{envId}`

| 단계 | 내용 | 증거 |
|---|---|---|
| 4-1 | 동의 화면: "In Jira … View Forge app", **"In Moves … Read organization teams and users"**, Resource-level 안내, 개발 모드 경고, "0 users have consented" | 21·22 |
| 4-2 | 사이트 선택 + 권한 설명 펼침 — 우리 scope 설명("…within the authenticated user's existing Workforce team and user management permissions")이 그대로 보인다 | 23 |
| 4-3 | Accept(사람) → callback | 24 |
| 4-4 | 토큰 200, scope = `{appId}.{envId}:read:organization:custom offline_access read:forge-app:jira`, expires_in 3600, refresh 있음. `accessible-resources` 는 **빈 목록 `[]`** | 25 |

- `offline_access` 는 콘솔 generator URL 에 없다. 트리거·배치처럼 사람 없이 부르려면 연동 담당자가 직접 붙여야 refresh token 을 받는다.
- `accessible-resources` 가 비어 cloudId 를 토큰에서 알아낼 수 없다(Jira 클래식 scope 가 없어서로 추정). 연동 측은 cloudId 를 설정값으로 받거나 사이트 gateway 형 URL 을 쓴다.

## 5. 검증 결과

| # | 요청 | 기대 | 결과 | 증거 |
|---|---|---|---|---|
| T01·T02 | 토큰 없음(사이트형·svc형) | 401 | **401** `Unauthorized`, 0.08~0.1초 | 20 |
| T03·T04 | 가짜 토큰 | 401 | **401** | 20 |
| T10 | 목록, 사이트형 | 200 | **200**, 5명, 8,817ms(콜드) | 26 |
| T11·T12 | 목록, svc형·반복 | 200 | **200**, 1.9초 | 26 |
| T13 | `?accountId=` 1명 | 200 | **200**, 팀 A-2·팀장 | 27 |
| T14 | 없는 accountId | 404 | **404** `USER_NOT_FOUND` | 27 |
| T15 | `?offset=20`(5명뿐) | 200 빈 페이지 | **200** `users:[]`, `nextOffset:null`, `total:5` | 27 |
| T20 | `?offset=7` | 400 | **400** `API_INVALID_QUERY` | 27 |
| T21 | 모르는 키 `?email=` | 400 | **400** | 27 |
| T22 | `offset`+`accountId` 동시 | 400 | **400** | 27 |
| T23 | POST | 거부 | **404** 플랫폼 "No matching API route" (핸들러 미도달) | 27 |
| T24 | 없는 경로 | 거부 | **404** 플랫폼 | 27 |
| T25 | `/v1/organization/teams` 같은 토큰 | 200 | **200**, 10.8초(콜드) | 27 |
| T30 | refresh 회전 후 호출 | 200 | access·refresh **둘 다 새 값**, 200 | 28 |
| — | **옛 refresh 재사용**(회전 직후, 10분 안) | 공식 문서상 10분 재사용 허용 | **200(새 토큰 발급)** — 스파이크 R4 와 동일, 문서와 일치 | 28 |
| T40·T41 | `sns` 없이 동의한 토큰 | 403 | 동의 화면에 Moves 항목 없음(30), 토큰 scope `offline_access read:forge-app:jira`(31), **403** `Missing required scopes … Missing: [read:organization:custom]` | 30·31·32 |
| T42 | 그 뒤 원래 토큰 | 200 | **200** — 같은 사용자의 재동의가 기존 custom scope 토큰을 무효화하지 않음 | 32 |

**화면 대조(29):** 워크포스 설정 > 인력 관리의 5명과 API 응답이 이름·팀·팀장 표시까지 일치. 응답 필드는 `accountId·displayName·active·team{teamKey,teamName,isLeader}` 뿐이고 화면에 있는 급여 범위·권한·직무 역할·등급은 **응답에 없다**. Callie 는 `active:false`(Jira 계정 비활성) — 화면에는 이 구분이 없다.

## 6. 발견

| # | 심각도 | 내용 | 조치 |
|---|---|---|---|
| A1 | 낮음(문서화된 동작) | **옛 refresh token 이 회전 직후 한 번 더 통과**(오늘·어제 모두). 공식 문서의 "Reuse interval or leeway" 기본 **10분** — 그 안에선 도난 감지 미적용(동시성 대비), 미사용 90일 만료[^s-oauth] | 결함 아님. 연동 측은 회전 결과를 원자적으로 저장, 10분 구간에 기대지 않는다. 가이드에 명시 |
| A2 | 중(UX) | `sns` 누락이 조용히 실패 — 동의는 성공하고 호출만 403. 공식 튜토리얼에 없음 | 고객 가이드에 generator 의 "Marketplace App" URL 을 쓰라고 명시, 403 메시지 예시 첨부 |
| A3 | 관찰 | 콜드 8.8~10.8초, 이후 1.9~2.7초 | 외부 연동 타임아웃은 15초 이상 권장. webtrigger(0.2~2초)보다 느림 — 설계 판단과 일치 |
| A4 | 관찰 | 고객 쪽 사람 작업 4단계(REST API 켜기·OAuth 앱·scope 연결·동의) + Secret 보관. 사이트 감사 로그에 REST API 켜기 기록 없음 | 가이드 |
| A5 | 낮음 | `accessible-resources` 가 빈 목록 | 연동 측 cloudId 는 설정값 |
| A6 | 낮음 | moves-rms 에 실험 scope `read:probe:custom` 잔존 — custom scope 는 삭제 불가(공식) | 매핑하지 않고 둔다. production 에는 만들지 않는다 |

## 7. 미측정·남은 일

- **권한 없는 사용자 거부(보류, 사용자 결정 "나중에")**: 대상 계정은 김찬호(`chanho9611`, 워크포스 **Member** 세트 — 인력 관리 Read 없음, 33). 그 계정으로 같은 OAuth 앱에 동의 → 호출 → 403 `PERMISSION_DENIED` 기대. 검증 OAuth 앱이 Distribution **Not sharing** 이라 소유자 외 동의가 막힐 수 있다(막히면 그 자체가 가이드 항목). 도우미는 `consent member` / `call … member …` 로 준비돼 있다. 지금은 `UsersReadApi.test.js`(PERMISSION_DENIED→403) 단위 테스트로만 확인.
- 라이선스 없는 설치(`context.license`), production 환경, 사이트 2개 이상에 동의한 토큰.
- 정리: 검증 OAuth 앱 `moves-workforce-api-verify` 삭제(또는 Secret 재발급), 로컬 `C:\CloudJira\spikes\wf-apiroute\.client`·`.token*.json` 삭제, 사용자 계정 "연결된 앱"에서 동의 철회. (A6 scope 는 지울 수 없음)

## 8. 출처

| 주장 | 근거 |
|---|---|
| App REST API 는 Preview·Jira/Confluence 만, 사이트마다 기본 꺼짐, 연결된 앱에서 켬, 끄면 즉시 차단, 기본 URL 두 형식 | 공식 [Access REST APIs exposed by a Forge app](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) · [Forge app REST APIs](https://developer.atlassian.com/platform/forge/app-rest-apis/) + 실측 07~09·T10/T11 |
| `apiRoute`·custom scope(`custom-scopes.yaml`, 환경별 등록) | 공식 [Expose Forge app REST APIs](https://developer.atlassian.com/platform/forge/expose-forge-app-rest-apis/) · [API route](https://developer.atlassian.com/platform/forge/manifest-reference/modules/api-route/) + 실측 01~06 |
| 3LO 앱에 custom app scope + `read:forge-app:jira`, 콘솔의 동의 URL 사용 | 공식 [Access REST APIs exposed by a Forge app — Step 2](https://developer.atlassian.com/platform/forge/access-rest-apis-exposed-by-a-forge-app/) + 실측 13~17 |
| **`sns` 없으면 custom scope 누락 403** | **공식 문서 설명 없음** — 콘솔 generator URL(17) + 실측 T40·T41(스파이크 R0' 재현) |
| 동의 URL 파라미터·`state`·`prompt=consent`·code 교환·`offline_access`·회전·재사용 10분·미사용 90일 | 공식 [OAuth 2.0 (3LO) apps — Jira](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) · [Implementing the Refresh Token Flow](https://developer.atlassian.com/cloud/oauth/getting-started/refresh-tokens/) + 실측 25·28 |
| 응답 시간·`accessible-resources` 빈 목록·감사 로그 무기록·권한 필드 제외 | 실측만 |

[^s-oauth]: [OAuth 2.0 (3LO) apps — Jira Cloud platform](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) 의 refresh token 설정 표.

## 9. 측정 중 실수(재현할 때 주의)

- Git Bash 가 `/v1/...` 인자를 Windows 경로로 바꿔 첫 호출들이 잘못된 URL 로 갔다(400 "Failed to parse UUIDs from appEnvId …C:"). `MSYS_NO_PATHCONV=1` 로 다시 측정했고 그 전 결과는 버렸다.
- 첫 마스킹이 `accountId` 키만 가려 요청 경로·`leaderAccountId` 에 원값이 남았다 → 형식 기준 마스킹(`tools/mask.js`)으로 고쳐 다시 저장.
