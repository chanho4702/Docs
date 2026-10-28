# APM trace 재분류 집계 교정 계약

작성: 2026-10-06. 우선순위 6 구현. **제품 편집·회귀 작성 완료, 실행 검증은 root 대기**.

## 변경 내용

CLIENT span만 먼저 도착하면 외부 HTTP로 집계된다. 이후 다른 서비스의 자식 span이 도착해 SERVICE로 재분류되더라도 이전 HTTP edge와 외부 dependency 행이 남던 문제를 교정했다.

`ApmTraceRollupService`가 재계산할 **전체 서비스의 동일 부모 5분 버킷**에서 `apm_service_edge_5m`, `apm_dependency_5m`을 먼저 DELETE하고, 같은 트랜잭션·같은 PostgreSQL snapshot에서 기존 SQL로 다시 만든다. 더 이상 결과에 없는 키는 사라진다. count/error/histogram/bounds/min/max 의미와 분류 우선순위는 유지한다. 자식은 다른 서비스인지로 판정하는 기존 규칙을 유지하며 SERVER만으로 제한하지 않는다.

삭제 구간은 `[rebuildFrom,toExclusive)`다. 자식 look-ahead 5분은 읽기에만 적용하므로 그 다음 부모 버킷을 삭제하지 않는다. 같은 target의 호출 중 일부만 내부 호출로 해소되면 외부 dependency는 남은 실제 외부 호출 수로 줄어든다.

## API 계약 및 FE 영향

제품 endpoint·메서드·요청 필드·응답 DTO·에러코드·권한은 변경하지 않았다. 서비스 맵/외부 의존 조회가 사용하는 기존 집계 데이터만 정확해진다. 새 endpoint나 FE 필수 타입 변경은 없다. 정상 조회에서 이전 외부 노드 또는 dependency가 사라지고 SERVICE 호출로 표시될 수 있다.

대상 소비 경로: `GET /apm/service-map`, `GET /apm/service-map/edges/series`, `GET /apm/dependencies`, `GET /apm/dependencies/series`.

배치 내부 `RollupResult(Map<String,Integer> rows, LocalDateTime from, LocalDateTime to)`의 shape 및 rows의 여섯 key는 유지한다. from/to는 **이번에 재계산한 범위**이고 watermark가 전진했다는 보증은 아니다. 빈 forward 창에서 lookback 교정이 있으면 결과를 반환하고 교정을 commit하되 watermark 저장만 생략한다. 기존 잡의 실행 요약은 처리한 행 수를 그대로 표시한다. 로그에는 삭제 행 수와 `watermarkHeld`를 추가했다.

## 트랜잭션·동시 실행

1. target partition DDL과 histogram bounds 준비는 집계 트랜잭션 밖에서 수행한다.
2. 집계용 `TransactionTemplate`은 `REQUIRES_NEW` + `REPEATABLE_READ`를 사용한다. 다른 SQL 사이에 도착한 자식은 한 회차의 edge/dependency를 서로 다른 상태로 만들지 않으며 다음 replay에서 함께 반영된다.
3. 첫 SQL은 `LOCK TABLE public.apm_span IN ACCESS SHARE MODE NOWAIT`다. ONLY를 쓰지 않아 현재 붙은 자식 파티션도 잠그고, catalog/원본 관측 전부터 commit까지 유지한다. 일반 INSERT와 호환된다. 먼저 진행 중인 DROP/DDL이 있으면 잠금 대기 없이 예외로 해당 회차를 실패시키고 재시도한다.
4. 두 인자의 trace 전용 `pg_try_advisory_xact_lock`으로 집계 writer를 하나로 제한한다. 수신의 trace hash 한 인자 락과 별개다. 다른 집계가 소유하면 아무 집계 DML 없이 종료한다.
5. 계획 시 읽은 watermark와 트랜잭션 안의 값을 다시 대조한다. 기존 행을 `FOR UPDATE`로 잠가 RR snapshot 이후 변경도 serialization failure로 처리한다. 최초 행이 없으면 빈 값 placeholder를 `INSERT ... ON CONFLICT DO NOTHING`으로 같은 트랜잭션에 준비하여 concurrent 최초 INSERT도 검출한다. 실제 watermark 저장은 기존 `ApmSettingService`를 통한다. 실패 시 placeholder도 rollback된다.
6. DELETE·여섯 집계·watermark는 같은 트랜잭션이다. SQL/후속 단계/commit 실패는 기존 집계와 watermark를 모두 복원하고 예외를 상위 잡에 전달한다.

source relation lock은 해당 회차의 전체 raw partition DDL을 지연시킬 수 있다. 최대 batch 시간과 WAL/dead tuple 증가는 별도 실측 대상이며 이번 편집에서 성능 측정을 실행하지 않았다.

## 보존 경계와 원본 가용성

