# 2026-06-02 — 전사 통합 대시보드(Portfolio) 설계 검증 + 풀스택 구현

> 설계서 단일 진실: `_workspace/portfolio-dashboard/01_architect_design.md` (v3, 누적 11건 코드정합 교정).
> feature-harness 파이프라인으로 설계 검증 → 백엔드 → 프론트 → 통합검증 완수. **코드/테스트 완료, forge deploy·E2E 미수행.**

## 1. 개요

PMO/경영진이 **선택한 프로젝트들을 가로질러 비교**(인력·공수·진척·인건비·리스크)하는 신규 최상위 화면 `/dashboard`.
정체성 = "전사 합산"이 아니라 **"프로젝트별 비교"**. 상단 멀티셀렉트로 비교 대상 선택 → 모든 위젯 반응(가동률·문제이슈만 필터 예외).

- 데이터 전략: Scheduled Trigger 배치(매일)가 **프로젝트별 raw 스냅샷**(`members_json`/`monthly_effort_json`) 적재 → 대시보드는 단일 invoke로 전 프로젝트 받아 **프론트가 메모리에서 필터·재집계**. 온디맨드 across 집계 금지(256MB/타임아웃).
- 권한: `canRead('REPORT')` 게이트(사이드바 숨김 + 페이지 가드 이중방어).

## 2. 설계서 코드 정합성 검증 — 누적 11건 교정

설계서가 인용한 재사용 함수들을 실제 코드와 대조. 골격·재사용 매핑은 적합했으나 함수 반환형/가시성에서 어긋남 발견.

### 1차: 재사용 함수 반환형/가시성 4건
1. **`getActiveProjectsService()` 반환 `{rows}` 래핑** — 설계는 배열 가정(`.map` 직접). 언래핑 필수 + `SELECT *` snake_case→camel 매핑. (활성 정의 `end_date >= CURDATE()`)
2. **`getBulkJiraUsersApi` 반환형 비일관** — 정상 `[{values:[…]}]`(배열), 빈입력 `{values:[]}`(객체) → `flattenBulkUsers`로 배열가드 + `.values` 평탄화 + accountId 폴백.
3. **`computeLeaveDeductionMap` 미export(내부 const)** → `export const` 승격 재사용. (당초 "로컬 복제" 권고했다가 2차에서 정정 — 아래)
4. **`portfolioRollup` = kvs 직접 키**(CustomEntityManager 아님, manifest storage entity 불필요).
   - + monthMdMap MD 환산식, migrate.js 체인 v005 뒤 주석 종료 주의.

### 가동률 분모 이중계상 → 글로벌 지표로 재정의 (A안)
- **문제**: v3는 가동률을 프론트 선택분 `Σ실투입/Σ가용`로 재집계. 매트릭스 조직(동일 인원·기간중첩 다중 프로젝트)에서 **분모 가용MD 이중계상 → 가동률 최대 절반 과소**. per-project `effectiveMmDays` 스칼라 합산으론 **기간 합집합 분모 복원 원천 불가**(프론트 재집계로 정확화 불가능).
- v1도 동일 Σ/Σ 결함 보유 → "v1 일관"은 결함 상속이었음.
- **A안 확정**: 가동률을 **필터 무관 글로벌 지표**로 재정의(문제이슈 버블과 동일 예외). 배치가 `computeGlobalUtilization`으로 accountId별 [참여 프로젝트 기간 **합집합**] 가용MD를 1회 계산(`mergeIntervals`) → `utilizationValues[]`(KVS rollup). 조회 service가 settings band로 read-time 버킷팅(v1 패턴 부활). 프론트 `recomputeUtilization`·`members[].effectiveMmDays/utilization` 삭제(payload 절감).

### 2차 리뷰 6건
1. **leaveDeduction 복제 → export 승격으로 정정** — 순수 계산함수라 "공통경로 격리" 원칙 비적용. 복제 시 ResourceAnalysis 화면↔대시보드 가동률 드리프트 → export 승격이 정답(호출부 무변경). *(1차의 복제 권고를 뒤집음)*
2. **PARTIAL 노후 데이터 표시** — 실패 프로젝트는 직전 행 유지(노후)인데 비교 화면에서 신/구 혼재 함정. 행별 `aggregatedAt` + read-time `isStale` → 현황 테이블 "어제 값" 배지.
3. **`aggregating` 락 stuck** — 배치 사망 시 수동 재집계 영구 차단. `aggregatingStartedAt` 타임스탬프 + STALE_LOCK_MS 자동복구 + `finally` clear.
4. **Forge 응답/메모리 한도** — 구현 시점 현재 공식 한도 재확인 주의(추정치 의존 금지).
5. **프론트 재집계 검증 공백** — 집계가 프론트로 이동해 backend 대조군 없음 → 골든 픽스처 1세트로 "조용한 회귀" 차단.
6. **end_date 필수값 확정** — 무기한(NULL) 프로젝트 부재(필수 입력값) → 활성 정의가 누락시키지 않음. 폴백은 방어용.

