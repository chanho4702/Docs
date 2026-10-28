# engine-api — 수집 엔진 계약 모듈

moveseye가 모니터링 데이터를 **어디서 가져오든 같은 모양으로** 쓰기 위한 계약(인터페이스 + 모델)만 담는다.
구현은 없다 — Zabbix 구현은 [`engine-zabbix`](../engine-zabbix), 앞으로 붙을 Prometheus 등도 별도 모듈이다.

> 설계 정본: `C:\solutions\_workspace\devdesign_collector-engine.md`
> (§D1 모듈 구조, §D2 포트 분류, §D4 캐노니컬 모델, §D5 proto 호환 규칙)

---

## 1. 두 구역

이 모듈은 **성격이 다른 두 구역**으로 나뉜다. 섞으면 안 된다.

| 구역 | 패키지 | 성격 | 파일 |
|---|---|---|---|
| **중립 계약** | `com.dmove.moveseye.engine.*` | 모든 소스가 구현할 수 있는 캐노니컬 계약. 다중 데이터소스의 **정본** | 46 |
| 🟠 **Zabbix 전용** | `com.dmove.moveseye.zabbix.*` | **추상화 없음.** Zabbix API 모양 그대로. 소스가 Zabbix일 때만 켜지는 기능 | 48 |
| 레거시 예외 | `com.dmove.moveseye.common.exception.*` | app 레거시 예외 커널(엔진 계약 아님) | 4 |

### 왜 Zabbix 전용 구역이 여기 있나

§D2가 **C군(관리 화면 CRUD)** 과 **D군(아이덴티티)** 을 "소스 공통화 불가능"으로 판정했다.
트리거 expression DSL·템플릿 링크·Zabbix 사용자 권한 모델은 Prometheus/Datadog에 대응물이 없다.
그렇다고 app이 `engine-zabbix`(구현)를 직접 참조하면 컴파일 의존 차단이 불가능하므로,
**계약만 여기로 올리고 구현은 막는다**. 이름(`zabbix.*`)이 "이건 전용 기능"임을 드러낸다.

---

## 2. 중립 계약 (`engine/`)

### 포트 (`engine/port/`)

| 포트 | 담당 | 주요 메서드 |
|---|---|---|
| `MetricPort` | 메트릭 읽기 | `querySeries` · `queryLatest` · `queryTrend` · `queryLatestText` · `queryRecentText` · `queryLatestFamily` · `queryTrendFamily` · `listDimensions` |
| `InventoryPort` | 호스트·그룹 조회 | `listHosts` · `listGroups` |
| `AlertPort` | 알람 읽기 + 조치 | `countActive` · `listActive` · `listHistory` · `countHistory` · `scanHistory`(흘려보내기, ZM-159 C8) · `acknowledge` |
| `GpuInventoryPort` (ZM-78) | GPU 식별·최신 관측·수집 진단 일괄 스냅샷 | `snapshot` — 시계열은 `MetricPort`(도메인 `GPU`) |

**GPU(ZM-78)**: 모델은 `engine/model/gpu/`. 포트는 하나지만 반환 모델은 식별(`GpuDevice`)과 관측(`GpuObservation`)으로
나뉜다. 최신값을 `MetricPort.queryLatest`로 주지 않는 이유는 값 상태(미지원·오류·미수신·오래됨)를 0으로 뭉개지 않기
위해서다 — 어댑터가 GPU 도메인의 `queryLatest`를 `BAD_QUERY`로 거부한다. 캐노니컬 이름·단위·차원은 `GpuMetrics`,
사유 코드는 `GpuReasonCodes`. `SeriesResult.qualities`(계열별 품질)는 GPU만 채운다(기존 도메인은 빈 목록).

**`*Family` 메서드가 따로 있는 이유**: 일반 조회는 (엔티티 × 메트릭) 셀마다 **아이템 하나**를 고른다.
호스트당 마운트·인터페이스가 여럿인 집계(그룹 디스크 사용률 등)에서는 그 자리에서 나머지가 소실되므로,
계열 전체를 돌려주는 짝이 필요하다.

### 모델 (`engine/model/`, 37개)

핵심: `EntityRef`(소스+식별자) · `MetricRef`(도메인+이름+차원) · `TimeRange` · `Series`/`TrendSeries` ·
`LatestValue` · `InventoryHost`/`InventoryGroup` · `Alert`/`AlertRule`/`AlertAction` · `CallerContext`.

### 레지스트리 (`engine/registry/`)

`DataSourceRegistry`가 소스 식별자 → 포트 구현을 해석하고 `Capability`로 기능 유무를 게이팅한다.

### 에러 (`engine/error/`)

포트는 **`EngineException` 단일 계층**만 던진다(`ErrorKind`로 분류). 소스별 예외는 어댑터가 번역한다.

---

## 3. 의존

```
app → engine-api        (compile)
      engine-api ← engine-zabbix  (구현)
app → engine-zabbix     (runtimeOnly — 컴파일 차단)
```

이 모듈이 갖는 외부 의존은 **최소**다:

| 의존 | 용도 |
|---|---|
| Spring Boot BOM (platform) | 버전 정렬만 |
| `jackson-annotations` | `zabbix/` 구역 model record의 `@JsonIgnoreProperties`/`@JsonProperty`. **databind는 없다**(직렬화는 구현 몫) |
| `lombok` | `@Builder`/`@Getter` |
| `spring-web` | 🟠 레거시 예외 커널 `HttpError`의 `HttpStatus` **하나** 때문 |

**중립 구역(`engine/`)은 이들 없이도 컴파일된다.**

---

## 4. proto 정본

`src/main/proto/engine.proto`는 **계약 사양서**다. codegen을 하지 않으며 빌드에 포함되지 않는다
(Java record가 런타임 정본). 물리 분리(gRPC 승격) 시 출발점이다.

**Java 계약을 바꾸면 proto도 같이 바꾼다.**

---

## 5. 테스트

이 모듈에는 테스트가 없다(순수 계약). 계약의 동작은 구현 쪽(`engine-zabbix`)과 소비자(app)에서 검증한다.
