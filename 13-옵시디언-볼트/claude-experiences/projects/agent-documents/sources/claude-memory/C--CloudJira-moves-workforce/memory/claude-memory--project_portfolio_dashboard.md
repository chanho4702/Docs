---
name: project-portfolio-dashboard
description: 전사 통합 대시보드(포트폴리오) 풀스택 구현 완료 상태·핵심 결정·배포 전 확인 항목
metadata: 
  node_type: memory
  type: project
  originSessionId: ffd096b6-066e-4183-b028-f8ee0cdb18c6
---

전사 통합 대시보드(`/dashboard`, 슬러그 `portfolio-dashboard`) — PMO/경영진이 프로젝트들을 가로질러 비교(인력·공수·진척·인건비·리스크)하는 최상위 화면. feature-harness 파이프라인으로 2026-06-02 풀스택 구현 완료.

**상태**: 코드 구현·검증 완료. **아직 forge deploy/E2E 미수행**. 설계 단일 진실은 `_workspace/portfolio-dashboard/01_architect_design.md`(백엔드 계약, 누적 11건 코드정합 교정 반영), 리포트는 같은 폴더 02/03.

**T/S/R 재설계(2026-06-02 완료)**: 서브탭을 데이터묶음(개요/인력비용/공수작업)→철의 삼각형 **Time/Scope/Resource**로 전면 교체. 단일 진실 `_workspace/portfolio-dashboard/04_redesign_tsr.md`. **백엔드 zero-touch**(응답 shape 무변경). 신규: 종합개요 T/S/R 신호등 행(`PortfolioTsrSignalTable`+`tsrSignals` 유틸, 서브탭 밖 최상위), Scope 이슈상태분포(`PortfolioIssueStatusDist`+`issueStatusDistribution` 유틸), Scope 완성vs일정 막대(`PortfolioScopeProgress`). 신호등 임계: time=diagnosisStatus 매핑 재사용, scope=todoRatio(<0.3 green/0.3~0.6 amber/≥0.6 red), resource=avgUtilization band(2026-06-02 백엔드 응답 `utilizationBands{utilUnder,utilOver,utilRed}` 추가로 연결 완료 — under/over=설정값(`utilizationUnderBand/OverBand`), red=`settings.utilizationRedBand`(2026-06-02 설정 UI에도 노출 — EtcSetting 가동률 기준에 under/over/red 3필드, SeedData 1.3 백필, SettingService 파라미터 추가). 폴백 `DEFAULT_RED_BAND` 1.3. 프론트 `data.utilizationBands ?? UTIL_BANDS` 폴백). 삭제: OverviewTab/PeopleCostTab/EffortWorkTab/RiskSection. 재검증: 포트폴리오 jest 23/23(전체 44), build 성공, 잔존참조 0. **재설계는 frontend-engineer 에이전트가 완료했으나 오케스트레이터가 529로 중단 → 다음 세션에서 디스크 상태 재검증으로 완료 확인함.**

**핵심 설계 결정(비자명)**:
- 데이터 전략: Scheduled Trigger 배치(매일)가 프로젝트별 raw 스냅샷(`members_json`/`monthly_effort_json`) 적재 → 대시보드는 단일 invoke로 전 프로젝트 받아 **프론트가 필터·재집계**. 온디맨드 across 집계 금지(256MB/타임아웃).
- **가동률만 필터 무관 글로벌 지표**: 분모 이중계상(매트릭스 조직, 기간중첩) 때문에 프론트 선택분 재집계 불가 → 배치가 인원별 [참여 기간 합집합] 가용MD 1회 계산(`computeGlobalUtilization`+`mergeIntervals`). 문제이슈 버블도 필터 무관. 나머지 위젯은 필터 반응. [[progress_page]]와 같은 진척 산식 재사용.
- `computeLeaveDeductionMap`은 `ResourceAnalysisService`에서 export 승격해 공유(복제 금지 — 드리프트 방지). 워크로그 페처는 [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--feedback_worklog_fetch_isolation|feedback_worklog_fetch_isolation]] 따라 공통경로 미수정.
- responseWrapper 루트 펼침 → 프론트 `res.projects` 직접 소비(content 래핑 없음).

