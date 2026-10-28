# features/apm/core/contract_apm.md — APM 계약서

APM(애플리케이션 모니터링) 구현의 누적 계약서. 단계가 진행될 때마다 섹션이 늘어난다.
설계 정본은 `_workspace/features/apm/core/devdesign_apm.md` v3.1 · 화면/WBS는 `features/apm/core/devdesign_apm-screens-wbs.md`.

| 섹션 | 범위 | 상태 |
|---|---|---|
| §1 | 스키마 V38 (P1 DB층) | ✅ 2026-08-31 |
| §2 | 수신·토큰·설정·등록 API (OTLP 수신 · 토큰 · 설정 · 등록 엔진) | ✅ 2026-08-31 · **결선 완료(§2.8)** |
| §3 | 적재 파이프라인 (허용목록·정규화·차분·1m 적재·수집기) | ✅ 2026-08-31 |
| §4 | 조회 API (`/apm/**`) | 별도 계약서 `features/apm/core/contract_apm-read-api.md` |
| §5 | 배치 잡 3종 (파티션 선생성 · 롤업 · 보존/자동 숨김) | ✅ 2026-08-31 |
| §6 | 알람 (`history.push` 계약 · Zabbix 브리지 · 평가/동기화 배치 · 규칙 API) | ✅ 2026-08-31 |
| §7 | **P2 트레이스 1차 물결** — 파서 · 스키마 V44 · `/v1/traces` 수신·적재·요약 · tail 샘플링 옵션 | ✅ 2026-09-02 (WBS 3.1~3.4) |

> 🔴 **2026-09-03 · 권한 축 전환 (`V48`)** — APM 접근 판정이 **역할(`ADMIN`)에서 DMOVE 권한으로** 옮겼다.
> 모듈 `applicationMonitoring` / 기능 **`apm`**, 칸은 `view`(조회 36 EP) · `edit`(관리 26 EP), 관리자는 우회.
> 기본값 `view=true`·`edit=false`이고 기존 역할은 `V48`이 백필한다(백필이 없으면 역할 편집 화면에
> 체크박스 자체가 안 뜬다). **원문 열람만 역할 축에 남았다**(스택·스팬 속성 — 고객 데이터).
> 상세·FE 소비 키·거부 문구는 `features/apm/core/contract_apm-read-api.md` §10.5.

---

## §1 스키마 — `V38__apm_p1.sql`

작업 위치: `C:\worktrees\apm-be-schema` (브랜치 `apm-be-schema`, **미커밋**).
패키지: `com.dmove.moveseye.premium.apm` — 라이선스 ArchUnit A1~A5의 `premium..` 규칙 적용 대상.

> ⚠️ 설계서 §7은 이 마이그레이션을 "V36"으로 적고 있으나 그 사이 V36(asset_cloud)·V37(asset_version)이
> 들어가 **실제 번호는 V38**이다. 설계서 §7의 P2/P3/P4도 각각 한 칸씩 밀린다(V39/V40/V41 예정).

### 공통 규칙 (이 도메인 전체에 적용)

- 시각 컬럼은 `NOT NULL`, **`DEFAULT now()` 금지**(V30 교훈) — 적재 시각은 앱이 만든 값이어야 백필이 정직해진다.
- enum은 전부 **varchar**(PG enum 아님). 값 추가에 마이그레이션이 붙지 않게.
- 정규화 컬럼은 **NULL 대신 빈 문자열**. PG UNIQUE는 NULL을 중복으로 보지 않아, NULL을 허용하면 같은 것이 수신마다 새 행이 된다.
- 서비스 참조는 내부 `service_id`(bigint FK) / 외부 노출 `service_uid`(UUID).
- 전부 `IF NOT EXISTS` 멱등 DDL.

### 테이블 14개

| 테이블 | 키 / 자연키 | 보존 | 인덱스 |
|---|---|---|---|
| `apm_service` | PK id · **UNIQUE(service_uid)** · **UNIQUE(name_norm, env_norm)** | 영구(자동 숨김 TTL 후 삭제) | `state`, `last_seen_at` |
| `apm_instance` | PK id · UNIQUE(service_id, instance_id) · FK→service CASCADE | 미수신 30일 후 삭제 | `(service_id, last_seen_at)` |
| `apm_receive_token` | PK id · UNIQUE(token_hash) | 영구 | (UNIQUE가 인덱스) |
| `apm_collector` | PK id · UNIQUE(token_id, collector_instance_id) · FK→token CASCADE | 영구 | — |
| `apm_otlp_receipt` | PK id · UNIQUE(token_id, body_sha256) · FK→token CASCADE | 단기(TTL 청소) | `received_at` |
| `apm_hist_bounds` | PK id(**integer**) · UNIQUE(bounds) | 영구(삭제 금지) | — |
| `apm_metric_1m` 🔷 | PK(service_id, instance_id, metric, dims_hash, bucket_start) | 7일 | `(service_id, metric, bucket_start)` |
| `apm_metric_5m` 🔷 | PK(service_id, metric, dims_hash, bucket_start) | 30일 | `(service_id, metric, bucket_start) INCLUDE (dims_hash)` |
| `apm_metric_1h` 🔷 | PK(service_id, metric, dims_hash, bucket_start) | 400일 | `(service_id, metric, bucket_start) INCLUDE (dims_hash)` |
| `apm_ingest_drop_stat` | PK id · UNIQUE(token_id, reason, metric_name) · FK→token CASCADE | 30일 롤링 | — |
| `apm_pending_service` | PK id · UNIQUE(name_norm, env_norm) | 승인/거절 시 삭제 | — |
| `apm_alert_rule` | PK id · UNIQUE(rule_uid) · FK→service CASCADE(nullable=전역) | 영구 | `service_id` |
| `apm_alert_event` | PK id · FK→rule/service CASCADE | 400일 | `(service_id, fired_at)` |
| `apm_setting` | PK key(varchar) | 영구 | — |

🔷 = `PARTITION BY RANGE (bucket_start)` 일 단위 파티션.

### 설계서 §7과 다른 점 (전부 의도적)

1. **`apm_pending_service`에 `name_norm`·`env_norm`·`last_seen_at`·`seen_count` 추가** — 정규화 키가 없으면 대기열이 수신마다 한 행씩 늘고, 승인 시 `apm_service` 자연키로 승격할 수도 없다.
2. **`apm_hist_bounds.id`를 integer로** — 이 값이 1m 테이블 1억 행에 실린다. bigint면 행마다 4바이트를 더 낸다.
3. **메트릭 테이블의 `bounds_id`에 FK 없음** — 파티션 테이블 FK는 행마다 트리거를 태우는데 이 경로는 분당 1만 행이다. `apm_hist_bounds`는 삭제하지 않는 참조 테이블이라 위험이 거의 없다.
4. **`apm_service.host_name_override` 추가**(§2.1 "수동 보정"의 저장 자리), **`apm_metric_5m/1h`에도 `exemplar_trace_id` 유지**(롤업 시 대표 예시 1건 보존).

### 파티션

- 이름 규칙: **`<table>_p<yyyyMMdd>`** (예: `apm_metric_1m_p20260831`). 담당 범위는 `[day 00:00, day+1 00:00)`.
- 초기 파티션은 **DO 블록으로 `CURRENT_DATE - 1` ~ `CURRENT_DATE + 2`(4일치)를 동적 생성**한다. 🔴 날짜 하드코딩 금지 — 설치 시점이 언제든 동작해야 한다.
- 🔴 **DEFAULT 파티션을 만들지 않는다.** 있으면 범위 밖 행이 거기 쌓여 보존 정리가 "파티션 통째 DROP"이라는 값싼 연산을 못 쓰게 된다. 범위 밖 시각은 적재 계층이 `ensurePartition`으로 그때 만든다. 안 만들면 insert가 **실패한다**(원하는 동작 — 조용히 삼키지 않는다).

### 시드

| 대상 | 값 |
|---|---|
| `apm_hist_bounds` 2행 | `duration_s` = `{0.005,0.01,0.025,0.05,0.075,0.1,0.25,0.5,0.75,1,2.5,5,7.5,10}` · `gc_s` = `{0.001,0.005,0.01,0.05,0.1,0.5,1,5}` |
| `apm_setting` 8행 | `registration_mode=AUTO` · `hidden_after_days=14` · `stale_minutes=5` · `default_error_rate_pct=5` · `default_p95_ms=2000` · **`mask_sql=true`** · **`keep_raw_sql=false`** · `route_limit=500` |
| `scheduler_setting` 3행 | `apm_rollup`(interval 5분) · `apm_partition_maintain`(daily 00:30, `{"aheadDays":2}`) · `apm_retention`(daily 01:30, `{"raw1mDays":7,"rollup5mDays":30,"rollup1hDays":400,"instanceIdleDays":30,"dropStatDays":30}`) |

🔴 배치 시드는 넣었지만 **해당 `SchedulerJob` 빈은 아직 없다**. `SchedulerManager.schedule()`이 빈 없는 설정을 경고 로그만 남기고 skip하는 것을 코드로 확인했으므로 기동은 깨지지 않는다. 잡을 만드는 다음 과제에서 `job_key`를 이 셋과 정확히 맞춰야 한다.
🔴 `apm_partition_maintain`·`apm_retention`은 정리 계열이므로 구현 시 **`requiresActiveLicense()=false`** 로 둔다 — 만료돼도 파티션 선생성과 보존 삭제는 계속 돌아야 디스크가 안 찬다.

---

## §1.2 Java 계약

### 엔티티 · 리포지토리 — `premium/apm/core/domain/`

11쌍. 파티션 테이블 3종은 **엔티티 없음**(JDBC 전용 — 분당 1만 행 경로에 영속성 컨텍스트를 끼우지 않는다).

`ApmService` · `ApmInstance` · `ApmReceiveToken` · `ApmCollector` · `ApmHistBounds` · `ApmIngestDropStat` · `ApmPendingService` · `ApmAlertRule` · `ApmAlertEvent` · `ApmSetting` · `ApmOtlpReceipt`

**배열·jsonb 매핑 방식**: 별도 라이브러리(hypersistence 등)·컨버터 **없이** Hibernate 6 기본 배열 매핑을 쓴다.
- `text[]` ↔ `String[]` (`ApmService.tags`, `ApmReceiveToken.scopes`) — 애노테이션 없이 필드 타입만으로 매핑된다.
- `double precision[]` ↔ `double[]` (`ApmHistBounds.bounds`)
- `jsonb` ↔ `Map<String,Object>` — 레포 기존 패턴 `@JdbcTypeCode(SqlTypes.JSON)` (`ApmPendingService.sampleResource`)

이 레포에 배열 컬럼 엔티티는 이번이 처음이라 추론 대신 **IT 왕복으로 증명**했다(빈 배열·한글 원소·중첩 맵 포함).

**주요 도메인 메서드** — 전부 "조용히 틀리는 것"을 막는 규칙이다:
- `ApmService.touchSeen(LocalDateTime)` — 숨김은 자동 해제, **승인 대기는 건드리지 않는다**(수신이 온다고 승인되면 APPROVE 모드가 무의미).
- `ApmReceiveToken.revoke()` / `isRevoked()` — 재호출이 최초 회수 시각을 밀지 않는다.
- `ApmAlertEvent.resolve()` / `isOpen()` — 최초 해소 시각이 진실. `resolved_at` null = 열림(**0·epoch로 채우지 않는다** — ZM-99 사고 재발 방지).
- `ApmInstance.touchSeen(at, version, hostName)` — 값이 안 온 필드는 덮어쓰지 않는다.
- `ApmCollector.updateStats(...)` — 없는 값을 0으로 채우지 않는다("실패 0건"이라는 틀린 안심 방지).

### `ApmNaming` (정규화 · 설계서 §2.1)

`normalize(String)` = **trim → NFC → `toLowerCase(Locale.ROOT)` → 128 절단**.
- NFC를 소문자보다 먼저(결합 문자 합침), 절단을 마지막에(정규화가 길이를 바꾼다).
- `Locale.ROOT` 고정 — 기본 로케일이면 터키어 환경에서 `I`가 `ı`로 접혀 같은 이름이 서버마다 다른 키가 된다.
- null/공백 → `""`.
- `truncate(String)` — 원문 보존용 길이 맞춤(수신 경로 실패 = 데이터 손실이므로 자르고 넣는다).
- `isUnknownService(String)` — `unknown_service*`는 어떤 모드에서도 서비스로 만들지 않는다.

### `ApmPartitionService` — `premium/apm/core/batch/partition/`

| 메서드 | 계약 |
|---|---|
| `ensurePartition(String table, LocalDate day)` | 멱등. **실제로 생성했으면 true**, 이미 있었으면 false. 프로세스 내 `Set<String>` 캐시. |
| `ensureAhead(int aheadDays)` | 오늘~D+n을 세 테이블에. 생성한 수 반환. |
| `dropExpired(String table, int retentionDays)` | `pg_inherits`/`pg_class`로 파티션 열거 → 이름의 날짜 파싱 → `day < today - retentionDays`면 DROP. 삭제 수 반환. |
| `dropExpired(List<TableRetention>)` | 테이블별 보존 일수를 한 번에. |
| `listPartitions(String table)` | 카탈로그 기준(캐시가 아니라). |
| `partitionName(String, LocalDate)` | static. 이름 규칙의 유일한 출처. |

🔴 **테이블 이름 화이트리스트**(`PARTITIONED_TABLES`) — 테이블/파티션 이름은 바인딩 파라미터로 못 넘겨 SQL 문자열에 끼워 넣으므로, 밖에서 온 문자열이 들어가는 길을 원천 차단한다.
🔴 **동시 생성 경합** — `IF NOT EXISTS`가 있어도 두 인스턴스가 같은 순간 진입하면 PG가 duplicate를 낸다. 예외를 잡고 카탈로그를 다시 확인해서 남이 만들어 준 것이면 성공으로 친다(수신 경로의 실패는 곧 데이터 손실).
🔴 **`CREATE TABLE IF NOT EXISTS`는 이미 있어도 성공한다** — 그래서 실행 결과로는 "만들었다"를 알 수 없다. 캐시 미스 시 카탈로그를 먼저 조회해 구분한다(안 그러면 선생성 배치가 매일 "12개 생성"이라 보고해 아무도 그 수를 안 믿게 된다).
🔴 DROP 시 **캐시에서도 지운다** — 안 그러면 같은 날짜가 다시 필요할 때 "있다"고 믿고 넘어가 적재가 실패한다.

**보존 경계**: `retentionDays=7`이면 오늘 포함 **8일치**가 남는다(`day < today-7`만 삭제). 경계에서 하루 덜 지우는 쪽으로 기울였다 — 지우는 실수는 되돌릴 수 없고 남기는 실수는 다음 날 정리된다.

---

## §1.3 검증

`src/test/java/com/dmove/moveseye/premium/apm/ApmSchemaIT.java` — **19건 전부 실행·통과**(skip 0, 도커 PG 5433 `moveseye_it` 실 적용).
전체 스위트 `:test` **1529건 green**.

커버 범위: 테이블 14개 존재 · RANGE 파티션 전략 · 초기 파티션 4일치가 `CURRENT_DATE` 상대 · DEFAULT 파티션 부재 · 시드 3종 · 배열/jsonb 왕복(빈 배열·한글·중첩) · 파티션 라우팅과 범위 밖 거부 · `ensurePartition` 멱등 · `dropExpired` 경계 · 화이트리스트 거부 · UNIQUE 3종(서비스 자연키 / 빈 env / 경계 중복).

**동반 수정**: `LicenseArchitectureTest` A3의 대상을 `com.dmove.moveseye..` 안의 Repository로 한 번 더 좁혔다. 그러지 않으면 Spring Data의 `JpaRepository` 자체가 "premium 밖의 Repository"에 걸려 **premium 리포지토리가 상속만 해도 위반**이 된다(APM 11개 전부가 이 이유로 빨갰다). 규칙의 뜻은 app 도메인 리포지토리 참조 금지이지 프레임워크 상속 금지가 아니다.

---

## §1.4 다음 단계가 알아야 할 것

- `apm_metric_*`는 엔티티가 없다 — 적재·집계는 JDBC로 짜고, 파티션 보장은 반드시 `ApmPartitionService.ensurePartition`을 먼저 부른다(DEFAULT 파티션이 없어 안 부르면 insert가 실패한다).
- `bounds_id`는 FK가 없다 — 적재 계층이 `apm_hist_bounds`를 부팅 시 캐시해 쓰고, **행을 절대 지우지 않는다**.
- `dims_hash` = sha256(허용 키만 키 정렬한 canonical JSON, 빈값은 `''`, 값 256 절단). `dims` 원문도 함께 저장해 충돌 시 원문 비교(§4.3 A3).
- 배치 3종의 `job_key`는 위 시드와 정확히 일치해야 한다.
- 컨트롤러를 만드는 순간 **`@RequiresFeature(Feature.APM)`이 필수**다(ArchUnit A2가 강제). 단 OTLP 수신 EP는 `@LicenseExempt` + 컨트롤러 자체 라이선스 확인 → **503**(200이면 exporter가 성공으로 읽고 데이터를 버린다). A5·A5-c 허용목록에 추가가 필요하다.

---

## §2 수신·토큰·설정·등록 API — `premium/apm/{token,setting,registry,ingest}/` (WBS 0.4 · 0.5a · 0.6)

작업 위치: `C:\worktrees\apm-be-schema` (브랜치 `apm-be-schema`, **미커밋**).
정본: 설계서 §2.1·§4.1·§4.2·§8.1 + 실측 `_workspace/features/apm/core/r1_apm-collector-roundtrip.md` §2.1·§2.7·**§3(응답 코드)**.

### 공통 규약

- **관리 API**(`/apm/receive-tokens`·`/apm/settings`·`/apm/services/*`·`/apm/ingest/recent`)는 이 레포의 전역 계약을 그대로 따른다: 성공·실패 모두 **HTTP 200**, 본문 `{status, code, errorCode?, message?, data}`. 거부는 200 + `code:403`이다(실제 403으로 "정상화"하면 FE axios 인터셉터가 세션 만료로 오인한다).
- **수신 API**(`/apm/otlp/**`)만 **실제 HTTP 상태 코드**를 쓴다 — 클라이언트가 브라우저가 아니라 exporter다.
- 권한: 관리 API는 **`apm.edit` 칸**으로 판정한다(2026-09-03 전환 — 그 전에는 `AdminAccessChecker.requireAdmin`, userRole 축). 호출은 `ApmAccessChecker.requireEdit(currentUser)`이고, **관리자는 권한 JSON과 무관하게 우회**하므로 아무도 체크를 켜지 않은 설치본에서 통과하는 집합은 전과 같다. 🔴 `@RolesGuarded`+`@Roles`를 쓰면 **Zabbix 미연동 admin(roleid=null)이 막혀** 토큰을 만들 수 없고, 그러면 APM이 아무것도 수집하지 못한다.
- 컨트롤러 4개 전부 클래스에 `@RequiresFeature(Feature.APM)`(ArchUnit A2) + `@VisitorIdCheck`. 단 `ApmOtlpController`는 `@VisitorIdCheck` 없음(쿠키 세션이 없다).

---

### 2.1 수신 토큰 — `ApmTokenController` (`/apm/receive-tokens`, 🅐)

| 메서드 | 경로 | 요청 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/receive-tokens` | — | `ApmReceiveTokenDto[]`(id desc) |
| POST | `/apm/receive-tokens` | `ApmTokenCreateReqDto` | `ApmTokenIssuedDto` + 헤더 `Cache-Control: no-store` |
| DELETE | `/apm/receive-tokens/{id}` | — | `null`(멱등) |

```ts
ApmTokenCreateReqDto { label: string /*필수*/; kind?: "COLLECTOR"|"RUM"; scopes?: string[] }

ApmReceiveTokenDto {
  id: number; label: string; kind: string; scopes: string[];
  createdBy: string|null; createdAt: LocalDateTime;
  lastSeenAt: LocalDateTime|null;   // 🔴 최대 60초 지연(수신마다 쓰지 않는다)
  revokedAt: LocalDateTime|null; active: boolean   // active === (revokedAt === null)
  purgeAfter: LocalDateTime|null   // 2026-09-22 — 회수 토큰만: revokedAt + revokedTokenRetentionDays. 목록 EP에서만 채운다(발급 응답은 null)
}
ApmTokenIssuedDto {
  info: ApmReceiveTokenDto; token: string;
  endpoint: string;          // 🔴 완전 URL — "https://moveseye.example.com/apm/otlp"
  configYaml: string|null    // withConfig를 준 요청에만
}
```

- 🔴 **`token` 원문은 발급 응답에만 있다.** 목록 DTO에는 원문도 해시도 **필드 자체가 없다**(마스킹조차 하지 않는다 — 해시 뒤 4자리는 원문과 무관해 사람에게 도움이 안 되고 정보만 흘린다). 서버는 해시만 갖고 있어 재발급 외에 복구 경로가 없다 → FE는 이 화면에서 복사·설치 안내를 끝내야 한다.
- 🔴 **`endpoint`는 스킴·호스트까지 있는 완전 URL이다** (2026-09-01 D5로 변경 — 이전에는 경로 `"/apm/otlp"`만 줬다).
  - `withConfig.endpoint`를 준 요청이면 **그 주소** 기준, 아니면 설치본 프로퍼티 `app.apm.collector.endpoint-hint` 기준이다.
  - **같은 응답 `configYaml` 안의 `endpoint:` 줄과 글자 그대로 같은 값**이다(둘 다 `ApmCollectorConfigGenerator.normalizeEndpoint`를 거친다). 갈리면 yaml을 쓰지 않고 손으로 exporter를 채우는 사용자만 조용히 실패한다 — 실제로 그랬다.
  - ⚠️ FE는 이 값을 **그대로 표시·복사**한다. 앞에 호스트를 덧붙이거나 경로를 자르지 말 것.
- 🔴 **`endpoint`에 `/v1/metrics`를 붙이지 않는다.** exporter가 스스로 붙인다(R1 실측). 붙여서 주면 실제 요청이 `…/otlp/v1/metrics/v1/metrics`로 나간다.
- 기본값: `kind=COLLECTOR`, `scopes=["ingest"]`. ⚠️ V38 주석은 "빈 배열 = 전부 허용"이라고 적었지만 **기본을 빈 배열로 두지 않는다** — 나중에 `deploy`(CI/CD 웹훅) 범위가 붙는 순간 옛 토큰이 전부 허용이 되어 수신 토큰으로 배포 이벤트를 쓸 수 있게 된다.
- 회수는 **멱등**이고 행을 지우지 않는다(언제 발급·회수됐는지가 사고 조사에 필요).

에러코드: `APM_TOKEN_LABEL_REQUIRED` · `APM_TOKEN_KIND_UNSUPPORTED` · `APM_TOKEN_NOT_FOUND`.

**저장 형식(내부, 그러나 계약이다)**: `apm_receive_token.token_hash`는 `char(64)`이므로 `ReceiveTokenService.sha256Hex(plain)` **순수 64자 hex**를 넣는다. 🔴 `ReceiveTokenService.hash()`는 `rcv:v1:` 접두를 붙여 **71자**가 되므로 그대로 쓰면 발급이 즉시 실패한다(AI 모니터링은 `credential text` 컬럼이라 접두를 감당할 수 있었다 — 컬럼이 다르다). 인증은 해시로 인덱스 조회 1회(AI 모니터링의 전건 순회 방식은 수신 경로에 쓸 수 없다).

---

### 2.2 설정 — `ApmSettingController` (`/apm/settings`, 🅐)

| 메서드 | 경로 | 요청 | 응답 `data` |
|---|---|---|---|
| GET | `/apm/settings` | — | `ApmSettingsDto` |
| PUT | `/apm/settings` | `ApmSettingsUpdateReqDto`(부분) | `ApmSettingsDto`(갱신 후) |

```ts
ApmSettingsDto {
  registrationMode: "AUTO"|"APPROVE"|"ALLOWLIST"; hiddenAfterDays: number; staleMinutes: number;
  defaultErrorRatePct: number; defaultP95Ms: number;
  maskSql: boolean; keepRawSql: boolean; routeLimit: number;
  revokedTokenRetentionDays: number;   // 2026-09-22(V65) 기본 180
  updatedAt: LocalDateTime|null; keepRawSqlUpdatedBy: string|null
}
// 🔴 전 필드 nullable(래퍼 타입) — null = 미변경
ApmSettingsUpdateReqDto { registrationMode?; hiddenAfterDays?; staleMinutes?;
  defaultErrorRatePct?; defaultP95Ms?; maskSql?; keepRawSql?; routeLimit?; revokedTokenRetentionDays? }
```

- 🔴 **`revokedTokenRetentionDays`(2026-09-22)** — 회수 후 이 일수가 지난 토큰을 보존 배치(`apm_retention`의
  `revokedTokens` 단계, `ApmRetentionService.purgeRevokedTokens`)가 **행째 삭제**한다. `apm_collector`·
  `apm_otlp_receipt`·`apm_ingest_drop_stat`·`apm_collector_log_1m`이 CASCADE로 함께 사라진다(되돌릴 수 없음).
  유효 토큰은 대상이 아니다. `apm_rum_page_5m` FK에 CASCADE가 없어 **RUM 집계가 남은 토큰은 건너뛰고**
  RUM 보존(30일)이 끝난 뒤 회차에 지운다 — 그래서 `purgeAfter`는 "이 시각 이후 삭제될 수 있음"이지 확정 시각이 아니다.

- 🔴 **래퍼 타입인 것이 계약의 일부다.** 원시 타입이면 FE가 보내지 않은 `maskSql`이 `false`로 도착해 **마스킹이 조용히 꺼진다**. 부분 갱신에서 원시 타입은 "미지정"과 "0/false"를 구분하지 못한다.
- 검증: 모드는 3종 중 하나(`APM_SETTING_INVALID_MODE`), 일수·분·ms·상한은 1 이상, 오류율은 0 초과 100 이하(`APM_SETTING_INVALID_VALUE`).
- 🔴 **`keepRawSql=true` 전환은 감사 대상이다.** 그 순간부터 고객 SQL 원문이 쌓이므로 "언제부터·누가"를 답할 수 있어야 한다. 정식 감사 체계(`asset_activity`)는 자산 도메인에 묶여 있고 premium이 app 리포지토리를 참조하는 것은 **ArchUnit A3가 막으므로**, 최소 기록 두 곳으로 대신한다: **(a) WARN 로그**, **(b) `apm_setting.updated_by`**(신설 — 아래 §2.7). `maskSql=false` 전환도 WARN.
- 🔴 **켜는 방향은 관리자만(2026-10-22, 전체 검토 B13)**: `keepRawSql` 거짓→참·`maskSql` 참→거짓을 관리자(`ADMIN ∪ SUPER_ADMIN`, 원문 열람과 같은 축)가 아닌 사용자가 보내면 **HTTP 200 + body `code:403`, `errorCode: APM_RAW_SQL_ADMIN_ONLY`**, 같은 요청의 다른 필드도 저장하지 않는다. 판정은 30초 캐시가 아니라 잠근 뒤의 DB 값이다. 끄는 방향·같은 값 재전송은 편집 권한이면 되고, 값이 같은 키는 쓰지 않는다(`updated_by` 보존). 수집기 yaml 생성(`POST /apm/collector-config`)과 토큰 발급의 `withConfig`도 요청이 **명시한** `keepRawSql=true`·기본 마스킹 규칙 제외(`attributes/drop`·`redaction/pii` `useDefaults:false`)는 관리자만 — 같은 403(발급은 토큰 행까지 롤백). 설정값 상속은 허용.

- 🔴 **두 SQL 스위치가 실제로 무엇을 바꾸는가** (2026-08-31 정리, 분석 §12 A8)

  | 키 | P1에서의 효과 | 소비자 |
  |---|---|---|
  | `keep_raw_sql` | 설정 yaml 생성 시 **기본값**이 된다 — 켜져 있으면 수집기의 `transform/sql`(리터럴 마스킹) 프로세서를 뺀 yaml을 내준다. 요청이 `keepRawSql`을 **명시하면 요청이 이긴다** | `ApmCollectorConfigService`(§8) |
  | `mask_sql` | **아무 동작도 바꾸지 않는다(P2 예약).** 이 값은 "서버가 받은 **스팬**의 SQL을 가릴 것인가"이고, P1이 저장하는 것은 메트릭뿐이라 가릴 SQL이 서버에 없다. 화면·감사(`updated_by`)는 P2를 위해 남겨 둔다 | 없음 |

  P1에서 SQL을 실제로 가리는 것은 **수집기 쪽**이고 그 스위치는 `keep_raw_sql`이다. 두 값을 같은 화면에
  나란히 두면 "마스킹을 켰는데 원문이 온다"로 읽히므로, 이 표가 계약의 일부다.

**서비스 API(수신·배치가 쓴다)**: `ApmSettingService.registrationMode() · hiddenAfterDays() · staleMinutes() · routeLimit() · defaultErrorRatePct() · defaultP95Ms() · maskSql() · keepRawSql() · revokedTokenRetentionDays() · get() · update(req, actor) · evict()`

- 캐시 두 겹: 쓰기 시 즉시 무효화 + **TTL 30초**. TTL이 없으면 다중 인스턴스에서 노드 A가 APPROVE로 바꿔도 노드 B는 영원히 AUTO로 돈다.
- 🔴 **값이 깨져 있어도 수신이 멈추지 않는다.** 파싱 실패·미인식 값은 WARN + **그 키의 기본값**. 특히 불리언에 `Boolean.parseBoolean`을 쓰지 않는다 — 그 함수는 `"True!"` 같은 오타를 전부 `false`로 만들어 **마스킹을 꺼 버린다**. 인식 못 한 값은 기본값(`mask_sql=true`, `keep_raw_sql=false`)으로 되돌린다.

---

### 2.3 서비스 등록 관리 — `ApmRegistryController` (`/apm/services`, 🅐)

| 메서드 | 경로 | 응답 `data` |
|---|---|---|
| GET | `/apm/services/pending` | `ApmPendingServiceDto[]`(lastSeenAt desc) |
| POST | `/apm/services/pending/{id}/approve` | `ApmServiceSummaryDto` |
| POST | `/apm/services/pending/{id}/reject` | `null` |
| GET | `/apm/services/unknown` | `ApmUnknownServiceDto` |

```ts
ApmPendingServiceDto { id; serviceName; env; firstSeenAt; lastSeenAt; seenCount: number;
                       sampleResource: Record<string,unknown>|null }
