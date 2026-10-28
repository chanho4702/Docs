# 02. 프론트엔드 구현 리포트 — 진척도(Progress) 페이지

> 구현일: 2026-05-29 / 작성: frontend-engineer
> 설계서 `01_architect_design.md` 화면 A~E + §5·§6 결정, 백엔드 계약 `02_backend_report.md` §3 응답 shape을 글자 그대로 소비.

---

## 1. 구현 파일 목록

### 신규 (static/ui/src/pages/projectDetail/progress/)
| 파일 | 역할 |
|------|------|
| `ProgressPage.jsx` | 메인. 기간 빠른필터+날짜지정, coworkerFieldId 조달, `invoke('getProjectProgressSummary')`, 로딩/에러/기간없음/빈데이터 상태분기, 레이아웃(카드 조립). |
| `ProgressHeader.jsx` | **화면 A** 종합 헤더 — 상태 배지(normal/caution/delayed), 완성%/일정%/차이(%p, 양수 초록·음수 빨강), 확정/예측 지연 카드. 차이 툴팁·예측 낙관근사 툴팁. |
| `ProgressBars.jsx` | **화면 B** 진척 비교 막대 — 일정/완성(강조)/공수 3개 수평막대(0~100%), MD 환산 병기(전체계획/실적기성/실투입), 규칙2 보조지표+과신금지 툴팁. |
| `ProgressSCurve.jsx` | **화면 C** S-curve — 계획누적(점선)/실제누적(실선) ECharts, 오늘·종료예정·예상완료 markLine. 완성진척 토글 **비활성+안내문**. `IssueAnalysisChart.jsx`의 buildChartOption/markLine 패턴 차용. |
| `ProgressStatusDistribution.jsx` | **화면 D** 상태별 분포 — 가로 누적막대, 개수/공수 토글(**공수 기준 기본**). |
| `ProgressRiskTable.jsx` | **화면 E** 위험 이슈 — `res.issues[]` 프론트 필터(전체/기한초과미완료/공수편차), DynamicTable(키/담당자/기한/처리율/지연일수/공수편차). 이슈키 클릭→`IssueComponent`의 router.open으로 이슈 상세. |
| `ProgressPage.css` | 페이지 전용 스타일(기간필터 칩은 ResourceAnalysisPage.css 패턴 차용). |

### 수정
| 파일 | 변경 |
|------|------|
| `static/ui/src/constants/tabs.js` | `ProgressPage` import + `ChartTrendIcon` import. `projectDetailTabs` 시그니처에 `canReadReport` 추가. **최상위 탭** `key:'projectProgress'` 추가(analysisReport children 아님), `canRender: () => canReadReport`. |
| `static/ui/src/components/tabs/ProjectDetailTabs.jsx` | `usePermissionStore`로 `canRead('REPORT')` 조회 → `projectDetailTabs(...,canReadReport)` 주입. useMemo 의존성 보강. |
| `static/ui/src/utils/queryKey/projectKeys.js` | `projectKeys.progress(projectId, params)` 팩토리 추가(인라인 키 금지 준수). |
| `locales/kr/projectDetail.json`, `locales/en/projectDetail.json` | `tabs.progressAnalysis` + `analysis.progress.*` 키 보강(백엔드 계약 반영). |
| `locales/ko-KR.json`, `locales/en-US.json` | **merge.js 산출물**(직접 수정 아님). |

---

## 2. 소비한 백엔드 응답 경로 (계약 준수 — content 래핑 없음, 루트 직접)

`const res = await invoke('getProjectProgressSummary', { projectId, startDate, endDate, coworkerFieldId })`

| 화면 | 소비 경로 |
|------|-----------|
| 분기 | `res.success`, `res.project.startDate/endDate`(기간없음 안내), `res.effort.plannedTotalMd`(빈데이터 안내) |
| A 헤더 | `res.diagnosis.status` / `res.completion.rate`(×100) / `res.schedule.rate`(×100) / `res.diagnosis.diffPercentPoint`(이미 %p) / `res.delayConfirmed.{count,maxDelayDays,avgDelayDays}` / `res.delayPredicted.{estimatedEndDate,predictedDelayDays,optimisticApprox}` |
| B 막대 | `res.schedule.rate`, `res.completion.rate`, `res.effort.{plannedTotalMd,actualTotalMd}`(공수율=actual/planned), `res.completion.earnedMd`, `res.diagnosis.effortVsCompletion`(이미 %p) |
| C S-curve | `res.effort.plannedCumulative[].{date,cumulative}`(점선), `res.effort.actualCumulative[].{date,cumulative}`(실선), `res.project.endDate`, `res.delayPredicted.estimatedEndDate`. **`res.completion.cumulative`는 사용 안 함**(항상 빈 배열). |
| D 분포 | `res.statusDistribution.byCount.{done,inProgress,todo}`, `res.statusDistribution.byEffort.{doneMd,inProgressMd,todoMd}` |
| E 위험 | `res.issues[].{key,summary,assignee,dueDate,statusKey,progressRate,delayDays,effortDeviationMd}` |

**스케일 처리**: `completion.rate`·`schedule.rate`·`progressRate`는 0~1 → 표시 시 ×100. `diffPercentPoint`·`effortVsCompletion`은 이미 %p이므로 추가 변환 없음.

