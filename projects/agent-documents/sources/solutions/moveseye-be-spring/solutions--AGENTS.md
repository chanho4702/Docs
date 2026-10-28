# AGENTS.md — moveseye-be-spring 작업 가이드

> ## 🤝 이 레포는 **Codex 소유**다 (2026-08-02 협업 모드~)
>
> **⚠️ 적용 조건: [../COLLAB.md](../solutions--COLLAB.md) 최상단이 `STATUS: ACTIVE`일 때만.** `SOLO-CODEX`면 아래 제약이 풀리고 FE까지 네가 맡는다. `SOLO-CLAUDE`면 이 레포에 손대지 않는다 — **작업 전 그 한 줄을 먼저 확인하라.**
>
> Claude와 영역을 나눠 작업 중이다. **Codex = 이 레포 + `moveseye-engine/`, Claude = `moveseyee_fe/`.**
> - **`moveseyee_fe/`에 쓰지 않는다** — 생성·수정·삭제·커밋 금지. 읽기는 자유.
> - 작업 시작 전 담당 기능의 `_workspace/contract_{feature}.md`에서 **`## 🔄 FE 요청사항`** 섹션을 먼저 확인한다.
> - BE 구현 후 **계약서(`_workspace/contract_{feature}.md`)를 반드시 산출/갱신**한다 — 이게 FE와의 유일한 접점이다.
>   응답 shape은 FE의 2겹 언랩 기준(= `data` payload)으로 적고, 에러는 200 + 바디 `code` 규약을 따른다.
> - BE(:3000) 기동·재빌드는 Codex 담당. 규약 정본: [../COLLAB.md](../solutions--COLLAB.md)

이 문서는 **앞으로 해야 할 일 · 작업에 필요한 것 · 알려진 문제점/이슈/주의사항**을 정리한 운영 가이드다.
(프로젝트가 무엇이고 무엇이 어떻게 포팅됐는지 = 스펙은 [README.md](solutions--README.md) 참조.)

핵심 원칙: **API 계약 1:1 보존**. 응답 형식/상태코드/필드명을 바꾸면 `moveseyee_fe`가 깨진다. 변경 시 원본(`C:\solutions\moveseye-be`)을 먼저 정독하고, 불가피한 차이는 `⚠️`로 문서화한다.

---

## 0. 모듈 구조 (수집 엔진 레이어)

2026-07 다중 데이터소스 전환으로 **Gradle 멀티모듈**이 됐다. 작업 전에 어느 모듈인지 먼저 확인할 것.

| 모듈 | 역할 | 가이드 |
|---|---|---|
| **root(app)** | REST·JPA·Redis·비즈니스 로직. Boot 부팅 모듈 | 이 문서 |
| **`engine-api`** | 수집 계약 — `engine/`(소스 중립) + `zabbix/`(Zabbix 전용, 추상화 없음) | [engine-api/AGENTS.md](./engine-api/AGENTS.md) |
| **`engine-zabbix`** | Zabbix 구현(어댑터·RPC 래퍼·키 카탈로그) | [engine-zabbix/AGENTS.md](./engine-zabbix/AGENTS.md) |
| **`dbm-collector-core`** | DB 모니터링 수집 코어 — J1(BE)·J2(원격 수집기) 공유. **프로덕션 의존 JDK만**(Spring·JPA·PG 드라이버·lombok·slf4j 금지, 의존 그래프 + ArchUnit allowlist) | [dbm-collector-core/CLAUDE.md](dbm-collector-core/solutions--CLAUDE.md) |

🔴 **app은 `engine-api`만 컴파일 의존한다**(`engine-zabbix`는 `runtimeOnly`). app 프로덕션 코드가
Zabbix 구현을 직접 참조하면 **빌드가 깨진다** — 의도된 장치다(스텝 5).
Zabbix 전용 기능이 필요하면 `engine-api`의 `zabbix/` 구역 계약을 쓴다.

🔴 **새 BE 기능에서 Zabbix를 직접 부르지 말 것.** 메트릭·인벤토리·알람은 포트
(`MetricPort`/`InventoryPort`/`AlertPort`) 경유가 원칙이다. 관리 화면 CRUD·아이덴티티(C·D군)만 예외다.

설계 정본: `C:\solutions\_workspace\devdesign_collector-engine.md`

