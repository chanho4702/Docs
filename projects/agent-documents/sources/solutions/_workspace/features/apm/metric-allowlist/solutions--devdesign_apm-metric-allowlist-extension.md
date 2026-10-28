# 설계 — APM 메트릭 허용목록 확장 수단 (ZM-155)

- 작성일: 2026-09-16 · 상태: **초안(설계 선행, 사용자 결정 대기)** · 구현: 0
- 근거: `planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` §I5 · `features/apm/backlog/backlog_apm-comprehension-and-ai.md` §1-4
- 관련: `devdesign_apm.md` §4.3(허용목록)·§4.4(용량 R3) · `devdesign_apm-cold-archive.md`(ZM-156, 보존·아카이브)
- 표기: 🔴 = 어기면 데이터가 **조용히** 틀리는 규칙 · ⚠️ = 알고 있어야 하는 한계 · **[코드]** = 코드에서 확인한 사실 · **[제안]** = 이 문서의 제안 · **[확인 필요]** = 확인하지 못한 것

---

## 0. 한 줄 요약

고객이 보낸 커스텀 지표는 지금 **전량 `NOT_ALLOWLISTED`로 폐기**되고, 그걸 여는 방법은 **우리 코드 수정 + 재배포**뿐이다.
이 설계는 **"잠금은 유지하되, 관리자가 화면에서 여는 정식 절차"**를 만든다. 여는 순간 **카디널리티 상한이 같이 걸리지 않으면 BE 게이트를 둔 이유가 사라지므로**, 상한이 이 기능의 본체다.

---

## 1. 현재 구조

### 1.1 관문 두 개 — 지표가 화면에 오려면 둘 다 통과해야 한다

| 관문 | 위치 | 누가 고치나 | 현재 확장 수단 |
|---|---|---|---|
| Collector `filter/metrics` | 고객 서버 yaml (`resources/apm/collector-template.yaml` 63행) | 고객 | **[코드]** 있다 — 수집기 설정 생성 화면의 프로세서 옵션 `extra`(정규식 추가, `ApmCollectorConfigGenerator` 403행) |
| BE `ApmMetricAllowlist` | 자바 상수 표 (`TABLE`, `buildTable()`) | 개발자 | **없다** — 코드 수정 + 재배포 |

⚠️ **[코드]** Collector 기본 include는 접두 8종(`http.server.*`·`http.client.*`·`rpc.*`·`jvm.*`·`k8s.*`·`db.client.*`·`process.*`·`messaging.*`)이다. 고객 커스텀 지표(`app.orders.created` 같은 이름)는 **Collector에서 먼저 걸러져** 폐기 통계에도 안 잡힌다. 사용자가 수집기 화면에서 `extra`를 넣어야 비로소 BE까지 오고, 그때 BE에서 `NOT_ALLOWLISTED`가 된다 — 즉 **한쪽 문은 이미 열 수 있는데 다른 쪽 문이 잠겨 있는 상태**다(09-16 설치 가이드 누락 1-2와 같은 모양).

### 1.2 판정 위치 — `MetricIngestor.toRow` ③단계 [코드]

```
리더 산출(OtlpMetricPoint)
  → ① 수집기/애플리케이션 분리
  → ② 서비스 귀속 (ApmServiceResolver)
  → ③ 허용목록     ApmMetricAllowlist.find(point.metric())  ← 여기
        비면: count(NOT_ALLOWLISTED) + dropStats.record(tokenId, NOT_ALLOWLISTED, 원문 이름) → return
  → ④ 차원 정규화  ApmDimsNormalizer.normalize(serviceId, spec, attributes) → dims_hash
  → ⑤ CUMULATIVE 차분 (CumulativeDeltaTracker, 키 = service·instance·metric·dims_hash)
  → ⑥ 적재        ApmMetric1mStore
```

- `find()`는 **정적 메서드 + 불변 Map 조회**다. 상태·의존이 없어서 `service.runtime`·`service.red`·`trace.rollup`·`ApmMetric1mStore`(경계 패밀리 라벨) 등 **11개 파일**이 이 클래스를 직접 읽는다.
- 허용목록 밖은 **예외 없이 조용히 `Optional.empty()`**다(정상 트래픽에서 가장 흔한 일이라 던지면 배치가 죽는다).
- 수집기 자기 메트릭(`^otelcol[._]`)만 표에 없어도 통과하고, 대신 `allAttributes=true` + 차원 키 **최대 12개**(`COLLECTOR_MAX_DIMS`)로 자른다.

### 1.3 규칙 한 줄(`Spec`)이 정하는 것 [코드]

| 필드 | 뜻 | 커스텀 지표에서의 의미 |
|---|---|---|
| `metric` | 저장 이름(구 규약 별칭이면 신 이름) | 고객 입력. 🔴 `apm_metric_1m.metric`이 `varchar(128)` — 넘으면 **배치 적재 실패** |
| `dimKeys` | **살릴 차원 키**(정렬·중복 제거된 불변 목록) | 🔴 이 설계의 가장 어려운 입력(§5) |
| `allAttributes` | 수신 속성 전부를 차원으로(수집기 전용) | 커스텀에는 **금지**(§4) |
| `boundsFamily` | 히스토그램 정규 경계 패밀리 | 커스텀 히스토그램은 `observed`/`observed_ms`(수신 경계 그대로) |
| `slot` | 어느 화면을 먹이나 | 커스텀 전용 슬롯 필요(§3.3) |

### 1.4 차원 목록이 메트릭마다 다른 이유 [코드 주석 요약]

- 1행의 비용은 **차원 조합 수에 곱해진다.** `http.server.request.duration`에 실측 속성 5개가 오지만 화면이 쪼개 보는 3개(method·route·status_class)만 담는다. 원칙은 **"오는 것을 다 담는다"가 아니라 "화면이 쪼개 보는 축만 담는다"**.
- 🔴 **없는 키는 빼지 않고 빈 문자열로 채운다** — 키 유무가 배치마다 달라도 `dims_hash`가 한 벌로 유지된다.
- 값은 trim → NFC → **256자 절단**. 소문자화는 안 한다.

