---
title: 역할 권한 BE 강제와 세션·토큰 회수 (ZM-157)
doc_type: feature
audience: [개발, QA, 운영, 기술 리더]
status: review
owner: MovesEye 팀
baseline: 2026-09-17
source_of_truth: moveseye-be-spring `auth/security/DmovePermissionChecker`·`DmovePermissionKey`·`auth/RefreshTokenService`·`auth/RedisRefreshTokenStore`·`host/HostVisibilityChecker`·`common/metric/CallerContexts`, moveseyee_fe `utils/permissions.ts`·`routes/pageAccess.ts`·`utils/session.ts`, moveseye-ai `mcp/McpServerConfig`·`tool/AiTool`, 계약서 `C:/solutions/_workspace/features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`
reviewed_at: 2026-09-17
review_cycle: event-driven
deployment_scope: source
be_commit: a2709d6 (브랜치 ZM-157, 기준 master 200c936)
fe_commit: 06e1c8f (브랜치 ZM-157, 기준 master 3b096c4)
ai_commit: 1e8d2c1 (브랜치 ZM-157, 기준 main 8f0994f)
latest_flyway: BE 반복 마이그레이션 R__clear_seed_admin_public_mailbox(버전 번호 없음) · AI V7__ai_insight_owner
qa_evidence: 단위 테스트(BE 루트 *Test 3,283건·engine-zabbix 126건, FE 관련 jest 750/753, AI 165건) + Codex 검수 5회. 런타임 미검증
---

# 역할 권한 BE 강제와 세션·토큰 회수

> 한 줄 요약 — **로그인한 사용자는 역할 편집 화면에서 허락받은 범위 안에서만 작업한다.** 판정은 BE가 모든 API에서 하고, FE는 같은 기준으로 메뉴·버튼을 보여 준다. 비밀번호 변경·비활성화·권한 회수는 다른 기기와 MCP 토큰에 즉시 반영된다. (Jira **ZM-157**)
>
> 🔴 **배포 상태** — 세 레포의 `ZM-157` 브랜치에 커밋만 됐다. 미푸시·미병합이며 BE·FE·AI 어느 것도 기동해 확인하지 않았다. 이 문서의 표에서 `현재`는 **이 브랜치 소스에 구현됨**을 뜻한다.

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 고객·사용자 안내는 [관리자 가이드 §3](../guides/solutions--%EA%B4%80%EB%A6%AC%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md), [사용자 가이드 §7](../guides/solutions--%EC%82%AC%EC%9A%A9%EC%9E%90-%EA%B0%80%EC%9D%B4%EB%93%9C.md), [문제 해결 §1](../guides/solutions--%EB%AC%B8%EC%A0%9C-%ED%95%B4%EA%B2%B0.md)에 있다. 채택 이유와 버린 대안은 [ADR-0002](../decisions/solutions--ADR-0002-%EC%97%AD%ED%95%A0-%EA%B6%8C%ED%95%9C-BE-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%EC%84%B8%EB%8C%80.md)가 정본이다.

## 1. 사용자 목표와 범위

- 해결하는 문제: 이전에는 FE가 메뉴만 숨기고, BE는 역할 권한 중 APM·AWS 두 칸만 확인했다. 주소 직접 호출이나 AI 어시스턴트·MCP 툴로는 역할에서 끈 기능이 그대로 실행됐다. 비밀번호 변경·비활성화 뒤에도 다른 기기의 refresh 토큰과 MCP 토큰이 유효했다.
- 주 사용자: 역할을 설계하는 관리자, 제한된 역할로 쓰는 운영자, 외부 MCP 클라이언트 사용자.
- 포함:
  - 모니터링(호스트 그룹·서버·네트워크)·이벤트 API의 역할 권한 강제
  - 호스트 공용 차트의 대상 호스트 가시성 검사
  - Zabbix 미연동 비관리자의 Zabbix 경유 호출 거부
  - 본인 프로필 수정 범위 축소와 현재 비밀번호 요구
  - refresh 토큰의 사용자 세대·로그인 계열 관리와 계정 경로 직렬화
  - MCP 토큰의 요청별 재확인, MCP 파괴 작업 기본 차단
  - FE 관리자 판정 통일, 계정 전환 시 이전 세션 정리
  - 시드 admin 계정의 초기 이메일 제거
- 제외:
  - 여러 화면이 함께 쓰는 API(공유 EP)의 권한 칸 적용 — §4.3
  - 사용자·역할 변경 감사 로그 — §12
  - 역할 편집 화면에서 무효 칸을 비활성 표시하는 UI — §12

## 2. 현재 상태

`부분` — 소스 구현과 단위 테스트·정적 검수는 끝났다. master 병합, 배포, 런타임 검증(역할별 403 실측, 로그인·refresh·로그아웃·MCP 흐름, FE 브라우저 동작)은 하지 않았다.

