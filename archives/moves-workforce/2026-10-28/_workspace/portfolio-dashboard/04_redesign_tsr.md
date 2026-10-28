# 전사 통합 대시보드 — Time / Scope / Resource(철의 삼각형) IA 재설계서

> 슬러그 `portfolio-dashboard` · feature-architect · 2026-06-02
> **이 문서는 프론트 정보구조(IA) 재설계서다.** 백엔드 경계면 계약(`01_architect_design.md` §2)·데이터 모델(§4)·DB·배치는 **전부 동결**한다.
>
> **단일 진실 원천 우선순위**
> - **데이터 원천(불변)**: `02_backend_report.md` 의 응답 shape. 이 문서의 모든 위젯은 그 응답 필드만 소비한다. 새 백엔드 필드 0건.
> - **프론트 IA(대체)**: 본 문서 §4·§5 가 `01_architect_design.md` §6(프론트 구조)의 서브탭/위젯 배치를 **대체**한다. 나머지(권한 게이트·단일 useQuery·필터 훅·재집계 유틸 8종·차트옵션)는 그대로 유지.
> - `01` 설계서는 **백엔드 계약 참조용으로 보존**(삭제·수정 금지).
>
> **재설계 트리거(사용자 확정)**: 기존 서브탭(개요/인력·비용/공수·작업)은 데이터 묶음 기준 분류라 "이 프로젝트가 위험한가"를 한 화면에서 못 읽는다. 철의 삼각형(Time·Scope·Resource)으로 재편해 **각 축이 곧 의사결정 질문**이 되게 한다.

---

## 0. 사용자 확정 전제 (이 위에서 설계)

1. **적용 단위 = 프로젝트별 비교 유지**(현 정체성). 상단 프로젝트 멀티셀렉트 필터 + 선택분 요약 라인 유지. 가동률·문제이슈의 "필터 무관" 동작 유지.
2. **기존 서브탭(개요/인력·비용/공수·작업) → Time/Scope/Resource 로 전면 교체.** + 최상위 **종합 개요 = 프로젝트별 T/S/R 신호등 행**(현황 테이블 승격).
3. **Resource 축 = 인력·인건비 현황**(현 데이터로 충분). 예산/CPI 등 신규 데이터 **도입 금지**.

## 0-1. 무엇이 안 바뀌는가 (구현자 안심용 — ★최우선 명시)

| 영역 | 상태 | 근거 |
|------|------|------|
| 백엔드 경계면 계약(`getPortfolioDashboard`/`triggerPortfolioAggregation` 응답 shape) | **무변경** | 본 재설계는 동일 응답을 다르게 배치/표현할 뿐 |
| 데이터 모델·SQL·KVS·배치(`PortfolioAggregator`/스냅샷/migrate) | **무변경** | 새 필드 0건 |
| 재집계 유틸 8종(`utils/portfolioAggregate.js`) | **무변경(재사용)** | 신규 위젯 2개는 기존 데이터에서 프론트 파생 |
| 권한 게이트 `canRead('REPORT')` · 단일 useQuery · `usePortfolioFilter` · `portfolioKeys` | **무변경** | `PortfolioDashboardPage.jsx` 셸 유지 |
| 위젯 컴포넌트(`PortfolioRoleLevelDist`/`SalaryByProject`/`SalaryHistogram`/`Utilization`/`EffortTrend`/`WorkDist`/`RiskTop`/`ProblemBubble`/`ProjectTable`) 내부 로직 | **무변경(재배치만)** | 탭 컨테이너만 교체 |
| 차트옵션(`stackChartOption` normalize·`scatterChartOption`)·`ChartTableToggle`·`InfoTip`·`WidgetCard` | **무변경(재사용)** | 패턴 그대로 |
| 가동률·문제이슈의 필터 무관 동작 | **무변경** | A안 글로벌 지표 정의 유지 |

