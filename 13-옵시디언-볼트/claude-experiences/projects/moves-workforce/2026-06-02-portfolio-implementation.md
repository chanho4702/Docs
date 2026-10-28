---
type: worklog
project: "[[moves-workforce]]"
tags: [forge, portfolio-dashboard, implementation, feature-harness, utilization, migration-lifecycle]
date: 2026-06-02
status: code-complete-deploy-pending
---

# 2026-06-02 — 전사 통합 대시보드(Portfolio) 설계 검증 + 풀스택 구현

상위: [[moves-workforce]] · 선행 설계: [[2026-06-01-portfolio-dashboard]] · 관련: [[2026-05-29-progress-page]] · [[forge-worklog-performance]] · [[forge-i18n]] · [[forge-migration-lifecycle]] · [[harness-engineering]]

> 설계서 단일 진실: `_workspace/portfolio-dashboard/01_architect_design.md` (v3, 누적 11건 코드정합 교정).
> `feature-harness` 파이프라인으로 **설계 검증 → 백엔드 → 프론트 → 통합검증** 완수. **코드/테스트 완료, `forge deploy`·E2E 미수행.**

## 1. 무엇을 했나

[[2026-06-01-portfolio-dashboard]]에서 설계만 끝났던 전사 대시보드(`/dashboard`)를 실제 풀스택 구현까지 완료. 단, 구현 착수 전에 **설계서가 인용한 재사용 함수들을 실제 코드와 대조**하는 검증을 먼저 돌려, 설계 가정과 코드 현실의 어긋남 11건을 교정한 뒤 구현에 들어갔다(설계→구현 사이 "코드 정합성 게이트").

## 2. 설계서 코드 정합성 검증 — 누적 11건 교정

### 1차: 재사용 함수 반환형/가시성 4건
1. **`getActiveProjectsService()`가 `{rows}` 래핑 반환** — 설계는 배열 가정(`.map` 직접). 언래핑 + `SELECT *` snake_case→camel 매핑 필요. (활성 정의 `end_date >= CURDATE()`)
2. **`getBulkJiraUsersApi` 반환형 비일관** — 정상은 `[{values:[…]}]`(배열), 빈 입력은 `{values:[]}`(객체) → `flattenBulkUsers`로 배열 가드 + `.values` 평탄화 + accountId 폴백.
3. **`computeLeaveDeductionMap`이 미export(내부 const)** → `export const`로 승격해 재사용.
4. **`portfolioRollup`은 KVS 직접 키**(CustomEntityManager 아님 → manifest storage entity 불필요).

### ★ 가동률 분모 이중계상 → 글로벌 지표로 재정의 (A안) — 이번 작업의 핵심 설계 정정
- **문제**: v3 설계는 가동률을 프론트가 선택분으로 `Σ실투입 / Σ가용`로 재집계. 하지만 **매트릭스 조직**(동일 인원이 기간 중첩된 다중 프로젝트 참여)에서 분모 가용MD가 **이중계상** → 가동률이 최대 절반까지 과소. per-project `effectiveMmDays` 스칼라를 프론트가 더하는 방식으론 **기간 합집합 분모를 원천적으로 복원 불가**(프론트 재집계로는 절대 정확화 안 됨).
- v1도 동일한 Σ/Σ 결함을 갖고 있었음 → 설계서의 "v1과 일관" 근거가 사실은 **결함 상속**이었다.
- **A안 확정**: 가동률을 **필터 무관 글로벌 지표**로 재정의(문제이슈 버블과 동일 예외 취급). 배치가 `computeGlobalUtilization`으로 accountId별 [참여 프로젝트 기간 **합집합**] 가용MD를 1회 계산(`mergeIntervals`로 구간 병합) → `utilizationValues[]`를 KVS rollup에 적재. 조회 service가 settings band로 **read-time 버킷팅**(v1 패턴 부활). 프론트의 `recomputeUtilization`·`members[].effectiveMmDays/utilization`은 삭제(payload 절감).
- **교훈**: "프론트 재집계"가 만능이 아니다. **기간 합집합처럼 스칼라 합으로 복원 불가능한 집계는 반드시 배치(원본 접근 시점)에서 계산**해야 한다. → [[forge-worklog-performance]]

