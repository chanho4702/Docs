# APM 심층 진단 BE 구현 기록

2026-10-28 · C:/worktrees/apm-deep-be · codex/apm-deep-diagnostics-20261028

## 구현

- V93 nullable instance_id/process_run_uid/identity_source/diagnostic_kind. DBM worktree V90~V92와 번호 충돌 없음을 확인했다. 공유 DB에는 적용하지 않았다.
- 진단 OTLP의 실제 타입·중복 키·속성 허용목록·카운터식·상한·UUID/부모 ID를 검증하고 잘못된 span만 DIAGNOSTIC_INVALID로 계수한다. 일반 배치 자료는 계속 처리한다.
- 기존 서비스/인스턴스 resolver를 사용하고 run은 resource UUID만 저장한다. 진단 summary만 먼저 도착하면 일반 trace summary를 만들지 않는다. 일반 요청 도착 뒤 spanCount는 전체 저장 span 수이고 시간·오류·서비스 계산에는 진단을 넣지 않는다. 재전송 identity는 첫 저장값을 보존하고 충돌을 프로세스 로컬 LongAdder로 계수한다(기존 수신 계측 방식, identityConflictCount).
- 일반 상세의 SQL에서 diagnostic_kind를 LIMIT 전에 제외한다. flame/critical path는 같은 로더를 사용한다. 서비스 맵·오류·DB·외부 의존·메시징·job 집계 입력에도 제외 조건을 적용했다. RED는 기존 metric 기반이며 live는 기존 SERVER 모집단을 유지한다.
- GET /apm/diagnostics/capabilities, GET /apm/traces/{traceId}/diagnostics. 기존 로그인/visitor/APM 라이선스/읽기 권한/envelope를 유지한다. query flag 기본 OFF, 사용자당 동시 2, 성공 응답 내 개별 source 실패를 제공한다.
- SERVER 후보33 sentinel(반환32), 진단18 sentinel(정상 최대17), operations256, runtime 15분·32차원·8192행 및 JDBC 2초 timeout. 실제 직렬화 1MiB를 넘으면 runtime 시리즈부터 제거한다.
- 획득의 0/null·summary 미수신·below threshold·생략·미종료·수신 gap·중복 summary·식별 충돌·구간 union 하한을 분리했다. operations는 가장 가까운 SERVER 조상과 같은 서비스만 채택한다.
- 규칙 v1의 실제 acquireDelayMs/acquireRatio/poolUtilizationRatio 설정을 ruleThresholds로 반환한다.

## 정확성 때문에 좁힌 범위

기존 1m 적재는 memory pool/thread state 차원을 제거하고 각 포인트의 sum/count를 합친다. `MetricIngestor.valuesOf`는 GAUGE·UpDownCounter마다 count=1, sum=value를 만들고 `ApmMetric1mStore.Accumulator`는 단순 합산한다. 따라서 pool/state가 여러 개인 원본에서 JVM memory/thread 총량을 사후 복원할 수 없다.

이번 진단은 memoryUsed/memoryLimit/threads를 제외하고 METRIC_SEMANTICS_UNVERIFIED를 명시한다. CPU·GC·pool 6슬롯을 제공하며 기존 metric 저장·일반 runtime API 계약은 바꾸지 않았다. runtime은 항상 INSTANCE_TIME_WINDOW/CORRELATED/UNVERIFIED이고 service 집계 폴백은 없다.

archive-only 여부는 실제 archive 조회 없이 추정하지 않는다. hot span이 없는 저장 요약은 HOT_DATA_UNAVAILABLE/TRACE_INCOMPLETE로 표시한다.

## Collector / archive

Java 확장 담당의 Collector 0.159.0 실증에서 숫자로만 된 유효 span ID와 숫자 위주 run/pool UUID가 기존 PII regex에 손상됨을 확인했다. 정형 타입/regex 검증과 위치별 키 삭제 뒤 trace 전용 redaction의 정확한 4개 키만 예외로 둔다. logs는 기존 redaction/pii를 유지한다. 일반 카드·email 마스킹 및 로그 동명 key 마스킹이 유지되는 실증 파일은 Java worktree build/diagnostics-r0/redaction-fixed-20261028-152154/{collector.yaml,analysis.json}이다.

