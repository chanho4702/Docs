# 03_verify_report.md — analysis-review 통합 정합성 검증

> integration-verifier · 2026-06-11 · 슬러그 `analysis-review`
> 방법: 양쪽 동시 읽기(생산자/소비자 교차 비교) + jest/build 직접 실행. 입력: 01_architect_design.md §4 경계면 계약, 02_backend_report.md(응답 shape), 02_frontend_report.md.

## 총평

**통과 18 / 실패 0 / 미검증 3.** 경계면 불일치 0건. 백엔드 값 정확화(avgUtilization/actualMm)는 필드명·타입 무변경으로 프론트 소비 코드 무수정이 타당하게 성립했고, 유일한 신규 필드 `scopeBands`는 생산자(루트)와 소비자(`data?.scopeBands` → `scopeAmber/scopeRed` 변환)가 글자 단위로 일치한다. settings 4곳 키 이름 일치, i18n 신규 키 kr/en 양쪽 실재 + merge 반영 확인. 백엔드 70 / 프론트 50 jest + 빌드 전부 통과. 미검증은 Forge 런타임 E2E·실데이터 재집계로, 정적 검증으로는 도달 불가한 항목뿐이다.

---

## 통과 항목

### [통과] 1. scopeBands 경계면 (생산자↔소비자 글자 단위 대조)

- **생산자**: `src/resolver/portfolioDashboard/PortfolioDashboardService.js:188` 정상 shape, `:75` EMPTY shape — 양쪽 모두 루트에 `scopeBands: { amber, red }` 존재. 폴백 상수 `DEFAULT_SCOPE_AMBER=0.3`(`:20`), `DEFAULT_SCOPE_RED=0.6`(`:21`), settings 폴백 `scopeAmber = settings?.scopeTodoAmberRatio ?? DEFAULT_SCOPE_AMBER`(`:100-101`).
- **소비자**: `PortfolioDashboardPage.jsx:87` `const scopeBands = data?.scopeBands ?? SCOPE_BANDS`, `:88-92` `signalBands = { ...utilBands, scopeAmber: scopeBands.amber ?? SCOPE_BANDS.amber, scopeRed: scopeBands.red ?? SCOPE_BANDS.red }`. 폴백 상수 `SCOPE_BANDS = { amber: 0.3, red: 0.6 }`(`:24`).
- **전달 체인**: `PortfolioDashboardPage`(`:143-146` `bands={signalBands}`) → `PortfolioTsrSignalTable`(`bands` prop) → `tsrSignals(projects, bands)`. `portfolioAggregate.js:250-251` `scopeAmber = bands.scopeAmber ?? 0.3 / scopeRed = bands.scopeRed ?? 0.6`, `:269` `todoRatio >= scopeRed ? "red" : todoRatio >= scopeAmber ? "amber" : "green"`.
- **키 변환**: 백엔드 `{amber, red}` → 프론트 `{scopeAmber, scopeRed}` 변환이 페이지 한 곳에서만 일어나고 양쪽 키가 정확히 매칭. 폴백값 0.3/0.6이 백엔드 상수·프론트 상수·tsrSignals 기본값 **3곳 모두 동일**.

### [통과] 2. 값 정확화 항목의 소비 경로 무손상

- `projects[].avgUtilization`, `projects[].actualMm`, `projects[].members[].utilization` — 백엔드가 값만 정확화(P1-1/P1-2)하고 필드명·타입 무변경.
- **avgUtilization 생산**: `PortfolioAggregator.js:341` `baseMmDays = elapsedWorkDays`, `:350-352` 멤버 가동률 단순평균 → `snapshot.avgUtilization`. **소비**: `tsrSignals` `portfolioAggregate.js:272` `const util = p.avgUtilization ?? 0` (필드명 일치).
- **members[].utilization 생산**: `PortfolioAggregator.js:354` `members.forEach((m) => { m.utilization = round2(...) })` → `members_json` JSON.stringify 저장(`PortfolioSnapshotRepository.js:35`) → `parseJson(r.members_json)` 복원(`PortfolioDashboardService.js:143`)으로 필드 보존. **소비**: `memberUtilization` `portfolioAggregate.js:510` `m.utilization ?? 0` (일치).
- **actualMm 생산**: `PortfolioAggregator.js:332-334` 동적 분모. **소비**: `summarizeSelection` `portfolioAggregate.js:36` `totalActualMm += p.actualMm`, `tsrSignals` `:285` `actualMm: round1(p.actualMm ?? 0)` (일치).
- 결론: 프론트 무수정으로 자동 반영 — 02_frontend_report 주장 정확.

