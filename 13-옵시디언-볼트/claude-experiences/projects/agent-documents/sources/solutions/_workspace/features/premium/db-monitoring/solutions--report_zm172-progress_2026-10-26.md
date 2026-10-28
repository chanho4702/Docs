# DB 모니터링(ZM-172) 진행 보고 — 2026-10-28 기준(10-26 작성, WS-3·WS-1·코덱스 9차 반영)

> 읽는 사람: 이 기능의 현재 위치를 알고 싶은 사람(PM·FE·검수자). 설계 정본은 `devdesign_db-monitoring.md`(v2.4), 계약은 `contract_db-monitoring.md`, 시험 환경은 `env_p0-test-db.md`, 검수 이력은 `review_db-monitoring-design.md`, **시간순 작업 이력(커밋·검수·결정)은 `history_zm172-worklog.md`**.
> 코드: BE 워크트리 `C:\worktrees\zm-172-be`(브랜치 `ZM-172`, master `5d677e3` 위 **8커밋**(…5차 `75ace5e` 보존 · 6차 `5e33e0e` 폴러 구동 · 7차 `b576f18` PG 어댑터 · 8차 `a0d28d6` typed 표 V92) · **9차 `b6f622f` 안정화(코덱스 9차 N2·N3·N4·N5·N8·N9) · 10차 `b8c528c` WS-1 대상 관리 API**, 2026-10-28), **10-28 master `df1b39f` 위로 rebase 뒤 ff 병합 — master HEAD `b8c528c`, 미푸시**) + 발급기 `16cfa81`(미푸시). FE 코드는 아직 없다.

## 0. 한 줄 답 — "끝났나?"

**아니다. 전체 Phase P0~P4 중 P0 실측 일부와 P1a 첫 스프린트의 BE 밑단(수집 코어·저장 계약·J1 PG 저장소)까지 왔다.** 고객이 보는 것(대상 등록 화면·세션/락/Top SQL 화면·알람)은 하나도 없다. **J1 폴러는 돈다**(10-27)이고 **PG 어댑터·typed 저장(WS-3)도 끝났다** — 실 PG16을 대상으로 한 tick에 세션·락·카운터·Top SQL이 우리 PG 파티션 표까지 들어간다. **10-28에 대상 관리 API(WS-1)가 작업 트리에 들어왔다**(등록·자격증명·활성화 admission — 실 PG16 활성화 end-to-end 통과, 미커밋). 즉 "관리자가 API로 대상을 등록·활성화하면 데이터가 흐른다"까지 왔고, 없는 것은 **롤업 5m/1h(WS-10)·화면(WS-4)** 이다. 코덱스 9차 검수는 커밋된 8커밋에 🔴 9건(N1~N9)을 냈다 — 반영은 사용자 결정 뒤(§6.1). 지금 있는 것은 "수집기가 어떤 규칙으로 돌고 어디에 어떻게 저장하는가"를 **코드와 테스트로 고정한 뼈대**다. 설계 어림으로 GA(P1a~P3b)는 300~440 사람-일이고, 지금까지 쓴 것은 P0 몫(22~34)과 P1a 일부다.

## 1. 끝난 것 (코드·테스트로 증명됨)