ApmServiceSummaryDto { id; serviceUid: uuid; serviceName; displayName; env;
                       state: "ACTIVE"|"PENDING_APPROVAL"|"HIDDEN"; firstSeenAt; lastSeenAt }
// 🔴 P1에서 apm_service.state에 실제로 들어가는 값은 ACTIVE·HIDDEN 둘뿐이다(분석 §12 A11).
//    승인 대기는 별도 테이블 apm_pending_service로만 표현한다 — 승인 전에는 서비스 행이 없고,
//    승인하는 순간 ACTIVE로 바로 생긴다. PENDING_APPROVAL은 예약값이며(사전 등록 ALLOWLIST API가
//    생기면 쓰인다) FE 타입·필터가 이미 알고 있어 enum에서 빼지 않는다.
ApmUnknownServiceDto { totalCount: number;
  byToken: { tokenId; tokenLabel: string|null; count: number; lastSeenAt }[] }
```

- 승인 = 서비스 생성 + 대기열 삭제 + **`ApmRegistrar.clearCache()`**. 캐시를 안 비우면 다음 수신부터 최대 TTL(10분) 동안 "승인 대기"로 남아 **승인했는데 화면이 계속 비어 있다**.
- 🔴 승인 시 `firstSeenAt`은 **처음 관측한 시각**을 보존한다(승인 시각으로 덮으면 "언제부터 있었나"에 관리자의 반응 속도를 답하게 된다).
- 🔴 이미 같은 `(name_norm, env_norm)` 서비스가 있으면 `APM_SERVICE_ALREADY_EXISTS`로 **거부**한다(대기 중 모드를 AUTO로 바꾸면 생기는 상황). 이때 **대기열 행은 지우지 않는다** — 예외가 트랜잭션을 되돌리므로 지우는 코드를 써 봐야 실제로는 남는다. 정리는 거절로 한다.
- ⚠️ **거절은 영구 차단이 아니다.** 그 앱이 계속 보내면 다시 대기열에 오른다. 영구 차단은 ALLOWLIST 모드다.
- `/apm/services/unknown`은 **서비스가 아니라 폐기 카운터 집계**다(`apm_ingest_drop_stat`, reason=`UNKNOWN_SERVICE`). 서비스를 만들지 않기로 한 이상 그 이상 저장할 곳이 없고, 화면의 목적도 목록 관리가 아니라 "어느 수집기 뒤에 설정이 빠진 앱이 있다"를 알리고 설치 가이드로 보내는 것이다.

에러코드: `APM_PENDING_NOT_FOUND` · `APM_SERVICE_ALREADY_EXISTS`.

---

### 2.4 OTLP 수신 — `ApmOtlpController` (`/apm/otlp/**`, 토큰 인증)

`POST /apm/otlp/v1/metrics` · `/v1/traces` · `/v1/logs` (각각 한 겹 중복 경로 `…/v1/metrics/v1/metrics`도 받는다 — 오설정 구제, WARN 로그).

`SecurityConfig`에 `/apm/otlp/**` **permitAll**("인증 없음"이 아니라 "여기서 인증하지 않는다"). 클래스 `@RequiresFeature(APM)` + 메서드 `@LicenseExempt` + **컨트롤러가 직접 라이선스 판정**.

#### 🔴 응답 코드 계약 (R11 실측, otelcol 0.159.0)

exporter가 **재시도하는 코드는 429·502·503·504뿐**이고 나머지는 전부 즉시 폐기한다.

| 상황 | 코드 | 본문 | Collector 동작 |
|---|---|---|---|
| 정상 | **200** | `{}` | 큐 비움 |
| Content-Type이 `application/json` 아님 | **415** | `{error, hint}` | 폐기(맞다) |
| 본문/해제 후 크기 > 8MB | **413** | `{error}` | 폐기 |
| gzip 바이트 깨짐 | **400** | `{error:"malformed gzip body"}` | 폐기 |
| 토큰 없음·불일치·**회수** | **401** | `{error:"invalid receive token"}` | 폐기 |
| `Feature.APM` 미보유·만료 | **403** | `{error:"APM feature not licensed"}` | 폐기 — **그 순간부터 손실**(설계 P17 의도) |
| JSON 파싱 실패 | **400** | `{error:"malformed json"}` | 폐기 |
| 적재 중 예외·DB 장애 | **503** | `{error:"ingest unavailable"}` | 백오프 재시도 → 살아난다 |

🔴 **500은 절대 내지 않는다.** 실측에서 500은 Permanent error로 분류돼 **60초에 31배치가 통째로 사라졌다**. 그래서 모든 예외를 컨트롤러 안에서 잡는다 — 전역 `GlobalExceptionHandler`의 catch-all에 닿게 두면 안 된다. 같은 이유로 `consumes=`를 쓰지 않는다(`HttpMediaTypeNotSupportedException`은 핸들러 선정 **전에** 나서 컨트롤러 `@ExceptionHandler`가 못 보고 전역 catch-all이 500으로 만든다 — AI 모니터링 E2E M2-D2 실측).

#### 판정 순서 (이 순서가 계약이다)

```
415(형식) → 크기 → gzip 해제(해제 중 상한 초과 즉시 중단) → 401(토큰)
  → 403(토큰 용도) → 403(기능) → [traces/logs면 200 + SIGNAL_NOT_SUPPORTED 카운트]
  → 400(JSON) → dedup 판정 → ingest → 영수증 기록 → 200 {}
```

- **형식·크기를 인증보다 먼저** 본다 — 토큰을 모르는 상대에게 조회·파싱 비용을 들이지 않는다.
- 🔴 **gzip은 스트리밍으로 풀며 상한을 넘는 순간 중단**한다. 압축률 실측이 5~9배라, 다 풀고 재는 방식은 방어가 아니라 공격 표면이다(압축 폭탄 테스트가 이를 고정한다).
- 🔴 **dedup 판정은 적재 앞, 영수증 기록은 적재 뒤**다. 순서를 뒤집으면 503 후의 재전송이 영수증에 걸려 **조용히 버려진다** — 재시도로 살리려던 데이터를 우리 손으로 죽인다. (`apm_otlp_receipt` UNIQUE `(token_id, body_sha256)`, 해시는 **해제 후 본문**의 sha256.)
- 🔴 **트레이스·로그는 404가 아니라 200으로 받고 버린다.** 404·405는 exporter가 영구 실패로 보고 Collector 로그를 실패로 뒤덮어 **정작 메트릭 문제를 가린다**. 설치 가이드가 트레이스 파이프라인을 함께 켜라고 안내하는 이상 그 요청은 정상 도착이다. 폐기 카운터 `SIGNAL_NOT_SUPPORTED`로 남겨 화면이 "트레이스는 2단계입니다"라고 정직하게 답하게 한다.
- 본문 상한: `app.apm.otlp.max-body-bytes`(기본 `8388608`).
- 🔴 **토큰 용도 검사 → 403**(2026-08-31 신설, 분석 §12 A10). 인증을 통과해도 `kind=COLLECTOR`가 아니거나
  `scopes`에 `ingest`가 없으면 적재하지 않는다(빈 배열도 거부 — 발급 경로는 항상 `["ingest"]`를 채운다).
  없으면 P4의 **브라우저에 심는 RUM 공개 토큰으로 OTLP 적재가 그대로 된다**. 401이 아니라 403인 이유는
  자격증명 자체는 진짜이기 때문이고(로그가 "누가·왜"를 답할 수 있어야 한다), exporter 입장에서는 둘 다
  영구 실패라 동작 차이가 없다.
- ⚠️ **만료 시 403은 APM만의 정책이다.** AI 계정 모니터링의 같은 자리는 **503**(재시도로 버팀)이며 이는
  의도된 차이다(설계 §4.1 A6·P17, 분석 §12 A9). 두 컨트롤러 주석이 서로를 참조한다 — 한쪽을 "통일"하지 말 것.

---

### 2.5 등록 엔진 — `ApmRegistrar` (`premium/apm/service/registry/`)

```java
// ApmRegistrar (@Service)
Resolution resolve(Map<String,String> resourceAttrs, Instant seenAt);
void clearCache();

sealed interface Resolution {
    boolean storable();                                   // == (this instanceof Service)
    record Service(ApmServiceRef service, ApmInstanceRef instance) implements Resolution {
        Long serviceId(); UUID serviceUid(); String instanceId();
    }
    record Collector(String instanceId, String version)   implements Resolution;
    record UnknownService(String rawServiceName, String hostName, String instanceId) implements Resolution;
    record Pending(Long pendingId, String serviceName, String env) implements Resolution;
    record Rejected(String serviceName, String env)       implements Resolution;
}
record ApmServiceRef(Long serviceId, UUID serviceUid, String serviceName, String env);
record ApmInstanceRef(Long rowId, String instanceId);
```

| 갈래 | 등록 | 저장 | 폐기 사유 |
|---|---|---|---|
| `Service` | 서비스·인스턴스 upsert 완료 | ✅ | — |
| `Collector` | **분류만**(행은 안 쓴다) | 자기 메트릭만 | — |
| `UnknownService` | ❌ | ❌ | `UNKNOWN_SERVICE` |
| `Pending` | 대기열 upsert(seen_count++) | ❌ | `PENDING` |
| `Rejected` | ❌ | ❌ | `NOT_REGISTERED`(신설) |

- **sealed인 것이 안전장치다** — 갈래가 늘면 소비자가 전부 컴파일 에러가 난다("새 갈래를 조용히 서비스로 취급"하는 사고를 컴파일러가 막는다).
- 🔴 `Service`가 **엔티티가 아니라 참조값**인 이유는 캐시다. 엔티티를 담으면 캐시 적중 시에도 결국 엔티티를 로드해야 해 캐시가 무의미해진다(설계 §4.2 "캐시로 매 배치 DB 왕복 회피"). ⚠️ 과제 지시문의 `SERVICE(ApmService, ApmInstance)`에서 **의도적으로 벗어난 지점**이다.
- 🔴 `apm_collector`·`apm_ingest_drop_stat`는 **여기서 쓰지 않는다.** 둘 다 자연키에 `token_id`가 들어가는 토큰 소유 테이블이고, 토큰을 아는 것은 수신 계층이다.

**속성 해석**(R1 §2.1 실측 키): `service.name` · `service.instance.id` · `service.version` · `deployment.environment.name`(신형) → `deployment.environment`(구형) → `""` · `host.name`. 인스턴스 ID = `service.instance.id` → `host.name` → **`""`** (🔴 null이면 Postgres UNIQUE가 성립하지 않아 매 배치 새 행이 생긴다 — V30에서 실제로 겪은 함정).

**수집기 판정**: 정규화 이름이 `otelcol`이거나 `otelcol` + `-`/`_`/`.` 로 시작(R1 §2.7: `service.name=otelcol-contrib`). ⚠️ 고객이 자기 서비스를 `otelcol-…`로 짓는 오탐은 감수한다 — 수집기를 서비스로 들여 목록·알람·SLO를 오염시키는 쪽이 훨씬 되돌리기 어렵다.

**정규화**: `ApmNaming.normalize`(trim → NFC → lower → 128) 기준으로 같으면 같은 서비스. **저장은 원문**(trim도 하지 않는다), 비교만 정규화.

**캐시·절제(수신 경로 성능의 본체)**
- `(name_norm, env_norm) → ApmServiceRef`, `(serviceId, instanceId) → ApmInstanceRef`, TTL **10분**, 상한 20 000(넘으면 통째로 비움 — 그 상황은 인스턴스 ID가 매번 새로 생기는 오설정이라 적중률이 0이다).
- `last_seen_at`은 캐시 항목별 **60초에 1회**만 쓴다(CAS). 🔴 단 **버전·호스트가 바뀌면 절제를 무시하고 즉시 쓴다** — 배포 직후 화면이 옛 버전을 보여 주면 "무엇을 배포했는지"를 못 믿게 된다.
- 캐시는 **프로세스 로컬**이다. 다중 인스턴스의 최악은 "노드마다 분당 1회 UPDATE"와 "삭제된 서비스를 최대 TTL 동안 살아 있다고 믿음"이며, 둘 다 데이터를 틀리게 만들지 않는다.

**🔴 동시 생성 경합** — 쓰기는 전부 `ApmRegistryWriter`(별도 빈)를 통한다. INSERT는 `@Transactional(REQUIRES_NEW)`이고 UNIQUE 위반을 **그대로 던진다**; `ApmRegistrar`가 `DataIntegrityViolationException`을 잡아 **재조회**한다. 두 가지가 걸려 있어 별도 빈이어야 한다: (a) `REQUIRES_NEW`는 프록시를 거쳐야 먹는다(자기 호출은 조용히 무시된다), (b) UNIQUE 위반을 **바깥 트랜잭션 안에서** 잡으면 Postgres가 이미 그 트랜잭션을 중단시켜 **이어지는 재조회조차 실패한다**. 재조회도 비면 예외를 그대로 올린다(길이 초과 같은 진짜 오류를 삼키면 "서비스가 영영 안 생기는데 로그도 없는" 상태가 된다).

---

### 2.6 수신 검증 — `ApmIngestStatusController` (`/apm/ingest/recent`, 🅐)

`GET /apm/ingest/recent?tokenId=`(생략 시 전체 합산)

```ts
ApmIngestRecentDto { tokenId: number|null; received: boolean; lastReceivedAt: Instant|null;
  batches: number; points: number; dropped: number; windowSeconds: 60; serverStartedAt: Instant }
```

- **프로세스 메모리 링 버퍼**다(토큰당 32건). 수신은 15초마다 도는 뜨거운 경로이고 이 정보는 1분 뒤면 가치가 없어, 이것 때문에 DB 쓰기를 하나 더 얹지 않는다.
- 🔴 **`received=false`를 "설정 오류"로 단정하면 안 된다** — 서버가 방금 재기동했으면 비어 있다. 그래서 `serverStartedAt`을 함께 준다. 인스턴스 로컬이므로 **알람 판정에 쓰지 말 것**(그건 `apm_receive_token.last_seen_at`의 몫이다).
- ⚠️ `points`는 적재 결선(§2.8) 전까지 항상 0이다.

---

### 2.7 스키마 추가 — `V39__apm_setting_updated_by.sql`

`ALTER TABLE apm_setting ADD COLUMN IF NOT EXISTS updated_by varchar(128);` (멱등)

§2.2의 `keep_raw_sql` 감사 최소 기록용. ⚠️ §3은 같은 시점에 **V38 끝에 덧붙이는 방식**을 택했다(아직 어느 영구 DB에도 안 갔다는 판단). 이쪽은 별도 워크트리에서 진행돼 V38이 이미 적용된 상태를 전제했으므로 새 번호로 분리했다 — **병합 시 둘 중 하나로 통일하면 된다**(V39를 V38 끝으로 옮기거나 그대로 두거나. 둘 다 결과 스키마는 같다).

---

### 2.8 §3(적재 파이프라인)과의 결선 — ✅ **완료(2026-08-31, WBS 0.5b)**

§2는 워크트리, §3은 메인 트리에서 **병행 작성**돼 두 벌이 공존했다. 아래대로 한 벌로 합쳤다.

| 이전(§2, 임시) | 지금 | 조치 |
|---|---|---|
| `ApmIngestPipeline`(인터페이스) | 유지 | 수신 계약과 적재 구현의 경계 |
| `RegisteringIngestPipeline`(등록만, points 항상 0) | **`MetricIngestPipeline`** | 🗑 삭제·교체(`@Primary`) |
| `ApmDropStatRecorder` | **`ApmIngestDropStatRecorder`**(§3, 배치 flush·enum) | 🗑 삭제·통일 |
| `RegisteringIngestPipeline.upsertCollector` | **`ApmCollectorStateService`** | 🗑 삭제·통일 |
| `ApmIngestDropStat.REASON_*` 문자열 상수 7개 | **`ApmDropReason` enum** | 🗑 삭제·단일화 |

**결선 흐름** (`MetricIngestPipeline.ingest`)

```
payload(JsonNode)
 → syncRouteLimit()                    ApmSettingService.routeLimit() → ApmDimsNormalizer.applyRouteLimit
 → OtlpMetricsReader.read(payload, receivedAt)          평면 OtlpMetricPoint 목록
 → MetricIngestor.ingest(tokenId, resolver, points)     ①수집기 분리 ②귀속 ③허용목록 ④정규화 ⑤차분 ⑥적재
       resolver = new ApmRegistrarServiceResolver(registrar, receivedAt)   ← 배치 1건짜리 값(빈 아님)
 → IngestResult(points = stats.stored(), dropped = stats.lostPoints())
```

- `points` = **저장한 행 수**(`stored`). `accepted`가 아닌 이유는 같은 1분·같은 차원 포인트가 배치 안에서
  합쳐지기 때문이고, 로그·진단이 알고 싶은 것은 "DB에 몇 줄 들어갔나"다.
- `dropped` = `lostPoints()`(= `points - accepted`). 🔴 `ROUTE_OVERFLOW`·`REBUCKETED`는 **저장은 된**
  변형이라 여기 들어가면 안 된다(저장했는데 "버렸다"고 보고하게 된다).
- traces/logs는 그대로 **200 + `SIGNAL_NOT_SUPPORTED`**(컨트롤러에서 처리, 파이프라인에 오지 않는다).

**폐기 사유 enum — `ApmDropReason` 8종** (`apm_ingest_drop_stat.reason`, varchar(32))

| 값 | 뜻 | 저장됐나 |
|---|---|---|
| `NOT_ALLOWLISTED` | 허용목록 밖 메트릭 | ❌ |
| `ROUTE_OVERFLOW` | route 상한 초과 → `__other__`로 접음 | ✅ (변형) |
| `REBUCKETED` | 정규 경계로 재버킷(오차 발생) | ✅ (변형) |
| `UNKNOWN_SERVICE` | 서비스를 특정 못 함(`unknown_service:*`·이름 없음) | ❌ |
| `PENDING` | APPROVE 모드 승인 대기 | ❌ |
| **`REJECTED`** 🆕 | ALLOWLIST 모드 미등록 | ❌ |
| **`SIGNAL_NOT_SUPPORTED`** 🆕 | 트레이스·로그(P1 미지원) | ❌ |
| **`COLLECTION_PAUSED`** 🆕 V60 | 사용자가 그 서비스의 수집을 멈춰 뒀다(`apm_service.collecting=false`) | ❌ (의도된 것) |
| `CUMULATIVE_FIRST_SKIPPED` | CUMULATIVE 첫 관측(startTime이 오래됨) | ❌ |

- 🔴 `COLLECTION_PAUSED`는 **`PENDING`·`REJECTED`와 반드시 갈라 센다.** 저 둘은 "아직 허락되지
  않았다"라 화면이 승인·등록을 권해야 하지만, 이쪽은 **이미 허락했다가 스스로 껐다**. 한 칸에
  뭉치면 화면이 이미 승인한 사람에게 "승인하세요"라고 말한다. 라이브 스팬 쪽 대응 사유는
  `LiveSpanRejection.serviceCollectionPaused`이고, 이 사유가 오르는 동안 **"수신은 오는데 저장이
  0"이 정상**이다(멈춘 것은 저장이지 수신이 아니다).
- 🔴 이전 문자열 상수 `NOT_REGISTERED`는 **`REJECTED`로 개명**했다. APM이 아직 어느 영구 DB에도
  가지 않아 마이그레이션 없이 바꿨다 — 이후에 이름을 바꾸면 **이미 쌓인 행과 갈라져 카운터가 두 벌**이 된다.
- 🔴 `REJECTED`를 `UNKNOWN_SERVICE`에 합치지 않은 이유: 둘 다 "저장 안 함"이지만 **관리자가 할 일이
  정반대**다 — UNKNOWN_SERVICE는 앱 쪽 `service.name` 설정을 고쳐야 하고, REJECTED는 우리 쪽 목록에
  넣어 주면 끝난다. 뭉치면 화면이 "이름 없는 앱 N건"이라고만 말한다.

**🔴 `ApmServiceResolver`에 `dropReason(OtlpResource)` 추가 — 과제 지시문에서 의도적으로 벗어난 지점**

지시문(§2.8 초안)은 어댑터가 사유별로 **직접 카운트**하는 그림이었다. 그대로 하면 **같은 손실이 두 번
쌓인다** — `MetricIngestor`가 이미 귀속 실패 포인트를 `UNKNOWN_SERVICE`로 세고 있었기 때문이다.
게다가 **세는 단위가 어긋난다**: 어댑터는 **리소스당 한 번** 불리는데 실제 손실은 그 리소스에 딸린
**포인트 수**(수백 개)다. 리소스 단위로 세면 수백 개를 버린 배치가 화면에 `1`로 보인다.

그래서 **이유는 구현체가, 세는 것은 적재 계층이** 하도록 갈랐다:

```java
interface ApmServiceResolver {
    Optional<ServiceRef> resolve(OtlpResource resource);
    // 직전 resolve가 empty였던 이유. 기본값 UNKNOWN_SERVICE(기존 람다 구현체는 그대로 동작)
    default ApmDropReason dropReason(OtlpResource resource) { return ApmDropReason.UNKNOWN_SERVICE; }
}
```
`MetricIngestor`는 리소스별로 `(ref, reason)`을 캐시해 두고, `ref`가 비면 **포인트마다** 그 사유로 센다.

**수집기 판정 단일화** — 규칙이 두 곳(적재 `startsWith("otelcol")`, 등록 엔진 `otelcol` + 구분자)에서
달랐다. 경계 이름(`otelcolizer`)에서 **"포인트는 수집기 센티널로 가는데 서비스는 등록되는"** 모순이
난다. 엄격한 쪽으로 통일하고 출처를 하나로 옮겼다: **`OtlpResource.isCollectorName(String)`**
(`otel/` 패키지 — A1상 `premium..`을 참조할 수 없으므로 중립 쪽에 둔다).
`OtlpMetricPoint.isCollectorSelfTelemetry()`·`ApmRegistrar.isCollector()`가 둘 다 이 함수를 부른다.
어댑터에는 수집기가 오지 않는 것이 정상이며, 오면 **WARN + 저장 안 함**(안전망).

**`route_limit` 결선** — `MetricIngestPipeline.syncRouteLimit()`이 **배치마다**
`ApmSettingService.routeLimit()`(TTL 30초 캐시)을 읽어 값이 바뀐 경우에만
`ApmDimsNormalizer.applyRouteLimit()`을 부른다. 쓰기 시점에 한 번만 밀어 주는 방식을 안 쓴 이유는
**다중 인스턴스**다 — 그 배선이 없는 노드는 영원히 옛 값으로 돈다. 조회 실패는 WARN 후 이전 값 유지
(상한 하나 때문에 정상 배치를 503으로 만들지 않는다).

**⚠️ 계약에 보이는 부수 변경**: `ApmSettingsDto.updatedAt`은 이제 **사용자 설정 8키만** 보고 계산한다.
`apm_setting`에 배치 워터마크(§5)가 함께 살기 때문에, 안 거르면 5분마다 갱신되는 그 행이 화면의
"마지막 설정 변경"을 계속 밀어 **아무도 안 바꿨는데 방금 바꾼 것처럼** 보인다.

**⚠️ §2.6 정정**: `ApmIngestRecentDto.points`가 더 이상 항상 0이 아니다(실제 저장 행 수).

**검증**: `MetricIngestPipelineTest` 10 · `ApmRegistrarServiceResolverTest` 8 (구
`RegisteringIngestPipelineTest` 4는 삭제·이관).

---

### §2 검증

- **단위 71건 green**(skip 0): `ApmOtlpControllerTest` 14 · `ApmRegistrarTest` 17 · `ApmSettingServiceTest` 10 · `ApmReceiveTokenServiceTest` 8 · `ApmRegistryServiceTest` 6 · `ApmAdminAccessMvcTest` 5 · `RegisteringIngestPipelineTest` 4 · `LicenseArchitectureTest` 7. MockMvc는 전부 **standalone + 전역 `GlobalExceptionHandler` 동반**(빼면 415가 통과하고 실서버는 500이다).
- **통합**: `ApmRegistrarIT` **6건**(도커 PG 5433 `moveseye_it`, skip 0) — 8스레드 동시 생성 시 행 1개·전원 같은 id · 인스턴스 동시 생성 1행 · AUTO 등록 원문 보존 · APPROVE 대기열만 · **토큰 해시 char(64) 왕복과 회수 후 401** · V39 `updated_by` 왕복.
- 전체: **단위 1467건 · 통합 134건(11개 IT 클래스) 전부 green, skip 0**.
  ⚠️ 중간에 전체 `:test`가 128건 실패한 적이 있는데, 원인은 **다른 세션이 같은 `moveseye_it`을 drop/create**한 충돌이었다(`relation "cost_bulk_upload_job" does not exist`, flyway 이력이 V38에서 멈춘 채 재생성된 것으로 확인). 코드 문제가 아니며 재실행 시 전건 통과.

**ArchUnit 변경** (`LicenseArchitectureTest`)
- **A5**: OTLP 수신의 허용 방식을 "클래스+메서드 이름"에서 **클래스 단위 목록**(`OTLP_RECEIVER_CLASSES` = `AiMonitorOtlpController`, `ApmOtlpController`)으로 바꿨다. 이름을 박아 두면 같은 컨트롤러에 수신 경로를 더할 때마다(APM은 metrics·traces·logs 셋) 테스트가 **실패**하는데, 그건 안전장치가 아니라 마찰이다.
- **A5-c**: 대신 **검증을 강화**했다 — 목록의 모든 컨트롤러의 `@LicenseExempt` 메서드 **전수**가 스스로(또는 같은 클래스의 위임 대상이) `LicenseProvider.current()`에 닿는지 확인하고, 검사 건수가 2 미만이면 실패한다. 즉 **허용은 클래스로, 검증은 메서드 전수로**. 새 수신 경로를 추가하면 A5-c가 잡는다.

---

## §3 적재 파이프라인 — `premium/apm/collector/ingest/` · `premium/apm/collector/` (WBS 0.8 · 0.9 · 0.11)

작업 위치: `C:\solutions\moveseye-be-spring` **메인 트리**(master, **미커밋**).
정본: 설계서 §4.3·§4.4·§3.4 + 실측 `_workspace/features/apm/core/r1_apm-collector-roundtrip.md` §2.2~2.4·§2.7·§3.5.

### 조립 라인

```
OtlpMetricsReader.read()               ← 리더 산출(OtlpMetricPoint)
  ① isCollectorSelfTelemetry()         → 수집기 / 애플리케이션 분리
  ② ApmServiceResolver.resolve()       → 서비스 귀속 (등록 엔진 이음매)
  ③ ApmMetricAllowlist.find()          → 허용목록
  ④ ApmDimsNormalizer.normalize()      → canonical JSON + dims_hash
  ⑤ CumulativeDeltaTracker.delta()     → CUMULATIVE → 증분
  ⑥ ApmMetric1mStore.store()           → apm_metric_1m UPSERT
```

🔴 **④가 ⑤보다 먼저다.** 차분의 키가 `dims_hash`라, 정규화 전 속성으로 키를 만들면
`status_code=200`과 `201`이 다른 시리즈로 추적되어 같은 `2xx` 행에 두 시리즈의 증분이 섞인다.

### 진입점 시그니처

```java
// MetricIngestor (@Service)
IngestStats ingest(long tokenId, ApmServiceResolver resolver, List<OtlpMetricPoint> points);

record IngestStats(int points, int accepted, int stored, Map<ApmDropReason,Integer> dropped) {
    int dropped(ApmDropReason reason);
    int lostPoints();               // points - accepted
}

// 등록 엔진과의 유일한 접점 — 구현은 §2(ApmRegistrar) 쪽에서 어댑터로 붙인다.
@FunctionalInterface
interface ApmServiceResolver {
    Optional<ServiceRef> resolve(OtlpResource resource);
    record ServiceRef(long serviceId, String instanceId) { /* instanceId null → "" */ }
}
```

- 🔴 `Optional.empty()`는 **"지금 저장하면 안 된다"이지 오류가 아니다** — 미등록·승인 대기·
  `unknown_service:*`가 전부 여기로 오고, 적재는 조용히 버리며 `UNKNOWN_SERVICE`로 센다.
  **예외를 던지면 안 된다**: 배치가 503이 되고 수집기가 정상 데이터까지 재전송한다.
- 🔴 **수집기 자기 메트릭은 resolver에 오지 않는다.** ①에서 갈라 `ApmCollectorStateService`로 간다.
- `stored < accepted`일 수 있다 — 같은 1분·같은 차원 포인트를 배치 안에서 합치기 때문이고 정상이다.
- `MetricIngestor`는 **예외를 던지지 않는다**(리졸버 예외·수집기 상태 갱신 실패 모두 흡수).
  OTLP exporter는 500을 영구 오류로 보고 즉시 폐기한다(R1 §3, 60초에 31배치 전량 손실).

### 허용목록 (`ApmMetricAllowlist`) — 최종 표

| 메트릭 | 보존 차원(정렬 후) | 경계 패밀리 | 슬롯 |
|---|---|---|---|
| `http.server.request.duration` | `http.request.method`, `http.route`, `status_class` | `duration_s` | `http_server` |
| `http.server.active_requests` | `http.request.method` | — | `http_server` |
| `http.client.request.duration` | `server.address`, `status_class` | `duration_s` | `http_client` |
| `jvm.memory.used` / `.limit` / `.committed` | `jvm.memory.type` | — | `jvm_memory` |
| `jvm.gc.duration` | `jvm.gc.name` | `gc_s` | `jvm_gc` |
| `jvm.thread.count` · `jvm.cpu.recent_utilization` · `jvm.class.count` · `jvm.cpu.count` | — | — | `jvm_runtime` |
| `db.client.connection.count` / `.pending_requests` / `.max` / `.idle.min` | `db.client.connection.pool.name`, `db.client.connection.state` | — | `db_pool` |
| `db.client.connection.wait_time` / `.use_time` / `.create_time` | `db.client.connection.pool.name` | `pool_ms` 🔴**ms** | `db_pool` |
| `db.client.operation.duration` | `db.system.name`, `db.namespace`, `db.operation` | `db_operation_s` | `db_operation` |
| `process.cpu.utilization` · `process.memory.usage` | — | — | `process` |
| `^otelcol[._]` (정규식) | **수신 속성 그대로**(키 12개 상한) | `observed` | `collector` |

**파생 차원 2개 — 원문을 그대로 쓰면 카디널리티가 터진다**
- `status_class` ← `http.response.status_code`를 `1xx`~`5xx`로 접음. **원 코드는 버린다.**
  100 미만·600 이상·비수치는 빈 문자열(억지로 접으면 화면에 `0xx`가 뜬다).
- `db.operation` ← `db.query.summary`의 **첫 토큰 대문자**(`SELECT`·`UPDATE`…).
  🔴 실측 summary는 `SELECT "public"."flyway_schema_history"`처럼 **테이블명까지** 붙어 온다.
  summary가 없으면 `db.operation.name`으로 폴백.

**버리는 것(실제로 오지만 화면이 안 쓴다)**: `http.{server,client}.*.body.size` · `otlp.exporter.*` ·
`processedSpans`/`processedLogs`/`queueSize` · `jvm.cpu.time`·`jvm.class.loaded`·
`jvm.memory.used_after_last_gc` · 수집기 self 파이프라인에 필터가 없어 딸려 오는
`up`·`scrape_*`·`promhttp_*`(R1 §3.5). 전부 `NOT_ALLOWLISTED`로 **이름별 카운트**만 남는다.

### 차원 정규화 (`ApmDimsNormalizer`)

- 허용 키만 → **키 정렬** → 값 `trim → NFC → 256자 절단`(소문자화 없음) → Jackson 직렬화.
  🔴 **없는 키는 빼지 않고 빈 문자열**(빼면 같은 엔드포인트가 화면에 둘로 보인다).
- `dims_hash = sha256(canonical UTF-8)` hex 64자. `sha256Hex("{}")` =
  `44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a`(회귀 고정값).
- 🔴 **route 상한**(설정 `route_limit`, 기본 500): 서비스별 집합이 차면 **더 받지 않고**
  `__other__`로 접는다(LRU로 밀어내지 않는다 — 밀어내면 시계열이 시간에 따라 무제한이 된다).
  빈 값과 `__other__` 자체는 상한을 소비하지 않는다. 서비스 집합 자체는 512개 LRU.
- 기동 직후 서비스별 **첫 조회 1회**만 `apm_metric_1m` 최근 1일 distinct route로 워밍(JDBC 1쿼리,
  실패해도 던지지 않고 빈 집합으로 시작). ⚠️ jsonb `?` 연산자는 JDBC 플레이스홀더와 충돌하므로
  `dims->>'http.route' is not null`로 판정한다.
- 결선 대기: `applyRouteLimit(int)` — §2의 `ApmSettingService`가 `route_limit`을 읽어 호출해야 한다.
  **호출자가 없으면 기본 500 고정**이다.

### CUMULATIVE → 증분 (`CumulativeDeltaTracker`)

키 = `(service_id, instance_id, metric, dims_hash)` — 🔴 **버킷은 키에 없다**(차분은 버킷을 가로지른다).

| 상황 | 처리 |
|---|---|
| `temporality = DELTA` | 그대로 통과, **상태를 기억하지 않는다** |
| GAUGE · non-monotonic SUM(UpDownCounter) | 🔴 **차분하지 않는다** — 그 시각의 값이다 |
| CUMULATIVE · 직전 있음 · 단조 증가 | `현재 − 직전`(count·sum·버킷 벡터 원소별, 음수는 0으로 클램프) |
| 리셋(`startTime` 변경 ∥ count/value 감소 ∥ 버킷 길이 변경) | 현재 값을 **통째로** 증분으로 |
| 첫 관측 · `time − startTime < 120초` | 통째로 증분(기동 직후 첫 1분을 잃지 않는다) |
| 첫 관측 · 그 밖(startTime 없음 포함) | 🔴 **버린다** (`CUMULATIVE_FIRST_SKIPPED`). 단, **현재 값은 기억**해 다음 관측부터 정상 차분 |

- 🔴 **DELTA 선호를 켜도 UpDownCounter는 CUMULATIVE로 남는 것이 스펙**이다(R1 §2.3) —
  `jvm.memory.*`·`jvm.thread.count`·`db.client.connection.count`·`http.server.active_requests`.
  배치 단위로 "이번 건 델타"라고 가정하면 누적값을 증분으로 더해 수백 배가 된다.
- ⚠️ 실측상 **HTTP 히스토그램의 `startTime`은 최근**(첫 요청 시점)이라 첫 배치에서도 통째로 받아진다.
  JVM 계열(`startTime`=프로세스 시작, 175초 전)만 첫 관측이 버려진다.
- TTL 30분(마지막 관측 기준), 최소 1분 간격 sweep.

### 1분 버킷 적재 (`ApmMetric1mStore`)

버킷 = `bucket_start = 관측 시각의 분 절단`. 🔴 **시스템 기본 시간대로 변환한 뒤** 자른다 —
파티션 날짜를 만드는 `ApmPartitionService.ensureAhead`가 `LocalDate.now()`(시스템 시간대)를 쓰므로,
여기서만 UTC를 쓰면 두 축이 어긋나 자정 부근 수신이 "아직 없는 파티션"을 찾는다.

**집계 규칙 — 한 행에 두 종류의 값이 산다**

| 포인트 종류 | `count` | `sum` | `hist_counts` | `min`/`max` |
|---|---|---|---|---|
| 히스토그램(증분) | Δ관측 수 | Δ관측값 합 | Δ버킷 벡터 | 포인트의 min/max |
| 모노토닉 카운터(증분) | `round(Δvalue)` | **Δvalue(정본)** | NULL | NULL |
| GAUGE · UpDownCounter | 1(샘플 수) | 값 | NULL | 값 |

- 🔴 **카운터의 정본은 `sum`이다.** `count`는 정수 카운터에서만 뜻이 있고 `jvm.cpu.time`처럼 초 단위
  카운터에서는 반올림 산물이다 — 화면이 카운터를 셀 때 `count`를 읽으면 조용히 틀린다.
- 🔴 **GAUGE의 정본은 `sum/count`(평균)와 `min`/`max`다.** `sum`만 읽으면 "샘플이 많을수록 메모리가
  커지는" 그래프가 나온다.
- ⚠️ CUMULATIVE 히스토그램의 `min`/`max`는 **시리즈 전체**의 최소·최대다(차분 불가). 이 버킷의 실제
  범위보다 넓게 잡히며 DELTA로 오면 정확하다.

**UPSERT (멱등이 아니다)**
```sql
on conflict (service_id, instance_id, metric, dims_hash, bucket_start) do update set
  count = 기존 + excluded, sum = coalesce(기존,0) + coalesce(excluded,0),
  min = least(...), max = greatest(...),
  hist_counts = apm_int_array_add(기존, excluded),
  bounds_id = coalesce(기존, excluded),
  exemplar_trace_id = coalesce(excluded, 기존),
  exemplar_value = case when excluded.exemplar_trace_id is not null
                        then excluded.exemplar_value else 기존 end
