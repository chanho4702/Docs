# 전사 통합 대시보드 — 세션2 변경 정리 (2026-06-02 ~ 06-04)

> 대상: `static/ui/src/pages/portfolio/**`, `src/resolver/portfolioDashboard/**`, 설정/스키마/i18n
> 기준 문서: `04_redesign_tsr.md`(T/S/R IA) + `02_backend_report.md`(데이터 계약)
> 상태: **코드·테스트 완료**. `forge deploy` 미수행. ⚠️ 배포 시 **migration v007 + 재집계 1회** 필요(아래 §9).

---

## 0. 한눈에 — 작업 8건

| # | 작업 | 백엔드 | 데이터모델 변경 |
|---|------|--------|-----------------|
| 1 | T/S/R 재설계 529 크래시 복구·재검증 | - | - |
| 2 | 신호등 자원축 가동률 band 응답 연결 | ✅ | `utilizationBands` 응답 추가 |
| 3 | 심한 과부하(red) band 설정 항목화 | ✅ | `settings.utilizationRedBand` |
| 4 | 공수 추이 월⇄주 토글 | ✅ | `weekly_effort_json` 컬럼(CREATE TABLE 포함, 신규 설치) |
| 5 | Scope 계획 대비 실적 공수 위젯 | - | (기존 필드 재활용) |
| 6 | Time 프로젝트 일정 간트 | - | (기존 필드 재활용) |
| 7 | 문제 이슈 TOP50 버블 Time→Scope 이동 | - | - |
| 8 | 가동률 종합/프로젝트별 분리 | ✅ | `members[].utilization`, `utilization.people` |

---

## 1. T/S/R 재설계 529 크래시 복구

직전 세션에서 frontend-engineer 에이전트가 T/S/R(Time/Scope/Resource) 재설계를 완료했으나 **오케스트레이터가 API 529로 중단**된 상태였음. 에이전트 산출물은 디스크에 남아 있으므로 **디스크 상태 ↔ 리포트 재검증**(파일 존재·잔존참조 grep·jest·build)으로 완료 확인. 작업 손실 0.

- 서브탭: 개요/인력비용/공수작업 → **Time / Scope / Resource** 전면 교체
- 종합 개요 T/S/R 신호등 행(`PortfolioTsrSignalTable`), Scope 이슈상태분포, 완성vs일정 막대 신규
- 삭제: `OverviewTab` / `PeopleCostTab` / `EffortWorkTab` / `RiskSection`

---

## 2. 신호등 자원축 가동률 band 응답 연결

T/S/R 신호등의 자원(R) 색이 프론트 하드코딩 상수(0.7/1.1/1.3)였음 → **단일 진실을 백엔드 응답으로 이동**.

- `getPortfolioDashboard` 응답 루트에 **`utilizationBands { utilUnder, utilOver, utilRed }`** 추가
  - under/over = 설정값(`utilizationUnderBand/OverBand`), red = 백엔드 상수(`DEFAULT_RED_BAND` 1.3, 후에 §3에서 설정화)
- 프론트: `bands={data?.utilizationBands ?? UTIL_BANDS}` (응답 우선, 상수는 폴백)
- 변경: `PortfolioDashboardService.js`, `PortfolioDashboardPage.jsx`

---

## 3. 심한 과부하(red) band 설정 항목화 + 설명

red 경계도 관리자가 조정 가능하게 설정 UI에 노출.

- `SeedData.js` — `utilizationRedBand: 1.3` 시드(기존 설치는 `{...settings,...exists}` 스프레드로 백필)
- `SettingService.js` — `updateSettingService`에 `utilizationRedBand` 파라미터
- `EtcSetting.jsx` — 가동률 기준에 **과소/과부하/심한과부하 3필드**, 설명 문구(`usage`) 추가
  - "이 기준은 가동률 분포 차트 + 종합 개요 신호등에 함께 쓰임. 가동률 1.0 = 100%"
- i18n: `setting.utilization.{usage, redBand, redHint}`

---

## 4. 공수 추이 월⇄주 토글 ★데이터모델 변경

**문제**: 공수가 월(YYYY-MM)로 이미 뭉쳐 저장돼 프론트에서 주간으로 못 쪼갬. → 배치가 주간도 집계해 저장하도록 변경.

- **DB 스키마**: `portfolio_project_snapshot.weekly_effort_json` JSON 컬럼을 `CREATE TABLE`에 포함 (**신규 설치 기준** — 별도 ALTER/마이그레이션 불필요)
- **aggregator**: `weekStartOf(date)`(그 주 월요일 YYYY-MM-DD) 헬퍼 → `weekSecMap` 집계 → `weeklyEffort[]{week,md}`
- **Query / Repository / Service**: `weekly_effort_json` ↔ `projects[].weeklyEffort` 연결
- **프론트**: `effortTrendByProject(sel, mode, unit)` — `unit` 'month'|'week', 위젯에 월간/주간 토글
- 변경: `PortfolioAggregator.js`, `portfolioSnapshot.sql.js`, `ddl/index.js`, `migrate.js`, `PortfolioSnapshotQuery.js`, `PortfolioSnapshotRepository.js`, `PortfolioDashboardService.js`, `PortfolioEffortTrend.jsx`, `portfolioAggregate.js`

