# 포트폴리오 간트 완성률 오버레이 설계서

> 슬러그: `gantt-completion-overlay` · 작성: feature-architect · 2026-06-29
> 성격: **프론트 전용 시각화 개선. 백엔드/resolver 변경 0.** 기존 prop(`completionRate`)만 추가 소비.

---

## 1. 개요 / 영향 범위

- **백엔드:** 변경 없음. resolver·서비스·DB·집계(`portfolioAggregate.js`) 모두 불변.
- **프론트:** 단일 위젯 수정 — `static/ui/src/pages/portfolio/widgets/PortfolioScheduleGantt.jsx`.
  - ECharts custom `renderItem`에 완성률 lane 1개 추가
  - `value` 배열에 `completionRate` 1개 추가
  - 툴팁에 완성률 줄 추가
  - 표에 완성률 컬럼 추가
- **DB:** 변경 없음.
- **i18n:** `locales/kr/portfolio.json`·`locales/en/portfolio.json`의 `gantt` 블록에 키 2개 추가(`completion`, `colCompletion`) + `desc`/`info.calc`/`info.interp` 3개 갱신. 이후 `cd static/ui && npm run merge`.

검증 사실(코드 직접 Read):
- `completionRate`, `scheduleRate`는 **0~1 비율**. (`PortfolioProjectTable.jsx:15` `pct(v)=Math.round(v*100)%` → `p.completionRate`(L92)/`p.scheduleRate`(L93)에 적용. `portfolioAggregate.js`도 0~1 전제로 `completionRate/scheduleRate` 연산.)
- 간트의 현재 경과율 `el`은 **백엔드 `scheduleRate`가 아니라 프론트 캘린더 계산**(`calElapsed`). 이번 변경에서도 경과 lane은 `calElapsed` 유지(기존 동작 비파괴). `scheduleRate`는 이 위젯에서 소비하지 않음(의도).

---

## 2. 오버레이 시각화 방식 (1안 확정)

### 확정안: **2-lane(트랙) 막대 — 위 lane=일정 경과(파랑), 아래 lane=완성률(초록)**

한 행(row)을 수직으로 두 트랙으로 분할한다. 두 트랙 모두 동일한 `start~end` 전체 폭을 배경으로 깔고, 각자 채움 길이를 가진다.

| 트랙 | 의미 | 배경 | 채움 | 채움 끝 위치 |
|------|------|------|------|-------------|
| 위 (time lane) | 일정 경과(시간) | `REMAIN #DFE3E8` | `ELAPSED #0052CC`(파랑, 기존) | 오늘(`todayPx`) — '오늘' 점선과 일치 |
| 아래 (progress lane) | 완성률(진척) | `PROG_TRACK #EBECF0`(신규, 옅은 회색) | `COMPLETION #36B37E`(초록, 신규) | 완성률 위치(`completionPx`) |

### 근거 (마커안 대비 lane안 채택)
- 후보(a) 마커(다이아몬드/세로선)는 완성률을 **점**으로만 표현 → 크기(얼마나 진척?)를 한눈에 못 읽고, '오늘' markLine과 시각적으로 겹쳐 모호해짐.
- 확정안(b) lane은 완성률을 **길이**(start→completion)로 표현 → 같은 행에서 위(경과 길이)·아래(완성 길이)를 수직 비교 = 즉각적 "어느 쪽이 더 긴가" 판독.
- **이중 인코딩**(색=파랑/초록 + 위치=위/아래 트랙)으로 "단일 파란 progress bar 오독" 결함을 구조적으로 제거.
- 두 lane이 동일 `start~end` 폭을 공유하므로 채움 끝의 수평 위치가 직접 비교 가능. '오늘' 점선이 두 lane을 수직 관통 → 초록 끝이 점선 왼쪽=지연이 즉시 보임(InfoTip interp가 관측 가능해짐).

### renderItem 좌표 계산 (구체)

기존 `renderItem`의 `params`/`api` 패턴을 그대로 사용한다. 추가/변경 지점:

