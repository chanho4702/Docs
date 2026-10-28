# APM CUMULATIVE 정확성 보완 설계 — 2026-10-06

상태: 단계2~4 구현 완료, 리더 직렬 검증 대기. 2026-10-06 독립 설계 검토와 리더 보정을 반영한 최종 설계다. 이전 초안의 첫값120초 grace와 단일 committed+pending 셀 풀 제안은 폐기했다. API/설정 정본은 [구현 계약](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-CUMULATIVE-%EC%A0%95%ED%99%95%EC%84%B1-%EB%B3%B4%EC%99%84-%EA%B3%84%EC%95%BD-2026-10-06.md)이다.

## 1. 목적과 근거

[데이터 평가](../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-%EC%A0%84%EB%B0%98-%ED%8F%89%EA%B0%80-%EC%88%98%EC%A7%91-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%A0%95%ED%99%95%EC%84%B1-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8A%A4.md)와 [기존 JShell 입력](../verification/apm-20261006-assessment/cumulative-probe.jsh)은 변경 전 코드의 다음 오류를 확인했다. 이 과거 실행을 새 구현 검증으로 재사용하지 않는다.

- 원시 status200/201 누적값100/20→110/22가 정규화된2xx checkpoint를 공유하여 기대12 대신112로 증가했다.
- 같은 epoch의100(t0)→120(t2)→110(t1)→130(t3)이 기대30 대신150을 생성했다.
- 같은 길이의 bounds 변경에서 count delta1, bucket delta합10이 생겼다.

새 구현은 원시 신원별 차분, 시각/epoch 보호, 분포 schema 재기준, bounded checkpoint 상태로 이 세 오류를 막는다. DELTA/GAUGE/UpDownCounter의 수용 의미는 유지한다. 미래 파티션 생성 범위·다중 BE durable checkpoint·late rollup은 후속 과제다.

## 2. 원시 시계열 식별

`OtlpMetricPoint`에 내부 `sourceIdentityHash`를 추가한다. 기존17인자 생성자는 flatten된 model 기반 fallback을 계산해 호환하며, 생산 HTTP CUMULATIVE 경로는18번째 인자에 typed 원시 hash를 전달한다.

신원의 구성 요소:

- resource의 전체 typed attributes와 resourceMetrics schemaUrl
- scope name/version/typed attributes와 scopeMetrics schemaUrl
- 원래 metric name/unit/kind/monotonic, explicit/exponential 표현 구분
- 원래 data point typed attributes

관측 시각/startTime/value/count/bucketCounts/min/max/exemplar/bounds는 신원에서 제외한다. bounds는 checkpoint schema fingerprint에 들어간다. raw attribute 문자열이나 전체 JsonNode는 tracker에 보관하지 않는다.

`OtlpMetricIdentity`는 SHA-256에 타입·길이를 구분하여 직접 입력한다. attributes는 key순 정렬과 last-valid-value-wins, 배열은 순서 유지, kvlist는 key순 정렬이다. 값 없는 AnyValue는 제외한다. intValue의 숫자/문자열/지수형·정수인 소수는 signed int64의 같은 값으로 처리하고 stringValue와는 구분한다. Long.parseLong fast path 뒤128자 이내의 BigDecimal.longValueExact fallback을 쓴다. 임의 크기 BigInteger로 확장하지 않는다. bytesValue는 padded/unpadded/URL-safe base64의 동일 byte를 같은 신원으로 만든다. AnyValue 중첩은32단계로 제한한다.

typed hash는 차분 대상 CUMULATIVE에만 lazy 계산한다. resource/scope hash의 성공과 실패를 요청 범위에 memoize하여 공통 잘못된 속성을 포인트마다 재해시하지 않는다. malformed typed identity는 해당 포인트를 제외하고 원문 없는 고정 로그를 남긴다. DELTA/GAUGE는 기존 parser 의미를 유지한다. reader 단계 제외 수가 tracker drop reason에 나타나지는 않는다는 관측 한계를 계약에 명시한다.

## 3. 배치 처리와 저장 차원

`MetricIngestor`는 기존 서비스 귀속과 허용목록을 유지한다. 원래 입력 순서로 차원을 한 번 정규화하여 prepared Dims를 보관한다. 따라서 route 상한의 선착순 admission을 바꾸지 않는다.

CUMULATIVE 대상만 추출하여 time오름차순 stable sort하고 복사본의 CUMULATIVE 슬롯에 다시 넣는다. 원본 safePoints와 DELTA/GAUGE/UpDownCounter의 상대 순서를 유지한다. 같은 원시 계열의 내부 시간 순서는 보장되며 동일 시각의 첫 값이 우선한다.

차분 key는 `(serviceId, instanceId, canonical storage metric, sourceIdentityHash)`다. 원시 이름/단위/타입은 sourceIdentityHash에 포함된다. 기존 SeriesKey.dimsHash 필드명은 호환을 위해 남기되 값은 raw hash다. 결과를 기존 storage dims/hash로 합산하므로 조회 API 및 DB PK는 바뀌지 않는다.

