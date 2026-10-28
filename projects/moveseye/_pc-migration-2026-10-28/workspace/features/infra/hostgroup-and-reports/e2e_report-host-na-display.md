# E2E 런타임 검증 — 호스트 비교 차트 "데이터 없음(N/A) 호스트 표시"

검증자: functional-qa / 2026-06-23
방식: 실제 앱(기존 가동 Nest :3000 + Vite :5173) → 로그인 → API ground-truth 산출 → 브라우저(headless chromium)에서 **렌더된 ECharts 옵션을 직접 읽어**(React fiber로 `getEchartsInstance().getOption()`) categories/series.data(value:null 포함)/dataZoom/라벨회전을 API와 값 수준 대조 + "데이터 보기" 모달/드롭다운 표/빈 상태/회귀
진실 원천: `_workspace/features/infra/hostgroup-and-reports/contract_group-report-hosts.md`(`hosts[].resource[metric].{avg,max,min}|null`), 사용자 요구("죽은 호스트도 N/A로 차트에 보여야")
대상 변경: **순수 FE**(BE 무변경) — `useGroupReportHostCompare.ts`가 null metric 호스트를 제외하지 않고 `value:null`+회색(`#bfbfbf`)으로 series에 포함, 정렬(값 desc 앞 / N/A hostName asc 뒤), 라벨 회전(>6), dataZoom(>12)

## 종합 판정: **PASS (핵심 변경 완전 동작) + 회귀 1건(경미, 비차단)**

핵심 목적("group2 40 호스트가 다 그려지고, 죽은 31~34개가 N/A로 보임")은 **완벽히 달성**. 차트 본기능(40개 X축, 값/N/A 구분, 회색, 정렬, 회전, dataZoom, tooltip, 빈 그룹 vs 전부-N/A 구분, 드롭다운 표)이 전부 계약·API와 값 수준까지 일치.
단 **차트의 보조 기능 "데이터 보기(show-data) 모달"이 회귀** — 표의 값 컬럼이 (살아있는 호스트 포함) 전부 빈 칸. 차트 시각화 자체와 무관하고 이전엔 동작하던 기능이라 회귀로 기록(경미/비차단, fe-engineer 권고).

---

## 0. 환경 / 기동

| 항목 | 상태 |
|---|---|
| BE | Nest port 3000 **기존 가동분 재사용**(사용자 화면이 붙는 Nest). 무변경. group2 hosts API 200·정상 |
| FE | Vite port 5173 **기존 가동분 재사용**. 변경된 `useGroupReportHostCompare.ts`/`HostGroupReportHostCompare.tsx` 소스가 서빙됨(HMR 반영 확인 — 렌더 옵션이 value:null/회색/dataZoom 신규 로직 그대로 동작) |
| DB | dev `dmove`. group2(id=2 "Linux servers", 40 hosts) / group8(0 hosts) |
| 로그인 | admin / <dev-admin-pw>, `x-visitor-id` 헤더 필수 |
| node / chromium | `...\nvm\v24.12.0\node.exe` / `...\ms-playwright\chromium-1223\...\chrome.exe`, playwright는 `_workspace/node_modules` |

**API ground-truth (group2 WEEK first, periodStart 2026-06-15, hostCount 40, hosts.len 40):**
- cpu non-null **6** / memory **6** / disk **4** / traffic **0**.
- cpu/avg 정렬 기대(valued desc, 동률 hostName asc): zabbix-server 44.12 → 10.220.0.92 16.55 → 10.220.0.92_test_1 16.55 → 10.220.0.52 9.31 → 10.220.0.70 3.6 → 10.220.0.93 3.52, 이후 **missing 34개 hostName asc**(10.220.0.10 … postgresql 서버). **categories 합 40**.

