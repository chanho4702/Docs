# 검수 요청 — ZM-157 후속(계정·보안 소형 묶음 + 권한 모델 마무리)

> 문서 지도: [`../INDEX_zm-157-permission.md`](../00-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84/%EA%B6%8C%ED%95%9C-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-157%29.md)

- 작성: 2026-09-17 · **미커밋**(각 워크트리 HEAD 위 작업 트리 변경)
  - BE `C:/worktrees/zm-157-be` (HEAD `a2709d6`)
  - FE `C:/worktrees/zm-157-fe` (HEAD `defc930`)
  - AI `C:/worktrees/zm-157-ai` (HEAD `9219f83`)
- 계약서(정본·구현 결과 포함): `_workspace/contract_zm-157-followups.md`
- 선행 검수: `_workspace/reviews/review_zm-157-permission.md`(1~5차) — 거기서 해결 판정한 구조(세대·계열·Lua·행 잠금)는 재사용했다.
- 사용자 원칙: 로그인한 사용자는 역할에서 지정한 권한 안에서만 작업. 계정 보안 변경은 모든 경로(브라우저·MCP)에 즉시 반영.

## 1. 범위

| # | 내용 | 주요 파일 |
|---|---|---|
| A1 | MCP 토큰 `gen` 클레임, 요청마다 현재 세대 대조(불일치·누락 HTTP 401). `/internal/mcp/tokens`의 `expectedGeneration`/`generation`, `MCP_GRANT_REVOKED`, 발급 판정은 사용자 행 잠금 아래(`UserService.mcpGrantLocked`). AI는 grant에 `generation` 저장(V8, 기존 활성 grant 일괄 폐기), 갱신 시 기대 세대 전송·불일치/누락/옛 grant는 폐기+`invalid_grant`, 첫 발급 응답에 generation 없으면 연결 미생성 | BE `JwtTokenProvider`·`McpAccessInterceptor`·`InternalMcpController`·`UserService` / AI `OAuthService`·`OAuthStore`·`BeMcpTokenClient`·`V8__mcp_grant_generation.sql` |
| A2 | 마이페이지 조회·저장을 `GET/PUT /users/my-profile`로(관리자 전용 zabbix-info 의존 제거), my-profile 응답에 `lastName`, 현재 비밀번호는 비밀번호 변경·**이메일 실제 변경** 시만 | BE `UpdateMyProfileDto`·`UserDetailBasicDto`·`UserService` / FE `MyPage.tsx`·`ZabbixInfoPasswordModal.tsx` |
| A3 | `typ`=access/otp/mcp. 인증 필터는 access·mcp만(그 외·누락 401), OTP 검증은 otp만(`OTP_WRONG`) | BE `JwtTokenProvider`·`AuthService` / FE `PasswordReset.tsx`(재설정 저장 단계가 실패를 성공으로 처리하던 결함 수정) |
| A4 | IP 기준 제한: 로그인 실패 15분 50회, forgot-password·resend 요청 15분 20회(사용자 조회 전), 성공 시 IP 카운터 유지. IP는 `getRemoteAddr()`만, `forward-headers-strategy: ${FORWARD_HEADERS_STRATEGY:none}` | BE `AuthRateLimiter`·`AuthRateLimitProperties`·`AuthController`·`application.yml` |
| A5 | `UserService.markEmailVerified` 삭제 | BE |
| B1 | 역할 편집의 효과 없는 칸 잠금+툴팁(값 보존), 목록은 상수 `INERT_PERMISSION_FEATURES` | FE `permissionLabels.ts`·`DmovePermission.tsx`·`DmoveRowPermission.tsx` |
| B2 | 그룹 리포트 `/hosts/{groupid}/reports`·`/detail` 그룹 가시성(`HostGroupVisibilityChecker`, 엔진 `listGroups`) | BE `HostController` |
| B3 | `PATCH /users/{id}/status`(관리자, 자기 자신·관리자 비활성화 거부, 비활성 그룹 소속 ACTIVE 거부, INACTIVE는 잠금 아래+세대 증가). 관리자 `PUT /users/{id}`의 ACTIVE 재설정 제거, 역할 삭제의 일괄 ACTIVE 제거, 목록 응답 `userRole`. FE 사용자 목록 활성/비활성 동작, 편집 폼 상태 표시 | BE `UserController`·`UserService`·`UserResponseDto`·DTO 2개·`ErrorCode` / FE `UserStatusAction.tsx`·`UserList.tsx`·`UserFormModal.tsx`·`usersRoles.ts` |

## 2. 의도·버린 대안
- **옛 MCP grant는 1회 이행하지 않고 폐기** — 어느 세대에서 만든 연결인지 몰라 비밀번호 변경 후 살아남은 연결을 합법화할 수 있다. 대가: 배포 후 MCP 1회 재연결.
- **AI가 발급 응답의 `generation`을 필수로 본다** — 기대 세대를 확인하지 않는 구버전 BE와 섞여 배포되면 회수를 보장할 수 없으므로 실패로 닫는다(배포 순서: BE → AI).
- **typ 없는 토큰 거부** — 배포 전 토큰·메일 링크는 무효(재로그인 공지와 함께).
- **IP 카운터는 로그인 성공으로 리셋하지 않음** — 자기 계정 로그인으로 IP 제한을 푸는 우회 방지.
- **그룹 활성화·Zabbix 동기화의 재활성화는 이번에 고치지 않음** — 개인 차단 표식(마이그레이션)이 필요해 사용자 결정 대기. 조건은 계약서 "남은 위험"에 기록.
- **역할 삭제 시 `refRole`은 그대로**(FK 없음, 권한 판정은 빈 권한).

## 3. 중점 확인 요청
1. **A1 경합**: 발급 판정(잠금 안)과 JWT 서명(잠금 밖) 사이의 폐기, AI 갱신과 BE 폐기의 교차, 같은 refresh 토큰 동시 갱신(AI의 기존 비조건부 교체 — 이번 변경이 악화시키는가), V8 일괄 폐기가 진행 중 동의 흐름과 충돌하는가. `gen` 클레임 직렬화 타입(숫자)과 AI 파싱의 정합.
2. **A2**: my-profile 조회 캐시 공유(`AUTH.GET_ME`) 무효화 순서, 이메일 "실제 변경" 판정(대소문자·공백), 비밀번호 없는 계정, 연동 계정의 Zabbix `user.update`(passwd) 경로가 관리자 경로와 동등한가.
3. **A3**: 모든 토큰 발급처에 typ가 붙는가(누락 시 정상 로그인 불능), 인증 필터 외 경로(SSE·refresh·MCP·내부 API)의 토큰 파싱.
4. **A4**: 카운트 경합·키 TTL, 실패/성공 판정 위치, 사용자 열거 방지 응답 유지, 공유 NAT에서의 서비스 거부 위험.
5. **B2**: 가시성 판정의 fail-open(엔진 오류·빈 응답), 캐시 키.
6. **B3**: 잠금·세대 증가 순서, 마지막 관리자 보호의 우회(SUPER_ADMIN·role.type 불일치), FE가 `userRole` 없는 응답에서 관리자 판정을 잘못하는 경우, 편집 폼 상태 표시가 BE와 같은가.
7. **B1**: 잠긴 칸 값이 저장 시 보존되는가(비활성 체크박스가 폼 값에서 빠지는 antd 동작).
8. **테스트 공허**: 대역·목 때문에 결함을 못 잡는 테스트.

## 4. 검증 현황
- BE: 루트 `*Test` **3,330 통과**(마지막 실행, IT 0) · `:engine-zabbix:test` 126(이번 라운드 소스 변경 없음) · 경합 순서 테스트(`UserSerializationRaceTest` +5), MockMvc(B2·B3), `AuthRateLimiterTest`·`UserStatusChangeTest`·`RoleDeleteKeepsStatusTest`.
- FE: 관련 18개 스위트 **253 통과** · tsc·contract(환경 1건 `@dagrejs/dagre`) · eslint · 변이 9건 음성 대조.
- AI: 전체 **179 통과**(신규 11).
- **미검증**: 런타임 전부(BE·AI 기동, MCP 실제 재연결, 브라우저), BE IT, AI V8 실제 DB 적용, BE↔AI 실제 응답 정합(AI는 가짜 BE로 검증).

## 검수 결과

(Codex 1차 — 2026-09-17, `gpt-6-astra` xhigh, read-only, BE·FE·AI 병렬)

### BE 검수 결과

판정: **수정 후 머지**

- [ ] 🔴 **D1. 이메일 비교 차이로 현재 비밀번호 확인 우회** — [UpdateMyProfileDto.java:53](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/dto/request/UpdateMyProfileDto.java:53), [UserService.java:629](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:629) — **근거:** `equalsIgnoreCase()`의 동일성 판정과 저장에 쓰는 `toLowerCase()`가 다르다. 기존 빌드의 실제 DTO와 Hibernate 이메일 validator로 `EMAIL_VALID=true`, `CREDENTIAL_CHANGE=false`, `STORED_ADDRESS_CHANGED=true`를 확인했다. — **시나리오:** 현재 주소가 `me@site.com`일 때 `email="me@s\u0131te.com"`을 전송하면 현재 비밀번호 없이 다른 도메인(`xn--ste-jua.com`)의 주소로 바뀐다. 유효 세션을 확보한 사람이 재설정 수신처를 변경할 수 있다. — **수정 제안:** 비교와 저장에 동일한 이메일 정규화 함수를 적용하고, 위 Unicode 입력을 회귀 테스트에 추가한다. — **후속 가능 여부:** 불가, 머지 전 수정.

- [ ] 🔴 **D2. 폐기 전에 승인한 OAuth 코드가 폐기 후 새 세대 연결을 생성** — [UserService.java:351](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:351), 교차 근거 [OAuthService.java:157](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:157) — **근거:** BE는 기대 세대가 없으면 현재 세대로 발급한다. AI의 동의 코드는 세대를 저장하지 않고, 코드 교환 때도 `expectedGeneration=null`을 보낸다. V8은 DB grant만 폐기하고 Redis의 대기 코드는 처리하지 않는다. — **시나리오:** 동의 승인·코드 발급 → 비밀번호 변경으로 세대 증가 → 코드 TTL 안에 교환하면 재동의 없이 새 세대 access·refresh 연결이 만들어진다. — **수정 제안:** 동의 승인 당시 BE가 확인한 세대를 코드에 저장하고 교환에도 전달한다. 세대 없는 기존 코드도 거부한다. — **후속 가능 여부:** 불가, BE↔AI 계약과 함께 수정.

