# ZM-157 계약 — 역할 권한(역할 편집 화면) BE 강제 매핑표

> 문서 지도: [`features/auth-license/zm-157-permission/INDEX_zm-157-permission.md`](INDEX_zm-157-permission.md)

- 작성: 2026-09-17 · BE 워크트리 `C:\worktrees\zm-157-be`(브랜치 ZM-157, 미커밋)
- 갱신: 2026-09-17 코덱스 4차 확인 반영(이메일 인증 단일 잠금 트랜잭션·실패한 로그인 정리의 compare-and-delete)
- 갱신: 2026-09-17 코덱스 3차 검수 반영(사용자 행 잠금 직렬화 — 로그인·자격 증명 변경·OTP)
- 갱신: 2026-09-17 코덱스 2차 검수 반영(refresh 계열·로그인 세대 선독·태그 감지 fail-closed·OTP 무효화·미연동 로그아웃)
- 갱신: 2026-09-17 코덱스 1차 검수 반영(위젯 대상 호스트 검사·통계 범위·update-email 비밀번호·refresh 세대·SUPER_ADMIN·미연동 403·R__ 마이그레이션)
- 원칙(사용자): 로그인한 사용자는 **역할 편집 화면에서 지정한 권한 안에서만** 작업한다.
- 이전 상태: `DmovePermissionChecker`는 APM·`awsResources`(클라우드 인프라·비용)에서만 쓰였고, 나머지 칸은 FE 메뉴만 숨겼다. 주소 직접 호출·AI/MCP 툴로는 그대로 열렸다.

## 1. 판정 규칙

| 항목 | 규칙 |
|---|---|
| 판정기 | `auth/security/DmovePermissionChecker` — `role.dmove_permission` JSON이 정본 |
| 키 | `auth/security/DmovePermissionKey` 상수(모듈, 기능). 이름은 `DmovePermissions`·FE `DmovePermissionsKey`와 동일해야 한다 |
| 조회(GET) | `requireView` · 여러 화면이 같은 EP를 쓰면 `requireAnyView`(하나라도 view면 허용) |
| 쓰기(POST/PUT/PATCH/DELETE) | `requireEdit` · 공유면 `requireAnyEdit` |
| 관리자 우회 | `userRole` ADMIN·SUPER_ADMIN은 DB를 보지 않고 통과(기존 `isAdministrator`). **소스 접근(SYSTEM/슈퍼어드민 토큰)도 같은 축으로 통일** — `CallerContexts`·`JwtAuthFilter`가 SUPER_ADMIN을 포함(검수 🟡7) |
| 대상(객체) 검사 | 우리 DB에 호스트 id로 저장된 것을 읽고 쓰는 EP는 기능 칸 **다음에** `HostVisibilityChecker`로 그 호스트가 사용자 토큰으로 보이는지 확인(관리자 통과, 미연동 비관리자 거부). 현재 적용: 호스트 위젯 전 EP |
| 미연동 비관리자 | Zabbix를 부르는 모든 경로가 **HTTP 200 + code 403 + errorCode `FORBIDDEN`**. 포트 경로는 `ZabbixSessionProvider`, 레거시(authToken 직접 전달) 경로는 `ZabbixClient`가 토큰 없는 인증 필요 호출을 Zabbix 전에 끊는다(이전엔 실제 401 → FE refresh·로그아웃, 검수 🟡8) |
| 거부 응답 | `ForbiddenError` → **HTTP 200 + body `code: 403`, message `"Access Denied"`**(기존 계약 그대로) |
| 역할 없음 | 사용자에게 역할(`zabbix_role`)이 없거나 모듈·칸이 없으면 **거부**(fail closed) |
| edit ↔ view | 서로 함축하지 않는다(기존 규칙 유지). 쓰기 EP는 edit만 본다 |
| delete·download 축 | **이번에 쓰지 않음** — FE가 두 축을 판정에 쓰는 곳이 없다 |
| 성능 | 같은 HTTP 요청 안에서는 역할 권한을 1회만 읽는다(request 속성 캐시). **요청을 넘겨 캐시하지 않으므로 역할 변경은 다음 요청부터 즉시 반영**. 사용자 조회는 `findRefRoleById`(역할 id 컬럼만)로 가볍게 바꿨다. 관리자는 DB 조회 0회 |

## 2. 매핑표

형식: 모듈.기능 | FE 화면/라우트 | BE 엔드포인트 | 적용 | 비고

### 2.1 monitoring.hostGroup

