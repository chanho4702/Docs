# 02 Frontend 구현 리포트 — gantt-completion-overlay

> 구현: frontend-engineer · 2026-06-29 · 성격: **프론트 전용 시각화 개선(백엔드 변경 0)**

## 1. 소비한 데이터 shape

기존 prop 계약만 추가 소비. resolver/invoke 미변경 — `getPortfolioDashboard` 응답 불변.

`PortfolioScheduleGantt`가 `projects[]` 각 항목에서 소비:

| prop 키 | 타입 | 의미 | 비고 |
|---------|------|------|------|
| `projectId` | string | 표 row key | 기존 |
| `projectName` | string | 행/카테고리 라벨 | 기존 |
| `startDate` / `endDate` | string\|null | `YYYY-MM-DD`(앞 10자) | 기존 |
| **`completionRate`** | **number\|null/undefined** | **0~1 비율**(>1 가능, 렌더 시 1 클램프) | **신규 소비** |

`completionRate`는 **0~1 비율**(% 아님) 전제. 좌표 `start + comp*(end-start)`가 이에 의존 — 100 곱하지 않음. `scheduleRate`는 이 위젯에서 소비하지 않음(경과 lane은 프론트 `calElapsed` 캘린더 계산 유지, 기존 동작 비파괴).

## 2. 구현한 시각화 요약 (2-lane 막대)

한 행을 수직 2트랙으로 분할:
- **위 lane (time)**: 일정 경과. 배경 `REMAIN #DFE3E8` + 채움 `ELAPSED #0052CC`(파랑). 채움 끝 = `api.coord(today)` → '오늘' 점선과 픽셀 일치(기존 유지). 높이 `rowH*0.32`(min 7).
- **아래 lane (progress)**: 완성률. 배경 `PROG_TRACK #EBECF0`(신규) + 채움 `COMPLETION #36B37E`(초록, 신규). 채움 끝 = `completionPx = api.coord([start + clamp(comp,0,1)*(end-start), ci])`. 높이 `rowH*0.16`(min 4). gap 2, 전체 수직 중앙 정렬.
- **우측 라벨**: 완성률 우선(`hasComp ? pct(comp) 초록 : pct(el) 회색`).

엣지케이스(설계 §4·§5 준수):
- `completionRate` null/undefined → 완성 채움 rect 생략, lane 배경만, 라벨 경과율 폴백, 툴팁/표 `-`.
- `> 1` → 막대 렌더만 1 클램프(`Math.min(Math.max(compRaw,0),1)`), 툴팁·표는 원값 `pct` 표시(데이터 투명성).
- `= 0` → 초록 width 0(렌더 생략과 시각 동일), 라벨 `0%`. 표는 `-`(null)과 구분.
- 일정 미설정 → 차트 `rows` 필터(`start!=null && end!=null && end>=start`) 그대로 제외, 표에는 전부 포함(완성률 컬럼 표시).
- 당일(start==end) → 설계 결정대로 본 범위 외, 추가 처리 없음.

## 3. 변경 파일별 요지

### `static/ui/src/pages/portfolio/widgets/PortfolioScheduleGantt.jsx`
1. 색 상수 `COMPLETION = "#36B37E"`, `PROG_TRACK = "#EBECF0"` 추가.
2. `rows` useMemo 매핑에 `completionRate: p.completionRate ?? null` 추가(필터 조건 불변).
3. `data.value` = `[i, r.start, r.end, calElapsed(r.start, r.end), r.completionRate]`(5번째 추가).
4. 툴팁 formatter: `[, start, end, el, comp]` 구조분해 + `완성률: {comp==null?"-":pct(comp)}` 줄 추가.
5. `renderItem`: §2 좌표·클램프·2-lane children(배경/경과/완성배경/완성채움/라벨). 완성 채움은 `hasComp`일 때만 push. 라벨 완성률 우선·초록화.
6. 표 head: `elapsed` 뒤 `completion`(`colCompletion`) 컬럼 추가.
7. 표 rows: 각 행 `elapsed` 뒤 `completion` 셀(`p.completionRate == null ? "-" : pct(...)`) 추가.

### `locales/kr/portfolio.json` · `locales/en/portfolio.json` (`gantt` 블록)
- 추가: `completion`, `colCompletion`.
- 갱신: `desc`, `info.calc`, `info.interp`(2-lane 설명으로 교체).
- `elapsed`, `title`, `today`, `col*`, `durationUnit`, `noDates` 유지.
- **`ko-KR.json`·`en-US.json`은 직접 수정하지 않음** — merge 산출물.

## 4. merge / build / test 결과

- `cd static/ui && npm run merge`: **성공**. `locales/ko-KR.json`·`en-US.json` 재생성, `gantt.colCompletion`("완성률"/"Completion") 및 갱신된 `desc`(영문 "Start–end span with schedule elapsed...") 반영 확인. (MODULE_TYPELESS_PACKAGE_JSON 경고는 무관한 기존 경고.)
- `cd static/ui && npm run build`: **성공**("The build folder is ready to be deployed"). 위젯 관련 컴파일 에러/경고 0. 출력의 "Compiled with warnings"는 node_modules(@atlaskit/marklassian) 소스맵 누락 경고로 본 변경과 무관한 기존 경고.
- `npx react-scripts test --testPathPattern=portfolioAggregate`: **29/29 통과, 스냅샷 1/1 통과**. 본 변경은 위젯 한정이라 집계 로직 비파괴 확인.

## 5. 설계 대비 벗어난 점

없음. 설계서 §1~§5 및 §7 체크리스트 전 항목 그대로 구현. 툴팁 결정(원값 표시·막대만 클램프), 우측 라벨 완성률 우선/초록화, 표 null→"-" 폴백 모두 설계 확정안 준수.
