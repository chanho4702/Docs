# 아키텍처 평가 — 설치형(on-premise) 관점 + 스케일아웃 대비

- 작성일: 2026-08-21
- 범위: `moveseye-be-spring` · `moveseyee_fe` · `moveseye-ai` · 배포 산출물 전반
- 방법: 코드·설정·파이프라인 실물 조사 2회(배포/패키징 실태, 스케일아웃 제약 요소) + 설계 이력 대조
- 상태: 평가 완료, 조치는 미착수 (권고만 수록)

---

## 한 줄 요약

> **제품 코드는 설치형인데 배포는 아직 SaaS다.** 애플리케이션 내부(라이선스·마이그레이션·시크릿·엔진 포트화)는 설치형 요건을 갖췄으나, 고객사에 건넬 "설치 패키지"가 실물로 존재하지 않는다. 스케일아웃은 Spring BE는 소규모 수정으로 가능하고, moveseye-ai는 의도적 단일 인스턴스 설계이며, 실질 비용은 데이터 계층(Postgres·Redis 이중화)에 있다.

---

## Part 1. 설치형 관점 평가

### 1.1 강점 (잘 갖춰진 것)

| 항목 | 내용 | 근거 |
|---|---|---|
| 구성 단위 단순 | Spring BE 단일화 완료 → 설치 단위 = JVM 앱 + 정적 FE + Postgres + Redis + (고객) Zabbix | 2026-06-22 Spring 단일 채택 |
| 업그레이드 기반 | Flyway V1~V26 번호 누락 없이 연속, `baseline-on-migrate: true`(V1), Hibernate `ddl-auto: none` — 스키마 변경 경로가 Flyway 단일 | `db/migration/`, `application.yml` |
| 라이선스 커널 | RS256 공개키 jar 내장(`resources/license/public-1.pem`), 발급기(개인키)는 별도 저장소(`moveseye-license-issuer`), 게이트 누락은 ArchUnit이 빌드에서 강제, 만료 후 단계적 차단(EXPIRED→ARCHIVED). 오프라인 검증 가능 | `license/` 패키지, `build.gradle.kts` |
| 안전한 운영 기본값 | Swagger off·cookie secure/Strict·파괴적 Zabbix 동기화 off·AI dev endpoint 고정 off. 필수 값(`JWT_SECRET`·`CREDENTIAL_ENCRYPTION_KEY` 등) 없으면 기동 거부(fail-fast) | `application.yml` env 기본값 |
| 자격증명 암호화 | AES-256-GCM `enc:v1:`, 설치본마다 다른 키 (ZM-105) | `SettingSecretCodec` |
| 엔진 포트화 | `engine-api`/`engine-zabbix` 분리, app→구현 컴파일 의존 차단 — 고객사별 데이터소스 다양성 대응 여지 | 멀티모듈 구조 |
| AI 프로바이더 중립 | ANTHROPIC/OPENAI(호환 게이트웨이)/AZURE_OPENAI/OLLAMA — 폐쇄망 대응 경로 존재 | `moveseye-ai` `ai.llm.*` |

### 1.2 공백·리스크 (우선순위 순)

**R1. 설치 산출물 부재 — 최대 공백 🔴**
- 현 배포는 bitbucket-pipelines가 self-hosted 서버에 직접 `docker run`(BE, 호스트 80→컨테이너 3000) / FE `dist/*`를 `/var/www/html`에 복사. **자사 운영형이지 설치형 배포가 아님.**
- 고객사 전달물(docker-compose 번들, 오프라인 이미지 tar, `.env` 템플릿, 설치 스크립트)이 리포에 없음.
- `moveseye-ai`는 **Dockerfile 자체가 없음** — README의 compose 서술은 계획 단계.
- FE 서빙: 문서는 nginx(SPA 폴백 + `/api/` 프록시), 실제 파이프라인은 Apache. **리포에 실물 nginx.conf 0개.**
- `moveseye-ai/README.md` §설치형 배포("고객은 URL 하나만 본다" — `/`=FE, `/api/`=BE:3000, `/ai/` 등=AI:3100)가 맞는 목표 그림이나 구현 파일 없음.