- [ ] 🔴 **D3. 마지막 관리자 보호를 기존 편집 경로로 우회 가능** — [UserService.java:708](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:708), [UserGroupService.java:240](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:240) — **근거:** 새 상태 API에는 `userRole` 보호가 있지만, `PUT /users/{id}`의 비활성 그룹 배정과 그룹 비활성화의 벌크 UPDATE에는 관리자 제외가 없다. — **시나리오:** 마지막 MovesEye 전용 ADMIN을 비활성 그룹에 배정하면 INACTIVE 전환과 세션 폐기가 실행된다. 자기 계정도 이 경로에서는 차단하지 않는다. — **수정 제안:** 모든 비활성화 경로에 동일한 관리자 보호를 적용하고, 원격 Zabbix 변경 전에도 검사한다. — **후속 가능 여부:** 기존 잔존 결함이지만, B3의 마지막 관리자 보호 완료 판정 전 수정 필요.

- [ ] 🟡 **D4. ARCHIVED 상태에서 일반 사용자의 저장 리포트 조회가 막히는 회귀** — [HostGroupVisibilityChecker.java:47](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/host/HostGroupVisibilityChecker.java:47), [LicenseGuardedInventoryPort.java:47](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/license/integration/LicenseGuardedInventoryPort.java:47) — **근거:** 새 가시성 검사가 항상 live inventory를 호출한다. 실제 주입되는 데코레이터는 ARCHIVED에서 이를 차단한다. 기존 `ReportService.ensureReport()`는 정상 저장본을 소스 호출 없이 반환했다. — **시나리오:** 해당 그룹을 볼 권한이 있는 일반 사용자도 라이선스가 ARCHIVED가 되면 저장 리포트 목록·상세에서 `LICENSE_LIVE_BLOCKED`를 받는다. 관리자는 가시성 검사를 건너뛰어 영향이 없다. — **수정 제안:** 저장 데이터 접근권한 확인과 live 데이터 조회 제한을 분리한다. 오류 시 가시성을 무조건 허용하는 방식은 피한다. — **후속 가능 여부:** 기존 저장 데이터 조회 계약의 회귀이므로 함께 수정 권고.

- [ ] 🟡 **D5. 일시적인 BE 잠금 시간 초과가 MCP 연결 영구 폐기로 이어짐** — [InternalMcpController.java:84](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:84), 교차 근거 [OAuthService.java:189](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:189) — **근거:** 새 BE 응답 `FAILED_TO_ACQUIRE_LOCK`도 AI에서는 `MintDeniedException`이며, refresh 처리기는 모든 해당 예외에 `store.revoke()`를 실행한다. — **시나리오:** 이름 수정의 Zabbix 호출이 사용자 행 잠금을 5초 넘게 유지하는 동안 MCP refresh가 들어오면, 세대·권한 변경이 없어도 연결이 폐기된다. — **수정 제안:** 재시도 가능한 오류와 영구 회수 사유를 계약에서 구분하고, 잠금 시간 초과에는 grant·refresh를 보존한다. — **후속 가능 여부:** 가능하나 이번 통합 변경의 정상 연결 회귀이므로 동시 수정 권고.

- [ ] 🟡 **D6. 새 IP 제한에 만료되지 않는 카운터가 남을 수 있음** — [AuthRateLimiter.java:58](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/AuthRateLimiter.java:58), [RedisClientService.java:82](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/service/RedisClientService.java:82) — **근거:** 공용 helper의 `INCR`와 `EXPIRE`가 별도 명령이며 TTL은 값이 1일 때만 설정한다. — **시나리오:** 최초 INCR 성공 후 EXPIRE 전에 프로세스 종료·통신 실패가 발생하면 이후 증가에서는 TTL을 복구하지 않는다. IP 한도 도달 뒤 15분이 지나도 로그인·OTP 발송 차단이 지속된다. — **수정 제안:** 증가와 TTL 설정을 Lua로 원자화하고, TTL 없는 기존 키 복구도 처리한다. — **후속 가능 여부:** 가능. 기존 helper 결함이지만 이번 변경으로 공유 IP 전체에 영향이 확대된다.

- [ ] 🟡 **D7. 이미 열린 MCP SSE 연결은 계정 회수를 재검사하지 않음** — [McpAccessInterceptor.java:79](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/McpAccessInterceptor.java:79), [VisitorSessionChecker.java:60](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/VisitorSessionChecker.java:60) — **근거:** `/event/stream`은 MCP 허용 경로다. 세대 검사는 연결 시 한 번이며, 이후 heartbeat의 `sessionChecker.require()`는 MCP면 즉시 통과한다. — **시나리오:** MCP로 스트림 연결 후 비밀번호 변경·계정 비활성화를 해도 연결 수명인 최대 30분 동안 신호가 계속 전달된다. 알람 본문은 전달되지 않는다. — **수정 제안:** MCP의 해당 SSE 접근을 차단하거나 heartbeat에서 현재 상태·권한·세대를 재검사한다. — **후속 가능 여부:** 가능하나 “모든 MCP 경로에 즉시 반영”의 예외로 명시해야 한다.

- [ ] 🟢 **D8. 역할 삭제 테스트의 상태 보존 assertion이 실제 실행과 무관함** — [RoleDeleteKeepsStatusTest.java:64](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/RoleDeleteKeepsStatusTest.java:64) — **근거:** `inactive` 객체를 생성하지만 repository 반환값이나 서비스 입력에 연결하지 않는다. 73~74행은 서비스가 접근하지 않은 객체를 검사한다. — **시나리오:** 다른 경로에서 사용자 상태를 변경해도 해당 assertion은 계속 통과한다. 기존 `update User` 쿼리 부재 검증 자체는 유효하다. — **수정 제안:** 미연결 객체 assertion은 제거하거나, 실제 저장·조회되는 사용자 상태를 검증하도록 바꾼다. — **후속 가능 여부:** 가능.

**중점 확인 요청 판정**

| 번호 | 판정 | 근거 |
|---|---|---|
| 1 | 수정 필요 | 잠금 안 판정·잠금 밖 서명 사이 폐기는 다음 요청의 세대 대조로 차단된다. `long`→JSON 정수→AI `Long`도 정합하다. 다만 동의 코드의 세대 누락(D2), 잠금 시간 초과의 영구 폐기(D5)가 남는다. AI의 동시 refresh 비조건부 교체는 기존 위험이며, 이번 변경이 세대 회수를 우회시키도록 악화한 근거는 없다. |
| 2 | 수정 필요 | Unicode 이메일 비교 우회(D1). 일반적인 동일 이메일·빈 값 처리, passwordless 계정의 자격 증명 변경 거부, 연동 계정의 슈퍼어드민 `user.update(passwd)` 경로는 확인했다. FE 저장 후 `AUTH.GET_ME` 무효화도 연결되어 있다. |
| 3 | 통과, 회수 예외 있음 | access·OTP·MCP 발급처의 `typ`와 파서 분리가 일치한다. refresh는 JWT가 아닌 저장소 토큰이며 내부 API는 별도 guard를 쓴다. SSE 최초 인증도 필터를 거친다. 열린 MCP SSE의 회수는 D7 참조. |
| 4 | 부분 통과 | 실패 시 username·IP 증가, 성공 시 username만 초기화, OTP 조회 전 집계는 맞다. TTL 원자성은 D6. 로그인 사용자 열거 방지 응답은 유지되지만 forgot/resend의 기존 `USER_NOT_FOUND` 구분은 남는다. 프록시·NAT 공유 시 공동 차단 위험이 있고 운영 IP 설정은 미확인이다. |
| 5 | 보안 판정 통과, 회귀 있음 | 미연동·빈 결과는 거부하고 엔진 예외도 리포트 서비스로 진행시키지 않는다. 가시성 결과 캐시는 없어 사용자 간 캐시 혼용은 없다. 실제 라이선스 데코레이터와 결합하면 D4가 발생한다. |
| 6 | 부분 통과 | 새 API의 행 잠금·커밋 전 세대 증가, ADMIN·SUPER_ADMIN 판정은 맞다. 다른 비활성화 경로는 D3. 추가된 `userRole`과 FE 우선 판정, 편집 폼의 상태 유지 규칙은 일치한다. 그룹 활성화·동기화의 재활성화는 계약서대로 보류된 위험으로 남는다. |
| 7 | BE 대상 아님 | B1은 FE 변경이며 BE 저장 형식 변경은 없다. 체크박스 값 보존의 최종 판정은 FE 검수 대상이다. |
| 8 | 보완 필요 | D8의 assertion은 공허하다. B2 테스트의 mock `InventoryPort`는 실제 라이선스 데코레이터를 제외하여 D4를 놓친다. rate limiter mock은 D6를 검출하지 못한다. 행 잠금 테스트는 수동 트랜잭션·`ReentrantLock` 대역이므로 실제 PostgreSQL·Spring 트랜잭션 검증과 구분해야 한다. |

**확인했고 문제없음**

- `markEmailVerified` 서비스 제거 후 운영 이메일 인증 경로가 유지된다.
- 일반 필드 수정·역할 삭제의 강제 ACTIVE 재설정은 제거됐다.
- 새 상태 API의 관리자 검사, 클래스의 `@VisitorIdCheck`, MCP 접근 차단과 응답 shape이 계약에 맞는다.
- 토큰 종류 분리와 일반 요청의 MCP 세대 불일치·누락 거부는 코드상 일치한다.

검수 범위는 HEAD `a2709d6` 대비 변경 20개 파일과 미추적 7개 파일이다. 파일 수정 없이 정적 검수와 이메일 판정 국소 실행을 수행했다. 전체 테스트·빌드·서버 기동·실제 DB 적용은 재실행하지 않았다.

### FE 검수 결과

판정: **수정 후 머지**

- [ ] 🔴 이메일 없는 계정은 편집·이메일 등록 불가 — [MyPage.tsx:335](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:335), [이메일 검증:262](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:262) — 근거: ‘편집’도 Form submit이므로 필수 이메일 검증을 통과해야 편집 모드에 진입한다. 이메일 입력은 그전까지 비활성이다 — 시나리오: BE 시드 메일 정리 마이그레이션 적용 후 `email:null`인 관리자가 편집을 클릭하면 `validation.require_field`가 발생하고 이메일을 입력할 수 없다. 실제 Form으로 재현 — 수정 제안: 편집 진입은 검증 없이 처리하고, 이름만 저장할 때는 미변경 빈 이메일을 허용 — 후속 가능 여부: **불가, 머지 전 수정**.

- [ ] 🔴 이전 계정의 상태 변경 확인창이 새 세션으로 요청을 전송 — [UserStatusAction.tsx:81](/C:/worktrees/zm-157-fe/src/components/user-roles/UserStatusAction.tsx:81), [user-roles.api.ts:189](/C:/worktrees/zm-157-fe/src/services/user-roles.api.ts:189) — 근거: 정적 `Modal.confirm`은 컴포넌트 해제 후에도 남고, 서비스는 확인창을 열었던 세션이 아닌 호출 순간의 `sessionEpoch`를 사용한다 — 시나리오: 확인창 열기→계정 전환·컴포넌트 해제→확인 순서에서 이전 대상에 새 epoch의 PATCH가 전송됨을 재현했다. 새 계정도 관리자라면 BE 관리자 검사로 막히지 않는다 — 수정 제안: 확인창을 열 때 epoch를 고정하고 실행 전 대조하며, 세션 전환 시 확인창을 닫기 — 후속 가능 여부: **불가, 머지 전 수정**.