```
// 신규 색상 상수 (파일 상단, ELAPSED/REMAIN 옆)
const COMPLETION = "#36B37E";   // 완성률(초록, Atlaskit G300)
const PROG_TRACK = "#EBECF0";   // 완성 lane 배경(옅은 회색)

// renderItem 내부
const ci    = api.value(0);
const start = api.value(1);
const end   = api.value(2);
const el    = api.value(3);
const compRaw = api.value(4);                 // 신규: completionRate (0~1 or null)
const hasComp = compRaw != null;              // null/undefined → 완성 데이터 없음
const comp  = hasComp ? Math.min(Math.max(compRaw, 0), 1) : 0;  // [0,1] 클램프(>1 → 1)

const startPx = api.coord([start, ci]);
const endPx   = api.coord([end, ci]);
const now     = Math.min(Math.max(Date.now(), start), end);
const todayPx = api.coord([now, ci]);

// 완성률 → 막대상 픽셀: completionMs = start + comp*(end-start)
const completionMs = start + comp * (end - start);
const completionPx = api.coord([completionMs, ci]);

const totalW    = Math.max(1, endPx[0]   - startPx[0]);
const elapsedW  = Math.max(0, todayPx[0] - startPx[0]);
const compW     = Math.max(0, completionPx[0] - startPx[0]);

// 2-lane 레이아웃 (행 밴드 높이 기준으로 위/아래 분할, 전체를 수직 중앙 정렬)
const rowH  = api.size([0, 1])[1];
const barH  = Math.max(7, rowH * 0.32);   // time lane 높이
const progH = Math.max(4, rowH * 0.16);   // progress lane 높이
const gap   = 2;
const totalH = barH + gap + progH;
const top    = startPx[1] - totalH / 2;
const timeY  = top;
const progY  = top + barH + gap;
```

children 구성(순서 = z-order, 뒤가 위):

1. time lane 배경: `rect {x:startPx[0], y:timeY, width:totalW, height:barH, r:3}` fill `REMAIN`
2. time 경과 채움: `rect {x:startPx[0], y:timeY, width:elapsedW, height:barH, r:3}` fill `ELAPSED`
3. progress lane 배경: `rect {x:startPx[0], y:progY, width:totalW, height:progH, r:2}` fill `PROG_TRACK`
4. progress 완성 채움: **`hasComp`일 때만** `rect {x:startPx[0], y:progY, width:compW, height:progH, r:2}` fill `COMPLETION`
5. 우측 라벨 text: `{x:endPx[0]+6, y:startPx[1], textVerticalAlign:"middle", font:"11px sans-serif"}`
   - 텍스트 = `hasComp ? pct(comp) : pct(el)` (완성률 우선, 없으면 경과율 폴백)
   - fill = `hasComp ? COMPLETION : "#42526E"` (완성률일 땐 초록으로 표시)

> markLine(오늘 점선)은 기존 그대로. 이제 두 lane을 수직 관통하므로 완성 끝과의 비교가 가능.
> 레전드: ECharts custom series 레전드는 다루기 번거로워 **미포함**. 색 구분은 우측 라벨 색 + InfoTip `calc`(파랑/초록 설명)로 전달. (선택 개선: 추후 위젯 상단 인라인 범례.)

---

## 3. 툴팁 / 표 변경

### 3-1. value 배열 확장
현재: `value: [i, r.start, r.end, calElapsed(r.start, r.end)]`
변경: `value: [i, r.start, r.end, calElapsed(r.start, r.end), r.completionRate]`

`rows` useMemo의 매핑 객체에 `completionRate: p.completionRate ?? null` 추가(원본 0~1 유지, 미존재 시 null). 클램프는 renderItem/표시 단계에서 수행(원본 보존).

> **주의:** `rows` 필터(`start!=null && end!=null && end>=start`)는 그대로 → 차트는 일정 설정 프로젝트만. completionRate가 있어도 일정 없으면 차트에서 제외(현행 유지). 표에는 전부 포함(아래).

### 3-2. 툴팁
formatter에서 `const [, start, end, el, comp] = p.value;`로 받고, 기존 경과 줄 아래 완성률 줄 추가:

```
{name}
{fmtDate(start)} ~ {fmtDate(end)}
{t("portfolio.gantt.elapsed")}: {pct(el)}
{t("portfolio.gantt.completion")}: {comp == null ? "-" : pct(comp)}
```
(comp>1이어도 표시는 `pct(comp)` 원값 — 툴팁은 실데이터, 클램프는 막대 렌더에만 적용. 다만 일관성을 위해 표시도 클램프하려면 `Math.min(comp,1)` 적용 가능 — **결정: 툴팁은 원값 표시**(데이터 투명성), 막대만 클램프.)