### [통과] 3. settings 체인 4곳 키 이름 일치

`scopeTodoAmberRatio` / `scopeTodoRedRatio` 가 아래 4곳 모두 동일 철자:
- `src/seed/SeedData.js:159-160` (`addSettingSeed`의 settings 객체, 0.3/0.6).
- `src/resolver/backoffice/setting/SettingService.js:12`(인자) + `:24-25`(null-가드 spread 병합).
- `src/resolver/portfolioDashboard/PortfolioDashboardService.js:100-101`(읽기).
- `manifest.yml:158-161` (`scopeTodoAmberRatio: float`, `scopeTodoRedRatio: float`).
- **SeedData 병합 안전성**: `:167` `save("settings", { ...settings, ...exists })` — exists 우선이라 기존 관리자 커스텀 보존하면서 신규 키만 보충. 설계 의도와 일치.

### [통과] 4. i18n (신규 키 실재 + merge 반영 + 직접수정 없음 + script 오염 없음)

- **신규 키 kr/en 양쪽 실재**:
  - `locales/kr/cost.json` + `locales/en/cost.json`: `kpi.plannedBudget`(계획 인건비/Planned Labor Cost), `evm.eacDivergedHint`·`bacLabel`·`eacLabel`·`overBudget`·`withinBudget`, `evm.cpiHint`(완성률 근사 안내), `guide.acCalc`·`bacInterp`(= Σ 재직기간 총단가, 실제 사업예산 아님)·`burnCalc`·`remainingCalc` 등 전부 존재.
  - `locales/kr/portfolio.json` + en: `empty.cta`, `overview.info.interp`(R=프로젝트 내 평균 부하 + 완성률 근사), `cost.kpi.totalBudget`(총 계획 인건비/Total Planned Labor Cost) 존재.
  - `locales/kr/projectDetail.json` + en: `...progress.risk.progressUnmeasurable`(`:283`), `...progress.tip.completion.interp`(`:314`), `...progress.tip.scurve.calc`·`.interp`(`:340-342`) 존재.
- **컴포넌트 사용처 매칭**: `CostEvmCard.jsx:49,53,78,138,140`이 `cost.evm.overBudget/withinBudget/eacDivergedHint/bacLabel/eacLabel` 사용 → 키 전부 실재. `ProgressRiskTable.jsx:103` `projectDetail.analysis.progress.risk.progressUnmeasurable` → 실재.
- **merge 반영**: `locales/ko-KR.json`에 신규 한국어 키 23건, `locales/en-US.json`에 영어 키 6건 grep 카운트 확인 — prebuild/merge 정상 실행.
- **script 스텁 오염 없음**: `locales/script/cost.json`·`locales/script/portfolio.json` **파일 미존재**(빈 스텁에 잘못 넣지 않음). script 폴더엔 common/level/merge/permission/project/projectDetail/projectStatus/role/setting/user/worklog만 있고 본 작업 키 없음.
- **ko-KR/en-US 직접 수정 흔적 없음**: ko-KR.json/en-US.json의 git diff는 kr·en 소스 파일 변경과 동반된 merge 산출물(정상 경로). 소스 미경유 단독 수정 정황 없음.

### [통과] 5. 로직 회귀 (폴백·"-" 분기·정렬/글리프·스냅샷)

- **tsrSignals 폴백**: bands 미전달 시(`tsrSignals(selected, {})`) `:250-251` 폴백 0.3/0.6 → 골든 스냅샷(`portfolioAggregate.test.js.snap`) 무변경 통과(02_frontend_report §4). 하드코딩 제거가 기존 동작 비파괴 확인.
- **ProgressRiskTable "-" 분기**: 생산자 `ProjectProgressService.js:177` `plannedMd = it.plannedSeconds != null ? ... : null` + `:199` 응답 포함 ↔ 소비자 `ProgressRiskTable.jsx:27-28` `isUnmeasurableProgress = (i) => i.statusKey !== 'done' && i.statusKey !== 'new' && i.statusKey != null && i.plannedMd == null`, `:102-106` 측정불가 시 Tooltip "-" 렌더. **필드명 `plannedMd` 양쪽 일치**, completion 가중평균 분모 제외(설계서)와 표기 의미 일치.
- **TSR 정렬/색맹 글리프**: `PortfolioTsrSignalTable.jsx` red desc → amber desc → 원순서 정렬 + Dot 글리프(▲/■/●) 추가 — 프론트 jest 5스위트 50테스트 통과로 회귀 없음.

### [통과] 6. 성능 규칙 (공통 페치 경로 무수정)