ℹ️ **배포 산출물은 여전히 JAR 1개다.** Spring Boot fat jar가 `engine-api`/`engine-zabbix`를
`BOOT-INF/lib/` 안에 넣어 통째로 패키징한다(`runtimeOnly`도 런타임 클래스패스라 포함된다 — 실측 확인).
파이프라인의 `docker build` → `docker run` 구조는 그대로이며, **Dockerfile의 COPY 대상만** 멀티모듈을
따라가야 한다(아래 이슈 이력 참조).

---

## 0.5. 패키지 규칙 (2026-07-28 정리)

### 규칙 — 새 코드는 이걸 따른다

1. **기능별 수직 분할이 기본.** `asset/` `event/` `report/` 처럼 기능 하나에
   controller·service·dto·repository·domain을 모두 넣는다.
   ❌ `controller/` `service/` 를 최상위나 기능 하위에 레이어 폴더로 만들지 않는다(P3에서 해체함).
2. **엔티티는 기능 안에.** `asset/domain/Asset`. 전역 `domain/`은 없다(P1에서 해체함).
3. **`common/`에 넣기 전에 한 번 더.** 도메인 로직이면 도메인으로. 실제로 2개 이상 기능이
   공유하고 도메인 색이 없을 때만 common이다.
4. **테스트 패키지는 프로덕션과 미러링.** 어긋나면 "같은 패키지라 import 없이 쓰던" 코드가
   나중에 깨진다(P3에서 실제로 겪음).
5. **`com.dmove.moveseye.zabbix.*` 는 engine-api(계약) 전용.** app의 Zabbix 관리 화면은
   `zabbixadmin/` 이다(P6에서 분리 — FQN만 보고 계약인지 화면인지 구분되게).

### 🔤 어휘 대응표 — 같은 것을 부르는 이름이 층마다 다르다

| 개념 | FE | app(BE) | 수집 엔진 계약 | Zabbix |
|---|---|---|---|---|
| **알람/이벤트** | `event-alert`, `alert.ts` | `event/` | **`Alert`·`AlertPort`** | `problem` / `event` |
| 호스트 모니터링 | `monitoring`, `host-monitoring.api` | `host/` | `InventoryPort`·`MetricPort` | `host` + `item` |
| 사용자·권한 | `user-roles` | `user/`(+`user/admin/`) | — (D군, 추상화 제외) | `user`·`usrgrp`·`role` |
| Zabbix 관리 화면 | `zabbix-management` | `zabbixadmin/` | `zabbix/`(계약) | `item`·`template`·`trigger` |
| 자산 | `asset` | `asset/` | — (D9, 추상화 제외) | `host.inventory` |
| 리포트 | `report-management.api` | `report/` | — | — |
| 지도 | `geomap.api`·`networkmap.api` | `geomap/`·`networkmap/` | — | — |

🔴 **가장 혼란스러운 축은 알람이다** — 같은 것을 `event`(app) / `Alert`(엔진) / `problem`(Zabbix) /
`event-alert`(FE) 넷으로 부른다. 수집 엔진이 **`Alert` 어휘를 채택**했으므로 장기 방향은 그쪽이지만,
app의 `event/` rename은 REST 경로(`/event`)와 FE까지 걸려 **별도 과제**다.
⚠️ 새 코드에서 이 넷을 섞어 쓰지 말고, 지금 있는 층의 어휘를 따를 것.

### 남은 정리 (미착수)

- `host/` 126파일 — `host/dto` 41개가 평면. 서브기능(서버목록·네트워크목록·그룹모니터링) 축으로 쪼갤 여지
- `event` ↔ `Alert` 어휘 통일(위 표) — REST 경로·FE 동반 변경이라 별도 과제

---

## 1. 앞으로 해야 할 일 (남은 작업)

