# workforce-approval-display — 워크포스 구현 보고 (T-W1~W9, T-F1~F7)

> 작성 2026-10-14 · 대상 리포 `C:\CloudJira\moves-workforce`(RFC-220 03bdfa8 + 미커밋 작업 트리 위에 이어서) · 승인 앱 리포는 읽기만 함
> 입력: `01_architect_design.md`, `00_input/requirement.md` 끝의 "열린 질문 답"(Q2·Q3·Q4 최종 결정 반영)
> 커밋·forge deploy·tunnel 없음. 새 SQL·manifest·scope 변경 없음.

## 1. 결과 요약

- 월 경계 규칙을 순수 함수 `approvalOfWorklog`에 넣었다. 승인분은 달과 관계없이 포함한다. 이번 달(또는 미래 달)은 정상 출처이고 내용이 바뀌지 않았으며 상태가 UNSUBMITTED·PENDING인 기록만 포함한다. 반려·만료·취소는 이번 달에도 바로 뺀다(Q4). 문서에 없는 기록은 빼고 "확인 중"으로 표시한다(Q2). 지난달은 승인분만 센다. `closeAt`은 잠금 판정에만 쓴다.
- 확정 원가는 승인분만 센다(Q3). 예상 원가에는 이번 달 미승인분을 넣는다.
- 승인 판정이 빠져 있던 서버 경로 4곳을 연결했다. 내 캘린더, 내 작업 표·대체 경로, 협업 드로어, 이슈 분석 상세다.
- 집계 응답에 `approvalBasis`를 실었다. 화면은 공용 안내 줄 `ApprovalBasisNote` 하나로 보여 준다.
- 표시용 초와 집계용 초를 나눴다(F-1). 이제 제외된 기록이 길이 0 블록이 되지 않는다.
- 배지는 `WorklogApprovalBadge` 하나로 통일했다. 캘린더 칩에는 축약형 `WorklogApprovalDot`를 쓴다. `CertBadge`는 화면에서 더 쓰지 않는다.
- 원가 D1 결함을 고쳤다. 삭제 정책이 ZERO여서 서명된 인증 초가 0이면 그 기록을 보충하지 않는다. 승인 초는 서명 목록 값을 우선한다.
- 진척·포트폴리오 응답 안의 숫자 혼재를 고쳤다(Q6 a). 연동 모드에서는 총 실적도 승인 규칙 합계를 쓴다.
- 포트폴리오 배치에는 전용 진입점 `applyWorklogApprovalForBatch`를 두었다(F-5). import 경계는 테스트로 고정했다.
- 번역 키 6개를 원천 파일과 산출물 2개에 최소 삽입했다. 사용자가 이미 바꾼 줄은 한 줄도 바뀌지 않았다.

## 2. 바뀐 파일

### 백엔드 (`C:\CloudJira\moves-workforce\src`)
| 파일 | 내용 |
|---|---|
| `integration/approval/worklogApproval.js` | T-W1: `CountBasis`·`ExcludedReason`·`FALLBACK_APPROVAL_TIME_ZONE` 추가. 함수 `approvalMonthOf`·`countBasisOf`·`currentApprovalPeriodKey`·`approvalBasisOf`·`approvedSecondsOf`·`rescopeApprovalBasis`·`mergeApprovalBases` 추가. `approvalOfWorklog` 규칙을 바꾸고 D1을 반영 |
| `integration/approval/__test__/worklogApproval.test.js` | 진리표 테스트(설계 §3.4의 1~18에 Q4 반영) |
| `resolver/approvalLink/ApprovalCertReader.js` | T-W2: `onBasis` 콜백과 공용 판정 함수 `judgeRows`. `deletedApprovedRowsOf`에 D1 적용(인증 초가 0이면 보충하지 않음). T-W4: `certifyCostRows` 확정분을 `approvedSecondsOf`로 계산하고 `approvedOnly`·`approvalBasis` 반환. T-W7: `applyWorklogApprovalForBatch` 추가 |
| `resolver/approvalLink/__test__/WorklogApprovalAggregate.test.js` | D1, 월 경계(이번 달 포함·다음 달 제외), 반려 즉시 제외, 원가 승인분만, 원가가 `claimedSeconds`로 다시 판정하는지, 배치 진입점(asUser 호출 0) |
| `resolver/approvalLink/__test__/ApprovalDisplayPaths.test.js` (신규) | T-W3 경로별 ON/OFF 비교(OFF면 응답이 바이트 단위로 같음), 배치 진입점 import 경계 |
| `resolver/myWork/MyWorkService.jsx`, `MyWorkController.jsx` | T-W3 a·b: `withIssueApproval`(평탄화 → 판정 → 되돌림), `withCertBadges` 제거, 연동 시 `certifications: {}`를 한 판 동안 유지, viewer 전달 |
| `resolver/projectCollab/CollabIssueWorklogService.js` | T-W3 c: 드로어 판정, `approvalBasis`, 재검증에서 빠진 행은 `total`에서도 뺌 |
| `resolver/projectCollab/__test__/CollabWorklogServices.test.js` | 드로어 연동 ON 테스트 |
| `resolver/issueAnalysis/IssueAnalysisService.js` | T-W3 d: 행 `hours`는 주장값 그대로. `countableHours`·`countableMd`·`approval` 추가, 누적선은 집계 시간 |
| `resolver/projectCalendar/ProjectCalendarService.js`, `resolver/projectCollab/CollabCalendarService.js` | 최상위 `approvalBasis` |
| `resolver/utils/worklog/WorklogService.js`, `api/jira/worklog/CollabWorklogFetcher.js`, `resolver/projectDashboard/ProjectDashboardService.js` | T-W5: 대시보드 위젯 `chartData.approvalBasis`(작성자 필터 뒤 행 범위로 다시 계산) |
| `resolver/projectDashboard/RelationGraphService.js` | 토폴로지 응답 `approvalBasis` |
| `resolver/resourceAnalysis/ResourceWorklogFetcher.js` | `onBasis`, 배치 판정 주입용 `applyApproval` |
| `resolver/resourceAnalysis/ResourceAnalysisService.js` (+ `__test__/ResourceAnalysisDenominator.test.js`) | 목록·상세 `approvalBasis`, 상세 `logs[].countableHours` |
| `resolver/projectCost/ProjectCostService.js` | T-W8: 캐시 키 `ProjectCost:{id}:{YYYY-MM}`, `approvalBasis`(캐시 밖) |
| `resolver/projectProgress/ProjectProgressService.js`, `ProgressCalculator.js` | T-W6·T-W8: 캐시 키 접미사. 연동 시 `effort.actualTotalMd`와 `issues[].actualMd`를 승인 규칙 합계로(`withApprovedActual`·`worklogSecondsByIssueKey`) |
| `resolver/portfolioDashboard/PortfolioAggregator.js`, `PortfolioDashboardService.js` | T-W6·T-W7: 배치 전용 진입점, `actualTotalMd`, 롤업 메타 `approvalBasisByProject`. 조회 시 조회자 범위 프로젝트만 합침 |
| `resolver/project/ProjectDeletionWorker.js` | 진척·원가 캐시를 지울 때 옛 키와 이번 달 키를 함께 지움(키 접미사 도입으로 생기는 누락 방지) |
| `resolver/myPage/MyPageService.jsx` (+ `__test__/MyPageService.test.js`) | T-W9: `countableSeconds`·`approvalStatus` 칸을 받으면 합계를 집계 시간으로 계산하고 상태·집계 시간 열 추가. 칸이 없으면 지금과 같음 |