Collector 설정 생성기의 사용자 PII 규칙 변경도 trace/log 두 redaction 인스턴스에 함께 적용한다. 기존 keepRawSql·PII 옵션의 의미는 유지한다.

archive 원천은 SELECT *와 ResultSet metadata로 columns manifest를 만들므로 신규 nullable 4열을 자동 수용한다. UUID는 기존 text ColumnPlan으로 직렬화된다. 기존 ZIP은 변경하지 않으며 진단 API는 hot DB만 읽는다. 정형 진단 attrs의 archive 마스킹 보존 회귀를 추가했다. 실제 신규 ZIP 생성·구 ZIP 복원 왕복은 아직 실행하지 않았다.

## 검증

JDK17, Gradle heap512MiB, max-workers=1, 테스트 worker512MiB/1개와 Spring context cache1로 검증했다. `build/diagnostics-test.gradle`은 projectsEvaluated 단계에서 프로젝트 기본1GiB를 덮어쓰는 일회성 init script다. 테스트 worker 명령줄의 `-Xmx512m`도 확인했다.

| 검증 | 결과 | 보존 근거 |
|---|---|---|
| `build -x test` | PASS. 최초 Micrometer 의존성 부재를 기존 LongAdder 방식으로 수정 후 통과 | `build/diagnostics-build.log`, 최종 `build/diagnostics-final-build.log` |
| 진단/수신/요약/Collector/archive 선별 단위 | 109건·9 suites PASS, 실패/오류/skip0 | `build/diagnostics-unit-results/` |
| 진단/schema/query/trace rollup/reclassification/messaging/job 통합 | 107건·7 suites PASS, 실패/오류/skip0 | `build/diagnostics-it-results/` |
| 빈 DB Flyway | V93까지85개 migration 성공 적용 | 독립5435 `moveseye_it.flyway_schema_history` |
| diff whitespace | PASS | `git diff --check` |

IT 명령에는 `IT_DB_URL=jdbc:postgresql://localhost:5435/`, `IT_DB_USER=postgres`, `IT_DB_REQUIRED=true`를 고정했다. 공유5433 moveseye_it은 사용하지 않았다. 독립 컨테이너의 moveseye_it만 초기화했다.

신규 ApmDiagnosticsIT10건은 정형 OTLP→실제 TraceIngestPipeline→DB→diagnostics, 재전송 불변성·resource identity, 실제 MetricIngestPipeline으로 memory pool2개/thread state2개 수신 뒤 진단 제외, 100인스턴스 분리, 일반span5000+진단17의 LIMIT 전 제외·critical path, 후보32 상한·명시 선택, nearest SERVER 귀속, legacy/hot 자료 없음, 실제 JWT·visitor·라이선스·권한 체인을 포함한다.

정적 QA에서 발견한 GC HIST_SUM의 count=0,sum=0 버킷 유실은 GAUGE에만 count>0 조건을 적용하도록 수정했다. `observedZeroGcIsNotMissingData`는 관측0ms와 다음 버킷 미수신null을 구별하며 통과했다. 계약 shape 추가 변경은 없다.

최종 실행 JAR: `C:/worktrees/apm-deep-be/build/libs/moveseye-be-0.0.1.jar` (107,123,767 bytes, 2026-10-28 16:07:10 KST). SHA256: `81CB1F1CE00E1AF6C2B4D01ECA5EAAFF049F137FC1B59650D0D95894D6298515`. 최종 `build -x test`도 PASS(3분11초)이며 runtime QA에 전달했다. BE 빌드/테스트 프로세스는 모두 종료했다.

## 남은 R0 위험

전체 Collector→실제 BE 왕복은 별도 runtime QA가 이어서 수행한다. 30분 부하·8시간 안정성, OFF/ON p95·CPU·heap·queue 유실·추가 저장량 비교는 이 BE 단위/통합시험으로 대체하지 않는다. 실제 Hikari hook·async Context·SDK enrichment 대응은 Java 담당의 결과와 합쳐 판단해야 한다. 장기 부하 검증까지 완료한 지원 조합이나 성능 보장으로 표시하지 않는다.

master 병합·commit·push·공유 서버 재기동은 수행하지 않았다.
