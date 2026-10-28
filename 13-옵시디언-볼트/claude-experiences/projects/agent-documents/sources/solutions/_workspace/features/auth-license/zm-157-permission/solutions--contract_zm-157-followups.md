# ZM-157 후속 계약 — 계정·보안 소형 묶음 + 권한 모델 마무리

> 문서 지도: [`features/auth-license/zm-157-permission/INDEX_zm-157-permission.md`](INDEX_zm-157-permission.md)

- 작성: 2026-09-17 · 브랜치 `ZM-157`(BE `C:/worktrees/zm-157-be`, FE `C:/worktrees/zm-157-fe`, AI `C:/worktrees/zm-157-ai`)
- 선행: `features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`, `features/auth-license/zm-157-permission/zm-157_permission-fix.md` 5·7장
- 사용자 결정(09-17): 범위 = 계정·보안 소형 묶음 + 권한 모델 마무리 / 이슈는 ZM-157에 이어서 / AI 툴 등급(closeProblem·delete_host_chart)은 현행 유지

## 범위

| # | 항목 | 담당 |
|---|---|---|
| A1 | 비밀번호 변경·재설정·비활성화·삭제 시 **MCP 연결도 끊김** | BE + AI |
| A2 | 일반 사용자 **마이페이지 저장·비밀번호 변경** 가능(관리자 전용 API 의존 제거) | FE (+BE 확인) |
| A3 | JWT **토큰 종류(`typ`) 구분** — access / otp / mcp | BE |
| A4 | 로그인 실패 제한에 **IP 기준** 추가 | BE |
| A5 | 운영에서 안 쓰는 `UserService.markEmailVerified` 정리 | BE |
| B1 | 역할 편집 화면에서 **효과 없는 칸** 비활성 표시 + 설명 | FE |
| B2 | `GET /hosts/{groupid}/reports`·`/reports/detail` **그룹 가시성 필터** | BE |
| B3 | **계정 상태 전용 API** 신설 + 관리자 수정의 "고치면 ACTIVE" 제거 + FE 사용자 목록 활성/비활성 동작 | BE + FE |

## A1. MCP 연결 회수

- BE가 MCP access 토큰 발급 시 사용자 세대(`REFRESH_GEN:<userId>`)를 클레임 `gen`으로 싣는다.
- `McpAccessInterceptor`는 요청마다 `gen == 현재 세대`를 확인한다. 다르면 **HTTP 401**(비활성·역할 변경과 같은 취급) → AI 서버는 기존 로직대로 캐시 폐기·재인증.
- 🔴 refresh 경로가 조용히 새 세대로 재발급하면 회수가 무력화된다. AI 서버는 grant(연결)를 만들 때 받은 `gen`을 grant에 저장하고, 토큰 갱신(`POST /internal/mcp/tokens`) 때 그 `gen`을 **기대 세대**로 넘긴다. BE는 현재 세대와 다르면 거부(기존 거부 코드 체계 사용) → AI는 그 grant를 폐기(사용자는 다시 연결).
- 필드 이름(고정): `POST /internal/mcp/tokens` 요청 본문에 선택 필드 **`expectedGeneration`**(long), 응답 `data`에 **`generation`**(long, 발급에 쓴 세대). 불일치 거부는 200 + `errorCode: MCP_GRANT_REVOKED`(신규).
- 최초 동의(consent) 시점의 발급은 기대 세대 없이 현재 세대로 발급하고, 그 값을 grant에 저장한다.
- 옛 grant(`gen` 없음)는 다음 갱신 때 현재 세대를 받아 저장하는 **1회 이행**을 허용할지, 거부할지 구현 시 결정하고 보고한다(권장: 거부 — 배포 후 1회 재연결, 재로그인 공지와 함께).
- AI 저장 형태 변경이 필요하면 AI Flyway 다음 번호(V8) 사용. V7과 같은 "구버전 병행 불가" 여부를 README 배포 절에 기록.

## A2. 마이페이지

- FE 마이페이지(`pages/setting/MyPage.tsx`)는 **모든 사용자**가 `PUT /users/my-profile`로 저장한다.
  - 본문: `{ fullname?, lastName?, email?, password?, currentPassword? }` — 비밀번호·이메일 변경 시 `currentPassword` 필수(BE `UpdateMyProfileDto`).
  - 실패: 200 + `errorCode: CURRENT_PASSWORD_INCORRECT` → 현재 비밀번호 필드 오류 표시.
  - 비밀번호 변경 성공 시 응답에 새 `refreshToken` 쿠키(Path=/auth)가 실리고 **다른 기기는 로그아웃**된다 → 안내 문구.
- 관리자용 `PATCH /users/zabbix-info/{id}`(다른 사용자 편집)는 그대로 둔다. 마이페이지가 Zabbix 전용 필드(Zabbix 사용자명 등)를 편집하고 있다면, 그 필드가 `my-profile`로 옮겨질 수 있는지 BE를 확인하고, 불가하면 관리자에게만 그 부분을 남긴다(보고).

## A3. 토큰 종류

- access 토큰에 `typ=access`, OTP 토큰에 `typ=otp`(이미 있으면 유지), MCP는 기존 `typ=mcp`.
- 인증 필터는 `typ ∈ {access, mcp}`만 인증 토큰으로 받는다. **`typ` 없는 토큰은 거부**(배포 직후 재로그인은 이미 공지 대상).
- OTP 검증 경로는 `typ=otp`만 받는다.

## A4. IP 기준 로그인 제한

- 기존 username 기준(15분 10회)에 **IP 기준**(기본 15분 50회, 설정값) 추가. 둘 중 하나라도 넘으면 기존과 같은 응답.
- 클라이언트 IP는 Spring의 신뢰 프록시 설정(`server.forward-headers-strategy` 등) 기준으로만 읽는다 — `X-Forwarded-For`를 직접 신뢰하지 않는다. 현행 설정을 확인해 보고.
- 비밀번호 찾기·OTP 재전송(`/auth/forgot-password`, `/auth/resend`)에도 IP 기준 제한을 건다(기존 감사 M4).

## B2. 그룹 리포트 가시성

- `GET /hosts/{groupid}/reports`·`/reports/detail`: 비관리자는 사용자 토큰으로 그 호스트 그룹을 볼 수 있을 때만 허용(없으면 200+403, 존재 여부 구분 없음). 미연동 비관리자는 거부. 관리자는 기존 그대로.

## B3. 계정 상태 API

`PATCH /users/{id}/status` — 관리자 전용(`AdminAccessChecker.requireAdmin`), `@VisitorIdCheck`.

| 요청 | `{ "status": "ACTIVE" \| "INACTIVE" }` |
|---|---|
| 성공 | 200 `ApiResult` — `data: { id, status }` |
| 사용자 없음 | 200 + `errorCode: USER_NOT_FOUND` |
| 자기 자신 | 200 + `errorCode: CANNOT_CHANGE_OWN_STATUS`(신규) |
| 관리자(ADMIN·SUPER_ADMIN) 비활성화 | 200 + `errorCode: CANNOT_DEACTIVATE_ADMIN`(신규) — 마지막 관리자 소실 방지 |
| 비활성 그룹 소속인데 ACTIVE 요청 | 200 + `errorCode: USER_GROUP_INACTIVE`(신규 또는 기존 코드) — 그룹을 먼저 활성화 |
| 같은 사용자의 다른 변경이 5초 넘게 진행 중(검수 3차) | 200 + `errorCode: FAILED_TO_ACQUIRE_LOCK` — 잠시 뒤 재시도 |

- INACTIVE: 사용자 행 잠금 아래 상태 변경 + 세션·refresh·MCP 일괄 폐기(A1 세대).
- 관리자 `PUT /users/{id}`는 **상태를 바꾸지 않는다**(비활성 그룹으로 옮기는 경우의 INACTIVE 전환은 유지).
- FE: 사용자 목록 행 동작에 "활성화 / 비활성화"(확인 모달, 비활성화 시 "모든 기기에서 로그아웃되고 MCP 연결이 끊깁니다"), 오류 코드별 안내. 권한은 관리자 판정(`isAdminUserRole`), 자기 자신·관리자 행은 비활성화 동작 숨김/비활성.

## B1. 역할 편집 화면

- 계약서 `features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md` 2.6의 **사용처 없음**(customDashboard·report·notification·mapView·settings.myPage) 칸과 **관리자 전용(체크박스 무효)**(settings.zabbixInfo·cloudInfraInfo, userManagement.*) 칸을 비활성 표시하고 이유 툴팁. BE 응답·저장 형식은 바꾸지 않는다(값 보존).

## BE 구현 결과 (2026-09-17, `C:/worktrees/zm-157-be`, HEAD `a2709d6` 위 미커밋)

검증: `:test --tests "*Test" --tests '*Test$*'` **3,330 green**(추가 반영 포함) · `:engine-zabbix:test` **126 green** · IT 미실행 · BE 런타임 미기동(재기동 금지 지시).