### 1.5 파생 차원 2개 — "원문을 그대로 쓰면 카디널리티가 터진다" [코드]

| 파생 키 | 원천 | 접는 법 | 왜 |
|---|---|---|---|
| `status_class` | `http.response.status_code`(구: `http.status_code`) | `2xx` 꼴, 100~599 밖은 `''` | 화면이 묻는 건 "실패인가"지 "418인가"가 아니다 |
| `db.operation` | `db.query.summary`의 **첫 토큰** 대문자(없으면 `db.operation.name`) | `SELECT` 등 | 🔴 summary에 **테이블명까지** 들어 있어 route보다 카디널리티가 크다 |

### 1.6 이미 있는 카디널리티 방어 — route 상한 [코드]

`ApmDimsNormalizer`가 **`http.route` 하나에만** 서비스당 상한(`apm_setting.route_limit`, 기본 500)을 건다.

- 초과분은 `__other__`로 접고 `ROUTE_OVERFLOW`로 센다(값은 저장됨 — 손실 아님).
- 🔴 **상한에 닿으면 새 값을 받지 않는다 — LRU로 밀어내지 않는다.** 밀어내면 시간이 지나며 시계열이 무제한이 된다.
- 재기동 직후 상한이 리셋되지 않게 **서비스별 첫 조회 때 1m 최근 1일의 distinct route를 워밍**한다(JDBC 1쿼리).
- 설정 변경은 `MetricIngestPipeline`이 매 배치 `settingService.routeLimit()`를 읽어 volatile로 반영(다른 노드는 설정 캐시 TTL 30초).

→ **이 장치가 커스텀 차원 상한의 선례이자 재사용 대상이다**(§4).

### 1.7 저장 — `apm_metric_1m` (V38) [코드]

```
PK (service_id, instance_id, metric, dims_hash, bucket_start) · PARTITION BY RANGE(bucket_start) 일 단위
dims jsonb · count · sum · min · max · hist_counts int[] · bounds_id · exemplar_trace_id
보조 인덱스 (service_id, metric, bucket_start)
5m/1h: instance_id 없음(서비스 합산), 같은 모양
```

- 🔴 **인스턴스 축은 1m에만 있다** → 1m 시계열 수 = 인스턴스 수 × 차원 조합 수.
- **R3 실측(`devdesign_apm.md` §4.4)**: 14.04M행/일, **행당 686B**(힙 393 + 인덱스 293), 1m 7일 ≈ **67 GB**, PK 하나가 전체의 41%.
- 롤업(`ApmRollupService`)은 **메트릭 이름과 무관하게** `group by service_id, metric, dims_hash`로 전부 접는다 [코드 447행]. 보존·파티션도 테이블 단위다. → **1m에 들어온 커스텀 행은 추가 코드 없이 5m/1h·보존·(ZM-156) 아카이브를 자동으로 탄다.**

### 1.8 폐기 통계 — `apm_ingest_drop_stat` [코드]

- 자연키 `(token_id, reason, metric_name, signal)` — **한 행에 누적 카운트**, 시간축 없음(`last_seen_at`만).
- `NOT_ALLOWLISTED`는 **이름과 건수만** 남긴다. 🔴 **속성 키·타입·단위·값 분포는 남지 않는다** → 지금 데이터만으로는 "어떤 차원으로 쪼갤지" 고르는 화면을 만들 수 없다(§5.2).
- `reason`은 `varchar(32)` — 새 사유 이름이 32자를 넘으면 적재 실패.
- 보존 30일(`apm_retention`의 `dropStatDays`).

### 1.9 🔴 왜 BE가 최종 게이트인가 (이 설계가 지켜야 할 전제)

1. **Collector 필터는 고객 소유다.** 고객은 yaml에서 `filter/metrics`를 지우거나 파이프라인을 하나 더 붙일 수 있다. 그 순간 아무 이름이나 우리 DB로 온다.
2. **카디널리티가 터지는 곳은 우리 테이블이다.** 1m은 일 1,400만 행 설계이고 PK 인덱스가 용량의 41%다. 시계열이 10배가 되면 인덱스·롤업·조회가 같이 10배가 된다.
3. **메모리도 같이 터진다** — **[코드]** `CumulativeDeltaTracker.lastByKey`는 시리즈마다 한 항목을 들고, **개수 상한 없이 TTL 30분 청소만** 있다. 시계열 폭발은 디스크보다 먼저 JVM 힙에서 드러날 수 있다.
4. **그래서 "여는 수단"도 BE에 있어야 한다.** Collector에서만 여는 방식은 1번 때문에 방어가 아니다.

---

## 2. 무엇이 문제인가 (정리)

| # | 문제 | 결과 |
|---|---|---|
| P1 | 확장 수단이 코드뿐 | 고객 커스텀 지표는 우리 배포 전까지 **전량 폐기** |
| P2 | 폐기 통계 화면이 "확장 근거 창구"라고 말하면서 행동 수단이 없음 | 사용자가 할 수 있는 일이 없다 |
| P3 | 폐기 통계가 이름·건수만 기록 | 열어 주려 해도 **차원 선택의 근거**가 없다 |
| P4 | **[코드]** 임의 메트릭을 그리는 조회 EP가 없다(컨트롤러에 metric 파라미터를 받는 곳은 exemplar 1곳뿐) | 🔴 허용목록만 열면 **"저장은 되는데 화면에 안 뜨는"** 지표가 쌓인다 — `RuntimeSlotMap` 주석이 이미 경고한 상태 |

⚠️ P4 때문에 **허용목록 확장 = 저장 + 조회 화면 한 쌍**이다. 조회 화면 없이 저장만 열면 고객은 "켰는데 안 보인다"를 겪는다.

---