- [ ] 🟡 프로필·비밀번호 동시 저장 시 저장 버튼이 영구 로딩 — [MyPage.tsx:319](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:319), [axiosInstance.ts:122](/C:/worktrees/zm-157-fe/src/services/axiosInstance.ts:122) — 근거: 프로필 저장 중에도 비밀번호 변경을 시작할 수 있다. 두 작업이 같은 `PUT /users/my-profile`을 호출하면 Axios가 선행 요청을 취소하고, 대체 요청이 진행 중이면 선행 Promise를 영구 pending으로 둔다 — 시나리오: 이름 저장 응답 지연 중 비밀번호 변경을 제출하면 비밀번호 변경 성공 후에도 프로필 저장 버튼이 로딩 상태에 남는다. 실제 인터셉터와 지연 응답 대역으로 재현 — 수정 제안: 두 저장 작업에 공통 진행 상태를 적용해 중복 제출 차단 — 후속 가능 여부: 가능하나 이번 수정 권고.

- [ ] 🟡 테스트가 실제 캐시·취소·세션 전환 경로를 검증하지 못함 — [zm157MyPage.test.tsx:14](/C:/worktrees/zm-157-fe/src/__tests__/zm157MyPage.test.tsx:14), [조회 훅 대역:91](/C:/worktrees/zm-157-fe/src/__tests__/zm157MyPage.test.tsx:91), [zm157UserStatus.test.tsx:38](/C:/worktrees/zm-157-fe/src/__tests__/zm157UserStatus.test.tsx:38) — 근거: Axios·조회 훅·정적 확인창을 대체하고, 마이페이지 기본 데이터에는 항상 이메일이 있다 — 시나리오: 위 세 결함이 남아도 현재 테스트가 검출하지 못한다 — 수정 제안: 실제 QueryClient·Form·Modal·인터셉터를 연결하고 HTTP 응답만 대체하여 NULL 이메일, 중복 저장, 확인 전 세션 전환을 검증 — 후속 가능 여부: **해당 결함 수정과 함께 보강**.

| 번호 | 판정 | 근거 |
|---|---|---|
| 1 | FE 범위 외 | MCP 발급·갱신·세대 경합은 BE·AI 담당. |
| 2 | 수정 필요 | 정상 이름 저장 후 `AUTH.GET_ME` 재조회·캐시 갱신은 실행 확인. 이메일 대소문자·공백 정규화와 비밀번호 없는 계정의 거부 정책은 정합. 위 편집 진입·동시 저장 결함 존재. |
| 3 | FE 범위 통과 | 재설정 저장의 실패 envelope은 성공 처리하지 않고, OTP 오류는 인증 단계로 복귀한다. 토큰 발급·파싱은 BE 범위. |
| 4 | FE 범위 외 | IP 제한 구현은 BE 담당. |
| 5 | FE 범위 외 | 그룹 가시성·캐시는 BE 담당. |
| 6 | 부분 통과 | `userRole` 우선 판정, 자기 자신·활성 관리자 숨김, 편집 폼 상태 계산은 BE와 일치. 필드 누락 시 `role.type` 오판 가능성은 남고, 확인창의 세션 격리는 실패. |
| 7 | 통과 | 체크박스만 잠그며 hidden Form 필드의 전체 권한 배열을 보존한다. 다른 칸 변경 시에도 잠긴 값은 유지된다. |
| 8 | 보강 필요 | 필수 입력·오류 envelope·권한 값 보존 테스트는 의미 있으나, 위 통합 경로에는 검출 공백이 있다. |

**확인했고 문제없음**

- 마이페이지의 관리자 전용 `zabbix-info` 의존 제거, 변경 필드만 전송, 비밀번호 별도 전송.
- 상태 API 경로·본문·오류 코드 4종 및 잠금 대상 권한 목록의 계약 정합.
- 정상 이름 저장과 공유 프로필 캐시 갱신을 메모리 실행으로 확인.

검수 중 파일은 수정하지 않았다. 전체 Jest·브라우저·실서버 검증은 미실행했다. `tsc --noEmit`은 요청서에 기록된 기존 `@dagrejs/dagre` 누락 1건으로 실패했으며, 추가 타입 오류는 보고되지 않았다.

### AI 검수 결과

판정: **수정 후 머지**

- [ ] 🔴 비밀번호 재설정 전 인가 코드로 새 연결 생성 가능 — [OAuthService.java:157](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:157), [PendingAuthStore.java:15](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/PendingAuthStore.java:15) — **근거:** 인가 코드에 동의 당시 세대가 없고, 코드 교환은 항상 `expectedGeneration=null`로 현재 세대를 발급받는다. V8도 Redis 인가 코드는 폐기하지 않는다. — **시나리오:** 동의 승인 → 비밀번호 변경·재설정 → 코드 유효기간 10분 안에 교환하면 재인증 없이 새 세대의 access·refresh가 생성된다. 배포 전 승인된 코드도 같은 경로를 탄다. — **수정 제안:** 동의 인증 검증과 일관된 시점에 확보한 세대를 코드에 저장하고, 교환 시 기대 세대로 검사한다. 세대 없는 기존 코드는 거부한다. — **후속 가능 여부:** 불가. A1 회수 원칙의 남은 구멍이다.

- [ ] 🟡 일시적인 BE 잠금 실패가 정상 연결을 영구 폐기 — [OAuthService.java:189](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:189), [BeMcpTokenClient.java:69](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/BeMcpTokenClient.java:69) — **근거:** 모든 실패 응답을 `MintDeniedException`으로 변환하고 무조건 grant를 폐기한다. 이번 BE는 잠금 대기 초과도 HTTP 200의 `FAILED_TO_ACQUIRE_LOCK`으로 반환한다([InternalMcpController.java:84](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:84)). — **시나리오:** 이름만 수정하는 트랜잭션이 Zabbix 응답을 기다리며 사용자 행을 5초 넘게 잠그면, 동시에 갱신한 MCP 연결은 권한·세대 변경 없이 끊긴다. — **수정 제안:** 영구 거부와 일시 장애를 구분하고, 잠금 실패에는 grant를 보존하며 재시도 가능한 오류를 반환한다. — **후속 가능 여부:** 이번 잠금 도입과 결합한 회귀이므로 머지 전 수정 권고.

- [ ] 🟡 같은 refresh의 동시 갱신이 모두 성공하는 기존 결함 잔존 — [OAuthStore.java:86](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthStore.java:86), [OAuthService.java:205](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:205) — **근거:** 교체 SQL은 `id`만 검사하며 이전 refresh 해시·활성 상태 조건과 갱신 행 수 확인이 없다. HEAD에도 동일하다. — **시나리오:** 두 요청이 같은 refresh를 먼저 조회하면 둘 다 성공 응답을 받지만, 마지막 DB 교체에서 살아남은 refresh 하나만 다음 갱신에 사용할 수 있다. — **수정 제안:** 이전 해시·미폐기·미만료 조건을 포함한 원자적 교체와 영향 행 수 검증을 적용한다. — **후속 가능 여부:** 가능. 기존 결함이며 이번 세대 추가가 회수 우회를 새로 만들지는 않는다.

- [ ] 🟡 세대 불일치 테스트가 grant 폐기 누락을 검출하지 못함 — [McpGrantGenerationTest.java:117](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/mcp/oauth/McpGrantGenerationTest.java:117) — **근거:** 응답 세대 누락·불일치 사례는 `invalid_grant`와 회전 미호출만 확인하고 `revoke`를 검증하지 않는다. 저장소·인가 코드도 mock이다. — **시나리오:** 해당 운영 분기의 `store.revoke(...)`를 제거해도 이 테스트는 통과하며, 위 인가 코드 경합·잠금 실패·동시 갱신도 검출하지 못한다. — **수정 제안:** 정확한 폐기 인자와 이후 재사용 거부를 검증하고, 위 실패 순서의 회귀 테스트를 추가한다. V8·JDBC 저장/조회는 PostgreSQL 통합 검증으로 보완한다. — **후속 가능 여부:** 회수·잠금 회귀 테스트는 수정과 함께 필요. DB 통합 검증 자동화는 별도 후속 가능.

| 번호 | 판정 | 근거 |
|---|---|---|
| 1 | **부분 부적합** | 승인된 인가 코드의 세대 결합 누락. 기존 refresh 동시 교체 결함 잔존. 발급 판정 후 폐기가 끼면 access는 BE 세대 검사에서 거부되고 이후 refresh도 차단된다. 숫자 `generation`/`gen` 정합은 확인. V8의 SQL 폐기는 정지 배포 전제에서 타당하나 Redis 코드는 남는다. |
| 2 | AI 범위 밖 | my-profile 화면·캐시·비밀번호 변경 구현은 BE·FE 담당. |
| 3 | AI 연계 적합 | AI는 `typ=mcp`를 요구하고 BE `/users/my-profile`로 검증한다. 내부 발급 응답은 JWT를 그대로 전달하므로 `typ` 추가와 충돌하지 않는다. BE 전체 발급처·SSE는 판정 범위 밖. |
| 4 | AI 범위 밖 | 로그인·OTP IP 제한은 BE 담당. |
| 5 | AI 범위 밖 | 그룹 가시성 판정은 BE 담당. |
| 6 | AI 연계 적합 | 저장된 세대를 갱신에 전달하고 세대 회수·계정 비활성 거부 시 grant를 폐기한다. 관리자 보호·FE 상태 표시는 판정 범위 밖. |
| 7 | AI 범위 밖 | 역할 편집 폼은 FE 담당. |
| 8 | **부분 미흡** | 요청 직렬화·응답 파싱 테스트는 유효하다. 폐기 상태 검증, 인가 코드 경합, 잠금 실패, 동시 교체, 실제 V8/JDBC 검증은 부족하다. |

**확인했고 문제없음**

- 옛 grant의 세대 누락, 갱신 응답의 세대 누락·불일치는 거부한다. 최초 발급 응답에 세대가 없으면 grant를 생성하지 않는다.
- BE 401 이후 AI 인증 캐시 폐기 흐름, BE 선배포·구버전 AI 병행 금지 안내를 확인했다.
- 기존 테스트 XML은 **179건, 실패·오류 0건**이다. 이번 검수는 읽기 전용 정적 검수이며 테스트 재실행·실제 DB 적용·런타임 검증은 수행하지 않았다. 파일 변경 없음.

---

## 1차 검수 반영 (Claude, 2026-09-17)

