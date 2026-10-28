# APM 메트릭 원자적 수신 독립 검수 — 2026-10-06

## 범위와 상태

검수자는 이 수신 구현을 작성하지 않았으며 코드·테스트를 읽기 전용으로 검토했다. Gradle·DB 명령은 실행하지 않았다. 대상은 `ApmMetricBatchWriter`, `MetricIngestor`, `CumulativeDeltaTracker`, `ApmMetric1mStore`, `ApmIngestDropStatRecorder`, 파이프라인·Controller 변경 및 `ApmMetricIngestAtomicityIT`다.

**신규 차단 결함 2건을 전달한 뒤, 수정된 소스를 독립 재검수하여 둘 다 코드 수준에서 해소됐음을 확인했다.** 아래 F1/F2의 발생 근거는 수정 전 코드 기록이다. 검수자는 실행을 담당하지 않았다. 루트가 이후 `_archive/features/apm/hardening-20261006/apm-20261006-ingest-tests/final-store-run`의 XML을 확인했으며, 저장소 회귀 86건·그 안의 PostgreSQL 원자성 11건은 실패·건너뜀 없이 통과했다. 두 지적의 실행 증거는 이 최종 결과를 따른다.

## F1. 새 히스토그램 경계를 역순으로 등록하면 트랜잭션끼리 교착할 수 있음

- 재검수 상태: **코드 독립 검수 및 루트의 최종 PostgreSQL 통과 증거 확인.** `prepareBounds`가 모든 필요 경계를 `(family + bounds 표현)`의 `TreeMap` 순서로 선등록한다. 사전 계산과 `resolveBounds`의 canonical/observed family 분기가 일치하며, 원래 관측 rows를 정렬하지 않아 기존 병합 순서를 보존한다.
- 신규 회귀 확인: `reversedNewBoundsBatchesCompleteWithoutUniqueLockDeadlock`은 서로 다른 영수증·독립 Store 두 개를 동일 시작점에서 실행하고, 실제 PostgreSQL bounds INSERT에 지연을 넣어 역순 raw 경계 경합을 만든다. 두 결과가 각각 2행, 최종 count/sum/hist 합계가 24, 영수증이 2건임을 검증한다.
- 중요도: 높음. 실패 배치 롤백으로 수량 정합성은 보호되지만, 정상 동시 수신에 재시도·지연을 유발하는 새 교착 경로다.
- 근거: `ApmMetric1mStore.store` 363~364행은 입력 `rows` 순서대로 `resolveBounds`를 호출한다. 새 경계는 `boundsIdForFamily` 593행에서 `apm_hist_bounds`에 INSERT한다. 저장 행의 `BATCH_LOCK_ORDER` 정렬은 376행으로 그 뒤다.
- 재현 조건: 서로 다른 본문 A/B가 신규 raw 경계 X/Y를 각각 X→Y, Y→X 순서로 포함한다. DELTA 배치라 `CumulativeDeltaTracker`의 잠금을 잡지 않아도 되는 조건이면 같은 프로세스에서도 동시에 진입한다. A가 X의 UNIQUE 잠금, B가 Y의 UNIQUE 잠금을 보유한 채 반대 키를 기다리면 교착한다. 기존 autocommit 경계 등록과 달리 이제 영수증·전체 적재 트랜잭션 종료까지 잠금을 보유한다.
- 권고: `(bounds, family)` 전역 순서로 필요한 경계를 선등록한 뒤 사용하거나 동일 순서의 등록 경로를 보장한다. metric row의 PK 정렬만으로는 해결하지 못한다.
- 완료 증거: 실제 PostgreSQL에서 신규 raw 경계를 역순으로 싣는 동시 두 배치가 모두 성공하고 값·영수증이 각각 한 번만 남는 회귀가 필요하다. 이번 검수자는 실제 재현을 실행하지 않았다.

## F2. route 워밍 SQL 오류를 삼키면 빈 적재 배치에서 거짓 성공 가능

- 재검수 상태: **코드 독립 검수 및 루트의 최종 PostgreSQL 통과 증거 확인.** 활성 트랜잭션의 route 워밍 SQL 오류를 다시 던지고 `warmed=true`는 loader 성공 뒤 설정한다.
- 신규 회귀 확인: `coldRouteSqlFailureCannotAcknowledgeFirstCumulativeObservation`은 실제 DataSource를 사용하는 JdbcTemplate의 첫 워밍에서 `SELECT 1 / 0`을 실행한다. 단순 mock 예외가 아니라 PostgreSQL 트랜잭션을 실제 aborted 상태로 만드는 구성이다. 실패 뒤 영수증·rows·baseline 0, 정상 재시도 뒤 워밍 총 2회·영수증 1·baseline 1·rows 0을 검증한다. 마지막 rows 0은 오래된 CUMULATIVE 최초 관측을 기준값으로만 받는 정상 정책이다.
- 중요도: 높음. 200 응답·영수증 없음·메모리 기준값 진행이 엇갈릴 수 있다.
- 근거: `MetricIngestor.ingestOnce`가 receipt 트랜잭션 안에서 `ingestRows`→`toRow`→`normalizer.normalize`를 호출한다. cold cache에서는 `ApmDimsNormalizer.loadKnownRoutes`의 JDBC SELECT(305행)가 실행되며, 317행 catch는 SQL 예외를 `Set.of()`로 접는다.
- 재현 조건: route 워밍 SELECT가 PostgreSQL 트랜잭션을 aborted로 만드는 오류를 내고, 배치가 모두 `CUMULATIVE_FIRST_SKIPPED`여서 저장할 rows가 0개가 되는 경우다. 이후 SQL이 없으므로 `write.get()`이 정상 반환한다. JDBC commit이 aborted 트랜잭션을 실제로 rollback한 것을 서비스의 성공으로 취급하면 영수증은 사라지지만 `inBatch`가 메모리 기준값을 공개할 수 있다. 상위 작업자가 이미 수정한 bounds SQL 예외 삼킴과 같은 실패 계열이다.
- 테스트 공백: 검토 시 `ApmMetricIngestAtomicityIT.create`는 `new ApmDimsNormalizer(null)`을 사용하므로 실제 route 워밍 SQL이 실행되지 않는다.
- 권고: 활성 트랜잭션에서는 SQL 예외를 전파하거나 워밍을 적재 트랜잭션 전에 수행한다. `RouteSet.warmOnce`의 `warmed=true`도 loader 성공 뒤로 옮겨 실패한 조회가 완료로 남지 않게 한다.
- 완료 증거: 실제 PostgreSQL 오류를 낸 뒤 저장 rows 0인 조건에서도 HTTP 성공으로 끝나지 않고, 영수증·baseline이 남지 않으며 다음 정상 재전송이 올바르게 처리되는 회귀가 필요하다. 단순 mock 예외는 PostgreSQL aborted 상태를 만들지 못한다.

