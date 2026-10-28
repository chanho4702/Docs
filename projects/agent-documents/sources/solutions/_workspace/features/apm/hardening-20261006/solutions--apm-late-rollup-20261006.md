# APM 순위 5 — 지연 메트릭 재집계와 원본 보존 설계

작성일: 2026-10-06. 상태: **읽기 전용 분석·구현 제안**. 이번 작업에서 제품 소스·테스트·DB·서버·커밋은 변경하지 않았다. 다른 에이전트가 진행 중인 순위 2~4의 OTLP reader·원시계열 식별·누적 차분 변경은 그대로 보존한다.

## 권고

**시간 버킷 단위의 영속 dirty queue, 버전 조건부 완료 처리, 원본·대상 파티션의 날짜 잠금, 재집계 상태를 보는 보존 게이트를 함께 구현한다.** 단순히 lookback 시간을 늘리는 것으로 완료 처리하지 않는다. 순위 7의 최소 관측 시간창·삭제된 날짜 재생성 방어를 이 작업의 선행 조건으로 접목한다.

순위 3은 늦게 온 CUMULATIVE 관측을 차분할 수 있는지의 문제이고, 순위 5는 **실제로 1m에 적재된 데이터가 상위 집계에 반영되는지**의 문제다. 순위 3에서 폐기된 역순 관측은 여기서 복구할 수 없다. 동일 본문의 재전송 중복 방지도 기존 receipt의 책임이다.

## 현재 경로와 근거

BE 경로는 `moveseye-be-spring/src/main/java/com/dmove/moveseye/` 기준이다. 줄 번호는 검토 시점이며 순위 2~4 수정으로 일부 이동할 수 있다.

| 단계 | 현재 동작 | 코드 근거 |
|---|---|---|
| HTTP 수신 → 파싱 | `MetricIngestPipeline.ingestOnce`가 reader의 포인트를 `MetricIngestor.ingestOnce`로 넘김 | `premium/apm/collector/ingest/MetricIngestPipeline.java:65` |
| DDL 준비 | 허용된 metric 포인트의 관측 날짜를 모아 영수증 트랜잭션 전에 partition 준비 | `collector/ingest/store/MetricIngestor.java:129` 부근 |
| 원자 적재 | `ApmMetricBatchWriter`의 REQUIRES_NEW에서 receipt 선점 + 적재 callback. 중복이면 callback 미실행 | `collector/ingest/receipt/ApmMetricBatchWriter.java:20,27` |
| 1분 적재 | PK별 배치 병합·PK 정렬 후 덧셈 UPSERT. bounds와 1m 변경은 수신 트랜잭션 참여 | `collector/ingest/store/ApmMetric1mStore.java:345,356,379` |
| 시간축 | `bucketOf`는 서버 기본 시간대의 `LocalDateTime` 분 단위. `timestamp without time zone` 및 일 파티션과 같은 축 | `ApmMetric1mStore.java:325`; 새 설계만 UTC 날짜로 바꾸면 안 됨 |
| 1m → 5m | LAG 2분. watermark 다음 5분부터 닫힌 구간만 대입 집계. 기본 최대 60버킷 | `core/batch/rollup/ApmRollupService.java:95,115,156,228` |
| 5m → 1h | 기본 최대 12시간. 5m watermark + 5분을 1시간 경계로 내린 시각보다 앞까지만 집계 | `ApmRollupService.java:117,180` |
| watermark | 마지막 처리 버킷의 시작. 기존 자료 적재와 watermark 저장은 별도 트랜잭션. 다음 시작은 watermark + 버킷 폭 | `ApmRollupService.java:254,268,308`; `core/setting/ApmSettingService.java:362,391` |
| 빈 창 방어 | 결과 0행이면서 최근 끝에 닿고 원본 보존 기간 안일 때만 watermark 유지. 일부 행이 있으면 전진 | `ApmRollupService.java:261,293` |
| 재실행 집계 | count/sum/min/max/hist/bounds/exemplar 모두 원본 현재 값으로 대입. 같은 원본 재실행은 중복 합산하지 않음 | `ApmRollupService.java:403,455` |
| 보존 | 기본 raw 7일, 5m 30일, 1h 400일. 유효 값은 retention job options에서 읽음 | `core/batch/retention/ApmRetentionDays.java:70`; `ApmRetentionJob.java:104` |
| 실제 DROP | `day < today - retentionDays`. archive 비활성이면 watermark/dirty 상태 확인 없이 DROP | `ApmRetentionService.java:97`; `core/batch/partition/ApmPartitionService.java:241` |
| archive DROP | guard 판정·DROP·dropped callback은 같은 트랜잭션. 현 guard는 archive 원장·파일·hold를 확인 | `ApmPartitionService.java:280,296`; `core/batch/archive/ApmArchiveDropGate.java:144` |
| 스케줄러 중복 억제 | job key lease를 사용하나 TTL 30분. 갱신·작업 중 소유권 fencing은 없음 | `scheduler/SchedulerManager.java:163`; `SchedulerLeaseService.java:40,59` |