## 3. 방향 2안 비교

### 3.1 안 ① — 같은 테이블에 저장, 설정에서 규칙 추가 + 카디널리티 상한

```
apm_custom_metric_rule (신규)  ──▶ 수신 ③단계: 정적 표에 없으면 커스텀 규칙 스냅샷 조회
                                    ──▶ ④ 정규화 + 커스텀 시리즈 상한 (§4)
                                    ──▶ apm_metric_1m (기존)  → 롤업·보존·아카이브 자동
```

### 3.2 안 ② — 커스텀 지표 전용 저장 경로 분리

```
apm_custom_metric_rule (신규) ──▶ 수신 ③단계 분기 ──▶ apm_custom_metric_1m/5m/1h (신규 3테이블)
                                                    → 롤업 단계 추가 · 보존 단계 추가 · 파티션 목록 추가
```

### 3.3 비교

| 관점 | ① 같은 테이블 + 상한 | ② 전용 테이블 |
|---|---|---|
| **폭발 반경** | ⚠️ 상한이 뚫리면 **핵심 RED 테이블과 같은 파티션·같은 PK 인덱스**가 커진다 | ✅ 커스텀만 커진다. 핵심 화면 조회 플랜에 영향 없음 |
| **상한 필요성** | 🔴 필수 | 🔴 **여전히 필수** — 격리는 "우리 화면을 지킨다"일 뿐 디스크·힙은 같은 서버다 |
| 테이블 영향 | 0 (규칙 테이블 1개만 추가) | 규칙 1 + 파티션 테이블 **3** |
| 롤업 | **[코드]** 이름 무관 SQL이라 **추가 0** | `ApmRollupService`에 단계 2개 추가 + 워터마크 키 2개(`apm_setting`) |
| 보존 | 기존 `raw1mDays`·`rollup5mDays`·`rollup1hDays`를 그대로 탐 | `ApmRetentionJob`에 단계 추가 🔴 **빠뜨리면 그 테이블만 영원히 자란다**(`ApmPartitionService` 주석이 경고하는 함정) |
| 파티션 선생성 | 0 | `PARTITIONED_TABLES`에 3개 추가 |
| ZM-156 아카이브 | 기존 대상(`metric1m` 등)에 **자동 포함** | 대상 키 3개 추가 |
| 조회 경로 | 기존 `ApmMetricStore`의 `service_id, metric, bucket_start` 인덱스를 그대로 쓴다. 커스텀용 **읽기 메서드만 추가** | 전용 스토어·쿼리 전부 신규 |
| 보존 기간을 따로 두기 | ❌ 불가(테이블 단위) | ✅ 가능(커스텀은 짧게 등) |
| 용량 계측 | 커스텀 몫을 따로 보려면 `metric` 필터 집계 필요 | 테이블 크기가 곧 커스텀 몫 |
| 정규화·차분·경계 로직 | 기존 경로 그대로 | 기존 경로 그대로(저장 대상만 다름) |
| 구현 공수(추정) | 작음 | 중간~큼 |

### 3.4 권고 — **① 채택, 단 ②의 격리 이점을 "예산"으로 흉내 낸다** [제안]

**이유**
1. ②의 격리는 **디스크·힙을 격리하지 못한다**(같은 PG·같은 JVM). 진짜 방어는 어느 안이든 §4의 상한이고, 상한이 제대로면 ①의 폭발 반경은 "예산 이내"로 묶인다.
2. ②는 롤업·보존·파티션·아카이브 **네 군데에 같은 수정을 반복**하고, 그중 하나라도 빠뜨리면 조용히 영원히 자라는 테이블이 생긴다(레포에 이미 같은 경고가 세 번 적혀 있다).
3. 커스텀 몫은 **총 시계열 예산**(§4.2 L5)으로 전역 상한을 두면 "핵심 테이블의 몇 %까지만"을 숫자로 약속할 수 있다.

**②로 돌아갈 조건**: 커스텀 보존을 핵심과 **다르게** 가져가야 한다는 요구가 확정되면(§8 Q3). 그때는 테이블을 나누는 것 말고 방법이 없다.

---

## 4. 🔴 카디널리티 상한 — 이 설계의 본체

### 4.1 원칙

- 🔴 **상한 없이 여는 경로를 만들지 않는다.** 규칙 저장 API가 상한 값을 받지 못하면 저장을 거부한다(기본값은 서버가 채운다).
- 🔴 **route 상한의 두 규칙을 그대로 승계한다**: ① 상한에 닿으면 **새 조합을 받지 않는다**(LRU 금지) ② 재기동 시 **DB에서 워밍**해 상한이 리셋되지 않게 한다.
- 🔴 **초과분은 값을 버리지 않고 접는다**(route와 같은 태도). "값은 있는데 축 하나가 뭉쳤다"가 "값이 사라졌다"보다 정직하다.
- **등록 시점 검사(정적)**와 **수신 시점 검사(동적)** 두 겹으로 둔다. 정적 검사만으로는 값의 개수를 알 수 없고, 동적 검사만으로는 위험한 키가 들어온 뒤에야 막는다.

### 4.2 상한 목록 [제안 — 기본값은 초안]