### A1. MCP 세대
- 토큰: `createMcpToken(..., generation)` → 클레임 **`gen`(long)**. `TokenUserInfo.mcpGeneration`(일반 토큰은 null).
- `McpAccessInterceptor`: 계정 상태·역할 확인 다음에 `gen == RefreshTokenService.currentGeneration(userId)` 확인. 다르거나 `gen` 없음 → **HTTP 401 `INVALID_TOKEN`**(요청당 Redis GET 1회, MCP만). 그 다음 기존 mcp_permission 판정(403).
- `POST /internal/mcp/tokens`
  - 요청 선택 필드 **`expectedGeneration`(Long)**. 없으면 동의(consent) 발급 — 현재 세대로 발급.
  - 응답 `data`에 **`generation`(long)** 추가(기존 필드 그대로).
  - 판정은 `UserService.mcpGrantLocked(userId, scope, expectedGeneration)` — **사용자 행 FOR UPDATE(대기 5초) → 조회 → 상태 → 권한 → 세대 읽기 → 대조**(로그인과 같은 규칙). JWT 서명은 잠금 밖(판정 뒤 폐기가 끼면 세대가 바뀌어 첫 요청이 401).
  - 거부: 기존 `USER_NOT_FOUND`(404)·`MCP_USER_INACTIVE`(403)·`MCP_PERMISSION_DENIED`(403) 문구·코드 그대로 + 신규 **`MCP_GRANT_REVOKED`(body code 401)** + 잠금 대기 초과 `FAILED_TO_ACQUIRE_LOCK`(body code 409). 모두 HTTP 200.
- 폐기 연동: 비밀번호 변경·재설정·이메일 인증 비밀번호 발급·비활성화(관리자 수정/그룹/상태 API)·삭제가 이미 `revokeAllForUser`(세대 +1)를 부르므로 추가 호출 없이 MCP도 끊긴다 — 실제 세대 저장소로 "발급 → revokeAll → 401"을 테스트로 고정.
- *(검수 D2로 변경: 이제 모든 발급에 `expectedGeneration` 필수 — 아래 "검수 1차 반영" 참조)* 옛 grant(`gen` 없음) 결정: **BE는 구분할 수 없다**(기대 세대 없는 요청 = 동의로 취급). 권장대로 **AI 서버가 거부**(gen 없는 grant는 갱신하지 말고 폐기 → 재연결)해야 한다. 배포 전 발급된 MCP access 토큰은 `gen`이 없어 첫 요청에서 401.

### A2. 마이페이지 (FE 확인 결과)
- 현재 FE 마이페이지는 **읽기도** 관리자 전용 `GET /users/zabbix-info/{id}`(fullname·lastName·zabbix_email·zabbix_user)를 쓴다 → 일반 사용자는 폼이 안 채워진다. **`GET /users/my-profile`에 `lastName`을 추가**했다(추가 필드). 이제 `fullname`·`lastName`·`email`·`username`을 my-profile 하나로 채울 수 있다.
- 쓰기 필드 대응: `zabbix_email→email`, `zabbix_password→password`, `fullname`, `lastName` 모두 `UpdateMyProfileDto`에 있음. `zabbix_user`는 원래도 값 변경이 아니라 비밀번호 변경의 조건일 뿐(username 변경 불가) → **옮길 필요 없음**. `zabbix_token`은 화면에서 쓰지 않음. `zabbix_password` 응답 필드는 원래 항상 null.
- Zabbix 반영: my-profile도 연동 계정이면 슈퍼어드민 토큰으로 `user.update`(name·surname·passwd)를 부른다 — zabbix-info와 동등.
- **완화**: `currentPassword`는 비밀번호가 있거나 **이메일이 현재 주소와 실제로 다를 때만**(대소문자 무시, 빈 문자열은 변경 아님) 요구한다. FE가 저장마다 이메일 칸을 그대로 보내도 된다.
- FE 주의: 비밀번호를 안 바꾸면 `password`를 **보내지 말 것**(현재 코드는 `data?.zabbix_password`=undefined라 결과적으로 안 보냄). 빈 문자열 `fullname`/`lastName`은 무시된다(지우기 불가 — 기존 관리자 경로와 같음).

### A3. 토큰 종류
- access `typ=access`, OTP `typ=otp`, MCP `typ=mcp`(상수 `JwtTokenProvider.TYP_*`).
- `parseToken`(인증 필터)은 access·mcp만 — 그 외(OTP·typ 없음)는 `JWTVerificationException` → **HTTP 401 `INVALID_TOKEN`**.
- `verifyOtpToken`은 otp만 — 그 외는 200 + **`OTP_WRONG`**. 배포 전에 발송된 재설정/인증 메일 링크(typ 없음)는 무효 → 다시 요청.

### A4. IP 기준 제한
- 설정 `app.auth.rate-limit.*`(`AuthRateLimitProperties`, env `AUTH_LOGIN_IP_MAX_FAILURES`=50 · `AUTH_LOGIN_IP_WINDOW_SECONDS`=900 · `AUTH_OTP_SEND_IP_MAX`=20 · `AUTH_OTP_SEND_IP_WINDOW_SECONDS`=900).
- 로그인: username(15분 10회)·IP(15분 50회) 중 하나라도 **실패** 누적이 한도면 `TOO_MANY_REQUESTS`. 실패 시 둘 다 증가, 성공 시 **username만** 리셋(IP는 유지 — 자기 계정 로그인으로 IP 제한을 푸는 것 방지). Redis 키 `RATE_LOGIN_IP:<ip>`.
- `/auth/forgot-password`·`/auth/resend`: **사용자 조회 전에** IP당 요청 수 증가(성공·실패 무관), 20 초과 시 `TOO_MANY_REQUESTS`. 키 `RATE_OTP_SEND_IP:<ip>`.
- IP는 `request.getRemoteAddr()`만. **현행 설정 확인: `server.forward-headers-strategy` 미설정(=NONE), RemoteIpValve·internal-proxies 설정 없음** → 지금은 직접 연결 주소. application.yml에 `forward-headers-strategy: ${FORWARD_HEADERS_STRATEGY:none}` 명시(동작 동일). 🔴 아파치 리버스 프록시 뒤 배포(실서버 구조)라면 모든 요청이 프록시 IP → 전 사용자가 한 카운터 공유(로그인 실패 50회로 전원 잠김 가능). **배포 시 `FORWARD_HEADERS_STRATEGY=native` 설정 필요**(프록시가 사설망이 아니면 `SERVER_TOMCAT_REMOTEIP_INTERNAL_PROXIES`도).

### A5. `markEmailVerified` 제거
- 운영 호출처 0건 확인(이메일 인증은 `verifyEmailOtpLocked` 한 경로) → `UserService.markEmailVerified(Integer, String)` 삭제. `User.markEmailVerified()`(엔티티 메서드)는 `verifyEmailOtpLocked`가 쓰므로 유지. 이 메서드를 부르던 테스트 3곳은 `verifyEmailOtpLocked`로 옮기고, 메서드 부재를 리플렉션으로 고정.

### B2. 그룹 리포트 가시성
- `HostGroupVisibilityChecker.requireVisible(user, groupId)` 신설(`HostVisibilityChecker`의 그룹판): 관리자 통과 · 미연동 비관리자 거부 · 숫자 아닌 id 거부(조회 없이) · 그 외 `InventoryPort.listGroups(ctx, GroupQuery.ofId(id))`(멤버 없음, 사용자 토큰)에 그 id가 없으면 거부.
- `GET /hosts/{groupid}/reports`·`/reports/detail`: 기존 `hostGroup.view` 판정 **다음에** 호출. 거부 = 200 + code 403 + `errorCode: FORBIDDEN`, 메시지 "이 호스트 그룹에 접근할 권한이 없습니다."
- 비용: 비관리자 호출당 Zabbix `hostgroup.get` 1회 추가(캐시 없음).

### B3. 계정 상태 API
- `PATCH /users/{id}/status` 본문 `UpdateUserStatusDto { status: ACTIVE|INACTIVE }`(@NotNull, 누락 → 200 + code 400 `INVALID_DATA`). 응답 `data: { id: number, status: "ACTIVE"|"INACTIVE" }`(`UserStatusResponseDto`). 비관리자 200 + code 403(메시지 "Access Denied", errorCode 없음 — 기존 `requireAdmin`과 동일).
- 신규 ErrorCode(engine-api): **`CANNOT_CHANGE_OWN_STATUS`**, **`CANNOT_DEACTIVATE_ADMIN`**, **`USER_GROUP_INACTIVE`** — 모두 `ApiError` 기본(HTTP 200, body code 400). `USER_NOT_FOUND`도 body code 400.
- 판정 순서(`UserService.changeUserStatus`): 자기 자신(잠그기 전) → 행 잠금 → 없음 → INACTIVE면 관리자(userRole ADMIN·SUPER_ADMIN) 거부 / 상태 저장 / `revokeAllForUser`(커밋 전) → ACTIVE면 비활성 그룹 소속 거부 / 상태가 다를 때만 저장(세션 유지). 같은 상태 재요청은 성공(INACTIVE 재요청은 폐기를 다시 한다).
- `PUT /users/{id}`: `applyUserUpdate`의 `resetStatus`(필드 수정 시 ACTIVE 재설정) 경로 삭제. 비활성 그룹으로 옮기면 INACTIVE + 폐기는 유지. → 비활성 그룹에서 활성 그룹으로 옮겨도 **자동 활성화되지 않는다**(상태 API로 활성화).
- MCP 경로 허용목록에 `/users/{id}/status` 없음(기존 `/users`와 같이 차단).

