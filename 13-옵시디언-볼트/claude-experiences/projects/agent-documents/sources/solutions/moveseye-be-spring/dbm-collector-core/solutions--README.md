# dbm-collector-core — DB 모니터링 수집 코어

DB 모니터링(프리미엄, ZM-172)의 **수집기 심장부**다. BE 안에서 도는 내장 폴러(J1)와 고객 망에 설치하는 원격 수집기(J2)가
**같은 jar**를 쓴다. 대상 DB의 시스템 뷰를 JDBC로 읽어 세션·락·카운터·쿼리 통계를 배치로 만들고, lease·seq·checkpoint
규칙에 맞춰 바깥(spi 구현)에 넘긴다. **데이터를 어디에 저장하는지, 어떤 스레드로 도는지는 모른다.**

> 설계 정본: `C:\solutions\_workspace\features\premium\db-monitoring\devdesign_db-monitoring.md`(§3.6 코어 공유·§5 폴러·§17 착수)
> 계약: 같은 폴더 `contract_db-monitoring.md`(§1 모델·사유표·lease 규칙, §4 코어 증명 표)
> 시험 환경: 같은 폴더 `env_p0-test-db.md`(로컬 Docker PG16, LiveIT 환경변수)

---

## 1. 모듈 규칙 — 한 줄

**프로덕션 의존은 JDK(`java..`·`javax..`)만.** Spring·JPA·Jackson·slf4j·lombok·PG 드라이버·다른 moveseye 모듈 전부 금지.

| 막는 장치 | 무엇을 잡나 |
|---|---|
| `build.gradle.kts` — 프로덕션 의존 0 | Spring·JPA·Jackson·드라이버를 import하면 **컴파일 실패** |
| `DbmCoreArchitectureTest`(이 모듈) | `java..`·`javax..` 밖 JDK 내부(`sun..`·`jdk.internal..`), 테스트 의존이 main으로 새는 것, 스레드·실행기 직접 생성, 코어 패키지 밖 클래스 혼입 |
| `DbmCoreArchitectureTest`(app, `premium.dbm`) | app이 마스킹 내부·`local` 시험 구현을 직접 쓰는 것 |

왜 이렇게까지 하나: J2는 Spring 없는 단일 jar로 고객 망 안에서 돌아야 하고(§3.6), BE 빈·설정·리포지토리를 알면 가져갈 수 없다.
로깅도 코어 안에서 하지 않는다 — 수집기 로그에 SQL 원문이 새는 경로를 코어 밖 한 지점으로 모으기 위해서다.

## 2. 패키지 지도 (`com.dmove.moveseye.premium.dbm.collector.core`)

| 패키지 | 역할 | 바깥이 쓰나 |
|---|---|---|
| `spi` | 경계 인터페이스 6종 — `BatchWriter`·`LeaseClient`·`CheckpointStore`·`ConfigSource`·`SecretResolver`·`CollectorClock`. J1은 PG·Codec·BE 설정으로, J2는 HTTPS·파일·키스토어로 구현 | **구현 대상** |
| `runtime` | 폴러 프레임 `CollectorRuntime` — 레인(FAST=세션·락 / SLOW=카운터·쿼리통계) tick, lease 획득·갱신·fencing, seq 예약, checkpoint 연속성, 백오프, 정지·거부·중단. **스레드 없음**(`tick(Lane)`을 호출자가 스케줄) | J1 조립·J2 런타임 |
| `runtime.EngineAdapter` | 엔진별 채집 계약 — `checkpointKey`·`collect(kind, conn, ctx)`. 어댑터는 `adapter.<engine>`에 | 어댑터 구현 |
| `adapter.pg` | PG 접속·권한 검사기(`PgCapabilityChecker`). 채집 어댑터는 WS-3 | 접속 테스트 EP(P0) |
| `jdbc` | `ConnectionSpec`·`JdbcConnector`(DriverManager·TLS 모드·실패 분류 `AUTH/NETWORK/TLS/DATABASE_NOT_FOUND`) | 접속 테스트 EP |
| `capability` | 권한 검사 리포트 모델(S·L·Q·C·P 등급) | 접속 테스트 EP |
| `masking` | SQL 리터럴 마스킹·명령 유형·fingerprint(§5.5). **큐 진입 직전 한 지점에서만** | ✗(app 금지) |
| `local` | spi의 메모리/파일 구현 — `InMemoryLeaseClient`·`InMemoryBatchWriter`·`InMemoryCheckpointStore`·`FileCheckpointStore`·`StaticConfigSource`·`MapSecretResolver`·`ManualClock`. "메모리/파일만으로 코어 구동" 증명(P1a DoD) + J2 checkpoint 파일 | 테스트·J2만(app 금지) |