```
🔴 **`exemplar_value`는 `coalesce`가 아니라 `case`다**(2026-09-02 QA D17). 둘을 따로 접으면
**traceId는 새 배치 것, 값은 옛 배치 것**인 행이 생겨 라벨과 링크가 다른 요청을 가리킨다.
🔴 **같은 배치를 두 번 넣으면 값이 두 배가 된다 — 그게 맞다.** 같은 요청의 중복 차단은
**영수증 dedup**(`apm_otlp_receipt` body sha256)의 몫이고, 그 정보는 이 계층에 없다.

- 같은 PK가 배치 안에 여러 번 있으면 **메모리에서 먼저 합쳐** 1행으로 보낸다.
  같은 PK인데 경계가 다르면 먼저 온 벡터를 남기고 경고(count·sum은 합산).
- 🔴 삽입 전 `ApmPartitionService.ensurePartition(TABLE_1M, day)` — DEFAULT 파티션이 없어
  안 부르면 배치가 통째로 실패한다.
- **정규 경계**: `CanonicalBounds.familyFor(metric)`이 있으면 다를 때만 `HistogramRebucketer.rebucket`
  (같으면 복사, 오차 0) → 접었으면 `REBUCKETED` 카운트. 패밀리가 없으면 수신 경계를 그대로 등록.
- `bounds_id`는 `apm_hist_bounds` 조회 후 캐시(없으면 insert + UNIQUE 경합 catch).
  🔴 조회가 실패해도 **던지지 않는다** — `bounds_id` 없이 count·sum은 저장한다.
- `hist_counts`는 `integer[]` — `Integer.MAX_VALUE`에서 클램프(오버플로가 음수로 도는 것보다 낫다).
- exemplar는 **값이 가장 큰**(=가장 느린) 것을 **traceId와 값 한 쌍**으로 고른다
  (`exemplar_trace_id` + `exemplar_value`, V47). traceId 없는 exemplar는 후보가 아니다.
  🔴 `filteredAttributes`는 `OtlpExemplar`에 자리 자체가 없다(R1 §3.5 — 수집기 프로세서가 안 만진다).
- 🔴 **exemplar의 값·시각이 정본이다** (2026-09-02 QA D17). 값은 OTLP exemplar의 `asDouble`/`asInt`
  (구 semconv ms는 초로 환산), **귀속은 exemplar의 `timeUnixNano`** — 그 시각이 이 1분 버킷 밖이면
  **버린다**(CUMULATIVE 배치는 직전 export 이후 전체를 싣고 오므로 남의 분 요청이 섞인다).
  시각이 없거나 `"0"`이면 이 버킷의 것으로 본다(값·링크는 여전히 같은 요청이라 라벨은 정직하다).
  같은 traceId가 둘이면 **나중 관측 하나**만 후보로 남긴다.
- 🔴 **CUMULATIVE 히스토그램은 `min`/`max`를 저장하지 않는다**(NULL). `count`·`sum`·버킷 벡터는
  직전 관측과 빼서 증분이 되지만 **극값은 뺄 수 없다** — 누적 최대는 리셋되지 않아 한 번 커진 값이
  모든 버킷에 고정된다(실측: 다섯 버킷 연속 104,881.2 ms). DELTA면 그대로 저장한다.
  ⚠️ 대가는 둘이다: 백분위의 min/max 클램프 생략(= 보간만 쓰던 예전 값) · 실시간 "느린 엔드포인트"
  Top이 그 축을 잃는다. 그래서 설치 가이드가 `…TEMPORALITY_PREFERENCE=delta`를 그 이유와 함께 권장한다.

### 폐기 통계 (`ApmIngestDropStatRecorder`) · 사유 enum

```java
enum ApmDropReason { NOT_ALLOWLISTED, ROUTE_OVERFLOW, REBUCKETED,
                     UNKNOWN_SERVICE, PENDING, CUMULATIVE_FIRST_SKIPPED }
```
- 🔴 `ROUTE_OVERFLOW`·`REBUCKETED`는 **저장은 된** 것이다(변형). 표의 용도는 "손실 목록"이 아니라
  **"들어온 것과 저장된 것이 왜 다른가"의 단일 창구**다.
- 메모리 집계 → **10초 / 1000건**마다 flush(UPSERT `count += n`), `@PreDestroy`에서도 flush.
  🔴 flush 실패는 **던지지 않고** 되돌려 넣는다(통계 때문에 진짜 배치를 503으로 만들지 않는다).
  ⚠️ 비정상 종료 시 마지막 몇 건은 사라진다 — **규모를 보는 표이지 과금 원장이 아니다.**
- `metric_name`은 사유에 메트릭이 없으면 **빈 문자열**(NULL이면 UNIQUE가 성립하지 않아 배치마다 새 행).
- enum 이름은 `varchar(32)`를 넘으면 안 된다(테스트가 강제).

### 수집기 상태 (`premium/apm/collector/state/ApmCollectorStateService`) — 0.11

- 판정: `OtlpMetricPoint.isCollectorSelfTelemetry()`(resource `service.name`이 `otelcol`로 시작).
  🔴 등록 엔진에 넘기면 고객 화면에 **"otelcol-contrib" 유령 서비스**가 생긴다.
- `apm_collector` upsert(UNIQUE `(token_id, collector_instance_id)`):

  | 컬럼 | 출처 |
  |---|---|
  | `collector_instance_id` | resource `service.instance.id` (없으면 `host:{host.name}` → `unknown-collector`) |
  | `version` | resource `service.version` (실측 `0.159.0`) |
  | `queue_size` | `otelcol_exporter_queue_size` 합 |
  | `send_failed_total` | `otelcol_exporter_send_failed*` 합(누적값 그대로) |
  | `sampling_dropped_total` | `otelcol_processor_tail_sampling*dropped*` 합 |
  | `last_seen_at` | 배치 내 최대 관측 시각 |

  🔴 **값이 안 온 항목은 건드리지 않는다**(`updateStats`) — 없는 것을 0으로 채우면 "실패가 0건"이라는
  틀린 안심을 준다. ⚠️ R1 픽스처에는 `send_failed_*`가 **없다**(`sent_*`만 있다) — 정상이다.

### 🔴 수집기 시계열 센티널 (계약 신설 — §1에 이어 붙는 규약)

수집기 자기 메트릭의 **시계열**은 `apm_metric_1m`에
`service_id = 0`(`ApmCollectorStateService.SENTINEL_SERVICE_ID`) ·
`instance_id = collector_instance_id`로 적재한다.

- 0을 쓰는 근거: `apm_service.id`가 `bigserial`이라 1부터 시작 — 어떤 서비스도 0을 갖지 않는다.
  별도 테이블 없이 파티션·롤업·보존 배치가 그대로 적용된다.
- ⚠️ **조회 쪽 규약**: 서비스 목록·차트 질의는 반드시 `service_id > 0` 또는 명시적 `service_id = ?`로
  걸어야 한다. **수집기 화면(C1)만 `service_id = 0`을 읽는다.** 이걸 어기면 수집기 큐 길이가
  애플리케이션 지표에 섞인다.

### V38 추가분 (이 과제)

아직 어느 영구 DB에도 적용되지 않은 상태라 **V38 끝에 추가**했다(새 마이그레이션 아님).

1. `apm_int_array_add(integer[], integer[])` — 버킷 벡터 원소별 덧셈.
   🔴 **STRICT를 붙이지 않는다**(NULL은 "그쪽엔 벡터가 없다"이지 "결과가 없다"가 아니다).
   🔴 길이가 다르면 **긴 쪽 기준** — 짧게 자르면 꼬리 버킷이 사라져 p99가 실제보다 **좋아 보인다**.
2. **`gc_s` 시드 정정**: 기존 8단 `0.001…5`는 R1 실측 이전 값이라 자바 `CanonicalBounds.gcSeconds()`
   (4단 `0.01,0.1,1,10`)와 달랐다 → 삭제 후 실측값으로 재삽입.
3. `db_operation_s`(9단)·`pool_ms`(15단·**ms**) 시드 추가 — 없으면 첫 수신 때 런타임 insert로 생기고
   family 라벨이 `observed`로 잘못 붙는다.
   `ApmMetric1mStoreIT.seededFamiliesMatchJava`가 자바↔SQL 4종 일치를 강제한다.

### §3 검증

- 단위 **113건**: `ApmMetricAllowlistTest` 55 · `ApmDimsNormalizerTest` 18 ·
  `CumulativeDeltaTrackerTest` 16 · `ApmMetric1mStoreTest` 10 · `MetricIngestorTest` 14.
  R1 실측 픽스처(`otel/r1/metrics-round1-explicit.json`·`metrics-otelcol-self.json`)를 **실제 리더로
  읽어** end-to-end 정규화 결과를 검증한다.
- 통합 **8건**: `ApmMetric1mStoreIT` — UPSERT 누적 · `apm_int_array_add`(NULL·길이 차이) ·
  jsonb/int[] 왕복 · 범위 밖 날짜 파티션 자동 생성 · 경계 재사용 · 시드 4종 자바 일치 · drop stat flush.
  (도커 PG 5433 `moveseye_it` 실행, skip 0)
- `:test --tests "*premium.apm*" --tests "*otel*Test" --tests "*License*Test"` → **275건 green, skip 0**.

### §3이 다음 단계에 남기는 것

- **§2(수신 컨트롤러)**: `ApmRegistrar`를 `ApmServiceResolver` 어댑터로 감싸 `MetricIngestor.ingest`를
  부른다. 반환 `IngestStats`는 수신 응답 본문에 쓰지 말고(응답은 `{}`) 로깅·진단에만 쓴다.
- **`ApmSettingService`**가 `route_limit`을 읽어 `ApmDimsNormalizer.applyRouteLimit`을 호출해야 한다.
  지금은 호출자가 없어 기본 500 고정이다.
- **PENDING 사유는 아직 아무도 안 쓴다** — `ApmServiceResolver`가 `Optional.empty()`로만 답해
  전부 `UNKNOWN_SERVICE`로 뭉친다. 대기열과 미등록을 카운터에서 가르고 싶으면 **구현체가 자기 쪽에서**
  세는 것이 맞다(이유를 아는 유일한 코드다).
- **롤업(1m→5m→1h)**은 미착수. 같은 `bounds_id`끼리 벡터 합·sum 합·min/max이고,
  `apm_int_array_add`를 그대로 재사용하면 된다. 🔴 5m/1h는 **인스턴스 축을 버린다**(서비스 합산).

---

## §5 배치 잡 3종 — `premium/apm/core/batch/` (WBS 1.1 · 1.2 · 보존)

작업 위치: `C:\solutions\moveseye-be-spring` **메인 트리**(master, **미커밋**).
정본: 설계서 §4.4(롤업·보존)·§2.1(자동 숨김 TTL)·§7(보존 표) + V38 시드 `scheduler_setting` 3행.

### 5.1 잡 요약

| `job_key` | 클래스 | 주기(V38 시드) | options | 요약 문자열 | 라이선스 |
|---|---|---|---|---|---|
| `apm_partition_maintain` | `ApmPartitionMaintainJob` | daily 00:30 | `aheadDays`(2) | `created=n` | **false** |
| `apm_rollup` | `ApmRollupJob` | interval 5분 | `maxBuckets5m`(288) · `maxBuckets1h`(48) | `5m=n 1h=m` | **false**(2026-08-31 정정) |
| `apm_retention` | `ApmRetentionJob` | daily 01:30 | `raw1mDays`(7) · `rollup5mDays`(30) · `rollup1hDays`(400) · `instanceIdleDays`(30) · `dropStatDays`(30) · **`receiptDays`(2, 신설)** | `partitions=n instances=n dropStats=n receipts=n hidden=n` | **false** |

- 🔴 **`job_key`는 V38 시드와 글자까지 같아야 한다.** 다르면 `SchedulerManager`가 경고 한 줄만 남기고
  **등록 자체를 안 한다** — 배치가 "실패"가 아니라 "존재하지 않는" 상태가 되어 아무 로그도 안 남는다.
  `ApmBatchJobTest.jobKeysMatchSeed`가 이를 고정한다.
- 🔴 **APM 배치 3종은 전부 `requiresActiveLicense()=false`다**(2026-08-31 정정, 분석 §12 A5).
  가르는 기준은 "정리냐 가공이냐"가 아니라 **수집 소스에 나가는가**다 — 셋 다 우리 DB만 읽고 우리 DB에 쓴다.
  - 파티션 **선생성**을 막으면 라이선스 복구 순간 수신이 통째로 실패한다.
  - 보존이 멈추면 만료된 설치본의 디스크가 무한정 찬다.
  - 🔴 **롤업이 true였던 것이 결함이었다.** 보존은 만료 중에도 계속 돌아 7일 지난 1m 파티션을 DROP하므로,
    만료가 7일을 넘기면 롤업만 멈춘 사이 **원본이 사라지고 그 구간의 5m/1h는 영영 빈 채로 남는다**.
    만료 중 **조회**를 막는 것은 라이선스 커널의 몫이고(P17·M8), 그것과 데이터 파괴는 다른 일이다.
    `SchedulerJob#requiresActiveLicense` 주석의 예외 기준도 **"DB 내부 정리·파생"**으로 넓혔다.
- 🔴 **보존 일수의 출처는 `apm_retention`의 options 한 곳뿐이다.** `apm_partition_maintain`은
  **만들기만 하고 지우지 않는다** — 두 잡이 각자 읽으면 한쪽만 고쳤을 때 "만든 다음 날 지우는" 상태가 된다.
- ⚠️ **자동 숨김 일수만 예외로 `apm_setting.hidden_after_days`(§2.2)에서 온다.** 그건 배치 튜닝이 아니라
  사용자 설정이고, 같은 값을 잡 options에도 두면 화면에서 바꿔도 안 먹는 유령 설정이 생긴다.

### 5.2 롤업 — `ApmRollupService`

```
apm_metric_1m  --(5분 버킷, 서비스 합산: instance 축 소멸)-->  apm_metric_5m
apm_metric_5m  --(1시간 버킷)------------------------------>  apm_metric_1h
```

**워터마크** (`apm_setting`, 사용자 설정 아님)

| 키 | 값 |
|---|---|
| `rollup_watermark_5m` | 마지막으로 채운 5분 버킷의 **시작 시각**(ISO LocalDateTime) |
| `rollup_watermark_1h` | 마지막으로 채운 1시간 버킷의 시작 시각 |

- 값이 없으면 "아직 한 번도 안 돌았다" → 원본의 **가장 이른 버킷**부터 시작한다.
  🔴 0·epoch로 채우지 않는다(1970년부터 훑는다). 🔴 원본이 **비어 있으면 워터마크를 세우지 않는다** —
  "지금"을 박아 두면 나중에 백필로 들어온 과거 데이터가 영원히 롤업되지 않는다.
- 접근은 `ApmSettingService.watermark(key)` / `saveWatermark(key, value)`이며 **30초 설정 캐시를 타지
  않는다**(자기가 방금 쓴 값을 읽는 축이라, 캐시를 태우면 이미 채운 구간을 다시 채우거나 건너뛴다).

**닫힌 버킷만 접는다** — `LAG = 2분`. 버킷 `[T, T+step)`은 `now - LAG >= T + step`일 때만 처리한다.
여유가 없으면 롤업 값이 원본보다 **항상 조금 작고**, 화면은 "5분 전 트래픽이 줄었다"고 말한다.
🔴 1h는 추가로 **5m 워터마크를 앞지르지 않는다**(`ceiling = watermark5m + 5분`) — 아직 안 채운 5m를
읽으면 그 시간대가 **영구히 작게 굳는다**(대입 UPSERT라 다시 접지도 않는다).
같은 이유로 `ApmRollupJob`은 **5m → 1h 순서**로 부른다.

**한 번에 접는 양** — `from + maxBuckets * step`으로 자른다(기본 5m 하루치·1h 이틀치). 첫 실행이
7일치를 한 문장으로 밀지 않게 하는 안전장치이며, 밀린 구간은 다음 실행이 이어 간다.

