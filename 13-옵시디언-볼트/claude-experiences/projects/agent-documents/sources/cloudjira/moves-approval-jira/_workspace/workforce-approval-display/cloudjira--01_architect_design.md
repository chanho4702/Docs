# workforce-approval-display 설계서 — 워크포스 승인 상태 표시와 월 경계 집계

> 작성 2026-10-14 · feature-architect · 입력 `00_input/requirement.md`(R1~R4, 범위 밖, 제약)
> **기준 트리**
> - 워크포스(주 대상): `RFC-220`(03bdfa8) + workforce-input-reopen·linked-mode-fix 미커밋 변경
> - 승인 앱: `master`(ccb5aa1) + 작업 트리 미커밋 변경
>
> 경로 앞 `WF:` 는 워크포스 리포(`C:\CloudJira\moves-workforce`), `AP:` 는 승인 앱 리포다.
> 근거 등급은 세 가지다. **코드**는 리포에서 확인한 것, **문서**는 CLAUDE.md "공식 문서로 확인" 표, **미검증**은 §10 에 모았다.
> 이 설계서는 코드를 바꾸지 않는다. 구현자의 단일 진실 원천이다.

---

## 0. 결론 요약

1. **월 경계는 승인 앱 인증 문서의 기간 칸(`ps`/`pe`)으로 정한다.** 새 타임존 계약은 필요 없다.
   - 승인 앱은 사용자×월 문서 `movesApproval.cert.{YYYY-MM}` 의 `ps`/`pe` 를 **자기 사이트 타임존**(`timesheetTimezone`, 기본 `Asia/Seoul`)의 달력 월 경계로 서명해 게시한다(AP:`WorkforcePublisher.js:361` `periodRange(periodKey,{timeZone:lock.timeZone})`).
   - 워크포스는 이미 그 문서를 읽고 있다. 따라서 "작업 시작 시각이 속한 달의 `pe` ≤ now 이면 지난달"로 판정한다. 승인 앱과 같은 경계가 되고, Jira 호출은 늘지 않는다.
   - 문서가 하나도 없을 때만 대체 타임존 `Asia/Seoul`(승인 앱 기본값과 같음)을 쓴다. 이 경우에도 결과는 "제외 사유 분류"만 달라지고 집계 숫자는 같다(§3.2 표: UNKNOWN 은 두 달 모두 0).
2. **집계 포함 규칙**은 다음과 같다(`approvalOfWorklog`).
   - 승인된 기록(`APPROVED`)은 달과 상관없이 포함한다.
   - 승인 전인 정상 출처 기록은 **이번 달(또는 미래 달)이고 내용이 승인 앱 관찰값과 같을 때만** 포함한다.
   - 그 밖은 제외한다.
   - `closeAt` 은 **잠금(`locked`·`lockReason`)에만** 쓴다. 집계 포함 여부는 월 경계로만 정한다.
   - 그래서 이번 달이 수동 마감돼도 미승인분은 포함된다. 지난달이 재개방(`closeAt=null`)돼도 승인분만 포함된다.
3. **원가·정산(`certifyCostRows`)은 지금 "승인분만"이 아니다.**
   - 연동 모드에서 `approvalOfWorklog().countableSeconds` 를 그대로 써서, 이번 달 미승인분까지 확정 원가에 들어간다(코드: WF:`ApprovalCertReader.js:260-266`).
   - 10-03 확정 결정("원가·정산만 승인분만")과 어긋나므로 고친다. **확정 원가는 승인분만**, 예상 원가(`expectedRows`)는 지금처럼 전체 기록으로 둔다(열린 질문 Q3).
4. **배지는 `WorklogApprovalBadge` 하나로 통일한다.**
   - 지금 이 배지를 쓰는 화면은 1곳(`WorklogHistoryList`)뿐이다. 옛 인증 배지 `CertBadge` 는 2곳에서 쓴다.
   - 서버가 `approval` 을 붙여 보내는데 화면이 무시하는 곳이 3곳이고, 서버가 아예 붙이지 않는 개별 표시 경로가 5곳이다(§1).
   - 캘린더 칩에는 공간이 없다. 그래서 축약형 `WorklogApprovalDot` 을 새로 만든다(색 점 + 잠금 아이콘, 접근성 라벨, 기존 i18n 키 재사용).
5. **R3 안내 문구에는 새 응답 필드 `approvalBasis` 를 쓴다.** 서버 집계 응답에 이 필드를 싣고, 화면이 직접 합산하는 경로는 같은 순수 함수를 프론트에서 돌린다.
   - **워크포스 locales 는 수정하지 않는다.** 새 키 6개는 §8 에 목록으로만 둔다.
6. **R4: 승인 앱 규칙은 바꾸지 않는다.**
   - 승인 앱 화면(팀 인증 매트릭스·내 인증 요약·내 타임시트)은 "기록 시간"과 "인증(승인) 시간"을 **나란히** 보여 준다. 경계에 따라 하나의 숫자로 합치는 규칙이 승인 앱에는 없다.
   - 워크포스 지난달 숫자는 승인 앱 "인증 시간"과 같아야 한다. 어긋나는 원인 두 가지를 워크포스 쪽에서 맞춘다(§4.4, D1·D2).
   - 승인 앱 변경은 **0건**이다(T-A 는 대조 테스트 1건만).
7. **SQL 0, manifest 0, 새 스코프 0.**
   - 이미 승인이 적용되는 경로에는 추가 Jira 호출이 없다.
   - 지금 승인이 빠져 있는 개별 표시 경로 5곳은 `applyWorklogApproval` 을 붙여야 한다. 화면 1회당 Jira 호출이 4~8회 늘어난다(§9).

---

## 열린 질문 (제품 결정만 — 설계는 각 질문의 **기본값**으로 진행)

