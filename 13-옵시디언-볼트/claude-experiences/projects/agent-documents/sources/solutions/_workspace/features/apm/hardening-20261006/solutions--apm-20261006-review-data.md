# APM 전반 평가 — 수집·데이터 정확성·트레이스

평가일: 2026-10-06. 기준 BE 커밋: `e55948c`. 코드·DB·서버를 변경하지 않은 후속 검수다. 기존 `ApmCollectorController.java` 미커밋 변경은 건드리지 않았다. 이전 메트릭 원자성·SSE·조회 상한·RUM 재시도 보완을 미해결 항목으로 되돌려 적지 않는다.

## 판단

수신 실패와 재전송, DB 저장 원자성, 트레이스 논리 중복, 히스토그램 경계 혼합을 고려한 설계가 존재한다. 기능을 연결하는 수준을 넘어 실제 장애 경험이 코드에 반영돼 있다. 다만 **수집 성공 이후 숫자가 정확한지**를 보장하는 데에는 아직 큰 공백이 있다. 정상 형식의 CUMULATIVE 메트릭에서도 차원 축약·순서 역전·노드 분산·히스토그램 경계 변경이 수치를 왜곡할 수 있다. 아래 네 종류는 현재 컴파일 클래스에 직접 입력해 재현했다.

따라서 이 영역의 평가는 **기능 구현도는 높지만, 데이터 정합성은 상용 운영 확대 전에 우선 보완해야 하는 상태**다. 특히 설치 가이드는 DELTA를 권장하지만 CUMULATIVE를 계속 수용하므로, 가이드만으로 정확성 문제를 해결했다고 볼 수 없다. 실제 고객의 CUMULATIVE 사용 비율·오염 규모는 조사하지 않았다.

## 검증 범위

- 실제 소스와 기존 테스트를 읽고, JDK 17 JShell에서 `build/classes/java/main`의 `ApmDimsNormalizer`, `CumulativeDeltaTracker`, `OtlpMetricsReader`를 직접 실행했다.
- 포인트 조립에는 기존 `build/classes/java/test`의 `ApmTestPoints`를 사용했다. 실제 DB, HTTP, Collector 및 FE까지 연결한 재현은 수행하지 않았다.
- 차원 축약 재현은 실제 `ApmDimsNormalizer(null)`로 상태 코드를 정규화했다. `null`은 DB route 워밍만 생략하며 정규화 코드는 그대로 실행한다.
- 아래의 **재현 확인**은 해당 production 클래스 수준의 결과다. **코드상 추론**은 실서비스에서 관측된 장애라는 뜻이 아니다. 실제 피해 규모는 확인하지 않았다.

## 우선순위

| 순위 | 항목 | 심각도 | 근거 수준 |
|---|---|---|---|
| 1 | 원시 시계열을 합쳐 놓고 CUMULATIVE 차분 | P1 | 실제 정규화·tracker 재현 |
| 2 | 과거 누적값 도착을 카운터 reset으로 오인 | P1 | 실제 tracker 재현 |
| 3 | CUMULATIVE의 히스토그램 경계 변경 미검출 | P1 | 실제 tracker 재현 |
| 4 | 다중 BE·재시작 시 차분 기준값 연속성 | P1 | 독립 tracker 2개 재현 + 장애 구간 추론 |
| 5 | 늦게 온 원본의 롤업 재계산·보존 연계 공백 | P1 | 실제 코드상 추론 |
| 6 | 트레이스 외부→내부 재분류 후 옛 집계 잔존 | P2 | 실제 SQL상 추론 |
| 7 | 메트릭 관측 시각 범위 검증 없이 파티션 준비 | P2 | 파서 수용 재현 + DDL 경로 확인 |

### 1. 원시 시계열별로 차분한 뒤 저장 차원을 합쳐야 한다

**발동 조건:** 같은 서비스·인스턴스·메트릭에서 서로 다른 원시 차원이 같은 저장 차원으로 축약되는 CUMULATIVE 입력. 예를 들어 HTTP `200`과 `201`은 모두 `2xx`가 되고, route 상한 밖 경로는 모두 `__other__`가 된다.

