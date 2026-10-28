# CLAUDE.md — moveseye-be-spring 작업 가이드

> ## 🚫 이 레포는 **Codex 소유**다 (2026-08-02 협업 모드~)
>
> **⚠️ 적용 조건: [../COLLAB.md](../solutions--COLLAB.md) 최상단이 `STATUS: ACTIVE`일 때만.** `SOLO-CLAUDE`면 아래 금지가 전부 풀리고 이 레포도 Claude가 맡는다 — **작업 전 그 한 줄을 먼저 확인하라.**
>
> **Claude는 이 레포에 쓰지 않는다** — 파일 생성·수정·삭제·커밋·빌드 산출물 변경 모두 금지. **읽기는 자유**(코드 확인, 계약 해석, 원인 조사).
> BE 수정이 필요하면 직접 고치지 말고 `_workspace/features/<영역>/<기능>/contract_{feature}.md`의 `## 🔄 FE 요청사항` 섹션에 남기고 사용자에게 보고한다.
> BE(:3000) 재빌드·재기동도 Codex 담당. 규약 정본: [../COLLAB.md](../solutions--COLLAB.md)

이 문서는 **앞으로 해야 할 일 · 작업에 필요한 것 · 알려진 문제점/이슈/주의사항**을 정리한 운영 가이드다.
(프로젝트가 무엇이고 무엇이 어떻게 포팅됐는지 = 스펙은 [README.md](solutions--README.md) 참조.)

핵심 원칙: **API 계약 1:1 보존**. 응답 형식/상태코드/필드명을 바꾸면 `moveseyee_fe`가 깨진다. 변경 시 원본(`C:\solutions\moveseye-be`)을 먼저 정독하고, 불가피한 차이는 `⚠️`로 문서화한다.

---

## 0. 모듈 구조 (수집 엔진 레이어)

2026-07 다중 데이터소스 전환으로 **Gradle 멀티모듈**이 됐다. 작업 전에 어느 모듈인지 먼저 확인할 것.

| 모듈 | 역할 | 가이드 |
|---|---|---|
| **root(app)** | REST·JPA·Redis·비즈니스 로직. Boot 부팅 모듈 | 이 문서 |
| **`engine-api`** | 수집 계약 — `engine/`(소스 중립) + `zabbix/`(Zabbix 전용, 추상화 없음) | [engine-api/CLAUDE.md](engine-api/solutions--CLAUDE.md) |
| **`engine-zabbix`** | Zabbix 구현(어댑터·RPC 래퍼·키 카탈로그) | [engine-zabbix/CLAUDE.md](engine-zabbix/solutions--CLAUDE.md) |
| **`dbm-collector-core`** | DB 모니터링 수집 코어 — J1(BE)·J2(원격 수집기) 공유. **프로덕션 의존 JDK만**(Spring·JPA·PG 드라이버·lombok·slf4j 금지, 의존 그래프 + ArchUnit allowlist) | [dbm-collector-core/CLAUDE.md](dbm-collector-core/solutions--CLAUDE.md) |

🔴 **app은 `engine-api`만 컴파일 의존한다**(`engine-zabbix`는 `runtimeOnly`). app 프로덕션 코드가
Zabbix 구현을 직접 참조하면 **빌드가 깨진다** — 의도된 장치다(스텝 5).
Zabbix 전용 기능이 필요하면 `engine-api`의 `zabbix/` 구역 계약을 쓴다.

🔴 **새 BE 기능에서 Zabbix를 직접 부르지 말 것.** 메트릭·인벤토리·알람은 포트
(`MetricPort`/`InventoryPort`/`AlertPort`) 경유가 원칙이다. 관리 화면 CRUD·아이덴티티(C·D군)만 예외다.

설계 정본: `C:\solutions\_workspace\devdesign_collector-engine.md`

ℹ️ **배포 산출물은 여전히 JAR 1개다.** Spring Boot fat jar가 `engine-api`/`engine-zabbix`를
`BOOT-INF/lib/` 안에 넣어 통째로 패키징한다(`runtimeOnly`도 런타임 클래스패스라 포함된다 — 실측 확인).
파이프라인의 `docker build` → `docker run` 구조는 그대로이며, **Dockerfile의 COPY 대상만** 멀티모듈을
따라가야 한다(아래 이슈 이력 참조).

---

## 0.5. 패키지 규칙 (2026-07-28 정리)

### 규칙 — 새 코드는 이걸 따른다

1. **기능별 수직 분할이 기본.** `asset/` `event/` `report/` 처럼 기능 하나에
   controller·service·dto·repository·domain을 모두 넣는다.
   ❌ `controller/` `service/` 를 최상위나 기능 하위에 레이어 폴더로 만들지 않는다(P3에서 해체함).
2. **엔티티는 기능 안에.** `asset/domain/Asset`. 전역 `domain/`은 없다(P1에서 해체함).
3. **`common/`에 넣기 전에 한 번 더.** 도메인 로직이면 도메인으로. 실제로 2개 이상 기능이
   공유하고 도메인 색이 없을 때만 common이다.
4. **테스트 패키지는 프로덕션과 미러링.** 어긋나면 "같은 패키지라 import 없이 쓰던" 코드가
   나중에 깨진다(P3에서 실제로 겪음).
5. **`com.dmove.moveseye.zabbix.*` 는 engine-api(계약) 전용.** app의 Zabbix 관리 화면은
   `zabbixadmin/` 이다(P6에서 분리 — FQN만 보고 계약인지 화면인지 구분되게).
