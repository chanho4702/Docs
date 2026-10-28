# DB 모니터링(ZM-172) 작업 진행 이력 — 2026-10-19 ~ 2026-10-28

> 시간순 이력. 현재 위치·남은 일은 `report_zm172-progress_2026-10-26.md`, 설계 정본은 `devdesign_db-monitoring.md`, 계약은 `contract_db-monitoring.md`, 검수 원문은 `review_db-monitoring-design.md`(요청·결과)와 `_archive/features/premium/db-monitoring/*_codex.md`.
> 코드: BE 워크트리 `C:\worktrees\zm-172-be`(브랜치 `ZM-172`, **10-28 master에 rebase·ff 병합 완료, master HEAD `b8c528c`, 미푸시**) · 발급기 `moveseye-license-issuer` `16cfa81`(`maxDbTargets` 클레임, ZM-175 푸시에 포함). FE 코드 없음.

## 1. 한눈에

| 날짜 | 무엇 | 결과 |
|---|---|---|
| 10-19 | 시장 조사·설계 v1 | 설계 v1 → 코덱스 1차 검수 |
| 10-22 | 설계 v1.2·v1.3·v2.0 + 코덱스 2~4차 + **1·2차 커밋** + 코덱스 5차 | P0 착수본 확정, 코어 경계·마스킹·PG 권한 검사 |
| 10-23 | 로컬 Docker PG16(5436) P0 실측 R1-PG + 코어 폴러 프레임 + 코덱스 6·7차(보류) | 계약 시험본·코어 규칙 전건 반영 |
| 10-26 | 코어 → Gradle 모듈 분리 + 코덱스 8차(보류→반영) + **3차 커밋·master rebase** + **4차 커밋**(J1 PG lease·writer·checkpoint, V90) | J1이 우리 PG에 저장 |
| 10-27 | **5차**(보존 v2.5·V91) · **6차**(폴러 구동) · **7차**(PG 어댑터) · **8차**(typed 파티션 표 V92) | 실 PG16을 한 tick에 끝까지 긁어 파티션 표까지 적재 |
| 10-28 | 코덱스 9차(🔴 9) + **9차 커밋**(안정화) + **10차 커밋**(WS-1 대상 관리 API) + **master rebase·ff 병합** | 관리자가 API로 등록·활성화하면 데이터가 흐른다. master HEAD `b8c528c` |

## 2. 커밋 이력(ZM-172 — 10-28 master `df1b39f` 위로 rebase 뒤 ff 병합, 해시는 rebase 뒤 값)

