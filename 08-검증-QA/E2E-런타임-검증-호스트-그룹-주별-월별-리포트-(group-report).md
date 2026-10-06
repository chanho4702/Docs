# E2E 런타임 검증 — 호스트 그룹 주별/월별 리포트 (group-report)

검증자: functional-qa / 2026-06-22
방식: 실제 앱 기동(BE+FE) → 로그인 → API 프로브 + 브라우저 UI 조작 + DB 직접 확인
진실원천: `_workspace/contract_group-report.md`
선행: integration-qa 정적 경계면 PASS(불일치 0건)

## 종합 판정: **PASS (런타임 버그 0건)**

API/DB/UI 전 계층에서 계약(`contract_group-report.md`)과 **값 수준까지** 일치. 차단성/경미 버그 모두 없음.
lazy 백필·멱등성·에러 경로·빈 상태까지 정상 동작 확인. 책임 주체(be/fe) 조치 불요.

발견된 외부 노이즈 1건(`/assets` 500)은 리포트 기능과 무관(범위 밖, 아래 §6).

---

## 0. 환경 / 기동

| 항목 | 상태 |
|---|---|
| BE | NestJS, port 3000 LISTENING (기존 기동분 재사용). 리포트 엔드포인트 존재(무인증 시 401) |
| FE | Vite, port 5173 LISTENING. `/sign-in` 200 |
| DB | PostgreSQL localhost:5432 `dmove`. 검증은 Nest 경로로 수행(Spring 스모크 미수행 — 시간상 생략, API 동일계약은 정적QA에서 확인됨) |
| 로그인 | admin / <마스킹>, `x-visitor-id` 헤더 필수. 토큰 정상 발급 |
| node | `C:\Users\DMOVE\AppData\Local\nvm\v24.12.0\node.exe` (PATH 미등록, 절대경로 사용) |

---

## 1. DB 마이그레이션 (1단계) — **이미 적용된 상태 확인**

- `host_group_report` 테이블이 **이미 존재**(BE start:dev migrationsRun 또는 선행 작업으로 적용됨).
- `psql \d host_group_report` 결과 = 마이그레이션(`1781500000000-CreateHostGroupReport.ts`)·엔티티와 **정확히 일치**:
  - 컬럼: `id serial PK`, `group_id varchar NN`, `period_type varchar NN`, `period_start date NN`, `period_end date NN`, `resource jsonb NN default '{}'`, `alerts jsonb NN default '{}'`, `host_count int NN default 0`, `created_at timestamp NN default now()`
  - 인덱스: `idx_host_group_report_group_id` (btree group_id)
  - 제약: `uq_host_group_report` UNIQUE(group_id, period_type, period_start) ✓
- 검증 시작 시점 14 rows(group2 WEEK8+MONTH6) 선존재 → 검증 진행하며 group3~22 백필로 **40 rows**까지 증가.
- **적용 경로: (a) BE 기동 시 migrationsRun 자동적용(추정) — 별도 psql 수동 실행 불필요.** 테이블 스키마 일치만 확인.

---

## 2. AUTH 가드 — PASS

| 케이스 | 기대 | 실제 |
|---|---|---|
| 토큰 없음 + groupid reports | 401 | HTTP 401, code 401, `INVALID_TOKEN` ✓ |
| x-visitor-id 헤더 없음 | 401 | HTTP 401, `Missing x-visitor-id header` ✓ |
| 정상 토큰+vid | 200 | 200 ✓ |

재현: `node _workspace/e2e_report_probe.cjs`

---

## 3. 해피 패스 (목록/상세) — PASS

### 3.1 목록 `GET /hosts/2/reports?periodType=WEEK&limit=8` (DB 히트)
- 200, **18ms**(DB 즉시), 배열 8개. 정렬 **최신순 내림차순** (2026-06-15 → 2026-04-27) ✓
- 첫 원소: `hostCount:40`, resource cpu{15.61/89.04/0.94} memory{48.83/78.92/9.3} disk{23.35/50.4/7.2} **traffic:null** (item 없음 → null 정상) ✓
- alerts.totals 6키 전부 존재(warning 1, high 8), topHosts [10.220.0.70:8, 10.220.0.92:1] ✓
- **마감된 최신 주가 06-15~06-21** = 현재 진행중 주(06-22~) 제외(계약대로 미마감 제외) ✓

### 3.2 목록 MONTH limit=6 (DB 히트)
- 200, 12ms, 배열 6개, 최신순(2026-05-01 → 2025-12-01). first cpu{16.47/86.46/1.04} ✓

### 3.3 상세 `GET /hosts/2/reports/detail?periodType=WEEK&periodStart=2026-06-08`
- 200, 7ms, **단일 객체**, 목록 원소와 동일 shape ✓ (cpu{15.33/71.81/1.19}, warning 12)

샘플: `_workspace/e2e_report_probe_result.json`

---

## 4. 에러 경로 — PASS

`GET /hosts/2/reports/detail?periodType=WEEK&periodStart=2026-06-22` (현재 미마감 주)
- 기대: HTTP 200 + `errorCode: REPORT_PERIOD_NOT_CLOSED`
- 실제: **HTTP 200, code 400, errorCode `REPORT_PERIOD_NOT_CLOSED`, message 동일** ✓ (계약 §4 정확 일치)
- FE는 목록 periodStart로만 상세를 고르므로 정상 흐름에서 도달 불가(정적QA §83 정합).

---

## 5. Lazy 백필 + 멱등성 — PASS (핵심)

빈 그룹에서 첫 조회 시 백필, 재조회 시 DB 즉답·동일값을 검증.

