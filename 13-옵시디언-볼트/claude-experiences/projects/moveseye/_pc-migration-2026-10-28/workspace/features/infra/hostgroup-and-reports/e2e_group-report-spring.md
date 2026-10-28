# E2E 런타임 검증 — 호스트 그룹 리포트 **Spring BE 경로** (group-report-spring)

검증자: functional-qa / 2026-06-22
방식: Nest(3000) + Spring(3001) **동시 기동** → 로그인 → API 프로브 + Nest↔Spring deep-equal + DB 직접 대조
진실원천: `_workspace/features/infra/hostgroup-and-reports/contract_group-report.md`
비교 기준: 기존 Nest 경로 E2E `_workspace/features/infra/hostgroup-and-reports/e2e_group-report.md` (PASS / 버그 0건)
선행: integration-qa 정적 Nest↔Spring 1:1 shape PASS (`_workspace/features/infra/hostgroup-and-reports/qa_group-report.md`)
배경: fullstack-feature 파이프라인에서 시간상 생략됐던 **Spring 경로 런타임 검증** 공백 메우기.

## 종합 판정: **PASS (런타임 버그 0건, Nest↔Spring 불일치 0건)**

Spring BE를 실제 기동해 리포트 엔드포인트가 계약대로 동작함을 확인. AUTH/해피패스/에러/백필/멱등성 전부 정상.
**핵심: 같은 그룹·기간을 Nest(3000)와 Spring(3001)에 동시 호출한 deep-equal 6건 전부 EQUAL** — 값/포맷/키 수준까지 동일.
Spring 고유 직렬화 함정(Lombok is-접두 키 변형, jsonb, null 키)은 리포트 응답에 영향 없음(원시 JSON 키 경로 Nest==Spring 완전 일치). be-engineer 조치 불요.

---

## 0. 환경 / 기동

| 항목 | 상태 |
|---|---|
| Nest | NestJS, **port 3000** LISTENING (`npm run start:dev`, .env 자동 로드). 완전 기동(이벤트 동기화 가동) |
| Spring | Spring Boot, **port 3001** LISTENING (`gradlew bootRun --no-daemon`, JAVA_HOME=jdk-17). Tomcat started on 3001 |
| Flyway | **비활성 확인** (`SPRING_FLYWAY_ENABLED=false`) — 기동 로그에 flyway/migrate/baseline 라인 0건. dev DB 스키마 보호됨 |
| DB | PostgreSQL localhost:5432 `dmove` (양쪽 BE 공유). `host_group_report` 테이블 존재 |
| 로그인 | admin / <dev-admin-pw>, `x-visitor-id` 필수. Nest·Spring 양쪽 JWT 정상 발급 |
| node | `C:\Users\DMOVE\AppData\Local\nvm\v24.12.0\node.exe` (절대경로) |

### ⚠️ 기동 시 발견한 운영 함정 (검증 항목 아님, 기록)
- `gradlew bootRun`은 `moveseye-be\.env`를 **자동 로드하지 않는다**. 첫 시도에서 `application.yml`의 `${DB_HOST}/${DB_PORT}/${DB_NAME}` 플레이스홀더가 리터럴로 남아 Hikari가 `jdbc:postgresql://${DB_HOST}:${DB_PORT}/...`로 접속 실패(`JDBC URL invalid port number: ${DB_PORT}` → APPLICATION FAILED TO START).
- 해결: `.env`를 파싱해 프로세스 환경변수로 주입한 뒤 같은 세션에서 bootRun 기동(`_workspace\_load_env_spring.ps1`). 이후 정상 기동.
- → **운영 권고**: Spring 기동 루틴 문서에 ".env를 환경변수로 export 후 bootRun" 단계를 명시하면 좋다(현 CLAUDE.md §2엔 ".env 재사용"만 있고 주입 방법 부재). 차단성 아님(검증자 측 기동 절차 이슈).

---

## 1. AUTH 가드 (Spring) — PASS