| 영역 | 상태 | 근거 |
|---|---|---|
| BE 권한 칸 강제 | 현재 | `DmovePermissionChecker`·컨트롤러 13개, `PermissionEnforcementControllerTest` |
| 대상 호스트 가시성(차트) | 현재 | `HostVisibilityChecker` |
| 세션 세대·계열 | 현재 | `RefreshTokenService`·`RedisRefreshTokenStore`, 로컬 Redis 격리 키 수동 실측 |
| 계정 경로 직렬화 | 현재 | `UserService.lockUser`·`loginLocked`, `UserSerializationRaceTest` |
| FE 표시 규칙 | 현재 | `utils/permissions.ts`·`routes/pageAccess.ts`·`utils/session.ts` |
| AI/MCP 규칙 | 현재 | `McpServerConfig`·`AiTool.effectiveTier`·`ConfirmCard` |
| 공유 EP 권한 칸 적용 | 계획 | 후속 과제 |
| 런타임 검증 | 계획 | 병합 후 수행 |

## 3. 권한 모델

### 3.1 두 축과 판정 위치

| 축 | 정본 | 무엇을 통제하나 | 판정 위치 |
|---|---|---|---|
| 기능 권한 | 역할의 `role.dmove_permission` JSON | 어떤 화면·API를 쓸 수 있나 | BE `DmovePermissionChecker` |
| 데이터 범위 | Zabbix 사용자 권한(사용자 그룹 ↔ 호스트 그룹, 태그 필터) | 어떤 호스트·문제를 볼 수 있나 | Zabbix가 사용자 토큰으로 거름. 자체 DB만 읽는 경로는 BE가 재현 |

기능 권한은 모듈 아래 기능 칸이 있고, 칸마다 `view`·`edit`·`delete`·`download` 플래그가 있다. 이번 강제는 `view`와 `edit`만 쓴다. `delete`·`download`는 FE와 BE 어디에서도 판정에 쓰지 않는다.

`view`와 `edit`은 서로를 함축하지 않는다. 쓰기 API는 `edit`만 보고, 조회 API는 `view`만 본다.

역할에 해당 모듈이나 칸이 없거나 사용자에게 역할이 없으면 거부한다(fail-closed).

### 3.2 관리자 판정

관리자는 MovesEye 계정의 `userRole`이 `ADMIN` 또는 `SUPER_ADMIN`인 사용자다. BE의 `AdminAccessChecker`·`DmovePermissionChecker`·`CallerContexts`·`JwtAuthFilter`와 FE의 `isAdminUserRole`이 같은 집합을 쓴다.

관리자는 역할 JSON을 읽지 않고 통과한다. Zabbix 조회도 시스템(슈퍼어드민) 토큰으로 한다.

Zabbix 쪽 역할(Zabbix Super admin 등)은 MovesEye 관리자 판정에 쓰지 않는다. 이전 FE는 "userRole ADMIN 또는 Zabbix Super admin" 기준(`useIsSuperRole`, 삭제됨)을 섞어 써서 메뉴 노출과 BE 판정이 어긋났다.

### 3.3 기본 역할 템플릿

`DmovePermissions.of(type)`이 새 역할의 기본값을 만든다. 관리자 유형은 대부분의 `edit`이 켜지고, 일반 사용자 유형은 모니터링·이벤트의 `view`만 켜진다. 따라서 **기본 역할의 일반 사용자는 모니터링 화면을 볼 수 있지만 `edit`이 필요한 작업(호스트 공용 차트 편집, 문제 확인 저장)은 할 수 없다.**

### 3.4 Zabbix 미연동 계정

미연동 계정은 MovesEye에만 있고 Zabbix 사용자와 연결되지 않은 계정이다(`zabbix_userid`가 비어 있음).

- 관리자라면 시스템 토큰으로 Zabbix를 조회한다.
- 비관리자라면 `CallerContext.unlinked()`로 분류되고, 실제 Zabbix 호출 시점에 `ErrorKind.FORBIDDEN` → **HTTP 200 + body `code: 403`**, `errorCode: FORBIDDEN`으로 거부된다.
- 레거시 경로(토큰을 직접 넘기는 경로)는 `ZabbixClient`가 인증이 필요한 메서드를 토큰 없이 부르면 Zabbix에 보내기 전에 같은 방식으로 끊는다. `user.login`·`apiinfo.version`은 예외다.
- 자산·비용·네트워크 맵처럼 Zabbix를 부르지 않는 MovesEye 자체 기능은 그대로 쓸 수 있다.

## 4. BE 강제 규칙

### 4.1 판정 메서드

| 메서드 | 쓰는 곳 |
|---|---|
| `requireView(user, key)` | 한 화면만 쓰는 조회 API |
| `requireEdit(user, key)` | 한 화면만 쓰는 쓰기 API |
| `requireAnyView(user, keys...)` | 여러 화면이 같은 조회 API를 쓸 때. 하나라도 `view`면 통과 |
| `requireAnyEdit(user, keys...)` | 여러 화면이 같은 쓰기 API를 쓸 때 |

키는 `DmovePermissionKey` 상수(모듈, 기능)다. 이름은 BE `DmovePermissions`, FE `DmovePermissionsKey`와 글자 그대로 같아야 한다. 한쪽 이름이 바뀌면 판정이 에러 없이 항상 거부된다.

