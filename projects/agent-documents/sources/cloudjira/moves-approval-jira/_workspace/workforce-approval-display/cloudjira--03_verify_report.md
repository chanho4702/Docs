# 검증 리포트 (회차 1) — workforce-approval-display

> 2026-10-14 · integration-verifier · 기준: `00_input/requirement.md`(끝 "열린 질문 답"), `01_architect_design.md`, `02_workforce_report.md`
> 대상: 워크포스 `C:\CloudJira\moves-workforce`(주), 승인 앱 `C:\CloudJira\moves-approval-jira`(계약 대조). 소스 수정 없음. 교차 테스트 파일 2개만 추가함.

## 요약  통과 8 / 실패 3(중 1·경미 2) / 미검증 6

| # | 검증 항목 | 결과 |
|---|---|---|
| 1 | 월 경계 진리표 | 통과. 경계·DST 교차 테스트를 추가했고 모두 통과 |
| 2 | 엔트리 상태 열거 | 통과. 진리표가 다루지 않는 상태 없음 |
| 3 | 화면 전수 적용 | 대체로 통과. #8·9 본인 경로는 미적용(설계가 허용한 예외). 원가 응답은 OFF 불변이 아님(경미 실패 F-2) |
| 4 | 집계 일관성 | 통과. 예외는 #8·9 본인 경로 합계(Jira 원본) 1곳 |
| 5 | 원가 확정/예상 | 통과 |
| 6 | 보안·범위 | **실패 F-1(중)**. 협업 드로어에서 연동 ON일 때 행이 빠지는 회귀 |
| 7 | locales | 통과 |
| 8 | 호출량·SQL·manifest | SQL·manifest 0은 통과. 호출량은 미검증 |
| 9 | 회귀 | 통과(전부 녹색) |

## 실패

### F-1 (중) 협업 드로어: 연동 ON에서 협업 모드 대상 행과 본인 통제분이 사라짐 — 담당: backend(+리더 결정)
- 위치: `WF:src/resolver/projectCollab/CollabIssueWorklogService.js:41,46` → `WF:src/resolver/approvalLink/ApprovalCertReader.js:351-364`
- 현상
  - 드로어 행(`kept`)은 **앱 자격**으로 읽는다. 그 뒤 `applyWorklogApproval`이 asUser `permissions/check`·`worklog/list`로 다시 확인한다. 이 확인을 통과한 `allowed`와 삭제 보충분만 `counted`에 들어간다.
  - ① 협업 모드의 전제는 "Jira 열람 권한이 없는 참여자"다. 이런 조회자는 `visible`이 비어 **드로어 전체가 빈 목록**이 되고 `total`도 0으로 줄어든다. 연동 OFF나 이전 코드에서는 그대로 보였다.
  - ② `kept`에 일부러 넣은 **본인 통제(숨김) 기록**(`control.isApprovalHidden`)은 asUser `worklog/list`에서 돌아오지 않는다. 그래서 `absent`→`missing`(`:356-359`)으로 분류되는데, `missing`은 문서 키 수집에만 쓰이고 `counted`에 들어가지 않는다. 드로어에 `includeHidden`이 없어서 숨김 보충도 일어나지 않는다. 결과적으로 본인 통제분이 사라진다. Phase C(통제 숨김)가 켜진 사이트에서는 실제로 보인다.
  - 협업 **캘린더**(`CollabCalendarService.js:58`)도 ①은 이전부터 같았다. 보고서 R-1이 "기존 동작 확장"이라고 적은 범위가 이것이다. 다만 드로어는 이번에 새로 생긴 회귀다.
