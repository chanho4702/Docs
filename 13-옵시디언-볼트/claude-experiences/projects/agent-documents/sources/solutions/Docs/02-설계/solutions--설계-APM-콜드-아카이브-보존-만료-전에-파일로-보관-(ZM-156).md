# 설계 — APM 콜드 아카이브: 보존 만료 전에 파일로 보관 (ZM-156)

- 작성일: 2026-09-16 · 상태: **초안(설계 선행, 사용자 결정 대기)** · 구현: 0
- 근거: `planning/tasks_backlog-2026-09-16.md` §I6·§I7 · `planning/backlog_apm-comprehension-and-ai.md` §1-5("③ 콜드 아카이브 설정안")
- 🔴 **기반 문서**: [`devdesign_data-archiving.md`](%EC%84%A4%EA%B3%84-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%95%84%EC%B9%B4%EC%9D%B4%EB%B9%99-%28%EA%B0%90%EC%82%AC-%EA%B7%9C%EC%A0%9C-%EB%8C%80%EB%B9%84-%EC%9E%A5%EA%B8%B0-%EB%B3%B4%EA%B4%80%29.md)(I7, 자빅스 아카이빙, 2026-08-31~09-02 초안). **이 문서는 그 기반 위의 두 번째 소스**로 설계한다. 그 문서는 수정하지 않고 참조만 한다(이하 "기반 문서 §n").
- 관련: `devdesign_apm.md` §4.4·§7(보존) · `devdesign_apm-metric-allowlist-extension.md`(ZM-155, 커스텀 지표는 1m에 합류 → 이 아카이브에 자동 포함)
- 표기: 🔴 = 어기면 데이터가 **조용히** 틀리거나 사라지는 규칙 · ⚠️ = 알고 있어야 하는 한계 · **[코드]** = 코드에서 확인한 사실 · **[제안]** · **[확인 필요]**

---

## 0. 한 줄 요약

APM 보존 배치는 **지우기만 하고 어디에도 남기지 않는다.** 롤업은 되돌릴 수 없는 요약이고 트레이스는 7일 뒤 소멸한다.
이 설계는 **"DROP 직전에 파일로 떨구고, 떨구지 못한 날은 DROP하지 않는다"**를 만든다. 뒤의 절반(DROP 게이트)이 이 기능의 존재 이유다 — 앞의 절반만 있으면 실패한 날이 그대로 사라진다.

🔴 **자빅스 아카이빙(I7)과 따로 만들지 않는다.** 파일 형식·manifest·목록/다운로드/삭제 화면·삭제 정책·감사 로그는 **공통 기반**(§3)으로 한 번 만들고, 자빅스와 APM은 그 위의 **소스 두 개**가 된다.

---

## 1. 보존 정책 현황 — 무엇이 영영 사라지는가 [코드]

`ApmRetentionJob`(매일 01:30, `requiresActiveLicense=false`)이 아래를 정리한다. 옵션 키는 `scheduler_setting.options`(job_key `apm_retention`)에서 읽고, **V38 시드에 있는 키는 5개뿐**이며 나머지는 **코드 기본값**으로 돈다.

### 1.1 파티션 DROP 대상 (일 파티션 `<table>_pYYYYMMDD`)

| 단계 | 테이블 | 기본 보존 | 옵션 키 | 시드에 있나 | 그 뒤 |
|---|---|---|---|---|---|
| `partitions` | `apm_metric_1m` | **7일** | `raw1mDays` | ✅ | 5m로 접힘 — 🔴 **인스턴스 축 소멸** |
| | `apm_metric_5m` | 30일 | `rollup5mDays` | ✅ | 1h로 접힘 — 5분 해상도 소멸 |
| | `apm_metric_1h` | **400일** | `rollup1hDays` | ✅ | 🔴 **완전 소멸** |
| `tracePartitions` | `apm_span` | **7일** | `spanDays` | ❌(코드) | 🔴 **완전 소멸**(접지 않음) |
| | `apm_trace_summary` | 7일 | `traceSummaryDays` | ❌ | 🔴 완전 소멸 |
| | `apm_service_edge_5m` | 30일 | `edge5mDays` | ❌ | 소멸 |
| | `apm_error_group_1h` | 90일 | `errorGroup1hDays` | ❌ | 소멸 |
| | `apm_db_query_group_5m` | 30일 | `dbQuery5mDays` | ❌ | 소멸 |
| | `apm_dependency_5m` | 30일 | `dependency5mDays` | ❌ | 소멸 |
| `messaging5m` | `apm_messaging_5m` | 30일 | `messaging5mDays` | ❌ | 소멸 |
| `rumPartitions` | `apm_rum_page_5m`·`_receipt`·`_session_5m`·`_timing_5m`·`_error_5m` | 30일 | ⚠️ **옵션 없음(하드코딩)** | — | 소멸 |
| | `apm_rum_span` | 7일 | ⚠️ 하드코딩 | — | 소멸 |

### 1.2 DELETE 대상 (비파티션)

| 단계 | 테이블 | 기본 | 기준 컬럼 | 아카이브 관점 |
|---|---|---|---|---|
| `errorGroups` | `apm_error_group`(+고아 `_1h`) | 90일 | `last_seen_at` | 🔴 **가변 행**(`last_seen_at`이 계속 밀린다) — 날짜 단위로 자를 수 없다 |
| `dbQueryGroups` | `apm_db_query_group`(+고아 `_5m`) | 90일 | `last_seen_at` | 〃 |
| `sloSnapshots` | `apm_slo_snapshot` | 400일 | `day` | 날짜 단위로 자를 수 있다 |
| `jobRuns` | `apm_job_run` | 90일 | `started_at` | 〃 |
| `deployments` | `apm_deployment` | 400일 | `detected_at` | **[코드]** 쓰는 코드가 아직 없어 항상 0행 |
| `rumErrors` | `apm_rum_js_error_group` | 90일(하드코딩) | `last_seen_at` | 가변 |
| `instances`·`dropStats`·`receipts` | 인스턴스·폐기통계·영수증 | 30·30·2일 | | 운영 메타 — 아카이브 가치 낮음 |
| `hidden` | `apm_service` | 설정 14일 | | UPDATE(숨김)라 소멸 아님 |

### 1.3 DROP의 정확한 시점 [코드 `ApmPartitionService.dropExpired`]

```
cutoff = LocalDate.now() − retentionDays      (🔴 시스템 기본 시간대)
파티션 날짜 D < cutoff 이면 DROP  ⇔  오늘 ≥ D + retentionDays + 1
→ 1m의 D일 파티션은 D+8일 01:30에 사라진다
```

- 파티션마다 **별도 auto-commit `DROP TABLE`**. 한 테이블이 실패하면 **그 단계의 뒤 테이블은 안 돈다**(서비스가 첫 실패에서 던짐). 단계끼리는 독립(`step()`이 잡고 계속, 마지막에 모아서 던짐 — false-green 방지).
- 이름에서 날짜를 못 읽는 파티션은 건드리지 않는다.
- ⚠️ **[코드]** 보존 배치는 **롤업 워터마크를 보지 않는다** — 날짜만 본다. 롤업이 멈춘 사이 1m이 지워질 수 있는 문제(A5)는 롤업을 `requiresActiveLicense=false`로 바꿔 **운용으로** 막았지, 배치 간 의존으로 막지 않았다. **지금 배치들은 서로를 모른다**는 사실의 실례다.
- ⚠️ **[코드]** `ApmResolution.retentionDays`는 `apm_retention` 옵션의 **사본**이다(A17) — 옵션으로 보존을 바꾸면 조회 계층과 갈린다. 아카이브까지 세 번째 사본을 만들면 안 된다(§5.4).

### 1.4 영영 사라지는 것 — 정리

| 잃는 것 | 언제 | 되살릴 수 있나 |
|---|---|---|
| **인스턴스별 지표** | 7일 | ❌ 5m/1h는 서비스 합산 |
| **5분 이하 해상도** | 30일 | ❌ 롤업은 평균·합·최대·버킷만 남긴 요약 |
| **모든 지표** | 400일 | ❌ |
| **개별 트레이스·스팬(워터폴·속성·SQL)** | 7일 | ❌ 요약도 7일 |
| 서비스 간 호출·외부 의존·DB 쿼리 버킷 | 30일 | ❌ |
| 오류 그룹 원문·스택 표본 | 마지막 발생 후 90일 | ❌ |
| SLO 일 스냅샷(캘린더) | 400일 | ❌ 5m이 30일이라 재계산 불가 |