판정기는 같은 HTTP 요청 안에서만 역할 권한을 캐시한다. 요청을 넘겨 캐시하지 않으므로 **역할 변경은 다음 요청부터 반영**된다. 사용자 조회는 역할 id 한 컬럼만 읽고(`findRefRoleById`), 관리자는 DB를 읽지 않는다.

### 4.2 호스트 상세의 "둘 중 하나" 규칙

호스트 상세는 서버 모니터링과 네트워크 모니터링이 같은 화면 골격을 쓰고, 전역 검색이 기기 유형으로 경로를 고른다. 그래서 호스트 단위 API는 `serverMonitoring` 또는 `networkMonitoring` 중 하나만 있어도 통과한다. FE 라우트는 기기 유형별로 더 엄격하게 막는다.

### 4.3 공유 EP 미적용

아래 API는 여러 화면이나 앱 부팅 경로가 함께 쓰므로 권한 칸을 적용하지 않았다. 막으면 사이드바·홈이 통째로 깨진다(2026-06-10 장애 전례). 이 API들의 데이터 범위는 Zabbix 사용자 토큰에 의존한다.

| API | 함께 쓰는 곳 |
|---|---|
| `GET /hosts/hostgroups` | 서버·네트워크·문제 목록 필터, 자산 동기화, 지리 맵·네트워크 맵 편집기 |
| `GET /hosts/server` | 네트워크 맵 편집기의 호스트 검색 |
| `GET /hosts/detail/{hostid}` | 홈 위젯, 네트워크 맵 노드, 문제 목록, 그룹 모달 |
| `GET /hosts/search` | 헤더 전역 검색 |
| `GET /event/problems`, `GET /hosts/hostgroup-problems` | 홈 위젯(비관리자) |
| `GET /event/bells`, `PUT /event/isRead`, `GET /event/stream` | 헤더 알림 벨·SSE |
| `GET /home/**` | 홈 |
| `GET /users/my-profile`, `GET /users/me/permissions`, `GET /users/role/permission`, `/auth/**` | 부팅·인증 |

### 4.4 대상 호스트 가시성

기능 권한은 "이 화면을 쓸 수 있는가"이고, 대상 가시성은 "이 호스트에 닿을 수 있는가"다. 둘 다 통과해야 한다.

`HostVisibilityChecker.requireVisible`은 자체 DB에 호스트 id로 저장된 데이터를 읽고 쓰기 전에, 사용자 토큰으로 그 호스트 한 건을 조회해 보이는지 확인한다.

- 관리자는 통과한다.
- 미연동 비관리자는 거부한다.
- "없는 호스트"와 "못 보는 호스트"를 구분하지 않고 같은 200+403으로 거부한다. 메시지는 "이 호스트에 접근할 권한이 없습니다."다.
- 현재 적용 대상은 호스트 공용 차트(위젯) API 5개 전부다.

### 4.5 이벤트 통계의 범위

`GET /event/stats`는 자체 DB의 이벤트 사본(전 호스트)을 집계한다. 비관리자는 목록·벨과 같은 가시성 판정(`EventService.visibleEventIds`)을 통과한 사건만 센다. 관리자는 전체를 센다. 미연동 비관리자는 200+403이다.

그 결과 비관리자에게 보이는 통계 숫자는 이전보다 작아질 수 있다. 의도된 변화다.

### 4.6 태그 권한 감지 실패 시 제한 간주

Zabbix 사용자 그룹에 태그 필터가 설정된 설치본은 사용자 토큰으로 사건을 다시 검증한다. 태그 필터 설정 여부를 감지하지 못하면 **"태그 제한 있음"으로 간주**해 재검증을 강제한다. 감지 성공만 5분 캐시한다.

재검증마저 실패하면 목록·벨은 해당 사건을 숨기고, 통계는 200+403으로 거부한다. 통계를 0건으로 돌려주면 "문제 없음"으로 오해되기 때문이다.

## 5. 권한 칸별 적용

상세 엔드포인트 매핑은 계약서 2장(`C:/solutions/_workspace/features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`)이 정본이다. 아래는 칸 단위 요약이다.