| 모듈.기능 | FE 화면/라우트 | BE 엔드포인트 | 적용 | 비고 |
|---|---|---|---|---|
| monitoring.hostGroup | `/monitoring/host-group/:id`(HostGroupDetail) | `GET /hosts/{groupid}` | view | |
| monitoring.hostGroup | HostGroupDetail | `GET /hosts/device-type/{groupid}` | view | |
| monitoring.hostGroup | HostGroupDetail(자원 추이) | `GET /hosts/{groupid}/resource-trend` | view | 캐시 키에 principal 추가(S2) |
| monitoring.hostGroup | HostGroupDetail(알림 추이) | `GET /hosts/{groupid}/alert-trend` | view | 캐시 키에 principal 추가(S2) |
| monitoring.hostGroup | HostGroupDetail(상위 호스트·디스크) | `GET /hosts/{groupid}/top-hosts` | view | |
| monitoring.hostGroup | HostGroupReport·ResourceTrend | `GET /hosts/{groupid}/disk/current` | view | |
| monitoring.hostGroup | HostGroupReport | `GET /hosts/{groupid}/reports` | view | |
| monitoring.hostGroup | (FE 호출처 없음) | `GET /hosts/{groupid}/reports/detail` | view | 같은 리포트 계열이라 함께 잠금 |
| monitoring.hostGroup | HostGroupTopHosts 라이브체크 · Zabbix 호스트 관리(관리자) | `GET /hosts/{hostid}/livecheck` | view | Zabbix 관리 화면은 관리자라 우회로 통과 |
| monitoring.hostGroup **또는** eventAlert.byHost | (사실상 호출처 없음 — TEMPLATE_INFO 미사용) | `GET /hosts/hostgroup/problems/{groupid}` | anyView | |
| monitoring.hostGroup | HostGroupCardView·TableView | `GET /hosts/hostgroups` | **미적용(공유)** | 서버·네트워크 목록 필터, 문제 목록 필터, 자산 동기화 모달, 지리 맵·네트워크 맵 편집기(권한 칸 없음)가 함께 쓴다 |
| monitoring.hostGroup | HostGroupTableView KPI | `GET /home/summary` | **미적용(공유)** | 홈 화면 EP |

### 2.2 monitoring.serverMonitoring / networkMonitoring

호스트 상세(`DetailLayout`)는 서버·네트워크 모니터링이 같은 골격을 쓰고 전역 검색이 기기 유형으로 경로를 고르므로, **호스트 단위 EP는 "둘 중 하나"** 규칙으로 통일했다(이하 `server|network`).

| 모듈.기능 | FE 화면/라우트 | BE 엔드포인트 | 적용 | 비고 |
|---|---|---|---|---|
| networkMonitoring | `/monitoring/network-monitoring` 목록 · 상세 헤더 셀렉트 | `GET /hosts/hosts-network` | view | |
| server\|network | 호스트 상세 KPI | `GET /hosts/{hostid}/summary` | anyView | |
| server\|network | 수집 정보 모달(목록)·상세 대시보드 | `GET /hosts/{hostid}/collected-info` | anyView | |
| server\|network | 네트워크 상세 인터페이스 Top5 | `GET /hosts/interfaces/{hostid}` · `GET /hosts/interfaces/{hostid}/graph/{interfaceid}` | anyView | |
| server\|network | 상세 CPU | `GET /host/{id}/cpu/summary` · `/cpu/line-charts` · `/cpu/line-charts/incremental` | anyView | |
| server\|network | 상세 메모리 | `GET /host/{id}/memory/summary` · `/memory/line-charts` · `/memory/line-charts/incremental` | anyView | |
| server\|network | 상세 네트워크 | `GET /host/{id}/network/summary` · `/network/line-charts` · `/network/line-charts/incremental` | anyView | |
| server\|network | 상세 디스크 · DiskDetailGraph | `GET /host/{id}/disk/summary` · `/disk/line-charts` | anyView | |
| server\|network\|**hostGroup** | HostGroupDiskDetail(그룹 화면이 호스트 EP 호출) | `GET /host/{id}/disk/detail` | anyView | 3개 중 하나 |
| server\|network | 네트워크 상세 인터페이스 | `GET /interface/{id}/interface/status` · `/interface/line-charts` | anyView | |
| server\|network | 사용자 정의 차트 | `GET /host/{id}/items/history` | anyView | |
| server\|network | 네트워크 상세 세션 | `GET /session/{id}/summary` · `/session/{id}/history` | anyView | |
| server\|network | 네트워크 상세 응답 시간 | `GET /host/{id}/response-time/summary` · `/line-charts` | anyView | |
| server\|network | 상세 이벤트 탭·이벤트 정보 모달 | `GET /event/{id}/events` · `/events/basic-information` · `/events/service-details` · `/events/logs` | anyView | byHost 화면은 이 EP를 쓰지 않는다 |
| server\|network | 호스트 상세 사용자 정의 차트(CustomChartsDashboard) | `GET /host/{id}/widgets` | anyView **+ 대상 호스트 가시성** | 못 보는 호스트 id면 200+403(검수 🔴2 IDOR) |
| server\|network | 〃 | `POST /host/{id}/widgets` · `PATCH /host/{id}/widgets/layout` · `PATCH /host/{id}/widgets/{widgetId}` · `DELETE /host/{id}/widgets/{widgetId}` | **anyEdit + 대상 호스트 가시성** | 🔴 위젯은 **호스트 공용**(사용자별 아님)이라 쓰기는 edit. 기본 템플릿의 edit은 관리자만 true → **일반 사용자는 기본적으로 차트 추가·수정·삭제·배치 변경이 403**(1장 규칙 그대로) |
| serverMonitoring | `/monitoring/server-monitoring` 목록 | `GET /hosts/server` | **미적용(공유)** | 네트워크 맵 편집기(권한 칸 없음)의 호스트 검색이 같은 EP를 쓴다 |
| server\|network | 상세 헤더 | `GET /hosts/detail/{hostid}` | **미적용(공유)** | 홈 `main_network_map` 위젯·네트워크 맵 노드 호버·문제 목록·그룹 모달이 함께 쓴다 |
| — | 헤더 전역 검색 | `GET /hosts/search` | **미적용(공유)** | 모든 화면 |

