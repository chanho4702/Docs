# APM CUMULATIVE 정확성 보완 계약 — 2026-10-06

상태: 구현 완료, 리더 직렬 검증 대기. 선행 raw-text 보완 `aab73fc` 이후 작업이다. 이 문서의 검증 절에 결과가 적히기 전에는 통과로 해석하지 않는다.

## 변경 내용

1. 원시 resource/scope/schema URL/metric 이름·종류·단위·monotonic/typed point attributes를 SHA-256 신원으로 삼아 차분한 뒤 저장용 dims로 합산한다. 상태코드200·201 같은 독립 누적 계열이 서로의 기준을 덮지 않는다. hash는64자리이며 원문 속성을 장기 상태에 보관하지 않는다.
2. CUMULATIVE만 배치 복사본에서 관측 시각순으로 처리한다. 동일 시각은 입력 순서를 유지한다. route admission은 원래 입력 순서로 정규화하여 보존한다. DELTA/GAUGE/UpDownCounter 처리 의미와 원본 리스트를 유지한다.
3. 첫 원시 계열 관측은 startTime 나이와 무관하게 기준만 저장한다. resource enrichment·scope 전환 직후 전체 누적값 재가산을 막는 대신 첫 구간이 보류된다. startTime==time이면 UNKNOWN_START, 이외는 FIRST_SKIPPED다. 연속 관측의 명확한 새 epoch(start 증가, 이전 관측 이상, 현재 time 미만)만 전체값을 수용한다.
4. 관측 시각/epoch 역행과 같은 시각 correction은 checkpoint를 바꾸지 않는다. 같은 시각 동일 값은 중복이다. same-epoch histogram 경계 변경·bucket 감소·불명확한 epoch 전환은 한 관측을 새 기준으로만 남긴다. 임의 rebin은 하지 않는다.
5. 입력 count=ΣbucketCounts/finite/시간 불변식과 clock 대비 미래 허용창을 CUMULATIVE checkpoint 채택 전에 검사한다. DELTA 입력 검증 범위는 이번 변경에서 늘리지 않았다.
6. 신규 key의 전역·서비스 한도, committed 셀 용량과 별도 in-flight snapshot 셀 한도를 적용했다. rollback·TTL·clear 때 예약을 반환한다. DB commit 성공 뒤 publish, receipt 중복 배제, stripe 순서, afterCommit을 유지한다.

## API 계약

### OTLP 수신

- `POST /apm/otlp/v1/metrics` 및 기존 별칭 유지. 기존 수신 토큰 인증과 요청 OTLP JSON 구조를 유지한다.
- 성공 HTTP200 `{}`. 정책상 포인트 보류도 배치는 정상 처리한다. 저장 장애의 HTTP503·재시도 및 receipt 의미를 유지한다.
- 저장 key(service/instance/metric/dims/bucket)와 메트릭 조회 DTO는 바뀌지 않는다. `sourceIdentityHash`는 내부 OTLP model 필드이며 REST 응답 필드가 아니다.

### 폐기·변형 조회

기존 ApiResult의 `data` payload 기준이며 axios 응답의 바깥 `data`와 혼동하지 않는다. 기존 wrapper·상태 코드·권한을 유지한다. enum 문자열 추가 외 필드 변경과 DB migration은 없다.

`GET /apm/ingest/drops` — 권한 `apm.edit`, 기존 query `tokenId?:number`, `from?:number`, `to?:number` 유지.

```ts
{
  rows: Array<{
    reason: string;
    metricName: string | null;
    count: number;
    lastSeenAt: string;
    signal: string; // 새 사유는 METRIC
  }>;
  routeOverflow: Array<{ serviceUid: string; displayName: string; count: number }>;
}
```

`rows[].count`는 DB 누적 관측 건수이며 from/to는 lastSeenAt 필터다. rows는 상위200개이므로 전체 손실 원장으로 합산하지 않는다.

`GET /apm/ingest/drops/by-service` — 권한 `apm.view`, query `serviceUid?:string(UUID)` 유지. 존재하지 않는 UID의 기존 body code404 규약 유지.

```ts
{
  source: 'PROCESS_MEMORY';
  countingSinceMs: number;
  countingSince: string;
  overflowCount: number;
  services: Array<{
    serviceUid: string;
    displayName: string;
    total: number;
    truncated: boolean;
    rows: Array<{
      reason: string;
      metricName: string | null;
      signal: string;
      count: number;
      lastSeenMs: number;
      lastSeenAt: string;
    }>;
  }>;
}
```