### BE
- [x] 🔴 D1 이메일 정규화 단일화 `EmailAddresses.normalize`(trim→NFC→Locale.ROOT 소문자) — DTO 5종·관리자 zabbix-info 저장/중복 검사·my-profile 변경 판정. Unicode `ı` 회귀 테스트, 터키어 기본 로케일 테스트.
- [x] 🔴 D2 `GET /internal/mcp/users/{userId}/generation` 신설, `/internal/mcp/tokens`는 `expectedGeneration` 없으면 `MCP_GRANT_REVOKED`.
- [x] 🔴 D3 `PUT /users/{id}` 비활성 그룹 배정 시 관리자 `CANNOT_DEACTIVATE_ADMIN`·본인 `CANNOT_CHANGE_OWN_STATUS`(그룹 교체·Zabbix 호출 전 판정). 그룹 비활성화 벌크는 관리자·요청자 제외 후 진행. 동기화는 SUPER_ADMIN을 INACTIVE로 만들지 않음.
- [x] 🟡 D4 그룹 가시성 판정은 라이선스 데코레이터를 거치지 않는 원 어댑터로, 빈 응답·오류는 거부(인증 만료만 401). 실제 데코레이터 포함 테스트.
- [x] 🟡 D5 BE는 `FAILED_TO_ACQUIRE_LOCK` 유지(일시 장애 주석).
- [x] 🟡 D6 `incrWithTtl` Lua 원자화 + TTL 없는 키 복구(로컬 Redis 격리 키 실측).
- [x] 🟡 D7 MCP 토큰의 `/event/stream` 접근 차단(AI 툴 사용처 없음 확인).
- [x] 🟢 D8 공허 assertion 교체.
- [x] **B4(사용자 결정 "이번에 넣자")** `V61__user_status_locked.sql` — 상태 API INACTIVE=잠금 켬, ACTIVE=해제(비활성 그룹 거부 시 유지). 그룹 활성화는 네이티브 SQL로 잠긴 사용자·**다른 비활성 그룹 소속 사용자** 제외(동작 변화). 동기화는 잠긴 사용자 INACTIVE 유지. 응답 `statusLocked`. dev DB 롤백 실측. 🔴 병합 순서 ZM-151(V60) → ZM-157(V61).
- 테스트: 루트 `*Test` 3,358 중 3,356 통과(실패 2 = `ApmCollectorLiveRuntimeTest` 로컬 otelcol 충돌, 앞선 두 실행은 통과), IT 0.

### AI
- [x] 🔴 D2 동의 승인 시점 세대 조회→인가 코드 저장→교환 시 `expectedGeneration`, 세대 없는 코드·조회 실패는 거부.
- [x] 🟡 D5 영구 거부 4종만 폐기, 잠금 실패·BE 호출 실패는 연결 보존 + 503 `temporarily_unavailable`(교환 중 코드 되돌림).
- [x] 🟡 refresh 조건부 교체(이전 해시·미폐기·미만료), 0행이면 `invalid_grant`.
- [x] 🟡 테스트: 상태 가진 메모리 저장소, 정확한 폐기 인자·재사용 거부, 동시 갱신 1건만 성공.
- 테스트: 전체 194 통과. 배포: BE 직후 AI 즉시(새 BE는 구 AI의 발급 요청을 모두 거부).

### FE
- [x] 🔴 이메일 없는 계정: 편집 버튼 분리(검증 없이 진입), 저장된 이메일이 있을 때만 필수, 신규 입력은 변경으로 취급(현재 비밀번호 요구).
- [x] 🔴 상태 확인창: 열 때 epoch 고정·세션 전환 시 닫기·확인 직전 대조·요청에 고정 epoch(axios 방어), `useMutation` 제거.
- [x] 🟡 동시 제출: 공통 진행 상태(ref+state)로 상호 비활성.
- [x] 🟡 실제 연결 테스트 `zm157RealWiring`(실제 axios 인터셉터·QueryClient·Form·Modal) 9건 — 5회 반복 통과.
- [x] **B4** 목록 "관리자가 비활성화함" 태그+툴팁, 편집 폼 저장 후 상태에 잠금 반영.
- 테스트: 관련 19 스위트 266 통과 · tsc·contract(환경 1) · eslint · 음성 대조.

## 검수 결과 (2차 — 1차 반영분 한정)

(Codex 2차 — 2026-09-17, read-only, BE·FE·AI 병렬)

### BE 2차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| D1 이메일 정규화 | 해결 | 비교·저장에 같은 정규화 적용. [EmailAddresses.java:23](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/EmailAddresses.java:23), [UpdateMyProfileDto.java:49](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/dto/request/UpdateMyProfileDto.java:49) |
| D2 동의 시점 세대 고정 | 해결 | 내부 API 경로·헤더·`data.generation` 일치. AI가 동의 세대를 코드에 저장·전달하며, BE는 기대 세대 누락·불일치를 거부. [InternalMcpController.java:124](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:124), [UserService.java:354](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:354), [ConsentService.java:63](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/ConsentService.java:63), [OAuthService.java:156](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:156) |
| D3 관리자·본인 보호 | 해결 | 편집은 변경 전 거부, 그룹 벌크는 보호 대상 제외, 동기화는 관리자 상태 유지. [UserService.java:723](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:723), [UserGroupService.java:259](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:259), [ZabbixSyncServiceImpl.java:292](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:292) |
| D4 ARCHIVED 저장 리포트 | 해결 | 원 어댑터 지정, 빈 응답·오류 거부, 인증 만료만 기존 처리. [HostGroupVisibilityChecker.java:49](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/host/HostGroupVisibilityChecker.java:49), [HostGroupVisibilityLicenseTest.java:57](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/host/HostGroupVisibilityLicenseTest.java:57) |
| D5 잠금 실패의 영구 폐기 | 해결 | BE의 `FAILED_TO_ACQUIRE_LOCK`과 AI 분류 일치. 코드 복원·grant/refresh 보존 후 503 반환. 영구 거부 4종도 일치. [InternalMcpController.java:87](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:87), [BeMcpTokenClient.java:41](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/BeMcpTokenClient.java:41), [OAuthService.java:165](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:165), [OAuthService.java:214](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:214) |
| D6 카운터 TTL | 부분 해결 | 증가·만료 원자화 완료. 이미 차단된 기존 키의 복구 누락은 아래 참조. [RedisClientService.java:82](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/service/RedisClientService.java:82), [AuthRateLimiter.java:44](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/AuthRateLimiter.java:44) |
| D7 MCP SSE | 해결 | `/event/stream` 및 하위 경로 차단. [McpAccessInterceptor.java:117](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/McpAccessInterceptor.java:117) |
| D8 공허 assertion | 해결 | 미연결 객체 검사 제거, 사용자 repository 미접근·삭제 쿼리 1건 검증. [RoleDeleteKeepsStatusTest.java:64](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/RoleDeleteKeepsStatusTest.java:64) |
| B4 개별 비활성화 표시 | 수정 필요 | 마이그레이션·상태 API·그룹 활성화 조건·응답 반영 확인. 동기화 경합에서 표시 보존 실패. [V61__user_status_locked.sql:11](C:/worktrees/zm-157-be/src/main/resources/db/migration/V61__user_status_locked.sql:11), [UserService.java:412](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:412), [UserGroupService.java:397](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:397), [UserResponseDto.java:76](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/dto/response/UserResponseDto.java:76) |

- [ ] 🔴 **B4: 동기화와 겹친 개별 비활성화가 취소되어 계정이 다시 활성화됨** — [ZabbixSyncServiceImpl.java:258](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:258), [User.java:35](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/domain/User.java:35) — **근거:** 동기화는 179행에서 잠금 없이 읽은 사용자 객체로 `statusLocked`를 판정하고 269행에서 저장한다. 최신 상태 재조회가 없으며, 엔티티에 `@Version`·`@DynamicUpdate`도 없어 다른 필드가 변경되면 이전 상태·표시까지 UPDATE된다. — **시나리오:** 동기화가 `ACTIVE/false`를 읽음 → 관리자가 상태 API로 `INACTIVE/true`를 저장·커밋 → 동기화가 Zabbix에서 바뀐 이름을 반영하며 이전 `ACTIVE/false`를 저장. 차단 계정이 다시 로그인할 수 있다. — **수정 제안:** 동기화에서도 사용자 행 잠금 후 최신 엔티티를 재조회/refresh하여 상태를 계산·저장하고, 이 순서의 실제 DB 경합 테스트를 추가한다. — **후속 가능 여부:** 불가, 계정 차단을 무효화하므로 머지 전 수정.

- [ ] 🟡 **D6: 이미 한도에 도달한 무기한 로그인 카운터는 복구되지 않음** — [AuthRateLimiter.java:44](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/AuthRateLimiter.java:44), [RedisClientService.java:82](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/service/RedisClientService.java:82) — **근거:** TTL 복구는 `incrWithTtl()`에만 있지만, `checkLogin()`이 한도 이상이면 먼저 거부하여 증가·복구 경로에 도달하지 않는다. — **시나리오:** 구 구현에서 `TTL=-1`인 `RATE_LOGIN:*` 키가 10 이상으로 남으면 수정본 배포 후에도 계속 로그인 차단된다. IP 키도 동일하다. — **수정 제안:** 사전 검사에서도 TTL 없는 키를 원자적으로 복구하거나 배포 시 잔존 키를 일회 정리한다. — **후속 가능 여부:** 가능. 신규 무기한 키 생성은 해결됐으며 기존 잔존 키 복구 문제다.

요청한 반영분만 정적 검수했다. 파일 수정, 테스트·빌드 재실행 및 실제 DB 경합 검증은 수행하지 않았다.

### FE 2차 검수 결과

판정: **머지 가능**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 1차 ① 이메일 없는 계정 편집·등록 | 해결 | 검증 없이 편집 진입, 기존 이메일이 없으면 빈 값 저장 허용. [MyPage.tsx:360](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:360), [이메일 검증:284](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:284) |
| 1차 ② 이전 세션 확인창의 상태 변경 | 해결 | 확인창 생성 시 epoch 고정, 세션 전환 시 닫기, 실행 전 대조 및 요청에 고정값 전달. [UserStatusAction.tsx:96](/C:/worktrees/zm-157-fe/src/components/user-roles/UserStatusAction.tsx:96), [요청:193](/C:/worktrees/zm-157-fe/src/services/user-roles.api.ts:193) |
| 1차 ③ 프로필·비밀번호 동시 저장 | 해결 | 공통 `ref`·state로 중복 제출 차단. 양방향 요청 취소 방지와 로딩 해제 확인. [MyPage.tsx:107](/C:/worktrees/zm-157-fe/src/pages/setting/MyPage.tsx:107), [회귀 테스트:176](/C:/worktrees/zm-157-fe/src/__tests__/zm157RealWiring.test.tsx:176) |
| 1차 ④ 실제 연결 테스트 공백 | 해결 | 실제 QueryClient·Form·Modal·Axios 인터셉터를 연결한 9건 통과. [zm157RealWiring.test.tsx:19](/C:/worktrees/zm-157-fe/src/__tests__/zm157RealWiring.test.tsx:19), [realDmoveApi.ts:24](/C:/worktrees/zm-157-fe/src/__tests__/support/realDmoveApi.ts:24) |
| B4 개별 비활성화 표시·편집 상태 | 적합 | `statusLocked=true`에만 태그·툴팁 표시, 편집 상태에 잠금 반영. [UserList.tsx:248](/C:/worktrees/zm-157-fe/src/pages/user-roles/UserList.tsx:248), [UserFormModal.tsx:202](/C:/worktrees/zm-157-fe/src/components/Modal/UserFormModal.tsx:202), [usersRoles.ts:28](/C:/worktrees/zm-157-fe/src/utils/usersRoles.ts:28) |
| BE DTO 대조 | 일치 | 실제 DTO의 `userRole`은 `USER/ADMIN/SUPER_ADMIN` 또는 null, `statusLocked`는 boolean이며 엔티티에서 직접 매핑. FE는 `userRole` 우선 판정·boolean 표시를 사용. [UserResponseDto.java:46](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/dto/response/UserResponseDto.java:46), [값 매핑:75](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/dto/response/UserResponseDto.java:75), [FE 판정:33](/C:/worktrees/zm-157-fe/src/components/user-roles/UserStatusAction.tsx:33) |