`ApmRollupService`의 빈 창 보존 판정은 `ApmResolution.M1/M5.retentionDays()` 상수를 사용한다(`:160,192,298`). 반면 실제 삭제는 `ApmRetentionDays.from(setting)`을 사용한다. 사용자 보존 설정이 기본값과 다를 때 판단이 갈리므로 새 보존 보호는 실제 유효 보존 정책을 사용해야 한다. 기존 주석의 288/48 기본값 일부도 실제 상수 60/12와 다르다.

## 트레이스와 구분

`trace/rollup/ApmTraceRollupService.java:115,139,229`는 이미 **LAG 3분 + 이전 5분 버킷 2개(10분) 재처리**를 한다. six-step 집계와 watermark도 `TransactionTemplate` 안에서 함께 처리한다(`:243`). 따라서 트레이스에 lookback이 없다고 진단하면 틀리다.

다만 lookback은 유한하고, 서비스 맵·외부 호출 재분류의 옛 키 삭제 문제는 순위 6의 별도 과제다. 메트릭 dirty queue를 추가하면서 trace watermark·lookback을 바꾸거나 같은 큐에 합치지 않는다. 향후 trace dirty 처리도 채택한다면 원본 span 보존과 재분류 삭제를 별도로 검증해야 한다.

## 현재의 실제 PostgreSQL 반례를 만들 검증 절차

다음은 **실행 계획**이며 이번 분석에서 실행한 결과가 아니다. 기존 `ApmRollupJobIT`의 실제 PostgreSQL fixture·UPSERT를 재사용하되, 테스트 전용 DB에서 직렬 실행하고 기존 watermark·설정을 복원한다. 운영·공유 개발 DB에서 `dropExpiredPartitions`를 호출하지 않는다.

1. `B = floor5m(now - 2h)`로 잡고 instance A의 `B+1m` 원본 count=10을 넣는다. 5m watermark를 B-5m, 1h watermark를 B가 속한 시간의 이전 시간으로 준비하고 5m→1h를 실행한다.
2. 같은 5분 B에 instance B의 `B+2m` count=5를 뒤늦게 적재한다. 기존 watermark는 되감지 않는다.
3. 다시 5m→1h를 실행한다. 기존 코드는 watermark 다음만 읽으므로 B의 1m 합은 15인데 5m는 10이고, 이미 처리된 1h도 10인 상태가 예상된다. **수정 후에는 정상 배치 실행만으로 둘 다 15가 돼야 한다.**
4. 새 instance 행뿐 아니라 기존 1m PK에 추가 UPSERT하는 경우도 똑같이 시험한다. `count`, `sum`, `min/max`, histogram 각 원소, exemplar ID/value를 대조한다.
5. 오래된 하루 D에 원본을 넣고 rollup watermark를 그 날짜 이전에 둔다. D가 보존 경계 밖이 되도록 Clock을 제어하거나 격리 DB의 날짜 fixture를 선택한다. archive OFF 상태에서 retention을 먼저 실행하면 현 코드는 원본을 삭제할 수 있다. 수정 후에는 rollup 미완료 사유로 보류되어야 한다.

기존 `ApmRollupJobIT.rerunIsIdempotent(:188)`는 테스트가 watermark를 직접 되감는다. 이는 대입 UPSERT 안전성은 확인하지만 자동 지연 재집계를 입증하지 않는다. `ApmRollupWatermarkTest`는 전체 빈 창과 상한 전진을 확인하며 일부 지연 경로를 덮지 않는다.

## 권장 데이터 모델