**R2. JVM 스택 이원화**
- BE = Boot 3.3.5, AI = Boot 4.0.7 + Jackson 3. 설치형에서 패치/CVE 대응 대상 런타임이 2종.
- AI가 BE와 같은 Postgres 공유(Flyway 히스토리만 `flyway_schema_history_ai` 분리)는 설치 단순화 측면에서 적절.
- AI 기본 프로바이더 `ANTHROPIC` = 외부 egress 필수 → 폐쇄망 기본값 부적합. 설치 시나리오(온라인/폐쇄망→OLLAMA) 분기 필요.
- AI 아티팩트 기본 경로가 `java.io.tmpdir` — 컨테이너 재시작 시 소실, 볼륨 정의 없음.

**R3. 구 NestJS 잔재가 배포 경로에 잔존**
- Spring 파이프라인에 구 컨테이너(`moves-be`) 정리 루프 잔존(컷오버 잔재).
- `.env`에 죽은 키 다수: `FIREBASE_*`, `NOVU_API_KEY`, `TWILIO_*`, NestJS compose용 키들.
- `start_3001.ps1`이 구 레포 경로(`moveseye-be/.env`)를 읽음. `vault/docker-compose.yml` 미사용 잔존.
- 고객사에 소스가 넘어가는 모델이면 `moveseye-be/` 전체가 노이즈+잠재 리스크 → 산출물 배제 기준 필요.

**R4. "프로필 미지정 = 운영" 전략의 취약점**
- `application-prod.yml` 없음(BE·AI 공통). default가 운영 기본값, 차이는 env 기본값으로 처리 — 동작은 하나, 고객 엔지니어가 `SPRING_PROFILES_ACTIVE=dev`로 기동하면 Swagger on + cookie insecure.
- 대안: dev 프로파일을 운영 jar에서 제외하거나 명시적 prod 프로파일 도입.

**R5. 설치 문서 drift·미검증**
- `moveseye-docs/operations/설치-배포-가이드.md`: "최신 V20" 기준(실제 **V26**), 헤더에 `production deployment unverified`.
- 프로덕션 런북 draft, 결정 필드 전부 TBD. **클린 머신 설치 리허설 미실시.**

**R6. 기타**
- Redis는 캐시가 아니라 **인증 필수 의존성**(세션·refresh 토큰·rate limit·Zabbix 토큰, 참조 클래스 13개) — 소실 시 전원 재로그인. 설치 가이드 백업 대상에서 빠져 있음(명시 필요).
- 라이선스 상수 4파일 사본(BE↔발급기) — 양쪽 `LicenseContractTest`로 방어 중이나 구조적 취약.
- Flyway 롤백 전략 TBD.

### 1.3 권고 (순서대로)

1. **설치 번들 1벌 실물화**: compose(nginx + be + ai + postgres + redis) + 오프라인 이미지 tar + `.env` 템플릿. → R1·R3·R5의 절반이 같이 풀림.
2. **moveseye-ai Dockerfile 신설** (1의 선행 조건).
3. **클린 머신 설치 리허설 1회** → 결과로 설치 가이드를 V26 기준 재검증.
4. **dev 프로파일 운영 배포 차단** + NestJS·Vault 잔재/`.env` 죽은 키 정리.

---

## Part 2. 스케일아웃 대비 평가

### 2.0 전제: 처리량이 아니라 HA다

- BE 읽기 대부분이 Zabbix API 프록시 → **BE 증설은 Zabbix 부하를 분산하지 않는다**(병목 이동일 뿐). 이벤트 이력 12초/2000건 절단도 Zabbix 측 제약.
- 설치형 모니터링에서 스케일아웃의 실익 = **HA(무중단)·롤링 배포**. 아래는 active-active 2대 기준 평가.

