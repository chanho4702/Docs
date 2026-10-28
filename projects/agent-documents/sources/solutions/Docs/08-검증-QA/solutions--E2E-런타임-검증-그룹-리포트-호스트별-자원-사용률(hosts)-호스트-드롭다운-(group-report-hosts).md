# E2E 런타임 검증 — 그룹 리포트 호스트별 자원 사용률(hosts[]) + 호스트 드롭다운 (group-report / hosts)

검증자: functional-qa / 2026-06-22
방식: 실제 앱 기동(Nest BE 재기동 + FE) → 로그인 → API 프로브 + DB 직접 대조 + 브라우저 UI 조작
진실원천: `_workspace/contract_group-report-hosts.md` (베이스 `contract_group-report.md`)
선행: integration-qa 정적 경계면 PASS(`qa_group-report-hosts.md`, 불일치 0건) / 기존 런타임 E2E(`e2e_group-report.md`)

## 종합 판정: **PASS (런타임 버그 0건)**

API/DB/UI 전 계층에서 `hosts[]` 증분이 계약과 **값 수준까지** 일치.
- API: hosts 채워짐·정렬·그룹↔호스트 값 정합·빈 그룹 `[]`·인증/에러 회귀 없음.
- DB: `hosts` jsonb 컬럼 마이그레이션 적용, 구버전 스냅샷 lazy 재집계(NULL→채워짐)·재저장·멱등성 확인.
- UI: 호스트 드롭다운 노출·전체↔개별 전환 시 표값 == API 호스트 resource·null "No data"·기간 변경 graceful·Excel/PDF 파일명 접미사(`_all`/`_{hostid}`) 반영.

차단성/경미 버그 모두 없음. be/fe 조치 불요. 비차단 관찰 2건(아래 §9)만 기록.

---

## 0. 환경 / 기동

| 항목 | 상태 |
|---|---|
| BE | **NestJS, port 3000 — 이번 검증 위해 재기동**(BE hosts 코드 반영). 기동 시작 시점 port 3000은 **java(Spring)** 가 점유 중이었음 → Spring 종료 후 Nest `npm run start:dev`로 재기동 |
| FE | Vite, port 5173 (기존 가동분 재사용) |
| DB | PostgreSQL localhost:5432 `dmove`. Nest 경로로 검증 |
| 로그인 | admin / <마스킹>, `x-visitor-id` 헤더 필수. 토큰 정상 발급 |
| node | `C:\Users\DMOVE\AppData\Local\nvm\v24.12.0\node.exe` (절대경로) |
| chromium | `...\ms-playwright\chromium-1223\chrome-win64\chrome.exe` (playwright는 `_workspace/node_modules`) |

> ⚠️ **기동 시 발견(중요)**: 검증 시작 시 port 3000은 Spring이 점유 중이었고, DB의 `host_group_report`엔 `hosts` 컬럼이 **없었다**. 새 Nest 코드 검증을 위해 Spring을 종료하고 Nest를 재기동 → 기동 시 `migrationsRun`으로 hosts 컬럼이 추가됨. (§8 마이그레이션 운영 이슈 참조)

---

## 1. 마이그레이션 / 스키마 — PASS

- **재기동 전**: `\d host_group_report`에 `hosts` 컬럼 **없음**. typeorm `migrations` 테이블에 `AddHostsToHostGroupReport1781600000000` **없음**.
- **Nest 재기동 후**:
  - `migrations` 테이블 최상단 = `AddHostsToHostGroupReport1781600000000` ✓ (실제 실행됨)
  - `\d host_group_report`에 `hosts | jsonb | nullable` 컬럼 추가됨 ✓
  - **기존 컬럼 무변경**: id/group_id/period_type/period_start/period_end/resource/alerts/host_count/created_at + 인덱스(`idx_host_group_report_group_id`)·UNIQUE(`uq_host_group_report`) 그대로 ✓
- 기존 스냅샷(재기동 직후 48 rows) 전부 `hosts IS NULL`(구버전) → 항목3 lazy 재집계의 통제 실험 베드.

재현: `psql ... "\d host_group_report"`, `SELECT name FROM migrations ...`

---

## 2. API에 hosts 채워짐 + 정렬 + 그룹↔호스트 관계 — PASS

`GET /hosts/2/reports?periodType=WEEK&limit=8` 첫 원소(periodStart 2026-06-15, hostCount 40):