### 2.3 eventAlert.byHost / byTemplate

| 모듈.기능 | FE 화면/라우트 | BE 엔드포인트 | 적용 | 비고 |
|---|---|---|---|---|
| byHost | `/event-alert/problem/:id`(EventDetail) | `GET /event/{id}` | view | |
| byHost | EventDetail | `GET /event/{id}/list-previous` | view | |
| byHost | ProblemList 현황 탭 | `GET /event/stats` | view **+ 범위** | 🔴 로컬 사본(전 호스트) 집계라 비관리자는 **목록·벨과 같은 가시성**(가시 호스트 전부 AND + 태그 권한 축)으로 좁힌 사건만 센다(`EventService#visibleEventIds`). 관리자는 전체. 미연동 비관리자는 200+403. 태그 필터 설치본에서는 사용자 토큰이 돌려주지 않는 사건(해소된 과거분 등)이 빠진다(fail-closed) |
| byHost\|server\|network | UpdateProblemModal(문제 목록·이벤트 상세·호스트 상세 이벤트 표에서 열림) | `GET /event/problems/{id}` · `GET /event/{id}/acknowledge` | anyView | |
| **byTemplate** | UpdateProblemModal 저장(FE가 `byTemplate.edit`으로 버튼 노출) | `PUT /event/{id}/acknowledge` | **edit** | FE 판정과 같은 축. 기본 템플릿은 관리자만 true |
| byHost | ProblemList | `GET /event/problems` | **미적용(공유)** | 홈 `alarm_list` 위젯(비관리자) |
| byHost | ProblemList 그룹 패널 | `GET /hosts/hostgroup-problems` | **미적용(공유)** | 홈 `hostgroup_status` 위젯(비관리자) |
| — | 헤더 벨 | `GET /event/bells` · `PUT /event/isRead` · `GET /event/stream`(SSE) | **미적용(공유)** | 모든 화면(부팅 경로) |

### 2.4 cloudInfraMonitoring (기존 유지)

| 모듈.기능 | FE 화면 | BE 엔드포인트 | 적용 | 비고 |
|---|---|---|---|---|
| awsResources | 클라우드 인프라 전 화면·자산 비용 Cloud 탭 | `/cloud-infras/**`(연결 테스트 제외)·`/costs` 클라우드 부분 | view(기존) | 변경 없음. `POST /cloud-infras/test-connection`은 관리자 |
| hostGroupCI · serverMonitoringCI · networkMonitoringCI | — | — | — | **사용처 없음** |

### 2.5 applicationMonitoring.apm (기존 유지)

`ApmAccessChecker`가 이미 view/edit을 강제한다. 변경 없음(판정기 내부의 캐시·조회 방식 개선만 함께 적용됨).

### 2.6 사용처 없음 / 관리자 전용

| 모듈.기능 | 상태 | 비고 |
|---|---|---|
| customDashboard.customDashboard · customDashboardSettings | **사용처 없음** | FE 판정 0곳 |
| report.generatingReport · reportHistory | **사용처 없음** | 리포트 관리(`/admin/reports/*`)·APM 리포트는 관리자 전용(`adminOnly`, BE 관리자 판정) |
| notification.history · externalNotification · externalNotificationSettings | **사용처 없음** | 알림 관리(Zabbix 액션·미디어)는 관리자 전용 |
| mapView.integratedControlMap · mapList | **사용처 없음** | 네트워크 맵(`/network-architectures`)·지리 맵(`/geo-clusters`)은 권한 칸 없이 인증 사용자 전원(문서 성격 — 의도된 예외). 단 **지리 맵 좌표 편집만 관리자 전용으로 바꿈**(3장) |
| settings.zabbixInfo · cloudInfraInfo | **사용처 없음**(관리자 전용) | `/settings/*` 쓰기는 BE `requireAdmin`, FE `adminOnly` |
| settings.myPage | **사용처 없음** | 내 프로필은 본인 EP라 막지 않음 |
| userManagement.userGroups · hostGroupUR · userRoles · user | **관리자 전용(체크박스 무효)** | 기본값 전부 false. BE는 `requireAdmin`만 본다 — 체크해도 열리지 않는다. 동작 변경 없음 |