6. **`otel/` = OTLP 수신 공용 패키지 (2026-08-31 승격, 2026-09-01 하위 분할).** 소비자가 둘 이상이라
   승격했다 — `aimonitor/`(AI 계정 모니터링 M2)와 `premium/apm/`(APM)이 같은 OTLP http/json을 받는다.
   - **하위 패키지**: `json/`(표기를 읽는 `OtlpJson` + 중립 값 `OtlpModels.Temporality`) ·
     `metric/`(범용 리더 `OtlpMetricsReader`와 산출 모델 `OtlpMetricPoint`·`OtlpResource`·`OtlpScope`·
     `OtlpMetricKind`·`OtlpExemplar`) · **`trace/`**(2026-09-02 신설 — `OtlpTracesReader`와
     `OtlpSpan`·`OtlpSpanKind`·`OtlpSpanStatus`·`OtlpSpanEvent`·`OtlpSpanLink`) ·
     `histogram/`(`HistogramRebucketer`·`CanonicalBounds`) · `token/`(`ReceiveTokenService`, 접두 `rcv:v1:`).
     - ⚠️ **`OtlpResource`·`OtlpScope`는 신호 중립인데 `metric/`에 산다.** `trace/`가 그것을
       그대로 import한다 — 두 벌로 만들면 "메트릭은 붙었는데 트레이스는 미등록 서비스로 빠지는"
       상태가 생긴다. 이름이 사실과 어긋난 것은 알고 있고, **로그(P4)가 세 번째 소비자가 되는
       날 중립 패키지로 승격**한다(그때 이동 비용이 같고 근거가 분명하다). 근거는
       `trace/OtlpSpan` 클래스 주석.
   - **안 들어가는 것**: 수신 컨트롤러·적재 서비스 등 **도메인 로직**. `AiMonitorOtlpController`·
     `AiMonitorOtelService`는 `aimonitor/otel/`에 그대로 남는다(라이선스 503 처리·커서·중복 판정은
     AI 모니터링의 정책이다).
   - 🔴 **방향은 한쪽뿐**: `otel..`은 `aimonitor..`·`premium..`을 **import하지 않는다**. 소비자끼리도
     직접 얽히지 않는다(`premium..` → `aimonitor..` 금지). 둘 다 `otel/OtelArchitectureTest`가 막고,
     패턴이 `otel..`이라 **위 하위 패키지 전부**에 걸린다(새 하위 패키지를 만들어도 규칙 수정 불필요).
     공유가 필요하면 그 코드를 여기로 **승격**한다.
   - ✅ **`OtlpMetricsParser`는 2026-09-01에 `aimonitor/otel/`로 내려갔다**(산출물 `Point`도 함께 →
     `aimonitor/otel/AiMonPoint`). 산출 축이 userKey·model·type이라 **OTLP의 값이 아니라 AI 모니터링이
     해석한 결과**였는데, 공용 패키지에 있는 동안은 APM이 **이름만 보고** 가져다 쓸 수 있었다 —
     방향 규칙은 그 오용을 못 잡는다(import가 아니라 이름이 부르는 오용이다).
     🔴 **새 코드를 `otel/`에 넣기 전에 물을 것: OTLP가 그렇게 부르는가, 아니면 우리가 그렇게 읽은
     것인가.** APM은 `OtlpJson`/`OtlpMetricsReader` 위에 자기 해석기를 얹는다.

