# API·공통 계약 — DB 모니터링 (P0 시험본)

- 작성: 2026-10-23 · 개정: 2026-10-23(코덱스 6차 반영) · BE: `moveseye-be-spring` 워크트리 `C:\worktrees\zm-172-be` (브랜치 **ZM-172**, 미푸시)
- 설계 정본: `devdesign_db-monitoring.md` **v2.3** — §3.6(J2 토폴로지)·§5.1(실행 모델)·§5.2(lease, v2.3 개정)·§5.4(checkpoint·연속성)·§5.7(품질)·§8.1(API)·§17.1 순서 2
- **상태: 🧪 P0 시험본.** §17.1 순서 2 "공통 제어·배치 계약 시험본 고정"의 산출물이다. 행마다 셋 중 하나로 표시한다: **[설계]** 설계 확정 계약 · **[구현]** 현재 코드가 따르는 것(record·enum = wire 필드 정본) · **🧪** R8/R11 시험 가정(운영 계약 아님, P0 종료에서 실측값으로 확정). 표시가 없는 행은 [구현]이다.
- 코드 좌표: 공통 모델 `premium/dbm/collector/core/spi/*`, 폴러 프레임 `collector/core/runtime/CollectorRuntime`, P0 도구 EP `premium/dbm/api/DbmTargetToolController`.

---

## 0. 공통 규약

### 0.1 관리 API (`/dbm/**`, 사람이 쓰는 화면) — [구현]