---

## 2. 기존 설계와의 관계 — 겹치는 것 / APM만의 것

### 2.1 비교표

| 축 | 자빅스 아카이빙(I7, 기반 문서) | APM 콜드 아카이브(이 문서) | 공통화 |
|---|---|---|---|
| 목적 | 감사·규제용 **원본** 보관(U1) | 보존 만료로 **우리가 지우기 전에** 남기기 | 목적 문구만 다름 |
| **누가 지우나** | 🔴 **자빅스 housekeeper**(우리가 통제 불가) | 🔴 **우리 `apm_retention`**(우리가 통제) | ❌ — 이 차이가 안전장치를 가른다 |
| 안전장치 | 보존 기간 **자가진단**(기반 §4.4) — 배치 주기 < 소스 보존인지 | **DROP 게이트**(§5) — 아카이브 성공 전엔 지우지 않는다 | ❌ 각자 |
| 소스 읽기 | Zabbix `history.get` 청킹, **병렬 금지**, 부하 실측 | 우리 PG 파티션 **직접 스캔** — 외부 부하 없음. 대신 **1m 하루 ≈ 1,400만 행** | ❌ 소스 어댑터 |
| 매체 | 파일(ZIP), DB는 메타 1행 | 같음 | ✅ |
| 컨테이너 | 하루 = ZIP 1개 (`manifest.json` + `checksums.txt` + `data/*.csv.gz`) | **(데이터셋, 날짜) = ZIP 1개**(§4.2 — 데이터셋마다 DROP 시점이 달라서) | ✅ 형식 동일, 단위만 확장 |
| 형식 | CSV.gz (D3 — 엑셀로 연다, Parquet 의존성 거부) | 지표·요약 CSV.gz, **스팬은 JSONL.gz**(중첩 jsonb) | ✅ 작성기 공유 + 형식 1종 추가 |
| manifest | `schemaVersion`·`source`·`period`·`scope`·`counts`·`files`·**`gaps`**·`signature` | 같은 골격 + `source.type=APM`·`dataset`·`timezone`·`dictionaries` | ✅ 확장 |
| 시각 | UTC epoch + ISO 병기(D11) | 🔴 PG `timestamp`(tz 없음) = **시스템 기본 시간대** → 변환해 epoch+ISO로 싣고 원 tz를 manifest에 기록 | ✅ 규칙 공유 |
| 실패 | 청크 실패 → gap 기록·계속, **실패율 20% 넘으면 중단·빈 ZIP 금지**(기반 §4.2) | 로컬 DB라 청크 부분 실패가 드물다 → **(데이터셋, 날짜) 단위 전부 아니면 전무**. gap은 "이미 DROP됨(`SOURCE_EXPIRED`)"만 | ✅ 원칙 공유("빈/부분 ZIP 금지") |
| 재생성 | 같은 날 재생성 = **새 파일 + 기존 `SUPERSEDED`**(D8, 덮어쓰기 금지) | 같음 | ✅ |
| 삭제 | 🔴 **행은 남기고 파일만 삭제·사유 필수·감사 로그**(§6.1, D12) · 자동 만료는 `RETENTION_EXPIRED` | 같음 | ✅ |
| 목록 화면 | 설정 › 데이터 아카이빙 — 목록(경로·**실물 존재**)·다운로드·선택 삭제·대상 설정·상태 카드 | 같은 화면에 **소스 필터** + APM 대상 탭 + **"보류 중인 정리"** 카드 | ✅ |
| 배치 틀 | 기존 `SchedulerJob`, **Spring Batch 미도입**(§8.1) | 같음 | ✅ |
| 라이선스 | export는 **필요**(소스 호출), cleanup·gc는 불필요 | 🔴 export도 **불필요**(§5.6 — 우리 DB만 읽고, 멈추면 게이트가 DROP을 막아 디스크가 찬다) | ❌ 각자 |
| 되살리기 | P2 업로드 조회(`archive_restore_sample`은 host·item_key 모양) | **1차 제외**(§6.4). 자빅스 모양 임시 테이블은 APM에 맞지 않음 | ⚠️ P2에서 재설계 |
| 서명 | P3(미결 Q4) | 같음 | ✅ |
| 저장 경로 | `{archive.dir}` — 입력·검증 규칙 미정 | 🔴 **고객 입력 경로 검증 필수**(§7) | ✅ **공통 기반에서 한 번에** |
| 권한 | 전 EP 관리자 전용, `DmovePermissions`에 `archive` feature 추가 | 같은 화면 → 같은 권한(§8) | ✅ |

### 2.2 결론

- **재사용이 맞다.** 겹치는 12개 축 중 10개가 그대로 공통이다. 따로 만들면 ZIP 작성기·manifest·목록·삭제·감사 로그를 **두 번** 만들고, 특히 🔴 "삭제해도 행은 남긴다"(D12) 같은 규칙이 한쪽에서만 지켜지는 사고가 난다.
- **APM만의 것은 셋**: ① **DROP 게이트**(우리가 지우므로 우리가 멈출 수 있다) ② **데이터셋별 DROP 시점이 달라** 아카이브 단위가 (데이터셋, 날짜)다 ③ **자기 완결 사전**(service_id·bounds_id·group_id를 이름으로 풀어 줄 표가 파일 안에 있어야 한다).
- 🔴 **먼저 착수하는 쪽이 공통 기반을 만든다**(I7 착수 전 확인 문구와 같음). 기반 문서의 마이그레이션 번호 V41은 낡았다 — **현재 V59까지 사용(확인됨)**.

---

## 3. 공통 기반 — 두 소스가 함께 쓰는 것 [제안]

### 3.1 모듈 경계 — 🔴 ArchUnit이 방향을 정한다 [코드]

| 규칙 | 내용 | 공통 기반에 주는 제약 |
|---|---|---|
| **A1** | premium 밖의 코드는 premium에 의존하지 않는다 | 공통 기반(app 패키지, 예: `archive/`)은 **APM 클래스를 import할 수 없다** → **SPI(인터페이스)를 공통 쪽에 두고 APM이 구현**한다 |
| **A3** | premium은 **app 리포지토리**를 직접 참조하지 않는다 | APM 소스는 `archive_file` **리포지토리가 아니라 공통 서비스**(`ArchiveLedger`)를 부른다 |
| A2 | premium 컨트롤러는 `@RequiresFeature` 필수 | 목록·다운로드·삭제 EP는 **공통(app) 컨트롤러** 하나. APM 전용 설정 EP만 premium |

```
app  archive/                                   premium  apm/core/batch/archive/
 ├ ArchiveSource (SPI)  ◀───────── 구현 ───────── ApmArchiveSource
 ├ ArchiveLedger (서비스: 행 생성·상태 전이·조회)  ◀── 호출 ── ApmArchiveJob · ApmArchiveDropGate
 ├ ArchiveWriter (ZIP·CSV.gz·JSONL.gz·manifest·checksums, 스트리밍)
 ├ ArchivePathPolicy (경로 검증·쓰기/여유 공간 실검사) (§7)
 ├ ArchiveFileController (목록·상세·다운로드·삭제·무결성 검사)
 └ ArchiveAudit (다운로드·삭제 기록)
```

⚠️ 자빅스 아카이빙이 premium 기능인지는 **확인 필요**(기반 문서에 언급 없음). premium이면 공통 기반 위치를 다시 봐야 한다.

### 3.2 `archive_file` 확장 (기반 §5의 스키마에 더할 것)

| 컬럼 | 추가 이유 |
|---|---|
| `source varchar(16) NOT NULL` | `ZABBIX` \| `APM` — 목록 필터·게이트 조회 축 |
| `dataset varchar(32) NOT NULL` | APM은 한 날짜에 데이터셋이 여러 개다(`metric1m` 등). 자빅스는 `zabbix_daily` 단일 |
| `period_day date` | 게이트 조회 키. 🔴 **파티션과 같은 시간대(시스템 기본)의 날짜** — UTC 날짜로 두면 9시간 어긋나 엉뚱한 날을 "보관됨"으로 읽는다 |
| `source_rows bigint` | 내보내기 시점 DB 행 수(검증 대조용) |
| 유니크 인덱스 | 🔴 `(source, dataset, period_day) WHERE status = 'OK'` 부분 유니크 — 같은 날짜의 **유효본은 하나**. `SUPERSEDED`·`FAILED`·`DELETED`는 여러 개 허용 |