범위 내 테스트 **14건 통과**(통합 9건·B4 4건·`userRole` 1건). 파일 변경 없이 검수했으며, 브라우저·실서버 검증은 미실행.

### AI 2차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| D2 동의 시점 세대 고정 | 부분 해결 — 폐기 도중 승인 경합 잔존 | 세대 저장·전달·누락 거부는 구현됨. [ConsentService.java:63](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/ConsentService.java:63), [OAuthService.java:156](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:156) |
| D5 일시 장애 시 연결 보존 | 해결 | BE의 HTTP 200·`FAILED_TO_ACQUIRE_LOCK`을 구분하여 코드 복원 또는 refresh 보존 후 HTTP 503·`temporarily_unavailable` 반환. [InternalMcpController.java:87](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:87), [OAuthService.java:164](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:164), [OAuthService.java:213](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:213) |
| refresh 조건부 교체 | 해결 | 이전 해시·미폐기·미만료 조건으로 UPDATE하고, 0행이면 `invalid_grant`. [OAuthStore.java:92](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthStore.java:92), [OAuthService.java:242](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/OAuthService.java:242) |
| 폐기·재사용·동시 갱신 테스트 | 부분 해결 | 정확한 폐기 인자·재사용 거부·동시 갱신 1건 성공은 검증함. D2는 승인 완료 후 세대 변경만 모사하여 아래 경합은 검출하지 못함. [McpGrantGenerationTest.java:218](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/mcp/oauth/McpGrantGenerationTest.java:218), [동시 갱신:334](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/mcp/oauth/McpGrantGenerationTest.java:334), [D2 테스트:436](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/mcp/oauth/McpGrantGenerationTest.java:436) |

- [ ] 🔴 D2: 폐기 도중 승인된 코드로 재설정 후 연결 생성 가능 — [ConsentService.java:63](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/oauth/ConsentService.java:63) — **근거:** BE는 [RefreshTokenService.java:102](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RefreshTokenService.java:102)에서 세대 증가와 세션 삭제를 별도로 실행한다. 새 [세대 조회:367](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:367)는 사용자 행을 잠그지 않고, [세션 검사:66](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/VisitorSessionChecker.java:66)는 visitor 값만 대조한다. — **시나리오:** 비밀번호 재설정이 세대를 5→6으로 올린 직후, 세션 삭제 전에 AI가 세대 6을 조회하고 기존 세션으로 my-profile 검사를 통과한다. 이후 세션 삭제·재설정 커밋이 완료되어도 코드는 `expectedGeneration=6`으로 교환되어 새 연결이 생성된다. — **수정 제안:** BE 세대 조회를 폐기와 동일한 사용자 행 잠금으로 직렬화하고 AI의 조회 후 인증 재검증을 유지하거나, 세대 증가·세션 삭제를 원자화한다. 세대 증가 직후 폐기를 멈추고 동의 승인을 끼워 넣는 회귀 테스트를 추가한다. — **후속 가능 여부:** 불가. 비밀번호 재설정에 따른 연결 회수 우회이므로 머지 전 수정 필요.

읽기 전용 정적 검수이며 파일 변경·테스트 재실행은 하지 않았다. 기존 테스트 XML은 전체 **194건**, 관련 테스트 **26건**, 실패·오류 **0건**이다.

---

## 2차 검수 반영 (Claude, 2026-09-17)
- [x] 🔴 B4 동기화 경합: `syncOneUserLocked` — 사용자 id 오름차순 행 잠금(대기 10초) → 최신 엔티티 재조회 → 판정·반영. 동기화 트랜잭션은 하나로 유지. `ZabbixSyncLockRaceTest`(실제 스레드).
- [x] 🔴 D2 폐기 원자성: `RefreshTokenStore.revokeAll`(Lua: 세대 INCR + 세션·세션 계열 키 삭제), 세대 조회 `mcpGenerationOf`는 행 잠금(대기 5초) 아래, 초과 시 200 + `FAILED_TO_ACQUIRE_LOCK`. 끼워 넣기 순서 회귀 테스트, 로컬 Redis 실측.
- [x] 🟡 D6 사전 검사 `getCountRepairingTtl`(Lua, TTL 없는 키 복구, 증가 없음).
- 테스트: 루트 `*Test` 3,367 전부 통과(IT 0), engine-zabbix 126.

## 검수 결과 (3차 — 2차 반영분 한정, BE)

(Codex 3차 — 2026-09-17, read-only)

### BE 3차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| B4 동기화와 개별 비활성화 경합 | **미해결** | 행 잠금은 추가됐지만, 외곽 트랜잭션에서 이미 읽은 엔티티를 `findById()`가 재사용한다. [ZabbixSyncServiceImpl.java:306](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:306), [UserService.java:1285](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1285) |
| D2 폐기 원자성·세대 조회 직렬화 | 해결, 가용성 문제는 아래 참조 | `REFRESH_GEN:<id>` 증가와 `USER_LOGIN_KEY_<id>`·`REFRESH_SESSION_FAMILY:<id>` 삭제가 단일 Lua로 실행된다. 세대 조회는 단일 사용자 행 잠금 → Redis 조회 순서이며, 5초 대기 초과 응답도 반영됐다. 해당 경로 자체의 잠금 순서 역전은 발견하지 못했다. [RedisRefreshTokenStore.java:109](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:109), [키 전달:141](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:141), [UserService.java:370](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:370), [InternalMcpController.java:135](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/InternalMcpController.java:135) |
| D6 이미 차단된 무기한 카운터 복구 | 해결 | username·IP 사전 검사에서 Lua를 호출하며, 기존 키의 `TTL=-1`일 때만 만료를 부여한다. 값 증가·기존 만료 연장은 없다. [AuthRateLimiter.java:44](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/AuthRateLimiter.java:44), [RedisClientService.java:107](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/service/RedisClientService.java:107) |

- [ ] 🔴 **동기화의 사용자 잠금이 후속 원격 호출까지 유지되어 로그인·MCP를 집단 차단함** — [ZabbixSyncServiceImpl.java:275](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:275), [UserService.java:1285](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1285) — **근거:** 변경 없는 사용자를 포함한 기존 연동 사용자 전원을 잠근다. 내부 `TransactionTemplate`은 `runSync()`의 외곽 트랜잭션에 참여하므로 사용자 처리 종료 시 잠금이 해제되지 않는다. 일괄 저장·비활성 사용자별 Redis 폐기·관계 테이블 교체 이후에도 [역할 조회:971](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:971), [권한 조회 3회:1052](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1052)가 잠금 아래 실행된다. 동기화의 10초 설정은 **개별 잠금 획득 대기 상한**이지 보유 시간 제한이 아니다. — **시나리오:** 수백~수천 명을 순차 처리하면서 뒤쪽 사용자 잠금을 6초 기다리거나, 전원 잠금 후 Zabbix 호출이 6초 지연되면 앞서 잠근 사용자들의 로그인·MCP 발급·세대 조회는 5초 후 `FAILED_TO_ACQUIRE_LOCK`으로 실패한다. [상태 API:417](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:417)는 자체 대기 상한이 없어 더 오래 대기한다. 수동 동기화에서도 발생하며, `user_sync`를 활성화하면 설정 주기마다 반복 가능하다([시드 기본값은 비활성·10분:39](C:/worktrees/zm-157-be/src/main/resources/db/migration/V15__scheduler_setting.sql:39)). — **수정 제안:** 외곽 `runSync()` 트랜잭션부터 분리하고 Zabbix 조회를 잠금 전에 완료한다. 사용자별로 잠금 → 최신 상태 조회 → 변경·필요한 폐기 → 커밋하는 짧은 트랜잭션을 구성한다. 후속 역할·관계 처리까지 사용자 잠금을 유지하지 않도록 하고, 원격 지연·대량 사용자 동시 요청 테스트를 추가한다. — **후속 가능 여부:** 불가. 동기화가 광범위한 인증 가용성 장애를 유발하므로 머지 전 수정.

- [ ] 🔴 **B4 잔존: 잠금 뒤에도 JPA에 남은 이전 상태로 계정을 재활성화할 수 있음** — [ZabbixSyncServiceImpl.java:306](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:306) — **근거:** [179행의 최초 조회](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:179)도 `runSync()` 트랜잭션 안이므로 엔티티가 관리 상태로 남는다. ID만 반환하는 `lockById()`는 이를 갱신하지 않으며, 뒤의 `findById()`도 같은 영속성 컨텍스트의 객체를 반환한다. `refresh()`가 없다. — **시나리오:** 동기화가 `ACTIVE/false`를 읽음 → 관리자가 `INACTIVE/true`를 커밋 → 동기화가 행 잠금을 얻음 → 캐시된 `ACTIVE/false`로 이름 변경 등을 저장하여 비활성화를 취소한다. 추가된 [ZabbixSyncLockRaceTest.java:63](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncLockRaceTest.java:63)는 `findById()`마다 최신 객체를 생성하는 mock이라 이 경합을 검출하지 못한다. — **수정 제안:** 잠금 획득 후 변경 전에 엔티티를 명시적으로 `refresh()`하거나, 사용자별 새 영속성 컨텍스트에서 잠금 후 처음 조회하도록 구성한다. 실제 Spring 트랜잭션·PostgreSQL로 위 순서의 회귀 테스트를 추가한다. — **후속 가능 여부:** 불가. 2차의 계정 차단 무효화 결함이 남아 있다.

읽기 전용 정적 검수다. 열람한 관련 테스트 XML은 39건, 실패·오류 0건이지만 실제 DB 경합·대량 처리 시간은 검증하지 못한다. 파일 변경과 테스트 재실행은 하지 않았다.