### 2.7 막지 않은 부팅·공통 EP

`GET /users/my-profile` · `GET /users/me/permissions` · `GET /users/role/permission` · `GET /home/**` · `/auth/**` · 헤더 벨·SSE · 전역 검색. 여기를 막으면 사이드바·홈이 통째로 깨진다(2026-06-10 사고 전례).

## 3. 권한 칸과 별개로 이번에 바뀐 것

| EP | 변경 | 사유 |
|---|---|---|
| `PATCH /geo-clusters/host-coordinate` | **관리자 전용**(`AdminAccessChecker`) | 슈퍼어드민 토큰으로 Zabbix 호스트 인벤토리를 쓴다. 같은 쓰기 경로의 자산 편집도 관리자 전용 |
| `PUT /users/my-profile`(비밀번호 변경) | 이 사용자의 **모든 세션·refresh 폐기** 후 **현재 기기만 재발급**(응답에 `Set-Cookie: refreshToken` 추가) | 다른 기기의 refresh 쿠키가 비밀번호 변경 후에도 살아 있었다 |
| 관리자 사용자 수정(비밀번호 변경·비활성 그룹) · 사용자 삭제 · 비밀번호 재설정 | 대상 사용자의 **모든 세션·refresh 폐기** | 〃 |
| MCP 토큰 요청 | 요청마다 DB로 **status·userRole·mcp_permission 재확인** | 비활성화·권한 회수가 토큰 만료(최대 24h)까지 반영되지 않았다 |
| `PATCH /users/update-email` | 요청 본문에 **`currentPassword` 추가** — 비밀번호가 있는 계정은 필수(없거나 틀리면 200 + `CURRENT_PASSWORD_INCORRECT`). 비밀번호가 아직 없는 온보딩 계정은 생략 가능 | 세션만 가진 사람이 자기 주소를 등록해 비밀번호 찾기로 계정을 가져갈 수 있었다(검수 🔴4). FE 호출처 없음 |
| 이메일 인증으로 비밀번호 발급(`/auth/verify-otp` VERIFY_EMAIL) | 이 사용자의 모든 세션·refresh 폐기 | 비밀번호 변경 경로 전수 확인 결과 빠져 있던 곳(검수 🔴5) |
| refresh 폐기 방식 | 시각 비교 → **사용자별 세대(Redis INCR)** + **로그인 계열(family)**. 발급(로그인·본인 재발급)은 기대 세대에서만 토큰+세션을 원자적으로 쓰고, 회전은 세대·계열을 이어받으며 세대 불일치·계열 로그아웃 표식을 원자적으로 확인한다. 로그아웃은 계열 표식을 남긴다(회전으로 소비된 옛 토큰으로 와도 소비 흔적 10분으로 계열을 찾는다) | 폐기·로그아웃과 회전·로그인·재발급의 경합에서 세션이 살아남았다(검수 1차 🔴1, 2차 🔴1·🔴2) |
| 로그인 | **사용자 행 잠금(FOR UPDATE) 아래**에서 상태 확인 → 비밀번호 검증 → 세대 읽기 → refresh·세션 발급을 한 트랜잭션으로. 잠금 대기 상한 5초(`SET LOCAL lock_timeout`), 넘으면 200 + `FAILED_TO_ACQUIRE_LOCK`(재시도 안내). Zabbix API 토큰 확보는 잠금 밖에서 하고 실패하면 방금 세운 세션을 되돌린다 | 2차 🔴1·3차 🔴1 |
| 사용자 단위 직렬화 규칙 | 비밀번호 변경·재설정·이메일 인증 발급·관리자/본인 수정·이메일 변경·Zabbix 정보 갱신은 트랜잭션 **맨 앞에서** 사용자 행을 잠그고, 세대 INCR은 커밋 전에 한다. 벌크 UPDATE/DELETE(사용자 삭제·그룹 비활성화·동기화)는 문장 실행(=행 잠금) 뒤에 세대를 올린다. 잠금 순서는 사용자 행 → 그 밖. 롤백되면 세션만 끊긴다(안전한 방향) | 3차 🔴1 |
| 본인 비밀번호 변경 재발급 | 그 변경이 올린 세대로만 재발급. 그 뒤 또 폐기되면 **Set-Cookie 없이 성공 응답**(다음 요청 401 → 재로그인) | 2차 🔴1 |
| 🔴 배포 시 1회 재로그인 | **계열이 없는 기존 refresh 토큰은 회전을 거부**한다(로그아웃 경합을 막을 수단이 없다). 배포 직후 각 사용자는 access 토큰 만료(≤30분) 뒤 refresh가 401 → 로그인 화면 | 호환 방침(2차 🔴2) |
| 로그아웃 | 미연동 계정은 원격 Zabbix 로그아웃을 부르지 않고, 연동 계정의 원격 실패도 로컬 로그아웃·쿠키 만료를 막지 않는다 | 미연동 USER 로그아웃이 200+403으로 끝나 쿠키가 남았다(2차 🟡5) |
| 태그 권한 감지 | 감지 실패·미확인이면 **"태그 제한 있음"** 으로 보고 사용자 토큰 재검증을 강제(목록·벨·통계 공통). 재검증 실패 시 목록·벨은 숨김, **통계는 200+403 거부**(0건을 사실처럼 보이지 않게) | 기동 직후 감지 실패 시 제한된 사건이 노출됐다(2차 🔴3) |
| 이메일 인증(VERIFY_EMAIL) | OTP 조건부 전환·이메일 일치(토큰 경로는 토큰의 email 클레임까지)·인증 표시·비밀번호 발급·세션 폐기를 **한 사용자 잠금 트랜잭션**으로. 발급된 비밀번호만 환영 메일로 보낸다. 비밀번호 재설정은 **재설정용(RESET_PASSWORD) OTP로만** 가능(이메일 인증 OTP 토큰 → `OTP_WRONG`) | 4차 🔴1 |
| 로그인 후속 실패 정리 | 발급 뒤 Zabbix 토큰 확보가 실패하면 **그 발급 건의 계열만** 폐기하고, 로그인 세션은 그 계열이 세운 세션일 때만 원자적으로 지운다(세션 계열 키 `REFRESH_SESSION_FAMILY:<userId>`, Lua compare-and-delete) | 4차 🟡2 |
| OTP 상태 전환 | 검증(ACTIVE→VERIFIED)과 재설정(VERIFIED→DEACTIVE, **소비** — 같은 토큰으로 두 번 재설정 불가)을 사용자 행 잠금 아래 **조건부 UPDATE**로. 0행이면 `OTP_NOT_EXIST_OR_EXPIRE`. 이메일 변경의 무효화도 같은 잠금 안이라, 무효화된 OTP를 진행 중인 검증이 되살리지 못한다 | 3차 🔴2 |
| OTP | 이메일이 없는 계정의 OTP 검증·비밀번호 재설정은 `USER_NOT_HAS_EMAIL`로 거부. 이메일이 바뀌면(update-email·my-profile·관리자 수정·Zabbix 정보 갱신) 그 사용자의 미사용 OTP(ACTIVE·VERIFIED)를 DEACTIVE로. R__도 주소를 지운 시드 admin의 미사용 OTP를 같은 문장에서 무효화 | 주소 제거 전에 받은 코드로 재설정 가능했다(2차 🔴4) |
| 시드 admin 공개 메일함 제거 | `V61__…` → **`R__clear_seed_admin_public_mailbox.sql`(반복 마이그레이션)** | 버전 번호는 ZM-151의 V60과 병합 순서에 따라 validate 실패로 기동이 멈춘다. 반복 마이그레이션은 버전 순서와 무관 |