| 모듈.칸 | BE 강제 | 대표 대상 | 상태 |
|---|---|---|---|
| `monitoring.hostGroup` | `view` | 그룹 상세·자원/알림 추이·상위 호스트·디스크·리포트·라이브체크 | 현재 |
| `monitoring.serverMonitoring` · `networkMonitoring` | 조회 `anyView`, 차트 쓰기 `anyEdit`, 네트워크 목록 `view` | 호스트 상세 KPI·CPU·메모리·디스크·네트워크·인터페이스·세션·응답 시간·이벤트 탭·호스트 공용 차트 | 현재 |
| `eventAlert.byHost` | `view` | 이벤트 상세·이전 이벤트·이벤트 통계 | 현재 |
| `eventAlert.byTemplate` | `edit` | 문제 확인 저장(`PUT /event/{id}/acknowledge`) | 현재 |
| `cloudInfraMonitoring.awsResources` | `view` (ZM-157 이전부터) | 클라우드 인프라 화면, 비용 Cloud 탭 | 현재 |
| `applicationMonitoring.apm` | `view`·`edit` (ZM-157 이전부터, `ApmAccessChecker`) | APM 조회·관리 | 현재 |
| `cloudInfraMonitoring.hostGroupCI` · `serverMonitoringCI` · `networkMonitoringCI` | 사용처 없음 | — | 현재 |
| `customDashboard.*` | 사용처 없음 | — | 현재 |
| `report.generatingReport` · `reportHistory` | 사용처 없음 | 리포트 관리는 관리자 전용 | 현재 |
| `notification.*` | 사용처 없음 | 알림 관리(Zabbix 액션·미디어)는 관리자 전용 | 현재 |
| `mapView.integratedControlMap` · `mapList` | 사용처 없음 | 네트워크 맵·지리 맵은 인증 사용자 전원(좌표 편집만 관리자) | 현재 |
| `settings.zabbixInfo` · `cloudInfraInfo` | 사용처 없음(관리자 전용) | `/settings/*` 쓰기는 `requireAdmin` | 현재 |
| `settings.myPage` | 사용처 없음 | 본인 API라 막지 않음 | 현재 |
| `userManagement.*` | 관리자 전용 — 체크박스 무효 | BE는 `requireAdmin`만 본다 | 현재 |

"사용처 없음"은 역할 편집 화면에 칸이 있지만 BE·FE 어디에서도 그 칸으로 판정하지 않는다는 뜻이다. 체크를 바꿔도 동작이 바뀌지 않는다.

권한 칸과 별개로 **지리 맵 좌표 편집**(`PATCH /geo-clusters/host-coordinate`)은 관리자 전용이 됐다. 이 API는 시스템 토큰으로 Zabbix 호스트 인벤토리를 쓰기 때문이다. 자산 편집도 같은 쓰기 경로라 이미 관리자 전용이다.

## 6. 세션·토큰 회수

### 6.1 사용자 세대와 로그인 계열

refresh 토큰은 두 식별자를 갖는다.

| 식별자 | 의미 | 폐기 방법 |
|---|---|---|
| 사용자 세대(generation) | 사용자별 정수. 발급 시점의 값을 토큰에 기록 | 세대를 올리면 그 사용자의 모든 기기 토큰이 무효 |
| 로그인 계열(family) | 로그인 한 번에서 이어지는 토큰 사슬 | 계열 폐기 표식을 남기면 그 기기의 사슬만 무효 |

발급(로그인·본인 재발급)은 기대한 세대가 현재 세대와 같을 때만 토큰과 로그인 세션을 쓴다. 회전(`POST /auth/refresh`)은 세대·계열을 이어받고, 세대 불일치나 계열 폐기 표식이 있으면 거부한다. 발급·회전·세션 복원·세션 삭제는 각각 Redis Lua 스크립트 하나로 원자 처리한다.

회전으로 소비된 토큰은 10분 동안 소비 흔적을 남긴다. 회전과 로그아웃이 겹쳐 옛 쿠키로 로그아웃 요청이 와도 계열을 찾아 폐기하기 위해서다.

**계열이 없는 기존 토큰(배포 전 발급)은 회전을 거부한다.** 로그아웃 경합을 막을 수단이 없기 때문이다. 배포 직후 각 사용자는 access 토큰 만료(기본 30분) 뒤 한 번 다시 로그인한다.

### 6.2 폐기 트리거

| 사건 | 폐기 범위 |
|---|---|
| 비밀번호 변경(본인·관리자), 비밀번호 재설정 | 세대 증가 → 전 기기 |
| 이메일 인증으로 비밀번호 발급 | 세대 증가 → 전 기기 |
| 사용자 비활성화(개별·그룹·동기화), 사용자 삭제 | 세대 증가 → 전 기기 |
| 로그아웃 | 그 계열만 |
| 로그인 후 Zabbix 토큰 확보 실패 | 방금 발급한 계열만. 로그인 세션은 그 계열이 세운 것일 때만 삭제(compare-and-delete) |

세대 증가는 로그인 세션 키(`USER_LOGIN_KEY_<userId>`)도 지운다. 세션 검사(`VisitorSessionChecker`)가 이 키를 보므로 다른 기기는 다음 요청에서 401을 받고, refresh도 세대 불일치로 401이 되어 로그인 화면으로 간다.

### 6.3 본인 비밀번호 변경의 재발급

`PUT /users/my-profile`로 비밀번호를 바꾸면 전 기기를 폐기한 뒤, 그 변경이 올린 세대로 **현재 기기만** 재발급한다. 응답에 `Set-Cookie: refreshToken`(Path=/auth)이 실린다. 재발급 전에 다른 폐기가 끼어들면 쿠키 없이 성공 응답을 주고, 다음 요청이 401이 되어 재로그인한다.

마이 페이지 화면은 현재 이 API가 아니라 `PATCH /users/zabbix-info/{id}`(관리자 전용)로 저장한다. 이 경로의 비밀번호 변경은 재발급 없이 전 기기를 폐기하므로, **관리자가 마이 페이지에서 자기 비밀번호를 바꾸면 현재 기기도 다시 로그인하게 된다**(코드 기준 추론, 런타임 미검증). 마이 페이지를 `PUT /users/my-profile`로 옮기는 작업은 §12 후속이다.

