# 코덱스 의견 — APM 잔여 작업 착수 전 (2026-10-07, gpt-5.6-sol high, 읽기 전용)

질문서: 순위 1~8 뒤 잔여를 Claude가 이어받으며 c05bd85 자기 검토·순위 7·9~10·착수 순서·미기록 사항 5개를 물었다.

## 요약
- `c05bd85`는 핵심 소비자 대부분을 fail-closed로 바꿨지만, SLO 시계열·오늘 캘린더와 H1의 stage5 상태 상속에 잔여 결함이 있습니다.
- 서버 trace 검사는 `TraceIngestPipeline.ingest()`에서 reader 직후, 서비스 등록·파티션 준비 전에 수행해야 합니다.
- env는 “선택 서비스 환경 + 기존 involved 의미 유지”, 개요 RED export에도 적용, null UID는 합산하지 않는 안을 권장합니다.
- 착수 순서는 `c05 보완 → APC-07 → 순위 7 → 9~10 → 11`이 안전합니다.
- 이번 답변은 읽기 전용 정적 재검토이며 테스트는 새로 실행하지 않았습니다.

## 1. `c05bd85` 자기 검토

### 결론

**확인 사실:** 이 커밋은 문서에 적힌 다섯 소비자를 실제로 연결했고 선택 회귀 111개도 통과했습니다. SLO는 불완전 구간을 `UNKNOWN/NOT_MEASURABLE`, snapshot은 저장 거부, availability는 값 미응답, export는 숫자 마스킹으로 처리합니다. 근거는 [apm-priority-fixes.md](/C:/solutions/moveseye-docs/overview/apm-priority-fixes.md:78)와 [동 문서의 검증 기록](/C:/solutions/moveseye-docs/overview/apm-priority-fixes.md:82)입니다.

다만 아래 항목은 후속 수정이 필요합니다.

### 1-1. `ApmMetricCoverageReader`: H1이 stage5의 “상태”를 완전히 상속하지 않음

**확인 사실:** stage 60 조회는 자기 `bootstrap_complete`, `legacy_hold`, `legacy_cutover`를 먼저 확인한 뒤, stage5에서는 dirty marker만 검사합니다. 즉 stage5의 `bootstrap_complete=false` 또는 `legacy_hold=true` 자체는 H1 판정에 포함되지 않습니다. 코드 주석은 “stage 60 also depends on all stage 5 work”라고 선언하지만 실제 상속은 marker에 한정됩니다.

- 자기 stage 상태 판정: [ApmMetricCoverageReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:41)
- stage5 marker 상속만 수행: [ApmMetricCoverageReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReader.java:63)
- 현재 테스트는 stage5 dirty marker의 H1 전파만 검증: [ApmMetricCoverageReaderIT.java](/C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricCoverageReaderIT.java:62)

**추론:** 정상 배치 순서에서는 stage5 상태와 marker가 함께 움직여 문제가 드러나지 않을 가능성이 큽니다. 하지만 상태 복구·수동 정리·queue capacity 실패처럼 “stage5 hold/pending인데 조회 범위에 marker가 아직 없는” 조합에서는 H1을 완전하다고 오판할 수 있습니다.

**권장:** stage 60 판정 시 stage5 상태도 함께 읽어 다음 우선순위로 fail-closed 처리하십시오.

1. stage5 bootstrap 미완료
2. stage5 legacy hold 또는 stage5 cutover 이전 범위
3. stage60 자체 상태
4. stage60 marker
5. 겹치는 stage5 marker

두 상태와 marker를 한 SQL 또는 같은 `REPEATABLE_READ` snapshot 안에서 읽는 것이 좋습니다.

### 1-2. SLO 계산: 목록·상세 헤더는 막지만 시계열과 오늘 캘린더는 우회

**확인 사실:** 일반 SLO 측정과 burn 계산은 coarse segment마다 coverage를 검사하고, 미완이면 `Measured.incomplete` 및 `NOT_MEASURABLE`로 갑니다. [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:413), [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:511), [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:928)

그러나 두 우회 경로가 있습니다.

