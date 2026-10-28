---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, portfolio-dashboard, design, echarts, batch-snapshot, project-comparison]
date: 2026-06-01
status: superseded-by-implementation
---

# 2026-06-01 — 전사 통합 대시보드(Portfolio Dashboard) 설계

상위: [[moves-workforce]] · **구현: [[2026-06-02-portfolio-implementation]]** · 관련: [[2026-05-29-progress-page]] · [[forge-worklog-performance]] · [[forge-i18n]] · [[2026-05-27-mm-redesign]]

> **이 노트는 설계 단계 기록이다. 2026-06-02에 풀스택 구현 완료** → [[2026-06-02-portfolio-implementation]].
> ⚠️ 구현 중 설계 일부가 정정됨: **가동률 Σ/Σ → 글로벌 지표(기간 합집합 분모, A안)**, **문제이슈 SQL 테이블 → KVS 이관**. 아래 본문의 해당 결정(§3 KVS 롤업 축소, §5 가동률 분모 Σ/Σ)은 구현 노트 기준으로 읽을 것.
>
> 산출물: `_workspace/portfolio-dashboard/` (설계서 v3 = `01_architect_design.md`, 요구서, 목업 v1/v2). `feature-harness` 스킬로 Phase 2(설계)까지 수행.

## 1. 개요

기존 분석/진척 화면은 모두 **프로젝트 1개 범위**(`/project/:id` 내부). PMO/경영진이 **여러 프로젝트를 가로질러** 인력·공수·비용·진척·리스크를 보는 상위 화면이 없어 신규 최상위 라우트 `/dashboard` 신설 설계.

- 권한: `canRead('REPORT')` 게이트(진척도 탭과 동일).
- 데이터 전략: **사전 집계(Scheduled Trigger 배치) → 스냅샷 적재 → 조회는 스냅샷만**. 온디맨드 전 프로젝트 집계 금지(Forge 256MB/타임아웃).

## 2. 설계 진화 (요구 누적 — 이 작업의 특징)

대화형으로 요구가 3차에 걸쳐 누적되며 설계 정체성이 바뀜. 각 단계 백업 보존(`_v1`/`_v2`).

| 버전 | 핵심 |
|------|------|
| **v1** | 위젯 6종(KPI·테이블·리스크TOP·가동률·공수추이·기준시각). 전사 합산 중심. SQL 프로젝트행 + KVS 롤업. |
| **v2** | +위젯 3종(롤/레벨 분포 100%정규화 누적막대·급여 분석 2종·문제이슈 버블). `projectusers`에 role/level/salary가 **프로젝트 단위**로 있음 발견(SQL 한 방, 워크로그 무관). 문제이슈 TOP50 별도 SQL 테이블, scatterChartOption 신규. |
| **v3** | ★**정체성 전환: 전사 합산 → 프로젝트별 비교.** 상단 프로젝트 멀티셀렉트 필터(기본 전체), 전사 KPI 카드 제거, 작업분포 scatter-aggregate-bar 추가(위젯 10종). |

## 3. ★ v3 핵심 — 프로젝트별 비교 + 프론트 재집계

가장 큰 설계 결정: **백엔드는 프로젝트별 raw 스냅샷만 반환하고, 필터·분포·합산·누적은 전부 프론트가 재집계.**

- 응답 = `{ projects:[{ ...집계값, members:[{accountId,displayName,roleKey,levelKey,salary,effortMd,effectiveMmDays,utilization}], monthlyEffort:[{month,md}] }], roleMeta, levelMeta, salaryBuckets, problemIssues }`.
- 프론트 멀티셀렉트 필터 → `useMemo`로 위젯별 재집계(분포·합산·라인·누적). 추가 invoke 없음.
- **KVS 롤업 축소**: 메타(lastAggregatedAt/aggregateStatus/aggregating)만. v2의 kpi/utilizationValues/effortTrend/salaryHistogram 전부 제거(프론트 재집계로 불요).
- **문제이슈 버블만 필터 예외**(항상 전 프로젝트). 별도 SQL 테이블 TOP50 유지.

### 저장소 경계
- 프로젝트 스냅샷 = **SQL** `portfolio_project_snapshot`, 인원 배열은 `members_json` **JSON 컬럼**(정규화 테이블 미채택 — across SQL 집계를 안 쓰고 프론트 재집계라 정규화 이점 무의미).
- 문제이슈 TOP50 = **별도 SQL 테이블** `portfolio_problem_issue`(가변 배열 KVS 금지 원칙).
- 롤업 메타 = **KVS** `portfolioRollup`.
- payload 평가: 통상(활성≤30·인원≤30) 단일 호출 안전(~115KB). 대규모 시 `getPortfolioMembers` 분리 호출 폴백 예약.