7. **`premium/apm/` 은 *화면 메뉴* 로 나누고, 메뉴 안은 *기능 세트* 로 나눈다 (2026-09-01 재구성).**
   이 도메인만 화면이 13개고 대부분 독립적으로 자란다 — 레이어(`api/`·`query/`·`domain/`)로 두면
   화면 하나를 고칠 때 세 폴더를 열어야 하고 어느 클래스가 어느 화면 것인지 파일명으로만 짐작하게 된다.
   ```
   overview/  (메뉴1, 3파일이라 그대로)
   service/   ApmServiceController + list/ · red/ · runtime/ · instance/ · status/ · hostlink/
              registry/ = 등록 관리 화면(컨트롤러·서비스·DTO 3) + auto/ = 자동 등록 엔진(ApmRegistrar 외 5)
   collector/ ApmCollectorController + config/ · state/ · install/ · drops/ · token/ · setting/ · ingest/
              ingest/ = 루트(ApmOtlpController·두 파이프라인) + receipt/ · resolve/ · normalize/ · store/ · drop/ · status/
   alert/     ApmAlertRuleController + rule/ · evaluate/ · bridge/ · sync/ · query/
   core/      domain/ · metric/ · batch/{rollup,retention,partition}/ · setting/
   ```
   - **① 메뉴 우선.** 그 클래스가 답하는 질문이 어느 화면의 것인가. **다른 메뉴가 가져다 써도
     정체성이 한 메뉴에 있으면 그 메뉴에 둔다** — 개요가 서비스 목록을 부르는 건 하류 의존이지
     공유가 아니다. (그래서 `ApmServiceQueryService`·`ApmServiceRowDto`는 개요도 쓰지만 `service/`다.)
   - **② 그 다음 세트 — 판정은 "같이 바뀌는가 · 같이 읽히는가".** 🔴 **서비스·저장소·DTO를
     계층(`query/`·`dto/`)으로 가르지 않는다.** 응답 DTO는 그 응답을 만드는 서비스와 항상 같이
     바뀌지만 옆 기능의 DTO와는 아무 때도 같이 바뀌지 않는다 — 그래서 **DTO는 `dto/` 하위가 아니라
     세트 폴더 바로 아래**에 둔다. 컨트롤러는 메뉴 루트, **한 폴더 5개 안팎**(10개 넘으면 한 번 더
     나눈다). 한 클래스가 여러 세트를 겸하면 **쪼개지 말고**(동작 변경 금지) 가장 큰 세트에 두고
     package-info에 적는다 — `ApmSeriesQueryService`가 `red/`에 있는 이유다.
   - **③ `core/`는 메뉴 색이 없고 실제로 둘 이상이 쓸 때만.** 짐작 말고 **import 그래프로 센다**.
     한 메뉴만 쓰면 core가 아니라 그 메뉴로 내린다 — 이 기준으로 `ApmApdex`(→`service/status`)와
     `ApmNaming`(→`service/registry`)이 core 후보에서 내려왔다. `core/query/`는 **`core/metric/`으로
     이름을 바꿨다**("query"는 계층 이름이라 무엇을 다루는지 말해 주지 않았다). `core/store/`는
     파일 하나라 `core/batch/partition/`으로 접었다 — ⚠️ 다만 `ApmPartitionService`는 **배치 전용이
     아니다**: **수신 적재**(`collector.ingest.store.ApmMetric1mStore#store`)가 **요청 시점에** 부른다
     → 이 클래스가 실패하면 배치가 아니라 **수신이 손실된다**. 폴더 이름을 보고 오해하지 말 것.
     (2026-09-01 정정: 예전 문구의 "시간창도 부른다"는 사실이 아니다 — `ApmTimeRange`는 호출하지 않는다.
     같은 날 확인된 또 하나: **롤업에 `1d` 단은 없다**(1m→5m→1h, 워터마크 키도 둘뿐) — 설계서 문구가 앞서 있다.)
   - **④ 예외: 영속 계층은 통째로 `core/domain`**(24파일). 엔티티는 FK로 얽힌 한 덩어리고 파티션·보존
     배치가 그 전체를 한 모델로 다룬다. 한 메뉴만 읽는 엔티티·리포지토리(알람 바인딩·이벤트 등)도
     여기 둔다 — 쪼개면 부모/자식 엔티티가, 엔티티와 그 리포지토리가 갈라진다.
   - ⚠️ **`service/registry/`는 DTO 평탄화로 11파일이 되어 한 번 더 갈랐다.** 경계가 뚜렷했다 —
     사람이 보는 **등록 관리 화면**과 수신이 부르는 **자동 등록 엔진**(`auto/`)은 같이 바뀌지 않는다.
     🔴 `collector.ingest.resolve`가 부르는 건 `auto/` 쪽이다(화면 아님) — `collector → service`
     방향의 실체가 이 폴더 하나로 좁혀졌다.
   - ⚠️ **세트로 가르면 `package-private`가 닫힌다.** 실제로 **4곳**을 `public`으로 열었다:
     `ZabbixAlertBridge.formatNumber`(bridge→rule) · `ApmServiceQueryService.require`(list→red) ·
     `ApmRollupService.floor`(rollup→검증) · 테스트 조립기 `ApmTestPoints`.
     **이 넷을 근거로 아무거나 열지 말 것** — 각각 주석에 이유가 있다.
     - ✅ 다섯 번째였던 `ApmCollectorConfigGenerator.DEFAULT_QUEUE_DIR_*`는 **2026-09-01에 사라졌다**.
       🔴 **세트 간에 값을 공유해야 하면 상수를 열기 전에 "이게 설정이어야 하는 값인가"를 먼저 묻는다.**
       그 값은 폐쇄망 미러·사이트 표준 디렉터리처럼 **고객사마다 달라야 하는 것**이었고, 공개 상수는
       그 요구에 재빌드로 답한다. `ApmCollectorProperties`(`app.apm.collector`) 주입으로 바꾸니
       `config`와 `install`이 서로를 모르고도 같은 경로를 말한다.
   - 🔴 **설치본별로 달라지는 값은 `*Properties`로 올린다** (`@ConfigurationProperties` +
     `@ConfigurationPropertiesScan`이 잡는다 — `@EnableConfigurationProperties`는 쓰지 않는다).
     기준은 **"고객사마다 달라야 하는가"** 하나다. 큐 경로·다운로드 베이스·주소 예시는 프로퍼티,
     **검증한 버전 번호는 코드 상수**(`ApmInstallVersions` — 고객이 바꾸면 우리가 검증하지 않은 설치가 된다),
     샘플링·메모리 기본값도 코드 상수(설치본 정책이 아니라 수집기 하나의 취향이다).
     ⚠️ 기본값을 **FE가 다시 하드코딩하지 않게** 서버가 EP로 내려 준다(`GET /apm/collectors/config-defaults`).
     키를 생략하면 코드 기본값, **빈 값을 명시하면 기동 실패**(`@NotBlank`) — 조용히 접으면
     "설정을 넣었는데 안 먹는다"가 배포 뒤에 드러난다.
   - ⚠️ **세트 폴더는 평면으로 유지한다** — 파일이 10개를 넘고 그중 **DTO가 과반**일 때만 `dto/`를
     따로 뺀다(그 전엔 DTO를 세트 폴더 바로 아래 둔다. 규칙 ②).
   - 🔴 **`core/`가 메뉴를 import하면 그건 승격 신호다.** 실제로 그렇게 했다 — 배치가 읽던
     `collector.setting.ApmSettingService`를 **`core/setting/`으로 승격**(2026-09-01). 그건 설정
     *화면*의 서비스가 아니라 **APM 전역 설정**(보존일수·롤업·stale·마스킹)이고 배치·조회·등록·수신이
     다 읽는다. 컨트롤러·DTO는 화면 계약이라 `collector/setting/`에 남았다.
     ⚠️ **그래도 역방향은 0이 아니다**: `core.setting.ApmSettingService` → `collector.setting`
     2줄이 남는다(`get()`/`update()`가 화면 DTO를 그대로 다룬다). 닫으려면 DTO도 core로 내리거나
     (core가 화면 wire shape를 갖는 대가) `get()`/`update()`만 수집기 쪽 얇은 서비스로 가른다
     (운영 호출처가 `ApmSettingController` 하나뿐이라 이음매는 깨끗하다). **세 번째 줄을 늘리지 말 것.**
     `service ↔ collector` 순환도 남아 있다(`ApmDropReason`·`ApmMetricAllowlist` ↔ `ApmRegistrar`·`Resolution`).
     상세 판정 기준·세트 지도·엣지 실측표는 `premium/apm/package-info.java`와 `core/package-info.java`.
   - 🔴 **`collector.ingest.ApmOtlpController`의 FQN은 `LicenseArchitectureTest.MACHINE_CLIENT_CLASSES`가
     문자열로 들고 있다.** 그래서 하위 세트로 내리지 않고 **`ingest/` 루트에 두었다** — 옮기거나
     이름을 바꾸면 그 목록도 같이 고쳐야 한다.
   - ✅ **`trace/`는 2026-09-02에 만들었다**(P2 1차 물결 — 파서·V44 스키마·수신 적재).
     처음에는 `trace/ingest/`의 `TraceIngestPipeline`·`ApmSpanStore`·`ApmTraceSummaryStore`·
     `ApmSpanAttrAllowlist`·`ApmSampledReason`으로 시작했으며, 현재는 `query/`·`errors/`·
     `dbquery/`·`dependency/`·`exemplar/` 조회 API와 `rollup/`도 구현돼 있다.
     - 🔴 **경계가 2026-09-01 문구와 달라졌다.** 예전엔 "`/v1/traces` **수신·적재**는
       `collector.ingest`"였는데, 갈라 보니 **수신 입구는 수집기 메뉴**(형식·크기·토큰·라이선스
       판정은 신호와 무관하고 "수집기가 잘 보내고 있나"의 일부)이고 **적재는 트레이스 메뉴**
       (스팬 스키마·요약 병합·속성 허용목록은 트레이스 화면과 같이 바뀐다)였다.
     - 🔴 **그 대가로 `collector ↔ trace` 순환이 하나 늘었다.** `collector.ingest.receive.ApmOtlpIngestDispatcher`가
       `TraceIngestPipeline`을 구체 타입으로 주입받고(🔴 인터페이스로 받으면 `@Primary`인 메트릭 파이프라인이 들어와
       **스팬을 메트릭 리더에 먹인다** — 조용히 0건 적재 + 200. 2026-10-07까지는 컨트롤러가 직접 받았다), 반대로 `trace.ingest`가
       `collector.ingest`의 `ApmIngestPipeline`(계약)·`resolve`·`drop`을 쓴다. 끊으려면 그 셋을
       `core`로 승격해야 하는데 소비자가 아직 둘이라 기준 ③을 막 넘긴 상태다 — **로그(P4)가
       세 번째 소비자가 될 때가 승격 시점.** 그 전에 이 순환을 더 늘리지 말 것.
   - ✅ **`synthetic/`은 P3에서 구현됐다.** 시나리오 CRUD·결과·달력·서비스 바인딩을 담당하며,
     Zabbix가 시나리오·측정의 정본이고 로컬에는 `core.domain.ApmSyntheticBinding`을 저장한다.
     **서비스 맵도 `servicemap/`에 구현돼 있다.**
     `ApmServiceMapQueryService`·DTO와 `ApmServiceMapController`가 담당한다.
     P3의 `messaging/`·`job/`·`report/`, P4의 `rum/`까지 포함한 경계는
     `premium/apm/package-info.java`를 따른다. 트레이스·엣지 롤업의 파티션·보존은 `core`다.

### 🔤 어휘 대응표 — 같은 것을 부르는 이름이 층마다 다르다