- `series()`는 `store.redSeries()`를 직접 읽고 `coverageReader`를 호출하지 않습니다. [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:213), [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:221)
- `todayCell()`은 `calculator.count()`를 써서 `Measured.completenessVerified`를 버립니다. 불완전 구간이면 0/빈 값처럼 보일 수 있고 사유도 전달되지 않습니다. [ApmSloService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloService.java:506), [ApmSloCalculator.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:373)

**권장:** `series()`도 선택 resolution의 stage를 검사해 전체 또는 영향 bucket을 `null` 처리하고, 오늘 칸은 `measure()` 결과를 사용해 불완전 여부와 `NOT_MEASURABLE`을 보존해야 합니다.

### 1-3. SLO snapshot

**확인 사실:** 일별·rolling window·1h·6h 중 하나라도 completeness가 확인되지 않으면 snapshot을 저장하지 않습니다. [ApmSloSnapshotService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:176)

**불안 지점:** coverage 조회를 포함한 모든 `RuntimeException`을 잡아 해당 SLO만 조용히 건너뜁니다. 다른 SLO 보호라는 의도는 맞지만, coverage DB 장애가 전체적으로 발생해도 결과는 “skipped 증가”와 WARN 로그뿐입니다. [ApmSloSnapshotService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/slo/snapshot/ApmSloSnapshotService.java:177)

**권장:** correctness 변경보다는 관측성 보완이 필요합니다. coverage 오류·불완전 구간·일반 계산 오류를 별도 skip reason/counter로 구분하고, 전량 skip이면 잡 실패로 승격하십시오.

### 1-4. Availability

**확인 사실:** 시계열 범위에 issue 하나라도 있으면 전체 셀을 `null`로 반환하고, 24시간 값은 cache를 제거한 뒤 빈 결과로 반환합니다. [ApmAvailabilityService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java:192), [ApmAvailabilityService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java:376)

**판정:** 거짓 정상값을 막는 면에서는 안전하지만 매우 보수적입니다. 한 bucket이 dirty여도 전체 창이 비어 사용자는 “데이터 없음”과 “집계 불완전”을 구별하지 못합니다.

**권장:** 당장 숫자 반환을 재개하기보다 응답에 `incompleteFromMs`/reason을 추가하는 쪽이 안전합니다.

### 1-5. RED export

**확인 사실:** dirty 시점 이후 RED 숫자는 비우고 `coverage=PARTIAL`로 내보냅니다. 다만 `activeRequests`는 그대로 남깁니다. [ApmRedSeriesExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:145), [ApmRedSeriesExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:175)

**추론:** dirty marker가 해당 rollup bucket 전체의 재계산 미완을 뜻한다면 gauge인 `activeRequests`만 신뢰할 근거가 없습니다. 현재 파일은 RED 값은 불명인데 active 값만 정확한 것처럼 보일 수 있습니다.

또한 기존 `PARTIAL` 문서는 “아직 닫히지 않은 최신 bucket이며 수치가 있으면 채운다”는 의미입니다. [ApmExportCoverage.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportCoverage.java:17) `c05bd85`는 같은 값에 “과거 rollup 불완전이라 수치를 비움”이라는 두 번째 의미를 넣었습니다.

**권장:**

- dirty 영향 행에서는 `activeRequests`도 비우십시오.
- 가능하면 `ROLLUP_INCOMPLETE` 같은 별도 coverage를 추가하십시오.
- 호환 때문에 `PARTIAL`을 유지한다면 최소한 `coverageReason` 열이나 파일 metadata로 `OPEN_BUCKET`과 `ROLLUP_PENDING/BLOCKED/LEGACY`를 구분해야 합니다.

### 1-6. Endpoint export

**확인 사실:** plan 시점에 숫자를 마스킹하고, 다운로드 직전에 coverage를 다시 검사하므로 plan 이후 새 dirty marker가 생기는 경우도 차단합니다. [ApmEndpointExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:77), [ApmEndpointExporter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:110)

**판정:** 정적 검토상 명백한 false-trust 경로는 찾지 못했습니다. 다만 endpoint 파일에는 행별 coverage가 없으므로 plan metadata 없이 CSV만 전달되면 빈 숫자의 이유를 잃습니다.

### 테스트가 잡지 못하는 주요 케이스

