# 통합 대시보드 4탭 차트 평가 + 추가 차트 설계

> 작성 2026-08-18. 대상: `/dashboard` Time · Scope · Resource · Cost 탭.
> 원칙: **백엔드 0·추가 invoke 0**(스냅샷 재집계) 범위 안에서만 제안. 스냅샷 응답 shape 는 `PortfolioDashboardService` 기준.

## 0. 가용 데이터 (프론트가 이미 들고 있는 것)

| 출처 | 필드 | 비고 |
|---|---|---|
| `projects[]` | `startDate, endDate, completionRate, scheduleRate, diffPercentPoint, diagnosisStatus, plannedTotalMd, actualTotalMd, actualMm, riskScore, issueSummary{done,inProgress,todo}, memberCount, avgUtilization, aggregatedAt, isStale, statusName/Color` | 필터 반응 |
| `projects[].members[]` | `accountId, displayName, roleKey, levelKey, effortMd, utilization` (+`salary` 마스킹) | 프로젝트마다 반복 → 인원 dedup 필수 |
| `projects[].monthlyEffort[] / weeklyEffort[]` | `{month\|week, md}` | week = 월요일 날짜 |
| `projects[].spaces[]` | `{spaceKey, spaceName, done, inProgress, todo}` | v019 이후 |
| `projects[].totalSalary` | 마스킹 시 키 부재 | `costMasked` 게이팅 |
| `utilization` | `buckets[]`, `people[]{accountId, util, investedMd, availMd, utilBand}` | **글로벌**(필터 무관) |
| `problemIssues[]` | `{projectId, projectName, issueKey, summary, assignee, delayDays, effortDiff, statusKey, severity}` | **글로벌 TOP50**(필터 무관, 기지 한계) |
| `roleMeta, levelMeta, utilizationBands, scopeBands` | | |

핵심 산식(백엔드 `ProgressCalculator`): `completionRate` = **계획 공수 가중** 완성률(건수 아님). `scheduleRate` = 캘린더 경과율. `diffPercentPoint = (completion − schedule)×100`. `cpi = completion / schedule`, `actual = totalSalary × scheduleRate`.

---

## 1. 탭별 평가

### Time (일정) — 간트 · 공수 추이(월/주·누적) · 리스크 TOP
- **잘 답하는 것**: 기간 겹침(간트), 투입 리듬(추이), 최악 프로젝트(리스크 TOP).
- **비어 있는 것**
  - **편차의 크기·방향 비교**: `diffPercentPoint`(완성률−일정률)가 개요 신호등 표의 셀에만 있다. "얼마나 뒤졌나"를 프로젝트끼리 한눈에 비교하는 그림이 없다. 리스크 TOP 은 `riskScore` 로 방향(선행/지연)을 잃는다.
  - **마감 임박**: "다음 30/60/90일 안에 끝나야 하는 프로젝트가 몇 개고 그중 완성률이 낮은 게 뭔가" — 간트에서 눈으로 찾아야 한다.
  - **투입 정체**: 진행 중인데 최근 몇 주 워크로그가 0인 프로젝트. 추이 라인은 12개가 겹치면 0 인 선을 못 읽는다. `weeklyEffort` 가 이미 있어 프로젝트×주 히트맵이 바로 된다(행 = 프로젝트 ≤12 상한이라 인원 히트맵의 문제가 없다).

### Scope (범위) — 토폴로지 · 이슈 상태 분포 · 완성률 vs 일정률 · 계획 vs 실적 공수 · 문제 이슈 버블
- **잘 답하는 것**: 작업이 어디에 어떻게 흩어져 있나(토폴로지), 상태 구성, 범위 소화.
- **비어 있는 것**
  - **건수 vs 공수 괴리**: `issueSummary` 는 건수, `completionRate` 는 공수 가중이다. 두 비율이 벌어지면 "작은 이슈만 끝내고 큰 이슈가 남았다"(건수 > 공수) 또는 "큰 덩어리를 끝냈지만 잔챙이가 많다"(공수 > 건수)는 신호인데 두 값이 **다른 위젯에 따로** 있어 비교가 안 된다.
  - **지연 이슈의 사람 축**: `problemIssues[].assignee` 가 있는데 버블은 이슈 단위다. "지연이 몰린 담당자"를 못 본다. (글로벌 TOP50 한계는 그대로 — 캡션 필수.)
  - 스페이스 정량 비교는 토폴로지 노드 크기로 대체되므로 **추가 안 함**.

### Resource (자원) — 관계도 · 롤/레벨 · 가동률 · 작업 분포 · 집중도 파레토 · 가동률×투입 산점
- 2026-08-18 확충으로 "구성"과 "흩어짐" 양쪽이 채워졌다. **추가 제안 없음.**

### Cost (비용) — KPI · 월별 실집행 · 계획 vs 실집행 · 소진 vs 진척 산점 · 롤/레벨별 · 초과 위험 순위
- **잘 답하는 것**: 지금까지 얼마 썼나, 어디가 위험한가(CPI).
- **비어 있는 것**
  - **완료 시 예상(EAC)**: EVM 의 정석 질문 "이대로 가면 끝날 때 얼마 드나"가 없다. `EAC = totalSalary / cpi`(cpi null 이면 예산 그대로) — 초과 위험 순위가 CPI 를 이미 계산하므로 한 걸음이다. 전사 합계 **초과 예상액** 한 줄이 경영진 질문에 직접 답한다.
  - **MD 단가**: `totalSalary / actualTotalMd` 로 프로젝트별 인건비 단가 비교 — 시니어 편중 프로젝트가 드러난다. 유용하지만 EAC 보다 후순위.