> 변경 대상은 **탭 컨테이너 3개(파일 교체)·종합 개요 위젯 1개 신규·Scope 이슈상태 위젯 1개 신규·페이지 셸의 탭 구성 1곳·i18n 키 확장**뿐. 백엔드 zero-touch.

---

## 1. 3축 정의 (각 축이 답하는 질문 — 한 줄)

| 축 | 한 줄 정의 | 핵심 질문 |
|----|-----------|-----------|
| **Time(일정)** | 선택 프로젝트들이 **일정대로 가고 있는가** — 완성 대비 일정 진척, 지연 폭, 공수 소진 추이, 지연 이슈를 본다 | "늦고 있는 프로젝트는? 얼마나?" |
| **Scope(범위)** | 선택 프로젝트들의 **할 일이 얼마나 끝났고 무엇이 남았는가** — 완성률, 이슈 상태(done/inProgress/todo) 구성, 계획 대비 실적 공수를 본다 | "범위는 얼마나 소화됐나? 남은 일은?" |
| **Resource(자원)** | 선택 프로젝트들의 **사람·돈이 어떻게 투입되고 있는가** — 인력 구성(롤/레벨), 인건비, 가동률, 인당 공수 편중을 본다 | "사람·비용이 적정한가? 누가 과부하인가?" |

> **종합 개요(서브탭 밖, 최상위)**: 위 3축을 **프로젝트 1행에 신호등 3개**로 압축. "어느 프로젝트가 어느 축에서 위험한가"를 0.5초에 스캔.

---

## 2. 위젯 ↔ 축 매핑표 (★ 구현 착수 기준)

> 기준: 위젯이 **소비하는 응답 필드의 성격**(시간/범위/자원)으로 1차 귀속. 경계 위젯은 §2-1 에서 근거와 함께 결정.

| 위젯(기존/신규) | 소비 응답 필드 | 재집계 함수 | **귀속 축** | 비고 |
|----------------|----------------|-------------|-------------|------|
| **종합 개요 신호등**(신규) | `projects[].{completionRate,scheduleRate,diffPercentPoint,diagnosisStatus,avgUtilization,totalSalary,memberCount,actualMm,isStale,aggregatedAt}` | `filterProjects` + 신규 `tsrSignals` | **종합(서브탭 밖)** | 현황 테이블을 신호등 행으로 승격 |
| 공수 추이 비교 `PortfolioEffortTrend` | `projects[].monthlyEffort[]` | `effortTrendByProject(mode)` | **Time** | 시간축 공수 소진(번업) = 일정 신호 |
| 리스크 TOP `PortfolioRiskTop` | `projects[].{riskScore,diffPercentPoint,diagnosisStatus}` | `riskTop(n)` | **Time** | riskScore = 완성−일정 지연 %p → 일정 리스크 |
| 문제 이슈 버블 `PortfolioProblemBubble` | `problemIssues[]`(`delayDays`,effortDiff,severity) | (없음·필터 무관) | **Time** | x=지연일수 → 일정축. 필터 무관 유지 |
| **이슈 상태 분포**(신규) | `projects[].issueSummary{done,inProgress,todo}` | 신규 `issueStatusDistribution` | **Scope** | 범위 소화/잔여 — 전용 위젯 없던 데이터 |
| 현황 테이블 `PortfolioProjectTable` | `projects[]` 전체 | `filterProjects` | **종합 개요로 흡수**(아래 §2-1) | 신호등 행이 대체·통합 |
| 롤/레벨 분포 `PortfolioRoleLevelDist` | `projects[].members[].{roleKey,levelKey}`+meta | `roleLevelDistribution(axis)` | **Resource** | 인력 구성 |
| 프로젝트별 총인건비 `PortfolioSalaryByProject` | `projects[].totalSalary` | `salaryByProject` | **Resource** | 비용 |
| 급여 구간 분포 `PortfolioSalaryHistogram` | `projects[].members[].salary`+`salaryBuckets` | `salaryHistogram` | **Resource** | 비용 구조 |
| 가동률 분포 `PortfolioUtilization` | `utilization.buckets[]`(필터 무관) | (없음) | **Resource** | 인력 부하. 필터 무관 유지 |
| 작업 분포 `PortfolioWorkDist` | `projects[].members[].effortMd` | `workDistribution` | **Resource** | (경계 — §2-1) 인당 공수 편중 |