### 남은 위험(범위 밖, 기록만)
- **개별 비활성화가 다른 경로로 되살아난다** — 역할 삭제 경로(③)는 제거했다(아래 추가 반영). 남은 두 경로는 개인 차단 표식(마이그레이션)이 필요해 **사용자 결정 대상**으로 두고 고치지 않았다 *(→ 이후 사용자 결정으로 **B4에서 해결**, 아래 B4 절)*:
  - ① 사용자 그룹 수정 `PUT /users/user-groups/{id}` — `UserGroupService.java:240-246`: 요청 `status`가 있고 **기존 그룹 상태와 다르며** 대상 사용자 목록이 비어 있지 않으면, 대상 사용자 전원을 벌크 UPDATE(`:352 updateUsersStatus`). 요청이 ACTIVE면 **전원 ACTIVE**(개인 비활성 여부 무시). 대상 사용자는 요청 `userIds`가 있으면 그 목록, 없으면 현재 그룹 멤버(`:203-205`). 다른 비활성 그룹에 동시에 속해 있어도 ACTIVE가 된다.
  - ② Zabbix 동기화 `POST /users/sync`(및 `SYNC_ENABLED=true`일 때 10분 주기) — `ZabbixSyncServiceImpl.java:254-264 processUsersToUpdate`: userRole≠ADMIN이고 `zabbix_userid`가 있는 기존 사용자(`:180-182`) 중 Zabbix에 존재하는 전원에 대해, 그 사용자의 Zabbix 사용자 그룹 중 **동기화된 비활성 그룹이 하나도 없으면**(`:277-285 hasInactiveGroup`) status를 **무조건 ACTIVE**로 덮어쓴다. 신규 생성(`:240`)도 같은 규칙. MovesEye 전용 계정(zabbix_userid null)과 userRole=ADMIN은 대상 아님(SUPER_ADMIN은 대상).

### 추가 반영 (코디네이터 요청, 2026-09-17)
- **역할 삭제의 재활성화 제거(1차 검토 M4)** — `UserService.deleteRole`의 `update User set status = ACTIVE where refRole in :ids` 삭제. 상태는 건드리지 않는다. `refRole`(`zabbix_role` 컬럼)은 **현행 유지 = 삭제된 role id를 그대로 가리킨다**(dev DB 확인: `user` 테이블에 FK 없음 → 삭제가 막히거나 null로 바뀌지 않음). 권한 판정(`DmovePermissionChecker.load`)은 역할을 못 찾으면 빈 권한, `my-profile.role`/목록 `role`은 null(목록의 NON_NULL로 키 생략).
- **R1: `GET /users` 행에 `userRole` 추가** — `UserResponseDto.userRole`(`"ADMIN" | "SUPER_ADMIN" | "USER"`, 사용자 테이블 값, 없으면 null). 같은 DTO를 쓰는 `GET /users/{id}`·`POST /users`·`PATCH /users/zabbix-info/{id}` 응답에도 실린다(추가만, 기존 필드 불변). FE 활성/비활성 버튼 숨김은 이 값이 ADMIN·SUPER_ADMIN이면 숨김 — BE `CANNOT_DEACTIVATE_ADMIN` 판정과 같은 축. 참고로 `GET /users` 목록은 원래 `userRole != ADMIN` 필터가 있어 ADMIN 행은 나오지 않고 SUPER_ADMIN 행만 나올 수 있다.
- MCP 요청마다 DB 1회 + Redis 1회. Redis 장애 시 MCP 요청은 500(웹 세션도 같이 죽는 상황).
- 프록시 뒤 IP 판정(A4) — 배포 설정 전까지 IP 제한이 전역 제한처럼 동작할 수 있다.

### 검수 1차(D1~D8) 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,358건 중 실패 2건 = `ApmCollectorLiveRuntimeTest`(로컬 otelcol 환경, 이번 변경과 무관·지시대로 제외)** → 나머지 3,356 green · `:engine-zabbix:test` **126 green** · IT 미실행.

- **D1 이메일 정규화 단일화** — `user.EmailAddresses.normalize` = trim → NFC → `toLowerCase(Locale.ROOT)`. `CreateUserDto`·`UpdateUserDto`·`UpdateUserEmailDto`·`UpdateMyProfileDto`·`AdminCreateUserDto`의 `getNormalizedEmail()`과 관리자 `PATCH /users/zabbix-info/{id}`(저장·중복 검사)가 모두 이 함수를 쓴다. my-profile "이메일이 바뀌었나"도 같은 정규화 결과의 `equals`로 본다 → `me@s\u0131te.com`은 다른 주소 → 현재 비밀번호 필요(회귀 테스트). ASCII 주소는 기존 저장값(소문자)과 결과가 같아 `findFirstByEmail` 조회와 어긋나지 않는다(기본 로케일이 tr이어도 동일 — 테스트). 행동 변화: zabbix-info의 `zabbix_email`이 이제 소문자·trim 저장되고, 빈 문자열은 **갱신하지 않는다**(예전엔 `""`를 그대로 저장).
- **D2** — `GET /internal/mcp/users/{userId}/generation`(`x-internal-token`) → 200 `data: { generation }`, 없음 200 + `USER_NOT_FOUND`(body 404), 토큰 불일치 HTTP 403(기존 `/tokens`와 동일). `/internal/mcp/tokens`는 **`expectedGeneration` 필수** — 없으면 `MCP_GRANT_REVOKED`(body 401). 판정 순서: 사용자 없음 → 비활성 → 권한 → 세대(없음·불일치). 세대 조회는 잠금을 잡지 않는다(이후 폐기는 교환 때 대조가 잡는다).
- **D3 관리자·자기 자신 보호**
  - `PUT /users/{id}`: 비활성 그룹이 하나라도 포함된 `userGroupIds` → 대상이 ADMIN·SUPER_ADMIN이면 `CANNOT_DEACTIVATE_ADMIN`, 요청자 자신이면 `CANNOT_CHANGE_OWN_STATUS`. **그룹 교체·필드 변경·Zabbix `user.update` 전에** 거부. ⚠️ 이미 비활성 그룹에 속한 관리자를 폼으로 편집하면(폼이 그룹 목록을 그대로 보냄) 이 거부가 난다 — 그룹을 빼고 저장해야 한다.
  - 사용자 그룹 생성(INACTIVE)·수정(ACTIVE→INACTIVE) 벌크: **관리자와 요청자를 대상에서 빼고 진행**(거부하지 않음). 근거: 그룹 작업 자체는 정당하고 여러 사용자가 걸리므로 한 명 때문에 전체를 막으면 운영이 막힌다 — 보호 대상만 로컬 상태·세션을 유지. 단 Zabbix 쪽 그룹 `users_status=1`은 그대로 나가므로 **연동 관리자의 Zabbix 계정 자체는 Zabbix에서 비활성**이 될 수 있다(MovesEye 관리자 세션은 슈퍼어드민 토큰이라 영향 없음).
  - Zabbix 동기화: 기존 사용자 상태 재계산에서 ADMIN·SUPER_ADMIN은 INACTIVE로 바뀌지 않고 현재 상태 유지(ADMIN은 원래 대상 제외, SUPER_ADMIN만 해당). 동기화의 사용자 **삭제**(Zabbix에 없는 연동 계정)는 범위 밖 — 그대로다.
- **D4** — `HostGroupVisibilityChecker`는 `@Qualifier("zabbixInventoryAdapter")` 원 어댑터를 받는다(라이선스 데코레이터 우회). 근거: P17이 막는 것은 live **데이터**이고, 저장 리포트(P16 영구 조회)의 **접근권한 확인** 1콜은 대상이 아니다. fail-closed: 빈·null 응답, 소스 오류(`SOURCE_UNAVAILABLE` 등), 기타 예외(데코레이터의 `LiveQueryBlockedException` 포함)는 모두 200+403 거부. 인증 만료(`UNAUTHORIZED`)만 기존대로 401. **남는 제약**: ARCHIVED에서 Zabbix 자체가 내려가 있으면 일반 사용자의 저장 리포트는 거부된다(관리자는 영향 없음). 대안(우리 DB의 사용자그룹↔호스트그룹 미러로 판정)은 동기화 주기만큼 늦고 미러가 Zabbix 권한 규칙(상속·태그)을 다 담지 못해 채택하지 않았다. 실제 `LicenseGuardedInventoryPort`(ARCHIVED)로 회귀를 재현하는 테스트 포함.
- **D5** — BE 응답 유지: 잠금 대기 초과 = 200 + `FAILED_TO_ACQUIRE_LOCK`(body 409). 코드에 일시 장애 주석만 추가.
- **D6** — `RedisClientService.incrWithTtl`을 Lua 1회(`INCR` → 값이 1이거나 `TTL == -1`이면 `EXPIRE`)로 교체. 호출처는 `AuthRateLimiter`뿐(4곳). 로컬 Redis에서 `ZM157TEST:*` 키로 실측: TTL 없는 키(값 7) → 8·TTL 900 복구, 새 키 → 1·TTL 900, 남은 창(TTL 50)은 연장하지 않음. 키 삭제 완료.
- **D7** — `McpAccessInterceptor.DENIED_PREFIXES = ["/event/stream"]`: MCP 토큰은 SSE 스트림 접근 불가(200+403). moveseye-ai(`C:/worktrees/zm-157-ai`) grep 결과 이 경로를 쓰는 툴 없음 → heartbeat 재검사 대신 차단. `/apm/live/stream`은 원래 허용 목록 밖. 일반 세션은 영향 없음.
- **D8** — `RoleDeleteKeepsStatusTest`의 연결 안 된 객체 assertion 제거 → `verifyNoInteractions(userRepository)` + 쿼리 1건(role 삭제)만 나감을 검증.