| # | 질문 | 선택지 | 기본값(설계 반영) | 근거 |
|---|---|---|---|---|
| Q1 | 월 경계 타임존은? | (a) **승인 앱 사이트 타임존**(인증 문서 `ps`/`pe`, 문서가 없으면 `Asia/Seoul`) (b) 작성자 오프셋(`started` 문자열의 날짜 = 워크포스 캘린더의 날짜 칸) (c) 조회자 브라우저 | **(a)** | 승인 앱의 마감·잠금·인증 문서와 같은 경계여야 R4 가 맞는다. (b) 는 워크포스 캘린더 칸과 맞지만, 월 첫날·말일 ±14시간 이내 기록이 승인 앱과 다른 달로 갈린다 |
| Q2 | **이번 달인데 승인 앱 문서에 아직 없는 기록**(UNKNOWN)을 집계에 넣나? 이런 기록은 방금 쓴 기록(게시 지연 수십 초~수 분, 워크포스 캐시 최대 5분), 문서 잘림(>1000건), 승인 범위 밖 이슈 등에서 생긴다 | (a) **넣지 않는다(0)**. 배지는 "상태 확인 필요", 안내 줄에 "확인 중 X시간 제외"를 표시한다 (b) 이번 달이면 넣는다 | **(a)** | 10-13 결정 "정상 입력 증명과 승인 여부는 별개"에 따라 출처가 증명된 기록만 집계한다. 지금 동작과 같아 회귀도 없다. (b) 는 Jira 기본 화면·REST 로 쓴 기록이 승인 앱 관찰 전까지 잡혀 들어간다 |
| Q3 | 원가·정산의 **확정 원가**에 이번 달 미승인분을 넣나? | (a) **넣지 않는다**(승인분만). 이번 달 진행 상황은 기존 "예상 원가"(전체 기록)로 본다 (b) 다른 통계처럼 월 경계 규칙을 따른다 | **(a)** | CLAUDE.md 10-03 확정 결정 "원가·정산만 승인분만"을 따른다. 원가 화면에는 확정·예상 두 줄이 이미 있다(`certCost`) |
| Q4 | **반려(REJECTED)·만료·취소**된 이번 달 기록을 이번 달 통계에 넣나? | (a) **넣는다**(미승인으로 취급, 배지로 구분) (b) 반려만 뺀다 | **(a)** | 요구 원문이 "이번 달은 승인 안 된 것과 같이 통계"다. 반려된 기록도 같은 달 안에 고쳐서 다시 요청할 수 있다. 다음 달이 되면 자동으로 빠진다 |
| Q5 | **재개방된 지난달**(승인 앱 `closeAt=null`)의 미승인분은? | (a) **승인분만**(월 경계 우선) (b) 재개방 중에는 미승인 포함 | **(a)** | 요구 R2 "지난 월이면 승인분만"을 따른다. 재개방은 수정·재승인을 허용하는 절차일 뿐이다. 재승인되면 그때 포함된다. 지금 테스트 '수동 재개방은 … 미승인 집계를 허용한다'는 뒤집는다(§3.4) |
| Q6 | Jira 자체 합계(`timetracking.timeSpentSeconds`)를 쓰는 지표(진척 `actualTotalMd`, 대시보드 인사이트, 이슈 분석, 간트 진척률, 리소스 부하, 포트폴리오 `actualTotalMd`)는? | (a) **이번에는 워크로그를 이미 가져오는 응답(진척·포트폴리오)만 승인 규칙 합계로 바꾸고, 나머지는 후속으로 미룬다** (b) 전부 워크로그 수집으로 바꾼다 | **(a)** | (b) 는 지표마다 이슈 전량의 워크로그를 새로 가져와야 해서, 화면 1회당 Jira 호출이 수십~수백 회 늘어난다. (a) 는 같은 응답 안의 두 숫자가 서로 어긋나는 문제(§1 F-4)만 없앤다 |
| Q7 | 워크로그 내보내기(`/worklog-export`, 프론트가 Jira REST 를 직접 부름)에 승인 상태 열을 넣나? | (a) **이번 범위 밖**. 후속으로 서버 resolver 를 거치게 바꾼다 (b) 이번에 resolver 를 새로 만든다 | **(a)** | 서버 경로가 없어서 신규 resolver·권한 맵·가드가 필요하다. 기존 내보내기는 "Jira 원본 기록" 성격이다 |
| Q8 | 옛 인증(approvalModel≠1, 개발 사이트 데이터)은? | (a) **승인으로 보지 않는다**(지금과 같음). 승인 앱 "인증 시간"과는 이 데이터만큼 다르다 (b) 승인으로 본다 | **(a)** | 10-13 결정 "레거시 인증은 새 승인 통계로 승격하지 않는다"를 따른다 |

---

## 1. 현황 진단 — 전수 조사

### 1.1 서버 경로 (WF:`src/resolver/**`, `src/api/jira/worklog/**`)

| resolver | 서비스 | 승인 적용 | 행/집계 | 응답에 `approval`? | 합산 위치 | 바꿀 것 |
|---|---|---|---|---|---|---|
| `getChartData`/`getChartDataById` (worklog 위젯, 사용자 모드) | `ProjectDashboardService.js:571` → `utils/worklog/WorklogService.js:61,8,150` | `applyWorklogApproval(rows,null,{includeHidden})` | 집계(일별·사용자×일, lineStack `raw`) | 없음 | 서버 `aggregateByDate`/`aggregateByUserDate` | 규칙은 자동 반영. 응답에 `approvalBasis` 추가(T-W5) |
| 같은 resolver, 협업 모드 | `CollabWorklogFetcher.js:223` | `applyWorklogApproval(rows,{cloudId},{includeHidden})` | 집계 | 없음 | 서버 | 같음 |
| `getProjectCalendarWorklog` | `ProjectCalendarService.js:112` | `applyWorklogApproval(…,{selfOnly,includeHidden})` | 행 | **있음**(`approval`·`claimedSeconds`·`countableSeconds`) | UI(`FullCalendar.buildDailyTotals`) | UI 배지·표시 초 교정(T-F2) |
| `getCollabCalendarWorklog` | `CollabCalendarService.js:58` → `CollabDto.js:118` | 있음 | 행 | **있음** | UI | 같음 |
| `getCollabIssueWorklogs`(드로어) | `CollabIssueWorklogService.js:17-45` | **없음** | 행 + `total` | 없음 | UI(`useIssueWorklogs.js:56`) | `applyWorklogApproval` 추가(T-W3) |
| `getProjectWorklog`(내 작업 표, 기본) | `myWork/MyWorkService.jsx:58,98` | `withCertBadges`(옛 인증 배지 맵만) | 행 | `certifications` 맵만 | UI | `applyWorklogApproval` 로 교체(T-W3) |
| `getMyCalendarWorklog` | `MyWorkService.jsx:167` | **없음** | 행 | 없음 | UI(캘린더·KPI·마이페이지) | `applyWorklogApproval` 추가(T-W3). 마이페이지도 같은 resolver |
| `getMyIssueList`(내 작업 표, 대체 경로) | `MyWorkService.jsx:230` | **없음** | 행 | 없음 | UI(`MyIssueTable.jsx:140`) | 추가(T-W3) |
| `getResourceAnalysisList` | `ResourceAnalysisService.js:113` → `ResourceWorklogFetcher.js:92` | 있음 | 집계(사용자별) | 없음 | 서버 | `approvalBasis` 추가 |
| `getResourceWorklogDetail` | `ResourceAnalysisService.js:225,315` | `applyWorklogApproval` + `withCertBadges` | 집계 + `logs[]` | `logs[]` 에 있음 | 서버, 단 `logs[].hours/md` 는 **주장 시간**(`:296-297`) | `approvalBasis` 추가, 배지 교체(T-F3). `logs[].hours` 는 표시용이라 주장값을 유지하고, 표 머리 합계는 `countableSeconds` 로 고친다(F-3) |
| `getProjectCostSummary` | `ProjectCostService.js:152,271` | fetcher 안에서 `applyWorklogApproval` → `certifyCostRows` | 집계(확정·예상) | `certification` 요약만 | 서버 | 확정분은 승인분만(T-W4, Q3) |
| `getProjectProgressSummary` | `ProjectProgressService.js:35,180` | fetcher 안 | 집계(`actualCumulative`) + Jira 합계(`actualTotalMd`) | 없음 | 서버 | `approvalBasis` 추가, `actualTotalMd` 를 승인 규칙 합계로(Q6 a, T-W6) |
| `getProjectRelationGraph`(연동 ON) | `RelationGraphService.js:285,307` | 있음 | 집계 | 없음 | 서버 | 규칙 자동 반영 |
| `getPortfolioDashboard`(배치 산출물) | `PortfolioAggregator.js:321,346` | 큐 소비자 안에서 `applyWorklogApproval` | 집계 | 없음 | 배치 | **F-5**(사용자 컨텍스트 없음). 이번 범위에서 막을 것 |
| `getMyTeamWorkAnalysis`·`getResourceOverview`·`getResourceAllocationGraph`·`getWorkAssignmentBoard/Pool` | 포트폴리오 롤업 KVS | 상속 | 집계 | 없음 | 배치 | 포트폴리오를 따라감 |
| `getIssueWorklogDetail` | `IssueAnalysisService.js:118-181` | **없음** | 행 + `cumulativeByDate` | 없음 | 서버(주장값) | `applyWorklogApproval` 추가(T-W3) |
| `downloadMyWorklogExcel` | `myPage/MyPageService.jsx:145,168` | 없음(UI 가 보낸 행을 합산) | 엑셀 | — | 서버(클라이언트 값) | UI 가 `countableSeconds`·상태 열을 실어 보낸다(T-F5). 서버 합계는 `countable` 칸을 쓰고, 칸이 없으면 지금과 같다 |
| Jira `timetracking` 경로(인사이트·집계·이슈 분석·협업 작업 목록·간트·리소스 부하·포트폴리오 `actualTotalMd`·공간 이슈) | §B(조사 원본) | 없음 | 집계 | — | Jira | Q6 기본값: 이번 범위 밖(진척·포트폴리오의 같은 응답 혼재만 교정) |