### 2-1. 경계 위젯 귀속 결정 + 근거

| 경계 위젯 | 후보 축 | **결정** | 근거 |
|-----------|---------|----------|------|
| **작업 분포(WorkDist)** | Scope(공수=범위 소화) vs Resource(인당 공수=인력 편중) | **Resource** | 점=`members[].effortMd`(인원 1명). 위젯의 1차 질문이 "누가 많이/적게 일하나(인력 편중)"라 **자원 관점**. 범위 소화량은 이슈상태/공수추이가 더 직접적. mockup `c_work` 의도(인력 대비 공수)와 일치 |
| **리스크 TOP / 문제 버블** | Time(일정 지연) vs Scope(미완 범위) | **Time** | 둘 다 `diffPercentPoint`(완성−일정) / `delayDays`(기한초과) 기반 → 핵심 지표가 **시간(지연)**. 미완 범위는 Scope 이슈상태 위젯이 담당 |
| **공수 추이(EffortTrend)** | Time(시간 추이) vs Resource(투입량) | **Time** | x축이 월(시간), 곡선이 누적 소진(S-curve) → 일정 진행 속도 신호. 투입 절대량 비교는 인건비/작업분포가 담당 |
| **현황 테이블(ProjectTable)** | 어느 단일 축에도 안 맞음(전 지표 혼재) | **종합 개요로 승격·흡수** | 한 행에 완성/일정/가동률/인건비가 다 있어 단일 축 배정 불가. → 신호등 행으로 재구성해 **종합 개요 최상위**에 둠. 기존 테이블 컬럼은 신호등 행의 "펼침/표 토글"로 보존 |

> **이슈 상태 분포**는 경계 아님 — `issueSummary` 는 순수 범위 데이터라 **Scope 단독 귀속**.

### 2-2. 축별 위젯 최종 배치 (서브탭 3 = Time / Scope / Resource)

| 축 | 위젯 구성 | 그리드 |
|----|----------|--------|
| **Time(일정)** | ① 공수 추이 비교(월별⇄누적 토글) ② 리스크 TOP ③ 문제 이슈 버블(필터 무관) | 2열(추이 폭넓게, 리스크/버블 하단) |
| **Scope(범위)** | ① **이슈 상태 분포**(신규, 프로젝트별 done/inProgress/todo 누적막대) ② (보강 옵션) 완성률 vs 일정률 비교 막대 — §3-3 | 2열 |
| **Resource(자원)** | ① 롤/레벨 분포 ② 프로젝트별 총인건비 ③ 급여 구간 분포 ④ 가동률 분포(필터 무관) ⑤ 작업 분포 | 2열(현 PeopleCost 레이아웃 + 작업분포 이동) |

> 기존 섹션3(리스크/문제, 서브탭 밖 상시노출)은 **Time 탭으로 흡수**한다(§4-3). "리스크/문제"는 본질적으로 일정 리스크라 Time 축에 두는 것이 IA 일관성↑. 종합 개요 신호등이 이미 전 축 리스크를 최상위에서 노출하므로 상시노출 중복 제거.

---

## 3. 신규/파생 위젯 (각 2개 — 소비 필드·파생함수 명시)

### 3-1. (신규 a) 이슈 상태 분포 — Scope 축