### 프론트 (`C:\CloudJira\moves-workforce\static\ui\src`)
| 파일 | 내용 |
|---|---|
| `components/worklog/worklogSeconds.js` (신규) | `displaySecondsOf`·`countedSecondsOf` |
| `components/worklog/approvalTotals.js` (신규) | `approvalTotalsOf`·`approvalBasisOfRows`·`worklogsOfIssues` |
| `components/worklog/approvalView.js` (신규) | 상태별 appearance·점 색 토큰, 키가 없을 때 폴백(`tOrNull`), 잠금·제외 문구 |
| `components/worklog/WorklogApprovalBadge.jsx` | `compact`, 기간 마감이면 CLOSED, `excludedReason`별 문구, 키 폴백 |
| `components/worklog/WorklogApprovalDot.jsx` (신규) | 8px 점, 잠긴 기록은 잠금 아이콘, `role="img"`·`aria-label` |
| `components/worklog/ApprovalBasisNote.jsx` (신규) | 안내 한 줄, `variant="cost"`, `approvalBasisTextOf` 함수 공개 |
| `components/worklog/__test__/approvalDisplay.test.jsx` (신규) | T-F7 |
| `components/calendar/FullCalendar.jsx` | 점 배지, 칩 길이는 표시 초, 날짜 칸 합계는 집계 초, 제외분은 툴팁, 제외 칩은 흐리게 |
| `pages/myWork/WorklogPage.jsx`, `pages/projectDetail/calender/ProjectCalender.jsx` | 여러 날 블록은 표시 초 기준, 안내 줄 |
| `pages/myWork/modal/WorklogModal.jsx`, `modal/worklogTimeRange.js` | 기간 역산·시간 범위는 표시 초, 머리에 배지 |
| `pages/myWork/utils/useMyWorklogSummary.js` | KPI는 집계 초 |
| `pages/myWork/table/MyIssueTable.jsx` | CertBadge를 `WorklogApprovalBadge compact`로 교체, 이슈 합계는 집계 초, 안내 줄 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisChart.jsx` | CertBadge를 배지로 교체(열 머리 `worklog.worklogTable.status`), 머리 합계는 집계 초(F-3), 안내 줄 |
| `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js`, `ResourceAnalysisPage.jsx`, `team/ProjectTeamAnalysisPage.jsx` | `approvalBasis`를 넘기고 안내 줄 |
| `pages/projectDetail/analysisReport/issue/WorklogDetailPanel.jsx` | 상태 열, 합계 `countableHours`, 안내 줄 |
| `pages/projectDetail/work/useIssueWorklogs.js`, `TreeDetailPanel.jsx`, `map/MapWorklogTab.jsx` | 합계는 집계 초, 협업 경로 `approvalBasis`와 안내 줄 |
| `pages/projectDetail/cost/CostCertBasis.jsx`, `CostPage.jsx` | `variant="cost"` 안내. `approvedOnly`이면 옛 인증 요약 문구(값 없는 0h 표시)를 숨김 |
| `pages/projectDetail/progress/ProgressPage.jsx` | 안내 줄 |
| `pages/projectDetail/dashboard/ChartTemplate.js` | 워크로그 위젯·토폴로지 캡션에 안내 |
| `pages/portfolio/PortfolioDashboardPage.jsx` | 상단 안내 줄 |
| `pages/myPage/MyPage.jsx`, `hooks/useMyPageWorklogs.js`, `hooks/useMyContribution.js`, `sections/MyWorklogPanel.jsx` | 합계는 집계 초. 행 표시는 원래 초. 상태 열, 엑셀 선택 칸, KPI 아래 안내 줄 |
| `pages/myPage/hooks/__test__/useMyContributionApproval.test.js` (신규) | T-F7 |

### locales
`locales/kr/worklog.json`, `locales/en/worklog.json`, `locales/ko-KR.json`, `locales/en-US.json` — 처리 내역은 §6에 적었다.

## 3. 진리표 (`approvalOfWorklog`, Q2·Q4 반영)

판정 순서는 다음과 같다.
1. 엔트리를 찾는다. 찾는 방법은 지금과 같다.
2. `month = approvalMonthOf(started)`로 승인 월을 정한다. 그 시각을 덮는 문서가 있으면 그 문서의 ps/pe를 쓰고, 작성자는 따지지 않는다. 덮는 문서가 없으면 Asia/Seoul 달력 월을 쓴다.
3. `basis`를 정한다. DOC 출처는 `now ≥ end`이면 PAST, FALLBACK 출처는 지금 월 키가 더 크면 PAST다.
4. 아래 표를 적용한다.

| 상태(엔트리) | normalOrigin | 지문 일치 | CURRENT(이번·미래 달) | PAST(지난달) | excludedReason |
|---|---|---|---|---|---|
| APPROVED | ✓ | ✓ | 승인 초 | 승인 초 | null |
| APPROVED(→ 표시 `CHANGED`) | ✓ | ✗ | 승인 초 | 승인 초 | null |
| APPROVED | ✗ | — | 0 | 0 | CURRENT `UNVERIFIED` / PAST `PAST_UNAPPROVED` |
| **UNSUBMITTED·PENDING** | ✓ | ✓ | **엔트리 초** | 0 | CURRENT null / PAST `PAST_UNAPPROVED` |
| **REJECTED·EXPIRED·CANCELLED(·CANCELED)** | ✓ | ✓ | **0 (Q4)** | 0 | CURRENT **`REJECTED`**(신규) / PAST `PAST_UNAPPROVED` |
| 그 밖의 미승인 상태(NEEDS_APPROVER 등) | ✓ | ✓ | 0 | 0 | CURRENT `UNVERIFIED` / PAST `PAST_UNAPPROVED` |
| 미승인(→ 표시 `CHANGED`) | ✓ | ✗ | 0 | 0 | CURRENT `UNVERIFIED` / PAST `PAST_UNAPPROVED` |
| 미승인 | ✗ | — | 0 | 0 | CURRENT `UNVERIFIED` / PAST `PAST_UNAPPROVED` |
| UNKNOWN(문서 없음·문서에 없음·잘림) | — | — | **0 (Q2, "확인 중")** | 0 | CURRENT `UNVERIFIED` / PAST `PAST_UNAPPROVED` |
| 승인 후 삭제 보충 행 | ✓ | ✓ | 승인 초(D1, 0이면 행을 만들지 않음) | 승인 초 | null |

- **승인 초**는 `doc.entries.get(id).seconds`(서명된 인증 목록 값, KEEP/ZERO 적용)를 먼저 쓴다. 없으면 엔트리의 e[7]을 쓴다.
- **잠금**은 `locked = approved || closed`, `lockReason ∈ {APPROVED, PERIOD_CLOSED, null}`이다. 집계에는 쓰지 않는다. 그래서 수동 마감이 월말보다 일러도 이번 달 PENDING은 포함된다. 재개방된 지난달은 승인분만 센다(Q5).
- **원가**: `approvedSecondsOf(approval)`는 `lockReason === 'APPROVED' && normalOrigin`일 때만 승인 초이고, 그 밖에는 0이다.
- 테스트 25건(§3.4의 1~18 + Q4 3건 + 출처 4건)이 모두 통과했다.

## 4. `approvalBasis` 실제 shape

```text
approvalBasis: {
  currentPeriodKey: 'YYYY-MM',            // now 를 덮는 문서 ps/pe, 없으면 Asia/Seoul
  timeZoneSource: 'DOC' | 'FALLBACK',
  excludedPastUnapprovedSeconds: number,  // 주장 초(claimedSeconds) 합
  excludedPastUnapprovedCount: number,
  excludedUnverifiedSeconds: number,
  excludedUnverifiedCount: number,
  excludedRejectedSeconds: number,        // 설계 대비 추가(Q4)
  excludedRejectedCount: number,
}
```
- 행 `approval`에는 기존 칸 외에 `basis`('CURRENT'|'PAST')·`periodKey`·`excludedReason`(null|'PAST_UNAPPROVED'|'UNVERIFIED'|'REJECTED')·`lockReason`(UNKNOWN일 때 null)이 붙는다. `decidedBy`·`decidedAt`·`requestId`는 지금처럼 지운다.
- 연동 모드가 아니면 응답에 **키 자체가 없다**(설계는 `null`이었다. §8 참고). 연동 모드인데 행이 없으면 제외 합계가 0인 안내가 실린다.

| resolver | 위치 |
|---|---|
| `getMyCalendarWorklog`·`getProjectWorklog`·`getMyIssueList` | 최상위 `approvalBasis`. `getProjectWorklog`에는 `certifications: {}`도 함께 실음 |
| `getProjectCalendarWorklog`·`getCollabCalendarWorklog` | 최상위 |
| `getCollabIssueWorklogs` | `content.approvalBasis` |
| `getIssueWorklogDetail` | 최상위 |
| `getChartData(ById)` (heatmap·lineStack) | `chartData.approvalBasis` |
| `getProjectRelationGraph` | 최상위(연동 ON) |
| `getResourceAnalysisList`·`getResourceWorklogDetail` | 최상위 |
| `getProjectCostSummary` | 최상위(캐시 밖), `certification = {applied:true, approvedOnly:true}` |
| `getProjectProgressSummary` | 최상위(캐시 밖) |
| `getPortfolioDashboard` | 최상위. 롤업 메타 `approvalBasisByProject` 중 조회자 범위 프로젝트만 합침 |

## 5. 화면별 적용 결과 (설계 §1.2 번호)

| # | 화면 | 배지 | 합계 | 안내 줄 | 결과 |
|---|---|---|---|---|---|
| 1 | 내 작업 캘린더 칩 | Dot | — | 캘린더 안내 행 | 적용. 칩 길이는 표시 초, 제외 칩은 흐리게 |
| 2 | 날짜 칸 합계 | — | 집계 초 | 칸 `title`에 제외분 | 적용 |
| 3 | 내 작업 KPI | — | 집계 초 | #1과 같은 줄(아래 설계와 다른 점 참고) | 적용 |
| 4·5 | 내 작업 표 | Badge compact | 집계 초 | 표 위 | 적용 |
| 6 | 프로젝트·협업 캘린더 | Dot | 집계 초 | 필터 바 아래(필터된 행으로 다시 계산) | 적용 |
| 7 | 워크로그 모달 | Badge 머리 | — | — | 적용. 기간 역산과 시간 범위는 표시 초 |
| 8·9 | 이슈 트리 패널·맵 드로어 | 기존 Badge | 집계 초 | 목록 위 | **협업 경로만** 적용. 본인 경로는 미적용(§9 U-2) |
| 10·11 | 이슈 분석 상세·누적 | Badge 열 | `countableHours`·누적 countable | 패널 머리 | 적용 |
| 13 | 리소스 상세 드로어 | Badge 열(CertBadge 교체) | 집계 초(F-3) | 탭 위 | 적용 |
| 14·15 | 리소스 분석·팀 분석 | — | 서버 | 필터 영역 아래 | 적용 |
| 16 | 원가 | — | 확정 = 승인분만 | `variant="cost"` | 적용. approvedOnly이면 옛 인증 문구 숨김 |
| 18 | 진척 | — | 서버(총계도 승인 규칙) | 가이드 아래 | 적용 |
| 20·21 | 대시보드 워크로그 위젯·토폴로지 | — | 서버 | 위젯 캡션 | 적용 |
| 22~24 | 마이페이지 패널·KPI·차트 | Badge 열(평면 목록) | 집계 초 | KPI 아래 | 적용. 엑셀에 상태·집계 시간 열 |
| 26 | 포트폴리오 | — | 배치 | 헤더 아래 | 적용(배치 시점 기준) |
| 12·19·25·27~30 | timetracking 지표·내보내기 | — | — | — | 범위 밖(Q6 b·Q7) |

비연동 화면(행에 `approval` 없음, 응답에 `approvalBasis` 없음)은 배지·점·안내 줄이 그려지지 않고 숫자도 바뀌지 않는다. 테스트로 고정했다.

## 6. locales 처리 내역

- 작업 전 상태(`git diff --stat locales/`)는 `en-US.json` +37/−2, `ko-KR.json` +37/−2였다. 원천 파일(`locales/kr|en/*.json`)에는 변경이 없었다.
- **확인한 사실**: 사용자가 바꾼 산출물 내용은 원천 파일에 이미 있다(커밋된 원천을 아직 merge하지 않은 상태). 지금 원천으로 merge를 모사해 보니 산출물과 바이트 단위로 같았다(스크래치 스크립트, 파일 쓰기 없음).
- **처리**: 그래도 merge는 실행하지 않았다. 원천 2개와 산출물 2개에 새 키만 텍스트로 삽입했다. 위치는 `worklog.approval`의 `"locked"` 줄 **뒤**, `"excluded"` 줄 **앞**이다. `"excluded"` 뒤에 붙이면 사용자가 추가한 그 줄에 쉼표가 생기므로 이 위치를 골랐다. 파일마다 8줄이 늘었다.
- 추가한 키(6개):

| 키 | ko | en |
|---|---|---|
| `worklog.approval.excludedPast` | 지난달 미승인 — 통계 제외 | Unapproved (past month) — excluded |
| `worklog.approval.dotLabel` | 승인 상태: {status} | Approval status: {status} |
| `worklog.approval.basis.line` | {month}: 미승인 포함 · 지난달 이전: 승인분만 | {month}: includes unapproved · Earlier months: approved only |
| `worklog.approval.basis.excludedPast` | 제외된 지난달 미승인 {hours}시간 | {hours}h unapproved from past months excluded |
| `worklog.approval.basis.excludedUnverified` | 확인 중 {hours}시간 제외 | {hours}h pending verification excluded |
| `worklog.approval.basis.cost` | 확정 원가: 승인된 기록만 · 예상 원가: **이번 달 미승인 포함** | Confirmed cost: approved entries only · Expected cost: **includes this month's unapproved** |

- 작업 후 상태는 `en-US.json`·`ko-KR.json` 각각 +45/−2, `kr/worklog.json`·`en/worklog.json` 각각 +8이다.
- 보존 검증: 작업 전 사용자 diff의 변경 줄 78개가 작업 후 diff에 **모두 그대로** 있다(누락 0). 새로 생긴 변경 줄은 파일마다 8줄로 내 삽입뿐이다. 산출물은 여전히 merge(원천) 결과와 같다. 그래서 나중에 `npm run merge`를 돌려도 결과가 바뀌지 않는다.
- 빌드는 `CI=true npm run build:app` + `npm run bundle:check`로 했다(prebuild merge 미실행).

## 7. 테스트·빌드 결과

| 항목 | 결과 |
|---|---|
| 백엔드 `npx jest`(루트) | **181 suites / 2791 tests 통과** |
| 프론트 `npx jest`(static/ui) | **169 suites / 2684 tests 통과** |
| `CI=true npm run build:app` | 성공(경고로 인한 실패 없음) |
| `npm run bundle:check` | main.js gzip 495,737B, 예산 950,000B 안 |
| `forge lint`(app root `/c/CloudJira/moves-workforce`) | No issues found. PermissionLinter가 "Unknown product" 경고를 낸다. 이번 작업은 manifest를 바꾸지 않았으므로 원인은 이번 작업 밖이다(이전부터 있었는지는 확인하지 않음) |

## 8. 설계와 다른 점

1. **Q4를 반영했다(사용자 결정).** 이번 달 REJECTED·EXPIRED·CANCELLED는 0으로 세고 `excludedReason: 'REJECTED'`를 붙인다. `approvalBasis`에도 `excludedRejected*` 두 칸을 더했다. 안내 줄에서는 새 키 없이 기존 키로 "반려됨: 통계 제외 Xh"를 조립했다. 원래 6개 키 범위를 지키려는 선택이며, 전용 키 1개를 추가하는 것을 권한다.
2. 이번 달에 포함하는 미승인 상태는 **UNSUBMITTED·PENDING만**이다(지시대로). NEEDS_APPROVER·APPEAL_PENDING·PROCESSING처럼 승인 앱이 낼 수 있는 다른 진행 상태도 0이 되고 `UNVERIFIED`("확인 중")로 분류된다. 승인 앱 `WorkforcePublisher`가 실제로 이런 상태를 엔트리에 싣는지는 확인하지 않았다. 싣는다면 포함 집합을 넓힐지 결정이 필요하다.
3. **예상 원가의 의미를 바로잡았다.** `expectedRows`는 페처의 `applyWorklogApproval` 결과다. 따라서 "전체 기록"이 아니라 "승인분 + 이번 달 결정 전 기록"이다(Q3 "이번 달 미승인 = 예상 원가"와 같다). 그래서 `basis.cost` 문구를 "예상 원가: 전체 기록"에서 "이번 달 미승인 포함"으로 바꿨다.
4. 비연동이면 `approvalBasis`가 `null`이 아니라 **키 자체가 없다**. 설계의 "OFF면 응답이 바이트 단위로 같다" 조건을 지키기 위해서다. 프론트는 `?.approvalBasis`로 읽으므로 동작은 같다.
5. 포트폴리오의 `approvalBasis`는 스냅숏 테이블에 칸이 없다(새 SQL 금지). 그래서 KVS 롤업 메타의 `approvalBasisByProject`에 두었다. 조회할 때 MEMBER_ONLY 범위 프로젝트만 합쳐서, 범위 밖 숫자가 드러나지 않게 했다.
6. 프론트 공용 판정 함수 `approvalOfWorklog`의 시그니처는 그대로다(4번째 인자는 선택). 서버 `applyWorklogApproval`의 반환 형태도 배열 그대로이고, 안내는 `onBasis` 콜백으로만 받는다(설계 §4.1 권고).
7. #3 KPI 안내 줄은 캘린더 안내 행에 함께 두었다. `WorklogPage`의 상단 높이 상수(127px)를 바꾸지 않기 위해서다.
8. 엑셀 집계 시간 열 머리에 맞는 키가 없어 `Σ {myPage.export.hours}`로 조립했다. 상태 열 머리는 `worklog.worklogTable.status`를 쓴다. 이 둘에도 전용 키를 두는 것을 권한다.
9. 원가 화면에서 `approvedOnly`이면 옛 `CostCertNotice`를 숨겼다. 이 문구는 연동 모드에서 값이 없어 "인증 0h / 제외 0h"로 잘못 보였다.
10. 캐시 키에 접미사를 붙이면서 `ProjectDeletionWorker` 캐시 정리도 함께 고쳤다. 옛 키와 이번 달 키를 모두 지운다.
11. 원가는 페처가 이미 바꾼 `timeSpentSeconds`가 아니라 `claimedSeconds`로 다시 판정한다. 이중 적용 문제를 테스트로 고정했다.

## 9. 미검증·위험

| # | 항목 | 내용 |
|---|---|---|
| U-1 | 게시 지연 | 방금 쓴 기록은 승인 앱 문서에 실릴 때까지 "확인 중"으로 0이다(Q2). 실측하지 않았다 |
| U-2 | 본인 경로 이슈 드로어(c') | `getCollabIssueWorklogs`는 `assertCollabReadAccess`(협업 ON·참여자)를 요구한다. 그래서 일반 프로젝트에서는 본인 경로로 쓸 수 없다. 새 resolver 금지 조건에 따라 **배지 없음**으로 두었다(지금과 같다). 합계는 `timeSpentSeconds` 원본이다 |
| U-3 | 포트폴리오 배치 | 전용 진입점으로 asUser 호출을 없앴지만 실사이트 재집계는 확인하지 않았다. 배치 안내 숫자는 배치 시점 기준이라 월이 바뀐 직후 다음 배치까지 낡아 있다 |
| R-1 | 행 유실 위험(기존 동작 확장) | `applyWorklogApproval`은 asUser `permissions/check`·`worklog/list` 재검증에서 빠진 행을 **버린다**. 이 동작이 내 캘린더·내 작업 표·협업 드로어·이슈 분석으로 넓어졌다. Jira 응답이 비면(오류가 아니라 빈 값이면) 연동 모드에서 목록이 비어 보일 수 있다. 협업 드로어는 조회자에게 Jira 열람 권한이 없으면(협업 모드의 전제) 행이 빠진다. 협업 캘린더는 이미 같은 동작이었다. 실사이트에서 확인해야 한다 |
| R-2 | 호출량 | 설계 §9 추정대로 내 캘린더·표·드로어·이슈 분석 1회마다 Jira 호출이 4~12회 늘어난다. 실측하지 않았다 |
| R-3 | `getMyIssueList` 대체 경로 | 프론트가 20건을 넘는 워크로그를 따로 Jira REST로 읽는 경로가 있다면, 그 추가분에는 승인 판정이 없다. 지금 화면(`MyIssueTable`)은 `getProjectWorklog`를 쓴다 |
| R-4 | 승인 앱 대조(T-A1) | 리더 담당이다. 워크포스는 문서 ps/pe를 그대로 쓴다 |

## 10. 검증 후 수정 (03_verify_report.md 회차 1 반영, 2026-10-14)

같은 제약을 지켰다. 승인 앱 리포는 수정하지 않았고, 미추적 파일은 그대로이며, 커밋·forge 배포는 하지 않았고, merge도 실행하지 않았다. 아래 내용은 본문 §2·§4·§8의 해당 서술보다 우선한다.

### F-1 협업 드로어 행 손실 — 리더 결정 (a)
- 원인: 드로어 행은 앱 자격으로 읽는데, `applyWorklogApproval`이 asUser `permissions/check`·`worklog/list`로 다시 확인하면서 행을 걸렀다. 그 결과 협업 참여자의 행 전부와 본인 통제분이 빠졌다.
- `ApprovalCertReader.approvalFromDocs(rows, viewer, {now, onBasis})`를 새로 두었다. **서명 문서 판정만** 하고, Jira 사용자 자격 재확인은 하지 않으며, 행을 지우지 않는다.
  - 배치 진입점과 몸통(`judgeWithAppDocs`)은 공유한다. 공개 진입점은 따로 둔다. 문서 캐시 범위는 `collab|{viewer}`다. `decidedBy`·`decidedAt`·`requestId`는 지운다.
- `CollabIssueWorklogService`가 이 함수를 쓴다. 행 범위는 드로어의 기존 규칙을 그대로 따른다(협업 참여 확인 + 프로젝트 소속 검색 + 앱 자격 읽기 + 공개 기록·본인 통제분만, 남의 숨김 기록·설명 비노출). `total`은 공개 범위 규칙만으로 정한다. 다른 화면은 `applyWorklogApproval`의 재확인 경로를 그대로 쓴다.
- 테스트
  - `src/resolver/projectCollab/__test__/CollabDrawerApproval.test.js`(신규): 실제 `approvalFromDocs`로 연동 ON을 시험한다. `permissions/check`를 부르면 빈 결과가 나오는 참여자에게도 행·total이 유지된다(2건 / total 2). 본인 통제분(visibility)이 남고 설명도 본인 것만 나간다. 남의 숨김 기록(note-3)은 없다. 사용자 자격 Jira 호출은 0회다.
  - `CollabWorklogServices.test.js`: 드로어가 `applyWorklogApproval`을 부르지 않고 행 2건·total 2를 유지하는지 확인한다.
  - `ApprovalDisplayPaths.test.js`: 경계 테스트 — `approvalFromDocs`는 `CollabIssueWorklogService`만 부른다.

### F-2 원가 OFF 응답
- `ProjectCostService.assembleResponse`를 `...(approvalBasis ? { approvalBasis } : {})`로 바꿨다. 이제 연동 OFF면 키 자체가 없다.
- `ProjectCostCertification.test.js`에 3건을 추가했다. OFF면 `approvalBasis`·`_approvalPeriod`가 응답에 없고 캐시 키는 `ProjectCost:P1`이다. ON이면 안내가 실리고 표식이 저장된다. 표식이 지나면 캐시를 버린다.

### F-3 전용 번역 키 2개
| 키 | ko | en | 사용처 |
|---|---|---|---|
| `worklog.approval.basis.excludedRejected` | 반려·만료·취소로 제외 {hours}시간 | {hours}h rejected, expired or canceled excluded | `ApprovalBasisNote` (이전 조립 문구와 하드코딩 "h" 제거) |
| `myPage.export.countedHours` | 집계 시간(h) | Counted hours (h) | `MyWorklogPanel` 엑셀 머리(이전 `Σ` 조립 제거) |
- 넣은 위치
  - 원천: `kr|en/worklog.json`의 `basis.excludedUnverified` 다음 줄, `kr|en/myPage.json`의 `export.hours` 다음 줄.
  - 산출물: `ko-KR.json`·`en-US.json`의 같은 위치.
  - 모두 새 줄 삽입만 했다(앵커 줄이 이미 쉼표로 끝나 기존 줄을 바꿀 필요가 없었다).
- 검증
  - 산출물이 merge(원천) 결과와 **바이트 동일**하다.
  - 작업 전 사용자 diff의 변경 줄 78개가 누락 0이다.
  - 내 추가 줄은 산출물 diff 기준 18개다(6키 + 2키, ko·en).
- `git diff --stat locales/` 결과: `en-US.json`·`ko-KR.json` 각각 +47/−2, `kr|en/worklog.json` 각각 +9, `kr|en/myPage.json` 각각 +1.

### 원가·진척 캐시의 월 — 사이트 타임존
- 키 접미사(`:{YYYY-MM}` Asia/Seoul)를 **없애고** 원래 키(`ProjectCost:{id}`·`ProjectProgress:{id}`)로 되돌렸다. 그래서 `ProjectDeletionWorker` 변경도 되돌렸다.
- 대신 캐시 페이로드에 표식 `_approvalPeriod = {key, end}`를 둔다. 응답에는 싣지 않는다.
  - `end`는 이번 승인 월을 덮는 **서명 문서의 `pe`**다. 승인 앱이 `timesheetTimezone`, 즉 사이트 타임존의 달력 월로 서명한 경계다.
  - 덮는 문서가 없으면 `end: null`이고, Asia/Seoul 월 키로 대조한다.
- 캐시 hit은 `isApprovalPeriodStampCurrent(stamp, now)`가 참일 때만 쓴다. 경계를 지나면 TTL을 기다리지 않고 다시 계산한다. 연동 OFF면 표식이 null이라 월과 무관하다.
- 이를 위해 `approvalBasis`에 `currentPeriodEnd`(epoch ms | null) 칸을 더했다(가산). 추가 Jira 호출은 0이다. 이미 읽은 인증 문서를 쓴다.
- ctl 문서의 `tz`는 쓰지 않았다. 캐시 확인 단계에서 ctl을 읽으려면 Jira 호출이 늘어나는데, 인증 문서 `pe`가 같은 사이트 경계를 이미 서명해 준다.
- 테스트: `worklogApproval.test.js`의 "캐시 표식" 1건 — DOC 경계 1ms 전·후, FALLBACK 서울 자정.

### 승인 후 삭제된 기록(deletedKept)을 읽기 전용으로
- `approvalView.isDeletedKept`·`deletedKeptTextOf`를 추가했다.
- 배지는 `"삭제됨 · 승인됨"` Lozenge(removed)다. 전용 키 `worklog.approval.deletedKept`가 생기면 그 문구를 쓰고, 지금은 기존 상태 키 두 개로 조립한다. 지시받은 키 2개 범위를 지키려는 선택이며, 이 키도 원하면 같은 방식으로 추가할 수 있다.
- 캘린더(`WorklogPage`·`ProjectCalender`)
  - 이벤트에 `editable:false`를 둬서 드래그로 옮길 수 없다.
  - `onEventClick`에서 수정 창을 열지 않는다.
  - 칩 시간은 Jira 시간 문자열 대신 승인분 시간(`formatHours`)을 쓰고, 툴팁에 "삭제됨 · 승인됨"을 싣는다.
- 내 작업 표(`MyIssueTable`): 수정 버튼이 없다(`-`). 시간은 승인분 시간이다.
- 테스트: `approvalDisplay.test.jsx`에 2건(배지 문구, 칩 시간·툴팁).

### 결과
| 항목 | 결과 |
|---|---|
| 백엔드 `npx jest` | **183 suites / 2807 tests 통과** |
| 프론트 `npx jest` | **169 suites / 2686 tests 통과** |
| `CI=true npm run build:app` | 성공. node_modules 소스맵 경고뿐이고 빌드 실패는 없음 |
| `npm run bundle:check` | main.js gzip 495,928B / 예산 950,000B |
| `forge lint` | No issues found |

### 이번에 바뀐 파일(추가분)
- 백엔드
  - `src/resolver/approvalLink/ApprovalCertReader.js`
  - `src/resolver/projectCollab/CollabIssueWorklogService.js`
  - `src/resolver/projectCollab/__test__/{CollabWorklogServices,CollabApprovalHiddenRows}.test.js`
  - `src/resolver/projectCollab/__test__/CollabDrawerApproval.test.js`(신규)
  - `src/resolver/approvalLink/__test__/ApprovalDisplayPaths.test.js`
  - `src/integration/approval/worklogApproval.js`(+test)
  - `src/resolver/projectCost/ProjectCostService.js`(+`__test__/ProjectCostCertification.test.js`)
  - `src/resolver/projectProgress/ProjectProgressService.js`
  - `src/resolver/project/ProjectDeletionWorker.js`(원복)
- 프론트
  - `static/ui/src/components/worklog/{approvalView.js, WorklogApprovalBadge.jsx, ApprovalBasisNote.jsx, __test__/approvalDisplay.test.jsx}`
  - `components/calendar/FullCalendar.jsx`
  - `pages/myWork/{WorklogPage.jsx, table/MyIssueTable.jsx}`
  - `pages/projectDetail/calender/ProjectCalender.jsx`
  - `pages/myPage/sections/MyWorklogPanel.jsx`
- locales: `kr|en/worklog.json`, `kr|en/myPage.json`, `ko-KR.json`, `en-US.json`

### 남은 미검증
- 실사이트 확인 항목: F-1의 협업 참여자 드로어, Phase C 통제분, 승인 후 삭제분 칩 클릭, 월 경계 직후 캐시 재계산.
- #8·9 본인 경로(일반 프로젝트 이슈 드로어)는 여전히 배지·승인 합계가 없다(리더 결정 대기).

## 11. 코덱스 반영 (workforce-input-reopen codex-review E 묶음 + 요구서 "코덱스 검토 반영 결정", 2026-10-14)

제약은 그대로 지켰다.
- 입력 경로 파일은 손대지 않았다: `ApprovalControlLookup.js`·`writeChannel.js`(두 벌)·`LinkedWriteGate.js`·`IssueWorklogControlService.js`·AGENTS.md. 다른 에이전트가 수정 중이며, 이 파일들의 diff는 그쪽 변경이다.
- 승인 앱 리포는 수정하지 않았다. 커밋·배포·merge도 하지 않았다. 새 번역 키는 필요 없었다.

### 1) P1-4 예상 원가 = 같은 최종 판정
- `ApprovalCertReader.certifyCostRows`(연동 ON)가 행마다 `approvalOfWorklog`를 **한 번** 돌리고, 확정과 예상을 둘 다 그 결과에서 만든다.
  - 확정 `rows` = `approvedSecondsOf(approval)`: 승인분만, 달과 무관하다.
  - 예상 `expectedRows` = `approval.countableSeconds`: 승인분 + 이번 달 결정 전 기록이다.
- 이전에는 예상이 판정 전 행(`preserved`)이었다. 그래서 숨김 보충 행은 Jira의 현재 초를 그대로 실었고, 페처의 앞선 판정 이후 반려된 기록은 예전 값으로 남았다.
- 회귀 테스트(`WorklogApprovalAggregate.test.js` "코덱스 P1-4")
  - 승인 3,600초 → Jira 7,200초로 바뀐 **숨김 보충** 기록: 확정 3,600, 예상 3,600(이전 코드는 예상 7,200으로 실패한다).
  - 앞선 판정이 PENDING 3,600이었는데 지금 문서는 REJECTED: 확정 0, 예상 0.
  - 이번 달 PENDING: 확정 0, 예상 3,600.
- 함께 고친 것: `rescopeApprovalBasis`가 `currentPeriodEnd`를 버려서, 작성자 필터·리소스 상세 경로의 안내가 FALLBACK으로 내려가던 문제(코덱스 11a 지적). 이제 보존한다. 테스트 1건.

### 2) P2-8 일반 이슈 드로어 본인 워크로그 배지(사용자 결정 "붙이기") + 협업 캘린더 정리
- **새 resolver `getIssueWorklogApproval`**
  - 등록: `MyWorkController` → `guardedDefine`, `PermissionMap`의 `'SELF'`. `CONTROLLER_REGISTRARS`는 기존 컨트롤러라 변경이 없다. 권한 계약 테스트를 통과한다.
  - 입력은 `{issueKey}`(형식 검증)뿐이다. 조회자는 resolver context로만 정한다.
  - 연동 OFF, 잘못된 키, 조회자 없음이면 Jira 호출 없이 `{linked:false}`를 돌려준다.
  - 처리 순서
    1. 그 이슈의 워크로그 첫 100건을 **조회자 asUser**로 읽는다(화면 `getIssueWorklogs` 100건과 같은 범위).
    2. `applyWorklogApproval(rows, viewer, {selfOnly:true})`로 판정한다. 이 과정에서 permissions/check·worklog/list로 **이슈 열람을 다시 확인**한다. 다른 화면과 같은 판정 경로다.
  - 응답: `{ linked:true, worklogs:[{id, approval, claimedSeconds, countableSeconds}], countedTotalSeconds, approvalBasis }`
    - 행 상태는 **본인 작성분만** 싣는다. 남의 기록 상태·설명은 싣지 않는다.
    - `countedTotalSeconds`는 목록 행(삭제 보충 제외) 전체의 승인 규칙 초 합으로, 숫자 하나만 낸다.
    - `approvalBasis`는 본인 행 범위로 다시 계산한 값이다.
- **화면 `useIssueWorklogs.js`(본인 경로)**: Jira REST 행 읽기와 `getIssueWorklogApproval`을 함께 부른다.
  - 본인 행에 `approval`·`claimedSeconds`·`countableSeconds`를 합친다. 그래서 `WorklogHistoryList` 배지와 `ApprovalBasisNote`가 그대로 동작한다.
  - 합계는 연동 시 서버의 `countedTotalSeconds`를 쓴다.
  - 연동이 아니거나 판정 조회가 실패하면 지금과 같다(Jira 원본·배지 없음).
- **협업 캘린더 `CollabCalendarService`**: `applyWorklogApproval`(asUser 재확인) 대신 `approvalFromDocs`를 쓴다. 협업 드로어와 같은 기준이며 협업 인가를 보존한다. 열람 권한 없는 참여자의 행과 본인 통제분이 남는다. 이 경로는 승인 후 삭제 보충 행을 더하지 않는다(드로어와 같다).
- 테스트
  - `ApprovalDisplayPaths.test.js`: resolver OFF·잘못된 입력 → 호출 0. ON이면 asUser 읽기, `selfOnly`, 본인 행만, 남의 정보 비노출, 합계. 경계 테스트 — `approvalFromDocs`는 협업 드로어·협업 캘린더만 부른다.
  - `CollabDrawerApproval.test.js`: 협업 캘린더를 실제 `approvalFromDocs`로 시험한다. permissions/check가 빈 참여자도 행 유지, 본인 통제분 유지, 남의 숨김 설명 없음, 사용자 자격 재확인 호출 0.
  - 프론트 `hooks/__test__/collabReadAuthority.test.js`: 본인 경로 비연동이면 지금과 같고, 연동이면 본인 행만 배지와 서버 합계를 쓴다.

### 3) 승인 앱의 "규칙 위반 입력" 사후 판정 대비
- **현재 계약 확인 결과**: 워크포스 사본 `src/integration/approval/contract.js`의 `APPROVAL_CERT` 검증은 엔트리를 **닫힌 집합**으로 검사한다.
  - 상태 `e[1]` ∈ {UNSUBMITTED, PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED}.
  - 출처 `e[5]` ∈ {APP, WORKFORCE, APP_CHANGED, WF_CHANGED, PREAPPROVAL, NONE, INVALID, REUSED, BACKFILL}.
  - 엔트리 길이는 9 또는 10이다.
  - 그래서 새 상태·출처·칸이 실린 문서는 서명 검증 단계에서 **문서 전체를 믿지 않는다**. 그 사용자·달의 행은 모두 `UNKNOWN`이 된다. 집계에서는 제외되고, 이번 달이면 "확인 중"(UNVERIFIED), 지난달이면 PAST_UNAPPROVED로 분류된다. 승인분도 포함되지 않는 쪽으로 안전하게 실패한다.
  - 작업 중 승인 앱 에이전트가 두 리포의 `contract.js`를 같이 갱신했다(ctl `wr` 추가). 인증 엔트리 검증은 바뀌지 않았다. 두 파일은 바이트 동일하고 계약 동일성 테스트도 통과한다.
- **도메인 방어 추가**: 나중에 계약이 엔트리 뒤에 칸(예: 위반 사유)을 허용해도 `approvalOfWorklog`가 그 뜻을 모르면 세지 않는다. `e[10]` 이후에 null이 아닌 값이 있으면 승인분이라도 0으로 두고 이번 달 UNVERIFIED·지난달 PAST_UNAPPROVED로 분류하며 `normalOrigin:false`다. 값이 null인 칸만 붙은 경우는 지금처럼 센다. 계약이 그 칸을 정의하면 여기서 해석한다.
- 테스트
  - 실제 서명 문서로: 모르는 상태 `VIOLATION`, 모르는 출처 `WF_VIOLATION`, 11번째 칸 `RULE_VIOLATION` → 승인 엔트리여도 `status:'UNKNOWN'`, 집계 0, UNVERIFIED(`WorklogApprovalAggregate.test.js`).
  - 도메인 단위: 추가 칸 값이 있으면 0, null이면 지금과 같음, 모르는 상태는 0(`worklogApproval.test.js`).

### 결과
| 항목 | 결과 |
|---|---|
| 백엔드 `npx jest` | **183 suites / 2850 tests 통과**. 그중 1회는 다른 에이전트가 두 리포 `contract.js`를 동시에 갱신하던 순간에 계약 동일성 테스트가 실패했고, 갱신이 끝난 뒤 재실행에서 통과했다 |
| 프론트 `npx jest` | **169 suites / 2691 tests 통과** |
| `CI=true npm run build:app` | 성공 |
| `npm run bundle:check` | main.js gzip 495,949B / 예산 950,000B |
| `forge lint` | No issues found |

### 바뀐 파일(이번 절)
- 백엔드
  - `src/resolver/approvalLink/ApprovalCertReader.js`
  - `src/integration/approval/worklogApproval.js`
  - `src/resolver/projectCollab/CollabCalendarService.js`
  - `src/resolver/myWork/{MyWorkService.jsx, MyWorkController.jsx}`
  - `src/permission/PermissionMap.js`
  - 테스트: `src/resolver/approvalLink/__test__/{WorklogApprovalAggregate,ApprovalDisplayPaths}.test.js`, `src/resolver/projectCollab/__test__/CollabDrawerApproval.test.js`, `src/integration/approval/__test__/worklogApproval.test.js`
- 프론트
  - `static/ui/src/pages/projectDetail/work/useIssueWorklogs.js`
  - `static/ui/src/hooks/__test__/collabReadAuthority.test.js`

### 남은 것
- 일반 드로어의 본인 **숨김(통제) 기록**은 Jira REST 목록에 없어서 이 경로에 보이지 않는다(지금과 같다). 앱에서 숨긴 본인 기록 보기는 승인 앱 화면이 담당한다.
- 호출량: 일반 드로어 1회마다 Jira 호출이 늘어난다. worklog GET 1, permissions/check 1, worklog/list 1, 그리고 문서 키 목록·문서(5분 캐시)다. 실측은 하지 않았다.
- 승인 앱이 "규칙 위반 입력"을 계약에 정의하면(새 상태나 칸) 워크포스는 계약 사본을 갱신하고 해석을 넣어야 한다. 그때까지는 위 규칙대로 집계에서 제외된다.