새 Flyway migration 번호는 구현 직전 현재 최댓값을 확인해 배정한다. 지금 번호를 예약하지 않는다.

```text
apm_metric_rollup_dirty
  stage           SMALLINT       -- 5(1m→5m), 60(5m→1h)
  bucket_start    TIMESTAMP      -- 해당 target 버킷 시작, 기존 서버 시간축
  generation      BIGINT         -- 같은 키가 변경될 때 증가
  first_dirty_at  TIMESTAMP
  last_dirty_at   TIMESTAMP
  PRIMARY KEY(stage, bucket_start)

apm_metric_rollup_state
  stage           SMALLINT PRIMARY KEY
  pending_count   BIGINT
  bootstrap_cursor / bootstrap_complete
  raw/target retired_before 등 지속 상태는 역할에 맞춰 별도 행 또는 별도 작은 테이블
```

- 서비스·인스턴스·dims별 메시지 큐를 만들지 않는다. 동일 시간 버킷의 변경은 한 marker로 합친다. 메시지 본문이나 원시계열 key를 큐에 복제하지 않는다.
- 1m에 **실제로 쓰는 배치**의 고유 5분 버킷을 모아 같은 트랜잭션에서 등록한다. `INSERT ... ON CONFLICT ... generation = generation + 1`로 표시한다. 버킷별 정렬은 모든 노드에서 동일해야 한다.
- 현 watermark보다 오래된 버킷에만 표시하는 최적화는 첫 구현에서 하지 않는다. watermark를 읽은 뒤 롤업 snapshot이 잡히는 사이의 경합으로 표시가 누락될 수 있다.
- 새 marker만 필요한 `ON CONFLICT DO NOTHING`과 소비 후 무조건 DELETE 조합도 사용하지 않는다. 소비 중 새 변경이 기존 marker에 합쳐지면 완료 처리 때 함께 지워질 수 있다.
- 처리 상태는 DB에 둔다. 메모리 큐·afterCommit 비동기 marker·재기동 시 복원 없는 큐는 수신 성공 후 재집계 표시를 잃을 수 있다.

### 유한 크기와 부하 제어

시간 버킷별이라는 이유만으로 유한 큐가 되는 것은 아니다. 임의의 과거·미래 timestamp와 장기 rollup 장애가 있으면 날짜 수가 계속 늘어난다.

- **시간창 제한:** 순위 7의 guard를 적용해 새 입력은 지원 지연 범위와 미래 clock-skew 범위 안에서만 받는다. 최소한 실제 raw 보존 cutoff 밖의 날짜와 이미 DROP한 날짜는 DDL·적재 전에 막는다. 기본 수치를 정할 때 `raw1mDays`보다 넓은 허용 지연을 조용히 허용하지 않는다. 기존 time 누락/0 → receivedAt 폴백은 유지한다.
- **큐의 절대 상한:** stage별 `maxPendingBuckets`를 설정한다. 예시 검토값은 5m 4,096개·1h 1,024개이며, 이는 성능 보증이나 확정 운영 기본값이 아니다. 5m 4,096개는 연속 약 14.2일, 1h 1,024개는 약 42.7일 분량이다. 보존·지원 지연·정체 복구 목표와 함께 검증해 확정한다.
- 새 key를 추가할 공간이 없으면 해당 수신 트랜잭션을 **503으로 되돌리고 receipt·1m·메모리 기준값 공개도 롤백**한다. 가장 오래된 marker 삭제, 임의 샘플링, 200 성공 후 marker 누락은 금지한다. 기존 key의 generation 갱신은 추가 슬롯을 쓰지 않는다.
- 상한 판정의 `count(*)` 후 INSERT는 다중 노드 경합에 안전하지 않다. stage state 행 잠금 아래 신규 key를 재확인해 슬롯 수를 증감하거나 동등한 원자 예약이 필요하다. marker enqueue·조건부 ACK·bootstrap 모두 같은 primitive를 사용한다.
- budget 행과 marker 잠금은 일관된 순서(stage 오름차순 → bucket 오름차순)로 짧게 유지하고, **집계 SQL을 수행하는 동안 budget 행을 잡지 않는다.** 성공한 DELETE 행 수만큼 pending_count를 감소시킨다. 5m→1h 전파로 1h 큐가 가득 찼다면 5m 집계·ACK도 함께 롤백한다.
- 한 회차의 normal-forward 예산과 과거 repair 예산을 나눈다. repair만 계속해서 최신 집계가 굶거나, 최신 처리만 하느라 과거 marker가 영원히 남지 않게 한다. 최대 버킷 수·경과 시간·SQL statement timeout을 함께 둔다.
- 하나의 현재 5분 marker/state가 쓰기 경합점이 될 수 있다. 배치당 unique bucket으로 합친 비용과 queue lock p95를 실제 OTLP 부하에서 측정한다. 상한만 추가하고 대규모 준비 완료로 보고하지 않는다. shard 도입은 필요할 때 별도 설계하며, 무턱대고 32 shard별 전체 원본 scan을 32회 돌리지 않는다.

