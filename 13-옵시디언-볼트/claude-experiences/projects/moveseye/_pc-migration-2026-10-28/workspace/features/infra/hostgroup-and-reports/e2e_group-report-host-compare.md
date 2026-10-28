# E2E 런타임 검증 — 그룹 리포트 호스트별 자원 비교 막대 차트 (group-report / host-compare)

검증자: functional-qa / 2026-06-22
방식: 실제 앱(기존 가동 BE :3000 + FE :5173) → 로그인 → API ground-truth 산출 → 브라우저(headless chromium) 막대값 대조 + metric/agg 토글 + 빈상태/회귀
진실원천: `_workspace/features/infra/hostgroup-and-reports/contract_group-report-hosts.md`(`hosts[].resource[metric].{avg,max,min}|null`)
선행 재사용: `_workspace/features/infra/hostgroup-and-reports/e2e_group-report-hosts.md`(환경/기동/로그인 패턴), FE 신규 `HostGroupReportHostCompare.tsx` + 훅 `useGroupReportHostCompare.ts`
대상 변경: **순수 FE 차트 추가**(BE 무변경, 응답 `hosts[]` 그대로 소비)

## 종합 판정: **PASS (런타임 버그 0건, 차단성 0)**

호스트별 자원 비교 막대 차트가 자원 섹션 **상단**에 정상 렌더되고, 막대값/정렬/단위/토글/빈상태/기간갱신/회귀가 모두 계약·API와 **값 수준까지** 일치.
비차단 관찰 2건(§빈상태 traffic의 bytes 포맷은 데이터 부재로 라이브 미검증 / 무관 `/assets` 500)만 기록.

---

## 0. 환경 / 기동

| 항목 | 상태 |
|---|---|
| BE | port 3000 **기존 가동분 재사용(java/Spring)**. hosts API 프로브 200·정상 반환(group2 WEEK first 40 hosts) 확인 후 ground-truth로 사용. 이번 작업 BE 무변경이라 재기동 불요 |
| FE | Vite port 5173 **기존 가동분 재사용(node)**. Vite가 신규 `HostGroupReportHostCompare.tsx` 소스를 서빙(HMR 반영됨) — 재기동 불요 |
| DB | dev `dmove`. group2(40 hosts)/group8(0 hosts) 사용 |
| 로그인 | admin / <dev-admin-pw>, `x-visitor-id` 헤더 필수, 토큰 TTL 24h. 토큰 없거나 visitor-id 없으면 401 |
| node | `C:\Users\DMOVE\AppData\Local\nvm\v24.12.0\node.exe` |
| chromium | `...\ms-playwright\chromium-1223\chrome-win64\chrome.exe` (playwright는 `_workspace/node_modules`) |

> 막대값 측정 방법: 차트는 ECharts canvas라 DOM 텍스트가 없고 `window.echarts` 전역 미노출이라 `getInstanceByDom` 불가.
> 대신 DmoveChart의 **"데이터 보기" 모달**(`hasShowDataButton`, `getDataSourceChart`가 xAxis.data×series=막대값을 표로 렌더)에서 호스트↔값을 읽어 API와 대조. 모달 표값 == 막대값 == 사용자 가시값.

API ground-truth (group2 WEEK first, periodStart 2026-06-15, hostCount 40):
- cpu non-null **6** / memory non-null **6** / disk non-null **4** / traffic non-null **0**.

---

## 1. 차트 렌더 + 상단 배치 — PASS

- 리포트 탭(`group2 ?tab=report`) 자원 섹션 **최상단**에 "Host comparison" 카드 렌더(canvas 1개, Empty 아님, "데이터 보기" 버튼 1개).
- 기본 **metric=CPU·agg=Avg**로 호스트별 막대가 그려짐.
- DOM 순서 검증: `compareCard.compareDocumentPosition(summaryCard)` → **compareBeforeSummary: true** (비교 차트가 "Resource summary"(기존 호스트 드롭다운+표)보다 위).
- 증거: `e2e-hostcompare-01-default-cpu-avg.png`(상단 막대차트 + 하단 "Host: All (group)" 드롭다운 + Resource summary 표).

## 2. 🎯 화면값 == API값 + 정렬 내림차순 — PASS

`GET /hosts/2/reports?periodType=WEEK&limit=8` first 응답의 `hosts[].resource.cpu.avg`와 막대값 직접 대조:

| 순위 | 호스트 | 화면 막대값 | API cpu.avg | 일치 |
|---|---|---|---|---|
| 1 | zabbix-server | 44.12 | 44.12 | ✓ |
| 2 | 10.220.0.92 | 16.55 | 16.55 | ✓ |
| 3 | 10.220.0.92_test_1 | 16.55 | 16.55 | ✓ (동률 hostName asc) |
| 4 | 10.220.0.52 | 9.31 | 9.31 | ✓ |
| 5 | 10.220.0.70 | 3.6 | 3.6 | ✓ |
| 6 | 10.220.0.93 | 3.52 | 3.52 | ✓ |