### B4. 개별 비활성화 표시 (2026-09-17)
- **마이그레이션** `V61__user_status_locked.sql`: `ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS status_locked boolean NOT NULL DEFAULT false` + 컬럼 주석. 파일 주석에 병합 순서(ZM-151 V60 → ZM-157 V61) 명시. dev DB에서 `BEGIN; … ROLLBACK;`으로 문법 실측(컬럼 생성·기존 행 0건 true 확인 후 롤백, 롤백 뒤 컬럼 없음 확인). **dev DB 미적용.** `FlywayMigrationSmokeIT`는 리소스의 `V*.sql` 개수를 동적으로 세므로 기대값 수정 불필요(실행 안 함).
- **엔티티** `User.statusLocked`(primitive boolean, `status_locked`). `changeStatusByAdmin(status)` = 상태 + 표시(INACTIVE면 true, ACTIVE면 false) — 상태 API만 쓴다. 생성은 false.
- **상태 API**: INACTIVE → `status=INACTIVE, status_locked=true`. ACTIVE → 비활성 그룹 소속이면 `USER_GROUP_INACTIVE`(표시 불변), 아니면 `ACTIVE, false`. 이미 ACTIVE인데 표시만 남은 행도 ACTIVE 요청 시 표시 해제(저장).
- **그룹 활성화**(`PUT /users/user-groups/{id}` status ACTIVE): 네이티브 SQL `UserGroupService.ACTIVATE_USERS_SQL` — `status_locked = false` **그리고** 이 그룹 외 **다른 비활성 사용자 그룹에 속하지 않은** 사용자만 ACTIVE. dev DB 롤백 실측: 일반→ACTIVE, 잠김→INACTIVE 유지, 다른 비활성 그룹 소속→INACTIVE 유지(UPDATE 1). 🔴 "다른 비활성 그룹 제외"는 예전(전원 ACTIVE)보다 좁아진 동작 변화다(동기화 규칙과 맞춤).
- **Zabbix 동기화**: `status_locked=true`면 그룹과 무관하게 INACTIVE 유지. 그 외는 기존 규칙(비활성 그룹 없으면 ACTIVE) + D3 관리자 보호.
- **그룹 비활성화·비활성 그룹 배정**: `status=INACTIVE`만, 표시 불변(테스트).
- **응답**: `UserResponseDto.statusLocked`(boolean, 항상 실림) — `GET /users`·`GET /users/{id}`·`POST /users`·`PATCH /users/zabbix-info/{id}`.
- 🔴 배포: V61 적용 전 새 코드가 뜨면 엔티티의 `status_locked` 컬럼이 없어 사용자 조회가 실패한다 — Flyway 활성 기동(운영 기본) 또는 수동 적용 선행.

### 검수 2차 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,367 green**(이번 실행은 `ApmCollectorLiveRuntimeTest`도 통과) · `:engine-zabbix:test` **126 green**(입력 변경 없음 UP-TO-DATE) · IT 미실행.

- **🔴1 B4 동기화 경합** — `ZabbixSyncServiceImpl.processUsersToUpdate`가 트랜잭션 밖에서 읽은 detached 엔티티를 저장하던 것을, 사용자마다 **`lockById` → `findById`(최신) → `syncedStatus`(최신 `status_locked`·역할) → 반영**으로 바꿨다(`syncOneUserLocked`). 같은 이유로 동기화가 비밀번호·이메일 등 다른 열을 옛 값으로 덮어쓰던 lost update도 함께 막힌다(`User`에 `@Version`·`@DynamicUpdate` 없음).
  - 트랜잭션: 기존 동기화 사용자 트랜잭션 **하나**를 유지(삭제·생성·갱신·관계가 한 단위). 사용자 단위로 쪼개지 않은 이유 — 관계 재구성까지 원자성이 깨진다. 대신 잠금 순서·상한을 정했다.
  - 잠금 순서: 사용자 id 오름차순. 대기 상한 `SET LOCAL lock_timeout = 10000ms`(`SYNC_LOCK_TIMEOUT_MS`) — 넘으면 동기화 전체 롤백(관리자가 재시도).
  - 영향: 잠근 사용자 행은 동기화 커밋까지 유지 → 그동안 그 사용자의 로그인은 최대 5초 대기 후 `FAILED_TO_ACQUIRE_LOCK`, MCP 발급·세대 조회도 같은 5초. 단일 행만 잡는 경로(로그인·상태 API·MCP)와는 교착 없음. 순서 없는 벌크 문장(그룹 상태 변경 `id IN`·사용자 삭제)과 겹치면 PostgreSQL 교착 감지로 한쪽이 실패할 수 있다(기존 벌크와 같은 성질, 드묾 — 동기화는 기본 수동).
  - 테스트(`ZabbixSyncLockRaceTest`, 실제 스레드): 상태 API가 행을 잡은 채 멈춤 → 동기화가 행 잠금에서 대기(확인) → 상태 API 커밋 → 동기화가 `INACTIVE/true`를 보고 유지, 동기화 필드는 반영. 반대 순서·잠금→조회 순서·삭제된 사용자 건너뛰기.
- **🔴2 D2 폐기 원자성**
  - (a) `RefreshTokenStore.revokeAll` 신설 — Redis Lua 한 번: `INCR REFRESH_GEN:<id>` → `DEL <세션>, <세션 계열>` → 새 세대 반환. `RefreshTokenService.revokeAllForUser`가 이것만 부른다(`bumpGeneration`+`deleteSession` 분리 호출 제거). 로컬 Redis `ZM157TEST:*` 실측: 세대 1(TTL 없음 유지), 세션·계열 키 삭제, 키 정리 완료.
  - (b) `UserService.mcpGenerationOf`를 **사용자 행 잠금 아래**(대기 5초)로 — 진행 중인 재설정·비활성화 트랜잭션 커밋(세대 증가+세션 삭제 이후)을 기다린다. 사용자 없음 = 잠금 행 없음 → `USER_NOT_FOUND`.
  - `GET /internal/mcp/users/{userId}/generation` 응답 코드 추가: **잠금 대기 초과 → 200 + `errorCode: FAILED_TO_ACQUIRE_LOCK`(body code 409)** — AI는 동의 실패(`generation_unavailable`) 처리.
  - 테스트: 폐기가 세대를 올린 지점에서 멈춤 → 세대 조회가 행 잠금에서 대기(확인) → 커밋 후 새 세대만 받고 옛 세션은 이미 없음. 폐기가 저장소 원자 연산 1회인지, Redis 스크립트 키 3개인지.
- **🟡3 D6 잔존 키** — `RedisClientService.getCountRepairingTtl`(Lua: `GET` → 값 있고 `TTL == -1`이면 `EXPIRE` → 값 반환, 증가 없음). `AuthRateLimiter.checkLogin`의 username·IP 사전 검사가 이것을 쓴다(창 = 각 제한의 창). 로컬 Redis 실측: TTL 없는 값 50 → 50·TTL 900, 남은 창(40)은 연장 안 함, 없는 키는 0이고 키를 만들지 않음.

### 검수 3차 반영 (2026-09-17)
> ⚠️ 아래 "동기화 재구성"(사용자별 `REQUIRES_NEW`·행 잠금·`refresh`)은 **4차에서 폐기**됐다 — "검수 4차 반영" 참조. 상태 API 대기 상한과 `FOR NO KEY UPDATE`는 유지.
검증: `:test --tests "*Test" --tests '*Test$*'` **3,369 green** · `:engine-zabbix:test` **126 green**(UP-TO-DATE) · **신규 IT `ZabbixSyncStatusLockIT` 4/4 green**(실제 Spring 트랜잭션·JPA·PostgreSQL `moveseye_it`, 실행 직전 다른 Gradle 테스트 워커 없음 확인 후 이 클래스만). 음성 대조: 사용자 잠금 뒤 `refresh`를 빼면 단위 테스트(`ZabbixSyncLockRaceTest`)와 IT 모두 B4 순서 케이스가 실패 → 원복 후 재실행 green.