**근거:** `MetricIngestor.java:438`에서 정규화한 `dims.hash()`를 `:449`의 `valuesOf`에 넘기고, `:728`에서 그대로 `SeriesKey`를 만든다. `ApmDimsNormalizer.java:211`은 응답 코드를 status class로 바꾸며 `:157`은 route 축약을 수행한다. `CumulativeDeltaTracker.java:107`의 신원에는 원시 속성·scope가 없다.

**재현:** 실제 normalizer가 아래 두 속성을 동일 JSON·해시로 만들었다.

```text
200 -> {"http.request.method":"GET","http.route":"/orders","status_class":"2xx"}
201 -> {"http.request.method":"GET","http.route":"/orders","status_class":"2xx"}
첫 관측: 200계열=100, 201계열=20
다음 관측: 200계열=110, 201계열=22
기대 증분: 10 + 2 = 12
실제 증분: 90 + 22 = 112
```

현재 코드는 두 누적 카운터가 하나의 직전값을 덮어쓴다. 한 관측은 다른 계열의 직전값을 빼고, 다른 관측은 값 감소로 reset 처리된다. 요청 수·평균·분포·실시간 RED에 전달될 데이터 자체가 틀어진다.

**현재 방어:** DELTA는 그대로 통과하므로 이 차분 문제를 겪지 않는다. GAUGE·UpDownCounter는 차분하지 않는다. 설치 가이드 `ApmInstallGuideService.java:680` 이후는 DELTA를 권장한다. DB 영수증·배치 트랜잭션은 같은 배치의 재적재를 막지만 서로 다른 정상 계열의 충돌을 막지는 않는다.

**개선:** 원시 계측 시계열의 신원(resource의 프로세스 식별, scope, 원래 메트릭·단위·속성)을 유지한 차분 키를 별도로 만들고, 시계열별 증분이 결정된 뒤 저장용 status class·route 상한으로 합산한다. 원시 신원을 보존하는 상태의 cardinality 한도도 동시에 설계한다.

**완료 기준:** 200/201, 서로 다른 DB 속성, route overflow, 같은 이름의 다른 scope에 대해 입력 순서와 무관하게 독립 계열 차분의 합이 저장 count/sum/버킷 합과 일치해야 한다. HTTP→DB까지 회귀 검증을 추가해야 한다.

### 2. 도착 순서와 관측 시각을 분리해야 한다

**발동 조건:** Collector 재전송·병렬 전송 등으로 같은 CUMULATIVE 시계열의 이전 관측이 새 관측 뒤에 도착한다. 모든 포인트의 `startTime`은 동일하고 프로세스 재시작은 없다.

**근거:** `CumulativeDeltaTracker.java:199`~`:218`에서 관측값을 직전값으로 먼저 교체하고, `:247`에서 count/value 감소를 reset으로 취급한다. `Last`(`:305`)에는 관측 `point.time()`이 없고 수신 측 정리용 `seenAtEpochMs`만 있다.

```text
동일 startTime, 시간순 값: t0=100, t1=110, t2=120, t3=130
실제 도착 순서: t0, t2, t1, t3
초기100: 오래된 시리즈 첫 관측이므로 기준만 설정
기대 전체 증분: 30
실제: 20 + 110 + 20 = 150
```

**영향:** 늦게 온 과거값 전체를 새 시작점처럼 가산하고 기준까지 되돌리므로, 다음 정상 포인트에서도 중복 구간을 가산한다. 높은 요청량·오류·CPU 누적값처럼 보이는 가짜 급증을 만들 수 있다.

**현재 방어:** 같은 배치 본문 재전송은 receipt가 막고 같은 인스턴스 병렬 처리는 stripe lock으로 직렬화한다. 이 방어는 시계열의 관측 시각 순서를 정렬하지 않는다. 정상적인 `startTime` 변경은 별도 reset 신호로 유지해야 한다.

**개선:** 마지막 관측 시각을 checkpoint에 보관하고 `time <= lastTime`과 epoch 변경을 분리한다. 정렬 가능한 한 배치 내부에서는 원시 시계열별 시각 정렬, 요청 간에는 정해진 허용 지연 정책·폐기 통계·또는 재계산 경로를 둔다. 과거값 수신만으로 기준을 되돌리지 않는다. 늦은 포인트를 버리는 것만으로 무손실을 보장할 수는 없으며, 누적 증가량을 어느 시간 버킷에 배분하는지까지 검증해야 한다.