## 정합성 측면에서 확인한 개선

- `ApmMetricBatchWriter`의 `REQUIRES_NEW`가 반환 전에 commit을 확정하며, UNIQUE 영수증 claim과 덧셈 적재를 한 트랜잭션에 묶는다. `ON CONFLICT DO NOTHING` 반환값으로 이미 처리한 본문을 구분한다.
- CUMULATIVE 기준값은 ThreadLocal 임시 맵에 담고 writer가 정상 반환한 뒤 공유 맵으로 옮긴다. 롤백 예외가 전파되면 임시 맵을 폐기한다. 인스턴스별 striped lock을 정렬해 잡고 역순으로 풀며 sweep은 `tryLock`으로 교착을 피한다.
- bounds ID 캐시는 트랜잭션별 임시 값을 재사용하고 commit 이후 공유 캐시에 반영한다. bounds SQL 예외는 활성 트랜잭션에서 전파하도록 수정되어 있다.
- live 링과 손실 통계는 commit 후에 공개하고, 서비스 귀속 장애는 배치 일부만 성공 처리하지 않고 영수증 트랜잭션 진입 전에 전체 실패로 돌린다.
- 파티션 준비를 receipt 트랜잭션 전에 수행해 rollback된 DDL을 캐시가 존재한다고 믿는 경로를 줄였다.
- 신규 IT는 동일 본문 경합, 응답 유실 재시도, 중간 SQL 실패, 지연 receipt commit 실패, bounds rollback, 잘못된 토큰 claim, 일부 서비스 귀속 장애, 빈/정책 전용 배치를 다룬다. 테스트 작성은 확인했지만 실제 실행 결과는 담당자의 산출물을 따라야 한다.

## 추가 성능 수정의 재검수

- 처음 지적한 `transactionBoundsCache()`의 synchronization 목록 복사·순회는 제거됐다. Store 인스턴스를 키로 `TransactionSynchronizationManager.getResource`를 조회하고, 트랜잭션별 cache를 한 번 등록한다. 이제 bounds cache 접근은 평균 O(1)이며 포인트별 drop callback 개수에 비례해 목록을 재탐색하지 않는다.
- `suspend`에서 해당 resource를 해제하고, `resume`에서 기존 cache를 복구하며, commit 이후에만 공유 cache에 공개한다. `afterCompletion`은 commit/rollback 모두에서 resource를 해제한다. 코드상 `REQUIRES_NEW`의 바깥/안쪽 cache 수명 분리가 타당하다.
- 새 cache의 중첩 `REQUIRES_NEW` suspend/resume을 직접 검증하는 전용 테스트는 확인하지 않았다. 기존 실제 수신은 자체 `REQUIRES_NEW`를 시작하며, rollback 뒤 재시도 IT가 cache의 기본 수명을 검증한다.

## 대규모/다중 노드 검증의 남은 범위

- 포인트별 drop callback과 큰 배치의 메모리·처리시간은 여전히 실측 대상이다. 위 O(N²) cache 탐색 제거를 대규모 처리량 보증으로 해석하지 않는다.
- CUMULATIVE 배치는 필요한 stripe들을 DB commit까지 보유한다. 256개 stripe의 hash 충돌과 여러 인스턴스를 포함한 큰 배치의 교집합 때문에 무관한 배치도 대기할 수 있다. 단일 인스턴스 2개 단위 테스트는 큰 배치의 처리량 보장이 아니다.
- 서로 다른 프로세스의 CUMULATIVE 기준값은 여전히 공유하지 않는다. 동일 본문의 중복 claim 테스트가 통과해도 후속 서로 다른 CUMULATIVE 본문을 다른 노드에 분산했을 때의 값 정합성을 증명하지 않는다.
- 프로세스 종료·DB commit 응답 유실·실제 OTel Collector 재전송과 대량 수신 지연은 별도 종단 검증 범위다.

최종 소스 재검수에서 추가 원자성 차단 결함은 발견하지 못했다. F1/F2의 수정 방향과 테스트 검출 지점은 적절하며, 최종 실행 결과는 구현 담당자의 보존된 산출물과 함께 판단한다. 보고서의 미검증 항목을 완료로 간주하지 않는다.