- stage60 조회가 stage5 `bootstrap_complete=false` 또는 `legacy_hold=true`를 상속하는지
- SLO `series()`와 오늘 calendar cell의 dirty/blocked/legacy 처리
- RED dirty 행의 `activeRequests`
- plan 후 marker 생성, marker 해소, chunk 경계 직전 생성
- 여러 개의 서로 떨어진 dirty 구간
- state 행 누락·cutover null/비정상 상태에서 fail-closed
- coverage DB 장애가 snapshot job 전체에서 어떻게 관측되는지
- endpoint CSV 단독 열람 시 불완전 사유 보존

### FE 변경 필요성

**이미 구현된 부분:** FE 타입과 표시 로직은 `NOT_MEASURABLE`을 지원합니다. [apm.ts](/C:/solutions/moveseyee_fe/src/types/apm.ts:2778), [apmSloDisplay.ts](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/slo/apmSloDisplay.ts:332) `incompleteFromMs`와 `notes`도 이미 타입에 있고 모달에서 표시합니다. [apm.ts](/C:/solutions/moveseyee_fe/src/types/apm.ts:3980), [ApmExportModal.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:491)

따라서 필수 타입 추가보다는 다음 보완이 필요합니다.

- `incompleteFromMs`가 있으면 일반 `info`가 아니라 경고로 표시
- 현재 BE 문구인 “아직 수집·집계 중”은 `BLOCKED`·`LEGACY_UNVERIFIED`에는 부정확하므로 reason 전달 또는 중립 문구로 변경 [ApmExportService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:364)
- CSV `PARTIAL` 도움말을 최신 미완 bucket과 rollup 복구 미완으로 구분
- SLO 시계열/오늘 칸 BE 보완 후 `NOT_MEASURABLE` 또는 불완전 범위 표시 추가

## 2. 순위 7 서버 trace 시간창

### 2-a. 정확한 검사 위치

**확인 사실:** 정확한 삽입 위치는 `TraceIngestPipeline.ingest()`에서 다음 사이입니다.

1. `reader.read(payload, receivedAt)` 직후
2. `ApmSqlPolicy` 조회와 `ApmRegistrarServiceResolver` 생성 전

근거:

- reader 호출: [TraceIngestPipeline.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:112)
- 정책 조회: [TraceIngestPipeline.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:121)
- resolver 생성: [TraceIngestPipeline.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:126)
- 실제 서비스 등록/귀속 시작: [TraceIngestPipeline.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/TraceIngestPipeline.java:145)

여기서 safe span 목록을 한 번 만들고 이후 resolver, accumulator, `TraceBatch`, writer 모두 그 목록만 사용해야 합니다.

writer는 트랜잭션 전에 span 및 trace-summary 파티션을 만들고, 트랜잭션 안에서 INSERT합니다. [ApmTraceWriter.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmTraceWriter.java:129) 파티션 날짜와 INSERT 키는 모두 `startTs`입니다. [ApmSpanStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanStore.java:241), [ApmSpanStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/ingest/ApmSpanStore.java:264)

### 2-b. 메트릭·RUM에서 재사용할 것과 하지 말아야 할 것

**재사용할 설계:**

- 시간 검사를 서비스 귀속보다 먼저 수행
- `receivedAt` 하나를 배치 전체가 공유
- safe 목록을 partition 준비와 INSERT에 동일하게 사용
- span 단위 폐기 수를 `signal=TRACE`, `metricName=null`로 기록
- `authoritativeDays()`에서 실제 적재 보존 설정을 읽음
- 경계 비교에는 `Duration.compareTo` 또는 `Instant.isBefore/isAfter`를 사용

메트릭도 safe point를 먼저 만든 뒤 귀속·파티션 준비·저장을 그 목록으로 통일합니다. [MetricIngestor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:121), [MetricIngestor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java:145)

**재사용하면 안 되는 것:**

- `ApmMetricPartitionGuard` 자체: metric 테이블, `raw1mDays`, metric retirement state에 결합돼 있습니다. [ApmMetricPartitionGuard.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/partition/ApmMetricPartitionGuard.java:17)
- `METRIC_TIME_*` reason: 신호와 보존 정책이 다릅니다. [ApmDropReason.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/drop/ApmDropReason.java:184)
- RUM의 30일/7일 숫자와 24시간 duration 상한: 브라우저 정책이며 서버 trace 정책이 아닙니다.
- RUM parser 자체: trace reader는 시작 누락을 `receivedAt`, 종료 누락을 시작 시각으로 보정하는 기존 계약이 있습니다. [OtlpTracesReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/trace/OtlpTracesReader.java:89), [OtlpTracesReader.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/otel/trace/OtlpTracesReader.java:150)