| 우선순위 | 작업 | 전제/필요한 것 | 비고 |
|---|---|---|---|
| 높음 | **Vault JWT_SECRET 교체** | Vault 접근(`vault kv patch secret/moveseye JWT_SECRET=<256bit+>`) | 2026-07-16 보안 재설계로 <32바이트 시크릿은 기동 실패. dev `.env`만 교체됨 — 운영/Vault 미교체. 교체 시 전원 재로그인 |
| 높음 | **인증 FE 브라우저 E2E** | Chrome 확장 연결 | 로그인→방치(자동 refresh)→로그아웃 흐름. BE는 curl 완전검증, FE는 tsc·로직만 검증됨(런타임 미확인). dev: FE `.env.local`로 :3001, Vite :5174 |
| 선택 | **AWS 실연동 검증** | 유효한 AWS 자격증명 + dev DB `Setting(CLOUD)`에 클라우드 접속정보 등록 | aws 모듈은 코드/빌드/라우트만 검증됨. 실 EC2/CloudWatch 호출 미검증 (`/cloud-infras/regions`가 `SETTING_NOT_FOUND`였던 이유) |
| 선택 | **나머지 단위 테스트 포팅** | 없음(바로 가능) | 원본 22개 spec 중 5개만 포팅. host 메트릭(cpu/disk/memory/network/interface)·zabbix·user-group·host-group·otp·admin·setting·encrypt/redis 남음. 동일 패턴(JUnit5+Mockito) |
| 조건부 | **email 후속 기능** | 실제 해당 기능 사용 시 | Bull 큐(`giftLink` QUEUE 모드), VERIFY/WELCOME 템플릿. **원본도 부재/주석 상태**라 현재 동작 영향 없음 |
| 조건부 | **Socket.IO / i18n / Notification·Device 엔티티** | 해당 기능 활성화 시 | 원본도 미사용이거나 부분 구현. 필요해질 때 netty-socketio / MessageSource 등으로 신설 |

> **변환 자체는 사실상 완료.** 남은 건 외부 자원(AWS 자격증명)·실사용 필요성·테스트 보강 같은 부가 항목뿐이다.

---

## 2. 작업에 필요한 환경

- **JDK 17**: `C:\Program Files\Java\jdk-17` (시스템 기본은 Java 8 Corretto → `JAVA_HOME` 반드시 지정).
- **Gradle**: 래퍼(9.2.1) 사용. `.\gradlew.bat`.
- **dev 인프라**: PostgreSQL(localhost:5432, db `dmove`, postgres/qwe123) + Redis(localhost) + 실 Zabbix(`dmove.co.kr`).
- **환경변수 — Vault가 정본 (2026-07-06 도입)**: 시크릿/설정은 로컬 Vault(`dmove-vault` 컨테이너, `secret/moveseye`, KV v2)에 있다. **`VAULT_TOKEN`만 export하면 bootRun 가능**(.env export 불필요). 토큰/unseal 키·운영 명령은 `C:\solutions\vault\README.md` 참조. 컨테이너 재시작 후엔 unseal 필요. OS 환경변수가 Vault 값보다 우선(개별 오버라이드 가능). 시크릿 변경은 .env 수정이 아니라 `vault kv patch secret/moveseye KEY=값`.
- **환경변수 폴백(.env)**: Vault 미가동/토큰 부재 시 기존 방식 그대로 동작(`optional:vault://` + `fail-fast: false`). `moveseye-be\.env` 재사용.
  - ⚠️ **`gradlew bootRun`은 `.env`를 자동 로드하지 않는다.** 먼저 `.env`를 현재 셸에 환경변수로 export한 뒤 **같은 세션에서** bootRun을 띄워야 한다. 안 하면 `${DB_PORT}` 등 플레이스홀더가 미치환돼 `APPLICATION FAILED TO START`로 죽는다. (PowerShell 헬퍼 예: `_workspace\_load_env_spring.ps1`)