- **동기화 재구성**
  - `UserService.runSync()`의 외곽 `@Transactional` 제거. 각 단계가 자기 짧은 트랜잭션을 쓴다.
  - 사용자 동기화(`ZabbixSyncServiceImpl.syncUsers`): ① Zabbix 사용자 조회(잠금·트랜잭션 없음) → ② 분류용 스냅샷 조회(트랜잭션 밖) → ③ 삭제·생성만 짧은 트랜잭션 → ④ **바뀐 사용자만**(이름·Zabbix 사용자명·성·상태 중 하나라도 다를 때) 사용자마다 `REQUIRES_NEW` 트랜잭션(새 영속성 컨텍스트): `lock_timeout 10s` → `lockById` → `findById` → **`EntityManager.refresh`** → 최신 `status_locked`·역할·그룹 규칙으로 재판정(바뀔 것 없으면 저장 안 함) → 저장 → ACTIVE→INACTIVE 전환이면 flush 후 `revokeAllForUser`(커밋 전) → 커밋 → ⑤ 관계 수집(읽기, id만) → 관계 교체는 기존 별도 트랜잭션.
  - 한 사용자 실패(잠금 대기 10초 초과 등)는 그 사용자만 건너뛰고 WARN 로그(`User sync partially applied: n updated, n unchanged, n failed`), 다음 동기화에서 재시도. `POST /users/sync` 응답 형식은 그대로(성공) — 부분 실패는 로그로만 보고된다.
  - 역할 동기화(`syncRoles`): Zabbix 역할 조회 + 권한 스키마 3회 조회를 **트랜잭션 전에** 끝내고, 쓰기는 짧은 트랜잭션 하나(`applyRoleSync`). 사용자 역할 연결 UPDATE는 맨 마지막, **값이 다른 행만**(`refRole is null or <> :refRole`) → 변경 없는 사용자는 잠그지 않는다. `syncPermissionSchema()`도 조회→쓰기 분리.
  - 사용자 행 잠금을 `FOR UPDATE` → **`FOR NO KEY UPDATE`**로 변경: 이 잠금끼리·일반 UPDATE·DELETE와는 그대로 직렬화, 관계 테이블 INSERT의 FK 검사(`FOR KEY SHARE`)와는 충돌하지 않아 관계 재구성이 로그인·MCP를 막지 않는다.
  - 남는 성질: 순서 없는 벌크 문장(그룹 상태 변경·동기화 사용자 삭제)과 사용자별 트랜잭션이 겹치면 한 번에 한 행만 잡으므로 교착은 없고, 벌크 쪽을 최대 10초까지 기다린다.
- **IT 검증 항목**(`ZabbixSyncStatusLockIT`)
  1. 동기화 트랜잭션이 옛 `ACTIVE/false`를 같은 영속성 컨텍스트에 적재 → 다른 스레드의 상태 API가 `INACTIVE/true` 커밋 → 동기화 반영: DB는 `INACTIVE/true`, 이름만 갱신.
  2. 동기화가 Zabbix 조회 중(원격 지연)일 때 다른 트랜잭션의 `lockById`(대기 상한 1초)가 즉시 성공.
  3. 전체 동기화: 잠긴 비활성 사용자는 INACTIVE 유지, 바뀔 것 없는 사용자 행은 쓰지 않음(`xmin` 불변), 이름이 바뀐 사용자만 갱신.
  4. 상태 API는 다른 트랜잭션이 행을 쥐면 약 5초 뒤 잠금 실패(무한 대기 없음, 상태 불변).
- **상태 API 대기 상한** — `PATCH /users/{id}/status`: `lock_timeout 5s`, 초과 시 **200 + `errorCode: FAILED_TO_ACQUIRE_LOCK`**(body code 400). FE는 기존 "기타 실패" 안내로 처리(계약만 추가).

### 검수 4차 반영 — 설계 전환 (2026-09-17)
> 3차의 "사용자별 `REQUIRES_NEW` + 행 잠금 + `refresh`" 구조는 **폐기**했다(원자성 회귀 3건). 아래가 현재 설계다.

검증: `:test --tests "*Test" --tests '*Test$*'` **3,365 green**(구조 폐기에 따라 목 기반 경합 테스트 3개 파일 삭제) · `:engine-zabbix:test` **126 green** · **IT `ZabbixSyncStatusLockIT` 8/8 green**(실제 Spring 트랜잭션·JPA·PostgreSQL, 실행 직전 다른 Gradle 테스트 워커 없음 확인 후 이 클래스만).

- **구조** — `UserService.runSync()`
  1. **트랜잭션 밖**: `ZabbixSyncService.prepare()` = 로컬 스냅샷(연동 사용자 id·이름 4열·상태·**행 버전 `xmin`**, 사용자 그룹·소속의 **행 버전 지문**) → Zabbix 원격 조회(슈퍼어드민 토큰, 호스트 그룹, 사용자 그룹, 사용자). 이어서 역할 조회 + 권한 스키마 3회 조회.
  2. **한 트랜잭션**(`lock_timeout 10s`): `apply()` + `applyRoleSync()`. 실패하면 **전부 롤백 + 예외 전파**, 성공 시각(`SYNC_TIME_KEY`) 기록 안 함(원래 계약).
  - 🔍 **트랜잭션 안 원격 호출 전수 확인**: `applyInTransaction`·`replaceHostGroups`·`replaceUserGroups`·`syncUsers`·`replaceUserUserGroups`·`replaceHostGroupUserGroups`·`applyStatuses`·`updateSyncFields`·`applyRoleSync`·`applyPermissionSchemas`가 쓰는 것은 `EntityManager`·JPA 리포지토리·`JdbcTemplate`·`RefreshTokenService`(Redis, 커밋 전 폐기 — 의도) 뿐이다. Zabbix 서비스(`zabbixUserService`·`zabbixUserGroupService`·`zabbixHostGroupService`·`zabbixRoleService`) 호출은 전부 `prepare()`/`runSync()` 앞부분·`fetchPermissionSchemas()`에 있고 트랜잭션 밖이다. `syncRoles()`·`syncPermissionSchema()` 단독 실행도 조회→짧은 트랜잭션.
- **트랜잭션 안 순서**: ① 스냅샷 지문 재확인 — 스냅샷 이후 로컬 **사용자 그룹·소속 행이 바뀌었으면 `ZABBIX_SYNC_CONFLICT`로 롤백**(옛 Zabbix 조회로 방금 비활성화한 그룹을 되살리지 않는다; 다음 동기화가 새 스냅샷으로 맞춘다) ② 호스트 그룹·사용자 그룹 교체(원래대로 삭제 후 재삽입) ③ 사용자 삭제(+커밋 전 폐기)·생성 ④ 사용자–그룹·그룹–호스트 그룹 관계 교체(`unnest` 한 문장씩) ⑤ **상태 조건부 UPDATE** ⑥ **동기화 소유 열 표적 UPDATE** ⑦ 역할 저장·권한 스키마·역할 연결(값이 다른 행만).
- **사용자 행**: 명시 잠금(`lockById`) 없음, 엔티티 통째 저장 없음.
  - 열: `username`·`zabbix_username`·`fullname`·`"lastName"`만, 스냅샷과 다를 때만, 그리고 SQL에서도 `IS DISTINCT FROM`일 때만.
  - 비활성화: `status <> 'INACTIVE' AND role NOT IN ('ADMIN','SUPER_ADMIN')`(D3) → 1행이면 커밋 전 `revokeAllForUser`(롤백돼도 세션만 끊긴 안전한 쪽). `status_locked`는 바꾸지 않는다.
  - 활성화: `status <> 'ACTIVE' AND status_locked = false`(B4) `AND xmin = 스냅샷 값`(스냅샷 이후 그룹 API·관리자 수정·상태 API가 건드린 행은 되살리지 않음) `AND NOT EXISTS(방금 교체한 소속 중 INACTIVE 그룹)`. 스냅샷이 이미 ACTIVE면 문장 생략.
  - 판정은 쓰는 순간의 DB 상태(READ COMMITTED에서 경합 행은 커밋 뒤 최신 버전으로 WHERE 재평가).
- **잠금·시간**: 사용자 행 잠금은 ③(삭제 대상)과 ⑤⑥(실제로 바뀌는 사용자)에서만, 트랜잭션 끝부분에 잡힌다. 관계 INSERT의 FK 검사(`FOR KEY SHARE`)는 로그인·상태 API의 `FOR NO KEY UPDATE`와 충돌하지 않는다. IT 실측(로컬 도커 PG, 사용자 1,000·그룹 5·소속 2,000):
  - 최초 생성(사용자 1,000 INSERT 포함): runSync 3.6s(대부분 신규 사용자 행 단위 INSERT — 생성 행은 기존 사용자 잠금과 무관).
  - 100명 변경(이름 50·비활성 그룹 이동 50): runSync 0.41s — 그룹·관계 81ms, 사용자 행 UPDATE 단계 289ms → **바뀐 사용자의 잠금 보유 ≈ 0.3s + 역할 적용 + 커밋**.
  - 변경 없음: runSync 0.23s(행 UPDATE 단계 101ms — 비활성 그룹 소속 50명의 무변경 비활성화 문장).
  - 수천 명이면 선형 추정으로 관계 교체 수백 ms, 변경 사용자 수에 비례한 행 UPDATE(건당 ~3~6ms) — 대량 일괄 변경(수백 명) 시 그 사용자들의 로그인이 1~2초 대기할 수 있으나 5초 상한 안.