**완료 기준:** 순서가 섞인 입력, 동시 요청, 동일 시각 중복, 과거 epoch 지연 전송, 실제 재시작 각각에 대해 count/sum이 기준 모델과 일치하고 오래된 포인트가 false reset을 만들지 않아야 한다.

### 3. 히스토그램 차분 시 경계 내용도 비교해야 한다

**발동 조건:** 같은 키·같은 `startTime`의 CUMULATIVE histogram이 경계 개수는 같고 경계 값이 달라진다. 현재 공용 reader는 exponential histogram의 scale·offset에 따라 경계 배열도 생성한다(`OtlpMetricsReader.java:288`~`:325`).

**근거:** `CumulativeDeltaTracker.java:250`~`:252`는 버킷 배열 길이만 검사한다. `Last`(`:305`)에 bounds가 없다. `:317`~`:329`는 각 배열 위치를 빼고 음수만 0으로 누른다. 이후 `MetricIngestor.java:748`~`:751`은 현재 bounds와 그 차분 배열을 한 쌍으로 저장한다.

```text
이전: bounds=[1],   count=10, counts=[10,0], sum=5
현재: bounds=[0.1], count=11, counts=[1,10], sum=5.05
실제 차분: count=1, counts=[0,10], sum(counts)=10
```

**영향:** 스칼라의 요청 수와 histogram 표본 수부터 달라지고, p95/히트맵이 잘못된 구간의 분포를 읽는다. 원본 histogram 양쪽은 각각 count와 버킷 합이 맞는다.

**현재 방어:** 경계 개수가 달라지는 경우는 reset으로 감지한다. `ApmMetric1mStore.java:176`~`:182`, `:209`의 같은 1m PK에 서로 다른 bounds ID가 들어오는 방어는 histogram을 NULL로 만들고, 조회 `ApmHistogramMerger`도 mixed-bounds를 감지한다. 하지만 최초 관측을 기준값으로만 삼아 저장하지 않았거나 시각이 다른 1m 버킷으로 넘어갔다면 같은 PK 충돌 자체가 없다. 이미 잘못 차분된 벡터에 현재 경계만 붙어 들어오므로, 저장·조회 계층만으로 이 오류를 막을 수 없다. 이번 수치 재현은 tracker 출력까지이며 DB 적재 시험은 하지 않았다.

**개선:** checkpoint에 bounds/단위/종류 fingerprint를 포함한다. 변경된 격자를 안전하게 정렬할 수 있을 때만 재버킷 후 차분하고, 그렇지 않으면 명확한 이유와 함께 기준 재설정·해당 증분 보류 정책을 적용한다. `count == sum(bucketCounts)` 불변식을 수신·차분 결과에서 확인한다.

**완료 기준:** 같은 길이의 다른 explicit bounds, exponential scale·offset 변화, 단위 전환, 버킷 합 불일치가 정상 분포로 저장되지 않아야 한다. 모든 수용한 차분에서 스칼라 count와 버킷 합이 일치해야 한다.

### 4. 다중 BE에선 누적 구간이 겹쳐 계상될 수 있다

**발동 조건:** 같은 시계열의 서로 다른 배치가 서로 다른 BE로 분산되거나 BE가 재시작된다. 이번에 추가한 영수증 선점은 같은 본문 중복은 막지만 서로 다른 배치의 차분 기준값은 공유하지 않는다.

**근거:** `CumulativeDeltaTracker.java:86`의 `ConcurrentHashMap`, `:110`~`:123`의 JVM 내 잠금·commit 후 반영. `:224`~`:233` 첫 관측 규칙. DB와 메모리 사이의 원자적 durable checkpoint는 없다.

```text
동일 원시 시계열 매분 +10, 독립 tracker A/B 교차 수신
A 100 -> skip, B 110 -> skip
A 120 -> 20, B 130 -> 20, A 140 -> 20, B 150 -> 20
실제 전체 증가 50, 관측된 저장 대상 증분 합 80
```

