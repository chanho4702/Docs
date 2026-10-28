# 설계 — 데이터 아카이빙 (감사·규제 대비 장기 보관)

- 작성일: 2026-08-31 · 상태: 초안(사용자 결정 U1~U7 반영, 미결 3건 — 전부 기본안 있음) · 구현: 0
- 🗂 **2026-09-16 백로그 등록**: `planning/sprint-zm-151-156/tasks_backlog-2026-09-16.md` **I7**. 🔴 마이그레이션 번호 V41은 낡음(현재 V58까지 사용) — 착수 시 재배정
- 관련: `devdesign_collector-engine.md`(엔진 포트) · `devdesign_apm.md`(롤업 관용구) · `devdesign_aws-status-timeline.md`(스냅샷 관용구)

---

## 0. 사용자 결정 (확정)

| # | 항목 | 결정 |
|---|---|---|
| U1 | 1차 목적 | **규제·감사용 원본 보관** (운영 화면 기간 확장 아님) |
| U2 | 대상 폭 | 카탈로그 캐노니컬 메트릭 + **사용자가 고른 추가 아이템** |
| U3 | 저장 매체 | 🔴 **DB 아님. 파일로 떨군다.** 볼 때 업로드해서 조회 |
| U4 | 해상도 | **원시(history) + 시간집계(trends) 둘 다** |
| U5 | 포맷 | **CSV.gz** (ZIP 컨테이너 안에) |
| U6 | 파일 보관 기간 | **화면에서 설정**(2026-09-16). 기본값 5년(1825일). §7 탭 ② |
| U7 | 텍스트 데이터 | **기본 포함 + 화면 스위치로 끔**(2026-09-16). `includeText` 옵션. 근거 §9 Q2 |

### 🔴 이 설계가 하지 **않는** 것

**운영 화면의 7일 조회 한계를 늘려주지 않는다.** 파일은 쿼리가 안 되므로 "30일 CPU 추이 차트"는
이 기능으로 만들어지지 않는다. 그건 별개 과제(hot 경로 = DB 롤업)로 남는다.
U1이 감사 보관이므로 일관된 선택이지만, 나중에 "왜 차트는 그대로냐"가 반드시 나올 자리다.

---

## 1. 문제 — Zabbix는 오래된 데이터를 스스로 버린다

Zabbix는 2단으로 버린다.

| 층 | 내용 | 기본 보존 |
|---|---|---|
| `history` | 원시 샘플 (수집 주기 그대로) | 아이템별 설정, **전역 override 가능** |
| `trends` | 시간당 min/avg/max (수치형만) | 아이템별 설정, **전역 override 가능** |

보존 기간이 지나면 housekeeper가 삭제한다. 감사 시점에 "작년 3월 그 서버"를 요구받으면 답이 없다.

### 1.1 실측 (2026-08-31, dev Zabbix 7.0.6 / 호스트 74대)

| 항목 | 실측값 | 의미 |
|---|---|---|
| `hk_history` / `hk_history_global` | **31d / 1(ON)** | 🔴 아이템별 설정(7d·1h·0 등)이 **전부 무시**되고 31일로 강제 |
| `hk_trends` / `hk_trends_global` | **365d / 1(ON)** | 시간집계는 1년 |
| 모니터링 아이템 | 11,679개 | |
| ├ 수치형(trends 생성) | 9,801개 | |
| └ 텍스트/char/log | 1,877개 | trends 없음 — **원시만이 유일본** |
| **실제 값이 들어오는 수치형** | **~3,303개 (34%)** | 나머지 2/3은 등록만 된 빈 껍데기 |
| **하루 실제 원시 유입** | **3,633,016 행** | float 187만 · unsigned 125만 · char 46만 · text 4.2만 · log 230 |
| 하루 실제 시간집계 | 79,267 행 | |
| **압축 후 크기** | **≈ 20 MB/일 → 7 GB/년** | CSV.gz 압축률 10배 가정 |

**이 실측이 U3(파일)을 정당화한다**: 같은 데이터를 DB에 넣으면 원시만 **연 13억 행**이다.
설치형 제품이라 고객사 DB 용량을 우리가 통제할 수 없다. 반면 파일은 7GB/년 — USB에 들어간다.

**그리고 배치 주기를 정한다**: 원시가 31일 남으므로 **일 1회로 충분**하고 30일의 복구 여유가 있다.
서버가 며칠 죽어도 복구 후 그 구간을 전부 주워올 수 있다.

🔴 단 이건 **dev 환경의 값**이다. 고객사가 override를 끄고 아이템별로 `1h`를 두면 일 1회 배치는
**그날 데이터를 통째로 놓친다**. → §4.4 보존 기간 자가진단이 필수인 이유.

---

## 2. 아키텍처 한 장