- **목적**: 선택 프로젝트별 이슈가 완료/진행/대기로 어떻게 구성됐나(범위 소화·잔여). 현재 `issueSummary` 데이터가 응답에 있으나 **전용 위젯이 없다**(현황 테이블에도 미표시).
- **소비 응답 필드**: `projects[].issueSummary { done, inProgress, todo }` (백엔드 리포트 §1.1 확인 — 이미 내려옴. **백엔드 무변경**).
- **신규 파생함수** `issueStatusDistribution(selected, mode)` — `utils/portfolioAggregate.js` 에 9번째 순수함수로 추가:
  ```
  입력: selected projects[], mode 'count'|'ratio'(기본 'count')
  출력: {
    categories: [projectName…],
    series: [
      { name: 'done',       data: [p.issueSummary.done … ] },
      { name: 'inProgress', data: [p.issueSummary.inProgress … ] },
      { name: 'todo',       data: [p.issueSummary.todo … ] },
    ]
  }
  // ratio 모드: 각 프로젝트 합으로 나눠 0~1(stackChartOption normalize:true 와 짝)
  // 합 0 인 프로젝트는 0 처리(NaN 방지)
  ```
- **차트**: 기존 `stackChartOption` 재사용. `mode='count'` → `normalize:false`(인원 분포 위젯과 동일 패턴), `mode='ratio'` → `normalize:true`. 색상: done=green / inProgress=blue / todo=neutral.
- **차트⇄표 토글**: `ChartTableToggle` 재사용. 표 = 프로젝트 × (완료/진행/대기/합) 매트릭스.
- **InfoTip**: calc="이슈 상태별 카운트(done/inProgress/todo)", interp="대기 비중이 큰데 일정이 임박하면 범위 리스크".
- **위젯 컴포넌트**: `widgets/PortfolioIssueStatusDist.jsx` 신규. 기존 `PortfolioRoleLevelDist.jsx` 를 구조 템플릿으로(누적막대+토글+표).
- **신규 백엔드 필드**: **0건**(issueSummary 기존 소비).

### 3-2. (신규 b) 프로젝트별 T/S/R 신호등 행 — 종합 개요

- **목적**: 프로젝트 1행에서 **Time·Scope·Resource 3축 신호등 + 핵심 수치**를 동시 스캔. 현황 테이블을 "신호등 우선"으로 승격.
- **소비 응답 필드**(전부 기존):
  - Time 신호: `diffPercentPoint`, `diagnosisStatus`(delayed/caution/normal — read-time 산출값 그대로 사용)
  - Scope 신호: `completionRate`, `issueSummary`(todo 잔여 비중)
  - Resource 신호: `avgUtilization`(가동률 band), `totalSalary`, `memberCount`
  - 부가: `projectName`, `statusName`, `actualMm`, `isStale`, `aggregatedAt`
- **신규 파생함수** `tsrSignals(selected, settings)` — `utils/portfolioAggregate.js` 10번째 순수함수:
  ```
  입력: selected projects[], { utilUnder=0.7, utilOver=1.1 } (가동률 band 재사용)
  각 프로젝트 → {
    projectId, projectName, statusName, isStale, aggregatedAt,
    time:  { level, completion: completionRate, schedule: scheduleRate, diff: diffPercentPoint },
    scope: { level, completion: completionRate, todoRatio },   // todoRatio = todo/(done+inProgress+todo)
    resource:{ level, utilization: avgUtilization, memberCount, totalSalary },
  }
  // ── 신호등 임계(threshold) — §6 열린 질문에서 확정 필요. 잠정값(재사용 기반): ──
  // time.level   = diagnosisStatus 매핑 그대로 (delayed→red, caution→amber, normal→green)  ← read-time 값 재사용(새 임계 발명 X)
  // scope.level  = todoRatio 기준: <0.3 green / 0.3~0.6 amber / ≥0.6 red  (잠정 — 확정 필요)
  // resource.level = avgUtilization 기준: under band 미만 OR over band 초과 → amber, 그 사이 green,
  //                  심한 과부하(≥ over+0.2 등) → red  (가동률 band 재사용 — 새 데이터 X)
  ```
  > **임계 재사용 원칙**: time.level 은 백엔드 `diagnosisStatus`(이미 settings.progressThreshold 적용된 read-time 산출)를 **그대로 매핑**한다 — 프론트가 일정 임계를 재발명하지 않는다. resource.level 은 settings 가동률 band(under 0.7/over 1.1) 재사용. **scope.level 의 todoRatio 임계만 신규**(§6 Q로 사용자 확정 필요, 잠정 0.3/0.6).
