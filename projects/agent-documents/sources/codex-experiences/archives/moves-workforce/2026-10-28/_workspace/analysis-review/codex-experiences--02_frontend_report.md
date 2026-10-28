# 02_frontend_report.md — analysis-review 프론트엔드 구현 리포트

> frontend-engineer · 2026-06-11 · 슬러그 `analysis-review`
> 입력: `01_architect_design.md` §3·§5, `02_backend_report.md`(scopeBands shape 확정).
> 제약 준수: 기존 미커밋 변경(cost 분리 등) 되돌리지 않음 — 전부 additive 수정.

## 1. 소비한 응답 shape (scopeBands 접근 경로)

backend가 `getPortfolioDashboard` → `result.content` 루트에 신규 필드 `scopeBands: { amber, red }`를 추가(EMPTY/정상 양쪽, `utilizationBands`와 동형, settings 폴백 0.3/0.6).

- 접근 경로: `data?.scopeBands` → `{ amber, red }` (페이지는 응답을 content 래핑 없이 `data` 루트로 직접 소비. `data.success`/`data.projects`/`data.utilizationBands`와 동일 레벨).
- 페이지에서 `utilizationBands`(가동률 band)와 `scopeBands`(S축 todoRatio)를 하나의 `signalBands` 객체로 합류:
  ```js
  const signalBands = {
      ...utilBands,                              // utilUnder/utilOver/utilRed
      scopeAmber: scopeBands.amber ?? 0.3,
      scopeRed:   scopeBands.red   ?? 0.6,
  };
  ```
  → `PortfolioTsrSignalTable` `bands` prop → `tsrSignals(projects, bands)`에서 `bands.scopeAmber/scopeRed`로 소비.
- `projects[].avgUtilization`·`members[].utilization`·`projects[].actualMm`는 **값만 정확화(필드명·타입 무변경)** → 소비 코드 무수정(`tsrSignals`/`summarizeSelection`/`memberUtilization` 그대로).
- shape 불일치/모호 없음 — backend report의 글자 그대로 일치.

## 2. 수정 파일 목록

### 코드 (static/ui/src/)