```
 ┌── 매일 새벽 (기본 03:10) ─────────────────────────────────────┐
 │  ArchiveExportJob                                             │
 │    1. 대상 해석 (카탈로그 캐노니컬 + 사용자 추가 아이템)       │
 │    2. 청크 루프: 아이템 500개 × 1시간 창  (하루 ≈ 480 콜)      │
 │    3. CSV.gz 스트리밍 기록 (메모리에 안 올림)                  │
 │    4. manifest.json + checksums.txt 생성 → ZIP 봉인            │
 └───────────────────────────────────────────────────────────────┘
                        │
                        ▼
      {archive.dir}/moveseye-archive_2026-08-30.zip     ← 파일 시스템
                        │
        DB에는 메타 한 행만 (archive_file):
        기간 · 경로 · 크기 · 행수 · SHA-256 · 상태
                        │
   ┌────────────────────┴─────────────────────┐
   │                                          │
   ▼ 목록/다운로드 화면                        ▼ 업로드 조회 (P2)
   감사인에게 zip 그대로 제출                  zip 업로드 → 검증 → 임시 테이블
                                              → 차트·표로 조회 → TTL 만료 시 삭제
```

**평소 DB 증가량 = 하루 한 행.** 데이터 본체는 전부 파일에 있다.

---

## 3. 아카이브 파일 명세

### 3.1 컨테이너

```
moveseye-archive_2026-08-30.zip
├─ manifest.json          ← 감사 보관의 본체 (§3.2)
├─ checksums.txt          ← "<sha256>  <파일명>" (sha256sum 호환 포맷)
└─ data/
   ├─ raw_float.csv.gz
   ├─ raw_unsigned.csv.gz
   ├─ raw_text.csv.gz     ← char/text/log 통합
   └─ trend.csv.gz
```

- 하루 = ZIP 1개. 이동·보관·제출이 파일 하나로 끝난다.
- `value_type`별 분할: CSV 컬럼 스키마가 달라지지 않게 하고, 부분 조회 시 불필요한 압축 해제를 피한다.
- 한 파일이 2GB를 넘으면 `data/raw_float.part01.csv.gz`로 분할(ZIP64 회피 + 취급 편의).

### 3.2 `manifest.json`

```jsonc
{
  "schemaVersion": 1,
  "product":  { "name": "moveseye", "version": "1.x.y" },
  "generatedAt": "2026-08-31T03:14:22Z",
  "source":   { "type": "ZABBIX", "url": "https://.../api_jsonrpc.php", "version": "7.0.6" },
  "period":   { "from": "2026-08-30T00:00:00Z", "to": "2026-08-31T00:00:00Z", "tz": "UTC" },
  "scope": {
    "hostCount": 74,
    "itemCount": 3421,
    "targets": [ { "kind": "CATALOG" }, { "kind": "CUSTOM", "itemKey": "pgsql.*" } ]
  },
  "counts": { "rawRows": 3633016, "trendRows": 79267 },
  "files": [
    { "name": "data/raw_float.csv.gz", "rows": 1873080, "bytes": 10485760, "sha256": "…" }
  ],
  "gaps": [
    { "from": "2026-08-30T11:00:00Z", "to": "2026-08-30T12:00:00Z",
      "reason": "SOURCE_TIMEOUT", "itemCount": 500, "detail": "history.get 3회 재시도 실패" }
  ],
  "signature": null
}
```

🔴 **`gaps`가 이 파일에서 가장 중요하다.** 배치가 못 읽은 구간을 명시하지 않으면 감사에서
"여긴 왜 비었나"에 답할 수 없고, 침묵한 공백은 은폐로 읽힌다. 청크 실패는 예외로 배치를
중단시키지 말고 **gap으로 기록하고 계속**한다(부분 성공 = `status=PARTIAL`).

🔴 `signature`는 P3. 라이선스 발급기(`moveseye-license-issuer`)의 RS256 관용구를 재사용할 수
있으나, **개인키를 제품 쪽에 두면 안 된다**는 그 저장소의 분리 원칙과 충돌한다 — 제품이 자체 서명하려면
설치본마다 키를 만들어야 하고(`CREDENTIAL_ENCRYPTION_KEY` 관용구), 그 키의 신뢰 근거를 따로 세워야 한다.
P1에서는 SHA-256 체크섬까지만 하고 서명은 미결(§9 Q4).

### 3.3 CSV 스키마

**원본 그대로 담는다.** 캐노니컬 메트릭으로 변환하지 않는다 — 변환은 이미 "가공"이고,
감사에서 원본성을 다툴 여지를 만든다. 캐노니컬 매핑이 필요하면 `canonical_metric` 컬럼을
**부가 정보로 병기**하되 비어 있을 수 있다.

`raw_*.csv.gz`
```
host,hostid,item_key,itemid,value_type,clock,clock_iso,ns,value,canonical_metric
srv-was-01,10432,system.cpu.util,45012,float,1756512000,2026-08-30T00:00:00Z,123456789,12.7,cpu.util
```

`trend.csv.gz`
```
host,hostid,item_key,itemid,clock,clock_iso,num,value_min,value_avg,value_max,canonical_metric
srv-was-01,10432,system.cpu.util,45012,1756512000,2026-08-30T00:00:00Z,60,3.1,12.7,88.4,cpu.util
```