- **표현**: 행 = 프로젝트, 컬럼 = [프로젝트명 | 상태 | **🟢🟡🔴 T** | **S** | **R** | 완성% | 일정% | 가동률 | 인건비 | 인원]. 신호등은 3개 작은 원(색=level) + 호버 시 수치 툴팁. isStale 행은 "어제 값" 배지 유지(기존 패턴).
- **드릴다운**: 행 클릭 → `navigate('/project/'+projectId)` (기존 동일).
- **차트⇄표 토글**: 신호등 뷰 ⇄ 풀 수치 표(= 기존 `PortfolioProjectTable` 컬럼). 즉 기존 테이블을 표 모드로 보존 → 정보 손실 0.
- **위젯 컴포넌트**: `widgets/PortfolioTsrSignalTable.jsx` 신규. 기존 `PortfolioProjectTable.jsx` 의 DynamicTable·Badge·드릴다운·isStale 툴팁 패턴 재사용(신호등 셀만 추가). 기존 `PortfolioProjectTable.jsx` 는 "표 모드"로 내부 재사용하거나 컬럼 정의 공유.
- **신규 백엔드 필드**: **0건**.

> **신규 위젯 2개 모두 기존 응답 필드로 100% 파생 가능** — `issueSummary`(존재·미사용)·`diffPercentPoint`·`diagnosisStatus`·`completionRate`·`avgUtilization` 전부 `02_backend_report.md` §1.1 에 명시됨. 백엔드 요청 불필요.

### 3-3. (선택·후순위) Scope 보강 — 완성률 vs 일정률 비교 막대

- Scope 탭이 신규 위젯 1개뿐이면 빈약 → `completionRate`(범위 소화) vs `scheduleRate`(시간 경과)를 프로젝트별 그룹막대로 병치(차이=`diffPercentPoint` 가 신호등 Time 과 중복이라 Scope에선 "범위 진척"으로 해석). `barChartOption` 재사용, 신규 파생함수 불필요(기존 필드 직접 map). **MVP 선택 — Scope 위젯 1개로 충분하면 생략.**

---

## 4. 레이아웃 (mockup_v2 대비 변경점)

### 4-1. 페이지 구조 (위→아래)

```
PortfolioHeader (기준시각 + 재집계 + status 배너)        ← 무변경
PortfolioFilterBar (멀티셀렉트 + 선택분 요약 라인)       ← 무변경
┌─ 종합 개요 (서브탭 밖, 최상위) ─────────────────────┐
│  PortfolioTsrSignalTable (신규) — 프로젝트별 T/S/R   │  ★승격: 현황 테이블 → 신호등 행
│  [신호등 ⇄ 풀 수치표 토글]                          │
└─────────────────────────────────────────────────┘
┌─ 서브탭: Time | Scope | Resource ───────────────────┐  ★교체: 개요/인력비용/공수작업 → T/S/R
│  Time:     공수 추이 / 리스크 TOP / 문제 버블        │
│  Scope:    이슈 상태 분포(신규) / (완성vs일정 막대)  │
│  Resource: 롤레벨 / 총인건비 / 급여히스토 / 가동률 / 작업분포 │
└─────────────────────────────────────────────────┘
```

### 4-2. mockup_v2 → 재설계 변경점 표