| 개념 | FE | app(BE) | 수집 엔진 계약 | Zabbix |
|---|---|---|---|---|
| **알람/이벤트** | `event-alert`, `alert.ts` | `event/` | **`Alert`·`AlertPort`** | `problem` / `event` |
| 호스트 모니터링 | `monitoring`, `host-monitoring.api` | `host/` | `InventoryPort`·`MetricPort` | `host` + `item` |
| 사용자·권한 | `user-roles` | `user/`(+`user/admin/`) | — (D군, 추상화 제외) | `user`·`usrgrp`·`role` |
| Zabbix 관리 화면 | `zabbix-management` | `zabbixadmin/` | `zabbix/`(계약) | `item`·`template`·`trigger` |
| 자산 | `asset` | `asset/` | — (D9, 추상화 제외) | `host.inventory` |
| 리포트 | `report-management.api` | `report/` | — | — |
| 지도 | `geomap.api`·`networkmap.api` | `geomap/`·`networkmap/` | — | — |

🔴 **가장 혼란스러운 축은 알람이다** — 같은 것을 `event`(app) / `Alert`(엔진) / `problem`(Zabbix) /
`event-alert`(FE) 넷으로 부른다. 수집 엔진이 **`Alert` 어휘를 채택**했으므로 장기 방향은 그쪽이지만,
app의 `event/` rename은 REST 경로(`/event`)와 FE까지 걸려 **별도 과제**다.
⚠️ 새 코드에서 이 넷을 섞어 쓰지 말고, 지금 있는 층의 어휘를 따를 것.

### 남은 정리 (미착수)

- `host/` 126파일 — `host/dto` 41개가 평면. 서브기능(서버목록·네트워크목록·그룹모니터링) 축으로 쪼갤 여지
- `event` ↔ `Alert` 어휘 통일(위 표) — REST 경로·FE 동반 변경이라 별도 과제

---

## 1. 앞으로 해야 할 일 (남은 작업)

| 우선순위 | 작업 | 전제/필요한 것 | 비고 |
|---|---|---|---|
| ~~🔴 배포 전 필수~~ | ~~일괄 업로드 경합 검증(F-2)~~ | — | ✅ **해소(2026-08-05)**. `CostBulkUploadJobConcurrencyIT`가 도커 PG(5433)에 붙어 **실제 2-트랜잭션 경합 6건**을 검증한다: failed→succeeded 역전 금지 · 종결 후 진행률 fencing · 동시 terminal 전이 승자 1명 · 동시 claimQueued 승자 1명 · sweep이 살아 있는 heartbeat 보존 · sweep 후 늦은 결과 거부. **결함 검출력 실증**: `finishSucceeded`에서 `and status='running'` 하나만 빼면 3건이 실패한다. ⚠️ 컨테이너가 없으면 클래스가 **skip**된다(리포트에 남음) — CI에 붙일 땐 DB를 띄우거나 Testcontainers로 승격할 것 |
| ~~🔴 배포 전 필수~~ | ~~권한 fail-open 해소 (감사 P0)~~ | — | ✅ **해소(2026-08-05, ZM-100)**. `SettingController`(4개)·`UserController`(22개)의 무시되던 `@Roles`를 걷어내고 `AdminAccessChecker.requireAdmin`을 각 메서드 첫 줄에 넣었다. 🔴 **판정은 ADMIN ∪ SUPER_ADMIN** — 선언은 SUPER_ADMIN이었으나 실제 계정에 SUPER_ADMIN이 **0명**이라(dev 실측 USER 10·ADMIN 1, V10 시드도 ADMIN) 선언대로 좁히면 전원이 잠긴다. 🔴 **4개는 일부러 열어 뒀다**: `GET /users/role/permission`(FE `useAuth`가 전 사용자에 대해 호출 — 잠그면 사이드바 전멸, 2026-06-10 사고), `GET /users/hosts`·`/users/host-groups`·`/users/host-groups/{id}`(문제 목록·그룹 모달의 필터 선택지). `AuthorizationContractIT` 9건이 실행되어 전부 green |
| ~~🟡 배포 전~~ | ~~설정 응답 비밀값 마스킹~~ | — | ✅ **해소(2026-08-05, ZM-100)**. `SettingResponseDto`가 `value`에서 비밀값 키(`password`·`secretKey`·`token`)를 **지운다**. 🔴 마스킹 문자열(`"****"`)을 넣지 않은 이유 — 폼이 그걸 되돌려 보내 **실제 비밀번호를 덮어쓴다**. 대신 `SettingService`가 "비어 오면 저장된 값 유지"로 병합하고(`@NotBlank` 제거·`toValue()`가 공백이면 키 자체를 생략), FE 두 화면은 비밀번호를 폼에 되불러 넣지 않는다. 저장된 값도 새 값도 없으면 `SETTING_PASSWORD_REQUIRED`. ⚠️ **평문 JSONB 저장 자체는 그대로다** — Vault를 안 쓰기로 해(2026-08-06) **앱 레벨 암호화**만 남았고, 별도 과제로 위에 등재했다
| ~~🟡~~ | ~~비-ADMIN 로컬 계정 인증 (감사 P1)~~ | — | ✅ **해소(2026-08-05, ZM-100)**. `JwtAuthFilter.resolveAuthToken`이 ADMIN 외 **모든** 계정을 Redis 개인 Zabbix 토큰 경로로 보내, `createInZabbix=false` 계정(zabbix_userid=null)은 로그인해도 보호 API가 전부 401이었다. 이제 `userid == null`이면 그 경로를 건너뛰고 authToken 없이 통과한다 — 🔴 **슈퍼어드민 토큰을 대신 주지 않는다**(비관리자에게 Zabbix 전권을 넘기는 것이라 P0 구멍을 다시 여는 셈). 결과: MovesEye 네이티브 기능은 쓰고 Zabbix 경유 API만 INVALID_TOKEN으로 실패하는 의도된 경계. `AuthorizationContractIT` 11건 green, 가드를 빼면 해당 1건이 실패하는 것까지 실증. ⚠️ 남은 것: 로그인→보호 API→refresh→logout **E2E**는 미작성 |
| ~~🔴 배포 전 필수~~ | ~~스케줄러 다중 인스턴스 잠금~~ | — | ✅ **해소(2026-08-11)**. `scheduler_lease` 테이블(**V21**) + `SchedulerLeaseService`. `SchedulerManager.execute` 한 곳에서 잡고 `finally`로 반납한다. 🔴 **획득은 조건부 UPDATE + PK 충돌로 원자화** — "SELECT 후 INSERT"는 두 인스턴스가 같은 순간에 보면 둘 다 통과한다(`SchedulerLeaseServiceIT`가 8스레드 동시 획득으로 검증, 그 구현으로 바꾸면 실제로 실패한다). 🔴 **`ReportSchedule`의 volatile 플래그 2개는 제거했다** — lease에 완전히 덮여 도달 불가한 죽은 코드가 되고, 남기면 "중복 방어가 있다"고 오해한다. ⚠️ **heartbeat은 없다** — 배치엔 진행률 같은 갱신 신호가 없어 TTL 30분 + 종료 시 즉시 반납으로 갔다. 크래시하면 최대 30분 잠긴다(정상 종료는 성공·실패 모두 즉시 반납). 배치가 30분을 넘게 도는 상황이 생기면 그때 heartbeat을 넣을 것. Redis가 아닌 DB를 쓴 이유는 `acquireLock`의 TTL 3초가 분 단위 배치에 부적합하고 스케줄러 상태가 이미 DB에 있어서다 |
| 높음 | **운영 JWT_SECRET 교체** | 운영 환경변수 접근 | 2026-07-16 보안 재설계로 <32바이트 시크릿은 기동 실패(`JwtTokenProvider` 부팅 검증). **dev `.env`만 교체됐고 운영은 미교체**. 🔴 Vault 전제는 폐기됐다(2026-08-06) — `.env`/OS 환경변수로 교체한다. 교체 시 기존 토큰 전부 무효 = 전원 재로그인 |
| ~~🟡~~ | ~~설정 비밀값 평문 jsonb 저장~~ | — | ✅ **해소(2026-08-12)**. `SettingSecretCodec`(AES-256-GCM) + `CREDENTIAL_ENCRYPTION_KEY`(OS 환경변수). 저장 형식 `enc:v1:<base64(iv‖ct‖tag)>`. 🔴 **키는 설치본마다 다르다** — 같은 키를 전 고객사에 쓰면 한 번의 유출이 전체 유출이고 "우리가 마스터키를 들고 있다"는 상태가 된다. 생성은 `openssl rand -base64 32`. 🔴 **키가 없으면 기동 실패**(평문 폴백은 "암호화했다는 착각"을 만든다). yml에 빈 기본값을 둔 이유는 거부를 codec이 하게 해서 **키 생성·적용 방법을 오류 메시지로 안내**하기 위함이다(플레이스홀더 단계에서 죽으면 "Could not resolve placeholder"만 뜬다). 🔴 **접두어로 평문/암호문을 판별**해 도입 전 데이터가 그대로 읽히고 다음 저장 때 승격된다 — 일괄 마이그레이션 없음. 🔴 **읽는 쪽 2곳**(`SettingBackedZabbixConnectionResolver`·`AwsServiceImpl`)이 반드시 `decrypt`를 거쳐야 한다 — 빠뜨리면 암호문이 그대로 전송돼 연동이 끊기는데 **기존 테스트는 평문만 넣어서 조용히 통과했다**(실측). 그래서 양쪽에 "암호문을 넣고 평문이 나오는지" 테스트를 두었다. 실기동 검증: 평문 → `enc:v1:…` 승격 후 Zabbix 실호출 정상 |
| 높음 | **인증 FE 브라우저 E2E** | Chrome 확장 연결 | 로그인→방치(자동 refresh)→로그아웃 흐름. BE는 curl 완전검증, FE는 tsc·로직만 검증됨(런타임 미확인). dev: FE `.env.local`로 :3001, Vite :5174 |
| 선택 | **AWS 실연동 검증** | 유효한 AWS 자격증명 + dev DB `Setting(CLOUD)`에 클라우드 접속정보 등록 | aws 모듈은 코드/빌드/라우트만 검증됨. 실 EC2/CloudWatch 호출 미검증 (`/cloud-infras/regions`가 `SETTING_NOT_FOUND`였던 이유) |
| 선택 | **나머지 단위 테스트 포팅** | 없음(바로 가능) | 원본 22개 spec 중 5개만 포팅. host 메트릭(cpu/disk/memory/network/interface)·zabbix·user-group·host-group·otp·admin·setting·encrypt/redis 남음. 동일 패턴(JUnit5+Mockito) |
| 선택 | **IT 커버리지 확대** | 없음(인프라 완비) | 2026-08-05 기준 IT 4클래스 18건(Flyway 4·자산생성 3·권한계약 5·업로드경합 6). 작성법과 함정은 §3 #13. 다음 후보: 리포트·비용 대시보드 집계, 사용자/역할 CRUD 권한 표 |
| 조건부 | **email 후속 기능** | 실제 해당 기능 사용 시 | Bull 큐(`giftLink` QUEUE 모드), VERIFY/WELCOME 템플릿. **원본도 부재/주석 상태**라 현재 동작 영향 없음 |
| 조건부 | **Socket.IO / i18n / Notification·Device 엔티티** | 해당 기능 활성화 시 | 원본도 미사용이거나 부분 구현. 필요해질 때 netty-socketio / MessageSource 등으로 신설 |