| # | 상한 | 기본값 | 걸리는 시점 | 초과 시 | 근거 |
|---|---|---|---|---|---|
| L1 | 커스텀 규칙 수(전역) | **20** | 등록 | **거부**(400) | 규칙 하나가 시계열 예산을 나눠 쓴다 |
| L2 | 규칙당 차원 키 수 | **3** | 등록 | **거부** | 내장 규칙 최대가 3개(`http.server.request.duration`·`db.client.operation.duration`)다. 그보다 많이 쪼개는 화면이 없다 |
| L3 | 금지 차원 키(denylist) | 아래 표 | 등록 | **거부** | 값이 요청마다 다른 키는 상한 이전에 막는다 |
| L4 | 규칙당·서비스당 **차원 조합 수**(= distinct `dims_hash`) | **50** | 수신 | **접기**(모든 차원 값을 `__other__`로) + 새 사유 카운트 | route 500은 "엔드포인트 표"라는 화면 근거가 있지만 커스텀은 그런 근거가 없어 보수적으로 |
| L5 | **서비스당 커스텀 시계열 총량**(규칙 전체 합, 인스턴스 축 제외) | **200** | 수신 | 접기 | 전역 예산 — ①의 폭발 반경을 숫자로 묶는 장치(§3.4) |
| L6 | 이름 길이 | **128** | 등록 | 거부 | 🔴 **[코드]** `metric varchar(128)` — 넘으면 **배치 전체 적재 실패** |
| L7 | 값 길이 | 256(기존) | 수신 | 절단 | `ApmDimsNormalizer.MAX_VALUE_LENGTH` 재사용 |
| L8 | 폭주 자동 정지 | 접힘 비율 > **50%** 가 **1시간** 지속 | 수신 집계 | 규칙 `SUSPENDED` + 경고 | 접힌 값만 쌓이는 규칙은 쓸모가 없고 디스크만 먹는다 |

**L3 금지 키 초안** — 요청·사용자·시각마다 달라지는 것들:

| 분류 | 키 예 |
|---|---|
| 원시 경로·URL | `url.full`·`url.path`·`url.query`·`http.target`·`http.url` |
| 식별자 | `trace_id`·`span_id`·`user.id`·`session.id`·`enduser.id`·`*.id`로 끝나는 키 전반(⚠️ 규칙으로 할지 목록으로 할지 결정 필요) |
| 주소 | `client.address`·`net.peer.ip`·`network.peer.address`·`user_agent.original` |
| 원문 | `db.query.text`·`db.statement`·`exception.message`·`exception.stacktrace` |
| 이미 파생이 있는 원문 | `http.response.status_code`(→ `status_class` 제시)·`db.query.summary`(→ `db.operation` 제시) |

⚠️ denylist는 완전할 수 없다. **L4·L5가 진짜 방어**이고 L3은 "뻔한 실수를 등록 단계에서 막는" 보조다.

### 4.3 초과 시 동작 — 세 가지 중 무엇을 고르나

| 동작 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 거부(값 폐기) | 단순. 저장량이 정확히 상한 | 🔴 **합계가 틀린다** — 초과 조합의 요청이 통째로 빠져 "총 주문 수"가 실제보다 작다. 사용자는 모른다 | ❌ |
| 상위 N만 유지(동적 교체) | 중요한 값이 남는다 | 🔴 LRU와 같은 문제 — **시간이 지나면 무제한**, 교체 순간 그래프가 끊긴다. "상위"를 알려면 집계 상태를 따로 들어야 한다 | ❌ |
| **기타로 접기** | **합계가 보존된다.** route에서 이미 검증된 방식. 접힌 사실을 셀 수 있다 | 먼저 온 50개가 자리를 차지한다(중요도와 무관) | ✅ **채택** |

**접는 방식** [제안]: 초과 포인트는 **선언된 모든 차원 값을 `__other__`**로 바꾼다(키는 유지 → canonical JSON 모양 불변). `__other__` 조합 자체는 상한을 소비하지 않는다(route 규칙과 같음).

- ⚠️ "먼저 온 것이 이긴다"의 보완: 화면에서 규칙별 **"접힘 비율"**과 **"받아 준 값 목록"**을 보여 주고, 관리자가 **"받아 준 값 초기화"**(워밍 집합 리셋)를 누를 수 있게 한다. 자동 교체는 하지 않는다.
- 🔴 상한을 **낮춰도 소급 폐기하지 않는다**(route와 같음) — 이미 저장된 시계열을 갑자기 접으면 그래프가 끊긴다.

### 4.4 새 폐기 사유 [제안]

| 이름(≤32자) | 뜻 | 손실인가 |
|---|---|---|
| `CUSTOM_SERIES_OVERFLOW` (22자) | L4/L5 초과로 차원을 `__other__`로 접었다 | 아니다(저장됨) — `ROUTE_OVERFLOW`와 같은 부류. `metric_name`에 `<metric>@svc:<id>` 접미(`ApmDropMetricKey`) 규약도 승계 |
| `CUSTOM_RULE_SUSPENDED` (21자) | 규칙이 L8로 정지돼 폐기 | 손실 |

🔴 **[코드]** `ApmDropReason`은 **추가는 자유, 개명은 마이그레이션 사안**이다. `IngestStats.lostPoints()`에 넣을지 여부를 사유마다 구분해야 한다(`ROUTE_OVERFLOW`가 넣지 않는 것과 같은 이유).

### 4.5 수신 경로 성능 [제안]

- 🔴 `ApmMetricAllowlist.find()`는 **정적**이고 11개 파일이 쓴다. 이걸 빈으로 바꾸면 조회·등록 쪽까지 흔들린다 → **정적 표는 그대로 두고**, `MetricIngestor` ③단계에서 **정적 표 → 없으면 커스텀 규칙 스냅샷** 순으로 본다.
- 커스텀 규칙 스냅샷 = `volatile Map<String, Spec>`. 규칙 저장 시 이 인스턴스는 즉시 교체, 다른 노드는 `route_limit`과 같은 경로(설정 캐시 TTL 30초)로 따라온다.
- 🔴 **내장 이름과 충돌하는 커스텀 규칙은 등록 거부**(정적 표·별칭 표·`^otelcol[._]` 모두). 순서를 "정적 먼저"로 둔 것과 이중 방어다 — 충돌을 허용하면 내장 화면이 읽는 시계열의 차원이 바뀌어 **내장 화면이 조용히 틀린다**.
- 조합 상한 집합은 `RouteSet`과 같은 구조(서비스·규칙별 `LinkedHashSet<dims_hash>`, 바깥 맵 LRU 512)로 두고, 워밍은 `select distinct dims_hash from apm_metric_1m where service_id=? and metric=? and bucket_start >= now()-1d limit ?`.