- 기반 문서의 `raw_rows`·`trend_rows`는 자빅스 전용 의미라 APM에선 0 → **`counts`는 manifest jsonb가 정본**으로 하고, 목록 표시는 `source_rows`로 통일하는 편이 낫다(기반 문서 수정 사안 → I7 착수 시 결정).
- 🔴 **FAILED 행도 남긴다.** 게이트·화면이 "시도했는데 실패"와 "아직 시도 안 함"을 구분해야 한다.

### 3.3 공통 원칙 (기반 문서에서 승계, 양쪽 모두 적용)

1. 🔴 **부분 파일을 목록에 올리지 않는다** — `.partial`로 쓰고, 검증(§6.3) 통과 후 원자적 이동. 실패하면 `.partial` 삭제 + `FAILED` 행.
2. 🔴 **덮어쓰지 않는다** — 재생성은 새 파일 + `SUPERSEDED`(D8).
3. 🔴 **지워도 행은 남긴다** — 사유 필수·감사 로그(D12). 자동 만료는 `RETENTION_EXPIRED`.
4. **다운로드도 감사 대상**(D13).
5. **실물 존재 여부를 목록에서 확인**(기반 §7) — 경로를 노출하면 화면 밖 삭제가 생긴다.
6. **디스크 여유 부족이면 시작 전 중단**(기반 §11.3).

### 3.4 감사 로그 — 🔴 공통 체계가 아직 없다 [코드]

- 기반 문서는 `ENTITY_ARCHIVE` 감사 로그를 전제하지만, **그런 공통 감사 체계는 코드에 없다.** 있는 것은 `zabbixadmin`의 `ZabbixChangeLog`(Zabbix 관리 화면 전용)와 자산 도메인의 `asset_activity`뿐이고, APM은 V39 `updated_by` + WARN 로그가 전부다.
- 공통 기반에 **`archive_audit`(append-only: action·archive_file_id·actor·reason·at·client_ip)** 를 두거나, ZM-155와 함께 **범용 감사 로그**를 먼저 만드는 선택이 필요하다(§10 Q8).

---

## 4. 배치 `apm_archive` 설계

### 4.1 흐름

```
 매일 00:50 (기본) ── ApmArchiveJob ────────────────────────────────────────────────
  0. 스위치·경로 사전검사 (꺼짐 → "skipped: disabled" 요약으로 정상 종료)
     └ 경로 실검사 실패·여유 공간 부족 → 던진다(실패로 기록) — 게이트가 DROP을 막는다
  1. 보존 정책 읽기 — apm_retention의 options (§5.4, 사본 금지)
  2. 대상 날짜 산정 — 데이터셋마다 "곧 DROP될 날짜" 중 OK 행이 없는 것 (§4.3)
  3. (데이터셋, 날짜)마다:
       REPEATABLE READ 읽기 트랜잭션 → count(*) → 스트리밍 → .partial ZIP
       → 재읽기 검증(행 수·SHA-256) → 원자적 이동 → archive_file OK
       실패 → .partial 삭제 → archive_file FAILED(사유) → 다음 항목 계속
  4. 시간 예산(maxRunMinutes) 초과 시 남은 항목은 다음 회차로 — 요약에 "deferred=N"
  5. 요약: "ok=5 failed=1 deferred=2 bytes=… held=…" · 실패가 하나라도 있으면 던진다
 ─────────────────────────────────────────────────────────────────────────────────
 매일 01:30 ── ApmRetentionJob ── 파티션마다 ApmArchiveDropGate.mayDrop(table, day) 확인 (§5)
```

### 4.2 아카이브 단위 — 왜 "(데이터셋, 날짜)"인가 [제안]

기반 문서는 "하루 = ZIP 1개"다. APM에 그대로 쓰면 곤란하다.

| 방식 | 문제 |
|---|---|
| 하루치 전 데이터셋을 **다음 날** 한 ZIP으로 | 1h는 400일 뒤에야 지워지는데 **다음 날 이미 파일**이 생긴다(같은 데이터가 400일간 DB와 파일에 이중). 1m은 **아직 늦은 도착이 더해질 수 있는** 구간을 찍는다. 그리고 1m ZIP만 실패해도 그날 ZIP 전체가 실패다 |
| **DROP 직전에 (데이터셋, 날짜)별로** ← 채택 | 데이터가 **확정된 뒤** 한 번만 찍는다. 실패 격리가 데이터셋 단위. **게이트 조회 키와 파일 단위가 같아** 의존이 단순해진다 |

- 파일 이름: `moveseye-apm_{dataset}_{yyyy-MM-dd}.zip`, 경로 `{basePath}/apm/{dataset}/{yyyy}/{MM}/`(초안의 `layout` 기본값 승계).
- ⚠️ 감사인에게 "그날 전부"를 한 번에 넘기기엔 불편하다 → 목록에서 **날짜로 묶어 다중 다운로드**(공통 화면 기능)로 보완.

### 4.3 대상 날짜 산정 — "곧 DROP될 날짜"

```
dropDay(D) = D + retentionDays + 1                    (§1.3)
오늘 T에 내보낼 날짜 = { D | dropDay(D) − T ≤ leadDays  ∧  OK 행 없음  ∧  파티션이 아직 존재 }
```

- `leadDays` 기본 **2** → 1m의 D일은 **D+6에 첫 시도**, D+7에 재시도, D+8 01:30에 (성공했으면) DROP. 실패해도 **DROP 전 재시도 2회**가 있다.
- 🔴 `leadDays`를 **보존 일수 이상으로 두면 안 된다**(아직 닫히지 않은 날짜를 찍는다). 저장 시 `1 ≤ leadDays ≤ min(retention) − 1` 검증.
- **파티션이 이미 없는 날짜**(기능을 켜기 전 DROP됨)는 `SOURCE_EXPIRED`로 **목록에 표시만** 하고 만들지 않는다(기반 문서 gaps 개념). 켠 첫날 "과거 N일은 이미 사라졌다"가 화면에 보여야 한다.
- **첫 활성화 백필**: 켜는 순간 보존 기간 안의 모든 날짜가 대상이 되면 1h만 400개다 → `backfill: none | all` 옵션, 기본 **none**(앞으로 DROP될 날짜만). `all`은 시간 예산 안에서 며칠에 나눠 돈다.

### 4.4 옵션 전체 — 초안 대비 보정

🔴 **경로는 `scheduler_setting.options`에 두지 않는다** [코드 근거]: `SchedulerSettingService.update`는 **job별 옵션을 검증하지 않고**(`logKeep` 클램프만) `SchedulerSetting.apply`가 **options를 통째로 교체**한다. 설정 › 스케줄러 공용 폼에서 `basePath`를 고치면 §7의 검증을 **전부 우회**한다. → 경로·대상·마스킹은 **공통 아카이브 설정 저장소 + 전용 검증 EP**, 스케줄러 옵션에는 **튜닝 값만** 둔다.

**(가) 스케줄러 쪽 — `scheduler_setting` job_key `apm_archive`**

| 항목 | 기본 | 비고 |
|---|---|---|
| `enabled` | **false** | 🔴 기본 꺼짐 — 켜는 순간 고객 디스크를 쓴다. ⚠️ 이 스위치만 켜고 경로가 없으면 "skipped: no basePath" |
| 주기 | `daily 00:50` | 초안 00:30 → **00:50으로 보정**: 00:30은 `apm_partition_maintain`과 겹친다. 01:30 보존 전 40분 여유. 🔴 **게이트가 있으므로 순서는 정합성이 아니라 "같은 날 DROP되느냐"의 문제**다(초안의 🔴를 ⚠️로 격하) |
| `options.leadDays` | 2 | 초안 `lookbackDays`를 대체(§4.3 — "며칠 전을" 대신 "DROP 며칠 전에") |
| `options.maxRunMinutes` | 20 | 🔴 **[코드]** 리스 TTL 30분·heartbeat 없음 → 넘기면 다중 노드에서 **같은 잡이 겹쳐 돈다**. 예산을 TTL보다 짧게 |
| `options.fetchSize` | 10,000 | JDBC 커서 스트리밍 단위 — 메모리에 모으지 않는다 |
| `options.logSuccess`/`logKeep` | true / 90 | **[코드]** 기본 정책은 "실패만 30건"(`SchedulerRunLogPolicy.DEFAULT`) — 아카이브는 성공 요약이 곧 결과라 **정책 기본값에 등록** 필요 |
| 라이선스 | `requiresActiveLicense=false` | §5.6 |