**영향:** 첫 관측 손실에서 끝나지 않고, 분산이 지속되면 각 노드가 겹치는 시간 구간을 반복 계상한다. 따라서 클래스 주석 `:26`~`:27`의 “최대 한 점” 설명은 교차 라우팅 상황을 충분히 설명하지 못한다. 재시작 또는 DB commit 결과 불확실 시 DB와 메모리 기준값이 달라지는 경로도 남아 있다.

**현재 방어:** 단일 BE·고정 시계열 라우팅에서 정상 commit 실패의 상태 rollback은 이번에 보완됐다. DELTA 송신은 누적 기준값 의존을 제거한다.

**개선:** 단기에는 지원 배치 형태를 DELTA 중심으로 명확히 하고 CUMULATIVE에 고정 시계열 라우팅을 강제·진단한다. HA를 지원하려면 데이터 적재와 결합된 durable checkpoint 또는 시계열별 단일 작성자와 복구 가능한 상태를 마련한다.

**완료 기준:** 두 BE 교차 라우팅·rolling restart·DB commit 직후 강제 종료·응답 유실·동일 본문 재전송 후 다른 본문 수신에서도 DELTA 기준 원장과 총량이 일치해야 한다. 단순 2노드 기동 성공으로 HA 검증을 대체하지 않는다.

### 5. 지연 도착과 롤업·보존을 하나의 복구 계약으로 묶어야 한다

**발동 조건:** 전체 수집이 멈춘 경우가 아니라 일부 서비스·인스턴스만 늦게 보내거나, 롤업이 처리한 과거 시각의 원본을 backfill한다. 또는 롤업 지연이 원본 보존 기간을 넘는다.

**근거:** 메트릭 `ApmRollupService.java:95`는 LAG 2분, `:308`~`:311`는 watermark 다음 버킷만 처리한다. `:261`의 hold는 전체 창 `rows==0`일 때만 작동한다. 과거 버킷 dirty 표시·재계산 큐가 없다. 트레이스는 `ApmTraceRollupService.java:139`, `:229`의 최근 2버킷(10분) 재계산이 이미 구현되어 있으나 그보다 오래된 지연분까지 복구하는 계약은 아니다.

기본 보존 경로는 `ApmRetentionService.java:104`~`:107` → `ApmPartitionService.java:243`~`:254`에서 날짜만 보고 DROP한다. archive on일 때는 별도 게이트가 있지만, 이 기본 경로에 롤업 watermark 완료 확인은 없다.

**영향:** 최근 1m와 오래된 5m/1h 화면의 요청 수가 다르고, 지연된 스팬이 원본에는 존재하지만 분석 집계에서는 빠진다. 원본이 만료되면 재계산 재료까지 사라진다.

**현재 방어:** 메트릭 2분·트레이스 3분 LAG, 전체 빈 창 watermark hold, trace 10분 lookback, 재실행해도 값이 부풀지 않는 대입 UPSERT, archive DROP gate가 있다.

**개선:** 지원하는 최대 지연 시간을 명시하고, 그 범위 안에서 dirty bucket을 표시해 1m→5m→1h 파생을 재계산한다. 트레이스 파생도 같은 정책을 따른다. 원본 DROP 전에 파생 완료/의도적 유실을 확인하되 저장 공간 고갈 시의 보류 상한·경고·운영 조치를 함께 둔다.

**완료 기준:** 일부 collector를 30분·수시간 지연 후 복구해도 지원 범위 내 원본과 집계 총량이 일치해야 한다. 롤업 장애 시 보존 작업이 검증 없이 미집계 원본을 지우지 않고, 용량 한계 도달은 명확히 알려야 한다.

### 6. 트레이스 재분류 때 사라진 옛 키도 제거해야 한다

**발동 조건:** CLIENT span이 먼저 집계되어 외부 HTTP 호출로 분류된 뒤, lookback 안에 다른 서비스의 자식 SERVER span이 도착한다.

**근거:** `ApmTraceRollupService.java:315`~`:351`는 자식 존재에 따라 같은 CLIENT를 HTTP에서 SERVICE로 바꾼다. `:366`~`:385`는 현재 결과의 키에 UPSERT만 한다. `:748`~`:772`는 내부 서비스로 해소된 호출을 외부 의존 집계 대상에서 빼지만, `:784`~`:800` 역시 UPSERT뿐이다. 이 클래스에 `DELETE` 경로가 없다.

