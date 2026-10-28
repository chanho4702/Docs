# 요구사항 — 프로젝트 상세 대시보드 기능 강화 (2026-08-13)

## 사용자 요청 원문

> "우리 프로젝트 상세 대시보드 기능 강화좀 하자"

선택지 4종 **전부** 선택 + 추가 요청 2건 (원문):
> "어떤 이슈가 가장 큰 이슈인지에 대해서도 디스크usage chart 사용해서 개발해줘 그리고 우리 jql 필터처럼 사용자가 커스텀해서 등록하는 기능이랑 탬플릿으로 한번에 생성하는 기능 강화하자"

## 현재 상태 (리더 사전 조사, 소스 9144aa2)

- `static/ui/src/pages/projectDetail/dashboard/` — DashboardPage(react-grid-layout, 편집 모드 추가/삭제/이름변경/배치저장), SummaryPanel(KPI 타일 3개: 투입 인원·프로젝트 기간·인건비), ChartTemplate(위젯 렌더), AddChartModal(추천 템플릿 3종 + 커스텀)
- 데이터 타입 7종(`constants/dashboardTypes.js`): role/level/team/salary/assignee/issue 분포(pie·bar·line) + worklog(heatmap·lineStack)
- 백엔드: `src/resolver/projectDashboard/` — getChartInfo/getChartDataById/addChart/removeChart/updateChartLayout/updateChartTitle/getSummaryData
- **전부 정적 분포 위주. 진척·일정·위험·비용 소진을 보여주는 위젯이 없다.** 재료는 앱에 이미 있음: 진척도 탭(`projectProgress`, CALCULATION.md 산식), 비용 탭(`projectCost`), 간트/작업관리(기한), 워크로그.

## 기능 목록 (7건)

### 1. 요약 KPI 강화 (SummaryPanel)
기존 3타일(인원·기간·인건비)에 추가: **진척률**, **남은 기간(D-day)**, **지연 이슈 수**(기한 경과 & 미완료).
- 진척률은 진척도 탭과 **같은 산식/같은 데이터 출처**를 쓸 것 (숫자가 탭과 다르면 신뢰 붕괴).
- 인건비 타일의 기존 권한 게이팅(CostAccess) 패턴 확인 후 동일 유지.

### 2. 진척·상태 위젯 (신규 data_type)
- **진척률 추이**: 시간축 진척 변화 (진척도 산식 재사용 — 스냅샷이 없다면 산출 가능성 자체를 설계에서 판정하고, 불가하면 현재 시점 진척 구성(계층별)으로 대체 제안)
- **상태별 이슈 분포**: statusCategory 기준 (pie/bar)
- **계획 대비 실적(MD)**: originalEstimate 합 vs timeSpent 합

### 3. 지연·임박 이슈 위젯 (목록형)
기한 경과(지연) / 7일 이내 임박 이슈 목록. 차트가 아닌 **리스트형 위젯**(이슈 키·요약·기한·담당자). 클릭 시 Jira 이슈로 이동(기존 이슈 링크 패턴 재사용).

### 4. 비용 소진 위젯
인건비 소진 추이 또는 소진율 — 비용 탭(`projectCost`) 데이터/산식 재사용.
**CostAccess 게이팅 필수**: salary 위젯의 기존 게이팅(`allowSalaryWidget`, 서버 data_type 차단) 패턴을 그대로 따를 것. 정책만 보면 열리는 함정 주의(CLAUDE.md 「가드 통과 ≠ 데이터 범위 확정」).

### 5. 이슈 규모 트리맵 ("디스크 usage chart")
"어떤 이슈가 가장 큰가"를 **ECharts treemap**으로. 크기 기준은 설계에서 결정: 계획 작업량(originalEstimate) vs 실투입(timeSpent) — 하나를 기본으로 하되 근거를 남길 것(둘 다 지원할지도 설계 판단, 과설계 금지).
- 기존 `CHART_OPTION_MAP`에 treemap 옵션 추가 (`components/chart/echart/options/` 패턴).
- `chartPalette.js` 색상 준수.

