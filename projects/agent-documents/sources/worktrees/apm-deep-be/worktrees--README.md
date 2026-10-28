# moveseye-be-spring

`moveseye-be`(NestJS 10 + TypeORM + PostgreSQL)를 **Spring Boot 3.3 / Java 17 / Gradle(Kotlin DSL)** 로 1:1 포팅한 백엔드.
Zabbix JSON-RPC 연동 기반 인프라 모니터링 대시보드(DMOVE)의 API 서버이며, 기존 `moveseyee_fe`(React)와 **API 계약을 완전히 보존**하는 것을 최우선 원칙으로 변환했다.

> 후속 작업·알려진 이슈·운영 주의사항은 **[CLAUDE.md](worktrees--CLAUDE.md)** 참조.

---

## 기술 스택 매핑 (NestJS → Spring)

| 영역 | NestJS (원본) | Spring (포팅) |
|------|--------------|---------------|
| 프레임워크 | NestJS 10 (Express) | Spring Boot 3.3.5 (MVC) |
| 언어/런타임 | TypeScript / Node | Java 17 |
| 빌드 | npm | Gradle 9.2.1 (Kotlin DSL) |
| ORM | TypeORM 0.3 | Spring Data JPA / Hibernate |
| DB 마이그레이션 | TypeORM migrations | Flyway (baseline, `ddl-auto: none`) |
| 캐시 | nestjs-redis | Spring Data Redis |
| 인증 | passport-jwt + Guards | Spring Security Filter + Interceptor |
| JWT | @nestjs/jwt (jsonwebtoken) | **auth0 java-jwt 4.4.0** (HS256, Node 토큰 호환) |
| 검증 | class-validator | Jakarta Bean Validation (`@Valid`) |
| 예외 | ExceptionFilter | `@RestControllerAdvice` (GlobalExceptionHandler) |
| 설정 | ConfigService | `@ConfigurationProperties` |
| 메일 | @nestjs-modules/mailer | spring-boot-starter-mail (`@Async`) |
| AWS | @aws-sdk/client-ec2·cloudwatch | AWS SDK v2 (BOM 2.28.29) |
| 스케줄 | @nestjs/schedule | `@Scheduled` (`@EnableScheduling`) |
| API 문서 | @nestjs/swagger | springdoc-openapi 2.6 |

**Zabbix 연동**: `ZabbixClient`(RestClient) 기반 JSON-RPC 2.0 클라이언트 + 서비스 레이어.

---

## 모듈 구조

```
moveseye-be-spring/          root = app (Boot 부팅 모듈, REST·JPA·Redis)
├── engine-api/              수집 계약 — engine/(중립) + zabbix/(전용) + proto 정본
└── engine-zabbix/           Zabbix 구현 — 어댑터·RPC 래퍼·키 카탈로그
```

app → `engine-api`(compile) · app → `engine-zabbix`(**runtimeOnly**, 컴파일 차단).
자세한 내용은 각 모듈의 `README.md`/`CLAUDE.md`.

## 변환 진행 현황 — 전 모듈 완료