## 4. 시간·epoch 정책

checkpoint Last는 observationTime/startTime/schema/count/value/bucketCounts/서버seenAt을 가진다. seenAt은 TTL용이고 관측 순서에는 쓰지 않는다. 입력 검증 → 시간/epoch 거부 판정 → 차분/재기준 판정 → 예산 예약·snapshot 순서다. 거부된 과거·충돌·invalid 포인트는 checkpoint와 TTL을 갱신하지 않는다.

| 조건 | 결과 | checkpoint |
|---|---|---|
| time>clock+future허용치, start>time, 숫자/분포 불변식 위반 | INVALID_POINT | 유지 |
| time<last.time | OUT_OF_ORDER | 유지 |
| time동일, epoch/schema/count/value/buckets동일 | DUPLICATE | 유지 |
| time동일이나 다른 값 | POINT_CONFLICT, first-wins | 유지 |
| time증가했지만 명시start가 이전 epoch보다 작음 | OUT_OF_ORDER | 유지 |
| start==time (최초·새 epoch 모두) | UNKNOWN_START, 증가기여0 | 새 기준 |
| 첫 key, 그 외 모든 startTime 나이·부재 | FIRST_SKIPPED | 새 기준 |
| 명시start 증가, 이전 observation 이상, 현재time 미만 | 명확한 새 epoch, 전체현재값 수용 | 새 기준 |
| start null↔nonnull 또는 이전 관측과 겹치는 start변화 | RESET_UNCERTAIN | 새 기준 |
| same epoch의 schema변화 | SCHEMA_CHANGED | 새 기준 |
| same epoch의 count/value/bucket감소 | RESET_UNCERTAIN | 새 기준 |
| 정상 증가 | 차분 수용 | 새 기준 |
| 필요한 snapshot/key 예산 부족 | STATE_LIMIT | 기존 pending/committed 유지 |

모든 신규 원시 key는 첫 값을 기준으로만 삼는다. 이는 resource metadata 변경·service 재등록·scope 전환 때 젊은 누적값 전체가 다시 더해지는 것을 막는 대신 첫 구간을 보류한다. 기존 key의 명확한 새 epoch만 전체 수용한다.