- **hosts 채워짐**: `hosts` 길이 40 = hostCount 40. 응답 8개 원소 **전부** `hosts` 배열 보유(`allElementsHaveHosts: true`).
- **호스트 원소 shape**: `hostid`(string)/`hostName`(string)/`resource`(4키 cpu/memory/disk/traffic 항상 존재, 각 `{avg,max,min}` 또는 null) — 샘플 전수 valid.
- **정렬(계약 §1.3) PASS**: cpu.avg 내림차순 — 44.12 → 16.55 → 16.55 → 9.31 → 3.6. 동률(16.55) 시 hostName 오름차순(`10.220.0.92` < `10.220.0.92_test_1`). cpu null 호스트 34개 **전부 맨 뒤**(`nullsAtEnd: true`). 정렬 위반 0건.
- **목록 = 상세 동일 shape**: `GET .../reports/detail?...periodStart=2026-06-08`도 `hosts` 40개 포함(둘 다 hosts 보유).
- **그룹↔호스트 값 정합**(group2 WEEK first):
  | metric | 그룹 max/min/avg | 호스트별 분해 검증 |
  |---|---|---|
  | cpu | 89.04 / 0.94 / 15.61 | 그룹 max=호스트 max들의 최댓값(89.04)✓, 그룹 min=호스트 min들의 최솟값(0.94)✓, 그룹 avg=수집호스트(6개) avg 평균(15.61)✓ |
  | memory | 78.92 / 9.3 / 48.83 | max/min 정합✓, avg 평균 48.82≈48.83✓ |
  | disk | 50.4 / 7.2 / 23.35 | 수집 4호스트, max/min/avg 정합✓ |
  | traffic | null | 모든 호스트 traffic null → 그룹 null✓ |
  - cpu 수집 호스트 6개(나머지 34개 null) → 정렬의 cpuNullCount 34와 일치.

재현: `node e2e_report_hosts_probe.cjs`, `node e2e_report_hosts_relation.cjs`
증거: `e2e_report_hosts_probe_result.json`, `e2e_report_hosts_relation_result.json`

---

## 3. 🎯 구버전 스냅샷 lazy 재집계 (핵심) — PASS

구버전(hosts NULL) 스냅샷을 조회 시 그 자리에서 재집계·재저장하고, 재조회 시 DB 즉답·동일값(멱등)인지 — DB before/after를 직접 SQL로 대조.