### 배치
- `src/trigger/portfolioSnapshot.js`(scheduledTrigger, interval day) + `PortfolioAggregator.aggregateAllProjects`(pLimit 2, allSettled 부분실패 격리). 수동 재집계는 fire-and-forget + KVS `aggregating` 가드.
- **per-member 3원 병합**: `ResourceAnalysisService.members[]`엔 accountId/totalMd/effectiveMmDays만(role/level/salary/이름 없음, 워크로그 있는 인원만) → 배치가 projectusers(전원) + 워크로그 totalMd + Jira 사용자명을 서버에서 병합(프론트 `ResourceAnalysisPage` 병합 로직을 배치로 이식). 기존 공통 경로 미수정.

## 4. 위젯 10종 / 레이아웃

상단 **프로젝트 필터 바**(멀티셀렉트, 기본 전체) + 선택분 요약 라인. 섹션2는 **서브탭**(개요/인력·비용/공수·작업), 섹션3(리스크/문제)는 서브탭 밖.

| 섹션 | 위젯 | 차트 |
|------|------|------|
| 개요 | 프로젝트 현황 테이블(중심, 행클릭 드릴다운) | DynamicTable |
| 인력·비용 | 롤/레벨 분포(토글) | 100% 정규화 누적막대 |
| 인력·비용 | 프로젝트별 총인건비 | 막대 |
| 인력·비용 | 급여 구간 분포 | 히스토그램 |
| 인력·비용 | 가동률 분포 | 도넛 |
| 공수·작업 | 공수 추이 비교 | 프로젝트별 멀티라인 + **월별/누적 토글**(누적=미니 S-curve) |
| 공수·작업 | 작업 분포(투입인력 대비 공수) | **scatter-aggregate-bar**(점=인원 공수MD) |
| 리스크 | 리스크 TOP | 가로 막대 |
| 리스크 | 문제이슈 버블 | 산점도(x=지연일수, y=공수편차, 필터 무관) |

- 차트는 전부 **ECharts 공통옵션**(`src/components/chart/echart/options/`) 재사용. ApexCharts 미사용 확인. `scatterChartOption` 신규(작업분포·문제버블), `stackChartOption` 정규화 옵션 추가.
- 목업 `mockup_v2.html`/`.png`이 확정 레이아웃 시각 단일 진실(로컬 ECharts로 렌더, Chrome headless 스크린샷).

## 5. 확정 사항 (사용자)

| 항목 | 결정 |
|------|------|
| 범위 | 전사 across, 신규 `/dashboard` 라우트 |
| 데이터 | 배치 사전집계 → 프로젝트별 raw 스냅샷 → 프론트 재집계 |
| 권한 | REPORT 게이트 |
| 활성 프로젝트 | 날짜 기준만(`start≤오늘≤end`, status 필터 없음) |
| 가동률 band | settings 관리 + read-time 버킷팅 |
| 가동률 분모 | Σ/Σ(v1 일관, 중복인원 보정은 후속) |
| 급여 노출 | **현행 REPORT 게이트로 진행**(개별 salary가 응답에 raw 포함되나 권한자만, 화면엔 합계·구간만. 서버 마스킹은 후속) |
| 공수 추이 | 월별/누적 토글 포함 |

## 6. 후속 과제 (설계서 §11)

- 급여 서버 마스킹·별도 권한(SALARY) 분리
- 가동률 중복 인원 분모 보정(인원별 max/기간 합집합)
- 대규모 시 `getPortfolioMembers` 분리 호출
- 급여 버킷 경계 settings화

## 7. 메모

- **하네스 운용**: `feature-harness` → architect 서브에이전트(general-purpose/opus) 3회 재호출로 v1→v2→v3 진화. SendMessage 미지원이라 매번 새 에이전트가 이전 설계서+요구서 Read해 이어감. 요구 누적형 설계에 순차 파이프라인이 잘 맞았음. → [[harness-engineering]]
- **목업 워크플로우**: 로컬 `echarts.min.js`(static/ui/node_modules) + Chrome `--headless=new --screenshot` 절대경로 출력 → 실제 차트 렌더 이미지를 대화 중 확인. 설계 합의 속도에 크게 기여(텍스트 설명보다 빠른 수렴).