**(나) 아카이브 설정 — 공통 기반 저장소(소스별 1행)**

| 옵션 | 뜻 | 기본 | 비고 |
|---|---|---|---|
| `basePath` | 🔴 고객 입력 경로(로컬/NFS 마운트) | 없음(필수) | §7 검증. 공통 기반이면 **자빅스와 같은 루트** 아래 `apm/`, `zabbix/`로 나누는 안 권고 |
| `targets[]` | 내보낼 데이터셋 키 | `[]` | 비면 아무것도 안 한다. 아래 표 |
| `format` | 데이터셋별 고정 | — | 🔴 **사용자 선택으로 두지 않는다**(§6.1). 초안의 `csv/jsonl/parquet` 선택지 폐기 |
| `compression` | `gzip` | 고정 | 초안 `none` 선택지 폐기 — 1m 원문은 하루 수 GB(§6.2) |
| `fileSizeLimitMb` | 1,024 | | 넘으면 `data/*.partNN.csv.gz` 분할(기반 문서는 2GB — ZIP64 회피 동일 취지) |
| `minFreeSpaceGb` | 10 | | 🔴 **내보내기 전 예상 크기 + 이 값** 이상이어야 시작(§7.3) |
| `archiveRetentionDays` | 0(무기한) | | 초안 `localRetentionDays` 개명 — 소스 보존과 혼동 방지. 만료 삭제는 공통 `archive_cleanup`(기반 §4.1)이 `RETENTION_EXPIRED`로 |
| `maskRawText` | **true** | | §6.5. 끄면 WARN + 감사 로그 |
| `onFailure` | `skipDrop` | | `skipDrop` \| `continue`. 🔴 `continue`로 바꾸면 **감사 로그 + 화면 경고 배너 고정** |
| `maxHoldDays` | 7 | | §5.5 — 보류가 이만큼 쌓이면 무엇을 할지. **결정 필요(Q2)** |
| `backfill` | `none` | | §4.3 |

**(다) 데이터셋 키** — 초안 표 보정

| 키 | 원본 | 보존 | 형식 | 1차 | 비고 |
|---|---|---|---|---|---|
| `metric1m` | `apm_metric_1m` | 7일 | CSV.gz | ✅(옵트인) | 인스턴스 축이 남은 유일한 해상도. 🔴 **가장 크다**(§6.2) |
| `metric5m` | `apm_metric_5m` | 30일 | CSV.gz | ✅ | |
| `metric1h` | `apm_metric_1h` | 400일 | CSV.gz | ✅ **권장 기본** | 작고 장기 추세의 최종본 |
| `span` | `apm_span` | 7일 | **JSONL.gz** | ✅(옵트인) | 🔴 attrs·events·links jsonb. 원문 SQL 가능성(§6.5). **용량 미측정** |
| `traceSummary` | `apm_trace_summary` | 7일 | CSV.gz | ✅ | 초안의 `span/traceSummary` 묶음을 **분리** — 요약만 원하는 수요가 크고 작다 |
| `serviceEdge5m`·`dependency5m`·`dbQuery5m`·`messaging5m` | 각 `_5m` | 30일 | CSV.gz | ✅ | 초안에 없던 것 — 서비스 맵·외부 의존 이력 |
| `errorGroup1h` | `apm_error_group_1h` | 90일 | CSV.gz | ✅ | 그룹 **본체는 사전(§6.3)으로** 같이 싣는다 |
| `sloSnapshot` | `apm_slo_snapshot` | 400일 | CSV.gz | ✅ | DELETE 대상이지만 **`day` 단위로 자를 수 있다** → 게이트 적용 가능(§5.3) |
| `errorGroup`·`dbQueryGroup` | 그룹 본체 | 90일(가변) | — | ❌ **단독 데이터셋 아님** | 🔴 `last_seen_at`이 밀리는 가변 행이라 "그날 치"가 없다 → 자식 데이터셋의 **사전**으로만 싣는다 |
| `rum*` | RUM 6종 | 30/7일 | CSV.gz / JSONL.gz | ⏸ 2차 | ⚠️ 보존이 **하드코딩**이라 게이트 연결 시 옵션화가 먼저 |
| `jobRun`·`deployment` | | 90/400일 | | ⏸ 2차 | 수요 확인 후 |

---

## 5. 🔴 DROP 게이트 — `onFailure: skipDrop`을 성립시키는 방법 (이 설계의 가장 무거운 지점)

### 5.1 문제

`apm_retention`은 날짜만 보고 지운다. `apm_archive`가 실패한 날짜를 `apm_retention`이 알 방법이 **지금은 없다**(§1.3). 알게 하려면 **배치 사이에 읽기 의존**이 생긴다.

### 5.2 선택지

| 안 | 내용 | 판정 | 이유 |
|---|---|---|---|
| **A. 잡 실행 이력 조회** | `apm_retention`이 `scheduler_run_log`에서 `apm_archive`의 최근 성공을 본다 | ❌ | **[코드]** ① 기본 정책이 **실패만 기록**(성공 행이 아예 없을 수 있다) ② `logKeep=0`이면 **아무것도 안 남는다** ③ 보관이 job당 최대 1,000행으로 **잘린다** ④ 요약이 500자 **자유 문자열** ⑤ 단위가 "실행"이지 "(데이터셋, 날짜)"가 아니다 — "D일 1m이 보관됐나"에 답할 수 없다. 로그는 원장이 아니다 |
| **B. 단일 배치로 합치기** | `apm_retention` 안에서 "내보내기 → 성공 시 DROP" | ❌ | ① 보존은 **라이선스·디스크와 무관하게 반드시 돌아야** 하는데 아카이브(디스크 가득·NFS 끊김)의 실패가 보존 전체를 끌고 들어간다 ② **[코드]** 리스 TTL 30분·heartbeat 없음 — 1m 하루치 내보내기가 길어지면 실행 중 잠금을 잃고 **다른 노드가 같은 보존을 시작**한다 ③ 자빅스 소스와 기반을 공유할 수 없다 ④ 주기를 따로 못 둔다 |
| **C. 아카이브 원장 + 게이트 인터페이스** ← **채택** | `archive_file`(공통 원장)의 `(source, dataset, period_day, status=OK)`를 `apm_retention`이 **파티션마다** 조회 | ✅ | 원장이 **정확히 게이트가 묻는 질문의 모양**이다. 두 배치는 서로를 호출하지 않고 **데이터로만** 만난다(롤업 워터마크가 `apm_setting`에 있는 것과 같은 관용구). 실패가 서로에게 번지지 않는다 |
| D. 아카이브가 DROP 허가 목록을 쓴다 | 성공 시 `apm_drop_permit(table, day)` 행을 쓰고 보존은 허가가 있어야 지움 | △ | C와 같은 효과지만 원장과 **두 벌의 진실**이 생긴다. 파일을 수동 삭제·SUPERSEDED 했을 때 허가를 누가 거두나 |

### 5.3 채택안 상세 [제안]

```java
// premium/apm/core/batch/archive/ApmArchiveDropGate  (보존·아카이브가 함께 쓰는 판정 한 곳)
public interface ApmArchiveDropGate {
    /** 이 테이블의 이 날짜 파티션을 지워도 되는가. */
    Decision mayDrop(String table, LocalDate day);
    record Decision(boolean allowed, String reason) {}  // reason: DISABLED | NOT_TARGET | ARCHIVED | CONTINUE_POLICY | HELD | HOLD_EXPIRED
}
```

**판정 순서** (위에서 처음 걸리는 것)

