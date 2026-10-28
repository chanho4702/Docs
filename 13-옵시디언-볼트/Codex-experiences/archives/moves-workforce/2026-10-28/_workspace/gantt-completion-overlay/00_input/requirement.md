# 요구사항: 포트폴리오 간트 차트 완성률 오버레이

## 배경 (간트 차트 검토 결과, 2026-06-29)
대상: `static/ui/src/pages/portfolio/widgets/PortfolioScheduleGantt.jsx`
(Portfolio 대시보드 → Time 탭, `TimeTab.jsx`에서 `<PortfolioScheduleGantt projects={selectedProjects} />`)

### 핵심 결함
- 현재 막대 채움(진한 파랑 `#0052CC`)은 **순수 캘린더 경과율**(`calElapsed = (now-start)/(end-start)`)만 표현. 실제 작업 진척과 무관.
- 그런데 InfoTip 해석 문구(`portfolio.json` `portfolio.gantt.info.interp`)는
  "완성률이 채움보다 처지면 지연 신호"라며 **완성률 비교를 요구** — 비교 대상이 차트에 없음.
- 파란 채움 막대는 progress bar로 오독됨("시간 80% 경과"를 "80% 완료"로 착각).
- → 간트의 핵심 가치(일정 vs 진척 = 지연 가시화)가 빠져 있음.

### 데이터 가용성 (확인됨)
- `selectedProjects` 항목에 `completionRate`(0~1), `scheduleRate`(0~1)가 이미 실려 있음.
  - 근거: `PortfolioProjectTable.jsx:92-93`이 `p.completionRate`/`p.scheduleRate`를 이미 사용 중.
  - `portfolio_project_snapshot` 테이블이 집계, `portfolioAggregate.js` 경유로 프론트 전달.
- → **백엔드 변경 0**. 프론트에서 기존 prop만 추가 소비.

## 요구사항
1. 각 프로젝트 막대에 **완성률 오버레이** 추가. 일정 경과(시간)와 완성률(진척)을 한 행에서 비교 가능하게.
   - 시각화 방식은 설계에서 확정(예: 완성률 위치에 마커/다이아몬드, 또는 별도 얇은 완성 채움 라인). "경과 채움"과 "완성"이 시각적으로 구분되어야 함(같은 파랑 단일 바로 합치지 말 것).
2. 툴팁에 완성률 추가 표기 (기존: 기간 + 일정 경과 → + 완성률).
3. 표(table)에 완성률 컬럼 추가(또는 기존 경과율 옆). 일정 미설정 프로젝트도 표에는 포함(현행 유지).
4. InfoTip 문구가 실제 차트로 관측 가능해지도록 calc/interp 갱신(완성률이 차트에 표시됨을 반영).
5. i18n 키 추가 시 `locales/kr/portfolio.json`·`locales/en/portfolio.json`에 추가 후 `npm run merge`.

## 부차 개선 (검토 발견 — 설계에서 포함 여부 판단)
- 당일 프로젝트(start==end)가 `calElapsed` 가드(`end <= start`)로 항상 0% 경과 반환되는 미세 불일치.
  → 이번 범위에 포함할지 설계에서 결정(완성률 오버레이가 주, 이건 선택).
- 타임존(UTC 막대 vs 실시간 '오늘' 선), "기간"=캘린더일 vs 영업일 의미 불일치, 차트 행 미정렬:
  → **이번 범위 제외**(완성률 오버레이에 집중). 필요 시 별도 건.

## 제약
- 백엔드/resolver 변경 없음. 경계면(데이터 shape) 불변 — 기존 `completionRate` prop 소비만.
- 프론트 빌드(`cd static/ui && npm run build`) 통과, 기존 portfolioAggregate 테스트 비파괴.
- '오늘' 픽셀 일치 처리(`api.coord(today)`)·일정 미설정 분리 등 기존 양호 동작 유지.