## 재집계·완료 처리 알고리즘

1. normal-forward와 dirty-repair 모두 stage별 **DB transaction advisory lock**을 획득한 동일 실행기로 처리한다. 스케줄러 lease만 믿지 않는다. `pg_try_advisory_xact_lock` 실패는 다른 작업자가 처리 중이라는 뜻으로 기록한다. lock은 이 트랜잭션 commit/rollback에 맞춰 해제된다.
2. 대상·원본 날짜 파티션을 미리 준비한 뒤 작은 처리 창의 트랜잭션을 시작한다. 기존 DDL을 대량 집계 트랜잭션 안으로 옮기면 부모 테이블의 강한 잠금을 오래 잡으므로 기존 외부 준비 원칙을 유지한다. 준비 단계도 시간창·삭제 날짜 guard를 따라야 한다.
3. 원본과 대상의 날짜 공유 잠금을 결정적인 순서로 획득하고, 원본이 아직 유효한 상태인지 확인한다. 설정 캐시나 이전에 읽어 둔 `queue empty` 결과를 삭제 안전성 판단에 쓰지 않는다.
4. 선택한 marker들의 `generation`을 먼저 읽는다. 5m는 기존 LAG 2분 닫힘 경계를 지킨다. 1h는 기존 5m frontier가 해당 시간 끝까지 전진했는지 확인한다. 가능하면 같은 시간에 미처리 5m marker가 있으면 1h를 뒤로 미뤄 불필요한 반복을 줄인다.
5. 기존 SQL의 전체 버킷 대입 UPSERT를 수행한다. 늦게 온 행만 `+=` 하지 않는다. `hist_counts/bounds_id` 불일치, GAUGE의 sum/count, exemplar ID/value 짝 규칙을 그대로 재사용한다.
6. **5m 결과 변경 → 해당 1h marker 갱신 → 5m marker ACK**를 하나의 트랜잭션에서 처리한다. 1h는 결과 변경과 1h ACK를 함께 처리한다. normal-forward watermark 저장도 같은 트랜잭션에 넣는다.
7. ACK는 `DELETE ... WHERE stage=? AND bucket_start=? AND generation=?`로 한다. 새 데이터가 끼어 generation이 달라졌다면 marker를 남겨 다음 회차에 다시 계산한다. 수신이 나중에 commit하면 같은 트랜잭션의 marker 갱신도 함께 보이므로 다음 계산이 보장된다.
8. dirty-repair는 normal-forward watermark를 되감지 않는다. frontier는 최초 순회 진행 위치이고, pending marker는 그 뒤에 생긴 변경이다. 두 의미를 별도로 유지한다.

READ COMMITTED에서 각 SQL은 명령 시작 전 commit된 값을 읽고, 경합 UPDATE/DELETE의 WHERE는 상대 commit 후 다시 판정된다. 위 version ACK는 이 성질을 이용한 **설계 제안**이며 latch를 사용한 두 실제 connection 시험으로 입증해야 한다. [PostgreSQL 공식 격리 수준 문서](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)

advisory lock은 DB가 업무 불변식에 맞춰 자동으로 걸어 주지 않으므로, 정상 처리·수동 재실행·repair의 모든 쓰기 경로가 같은 규약을 지켜야 한다. [PostgreSQL 공식 명시적 잠금 문서](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)

### 동시성에서 반드시 피할 경로

