# 수집 엔진 레이어(Collector Engine) 설계서 v2

- v1: 2026-07-22 방향 확정(사용자 합의: 논리 분리 지금 / 서버(gRPC) 분리 유예)
- **v2: 2026-07-23 현행화** — 스텝 0·0.5·1 완료를 본문에 흡수(as-built). 이전 판의 각주 누적분 정리.
- 근거 조사: 2026-07-22 결합도 전수 조사(§2)

---

## 0. 한눈에 보기

**한 줄 요약**: moveseye를 Zabbix 전용에서 다중 데이터소스(Zabbix+Prometheus+Datadog+Elastic)로 전환하기 위해, 비즈니스 로직과 수집 코드 사이에 **소스 중립 포트(계약)** 를 세우고 Zabbix를 그 첫 번째 어댑터로 만든다. 별도 엔진 서버(gRPC) 분리는 조건 성립 시로 유예하되, 계약을 proto 호환으로 설계해 승격 비용을 선지불한다.

**진행 현황** (스텝 정의는 §5):

| 스텝 | 내용 | 상태 |
|---|---|---|
| 0 | Gradle 멀티모듈 골격 + zabbix 패키지 engine-zabbix로 이동(의존 역전 2건) | ✅ 2026-07-22 |
| 0.5 | engine-zabbix 기능별 패키지 재편 + ZabbixTypes 홀더 해체 | ✅ 2026-07-23 |
| 1 | engine-api 계약(모델·MetricPort·EngineException·proto) + 키 매핑 카탈로그 + Zabbix 어댑터 + 세션 프로바이더 | ✅ 2026-07-23 |
| 2 | A군 파일럿 갈아타기: memory → cpu (+포트 3종 보강: queryTrend·Series.nativeId·value_type history) | ✅ 2026-07-23 |
| 3 | A군 잔여 (disk ✅3a / network·interface·session ✅3b / responsetime·host-event ✅3c, items 전환보류·livecheck 대상외) | ✅ 2026-07-23 (A군 종결) |
| 4 | InventoryPort·AlertPort 설계 + B군 (✅4a 계약+livecheck / ✅4b home+host-event / ⬜4c geomap·networkmap·asset·report·event·host 루트) + items 패스스루 재평가 | 🔄 4a·4b 완료 2026-07-27 |
| 5 | Zabbix 계약 engine-api 이동 + app→engine-zabbix 컴파일 의존 차단 | ✅ 2026-07-28 |
| 6 | Prometheus 어댑터 (Phase 2 진입, 추상화 실검증) | ⏸ 보류 |

**현재 모듈 구조** (스텝 1 종료 시점, 빌드 green·테스트 432/실패 0):

```
moveseye-be-spring/
├── (root = app, Spring Boot 부팅 모듈)     기존 비즈니스 로직·REST·JPA/Flyway·인증 전부.
│     └ zabbix/spi/impl/                    엔진 SPI의 app측 구현(Setting·Redis 위임) + zabbix/sync/, zabbix/manage/
├── engine-api/                             ★ 계약: 포트·모델·에러·레지스트리·proto. Spring-free.
│     └ com.dmove.moveseye.engine.{model, port, error, registry} + src/main/proto/engine.proto
└── engine-zabbix/                          ★ Zabbix 어댑터 (기능별 패키지)
      └ com.dmove.moveseye.zabbix.{client, host, hostgroup, item, timeseries, alert,
                                    trigger, template, proxy, identity, metric, session, spi}
```

의존 방향: `app → engine-api ← engine-zabbix`. **스텝 5에서 차단 완료** — app은 engine-api만 컴파일 의존하고 engine-zabbix는 `runtimeOnly`다(테스트만 `testImplementation`으로 예외).

---

## 1. 배경과 목표

moveseye를 Zabbix 단일 소스에서 **다중 데이터소스**(Zabbix + Prometheus + Datadog + Elasticsearch) 지원으로 전환한다.

**확정된 방향:**
1. 서비스 레이어(비즈니스 로직) ↔ 수집 레이어(데이터소스 어댑터)를 **포트 인터페이스로 논리 분리**한다. — 지금 수행
2. 수집 레이어를 별도 엔진 서버(gRPC)로 **물리 분리하는 것은 유예**한다. 계약을 proto 호환으로 설계해 승격 비용을 선지불해 둔다.
3. 물리 분리 승격 조건(하나라도 현실화 시): 고객사 망 내 수집기 배치 토폴로지 / 수집 폴링 부하가 앱 응답성 저해 / 수집기 폴리글랏(Go 등) / 팀·운영 주체 분리.

**비목표(이번 설계 범위 제외):**
- 크로스 소스 엔티티 아이덴티티 통합(같은 서버의 Zabbix hostid ↔ Datadog host ↔ Prom instance 매핑) — Phase 2+에서 수동 매핑 테이블로 시작
- Elasticsearch 로그 도메인 — 메트릭 소스가 아니라 **신규 도메인(로그 화면 신설)**. 별도 설계서(`devdesign_log-domain.md` 예정)
- 인증의 탈-Zabbix(현재 Zabbix가 사실상 IdP) — 별도 대형 과제로 인지만(§7)

**설계 철학 — Grafana 방식이 아니라 도메인 정규화 방식**: Grafana는 소스를 통합하지 않는다(패널마다 소스별 쿼리, 공통은 frame뿐). DMOVE는 화면이 고정된 오피니언 대시보드이므로, 범용 쿼리 패스스루가 아니라 **화면이 요구하는 능력(capability) 단위의 정규화 포트**를 세운다.

---

## 2. 실측 결합도 (2026-07-22 조사, 착수 근거)

- Java 504파일 중 225개(45%)가 zabbix 참조. zabbix 패키지 밖 88개 파일이 hostid/itemid/triggerid 직접 사용.
- 15개 Zabbix 서비스 인터페이스 + `ZabbixClient`(제네릭 JSON-RPC). **모든 메서드 첫 파라미터가 `String authToken`** — 호출측이 토큰 획득 책임(관통 누수).
- 도메인 4군집:
  - **A. 메트릭 읽기** (item+history+trend, 아이템 키 리터럴 직접 사용): host/cpu·memory·disk·network·hostinterface·responsetime·items·livecheck·event(host). 순수 읽기, 사용자 토큰.
  - **B. 인벤토리·알람 읽기** (hostid/triggerid 중심, raw `Map`): host 루트(HostService 2000줄, 최대 소비자), event, home, geomap, networkmap, asset, report. DB 스냅샷 혼합.
  - **C. 관리 쓰기** (Zabbix 설정 API 프록시): zabbix/manage 4컨트롤러 + host/manage. super-admin 토큰. trigger expression 등 **Zabbix DSL이 FE까지 노출 — 추상화 불가능 군집**.
  - **D. 아이덴티티** (Zabbix=IdP): user/admin/auth/setting — 로그인 시 Zabbix 토큰 프로비저닝(JwtAuthFilter, Redis 캐시+분산락).
- 분리의 두 병목(→ 스텝 0에서 해소): ① authToken 관통 ② `ZabbixClient`→`SettingRepository`(JPA) 의존.
- 캐노니컬 키 카탈로그의 뼈대는 기존 `common/constants/ZabbixItemKey.java`(150줄)에 존재(→ 스텝 1 카탈로그의 재료).

---

## 3. 아키텍처 결정 (ADR) — as-built 반영

### D1. Gradle 멀티모듈 in-process 분리 (프로세스 분리 아님)

**as-built**: `app/` 서브모듈 분리 대신 **root 프로젝트를 부팅 모듈(app)로 유지**하고 `engine-api`/`engine-zabbix`만 서브모듈로 추가했다(대량 이동 churn 회피 — 의존 방향과 "Boot 플러그인은 app에만" 원칙은 그대로. `app/` 전용 모듈 승격은 필요 시 후속).

- engine-*는 `java-library` + Spring Boot BOM(platform). bootJar 없음, JPA/Flyway/Redis 스타터 의존 금지(빌드로 강제).
- **의존 역전 SPI** (engine-zabbix가 선언, app이 구현·주입):
  - `ZabbixConnectionResolver` — `resolveApiUrl()` / `invalidateCache()` / `resolveSuperAdminCredentials()`. app 구현 `SettingBackedZabbixConnectionResolver`가 Setting(JPA)·env 폴백·URL 60초 TTL 캐시 로직 소유.
  - `ZabbixSessionStore` — super-admin 토큰 캐시 get/set(NestJS 상호운용 이중 직렬화·TTL 60초 보존) + `getUserToken(zabbixUserid)`(스텝 1 추가). app 구현 `RedisZabbixSessionStore`.
- **기능별 패키지(스텝 0.5)**: 평면 구조(루트 인터페이스 15개+`ZabbixTypes` 홀더+`impl/`)를 해체 — `client`(RPC) · `host`(6) · `hostgroup`(5) · `item`(4) · `timeseries`(8, history+trend) · `alert`(8, problem+event) · `trigger`(2) · `template`(2) · `proxy`(2) · `identity`(22, user/usergroup/role/token) · `spi`(3). `ZabbixTypes`의 중첩 record 29개는 소속 기능 패키지의 최상위 타입으로 승격(타입명·직렬화 불변). 인터페이스+Impl 병치. 유일한 실질 변경: `ZabbixItemServiceImpl.parseCount` package-private→public(패키지 분리로 trigger impl의 재사용 접근).
- app 잔류(어댑터로 안 옮긴 것): `zabbix/sync`(JPA 동기화 오케스트레이터), `zabbix/manage`(C군 REST 레이어, 스텝 5 대상), `zabbix/spi/impl`(SPI 구현).

### D2. 포트는 capability 기반 4개 (범용 쿼리 패스스루 아님)

| 포트 | 커버 군집 | 다중 소스 대상 | 상태 |
|---|---|---|---|
| `MetricPort` | A | ✅ 핵심 | **✅ 스텝 1 확정 구현** |
| `InventoryPort` | B(호스트/그룹/인터페이스 조회) | ✅ | ✅ **스텝 4a 확정** — `listHosts` 1메서드로 착수(LiveCheck/HostEvent 실소비자 shape 기반). groups/lastCheck/inventory 등은 4c 소비자(Asset·HostService) 보고 증분 확장 |
| `AlertPort` | B(problem/event 읽기)+ack | ✅ (ack는 capability) | ⬜ 〃 |
| `ZabbixAdminPort` | C+D | ❌ **추상화 제외** | ⬜ 스텝 5(개명·이동만). trigger expression DSL·template link는 소스 공통화 불가능 — Zabbix 소스 있을 때만 켜지는 전용 기능 |

### D3. authToken 관통 제거 — 토큰은 어댑터 내부 책임

**as-built(스텝 1, 위임 래퍼)**: `zabbix.session.ZabbixSessionProvider.resolve(CallerContext)`.
- `SYSTEM`(또는 null — 배치 안전 기본값) → 기존 `ZabbixUserService.getSuperAdminToken()` 위임.
- `USER`(principal=zabbixUserid) → `ZabbixSessionStore.getUserToken()`이 app 인증 레이어의 Redis 해시(`REDIS_USER_API_TOKEN`, 값 `token:tokenid:expiresAt`)에서 토큰만 추출. **재발급·분산락은 이동하지 않음** — JwtAuthFilter 소관 유지(요청 경로에선 필터가 유효 토큰을 이미 보장). 조회 실패 → `EngineException(UNAUTHORIZED)`.
- `CallerContext(principal, CallerRole)`는 proto 표현 가능 — 물리 분리 시 gRPC 메타데이터로 승격. 토큰 소유권의 완전 이동은 스텝 5 재평가.

### D4. 캐노니컬 메트릭 모델

**as-built** (engine-api `model/`, 전부 record·proto 호환):

```java
EntityRef(String sourceId, String nativeId)          // Phase 1: sourceId="zabbix-default", nativeId=hostid
MetricDomain { CPU, MEMORY, SWAP, DISK, NETWORK, INTERFACE, PING, SYSTEM }
MetricRef(MetricDomain domain, String name, Map<String,String> dims)   // 예: (DISK,"fs.pused",{partition:"/data"})
TimeRange(long fromEpoch, long toEpoch)
Rollup { RAW, HOURLY_TREND }                          // Zabbix: history/trend, Prom: step으로 해석될 힌트
SeriesPoint(long epoch, double value)
TextSample(long epoch, String value, String nativeId)                                 // 스텝3c: SeriesPoint의 텍스트 대응(로그 등 비수치 이력), nativeId=itemid
Series(EntityRef entity, MetricRef metric, String nativeId, List<SeriesPoint> points)  // nativeId(스텝2): 소스 원시 시리즈 id=itemid, nullable
TrendBucket(long epoch, double min, double max, double avg)                            // 스텝2 신설
TrendSeries(EntityRef entity, MetricRef metric, List<TrendBucket> buckets)             // 스텝2 신설
LatestValue(entity, metric, epoch, double value, String units, String raw, String label)  // raw=원문 보존, units=bps 등, label=소스 항목 표시명(스텝3b, D7 보존용 nullable)
DimensionValue / SeriesQuery(entities, metrics, range, rollup) / LatestQuery(entities, metrics)
CallerContext(String principal, CallerRole role)
```

- 키 매핑은 전적으로 어댑터 책임(§4.2 카탈로그). **도메인 서비스에서 아이템 키 리터럴이 사라지는 것이 A군 마이그레이션 완료 기준.**
- 디스커버리(마운트/인터페이스 목록)는 `listDimensions`, 텍스트/JSON **최신값**은 `queryLatestText`, 텍스트 **이력**(로그 라인 등)은 `queryRecentText`(스텝3c)로 분리(수치 시계열에 우겨넣지 않음).
- `HOURLY_TREND`는 trend avg를 value에 싣는다. min/max 필요 소비자가 나오면 스텝 4에서 확장 검토.

### D5. proto 호환 계약 규칙 (물리 분리 대비)

- `engine-api/src/main/proto/engine.proto` = 계약 사양서(codegen·빌드 미포함, Java record가 런타임 정본). 물리 분리 시점에 codegen 도입.
- 시그니처 규칙: `Map<String,Object>` 금지, 제네릭 금지, enum 명시, 페이지네이션은 opaque token, 예외는 `EngineException` 단일 계층. → 이 규칙이 레거시 `*Raw(Map)` 메서드의 자연 소멸을 강제(B군 완료 기준).

### D6. 소스 레지스트리와 capability

**as-built**: engine-api `registry/`(`DataSourceRegistry`·`DataSourceDescriptor`·`Capability{METRICS,INVENTORY,ALERTS,ALERT_ACK,LOGS,ZABBIX_ADMIN}`) + engine-zabbix `ZabbixDataSourceRegistry`(Phase 1 하드와이어: 소스 1개 "zabbix-default", capability 전체 선언, `port()`는 MetricPort만 해석 — 미지 소스 NOT_FOUND / 미구현 포트 UNSUPPORTED).
- Phase 2(둘째 소스): datasource 테이블(V14+) + `GET /datasources` EP → FE capability 메뉴 게이팅(Zabbix 관리 메뉴는 ZABBIX_ADMIN 있을 때만).

### D7. REST API 불변 (Phase 1)

Phase 1 전체가 순수 BE 내부 리팩터. FE 무변경, REST 경로·응답 shape 불변(hostid 등 기존 노출 ID 유지). 기존 E2E/functional-qa 회귀가 안전망.

### D8. 예외 이원화 (스텝 1 확정 — v1의 "예외 커널 재-홈" 계획 폐기)

- **신규 포트 경로**: engine-api의 Spring-free `EngineException(ErrorKind, sourceId, message, retriable)` + `ErrorKind{UNAUTHORIZED, NOT_FOUND, BAD_QUERY, SOURCE_UNAVAILABLE, UNSUPPORTED, INTERNAL}`만 던진다.
- **레거시 예외 커널**(`HttpError`/`ApiError`/`ErrorCode`/`UnauthorizedError`): `HttpStatus` 결합이라 engine-api로 못 올라감 + 레거시 15개 서비스가 사용 중 → **engine-zabbix에 존치**(스텝 0에서 이동, `common.exception`은 app과 split-package 전이 상태). 어댑터가 번역 계층: `UnauthorizedError`→UNAUTHORIZED(비재시도), `ApiError`/`HttpError`→SOURCE_UNAVAILABLE(재시도 가능), 그 외→INTERNAL. **스텝 5에서 레거시 서비스와 함께 소멸.**

### D9. 자산 동기화(AssetSyncService)는 추상화 제외 — Zabbix 미러링 (스텝 4c-3 판정, 2026-07-27)

**결정**: `AssetSyncService`는 포트로 전환하지 않고 `zabbix/manage`와 같은 **Zabbix 전용 영역**으로 분류해 스텝 5(개명·이동만)로 이관한다.

**근거**:
1. **성격이 읽기 추상화가 아니라 미러링이다.** 이 서비스는 Zabbix 호스트를 통째로 스냅샷 떠 DB(`asset.zabbix_data` jsonb)에 박제한다. 담는 것: `host`(기술명)·`visibleName`·`status`·`groups`·`interfaces`(type/ip/dns/port/main)·**`inventory`(Map, Zabbix 인벤토리 필드 중 값 있는 것 전부)**·`tags`. 여기에 `AssetDerivation`이 inventory의 특정 키를 읽어 `deployment`/`resourceType` 파생값까지 만든다.
2. **둘째 소스에 대응 개념이 없다.** Prometheus·Datadog에는 host inventory(serialno/location/contact/…)가 없다 — 추상화해도 Zabbix 외 구현체가 비어 있다. §D2가 `ZabbixAdminPort`를 제외한 것과 같은 논리.
3. **중립화하면 계약이 오염된다.** 포트 경유로 바꾸려면 `InventoryHost`에 technicalName·status·inventoryMode·tags·inventory(Map)·dns·port를 전부 실어야 하고, 그 결과는 **Zabbix host 객체의 복제본**이다 — §D2/리스크표가 경고한 "1개 소스만 보고 설계해 정규화 모델이 오염되는" 실패 모드 그 자체.
4. **DB 영속 스키마와 얽혀 있다.** `AssetZabbixData`는 jsonb 저장 포맷이라 모델을 바꾸면 기존 저장 데이터 호환이 깨진다(마이그레이션 비용이 추상화 이득보다 크다).

**대가(수용)**: 스텝 4 완료 기준이던 "`*Raw(Map)` 호출이 app에서 소멸"을 **"메트릭·인벤토리·알람 *읽기* 경로에서 소멸"로 축소**한다. 미러링 계열(`AssetSyncService`)의 `getRaw` 사용은 스텝 5까지 존치하며, 그때 `zabbix/manage`와 함께 Zabbix 전용 패키지로 이동한다.

**재논의 트리거**: Prometheus 어댑터(스텝 6) 이후 "Zabbix 없는 배포에서도 자산 목록이 필요하다"는 요구가 생기면, 그때는 인벤토리 스냅샷이 아니라 **자산 도메인 자체를 소스 독립으로 재설계**하는 별개 과제로 다룬다.

### D11. 트리거 상세는 Zabbix 전용 확정 — 단, "조치 가능 여부"는 중립 (스텝 4c-5e, 2026-07-27)

**결정**: `EventService.getTriggerDetail`/`getEventTriggerDetail`과 `HostService`의 트리거 조회 1곳(그룹 상세 문제 목록)은 포트로 전환하지 않고 **스텝 5(ZabbixAdminPort 개명·이동)로 확정 이관**한다. 반면 `manual_close`는 4c-5b의 분류를 뒤집어 `AlertRule.manualCloseAllowed`로 **중립화했다**.

**경계선은 "소스 공통 개념인가"이지 "trigger 객체에서 오는가"가 아니다**:
| 값 | 판정 | 사유 |
|---|---|---|
| `expression`·`recovery_expression` | ⛔ Zabbix 전용 | 소스마다 문법이 다른 DSL. 정규화 대상이 아니라 **표시용 원문**이다 |
| `eventGeneration`(type)·`state` | ⛔ Zabbix 전용 | Zabbix 트리거 생명주기 고유 개념 |
| `opdata` | ⛔ Zabbix 전용(보류) | "운영 데이터" 템플릿 문자열 — 매크로가 박힌 Zabbix 표현식이라 중립 의미가 없다 |
| `comments` | ⛔ Zabbix 전용 | 위와 함께 상세 화면에서만 쓰인다 |
| **`manual_close`** | ✅ **중립** | "이 알람에 수동 종료 조치가 허용되는가" — 4c-5c가 `CLOSE_PROBLEM`을 중립 조치로 계약에 넣은 이상 **그 조치의 허용 여부도 같은 축**이다 |

🔴 **4c-5b의 오분류에서 배운 것**: 당시 `manual_close`를 expression과 **같은 문장에서** 봤기 때문에 함께 "Zabbix DSL"로 묶었다. 값이 어디서 오는지(같은 `trigger.get` 응답)가 아니라 **그 값이 답하는 질문**으로 갈랐어야 했다. 스텝 5로 넘기는 목록을 만들 때는 항목마다 "다른 소스에 같은 질문이 있는가"를 개별로 물을 것.

**대가(수용)**: `getEventTriggerDetail`·`getTriggerDetail`은 `ZabbixHostService.getTriggersRaw`를 계속 쓴다. 이 두 메서드가 EventService에 남은 마지막 Zabbix 의존이며, 스텝 5에서 Zabbix 전용 패키지로 이동한다.

### D10. 포트의 쓰기 계약 — 명령은 서술적, 대상은 명시적 (스텝 4c-5c, 2026-07-27)

`AlertPort.acknowledge`가 포트 최초의 상태 변경이다. 여기서 세운 규칙은 이후 모든 쓰기(스텝 5 `ZabbixAdminPort` 포함)에 적용한다.