### 6.4 MCP 토큰의 요청별 재확인

MCP 토큰(최대 24시간)은 세션 검사를 면제받으므로, `McpAccessInterceptor`가 요청마다 DB에서 계정을 다시 읽는다.

| 현재 상태 | 결과 |
|---|---|
| 사용자 없음, 비활성 | HTTP 401 |
| `userRole`이 발급 때와 다름 | HTTP 401(재발급 필요) |
| `mcp_permission`이 NONE으로 회수됨 | 200+403 |
| write 토큰인데 현재 READ | 쓰기만 200+403, 읽기는 통과 |

토큰 재발급(`POST /internal/mcp/tokens`)은 비활성 사용자에게 `MCP_USER_INACTIVE`를 돌려준다. AI 서버는 툴 실행 중 BE 401을 받으면 그 토큰의 인증 캐시를 즉시 폐기하고, 다음 요청에서 재인증으로 보낸다.

## 7. 계정 경로 직렬화

같은 사용자에 대한 자격 증명 경로를 **사용자 행 잠금(`SELECT id … FOR UPDATE`)** 으로 한 줄로 세운다.

- 대상: 로그인, 비밀번호 변경·재설정, 이메일 인증, 관리자·본인 사용자 수정, 이메일 변경, Zabbix 정보 갱신.
- 쓰기 경로는 트랜잭션 맨 앞에서 잠그고, 세대 증가는 커밋 전 잠금 아래에서 한다. 롤백되면 세션만 끊긴다(안전한 방향).
- 벌크 경로(사용자 삭제, 그룹 비활성화, 동기화)는 문장 실행으로 행이 잠긴 뒤 세대를 올린다.
- 잠금 순서는 사용자 행이 먼저다.

로그인은 잠금 아래 한 트랜잭션에서 활성 상태 확인 → 비밀번호 검증 → 세대 읽기 → refresh·세션 발급을 한다. 잠금 대기는 `SET LOCAL lock_timeout`으로 **5초**(`LOGIN_LOCK_TIMEOUT_MS`)까지만 기다리고, 넘으면 HTTP 200 + `errorCode: FAILED_TO_ACQUIRE_LOCK`을 준다. Zabbix API 토큰 확보는 원격 호출이라 잠금 밖에서 한다.

OTP 상태 전환도 같은 잠금 아래 **조건부 UPDATE**로 한다.

- 검증은 ACTIVE→VERIFIED, 재설정은 VERIFIED→DEACTIVE로 전환한다. 0행이면 `OTP_NOT_EXIST_OR_EXPIRE`다.
- 재설정 토큰은 한 번만 쓸 수 있고, `RESET_PASSWORD` 용도의 OTP로만 재설정할 수 있다.
- 이메일이 없는 계정의 OTP 검증·재설정은 `USER_NOT_HAS_EMAIL`로 거부한다.
- 이메일이 바뀌면 그 사용자의 미사용 OTP를 무효화한다.
- 이메일 인증은 OTP 전환부터 비밀번호 발급·세션 폐기까지 한 트랜잭션이다.

### 7.1 본인 프로필 수정 범위

`PUT /users/my-profile`은 본인 전용 `UpdateMyProfileDto`를 쓴다. 역할·사용자 그룹·username·계정 상태는 바꿀 수 없다. 비밀번호·이메일 변경은 현재 비밀번호가 필요하다. 이전에는 관리자용 요청 형식을 공유해 본인 역할을 바꿀 수 있었고, 본인 수정이 계정 상태를 활성으로 되돌렸다.

`PATCH /users/update-email`은 로그인 사용자 id로 대상을 찾고, 비밀번호가 있는 계정이면 `currentPassword`가 필요하다(틀리면 `CURRENT_PASSWORD_INCORRECT`). 이전에는 대상 조회 기준이 잘못되어 다른 계정을 고를 수 있었다. FE 호출처는 없다.

### 7.2 시드 admin 이메일

초기 데이터(V10)는 `admin` 계정에 누구나 열람할 수 있는 메일함 주소를 인증 완료 상태로 넣었다. 비밀번호 찾기 코드가 그 메일함으로 가는 설계 결함이었다.

반복 마이그레이션 `R__clear_seed_admin_public_mailbox.sql`이 **시드 값 그대로인 `admin` 행만** 이메일을 NULL·미인증으로 바꾸고, 같은 문장에서 그 행의 미사용 OTP를 무효화한다. 이미 실제 주소로 바꾼 설치본은 건드리지 않는다. 여러 번 실행해도 결과가 같다.

적용 후 그 admin은 이메일을 등록하기 전까지 비밀번호 찾기를 쓸 수 없다(`USER_NOT_HAS_EMAIL`). 로그인·refresh는 이메일을 보지 않는다.

## 8. FE 표시 규칙