- worker가 generation=3을 읽은 뒤 소스를 집계하는 동안 ingest가 원본+generation=4를 commit한 경우: 결과는 이번 snapshot 또는 다음 snapshot일 수 있지만 ACK(3)는 marker(4)를 지워서는 안 된다.
- 두 worker가 다른 시점의 같은 버킷 snapshot을 쓴 경우: 늦게 끝난 오래된 결과가 최신 결과를 덮을 수 있다. generation ACK만으로 결과 역행까지 막을 수 없으므로 **동일 stage 실행 잠금이 필요**하다.
- 5m repair가 끝나고 1h marker만 기록되기 전에 죽는 경우: 별도 트랜잭션이면 전파가 끊긴다. 같은 트랜잭션으로 묶어 함께 재시도한다.
- 5m로 일부 기간만 재집계한 후 오래된 1h 전체를 덮는 경우: 1h에 필요한 5m 원본이 일부 삭제됐다면 집계값을 축소시킨다. source coverage/retirement 판정을 통과하기 전에는 재계산하지 않는다.

## 보존 삭제를 연결하는 조건

**`queue empty`만으로 DROP하면 안 된다.** 수신 트랜잭션이 아직 commit하지 않아 dirty가 안 보이거나, 신규 설치 bootstrap이 안 끝났거나, 최초 순회 watermark가 뒤에 있을 수 있다.

메트릭 보존은 archive ON/OFF와 무관하게 아래 게이트를 거치게 한다. 기존 archive 게이트는 추가 조건으로 AND 결합한다. archive의 `onFailure=continue`·maxHoldDays 만료는 미집계 데이터 보호를 우회하지 못한다.

| 삭제할 원본 | 필요한 진행 상태 | 미처리 상태 | 추가 조건 |
|---|---|---|---|
| 날짜 D의 1m | 5m frontier + 5분 ≥ D+1일 | D의 5m dirty 없음 | bootstrap 완료, 날짜 배타 잠금, 실제 원본 상태 확인 |
| 날짜 D의 5m | 1h frontier + 1시간 ≥ D+1일 | D의 1h dirty 없음 **및 1m→5m 미처리 없음** | 아직 1m에서 같은 날짜의 5m를 다시 만들 가능성도 닫혀 있어야 함 |
| 날짜 D의 1h | 별도 상위 집계 없음 | 관련 생성/repair 작업과 충돌하지 않음 | 보존일·archive 기존 조건과 날짜 잠금 |

- 파티션이 실제로 비었으면 날짜 배타 잠금 안에서 빈 상태를 확인한 뒤 별도 안전 경로로 삭제할 수 있다. 빈 파티션 때문에 전역 frontier가 영원히 붙잡혀서는 안 된다.
- ingest는 1m 날짜의 **공유** 잠금을 1m 쓰기·dirty 등록 commit까지, rollup은 원본·대상 날짜의 공유 잠금을 집계·ACK commit까지 보유한다. retention은 동일 key의 **배타** 잠금을 획득한 뒤 watermark·dirty·bootstrap을 다시 읽고 DROP을 같은 트랜잭션에서 수행한다.
- 공유 잠금은 동시에 여러 producer를 허용한다. lock timeout이면 rollback/보류한다. 한 날짜의 장애가 여러 날짜를 긴 트랜잭션으로 묶어 전체 수신을 막지 않도록 처리 창을 작게 둔다.
- 글로벌 순서는 metric 날짜 잠금(table 순서 1m→5m→1h, 날짜 오름차순) → 소스/대상 SQL → 짧은 queue budget/marker 변경이다. archive 잠금과 조합할 때도 전체 순서를 문서화한다. 기존 archive 작성 경로가 역순으로 metric 잠금을 새로 요구하도록 바꾸면 교착이 생기므로 별도 확인한다.
- `ApmPartitionService.dropExpired(..., PartitionDropGuard)`는 이미 guard·DROP을 같은 tx로 처리하므로 확장 지점으로 적합하다. archive OFF에 현재 쓰는 무조건 DROP 경로 대신 메트릭 게이트를 적용한다. gate bean을 두 개 넣어 Spring 주입이 모호해지지 않도록 retention에서 guard를 합성하거나 단일 composite를 만든다.

### 순위 7과 함께 넣어야 하는 파티션 재생성 방어

수신의 DDL 준비와 실제 적재 사이에도 retention이 실행될 수 있다. DDL 전 시간창 검사만으로는 충분하지 않다.

