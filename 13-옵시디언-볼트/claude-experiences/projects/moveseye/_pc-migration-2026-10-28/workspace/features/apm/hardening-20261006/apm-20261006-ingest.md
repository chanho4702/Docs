# APM 메트릭 수신 원자성 검토·개선 — 2026-10-06

## 범위와 기존 결함

`moveseye-docs/overview/apm-gap-report.md` R1을 실제 코드로 확인했다. 기존 수신은 영수증 조회 → 덧셈 UPSERT → 별도 `REQUIRES_NEW` 영수증 저장이었다. 동시 재전송 두 요청이 함께 조회를 통과하거나 적재 후 영수증 저장이 실패하면 count·sum·histogram이 중복될 수 있었다. 1m 배치 중간 실패에는 이전 SQL만 남을 수 있었고, DB만 롤백해도 CUMULATIVE 직전값이 앞서 갱신되어 재전송 증분을 잃는 문제가 있었다.

## 반영 내용

- 메트릭 HTTP 수신을 `ApmIngestPipeline.ingestOnce` → `MetricIngestor.ingestOnce`로 연결했다. 트레이스 경로의 기존 계약은 유지한다.
- 파싱·서비스/인스턴스 귀속·파티션 준비 이후 `ApmMetricBatchWriter`가 PostgreSQL `INSERT ... ON CONFLICT DO NOTHING`으로 영수증을 선점한다. 영수증 INSERT, 히스토그램 경계 등록, 모든 1m UPSERT와 경계 충돌 무효화를 하나의 트랜잭션에 담는다. 선점 실패는 DB 장애로 전파하고, 이미 커밋된 동일 본문은 데이터 변경 없이 성공한다.
- 중간 SQL 또는 commit 실패 시 영수증과 데이터 모두 롤백한다. 일부 리소스 귀속이 장애로 실패한 배치도 전체 미수용·HTTP 503으로 반환해 정상 부분만 남고 나머지가 사라지는 경로를 막는다. 정책상 제외·빈 배치는 기존처럼 HTTP 200이다.
- CUMULATIVE는 `(serviceId, instanceId)`로 256개 stripe 중 잠금을 정하고 오름차순으로 획득한다. 이번 배치의 변경분만 메모리에 보관하고 DB commit이 완료되면 공유 직전값에 반영한다. 실패 시 변경분을 폐기한다. 전체 메모리 snapshot을 되돌리지 않는다. DELTA·GAUGE만 있는 배치는 이 잠금을 사용하지 않는다.
- bounds ID는 트랜잭션 안에서 재사용하되 commit 후에만 공유 캐시에 공개한다. Spring transaction resource로 O(1) 조회하며 `suspend`·`resume`·`afterCompletion`에서 명시적으로 분리·복원·해제한다. 트랜잭션 안의 경계 SQL 실패는 예외를 전파한다. 새 `(bounds, family)` 등록도 전역 키 순서로 선행 처리하여 1m 행 정렬 이전 UNIQUE 잠금 교착을 막고 원본 관측 순서는 보존한다.
- route 워밍 SELECT가 트랜잭션을 abort시키면 즉시 예외를 전파한다. CUMULATIVE 첫 관측만 있어 후속 SQL이 없는 배치도 성공으로 오인하지 않는다. 워밍 완료 표시는 조회가 성공한 뒤 설정하여 재전송 시 재워밍한다.
- live 링·폐기 카운터는 commit 후 반영한다. 폐기 통계 flush는 JDBC 트랜잭션 종료 후 수행한다. 수집기 상태·K8s 보강은 데이터와 영수증 commit 뒤 실행하며 부가 관측의 실패로 커밋된 데이터를 재전송시키지 않는다.
- Flyway 변경은 없다. 영수증의 기존 `(token_id, body_sha256)` UNIQUE를 이용한다. HTTP 성공 `{}`와 장애 시 실제 HTTP 503 계약을 유지한다.

## 검증

실제 PostgreSQL IT에 다음을 추가했다.

1. 독립 CUMULATIVE tracker 두 개를 쓰는 동시 동일 본문 요청: 하나만 수용되고 count·sum·histogram이 한 번만 증가.
2. 응답 소실 후 동일 본문 재전송을 직접 `ingestOnce` 재호출로 모사: DB·live 중복 없음. 실제 HTTP 패킷 소실 실험은 하지 않았다.
3. 배치 중간 PostgreSQL trigger 실패: 데이터·영수증·CUMULATIVE 모두 미반영, 같은 본문 재전송 후 정확한 합계.
4. deferred receipt trigger로 commit 자체 실패: 직전 커밋 CUMULATIVE 값 유지, 재전송 후 빠진 증분 복구.
5. receipt FK 실패: 데이터·메모리 변경 없음.
6. 부분 서비스 귀속 장애: 정상 부분도 저장하지 않고 장애 해소 후 배치 전체 저장.
7. 빈 배치·정책상 제외 배치: 성공 및 중복 방어 유지.
8. 새 히스토그램 경계 등록 후 적재 실패: DB 경계 행과 공유 bounds ID 캐시 모두 롤백·미공개, 재전송 시 유효한 경계 ID 복구.
9. cold route 워밍 SQL 실패 + 전부 CUMULATIVE 첫 관측 제외: 영수증·차분 상태 미반영, 재전송 때 워밍 재실행.
10. 새 raw bounds 두 개를 역순으로 가진 동시 배치: PostgreSQL bounds INSERT에 지연을 주어도 두 배치가 교착 없이 완료.