- **관리자 판정 하나** — `isAdminUserRole(userRole)`(ADMIN·SUPER_ADMIN). 사이드바·모바일 사이드바·⚙ 설정 메뉴·전역 검색·라우트 가드 5개 진입점이 같은 기준이다.
- **칸 판정** — `utils/permissions.ts`의 `canAccessFeature`·`canEditFeature`만 쓴다. 판정은 `=== true`이며, 키가 없으면 숨김이다.
- **라우트 가드** — `decidePageAccess`가 `allow`·`wait`·`error`·`deny`를 돌려준다. 조회 중이면 스피너, 조회 실패면 "권한 정보를 불러오지 못했습니다" 안내와 [다시 시도], 권한 없음이면 404다.
- **역할·권한 비저장** — 역할과 권한은 브라우저 저장소(redux-persist)에 남기지 않고, 이번 세션의 서버 응답만 쓴다. 401/403 거부 뒤에는 새 성공 응답 전까지 캐시를 믿지 않는다. 그래서 새로고침 직후에는 서버 응답을 받은 뒤 메뉴가 나타난다.
- **세션 전환** — `switchClientSession`이 로그인 성공과 계정 id 변경 감지에서 공통으로 실행된다. 세션 epoch를 올리고, 진행 중인 조회를 취소하고, 조회 캐시·AI 대화·진행 중 스트림을 비운다. 늦게 도착한 이전 세션의 응답과 쓰기 요청은 epoch로 버린다.
- **로그인 화면** — 로그인 상태에서 `/sign-in`(변형 경로 포함) 진입은 막는다. 로그인 후 이동은 내부 경로만 허용한다.
- **조회 403 안내** — GET 응답이 권한 거부(라이선스 차단 제외)면 경로당 1회 "이 작업을 수행할 권한이 없습니다."를 띄운다. 로그아웃·이동은 하지 않는다.
- **진입점 조건** — 이벤트 메뉴·검색은 `byHost.view`, APM 수집기·알람 규칙 라우트는 `apm.edit` 축이다. 알림 벨 항목은 `byHost.view`가 없으면 문제 상세로 이동하지 않는다.
- **호스트 공용 차트** — 추가·편집·삭제·배치 변경은 `serverMonitoring.edit` 또는 `networkMonitoring.edit`일 때만 보인다. 저장은 드래그·리사이즈가 끝났을 때만, 한 번에 한 건씩 한다. 200+403은 실패로 처리하고 입력을 보존한다. 여러 차트 추가가 부분 성공하면 다시 시도할 때 남은 항목만 보낸다.
- **지리 맵 좌표 편집** — 관리자만 활성화된다. 비관리자에게는 "호스트 좌표는 관리자만 바꿀 수 있습니다" 안내가 나온다.
- **자산·비용 편집 버튼** — 관리자 판정(`useIsUserRoleAdmin`)으로 통일했다.

## 9. AI·MCP 규칙

| 규칙 | 내용 | 설정 |
|---|---|---|
| 파괴 작업 기본 차단 | `DESTRUCTIVE` 등급 툴은 MCP 목록에 나타나지 않고 호출도 거부된다 | `ai.mcp.allow-destructive`(`AI_MCP_ALLOW_DESTRUCTIVE`, 기본 `false`) |
| 허용 시 제한 | 켜도 write scope가 필요하고, 호출 한 번의 대상 수가 상한 이하여야 한다 | `ai.mcp.max-destructive-targets`(`AI_MCP_MAX_DESTRUCTIVE_TARGETS`, 기본 1) |
| 입력 기반 위험도 | `AiTool.effectiveTier(input)`이 입력을 보고 등급을 올린다. `zabbix_unlink_templates`의 `clear=true`(아이템·트리거·이력 삭제)는 삭제 등급이다. 해석할 수 없는 값도 삭제 등급으로 본다 | — |
| 확인 카드 | 채팅의 쓰기·삭제는 확인 카드 승인 후 실행된다. 요약과 대상 표(ID·이름)를 분리해 보여 주고, 대상 이름에서 제어·방향·폭 없는 문자를 제거한다. 등급·대상·입력은 대화 기록에도 저장되어 다시 열어도 같게 보인다 | — |
| 카드 상한 | 한 요청(턴)에 확인 카드는 5장까지다 | FE가 같은 상수를 복제 |
| 알림 요약 캐시 | 사용자별로 분리했다(`owner_key`). 기존 공유 캐시는 V7이 지운다 | — |
| dev 우회 | 모델 없이 툴을 실행하는 dev 엔드포인트는 기본 off | `AI_DEV_TOOLS_ENDPOINT`(기본 `false`) |

`DESTRUCTIVE` 등급 툴은 `zabbix_delete_host`, `zabbix_delete_items`, `zabbix_delete_triggers`, `exclude_asset` 4종이며, `clear=true`인 `zabbix_unlink_templates`가 입력에 따라 더해진다.

MCP의 일반 쓰기 툴(WRITE)은 서버 측 확인 게이트가 없고 MCP 클라이언트의 확인에 의존한다. 서버 게이트는 §12 후속이다.

## 10. 새 403/401 응답

거부는 기존 계약대로 **HTTP 200 + body `code: 403`**(`ForbiddenError`, 기본 message `"Access Denied"`)이다. 실제 HTTP 401은 인증 실패뿐이다. 정상 화면 흐름에서 새로 막히는 것은 ★ 항목이 거의 전부이고, 나머지는 주소 직접 호출·AI 툴·MCP에서 나타난다.