**영향(코드상 추론):** 새 SERVICE 엣지는 생기고 기존 HTTP 엣지·외부 dependency 행은 그대로 남을 수 있다. 같은 호출이 두 대상처럼 보여 서비스 맵·외부 호출 수가 왜곡된다. `:717`~`:720` 주석은 최근 lookback 범위의 옛 행이 사라진다고 설명하지만, 실제 SQL은 생성되지 않는 키를 지우지 않는다.

**현재 방어:** 자식 조회를 미래 경계까지 넓히고 LAG 3분·10분 lookback을 둔다. 처음 집계 시점에 양쪽 스팬이 모두 존재하면 정상 분류된다. 기존 테스트는 동시 존재와 같은 키의 늦은 스팬 추가를 다루지만 분류 키가 바뀌는 2회 집계 회귀는 확인되지 않았다.

**개선:** 재계산하는 닫힌 버킷의 결과 전체를 트랜잭션 안에서 교체하거나, 새 집계에 없는 이전 키를 차집합 삭제한다. 빈 결과도 해당 버킷의 기존 결과를 제거하는 상태로 취급한다.

**완료 기준:** CLIENT만 수신→1차 rollup→자식 SERVER 수신→2차 rollup에서 SERVICE 한 종류만 남고 HTTP/외부 dependency 옛 행은 사라져야 한다. 혼합 버킷의 진짜 외부 호출은 유지해야 한다.

### 7. 서버 메트릭 수신 시각에 허용 창을 적용해야 한다

**발동 조건:** 잘못된 SDK 시계 또는 잘못 구성된 입력이 매우 먼 과거·미래의 관측 시각을 보낸다.

**근거:** `ApmOtlpController.java:448`에서 서버 수신 시각을 얻고 `:509`에서 payload와 함께 파이프라인에 전달한다. `MetricIngestPipeline.java:66`~`:68`은 reader 출력 포인트를 시간 필터 없이 `ingestOnce`에 넘긴다. `OtlpMetricsReader.java:194`는 time을 읽고 `:201`~`:215`에서 포인트로 전달한다. `MetricIngestor.java:129`~`:133`는 허용된 메트릭의 그 날짜를 곧바로 파티션 준비에 사용한다. `ApmMetric1mStore.java:431`~`:433`는 모든 날짜를 `ensurePartition`에 넘긴다. Controller→pipeline→ingestor 사이에 관측 시각의 과거·미래 허용 창 검사는 없다.

**재현:** 현재 시각을 `2026-10-06T00:00:00Z`로 주고 실제 `OtlpMetricsReader`에 `2030-01-01T00:00:00Z`인 DELTA 포인트를 넣었을 때 그대로 수용됐다. DB DDL은 실행하지 않았다.

**영향(후속 경로 추론):** 정상 조회 범위 밖 데이터·불필요한 미래 파티션이 생기고, 긴 날짜 범위를 섞은 요청은 DDL 준비 비용도 키운다. 이미 보존 정리된 과거 날짜를 재생성할 수도 있다.

**현재 방어:** 요청 본문 크기 제한, 메트릭 allowlist는 있다. RUM은 `RumParser.java:314`~`:316`에서 과거 30일·미래 300초의 별도 시각 검증을 이미 한다.

**개선:** 서버 OTLP에도 신호별 허용 clock skew·최대 backfill 기간을 수신/partition 준비 전에 적용하고 범위 밖 포인트는 명시적 폐기 통계로 남긴다. 운영상 backfill은 별도 승인된 경로·속도 제한으로 분리한다.

**완료 기준:** 허용 창 밖 포인트는 파티션·시계열·불필요한 서비스 메타데이터를 생성하지 않아야 한다. 경계 시각과 명시적 backfill은 테스트로 고정한다.

## 결함에서 제외한 항목 — RUM sessions

동일 브라우저 세션이 여러 5분 버킷 또는 여러 페이지에서 활동하면 합산 sessions는 기간 고유 세션 수보다 커진다. 최초 검토에서는 제품 정의 확인이 필요한 후보였으나, FE 담당 검수와 실제 locale·컴포넌트로 의도된 계약임을 확인해 **개선 우선순위·버그 목록에서 제외했다**.