| 영역 | mockup_v2 / 현 구현 | 재설계 |
|------|---------------------|--------|
| 서브탭 라벨 | 개요 / 인력·비용 / 공수·작업 | **Time / Scope / Resource** |
| 최상위 | 서브탭 "개요" 안에 현황 테이블 | **서브탭 밖 종합 개요 = T/S/R 신호등 행**(현황 테이블 승격) |
| 현황 테이블 | 개요 탭 단독 위젯 | 신호등 행으로 재구성, 기존 테이블은 토글 "표 모드"로 보존 |
| 이슈 상태 | 미표시(데이터만 존재) | **Scope 탭 신규 위젯** |
| 공수 추이 | 공수·작업 탭 | **Time 탭** |
| 작업 분포 | 공수·작업 탭 | **Resource 탭** |
| 롤레벨/인건비/급여/가동률 | 인력·비용 탭 | **Resource 탭**(그대로 묶음 이동) |
| 리스크 TOP / 문제 버블 | 섹션3(서브탭 밖 상시노출) | **Time 탭으로 흡수**(상시노출 해제 — 종합 개요 신호등이 리스크 요약 담당) |

### 4-3. 리스크/문제 섹션 처리 방안 (열린 질문 §6 Q2 와 연동)

- **채택안(A)**: 리스크 TOP·문제 버블을 **Time 탭으로 이동**(서브탭 밖 상시노출 해제). 근거: 둘 다 일정 지연 지표 → Time 귀속이 IA 일관. 종합 개요 신호등이 이미 전 프로젝트 리스크를 최상위 상시 노출하므로 중복 상시노출 불필요.
- **대안(B)**: 리스크/문제를 **서브탭 밖 상시노출 유지**(현 구조). 장점=어느 탭에서도 리스크 가시. 단점=Time 탭과 중복·종합 개요 신호등과 삼중 노출.
- **권고 = A**(§6 Q2 에서 사용자 확정). 구현은 `RiskSection.jsx` 를 Time 탭 내부로 이전.

### 4-4. CSS / 그리드

- 기존 `.portfolio-grid2`·`.portfolio-subtabs`·`.portfolio-subtab` 클래스 재사용. 신호등 셀용 클래스(`.tsr-dot`/`.tsr-dot--red|amber|green`) 만 `PortfolioDashboard.css` 에 추가.

---

## 5. 파생 유틸 (기존 8종 + 신규 2종)

`utils/portfolioAggregate.js` — 순수함수, `useMemo` 호출, 추가 invoke 없음. frontend jest + 골든 픽스처 갱신 대상.

| # | 함수 | 상태 | 소비 위젯 |
|---|------|------|----------|
| 1 | `filterProjects` | 기존·재사용 | 공통 |
| 2 | `summarizeSelection` | 기존·재사용 | 요약 라인 |
| 3 | `roleLevelDistribution` | 기존·재사용 | Resource 롤레벨 |
| 4 | `salaryByProject` | 기존·재사용 | Resource 인건비 |
| 5 | `salaryHistogram` | 기존·재사용 | Resource 급여 |
| 6 | `effortTrendByProject` | 기존·재사용 | Time 공수추이 |
| 7 | `workDistribution` | 기존·재사용 | Resource 작업분포 |
| 8 | `riskTop` | 기존·재사용 | Time 리스크TOP |
| **9** | **`issueStatusDistribution(selected, mode)`** | **신규** | **Scope 이슈상태**(§3-1) |
| **10** | **`tsrSignals(selected, bands)`** | **신규** | **종합 개요 신호등**(§3-2) |

- **가동률(utilization)·문제이슈(problemIssues)**: 글로벌 직접 사용 유지 — 재집계 함수 없음(현행 그대로).
- **신규 2종 모두 결정적 순수함수** → 기존 골든 픽스처(`portfolioAggregate.fixture.js`)에 기대 출력 스냅샷 1세트씩 추가(조용한 회귀 차단 — §13 기존 원칙 계승).

---

## 6. i18n (신규 키 — `locales/kr/portfolio.json` + en 동형, merge 필수)

> 기존 `portfolio.*` 네임스페이스 확장. ko-KR/en-US 직접 수정 금지 → `cd static/ui && npm run merge`.