| 영역 | 내용 | 증명 |
|---|---|---|
| **WS-1 대상 관리 API(10-28, `b8c528c`)** | `DbmTargetAdminService`(등록 `enabled=false`·수정·삭제·자격증명 저장 version+1·저장된 자격증명 권한 검사→`dbm_capability`·**활성화 admission** 사전 판정→접속·검사→필수 S·C·L→advisory lock 재판정) · `DbmSecretCodec`(`enc:v2:<keyId>:`, v1 읽음, 평문 거부) · `LicenseStatus.maxDbTargets` · 컨트롤러 10 EP · `DBM_NOT_FOUND`·`DBM_CONFLICT` | `DbmTargetAdminIT` 9(MockMvc·실 JwtAuthFilter·실 라이선스 시드, **실 PG16 활성화 end-to-end**) + `DbmTargetAdmissionIT` 5(상한 1·0·여유·누락·기능 없음) + `DbmSecretCodecTest` 5 |
| 라이선스 | `maxDbTargets` 클레임(발급기 + BE 4파일 사본) | `LicenseContractTest` 양쪽 |
| 수집 코어 모듈 `dbm-collector-core` | J1(BE)·J2(원격 수집기)가 공유하는 코어 — spi 6종(`BatchWriter`·`LeaseClient`·`CheckpointStore`·`ConfigSource`·`SecretResolver`·`CollectorClock`), 런타임 `CollectorRuntime.tick(Lane)`(스레드 없음·lease 10s 갱신·epoch/seq·fencing·AUTH 정지·백오프·실행 세대·거부/halt), JDBC 접속 분류·TLS, SQL 리터럴 마스킹 토크나이저(4방언 71 fixture), PG 권한 검사(C/S/Q/P/L) | 모듈 테스트 **128건**(런타임 31·ArchUnit 3·실 PG 16.15 LiveIT). **프로덕션 의존 0** — Spring·JPA·PG 드라이버를 import하면 컴파일 실패 |
| 저장 계약 | 배치 식별 `(targetUid, kind, epoch, seq)`·관측 메타·쓰기 결과 매핑·lease 규칙 7개·checkpoint 커밋 경계·payload 다이제스트(`spi.BatchPayloadDigest`) | 계약서 §1, `CollectorRuntimeTest` 31건(§4 증명표) |
| J1 PG 저장소 | Flyway **V90 `dbm_core`**(`dbm_target`·`dbm_endpoint`·`dbm_credential`·`dbm_capability`·`dbm_sample_batch`·🧪`dbm_sample_row`·`dbm_delta_checkpoint`) + `premium.dbm.collector.j1`의 `PgLeaseClient`(UPDATE 한 문장)·`PgBatchWriter`(소유권 검증+배치+행+checkpoint 한 트랜잭션)·`PgCheckpointStore` | `DbmJ1PgStoreIT` **7건** 실 PG(빈 DB에 V1~V90 전량 Flyway) |
| 보존 정리(v2.5) | **APM 보존·파티션 구현체를 `premium.common`으로 추출**(`DailyPartitionService`·`PartitionDropGuard`·`RetentionOptions`·`SchedulerOptionsReader`·`RetentionStepRunner` — APM은 껍데기, 공개 API·테스트 불변) + DBM `premium.dbm.retention`(`DbmRetentionDays`·`DbmRetentionService`·`DbmRetentionJob`) + **V91 `dbm_retention` 시드**(매일 02:00, 배치 7일·checkpoint 30일 DELETE). 보존 계단은 APM/Zabbix와 같은 모양(원본 2일·1m 7일·5m 30일·1h 400일·사건 400일, D23) | `DbmRetentionJobIT` 4건(실 PG) + `DbmRetentionDaysTest` 3 + ArchUnit 2(dbm↛apm·common↛기능) + APM batch·archive·license ArchUnit 전부 통과(141건) · APM 전체 3,009건 중 1건(`ApmStuckRequestLedgerIT` 시간 단언, 단독 재실행 통과·변경 영역 무관) 외 통과 |
| **J1 구동 조립(WS-2 잔여, 10-27)** | `premium.dbm.collector.DbmPollerManager`(노드 1개, fast/slow 레인 스레드 각 1 — `dbm-poller-fast/slow`, `SmartLifecycle` 기동·종료 시 lease 반납, 레인별 tick 통계, 거부/halt 전이 로그) · `collector.j1.PgConfigSource`(`dbm_target`+`dbm_endpoint` BE 대상 30s 캐시 스냅샷, 버전 = 행 해시, **라이선스 매 호출** → FULL 아님 `LICENSE_EXPIRED`·기능 없음 `FEATURE_DENIED` 거부 스냅샷, 조회 실패 시 이전 스냅샷 유지) · `collector.j1.CodecSecretResolver`(`dbm_credential` → `SettingSecretCodec`, 캐시 없음, 복호화 실패 null+WARN 1회) · `DbmPollerProperties`(`app.dbm.poller.*`) · **`GET /dbm/poller/status`**(`DbmPollerController`, 관리자) | `DbmPollerManagerIT` **5건**(첫 tick → lease 획득·자격증명 복호화·`ADAPTER_MISSING` FAILED 배치 2건 저장·상태; stop → lease 반납·재획득 새 epoch; 비활성 → 반납; **라이선스 비활성 → 거부·전부 반납·재허용 새 epoch**; 상태 EP 관리자 200/USER 403) · `PgConfigSourceIT` 4 · `CodecSecretResolverIT` 3 · ArchUnit +1(런타임 조립은 `DbmPollerManager`만) — DBM 전체 **42건** + `LicenseArchitectureTest` 10 통과 |
| **PG 어댑터(WS-3 1단계, 10-27)** | 코어 `adapter/pg/PgEngineAdapter`(PG 12+, kind 4종) — S `PgSessionCollector`(`pg_stat_activity` 클라이언트 백엔드 중 idle 아님 + idle blocker, 상한 1,000 결정적 우선순위 blocker→대기→경과, `pg_blocking_pids`, 세션 키 pid+backendStartMs) · L `PgLockCollector`(대기 락마다 waiter→blocker 간선, 관계 이름은 접속 DB oid만 해석) · C `PgCounterCollector`(pg_stat_database 합·bgwriter/checkpointer(17 분기)·WAL(14+)·archiver 누적 → checkpoint 차분, 세션 상태별·락·max_connections 게이지, 메트릭 이름 `pg.<뷰>.<열>` 상수 카탈로그) · Q `PgQueryStatCollector`(`pg_stat_statements` 서버 1회 스캔 500 → native `(dbid,userid,queryid,toplevel)` 차분 → Top 50 + `__other__`(otherComplete·scanCapped·excludedNatives·dealloc), stats_reset(14+)·절반 이상 감소 = 전역 리셋 baseline, 새·감소 native는 그 구간만 제외) · `PgSqlText`(S·Q 텍스트 보호 한 지점 — 마스킹·상한 절단·`<insufficient privilege>`·설정 미확인 시 해시만) · `DeltaWindow`(순수 차분) · `PgServerInfo`(접속당 1회: 버전·노드 `inet_server_addr:port`·`pg_postmaster_start_time`·`standard_conforming_strings`). 버전 분기 12/13/14/17. 앱 `DbmAdapterConfig`가 빈으로 올려 폴러에 끼움 | 코어 `PgEngineAdapterLiveIT` **4건 실 PG16(5436)**: 다른 접속의 실행 SQL이 세션 행으로(리터럴 `?`), advisory lock 대기가 간선+idle blocker 행으로, C·Q baseline→델타. `DeltaWindowTest` 4·`PgCollectorSqlTest` 4(버전 분기·텍스트 보호·checkpoint 값 모양) · 앱 `DbmPollerManagerIT.realTargetCollects`(env 있을 때): **한 tick에 S·L OK + C·Q BASELINE 배치 4건·checkpoint 2건이 우리 PG에 적재** — J1 end-to-end 첫 성공 · 코어 140 + 앱 43 통과 |
| **typed 파티션 표(WS-3 2단계, 10-27)** | **V92 `dbm_typed_tables`** — 차원 3표(`dbm_query_dimension` fingerprint→마스킹 텍스트 · `dbm_dimension_text` 사용자/DB/client/application 대상 스코프 · `dbm_query_native` PG `(dbid,userid,queryid,toplevel)`→dimension) + 사실 4표 일 RANGE 파티션(`dbm_session_sample` 2일 · `dbm_lock_edge` 2일 · `dbm_metric_1m` 7일(쓰기 시 분 버킷 count·sum·min·max UPSERT) · `dbm_query_stat_1m` 7일(Top 50/분 + `__other__` 행에 완전성 플래그)) · 🧪`dbm_sample_row` **제거** · `dbm_retention` options에 `sessionRawDays 2·metric1mDays 7·queryStat1mDays 7·dimensionIdleDays 400` 추가(기존 값 보존). `premium.dbm.store.DbmPartitionService`(공통 `DailyPartitionService` 껍데기 — 표 4개, writer가 그날 파티션 보장(auto-commit DDL, 트랜잭션 밖) + 보존 잡 선생성 D+2, DROP은 보존 잡만 — `ApmArchiveGateArchTest` 호출처 목록에 등재). `collector.j1.PgTypedRowStore`(행 키→열 매핑 한 곳, 차원 UPSERT는 배열 `unnest` 한 문장씩·중복 키 선접기, writer 트랜잭션 안). `DbmRetentionJob` 단계 6개(partitionsAhead·sampleBatches·checkpoints·rawPartitions·rollup1mPartitions·dimensions) | `PgTypedRowStoreIT` **5건**(세션 행+차원 참조·가려진 SQL·blocker 배열 / 락 간선 / 카운터 같은 분 count=2·sum·min·max / Top SQL native UPSERT·분 합·`__other__` AND/OR 플래그 / 표 없는 kind는 row_count=0) · `DbmRetentionJobIT` 6(파티션 DROP 2일·7일 단계별, 차원 400일 텍스트 NULL·삭제, 선생성, V92 시드·`dbm_sample_row` 없음) · `DbmJ1PgStoreIT` 7(typed 행·롤백) · `realTargetCollects`(typed 행 수 = 배치 row_count, 오늘 파티션) — DBM **46건** + ArchUnit(아카이브 게이트 7·라이선스 10) 통과 |
| 도구 EP | `POST /dbm/targets/test-connection`·`/check-capabilities`(저장 없음, 관리자) | 계약 §2 실측 응답 |
| 시험 환경 | 로컬 Docker PG 16(5436) 계정 2종, R1-PG 최소 권한 실측 통과 | `env_p0-test-db.md` |
| 검수 | 코덱스 1~8차(8차는 gpt-6-astra) 🔴 전건 반영 | `review_db-monitoring-design.md` |