- **주기 동기화 기본 off (2026-07-16)**: `app.sync.enabled` 전역 기본값이 `false`로 변경 — 10분 주기 Zabbix 미러 동기화는 `SYNC_ENABLED=true` 옵트인. 동기화는 FE 사용자 관리 화면의 동기화 버튼(`POST /users/sync`)으로 수동 실행이 기본. 같은 날 FE `useSyncUser`의 10분 setInterval 자동 호출도 제거됨. 기본 admin은 Flyway `V10__seed_admin_user.sql` 시드(admin/qwe123)로 생성 — 구 `initDefaultAdmin()` @PostConstruct(Admin@123)는 삭제. `POST /users` 생성 시 `createInZabbix:false`면 MovesEye 전용 계정(zabbix 미연동, 동기화 삭제 대상 제외).
- **dev 프로필 (`application-dev.yml`, 2026-07-16 신설·07-16 개정)**: `SPRING_PROFILES_ACTIVE=dev`로 기동하면 DB가 **테스트용 도커 PostgreSQL**(`dmove-postgres-test`, localhost:5433)로 전환된다. Flyway는 켜져 있으므로 **빈 컨테이너여도 기동만 하면 V1(전체 스키마)~V10(admin 시드)이 자동 적용**돼 admin/qwe123으로 바로 로그인 가능 — pg_dump 복제는 실데이터가 필요할 때만. **다른 Zabbix 서버를 붙여 테스트할 때 사용** — 도커 DB 덕에 실 dev DB(5432)는 오염되지 않는다(주기 동기화는 전역 기본 off라 별도 조치 불필요). Zabbix API URL은 FE 설정화면(`POST /settings/zabbix`의 url 필드)에서 변경 가능(env 폴백, README ⚠️ #6).
- **pg_dump/psql**: `C:\Program Files\PostgreSQL\18\bin` (Flyway baseline 덤프/검증용).
- **원본 소스**: `C:\solutions\moveseye-be` (계약 확인용), FE: `C:\solutions\moveseyee_fe`.

### 빌드/기동/검증 루틴
```powershell
.\gradlew.bat build -x test        # 컴파일/빌드
.\gradlew.bat test                 # 단위 테스트
# bootRun 전: .env를 현재 셸에 export(자동 로드 안 됨 — 위 환경변수 주의 참조).
#   예) Get-Content ..\moveseye-be\.env | ? { $_ -match '=' -and $_ -notmatch '^\s*#' } |
#       % { $k,$v = $_ -split '=',2; Set-Item "env:$($k.Trim())" $v.Trim() }
#   같은 세션에서 PORT=3000 으로 bootRun → 라우트 401 또는 실로그인 검증
#   (Flyway는 기본 on — 2026-07-16부터 Spring이 스키마 단독 관리. 끌 일이 있을 때만 SPRING_FLYWAY_ENABLED=false)
```

---

## 3. 알려진 이슈 / 반드시 지켜야 할 주의사항

### 🔐 인증/세션 (2026-07-16 보안 재설계 — 원본 계약을 의도적으로 깸)
0. **토큰은 HttpOnly 쿠키, body 아님**: 로그인/refresh 응답은 `Set-Cookie`로 `accessToken`(JWT 30분, Path=/)·`refreshToken`(불투명, Path=/auth, 8h)을 내린다. **로그인 응답 body에서 `token` 필드 제거**(`LoginResponseDto`={user}만) — FE는 `withCredentials`로 쿠키 자동전송. `JwtAuthFilter`는 accessToken 쿠키 우선(+Bearer 폴백).
   - **`/auth/refresh`(신규, public)**: refresh 쿠키 검증→회전(1회용, visitorId 대조). `AuthService.refresh`. 재사용/타기기 refresh는 401.
   - **로그아웃 무효화**: `AuthService.logout(currentUser, refreshToken)`이 `USER_LOGIN_KEY` 삭제 + refresh 폐기 + Zabbix logout. 세션 TTL은 refresh 만료(8h)와 동일(과거 ≈1000일 버그 제거).
   - **JWT_SECRET ≥32바이트(256bit) 필수** — `JwtTokenProvider`가 부팅 시 검증(미달이면 기동 실패). ⚠️ **Vault `secret/moveseye`의 `JWT_SECRET`을 강한 값으로 교체할 것**(현재 dev `.env`만 교체됨). 교체 시 기존 토큰 전부 무효(전원 재로그인).
   - **CORS 화이트리스트 + credentials**: `app.cors.allowed-origins`(env `CORS_ALLOWED_ORIGINS`) 명시 오리진만. `allowCredentials=true`라 와일드카드 불가. 쿠키(SameSite=Strict)·Secure는 `app.cookie.*`(dev=secure:false).
   - **rate limit / OTP 바인딩**: 로그인 실패 10회/15분·OTP 검증 5회/3분(`AuthRateLimiter`, `TOO_MANY_REQUESTS`). `verifyOtp`는 OTP의 userId와 요청 username 일치를 검증(원본은 미검증 → 타인 비번변경 가능했음).
   - **Swagger 운영 off**: `springdoc.*.enabled` 기본 false(dev 프로필만 on).

### 🔴 계약/동작 보존 (건드리면 FE 깨짐)
1. **403 → HTTP 200 보존**: 권한 거부는 HTTP 200 + body `code:403`으로 나간다(원본 버그). 401만 실제 상태코드. `GlobalExceptionHandler`에서 의도적으로 유지 — "정상화"하지 말 것.
2. **`@Roles` 적용 범위 = `@RolesGuarded` 마커**: 원본 NestJS는 `@UseGuards(RolesGuard)`가 걸린 컨트롤러에서만 `@Roles`가 동작했고, `user.controller`/`setting.controller`는 RolesGuard가 없어 `@Roles`가 **무시**됐다. Spring은 `RolesInterceptor`가 전역 등록이므로, **클래스에 `@RolesGuarded`가 있을 때만** `@Roles`를 검사하도록 했다.
   - ⚠️ **새 컨트롤러에 `@Roles`를 달 때**: 원본에서 RolesGuard가 걸린 컨트롤러였다면 `@RolesGuarded`도 함께 붙여야 검사가 동작한다. 안 붙이면 `@Roles`가 조용히 무시된다. (현재 마커 보유: `AdminUserController`, `AdminUsrgrpController`)
   - 🔴 **admin 계정은 `@RolesGuarded`+`@Roles`로 막힌다(2026-06-23 발견).** `RolesInterceptor`는 `@Roles`를 JWT의 **`roleid`** 와 비교하는데, admin은 zabbix 미연동이라 `zabbix_userid=NULL` → 로그인 시 `roleid`가 안 채워져(`AuthService`) null. `"ADMIN".equals(null)=false` → 항상 거부(HTTP200 body code403). 기존 admin 화면들은 FE가 `@RolesGuarded` 없는 `/users` EP를 써서 안 드러났을 뿐. **FE에서 호출하는 관리자 전용 신규 EP는 roleid 기반 `@RolesGuarded` 대신 userRole 기준으로 검사하라** — `AdminAccessChecker.requireAdmin(currentUser)`(userRole이 ADMIN/SUPER_ADMIN인지) 패턴 사용. 전역 `RolesInterceptor`는 건드리지 말 것(타 화면 회귀).
3. **JSON-RPC 본문은 직렬화 문자열로 전송**: `ZabbixClient`에서 `.body(객체)`로 보내면 JDK HttpClient가 chunked 스트리밍 → Zabbix가 `Invalid JSON(-32700)`. 반드시 `objectMapper.writeValueAsString()` 문자열 본문 사용.
4. **날짜는 UTC 전제**: `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` 고정 패턴. 서버/DB TZ가 UTC가 아니면 출력이 어긋난다.
5. **Lombok boolean is-접두 함정**: `private boolean isXxx` → Lombok `isXxx()` → Jackson이 "is"를 떼어 JSON 키가 `xxx`로 바뀐다. is-접두 필드명을 JSON에 보존해야 하면 `Boolean` 래퍼로 선언할 것(getter `getIsXxx()`).
6. **JPA 역방향 @ManyToMany 미저장**: inverse-side는 save해도 정션이 안 써진다 → 정션 엔티티(UserUserGroup, UsergroupHostgroup)로 owning-side 조작.

### 🟡 운영/데이터 주의
7. **Flyway = 스키마 정본 (2026-07-16, Spring 단독 관리 전환)**: Nest 병행이 끝나 스키마는 Flyway가 단독 관리하며 **전 환경 기본 on**이다(과거의 "dev는 SPRING_FLYWAY_ENABLED=false" 관례 폐기). 빈 DB는 V1이 전체 스키마를 생성하고, 기존 DB는 baseline-on-migrate로 이어받는다.
   - 🔴 **이미 적용된 마이그레이션 파일은 절대 수정하지 말 것.** Flyway는 적용 완료된 버전을 재실행하지 않으므로, 기존 `Vn__*.sql`에 `ALTER TABLE ...`을 덧붙여도 **기설치 환경에선 그 DDL이 영영 실행되지 않는다**(파일만 바뀌고 DB는 그대로 → 컬럼 누락). 게다가 파일 변경은 checksum mismatch로 `validate`를 깨뜨린다. 스키마 변경은 **반드시 새 `V(n+1)__*.sql`로 분리**하고, `ADD COLUMN IF NOT EXISTS` 등으로 멱등하게 작성한다. (2026-06-22 host_group_report `hosts` 컬럼을 V3에 덧붙였다가 누락 → V3 원복 + 신규 V4 분리로 해결한 사례.)
8. **zabbix 연동 USER는 password가 NULL**: ZABBIX platform 계정은 이메일 인증으로 최초 비밀번호를 발급받는 온보딩 구조라 DB password가 비어 있다(직접 로그인 불가). E2E 테스트 시 임시 비밀번호 주입 후 **반드시 NULL로 원복**.
9. **Zabbix 권한 의존**: 제한된 Zabbix 계정(예: guest)은 `problem.get` 등에 `No permissions` → ZabbixClient가 INVALID_TOKEN(401)로 매핑. 버그 아님(원본 권한 의존 거동). 데이터가 안 보이면 Zabbix 계정 권한부터 의심.
10. **pg_dump 18 메타명령**: `pg_dump --schema-only` 출력 상단/하단의 `\restrict`/`\unrestrict`는 psql 메타명령이라 Flyway가 파싱 못함 → 덤프 갱신 시 제거 필요.

### 🟢 빌드/테스트 주의
11. **Gradle 9 + JUnit5**: `testRuntimeOnly("org.junit.platform:junit-platform-launcher")` 없으면 "Failed to load JUnit Platform". 이미 추가됨.
12. **PG enum / jsonb / quoted 컬럼**: `@Enumerated(STRING)+@JdbcType(PostgreSQLEnumJdbcType)`, jsonb는 `@JdbcTypeCode(SqlTypes.JSON)`, camelCase 컬럼(`"lastName"`)은 `globally_quoted_identifiers`로 처리. 엔티티 추가 시 동일 패턴 유지.

---

## 4. 해결된 이슈 이력 (참고)

| 날짜 | 이슈 | 해결 |
|------|------|------|
| 2026-06-10 | **FE 사이드바 미표시** — admin 로그인 시 `/users/role/permission`이 403 → FE `permissions` 미수신 → 메뉴 전멸 | RolesInterceptor 전역등록이 원본에 없던 `@Roles` 강제를 추가한 회귀. `@RolesGuarded` 마커로 원본 RolesGuard 적용 범위 1:1 재현 (주의사항 #2) |
| 2026-06-10 | jjwt `WeakKeyException`(JWT_SECRET 256bit 미만) | auth0 java-jwt로 교체 |
| 2026-06-10 | Zabbix `Invalid JSON(-32700)` | JSON-RPC 문자열 본문 전송 (주의사항 #3) |
| 2026-06-10 | aws 모듈 `Instance` 레코드 ↔ AWS SDK `Instance` 충돌 | 레코드를 `InstanceRef`로 rename |
| 2026-07-28 | 🔴 **Dockerfile이 멀티모듈을 모름** — `settings.gradle.kts`가 `include("engine-api")`/`include("engine-zabbix")` 하는데 Dockerfile은 `src`만 COPY. 멀티모듈 도입(07-23) 이후 Dockerfile(07-06 최종수정)이 안 따라가 **master 배포가 구성 단계에서 실패할 상태**였다(작업이 전부 ZM-87 브랜치라 파이프라인이 안 돌아 안 드러남) | `COPY engine-api ./engine-api` · `COPY engine-zabbix ./engine-zabbix` 추가 + 빌드 스크립트만 먼저 복사해 의존성 캐시 레이어 복구 |

---

## 5. 변환 작업 방식 (다음 세션 가이드)

1. 원본 모듈을 먼저 정독(`C:\solutions\moveseye-be\src\...`) → 엔드포인트/DTO/계약 quirk 파악.
2. 모듈 단위로 변환(엔티티 → 서비스 → 컨트롤러 → DTO).
3. 빌드(`build -x test`) → 기동 → 라우트/실데이터 검증으로 그린 유지.
4. 계약 quirk·의도적 차이는 코드 주석과 README에 `⚠️`로 남긴다.
5. 큰 변경(권한/전역 설정)은 원본의 가드/인터셉터 **적용 범위**까지 확인 — 데코레이터만 보고 옮기면 범위가 과해진다(사이드바 이슈 교훈).