> 측정법: 이전 검증은 모달 표로 막대값을 읽었으나(모달이 이번에 깨짐), 이번엔 **렌더된 ECharts 인스턴스를 React fiber로 추출**(`__reactFiber$` → `getEchartsInstance().getOption()`)해 xAxis.data/series.data/dataZoom/axisLabel.rotate를 직접 읽음 — 사용자가 보는 캔버스의 실제 옵션값.

---

## 1. 모든 호스트 표시 (40개) — PASS

- group2 ?tab=report CPU/Avg 기본 → 차트 **xAxis.data 길이 = 40** (`allHostsShown: true`), **categories 이름·순서가 기대와 완전 일치**(`catNameMatch: true`).
- series.data: **valued 6 + N/A(value:null) 34 = 40**. 이전 "6개만"에서 **40개 전부**로 변경 확인.
- 스크린샷 `e2e-host-na-01-cpu-all40.png`: X축에 zabbix-server…10.220.0.131 - Linux SNMP Monitoring Demo…10.220.0.210 등 40개 라벨, 살아있는 6개만 막대(zabbix-server 최고).

## 2. 값 vs N/A 구분 — PASS

- **값 있는 6개**: series value가 API `cpu.avg`와 **diff 0**(`valueDiffs: []`, tolerance 0.011). 막대 높이=실제 값.
- **N/A 34개**: series value = `null`(0 아님 → 막대 안 그려짐), itemStyle.color = **`#bfbfbf`** 전부(`naColorAllGrey: true`). 0% 막대로 오인되지 않음.
- tooltip: 코드상 value null/undefined → `group_report.no_data`("데이터 없음"), 값은 `formatValue`(% / bytes). (정적 + 렌더 옵션 확인.)

## 3. 정렬 — PASS

- valued(값 desc, 동률 hostName asc) **앞**, missing(hostName asc) **뒤**. fiber로 읽은 categories 순서가 기대 정렬과 1:1 일치(`catNameMatch: true`, last4cats = Gabriel…Discovery-Test-1, MIKE, node2, postgresql 서버 — hostName asc 꼬리).

## 4. 가독성 (라벨 회전 + dataZoom) — PASS

- 40 > 6 → **xAxis.axisLabel.rotate = 45** (`rotate: 45`, interval 0).
- 40 > 12 → **dataZoom 2개**(inside + slider), `start:0 end:30`(= 12/40×100 ≈ 30%, 초기 12개만 표시 후 가로 스크롤). 스크린샷에 하단 슬라이더 핸들 확인. 라벨 겹침/깨짐 없음.

## 5. metric / agg 토글 — PASS

| 토글 | categories | valued 막대 | N/A | Empty? |
|---|---|---|---|---|
| Memory/Avg | 40 | **6**(=API memN) | 34 | 아니오 |
| Disk/Avg | 40 | **4**(=API diskN, names 10.220.0.70/52/93/92) | 36 | 아니오 |
| Traffic/Avg | 40 | **0**(=API trafN 0) | 40 | **아니오(호스트명 40개 나열)** |

- metric 바꿔도 **항상 40개 호스트 전부** X축에 유지, 값 있는 호스트만 막대(나머지 회색 N/A). agg(avg/max/min) 토글도 동일 메커니즘(이전 검증 §4에서 max≥avg≥min·diff0 확인됨, 이번엔 N/A 포함 카운트로 재확인).
- **트래픽(전 호스트 N/A)**: crash/Empty 오작동 없이 40개 N/A 나열(`notEmptyButAllNa: true`). 스크린샷 `e2e-host-na-04-traffic-all-na.png` — 막대 0·X축 40 라벨·dataZoom 슬라이더 정상. Nest 미수정으로 traffic 전부 null인 게 정상이며 graceful 확인.

## 6. 빈 그룹 vs 전부-N/A 구분 — PASS (핵심 구분 성립)