- **동작 변화**: 사용자 그룹 활성화(Zabbix 쪽)로 인한 사용자 재활성화는 스냅샷 이후 그 사용자 행이 바뀌지 않았을 때만 — 바뀌었으면 다음 동기화에서 다시 판정. 동기화 시점에 로컬 그룹·소속이 바뀌는 중이면 동기화가 `ZABBIX_SYNC_CONFLICT`(200 + body 400)로 실패하고 아무것도 바꾸지 않는다(관리자 재시도, 스케줄러는 다음 주기).
- **IT 항목**: (a) 옛 스냅샷 중 그룹 쪽 G·U INACTIVE 커밋 → 충돌 롤백, U·G INACTIVE·소속 유지 (a2) 그룹 불변·사용자 행만 INACTIVE → 행 버전 대조로 활성화 안 함 (b) 개별 비활성화 표시 유지·이름만 갱신 (c)(d) 두 번째 폐기에서 오류 주입 → 그룹 상태·소속·사용자 상태·이름 전부 원상, 첫 대상의 세대 폐기는 실행됨, 성공 시각 미기록 (d) 정상 비활성화 + 폐기 + SUPER_ADMIN 보호 + 재활성화 (e) 원격 조회(역할) 지연 중 `lockById`(상한 1s) 즉시 성공·열린 트랜잭션 0 · 상태 API 5초 잠금 실패 · 규모 타이밍.
- 사용자 행 명시 잠금은 로그인·상태 API·MCP·계정 경로에서만(`FOR NO KEY UPDATE`, 5초) — 유지.

### 검수 5차 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,367 green** · `:engine-zabbix:test` **126 green**(UP-TO-DATE) · **IT `ZabbixSyncStatusLockIT` 14/14 green**(실행 직전 다른 Gradle 테스트 워커 없음 확인, 이 클래스만).

- **🔴 소속 쓰기 직렬화 — `MembershipLock`**(PostgreSQL `pg_advisory_xact_lock(9157000001)`, 트랜잭션 끝에 자동 해제)
  - 잡는 곳(모두 트랜잭션 맨 앞, 사용자 행 잠금보다 먼저): 동기화 적용(**지문 확인 전**) · 사용자 그룹 생성·수정(상태 포함)·삭제 · 관리자 사용자 생성(그룹 지정 시)·수정(`userGroupIds`가 있을 때)·삭제 · 상태 API 활성화(현재 소속으로 판정하므로).
  - **잠금 순서 advisory → 사용자 행**: 위 경로는 전부 advisory를 먼저 잡는다. 로그인·MCP·비밀번호·OTP·상태 API 비활성화 등 사용자 행만 잡는 경로는 advisory를 잡지 않으므로 순환이 없다.
  - **대기 상한**: advisory lock 대기에도 `lock_timeout`이 적용된다(dev DB에서 advisory만 잡아 실측 — 1초 뒤 `canceling statement due to lock timeout`; IT로도 확인). 동기화 10초, 관리자 그룹·사용자 쓰기 10초(`MembershipLock.ADMIN_LOCK_TIMEOUT_MS`), 상태 API 5초. 초과는 `PessimisticLockingFailureException`(EntityManager 직접 호출의 JPA 예외를 Spring 예외로 변환) → **200 + `FAILED_TO_ACQUIRE_LOCK`**: `PATCH /users/{id}/status`, `PUT /users/{id}`, `POST /users`, `DELETE /users`, `PUT /users/user-groups/{id}`, `POST /users/user-groups`(Zabbix 쪽 생성 정리 후), `DELETE /users/user-groups`(이 경로는 기존 catch 때문에 `ZABBIX_API_ERROR`로 나갈 수 있음 — 원본 보존). 동기화는 롤백 후 예외 전파.
  - 동기화가 advisory를 쥔 시간은 적용 트랜잭션 길이(규모 IT: 사용자 1,000명 변경 100명 0.22s, 무변경 0.17s, 최초 생성 1.5s — 이번 실행 기준)만큼이고, 그동안 그룹 API·관리자 사용자 수정·상태 API 활성화가 기다린다.
- **🟡 `updated_at`**: 동기화의 표적 UPDATE 세 문장(열·비활성화·활성화)이 실제로 바꿀 때 `updated_at = CAST(clock_timestamp() AS timestamp)` — PgJDBC가 세션 시간대를 JVM 시간대로 맞추므로 `@UpdateTimestamp`(`LocalDateTime.now()`)와 같은 기준(운영 UTC).
- **`syncRoles()` 단독 경로**: 쓰기 트랜잭션에 `lock_timeout 10s`.
- **발견·수정한 기존 결함**: Zabbix 역할 응답이 비었거나 로컬에만 있는 역할을 지울 때, `findAll`로 적재한 역할을 벌크 삭제한 뒤 커밋 flush가 지워진 행을 UPDATE하려다 `StaleObjectStateException`으로 동기화 전체가 실패했다 → 벌크 삭제 전에 flush + detach.
- **IT 추가**: (f) 지문 확인 직후(동기화가 잠금 보유 중) 실제 `UserGroupService.updateUserGroup`으로 G·U 비활성화 → 그룹 쪽이 advisory에서 대기(`pg_locks` 확인, 호출 미완료 확인) → 동기화 커밋 뒤 반영 → G·U INACTIVE (g) 반대 순서: 그룹 쪽이 advisory를 쥔 채 G·U 변경 → 동기화가 advisory에서 대기 → 그룹 쪽 커밋 → 동기화 지문 불일치로 `ZABBIX_SYNC_CONFLICT`, G·U INACTIVE (g2) advisory 대기에도 5초 `lock_timeout` → 상태 API 활성화 잠금 실패, 상태 불변 (k) 바뀐 행만 `updated_at` 전진, 무변경 행 그대로 (l) 역할 응답 있음: 역할 저장·권한 스키마(`"1"`→`"0"`)·사용자 역할 연결, 재실행 시 사용자 행 불변(`xmin`) (m) 스냅샷이 INACTIVE인 두 사용자 중 대조군은 활성화 SQL로 ACTIVE, 스냅샷 뒤 행이 바뀐 사용자는 `xmin` 불일치로 INACTIVE 유지.

### 검수 6차 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,369 green** · `:engine-zabbix:test` **126 green**(UP-TO-DATE) · **IT `ZabbixSyncStatusLockIT` 17/17 green**(실행 직전 다른 Gradle 테스트 워커 없음 확인, 이 클래스만). 음성 대조: 그룹 수정의 판정을 잠금 전 값(`existingGroup.status`)으로, 사용자 생성의 상태를 잠금 전 값으로 되돌리면 (n)(o) 두 IT가 실패 → 원복 후 재실행 green.

- **🔴 원칙: 소속 잠금 → 판정 값 재조회.** `MembershipLock.acquire(em, timeout)`(대기 상한 설정 + 잠금)을 쓰기 트랜잭션의 첫 DB 작업으로 두고, 판정에 쓰는 그룹 상태·소속·사용자는 그 뒤에 다시 읽는다. 경로별 전수 확인:

| 경로 | 잠금 전에 읽는 것 | 잠금 뒤 재조회·판정 |
|---|---|---|
| 동기화 적용 | 스냅샷(설계상 트랜잭션 밖) | 지문을 잠금 뒤 재확인 — 다르면 `ZABBIX_SYNC_CONFLICT`. 상태는 조건부 UPDATE(쓰는 순간 판정) |
| 사용자 그룹 생성 | 이름 중복·사용자·호스트 그룹(Zabbix 호출 인자) | 사용자 재조회 → INACTIVE 생성이면 현재 INACTIVE가 아닌 구성원만 비활성화·세션 폐기 |
| 사용자 그룹 수정 | 그룹·사용자·호스트 그룹(Zabbix 호출 인자) | **그룹·구성원 재조회**. INACTIVE 요청은 현재 그룹 상태와 무관하게 구성원을 INACTIVE로 맞춤(바뀐 사용자만 폐기). ACTIVE 요청은 **재조회한 그룹 상태**가 ACTIVE가 아닐 때만 조건부 활성화 |
| 사용자 그룹 삭제 | 그룹(Zabbix id)·구성원 존재(빠른 거부) | 외곽 `@Transactional` 제거 → 원격 삭제 뒤 트랜잭션에서 잠금 → **구성원 존재 재확인** → 삭제. 재확인 실패 시 로컬은 지우지 않음(Zabbix 쪽은 이미 삭제 — 다음 동기화가 맞춤) |
| 관리자 사용자 생성(그룹 지정) | 그룹·비활성 여부(Zabbix 생성 인자) | **그룹 재조회 → 비활성 그룹 소속이면 INACTIVE**로 저장 |
| 관리자 사용자 수정(그룹 지정) | 없음(트랜잭션 첫 작업이 잠금) | 사용자·그룹 모두 잠금 뒤 조회 |
| 관리자 사용자 삭제 | 대상 사용자·역할(SUPER_ADMIN 보호) — 소속 판정 아님 | 삭제 문장 직전에 잠금. 원격 삭제가 트랜잭션 안에 있는 기존 구조라 잠금을 원격 호출 동안 쥐지 않도록 이 위치를 유지 |
| 상태 API 활성화 | 없음 | 잠금 → 사용자 행 잠금 → 사용자·소속 조회 |
| 호스트 그룹 수정 | 그룹(Zabbix 호출 인자) | 잠금 → `refresh` → 변경 |
| 호스트 그룹 삭제 | 그룹·고아 호스트 검사(Zabbix 호출 인자) | 잠금 → **대상의 Zabbix id 재확인**(동기화가 id를 재사용해 다른 그룹이 됐으면 `ZABBIX_SYNC_CONFLICT`) → 삭제 |