커밋 5개(ZM-172): `f2d3318` 착수(클레임·코어 경계·마스킹·PG 권한 검사·도구 EP) → `b58edeb` 코어 보강 → `ad29023` 코어 Gradle 모듈 분리·폴러 프레임 안정화 → `c3f3068` J1 PG lease/writer/checkpoint + V90 → `75ace5e` 보존 v2.5 공통 구현체·`dbm_retention` V91. → `5e33e0e` 폴러 구동(WS-2 잔여).

## 2. 안 끝난 것 (Phase·WS 순)

| 순서 | WS | 남은 일 | 비고 |
|---|---|---|---|
| **다음** | WS-10 롤업 | **1m→5m→1h 롤업 잡**(`dbm_rollup`, APM `ApmRollupService` 패턴 — 워터마크·`sum(count)·sum(sum)·min(min)·max(max)`) + `_5m`(30일)·`_1h`(400일) 표(V93) + `dbm_activity_1m`(세션 샘플 → wait class × query × user 시간 가중 AAS) + 롤업 워터마크 `PartitionDropGuard`(1m을 5m에 접기 전엔 DROP 금지) + 보존 키 2개 | WS-3·WS-1 ✅. **그 전에 코덱스 9차 🔴 N1~N9 반영 여부 결정**(§6.1) — N6·N7은 V93 스키마라 롤업 표와 같은 migration에 넣는 것이 자연스럽다 |
| | WS-1 | ✅ 대상 CRUD·자격증명 저장(enc:v2)·capability 저장·활성화 admission·라이선스 사용량(10-28, 10차 `b8c528c`) | 남은 것: `DBM_ADMIN` 권한 좌표(WS-4)·`dbm_audit`·폴러 전용 풀·대상별 워커·`DECRYPT_FAILED` |
| | WS-26 | `maxDbTargets` **admission**(원자적 활성화·하향 갱신·HA 동시 활성화)·`/dbm/license/usage`·배너 | 클레임만 있음 |
| | WS-6 | 품질 3축·`at=` 재생 계약·client 구조화·명령 유형·승인 태그 | 부분 모델만 |
| | WS-4 | **FE 전부** — 개요·상세(AAS·활성 세션·락 트리)·SQL 표·관리 마법사(`/database-monitoring/**`·`/setting/database-monitoring/**`) | 코드 0 |
| | WS-5 | Zabbix 호스트 발견·링크 | — |
| 이월 | WS-2 잔재 | 폴러 전용 대상 DB 커넥션 풀(지금은 tick마다 접속 1개 열고 닫음 → WS-1) · `scheduler_setting(dbm_poller)` on/off 행·스케줄러 표 노출(→ WS-4, 지금 행만 심으면 `SchedulerManager`가 매 기동 "job bean 없음" WARN — "상주 잡" 표현과 함께) · namespace 레인 · 디스크 큐(**J2 P3b의 것** — J1 writer는 로컬 PG라 우리 PG가 죽으면 lease도 30s 안에 끊겨 버퍼가 할 일이 없다) · `credential_status=DECRYPT_FAILED` 기록(WS-1) | 노드 on/off는 `app.dbm.poller.enabled` |
| P1b | WS-7~11·25 | MySQL/MariaDB 어댑터·알람 규칙 11종·트래퍼 배달·**보존 탭·롤업(1m→5m→1h)·DbmPartitionService 껍데기**(정리 잡·V91은 ✅)·설정 스냅샷 | 디스크 예산 정책은 v2.5에서 삭제 |
| P2 | WS-12~15·23 | Oracle·SQL Server·캐시 플랜 뷰어·클러스터 | — |
| P3/P3b | WS-16~24·27 | 재생 UX·플랜 변경·APM 상관·리포트·**원격 수집기 J2**(코어 모듈은 준비됨) | — |
| P4 | — | 50 대상 부하·HA RTO 실측·보안 심사·지원표 | — |
| P0 미실시 | R2·R4·R5·R6·R7·R9·R10 | 부하·용량·트래퍼·드라이버 법무·OTel·system_health·RAC 모의 | 환경(VM) 게이트 |