| # | 조건 | 결과 | 이유 |
|---|---|---|---|
| 1 | 아카이브 꺼짐 | 허용(`DISABLED`) | 🔴 **꺼진 설치본의 동작은 오늘과 한 글자도 달라지면 안 된다** |
| 2 | 테이블이 `targets`에 없음 | 허용(`NOT_TARGET`) | |
| 3 | 원장에 `(APM, dataset, day, OK)` 있음 **그리고 파일 실물 존재** | 허용(`ARCHIVED`) | 🔴 **실물 확인까지 한다** — 누가 화면 밖에서 파일을 지웠으면 OK 행만 보고 DROP하는 순간 둘 다 사라진다 |
| 4 | `onFailure=continue` | 허용(`CONTINUE_POLICY`) + WARN | 사용자가 명시적으로 고른 손실 |
| 5 | 보류 일수 > `maxHoldDays` | Q2 결정에 따름(`HOLD_EXPIRED`) | §5.5 |
| 6 | 그 밖 | **거부**(`HELD`) | skipDrop |

**구현 접점**

- `ApmPartitionService.dropExpired(table, retentionDays)`에 **판정 함수를 받는 오버로드** 추가: `dropExpired(table, retentionDays, Predicate<LocalDate>)`. 지금도 파티션을 **날짜별로 하나씩** 도는 루프라 끼울 자리가 정확히 있다 [코드 223~237행]. 기존 시그니처는 "항상 허용"으로 위임 → 호출자 무변경.
- `ApmRetentionService`의 `dropExpiredPartitions`·`dropExpiredTracePartitions`·`dropExpiredMessagingPartitions`가 게이트를 넘긴다. `deleteOldSloSnapshots`는 **날짜 목록을 먼저 뽑아 허용된 날짜만** 지우도록 바꾼다.
- 🔴 **게이트 조회 자체가 실패하면(DB 오류) 거부 쪽으로 넘어진다(fail-closed)** — 예외를 던져 그 단계를 실패로 기록한다. "조회 실패 = 허용"이면 장애 날에 정확히 지켜야 할 데이터가 사라진다.
- 거부된 파티션 수를 단계 요약에 싣는다: `partitions=3 held=2`. 🔴 **보류는 실패가 아니다** → 보류만 있으면 던지지 않는다(매일 실패 알람이 울리면 아무도 안 본다). 대신 화면 카드와 로그 WARN.
- 조회 비용: 파티션 수 × 인덱스 조회 1건. 하루 수십 건 — 무시 가능. 다만 판정을 **단계 시작 시 한 번에 읽어 Set으로** 들고 도는 편이 로그가 깔끔하다.

**의존 방향**: `core/batch/retention` → `core/batch/archive`(게이트 인터페이스) → 공통 `ArchiveLedger`(서비스). 🔴 **게이트는 `core`에 둔다** — 보존(core)이 메뉴 패키지를 import하면 레포 규칙상 승격 신호다(BE CLAUDE.md §0.5 ③).

### 5.4 보존 일수는 한 곳에서만 읽는다

- 아카이브의 "곧 DROP될 날짜" 계산은 **`apm_retention`의 options를 그대로** 읽어야 한다. 🔴 아카이브가 자기 기본값을 따로 들면, 관리자가 보존을 14일로 늘렸을 때 아카이브는 여전히 D+6에 찍고(손해는 없지만 낭비) — 줄였을 때는 **DROP이 아카이브보다 먼저 온다**(게이트가 막지만 매일 보류가 쌓인다).
- [제안] `ApmRetentionPolicy`(core)를 추출해 `ApmRetentionJob`·`ApmArchiveJob`·(가능하면) `ApmResolution`(A17)이 같은 값을 읽게 한다. 옵션 키 목록·기본 상수는 지금 `ApmRetentionJob`에만 있다.

### 5.5 보류가 끝없이 쌓이면 — 디스크와의 저울질

| | 계속 보류 | 기한 후 DROP |
|---|---|---|
| 데이터 | 안전 | 기한 후 소실 — **원장에 `HOLD_EXPIRED` 행으로 기록**(조용한 소실 아님) |
| DB 디스크 | 🔴 1m은 하루 약 **9.6 GB**(R3: 1,404만 행 × 686B)씩 계속 는다 → 디스크가 차면 **수신 적재 자체가 실패**(모든 APM 데이터 손실) | 상한이 있다 |
| 판정 | ⚠️ 아카이브 경로가 며칠 끊긴 것을 아무도 못 보면 DB가 먼저 죽는다 | ⚠️ 감사 목적이면 "기한 후 DROP"이 규정 위반일 수 있다 |

**권고**: `maxHoldDays=7` 후 DROP + `HOLD_EXPIRED` 기록 + 보류 발생 **첫날부터** 화면 배너·알람. 금융권처럼 보관이 **의무**인 설치본은 `0`(무기한 보류)로 둘 수 있게 한다 → **Q2**.

### 5.6 라이선스 — `requiresActiveLicense=false`

- **[코드]** 규칙은 "수집 소스에 나가는가"다. 아카이브는 **우리 DB만 읽는다** → false 쪽.
- 🔴 true로 두면: 만료 중 아카이브가 멈춤 → 게이트가 매일 보류 → 만료가 `maxHoldDays`를 넘기면 **보존이 지우거나(소실)**, 무기한이면 **디스크가 찬다**. 롤업 A5와 같은 구조의 사고다.

### 5.7 두 잡이 겹칠 때

- **[코드]** 리스는 `job_key` 단위라 `apm_archive`와 `apm_retention`은 **동시에 돌 수 있다**.
- 겹쳐도 안전하다: 아카이브가 D일을 쓰는 중이면 원장에 OK가 아직 없다 → 게이트가 보류 → 다음 날 DROP. **손해는 하루 지연뿐.**
- 🔴 반대 방향은 막아야 한다: 보존이 D일을 DROP한 **직후** 아카이브가 D일을 읽으면 "파티션 없음"이다 → 그 경우 `SOURCE_EXPIRED`로 기록하고 **FAILED로 두지 않는다**(재시도해도 영원히 실패). 게이트가 있는 한 이 경로는 `continue`·`HOLD_EXPIRED`에서만 생긴다.

---

## 6. 파일 내용

### 6.1 형식 비교

| 형식 | 장점 | 단점 | 이 설계 |
|---|---|---|---|
| **CSV.gz** | 엑셀·텍스트 도구로 연다(기반 D3). 기반과 같은 작성기 | 🔴 중첩(jsonb·배열)을 **문자열 칸**에 넣어야 한다. RFC 4180 이스케이프 필수 | **평평한 데이터셋 전부** |
| **JSONL.gz** | 중첩 그대로. 다시 넣기(restore) 쉽다 | 엑셀로 못 연다 | **`span`** (attrs·events·links가 본체) |
| Parquet | 열 압축·스키마 | 🔴 hadoop 계열 의존성이 설치형 번들을 키운다(기반 D3 거부 사유와 동일). **[코드]** 현재 CSV·압축 라이브러리 의존도 없다 | ❌ |

- 🔴 **형식을 사용자 선택으로 두지 않는다.** 같은 데이터셋이 날짜마다 다른 형식이면 restore·검증·감사 설명이 전부 두 갈래가 된다.
- CSV 칸 규칙: `dims`는 **canonical JSON 문자열 그대로**(키 정렬 — 이미 `dims_hash`의 원문), `hist_counts`는 `[1,2,…]` JSON 배열, NULL은 **빈 칸**, 실수는 `Double.toString` 왕복 가능한 표기. **[코드]** CSV 라이브러리가 없으므로 🔴 **검증된 CSV writer를 도입하거나 직접 짠 것에 RFC 4180 왕복 테스트**를 붙인다(기반 문서 경고와 동일 — route·SQL에 따옴표·개행이 실제로 온다).

### 6.2 용량 — ⚠️ 전부 추정