- **🟡 호스트 그룹**: 삭제·수정이 소속 잠금을 잡고, **동기화 지문에 `host_group`(id·xmin)과 `usergroup_hostgroups`(행·xmin)를 포함**했다 — 관리자 작업에서만 바뀌고 수백 행이라 id·xmin만 읽는 비용은 작다. 호스트 그룹 **생성**은 트랜잭션이 없는 단일 저장이라 잠금을 잡지 않았다(지문에는 잡혀 이후 동기화가 충돌로 멈춘다; 잠금 확인~삭제 사이에 생성이 끼면 그 그룹은 로컬에서 지워지고 Zabbix에는 남아 다음 동기화가 복원 — 기존 거울 성질).
- **🟡 응답 계약**: `POST /users/sync`의 잠금 대기 초과 → **200 + `FAILED_TO_ACQUIRE_LOCK`**(MockMvc 테스트, `ZABBIX_SYNC_CONFLICT`도 200 확인). `DELETE /users/user-groups`·`PUT /users/user-groups/{id}`·`PUT·DELETE /users/host-groups`도 잠금 예외를 `ZABBIX_API_ERROR`보다 먼저 `FAILED_TO_ACQUIRE_LOCK`으로 뺀다(업무 오류 `ApiError`는 그대로 통과).
- **IT 추가**: (n) 그룹 INACTIVE 요청이 옛 상태(INACTIVE)를 읽고 잠금 대기 → 동기화가 G·U ACTIVE 커밋 → 요청 완료 후 G·U INACTIVE + U 세션 폐기 호출 확인 (o) 사용자 생성이 활성 그룹을 읽고 대기 → 그룹 비활성화 커밋 → 생성된 사용자 INACTIVE·소속 있음 (q) 스냅샷 뒤 호스트 그룹 삭제(관계 CASCADE) → 동기화 `ZABBIX_SYNC_CONFLICT`, 삭제 결과 유지.

### 검수 7차 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,373 green** · `:engine-zabbix:test` **126 green**(UP-TO-DATE) · **IT `ZabbixSyncStatusLockIT` 19/19 green**(실행 직전 다른 Gradle 테스트 워커 없음 확인, 이 클래스만). 음성 대조: 사용자 생성·호스트 그룹 수정의 대조를 끄면 (r)(s) 두 IT가 실패 → 원복 후 재실행 green.

- **🔴 원칙**: 동기화는 그룹을 지우고 다시 넣으며 sequence를 1부터 다시 매긴다 → 소속 잠금을 기다리는 동안 **같은 숫자 id가 다른 그룹**이 될 수 있다. 잠금 뒤 숫자 id로 다시 읽은 그룹은 `LockedGroupIdentity`로 **잠금 전에 본 Zabbix id(없으면 이름)와 같은지** 확인하고, 다르거나 사라졌으면 **200 + `ZABBIX_SYNC_CONFLICT`**로 중단(트랜잭션 롤백). 이미 Zabbix 쪽 변경을 보낸 경로는 경고 로그를 남기고 다음 동기화가 로컬을 맞춘다. Zabbix id가 같으면 이름이 바뀌어도 같은 그룹으로 본다.
- **전수 점검 — MembershipLock 경로에서 숫자 id로 그룹·소속을 다시 읽는 곳**

| 경로 | 잠금 뒤 숫자 id 재조회 | 조치 | 충돌 시 원격 상태 |
|---|---|---|---|
| 사용자 그룹 수정 | 대상 그룹 `findById(id)`, 호스트 그룹 `findByIdIn` | 둘 다 Zabbix id 대조. 구성원 조회(`queryGroupUsers(id)`)·조건부 활성화·소속 교체는 대조를 통과한 id로만 | Zabbix 그룹은 이미 수정됨 → 경고 로그, 다음 동기화가 복원 |
| 사용자 그룹 생성 | 호스트 그룹 `findByIdIn` | Zabbix id 대조 | 기존 정리 로직대로 Zabbix 그룹 삭제 후 충돌 코드 |
| 사용자 그룹 삭제 | 대상 그룹 `findByIdIn`, 구성원 조인 조회 | 대상 그룹 Zabbix id 대조 뒤 구성원 재확인·삭제 | Zabbix 그룹은 이미 삭제됨 → 로컬 유지, 다음 동기화가 정리 |
| 관리자 사용자 생성(그룹 지정) | 그룹 `findByIdIn` | Zabbix id 대조 → 통과한 그룹으로 소속·상태 계산 | `createInZabbix`면 Zabbix 사용자는 이미 생성됨 → 다음 동기화가 로컬 생성 |
| 관리자 사용자 수정(그룹 지정) | 그룹 `findByIdIn`(요청의 id) | **잠금 전 조회가 없다** — 잠금이 트랜잭션 첫 작업이고 그룹·Zabbix 반영도 잠금 뒤 같은 행으로 한다. 요청(화면)이 만들어진 뒤의 id 재사용은 이 API만의 문제가 아니라 id를 다시 매기는 동기화 설계의 성질(아래 남은 위험) | — |
| 관리자 사용자 삭제 | 없음(그룹을 읽지 않음) | — | — |
| 상태 API 활성화 | 사용자 엔티티의 현재 소속(EAGER) | 숫자 id를 들고 기다리지 않는다 — 잠금 뒤 조회한 소속 그대로 판정 | — |
| 호스트 그룹 수정 | 대상 `refresh(hostGroup)` | refresh 전 값(Zabbix id·이름)과 대조, 행이 사라졌으면 충돌 | Zabbix 호스트 그룹은 이미 수정됨 → 경고 로그 |
| 호스트 그룹 삭제 | 대상 `findByIdIn` | 공용 대조로 통일(6차의 Zabbix id 목록 비교를 대체) | Zabbix 호스트 그룹은 이미 삭제됨 |
| 동기화 적용 | 해당 없음(자신이 교체) | 지문 재확인 | — |

- **IT 추가**: (r) 비활성 그룹 gX(id 2)로 사용자 생성이 잠금 대기 → 동기화가 앞 그룹 g0를 지워 id 2가 활성 gB가 됨(재사용 확인) → 생성은 `ZABBIX_SYNC_CONFLICT`, 사용자 없음, gX INACTIVE·gB ACTIVE (s) 호스트 그룹 h1(id 2) 이름 수정이 대기 → 동기화가 h0를 지워 id 2가 h9가 됨 → 수정은 충돌, 두 호스트 그룹 이름 불변. 단위: `LockedGroupIdentityTest`(같은 Zabbix id·이름 변경 허용, 다른 그룹·사라짐·로컬 그룹 이름 대조).
- **남은 위험(설계 성질)**: 동기화가 매번 그룹 id를 1부터 다시 매기므로, 화면이 들고 있던 숫자 id는 다음 동기화 뒤 다른 그룹을 가리킬 수 있다(모든 그룹 id 기반 API 공통, 이번 변경 이전부터). 근본 해결은 동기화를 id 보존 upsert(Zabbix id 기준)로 바꾸는 것 — 그룹 id가 매 동기화마다 바뀌지 않도록 하면서 재사용도 없애야 해서 별도 작업으로 남긴다.

### 검수 8차 반영 (2026-09-17)
검증: `:test --tests "*Test" --tests '*Test$*'` **3,374 green** · `:engine-zabbix:test` **126 green**(UP-TO-DATE) · **IT `ZabbixSyncStatusLockIT` 20/20 green**(첫 시도 때 다른 워크트리 `zm-159-be`의 테스트 워커가 떠 있어 실행을 미루고, 워커가 없어진 것을 확인한 뒤 이 클래스만 실행). 음성 대조: 호스트 그룹 삭제의 대조를 7차 방식(같은 트랜잭션의 엔티티 재조회)으로 되돌리면 (t)가 실패 → 원복 후 재실행 green.