| API | 누가 | 응답 |
|---|---|---|
| ★ `POST`·`PATCH`·`DELETE /host/{id}/widgets…` | 서버·네트워크 `edit`이 모두 없는 비관리자(기본 역할의 일반 사용자) | 200+403 |
| ★ `/host/{id}/widgets…` 전체 | 그 호스트를 Zabbix에서 못 보는 비관리자, 미연동 비관리자 | 200+403 |
| ★ `PATCH /geo-clusters/host-coordinate` | 비관리자 전원 | 200+403 |
| `PUT /event/{id}/acknowledge` | `byTemplate.edit` 없는 비관리자 | 200+403 |
| 모니터링·이벤트 조회 API(§5) | 해당 칸 `view` 없는 비관리자 | 200+403 |
| `GET /event/stats` | 미연동 비관리자, 태그 재검증 실패 | 200+403 |
| 미연동 비관리자의 Zabbix 경유 API | 미연동 비관리자 | **401 → 200+403(`FORBIDDEN`)으로 바뀜** |
| 미연동 `SUPER_ADMIN`의 모니터링 조회 | — | **200+403 → 시스템 조회(허용)로 바뀜** |
| `PATCH /users/update-email` | 현재 비밀번호 없이 부르는 비밀번호 보유 계정 | 200 + `CURRENT_PASSWORD_INCORRECT` |
| `POST /auth/refresh` | 계열 없는 기존 토큰, 로그아웃과 겹친 회전, 폐기된 세대 | HTTP 401 |
| `POST /auth/login` | 같은 사용자의 자격 증명 변경이 5초 넘게 잠금 보유 | 200 + `FAILED_TO_ACQUIRE_LOCK` |
| `POST /auth/login` | 검증 중 비밀번호 재설정·비활성화가 겹침 | 200 + `WRONG_USER_OR_PASSWORD` |
| `/auth/verify-otp`, `/auth/reset-password` | 이메일 없는 계정 | 200 + `USER_NOT_HAS_EMAIL` |
| `/auth/verify-otp`, `/auth/reset-password` | 소비됐거나 무효화된 OTP | 200 + `OTP_NOT_EXIST_OR_EXPIRE` |
| MCP 토큰의 모든 요청 | 비활성·삭제·역할 변경 | HTTP 401 |
| MCP 토큰의 모든 요청 | `mcp_permission` 회수, 쓰기 강등 | 200+403 |
| 다른 기기의 모든 요청 | 비밀번호 변경·재설정·비활성화·삭제된 사용자 | HTTP 401 → 로그인 화면 |

🔴 FE 로그인 화면은 `FAILED_TO_ACQUIRE_LOCK`을 별도로 처리하지 않는다. `SignIn.tsx`는 실패 코드 3종(`USER_NOT_FOUND`·`WRONG_USER_OR_PASSWORD`·`USER_DISABLED`)만 오류로 보고 나머지는 성공 흐름으로 넘긴다. 코드상으로는 "로그인 성공" 안내 뒤 첫 요청이 401이 되어 로그인 화면으로 돌아올 것으로 보인다(런타임 미검증). §12 후속에 올렸다.

## 11. 운영 주의

- **배포 공지** — 배포 직후 전원 1회 재로그인(최대 30분 안), 기본 역할 일반 사용자의 차트 편집 불가, 지리 맵 좌표 편집 관리자 전용.
- **Redis 키** — `REFRESH_TOKEN:<token>`(값에 `generation`·`family` 추가), `REFRESH_GEN:<userId>`(**만료 없음**), `REFRESH_FAMILY_REVOKED:<family>`(TTL = refresh 수명), `REFRESH_CONSUMED:<token>`(TTL 600초), `REFRESH_SESSION_FAMILY:<userId>`, `USER_LOGIN_KEY_<userId>`(기존). 접두어 정본은 `common/constants/AppConfig`다.
- **`REFRESH_GEN:*`을 지우지 않는다.** 세대가 0으로 돌아가면 현재 세대 토큰이 전부 불일치가 되어 전원이 로그아웃된다.
- **Redis 구성** — Lua 스크립트가 서로 다른 접두어의 키 여러 개를 한 번에 다룬다. 단일 Redis(비클러스터)를 전제로 작성됐고, Redis Cluster에서는 확인하지 않았다.
- **Flyway** — BE는 버전 번호 없는 반복 마이그레이션(R__)이라 다른 브랜치의 V60(ZM-151)과 병합 순서에 영향을 받지 않는다. 파일 내용을 바꾸면 checksum이 달라져 다음 기동에 다시 실행된다(멱등이라 무해).
- **AI V7** — 구버전 AI 서버를 모두 내린 뒤 교체 배포한다. 롤링·병행 배포와 코드만 되돌리는 롤백은 요약 저장을 깨뜨린다. 롤백 SQL은 moveseye-ai `README.md`의 "DB 마이그레이션 배포 주의 — V7" 절에 있다(현재 `ZM-157` 브랜치에만 있음).
- **dev 환경** — dev DB의 admin이 시드 주소 그대로면 다음 BE 기동 때 이메일이 비워진다.
- **병합** — ZM-159(Zabbix 호출 공통 유틸화)가 `ZabbixClient`·`HostService`·`EventService`를 크게 바꿀 예정이라 충돌이 예상된다. BE 기준 커밋 이후 master가 진행되어 리베이스가 필요하다.