- 기존 대비 범위: 내 캘린더·내 작업 표·이슈 분석은 원래 행이 asUser 수집이라 재확인에서 빠지는 행이 사실상 없다(경합 시에만). 실제로 행이 빠지는 곳은 **협업 드로어뿐**이다.
- 고치는 방법(택1, 리더 결정)
  - (a) 협업 경로는 이미 `assertCollabReadAccess`+`findIssueInCollabProject`로 인가가 끝났다. 그러니 행을 걸러내지 않는 판정, 즉 서명 문서 판정만 하는 별도 내부 함수를 쓴다. 단 배치 진입점(import 경계 고정)을 재사용하지 말고 새 함수로 두며, 설명은 기존 규칙대로 내보낸다.
  - (b) 재확인에서 빠진 행은 지우지 않고 `approval: UNKNOWN`(확인 중)으로 남긴다. 그리고 본인 `missing` 행은 `counted`에 포함한다.
  - (c) 협업 드로어는 이번 범위에서 승인 판정을 빼고 이전 동작으로 돌린다.
  - 어느 쪽이든 테스트를 추가한다. "permissions/check가 빈 결과일 때 드로어 행 수가 유지되는가"와 "본인 통제분이 남는가".

### F-2 (경미) 원가 응답이 연동 OFF에서도 `approvalBasis: null` 키를 실음 — 담당: backend
- 위치: `WF:src/resolver/projectCost/ProjectCostService.js` `assembleResponse`의 `approvalBasis,` 줄
- 보고서 §4·§5는 "비연동이면 키 자체가 없다(OFF면 응답 바이트 동일)"라고 적었다. 그런데 원가 경로는 항상 키를 싣는다. 프론트 동작에는 영향이 없다(`CostPage.jsx:113`이 `cert?.applied`일 때만 그림). 하지만 계약 문구와 다르고 원가 OFF 테스트도 없다.
- 고치는 방법: 진척(`ProjectProgressService` `assembleResponse`)처럼 `...(approvalBasis ? { approvalBasis } : {})`로 바꾸고, 원가 OFF shape 테스트를 1개 추가한다.

### F-3 (경미) 하드코딩된 단위·조립 문구 — 담당: frontend
- `WF:static/ui/src/components/worklog/ApprovalBasisNote.jsx:26`: 반려 제외분이 `${status}: ${excluded} ${hours}h`로 조립된다. ko 화면에 "h"가 그대로 나온다.
- `MyWorklogPanel.jsx` 엑셀 머리 `Σ ${t('myPage.export.hours')}`도 조립 문구다.
- 고치는 방법: 보고서 §8-1·8에서 권한 대로 전용 키 2개(예: `worklog.approval.basis.excludedRejected`·`myPage.export.countedHours`)를 kr/en 원천과 산출물 양쪽에 추가한다. 이때도 사용자 줄은 보존한다.