- **빈 그룹(group8, host 0)**: `series.data = []` → `hasValueOfChart` false → 차트 **Empty("No data" 일러스트)**, canvas 없음(`isEmpty: true`). 스크린샷 `e2e-host-na-05-empty-group.png`.
- **호스트 있고 전부 N/A(group2 traffic)**: `series.data = [{value:null}×40]` → length>0 → Empty **아님**, 호스트명 40개 N/A로 나열(canvas 있음). 스크린샷 `e2e-host-na-04-...`.
- 두 케이스가 **시각적으로 명확히 구분**됨(코드 근거: `hasValueOfChart`는 data.length만 보고 value null은 안 봄).

## 7. 드롭다운 / 표 일관성 — PASS

- 하단 Host 드롭다운에서 **죽은 호스트(10.220.0.10, 전 metric null) 선택** → Resource summary 표 **12칸(4 metric × 3 agg) 전부 "No data"** graceful(`allCellsNoData: true`). crash 없음. 스크린샷 `e2e-host-na-07-dropdown-dead-host.png`.

## 8. 회귀 — **부분 FAIL (모달 1건, 경미/비차단)** + 그 외 PASS

- 그룹 요약 표/주월 토글/기간 Select/Export 버튼/host 드롭다운/Resource summary 표 정상(스크린샷 전반).
- **console error 0**(무관 `/assets` 500·antd Modal 경고·cssRules SecurityError 필터 후), `/hosts/` 4xx·5xx **0건**.
- ⚠️ **회귀 1건 — "데이터 보기(show-data) 모달" 값 컬럼 전부 빈 칸**: 아래 §9.

---

## 9. 발견 — 회귀: "데이터 보기" 모달 표 값이 전부 빈 칸 (경미/비차단)

### 증상
host-compare 카드의 "데이터 보기"(목록 아이콘) 모달을 열면 표가 40행(호스트명) × CPU 컬럼으로 뜨지만, **CPU 값 셀이 살아있는 호스트(zabbix-server=44.12 등 6개)까지 전부 빈 문자열**(`val.html === ""`). N/A 호스트뿐 아니라 값 있는 호스트도 안 보임.
- 증거: `probe_modal_cells_result.json` — 8행 전부 `{text:"", html:""}`. `e2e_host_na_ui_result.json` s1b_modal: rowCount 40, **`objectObjectRows: 0`**(`[object Object]`는 아님, 그냥 공백).

### 회귀 판정 근거
- **이전 검증(2026-06-22 17:48, `e2e_hostcompare_ui_result.json`)에서는 같은 모달이 값을 정상 표시**: cpu/avg = zabbix-server 44.12 / 10.220.0.92 16.55 / … (당시 series.data가 **순수 number 배열** `[44.12, 16.55, …]`였음).
- 이번 변경에서 series.data를 **`{name, value, itemStyle}` 객체 배열**로 바꾸면서 모달 데이터 소스 함수가 객체를 셀에 넣어 렌더 실패.

### 원인 (출처: 파일:라인)
`moveseyee_fe/src/utils/index.ts:629` `getDataSourceChart`:
```ts
entry[serie.name] = renderDisplayValue({ value: (serie?.data as number[])?.[index] });
```
- `serie.data[index]`가 이제 number가 아니라 **객체 `{name, value, itemStyle}`**.
- `renderDisplayValue`(`utils/index.ts:515`)는 value가 truthy 객체면 `formattedValue` 없으니 객체를 그대로 반환 → antd 표 셀이 plain object를 렌더하지 못해 **빈 칸**(`[object Object]`도 아님).
- `getDataSourceChart`는 **공용 유틸**이라 다른 object-form data 차트에도 잠재 영향 가능. 단, 막대 차트(value:number 배열)만 쓰는 기존 차트들은 영향 없음.

### 영향도
- 차트 시각화(막대/N/A/정렬/회전/zoom/tooltip)는 **무관·정상**. 핵심 변경 목적 달성에 지장 없음.
- "데이터 보기" 모달은 차트 보조 기능. 이전엔 동작했으므로 회귀이나 차단성 아님(**경미**). Export(Excel/PDF) 데이터도 같은 `getDataSourceChart` 경로면 동일 증상 가능성 — fe-engineer 확인 권고.