### 1.2 화면 (WF:`static/ui/src/**`)

| # | 화면 | 파일 | 표시/집계 | 데이터 경로 | 지금 배지 | 지금 집계 규칙 | 바꿀 것 |
|---|---|---|---|---|---|---|---|
| 1 | 내 작업 캘린더 칩(월·주) | `components/calendar/FullCalendar.jsx:225-290`, `pages/myWork/WorklogPage.jsx` | 표시 | `getMyCalendarWorklog` → 없음 | 없음 | — | 서버 승인 적용 + `WorklogApprovalDot`. 칩 길이·시간은 `claimedSeconds` 로(F-1) |
| 2 | 캘린더 날짜 칸 합계 | `FullCalendar.jsx:51-68` | 집계 | 같음 | — | UI 가 `timeSpentSeconds` 합산(연동 시 = countable) | `countedSecondsOf` 사용. 제외분은 툴팁 문자열에 |
| 3 | 내 작업 KPI(오늘·주·월) | `pages/myWork/MyLogSummary.jsx`, `utils/useMyWorklogSummary.js:101` | 집계 | 같음 | — | UI 합산 | `approvalBasisOf` 로 안내 줄(R3) |
| 4 | 내 작업 표 — 워크로그 하위 행 | `pages/myWork/table/MyIssueTable.jsx:98-132` | 표시 | `getProjectWorklog`/`getMyIssueList` → `withCertBadges` 또는 없음 | **CertBadge**(옛 인증) | — | `WorklogApprovalBadge` 로 교체 |
| 5 | 내 작업 표 — 이슈 행 합계 | `MyIssueTable.jsx:140-143` | 집계 | 같음 | — | UI 합산(주장값) | `countedSecondsOf` |
| 6 | 프로젝트 캘린더(칩·날짜 합계) | `projectDetail/calender/ProjectCalender.jsx`, FullCalendar 재사용 | 표시+집계 | `getProjectCalendarWorklog`/`getCollabCalendarWorklog` → **이미 `approval` 있음** | 없음(무시) | UI 합산(countable) | 점 배지, 칩 표시 초 교정(F-1) |
| 7 | 워크로그 추가·수정 모달 | `pages/myWork/modal/WorklogModal.jsx` | 상세 | `getIssueWorklogControl` | 없음 | — | 머리에 `WorklogApprovalBadge`(행에 `approval` 이 있을 때). 기간 역산 `:289` 은 `claimedSeconds` 로(F-1) |
| 8·9 | 이슈 트리 상세 패널·이슈 맵 드로어 워크로그 탭 | `projectDetail/work/{TreeDetailPanel,WorklogHistoryList,map/MapWorklogTab,IssueMapDrawer}.jsx`, `useIssueWorklogs.js:34-56` | 표시+합계 | 사용자 경로: 프론트 Jira REST 직접(승인 없음) / 협업: `getCollabIssueWorklogs`(없음) | **AB**(`WorklogHistoryList:63`). 데이터가 없어 비어 있음 | UI 합산(주장값) | 협업 경로는 서버 승인 적용. 사용자 경로는 연동 모드일 때 `getCollabIssueWorklogs` 와 같은 서버 경로를 쓰거나 승인 조회를 추가한다(§4.3 T-W3c) |
| 10 | 이슈 분석 — 워크로그 상세 표 | `analysisReport/issue/WorklogDetailPanel.jsx:45-83` | 표시+합계 | `getIssueWorklogDetail` → 없음 | 없음 | UI 가 서버 `hours` 합산 | 서버 승인 적용, 배지 열 추가 |
| 11 | 이슈 분석 누적 차트 | `IssueAnalysisChart.jsx:239-300` | 집계 | 같음(`cumulativeByDate`) | — | 서버(주장값) | countable 로. 안내 줄 |
| 12 | 이슈 분석 표·차트(이슈별 실적) | `IssueAnalysisTable.jsx`, `issueAnalysisChartData.js` | 집계 | `getIssueAnalysisList`(timetracking) | — | Jira 합계 | Q6: 범위 밖 |
| 13 | 리소스 분석 — 구성원 드로어 원시 표 | `analysisReport/resource/ResourceAnalysisChart.jsx:155-224,310` | 표시+합계 | `getResourceWorklogDetail` → **`approval` 있음** | **CertBadge** | 머리 합계가 `log.hours`(주장값) | AB 로 교체, 합계는 countable(F-3), 안내 줄 |
| 14·15 | 리소스 분석 표·차트, 팀 분석 | `ResourceAnalysisTable.jsx`, `team/ProjectTeamAnalysisPage.jsx` | 집계 | `getResourceAnalysisList`(+원가) | — | 서버 | 안내 줄(R3) |
| 16 | 원가 | `projectDetail/cost/CostPage.jsx`, `CostCertBasis.jsx` | 집계 | `getProjectCostSummary` | 확정·예상 타일 | 서버(확정 = countable, Q3 위반) | 확정 = 승인분만(T-W4). 안내 문구는 "확정: 승인분만"(새 키) |
| 17 | 급여(정산) | `salary/SalaryManagementPage.jsx` | 집계(급여) | `getProjectSalaryList` | — | 워크로그 무관 | 변경 없음(조사 결과 워크로그 시간 입력이 없다) |
| 18 | 진척 S-커브·막대 | `progress/ProgressSCurve.jsx`, `ProgressBars.jsx` | 집계 | `getProjectProgressSummary` | — | 누적 = countable, 총계 = Jira 합계(혼재) | 총계도 countable(Q6 a), 안내 줄 |
| 19 | 간트 진척률 | `gantt/*` | 집계(%) | `getProjectGanttData`(timetracking) | — | Jira | Q6: 범위 밖 |
| 20 | 대시보드 워크로그 위젯(히트맵·lineStack 표) | `dashboard/ChartTemplate.js` | 집계 | `getChartDataById` | — | 서버(countable) | 위젯 하단 안내 줄 |
| 21 | 대시보드 토폴로지·계획 대비 | `dashboard/widgets/TopologyWidget.jsx`, `useDashboardAggregate.js` | 집계 | `getProjectRelationGraph`/`getDashboardAggregate` | — | ON 이면 countable / timetracking | 토폴로지만 안내. 집계 위젯은 Q6 범위 밖 |
| 22 | 마이페이지 워크로그 패널(목록·이슈별·엑셀) | `myPage/sections/MyWorklogPanel.jsx:46-200` | 표시+집계 | `getMyCalendarWorklog` | 없음 | UI 합산 | 상태 열(`WorklogApprovalBadge`), 합계 countable, 엑셀에 상태·집계 시간 열 |
| 23·24 | 마이페이지 KPI·기여 차트 | `MyPageSummary.jsx`, `MyContributionCharts.jsx`, `hooks/useMyContribution.js:46-70` | 집계 | 같음 | — | UI 합산 | countable + 안내 줄 |
| 25~29 | 마이페이지 팀 분석, 포트폴리오, 리소스 팀 분석·개요·배정 | `myPage/sections/MyTeamAnalysisPanel.jsx`, `portfolio/**`, `resource/**` | 집계 | 포트폴리오 롤업(배치) / timetracking | — | 배치(countable, F-5 위험) / Jira | 포트폴리오 화면 상단에 안내 줄 1개. 숫자는 배치를 따른다 |
| 30 | 워크로그 내보내기 | `worklogExport/**` | 표시+집계 | 프론트 Jira REST 직접 | 없음 | UI 합산(주장값) | Q7: 범위 밖 |

### 1.3 코드와 요구서 전제가 다른 곳, 그리고 결함