| 항목 | 내용 |
|---|---|
| 응답 껍데기 | `{ status, code, data, ... }` — 기존 `ApiResult`. 성공은 `status:"success"`, `code:200` |
| **API 실패는 HTTP 200** | 입력·라이선스·권한 오류는 HTTP 200 + body `code`/`errorCode`(GPU·APM 규약). 401만 실제 상태 코드 |
| **도구 실패는 성공 응답** | 접속 테스트·권한 검사가 "정상 실행됐고 **대상 DB가** 실패"하면 `status:"success"` + `data.ok=false` + `data.failure`. 대상 DB 인증 실패를 HTTP 401·body 401로 내보내지 않는다(FE 세션 갱신과 섞임, 코덱스 5차 #28) |
| errorCode | `DBM_BAD_REQUEST`(400) · `DBM_ENGINE_UNSUPPORTED`(400) · **`DBM_NOT_FOUND`(404)** · **`DBM_CONFLICT`(409 — 같은 엔진·호스트·포트·DB 중복, 자격증명 없는 대상의 권한 검사)**. 라이선스 거부는 기존 커널(`LICENSE_*`), 권한 거부는 `code:403` |
| 인증·권한 | accessToken 쿠키 + `x-visitor-id`(`@VisitorIdCheck`) + `@RequiresFeature(DB_MONITORING)`. **P0·WS-1은 관리자 한정**(`AdminAccessChecker.requireAdmin`) — `DBM_ADMIN`/`DBM_VIEW`(§9) 좌표는 역할 JSON 백필·FE 평탄화 키와 함께 WS-4 |
| 시각 | wire는 **UTC epoch ms**(`long`). 화면은 브라우저 TZ. `observed_at`(실제 채집 시각)과 `received_at`(BE 수신)은 다른 값 |
| 비밀번호 | 요청에만 있고 응답·로그·`toString`에 없다(`WRITE_ONLY`). 운영 가이드: `/dbm/targets/*` 요청 본문 로깅 금지 |
| 상태 어휘 | **MISSING(갖추면 동작) ≠ UNSUPPORTED(GA 정책상 미지원)** — 화면 문구도 섞지 않는다(§4.2) |
| TLS 기본 | `tls` 생략 = `VERIFY_FULL`. `REQUIRE`·`DISABLED`는 관리자의 명시적 선택이고 대상에 배지가 붙는다(§5.1) |

### 0.2 J2 제어·수신 API (`/dbm/ingest/v1/**`, 수집기가 쓴다) — 🧪

관리 API 규약을 **쓰지 않는다**(코덱스 6차 #16). 전용 **Bearer 수집기 토큰**, 쿠키·`x-visitor-id`·`ApiResult` 껍데기 없음. Feature·라이선스 판정은 BE가 하되 결과는 **거부 envelope**(`Denial`, §1.6)로 돌려준다 — 수집기는 `LICENSE_*` errorCode를 해석하지 않는다. 본문·응답은 §1의 record를 JSON으로 그대로 싣는다(camelCase, 🧪 — snake_case 전환 여부는 P0 종료 결정). 상세 §3.

---

## 1. 공통 식별·시간·소유권·정책 모델 (J1·J2 공유, 코드 = `spi`)

### 1.1 배치 식별 — `BatchWriter.Batch` [구현]

| 필드 | 타입 | 뜻 | 규칙 |
|---|---|---|---|
| `targetUid` | string(uuid) | 논리 대상 | `dbm_target.target_uid` |
| `kind` | enum | `SESSION` `LOCK` `COUNTER` `QUERY_STAT` `PLAN` `SETTING_SNAPSHOT` `DEADLOCK` `PROC_STAT` | 레인: fast=SESSION·LOCK, slow=COUNTER·QUERY_STAT(P1a), 나머지 Phase별 |
| `epoch` | long | **소유 구간 번호** — lease가 준 `epochStart` | 대상 단위 전역 유일. 비어 있는 lease를 가져갈 때마다(인계·반납 후 재획득·J1↔J2 전환, **같은 run이 TTL을 넘겨 돌아온 경우 포함**) +1 |
| `seq` | long | epoch 안의 배치 순번, 0부터 | **대상·epoch 전체에서 증가하며 kind별로는 불연속**(설계 §5.4 "(target_uid, kind) 범위" 표기는 이 규칙으로 통일 — 수신기는 kind별 연속 seq를 요구하지 않는다, 코덱스 6차 #35). **쓰기 시도마다 소비**(결과가 RETRY_LATER여도). 같은 epoch 재획득에서는 되돌리지 않는다 |
| `meta` | object | §1.2 | 필수 |
| `policyVersion` | string | 배치를 만들 때 적용한 정책 버전 | 어댑터가 받은 정책 스냅샷과 같은 버전(`CollectContext.policy`) |
| `quality` | object | §1.4 | 필수. FAILED 배치는 `rows=[]` + `quality.status=FAILED` |
| `rows` | array<object> | **보호된 행**(마스킹·절단 적용 뒤) | 원문 SQL·플랜 민감 필드 없음(§5.5·§3.6). **PG 행 키(2026-10-27, `adapter/pg`)** — SESSION `pid backendStartMs state waitEventType waitEvent queryId backendXid elapsedMs xactElapsedMs stateElapsedMs userName dbName clientAddr clientPort clientHostname applicationName backendType leaderPid blockerPids isBlocker` + SQL 키 `fingerprint sqlText sqlTruncated sqlHidden commandType tags rawHash maskingFailed maskingFailure sqlOmitted` · LOCK `waiterPid waiterBackendStartMs blockerPid blockerBackendStartMs lockType mode relationOid relationName databaseOid databaseName waitMs` · COUNTER `metric kind(counter\|gauge) value unit intervalMs` · QUERY_STAT `native dbid userid queryId toplevel dbName userName calls execUs planUs rows sharedBlksHit/Read/Dirtied/Written localBlksHit/Read tempBlksRead/Written blkReadUs blkWriteUs walRecords walBytes intervalMs` + SQL 키, `__other__` 행 `otherComplete scanCapped excludedNatives totalStatements observedStatements dealloc`. null 값 없음(키 생략). **typed 표 열은 이 키에서 1:1로 온다 — V92 `dbm_session_sample`·`dbm_lock_edge`·`dbm_metric_1m`·`dbm_query_stat_1m`(+차원 `dbm_query_dimension`·`dbm_dimension_text`·`dbm_query_native`), 매핑은 `collector.j1.PgTypedRowStore` 한 곳(2026-10-27)**. 저장할 표가 없는 kind(PLAN 등)는 배치 메타만 남고 `row_count=0` |

**멱등 키**: 저장 키 `(targetUid, kind, epoch, seq)` — `dbm_sample_batch UNIQUE`. J2 전송 envelope에 `collectorId`·`runId`가 붙지만 저장 키는 같다(🧪 envelope 위치). **같은 키·같은 payload = DUPLICATE, 같은 키·다른 payload = IDEMPOTENCY_CONFLICT** — 서버는 payload(rows·quality·policyVersion) hash를 보관해 비교한다. **다이제스트 함수는 코어 `spi.BatchPayloadDigest.of(batch)`(SHA-256, 타입 태그+길이 접두 정규 직렬화) — J1 `PgBatchWriter`(`dbm_sample_batch.payload_digest`)·메모리 writer·J2 수신기가 같은 함수를 쓴다**(2026-10-26 공용화). 키 표기는 `BatchPayloadDigest.idempotencyKey` = `targetUid|kind|epoch|seq`.

### 1.2 관측 메타 — `BatchWriter.Meta` [구현]

| 필드 | 타입 | J1 | J2 |
|---|---|---|---|
| `nodeId` | string | 어댑터가 본 물리 노드(`dbm_node`). 접속 실패 배치는 null | 같음 |
| `observedAtEpochMs` | long | **채집 SQL 시작 경계**에서 코어가 capture한 보정 시각(UTC). tick 시작 시각이 아니다(코덱스 6차 #14). **어댑터는 덮지 못한다**(7차 N9 — `Collected`에 시각 필드 없음); DB가 보고한 시각이 필요하면 행 안의 컬럼으로 | 수집기 원시 시각 + 보정 |
| `rawObservedAtEpochMs` | long | = observedAt | 수집기 원시 시각 — **재전송에도 바뀌지 않는다** |
| `clockOffsetMs` / `clockOffsetVersion` / `clockUncertain` | long / long / boolean | 0 / 0 / false | heartbeat 왕복 보정값·회차·±2s 밖 여부 🧪 |
| `fencingToken` | string | lease token(`dbm_target.lease_token`) | lease API가 준 token |
| `assignmentGeneration` | long | 소유권 세대 | 같음 — 불일치면 `GENERATION_MISMATCH` |

### 1.3 쓰기 결과 — `BatchWriter.WriteResult(status, reason, detail)` [구현] ↔ J2 수신 응답 🧪

`status`가 흐름을, `reason`(enum, §3.6 수신 오류 분류)이 **중단 범위**를 정한다. 코어는 `detail`(자유 문자열)로 분기하지 않는다(코덱스 6차 #8·#10).

| `status` | `reason` | 뜻 | 런타임 행동 |
|---|---|---|---|
| `ACCEPTED` | — | 저장·checkpoint 커밋 | 계속 |
| `DUPLICATE` | — | 같은 키·같은 payload(재전송) | **ACK로 취급**(실패 집계 아님). checkpoint는 첫 수락 때 이미 전진 |
| `EXPIRED_WINDOW` | `EXPIRED`(선택 — 없어도 됨) | 보존 창 밖의 늦은 데이터 | **저장하지 않은 폐기 ACK**(큐 삭제) + 손실 메타 기록. checkpoint는 함께 커밋(그 관측 구간은 지난 것) |
| `CONFLICT` | `STALE_LEASE` · `GENERATION_MISMATCH` · `TARGET_UNASSIGNED`(**사유 필수** — 생성자가 강제, 8차 V8-8) | 소유권 불일치 | **그 대상 lease 버림·남은 kind 중단**(이중 적재 0). 다음 tick 재획득. 결과가 **예약 당시 lease**에 대한 것일 때만 — 그 사이 재획득된 새 lease는 건드리지 않는다(N15·V8-5) |
| `CONFLICT` | `IDEMPOTENCY_CONFLICT` | 같은 키·다른 payload = 코어 버그 | **그 대상 격리**(`suspended`, lease 유지) + 알람. `resume`으로만 해제 |
| `RETRY_LATER` | `RATE_LIMITED` · `BE_BUSY` · (없음: writer 예외·null — **커밋 여부 불명**) | 일시 실패 | seq 소비, 그 대상 **쓰기 백오프**(5s→60s, 접속 백오프와 별도 — 단 예약 당시 lease가 아직 현재 lease일 때만, 옛 lease의 늦은 실패는 새 소유 구간에 백오프를 씌우지 않는다 V8-5), 이번 tick 남은 kind 중단. checkpoint는 코어가 건드리지 않는다 — 확정 미커밋이면 옛값(다음 성공 배치가 누적 델타), 커밋 뒤 예외였으면 writer가 이미 전진시킨 값. 어느 쪽이든 다음 tick의 `load`가 진실이라 이중 집계가 없다 |
| `REJECTED` | `VERSION_MISMATCH` · `SCHEMA_INVALID` | 버전·스키마 | **런타임 정지**(`halt`, 전 lease 반납, 큐 보존) + 알람. `clearHalt` 뒤 재개 |
| `REJECTED` | `FEATURE_DENIED` · `LICENSE_EXPIRED` · `TOKEN_INVALID` · `TOKEN_REVOKED` | 허가 소멸 | **거부 상태**(`denial`, 전 lease 반납, 큐·checkpoint 보존) — config의 `Denial`과 같은 처리. 배치 응답에서도 올 수 있다(config/lease 성공 직후 폐기·만료, 코덱스 6차 #9). writer가 낸 거부는 **서버가 새 `configVersion`을 내리거나 `clearDenial()`이 불릴 때까지 유지** — 캐시된 허용 설정으로 재개하지 않는다(7차 N4) |
| `REJECTED` | (없음) | — | **존재하지 않는다**. `WriteResult` 생성자가 REJECTED·CONFLICT의 사유를 필수로 강제한다(코덱스 7차 N8·N14). 배치 한정 영구 거부가 필요해지면 구체 사유·checkpoint·손실 정책을 먼저 정의 |

`acknowledged()` = ACCEPTED·DUPLICATE·EXPIRED_WINDOW. **DB 계정 `AUTH_FAILED`(§5.1)는 전혀 다른 축** — 배치 `quality.errorCode=AUTH` + 대상 정지(§1.9).

### 1.4 배치 품질 — `BatchWriter.BatchQuality` [구현]

| 필드 | 뜻 |
|---|---|
| `status` | `OK` 정상 · `PARTIAL` 일부(baseline·상한 절단·namespace 예산 초과) · `FAILED` 접속·채집 실패(행 없음) · `SKIPPED` 지연으로 건너뜀(§5.7 상태 어휘 반영, 코덱스 6차 #15) |
| `timeCoverage` | 기대 tick 대비 성공 tick(0~1) |
| `totalRows` / `storedRows` | DB 보고 전체 행 / 상한 적용 뒤 저장 행 → `row_truncated = total > stored` |
| `textTruncated` | 엔진 길이 상한에 걸린 SQL 수 |
| `maskingFailed` | 마스킹 실패로 텍스트가 폐기된 SQL 수(해시만) |
| `errorCode` | FAILED면 실패 분류 — `ConnectionTestResult.FailureKind` 이름(`AUTH`·`TIMEOUT`·`NETWORK`·`TLS`·`DATABASE_NOT_FOUND`·`SERVER_UNAVAILABLE`·`DRIVER`·`OTHER`) 또는 런타임 코드(`ADAPTER_MISSING`·`SECRET_UNAVAILABLE`·`OPEN_FAILED`·`COLLECT_FAILED`). PARTIAL baseline은 `BASELINE` |
| `elapsedMs` | 채집 소요(ms, SQL 시작~행 확보) |

`sourceVisibility`·`dimensionOverflow`(§5.7 세부)는 WS-6 이월 — 이 record는 **P1a 부분 모델**이다.

### 1.5 소유권 — `LeaseClient.Lease` [설계 §5.2 v2.3 개정 → 구현]

| 필드 | 뜻 | 수치 |
|---|---|---|
| `targetUid` · `ownerId` · `runId` | 대상 · 소유자(J1 BE 노드 ID / J2 `collectorId`) · 프로세스 실행 식별자 | `runId`는 프로세스 시작마다 새로 — PG 열 `lease_run_id` |
| `assignmentGeneration` | 소유권 세대 — J1↔J2 전환·수집기 교체마다 +1(관리자 행위) | lease와 **구별되는** 값 |
| `fencingToken` | lease token — 모든 배치 `meta.fencingToken` | PG 열 `lease_token`, 획득·인계·전환마다 +1 |
| `epochStart` | 이 소유 구간의 epoch | PG 열 `lease_epoch` |
| `leaseUntilEpochMs` | 만료 시각(**lease 서버 = DB 시계**) | **TTL 30s · 갱신 10s** [설계] |

규칙(설계 §5.2 v2.3, 코드 `InMemoryLeaseClient`가 재현(`InMemoryLeaseClientTest`), **J1 PG 구현 `collector.j1.PgLeaseClient` — `DbmJ1PgStoreIT.leaseRules`가 실 PG에서 단언**, 2026-10-26):
1. 비어 있거나 만료(`lease_until <= db_now`)된 lease의 신규 획득은 **같은 (owner, runId)가 돌아온 경우를 포함해** token+1·epoch+1.
2. **유효한** lease를 같은 `(owner, runId)`가 재요청하면 만료만 연장, token·epoch 유지(갱신과 같다).
3. 유효한 lease는 다른 `runId`에게 주지 않는다 — 같은 owner의 복제 프로세스도. J2는 등록된 실행 식별자·할당 검증을 서버가 추가로 한다(§3.6, 메모리 구현 범위 밖).
4. 갱신은 owner·run·token·generation이 일치하고 만료 전일 때만, **token·epoch 불변**. 런타임은 갱신 응답의 epoch·token이 바뀌어 오면 프로토콜 위반으로 보고 lease를 버린다.
5. 반납은 현재 lease와 일치할 때만 만료 처리. 반납된 lease는 허가가 아니다.
6. **writer는 소유권(token·generation·유효기간) 검증과 저장을 같은 원자적 경계에서 수행**한다(PG 트랜잭션 / 메모리 임계 구역 `commitIfHeld`). token을 먼저 읽고 따로 INSERT하면 그 사이 인계를 놓친다.
7. 같은 epoch를 재개하는 런타임은 seq를 보존한다. 반납 실패로 소유권이 불확실하면 상태(epoch·seq)를 지우지 않고 다음 tick에 재시도한다.

### 1.6 설정·허가 — `ConfigSource.Snapshot` [구현]

| 필드 | 뜻 |
|---|---|
| `configVersion` | 대상·주기 버전(J2: ETag) |
| `assignmentGeneration` | 이 스냅샷이 전제하는 소유권 세대 |
| `policy` | `policyVersion` · `approvedTagKeys` · `keepRawSql`(J2는 Q34 전 항상 false) · `maxSqlTextChars` — 어댑터에 `CollectContext.policy`로 전달 |
| `targets[]` | `targetUid` · `engine` · `endpoint{host, port, database, tls}` · `sessionIntervalSec`(5) · `lockIntervalSec`(10) · `counterIntervalSec`(15) · `queryStatIntervalSec`(60, 0 이하 = 수집 안 함) · `enabled`. 자격증명은 없다(`SecretResolver`) |
| `denial` | **거부 envelope** — `reason`(`LICENSE_EXPIRED`·`FEATURE_DENIED`·`TOKEN_REVOKED`·`TOKEN_INVALID`·`VERSION_MISMATCH`) + `detail`. 거부면 `targets=[]`·`policy=null`(생성자 강제, D22) |

런타임: 거부 스냅샷 → **모든 lease 반납 + 수집 중단**(큐·checkpoint 보존). 재허용 → 새 epoch로 재개. 사라지거나 `enabled=false`인 대상 → lease 반납. 🔴 설정 pull은 실행 허가를 늘리지 않는다 — 허가는 lease.

**J1 구현 `collector.j1.PgConfigSource`(2026-10-27)**: `dbm_target`(owner_kind=BE만, 비활성 포함) + `dbm_endpoint`(우선순위 1개, 없으면 `endpoint=null`)를 30s 캐시 스냅샷으로. `configVersion` = 행 내용 SHA-256 앞 16자(같은 설정이면 어느 노드든 같은 값). `assignmentGeneration`은 0(J1 소유권 세대는 대상별 — lease·writer가 검증). 라이선스는 **매 호출**: FULL 아님 → `LICENSE_EXPIRED`(detail에 상태·모드), FULL인데 `DB_MONITORING` 없음 → `FEATURE_DENIED`. 정책 = `app.dbm.poller.*` 기본값(`policyVersion`="p-"+값 해시; `dbm_setting` 표가 생기면 그 표가 정본). 조회 실패 시 이전 스냅샷 유지(우리 PG 순단에 "대상 전부 사라짐"으로 읽혀 lease를 반납하지 않게). `DbmPollerManagerIT.licenseDenialReleasesEverything`이 라이선스 비활성 → 거부 → 전부 반납 → 재허용 새 epoch를 실 PG에서 단언.

### 1.7 델타 checkpoint·커밋 경계 — `CheckpointStore.Checkpoint` [구현]

- 키 `(targetUid, kind, nodeBootEpoch, nativeKey)` = `dbm_delta_checkpoint`. 값 `lastValues{name: long}` · `observedAtEpochMs` · `pollerRunId`. ⚠️ P1a는 kind당 checkpoint 1개(값 Map) — PG native `(dbid, userid, queryid, toplevel)`별 reset·quota는 WS-3에서 Map 키 규약으로 정한다(코덱스 6차 #24).
- **커밋 경계(코덱스 5차 #22·6차 #1)**: 코어는 `BatchWriter.write(batch, checkpoint)` 한 호출로 넘기고 checkpoint를 따로 저장하지 않는다. J1 writer = fencing 검사·배치 INSERT·checkpoint UPSERT가 **한 PG 트랜잭션**. J2 writer = 큐 append와 checkpoint 전진이 **한 fsync 단위**. writer가 커밋 뒤 예외를 던지거나 ACK가 유실돼도 다음 tick이 읽는 checkpoint는 저장된 배치와 짝이 맞는다(`CollectorRuntimeTest.ackLostAfterCommitDoesNotDoubleCount`).
- **J1 구현(2026-10-26)**: `PgBatchWriter.write` = REQUIRES_NEW 트랜잭션 안에서 ① `dbm_target` 행 `FOR SHARE` + token·generation·`lease_until > now()` 검증(불일치 → CONFLICT, 롤백) ② `dbm_sample_batch` `ON CONFLICT (target_uid, kind, epoch, seq) DO NOTHING RETURNING` — 이미 있으면 저장된 digest 비교(DUPLICATE / IDEMPOTENCY_CONFLICT, 예외 없이) ③ 🧪 `dbm_sample_row` jsonb batch INSERT ④ `PgCheckpointStore.save` UPSERT. ④가 실패하면 ②③도 롤백(`DbmJ1PgStoreIT.checkpointFailureRollsBackBatch`). J1 writer는 아직 `EXPIRED_WINDOW`를 내지 않는다(판정 창 미결 §1.8) · `REJECTED`도 내지 않는다(허가 소멸은 `ConfigSource.Denial` 경로). `nativeKey=null`은 `''`로 저장.
- **연속성(§5.4)**: 코어는 어댑터에 `continuity`를 알린다 = previous가 **이 실행**(`pollerRunId` 일치)의 것이거나 `Options.resumeAcrossRuns`가 켜진 구성. J1(기본)은 재시작·인계 뒤 첫 관측을 baseline/partial로 낸다. J2는 큐·checkpoint 원자 커밋이 증명된 구성에서만 이어 쓴다. boot epoch 변경·값 감소·기준값 키 누락도 baseline.
- 파일 구현(`FileCheckpointStore`): 임시 파일 + `force(true)` + 원자 교체(미지원 파일시스템은 예외, 조용한 저하 없음) + CRC32·값 개수 검증. 없음/손상/일시 불가는 `lastLoadState`로 구별.

### 1.8 수치 표

| 항목 | 값 | 표시 |
|---|---|---|
| lease TTL / 갱신 | 30s / 10s | [설계] §5.2 |
| 수집 RTO(J1 인계) | ≤30s | [설계] Q15 — **로직 시험만**(`fencingOnTakeover`), 실측은 R8 |
| 접속 장애 백오프 | 5s → 10 → 20 → 40 → 60s 상한, 접속 성공 시 리셋 | [구현] `CollectorRuntime.BACKOFF_*` |
| DB 인증 실패 | 재시도 중단(대상 정지) — 자격증명 버전 변경 또는 `resume`으로 해제 | [설계 §5.1·§5.8 → 구현] |
| config pull / ETag | 30s | 🧪 |
| heartbeat | 10s | 🧪 |
| 최대 설정 전파 지연 → `CONFIG_STALE` | 2×pull = 60s | 🧪 |
| 디스크 큐 / 손실 메타 세그먼트 | 256MB / 1MB | 🧪 |
| 큐 포화 폐기 순서 | 세션 샘플 → 활동 집계 → (카운터·락만 남아도 포화하면) **가장 오래된 카운터부터** → (락만 남아도 포화하면) **가장 오래된 락부터**. 즉 마지막 fallback은 "가장 오래된 세그먼트 폐기"이며 어떤 kind도 상한을 넘겨 보존하지 않는다. checkpoint는 큐가 아니라 별도 파일. 폐기량·구간은 손실 메타(독립 상한)에 기록 → `DROPPED_LOCAL` | 🧪 (§3.6 최종 fallback 포함, 코덱스 6차 #17·7차 #17) |
| 시계 보정 | RTT/2, 표본 5 중앙값, 유효 5분, 신뢰 ±2s | 🧪 |
| 토큰 회전 중첩 / enrollment 코드 | 10분 / 10분·1회 | 🧪 |
| 수집기 1대 대상 상한 | ≤30(초기 시험값, 인증값 아님) | 🧪 |
| `EXPIRED_WINDOW` 판정 창 | **kind·저장 목적별로 다르다** — 세션 raw 48h(§6.1) · 1m 롤업 반영 가능 기한(§6.1: 활동 1m **30일**, metric·Q 1m **7일**, 1h 180일) · "raw는 만료됐지만 롤업 반영은 가능한 배치"의 처리 | 🧪 **미결** — 설계 §3.6 "늦은 데이터 1m 30일"은 활동 1m에만 맞고 metric·Q 1m(7일)과 어긋난다(코덱스 6차 #18·7차 #18). 설계 §3.6 두 행에 미결 표시. §6 체크리스트 |
| statement_timeout / connect / socket | 5s / 5s / 10s | [구현] `JdbcConnector`·`ConnectionSpec` |
| 세션/락/카운터/Q 주기 | 5s / 10s / 15s / 60s | [설계] §4 |

### 1.9 대상 상태·정지 — `RuntimeStatus` [구현: 모델 · **`GET /dbm/poller/status` EP(2026-10-27)**] · [미구현: heartbeat 탑재]

모델: `ownerId`·`runId`·`configVersion`·`denial`·`halt{reason, detail}`·`targets[]{targetUid, leased(지금 유효한 실행 lease), fencingToken, epoch, nextSeq, accepted, duplicates, expired, lastCollectError, lastWriteError, suspended, backoffRemainingMs, closeFailures, lastTickEpochMs}`. `suspended` ∈ `AUTH_FAILED`(자격증명 **버전**이 바뀌면 자동 해제 — 버전을 올리지 않고 비밀번호만 바꾸면 해제되지 않으므로 자격증명 저장은 `credentialVersion++`을 보장하거나 관리자가 `resume`한다) · `IDEMPOTENCY_CONFLICT`(수동 `resume`). `TickReport`는 ACK(accepted·duplicates·expired)·채집 실패·쓰기 실패(RETRY_LATER·CONFLICT·REJECTED)·fencing(소유권 상실)·건너뜀을 따로 센다 — DUPLICATE는 실패가 아니고, FAILED 배치의 저장 성공은 `accepted`에도 들어간다(저장 성공 기준). 파일 checkpoint의 `LoadState`(손상·불가)와 `closeFailures`를 경보로 올리는 소비자(경보)는 아직 없다 — 상태 EP는 값을 싣기만 한다.

**`GET /dbm/poller/status`** — 관리 API 규약(§0.1: 쿠키 + `x-visitor-id` + `@RequiresFeature(DB_MONITORING)` + **관리자**). **이 노드**의 폴러만 답한다(노드마다 자기 lease만 안다 — 다중 노드 합산은 WS-1 대상 목록 EP가 `dbm_target` lease 열로). 라이선스 만료면 이 EP도 `LICENSE_*`로 막히므로 "만료로 수집이 멈췄다"는 라이선스 배너가 말한다.

| 필드 | 뜻 |
|---|---|
| `running` · `enabled` · `autoRun` · `startedAt` | 노드 수명 — `SmartLifecycle` 기동 뒤 · `app.dbm.poller.enabled` · 레인 스레드 자동 실행 · 시작 시각(epoch ms, 시작 전 0) |
| `ownerId` · `runId` | lease 소유자(`호스트명:PID`) · 프로세스 실행 식별자(UUID, 기동마다 새로) |
| `configVersion` | 마지막으로 읽은 설정 스냅샷 버전(§1.6) |
| `denial{reason, detail}` | 설정 출처의 거부(`LICENSE_EXPIRED`·`FEATURE_DENIED`, §1.6) — 없으면 null |
| `halt{reason, detail}` | `VERSION_MISMATCH`·`SCHEMA_INVALID` 정지 — 없으면 null |
| `lanes[]{lane, kinds[], ticks, errors, lastTickAt, lastDurationMs, lastError, last}` | 레인 `FAST`(SESSION·LOCK)·`SLOW`(COUNTER·QUERY_STAT). `ticks`=시작 뒤 tick 수(예외 포함), `errors`=예외 tick 수, `lastError`=마지막 예외(성공 tick이 지움), `last`=마지막 성공 tick 집계 `{at, denied, halted, targets, accepted, duplicates, expired, failedCollect, failedWrite, fenced, skipped}`(`TickReport` — DUPLICATE는 실패가 아니고 FAILED 배치의 저장 성공은 `accepted`에도 든다) |
| `targets[]{targetUid, leased, fencingToken, epoch, nextSeq, accepted, duplicates, expired, lastCollectError, lastWriteError, suspended, backoffRemainingMs, closeFailures, lastTickAt}` | 대상별 코어 상태(위 모델 그대로, `lastTickEpochMs`→`lastTickAt`). 비밀값·접속 정보 없음 |

실측(`DbmPollerManagerIT.statusEndpoint`): 관리자 200 + `data.targets[0].leased=true`·`fencingToken="1"`·`lastCollectError=ADAPTER_MISSING`(WS-3 전) · USER는 body `code=403`.

---

## 2. P0 도구 EP (구현됨, 저장 없음) — [구현]

### 2.1 `POST /dbm/targets/test-connection`

요청 `DbmConnectionRequest`:

```json
{
  "engine": "POSTGRESQL",
  "host": "10.0.0.5",
  "port": 5432,
  "database": "appdb",
  "username": "moveseye_mon",
  "password": "(쓰기 전용 — 응답·로그에 없음)",
  "tls": "VERIFY_FULL",
  "connectTimeoutSec": 5,
  "socketTimeoutSec": 10
}
```

- `engine`: `POSTGRESQL | MYSQL | MARIADB | SQLSERVER | ORACLE`(별칭 `postgres`·`mssql` 허용). 이 빌드에 드라이버가 없는 엔진은 `DBM_ENGINE_UNSUPPORTED`(P1a는 PostgreSQL만 `available`).
- `host`·`database`에 `/ ? & = ;` 공백이 있으면 `DBM_BAD_REQUEST`(URL 속성 주입 차단). `port` 생략 = 엔진 기본 포트. `tls` 생략 = `VERIFY_FULL`.

응답 `data: ConnectionTestResult` — Jackson 기본 직렬화(record 접근자·enum 이름; `CapabilityReport`의 `of()`·`statuses()`·`requiredSatisfied()`는 getter가 아니라 응답에 끼지 않는다):

```json
{ "ok": true, "failure": null, "serverVersion": "PostgreSQL 16.15 (Debian 16.15-1.pgdg13+2) on x86_64-pc-linux-gnu, …", "elapsedMs": 27, "message": "접속 성공", "sqlState": null }
```
```json
{ "ok": false, "failure": "AUTH", "serverVersion": null, "elapsedMs": 31, "message": "DB 계정 인증에 실패했습니다. 비밀번호·계정 잠김·만료 여부를 확인하세요.", "sqlState": "28P01" }
```

`failure` = `ConnectionTestResult.FailureKind` ∈ `NETWORK | TIMEOUT | TLS | AUTH | DATABASE_NOT_FOUND | SERVER_UNAVAILABLE | DRIVER | OTHER`. `message`는 `JdbcConnector.messageFor`의 사용자용 한국어(드라이버 원문·호스트 존재 여부 없음). **실측(R1-PG, PG 16.15, 2026-10-23)**: 비밀번호 오류 → `AUTH/28P01`, 없는 DB → `DATABASE_NOT_FOUND/3D000`, 닫힌 포트 → `NETWORK/08001`, TLS 없는 서버에 `VERIFY_FULL` → `TLS/08004`(평문 자동 전환 없음).

### 2.2 `POST /dbm/targets/check-capabilities`

요청: 2.1과 같은 몸체. 응답 `data: DbmCapabilityCheckResponse`:

```json
{
  "connection": { "ok": true, "failure": null, "serverVersion": "16.15 (Debian 16.15-1.pgdg13+2)", "elapsedMs": 40, "message": "접속 성공", "sqlState": null },
  "report": {
    "items": [
      { "grade": "S", "status": "OK",          "detail": "세션·대기 이벤트 수집 가능(pg_stat_activity, pg_monitor USAGE)", "required": true },
      { "grade": "L", "status": "OK",          "detail": "블로킹 관계 수집 가능(pg_blocking_pids, pg_locks 10s)", "required": true },
      { "grade": "Q", "status": "RECOMMENDED", "detail": "Top SQL 수집 가능. 권고: pg_stat_statements.max=5000 (권고 10000 — 적으면 dealloc으로 Top SQL이 누락됩니다)", "required": false },
      { "grade": "C", "status": "OK",          "detail": "카운터 수집 가능(pg_stat_database·bgwriter; …)", "required": true },
      { "grade": "P", "status": "UNSUPPORTED", "detail": "GA 정책상 미지원 — PostgreSQL은 캐시 플랜이 없고 EXPLAIN 재계획은 문장 권한이 필요합니다(D18). 권한 누락이 아닙니다.", "required": false }
    ],
    "engineVersion": "16.15 (Debian 16.15-1.pgdg13+2)",
    "versionNumber": 160015,
    "notes": { "database": "appdb", "user": "moveseye_mon", "in_recovery": "false", "pg_monitor": "usage" },
    "checkedAtEpochMs": 1761200000000
  }
}
```

- 접속 실패면 `connection.ok=false` + `report=null`.
- `status` ∈ `OK | MISSING | DISABLED | UNSUPPORTED | RECOMMENDED | ERROR`. **필수 등급 S·C·L**(`required=true`)이 전부 수집 가능(`OK`·`RECOMMENDED`)이어야 활성화 가능(§4.2 v2.2). FE는 `required`·`status`로 배지, `detail`은 그대로(0건 표시 금지, I19).
- `notes`는 등급 밖 환경 사실 — 키는 엔진별로 다를 수 있다.
- **실측(R1-PG, `PgCapabilityCheckerLiveIT` 전체 단언)**: `moveseye_mon` → S·L·C OK, Q RECOMMENDED(서버 기본 `pg_stat_statements.max=5000`), P UNSUPPORTED, 필수 충족, `pg_monitor=usage`. `moveseye_nomon` → S MISSING·L OK·Q MISSING·C RECOMMENDED·P UNSUPPORTED, **필수 미충족**, `pg_monitor=none`.

---

### 2.3 대상 관리 — `DbmTargetAdminController` [구현 2026-10-28, `b8c528c`] (`/dbm/targets` CRUD · 자격증명 · 저장된 자격증명 권한 검사 · 활성화 admission · 라이선스 사용량)

| EP | 요청 | 응답 `data` | 오류 |
|---|---|---|---|
| `GET /dbm/targets` | — | `DbmTargetView[]`(이름순) | — |
| `POST /dbm/targets` | `DbmTargetCreateRequest{displayName, engine, host, port?, database?, tls?, username?, password?(WRITE_ONLY), sessionIntervalSec?, lockIntervalSec?, counterIntervalSec?, queryStatIntervalSec?}` | `DbmTargetView`(`enabled=false`, 자격증명 있으면 `credentialStatus=OK`·`credential.version=1`, 없으면 `UNSET`·`credential=null`) | `DBM_BAD_REQUEST`(host 속성 주입·주기 범위·비밀번호 없는 계정·빈 이름) · `DBM_ENGINE_UNSUPPORTED` · `DBM_CONFLICT`(같은 엔진·`lower(host)`·port·database) |
| `GET /dbm/targets/{uid}` | — | `DbmTargetView` | `DBM_BAD_REQUEST`(uuid 아님) · `DBM_NOT_FOUND` |
| `PUT /dbm/targets/{uid}` | `DbmTargetUpdateRequest{displayName, host, port?, database?, tls?, 주기 4개?}` — **전체 치환**(생략 주기 = 기본값), 엔진·자격증명은 제외 | `DbmTargetView` | 위 + `DBM_CONFLICT` |
| `DELETE /dbm/targets/{uid}` | — | — | `DBM_NOT_FOUND` |
| `PUT /dbm/targets/{uid}/credential` | `DbmCredentialRequest{username, password(WRITE_ONLY)}` | `{targetUid, credentialVersion}` — 저장마다 +1(DB 값 기준, UPSERT 한 문장), `credentialStatus=OK` | `DBM_BAD_REQUEST`(빈 비밀번호) · `DBM_NOT_FOUND` |
| `POST /dbm/targets/{uid}/check-capabilities` | — (저장된 자격증명) | `DbmCapabilityCheckResponse{connection, report}`(§2.2와 같은 모양) + **`dbm_capability` UPSERT**(접속 실패면 기존 행 유지) | `DBM_NOT_FOUND` · `DBM_CONFLICT`(자격증명 없음) |
| `POST /dbm/targets/{uid}/activate` | — | `DbmActivationResult{targetUid, activated, reason, connection, report, license}` | `DBM_NOT_FOUND` |
| `POST /dbm/targets/{uid}/deactivate` | — | `DbmTargetView`(`enabled=false`) | `DBM_NOT_FOUND` |
| `GET /dbm/license/usage` | — | `DbmLicenseUsage{maxDbTargets(null=제한 없음), unlimited, activeTargets, overLimit}` | — |

`DbmTargetView`: `targetUid · displayName · engine · enabled · endpoint{host, port, database, tls} · intervals{sessionSec, lockSec, counterSec, queryStatSec} · credentialStatus(UNSET|OK|AUTH_FAILED) · credential{username, version, updatedAt, updatedBy}|null · capabilities[{grade, status, detail, required, checkedAt}] · requiredSatisfied(Boolean — 행 없으면 null) · ownership{ownerKind, ownerId, assignmentGeneration, leaseOwner, leaseRunId, leaseEpoch, leaseUntil, leaseActive} · createdAt · updatedAt`(시각은 epoch ms). **비밀번호·암호문은 어디에도 없다.** `updatedBy`는 토큰의 `userid`(없으면 `user#<id>`) — 토큰에 username이 없다. lease 열은 전 노드 합산 관점(`dbm_target` 행) — `GET /dbm/poller/status`(이 노드)와 다른 축.

활성화 admission(D17) 순서와 `reason`: ① 이미 활성 → `activated=true, reason=ALREADY_ACTIVE` ② 라이선스가 `DB_MONITORING` 불허 → `LICENSE_DENIED` ③ 자격증명 없음 → `CREDENTIAL_MISSING` ④ `activeTargets >= maxDbTargets` → `LICENSE_LIMIT`(접속 검사 없이 사전 거부, `connection=null`) ⑤ 저장된 자격증명으로 접속·C/S/Q/P/L 검사(`dbm_capability` 저장) — 실패 → `CONNECTION_FAILED`(`connection.failure` 분류) ⑥ 필수 S·C·L 미충족 → `CAPABILITY_UNMET`(`report.items`) ⑦ 트랜잭션 안 `pg_advisory_xact_lock(hashtext('dbm_target_admission'))` → 라이선스 재읽기·활성 수 재계산 → 상한이면 `LICENSE_LIMIT`, 아니면 `enabled=true` → `activated=true, reason=null`. **전부 성공 응답**(도구 실패 규칙). 켠 뒤 폴러는 이 노드 즉시(`evict`)·다른 노드 ≤30s 안에 수집을 시작한다. 하향 갱신(`overLimit`)은 기존 활성 유지·신규 거부.

삭제·수정의 폴러 영향: 삭제 → lease 노드는 다음 설정 갱신에서 반납, 그 사이 writer는 `FOR SHARE` 행 없음(`TARGET_UNASSIGNED`)으로 거부 → lease 폐기. typed 사실 표는 FK가 없어 파티션 DROP(2일·7일)까지 행이 남는다 — 조회 EP(WS-4)는 대상 목록과 조인한다. 접속점 수정 → `configVersion` 변화만(진행 중 tick 취소·새 epoch·checkpoint 초기화 아님 — 통계 연속성 단절 여부는 미결, 코덱스 9차 §9).

실측(2026-10-28, `DbmTargetAdminIT` 9 + `DbmTargetAdmissionIT` 5, 실 PG16 5436 포함): 등록→상세→수정→교체(version 2)→`db.invalid` 활성화 `CONNECTION_FAILED/NETWORK`→비활성화→삭제→404, 중복 `DBM_CONFLICT`, USER 403, 상한 1/활성 1 → `LICENSE_LIMIT`(접속 없음), 상한 0 → 전부 거부, 실 PG16 활성화 `activated=true`·capability 5행·`requiredSatisfied=true`·재활성화 `ALREADY_ACTIVE`.

---

## 3. J2 제어·수신 API 시험본 🧪 (`/dbm/ingest/v1/*`, P3b 구현 — P0 R11 시험 schema)

인증·껍데기는 §0.2. 모든 응답은 **거부 envelope**를 가질 수 있다: `{ "denial": { "reason", "detail" } }` — 수집기는 §1.6 규칙으로 처리(전 lease 반납·큐 보존, `VERSION_MISMATCH`는 정지).

| EP | 요청 | 응답 | 비고 |
|---|---|---|---|
| `GET /dbm/ingest/v1/config` | `If-None-Match: <configVersion>`, 헤더 `X-Dbm-Collector-Version`·`X-Dbm-Wire-Version` | `Snapshot`(§1.6) + **`jobs: Job[]`** 또는 `304` | 30s. **원격 작업은 config 응답으로만 전달**(설계 §3.6; heartbeat에 싣지 않는다 — 코덱스 6차 #16). 거부는 200 + `denial`(설정·jobs 없음) |
| `POST /dbm/ingest/v1/lease` | `{ collectorId, runId, targetUids[] }` | `{ leases: Lease[], denied: [{ targetUid, reason }] }` | 대상 묶음, PG 원자 처리(§5.2). 다른 `runId`·미할당 → `TARGET_UNASSIGNED`/`STALE_LEASE` |
| `POST /dbm/ingest/v1/batches` | `{ collectorId, runId, batches: Batch[] }` | `{ results: [{ targetUid, kind, epoch, seq, status, reason, detail }] }` 또는 envelope `denial` | 부분 성공(배치별 판정 = §1.3). envelope 거부(`TOKEN_*`·`LICENSE_EXPIRED`·`FEATURE_DENIED`·`VERSION_MISMATCH`)는 배치 결과 없이 온다 |
| `POST /dbm/ingest/v1/heartbeat` | `{ collectorId, runId, version, wireVersion, queueBytes, appliedConfigVersion, appliedPolicyVersion, clockSampleSentAtMs, status: RuntimeStatus(§1.9) }` | `{ serverTimeMs, clockOffsetMs, clockOffsetVersion, clockUncertain }` | 10s. 왕복으로 시계 보정. `VERSION_MISMATCH`여도 heartbeat는 수락(진단) |
| `POST /dbm/ingest/v1/jobs/{jobId}/result` | `{ collectorId, runId, idempotencyKey, result }` | `{ accepted }` | 중복 `idempotencyKey`는 ACK |

**Job schema** 🧪: 요청 `{ jobId, targetUid, kind: TEST_CONNECTION | CHECK_CAPABILITIES | FETCH_CACHED_PLAN | APPLY_CREDENTIAL | RESUME_TARGET, idempotencyKey, ttlEpochMs, params{} }`. 취소 = TTL 만료 또는 다음 config에서 사라짐. kind별 `params`·`result`(아래)는 고정 shape이고 자유형이 아니다(7차 #16):

| kind | `params` | `result` (공통: `{ ok: boolean, errorCode?: string, elapsedMs, startedAtEpochMs }`) |
|---|---|---|
| `TEST_CONNECTION` | 없음(대상 설정·봉투는 config에 있다) | + `ConnectionTestResult`(§2.1) |
| `CHECK_CAPABILITIES` | 없음 | + `DbmCapabilityCheckResponse`(§2.2) |
| `FETCH_CACHED_PLAN` | `{ nativeKey, planHandle }` | + `{ planHash, maskedPlan(보호된 구조), kind: CACHED }` 또는 `errorCode` |
| `APPLY_CREDENTIAL` | `{ envelope: "env:v1:<collectorKeyId>:<targetUid>:<credentialVersion>:…" }`(§3.6 키 수명주기) | + `{ credentialVersion }` — 실패면 `errorCode`(`ENVELOPE_INVALID`·`KEY_MISMATCH`) |
| `RESUME_TARGET` | 없음 | + `{ resumed: boolean }` |

`errorCode`는 §1.4의 실패 분류 어휘(`AUTH`·`TIMEOUT`…)와 job 전용 코드(`JOB_EXPIRED`·`TARGET_NOT_ASSIGNED`·`ENVELOPE_INVALID`·`KEY_MISMATCH`)를 쓴다.

---

## 4. 코어 구동 증명 (P1a DoD §17.4 — `CollectorRuntimeTest` 31건, 2026-10-23 · 모듈 분리·8차 반영 2026-10-26)

**증명 범위**: Spring·PG·네트워크 없이 인터페이스 교체로 코어가 구동되고, 아래 **제어 규칙**이 메모리/파일 구현에서 성립한다. **실측이 아닌 것**: RTO 30s(R8), PG lease·writer 트랜잭션(WS-2 이월), 디스크 큐(R11). **경계 강제**: 코어는 Gradle 모듈 `dbm-collector-core`(프로덕션 의존 0)라 Spring·JPA·PG 드라이버 import는 컴파일 실패 — 1차 방어. bootJar `BOOT-INF/lib/dbm-collector-core-0.0.1.jar` 포함 확인(J2 패키징은 같은 jar 소비).

| 규칙 | 테스트 |
|---|---|
| fast/slow 주기·seq 단조·기본 TTL 30s를 fast tick 갱신으로 유지(LONG_TTL 없음) | `lanesAndSequence` |
| observedAt = 채집 시작 경계 | `observedAtIsCollectBoundary` |
| §5.4 baseline: 첫 관측·J1 재시작(continuity=false)·boot 변경·값 감소 | `baselineRulesJ1` |
| durableQueue 옵션만 다른 실행의 checkpoint로 이어 쓰기 | `resumeAcrossRunsOnlyWhenOptedIn` |
| **커밋 뒤 ACK 유실 → 이중 집계 0**(서버 합 = 실제 증가) | `ackLostAfterCommitDoesNotDoubleCount` |
| RETRY_LATER: seq 소비·checkpoint 비전진·누적 델타·백오프 | `retryLaterKeepsCheckpointAndBacksOff` |
| 만료 뒤 인계·옛 소유자 CONFLICT·(epoch, seq) 중복 0 | `fencingOnTakeover` |
| **채집 중 인계 → writer 원자 검증에서 거부** | `takeoverDuringCollectIsFencedAtWriter` |
| 유효 중 일시 갱신 실패 → 같은 epoch 재획득·seq 유지 | `transientRenewFailureKeepsSeq` |
| **FAST/SLOW 동시 tick — 서로 블로킹 없음, seq 중복 0** | `lanesDoNotBlockEachOther` |
| DUPLICATE ACK / IDEMPOTENCY_CONFLICT 격리·resume | `duplicateAndIdempotencyConflict` |
| REJECTED 사유별 정지·거부 | `rejectedReasons` |
| 거부(D22) 전 lease 반납·재허용 새 epoch | `denialReleasesEverything` |
| AUTH 정지·자격증명 교체 자동 재개·char[] wipe | `authFailureSuspendsUntilCredentialRotates` |
| NETWORK 지수 백오프·리셋 | `networkFailureBacksOff` |
| 채집 예외·null 결과 → FAILED, checkpoint 비전진 | `collectFailuresDoNotAdvanceCheckpoint` |
| 주기 0 kind 미수집 | `zeroIntervalDisablesKind` |
| wall clock 역행에도 monotonic 주기·갱신 유지 | `wallClockJumpBackwardsDoesNotStallScheduling` |
| 반납 실패 시 상태 보존·같은 epoch seq 유지 | `dropPreservesStateWhenReleaseFails` |
| 파일 checkpoint(J2)로 재시작 이어 쓰기·임시 파일 0·LoadState | `runsOnFileCheckpointStore` |
| **checkpoint 저장 실패 → 배치 수락도 없음**(둘 다 아님), 다음 누적 델타 | `checkpointSaveFailureRollsBackBatch` |
| payload 비교 충돌 저항(`"Aa"`/`"BB"`) | `payloadDigestIsCollisionResistant` |
| 실행 lease를 잃어도 마지막 소유권으로 반납 | `lostExecutionLeaseStillReleasesOwnership` |
| writer 거부는 새 configVersion까지 유지 | `writerDenialPersistsUntilNewConfigVersion` |
| 앞 대상 지연으로 만료된 lease로 폴링 시작 안 함(대상별 현재 시각) | `staleTickTimeIsNotReusedAcrossTargets` |
| 쓰기 백오프는 접속 성공과 무관하게 증가 | `writerBackoffEscalatesIndependentlyOfConnect` |
| 상태값(백오프 0·정지 중 만료 lease는 leased=false) | `statusValuesAreSane` |
| **payload 정규 직렬화 — 타입·경계 보존**(1≠"1", 구분자 든 값≠두 키, 행 수, boolean≠문자열; Integer 1=Long 1) | `payloadDigestPreservesTypesAndBoundaries`(8차 V8-1) |
| **느린 레인의 옛 설정 응답이 다른 레인의 새 writer 거부를 지우지 않음**(설정 적용은 실행 세대 검증과 한 잠금) | `staleConfigSnapshotDoesNotClearNewerDenial`(V8-2, 실제 스레드) |
| **앞 kind의 ACK 대기 중 lease 만료 → 다음 kind SQL 시작 안 함**(채집 시작 경계마다 허가 재확인, fenced 0·skipped 1) | `expiredLeaseDuringAckDoesNotStartNextKind`(V8-3) |
| **느린 자격증명 조회(v1)가 v2 재개·재실패 뒤 돌아와도 정지를 풀지 않음**(정지 세대 + 버전 증가 조건, 접속 시도 2회로 끝) | `staleCredentialLookupDoesNotResumeNewerAuthFailure`(V8-4, 실제 스레드) |

**단언하지 않는 것**(7차 #29·8차): 저장소 crash·열린 핸들·원자 이동 미지원(P3b R11), AUTH 정지 게시와 다른 레인 접속의 경합(코드로 닫았지만 결정적 재현 테스트 없음), 정지 뒤 진행 중 tick의 새 lease 생성 차단(실행 세대 검사 — 코드로 닫음, 직접 테스트 없음), **늦은 쓰기 결과의 전체 반영 정책**(V8-5 — ACK/RETRY_LATER의 실패 횟수·백오프는 `sameLease`로 가드했지만 결정적 재현 테스트 없음, WS-2에서 시도별 통계와 제어 상태 분리로 확정), J1 PG 트랜잭션 원자성·J2 큐 crash 원자성(WS-2·P3b).

보조: `InMemoryLeaseClientTest`(§5.2 규칙·`commitIfHeld`·reassign) · `FileCheckpointStoreTest`(이름 충돌·손상 3종·회복) · `DbmCoreArchitectureTest` ×2 — 모듈 쪽 3규칙(모듈 = 코어 패키지만 · allowlist `java..`·`javax..`·core · `Thread`/`Executors`/`ExecutorService`/`Timer` 생성 금지) / app 쪽 2규칙(`masking..`·`local..` 직접 사용 금지 — J1은 PG 구현).

---

### 1.10 안정화 반영(2026-10-28, 코덱스 9차) — 계약에 닿는 것만

- **Top SQL(PG 14+)**: 스캔·순위·`__other__`는 **`toplevel=true` 문장만**(N4). `track=all`의 중첩 문장은 집계에 들어오지 않는다(드릴다운은 후속). 13 이하는 분리 불가 — `__other__.nestedSeparated=false`.
- **`__other__` 행 키 추가**: `vanishedNatives`(이전 관측에 있던 native 중 사라진 수) · `nestedSeparated` · `deallocDelta`(14+, 전 관측 대비 퇴출 수). `otherComplete`는 이제 스캔 상한·새/감소 native·사라진 native·dealloc 증가 **넷 다 없을 때만** true(N5). checkpoint 전역 키 `__dealloc` 추가.
- **종료 의미(§1.9)**: `shutdown()`은 lease 반납 전에 실행 세대를 올리고 tick을 닫는다 — 종료 뒤 진행 중 tick이 새 대상을 획득하지 않는다(N2). 재시작은 `reopen()`(새 세대).
- **writer 호출 조건(§1.7)**: 파티션 보장은 호출자 트랜잭션과 무관하게 auto-commit(N8) — 바깥 tx 안에서 `write()`를 불러도 자기 대기가 없다.
- **차원 보존(§6.1)**: `dbm_dimension_text`·`dbm_query_native` ID는 사실 표가 참조하는 동안 지워지지 않는다(N9) — `dimensionIdleDays`를 짧게 잡아도 이름이 사라지지 않는다.
- **전제(N1, 이월)**: lease·writer의 만료 판정은 문장 시작 시각 `now()`다. 행 잠금을 TTL(30s) 넘게 기다리는 상황(writer가 `FOR SHARE`를 30s 이상 쥠)은 설계상 없다고 전제한다 — HA 검증 때 재확인.

---

## 5. 🔄 FE 요청사항

(없음 — 관리 EP(§2.3)는 2026-10-28 구현. FE는 WS-4에서 §2.1~2.3으로 등록 마법사·대상 목록을 만들고, 조회 EP(세션·락·Top SQL)는 WS-10 뒤.)

---

## 6. P0 종료 때 확정할 것 (🧪 해소 체크리스트)

- [ ] wire 필드 표기(camelCase 유지 vs snake_case) — J2 schema 고정 전
- [ ] **`EXPIRED_WINDOW` kind·목적별 수락 창** — §3.6 "늦은 데이터 1m 30일"과 §6.1 보존(세션 raw 48h·Q/metric 1m 7일)의 충돌 해소, "raw 만료·롤업 반영 가능" 배치 처리 → 설계 개정 뒤 구현
- [ ] lease API 수치(TTL 30s·갱신 10s)가 J2 HTTPS 왕복에서도 유효한지(R11)
- [ ] 큐 256MB·손실 메타 1MB·폐기 순서(최종 fallback 포함)의 실측(R11 큐 소진)
- [ ] 시계 보정(RTT/2·표본 5·±2s)의 실제 분포(R11 ±2s 주입)
- [ ] heartbeat·config 주기(10s·30s)와 `CONFIG_STALE` 판정
- [ ] 수집기 1대 상한 30 대상(P4 인증 프로필로 이관)
- [ ] 전송 envelope의 `collectorId`·`runId` 위치(헤더 vs 본문)
- [ ] checkpoint native별 reset·quota(WS-3 Map 키 규약) · `BatchQuality` 세부 축(WS-6)
