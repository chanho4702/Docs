# 앱 간 통신 채널 실측 결과 (2026-10-19, tom-chkim-dev, development)

앱: `spike-app-channel-callee`(9794c535…), `spike-app-channel-caller`(4547268a…) — Developer Space `forge-sample-test-251229`.
측정 경로: curl → caller webtrigger(`spike-kick`) → **caller 백엔드 fetch(사용자 컨텍스트 없음, principal=null)** → callee.

## webtrigger

| # | 항목 | 결과 |
|---|---|---|
| W0 | curl → callee webtrigger | 200, 1.87s(콜드) |
| W1 | **caller 백엔드 → callee webtrigger** | **200**, 536ms(콜드). egress `*.atlassian-dev.net` 필요. UA `undici` |
| W1 | Ed25519 서명(Node `crypto`, Forge 런타임 v22.23.2) | 검증 성공 → P0 "Forge 런타임 Ed25519" 해소 |
| W2 | 본문 변조 | 서명 검증 실패로 감지 |
| W3 | 200KB 본문 | 200, 259ms, 서명 OK (property 32KB 한도 대비 여유) |
| W4 | 연속 5회 지연 | 120~396ms (평균 약 225ms) |
| W5 | callee 재배포 + upgrade 후 기존 URL | 그대로 동작 |
| W6 | 런타임 `webTrigger.getUrl('spike-wt')` | CLI 로 만든 URL 과 **동일** → 앱이 자기 주소를 상대에게 알려줄 수 있음 |
| — | callee 가 받는 context | `principal: null`, `installContext` 있음(사이트 ARI). 호출자 앱 신원 정보 없음 → 인증은 서명으로만 |
| — | URL 형식 | `https://{appId}.hello.atlassian-dev.net/x1/{27자}` (development). production 도메인은 미측정 |
| — | CLI 옵션 | `forge webtrigger create --readSecretKey`: "authenticated (HMAC) web trigger" 존재 — 미측정 |

## apiRoute

| # | 항목 | 결과 |
|---|---|---|
| R0 | curl, 토큰 없음 (api.atlassian.com / 사이트 gateway) | 401 `Unauthorized` |
| R1 | caller 백엔드, 토큰 없음 | 401 (59ms) — 플랫폼이 앱 신원으로 통과시켜 주지 않음 |
| R0' | 3LO 토큰(sns 없이 동의) | 403 `Missing required scopes ... [read:spike-echo:custom]` — 인증은 통과, custom scope 미부여 |
| R2 | 3LO 토큰(동의 URL 에 `sns={appId}.{envId}`) curl | **200**. scope 이 `{appId}.{envId}:read:spike-echo:custom` 형태로 발급 |
| R3 | **caller 백엔드 → apiRoute (Bearer 3LO)** | **200**, 1.74~1.94s (webtrigger 대비 약 8배 느림) |
| R3 | callee 가 받는 context | `principal.accountId` = **토큰을 발급한 사용자**(Tom), `installContext` 사이트 ARI, `installation`{ari,contexts}, `license` null(development) |
| R4 | refresh 갱신 | 200. 매번 refresh·access 모두 새 값(회전 강제). access 수명 3600s |
| R4 | 옛 refresh 재사용(갱신 직후) | 200 — 즉시 거부되지 않음(유예 구간 추정, 문서 미확인). 최신 refresh 도 계속 유효 |
| — | 사이트 관리자 작업 | App REST API 활성화(사이트·앱별), OAuth 앱 생성·scope 연결·callback, 사용자 동의 |
| — | 함정 | 공식 튜토리얼에 없는 `sns` 파라미터가 없으면 custom scope 가 토큰에 안 들어간다(Developer Console 의 Authorization URL generator 에만 표시) |

## 결론 (approval ↔ workforce 내부 연동 관점)

| 기준 | webtrigger + Ed25519 | apiRoute + 3LO |
|---|---|---|
| 앱 백엔드끼리 호출 | 됨 (0.12~0.4s) | 됨 (1.7~1.9s) |
| 호출자 신원 | 없음 → 서명으로 "상대 앱"을 인증 | 토큰 주인 **사람 1명**의 accountId |
| 사용자 없는 경로(트리거·스윕) | 그대로 됨 | 저장된 refresh token 으로만. 토큰 주인이 퇴사·권한 상실하면 연동 정지 |
| 고객 설치 절차 | 상대 URL 교환(앱이 getUrl 로 자동 게시 가능) | 사이트 관리자 REST API 활성화 + OAuth 앱 + 동의 + client secret 보관 — **고객마다** |
| 비밀 보관 | 우리 개인키(이미 keyring 있음) | client secret + 회전되는 refresh token(갱신마다 원자적 저장) |
| 상태 | 오래된 모듈 | Preview |

내부 앱 간 통신에는 webtrigger 가 훨씬 단순하고 빠르다. apiRoute 는 "외부 시스템이 사용자 권한으로 조회"하는 공개 API 용도에 맞다.
미측정: production 환경 webtrigger 도메인, HMAC 인증 webtrigger(`--readSecretKey`), 호출 한도·동시성.