### 3.1 호스트 있는 그룹 (group2 MONTH, 40 hosts) — 결정적 증거
| | 결과 |
|---|---|
| DB BEFORE (6 rows) | **전부 `hosts IS NULL`** (jsonb_array_length=-1) |
| CALL#1 (재집계 유발) | 200, **1217ms(느림=재집계)**, first hostCount 40, **hostsLen 40**, 첫 호스트 cpuAvg 50.33(실제 데이터) |
| DB AFTER call#1 | **8/8 rows `hosts` 채워짐, 각 jsonb_array_length=40** (NULL→실데이터 재저장) ✓ |
| CALL#2 (재조회) | 200, **8ms(빠름=DB히트)** |
| DB 멱등(call#1 vs call#2) | **변경 없음(idempotentDb=true)** ✓ |
| 응답 멱등(call#1==call#2) | **동일값(idempotentVal=true)** ✓ |

### 3.2 빈 그룹의 lazy 재집계 (group3 WEEK, host 0)
- BEFORE 8 rows 전부 `hosts IS NULL`(len=-1) → CALL#1 443ms 후 **전부 `hosts=[]`(len=0)로 재저장**(빈 배열=빈 그룹 정상값, NULL과 구분) → CALL#2 7ms, DB 무변경·값 동일. ✓
  - 계약 §2.2 "빈 배열([])은 재집계하지 않음(NULL과 구분)" — 첫 조회 시 NULL→[]로 1회 채워진 뒤 이후 즉답, 멱등 확인.

### 3.3 group2 WEEK (probe로 선재 백필됨)
- 첫 프로브 호출이 27.8s(8개 NULL 전부 재집계) → 이후 상세 8ms. 재집계 비용은 첫 1회뿐.

재현: `node e2e_report_hosts_lazy.cjs 2 MONTH` / `... 3 WEEK` / `... 8 WEEK`
증거: `e2e_report_hosts_lazy_result.json`(group2 MONTH), `_g3_result.json`, `_g8_result.json`

---

## 4. 빈 그룹 — PASS

`GET /hosts/8/reports?...` (group8 host 0):
- 8개 원소 **전부** `hosts: []`(배열, null 아님), 그룹 `resource` 4키 전부 null. crash 없음.
- 마지막 방어선(toDto `hosts ?? []`)까지 동작 → 응답상 hosts는 항상 배열.

증거: `e2e_report_hosts_relation_result.json` (`emptyGroup8.hostsValue: []`, `allElementsEmptyHosts: true`)

---

## 5. 에러 / 인증 회귀 없음 — PASS

| 케이스 | 기대 | 실제 |
|---|---|---|
| 토큰 없음 + reports | 401 | HTTP 401, code 401, `INVALID_TOKEN` ✓ |
| 미마감 주 상세(periodStart 2026-06-22) | HTTP 200 + `REPORT_PERIOD_NOT_CLOSED` | HTTP 200, code 400, errorCode `REPORT_PERIOD_NOT_CLOSED` ✓ |
| 목록 = 상세 (둘 다 hosts 포함) | 동일 shape | 둘 다 hosts 40개 ✓ |

hosts 증분이 기존 인증/에러/목록=상세 동작을 깨지 않음.

재현: `node e2e_report_hosts_probe.cjs`

---

## 6. 🎯 UI 드롭다운 (핵심, 브라우저) — PASS

group2 `?tab=report` 진입(playwright headless). API ground-truth와 화면값을 직접 대조.

| 시나리오 | 결과 | 증거 |
|---|---|---|
| **기본 "전체(그룹)"** | Host 드롭다운 노출, 값 "All (group)". 표값 == 그룹 resource(cpu 15.61/89.04/0.94 …) **diff 0** | `e2e-hosts-01-default-all.png` |
| **개별 호스트(cpu有) 선택** | `zabbix-server` 선택 → 표값 cpu 44.12/73.67/7.11, memory 76.5/78.92/74.81, disk/traffic "No data" == **API hostWithCpu.resource diff 0**, 그룹값과 다름(differsFromGroup) | `e2e-hosts-02-host-with-cpu.png` |
| **개별 호스트(cpu null) 선택** | `10.220.0.10` → 표 4키 전부 "No data", API null resource와 일치 | `e2e-hosts-03-host-null-cpu.png` |
| **기간 변경 폴백** | 호스트 선택 상태로 기간 2026-06-15→2026-06-01 변경 → 호스트 존재해 선택 유지(정상), crash/console error 0 | `e2e-hosts-04-period-changed.png` |
| **주↔월 토글 폴백** | 호스트(zabbix-server) 선택 후 MONTH 토글 → 그 호스트가 MONTH에도 존재 → 선택 유지(behaviorCorrect), crash 없음 | `e2e-hosts-07-month-toggle.png` |
| **Excel 내보내기(호스트 선택)** | 다운로드 `group-report_WEEK_2026-06-01_10696.xlsx` — 접미사 `_10696`(hostid) 반영 | `e2e-hosts-05-after-export.png` |
| **PDF 내보내기(호스트 선택)** | 다운로드 `group-report_WEEK_2026-06-15_10696.pdf` — 접미사 `_10696` 반영(타임아웃 30s 필요, jsPDF 캡처 지연) | `e2e-hosts-08-after-pdf.png` |
| **빈 그룹(group8) graceful** | Host 드롭다운에 "All (group)"만(개별 호스트 없음), 표 전부 "No data", Export 메뉴 정상, crash 없음 | `e2e-hosts-06-empty-group.png` |

- **화면 표시값 == API hosts[해당].resource** 정확 일치(스크린샷 육안 + 자동 diff 양쪽 확인).
- null metric "No data" 회색 표기 유지(FE가 에러로 오인하지 않음).
- 폴백: group2는 WEEK/MONTH/전기간이 동일 40호스트라 "호스트 사라짐" 강제 트리거가 데이터상 불가했으나, ① cpu null 호스트 선택(S3) ② 빈 그룹 이동(S7) graceful + useEffect 폴백 정적QA PASS로 커버.

재현: `node e2e_report_hosts_ui.cjs` + `node e2e_report_hosts_ui2.cjs`
증거 JSON: `e2e_report_hosts_ui_result.json`, `e2e_report_hosts_ui2_result.json`

---

## 7. Spring 스모크 — 생략 (사유 기록)

- 이번 런타임 검증은 **Nest 경로**로 수행. 검증 시작 시 port 3000을 Spring이 점유했으나, 새 Nest hosts 코드 반영을 위해 Spring을 종료하고 Nest로 교체.
- Spring 스모크는 port 충돌(동시 3000 불가) + 시간 고려로 **생략**. Nest↔Spring 응답 1:1 동일계약은 정적QA(`qa_group-report-hosts.md` §7)에서 확인됨.
- ⚠️ 단, §8의 Flyway 운영 이슈는 Spring 쪽에서 실제 검증 필요(아래).

---

## 8. DB 변경 사항 / 운영 이슈 기록

### 8.1 dev DB 변경(정상 동작 — 그대로 둠)
- Nest 재기동으로 `host_group_report.hosts` jsonb 컬럼 추가(마이그레이션).
- 검증 중 조회한 그룹의 구버전 NULL 스냅샷이 lazy 재집계로 채워짐(정상):
  - 최종: 50 rows 중 **32 filled / 18 NULL**. 채워진 것 = group2(16/16), group3(8 WEEK), group8(8). 미조회 그룹(4·5·6·7·9·10·11·12·13·20·22)은 여전히 NULL — **향후 첫 조회 시 자동 백필**(계약대로).
- 이는 계약 §2.2 lazy migration의 의도된 동작이므로 롤백 불필요.

### 8.2 ⚠️ Spring Flyway V3 운영 이슈 (be-engineer/Spring 확인 권고 — 비차단)
- 검증 시작 시점 DB의 `flyway_schema_history`에 **`V3 host group report` success=t** 로 기록돼 있으나, 실제 테이블엔 `hosts` 컬럼이 **없었다**.
- 원인 추정: V3가 **`ADD COLUMN hosts` SQL을 포함하기 전 버전으로 이미 설치(installed)**됐고, 이후 V3 파일에 `ALTER TABLE ... ADD COLUMN hosts`를 추가해도 Flyway는 **이미 적용된 버전을 재실행하지 않는다**(checksum 변경 시 오히려 validate 실패 가능).
- 영향: **Spring 단독으로 dev DB를 기동하면 hosts 컬럼이 안 생길 수 있다**(이번엔 Nest 마이그레이션이 대신 컬럼을 추가해 가려짐). Spring을 fresh DB에 적용하면 V3가 hosts 포함 버전으로 한 번에 적용되어 정상.
- 권고(Spring 담당): 이미 V3가 설치된 환경을 위해 **별도 신규 버전(V4__add_hosts_column.sql)** 으로 `ADD COLUMN IF NOT EXISTS hosts jsonb`를 분리하거나, dev DB의 V3 재적용/repair 절차를 명시할 것. (Nest 단독·fresh Spring 환경에선 문제 없음 → 차단성 아님.)

---

## 9. 비차단 관찰 (조치 불요)

1. **PDF export console 경고 2건**(`html-to-image`): Google Fonts(Lato) cross-origin css `cssRules` 접근 SecurityError. PDF 다운로드 자체는 **성공**, 폰트 인라인만 실패하는 비차단 경고. hosts 기능과 무관(선재 jsPDF/html-to-image 특성, 기존 group-report E2E와 동일). 책임주체 라우팅 불요.
2. **PDF 다운로드 지연**: jsPDF 캡처가 수초~수십초 걸려 download 이벤트 대기 14s로는 부족, 30s에서 정상. UI 동작 정상이며 hosts와 무관.

---

## 10. 산출물 / 재현

스크립트(`_workspace/`):
- `e2e_report_hosts_probe.cjs` — 인증/hosts채워짐/shape/정렬/목록=상세/에러
- `e2e_report_hosts_lazy.cjs <group> <WEEK|MONTH>` — 구버전 lazy 재집계+멱등(DB 직접 대조)
- `e2e_report_hosts_relation.cjs` — 그룹↔호스트 값 정합 + 빈 그룹 `[]`
- `e2e_report_hosts_ui.cjs` — 호스트 드롭다운 전체↔개별 전환·null·기간변경·Excel/PDF·빈그룹(브라우저)
- `e2e_report_hosts_ui2.cjs` — 폴백(MONTH 토글)·PDF(긴 대기) 보강

결과 JSON: `e2e_report_hosts_probe_result.json`, `e2e_report_hosts_lazy_result.json`(+`_g3`/`_g8`), `e2e_report_hosts_relation_result.json`, `e2e_report_hosts_ui_result.json`, `e2e_report_hosts_ui2_result.json`

스크린샷(`_workspace/`):
- `e2e-hosts-01-default-all.png` (전체=그룹 resource)
- `e2e-hosts-02-host-with-cpu.png` (개별 호스트 zabbix-server, 표값 호스트값)
- `e2e-hosts-03-host-null-cpu.png` (cpu null 호스트, No data)
- `e2e-hosts-04-period-changed.png` (기간 변경)
- `e2e-hosts-06-empty-group.png` (빈 그룹 graceful)
- `e2e-hosts-07-month-toggle.png` (주↔월 토글 폴백)
- `e2e-hosts-08-after-pdf.png` (PDF 후)
- `e2e-hosts-05-after-export.png` (Excel 후)

---

## 11. 책임 주체별 권고

| 주체 | 조치 |
|---|---|
| be-engineer (Nest) | **없음** — hosts API/정렬/lazy 재집계/멱등/빈그룹/에러 전부 계약대로 |
| fe-engineer | **없음** — 드롭다운/전환/null/기간폴백/Excel·PDF 접미사/빈그룹 전부 정상 |
| be-engineer (Spring) | **권고(비차단)** — §8.2 Flyway V3 운영 이슈: 기설치 V3 환경에서 hosts 컬럼 추가가 누락될 수 있음 → 신규 버전(V4)으로 분리 또는 repair 절차 명시 |

**클로즈드 루프 종료. PASS / 런타임 버그 0건.**
(Nest hosts 증분 = 계약 정답. Spring은 정적QA 1:1 PASS이나 Flyway 운영 흐름만 §8.2 확인 권고.)