- **시각은 UTC epoch + ISO 병기.** epoch는 기계용, ISO는 사람·감사인용. 로컬 타임존으로만 쓰면
  서머타임·서버 이전 후 재해석이 불가능해진다.
- `host`/`item_key`가 **안정 식별자**다. `hostid`/`itemid`는 Zabbix 내부 ID라 재설치하면 바뀌지만,
  당시 원본을 그대로 남긴다는 의미로 함께 싣는다.
- CSV 이스케이프: RFC 4180. `value`에 개행·쉼표·따옴표가 들어오는 텍스트 아이템이 실제로 있다
  (text 4.2만 행/일). 🔴 여기를 직접 문자열 조합으로 짜면 반드시 깨진다 — 검증된 CSV writer를 쓴다.

---

## 4. 배치 설계

### 4.1 job 3개 (기존 `scheduler_setting` 관용구 그대로)

| job_key | 주기(기본) | 라이선스 | 하는 일 |
|---|---|---|---|
| `archive_export` | daily 03:10 | **필요** (소스 호출) | 전일 구간 → ZIP 1개 생성 + `archive_file` 1행 |
| `archive_cleanup` | daily 04:30 | **불필요** | 보존기간 초과 ZIP 삭제 + 메타 행 삭제 |
| `archive_restore_gc` | interval 30m | **불필요** | 만료된 업로드 조회 세션·임시행 삭제 |

`cleanup`/`gc`가 `requiresActiveLicense=false`인 것은 기존 규칙(`BuiltInJobs.cleanupJob`)과 동일하다 —
만료된 설치본의 디스크가 무한정 차면 안 된다.

`options`(jsonb) 예: `{"retentionDays":1825,"includeText":true,"chunkItems":1000,"chunkHours":1,"pauseMs":200,"maxConcurrency":1}`

### 4.2 청킹 — Zabbix를 흔들지 않고 363만 행 받기

`history.get`을 하루치 통째로 치면 JSON이 수백 MB다. 다음으로 쪼갠다.

```
for value_type in [float, unsigned, text-계열]:
    for hour in 0..23:
        for itemChunk in items.chunked(chunkItems):
            history.get(itemids=itemChunk, history=vt,
                        time_from=hourStart, time_till=hourEnd)
            → CSV writer에 스트리밍 append
            → sleep(pauseMs)
```

- 🔴 **결과를 메모리에 모으지 않는다.** 받은 즉시 `GZIPOutputStream`에 흘린다. 363만 행을
  List로 들고 있으면 힙이 터진다.
- 🔴 `history.get`은 호출당 **단일 `value_type`**만 받는다(`ItemsService`가 이미 아는 제약).
- 청크 실패는 3회 재시도 후 **gap 기록하고 계속**. 배치 전체를 중단시키지 않는다.
- 🔴 **단, 실패 한도를 둔다**(Spring Batch의 skip-limit에서 빌려온 개념 — §8 D14).
  "실패해도 계속"만 있으면 Zabbix가 통째로 죽은 날에도 배치는 끝까지 돌고 **`PARTIAL` 딱지가 붙은
  껍데기 ZIP**을 만든다. 실패율이 임계(기본 **20%**)를 넘으면 그 자리에서 **중단하고 `FAILED`**,
  부분 파일은 남기지 않는다. 없는 것이 "있는 줄 알았는데 비어 있는 것"보다 낫다.

### 4.2.1 🔴 소스 부하 — 실측 (2026-09-02, dev / 호스트 74대)

파라미터를 감으로 정하지 않기 위해 실제 Zabbix(`dmove.co.kr`)에 재봤다.

**① 청크 크기 (창 1시간, float)** — 클수록 유리하다. 비용의 대부분이 호출 고정비다.

| 아이템 수 | 소요 | 행 | 응답 | 처리량 |
|---|---|---|---|---|
| 100 | 0.13초 | 1,189 | 0.09 MB | 9천 행/초 |
| 500 | 0.31초 | 7,352 | 0.56 MB | 2.4만 행/초 |
| **1000** | **0.29초** | **14,014** | **1.07 MB** | **4.8만 행/초** |

→ `chunkItems`를 **500 → 1000**으로 상향한다. 호출 수는 절반, 처리량은 2배다.

**② 데이터 나이** — 오래된 구간도 느려지지 않는다. `(itemid, clock)` 인덱스가 그대로 먹는다.

| 구간 | 소요 | 행 |
|---|---|---|
| 1시간 전(캐시 뜨거움) | 0.17초 | 14,000 |
| 어제(배치가 읽는 구간) | 0.50초 | 13,631 |
| 20일 전(백필) | 0.20초 | 13,034 |
| 30일 전(보존 경계) | 0.41초 | 11,323 |

**③ 아카이빙 중 일반 조회 지연** — `pauseMs=0`으로 쉬지 않고 밀어붙인 최악 조건에서
대시보드 최신값 조회(`history.get limit=1`)를 동시 측정했다.

| | p50 | p90 | 최대 |
|---|---|---|---|
| 평상시 | 95ms | 102ms | 145ms |
| 아카이빙 중 | 129ms | 262ms | 302ms |