### 4.6 용량 예산 산식 (화면이 보여 줄 값)

```
1m 행/일(최대) = 서비스 수 × 인스턴스 수 × min(Π 차원별 distinct, L4) × 1,440
디스크/일(추정) = 행/일 × 686B        (R3 실측 행당 비용, PG 18 기본 설정)
```

예) 서비스 10 × 인스턴스 3 × 조합 50 × 1,440 = **216만 행/일 ≈ 1.4 GB/일** → 1m 7일 ≈ 10 GB.
⚠️ 이 값은 **R3 스키마·인덱스 밀도 기준의 추정**이다. 커스텀 지표 실측은 없다.

→ L5(서비스당 200)를 기본으로 두면 최악이 서비스 10 × 인스턴스 3 × 200 × 1,440 = **864만 행/일 ≈ 5.9 GB/일**로, 핵심 설계(1,400만 행/일)의 약 60%다. **이 숫자가 너무 크다고 판단되면 L5를 낮추는 것이 결정 사항이다**(§8 Q2).

---

## 5. 🔴 차원 목록까지 고객이 정해야 하는 UX — 가장 어려운 지점

### 5.1 무엇이 어렵나

허용목록 한 줄은 **"이 지표를 저장한다"**가 아니라 **"이 지표를 이 기준들로 나눠 저장한다"**다. 고객에게는 두 질문이 섞여 들린다.

1. 이 지표를 **볼 것인가** (쉽다)
2. 어떤 **기준으로 나눠** 볼 것인가 (어렵다) — 잘못 고르면 폭발하고, 너무 적게 고르면 나중에 못 쪼갠다. 🔴 **그리고 나중에 바꾸면 `dims_hash`가 달라져 그 시점에 그래프가 끊긴다.**

게다가 **[코드]** 지금 폐기 통계에는 **어떤 속성이 오는지 기록이 없다**(§1.8). 고객은 자기 계측 코드를 열어 보지 않는 한 선택지를 모른다.

### 5.2 선행 조건 — "후보 관측" 기록 [제안]

`NOT_ALLOWLISTED`로 버리는 순간 **이름만 세지 말고 모양도 조금 적는다.**

```sql
-- 번호는 착수 시 배정(현재 V59까지 사용 — 확인됨)
CREATE TABLE apm_metric_candidate (
    metric_name   varchar(128) PRIMARY KEY,   -- 128 초과 이름은 기록하지 않고 "이름이 너무 김"으로만 센다
    kind          varchar(16)  NOT NULL,      -- GAUGE | SUM | HISTOGRAM | EXP_HISTOGRAM
    temporality   varchar(16),                -- DELTA | CUMULATIVE
    unit          varchar(32),
    attr_profile  jsonb        NOT NULL,      -- {"order.status":{"distinct":7,"capped":false,"samples":["PAID","NEW"]}, ...}
    service_count integer      NOT NULL,
    first_seen_at timestamp    NOT NULL,
    last_seen_at  timestamp    NOT NULL
);
```

| 방어 | 값 | 이유 |
|---|---|---|
| 후보 수 상한 | 200 | 폐기 이름이 무한이면 이 표가 새 폭발원이 된다 |
| 키 수 상한 | 20개/지표 | |
| distinct 추적 상한 | 키당 100(넘으면 `capped:true` = "100개 이상") | 정확한 수가 아니라 **"위험한가"**만 알면 된다 |
| 표본 값 | 키당 5개, 64자 절단 | 🔴 속성 값에 개인정보가 있을 수 있다 → **표본 저장 자체를 끌 수 있는 스위치** 필요(§8 Q6) |
| 기록 빈도 | 이름당 **1분에 1회** 반영(메모리 누적 후 플러시) | 수신 경로 비용 억제 |
| 보존 | `dropStatDays`(30일)와 같이 | |

⚠️ distinct는 **관측 창 안의 값**이다. 트래픽이 적은 시간에 관측하면 실제보다 작게 보인다 → 화면 문구에 "최근 N시간 관측 기준"을 명시.

### 5.3 화면 흐름 [제안] — "수집기 › 받았지만 저장하지 않은 지표"에서 시작

**진입점**: 폐기 통계 표의 `NOT_ALLOWLISTED` 행마다 **[저장하도록 설정]** 버튼(권한 `apm.edit`일 때만). → P2(창구는 있는데 수단이 없음)가 여기서 닫힌다.

**1단계 — 이 지표가 무엇인가 (확인만)**
- 이름 · 종류(게이지/누적 카운터/분포) · 단위 · 보내는 서비스 수 · 최근 관측
- 분포(히스토그램)면 ⚠️ "경계가 서비스마다 다르면 백분위를 합칠 수 없다" 안내(§6.2)

**2단계 — 어떻게 나눠 볼까요 (핵심)**

질문 문구를 기술 용어가 아니라 **결과**로 쓴다:

> **"이 지표를 무엇별로 나눠 보시겠습니까?"**
> 아무것도 고르지 않으면 **서비스별 합계**(인스턴스별 7일)로만 저장합니다. 가장 안전합니다.

| 선택 | 속성 이름 | 관측된 값 종류 | 예시 값 | 판정 |
|---|---|---|---|---|
| ☐ | `order.status` | 7 | PAID, NEW, … | 🟢 안전 |
| ☐ | `payment.method` | 4 | CARD, BANK | 🟢 안전 |
| ☐ | `region` | 23 | ap-northeast-2, … | 🟡 주의 |
| 🚫 | `user.id` | 100+ | — | 🔴 선택 불가(요청마다 다름) |
| 🚫 | `http.response.status_code` | 12 | 200, 404 | 🔴 원문 대신 **"상태 구분(2xx…)"** 선택지 제시 |