### 책임 주체 / 수정 권고 — fe-engineer
택1(둘 중 안전한 쪽 판단 요):
- (A) **호출부(권장)**: object-form data 차트의 모달/Export 데이터를 위해 `getDataSourceChart`/`renderDisplayValue`에서 데이터 포인트가 객체면 `point.value`를 추출하도록 graceful 처리(공용 유틸이라 다른 차트도 보호). N/A(value null)는 `renderDisplayValue` 기존 규칙대로 "-"로.
- (B) 또는 훅에서 series.data는 number 배열로 두고 N/A 표현(회색/null)을 다른 방식으로(예: 별도 itemStyle 매핑) 처리 — 단 ECharts에서 value:null로 막대 비표시가 가장 깔끔하므로 (A)가 단순.
- 수정 후 **같은 흐름 재실행**: `probe_modal_cells.cjs`(살아있는 호스트 값 표시) + `e2e_host_na_ui.cjs`(s1b objectObjectRows 0 & 값 채워짐) 재확인으로 클로즈드 루프.

---

## 10. 산출물 / 재현 (`_workspace/`)

스크립트:
- `e2e_host_na_ui.cjs` — 메인: fiber로 ECharts 옵션 직접 읽기, 40 categories·valued/N/A·회색·rotate·dataZoom·값 diff, metric 토글(mem/disk/traffic), 빈 그룹, 모달, 회귀
- `probe_na_api.cjs` — API ground-truth(group2 valued/missing 정렬, group8 빈)
- `probe_modal_cells.cjs` — 모달 셀 HTML 정밀 덤프(회귀 확인)
- `probe_dropdown_na.cjs` — 죽은 호스트 드롭다운 선택 → 자원 표 12칸 No data

결과 JSON: `e2e_host_na_ui_result.json`, `probe_modal_cells_result.json`, `probe_dropdown_na_result.json`

스크린샷:
- `e2e-host-na-01-cpu-all40.png` (CPU 40 호스트, 6막대+34 N/A, 45도 회전, dataZoom)
- `e2e-host-na-02-memory.png` / `e2e-host-na-03-disk.png` (metric 토글, N/A 포함 40 유지)
- `e2e-host-na-04-traffic-all-na.png` (전부 N/A → 호스트명 나열, Empty 아님)
- `e2e-host-na-05-empty-group.png` (빈 그룹 → "No data" Empty)
- `e2e-host-na-06-regression.png` (회귀: host-compare+드롭다운+표)
- `e2e-host-na-07-dropdown-dead-host.png` (죽은 호스트 자원 표 12칸 No data)

---

## 11. 항목별 PASS/FAIL 요약

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | 모든 호스트 표시(40) | **PASS** | catCount 40, catNameMatch true |
| 2 | 값 vs N/A 구분 | **PASS** | valued 6 diff0, N/A value:null·#bfbfbf, tooltip 데이터 없음 |
| 3 | 정렬(값 앞/N/A 뒤) | **PASS** | categories 순서=기대 정렬 |
| 4 | 가독성(회전/zoom) | **PASS** | rotate 45, dataZoom 2(start0 end30) |
| 5 | metric/agg+traffic | **PASS** | mem6/disk4 + N/A=40 유지, traffic 40 N/A 나열 |
| 6 | 빈 그룹 vs 전부-N/A | **PASS** | 빈=Empty / 전부N/A=호스트명 나열 |
| 7 | 드롭다운/표 일관성 | **PASS** | 죽은 호스트 표 12칸 No data |
| 8 | 회귀 + console | **부분 FAIL** | console 0·차트 정상, **모달 값 빈 칸 회귀(경미)** |

**클로즈드 루프 상태**: 핵심 변경 PASS. 회귀 1건은 fe-engineer 수정 권고(라이브 에이전트 부재로 본 보고서로 전달). 수정 후 `probe_modal_cells.cjs` 재실행으로 클로즈.