→ **1.4배, 최악 0.3초.** 야간 실행이면 체감 영향은 사실상 없다.

**종합**: 하루치 363만 행 ≈ **280 청크 × 0.3초 + pause = 2~3분**. 부담스러운 작업이 아니다.

**그래도 지켜야 할 것 3가지**

1. 🔴 **병렬 호출 금지 (`maxConcurrency=1`).** `history.get`은 Zabbix 프론트엔드 PHP 워커를
   하나 점유한다. 워커 풀은 유한하고(보통 `pm.max_children` 수준), 우리가 여러 개를 몇 분간
   물고 있으면 그동안 **사람이 화면을 못 연다.** 빨리 끝내려고 스레드를 늘리는 것이
   이 설계에서 가장 위험한 최적화다. 위 실측이 "여유 있다"고 말하는 것은 **단일 스레드 기준**이다.
2. **백필은 보존 경계에 붙지 않는다.** Zabbix housekeeper는 오래된 `history`를 주기적으로
   DELETE한다(파티셔닝/TimescaleDB 미사용 환경에선 무겁다). 정상 배치는 "어제"를 읽으므로
   삭제 구간과 멀지만, 30일 경계를 훑는 백필은 겹칠 수 있다. 백필은 **경계에서 하루 물러선
   구간까지만** 읽고, 그 밖은 `SOURCE_EXPIRED` gap으로 남긴다.
3. **청크 상한은 응답 크기로도 잡는다.** 1000아이템×1시간 = 1MB지만, 수집 주기가 촘촘한
   고객사에선 같은 파라미터로 수십 MB가 나올 수 있다. Zabbix 프론트엔드의
   `max_execution_time`(보통 300초)에 걸리면 청크 전체가 날아간다. 응답이 임계(예: 50MB)를
   넘으면 **다음 청크부터 `chunkItems`를 자동 반감**한다.

⚠️ 위 수치는 **호스트 74대 dev 환경 1곳**의 값이다. 고객사가 1000대면 `history` 테이블이
십수 배가 되고 판이 달라질 수 있다. 첫 설치 시 **1일치 시범 실행으로 소요 시간을 재고**
파라미터를 확정하는 절차를 설치 가이드에 넣는다.

### 4.3 워터마크와 백필

- `archive_file`에 이미 `OK` 상태로 있는 날짜는 건너뛴다.
- 부팅 시 / 매 실행 시 **마지막 성공일 ~ 어제** 사이의 빠진 날짜를 채운다
  (원시 보존 31일 안쪽만 — 그 밖은 소스에 이미 없으므로 `gaps`에 `SOURCE_EXPIRED`로 기록).
- 수동 백필 EP(`POST /archives/run`)로 특정 기간 재생성 가능. 같은 날짜 재생성은 **새 파일로 만들고
  기존 행을 `SUPERSEDED`로 표시**한다 — 🔴 감사 대상 파일을 덮어쓰지 않는다.

### 4.4 🔴 보존 기간 자가진단 (이 설계의 안전장치)

배치 주기가 소스 보존보다 길면 **조용히 데이터를 잃는다**. 매 실행 전 판정한다.

1. `housekeeping.get`으로 `hk_history_global`/`hk_history` 확인
   - `global=1` → 실효 보존 = `hk_history` (아이템 설정 무시)
   - `global=0` → 아이템별 `history` 값 중 **최솟값**(0=비활성 제외)이 실효 보존
2. 실효 보존 < 배치 주기 × 2 → **경고**. 화면 배너 + 실행 요약에 기록.
3. `housekeeping.get`은 Super admin 권한이 필요하다. 권한 없으면 실패로 처리하지 말고
   **아이템별 `history` 최솟값으로 폴백**하고 "전역 override 미확인" 플래그를 남긴다.

---

## 5. DB 스키마 (V41)