1. **대상은 식별자 목록으로만 지정한다 — 필터로 쓰기를 걸지 않는다.** 필터는 소스마다 해석 여지가 있어(`recent`·`suppressed`·시간창 경계) 의도치 않은 대상까지 바뀔 수 있다. "무엇을 바꿀지"는 호출자가 먼저 읽어서 확정하고, 넓은 범위에 조치하는 화면도 조회 → id 수집 → 명령의 두 단계를 거친다.
2. **명령은 서술적이다.** "무엇을 하라"(중립 열거형)와 그 인자만 담고, 소스 인코딩(Zabbix action 비트합)은 어댑터가 조립한다.
3. **쓰기는 별도 capability로 게이팅한다**(`ALERT_ACK`). 읽기 전용 소스는 `UNSUPPORTED`를 던진다.
4. **읽기 포트와 쪼개지 않는다.** 소비자가 같은 화면에서 "읽고 그 자리에서 조치"하므로, 포트 경계가 화면 경계를 가로지르면 `CallerContext`·`SourceRef`를 두 벌 들고 다니게 된다.
5. **부분 성공을 계약에 두지 않는다.** 반환값 없음 — 조치 후 상태가 필요하면 호출자가 다시 읽는다.

---

## 4. as-built 구현 상세 (스텝 1 산출물)

### 4.1 engine-api (계약 층) — `grep org.springframework` 0건

```
com.dmove.moveseye.engine/
├── model/     §D4의 14개 record·enum
├── port/      MetricPort — querySeries · queryLatest · queryTrend(스텝2) · queryLatestText · queryLatestFamily(3a) · queryRecentText(3c) · listDimensions
├── error/     EngineException · ErrorKind
└── registry/  DataSourceRegistry · DataSourceDescriptor · Capability
src/main/proto/engine.proto   (모델·포트의 proto3 대응 사양서)
```

### 4.2 ZabbixMetricCatalog (번역사전, `zabbix.metric`)

- **61개 캐노니컬 메트릭 스펙** (CPU 10·MEMORY 9·SWAP 5·DISK 20·NETWORK 14·INTERFACE 4·PING 2·SYSTEM 11) + 파싱 보조 상수 8종(AUX 명시 등재).
- 매핑은 단방향 문자열이 아니라 **키 패턴 계열**: 파라미터 치환(`vfs.fs.size[{partition},pused]`), 프리픽스 substring 검색(계열 일괄 조회), **순서 있는 폴백 체인**.
- **폴백 체인 5종**: 메모리 pused(`vm.memory.size[pused]`→`vm.memory.pused`) / uptime(`system.hw.uptime`→`system.uptime`) / 디스크 root pused(`vfs.fs.size[/,pused]`→`vfs.fs.dependent.size[/,pused]`) / 디스크 size 계열 프리픽스(`vfs.fs.size`↔`vfs.fs.dependent.size`) / inode 계열(〃).
- **과거 버그 3종을 주석+테스트로 박제**: ① swap 사용률=`system.swap.size[,pused]`(vm.memory.pused 아님) ② `net.if.in/out`=bps 원값(단위 메타 "bps") ③ 디스크 dependent 계열 폴백 필수.
- **커버리지 강제**: app 테스트 `ZabbixMetricCatalogCoverageTest`가 리플렉션으로 `ZabbixItemKey` 전 상수 ↔ 카탈로그 등재를 대조 — 상수 추가 후 카탈로그 미등재 시 빌드 실패.

### 4.3 ZabbixMetricAdapter (MetricPort의 Zabbix 구현, `@Service`)

흐름: `sessionProvider.resolve(ctx)` → (entity×metric마다) 카탈로그 폴백 체인 순서로 `item.get` 시도·첫 히트 채택 → `Rollup.RAW`→`history.get` / `HOURLY_TREND`→`trend.get`(avg) → 레거시 예외를 `EngineException`으로 번역. 기존 `ZabbixItemService`/`ZabbixHistoryService`/`ZabbixTrendService`를 내부 재사용(검증된 RPC 재작성 없음). `listDimensions`는 도메인별 디스커버리 소스(DISK=`vfs.fs.size[` 파티션, NETWORK=`net.if.in[` iface)로 키 브래킷 파라미터를 추출.

### 4.4 ZabbixSessionProvider / ZabbixDataSourceRegistry

§D3 / §D6 참조.

### 4.5 검증 결과

- 전 모듈 `gradlew build` green, **테스트 398 → 432**(신규 +34: 카탈로그 11·세션 5·어댑터 13·레지스트리 4·app 커버리지 1), 실패 0.
- bootRun 기동 확인(신규 빈 컨텍스트 배선). 기존 도메인 서비스 diff 0 — **기존 화면 회귀 리스크 0**(아직 아무도 포트를 소비하지 않음).

---

## 5. 마이그레이션 로드맵 (스트랭글러, 도메인별 단계 커밋)

빅뱅 금지. 각 스텝은 독립 커밋+회귀 가능 단위, 레거시 `zabbix/*` 서비스는 스텝 5까지 공존.

| 스텝 | 내용 | 규모 | 완료 기준 | 상태 |
|---|---|---|---|---|
| 0 | 멀티모듈 골격 + zabbix 패키지 이동 + SPI 역전 2건 | 중 | 전 테스트 통과·동작 불변 | ✅ (37파일 rename, 397→398) |
| 0.5 | 기능별 패키지 재편 + ZabbixTypes 해체 | 중 | 〃 + 루트 클래스 0 | ✅ (app 77파일 import 갱신) |
| 1 | engine-api 계약 + 카탈로그 + 어댑터 + 세션 | 중 | 카탈로그가 ZabbixItemKey 전 항목 커버 | ✅ (398→432) |
| **2** | **A군 파일럿: memory → cpu 갈아타기** | 소→중 | 해당 서비스에서 아이템 키 리터럴·authToken 소멸, REST 응답 불변 | ✅ 2026-07-23 (grep 0건·454테스트 green·런타임 diff 무회귀. "소" 예상이었으나 실소비자가 포트 3종 보강을 요구 — 아래 회고) |
| **3a** | **A군 disk 갈아타기 + 어댑터 배치 조회 보강** | 대 | 〃 + N+1 제거 | ✅ 2026-07-23 (grep 0건·460테스트 green·런타임 diff 무회귀 — 아래 기록) |
| **3b** | **A군 network/interface(+session) 갈아타기 + querySeries 내부 history 배치** | 대 | 〃 | ✅ 2026-07-23 (grep 0건·473테스트 green·런타임 24/24 byte-identical — 아래 기록) |
| 3c | **A군 잔여: responsetime·host-event 전환 / items 전환보류 / livecheck 대상외 (A군 종결)** | 중 | 〃 | ✅ 2026-07-23 (grep 0건·483테스트 green·런타임 70/70 byte-identical — 아래 기록) |
| **4a** | **InventoryPort/AlertPort 계약 신설 + livecheck 파일럿 전환** | 중 | 포트/모델이 실소비자 shape 기반, REST 불변 | ✅ 2026-07-27 (`3bb9e9c`+`0cc29d3`. ⚠️테스트 미갱신 상태로 푸시 → FIX 커밋으로 복구, 아래 기록) |
| **4b** | **home(AlertPort.countActive) + host-event 완전 포트화(listActive 신설)** | 중 | 해당 서비스에서 Zabbix 타입·authToken 소멸 | ✅ 2026-07-27 (493테스트 green·실 Zabbix 전/후 6케이스 byte-identical — 아래 기록) |
| **4c-1** | **geomap·networkmap 라이브 집계 전환 + 중복 구현 통합(HostLiveAggregator)** | 중 | 두 서비스에서 Zabbix 타입·authToken 소멸 | ✅ 2026-07-27 (503테스트 green·전/후 5케이스 byte-identical — 아래 기록) |
| **4c-2** | **asset 라이브 정보(`resolveLive`) + HostQuery.include 신설** | 중 | 〃 | ✅ 2026-07-27 (506테스트 green·전/후 실데이터 일치 — 아래 기록) |
| **4c-3** | **AssetSyncService — 판정: 추상화 제외**(Zabbix 미러링 전용, 스텝 5로 이관) | 소 | 판정·기록 | ✅ 2026-07-27 (코드 변경 없음 — 아래 ADR D9) |
| **4c-4a** | **HostService 기기분류 집계(getDeviceTypeSummary) + tags 계약** | 소 | 해당 메서드에서 Zabbix 타입·authToken 소멸 | ✅ 2026-07-27 (510테스트 green·전/후 3그룹 identical — 아래 기록) |
| **4c-4b** | **InventoryPort.listGroups 신설 + HostService.getHostGroup 전환** | 중 | 해당 메서드에서 Zabbix 타입·authToken 소멸 | ✅ 2026-07-27 (516테스트 green·전/후 그룹30건 identical — 아래 기록) |
| **4c-4c** | **호스트 상태 판정(resolveHostStatuses) 전환 — trigger 2단 조회를 어댑터로 흡수** | 중 | 상태 판정에서 Zabbix 타입 소멸, 트리거 포트 불필요 | ✅ 2026-07-27 (516테스트 green·전/후 상태·집계 전 필드 identical — 아래 기록) |
| **4c-4d** | **HostService KPI·상태 계열 4메서드 + 공유 헬퍼 5종 전환** | 중 | host.get 직접 호출 12→8곳 | ✅ 2026-07-27 (516테스트 green·전/후 상태·집계 전 필드 identical — 아래 기록) |
| **4c-4e** | **HostNetworkInterface.nativeId 추가 → 인터페이스 그래프·상세 전환** | 소 | host.get 8→6곳 | ✅ 2026-07-27 (516테스트 green·전/후 5케이스 identical — 아래 기록) |
| **4c-5a** | **EventService 착수 — AlertQuery.nativeIds 신설 + getREventsMap 전환** | 소 | 해소 시각 경로 실검증 | ✅ 2026-07-27 (516 green·전/후 identical·**resolvedAtMillis 실검증 완료**) |
| **4c-5b** | **AlertRule 신설 + getEventBells 파일럿 전환** | 중 | 규칙 정보가 포트 경유, trigger.get 소멸 | ✅ 2026-07-27 (516 green·전/후 완전 identical — 아래 기록) |
| **4c-5c** | **acknowledge 체계(읽기+쓰기 동시 설계) — `AlertAction`/`AlertAckCommand` 신설 + `getStatusCounts` 전이 상태 해소 + proto drift 정리** | 중 | 조치 경로가 포트 경유, 포트에 첫 쓰기 | ✅ 2026-07-27 (536 green·런타임 11그룹 전부 identical. ⚠️쓰기 런타임 미검증 — 아래 기록) |
| **4c-5d** | **알람 목록·이력 전환 — `listHistory` 신설 + `Alert` 억제/원인/복구 3필드 + 공유 액션 헬퍼 재작성** | 대 | 목록 조회가 포트 경유, 건수 불변 | ✅ 2026-07-27 (547 green·런타임 19그룹 전부 identical — 아래 기록) |
| **4c-5e** | **알람 상세 전환 + 트리거 상세 스텝 5 확정 판정(ADR D11) — 계약 4필드 추가** | 중 | 상세가 포트 경유, 잔여는 판정 완료 | ✅ 2026-07-27 (557 green·런타임 9그룹 identical — 아래 기록) |
| **4c-4f** | **서버·네트워크 목록 전환(`InventoryHost.osName` 신설) + 그룹 상세 알람 전환** | 중 | 목록이 포트 경유, 소스 정렬·태그필터가 app으로 | ✅ 2026-07-28 (566 green·런타임 차이는 실시간 메트릭뿐 — 아래 기록) |
| **4c-4g** | **아이템 조회 3곳 전환(icmpHealth·networkMetrics·hostItems) + 카탈로그 4항목** | 중 | 해당 경로에서 아이템 키 리터럴 소멸 | ✅ 2026-07-28 (566 green·차이는 실시간 메트릭뿐 — 아래 기록) |
| **4c-4h** | **DiskService·DeviceClassificationService 완전 정리 + HostGroupService C군 판정** | 소 | 두 파일에서 Zabbix 서비스 호출 0 | ✅ 2026-07-28 (566 green — 아래 기록) |
| **4c-4i** | **EventSyncService(배치) + report 그룹조회 전환 — `AlertQuery.limit` 신설** | 중 | 배치가 포트 경유, app 참조 8파일 | ✅ 2026-07-28 (570 green — 아래 기록) |
| **4c-4j** | **`computeReport` 호스트 조회 + 네트워크 목록 인터페이스 개수 전환(카탈로그 `if.in.perif.family` 신설)** | 소 | 두 경로가 포트 경유 | ✅ 2026-07-28 (573 green·런타임 8그룹 중 차이는 실시간 메트릭뿐 — 아래 기록) |
| **4c-4k** | **`queryTrendFamily`+`ChainMode` 신설 → 그룹 자원 추이·리포트 집계 전환(`ResourceTrendQuery` 공용)** | 대 | 계열 트렌드가 계약에 생김, trend 소비자 2곳 전환 | ✅ 2026-07-28 (584 green·리포트 identical·추이는 구조 전건 동일 — 아래 기록) |
| **4c-4l** | **이벤트 이력 질의 계약(`AlertHistoryQuery` 확장 + `Alert.entities`=NamedEntity) → `summarizeAlerts` 전환, ReportService 완전 전환** | 중 | 이력 질의가 계약에 생김, **ReportService에서 Zabbix·authToken 소멸** | ✅ 2026-07-28 (586 green·리포트 3종 identical — 아래 기록) |
| **4c-4m** | **알림추이·그룹별 문제 요약 이력 전환(`InventoryGroup.hosts`=NamedEntity)** | 중 | 이력 소비자 3/4 종결 | ✅ 2026-07-28 (586 green·런타임 6그룹 **차이 0건** — 아래 기록) |
| **4c-4n** | **서버 목록 사용률(`fetchHostItemsMap`) 전환 + 인터페이스 2곳 보류 판정(ADR D12)** | 중 | HostService 잔여가 전부 판정 완료/보류 | ✅ 2026-07-28 (586 green·실시간 필드 제외 차이 0건 — 아래 기록) |
| 4c 종결 판단 | 남은 3곳(`detail`·`getCollectedInfo`·`getHostGroupDetailProblems`)은 판정 완료/보류 → **스텝 5로 이동** | — | B군 읽기 전환 종결 | ⬜ |
| **5** | **Zabbix 계약 48개 + 예외 커널을 engine-api로 이동 → app→engine-zabbix 컴파일 의존 차단** | 중 | **app의 zabbix 구현 참조 0(빌드가 강제)** | ✅ 2026-07-28 (586 green — 아래 기록) |
| 6 | Prometheus 어댑터 + 레지스트리 DB화(V14+) + `/datasources` EP + FE capability 게이팅 | — | 둘째 소스로 추상화 실검증 | ⏸ **보류(2026-07-28 사용자 결정)** — 착수 가이드는 아래 |

- 각 스텝 종료 시 functional-qa 회귀(REST 불변이라 기존 E2E 유효).
- 둘째 소스를 Prometheus로 선정한 이유: 무료·로컬 docker·API 단순 → 추상화 설계 오류를 가장 싸게 드러냄. Datadog은 SaaS·rate limit·비용으로 후순위, Elastic은 로그 도메인 신설이라 별도 트랙.

### 스텝 2 착수 가이드 (다음 작업)

1. `MemoryService`부터: `zabbixItemService/zabbixHistoryService` 직접 호출과 `ZabbixItemKey.VM_MEMORY_*` 리터럴을 `metricPort.querySeries/queryLatest` + `MetricRef(MEMORY,...)`로 치환. `currentUser.getAuthToken()` → `CallerContext.user(zabbixUserid)`.
2. REST 응답 DTO·경로는 절대 불변(D7). 기존 단위테스트가 그대로 통과해야 하고, mock 대상만 포트로 바뀐다.
3. swap 계열은 pused 교훈 검증 포인트([[swap-usage-pused-fix]]) — 카탈로그 SWAP 도메인 경유 확인.
4. 완료 후 `CpuService` 동일 패턴 반복 → 파일럿 회고(포트/카탈로그 시그니처 보완점 수집) 후 스텝 3 확산.

### 스텝 2 파일럿 회고 (2026-07-23 완료 — 스텝 3 확산 전 참고)

**결과**: MemoryService·CpuService에서 `ZabbixItemService/HistoryService/TrendService`·아이템 키 리터럴·`ZabbixItemKey`·`getAuthToken` 전부 소멸(grep 0건). 전 모듈 빌드 green, 테스트 432→**454**(+22: 어댑터 5·CallerContexts 6·MemoryService 6·CpuService 5). 런타임 검증(dev 프로필 5433 도커 DB + 실 Zabbix dmove.co.kr, admin/<마스킹>, 3099): 마이그레이션 전(c9c9bf8)/후 응답을 동일 고정 시간창으로 채집해 **필드 단위 비교 → CPU `currentUsage`(system.cpu.util lastvalue=live 값의 캡처 시점 차 변동) 외 전 필드 byte-identical**(라인차트 itemid까지 보존). 데이터 풍부 호스트는 10696(zabbix-server) 1대뿐, 나머지 13대는 메모리/CPU 아이템 부재로 원본도 0 반환.

**"소"가 아니었던 이유 — 실소비자가 강제한 포트/어댑터 보강 3종**(naive 포트로는 값 보존 불가였음):

1. 🔴 **어댑터 history 테이블 하드코딩 버그**: `fetchPoints`가 RAW를 항상 `history=FLOAT(0)`로 조회 → UNSIGNED(3, 예 `vm.memory.size[used]` 바이트 계열)는 Zabbix가 빈 결과를 줘 avg/max/min이 0으로 붕괴. **아이템 `value_type`에서 테이블 유도**로 수정(`historyTypeOf`). 스텝 3의 disk/network(바이트·카운터 UNSIGNED 다수)에서 특히 중요 — **확산 전 필수 회귀 포인트**.
2. **트렌드 min/max 부재** (§D4가 스텝 4로 미뤘던 항목이 A군 첫 소비자에서 조기 발생): `CpuService.getSummary`의 1시간 초과 구간이 trend `value_min/max/avg` 3통계를 모두 요구. `Rollup.HOURLY_TREND`의 `SeriesPoint`(avg만)로는 표현 불가 → **`MetricPort.queryTrend` + `TrendSeries`/`TrendBucket(epoch,min,max,avg)` 신설**(proto 동기화). 스텝 4로 미룰 게 아니라 이미 실재.
3. **라인차트 포인트 identity 누수**: 레거시 DTO(`{Cpu,Memory}MetricsLineChartResDto`)가 Zabbix `HistoryPoint{itemid,timestamp,value}`를 그대로 노출(D7상 Phase 1 불변). 캐노니컬 `SeriesPoint{epoch,value}`는 itemid/ISO-timestamp를 못 실음 → **`Series`에 nullable `nativeId`(소스 원시 시리즈 id=itemid) 추가**(EntityRef.nativeId=hostid 선례와 동일 원칙, proto 가법). 서비스가 `nativeId`+`Instant.ofEpochSecond(epoch)`로 HistoryPoint를 무손실 재구성. **참고: FE 타입은 `{timestamp,value}`뿐(itemid 미소비) — 스텝 4~에서 FE 협의 후 이 DTO를 `{timestamp,value}`로 정규화하면 nativeId 누수 제거 가능.**

**app측 부수 작업(스텝 3에도 재사용)**:
- `common.metric.CallerContexts.from(TokenUserInfo)`: 🔴 **admin 함정 해소** — admin은 zabbix 미연동(userid=null)이라 `JwtAuthFilter`가 super-admin으로 폴백. `userRole==ADMIN` 또는 userid 부재 → `CallerContext.system()`, 그 외 → `user(userid)`. 단위테스트 6종. **A군 전 서비스가 이 헬퍼로 컨트롤러 경계에서 변환**(서비스는 `CallerContext`만 받게).
- `GlobalExceptionHandler`에 **`EngineException` 핸들러 추가**: 포트 경로 예외를 원본 HTTP 계약으로 역매핑(UNAUTHORIZED→실제 401 / 그 외→200+body code+메시지 보존, §D8). ⚠️ 비-401 소스 오류의 body `code`는 원본 `ApiError` 상태와 정확히 같지 않을 수 있음(EngineException이 원 HttpStatus를 버림) — 401 구분과 메시지는 보존. 런타임에서 에러 경로는 미발생(해피패스만 실호출), 단위 구성으로 검증.

**스텝 3 확산 전 고칠/유의 목록**:
- **(성능) queryLatest/querySeries N+1**: 요약 1건이 메트릭마다 개별 `item.get`을 유발(메모리 요약 ≈4콜, 원본은 family search 1콜+로컬 findByKey). 어댑터에 **동일 호스트·다중 메트릭 배치 queryLatest**(1 item.get으로 여러 키 조회 후 분배)를 넣으면 disk/network(마운트·인터페이스 다수)에서 콜 폭증을 막는다. 스텝 3 착수 시 우선.
- **(카탈로그) 폴백 순서 vs 원본 정확키**: 원본은 대부분 정확 `filterKey`(폴백 없음)였다. 카탈로그 `MEMORY:size.used`[size[used]→used]·`MEMORY:pused`[size[pused]→pused]는 폴백이 원본과 다른 아이템을 고를 잠재 위험이 있으나, **이 환경 데이터 호스트(10696)는 양쪽 키가 모두 부재라 0으로 수렴 → 런타임 무회귀 확인**. modern-only 호스트가 등장하면(size[used] 존재+원본이 legacy `vm.memory.used`로 0 반환) 폴백이 실값을 찾아 divergence(=버그 수정) 가능 — 그때 재평가. 지금은 카탈로그 무변경.
- **(테스트) 커버리지 테스트**: 카탈로그 무변경이라 `ZabbixMetricCatalogCoverageTest` 그대로 green.

### 스텝 3a 완료 기록 (2026-07-23 — disk 갈아타기 + 배치 조회)