**🔴 0행일 때 워터마크 규칙** (2026-08-31 신설, 분석 §12 A5)

접은 행이 하나도 없으면 **워터마크를 붙잡는다**. 단 아래 둘 중 하나면 붙잡지 않고 전진한다.

| 상황 | 판정 | 이유 |
|---|---|---|
| 접은 행 ≥ 1 | **전진** | 평소 경로 |
| 0행 · 창이 `closedBefore`에 닿아 있음 · 원본 보존 기간 안 | **유지** | 수집기가 끊겼다 재개하며 버퍼를 몰아 보내는 일이 흔하다. 워터마크가 먼저 지나가면 그 몫은 5m/1h에 **영영 안 실린다**(대입 UPSERT는 재계산하지 않는다). 창은 다음 실행에 저절로 넓어지므로 데이터가 돌아오면 함께 접힌다 |
| 0행 · 창이 `maxBuckets`에 잘림(밀린 구간 따라잡는 중) | **전진** | 붙잡아도 창이 안 넓어진다 — 멈추면 영영 못 따라잡는다 |
| 0행 · 창 시작이 원본 보존(1m 7일 / 5m 30일)을 넘김 | **전진** | 원본 파티션이 이미 DROP됐다. 기다릴 대상이 없다 |

- 최악의 정체는 `maxBuckets × step`(5m 하루·1h 이틀)으로 묶인다 — 그 뒤엔 창이 잘려 전진한다.
- 붙잡은 실행은 `RollupResult.NOTHING`(요약 `5m=0`)을 돌려주고 사유를 INFO 로그에 남긴다.
- 보존 일수의 출처는 `ApmResolution`의 상수다 — `apm_retention` options로 보존을 바꾸면 갈린다(분석 §12 A17).

**집계 규칙** (`INSERT … SELECT … GROUP BY (service_id, metric, dims_hash, 버킷)` **한 문장**)

| 컬럼 | 식 |
|---|---|
| `count` · `sum` | `sum(count)` · `sum(sum)` (🔴 전부 NULL이면 NULL 유지 — 0으로 굳지 않는다) |
| `min` · `max` | `min(min)` · `max(max)` |
| `hist_counts` | **`apm_int_array_sum(hist_counts)`** (V40 신설 집계) — 원소별 합, 길이가 다르면 **긴 쪽 기준** |
| `bounds_id` | `min(bounds_id)` |
| `exemplar_trace_id` · `exemplar_value` | 🔴 **`exemplar_value`가 가장 큰 행의 것**, 없으면(V47 이전 행) `max` 순. traceId 없는 행은 FILTER로 제외. 🔴 **두 컬럼은 같은 정렬로 뽑아 같은 행에서 온다** — 갈리면 라벨과 링크가 다른 요청이 된다(QA D17) |
| `dims` | `(array_agg(dims))[1]` — 그룹 키가 `dims_hash`라 그룹 안에서 같다 |

- 🔴 **행을 자바로 끌어오지 않는다.** 1m은 분당 1만 행 규모라 5분마다 수만 행이 힙을 지나가면 안 된다.
- 🔴 **`bounds_id`가 갈린 그룹**(`count(distinct bounds_id) > 1`)은 `hist_counts`·`bounds_id`를 **NULL로
  두고** count·sum·min·max만 접는다 + **WARN**(건수는 `RollupResult.mixedBoundsGroups`).
  서로 다른 눈금의 자를 겹쳐 재면 백분위가 조용히 틀린다 — **총량은 맞고 분포만 없는 것**이,
  분포가 그럴듯하게 틀린 것보다 낫다.
- 🔴 **`ON CONFLICT DO UPDATE`는 대입이다** (`count = EXCLUDED.count`). §3의 1m UPSERT(`count = 기존 +
  excluded`)와 **정반대**인 것이 요점이다 — 1m은 서로 다른 배치가 같은 버킷에 더해 넣는 구조라 덧셈이
  맞고(중복 차단은 영수증 dedup의 몫), 롤업은 **원본이 그대로 있는 재계산**이라 덧셈이면 재실행이
  값을 두 배로 만든다. 대입이면 배치가 중간에 죽어 워터마크가 안 밀려도 **몇 번이든 같은 결과**다.
- 삽입 전 대상 파티션 `ensurePartition` 선행(DEFAULT 파티션이 없어 안 만들면 INSERT가 통째로 실패).
- 버킷 내림은 `date_trunc('hour', …) + floor(분/N) * interval 'N minutes'` — 🔴
  `to_timestamp(extract(epoch …))`로 돌면 결과가 `timestamptz`가 되어 **시간대만큼 밀린 버킷**을 만든다
  (1m 적재는 시스템 시간대로 자른다).
- ⚠️ **늦게 도착한 데이터**: 워터마크를 지난 버킷에 1m 행이 새로 들어오면 롤업에 반영되지 않는다.
  1m 원본에는 남아 있어 최근 구간 조회는 정확하고, 롤업만 조금 적다.

**수집기 센티널**(`service_id = 0`)도 같은 문장에서 함께 롤업된다 — 별도 분기 없음.

### 5.3 스키마 추가 — `V40__apm_rollup_aggregate.sql`

`CREATE AGGREGATE apm_int_array_sum(integer[]) (SFUNC = apm_int_array_add, STYPE = integer[])`
(카탈로그 확인으로 멱등 — PG에는 `CREATE OR REPLACE AGGREGATE`가 없다).