| 데이터셋 | 행/일 (R3 규모) | 비압축 추정 | gzip 추정 | 근거 |
|---|---|---|---|---|
| `metric1m` | 1,404만 | 행당 약 250B → **3.5 GB** | 약 **0.35~0.7 GB/일** | R3 행 수 × 칸 폭 추정, 압축률 5~10배 가정 |
| `metric5m` | 94만 | 약 0.23 GB | 약 30~50 MB/일 | |
| `metric1h` | 7.8만 | 약 20 MB | 약 3 MB/일 → **연 1 GB** | |
| `span` | **[확인 필요]** | — | — | 스팬 용량 실측 없음(R3은 메트릭만). **착수 전 실측 필수** |

→ 기본 권장 대상은 **`metric1h`·`sloSnapshot`·`traceSummary`**(작고 가치 큼), `metric1m`·`span`은 **용량 안내 후 옵트인**. 화면이 켜기 전 "하루 약 N GB(최근 7일 실제 행 수 기준)"를 보여 준다 — `pg_class.reltuples`/파티션 크기로 계산 가능.

### 6.3 🔴 자기 완결 — 사전(dictionary)을 같이 싣는다

지표 행에는 `service_id`·`bounds_id`만 있고, `errorGroup1h`에는 `group_id`만 있다. 파일만 남고 DB가 사라지면 **숫자가 무엇인지 알 수 없다**.

| 사전 파일 | 원본 | 실리는 데이터셋 |
|---|---|---|
| `dict/services.csv.gz` | `apm_service`(id·service_name·env·당시 state) | 전부 |
| `dict/hist_bounds.csv.gz` | `apm_hist_bounds`(id·bounds·family) | 지표·버킷 계열 — 🔴 **family(단위)가 없으면 ms/초를 1000배 틀리게 읽는다** |
| `dict/error_groups.csv.gz` | `apm_error_group`(id·message_norm·sample_stack…) | `errorGroup1h` — 🔴 마스킹 대상(§6.5) |
| `dict/db_query_groups.csv.gz` | `apm_db_query_group`(id·query_norm…) | `dbQuery5m` |

- 사전은 **그 파일에 나온 id만** 싣는다(전체 덤프 아님).
- 사전은 **내보내기 시점의 값**이다 — 서비스 이름이 그 뒤에 바뀌어도 파일은 당시 이름을 말한다. manifest에 `dictionaries.capturedAt` 기록.

### 6.4 restore(되살리기) — 1차 범위 밖

| | 1차에 넣으면 | 1차에서 빼면 |
|---|---|---|
| 무게 | 스키마 버전 관리·임시 테이블·APM 전용 조회 화면(기반 P2의 host·item_key 모양 테이블은 APM에 안 맞는다) — **몇 배** | 파일 생성·목록·다운로드만 |
| 대비 | — | 🔴 **되살릴 수 있게 써 둔다**: `schemaVersion`·원본 컬럼 이름 그대로·사전 동봉·JSONL은 원행 1:1. 나중에 restore를 붙여도 옛 파일이 읽힌다 |

권고: **제외**(초안·기반 문서와 동일). 요구가 확정되면 공통 기반 P2를 **소스별 복원기 SPI**로 재설계(Q5).

### 6.5 마스킹 — `maskRawText` 기본 true

| 위치 | 원문이 있을 수 있나 | 처리 |
|---|---|---|
| `apm_span.attrs["db.query.text"]` | **[코드]** 있다 — `keep_raw_sql=true`면 원문 저장 | `ApmSqlMasker`(trace/ingest) 재사용해 치환 |
| `apm_error_group.sample_stack`·`message_norm` | 스택·메시지 원문 | 스택 제거 또는 첫 줄만 [제안 — 규칙 결정 필요] |
| `apm_db_query_group.query_norm` | 정규화된 SQL(리터럴 제거) | 그대로(이미 정규화) — **확인 필요**: 정규화가 모든 리터럴을 지우는지 |
| exemplar | **[코드]** traceId·값만 저장 — 속성 없음 | 그대로 |

- 🔴 파일은 DB보다 통제가 약하다(복사·반출이 흔적 없이 된다). 끄려면 명시적으로 + WARN + 감사 로그(`keep_raw_sql`과 같은 태도).
- 🔴 **manifest에 `masked: true|false`를 기록**한다 — 파일만 보고 원문 포함 여부를 알 수 있어야 한다.
- ⚠️ `ApmSqlMasker`는 premium 안에 있다. 공통 기반이 쓰려면 A1 위반 → **APM 소스가 마스킹한 뒤 작성기에 넘긴다**(작성기는 마스킹을 모른다).

### 6.6 manifest — 기반 §3.2에 더할 것

```jsonc
{
  "schemaVersion": 1,
  "source":  { "type": "APM", "dataset": "metric1m", "table": "apm_metric_1m", "dbSchemaVersion": "V59" },
  "period":  { "day": "2026-09-08", "from": "…Z", "to": "…Z", "timezone": "Asia/Seoul" },  // 🔴 파티션 날짜의 시간대
  "counts":  { "sourceRows": 14040000, "writtenRows": 14040000 },
  "masked":  true,
  "dictionaries": { "capturedAt": "…Z", "files": ["dict/services.csv.gz", "dict/hist_bounds.csv.gz"] },
  "retention": { "sourceRetentionDays": 7, "scheduledDropDay": "2026-09-16" },
  "files": [ … ], "gaps": [], "signature": null
}
```

---

## 7. 🔴 경로 검증

### 7.1 `normalizeQueueDir` — 코드가 실제로 하는 일 [코드]

`ApmCollectorConfigGenerator.normalizeQueueDir(String raw, Os os)` (267행):

| 규칙 | 있다/없다 |
|---|---|
| 비었으면 프로퍼티 기본값 | ✅ |
| trim | ✅ |
| 개행(`\n`·`\r`) 금지 | ✅ |
| 큰따옴표(`"`) 금지 | ✅ |
| 자리표시(`${`) 금지 | ✅ |
| 길이 ≤ 512 | ✅ |
| **절대 경로만 허용** | ❌ **없다** |
| **`..` 금지** | ❌ **없다** |

🔴 **백로그·초안의 "queueDir 정규화 규칙(절대 경로·`..` 금지) 재사용"은 사실과 다르다.** 그 메서드는 **yaml에 안전하게 박기 위한 문자 규칙**이고, 경로는 **고객 서버**의 것이라 우리 서버가 검사할 수 없어 경로 의미 검사를 하지 않는다. 또한 **package-private 인스턴스 메서드**이고 수집기 전용 오류 코드(`APM_COLLECTOR_CONFIG_INVALID`)를 던진다 — 그대로 부를 수 없다.

### 7.2 설계 — 공통 `ArchivePathPolicy` [제안]

**재사용할 것**: 문자 규칙(개행·따옴표·`${`·길이 512)을 **작은 공용 함수로 추출**해 두 곳이 같이 쓴다(수집기 쪽 동작은 불변).

**추가할 것** (아카이브는 **우리 서버**에 쓰므로 실제로 검사할 수 있고, 해야 한다)

| # | 규칙 | 이유 |
|---|---|---|
| R1 | `Path.isAbsolute()` | 상대 경로는 작업 디렉터리(컨테이너 `/app`)에 따라 달라진다 |
| R2 | 경로 **세그먼트에 `..` 금지**(정규화 전 원문 기준) + `normalize()` 결과가 원문과 같을 것 | 우회 표기 차단 |
| R3 | 🔴 **허용 루트 목록 안**: `app.archive.allowed-roots`(`*Properties`, 설치 시 지정) 아래만 | 관리자 화면 하나로 서버의 아무 경로에나 쓰게 두면 **설정 오류 한 번이 시스템 파일 덮어쓰기**다. 레포 규칙("설치본마다 달라야 하는 값은 Properties")과도 맞다 |
| R4 | `toRealPath()`(심볼릭 링크 해석) 결과도 허용 루트 안 | 링크로 루트 탈출 차단 |
| R5 | 제어문자·NUL 금지, Windows 예약 이름(`CON` 등)·`:` 오용 금지 | OS 차이 |
| R6 | 기존 `app` 산출 경로(`LOG_PATH`·빌드 디렉터리)와 겹치지 않을 것 | 로그 롤링이 아카이브를 지우는 사고 방지 |

### 7.3 실검사 — "연결 테스트" 버튼과 매 실행 사전검사