## 3. 핵심 계약 요약 (자세한 것은 계약서 §1)

- **배치와 checkpoint는 한 커밋**: `BatchWriter.write(Batch, Checkpoint)`. 코어는 `CheckpointStore.save`를 직접 부르지 않는다 — writer가 소유권 검증·저장·checkpoint를 같은 원자 경계에서 처리한다(§5.2 규칙 6, §5.4).
- **`WriteResult(status, reason)`**: `REJECTED`·`CONFLICT`는 사유 필수(생성자 불변식). `STALE_LEASE`/`GENERATION_MISMATCH`면 lease 포기(fenced), `IDEMPOTENCY_CONFLICT`면 대상 정지, `VERSION_MISMATCH`/`SCHEMA_INVALID`면 런타임 중단(halt), 그 외 REJECTED는 거부 상태로 전부 반납.
- **lease**: 비어 있는 lease는 같은 run이라도 새 epoch. 유효 중 같은 `(owner, runId)` 재요청만 token·epoch 유지. 갱신은 epoch 불변. seq는 대상·epoch 전체에서 증가하고 시도마다 소비된다.
- **시계**: wall(관측 시각)과 monotonic(스케줄·만료) 분리. `observed_at`은 채집 시작 경계.
- **AUTH 실패**: 즉시 정지 게시, 백오프 없음, `credential_version` 증가 또는 명시 재개로만 풀린다.

## 4. 빌드·테스트

```bash
cd moveseye-be-spring
./gradlew.bat :dbm-collector-core:test                 # 단위 + ArchUnit (LiveIT는 환경변수 없으면 skip)

# 실 PG 실측(env_p0-test-db.md §3) — 변수 없으면 게이트가 실패시킨다
export DBM_IT_PG_REQUIRED=true DBM_IT_PG_HOST=localhost DBM_IT_PG_PORT=5436 DBM_IT_PG_DB=appdb DBM_IT_PG_TLS=DISABLED
export DBM_IT_PG_MON_USER=moveseye_mon DBM_IT_PG_MON_PASSWORD='…' DBM_IT_PG_NOMON_USER=moveseye_nomon DBM_IT_PG_NOMON_PASSWORD='…'
./gradlew.bat :dbm-collector-core:test --tests 'com.dmove.moveseye.premium.dbm.collector.core.adapter.pg.*'
```

LiveIT가 조용히 skip된 결과를 "통과"로 읽지 말 것 — `DBM_IT_PG_REQUIRED=true`로 돌린 게이트가 실패하지 않았는지 본다.

## 5. 앞으로 여기에 들어오는 것 / 들어오지 않는 것

| 들어온다(코어) | 들어오지 않는다(app 또는 J2 런타임) |
|---|---|
| 엔진 어댑터 4종(`adapter.pg/mysql/mssql/oracle`, WS-3·P1b·P2) | J1 PG 구현(`BatchWriter`·`LeaseClient`·`CheckpointStore` — `premium.dbm.collector.j1`) |
| 플랜 구조 파서·데드락 XML 마스킹(§5.5) | Spring 스케줄러·빈 조립·`/dbm/**` EP·Flyway DDL |
| 품질 판정·정규화 | J2 서비스 런타임(systemd/Windows)·디스크 큐·HTTPS push·키스토어 — P3b 별도 모듈 |

## 6. 이력

| 날짜 | 내용 |
|---|---|
| 2026-10-22 | `premium.dbm.collector.core` 패키지로 시작(ZM-172 1·2차 커밋 — jdbc·capability·masking·adapter.pg·spi) |
| 2026-10-26 | **Gradle 모듈로 분리**(P0, 설계 §3.6은 P3b 물리 분리였으나 파일 36개일 때 옮기는 쪽이 싸고 경계를 의존 그래프가 강제) + `runtime`·`local`·ArchUnit 3규칙 |