```jsonc
{
  // ── 서브탭 라벨 교체(기존 subtab.overview/peopleCost/effortWork 는 유지하되 미사용 or 제거) ──
  "subtab": {
    "time": "일정 (Time)", "scope": "범위 (Scope)", "resource": "자원 (Resource)"
    // 기존 overview/peopleCost/effortWork 키는 신호등 승격으로 미사용 → 제거 또는 보존(구현자 판단)
  },

  // ── 종합 개요 신호등 ──
  "overview": {
    "title": "종합 개요 — 프로젝트별 T/S/R 신호",
    "desc": "각 프로젝트의 일정·범위·자원 상태를 신호등으로 요약 (행 클릭 → 상세)",
    "colTime": "일정", "colScope": "범위", "colResource": "자원",
    "viewSignal": "신호등", "viewTable": "수치표",
    "signal": { "red": "위험", "amber": "주의", "green": "정상" },
    "tip": {
      "time": "완성률−일정률 차이(지연 %p)와 진단 상태",
      "scope": "완료/진행/대기 구성 — 대기 비중",
      "resource": "가동률 적정/과소/과부하 · 인원 · 인건비"
    },
    "info": { "calc": "일정=완성−일정 진단, 범위=대기 비중, 자원=가동률 band", "interp": "세 신호 중 적색이 많을수록 종합 리스크 높음" }
  },

  // ── Scope 이슈 상태 분포(신규) ──
  "issueStatus": {
    "title": "이슈 상태 분포", "desc": "프로젝트별 완료 / 진행 / 대기 이슈 구성",
    "done": "완료", "inProgress": "진행", "todo": "대기",
    "modeCount": "건수", "modeRatio": "비율",
    "empty": "이슈 데이터가 없습니다",
    "info": { "calc": "issueSummary done/inProgress/todo 카운트", "interp": "대기 비중이 큰데 일정 임박이면 범위 리스크" }
  },

  // ── (선택) Scope 완성vs일정 막대 ──
  "scopeProgress": {
    "title": "완성률 vs 일정률", "desc": "프로젝트별 범위 소화(완성) 대비 시간 경과(일정)",
    "completion": "완성률", "schedule": "일정률"
  }
}
```

> 기존 키(table.*·roleLevel.*·salary.*·utilization.*·effortTrend.*·workDist.*·risk.*·problem.*·common.viewChart/viewTable·filter.*·header.*) 는 **전부 유지**. 변경은 `subtab.*` 라벨 교체 + `overview.*`·`issueStatus.*`(+선택 `scopeProgress.*`) 신규뿐.

---

## 7. 구현 작업 분해 (프론트 only — 백엔드 0건)

### Frontend
- [ ] `utils/portfolioAggregate.js`: `issueStatusDistribution`(§3-1)·`tsrSignals`(§3-2) 2종 추가 + jest 단위 + 골든 픽스처 스냅샷 갱신
- [ ] `widgets/PortfolioIssueStatusDist.jsx` 신규(누적막대 count⇄ratio 토글 + `ChartTableToggle` + InfoTip) — `PortfolioRoleLevelDist.jsx` 템플릿
- [ ] `widgets/PortfolioTsrSignalTable.jsx` 신규(신호등 행 + 신호등⇄수치표 토글, isStale·드릴다운 재사용) — `PortfolioProjectTable.jsx` 패턴/컬럼 공유
- [ ] `tabs/` 교체: `OverviewTab.jsx`→**종합 개요는 서브탭 밖으로 이전**, 신규 `TimeTab.jsx`/`ScopeTab.jsx`/`ResourceTab.jsx`(기존 PeopleCost/EffortWork/Risk 위젯 재배치)
- [ ] `sections/ComparisonTabs.jsx`: TABS 를 time/scope/resource 로 교체, 위젯 분배 변경. (or 신규 `TsrTabs.jsx`)
- [ ] `sections/RiskSection.jsx`: Time 탭으로 흡수(상시노출 해제 — §4-3 A안 확정 시)
- [ ] `PortfolioDashboardPage.jsx`: 종합 개요 신호등을 서브탭 위(필터바 아래)에 배치, `ComparisonTabs` 에 settings 가동률 band 전달(신호등 resource.level 용 — `data.utilization` 또는 settings 조회 경로 확인)
- [ ] `PortfolioDashboard.css`: `.tsr-dot*` 신호등 점 스타일 추가
- [ ] `locales/kr/portfolio.json` + `en` 신규 키(§6) 추가 후 `cd static/ui && npm run merge`
- [ ] 기존 위젯 컴포넌트 내부 로직 **무수정 확인**(재배치만)