| 차수 | 날짜 | 해시 | 내용 | 검증 |
|---|---|---|---|---|
| 1 | 10-22 | `f2d3318` | 착수 — `maxDbTargets` 클레임(BE 검증·`LicenseContractTest`), 수집 코어 경계(`spi` 6종·ArchUnit), SQL 마스킹 토크나이저, PG 접속 분류·권한 검사, `/dbm/targets/test-connection`·`check-capabilities` 도구 EP | 단위·ArchUnit |
| 2 | 10-22 | `b58edeb` | 코어 보강 — 마스킹 토크나이저 확장, 접속 분류, PG 권한 검사(C/S/Q/P/L), `maxDbTargets` 원시 JSON 타입 검증 | 코덱스 5차 반영 |
| 3 | 10-26 | `ad29023` | 코어를 Gradle 모듈 `dbm-collector-core`로 분리(프로덕션 의존 0), 폴러 프레임 안정화(코덱스 6·7·8차 반영) | 코어 128, master rebase |
| 4 | 10-26 | `c3f3068` | J1 PG `PgLeaseClient`(UPDATE 한 문장)·`PgBatchWriter`(FOR SHARE 소유권 검증 → 배치·행·checkpoint 한 트랜잭션)·`PgCheckpointStore`, Flyway **V90** `dbm_core` 표 7개 | `DbmJ1PgStoreIT` 7 |
| 5 | 10-27 | `75ace5e` | 보존 v2.5 — APM 파티션·보존 구현체를 `premium.common`으로 추출(APM은 껍데기), `dbm_retention` 잡·**V91** 시드, 보존 계단(원본 2일·1m 7일·5m 30일·1h 400일) | APM 회귀 141 |
| 6 | 10-27 | `5e33e0e` | 폴러 구동 — `DbmPollerManager`(fast/slow 레인 스레드, `SmartLifecycle`), `PgConfigSource`(30s 캐시·라이선스 거부 스냅샷), `CodecSecretResolver`, `GET /dbm/poller/status` | IT 12 → DBM 42 |
| 7 | 10-27 | `b576f18` | PostgreSQL 어댑터(코어 `adapter/pg`) — 세션 5s·블로킹 10s·카운터 15s·Top SQL 60s, 차분·Top N·`__other__`, SQL 텍스트 보호 한 지점(`PgSqlText`), 버전 분기 12/13/14/17 | 실 PG16 end-to-end(`realTargetCollects`) |
| 8 | 10-27 | `a0d28d6` | typed 파티션 표 **V92** — 차원 3표·사실 4표(일 파티션, FK 없음), `DbmPartitionService`·`PgTypedRowStore`, 1m 쓰기 시점 UPSERT, 보존 6단계, 임시 `dbm_sample_row` 제거 | DBM 46 + ArchUnit 17 |
| 9 | 10-28 | `b6f622f` | 수집 안정화(코덱스 9차 🔴 N2·N3·N4·N5·N8·N9) — 종료 뒤 tick 차단·세대 무효화, 전역 차원 UPSERT 키 정렬, Top SQL 상위 문장만·퇴출 반영 완전성, 파티션 DDL `NOT_SUPPORTED` 경계, 참조 중 차원 보존 | 코어 142, 재현 테스트 6 |
| 10 | 10-28 | `b8c528c` | WS-1 대상 관리 API — `DbmTargetAdminService`(등록·수정·삭제·자격증명 저장·권한 검사 저장·활성화 admission D17·라이선스 사용량), `DbmSecretCodec`(`enc:v2:<keyId>:`), `LicenseStatus.maxDbTargets`, 컨트롤러 10 EP, `DBM_NOT_FOUND`·`DBM_CONFLICT` | 앱 113(실 PG16 활성화 end-to-end) |

10-28 master `df1b39f` 위로 rebase(충돌 1건 `application-it.yml` 양쪽 블록 유지) → **ff 병합, master HEAD `b8c528c`**(미푸시). 병합 트리 테스트: 코어 142 · 앱 118(실 PG16 end-to-end 2건은 env 게이트 채워 재실행 15/15 통과) 통과. 위 해시는 rebase 뒤 값(옛 해시 `3ea1e66`…`5490711`은 폐기).

## 3. 검수 이력(코덱스, 기본 gpt-6.1-sol high · 8차만 gpt-6-astra)

| 차수 | 날짜 | 대상 | 판정 → 처리 |
|---|---|---|---|
| 1 | 10-19 | 설계 v1 | 🔴 4 → v1.1 반영 |
| 2 | 10-22 | 설계 v1.2(Datadog 대조) | 🔴 C1~C9 → 전건 반영 |
| 3 | 10-22 | 설계 v1.3(§16 인사이트 카탈로그) | 반영 |
| 4 | 10-22 | 설계 v2.0 착수본 | "P0 조건부 가능" → V4-1~V4-7 반영(v2.1) |
| 5 | 10-22 | 1차 커밋 코드 | 반영 → 2차 커밋 |
| 6 | 10-23 | 코어 폴러 프레임(미커밋) | **보류** 🔴 18 → 전건 반영 |
| 7 | 10-23 | 6차 재검수 | **보류** 유지, N1~N16 → 전건 반영 |
| 8 | 10-26 | 모듈 분리 + 7차 반영(astra) | **보류**(런타임 🔴 4) → 전건 반영 → 3차 커밋 |
| 9 | 10-28 | 4~8차 커밋 전체 | **"WS-1 전 수정 🔴 9"** → 사용자 결정 A: N2·N3·N4·N5·N8·N9 반영(9차 커밋), N1 이월(계약 §1.10 전제), N6·N7 WS-10 V93 |

6·7·8·9차 연속 보류 — "같은 기능 2회 연속 반려면 멈추고 묻기" 규칙에 따라 9차는 자동 반영하지 않고 비용 묶음(소 5·중 1·스키마 2·이월 1)으로 제시 → 사용자 "A".

