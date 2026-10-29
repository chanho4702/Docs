---
name: project-progress-page
description: "진척도(Progress) 페이지 — 3층 진척 모델(공수/완성/일정), 산식·EVM 보정 확정 + 2026-05-29 구현 완료"
metadata:
  node_type: memory
  type: project
  originSessionId: 3ae3ae30-24db-4538-99b7-1aa1508880c6
---

프로젝트 진척도 페이지 신설. **2026-05-29 세션에서 재설계·재확정** (이전 2026-05-28 설계를 일부 갱신). 전체 설계서: `_workspace/01_architect_design.md` (§1 데이터조달 §2 신규엔드포인트 §3 계산가능성 §4 질문 §5 결정 §6 리뷰반영).

**⚠️ 2026-05-29 변경점 (이전 메모리 대비 우선):**
- **배치: 프로젝트 디테일 `projectDetailTabs` 최상위 탭** (사용자 명시 "리포트 분석 하위 말고 대단원에"). ← 이전엔 analysisReport 3번째 탭이었음, 폐기.
- 종합 배지 임계값 = **threshold 5%p** (settings KVS `progressThreshold`, 캐시 미포함·read-time 적용). ← 이전 ±10/20%p 폐기.
- 진행중 이슈 처리율 = **min(actualMd/plannedMd, 100%)**. done=100%캡, todo=0%. ← 이전 99% 폐기.
- 신규 endpoint = **`getProjectProgressSummary`** (`src/resolver/projectProgress/`).

**3층 분리 (합치지 말 것):** 층1 공수진척(소진율, 완성도 아님), 층2 완성진척(진짜 진척도 = Σ(진행률×planMd)/Σ planMd), 층3 일정진척(경과/전체 WorkDay).

**확정 산식·결정:**
- 계획선(PV) = **순수 선형(plannedTotalMd=BAC 도달)**, 개인 연차/반차 보정 제거(공휴일만 workday.js 영업일 반영). capacity선은 MVP 미도입. `computeLeaveDeductionMap`은 층1 계획선 미사용.
- 예측지연 = 이슈별 `calcEstimatedEndDate`(**remaining=plan−actual 기반**) max vs 종료일. 병렬 무시 → 종료 과소추정(낙관편향) UI 명시.
- plannedTotalMd/actualTotalMd = **초 Σ 후 1회 변환**(이슈별 round 합산 금지).
- 확정지연 avgDelayDays는 지연(>0)만, 조기완료(선행)는 별도 avgLeadDays/earlyCount.
- 1MM = 동적 getMonthMm. Done 판정 = Jira `statusCategory.key==='done'`. planMd null 이슈는 완성률 가중 분모 제외.
- 권한 = 진척도 탭만 `canRead('REPORT')`, 형제 분석탭 현행 유지(통일은 후속).

**한계(UI 표기 필수):** Q1로 진행중 완성률=공수소진율 → 진단규칙2(공수vs완성)가 정상구간서 침묵. "규칙2 과신금지, 주신호는 규칙1(완성vs일정)" 표기.

**데이터 공백:** 이슈 처리율 필드 코드에 없음(actualMd/plannedMd뿐), 일자별 완성률 시계열 없음 → 예측지연·완성진척 추이는 근사만.

**구현 완료(2026-05-29):** 백엔드 `src/resolver/projectProgress/`(ProgressCalculator/Service/Controller + jest 17케이스), `src/index.js` 등록. 프론트 `static/ui/src/pages/projectDetail/progress/`(ProgressPage + Header/Bars/SCurve/StatusDistribution/RiskTable), tabs.js 최상위 탭, ProjectDetailTabs.jsx에 canReadReport 주입, projectKeys.progress. i18n는 `locales/kr|en/projectDetail.json`. 검증 통과(경계면 0불일치, 양쪽 테스트 21 passed, 빌드 성공). 응답은 **루트 펼침형**(res.effort 등, content 래핑 없음), rate 0~1. 산출물 `_workspace/`.
열린: progressThreshold settings 시드 미추가(코드 ?? 5 fallback). completion.cumulative 빈배열(추이 토글 비활성).
**[2026-06-01] 완성진척 추이 토글 UI 화면에서 제거(주석처리)** — `ProgressSCurve.jsx` 헤더의 토글 버튼 2개 + 비활성 안내문(`completionDisabled`) 주석처리, InfoTip만 유지. `mode` state는 `'effort'` 고정 유지, i18n 키(`sCurve.completionToggle`/`completionDisabled`) 미삭제. **복원 조건: 이슈 상태전이 이력 데이터 확보 → 주석 해제 + 일별 완성률 산출 백엔드 추가.** 후속 todo는 `2026-05-29.md` §11에도 기록.

**기간 필터 없음(2026-05-29 정정):** 진척도는 현재 시점 전체 스냅샷이라 구간 필터 제거. `getProjectProgressSummary({projectId, coworkerFieldId})`(날짜 인자 없음), 워크로그 전체 기간 조회, 캐시키 `ProjectProgress:{projectId}`. 일정 진척만 시작~오늘 경과 기준.

**화면 가이드:** `ProgressGuide.jsx`(상단 접이식 "이 화면 읽는 법") + `InfoTip.jsx`(지표별 ⓘ, 계산/해석 2줄). i18n `progress.guide.*`/`progress.tip.*`.

**i18n 치환 버그(전역 주의):** Forge `t()`는 `t(key, defaultValue)` 시그니처라 치환 미지원. `t(key,{var})` 넘기면 `{var}`가 그대로 노출됨. → `static/ui/src/utils/i18n.js`의 `tFormat(t,key,vars)`로 수동 치환(진척도+IssueAnalysisTable 적용). 신규 번역에 치환 쓸 땐 tFormat 사용([[feedback-locales]]).

**원래 설계:** `getProjectProgressSummary` 프로젝트 단위 1회 집계 + KVS 캐시 10분. 워크로그는 [[feedback-worklog-fetch-isolation]]대로 `getResourceProjectWorklogs`(전용 병렬 페처) 재사용, 이슈 전체는 nextPageToken 루프. 차트(S-curve)/기간필터(빠른선택)/막대는 analysisReport 컴포넌트 차용([[project-rfc125]], [[project-resource-analysis-perf]]). 프론트 신규 폴더 `static/ui/src/pages/projectDetail/progress/`.

**열린 항목:** Q9 issues[] 통합 시 KVS payload 한도 검증(초과 시 분리 resolver). i18n 실제 원천은 `locales/kr|en/`, `locales/script/`는 빈 스텁 — merge 동작 확인([[feedback-locales]]).