## 3차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 동기화 가용성: `runSync()` 외곽 `@Transactional` 제거. Zabbix 조회 → 스냅샷(트랜잭션 밖) → 삭제·생성 짧은 트랜잭션 → **바뀐 사용자만** 사용자별 `REQUIRES_NEW`(행 잠금 → 조회 → `EntityManager.refresh` → 재판정 → 저장 → INACTIVE면 커밋 전 폐기). 관계 수집은 읽기, 교체는 별도 트랜잭션. 사용자 잠금 대기 10초 초과는 그 사용자만 건너뜀(WARN, 응답은 성공). 역할 연결 UPDATE는 값이 다른 행만.
- [x] 🔴 B4 영속성 캐시: 잠금 후 `refresh`. 단위 테스트는 같은 객체를 돌려주는 목, `refresh` 제거 시 실패 확인.
- [x] 사용자 행 잠금을 `FOR NO KEY UPDATE`로(관계 테이블 FK 검사와 비충돌, 잠금끼리·UPDATE와는 직렬화 유지).
- [x] 상태 API 대기 상한 5초 + `FAILED_TO_ACQUIRE_LOCK`.
- 테스트: 루트 `*Test` 3,369 통과, 새 IT `ZabbixSyncStatusLockIT` 4/4(다른 테스트 워커 없음 확인 후 단독 실행, `refresh` 제거 시 실패 확인).

## 검수 결과 (4차 — 동기화 재구성 한정, BE)

(Codex 4차 — 2026-09-17, read-only)

### BE 4차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 동기화의 장시간 사용자 잠금 | 부분 해결 | 사용자 갱신은 `REQUIRES_NEW`로 분리됐고 Zabbix 호출도 빠졌다. 다만 역할 연결의 일괄 잠금은 아래 잔존한다. [ZabbixSyncServiceImpl.java:303](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:303), [UserService.java:1051](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1051) |
| B4 개별 비활성화·영속성 캐시 | 해결 | 잠금 뒤 `refresh`하고 최신 `statusLocked`로 재판정한다. 현재 호출 경로에서 같은 결함을 만드는 `refresh` 누락은 발견하지 못했다. 그룹 상태 스냅샷 문제는 아래 별도 기재. [ZabbixSyncServiceImpl.java:358](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:358) |
| `FOR NO KEY UPDATE` 전환 | 사용자 행 직렬화 유지 | 모든 `lockById` 사용처와 `lockUser` 경유 로그인·폐기·상태 변경·OTP 경로를 확인했다. 동일 잠금 및 UPDATE·DELETE와 충돌하므로 사용자 행 직렬화는 유지된다. [UserRepository.java:26](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/repository/UserRepository.java:26), [PostgreSQL 잠금 호환표](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) |
| 상태 API 대기 상한 | 해결 | 트랜잭션에 5초 `lock_timeout`을 적용하고 컨트롤러가 잠금 예외를 `FAILED_TO_ACQUIRE_LOCK`으로 변환한다. [UserService.java:421](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:421), [UserController.java:426](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:426) |
| 테스트 검출력 | 부분 충족 | 캐시된 엔티티의 재활성화와 상태 API 잠금 초과는 검출한다. 원격 지연 테스트는 사용자 잠금 획득 **전**에 멈추며 `runSync()`·역할 단계를 거치지 않는다. 그룹 fixture도 비어 있어 관계 소실·그룹 경합·부분 실패는 검출하지 못한다. [ZabbixSyncLockRaceTest.java:103](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncLockRaceTest.java:103), [ZabbixSyncStatusLockIT.java:69](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:69), [동일 파일:121](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:121) |

- [ ] 🔴 **그룹 교체가 먼저 커밋되어 후속 실패 시 기존 관계가 소실됨** — [UserService.java:1329](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1329), [ZabbixSyncServiceImpl.java:142](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:142) — **근거:** 외곽 트랜잭션 제거로 호스트 그룹·사용자 그룹 삭제가 각각 커밋된다. FK의 `ON DELETE CASCADE`가 관계를 삭제하지만 복구는 사용자 처리 이후의 별도 트랜잭션이다([V1__baseline.sql:916](/C:/worktrees/zm-157-be/src/main/resources/db/migration/V1__baseline.sql:916)). — **시나리오:** 사용자 그룹 교체 후 `getBasicUsersInfo()`가 실패하면 사용자–그룹·그룹–호스트 관계가 복구되지 않는다. 정상 처리 중에도 관계가 빈 구간에서 상태 API가 비활성 그룹 소속을 놓쳐 활성화를 허용할 수 있다. — **수정 제안:** 원격 데이터를 먼저 수집하고, 기존 관계를 유지하는 upsert 또는 staging 후 원자적 교체로 전환한다. 그룹·관계가 있는 fixture로 후속 조회·저장 실패를 주입해 기존 연결과 상태 제한이 보존되는지 검증한다. — **후속 가능 여부:** 불가. 기존 원자성 제거로 발생한 데이터 소실 회귀다.

- [ ] 🔴 **사용자만 refresh하여 동시 그룹 비활성화를 취소할 수 있음** — [ZabbixSyncServiceImpl.java:296](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:296), [동일 파일:363](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:363) — **근거:** `inInactiveGroup`은 초반 `SyncContext`에서 계산한 값이다. 잠금 뒤 사용자 엔티티를 refresh해도 그룹 판정에는 그 값을 그대로 사용한다. — **시나리오:** 동기화가 G를 ACTIVE로 수집 → 그룹 API가 `userIds`에 U를 명시하여 G와 U를 INACTIVE로 변경·커밋 → 이름 변경이 있는 U의 동기화가 재개된다. 최신 U는 `INACTIVE/statusLocked=false`지만 오래된 그룹 판정으로 ACTIVE가 된다. — **수정 제안:** 사용자 갱신 시 대상 그룹의 최신 상태·변경 버전을 재검증하고, 판정과 저장 사이에도 그룹 변경이 끼지 않도록 직렬화하거나 충돌 시 재시도한다. 이 순서의 DB 경합 테스트를 추가한다. — **후속 가능 여부:** 불가. 그룹 비활성화가 완료된 계정을 다시 활성화한다.

- [ ] 🔴 **사용자 비활성화 실패를 건너뛰고 관계 변경과 동기화 성공을 확정함** — [ZabbixSyncServiceImpl.java:312](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:312), [동일 파일:218](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:218) — **근거:** 사용자별 예외는 전부 삼키며 `UpdateOutcome`도 호출부가 사용하지 않는다. 실패한 사용자까지 새 관계에 포함하고 이후 성공 시각을 기록한다. — **시나리오:** Zabbix의 비활성 그룹에 속한 ACTIVE 사용자의 잠금 획득이 10초를 넘으면 상태 변경·세션 폐기는 실행되지 않는다. 관계만 비활성 그룹으로 연결된 채 동기화가 성공하며, 사용자는 로컬 상태 기준 인증을 계속 통과할 수 있다. — **수정 제안:** 상태·관계·필요한 폐기를 사용자 단위의 일관된 적용 대상으로 묶는다. 실패한 비활성화를 성공 처리하지 말고 실패를 전파하며, 재시도를 보장한다. 잠금 초과·폐기 실패 주입 테스트를 추가한다. — **후속 가능 여부:** 불가. 계정 차단 실패가 성공 응답에 가려진다.

- [ ] 🟡 **역할 연결에서는 앞서 갱신한 사용자 잠금이 후속 사용자 대기 동안 누적됨** — [UserService.java:991](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:991), [동일 파일:1051](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1051) — **근거:** 여러 역할의 사용자 UPDATE가 하나의 트랜잭션에서 실행되고 별도 잠금 대기 상한이 없다. 원격 호출은 제거됐지만 잠금 보유가 짧다고 보장되지는 않는다. — **시나리오:** 역할 A의 사용자들을 갱신한 뒤 역할 B의 사용자 잠금을 오래 기다리면 A 사용자들의 로그인·MCP·상태 API도 5초 초과로 실패한다. — **수정 제안:** 역할 연결에도 짧은 처리 단위와 대기 상한·재시도 정책을 적용하고, 뒤쪽 사용자 경합 중 앞쪽 사용자 잠금 해제를 검증한다. — **후속 가능 여부:** 가능. 변경 없는 사용자 전체를 잠그던 문제는 해결됐고, 잔존 영향은 역할 변경 대상에 한정된다.

읽기 전용 정적 검수다. 파일 변경·테스트 재실행은 하지 않았다. 기존 `ZabbixSyncLockRaceTest` XML은 5건 통과를 확인했으며, 요청서의 IT 4/4 실행 결과는 독립적으로 재검증하지 않았다.

## 4차 검수 반영 (Claude, 2026-09-17 — 설계 전환)

- [x] 사용자별 잠금 구조 폐기. `ZabbixSyncService(Impl)` 재작성:
  - 트랜잭션 밖: 로컬 스냅샷(사용자 `xmin`·상태·이름, 사용자 그룹·소속 버전 지문) → Zabbix 조회 전부(호스트 그룹·사용자 그룹·사용자·역할·권한 스키마).
  - 한 트랜잭션(잠금 대기 10초): 지문 재확인(다르면 `ZABBIX_SYNC_CONFLICT` 롤백) → 그룹 교체 → 사용자 삭제·생성 → 관계 교체(`unnest` 한 문장) → 상태 조건부 UPDATE(비활성화는 관리자 제외·영향 행이면 커밋 전 폐기 / 활성화는 `status_locked=false`·비활성 소속 없음·`xmin` 일치) → 동기화 소유 4개 열 표적 UPDATE → 역할 적용.
  - 실패는 전체 롤백 + 예외 전파(성공 시각 미기록). 트랜잭션 안 원격 호출 없음(전수 확인).
- 실측(IT, 사용자 1,000): 100명 변경 0.41초, 변경 없음 0.23초.
- 테스트: 루트 `*Test` 3,365(검출력 없는 목 테스트 3개 삭제), engine-zabbix 126, IT `ZabbixSyncStatusLockIT` 8/8.

## 검수 결과 (5차 — 동기화 설계 전환 한정, BE)

(Codex 5차 — 2026-09-17, read-only)

### BE 5차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 🔴 후속 실패 시 그룹·관계 소실 | 해결 | 그룹·사용자·관계·역할 적용이 하나의 트랜잭션에 참여한다. [UserService.java:1338](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1338), [ZabbixSyncServiceImpl.java:202](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:202) |
| 🔴 옛 그룹 스냅샷으로 비활성화 취소 | **부분 해결** | 지문 확인 전에 커밋된 변경은 검출하지만, 확인과 교체 사이의 변경은 보호하지 못한다. 아래 결함 참조. [ZabbixSyncServiceImpl.java:208](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:208) |
| 🔴 비활성화 실패 은폐 | 해결 | UPDATE·Redis 폐기 예외가 전파되어 전체 DB 변경이 롤백된다. 성공 시각은 트랜잭션 완료 후 기록한다. [ZabbixSyncServiceImpl.java:391](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:391), [UserService.java:1342](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1342) |
| 🟡 역할 연결의 잠금 누적 | 부분 해결·후속 가능 | `runSync()`에는 10초 잠금 대기 상한이 적용된다. 다만 선행 사용자 잠금은 후속 UPDATE·사용자별 Redis 호출·역할 처리까지 유지된다. `syncRoles()` 단독 경로에는 상한 설정이 없다. [ZabbixSyncServiceImpl.java:207](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:207), [UserService.java:977](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:977) |
| 테스트 검출력 | 부분 충족 | 관계·상태 롤백과 폐기 실패는 검증한다. 그러나 역할 응답은 항상 빈 목록이고, `xmin` 경합 테스트는 스냅샷이 ACTIVE라 활성화 SQL 자체를 건너뛴다. 지문 확인 **후** 경합도 없다. [ZabbixSyncStatusLockIT.java:91](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:91), [경합 테스트:189](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:189), [롤백 테스트:223](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:223) |