| 모듈 | 상태 | 포팅 내용 |
|------|------|----------|
| 공통 기반 | ✅ | `ApiResult<T>`, 예외 표준화, `ErrorCode`(86종), Redis 래퍼, syncTime 주입, BasePageDto/PaginationResponseDto/SortDirection/DateRangeFilterDto, CommonUtils/MetricUtils |
| Security / JWT | ✅ | JwtAuthFilter, JwtTokenProvider(auth0 java-jwt), RolesInterceptor(+`@RolesGuarded` 마커), VisitorIdCheckInterceptor, `@CurrentUser` |
| 엔티티 | ✅ | User, UserGroup, HostGroup, Otp, Role, PermissionSchema, UserUserGroup, Setting, Email, EventProblem, EventReadStatus, UsergroupHostgroup (잔여: Device, Notification — 해당 기능 미사용 / RecentlyViewed는 FE localStorage 대체로 2026-07-16 제거, V9 마이그레이션) |
| auth (6 EP) | ✅ | login/logout/forgot-password/resend/reset-password/verify |
| user (26 EP + 10분 동기화) | ✅ | 사용자·그룹·호스트그룹 CRUD, my-profile, roles, zabbix 연동 |
| email | ✅ | JavaMailSender + `@Async`, RESET 템플릿. SMTP 미설정 시 PENDING 저장 후 skip |
| zabbix / zabbix-sync | ✅ | JSON-RPC 클라이언트 + 서비스 7종 + 동기화. **실 Zabbix 7.0.6 연동 검증** |
| setting (4 EP) | ✅ | Zabbix/클라우드 접속정보 CRUD. Zabbix 변경 시 슈퍼어드민 토큰 강제 갱신 |
| admin (user 3 + role 2 EP) | ✅ | Zabbix 사용자/그룹/역할 조회 + Dmove 연동 사용자 생성. `@PostConstruct` 기본 admin 시드 |
| host (11 EP + 메트릭 6종 + event) | ✅ | host 집계, cpu/memory/disk/network/interface/response-time, host event (mark-view/recently-viewed 2 EP는 FE localStorage 대체로 2026-07-16 제거) |
| aws (5 EP) | ✅ | AWS SDK v2(EC2/CloudWatch): regions/vpcs/ec2s/ec2-dashboard/ec2 |
| event 최상위 (8 EP + 2 cron) | ✅ | acknowledge/problems/bells/problems:id/:id/:id-acknowledge/list-previous/isRead + 동기화. **실 Zabbix 데이터 E2E 검증** |

> UserCommand/EmailCommand(`@MessagePattern`)는 **원본에서도 transport 미연결 dead code**로 확인되어 변환 생략. (근거는 CLAUDE.md)

---

## 핵심 API 계약 보존 스펙

모든 변환은 **엔드포인트 경로·HTTP 메서드·파라미터명·JSON 필드/구조/타입·상태코드·에러 포맷**을 원본과 1:1로 유지한다.

- **응답 래퍼**: 모든 응답은 `ApiResult<T>` (`status: "success"|"error"`, `code`, `errorCode`, `message`, `data`).
- **에러도 HTTP 200**: `401(Unauthorized)`만 실제 상태 코드를 반환. **`403(Forbidden)`도 HTTP 200 + body code 403으로 반환되는 원본 버그 동작을 그대로 보존**.
- **syncTime**: 성공 응답에만 `syncTime` 필드 주입 (`SyncTimeCarrier` / 응답 advice).
- **JWT**: HS256, `JWT_SECRET` 그대로 — NestJS 발급 토큰과 상호 검증 가능. payload의 `roleid: null`은 클레임 생략으로 처리.
- **bcrypt**: `$2a`/`$2b` cost 10 호환 — 기존 해시 그대로 검증.
- **날짜 직렬화**: `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` 고정 패턴 (moment `.toISOString()` 동일 출력, UTC 전제).
- **DB 스키마**: 기존 TypeORM 산출 스키마를 그대로 사용 (Flyway baseline, `ddl-auto: none`).

### user 모듈 계약 특이사항 (⚠️)
- `PUT /users/:id`·`PUT /users/my-profile` 응답 data는 TypeORM `UpdateResult`(`{generatedMaps, raw, affected}`) 또는 null — `UpdateResultDto`로 보존.
- `GET /users/zabbix/user-detail`은 유일하게 ApiResult 래핑 없이 DTO 직접 반환(+syncTime) — `SyncTimeCarrier`.
- `GET /users/roles` 정렬 quirk: sortBy≠name이면 `name DESC`가 1차 정렬로 항상 적용.
- status 정렬(목록 API)은 원본대로 방향 반전.
- 사용자 필드 업데이트 시 status가 항상 ACTIVE로 재설정(비활성 그룹 소속 제외).
- `user_usergroups` 정션 이중 매핑 유지: `User.userGroups`(@ManyToMany owning, 사용자 기준) + 명시 엔티티 `UserUserGroup`(그룹 기준 멤버 교체).