| 검사 | 방법 | 실패 시 |
|---|---|---|
| 존재·디렉터리 | 없으면 생성 시도(부모는 있어야 함) | 저장 거부 |
| **쓰기 권한** | 🔴 `.probe-<uuid>` 파일 생성 → 쓰기 → `fsync` → 재읽기 → 삭제 | `Files.isWritable`만으로는 NFS·ACL에서 거짓 양성이 난다 |
| **원자적 이동 지원** | 같은 디렉터리에서 `ATOMIC_MOVE` 시도 | ⚠️ 미지원(일부 NFS)이면 경고 + 복사 후 검증 방식으로 강등 |
| **여유 공간** | `FileStore.getUsableSpace()` ≥ 예상 크기(§6.2) + `minFreeSpaceGb` | 실행 중단 + 실패 기록(게이트가 DROP을 막는다) |
| **컨테이너 볼륨** | 🔴 컨테이너 안이면 경로가 **마운트 지점 아래인지** 확인(`/proc/self/mountinfo`) | 경고 배너: "이 경로는 컨테이너가 재생성되면 사라집니다" — **[확인 필요]** 판정 신뢰도(overlayfs 루트와 bind mount 구분)는 착수 시 실측 |

- 결과를 화면에 그대로 보여 준다(기반 §7 상태 카드 자리).

### 7.4 🔴 컨테이너 배포 — 볼륨 필수

- **[코드]** `bitbucket-pipelines.yml`의 BE 실행은 `docker run -d --name "moves-be-spring" --restart always --env-file /home/.env -p 80:3000 moves-be-spring:latest` — **`-v`가 없다.** 이 상태로 아카이브를 켜면 **컨테이너 재생성(=매 배포) 때 파일이 전부 사라진다.** AI 산출물 유실(2026-08-31)과 같은 사고다.
- 배포 스크립트에 `-v /data/moveseye-archive:/data/archive` 같은 마운트 + `ARCHIVE_ALLOWED_ROOTS=/data/archive`를 함께 넣는다. 설치 가이드에도 명시.
- 🔴 이것은 **코드가 막을 수 없는 운영 요건**이다 → §7.3의 볼륨 판정 경고가 유일한 안전망.

### 7.5 🔴 S3 전제 금지

온프렘 설치형이다. **로컬 디렉터리 또는 OS가 마운트한 NFS/SMB 경로만** 받는다. 원격 스토리지 SDK(S3·Azure)는 1차에 넣지 않는다 — NAS 마운트로 우회 가능(기반 Q5와 동일).
⚠️ NFS는 **쓰기 지연·잠금·원자적 이동**이 로컬과 다르다 → §6 검증(재읽기 SHA-256)을 NFS에서도 반드시 돌린다.

---

## 8. 실패·재시도·멱등성

| 상황 | 동작 | 원장 |
|---|---|---|
| 이미 OK | 건너뜀(멱등) | — |
| 이전 FAILED | 다음 회차 재시도(`leadDays` 창 안에서 매일) | 새 시도 결과로 **새 행**(FAILED 이력 보존) |
| 쓰기 중 예외 | `.partial` 삭제, 다음 항목 계속 | FAILED(사유) |
| 검증 실패(행 수 불일치·해시 불일치) | 🔴 `.partial` 삭제 | FAILED(`VERIFY_MISMATCH`) — **절대 OK로 두지 않는다** |
| 여유 공간 부족 | 시작 전 전체 중단, 던짐 | 해당 항목 FAILED(`NO_SPACE`) |
| 파티션 없음 | 재시도 안 함 | `SOURCE_EXPIRED` |
| 시간 예산 초과 | 남은 항목 다음 회차로 | 없음(요약에 `deferred`) |
| 프로세스 크래시 | 다음 회차 시작 시 **`.partial` 청소** | 진행 중 행이 있었다면 FAILED(`ABANDONED`)로 정리 |
| 수동 재생성(`POST /archives/run`) | 새 파일 → 성공 시 기존 OK를 `SUPERSEDED`로 **같은 트랜잭션에서** 전이 | 부분 유니크(§3.2)가 OK 2개를 막는다 |

**일관성**
- 🔴 `count(*)`와 스트리밍을 **같은 `REPEATABLE READ` 읽기 전용 트랜잭션**에서 한다 — 사이에 행이 더해지면 "행 수 일치"가 우연이 된다. DROP 직전 날짜라 쓰기는 사실상 없지만, 게이트 `continue`·수동 실행에서는 이 보장이 필요하다.
- ⚠️ 긴 읽기 트랜잭션은 VACUUM을 붙잡는다 → 데이터셋·날짜마다 트랜잭션을 끊는다(하루 1m이 가장 길다 — **소요 실측 필요**).
- 커서는 `fetchSize` 스트리밍, 결과를 메모리에 모으지 않는다(기반 §4.2와 동일).

**실행 요약 형식**(다른 배치와 같은 한 줄): `ok=5 failed=1 expired=0 deferred=2 rows=15.2M bytes=812MB held=0`. 실패가 있으면 **던진다**(false-green 금지) — 단 성공 몫을 메시지에 싣는다(`ApmRetentionJob`과 같은 관용구).

---

## 9. 화면·API — 공통 화면에 얹는 것

**설정 › 데이터 아카이빙**(기반 §7) — APM이 더하는 것만:

| 자리 | 내용 |
|---|---|
| 목록 | **소스 필터**(자빅스/APM) · 데이터셋 컬럼 · 날짜별 묶음 다운로드 |
| 상태 카드 | 🔴 **"다음 정리까지 남은 시간"**(01:30) · 🔴 **"보류 중인 정리 N건 / 가장 오래된 보류 D일째"** · 경로 실검사 결과 · 볼륨 경고 · 여유 공간 |
| APM 대상 탭 | 데이터셋 체크 + **하루 예상 용량**(§6.2) + 소스 보존 일수(읽기 전용, `apm_retention`에서) · `onFailure`·`maxHoldDays`·`maskRawText` |
| 경고 배너 | `onFailure=continue`·`maskRawText=false`·보류 발생·볼륨 미마운트 시 고정 |

API 추가(공통 `/archives` 외): `GET/PUT /archives/sources/apm/settings`(검증 포함) · `POST /archives/sources/apm/path-check` · `GET /archives/sources/apm/holds`(보류 목록).

**권한** [제안]: 기반 문서대로 **아카이브 전 EP 관리자 전용**(`archive` 권한). APM 쪽 `apm.edit`로 위임하지 않는 이유 — 경로 설정은 **서버 디스크에 쓰는 권한**이고, 다운로드는 감사 데이터 반출이다. ⚠️ 반대로 APM 보존 옵션은 지금 **설정 › 스케줄러(관리자)** 에서 바뀐다 — 둘 다 관리자라 축이 맞는다.

---

## 10. 미결 질문 (사용자 결정 필요) — ✅ 착수 조건 5개(Q1·Q2·Q3·Q7·Q8) + Q4·Q11 결정 완료(2026-10-01). 잔여 Q5·Q6·Q9·Q10은 권고대로(restore 제외·스팬 옵트인·파일 보존 무기한·RUM 2차)