### 2-c. 권장 시간창

**권장안:**

```text
effectiveDays = min(authoritativeDays.spanDays,
                    authoritativeDays.traceSummaryDays)
earliest = receivedAt - Duration.ofDays(effectiveDays)
latest   = receivedAt + traceMaxFutureSeconds  // 기본 300초
```

두 보존값 중 작은 값을 쓰는 이유는 writer가 span과 trace summary를 함께 저장하기 때문입니다. summary가 span보다 짧으면 안 된다는 운영 주의는 있지만 코드상 별도 값입니다. [ApmRetentionDays.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionDays.java:45), [ApmRetentionService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java:127)

판정은 다음이 적절합니다.

- `start < earliest` → expired
- `start > latest` 또는 `end > latest` → future
- `end < start` → invalid
- 경계값 `start == earliest`, `end == latest`는 허용
- 종료 누락은 reader가 `end=start`로 만든 기존 동작 유지
- 서버 trace에 RUM의 24시간 duration 상한은 적용하지 않음

`authoritativeDays()`는 안내용 cache가 아닌 현재 DB 정책을 읽는 적재·삭제 경계용 API입니다. [ApmRetentionPolicy.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionPolicy.java:89)

**RUM 함정 이식:**

- `Duration.toDays()`는 절삭되므로 사용하지 않습니다. RUM은 직접 `compareTo(Duration.ofDays(1))`로 고쳤습니다. [RumParser.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumParser.java:158)
- pipeline 인자의 `receivedAt`을 그대로 써야 합니다. RUM도 controller에서 한 번 만든 `now`를 parser/prepare/store에 공유합니다. [ApmRumIngestController.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/rum/ApmRumIngestController.java:131)
- partition 준비와 INSERT가 같은 safe 목록을 써야 합니다. RUM도 `storesSpan(observation, receivedAt)`을 양쪽에 공통 적용합니다. [RumStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumStore.java:65), [RumStore.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumStore.java:254)

**추가 주의:** 단순 시간 검사만으로 retention job과의 경합이 완전히 닫히지는 않습니다. 검사 후 DROP되고 writer가 파티션을 다시 만들 수 있기 때문입니다. trace 전용 `retired_before` 상태 또는 일반화된 partition retirement gate와 날짜별 공유/배타 잠금이 필요합니다. 메트릭 guard의 구조는 참고하되 클래스를 그대로 재사용해서는 안 됩니다.

### 2-d. Drop reason과 FE 라벨

권장 reason은 다음입니다.

- `TRACE_TIME_EXPIRED` — “보존 기간 밖 서버 trace”
- `TRACE_TIME_FUTURE` — “미래 시각 허용 범위 초과 서버 trace”
- `TRACE_TIME_INVALID` — “종료 시각이 시작 시각보다 빠른 서버 trace”
- retirement tombstone까지 구현하면 `TRACE_TIME_RETIRED` — “이미 정리된 날짜의 서버 trace”

FE에서는 reason whitelist와 한국어/영어 locale을 함께 추가해야 합니다. 현재 메트릭 reason은 [apm.ts](/C:/solutions/moveseyee_fe/src/types/apm.ts:1375)와 [en.json](/C:/solutions/moveseyee_fe/src/locales/en.json:1677)에 명시적으로 등록돼 있으므로 BE enum만 추가하면 사람이 읽는 라벨이 나오지 않습니다.

### 2-e. 꼭 필요한 회귀 테스트

- `start == earliest` 허용, `earliest - 1ns` 폐기
- `start/end == latest` 허용, `latest + 1ns` 폐기
- `end < start` 폐기
- 시작/종료 누락 fallback 회귀
- 24~48시간 절삭 회귀: 어떤 duration 제한도 `.toDays()`로 비교하지 않음
- 한 배치에 정상·expired·future·invalid 혼합
- 전량 폐기 시 resolver, 서비스 등록, partition DDL, writer 호출이 모두 0회
- 폐기 span이 속한 날짜의 `apm_span`·`apm_trace_summary` partition 미생성
- safe 목록과 실제 INSERT 목록 동일성
- 한 `receivedAt`으로 검사·통계·저장 경계를 공유
- `spanDays` 및 `traceSummaryDays` 변경 반영
- retention DROP과 ingest 경합에서 삭제 날짜 파티션 재생성 금지
- 부분 수락 시 `partialSuccess.rejectedSpans`와 drop reason count 일치
- expired root + 정상 child처럼 한 trace 일부만 남는 경우의 summary/root 결정
- 실제 PostgreSQL에서 경계 날짜·자정·시스템 timezone 검증