## 4. 🔴 새로 403(또는 401)이 날 수 있는 엔드포인트

FE는 이미 메뉴·라우트를 view 축으로 가리고 있으므로 **정상 화면 흐름에서 새로 막히는 것은 아래 ★ 항목이 거의 전부**다. 나머지는 주소 직접 호출·AI 어시스턴트/MCP 툴·역할 JSON에 칸이 없는 사용자에게서 나타난다.

| EP | 누가 막히나 | FE 영향 |
|---|---|---|
| ★ `POST/PATCH/DELETE /host/{id}/widgets…` | serverMonitoring·networkMonitoring **edit가 모두 없는** 비관리자(기본 템플릿의 일반 사용자 전부) | 호스트 상세 "차트 추가·수정·삭제·배치 변경"이 200+403. **FE 게이팅 필요**(5장) |
| ★ `GET/POST/PATCH/DELETE /host/{id}/widgets…` | 기능 칸이 있어도 **그 호스트를 Zabbix에서 못 보는** 비관리자, 미연동 비관리자 | 정상 화면(보이는 호스트만 상세 진입)에서는 안 나타난다 |
| ★ `PATCH /geo-clusters/host-coordinate` | 비관리자 전원 | 지리 맵 편집기의 핀 이동·좌표 입력 저장이 200+403. **FE 게이팅 필요** |
| `PUT /event/{id}/acknowledge` | byTemplate.edit 없는 비관리자 | FE는 이미 저장 버튼을 숨김. AI 어시스턴트의 문제 확인 툴도 이 사용자에게는 403 |
| 2.1·2.2·2.3의 view/anyView EP 전부 | 해당 칸 view가 없는 비관리자(역할이 비어 있는 사용자 포함) | 라우트 가드가 이미 같은 축이라 화면 흐름에서는 안 보임. AI 툴·주소 직접 호출은 403 |
| `GET /hosts/{hostid}/livecheck` | hostGroup.view 없는 비관리자 | Zabbix 호스트 관리 화면은 관리자라 영향 없음 |
| `GET /event/stats` | byHost.view 없는 비관리자 | 문제 목록 자체가 byHost 라우트라 영향 없음 |
| `GET /event/stats` | (값 변화) 비관리자는 자기 가시 범위의 숫자만 본다 · 미연동 비관리자는 200+403 | 숫자가 이전보다 작아질 수 있다(의도) |
| `PATCH /users/update-email` | `currentPassword` 없이 부르는 비밀번호 보유 계정 → 200 + `CURRENT_PASSWORD_INCORRECT` | FE 호출처 없음 |
| 미연동 비관리자의 레거시 Zabbix 경로(`/hosts/detail/{id}`·collected-info·이벤트 상세 등) | **401 → 200 + code 403(FORBIDDEN)** 로 바뀜 | FE가 refresh·로그아웃으로 번지지 않는다 |
| 미연동 SUPER_ADMIN | 모니터링 조회가 unlinked(403) → **SYSTEM(전체)** 로 바뀜 | 관리자 축 통일 |
| `POST /auth/refresh` | 계열 없는 기존 토큰(배포 전 발급) → 401(1회 재로그인), 로그아웃과 겹친 회전 → 401 | 의도 |
| `POST /auth/login` | 검증 중 비밀번호 재설정·비활성화가 겹치면 `WRONG_USER_OR_PASSWORD` | 드묾, 재시도로 해결 |
| 이벤트 목록·벨·통계 | 태그 감지 실패 동안 사용자 토큰 재검증 콜 증가, 재검증 실패 시 목록·벨 빈 결과·통계 200+403 | Zabbix 순단 중에만 |
| `/auth/verify-otp`·`/auth/reset-password` | 이메일 없는 계정 → `USER_NOT_HAS_EMAIL` · 이미 소비됐거나 이메일 변경으로 무효화된 OTP → `OTP_NOT_EXIST_OR_EXPIRE`(재설정 토큰 재사용 불가) | 의도 |
| `POST /auth/login` | 같은 사용자의 자격 증명 변경 트랜잭션이 5초 넘게 잠금을 쥐면 200 + `FAILED_TO_ACQUIRE_LOCK` | 드묾(변경 중 Zabbix 호출이 느릴 때) |
| MCP 토큰의 모든 요청 | 비활성·삭제·역할 변경된 사용자 → **HTTP 401**, mcp_permission 회수(NONE)·쓰기 강등(READ) → 200+403 | AI 서버(moveseye-ai)가 BE 401을 받았을 때의 처리는 **미검증**. 토큰 재발급(`POST /internal/mcp/tokens`)은 비활성 사용자에게 `MCP_USER_INACTIVE`를 돌려준다 |
| 비밀번호 변경·재설정·비활성화·삭제된 사용자의 **다른 기기** | `/auth/refresh` 401 → 로그아웃 | 의도된 동작 |
| *(후속 A1)* MCP 토큰의 모든 요청 | 토큰 `gen`이 사용자 현재 세대와 다름(발급 뒤 비밀번호 변경·재설정·비활성화·삭제) 또는 `gen` 없음(배포 전 발급) → **HTTP 401** `INVALID_TOKEN` | AI 서버가 캐시 폐기 후 grant로 재발급 → 세대가 바뀌었으면 아래 행 |
| *(후속 A1)* `POST /internal/mcp/tokens` | `expectedGeneration` ≠ 현재 세대 → 200 + `errorCode: MCP_GRANT_REVOKED`(body code 401) · 사용자 행 잠금 5초 초과 → 200 + `FAILED_TO_ACQUIRE_LOCK`(body code 409) | AI 서버가 grant 폐기 → 사용자 재연결 |
| *(후속 A3)* 모든 인증 EP | `typ` 클레임이 `access`·`mcp`가 아닌 토큰(OTP 토큰, **배포 전 발급된 typ 없는 access 토큰**) → **HTTP 401** `INVALID_TOKEN` | 배포 직후 1회 refresh 실패 → 재로그인(refresh 계열 폐기와 같은 공지) |
| *(후속 A3)* `GET /auth/verify`·`POST /auth/reset-password` | `typ=otp`가 아닌 `otpToken`(access·mcp·배포 전 발급 OTP 링크) → 200 + `OTP_WRONG` | 배포 전에 나간 재설정 메일 링크는 무효 — 다시 요청 |
| *(후속 A4)* `POST /auth/login` | 같은 IP의 로그인 **실패** 누적 15분 50회(설정) 도달 → 200 + `TOO_MANY_REQUESTS` | 기존 username 제한과 같은 응답. 🔴 프록시 뒤 배포에서 `FORWARD_HEADERS_STRATEGY` 미설정이면 사용자 전체가 한 카운터를 공유 |
| *(후속 A4)* `POST /auth/forgot-password`·`POST /auth/resend` | 같은 IP의 요청 15분 20회(설정, 성공·실패 무관) 초과 → 200 + `TOO_MANY_REQUESTS` | 존재 확인(`onlyCheckExisted`)도 센다 |
| *(후속 B2)* `GET /hosts/{groupid}/reports`·`/reports/detail` | 사용자 토큰으로 그 그룹을 못 보는 비관리자, 미연동 비관리자, 숫자가 아닌 groupid → 200 + code 403 + `errorCode: FORBIDDEN`(존재 여부 구분 없음) | 정상 화면(보이는 그룹만 진입)에서는 안 나타남 |
| *(후속 B3)* `PATCH /users/{id}/status` (신규) | 비관리자 → 200 + code 403 · `USER_NOT_FOUND`·`CANNOT_CHANGE_OWN_STATUS`·`CANNOT_DEACTIVATE_ADMIN`·`USER_GROUP_INACTIVE` → 200 + body code 400 | FE 사용자 목록 활성/비활성 동작 |
| *(후속 B3)* `PUT /users/{id}` | (값 변화) 필드만 고쳐도 status가 ACTIVE로 돌아가던 동작 제거 — 비활성 사용자는 비활성으로 남는다(비활성 그룹으로 옮기면 INACTIVE 전환은 유지) | 활성화는 상태 API로 |
| *(검수 D2)* `POST /internal/mcp/tokens` | `expectedGeneration` 없는 요청(배포 전 인가 코드·옛 grant) → 200 + `MCP_GRANT_REVOKED` | AI가 동의 승인 때 `GET /internal/mcp/users/{id}/generation`으로 세대를 고정 |
| *(검수 D3)* `PUT /users/{id}` | 비활성 그룹 포함 배정의 대상이 관리자 → `CANNOT_DEACTIVATE_ADMIN`, 자기 자신 → `CANNOT_CHANGE_OWN_STATUS`(200 + body 400) | 비활성 그룹에 이미 속한 관리자를 폼으로 저장하면 거부 |
| *(검수 D1)* `PUT /users/my-profile` | 정규화(NFC·ROOT 소문자) 결과가 현재 주소와 다른 이메일(예: 점 없는 i)은 `currentPassword` 필요 → 없으면 `CURRENT_PASSWORD_INCORRECT` | 의도 |
| *(검수 D7)* `GET /event/stream` | MCP 토큰 → 200 + code 403 | AI 툴 미사용 |
| *(검수 3차)* `PATCH /users/{id}/status` | 같은 사용자 행 잠금 대기 5초 초과 → 200 + `FAILED_TO_ACQUIRE_LOCK`(body 400) | FE 기타 실패 안내 |
| *(검수 3차)* `GET /internal/mcp/users/{id}/generation`·로그인·MCP 발급 | 동기화가 더 이상 전원 잠금을 쥐지 않음 — 동기화 중 5초 실패는 **그 사용자가 실제로 갱신되는 짧은 순간**에만 가능 | 가용성 개선 |
| *(검수 5차)* `PUT /users/{id}`(그룹 지정)·`POST /users`(그룹 지정)·`DELETE /users`·`PUT·POST /users/user-groups`·`PATCH /users/{id}/status`(ACTIVE) | 동기화·다른 그룹 변경이 소속 잠금을 쥐고 있어 10초(상태 API 5초) 넘게 기다리면 200 + `FAILED_TO_ACQUIRE_LOCK` | 드묾, 재시도 |
| *(검수 6차)* `POST /users/sync`·`PUT·DELETE /users/host-groups`·`DELETE /users/user-groups` | 소속 잠금 대기 초과 → 200 + `FAILED_TO_ACQUIRE_LOCK`(예전 500 또는 `ZABBIX_API_ERROR`). 호스트 그룹 삭제 중 동기화가 대상을 다시 만들었으면 200 + `ZABBIX_SYNC_CONFLICT` | 재시도 |
| *(검수 7차)* `POST /users`(그룹 지정)·`PUT·POST·DELETE /users/user-groups`·`PUT·DELETE /users/host-groups` | 잠금 대기 중 동기화가 같은 숫자 id를 다른 그룹에 다시 매겼으면 200 + `ZABBIX_SYNC_CONFLICT`(로컬 불변, Zabbix 쪽 변경은 다음 동기화가 반영) | 목록 새로고침 후 재시도 |
| *(검수 4차)* `POST /users/sync` | 원격 조회 뒤 로컬 사용자 그룹·소속이 바뀌었으면 200 + `ZABBIX_SYNC_CONFLICT`(body 400), 아무것도 바꾸지 않음 · 적용 중 오류는 전부 롤백 후 예외 | 관리자 재시도 |
| *(B4)* `PUT /users/user-groups/{id}`(활성화) | (값 변화) 개별 비활성화 표시가 있거나 다른 비활성 그룹에도 속한 사용자는 ACTIVE가 되지 않는다 | 목록의 `statusLocked` 표시 |
| *(후속 A2)* `PUT /users/my-profile` | (완화) 이메일이 현재 주소와 같으면(대소문자 무시) `currentPassword` 없이 저장 | 마이페이지 저장마다 이메일 칸을 그대로 보내도 된다 |