### 2.1 계층별 준비도

| 계층 | 준비도 | 해야 할 일 |
|---|---|---|
| FE(정적) | ✅ 완료 | 없음 |
| Spring BE | 🟢 높음 | S1·S2 (아래), 선택 S3 |
| moveseye-ai | 🔴 낮음(의도적, 설계 M3) | 스케일아웃 대신 active-passive 권고 |
| Postgres·Redis | ⬜ 없음 | 복제/Sentinel — **실질 비용의 대부분** |
| Zabbix(고객 자산) | 외부 | 고객 Zabbix HA에 전체 가용성 종속 — 문서 명시 |

### 2.2 Spring BE — 이미 갖춰진 것

- **인증 상태 전부 Redis, 인메모리 폴백 없음**: 세션 visitorId(`AuthService`), refresh 토큰(`RefreshTokenService`), rate limit(`AuthRateLimiter` — `RATE_LOGIN:`/`RATE_OTP:`), Zabbix API 토큰(`REDIS_USER_API_TOKEN` 해시, `RedisZabbixSessionStore`가 유일 구현). 액세스 토큰 = stateless JWT 쿠키 → **sticky 세션 불필요**.
- **스케줄러/배치 = DB lease(V21) 보호**: `SchedulerLeaseService.acquire()`(만료 lease 조건부 UPDATE 탈취 → INSERT, `REQUIRES_NEW`) → `SchedulerManager.execute()` 단일 경유. 대상 = `event_sync`·`event_cleanup`·`report_weekly/monthly/cleanup`·`user_sync`·`AssetSyncJob` 전부. 정기 실행·"지금 실행" 모두 lease 경유.
- **로컬 파일 쓰기 0건**: 비용 일괄 업로드도 파일을 DB bytea(V18 `file_content`)에 저장, 진행 중 heartbeat(V19) 조건부 UPDATE 0행이면 `CostBulkUploadLeaseLostException`으로 즉시 중단(fencing). 리포트도 DB 테이블. 로컬은 로그뿐.
- **SSE/WebSocket 없음**(알림 = FE 폴링) → LB 특수 설정 불필요.

### 2.3 Spring BE — 수정 필요 항목

**S1. 비용 일괄 업로드 디스패치의 인메모리 의존 🔴**
- `CostBulkUploadJobService.submit()` → 접수한 인스턴스의 `@Async("costBulkUploadExecutor")`(core1/max2/queue32/AbortPolicy)가 처리. DB의 queued를 집어가는 폴링은 **기동 시점(ApplicationRunner)에만** 존재.
- → 처리 인스턴스가 죽으면 그 잡은 재기동 전까지 방치. 큐 용량도 인스턴스별로 따로 놈.
- 조치: DB 폴링 워커로 전환. `claimQueued`(조건부 단일 UPDATE)·heartbeat fencing·`failStaleRunning`(5분 stale) 등 어려운 부품은 이미 있음 — 배선만 남음.
- 부수 효과: **단일 인스턴스에서도 크래시 복구가 좋아짐** (지금 미리 해도 손해 없음).

**S2. scheduler_lease에 heartbeat 없음 🔴**
- TTL 30분 고정(`SchedulerLeaseService`, 주석에 heartbeat 부재 명시). 크래시 시 해당 잡 최대 30분 잠김. 반대로 30분 초과 배치는 lease 만료로 **타 인스턴스가 중복 시작** 가능(release는 0행 경고만).
- 조치: 실행 중 주기적 TTL 연장(heartbeat) 추가. 역시 단일 인스턴스에서도 이득.

