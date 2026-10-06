# engine-zabbix — Zabbix 어댑터 모듈

[`engine-api`](../engine-api) 계약의 **Zabbix 구현**. 계약(인터페이스·모델)은 여기 없다 — 전부 engine-api에 있고
이 모듈은 구현 28개만 담는다.

> 설계 정본: `C:\solutions\_workspace\devdesign_collector-engine.md`

---

## 1. 구성

| 구역 | 내용 |
|---|---|
| **어댑터 3개** | `metric/ZabbixMetricAdapter` · `host/ZabbixInventoryAdapter` · `alert/ZabbixAlertAdapter` — engine-api의 중립 포트 구현 |
| **카탈로그** | `metric/ZabbixMetricCatalog` — 캐노니컬 `MetricRef` ↔ Zabbix 아이템 키 매핑 **정본** |
| **레지스트리** | `metric/ZabbixDataSourceRegistry` — 소스 식별자 → 포트 해석 + capability |
| **RPC 래퍼 12개** | `*ServiceImpl` — Zabbix JSON-RPC 호출. engine-api의 `zabbix/` 전용 계약 구현 |
| **클라이언트** | `client/ZabbixClient` — JSON-RPC 전송 |
| **세션** | `session/ZabbixSessionProvider` — `CallerContext` → Zabbix 토큰 해석(§D3) |

---

## 2. 두 층이 겹쳐 있다

```
중립 포트 (MetricPort / InventoryPort / AlertPort)
   ↑ 구현
Zabbix 어댑터 3개  ──내부 재사용──▶  *ServiceImpl (RPC 래퍼)
                                        ↑ 구현
                              engine-api/zabbix/*Service (전용 계약)
                                        ↑ 직접 호출
                                    app의 C·D군(관리 화면·아이덴티티)
```

**어댑터는 RPC 래퍼를 재사용한다.** 즉 같은 `ZabbixHostServiceImpl`이
① 중립 포트 뒤에서(`ZabbixInventoryAdapter`) ② app의 관리 화면에서 직접 — 두 경로로 쓰인다.

---

## 3. 어댑터가 흡수하는 것

소비자가 몰라도 되도록 어댑터 안에 숨긴 Zabbix 사정들:

- **2단 조회** — `problem.get`은 hostid를 안 주고 `objectid`(triggerid)만 준다 → `trigger.get(selectHosts)` 추가 호출
- **폴백 체인 / 합집합** — 같은 지표를 여러 키로 쓰는 소스 사정(`ChainMode`)
- **배치** — 메트릭마다 `item.get`/`history.get`/`trend.get`을 날리던 N+1 제거(전 호스트 1콜)
- **value_type → history 테이블 유도** — 원본이 하드코딩하던 것
- **예외 번역** — `UnauthorizedError`→`UNAUTHORIZED`, `ApiError`/`HttpError`→`SOURCE_UNAVAILABLE`, 그 외 `INTERNAL`

---

## 4. SPI 의존 역전

이 모듈은 JPA/Redis를 모른다. 필요한 것은 **인터페이스로 선언하고 app이 구현**한다
(선언은 engine-api `zabbix/spi/`, 구현은 app `zabbix/spi/impl/`):

| SPI | app 구현 | 담당 |
|---|---|---|
| `ZabbixConnectionResolver` | `SettingBackedZabbixConnectionResolver` | API URL(Setting/JPA + env 폴백, 60초 캐시) · 슈퍼어드민 자격증명 |
| `ZabbixSessionStore` | `RedisZabbixSessionStore` | 토큰 캐시(Redis) |

---

## 5. 빌드 제약

`java-library` + Spring BOM(platform). **Boot 플러그인/bootJar 없음**.

| 허용 | 금지 |
|---|---|
| `spring-context`(@Service) · `spring-web`(RestClient) · `jackson-databind` · `slf4j` · `lombok` | **JPA · Flyway · Redis 스타터** |

app은 이 모듈을 `runtimeOnly`로만 의존한다(테스트는 `testImplementation`) — 프로덕션 코드가
Zabbix 구현을 직접 참조하면 **빌드가 깨진다**.

---

## 6. 테스트

7개 (`ZabbixMetricAdapterTest` · `ZabbixMetricCatalogTest` · `ZabbixAlertAdapterTest` ·
`ZabbixInventoryAdapterTest` · `ZabbixDataSourceRegistryTest` 등).
카탈로그 **커버리지** 테스트는 app 쪽에 있다(app 상수 `ZabbixItemKey`와 교차 검증해야 하므로).