```sql
-- 아카이브 파일 메타. 데이터 본체는 파일에 있고 여기엔 "어디에 무엇이 있나"만 둔다.
CREATE TABLE archive_file (
    id            bigserial PRIMARY KEY,
    period_start  timestamp    NOT NULL,
    period_end    timestamp    NOT NULL,
    file_path     varchar(1024) NOT NULL,
    file_name     varchar(255)  NOT NULL,
    bytes         bigint       NOT NULL,
    raw_rows      bigint       NOT NULL DEFAULT 0,
    trend_rows    bigint       NOT NULL DEFAULT 0,
    sha256        varchar(64)  NOT NULL,          -- ZIP 자체의 해시
    manifest      jsonb        NOT NULL,          -- 목록/상세를 파일 열지 않고 보여주기 위한 사본
    status        varchar(16)  NOT NULL,          -- OK | PARTIAL | FAILED | SUPERSEDED | DELETED
    -- 🔴 삭제해도 행은 남는다(§6.1). 파일만 사라지고 "누가 왜 지웠나"는 보존된다
    deleted_at    timestamp,
    deleted_by    varchar(64),
    delete_reason varchar(255),
    created_at    timestamp    NOT NULL
);
CREATE UNIQUE INDEX uq_archive_file_period ON archive_file (period_start, created_at);
CREATE INDEX idx_archive_file_period ON archive_file (period_start DESC);

-- 아카이빙 대상. 카탈로그는 기본 ON이고 행이 없어도 성립한다(kind=CATALOG 시드 1행).
CREATE TABLE archive_target (
    id          bigserial PRIMARY KEY,
    kind        varchar(16)  NOT NULL,            -- CATALOG | ITEM_KEY | HOST
    pattern     varchar(255) NOT NULL DEFAULT '', -- ITEM_KEY: 'pgsql.*' 같은 glob
    enabled     boolean      NOT NULL DEFAULT TRUE,
    created_by  varchar(64),
    created_at  timestamp    NOT NULL
);

-- 업로드 조회 세션. TTL 만료 시 gc가 통째로 지운다.
CREATE TABLE archive_restore_session (
    id           bigserial PRIMARY KEY,
    uploaded_by  varchar(64)  NOT NULL,
    file_name    varchar(255) NOT NULL,
    sha256       varchar(64)  NOT NULL,
    verified     boolean      NOT NULL,           -- 체크섬·매니페스트 정합
    manifest     jsonb,
    row_count    bigint       NOT NULL DEFAULT 0,
    expires_at   timestamp    NOT NULL,
    created_at   timestamp    NOT NULL
);

-- 임시 적재. 세션 삭제 시 CASCADE.
CREATE TABLE archive_restore_sample (
    session_id  bigint     NOT NULL REFERENCES archive_restore_session(id) ON DELETE CASCADE,
    host        varchar(128) NOT NULL,
    item_key    varchar(255) NOT NULL,
    clock       bigint     NOT NULL,
    value_num   double precision,
    value_text  text,
    value_min   double precision,   -- trend 행만 채워짐
    value_avg   double precision,
    value_max   double precision,
    is_trend    boolean    NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_archive_restore_sample_q
    ON archive_restore_sample (session_id, host, item_key, clock);
```

🔴 `archive_restore_sample`은 **의도적으로 정규화하지 않았다.** 세션 수명이 시간 단위이고
조회 축이 (host, item_key, clock) 하나뿐이라, 마스터 테이블을 만들면 적재 비용만 늘고 얻는 게 없다.

---

## 6. API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/archives` | 목록(기간·크기·행수·상태·gap 유무·**파일 경로**·**실물 존재 여부**). 페이징 |
| GET | `/archives/{id}` | 상세 = manifest 전개 |
| GET | `/archives/{id}/download` | ZIP 스트리밍 다운로드. 🔴 다운로드 사실을 감사 로그에 남긴다 |
| DELETE | `/archives/{id}` | 수동 삭제 `{reason}` **필수**. 파일만 지우고 행은 `DELETED`로 남긴다 (§6.1) |
| POST | `/archives/delete-bulk` | 선택 다중 삭제 `{ids[], reason}`. 리포트 관리 화면과 같은 패턴 |
| POST | `/archives/run` | 수동 실행/백필 `{from,to}` |
| GET | `/archives/status` | 다음 실행·마지막 결과·**보존기간 자가진단 결과**·디스크 여유 |
| GET/PUT | `/archives/targets` | 대상 목록/편집 |
| POST | `/archives/restore` | ZIP 업로드 → `{sessionId, verified, manifest}` |
| GET | `/archives/restore/{sid}/series` | `?host&itemKey&from&to&mode=raw\|trend` |
| GET | `/archives/restore/{sid}/keys` | 이 파일에 든 호스트·아이템 키 목록(선택 UI용) |
| DELETE | `/archives/restore/{sid}` | 즉시 폐기 |

**권한**: 감사 데이터이므로 전 EP 관리자 전용. `DmovePermissions`에 `archive` feature 추가.

### 6.1 🔴 삭제 설계 — "지워졌다는 사실"은 지우지 않는다

이 기능의 목적은 **규제·감사용 원본 보관**(U1)이다. 그런데 관리자가 화면 버튼 하나로
아카이브를 없앨 수 있으면, 그 버튼이 곧 **증거 인멸 통로**가 된다. 감사에서
"작년 3월치가 왜 없습니까"에 "모르겠습니다"라고 답하는 순간 이 기능은 존재 이유를 잃는다.

그렇다고 삭제를 막으면 디스크가 찬다. 실무적으로 필요하다. 그래서 **지우되 흔적을 남긴다.**

- **행은 지우지 않는다.** `archive_file` 레코드는 `status = DELETED`로 남고 목록에 계속 보인다.
  파일 본체(ZIP)만 디스크에서 제거된다.
- 목록에는 "삭제됨 · 2026-09-02 · 홍길동 · 디스크 확보"처럼 **누가·언제·왜**가 함께 뜬다.
  → 감사인이 보는 것은 "3월치 없음"이 아니라 "3월치는 누가 언제 왜 지웠음"이다. 이 차이가 전부다.
- **사유(`reason`) 입력을 필수로 한다.** 빈 값이면 400. 형식적이라도 적게 만드는 것이
  "무심코 눌렀다"를 막는다.