**근거:** `RumStore.java:104`~`:130`는 `(group,browser,os,country,bucket,session_hash)`별 distinct를 센다. `RumQueryService.java:233`은 페이지의 전체 기간 `Row.sessions`를 합산하고, `:249`는 시계열도 합산한다. 이 값은 **기간 고유 세션 수가 아니라 5분·페이지별 distinct의 합**이다.

**예:** 같은 세션 하나가 같은 페이지에서 15분간 세 버킷에 등장하면 기간 합산은 3이다. 기간 내 고유 세션은 1이다. 코드를 실행한 DB 재현은 하지 않았다.

**현재 방어:** 같은 버킷의 세션 중복은 PK로 제거하며 원시 session id는 해시 처리한다. Web Vital histogram은 DELTA만 받고 receipt와 집계를 하나의 트랜잭션으로 저장한다. 이번 제한 재시도도 기존 저장 중복 방어와 연결돼 있다.

**확인된 제품 표현:** `moveseyee_fe/src/locales/kr.json:209`는 `버킷 세션 합`, `:236`의 `session_note`는 전체 기간 고유 세션이 아니라고 명시한다. `src/pages/application-monitoring/rum/components/ApmRumTrafficCard.tsx:55`에서 이 설명을 실제 표시한다. 현재 정의와 구현이 일치한다. 기간 고유 세션 제공은 필요할 때 별도 제품 확장으로 결정할 사항이다.

## 주요 소스 경로

아래 경로는 모두 `C:/solutions/moveseye-be-spring/` 기준이며, 본문의 파일명·줄 번호와 함께 읽는다.

- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/CumulativeDeltaTracker.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/ApmDimsNormalizer.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/ApmMetric1mStore.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/MetricIngestPipeline.java`
- `src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/ApmOtlpController.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/rollup/ApmRollupService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/core/batch/partition/ApmPartitionService.java`
- `src/main/java/com/dmove/moveseye/premium/apm/trace/rollup/ApmTraceRollupService.java`
- `src/main/java/com/dmove/moveseye/otel/metric/OtlpMetricsReader.java`

## 잘 구현된 부분

1. **메트릭 재전송·실패 원자성:** `ApmMetricBatchWriter.java:27`~`:37`에서 DB receipt 선점과 데이터 writer를 같은 트랜잭션에 넣었다. `CumulativeDeltaTracker.java:117`~`:119`는 DB commit이 끝난 뒤 메모리 기준을 공개한다. 정상적으로 판정 가능한 rollback을 되돌리는 이번 개선은 유효하다.
2. **트레이스 논리 중복·동시 적재:** `ApmTraceWriter.java:139`~`:151`는 trace 단위 DB advisory lock, 논리 span dedupe, 적재·summary 병합을 함께 수행한다. 배치 중간 실패 후 이미 저장한 trace가 다시 와도 재적재를 막는 구조다.
3. **불확실한 백분위의 정직한 표현:** `ApmHistogramMerger.java:164`~`:181`는 합칠 수 없는 경계가 섞이면 전체 p95처럼 보이는 값을 만들어 내지 않고 bounds를 없애 계산을 중단한다. 수신 차분의 경계 오류와 별개로 조회 쪽의 중요한 방어다.
4. **RUM 수신 방어:** `RumParser.java:89`~`:95`는 CUMULATIVE histogram을 거부하고, `:289`~`:306`는 길이·순서·count 합을 확인한다. `RumStore.java:76` 이후 receipt·session·page·timing·error·span을 같은 트랜잭션에서 잠금 순서를 맞춰 저장한다.
5. **조회·운영 범위 제한:** 트레이스 상세는 `ApmTraceQueryService.java:594`, `:620`~`:624`에서 최대 5,000 span과 `truncated`를 명시한다. 롤업은 SQL로 집계하고 대입 UPSERT로 재실행 가능성을 확보했다. trace lookback·archive DROP gate 같은 복구 장치도 존재한다.

## 재현 방법·출력 보존

별도 소스 파일을 생성하지 않고 PowerShell here-string을 JDK 17 `jshell.exe --class-path <cp> -` stdin으로 전달했다. classpath는 main/test classes와 Gradle cache의 `slf4j-api`, Spring core/jcl/beans/jdbc/tx, Jackson core/databind/annotations JAR였다. `-sources`·`-javadoc` JAR는 제외했다. SLF4J provider 없는 경고만 있었고 실행은 종료 코드 0으로 완료했다.

후속 문서 작업에서 당시 두 성공 세션의 전체 입력을 [cumulative-probe.jsh](file:///C:/solutions/_workspace/_archive/features/apm/hardening-20261006/apm-20261006-assessment/cumulative-probe.jsh)에 보존했다. 한 파일로 이어 실행할 수 있도록 첫 세션의 `/exit`만 `/reset`으로 바꿨으며 **결합 파일 자체는 재실행하지 않았다**. [cumulative-probe-result.txt](../../../_archive/features/apm/hardening-20261006/apm-20261006-assessment/cumulative-probe-result.txt)는 앞서 실제 실행한 두 성공 세션의 콘솔 출력을 순서대로 보존한 것이다. 새로운 실행 결과가 아니다.

핵심 실행 구성은 다음과 같다. `inBatch` 밖 직접 호출은 동일 스레드 정상 성공 처리에 해당하며, DB 원자성 자체를 검증한 시험은 아니다.

```java
var normalizer = new ApmDimsNormalizer(null);
var spec = ApmMetricAllowlist.find("http.server.request.duration").orElseThrow();
var attrs200 = Map.of("http.request.method", "GET", "http.route", "/orders",
                     "http.response.status_code", "200");