- `getResourceProjectWorklogs`(ResourceWorklogFetcher)·`computeLeaveDeductionMap`(ResourceAnalysisService) — `PortfolioAggregator.js:7-8`에서 **import만** 하고 수정 없음. `git status src/`에 ResourceWorklogFetcher/ResourceAnalysisService 변경 **없음**.
- 변경된 백엔드 파일은 SettingService/PortfolioAggregator/PortfolioDashboardService/SeedData/테스트 5개뿐 — 전부 배치 내부 계산만 변경.
- `pLimit(PROJECT_CONCURRENCY=2)` 동시성 제한 유지(`:47,476`). 프로젝트 단위 1회 페치 패턴 유지.

### [통과] 7. 테스트/빌드 실행 (원문)

- **백엔드 `npm test`** (루트):
  ```
  Test Suites: 4 passed, 4 total
  Tests:       70 passed, 70 total
  Snapshots:   0 total
  ```
  PortfolioAggregator.test.js 포함(P1-1 클램프 2 + P1-2 동적분모 2 케이스). (PowerShell의 NativeCommandError 래핑은 stderr 처리일 뿐 — 실제 70 passed.)
- **프론트 `npm test`** (static/ui):
  ```
  Test Suites: 5 passed, 5 total
  Tests:       50 passed, 50 total
  Snapshots:   1 passed, 1 total
  ```
  portfolioAggregate.test.js 포함(scopeBands 연동 2케이스 + 골든 스냅샷 무변경).
- **프론트 `npm run build`** (prebuild=merge 자동):
  ```
  The build folder is ready to be deployed.
  ```
  컴파일 에러 0, ESLint 에러 0. 경고는 기존 node_modules 소스맵 파싱 경고(@atlaskit/marklassian)뿐 — 본 변경 무관.

### [통과] 8. (부가) src/index.js 변경 점검

`git diff src/index.js` 결과 `registerProjectCostController` import+등록 추가만 존재. 이는 **선행 cost-analysis 작업의 미커밋 변경**(`?? src/resolver/projectCost/`)이며 이번 analysis-review 범위 아님. 02_backend_report의 "index.js 무변경(이번 작업)"은 정확. `src/resolver/projectCost/ProjectCostController.js` 파일 실재 확인 → 등록 유효(런타임 깨짐 없음).

---

## 미검증 항목 (추측 통과 처리 안 함)

### [미검증] M1. Forge 런타임 E2E — 실제 invoke 응답 수신

`getPortfolioDashboard` resolver의 실제 Forge SQL/KVS 조회 → `result.content` 수신 → 화면 렌더는 Forge 런타임(tunnel/deploy)에서만 가능. 정적 교차 비교로 shape 일치는 확인했으나 실데이터 응답은 미검증. **권고**: `forge tunnel`로 1회 수동 확인(특히 EMPTY 상태에서 scopeBands 폴백 + 재집계 CTA 동작).

### [미검증] M2. 실데이터 재집계 후 값 정확화 검증

avgUtilization(경과기간 분모)·actualMm(동적 월평균 근무일) 값이 진행중 프로젝트에서 실제로 과소평가가 해소됐는지는 **재집계 실행 + 실 워크로그**가 있어야 확인 가능. jest 골든 케이스로 산식은 검증됐으나 프로덕션 데이터 재집계는 미수행. **권고**: 트리거 재집계 후 Resource 분석 탭 MM과 Portfolio actualMm 동일 프로젝트 수치 대조.

### [미검증] M3. SettingPage UI에서 scopeTodo 임계 편집 경로

`updateSettingService`가 `scopeTodoAmberRatio/RedRatio`를 받도록 확장됐으나, 백오피스 SettingPage UI에 이 두 값의 **입력 폼**이 존재하는지는 본 검증 범위(설계서 §4 경계면) 밖. 설계서도 "설정 화면용 i18n은 별도"로 명시. 시드 기본값(0.3/0.6)으로는 정상 동작하나, 관리자가 UI로 변경하려면 SettingPage 폼 추가 필요 여부 확인 권고. **현 기능 동작에는 영향 없음**(시드/폴백으로 충족).

---

## 결론

경계면 불일치·런타임 깨짐 0건. backend/frontend 재작업 필요 항목 없음. 미검증 3건은 전부 정적 검증 도달 불가 영역(런타임/실데이터/범위 외 UI)으로, 추측 통과가 아닌 명시적 보류. 배포 전 `forge tunnel`로 M1(EMPTY scopeBands 폴백 + CTA)만 1회 수동 확인 권고.