- 삭제·다운로드 모두 **감사 로그(`ENTITY_ARCHIVE`)에 기록**한다. 감사 데이터를 누가
  받아갔는지도 감사 대상이다.
- 자동 삭제(`retentionDays` 만료, `archive_cleanup` 잡)도 같은 방식으로 `DELETED` + 사유
  `RETENTION_EXPIRED`를 남긴다. 정책에 의한 삭제와 사람의 삭제가 구분돼 보여야 한다.

`archive_file.status`에 `DELETED` 추가, `deleted_at` / `deleted_by` / `delete_reason` 컬럼 추가(V41).

---

## 7. FE

**설정 > 데이터 아카이빙** (신규. `SettingsMenu.SETTINGS_ENTRIES`에 추가 — SideNav 아님)

- **탭 ① 아카이브 목록**: 날짜별 표(기간·크기·원시행·집계행·상태 배지·gap 배지·**파일 경로**)
  + 다운로드 버튼 + 상단 상태 카드(다음 실행 / 마지막 결과 / 🔴 보존기간 경고 / 디스크 여유)
  - **파일 경로 컬럼**: 서버에 직접 붙어 파일을 가져가거나 백업 대상으로 지정할 때 필요하다.
    - 경로가 길다(최대 1024자) → 표에는 **파일명 + 앞부분 축약**, 전체는 툴팁, 옆에 **복사 버튼**.
    - 아카이브 루트는 상단 상태 카드에 한 번만 표시하고, 행에는 **루트 기준 상대 경로**를 보여
      가로 폭을 아낀다. 복사 버튼은 **절대 경로**를 복사한다(붙여넣어 바로 쓰라고 주는 값이므로).
  - 🔴 **실물 존재 여부를 함께 보여준다.** 경로를 노출한다는 건 사람이 화면 밖에서 파일을 옮기거나
    지울 수 있다는 뜻이다. 그러면 DB는 `OK`인데 실제 파일은 없는 불일치가 생기고, 정작 감사에서
    파일을 요구받는 순간에 발견된다. 목록 조회 시 존재 여부를 확인해 **"파일 없음" 경고 배지**를
    띄우고 다운로드 버튼을 비활성화한다.
    - 존재 확인은 파일 상태 확인만 한다(내용을 읽지 않는다). 페이지당 수십 건이라 부담 없다.
    - 무결성(SHA-256) 재검증은 매 조회마다 하지 않는다 — 20MB×수십 건을 매번 읽는 건 과하다.
      행 단위 **"무결성 검사" 버튼**으로 필요할 때만 돌린다.
  - **삭제**: 행 단위 + 체크박스 선택 다중 삭제(설정>리포트 관리와 동일 패턴).
    - 🔴 **사유 입력 필수** 모달. 삭제 대상 기간·개수·총 용량을 문장으로 다시 보여주고 확인받는다.
    - 삭제된 행은 목록에서 사라지지 않고 **회색 "삭제됨" 배지 + 삭제자·일시·사유 툴팁**으로 남는다.
      다운로드 버튼만 비활성. → 감사인이 공백을 보는 게 아니라 삭제 경위를 본다(§6.1).
    - 기본 필터는 "삭제 제외"로 두고 **"삭제된 항목 표시" 토글**을 준다. 평소엔 안 거슬리게,
      필요할 땐 전부 보이게.
- **탭 ② 대상 설정**: 카탈로그 기본 ON 안내 + 추가 아이템 키 목록 CRUD
  - **보관 정책**(U6): 보관 기간 입력(일/년 단위 선택, 기본 5년) + 텍스트 데이터 포함 스위치.
    값은 `archive_cleanup`·`archive_export`의 `scheduler_setting.options`에 저장한다(새 테이블 불필요).
    - 입력 옆에 **예상 사용량**을 보여준다 — 최근 파일 평균 크기 × 보관 일수 vs 디스크 여유.
      보관 기간을 늘렸다가 디스크가 차서 배치가 멈추는 일을 입력 시점에 막는다.
    - 🔴 **기간을 줄일 때 확인을 받는다.** 줄이는 순간 다음 정리 배치가 오래된 파일을 한꺼번에 지운다.
      "저장하면 다음 정리(04:30)에 2021-03-01 이전 파일 412개(8.2GB)가 삭제됩니다"를 보여주고 확인받는다.
      이 일괄 삭제도 §6.1대로 행을 남기고 사유는 `RETENTION_EXPIRED`로 기록한다.
    - 하한을 둔다(예: 30일). 0이나 1일로 저장해 보관 기능을 사실상 끄는 것을 막는다 —
      끄고 싶다면 배치 자체를 끄는 것이 정직한 방법이다.
  - **텍스트 데이터 포함 스위치**(U7, 기본 켬).
    - 스위치 아래에 한 줄 안내: "텍스트 데이터는 자빅스가 요약을 만들지 않아 31일 뒤 원본이 사라집니다.
      끄면 이후 날짜의 텍스트 기록은 복구할 수 없습니다."
    - 🔴 **끌 때 확인을 받는다** — 끈 기간의 텍스트는 영영 없다. 켤 때는 확인이 필요 없다.
    - 켜 둔 채로 두려는 고객에게도 한 줄: "프로세스 명령줄·로그에 계정명·비밀값이 포함될 수 있어
      파일 다운로드가 기록됩니다."
    - 스위치 변경은 **다음 실행분부터** 적용한다. 이미 만든 파일은 건드리지 않는다.
    - 🔴 **manifest.json에 `includeText` 값을 남긴다.** 감사에서 "이 날은 왜 텍스트가 없나"에
      "그때 설정이 꺼져 있었다"로 답할 수 있어야 한다 — 설정 때문에 빠진 것과 실패로 빠진 것은
      구분돼야 한다.