> **변환 자체는 사실상 완료.** 남은 건 외부 자원(AWS 자격증명)·실사용 필요성·테스트 보강 같은 부가 항목뿐이다.

---

## 2. 작업에 필요한 환경

- **JDK 17**: `C:\Program Files\Java\jdk-17` (시스템 기본은 Java 8 Corretto → `JAVA_HOME` 반드시 지정).
- **Gradle**: 래퍼(9.2.1) 사용. `.\gradlew.bat`.
- **dev 인프라**: PostgreSQL(localhost:5432, db `dmove`, postgres/qwe123) + Redis(localhost) + 실 Zabbix(`dmove.co.kr`).
- **환경변수 — `.env`가 정본 (2026-08-06 결정: Vault 안 씀)**: 시크릿/설정은 `moveseye-be\.env`, 운영은 OS 환경변수다.
  - 🔴 **Vault 연동은 이미 꺼져 있다.** `application.yml`의 `spring.config.import: optional:vault://`·`spring.cloud.vault.*`와 `build.gradle.kts`의 `spring-cloud-starter-vault-config`·Spring Cloud BOM이 **전부 주석 처리**돼 있다(2026-08-06 실측). **주석을 "정리"한다고 지우지도, 다시 켜지도 말 것** — 결정이 바뀌면 그때 판단한다.
  - `C:\solutions\vault\`와 `dmove-vault` 컨테이너는 **미사용 잔존물**이다(제거 여부 미결).
  - ⚠️ **`gradlew bootRun`은 `.env`를 자동 로드하지 않는다.** 먼저 `.env`를 현재 셸에 환경변수로 export한 뒤 **같은 세션에서** bootRun을 띄워야 한다. 안 하면 `${DB_PORT}` 등 플레이스홀더가 미치환돼 `APPLICATION FAILED TO START`로 죽는다. (PowerShell 헬퍼 예: `_workspace\_load_env_spring.ps1`)
- **로깅은 `logback-spring.xml`(2026-08-19)**: 프로필별 레벨 — dev: `com.dmove` DEBUG·Zabbix RPC 클라이언트 DEBUG·콘솔만 / it: root WARN / 그 외(운영, 프로필 미지정 포함): INFO + 롤링 파일(`LOG_PATH` 기본 `./logs`, 일·50MB 분할, 30일·2GB). env `LOG_LEVEL_ROOT`/`LOG_LEVEL_APP`/`LOG_LEVEL_ZABBIX`/`LOG_LEVEL_SQL`(기본 OFF)로 재기동 없이 자세 변경. 🔴 `application.yml`에 `logging.level.*`을 두지 않는다 — 두 곳이면 어느 쪽이 이겼는지 매번 확인해야 한다.
- **주기 동기화 기본 off (2026-07-16)**: `app.sync.enabled` 전역 기본값이 `false`로 변경 — 10분 주기 Zabbix 미러 동기화는 `SYNC_ENABLED=true` 옵트인. 동기화는 FE 사용자 관리 화면의 동기화 버튼(`POST /users/sync`)으로 수동 실행이 기본. 같은 날 FE `useSyncUser`의 10분 setInterval 자동 호출도 제거됨. 기본 admin은 Flyway `V10__seed_admin_user.sql` 시드(admin/qwe123)로 생성 — 구 `initDefaultAdmin()` @PostConstruct(Admin@123)는 삭제. `POST /users` 생성 시 `createInZabbix:false`면 MovesEye 전용 계정(zabbix 미연동, 동기화 삭제 대상 제외).
- **dev 프로필 (`application-dev.yml`, 2026-07-16 신설·07-16 개정)**: `SPRING_PROFILES_ACTIVE=dev`로 기동하면 DB가 **테스트용 도커 PostgreSQL**(`dmove-postgres-test`, localhost:5433)로 전환된다. Flyway는 켜져 있으므로 **빈 컨테이너여도 기동만 하면 V1(전체 스키마)~V10(admin 시드)이 자동 적용**돼 admin/qwe123으로 바로 로그인 가능 — pg_dump 복제는 실데이터가 필요할 때만. **다른 Zabbix 서버를 붙여 테스트할 때 사용** — 도커 DB 덕에 실 dev DB(5432)는 오염되지 않는다(주기 동기화는 전역 기본 off라 별도 조치 불필요). Zabbix API URL은 FE 설정화면(`POST /settings/zabbix`의 url 필드)에서 변경 가능(env 폴백, README ⚠️ #6).
- **pg_dump/psql**: `C:\Program Files\PostgreSQL\18\bin` (Flyway baseline 덤프/검증용).
- **원본 소스**: `C:\solutions\moveseye-be` (계약 확인용), FE: `C:\solutions\moveseyee_fe`.

### 빌드/기동/검증 루틴
```powershell
.\gradlew.bat build -x test        # 컴파일/빌드
.\gradlew.bat test                 # 단위 테스트
# bootRun 전: .env를 현재 셸에 export(자동 로드 안 됨 — 위 환경변수 주의 참조).
#   예) Get-Content ..\moveseye-be\.env | ? { $_ -match '=' -and $_ -notmatch '^\s*#' } |
#       % { $k,$v = $_ -split '=',2; Set-Item "env:$($k.Trim())" $v.Trim() }
#   같은 세션에서 PORT=3000 으로 bootRun → 라우트 401 또는 실로그인 검증
#   (Flyway는 기본 on — 2026-07-16부터 Spring이 스키마 단독 관리. 끌 일이 있을 때만 SPRING_FLYWAY_ENABLED=false)
```

---

## 3. 알려진 이슈 / 반드시 지켜야 할 주의사항

### 🔐 인증/세션 (2026-07-16 보안 재설계 — 원본 계약을 의도적으로 깸)
0. **토큰은 HttpOnly 쿠키, body 아님**: 로그인/refresh 응답은 `Set-Cookie`로 `accessToken`(JWT 30분, Path=/)·`refreshToken`(불투명, Path=/auth, 8h)을 내린다. **로그인 응답 body에서 `token` 필드 제거**(`LoginResponseDto`={user}만) — FE는 `withCredentials`로 쿠키 자동전송. `JwtAuthFilter`는 accessToken 쿠키 우선(+Bearer 폴백).
   - **`/auth/refresh`(신규, public)**: refresh 쿠키 검증→회전(1회용, visitorId 대조). `AuthService.refresh`. 재사용/타기기 refresh는 401.
   - **로그아웃 무효화**: `AuthService.logout(currentUser, refreshToken)`이 `USER_LOGIN_KEY` 삭제 + refresh 폐기 + Zabbix logout. 세션 TTL은 refresh 만료(8h)와 동일(과거 ≈1000일 버그 제거).
   - **JWT_SECRET ≥32바이트(256bit) 필수** — `JwtTokenProvider`가 부팅 시 검증(미달이면 기동 실패). ⚠️ **운영의 `JWT_SECRET`을 강한 값으로 교체할 것**(현재 dev `.env`만 교체됨. Vault는 안 쓴다 — 2026-08-06). 교체 시 기존 토큰 전부 무효(전원 재로그인).
   - **CORS 화이트리스트 + credentials**: `app.cors.allowed-origins`(env `CORS_ALLOWED_ORIGINS`) 명시 오리진만. `allowCredentials=true`라 와일드카드 불가. 쿠키(SameSite=Strict)·Secure는 `app.cookie.*`(dev=secure:false).
   - **rate limit / OTP 바인딩**: 로그인 실패 10회/15분·OTP 검증 5회/3분(`AuthRateLimiter`, `TOO_MANY_REQUESTS`). `verifyOtp`는 OTP의 userId와 요청 username 일치를 검증(원본은 미검증 → 타인 비번변경 가능했음).
   - **Swagger 운영 off**: `springdoc.*.enabled` 기본 false(dev 프로필만 on).

### 🔴 계약/동작 보존 (건드리면 FE 깨짐)
1. **403 → HTTP 200 보존**: 권한 거부는 HTTP 200 + body `code:403`으로 나간다(원본 버그). 401만 실제 상태코드. `GlobalExceptionHandler`에서 의도적으로 유지 — "정상화"하지 말 것.
2. **`@Roles` 적용 범위 = `@RolesGuarded` 마커**: 원본 NestJS는 `@UseGuards(RolesGuard)`가 걸린 컨트롤러에서만 `@Roles`가 동작했고, `user.controller`/`setting.controller`는 RolesGuard가 없어 `@Roles`가 **무시**됐다. Spring은 `RolesInterceptor`가 전역 등록이므로, **클래스에 `@RolesGuarded`가 있을 때만** `@Roles`를 검사하도록 했다.
   - ⚠️ **새 컨트롤러에 `@Roles`를 달 때**: 원본에서 RolesGuard가 걸린 컨트롤러였다면 `@RolesGuarded`도 함께 붙여야 검사가 동작한다. 안 붙이면 `@Roles`가 조용히 무시된다. (현재 마커 보유: `AdminUserController`, `AdminUsrgrpController`)
   - 🔴 **admin 계정은 `@RolesGuarded`+`@Roles`로 막힌다(2026-06-23 발견).** `RolesInterceptor`는 `@Roles`를 JWT의 **`roleid`** 와 비교하는데, admin은 zabbix 미연동이라 `zabbix_userid=NULL` → 로그인 시 `roleid`가 안 채워져(`AuthService`) null. `"ADMIN".equals(null)=false` → 항상 거부(HTTP200 body code403). 기존 admin 화면들은 FE가 `@RolesGuarded` 없는 `/users` EP를 써서 안 드러났을 뿐. **FE에서 호출하는 관리자 전용 신규 EP는 roleid 기반 `@RolesGuarded` 대신 userRole 기준으로 검사하라** — `AdminAccessChecker.requireAdmin(currentUser)`(userRole이 ADMIN/SUPER_ADMIN인지) 패턴 사용. 전역 `RolesInterceptor`는 건드리지 말 것(타 화면 회귀).
3. **JSON-RPC 본문은 직렬화 문자열로 전송**: `ZabbixClient`에서 `.body(객체)`로 보내면 JDK HttpClient가 chunked 스트리밍 → Zabbix가 `Invalid JSON(-32700)`. 반드시 `objectMapper.writeValueAsString()` 문자열 본문 사용.
4. **날짜는 UTC 전제**: `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` 고정 패턴. 서버/DB TZ가 UTC가 아니면 출력이 어긋난다.
5. **Lombok boolean is-접두 함정**: `private boolean isXxx` → Lombok `isXxx()` → Jackson이 "is"를 떼어 JSON 키가 `xxx`로 바뀐다. is-접두 필드명을 JSON에 보존해야 하면 `Boolean` 래퍼로 선언할 것(getter `getIsXxx()`).
6. **JPA 역방향 @ManyToMany 미저장**: inverse-side는 save해도 정션이 안 써진다 → 정션 엔티티(UserUserGroup, UsergroupHostgroup)로 owning-side 조작.

### 🟡 운영/데이터 주의
7. **Flyway = 스키마 정본 (2026-07-16, Spring 단독 관리 전환)**: Nest 병행이 끝나 스키마는 Flyway가 단독 관리하며 **전 환경 기본 on**이다(과거의 "dev는 SPRING_FLYWAY_ENABLED=false" 관례 폐기). 빈 DB는 V1이 전체 스키마를 생성하고, 기존 DB는 baseline-on-migrate로 이어받는다.
   - 🔴 **이미 적용된 마이그레이션 파일은 절대 수정하지 말 것.** Flyway는 적용 완료된 버전을 재실행하지 않으므로, 기존 `Vn__*.sql`에 `ALTER TABLE ...`을 덧붙여도 **기설치 환경에선 그 DDL이 영영 실행되지 않는다**(파일만 바뀌고 DB는 그대로 → 컬럼 누락). 게다가 파일 변경은 checksum mismatch로 `validate`를 깨뜨린다. 스키마 변경은 **반드시 새 `V(n+1)__*.sql`로 분리**하고, `ADD COLUMN IF NOT EXISTS` 등으로 멱등하게 작성한다. (2026-06-22 host_group_report `hosts` 컬럼을 V3에 덧붙였다가 누락 → V3 원복 + 신규 V4 분리로 해결한 사례.)
8. **zabbix 연동 USER는 password가 NULL**: ZABBIX platform 계정은 이메일 인증으로 최초 비밀번호를 발급받는 온보딩 구조라 DB password가 비어 있다(직접 로그인 불가). E2E 테스트 시 임시 비밀번호 주입 후 **반드시 NULL로 원복**.
9. **Zabbix 권한 의존**: 제한된 Zabbix 계정(예: guest)은 `problem.get` 등에 `No permissions` → ZabbixClient가 INVALID_TOKEN(401)로 매핑. 버그 아님(원본 권한 의존 거동). 데이터가 안 보이면 Zabbix 계정 권한부터 의심.
10. **pg_dump 18 메타명령**: `pg_dump --schema-only` 출력 상단/하단의 `\restrict`/`\unrestrict`는 psql 메타명령이라 Flyway가 파싱 못함 → 덤프 갱신 시 제거 필요.

14. **스케줄러 job은 실패하면 예외를 던진다 (2026-08-05 ZM-100)**: `SchedulerJob.run` 안에서 `catch`로
    로그만 남기고 정상 반환하면 `SchedulerManager`가 **실패를 성공으로 기록**한다(false-green) —
    화면의 실행 이력이 거짓이 되고, "안 돈 것"과도 구분되지 않는다. 매니저가 예외를 잡아
    `recordFailure`를 남기고 **다음 실행도 취소하지 않으므로** 던지는 쪽이 안전하다.
    - 🔴 `UserSchedule`·`ReportSchedule`이 정확히 그 상태였고, 테스트마저 "삼켜진다"를 정답으로
      고정하고 있었다. 지금은 `SchedulerManagerTest.swallowingJobIsRecordedAsSuccess`가
      **삼키면 성공으로 찍힌다는 사실 자체**를 못박아 재발을 막는다.
    - **부분 실패**(그룹 40개 중 2개 실패)는 예외가 아니라 요약 문자열(`ok=38 fail=2`)로 알린다.
      예외로 다루면 나머지 38건이 묻힌다. 다만 **전부 실패**면 그건 실패이므로 던진다.

### 🟢 빌드/테스트 주의
11. **Gradle 9 + JUnit5**: `testRuntimeOnly("org.junit.platform:junit-platform-launcher")` 없으면 "Failed to load JUnit Platform". 이미 추가됨.
12. **PG enum / jsonb / quoted 컬럼**: `@Enumerated(STRING)+@JdbcType(PostgreSQLEnumJdbcType)`, jsonb는 `@JdbcTypeCode(SqlTypes.JSON)`, camelCase 컬럼(`"lastName"`)은 `globally_quoted_identifiers`로 처리. 엔티티 추가 시 동일 패턴 유지.
13. **통합 테스트(IT) 작성법 (2026-08-05 신설)**: 웹 계층까지 띄우는 IT는 `support/IntegrationTestSupport`를 상속하고 `@EnabledIf("testDatabaseAvailable")`를 붙인다. 도커 dev 컨테이너(5433) 안에 `moveseye_it` DB를 **매 실행 drop&create** 하므로 빈 DB에 Flyway가 V1부터 전량 적용되고, dev 데이터(`dmove`)는 오염되지 않는다. 프로필은 `it`(`src/test/resources/application-it.yml` — 필수 env 9개 더미 고정). **DB는 진짜, 외부(Zabbix·Redis)는 `@MockBean` 대역**이 원칙.
    - 🔴 **인증은 실제 JWT 쿠키로만 선다.** `SecurityMockMvcRequestPostProcessors.authentication()`도 `request.setUserPrincipal()`도 **둘 다 401**이다 — 체인이 `STATELESS`라 세션 컨텍스트를 복원하지 않는다. `IntegrationTestSupport.as(role)`가 `JwtTokenProvider`로 토큰을 발급해 `accessToken` 쿠키로 싣는다.
    - 🔴 **`x-visitor-id` 헤더만으로는 못 뚫는다.** `VisitorIdCheckInterceptor`가 그 값을 **Redis의 로그인 세션 값과 대조**한다 → Redis 대역이 같은 값을 돌려줘야 통과.
    - 🔴 **Redis의 Zabbix API 토큰 형식은 `토큰:?:만료초` 3부분**이다(`JwtAuthFilter.extractExpiresAt`이 `parts[2]`를 읽음). 2부분으로 대역을 만들면 만료가 0으로 읽혀 재발급 경로(락 재시도 + 실제 Zabbix 호출)로 새 나가고 401이 된다.
    - ⚠️ **DB가 없으면 skip된다**(리포트에 남음). CI에 붙일 때는 DB를 보장하고 이 skip을 **실패로 승격**할 것 — 안 그러면 "IT가 있다"는 사실만 남고 한 번도 안 도는 상태가 된다.
    - ℹ️ **Testcontainers는 철회했다.** 이 환경(Windows + Docker Desktop, Engine 29.1.3)에서 docker-java가 `/info` 협상에 실패(HTTP 400)해 도커가 멀쩡한데도 "없음"으로 판정된다. 1.19.8→1.21.3 승격·`DOCKER_HOST`·`DOCKER_API_VERSION=1.44`를 다 줘도 동일했다. 경위는 `build.gradle.kts` 주석.
    - ⚠️ **`gradlew clean`이 실패하면 그 상태로 두지 말 것.** 잠긴 jar를 반쯤 지운 채 성공한 것처럼 보이고, 이후 `engine-api` 클래스 누락으로 `compileJava`가 깨진다. 남은 java 프로세스를 정리하고 `:engine-api:compileJava --rerun-tasks`로 복구한다.
14. **Redis 읽기-통과 캐시는 `common/redis/RedisCache` 하나로 (2026-09-23 신설, `RedisClientService`도 같은 패키지 `common/redis`)**: `getOrLoad(key, type, ttl, loader)` / `reload(...)`(refresh=true) / `evict`. 서비스에 `readCache/writeCache + try/catch`를 다시 복붙하지 말 것 — 실패 격리(Redis 장애=미스, 500 금지)·깨진 값 자가 삭제(`@Jacksonized` 누락·스키마 변경)·**스탬피드 방어**(`SingleFlightExecutor`, 같은 키 동시 미스에 로더 1회)·null 미저장이 전부 여기 있다. 호출처 6곳(홈 요약·시스템 상태·자산 라이브·구성 현황·이벤트 가시 호스트·태그 필터 가드)이 이미 이걸 쓴다. 🔴 키에 사용자(principal) 축을 넣는 건 호출처 책임(공유 결과). 인스턴스 **간** 합류는 없다(설치형 1벌 배포 결정, HA 요구가 생기면 이 클래스 안에서 `acquireLock`으로 확장). `reload`는 별도 flight 키라 진행 중 일반 조회에 합류하지 않는다(새로고침 계약, 검수 🟡1) · 합류자는 30초(`JOIN_TIMEOUT`)까지만 기다리고 초과하면 스스로 계산한다(`SingleFlightExecutor.run(key, supplier, timeout)`, 검수 🟡2 — 차트 증분의 2인자 `run`은 무제한 그대로). 단위 테스트는 `RedisCacheStubs.passthrough(mock)`로 "항상 미스"를 깔고 히트 케이스만 키로 덮어쓴다; 실제 JSON 왕복은 `RedisCacheRoundTripTest`(인메모리 `StringRedisTemplate` 대역)가 본다.

15. **APM 보존 DROP은 콜드 아카이브 게이트를 지난다 (2026-10-01 ZM-156)**: `ApmPartitionService.dropExpired(…)`는 **`ApmRetentionService`만** 부른다(`ApmArchiveGateArchTest`가 강제) — 다른 곳에서 부르면 "보관 안 된 날은 지우지 않는다"는 게이트가 무력화된다. 아카이브가 꺼져 있으면(기본, `archive_setting(APM).enabled=false`) 보존 서비스는 **예전 호출 그대로**이고, 켜져 있으면 아카이브 데이터셋 테이블만 `dropExpired(table, days, guard)`로 판정을 받는다. 새 파티션 데이터셋을 `ApmArchiveDataset`에 더하면 `ApmRetentionArchiveGateTest#everyPartitionDatasetIsGated`가 보존 경로에 그 테이블이 있는지 본다. 공통 아카이브 기반(원장·ZIP 작성기·경로 정책·`/archives` EP)은 premium 밖 `com.dmove.moveseye.archive`(자빅스 아카이빙이 기본 기능이라). 🔴 허용 루트 `ARCHIVE_ALLOWED_ROOTS`가 비면 기능이 켜지지 않고, 컨테이너는 그 경로를 **볼륨으로 마운트**해야 한다(배포 파이프라인 반영). 계약 `_workspace/features/apm/cold-archive/contract_apm-cold-archive.md`. 🔴 코덱스 v1 반영 후의 규칙: 게이트 판정~DROP·관리자 삭제·게시+원장 OK는 **같은 (소스, 데이터셋, 날짜) PG advisory lock**(`ArchiveDayLock`, 트랜잭션 안에서만) 아래에서 원장·실물을 다시 읽는다 · 원장 `file_path`로 파일을 만지기 전엔 반드시 `ArchivePathPolicy.checkManagedFile` · APM 아카이브 설정 행이 손상되면 보존 정리가 **멈춘다**(fail-closed — 화면에서 다시 저장해 고친다).