## 3. 순위 9~10 env 필터

### 3-1. Trace `env + involved`

**권장:** 계약의 권장안을 채택하십시오.

- 서비스 미선택: root service의 env로 제한
- 서비스 선택: 선택 서비스가 env와 일치하는지 먼저 확인
- `involved=true`: 선택 서비스가 참여한 trace라는 기존 의미 유지
- 따라서 dev root에서 시작해 prod 서비스를 거친 trace는 `service=prod&env=prod&involved=true`에 포함

현재 `involved`는 `service_ids`, 그렇지 않으면 `root_service_id`를 검사합니다. [ApmTraceQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:125) 설계 문서도 같은 안을 권장합니다. [apm-query-controls-20261006.md](/C:/solutions/_workspace/features/apm/hardening-20261006/apm-query-controls-20261006.md:51)

**루트 고정안을 권하지 않는 이유:** 선택한 prod 서비스가 실제 참여했는데 root가 dev라는 이유로 빠집니다. 이는 `involved`의 기존 의미를 은밀하게 좁힙니다.

### 3-2. 개요 RED export env

**권장:** 현재 계약을 바꿔 env를 적용하십시오.

현재 개요 화면은 env로 필터링하지만 RED export 버튼은 service와 env를 보내지 않습니다. [ApmOverviewPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/ApmOverviewPage.tsx:76), [ApmOverviewPage.tsx](/C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/ApmOverviewPage.tsx:299) 계약은 현재 RED export에서 env를 거절하도록 되어 있습니다. [features/apm/hardening-20261006/contract_apm-query-controls-20261006.md](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:27)

순위 9의 목표가 카드·목록·차트·export 모집단 일치이므로, 사용자가 prod 화면에서 export를 눌렀는데 모든 환경이 나오는 것은 더 위험합니다. `red-series`는 target service를 env로 제한하고, `endpoints`는 필수 service와 env 교집합을 검사하는 쪽이 일관됩니다.

### 3-3. env가 없는 구 BE plan 응답 호환

**권장 FE 정책:**

- 응답 타입은 `env?: string | null`로 두어 rolling deploy를 허용
- 요청 env가 없고 응답 env도 `undefined`이면 기존 전체 환경으로 허용
- 요청 env가 있는데 응답 env가 `undefined`, `null`, 또는 불일치하면 다운로드 차단
- “환경 필터를 지원하지 않는 서버 응답”이라고 명시하고 재계획 유도
- env가 적용됐다고 FE에서 추측하거나 표시하지 않음

이는 계획 응답이 env를 증명하지 못했는데 필터된 파일이라고 오인하는 경우를 막습니다.

### 3-4. null UID dependency 행

**권장:**

- 전체 환경 목록에서는 역사적 orphan 행을 유지
- “삭제되었거나 알 수 없는 서비스”로 표시
- drilldown/series 버튼 비활성화
- env가 지정되면 현재 서비스 env를 증명할 수 없으므로 제외
- 절대 `target`만으로 전 서비스 series를 합산하지 않음

DTO는 이미 `serviceUid`가 nullable이고, 조회도 참조 서비스가 없으면 null을 반환합니다. [ApmDependenciesDto.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dependency/ApmDependenciesDto.java:41), [ApmDependencyQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dependency/ApmDependencyQueryService.java:77) 계약도 전체 합산 대체를 금지합니다. [features/apm/hardening-20261006/contract_apm-query-controls-20261006.md](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:33)

### 3-5. BE SQL 적용 위치

env는 Java 후처리가 아니라 집계·count·LIMIT·sampling 이전 SQL 모집단에 들어가야 합니다. [features/apm/hardening-20261006/contract_apm-query-controls-20261006.md](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:7)