- [ ] 🔴 **지문 확인 직후의 그룹 변경을 옛 스냅샷으로 덮어쓸 수 있음** — [ZabbixSyncServiceImpl.java:208](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:208), [그룹 교체:276](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:276) — **근거:** 지문 조회는 잠금 없는 SELECT이고, 이후 DELETE·재삽입에는 버전 조건이나 재검증이 없다. READ COMMITTED에서는 조회 후 커밋된 변경을 후속 DELETE가 삭제할 수 있다. [PostgreSQL 문서](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-READ-COMMITTED) — **시나리오:** G=ACTIVE 스냅샷 → 적용 트랜잭션의 지문 확인 통과 → 그룹 API가 G·U를 INACTIVE로 커밋 → 동기화가 G를 ACTIVE로 재삽입한다. U가 이번 회차에는 INACTIVE로 유지되더라도 그룹 차단 조건이 사라져 후속 ACTIVE 요청을 허용한다. — **수정 제안:** 그룹·소속 쓰기를 막는 직렬화 수단을 확보한 **뒤** 지문을 재확인하고 교체한다. 지문 확인 직후 그룹 변경을 커밋시키는 DB 경합 테스트를 추가한다. — **후속 가능 여부:** 불가. 그룹 비활성화 상태와 활성화 제한이 유실된다.

- [ ] 🟡 **native UPDATE 전환으로 사용자 수정 시각 갱신 누락** — [ZabbixSyncServiceImpl.java:114](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:114), [상태 UPDATE:125](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:125) — **근거:** 기준 커밋의 엔티티 저장은 [BaseEntity.java:38](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/domain/BaseEntity.java:38)의 `@UpdateTimestamp`를 적용한다. 새 native SQL은 `updated_at`을 쓰지 않으며, 해당 열을 갱신하는 DB trigger도 없다. — **시나리오:** 동기화로 이름·성이 바뀌거나 계정이 비활성화되어도 응답의 `updatedAt`과 수정일 정렬은 이전 시각을 유지한다. — **수정 제안:** 실제 변경이 발생하는 필드·상태 UPDATE에 기존 시간대 규약을 따른 수정 시각 갱신을 추가하고 검증한다. — **후속 가능 여부:** 가능. 다만 기존 필드 반영의 기능 동등성 차이로 남는다.

그 밖의 생성·삭제, 그룹·호스트 그룹 교체, 관계, 역할·권한 스키마 처리에서는 기준 커밋 대비 누락을 발견하지 못했다. SQL의 테이블·열·enum 캐스팅·소속 조건·`xmin` 대조는 스키마와 부합하며, 정상 순차 실행이 지문 오탐으로 항상 실패하는 구조도 발견하지 못했다. Zabbix 조회는 적용 트랜잭션 밖이고, Redis 폐기는 안에 남아 있다.

읽기 전용 정적 검수다. 파일 변경·테스트 재실행은 하지 않았다. 보존된 지정 단위 테스트 XML은 총 10건 통과이며, 요청서의 IT 8/8 결과는 독립적으로 재검증하지 않았다.

## 5차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 `MembershipLock`(`pg_advisory_xact_lock(9157000001)`) — 동기화 적용(지문 확인 전), 사용자 그룹 생성·수정·삭제, 관리자 사용자 생성(그룹)·수정(userGroupIds)·삭제, 상태 API 활성화가 트랜잭션 맨 앞에서 잡음(advisory → 사용자 행). `lock_timeout` 적용 확인(동기화·관리자 10초, 상태 API 5초), 초과 시 `FAILED_TO_ACQUIRE_LOCK`(EntityManager 경로 직접 변환). `DELETE /users/user-groups`는 기존 넓은 catch로 `ZABBIX_API_ERROR`일 수 있음(원본 보존).
- [x] 🟡 동기화 UPDATE 3문장에 `updated_at`(clock_timestamp).
- [x] `syncRoles()` 대기 상한 10초, 역할 벌크 삭제 전 flush+detach(기존 `StaleObjectStateException` 결함 수정).
- 테스트: 루트 `*Test` 3,367, IT 14/14((f) 지문 직후 그룹 변경 대기·반영, (g) 반대 순서 충돌, (g2) advisory 대기 실패, (k) updated_at, (l) 역할 응답 있음, (m) INACTIVE 스냅샷 xmin). 규모: 1,000명 100명 변경 0.22초.

## 검수 결과 (6차 — advisory lock 한정, BE)

(Codex 6차 — 2026-09-17, read-only)

### BE 6차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 그룹·소속 쓰기 직렬화 | 부분 해결 | 동기화는 잠금 후 지문을 확인한다. 직접적인 사용자 그룹·소속 쓰기는 잠금을 획득하지만, 잠금 전 조회값 재사용과 호스트 그룹 삭제 CASCADE 누락이 남는다. [ZabbixSyncServiceImpl.java:211](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:211), [UserGroupService.java:256](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:256) |
| advisory → 사용자 행 순서 | 확인 | 확인한 호출 경로에서 역순 획득은 발견하지 못했다. `/admin/users` 생성은 소속을 쓰지 않아 잠금 누락에 해당하지 않는다. [UserService.java:431](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:431), [같은 파일:687](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:687), [AdminUserService.java:94](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/admin/AdminUserService.java:94) |
| `lock_timeout` 선적용·예외 변환 | 부분 해결 | 획득 전에 5초/10초를 설정하며 advisory 예외의 Spring 변환도 있다. 다만 동기화 API의 계약 오류 변환은 빠졌다. [MembershipLock.java:39](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/MembershipLock.java:39), [UserController.java:477](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:477) |
| 동기화 `updated_at` | 해결 | 변경 조건이 있는 UPDATE 세 문장 모두 `clock_timestamp()`를 기록한다. [ZabbixSyncServiceImpl.java:114](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:114) |
| `syncRoles()` 대기 상한·flush/detach | 해결 | 단독 경로에도 10초를 설정한다. 삭제 전 flush 후 삭제 대상 Role만 detach하며, Role에 연관 엔티티 cascade가 없어 다른 객체를 분리하는 부작용은 발견하지 못했다. [UserService.java:1014](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1014), [같은 파일:1022](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:1022) |
| 테스트 검출력 | 부분 충분 | 지문 직후 경합·반대 순서·advisory timeout·수정 시각·역할·xmin 검증이 추가됐다. 아래의 잠금 전 조회값 재사용 시나리오는 없다. [ZabbixSyncStatusLockIT.java:414](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:414), [ZabbixSyncSqlTest.java:45](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncSqlTest.java:45) |

- [ ] 🔴 **잠금 전에 읽은 그룹 상태·소속을 재사용하여 비활성화를 누락함** — [UserGroupService.java:257](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:257), [UserService.java:663](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:663) — **근거:** 그룹 수정은 잠금 전 `existingGroup.status`로 사용자 상태 변경 여부를 판단한다. 사용자 생성도 잠금 전에 계산한 `hasInactiveGroup`과 그룹 객체를 그대로 저장한다. — **시나리오:** 로컬 G·U가 INACTIVE이고 동기화가 ACTIVE 스냅샷을 확보한 상태에서, 그룹 INACTIVE 요청이 기존 상태를 읽고 잠금을 기다린다. 동기화가 G·U를 ACTIVE로 커밋하면, 대기하던 요청은 옛 상태가 INACTIVE라는 이유로 사용자 UPDATE·세션 폐기를 생략하고 **G만 INACTIVE, U는 ACTIVE**로 남긴다. 사용자 생성도 ACTIVE 그룹 조회 후 그룹 비활성화가 커밋되면 같은 불일치를 만든다. — **수정 제안:** 잠금 획득 후 최신 그룹 상태·소속을 재조회하여 판정하고, 생성 시 상태를 다시 계산한다. 그룹 삭제의 소속 없음 검사도 잠금 후 재검증한다([UserGroupService.java:319](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:319)). 해당 순서의 경합 IT를 추가한다. — **후속 가능 여부:** 불가. 비활성화 요청 성공 후에도 계정이 ACTIVE로 남는 보안 결함이다.

- [ ] 🟡 **호스트 그룹 삭제의 소속 CASCADE가 advisory lock을 우회함** — [HostGroupService.java:275](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:275), [V1__baseline.sql:924](/C:/worktrees/zm-157-be/src/main/resources/db/migration/V1__baseline.sql:924) — **근거:** 호스트 그룹 DELETE가 `usergroup_hostgroups`를 CASCADE 삭제하지만 `MembershipLock`을 획득하지 않는다. advisory lock은 참여하지 않는 쓰기를 막지 않는다([PostgreSQL 문서](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS)). — **시나리오:** 동기화 지문 확인 직후 호스트 그룹 삭제가 완료되어도, 동기화가 옛 스냅샷으로 해당 그룹과 관계를 다시 생성할 수 있다. — **수정 제안:** 삭제 경로에도 timeout → advisory 순서를 적용하고, 잠금 획득 전에 완료된 삭제도 검출하도록 호스트 그룹·관계 변경을 지문에 포함한다. — **후속 가능 여부:** 가능. 다만 “모든 소속 쓰기 경로 직렬화 완료”로 판정할 수는 없다.

- [ ] 🟡 **동기화 API의 잠금 초과가 계약 오류 대신 HTTP 500으로 반환됨** — [UserController.java:480](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:480) — **근거:** `MembershipLock`은 Spring 잠금 예외로만 변환하며, `/users/sync`에는 이를 `FAILED_TO_ACQUIRE_LOCK`으로 바꾸는 catch가 없다. 전역 처리는 [GlobalExceptionHandler.java:451](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java:451)의 일반 500으로 이어진다. — **시나리오:** 다른 트랜잭션이 advisory lock을 10초 이상 보유하면 동기화는 롤백되지만 약속한 오류 코드가 반환되지 않는다. — **수정 제안:** 동기화 호출 경계에서 잠금 예외를 계약 오류로 변환하고 API 응답을 검증한다. — **후속 가능 여부:** 가능. 롤백은 유지되며 오류 응답 계약의 결함이다.

읽기 전용 정적 검수이며 파일 변경·테스트 실행은 하지 않았다. 보존된 `ZabbixSyncSqlTest` XML의 6건 통과는 확인했으며, 요청서의 IT 14/14 결과는 독립 재실행하지 않았다.

