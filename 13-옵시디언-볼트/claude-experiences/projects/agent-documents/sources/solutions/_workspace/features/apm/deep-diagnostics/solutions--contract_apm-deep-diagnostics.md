# APM 심층 진단 API 계약 v1

2026-10-28 · 격리 BE 구현 계약. 아래 shape를 FE 입력으로 고정한다. 검증 결과는 별도 report에 기록한다.

## 설정과 접근

- BE: `app.apm.diagnostics.query-enabled` / 환경변수 `APM_DIAGNOSTICS_QUERY_ENABLED`, 기본 false.
- 규칙 설정: `app.apm.diagnostics.acquire-delay-ms` 기본100, `app.apm.diagnostics.acquire-ratio` 기본0.2, `app.apm.diagnostics.pool-utilization-ratio` 기본0.9. 응답 `ruleThresholds`는 적용된 실제 값이다.
- Java 확장: `moveseye.diagnostics.enabled`, 기본 false. 수집 OFF여도 저장 자료 조회는 가능하다.
- 모든 API는 기존 로그인·visitor 검사 + `@RequiresFeature(APM)` + `ApmAccessChecker.requireRead`를 적용한다.
- 성공은 기존 ApiResult envelope, 아래는 두 겹 언랩 후 payload. 401만 HTTP 401, 나머지 오류는 기존 HTTP 200/body code.

## GET /apm/diagnostics/capabilities

```ts
type Capabilities = { schemaVersion: 1; queryEnabled: boolean; collectionSupported: boolean;
  runtimeResolutionMs: 60000; maxContextWindowMs: 900000;
  supportedDiagnosticKinds: ('POOL_ACQUIRE'|'REQUEST_SUMMARY')[] };
```

collectionSupported는 BE의 저장/해석 지원이며 현재 JVM 설치·활성 상태가 아니다. FE 독립 feature flag 없이 queryEnabled로 탭 노출을 제어한다.

## GET /apm/traces/{traceId}/diagnostics?spanId={SERVER_ID}

traceId는 32자 hex, spanId는 선택 16자 hex. 생략 시 실제 root SERVER가 유일할 때만 자동 선택. instance/run/service 입력은 없다.

```ts
type Availability = 'AVAILABLE'|'PARTIAL'|'NOT_RECEIVED'|'UNSUPPORTED'|'EXPIRED'|'NOT_AUTHORIZED'|'UNAVAILABLE';
type Candidate = { spanId: string; serviceUid: string|null; serviceName: string };
type DiagnosticResponse = {
 schemaVersion: 1; ruleVersion: 1;
 ruleThresholds:{acquireDelayMs:number;acquireRatio:number;poolUtilizationRatio:number};
 traceId: string; selectionRequired: boolean;
 candidates: Candidate[]; candidatesTruncated: boolean; reasonCodes: string[];
 target: null | {spanId:string;serviceUid:string|null;serviceName:string;instanceId:string|null;
   processRunUid:string|null;identitySource:'RESOURCE_EXPLICIT'|'RESOLVER_DERIVED'|'UNKNOWN'};
 request: null | {startMs:number;durationMs:number;availability:Availability;reasonCodes:string[]};
 contextWindow: null | {fromMs:number;toMs:number;clipped:boolean};
 runtime: null | {scope:'INSTANCE_TIME_WINDOW';basis:'CORRELATED';processScope:'UNVERIFIED';
   availability:Availability;reasonCodes:string[];resolutionMs:60000;
   series:{metric:string;unit:string;dimension:string|null;points:{bucketStartMs:number;value:number|null}[]}[]};
 acquisition: null | {scope:'REQUEST_SPAN';basis:'MEASURED';availability:Availability;reasonCodes:string[];
   coverage:string|null;thresholdMs:number|null;observedUnionMs:number|null;observedUnionIsLowerBound:boolean|null;
   attempts:number|null;expectedIntervals:number|null;receivedIntervals:number;belowThreshold:number|null;
   detailDropped:number|null;unfinished:number|null;totalAcquireMs:number|null;maxAcquireMs:number|null;
   extensionVersion:string|null;intervals:{spanId:string;offsetMs:number;durationMs:number;poolUid:string;outcome:'SUCCESS'|'TIMEOUT'|'ERROR'}[]};
 operations:null|{scope:'REQUEST_SPAN';basis:'MEASURED';availability:Availability;reasonCodes:string[];
   items:{spanId:string;type:'SQL'|'HTTP';offsetMs:number;durationMs:number}[]};
 findings:{code:string;evidenceIds:string[];valueMs:number|null;dimension:string|null;bucketStartMs:number|null}[];
 sources:{traceTruncated:boolean;summaryPresent:boolean;runtimeQueryLimited:boolean};
 next:{logs:{availability:'UNSUPPORTED'};dbm:{availability:'UNSUPPORTED'};jfr:{availability:'UNSUPPORTED'}};
};
```