## 3. 지금 구조 (한 그림)

```
moveseye-be-spring/
  dbm-collector-core/            ← Gradle 모듈, 프로덕션 의존 0 (J1·J2 공유)
    spi/      BatchWriter·LeaseClient·CheckpointStore·ConfigSource·SecretResolver·CollectorClock·BatchPayloadDigest
    runtime/  CollectorRuntime(tick·lease·seq·fencing·AUTH 정지·백오프·세대)·EngineAdapter·Lane·RuntimeStatus
    jdbc/ capability/ masking/ adapter/pg(권한 검사)   local/(메모리·파일 시험 구현)
  src/main/java/.../premium/dbm/
    api/           도구 EP 2개(저장 없음) · DbmPollerController(GET /dbm/poller/status) · DbmPollerStatusResponse
    collector/     DbmPollerManager(레인 스레드 2개, SmartLifecycle) · DbmPollerProperties(app.dbm.poller.*) · DbmPollerStatus   ← 이번(WS-2 잔여)
    collector/j1/  PgLeaseClient · PgBatchWriter · PgCheckpointStore · PgConfigSource · CodecSecretResolver · PgTypedRowStore(행→typed 표)   ← 우리 PG(dbm_*)·Codec
    retention/     DbmRetentionDays · DbmRetentionService · DbmRetentionJob    ← dbm_retention(V91·V92 키 6개, 단계 6개)
    store/         DbmPartitionService(공통 DailyPartitionService 껍데기 — 표 4개)   ← WS-3 2단계(10-27)
  src/main/java/.../premium/common/
    partition/     DailyPartitionService · PartitionDropGuard   ← APM ApmPartitionService에서 추출(APM은 껍데기)
    retention/     RetentionOptions · SchedulerOptionsReader · RetentionStepRunner  ← APM Days/Policy/Job에서 추출
  dbm-collector-core/.../adapter/pg/   PgEngineAdapter · PgSessionCollector · PgLockCollector · PgCounterCollector · PgQueryStatCollector · PgSqlText · DeltaWindow · PgServerInfo   ← WS-3 1단계(10-27)
    (없음)         롤업 1m→5m→1h·5m/1h 표(WS-10)·quality/·alert/
  src/main/resources/db/migration/V90__dbm_core.sql · V91__dbm_retention_job.sql · V92__dbm_typed_tables.sql   ← 표 6개 · 보존 잡 시드 · 차원 3 + 파티션 4(dbm_sample_row 제거)
```

실행 흐름: `DbmPollerManager` 레인 스레드 → `CollectorRuntime.tick(FAST|SLOW)` → `PgConfigSource.current()`(30s 캐시 + 라이선스) → `PgLeaseClient.acquire`(PG UPDATE 한 문장) → `CodecSecretResolver` → 대상 DB 접속(tick마다 1개 — 전용 풀은 WS-1) → `PgEngineAdapter.collect`(S·L·C·Q, 마스킹은 `PgSqlText` 한 지점) → `PgBatchWriter.write(batch, checkpoint)`(PG 한 트랜잭션 — 배치 메타 + `PgTypedRowStore` typed 표 행·차원 UPSERT + checkpoint). **전부 있다** — `DbmPollerManagerIT.realTargetCollects`가 시험 PG16을 대상으로 한 tick에 4 kind를 우리 PG까지 적재한다(10-27). 비어 있는 것은 롤업 5m/1h(WS-10)·대상 CRUD(WS-1)·화면(WS-4).

## 4. 이번 커밋(`c3f3068`)의 설계 선택 — 왜 이렇게

- **lease는 UPDATE 한 문장**: 판정(`WHERE`)·증가(`SET` CASE)·결과(`RETURNING`)가 같은 문장·같은 `now()`에서 일어나 "읽고 비교하고 쓰는" 사이의 인계가 없다. 시각은 DB 시계만 — 노드 시계 차를 믿지 않는다(§5.2).
- **writer는 대상 행 `FOR SHARE`**: 소유권 검증과 INSERT가 한 트랜잭션. 인계 UPDATE는 커밋을 기다리고, 같은 대상의 fast·slow 레인은 서로 막지 않는다. 멱등은 `ON CONFLICT DO NOTHING RETURNING` 뒤 저장된 digest 비교 — 예외로 트랜잭션을 깨지 않는다.
- **checkpoint는 writer 트랜잭션 안에서만 전진**: 따로 전진하면 "배치는 저장, checkpoint는 옛값"에서 다음 관측이 겹치는 델타를 새 seq로 보내 이중 집계된다(§5.4). IT가 checkpoint 실패 시 배치 롤백을 단언.
- **`dbm_sample_row`는 임시(🧪)**: 보호된 행을 jsonb로 보관해 수신 경계를 먼저 증명했다. WS-3 typed 표가 생기면 이전·제거.
- **payload digest를 코어 spi로**: 앱이 `local..`(시험 구현)을 못 쓰게 막은 ArchUnit 규칙이 "이건 계약 함수"임을 드러냈다 — J1·J2 수신기·메모리 writer가 같은 함수를 써야 재전송이 서로 DUPLICATE가 된다.