- Trace: `ApmTraceQueryService.where()`에 넣습니다. 이 조건이 `list()`, `countCapped()`, `scatter()`에 공통 적용됩니다. [ApmTraceQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:125), [ApmTraceQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:179), [ApmTraceQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:275)
- Error list/count/export: `ApmErrorQueryService.windowFilter()`의 `g.service_id` 조건과 같은 계층에 추가합니다. [ApmErrorQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:229)
- Error detail/series: `groupId` 조회 전에 `(service, env)` scope helper로 그룹 소속을 확인합니다. [ApmErrorQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:282), [ApmErrorQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:331)
- DB 목록: `ApmDbQueryService.list()`의 base filter에서 `g.service_id`에 적용합니다. [ApmDbQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:65)
- DB systems: group 전에 같은 `g.service_id` env 조건을 적용합니다. [ApmDbQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:200)
- DB detail/series: error와 같은 scope precheck를 둡니다. [ApmDbQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:136), [ApmDbQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:172)
- Dependency list/series: 외부 target이 아니라 호출측 `service_id`에 env를 적용합니다. [ApmDependencyQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dependency/ApmDependencyQueryService.java:50), [ApmDependencyQueryService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/dependency/ApmDependencyQueryService.java:107)

`ApmServiceRefLookup.Ref`에는 이미 env가 있지만 UID→ID map에는 env가 없습니다. scope 검증용 lookup을 별도로 추가하는 편이 낫습니다. [ApmServiceRefLookup.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmServiceRefLookup.java:41), [ApmServiceRefLookup.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmServiceRefLookup.java:58)

### 3-6. planToken 호환

**확인 사실:** 현재 토큰은 `v1`만 허용하고 fingerprint에는 env가 없습니다. [ApmExportPlanToken.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:51), [ApmExportPlanToken.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:145) TTL은 30분입니다. [application.yml](/C:/solutions/moveseye-be-spring/src/main/resources/application.yml:186)

**권장 호환:**

- `v2` fingerprint에 정규화된 env를 추가
- verifier는 `v1`과 `v2`를 함께 읽음
- `v1`은 요청 env가 null일 때만 허용
- env 요청에 `v1` 토큰이 오면 `APM_EXPORT_INVALID`
- 신규 발급은 모두 `v2`
- rolling deploy라면 “v1/v2 reader 배포 → v2 issuer 배포” 순서
- HMAC key derivation은 기존 토큰을 읽을 수 있도록 유지
- 단순히 기존 v1 fingerprint 함수에 env를 추가해 30분 이내 토큰을 전부 깨뜨리는 방식은 피함

## 4. 착수 순서

권장 순서는 다음과 같습니다.

1. **`c05bd85` correctness 보완**
   - H1의 stage5 상태 상속
   - SLO series/오늘 calendar
   - RED `activeRequests` 및 `PARTIAL` 의미
   - FE 불완전 경고
2. **APC-07 `max-services` 상한 단일화**
3. **순위 7 서버 trace 시간창·partition retirement**
4. **순위 9~10 env·선택 행·수동 갱신**
5. **순위 11 알람 원자성: APC-01 + APC-05 + APC-25**
6. 이후 목표 부하·HA

### 왜 `c05bd85`를 먼저 보완하는가

현재 남은 문제는 단순 표현이 아니라 dirty rollup을 정상 SLO 시계열이나 오늘 값으로 보여 줄 수 있는 correctness 문제입니다. 순위 5가 순위 7보다 선행한다는 기존 방향과도 맞습니다. [apm-priority-fixes.md](/C:/solutions/moveseye-docs/overview/apm-priority-fixes.md:72)

### 왜 APC-07을 앞당기는가

설정 검증은 2000까지 허용하지만 `LiveSpanRing`은 200 초과에서 생성자 예외를 던집니다.

- 프로퍼티 상한 2000: [ApmLiveProperties.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/ApmLiveProperties.java:94)
- 런타임 상한 200: [LiveSpanRing.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanRing.java:139)
- 운영 문서 판정: [APM-수집과-운영.md](/C:/solutions/moveseye-docs/guides/features/APM-수집과-운영.md:618)

