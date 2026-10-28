---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, progress, evm, harness, i18n]
date: 2026-05-29
---

# 2026-05-29 — 프로젝트 진척도(Progress) 페이지 설계·구현

상위: [[moves-workforce]] · 이전: [[2026-05-27-mm-redesign]] · 관련: [[forge-i18n]]

> 프로젝트 디테일 **최상위 탭**으로 진척도 페이지 신설. 설계서 원본: `_workspace/01_architect_design.md`. 계산식 상세: `src/resolver/projectProgress/CALCULATION.md`.

## 1. 개요

공수(MD/MM)·워크로그·이슈 상태 데이터는 있으나 "프로젝트가 얼마나 완성됐나"를 보여주는 화면이 없어 신설.
경영진은 상단만 봐도 판단, 실무자는 하단에서 이슈 단위까지 드릴다운.

- 배치: `static/ui/src/constants/tabs.js`의 `projectDetailTabs` **최상위 탭** (`key: 'projectProgress'`). analysisReport 하위 아님.
- 권한: 진척도 탭만 `canRender: () => canRead('REPORT')`. 형제 분석탭은 현행(무게이트) 유지 — 통일은 후속 과제.

## 2. 핵심 개념 — 진척도 3층 분리

하나의 숫자로 합치지 않고 성격이 다른 셋을 따로 산출:

| 층 | 의미 | 산식 |
|----|------|------|
| **층1 공수 진척** | 얼마나 일했나 (소진율, 완성도 아님) | 계획누적 = 순수 선형 / 실제누적 = 워크로그 일별합 누적 |
| **층2 완성 진척** | 얼마나 끝났나 (진짜 진척도) | Σ(이슈진행률 × 계획MD) / Σ(계획MD) |
| **층3 일정 진척** | 시간이 얼마나 흘렀나 (순수 달력) | 경과 WorkDay / 전체 WorkDay |

**이슈 진행률 (층2 입력):**
- 완료(Done 카테고리, `statusCategory.key==='done'`) → 100% 고정 (워크로그가 계획 초과해도 100% 캡)
- 진행 중 → `min(실투입MD / 계획MD, 100%)`  ※ 처리율 필드가 시스템에 없어 공수비율로 근사
- 해야 할 일 → 0%
- 계획MD(planMd) 없는 이슈는 가중 분모에서 제외

## 3. 확정 결정 (사용자)

| 항목 | 결정 | 비고 |
|------|------|------|
| Q1 진행중 처리율 | `min(actual/plan, 100%)` | 시스템에 처리율 필드 부재 → 공수비율 근사 |
| Q3 인원수 | 현재 인원 고정(MVP) | 합류/이탈 이력 테이블 없음 |
| Q5 예측 지연 | 이슈별 예측종료일 max 근사 | remaining 기반, 낙관 편향 명시 |
| Q7 1MM 일수 | 동적 `getMonthMm` | settings에 1MM 필드 없음 |
| #3 계획선 | **순수 선형(BAC 도달)** | 가용률 보정 제거, 공휴일만 영업일 반영 |
| #9 권한 | 진척도 탭만 REPORT 게이트 | |

## 4. 설계 리뷰에서 교정한 것 (EVM 관점)

1. **[규칙2 한계]** Q1로 인해 진행중 완성률=공수소진율 → 진단 규칙2(공수 vs 완성)가 정상 구간(actual<plan)에서 침묵. UI에 "규칙2 과신 금지, 주 신호는 규칙1(완성 vs 일정)" 명시. 사실상 공수 초과/완료 효율 탐지기로 격하.
2. **[예측 편향]** 예측종료일은 `remaining = max(plan−actual, 0)` 기반(거의 끝난 이슈 과대추정 제거). 단 이슈별 전인원 투입 가정의 max는 병렬 불가 무시 → 종료 과소추정(지연 낙관). 카드에 `optimisticApprox` 표기.
3. **[threshold×캐시]** `progressThreshold`(기본 5%p)는 KVS 캐시 페이로드에 미포함. `diagnosis.status`는 read-time에 settings threshold 적용 → threshold 변경이 10분 TTL에 막히지 않음.
4. **[확정지연 음수]** `avgDelayDays`는 지연(>0) 이슈만. 조기완료(선행)는 `avgLeadDays`/`earlyCount`로 분리(평균 왜곡 방지).
5. **[MD 누적오차]** `plannedTotalMd`/`actualTotalMd`는 초 단위로 먼저 Σ한 뒤 1회 변환(이슈별 round 후 합산 금지).
6. **[계획선 도달]** PV 계획선은 순수 선형으로 정확히 plannedTotalMd(BAC)에 도달. 가용률 보정은 계획선에서 제거.