1. 새 입력은 파티션 준비 **전** 실제 raw 보존 cutoff·허용 미래 시각을 검사한다. `raw1mDays`는 실제 retention 정책에서 가져온다.
2. 실제 수신 트랜잭션에서 날짜 공유 잠금을 획득한 **뒤** cutoff와 영속 `retired_before`를 다시 확인한다. 삭제가 먼저 끝난 과거 날짜는 새로 생성하지 않는다. 보존 기간을 나중에 늘려도 이미 지워진 구간이 정상 backfill로 되살아난 것처럼 보이지 않아야 한다.
3. retention이 DROP할 때 retired 경계를 같은 트랜잭션에 기록한다. 날짜별 tombstone을 무한히 쌓기보다 단조 증가 경계 등 유한 상태로 표현한다. 경계 앞의 보류된 원본은 읽고 집계할 수 있지만 일반 수신을 다시 열지는 않는다.
4. 시간 범위 밖 입력은 영구 정책 제외와 사유를 기록한다. 현재 단계 2~4의 CUMULATIVE 기준값을 갱신하기 전에 결정해야 한다. 큐 상한·DB 장애 같은 일시 오류와 구분한다.
5. 기존 DDL 캐시가 있어도 삭제 후 적재 검사를 우회하지 못하게 한다. DDL 준비 후 삭제·재기동·설정 변경을 포함한 경합 시험을 작성한다.

따라서 **5번 구현 + 7번의 메트릭 시간창/retired guard 최소 부분**을 같이 완성하는 편이 안전하다. 7번의 trace/RUM 전체 시간창·설치 안내·다른 partition 경로 확장은 후속으로 남길 수 있다. guard 없이 queue만 배포한 상태를 5번 완료라고 하지 않는다.

## 장기 중단·기존 데이터·복구 정책

- rollup만 장기간 중단되고 수신·retention이 계속 돌면 미집계 원본은 보호해야 한다. 큐·디스크가 무한하지 않으므로 pending oldest age·held partitions·estimated bytes를 노출하고, 상한에서 수신 backpressure를 건다. 미집계 원본을 조용히 지우는 방식으로 공간을 확보하지 않는다.
- 5m가 자기 보존 기간을 넘겼어도 1h 보존 기간 안의 자료를 복구하는 데 필요할 수 있다. 해당 5m는 임시 중간 원본으로 유지하고 1h 완료 후 삭제한다. 모든 하류의 보존 약속이 끝난 날짜는 명시적인 EXPIRED 판정으로 정리할 수 있으나, 단순 queue TTL 삭제로 대체하지 않는다.
- 원본 파티션이 이미 사라진 날짜는 재집계 성공으로 처리하지 않는다. 기존 상위 값을 빈 합으로 덮지 말고 SOURCE_UNAVAILABLE 상태·필요 복구 절차를 남긴다. archive로 복원하는 일은 별도 사용자 작업/복구 절차이며 자동 운영 DB 덮어쓰기로 확장하지 않는다.
- 새 queue는 도입 전 지연 변경을 모른다. bootstrap 동안 관련 만료 원본을 보호하고, 실제 남은 1m 파티션의 각 5분 및 5m 파티션의 각 시간 버킷을 작은 chunk로 등록한다. 전체 원본 `GROUP BY`를 migration 한 문장으로 실행하지 않는다. 파티션 날짜에서 후보 버킷을 생성하고 빈 버킷도 안전하게 처리할 수 있다.
- bootstrap은 cursor를 DB에 남겨 재기동 후 이어 간다. 큐 상한에 도달하면 새 bootstrap 등록을 멈추고 consumer부터 진행한다. bootstrap 완료 전의 watermark만으로 보존을 허용하지 않는다.
- 모든 BE가 새 marker 기록 규약으로 전환된 시점을 bootstrap cutover로 삼는다. 구 BE와 새 BE를 장기간 섞어 돌리면 구 BE가 수정한 원본을 새 queue가 모른다. 혼합 버전 허용이 필요하면 DB trigger 방식 또는 명시적 write quiesce가 추가 설계다.
- 기존 receipt 보존 기본은 2일(`ApmRetentionDays.java:76`)이다. 그 기간을 넘긴 같은 DELTA 본문의 재수신은 기존 중복 방어 범위를 벗어날 수 있다. dirty repair가 receipt 보존 밖의 중복 수신까지 해결한다고 주장하지 않는다.
- archive 원장 OK가 파일의 **최신 source generation**까지 보장하는지는 별도 확인이 필요하다. 현재 `ApmArchiveDropGate`는 OK 원장+관리 파일 여부를 본다. 이미 보관한 날을 repair로 바꾸면 archive freshness를 재검사하거나 다시 생성해야 하며, 이번 보존 설계를 checksum 손상 과제(순위 8) 해결로 혼동하지 않는다.