### 3-3. 표(table)
`tableHead.cells`에 `elapsed` 다음에 완성률 컬럼 추가:
```
{ key: "completion", content: t("portfolio.gantt.colCompletion"), isSortable: true }
```
`tableRows` 각 행 cells에 `elapsed` 다음 추가:
```
{ key: "completion", content: p.completionRate == null ? "-" : pct(p.completionRate) }
```
- 표는 `list.map`(전 프로젝트, 일정 미설정 포함) 유지. 완성률은 start/end 의존 없음 → 일정 없는 프로젝트도 완성률 표시 가능.
- null 명시 가드("-")로 "데이터 없음"과 "0%"를 구분(기존 `pct`의 `?? 0`은 null을 0%로 뭉갬).

최종 표 컬럼: 프로젝트 | 시작일 | 종료일 | 기간 | 경과율 | **완성률**

---

## 4. i18n 키 목록

대상: `locales/kr/portfolio.json` · `locales/en/portfolio.json`의 `gantt` 블록(현재 L146-162). 작업 후 `cd static/ui && npm run merge`.

### 4-1. 추가 키
| 키 | kr | en |
|----|----|----|
| `gantt.completion` | `완성률` | `Completion` |
| `gantt.colCompletion` | `완성률` | `Completion` |

### 4-2. 갱신 키 (기존 값 교체)
| 키 | kr (신규 값) | en (신규 값) |
|----|-------------|-------------|
| `gantt.desc` | `프로젝트별 시작~종료 기간 위에 일정 경과율(파란 막대)과 완성률(초록 막대)을 한 행에서 비교` | `Start–end span with schedule elapsed (blue bar) and completion (green bar) compared in one row, per project` |
| `gantt.info.calc` | `위 막대=일정 경과(시작일~오늘, 캘린더 기준, 채움 경계=오늘 점선과 일치). 아래 막대=완성률(초록, 시작일 기준 진척). 두 막대 모두 시작~종료 전체 길이를 기준으로 채워진다.` | `Top bar = schedule elapsed (start–today, calendar-based; fill edge aligns with the today line). Bottom bar = completion (green, progress from start). Both bars fill relative to the full start–end span.` |
| `gantt.info.interp` | `초록(완성률) 끝이 파랑(경과)·오늘 선보다 왼쪽이면 일정 대비 진척이 뒤처진 지연 신호. 오른쪽이면 일정보다 앞섬. 이제 차트에서 직접 비교된다.` | `When the green (completion) end is left of the blue (elapsed) end / today line, progress trails the schedule — a delay signal. To the right means ahead of schedule. This is now compared directly on the chart.` |

> `gantt.elapsed`("일정 경과"/"Schedule elapsed")는 유지(툴팁·경과 lane 의미 불변).
> 미변경 키(`title`, `today`, `col*`, `durationUnit`, `noDates`)는 그대로.

---

## 5. 엣지케이스 처리 (확정)