**S3. (선택) 60초 volatile 캐시 3개의 인스턴스 간 불일치**
- `SignedKeyLicenseProvider.cache`(라이선스 판정, refresh는 자기 JVM만), `DeviceClassificationRegistry.snapshot`(주석에 "현 운영은 단일 인스턴스라 수용" 명시), `SettingBackedZabbixConnectionResolver.cachedUrl`.
- 최대 60초 stale — 성격상 대부분 수용 가능. 라이선스 등록 직후 UX만 신경 쓰이면 Redis pub/sub 무효화 추가.

**참고(수정 불필요)**
- `EventSyncService.isSyncing`(volatile, JVM 로컬) — lease가 앞단에서 막으므로 무해. 리포트 쪽 동일 플래그 2개는 V21 때 이미 제거됨.
- lease 없는 유일한 `@Scheduled` = `CostBulkUploadJobService.purgeExpiredJobs()`(매시 15분) — 멱등 DELETE라 동시 실행 무해.
- 토큰 재발급 락(`JwtAuthFilter`) TTL 3초 — Redis 기반이라 인스턴스 간 동작, Redis 장애 전환 순간 경합 가능성만 인지.

### 2.4 moveseye-ai — 의도적 단일 인스턴스 (설계 M3)

인스턴스에 묶이는 지점:

| 지점 | 내용 | 파급 |
|---|---|---|
| 툴 실행 승인 게이트 | `PendingActionGate` 인메모리 `CompletableFuture` 블로킹 대기, 승인은 별도 HTTP(`POST /ai/actions/{id}/confirm`) | 승인이 다른 인스턴스로 가면 `AI_ACTION_NOT_PENDING`, 원 턴은 타임아웃까지 대기 |
| 아티팩트 파일 | `ArtifactStore` 본문 = 로컬 디스크(`{tmpdir}/moveseye-ai/artifacts`), 메타만 DB(V3) | 생성≠다운로드 인스턴스면 `NoSuchFileException`. 정리 잡이 DB 행은 전역 삭제·파일은 자기 디스크만 → 고아 파일 |
| SSE 채팅 스트림 | `SseEmitter` + 전용 스레드풀, 분 단위 연결 | 세션이 인스턴스 고정 |
| busy 표시 | `ConversationStore` 로컬 캐시만 조회 | 타 인스턴스 진행 턴을 false로 보고 |
| OAuth 인가 코드 | `PendingAuthStore` 인메모리 10분(주석 명시) | 인스턴스 간 공유 안 됨 |
| AI 자체 `@Scheduled` 4개 | lease 없음(아티팩트/대화/사용량 정리, 프로바이더 refresh) | 전 인스턴스 각자 실행(정리류는 대체로 멱등) |

이미 분산 대비된 것: 대화 정본 = Postgres(`persistTurn`), 대화 단위 락 = Redis `SET NX`+Lua CAS(`ConversationLock`, TTL 15분), 감사 로그 = DB.

**권고: AI는 스케일아웃하지 않는다.**
- 부하 = 대부분 LLM 응답 대기(I/O) → 스레드풀 수직 확장으로 충분.
- HA 필요 시 active-passive(대기 인스턴스 + 헬스체크 전환).
- 굳이 active-active면 최소 경로 = 대화 ID 기반 sticky 세션(게이트·SSE 우회) + 아티팩트 DB bytea 이전. 정당화할 부하 시나리오가 현재 없음.
- BE→AI 설정 push(`AiServerNotifier`)가 단일 URL이라 복수 대면 한 대만 수신 — 15분 폴백 폴링으로 수렴하게 이미 설계됨.

### 2.5 데이터 계층 — 실질 비용

- **Postgres**: 단일. streaming replication + 장애 전환 필요. 설치형에서 고객사마다 세팅·운영하는 것이 실질 비용.
- **Redis**: 인증 전부 여기 → 죽으면 전원 로그인 불가. Sentinel 필요.
- **Zabbix**: 제품 밖. 전체 체인 가용성이 고객 Zabbix HA에 종속 — 영업/설치 문서에 명시.

### 2.6 로드맵 제안

