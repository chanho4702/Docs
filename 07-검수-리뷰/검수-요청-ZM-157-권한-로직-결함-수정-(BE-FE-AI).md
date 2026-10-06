# 검수 요청 — ZM-157 권한 로직 결함 수정 (BE·FE·AI)

> 문서 지도: [`../INDEX_zm-157-permission.md`](../00-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84/%EA%B6%8C%ED%95%9C-%EC%9E%91%EC%97%85%EA%B5%B0-%EB%AC%B8%EC%84%9C-%EC%A7%80%EB%8F%84-%28ZM-157%29.md)

- 이슈: ZM-157 · 작성: 2026-09-17 · **미커밋**
- 워크트리(브랜치 전부 `ZM-157`):
  - BE `C:/worktrees/zm-157-be` (master `200c936` 기준)
  - FE `C:/worktrees/zm-157-fe` (master `3b096c4` 기준)
  - AI `C:/worktrees/zm-157-ai` (main `8f0994f` 기준)
- 🔴 검수 대상은 위 워크트리의 `git diff` + 미추적 파일뿐이다. master 작업 트리(다른 세션의 미커밋 변경)는 대상이 아니다.
- 매핑 계약서: `_workspace/contract_zm-157-permission-enforcement.md`
- 사용자 원칙: **"로그인한 사용자는 우리가 지정한 권한(역할 편집 화면) 안에서만 작업할 수 있어야 한다."** BE가 최종 방어선이고, FE는 같은 기준으로 보여 준다.

## 1. 범위

### BE
| 구분 | 내용 | 주요 파일 |
|---|---|---|
| 권한 상승 | `PUT /users/my-profile`이 관리자용 `UpdateUserDto`를 공유해 `userRoleId`·`userGroupIds`로 자기 권한을 올릴 수 있었음(연동 계정은 Zabbix Super admin까지) → 본인 전용 `UpdateMyProfileDto`. 비밀번호·이메일 변경은 `currentPassword` 필수 | `user/UserController`, `UserService`(`updateMyProfile`·`applyUserUpdate`), `dto/request/UpdateMyProfileDto` |
| 자기 재활성화 | 본인 수정이 status를 ACTIVE로 되돌려 비활성 사용자가 MCP 토큰으로 재활성화 가능 → 본인 경로는 status 불변 | `UserService` |
| 오대상 수정 | `PATCH /users/update-email`이 `findFirstByZabbixUserid(null)`로 **남의 계정**을 집음 → id 조회 | `UserService.updateEmail` |
| 슈퍼어드민 토큰 누수 | `CallerContexts.from`이 Zabbix 미연동 비관리자를 SYSTEM으로 매핑 → `CallerContext.unlinked()` + `ErrorKind.FORBIDDEN`(proto 7) → 200+403 | `CallerContexts`, `engine-api` `CallerContext`·`ErrorKind`·`engine.proto`, `ZabbixSessionProvider`, `GlobalExceptionHandler` |
| 권한 칸 BE 강제 | 모니터링(호스트그룹·서버·네트워크)·이벤트(byHost view, 문제 확인 저장 byTemplate edit)·호스트 공용 위젯 쓰기(edit). 공유 EP(홈·검색·벨·`/hosts/server`·`/hosts/detail`·`/event/problems`)는 미적용 | `DmovePermissionChecker`(요청 단위 캐시·`requireAny*`), `DmovePermissionKey`(신규), host/event/widget 컨트롤러 13개 |
| Geo | `PATCH /geo-clusters/host-coordinate` 관리자 전용(슈퍼어드민 토큰으로 인벤토리 쓰기) | `GeoClusterController` |
| 시드 admin | `admin-dmove@yopmail.com`(공개 메일함)+인증 완료 → 비밀번호 찾기로 admin 탈취 가능 → 시드값 그대로인 행만 email NULL·미인증 | `V61__clear_seed_admin_public_mailbox.sql` |
| MCP | 요청마다 DB로 status·userRole·mcp_permission 재확인(비활성·역할 변경 401, 회수 200+403, write→READ 강등은 쓰기만 차단) | `McpAccessInterceptor`, `UserRepository` |
| 캐시 공유(S2) | 그룹 자원·알림 추이 캐시 키에 principal 추가 | `HostService` |
| 세션 폐기 | 사용자별 "폐기 기준 시각"으로 비밀번호 변경·재설정·비활성화·삭제 시 refresh 일괄 폐기. 본인 변경은 현재 기기만 재발급(`Set-Cookie`) | `RefreshTokenService`, `AuthService.reissueSession`, `AppConfig` |

### FE
| 구분 | 내용 | 주요 파일 |
|---|---|---|
| 계정 전환 잔존 | 내 정보 항상 조회(staleTime 1분), 다른 계정이면 저장값 교체, 권한 쿼리 키에 사용자 id, 로그인 성공 시 세션·쿼리 캐시 초기화, 로그인 상태의 `/sign-in` 진입 차단(내부 경로만 리다이렉트) | `hooks/useAuth`, `utils/session`(신규), `utils/redirectTarget`(신규), `layouts/auth`, `SignIn` |
| 관리자 판정 통일 | `isAdminUserRole`(userRole ∈ ADMIN·SUPER_ADMIN) 단일 기준. `useIsSuperRole` 삭제, `userRoleAdminOnly`→`adminOnly` 통합. 5개 진입점 + grantAll | `utils/permissions`, `useIsUserRoleAdmin`, `routes`, `SideNav`, `MobileSideNav`, `SettingsMenu`, `GlobalSearch` |
| 라우트 가드 | `decidePageAccess` 분리 — 정체성·권한 로딩 중엔 404 대신 스피너 | `routes/pageAccess`(신규) |
| 진입점 조건 | 이벤트 메뉴·검색 byHost.view, APM 수집기·알람 규칙 라우트 edit 축, 검색 권한 로딩 중 fail-closed·호스트 결과 권한 필터, 벨 클릭 byHost 없으면 이동 안 함 | `navSearchEntries`, `Notification`, `routes` |
| 새 403 대응 | 사용자 정의 차트 편집(서버/네트워크 edit), 지리 맵 좌표 편집(관리자), 자산·비용 편집 버튼 관리자 기준 | `CustomChartsDashboard`, `GeoMapClusterEditorPage`, 자산·비용 화면 |
| 403 안내 | GET 응답의 권한 거부(라이선스 차단 제외)를 이벤트로 → 경로당 1회 "권한이 없습니다" | `axiosInstance`, `usePermissionDeniedWatcher`(신규), `constants/permissionDenied`(신규) |
| AI | 채팅 링크 http/https만, 확인 카드 대상 표(`targets`), 턴당 확인 카드 5장 초과 안내(FE가 서버 규칙 복제) | `components/ai/*`, `stores/aiChatStore`, `types/ai`, `constants/ai` |

### AI (moveseye-ai)
| 구분 | 내용 | 주요 파일 |
|---|---|---|
| MCP 파괴 툴 | DESTRUCTIVE 툴은 `ai.mcp.allow-destructive`(기본 false)일 때만 목록·호출 허용, 켜도 write scope + 호출당 대상 수 상한(기본 1) | `McpServerConfig`, `AiProperties`, `application.yml` |
| 툴 주석 | 읽기 idempotent·non-destructive, 쓰기 전부 destructive=true·idempotent=false | `McpServerConfig` |
| 요약 캐시 | 알림 요약 캐시 키에 사용자(owner_key), 기존 캐시 행 삭제 | `AlertDigestService`, `InsightController`, `V7__ai_insight_owner.sql` |
| dev 게이트 우회 | `AI_DEV_TOOLS_ENDPOINT` dev 기본값 false | `application-dev.yml` |
| 확인 카드 위장 | `ConfirmCard`(요약+대상 분리, 이름 인용·제어문자 제거·60자), `confirm_required.targets`, 턴당 카드 5장 상한 | `tool/ConfirmCard`(신규), `AiTool`, `AiToolCallbacks`, `TurnScope`, 삭제 툴 4종 |

## 2. 의도 — 선택한 설계와 버린 대안

- **미연동 비관리자 거부 위치**: `CallerContexts.from()`에서 바로 던지는 안을 **버림** — 자산 상세·홈 요약·자산 대시보드처럼 Zabbix를 곁가지로만 부르는 네이티브 화면이 통째로 깨진다. **401로 거부하는 안도 버림** — FE가 재인증 후 로그아웃시킨다. → 실제 Zabbix 토큰 해석 시점에 FORBIDDEN(200+403).
- **관리자 `PUT /users/{id}`의 "수정하면 ACTIVE" 동작은 유지** — 현재 비활성 사용자를 되살리는 유일한 경로다(상태 전용 EP 미구현). 본인 경로만 끊었다.
- **공유 EP 미적용**: 홈·전역 검색·벨·SSE·부팅 EP를 막으면 사이드바·홈이 통째로 깨진다(06-10 사고 전례). 데이터 범위는 Zabbix 역할에 의존.
- **호스트 상세는 `requireAnyView`(서버|네트워크)**: 같은 골격을 쓰고 검색이 기기 유형으로 경로를 고른다. FE 라우트는 기기 유형별이라 FE가 더 엄격(허용).
- **위젯 쓰기 = edit**: 위젯이 호스트 공용이라 조회 권한만으로 남의 화면을 바꾸면 안 된다. 기본 템플릿의 edit은 관리자뿐 → **일반 사용자의 차트 편집이 막힌다(사용자 확인 완료, 09-17 "그대로 진행")**.
- **판정기 캐시**: 요청 속성 캐시만(요청 간 캐시 없음) → 역할 변경 즉시 반영 유지. `findById`(userGroups EAGER) 대신 `findRefRoleById`.
- **refresh 폐기**: 사용자별 토큰 집합 대신 "폐기 기준 시각" 키 — 기존 토큰 저장 구조를 바꾸지 않는다. `issuedAtMillis` 없는 옛 토큰은 기준 시각이 있으면 거부.
- **MCP WRITE 툴은 클라이언트 확인에 그대로 의존** — 서버 확인 게이트를 MCP에 넣으려면 BE 토큰 발급 구조 변경이 필요해 범위 밖.
- **카드 한도의 FE 복제**: AI 서버가 `gate.card_cap`을 SSE 오류가 아니라 모델용 툴 결과로만 돌려줘서 FE가 같은 규칙으로 판정. 서버 상수가 바뀌면 어긋난다.

## 3. 중점 확인 요청 (스스로 불안한 지점)

1. **FORBIDDEN 경로의 누락**: `CallerContext.unlinked()`(principal `""`)를 받는 곳 중 `ctx.principal()`로 캐시 키를 만드는 곳(`EventService` EVENT_VISIBLE_HOSTS, `HostService` HOST_LIST, 차트 single-flight)에서 **Zabbix 호출 전에 캐시·DB 사본으로 응답**해 미연동 사용자끼리 결과가 공유되거나, 슈퍼어드민이 채운 캐시가 새는 경로가 없는가. 또 `currentUser.getAuthToken()`(null)을 직접 쓰는 레거시 경로가 SYSTEM 폴백하지 않는가.
2. **매핑표 누락**: 계약서 2장이 FE 실제 호출과 맞는가 — view/edit이 필요한데 빠진 EP, 반대로 막혀서 정상 화면(특히 홈 위젯·그룹 모달·호스트 상세 탭)이 깨질 EP.
3. **V61 순서**: `outOfOrder=false`라 V61이 적용된 DB에 V60(ZM-151, 미병합)이 나중에 오면 validate 실패로 기동 불가. 병합 순서(V60→V61) 외에 더 안전한 방법이 있나.
4. **refresh 재발급 쿠키**: `PUT /users/my-profile` 응답에서 `Path=/auth` refresh 쿠키를 내려준다 — 브라우저 저장·SameSite·기존 쿠키 덮어쓰기 문제. 폐기 기준 시각과 재발급 토큰의 **같은 밀리초 경계**(엄격 미만 비교).
5. **MCP 재확인**: 요청마다 DB 조회 부하, userRole 변경 시 401의 부작용(AI 서버는 BE 401 → 토큰 무효로 처리함을 확인), status null을 활성으로 보는 판단.
6. **FE 세션 초기화**: 로그인 성공 시 캐시 clear 순서(로그인 플래그 전)와 React Query 진행 중 요청의 경합, `/sign-in` 리다이렉트의 오픈 리다이렉트 방지(`redirectTarget`), 권한 조회 영구 실패 시 스피너 고착.
7. **403 전역 안내**: 라이선스 차단(403 계열) 제외 조건이 정확한가, 폴링 화면에서 알림 폭주가 없는가.
8. **AI MCP 대상 수 계산**: "입력의 배열 원소 합"으로 세는 방식이 툴 입력 스키마(중첩·단일 id 필드)에서 우회 가능한가. `ConfirmCard` 이름 정화(유니코드 방향 문자·제로폭 문자).
9. **V7(AI)**: 유니크 키 교체·기존 행 삭제가 운영 DB에서 안전한가.

## 4. 검증 현황

### 통과
- BE: `:test`(IT 제외 패턴) + `:engine-zabbix:test` — **3,348건 중 3,346 통과**. 실패 2건은 `ApmCollectorLiveRuntimeTest`(실제 otelcol 실행 — 이 PC에 09-15부터 떠 있는 otelcol pid 5580과 파일 잠금·포트 충돌, APM 수집기 코드 무변경). 신규 테스트: `MyProfileUpdateSecurityTest`, `PermissionEnforcementControllerTest`, `GeoClusterControllerAccessTest`, `RefreshTokenServiceTest` + 기존 테스트 보강(`CallerContextsTest`, `ZabbixSessionProviderTest`, `DmovePermissionCheckerTest`, `McpTokenAndAccessTest`, `HostGroupMonitoringTest`, `AuthServiceTest`).
  - 좁힌 실행에서 IT 3종(`AuthorizationContractIT`·`CostBulkUploadJobConcurrencyIT`·`DmovePermissionBackfillIT`)이 함께 돌아 통과 — 공유 DB라 다른 워크트리 IT와 시각이 겹쳤다면 영향 가능.