- **🔴 원인**: 호스트 그룹 삭제는 메서드 전체가 `@Transactional`이라 잠금 전에 읽은 엔티티가 1차 캐시에 남았고, 잠금 뒤 `select h` 엔티티 조회가 같은 옛 객체를 돌려줘 대조가 항상 통과했다(id 재사용 시 h9와 관계 삭제).
- **수정 — `LockedGroupIdentity` 규약 변경**: 잠금 전 식별값은 **`Key(id, Zabbix id, 이름)` 값으로 보존**하고, 잠금 후에는 **JPQL 열(scalar) 조회**(`select g.id, g.zabbixUsrgrpid, g.name …`, `select h.id, h.zabbixHostGroupId, h.name …`)로 읽어 비교한다 — 엔티티를 반환하지 않으므로 영속성 컨텍스트를 거치지 않는다. 엔티티 기반 대조 메서드는 삭제해 같은 실수를 막았다. 통과한 뒤에만 엔티티를 읽거나 `refresh`한다.
- **전수 재점검**

| 경로 | 트랜잭션 구조 | 잠금 전 값 | 잠금 후 대조 | 이후 엔티티 사용 |
|---|---|---|---|---|
| 사용자 그룹 수정 | 외곽 없음, 적용만 `TransactionTemplate`(새 컨텍스트) | 대상 그룹·호스트 그룹 `Key` | scalar 2회 | 대조 뒤 `findById`·`findByIdIn`(새 컨텍스트, 캐시 없음) |
| 사용자 그룹 생성 | 동일 | 호스트 그룹 `Key` | scalar | 대조 뒤 `findByIdIn` |
| 사용자 그룹 삭제 | 동일 | 대상 그룹 `Key` | scalar | 구성원 조인 조회(열) → bulk DELETE |
| 관리자 사용자 생성 | 외곽 없음, 저장만 `TransactionTemplate` | 그룹 `Key` | scalar | 대조 뒤 `findByIdIn` |
| 호스트 그룹 수정 | **메서드 `@Transactional`(엔티티 캐시에 남음)** | 대상 `Key`(잠금 전 복사) | scalar | 대조 뒤 `refresh`로 최신 행을 엔티티에 반영하고 변경 |
| 호스트 그룹 삭제 | **메서드 `@Transactional`(엔티티 캐시에 남음)** | 대상 `Key`(잠금 전 복사) | scalar ← **이번 수정** | bulk DELETE |
| 관리자 사용자 수정·삭제, 상태 API | 잠금이 첫 작업 또는 그룹 미조회 | 해당 없음 | 해당 없음 | 잠금 뒤 조회만 |
| 동기화 적용 | 한 트랜잭션 | 스냅샷 지문 | 지문(원시 SQL 집계) | — |

- **IT 추가**: (t) 호스트 그룹 h1(id 2) 삭제가 잠금 대기(같은 트랜잭션에 h1 엔티티 적재) → 동기화가 id 2를 h9에 배정(재사용 확인) → 삭제는 `ZABBIX_SYNC_CONFLICT`, 호스트 그룹 h1·h9와 그룹 관계 2건 보존. IT의 Zabbix 사용자 그룹 권한은 이제 대역의 호스트 그룹 전체를 가리킨다(관계 보존 검증용). 단위: `LockedGroupIdentityTest`(키가 값 복사인지, 열 조회를 쓰고 엔티티 조회를 쓰지 않는지, 대조 규칙).

## 🔄 FE 요청사항 (2026-09-17, fe-engineer)

- **R1. `GET /users` 목록 행(`UserResponseDto`)에 `userRole`(USER·ADMIN·SUPER_ADMIN) 추가** — 선택, 추가 필드.
  - 이유: B3 "관리자 행은 비활성화 동작 숨김"의 판정 축은 BE `CANNOT_DEACTIVATE_ADMIN`과 같은 `userRole`인데 목록에 없다. FE는 지금 `userRole ?? role.type`(Zabbix 역할 유형)으로 대신 본다(`components/user-roles/UserStatusAction.tsx` `isAdminUserRow`).
  - 영향: 두 값이 어긋나는 계정(예: Zabbix 역할 유형 ADMIN + userRole USER)은 FE가 버튼을 숨겨 비활성화할 수 없고, 반대 경우는 버튼이 보였다가 `CANNOT_DEACTIVATE_ADMIN` 안내로 끝난다. 필드가 실려 오면 FE는 수정 없이 `userRole`을 우선한다(`TUser.userRole?` 선반영).
- FE 반영 확인(BE 결과와 대조): my-profile `lastName` 사용(키 없으면 칸 숨김 — 혼합 배포 보호), 이메일은 **바뀐 경우에만** 전송(BE 완화와 무관하게 안전), `password`는 비밀번호 모달에서만 전송. 상태 API 경로·본문·응답·오류 코드 4종 일치. `PUT /users/{id}` 폼은 원래 `status`를 보내지 않았고, 폼의 "저장 후 상태" 표시만 새 규칙(비활성 그룹일 때만 INACTIVE, 그 외 현재 상태 유지)으로 고쳤다.

## 🔄 검수 1차 반영 계약 (2026-09-17, Codex D2·D5)

### D2. 동의(인가 코드) 시점 세대 고정
- BE 신규 내부 API: **`GET /internal/mcp/users/{userId}/generation`** (헤더 `x-internal-token`, 기존 `/internal/**` 보호 규칙) → 200 `data: { "generation": <long> }`. 사용자 없음은 200 + `USER_NOT_FOUND`. 사용자 행 잠금 대기 초과(재설정·비활성화 진행 중)는 200 + `FAILED_TO_ACQUIRE_LOCK`(body 409) — AI는 동의 실패 처리(2차 검수 🔴2).
- AI: 사용자가 동의를 **승인하는 시점**에 위 API로 세대를 읽어 인가 코드(PendingAuth)에 저장한다. 코드 교환(`POST /oauth/token`, `authorization_code`) 때 그 값을 `POST /internal/mcp/tokens`의 **`expectedGeneration`**으로 보낸다(이제 최초 발급도 기대 세대 필수).
- 코드에 세대가 없으면(배포 전 발급된 코드 등) 교환을 거부(`invalid_grant`).
- BE `/internal/mcp/tokens`: `expectedGeneration`이 없는 요청은 **거부**(`MCP_GRANT_REVOKED`)로 바꾼다 — 이제 모든 발급이 기대 세대를 갖는다.

### D5. 일시 장애와 영구 회수 구분
- BE `/internal/mcp/tokens`의 `FAILED_TO_ACQUIRE_LOCK`(body code 409)은 **일시 장애**다.
- AI: 갱신·코드 교환에서 이 코드를 받으면 grant·refresh·코드를 **보존**하고, 토큰 엔드포인트는 HTTP 503 + `{"error":"temporarily_unavailable"}`로 답한다(클라이언트 재시도). 그 밖의 거부(`MCP_GRANT_REVOKED`·`MCP_USER_INACTIVE`·`MCP_PERMISSION_DENIED`·`USER_NOT_FOUND`)만 폐기.

## B4. 개별 비활성화 표시 (2026-09-17 사용자 결정 "이번에 넣자")

- 문제: 관리자가 `PATCH /users/{id}/status`로 개별 비활성화한 사용자가 **사용자 그룹 활성화**(`UserGroupService` 벌크 상태 변경)와 **Zabbix 동기화**(`ZabbixSyncServiceImpl` 상태 재계산)에서 다시 ACTIVE가 된다.
- DB: `user` 테이블에 **`status_locked BOOLEAN NOT NULL DEFAULT false`** — Flyway **`V61__user_status_locked.sql`**.
  - 🔴 병합 순서: **ZM-151(V60) → ZM-157(V61)**. `outOfOrder=false`라 V61이 먼저 적용된 DB에 V60이 오면 기동 실패.
- 규칙
  - 상태 API `INACTIVE` → `status=INACTIVE`, `status_locked=true`.
  - 상태 API `ACTIVE` → 비활성 그룹 소속이면 기존대로 `USER_GROUP_INACTIVE`(표시 변경 없음), 아니면 `status=ACTIVE`, `status_locked=false`.
  - 그룹 비활성화·비활성 그룹 배정 → `status=INACTIVE`(표시 변경 없음).
  - 그룹 활성화·Zabbix 동기화의 ACTIVE 재계산 → **`status_locked=true`인 사용자는 건너뛴다**(INACTIVE 유지). 그 외 사용자는 기존 규칙(다른 비활성 그룹이 없으면 ACTIVE).
  - 사용자 삭제·생성은 영향 없음(생성 시 false).
- 응답: `GET /users` 목록·`GET /users/{id}` 행에 **`statusLocked`**(boolean) 추가 필드.
- FE: 사용자 목록 상태 옆에 "관리자가 비활성화함" 표시(툴팁: 그룹을 활성화해도 자동으로 활성화되지 않습니다), 활성화 확인 창 문구는 동일.