## 4.5 보존 규칙 v2.5 — 왜 이렇게 (2026-10-27)

- **APM·Zabbix와 같은 계단**: 원본(세션·락 5초 샘플) 2일 → 1분 7일 → 5분 30일(신설) → 1시간 추세 400일 → 사건·알람·감사·차원 400일. 1년 보관 의무는 1h·사건 400일이 덮는다. 추세 행은 합뿐 아니라 **min·max·sample_count**(Zabbix trends·APM `apm_metric_1h` 격) — 평균만 남기면 1년 뒤 피크에 답을 못 한다.
- **용량의 무게는 5초 원본이 아니었다**: 1분 집계 30일(27GB)과 Top SQL 매분 200개(30GB+32GB)였다. 1분을 7일로, Top SQL을 50/분·200/시로 조이면 50대상 ≈130~175GB → **≈85~95GB**, 10대상 ≈20GB.
- **디스크 예산 상한·최소 보장 일수·수집 자동 완화·사건 구간 파티션 보호는 삭제**: APM에 없고, 자동 단축을 아예 하지 않으면 그 장치들의 존재 이유가 사라진다(코덱스 🔴8의 성립 조건 소멸). 대체는 사용량 GB 표시·설치 가이드 "서버 디스크를 Zabbix로 감시"·공용 디스크 가드 백로그·P3 증거 내보내기.
- **구현체는 하나**: APM의 파티션·보존 구현체를 `premium.common`으로 올리고 APM은 표 목록·메트릭 게이트만 남은 껍데기로. DBM은 표 목록·일수 record·단계 목록만 얹는다. 두 도메인이 사본을 들면 한쪽만 고쳐질 때 "만든 다음 날 지우는" 사고가 난다. ArchUnit이 dbm↛apm·common↛기능·공통 DROP 호출처를 고정.
- **지금 지우는 것**: V90 비파티션 표만(`dbm_sample_batch`+row 7일, `dbm_delta_checkpoint` 30일 — 5,000건씩 DELETE). typed 파티션 표의 DROP·롤업은 WS-3/WS-10에서 같은 공통 구현체로.

## 4.6 WS-2 잔여 — 왜 이렇게 (2026-10-27)

- **라이선스 차단은 스케줄러가 아니라 설정 출처에서**: `PgConfigSource`가 `AccessMode.FULL`이 아니거나 `DB_MONITORING`이 없으면 **거부 스냅샷**(대상·정책 없음, D22)을 돌려주고 코어가 lease를 전부 반납한다. 스케줄러가 라이선스를 보고 스레드를 멈추는 설계보다 나은 점 — J2도 같은 거부 envelope로 멈추고(§3.6), 거부/재허용 전이가 코어 한 곳(새 epoch 재개·writer 거부 유지 N4)에 있다. 스레드는 만료 중에도 돌지만 1~2초마다 캐시된 판정 1회뿐이다.
- **대상 스냅샷은 30s 캐시, 라이선스는 캐시 없음**: 설정 전파 지연 상한이 30s(§5.1)이고 저장 경로는 `evict()`로 즉시. 라이선스는 `LicenseProvider`가 자체 캐시라 한 겹 더 두지 않는다 — 두 겹이면 "키를 넣었는데 폴러는 30초 뒤에 산다".
- **버전은 행 내용의 해시**: `max(updated_at)`는 삭제를 못 보고 노드마다 다를 수 있다. 내용 해시는 같은 설정이면 어느 노드든 같은 값 — 상태 EP에서 노드 간 비교가 된다.
- **자격증명은 캐시하지 않는다**: AUTH_FAILED 자동 재개(§5.1 v2.3)의 전제가 "런타임이 `credential_version` 증가를 본다"인데 캐시가 있으면 교체가 다음 접속에 보이지 않는다. 복호화 실패는 예외 대신 null(`SECRET_UNAVAILABLE`) — 예외면 코어가 `OPEN_FAILED`(접속 실패)로 분류해 원인이 우리 쪽 키라는 사실이 가려진다.
- **어댑터 없음은 FAILED 배치로 남긴다**: 코어 설계대로(§5.8 "수집 불가 사유가 화면에 보여야 한다"). WS-3 전까지 활성 대상이 있으면 5s·10s마다 FAILED 배치가 쌓이지만 `dbm_retention`(7일)이 지우고, 지금 어느 설치본에도 활성 대상은 없다(WS-1 CRUD 전).
- **`CollectorRuntime` 조립은 한 곳**: ArchUnit이 `DbmPollerManager` 밖에서 런타임에 의존하는 것을 막는다 — 둘이면 같은 노드의 두 runId가 lease를 다툰다(§5.2 규칙 3). 상태가 필요한 곳은 `RuntimeStatus`만 읽는다.
- **`scheduler_setting(dbm_poller)` 행은 지금 심지 않는다**: 설계 §5.2 ①의 on/off 행인데, `SchedulerManager`가 job bean 없는 행마다 기동 WARN을 낸다. "상주 잡" 표현을 스케줄러 표에 넣는 WS-4에서 함께. 지금 노드 on/off는 `app.dbm.poller.enabled`.
- **IT는 `auto-run=false`로 한 tick씩**: 스레드가 끼면 "누가 lease를 잡았나"가 비결정이다. 실제 BE 기동에서 스레드가 도는 것은 **미실측**(BE 재기동은 지시 시) — 스레드 코드는 `scheduleWithFixedDelay` + `tick()` 한 줄이라 IT가 `tick()`을 밟은 것으로 로직은 덮인다.