| 파일 | 항목 | 변경 |
|---|---|---|
| `pages/portfolio/PortfolioDashboardPage.jsx` | P2-1·P3-1 | `SCOPE_BANDS` 폴백 상수 추가, `signalBands`(util+scope 합류) 구성 후 TSR 테이블에 전달. ComparisonTabs엔 util band만 전달(Resource탭은 가동률 전용). EMPTY 시 재집계 CTA 카드 렌더(`Button`+`RefreshIcon` import 추가) |
| `pages/portfolio/utils/portfolioAggregate.js` | P2-1 | `tsrSignals`가 `bands.scopeAmber/scopeRed`(폴백 0.3/0.6)로 scope 임계 산출 — 하드코딩 `0.6/0.3` 제거. JSDoc 갱신 |
| `pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | P3-1 | `signals` useMemo에 **red 개수 desc → amber 개수 desc → 원순서**(안정) 기본 정렬. `Dot`에 색맹 보조 글리프(red ▲ / amber ■ / green ●) + `aria-label` |
| `pages/portfolio/PortfolioDashboard.css` | P3-1 | `.tsr-dot`를 flex 중앙정렬·14px로, `.tsr-dot-glyph`(흰 글리프) 추가 |
| `pages/projectDetail/progress/ProgressRiskTable.jsx` | P2-5 | `isUnmeasurableProgress`(진행중 && plannedMd null) 시 처리율 "0%" 대신 "-"(Tooltip 안내). `Tooltip` import 추가 |
| `pages/projectDetail/progress/ProgressSCurve.jsx` | P3-2 | 계획−실제 격차 음영(`__gapBase`+`__gap` stack area, 실제선 존재 구간만, 양의 격차만). 죽은 토글 주석 블록 정리(1줄 설명으로 대체). 툴팁 formatter가 `__` 보조 series 제외 |
| `pages/projectDetail/cost/CostEvmCard.jsx` | P3-3 | `CpiGauge`(1.0 기준선 게이지) + `EacBacBar`(BAC vs EAC 막대 비교, 초과 적색). EAC 발산 시 회색+사유 Tooltip(`eacDivergedHint`). `Tooltip` import 추가 |
| `pages/portfolio/utils/__test__/portfolioAggregate.test.js` | 테스트 | scopeBands 설정 연동 케이스 2개 추가(임계 변경 시 분류 변화 / 폴백 0.3·0.6 유지) |

> **P1-4(용어 정정)·P1-3·P2-2·P2-4(b)는 i18n 값만 변경** — 키 이름·코드 무변경(라벨 키 그대로 사용하는 컴포넌트는 자동 반영).

### i18n 소스 (locales/kr/·en/ — `locales/script/*.json` 미사용)

| 파일 | 변경 키(요약) |
|---|---|
| `locales/kr/cost.json` · `locales/en/cost.json` | `kpi.plannedBudget`(계획 예산→계획 인건비/Planned Labor Cost), `kpi.remaining`, `planActual.planned`·`.interp`, `burnup.budgetLine`·`.calc`(P2-4b 안분 안내)·`.interp`, `evm.cpiCalc`·`cpiHint`(P1-3 근사 안내)·`eacCalc`·`eacHint`, **신규** `evm.eacDivergedHint`·`evm.bacLabel`·`evm.eacLabel`, `evm.overBudget`·`withinBudget`, `guide.acCalc`·`bacInterp`(= Σ 재직기간 총단가, 실제 사업예산 아님)·`burnCalc`·`burnInterp`·`remainingCalc`·`remainingInterp` |
| `locales/kr/portfolio.json` · `locales/en/portfolio.json` | **신규** `empty.cta`(P3-1), `overview.info.interp`(P1-3 완성률 근사 + P2-2 R=프로젝트 내 평균 부하), `cost.kpi.totalBudget`(총 예산→총 계획 인건비)·`.desc`·`.info.calc`, `cost.planActual.info.calc`·`.interp`, `cost.monthlyBurn.info.calc`(P2-4b) |
| `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` | **신규** `...progress.risk.progressUnmeasurable`(P2-5), `...progress.tip.completion.interp`(P1-3 완성률 근사), `...progress.tip.scurve.calc`·`.interp`(P3-2 공수 누적 기준 + 격차 음영 안내) |

## 3. merge 실행 여부

`cd static/ui && npm run merge` **실행 완료** → `locales/ko-KR.json`·`locales/en-US.json` 재생성.
검증: ko-KR.json에 `계획 인건비`/`eacDivergedHint`/`progressUnmeasurable`/`empty.cta`/`총 계획 인건비` 반영 확인, en-US.json에 `Planned Labor Cost`/`eacDivergedHint`/`progressUnmeasurable`/`Total Planned Labor Cost` 6건 반영 확인.
(빌드 prebuild가 merge를 자동 재실행하므로 build 산출물에도 동일 반영.)

## 4. npm test 결과 원문

```
Test Suites: 5 passed, 5 total
Tests:       50 passed, 50 total
Snapshots:   1 passed, 1 total
Time:        1.308 s
Ran all test suites.
```

- 골든 픽스처 스냅샷(`portfolioAggregate.test.js.snap`) **무변경 통과** — `tsrSignals(selected, {})`가 폴백 0.3/0.6을 쓰므로 기존 출력과 동일(scopeBands 도입이 기존 동작을 깨지 않음 확인).
- 신규 추가 2케이스 포함 27 → (포트폴리오 스위트) 통과.

## 5. npm run build 결과 원문 (요약)

```
Compiled with warnings.
...
The build folder is ready to be deployed.
```

- 빌드 성공. 경고는 전부 **기존부터 있던 node_modules 소스맵 파싱 경고**(`@atlaskit/analytics-next-stable-react-context`, `marklassian`) — 본 변경과 무관, 코드 ESLint/컴파일 에러 0건.

## 6. 미구현 / 보류 항목

- **P3-4 로딩/빈 상태 표준화**: 리더 지침대로 "실용 범위"로 한정. Portfolio 위젯은 이미 `EmptyState`·`WidgetCard` 공통 패턴을 일관 사용 중이라 추가 공통화는 과잉으로 판단. 실제 갭이던 **TSR EMPTY 상태 재집계 CTA**(P3-1)만 신설. 신규 공통 컴포넌트 도입은 보류(현행 패턴 재사용으로 충분).
- **P2-2 utilization scopeNote 별도 키**: 설계 §5 i18n 목록의 `portfolio.utilization.scopeNote`는 신설하지 않음 — 기존 `portfolio.utilization.info.interp`가 이미 "전사 기간 합집합 기준 / 프로젝트별과 분모 다름"을 충분히 설명(중복 키 회피). R 신호 구분 문구는 overview.info.interp에 통합.
- **costLevel amber +0.1 하드코딩**(Q5): 리더 확정대로 설정화 안 함 — `projCostLevel`의 `+0.1` 유지(무변경).
- **monthlyBurn 산식**(Q4): (b) 현행 유지 — 안분 로직 무변경, InfoTip 안내만 추가.
- 경계면: scopeBands 외 신규 contract 없음. backend 값 정확화(avgUtilization/actualMm)는 프론트 소비 무수정으로 자동 반영.