### 6. 커스텀 필터 위젯 (JQL 스타일)
사용자가 **자기 조건을 등록**해 위젯을 만든다 — "내가 담당자인 버그", "우선순위 High" 등.
- 설계 판단 필요: 원문 JQL 입력 vs 구조화된 필터 빌더(담당자/상태/타입/우선순위/기한). 보안·UX 트레이드오프 명시 (원문 JQL이면 프로젝트 범위 강제 주입 필수 — 남의 프로젝트 이슈 조회 차단).
- 위젯 저장 시 필터 정의를 어디에 저장할지: 기존 dashboard 차트 레코드(Forge SQL) 확장 여부 — DDL 변경이 필요하면 `src/rdb/schema/ddl/` 등록 절차 포함.
- 표시 형태: 건수 KPI + 분포 차트 중 설계 결정.

### 7. 템플릿 강화 (AddChartModal)
새 위젯들을 묶은 템플릿 추가 — 예: "프로젝트 건강" 템플릿(진척 추이 + 상태 분포 + 지연 목록), 기존 템플릿 3종(workforce/salary/issue) 개편. 한 번에 생성하는 기존 template 경로 재사용.

## 기술 제약

- 백엔드: `guardedDefine` + `PermissionMap` 등록(신규 resolver 함수는 필수 — 누락 시 PERMISSION_UNMAPPED), 응답 `{success, ...}` 표준.
- 신규 data_type은 서버(`getChartDataByIdService`)에서 최종 차단/허용 판정 — 프론트 필터링은 UX일 뿐(AddChartModal 주석 참조).
- 진척·비용 산식은 **기존 서비스 재사용** — 산식 복제 금지 (진척도 CALCULATION.md / 비용 탭 서비스). 무거운 재계산이 대시보드 진입마다 돌면 성능 감사(A-2 진척·비용 캐시 재설계가 4단계 후보로 걸려 있음)와 충돌하므로, 호출 비용을 설계서에 수치로 명시할 것.
- Jira 조회는 asUser 기본. 커스텀 필터 위젯의 JQL엔 프로젝트 범위 강제.
- 차트 렌더는 기존 EchartPanel/ThemedECharts + `CHART_OPTION_MAP` 확장. **map에 없는 chartType은 백지 차트가 된다**(dashboardTypes.js 주석) — 신규 타입은 반드시 옵션 함수까지 등록.
- KVS 쓰면 빈 문자열 금지·manifest attributes 선언. Forge SQL 쓰면 DDL 등록·마이그레이션.
- i18n `locales/kr|en/*.json` + merge. 스피너 금지(기존 LoadingBar 잔존은 이번에 스켈레톤 전환 여부 설계 판단 — 범위 비대 주의).
- UI는 Atlaskit + RFC-178 공용 지점.

## 우선순위/단계 분할 권고

7건을 한 번에 구현하지 말고 설계에서 **모듈 단위로 분할**할 것 (incremental QA — 하네스 스킬의 모듈 단위 Phase 3~4 반복). 제안: M1(KPI+상태분포+지연목록 — 조회 가볍고 즉효) → M2(트리맵+계획대비실적) → M3(진척추이+비용소진 — 산식/스냅샷 의존) → M4(커스텀 필터+템플릿).
설계에서 다른 분할이 낫다고 판단하면 근거와 함께 재구성 가능.

## 병행 작업 주의

`work-bulk-apply` 기능이 동시 진행 중 — `pages/projectDetail/issue/`, `pages/projectDetail/gantt/useGanttMutations.js`, `utils/useJiraUserInfos.js`, `locales/kr|en/projectDetail.json`을 수정 중이다. **설계 단계에서는 코드를 수정하지 말 것**(Read만). 구현 단계는 리더가 순서를 조율한다.