### 2차 리뷰 6건
1. **leaveDeduction 복제 → export 승격으로 정정** — 1차에서 "로컬 복제" 권고했으나, 순수 계산함수라 "공통경로 격리" 원칙 비적용 대상. 복제하면 ResourceAnalysis 화면↔대시보드 가동률이 **드리프트**. export 승격이 정답(호출부 무변경). *(1차 권고를 뒤집음)*
2. **PARTIAL 노후 데이터 표시** — 배치 실패 프로젝트는 직전 스냅샷 유지(노후)인데, 비교 화면에서 신/구 값이 혼재하는 함정. 행별 `aggregatedAt` + read-time `isStale` → 현황 테이블에 "어제 값" 배지.
3. **`aggregating` 락 stuck** — 배치 사망 시 수동 재집계가 영구 차단됨. `aggregatingStartedAt` 타임스탬프 + `STALE_LOCK_MS` 자동복구 + `finally` clear.
4. **Forge 응답/메모리 한도** — 구현 시점에 공식 한도를 재확인(추정치 의존 금지).
5. **프론트 재집계 검증 공백** — 집계가 프론트로 이동해 backend 대조군이 없음 → **골든 픽스처 1세트**로 "조용한 회귀" 차단.
6. **end_date 필수값 확정** — 무기한(NULL) 프로젝트 부재(필수 입력) → 활성 정의가 누락시키지 않음. 폴백은 방어용.

## 3. feature-harness 풀스택 구현 결과

| Phase | 담당 | 결과 |
|-------|------|------|
| 설계 | (기존, 검증 완료) | `01_architect_design.md` v3 |
| 백엔드 | backend-engineer | jest **41/41** · 응답 shape 계약 100% 일치 |
| 프론트 | frontend-engineer | jest **36/36**(+골든픽스처) · build 성공 · i18n merge 완료 |
| 통합검증 | integration-verifier | 실패 **0** · 차단 없음 · 미검증 5(런타임 전용) |

### 백엔드 (`src/resolver/portfolioDashboard/`)
- DDL `portfolioSnapshot.sql.js`(snapshot **1테이블**, `members_json`/`monthly_effort_json`) + `ddl/index.js` + `migrate.js` v006.
- `PortfolioSnapshotQuery.js`(UPSERT/SELECT_ALL/MEMBER_ROWS) · `PortfolioSnapshotRepository.js`(KVS 직접 rollup).
- `PortfolioAggregator.js` — aggregateOne/All + 순수함수(riskScore/severity/flattenBulkUsers/computeProblemIssues/**mergeIntervals/computeGlobalUtilization**/mapProjectRow).
- `PortfolioDashboardService.js`(read-time diagnosis/roleMeta/levelMeta/salaryBuckets/utilization 버킷팅; triggerAggregationService fire-and-forget) · `Controller` · `trigger/portfolioSnapshot.js` · `api/jira/field/FieldApi.js`(coworkerFieldId).
- 수정: `ResourceAnalysisService`(computeLeaveDeductionMap export) · `SettingService`/`SeedData`(utilizationUnderBand 0.7/OverBand 1.1) · `index.js`(등록 + named export) · `manifest.yml`(function 600s + scheduledTrigger day).

### 프론트 (`static/ui/src/pages/portfolio/`)
- `PortfolioDashboardPage`(REPORT 게이트 + 단일 useQuery staleTime 5분 + 필터/서브탭) · `PortfolioHeader` · `PortfolioFilterBar`(@atlaskit/select 멀티셀렉트 기본전체) · `hooks/usePortfolioFilter`(useState Set).
- `utils/portfolioAggregate.js` — 재집계 순수함수 **8종**(filter/summarize/roleLevelDist/salaryByProject/salaryHistogram/effortTrend/workDist/riskTop) + 골든 픽스처. *(recomputeUtilization 없음 — 가동률 글로벌)*
- `sections/ComparisonTabs`(개요/인력·비용/공수·작업) + `RiskSection` + **위젯 10종**(현황테이블 드릴다운+isStale배지 / 롤레벨토글 / 총인건비 / 급여히스토 / 가동률도넛 / 공수추이 월별⇄누적 / 작업분포 집계⇄산점 / 리스크TOP / 문제이슈버블).
- 차트옵션: `stackChartOption` normalize 추가(하위호환) + `scatterChartOption.js` 신규(버블·작업분포 공용).
- `App.jsx` 라우트 `/dashboard` · `Sidebar.jsx` mainItems(REPORT) · 백오피스 `EtcSetting.jsx` 가동률 band UI · `locales/kr·en/portfolio.json` + merge.