**결과**: `DiskService`에서 `ZabbixItemService/HistoryService/TrendService`·`ZabbixItemKey`·`getAuthToken` 전부 소멸(grep 0건). 전 모듈 빌드 green, 테스트 454→**460**(+6: 어댑터 배치·family·disk value_type 등). 런타임 검증(dev 5433 도커 DB + 실 Zabbix dmove.co.kr, admin/<마스킹>, :3099): 마이그레이션 전(c34afa3)/후를 **동일 고정 시간창**으로 채집·비교 — 라인차트(불변 history)·요약(빈 []) **byte-identical**, 상세/그룹현재(75 호스트 요약)는 **구조(마운트·호스트명·fstype·inodes 유무·filesystemCount·null성·순서) 완전 동일, live `lastvalue` 수치만 자연 drift**(캡처 11분 간격 — 스텝 2 CPU currentUsage 선례와 동종). 커버 경로: dependent(10084/10695/10696)·**size 폴백**(10652, fstype=null)·데이터 없음 혼재.

**배치 조회 설계 (Part 1)**:
- **어댑터 내부 배치**(포트 시그니처 불변): `querySeries/queryLatest/queryTrend`가 쿼리의 전 (엔티티×메트릭) 폴백 체인의 **정확 키를 모아 `filter.key_` 배열 1콜**(전 호스트), SEARCH 프리픽스는 프리픽스당 1콜로 받고, **로컬 체인 워크로 폴백 시맨틱 보존**(앞 키 있으면 채택, 없으면 다음). `ItemGetParams.filterKeys`(List) 신설로 지원. 단위테스트: 메모리 요약 4메트릭 → item.get **1콜**.
- **신규 포트 메서드 `queryLatestFamily(entities, familyRef)`**(D5 준수 시그니처 추가, proto 동기화): 마운트/디바이스처럼 차원 값을 사전에 모르는 **다차원 계열 전체를 계열당 1콜**로. 어댑터가 각 아이템 키를 `dims{partition,sub}`로 파싱해 서비스에 넘김(키 리터럴 파싱을 서비스→어댑터로 이관). 다중 엔티티 지원 → **그룹 현재값이 호스트 수와 무관하게 계열당 1콜**(N+1 원천 차단).
- **배치 효과 실측**(item.get 콜 수, 전 분석 / 후 실측): 상세 dependent 1/1·상세 size폴백 2/2·요약 2/1(빈 partition.list 단락)·**line-charts dependent-only(10696) 5타입 10/5**(폴백 정확키+dependent 2콜→체인 1콜, 절반)·**group-current 34호스트 2/2**(N+1 없음 확인).

**disk 키 → MetricRef 매핑**(요약): 라인차트 타입→`fs.pused/fs.total/fs.used/fs.free/fs.inode.pfree`(`{partition}`, **각각 `vfs.fs.size`→`vfs.fs.dependent.size` 필터 폴백 체인**을 카탈로그에 추가) / `iostat.*`·`dev.*`(`{diskname}`, 폴백 없음). 계열: `detail.master`=search `vfs.fs.dependent[`(JSON master) / `fs.size.raw`=search `vfs.fs.size[`(폴백 합성 소스) / `partition.list`=filter(lsblk 텍스트).

**폴백 3함정 처리 결과**:
1. **아이템 계열 이원화**(dependent[,data] JSON ↔ size 합성): `buildFilesystems`가 `queryLatestFamily(detail.master)` 우선, 빈 결과면 `queryLatestFamily(fs.size.raw)` 폴백 — 원본 로직 그대로, 입력만 포트화. 10652(size폴백 실호스트) 런타임 구조 동일 확인.
2. **dependent.size 계열 폴백**: 원본 `DiskService.toDependentKey`(서비스 내 폴백)를 **카탈로그 필터 체인으로 이관** — 라인차트가 캐노니컬 이름만 요청하면 어댑터가 `size→dependent.size` 순 해석. 10696(dependent-only) 라인차트 USAGE/USED/TOTAL/INODES 런타임 데이터 존재 확인(360포인트, byte-identical).
3. **DTO 키 파싱**: `vfs.fs.size` 마운트/서브 파싱을 어댑터 `parseFamilyDims`로 이관. **DTO(`DiskDetailResDto` 등)엔 잔존 키 의존 없음**(순수 필드 홀더). 서비스 잔존: sub 토큰 문자열 상수(`total/used/.../data`)·`FLOAT_TYPES`(라인차트 MB 변환 결정)·lsblk 텍스트 가공 — 모두 `ZabbixItemKey` 미참조(로컬), 태스크 허용 범위.

**⚠️ 유의/회귀 의심**:
- **value_type→history 테이블 유도의 라인차트 잠재 divergence**: 원본 라인차트는 타입별로 FLOAT/UNSIGNED를 **하드코딩**했고, 특히 `vfs.dev.*`(queue/await/rate/time)를 UNSIGNED로 강제 → 이 계열이 실제 FLOAT면 원본은 빈 결과(버그). 어댑터는 value_type로 테이블을 고르므로 **해당 계열이 존재하는 호스트에선 divergence(=버그 수정)** 가능. 이 환경 검증 호스트(10696)는 `iostat.*`·`vfs.dev.*`가 device `xvda`로 **부재 → 전/후 모두 0포인트, divergence 미발생**. size 계열(total/used=UNSIGNED, pused=FLOAT)은 원본 하드코딩과 일치 → 무영향. **iostat/vfs.dev 계열 실데이터 호스트 등장 시 재검증 필요**(회귀 의심 항목으로 명시).
- **요약 빈 partition.list 단락**: 원본은 `getByListKey` 2콜 후 [] 반환, 신규는 `queryLatestText(partition.list)` null이면 즉시 [](1콜). 출력 동일([]), 콜 1 감소. 단 partition.list 아이템이 존재하나 lastvalue=null인 극단 케이스는 원본이 `parseLsblkOutput(null)` throw, 신규는 [] — graceful 개선(무해, 명시).

**app측 부수**: 컨트롤러 경계에서 `CallerContexts.from(currentUser)` 변환(memory/cpu 선례). disk의 **호스트 이름/그룹 호스트 목록은 아직 레거시 `ZabbixHostService`(도메인 B 인벤토리, 스텝 4 InventoryPort 대상)를 authToken 직결** — 메트릭 읽기만 포트 경유(전이 상태, grep은 `ZabbixHostService` 미포함).

### 스텝 3b 완료 기록 (2026-07-23 — network·interface·session 갈아타기 + querySeries 내부 history 배치)

**결과**: `NetworkService`·`InterfaceService`(+`NetworkController`·`SessionController`·`InterfaceController`)에서 `ZabbixItemService/HistoryService/TrendService`·`ZabbixItemKey`·`getAuthToken` 전부 소멸(grep 0건, 두 서비스 파일). 전 모듈 빌드 green, 테스트 460→**473**(+13: NetworkServiceTest 9·InterfaceServiceTest +1·어댑터 배치/label 3). 런타임 검증(dev 5433 도커 DB + 실 Zabbix dmove.co.kr, admin/<마스킹>, :3099): 마이그레이션 전(13efe88)/후를 **동일 고정 시간창**(6h, 1h 전 종료)으로 채집·비교 — NetworkController·SessionController·InterfaceController 전 EP × 4호스트(10696/10695/10652/10084) = **24/24 응답 byte-identical**(라이브 currentUsage까지 동일 — 캡처 간격 내 미변동). net-summary는 리치(다중 iface eno1/eno2/eno3…, **따옴표 iface `"eno1"` 보존**, itemid 보존, 비-0 min/max/avg via bytesToKB).

**핵심 설계 — 어댑터 내부 querySeries history 배치(포트 시그니처 불변)**:
- 스텝 3a는 `queryLatestFamily`(최신값 계열 1콜)만 배치했다. network 요약·interface 라인차트는 **계열 발견 + 구간 history**가 동시에 필요한데(iface 사전 미지), `queryLatestFamily`는 history를 못 준다. → **`querySeries`가 여러 메트릭을 받으면 RAW history를 value_type 테이블별로 1콜, HOURLY_TREND는 1콜로 배치**하고 itemid로 분배하도록 어댑터 내부 변경(3a의 item.get 배치와 동형, **포트 시그니처·모델 shape 불변**). 단일 메트릭 소비자(cpu/memory/disk 라인차트)는 여전히 정확히 1 history.get(동작 불변, 기존 어댑터 테스트 그대로 green). 이로써 **새 포트 시그니처 없이** network 요약(iface×방향)·interface 라인차트(iface×oper/admin)의 N+1 history를 제거.
- 소비 패턴: 발견=`queryLatestFamily`(net.if.in/out 계열, ifOperStatus/ifAdminStatus 계열), 구간=`querySeries`(iface별 정확 키). 각 요약 ≈4 constant 콜(발견 2 + querySeries item.get 1 + history 1), iface 수 무관(N+1 없음).

**키 → MetricRef 매핑**:
- NETWORK: 요약 트래픽=`if.in`/`if.out`(`net.if.in/out[{iface}]`, **bps 원값** → 서비스가 bytesToKB로 표현만 변환), 발견=`if.in.family`/`if.out.family`(search `net.if.in`/`net.if.out`, **콤마 없는 항목만=트래픽**으로 채택해 errors/dropped/packets 부가지표 배제). 라인차트=`if.{in,out}.bytes`(BPS, bytesToKB)·`if.{in,out}.packets`(PPS, 원값). 세션=`session.family`(search `system.hw.session.num`)+`hw.session.num`.
- INTERFACE: 상태 발견=`oper.family`/`admin.family`(search `ifOperStatus`/`ifAdminStatus`), 라인차트 시계열=`oper.perif`/`admin.perif`(`ifOperStatus/ifAdminStatus[{iface}]`), 스칼라=`number`(`ifNumber`, queryLatestText)·`discovery`(`net.if.discovery`, queryLatestText). INTERFACE dimensionSource 추가(familyDimName="iface").

**카탈로그·포트·모델 보강 내역**:
- 카탈로그: NETWORK +5(`if.in`·`if.out`·`if.in.family`·`if.out.family`·`session.family`), INTERFACE +4(`oper.family`·`admin.family`·`oper.perif`·`admin.perif`) + INTERFACE dimensionSource. 기존 상수 커버리지 불변(추가는 상위집합, `ZabbixMetricCatalogCoverageTest` 그대로 green).
- **모델 1건**(불가피, D5 준수·proto 동기화): `LatestValue`에 nullable `label`(소스 항목 표시명) 추가 — 세션 요약 DTO(`SessionSummaryDto.name`)가 Zabbix item name을 노출(FE `useSessionsChart` 카드 title로 소비)해 D7 보존 필요. `Series.nativeId`(itemid, 스텝2)와 같은 "D7 보존용 nullable 소스 원시 필드" 원칙. 6-인자 편의 생성자로 기존 호출부·테스트 무변경. 어댑터 `queryLatest`/`queryLatestFamily`가 item.name으로 채움(FAMILY_OUTPUT에 name 추가).

**아이템 채택 집합 동일성(노이즈 필터)**: net.if 요약은 원본 `NET_IF_PATTERN`(net.if.in/out[iface], 콤마 없음)을 **어댑터 dims 파싱(sub==null) + 서비스 필터**로 재현 — search가 잡는 `net.if.in[eth0,bytes]`/`[,errors]` 등은 sub!=null로 배제. 런타임 net-summary iface 집합·itemid·순서 전/후 동일로 증명. 🔴 **value_type divergence 무발생 확인**: 원본은 net.if 요약/라인차트 history를 UNSIGNED 하드코딩했고 어댑터는 value_type 유도인데, net.if.in/out이 UNSIGNED(3)라 min/max/avg byte-identical(caution 해소).

**⚠️ 유의/회귀 의심**:
- **런타임 커버리지 공백(무회귀지만 미실증 경로)**: 가용 호스트가 전부 Zabbix **agent**형이라 (a) net.if.in/out**[iface,bytes/packets]** 라인차트, (b) `system.hw.session.num` 세션, (c) SNMP `ifOperStatus/ifAdminStatus/ifNumber/net.if.discovery` 인터페이스 — **셋 다 데이터 부재**(전/후 모두 빈 응답 → trivially identical). 이 경로들은 **단위 테스트로만 검증**(NetworkServiceTest BPS/PPS·session, InterfaceServiceTest status·라인차트 timestamp 집계). SNMP/세션/bytes-카운터 실데이터 호스트 등장 시 재검증 권장 — 특히 interface 라인차트의 timestamp 정렬(원본 clock-ASC 첫등장 순 ↔ 신규 TreeMap epoch 오름차순)과 value_type 유도.
- **세션 다중 항목 호스트**: `getSessionSummaries`가 항목명(label)은 `queryLatestFamily`, itemid/구간통계는 `querySeries`(호스트당 대표 1항목)에서 받아 호스트로 정합 — 호스트당 세션 항목이 여러 개인 예외에선 대표 1개로 수렴(원본은 항목별). 세션 수는 통상 스칼라라 실무 무영향. `getSessionHistories`의 `query.id`(특정 itemid 지정)도 통상 호스트당 1항목이라 querySeries 해석과 일치.

**스텝 3c(responsetime/items/livecheck/host-event) 주의점**:
- **responsetime**(icmppingsec/icmppingloss): 카탈로그 PING 도메인 등재됨(`sec`/`loss`). 요약이 history 통계면 스텝 3b의 querySeries 내부 배치가 그대로 적용. value_type 유도 전/후 비교 필수(ping은 FLOAT일 개연 — 원본 하드코딩 확인).
- **items**(host 임의 아이템 조회): 원본이 임의 key/family를 노출하면 캐노니컬 메트릭이 아닌 **패스스루** 성격일 수 있음 — MetricPort로 안 맞으면 억지 매핑 금지, 실소비자 shape 보고 판단(필요 시 4/5로 이관 검토·기록). 아이템 name/type 등 메타 노출 시 스텝 3b `LatestValue.label` 선례 재사용.
- **livecheck**: [[host-livecheck-feature]] — ping=BE 직접 OS ping(자빅스 아님), agent=자빅스 interface available. **메트릭 읽기가 아님**(item/history 미사용일 개연) → grep 대상 참조가 없으면 전환 대상 외일 수 있음. 착수 전 실제 ZabbixItemService/History 참조 여부부터 grep.
- **host-event**: system.hw.*basicinfo/service.*·log 계열(SYSTEM 도메인, 카탈로그 등재됨) — 대부분 텍스트/JSON lastvalue → `queryLatestText`. 이벤트성 목록이면 history보다 latest 위주.
- **재사용**: `filterKeys` 배치·`queryLatestFamily`·**querySeries 내부 history 배치**·`LatestValue.label`이 그대로 재사용됨. 새 포트 시그니처 추가 불필요 예상.

### 스텝 3c 완료 기록 (2026-07-23 — responsetime·host-event 전환 / items 보류 / livecheck 대상외 → **A군 종결**)

**서비스별 판정**(대상 4종):

| 서비스 | 판정 | 근거 |
|---|---|---|
| `ResponseTimeService` | **전환** | icmppingsec/icmppingloss = PING 도메인 sec/loss(카탈로그 등재). 순수 메트릭 읽기. |
| `HostEventService` | **부분 전환**(Item/History만) | SYSTEM 텍스트/로그(A군) + Problem/Host(B군) 혼합. Item/History 사용분만 전환, Problem/Host는 스텝 4로 잔존. |
| `ItemsService` | **전환 보류** | FE `custom_item` 위젯이 사용자가 고른 **임의 itemid**(`itemids="23296,23310"`)를 넘기는 **순수 패스스루**. 캐노니컬 MetricRef(domain+name)로 표현 불가 — MetricPort는 메트릭 카탈로그 기반이라 opaque itemid를 다루지 않는다. 억지 매핑 금지(태스크 지침). 스텝 4/5에서 "raw item-by-id" 별도 포트 여부 재평가. |
| `LiveCheckService` | **전환 제외(대상 외)** | 착수 전 grep 결과 `ZabbixItemService`/`ZabbixHistoryService` 참조 **0건** — BE 직접 OS ping + `ZabbixHostService.getRaw`(인터페이스 available)만 사용. 메트릭 읽기가 아니라 **B군 인벤토리(InventoryPort, 스텝 4)** 소관. 미변경(테스트 그대로 green). |

**결과**: `ResponseTimeService`·`HostEventService`(+두 컨트롤러)에서 `ZabbixItemService/HistoryService/TrendService`·`ZabbixItemKey`·(서비스 내)`getAuthToken` 소멸(grep: responsetime 4종+getAuthToken 0건 / host-event Item·History·Trend·ItemKey 0건 — `ZabbixProblemService`/`ZabbixHostService`·getInfo의 `authToken` 파라미터는 Problem/Host 경로라 잔존, 태스크 조정 기준 충족). 전 모듈 빌드 green, 테스트 473→**483**(+10: ResponseTimeServiceTest 5·HostEventServiceTest 5). 런타임 검증(dev 5433 도커 DB + 실 Zabbix dmove.co.kr, admin/<마스킹>, :3099, 고정 6h창): 전(7a9a5bb)/후 **5 EP × 14 호스트 = 70/70 응답 byte-identical**.

**키 → MetricRef 매핑**:
- **PING**(responsetime): 요약·라인차트 공통 `PING:sec`(`icmppingsec`)·`PING:loss`(`icmppingloss`). 요약은 `querySeries([sec,loss], RAW)` 1콜배치(어댑터 item.get 1 + FLOAT history 1)로 max/avg. 라인차트는 타입별 `querySeries` 1메트릭 → `HistoryPoint{itemid=nativeId, ISO(epoch), value}` 무손실 재구성.
- **SYSTEM 텍스트**(host-event basic-info/service-details): `hw.pci.basicinfo`·`hw.os.basicinfo`·`hw.basicinfo` / `service.regular`·`service.pkginfo`·`service.pstreeinfo`·`service.psinfo` → `queryLatest`(다중 메트릭 1콜 배치, `.raw()`로 텍스트 판독, 부재/원문 null → `N/A`). 원본 `getByListKey`(search 3~4키) 1콜과 동일 효율 — queryLatestText 개별호출(N+1) 대신 배치 채택.
- **SYSTEM 로그**(host-event logs): `log.messages`(`log[/var/log/messages,,,,skip,]`)·`log.secure`(`log[/var/log/secure,,,,skip,]`) → **신규 `queryRecentText`**(최신순 30, LOG value_type 유도).

**카탈로그 보강**: 없음 — PING(sec/loss)·SYSTEM(hw.*basicinfo·service.*·log.*)은 스텝 1에서 **이미 전부 등재**됨. `ZabbixMetricCatalogCoverageTest` 무변경 green.

**모델·포트 1건 추가**(불가피, D5 준수·proto 동기화 — 상세 §D5·§D4):
- **`queryRecentText(entity, metric, limit)` → `List<TextSample>`**: `queryLatestText`(단일 최신 텍스트)의 **다건(이력) 대응**. 로그 계열(LOG value_type)은 수치 `querySeries`(SeriesPoint=epoch,double)에도 단건 `queryLatestText`에도 담을 수 없어(값이 텍스트 로그 라인 30건), 텍스트-이력 능력이 필요했다. `TextSample(epoch, value, nativeId)` 신설(`SeriesPoint`의 텍스트 대응, nativeId=itemid로 LogEntry.itemid 무손실 보존). 어댑터가 `value_type`에서 history 테이블 유도(LOG/TEXT/CHAR, 원본 LOG 하드코딩과 일치)·`sortorder=DESC`·`limit`으로 조회.
  - ⚠️ **로그-도메인 설계와의 긴장(설계 검토 필요 항목)**: §1 비목표는 로그를 "메트릭 소스가 아닌 별도 도메인(`devdesign_log-domain.md` 예정)"으로 분리한다. `queryRecentText`는 Zabbix `log[]` 아이템의 텍스트 이력을 위해 MetricPort에 얹은 능력으로, 향후 로그-도메인 설계가 이 텍스트-이력 shape를 흡수/재정의할 수 있다(스텝 2가 FE DTO nativeId 정규화를 후속으로 미룬 선례와 동종). 단, 시그니처는 Map/제네릭 없이 D5 준수라 소스 중립(Loki/Prom 로그도 구현 가능)이며, 스트랭글러 목표(app→ZabbixItemService/History 직접결합 제거)엔 부합한다.

**⚠️ 유의/회귀 의심**:
- **value_type 유도 divergence(무발생 확인)**: responsetime 원본은 history를 **FLOAT 하드코딩**, 어댑터는 value_type 유도. 이 환경 유일 데이터 호스트 **10696**의 icmppingsec/loss가 **FLOAT(vt=0)** → 요약 max/avg·라인차트 360×2포인트·itemid(87156/87155) byte-identical(caution 해소). loss가 UNSIGNED인 소스가 등장하면 유도값이 실데이터를 찾아 divergence(=원본 하드코딩 버그 수정) 가능 — 회귀 의심 항목으로 명시.
- **host-event 런타임 커버리지 공백(무회귀지만 미실증)**: 이 환경 14호스트 전부 `system.hw.*basicinfo`/`system.service.*`/`log[]` 아이템 **부재** → basic-info=전부 `N/A`, service-details=`['N/A']`, logs=`[]`(전/후 trivially identical). 따라서 **queryLatest .raw 텍스트 판독·osVersion/osKernel 분할·queryRecentText 로그 매핑은 단위 테스트로만 실증**(HostEventServiceTest 5종). 실 SYSTEM/LOG 데이터 호스트 등장 시 재검증 권장 — 특히 로그 timestamp(DESC 정렬 유지)와 value_type 유도(vt=2→LOG).

### 🏁 A군 종결 회고 (2026-07-23 — 스텝 2·3a·3b·3c 통합)

**전환 완료(MetricPort 소비자)**: `MemoryService`·`CpuService`(스텝2) / `DiskService`(3a) / `NetworkService`·`InterfaceService`(+session/interface/network 컨트롤러, 3b) / `ResponseTimeService`·`HostEventService`(부분, 3c). 각 서비스에서 아이템 키 리터럴·`ZabbixItemService/HistoryService/TrendService`·`ZabbixItemKey`·`getAuthToken` 소멸(REST 응답 불변, 런타임 diff 무회귀).