- **탭 ③ 보관 파일 열기 (P2)**: 드래그&드롭 업로드 → 검증 결과 → 호스트·아이템 선택 → 차트+표
  - 🔴 검증 실패 파일도 **조회는 되게 하되 "출처 미검증" 경고 배지**를 상시 노출한다.
    우리 화면에 떴다는 이유로 남의 파일이 우리 데이터로 보증되면 안 된다.
  - 세션 만료 시각 표시 + "지금 폐기" 버튼

---

## 8. 결정 사항

| # | 결정 | 이유 |
|---|---|---|
| D1 | DB 아님, 파일 | 실측 원시 363만 행/일 = 연 13억 행. 설치형이라 고객 DB 용량 통제 불가. 파일은 7GB/년 |
| D2 | 하루 = ZIP 1개 | 이동·제출·보관 단위가 파일 하나. 감사인에게 그대로 넘김 |
| D3 | CSV.gz (Parquet 아님) | 감사인·고객이 엑셀로 연다. Parquet은 hadoop 계열 의존성이 설치형 번들을 키움 |
| D4 | 원본 키 그대로, 캐노니컬은 병기 | 캐노니컬 변환은 "가공" — 감사에서 원본성을 다툴 여지를 만들지 않음 |
| D5 | 일 1회 배치 | 실측 원시 보존 31일 → 30일 복구 여유. 단 D6 없이는 성립 안 함 |
| D6 | 보존기간 자가진단 필수 | 고객사가 override를 끄고 1h를 두면 일 1회는 그날을 통째로 잃음 |
| D7 | 실패는 gap 기록 후 계속 | 부분 성공이 전체 실패보다 낫고, 침묵한 공백은 감사에서 은폐로 읽힘 |
| D8 | 같은 날 재생성은 새 파일 + SUPERSEDED | 🔴 감사 대상 파일을 덮어쓰지 않는다 |
| D9 | 업로드 조회는 임시 테이블 + TTL | 메모리 적재는 큰 파일에 취약. "상시 저장"이 아니라 "볼 때만 잠깐"이라 U3와 어긋나지 않음 |
| D10 | 미검증 파일도 조회 허용 + 경고 배지 | 차단하면 정당한 구버전 파일까지 막힌다. 대신 보증하지 않음을 명시 |
| D11 | 시각은 UTC epoch + ISO 병기 | 로컬 타임존만 쓰면 서머타임·서버 이전 후 재해석 불가 |
| D12 | 수동 삭제 허용하되 **행은 남긴다**(사유 필수·감사 로그) | 삭제를 막으면 디스크가 차고, 흔적 없이 지우게 하면 삭제 버튼이 증거 인멸 통로가 된다 |
| D13 | 다운로드도 감사 로그 대상 | 감사 데이터를 누가 반출했는지 자체가 감사 대상 |
| D14 | **Spring Batch 미도입** — 기존 `SchedulerJob` 하네스 사용 | §8.1 |

---

### 8.1 Spring Batch 도입 검토 (2026-09-02) — **미도입**

대량 청크 처리라는 성격상 자연스러운 후보라 실제로 따져봤다. **쓰지 않는다.**

**현황**: `build.gradle.kts`에 Spring Batch 의존성 없음. 기존 `SchedulerJob` 하네스가 이미
① 화면에서 주기 변경(`scheduler_setting`), ② **리스 기반 중복 실행 방지**(다중 인스턴스 대비),
③ 성공/실패 실행 이력 + 한 줄 요약, ④ 라이선스 게이팅(`requiresActiveLicense`)을 제공한다.

**Spring Batch가 더 주는 것과, 우리에게 실제로 필요한가**

| Spring Batch 기능 | 이 배치에 필요한가 |
|---|---|
| 실패 지점부터 재시작(restartability) | 🔴 **오히려 해롭다.** 우리는 하루 = ZIP 1개이고 "부분 파일을 남기지 않는다"(§11.3)·"재생성은 새 파일"(D8)이 원칙이다. 중간부터 이어붙이면 **원본성이 의심되는 파일**이 만들어진다. 게다가 전체가 2~3분이라 처음부터 다시 하면 그만이다 |
| 청크 커밋 간격 / 트랜잭션 | 필요 없다. 쓰기 대상이 **DB가 아니라 파일 스트림**이라 롤백 단위라는 개념이 성립하지 않는다 |
| 스킵/재시도 정책 | 개념만 빌린다(§4.2 실패 한도). 프레임워크 없이 몇 줄이면 된다 |
| 파티셔닝·병렬 스텝 | 🔴 **금지 대상이다**(§4.2.1 — 병렬화가 Zabbix 화면을 멈춘다). 프레임워크의 최대 강점을 우리는 쓰면 안 된다 |
| 실행 이력(JobRepository) | 이미 있다. 도입하면 **이력이 두 군데로 갈라진다** — 화면은 `scheduler_run_log`, 프레임워크는 `BATCH_JOB_EXECUTION` |