## 최소 변경 파일과 동시 작업 충돌

새 클래스 이름은 제안이다. 구현 시 패키지 순환과 `ApmArchiveGateArchTest` 호출처 규칙을 유지한다.

| 파일 | 변경 목적 | 순위 2~4와 겹침 |
|---|---|---|
| 새 Flyway migration | dirty/state/retired 상태·제약·인덱스 | 번호 충돌 확인. 현재 코드 변경은 하지 않음 |
| 새 `core/batch/rollup/ApmMetricDirtyStore.java` | 원자 enqueue/version ACK/유한 queue 슬롯/부트스트랩 상태 | 없음 |
| 새 `core/batch/partition/ApmMetricPartitionGuard.java` | 시간창·retired cutoff·공유/배타 날짜 잠금의 공통 규약 | 7번과 공동 책임 |
| `collector/ingest/store/ApmMetric1mStore.java` | 실제 적재 bucket의 dirty 등록을 수신 tx에 연결 | 2~4의 저장값/Row 결과를 소비. 현재 수정 완료본 기준으로 읽어야 함 |
| `collector/ingest/store/MetricIngestor.java` | DDL 전/수신 tx 안 guard, 같은 receipt tx에 dirty·실패 연결 | **직접 충돌 가능성이 가장 높음.** 2~4 완료 후 소유권 인계 |
| `core/batch/rollup/ApmRollupService.java` | frontier/repair 공통 runner, DB stage lock, 5m→1h 전파, tx/ACK | 없음 |
| `core/batch/rollup/ApmRollupJob.java` | forward/repair 예산·실행 요약·실패 구분 | 없음 |
| `core/batch/retention/ApmRetentionService.java` | rollup+archive guard 결합, archive OFF에서도 보호 | 없음 |
| `core/batch/retention/ApmRetentionJob.java` | rollup 보류와 archive 보류를 구분해 요약 | 없음 |
| `core/batch/partition/ApmPartitionService.java` | 필요 시 DROP 후 retired 기록/DDL 유효성 hook. 가능하면 기존 guard 확장으로 최소화 | 7번과 겹침 |
| `core/setting/ApmSettingService.java` | watermark 저장을 같은 트랜잭션에 참여시키는 경로 점검. 기존 REQUIRED는 외부 tx에 참여 가능 | 직접 변경 없이 재사용 가능 |
| `core/batch/retention/ApmRetentionPolicy.java` | 유효 보존 정책 사용, 임계 설정 변경 시 캐시/재검사 정책 | 필요 범위만 |
| 새/기존 실제 PG IT | late repair·ACK race·retention race·rollback·bootstrap | `ApmMetricIngestAtomicityIT`는 단계 2~4 담당자와 조율 |

`otel/metric/OtlpMetricPoint.java`, `OtlpMetricsReader.java`, 새 `OtlpMetricIdentity.java`, `collector/ingest/normalize/CumulativeDeltaTracker.java`, `ApmCumulativeProperties.java`는 현재 순위 2~4 작업 소유다. 순위 5가 이 파일에서 다른 계열 식별·역순·bounds 알고리즘을 다시 구현하지 않는다. 시간창 필터를 reader에 둘지 ingestor에 둘지는 완료된 포인트 모델과 폐기 사유 계약을 확인한 뒤 결정한다.

## 필수 PostgreSQL 검증 행렬