## 미검증
| 항목 | 이유 | 확인 방법 |
|---|---|---|
| U-1 게시 지연 동안 "확인 중" 0시간 | 실측 필요 | 승인 앱에서 기록한 뒤, 워크포스 캘린더 배지가 UNKNOWN에서 PENDING으로 바뀌기까지 걸리는 시간 측정(캐시 5분 포함) |
| R-2 호출량 +4~12회/화면 | 실측 필요. 근거는 코드상 타당: `permissions/check` ⌈N/100⌉, `worklog/list` ⌈W/1000⌉, 숨김 보충 시 `bulkfetch`, 문서 5분 캐시(범위 `aggregate|{viewer}`). 연동 OFF에서도 경로마다 `getSettingDataService`(KVS 엔티티 1회, SQL 아님)가 1회 늘어남 | 개발 사이트에서 내 작업·마이페이지(같은 화면에서 `getMyCalendarWorklog`+`getMyIssueList`가 둘 다 판정) 1회 로드의 Jira 요청 수 측정 |
| U-3 포트폴리오 배치 재집계 | 큐 소비자 실측 필요 | 연동 ON에서 재집계한 뒤 스냅숏에 프로젝트가 빠지지 않았는지, `approvalBasisByProject` 메타 확인 |
| 삭제 승인분 유령 행 | 코드상 새로 노출됨. `deletedApprovedRowsOf` 행(`deletedKept:true`, `timeSpent` 문자열 없음, 설명 없음)이 이번에 **내 캘린더·내 작업 표**에도 행으로 들어간다(`MyWorkService.withIssueApproval`). 프로젝트 캘린더는 원래 같았다. 클릭하면 이미 삭제된 워크로그로 수정 모달이 열릴 수 있다 | 실사이트에서 승인 후 삭제한 기록이 내 캘린더에 칩으로 보이는지, 클릭 동작 확인. 필요하면 프론트에서 `deletedKept` 행을 읽기 전용으로 처리 |
| 캐시 키 월 접미사의 타임존 | `currentApprovalPeriodKey`는 항상 Asia/Seoul이다. 사이트 타임존이 다르면 키가 바뀌는 시각과 실제 월 경계가 어긋난다. 영향은 최대 TTL 10분 동안 낡은 값이 남는 정도 | 문서상 위험만. 필요하면 원가·진척 키를 사이트 문서 기준 키로 계산 |
| R-3 `getMyIssueList` 대체 경로 | 지금 내 작업 표는 `getProjectWorklog`/`getMyCalendarWorklog`를 쓴다(`useMyWorklogList.js:18`). `getMyIssueList`는 마이페이지 통계(건수 기준)와 `useMyIssueTable`에서 쓴다 | 문제 없음으로 판단. 실화면에서 한 번 확인 |

## 통과

### 1. 월 경계 진리표 (`WF:src/integration/approval/worklogApproval.js`)
- `approvalOfWorklog`를 요구서 답과 대조했다.
  - 승인+정상 출처는 항상 포함한다(승인 초 = `doc.entries` 값 우선, D1).
  - 이번·미래 달은 UNSUBMITTED·PENDING+정상+지문 일치만 포함한다(`OPEN_STATUSES`).
  - REJECTED·EXPIRED·CANCELLED는 즉시 제외하고 `REJECTED`로 분류한다(Q4).
  - 문서·엔트리가 없으면 0이고 `UNVERIFIED`다(Q2 확인 중).
  - 지난달은 승인분만 센다.
  - CHANGED(불일치 미승인)와 비정상 출처는 0이다.
  - `closeAt`은 `locked/lockReason`에만 쓰인다(테스트 9·10·11).
- 생산자 교차 확인(승인 앱)
  - `AP:src/resolver/workforce/WorkforcePublisher.js:361`의 `periodRange(periodKey,{timeZone:lock.timeZone})`를 `AP:src/integration/workforce/certificationDoc.js:81-82`가 `ps/pe`로 싣는다.
  - `lock.timeZone`은 `PeriodLockService.lockSettingsOf`의 `timesheetTimezone`(기본 Asia/Seoul)이다.
  - 인증 문서 키는 항상 월(`certDocKeyOf` CERT_PERIOD, `periodKeyOf(...,{unit:'MONTH'})`)이다. 정책 `approvalUnit=WEEK`여도 문서는 월 단위다.
  - 소비자 `WF:src/integration/approval/certification.js:88-89`가 `ps→start`, `pe→end`로 읽는다.
- 경계 테스트: 기존 테스트는 `now = end-1 / end` 경계와 FALLBACK 00:30만 다뤘다. **월말 23:59·익월 00:00 작업 시각과 DST 타임존 테스트는 없었다.** 교차 테스트 2개를 추가했다.
  - `WF:src/integration/approval/__test__/worklogApprovalBoundary.verify.test.js`(10건 통과): Asia/Seoul, America/New_York DST 종료(11-01)·시작(3월) 문서에서 23:59 → 이번 달, 00:00 → 다음 달. 경계 직후 `now`이면 PAST 0, 1ms 전이면 포함. FALLBACK 경계.
  - `AP:src/resolver/workforce/__test__/WorkforcePublisherCertBoundary.verify.test.js`(3건 통과): `buildCertFor`의 `ps/pe`가 사이트 타임존 달력 월(Seoul, NY 2026-11, NY 2027-03)이고 `forMonth` 조회 범위와 같음. 설계 T-A1의 공백(기존 대조 테스트는 UTC 본문 빌더 수준뿐)을 메웠다.