| 케이스 | 기대 | 실제 (Spring 3001) |
|---|---|---|
| 토큰 없음 + reports | 401 | HTTP 401, code 401, `INVALID_TOKEN` ✓ |
| x-visitor-id 헤더 없음 | 401 | HTTP 401, code 401, `Missing x-visitor-id header` ✓ |
| 정상 토큰+vid | 200 | HTTP 200, code 200, 배열 반환 ✓ |

Nest e2e §2와 동일 거동. 재현: `node _workspace/e2e_report_spring_probe.cjs`

## 2. 해피패스 목록/상세 (Spring) — PASS

### 2.1 목록 `GET /hosts/2/reports?periodType=WEEK&limit=8` (DB 히트)
- 200, **17ms**(DB 즉시), 배열 8개. 정렬 **최신순 내림차순** (2026-06-15 → 2026-04-27) ✓
- 미마감 현재 주(06-22~) **제외**(최신이 06-15~06-21) ✓
- first: hostCount 40, cpu{15.61/89.04/0.94} memory{48.83/78.92/9.3} disk{23.35/50.4/7.2} **traffic:null** ✓
- alerts.totals **6키 전부** 존재(warning 1, high 8), topHosts [10.220.0.70:8, 10.220.0.92:1] ✓

### 2.2 목록 `MONTH&limit=6` (DB 히트)
- 200, 13ms, 배열 6개, 최신순(2026-05-01 → 2025-12-01). first cpu{16.47/86.46/1.04}, warning 36/disaster 3 ✓

### 2.3 resource null 케이스 (group 3, 빈 그룹)
- cpu/memory/disk/traffic **4키 모두 존재 + 값 null** (hostCount 0). `@JsonInclude(ALWAYS)`로 키 보존 확인 ✓
- alerts.totals 6키 전부 0, topHosts [] ✓

### 2.4 상세 `GET /hosts/2/reports/detail?periodType=WEEK&periodStart=2026-06-15`
- 200, 9ms, **단일 객체**, 목록 원소와 동일 shape(6키), 값 동일 ✓

샘플: `_workspace/e2e_report_spring_probe_result.json`

## 3. 에러 경로 (Spring) — PASS

`GET /hosts/2/reports/detail?periodType=WEEK&periodStart=2026-06-22` (현재 미마감 주)
- 기대: HTTP 200 + `errorCode: REPORT_PERIOD_NOT_CLOSED`
- 실제: **HTTP 200, code 400, errorCode `REPORT_PERIOD_NOT_CLOSED`, message 동일** ✓ (계약 §4 + 403→200 보존 정책 일치)

## 4. Lazy 백필 + 멱등성 (Spring) — PASS (핵심)

빈 (group, periodType) 조합 = **group 9 MONTH (DB 0 rows)** 선택해 백필 유발.

| | 결과 |
|---|---|
| DB rows BEFORE | **0** |
| CALL#1 (백필 유발) | 200, **347ms (느림 = Zabbix 집계)**, count 1 |
| DB rows AFTER#1 | **1 (delta +1)** ✓ |
| CALL#2 (재조회) | 200, **7ms (빠름 = DB 히트)**, count 1 |
| DB rows AFTER#2 | **1 (증가 없음 = 멱등)** ✓ |
| call#1 == call#2 (deep-equal) | **EQUAL (값 완전 일치)** ✓ |

→ Spring도 Nest와 동일하게 lazy 백필 + UNIQUE 멱등 upsert 정상 동작.
(주: dev DB는 기존 Nest 검증 백필분이 남아 있어, 0행 조합으로 group9 MONTH를 새로 선택해 검증. group2/3은 limit개 완비 상태였음.)
재현: `node _workspace/e2e_report_spring_backfill.cjs`

## 5. 🎯 Nest vs Spring 동일성 (deep-equal) — PASS (최우선 항목)

같은 그룹/기간을 Nest(3000)·Spring(3001)에 동시 호출 → 응답 `data`를 키 순서 무관 deep-equal.