### UI 명시(§6 준수)
- 규칙2(공수vs완성) 영역에 "보조지표, 주 신호는 완성vs일정" 툴팁 — `progress.bar.effortVsCompletionHint`.
- 예측 지연 카드에 "낙관 근사치(optimisticApprox)" 툴팁 — `progress.header.optimisticApprox`. `optimisticApprox===true`일 때만 노출.
- 차이(diff) 메트릭에 "완성률−일정률(주 신호)" 툴팁 — `progress.header.diffTooltip`.
- 완성진척 추이 토글: 버튼 `disabled` + "데이터 한계로 미지원" 안내 — `progress.sCurve.completionDisabled`.

---

## 3. coworkerFieldId 조달
기존 `IssueAnalysisTable`·myWork와 동일: `useQuery(['coworkerFieldId'], () => getCustomFieldId(CustomFieldId.coworkerIdField))`. invoke는 `isCoworkerReady` 시에만 enabled.

---

## 4. i18n 경로 확인 결과 (열린항목 해소)

- **실확인 결과**: `locales/script/merge.js`는 `locales/kr/`·`locales/en/` 폴더를 읽어 파일명을 namespace로 `ko-KR.json`/`en-US.json` 생성. `locales/script/*.json`은 빈 스텁(merge가 읽지 않음).
- 따라서 진척도 키는 **`locales/kr/projectDetail.json`·`locales/en/projectDetail.json`의 `analysis.progress` + `tabs.progressAnalysis`**에 추가.
- (참고) 해당 키 일부는 이전 단계에서 이미 작업트리에 존재했으나, 백엔드 §6 결정 반영을 위해 전면 보강: `badge.warning→caution`, `header.completion/schedule/diff(%p)/delayConfirmed/delayPredicted/optimisticApprox`, `bar.*`(MD환산·effortVsCompletion·hint), `sCurve.completionToggle/completionDisabled`, `status.byCount/byEffort`, `risk.filter*/col.delay/col.deviation`, `filter.*`(퀵필터). 폐기된 capacity선(§6 #3) 관련 `gauge.capacity*` 키는 제거.
- **merge 실행**: `cd static/ui && npm run merge` 실행 완료 → ko-KR.json/en-US.json 반영 확인(neue 키 존재 검증함). 빌드 prebuild도 merge 자동 실행됨.
- ko-KR.json/en-US.json 직접 수정 안 함. UI는 `t('key')`만 사용. 보간은 `t(key, {param})` ICU 형식(@forge/bridge createTranslationFunction).

---

## 5. 상태 처리
- 로딩 / coworkerFieldId 준비 전: Spinner(중앙).
- 에러(`isError` 또는 `success!==false`): `SectionMessage` error + `progress.error`.
- 기간 미설정(`project.startDate/endDate` 없음): SectionMessage warning + `progress.noPeriod`.
- 빈 데이터(`effort.plannedTotalMd===0`): SectionMessage information + `progress.empty`.
- 위험 이슈 0건: 테이블 emptyView + `progress.risk.empty`.

---

## 6. 테스트 / 빌드 결과

```
cd static/ui && npm test  (CI=true)
PASS src/utils/__test__/listUtils.test.js
PASS src/utils/__test__/jqlMaker.test.js
PASS src/utils/__test__/numberUtils.test.js
PASS src/utils/__test__/TimeUtils.test.js
Test Suites: 4 passed, 4 total / Tests: 21 passed (회귀 없음)

cd static/ui && npm run build  (CI=true)
Compiled with warnings. / The build folder is ready to be deployed.
```
- 빌드 경고는 **기존부터 존재하던 source map 경고**(@atlaskit/analytics-next-stable-react-context, marklassian의 node_modules .ts 부재)뿐. 진척도 코드 관련 오류·ESLint 경고 없음.
- 초기 빌드 실패(상대 import가 src/ 밖) → progress 폴더 깊이에 맞게 `../../../../`→`../../../` 교정 후 통과.

---

## 7. verifier가 볼 주의점

1. **응답 루트 직접 접근**: ProgressPage는 `data.success`/`data.effort`/`data.issues` 등 **루트 직접** 소비(`data.content.*` 아님). 백엔드 `getProjectProgressSummary`가 `ResourceAnalysisService`처럼 펼침형 응답이어야 정합. (계약 §3 일치)
2. **rate 스케일**: completion/schedule/progressRate는 0~1 가정으로 ×100. 백엔드가 이미 % 단위로 바꾸면 200% 표시되는 회귀 — 0~1 유지 필수.
3. **completion.cumulative 미사용**: 화면 C는 빈 배열 가정으로 토글 비활성 하드코딩. 백엔드가 향후 채우더라도 현재 UI는 무시(설계 의도).
4. **권한 게이트**: 진척도 탭만 `canRead('REPORT')` 적용. 형제 분석탭(issue/resource)은 현행 무게이트 유지(§6 #9). `ProjectDetailTabs.jsx`가 권한값 주입.
5. **coworkerFieldId**: invoke에 전달되나, 백엔드가 이 값으로 협업자 JQL을 구성하는지(이슈 누락 방지) 통합 검증 권장. 미준비 시 invoke disabled.
6. **위험 이슈 필터 정의**: 기한초과미완료=`statusKey!=='done' && delayDays>0`, 공수편차=`effortDeviationMd>0`. 백엔드 `delayDays`(미완료는 today-due) 정의와 일치 가정.
7. **i18n**: 신규 키는 kr/en projectDetail.json + merge 산출물에 반영됨. merge 미실행 상태로 배포 시 키 누락 가능 — prebuild가 자동 실행하므로 build 경로는 안전.