## 4.7 WS-3 1단계 PG 어댑터 — 왜 이렇게 (2026-10-27)

- **세션 행은 idle 제외 + idle blocker 포함**(§5.3): 순수 idle은 카운터(`pg.sessions_idle`)로만 센다. 상한 1,000은 blocker → 대기 중 활성 → 오래 실행된 순으로 **결정적**으로 자르고 `totalRows`(후보 전체)와 `storedRows`를 분리해 잘림을 남긴다.
- **SQL 텍스트는 한 지점(`PgSqlText`)**: S와 Q가 같은 함수로 마스킹·절단·`<insufficient privilege>`·설정 미확인(`standard_conforming_strings` 못 읽음 → 해시만, §5.5 v2.2)을 처리한다. 두 수집기가 따로 하면 "세션은 가렸는데 Top SQL은 안 가린" 틈이 난다.
- **S↔Q 연결 키는 fingerprint가 아니다**: `pg_stat_statements`는 상수를 `$n`으로 정규화해 돌려주고 마스커는 바인드 마커를 자리표시자로 보존하므로, 같은 SQL의 S(원문 → `?`)와 Q(`$n`) fingerprint가 다르다. 연결은 `query_id`(14+)로 — LiveIT가 이 사실을 단언한다. 13 이하는 S↔Q 연결 없음(화면 명시).
- **Q 차분의 리셋 판정은 두 겹**: 개별 native의 새 등장·감소(dealloc 뒤 재등록)는 그 native만 이번 구간에서 빼고 `otherComplete=false`; `stats_reset` 변화(14+) 또는 짝 맞는 native의 절반 이상 감소는 전역 리셋 → baseline. 감소 하나에 전체를 baseline으로 떨구면 dealloc이 잦은 서버에서 Top SQL이 자꾸 비는 사고가 난다.
- **마스킹 비용은 Top N에만**: 스캔 500행 중 차분 뒤 상위 50에만 텍스트를 붙인다. 나머지는 `__other__` 합에만.
- **카운터는 서버 전체 합**(DB별 태그는 namespace 이월): 누적치는 checkpoint 차분(`intervalMs` 동반), 게이지는 현재값. 누적 통계는 PG가 비동기로 flush(~1s)하므로 "직전 커밋이 다음 tick 델타에 바로 보인다"고 단언하지 않는다(LiveIT 교훈).
- **노드 식별은 `inet_server_addr:port`**: `pg_control_system()`은 superuser 전용일 수 있어 쓰지 않는다. VIP 뒤 노드 전환은 주소가 가른다(§5.1 레인별 노드 검증).
- **접속당 서버 정보 1회**(`PgServerInfo`, 약한 캐시): `checkpointKey`와 `collect`가 같은 접속으로 잇달아 오므로 중복 조회를 막는다. 접속은 tick마다 닫히므로 캐시도 그 안에서만 산다.

## 4.8 WS-3 2단계 typed 파티션 표 — 왜 이렇게 (2026-10-27)

- **차원은 비파티션·ID 유지, 사실은 일 파티션·FK 없음**: 사실 표(세션·락·1m)는 DROP으로만 지우고 FK CASCADE를 두지 않는다 — 대상 삭제가 수천만 행 CASCADE가 되면 안 된다. 차원(fingerprint·사용자·DB·client·native)은 작고 참조가 오래가므로 FK CASCADE·`last_seen` 기준 400일(Q35) 정리. 텍스트만 NULL, fingerprint·ID는 남긴다(이름 없는 추세는 남는다).
- **1m 집계는 쓰기 시점에**: 카운터 15초 관측을 `dbm_metric_1m`에 분 버킷 UPSERT(count+1·sum+·min·max) — 별도 1m 롤업 잡이 없다. Top SQL도 60초 관측을 분 버킷 합으로. 5m·1h만 잡이 접는다(WS-10).
- **`__other__`는 대상당 native 한 행**: 완전성 플래그(`other_complete`·`scan_capped`·`excluded_natives`·`total_statements`)는 그 행에만, 일반 native 행은 NULL. 같은 분에 두 관측이 합쳐지면 `other_complete`는 AND, `scan_capped`는 OR — 한 번이라도 불완전했으면 그 분은 점유율 계산 금지.
- **파티션 보장은 writer 트랜잭션 밖**: DDL은 auto-commit이라 트랜잭션 안에 두면 롤백돼도 남고, 동시 생성 경합은 공통 구현체가 카탈로그 재확인으로 흡수한다. 보존 잡의 선생성(D+2)은 안전망의 안전망.
- **파티션 날짜 = JVM 기본 시간대**: pgjdbc가 세션 TimeZone을 JVM 기본값으로 맞추므로 timestamptz 경계와 일치한다. BE 노드 간 시간대가 다르면 경계가 어긋난다 — 설치 가이드에 "노드 TZ 통일"(APM과 같은 전제).
- **차원 UPSERT는 배열 `unnest` 한 문장**: 세션 1,000행이면 fingerprint 최대 1,000개를 행마다 RETURNING하면 1,000 왕복이다. 중복 키는 미리 접는다 — 같은 문장에서 한 행을 두 번 갱신하면 PG가 거부한다.
- **표 없는 kind는 row_count=0으로 남긴다**: PLAN 등 P1a 밖 kind가 오면 행은 버리되 배치 메타가 남아 "왔는데 저장 못 함"이 보인다. `stored_rows`(어댑터 주장)와 `row_count`(실제 저장)를 구별한다.
- **S↔Q 연결은 `query_id`**: `dbm_session_sample.query_id`·`dbm_query_native.query_id` 둘 다 저장(14+) — fingerprint는 S(`?`)와 Q(`$n`)가 다르다(§4.7).