## 5. 진단 규칙

1. **완성(층2) vs 일정(층3)**: 완성 < 일정−threshold → 지연 / ≈ → 정상 / > 일정+threshold → 앞섬. threshold 기본 5%p(settings).
2. **공수(층1) vs 완성(층2)** (보조): 공수 ≫ 완성 → 비효율/리스크 / ≈ → 효율적 / ≪ → 효율 좋음/과다추정. (※ 위 #1 한계 적용)

## 6. 지연 처리 (duedate)

- **확정 지연**(완료 이슈, 회고): 실제 완료일 = Done AND 마지막 워크로그 작성일. 지연일 = 완료일 − duedate. 집계: 평균 지연일(지연만)/지연 비율/최대 지연 + 평균 선행일/조기완료 건수.
- **예측 지연**(미완료, 추세): remaining 기반 이슈별 예측종료일 max vs 프로젝트 종료일. 낙관 근사.

## 7. 화면 구성 (위→아래로 정보 밀도 증가)

- **A. 종합 헤더**: 상태 배지(정상/주의/지연), 완성%·일정%·차이(%p, 양수 초록·음수 빨강), 확정/예측 지연 카드.
- **B. 진척 비교 막대**: 0~100% 축에 일정/완성(강조)/공수 3막대. MD 환산 병기(전체계획·실적기성=earnedMd·실투입=actualTotalMd).
- **C. S-curve 추이**: 계획누적(점선) vs 실제누적(실선) + 오늘 세로선 + 예상완료일 주석. `IssueAnalysisChart` 차트 패턴 차용. ※ 일별 완성진척 추이는 데이터 한계(상태전이 이력 부재)로 미지원 → 토글 비활성.
- **D. 상태별 분포**: 가로 누적막대(완료/진행/할일), 개수/공수 기준 토글(공수 기준 기본).
- **E. 위험 이슈 목록**: 기한초과 미완료/공수편차 큰 이슈. 컬럼 키/담당자/기한/처리율/지연일수/공수편차. 행 클릭 → 작업 상세.

## 8. 구현 구조

### 백엔드 (`src/resolver/projectProgress/`)
- `ProgressCalculator.js` — Forge 의존성 없는 순수 계산(정규화·완성률·공수·계획선·진단·지연·분포). jest 17케이스.
- `ProjectProgressService.js` — 병렬 페치 + KVS 캐시 + 응답 조립.
- `ProjectProgressController.js` — resolver `getProjectProgressSummary` 등록. `src/index.js`에 `registerProjectProgressController` 추가.
- 입력 `{ projectId, startDate, endDate, coworkerFieldId }`. **응답은 responseWrapper 펼침형**(루트 직접: `res.effort`, `res.completion.rate`…). rate류 0~1, `diffPercentPoint`만 %p.
- 재사용: 워크로그 `getResourceProjectWorklogs`(전용 병렬 페처 p-limit → [[forge-worklog-performance]]), 이슈 전체 `getProjectIssuesByFilter` nextPageToken 루프, 메타 `getSummaryData`, 공휴일/설정 기존 서비스, `workday.js`, `calcEstimatedEndDate`.
- KVS 캐시 `ProjectProgress:{projectId}:{startDate}:{endDate}` TTL 10분. `issues[]`·`threshold`는 캐시 미포함.

### 프론트 (`static/ui/src/pages/projectDetail/progress/`)
- `ProgressPage.jsx`(기간 빠른필터+날짜지정, `invoke('getProjectProgressSummary')`, 로딩/빈/에러 상태) + `ProgressHeader`/`ProgressBars`/`ProgressSCurve`/`ProgressStatusDistribution`/`ProgressRiskTable` + CSS.
- `tabs.js` 최상위 탭, `ProjectDetailTabs.jsx`에 `canReadReport` 주입, `projectKeys.progress` 쿼리키 팩토리.
- 재사용: S-curve `IssueAnalysisChart`, 기간필터 `ResourceAnalysisPage`, 막대 `ResourceAnalysisChart`, Card/UserAvatar/IssueComponent/DynamicTable.

## 9. i18n 처리 (중요 — 본 세션 추가 수정) → 상세 [[forge-i18n]]

- **Forge `t()`는 치환을 지원하지 않는다.** 시그니처 `t(i18nKey, defaultValue?)` — 두 번째 인자는 기본값이지 치환 객체가 아님. `t(key, { md })`를 넘기면 `{md}`가 화면에 그대로 노출됨.
- 해결: `static/ui/src/utils/i18n.js`에 `tFormat(t, key, vars)` 헬퍼 신설 — `t(key)` 후 `{var}` 토큰을 수동 치환(기존 `ResourceAnalysisChart`의 `.replace('{count}', v)` 패턴 일반화). 진척도 4개 컴포넌트 10개 호출을 `tFormat`으로 교체.
- 번역 키 추가 경로: **`locales/kr/*.json`·`locales/en/*.json`** (merge.js가 읽는 실제 소스. `locales/script/*`는 빈 스텁). `npm run merge` → `ko-KR.json`/`en-US.json` 생성. ko-KR/en-US 직접 수정 금지.
- ※ 동일 버그가 기존 `IssueAnalysisTable.jsx`(tooltip `{plannedMd}`/`{actualMd}`/`{overRate}`/`{hourRate}` 3건)에도 있어 **함께 `tFormat`으로 수정 완료**. (`ResourceAnalysisChart`의 `.replace('{count}')`는 이미 정상이라 유지)
- 계산식·로직 상세 문서: `src/resolver/projectProgress/CALCULATION.md`

## 9-1. 화면 내 가이드 (사용자 오독 방지)

3층 분리가 핵심이라 보는 사람이 헷갈리지 않도록 **계산 근거 + 해석(판단 지표 사용법)**을 화면에 직접 노출:
- **상단 접이식 "이 화면 읽는 법"** (`ProgressGuide.jsx`) — 3층 의미 + 진단 규칙1(주)/규칙2(보조) + 지연 지표를 펼쳐 설명. 기본 접힘.
- **지표별 ⓘ 툴팁** (`InfoTip.jsx`, `계산`/`해석` 2줄) — 완성/일정/차이/확정지연/예측지연(헤더), 막대 비교, MD 환산, S-curve, 상태분포(개수/공수 모드별 동적)에 배치.
- i18n: `progress.guide.*`, `progress.tip.*`(`completion`/`schedule`/`diff`/`delayConfirmed`/`delayPredicted`/`bar`/`md`/`scurve`/`statusByCount`/`statusByEffort`) 키 추가(kr/en).

## 9-2. 기간 필터 제거 (설계 정정)

진척도는 **현재 시점의 프로젝트 전체 스냅샷**이라 구간(기간) 필터가 맞지 않음. 기존 구간 필터는 워크로그 조회에만 영향을 줘서, 헤더 지표(완성/일정/배지)는 안 움직이는 반면 S-curve 실선·확정지연·위험이슈 지연일수는 필터로 왜곡되고 **B막대 실투입(전체)과 S-curve 실선 끝점(필터분)이 불일치**하는 문제가 있었음.
- 프론트: `ProgressPage`의 빠른필터·날짜피커·관련 state/handler 제거. 쿼리키 `progress(projectId)`로 단순화.
- 백엔드: `getProjectProgressSummary({ projectId, coworkerFieldId })` — 날짜 인자 제거. 워크로그는 `getResourceProjectWorklogs({ projectId })`로 **전체 기간** 조회(→ actualTotalMd와 S-curve·확정지연 일관). 캐시키 `ProjectProgress:{projectId}`. 일정 진척은 프로젝트 시작~오늘 경과 기준 유지. 프로젝트 기간 미설정 시 `null`→프론트 noPeriod 안내.

## 10. 검증 결과

- 백엔드 jest 21 passed / 프론트 jest 21 passed / 빌드 성공.
- 경계면 교차검증 통과 9/실패 0/미검증 2(런타임 의존: coworkerFieldId Jira 반환형, settings.progressThreshold read — 둘 다 fallback 안전).

## 11. 남은 열린 항목

- `settings.progressThreshold` 시드/설정 UI 미추가 (코드 `?? 5%p` fallback). 설정 화면 노출은 후속.
- 일별 완성진척 추이·정밀 예측: 상태전이 이력/일별 처리율 데이터 필요(현재 부재).
- Q9 `issues[]` 통합 시 KVS payload 한도 — 현재 캐시 미포함으로 회피, 초대형 프로젝트에서 응답 크기 모니터링 필요.
- 위험 이슈 "처리율 정체" 기준 보강(현재 기한초과/공수편차 위주).
