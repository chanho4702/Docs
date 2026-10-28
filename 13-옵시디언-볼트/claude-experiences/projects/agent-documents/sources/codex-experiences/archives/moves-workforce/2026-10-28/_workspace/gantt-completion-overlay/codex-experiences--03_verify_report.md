# 03 통합 검증 리포트 — gantt-completion-overlay

> 검증: integration-verifier · 2026-06-29 · 성격: 프론트 전용 시각화 개선(백엔드 변경 0)
> 검증 방식: 생산자/소비자 양쪽 동시 읽기 + build/test 실행
> 결론: **전 항목 통과. 실패 0. 회귀 신호 없음.**

---

## 요약 (통과 / 실패 / 미검증)

| # | 검증 항목 | 결과 |
|---|----------|------|
| 1 | 데이터 계약 정합성 (`completionRate` 0~1) | 통과 |
| 2 | 시각화 정확성 (2-lane, today 픽셀) | 통과 |
| 3 | 엣지케이스 (null / >1 / 일정 미설정) | 통과 |
| 4 | i18n 정합성 (kr/en + merge) | 통과 |
| 5 | 경계면 불변 (invoke/resolver/scheduleRate) | 통과 |
| - | build / test | 통과 |
| - | 미검증 | 없음 |

---

## 1. 데이터 계약 정합성 (최우선) — 통과

`completionRate`가 **0~1 비율**로 일관 소비됨을 생산자/소비자 교차 확인.

- 소비처 좌표 계산: `PortfolioScheduleGantt.jsx:105` `completionMs = start + comp * (end - start)` — **×100 없음**. 비율 그대로 막대 폭 환산. 막대 100배 깨짐 회귀 없음.
- `comp` 클램프: `:96` `Math.min(Math.max(compRaw, 0), 1)` — [0,1] 클램프(>1→1). 렌더에만 적용.
- 표시 헬퍼 `pct`: `:10` `Math.round((v ?? 0) * 100)%` — **표시 시점에만** ×100. 좌표 계산엔 미적용.
- 교차 기준점 확인:
  - `PortfolioProjectTable.jsx:15` 동일 `pct(v)=Math.round((v??0)*100)%`, `:92` `pct(p.completionRate)` → 같은 위젯군이 `completionRate`를 0~1로 동일 취급. 단위 일치.
  - 설계 §6 경계면 계약(`completionRate` = 0~1, 렌더 시 1 클램프)과 코드 일치.

→ **위반 없음.** completionRate는 0~1로 소비되며 어디서도 막대 폭 계산에 ×100 하지 않음.

## 2. 시각화 정확성 — 통과