## 4. 결정 이력(사용자)

| 날짜 | 결정 | 영향 |
|---|---|---|
| 10-22 | Q22 `maxDbTargets` 별도 클레임(D17), Q26 PG/MySQL 플랜 GA 제외(D18), Q27 namespace 상한, Q3/Q29 RAC, Q12 원격 수집기 J2 GA 편입(D21), Q13 만료 후 조회 차단 유지(D22) | v2.0 착수본 |
| 10-23 | P0 실측은 로컬 Docker PG16(시험 서버 10.220.0.13 금지) | `env_p0-test-db.md` |
| 10-26 | 코어 모듈 분리를 P0로 앞당김, 8차는 astra로 | `dbm-collector-core` |
| 10-27 | 보존은 APM/Zabbix 계단(디스크 예산 정책 삭제), 디스크 큐는 J2(P3b)로, `dbm_poller` 스위치 행은 WS-4로 | v2.5·§6.3 |
| 10-27 | "뭐 일단 계속 진행해 커밋할거 커밋하고" — master rebase는 뒤로, 준비된 것은 커밋 | 7·8차 커밋 |
| 10-28 | WS-10보다 WS-1 먼저(실데이터가 흘러야 롤업 검증이 실측) · 코덱스 9차 결과는 **A(안정화 먼저 → WS-1 커밋)** | 9·10차 커밋 |
| 10-28 | "현재 작업 메인 브런치로 병합하자" — ZM-172 10커밋을 master로 | rebase + ff 병합(푸시는 별도) |

## 5. 환경·측정 사실(재현에 필요한 것)

- IT DB: 도커 `dmove-postgres-test` 5433 `moveseye_it`, V1~V92 전량 Flyway. 시험 대상 PG16: `dbm-test-pg16` 5436(`appdb`, `moveseye_mon`/`moveseye_nomon`, 비밀번호는 스크래치패드 secret 파일에만).
- 명령: 코어 `./gradlew.bat :dbm-collector-core:test` · 앱 `./gradlew.bat :test --tests 'com.dmove.moveseye.premium.dbm.*' …`(`:test` 콜론 필수) + `DBM_IT_PG_*` env. Gradle이 test마다 XML을 지우므로 묶음은 한 번에.
- 10-28 최종: 코어 142 · 앱 113(DBM 62 + ArchUnit 17 + 라이선스 포트 11 + 스케줄러 23) 통과.
- 함정 기록: PG 누적 통계 비동기 flush(~1s) · `pg_stat_statements` 텍스트 `$n` 정규화(S↔Q 연결 키는 `query_id`) · JWT 토큰에 username 없음(`userid`) · record 생성자 멀티라인 호출은 grep으로 안 잡힘 · 테스트 JVM native OOM은 외부 폭주 프로세스 먼저 · heredoc이 백슬래시·따옴표를 먹음(스크립트는 파일로).

## 6. 이월 목록(10-28 기준)

| 어디로 | 항목 |
|---|---|
| WS-10 롤업 | V93: `_5m`(30일)·`_1h`(400일) 표 + **N6 1m 표 노드 식별 · N7 `interval_ms` 합** · `dbm_activity_1m` AAS · 롤업 워터마크 `PartitionDropGuard` · 보존 키 2개 · 🟡 N15·N16 |
| WS-4 FE | 등록 마법사·대상 목록(계약 §2.1~2.3) · `DBM_ADMIN` 역할 좌표(역할 JSON 백필 + FE 평탄화 키) · `dbm_poller` 스위치 행·스케줄러 표 |
| WS-1 잔재 | 폴러 전용 커넥션 풀·대상별 워커 · `credential_status=DECRYPT_FAILED`(CHECK 확장) · 키 교체 배치 · `dbm_audit` · 🟡 N10(typed 표 진단 열)·N11(row_count 보정)·N14(evict 동시성) |
| HA 검증 | N1 lease `now()` 잠금 대기 뒤 판정(계약 §1.10 전제) · 2노드 RTO 실측 · 레인 스레드 실기동(BE 재기동은 지시 시) |
| 결정 대기 | 푸시(병합은 10-28 완료, BE 재기동 실측은 지시 시) · Q35 차원 텍스트 400일 · 접속점 수정 = 통계 연속성 단절인가 |