- **F-1 표시 초 오염(코드, 이미 발생 중).** `applyWorklogApproval` 은 `timeSpentSeconds` 를 **집계 초로 덮어쓴다**(WF:`ApprovalCertReader.js:374-375`).
  - 프로젝트 캘린더는 이미 이 경로를 쓴다. 그래서 칩의 블록 길이(`FullCalendar.jsx:242` `start.add(worklog.timeSpentSeconds)`)가 집계 초를 따른다. 모달 기간 역산(`WorklogModal.jsx:289`)도 마찬가지다.
  - 결과: 제외된 기록은 길이 0인 블록이 된다. 수정 모달에서는 기간이 틀어진다.
  - 이번 설계는 승인 적용을 개별 표시 경로 5곳에 더 넓히므로, 이 결함도 같이 번진다. **프론트 공용 함수 두 개(`displaySecondsOf`·`countedSecondsOf`)로 표시와 집계를 나눠야 한다**(§7.3).
- **F-2 협업 드로어는 승인 미적용이다(코드).** 요구서 현황은 "협업 워크로그"를 적용 경로로 적었다. 실제로 승인이 적용된 것은 협업 **캘린더**(`CollabCalendarService`)뿐이다. 드로어(`getCollabIssueWorklogs`)는 적용되지 않는다.
- **F-3 리소스 상세 표 머리 합계가 주장값이다.** 상단 일·주·월 집계는 countable 인데, 표 머리 합계(`ResourceAnalysisChart.jsx:310`)는 `log.hours`(주장값)를 더한다. 한 화면 안에서 두 숫자가 다르다.
- **F-4 진척·포트폴리오 응답 안의 혼재.** 누적·구성원 공수는 승인 규칙을, 총 실적(`actualTotalMd`)은 Jira 합계를 따른다. Q6 기본값에 따라 이번에 같은 규칙으로 맞춘다.
- **F-5 포트폴리오 배치의 사용자 컨텍스트 부재(코드 추론, 미검증).**
  - 큐 소비자에서 `applyWorklogApproval(rows, null, …)` 이 asUser `/myself`·`permissions/check` 를 부른다. 사용자 없는 실행에서는 이 호출이 실패할 가능성이 높다.
  - 실패하면 `aggregateOneProject` 가 프로젝트를 건너뛴다(`PortfolioAggregator.js:605`).
  - 처분: 배치는 **사용자 재검증 없이** 앱 자격 집계만 쓰는 전용 진입점 `applyWorklogApprovalForBatch` 를 둔다(§4.3). 이 결과는 집계 숫자로만 나가고 행을 사용자에게 돌려주지 않는다. 이는 승인 앱 불변식 8의 "asApp 결과를 사용자에게 반환하지 않는다"와 같은 원칙이다.
- **F-6 캐시 키가 조회자와 무관하다.** `ProjectProgress:{projectId}`·`ProjectCost:{projectId}` 는 키에 조회자가 없다. 그런데 `applyWorklogApproval` 결과는 조회자마다 다르다(열람 재검증·팀장 숨김 보충).
  - 이번 기능이 키를 새로 만들지는 않는다.
  - 다만 월 경계 판정이 `now` 에 따라 달라지므로, **캐시 키에 `currentPeriodKey` 를 넣는다**. 그러면 달이 바뀌는 순간 지난달 숫자가 승인분만으로 바로 내려간다(§4.5).
  - 조회자 키 문제는 별도 결함으로 보고만 한다(이번 범위 밖, §11 후속).

---

## 2. 경계면 계약

새 resolver 는 없다. 기존 resolver 응답에 **가산 필드**만 더한다. 기존 필드의 뜻은 바꾸지 않는다.

### 2.1 행 단위 `approval`(이미 있는 필드 확장)

`applyWorklogApproval` 이 붙이는 `row.approval` 에 다음 칸을 더한다.

```text
approval: {
  status,            // 기존: APPROVED | PENDING | UNSUBMITTED | REJECTED | EXPIRED | CANCELLED | CHANGED | UNKNOWN
  normalOrigin,      // 기존
  locked, lockReason,// 기존: 'APPROVED' | 'PERIOD_CLOSED' | null — closeAt 은 여기에만
  countableSeconds,  // 기존 이름, 규칙 변경(§3)
  basis,             // 신규: 'CURRENT' | 'PAST' — 작업 시작 시각이 속한 승인 월이 지났는가
  periodKey,         // 신규: 'YYYY-MM' — 판정에 쓴 승인 월
  excludedReason,    // 신규: null | 'PAST_UNAPPROVED' | 'UNVERIFIED'
}
row.claimedSeconds   // 기존: Jira 원래 시간(표시용)
row.countableSeconds // 기존
row.timeSpentSeconds // 기존 동작 유지: = countableSeconds(서버 집계 함수 호환)
```

### 2.2 집계 응답 `approvalBasis`(신규, 가산)

```text
approvalBasis: null | {
  currentPeriodKey: 'YYYY-MM',            // 승인 앱 사이트 타임존 기준 이번 달
  timeZoneSource: 'DOC' | 'FALLBACK',     // 진단용(화면 문구 분기에 쓰지 않음)
  excludedPastUnapprovedSeconds: number,  // 지난달 미승인으로 빠진 주장 초 합
  excludedPastUnapprovedCount: number,
  excludedUnverifiedSeconds: number,      // 이번 달 출처 미확인·승인 후 아님 변경·문서 없음으로 빠진 초 합
  excludedUnverifiedCount: number,
}
```

- 연동 모드가 아니거나 승인이 적용되지 않았으면 `null` 이다. 이때 화면은 안내 줄을 그리지 않는다. 지금 화면과 같다.
- 숫자에는 **응답에 실린 행 범위만** 들어간다. 그래서 조회자가 볼 수 없는 기록은 제외 합계에도 들어가지 않는다(불변식 8 ⑥ 대칭).

| resolver | 권한 축(기존 그대로) | 입력(변경 없음) | 응답 변경 | 에러 code | 소비 화면 |
|---|---|---|---|---|---|
| `getChartData`·`getChartDataById` | 기존 | 기존 | `content.approvalBasis` 추가 | 기존 | #20 |
| `getProjectCalendarWorklog` | 기존 | 기존 | 행 `approval` 확장 + 최상위 `approvalBasis` | 기존 | #6 |
| `getCollabCalendarWorklog` | 기존 | 기존 | 같음(`CollabDto.toCollabWorklog` 가 새 칸 3개를 통과시킨다) | 기존 | #6 |
| `getCollabIssueWorklogs` | 기존 | 기존 | 행에 `approval`·`claimedSeconds`·`countableSeconds`, `approvalBasis` | 기존 + `APPROVAL_AGGREGATE_PRINCIPAL_REQUIRED`(이미 있는 내부 오류, 화면은 일반 오류로 처리) | #8·9 |
| `getMyCalendarWorklog` | 기존 | 기존 | 행 `approval` 등 + `approvalBasis` | 같음 | #1·2·3·22·23·24 |
| `getProjectWorklog`·`getMyIssueList` | 기존 | 기존 | 행 `approval` 등. `certifications` 맵은 **한 판 유지 후 제거**(옛 번들 호환) | 같음 | #4·5 |
| `getIssueWorklogDetail` | 기존 | 기존 | 행 `approval`·`claimedSeconds`·`countableSeconds`, `hours` = 주장값 유지, `countableHours` 추가, `cumulativeByDate` = countable, `approvalBasis` | 같음 | #10·11 |
| `getResourceAnalysisList` | 기존 | 기존 | `approvalBasis` | 기존 | #14·15 |
| `getResourceWorklogDetail` | 기존 | 기존 | `logs[].approval` 확장, `logs[].countableHours` 추가, `approvalBasis`. `logs[].certification` 은 한 판 유지 | 기존 | #13 |
| `getProjectCostSummary` | 기존 | 기존 | `certification.approvedOnly: true`(연동 ON), `approvalBasis` | 기존 | #16 |
| `getProjectProgressSummary` | 기존 | 기존 | `approvalBasis`. 연동 ON 이면 `effort.actualTotalMd`·`issues[].actualMd` 가 승인 규칙 합계 | 기존 | #18 |
| `getPortfolioDashboard` | 기존 | 기존 | 스냅숏에 `approvalBasis`(배치 시점) | 기존 | #26 |
| `downloadMyWorklogExcel` | 기존 | `rows[].countableSeconds?`·`rows[].approvalStatus?` 선택 칸 추가 | 엑셀 합계 = countable(칸 있을 때), 상태 열 | 기존 | #22 |