## 🔄 FE 요청사항

1. **호스트 상세 사용자 정의 차트**(`components/Dashboard/CustomChartsDashboard.tsx` 계열): 추가·편집·삭제·드래그 배치를 `canEditFeature(SERVER_MONITORING) || canEditFeature(NETWORK_MONITORING)`일 때만 노출.
2. **지리 맵 좌표 편집**(`GeoMapClusterEditorPage`·핀 드래그·위경도 입력): `useIsUserRoleAdmin` 기준으로만 활성화(비관리자는 읽기 전용).
3. **사이드바 이벤트/알림 메뉴**(`SideNav.tsx:441` 부근, 모바일 포함): `show: canViewFeature(BY_HOST)` 추가 — 지금은 조건이 없어 누르면 권한 안내 화면으로 간다.
4. **헤더 벨 항목 클릭**: byHost.view가 없으면 문제 상세로 이동시키지 말 것(현재 이동 후 권한 거부).
5. (선택) 역할 편집 화면에서 "사용처 없음"·"관리자 전용(체크박스 무효)" 칸을 비활성 표시하거나 설명을 붙일지 결정 — BE 응답(`/users/role/permission`)은 바꾸지 않았다.
6. `PUT /users/my-profile`로 비밀번호를 바꾸면 응답에 새 `refreshToken` 쿠키가 실린다(Path=/auth). FE 변경은 필요 없고, **다른 탭·기기는 로그아웃**된다는 안내 문구를 고려.
7. (선택) `PATCH /users/update-email`을 쓰게 되면 본문에 `currentPassword`를 실을 것.
8. 위젯 mutation(`widget.api.ts`)은 `200 + code 403`을 실패로 처리해야 한다(FE 검수 🔴 — 성공 안내 후 입력을 지우는 문제).