## 3. feature-harness 풀스택 구현 결과

| Phase | 담당 | 결과 |
|-------|------|------|
| 설계 | (기존, 검증 완료) | `01_architect_design.md` |
| 백엔드 | backend-engineer | jest **41/41** · 응답 shape 계약 100% 일치 |
| 프론트 | frontend-engineer | jest **36/36**(+골든픽스처) · build 성공 · i18n merge 완료 |
| 통합검증 | integration-verifier | 실패 **0** · 차단 없음 · 미검증 5(런타임 전용) |

### 백엔드 (`src/resolver/portfolioDashboard/`)
- DDL `portfolioSnapshot.sql.js`(snapshot **1테이블**, members_json/monthly_effort_json) + `ddl/index.js` + `migrate.js` v006.
- `PortfolioSnapshotQuery.js`(UPSERT/SELECT_ALL/MEMBER_ROWS) · `PortfolioSnapshotRepository.js`(kvs 직접 rollup).
- `PortfolioAggregator.js` — aggregateOne/All + 순수함수(riskScore/severity/flattenBulkUsers/computeProblemIssues/**mergeIntervals/computeGlobalUtilization**/mapProjectRow).
- `PortfolioDashboardService.js`(getPortfolioDashboardService + read-time diagnosis/roleMeta/levelMeta/salaryBuckets/utilization 버킷팅; triggerAggregationService fire-and-forget) · `Controller` · `trigger/portfolioSnapshot.js` · `api/jira/field/FieldApi.js`(coworkerFieldId).
- 수정: `ResourceAnalysisService`(computeLeaveDeductionMap export 승격) · `SettingService`/`SeedData`(utilizationUnderBand 0.7/OverBand 1.1) · `index.js`(등록 + named export) · `manifest.yml`(function 600s + scheduledTrigger day).

### 프론트 (`static/ui/src/pages/portfolio/`)
- `PortfolioDashboardPage`(REPORT 게이트 + 단일 useQuery staleTime 5분 + 필터/서브탭) · `PortfolioHeader` · `PortfolioFilterBar`(@atlaskit/select 멀티셀렉트 기본전체 + 요약라인) · `hooks/usePortfolioFilter`(useState Set).
- `utils/portfolioAggregate.js` — 재집계 순수함수 **8종**(filter/summarize/roleLevelDist/salaryByProject/salaryHistogram/effortTrend/workDist/riskTop) + 골든 픽스처. *(recomputeUtilization 없음 — 가동률 글로벌)*
- `sections/ComparisonTabs`(개요/인력·비용/공수·작업) + `RiskSection` + `tabs/` + **위젯 10종**(현황테이블 드릴다운+isStale배지 / 롤레벨토글 / 총인건비 / 급여히스토 / 가동률도넛 / 공수추이 월별⇄누적 / 작업분포 집계⇄산점 / 리스크TOP / 문제이슈버블).
- 차트옵션: `stackChartOption` normalize 추가(하위호환) + `scatterChartOption.js` 신규(버블·작업분포 공용).
- `App.jsx` 라우트 `/dashboard` · `Sidebar.jsx` mainItems(REPORT) · 백오피스 SettingPage(`EtcSetting.jsx`) 가동률 band UI · `locales/kr·en/portfolio.json` + merge.

### 경계면 정합 (검증자 확인)
- 루트 펼침 소비(`res.projects`/`res.utilization`, content 래핑 없음, `data?.success` 분기).
- 필터 무관 위젯(utilization/problemIssues) — selectedProjects 미전달·원본 직접·배지. members[]로 가동률 재집계 안 함(필드 부재).
- members[] 6필드(accountId/displayName/roleKey/levelKey/salary/effortMd) camelCase까지 일치.