---

## 3. 도메인 (순수 함수)

위치: WF:`src/integration/approval/worklogApproval.js`. 이미 순수 함수이고 `now` 를 주입받는다. `Date.now()` 를 쓰지 않는다.

### 3.1 시그니처

```js
export const CountBasis = Object.freeze({ CURRENT: 'CURRENT', PAST: 'PAST' });
export const ExcludedReason = Object.freeze({ PAST_UNAPPROVED: 'PAST_UNAPPROVED', UNVERIFIED: 'UNVERIFIED' });
/** 승인 앱 SettingsRepository 기본 timesheetTimezone 과 같은 값 — 문서가 하나도 없을 때만 쓴다. */
export const FALLBACK_APPROVAL_TIME_ZONE = 'Asia/Seoul';

/**
 * 시각 → 승인 월. docs 에서 그 시각을 덮는 문서(작성자 무관, 사이트 단일 타임존)를 먼저 찾는다.
 * @returns {{periodKey, start:number|null, end:number|null, source:'DOC'|'FALLBACK'}}
 */
export const approvalMonthOf = (ms, docs, { timeZone = FALLBACK_APPROVAL_TIME_ZONE } = {}) => …

/** 지난달인가 — now 가 그 달의 end 이상(DOC) 또는 now 의 월 키 > 그 달 키(FALLBACK). 미래 달은 CURRENT. */
export const countBasisOf = (month, now, { timeZone }) => …

export const approvalOfWorklog = (row, docs, now, { timeZone } = {}) => …   // 4번째 인자 신규(선택)

/** 행(applyWorklogApproval 출력) → approvalBasis. 행이 하나도 approval 을 갖지 않으면 null. */
export const approvalBasisOf = (rows, now, docs = null, { timeZone } = {}) => …

/** 원가 전용 — 달과 무관하게 승인분만. countableSeconds 대신 쓴다. */
export const approvedSecondsOf = (approval) => …
```

- 달력 월 계산에는 기존 WF:`integration/approval/controlDoc.js` 의 `localDateOf(ms, timeZone)` 를 쓴다(추적 파일). 미추적 `writeGate.js` 는 import 하지 않는다(제약: 미추적 파일 불변·의존 금지).
- `approvalMonthOf` 는 docs 를 `start` 기준 색인으로 한 번만 만든다. 기존 `docsByAccountOf` 처럼 WeakMap 캐시를 쓴다.

### 3.2 집계 포함 규칙(진리표)

판정 순서는 다음과 같다.
1. 엔트리를 찾는다. 찾는 방법은 지금과 같다(작성자 문서에서 worklogId로, 없으면 시각으로 덮는 문서).
2. `month = approvalMonthOf(startedMs(row.started))`
3. `basis = countBasisOf(month, now)`
4. 아래 표를 적용한다.

| 상태(엔트리) | normalOrigin | 지문 일치(matched) | CURRENT(이번·미래 달) | PAST(지난달) | excludedReason |
|---|---|---|---|---|---|
| APPROVED | ✓ | ✓ | 승인 초 | 승인 초 | null |
| APPROVED(→ 표시 `CHANGED`) | ✓ | ✗ | 승인 초 | 승인 초 | null |
| APPROVED | ✗ | — | 0 | 0 | CURRENT 이면 `UNVERIFIED`, PAST 이면 `PAST_UNAPPROVED` |
| PENDING·UNSUBMITTED·REJECTED·EXPIRED·CANCELLED | ✓ | ✓ | **엔트리 초**(= 현재 초) | **0** | CURRENT: null / PAST: `PAST_UNAPPROVED` |
| 같은 미승인(→ 표시 `CHANGED`) | ✓ | ✗ | 0 | 0 | CURRENT: `UNVERIFIED` / PAST: `PAST_UNAPPROVED` |
| 미승인 | ✗(NONE·INVALID·REUSED·BACKFILL·PREAPPROVAL) | — | 0 | 0 | CURRENT: `UNVERIFIED` / PAST: `PAST_UNAPPROVED` |
| 엔트리 없음 → `UNKNOWN`(문서 없음·문서에 없음·잘림·읽기 실패) | — | — | **0**(Q2 a) | 0 | CURRENT: `UNVERIFIED` / PAST: `PAST_UNAPPROVED` |
| 승인 후 삭제 보충 행(`deletedApprovedRowsOf`) | ✓ | — | 승인 초(D1 적용) | 승인 초 | null |

- **"승인 초"(D1, §4.4).** 서명된 인증 목록 `doc.entries.get(id).seconds` 를 우선한다. 이 값은 승인 앱 정책 KEEP/ZERO 를 이미 적용한 값이다. 없으면 엔트리 `seconds`(e[7])를 쓴다. 이렇게 하면 승인 앱 "인증 시간"과 같은 숫자가 된다.
- **잠금은 다음 식이다.** `locked = approved || closed`, `lockReason = approved ? 'APPROVED' : closed ? 'PERIOD_CLOSED' : null`. 여기서 `closed = Number.isFinite(closeAt) && now >= closeAt` 이고, `closeAt` 은 엔트리 10번째 칸이 있으면 그것, 없으면 문서 `approval.closeAt` 이다. 지금과 같다. **집계에는 쓰지 않는다.**
- **마감이 월말보다 이르면**(수동 마감) 이번 달 미승인분은 여전히 포함된다. 배지만 "기간 마감"으로 잠긴다. **마감이 월말보다 늦으면**(자동 마감 N일, 또는 0) 지난달은 월말 직후부터 승인분만 포함된다.
- **PAST 판정이 문서 `end` 를 따르는 이유.** 작성자 오프셋 기준 날짜가 아니라 승인 앱이 서명한 월 경계를 쓴다. 그래서 승인 앱의 `periodKeyOf(started, {timeZone})` 와 같은 달로 묶인다(R4).
- **월 이동 기록**(V5: 승인 뒤 시작일이 다른 달로 옮겨진 경우). 기준은 지금 `started`(작업 시작일)의 달이다. 승인 초는 엔트리를 찾은 문서의 값을 쓴다.

### 3.3 `approvalBasisOf` 규칙

- `currentPeriodKey` 는 `approvalMonthOf(now, docs)` 의 periodKey 다. 여기서 `docs` 는 같은 요청에서 읽은 문서다. 행만으로 계산할 때(프론트)는 서버가 준 `approvalBasis.currentPeriodKey` 를 그대로 쓴다.
- 제외 합계의 원천은 `claimedSeconds` 다. `approval.excludedReason` 이 있는 행만 이유별로 더한다.
- 프론트 공용판 WF:`static/ui/src/components/worklog/approvalTotals.js` 는 같은 규칙을 **행만으로** 계산한다(`excludedReason` 은 서버가 정함). 프론트는 월을 다시 판정하지 않는다.

### 3.4 테스트 케이스(WF:`src/integration/approval/__test__/worklogApproval.test.js` 확장)