## 6차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 잠금 후 재조회: 사용자 그룹 수정(INACTIVE는 구성원 전원 INACTIVE로 맞추고 바뀐 사용자만 폐기, ACTIVE는 재조회 상태 기준 조건부)·생성·삭제(원격 삭제 → 잠금 → 구성원 재확인 → 삭제, 구성원 생기면 로컬 보존), 관리자 사용자 생성(잠금 후 그룹 재조회, 비활성 소속이면 INACTIVE). 관리자 사용자 삭제는 역할(SUPER_ADMIN 보호)만 잠금 전 조회 — 원격 호출 동안 잠금 미보유를 위해 삭제 직전 잠금 유지. 경로별 전수 표는 계약서.
- [x] 🟡 호스트 그룹 삭제·수정 잠금(삭제는 잠금 후 Zabbix id 재확인, 불일치면 `ZABBIX_SYNC_CONFLICT`), 지문에 `host_group`·`usergroup_hostgroups` 포함. 호스트 그룹 생성은 무트랜잭션 단일 저장이라 미적용(동기화 지문으로 검출, 드문 틈은 다음 동기화가 복원).
- [x] 🟡 `/users/sync` 잠금 초과 → 200 + `FAILED_TO_ACQUIRE_LOCK`(MockMvc), 그룹·호스트 그룹 수정·삭제도 잠금 예외를 `ZABBIX_API_ERROR`보다 먼저 변환.
- 테스트: 루트 `*Test` 3,369, IT 17/17((n) 그룹 비활성 요청 대기 중 동기화 ACTIVE 커밋 → G·U INACTIVE+폐기, (o) 사용자 생성 대기 중 그룹 비활성 → 생성 사용자 INACTIVE, (q) 호스트 그룹 삭제 후 동기화 충돌). 음성 대조: 잠금 전 값으로 되돌리면 (n)(o) 실패.

## 검수 결과 (7차 — 6차 반영분 한정, BE)

(Codex 7차 — 2026-09-17, read-only)

### BE 7차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 🔴 잠금 전 그룹 상태·소속 재사용 | 부분 해결 — 재조회는 추가됐으나, id 재사용 시 다른 그룹을 수용하는 경로가 남음 | [UserGroupService.java:254](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:254), [UserService.java:666](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:666) |
| 그룹 삭제의 외곽 트랜잭션 제거·구성원 재확인 | 해결 — 잠금 뒤 조인 조회로 재확인하며 구성원이 생겼으면 로컬 삭제를 거부 | [UserGroupService.java:328](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:328), [같은 파일:351](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:351) |
| 🟡 호스트 그룹 삭제 CASCADE 직렬화·지문 확장 | 해결 — 삭제 전 잠금·Zabbix id 대조, 두 테이블의 지문 포함 확인 | [HostGroupService.java:282](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:282), [ZabbixSyncServiceImpl.java:116](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:116) |
| 🟡 `/users/sync` 잠금 초과 응답 | 해결 — `FAILED_TO_ACQUIRE_LOCK` 변환 및 MockMvc 검증 | [UserController.java:482](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:482), [PermissionEnforcementControllerTest.java:595](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/security/PermissionEnforcementControllerTest.java:595) |
| IT `(n)(o)(q)` 검출력 | 부분 충족 — 상태 경합·삭제 지문은 검증하지만 아래 id 재사용 경합은 미검증 | [ZabbixSyncStatusLockIT.java:609](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:609), [같은 파일:652](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:652), [같은 파일:702](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:702) |

- [ ] 🔴 **잠금 후 재조회가 다른 그룹의 상태·소속·데이터를 적용함** — [UserService.java:666](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:666), [HostGroupService.java:200](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:200) — **근거:** 동기화는 그룹을 삭제하고 sequence를 1부터 다시 할당한다([ZabbixSyncServiceImpl.java:268](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:268), [같은 파일:295](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:295)). 새 사용자 생성의 재조회와 호스트 그룹 수정의 `refresh`는 숫자 id만 사용하며 기존 Zabbix id와 대조하지 않는다. — **시나리오:** 앞선 그룹이 삭제되어 동기화 후 id=2가 비활성 G에서 활성 B로 바뀌면, G를 지정하고 기다리던 사용자 생성이 **B 소속 ACTIVE 계정**을 저장한다. 이번 상태 재계산이 잠금 전 G 기준의 INACTIVE를 ACTIVE로 바꾼다. 호스트 그룹 수정도 같은 경합에서 원격 A를 수정한 뒤 로컬 B의 이름·호스트 목록을 덮어쓴다. — **수정 제안:** 잠금 전후 대상의 Zabbix id를 대조하여 불일치 시 `ZABBIX_SYNC_CONFLICT`로 중단하거나, 기존 Zabbix id로 동일 대상을 재조회한다. 앞선 그룹 삭제로 id가 이동하는 IT를 두 경로에 추가한다. — **후속 가능 여부:** 불가. 의도하지 않은 계정 활성화·그룹 배정과 다른 그룹 데이터 변경이 발생한다.

읽기 전용 정적 검수다. 테스트는 재실행하지 않았으며, 저장된 XML에서 이번 MockMvc 2건 통과를 확인했다. IT 17/17은 요청서의 실행 기록이다.

## 7차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 `LockedGroupIdentity` — 잠금 후 숫자 id로 재조회한 그룹의 Zabbix id(없으면 이름)를 잠금 전 값과 대조, 불일치·부재는 200 + `ZABBIX_SYNC_CONFLICT`(롤백, 이미 나간 원격 변경은 경고 로그 후 다음 동기화가 맞춤). 적용: 사용자 그룹 수정(대상·호스트 그룹)·생성(호스트 그룹)·삭제(대상), 사용자 생성(그룹), 호스트 그룹 수정(refresh 대상)·삭제. 사용자 수정·삭제·상태 API·동기화는 대조 불필요(근거 계약서 표).
- 테스트: 루트 `*Test` 3,373, IT 19/19((r) id 이동 중 사용자 생성 충돌·데이터 불변, (s) id 이동 중 호스트 그룹 수정 충돌), `LockedGroupIdentityTest`. 음성 대조: 대조를 끄면 (r)(s) 실패.
- **후속(설계 성질)**: 동기화가 매 회차 그룹 id를 다시 매겨 화면이 들고 있던 숫자 id가 다른 그룹을 가리킬 수 있음 → 동기화를 Zabbix id 기준 upsert로 바꾸는 별도 작업.

## 검수 결과 (8차 — 7차 반영분 한정, BE)

(Codex 8차 — 2026-09-17, read-only)

### BE 8차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 비교 키·null·이름 대체 | 적정 — Zabbix id 우선, 양쪽 모두 없을 때만 이름 비교. 부재는 충돌 | [LockedGroupIdentity.java:72](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/LockedGroupIdentity.java:72) |
| 사용자 생성의 잘못된 그룹·상태 적용 | 해결 — 대조를 통과한 최신 그룹으로 소속·상태 계산 | [UserService.java:668](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:668) |
| 호스트 그룹 수정의 다른 대상 덮어쓰기 | 해결 — 식별값 보존 후 refresh·대조 | [HostGroupService.java:201](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:201) |
| 사용자 그룹 생성·수정·삭제 적용 | 확인 — 대상·호스트 그룹 대조 적용, 충돌 예외 유지 | [UserGroupService.java:170](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:170), [263](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:263), [286](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:286), [340](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:340) |
| 호스트 그룹 삭제의 공용 대조 전환 | 미해결 — 아래 신규 회귀 | [HostGroupService.java:298](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:298) |
| 단위 테스트·IT `(r)(s)` | 부분 충족 — 생성·수정 경합은 검증하지만 삭제의 영속성 컨텍스트 재사용은 미검증 | [LockedGroupIdentityTest.java:28](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/LockedGroupIdentityTest.java:28), [ZabbixSyncStatusLockIT.java:735](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:735), [783](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncStatusLockIT.java:783) |

- [ ] 🔴 **호스트 그룹 삭제의 대조가 1차 캐시 때문에 무력화됨** — [HostGroupService.java:298](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/HostGroupService.java:298) — **근거:** 메서드 전체가 `@Transactional`이며, 244행에서 읽은 엔티티가 영속성 컨텍스트에 남는다. 새 대조용 `select h`는 같은 id의 기존 객체를 반환하므로 잠금 전후가 동일 객체·옛 Zabbix id로 비교된다. 이는 엔티티 조회에 대한 [Hibernate의 반복 읽기 동작](https://docs.hibernate.org/orm/6.5/userguide/html_single/#transactions)에 따른 공용 대조 전환의 회귀다. — **시나리오:** `h1(id=2)` 삭제가 잠금을 기다리는 동안 동기화가 `id=2`를 `h9`에 배정한다. 대조는 옛 `h1`끼리 비교해 통과하고, 303행의 bulk DELETE가 **h9와 연결 관계를 삭제**한다. 충돌 예외가 없어 롤백되지 않는다. — **수정 제안:** 잠금 전 식별값을 보존하고 잠금 후 scalar projection 또는 명시적 refresh 결과와 비교한다. 같은 id 재사용을 삭제 경로에서도 재현하여 충돌·그룹·관계 보존을 검증한다. — **후속 가능 여부:** 불가. 요청하지 않은 그룹을 삭제하는 결함이다.

읽기 전용 정적 검수이며 테스트는 재실행하지 않았다. 저장된 `LockedGroupIdentityTest` XML의 4/4 통과만 확인했고, IT 19/19는 요청서의 실행 기록이다.

## 8차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 `LockedGroupIdentity` 재작성 — 잠금 전 `Key(id, zabbixId, name)` 값 복사, 잠금 후 JPQL 열(scalar) 조회로 영속성 컨텍스트 우회. 엔티티 받는 대조 메서드 제거. 같은 패턴(메서드 전체 `@Transactional`)은 호스트 그룹 수정·삭제 두 곳뿐 — 둘 다 전환. IT (t) 추가(대조를 7차 방식으로 되돌리면 실패).
- [x] (Claude 직접 점검 추가) 호스트 그룹 삭제의 벌크 DELETE를 요청 `ids`가 아니라 **대조를 통과한 id만**으로 — 요청 시점에 없던 id가 섞이면 잠금 대기 중 동기화가 만든 그룹이 대조 없이 지워질 수 있었음.
- 테스트: 루트 `*Test` 3,374, IT `ZabbixSyncStatusLockIT` 20/20(마지막 수정 후 재실행, 다른 테스트 워커 없음 확인), `LockedGroupIdentityTest` 5, `PermissionEnforcementControllerTest` 30.

## 종료 판정 (2026-09-17)
- FE·AI: 2차에서 **머지 가능**.
- BE: 8차 🔴 반영 + 직접 점검 보강. 1~8차의 🔴는 모두 반영했다. 동기화 경합은 회차마다 한 겹씩 드러났고 근본 원인(동기화가 그룹 id를 매번 다시 매김)은 **후속 과제**로 분리 — 현재는 잠금 후 외부 식별자 대조로 안전하게 중단(`ZABBIX_SYNC_CONFLICT`)한다.
- 후속: 동기화 Zabbix id 기준 upsert, 운영 Lua·SQL 자동 회귀, 동기화 부분 실패의 응답 노출.