---

## 5. Scope — 계획 대비 실적 공수 위젯 (백엔드 0건)

기존 응답 필드 재활용 → `PortfolioPlannedActual.jsx` 신규.

- `plannedTotalMd`(계획) vs `actualTotalMd`(실적) 그룹막대, 투입률 = 실적/계획
- 차트⇄표 토글, Scope 탭에 추가

---

## 6. Time — 프로젝트 일정 간트 (백엔드 0건)

ECharts **`custom` series 간트** → `PortfolioScheduleGantt.jsx` 신규. Time 탭 최상단 전체폭.

- 막대 = `startDate`~`endDate`, **채움 = 캘린더 경과**(오늘 `api.coord` 픽셀 → '오늘' 점선과 정확히 일치)
- 경과율 % 라벨, 빨간 '오늘' markLine, 프로젝트수×38px 동적 높이, 차트⇄표 토글
- ※ 처음엔 scheduleRate(워크데이) 채움이었으나 사용자 요청으로 캘린더 기준으로 변경

---

## 7. 문제 이슈 TOP50 버블 Time → Scope 이동

범위 잔여·미완 관점이라 Scope가 적합.

- `ComparisonTabs` — `problemIssues`를 TimeTab 대신 ScopeTab으로 전달
- `PortfolioProblemBubble` 필터 무관(전 프로젝트 글로벌) 동작 그대로

---

## 8. 가동률 종합 / 프로젝트별 분리 ★데이터모델 변경

**문제**: 가동률 분포 도넛이 인원수만 보여 "누가/어느 프로젝트에서 과부하"인지 모름.

**핵심**: 가동률에 의미가 다른 두 종류가 있음.
- **종합(글로벌)**: 인원의 [전 프로젝트 기간 **합집합**] 분모 → "전사적으로 과부하인가" (한 사람=1값, 필터 무관)
- **프로젝트별**: 프로젝트 내 분모 → "이 프로젝트에서 누가" (이중계상 무관)

구현:
1. **`members[].utilization`** — aggregator가 이미 계산하던 `projUtil`(평균만 쓰고 버리던 값)을 `utilByAccount`로 멤버에 주입
2. **`computeGlobalUtilization` 반환형** `숫자[]` → **`[{accountId, util}]`** (인원 식별 복원), rollup meta `utilizationPeople` 추가
3. **서비스** — 전 프로젝트 members 사전으로 displayName 매핑 → `utilization.people[]{accountId,displayName,util}`(util desc)
4. **프론트** `PortfolioUtilization` — 종합⇄프로젝트별 토글
   - 종합 = 분포 도넛 + **과부하 인원 TOP 명단**
   - 프로젝트별 = `memberUtilization` 멤버 가동률 막대(band 색상 + 과부하 기준선)
   - bands 전달: Page → ComparisonTabs → ResourceTab → 위젯

---

## 9. ⚠️ 배포 체크리스트 (신규 설치 기준)

1. **`forge deploy`** — manifest `settings.utilizationRedBand`(float) 스키마 + 백엔드 코드 반영
   - ※ `forge tunnel`은 함수 코드만 로컬 실행. **manifest storage 스키마 변경은 반드시 deploy** 해야 KVS에 반영됨(미반영 시 redBand 저장 422 `UNPROCESSABLE_ENTITY`)
2. **신규 설치(install)** — `CREATE TABLE`에 `weekly_effort_json` 포함되어 컬럼 생성. 별도 migration 단계 없음
3. **포트폴리오 재집계 1회** (스케줄 배치 또는 수동 트리거 버튼)
   - 다음 값들이 **모두 배치 산출**이라 재집계 전엔 빈 값:
     - 주간 공수(`weeklyEffort`)
     - 프로젝트별 멤버 가동률(`members[].utilization`)
     - 종합 과부하 명단(`utilizationPeople`)
4. settings band(`utilizationUnderBand/OverBand/RedBand`)는 onInstall 시드로 채워짐(재집계 불요)

---

## 10. 검증 결과 (최종)

| 항목 | 결과 |
|------|------|
| 백엔드 jest (`portfolioDashboard`) | 25/25 통과 (weekStartOf 5, computeGlobalUtilization 반환형 변경 반영) |
| 프론트 jest (`pages/portfolio`) | 27/27 통과 (주간 2, memberUtilization 2 신규) + 골든 스냅샷 |
| 프론트 build | 성공 (prebuild merge 자동 실행) |
| i18n merge | gantt·plannedActual·utilization·effortTrend·setting 신규 키 ko-KR/en-US 반영 |

---

## 11. 최종 탭 구성

- **종합 개요(서브탭 밖)**: 프로젝트별 T/S/R 신호등
- **Time(일정)**: 프로젝트 일정 간트 · 공수 추이(월/주) · 리스크 TOP
- **Scope(범위)**: 이슈 상태 분포 · 완성률 vs 일정률 · 계획 대비 실적 공수 · 문제 이슈 TOP50
- **Resource(자원)**: 롤/레벨 · 총인건비 · 급여 히스토그램 · **가동률(종합/프로젝트별)** · 작업 분포