**위젯 추가/재편(2026-06-02 세션2)**: ① 공수 추이 월⇄주 토글(`effortTrendByProject(sel,mode,unit)` unit 'month'|'week'). ② Scope `PortfolioPlannedActual`(plannedTotalMd vs actualTotalMd 그룹막대, 투입률=실/계획). ③ Time 최상단 `PortfolioScheduleGantt`(ECharts custom series 간트, start~end 막대, **채움=캘린더 경과율**(오늘 `api.coord` 픽셀 → 채움경계가 '오늘' 점선과 정확 일치, scheduleRate 아님 — 사용자가 캘린더 기준 선택), 전체폭, 프로젝트수×38px 동적높이). ④ 문제이슈 버블(`PortfolioProblemBubble`, TOP50 필터무관) **Time→Scope 탭 이동**. 최종 탭: Time=간트/공수추이/리스크TOP · Scope=이슈상태/완성vs일정/계획대비실적/문제이슈 · Resource=롤레벨/인건비/급여/가동률/작업분포. 검증: 백엔드 jest 25/25, 프론트 25/25+골든스냅샷, build 성공.

**데이터모델·경계면 계약 변경(2026-06-02 세션2) — 배포 시 주의**:
- **DB 스키마**: `portfolio_project_snapshot.weekly_effort_json` JSON 컬럼을 `CREATE TABLE`에 포함(**신규 설치 방침 확정 2026-06-04** — 사용자가 기존 테이블 안 쓰고 신규 install. migrate v007 ALTER는 되돌려져 불필요). aggregator가 `weekSecMap`(주 월요일 `weekStartOf` 헬퍼)으로 `weeklyEffort[]{week,md}` 집계 저장. ⚠️ 배포·설치 후 **재집계 1회** 해야 주간 차트 채워짐.
- **KVS settings**: `utilizationRedBand`(1.3) 키 신설. SeedData spread 백필(`{...settings,...exists}`), SettingService 파라미터, EtcSetting UI 3번째 입력(under/over/red). ★**manifest.yml `storage.entities` settings 의 attributes 에 `utilizationRedBand: float` 선언 필수** — 누락 시 KVS save가 422 `UNPROCESSABLE_ENTITY`(정의 안 된 속성 거부). Custom Entity는 attributes 선언된 속성만 저장 가능. manifest storage 스키마 변경은 **forge tunnel 반영 안 됨 → forge deploy 필수**.
- **응답 계약(getPortfolioDashboard)**: 루트에 `utilizationBands{utilUnder,utilOver,utilRed}`(under/over=설정값, red=settings 또는 `DEFAULT_RED_BAND` 1.3), `projects[]`에 `weeklyEffort[]{week,md}` 추가. emptyShape에도 utilizationBands 기본값 포함. 프론트 신호등 resource band를 상수→응답값으로 전환(`data.utilizationBands ?? UTIL_BANDS`).
- **가동률 종합/프로젝트별 분리(2026-06-04)**: ① `members[].utilization`(프로젝트 내 가동률, aggregator의 기존 `projUtil`을 버리지 않고 `utilByAccount`로 멤버 주입 — 이중계상 무관) ② `computeGlobalUtilization` 반환형 변경 **숫자[] → `[{accountId,util}]`**(호출부에서 `utilizationValues=people.map(util)`, rollup meta에 `utilizationPeople` 추가) ③ 서비스가 전 프로젝트 members 사전으로 accountId→displayName 매핑해 `utilization.people[]{accountId,displayName,util}`(util desc) 응답. 프론트 위젯 `PortfolioUtilization` 종합⇄프로젝트별 토글(종합=분포도넛+과부하TOP명단, 프로젝트별=`memberUtilization` 멤버막대+band강조). bands 전달경로: Page→ComparisonTabs→ResourceTab→위젯. ⚠️ **재집계 1회 후 채워짐**(members.utilization·utilizationPeople 둘 다 배치 산출).
- **스키마 무변경 재활용**: plannedTotalMd/actualTotalMd(계획대비실적 위젯), startDate/endDate(간트) — 기존 컬럼 그대로.

**배포 전 확인 필요(미검증, 실데이터 필요)**:
- `actualMm = actualTotalMd / 20` 은 **placeholder**(백엔드 공식 미명시). 정밀 필요 시 `settings.monthRate` 연동.
- members_json 실 payload 크기, migrate 실적용+JSON 드라이버 반환형(문자열 vs 객체), 워크로그 집계 수치 정확도, stale-lock 실동작.