| 시점 | 조치 |
|---|---|
| 지금 (첫 설치 고객 전) | 스케일아웃 투자 보류. 단 **S1(워커 폴링화)·S2(lease heartbeat)는 선반영** — 단일 인스턴스 크래시 복구 개선 겸용, 손해 없음 |
| HA 요구 고객 등장 시 | BE 2대 active-active(nginx LB) + AI active-passive + Postgres 복제 + Redis Sentinel |
| 처리량 문제 발생 시 | BE 증설 전에 Zabbix 측 병목 확인·캐싱 계층 검토 (BE 증설은 병목 이동일 뿐) |

---

## Part 3. API 게이트웨이 판단 (2026-08-21 추가)

### 결론

> **리버스 프록시(nginx) 수준의 게이트웨이는 필수, 전용 API Gateway 제품(Spring Cloud Gateway·Kong 등)은 현 단계 미채택.** "게이트웨이를 단다"는 방향 자체는 유효하며, 그 역할의 구현체를 전용 제품이 아닌 nginx로 정한 것.

### 근거

1. **게이트웨이의 가치를 이미 보유** — 인증(JWT 쿠키, BE 검증 + AI는 BE internal-token 경유), rate limit(Redis, `AuthRateLimiter`), 라우팅(정적 3갈래: `/`=FE, `/api/`=BE:3000, `/ai/`=AI:3100)이 전부 기존 구조에 있음. 서비스 2개 규모에서 중앙화 실익 없음.
2. **설치형에서 구성요소 추가 = 지원 비용** — Spring Cloud Gateway면 JVM 프로세스 3개(이미 Boot 3.3+4.0 이원화 리스크 R2 존재), Kong이면 이기종 스택+자체 DB. 요청 홉 +1. 얻는 것 없이 패치·기동·장애 대응 대상만 증가.
3. **인증 설계와 충돌 위험** — 라이선스 게이트는 인증 **뒤**(P18: 앞이면 401 refresh가 잠금화면 오인), visitor-id 검증·refresh 흐름이 BE에 정교하게 배선됨. 인증을 게이트웨이로 올리면 이 로직을 복제/분할해야 하며 버그 표면만 확대.

### 재검토 조건 (이때 다시 꺼낸다)

- 외부 개발자 대상 **공개 API 판매** 시작(API 키 발급·고객별 쿼터·사용량 과금이 본업이 되는 시점).
- 수집 엔진 gRPC 서버 분리(현재 유예, 승격 조건은 `devdesign_collector-engine.md`)가 승격되는 등 **서비스가 4~5개 이상**으로 늘어날 때.

그 전까지 nginx가 게이트웨이 역할을 겸한다(설치 번들의 리버스 프록시 + 스케일아웃 시 LB — Part 1 권고 1, Part 2 로드맵과 일관).

---

## 부록: 조사 근거 요약

- 배포: `moveseye-be-spring/Dockerfile`(멀티스테이지, temurin17, EXPOSE 3000), `bitbucket-pipelines.yml`(BE `docker run --env-file /home/.env -p 80:3000` / FE `cp dist/* /var/www/html`), `moveseyee_fe/.gitlab-ci.yml`(dev/qa 서버 직빌드), `moveseye-docs/operations/설치-배포-가이드.md`(V20 기준, unverified).
- 프로파일: `application.yml`(default=운영) + `application-dev.yml`만 존재, prod 없음. 로깅 분기는 `logback-spring.xml`(운영=INFO+롤링, 30일/2GB).
- Redis 필수성: `RedisClientService` 참조 프로덕션 클래스 13개(auth 5, zabbixadmin 2 외).
- 스케일아웃 상세 근거: `SchedulerLeaseService`·`SchedulerManager`·`BuiltInJobs`·`CostBulkUploadJobService/Worker`·`ArtifactStore`·`PendingActionGate`·`ConversationStore`·`ConversationLock` (파일:라인 수준 조사 2026-08-21).