- **diff 0** (tolerance 0.011). 막대 개수 6 = cpu non-null 호스트 6.
- **값 내림차순 정렬** 정확(44.12→16.55→16.55→9.31→3.6→3.52), 동률(16.55) 시 hostName 오름차순.
- 증거: `e2e-hostcompare-01-default-cpu-avg.png`, `e2e_hostcompare_ui_result.json`(s1_default_cpu_avg.diff=[]).

## 3. metric 토글 (CPU→메모리→디스크→트래픽) — PASS

| metric | 막대 개수 | 화면값==API(diff) | 비고 |
|---|---|---|---|
| Memory | 6 | **0** | 정렬이 cpu와 다른 순서(메모리 값 기준 재정렬) — zabbix-server=76.5 top, 10.220.0.70=68.73 … |
| Disk | **4** | **0** | 10.220.0.70=48.77→10.220.0.52=26.28→10.220.0.93=11.16→10.220.0.92=7.2. 막대 수 6→4로 감소 |
| Traffic | **0(Empty)** | — | "No data" 빈 상태(아래 §6) |

- 단위: cpu/memory/disk는 **`%`** 표기(formatValue), traffic만 bytes 경로.
- 증거: `e2e-hostcompare-04-memory-avg.png`, `e2e-hostcompare-05-disk-avg.png`(막대 4개 육안 확인), `e2e-hostcompare-06-traffic-empty.png`.

> ⚠️ **traffic의 formatBytes 라이브 미검증(비차단)**: dev DB 전 그룹·전 기간을 스캔(`e2e_hostcompare_traffic_find.cjs`)했으나 **host별 traffic이 모두 null**이라 traffic 막대가 그려지는 케이스가 없음 → bytes 축/툴팁 포맷을 라이브로 직접 못 봄.
> 코드상으론 traffic일 때 `getUnit=BYTES`, yAxis axisLabel·tooltip·formatValue 전부 `formatBytes` 사용으로 정적 확인됨. 데이터 환경 한계(차트 결함 아님).

## 4. agg 토글 (avg→max→min) — PASS

cpu 고정, agg 전환 시 막대값·정렬이 해당 집계로 변경:

| agg | top 호스트 | 화면값==API(diff) |
|---|---|---|
| avg | zabbix-server (44.12) | 0 |
| max | (재정렬) | 0 |
| min | (재정렬) | 0 |

- **max ≥ avg ≥ min 관계**(zabbix-server): max 73.67 ≥ avg 44.12 ≥ min 7.11 → **ok: true**.
- agg 전환 시 정렬도 값 따라 재계산됨(avg top과 max top 호스트가 다름 — API와 일치).
- 증거: `e2e-hostcompare-02-cpu-max.png`, `e2e-hostcompare-03-cpu-min.png`, `e2e_hostcompare_ui_result.json`(s2_agg_toggle).

## 5. null 호스트 제외 — PASS

- 전체 40 호스트 중 막대는 수집 호스트만: cpu 6 / memory 6 / **disk 4** / traffic 0.
- disk: cpu(6) 대비 막대 **줄어듦**(diskFewerThanCpu: true), 전체 호스트수(40) 대비 4개만(diskFarFewerThanHosts: true) — **null metric 호스트가 0으로 안 그려지고 막대에서 빠짐**(스크린샷 육안).
- traffic: 다수 null이 아니라 **전부 null** → 막대 0 → Empty(trafficEmpty: true).
- 증거: `e2e-hostcompare-05-disk-avg.png`(막대 4개), s3b_null_exclusion.

## 6. 빈 상태 (Empty) — PASS

- **traffic(전 호스트 null)**: 카드가 ECharts canvas 대신 antd `Empty`("No data") 렌더(hasEmpty:true, hasCanvas:false). NaN 막대·0 막대·crash 없음.
  - 근거: `hasValueOfChart(series)`가 series.data=[] 이면 false → DmoveChart가 Empty 분기.
- **빈 그룹(group8, host 0)**: 리포트 탭 진입 시 host-compare 카드가 Empty(found:true, hasEmpty:true, hasCanvas:false) — **graceful: true**. crash 없음.
- 증거: `e2e-hostcompare-06-traffic-empty.png`, `e2e-hostcompare-08-empty-group.png`, `e2e_hostcompare_month_result.json`(emptyGroup).

## 7. 주/월 · 기간 변경 갱신 — PASS

- 주(WEEK 2026-06-15)→월(MONTH) 토글 시 차트가 **새 기간 hosts로 갱신**:
  - month cpu/avg 막대: zabbix-server=50.33, 10.220.0.92=16.37, 10.220.0.92_test_1=16.37, 10.220.0.52=8.93, 10.220.0.93=3.56, 10.220.0.70=3.28.
  - API `periodType=MONTH` first(2026-05-01)의 expected와 **diff 0**, week 막대값과 **다름**(changedFromWeek: true).
