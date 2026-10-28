---
tags: [moveseye, spring-boot, nestjs, migration, backend]
updated: 2026-06-10
---

# 2026-06-10 — NestJS → Spring Boot 변환 (1차: 공통 기반 + auth)

[[projects/moveseye/moveseye-overview|moveseye-overview]] 의 BE(moveseye-be)를 Spring Boot 3.3 / Java 17 / Gradle(Kotlin DSL)로 변환 시작.
산출물: `C:\solutions\moveseye-be-spring\` (진행 현황은 그 안의 README.md 참조).

## 승인된 결정 (사용자 확인 완료)

- 빌드: **Gradle Kotlin DSL** / DB: PostgreSQL (확정 근거: pg 드라이버 + jsonb/enum 마이그레이션)
- 마이그레이션: **Flyway baseline** (기존 TypeORM 마이그레이션 산출 스키마를 V1 baseline, `ddl-auto: none`)
- 순서: 공통 기반 + auth/user 부터 → 이후 user 전체 → email/zabbix(현재 스텁) → admin/host/event 등
- **403도 HTTP 200으로 반환되는 원본 버그 동작을 보존** (`instanceof (A || B)` 평가 특성. FE가 이 동작에 맞춰져 있을 가능성)

## 핵심 발견 (다음 모듈 변환 시 필수 참고)

- **테이블/컬럼 명명**: 수기 SQL 마이그레이션이라 대부분 snake_case unquoted인데 `"lastName"`만 quoted camelCase.
  → Hibernate는 `PhysicalNamingStrategyStandardImpl` + `globally_quoted_identifiers: true` 조합으로 매칭.
- **PG native enum** 6종(user_role_enum 등): `@Enumerated(STRING)` + `@JdbcType(PostgreSQLEnumJdbcType.class)`.
- **jsonb**: `@JdbcTypeCode(SqlTypes.JSON)` (Role.dmove_permission, HostGroup.host_data).
- **정션 테이블 이중 매핑 주의**: `user_usergroups`가 `@ManyToMany @JoinTable`과 명시 엔티티 `UserUserGroup` 양쪽에 매핑됨 → user 모듈 변환 때 한쪽으로 통일 필요.
- **User 엔티티 @BeforeUpdate bcrypt 훅은 재해싱 잠재 버그** → Spring에서는 비밀번호 변경 시에만 서비스 레이어에서 인코딩 (의도된 차이로 문서화).
- **응답 계약**: ApiResult 미설정 필드는 undefined로 생략, 엔티티 null은 null로 직렬화 → `@JsonInclude(NON_NULL)`을 ApiResult에만 적용(전역 설정 금지).
- syncTime은 성공 응답에만 주입(값이 null이어도 `"syncTime": null` 포함) → `@JsonAnyGetter` 트릭으로 재현.
- JWT(HS256, 시크릿 UTF-8 바이트)와 bcrypt($2b$, cost10)는 Node와 상호 호환 → 마이그레이션 기간 병행 운영 가능.
- 로그인 visitorId TTL이 `60*60*24*1000`초(≈1000일)로 들어가는 원본 의심 코드도 그대로 보존(주석 표기).

## 2차: user 모듈 변환 (같은 날 진행)

26개 엔드포인트(`/users/**`) + UserService/UserGroupService/HostGroupService + 10분 주기 동기화 스케줄 변환 완료.

**계약 보존 quirk (FE가 의존할 수 있어 그대로 유지):**
- `PUT /users/:id` 응답 = TypeORM UpdateResult `{generatedMaps:[], raw:[], affected}` 또는 null
- `GET /users/zabbix/user-detail`만 ApiResult 미래핑(DTO 직접 반환 + syncTime 스프레드) → `SyncTimeCarrier` 인터페이스로 재현
- `GET /users/roles` 정렬: sortBy≠name이면 `name DESC`가 항상 1차 정렬 (TS 객체 키 순서 quirk)
- status 정렬 방향 반전, 업데이트 시 status 무조건 ACTIVE 재설정 등 보존

**JPA 포팅 교훈:**
- TypeORM은 inverse 측 ManyToMany도 save로 정션을 갱신하지만 JPA는 owning 측만 반영 →
  그룹 기준 멤버 변경은 명시 정션 엔티티(UserUserGroup) 직접 조작으로 해결 (원본의 이중 매핑 구조 그대로 활용)
- `@Transactional` 자기 호출(self-invocation) 주의: runSync→syncRoles, deleteUsers→bulk delete에서 프록시 우회 발견·수정
- leftJoinAndSelect+take/skip(TypeORM의 중복행 자동 dedup) → JPA에서는 2단계 조회(id 페이지 → IN 재조회)와
  exists 서브쿼리로 치환하는 게 안전 (DISTINCT+ORDER BY cast 식의 PG 제약 회피)
- enum 컬럼 알파벳 정렬은 HQL `cast(x as string)`으로 원본 CAST AS TEXT 재현
- 미관계 엔티티 조인(user.refRole=role.id)은 Hibernate ad-hoc 엔티티 조인(`left join Role r on ...`) 또는 별도 조회로

**미변환 잔여:** UserCommand(NestJS 마이크로서비스 MessagePattern — 전송수단 결정 필요),
admin 모듈용 updateUserField(isUpdateProfile)/sendMailVerifyEmail, updateZabbixUserInfo의 원본 이중 해싱 버그는 단일 인코딩으로 의도 수정.

## 빌드 검증 (2026-06-10)

- JDK 17 설치됨(`C:\Program Files\Java\jdk-17`, 시스템 기본은 여전히 Java 8 → JAVA_HOME 지정 필요).
- Gradle은 IntelliJ가 받아둔 `~\.gradle\wrapper\dists\gradle-9.2.1-bin` 재활용 → **`gradle build` 성공** (컴파일 에러 1건 — 누락 헬퍼 `orderByIds` — 수정 후 통과).
- Spring Boot 3.3.5 플러그인이 Gradle 9.2.1에서 정상 동작함.
- 프로젝트에 Gradle Wrapper(9.2.1) 생성 완료 → 이후 `.\gradlew.bat build -x test`.

## 기동 검증 (2026-06-10, dev DB/Redis)

- **jjwt WeakKeyException 발견**: 기존 JWT_SECRET이 160비트 → jjwt는 RFC 7518(256비트 최소)를 서명·검증 모두에서 강제.
  Node jsonwebtoken은 길이 무제한이므로 **auth0 java-jwt로 교체**해 해결 (HMAC 동일 → 토큰 상호 호환 유지).
  교훈: NestJS→Spring JWT 마이그레이션 시 시크릿 길이부터 확인할 것.
- bootRun 성공(Flyway off로 dev DB 무변경). `/auth/login` 3종 검증 통과:
  USER_NOT_FOUND·검증에러 `\n` join·실존 admin 계정 WRONG_USER_OR_PASSWORD —
  PG enum 3종 + quoted "lastName" + EAGER userGroups 조인 + bcrypt($2b$) 검증까지 실증됨.
- 미검증: 정상 로그인 전체 플로(Zabbix 스텁), Flyway baseline.

## 3차: zabbix + zabbix-sync 모듈 (같은 날)

JSON-RPC 2.0 클라이언트(`ZabbixClient`, RestClient) + 7개 서비스 구현체 + 전체 동기화 + Setting 엔티티/UsergroupHostgroup 정션. 스텁 삭제. 실 Zabbix 7.0.6 연동 검증 완료.

**핵심 교훈 — Zabbix JSON-RPC 본문은 직렬화 문자열로 보낼 것:**
- Spring RestClient `.body(객체)`는 JDK HttpClient에서 chunked transfer-encoding으로 스트리밍됨.
- Zabbix `api_jsonrpc.php`(PHP `php://input`)가 chunked 본문을 못 읽어 빈 본문 취급 → `-32700 Invalid JSON` 반환.
- `SimpleClientHttpRequestFactory`(버퍼링/Content-Length)로도 해결 안 됨. **`objectMapper.writeValueAsString()`로 직접 직렬화해 String 본문으로 전송**하면 Content-Length 확정되어 해결.
- 진단법: 직렬화된 JSON 자체는 PowerShell 직접 호출과 100% 동일했음 → 본문 내용이 아닌 전송 방식 문제로 좁힘. (디버그 로그로 실제 전송 JSON 찍어 비교)

**기타:**
- host.get inventory가 빈 배열 `[]`/객체 혼용 → `callRaw`(JsonNode) 수동 매핑.
- Super Admin 캐시(`ZABBIX::Super_Admin`)는 원본대로 JSON 이중 직렬화로 Redis 저장(NestJS와 상호 운용).
- `@DynamicInsert`로 User INSERT 시 null 컬럼 제외(TypeORM 동작 재현, DB 디폴트 적용).
- zabbix-sync 인스턴스 필드 상태(syncedUserGroups 등)는 동시성 안전 위해 실행 단위 SyncContext 로컬 객체로 전환.

## event 최상위 모듈 (마지막 기능 모듈, 전체 9/9 완료)

8개 EP(acknowledge PUT, problems, bells, problems/:id, :id, :id/acknowledge GET, list-previous, isRead PUT) + 동기화 2 cron 변환. 빌드·기동·8라우트(401) 검증 통과.

**교훈/계약 보존:**
- **Zabbix 비표준 필드(acknowledges/r_eventid/suppression_data/tags) 천지 → host 모듈과 동일하게 Raw `Map` 기반 호출**(`getRaw`/`getTriggersRaw`/신설 `ZabbixEventService.get`)로 통일. typed record로 일일이 매핑하지 않음.
- **시간 직렬화**: occurrenceTime/resolutionTime은 원본이 `moment.unix().toISOString()` String 타입 → `DateTimeFormatter "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"`(UTC) String으로 생성해 `.000Z` 포맷까지 일치. Date 타입 필드(timestamp/suppressUntil)는 Instant + Spring Boot 기본 ISO 직렬화. resolutionTime 미해결은 문자열 `"Pending"`.
- **Lombok boolean 키 함정**: `private boolean isAcknowledged` → Lombok getter `isAcknowledged()` → Jackson이 "is"를 떼어 JSON 키가 `acknowledged`로 변형됨. is-접두 필드는 **`Boolean` 래퍼**로 두면 getter `getIsAcknowledged()` → JSON 키 `isAcknowledged` 보존. (canConvertToCause/manualClose 등 비-is 필드는 primitive로 OK)
- **공유 DTO**: `EventProblemResDto` 하나가 트리(problems: info/causeEventId/children/actionGroups)와 벨(bells: status/isRead) 두 흐름을 공유 → `@JsonInclude(NON_NULL)`로 미사용 필드 제외. 원본 TS 구조적 타이핑상 노출되던 `status`도 필드로 보존.
- **JPA native upsert**: TypeORM `upsert`/`orUpdate` → JPA는 미지원이라 `JdbcTemplate` + PostgreSQL `INSERT ... ON CONFLICT (...) DO UPDATE`. read_status는 원본 `orUpdate(['read_at','updated_at'])` 그대로 충돌 시 is_read 미갱신. globally_quoted_identifiers는 JPA에만 적용되므로 native SQL은 소문자 식별자 그대로.
- 두 컨트롤러(`HostEventController`/`EventController`)가 같은 `/event` prefix를 쓰지만 메서드 경로가 달라 공존(Spring 매핑 충돌 없음, 리터럴 세그먼트 우선).

## FE 사이드바 미표시 — NestJS Guard 적용범위 vs Spring 인터셉터 전역등록 (해결)

admin 로그인 시 사이드바가 통째로 사라진 이슈. **BE 권한 차단 회귀버그**였음.

- FE `SideNav`는 `if(!permissions) return []` — redux `auth.permissions`가 없으면 메뉴 0개. permissions는 `GET /users/role/permission?type=ADMIN&platform=DMOVE`(→ `DMoveModule[]`) 응답으로 채워진다.
- 그 호출이 **403**(HTTP 200 body code 403)을 반환 → permissions 미설정 → 메뉴 전멸.
- **근본 원인 — NestJS Guard 적용 모델의 미묘함**: `@Roles()` 데코레이터는 *메타데이터일 뿐*이고, `RolesGuard`가 `@UseGuards`로 **그 컨트롤러에 명시적으로 걸려야만** 실제 검사가 일어난다. 원본 `user.controller`/`setting.controller`는 `@UseGuards(AuthGuard('jwt'), JwtAuthGuard)`만 있고 RolesGuard가 없어서 → `@Roles(SUPER_ADMIN)`가 **사실상 무효**(모든 인증 유저 통과)였다.
- Spring 변환 때 `RolesInterceptor`를 `WebConfig`에 **전역 등록**하고 `@Roles` 있으면 무조건 검사하게 만들면서, 원본엔 없던 차단을 추가 → admin(roleid=null)이 403.
- **교훈**: NestJS `@UseGuards`는 컨트롤러/메서드 단위 선택 적용인데, Spring `HandlerInterceptor`는 전역 등록이 기본이라 **"가드가 어느 컨트롤러에 걸렸나"** 정보가 변환에서 누락되기 쉽다. 데코레이터(`@Roles`)만 보고 옮기면 적용범위가 과해진다.
- **수정**: `@RolesGuarded` 마커(= 원본 `@UseGuards(RolesGuard)`)를 도입. `RolesInterceptor`는 빈 클래스에 이 마커가 있을 때만 `@Roles`를 검사. 원본에서 RolesGuard가 걸렸던 admin 컨트롤러 2개에만 마커를 달아 적용범위를 1:1 재현. → admin이 role/permission 200, 사이드바 복구. FE는 무수정.

## 미해결 / 다음 단계

- **모든 기능 모듈 변환 완료.** 남은 것은 부가 작업: UserCommand(@MessagePattern 전송수단 미결정/보류), Flyway V1 baseline SQL 덤프, 단위 테스트 포팅, 정상 로그인 E2E(zabbix 연동 USER), AWS 실연동.
- 정상 로그인 E2E(zabbix 연동 USER 계정)는 아직 — 위조 ADMIN 토큰으로 Zabbix 연동만 실증함.
- ⚠️ 보류: FE 사이드 패널(네비 메뉴) 미표시 — 권한/메뉴 API 응답 형식 의심, FE 콘솔/네트워크 정보 받으면 대조.