1. 이번 달 PENDING·UNSUBMITTED·REJECTED 정상·일치 → 엔트리 초, `basis:CURRENT`, `excludedReason:null`
2. 같은 행을 `now = doc.end` 로 → 0, `PAST`, `PAST_UNAPPROVED`
3. `now = doc.end - 1` 은 CURRENT(경계 포함·제외 확인)
4. APPROVED 는 PAST 에서도 승인 초, `PAST`, null
5. APPROVED + 지문 불일치 → `status:'CHANGED'`, 승인 초, `locked:true`, `lockReason:'APPROVED'`
6. 이번 달 미승인 + 불일치 → 0, `UNVERIFIED`
7. NONE 출처 APPROVED → 0(기존 유지)
8. UNKNOWN(문서 없음) → 이번 달 0 `UNVERIFIED` / 지난달 0 `PAST_UNAPPROVED`, `month.source:'FALLBACK'`
9. **수동 마감이 월말 전**(`closeAt < doc.end`, now 가 그 사이) → 미승인 포함, `locked:true`, `lockReason:'PERIOD_CLOSED'`
10. **재개방**(`closeAt:null`), 지난달 → 0. 기존 테스트 '수동 재개방은 전역 마감일이 지나도 건별 미승인 집계를 허용한다'를 **뒤집는다**(Q5)
11. 9칸 옛 엔트리(전역 `closeAt`) → 잠금만 전역 값을 따르고, 집계는 월 경계를 따른다(기존 '기존9칸 계약은 전역 마감일을 따른다' 수정)
12. 미래 달(`now < doc.start`) → CURRENT
13. 타 작성자 문서만 있어도 월 범위는 DOC 출처로 정해진다(사이트 단일 경계)
14. FALLBACK: `Asia/Seoul` 기준 2026-10-31T15:30Z(=11-01 00:30 KST)는 `2026-11`
15. D1: ZERO 정책 문서에서 승인 + 불일치 행 → `doc.entries` 의 초(min 적용)
16. `approvalBasisOf`: 혼합 행 → 이유별 합·건수, approval 없는 행만 있으면 null
17. `approvedSecondsOf`: 이번 달 PENDING → 0, APPROVED → 승인 초
18. 순수성: 같은 입력에서 결과가 같다. 입력 docs·row 를 변형하지 않는다(freeze 후 호출)

---

## 4. 백엔드 (워크포스)

### 4.1 `ApprovalCertReader.applyWorklogApproval`

- 마지막 map(`:369-376`)에서 `approvalOfWorklog(row, loaded.docs, now)` 결과의 새 칸 3개를 그대로 둔다. 기존처럼 `decidedBy`·`decidedAt`·`requestId` 는 지운다.
- **반환 형태는 바꾸지 않는다**(배열 그대로). 호출부 13곳이 배열을 기대한다. 그래서 집계 기준은 별도 함수로 얻는다.

```js
export const approvalBasisForRows = (rows, now) => approvalBasisOf(rows, now)   // 행에서 currentPeriodKey 는 행 approval 에 실린 now 기준 월로
```

- 문서 없이 행만 보고 이번 달 키를 알 수 있어야 한다. 그래서 `applyWorklogApproval` 이 결과 배열에 **열거 불가 속성** `approvalContext = { currentPeriodKey, timeZoneSource }` 을 붙인다. `Object.defineProperty` 를 쓰므로 JSON 직렬화나 스프레드에서는 사라진다.
  - 이 방식에 기대기 싫으면 `options.onBasis(basis)` 콜백을 받는다. **구현자는 콜백 방식을 쓴다**(명시적이라 테스트하기 쉽다).

### 4.2 원가 `certifyCostRows`(T-W4)

- `approvalLinkMode==='ON'` 분기(`:260-266`)의 행 시간을 `approvalOfWorklog(...).countableSeconds` 에서 `approvedSecondsOf(approvalOfWorklog(...))` 로 바꾼다.
- 반환 `certification` 을 `{ applied: true, approvedOnly: true }` 로 바꾼다.
- `expectedRows`(예상 원가)는 지금처럼 전체 주장 기록이다.
- **이중 적용 주의**: fetcher(`getResourceProjectWorklogs`) 안에서 이미 `applyWorklogApproval` 이 돌아 `timeSpentSeconds` 가 countable 로 바뀐 상태다. 원가는 `claimedSeconds` 를 원천으로 다시 판정한다. 지금 코드도 `claimedSeconds ?? timeSpentSeconds` 를 쓴다. 이 순서를 테스트로 고정한다.

### 4.3 승인 미적용 경로 보강(T-W3)

모두 기존 `ProjectCalendarService.js:110-118` 패턴(평탄화 → `applyWorklogApproval(input,{accountId},{includeHidden:true, selfOnly:true, startDate, endDate, issueIds})` → 이슈별로 되돌림)을 그대로 따른다.

| 경로 | viewer | options | 비고 |
|---|---|---|---|
| a. `getMyCalendarWorklogService` | `{accountId: principal.accountId}` | `includeHidden:true, selfOnly:true` | 본인 기록만. 숨긴 본인 승인분 보충 |
| b. `getProjectWorklogService`·`getMyIssueListService` | 같음 | 같음 | 기존 `withCertBadges` 호출 제거. `certifications` 맵은 이 판에서 빈 객체로 유지하고 다음 판에 제거 |
| c. `getCollabIssueWorklogsService` | `{accountId, cloudId}` | `includeHidden:false`(드로어는 이미 통제분 본인 보충을 함) | `toCollabWorklog` 가 새 칸 통과. `total` 은 행 수 기준 그대로 |
| c'. 사용자 경로 이슈 드로어(`useIssueWorklogs.js` 가 Jira REST 직접) | — | — | 연동 모드(`approvalLinkMode==='ON'`, 이미 프론트가 아는 값)일 때 프론트가 기존 `getCollabIssueWorklogs` 와 같은 형태의 **기존 resolver** 를 부르도록 바꿀 수 있는지 구현자가 확인한다. 안 되면 이 경로는 배지 없음(지금과 같음)으로 두고 보고한다. 새 resolver 는 만들지 않는다 |
| d. `getIssueWorklogDetail` | `{accountId}` | `includeHidden:false` | `cumulativeByDate` 는 countable 로 합산. 행 `hours` 주장값 유지 + `countableHours` |

- 응답의 `approvalBasis` 는 `onBasis` 콜백으로 받아 싣는다. 연동 모드가 아니면 `applyWorklogApproval` 이 즉시 원본을 반환하므로(`:291`) 콜백이 불리지 않고 `approvalBasis:null` 이다.

**포트폴리오 배치(F-5).** 큐 소비자용 진입점 `applyWorklogApprovalForBatch(rows, { cloudId, now })` 를 둔다.
- 하는 일: 사용자 재검증(permissions/check·worklog/list)과 숨김 보충을 건너뛰고, 앱 자격 문서로 `approvalOfWorklog` 만 적용한다.
- 산출물은 집계 숫자뿐이다. 행·설명은 저장하지 않는다.
- 이 진입점은 `PortfolioAggregator` 만 부른다. import 경계 테스트로 고정한다.
- 이유: 지금 코드는 사용자 컨텍스트가 없어 실패할 가능성이 높다(미검증 U-3). 실패하면 프로젝트가 롤업에서 통째로 빠진다.

### 4.4 R4 정합 보정(워크포스 쪽만)

| # | 차이 | 원인 | 보정 |
|---|---|---|---|
| D1 | 삭제 처리 정책이 ZERO 일 때, 승인 후 변경·삭제분이 워크포스에서 더 크게 잡힌다 | 워크포스가 승인 엔트리 e[7](원래 인증 초)를 쓴다. 승인 앱 `countedSeconds` 는 ZERO 면 `min(인증, 현재)`·삭제 0 이다 | §3.2 "승인 초" = `doc.entries.get(id)?.seconds ?? e[7]`. `deletedApprovedRowsOf` 도 같은 값을 쓴다(0 이면 행을 만들지 않음) |
| D2 | 월 경계가 다르다(지금은 `closeAt`) | 규칙 차이 | §3 월 경계(문서 `ps`/`pe`) |
| D3 | 이번 달 숫자: 승인 앱 "기록"은 출처 무관 전체, 워크포스는 정상 출처만 | 설계 차이(10-13 결정) | 바꾸지 않는다. 워크포스 안내 줄의 "확인 중 제외 X시간"으로 차이를 보인다 |
| D4 | 옛 인증(approvalModel≠1)이 승인 앱 "인증 시간"에는 들어가고 워크포스 승인분에는 없다 | 레거시 비승격 결정 | 바꾸지 않는다(Q8) |

### 4.5 캐시