**보류/제외 판정(A군 내 비전환)**:
- `ItemsService` — **전환 보류**(진짜 범용 패스스루, 임의 itemid). MetricPort로 표현 불가 → 스텝 4/5에서 "raw item-by-id" 포트 신설 여부 재평가.
- `LiveCheckService` — **대상 외**(B군 InventoryPort). item/history 미사용, `ZabbixHostService.getRaw`만.
- `HostEventService`의 Problem/Host 경로 — **부분 잔존**(B군 AlertPort/InventoryPort, 스텝 4).

**포트/모델 최종 표면**(A군이 실소비자로서 강제한 확장 — naive 스텝1 포트로는 값·shape 보존 불가였음): `MetricPort` = `querySeries`·`queryLatest`·`queryTrend`(스텝2 min/max/avg)·`queryLatestText`·`queryLatestFamily`(3a 계열배치)·**`queryRecentText`(3c 텍스트이력)**·`listDimensions`. 모델 추가: `TrendBucket`/`TrendSeries`(2)·`Series.nativeId`(2)·`LatestValue.label`(3b)·**`TextSample`(3c)**. 어댑터 내부: value_type→history 테이블 유도(2)·filterKeys 배치·querySeries history 배치(3b). **전부 D5 준수(Map/제네릭 없음, proto 동기화)**.

**레거시 Item/History/Trend/ItemKey 잔존 소비자(app측, 스텝 4 범위 산정 재료)** — grep `src/main/java` 제외 `/zabbix/`:
- `ZabbixItemService`: **HostService**(B군 2000줄 루트), **ReportService**(B군 리포트), **ItemsService**(A군 전환보류).
- `ZabbixHistoryService`: **HostService**, **ItemsService**.
- `ZabbixTrendService`: **HostService**, **ReportService**, **ItemsService**.
- `ZabbixItemKey`: **HostService**, **ReportService**(+정의 파일 `ZabbixItemKey.java` 자체 — 소비자 전멸 시 스텝 5 제거).
- ⇒ **A군 host-metric 읽기 서비스는 ItemsService 하나만 미전환**(패스스루 보류). 나머지 잔존은 전부 **HostService·ReportService(B군)** — 스텝 4의 InventoryPort/AlertPort 설계와 함께 갈아탈 때 이 3서비스가 최종 소비자. `ZabbixItemKey` 상수 파일과 레거시 15개 Zabbix 인터페이스·예외 커널은 스텝 5까지 존치.

**스텝 4 착수 시 주의점**:
- **InventoryPort/AlertPort 실소비자 우선**: `HostService`(host.get raw Map·hostid 중심)·`HostEventService.getInfo`(problem.get)·`LiveCheckService`(host.get selectInterfaces)가 첫 실소비자 — 이들의 실제 요구 shape를 보고 포트를 설계(추측 설계 금지, §D2/리스크표). `LiveCheckService`의 `getRaw(Map)` 인터페이스 사용은 D5 위반이라 InventoryPort가 이를 정규화해 흡수해야 함.
- **items 패스스루 결정**: 스텝 4에서 InventoryPort 설계 시 "임의 itemid의 history 조회"를 별도 능력(raw item access)으로 열지, 아니면 로그-도메인처럼 별도 트랙으로 둘지 결정. FE `custom_item` 위젯이 유일 소비자.
- **로그-도메인 vs queryRecentText**: 위 3c 유의 참조 — 로그 화면 신설(`devdesign_log-domain.md`) 시 `queryRecentText`/`TextSample`을 로그 도메인으로 승격/재배치할지 재평가.
- **value_type 유도 회귀 지속 감시**: A군 전반이 원본 하드코딩(FLOAT/UNSIGNED/LOG)을 value_type 유도로 대체했다. 유도가 실데이터를 더 정확히 잡는 divergence(=버그 수정)는 무해하나, 실 데이터 호스트(iostat/vfs.dev·SNMP·SYSTEM/LOG) 등장 시 전/후 재비교로 확인 권장.

### 스텝 4a 완료 기록 (2026-07-27 — Inventory/Alert 계약 신설 + livecheck 전환)

**산출물**: `InventoryPort.listHosts` / `AlertPort.countActive` + 모델 7종(`InventoryHost`·`HostQuery`·`HostNetworkInterface`·`InterfaceKind`·`Availability`·`AlertQuery`·`AlertSeverity`), 어댑터 2종(`ZabbixInventoryAdapter`·`ZabbixAlertAdapter`), 레지스트리가 두 포트 해석. `LiveCheckService`가 `host.get` 원시 Map → `listHosts`로 전환(Zabbix interface `type`/`available`/`main` → 중립 `InterfaceKind`/`Availability`/`primary` 정규화, authToken→`CallerContext`).

🔴 **프로세스 교훈 — 테스트 미갱신 푸시**: 4a 커밋(`3bb9e9c`)이 프로덕션 코드만 바꾸고 `LiveCheckServiceTest`·`ZabbixDataSourceRegistryTest`를 갱신하지 않은 채 푸시됐다. `compileTestJava`가 깨져 **전 스위트(483개)가 실행 불가** 상태로 원격에 올라갔다(프로덕션 코드 자체는 정상). `0cc29d3`으로 복구하며 테스트를 새 계약에 맞추고 검증 케이스 3개를 추가(486). A군 스텝들이 매번 테스트 수를 늘리며 green을 유지해온 것과 대비된다. → **포트 전환 커밋 전 `gradlew test` 확인을 절차로 고정할 것.**

### 스텝 4b 완료 기록 (2026-07-27 — home + host-event 포트화, `listActive` 신설)

**전환**:
| 서비스 | 내용 |
|---|---|
| `HomeService` | `safeAlarm`의 severity별 카운트 → `AlertPort.countActive`. 응답 키 `"0".."5"`는 `AlertSeverity.ordinal()`(중립 서열)로 산출 — Zabbix 코드와 항등이라 §D7 보존. **전이 상태**: infra/map/recentReports는 미전환 하위 서비스(`HostService`·`GeoClusterService`·`ReportManagementService`)에 authToken을 계속 넘긴다. |
| `HostEventService` | **완전 포트화**. problem 목록→`listActive`, 카운트 8회→`countActive`, 호스트명 해석→`InventoryPort.listHosts`. `ZabbixProblem`·`ZabbixHost`·`ProblemGetParams` import 전멸 = 이 서비스는 Zabbix 타입을 모른다. `List<Integer> severities` → `List<AlertSeverity>`. |

**계약 확장**: `AlertPort.listActive` + **`Alert` 모델 신설**(`nativeId`·`occurredAtMillis`·`resolvedAtMillis`·`severity`·`name`).
- ⚠️ **시각이 millis인 이유**(다른 모델의 `long epoch`=초와 다른 유일한 예외): Zabbix가 해소 시각을 `r_clock`(초)+`r_ns`(나노)로 쪼개 주고 기존 응답이 두 값을 **밀리초로 합성**한 값을 낸다. 초 단위 모델로는 정밀도가 소실돼 §D7이 깨진다. 발생 시각도 같은 단위로 맞춰 비대칭 제거.
- **엔티티 참조 없음**(§D2 스코프 절제): 첫 실소비자가 알람별 호스트를 쓰지 않고 조회 범위 호스트를 1회 해석해 전 항목에 적용한다. 알람별 호스트가 필요한 소비자(EventService 예상) 등장 시 필드 추가.
- **페이지네이션 없음**: 소비자가 소스가 제공하지 않는 기준(발생시각/응답시간)으로 정렬 후 슬라이스하므로 전량 반환. 필요 시 §D5(opaque token)로 확장.

**검증**: 전 모듈 **493 테스트 green**(486→493, `HostEventServiceInfoTest` 7건 신규 — 기존 테스트가 3c 전환분(텍스트/로그)만 덮어 `getInfo`는 검증 공백이었음). 런타임은 dev 프로필(5433 도커 DB, 실 Zabbix dmove.co.kr, 호스트 76대)에서 **stash 전/후 응답 6케이스 byte-identical**: 기본조회·`status=WARNING`·`keyword`·`DESC+limit`·빈결과(`DISASTER`)·알람0건 호스트, 그리고 `home/summary`(알람 984건, severity 0~5 전 등급 non-zero → `AlertSeverity` 왕복이 실데이터로 검증). home은 Redis 60초 캐시라 TTL 만료 확인 후 재계산 값으로 비교.

⚠️ **미검증 잔여**: `Alert.resolvedAtMillis`의 **millis 합성 경로는 실데이터로 확인되지 않았다** — `problem.get`이 활성(미해소) 알람만 반환해 실환경 표본이 전부 `r_clock=0`이었다(단위 테스트로만 검증). 해소 알람을 포함하는 소비자를 전환할 때 재확인할 것.
> 4c-1 후속 확인: `recent:true`(해소분 포함)를 쓰는 맵 라이브 집계를 전환했지만 **여전히 미검증**이다 — 그 응답은 개수/최악등급만 내보내고 해소 시각을 노출하지 않는다. 실검증은 해소 시각을 응답에 담는 소비자(`AssetService.resolveLive`의 openProblems=4c-2, `EventService`=4c-4)에서 가능하다.

### 스텝 4c-1 완료 기록 (2026-07-27 — 맵 라이브 집계 + 중복 통합)

**문제 인식**: `GeoClusterService`와 `NetworkArchitectureService`가 **로그 문구만 다른 동일 구현**(`fetchAvailability`+`fetchProblemAgg`+`resolveAvailable`, 각 ~65줄)을 따로 들고 있었다. 각각 포트로 바꾸면 중복이 그대로 남고 회귀 검증도 두 번 해야 한다.

**산출물**: `common/live/HostLiveAggregator`(app 레이어 공용 집계기) — `availabilityByHost(ctx, hostids)` / `problemAgg(ctx, hostids)`→`ProblemAgg(count, worstSeverity)`. 소스 장애를 흡수하는 **부분 실패 폴백**(빈 맵 / EMPTY)을 집계기 책임으로 이동해 원래 동작(라이브 배지 하나로 화면 전체가 죽지 않음)을 보존.

**포트 확장**: `AlertQuery.includeRecentlyResolved`(Zabbix `recent:true`) + `liveForEntities` 팩토리. 기존 4-인자 생성자는 **보조 생성자로 유지**해 4a/4b 호출부를 건드리지 않았다(record 필드 추가의 파급 차단).

**테스트 재배치**: 소비자 테스트(geo/network)는 집계기를 mock해 **조립만** 검증하고, 실제 판정(가용성 종합·최악 등급·폴백·recent 질의 전달)은 신규 `HostLiveAggregatorTest` 10건으로 옮겼다 — mock 뒤에 로직이 숨는 것을 막기 위함. 503 green(493→503).

**런타임 검증**(dev, 실 Zabbix): `/network-architectures/{1,7,8}/live`(호스트 2·4·2대, 활성 문제 2~3건, worstSeverity 실값)·`/geo-clusters/live`·`/geo-clusters/4/live` **5케이스 byte-identical**. `/home/summary`는 알람 총계가 989→990으로 1건 차이가 났으나 **실데이터 변동**으로 판정 — 근거: ①코드 변경 없이 같은 4b 코드에서 이미 984→989 변동을 관측 ②4c-1 코드로 3회 연속 호출 시 990 고정 ③infra·asset·map 등 나머지 필드 전부 동일.

⚠️ **dev 데이터 한계**: `geo_cluster`는 1건뿐이고 `linked_hostids`가 비어 있어(기존 [[geo-maps-feature]] 메모의 "자산 동기화 1회 필요"와 동일 상태) **geo 경로는 빈 입력 분기만 실행됐다**. 실제 집계 경로 검증은 network 3건이 담당.

### 스텝 4c-2 완료 기록 (2026-07-27 — 자산 라이브 정보 + `HostQuery.include`)

**핵심 설계 판단 — 선택 항목(`HostInclude`)**: 자산 라이브 패널은 그룹명과 마지막 수집 시각을 요구하는데, 후자는 Zabbix `selectItems`로 **호스트의 전 아이템을 끌어오는 무거운 조회**다. `listHosts`가 이를 항상 수행하면 직전에 만든 4c-1 맵 집계(호스트 수십 대 배치)가 그 비용을 그대로 떠안는다. → `HostQuery.include`(`Set<HostInclude>`)로 **소비자가 명시적으로 켜는** 구조를 신설했다. 인터페이스는 첫 소비자부터 항상 필요해 기본 포함(목록에 없음).

**모델 확장**: `HostInclude{GROUPS, LAST_CHECK}`, `HostGroupRef(nativeId, name)`, `InventoryHost.groups`/`.lastCheckEpoch`(초, nullable). 기존 3-인자 `InventoryHost`·2-인자 `HostQuery` 생성자를 **보조 생성자로 유지**해 4a/4c-1 호출부를 건드리지 않았다. `HostGroupRef`가 id+name을 함께 담는 이유: 자산 라이브는 name만 쓰지만 4c-3 동기화가 groupid를 요구하고, 이름은 소스에서 바뀔 수 있어 참조로서 짝이 자연스럽다.

**AlertPort 확장 없음**: 자산의 `openProblems`(eventid/name/severity/clock)가 4b `Alert` 모델로 그대로 표현됐다 — 4b의 모델 설계가 두 번째 소비자에서 재확인된 셈.

**중복 정리**: `resolveAvailable`이 asset에도 **세 번째 사본**으로 있어 집계기 판정을 `HostLiveAggregator.availabilityOf`로 노출해 재사용. 사용처가 사라진 `resolveLastCheck`·`isoFromEpoch`·`str` 제거.

**검증**: 506 green(503→506, 자산 live **성공 경로 테스트가 아예 없어서**(실패 폴백만 존재) 신규 3건으로 매핑·include 요청·recent 플래그를 덮음). 런타임(asset 78: 그룹 1개·문제 5건·lastCheck 실값 / asset 77: 호스트 미발견 경로) — **`openProblems` 5건 전건 identical**(severity 0·2·3·5 네 등급, clock 2025~2026 과거 이벤트), 나머지 필드 전부 일치. 유일한 차이 `lastCheck`는 **실시간 값**으로 확정(동일 코드 3회 연속 호출에 02:24:53→02:24:57→02:25:00로 매번 변동).

### 스텝 4c-4a 완료 기록 (2026-07-27 — HostService 첫 조각 + tags 계약)

**HostService 착수 전 실측(2193줄, 공개 메서드 15개, Zabbix 호출 42곳)** — 메서드별 호출을 매핑해 분할 축을 잡았다. 이 조사에서 **초기 분류가 두 번 틀렸음**이 드러났다:
- 처음엔 "기존 포트로 가능한 8개"로 봤으나, 실제로 필드 확장 없이 되는 건 `computeInfraKpi` 하나뿐이었다(나머지는 tags·technicalName·inventory·templates 등을 요구).
- 그 `computeInfraKpi`마저 제외됐다 — `calculateGroupHealthKpi`→`resolveHostStatuses`→**트리거 조회**로 연쇄되는데 트리거 계약이 아직 없다. 억지 전환은 `authToken`+`CallerContext` 동시 수신이라는 지저분한 전이 상태를 만든다.
- ⛔ **`detail`은 구조적으로 전환 불가에 가깝다**: 응답에 `interfaces`/`groups`를 **Zabbix 원시 Map 그대로** 실어 보낸다(`.interfaces(interfaces)`). 중립 모델 경유 시 `interfaceid`·`dns`·`port`·`useip`·`details` 손실 + Zabbix 코드값(`type="1"`) 역변환 복원이 필요해 §D7을 지키기 어렵다. → **별도 판정 대상**(D9와 유사한 "raw 노출" 유형. 응답 DTO를 못 바꾸는 한 포트화 실익이 없다).

**⇒ 4c-4a 범위 = `getDeviceTypeSummary` 1개**(다른 헬퍼에 의존하지 않는 독립 메서드).

**계약 확장**: `HostTag(name, value)` + `HostInclude.TAGS` + `InventoryHost.tags` + `tagValues(name)` 헬퍼. 태그는 Zabbix 전용이 아니라 Prometheus 라벨·Datadog 태그에 대응하는 **보편적 메타데이터**라 중립 모델에 담는 게 자연스럽다. 기존 3-인자/5-인자 `InventoryHost` 생성자를 보조 생성자로 유지해 4a·4c-1·4c-2 호출부 무변경.

**시맨틱 보존**: 분류 판정은 기존 `DeviceTypeResolver.resolve(values, codes)`를 그대로 호출한다(`resolveFromZabbixTags`가 하던 "device_type 태그 값 추출"만 `tagValues`로 대체) — 같은 필터·같은 함수라 "정확히 1개일 때만 유효" 규칙이 그대로다. `DEVICE_TYPE_TAG` 상수를 public으로 올려 포트 소비자와 공유.

**검증**: 510 green(506→510). 이 메서드는 **전환 전까지 테스트가 없었다** — 신규 4건으로 태그 분류·미분류 4규칙(태그없음/미지코드/중복태그/무관태그)·TAGS만 요청(무거운 `selectItems` 미점화)·레지스트리 동적화를 덮었다. 런타임: 그룹 2(서버 7대)·5(5대)·4(빈 집계) **3그룹 전부 identical**.

### 스텝 4c-4b 완료 기록 (2026-07-27 — `listGroups` 신설 + 그룹 목록 전환)

**계약이 두 형태를 모두 수용해야 했다**: 그룹 조회 소비자가 두 갈래다 — `getHostGroupsRaw`(groupid+name만, 3곳)와 `getZabbixHostGroupList`(**그룹별 소속 호스트 목록까지**, 1곳). → `InventoryGroup(ref, name, hosts)` + `GroupQuery(groupIds, includeHosts)`로 신설. `selectHosts`는 그룹 수만큼 멤버를 끌어오는 비용 조회라 `HostQuery.include`와 같은 취지로 **옵트인**.

**`HostGroupRef` vs `InventoryGroup` 구분**: 전자는 *호스트가 속한 그룹을 가리키는 가벼운 참조*(`InventoryHost.groups`, 4c-2), 후자는 *그룹 자체를 조회한 엔티티*(멤버 목록 보유 가능). 이름이 비슷해 섞이기 쉬워 양쪽 javadoc에 상호 참조를 남겼다.

**전환**: `getHostGroup`(그룹 목록 화면)이 **완전 전환**됐다 — 그룹 조회(`listGroups`) + 호스트 조회(`listHosts` groupIds×TAGS×GROUPS) 둘 다 포트로 덮인다. `buildHostsByGroup`도 `InventoryHost` 기반으로 이관(이 메서드 전용 헬퍼라 안전).

🔴 **시맨틱 함정 — 기기분류 집계가 두 종류다**: `getCategoryCountsFromTags`(그룹 목록/상세용)는 **`DeviceTypeResolver`를 쓰지 않는다**. 자체 로직이며 규칙이 다르다 — device_type 태그 1개면 **유효 코드 검증 없이 값을 소문자로 그대로** 쓰고(미지 코드도 통과해 acc에 새 키로 쌓이나 응답은 고정 7종만 꺼내므로 결과적으로 어디에도 안 잡힘), 2개 이상이거나 없으면 notClassified. 반면 4c-4a에서 전환한 `getDeviceTypeSummary`는 레지스트리 유효 코드 검증을 거친다. **같은 "기기분류 집계"로 보여 통일하고 싶어지지만 응답이 바뀐다(§D7 위반)** → 포트 버전(`getCategoryCounts`)에 기존 로직을 그대로 옮기고 코드 주석과 테스트로 고정했다("정상화하지 말 것").

**검증**: 516 green(510→516). `getHostGroup`도 **전환 전 테스트가 없어** 신규 6건으로 N:N 분배(한 호스트가 여러 그룹)·빈 그룹 유지·대문자 소문자화·중복/미지 태그·포트 질의 형태·그룹 0개 시 호스트 미조회를 덮었다. 런타임: 그룹 **30건 전체 목록 identical**(최대 호스트 40대 그룹 포함), 키워드 필터도 동작 확인.

### 스텝 4c-4c 완료 기록 (2026-07-27 — 상태 판정 전환, **트리거 포트를 만들지 않은 판단**)

🟢 **핵심 판단 — 트리거 계약을 신설하지 않았다**: `resolveHostStatuses`가 `trigger.get`을 쓰는 이유를 파고들었더니 "이 알람이 어느 호스트 것인가"를 알아내기 위해서였다 — Zabbix `problem.get`은 결과에 hostid를 주지 않고 `objectid`(triggerid)만 준다. 즉 트리거는 **목적이 아니라 우회 경로**다. → 트리거 읽기 포트를 만드는 대신 **`Alert.entities`를 옵트인으로 추가하고 2단 조회(problem.get → trigger.get selectHosts)를 어댑터 내부에 숨겼다**. 소비자는 "알람의 호스트"만 알면 되고, 소스가 그걸 어떻게 주는지는 어댑터 사정이다(다른 소스는 알람에 엔티티가 직접 실려 오면 1단으로 끝난다).

**계약 확장**: `Alert.entities`(**리스트** — 하나의 트리거가 여러 호스트를 참조할 수 있어 단일 참조면 시맨틱이 깨진다. 기존 코드도 `problemHosts.contains(hostId)`로 다중 매칭했다) + `belongsTo()` 헬퍼, `AlertQuery.includeEntities`(2단 조회 비용 옵트인) + `AlertQuery.groupIds`(그룹 단위 알람).

**부수 효과 — 테스트가 단순해졌다**: 기존 테스트는 `problem.get`+`trigger.get` 두 mock으로 triggerid 역매핑을 재현해야 했으나, 이제 `alert("e1", WARNING, "h1")` 한 줄이면 된다. Zabbix의 2단 조회 사정이 도메인 테스트에서 사라진 것이 계약 분리의 실질 이득이다.