## 4.9 WS-1 대상 관리 API — 왜 이렇게 (2026-10-28, `b8c528c`)

- **V90 표에 쓰는 관리 경로를 한 서비스로**: `premium.dbm.target.DbmTargetAdminService`만 `dbm_target`·`dbm_endpoint`·`dbm_credential`·`dbm_capability`에 쓴다. 폴러(`collector.j1`)는 읽기 + lease 열. JPA 없이 JDBC(코어 규약 그대로).
- **등록은 꺼진 상태로, 켜는 것은 admission**: `POST /dbm/targets`는 `enabled=false`. `POST …/activate`가 D17 순서(자격증명 → 상한 사전 판정 → 저장된 자격증명으로 접속·C/S/Q/P/L 검사 → 필수 S·C·L → `pg_advisory_xact_lock` 안 재판정 → `enabled=true`)를 밟는다. 네트워크 검사는 잠금 밖, 상한 판정은 잠금 안 — HA 두 노드의 동시 활성화와 라이선스 교체가 같은 잠금으로 직렬화된다. 거부는 전부 **성공 응답 `activated=false`+`reason`**(도구 실패 규칙).
- **`maxDbTargets`는 `LicenseStatus`에 필드로**: 커널 record에 `Integer maxDbTargets`(null=제한 없음) 추가 — 상태·Feature·만료 게이트는 그대로, 용량 판정만 이 값을 본다(D17 "`OVER_LIMIT`는 `LicenseStatus`를 바꾸지 않는다"는 state 이야기). 생성자 호출처 10곳 갱신.
- **`enc:v2:<keyId>:` 형식은 DBM 전용 래퍼로**: `store.DbmSecretCodec` — 알고리즘·키는 `SettingSecretCodec` 그대로, 앞에 키 ID(키 SHA-256 앞 8 hex)만 붙인다. 공용 Codec(Zabbix·AWS 설정)은 손대지 않는다. v1은 읽고, **접두어 없는 평문은 거부**(Codec의 평문 패스스루를 DBM에선 쓰지 않는다 — 코덱스 9차 N13 "enc:v2가 평문으로 취급된다"는 이걸로 닫힘). 키 교체 배치·`DECRYPT_FAILED` 기록은 이월.
- **자격증명 버전은 DB 값 기준 +1**: UPSERT 한 문장 `credential_version = dbm_credential.credential_version + 1 … RETURNING` — 읽고 +1 하는 경쟁을 피한다(코덱스 9차 §9).
- **설정 전파는 commit 뒤 `evict()`**: 이 노드 즉시, 다른 노드 ≤30s(TTL). "전 노드 즉시"가 아니다.
- **권한은 관리자 한정 유지**: `DBM_ADMIN` 좌표는 역할 JSON 백필 migration + FE 평탄화 키가 함께 가야 해서 WS-4로. 감사용 행위자는 토큰의 `userid`(토큰에 username이 없다 — IT에서 실측).
- **삭제는 활성 여부와 무관하게 허용**: lease 노드는 다음 설정 갱신에서 반납, 그 사이 writer는 `TARGET_UNASSIGNED`로 거부된다(코덱스 9차 §9 확인). typed 사실 표 행은 파티션 DROP까지 남는다 — 조회 EP가 대상 목록과 조인(WS-4).

## 5. 검증 방법 (재현)

- **WS-1 묶음(2026-10-28)**: `./gradlew.bat :test --tests 'com.dmove.moveseye.premium.dbm.*' --tests 'com.dmove.moveseye.license.LicenseArchitectureTest' --tests 'com.dmove.moveseye.premium.apm.core.batch.archive.ApmArchiveGateArchTest' --tests 'com.dmove.moveseye.license.guard.LicenseGuardedPortTest' --tests 'com.dmove.moveseye.scheduler.SchedulerManagerTest' -Dit.db.required=true` + `DBM_IT_PG_*` env → **110건 통과**(DBM 59 + ArchUnit 17 + 라이선스 포트 11 + 스케줄러 23). `LicenseStatus` 생성자가 바뀌어 `LicenseGuardedPortTest`·`SchedulerManagerTest`·APM IT 2개도 수정됐다.

```bash
# 코어 모듈 전체(LiveIT는 DBM_IT_PG_* 환경변수 — env_p0-test-db.md §3; 어댑터 LiveIT 4건·capability LiveIT 2건이 시험 PG16 5436을 쓴다)
./gradlew.bat :dbm-collector-core:test
# 앱 IT에서 실 대상까지 한 tick(realTargetCollects) — 같은 DBM_IT_PG_* 환경변수가 있을 때만 돈다(없으면 그 1건만 skip)
# app DBM 전체 42건 — ArchUnit 6 + J1 PG IT 7 + 보존 7 + ConfigSource 4 + SecretResolver 3 + 폴러 관리자·상태 EP 5 (도커 dmove-postgres-test 5433, moveseye_it를 매번 새로 만들어 V1~V91 전량)
./gradlew.bat :test --tests 'com.dmove.moveseye.premium.dbm.*' -Dit.db.required=true
# APM 회귀(공통 구현체 추출 영향) — 파티션·보존·롤업·아카이브 게이트 + 라이선스 ArchUnit
./gradlew.bat :test --tests 'com.dmove.moveseye.premium.apm.core.batch.*' --tests 'com.dmove.moveseye.license.LicenseArchitectureTest' -Dit.db.required=true
```
🔴 `:test`의 콜론을 빼면 engine-api·engine-zabbix test에도 필터가 걸려 "No tests found"로 실패한다.

