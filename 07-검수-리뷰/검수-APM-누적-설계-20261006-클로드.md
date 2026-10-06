설계 문서와 실제 코드 대조를 마쳤고, 아래가 검토 결과입니다.

## 결론

**blocking은 없습니다.** root 보정 두 건을 반영하면 세 가지 수치 오류는 설계상 닫히고, 영수증·rollback·commit 원자성 회귀도 찾지 못했습니다. 다만 구현 전에 설계 문구로 확정해야 할 보완이 5건 있습니다(1~3은 필수). 문서 §4.2는 아직 `0 <= age`와 "새 epoch → 전체 수용"으로 남아 있어 보정 미반영 상태입니다.

## (1) 수치 오류

- **200/201 충돌:** 닫힙니다. 원시 key로 따로 차분한 뒤 같은 PK에서 `Accumulator.add`가 합산하므로 12가 됩니다(`ApmMetric1mStore.java:775`).
- **역순 도착:** 닫힙니다. t0→t2→t1→t3은 skip, +20, OUT_OF_ORDER, +10으로 30입니다.
- **bounds 변경:** 닫힙니다. 해당 구간의 count/sum까지 버리는 선택은 타당합니다. 벡터만 NULL로 보내면 store가 기존 벡터를 유지해 "히스토그램 일부, 스칼라 전체" 행이 되기 때문입니다(`ApmMetric1mStore.java:788`, UPSERT `:176-183`).

## 구현 전 보완 (중요도순)

1. **[필수] 배치 내 self-sweep으로 permit 이중 반환.**
   - `delta()`는 배치 안에서 `maybeSweep`을 호출하고(`CumulativeDeltaTracker.java:194`), sweep의 `tryLock`은 자기 스레드가 쥔 stripe에서 재진입 성공합니다(`:274`).
   - 그래서 이미 pending에 올린 key의 만료된 committed 항목을 같은 배치가 지우고 permit을 반환합니다. commit 때 §6.2의 "old committed 반환"이 한 번 더 일어나고 `putAll`(`:119`)이 key를 되살립니다.
   - 결과는 series 1개와 셀 N개의 과소 계상이며, 발생할 때마다 누적됩니다.
   - 보완: sweep이 현재 pending key를 건너뛰거나 배치 진입 전에만 돌게 하고, 반환량은 실제 `put`/`remove` 결과로 계산합니다.

2. **[필수] 셀 예산 포화 시 기존 계열 갱신까지 막힘.**
   - §6.2는 기존 key의 교체 snapshot도 committed와 같은 풀에서 추가 예약합니다. 신규 계열이 여유를 N 미만으로 줄이면 건강한 기존 histogram 계열이 전부 STATE_LIMIT이 됩니다.
   - 보류된 포인트는 TTL을 갱신하지 않으므로 30분 뒤 만료되고, 이어서 FIRST_SKIPPED로 그 구간이 유실됩니다.
   - 한도가 전역 하나뿐이고 LRU도 없어서, 한 서비스의 원시 고카디널리티가 전 테넌트의 신규 계열을 막습니다. 예: route 폴백으로 쓰이는 `http.target`(`ApmMetricAllowlist.java:215`). 재기동한 프로세스는 instanceId가 바뀌면 전부 신규 key입니다.
   - 현행 key는 route 상한 등으로 정규화된 dims라 이 경로가 훨씬 좁습니다. 2단계가 새로 여는 위험입니다.
   - 보완: 교체 snapshot은 별도 in-flight 풀로 분리하거나 면제하고(본문 크기 상한으로 이미 유한), 서비스별 하위 상한을 둡니다.

3. **[필수] 미래 시각 checkpoint 한 점이 계열을 30분 막음.**
   - reader와 ingestor는 2030년 포인트를 그대로 받습니다(재현 문서 §7). 그 점이 기준이 되면 이후 정상 포인트는 전부 OUT_OF_ORDER이고 TTL도 갱신되지 않습니다.
   - TTL 만료 후 FIRST_SKIPPED까지 약 30분과 한 주기가 유실됩니다. 현행 코드에서는 유실이 없으므로 회귀입니다.
   - 재시작 때 startTime이 뒤로 간 경우(§4.2 "이전 epoch" 행)도 같은 고착입니다.
   - 보완: tracker의 `clock`으로 `time > now + 허용치`인 포인트는 기준으로 채택하지 않고(INVALID_POINT), "연속 거절 → TTL 만료 → 재기준"을 명시된 복구 경로로 두고 시험합니다.