`candidates`는 선택 완료 응답에도 항상 제공한다(최대32, 시작시각/spanId 정렬). 다른 SERVER 전환은 이 목록을 사용한다. 후보 제한 시 `candidatesTruncated=true` + `QUERY_LIMIT`. `target=null`이면 request/contextWindow/runtime/acquisition/operations 모두 null이고 findings는 빈 배열이다. 선택 span이 후보32 밖이어도 실제 hot DB SERVER이면 명시 선택 가능하다.

runtime metric은 기존 Java 슬롯 중 gcDurationMs, cpuUtilizationPct, poolActive, poolIdle, poolPending, poolMax 6종이다. dimension은 기존 허용 태그에서 나온 값이며 원문 HTML로 사용하지 않는다. 단위는 gcDurationMs=`ms`, cpuUtilizationPct=`%`, 나머지=`count`이다. 서버가 단위를 변환하며 FE는 값을 추가 변환하지 않는다.

기존 1m는 memory pool/thread state 차원을 버리고 각 포인트 평균을 저장하므로 memoryUsed/memoryLimit/threads의 정확한 총량을 복원할 수 없다. 이번 진단에서는 해당 3슬롯을 제외하고 `METRIC_SEMANTICS_UNVERIFIED` 사유를 반환한다. CPU/GC/pool 자료가 있으면 이 범위 한계 때문에 runtime은 PARTIAL이다. 기존 runtime API·metric 저장 계약은 변경하지 않는다.

획득 자료의 summary가 없으면 summary 유래 수치는 null이다. union=null이면 lowerBound도 null. 유효 summary attempts=0만 AVAILABLE+union=0. below_threshold/detail_dropped/unfinished/transport gap은 PARTIAL+union 하한. 여러/모순 summary는 임의 선택하지 않는다. `extensionVersion`은 유효 summary의 정형 생산자 버전이다.

operations는 가장 가까운 SERVER 조상이 선택 대상이고 서비스도 같은 CLIENT만 반환한다. SQL/HTTP 분류와 범위 판단은 BE 책임. 최대256, duration 내림차순/spanId 정렬. raw SQL/URL/stack은 이 응답에 포함하지 않는다.

사유: IDENTITY_UNAVAILABLE, IDENTITY_MISMATCH, LEGACY_DATA, PROCESS_SCOPE_UNVERIFIED, METRIC_SEMANTICS_UNVERIFIED, BELOW_THRESHOLD, DETAIL_LIMIT, SUMMARY_MISSING, TRANSPORT_GAP, UNFINISHED_OPERATION, TRACE_INCOMPLETE, CLOCK_UNCERTAIN, QUERY_LIMIT, SOURCE_TIMEOUT, SOURCE_FAILURE, FEATURE_DISABLED, HOT_DATA_UNAVAILABLE, INVALID_DIAGNOSTIC_SET, WINDOW_PARTIALLY_EXPIRED, WINDOW_IN_PROGRESS, WINDOW_CLIPPED.

findings: POOL_ACQUIRE_OBSERVED, POOL_ACQUIRE_DELAY_OBSERVED, POOL_PRESSURE_CORRELATED. 근거 참조는 acquisition 또는 runtime. 지연 규칙 v1 기본값: 관측 구간100ms 이상 또는 완전한 요청 union20% 이상. 인과 확정 문구 금지. runtime은 항상 동일 instance 시간대 정황이고 processScope UNVERIFIED.

오류: `APM_DIAG_DISABLED`(403), `APM_DIAG_INVALID_TARGET`(400), `APM_DIAG_BUSY`(429, 사용자당 동시2), 기존 `APM_TRACE_NOT_FOUND`(404). runtime 조회 실패는 성공 응답의 UNAVAILABLE/SOURCE_TIMEOUT 또는 SOURCE_FAILURE로 분리한다. 진단 hot span 없는 저장 요약은 선택 없음 + HOT_DATA_UNAVAILABLE/TRACE_INCOMPLETE 사유로 안내하며 archive 존재를 추정하거나 원문을 읽지 않는다.

## 저장·생산자 계약

V93 예약(현재 DBM V90~V92), nullable instance_id/process_run_uid/identity_source/diagnostic_kind. 공유 DB 적용 금지. 생산자 속성과 카운터식은 설계 §7 그대로. resource identity 우선, 기존 dedupe 첫 저장값 보존. 진단은 일반 조회 LIMIT 전 제외하고 집계·flame·critical path 입력에서 제외. spanCount는 전체 저장 span 수 의미 유지.

## 🔄 FE 요청사항

- [x] 선택 이후에도 SERVER 변경 가능하도록 candidates 항상 제공.