## 🔄 ZM-159에서 이관한 권한 항목 (2026-09-17)

ZM-159(대용량 호출 방어) 감사·코덱스 검수에서 나온 권한 결함이다. 사용자 지시에 따라 권한 수정은 ZM-157이 맡으므로 ZM-159는 이 코드를 건드리지 않는다.

1. **그룹 추이 캐시 키에 사용자(권한 축)가 없다** — `HostService.java:1017`(`host-group:resource-trend:{groupid}:{metric}:{agg}:{from}:{to}`)·`:1121`(`host-group:alert-trend:{groupid}:{from}:{to}`). 볼 수 있는 호스트 범위가 다른 사용자끼리 60초간 같은 결과를 공유한다. 서버 목록 스냅샷처럼 `ctx.principal()`(또는 권한 축)을 키에 넣을 것. 근거: `_workspace/features/infra/scale-call-guard/audit_scale-5000-hosts.md` §2 S2.
2. (참고) 커버리지(`HostSnapshotReader`)·호스트 관리 목록(`HostManageService.list`)이 슈퍼관리자 토큰을 써서 AI 사용자 권한을 우회한다는 감사 메모(S3) — 이미 ZM-157 범위에 있으면 무시.

> **BE 처리 결과(2026-09-17, ZM-157):** 1번 반영 — 두 캐시 키에 `ctx.principal()` 포함(관리자 SYSTEM, 사용자 zabbix userid), 사용자별로 다른 결과가 섞이지 않는 것을 상태 보존 캐시 대역으로 검증. 2번은 **변경 없음** — 호출 경로(`MonitoringCoverageController`, `ZabbixOverviewController` 6개 EP, `HostManageController.list`)가 전부 메서드 첫 줄에서 `AdminAccessChecker.requireAdmin`을 거치고 MCP 토큰도 같은 판정을 받는다.