### 2. 엔트리 상태 열거
- 승인 앱 계약 `AP:src/integration/workforce/contract.js:321`의 e[1] 집합은 `UNSUBMITTED, PENDING, APPROVED, REJECTED, EXPIRED, CANCELLED`이다. 워크포스 사본 `WF:src/integration/approval/contract.js:321`과 같다.
- 게시자 `WorkforcePublisher.js:372`는 `approval_request.status`(`AP:src/domain/approval/constants.js:9` = PENDING/APPROVED/REJECTED/EXPIRED/CANCELLED) 또는 UNSUBMITTED만 싣는다.
- `NEEDS_APPROVER`는 승인 앱 화면 상태(`WorklogRequestService.js:151,273`)일 뿐 문서에 실리지 않는다. 진리표가 6종을 모두 덮으므로 보고서 §8-2의 우려는 해소됐다.

### 3. 화면 전수 적용(파일:줄, `WF:static/ui/src/` 기준)
| # | 화면 | 렌더 위치 |
|---|---|---|
| 1·6 | 캘린더 칩 점 | `components/calendar/FullCalendar.jsx:270`(WorklogPage·ProjectCalender 공용). 칩 길이 `:257` display 초, 제외 칩 opacity |
| 2 | 날짜 칸 합계 | `FullCalendar.jsx:55` counted, 제외분 title |
| 3 | KPI | `pages/myWork/utils/useMyWorklogSummary.js:103` counted. 안내 `pages/myWork/WorklogPage.jsx:469` |
| 4·5 | 내 작업 표 | `pages/myWork/table/MyIssueTable.jsx:120` 배지, `:144` counted, `:213` 안내 |
| 6 | 프로젝트 캘린더 안내 | `pages/projectDetail/calender/ProjectCalender.jsx:398` |
| 7 | 모달 | `pages/myWork/modal/WorklogModal.jsx:633`, 기간 역산 `:291` display |
| 8·9 | 이슈 패널·드로어 | `WorklogHistoryList.jsx:63` 배지, `TreeDetailPanel.jsx:292`·`map/MapWorklogTab.jsx:18` 안내. **협업 경로만**(본인 경로는 Jira REST라 배지 없음, 합계는 Jira 원본: `useIssueWorklogs.js:50-54`) |
| 10·11 | 이슈 분석 | `analysisReport/issue/WorklogDetailPanel.jsx:84` 배지, `:119` 안내 |
| 13 | 리소스 상세 | `ResourceAnalysisChart.jsx:198` 배지, `:345` 안내, 머리 합계 countable(F-3 해소) |
| 14·15 | 리소스·팀 분석 | `ResourceAnalysisPage.jsx:281`, `team/ProjectTeamAnalysisPage.jsx:207` |
| 16 | 원가 | `cost/CostCertBasis.jsx:41` variant cost |
| 18 | 진척 | `progress/ProgressPage.jsx:85` |
| 20·21 | 대시보드 위젯·토폴로지 | `dashboard/ChartTemplate.js:565` 캡션 |
| 22~24 | 마이페이지 | `myPage/sections/MyWorklogPanel.jsx:210` 배지, `myPage/MyPage.jsx:160` 안내 |
| 26 | 포트폴리오 | `portfolio/PortfolioDashboardPage.jsx:309` |