운영 절차는 [로컬·검증 Runbook §11](../operations/solutions--%EC%9A%B4%EC%98%81%EC%9E%90-%EB%9F%B0%EB%B6%81.md)에 있다.

## 12. 검증 근거와 미검증

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위(BE) | 루트 `*Test` 전체, `:engine-zabbix:test`, 이후 수정분 인증·사용자 재실행 | 3,283건·126건·132건 통과 |
| 단위(FE) | 관련 jest | 753건 중 750건 통과. 실패 3건은 기존 결함(`apmRoutes` 2, `AiAssistantPage` 1) |
| 단위(AI) | 전체 | 165건 통과 |
| 정적(FE) | `tsc`·`typecheck:contract`·eslint | 환경 1건(`@dagrejs/dagre` 미설치) 외 통과 |
| 수동 실측 | Redis Lua 스크립트(로컬 Redis 격리 키), 통계 SQL·R__·`FOR UPDATE` 대기(dev DB 읽기 전용·ROLLBACK) | 통과 |
| 음성 대조 | 세션 전환·차트 저장·잠금 직렬화 등을 되돌리면 테스트 실패 | 확인 |
| 정적 검수 | Codex 5회. 누계 🔴 BE 12·FE 5·AI 1건 반영 | AI·FE 머지 가능, BE 마지막 🟡 1건 반영 |
| runtime | — | **미검증** |

미검증 항목:

- BE·AI 기동, 역할별 403 실측, 로그인·refresh·로그아웃·MCP 흐름, FE 브라우저 동작, `vite build`
- BE 통합 테스트(`FlywayMigrationSmokeIT`의 R__ 단언 포함), 실제 JPA 트랜잭션에서의 `FOR UPDATE`·`set_config` 합류
- AI V7의 실제 DB 적용

증거 원천:

- 계약서: `C:/solutions/_workspace/features/auth-license/zm-157-permission/contract_zm-157-permission-enforcement.md`
- 최종 보고: `C:/solutions/_workspace/features/auth-license/zm-157-permission/zm-157_permission-fix.md`
- 검수 기록(1~5차): `C:/solutions/_workspace/features/auth-license/zm-157-permission/review_zm-157-permission.md`

## 13. 결정과 열린 항목

- 결정: [ADR-0002](../decisions/solutions--ADR-0002-%EC%97%AD%ED%95%A0-%EA%B6%8C%ED%95%9C-BE-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%EC%84%B8%EB%8C%80.md)
- 관련 문서: [API 카탈로그 §1-5·§3-1](../technical/solutions--API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md), [아키텍처 §7](../technical/solutions--%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md), [릴리스 노트 — 미배포](../releases/solutions--%EB%A6%B4%EB%A6%AC%EC%8A%A4-%EB%85%B8%ED%8A%B8.md), [FAQ §3·§9](../guides/solutions--%EC%9E%90%EC%A3%BC-%EB%AC%BB%EB%8A%94-%EC%A7%88%EB%AC%B8.md), [용어집](../reference/solutions--%EC%9A%A9%EC%96%B4%EC%A7%91.md)
- Obsidian 관련 노트: 없음(작성 시점 기준)
- 열린 항목(후속 이슈 후보):

| 항목 | 상태 |
|---|---|
| 운영 Redis Lua·통계 SQL 자동 회귀 테스트(격리 Redis·PostgreSQL) | 계획 |
| 마이 페이지 저장을 `PUT /users/my-profile`(현재 비밀번호 필수)로 이전 — 일반 사용자는 현재 저장 불가 | 계획 |
| 로그인 화면의 `FAILED_TO_ACQUIRE_LOCK` 처리(§10) | 계획 |
| 사용자·역할 변경 감사 로그 | 계획 |
| 계정 상태 전용 API(관리자 수정이 그룹 비활성 상태를 무시하고 활성으로 되돌림) | 계획 |
| 로그인 실패 제한의 IP 기준, OTP·access 토큰 종류(`typ`) 구분 | 계획 |
| `/hosts/{groupid}/reports` 그룹 단위 가시성 필터, 공유 EP의 권한 칸 적용 방식 | 계획 |
| 역할 편집 화면에서 "사용처 없음·관리자 전용" 칸 비활성 표시 | 계획 |
| MCP 일반 쓰기 툴의 서버 측 확인 게이트 | 계획 |
| `closeProblem`·`delete_host_chart`의 삭제 등급 승격 여부 | 보류 |
| 미사용 `UserService.markEmailVerified` 정리 | 보류 |

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-17 | 최초 작성. ZM-157 브랜치 커밋(BE `a2709d6`·FE `06e1c8f`·AI `1e8d2c1`) 기준으로 권한 모델·BE 강제·세션 세대·직렬화·FE 표시·AI/MCP·새 403/401·운영 주의 정리 |