`services[].total`은 정보·변형·미적재를 모두 포함하는 기존 row count 합이며 순수 손실이 아니다. 서비스 통계는 JVM 로컬 메모리이며 재기동 시 초기화된다.

### reason별 의미와 손실 집계

| reason | 분류 | FE 라벨·톤 권장 | BE lostPoints / FE apmLostDropCount |
|---|---|---|---|
| `CUMULATIVE_UNKNOWN_START` | 정보: 증가 기여0인 unknown-start 기준 관측 | 누적형 기준 관측 / 중립 | 제외 |
| `CUMULATIVE_DUPLICATE` | 정보: 같은 시각·같은 값 재전송 | 누적형 중복 관측 / 중립 | 제외 |
| `CUMULATIVE_FIRST_SKIPPED` (기존) | 첫 구간 보류: 새 계열 기준 확보 | 기존 라벨 유지 | 포함 |
| `CUMULATIVE_OUT_OF_ORDER` | 관측 미적재: 이전 시각/epoch, 기준 유지 | 누적형 지연 관측 제외 / 경고 | 포함 |
| `CUMULATIVE_POINT_CONFLICT` | 관측 미적재: 같은 시각 다른 값, 최초 관측 유지 | 누적형 관측 충돌 / 경고 | 포함 |
| `CUMULATIVE_SCHEMA_CHANGED` | 구간 보류: 분포 경계 변경, 새 기준 저장 | 누적형 분포 경계 변경 / 경고 | 포함 |
| `CUMULATIVE_RESET_UNCERTAIN` | 구간 보류: 불명확한 감소/epoch 전환 | 누적형 기준 재설정 / 경고 | 포함 |
| `CUMULATIVE_INVALID_POINT` | 거부: 숫자·시간·분포 불변식 오류 | 잘못된 누적형 관측 / critical | 포함 |
| `CUMULATIVE_STATE_LIMIT` | 미적재: 계열/셀 예산 부족, 기준 유지 | 누적형 추적 한도 초과 / critical | 포함 |

`accepted`는 실제 행으로 수용된 포인트와 기존 live 전용 수용 수의 의미를 유지한다. 내부 `lostPoints = max(0, points - accepted - UNKNOWN_START - DUPLICATE)`이며 파이프라인 IngestResult.dropped 및 최근 수신 통계에 반영된다. rows[].count 자체는 정보를 포함하므로 두 중립 사유를 UI의 “실제 잃음” 합계에서 제외한다. 나머지 포함값도 “미적재 관측 수”이지 요청/바이트/전체 누적값의 영구 손실량을 뜻하지 않는다. 후속 누적값이 일부 증가량을 회복할 수 있지만 정확한 과거 시간 버킷 귀속을 보장하지 않는다.

## 🔄 FE 요청사항

`APM_DROP_REASONS`, 한국어/영어 라벨, 톤을 위 목록으로 확장하고 미지정 reason fallback을 유지한다. `apmLostDropCount`에서 UNKNOWN_START와 DUPLICATE를 제외한다. `services[].total`을 그대로 실제 손실로 표시하지 않는다. API shape와 호출 경로는 바꾸지 않는다. FE 검증·커밋은 별도 담당 결과를 따른다.

## 서버 설정

| 설정 / 환경변수 | 기본값 | 허용 범위 |
|---|---:|---|
| `app.apm.cumulative.max-series` / `APM_CUMULATIVE_MAX_SERIES` | 50,000 | 1~250,000 |
| `max-series-per-service` / `APM_CUMULATIVE_MAX_SERIES_PER_SERVICE` | 10,000 | 1~250,000, 전역 max-series 이하 |
| `max-histogram-cells` / `APM_CUMULATIVE_MAX_HISTOGRAM_CELLS` | 2,000,000 | 1~16,000,000 |
| `max-pending-histogram-cells` / `APM_CUMULATIVE_MAX_PENDING_HISTOGRAM_CELLS` | 2,000,000 | 1~16,000,000 |
| `max-future-seconds` / `APM_CUMULATIVE_MAX_FUTURE_SECONDS` | 300 | 0~3,600초 |