- `ProjectCost:{projectId}`·`ProjectProgress:{projectId}` 키 뒤에 `:{currentPeriodKey}` 를 붙인다. 달이 바뀌는 시점에 TTL(10분)을 기다리지 않고 새로 계산한다.
- 쓰기만 하고 읽지 않는 KVS(`Date:`·`UserDate:`·`ResourceList:`·`ResourceDetail:`)는 이번에 손대지 않는다. §11 후속에 적는다.
- `ApprovalCertReader` 문서 캐시(5분)는 그대로 둔다. 월 판정은 매 호출의 `now` 로 다시 하므로, 문서 캐시가 판정을 낡게 만들지 않는다.

---

## 5. 스키마·마이그레이션

없음. 워크포스·승인 앱 모두 SQL·KVS 키 형식 변경이 없다(캐시 키 접미사만 바뀌고 옛 키는 TTL 로 사라진다).

## 6. Jira 연결

- manifest·scope 변경 없음.
- 새 Jira 호출은 §4.3 a~d 경로의 `applyWorklogApproval` 호출뿐이다. 모두 이미 쓰는 API 다(`permissions/check`·`worklog/list`·`issue/bulkfetch`·`user/properties`).
- 자격 구분은 기존과 같다. 열람 재검증은 asUser, 서명 문서 읽기는 asApp이다. 기존 Q133·불변식 8 예외 6조건을 그대로 쓴다.
- `applyWorklogApprovalForBatch` 는 asApp 문서 읽기만 한다. 사용자에게 행을 돌려주지 않는다.

---

## 7. 프론트 (워크포스 `static/ui`)

### 7.1 컴포넌트

- **`components/worklog/WorklogApprovalBadge.jsx`(확장).**
  - 지금: 상태 Lozenge + "수정 불가" + "통계 제외".
  - 바꿀 것 ①: `lockReason==='PERIOD_CLOSED'` 이면 "수정 불가" 대신 `worklog.approval.status.CLOSED`("기간 마감", 기존 키)를 쓴다.
  - 바꿀 것 ②: 제외 표시는 `approval.excludedReason` 으로 고른다. `PAST_UNAPPROVED` 는 새 키 `worklog.approval.excludedPast`("지난달 미승인 — 통계 제외")를 쓴다. 키가 반영되기 전까지는 기존 `worklog.approval.excluded` 로 폴백한다.
  - 상태 → Lozenge appearance 대응: APPROVED=success, PENDING=inprogress, REJECTED=removed, CHANGED·UNKNOWN=moved, 그 밖=default.
  - prop `compact` 를 추가한다. 표의 좁은 칸에서는 Lozenge 하나만 보이고 나머지 내용은 Tooltip 으로 옮긴다.
- **`components/worklog/WorklogApprovalDot.jsx`(신규).** 캘린더 칩 전용이다.
  - 8px 원 하나를 그린다. 색은 위 appearance 와 같은 토큰을 쓴다(`color.icon.success` 등).
  - 잠김이면 원 대신 잠금 아이콘(`@atlaskit/icon` lock, size small)을 그린다.
  - `role="img"`·`aria-label={상태 문구}` 를 붙인다.
  - 칩의 `title` 은 문자열 툴팁이다. 그 배열(`FullCalendar.jsx:246`)에 상태 문구와 (제외 시) 제외 문구를 덧붙인다.
  - `approval` 이 없으면 아무것도 그리지 않는다(비연동·단독 = 지금과 같음).
  - 제외된 칩은 `opacity: 0.55` 로 흐리게 한다. 시간 문자열(`timeSpent`)은 주장값 그대로 둔다.
- **`components/worklog/ApprovalBasisNote.jsx`(신규).** R3 안내 한 줄이다.
  - `approvalBasis` 가 null 이면 그리지 않는다.
  - 형식: `"{이번 달 키}: 미승인 포함 · 지난달 이전: 승인분만"`. 제외분이 있으면 뒤에 붙인다(`· 제외된 지난달 미승인 {X}시간`, `· 확인 중 {Y}시간`).
  - `Text size="small" color="color.text.subtle"`. testId `approval-basis-note`.
  - 원가 화면에서는 `variant="cost"` 로 "확정 원가: 승인분만"을 표시한다.
- **`components/worklog/worklogSeconds.js`(신규, 순수).**
  - `displaySecondsOf(w) = w.claimedSeconds ?? w.timeSpentSeconds`
  - `countedSecondsOf(w) = w.countableSeconds ?? w.timeSpentSeconds`
  - 칩 길이, 모달 기간 역산, 시간 표시에는 display 를 쓴다. 합계에는 counted 를 쓴다(F-1).