| # | 질문 | 선택지 / 기본 제안 |
|---|---|---|
| **Q1** | 보관 **의무**가 있는 고객이 실재하나(금융권) · 400일로 부족한 축은 무엇인가(지표/트레이스/감사 로그) | ✅ **결정 2026-10-01(사용자): A안 — 보관 의무 고객 없음을 전제.** 현대캐피탈 13건에 APM 보관 요구 없음(전부 자빅스 인프라 축). 기본 대상 = SLO 일 스냅샷·1h 지표·트레이스 요약, **1m·스팬은 옵트인**. 400일 부족 축은 현재 없음(SLO 증빙 기간이 필요해지면 스냅샷 보존 일수만 늘린다). 되돌릴 길(옵트인·`maxHoldDays=0`)을 열어 두는 조건으로 채택 |
| **Q2** | 보류가 쌓이면 | ✅ **결정 2026-10-01(사용자): `maxHoldDays=7` 후 DROP + `HOLD_EXPIRED` 기록, 보류 첫날부터 화면 배너·알람(기존 APM 서비스 알람 이벤트 통로), 설정 0 = 무기한 보류** |
| **Q3** | 공통 기반을 **누가 먼저** 만드나 | ✅ **결정 2026-10-01(사용자): ZM-156이 첫 소비자로 공통 기반(원장·writer·경로 정책·목록 화면)까지 함께 만든다.** 별도 기반 이슈 없음. 자빅스 아카이빙(I7)은 나중에 이 기반을 가져다 쓴다 |
| **Q4** | 아카이브 단위 | ✅ **결정 2026-10-01(사용자): (데이터셋, 날짜) — DROP 직전에 데이터셋별 ZIP 하나.** 목록 화면 날짜 묶음 다중 다운로드로 보완 |
| **Q5** | restore 1차 포함 | **제외** ← 권고(되살릴 수 있게 쓰기만) |
| **Q6** | 스팬 아카이브 | 용량 실측 전엔 옵트인만 ← 권고. 실측이 착수 조건 |
| **Q7** | `app.archive.allowed-roots` 허용 루트 강제 | ✅ **결정 2026-10-01: 강제**(권고 채택, 사용자 위임) |
| **Q8** | 감사 로그 | ✅ **결정 2026-10-01: 공통 감사 체계는 선행하지 않는다 — 1차는 ZM-154 내보내기와 같은 로그 기반(`[APM-ARCHIVE]`, 사용자 입력 이스케이프)으로 두고, 공통 감사 체계가 생기면 그쪽으로 옮긴다**(사용자 위임) |
| **Q9** | 파일 보존 기간 기본값 | 무기한(0) — 기반 문서는 5년 제안. 소스 간 통일할지 |
| **Q10** | RUM 대상 | 2차 ← 권고. 보존 하드코딩을 옵션화한 뒤 |
| **Q11** | 자빅스 아카이빙이 premium인가 | ✅ **결정 2026-10-01(사용자): premium 아님(기본 기능).** 따라서 공통 기반은 `premium/` 밖 공용 패키지(`common/archive`, 가칭)에 둔다 — APM 소스만 `premium/apm` |

---

## 11. 단계

| 단계 | 범위 |
|---|---|
| S0 | Q1·Q2·Q3·Q7·Q8 결정. **스팬·1m 내보내기 소요·용량 실측**(dev 5433) |
| S1 | 공통 기반: `archive_file`(확장 스키마) · `ArchiveWriter` · `ArchivePathPolicy` · `ArchiveLedger` · 감사 |
| S2 | `ApmArchiveDropGate` + `dropExpired` 오버로드 + `ApmRetentionPolicy` 추출 — 🔴 **꺼진 상태에서 기존 동작 불변 테스트가 먼저** |
| S3 | `ApmArchiveJob` + `ApmArchiveSource`(metric1h·traceSummary·sloSnapshot 우선) + 사전 동봉 |
| S4 | 공통 화면에 APM 소스·상태 카드·대상 탭 |
| S5 | metric1m·span 옵트인 + 마스킹 |
| S6 | 실측: 게이트 거부→다음 날 DROP, 경로 실검사(NFS·컨테이너 볼륨), 크래시 후 `.partial` 청소, 다중 노드 겹침 |

---

## 12. 리스크

1. 🔴 **게이트를 우회하는 DROP 경로**: 누가 `ApmPartitionService.dropExpired(table, days)`(판정 없는 시그니처)를 새로 부르면 게이트가 무력화된다 → 아카이브 대상 테이블은 판정 없는 호출을 **테스트로 금지**(ArchUnit 또는 호출처 고정 테스트).
2. 🔴 **시간대 불일치**: 파티션 날짜(시스템 기본)와 원장 `period_day`가 다른 시간대면 엉뚱한 날을 "보관됨"으로 읽어 **보관 안 된 날을 DROP**한다.
3. 🔴 **컨테이너 볼륨 미마운트** — 코드로 못 막는다(§7.4).
4. ⚠️ **1m 내보내기 소요 미측정** — 하루 1,400만 행이 `maxRunMinutes`(20분) 안에 끝나는지 모른다. 안 끝나면 이월이 쌓이고 결국 보류가 된다.
5. ⚠️ **보류 누적 → DB 디스크** — §5.5.
6. ⚠️ **리스 TTL 30분·heartbeat 없음**(§4.4) — 시간 예산으로만 방어.
7. ⚠️ **사전의 시점**: 서비스가 삭제(CASCADE)된 뒤 내보내면 사전에 이름이 없다 → 사전에 없는 id는 `"<deleted:ID>"`로 적고 manifest에 기록.
8. ⚠️ `apm_error_group`·`apm_db_query_group` 본체는 **단독 보관되지 않는다** — 자식 데이터셋을 켜지 않으면 본체 원문은 90일 뒤 사라진다.

---

## 근거 위치

| 파일 | 본 것 |
|---|---|
| `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionJob.java` | 단계 구성·옵션 키·기본값(시드에 없는 키)·`step()` 실패 격리·마지막에 던짐·라이선스 false |
| `.../core/batch/retention/ApmRetentionService.java` | 테이블별 DROP/DELETE, RUM 보존 하드코딩, 그룹 본체 DELETE 순서, 단계별 트랜잭션 |
| `.../core/batch/partition/ApmPartitionService.java` | `dropExpired` 날짜 루프·cutoff 계산·auto-commit DROP·`PARTITIONED_TABLES`·파티션 이름 규칙 |
| `.../core/batch/rollup/ApmRollupJob.java` · `ApmRollupService.java` | A5(라이선스 false 근거)·워터마크를 `apm_setting`에 두는 관용구·`sourceRetentionDays` 사본(A17) |
| `.../core/metric/ApmResolution.java` | 보존 일수 사본 |
| `moveseye-be-spring/src/main/java/com/dmove/moveseye/scheduler/SchedulerJob.java` | `run` 실패 시 던지기 규약·`requiresActiveLicense` 기준 |
| `.../scheduler/SchedulerManager.java` | 실행 경로·라이선스 skip·리스 획득/반납·`runNow` 비동기 |
| `.../scheduler/SchedulerLeaseService.java` | job_key 단위 리스, TTL 30분, heartbeat 없음 |
| `.../scheduler/SchedulerRunLogService.java` · `SchedulerRunLogPolicy.java` · `domain/SchedulerRunLog.java` · `domain/SchedulerRunLogRepository.java` | 기본 "실패만 30건", keep 0, 1,000 상한, 요약 500자 |
| `.../scheduler/domain/SchedulerSetting.java` · `SchedulerSettingService.java` · `SchedulerSettingController.java` | options jsonb·`optionInt/Flag/Text`, job별 옵션 무검증·통째 교체, 관리자 전용 |
| `.../premium/apm/collector/config/ApmCollectorConfigGenerator.java` (267행 `normalizeQueueDir`) | 실제 규칙(개행·따옴표·`${`·512자), 절대경로·`..` 검사 없음 |
| `.../premium/apm/trace/ingest/ApmSqlMasker.java`(존재 확인) · `.../core/setting/ApmSettingService.java` | 원문 SQL 마스킹·`keep_raw_sql` |
| `src/main/resources/db/migration/V38__apm_p1.sql` | `apm_retention` 시드(옵션 5키)·`apm_partition_maintain` 00:30·메트릭 3단 스키마·DEFAULT 파티션 없음 |
| `src/main/resources/db/migration/V44__apm_trace.sql` | `apm_span`(attrs·events·links jsonb)·그룹 본체(text 원문) |
| `src/main/resources/db/migration/V39__apm_setting_updated_by.sql` | APM 감사 최소 기록·A3 |
| `src/test/java/com/dmove/moveseye/license/LicenseArchitectureTest.java` | A1·A2·A3 |
| `moveseye-be-spring/bitbucket-pipelines.yml` (37행) | BE `docker run`에 볼륨 없음 |
| `moveseye-be-spring/build.gradle.kts` | CSV·Parquet·압축 라이브러리 의존 없음 |
| `_workspace/designs/devdesign_data-archiving.md` | 공통 기반(형식·manifest·삭제 D12·실패 한도·자가진단·Spring Batch 미도입) |
| `_workspace/designs/devdesign_apm.md` §4.4 | R3 실측(행당 686B·1,404만 행/일) |
| `_workspace/planning/tasks_backlog-2026-09-16.md` §I6·§I7 · `backlog_apm-comprehension-and-ai.md` §1-5 | 이슈 정의·설정 초안 |