- 하드코딩된 7일 대신 `ApmRetentionPolicy.authoritativeDays().spanDays()`를 사용한다. 조회용 캐시/DB 오류 폴백을 쓰지 않는다. 계획 중 설정이 달라지면 이번 회차는 다시 계산하도록 보류한다.
- cutoff는 서버 기본 시간대의 `오늘−spanDays` 날짜 00:00이다. 그 이전 집계는 지우지 않는다. 오래된 watermark는 실제 재계산 가능한 cutoff부터 진행한다.
- 날짜 relation lock을 유지한 채 `ApmPartitionService.listPartitions(apm_span)`으로 실제 부착된 partition을 확인한다.
- 선행 lookback 날짜가 없고 forward 날짜보다 이전이면 그 누락 날짜는 기존 집계를 보존하고 하한을 올린다. forward 또는 중간 날짜, 자식 look-ahead 날짜가 없으면 회차 전체를 보류한다.
- 원본 partition이 존재하지만 범위에 0행이면 정상 빈 관측이므로 옛 edge/dependency도 제거한다. 원본 partition 누락을 0행이라고 추정하지 않는다.
- partition 존재는 수동 부분 DELETE·동명 재생성 이후의 역사적 완전성까지 보증하지 않는다. 운영자의 원본 변경·복구는 별도 검증이 필요하다.

## 교정 범위와 한계

기존 lookback 2개 버킷, LAG 3분, 자식 look-ahead 5분, maxBuckets 상한 의미를 유지한다. 고정 '13분까지 보장' 표현은 삭제했다. 교정 조건은 부모 버킷이 replay 구간에 있고 자식 start가 join 구간에 있으며 동일 snapshot에서 관측되는 것이다.

이미 replay 범위 밖으로 지나간 오래된 오염은 자동 교정하지 않는다. 원본이 완전히 남은 구간에 별도 제한된 backfill이 필요하다. span 보존보다 긴 전체 집계를 삭제하여 다시 채우는 작업은 하지 않는다.

우선순위 5 메트릭 dirty/retention/partition 코드와 우선순위 7 trace/RUM 수신 시간창은 변경하지 않았다. source partition 누락으로 집계가 보류되는 경우에는 로그와 실제 원본 상태를 확인해야 한다.

## 변경 파일과 호환성

- `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/rollup/ApmTraceRollupService.java`
- `moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/trace/rollup/ApmTraceReclassificationIT.java`
- 기존 `ApmTraceRollupIT`, `ApmRollupTransactionRollbackIT`: 자정 전후에도 빈 forward/child 날짜의 source partition이 존재하도록 fixture만 보완. 기존 assertion은 유지.

Spring 생성자에 `ApmRetentionPolicy` 의존성을 추가했다. 기존 저장소에서 직접 생성하는 테스트는 없었고 새 IT의 직접 생성에는 모두 인자를 반영했다. 신규 migration·dependency·설정값은 없다.

## 검증 상태와 실행 대상

작성한 새 IT: 14개 메서드, 보존 1일/14일 parameterized 사례를 포함한 **15회차 예정**. 현재 실행 결과는 없다.

| 회귀 | 검증할 결과 |
|---|---|
| 외부→내부 2회 집계/재실행 | HTTP/dependency 제거, SERVICE count/hist/min/max 안정 |
| 여러 서비스·동일 target 혼합 | 전체 서비스 삭제 범위, 외부 2→1 및 다른 호출 보존 |
| 빈 forward | lookback 교정 commit, watermark 유지 |
| 양끝 sentinel/자식 다음 버킷 | 부모 범위만 삭제, look-ahead는 읽기만 |
| 원본 0행/원본 partition 누락 | 각각 stale 집계 제거/기존 집계 보존 |
| 실제 보존 1일·14일 | 설정 정본 반영, cutoff 이전 보존 |
| 단계 실패/deferred commit 실패 | 기존 행의 전체 값 및 watermark 복원 |
| 두 SQL 사이 별도 connection 자식 commit | 한 회차의 edge/dependency가 같은 RR snapshot 사용 |
| stage lock/stale plan | 중복 교체 및 watermark 역행 차단 |
| 원본 DROP 경합 | 실제 child relation lock 유지 및 상대 DROP lock timeout |
| 원본 DDL 선점 | 집계 NOWAIT 실패, 기존 집계 유지 |

root 실행 필터: `ApmTraceReclassificationIT`, `ApmTraceRollupIT`, `ApmRollupTransactionRollbackIT`를 우선 실행한다. SQL 소비 회귀는 `ApmTraceAggQueryIT`, `ApmTraceQueryIT`, 메시징/배치 롤업 IT를 기존 테스트 목록과 대조해 추가한다. 새 IT는 기존 `IntegrationTestSupport`와 같은 격리 PostgreSQL DB를 사용한다. skip이면 성공으로 간주하지 않는다.

정적 확인: 소유 product diff의 `git diff --check` 통과. Gradle·빌드·DB·서버·커밋은 root 지시에 따라 실행하지 않았다.

## 🔄 FE 요청사항

필수 수정 없음. 기존 조회 shape를 그대로 소비한다. runtime QA에서는 내부 호출로 해소된 외부 노드/의존 행이 다음 replay 후 없어지는지 확인하면 된다.