### Backend
- [ ] **없음.** `getPortfolioDashboard` 응답·배치·DB·migrate 전부 무변경. (신호등 resource.level 가동률 band 는 응답 `utilization` 또는 기존 settings 조회로 충당 — 새 필드 불요)

---

## 8. 열린 질문 / 위험

| # | 질문 | 잠정/권고 | 확정 필요 |
|---|------|-----------|-----------|
| Q1 | **scope.level(todoRatio) 임계** | 잠정 <0.3 green / 0.3~0.6 amber / ≥0.6 red | ★사용자 확정 — Scope 신호등 색 기준. time/resource 는 기존 임계 재사용(diagnosisStatus·가동률 band)이라 추가 없음 |
| Q2 | **리스크/문제 섹션 처리** | A안(Time 탭 흡수, 상시노출 해제) 권고 | A/B 택일(§4-3) |
| Q3 | resource.level 과부하 "red" 컷 | over band(1.1) 초과=amber, 잠정 ≥1.3 = red | 가동률 band 재사용 범위 내. 추가 임계 1개만 |
| Q4 | 종합 개요 신호등이 가동률(필터 무관 글로벌) 대신 **프로젝트 avgUtilization(프로젝트 내 평균)** 을 쓰는 점 | avgUtilization 사용 권고(프로젝트 단위 신호라 자연스러움, 이중계상 무관) | 글로벌 utilization 과 의미 다름 — InfoTip 에 명시 |
| Q5 | 기존 `subtab.overview/peopleCost/effortWork` i18n 키·`OverviewTab.jsx` 잔존 | 미사용 키/파일 제거 vs 보존 | 구현자 정리 범위 |
| 위험 | 신호등 임계가 프론트 신규(scope) → 백엔드 대조군 없음 | 골든 픽스처에 tsrSignals 기대 색 고정(§13 원칙) | 조용한 회귀 차단 |
| 위험 | 종합 개요 승격 후 정보 밀도↑ | 신호등⇄수치표 토글로 기존 테이블 정보 보존(손실 0) | — |

---

## 9. 요약 (구현 착수 체크)

- **3축**: Time=일정대로 가는가 / Scope=범위 얼마나 끝났나 / Resource=사람·돈 적정한가. 종합 개요=프로젝트별 T/S/R 신호등.
- **위젯 매핑**: 공수추이·리스크·문제버블→Time / 이슈상태(신규)→Scope / 롤레벨·인건비·급여·가동률·작업분포→Resource / 현황테이블→종합 개요 신호등으로 승격.
- **신규 위젯 2개**: 이슈상태 분포(`issueSummary` 소비, `issueStatusDistribution`)·T/S/R 신호등(`completionRate`/`diagnosisStatus`/`avgUtilization` 등 소비, `tsrSignals`). **둘 다 기존 응답 필드로 100% 파생 — 백엔드 0건.**
- **백엔드/배치/DB/경계면 계약 전부 동결.** 변경은 탭 컨테이너 교체 + 위젯 2개 신규 + 파생함수 2개 + i18n 확장.
- **확정 필요**: scope todoRatio 임계(Q1), 리스크/문제 섹션 처리 A/B(Q2).