추가 단위 테스트는 실패한 차분 배치의 직전값 보존, 같은 배치 내 연속 관측, 별도 인스턴스의 병렬 진행·실패 격리를 검증한다. Controller 테스트는 원자적 경로 및 K8s 보강 실패 시 재전송 방어를 따른다.

1차 `collector.ingest.*` 실행은 514건 중 513건 통과, 기존 `LiveMetadataCacheIT.warmLiveEndpointHasZeroSqlQueriesAndNeverTouchesLastSeen` 1건 실패(SQL 0 기대/4 실측)였다. 신규 원자성 PostgreSQL IT 7건은 모두 통과했다. 해당 기존 테스트의 전역 Hibernate SQL 통계에 백그라운드 SQL 또는 시간 민감한 캐시 재조회가 섞였을 가능성이 있으나 원인을 확정하지 않았다.

2차는 확장된 원자성 IT 9건과 위 기존 테스트 단독 1건을 실행하여 10건 모두 통과, 실패·skip 0건이었다. XML은 `_workspace/_archive/features/apm/hardening-20261006/apm-20261006-ingest-tests/second-run`에 보존했다. 리뷰 후 추가한 regression과 최종 관련 테스트 결과는 다음 두 문단을 따른다.

3차 store/normalize/drop/controller/pipeline 선별 실행은 238건 중 235건 통과했고 신규 PostgreSQL 원자성 IT 11건은 전부 통과했다. 기존 bounds 등록 mock 2건은 pre-pass의 미확보 ID를 후속 처리에서 다시 조회/등록하던 회귀로 실패했다. pre-pass 결과를 배치 Map으로 재사용하도록 수정했다. 기존 StoreIT 1건은 각 테스트가 token을 삭제하면서 singleton 폐기 통계의 pending을 flush하지 않아 이전 token의 FK 위반이 발생했다. 해당 fixture에 토큰 삭제 전 `AfterEach` flush를 추가했다. XML은 `_archive/features/apm/hardening-20261006/apm-20261006-ingest-tests/third-run`에 보존했다.

수정 후 최종 `collector.ingest.store.*` 실행은 **86건 통과, 실패 0·오류 0·skip 0**이며 PostgreSQL 원자성 **11건**도 다시 통과했다. `BUILD SUCCESSFUL`(2분 24초), JDK 17·`--max-workers=1`로 단독 실행했다. 최종 XML 12개는 `_workspace/_archive/features/apm/hardening-20261006/apm-20261006-ingest-tests/final-store-run`에 보존했다. 마지막 수정은 store pre-pass 결과 재사용과 해당 IT fixture이며, 앞선 3차 normalize/drop/controller/pipeline 검증은 모두 통과했다. 소스·테스트 컴파일과 담당 경로 `git diff --check`도 통과했다. 전체 프로젝트 build와 다른 신호 회귀는 루트 담당자가 순차 검증한다.

R1은 원자적 영수증·DB 적재와 확인 가능한 rollback 경로를 보완했지만, 아래 durable checkpoint 미구현 때문에 모든 장애 형태에 대한 최종 해결로 표시하지 않는다.

## 보장 범위와 남은 제한

- 영수증의 정확히 한 번 반영 범위는 같은 토큰·같은 gzip 해제 본문·영수증 보존 기간 안이다. 서로 다른 토큰이나 본문이 다르면 별도 배치다. 영수증 정리는 기존 보존 정책을 따른다.
- DB 영수증 선점은 다중 BE의 동일 본문 경합을 막지만, CUMULATIVE 직전값 자체는 여전히 노드 로컬이다. 같은 시계열의 서로 다른 배치가 여러 BE로 분산되거나 BE가 재시작될 때 정확성을 보장하는 공유 checkpoint는 이번 범위가 아니다. 단일 BE 또는 시계열 고정 라우팅 범위를 유지해야 한다.
- 프로세스가 DB commit 직후 메모리 직전값 공개 전에 강제 종료되면, 재기동 후 기존 첫 관측 정책을 따른다. DB가 commit했지만 연결 단절로 애플리케이션이 commit 결과를 확인하지 못한 경우도 메모리 checkpoint와 DB가 어긋날 수 있다. 영수증은 동일 본문의 재적재를 막지만 이후 서로 다른 CUMULATIVE 배치까지 완전한 연속성을 보장하려면 durable checkpoint가 필요하다.
- stripe hash 충돌이나 한 배치가 많은 인스턴스를 포함하면 요청 간 잠금 경합이 생길 수 있다. 전역 수신 lock은 없고 DB 연결은 stripe 획득 뒤 얻는다. 운영 규모의 TPS·p95·메모리 부하 실측은 별도 검증이 필요하다.
- 서비스 자동 등록과 파티션 DDL은 적재 실패 후에도 남을 수 있는 독립 메타데이터다. route 상한의 관측 집합도 정규화기의 기존 로컬 정책을 유지한다. 1m 데이터·영수증·CUMULATIVE 수량 원자성과 구분한다.
- 공유 BE 재기동·커밋·푸시는 수행하지 않았다.