### event 모듈 계약 특이사항 (⚠️)
- occurrenceTime/resolutionTime은 `moment.toISOString()`과 동일한 `.SSS'Z'` String, 미해결 resolutionTime은 문자열 `"Pending"`.
- `EventProblemResDto`는 problems(트리: info/causeEventId/children/actionGroups)와 bells(status/isRead) 흐름을 공유 — 미사용 필드는 `@JsonInclude(NON_NULL)` 제외, 원본 노출 필드 `status`도 보존.
- `ProblemDetailResDto`의 is-접두 boolean(isAcknowledged/isSuppressed/isHostDisabled)은 `Boolean` 래퍼로 두어 JSON 키 보존(Lombok primitive getter의 "is" 제거 회피).
- 동기화 upsert는 `JdbcTemplate` + PostgreSQL `ON CONFLICT`. read_status는 충돌 시 is_read 미갱신(원본 `orUpdate(['read_at','updated_at'])`).

### NestJS 대비 의도된 차이 (⚠️)
1. **비밀번호 해싱**: 원본 `@BeforeInsert/@BeforeUpdate`의 매 저장 재해싱 잠재버그 → 비밀번호 변경 시에만 서비스 레이어에서 인코딩.
2. **JWT 만료**: `JWT_EXPIRATION_TIME`(ms 문자열) 대신 `JWT_EXPIRATION_SECONDS`(초 숫자).
3. **기본 접근 정책**: NestJS는 가드 없는 라우트 기본 공개 / Spring은 deny-by-default → 공개 라우트는 `SecurityConfig`에 명시.
4. **OTP 토큰 검증 실패 메시지**: Node `jsonwebtoken` vs java-jwt 메시지 문자열 차이 가능.
5. **JWT 라이브러리**: jjwt의 RFC 7518 키 길이 검증(256bit↑)에 막혀 **auth0 java-jwt**로 교체(HMAC 동일, Node 토큰 호환).
6. **Zabbix API URL의 DB 관리 (2026-07-16 확장)**: `POST /settings/zabbix`에 optional `url` 필드 추가(원본은 username/password만). `ZabbixClient`가 호출 시점에 `Setting(ZABBIX).value.url` 우선 → env(`ZABBIX_API_URL`) 폴백으로 URL을 해석한다(60초 TTL 캐시, 설정 저장 시 즉시 무효화). url 미전송/공백이면 jsonb에 키를 넣지 않아 기존 FE와 하위호환. 저장 시 기존 슈퍼어드민 재로그인이 새 URL로 나가므로 잘못된 URL은 저장 시점에 실패·롤백된다. ⚠️ URL을 실제로 바꾸면 기존 사용자들의 Zabbix auth token이 무효화되어 재로그인이 필요하다.

---

## DB / Flyway

- `src/main/resources/db/migration/V1__baseline.sql` = dev DB 전체 스키마 덤프(테이블 14 + enum 11 + 시퀀스/PK/FK/인덱스).
- 빈 DB: V1 실행으로 스키마 생성 / 기존 DB: `baseline-on-migrate=true`, `baseline-version=1`로 V1 스킵. 이후 변경은 `V2__` 부터.
- `public."user"`/`"lastName"` 등 따옴표 식별자는 JPA `globally_quoted_identifiers`와 일치.

---

## 검증 상태 (2026-06-10)

- 전 모듈 빌드(`gradlew build`) + 기동(`bootRun`) + 라우트 매핑(인증거부 401) 통과.
- **실 Zabbix 7.0.6(`dmove.co.kr`) 연동 검증**: 로그인→Zabbix API 토큰 발급→`/event/problems` 200(total 335) 등 실데이터 응답.
- **Flyway V1 baseline**: 빈 DB에 적용 검증(테이블/enum/제약 생성).
- **단위 테스트**: 핵심 5개 클래스(CommonUtils/MetricUtils/HostStatus/Auth/Event) JUnit5+Mockito 그린.

---

## 빌드 / 실행

JDK 17 기준 실행

```powershell
.\gradlew.bat build              # 빌드(테스트 포함)
.\gradlew.bat build -x test      # 테스트 제외
.\gradlew.bat test               # 단위 테스트

# 필요 환경변수: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, JWT_SECRET, REDIS_HOST, REDIS_PORT,
#                ZABBIX_API_URL, ZABBIX_SADMIN_USERNAME, ZABBIX_SADMIN_PASSWORD, BASE_PATH, FE_PATH_WEB ...
.\gradlew.bat bootRun
```

- Swagger UI: `http://localhost:3000/api`
- 상세 결정·교훈: 옵시디언 `claude-experiences/projects/moveseye/2026-06-10-spring-conversion.md`