var attrs201 = Map.of("http.request.method", "GET", "http.route", "/orders",
                     "http.response.status_code", "201");
var d200 = normalizer.normalize(1, spec, attrs200);
var d201 = normalizer.normalize(1, spec, attrs201);
// d200.hash().equals(d201.hash()) == true
var key = new CumulativeDeltaTracker.SeriesKey(1, "inst-1", spec.metric(), d200.hash());
// ApmTestPoints.point(spec.metric()).histogram(...).attrs(...).at(...).startedAt(...).build()
// 로 만든 포인트를 tracker.delta(key, point)에 위 시나리오 순서대로 입력.
```

실제 출력:

```text
NORMALIZED={"http.request.method":"GET","http.route":"/orders","status_class":"2xx"} SAME_KEY=true
COLLISION_BASE=100,20
COLLISION_NEXT=90,22 EXPECTED=10,2
ORDER_BASE=Optional.empty
ORDER_DELTAS=20.0,110.0,20.0 EXPECTED_TOTAL=30
NODE A INPUT=100 DELTA=Optional.empty
NODE B INPUT=110 DELTA=Optional.empty
NODE A INPUT=120 DELTA=Optional[DeltaValues[count=0, sum=20.0, bucketCounts=null]]
NODE B INPUT=130 DELTA=Optional[DeltaValues[count=0, sum=20.0, bucketCounts=null]]
NODE A INPUT=140 DELTA=Optional[DeltaValues[count=0, sum=20.0, bucketCounts=null]]
NODE B INPUT=150 DELTA=Optional[DeltaValues[count=0, sum=20.0, bucketCounts=null]]
BOUNDS_CHANGE COUNT=1 BUCKETS=[0, 10] BUCKET_SUM=10
FUTURE_ACCEPTED=2030-01-01T00:00:00Z
```

SUM 포인트의 tracker `count=0`은 원본 SUM에 histogram count가 없기 때문이며, 실제 `MetricIngestor`는 `sum`에서 저장 count를 산출한다. 이 검수는 SUM의 `sum` 증분을 비교했다.

## 다음 검증에서 필요한 것

우선 1~4의 reference model 기반 회귀를 추가하고, 같은 포인트 집합을 DELTA/CUMULATIVE·순서 정방향/역전·단일/다중 노드로 입력해 총량과 분포를 대조해야 한다. 이어서 5~6을 실제 PostgreSQL 2회 집계·지연 복구 시험으로 확인한다. 기존 수백 개 선별 테스트 통과는 유효한 회귀 근거지만, 여기서 새로 확인한 수치 불변식을 대신하지 않는다.