🔴 sfunc가 **STRICT가 아닌** `apm_int_array_add`인 것이 핵심이다. 초기 상태가 NULL이라 첫 호출이
`add(NULL, 첫벡터)`이고, STRICT였다면 결과가 NULL이 되어 **모든 그룹의 히스토그램이 통째로 사라진다**.
⚠️ V38에 덧붙이지 않은 이유 — 이미 IT DB flyway 이력에 checksum이 박혀 있어 기설치 환경에서는
그 DDL이 영영 실행되지 않고 `validate`도 깨진다(레포 규약 §3 #7).

### 5.4 보존·자동 숨김 — `ApmRetentionService`

| 단계 | 대상 | 방식 |
|---|---|---|
| `partitions` | `apm_metric_1m/5m/1h` | 파티션 **DROP**(DELETE 아님 — 잠금·죽은 튜플·디스크 미회수) |
| `instances` | `apm_instance` | `last_seen_at < now - instanceIdleDays` |
| `dropStats` | `apm_ingest_drop_stat` | `last_seen_at < now - dropStatDays` |
| `receipts` | `apm_otlp_receipt` | `received_at < now - receiptDays`(기본 2일) |
| `hidden` | `apm_service` | ACTIVE & `last_seen_at < now - hidden_after_days` → `hide()` |

- 보존 경계는 **하루 덜 지우는 쪽**(`day < today - retentionDays`) — 지우는 실수는 되돌릴 수 없고
  남기는 실수는 다음 날 정리된다.
- 🔴 **자동 숨김은 ACTIVE만** 건드린다. `PENDING_APPROVAL`을 숨기면 승인 화면에서 사라져 **영영
  승인되지 않는다**. 숨김은 `ApmService.touchSeen`이 수신 재개 시 **자동 해제**한다.
- 🔴 **P1은 숨김까지이고 삭제하지 않는다.** 설계서 §2.1은 "보존 기간 뒤 삭제"까지 적었지만, 그 삭제는
  `apm_instance`·알람 규칙·이벤트가 CASCADE로 날아가는 파괴적 연산이다. 관리자 DELETE EP
  (`features/apm/core/contract_apm-read-api.md` §1)를 먼저 두고, 자동 삭제는 그 경로가 실제로 쓰이는 것을 보고 판단한다.
- 🔴 **한 단계가 실패해도 나머지를 돌고, 끝난 뒤에 던진다.** 단계는 서로 독립적이라 부분 성공이 그대로
  이득이고(파티션 DROP이 잠금으로 실패했다고 영수증 정리까지 건너뛰면 그 사이 디스크는 계속 찬다),
  삼키면 `SchedulerManager`가 실패를 **성공으로 기록**한다(false-green, 레포 규약 §3 #14).
  예외 메시지에 성공한 몫을 함께 실어 "어디까지 됐나"를 남긴다.

### §5 검증

- 단위 **9건** `ApmBatchJobTest` — job_key 3종 시드 일치 · 라이선스 게이트 3종 · options 해석 2 ·
  롤업 순서(InOrder) · 부분 실패 메시지 2 · 버킷 내림 경계.
- 통합 **13건**(도커 PG 5433 `moveseye_it`, **skip 0**):
  - `ApmRollupJobIT` 8 — 인스턴스 축 소멸·벡터 원소별 합(길이 차이 포함) · **재실행 멱등**(대입 UPSERT) ·
    게이지 min/max 보존 · **bounds 불일치 → 벡터 버리고 총량 유지 + 카운트** · 워터마크 전진 ·
    **안 닫힌 버킷 미처리** · 5m→1h 연쇄와 5m 워터마크 추월 금지 · 빈 원본이면 워터마크 미기록.
  - `ApmRetentionJobIT` 5 — ACTIVE만 숨김(대기열·최신 보존) · 숨김 멱등 · **숨김이 삭제하지 않음** ·
    만료 파티션만 DROP · 인스턴스/폐기통계/영수증 정리.
- 전체 `:test` **1787건 green, skip 0**(단위 + IT 전량).

---

## §6 알람 — `premium/apm/alert/` + `engine-api zabbix/` (WBS 2.2~2.8)

작업 위치: `C:\solutions\moveseye-be-spring` **메인 트리**(master, **미커밋**).
정본: 설계서 §4.5(A안·소유권·드리프트) + 실측 `_workspace/features/apm/core/r10_apm-zabbix-history-push.md`.

> **한 줄 요약**: 판정은 우리가, **배달은 Zabbix가** 한다. 우리 규칙으로 계산한 값을 가상 호스트의
> 트래퍼 아이템에 `history.push`로 밀면 고객이 이미 설정해 둔 **액션·미디어(Slack/Teams/Jandi/메일)·
> 에스컬레이션·유지보수 창·알림 벨이 전부 공짜로** 붙는다. 알림 채널을 새로 만들지 않는다.

### 6.1 수집 계약 — `engine-api` `zabbix/` (신규 1개)

```java
// engine-api : com.dmove.moveseye.zabbix.timeseries.history
public interface ZabbixHistoryPush {
    List<PushResult> push(String authToken, List<PushValue> values);
}
public record PushValue(String itemid, String host, String key, String value, Long clock, Integer ns) {
    static PushValue of(String itemid, String value);
    static PushValue of(String host, String key, String value);
    static PushValue numeric(String host, String key, double value);   // 🔴 Locale.ROOT 포맷
    static PushValue numeric(String itemid, double value);
    PushValue at(long epochSeconds);
    boolean hasItemid(); boolean hasHostKey();
}
public record PushResult(String itemid, String error) {
    static PushResult ok(String itemid); static PushResult failed(String error);
    boolean isSuccess();   // error == null
    boolean cacheMiss();   // error에 "does not exist" 포함
}
```

구현: `engine-zabbix` `ZabbixHistoryPushImpl`(`history.push` JSON-RPC).

- 🔴 **APM 어휘가 없다.** 여기는 중립 수집 계약이고 "APM 알람"은 쓰는 쪽 사정이다. 프로비저닝은
  **새 포트를 만들지 않고** 기존 계약(`ZabbixItemService`·`ZabbixTriggerService`·`ZabbixHostService`·
  `ZabbixHostGroupService`·`ZabbixActionService`·`ZabbixEventService`)의 raw 맵 API를 쓴다.
- 🔴 **`result.response == "success"`는 성공이 아니라 수신 확인이다.** 항목별 성패는 `result.data[i]`에만
  있다. 반환형이 `List<PushResult>`인 이유이며, 인덱스는 **요청과 1:1**을 보장한다(응답이 짧으면 구현이
  나머지를 실패로 채운다 — 성공으로 채우면 손실이 통계에서 사라진다).
- 🔴 **`itemid`와 `host+key`를 함께 보내지 않는다.** 같이 보내면 항목 오류가 아니라 **JSON-RPC 에러**로
  배치 전체가 거부된다. 실제 push는 `host+key`를 쓴다 — itemid는 사용자가 아이템을 지웠다 만들면
  바뀌는 캐시이고 키는 안 바뀐다.
- 🔴 **값 검증은 호출자 몫.** 타입이 안 맞아도 push는 성공으로 답하고 몇 초 뒤 아이템이
  `NOT_SUPPORTED`가 된다. 숫자는 `PushValue.numeric`(Locale.ROOT)로 만든다 — 한국어 로케일에서
  `12,5`가 나가면 아이템만 조용히 죽는다.
- ⚠️ **요청 자체가 실패하면 `ApiError`가 올라온다**(전량 미저장). `ZabbixClient`는 "No permissions"류
  문구를 **401(`UnauthorizedError`)** 로 바꾸므로, 배치 경로에서 이 예외가 401로 새 나가지 않도록
  `ZabbixAlertBridge.pushAll`이 통째로 잡아 바인딩 오류로 기록한다.

### 6.2 Zabbix 객체 규약 — `ZabbixAlertBridge`

| 항목 | 값 |
|---|---|
| 호스트 그룹 | `MovesEye APM` |
| 호스트 | `MovesEye APM` — 🔴 **인터페이스 없이** 생성(에이전트가 안 붙는 가상 호스트) |
| 아이템 | 트래퍼(type 2) · float(value_type 0) · 키 `apm.<kind_lower>[<scope_uid>]` |
| 트리거 | `last(/MovesEye APM/<key>)><threshold>` · `manual_close=1` |
| 트리거 이름 | 전역 규칙 `<종류> — <대상>` · **서비스별 규칙 `<종류> — <대상> (서비스 규칙 <rule_uid 앞 8자>)`** |
| 태그 | `owner:moveseye-apm` · `apm_service:<scope_uid>` · `apm_kind:<KIND>` (+트리거에 `apm_uid:<rule_uid>`) |

`<scope_uid>` = 서비스 UUID, 수집기 축이면 `collector`.

- 🔴 **서비스별 규칙의 트리거 이름에 규칙 조각이 붙는다** (2026-09-08 P3 2회차 QA D10 반영).
  Zabbix는 **한 호스트에서 트리거 이름(`description`)이 유일**해야 한다. 옛 이름은
  `<종류> — <대상>` 뿐이라 **전역 규칙과 같은 종류의 서비스별 규칙이 글자까지 같은 이름**이
  됐고, 덮인 전역 트리거는 설계상 **지우지 않고 내려 두므로**(§6.3 ORPHANED) 그 이름이 계속
  점유돼 서비스별 트리거는 **영영 만들어지지 못했다**
  (`Trigger "APM p95 응답시간 — moveseye-be" already exists on "MovesEye APM".`, 5분마다 재시도).
  결과는 그 (서비스, 종류)의 **Zabbix 알림 전면 정지** — 우리 DB에는 발화가 기록되므로 화면과
  Zabbix가 갈린다. 규칙 식별자는 **태그에만** 있었던 것이 원인이다.
  - 🔴 **전역 트리거의 이름은 바꾸지 않았다.** 고객이 만든 Zabbix 액션·미디어 조건이 트리거
    이름을 걸고 있을 수 있고, 돌고 있는 것의 이름을 바꾸면 **알람은 뜨는데 아무 연락이 없는**
    고장이 된다. 서비스별 트리거는 이 결함 때문에 애초에 만들어진 적이 없거나 전역과 겹치지
    않는 종류라 잃을 것이 없다.
  - `SLO_BURN`은 대상이 서비스가 아니라 SLO이고 라벨이 `<서비스> / <SLO 이름>`이라 **SLO 이름이
    겹치면 라벨도 겹친다** — 그래서 표식만이 아니라 **규칙 UUID 앞 8자**를 함께 넣는다.
  - **마이그레이션 없음.** 트리거를 찾는 축은 이름이 아니라 태그이므로 옛 이름이 남아 있어도
    기능은 멀쩡하다. 우리가 쓴 **옛 이름 그대로인 것만** 다음 프로비저닝(5분 평가 배치)이 새
    형식으로 한 번 옮긴다(`alignLegacyDescription`). 사용자가 손수 고친 이름은 건드리지 않고,
    한 번 옮기면 그 뒤로는 아무 호출도 하지 않는다.
  - **동기화 배치(`sync`)는 이름을 대조하지 않는다** — 이름은 사람이 고쳐도 되는 값이라
    드리프트 배지의 축이 아니다(§6.5). 사라진 트리거를 재생성하는 길은 이름 조립을 한 곳
    (`ZabbixAlertBridge.triggerDescription`)에서 가져오므로 자동으로 새 형식이다.

| kind | thresholdUnit | Zabbix units | priority | 트리거 임계 | 값의 뜻 |
|---|---|---|---|---|---|
| `ERROR_RATE` | `pct` | `%` | 4 High | 규칙 임계 | 창 안 5xx/전체 × 100 |
| `P95_LATENCY` | `ms` | `ms` | 3 Average | 규칙 임계 | 창 히스토그램 합의 p95(초→ms) |
| `STALE` | `min` | `min` | 3 Average | 🔴 **`>0` 고정** | 임계 초과 시 경과 분, 아니면 0 |
| `COLLECTOR_FAILURE` | `count` | (빈 문자열) | 2 Warning | 규칙 임계 | `otelcol_exporter_send_failed_*` 창 증분 |
| `ACTIVE_REQUESTS_SPIKE` | `ratio` | (빈 문자열) | 2 Warning | 규칙 임계 | 최근 5분 평균 / 직전 5분 평균 |
| `STUCK_REQUEST` | `ms` | `ms` | 4 High | **0**(판정은 우리가 — 양수=걸린 요청 최대 경과 ms·0=정상·−1=측정 불가) | 처리 중 요청이 임계(ms)를 넘긴 채 아직 안 끝남 — 🔴 5분 배치가 아니라 **1초 감시기**(`ApmStuckRequestMonitor`)가 자바 확장의 처리 중 목록으로 판정(2026-09-23, V67 전역 60,000ms 시드). `windowMin` 미사용·미리보기 없음 |
| `SLO_BURN` | `ratio` | (빈 문자열) | 3 Average | 규칙 임계 | P3 — 평가기가 값을 내지 않는다 |

- 🔴 **kind enum의 정본은 FE 계약(`features/apm/core/contract_apm-read-api.md` §6-2)이다.** V38 주석의
  `LATENCY_P95`·`COLLECTOR_SEND_FAILED`는 확정 전 표기이며, 컬럼이 `varchar(32)`라 스키마 변경은
  없다. `ApmAlertKind.find()`가 옛 표기를 받아 준다(이름 하나가 안 맞아 규칙이 통째로 안 보이면
  원인 찾는 데 하루가 든다). `ApmAlertRule`의 상수도 새 이름으로 맞췄다
  (`KIND_P95_LATENCY`·`KIND_COLLECTOR_FAILURE`·`KIND_ACTIVE_REQUESTS_SPIKE` 신설).
- 🔴 **`STALE`만 트리거가 `>0`인 이유**: "몇 분째 안 온다"의 근거는 마지막 수신 시각이고 Zabbix는
  그걸 모른다. 우리가 판정해 **넘었을 때만 경과 분을, 아니면 0**을 민다. 임계를 바꿔도 Zabbix
  트리거를 안 고쳐도 되고 복구(값 0)도 정상 동작한다. (Zabbix `nodata()`는 "값을 안 미는 상태"와
  "서비스가 사라진 상태"를 구분하지 못해 쓰지 않는다.)
- ⚠️ **`count`·`ratio`의 Zabbix `units`는 빈 문자열이다.** Zabbix는 모르는 단위 문자열을 값 뒤에
  그대로 붙여 `3 count`처럼 보여 준다 — 화면에서 읽는 사람에겐 단위가 아니라 잡음이다. 우리 화면이
  쓰는 단위는 `thresholdUnit`이다.
- 🔴 **재탐색 키는 태그 `apm_uid`**(+`apm_service`)다. `zbx_triggerid`는 캐시일 뿐이며 사용자가
  지웠다 만들면 바뀐다(R10 §2-5).
- 🔴 **액션은 우리가 만들지 않는다.** "누구에게 어떻게 알릴 것인가"는 고객의 운영 정책이다. 대신
  진단 EP가 우리 그룹/태그를 조건으로 가진 **활성 액션 수**를 세어 "알림 액션 없음" 배지를 띄운다
  (실측: 데모 서버 액션 17개 중 우리 그룹 참조 **0개**).
- 🔴 **덮어쓰기 경로가 둘로 갈린다.** `ensureProvisioned`(배치, 5분마다)는 **없는 것만 만들고 기존
  트리거는 손대지 않는다** — 여기서 표현식을 맞추면 사용자의 Zabbix 수정이 매 5분 조용히
  되돌아간다. `applyOurDefinition`(규칙 생성·수정·resync OURS)만 강제한다.
- 🔴 **삭제는 소유 태그가 있는 것만.** 같은 키를 고객이 손으로 만들어 다른 용도로 쓸 수 있다.
  **트리거를 먼저** 지운다(아이템을 먼저 지우면 Zabbix가 그 아이템을 참조하는 남의 트리거까지 없앤다).
  호스트·그룹은 공용 그릇이라 지우지 않는다.
- 🔴 **아이템은 (kind, 서비스) 단위로 공유된다 — 의도된 설계다** (2026-09-01 명시, 분석 §12 A7).
  키에 **rule_uid가 없으므로** 전역 규칙과 같은 종류의 서비스별 규칙은 한 서비스에서 **아이템 하나**를
  가리키고 **트리거만 규칙마다** 갈린다(트리거 태그에 `apm_uid`가 있다). 값은 "이 서비스의 오류율"이지
  "이 규칙의 오류율"이 아니고, 규칙마다 아이템을 따로 만들면 같은 지표가 두 벌로 쌓이며 규칙을 갈아탈
  때마다 **이력이 끊긴다**. 임계는 트리거의 것이다.
  - 🔴 **그래서 삭제에 참조 카운트가 있다.** 공유 아이템을 지우면 Zabbix가 **다른 규칙의 트리거까지
    cascade로** 없앤다. `ZabbixAlertBridge.removeObjectsOf`가 `findByZbxItemid`로 살아남는 참조를 세어,
    있으면 **아이템은 두고 트리거만** 지운다(영속된 행만 참조로 센다).
  - 서비스별 규칙이 전역을 **덮을 때**도 아이템은 유지하고 전역 **트리거만** 내린다(§6.3 ORPHANED).
  - ⚠️ **이 공유가 런타임에서 성립하게 된 것은 2026-09-08(D10 수정)부터다.** 그 전에는 같은
    (kind, 서비스)의 두 규칙 중 **뒤에 온 것이 트리거를 못 만들어** 아이템을 공유하는 상태에
    도달할 수 없었고, 그래서 참조 카운트(`itemHasOtherActiveConsumer`)와 트리거별
    `event.acknowledge` 경로는 **단위 테스트로만** 보장돼 있었다(P3 2회차 QA D3d 판정 불가).

**캐시 동기화** — Zabbix 서버는 방금 만든 트래퍼 아이템을 설정 캐시 갱신(기본 10초) 전까지 모르고,
그때의 push는 **권한 없음/객체 없음과 똑같은 문구**로 실패한다. 구분은 시간축으로만 된다:

| 상태 | 판정 | 화면 |
|---|---|---|
| push 성공 | `cache_ready = true` | 정상 |
| `cacheMiss` + `synced_at`이 2분 이내 | `pendingCache`(실패로 안 센다) | "Zabbix 반영 중" |
| `cacheMiss` + 2분 초과 | `binding.error` 기록 | "권한·객체 확인 필요" |

⚠️ **busy-wait을 두지 않았다.** 평가 배치가 5분 주기라 프로비저닝 다음 실행이면 이미 캐시가 갱신돼
있다. 배치 안에서 10초씩 자면 대상 수만큼 잠들고, API 스레드에서 자면 규칙 저장이 2분 걸린다.
🔴 그리고 `cache_ready`는 **아이템 생성 성공이 아니라 첫 push 성공**에 선다 — 권한이 모자라면
아이템은 만들어지고도 값이 영원히 안 들어간다.

### 6.3 스키마 — `V41__apm_alert.sql`

`apm_alert_rule_binding`(신규): `id · rule_id → apm_alert_rule CASCADE · service_id → apm_service CASCADE(**nullable**) ·
zbx_itemid · zbx_triggerid · synced_at · drift · cache_ready · error · created_at · updated_at`

- 🔴 **왜 `apm_alert_rule`의 컬럼으로는 안 되는가.** 전역 규칙 1건은 **서비스 수만큼** 아이템·트리거를
  만든다(키에 서비스 UUID가 들어간다). 규칙 행에 칸이 하나뿐이면 마지막 것만 남고 나머지는 고아가
  되어, 규칙을 지워도 Zabbix에 남아 **아무도 안 보는 알람이 울린다**. V38의 두 컬럼은 편의 캐시로
  남기고 정본은 이 테이블이다.
- 🔴 **`service_id IS NULL` = 수집기 축.** PG UNIQUE는 NULL을 중복으로 안 보므로 **부분 유니크 인덱스
  2개**로 나눠 건다: `(rule_id, service_id) WHERE service_id IS NOT NULL` +
  `(rule_id) WHERE service_id IS NULL`.
- 시드: `scheduler_setting` 2행(`apm_alert_evaluate` interval 5분 · `apm_alert_sync` daily 02:00) +
  전역 기본 규칙 2건(`ERROR_RATE 5% / 5분`, `P95_LATENCY 2000ms / 5분`, 둘 다 enabled).
  🔴 `rule_uid`는 **고정 리터럴**(`…00a1`·`…00a2`)이다 — `gen_random_uuid()`면 환경마다 다른 UUID가
  Zabbix 태그에 박혀 매핑이 갈리고 `ON CONFLICT DO NOTHING`이 멱등이 아니게 된다.

#### 🔴 바인딩 상태 전이 (2026-08-31 정정, 분석 §12 A1·A2)

화면 상태는 컬럼 조합에서 파생한다: `ids null → MISSING` / `drift → DRIFT` / `!cache_ready → PENDING_CACHE`
/ else `SYNCED`. `error`는 그 위에 겹쳐 뜨는 배지다.

| 전이 | 누가 | 무엇을 쓰는가 |
|---|---|---|
| 바인딩 생성 · Zabbix id가 바뀐 **재생성** · `applyOurDefinition`(규칙 생성·수정·resync·sync의 트리거 복구) | 사람의 행동 / 복구 | `markProvisioned` — ids · `synced_at=now` · `drift=false` · `error=null` |
| **존재 확인만**(평가 배치가 5분마다 부르는 `ensureProvisioned`, id가 그대로) | 평가 배치 | **아무것도 안 쓴다** |
| 첫 push 성공 | 평가 배치 | `cache_ready=true` (+ push 오류 배지 해제) |
| push 실패 · 유예 2분 안 · 사유에 `does not exist` | 평가 배치 | 아무것도 안 쓴다(대기로 집계) |
| push 실패 · 그 밖 | 평가 배치 | `error=사유` |
| push 성공(이미 cache_ready) | 평가 배치 | **push 오류 배지만** 해제 |
| 표현식 불일치 | sync 배치 | `drift=true` |
| 아이템 `state=1` | sync 배치 | `error="Zabbix 아이템 NOT_SUPPORTED: 원문"` |
| 아이템 회복 | sync 배치 | **NOT_SUPPORTED 배지만** 해제 |
| 규칙 on/off 시 `trigger.update` 실패(바인딩 단위) | 규칙 수정(CRUD) | `error="TRIGGER_STATUS_PENDING: wanted=disabled — 사유"` |
| 그 바인딩의 트리거 상태를 드디어 맞춤 | **평가 배치 시작부 · sync 배치 시작부**(재시도) | **TRIGGER_STATUS_PENDING 배지만** 해제 |
| 재시도했는데 건드릴 트리거가 없음(트리거 id 없음 · 우리 소유 아님 · 규칙이 이미 삭제됨) | 재시도 | 배지 해제(켜고 끌 대상 자체가 없다 — 남기면 아무도 못 내리는 영구 배지) |
| **이번 평가의 대상 집합에서 빠짐**(서비스 HIDDEN · 서비스별 규칙이 전역을 덮음 · 규칙 비활성 · kind 미인식) | 평가 배치의 고아 정리 | `orphaned_at=now` + 그 쌍의 **열린 이벤트 해소** + Zabbix 트리거 `status=1`. 🔴 **아이템은 그대로 둔다** |
| **다시 대상이 됨**(unhide · 서비스별 규칙 끄기/삭제 · 규칙 재활성 · kind 수정) | 평가 배치의 고아 정리 | `orphaned_at=null` + 트리거 `status=0` |
| 규칙 행 자체가 없어진 바인딩 | 평가 배치의 고아 정리 | 소유 태그 확인 후 트리거→아이템 삭제 + **바인딩 행 삭제**(되돌아올 길이 없다) |

- 🔴 **`markProvisioned`는 "만들었다"에만 쓴다.** 존재 확인에서 부르면 `synced_at`이 매 5분 지금으로 밀려
  캐시 유예(2분)가 **영원히 만족**되고, 권한 없음 같은 영구 실패가 끝없이 "동기화 중"으로 위장된다(A1).
  같은 호출이 `drift=false·error=null`도 써서 02:00 sync가 세운 배지를 02:05에 지웠다(A2).
- 🔴 **배지는 세운 쪽이 내린다.** push 성공은 push 실패로 세운 배지만, sync는 자기 NOT_SUPPORTED만 내린다.
  구분은 문자열 접두 `ApmAlertRuleBinding.ERROR_PREFIX_NOT_SUPPORTED`다 — 출처가 셋이 되면 컬럼으로 승격할 것.
  (트래퍼 push는 값 형식이 틀려도 **성공으로 답하므로** push 성공은 NOT_SUPPORTED의 반증이 아니다.)
- 유예를 넘긴 `does not exist`는 `error`에 남고 **다음 배치가 다시 시도**한다(재시도를 멈추지 않는다).
- 🔴 **`TRIGGER_STATUS_PENDING`은 다른 배지보다 세다**(2026-08-31, 코덱스 2차 검수 #3). push 성공도
  push 실패도 이 배지를 **덮거나 지우지 못한다**(`markError`·`clearPushError`가 건너뛴다). 값이 들어가는
  것과 트리거가 켜져/꺼져 있는 것은 다른 사실이고, 이 표식이 사라지면 **재시도 대상에서 빠져 불일치가
  영구**가 된다. 내리는 것은 상태를 실제로 새긴 쪽뿐이다 — 재시도, 또는 `status`를 함께 쓰는
  `applyOurDefinition`/트리거 생성.
- 🔴 **재시도가 보는 "원하는 상태"는 규칙의 `enabled`다.** 배지 문자열의 `wanted=`는 사람이 읽을 기록일
  뿐이며, 실패 후 사용자가 규칙을 다시 켰다면 최종 의사는 "켜짐"이다(옛 표식대로 끄면 사람의 마지막
  판단을 뒤집는다). 그래서 상태를 위한 별도 컬럼을 두지 않았다 — 두면 규칙과 두 벌이 된다.

##### 🔴 ORPHANED — 대상 집합에서 빠진 쌍 (2026-09-01 신설, `V42`, 분석 §12 A6)

`apm_alert_rule_binding.orphaned_at`(nullable timestamp) 신설. **`error`와 직교한다** — 고아는 실패가
아니라 상태이고, 접두 문자열로 뒀다면 `markError`가 덮지 않는 `TRIGGER_STATUS_PENDING`에 가려
**정확히 가장 필요한 경우에 표시조차 못 했다**(껐는데 트리거를 못 내린 바인딩).

- 🔴 **왜 필요한가.** 대상에서 빠지면 우리는 **값을 그만 밀 뿐**이고, Zabbix `last()`는 값이 안 들어와도
  **마지막으로 민 값**을 계속 답한다 → 트리거가 참인 채 남아 **아무도 재지 않는 Problem이 계속 울린다**.
  화면은 그 규칙이 꺼졌다고, 또는 그 서비스가 숨겨졌다고 말하고 있다.
- **지우지 않고 내려 둔다.** 빠지는 길 넷이 전부 되돌아올 수 있고, 아이템을 다시 만들면 캐시 유예(2분)를
  또 기다리며 그 사이 값이 유실된다. 그리고 아이템은 **(kind, 서비스)의 것**이라 다른 규칙이 여전히
  그 아이템으로 값을 받고 있을 수 있다(§6.2 A7).
- **한 번만 한다.** `orphaned_at`이 이미 있으면 아무것도 하지 않는다(없으면 5분마다 같은
  `trigger.get`+`trigger.update`가 바인딩 수만큼 나간다). 표식 시각도 밀지 않는다 — 밀면
  "언제부터 고아인가"를 잃는다.
- 실행 요약에 `orphan(new=n back=m gone=k fail=f)`가 붙는다(§6.4).
- ⚠️ **해소 사유 컬럼은 여전히 없다** — `ORPHANED`는 로그에만 남고 화면에는 "해소됨"으로 보인다
  (`RULE_DISABLED`와 같은 제약).
- ⚠️ **응답 DTO는 안 바꿨다.** `ApmAlertBindingSummaryDto`에 `orphaned` 칸을 더하지 않았으므로
  화면은 아직 이 상태를 **못 보여 준다**(고아 바인딩은 `total`에만 잡힌다). 배지로 노출하려면
  FE 동반 변경이 필요하다.
- 🔴 **서비스 삭제는 표식이 아니라 삭제다.** `apm_service` 행이 지워지면 바인딩이 FK CASCADE로
  **DB가 먼저 없애** 우리가 Zabbix 객체를 가리킬 id를 잃는다. 그래서 `ApmServiceQueryService.delete`가
  행을 지우기 **전에** `ApmAlertService.releaseService`로 그 서비스의 알람 객체를 걷어 낸다
  (실패해도 삭제는 진행 — 남은 객체는 소유 태그로 사람이 찾을 수 있다).

#### 🔴 규칙을 껐다 켤 때 · 지울 때 (2026-08-31 신설, 분석 §12 A3)

| 동작 | 우리 DB | Zabbix |
|---|---|---|
| `enabled: true → false` | 이 규칙의 **열린 이벤트 전부 `resolved_at=now`** | 소유 태그가 있는 트리거만 `status=1`(disabled) — 바인딩별로 끝까지 시도, 실패분은 `TRIGGER_STATUS_PENDING` |
| `enabled: false → true` | — | `applyOurDefinition`으로 정의를 다시 쓴 뒤 `status=0`(같은 부분 실패 규약) |
| 삭제 | 열린 이벤트 해소 → 바인딩 삭제 → 규칙 삭제 | 소유 확인된 트리거 → 아이템 순 삭제(호스트·그룹은 유지) |

- 🔴 **끄는 것은 두 곳을 동시에 꺼야 한다.** 규칙만 끄면 (1) 트리거는 **마지막으로 민 값**으로 계속 참이라
  Problem이 열린 채 알림이 나가고, (2) 우리 열린 이벤트는 평가 대상에서 빠져 **영영 해소되지 않는다**
  (이벤트 목록에 "진행 중"으로 남고 지속시간이 계속 늘어난다).
- **순서는 우리 DB 먼저, Zabbix 나중.** Zabbix 호출이 실패해도 CRUD는 성공하고 화면은 정직하다(로그 WARN).
- 🔴 **부분 실패가 정상 결과다**(2026-08-31, 코덱스 2차 검수 #3). 전역 규칙 하나는 서비스 수만큼 트리거로
  펼쳐지므로 "3건 중 2건은 껐고 1건은 못 껐다"가 흔하다. 옛 코드는 두 번째 `trigger.update`가 던지면
  루프가 끊겨 **나머지 트리거가 켜진 채** 남았고(DB `enabled`는 이미 false, 열린 이벤트도 닫힘 →
  화면은 "꺼짐"인데 Slack은 계속 울림) 재시도 경로도 없었다. 지금은 ① 바인딩마다 끝까지 시도하고
  ② 실패분에 `TRIGGER_STATUS_PENDING` 표식을 남기며 ③ 로그에 `ok=n fail=m skip=k` 요약을 남긴다.
- **재시도 지점 둘**: 평가 배치(5분) 시작부 · sync 배치(일 1회) 시작부. 🔴 둘 다 **규칙이 아니라 배지가
  붙은 바인딩에서 출발**한다 — 평가는 `findByEnabledTrue`, sync는 꺼진 규칙 skip이라 "껐는데 못 껐다"가
  두 루프 어디에도 안 걸리기 때문이다. 꺼진 규칙은 평가·프로비저닝·push 대상이 아니므로, 재시도가
  성공할 때까지 그 트리거는 **마지막으로 민 값**으로 참인 상태로 남는다(그래서 재시도가 필요하다).
  반대로 하면 "Zabbix만 꺼지고 화면엔 열린 알람"이라는 더 나쁜 조합이 된다.
- ⚠️ 해소 **사유** 컬럼은 없다 — `RULE_DISABLED`는 로그에만 남고 화면에는 "해소됨"으로만 보인다.
  사유를 화면에 싣기로 하면 `apm_alert_event`에 컬럼을 더하고 `ApmAlertEventDto`를 넓혀야 한다(FE 동반 변경).
- 아이템은 끄지 않는다 — 값을 안 밀면 아무 일도 안 하고, 껐다 켜면 캐시 유예를 다시 기다려야 한다.

### 6.4 평가 배치 — `apm_alert_evaluate` (5분)

`ApmAlertEvaluationJob` → `ApmAlertEvaluationService.evaluateAll(now)`.
요약: `rules=n targets=m values=k fired=f resolved=r push(ok=a wait=b fail=c) provFail=d orphan(new=o back=p gone=q fail=r2)`.

실행 순서: **트리거 상태 재시도 → 규칙×대상 평가(대상 키 수집) → 고아 정리 → push → eventid 짝 찾기**.
🔴 **고아 정리가 push보다 앞이다** — 돌아온 대상의 트리거를 되켠 뒤에 값이 들어가야 그 값으로 바로
판정된다(반대 순서면 꺼진 트리거가 값을 받고, 켜지는 것은 5분 뒤 다음 값부터다).
🔴 **대상 키 집합은 이 루프가 만든 것 하나뿐**이며 정리 쪽이 다시 계산하지 않는다 — 두 벌로 세면
"재고 있는데 고아"가 생긴다.

집계는 전부 **`apm_metric_1m` 원본**에서 한다 — 롤업(5m)은 `LAG=2분`만큼 늦게 채워져 **가장 최근
창이 항상 비거나** 절반만 찬 버킷을 읽는다.

| kind | 계산 |
|---|---|
| `ERROR_RATE` | `sum(count) filter (dims->>'status_class' = '5xx') / sum(count) × 100`, metric=`http.server.request.duration` |
| `P95_LATENCY` | 창 안 `hist_counts`를 `apm_int_array_sum`(V40)으로 접고 `HistogramRebucketer.percentile(…, 0.95)` × 1000 |
| `STALE` | `apm_service.last_seen_at` 기준 경과 분(임계 초과 시에만, 아니면 0) |
| `COLLECTOR_FAILURE` | `service_id = 0` 센티널, `metric like 'otelcol_exporter_send_failed%'`의 `sum(sum)` |
| `ACTIVE_REQUESTS_SPIKE` | `http.server.active_requests`의 최근 5분 평균 / 직전 5분 평균 |
| `STUCK_REQUEST` | 자바 확장의 처리 중 요청 목록(`live[svc].activeList`)에서 `elapsedMs ≥ threshold`인 요청이 1건 이상 — 요청별 장부 `apm_stuck_request`(`GET /apm/stuck-requests`) + 서비스 단위 `apm_alert_event` |

창 번호는 `floor(extract(epoch from (bucket_start - CAST(? AS timestamp))) / ?)::int`로 낸다.
🔴 `to_timestamp(extract(epoch …))`로 돌려 자르지 않는다 — 결과가 `timestamptz`가 되어 시간대만큼
밀린 버킷이 나온다(롤업에서 이미 밟은 함정).

- 🔴 **값이 없으면 push도 판정도 하지 않는다.** "요청이 한 건도 없던 5분"을 0%로 밀면 서비스가 죽어
  트래픽이 끊긴 상황이 **가장 건강한 그래프**가 된다. 수신 끊김은 `STALE`이 따로 잡는 분업이다.
- 🔴 **우리 판정식이 트리거 표현식과 같다**(`value > kind.expressionThreshold(threshold)`). 다르면
  "화면에는 열려 있는데 Slack에는 안 온" 상태가 되고 누구를 믿을지 알 수 없다.
- 🔴 **`bounds_id`가 갈리면 섞지 않는다** — 관측이 가장 많은 경계 하나를 골라 계산하고 나머지는
  버린다(롤업의 같은 판단과 짝).
- 🔴 **직전 창 평균이 0이면 SPIKE 값을 내지 않는다.** 0으로 나누면 `Infinity`가 나오고 그 문자열을
  밀면 아이템이 NOT_SUPPORTED가 되어 **그 규칙이 통째로 죽는다**(게다가 0→1은 급증이 아니라 기동이다).
- **이벤트 전이**: 임계 초과 + 열린 이벤트 없음 → `apm_alert_event` 신규. 임계 이하 → 열린 이벤트
  `resolved_at`. ⚠️ 이미 열려 있으면 `value`를 **갱신하지 않는다**(firedAt의 값은 "터진 순간 얼마나
  나빴나"이고, 매 5분 덮어쓰면 회복 직전 값만 남는다).
- 🔴 `ApmAlertEventRepository.findOpen(ruleId, serviceId)`는 **JPQL**이다. 파생 쿼리는
  `serviceId=null`을 `= null`로 번역해 항상 0건을 주고, 그러면 수집기 축이 5분마다 새 이벤트를
  만들며 해소는 영영 안 된다.
- **`zbx_eventid`는 다음 실행이 채운다**(best effort) — 값을 민 순간에는 Zabbix가 아직 Problem을 안
  만들었다(실측 5초). `event.get(source 0, object 0, value 1, objectids=[우리 triggerid])`로 1콜,
  발화 시각 ±3분 안에서 가장 가까운 것을 짝짓는다. 🔴 `problem.get recent:true` 금지(최근 해소분까지
  돌려줘 "아직 열림"으로 오판 — R10 §1 표 7). 이미 붙은 eventid는 **덮어쓰지 않는다**(다음 발화를
  붙이면 엉뚱한 Problem을 가리킨다).
- **실패 규약**: 대상이 있는데 **전부** 프로비저닝 실패면 던진다(Zabbix 미연결·권한). 부분 실패는
  요약 문자열(레포 규약 §3 #14). 알 수 없는 kind의 규칙은 WARN 후 건너뛴다 — 규칙 하나 때문에
  알람 전체가 조용해지면 안 된다.
- 라이선스: 🔴 `requiresActiveLicense() = true`(기본값 유지) — 알람은 정리가 아니라 **프리미엄 기능의
  동작 그 자체**다. 만료본에서 알람이 계속 나가면 잠금이 아니다.

### 6.5 드리프트 동기화 배치 — `apm_alert_sync` (daily 02:00)

`ApmAlertSyncJob` → `ApmAlertSyncService.syncAll(now)`.
요약: `checked=n drift=d recreated=r notSupported=x fail=f`.

세 가지만 한다. 🔴 **고치지 않는다.**

1. `trigger.get expandExpression` 결과와 우리 표현식이 다르면 **`drift=true`만** 세운다. 배치가 매일 밤
   되돌리면 사람의 운영 판단을 말없이 뒤집는 것이다. 되돌릴지 채택할지는 화면에서 고른다.
2. 트리거가 **사라졌으면 재생성**한다(판단이 아니라 복구 — 규칙은 켜져 있는데 Zabbix에 아무것도
   없으면 알람이 **조용히 안 울린다**). `log.info`로 남긴다.
3. 아이템이 `state=1(NOT_SUPPORTED)`이면 `binding.error`에 Zabbix 원문 사유를 적는다 — 이 상태는
   push 결과로는 안 보인다(계속 성공으로 답하고 값만 안 쌓인다).

- 비교는 **공백만 지운 문자열 대조**다. 의미가 같은데 표기가 다른 식(`>5.0`)은 드리프트로 잡힌다 —
  ⚠️ **덜 잡는 것보다 더 잡는 쪽**이 낫다(배지는 무시할 수 있지만 놓친 변경은 못 되찾는다).
- **꺼진 규칙은 대조하지 않는다** — 껐다는 것은 "지금은 신경 쓰지 않겠다"는 뜻이고 그 배지는 소음이다.
- 사용자가 값을 되돌려 놓으면 배지가 자동으로 내려간다.
- ⚠️ 감사 로그는 `zabbixadmin`의 `ZabbixChangeLog` 체계를 쓰지 않았다 — 그 경로는 `TokenUserInfo`를
  요구하는데 배치에는 행위자가 없고, `premium`이 app 리포지토리를 참조하는 것은 ArchUnit A3가
  막는다. 재생성·드리프트는 애플리케이션 로그(`log.info`)와 바인딩 행에 남는다.

### 6.6 API — `ApmAlertRuleController` (`@RequiresFeature(APM)`)

권한: 🔴 **`ApmAccessChecker.requireEdit`**(= `apm.edit`, 관리자 우회 포함 — 2026-09-03 전환. 그 전에는 `AdminAccessChecker.requireAdmin`). `@RolesGuarded`+`@Roles`였다면 Zabbix
미연동 admin(roleid=null)이 막혀 **알람 규칙을 아예 못 만든다**(레포 규약 §3 #2).
거부는 **HTTP 200 + body `code:403`**(원본 계약 보존).

| 메서드 · 경로 | 권한 | 응답 `data` |
|---|---|---|
| `GET /apm/alert-rules` | 관리자 | `ApmAlertRuleDto[]` (전역 먼저, kind·서비스명 순) |
| `POST /apm/alert-rules` | 관리자 | `ApmAlertRuleDto` |
| `PUT /apm/alert-rules/{ruleUid}` | 관리자 | `ApmAlertRuleDto` |
| `DELETE /apm/alert-rules/{ruleUid}` | 관리자 | `{deleted: true}` |
| `POST /apm/alert-rules/{ruleUid}/resync?mode=OURS\|THEIRS` | 관리자 | `ApmAlertRuleDto` |
| `POST /apm/alert-rules/preview` | 관리자 | `ApmAlertPreviewDto` |
| `GET /apm/alert-rules/zabbix-status` | 관리자 | `ApmAlertZabbixStatusDto` |
| `GET /apm/services/{uid}/alert-rules` | **운영자 읽기** | `ApmAlertRuleDto[]` (그 서비스에 걸린 것 — 아래 🔴 A22) |
| `GET /apm/alert-events?serviceUid&from&to&open&limit&offset` | **운영자 읽기**(2026-10-08 "장애 및 에러" 메뉴 — 관리자→읽기로 완화) | `PagedListDto<ApmAlertEventDto>`. 🔴 `open=true`면 `resolvedAt IS NULL`만이고 **from/to를 무시**한다(언제 터졌든 지금 열린 알람 전부). SQL 페이징(`ApmAlertEventRepository.search`) |

```ts
type ApmAlertRuleDto = {
  ruleUid: string;
  kind: 'ERROR_RATE'|'P95_LATENCY'|'STALE'|'COLLECTOR_FAILURE'|'ACTIVE_REQUESTS_SPIKE'|'SLO_BURN'|'STUCK_REQUEST';
  thresholdUnit: 'pct'|'ms'|'min'|'count'|'ratio';
  threshold: number; windowMin: number; enabled: boolean; global: boolean;
  source: 'GLOBAL'|'SERVICE';                 // 서비스별 적용 목록에서 어디서 왔는지
  effective: boolean|null;                    // 🔴 A22. 이 규칙이 그 서비스를 **실제로 감시하나**.
                                              //    서비스별 적용 목록에서만 채워지고 다른 EP에서는 null
  appliedRuleUid: string|null;                // 🔴 A22. 그 종류를 실제로 감시하는 규칙의 ruleUid.
                                              //    자기 자신이거나 전역 규칙. 아무도 안 하면 null
  serviceUid: string|null; serviceName: string|null;
  bindings: { total: number; synced: number; pendingCache: number; drift: number;
              missing: number; error: string|null };
  createdAt: string; updatedAt: string;
};
type ApmAlertEventDto = {
  eventId: number; ruleUid: string|null; kind: string|null; thresholdUnit: string|null;
  serviceUid: string|null; serviceName: string|null;
  firedAt: string; resolvedAt: string|null;   // 🔴 null = 아직 열려 있음(0·epoch 아님)
  value: number|null; zbxEventId: string|null; open: boolean; durationSec: number|null;
};
type ApmAlertPreviewDto = {
  kind: string; thresholdUnit: string; threshold: number; windowMin: number;
  ts: number[]; values: (number|null)[];      // 길이 같음. 🔴 null = 잴 것이 없던 창(0 아님)
  breachCount: number;                        // 위반 **창** 수
  breaches: { from: number; to: number; peak: number; windows: number }[];  // 실제 울린 **횟수**
  sampledWindows: number; approximate: boolean;   // approximate = STALE(과거 수신 이력 재현 불가)
};
type ApmAlertZabbixStatusDto = {
  reachable: boolean; error: string|null;
  groupName: string; groupId: string|null; hostName: string; hostId: string|null;
  itemsVisible: number; notSupportedItems: number;
  bindingTotal: number; bindingSynced: number; bindingPendingCache: number;
  bindingDrift: number; bindingMissing: number;
  notifyActions: number; notifyActionNames: string[];   // 🔴 0 = 알람이 아무에게도 안 간다
};
```

🔴 **`GET /apm/services/{uid}/alert-rules`의 판정이 바뀌었다 (2026-09-01, A22).**
전에는 **꺼진** 서비스별 규칙도 전역을 덮은 것으로 표시해, 화면은 "서비스별 규칙(꺼짐) 적용"이라
말하는데 실제로는 **전역 규칙이 감시**하고 있었다(배치의 `targetsOf`는 활성 규칙만 덮개로 친다).
이제 두 판정이 같은 문장을 쓰고, 응답은 이렇게 나간다:

| 그 종류의 상태 | 응답 줄 수 | `effective` / `appliedRuleUid` |
|---|---|---|
| 서비스별(켜짐) 있음 | 1 (서비스별) | `true` / 자기 자신. 전역은 **안 나온다**(적용되지 않으므로) |
| 서비스별(꺼짐) + 전역(켜짐) | **2** | 전역 `true`/자기 자신, 서비스별 `false`/**전역의 uid** |
| 서비스별(꺼짐)만 | 1 | `false` / **`null`** = 아무도 감시하지 않는다 |
| 전역만 | 1 | 전역이 켜져 있으면 `true`/자기, 꺼져 있으면 `false`/`null` |

⚠️ **이 EP에서만 같은 `kind`가 두 줄 나올 수 있다**(둘째 줄 상황). 꺼진 규칙을 감추면 화면에서
다시 켤 방법이 사라지므로 남기고, 실제로 도는 쪽을 **먼저** 준다. FE는 `kind`를 키로 쓰지 말 것
(`ruleUid`가 키다). 다른 EP(`GET /apm/alert-rules` 등)에서는 두 필드가 **항상 `null`**이다 —
서비스가 없으면 "이 규칙이 도나"에 답할 수 없다.

요청 body: `POST/PUT` = `{kind?, serviceUid?, threshold?, windowMin?, enabled?}` ·
`preview` = `{kind, serviceUid?, threshold, windowMin?, from?, to?}`(ms 에폭, 미지정 시 최근 24h,
점 2000개 상한 — 넘으면 **최근 쪽**을 남긴다).

**에러코드**(전부 HTTP 200 + body `code:400` + `errorCode`)

| errorCode | 언제 |
|---|---|
| `APM_ALERT_KIND_UNSUPPORTED` | kind가 계약 enum이 아님 |
| `APM_ALERT_RULE_NOT_FOUND` | ruleUid 없음 / UUID 형식 아님 |
| `APM_ALERT_RULE_INVALID_THRESHOLD` | 임계 ≤ 0(SPIKE는 ≤ 1) · NaN · 오류율 > 100 · windowMin 범위 밖(1~1440). 🔴 **resync `THEIRS`가 Zabbix에서 읽어 온 임계에도 같은 검증이 걸린다**(2026-08-31, A4) — 거절되면 규칙도 Zabbix도 그대로다 |
| `APM_ALERT_RULE_SCOPE_INVALID` | `COLLECTOR_FAILURE`에 serviceUid를 줌 / 서비스 축 미리보기에 serviceUid 없음 |
| `APM_ALERT_RULE_DUPLICATE` | 같은 범위·같은 kind가 이미 있음 |
| `APM_ALERT_RESYNC_MODE_INVALID` | mode가 OURS·THEIRS가 아님 · 🔴 **`STALE`에 `THEIRS`**(2026-08-31, A4 — 트리거 상수가 항상 `0`이라 채택하면 모든 서비스가 즉시 발화한다. 판정은 우리가 분 단위로 하고 Zabbix에는 "위반이면 분, 아니면 0"만 민다) |
| `APM_SERVICE_NOT_FOUND` | serviceUid 없음 (**신설** — 조회 API와 공용) |

- 🔴 **임계 0을 막는 이유**: 오류율 0은 "모든 요청이 성공해야 한다"라 정상 서비스에서도 즉시 발화한다.
  상시 켜진 알람은 아무도 안 보게 되고, 그게 알람 시스템이 죽는 방식이다.
- 🔴 **수정에서 `kind`·`serviceUid`는 무시된다.** 둘 다 아이템 키에 들어가는 값이라 바꾸면 삭제 후
  재생성이고 이력이 끊긴다 — 그 사실이 화면에 보여야 하므로 새 규칙을 만들게 한다.
- **서비스별이 전역을 이긴다.** 같은 kind에 서비스별 규칙이 있으면 전역은 그 서비스에서 **펼치지
  않는다**(둘 다 살리면 같은 문제로 두 번 울린다). `targetsOf`가 그 판정을 하고 배치·API가 공유한다.
- **대상은 `ACTIVE` 서비스만.** `PENDING_APPROVAL`은 데이터가 저장되지 않아 값이 영원히 안 나오고,
  `HIDDEN`은 사용자가 "안 볼 것"이라고 말한 것이다.
- **`resync THEIRS`**: Zabbix 표현식에서 임계를 되읽어 **규칙 쪽을 고친다**. ⚠️ 표현식이 우리 형태가
  아니면(사람이 식을 통째로 다시 씀) 규칙을 **건드리지 않고** drift만 남긴다 — 못 읽은 값을 추측해
  덮어쓰면 화면과 실제가 다시 갈린다.
- ⚠️ **규칙 생성·수정 직후 즉시 동기화한다**(배치 5분을 기다리지 않는다). 그 호출이 실패해도
  **CRUD는 성공**하고 배치가 이어서 맞춘다 — 실패시키면 사용자는 규칙을 못 만드는데 원인은 Zabbix다.
- ⚠️ **Zabbix 삭제가 실패해도 규칙은 지운다.** 남기면 화면에 지운 규칙이 계속 보여 같은 버튼을
  반복해서 누른다. 남은 객체는 소유 태그가 있어 사람이 찾아 지울 수 있다.

### 6.7 정정 — `MetricIngestor` 전량 귀속 실패는 503이다

`premium/apm/collector/ingest/store/MetricIngestor` + 신규 `ApmIngestUnavailableException`.

🔴 **문제**: 리졸버가 **예외**(DB 장애 등)를 던진 리소스를 `UNKNOWN_SERVICE`로 접고 200을 답했다.
OTLP exporter는 200을 "잘 받았다"로 읽고 **큐를 비운다** — DB가 흔들린 그 시간의 텔레메트리가 영구히
사라진다(AI 모니터링 R11의 "60초에 31배치 손실"과 같은 구조).

| 상황 | 응답 | 이유 |
|---|---|---|
| 정책상 미저장(PENDING/REJECTED/UNKNOWN_SERVICE/허용목록 밖) | **200** | 다시 보내도 같은 결과라 재시도가 무의미하다. exporter가 같은 배치를 영원히 물고 늘어진다 |
| 리졸버/스토어 **예외** + 저장 0행 | **503** | 몇 초 뒤 낫는 상태다. exporter가 백오프 재시도해 데이터가 살아난다 |
| 리졸버 예외 + **일부 저장됨** | **200** + WARN | 던지면 배치 전체가 재전송되어 저장된 몫이 **두 번 계산**된다(1m UPSERT는 덧셈) |

- ⚠️ **`dropReason` 판정 실패는 장애로 세지 않는다** — 귀속은 이미 "정책상 대상 아님"으로 끝났고,
  이건 사유를 예쁘게 적으려다 실패한 것뿐이다. 재전송해도 저장되지 않는다.
- 컨트롤러(`ApmOtlpController`)는 이미 적재 예외를 503으로 바꾸므로 배선 변경은 없다.

### §6 검증

- 단위 **79건**(9+19+24+8+8+7 + MetricIngestor 4)
  - `ZabbixHistoryPushImplTest` 9(engine-zabbix) — 전건 성공 · 항목 error · 혼합 인덱스 정합 ·
    짧은 응답 패딩 · data 없음 · 빈 목록 · 대상 형태 배타 · 대상 없음 거부 · **로케일 무관 숫자**.
  - `ZabbixAlertBridgeTest` 19 — 생성/재사용 멱등 · **배치는 덮어쓰지 않고 사람 경로만 강제** ·
    인터페이스 없는 호스트 · 그룹 이름 정확 일치 · Zabbix 실패를 배지로 · STALE `>0` ·
    캐시 대기 3상태 · push 대상이 host+key · **소유 태그 없으면 삭제 안 함** · 트리거 선삭제 ·
    표현식 임계 파싱 · 로케일 · 액션 진단 2.
  - `ApmAlertServiceTest` 24 — 임계/창 검증 6 · 수집기 전역 전용 · 중복 · 알 수 없는 kind ·
    즉시 동기화(실패 내성) · 수정 불변 축 · 삭제 내성 · resync 3 · **전역 펼침과 서비스별 우선** ·
    미리보기 구간 접기 · 바인딩 요약.
  - `ApmAlertSyncServiceTest` 8 · `ApmAlertJobTest` 8(job_key 시드 일치·라이선스·요약·전건 실패) ·
    `ApmAlertRuleMvcTest` 7(권한·enum·400·기본 mode·진단 노출).
  - `MetricIngestorTest`에 **4건 추가**(503/200 판정) — 기존 "예외를 던지지 않는다" 테스트를
    **교체**했다(그 동작이 이번에 고친 결함이다).
- 통합 **7건** `ApmAlertEvaluationIT`(도커 PG 5433 `moveseye_it`, skip 0) — 오류율 발화→해소 ·
  열린 이벤트 중복 금지 · **빈 창은 값 없음** · 히스토그램 p95(ms) · STALE 경과 분 ·
  숨김 서비스 제외 · 전역 규칙의 서비스별 바인딩.
- `ApmSchemaIT.seedsApplied`를 V41에 맞춰 갱신(배치 시드 3 → 5).
  ⚠️ 전역 기본 규칙 2건은 **여기서 검사하지 않는다** — 같은 DB를 쓰는 `ApmAlertEvaluationIT`가
  대상 수를 통제하려고 `apm_alert_rule`을 비우므로 실행 순서에 따라 갈리는 가짜 실패가 된다.
- `LicenseArchitectureTest`(A1~A5) green — 컨트롤러 `@RequiresFeature` 보유, premium 밖 리포지토리 미참조.
- 전체 `gradlew test` **green, skip 0**(단위 + IT 전량, engine 모듈 포함).

### §6 불안한 지점 (실 Zabbix 미검증)

1. **실서버 왕복은 안 해 봤다.** R10 스크립트가 검증한 것은 `history.push`·트리거·드리프트까지이고,
   **이 코드가 만든 파라미터**로 아이템/트리거를 만들어 본 적은 없다. 특히 `item.create`의 `tags`와
   `trigger.create`의 `tags`(7.0 스펙상 지원)는 실호출 미검증이다.
2. **`ZabbixClient`가 "No permissions" 문구를 401로 바꾼다.** 브리지는 그 예외를 잡아 배지로 만들지만,
   제한된 API 계정에서 실제로 어떤 경로가 401로 새는지는 실서버에서만 드러난다.
3. **`action.get selectFilter` 응답 형태**를 `filter.conditions[]`의 `conditiontype`·`value`로 가정했다.
   R10은 조건 개수만 셌고 파싱 코드는 이번이 처음이다.
4. **수집기 실패 메트릭 이름**(`otelcol_exporter_send_failed%`)은 접두 일치로 잡는다. 수집기 버전에
   따라 이름이 갈리면 값이 안 잡힐 수 있다("행이 없으면 push 안 함"이라 0으로 위장하지는 않는다).
5. **`ACTIVE_REQUESTS_SPIKE`·`COLLECTOR_FAILURE`는 실데이터로 계산해 본 적이 없다.** IT는 오류율·
   p95·STALE만 실제 행으로 검증했다.
6. **미리보기 STALE은 근사**다(`approximate: true`). 과거 `last_seen_at`이 남지 않아 "그 창에 데이터가
   있었나"로 대신한다.
7. 🔴 **`ErrorCode.APM_SERVICE_NOT_FOUND`를 신설**했다. 조회 API를 만드는 쪽(`premium/apm/overview`·`service`)이
   같은 상수를 추가하면 **중복 선언으로 컴파일이 깨진다** — 병합 시 한쪽을 지울 것.
8. **호스트 id 캐시**는 프로세스 메모리(volatile 필드)다. 다중 인스턴스에서 각자 캐시하며, 호출이
   실패하면 즉시 버리고 다시 조회한다. 사람이 Zabbix에서 호스트를 지우면 다음 실패 때 복구된다.
9. ~~**`GET /apm/alert-events`는 메모리 필터링**이다(`findAll()` 후 자바에서 자름).~~ → 2026-10-08
   "장애 및 에러" 메뉴에서 SQL 페이징(`ApmAlertEventRepository.search`)으로 교체. 운영자 전원이 자동
   갱신으로 보는 화면이 되면서 전건 스캔을 둘 수 없었다. `offset`은 임의 값이 정확히 적용된다(`OffsetBasedPageRequest`,
   코덱스 🔴1 — 요청 걸림 장부도 같이 고침). 인덱스 V75 `(fired_at desc, id desc)`. 🔴 `/stuck-requests`의 `open=true`도
   같은 날부터 **from/to를 무시**한다(두 EP의 `open` 의미 통일). ⚠️ 규칙·서비스 삭제 시 이력 행은 FK CASCADE로 함께
   지워진다(이력 보존은 백로그).

---

## §7 P2 트레이스 1차 물결 — 파서 · V44 · 수신 적재 (WBS 3.1~3.4, 2026-09-02)

브랜치 `master`(**미커밋**). 설계 정본 §5(M2 트레이스·서비스 맵) · §7 표의 "V37 (P2)" 행.

**이번 물결의 범위**: 스팬을 **받아서 저장하고 트레이스 요약을 유지**하는 데까지.
조회 API·워터폴·서비스 맵·에러 그룹·DB 쿼리 그룹은 **2차 물결**(WBS 3.5~3.10·3.12~3.14) —
✅ **2026-09-02 완료, §7.8 참조**. (3.11 배포 감지는 여전히 미착수.)

### 7.1 파서 — `otel/trace/` (WBS 3.1)

`OtlpTracesReader`(@Component, 상태 없음) + 산출 모델 5개. `otel/metric`의 짝이고 같은 규칙을
따른다(깨진 것만 버린다 · 해석하지 않는다 · 절대 던지지 않는다).

| 클래스 | 역할 |
|---|---|
| `OtlpTracesReader` | `resourceSpans[] → scopeSpans[] → spans[]` 평탄화. `read(JsonNode, Instant receivedAt) → List<OtlpSpan>` |
| `OtlpSpan` | traceId·spanId·parentSpanId·name·kind·start·end·status·statusMessage·attributes·events·links + `durationNanos()`·`isRoot()`·`hasException()` |
| `OtlpSpanKind` | UNSPECIFIED/INTERNAL/SERVER/CLIENT/PRODUCER/CONSUMER — 숫자(1~5)·이름 표기 양쪽 수용 |
| `OtlpSpanStatus` | UNSET/OK/ERROR — 🔴 `"status": {}`가 UNSET이고 **절대다수가 그것**(R1: 32스팬 중 31) |
| `OtlpSpanEvent` | name·time·attributes + `isException()`(name == `"exception"`) |
| `OtlpSpanLink` | traceId·spanId·attributes (실측 0건 — 손으로 만든 페이로드로만 검증) |

🔴 **리더가 보장하는 불변식** (하류가 여기에 기댄다):
- `traceId` 32자·`spanId` 16자 **소문자 hex**. 아니면 그 스팬을 버린다. 대문자는 소문자로 접고,
  **모두 0인 식별자는 거부**한다(통과시키면 무관한 스팬 수천 개가 한 트레이스로 뭉친다).
- `parentSpanId`는 **없으면 null = 루트**(R1: 루트에는 필드 자체가 없다). 🔴 형식이 깨진 값도
  null로 접으므로 "null = 루트"가 100%는 아니다(고아가 루트로 보인다). 스팬을 버리는 쪽이
  잃는 것이 더 크다는 판단.
- `start`는 **never null**(없거나 `"0"`이면 수신 시각 폴백 — 1970 소실 방지), `end`도 never null
  (없으면 start와 같음 = duration 0). `durationNanos()`는 **음수가 되지 않는다**(0으로 접는다).
- **속성은 거르지 않는다** — `db.query.text`·`url.path` 원문이 그대로 나온다. 거르는 것은 적재 계층.
- 이벤트·링크는 스팬당 **128개 상한**(메모리 방어), 넘치면 앞에서부터 남기고 WARN.

### 7.2 스키마 — `V44__apm_trace.sql` (WBS 3.2)

테이블 9개. **이번에 실제로 쓰는 것은 `apm_span`·`apm_trace_summary` 둘**이고, 나머지는
**스키마만**(롤업은 2차 물결) — 비어 있는 것이 정상이다.

| 테이블 | 파티션 | 보존 | 이번 물결에서 |
|---|---|---|---|
| `apm_span` | 일(start_ts) | 7일 | ✅ 적재 |
| `apm_trace_summary` | 일(start_ts) | 7일 | ✅ 병합 |
| `apm_service_edge_5m` | 일(bucket_start) | 30일 | 스키마만 (3.5 → §7.8에서 채움) |
| `apm_error_group` + `apm_error_group_1h` | `_1h`만 파티션 | 90일 | 스키마만 (3.6 → §7.8에서 채움) |
| `apm_db_query_group` + `_5m` | `_5m`만 파티션 | 30일 | 스키마만 (3.7 → §7.8에서 채움) |
| `apm_dependency_5m` | 일 | 30일 | 스키마만 (3.8 → §7.8에서 채움) |
| `apm_deployment` | 없음 | 400일 | 스키마만 (3.11) |

🔴 **설계서 §7 표와 다른 점 (전부 의도적, 파일 상단 주석에 같은 내용)**
1. **`trace_id`/`span_id`가 bytea가 아니라 hex varchar**(32/16). `apm_metric_1m.exemplar_trace_id`가
   이미 varchar(32) hex라, exemplar 점프(WBS 3.12)의 조인이 인덱스를 타려면 타입이 같아야 한다.
2. **PK에 `start_ts`가 들어간다.** PostgreSQL은 파티션 키가 모든 UNIQUE/PK에 포함되기를 **요구**한다 —
   설계서의 `PK(trace_id, span_id)`는 일 파티션과 **동시에 성립할 수 없는 스키마**였다. 재전송
   멱등성은 그대로다(같은 스팬은 같은 startTimeUnixNano로 온다). ⚠️ 대가: SDK가 시각을 다시 찍는
   재전송은 중복 행이 된다(Collector 큐 재시도는 직렬화된 바이트를 그대로 보내므로 해당 없음).
3. `apm_trace_summary`에 **`end_ts`·`root_span_id` 추가**. end_ts는 병합 시 duration 재계산을
   읽을 수 있게 하고, root_span_id는 **"루트가 아직 안 왔다"(NULL)** 를 표현한다 — root_name만으로는
   "잠정값"과 "빈 이름"이 구분되지 않는다.
4. `service_ids`가 `int[]` → **`bigint[]`**(`apm_service.id`가 bigserial).
5. `apm_span`에 **`(trace_id)` 단독 인덱스를 만들지 않았다** — PK 선두 컬럼이 trace_id라 그 인덱스가
   그대로 처리한다. 중복 인덱스는 가장 쓰기가 잦은 테이블의 삽입 비용만 늘린다.

기타: `attrs`는 **GIN `jsonb_path_ops`**(포함 검색 `@>` 전용 — 키 존재 연산자는 인덱스를 못 탄다),
DEFAULT 파티션 없음(통째 DROP을 위해), 초기 파티션 오늘−1~+2, 시각 컬럼에 DEFAULT 없음.

**파티션·보존 편입**: `ApmPartitionService.PARTITIONED_TABLES`에 6개 추가(선생성 배치가 하루에
만드는 파티션이 3 → **9개**). 보존은 `ApmRetentionJob`의 **새 단계 `tracePartitions`**
(옵션 `spanDays`·`traceSummaryDays`·`edge5mDays`·`errorGroup1hDays`·`dbQuery5mDays`·`dependency5mDays`,
기본 7·7·30·90·30·30). 🔴 메트릭과 **별도 단계**인 이유는 실패 격리다(한 단계에 묶으면 앞 테이블
하나가 터질 때 뒤가 통째로 안 돈다). ⚠️ 이 키들은 **V38 시드에 없어** 항상 기본값으로 돈다.
⚠️ `apm_error_group`·`apm_db_query_group`(비파티션)의 "마지막 발생 90일 후 삭제"는 **미구현** —
데이터가 아직 없어 2차 물결로 미뤘다.

### 7.3 수신·적재 — `POST /apm/otlp/v1/traces` (WBS 3.3)

**계약은 메트릭과 동일**하다. 형식(415)·크기(413)·토큰(401)·범위(403)·라이선스(403)·파싱(400)·
중복(200)·적재 실패(**503**)·성공(200 `{}`) — 🔴 **500은 내지 않는다**. 갈리는 것은 컨트롤러의
`receive()` 안에서 **파이프라인을 고르는 한 줄**뿐이다.

- 🔴 **트레이스는 더 이상 `SIGNAL_NOT_SUPPORTED`가 아니다.** 그 자리는 `/v1/logs`만 남았다.
- 컨트롤러는 `TraceIngestPipeline`을 **구체 타입으로** 주입받는다 — 인터페이스로 받으면 `@Primary`인
  메트릭 파이프라인이 들어와 **스팬을 메트릭 리더에 먹인다**(조용히 0건 적재 + 200).
- 오설정 구제 경로 `/v1/traces/v1/traces`도 그대로 동작한다.

**패키지**: `premium/apm/trace/ingest/` (컨트롤러는 `collector/ingest`에 그대로).

| 클래스 | 역할 |
|---|---|
| `TraceIngestPipeline` | 파싱 → 수집기 분리 → 서비스 귀속 → 속성 허용목록·SQL 정책 → **트레이스별로 모아** writer에 넘김 |
| `ApmTraceWriter` | 🔴 **트레이스 단위 잠금**(`pg_advisory_xact_lock`) 안에서 중복 제거 → 스팬 적재 → 요약 병합. 쓰기 단위 = 트레이스 하나 = 트랜잭션 하나 |
| `ApmSpanStore` | `apm_span` 배치 INSERT **ON CONFLICT DO NOTHING** + 파티션 보장 + `findSpanIds(traceId)`(논리 키 중복 판정) |
| `ApmTraceSummaryStore` | 요약 병합(찾기 → INSERT 또는 UPDATE). 병합 규칙은 순수 함수 `mergeValues`. 🔴 **잠금 안에서만** 부른다 |
| `ApmSpanAttrAllowlist` | 속성 허용목록 + 값 길이 절단(거부가 허용을 이긴다) + SQL 정책 적용. 반환 `Filtered(attrs, rawSqlBlocked)` |
| `ApmSqlPolicy` · `ApmSqlMasker` | 🔴 `keep_raw_sql`×`mask_sql` → KEEP/MASK/DROP 판정과 리터럴 마스킹 |
| `ApmSampledReason` | `sampled_reason` 라벨(ERROR/**SLOW_INFERRED**/SAMPLED 또는 Collector가 준 정책 이름) |

🔴 **재전송 멱등성의 구조**(2026-09-02 2차에서 강화 — §7.7): 스팬은 **논리 키 `(trace_id, span_id)`**로
걸러진다. `ApmTraceWriter`가 트레이스 잠금 안에서 `findSpanIds(traceId)`로 "이미 저장된 것"을 읽어
빼고, PK의 `ON CONFLICT DO NOTHING`은 마지막 그물로만 남는다. `span_count`는 **실제로 들어간 수**다.
시작·종료·오류·서비스 목록은 **재전송분도 포함해** 다시 보낸다 — 멱등한 연산(min/max/OR/합집합)이고,
오히려 그래야 "스팬은 저장됐는데 요약 병합이 실패했던" 앞 배치가 복구된다.

🔴 **`start_ts`가 내려갈 수 있다.** 더 이른 스팬(대개 루트)이 나중에 도착하면 요약의 start_ts가
작아지고 행이 **다른 파티션으로 이동**한다(PG 11+ row movement, IT로 실증). 그래서 `ON CONFLICT`만
쓰지 않고 **trace_id로 먼저 찾은 뒤** 그 행의 현재 start_ts를 조건으로 UPDATE한다 — ON CONFLICT만
쓰면 키가 달라져 **같은 트레이스가 두 행**이 된다. 경합(0행 UPDATE)은 **최대 3회** 시도하고,
그래도 안 되면 **던진다**(→ 503 → Collector 재시도). 🔴 그리고 애초에 경합이 나지 않도록
`ApmTraceWriter`가 trace_id 단위 잠금을 쥐고 들어간다(§7.7).

**속성 허용목록**: 거부(어떤 경우에도 저장 안 함) = `url.full`·`url.query`·`user_agent.original`·
`client.address`·`client.port`·`network.peer.address`·`enduser.*`·`http.{request,response}.header.*`.
허용 = HTTP(method·status_code·route·`url.path`·body.size·scheme) · 주소(server.address/port·
network.protocol.version·network.peer.port) · DB(system·namespace·operation.name·query.summary·
`query.text`(🔴 **정책 대상** — 아래) ·collection.name·batch.size) · RPC · 메시징 · code.* · thread.* ·
exception.* · error.type.
절단은 **4096자**(db.query.text·query.summary·exception.message·exception.stacktrace, Collector의
`truncate_all(attributes, 4096)`과 **일부러 같은 값**) / 그 외 1024자, 잘리면 `…(truncated)` 표시.
스팬당 속성 **48개** 상한, 스팬당 이벤트·링크 **32개** 상한, 이벤트 이름 **255자** 절단
(🔴 jsonb 안이라 DB가 막아 주지 않는다 — 8MB 요청이 그대로 한 행이 되던 구멍, §7.7).
⚠️ `url.path`는 경계선(식별자·개인정보가 섞일 수 있음) — Collector
템플릿이 `url.full`·`url.query`만 지우고 이 키는 남기는 것과 같은 판단이다.

🔴 **`db.query.text`는 허용목록이 아니라 정책이 정한다**(`ApmSqlPolicy`, 2026-09-02 2차):

| | `mask_sql=true`(기본) | `mask_sql=false` |
|---|---|---|
| `keep_raw_sql=false`(기본) | **MASK** — 리터럴(`'…'`·숫자)을 `?`로 바꿔 저장 | **DROP** — 저장하지 않고 `RAW_SQL_BLOCKED` 카운트 |
| `keep_raw_sql=true` | **KEEP** — 원문 그대로(절단만). 관리자 opt-in·`keep_raw_sql_updated_by`에 책임 소재 | **KEEP** |

같은 정책이 **이벤트 속성**(같은 필터를 쓴다)과 **`exception.message`·`exception.stacktrace`**에도
걸린다 — SQL 키워드 쌍이 보이면 리터럴을 마스킹하고, 스택트레이스는 `at …` **프레임 줄을 건드리지
않는다**(줄 번호를 지우면 스택트레이스가 아무 말도 못 한다). 큰따옴표(식별자)와 이름 속 숫자는
그대로 둔다. ⚠️ 정본 마스킹은 여전히 에이전트·Collector이고 이것은 **마지막 방어선**이다.

**저장 형태**: `attrs`는 항상 non-null jsonb(`{}`), `events`는
`[{"name","time"(ISO 로컬 문자열),"attributes"}]`, `links`는 `[{"traceId","spanId","attributes"}]`,
둘 다 없으면 **NULL**(빈 배열이 아니다).

### 7.4 tail 샘플링 옵션 (WBS 3.4)

**이미 P1에서 구현돼 있었다** — 이번 물결에서는 **검증·구조 테스트·문서화**만 했다.
`collector-template.yaml`의 `tail_sampling`(decision_wait 10s · num_traces 50000 · 정책 3:
`errors`(status_code=ERROR, **조건 없이 100%**) · `slow`(latency threshold_ms=`${SLOW_MS}`) ·
`normal`(probabilistic `${NORMAL_PCT}`%))에 생성기 옵션 `slowMs`(1~600000, 기본 2000)·
`normalPct`(0~100, 기본 2)가 대응하고, `GET /apm/collectors/config-defaults`가 그 기본값을 내려 준다
(계약 `features/apm/core/contract_apm-read-api.md` §8.6). 신설 테스트 1건이 **파싱된 yaml에서 정책 3개의 구조**를
확인한다(문자열 포함 검사로는 들여쓰기가 깨진 yaml을 못 잡고, 그 실패는 고객 서버에서만 드러난다).

🔴 **`sampled_reason`은 Collector가 알려 준 값이 아니다.** tail 샘플링 프로세서는 어느 정책이
통과시켰는지 **스팬에 적어 주지 않는다**(정책 이름은 수집기 자기 메트릭
`otelcol_processor_tail_sampling_*`의 라벨로만 나온다). 그래서 판정 순서가 이렇다:
① 속성(`sampling.policy`·`sampling.reason`·`tailsampling.policy`)이 있으면 **원문 그대로**
(우리 어휘로 뭉개지 않는다 — 고객이 심은 정책 이름이 있을 수 있다, 32자 절단)
→ ② 오류 스팬이 있으면 `ERROR`(**확실한 판정**) → ③ 지속시간 ≥ 2000ms면 **`SLOW_INFERRED`**(추정)
→ ④ 그 외 `SAMPLED`.
🔴 **저장되는 값이 `SLOW`가 아니라 `SLOW_INFERRED`다**(2026-09-02 2차, 검수 🟡5). 코드 주석에만
"추정"이라고 적어 두면 화면·후속 API·문의는 그 사실을 알 수 없다 — 값 자체가 근거를 말하게 했다.
`SLOW`는 **Collector·에이전트가 속성으로 알려 준 경우**에만 저장된다(우리는 만들지 않는다).
⚠️ ③의 임계는 **그 수집기의 실제 `slowMs`가 아니다**(설정 생성 시점의 선택이고 DB에 남지 않는다).
고객이 5초로 올렸다면 확률로 뽑힌 트레이스가 `SLOW_INFERRED`로 보인다 — 화면에서 **필터 축**으로는
쓰되 "느린 요청 전량"이라고 말하면 안 된다.

🔴 **FE 규약**: 필터·배지가 아는 값은 `ERROR`·`SLOW`·`SLOW_INFERRED`·`SAMPLED` **네 개**이고,
그 밖의 값은 고객 정책 이름이라 **원문 그대로** 보여 준다. `SLOW_INFERRED`는 "느림(추정)"처럼
추정임이 드러나는 라벨이어야 한다(`features/apm/core/contract_apm-read-api.md` §8.7과 같은 규약).

### 7.5 검증

- `gradlew :test` **2339 green, skip 0**(직전 2262 → **+77**). 도커 PG(5433 `moveseye_it`) 붙은 상태.
- 신규 테스트 6개: `OtlpTracesReaderTest`(실측 픽스처 + 형식 방어) · `ApmSpanAttrAllowlistTest` ·
  `ApmSampledReasonTest` · `ApmTraceSummaryMergeTest`(순수 병합 규칙) ·
  `TraceIngestPipelineTest`(순서 뒤섞임·부분 트레이스·재전송) · `ApmTraceSchemaIT`(진짜 PG 16건).
- 기존 테스트 수정 3개: `ApmOtlpControllerTest`(트레이스가 트레이스 파이프라인으로 가는지 + 503) ·
  `ApmBatchJobTest`(보존 단계 추가) · `ApmSchemaIT`(`ensureAhead` 기대값을 **목록 크기에서 유도**하도록
  — 테이블이 늘 때마다 숫자를 고치지 않게).
- 🔴 IT가 실제로 잡은 것: 파티션 PK 제약(설계서 PK는 만들 수 없는 스키마였다) ·
  파티션 간 row movement가 실제로 되는지 · `queryForMap`이 timestamp를 `java.sql.Timestamp`로
  준다는 것(LocalDateTime과 직접 비교하면 값이 같아도 실패).

### 7.6 🔴 불안한 지점 (검수용)

1. **실 Collector 왕복 미검증.** 이 코드로 `/v1/traces`를 받아 본 적이 없다. 픽스처는 R1에서
   캡처한 진짜 페이로드지만, **수신 경로 전체**(gzip·토큰·중복 판정 → 적재)는 테스트에서만 돌았다.
2. ~~**`sampled_reason`의 SLOW는 추정이다**~~ → ✅ **해소(§7.7-3)**: 저장값을 `SLOW_INFERRED`로
   갈랐다. 다만 **임계가 어긋날 수 있다는 사실 자체는 그대로**다(수집기별 `slowMs`는 여전히 DB에
   없다) — 이름이 그 한계를 드러낼 뿐이다.
3. ~~**폐기 카운터가 메트릭과 한 축을 쓴다.**~~ → ✅ **해소(§7.7-5)**: `signal`(METRIC/TRACE/LOG)
   축을 UNIQUE 키에 더했다(V44에서 V38 테이블 ALTER — V44는 아직 어느 DB에도 안 갔다).
4. **`collector ↔ trace` 패키지 의존**(검수 🟡9 — 코드는 그대로 두고 **결정만 기록**).
   컨트롤러 → `TraceIngestPipeline`, 그 반대로 `trace.ingest` → `collector.ingest`의
   `ApmIngestPipeline`·`resolve`·`drop`. 런타임 빈 순환은 없다(단방향 주입).
   🔴 **승격 시점·조건을 여기서 못 박는다**:
   - **시점 = P4(로그 수신) 착수 직전.** 그때 `LogIngestPipeline`이 같은 셋의 **세 번째 소비자**가
     되고, 세 소비자가 두 패키지에 흩어지는 순간 "어디에 있어야 하나"가 사람마다 갈린다.
   - **대상 = 네 가지**: `ApmIngestPipeline`(계약) · `ApmServiceResolver`/`ApmRegistrarServiceResolver`
     (귀속) · `ApmDropReason`·`ApmIngestSignal`·`ApmIngestDropStatRecorder`(폐기) ·
     `ApmIngestUnavailableException`. 옮길 곳은 **`premium/apm/core/ingest/`**.
   - **지금 안 하는 이유**: 이동은 패키지명만 바꾸는 순수 rename이라 **나중에 해도 비용이 같다**
     (`be-package-structure` 교훈 — 패키지명을 안 바꾸면 이동이 공짜다). 반대로 지금 하면 P2 2차
     물결(조회 API)이 전부 그 이동 위에서 리베이스돼야 한다.
   - **앞당길 조건**: P4 전에라도 `collector.ingest`가 `trace.ingest`를 **타입으로 참조**하기
     시작하면(지금은 컨트롤러가 구체 타입 주입 한 줄뿐) 그때 즉시 승격한다.
5. **`OtlpResource`·`OtlpScope`가 `otel.metric`에 산다.** 신호 중립 값인데 패키지 이름이 어긋났다.
   두 벌로 만들면 서비스 귀속이 갈리므로 재사용을 택했고, 이동은 세 번째 신호 때로 미뤘다.
6. **`SUCCESS_NO_INFO` 경로는 실행된 적이 없다.** JDBC URL에 `reWriteBatchedInserts=true`가
   켜지면 배치 결과가 -2로 오고, 그때는 "들어간 것으로 친다"(재전송이 겹치면 span_count가 부푼다).
   지금 URL에는 그 옵션이 없다.
7. **링크(`links`)는 실데이터로 검증되지 않았다**(R1 0건). 메시징 집계(WBS 4.2) 때 실제 Kafka
   트레이스로 다시 봐야 한다.
8. ~~**요약 병합의 경합 처리는 단발 재시도다.**~~ → ✅ **해소(§7.7-1·§7.7-4)**: trace 단위
   advisory 잠금으로 경합 자체를 없앴고, 그래도 0행이면 3회까지 시도한 뒤 **던진다**(503 →
   Collector 재시도). "다음 배치가 메운다"는 가정은 **그 배치가 마지막이면 성립하지 않는다**.
9. **`apm_span.name` 255자·`sampled_reason` 32자 절단은 코드가 지킨다.** DB에 CHECK가 없어서,
   저장소를 우회해 INSERT하는 코드가 생기면 그 배치가 503으로 무한 재시도된다.
10. **트레이스 지속시간의 정밀도가 스팬과 다르다.** 스팬 `duration_ns`는 OTLP 나노초 원값이지만
    요약은 timestamp(마이크로초) 차이라 **항상 1000의 배수**다. 화면에서 두 값을 나란히 보이면
    끝자리가 안 맞는다.

### 7.7 코덱스 검수 반영 — 2차 (2026-09-02, `review_apm-p2-w1_codex.md` 지적 11건)

검수 요약: "동시 첫 수신이 요약을 두 행으로 만든다"와 "원문 SQL·이벤트 이름이 제한 없이 저장된다"가
🔴 4건. 아래 8건을 반영했고 코드 위치는 §7.3 표에 반영돼 있다.

**1. 🔴 동시 최초 INSERT → 요약 두 행** (지적 1)
`ApmTraceWriter`를 신설해 **트레이스 하나 = 트랜잭션 하나 = 잠금 하나**로 만들었다.
`select pg_advisory_xact_lock(hashtextextended(trace_id, 0))`를 잡고 그 안에서 중복 판정 → 스팬
적재 → 요약 병합을 한 벌로 한다.
- **왜 advisory인가**: 잠글 *행이 아직 없는* 것이 문제라 행 잠금으로는 막을 수 없다. 비파티션
  trace registry 테이블 안도 있었지만, 그건 **일 2천만 행짜리 테이블을 하나 더** 만들어 보존·인덱스·
  팽창을 함께 떠안는 선택이다. 잠금은 테이블이 없다.
- **왜 `_xact_`인가**: 세션 잠금은 해제를 놓치면 **풀에 반납된 커넥션이 잠금을 든 채** 재사용된다.
  트랜잭션 잠금은 커밋·롤백에서 DB가 푼다.
- **처리량 근거**: 잠금 키가 trace마다 다르다(64비트 해시). 서로 다른 트레이스는 서로를 기다리지
  않고, 잡는 시간은 인덱스 탐색 두 번 + 배치 INSERT 한 번(ms 단위)이다. 분당 수천 trace(≈50/초)면
  키 하나가 초당 한 번도 안 잡히는 셈이고, 해시 충돌로 남남인 두 trace가 같은 키를 잡아도
  **결과는 틀리지 않고** 잠깐 기다릴 뿐이다. 실제 상한은 잠금이 아니라 커넥션 풀이다.
- **교착 불가**: 한 트랜잭션이 잠금을 **하나만** 잡는다(여러 개를 잡기 시작하면 순서를 정해야 한다).
- **DDL은 트랜잭션 밖**: 파티션 생성은 부모 테이블에 ACCESS EXCLUSIVE 잠금을 커밋까지 물리므로
  writer가 트랜잭션에 들어가기 전에 끝낸다.
- ⚠️ **대가**: 트랜잭션이 트레이스 단위라 **배치 중간 실패 시 앞부분은 커밋된 채** 남는다. 503 후
  같은 배치가 통째로 돌아오면 아래 2번이 중복을 걸러 낸다 — 재시도가 안전하다는 것이 전제다.
- IT: `concurrentFirstWritesCollapseToOneSummary`(스레드 8개가 **서로 다른 start_ts**로 동시 첫
  수신 → 요약 1행·span_count 8·start/end가 전체 구간).

**2. 🔴 논리 키 `(trace_id, span_id)` 중복 제거** (지적 2) — 1번과 **같은 잠금 안에서** 푼다.
`ApmSpanStore.findSpanIds(traceId)`로 이미 저장된 span_id 집합을 읽어 빼고, 같은 배치 안의 중복도
함께 거른다. PK의 `ON CONFLICT`는 마지막 그물로 남긴다.
🔴 **트레이드오프(완전 dedup vs 근사) — 선택: "보존 창 안에서 완전"**
- 채택: 잠금 안 논리 키 비교. **비용 = 트레이스당 인덱스 탐색 1회 추가**(파티션 수만큼, 보존 7일이면
  10개 안팎). 이미 요약 조회가 같은 비용을 내고 있어 배치당 왕복이 약 2배가 아니라 1.5배 수준이다.
- 버린 안: 전역 `(trace_id, span_id)` 레지스트리 테이블(완전하지만 **일 2천만 행**·보존·팽창을
  새로 떠안는다) / 해시 기반 근사 필터(메모리 O(1)이지만 **오탐 = 진짜 스팬 유실**이라 이 도메인에서
  받아들일 수 없다).
- 🔴 **남는 구멍**: 보존 경계를 넘겨 파티션이 DROP된 스팬이 재전송되면 다시 저장된다(그때는 요약도
  없어 "새 트레이스"가 된다). 7일 지난 스팬을 보내는 exporter는 없다고 보고 감수한다.
- IT: `resendWithShiftedTimestampIsDeduped`(시각만 다른 재전송 → 0행·span_count 1) ·
  `duplicateWithinOneBatchIsDeduped`.

**3. 🔴 `db.query.text` 기본 차단 + 설정 결선** (지적 3) — §7.3의 정책 표.
설정 화면의 `keep_raw_sql`·`mask_sql`이 **처음으로 적재를 바꾼다**(그전까지 두 스위치는 화면에만
있었다). 버린 SQL은 `ApmDropReason.RAW_SQL_BLOCKED`(signal=TRACE, metric_name=`db.query.text`)로
세어 화면이 "왜 SQL 칸이 비었나"에 답한다. 이벤트 속성·예외 메시지·스택트레이스도 같은 정책.

**4. 🔴 이벤트 이름·개수 상한** (지적 4)
`events[].name`을 `apm_span.name`과 같은 **255자**로 절단하고, 스팬당 이벤트·링크를 **32개**로 막았다.
🔴 이름을 **허용목록으로 막지는 않는다** — `exception` 말고도 SDK·프레임워크가 제 이름을 붙이는 것이
정상이라(재시도·캐시 미스), 모르는 이름을 버리면 워터폴에 "뭔가 일어났는데 이름이 없는" 점이 남는다.
**자를 뿐 버리지 않는다.**

**5. 🟡 폐기 통계에 `signal` 축** (지적 6)
`apm_ingest_drop_stat`에 `signal varchar(16) NOT NULL DEFAULT 'METRIC'`을 더하고 UNIQUE를
`(token_id, reason, metric_name, signal)`로 넓혔다. **V44 안에서 ALTER**한다 — V44는 아직 어느 DB에도
적용된 적이 없어 수정이 허용되고, 새 V45를 만들면 "P2 스키마"가 두 파일로 갈린다.
기존 메트릭 경로는 **호출부를 하나도 안 고쳤다**(3·4인자 오버로드가 METRIC으로 위임) — 회귀 0.
조회 응답 `GET /apm/ingest/drops`의 `rows[]`에 **`signal` 필드가 추가**된다(기존 필드 불변).

> #### 🔴 정정 — "FE 무영향"이 아니었다 (2026-09-07 P3 QA D5)
>
> **표의 자연키(=rowKey)는 `(reason, signal, metricName)` 셋**이다. 응답에 id가 없으므로
> 화면이 그 셋으로 rowKey를 만들어야 하는데, FE는 `(reason, metricName)` **둘로만** 만들고 있었다
> (`apmCollectorDisplay.ts`의 `apmDropRowKey`, 그리고 `types/apm.ts`의 `TApmDropRow`에는
> `signal` 필드가 **아예 없다** — BE가 준 축을 타입에서 버렸다).
>
> 실제 데이터에 `SIGNAL_NOT_SUPPORTED`가 `LOG` 87,484건 / `METRIC` 18,396건 **두 줄**로 있어서:
>
> - 수집기 화면에 React 중복 키 에러(`Encountered two children with the same key, SIGNAL_NOT_SUPPORTED:`),
> - 표에 **글자까지 같은 두 줄**이 나란히 떠 사용자가 무엇이 다른지 알 수 없고,
> - Ant Table의 선택·확장·가상 스크롤이 rowKey에 의존하므로 그 상태에서는 동작이 정의되지 않는다.
>
> 🔴 **FE 할 일 둘** — ① rowKey를 `` `${reason}:${signal}:${metricName ?? ''}` `` 로 넓히고
> ② **시그널 컬럼도 함께 보여 줄 것**. 키만 고치면 콘솔 에러는 사라지지만 "같아 보이는 두 줄"은
> 그대로 남는다. **서버는 세 축을 이미 다 실어 보내고 있다**(BE 수정 없음).

**6. 🟡 요약 UPDATE 최종 실패 → 503** (지적 7)
3회 시도(그 사이 행이 사라졌으면 재INSERT) 후에도 0행이면 던진다. "다음 배치가 메운다"는
**그 배치가 마지막이면 성립하지 않는** 가정이었다 — 그때 남는 것은 "스팬은 있는데 요약이 틀린,
아무도 모르는" 상태다. 수신 계약(500 금지·503만)과 일관된다.

**7. 🟡 `SLOW_INFERRED`** (지적 5) — §7.4. FE 규약도 함께 갱신
(`features/apm/core/contract_apm-read-api.md` §8.7).

**8. 🟡 `apm_deployment` 400일 보존** (지적 8)
`ApmRetentionJob`에 `deployments` 단계 추가(옵션 `deploymentDays`, 기본 400, DELETE).
🔴 **쓰는 코드가 아직 없는데 먼저 넣는다** — P3.11이 쓰기 시작한 뒤에 넣으면 그 사이 쌓인 것이
비파티션 테이블에 무기한 남는다. 지금은 항상 0행이라 무해하다.

**반영하지 않은 것**: 지적 9(`collector ↔ trace` 계층) — 코드는 그대로 두고 **승격 조건·시점만**
§7.6-4에 못 박았다. 지적 10·11은 🟢(유지).

---

### 7.8 P2 트레이스 **2차 물결** — 집계 롤업 · 조회 API (WBS 3.5~3.10 · 3.12~3.14, 2026-09-02)

브랜치 `master`(**미커밋**). 1차 물결(§7.1~7.7)이 "스팬을 받아 저장"까지였다면, 이 물결은
**저장된 스팬을 네 개의 표로 접고 화면이 읽을 수 있게 하는 것**이다. **3.11(배포 감지·전후 비교)은 범위 밖** —
`apm_deployment`는 여전히 스키마만이고 쓰는 코드가 없다.

FE가 소비할 **API 계약 정본은 `features/apm/core/contract_apm-read-api.md` §10**이다. 여기는 BE 내부(스키마·배치·판정 규칙)를 적는다.

#### 7.8.1 스키마 추가 — `V45__apm_trace_rollup.sql`

V44는 손대지 않았다(이미 커밋된 이력). 전부 **추가**이고 멱등이다.

| 항목 | 무엇 | 왜 |
|---|---|---|
| `apm_span_start_brin` | `apm_span(start_ts)` **BRIN** | 롤업의 `where start_ts >= ? and < ?`에 서비스 축이 없다. V44의 인덱스는 `(service_id, start_ts)`뿐이라 파티션을 통째로 seq scan한다. 🔴 B-tree가 아닌 이유: 이 스키마에서 **쓰기가 가장 잦은 테이블**이라 인덱스 유지비가 그대로 수신 비용이다. BRIN은 수십 KB·삽입 비용 사실상 0이고, 상관관계가 흐려져도 **최악이 지금과 같다**(파티션 스캔) |
| `apm_trace_summary_start_brin` | 같은 이유 | 목록·산점도가 **서비스 필터 없이** 창을 훑을 때 V44 인덱스는 둘 다 `root_service_id` 선두라 못 탄다 |
| `apm_error_message_norm(text)` | 예외 메시지 정규화 | 같은 버그가 만든 메시지 100개를 한 문자열로 접는다. 🔴 **지우는 순서가 규칙의 일부**: UUID → `0x` hex → 16자+ hex → 따옴표 값 → 숫자 → 공백 압축. 숫자를 먼저 지우면 `a1b2-c3d4`가 부서져 토큰이 조각난다. 🔴 대소문자는 접지 않는다(사람이 읽는 값이라 클래스명이 뭉개진다) |
| `apm_sql_norm(text)` | SQL 정규화 | 🔴 결과가 `query_norm`에 **그대로 저장**된다(지문이자 표시값)이라 사람이 읽을 수 있어야 한다. 순서: 블록 주석 → 줄 주석 → **달러 인용** → 문자열 리터럴 → 숫자 → **`IN (?,?,?)` → `IN (?)`** → 공백 압축 → 4000자 절단. 🔴 주석을 먼저 지우는 이유는 주석 안의 홑따옴표(`-- don't`)가 리터럴 치환의 짝을 깨뜨려서다. 🔴 **달러 인용은 2026-09-02 추가**(2차 검수 지적 7) — 그 안에는 홑따옴표가 없어도 되므로 리터럴 규칙이 통째로 비껴갔고, `keep_raw_sql` 설치본에서 달러로 감싼 값이 `query_norm`에 원문으로 남았다. 태그 있는 형태를 먼저 지운다. ⚠️ **함수 본문 자체가 달러 인용**이라 주석·정규식에 달러 두 개를 나란히 쓰면 본문이 거기서 끝난다 |
| `apm_jsonb_count_merge(a,b,max_keys=50)` + `_step` + **집계** `apm_jsonb_count_merge_agg(jsonb)` | jsonb 카운트 맵 덧셈 | `apm_error_group_1h.endpoint_counts`는 1시간 버킷을 **5분마다 12번 나눠** 채우므로 UPSERT마다 두 맵을 더해야 한다. 조회는 여러 버킷을 한 번에 더해야 해서 집계 버전이 따로 있다(SFUNC은 정확히 2인자여야 해 래퍼 `_step`이 낀다). 🔴 `max_keys`가 없으면 route 카디널리티가 열려 있어 한 행의 jsonb가 수만 키로 자란다 |
| `scheduler_setting` 시드 | `apm_trace_rollup`(interval 5분, options `{}`) | 아래 7.8.3 |

#### 7.8.2 롤업 — `premium/apm/trace/rollup/` (WBS 3.5~3.8)

`ApmTraceRollupService`(엔트리 `rollup(maxBuckets)`) + `ApmSpanHistogramSql` + `ApmTraceRollupJob`.

| 단계 | 스팬에서 고르는 것 | 출력 | 버킷 | 대상 판정 |
|---|---|---|---|---|
| `rollupEdges` | `kind in (CLIENT, PRODUCER)` | `apm_service_edge_5m` | 5분 | 자식이 다른 서비스 → `SERVICE`(to_ref = **상대 service_id 문자열**) → `messaging.system` → `QUEUE` → `db.system`/`db.system.name` → `DB` → 나머지 `HTTP` |
| `rollupErrors` | `events`의 `name = 'exception'` | `apm_error_group` + `_1h` | 1시간 | 지문 = `sha256(type + '|' + apm_error_message_norm(message))` |
| `rollupDbQueries` | `db.system`/`db.system.name` 있는 스팬 | `apm_db_query_group` + `_5m` | 5분 | 지문 = `sha256(db_system + '|' + apm_sql_norm(text ?? summary ?? span.name))` |
| `rollupDependencies` | `kind = CLIENT`이고 DB도 큐도 아닌 것 | `apm_dependency_5m` | 5분 | `target = server.address ?? peer.service`. 타임아웃 = `error.type` 또는 예외 타입/메시지에 `time.?out` |

**🔴 워터마크가 하나다** — `apm_setting.trace_rollup_watermark_5m`. 넷을 따로 두면 "맵에는 있는데 에러 목록에는 없는 5분"이 생긴다.

**🔴 네 단계가 전부 대입이다 — 재실행이 값을 부풀리지 않는다 (2026-09-02 개정, 2차 검수 지적 1).** 처음에는 예외 그룹만 **덧셈**이었고(`count_total`·`apm_error_group_1h.count`) 트랜잭션으로 "썼으면 워터마크도 전진한다"를 보장해 막으려 했다. **그 방어는 부족했다** — 트랜잭션은 *부분* 실패만 막는다. 커밋이 성공한 뒤 응답·연결이 끊겨 잡이 같은 창을 다시 도는 at-least-once 재실행에서는 같은 값이 한 번 더 더해진다.
- 지금은 `rollupErrors`가 **소스 창을 시간 경계로 내려**(`date_trunc('hour', from)`) 그 시간대의 스팬을 처음부터 다시 세고 **대입**한다. 창이 09:35~09:40이면 스팬은 **09:00~09:40**을 읽고 09시 버킷에 그 합을 넣는다. `endpoint_counts`도 병합이 아니라 대입이다.
- `count_total`은 UPSERT에서 **손대지 않고** `syncErrorCountTotals`가 **이번 창에 손댄 그룹만** `_1h` 합으로 다시 계산한다(순수 함수 = 멱등).
- ⚠️ **`count_total`의 뜻이 바뀌었다**: "평생 누적"이 아니라 **"보존 중인 버킷(90일)의 합"**이고 파티션이 떨어지면 줄어든다. 대신 목록의 창 안 발생 수와 같은 원천이라 둘이 어긋나지 않는다(계약 §10.2 · 7.8.7-5 해소).
- ⚠️ 대가: 같은 시간대를 최대 12번 다시 읽는다. 대상이 **예외 이벤트가 있는 스팬**뿐이라 감수했다.
- 트랜잭션은 **그대로 둔다** — 재실행 안전과 별개로 네 표가 같은 창까지 채워져 있어야 화면이 서로 어긋나지 않는다.

**🔴 지연 도착 — lookback 2버킷 (지적 5).** 워터마크가 지나간 버킷은 다시 보지 않으므로 LAG(3분)보다 늦게 도착한 스팬은 어느 집계에도 반영되지 않았다. 전부 대입이 된 지금은 다시 세는 것이 안전하므로, **워터마크는 그대로 전진시키면서 소스 창만 뒤로 2버킷(10분) 넓힌다** → 허용 지연 3분 → **13분**. 예외 단계는 시간 경계로 내리는 성질 덕에 같은 시간대면 자동으로 합류한다.
- ⚠️ 그 이상 늦은 스팬은 여전히 누락된다(dirty-bucket 목록을 따로 들어야 하는데 이 규모에서는 비용이 이득을 넘는다).
- ⚠️ 소스 창은 **버킷 경계에 정렬**돼 있어야 한다 — 반쯤 걸친 창으로 대입하면 그 버킷의 앞부분이 지워진다.
- 🔴 "접을 것이 있었나"(워터마크 붙잡기) 판단이 **쓴 행 수 → 원본 스팬 존재 확인**으로 바뀌었다. 예외 단계가 시간 버킷을 매번 다시 대입하므로 새 창이 비어도 rows > 0이 나올 수 있고, 그 값으로 판단하면 `holdWatermark`가 영영 발동하지 않는다.
- ⚠️ 대가: 트랜잭션 하나가 최대 `maxBuckets`(기본 288 = 하루치)개 버킷의 집계를 잡는다.
- 🔴 DDL(파티션 생성)은 **트랜잭션 밖**에서 끝낸다 — 안에서 하면 부모 테이블 ACCESS EXCLUSIVE가 커밋까지 유지돼 그 사이 **수신이 멈춘다**(`ApmTraceWriter`와 같은 규칙).

**🔴 LAG = 3분**(메트릭은 2분). `SERVICE` 엣지는 부모(CLIENT)와 자식(SERVER) 스팬이 **둘 다 저장돼 있어야** 성립한다. 자식이 아직 안 왔으면 같은 호출이 `HTTP` 엣지로 굳고, **대입 UPSERT라 나중에 고쳐지지 않는다**. 자식 조회 창은 끝에서 5분 더 본다(`CHILD_LOOKAHEAD_MINUTES`) — 집계 대상은 부모 기준이라 늘어나지 않는다.

**🔴 지워진 서비스의 스팬을 건너뛴다.** `apm_span`에는 `apm_service` FK가 없지만 `apm_error_group`·`apm_db_query_group`에는 **있다**. 서비스를 지운 뒤에도 스팬은 최대 7일 남으므로, 그것을 집계하려 하면 FK 위반으로 **트랜잭션 전체가 롤백**되고 워터마크가 전진하지 못한다 = **집계 영구 정지**. 두 단계의 소스 CTE에 `exists (select 1 from apm_service …)` 가드가 있다. 엣지·의존은 파티션 테이블이라 FK가 없어 해당 없음.

**히스토그램** — `ApmSpanHistogramSql`. `CanonicalBounds.durationSeconds()`(14단, family `duration_s`) **하나**만 쓴다. 🔴 DB 스팬에도 `db_operation_s`가 아니라 이것을 쓰는 이유는 **한 화면에서 비교되기 때문**이다(맵의 DB 엣지 p95와 외부 호출 p95가 나란히 선다 — 격자가 다르면 차이가 격자 탓인지 사실인지 알 수 없다). 메트릭과 같은 격자라 `ApmHistBoundsCatalog`·`ApmPercentiles`가 벡터를 **그대로** 읽는다(조회 계층에 새 코드가 없는 것이 이 선택의 실질적 이득).
- SQL은 `width_bucket(duration_ns/1e9, 경계) + 1`로 버킷 번호를 만들고, **spine 조인**(`generate_series(1, n+1)` × 키)으로 **길이가 고정된** 벡터를 편다. 🔴 spine이 없으면 관측 0인 칸이 배열에서 빠져 "i번째가 어느 구간인지"를 아무도 모르게 된다.
- ⚠️ OTel 버킷은 `(b[i-1], b[i]]`(위 경계 포함)이고 `width_bucket`은 `[b[i-1], b[i])`다. 경계값과 **정확히 같은** 지속시간만 한 칸 어긋나는데, 나노초 해상도에서 5ms에 정확히 떨어지는 값은 사실상 없다.
- `bounds_id` 확보 실패는 던지지 않는다(`null`) — 백분위만 못 내고 count·error는 맞다.

**카디널리티 위험** — DB 쿼리 그룹이 유일하게 그룹 테이블을 터뜨릴 수 있는 곳이다. `keep_raw_sql`이 켜져 있고 정규화가 못 잡는 형태(배열 리터럴·동적 컬럼 목록)가 오면 그룹이 실행 건수만큼 생긴다. `IN (?)` 접기가 가장 흔한 원인을 막지만 전부는 아니다 — **그룹 수가 갑자기 늘면 여기를 먼저 본다**.

#### 7.8.3 배치 — `apm_trace_rollup` (V45 시드, 5분)

🔴 `apm_rollup`(메트릭)과 **별도 잡**이다: ① `scheduler_lease`가 `job_key`별이라 한 잡에 묶으면 한쪽의 지연이 다른 쪽의 skip이 된다 ② 메트릭 1h가 실패해 던지면 트레이스는 시작조차 못 한다 ③ 원본 테이블도 워터마크도 다르다.

🔴 `requiresActiveLicense() = false` — 근거는 `ApmRollupJob`과 같다: 보존 배치는 만료 중에도 돌아 7일 지난 `apm_span` 파티션을 DROP하므로, 집계만 멈추면 그 구간의 맵·에러·DB 통계가 **영구 공백**이 된다(다시 접을 원본이 없다).

🔴 이 잡에는 **부분 성공 상태가 없다**(`ApmRollupJob`과 다른 점 — 거기는 5m/1h가 각자 커밋된다). 던지면 넷 다 되돌아가고 다음 회차가 같은 창을 처음부터 접는다.

요약 문자열: `edges=N errors=N dbQueries=N dependencies=N`. ⚠️ 전부 0은 "그 창에 그런 스팬이 없었다"이지 실패가 아니다.

#### 7.8.4 조회 — 신규 패키지 5개 · EP 17개

| 패키지 | 클래스 | 담당 |
|---|---|---|
| `premium/apm/servicemap/` | `ApmServiceMapController`·`ApmServiceMapQueryService`·`ApmServiceMapDto`·`ApmEdgeSeriesDto` | 3.5 조회 |
| `premium/apm/trace/query/` | `ApmTraceController`·`ApmTraceQueryService`·`ApmSpanTree`·DTO 6 + **공용** `ApmServiceRefLookup`·`ApmSpanLatency`·`ApmAggSeriesDto` | 3.9·3.10·3.13 |
| `premium/apm/trace/errors/` | `ApmErrorController`·`ApmErrorQueryService`·DTO 2 | 3.6 조회 |
| `premium/apm/trace/dbquery/` | `ApmDbQueryController`·`ApmDbQueryService`·DTO 2 | 3.7 조회 |
| `premium/apm/trace/dependency/` | `ApmDependencyController`·`ApmDependencyQueryService`·DTO 1 | 3.8 조회 |
| `premium/apm/trace/exemplar/` | `ApmExemplarController`·`ApmExemplarQueryService`·DTO 1 | 3.12 |

- 🔴 **`ApmServiceRefLookup`이 내부 id ↔ `service_uid`의 유일한 통로**다. 집계는 전부 `service_id`로 저장되고(조인·인덱스가 그것으로 돈다) API는 `service_uid`만 노출한다. 요청마다 통째로 읽고 **캐시하지 않는다** — 서비스 수는 수십~수백이고, 캐시를 두면 "방금 등록된 서비스가 맵에서 이름 없이 나온다"를 위해 등록 경로에 갈고리를 걸어야 한다.
- 🔴 **`ApmSpanTree`는 불완전한 트레이스를 전제로 짜였다**: 고아는 버리지 않고 **루트로 승격**(버리면 하필 그게 느린 DB 호출일 때 원인이 사라진다), 부모 사슬 **순환은 끊고** `cycleBroken`으로 알린다(그대로 재귀하면 500), **재귀를 쓰지 않는다**(깊이는 데이터가 정한다 — 5,000 깊이 테스트 포함).
- 자기 시간 = `자기 구간 − (자식 구간들의 합집합 ∩ 자기 구간)`. 🔴 단순 합산으로 빼면 **병렬 호출에서 음수**가 되고, 자식이 부모 밖으로 삐져나가도 겹치는 부분만 뺀다.
- 크리티컬 패스 = **자기 시간 합이 최대인 루트→리프 경로**(리프→루트 DP, 전위 순회를 뒤에서 훑으면 자식이 먼저 계산돼 있다). 흔한 대안("부모의 끝을 덮는 자식")과 대부분 같은 경로를 주지만, **형제가 병렬일 때 갈리고 그때 우리 쪽이 쓸모 있다**(150ms 일한 형제 대신 마지막에 끝난 10ms를 따라가지 않는다).
- 산점도 다운샘플: 시간축은 창을 `cells`로 나눈 고정 폭(**올림** — 내림이면 창 끝 몇 ms가 어느 칸에도 안 들어간다), y축은 **로그**(`floor(log10(duration_ns) × 4)`), 칸마다 `row_number() over (order by duration_ns desc, trace_id)`로 `perCell`개. 🔴 느린 것부터 남기므로 **위쪽 윤곽은 보존, 아래쪽 밀도는 성기다**.
  - 🔴 **표본 상한이 시간 칸별로 바뀌었다**(2026-09-02, 지적 3). 예전의 창 전체 `limit 200000`은 **정렬이 없어 비결정적**이었고 시간 대표성이 깨졌다. 지금은 `generate_series(0, cells-1)` × `cross join lateral`로 칸마다 `limit perCellScan`(= 200,000/cells, 최소 200)을 건다. ⚠️ 조기 종료가 사라진 대신 칸이 좁은 시간 범위라 `apm_trace_summary_start_brin`이 잘 듣는다.
- 목록 총계는 `select count(*) from (select 1 … limit 100000) t`로 **상한**을 건다. 🔴 바깥에 `limit`을 붙이면 스캔이 안 멈춘다.
- 🔴 **`exemplar`는 적재 쪽 작업이 없었다.** WBS의 조건부 항목("R1에서 실렸는지 확인 후 결선")을 확인해 보니 P1에서 이미 끝나 있었다 — `MetricIngestor.exemplarTraceIdOf` → `ApmMetric1mStore.exemplar_trace_id` → `ApmRollupService`가 5m·1h로 접을 때 `max`가 가장 큰 행의 것을 물고 올라간다. 이번엔 **읽기만** 만들었다.

#### 7.8.5 보존·파티션 (WBS 3.14) — **확인만, 코드 변경 없음**

1차 물결에서 이미 편입돼 있었다:
- `ApmPartitionService.PARTITIONED_TABLES`에 6개 전부(선생성 배치가 하루 9개 생성).
- `ApmRetentionJob`의 **`tracePartitions` 단계**가 6개를 각자의 보존일로 DROP한다(span 7 · summary 7 · edge 30 · error_1h 90 · db_5m 30 · dependency 30). `apm_deployment`(400일)도 이미 있다(항상 0행).
- 🔴 V45가 더한 두 BRIN 인덱스는 **파티션 테이블에 만든 것**이라 새로 생기는 파티션에도 자동으로 붙는다.
- ✅ **그룹 테이블 본체도 2026-09-02에 편입됐다**(2차 검수 지적 6). `ApmRetentionJob`에 단계 두 개가 늘었다 — `errorGroups`·`dbQueryGroups`(옵션 키 `errorGroupDays`·`dbQueryGroupDays`, 기본 **90**). 🔴 **자식을 먼저 지운다**: `apm_error_group_1h`·`apm_db_query_group_5m`에는 부모로 가는 **FK가 없어**(파티션이라 두지 않았다) 부모만 지우면 고아 행이 남는다. ⚠️ 자식 DELETE는 `bucket_start` 없이 `group_id`로만 지우므로 모든 파티션을 훑는다 — 대상이 소수라 감수하지만 **처음 도는 설치본에서는 무거울 수 있다**. 단계를 나눈 이유는 실패 격리다(파티션 DROP이 잠금으로 실패해도 이쪽은 돈다).

#### 7.8.6 검증

- `gradlew :test` **2421 green, skip 0**(직전 2371 → **+50**). 도커 PG(5433 `moveseye_it`) 붙은 상태.
- ⬆️ **2차 검수 반영 후 2442 green, skip 0**(+20 — 아래 7.8.8).
- 신규 4개:
  - `ApmTraceRollupIT`(13) — 알려진 토폴로지 4종 엣지 · 대상 미상 CLIENT 제외 · 대입 멱등성 · **메시지 변형 100건 → 그룹 1** · 타입이 다르면 다른 그룹 · 1시간 버킷 덧셈 · **SQL 리터럴/IN/주석/공백 변형 → 그룹 1** · 쿼리 텍스트 없으면 스팬 이름 폴백 · db_system이 다르면 다른 그룹 · **타임아웃 분리 계상** · LAG 안쪽 미집계 · 워터마크 전진 · **지워진 서비스가 집계를 멈추지 않는다**
  - `ApmSpanTreeTest`(12) — 순서·깊이 · 고아 승격 · 순환 끊기 · 자기 부모 · **병렬 자식 합집합** · 부모 밖 자식 · 크리티컬 패스 2종 · **깊이 50**·5000 · 빈 입력 · 중복 span_id
  - `ApmTraceQueryIT`(12) — 목록 필터·정렬·정렬 화이트리스트 · route 부분일치 · **칸당 느린 것부터** · **5만 점 다운샘플** · 상세 트리·크리티컬 패스 · **요약 없이 스팬만** · 404 · 이벤트 jsonb 왕복 · 플레임 합치기 · **비교 경로 서명**
  - `ApmTraceAggQueryIT`(14) — 노드 id가 uid · 고립 서비스 노드 · 엣지 백분위 · 엣지 시계열 uid 변환 · 빈 창 404 · **목록 INNER / 상세 LEFT** · `apm_jsonb_count_merge_agg` 병합 · DB 총 소요 정렬 · system 필터·sankey · 타임아웃 분리 · **avgMs는 항상 null** · exemplar 단위 환산(초→ms) · empty
- 기존 수정 2개: `ApmSchemaIT`(스케줄러 시드 6개로) · `ApmBatchJobTest`(job_key·라이선스 게이트에 4번째 잡 추가).
- 🔴 IT가 실제로 잡은 것: `integer × 1000000` 오버플로(테스트 픽스처) · jsonb 컬럼이 `String`이 아니라 `PGobject`로 온다 · `count(*) filter (…)::bigint`는 괄호가 필요하다 · `jdbc.query(sql, rs -> 식)`이 `ResultSetExtractor`/`RowCallbackHandler` 사이에서 모호해진다.

#### 7.8.7 🔴 불안한 지점 (검수용)

1. **실 트래픽 미검증.** 롤업도 조회도 **실제 Collector가 보낸 스팬으로 돌아 본 적이 없다**. 픽스처는 손으로 만든 것이고, 특히 **`SERVICE` 엣지의 부모-자식 조인**은 두 서비스가 모두 계측된 실제 트레이스에서만 진짜로 검증된다.
2. **`peer.service`를 허용목록에 더했지만 쓰지 않는다.** 서비스 맵의 `SERVICE` 엣지는 **부모-자식 조인으로만** 만든다 — `peer.service`는 서비스 *이름*이라 `service_uid`로 해석하려면 `name_norm`·`env_norm` 정규화를 SQL에 복제해야 하고, env가 모호하다. 지금은 `HTTP` 엣지의 **to_ref 폴백 라벨**로만 쓴다. ⚠️ 이 키가 추가되기 **전에 저장된 스팬에는 없다**.
3. ~~그룹 테이블 본체에 보존 정리가 없다~~ → ✅ **해소(7.8.8-6)**. `errorGroups`·`dbQueryGroups` 단계 추가.
4. **타임아웃 판정이 문자열 휴리스틱**이다(`time.?out` 정규식). SDK·언어마다 다르고 **놓치는 쪽으로 기울여 두었다**. 실 데이터로 문자열 목록을 채워야 한다.
5. ~~`count_total`은 줄지 않는다~~ → ✅ **해소(7.8.8-1)**. 이제 `_1h`의 합이라 둘이 어긋나지 않는다. ⚠️ 대신 **보존이 지나면 줄어든다** — 그 사실이 새 계약이다(§10.2).
6. **한 트랜잭션이 최대 하루치를 잡는다.** 밀린 구간을 따라잡을 때 `maxBuckets=288`이면 288개 5분 버킷의 집계가 한 트랜잭션이다. 실측한 적이 없어 **잠금 유지 시간과 WAL 크기를 모른다** — 첫 대량 백필 때 확인하고 필요하면 옵션으로 낮출 것(`options.maxBuckets`).
7. **BRIN의 효용이 상관관계에 달렸다.** 지연 도착 스팬이 많으면 블록 범위의 min/max가 넓어져 프루닝이 안 된다. 최악이라도 지금(파티션 스캔)과 같아 **더 나빠지지는 않지만**, 기대한 만큼 빨라지지 않을 수 있다 — 실 볼륨에서 `EXPLAIN`으로 확인 필요.
8. **`route` 필터가 루트 스팬 이름 부분일치**다(요약에 route 컬럼이 없다). 루트 이름이 `GET /api/orders/{id}` 형태라 실무상 통하지만, 프레임워크가 이름을 다르게 붙이는 스택에서는 필터가 헛돈다.
9. ~~산점도의 `SCATTER_SCAN_CAP`은 정렬 없는 `limit`이다~~ → ✅ **해소(7.8.8-4)**. 시간 칸별 bounded 표본으로 바꿨다. ⚠️ 새 불안: **조기 종료가 사라져** 아주 넓은 창에서 느려질 수 있다(실측 없음).
10. **엣지 상한 2,000행에 걸리면 `truncated=true`만 알린다** — 어느 엣지가 빠졌는지는 알려주지 않는다(호출 수 내림차순이라 굵은 것부터 남는다).
11. **`apm_error_group_1h`의 `endpoint_counts`가 50키로 잘린다.** 상한을 넘는 route가 있으면 조용히 빠지고, 그 사실을 알리는 필드가 없다.
12. **시계열의 빈 구간을 채우지 않는다**(RED와 다르다). FE가 이 차이를 모르고 같은 차트 빌더를 쓰면 선이 끊긴다 — 계약 §10.2에 적었지만 **FE 확인 필요**.

#### 7.8.8 코덱스 검수 반영 — 2차 (2026-09-02, `_archive/features/apm/core/review_apm-p2-w2_codex.md` 지적 8건)

기준 `6eb287c`. **8건 중 7건 반영**(8번은 "현 판단이 타당"이라는 확인이라 코드 변경 없음). `:test` **2442 green, skip 0**(+20).

| # | 지적 | 반영 |
|---|---|---|
| 1 🔴 | 예외 롤업의 덧셈 UPSERT가 잡 재실행에서 이중 계상 | **버킷별 대입으로 전환**. `rollupErrors`가 소스 창을 시간 경계로 내려 그 시간대를 통째로 다시 세고 대입한다(`count`·`endpoint_counts`). `count_total`은 UPSERT에서 빼고 `syncErrorCountTotals`가 `_1h` 합으로 재계산 — 순수 함수라 몇 번을 돌려도 같다. ⚠️ `count_total`의 뜻이 "평생"→"보존 90일 합"으로 바뀌었다(7.8.2·계약 §10.2). 대가는 같은 시간대를 최대 12번 다시 읽는 것 |
| 2 🔴 | 17개 읽기 EP에 운영자 판정이 없음 | **P1까지 같이** 잠갔다 — 확인해 보니 P1 조회 EP들도 로그인만 검사하고 있었다(설계 §8.1 🅞 위반이 P1부터 있었다). `ApmAccessChecker.requireRead`(신설, `core/security/`)를 개요·서비스·RED·런타임·실시간·서비스 맵·트레이스·에러·DB·의존·exemplar·`/services/{uid}/alert-rules` **전부**의 첫 줄에 넣었다. 판정은 `UserRole` 축 = `ADMIN ∪ SUPER_ADMIN`(우리 축엔 "운영자" 등급이 없다). 🔴 **회귀**: `USER` 계정은 이제 APM 조회가 전부 200+403 — FE 메뉴 가림 요청을 계약 §10.5에 남겼다 |
| 3 🔴 | `sampleStack`·attrs/events·`queryNorm` 원문 열람이 분리돼 있지 않음 | `ApmRawTextPolicy`(설정 × 자격) + `ApmRawTextView`(마스킹 규칙). **`keep_raw_sql=true`인 설치본에서만** 판정이 살아나고(꺼져 있으면 저장값이 이미 마스킹본이라 아무 일도 안 한다), 자격 없는 열람자에게는 **값만** 가린다 — 스택의 `at ...` 프레임 줄은 남긴다. 규칙은 적재 시점의 `ApmSqlPolicy.MASKED`를 그대로 빌려 쓴다. `queryNorm`은 `apm_sql_norm()`이 이미 리터럴을 지운 값이라 별도 판정 없음 |
| 4 🔴 | 산점도의 정렬 없는 `limit 200000` | 시간 칸별 bounded 표본(`generate_series` × `cross join lateral`, 칸당 `200,000/cells`(최소 200), `order by duration_ns desc, trace_id`). 어느 시간대도 사라지지 않고 같은 데이터면 같은 그림이 나온다. 버킷 폭은 **올림**(내림이면 창 끝이 어느 칸에도 안 들어간다) |
| 5 🟡 | 워터마크 전진 후 지연 도착 영구 누락 | ① 예외는 1번의 시간째 재계산으로 같은 시간대면 자동 합류 ② 5분 단 셋은 **소스 창만 뒤로 2버킷(10분)** 넓혀 다시 대입 → 허용 지연 3분 → **13분**. 워터마크는 그대로 전진한다. ⚠️ 그보다 늦은 것은 여전히 누락(트레이드오프는 7.8.2) |
| 6 🟡 | 그룹 본체 90일 보존 부재 | `ApmRetentionJob`에 `errorGroups`·`dbQueryGroups` 단계 추가(기본 90일). 🔴 자식(`_1h`/`_5m`)을 먼저 지운다 — FK가 없어 부모만 지우면 고아가 남는다 |
| 7 🟡 | `apm_sql_norm`이 달러 인용을 안 가림 | V45 자체 수정(미적용·미푸시). 태그 있는 형태 → 태그 없는 형태 순으로, **홑따옴표 치환보다 먼저** 지운다. 🔴 함수 본문 자체가 달러 인용이라 주석·정규식에 달러 두 개를 나란히 쓰면 마이그레이션이 죽는다(정규식을 `\$\$`로 갈라 놓은 이유) |
| 8 🟢 | `requiresActiveLicense=false`가 타당 | 코드 변경 없음. 라이선스 만료 중에도 도는 사실은 V45 주석과 `ApmTraceRollupJob`에 남아 있다 |

**함께 고친 것(지적 밖)**: `ApmRollupService`(P1 메트릭 롤업)의 `bounds_id` 혼재 판정에도 같은 NULL 결함이 있어 같이 고쳤다 — 그쪽은 **판정 결과가 5m/1h 테이블에 저장**되므로 조회보다 오래 남는다.

**남은 불안(새로 생긴 것 포함)**
1. 🔴 **여전히 실 트래픽 미검증**(7.8.7-1과 같다). 대입 전환·lookback·산점도 표본 전부 **픽스처로만** 검증했다.
2. 🔴 **읽기 게이트가 실제 화면에서 검증되지 않았다.** BE 테스트는 200+403을 고정했지만, `USER` 계정으로 로그인해 APM 메뉴를 눌러 보는 종단 확인은 하지 않았다. FE가 메뉴를 가리기 전까지 그 계정에는 "메뉴는 보이는데 전부 403"이 보인다.
3. 🟡 **예외 롤업 비용이 늘었다**(같은 시간대 최대 12회 재스캔 + 5분 단 lookback 3배 스캔). 실 볼륨에서 배치 시간을 측정한 적이 없다.
4. 🟡 **산점도의 조기 종료가 사라졌다.** 아주 넓은 창에서 예전보다 느려질 수 있다(5만 건 테스트는 통과하지만 그것으로 수백만 건을 말할 수 없다).
5. 🟡 **`count_total` 의미 변경이 FE에 아직 안 갔다.** 화면이 "평생 누적"으로 라벨을 달고 있으면 문구를 바꿔야 한다(계약 §10.2에 적었다).

---

### 7.9 P2 종단 QA 결함 수정 (2026-09-02, `features/apm/core/e2e_apm-p2-qa.md` §1 결함 15건)

기준 `a0f13d5`. 실 트래픽 3,790요청 + 브라우저 종단 QA가 낸 결함 목록을 반영했다.
**HIGH 2 · MED-HIGH 2 · MED 3 · LOW-MED 2 · LOW 4 · INFO 2** 중 **코드 수정 11건**(D12는 계약 명시만,
D7·D14·D15는 FE·환경 사안이라 범위 밖). `:test` **2535 green, skip 0**(+20).

| # | 결함 | 반영 |
|---|---|---|
| D1 🔴 | 에러 그룹 조회가 1시간 버킷 경계에서 잘려 **15분·1시간 창이 항상 0건**, `new-errors`는 사실상 영구 0 | 버킷 조인의 **창 시작만 정시로 내린다**(`ApmTimeRange.fromTsHourFloor`, 목록·상세·시계열 3곳). 넓힌 만큼의 오탐은 **그룹 행의 초 단위 `first_seen_at`·`last_seen_at` 교집합**으로 2차 필터. ⚠️ 대가: `count`가 창을 덮는 정시 버킷 전체의 합이라 **요청한 창보다 넓다**(1시간 해상도에서 15분치를 떼어 낼 방법이 없다 — "넓게 세거나 0을 보여 주거나"의 선택). IT 2건(17:03에 "최근 15분" 재현 / 창 밖에서만 산 그룹은 여전히 제외) |
| D2 🔴 | exemplar → 트레이스 점프 실측 **0/23**(메트릭 100% vs tail 샘플링 2%) | exemplar 응답 항목에 **`stored: boolean`** 추가. 서버가 `apm_trace_summary`를 **배치 1회** 조회해 채운다(창 ±5분으로 파티션 프루닝). 🔴 상세 404는 "샘플링 탈락"과 "보존 만료"를 구분할 수 없으므로 **여기서** 답한다. 계약 §10.2 갱신 |
| D3 🔴 | `/apm/live/stream`이 USER에게 **401 INVALID_TOKEN** + ERROR 스택 | `requireRead`(던짐) → **`canRead` + 응답 직접 쓰기**로 교체. 원인은 `produces=text/event-stream`이 남긴 producible 미디어 타입 때문에 전역 핸들러의 JSON을 못 써 `/error` 재디스패치 → SecurityContext 없는 익명 401. 🔴 회귀 테스트는 응답 값이 아니라 **`getResolvedException() == null`**(예외 해석기를 타지 않았다)을 본다 — MockMvc는 이 사고를 재현하지 못하기 때문이다 |
| D4 🔴 | 구 semconv 스팬이 **SQL·DB명·주소를 통째로 잃고** 그 사실이 어디에도 안 남음 | ① `ApmSpanAttrAllowlist.LEGACY_ALIAS` 신설(12쌍 — `db.statement`→`db.query.text`·`db.name`→`db.namespace`·`net.peer.name`→`server.address`·HTTP 4쌍 등, 메트릭 별칭표와 대칭). **신 이름이 있으면 그쪽이 이긴다**, **별칭 해석이 거부 판정보다 먼저**라 `http.url`→`url.full`은 펴진 뒤 거부된다(우회로 차단). ② 허용목록 밖 폐기를 **`NOT_ALLOWLISTED`/`signal=TRACE`/키별**로 계상(배치당 distinct 키 128 상한, 초과분은 `__other__`). ⚠️ 단위가 **속성**이다(스팬·포인트와 더하면 안 된다) |
| D5 🟡 | 관측이 적은 구간에서 백분위가 실측 범위를 벗어남(110ms 1건인데 p50 175ms) | **V46 신설** — `apm_service_edge_5m`·`apm_db_query_group_5m`·`apm_dependency_5m`에 `min_ns`·`max_ns`(bigint 나노초). 롤업이 대입으로 채우고, 조회는 `ApmPercentiles.of(..., minRaw, maxRaw)`로 **세 백분위를 모두** 조인다(P1 D2가 만든 클램프를 재사용). 🔴 `apm_error_group_1h`는 히스토그램 자체가 없어 대상이 아니다. ⚠️ V46 이전 행은 NULL → 보정이 꺼진 채 **예전 값 그대로**(안전한 방향) |
| D6 🟡 | 계약 표본 `trace-detail.json`이 **알고리즘상 불가능한 값**을 담고 있었고 FE가 그것에 맞춰 규칙·테스트를 만듦 | 표본의 크리티컬 패스 3필드를 **`ApmSpanTree.build`·`criticalPath`를 실제로 돌려서** 만든다(`selfMs`·`depth`·`orphan`도 트리 값으로 덮는다). `db.statement` → **`db.query.text`**(정본). 🔴 파일 대조만으로는 "둘 다 틀려도 초록"이라 **불변식 테스트**를 추가했다 — 플래그 집합 == 배열 == Σ`selfMs` == `criticalPathMs` |
| D8 🟡 | SQL 없는 **커넥션 스팬**이 쿼리 그룹이 되어 `dmove_apm\|postgres`가 "느린 쿼리" 3위에 뜸 | 롤업 소스에서 **`db.query.text` 키가 있는데 빈 문자열**인 스팬 제외(`jsonb_exists` — JDBC가 `?`를 바인드로 읽어 `attrs ? 'k'`를 못 쓴다). ⚠️ **키가 아예 없는 경우는 그대로 둔다** — 그건 정책 DROP일 수 있고, 그때 스팬 이름 폴백이 표의 행을 세우는 유일한 수단이다 |
| D9 🟡 | 계측된 서비스 호출이 "외부 호출"에도 계상(`127.0.0.1`) — 같은 44건이 두 벌 | **결정 번복**. 의존 롤업이 서비스 맵과 **같은 조인**(자식 스팬이 다른 서비스에 있는가)으로 판정해 SERVICE로 해소된 호출을 제외한다. ⚠️ 대입 UPSERT라 **과거 버킷의 기존 행은 남는다**(롤업이 다시 도는 구간만 사라진다) |
| D10 🟢 | compare 인자 누락 400의 `errorCode`가 `APM_TRACE_NOT_FOUND` | **`APM_TRACE_COMPARE_INVALID`** 신설. `code`(400)와 `errorCode`가 서로 다른 이야기를 하면 FE가 호출부 버그를 "만료됨"으로 안내한다 |
| D11 🟢 | 403만 **영어 메시지 + `errorCode` 없음** | `ErrorCode.FORBIDDEN` 신설 + `ForbiddenError`가 **선택적으로** 코드를 싣는다. 🔴 **APM 경로만** 바뀐다 — 전역 `RolesInterceptor`·`DmovePermissionChecker`·MCP 인터셉터는 코드를 안 실어 `NON_NULL`이 키를 지우므로 **응답이 한 글자도 안 바뀐다**(1:1 계약 보존) |
| D13 🟢 | `.NET` 설치 가이드에 `SEMCONV_STABILITY_OPT_IN` 안내 **0건** | 재기동 스텝 문구 + `OTEL_SEMCONV_STABILITY_OPT_IN=http,database` 환경변수 항목 추가(java 1·node 2·python 2와 같은 수준으로) |
| D12 🟢 | `exception.stacktrace`·비-SQL `exception.message`의 리터럴은 마스킹 안 됨 | **코드 변경 없음 — 스펙대로다.** 아래 "§7.3 마스킹의 한계" 참조 |

#### 7.9.1 2회차 QA 결함 (2026-09-02, 같은 문서 §8.4)

기준 `5afa90b`. 1회차 결함 15건 재검증에서 새로 나온 3건 중 **D17만 코드 수정**(D16·D18은 FE 사안).

| # | 결함 | 반영 |
|---|---|---|
| D17 🔴 | CUMULATIVE 수신에서 exemplar 칩이 **`104.88 s`라고 적으면서 `130.9 ms` 트레이스로 링크**(800배). 같은 수가 다섯 버킷에 고정되고 `traceId`만 바뀜. 설치 가이드는 "CUMULATIVE도 처리"라고 명시 | 원인은 **라벨과 링크의 출처가 달랐던 것** — 라벨은 `max` 컬럼, 링크는 `exemplar_trace_id`. 누적값은 `count`·`sum`을 빼서 증분을 얻지만 **극값은 뺄 수 없다**. ① **V47 신설** — `apm_metric_1m/5m/1h`에 `exemplar_value`. 값의 정본은 OTLP exemplar 자신(`asDouble`/`asInt`, 구 semconv ms는 초로 환산), 귀속은 exemplar의 `timeUnixNano`(**버킷 밖이면 폐기**, 중복 traceId는 최신 1개). UPSERT·롤업·조회 모두 **traceId와 값을 같은 행에서 한 쌍으로** 다룬다. ② **CUMULATIVE 히스토그램의 `min`/`max`는 저장하지 않는다**(NULL). ③ 설치 가이드 5개 스택 전부에 "**극값·exemplar 값은 delta에서만 정확**"을 명시. ⚠️ 대가 셋: 백분위 min/max 클램프가 CUMULATIVE 구간에서 생략(= 보간만 쓰던 예전 값) · 실시간 "느린 엔드포인트" Top이 그 축을 잃음 · **V47 이전 버킷은 라벨이 `null`**(옛 `max`로 메우지 않는다 — 그게 거짓말이었다). 계약 §10 #17 의미 갱신, FE 요청 4·5 |
| D16 🟢 | 배포 목록이 로딩 중 "이 기간에 감지된 배포가 없습니다"를 1초 노출 | **FE 사안**(`loading` prop) — BE 범위 밖 |
| D18 🟢 | USER가 에러 화면을 URL로 열면 403을 "예외가 없습니다"로 그림 | **FE 사안**(D11이 실어 준 `errorCode:"FORBIDDEN"`으로 분기) — BE 범위 밖 |

#### 🔴 §7.3 마스킹의 한계 — 무엇을 가리고 무엇을 못 가리나 (D12, 정책 명시)

`ApmSqlPolicy.applyToFreeText`·`applyToStackTrace`는 **SQL 키워드 쌍이 보일 때만** 리터럴을 가린다.
그래서 이렇게 갈린다(전부 실측):

| 저장값 | 마스킹 | 왜 |
|---|---|---|
| `ERROR: duplicate key; SELECT id FROM members WHERE ssn = '900101-1234567'` | ✅ `ssn = ?` | `SELECT … FROM`이 보인다 |
| `no row for email = 'bob@example.com' id 42` | ❌ 원문 | SQL로 보이지 않는다 |
| `org.postgresql.util.PSQLException: ERROR: duplicate key value 'bob@example.com'\n\tat …` | ❌ 원문 | 같은 이유 |

🔴 **이것은 결함이 아니라 선택이다.** 자유 텍스트의 모든 따옴표 안을 가리면 예외 메시지가
`Cannot find ? in ?` 같은 **읽을 수 없는 문자열**이 되고, 그러면 에러 화면이 답해야 할 질문
("무슨 일이 났나")에 아무도 답하지 못한다. 값을 남기는 쪽이 기본이고, SQL은 **패턴이 뚜렷해서만**
예외적으로 가린다.

⚠️ **그래서 예외 헤더 줄에 개인정보가 실릴 수 있다.** `mask_sql=false`(DROP 사분면)에서도 이 값은
남는다 — 그 스위치는 `db.query.text` 전용이다. 개인정보가 예외 메시지에 실리는 설치본은
**Collector `redaction/pii`**로 막는 것이 정본이고, 원문 열람 자격(§10.5)이 두 번째 방어선이다.