- Zabbix 관리 컨트롤러 16개 전 EP가 `requireAdmin` — FE 관리자 판정 통일과 정합(수동 대조).
- FE: `tsc --noEmit`·`typecheck:contract` — 환경 1건(`@dagrejs/dagre` 미설치)만. 변경 48파일 eslint `--max-warnings 0` 통과. jest 관련 53 스위트 **490/493** — 실패 3건은 기존(`apmRoutes` 2건: master `2e1ae38` 미포함, `AiAssistantPage` 1건: HEAD에서도 실패).
- AI: 관련 테스트 28건 + `tool.*` 110건 통과(JDK 17).

### 검증 못 한 것
- **런타임 전부**: BE·AI 기동, 역할별 403 실측, MCP 흐름, 쿠키 재발급, FE 브라우저 동작, `vite build`.
- BE `IT` 전체, V61·V7 실제 DB 적용.
- FE는 master `node_modules`가 손상(09-16 19:29, `.bin`·`@babel`·`@ant-design` 없음)되어 `zm-114-fe`의 node_modules 정션으로 검증.

## 5. 알려진 후속(이번 범위 밖)

- 일반 사용자는 마이페이지에서 비밀번호를 못 바꾼다 — FE가 쓰는 `PATCH /users/zabbix-info/{id}`가 관리자 전용. `PUT /users/my-profile`(currentPassword 필수)로 옮기는 FE 작업 필요.
- 관리자 수정이 그룹 비활성 상태를 무시(M5), 사용자·역할 변경 감사 로그 부재(M8), 로그인 IP 기준 제한, OTP/access 토큰 typ 구분, 그룹 단위 비활성화 경로의 refresh 폐기, `/hosts/{groupid}/reports` 그룹 가시성 필터, 역할 편집 화면의 무효 칸 표시.

## 검수 결과

(Codex 1차 — 2026-09-17 09:40~09:56, `gpt-6-astra` xhigh, read-only. BE·FE·AI 병렬)

### BE 검수 결과

**판정: 수정 후 재검수 필요.** `ZM-157`의 변경 38개·미추적 7개 파일을 검토했다. 아래는 코드 흐름에 근거한 정적 검수이며, 서버·브라우저·테스트는 재실행하지 않았다. 읽기 전용 조건에 따라 요청서도 수정하지 않았다.

- [ ] 🔴 refresh 회전과 일괄 폐기의 경합으로 이전 세션이 살아남음 — [RefreshTokenService.java:90](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RefreshTokenService.java:90) — **근거:** `revokedByUser(data)` 검사와 `issue()`가 분리되어 있으며, 회전 토큰에는 새 발급 시각을 기록한다. 이후 `AuthService.refresh()`는 로그인 세션까지 다시 저장한다. — **실패 시나리오:** 이전 토큰의 폐기 검사 통과 → 다른 요청에서 비밀번호 변경·일괄 폐기 → 기존 refresh 요청이 새 토큰 발급. 새 발급 시각이 폐기 기준보다 늦어 이후에도 계속 회전한다. 같은 밀리초에 폐기보다 먼저 발급된 토큰도 `<` 비교 때문에 통과한다. — **수정 제안:** 사용자별 세대를 두고 회전 토큰은 기존 세대를 계승하게 하며, 세대 검증·토큰 소비·회전을 원자적으로 처리한다. 세션 복원에도 세대를 검사하고 두 경합을 재현하는 테스트를 추가한다.

- [ ] 🔴 호스트 공용 위젯의 IDOR가 남아 있음 — [WidgetsController.java:77](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsController.java:77), [WidgetsService.java:49](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsService.java:49) — **근거:** view/edit 검사 후 서비스에 `hostId`만 전달한다. 저장소의 `findByIdAndHostId`는 위젯과 호스트의 관계만 확인하며, 호출자의 호스트 접근권한은 확인하지 않는다. 조회·생성·배치 변경·삭제도 같다. — **실패 시나리오:** 서버 또는 네트워크 edit 권한이 있는 사용자가 접근할 수 없는 호스트의 ID로 위젯을 생성·수정·삭제한다. 미연동 사용자도 해당 역할 권한만 있으면 가능하다. — **수정 제안:** 모든 위젯 EP에서 호출자 컨텍스트로 대상 호스트의 가시성을 먼저 검증하고, 미연동 비관리자는 거부한다.

- [ ] 🔴 이벤트 통계가 사용자에게 보이지 않는 호스트·문제 정보를 반환함 — [EventStatsController.java:48](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/stats/EventStatsController.java:48), [EventStatsService.java:101](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/stats/EventStatsService.java:101) — **근거:** `byHost.view` 통과 후 `getStats(since, till)`에 사용자 정보 없이 진입한다. SQL은 기간만 제한하며 전체 `event_problems`의 호스트 ID·호스트명·문제명을 집계한다. `ZabbixSessionProvider`에도 도달하지 않는다. — **실패 시나리오:** 미연동 계정 또는 일부 호스트만 허용된 계정에 `byHost.view=true`를 부여하면 `/event/stats`에서 다른 호스트의 정보가 노출된다. — **수정 제안:** 이벤트 목록과 동일한 호스트·태그 가시성 판정을 집계에도 적용하고, 미연동 사용자는 거부한다.

- [ ] 🔴 별도 이메일 변경 EP로 현재 비밀번호 검증을 우회할 수 있음 — [UserService.java:530](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:530) — **근거:** `updateMyProfile()`은 이메일 변경에 현재 비밀번호를 요구하지만, `updateEmail()`은 기존 이메일이 인증되었는지만 확인한다. `UpdateUserEmailDto`에는 현재 비밀번호 필드도 없다. — **실패 시나리오:** 미인증 계정의 유효 세션과 visitorId를 확보한 공격자가 `PATCH /users/update-email`로 자신의 주소를 등록한 뒤 비밀번호 찾기 OTP를 받아 비밀번호를 재설정한다. V61 적용 직후의 admin도 이메일 NULL·미인증 조건에 해당한다. — **수정 제안:** 기존 비밀번호가 있는 계정의 이메일 변경은 두 EP 모두 동일한 현재 비밀번호 검증을 적용한다. 비밀번호가 없는 온보딩 계정은 별도 인증 절차로 분리한다.

- [ ] 🔴 이메일 인증을 통한 비밀번호 변경에는 세션 폐기가 빠져 있음 — [UserService.java:156](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:156), [AuthService.java:254](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:254) — **근거:** 미인증 계정의 이메일 인증은 `markEmailVerified(userId, randomPassword)`를 호출한다. 이 메서드는 비밀번호를 직접 변경하지만 `revokeAllForUser()`를 호출하지 않는다. — **실패 시나리오:** 로그인 이력이 있는 미인증 MovesEye 계정이 이메일 인증으로 새 비밀번호를 발급받아도 기존 access 세션과 refresh 토큰이 유지된다. — **수정 제안:** 실제 비밀번호를 변경하는 모든 경로에서 동일한 폐기 처리를 실행하고, 이메일 인증 경로도 테스트한다.