**비용**: `JobRepository` 스키마 **테이블 9개**를 Flyway로 고객 DB에 만들어야 한다.
설치형 제품이라 모든 고객 DB에 얹히는 부담이고, 얻는 것은 위 표대로 대부분 "필요 없거나 해로운" 것들이다.

**결론**: 이 배치는 *대량 처리*처럼 보이지만 실제로는 **"단일 스레드로 천천히 읽어 파일에 흘리는"**
작업이다. Spring Batch가 잘하는 일(트랜잭션 경계·재시작·병렬화)과 겹치는 지점이 거의 없다.
빌려올 것은 **skip-limit 개념 하나**이고 그것은 §4.2에 반영했다.

> 재검토 조건: 아카이빙 외에 재시작이 필요한 장시간 배치가 2개 이상 더 생기면 그때 다시 본다.

---

## 9. 미결 (착수 전 결정 필요)

| # | 질문 | 선택지 / 기본 제안 |
|---|---|---|
| Q1 | **엔진 포트 구조** — `MetricPort`에 벌크 추출이 없다. 캐노니컬 밖 원시 아이템 키를 다뤄야 해서 기존 포트 계약과 어긋난다 | (a) `ArchivePort` 신설 ← **권고** (b) `MetricPort`에 벌크 메서드 추가(오염) (c) engine-zabbix 전용(중립성 포기) |
| ~~Q2~~ | ~~텍스트/log 아이템 포함?~~ | ✅ **U7로 확정 — 기본 켬, 스위치로 끔**. 결정 근거로 남긴다 → 2026-09-16 실측: 1,888개 아이템·하루 약 51만 행·**압축 후 약 4MB/일**(숫자 20MB의 약 20%). 시간집계가 없어 **원시가 유일본**. 담긴 것: VM 상태·OS/커널 버전·`/etc/passwd` 체크섬·CPU/메모리 상위 프로세스(JSON). dev엔 log 형 0건 — 로그 감시를 쓰는 고객사는 양이 훨씬 클 수 있다. 🔴 프로세스 명령줄·로그에 계정명·비밀값이 섞일 수 있어 파일 반출 통제(§6.1 다운로드 기록)가 더 중요해진다 |
| ~~Q3~~ | ~~파일 보존 기간 기본값~~ | ✅ **U6으로 확정** — 화면에서 설정, 기본 5년 |
| Q4 | 서명 필요한가 | P1은 SHA-256까지. 서명하려면 설치본 키의 신뢰 근거를 따로 세워야 함(§3.2) |
| Q5 | 외부 스토리지(S3/NAS 직접 업로드) | P1은 로컬 경로만. NAS 마운트로 우회 가능 |

---

## 10. 단계

| Phase | 범위 |
|---|---|
| **P1** | 배치 3종 + ZIP 생성 + `archive_file`/`archive_target` + 목록/다운로드/대상설정 화면 + 자가진단 |
| **P2** | 업로드 복원 조회 (세션·임시테이블·차트 화면) |
| **P3** | 서명 · 외부 스토리지 · 대상 선택 UI 고도화(호스트/그룹 단위) |

---

## 11. 리스크

1. 🔴 **삭제된 호스트**: Zabbix에서 호스트를 지우면 그 이력도 함께 사라진다. 배치가 돌기 전에 지워지면
   영원히 못 건진다. → 호스트 삭제 시 경고하거나 즉시 아카이빙하는 훅은 P3 검토 대상.
2. **Zabbix 부하**: §4.2.1에서 실측함 — 단일 스레드 기준 하루치 2~3분, 동시 조회 지연 1.4배로
   여유 있다. 남는 위험은 ⓐ **병렬화 유혹**(워커 점유로 화면이 멈춘다), ⓑ **대규모 고객사 외삽**
   (dev 74대 기준값), ⓒ 백필과 housekeeper DELETE 구간 충돌. 완화책은 §4.2.1에 명시.
3. **디스크 소진**: 아카이브 경로가 차면 배치가 실패한다. `/archives/status`에 여유 공간을 노출하고
   임계 미만이면 배치 전 중단 + 경고(부분 파일을 남기지 않는다).
4. **재설치 시 itemid 변경**: `host`+`item_key`를 안정 식별자로 쓰므로 조회는 성립. `itemid`는 참고값.
5. **실측은 dev 1개 환경**: 호스트 74대·34% 가동률 기준이다. 고객사 규모가 크면 청크 파라미터
   재산정이 필요하다.