## 6. 리스크·결정 대기

| 항목 | 상태 |
|---|---|
| 시험 환경(Q9) | 로컬 Docker만. MySQL·MSSQL·Oracle 컨테이너는 어댑터 Phase 직전, 실 RAC·부하 기준 하드웨어는 VM 게이트. **시험 서버 10.220.0.13은 쓰지 않는다** |
| `EXPIRED_WINDOW` 판정 창 | 미결(계약 §1.8) — J1 writer는 아직 내지 않음 |
| Flyway 번호 | V90·V91·V92 사용. 다음 DBM 표(5m/1h 롤업)는 V93~, APM과 PR 머지 순서로 조정(master에 10-27 기준 새 마이그레이션 없음) |
| `dbm_sample_batch` 무한 증가 | **해소(v2.5)** — `dbm_retention` 잡이 7일 지난 배치를 행과 함께 지운다(V91). typed 표 DROP은 WS-3 |
| 디스크 꽉 참(우리 PG 공유) | DBM 정책 아님 — 설치 가이드(Zabbix로 서버 디스크 감시) + 공용 디스크 가드 백로그(APM과 공용, §6.3) |
| Q35 차원 텍스트 400일 | 사용자명·클라이언트 주소를 추세와 같은 400일 두는 기본값 — 개인정보 관점 단축 옵션, P1a 전 결정 |
| FE `SCHEDULER_JOB_CATALOG` | `dbm_retention` 라벨 미등록(FE 코드 0) — 스케줄러 화면에 job_key가 그대로 보임, 동작 무관. WS-4(`dbm_poller` 스위치 행과 함께) |
| 폴러 스레드 실기동 | IT는 `auto-run=false`로 `tick()`을 직접 부름. 실제 BE에서 `dbm-poller-fast/slow` 스레드가 도는 것·종료 훅의 lease 반납은 **미실측** — BE 재기동은 지시 시(기본값 `enabled=true`·`auto-run=true`라 다음 재기동부터 돈다, 활성 대상 0이면 빈 tick) |
| 행 저장 위치 | **해소(WS-3 2단계)** — typed 파티션 표(V92), `dbm_sample_row` 제거. 남는 운영 전제: BE 노드 시간대 통일(파티션 경계), `dbm_retention` 잡 활성(V91 시드 기본 ON) |
| Top SQL 첫 구간 | 새 queryid는 기준값이 없어 첫 60초 구간에서 제외(`excludedNatives`, `otherComplete=false`) — 설계 §5.4 그대로. 화면은 "관측 집합 내 점유율"만 표시(WS-4) |
| 코덱스 9차 | 6·7·8차 연속 보류라 자동으로 돌리지 않음 — J1 PG 구현 + **보존 공통 구현체 추출(APM 회귀 위험)** 을 포함해 사용자 지시 뒤(`review_db-monitoring-design.md` 9차 요청 절, 범위 갱신됨) |
| 푸시·병합 | ZM-172 6커밋(HEAD `5e33e0e`)·발급기 1커밋 미푸시. WS-2 스케줄러가 붙었으므로 **master 병합 조건은 채워졌다** — 병합·푸시는 지시 시(병합 전 BE 재기동 실측 권장) |

### 6.1 코덱스 9차 검수(2026-10-28) — 🔴 N1~N9, 결정 대기

8커밋 전체 검수(`_archive/features/premium/db-monitoring/review_zm172-code5_codex.md`). 판정 "WS-1 커밋에 앞서 수정 필요 🔴 9". 자체 재확인 결과 9건 모두 **코드상 성립**하나 비용·필요성이 다르다(상세 표는 `review_db-monitoring-design.md` 9차 결과 절).

| 묶음 | 항목 | 비용 | 권고 |
|---|---|---|---|
| 작은 수정(코어 1·app 4) | N2 종료 시 세대 무효화 · N3 차원 UPSERT 정렬 · N4 Top SQL `toplevel` 필터 · N8 파티션 보장 `NOT_SUPPORTED` 경계 · N9 참조 중 차원 삭제 차단 | 각 소 | **WS-1 커밋 전 안정화 커밋 1개로** |
| 중간 | N5 eviction 완전성(`__dealloc` checkpoint·사라진 native) | 소~중 | 같은 안정화 커밋 또는 WS-10 |
| 스키마(V93) | N6 1m 표에 노드 식별 · N7 `interval_ms` 합 | 중 | **WS-10 V93과 함께**(롤업 표와 같은 migration) — 노드 스코프 집계 여부는 설계 결정 |
| 이월 권고 | N1 `now()` 잠금 대기 뒤 판정(writer가 `FOR SHARE`를 30s 넘게 쥔 병리적 조건) | 중 | 계약에 전제 명시, HA 검증 때 |

🟡 N10~N16 중 N13(enc:v2 평문 취급)은 WS-1 작업 트리의 `DbmSecretCodec`이 닫았다(코덱스는 HEAD만 봤다). 사용자 결정 **A(안정화 먼저)** → N2·N3·N4·N5·N8·N9 반영 + 테스트 6개(코어 2·앱 4) → 9차 커밋(안정화) → 10차 커밋(WS-1). N6·N7은 WS-10 V93, N1은 계약 §1.10 전제로 이월.