| 비교 경로 | Nest | Spring | 결과 |
|---|---|---|---|
| `/hosts/2/reports?periodType=WEEK&limit=8` | 8건 | 8건 | **EQUAL** ✓ |
| `/hosts/2/reports?periodType=MONTH&limit=6` | 6건 | 6건 | **EQUAL** ✓ |
| `/hosts/3/reports?periodType=WEEK&limit=8` | 8건 | 8건 | **EQUAL** ✓ |
| `/hosts/3/reports?periodType=MONTH&limit=6` | 6건 | 6건 | **EQUAL** ✓ |
| `/hosts/2/reports/detail?...2026-06-15` (상세) | 객체 | 객체 | **EQUAL** ✓ |
| `...detail?...2026-06-22` (에러 envelope) | error/400/REPORT_PERIOD_NOT_CLOSED | 동일 | **EQUAL** ✓ |

**일치 세부 확인 (원시 JSON 바이트 수준)**
- `periodType` 문자열(`WEEK`/`MONTH`), 날짜 `YYYY-MM-DD` 포맷(시각 성분 없음) 동일 ✓
- jsonb 중첩(resource/alerts) 직렬화 구조 동일 ✓
- **null 키 보존**: `resource.traffic:null`, group3 `cpu/memory/disk:null` 모두 키 누락 없이 양쪽 동일(`@JsonInclude(ALWAYS)` 효과) ✓
- **data[0] 전체 keypath 집합 Nest==Spring 완전 일치** (only-in-Spring / only-in-Nest 모두 0건) ✓
- envelope 키: 양쪽 `status, code, data, syncTime` 동일 (성공 응답에서 errorCode/message는 양쪽 동일하게 생략) ✓

## 6. Spring 특이사항 (CLAUDE.md §3) — 영향 없음 확인

| 함정 | 점검 결과 |
|---|---|
| Lombok `is`-접두 boolean 키 변형 (§3-5) | 리포트 응답에 boolean 필드 없음 + is-접두 키 0건. 영향 없음 ✓ |
| jsonb 직렬화 | resource/alerts 중첩 객체 그대로 노출, Nest와 deep-equal EQUAL ✓ |
| null 키 보존 (`@JsonInclude(ALWAYS)`) | 4키 null 케이스에서 키 보존, Nest와 동일 ✓ |
| 403→HTTP200 보존 (§3-1) | 에러 경로 `REPORT_PERIOD_NOT_CLOSED`가 HTTP 200+body code로 내려옴(401만 실상태코드), Nest 동일 ✓ |
| 날짜 UTC 전제 (§3-4) | periodStart/End `YYYY-MM-DD` Nest와 동일 ✓ |

---

## 7. 산출물 / 재현

스크립트(`_workspace/`):
- `e2e_report_spring_probe.cjs` — Spring AUTH/목록/상세/에러 + **Nest↔Spring deep-equal**
- `e2e_report_spring_backfill.cjs` — Spring lazy 백필 + 멱등성(DB 직접 대조)
- `_load_env_spring.ps1` — .env→환경변수 주입 헬퍼(Spring bootRun 기동용)

결과 JSON: `e2e_report_spring_probe_result.json`, `e2e_report_spring_backfill_result.json`
원시 비교: `_nest_raw.json`, `_spring_raw.json` (keypath 대조용)
기동 로그: `_spring_boot2.log`(성공분), `_nest_boot.log`

---

## 8. 책임 주체별 권고

| 주체 | 조치 |
|---|---|
| be-engineer | **없음**. Spring 리포트 API/백필/에러/직렬화 전부 계약 및 Nest와 동일. deep-equal 6건 EQUAL |
| fe-engineer | 없음 (FE는 동일 계약 — 정적QA에서 확인됨, BE 스위칭 시 FE 무영향) |

### 참고 (조치 불요)
- Spring `bootRun`은 `.env` 자동 주입이 없어 환경변수 export가 선행돼야 한다(§0). 운영 가이드(CLAUDE.md §2) 보강을 권하나 코드/계약 이슈 아님.

클로즈드 루프 종료. **PASS / 런타임 버그 0건 / Nest↔Spring 불일치 0건.**