- 승인이 빠져 있던 서버 경로 4곳(a `getMyCalendarWorklog`, b `getProjectWorklog`·`getMyIssueList`, c `getCollabIssueWorklogs`, d `getIssueWorklogDetail`)이 모두 `applyWorklogApproval`로 연결됐다.
- OFF 불변 테스트: `WF:src/resolver/approvalLink/__test__/ApprovalDisplayPaths.test.js`에 a·b·d가 `toEqual`/키 목록으로 고정돼 있다. c는 기존 테스트(mock이 onBasis를 부르지 않음)가 지킨다. `getMyIssueList` OFF는 같은 `withIssueApproval`을 공유한다. 원가는 F-2.
- R1 대비 남은 공백은 #8·9 **본인 경로**(일반 프로젝트에서 가장 흔한 경로)다. 설계 §4.3 c'가 허용한 예외이지만 요구 원문 "모든 화면"에는 못 미친다. 리더 결정 사항이다. 선택지는 `getIssueWorklogDetail`(REPORT list 축, issueKey 입력, 이미 판정 적용)을 연동 ON일 때 재사용할 수 있는지 검토하는 것이다. 권한 축이 다르므로 설계 확인이 필요하다.

### 4. 집계 일관성
- 프론트 합산은 모두 `countedSecondsOf`(=countableSeconds)이고, 표시·길이·역산은 `displaySecondsOf`(=claimedSeconds)를 쓴다. grep 결과 집계 값으로 `timeSpentSeconds`를 직접 더하는 화면이 남아 있지 않다(`worklogExport`는 Q7 범위 밖, `gantt`·`assignment`는 timetracking으로 Q6 범위 밖).
- 서버
  - 캘린더·대시보드·리소스·진척·포트폴리오·관계도는 `applyWorklogApproval`(배치는 `applyWorklogApprovalForBatch`) 이후의 `timeSpentSeconds`(=countable)로 합산한다.
  - 진척·포트폴리오 `actualTotalMd`는 연동 시 같은 행 합계다(`withApprovedActual`).
  - 이슈 분석 `hours`는 주장값이고 누적선은 countable이다.
  - 원가는 `claimedSeconds`로 다시 판정한다.
- 예외는 #8·9 본인 경로 합계(Jira 원본) 1곳이다(위 3).

### 5. 원가 확정/예상
- `ApprovalCertReader.certifyCostRows`
  - 확정은 `approvedSecondsOf`(lockReason APPROVED+정상 출처)다.
  - 예상은 `expectedRows = preserved`이고, 이 값은 페처의 `applyWorklogApproval` 결과다. 즉 승인분 + 이번 달 UNSUBMITTED/PENDING이며 반려·지난달 미승인은 0이다. `CostCalculator.js:268`가 `timeSpentSeconds`를 쓰는 것으로 확인했다.
- 이중 적용 방지: `claimedSeconds ?? timeSpentSeconds`로 지문을 판정하고, 테스트로 고정돼 있다.
- 캐시 키는 `ProjectCost:{id}:{YYYY-MM}`·`ProjectProgress:{id}:{YYYY-MM}`이다. `approvalBasis`는 캐시 밖이다. 삭제 워커는 옛 키와 이번 달 키를 함께 지운다.

### 6. 보안·범위(F-1 외)
- 새 경로 a·b·d는 행이 asUser 수집이다. 승인 문서만 asApp(Q133)으로 읽고, 문서 캐시 범위는 `aggregate|{viewer}`이며, `decidedBy/decidedAt/requestId`를 지운다.
- 숨김 보충은 `selfOnly:true`라 본인 것만 받는다(불변식 8 ①~⑥과 같은 규칙).
- 타인 기록의 승인 상태가 보이는 것은 그 행을 asUser로 볼 수 있는 조회자뿐이다. 협업 캘린더·프로젝트 캘린더의 기존 노출 범위와 같다.
- 포트폴리오 배치 진입점은 `PortfolioAggregator.js:342` 한 곳에서만 부른다. grep으로 확인했고 `ApprovalDisplayPaths.test.js:129` 경계 테스트가 있다. 산출물은 집계 숫자와 KVS 메타의 `approvalBasisByProject`뿐이다. 조회할 때 `portfolioApprovalBasisOf`가 조회자 범위 프로젝트만 합친다.