start==time의 증가기여0은 [OTel unknown start time 규약](https://opentelemetry.io/docs/specs/otel/metrics/data-model/#cumulative-streams-handling-unknown-start-time)을 따른다. 첫100→다음110은10, 기존 epoch 뒤 새 zero-duration1000→다음1010도10이다.

동일 시각 correction은 이미 덧셈 저장한 원본을 정확히 취소할 원장이 없으므로 수정하지 않는다. 늦은 점을 건너뛰어 후속 누적값에서 일부 증가분이 회복되더라도 과거1분 버킷 귀속이나 무손실을 보장하지 않는다. 미래 거부로 기준 오염을 막지만 ingestor의 더 앞선 partition preparation 범위는 별도 문제다.

## 5. histogram schema

schema fingerprint는 kind/unit/monotonic와 bounds의 IEEE-754 표현을 포함한다. 같은 길이 배열이라도 경계가 달라지면 다른 schema다. 같은 epoch에서 schema가 바뀌면 현재 전체값을 baseline으로만 남기고 한 구간을 보류한다. 이전 벡터를 임의 rebin하여 빼거나 인덱스끼리 빼지 않는다. 명확한 새 epoch는 reset 정책을 먼저 적용하므로 새 schema의 첫 증가량을 전체 수용할 수 있다.

CUMULATIVE 입력의 bounds는 finite·엄격증가, counts는 비음수, 합산은 overflow-safe이며 `count == ΣbucketCounts`여야 한다. 정상 차분은 같은 schema의 모든 원소가 증가하는 경우에만 생성하여 count/bucket 합을 유지한다. Math.max로 음수 원소를 숨기지 않는다. DELTA 불변식 검증과 histogram sum의 부재→0 parser 의미는 이번 범위 밖이다. 지속적인 exponential scale/offset 변경은 반복 baseline 보류를 만들 수 있다.

## 6. 메모리·동시성·원자성

초기 보호값은 다음과 같으며 실측 지원 규모나 전체 heap cap은 아니다.

| 예산 | 기본 | 범위 |
|---|---:|---|
| 전역계열 max-series | 50,000 | 1~250,000 |
| 서비스계열 max-series-per-service | 10,000 | 1~250,000, 전역 이하 |
| committed셀 max-histogram-cells | 2,000,000 | 1~16,000,000 |
| in-flight셀 max-pending-histogram-cells | 2,000,000 | 1~16,000,000 |
| 미래허용 max-future-seconds | 300초 | 0~3,600 |

- 기존256개 ReentrantLock stripe의 키는 `(serviceId,instanceId)`만 유지한다. hash를 stripe에 넣으면 ingestor의 placeholder선점과 다른 잠금이 되어 교착 위험이 생긴다.
- stripe를 번호순으로 잡고 DB transaction을 수행한 뒤 commit반환까지 유지한다. `BatchState`에 pending snapshot과 신규 key 예약을 보관한다. receipt패자는 supplier를 실행하지 않으므로 예약을 만들지 않는다.
- global/per-service 계열 수는 committed+신규pending을 센다. 전역은 AtomicInteger CAS, 서비스별은 ConcurrentHashMap.compute로 예약한다. 실패 시 먼저 잡은 global permit을 반환한다. 0이 된 서비스 counter는 제거한다.
- committed셀 counter는 실제 committed셀에 pending의 양의 순증가분 예약을 더한다. pending셀 counter는 별도 유지 배열을 센다. 같은크기 교체는 committed풀이 차 있어도 pending여유로 진행된다. 총 장기 보호 범위는 두 풀의 합이다.
- 같은 배치 안에서 다시 snapshot을 바꾸면 old pending 대비 필요한 추가분만 먼저 예약한다. 실패하면 old pending을 유지한다. 성공하면 음의 차이를 반환한다. committed보다 작아진 snapshot은 commit때 실제 old snapshot이 제거된 뒤 committed예산을 반환한다.
- DB 성공 후 실제 map.put 반환값으로 old committed를 정산한다. rollback은 pending셀·순증가예약·신규계열 permit만 반환한다. committed checkpoint는 그대로다.
- `maybeSweep`은 batch진입 전에 실행한다. 공개 sweep을 배치 안에서 호출해도 current pending key는 건너뛴다. 자기stripe의 reentrant tryLock으로 committed를 지웠다가 permit을 이중 반환하는 경로를 막는다. actual conditional remove가 성공한 경우만 반환한다.
- TTL30분/sweep최소1분을 유지하고 clear는 배치 밖에서 모든stripe를 잠근 뒤 상태·예산을 초기화한다. 새 global blocking admission lock이나 DB연결 선점 후 stripe대기를 도입하지 않는다.

## 7. 상세 사유와 관측성

`evaluate`가 DeltaResult(values, reason)을 반환하고 기존 `delta` Optional wrapper를 유지한다. 생산 ingestor는 실제 사유를 token/service 축으로 기록한다. 기존 FIRST_SKIPPED 외 UNKNOWN_START/DUPLICATE/OUT_OF_ORDER/POINT_CONFLICT/SCHEMA_CHANGED/RESET_UNCERTAIN/INVALID_POINT/STATE_LIMIT를 추가한다. 모두 varchar32 범위이며 migration은 없다.

DUPLICATE·UNKNOWN_START는 정보다. accepted의 기존 의미는 유지하고 lostPoints에서 두 사유를 제외한다. 다른 미적재/보류 관측은 집계하되 영구 소실량으로 설명하지 않는다. drop recorder의 기존 afterCommit 처리와 live afterCommit을 유지한다. FE union·label·tone·손실합산 변경은 별도 담당이며 [계약](../06-API-%EA%B3%84%EC%95%BD/solutions--APM-CUMULATIVE-%EC%A0%95%ED%99%95%EC%84%B1-%EB%B3%B4%EC%99%84-%EA%B3%84%EC%95%BD-2026-10-06.md)에 실제 응답 shape를 기재했다.

## 8. 검증과 남은 작업

제품 코드 수정 대상은 Point/Identity/Reader, Tracker/Properties, MetricIngestor, drop reason/DTO설명, application.yml이다. writer·receipt·DBschema·trace·rawpolicy는 이번 단계에서 바꾸지 않는다.

작성한 회귀:

- reader raw typed identity와 fallback 미사용, 속성 순서·정수 표기·bytes 표기·scope/resource/schema·unit·관측메타 제외.
- 원시200/201 차분12, 역순30, same-time 중복/충돌, old epoch·정상재시작·unknown-start·첫값나이경계.
- schema 길이동일/변경, 감소·overflow·불일치 입력, 새 epoch와 schema 동시 변경.
- global/service/committed/in-flight 한도, concurrent pending admission, rollback 재사용, snapshot3→2→4 commit/rollback, self-sweep·TTL·clear, hash가 달라도 같은stripe선점.
- ingestor 입력 불변·다른신호순서·정보성사유loss제외·resource enrichment baseline.
- PostgreSQL IT 실제 delta12/30, schema변경 후count=Σhist 재개, SQL/commit/bounds실패 후 receipt/checkpoint/예산/live 미반영과 재시도.

구현 담당은 테스트·빌드·DB·서버 재시작·커밋을 실행하지 않았다. 리더의 직렬 Gradle검증 후 계약의 검증 절을 갱신한다. 평가 단계에서 실행한 기존 JShell 결과와 새 코드 검증을 구분한다.

JVM 간 durable checkpoint, commit직후 강제종료, late-arrival 재계산, 미래 파티션 DDL범위, 정확한 correction원장은 여전히 후속 과제다.