- [ ] 🟡 V61 선적용 시 뒤늦게 합류하는 V60의 배포가 막힘 — [V61__clear_seed_admin_public_mailbox.sql:11](/C:/worktrees/zm-157-be/src/main/resources/db/migration/V61__clear_seed_admin_public_mailbox.sql:11), [application.yml:73](/C:/worktrees/zm-157-be/src/main/resources/application.yml:73) — **근거:** 현재 트리에 V60이 없으며 `outOfOrder` 설정도 없다. 기본값은 false이고, 뒤늦게 발견된 미적용 하위 버전은 validation 오류 대상이다. [Flyway 기본값](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-out-of-order-setting), [검증 오류 규약](https://documentation.red-gate.com/flyway/reference/exit-codes-and-error-codes/validate-error-codes). — **실패 시나리오:** V59→V61 배포 후 V60을 포함한 버전으로 기동한다. 실제 DB 적용 여부는 미확인이다. — **수정 제안:** 어느 DB에도 적용되지 않았다면 충돌 없는 `V59_1__...` 등으로 재번호화하거나, V60·V61을 동일 배포 산출물에 포함하도록 강제한다. 이미 적용했다면 기존 파일 변경 없이 별도 이행 절차를 정한다.

- [ ] 🟡 미연동 SUPER_ADMIN의 관리자 판정이 서로 다름 — [CallerContexts.java:46](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/metric/CallerContexts.java:46) — **근거:** `DmovePermissionChecker`와 `AdminAccessChecker`는 ADMIN·SUPER_ADMIN을 관리자로 인정하지만, 이 변환기는 ADMIN만 SYSTEM으로 보낸다. SUPER_ADMIN·userid=NULL은 이번 변경으로 SYSTEM에서 unlinked로 바뀐다. — **실패 시나리오:** 해당 계정은 관리자 화면의 권한 검사를 통과하고도 포트 기반 모니터링 조회에서 403을 받는다. — **수정 제안:** 소스 접근을 포함한 관리자 정책을 명시적으로 통일한다. 현재 테스트는 SUPER_ADMIN도 unlinked가 된다고 고정하므로 정책과 함께 수정해야 한다.

- [ ] 🟡 레거시 authToken 경로에는 미연동 사용자용 403 처리가 적용되지 않음 — [HostController.java:88](/C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/host/HostController.java:88), [ZabbixClient.java:149](/C:/worktrees/zm-157-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:149) — **근거:** `/hosts/detail/{hostid}`, collected-info, 이벤트 상세 등은 null `authToken`을 직접 전달한다. SYSTEM 폴백은 없지만, Zabbix 인증 오류는 여전히 실제 401로 변환된다. — **실패 시나리오:** 미연동 사용자의 해당 요청이 인증 오류를 받으면 FE가 불필요한 refresh·재시도를 수행한다. 실제 서버 응답은 미실측이다. — **수정 제안:** 해당 진입점에도 미연동 판정을 적용해 200+403으로 반환하거나 CallerContext 경로로 전환한다.

- [ ] 🟡 세션·캐시 테스트가 실제 격리 실패를 충분히 검증하지 못함 — [MyProfileUpdateSecurityTest.java:136](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/MyProfileUpdateSecurityTest.java:136), [HostGroupMonitoringTest.java:382](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/host/HostGroupMonitoringTest.java:382), [RefreshTokenServiceTest.java:44](/C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/RefreshTokenServiceTest.java:44) — **근거:** 프로필 테스트의 User에는 ID가 없고 `revokeAllForUser(any())`만 확인하므로 실제 구현에서 무시되는 null 호출도 통과한다. 캐시 테스트는 모든 키에 같은 빈 응답을 반환해 키 분리만 검증한다. refresh 테스트는 동일 시각 토큰의 통과를 확인하지만 폐기 전후 순서와 동시 회전은 구분하지 않는다. — **실패 시나리오:** 위 세션 경합·위젯 IDOR·통계 누출이 남아도 테스트가 통과한다. — **수정 제안:** 실제 사용자 ID와 정확한 폐기 인자를 검증하고, 상태를 보존하는 Redis 대역·동시성 제어·비어 있지 않은 관리자 데이터를 사용한다. HTTP 응답의 200+403과 Set-Cookie도 통합 검증한다.

**중점 확인 요청 판정**

| 항목 번호 | 판정 OK/문제 | 한 줄 근거 |
|---|---|---|
| 1 | 문제 | SYSTEM과 빈 principal의 직접 캐시 충돌은 없지만, 위젯·통계는 소스 권한 검사 없이 DB에서 반환하며 레거시 경로에는 403 변환이 빠져 있다. |
| 2 | OK | 대조한 FE 호출처와 view/edit 매핑은 일치한다. 그룹 disk/detail의 hostGroup 허용과 공유 EP 예외도 반영되어 있다. 객체별 접근권한 결함은 위에 별도 기재했다. |
| 3 | 문제 | V61 선적용 후 V60 합류 시 validation 실패를 피할 배포·번호 정책이 필요하다. |
| 4 | 문제 | 쿠키 Path 자체는 문제가 없으나, 같은 밀리초의 선발급 토큰과 폐기·회전 경합을 안전하게 구분하지 못한다. |
| 5 | OK | MCP의 비활성·삭제·userRole 변경·권한 회수를 재검사한다. AI 검증은 BE 오류를 토큰 무효로 처리하며, status NULL은 현재 DB의 NOT NULL 제약상 정상 저장 경로에서 발생하지 않는다. 조회 비용은 EAGER 관계를 포함하므로 실측이 필요하다. |

**확인했고 문제없음**

- 본인 DTO에서 역할·그룹·username·상태 변경이 차단되고, 본인 수정이 INACTIVE를 ACTIVE로 바꾸지 않는다.
- `update-email`의 대상 조회가 사용자 PK로 바뀌어 null Zabbix ID로 다른 계정을 선택하던 문제는 해결됐다.
- `FORBIDDEN=7`은 기존 proto 번호를 유지하며, 예외 처리기는 HTTP 200 + body `code:403`을 반환한다.
- 확인한 캐시에서 SYSTEM과 unlinked의 키는 구분되고, 미연동 요청이 관리자 데이터를 새로 채우는 경로는 발견하지 못했다.
- 권한 컨트롤러 테스트는 실제 `DmovePermissionChecker`를 사용하므로 키 오타·권한 거부를 검증하는 부분은 유효하다.
- refresh 쿠키는 로그인과 같은 생성기를 사용한다. `/users/my-profile` 응답에서 `Path=/auth` 쿠키를 설정할 수 있으며, 동일 이름·도메인·경로 쿠키는 교체된다. 브라우저 실측은 하지 않았다. [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265.html#section-5.3)

### FE 검수 결과

**머지 전 수정 필요.** FE 변경분·미추적 파일과 BE 매핑 구현을 대조했다. 실제 QueryClient·Redux·Router를 이용한 메모리 내 재현을 수행했으며, 서버 연동·브라우저 E2E·전체 Jest는 실행하지 않았다. 읽기 전용 조건으로 요청서 파일은 수정하지 않았다.

- [ ] 🔴 **계정 변경 후 이전 계정의 화면 데이터·AI 대화가 남음** — [useAuth.ts:113](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:113), [session.ts:13](C:/worktrees/zm-157-fe/src/utils/session.ts:13), [aiChatStore.ts:51](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:51) — 계정 ID 변경 분기는 `clearAuthInfo()`만 수행한다. 로그인용 `resetClientSession()`도 AI singleton과 스트림은 초기화하지 않는다. — **재현:** 다른 탭에서 계정을 전환한 상황처럼 프로필 응답을 B로 변경하면, B의 권한 판정이 완료된 뒤에도 A의 신선한 위젯 캐시가 표시된다. 실제 `useAuth`·`decidePageAccess`·`useWidgets` 조합에서 B로 전환 후 A 데이터 표시와 API 호출 0회를 확인했다. 별도로 `resetClientSession()` 이후 AI 확인 카드·`pendingActionId` 잔존도 확인했다. — **수정 제안:** 로그인 성공과 계정 변경 감지에 공통 세션 전환 처리를 적용하고, 사용자별 Query 캐시·AI 상태·진행 중 스트림을 함께 정리한다. 늦은 응답은 세션 식별자로 배제한다.

- [ ] 🔴 **호스트 위젯의 대상 접근 검사 누락으로 IDOR 잔존 — BE 대조 결과** — [WidgetsController.java:48](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsController.java:48), [WidgetsService.java:25](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsService.java:25), [WidgetsService.java:57](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsService.java:57) — 새 검사는 서버·네트워크의 view/edit 칸만 확인한다. 이후 서비스는 호출자 없이 `hostId`로 DB를 조회·수정하며, 해당 호스트의 Zabbix 가시성을 검사하지 않는다. — **실패 시나리오:** 모니터링 view가 있는 사용자가 접근 불가능한 호스트 ID로 위젯 설정을 조회할 수 있다. edit도 있으면 해당 호스트의 공용 위젯 수정·삭제가 가능하다. `widgetId`와 `hostId` 일치 검사는 사용자 접근 검사에 해당하지 않는다. — **수정 제안:** 모든 위젯 API에 현재 principal의 대상 호스트 접근 검사를 추가한다. 기능 권한이 있어도 대상 호스트가 허용 범위 밖이면 거부하는 테스트가 필요하다.

- [ ] 🔴 **프로필·권한 조회 실패 시 스피너 고착** — [useAuth.ts:73](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:73), [pageAccess.ts:52](C:/worktrees/zm-157-fe/src/routes/pageAccess.ts:52) — 권한 쿼리의 오류 상태를 사용하지 않고, 가드는 `if (!permissions) return "wait"`로 처리한다. 프로필 실패로 `isAuthResolving=false`가 되어도 이 분기에 다시 걸린다. — **재현:** 신규 로그인 후 프로필 또는 권한 조회가 실패하면, Query가 `error`·`fetchStatus: idle`로 끝나도 최종 판정은 `wait`다. 반대로 persist 권한이 있으면 실패 후에도 이전 값으로 `allow`가 나온다. — **수정 제안:** 로딩·조회 실패·권한 없음 상태를 구분해 전달하고, 실패 시 오류 안내와 재시도 경로를 제공한다. 검증되지 않은 이전 권한으로 허용하지 않는다.

- [ ] 🔴 **차트 저장이 권한 거부되어도 성공 안내 후 입력을 지움** — [widget.api.ts:18](C:/worktrees/zm-157-fe/src/services/widget.api.ts:18), [useWidgets.ts:30](C:/worktrees/zm-157-fe/src/hooks/useWidgets.ts:30), [AddChartModal.tsx:123](C:/worktrees/zm-157-fe/src/components/Dashboard/AddChartModal.tsx:123) — 위젯 mutation은 실패 envelope을 검사하지 않는다. `200 + code:403`도 resolve되어 `messageApi.success()`·입력 초기화·모달 닫기로 이어진다. 전역 안내는 GET만 처리한다. — **재현:** 차트 편집 중 관리자가 edit을 회수한 뒤 저장한다. 실제 서비스·훅에 거부 envelope을 반환했을 때 mutation 상태가 `success`가 되는 것을 확인했다. — **수정 제안:** 위젯 서비스에서 실패 envelope을 예외로 변환하고, 권한 안내와 입력 보존을 적용한다. 기존 계약에 의존하는 다른 mutation까지 전역적으로 변경하지 않는다.

- [ ] 🟡 **로그인 상태의 로그인 화면 차단이 trailing slash에서 빠짐** — [layouts/auth/index.tsx:30](C:/worktrees/zm-157-fe/src/layouts/auth/index.tsx:30) — 문자열은 `/sign-in`과 정확히 비교하지만 Router는 `/sign-in/`도 같은 로그인 라우트로 매칭한다. — **재현:** 인증 플래그가 `1`일 때 `/sign-in`은 홈으로 이동하지만 `/sign-in/`은 로그인 폼을 표시한다. 실제 AuthLayout·Router 조합으로 확인했다. — **수정 제안:** 라우트 매칭 기준에 맞춰 경로를 정규화하거나 로그인 라우트 자체에서 진입을 판정한다.

- [ ] 🟡 **세션·저장 실패 회귀를 잡지 못하는 테스트 공백** — [zm157AuthSession.test.tsx:45](C:/worktrees/zm-157-fe/src/__tests__/zm157AuthSession.test.tsx:45), [zm157AuthSession.test.tsx:168](C:/worktrees/zm-157-fe/src/__tests__/zm157AuthSession.test.tsx:168), [zm157PermissionUi.test.tsx:35](C:/worktrees/zm-157-fe/src/__tests__/zm157PermissionUi.test.tsx:35) — QueryClient는 호출 spy이고, Query mock은 키의 첫 요소만 사용해 사용자 ID별 캐시를 구분하지 않는다. 실패 테스트도 `isAuthResolving=false`까지만 확인한다. 차트 테스트는 저장 훅·모달·Grid를 모두 대체한다. — **실패 시나리오:** 위의 캐시 잔존·무한 대기·403 저장 성공 결함이 있어도 현재 assertion은 통과할 수 있다. — **수정 제안:** 실제 QueryClient·Redux·가드를 연결하고 HTTP 경계만 대체해 계정 전환, 지연 응답, 조회 실패, 저장 거부를 검증한다. 기존 버튼 노출·클릭 테스트는 유지한다.

**중점 확인 요청 판정**

| 항목 번호 | 판정 OK/문제 | 한 줄 근거 |
|---|---|---|
| 2 | 문제 | 주요 view/edit 매핑은 일치하지만, 위젯 대상 접근 검사와 새 403의 저장 실패 처리가 빠져 있다. |
| 6 | 문제 | 로그인 초기화 순서는 맞지만 계정 변경 시 데이터 잔존, 권한 조회 실패 고착, 로그인 경로 변형 누락이 있다. |
| 7 | OK | 라이선스 게이트 4종을 제외하며, 동일 경로의 50회 거부와 재렌더에서도 안내는 1회였다. |

**확인했고 문제없음**

- 관리자 진입점과 grantAll이 `userRole ∈ {ADMIN, SUPER_ADMIN}` 기준으로 일치한다.
- 홈 공용 API·그룹 호스트 모달은 유지되며, 그룹 디스크 상세의 `hostGroup` 허용도 BE에 반영되어 있다.
- 차트 편집·Geo 좌표 편집·이벤트 메뉴와 벨 이동·APM 관리 라우트의 권한 축은 계약과 일치한다.
- 현재 Router에서 시험한 외부 URL·역슬래시 변형은 외부 이동하지 않았다. `queryClient.clear()` 뒤 늦게 완료된 Query가 캐시를 다시 채우지 않는 것도 확인했다.

### AI 검수 결과

**🔴 1건, 🟡 4건.** AI 미커밋 변경·미추적 파일과 FE 확인 카드 연동을 정적 검수했다. 코드·요청서는 수정하지 않았으며, 테스트 재실행과 실제 DB 적용은 수행하지 않았다.

- [ ] 🔴 **템플릿 연결 해제로 영구 삭제 차단과 대상 수 제한을 우회할 수 있음** — [McpServerConfig.java:144](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:144), [UnlinkTemplatesTool.java:51](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/zabbix/UnlinkTemplatesTool.java:51) — 근거: 새 제한은 `tier == DESTRUCTIVE`에만 적용하지만 `zabbix_unlink_templates`는 `WRITE`이며, `clear=true`를 BE에 전달한다. BE도 [ZabbixTemplateManageService.java:215](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/ZabbixTemplateManageService.java:215)에서 실제 `templates_clear`를 실행한다 — 재현: 유효한 관리자 write MCP 토큰으로 `allow-destructive=false`, 상한 1인 상태에서 `{"hostId":"10703","templateIds":["10001","10020"],"clear":true}` 호출. 두 템플릿의 아이템·트리거·수집 이력을 삭제하는 경로가 열린다 — 수정 제안: `clear=true` 작업을 별도 DESTRUCTIVE 툴로 분리하거나 입력에 따른 위험도 판정을 목록·호출 제한에 적용한다. 실제 `UnlinkTemplatesTool`을 MCP 경유로 호출하여 BE 쓰기가 차단되는 회귀 테스트를 추가한다.

- [ ] 🟡 **확인 카드 정화에서 제로폭 문자와 일부 방향 문자가 남음** — [ConfirmCard.java:54](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/ConfirmCard.java:54) — 근거: 제거 조건에 `U+061C`, `U+200B`, `U+200C`, `U+200D`, `U+2060`, `U+FEFF`가 없다. FE는 전달받은 이름을 텍스트로 그대로 렌더한다 — 재현: BE 이름이 `"\u200B"`뿐이면 정화 후에도 null이 아니어서 FE의 ‘이름 없음’ 대체 문구 대신 시각적으로 빈 이름이 표시된다. `prod\u200B`와 `prod`도 구별하기 어렵다 — 수정 제안: 표시용 문자열에서 방향 제어·비가시 문자를 제거하거나 명시적으로 표시한다. ZWJ처럼 정상 문자 조합에 쓰이는 경우의 정책도 정하고, 해당 코드 포인트와 비가시 문자만 있는 이름을 테스트한다.

- [ ] 🟡 **대화를 다시 열면 확인 카드 대상 표와 DESTRUCTIVE 표시가 사라짐** — [AiToolCallbacks.java:128](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:128), [aiChatStore.ts:167](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:167) — 근거: 실시간 SSE에는 `targets`, `tier`, `input`을 보내지만 transcript에는 `actionId`, `name`, `summary`만 저장한다. FE 재생 경로도 `targets`를 복원하지 않고 누락된 tier를 `WRITE`로 처리한다 — 재현: 삭제 확인 카드가 포함된 대화를 종료한 뒤 다시 열면 대상 ID·이름 표가 없어지고 빨간 DESTRUCTIVE 강조도 사라진다. 특히 트리거 삭제 요약은 이름만 포함하므로 대상 ID 확인이 어려워진다 — 수정 제안: 확인 당시의 정화된 대상·등급·입력을 transcript에도 저장하고 FE 타입과 재생 로직에 반영한다. 실제 서버 transcript를 FE에서 재생하는 계약 테스트를 추가한다.

- [ ] 🟡 **BE 401이 발생해도 MCP 인증 캐시가 즉시 폐기되지 않음** — [McpTokenValidator.java:49](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpTokenValidator.java:49), [AbstractBeTool.java:42](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/AbstractBeTool.java:42), [McpServerConfig.java:156](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:156) — 근거: 인증 성공을 300초 캐시하고, 툴 실행 중 BE 401은 일반 `ToolResult.fail` 문자열로 변환한다. `validator.evict()` 호출처는 없다. 따라서 요청서의 “BE 401 → 토큰 무효 처리”는 캐시가 없는 인증 검사 경로에 한정된다 — 재현: MCP 인증 캐시를 채운 뒤 사용자를 비활성화하거나 역할을 변경하면 BE 작업은 차단되지만, MCP 요청은 캐시 만료까지 인증을 통과하여 일반 툴 오류로 끝난다 — 수정 제안: 인증 실패 정보를 구조화해 전달하고 해당 토큰 캐시를 폐기하여 다음 요청에서 OAuth 재인증으로 이어지게 한다. 인증 성공 후 BE 응답을 401로 바꾸는 테스트가 필요하다.

- [ ] 🟡 **V7은 구버전 병행 실행과 코드만 롤백하는 배포에 호환되지 않음** — [V7__ai_insight_owner.sql:9](C:/worktrees/zm-157-ai/src/main/resources/db/migration/V7__ai_insight_owner.sql:9), [AlertDigestService.java:154](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/insight/AlertDigestService.java:154) — 근거: 기존 4열 유니크 제약을 5열 제약으로 교체한다. HEAD의 구버전은 여전히 4열 `ON CONFLICT`를 사용하며, 조회에도 owner 조건이 없다 — 실패 시나리오: V7 적용 후 구버전 프로세스가 계속 서비스하면 요약 저장의 conflict 대상이 맞지 않는다. 새 코드가 사용자별 행을 생성한 뒤 구버전이 조회하면 다른 소유자의 행을 반환하거나 다중 행 오류가 발생할 수 있다. 운영에서 병행 배포하는지는 미확인이다 — 수정 제안: 구버전 요청을 모두 종료한 후 V7과 새 코드를 함께 배포하는 절차 및 롤백 제한을 명시한다. 무중단 병행 실행이 필요하면 새 테이블로 분리하는 등 단계적 전환이 필요하다. PostgreSQL에서 V4→V7 및 사용자별 저장·갱신·조회 검증도 추가한다.

테스트는 일부 방어 로직을 검증하지만 위 결함을 포착하지 못한다. `McpServerConfigTest`는 직접 지정한 tier의 가짜 툴만 사용하여 실제 툴 분류 누락을 검사하지 않는다. `AlertDigestCacheKeyTest`는 mock SQL 문자열과 owner 파라미터만 확인하므로 마이그레이션·유니크 충돌·실제 사용자 격리를 보장하지 않는다. 카드 테스트에도 제로폭 문자와 서버 transcript 재생 검증이 없다. 기존 `tool.*` 110건 통과 XML은 확인했다.

**중점 확인 요청 판정**

| 항목 번호 | 판정 OK/문제 | 한 줄 근거 |
|---|---|---|
| 8 | 문제 | 현 DESTRUCTIVE 4종의 입력 개수 계산에서는 우회를 찾지 못했으나, `clear=true`의 등급 누락으로 제한을 우회하며 이름 정화에도 비가시 문자가 남는다. |
| 9 | 문제 | 새 SQL과 5열 유니크 키는 정합하나 구버전 병행·롤백 호환 문제가 있고, 실제 DB 적용 검증은 없다. |

**확인했고 문제없음**

- 현재 DESTRUCTIVE 4종은 기본 비노출·호출 거부이며, 허용해도 write scope와 대상 상한을 검사한다. 중첩 입력이 실제 복수 ID로 해석되는 경로는 발견하지 못했다.
- 요약 캐시 owner는 인증된 사용자 ID에서 가져오며 조회·저장·충돌 키에 모두 포함된다. 빈 owner를 거부하고 V7은 기존 공유 캐시를 제거한다.
- 실시간 확인 카드의 nullable 이름·선택적 detail 계약은 FE와 맞으며, 대상 이름을 HTML·Markdown으로 해석하지 않는다.
- 서버와 FE의 턴당 카드 상한은 모두 5이고 새 턴에 초기화된다. dev 직접 실행 기본값도 false다.
- BE의 `200 + status:error + code:403`은 프록시에서 오류로 처리하며, BE 요청에 사용자 인증 정보를 그대로 전달한다.

---

## 1차 검수 반영 (Claude, 2026-09-17)

### BE — 9건 전부 반영
- [x] 🔴 refresh 경합: 시각 비교 폐기 → 사용자별 세대(`REFRESH_GEN:<userId>`, INCR). 세대 확인·토큰 소비·재발급(`ROTATE_LUA`)과 세션 복원(`STORE_SESSION_LUA`)을 Redis Lua로 원자 처리, `refresh()`는 회전 후 세대 변경 시 새 토큰 폐기+401. `RefreshTokenStore` 인터페이스 분리(운영 Redis·테스트 메모리). 경합·경계·16스레드 동시 회전 테스트. Lua는 로컬 Redis :6379에서 `ZM157TEST:*` 격리 키로 13항목 실측 후 키 정리.
- [x] 🔴 위젯 IDOR: `HostVisibilityChecker`(사용자 토큰 `InventoryPort.listHosts` 단건) — 위젯 EP 5개 전부. 관리자 통과, 미연동 비관리자 거부, 못 봄/없음 구분 없이 200+403.
- [x] 🔴 `/event/stats`: `EventService.visibleEventIds(ctx, from, to)`(목록·벨과 같은 판정) → 비관리자 집계 SQL에 `event_id = ANY(?)`. 미연동 비관리자 403.
- [x] 🔴 update-email: `currentPassword` 필수(비밀번호 있는 계정), `verifyCurrentPassword` 공용화. 비밀번호 없는 온보딩 계정은 통과.
- [x] 🔴 `markEmailVerified` 비밀번호 발급 시 일괄 폐기. 비밀번호 변경 경로 전수 grep(4곳) 모두 폐기.
- [x] 🟡 V61 → **반복 마이그레이션 `R__clear_seed_admin_public_mailbox.sql`**(dev·IT DB 모두 V59까지라 V60 미적용 확인 → 버전 번호는 어느 쪽이든 순서 의존). `FlywayMigrationSmokeIT`가 R__를 세지 않도록 `version is not null` 한정 + R__ 적용 단언 추가(IT 미실행).
- [x] 🟡 SUPER_ADMIN 통일: `CallerContexts`·`JwtAuthFilter` ADMIN∪SUPER_ADMIN → SYSTEM. `logout`·`resetPassword`의 SUPER_ADMIN/미연동 분기 보정.
- [x] 🟡 레거시 null authToken: `ZabbixClient.callRaw`에서 인증 필요 메서드를 토큰 없이 부르면 `EngineException(FORBIDDEN)`(예외: `user.login`·`apiinfo.version`) → 200+403.
- [x] 🟡 테스트 보강: 실제 id·폐기 인자 검증, 상태 보존 캐시 대역으로 관리자 캐시 비누출, MockMvc로 200+403·`Set-Cookie`.
- 테스트: 루트 `*Test` 3,246 + `:engine-zabbix:test` 126 전부 통과(IT 0건 실행, `ApmCollectorLiveRuntimeTest`도 이번엔 통과).

### FE — 5건 + AI 기록 재생 반영
- [x] 🔴 계정 전환 잔존: `switchClientSession`(세션 epoch 증가·진행 중 조회 취소·캐시 비움·인증 정보 비움) — 로그인·계정 id 변경 공통. AI 스토어 초기화·스트림 abort, `useDmoveQuery`·AI 스토어가 epoch로 늦은 응답 폐기, 가드 하위 트리 재마운트. 실제 QueryClient·Redux 통합 테스트(되돌리면 실패 확인).
- [x] 🔴 스피너 고착/persist 권한 허용: `useAuth`가 loading·error·ready 분리, 이번 세션 서버 응답만 사용. 가드에 `error`(오류+재시도). `PageWrapper` 분리.
- [x] 🔴 위젯 저장 200+403 성공 처리: `widget.api.ts` 쓰기 4종만 실패 envelope → 예외, 권한 안내·입력 보존·목록 재조회(되돌리면 10건 중 8건 실패 확인).
- [x] 🟡 `/sign-in/` 변형: `matchPath` 기준 판정.
- [x] 🟡 테스트 공백: 통합 테스트로 교체 + `zm157WidgetSave.test.tsx`.
- [x] (AI 계약) transcript의 `tier`·`targets` 복원, 옛 기록은 기존 폴백.
- 검증: 관련 jest 723 중 720(기존 실패 3), tsc·typecheck:contract(환경 1건), eslint 56파일 통과.

### AI — 5건 전부 반영
- [x] 🔴 `clear=true` 우회: `AiTool.effectiveTier(input)`/`destructiveFlags()` — unlink `clear=true` → DESTRUCTIVE(해석 불가 값도 DESTRUCTIVE). MCP 호출·채팅 게이트·dev EP 모두 입력 기반 등급. 전 툴 위험 파라미터 분류 테스트(`DestructiveParamClassificationTest`, 첫 실행에서 `manualClose` 2건 포착 → 검토 목록에 사유와 함께 WRITE 유지).
- [x] 🟡 정화: 유니코드 Cf 전체·한글 채움 문자 제거(ZWJ 포함), 공백류 정규화, 비면 null.
- [x] 🟡 transcript `confirm_required`에 `tier`·`targets` 저장(SSE와 동형).
- [x] 🟡 MCP 캐시: `BeAuthFailures`(호출 스레드 범위 401 기록) → `validator.evict` + `mcp.auth_revoked`.
- [x] 🟡 V7: README·CLAUDE.md에 "구버전 전부 내린 뒤 배포, 롤백 SQL" 절차. 4열 제약 유지 불가 결론.
- 검증: AI 전체 162건 통과. 작업 중 `ConfirmCardTest.java`가 0바이트로 비워졌다가 원문으로 복원(세 워크트리 빈 파일 0건 재확인).

### 알려진 병합 주의
- BE 워크트리 기준 `200c936` → master는 현재 `8df357d`. **ZM-159**(`C:/worktrees/zm-159-be`, Zabbix 호출 공통 유틸화)가 `ZabbixClient`·`HostService`·`EventService`를 크게 바꿀 예정 → 병합 충돌 예상.
- FE jest 기존 실패 `apmRoutes` 2건은 master `2e1ae38` 병합 시 해소.

## 검수 결과 (2차)

(Codex 2차 — 2026-09-17 10:20~10:39, `gpt-6-astra` xhigh, read-only. BE·FE·AI 병렬)

### BE 2차 검수 결과

**판정: 재검수 필요.** 1차 지적 9건 중 6건은 해결, 3건은 부분 해결이다. 세션 재생성 경합과 태그 권한 fail-open이 남아 있다.

변경·미추적 파일을 읽기 전용으로 검수했다. 기존 XML의 루트 3,246건·engine-zabbix 126건 통과는 확인했으며, 테스트 재실행·IT·실서버 검증은 하지 않았다.

**1차 지적 해결 표**

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| 1. refresh 회전·일괄 폐기 경합 | 부분 | [RedisRefreshTokenStore.java:34](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:34)의 회전 Lua와 [AuthService.java:100](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:100)의 세대별 복원으로 기존 경합은 차단된다. 다만 로그인·본인 재발급·로그아웃 경합은 아래와 같이 남는다. |
| 2. 호스트 위젯 IDOR | 해결 | [WidgetsController.java:97](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsController.java:97)에서 5개 EP 모두 기능 권한 다음에 대상 검사를 수행한다. [HostVisibilityChecker.java:40](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/host/HostVisibilityChecker.java:40)는 사용자 컨텍스트의 단건 조회를 사용하고 미연동·비가시 대상을 거부한다. |
| 3. 이벤트 통계 범위 누출 | 부분 | [EventStatsController.java:54](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/stats/EventStatsController.java:54)에서 비관리자 범위를 전달하고 SQL 7종에 적용한다. 그러나 [EventService.java:639](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/EventService.java:639)가 의존하는 태그 감지에 fail-open이 있다. |
| 4. update-email 비밀번호 검증 우회 | 해결 | [UserService.java:399](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:399), [UserService.java:565](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:565): 공용 검증기를 사용한다. 비밀번호 보유 계정은 현재 비밀번호가 필요하고, 비밀번호 없는 온보딩 계정만 예외다. |
| 5. 이메일 인증 비밀번호 발급 시 폐기 누락 | 해결 | [UserService.java:166](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:166): 실제 비밀번호 발급 시 해당 사용자 세션·refresh를 폐기한다. |
| 6. V61 선적용 후 V60 합류 문제 | 해결 | [R__clear_seed_admin_public_mailbox.sql:15](C:/worktrees/zm-157-be/src/main/resources/db/migration/R__clear_seed_admin_public_mailbox.sql:15)로 전환했다. [FlywayMigrationSmokeIT.java:31](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/support/FlywayMigrationSmokeIT.java:31)의 버전 집계 분리도 맞다. IT 실행 결과는 없다. |
| 7. 미연동 SUPER_ADMIN 판정 불일치 | 해결 | [CallerContexts.java:49](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/common/metric/CallerContexts.java:49), [JwtAuthFilter.java:101](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/security/JwtAuthFilter.java:101)가 같은 관리자 집합을 사용한다. 로그아웃도 공용 Zabbix 토큰을 유지한다. |
| 8. 레거시 null authToken의 401 | 해결 | [ZabbixClient.java:99](C:/worktrees/zm-157-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:99)에서 호출 전 FORBIDDEN으로 차단한다. 단, 미연동 로그아웃에 미치는 영향은 아래 수정이 필요하다. |
| 9. 세션·캐시 테스트 공백 | 부분 | [MyProfileUpdateSecurityTest.java:140](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/MyProfileUpdateSecurityTest.java:140)의 정확한 ID 검증, [HostGroupMonitoringTest.java:428](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/host/HostGroupMonitoringTest.java:428)의 상태 보존 캐시 검증은 유효하다. 운영 Lua·실제 집계 SQL·추가 경합 검증은 부족하다. |

**새 결함 및 1차 미발견 결함**

- [ ] 🔴 **로그인·본인 재발급이 후속 폐기의 최신 세대를 받아 세션을 되살림** — [RefreshTokenService.java:48](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RefreshTokenService.java:48), [UserController.java:146](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:146), [AuthService.java:65](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:65) — **근거:** 발급 시점에 현재 세대를 새로 읽으며, 자격 증명 검증이나 이번 비밀번호 변경이 확보한 세대를 전달받지 않는다. 로그인은 세션도 무조건 저장한다. — **시나리오:** 본인 비밀번호 변경·폐기 완료 → 컨트롤러 재발급 직전에 관리자가 비밀번호 재설정 또는 비활성화·폐기 → 원래 요청이 최신 세대로 재발급한다. 비활성 계정도 기존 access 토큰의 visitor 바인딩이 복구된다. 이전 비밀번호 검증을 통과한 로그인 요청이 재설정 뒤 재개되는 경우도 같다. — **수정 제안:** DB 커밋과 연계한 버전·잠금 정책으로 검증과 발급을 묶는다. 본인 재발급에는 해당 변경이 얻은 `expectedGeneration`을 전달하고, 이후 폐기가 있으면 거부한다.

- [ ] 🔴 **로그아웃과 refresh 회전의 경합으로 로그아웃한 세션이 복구됨** — [AuthService.java:110](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:110), [RefreshTokenService.java:113](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RefreshTokenService.java:113) — **근거:** 로그아웃은 세션 키와 전달받은 토큰만 삭제하며 세대를 변경하지 않는다. 회전으로 생긴 후속 토큰과 `restoreSession()`은 계속 유효하다. — **시나리오:** refresh가 T1→T2 회전을 완료 → 로그아웃이 세션과 이미 소비된 T1을 삭제 → refresh가 같은 세대로 세션을 복원하고 T2를 반환한다. ADMIN으로도 성립하므로 Zabbix 로그아웃 결과와 무관하다. — **수정 제안:** 로그아웃 대상 세션·토큰 계열에도 폐기 표식을 적용하고, 회전과 세션 복원이 같은 표식을 원자적으로 검사하게 한다.

- [ ] 🔴 **태그 권한 감지 실패 시 통계·목록·벨에서 제한된 사건이 노출됨** — [EventService.java:639](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/EventService.java:639), [ProblemTagFilterGuard.java:35](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/ProblemTagFilterGuard.java:35), [ProblemTagFilterGuard.java:60](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/ProblemTagFilterGuard.java:60) — **근거:** `lastKnown` 기본값은 false이고 감지 실패 시 그대로 반환한다. 그러면 새 `visibleEventIds()`는 사용자 토큰으로 사건을 재검증하지 않고 호스트 기준 후보 전체를 반환한다. 재검증 호출 자체의 실패는 닫혀 있지만, 그 앞의 감지 단계는 열려 있다. — **시나리오:** 태그 제한이 있는 설치본에서 기동 직후 감지 캐시가 없고 `usergroup.get`이 실패한다. 호스트 조회 또는 가시 호스트 캐시가 정상이라면 동일 호스트의 비허용 사건도 집계된다. 기존 목록·벨에도 같은 문제가 있다. — **수정 제안:** 미확인·감지 실패 상태에서는 사용자 토큰 검증을 강제하거나 결과를 거부한다. 초기 감지 실패를 포함한 회귀 테스트가 필요하다.

- [ ] 🔴 **시드 admin의 공개 메일을 지워도 이미 발급한 OTP로 탈취 가능** — [R__clear_seed_admin_public_mailbox.sql:15](C:/worktrees/zm-157-be/src/main/resources/db/migration/R__clear_seed_admin_public_mailbox.sql:15), [AuthService.java:242](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:242), [AuthService.java:208](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:208) — **근거:** 마이그레이션은 이메일만 변경하고 OTP를 폐기하지 않는다. OTP 검증도 현재 이메일과 발급 당시 이메일을 대조하지 않는다. — **시나리오:** 적용 직전 공개 메일함으로 받은 비밀번호 재설정 OTP가 남은 설치본에서, 잔여 유효시간인 최대 3분 안에 검증·재설정을 진행하면 이메일이 NULL이어도 admin 비밀번호를 바꿀 수 있다. — **수정 제안:** 이메일을 제거하는 대상의 ACTIVE·VERIFIED OTP도 함께 폐기한다. 기존 OTP가 있는 DB를 대상으로 이행 테스트를 추가하고, 이메일 변경 시 OTP 무효화 정책도 적용한다.

- [ ] 🟡 **미연동 비관리자의 로그아웃이 FORBIDDEN으로 끝나 쿠키 만료가 누락됨** — [AuthService.java:115](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:115), [ZabbixClient.java:126](C:/worktrees/zm-157-be/engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixClient.java:126), [AuthController.java:84](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthController.java:84) — **근거:** 미연동 USER도 `zabbixUserService.logout(null)`을 호출한다. 새 검사에서 예외가 발생하므로 컨트롤러의 만료 `Set-Cookie`까지 도달하지 않는다. — **시나리오:** MovesEye 전용 일반 계정의 정상 로그아웃이 `200 + code:403`으로 반환되고 쿠키가 남는다. 서버 세션 삭제는 이미 수행된 상태다. — **수정 제안:** 개인 Zabbix 세션이 없는 계정은 원격 로그아웃을 생략하고, 로컬 로그아웃과 쿠키 만료를 완료한다. `user.logout`을 익명 허용 목록에 넣는 방식으로 해결해서는 안 된다.

- [ ] 🟡 **동시성 테스트가 작업 스레드 예외를 놓치며 운영 구현 검증이 분리됨** — [RefreshTokenServiceTest.java:160](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/RefreshTokenServiceTest.java:160), [InMemoryRefreshTokenStore.java:42](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/InMemoryRefreshTokenStore.java:42), [PermissionEnforcementControllerTest.java:294](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/security/PermissionEnforcementControllerTest.java:294) — **근거:** `submit()`의 Future를 회수하지 않아 회전 작업의 예외가 테스트 실패로 전달되지 않는다. 16개 작업은 서로 다른 토큰을 사용하고 운영 Lua 대신 메모리 구현을 검증한다. 통계 테스트도 집계 서비스를 mock 처리한다. — **시나리오:** 작업 스레드에서만 회전이 실패하거나 운영 Lua·SQL 바인딩에 회귀가 생겨도 현재 검증으로 놓칠 수 있다. — **수정 제안:** Future의 결과·예외를 확인하고 동일 토큰 동시 회전을 검증한다. 격리된 Redis의 실제 Lua, PostgreSQL의 빈 범위·제한 범위 집계, 위 경합 순서를 자동 검증한다.

**확인했고 문제없음**

- 위젯 대상 검사는 실제 Zabbix 어댑터의 `hostids` 필터까지 연결된다.
- 단일 Redis 구성에서 회전 Lua의 세대 검사·기존 토큰 소비·후속 토큰 저장은 원자적이다. 세션 값의 JSON 문자열 형식도 기존 조회와 맞는다.
- 통계 SQL 7종의 범위 조건과 인자 순서는 맞으며, 빈 집합이 전체 범위로 바뀌지 않는다.
- ADMIN·SUPER_ADMIN의 SYSTEM 판정과 공용 Zabbix 토큰 로그아웃 방지가 일치한다.
- 현재 호출부의 익명 메서드 `user.login`·`apiinfo.version`은 허용된다. `FORBIDDEN=7`도 기존 proto 번호를 유지한다.

### FE 2차 검수 결과

**판정: 재검수 필요 — 🔴 1건, 🟡 5건.** 조회 캐시·AI 초기화는 개선됐지만, 계정 전환 후 이전 작업이 새 계정으로 계속 실행되는 경합이 남아 있다.

요청서 전체·갱신 계약서와 FE 변경 48개·미추적 12개 파일을 검토했다. 실제 React Query·Redux reducer·Router를 연결하고 HTTP/UI 일부를 대체하여 메모리 내 재현을 수행했다. 파일은 수정하지 않았으며, 서버 연동·브라우저 E2E·전체 Jest는 실행하지 않았다.

**1차 지적 해결 여부**

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| 계정 변경 후 이전 화면 데이터·AI 대화 잔존 | 해결 | [session.ts:28](C:/worktrees/zm-157-fe/src/utils/session.ts:28)의 공통 정리, [useDmoveQuery.ts:40](C:/worktrees/zm-157-fe/src/hooks/useDmoveQuery.ts:40)의 epoch 검사, [aiChatStore.ts:591](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:591)의 초기화 등록을 확인했다. 연속 쓰기 경합은 아래 별도 지적. |
| 호스트 위젯 IDOR — BE 대조 | 해결 | [WidgetsController.java:97](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/widget/WidgetsController.java:97)에서 조회·쓰기 모두 [HostVisibilityChecker.java:40](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/host/HostVisibilityChecker.java:40)를 거친다. 미연동 비관리자 거부와 사용자 토큰 기반 호스트 조회가 적용됐다. |
| 프로필·권한 조회 실패 시 스피너/persist 권한 허용 | 부분 | 최초 실패의 오류·재시도는 [PageWrapper.tsx:131](C:/worktrees/zm-157-fe/src/routes/PageWrapper.tsx:131)에 구현됐다. 그러나 [useAuth.ts:63](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:63)은 기존 데이터가 있으면 후속 오류도 `ready`로 판정한다. Redux를 직접 소비하는 UI도 미검증 권한을 사용한다. |
| 위젯 저장 200+403을 성공으로 처리 | 해결 | [widget.api.ts:21](C:/worktrees/zm-157-fe/src/services/widget.api.ts:21)에서 쓰기 4종의 실패 envelope을 예외로 변환한다. [AddChartModal.tsx:124](C:/worktrees/zm-157-fe/src/components/Dashboard/AddChartModal.tsx:124)의 성공 안내·초기화는 저장 성공 뒤에만 실행된다. |
| 로그인 경로 변형 차단 | 부분 | [AuthLayout:31](C:/worktrees/zm-157-fe/src/layouts/auth/index.tsx:31)의 `matchPath`로 trailing slash·대소문자 직접 진입은 해결됐다. 같은 레이아웃 안에서 이동할 때는 최초 판정을 재사용한다. |
| 세션·저장 실패 테스트 공백 | 부분 | 실제 QueryClient·Redux·가드 연결은 개선됐다. 다만 [zm157AuthSession.test.tsx:142](C:/worktrees/zm-157-fe/src/__tests__/zm157AuthSession.test.tsx:142)은 단일 가드 구조이며, [zm157WidgetSave.test.tsx:49](C:/worktrees/zm-157-fe/src/__tests__/zm157WidgetSave.test.tsx:49)은 GridLayout을 제거해 실제 배치 복원을 검증하지 못한다. |
| AI 추가 항목: transcript 복원 | 부분 | [aiChatStore.ts:177](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:177)의 `tier`·`targets` 복원은 해결됐다. AI 서버는 여전히 확인 카드의 `input`을 기록하지 않는다. |

**새 결함·잔여 결함**

- [ ] 🔴 **A가 시작한 복수 위젯 저장이 계정 전환 후 B로 계속 실행됨** — [CustomChartsDashboard.tsx:173](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:173), [useWidgets.ts:50](C:/worktrees/zm-157-fe/src/hooks/useWidgets.ts:50) — **근거:** 세션 전환은 Query를 취소하지만 진행 중 mutation과 그 뒤의 반복문은 멈추지 않는다. `createWidget()` 전후에 epoch 검사도 없다. — **시나리오:** A의 첫 POST 응답을 지연 → 프로필로 B 전환 감지·epoch 증가·화면 재마운트 → 첫 응답 완료. 실제 코드 조합에서 두 번째 POST가 **B·새 epoch로 호출됨**을 확인했다. B의 권한이 허용하면 B가 시작하지 않은 변경이 실행된다. — **수정 제안:** 작업 시작 시 epoch를 고정하고 각 후속 쓰기 전·응답 후 검사하여 이전 작업을 종료한다. 이전 mutation의 완료 콜백도 새 세션에 영향을 주지 않도록 막고 지연 응답 회귀 테스트를 추가한다.

- [ ] 🟡 **권한 검증 실패 후에도 기존 권한으로 화면·편집 UI를 허용함** — [useAuth.ts:63](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:63), [useIsUserRoleAdmin.ts:23](C:/worktrees/zm-157-fe/src/hooks/useIsUserRoleAdmin.ts:23), [pageAccess.ts:53](C:/worktrees/zm-157-fe/src/routes/pageAccess.ts:53) — **근거:** 캐시 데이터가 있으면 오류보다 우선하여 `ready`가 된다. 권한 조건 없는 페이지의 관리자 버튼은 검증 상태 없이 persist된 Redux 역할을 읽는다. — **시나리오:** 정상 조회 후 403을 반환시키면 Query는 `error`인데 보호 화면은 계속 열린다. 별도로 persist ADMIN을 복원하고 최초 프로필 조회를 실패시키면 권한 조건 없는 페이지에서 관리자 편집 버튼이 표시되는 것도 재현했다. 영향은 FE 노출·요청 허용이며 BE의 최종 검사는 별개다. — **수정 제안:** 인증·권한 재검증 실패 시 보호 UI를 닫고 재시도를 제공한다. 메뉴·편집 버튼도 검증된 역할·권한과 상태를 함께 소비하게 한다.

- [ ] 🟡 **배치 저장 거부 후 재조회해도 GridLayout 위치가 복원되지 않음** — [useWidgets.ts:41](C:/worktrees/zm-157-fe/src/hooks/useWidgets.ts:41), [CustomChartsDashboard.tsx:59](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:59) — **근거:** 실패 처리는 캐시 무효화뿐이다. 서버가 같은 기존 배치를 반환하면 GridLayout에 전달되는 배치 값도 이전과 같아서 내부 드래그 상태를 되돌리지 못한다. — **시나리오:** 실제 GridLayout의 드래그 콜백으로 `x=0→6` 이동 후 PATCH에 403 반환. GET 재조회 뒤에도 화면은 `translate(604px,0px)`에 남았다. 현재 테스트는 GET 호출 횟수만 확인한다. — **수정 제안:** 실패 시 GridLayout 내부 상태까지 명시적으로 복원하고, 복원이 다시 저장을 유발하지 않게 처리한다. 실제 격자의 최종 위치를 검증한다.

- [ ] 🟡 **복수 생성의 부분 성공 후 재시도하면 위젯이 중복 생성됨** — [CustomChartsDashboard.tsx:173](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:173), [AddChartModal.tsx:120](C:/worktrees/zm-157-fe/src/components/Dashboard/AddChartModal.tsx:120) — **근거:** 앞서 성공한 항목은 저장되지만, 실패 후 모달은 전체 템플릿을 다시 제출한다. 성공 항목 제외나 멱등 처리가 없다. — **시나리오:** CPU 생성 성공 → Memory 생성 403 → 권한 복구 후 재시도. 저장 결과가 `CPU, CPU, Memory`가 되는 것을 재현했다. — **수정 제안:** 부분 성공 항목을 추적해 남은 항목만 재시도하고 사용자에게 결과를 알린다. 또는 BE의 원자적 일괄 생성·멱등 키 계약을 도입한다.

- [ ] 🟡 **인증 레이아웃 재사용 시 로그인 화면 차단을 건너뜀** — [AuthLayout:31](C:/worktrees/zm-157-fe/src/layouts/auth/index.tsx:31), [PasswordReset.tsx:48](C:/worktrees/zm-157-fe/src/pages/authentication/PasswordReset.tsx:48) — **근거:** `alreadySignedIn`은 최초 pathname으로 한 번만 계산된다. 비밀번호 재설정과 로그인은 같은 레이아웃을 사용하며 재설정 완료는 SPA 이동이다. — **시나리오:** 로그인 상태에서 `/password-reset` 진입 후 같은 레이아웃 안에서 `/sign-in/`으로 이동하면 인증 플래그가 `1`인데도 로그인 폼이 표시됨을 재현했다. — **수정 제안:** 현재 로그인 라우트 진입마다 판정하되 로그인 제출 직후의 복귀 흐름은 별도로 관리한다. 직접 진입 외에 형제 라우트 간 이동 테스트를 추가한다.

- [ ] 🟡 **transcript 입력 복원 테스트가 실제 서버에 없는 필드를 가정함** — [AiToolCallbacks.java:134](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:134), [zm157AiConfirmAndLinks.test.tsx:178](C:/worktrees/zm-157-fe/src/__tests__/zm157AiConfirmAndLinks.test.tsx:178) — **근거:** 실시간 확인 이벤트에는 `input`이 있지만 저장용 `saved`에는 없다. FE 테스트는 직접 만든 transcript에 `input`을 넣고 복원을 단언한다. — **시나리오:** 대화를 다시 열면 `tier`·대상 표는 유지되지만 확인 카드의 입력 파라미터 표는 사라진다. — **수정 제안:** 확인 당시 입력을 transcript에 저장하거나 앞선 `tool_call`과 안정적인 ID로 연결한다. 실제 서버 직렬화 형태를 사용하는 계약 테스트로 검증한다.

**확인했고 문제없음**

- 정상적인 중첩 가드의 A→B 전환은 epoch가 한 번 증가하고 B 데이터를 재조회했다. 이 경로의 무한 루프는 재현되지 않았다.
- 세션 전환 시 AI 대화·대기 액션이 초기화되고 스트림이 abort되며, 늦은 이벤트도 버려졌다.
- 관리자 역할 집합, 이벤트 메뉴·벨 이동, APM edit 가드, Geo 좌표 편집 조건은 갱신 계약과 일치한다.
- GET 권한 안내의 라이선스 오류 제외와 경로별 중복 억제는 유지된다.

### AI 2차 검수 결과

**판정: 수정 후 머지.** 1차 5건 중 **해결 3건·부분 해결 2건**이다. 영구 삭제 우회는 해결됐지만, MCP 인증 캐시 폐기의 누락·경합과 transcript 입력 누락이 남았다.

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| `clear=true`로 파괴 작업 제한 우회 | 해결 | [UnlinkTemplatesTool.java:60](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/zabbix/UnlinkTemplatesTool.java:60)의 선언을 [McpServerConfig.java:160](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:160)과 채팅 게이트가 사용한다. 실제 툴로 차단·상한·write scope 테스트도 확인했다. |
| 확인 카드의 비가시·방향 문자 잔존 | 해결 | [ConfirmCard.java:63](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/ConfirmCard.java:63)에서 Cf·채움 문자를 제거하고 공백을 정규화한다. 지적한 코드 포인트, 비가시 문자만 있는 이름, ZWJ 정책을 테스트한다. |
| transcript에서 대상 표·등급 소실 | 부분 | [AiToolCallbacks.java:134](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:134)에 `tier`·`targets` 저장, [aiChatStore.ts:177](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:177)에 복원이 반영됐다. 요청했던 `input` 저장은 빠졌다. |
| BE 401 이후 MCP 인증 캐시 유지 | 부분 | [McpServerConfig.java:181](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:181)의 실행 구간에서는 동작한다. 사전 조회의 401과 동시 인증 조회 경합은 처리하지 못한다. |
| V7 병행 배포·코드만 롤백 비호환 | 해결 | [README.md:107](C:/worktrees/zm-157-ai/README.md:107)에 구버전 종료 후 배포, 병행 금지, 스키마 복구 후 롤백 절차가 명시됐다. **정지 교체 배포를 전제로 한 해결**이며 실제 DB 검증은 남아 있다. |

**새 결함 및 반영 후 잔여 결함**

- [ ] 🟡 **데이터소스 사전 조회의 401은 인증 캐시를 폐기하지 않음** — [McpServerConfig.java:155](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:155), [DataSourceStatusService.java:50](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/DataSourceStatusService.java:50) — **근거:** 데이터소스 조회가 `BeAuthFailures.open()`보다 먼저 실행되고 예외를 삼킨다. 소스 미설정으로 판정되면 감시 범위에 들어가기 전에 반환한다. — **시나리오:** 인증 캐시를 채운 뒤 계정을 비활성화하고, 데이터소스 캐시가 없는 상태로 호출했다. BE 401이 발생해도 “데이터소스 미연결” 오류만 반환했으며, 다음 인증 검사는 BE 재조회 없이 통과했다(`profileChecks=1`). — **수정 제안:** 사전 조회부터 조기 반환까지 전체 호출을 감시하고, 해당 범위에서 401을 관측하면 반드시 캐시를 폐기하도록 한다. 이 경로의 회귀 테스트를 추가한다.

- [ ] 🟡 **늦게 끝난 인증 조회가 폐기한 캐시를 다시 채움** — [McpServerConfig.java:188](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:188), [McpTokenValidator.java:63](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpTokenValidator.java:63) — **근거:** 검증 성공의 `cache.put()`과 폐기의 `cache.remove()` 사이에 세대 확인이나 동기화가 없다. — **시나리오:** 동시 인증 조회 하나의 성공 응답을 지연시켰다. 다른 호출이 BE 401을 받아 캐시를 폐기한 뒤 지연 응답을 완료시키면 캐시 크기가 **0→1**로 돌아가고 다음 인증 검사도 통과한다. 메모리 내 재현으로 확인했다. BE 작업 차단은 유지되지만 다음 요청의 재인증은 보장되지 않는다. — **수정 제안:** 토큰별 폐기 세대 또는 만료 시각까지 유지하는 무효 표식을 사용해 폐기 전에 시작한 조회의 재삽입을 차단한다. latch로 해당 순서를 고정한 테스트가 필요하다.

- [ ] 🟡 **확인 카드의 실행 입력이 여전히 저장되지 않으며 테스트가 누락을 고정함** — [AiToolCallbacks.java:134](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:134), [ConfirmCardGateTest.java:86](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/chat/engine/ConfirmCardGateTest.java:86) — **근거:** SSE에는 `input`을 넣지만 저장 이벤트에는 넣지 않는다. 새 테스트는 오히려 `doesNotContainKey("input")`을 단언한다. FE는 재생 시 `item.input`을 그대로 사용한다. — **시나리오:** 대화를 다시 열면 대상 표와 등급은 남지만, 당시 승인한 `hostId`·`clear`·`confirmName` 등의 실행 인자 표는 사라진다. — **수정 제안:** 저장 이벤트에도 `input`을 포함하고, 실제 직렬화된 transcript를 FE에서 재생했을 때 인자까지 유지되는 계약 테스트로 바꾼다.

**확인했고 문제없음**

- MCP·채팅 실행 판정에서 `effectiveTier` 누락은 발견하지 못했다. dev EP도 반환 등급에 적용하며 기본 비활성이다.
- 분류 테스트는 실제 툴 클래스를 스캔하고 위험 파라미터 선언·검토 목록·등급 상승을 검사한다. 기존 가짜 툴만으로 검증하던 공백은 보강됐다.
- `BeAuthFailures`의 정상·중첩 범위 종료 시 기록 정리와 403 비기록을 확인했다. 현재 툴의 BE 호출에서 병렬 실행 경로는 발견하지 못했다.
- 대조한 BE 프록시 경로에서 추가 권한 우회는 확인하지 못했다. 요약 캐시의 owner 조건과 V7의 5열 유니크 키도 일치한다.

읽기 전용으로 검수했다. 기존 컴파일 산출물의 관련 테스트 **17개를 메모리에서 재실행해 통과**했고, 위 인증 문제 2건은 가짜 BE로 재현했다. 기존 전체 테스트 XML은 **162건 통과**였으며, 새 빌드·실서버·실제 DB 마이그레이션은 실행하지 않았다.

---

## 2차 검수 반영 (Claude, 2026-09-17)

### BE
- [x] 🔴 로그인·본인 재발급의 최신 세대 획득: 발급에 기대 세대 전달, `ISSUE_LUA`가 현재 세대 일치 시에만 토큰+세션 저장. 로그인은 `loginWithPassword` **전에** 세대 읽기(경합 시 `WRONG_USER_OR_PASSWORD`, 실패 횟수 미집계). 본인 변경은 `revokeAllForUser`가 올린 세대로만 재발급(그 사이 폐기되면 쿠키 없이 성공 → 다음 요청 401).
- [x] 🔴 로그아웃↔회전 경합: 로그인 계열(family) 도입, 로그아웃은 `REFRESH_FAMILY_REVOKED:<family>` 표식, 회전·세션 복원 Lua가 원자 확인. 소비 흔적 `REFRESH_CONSUMED:<token>`(10분)으로 옛 쿠키 로그아웃도 계열 추적. **계열 없는 기존 토큰은 거부 → 배포 직후 전원 1회 재로그인.**
- [x] 🔴 태그 감지 fail-open: 캐시 없음+감지 실패 → "제한 있음"(`lastKnown` 제거, 성공만 5분 캐시). 재검증 실패 시 목록·벨 숨김, 통계 200+403.
- [x] 🔴 시드 admin OTP: R__가 주소 제거 행의 ACTIVE·VERIFIED OTP를 DEACTIVE(CTE 한 문장, dev DB 롤백 트랜잭션 실측·멱등 확인). 이메일 NULL 계정 `verifyOtp` 거부, 이메일 변경 4경로에서 미사용 OTP 무효화. 🔴 dev DB admin은 현재 공개 주소 → 다음 기동 때 실제 적용.
- [x] 🟡 미연동 로그아웃: 원격 Zabbix 로그아웃 생략(익명 허용 목록 미추가), 원격 실패해도 로컬 로그아웃·쿠키 만료 완료. `LogoutMvcTest`.
- [x] 🟡 동시성·SQL: Future 회수, 같은 토큰 32스레드 → 1개만 성공, 운영 Lua 3종 로컬 Redis 격리 키 16항목 실측, 통계 SQL dev DB `BEGIN READ ONLY` 실측(빈 범위 0·제한 범위 정상). 자동 IT는 공유 DB라 생략.
- 테스트: 루트 `*Test` 3,263 통과(IT 0), engine-zabbix 126(UP-TO-DATE).

### FE
- [x] 🔴 전환 후 이전 작업 계속: 위젯 쓰기 4종이 시작 시 세션 epoch 고정·매 요청 전후 확인, 이전 세션 콜백 차단. axios 요청 인터셉터에 쓰기 요청 epoch 방어(GET 제외, epoch 미지정 호출은 기존 동작).
- [x] 🟡 재검증 실패 허용: 401/403이면 캐시 불신·보호 화면 종료·Redux 역할/권한 비움(5xx·네트워크는 이번 세션 값 유지). **역할·권한을 persist에서 제외**(복원 시 폐기) → 메뉴·관리자 버튼은 이번 세션 서버 값만.
- [x] 🟡 격자 복원: 거부 시 재조회+격자 키 재마운트, 마지막 동기화 배치와 같으면 저장 안 함. 실제 GridLayout 드래그 테스트(604px→0px, PATCH 1회).
- [x] 🟡 부분 성공 재시도: 모달이 생성 완료 항목 기억, 남은 항목만 전송 + 안내.
- [x] 🟡 로그인 화면 판정: 경로 변경마다 재판정(같은 경로의 제출 흐름은 유지).
- [x] 🟡 기록 재생 테스트: 실제 서버 직렬화 JSON으로 교체(`input` 포함).
- 검증: 관련 jest 747 중 744(기존 실패 3), tsc·contract(환경 1), eslint 57파일.

### AI
- [x] 🟡 사전 조회 401: 인증 직후부터 전체 호출을 감시, 401이면 반드시 evict + `mcp.auth_revoked`. `DataSourceStatusService`도 401 기록.
- [x] 🟡 캐시 재삽입: 토큰별 폐기 세대(`generations.compute`로 put/evict 직렬화), 폐기 전 시작 조회는 캐시 안 함. latch 테스트.
- [x] 🟡 transcript `input` 저장(SSE와 동형), 저장 키 집합 고정·왕복 직렬화 테스트.
- 검증: AI 전체 165 통과.

## 검수 결과 (3차)

(Codex 3차 — 2026-09-17 11:00~11:24, `gpt-6-astra` xhigh, read-only. BE·FE·AI 병렬)

### BE 3차 검수 결과

**판정: 수정 후 머지.** 머지 전 수정이 필요한 보안 경합 2건이 남아 있다.

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| 로그인·본인 재발급의 최신 세대 획득 | 부분 | [AuthService.java:67](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:67), [UserController.java:152](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserController.java:152): 기대 세대 전달과 본인 재발급은 반영됐다. 로그인은 활성 상태 조회와 세대 읽기 사이의 경합이 남는다. |
| 로그아웃↔refresh 회전 경합 | 해결 | [RedisRefreshTokenStore.java:54](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:54), [RedisRefreshTokenStore.java:80](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:80): 회전·세션 복원이 계열 폐기 표식을 원자적으로 검사한다. 소비된 토큰으로도 계열을 찾는다. |
| 태그 권한 감지 fail-open | 해결 | [ProblemTagFilterGuard.java:57](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/ProblemTagFilterGuard.java:57), [EventService.java:639](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/event/EventService.java:639): 감지 실패 시 재검증을 강제하고, 통계 재검증 실패는 거부한다. |
| 시드 admin OTP·이메일 변경 시 무효화 | 부분 | [R__clear_seed_admin_public_mailbox.sql:18](C:/worktrees/zm-157-be/src/main/resources/db/migration/R__clear_seed_admin_public_mailbox.sql:18), [AuthService.java:270](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:270): 시드 이행과 이메일 NULL 차단은 해결됐다. 추가된 이메일 변경 무효화에는 검증 경합이 남는다. |
| 미연동 비관리자 로그아웃 | 해결 | [AuthService.java:124](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:124): 미연동 계정은 원격 로그아웃을 생략하며 원격 실패도 쿠키 만료를 막지 않는다. |
| 동시성 테스트·운영 Lua/SQL 검증 | 부분 | [RefreshTokenServiceTest.java:219](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/RefreshTokenServiceTest.java:219): 동일 토큰 32개 동시 회전과 Future 회수는 반영됐다. 운영 Lua·SQL의 자동 회귀 검증은 없다. |

**새 결함 및 반영 후 잔여 결함**

- [ ] 🔴 **로그인 세대 검사가 활성 상태·DB 커밋과 분리됨** — [AuthService.java:67](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:67), [UserService.java:468](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:468) — **근거:** 활성 사용자 조회가 세대 읽기보다 먼저이며, 이후 `loginWithPassword()`는 상태를 검사하지 않는다. 폐기 역시 DB 트랜잭션 커밋 전에 실행된다. — **시나리오:** ACTIVE 조회 → 다른 요청이 비활성화·폐기 완료 → 로그인이 새 세대를 읽고 비밀번호 검증 → 비활성 계정에 access·refresh 발급. 메모리 재현에서 성공했다. 또한 세대 증가 후 DB 커밋 전에는 구 비밀번호와 새 세대가 조합될 수 있다. — **수정 제안:** 활성 상태·비밀번호 검증부터 발급까지 사용자별 잠금 또는 DB 버전 정책으로 묶고, DB 커밋과 폐기 순서를 함께 보장한다. — **후속 가능 여부: 불가, 머지 전 반드시 수정.**

- [ ] 🔴 **이메일 변경으로 폐기한 OTP가 진행 중인 검증으로 부활함** — [OtpService.java:57](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/OtpService.java:57), [AuthService.java:286](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:286) — **근거:** 새 무효화 처리는 검증과 직렬화되지 않으며, `updateOtpStatusById()`는 현재 상태와 무관하게 `VERIFIED`로 변경한다. 이메일 검사는 NULL 여부만 확인한다. — **시나리오:** 옛 주소의 ACTIVE OTP 조회 → 이메일 변경·OTP DEACTIVE 커밋 → 기존 검증 요청 재개 → VERIFIED 복구 → 비밀번호 재설정 성공. 이 순서를 메모리에서 재현했다. — **수정 제안:** 이메일 변경·OTP 검증·재설정을 같은 잠금/버전 정책으로 보호하고, 폐기된 OTP의 상태 전환을 조건부 갱신으로 거부한다. — **후속 가능 여부: 불가, 머지 전 반드시 수정.**

- [ ] 🟡 **운영 Lua·SQL 회귀 검증은 수동 실측에 의존함** — [RedisRefreshTokenStore.java:27](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:27), [RefreshTokenServiceTest.java:26](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/RefreshTokenServiceTest.java:26) — **근거:** 자동 테스트는 메모리 저장소를 사용하며 운영 Lua·집계 SQL 실측은 요청서의 수동 기록이다. — **시나리오:** Lua나 SQL 바인딩만 변경되면 단위 테스트가 회귀를 놓칠 수 있다. — **수정 제안:** 격리 Redis·PostgreSQL에서 동일 토큰 경합 및 빈 범위·제한 범위 집계를 자동 검증한다. — **후속 가능 여부: 가능. 위 보안 경합 수정의 회귀 테스트는 이번 수정에 포함.**

**확인했고 문제없음**

- 후속 폐기가 있으면 본인 재발급은 기대 세대 불일치로 거부된다.
- 계열 없는 기존 refresh 거부와 1회 재로그인 방침이 코드·계약서에 일치한다.
- 시드 주소 제거와 ACTIVE·VERIFIED OTP 폐기는 하나의 SQL 문장으로 처리된다.

읽기 전용으로 검수했다. 기존 컴파일 산출물의 `RefreshTokenServiceTest` **16건을 메모리에서 재실행해 통과**했고, 두 보안 경합은 실제 서비스와 대역 저장소로 재현했다. 기존 XML은 루트 **3,263건**, engine-zabbix **126건** 통과다. Mockito 기반 재실행은 임시 파일 생성 제한으로 완료하지 못했으며, 실제 DB·Redis·서버 검증은 수행하지 않았다.

### FE 3차 검수 결과

**판정: 수정 후 머지 — 🔴 1건, 🟡 1건.** 2차 지적 6건 중 해결 4건, 부분 해결 2건이다.

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| 계정 전환 후 이전 복수 저장 계속 실행 | 해결 | [CustomChartsDashboard.tsx:128](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:128)에서 작업 epoch를 고정하고, [useWidgets.ts:33](C:/worktrees/zm-157-fe/src/hooks/useWidgets.ts:33)에서 요청 전후 검사한다. 지연 응답 뒤 두 번째 POST 차단을 확인했다. |
| 권한 재검증 실패 후 기존 권한 허용 | 부분 | [useAuth.ts:104](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:104)의 401/403 차단과 [encryptTransform.ts:39](C:/worktrees/zm-157-fe/src/utils/encryptTransform.ts:39)의 persist 제외는 반영됐다. 다만 거부 후 재시도가 500이면 이전 권한이 다시 살아난다. |
| 배치 저장 거부 후 격자 미복원 | 부분 | [CustomChartsDashboard.tsx:112](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:112)의 재마운트로 일반 배치는 복원된다. 빈 행이 있는 서버 배치에서는 재마운트가 반복 저장을 유발한다. |
| 부분 성공 후 재시도 시 중복 생성 | 해결 | [AddChartModal.tsx:127](C:/worktrees/zm-157-fe/src/components/Dashboard/AddChartModal.tsx:127)에서 성공 항목을 기억하고 남은 항목만 제출한다. 첫 항목 성공·두 번째 실패 후 재시도가 총 POST 3회로 끝남을 확인했다. |
| 인증 레이아웃 재사용 시 로그인 차단 누락 | 해결 | [auth/index.tsx:42](C:/worktrees/zm-157-fe/src/layouts/auth/index.tsx:42)에서 pathname 변경마다 재판정한다. 재설정→로그인 이동 차단과 정상 제출 흐름을 확인했다. |
| transcript 입력 복원 테스트의 서버 계약 불일치 | 해결 | [AiToolCallbacks.java:140](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:140)에 `input` 저장이 추가됐다. [zm157AiConfirmAndLinks.test.tsx:179](C:/worktrees/zm-157-fe/src/__tests__/zm157AiConfirmAndLinks.test.tsx:179)의 JSON 복원·입력 표 검증과 서버 직렬화 계약이 일치한다. |

**새 결함·반영 후 잔여 결함**

- [ ] 🔴 **격자 복원 재마운트가 저장 거부 루프를 만듦** — [CustomChartsDashboard.tsx:112](C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:112) — **근거:** 실패마다 서버 원본 배치를 기준으로 signature를 되돌리고 격자를 재마운트한다. GridLayout이 빈 행을 압축하면 원본과 다른 배치로 `onLayoutChange`를 호출해 다시 저장한다. — **시나리오:** 서버 위젯이 `y=4`에 있고 위쪽이 비어 있는 상태에서 드래그 후 PATCH를 계속 거부했다. 실제 GridLayout에서 드래그 한 번으로 PATCH 5회가 발생했으며, 다섯 번째 응답을 보류해 추가 반복을 멈췄다. 거부가 계속되면 PATCH→GET→재마운트가 반복된다. — **수정 제안:** 복원·초기 배치 통지에서는 저장하지 않고 사용자 드래그·리사이즈 완료만 저장하도록 구분한다. 빈 행이 있는 배치의 거부 회귀 테스트를 추가한다. — **후속 가능 여부: 불가. 자동 쓰기 요청이 반복되는 기능 결함이므로 머지 전 반드시 수정.**

- [ ] 🟡 **403 이후 재시도가 500이면 폐기한 권한을 다시 허용함** — [useAuth.ts:104](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:104), [useAuth.ts:119](C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:119) — **근거:** 거부 여부를 마지막 오류만으로 판단하고 기존 Query 데이터는 남긴다. 다음 오류가 500으로 바뀌면 과거 데이터를 다시 검증된 값으로 사용한다. — **시나리오:** 정상 조회→403으로 화면 차단→재시도 500 순서에서 보호 화면과 Redux 권한이 복구됐다. 프로필·권한 조회 양쪽에서 재현했다. — **수정 제안:** 401/403 이후에는 새 성공 응답을 받을 때까지 해당 캐시를 불신하는 상태를 유지한다. — **후속 가능 여부: 가능. 이번 재현은 FE 화면·권한 표시의 재허용이며 BE 권한 우회는 확인되지 않았다.**

**확인했고 문제없음**

- 실제 axios 인터셉터에서 이전 epoch의 쓰기를 차단했다. 401 refresh 도중 세션이 바뀌어도 이전 PATCH를 재전송하거나 새 세션을 로그아웃시키지 않았다.
- 관련 Jest 3개 파일의 **68개 테스트가 모두 통과**했다. 위 결함은 별도 메모리 내 경계 재현으로 확인했다.
- 파일 수정 없이 검수했다. 실제 서버 연동·브라우저 E2E·전체 빌드는 실행하지 않았다.

### AI 3차 검수 결과

**판정: 머지 가능.** 2차 잔여 지적 3건 모두 해결됐다. 2차 반영으로 새로 들어간 코드에서 추가 결함은 발견하지 못했다.

**2차 지적 해결 표**

| 항목 | 판정 | 근거(파일:라인) |
|---|---|---|
| 데이터소스 사전 조회의 401이 인증 캐시를 폐기하지 않음 | 해결 | [McpServerConfig.java:156](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpServerConfig.java:156)에서 사전 조회·조기 반환까지 감시하고 401 관측 시 캐시를 폐기한다. [DataSourceStatusService.java:52](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/tool/DataSourceStatusService.java:52)가 삼킨 예외도 기록한다. 해당 경로의 회귀 테스트 통과. |
| 늦게 끝난 인증 조회가 폐기한 캐시를 다시 채움 | 해결 | [McpTokenValidator.java:74](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpTokenValidator.java:74)의 세대 비교와 [동일 파일:95](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/mcp/McpTokenValidator.java:95)의 폐기가 같은 키의 `compute`로 직렬화된다. latch 테스트에서 이전 조회의 재삽입 차단과 폐기 이후 새 조회의 정상 캐시 저장을 확인했다. |
| 확인 카드 실행 입력 미저장·누락을 고정하는 테스트 | 해결 | [AiToolCallbacks.java:140](C:/worktrees/zm-157-ai/src/main/java/com/dmove/moveseyeai/chat/engine/AiToolCallbacks.java:140)에 SSE와 같은 `input`을 저장한다. [ConfirmCardGateTest.java:83](C:/worktrees/zm-157-ai/src/test/java/com/dmove/moveseyeai/chat/engine/ConfirmCardGateTest.java:83)의 키·값·직렬화 검증과 [aiChatStore.ts:180](C:/worktrees/zm-157-fe/src/stores/aiChatStore.ts:180)의 복원 계약이 일치한다. |

**새 결함**

없음. 🔴 머지 전 필수 수정 및 🟡/🟢 후속 이슈로 넘길 신규 결함 없음.

**확인했고 문제없음**

- 사전 조회·툴 실행의 401 처리, 폐기 경합, transcript 입력·nullable 대상 이름 보존을 확인했다.
- 기존 컴파일 산출물로 관련 테스트 **11건을 메모리에서 재실행해 모두 통과**했다. 기존 전체 테스트 XML도 **165건 통과**다.
- 읽기 전용으로 검수했다. 새 빌드·실서버·실제 DB 마이그레이션은 실행하지 않았다. V7의 기존 **정지 교체 배포 전제**는 유지된다.

---

## 3차 검수 반영 (Claude, 2026-09-17)

### BE
- [x] 🔴 로그인 세대·활성 상태·커밋 분리: `UserRepository.lockById`(네이티브 `SELECT id … FOR UPDATE` — EAGER 조인에 FOR UPDATE 불가라 id만 잠금) → `UserService.loginLocked`가 한 트랜잭션에서 잠금(`SET LOCAL lock_timeout 5s`, 초과 시 `FAILED_TO_ACQUIRE_LOCK`)→ACTIVE→비밀번호→세대→발급. Zabbix 토큰 확보는 잠금 밖, 실패 시 세션 되돌림. 쓰기 경로 6곳(changePassword·markEmailVerified·updateUser·updateMyProfile·updateEmail·updateZabbixUserInfo)은 **조회 전에 잠금**(Hibernate UPDATE 지연 대비), 세대 INCR은 커밋 전 잠금 아래. 벌크(삭제·그룹 비활성화·동기화)는 문장 실행 뒤 폐기, 그룹 비활성화는 refresh 일괄 폐기로 승격.
- [x] 🔴 OTP 부활: `OtpRepository.transition` 조건부 UPDATE(`status=from AND expire_time>=now`, 0행이면 거부). 검증(ACTIVE→VERIFIED)·재설정(VERIFIED→DEACTIVE, **1회 소비**)을 사용자 행 잠금 아래에서, 무조건 VERIFIED 덮어쓰기 제거.
- 검증: `UserSerializationRaceTest` 8(실제 스레드·잠금 대역·커밋 가시성, 잠금 한 줄 제거 시 3건 실패 확인), dev DB 두 세션 FOR UPDATE 대기·lock_timeout 실측(ROLLBACK). 루트 `*Test` 3,275 통과(IT 0).
- 🟡 운영 Lua·SQL 자동 검증은 **후속 이슈**로.

### FE
- [x] 🔴 격자 저장 루프: 저장은 `onDragStop`/`onResizeStop`에서만, 서버 배치와 같으면 미전송. 빈 행 배치+거부 지속에서 드래그당 PATCH 1회(실제 GridLayout, 되돌리면 실패).
- [x] 🟡 403→500 권한 부활: 쿼리 캐시 이벤트로 401/403 거부 기록, 새 성공 응답 전까지 캐시 불신(프로필·권한 양쪽 테스트).
- 검증: 관련 jest 750 중 747(기존 3), tsc·contract(환경 1), eslint 57파일.

## 검수 결과 (4차 — 3차 반영분 한정)

(Codex 4차 — 2026-09-17, 3차 반영분 한정, `gpt-6-astra` xhigh, read-only)

### BE 4차 검수 결과

**판정: 수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 로그인 상태·비밀번호·세대 직렬화 | 해결 | [UserService.java:183](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:183): 잠금부터 검증·발급까지 하나의 쓰기 트랜잭션이다. |
| `lock_timeout`·커넥션·`readOnly` 혼용 | 해결 | [UserRepository.java:24](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/repository/UserRepository.java:24), [AuthService.java:70](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:70): 앞선 읽기 트랜잭션은 종료된다. 코드·설정상 `set_config(..., true)`와 네이티브 잠금 쿼리는 같은 쓰기 트랜잭션·커넥션을 사용한다. [Spring 규약](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html), [PostgreSQL 규약](https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET). |
| 쓰기 잠금 선행·벌크 폐기 순서 | 해결 | 단일 사용자 6개 경로는 조회 전 잠금. [UserService.java:660](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:660), [UserGroupService.java:246](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserGroupService.java:246), [ZabbixSyncServiceImpl.java:268](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/zabbixadmin/sync/ZabbixSyncServiceImpl.java:268): 벌크 실행·flush 후 커밋 전에 폐기한다. |
| OTP 부활·재사용 차단 | 부분 해결 | [OtpRepository.java:20](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/repository/OtpRepository.java:20): 조건부 UPDATE·자동 flush/clear는 적절하다. [UserService.java:220](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:220): 소비와 비밀번호 변경은 같은 트랜잭션이다. 이메일 인증 후속 처리는 아래 경합이 남는다. |
| 자동 회귀 검증 | 후속 유지 | [UserSerializationRaceTest.java:95](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/user/UserSerializationRaceTest.java:95): 잠금·커밋 대역을 사용한다. 기존 8건 통과 기록은 확인했으나 실제 Spring·DB 연결 검증은 아니다. |

- [ ] 🔴 **이메일 인증 후속 처리가 폐기된 OTP로 비밀번호를 덮어씀** — [AuthService.java:292](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:292), [UserService.java:256](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:256) — **근거:** `verifyOtpLocked()` 반환으로 잠금이 풀린 뒤, 별도 트랜잭션의 `markEmailVerified()`가 OTP·이메일을 재검증하지 않는다. — **시나리오:** 미인증 계정의 OTP 검증 완료 → 관리자가 이메일·비밀번호 변경 및 OTP 폐기 → 기존 검증 요청이 재개되어 비밀번호를 임의 값으로 덮어쓰고 새 주소까지 인증 처리한다. 변경한 비밀번호로 로그인할 수 없게 된다. — **수정 제안:** 이메일 인증의 OTP 소비·인증 상태·비밀번호 변경을 같은 사용자 잠금과 트랜잭션으로 묶고, 판정도 그 안에서 수행한다. 해당 순서의 경합 테스트를 추가한다. — **후속 가능 여부:** 불가, 머지 전 수정.

- [ ] 🟡 **실패한 로그인 정리가 나중에 성공한 로그인 세션까지 삭제함** — [AuthService.java:91](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:91) — **근거:** 새 실패 처리에서 호출하는 `logout()`은 사용자 세션을 무조건 삭제한다. — **시나리오:** 로그인 A가 잠금 밖 Zabbix 호출에서 지연 → B 로그인 성공 → A 호출 실패·정리 → B 세션도 삭제된다. — **수정 제안:** 실패한 발급 건의 계열을 폐기하고, 세션도 해당 발급 건에 속할 때만 원자적으로 삭제한다. — **후속 가능 여부:** 가능, 정상 로그인 직후 세션 종료가 발생하는 경합으로 추적 필요.

읽기 전용 정적 검수이며, 테스트 재실행과 실제 DB 검증은 수행하지 않았습니다.

### FE 4차 검수 결과

**판정: 수정 후 머지 — 🟡 저장 누락 1건 수정 권고.**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 격자 복원 후 저장 거부 루프 | 해결 | [CustomChartsDashboard.tsx:98](/C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:98) — 종료 이벤트에서만 저장. 실제 GridLayout에서 빈 행·반복 거부 시 드래그당 PATCH 1회 확인. |
| 403→500 이후 이전 권한 부활 | 해결 | [useAuth.ts:95](/C:/worktrees/zm-157-fe/src/hooks/useAuth.ts:95) — 거부 기록을 성공·캐시 제거·세션 전환 시 정리. 프로필·권한 모두 검증 통과. 반복 마운트의 구독 누적과 이전 세션 지연 응답의 기록 오염도 없었음. |

- [ ] 🟡 이전 저장 대기 중 원위치로 되돌리면 최종 배치 저장 누락 — [CustomChartsDashboard.tsx:100](/C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:100) — **근거:** 진행 중인 저장을 고려하지 않고 기존 `serverSignature`와 같으면 반환한다. — **시나리오:** `x=0→6` 저장 응답을 지연한 상태에서 `6→0`으로 되돌리면 PATCH는 총 1회뿐이며, 첫 저장 완료 후 화면도 `x=6`으로 돌아간다. 실제 GridLayout에서 재현했다. — **수정 제안:** 저장을 직렬화하고 대기 중 최신 배치를 보관하여, 선행 저장 완료 후 마지막 배치까지 반영한다. — **후속 가능 여부:** 별도 이슈로 이관 가능하나, 이번 저장 변경의 회귀이므로 함께 수정 권고.

범위 내 메모리 검증은 **6건 통과·1건 결함 재현**. 정상 리사이즈 저장도 통과했으며 파일은 변경하지 않았다.

---

## 4차 검수 반영 (Claude, 2026-09-17)

- [x] 🔴 BE 이메일 인증 후속 처리: `UserService.verifyEmailOtpLocked` — 사용자 행 잠금 → 이메일 존재 → (토큰 경로) 토큰 email과 현재 이메일 대조 → OTP 조건부 전환 → 인증 표시 → 미인증이면 비밀번호 발급+일괄 폐기를 한 트랜잭션으로. `AuthService.verifyOtp` VERIFY_EMAIL 분기는 이것만 호출(`markEmailVerified` 호출 제거). 추가로 `resetPassword`는 `RESET_PASSWORD` OTP만 허용(인증용 VERIFIED OTP로 재설정 진입 차단). 경합 테스트 4건 추가.
- [x] 🟡 BE 실패 로그인 정리: 세션 계열 키 `REFRESH_SESSION_FAMILY:<userId>`, `discardIssued`가 실패 건 계열만 폐기하고 세션은 Lua compare-and-delete. 로컬 Redis 격리 키 20항목 실측.
- [x] 🟡 FE 저장 직렬화: 저장 1건씩, 대기 중 최신 배치 보관 → 선행 저장 후 기준과 다르면 이어서 저장, 거부·세션 전환 시 폐기. 실제 GridLayout 3건.
- 검증: BE 루트 `*Test` 3,283 통과(IT 0), FE 관련 jest 753 중 750(기존 3), tsc·contract(환경 1), eslint.

## 검수 결과 (5차 — 4차 반영분 한정)

(Codex 5차 — 2026-09-17, 4차 반영분 한정, `gpt-6-astra` xhigh, read-only)

### BE 5차 검수 결과

판정: **수정 후 머지**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 이메일 인증 후속 처리가 변경된 이메일·비밀번호를 덮어씀 | 해결 | [UserService.java:235](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/user/UserService.java:235): 잠금·OTP 전환·인증·비밀번호 변경을 한 트랜잭션으로 처리. [AuthService.java:238](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:238): 재설정용 OTP만 허용. |
| 실패 로그인 정리가 나중에 성공한 로그인 세션까지 삭제 | 해결 | [AuthService.java:93](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/AuthService.java:93), [RefreshTokenService.java:128](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RefreshTokenService.java:128), [RedisRefreshTokenStore.java:91](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:91): 실패 계열만 폐기하고 계열 일치 시 세션 삭제. |

- [ ] 🟡 세션·계열 키의 분리 삭제로 실패 로그인 세션이 남음 — [RedisRefreshTokenStore.java:195](C:/worktrees/zm-157-be/src/main/java/com/dmove/moveseye/auth/RedisRefreshTokenStore.java:195) — **근거:** 두 키를 별도 `DEL`로 삭제한다. **시나리오:** 로그아웃의 세션 삭제 → 로그인 B가 세션·계열 생성 → 로그아웃의 계열 삭제 → B의 Zabbix 호출 실패 순서이면, `discardIssued`가 계열 표시를 찾지 못해 B의 세션을 남긴다. [테스트 대역:103](C:/worktrees/zm-157-be/src/test/java/com/dmove/moveseye/auth/InMemoryRefreshTokenStore.java:103)은 두 삭제가 `synchronized`로 묶여 이 경합을 놓친다. **수정 제안:** 두 키를 단일 Redis `DEL` 또는 Lua로 삭제하고 해당 순서의 회귀 검증 추가. **후속 가능 여부:** 가능하나, 이번 변경에서 추가된 실패 정리 누락이므로 함께 수정 권고.

읽기 전용 정적 검수이며, 테스트 재실행과 실제 Redis 검증은 수행하지 않았습니다.

### FE 5차 검수 결과

판정: **머지 가능**

| 항목 | 판정 | 근거 파일:라인 |
|---|---|---|
| 저장 대기 중 원위치 복귀 시 최종 배치 저장 누락 | 해결 | [CustomChartsDashboard.tsx:111](/C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:111), [동일 파일:151](/C:/worktrees/zm-157-fe/src/components/Dashboard/CustomChartsDashboard.tsx:151) — 저장 직렬화·최신 배치 보관·성공 후 후속 저장 확인. [zm157WidgetSave.test.tsx:442](/C:/worktrees/zm-157-fe/src/__tests__/zm157WidgetSave.test.tsx:442)에서 `x=6→0` 요청 순서와 최종 화면·서버 배치 검증 통과. |

4차 대응 테스트 **3건**과 추가 메모리 검증 **4건** 모두 통과했습니다. 거부·세션 전환 시 대기 배치 폐기, 중복 저장 억제, 최신 배치 보존, 연속 저장, 리사이즈를 확인했습니다.

지정 범위에서 새 결함은 발견하지 못했습니다. 파일 변경 없이 검수했습니다.

### 5차 반영 (Claude)
- [x] 🟡 BE 세션·계열 키 분리 삭제: `RedisRefreshTokenStore.deleteSession`을 `DELETE_SESSION_LUA`(`DEL KEYS[1] KEYS[2]` 한 번)로 교체. 로컬 Redis 격리 키 실측(둘 다 삭제 2 → 없는 키 0, 잔여 키 0). 인증·사용자 테스트 132건 재실행 통과.

## 최종 판정
- AI: 3차 **머지 가능** · FE: 5차 **머지 가능** · BE: 5차 🟡 1건 반영 완료(추가 🔴 없음).
- 후속 이슈로 넘긴 것: 운영 Lua·통계 SQL 자동 회귀 검증(격리 Redis·PostgreSQL), 잠금·트랜잭션 조합의 IT/런타임 검증.