**전이 상태 처리**: 호출 체인 5개 메서드(`computeInfraKpi`·`getHostGroupDetail`·`getGroupTopHosts`·`getHostNetwork`·`getServers`)가 authToken과 CallerContext를 둘 다 필요로 해 **`TokenUserInfo` 하나를 받아 내부에서 둘 다 뽑는** 형태로 통일했다(파라미터 증식 회피). authToken이 완전히 사라질 때 `CallerContext`로 교체만 하면 된다.

**검증**: 516 green. 런타임은 **마지막 커밋(4c-2) 대비 4c-4a·b·c 합산 비교**:
- `top-hosts`(status/healthValue/activeAlarmCount)·`hostgroups`(30건)·`device-type`·`home.infra`(healthScore 9.9) **전부 identical** — 76대 호스트의 상태 판정이 전환 전후 완전히 같다.
- 그룹 상세는 `alerts{normal:0,warning:10,critical:33}`·`availability 15.0`·`healthScore 11.75`·`statusCounts` 4등급 전부 일치.
- 차이는 `cpuUsage`·`memoryUsage`·`diskUsage` **실시간 메트릭 값뿐**이며, 이번 전환은 메트릭 조회 경로를 전혀 건드리지 않았다(기기분류·그룹·상태 판정만 변경). 이 세 필드를 제외하면 두 응답이 완전 동일함을 확인.

### 스텝 4c-4d 완료 기록 (2026-07-27 — KPI·상태 계열 + 공유 헬퍼)

**전환**: `computeInfraKpi`·`getHostGroupDetail`·`getGroupTopHosts`·`getGroupResourceTrend`(현재 모델로 충분한 4개) + 공유 헬퍼 5종 — `isHostAvailable`(Zabbix `available="1"` 문자열 비교 → `Availability.AVAILABLE`), `calculateGroupHealthKpi`, `resolveInterfaceHealth`(type 코드 집합 → `Set<InterfaceKind>`), `getHostItems`, `getCategory`. **host.get 직접 호출 12→8곳.**

**남은 8곳은 전부 "모델 확장 없이는 못 가는 것"으로 정리됐다**(현재 계약으로 가능한 건 이번에 소진):
| 메서드 | 필요한 것 |
|---|---|
| `detail` | ⛔ raw 노출(별도 판정, 4c-4a 기록 참조) |
| `getCollectedInfo` | templates·items 메타 |
| `getInterfaceGraphData`·`getInterfaceDetails` | **interfaceid**(모델에 없음) |
| `getHostGroupDetailProblems` | 이벤트 이력·트리거 |
| `getHostNetwork` | 호스트 **status** |
| `getServers`(fetchHosts) | inventory(os·model) |

🔴 **기기분류 판정이 세 변종이다(부채 확정)**: 이번에 `getCategory`가 세 번째임을 확인했다 —
| 위치 | 규칙 |
|---|---|
| `getDeviceTypeSummary` | 레지스트리 유효 코드 **검증** |
| `getCategoryCountsFromTags`/`getCategoryCounts` | 검증 없이 소문자화, **정확 일치** 키 |
| `getCategory` | 소문자화 후 카테고리명 **부분 일치(contains)** |
같은 `device_type` 태그를 읽으면서 규칙이 셋 다 다르다. 통일하면 응답이 바뀌므로(§D7) 전부 그대로 이관하고 각각에 "통일하지 말 것" 주석을 달았다. **포트 전환 종료 후 별도 과제로 정리 검토**(FE 영향 확인 → 계약 변경 합의 필요).

**검증**: 516 green. 런타임(4c-2 커밋 대비 4c-4a~d 합산): `top-hosts` **identical**, `home.infra` healthScore 9.9 **identical**, 그룹 상세는 `safetyPercentage`·`alerts`·`totalHosts`·`server`·`notClassified`·`availability`·`healthScore`·`statusCounts`·`recentEvents` **전 필드 일치**(차이는 `cpu/mem/diskUsage` 실시간 메트릭뿐 — 메트릭 경로 미변경).

### 스텝 4c-5b 완료 기록 (2026-07-27 — `AlertRule` 신설, 파일럿 `getEventBells`)

**판단: 트리거 읽기 포트가 아니라 `AlertRule`(알람 규칙)** — 조사에서 트리거 사용처가 두 부류로 갈렸다:
| 용도 | 쓰는 속성 | 판정 |
|---|---|---|
| 알람 목록·상세(3곳) | 규칙 이름(description)·활성여부(status=0)·걸린 호스트/그룹 | ✅ 중립화 — 어느 소스에나 있는 개념 |
| `getTriggerDetail` | expression·recovery_expression·manual_close·eventGeneration | ⛔ **§D2가 이미 판정한 Zabbix DSL** → 스텝 5 |
후자를 스텝 5로 떼어내니 `AlertRule`은 5필드짜리 얇은 모델로 충분해졌다 — A안(규칙 개념 도입)을 택한 결정적 근거.

**모델**: `AlertRule(nativeId, name, enabled, entities, groups)` + `NamedEntity(ref, name)`(표시명이 필요한 자리에서 소비자가 별도 조회를 하지 않도록 — `HostGroupRef`가 그룹에 대해 하는 역할과 동일). `Alert.rule`(옵트인) + `AlertQuery.includeRule`.

🔴 **`Alert.resolved`를 `resolvedAtMillis`와 별개 필드로 둔 이유**: Zabbix는 해소 <b>여부</b>를 `r_eventid`(복구 이벤트 존재)로, 해소 <b>시각</b>을 `r_clock`으로 준다 — 원본도 `isResolved`(r_eventid)와 `resolutionTimeOrPending`(r_clock)을 각각 봤다. `resolvedAtMillis != null`로 퉁치면 한쪽만 채워진 상태에서 시맨틱이 어긋난다.

**파일럿 선정**: `getEventBells`가 `getEventProblems`보다 단순하다 — **`filter{status:0}`(비활성 규칙 제외)이 없고**, `selectAcknowledges`를 요청하지만 실제로 쓰지 않는다. 계약 검증에 적합.

**전환 효과**: 서비스 코드에서 `objectid`(triggerid)라는 Zabbix 개념이 사라졌다. problem→trigger 2단 조회와 수동 매핑(약 15줄)이 어댑터로 이동.

**검증**: 516 green. 런타임 `/event/bells` **완전 identical** — 이 EP는 규칙에서 온 호스트명으로 그룹핑하고 정렬·페이징하므로 값이 하나만 어긋나도 구조가 무너진다: `total`(호스트그룹 11)·`totalUnRead`(108)·**11개 그룹 각각의 호스트명과 이벤트 수(32/28/28/5/2/1/1/1/2/3/5) 전부 일치**.

⚠️ **전이 상태**: `getStatusCounts`가 아직 레거시 Map 경로라 같은 필터를 `AlertQuery`와 Map 양쪽으로 유지 중. 4c-5c에서 정리.

### 스텝 4c-5a 완료 기록 (2026-07-27 — EventService 착수 + **`resolvedAtMillis` 실검증 달성**)

**착수 조사에서 계약 방향이 바뀌었다**: `EventService`의 `event.get` 6곳을 "이벤트 이력 조회(`listHistory`)"로 예상했으나, 실제로는 **5곳이 `eventids` 지정 조회**였다(나머지 1곳 `getEventListPreviousId`만 `objectids`+`eventid_till` 이력 조회). → 무거운 `listHistory` 대신 **`AlertQuery.nativeIds`** 하나로 5곳이 열린다.

**어댑터가 API를 분기한다**: `nativeIds`가 지정되면 `problem.get`이 아니라 **`event.get`**을 탄다 — `problem.get`은 *활성* 알람만 돌려주므로 이미 해소된 알람의 해소 시각을 읽을 수 없다. 소비자는 "이 id들의 알람을 달라"고만 하고 어느 Zabbix API를 쓰는지는 어댑터가 정한다(4c-4c의 2단 조회 흡수와 같은 원칙).

🔴 **시맨틱 차이 발견 — 같은 "해소 시각"을 두 서비스가 다르게 계산한다**:
| | 미해소일 때 | 정밀도 |
|---|---|---|
| `HostEventService.getInfo`(4b 전환) | **null** | 밀리초(r_clock×1000 + r_ns/1e6) |
| `EventService.getREventsMap` | **발생 시각(clock)으로 폴백** | 초 |
`Alert` 모델로 둘 다 표현된다 — 후자는 `resolvedAtMillis ?: occurredAtMillis` 후 `/1000`. 나노 합성분은 초 변환에서 소실되나 원본도 `r_clock`(초)만 썼으므로 **동일 값**이다.

**검증(핵심)**: 516 green. 런타임 `/event/182242791/list-previous?triggerId=39114` **전/후 identical** — 응답 8건에 **미해소 폴백 1건(null)과 해소 7건**이 함께 담겨 두 경로를 한 번에 덮는다(해소 시각 예: `2025-10-16T09:03:36.000Z` 등 전부 일치). **4b부터 세 스텝을 끌어온 미검증 항목이 여기서 종결됐다.**

### ⏸ 스텝 6 착수 가이드 (2026-07-28 보류 — 재개 시 여기서 시작)

**사용자 결정으로 지금은 착수하지 않는다.** 스텝 0~5가 완결된 상태(app→engine-zabbix 컴파일 차단 완료)라
언제 재개해도 안전하다. 아래는 재개 시점의 판단 재료다.

#### 이 스텝의 목적은 "연결"이 아니라 "검증"이다

§리스크 표가 **"정규화 모델의 Zabbix 오염(1개 소스만 보고 설계)"** 의 완화책으로 이 스텝을 잡아 뒀고,
그 항목에 **"모델 수정 예산 확보"** 가 함께 적혀 있다. 즉 **계약이 깨질 것을 전제한 단계**다.
안 맞는 것이 나오면 실패가 아니라 **발견**이며, 계약을 고치면 **Zabbix 어댑터도 함께 고쳐야 한다**.
Prometheus를 둘째 소스로 고른 이유도 같다 — "무료·로컬 docker·API 단순 → 설계 오류를 가장 싸게 드러냄".

#### 세 덩어리로 쪼개서 하라 (①만 먼저)

| 덩어리 | 내용 | 왜 쪼개나 |
|---|---|---|
| **①** | Prometheus 어댑터(포트 3개 구현) | **여기서 계약이 깨지면 ②③은 다시 짜야 한다** → 반드시 먼저 |
| **②** | 레지스트리 DB화(Flyway V14+) · `/datasources` EP | Prometheus 자체와 무관한 "다중 소스 운영" 인프라 |
| **③** | FE 소스 선택 UI + capability 게이팅 | ⚠️ **Phase 1 내내 FE 무변경이었는데 여기서 처음 FE 작업이 생긴다** |

#### 포트별 난이도 전망 (착수 전 가설 — 실검증 대상)

| 포트 | 전망 | 근거 |
|---|---|---|
| `MetricPort` | 🟢 잘 맞을 것 | PromQL로 대응 가능. 계열/트렌드도 라벨·`rate()`로 표현 |
| `InventoryPort` | 🔴 **가장 위험** | Prometheus엔 호스트 인벤토리 개념이 없다 — `up` 메트릭의 `instance`/`job` 라벨 정도. `interfaces`·`osName`·`enabled`·`tags` 대응이 애매하다(§D9가 이미 "Prometheus·Datadog에는 host inventory가 없다"고 인정) |
| `AlertPort` | 🟡 별도 시스템 | Alertmanager는 **다른 API**다. `acknowledge`도 Zabbix ack ↔ Alertmanager **silence**로 개념이 다르다(§D10의 쓰기 계약이 여기서 시험된다) |
| Zabbix 전용(`zabbix/`) | ⛔ 대응 없음 | 설계대로 capability로 꺼진다 — **이게 예상대로 되는지 확인하는 것도 검증 항목** |

#### 선결 조건

1. 🔴 **proto enum `SYSTEM` 중복 해소** — `MetricDomain`(=8)과 `CallerRole`(=1) 양쪽에 있다.
   proto3는 enum 값이 **패키지 스코프**라 codegen 시 충돌한다. 한쪽에 접두어를 붙일 것.
2. **테스트용 Prometheus 인스턴스** — 로컬 docker + `node_exporter` 정도. Alertmanager는 ③ 시점에.
3. 스텝 4의 판정 보류 항목들이 여기서 재논의될 수 있다:
   - §D9 재논의 트리거 — "Zabbix 없는 배포에서도 자산 목록이 필요하다"는 요구가 생기면
     인벤토리 스냅샷이 아니라 **자산 도메인 자체를 소스 독립으로 재설계**하는 별개 과제
   - `Alert.tags` 신설 — 태그는 **Prometheus 라벨·Datadog 태그에 대응**하므로 중립화 가능
     (`getHostGroupDetailProblems` 판정과 함께 다룰 것)

#### 검증 방식이 스텝 1~5와 다르다

Phase 1은 **"REST 응답 불변"**(§D7)이 기준이었고 런타임 전/후 비교가 그물이었다.
스텝 6은 **새 소스에서 화면이 성립하는가**가 기준이라 전/후 비교가 성립하지 않는다.
→ Zabbix 경로의 **무회귀**(기존 비교 인프라 재사용)와 Prometheus 경로의 **신규 검증**을 분리해서 볼 것.

---

### 🚩 다음 착수 가이드 (2026-07-28 실측 — 4c-4l~ 시작점, 4c-4j·4c-4k 반영)

**전환 대상은 2파일뿐이다**: `HostService`(8메서드) · `ReportService`(1메서드). 나머지 6파일은 판정 완료(⛔) 또는 스텝 5 이동(⬜)이다.
**남은 것은 사실상 두 덩어리다 — 이벤트 이력 질의(난제 1, 4곳)와 인터페이스 계열(난제 2, 2곳).**

#### HostService 잔여 — 메서드별 요구사항

| 메서드 | 소스 호출 | 필요한 것 | 난이도 |
|---|---|---|---|
| `fetchHostItemsMap` | item(6키: cpu.util·mem.utilization·fs.pused·if.in·if.out·proc.num) | ⚠️ **키 문자열을 Map 키로 쓰고 `contains("bytes")`로 필터**한다 — 중립 모델로는 그 패턴 매칭이 사라지므로 `queryLatestFamily`(NETWORK 계열) + dims로 재구성해야 한다 | 중 |
| ~~`getHostNetwork`(잔여 1곳)~~ | ~~item(`net.if.in[` 개수)~~ | ✅ **4c-4j 완료** — `listDimensions`(호스트당 1콜)가 아니라 `queryLatestFamily`(전 호스트 1콜)로 갔다. 카탈로그 `NETWORK:if.in.perif.family` 신설 | — |
| ~~`getGroupResourceTrend`~~ | ~~item + trend~~ | ✅ **4c-4k 완료** — `queryTrendFamily`+`ChainMode` 신설, `ResourceTrendQuery` 공용화 | — |
| `getInterfaceGraphData` | item(if.in/out) + history×2 | 🔴 **itemid가 필요**하다(`LatestValue`엔 `nativeId`가 없다 — `Series`에만 있다) | 대 |
| `getInterfaceDetails` | item(9키) + history | 🔴 위와 같고 **`interfaceid`와 아이템 `name` 파싱**(정규식으로 인터페이스명 추출)까지 요구 | 대 |
| `getProblemsByHostGroup` | event.get | 🔴 **이벤트 이력**(아래 공통 난제 1) | 대 |
| `getGroupAlertTrend` | event.get ×2 | 🔴 위와 같음. 시간 버킷별 집계 | 대 |
| `getHostGroupDetailProblems` | hostgroup + host + event×2 + trigger | 🔴 가장 큼. 이벤트 이력 + `opdata`(D11이 Zabbix 전용 확정) 얽힘 → **부분 전환 또는 보류 판정 필요** | 대 |
| `detail` | host.getRaw + item | ⛔ raw Map 노출(4c-4a 판정) |  |
| `getCollectedInfo` | host.getRaw(templates·items 메타) | ⛔ 스텝 5(4c-4f 판정) |  |

#### ReportService 1곳

| 메서드 | 소스 호출 | 비고 |
|---|---|---|
| `summarizeAlerts` | event.get | 이벤트 이력(공통 난제 1). **이것만 전환하면 `ReportService`에서 `authToken`이 소멸한다** |
| ~~`summarizeMetric`~~ | ~~item + trend~~ | ✅ **4c-4k 완료**(`ResourceTrendQuery`) |
| ~~`computeReport`~~ | ~~host.getRaw~~ | ✅ **4c-4j 완료**(`listHosts`) |

#### 🔴 공통 난제 1 — 이벤트 이력 질의가 없다

`getEventsRaw`/`getEvents`가 **4~5곳**에서 쓰인다(HostService 3·ReportService 1). 4c-5d의 `AlertHistoryQuery`는 **`ruleNativeId` 필수**(규칙 기준)라 맞지 않는다 — 이들은 **시간창 + 그룹/호스트 기준**으로 이력을 훑는다.

선택지:
- (a) `AlertHistoryQuery`의 `ruleNativeId`를 nullable로 완화 + `entities`/`groupIds`/`range` 추가 → 한 타입이 두 질의를 겸함
- (b) 별도 질의 타입 신설
- ⚠️ (a)를 고르면 "무제한 이력 스캔 방지"라는 원래 제약(4c-5d 문서)이 풀린다 — `limit` 필수화 등 다른 안전장치가 필요하다.

**이력 질의를 어떻게 정의하느냐가 남은 작업의 절반을 좌우한다.** 여기부터 설계할 것.

#### 🔴 공통 난제 2 — `LatestValue`에 `nativeId`가 없다

인터페이스 계열 2곳이 itemid로 history를 다시 조회한다. `Series`에는 스텝 2에서 `nativeId`를 추가했지만(라인차트 identity 보존) `LatestValue`에는 없다. 인터페이스 화면을 전환하려면 같은 필드가 필요하다 — **추가 자체는 작지만(가법), 그러면 소비자가 itemid로 별도 조회를 이어가게 되어 "포트 뒤로 감춘다"는 목적이 반만 달성된다.** 어댑터가 history까지 묶어 주는 편이 나은지 함께 판단할 것.

#### ✅ 공통 난제 3 — 계열 트렌드 조회 (4c-4k에서 해소)

`queryTrendFamily` + `ChainMode(UNION)` 신설로 해결했다. 딸려 있던 판단 두 개의 결론:
1. **합집합이 맞았다** — 폴백이면 두 철자가 섞인 그룹에서 한쪽 호스트군이 통째로 빠진다(dev 실측 확인).
   다만 UNION은 중복 제거를 하지 않으므로 **패턴 상호 배타성이 등록 조건**이다.
2. **정규식 → dims 조건 이관은 실 키 집합을 먼저 훑어야 했다** — 추측한 규칙(`sub==null`)이었다면
   `net.if.in.discards[…]` 100건이 트래픽에 섞였다. 프리픽스의 `[` 하나가 그 경계다.

부수 소득: cpu·memory는 애초에 계열이 아니라 **정확 키 여러 개**였다(원본 필터가 exact match).
자세한 내용은 아래 "스텝 4c-4k 완료 기록".

#### 착수 순서 제안 (4c-4k 반영)

1. ~~`computeReport` + `getHostNetwork` 잔여~~ ✅ 4c-4j
2. ~~`queryTrendFamily` → `summarizeMetric` + `getGroupResourceTrend`~~ ✅ 4c-4k
3. **이벤트 이력 질의 설계**(난제 1) → 그 위에 `summarizeAlerts`·`getProblemsByHostGroup`·`getGroupAlertTrend`.
   **`summarizeAlerts`부터 하면 `ReportService`가 완전히 전환된다**(authToken 소멸) — 가장 짧은 완결선
4. **인터페이스 계열 2곳**(`getInterfaceGraphData`·`getInterfaceDetails`) — 난제 2 판단 후.
   4c-4k가 만든 `queryTrendFamily`처럼 **"계열 + history를 어댑터가 묶는" 방향**이 유력하다
   (`LatestValue.nativeId` 추가는 itemid 조회를 소비자에 남겨 목적이 반만 달성된다)
5. `getHostGroupDetailProblems`는 마지막(또는 보류 판정 — `opdata` 얽힘)
6. `fetchHostItemsMap`은 §D7 위험이 낮지 않다 — 4c-4k의 dims 이관 방식을 그대로 쓰되
   **실 키 집합 대조를 먼저** 할 것

> 남은 것은 전부 "계약을 새로 만드는" 일이다. 4c-4j까지가 기존 계약으로 되는 것의 끝이었고,
> 4c-4k가 그 다음 계약(계열 트렌드)을 하나 만들었다.

---

### 스텝 5 완료 기록 (2026-07-28 — Zabbix 계약 이동 + 컴파일 의존 차단)

**예상보다 훨씬 작게 끝났다.** 착수 전 추정은 "C군·D군·잔여·차단 4개 하위 스텝"이었는데 실제로는
**이동 2번**으로 끝났다. 이유는 아래 판단 하나다.

🟢 **패키지명을 유지하고 모듈만 옮겼다 → import 변경 0건**: `com.dmove.moveseye.zabbix.*`를 그대로 둔 채
파일을 `engine-zabbix` → `engine-api`로 옮기니 **app 코드가 한 줄도 안 바뀌었다**(git이 48개 전부
`rename (100%)`로 인식). 패키지명을 `engine.zabbix.*`로 바꿨다면 42개 파일의 import를 고쳐야 했고
diff에 실제 변경과 이동이 섞였을 것이다. **"어디에 두느냐"와 "뭐라 부르느냐"는 다른 결정이고,
후자를 건드리지 않으면 전자는 공짜에 가깝다.**

**결과 구조**:
| 모듈 | 내용 |
|---|---|
| `engine-api/engine/` | 소스 중립 계약(MetricPort·InventoryPort·AlertPort + 정규화 모델) |
| `engine-api/zabbix/` | 🟠 Zabbix 전용 계약 48개(인터페이스 14 + model 31 + spi 3). **추상화 없음** — §D2가 "관리 화면 CRUD·아이덴티티는 소스 공통화 불가능"으로 판정한 C·D군의 집 |
| `engine-api/common/exception/` | 레거시 예외 커널 4개(app 레거시이지 엔진 계약이 아니다) |
| `engine-zabbix` | 구현만 28개(Impl·Adapter·client·session·metric) |