- 증거: `e2e-hostcompare-07-month-cpu-avg.png`, `e2e_hostcompare_month_result.json`(monthDiff=[]).

## 8. 기존 기능 회귀 없음 — PASS

- group2 리포트 탭에 **host-compare 카드 + 기존 "Resource summary" 카드 둘 다 존재**, host 드롭다운("All (group)") + 개별 자원 표(per-host) 그대로 동작(hasTable:true, hostDropdown:true).
- 비교 차트는 자원 섹션 **상단**, 드롭다운+표는 **하단**에 유지(compareBeforeSummary:true).
- console error 0(앱 무관 노이즈 필터 후): antd "Modal static function context" 경고(선재)·`/assets` 500·`cssRules` SecurityError만 잔존, host-compare와 무관.
- 증거: `e2e-hostcompare-09-regression.png`, s7_regression.

---

## 9. 비차단 관찰 (조치 불요)

1. **traffic bytes 포맷 라이브 미검증**: dev DB에 host별 traffic 데이터가 전무(전 그룹·전 기간 null)라 traffic 막대 렌더(formatBytes 축/툴팁) 케이스를 라이브로 못 봄. 코드 정적 확인은 정상. 데이터 환경 한계이며 차트 결함 아님. (traffic 데이터가 들어오는 환경에서 재확인 권고 — 비차단.)
2. **무관 `/assets` 500 + console 경고**: 리포트 탭 진입 시 사이드바/자산 프리페치로 추정되는 `GET /assets?...` 500 다수 + antd Modal static-context 경고. host-compare/리포트 hosts와 무관(BE 무변경, 선재 현상). 책임주체 라우팅 불요.
3. **동일 x-visitor-id 다중 세션 401(테스트 아티팩트)**: 초기 UI 스크립트가 같은 visitor-id로 직접 fetch + 브라우저 세션을 병행하던 시점에 일부 `/hosts` 요청 401 발생. 단독 브라우저 세션 재실행(`e2e_hostcompare_month.cjs`)에선 401 0건·전 항목 PASS. 차트/인증 동작 결함 아님(서버의 visitor-id 단일세션 정책 + 테스트 동시성).

---

## 10. 산출물 / 재현 (`_workspace/`)

스크립트:
- `e2e_hostcompare_ui.cjs` — 차트 렌더·cpu/avg 막대값↔API·agg 토글(max/min)·metric 토글(memory/disk/traffic Empty)·null 제외
- `e2e_hostcompare_month.cjs` — 주→월 갱신·빈 그룹 graceful·회귀(상단배치/드롭다운/표) (단독세션 재검)
- `e2e_hostcompare_traffic_find.cjs` — traffic non-null 호스트 전수 탐색(결과: 없음)
- `e2e_hostcompare_probe_dom.cjs` / `_dom2.cjs` — 카드/Segmented/echarts 인스턴스 구조 프로브

결과 JSON: `e2e_hostcompare_ui_result.json`, `e2e_hostcompare_month_result.json`, `e2e_hostcompare_traffic_find.json`, `e2e_hostcompare_dom_dump.json`, `e2e_hostcompare_dom_dump2.json`

스크린샷:
- `e2e-hostcompare-01-default-cpu-avg.png` (상단 막대차트 + 하단 드롭다운/표, cpu/avg 6막대 내림차순)
- `e2e-hostcompare-02-cpu-max.png` / `e2e-hostcompare-03-cpu-min.png` (agg 토글)
- `e2e-hostcompare-04-memory-avg.png` (memory 6막대) / `e2e-hostcompare-05-disk-avg.png` (disk 4막대=null 제외)
- `e2e-hostcompare-06-traffic-empty.png` (traffic Empty "No data")
- `e2e-hostcompare-07-month-cpu-avg.png` (월별 갱신) / `e2e-hostcompare-08-empty-group.png` (빈 그룹 graceful)
- `e2e-hostcompare-09-regression.png` (회귀: 비교차트 상단 + summary/드롭다운/표 하단)

---

## 11. 책임 주체별 권고

| 주체 | 조치 |
|---|---|
| fe-engineer | **없음(차단성 0)** — 렌더/상단배치/막대값정합/정렬/metric·agg토글/null제외/Empty/기간갱신/회귀 전부 계약대로 PASS. 단 §9-1: traffic 데이터가 있는 환경에서 bytes 축/툴팁(formatBytes)을 1회 추가 확인 권고(비차단, 데이터 부재로 이번 라이브 미검증). |
| be-engineer | **없음** — 이번 작업 BE 무변경. `/assets` 500은 본 기능과 무관(별도 조사 대상이면 분리 처리). |

**클로즈드 루프 종료. PASS / 런타임 버그 0건.** (라이브 에이전트 부재로 SendMessage 대신 본 보고서로 권고 전달.)
</content>