- **기본값은 전부 해제.** 🔴 "오는 것 다 담기" 버튼은 **만들지 않는다**(수집기 자기 메트릭의 `allAttributes`를 고객에게 열지 않는 이유).
- 판정 색: 🟢 distinct ≤ 10 · 🟡 11~50 · 🔴 L3 금지 키 또는 `capped`(100+). 🔴은 체크박스 비활성 + 이유 툴팁.
- **예상 시계열 수를 실시간 계산**해 선택 아래에 한 줄로 보여 준다(§4.6 산식):
  > "선택한 기준으로 나누면 서비스당 최대 **28개** 선(상한 50) · 하루 약 **12만 행**(추정)"
  상한을 넘는 조합이면 문구가 빨간색으로 바뀌고 "초과분은 '기타'로 묶입니다"를 말한다. **저장을 막지는 않는다**(L4가 받아 준다) — 단, 곱이 상한의 **3배**를 넘으면 저장 버튼을 막고 "기준을 하나 줄여 주세요".
- 키가 3개(L2)를 넘으면 체크가 안 된다.
- 🔴 **"나중에 바꾸면 그래프가 그 시점에서 끊깁니다"** 경고를 이 단계에 고정 노출한다.

**3단계 — 확인**
- 요약 문장: "`app.orders.created`를 **주문 상태·결제 수단별**로 저장합니다. 서비스당 최대 50개 선, 초과분은 '기타'."
- **어디서 보이나**: "서비스 상세 › 커스텀 지표 탭"(§6.3) 링크 미리보기.
- **수집기 쪽도 열려 있나**: 이 이름이 현재 생성 기본 include(§1.1)에 맞지 않으면 ⚠️ "수집기 설정에 이 이름이 없으면 도착하지 않습니다 — 수집기 설정 다시 받기" 버튼. (이 지표는 폐기 통계에 있으니 **지금은 도착하고 있다** — 다만 고객이 yaml을 재생성하면 사라질 수 있으므로 안내가 필요하다.)

**4단계 — 저장 후**
- 규칙 목록(수집기 탭 하위 "커스텀 지표 규칙")에서 규칙별 **상태(활성/정지)·접힘 비율·받아 준 조합 수/상한·최근 7일 행 수** 표시.

### 5.4 대안 UX와 기각 이유

| 대안 | 기각 이유 |
|---|---|
| 규칙을 yaml/정규식 텍스트로 입력 | 오타가 조용히 0건 저장으로 끝난다. 차원 위험도를 보여 줄 자리가 없다 |
| 이름만 받고 차원은 "없음" 고정 | 가장 안전하지만 커스텀 지표의 가치 대부분(상태별·유형별)이 사라진다. **1차 축소안으로는 유효**(§8 Q1) |
| 차원 자동 추천(distinct 작은 것 자동 체크) | 관측 창이 짧으면 틀린다. 자동으로 켠 것이 나중에 폭발하면 책임 소재가 흐려진다 → **표시만, 체크는 사람** |
| 관측 기록 없이 키를 손으로 입력 | 키 오타 = 차원이 전부 빈 문자열(§1.4 규칙상 에러 없이 성립). 조용히 틀린다 |

### 5.5 차원 변경·삭제 규칙 [제안]

- 🔴 **차원 변경 = 새 시계열.** 규칙을 수정하면 `dims_hash`가 바뀐다. 같은 이름이라 조회는 이어지지만 선이 끊긴다 → 저장 시 확인 모달 + 변경 시각을 규칙 이력에 남기고 차트에 **세로 마커**로 표시.
- **삭제 = 저장 중지.** 이미 저장된 행은 보존 정리가 지운다(소급 삭제 없음). 삭제 후 같은 이름은 다시 `NOT_ALLOWLISTED`로 센다.
- **정지(SUSPENDED)** 는 L8 자동 또는 수동. 해제는 수동만.

---

## 6. 저장·조회 설계 [제안]

### 6.1 규칙 테이블

```sql
CREATE TABLE apm_custom_metric_rule (
    id                bigserial    PRIMARY KEY,
    metric_name       varchar(128) NOT NULL UNIQUE,
    kind              varchar(16)  NOT NULL,              -- GAUGE | SUM | HISTOGRAM
    unit              varchar(32),
    dim_keys          jsonb        NOT NULL DEFAULT '[]', -- 🔴 정렬·중복 제거된 배열(Spec.dimKeys 규약)
    max_series        integer      NOT NULL,              -- L4
    state             varchar(16)  NOT NULL,              -- ACTIVE | SUSPENDED
    suspended_reason  varchar(64),
    created_by        varchar(128) NOT NULL,
    created_at        timestamp    NOT NULL,
    updated_by        varchar(128),
    updated_at        timestamp    NOT NULL
);

-- 변경 이력 — append-only (§7)
CREATE TABLE apm_custom_metric_rule_history (
    id          bigserial    PRIMARY KEY,
    rule_id     bigint       NOT NULL,          -- 🔴 FK 없음: 규칙을 지워도 이력은 남아야 한다
    metric_name varchar(128) NOT NULL,
    action      varchar(16)  NOT NULL,          -- CREATE | UPDATE_DIMS | UPDATE_LIMIT | SUSPEND | RESUME | DELETE
    before      jsonb,
    after       jsonb,
    actor       varchar(128) NOT NULL,
    at          timestamp    NOT NULL
);
```

- 🔴 시각 컬럼 `DEFAULT now()` 금지(V30 교훈), enum은 varchar(레포 규약).
- L5(서비스당 총량)와 L8 임계는 규칙이 아니라 전역 설정 → `apm_setting` 키 추가(`custom_series_per_service`·`custom_suspend_fold_pct`). `route_limit`과 같은 자리·같은 화면.

### 6.2 수신 경로 변경점