## 4. 배포 전 확인 필요 (미검증 5건 — 실데이터 필요)

1. **`actualMm = actualTotalMd / 20`** — 백엔드 공식 미명시로 통상치(월 20영업일) placeholder. 정밀 필요 시 `settings.monthRate` 연동. *(프론트는 값 그대로 합산, 재계산 안 함)*
2. 실제 Jira 워크로그 집계 수치 정확도.
3. `members_json` 실 payload 크기(§4.2.1 추정 검증).
4. migrate 실적용 + JSON 컬럼 드라이버 반환형(문자열 vs 객체).
5. stale-lock·매트릭스 가동률 합집합 분모 end-to-end.

→ 다음: `forge deploy` 후 실데이터로 위 확인(코드 정합·산식은 jest 검증됨).

## 5. 구현 후 보정 (2026-06-02 추가)

- **문제이슈 SQL 테이블 제거**: `portfolio_problem_issue`는 필터 무관 글로벌·고정 TOP50이고 배치가 이미 JS sort+slice를 마치며 조회 service가 KVS rollup을 매번 읽으므로 SQL 테이블 이점 0(v2 잔재) → **KVS `portfolioRollup.problemIssues`로 이관**(utilizationValues와 동일 부류). DDL/migration v007/쿼리 3개/repo 메서드 2개 제거. summary 255 캡. 응답 shape·프론트 변화 없음. (테스트 41/41 유지)
- **★ 마이그레이션 실행 공백 수정**: 스키마 생성 경로가 `init-db` scheduledTrigger(interval: hour) 하나뿐이라 `forge deploy` 직후엔 테이블이 없음(≤1h 지연, scheduledTrigger는 배포 즉시 발화 안 함). `onInstall`은 seed만 돌고 migration 안 했음. → **`onInstall`에 `runMigration()` 선행 호출**(멱등) + manifest trigger에 **`avi:forge:upgraded:app`** 구독. + `SEED_VERSION` 3→4, `addSettingSeed`가 기존 설정 보존하며 가동률 band 누락 키만 병합(`{...defaults, ...exists}`, findById는 raw 객체 반환). 검증: `forge logs`에서 `Applied migrations: v006...` 확인. 즉시 적용은 `forge install --upgrade`로 lifecycle 이벤트 발화.

## 5-1. UI 보완 (2026-06-02, 사용자 요청 5건)

frontend-engineer 부분 재실행. 순수 프론트 변경(백엔드 shape 무관), 빌드 + 36 테스트 통과.
1. **위젯별 InfoTip(ⓘ)** — 진척도 `InfoTip` 재사용, `WidgetCard`에 `info={{calc,interp}}` prop. 9위젯 `portfolio.<widget>.info.calc/interp` 키.
2. **임의 아이콘 제거 → 공식 Atlaskit** — 헤더 기준시각 `📅` → `@atlaskit/icon/core/clock`, 토글 `chart-bar`/`table`.
3. **"필터 반영/필터 무관" 배지 제거** — `WidgetCard` Badge·`badge` prop·i18n `badge.*` 삭제(동작은 유지, UI만). ※`ProjectTable`의 stale "어제 값"/상태 배지는 별개라 유지.
4. **차트⇄표 토글** — 공용 `ChartTableToggle.jsx` 신설, 위젯이 `tableHead`/`tableRows`(DynamicTable) 제공. 현황테이블은 이미 표라 생략. 라벨 `portfolio.common.viewChart/viewTable`.
5. **롤/레벨 분포 인원수** — `roleLevelDistribution` 비율→실제 카운트(`.length`) 반환, `stackChartOption({normalize:false})` y축=명. 골든 픽스처 카운트 기준 갱신.

## 6. 기타

- **git 정리**: 문서·노트·하네스 설정을 커밋에서 제외(코드만 업로드). `.gitignore`에 `/_workspace/`·`/CLAUDE.md`·`/.claude/`·`/2026-*.md`·`CALCULATION.md` 추가.
- 산출물: `_workspace/portfolio-dashboard/` (01_architect_design.md · 02_backend_report.md · 02_frontend_report.md · 03_verify_report.md). 레이아웃 단일진실 `mockup_v2.html`.
- 관련: [[projects/agent-documents/sources/codex-experiences/archives/moves-workforce/2026-10-28/codex-experiences--2026-05-29|2026-05-29]] 진척도 페이지(진척 3층 산식 재사용 원천).