작고 결정적인 기동 실패이므로 trace 작업 전에 별도 소커밋으로 닫는 편이 좋습니다. 현재 메모리 설계와 배열 크기가 200을 전제로 설명돼 있으므로, 우선 `@Max(200)`으로 맞추고 메시지에 설정 키를 넣는 쪽이 안전합니다. 2000 지원은 부하 검증 후 별도 작업이어야 합니다.

### 순위 11 시작 시 Flyway 번호

**확인 사실:** V70은 이미 `V70__apm_metric_dirty_rollup.sql`이 사용합니다. 따라서 새 마이그레이션은 **V71**이어야 합니다. [V70__apm_metric_dirty_rollup.sql](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V70__apm_metric_dirty_rollup.sql:1)

### 기존 알람 구조에서의 주의점

**확인 사실:**

- `apm_alert_event`에는 현재 열린 행 UNIQUE가 없습니다. [V38__apm_p1.sql](/C:/solutions/moveseye-be-spring/src/main/resources/db/migration/V38__apm_p1.sql:388)
- 1초 monitor와 5분 evaluator가 각각 “조회 후 INSERT”합니다. [ApmStuckRequestLedger.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:110), [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:367)
- `evaluateAll()` 전체가 하나의 `@Transactional`이고 provisioning, orphan sweep, push, event backfill, cleanup retry까지 포함합니다. [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:281), [ApmAlertEvaluationService.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmAlertEvaluationService.java:392)
- 1초 monitor는 `synchronized(lock)` 안에서 `ledger.fire/settle`을 호출하고, ledger는 그 트랜잭션 안에서 Zabbix provisioning/push를 수행합니다. [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:121), [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:200), [ApmStuckRequestLedger.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestLedger.java:112)

**권장 설계 순서:**

1. V71에서 기존 중복 열린 행을 먼저 정리
2. `(rule_id, COALESCE(service_id, 0)) WHERE resolved_at IS NULL` 부분 UNIQUE index 추가
3. JPA `save()` 후 constraint exception에 의존하지 말고 native `INSERT ... ON CONFLICT DO NOTHING`과 삽입 행 수로 결과 판정
4. `STUCK_REQUEST` event 전이 소유자를 1초 monitor 하나로 확정하고, 5분 evaluator는 값 전달·binding 유지 역할만 수행
5. DB event 전이와 delivery intent/outbox를 한 짧은 트랜잭션에 저장
6. Zabbix provisioning/push는 커밋 뒤 별도 worker에서 실행
7. `(rule, service, transition/version)` idempotency key와 재시도 상태를 둬 “push 성공 후 DB rollback” 및 “commit 후 process crash”를 복구
8. `synchronized(lock)` 안에서는 immutable command 계산만 하고 DB/Zabbix I/O는 밖에서 수행
9. APC-25로 target 제거 시 `open`, `alarmed`뿐 아니라 `observedAt`도 제거

APC-25의 현재 누락은 코드에서 직접 확인됩니다. [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:138), [ApmStuckRequestMonitor.java](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/alert/evaluate/ApmStuckRequestMonitor.java:150), [APM-수집과-운영.md](/C:/solutions/moveseye-docs/guides/features/APM-수집과-운영.md:762)

외부 I/O만 먼저 트랜잭션 밖으로 빼고 UNIQUE/outbox를 나중에 붙이면 중복 발화와 crash gap이 더 커질 수 있으므로 APC-01·05는 한 설계로 처리해야 합니다.

## 5. 10-06에 알았지만 문서에 못 남긴 것

**확인 가능한 기록 기준으로는 없음.**

이번 재검토에서 새로 확인한 다음 항목은 10-06에 알고도 숨긴 우회가 아니라 현재 코드 재열람으로 발견한 사항입니다.

- H1의 stage5 상태 상속 누락
- SLO `series()`와 오늘 calendar의 coverage 우회
- RED `activeRequests` 및 `PARTIAL` 의미 중복

당시에 확인했던 주요 제한—서버 trace guard 미구현, Browser E2E 미실행, 선택 회귀만 수행, 부하·HA 미검증—은 이미 문서에 남아 있습니다. [실행 계획서](/C:/solutions/_workspace/features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md:20), [실행 계획서](/C:/solutions/_workspace/features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md:34), [전체 평가](/C:/solutions/moveseye-docs/overview/apm-overall-assessment.md:165)