- 모든 비용 위젯은 `costMasked` 게이팅 유지(키 부재 → `?? 0` 금지, 위젯 자체 숨김).

---

## 2. 추가 차트 설계 (후보 7 → 확정 6 구현 → **T1·T2 는 구현 후 사용자 판단으로 삭제, 최종 S1·S2·C1·C2**)

| # | 탭 | 위젯 | 형태 | 핵심 산식(순수함수) | 우선 |
|---|---|---|---|---|---|
| ~~T1~~ | Time | ~~일정 편차 발산 막대~~ (구현 후 삭제) | 가로 발산 막대(0 기준 좌=지연/우=선행), 색=`diagnosisStatus`, 정렬 asc | `scheduleDeviation(selected)` → `[{projectId,name,diffPP,status,completion,schedule}]` diffPP asc | ★★★ |
| ~~T2~~ | Time | ~~마감 임박 레이더~~ (구현 후 삭제) | 30/60/90일 토글 + 표(남은 일수·완성률·todo 비중·상태), 남은 기간 대비 완성률 낮으면 강조 | `upcomingDeadlines(selected, today, horizonDays)` → `[{…, daysLeft, completion, todoRatio, atRisk}]`, `atRisk = completion < scheduleRate − 0.1` (기존 `diffPP` 임계 재사용) | ★★★ |
| ~~T3~~ | Time | ~~프로젝트×주 투입 히트맵 (정체 감지)~~ (미채택) | y=프로젝트(≤12), x=최근 N주(기본 12), 셀=MD; 진행 중인데 최근 2주 0 인 행에 배지 | `weeklyEffortMatrix(selected, {weeks:12})` → `{weeks[], projects[], cells[[xi,yi,md]], stalled:[projectId]}` | ★★☆ |
| S1 | Scope | **건수 완료율 vs 공수 완성률 괴리** | 덤벨(프로젝트별 두 점 + 연결선) 또는 발산 막대(공수−건수) | `countVsEffortCompletion(selected)` → `[{name, countRate=done/total, effortRate=completionRate, gap}]` total 0 가드 | ★★★ |
| S2 | Scope | **지연 이슈 담당자 집중** | 가로 막대 TOP10(건수, 툴팁 severity 합·최대 delayDays), 미배정은 "미배정" 묶음, **글로벌 캡션** | `problemIssuesByAssignee(problemIssues, n=10)` → `[{assignee, count, severitySum, maxDelay}]` | ★★☆ |
| C1 | Cost | **완료 시 예상 비용(EAC) vs 예산** | 프로젝트별 그룹 막대(예산·EAC) + 상단 KPI "전사 초과 예상 ₩X" ; `costMasked` 게이팅 | `costEac(selected)` → `{rows:[{name,budget,eac,overrun}], totalBudget,totalEac,totalOverrun}`, `eac = cpi>0 ? budget/cpi : budget` | ★★★ |
| C2 | Cost | **프로젝트별 MD 단가** | 가로 막대 + 전사 평균선 ; `costMasked` 게이팅 | `costPerMd(selected)` → `[{name, perMd = totalSalary/actualTotalMd}]` actualTotalMd 0 은 제외·표기 | ★☆☆ |

**공통 규약(구현자 준수)**
- 집계는 전부 `pages/portfolio/utils/portfolioAggregate.js` 순수함수 + `__test__/portfolioAggregate.test.js` 테스트(빈 입력·0 분모·급여 getter 트랩 — 비용 위젯 외에는 salary 미참조 고정).
- 위젯은 `widgets/Portfolio*.jsx`, `ChartBox`·`ChartTableToggle`·`WidgetCard`·`BentoTile(cardId)` 재사용. 카드 키는 `portfolioCards.js` 에 추가.
- 상한을 걸면 `hidden*Count` 로 돌려주고 배너로 노출(조용한 절단 금지). 글로벌 데이터(`problemIssues`)를 쓰는 위젯은 "상단 필터 무관" 캡션 필수.
- 비용 위젯은 `costMasked` 면 **카드 자체를 안 그리거나 대체 안내**(기존 CostTab 패턴 따라감), `?? 0` 으로 ₩0 만들지 않는다.
- i18n: `locales/kr|en/portfolio.json` 에 추가 후 `npm run merge`. 키 존재 검증(포트폴리오 전 `t("portfolio.…")` 를 두 언어에서 grep) 통과.
- 검증: `CI=true npx jest` 전체 + `CI=true npm run build`.

---

## 3. 배치 제안

- **Time**: 변경 없음(간트 6 → 공수 추이 4 | 리스크 TOP 2)
- **Scope**: 토폴로지 6 → [이슈 상태 2 | 완성 vs 일정 4] → [건수 vs 공수 괴리 3 | 담당자 집중 3] → [계획 vs 실적 3 | 문제 이슈 버블 3]
- **Cost**: KPI 6 → [월별 4 | 계획 vs 실집행 2] → [**EAC 3** | 산점 3] → [롤/레벨 3 | MD 단가 3] → 초과 위험 순위 6