아래4개 property도 모두 `app.apm.cumulative` 하위이다. Spring 시작 시 범위를 검증한다. max-series를10,000미만으로 낮출 때는 서비스별 한도도 함께 낮춰야 한다.

- 계열 예산은 committed+신규 pending key 수다. 서비스별 제한으로 한 서비스가 전역 key 예산을 모두 선점하는 경로를 줄인다.
- committed 셀 용량은 실제 committed 셀에 pending의 양의 순증가분 예약을 더한다. 기존 same-size snapshot 교체는 committed 풀이 포화여도 가능하다.
- pending 셀 풀은 처리 중 배치의 snapshot 배열 원소를 별도로 센다. in-flight 풀이 포화하면 해당 업데이트를 보류하고 기존 기준을 유지한다. 최종 장기 상태 셀과 pending snapshot을 합친 보호 범위는 두 풀의 합이며 전체 JVM heap 크기 보증은 아니다. 전역 histogram 셀 예산 자체는 서비스별 배분을 보장하지 않는다.
- TTL30분, sweep최소간격1분. 배치 self-sweep은 현재 pending key를 지우지 않는다. 실제 remove/put 결과로 반환량을 계산한다.
- typed int64는 signed64 범위의 정수만 허용한다. 숫자/문자열/지수형·정수인 소수 표기는 canonicalize하며 원시 숫자 표기는128자로 제한한다. bytesValue는 동등 base64 표기를 같은 byte 신원으로 처리한다. AnyValue 중첩은32단계로 제한한다.
- raw identity 검증은 차분 대상 CUMULATIVE에만 적용한다. 잘못된 typed 속성 포인트는 reader에서 건너뛰며 원문 없는 로그를 남긴다. 이 reader 단계 제외는 tracker의 CUMULATIVE_INVALID_POINT 카운터에 포함되지 않는 기존 parser 관측 한계가 있다.

## 남는 한계

- JVM 간 공유 checkpoint와 프로세스 재시작 후 연속성은 미구현이다. CUMULATIVE는 동일 계열을 같은 BE로 라우팅해야 하며 설치 가이드는 DELTA를 권장한다.
- 새 상태코드/새 resource/scope/TTL 만료 후 첫 관측은 기준만 저장한다. 원시 계열별 기대12는 두 원시 계열 모두 기준이 확보된 연속 관측에서 성립한다.
- histogram schema가 매번 변하면 반복 보류될 수 있다. 이번 정책은 임의 재분포나 과거 원장 보정을 하지 않는다.
- 미래 시각 guard는 checkpoint 오염을 막는다. ingestor의 파티션 준비는 그 이전이므로 미래 파티션 DDL 범위 제한까지 해결하지는 않는다.
- DB commit 후 메모리 publish 전 강제 종료, 정확한 과거 버킷 재배분, late-arrival rollup 재계산은 후속 과제다.

## 검증

리더가 JDK17에서 직렬 검증했다. BE 203개 실패·오류·skip0 및 bootJar 통과, FE 117개 실패·skip0 및 tsc 통과, 독립 QA 완료. 커밋 BE `22eeff8`, FE `59186c0`. 실제 PG Atomicity 14개·Store 11개가 포함된다. 상세 실행·XML은 `verification/apm-priority-20261006/cumulative-be/`, FE 결과는 `cumulative-fe-jest.json`에 보존한다. 제품 전체 HTTP→브라우저 E2E나 부하 시험으로 주장하지 않는다. 공유 서버 재시작·배포는 하지 않았다.

권장 대상: `OtlpMetricIdentityTest`(리더 소유), `OtlpMetricsReaderTest`, `ApmCumulativePropertiesTest`, `CumulativeDeltaTrackerTest`, `MetricIngestorTest`, `ApmMetricIngestAtomicityIT`, 기존 `ApmMetric1mStoreIT`와 ingest/drop 회귀.

추가 회귀는 원시200/201 실제 합계12, 역순 실제 합계30, schema 변경 후 count=Σbuckets 재개, 동일 시각 duplicate/conflict, zero-duration 첫/새 epoch, TTL·self-sweep, 서비스/global/pending 예산 경합, shrink→growth 및 rollback, 미래 관측 뒤 정상 재개, 원본 리스트 불변, SQL/commit 실패 후 receipt/checkpoint/budget/bounds/live 보존이다.