4. **[중간] resource 전체 속성을 identity에 넣으면 생기는 새 중복 계상 경로.**
   - 현행 key는 resource 속성을 보지 않습니다(`CumulativeDeltaTracker.java:107`). §3.1대로면 수명 중 resource 속성이 바뀔 때(예: Collector enrichment 지연) 새 key가 됩니다.
   - 그 시점이 `0<age<120초`이면 누적 전체가 다시 더해지고, 이후면 FIRST_SKIPPED 한 번입니다. 실제 발생 빈도는 확인하지 못했습니다.
   - 보완: resource 재료를 프로세스 식별 키로 좁히거나, 최소한 이 경우의 기대 동작을 시험으로 고정합니다.

5. **[중간] typed hash의 표기 정규화가 빠져 있음.**
   - int64는 문자열과 숫자 양쪽으로 옵니다(`OtlpMetricsReader.java:368`). JsonNode 원문을 그대로 해시하면 `intValue:"200"`과 `200`이 다른 계열이 됩니다.
   - reader가 버리는 값 없는 속성과 arrayValue/kvlist(`OtlpJson.java:80-90`)를 identity에서 어떻게 다룰지도 정해야 합니다.

## 낮음

- **불변식 검사 범위:** `count == Σbuckets` 검사는 CUMULATIVE 한정임을 명시해야 합니다. DELTA는 `:188`에서 먼저 반환되므로, 검사 위치에 따라 §1의 "DELTA 불변"이 깨집니다. exponential은 negative 버킷을 버려(`OtlpMetricsReader.java:300`) 그런 계열이 영구 INVALID가 됩니다.
- **정렬은 복사본에서:** `safePoints`는 이후 `recordCollectorState`(`MetricIngestor.java:149`)와 K8s observer(`MetricIngestPipeline.java:69`)가 다시 씁니다.
- **한계 명시:** 프로세스 중간에 처음 생긴 원시 계열(예: 첫 201)은 age가 120초를 넘으면 첫 값이 FIRST_SKIPPED입니다. "기대 12"는 이미 기준이 잡힌 계열에만 성립하므로 §10에 적어야 합니다.

## (4) 원자성

회귀는 없습니다. 근거는 다음과 같습니다.

- 영수증 패자는 supplier를 호출하지 않으므로 예약이 생기지 않습니다(`ApmMetricBatchWriter.java:36`).
- checkpoint 공개는 `operation.get()` 반환 뒤입니다(`CumulativeDeltaTracker.java:117-119`).
- 새 폐기 사유도 기존 recorder의 afterCommit 경로를 탑니다(`ApmIngestDropStatRecorder.java:137,155`).

구현에서 지켜야 할 조건은 두 가지입니다.

- permit 반환은 `finally`에서 합니다.
- `stripe()`는 `(serviceId, instanceId)`만 써야 합니다. `locked`가 `("", "")` key로 선점하고(`MetricIngestor.java:138-142`) `delta`가 다시 잠그므로(`:196`), hash가 섞이면 배치 안에서 순서 없는 잠금이 생겨 교착됩니다.

## (5) 누락된 최소 시험

- `startTime==time`: 최초 관측과 새 epoch 모두 기여 0에 기준만 저장, 다음 점은 정상 차분. age 0/119/120 경계.
- 배치 중 sweep이 pending key를 만났을 때 commit/rollback 후 permit 합계가 실제 map과 일치.
- 셀 포화 상태에서 기존 계열 갱신 동작, 한 서비스의 포화가 다른 서비스 신규 계열을 막지 않음.
- 미래 시각 checkpoint와 startTime 역행 후 복구.
- `intValue` 문자열/숫자가 같은 hash, 값 없는 속성·array·중복 key.
- 수명 중 resource 속성 변경 시 전체 재가산 없음.
- hash만 다른 key가 같은 stripe로 가고, `delta`가 선점하지 않은 stripe를 잡지 않음.
- 영수증 패자 후 permit/pending 불변.
- 정렬 후 입력 리스트 불변.
- DELTA histogram 통과 동작 불변.
- STATE_LIMIT 해소 후 신규(120초 미만) 계열은 전체를 정확히 한 번만 수용, 기존 계열은 증분 회복.