- 2-lane: 위=time lane(배경 `REMAIN #DFE3E8` `:127` / 채움 `ELAPSED #0052CC` `:133`), 아래=progress lane(배경 `PROG_TRACK #EBECF0` `:139` / 채움 `COMPLETION #36B37E` `:148`). 색상 상수 `:21-22` 설계값과 정확히 일치.
- 완성 채움(rect #4)은 `if (hasComp)` `:144` 가드 하에서만 push — `compRaw != null`일 때만 렌더. 설계 §2 children #4 조건 준수.
- '오늘' 픽셀 일치: `todayPx = api.coord([now, ci])` `:102`, 경과 채움 폭 `elapsedW = todayPx[0]-startPx[0]` `:109`. markLine은 `data:[{xAxis: Date.now()}]` `:172`. 기존 `api.coord(today)` 채움 경계 보존됨.
- 우측 라벨: `:158` `text = hasComp ? pct(comp) : pct(el)`, `:160` `fill = hasComp ? COMPLETION : "#42526E"`(완성률=초록). 설계 §2-5 준수.

## 3. 엣지케이스 — 통과

| 케이스 | 코드 위치 | 처리 | 판정 |
|--------|----------|------|------|
| `completionRate` null/undefined | `:42` `?? null`, `:95` `hasComp`, `:144` 채움 생략, `:158` 라벨 경과율 폴백, `:68` 툴팁 `"-"`, `:217` 표 `"-"` | 채움 생략·배경만·폴백·"-" | 통과 |
| `> 1` (렌더 클램프, 표시 원값) | `:96` 렌더 `comp` 클램프 / `:64,68` 툴팁 `comp`는 `p.value` 원값 `pct(comp)` / `:217` 표 `pct(p.completionRate)` 원값 | 막대만 1 클램프, 툴팁·표 원값 | 통과 |
| 일정 미설정(start/end 없음) | `:44` 필터 `start!=null && end!=null && end>=start` → 차트 제외 / `:197` 표 `list.map` 전체 포함, `:217` 완성률 표시 | 차트 제외·표 포함 유지 | 통과 |
| `= 0` vs null 구분 | 표 `:217` `== null ? "-" : pct(...)` → 0%는 "0%", null은 "-" | 구분됨 | 통과 |

> 주: 툴팁 formatter의 `comp`(`:64` 구조분해)는 `data.value[4] = r.completionRate`(`:56`, 클램프 안 된 원값)에서 옴. renderItem 스코프의 클램프된 `comp`와 별개 변수 — 설계 의도(툴팁=데이터 투명성, 막대만 클램프)대로 정확히 분리됨.

## 4. i18n 정합성 — 통과

소스(`locales/kr/portfolio.json`·`locales/en/portfolio.json`) 및 merge 산출물(`locales/ko-KR.json`·`en-US.json`) **양쪽 모두** 확인. (locale 경로는 `static/ui/locales/`가 아니라 **리포지토리 루트 `locales/`** — merge.js 소스와 일치.)

- 추가 키 (kr/en 양쪽):
  - `gantt.completion` — kr `완성률`(L150) / en `Completion`(L150)
  - `gantt.colCompletion` — kr `완성률`(L157) / en `Completion`(L157)
- 갱신 키 (kr/en 양쪽, 설계 §4-2 신규 값과 일치):
  - `gantt.desc` (L148), `gantt.info.calc` (L161), `gantt.info.interp` (L162)
- merge 반영 확인: `ko-KR.json` L655/664/815, `en-US.json` L654/663/814 에 갱신 desc·colCompletion 반영됨. (직접 수정 금지 대상 ko-KR/en-US를 직접 편집하지 않고 merge로 생성한 흐름 확인.)
- jsx `t("portfolio.gantt.*")` 키 전수 대조 — 사용 키: `elapsed, completion, today, colProject, colStart, colEnd, colDuration, colElapsed, colCompletion, durationUnit, noDates`. **전부 locale에 존재. 누락 0. 미번역(빈 값) 0.**
- 유지 키(`elapsed, title, today, col*, durationUnit, noDates`) 보존 확인.

## 5. 경계면 불변 — 통과

- invoke/resolver 변경 없음: 본 위젯은 `invoke` 직접 호출 없이 부모로부터 `projects` prop 수신. `getPortfolioDashboard` 응답 shape·`portfolioAggregate.js` 미변경 확인.
- `scheduleRate` 미소비 확인: `PortfolioScheduleGantt.jsx` 내 `scheduleRate` 참조 0건. 경과 lane은 `calElapsed`(`:13`, 프론트 캘린더 계산) 유지. 설계 §1·§6 의도 준수.

---

## build / test 결과

- `npx react-scripts test --testPathPattern=portfolioAggregate` (CI 모드): **29/29 통과, 스냅샷 1/1 통과** (0.841s). 집계 로직 비파괴 확인.
- `npm run build`: **성공("Compiled with warnings")**. 경고는 전부 본 변경과 무관한 기존 항목 —
  - `@atlaskit/analytics-next-stable-react-context`, `marklassian` node_modules 소스맵 누락(`.ts` ENOENT)
  - `merge.js` `MODULE_TYPELESS_PACKAGE_JSON` 경고
  - PortfolioScheduleGantt 관련 컴파일 에러/경고 0건.

---

## 미검증 항목

없음. 5개 검증 항목 + build/test 전부 실행·교차 확인 완료.

## 재작업 필요 사항

없음. backend/frontend 재호출 불필요.