### 7. locales
- `git diff`: 원천 `kr/worklog.json`·`en/worklog.json`은 각각 +8(새 키만), 산출물 `ko-KR.json`·`en-US.json`은 각각 +45/−2다.
- 산출물 = 원천 merge 결과임을 **메모리 내 모사**(스크래치 스크립트, 파일 쓰기 없음)로 확인했다. 두 파일 모두 **바이트 동일**이다. 따라서 사용자가 이전에 바꾼 줄(결재 정책 문구, `approval.status.*` 등)이 원천 기준으로 보존돼 있고, 이후 `npm run merge`를 돌려도 바뀌지 않는다.
- 새 키 6개(`excludedPast`, `dotLabel`, `basis.{line,excludedPast,excludedUnverified,cost}`)가 ko·en 모두에 있다. 사용처: `approvalView.js:51`, `WorklogApprovalDot.jsx:15`, `ApprovalBasisNote.jsx:13-23`. 키가 없을 때의 폴백(`tOrNull`)도 있다.

### 8. 호출량·SQL·manifest
- 이번 기능 코드에 SQL(`executeQuery`·DDL)은 추가되지 않았다.
- `manifest.yml` diff는 이슈 패널 모듈 제거로, 이전 작업(linked-mode-fix·workforce-input-reopen) 것이다. 이번 기능에서 나온 변경은 없다.
- 새 트리거·consumer는 없다.

## 실행 결과
| 명령 | 결과 |
|---|---|
| 워크포스 백엔드 `npx jest`(루트, 교차 테스트 추가 전) | 181 suites / 2791 tests 통과 |
| 워크포스 교차 테스트 `worklogApprovalBoundary.verify.test.js` | 10/10 통과 |
| 워크포스 프론트 `npx jest`(static/ui) | 169 suites / 2684 tests 통과 |
| `CI=true npm run build:app` + `npm run bundle:check`(merge 미실행) | 성공. main.js gzip 495,737B / 예산 950,000B |
| `forge lint`(빌드 후) | No issues found. PermissionLinter "Unknown product" 경고는 manifest 무변경이라 이번 작업과 무관 |
| 승인 앱 `npm test -- --runInBand` | 203 suites / 3016 tests 통과(교차 테스트 1개 포함) |

## 담당별 수정 요청
- **backend(워크포스)**
  1. F-1 협업 드로어 행 유실(리더가 a/b/c 중 결정 후 진행) + 테스트 2개
  2. F-2 원가 OFF 응답에서 `approvalBasis` 키 제거 + OFF shape 테스트
  3. (선택) 원가·진척 캐시 키 월 접미사를 사이트 타임존 기준으로
- **frontend(워크포스)**
  1. F-3 하드코딩 단위·조립 문구를 전용 키 2개로
  2. (확인 후) `deletedKept` 행을 내 캘린더·내 작업 표에서 읽기 전용으로 처리
- **리더 결정**: #8·9 본인 경로 배지·합계 공백을 받아들일지, 기존 resolver를 재사용할지

## 실측 필요
1. 게시 지연 동안 "확인 중" 표시 시간(U-1)
2. 화면 1회당 Jira 호출 증가(내 작업·마이페이지·협업 드로어·이슈 분석)
3. 포트폴리오 배치 재집계 성공·누락 여부(U-3)
4. 연동 ON + Phase C 통제 숨김에서 본인 통제분이 협업 드로어에 남는지(F-1 ②)
5. 협업 모드 참여자(Jira 열람 권한 없음)의 드로어·협업 캘린더가 연동 ON에서 비는지(F-1 ①)
6. 승인 후 삭제분이 내 캘린더에 칩으로 보이는지와 클릭 동작
7. 월이 바뀐 직후(사이트 자정) 지난달 미승인분이 원가·진척·리소스 화면에서 바로 빠지는지