| 단계 | 변경 |
|---|---|
| ③ 허용목록 | 정적 → 커스텀 스냅샷 순. 커스텀이면 `Spec(slot="custom", allAttributes=false, boundsFamily=observed|observed_ms|null)` |
| ③ 폐기 | 허용목록 밖이면 기존 카운트 + **후보 관측 누적**(§5.2) |
| ④ 정규화 | 커스텀 규칙이면 조합 상한(L4·L5) 판정 → 접기 |
| ⑤ 차분 | 변경 없음. ⚠️ 시리즈 수가 L5로 묶여 힙 증가도 묶인다 |
| ⑥ 적재 | 변경 없음 |

⚠️ **커스텀 히스토그램**: **[코드]** 정규 경계가 없는 패밀리는 수신 경계 그대로(`observed`) 등록되고, 서비스·SDK마다 경계가 다르면 **롤업에서 `bounds_id`가 갈려** 백분위를 합칠 수 없다. `apm_hist_bounds`에 경계 벡터 행도 늘어난다. → 1차는 **게이지·카운터만** 열고 히스토그램은 "합계·평균·최대만 보장, 백분위는 경계가 같을 때만"으로 문구를 달지, 아예 막을지 결정 필요(§8 Q4).

### 6.3 조회 경로 (P4 해소)

- 새 EP 초안: `GET /apm/services/{id}/custom-metrics` (규칙 목록 + 이 서비스에 데이터가 있는지) · `GET /apm/services/{id}/custom-metrics/{metric}/series?from&to&groupBy=<dimKey>` (해상도는 `ApmResolution` 규칙 그대로).
- 화면: 서비스 상세에 **"커스텀 지표" 탭** — 규칙마다 카드 1장, 차원이 있으면 선택 드롭다운으로 나눠 보기. `__other__`는 "기타"로 표시.
- 🔴 `metric` 경로 변수는 **등록된 커스텀 규칙 이름만** 허용(화이트리스트). 임의 이름 조회를 열면 내장 시계열을 차원 해석 없이 읽는 우회로가 생긴다.
- ⚠️ 홈/APM 위젯 대시보드(ZM-122)에 커스텀 지표 위젯을 넣을지는 범위 밖 — 확인 필요.

---

## 7. 권한 · 감사

| 항목 | 결정(제안) | 이유 |
|---|---|---|
| 규칙 추가·수정·삭제·정지 해제 | **`apm.edit`**(`ApmAccessChecker.requireEdit`) | **[코드]** `route_limit`·수집기 설정·알람 규칙과 같은 축. 역할 체크박스로 위임 가능(09-03 전환) |
| 후보 관측·규칙 목록 조회 | `apm.edit` | 속성 표본 값이 포함된다 — `apm.view`(기본 true)에 열면 일반 사용자에게 표본이 보인다 |
| 커스텀 지표 **차트** 조회 | `apm.view` | 다른 APM 조회 화면과 같음 |
| 표본 값 저장 스위치 | `apm.edit` + WARN 로그 | `keep_raw_sql`과 같은 태도 |

**감사 로그 — 필요하다.** [제안]
- 이유: 규칙 하나가 **저장량(=디스크 비용)**을 바꾸고, 차원 변경은 **시계열을 끊는다**. "언제부터 이 지표가 쌓였고 누가 기준을 바꿨나"에 답하지 못하면 용량 사고를 조사할 수 없다.
- **[코드]** APM에는 **전용 감사 테이블이 없다**(`ApmSettingController` 주석 · V39: `updated_by` 컬럼 + WARN 로그가 전부). 정식 감사 체계(`asset_activity`)는 자산 도메인에 묶여 있고 **ArchUnit A3**가 premium의 app 리포지토리 참조를 막는다.
- 그래서 1차는 **규칙 전용 이력 테이블**(§6.1 `apm_custom_metric_rule_history`) + 변경 시 WARN 로그. ⚠️ APM·아카이브(ZM-156)·I7이 각자 이력 테이블을 만들고 있는 상황이므로 **공통 감사 로그 체계를 먼저 만들지**가 결정 사항이다(§8 Q7).

---

## 8. 미결 질문 (사용자 결정 필요) — ✅ 2026-10-13 전부 결정. 1차 범위 = S2(규칙·API·수신 상한·새 폐기 사유) + S3(폐기 통계에서 "받기"·규칙 목록) + S4(조회 EP·서비스 상세 탭). S1·S5 생략/후속. 🔴 Flyway는 **V81**(다른 세션 브랜치가 V76~V80 점유)

| # | 질문 | 선택지 / 기본 제안 |
|---|---|---|
| **Q1** | 1차 범위에 **차원 선택**까지 넣나 | ✅ **결정 2026-10-13(사용자): (b) 이름만 — 차원 없음 고정.** 합계 시계열 1줄만 저장. 차원 선택·후보 관측(S1·§5.2)은 2차 · 원안: (a) **차원 선택 포함 + 후보 관측** ← 권고 (b) 이름만(차원 없음 고정)으로 먼저 출시 — 공수 절반, UX 위험 0, 가치는 절반 |
| **Q2** | 상한 기본값 | ✅ **결정: L1 규칙 수 20 · L5 서비스당 커스텀 시계열 50(200→50) · L8 접힘 50%/1h 유지.** 차원이 없어 L2·L4는 1차 무의미 · 원안: L1=20 · L2=3 · L4=50 · L5=200 · L8=50%/1h. 🔴 L5 기본으로 최악 **약 5.9 GB/일(추정)** — 줄일지 |
| **Q3** | 저장 위치 | ✅ **결정: ① 같은 테이블(`apm_metric_1m`)** · 원안: ① 같은 테이블 ← 권고. **커스텀 보존을 따로 두어야 하면 ②** |
| **Q4** | 커스텀 히스토그램 | ✅ **결정: (a) 1차 제외**(gauge·sum·counter만) · 원안: (a) 1차 제외 ← 권고 (b) 허용하되 "백분위는 경계가 같을 때만" 문구 |
| **Q5** | 폐기 통계 화면에서 바로 여는 흐름 외에 **이름을 직접 입력**하는 경로도 둘까 | ✅ **결정: 두지 않는다**(폐기 통계의 `NOT_ALLOWLISTED` 행에서만 "받기") · 원안: 관측 전 사전 등록 수요가 있는가. 없으면 두지 않는다(오타 방어) |
| **Q6** | 후보 관측에 **표본 값**을 저장하나 | ✅ **결정: 1차 해당 없음**(차원 없음 → 후보 관측 S1 생략) · 원안: 기본 저장(키당 5개·64자) + 끄는 스위치 ← 권고 / 아예 저장 안 함(distinct 수만) |
| **Q7** | 감사 로그를 **공통 체계**로 먼저 만드나 | ✅ **결정: 공통 체계 선행 안 함 — ZM-154·156과 같이 로그 기반(`[APM-ALLOWLIST]`)** · 원안: ZM-155·ZM-156·I7이 모두 필요로 한다. 공통 체계 선행 ← 권고 / 각자 이력 테이블 |
| **Q8** | 수집기 yaml 쪽 자동 반영 | ✅ **결정: 자동 포함** — 규칙 저장 시 수집기 설정 생성의 `extra` 기본값에 이름 포함, 화면에 "수집기 설정 재생성 후 반영" 안내 · 원안: 규칙 저장 시 수집기 설정 생성의 `extra` 기본값에 이름을 자동 포함할지(고객이 재생성해야 반영됨) |
| **Q9** | 다중 노드 반영 지연 | ✅ **결정: TTL 30초 그대로** · 원안: 설정 캐시 TTL 30초를 그대로 받아들일지(그 사이 노드마다 저장 여부가 다름) |