| 케이스 | 처리 |
|--------|------|
| `completionRate` null/undefined | 차트: 완성 채움(rect #4) 생략, lane 배경(#3)만 표시, 우측 라벨은 경과율 폴백. 툴팁: `완성률: -`. 표: `-`. |
| `completionRate > 1` | **막대 렌더는 1로 클램프**(채움이 막대 밖으로 나가지 않게). 툴팁·표는 원값 `pct` 표시(데이터 투명성). |
| `completionRate` = 0 | 정상 0% — 초록 채움 width 0(렌더 생략과 시각 동일), 라벨 `0%`. null과 구분됨(표 "-" vs "0%"). |
| 일정 미설정(start/end 없음) | 차트 `rows` 필터에서 제외(현행 유지). 표에는 포함, 완성률 컬럼은 데이터 있으면 표시. |
| 당일 프로젝트(start==end) | `end>=start`라 차트 포함되나 폭=0 → 경과/완성 모두 길이 0(막대가 점). **이번 범위 외**(완성 오버레이 본질상 폭 0이면 진척 길이 표현 불가). `calElapsed`의 `end<=start→0` 가드는 0 나눗셈 방지라 유지. 설계서에 한계로 명시, 별도 건 권고. |
| completion < elapsed (지연) | 의도된 핵심 시그널 — 초록 끝이 파랑/오늘 왼쪽. 특별 처리 없음(시각으로 노출). |

---

## 6. 경계면 계약 (단일 진실)

**백엔드 변경 0.** resolver `getPortfolioDashboard` 응답 shape·`portfolioAggregate.js`·`portfolio_project_snapshot` 전부 불변. 본 위젯이 소비하는 prop 계약만 고정한다.

`PortfolioScheduleGantt`가 `projects[]` 각 항목에서 소비하는 키:

| prop 키 | 타입 | 범위/의미 | 소비처 |
|---------|------|-----------|--------|
| `projectId` | string | 표 row key | 표 |
| `projectName` | string | 행/카테고리 라벨 | 차트·표 |
| `startDate` | string\|null | `YYYY-MM-DD`(앞 10자 사용) | 차트 필터·막대·표 |
| `endDate` | string\|null | `YYYY-MM-DD` | 차트 필터·막대·표 |
| **`completionRate`** | **number\|null/undefined** | **0~1 비율** (>1 가능, 렌더 시 1 클램프) | **차트 완성 lane·툴팁·표 (신규 소비)** |

- `scheduleRate`(0~1)는 동일 객체에 존재하나 **이 위젯에서 소비하지 않음**(경과 lane은 `calElapsed` 캘린더 계산 유지). 혼동 방지 위해 명시.
- integration-verifier 검증 기준: `completionRate`가 0~1 비율이라는 가정(렌더 좌표 `start + comp*(end-start)`가 이에 의존). %로 들어오면 막대가 100배 깨짐 → 회귀 신호.

---

## 7. 변경 파일 목록 / 작업 분해

### 변경 파일
| 파일 | 변경 요지 |
|------|-----------|
| `static/ui/src/pages/portfolio/widgets/PortfolioScheduleGantt.jsx` | ① 색 상수 `COMPLETION`/`PROG_TRACK` 추가 ② `rows` 매핑에 `completionRate` 추가 ③ `data.value`에 `r.completionRate` 추가 ④ `renderItem` 2-lane(완성 lane) 추가 + 좌표/클램프 ⑤ 툴팁 완성률 줄 ⑥ 우측 라벨 완성률化 ⑦ 표 head/rows 완성률 컬럼 |
| `locales/kr/portfolio.json` | `gantt`에 `completion`/`colCompletion` 추가, `desc`/`info.calc`/`info.interp` 갱신 |
| `locales/en/portfolio.json` | 동일(영문) |
| (생성물) `locales/ko-KR.json`·`en-US.json` | `npm run merge` 산출물 — 직접 수정 금지 |

### frontend 체크리스트
- [ ] 파일 상단 `const COMPLETION = "#36B37E"; const PROG_TRACK = "#EBECF0";` 추가
- [ ] `rows` useMemo: `completionRate: p.completionRate ?? null` 추가(필터 조건은 불변)
- [ ] `data` 매핑: `value: [i, r.start, r.end, calElapsed(r.start, r.end), r.completionRate]`
- [ ] `renderItem`: §2의 좌표·클램프·2-lane children 적용, 우측 라벨 완성률 우선
- [ ] 툴팁 formatter: `[, start, end, el, comp]` 구조분해 + 완성률 줄 추가
- [ ] `tableHead.cells`: `elapsed` 뒤 `completion` 컬럼 추가
- [ ] `tableRows`: 각 행 `elapsed` 뒤 `completion` 셀(null→"-") 추가
- [ ] `locales/kr/portfolio.json`·`locales/en/portfolio.json` `gantt` 블록 키 추가/갱신
- [ ] `cd static/ui && npm run merge` 실행 → ko-KR/en-US 생성 확인
- [ ] `cd static/ui && npm run build` 통과
- [ ] (회귀) `portfolioAggregate` 테스트 비파괴 — 본 변경은 위젯 한정이라 영향 없음 확인

### 백엔드 체크리스트
- 없음 (변경 0).
</content>
</invoke>