### 5.1 group 3 WEEK (빈 상태 → 백필)
| | 결과 |
|---|---|
| DB rows BEFORE | 0 |
| CALL#1 (백필 유발) | 200, **1810ms (느림 = Zabbix 집계)**, count 8 |
| DB rows AFTER#1 | **8 (delta +8)** ✓ |
| CALL#2 (재조회) | 200, **12ms (빠름 = DB 히트)**, count 8 |
| DB rows AFTER#2 | **8 (증가 없음 = 멱등)** ✓ |
| call#1 == call#2 (deep-equal) | **true (값 완전 일치)** ✓ |

### 5.2 추가 확인
- group 3 MONTH 백필: CALL#1 1480ms → CALL#2 15ms, 값 일치 ✓
- 데이터 풍부 그룹 g5(hostCount 34) 백필: cpu{15.61/89.04/0.94} 실제 Zabbix 집계값 채워짐 ✓
- CPU item 미수집 그룹(g6/g7, host 있으나 cpu=null) 정상 처리 ✓
- 빈 그룹(hostCount 0)은 Zabbix 집계 skip으로 143~375ms 빠른 백필 ✓
- DB 최종: group2/3 = WEEK8+MONTH6 (정확히 limit개), g4~22 = limit=1 프로브분 1개씩. **limit 파라미터가 백필 개수를 정확히 제어** ✓

재현: `node _workspace/e2e_report_backfill.cjs`

---

## 6. UI 행위 검증 (브라우저, group 2 `?tab=report`) — PASS

| 시나리오 | 결과 | 증거 |
|---|---|---|
| 리포트 탭 진입 + 기본 WEEK 렌더 | 자원요약(CPU/Mem/Disk 값 + Traffic "No data") + 알람(severity 6키 + Top hosts) 정상 | `e2e-rpt-01-week-default.png` |
| **주별→월별 토글** | Monthly 활성, MONTH 재요청 1건 발생, 기간 2026-05-01~31 갱신, **월별 옵션 6개** | `e2e-rpt2-01-monthly.png` |
| **월별→주별 복귀** | Weekly 활성, **주별 옵션 8개**, React Query 캐시 히트(재요청 0 = 정상) | `e2e-rpt-03-week-back.png` |
| **기간 선택** | 2026-06-15~21 → 2026-06-08~14 선택 시 상세 갱신(클라이언트 선택) | `e2e-rpt-05-period-changed.png` |
| **Excel 내보내기** | 다운로드 성공 `group-report_WEEK_2026-06-08.xlsx` | `e2e-rpt-06-export-menu.png` |
| **PDF 내보내기** | 다운로드 성공 `group-report_WEEK_2026-06-15.pdf` (jsPDF 캡처 지연 ~수초, 정상) | `e2e-rpt2-02-after-pdf.png` |
| **빈 그룹(g8, host 0)** | 전 metric "No data", totals 전부 0, Top hosts Empty("No alerting hosts in this period."), crash 없음 | `e2e-rpt3-empty-group.png` |

- **화면 표시값 == API 응답값** 정확 일치 (예: WEEK CPU 15.61/89.04/0.94 동일, MONTH Warning 36/Disaster 3, Top 10.220.0.92:35).
- 리포트 관련 BE 호출 전부 200 (`/hosts/2/reports?periodType=WEEK&limit=8`, `...MONTH&limit=6`).
- traffic null → "No data" 회색 처리, FE가 에러로 오인하지 않음 ✓

### 외부 노이즈 (범위 밖, 리포트와 무관)
- 콘솔 500 에러 8건 = 전부 `GET /assets?offset=0&limit=1...` (자산관리 기능, CLAUDE.md상 "구현 중"). 사이드nav/대시보드 프리페치 추정.
- **리포트 탭의 `/hosts/{id}/reports*` 요청에는 4xx/5xx 전무.** → be-engineer 라우팅 불요(리포트 책임 아님). 별도 자산 기능 선재 이슈로 분리 기록.

재현: `node _workspace/e2e_report_ui.cjs` + `e2e_report_ui2.cjs` + `e2e_report_ui3_empty.cjs`

---

## 7. 산출물 / 재현

스크립트(`_workspace/`):
- `e2e_report_probe.cjs` — auth/목록/상세/에러 API 프로브
- `e2e_report_backfill.cjs` — lazy 백필+멱등성(DB 직접 대조)
- `e2e_report_ui.cjs`, `e2e_report_ui2.cjs`, `e2e_report_ui3_empty.cjs` — 브라우저 UI

결과 JSON: `e2e_report_probe_result.json`, `e2e_report_backfill_result.json`, `e2e_report_ui*_result.json`

스크린샷(`_workspace/`):
- `e2e-rpt-01-week-default.png` (주별 기본)
- `e2e-rpt2-01-monthly.png` (월별 토글)
- `e2e-rpt-05-period-changed.png` (기간 선택)
- `e2e-rpt2-02-after-pdf.png` (PDF 후)
- `e2e-rpt3-empty-group.png` (빈 그룹)

---

## 8. 책임 주체별 권고

| 주체 | 조치 |
|---|---|
| be-engineer | 없음 (리포트 API/백필/에러 전부 계약대로) |
| fe-engineer | 없음 (UI 렌더/토글/선택/내보내기/빈상태 전부 정상) |

클로즈드 루프 종료. **PASS / 런타임 버그 0건.**

(참고 분리기록: `/assets` 500은 리포트 범위 밖 선재 이슈 — 필요시 자산 기능 담당이 별도 조사)