### 경계면 정합 (검증자 확인)
- 루트 펼침 소비(`res.projects`/`res.utilization`, content 래핑 없음, `data?.success` 분기).
- 필터 무관 위젯(utilization/problemIssues) — selectedProjects 미전달·원본 직접·배지.
- members[] 6필드(accountId/displayName/roleKey/levelKey/salary/effortMd) camelCase까지 일치.

## 4. 구현 후 보정 (같은 날 추가)

- **문제이슈 SQL 테이블 제거**: `portfolio_problem_issue`는 필터 무관 글로벌·고정 TOP50이고, 배치가 이미 JS sort+slice를 마치며 조회 service가 KVS rollup을 매번 읽으므로 SQL 테이블 이점 0(v2 잔재) → **KVS `portfolioRollup.problemIssues`로 이관**(utilizationValues와 동일 부류). DDL/migration v007/쿼리 3개/repo 메서드 2개 제거. summary 255 캡. 응답 shape·프론트 변화 없음(41/41 유지). *(설계 진화: v2의 "가변 배열은 SQL" 원칙이 '글로벌 고정 크기'에는 불필요했음)*
- **★ 마이그레이션 실행 공백 수정** — 자세한 패턴은 [[forge-migration-lifecycle]]:
  - 스키마 생성 경로가 `init-db` scheduledTrigger(interval: hour) **하나뿐**이라 `forge deploy` 직후엔 테이블이 없음(≤1h 지연, scheduledTrigger는 배포 즉시 발화하지 않음). `onInstall`은 seed만 돌고 migration은 안 했었음.
  - → **`onInstall`에 `runMigration()` 선행 호출**(멱등) + manifest trigger에 **`avi:forge:upgraded:app`** 구독 추가.
  - + `SEED_VERSION` 3→4, `addSettingSeed`가 기존 설정 보존하며 가동률 band 누락 키만 병합(`{...defaults, ...exists}`, findById는 raw 객체 반환).
  - 검증: `forge logs`에서 `Applied migrations: v006...` 확인. 즉시 적용은 `forge install --upgrade`로 lifecycle 이벤트 발화.

## 5. 배포 전 확인 필요 (미검증 5건 — 실데이터 필요)

1. **`actualMm = actualTotalMd / 20`** — 백엔드 공식 미명시라 통상치(월 20영업일) placeholder. 정밀 필요 시 `settings.monthRate` 연동. *(프론트는 값 그대로 합산, 재계산 안 함)*
2. 실제 Jira 워크로그 집계 수치 정확도.
3. `members_json` 실 payload 크기(설계 추정 검증).
4. migrate 실적용 + JSON 컬럼 드라이버 반환형(문자열 vs 객체).
5. stale-lock·매트릭스 가동률 합집합 분모 end-to-end.

→ 다음: `forge deploy`(또는 `forge install --upgrade`) 후 실데이터로 위 확인. 코드 정합·산식은 jest로 검증됨.

## 6. 메모 / 교훈
- **설계→구현 사이 "코드 정합성 게이트"의 가치**: 설계서가 인용한 재사용 함수의 반환형/가시성을 실제 코드와 대조하는 단계가 11건의 어긋남을 사전 차단. 특히 가동률 이중계상은 코드 대조 없이는 런타임에서야 드러났을 결함. → [[harness-engineering]]
- **1차 권고를 2차에서 뒤집은 사례 2건**(leaveDeduction 복제→export, 문제이슈 SQL→KVS) — 리뷰 라운드를 거치며 원칙 적용 대상을 재판단. "공통경로 격리"는 부작용 있는 코드에 적용하고, 순수 계산함수엔 export 공유가 맞다.
- git: 문서·노트·하네스 설정은 커밋 제외(코드만). `.gitignore`에 `/_workspace/`·`/CLAUDE.md`·`/.claude/`·`/2026-*.md`·`CALCULATION.md` 추가.