---

## 4. 해결된 이슈 이력 (참고)

| 날짜 | 이슈 | 해결 |
|------|------|------|
| 2026-06-10 | **FE 사이드바 미표시** — admin 로그인 시 `/users/role/permission`이 403 → FE `permissions` 미수신 → 메뉴 전멸 | RolesInterceptor 전역등록이 원본에 없던 `@Roles` 강제를 추가한 회귀. `@RolesGuarded` 마커로 원본 RolesGuard 적용 범위 1:1 재현 (주의사항 #2) |
| 2026-06-10 | jjwt `WeakKeyException`(JWT_SECRET 256bit 미만) | auth0 java-jwt로 교체 |
| 2026-06-10 | Zabbix `Invalid JSON(-32700)` | JSON-RPC 문자열 본문 전송 (주의사항 #3) |
| 2026-06-10 | aws 모듈 `Instance` 레코드 ↔ AWS SDK `Instance` 충돌 | 레코드를 `InstanceRef`로 rename |
| 2026-07-28 | 🔴 **Dockerfile이 멀티모듈을 모름** — `settings.gradle.kts`가 `include("engine-api")`/`include("engine-zabbix")` 하는데 Dockerfile은 `src`만 COPY. 멀티모듈 도입(07-23) 이후 Dockerfile(07-06 최종수정)이 안 따라가 **master 배포가 구성 단계에서 실패할 상태**였다(작업이 전부 ZM-87 브랜치라 파이프라인이 안 돌아 안 드러남) | `COPY engine-api ./engine-api` · `COPY engine-zabbix ./engine-zabbix` 추가 + 빌드 스크립트만 먼저 복사해 의존성 캐시 레이어 복구 |

---

## 5. 변환 작업 방식 (다음 세션 가이드)

1. 원본 모듈을 먼저 정독(`C:\solutions\moveseye-be\src\...`) → 엔드포인트/DTO/계약 quirk 파악.
2. 모듈 단위로 변환(엔티티 → 서비스 → 컨트롤러 → DTO).
3. 빌드(`build -x test`) → 기동 → 라우트/실데이터 검증으로 그린 유지.
4. 계약 quirk·의도적 차이는 코드 주석과 README에 `⚠️`로 남긴다.
5. 큰 변경(권한/전역 설정)은 원본의 가드/인터셉터 **적용 범위**까지 확인 — 데코레이터만 보고 옮기면 범위가 과해진다(사이드바 이슈 교훈).