| 시나리오 | 조작 | 완료 기준 |
|---|---|---|
| 부분 지연 | 10 집계 후 같은 bucket에 +5, watermark 유지 | 1m/5m/1h=15, 다음 실행도 15 |
| 여러 시간 전 지연 | 10분 밖·몇 시간·지원 지연 끝의 원본 적재 | lookback 폭과 무관하게 queue로 복구 |
| 영수증 중복 | 같은 토큰·같은 본문을 재전송 | 원본/상위 수치 증가 없음, 불필요 dirty 증가 없음 |
| 다른 원시계열 지연 | 여러 instance·dims·서비스를 같은 bucket에 혼합 | 전체 재집계 합과 source 기준 모델 일치 |
| 처리 중 재도착 | worker generation 읽기·source snapshot 뒤에 latch, 다른 connection ingest commit | 오래된 ACK가 신규 marker를 지우지 않음, 다음 회차 최종값 일치 |
| 두 worker | normal-forward/repair 동시 진입, 느린 worker를 늦게 해제 | DB stage lock으로 결과 역행 없음 |
| 전파 실패 | 5m UPSERT 후 1h marker 기록/ACK 지점에 DB 예외 | 5m·1h marker·ACK·watermark 함께 rollback, 재실행 복구 |
| 수신 실패 | 원본 UPSERT 후 dirty 등록 실패 또는 큐 신규 key 초과 | receipt·1m·tracker 공개 모두 rollback, 503 후 재시도 1회 적재 |
| 보존과 producer | producer 날짜 공유 잠금 상태에서 retention 실행 | commit을 기다리거나 보류, 이후 dirty 확인 없이 DROP하지 않음 |
| 보존과 consumer | rollup source snapshot 진행 중 retention DROP 진입 | 원본·대상 삭제가 재집계 tx와 안전하게 직렬화 |
| DROP 직후 재수신 | DDL 준비 전/후에 DROP·자정·보존 단축을 끼움 | expired/retired 날짜 partition 재생성·부분 집계 없음 |
| archive 조합 | OFF/ON/continue/maxHoldDays 각각 미집계 원본 | archive 설정으로 rollup 보호 우회 불가 |
| raw 보존 종료 | 미집계 raw가 nominal retention 초과 | 상위 완료 전 유지, 5m 완료 후 정상 정리 |
| 5m 보존 종료 | raw 또는 5m repair가 남은 날짜를 삭제 대상으로 설정 | 1h까지 정산 전 5m 유지 |
| 장기 중단 | 다일 backlog+작은 회차 예산+재기동 | marker/cursor 보존, 상한 준수, 최신과 과거 모두 진행 |
| 원본 일부 삭제 | 과거 1h 중 일부 5m source가 없음 | 기존 상위 합계를 불완전 source로 축소하지 않음, 복구 불가 표시 |
| bootstrap | 도입 전 watermark 뒤의 불일치 fixture, 중간 crash | 보존 보호+재시작 이어가기+남은 원본 범위 정산 |
| 자료형 의미 | GAUGE·counter·hist mismatch·exemplar fixture | 기존 집계 의미 및 min/max/null 규칙 유지 |
| 시간대·경계 | 서버 기본 시간대, 자정/5분/정시 양옆 | source/target/queue/retention의 같은 버킷·날짜 판정 |
| 사용자 보존 변경 | raw/5m 보존을 기본값과 다르게 설정 | 상수 7/30일 아닌 실제 유효 정책 적용 |

테스트용 실패 지점은 production API로 노출하지 않고 테스트 DB trigger·두 connection·latch 등으로 만든다. 실행 중 `sleep` 시간으로 운 좋게 경합을 맞추는 테스트는 피한다. 실제 DB가 없어 skip된 결과를 완료 증거로 사용하지 않는다.

## 구현 진입·완료 기준

순위 2~4 커밋 이후 그 코드 기준으로 소유권을 인계받는다. 먼저 부분 지연과 보존 선행 삭제 반례를 실제 PG에서 재현하고, queue·트랜잭션·날짜 guard를 도입한 뒤 같은 반례가 자동으로 복구되는지 확인한다. 마지막으로 rollover·queue 상한·다중 connection 경합·bootstrap을 검증한다.

**완료는 “늦게 받은 원본을 언젠가 다시 더한다”가 아니라, “수신 성공한 지원 범위의 원본은 하위→상위에 정산되거나 명시적 미완료로 남고, 그 전에 삭제되지 않으며, 실패·동시 수신·재기동 후에도 재시도할 수 있다”는 불변식이 입증된 상태다.** 실제 지원 처리량은 별도 복합 부하시험으로 확정한다.