- **`components/worklog/approvalTotals.js`(신규, 순수).** 행 → `{ excludedPastUnapprovedSeconds, … }`. 서버 `approvalBasisOf` 와 같은 규칙이고, 프론트가 합산하는 화면(#2·3·5·22~24)에서 쓴다. `currentPeriodKey` 는 응답 최상위 `approvalBasis` 에서 받는다.

### 7.2 화면별 적용

| 화면 | 배지 | 합계 | 안내 줄 위치 |
|---|---|---|---|
| #1·#6 캘린더 칩 | `WorklogApprovalDot`(칩 키 앞) | — | 캘린더 툴바 아래 1줄 |
| #2 날짜 칸 합계 | — | `countedSecondsOf` | 날짜 칸 `title` 에 제외분 |
| #3 내 작업 KPI | — | counted | KPI 줄 아래 |
| #4·#5 내 작업 표 | `WorklogApprovalBadge compact`(CertBadge 교체) | counted | 표 위 |
| #7 모달 | `WorklogApprovalBadge` 머리 | — | — |
| #8·#9 이슈 패널·드로어 | 기존 AB(이제 데이터 있음) | counted(`useIssueWorklogs.js:56`) | 합계 옆 |
| #10·#11 이슈 분석 | 상세 표 상태 열 | `countableHours` | 패널 머리 |
| #13 리소스 상세 | AB(CertBadge 열 교체) | counted(F-3) | 드로어 머리 |
| #14·15·18·20·21(토폴로지)·26 | — | 서버 | 각 페이지/위젯 머리 1곳 |
| #16 원가 | — | 서버(승인분만) | `CostCertBasis` 안 `variant="cost"` |
| #22~24 마이페이지 | 패널 목록 상태 열 | counted | 패널 머리 1곳(KPI·차트 공용) |

### 7.3 쿼리키

새 키는 없다. 응답 형태가 가산 필드만 늘어나므로 기존 키를 그대로 쓴다. 다만 이번 달 키가 바뀌면 숫자가 달라지므로 staleTime 은 바꾸지 않는다(서버 판정).

---

## 8. i18n 키 (워크포스 — **직접 수정 금지, 사용자 반영용 목록**)

원천 파일은 WF:`locales/kr/worklog.json`·`locales/en/worklog.json` 이다. merge 결과가 `ko-KR.json`·`en-US.json` 이다. 사용자가 locales 를 수정 중이라 반영 방법을 사용자에게 묻는다.

| 키 | ko | en |
|---|---|---|
| `worklog.approval.basis.line` | `{month}: 미승인 포함 · 지난달 이전: 승인분만` | `{month}: includes unapproved · Earlier months: approved only` |
| `worklog.approval.basis.excludedPast` | `제외된 지난달 미승인 {hours}시간` | `{hours}h unapproved from past months excluded` |
| `worklog.approval.basis.excludedUnverified` | `확인 중 {hours}시간 제외` | `{hours}h pending verification excluded` |
| `worklog.approval.basis.cost` | `확정 원가: 승인된 기록만 · 예상 원가: 전체 기록` | `Confirmed cost: approved entries only · Expected cost: all entries` |
| `worklog.approval.excludedPast` | `지난달 미승인 — 통계 제외` | `Unapproved (past month) — excluded` |
| `worklog.approval.dotLabel` | `승인 상태: {status}` | `Approval status: {status}` |

- 키가 반영되기 전에도 화면이 깨지지 않아야 한다. 컴포넌트는 `t()` 결과가 키 그대로 돌아오면 다음처럼 폴백한다. 이 폴백 동작은 테스트로 고정한다.
  - `excludedPast`·`excludedUnverified` 는 기존 `worklog.approval.excluded` + 시간 숫자로 대신한다.
  - `basis.line` 이 없으면 안내 줄 자체를 그리지 않는다.
- 기존 재사용 키: `worklog.approval.status.*`(CLOSED 포함), `worklog.approval.locked`, `worklog.approval.excluded`.

---

## 9. 용량·호출량

| 항목 | 지금 | 이후 |
|---|---|---|
| SQL(워크포스·승인 앱) | 0 | 0 |
| 유휴 SQL·스케줄 | — | 추가 없음(새 트리거 없음) |
| 이미 승인 적용된 경로(캘린더·대시보드·리소스·원가·진척·관계도) | — | Jira 호출 **+0**(같은 문서·같은 행으로 판정만 바뀜) |
| 내 작업 캘린더 1회(월, 내 이슈 N, 워크로그 W) | 검색 + 이슈별 추가 조회 | + ⌈N/100⌉ permissions/check + ⌈W/1000⌉ worklog/list + 키 목록 1 + 문서 ≤3(5분 캐시) + 숨김 보충(permissions/check ⌈N/100⌉ + bulkfetch ⌈N/100⌉ + worklog/list ≤1) ≈ **N≤100 일 때 +7, 캐시 적중 시 +4** |
| 내 작업 표·대체 경로 | `withCertBadges`(키 1 + 문서) | 위와 같은 규모. `withCertBadges` 를 없애 약 1~3회 상쇄 |
| 협업 드로어 1회(이슈 1, ≤100건) | 1 | + permissions/check 1 + worklog/list 1 + 작성자별 키 목록(≤작성자 수, 상한 300) + 문서 → 작성자 5명이면 **약 +12**, 캐시 적중 시 +2 |
| 이슈 분석 상세 1회 | 1~2 | 드로어와 같은 규모 |
| 포트폴리오 배치 | 실패 가능(F-5) | 앱 문서 읽기만(사용자 재검증 없음) → 프로젝트당 작성자 수 + 문서 수, 5분 캐시 공유 |
| 200명 기준 저장량 | 0 | 0 |

N+1 은 없다. 이슈·워크로그는 각각 100·1000 단위 일괄 API 를 쓴다(기존 함수).

## 10. 미검증

| # | 항목 | 영향 | 확인 방법 |
|---|---|---|---|
| U-1 | 승인 앱 인증 문서 게시 지연(쓰기 → `publishCertNow` → 프로퍼티 반영) 실측 | Q2 기본값에서 방금 쓴 기록이 "확인 중"으로 보이는 시간 | 개발 사이트에서 승인 앱으로 기록 → 워크포스 캘린더 새로고침까지 배지가 바뀌는 시간 측정(워크포스 캐시 5분 포함) |
| U-2 | 사용자 경로 이슈 드로어(c')가 프론트 Jira REST 대신 기존 resolver 를 쓸 수 있는가 | #8·9 배지 데이터 | 구현자가 `useIssueWorklogs.js` 분기와 `getCollabIssueWorklogs` 권한 축을 대조한다. 협업 권한이 없는 프로젝트 구성원에게 막히면 배지 없음으로 둔다 |
| U-3 | 큐 소비자(사용자 없음)에서 asUser 호출이 실패하는가 | F-5 심각도 | 개발 사이트에서 연동 ON → 포트폴리오 재집계 → 스냅숏에서 프로젝트 누락 여부 확인(DB·화면 결과로, `forge logs` 는 늦음) |
| U-4 | 문서 `ps`/`pe` 가 DST 타임존에서도 달력 월 경계와 같은가 | 월 경계 | 승인 앱 `periodRange` 단위 테스트가 이미 다룬다(코드). 워크포스는 받은 값을 그대로 쓰므로 영향 없음. 확인만 |

## 11. 작업 분해

### 워크포스 백엔드 (T-W)

- [ ] **T-W1** `worklogApproval.js`: `approvalMonthOf`·`countBasisOf`·`approvalBasisOf`·`approvedSecondsOf`, `approvalOfWorklog` 규칙 교체(§3.2), D1 승인 초. 테스트 §3.4 1~18
- [ ] **T-W2** `ApprovalCertReader.applyWorklogApproval`: 새 칸 통과, `onBasis` 콜백. `deletedApprovedRowsOf` D1. 테스트: `WorklogApprovalAggregate.test.js` 확장(지난달 미승인 0·이번 달 포함·onBasis 합계)
- [ ] **T-W3** 승인 미적용 경로 4곳(a·b·c·d) 적용 + 응답 `approvalBasis`. 테스트: 경로별 1개(연동 OFF 이면 응답이 이전과 바이트 동일, ON 이면 `approval` 칸 존재·`timeSpentSeconds`=countable·`claimedSeconds`=원래 값)
- [ ] **T-W4** `certifyCostRows` 승인분만 + `approvedOnly`. 테스트: 이번 달 PENDING 이 확정 원가 0·예상 원가 포함
- [ ] **T-W5** 집계 응답 `approvalBasis` 추가(대시보드·리소스 목록/상세·원가·진척·포트폴리오 스냅숏). `CollabDto.toCollabWorklog` 새 칸 통과
- [ ] **T-W6** 진척·포트폴리오 `actualTotalMd`(연동 ON)를 이미 가져온 승인 적용 행 합계로(Q6 a). 연동 OFF 는 지금처럼 timetracking
- [ ] **T-W7** `applyWorklogApprovalForBatch` + `PortfolioAggregator` 전환(F-5). import 경계 테스트(다른 resolver 가 부르지 않음)
- [ ] **T-W8** 캐시 키 `:{currentPeriodKey}`(원가·진척)
- [ ] **T-W9** `downloadMyWorklogExcel`: 선택 칸 `countableSeconds`·`approvalStatus` 수용, 합계는 counted

### 워크포스 프론트 (T-F)

- [ ] **T-F1** `worklogSeconds.js`·`approvalTotals.js`·`WorklogApprovalDot.jsx`·`ApprovalBasisNote.jsx`, `WorklogApprovalBadge` 확장(`compact`, CLOSED, excludedReason, 키 폴백)
- [ ] **T-F2** `FullCalendar`(점, 표시/집계 초 분리, title 문구), `WorklogModal`(기간 역산 display 초, 머리 배지) — F-1
- [ ] **T-F3** `MyIssueTable`·`ResourceAnalysisChart` CertBadge → AB, 합계 counted(F-3)
- [ ] **T-F4** `WorklogDetailPanel`·`IssueAnalysisChart`·`useIssueWorklogs`(c' 가능 시)
- [ ] **T-F5** 마이페이지 패널 상태 열·합계·엑셀 페이로드, KPI·차트 counted
- [ ] **T-F6** 안내 줄 배치(§7.2 표의 각 위치), 원가 `variant="cost"`
- [ ] **T-F7** 테스트: 비연동(approval 없음)이면 배지·안내 줄 없음·숫자 불변 / 연동이면 제외 칩 흐림·길이 = 주장 초 / 키 미반영 폴백 / `linkedNoDirectWrite` 등 기존 계약 테스트 통과

### 승인 앱 (T-A)

- [ ] **T-A1**(테스트만) 승인 앱 `periodRange(periodKey,{timeZone})` 가 인증 문서 `ps`/`pe` 로 게시되는지 고정하는 대조 테스트를 확인한다. 이미 있으면 생략한다. 코드 변경은 0이다.

### 후속(이번 범위 밖)

- timetracking 기반 지표(Q6 b), 워크로그 내보내기 서버화(Q7)
- 조회자 무관 캐시 키(F-6)·쓰기 전용 KVS 정리

### 검증 순서

워크포스 `npm test`(백엔드) → `static/ui` 테스트 → `check:bundle`·`build:ui` → `forge lint`. 커밋·배포는 하지 않는다.

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-10-14 | 초판 | 요구서 R1~R4 |