---

## 9. 단계 (착수 시 확정)

| 단계 | 범위 |
|---|---|
| S0 | Q1·Q2·Q3·Q7 결정 |
| S1 | 후보 관측 기록(§5.2) — **먼저 배포해 실데이터를 모은다**(다른 단계의 기본값 산정 근거) |
| S2 | 규칙 테이블·API·수신 경로(상한 L1~L8·새 폐기 사유) |
| S3 | 등록 마법사 화면(§5.3) + 규칙 목록 |
| S4 | 커스텀 지표 조회 EP + 서비스 상세 탭(§6.3) |
| S5 | 실측 — 상한 경계(조합 50·51번째), 재기동 워밍, 다중 노드 반영, 롤업·보존 자동 합류 |

---

## 10. 리스크

1. 🔴 **상한 우회**: 커스텀 규칙이 내장 이름을 덮으면 내장 화면이 조용히 틀린다 → 등록 거부(§4.5).
2. 🔴 **이름 길이 128 초과**: 배치 전체 적재 실패 → 등록 거부 + 후보 관측에서도 제외.
3. ⚠️ **"먼저 온 것이 이긴다"**: 중요하지 않은 조합이 상한을 채울 수 있다 → 접힘 비율 표시 + 수동 초기화.
4. ⚠️ **관측 창이 짧으면 distinct를 과소평가** → 🟢 판정이 틀릴 수 있다. L4가 최종 방어.
5. ⚠️ **힙**: `CumulativeDeltaTracker`는 개수 상한이 없다 — L5가 간접 상한. L5를 크게 올리면 힙 계측부터 할 것.
6. ⚠️ **용량 수치는 R3(메트릭 내장 조합) 기준 추정**이다. 커스텀 지표 실측 없음.

---

## 근거 위치

| 파일 | 본 것 |
|---|---|
| `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/ApmMetricAllowlist.java` | 표 구조·`Spec`·파생 차원 2개·별칭·수집기 12키 상한·`find()` |
| `.../collector/ingest/normalize/ApmDimsNormalizer.java` | canonical JSON·빈 문자열 규칙·256 절단·route 상한(LRU 금지·워밍) |
| `.../collector/ingest/normalize/CumulativeDeltaTracker.java` | 시리즈별 상태 맵, TTL 30분·개수 상한 없음 |
| `.../collector/ingest/store/MetricIngestor.java` | ①~⑥ 단계, ③에서 허용목록 판정·폐기 기록 |
| `.../collector/ingest/MetricIngestPipeline.java` | `route_limit` 설정 반영 경로 |
| `.../collector/ingest/drop/ApmDropReason.java` | 사유 enum, varchar(32), 개명=마이그레이션 |
| `.../collector/drops/ApmIngestDropsDto.java` | 폐기 통계 응답(누적 카운트, 이름·건수만) |
| `.../collector/config/ApmCollectorConfigGenerator.java` · `resources/apm/collector-template.yaml` | Collector `filter/metrics` 기본 include·`extra` 옵션 |
| `.../collector/setting/ApmSettingController.java` · `.../core/security/ApmAccessChecker.java` | `apm.edit` 권한 축, APM 전용 감사 테이블 없음 |
| `.../core/batch/rollup/ApmRollupService.java` | 롤업 SQL이 메트릭 무관(`group by service_id, metric, dims_hash`) |
| `.../service/runtime/RuntimeSlotMap.java` | "저장은 되는데 화면에 안 뜨는" 경고 |
| `.../core/metric/ApmMetricStore.java` · 각 `*Controller.java` | 임의 메트릭 조회 EP 부재(grep) |
| `src/main/resources/db/migration/V38__apm_p1.sql` | `apm_metric_1m/5m/1h`·`apm_ingest_drop_stat`·`apm_setting`(route_limit) |
| `src/main/resources/db/migration/V39__apm_setting_updated_by.sql` | APM 감사 최소 기록 결정, ArchUnit A3 |
| `src/test/java/com/dmove/moveseye/license/LicenseArchitectureTest.java` | A1·A3 규칙 |
| `_workspace/features/apm/core/devdesign_apm.md` §4.3·§4.4 | 허용목록 원설계, R3 용량 실측(686B/행·14M행/일) |
| `_workspace/planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` §I5 · `backlog_apm-comprehension-and-ai.md` §1-4 | 이슈 정의 |