🔴 **§D8 판정을 뒤집었다 — 스텝 5의 목표와 양립 불가였기 때문**: D8은 예외 커널을
"`HttpStatus` 결합이라 engine-api로 못 올라감 → engine-zabbix 존치"로 판정했다. 그런데 app 30여 파일이
이 예외를 쓰므로 **커널이 engine-zabbix에 있는 한 컴파일 의존을 끊을 수 없다**. 둘 중 하나를 바꿔야 했고:
- (a) engine-api에 `spring-web` 추가(enum 하나) — 채택. 계약 변화 0.
- (b) `HttpStatus` → `int` — **`403 → HTTP 200` 보존 로직**(주의사항 #1)을 건드려 회귀 위험이 크다.
**"원칙이 목표를 막으면 원칙의 비용을 재본다"** — 여기서는 순수성보다 차단이 값졌다.

✅ **차단이 실제로 작동하는지 증명했다**: `runtimeOnly`로 내린 뒤 app 프로덕션 코드가 **무수정으로
컴파일됐다**(= 구현 참조가 이미 0건이었다는 증거). 이어서 engine-zabbix 타입을 참조하는 프로브 클래스를
app에 넣어 `package ... does not exist`로 빌드가 깨지는 것까지 확인하고 제거했다.
**"차단했다"는 컴파일 성공이 아니라 <b>의도한 것이 깨지는지</b>로 증명해야 한다.**

ℹ️ 테스트는 `testImplementation`으로 열어 뒀다 — `ZabbixMetricCatalogCoverageTest`처럼
"app 상수 ↔ engine-zabbix 매핑"을 교차 검증하는 테스트가 있다. 막을 대상은 프로덕션 코드다.

⚠️ **남은 정리(후속)**: `ZabbixItemKey`(app `common/constants`)가 아직 `HostService` 1곳에서 쓰인다 —
설계서가 "소비자 전멸 시 제거"로 남긴 항목이고, 그 1곳은 4c-4n에서 보류 판정된 인터페이스 경로다.
`zabbix/manage`(app의 C군 REST 레이어 61파일)와 `zabbix/sync`는 app에 그대로 둔다 — 이들은 REST/JPA
레이어라 engine 모듈로 갈 수 없고(스타터 금지), 이제 engine-api 계약만 참조하므로 차단 기준을 만족한다.

### 스텝 4c-4n 완료 기록 (2026-07-28 — 서버 목록 사용률 전환 + 인터페이스 보류 판정)

**전환: `fetchHostItemsMap`** — 원본은 아이템 키 문자열을 Map 키로 쓰고 소비 지점에서
`contains("bytes")`로 걸렀다(§다음 착수 가이드가 "중립화 시 재구성 필요"로 표시했던 자리).
정확 키 4종은 `queryLatest` 한 콜로, 트래픽은 계열 조회 + `sub` 차원 필터로 재구성했다(4c-4k 방식).
반환 타입을 `Map<키문자열, Double>` → `HostUsage` 레코드로 바꿔 **소비자에서 키 문자열이 사라졌다**.
콜 수 6 → 3.

🔴 **`DISK:fs.root.size.pused` 신설 — 폴백 체인을 쓰면 안 되는 자리**: 기존 `fs.root.pused`는
`vfs.fs.size[/,pused]` → `vfs.fs.dependent.size[/,pused]` 폴백인데, 원본은 정확 키만 봤다.
체인을 쓰면 dependent 계열만 가진 호스트(예: zabbix-server)의 `diskUsage`가 **0에서 실값으로 바뀐다** —
4c-4g `MEMORY:pused`(0→11)와 정확히 같은 자리라 §D7대로 정확 키 항목을 따로 만들었다.
**"같은 값의 두 해석을 나란히 두는" 패턴이 세 번째로 쓰였다**(`MEMORY:pused`/`size.pused`,
`NETWORK:if.in.family`/`if.in.perif.family`, 이번 `DISK:fs.root.pused`/`fs.root.size.pused`).

⚠️ **트래픽은 조회를 유지한다 — 4c-4g의 cpuUsage와 다르다**: dev에 `[...,bytes]` 아이템이 **0건**이라
값은 항상 0이지만, 4c-4g의 cpuUsage는 **키가 어긋나 논리적으로 항상 0**이었던 반면 이쪽은
**데이터가 있으면 값이 생기는** 자리다. 조회를 빼면 그런 환경에서 응답이 바뀐다.
**"항상 0"이라는 관찰이 같아도 그 이유가 다르면 처리가 달라진다.**

**검증**: 586 green. 런타임 전/후 9개 비교 그룹에서 **실시간 필드(cpuUsage·memoryUsage·responseTime)를
제외한 차이 0건** — `diskUsage`·`numberOfHost`·트래픽·정렬 5변형·페이징·그룹 필터 전부 일치.

---

#### 🟠 ADR D12 — 인터페이스 상세/그래프는 전환 보류(전환 대상 외, 조건부)

`getInterfaceGraphData`·`getInterfaceDetails` 2곳. **영구 제외(⛔)가 아니라 선결 조건이 있는 보류(🟠)**다.

**① 포트에 없는 축이 소스 고유 개념이다.** 둘 다 Zabbix `item.interfaceid`
(= 이 아이템이 **어느 호스트 인터페이스를 통해 폴링되는가**)로 필터·그룹핑한다. SNMP/Agent 인터페이스
바인딩은 Prometheus(스크레이프 타깃)·Datadog(에이전트)에 대응물이 없다. §D2가 "소스 공통화 불가능한
것은 추상화 제외"로 판정한 계열이다.

**② 응답 계약 자체가 Zabbix id에 묶여 있다.** `InterfaceDetailsResDto.interfaceId`가 Zabbix
interfaceid이고, FE가 그것을 그래프 드릴다운 경로(`/hosts/interfaces/{hostid}/graph/{interfaceid}`)의
키로 쓴다. 중립 축(`iface` 차원 = 장비 내부 포트명)으로 바꾸면 **응답과 URL이 함께 바뀐다** —
`HostService.detail`(raw Map 노출) 판정과 같은 성격이다.

**③ 검증 수단이 없다 — 실 Zabbix 조사 결과 이 경로는 dev에서 아예 동작하지 않는다**:
| 원본이 찾는 정확 키 | dev 실측 |
|---|---|
| `ifOperStatus` | **0건** (실제 키는 `net.if.status[ifOperStatus.2]`) |
| `net.if.speed` | 23건 존재하나 실제 키는 `net.if.speed["{GUID}"]` → 정확 키 조회 실패 |
| `ifAdminStatus`·`ifDescr`·`net.if.in[pps]`·`net.if.out[pps]`·`net.if.errors` | **전부 0건** |
| `[...,bytes]`·`[...,packets]` | **전부 0건** |
→ `/hosts/interfaces/{id}`는 **빈 응답**(items 0), graph는 **항상 `WIDGET_NOT_FOUND`**.
원본이 `searchKeys`(substring)로 후보를 받아 놓고 `vals.get(정확 키)`로 꺼내는 **선재 불일치**가 있다
(4c-4g `getHostItems.cpuUsage` 항상 0과 같은 계열). 카탈로그 계열 조회로 옮기면 이 값들이 **살아나** —
즉 **중립화 자체가 응답을 바꾼다**(§D7).

**선결 조건(둘 다 충족되면 재개)**:
1. 이 화면이 실제로 동작하는 Zabbix 환경(SNMP 스위치 + `net.if.in[…,bytes]` 템플릿)에서 전/후 비교가 가능할 것.
2. "정확 키 조회 vs substring 검색" 불일치를 **계약 변경(=화면 수정)으로 다룰지** 먼저 결정할 것 —
   고치면 값이 0/null에서 실값으로 바뀌므로 리팩터링과 섞으면 안 된다.

### 스텝 4c-4m 완료 기록 (2026-07-28 — 알림추이·그룹별 문제 요약 이력 전환)

4c-4l이 만든 이력 계약의 나머지 소비자 2곳. **계약을 한 번 제대로 만들면 그 다음 소비자는 싸다** —
이번 스텝은 새 계약 없이(모델 1건만 확장) 두 메서드를 옮겼고 런타임 차이가 **0건**이었다.

🟢 **`includeEntities`가 설계대로 쓰였다**: `getGroupAlertTrend`는 `listHistory`를 **두 번** 부른다 —
집계용(`includeEntities=false`)과 목록용(`limit=100` + `true`). 4c-4l에서 "원본의 성능 결정이 사라지지
않게" 둔 옵션이 바로 다음 스텝에서 실사용됐다. **옵션을 미리 만든 게 아니라 원본을 읽고 만든 것이라
맞아떨어졌다.**

🟢 **`InventoryGroup.hosts`: `EntityRef` → `NamedEntity`**(`Alert.entities`와 같은 이유): 그룹 요약 화면이
멤버 호스트 **이름**을 응답에 그대로 낸다. ℹ️ `GroupQuery.includeHosts`는 4c-4b에 신설된 뒤 **소비자가
없었다** — 그래서 `selectHosts`에 `name`을 더하는 요청 변경이 무해하다(§D7 위험이 0인 자리였다).

⚠️ **`getProblemsByHostGroup`은 그룹 제약 없는 이력 질의다**: 전 그룹을 가로질러 집계하므로
`groupIds=null` + `range`만 준다 — 4c-4l이 "규칙 **또는** 시간창"으로 안전장치를 정의한 게 여기서 유효했다
(그룹까지 필수로 뒀다면 이 소비자가 막혔다).

**소멸**: `HostService.extractHostName`·`parseIntSafe`(원시 Map 파싱 헬퍼 2종).

**검증**: 586 green. 런타임 전/후 **6개 비교 그룹 전부 identical**(알림추이 3시간창 × 4그룹 ·
문제 요약 5변형(정렬 2·페이징·시간창 2) · 회귀 2) — **차이 0건**.
⚠️ 알림추이도 Redis 60초 캐시가 있어 비교 전 캐시 키를 지웠다(4c-4k와 같은 함정, `_4m_flush.mjs`).

🔴 **`getHostGroupDetailProblems`는 보류 판정 후보로 남긴다**(이력 소비자 4곳 중 유일). 필요한 것이 셋이다:
| 필요 | 상태 |
|---|---|
| `Alert.tags` | 계약에 없음 — 신설 필요(태그는 Prometheus 라벨·Datadog 태그에 대응하니 중립화 가능) |
| `opdata` | ⛔ **4c-5e(D11)가 Zabbix 전용·스텝 5로 확정** — 전환하려면 그 판정을 다시 열어야 한다 |
| 호스트 IP 조인 | 이벤트가 아니라 `host.get(selectInterfaces)`에서 온다(다른 포트) |
**하나가 이미 내려진 판정을 뒤집는 일**이라 다음 스텝에서 단독으로 다룬다.

### 스텝 4c-4l 완료 기록 (2026-07-28 — 이벤트 이력 질의 계약, ReportService 완전 전환)

**공통 난제 1을 풀었다.** `ReportService.summarizeAlerts`가 첫 소비자이고, 이걸로 **`ReportService`에서
Zabbix 참조와 `authToken`이 완전히 사라졌다**(파일 단위 완결 — 4c-4h의 DiskService 선례).

🟢 **`AlertHistoryQuery`를 넓혔다(타입을 또 나누지 않았다)**: 4c-5d는 `AlertQuery`(problem.get)와
`AlertHistoryQuery`(event.get)를 **다른 질의**라고 나눴다. 그 기준을 그대로 적용하면 이번 4곳은 **같은
질의(event.get)의 다른 필터 축**이다 — 규칙 기준 vs 그룹+시간창 기준. 타입을 또 나누면 `beforeNativeId`·
`limit`·`includeActions`·정렬 계약이 그대로 복제된다.

🔴 **필수였던 `ruleNativeId`가 안전장치를 겸하고 있었다**: 4c-5d가 "무제한 이력 스캔은 위험한 질의"라
필수로 뒀는데, 그걸 풀면 그 방어가 같이 사라진다. → **`ruleNativeId` 또는 `range` 중 하나는 필수**로
생성자에서 강제했다. 네 소비자 모두 시간창을 넘기므로 비용이 0인 대체 장치다.
**제약을 풀 때는 그 제약이 <b>겸하고 있던 역할</b>을 먼저 찾아야 한다.**

🟢 **`includeEntities` 옵트인 — 원본의 성능 결정을 계약이 표현하게 했다**: `getGroupAlertTrend`는
event.get을 **두 번** 부른다(집계용은 `selectHosts` 없이, 목록용은 N건에만). 원본 주석이 이유를 적어 뒀다 —
"기간 내 전체 이벤트에 selectHosts를 걸면 매우 느려진다". 계약에 이 축이 없으면 전환하면서 그 결정이
**조용히 사라진다**. `AlertQuery.includeActions`(4c-5c)·`HostQuery.include`(4c-2)와 같은 자리다.

🟢 **`Alert.entities`를 `EntityRef` → `NamedEntity`로**: 집계 화면이 호스트를 **이름으로** 묶는데
식별자만 주면 소비자가 인벤토리를 다시 조회해야 한다. `AlertRule.entities`는 이미 `NamedEntity`였고,
어댑터는 소스에서 받은 이름을 `.map(NamedEntity::ref)`로 **버리고 있었다** — 그 두 줄이 사라졌다.
⚠️ `listActive`의 트리거 2단 조회 경로는 `selectHosts`에 `name`을 **더하지 않았다**(name=null로 감쌈):
그 경로 소비자는 `belongsTo`(식별자 비교)만 쓰므로 **요청을 바꿀 이유가 없다**(§D7 — 응답이 같아도 요청은
그대로 둔다, §D2 스코프 절제).

✅ **원본 3변종이 실제로는 동치임을 확인했다**: 네 소비자의 `event.get` 파라미터가 제각각이었다
(`source`/`object`를 넣은 곳, `source`만, 아무것도 없는 곳). **Zabbix `event.get`의 `source`·`object`
기본값이 둘 다 0(트리거)**이라 세 변종이 같은 질의다 — 그래서 계약에 옮기지 않았다.
4c-4d의 기기분류 3변종과 달리 **이번엔 통일해도 안전한 변종**이었고, 그 판단 근거는 소스 문서의 기본값이다.
실제 축은 `value=1`(발생 사건만) 하나뿐이라 `onsetOnly`로 표현했다.

🔴 **정렬 고정이 동점 순서를 뒤집었다 — 런타임 비교가 잡았다**: `listHistory`는 계약상 항상 최신순인데
원본은 정렬을 지정하지 않았다(≈발생 오름차순). 건수·집합은 같은데 **Top 호스트의 동점 그룹 순서**가
뒤집혔다(`count=1`인 세 호스트의 배열 순서). 원인은 `sorted`가 stable이고 `LinkedHashMap` 삽입 순서가
동점을 가르기 때문 — **순회 방향이 응답에 남는다**.
→ 계약(최신순 고정)은 그대로 두고 **소비자가 역순 순회로 발생 순서를 복원**했다.
4c-5c의 "중립 모델을 써도 순서는 위임 못 한다"와 같은 자리이며, 이번엔 **정렬 계약이 있는 포트에서도**
소비자가 순서를 명시해야 함을 보여준다.

**검증**: 584→**586 green**. 런타임 전/후 **리포트 3종(주별·월별·상세) 전부 identical**(1차 비교에서 위
동점 순서 뒤집힘 검출 → 수정 후 2차 비교로 해소 확인), 나머지 차이는 실시간 메트릭뿐.

🟢 **`ReportService`가 파일 단위로 완결됐다** — Zabbix 참조 0, `authToken` 0. `ReportSchedule`의
`getSuperAdminToken()`도 함께 소멸(§D3 — 토큰 획득이 세션 프로바이더 책임으로 완전히 넘어갔다).

### 스텝 4c-4k 완료 기록 (2026-07-28 — 계열 트렌드 신설, 자원 추이·리포트 집계 전환)

**공통 난제 3을 풀었다.** 전환 2곳(`HostService.getGroupResourceTrend`·`ReportService.summarizeMetric`)은
같은 방식으로 아이템을 고르고 trend를 받아 왔다 — 그 공통부를 `ResourceTrendQuery`(app 공용, 4c-1
`HostLiveAggregator` 선례)로 모으고, **집계 수식은 서로 다르므로**(리포트=avg/max/min 3통계, 추이=선택 agg
하나) 각 서비스에 남겼다.

🟢 **`queryTrendFamily` 신설 — `queryLatestFamily`의 트렌드 대응물**: `queryTrend`는 (엔티티 × 메트릭)
셀마다 `BatchResolver`로 **아이템 하나**를 고른다. 호스트당 마운트/인터페이스가 여럿인 집계에서는
**그 자리에서 나머지가 소실**된다. 계열 조회가 따로 필요한 이유가 최신값과 트렌드에서 동일하다.

🟢 **`ChainMode`(FALLBACK|UNION) 신설 — 패턴 목록의 의미를 사양에 명시**:
| 모드 | 의미 | 쓰는 곳 |
|---|---|---|
| FALLBACK(기본) | "이 소스가 쓰는 철자 **하나**를 골라라" | 기존 전 사양(동작 불변) |
| UNION | "이 소스가 쓰는 **모든 철자를 합쳐라**" | `DISK:fs.size.all` · `NETWORK:if.in/out.traffic` |

🔴 **UNION이 없으면 호스트군이 통째로 빠진다**: 폴백은 "1차 패턴이 **전 엔티티에서** 비었을 때"만 다음으로
넘어간다. dev 실측에 `vfs.fs.size` 계열 27키와 `vfs.fs.dependent.size` 계열 32키가 **공존**하므로,
그룹 조회에서 1차 철자를 쓰는 호스트가 하나만 있어도 2차 철자만 가진 호스트가 전부 누락된다.
⚠️ **UNION은 중복 제거를 하지 않는다**(원본 `getByListKey`의 concat과 1:1) → 패턴이 상호 배타여야 하며,
새 UNION 사양 등록 시 배타성 확인이 선결이다(`ChainMode` javadoc에 규칙 명시).

🟢 **cpu·memory는 계열이 아니라 "정확 키 여러 개"였다**: 원본이 search로 후보를 받은 뒤
`itemKeys.contains(key)`로 정확 일치만 남겼으므로, 캐노니컬 메트릭 2~3개를 한 번에 묻는 것과 같다
(`queryTrend`로 충분). **네 메트릭을 "다 계열"로 보고 시작했다가 원본 필터를 읽고 갈라진 지점이다.**
⚠️ memory는 `size.pused`(정확)이지 `pused`(폴백 체인)가 **아니다** — 체인을 쓰면 값이 바뀐다(4c-4g).

🔴 **원시 키 정규식 → 차원(dims) 조건 이관, 실 키 집합으로 동치 확인**: 포트는 원시 키를 노출하지
않으므로(§D2) `MetricUtils.isTrafficKey`/`isDiskPusedKey`를 어댑터가 파싱한 `sub` 차원 조건으로 옮겼다.
**추측하지 않고 실 Zabbix의 키 집합을 먼저 훑었고**(`_4k_probe.mjs`), 그게 결정적이었다:
- `net.if.in.discards[…]`·`net.if.in.errors[…]`가 **실제로 존재**한다 → 계열 프리픽스를 `net.if.in`으로
  두면 이들이 섞이는데 원본 정규식은 배제한다. **프리픽스에 `[`를 넣어야** 다른 계열이 차단된다
  (4c-4j가 인터페이스 개수용으로 만든 경계와 같은 이유).
- 동치 검증: 트래픽 51/51 ×2, 디스크 17/17 **완전 일치**. 순수 dims 규칙(`sub==null`)만 썼으면
  discards/errors 100건이 트래픽에 섞일 뻔했다.

**성능**: `queryTrend`의 `trend.get`을 셀당 1콜 → 전체 1콜로 배치했다. 그룹 단위 소비자가 처음 생기면서
(호스트 40 × 메트릭 2) 80콜이 될 자리였다 — `querySeries`가 스텝 3b에 같은 이유로 배치화한 것과 같다.

**검증**: 573→**584 green**. 런타임 전/후:
- **리포트(주별·월별) 완전 identical** — `summarizeMetric` 4메트릭 전부 일치.
- **자원 추이는 구조 전건 동일**(시리즈 수·순서·이름·포인트 수·타임스탬프 불일치 **0건**), 값 17,576개 중
  **114개(0.65%)가 최대 상대오차 2.5e-16**로 다르다.
- ⚠️ **이 차이는 부동소수점 누적 순서다**: 원본은 `trend.get` 응답 순서로 합산하고, 새 코드는 아이템별로
  묶어 합산한다. `+=`는 결합법칙이 성립하지 않아 마지막 자리가 갈린다(machine epsilon ≈ 2.2e-16).
  **리포트가 identical인 것은 `round(v*100)/100`이 잔차를 흡수하기 때문**이고, 추이는 raw double을 그대로
  응답에 실어 드러났다. 누적 순서를 계약에 넣는 것(=소스 응답 순서 노출)이 더 나쁘다고 보고 수용했다.
- 회귀(servers·network)의 차이는 실시간 메트릭뿐.

ℹ️ **캐시가 낀 경로의 비교 함정이 또 나왔다**(4c-4j 리포트 스냅샷에 이어 2번째): 자원 추이는 Redis 60초
캐시가 있어 after가 before의 캐시를 그대로 돌려줄 수 있다 → `_4k_flush.mjs`로 매 실행 전 캐시 키를 지운다.
**"같은 코드가 실행됐는가"를 먼저 보장하라**는 규칙이 스텝 종료 체크리스트에 들어갈 자격이 있다.

**HostService의 Zabbix 직접 호출 9→8 메서드**, `ReportService`는 `summarizeAlerts` 1곳만 남았다.

### 스텝 4c-4j 완료 기록 (2026-07-28 — 리포트 호스트 조회 + 인터페이스 개수 전환)

**전환 2곳** — 둘 다 기존 계약으로 되는 마지막 잔여였다:
| 파일 | 전환 | 결과 |
|---|---|---|
| `ReportService.computeReport` | 그룹 호스트 목록(`host.getRaw`) → `InventoryPort.listHosts` | 리포트에서 `*Raw(Map)` 소멸 |
| `HostService.getHostNetwork` | 인터페이스 개수(`item.get` search `net.if.in[`) → `MetricPort.queryLatestFamily` | 이 메서드에서 `authToken` 소멸 |

🟢 **"값이 아니라 건수가 답"인 첫 계열 조회**: 인터페이스 수는 아이템의 *값*을 하나도 쓰지 않고 **아이템이
몇 개인지**만 본다. 그래서 `listDimensions`(iface 목록 → 크기)가 자연스러워 보였지만, 그건 **호스트당 1콜**이다.
`queryLatestFamily`는 전 호스트를 1콜로 받아 엔티티별로 세므로 원본의 콜 수(1콜)와 정확히 같다.
**계열 조회는 값을 쓰지 않는 소비자에게도 옳은 도구다** — 필요한 건 "이 계열의 아이템 집합"이지 값이 아니다.

🔴 **카탈로그 `NETWORK:if.in.perif.family` 신설 — 프리픽스의 `[` 하나가 계약이다**:
기존 `if.in.family`는 search `"net.if.in"`이라 **파라미터 없는** `net.if.in`(단일 집계 아이템)까지 걸린다.
원본은 `"net.if.in["`로 물어 인터페이스별 아이템만 셌다. `if.in.family`를 재사용했으면 그런 아이템을 가진
호스트에서 **개수가 +1** 된다. 4c-4g의 `MEMORY:pused`(체인) ↔ `size.pused`(정확)와 **같은 패턴**이다 —
겉보기 중복이 아니라 다른 질문이고, 폴백/범위의 넓이가 응답 숫자를 바꾼다(§D7).

⚠️ **`ReportService`는 전이 상태로 남는다**: `CallerContext`와 `authToken`을 **둘 다** 받는다
(`computeReport(ctx, authToken, …)`). 미전환인 `summarizeMetric`(item+trend)·`summarizeAlerts`(event)가
토큰을 계속 요구하기 때문이다 — 4b의 `HomeService`와 같은 형태이며, 위 **공통 난제 3**이 풀려야 해소된다.
ctx는 컨트롤러(`CallerContexts.from`)와 배치(`CallerContext.system()`)에서 각각 주입한다.

⚠️ **리포트는 저장본이 있으면 재계산하지 않는다 → 전/후 비교 전에 `host_group_report`를 비워야 한다.**
안 비우면 after 실행이 before가 저장한 스냅샷을 그대로 반환해 **전환 경로를 아예 타지 않은 채 identical**이
나온다. 캐시·스냅샷이 낀 경로의 런타임 비교는 **"같은 코드가 실행됐는가"를 먼저 보장**해야 한다.
(검증: 양쪽 모두 truncate 후 기동 → 40호스트 그룹의 주별 3기간이 실제로 재집계됨을 확인)

**검증**: 570→**573 green**. 런타임 8개 비교 그룹 중 **리포트(목록·월별·상세)·그룹별 네트워크 목록·home 완전
identical**, 나머지 차이는 실시간 메트릭뿐(responseTime 1·cpuUsage 2·memoryUsage 2 — 캡처 시점 차).
✅ **인터페이스 개수 실검증**: 유일한 네트워크 장비(Fortigate 100D)가 `interfaces=8`로 전/후 일치 —
0이나 null이 아닌 값이라 **증거가 있는 비교다**(4c-5e의 `manualCloseAllowed` 교훈 적용).

ℹ️ **proto 갱신 없음**: 이 스텝은 engine-api 모델·포트 시그니처를 하나도 바꾸지 않았다(카탈로그는
engine-zabbix 내부 매핑이라 계약이 아니다). 스텝 종료 체크리스트의 proto 항목은 "해당 없음"으로 확인.

**app의 Zabbix 직접 참조는 8파일 유지**(두 파일 모두 다른 메서드에 잔여가 있다).
> ⚠️ **이 "8파일"은 <b>전환 추적 대상</b>(B·C군)만 센 숫자다**(2026-07-28 정정). app 전체로는 **16파일**이
> Zabbix 서비스를 호출하며, 나머지 8개는 처음부터 스코프 밖인 D군(아이덴티티·세션)이다 —
> `UserService`(23)·`UserGroupService`(7)·`AuthService`(5)·`AdminUserService`(4)·`JwtAuthFilter`(1)·
> `SettingService`(1)·`EventSyncService`(2)·`ReportSchedule`(1, 4c-4l에서 소멸). 스텝 5 이동 대상이다.
**HostService의 Zabbix 직접 호출 10→9 메서드.**

### 스텝 4c-4i 완료 기록 (2026-07-28 — 배치 동기화 전환, `AlertQuery.limit` 신설)

**`AlertQuery.limit` — 페이지네이션이 아니라 안전장치**: 배치가 30일치 알람에 `limit 10000`을 걸어 폭주를 막고 있었다. 4b가 "페이지네이션 없음(전량 받아 app에서 슬라이스)"으로 정의했지만 그건 **순서가 의미 있는 목록** 이야기고, 여기서는 상한 자체가 목적이다 — app에서 자르면 소스가 전부 보내야 해서 상한의 의미가 사라진다.
계약에 "무엇이 잘릴지는 소스 순서에 달렸고 커서가 없다. 순서가 의미 있는 목록에 쓰지 말 것"을 명시했다.

🔴 **DB에 쓰는 값도 §D7의 대상이다**: 이 배치는 REST 응답이 아니라 테이블에 쓴다. 모델이 미해소를 null로 정규화하는데 `event_problems` 테이블은 Zabbix 표기 `r_event_id="0"`·`r_clock=0`을 저장해 왔고 **기존 행과 섞인다**. 그대로 두면 같은 컬럼에 두 표기가 공존한다 → 4c-5d의 `causeEventId` "0" 복원과 같은 원칙으로 되살렸다. **"응답 불변"의 응답에는 영속 데이터도 포함된다.**

⚠️ **런타임 전/후 비교가 불가능한 첫 전환**: 스케줄러가 돌리는 배치라 채집할 REST 응답이 없다. DB에 쓰는 값이 유일한 계약이라 **단위 테스트가 유일한 그물**이다(4c-5e의 `ZabbixInventoryAdapter`와 같은 상황) — `r_event_id`/`r_clock` 표기, 조치자 읽음 처리, 질의 옵션(규칙·조치·상한)을 고정했다.

**사용자 목록은 D군이라 남는다**: 배치가 "이벤트 × 전 사용자"의 읽음 상태를 만들어야 해서 Zabbix 계정 목록 자체가 필요하다. 조치자(`AlertActor`)만으로는 부족하다 — 조치하지 않은 사용자의 행도 만들어야 한다.

**report 계열**: `ReportManagementService`·`ReportSchedule`의 그룹 목록 조회를 `InventoryPort.listGroups`로 전환했다. `ReportSchedule`은 `authToken`을 그대로 들고 있는데, 아직 미전환인 `ReportService.computeReport`가 요구하기 때문이다(4c-4j에서 함께 해소).

⚠️ **테스트 함정**: `anyString()`은 **null을 매칭하지 않는다**. `getSuperAdminToken()`을 stub하지 않아 토큰이 null이 되자 사용자 조회 stub이 걸리지 않았고, 빈 목록 때문에 읽음상태 배치가 아예 실행되지 않았다 — "호출 횟수가 모자라다"는 실패로 나타나 원인이 두 단계 떨어져 있었다.

**검증**: 566→**570 green**(+4). app의 Zabbix 직접 참조 **11→8파일**.

### 스텝 4c-4h 완료 기록 (2026-07-28 — 두 서비스 완전 정리 + C군 경계 확인)

**파일 단위로 Zabbix 서비스 호출을 0으로 만든 첫 스텝이다**(그동안은 메서드 단위 전환이었다):
| 파일 | 전환 | 결과 |
|---|---|---|
| `DiskService` | 그룹 호스트 목록 + 호스트명 조회 → `InventoryPort` | Zabbix 서비스 호출 **0** |
| `DeviceClassificationService` | 태그 사용처 카운트 → `InventoryPort`(TAGS) | Zabbix 서비스 호출 **0** |

⚠️ **`DiskService`에 Zabbix <b>모델 타입</b>은 남는다**: `HistoryPoint`가 라인차트 응답 DTO의 구성 요소다(§스텝 2 회고의 "라인차트 identity 누수"). FE는 `{timestamp,value}`만 소비하므로 협의 후 정규화 가능한 알려진 항목이며, **서비스 호출과 모델 타입은 다른 축**이라 "완전 정리"의 기준을 서비스 호출로 잡았다.

**`getSuperAdminToken()` → `CallerContext.system()`**(§D3): 기기분류 사용처 집계는 사용자 요청 맥락이 아니라 **설정 화면의 시스템 조회**라 호출자 권한과 무관해야 한다. 토큰 획득이 서비스에서 사라지고 세션 프로바이더 책임이 됐다.

🟢 **`HostGroupService`는 C군으로 판정(스텝 5 이관)**: 8개 호출 중 6개가 **그룹 CRUD**(`createHostGroup`/`updateHostGroup`/`deleteHostGroups`)로 §D2가 이미 "관리 화면은 추상화 대상 아님"으로 분류한 영역이다. 남은 읽기 1곳(`listHosts`)도 사용자 관리 화면(`GET /users/hosts`)용이고, 그 응답 DTO(`HostResponseDto`)가 **`ZabbixHost`를 생성자로 직접 받으며 기술명(`host`)과 `model`을 노출**한다 — 포트 모델에 없는 두 필드다.
**읽기 1곳만 떼어 전환하면 파일이 두 세계에 걸친다**(쓰기는 Zabbix 직접, 읽기는 포트). 파일 전체를 C군으로 두고 스텝 5에서 함께 이동하는 편이 일관된다.

**검증**: 566 green(디스크 3종·기기분류 테스트를 포트 stub으로 전환). 두 서비스 모두 실 Zabbix 응답 형태를 그대로 재현하므로 별도 런타임 채집 없이 단위 테스트로 덮었다 — 4c-4g까지의 런타임 비교가 같은 `InventoryPort` 경로를 이미 여러 번 검증했다.

**app의 Zabbix 직접 참조 13→11파일.**

### 스텝 4c-4g 완료 기록 (2026-07-28 — 아이템 조회 전환, **폴백 체인이 응답을 바꾼 첫 사례**)

**전환 3곳**: `getIcmpHealthByHost`(PING:alive) · `getHostNetworkMetrics`(6메트릭) · `getHostItems`(메모리·디스크).
**카탈로그 4항목 신설**: `PING:alive`(icmpping) · `SYSTEM:hw.session.num` · `SYSTEM:proc.num` · `MEMORY:size.pused`.

🔴 **폴백 체인이 응답을 바꿨다 — 스텝 2 회고가 예측한 상황이 실제로 왔다**: `MEMORY:pused`는
`vm.memory.size[pused]` → `vm.memory.pused` 폴백 체인인데, 원본 `getHostItems`는 **정확 키만** 봤다.
체인을 쓰자 legacy 키뿐인 호스트에서 폴백이 실값을 찾아 **`memoryUsage: 0 → 11`** 로 바뀌었다(런타임 비교로 검출).

> 스텝 2 회고: "modern-only 호스트가 등장하면 폴백이 실값을 찾아 divergence(=버그 수정) 가능 — **그때 재평가**"

**재평가 결론: §D7을 지킨다.** "값이 더 정확해지는 것"도 Phase 1에서는 계약 변경이다(화면 숫자가 0에서 11로 바뀐다). 리팩터링 커밋에 값 변경을 섞으면 나중에 어느 커밋이 무엇을 바꿨는지 추적이 불가능해진다. → 폴백 **없는** `MEMORY:size.pused`를 신설해 정확 키를 요구할 수 있게 했다.

🟢 **카탈로그에 "같은 값의 두 해석"을 나란히 두는 패턴**: `MEMORY:pused`(체인 = "메모리 사용률을 아무 키로든")와 `MEMORY:size.pused`(정확 = "이 키만")는 중복이 아니라 **다른 질문**이다. 폴백은 편의이지 항상 옳은 기본값이 아니며, 소비자가 어느 쪽을 원하는지 표현할 수 있어야 한다.

⚠️ **`DISK:fs.pused`는 `{partition}` 차원이라 family가 아니라 정확 키로 물어야 했다**: 원본이 `vfs.fs.size[/,pused]`로 **루트 마운트 고정**인데 `queryLatestFamily`로 부르면 전 마운트가 오고 어느 것이 먼저일지 보장이 없다. `queryLatest`+`dims{partition:"/"}`로 조회하면 폴백이 **호스트별**로 판정돼(`BatchResolver`) 원본의 호스트 단위 size→dependent 폴백과 정확히 일치한다.

🔴 **`getHostItems`의 cpuUsage는 항상 0이다(원본 그대로)**: 원본이 `system.cpu.load[percpu,avg1]`로 조회해 놓고 Map에서 `"system.cpu.util"`로 꺼내 키가 어긋나 있었다. 전환하며 "고치면" 응답이 바뀌므로 **조회 자체를 하지 않고 0을 낸다**(쓰지 않을 값이라 콜만 낭비). 4c-4d의 기기분류 3변종·4c-5d의 `suppress_until` 역전 조건과 같은 계열의 보존이다.

ℹ️ **`PING:alive`는 반드시 `filter`(정확 일치)**: `search`로 등록하면 `icmppingsec`/`icmppingloss`까지 걸려 "응답 여부"에 응답시간·손실률이 섞인다. 원본도 search 후 키를 다시 비교해 걸렀는데, 그 후처리가 카탈로그로 올라가면서 사라졌다 — **서비스의 방어 코드가 계약의 정확성으로 대체된 사례**.

⚠️ **`getHostNetworkMetrics`는 6콜이 됐다**(원본 1콜): 포트에 "여러 메트릭 한 콜" 조회가 없다. 대상이 네트워크 장비 수 대라 실측 부담이 없어 그대로 뒀지만, 호스트 수가 큰 소비자가 생기면 어댑터에 다중 메트릭 배치가 필요하다(§스텝 2 회고의 N+1 항목과 같은 자리).

**검증**: 566 green. 런타임 6개 비교 그룹 중 **`topHosts`(icmpHealth) 완전 identical**, 나머지 차이는 실시간 메트릭뿐(diskUsage 2·responseTime 2·cpuUsage 2·memoryUsage 2 — 캡처 시점 차). 위 폴백 이슈는 1차 비교에서 검출해 수정한 뒤 2차 비교로 해소를 확인했다.

**HostService의 Zabbix 직접 호출 13→10 메서드**(아이템 조회 9→6곳).

### 스텝 4c-4f 완료 기록 (2026-07-28 — 서버·네트워크 목록 전환)

**소스가 하던 일 둘이 애플리케이션으로 넘어왔다** — 둘 다 응답 순서·건수를 바꾸는 자리다:
| 넘어온 것 | 처리 |
|---|---|
| 이름 정렬(`sortfield`/`sortorder`) | 포트는 정렬을 계약에 두지 않는다(소스별 지원 차이, §D5). 전량 받아 app에서 자르는 구조라 재현 가능 |
| 기기분류 태그 필터(Zabbix `tags` 파라미터) | `HostInclude.TAGS`로 받아 app에서 판정(4c-4a 선례). app 필터가 소스 필터보다 <b>엄격</b>해서("정확히 1개") 결과가 같다 |

🔴 **런타임 비교가 잡은 정렬 버그 — Zabbix는 대소문자를 <b>구분</b>한다**: `CASE_INSENSITIVE_ORDER`로 구현했다가 `Haley`(H=72)와 `gab-ubu-ans_2`(g=103)의 순서가 뒤집혀 발견했다. Zabbix는 코드포인트 순이라 **대문자로 시작하는 호스트가 소문자 호스트보다 앞**이다. 전/후 비교가 없었으면 못 잡았을 차이 — 단위 테스트는 내가 믿는 규칙을 확인할 뿐이고, 소스의 실제 규칙은 실데이터가 알려준다. 회귀 테스트를 넣었다.

**`InventoryHost.osName` 신설 — §D9와의 경계를 명시**: D9는 "Zabbix `inventory`를 **통째로** 스냅샷 뜨는 것"(60여 필드 + jsonb 영속 포맷)을 제외한 판정이지, "inventory라는 이름이 붙은 것은 전부 금지"가 아니다. `osName`은 실소비자가 읽는 한 필드이고 "이 장비의 OS가 무엇인가"는 어느 소스에나 있는 질문이라(Prometheus node_exporter 라벨, Datadog 호스트 메타) §D2의 스코프 절제대로 **필드 단위로 증분 추가**한다. `HostInclude.OS`로 옵트인.

ℹ️ **요청만 하고 안 쓰던 것들이 또 사라졌다**: `fetchHosts`의 `dns`·`port`·`useip`·`details`·`model`은 응답에서 읽지 않았다(4c-5b `selectAcknowledges`·4c-5d `selectSuppressionData`에 이은 세 번째 사례). 전환은 이런 미사용 요청을 드러내는 부수 효과가 있다.

⚠️ **응답의 `host` 필드는 원래부터 항상 null이었다**: `getHostNetwork`가 `output`에 `"host"`(기술명)를 요청하지 않아 Zabbix가 주지 않았는데 `str(host.get("host"))`로 읽고 있었다. 계약 보존을 위해 명시적으로 `null`을 낸다(§D7) — 선재 버그를 "고치면" 응답이 바뀐다.

⚠️ **4c-4d 표의 판단을 하나 정정**: `getHostNetwork`를 "호스트 status 필요"로 분류했었는데, `output`에 `status`를 요청할 뿐 **응답에서 쓰지 않는다**(응답의 `status`는 알람 상태다). 4c-5e의 `enabled` 없이도 전환 가능했다 — **요청 파라미터가 아니라 소비 지점을 봐야 한다.**

**덤으로 전환된 것**: `getHostGroupDetail`의 그룹 알람 조회(`severity`/`clock`/`name`만 써서 기존 `AlertQuery.ofGroup`으로 충분). 이로써 **`HostService`에서 `ZabbixProblemService` 의존이 완전히 소멸**했다.

**검증**: 557→**566 green**(+9). 런타임(before/after JAR 교체) 13개 비교 그룹 중 **호스트 식별자·이름·OS·정렬 순서·건수·statusCounts 전부 일치**하고, 남은 차이는 **실시간 메트릭뿐**(cpuUsage 13·memoryUsage 10·responseTime 3·numberOfHost 3·diskUsage 1 — 캡처 시점 차, A군 이래의 선례). 커버: 서버 목록 정렬 2방향·페이징·키워드·CPU 정렬·그룹 한정, 네트워크 목록 기본·키워드·정렬·그룹 한정, 그룹 상세, top-hosts, home.

**HostService의 Zabbix 직접 호출 메서드 16→13.** 남은 것의 성격:
| 부류 | 곳 | 판정 |
|---|---|---|
| 아이템 lastvalue 조회 | 9 | **A군(MetricPort) 성격** — 카탈로그 확장이 필요한 별도 트랙 |
| 이벤트 이력(`getEventsRaw`) | 3 | 시간창 기준 이력 — `listHistory`(규칙 기준)와 다른 질의 |
| `detail` | 1 | ⛔ raw Map 노출(4c-4a 판정) |
| `getCollectedInfo` | 1 | ⛔ **스텝 5 판정(신규)** — `selectParentTemplates`+`selectItems`(key_·value_type)는 Zabbix 구성 개념이라 §D2가 `ItemsService`를 보류한 것과 같다 |

### 스텝 4c-5e 완료 기록 (2026-07-27 — 알람 상세 전환 + 잔여 판정, **B군 알람 도메인 종결**)

**계약 4필드 추가 — 전부 "소스가 권위 있게 아는 사실"이다**:
| 필드 | 판단 |
|---|---|
| `Alert.acknowledged` | 🔴 **`actions`에서 유도하지 않는다** — 확인은 `UNACKNOWLEDGE`로 취소될 수 있어 이력을 시간순으로 되감아야 알 수 있고, 소스가 최종 상태를 이미 안다. **파생 가능해도 소스가 권위 있게 주면 그대로 싣는다**(`resolved`와 같은 판단) |
| `Alert.suppressedUntilMillis` | `suppressed`가 "억제 중인가", 이 필드가 "언제까지인가". ⚠️ `AlertAction.suppressUntilMillis`(조치 시점에 *요청한* 만료)와 다르다 — 이쪽은 **현재 유효한** 억제의 만료 |
| `AlertRule.manualCloseAllowed` | **4c-5b가 스텝 5로 분류했다가 되찾음**(ADR D11) |
| `InventoryHost.enabled` | "감시하도록 설정돼 있는가"(운영자 의도). `Availability`("지금 응답하는가", 관측된 사실)와 다른 축 — 4c-4d가 `getHostNetwork` 미전환 사유로 지목했던 필드라 4c-4f도 함께 열렸다 |

🔴 **ADR D11 — 경계선은 "소스 공통 개념인가"이지 "trigger 객체에서 오는가"가 아니다**: 4c-5b가 `manual_close`를 expression과 **같은 문장에서** 봐서 함께 Zabbix DSL로 묶었는데, 값이 어디서 오는지가 아니라 **그 값이 답하는 질문**으로 갈랐어야 했다. 4c-5c가 `CLOSE_PROBLEM`을 중립 조치로 계약에 넣은 이상 그 조치의 허용 여부도 같은 축이다. 스텝 5 이관 목록은 항목마다 "다른 소스에 같은 질문이 있는가"를 개별로 물을 것.

**`nativeIds` 경로가 규칙을 채울 수 있게 됐다**: 상세 조회는 "알람 + 그 규칙 + 그 호스트" 세 축이 한꺼번에 필요하다. 기존엔 `nativeIds` 분기가 `includeRule`을 무시했다.

⚠️ **`Map.of()`는 `get(null)`에서 NPE를 던진다**(HashMap과 다름). 규칙 미요청 경로에서 `objectid`가 없으면 터지는 실제 결함이었는데, 테스트 스텁이 `objectid`를 안 넣어서 드러났다 — 런타임에선 `output=extend`가 항상 objectid를 줘 가려져 있었다. **빈 `Map.of()`를 기본값으로 쓰는 자리마다 키 null 가능성을 확인할 것.**

**`getHostActiveAlarmCounts`는 `resolveHostStatuses`와 완전히 같은 질의였다**(4c-4c의 `byEntitiesWithOwner`). 최고 severity 대신 건수를 셀 뿐이라 그대로 재사용 — HostService의 trigger 조회가 2→1곳으로 줄었다.

**검증**: 547→**557 green**(+10). 런타임 **9개 비교 그룹 전부 identical**.
- ✅ **`manualCloseAllowed` 실검증**: dev Zabbix 87개 알람을 훑어 `manualClose=true`인 14건을 찾아내 그중 6건을 채집에 넣었다 — 전/후 일치. **값이 전부 false인 채로 "identical"을 받았다면 매핑 증거가 없었을 것**(4c-5a의 예측 실패 교훈 적용).
- ✅ 호스트별 알람 수(`top-hosts` activeAlarmCount 117/61/59/2) 일치.
- 🔴 **미검증(데이터 부재, 정직하게 기록)**: 이 환경에 비활성 호스트 0대·억제된 알람 0건·확인된 알람 0건·원인 있는 알람 0건·형제 2건 이상 0건이라 `enabled=false`·`suppressedUntilMillis`·`acknowledged=true`·`causeNativeId` 경로는 **단위 테스트로만** 덮인다. 그래서 그동안 테스트가 없던 `ZabbixInventoryAdapter`에 테스트를 신설했다(status 0/1/부재 3케이스) — 단위 테스트가 유일한 그물인 자리다.

ℹ️ **`canConvertToCause`의 미묘한 차이(수용)**: 원본은 `!"0".equals(cause_eventid)`라 **필드 부재 시 true**였다. 모델은 부재/`"0"`을 모두 null로 정규화하므로 새 코드는 false다. `problem.get`/`event.get`이 `output=extend`에서 이 필드를 항상 주므로 실제 응답은 동일하며(런타임 14건 일치), 이론적 차이만 남는다.

**소멸**: `EventService`의 `ZabbixProblemService` 의존. 남은 Zabbix 직접 참조는 `getEventTriggerDetail`·`getTriggerDetail` 2곳뿐이고 **둘 다 스텝 5 확정**이라, 알람 도메인(B군)의 포트 전환은 여기서 종결이다.

### 스텝 4c-5d 완료 기록 (2026-07-27 — 알람 목록·이력 전환, `listHistory` 신설)

**`AlertQuery`에 필드를 더 붙이지 않고 `AlertHistoryQuery`로 타입을 나눴다**: 이력 조회는 활성 알람 필터의 변형이 아니라 **다른 질의**다(활성=`problem.get` vs 이력=`event.get`). 필드를 합치면 어느 조합이 유효한지가 문서로만 남고 타입으로는 안 드러나며, 이미 13필드인 `AlertQuery`가 더 커진다. 정렬(발생 시각 내림차순)은 **옵션이 아니라 계약에 고정** — 소비자가 "직전 이력"을 원하는 질의라 다른 정렬이 의미 없고, 열어두면 소스별 지원 차이가 계약에 샌다.

**`Alert` 3필드 추가 — 전부 Zabbix 마법값을 정규화한다**:
| 필드 | Zabbix | 정규화 |
|---|---|---|
| `suppressed` | `suppressed` "0"/"1"/부재 | `Boolean` nullable — **"억제 아님"(false)과 "억제 개념 없음"(null)은 다르다** |
| `causeNativeId` | `cause_eventid` ("0"=없음) | "0"→null. 소스 표기가 계약에 새면 0을 유효 id로 쓰는 소스에서 충돌 |
| `recoveryNativeId` | `r_eventid` ("0"=미해소) | "0"→null |

🔴 **`recoveryNativeId`가 필요했던 이유**: 이력 조회 결과에 알람과 **복구 사건이 함께** 온다. 원본은 "이 페이지 안 알람들의 r_eventid 집합"으로 복구분을 걸러냈다. `resolved`/`resolvedAtMillis`만으로는 복구 사건을 식별할 수 없다(복구 사건 자체는 미해소로 보인다) → 값 자체가 필요. **세 필드가 같은 축의 서로 다른 사실**이라는 게 이번 스텝의 모델링 교훈이다.

⚠️ **`causeEventId="0"`은 응답에서 복원한다**: 모델은 null(원인 없음)이지만 FE가 "0"을 읽으므로 서비스가 되돌린다. 4c-5c에서 `PROBLEM_CREATED`를 소비자가 합성한 것과 같은 원칙 — **소스 표기의 복원은 표현 계층의 일**이다.

**`filter{status:0}` 재현**: 원본은 `trigger.get`에 이 필터를 걸어 비활성 규칙을 **아예 받지 않았고**, 그러면 해당 problem이 목록에서 빠졌다(응답 건수 변동 지점). 어댑터는 status를 받아 `AlertRule.enabled`에 담고 **소비자가 거른다** — 규칙을 못 찾은 경우(`rule == null`)까지 제외해야 원본과 같다.

✅ **`trigger.get`의 `time_from`/`time_till`은 Zabbix가 무시한다(실증)**: 원본이 넘기던 이 두 파라미터는 `trigger.get`의 정식 파라미터가 아니다(정식은 `lastChangeSince/Till`). 오류도 안 나고 필터링도 안 한다는 것이 **시간창 4종(1·7·30·90일) 건수 완전 일치**로 확인됐다(17/42/74/88). 어댑터가 이 파라미터를 재현하지 않아도 안전하다.

🔴 **런타임에서 잡힌 NPE — 중첩 삼항의 언박싱**:
```java
Integer x = a == null ? 0 : (b ? null : (int) expr);   // ← NPE
```
바깥 삼항의 `0`(int)과 안쪽 `Integer`가 만나 **양쪽이 int로 언박싱**되고, 안쪽이 null인 순간 터진다. 4c-5c의 "삼항 타입 승격"(0→0L)과 같은 뿌리인데 이번엔 컴파일도 테스트도 통과하고 **90일 조회에서만** 500이 났다 — 그 시간창에만 해당 조치가 있는 알람이 들어왔기 때문. if/else로 분리하고 회귀 테스트를 넣었다. **단위 테스트가 조합을 못 덮으면 런타임 채집이 유일한 그물**이라는 실례.

⚠️ **`suppress_until`의 "없음"과 "0"이 직관과 반대**: 원본이 `!"0".equals(문자열)`로 판정해 **필드 부재 → 0 노출**, **"0"(무기한) → null**이 된다. `AlertAction`이 둘을 구분해 둔 덕에 그대로 재현된다. 같은 값을 내는 `getEventAcknowledges`는 또 조건이 달라(`"0".equals` 일 때만 0) **셋 다 통일하면 안 된다**.

ℹ️ **`selectSuppressionData`는 요청만 하고 안 쓰던 것**이었다(`getEventProblems`는 `suppressed` 필드만 읽는다) — 전환하면서 자연히 사라졌다. 4c-5b의 `getEventBells`가 `selectAcknowledges`에 대해 그랬던 것과 같은 패턴.

**소멸한 것**: `ZabbixUserService` 의존(조치자 이름 조회가 포트로 감), `buildUserMap`·`getActions(int)`·`isResolved`·`resolutionTimeOrPending`·`mapGroups`·`parseDouble` 헬퍼 6종.

**검증**: 536→**547 green**(+11). 런타임(before/after JAR 교체, dev 5433 + 실 Zabbix) **19개 비교 그룹 전부 identical** — 시간창 4종·억제 표시/숨김·심각도·키워드·정렬 2종(host ASC / severity DESC)·페이징(offset=5)·그룹 한정 3종·이력 목록(limit 5/10 × 3케이스 + 4c-5a 고정 케이스)·회귀(벨·ack 이력·problemInfo). 트리 구성(`causeEventId`)과 `info`("0"/"1") 복원까지 값 단위로 일치.

### 스텝 4c-5c 완료 기록 (2026-07-27 — **포트 최초의 쓰기** + 조치 이력 읽기)

**읽기와 쓰기를 같은 스텝에서 설계한 이유**: 조치는 "이력을 보고 → 그 자리에서 조치"가 한 화면이라, 읽기 모델만 먼저 만들면 쓰기가 요구하는 어휘를 모른 채 굳는다. 실제로 두 방향이 **같은 열거형**(`AlertActionKind`)을 쓰는 것으로 수렴했다 — "무슨 조치가 있었나"와 "무슨 조치를 하라"는 같은 개념이다.

**모델 4종**:
| 타입 | 역할 | 판단 |
|---|---|---|
| `AlertActionKind` | 조치 종류 9종 | Zabbix 비트합 인코딩을 **계약에서 제거**하고 집합(`Set`)으로 표현. 한 조치가 여러 종류를 겸한다는 사실만 남긴다 |
| `AlertAction` | 조치 1건(종류·주체·시각·메시지·심각도 변경·억제 만료) | `Alert.actions` 옵트인 + `AlertQuery.includeActions` |
| `AlertActor` | 조치한 사용자 | 🔴 **`NamedEntity`를 재사용하지 않았다** — 그건 `EntityRef`(모니터링 대상)를 감싸는데 사용자는 그 축이 아니다. 같은 모양이라고 뭉치면 §7 "엔티티 아이덴티티 통합" 논의가 엉킨다 |
| `AlertAckCommand` | 조치 명령 | 🔴 **대상은 식별자 목록으로만 지정**(필터 금지). 필터로 쓰기를 걸면 소스가 필터를 다르게 해석했을 때 의도치 않은 알람까지 바뀐다. "무엇을 바꿀지"는 호출자가 먼저 읽어 확정한다 |

🔴 **`PROBLEM_CREATED`/`PROBLEM_RESOLVED`를 조치 목록에 넣지 않았다**: 이 둘은 사용자가 *가한* 조치가 아니라 알람 생명주기 사건이고, `Alert`의 발생/해소 시각으로 이미 표현된다. 응답이 이들을 액션 배열에 섞어 내는 건 표현 계층의 일이라 소비자가 합성한다 — 모델에 넣었으면 "조치자 없는 조치"라는 모순이 계약에 박혔을 것이다.

🔴 **응답 배열 순서가 계약이었다**: 기존 `getActions(int)`의 검사 순서(CLOSE_PROBLEM→ACKNOWLEDGE→UNACKNOWLEDGE→SUPPRESS→UNSUPPRESS→CHANGE_SEVERITY→ADD_MESSAGE→…)가 그대로 응답 `actions` 배열이 된다. **비트 오름차순도 enum 선언 순서도 아니다.** 중립 `AlertActionKind`의 선언 순서(의미 중심)에 기대면 배열이 재배치돼 §D7을 깬다 → 서비스에 `toActionKeys`로 순서를 명시 고정했다. *중립 모델을 쓴다고 소비자가 순서를 위임할 수 있는 건 아니다.*

**`getAllRelatedTriggers` = `AlertQuery.relatedTo`**: "이 알람과 같은 규칙에서 난 알람 전부"를 필터 하나로 표현하고, 알람→규칙(objectid)→형제 알람 2단 조회는 어댑터가 흡수(4c-4c·4c-5b와 같은 원칙). 서비스에서 `objectid` 개념이 또 하나 사라졌다.

⚠️ **`activeOnly`를 새로 만들어야 했던 이유**: 원본은 `status`에 따라 `problem.get`(활성만) / `event.get`(이력 포함)으로 분기했고, **"활성으로 조회했는데 없으면 404"가 화면 계약**이다. 4c-5a의 `nativeIds`는 "활성 제약과 무관"으로 정의돼 있어 그대로 쓰면 해소된 알람이 조회돼 404가 사라진다. 조회 범위 자체가 응답을 바꾸는 사례.

**4c-5b 전이 상태 해소**: `getStatusCounts`가 레거시 Map(`problem.get countOutput` 직접)이라 같은 필터를 `AlertQuery`와 Map 양쪽으로 들고 있었다. → `countActive(AlertQuery.withSeverities)` 7콜로 전환하고 `excludeSuppressed`(Zabbix `suppressed:false`)를 신설했다. **`getEventBells`에서 레거시 Map 필터가 완전히 사라졌다.** `getEventProblems`는 목록 조회가 아직 Map이라 전이 상태가 하나 남는다(4c-5d).

⚠️ **`ProblemGetParams`에도 `suppressed`를 넣었다**: 어댑터가 경로에 따라 Map(`toParams`)과 타입 계약(`toProblemParams`) 두 벌을 쓰는데, 한쪽에만 필드를 넣으면 **같은 질의가 경로에 따라 다르게 동작**한다. 필터 추가 시 양쪽 동시 반영이 규칙.

⚠️ **삼항 연산자 타입 승격 함정**: `suppress_until`을 `cond ? 0 : millis/1000L`로 쓰면 `0`이 `0L`로 승격돼 JSON-RPC 페이로드 타입이 원본(Integer)과 달라진다. if/else로 분리. 단위 테스트가 아니면 못 잡았을 차이다.

**검증**: 516→**536 green**(+20: 어댑터 신규 테스트 11 + 서비스 재작성 9). 런타임(dev 5433 도커DB + 실 Zabbix, :3099, before/after JAR 교체) **11개 비교 그룹 전부 identical**:
- **`/event/163735287/acknowledge`** — 심각도 변경 조치가 실린 알람: `actions:["CHANGE_SEVERITY"]`·`user:"Admin"`·`oldSeverity:HIGH`→`newSeverity:DISASTER`·timestamp 전부 일치. **`AlertAction`·`AlertActor`·조치자 이름 조회·`toActionKeys` 순서를 한 응답이 동시에 덮는다.**
- `/event/182256308/acknowledge`(해소분) — `PROBLEM_RESOLVED`+`PROBLEM_CREATED` 일치.
- `/event/problems/{id}` `problemCount` 일치(= `relatedTo` 2단 조회), 해소 id를 `status=PROBLEM`으로 조회 시 `PROBLEM_NOT_FOUND` 일치(= `activeOnly` 분기 보존).
- `statusCounts` 7개 카운트가 6개 질의 변형(기본·억제포함·심각도·키워드·벨·벨심각도)에서 전부 일치.

✅ **`select_acknowledges` → `selectAcknowledges` 무해 확인**: 원본은 `event.get`에 구식 파라미터명을, `problem.get`에 신식을 섞어 썼다. 어댑터가 신식으로 통일했는데 **조치가 정상 반환**됐다(위 CHANGE_SEVERITY 응답이 증거) — 이 Zabbix는 신식을 받는다.

🔴 **쓰기 경로는 런타임 미검증**(의도적, 사용자 결정): `PUT /event/{id}/acknowledge`는 실 Zabbix 알람에 조치 이력을 남기고 **Zabbix가 ack 이력 삭제를 제공하지 않아 되돌릴 수 없다**. 대신 단위 테스트가 JSON-RPC 페이로드를 원본과 1:1로 못 박았다(비트합 15 조합·`suppress_until` 초 변환·무기한 0의 정수 타입·UNSUPPRESS가 `suppress_until`을 안 보내는 것·빈 대상/빈 조치의 `BAD_QUERY`). 실사용 시 자연히 검증된다.

> ℹ️ **선재 이슈 발견(범위 밖, 미수정)**: proto 정본에서 enum 값 `SYSTEM`이 `MetricDomain`과 `CallerRole` 양쪽에 있다. proto3는 enum 값이 **패키지 스코프**라 실제 codegen 시 충돌한다. 지금은 코드 생성을 하지 않아 무해하지만 **스텝 6(물리 분리) 전에 해소 필요**(한쪽에 접두어 부여).

> ℹ️ **proto drift 해소**: 4c-4b(`InventoryGroup`·`GroupQuery`·`ListGroups`)·4c-4c(`group_ids`·`include_entities`)·4c-5a(`native_ids`)·4c-5b(`AlertRule`·`NamedEntity`·`include_rule`·`Alert.resolved`)가 proto에 미반영이었다. 이번에 5c 신규분과 함께 전부 채웠다. **§D5는 "한쪽을 바꾸면 다른 쪽도"인데 4c-4b부터 6스텝이 밀렸다** — 스텝 종료 체크리스트에 proto 갱신을 넣을 것.

### 스텝 4c-4e 완료 기록 (2026-07-27 — 인터페이스 식별자, 필드 1개로 2메서드)

**최소 확장의 좋은 사례**: `getInterfaceGraphData`·`getInterfaceDetails`가 요청하던 `selectInterfaces[interfaceid, ip, type]` 중 `ip`(→`address`)·`type`(→`kind`)은 이미 모델에 있었고 **`interfaceid`만 없었다** → `HostNetworkInterface.nativeId` 필드 하나 추가로 두 메서드가 풀렸다. 4인자 보조 생성자를 남겨 4a~4c-4d 호출부·테스트는 무변경. **host.get 8→6곳.**

**검증**: 516 green. 런타임 5케이스 **전부 identical** — 인터페이스 상세 3건(지표 있는 호스트 2·없는 호스트 1)과 그래프 2건. 특히 그래프의 **두 에러가 서로 다른 지점에서 난다**는 점이 핵심 검증이다: 존재하는 `interfaceid=1`은 검증을 통과해 다음 단계(아이템 조회)에서 `WIDGET_NOT_FOUND`, 없는 `999`는 `INTERFACE_NOT_FOUND` — `nativeId` 매칭이 전환 전과 같은 자리에서 걸러낸다.

⚠️ **테스트 일괄 치환 주의**: 정규식으로 호스트 stub을 `InventoryHost`로 바꿀 때 `getEventsRaw`(미전환 메서드용 event.get raw) 내부의 `hosts` 필드까지 치환돼 테스트가 깨졌다. 같은 `Map.of("hostid",…)` 형태여도 **소속 API가 다르면 남겨야 한다** — 일괄 치환 후 실패 테스트로 발견.

⚠️ **작업 절차 교훈**: `bootRun`으로 서버가 떠 있는 동안 `gradlew test`를 돌리면 `build/classes`가 재컴파일되어 실행 중 JVM이 Lombok 생성 내부 클래스를 못 찾는다(`NoClassDefFoundError: ItemGetParams$ItemGetParamsBuilder`). 500 에러를 코드 회귀로 오인하기 쉽다 — **테스트를 끝낸 뒤 기동**할 것.

> ℹ️ **선재 이슈 발견(범위 밖, 미수정)**: `?selectedId=2`를 줘도 응답 `selected`가 null이다. `selected` 계산 로직은 이번 diff에 전혀 없어 전환과 무관한 기존 동작 — FE가 이 필드를 쓰는지 확인 후 별도 처리 필요.

> ✅ **4b 미검증 항목 — 2026-07-27 해소(4c-5)**: `Alert.resolvedAtMillis`의 초+나노 합성 경로가 마침내 실데이터로 검증됐다. 검증처는 `EventService.getREventsMap`(→ `/event/{id}/list-previous`의 `resolutionTime`) — 한 응답에 **미해소 폴백(null)과 해소 6건이 함께** 담겨 두 경로를 동시에 덮는다. 전/후 응답 identical.
> (경과: 4c-1 "맵 라이브에서 검증될 것" → 응답에 해소 시각 미노출로 실패 / 4c-2 "자산 라이브에서" → `LiveProblem`이 `clock`만 노출해 실패 / 4c-5에서 성공. 두 번의 예측 실패는 **"recent=true로 조회한다"와 "해소 시각을 응답에 낸다"가 다른 조건**임을 못 짚은 탓이다.)

---

## 6. 리스크

| 리스크 | 대응 | 상태 |
|---|---|---|
| authToken 제거가 인증 흐름(JwtAuthFilter·분산락)과 얽혀 회귀 | SessionProvider를 위임 래퍼로 시작(동작 이동 없음), 소유권 이동은 스텝 5 재평가 | ✅ 래퍼 적용됨 |
| HostService 2000줄 분해 | 최후 순서 + 기능 단위 분할, 한 커밋 금지 | 대기 |
| Boot 플러그인 재배치로 빌드 파손 | 스텝 0을 코드 무변경 이동으로 격리 검증 | ✅ 통과 |
| 정규화 모델의 Zabbix 오염(1개 소스만 보고 설계) | proto 규칙으로 Map 누수 차단 + Inventory/Alert 포트는 실소비자 보고 설계(스텝 4) + Prometheus에서 실검증(스텝 6), 모델 수정 예산 확보 | 진행 중 |
| 트렌드/롤업 시맨틱 소스별 상이 | Rollup을 소스 힌트로 정의(정확 일치 요구 안 함), avg 외 통계는 소비자 요구 발생 시 확장 | 진행 중 |

## 7. 명시적 유예 목록 (재논의 트리거)

- **gRPC 물리 분리**: §1 승격 조건 발생 시. proto 정본이 있어 전송 계층 삽입만으로 승격.
- **엔티티 아이덴티티 통합**: 둘째 소스에서 동일 장비 중복 표시가 실사용 문제가 될 때. 초기안=수동 매핑 테이블.
- **인증 탈-Zabbix**: Zabbix 없는 배포(Prom-only 고객) 요구 시. 그 전까지 Zabbix는 필수 소스.
- **Elastic 로그 도메인**: 별도 설계서(`devdesign_log-domain.md` 예정).
- **min/max 트렌드 통계**: 스텝 4에서 소비자 요구 확인 후 `SeriesPoint` 확장 검토.
