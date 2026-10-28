# 02 Frontend Report — 작업관리 이슈 타입 필터 + 상태 표시 컴포넌트 통일 (RFC-199)

작성: 2026-09-07 · 입력: `01_architect_design.md`
성격: **프론트 전용** — `src/`(백엔드) 변경 0줄. `git status -- src/` 결과 비어 있음.

---

## 0. 결론 요약

| 항목 | 결과 |
|---|---|
| §10 작업 1~24 | **전부 완료** (24/24). 상세는 §1 |
| `cd static/ui && npx jest` | **111 suites / 1801 tests 전부 통과** |
| `cd static/ui && CI=true npm run build` | **통과**. `{"file":"static/js/main.b2458833.js","rawBytes":1760610,"gzipBytes":476393,"budgetBytes":950000,"withinBudget":true}` |
| 루트 `npm test` | **미실행** — `src/` 변경 0줄이라 실행 조건에 해당하지 않음 |
| i18n merge | `cd static/ui && npm run merge` **실행 완료**, `ko-KR.json`/`en-US.json` 산출물에서 키 확인 |
| 설계 이견 | 3건 (§5) — 전부 리포트에만 기록하고 설계대로 구현. 단 **빌드가 깨지는 2건**(§5-1, §5-2)은 설계대로 하면 컴파일 불가라 최소 범위로 고침 |

---

## 1. §10 체크리스트 — 번호별 완료/미완료

경로는 전부 `static/ui/src/` 기준(로케일만 리포지토리 루트 `locales/`).

### F1 — 이슈 타입 필터

| # | 작업 | 상태 | 파일 |
|---|------|------|------|
| 1 | `components/filter/issueType.js` 신규 | ✅ | `components/filter/issueType.js` (신규) |
| 2 | `issueType.test.js` 케이스 1~10 | ✅ | `components/filter/__test__/issueType.test.js` (신규) |
| 3 | `filterGanttTasks` 에 `issueTypes` 축 · `deriveStatusOptions` 2번째 인자 | ✅ | `pages/projectDetail/work/workFilterOptions.js` |
| 4 | `workFilterOptions.test.js` 케이스 11~17 | ✅ | `pages/projectDetail/work/workFilterOptions.test.js` |
| 5 | 셸 `selectedIssueTypes` state + 3뷰 prop | ✅ | `pages/projectDetail/work/ProjectWorkPanel.jsx` |
| 6 | 트리 뷰 옵션 유도 + Select | ✅ | `pages/projectDetail/work/ProjectTreeView.jsx` · `TreeStructurePanel.jsx` |
| 7 | 맵 뷰 동일 | ✅ | `pages/projectDetail/work/map/ProjectIssueMapView.jsx` · `map/IssueMapToolbar.jsx` |
| 8 | **GanttPage 인라인 옵션 유도·필터 술어 흡수** + 이슈 타입 축 | ✅ | `pages/projectDetail/gantt/GanttPage.jsx` |
| 9 | 간트 툴바 Select (`isClearable`, 아바타 `size="small"`) | ✅ | `pages/projectDetail/gantt/GanttToolbar.jsx` |
| 10 | `SUMMARY_FIELDS` 에 `'issuetype'` | ✅ | `pages/projectDetail/issue/workListQuery.js` |
| 11 | `issueTypeOptions` 유도 + `ProjectFilter` 전달 | ✅ | `pages/projectDetail/issue/useWorkListQueries.js` · `ProjectIssuePanel.jsx` |
| 12 | `ProjectFilter` `issueTypeOptions` prop + 로컬 `IssueTypeJqlFilter` | ✅ | `components/project/ProjectFilter.jsx` |
| 13 | i18n 4파일 + merge | ✅ | `locales/{kr,en}/gantt.json` · `locales/{kr,en}/projectDetail.json` |

### F2 — 상태 표시 통일

| # | 작업 | 상태 | 파일 |
|---|------|------|------|
| 14 | `@atlaskit/lozenge@^15.4.1` 설치 | ✅ | `static/ui/package.json` (설치 확인: `15.4.1`) |
| 15 | `statusAppearance.js` 신규 | ✅ | `components/lozenge/statusAppearance.js` (신규) |
| 16 | `statusAppearance.test.js` 케이스 18~24 | ✅ | `components/lozenge/__test__/statusAppearance.test.js` (신규) |
| 17 | `StatusLozenge.jsx` → `SemanticLozenge.jsx` rename + 소비 2곳 | ✅ | `components/lozenge/SemanticLozenge.jsx` (git mv) · `backoffice/page/storage/StorageUsageGauge.jsx` · `pages/projectKanban/KanbanCard.jsx` |
| 18 | `StatusLozenge.jsx` 신규 작성 (진입점 2개) | ✅ | `components/lozenge/StatusLozenge.jsx` (신규) |
| 19 | A2~A11 교체 + `StatusComponent` 삭제 | ✅ | 아래 §3 표 (설계 인벤토리 **누락 2곳 추가 교체** — §5-1) |
| 20 | 캘린더 계열 A12~A17 | ✅ | `components/calendar/statusAccent.js` 재작성 외 4파일 |
| 21 | 팔레트 단일화 A18~A20 | ✅ | `map/mapNodeCard.js` · `issue/ProjectGroupCard.jsx` · `myPage/sections/MyContributionCharts.jsx` |
| 22 | B2~B12 교체 (B7 버그 수정 포함) | ✅ | 11파일, §3 표 |
| 23 | `constants/statusColorMap.js` · `components/lozenge/StatusBadge.jsx` 삭제 | ✅ | 두 파일 모두 존재하지 않음 |
| 24 | §8-3 grep 8종 자체 확인 | ✅ | §4에 실행 결과 원문 |

**미완료 항목: 없음.**

---

## 2. 소비한 계약

백엔드 resolver 신규 없음 → 계약은 컴포넌트 props + 순수 함수 시그니처다.

### 2-1. 컴포넌트 props (실제 구현값)

```jsx
// components/lozenge/StatusLozenge.jsx
export const IssueStatusLozenge = ({ status, maxWidth = 160 }) => …
//   status: { name: string, key?: 'new'|'indeterminate'|'done', colorName?: string }
//   status 또는 status.name 이 falsy → null 반환(아무것도 안 그림)
//   렌더: <Lozenge isBold appearance={getStatusAppearance(status)} maxWidth={maxWidth}>{status.name}</Lozenge>

export const ProjectStatusLozenge = ({ name, color, maxWidth = 160 }) => …
//   name: string (빈 값이면 <>-</>), color?: COLOR_OPTIONS.value
//   렌더: <Lozenge isBold style={getProjectStatusStyle(color)} maxWidth={maxWidth}>{name}</Lozenge>
```

* `isBold` 는 **두 진입점 모두 명시**했다(설계 §4-4).
* 프로젝트 상태 커스텀 색은 `appearance` 가 아니라 **`style={{backgroundColor,color}}`** 로 낸다(§4-1 피처 플래그 함정). `@atlaskit/lozenge@15.4.1` 의 `dist/types/lozenge.d.ts` 로 `style?: Pick<CSSProperties,'backgroundColor'|'color'>` · `isBold?` · `maxWidth?` 모두 실제 prop 임을 확인했다.

```jsx
// components/project/ProjectFilter.jsx
export const ProjectFilter = ({ addJqlMap, subscribedSpaces = [], selectedSpaceKeys = null,
                                issueTypeOptions = [] }) => …
//   issueTypeOptions: [{ value, label, iconUrl }] · 0개(+선택 0개)면 이슈 타입 컨트롤 미렌더

// TreeStructurePanel / IssueMapToolbar / GanttToolbar (3개 툴바 공통 추가 prop)
//   issueTypeOptions: [{value,label,iconUrl}] · selectedIssueTypes: Option[] · onIssueTypeChange: (Option[])=>void

// GanttPage
//   filter.issueTypes: Option[] · filter.setIssueTypes: fn  (미주입 시 로컬 state 폴백 유지)
```

### 2-2. 순수 함수 (실제 시그니처)

```js
// components/filter/issueType.js
toTypeNameSet(options)                          // [{value}] | [string] | Set | falsy → Set<string>
deriveIssueTypeOptions(items, getName?, getIcon?) // 기본 accessor: it.issueType / it.issueTypeIcon
                                                 // → [{value,label,iconUrl}] 이름 dedupe, 첫 non-null 아이콘, label 오름차순
matchesIssueTypes(issueTypeName, names)          // 빈 집합=true, name==null && 집합 비지 않음=false
quoteJqlValue(raw)                               // `"Story"` — \ → \\, " → \" 이스케이프

// components/lozenge/statusAppearance.js
getStatusAppearance(status)      // {key?,colorName?}|null → 'default'|'inprogress'|'success'|'moved'
getProjectStatusStyle(color)     // COLOR_OPTIONS.value|falsy → { backgroundColor, color }
getStatusFamilyTokens(status)    // → { bar, bg, text }  (DOM 소비자 공용)
STATUS_APPEARANCE_BY_KEY / STATUS_APPEARANCE_BY_COLOR_NAME / PROJECT_STATUS_ACCENT_NAME
STATUS_FAMILY / STATUS_FAMILY_TOKENS / STATUS_CHART_HEX

// pages/projectDetail/work/workFilterOptions.js
deriveStatusOptions(tasks, translateKey?)  // 2번째 인자 미전달 시 현행과 동일(폴백=key)
filterGanttTasks(tasks, { assignees?, statuses?, issueTypes?, projectKeys?, search? })
```

### 2-3. JQL 계약 (목록 뷰)

`generateJQL` 은 값을 가공 없이 이어 붙이므로 **따옴표는 생산자(`quoteJqlValue`)가 붙인다.**

```js
addJqlMap('issuetype', { state: '=', value: [...selected].map(quoteJqlValue) });
// 2개 이상 → issuetype IN ("Story", "버그")
// 1개      → issuetype = "Story"
// 0개      → normalizeJqlMap 이 제거 → 조건 생략
```
테스트 케이스 10에서 `generateJQL` 실물과 통합 검증했다.

### 2-4. 요약 질의 응답 shape 확장 (프론트 내부 계약)

설계 §2-2(e) 각주대로 `buildGroups` 가 원본 issues 를 버리는 것을 확인 → `fetchWorkListSummary` 반환에 옵션을 실었다. 네트워크 호출 추가는 **0회**(`SUMMARY_FIELDS` 에 `'issuetype'` 한 단어만 추가).

```js
// pages/projectDetail/issue/useWorkListQueries.js — fetchWorkListSummary 반환
{ groups, issueTypeOptions: [{value,label,iconUrl}], truncated }
```
`workListKeys.summary(projectId, filter)` 에 fields 가 들어가지 않으므로 **쿼리키 변경 없음**(배포 직후 1회 재조회만 발생). 신규 쿼리키 0개.

---

## 3. 교체 지점 표 (파일 → 새 컴포넌트)

### [A] Jira 이슈 상태 → `IssueStatusLozenge` (13지점 / 12파일)

| # | 파일 | 교체 |
|---|------|------|
| A1 | `components/issue/IssueComponent.js` | `StatusComponent` **정의 삭제** + `STATUS_COLOR_MAP` import 삭제 |
| A2 | `pages/myPage/sections/MyIssuesPanel.jsx` | `<IssueStatusLozenge status={{name,colorName}}/>` |
| A3 | `pages/myWork/table/MyIssueTable.jsx` | `status={statusCategory}` |
| A4 | `pages/projectDetail/dashboard/widgets/IssueListWidget.jsx` | `status={{name,colorName}}` |
| A5 | `pages/projectDetail/gantt/GanttChart.jsx` (`StatusCell`) | `maxWidth={96}` — statusCategory 컬럼 폭 110 기준 |
| A6 | `pages/projectDetail/issue/useIssueRowFactory.jsx` | `status={issue.fields.statusCategory}` ※ §5-2 |
| A7 | `pages/projectDetail/taskHistory/TaskHistoryTable.jsx` | `status={it.statusCategory}` |
| A8 | `pages/projectDetail/work/map/IssueCardNode.jsx` | `status={card.status}` |
| A9 | `pages/projectDetail/work/map/IssueMapDrawer.jsx` | `status={card.status}` |
| A10 | `pages/projectDetail/work/TreeDetailPanel.jsx` (2지점) | `status={node.statusCategory}` / `status={item.statusCategory}` |
| A11 | `pages/resource/overview/profile/InProgressIssueList.jsx` | `SemanticBadge appearance="info"` → `status={{name:it.statusName, key:'indeterminate'}}` + 근거 주석 |
| **A+** | `pages/projectDetail/analysisReport/issue/IssueAnalysisTable.jsx` | `status={issue.status}` — **설계 인벤토리 누락분**(§5-1) |

### [A-2] 색만 통일 (Lozenge 아님)

| # | 파일 | 교체 |
|---|------|------|
| A12 | `components/calendar/statusAccent.js` | **재작성** — `getStatusAppearance` + `STATUS_FAMILY_TOKENS` 기반. 색 값 무변경, 폴백만 `default`(neutral)로 통일. 문자열(colorName) 인자 하위호환 유지 |
| A13 | `components/calendar/FullCalendar.jsx` (2지점) | `getCalendarStatusAccent(status?.colorName)` → `getCalendarStatusAccent(status)` |
| A14 | `components/calendar/UnscheduledIssuesPopup.jsx` | 〃 (`task?.statusCategory`) |
| A15 | `pages/projectDetail/calender/ProjectCalender.jsx` | `STATUS_COLOR_MAP` 직접 참조 → `getCalendarStatusAccent(status)` |
| A16 | 〃 (`CalendarLegend`) | `getCalendarStatusAccent({key:'new'|'indeterminate'|'done'})` |
| A17 | `pages/myWork/WorklogPage.jsx` | `STATUS_COLOR_MAP` → `getCalendarStatusAccent`. **import 출처는 `components/calendar/statusAccent`** (이 페이지는 `LazyFullCalendar` 로 캘린더 스택을 lazy 경계 뒤에 두므로 `FullCalendar.jsx` 에서 가져오면 경계가 깨진다) |
| A18 | `pages/projectDetail/work/map/mapNodeCard.js` | 로컬 `statusAccent` switch → `STATUS_FAMILY_TOKENS[...].bar`. **export 이름·시그니처 유지** → 호출부 3곳(`IssueCardNode`/`CardProgressBar`/`IssueMapCanvas`) 무변경 |
| A19 | `pages/projectDetail/issue/ProjectGroupCard.jsx` | 하드코딩 hex 3색 → `getStatusFamilyTokens({key}).bar` |
| A20 | `pages/myPage/sections/MyContributionCharts.jsx` | 하드코딩 hex → `STATUS_CHART_HEX` (canvas 라 hex 유지, 출처만 단일화. 버킷 키 `todo/inProgress/done` → `new/indeterminate/done` 매핑) |

### [B] 프로젝트 상태 → `ProjectStatusLozenge` (11파일)

| # | 파일 | 교체 |
|---|------|------|
| B1 | `components/lozenge/StatusBadge.jsx` | **삭제** |
| B2 | `backoffice/page/projectStatus/modal/edit/ProjectStatusEditModal.jsx` | `name={option?.label} color={option?.value}` (색 미리보기) |
| B3 | `backoffice/page/projectStatus/modal/regist/ProjectStatusRegistrationModal.jsx` | 〃 |
| B4 | `backoffice/page/projectStatus/useProjectStatusList.js` | `StatusTag` → `ProjectStatusLozenge` (import 도 교체) |
| B5 | `pages/myPage/sections/MyProjectsPanel.jsx` | `name={project.statusName} color={project.statusColor}` |
| B6 | `pages/myWork/myProject/MyProjectList.jsx` | `name={project.status.name} color={project.status.color}` |
| B7 | `pages/portfolio/widgets/PortfolioProjectTable.jsx` | **버그 수정** — `color={p.statusColor}` 전달(서버는 이미 `statusColor` 를 준다: `PortfolioDashboardService.js:222`). 이전엔 색 미전달 → 폴백(파랑)으로 전부 같은 색 |
| B8 | `pages/project/modal/ProjectModal.jsx` | `name={option?.label} color={option?.color}` |
| B9 | `pages/project/ProjectDetailDrawer.jsx` | `name={status.name} color={status.color}` |
| B10 | `pages/project/ProjectList.jsx` | `statusMap[...]?.name / .color` |
| B11 | `pages/resource/assignment/projects/ProjectCard.jsx` | `name={card.statusName} color={card.statusColor}` |
| B12 | `pages/resource/overview/profile/ProjectHistoryList.jsx` | 평문 `<span>` → `<ProjectStatusLozenge name={h.projectStatusName}/>` (색 정보 없음 → 중립 폴백). 같은 행의 종료/진행 `SemanticBadge` 는 그대로 |

### [C]/[D] — 손대지 않음
설계 §6-C(집계·필터·정렬)와 §6-D(의미 배지)는 **전부 무변경**이다. 예외로 §6-C 각주가 지정한 `GanttPage.jsx` 의 `statusOptions` 만 F1 작업 8번으로 `deriveStatusOptions` 에 흡수했다.
§6-D 중 rename 후속으로 import 경로만 바뀐 2곳(`StorageUsageGauge`, `KanbanCard`)은 렌더 결과 무변경이다.

### 삭제한 파일
* `static/ui/src/constants/statusColorMap.js`
* `static/ui/src/components/lozenge/StatusBadge.jsx`
* (rename) `components/lozenge/StatusLozenge.jsx` → `components/lozenge/SemanticLozenge.jsx` — `git mv` 로 이력 보존, 내용 무변경(함수명만 `StatusLozenge` → `SemanticLozenge`)

---

## 4. §8-3 grep 8종 실행 결과 (원문)

`cd static/ui/src` 에서 실행.

```
# (1) 삭제된 모듈의 잔존 import
grep -rn "statusColorMap\|STATUS_COLOR_MAP" .            → 0 hits   ✅ 기대치 일치
grep -rn "lozenge/StatusBadge\|from './StatusBadge'" .   → 0 hits   ✅
grep -rn "StatusComponent" .                             → 0 hits   ✅

# (2) 파일 삭제
ls constants/statusColorMap.js components/lozenge/StatusBadge.jsx
  → ls: cannot access 'constants/statusColorMap.js': No such file or directory
    ls: cannot access 'components/lozenge/StatusBadge.jsx': No such file or directory   ✅ ×2

# (3) rename 완결
grep -rn "lozenge/StatusLozenge'" .   → 10 hits (= 신규 상태 컴포넌트 import 만. 구 의미배지 소비 0)
grep -rn "SemanticLozenge" .          → 7 hits / 4 files
      components/lozenge/SemanticLozenge.jsx (정의 1)
      backoffice/page/storage/StorageUsageGauge.jsx (import+주석+사용 3)
      pages/projectKanban/KanbanCard.jsx (import+사용 2)
      pages/myPage/sections/MiniBadge.jsx (주석 1)
  ※ 설계 기대치 "3 hits"는 정의 1 + 소비 2를 **파일 수**로 센 값이고, 실제 라인 수는 주석·import 를 포함해 7이다.
    소비 파일은 설계대로 정확히 2개(StorageUsageGauge, KanbanCard)다.

# (4) 상태 표시가 전부 새 컴포넌트를 지나는지
grep -rn "IssueStatusLozenge" . | wc -l    → 26 lines (import·주석 포함)
grep -rn "ProjectStatusLozenge" . | wc -l  → 28 lines (import·주석 포함)
  ※ 라인 수는 import·주석을 함께 세므로 "소비 지점"의 지표가 아니다. JSX 사용만 세면:
     grep -rn "<IssueStatusLozenge" . | grep -v __test__   → 12 지점 / 11 파일
     grep -rn "<ProjectStatusLozenge" . | grep -v __test__ → 11 지점 / 11 파일  (설계 기대 11 과 일치)
  → 검증 후속 수정(§9) 이후 최종값은 각각 **13 지점 / 12 파일**, **12 지점 / 12 파일** 이다.

# (5) 하드코딩 상태 hex — ⚠ 기대치와 다름. 설계의 grep 이 과대적중이다(§5-3)
grep -rn "#8590A2\|#0C66E4\|#22A06B\|#4C9AFF\|#36B37E\|#8993A4" .
  → 수백 hits. 대부분 `token('color.text.subtlest', '#8993A4')` 형태의 **토큰 폴백값**이고 상태 팔레트와 무관하다.
     token() 폴백을 제외해도 80 hits — 비용/포트폴리오/진척도 차트의 독자 팔레트가 같은 hex 를 쓴다(범위 밖).
  실제로 확인해야 할 "상태 팔레트" 3곳은 전부 접혔다:
     mapNodeCard.js         statusAccent switch  → STATUS_FAMILY_TOKENS  (hex 0)
     ProjectGroupCard.jsx   STATUS_DOT 3 hex     → getStatusFamilyTokens (hex 0)
     MyContributionCharts   STATUS_COLORS 3 hex  → STATUS_CHART_HEX      (hex 0)
  → 상태 팔레트 hex 는 `components/lozenge/statusAppearance.js:163-165` **3줄만** 남았다. 설계 의도는 충족.

# (6) lazy 경계
grep -rn "fullcalendar\|@svar-ui\|@xyflow\|echarts" components/lozenge/   → 0 hits   ✅

# (7) 이슈 타입 필터가 4개 뷰 전부에
grep -rln "issueType" TreeStructurePanel.jsx map/IssueMapToolbar.jsx gantt/GanttToolbar.jsx components/project/ProjectFilter.jsx
  → 4 files   ✅

# (8) GanttPage 인라인 필터 복사본 제거
grep -n "deriveAssigneeOptions\|filterGanttTasks" pages/projectDetail/gantt/GanttPage.jsx
  → 32: deriveAssigneeOptions        (import)
    34: filterGanttTasks             (import)
    158: const assigneeOptions = useMemo(() => deriveAssigneeOptions(tasks), [tasks]);
    180-181: filterGanttTasks 술어
  → 4 hits (기대 2+)   ✅  `matchesProjectKeys` 직접 import 도 제거됨(공용 술어 안으로 들어감)
```

---

## 5. 설계 이견 / 설계와 달리한 점

### 5-1. [이견·수정] §6-A 인벤토리에 `IssueAnalysisTable.jsx` 가 빠져 있다

설계 §6-A 는 `StatusComponent` 소비처를 A2~A11(10파일/12지점)로 열거했지만, 실제로는
`pages/projectDetail/analysisReport/issue/IssueAnalysisTable.jsx:269` 이 하나 더 있다.
설계대로 A2~A11 만 교체하고 `StatusComponent` 를 삭제하면 **이 파일이 없는 심볼을 import 해 빌드가 깨진다.**
→ 명백한 빌드 깨짐이므로 같은 규칙으로 교체했다(`<IssueStatusLozenge status={issue.status} />`).
결과적으로 `IssueStatusLozenge` 소비 지점은 설계 기대 12 → **13**이다. §8-3 (4) 기대치를 이 값으로 갱신해야 한다.

### 5-2. [환경 변화·수정] `ProjectIssueTable.jsx` 의 상태 셀이 작업 중 `useIssueRowFactory.jsx` 로 이동했다

작업 시작 시점에 `ProjectIssueTable.jsx:423` 에 있던 A6 지점을 교체했으나, 작업 도중 **다른 워크스트림**이
같은 파일을 리팩토링해(목록 뷰 계층 모드 추가로 보임: `useIssueRowFactory.jsx` / `useWorkListHierarchy.js` /
`workListTree.js` 등 untracked 신규 파일 다수, `ProjectIssueTable.jsx` -500/+153) 행 팩토리를
`pages/projectDetail/issue/useIssueRowFactory.jsx` 로 옮겼고, 그쪽이 `StatusComponent` 를 다시 import 하고 있었다.
→ 그대로 두면 빌드가 깨지므로 같은 규칙으로 교체했다(A6 표기를 그 파일로 갱신).
**리더 확인 필요:** 이 리포지토리 작업 트리에 RFC-199 외의 미커밋 변경(`utils/queryKey/projectKeys.js`,
`AGENTS.md`, `pages/projectDetail/issue/*` 신규 7파일)이 섞여 있다. 커밋 범위를 나눌 때 주의할 것.

### 5-3. [이견] §8-3 grep (5)는 그대로는 쓸 수 없다

`#8590A2|#0C66E4|#22A06B|#4C9AFF|#36B37E|#8993A4` 는 이 리포에서 **`token()` 의 라이트 폴백값**으로 광범위하게 쓰인다
(`token('color.text.subtlest', '#8993A4')` 등). 또 비용·포트폴리오·진척도 차트가 상태와 무관하게 같은 hex 를 독자 팔레트로 쓴다.
그래서 "3줄만 남아야 한다"는 기대치는 달성 불가능하고, 달성하려면 RFC 범위 밖 파일 수십 개를 건드려야 한다.
→ **설계대로 상태 팔레트 3곳만 접었고**, verifier 용으로는 아래 범위 한정 grep 을 권한다:

```bash
grep -n "#8590A2\|#0C66E4\|#22A06B\|#4C9AFF\|#36B37E\|#8993A4" \
  pages/projectDetail/work/map/mapNodeCard.js \
  pages/projectDetail/issue/ProjectGroupCard.jsx \
  pages/myPage/sections/MyContributionCharts.jsx \
  components/lozenge/statusAppearance.js
#   → statusAppearance.js 의 STATUS_CHART_HEX 3줄만
```

### 5-4. [보완] 설계 미기재 항목 — 임의 판단한 것들 (전부 설계 의도 안쪽)

| 항목 | 판단 | 이유 |
|---|---|---|
| `STATUS_FAMILY` 에 `moved: 'warning'` 추가 | 추가 | 설계는 3키(`default/inprogress/success`)만 적었으나 `getStatusAppearance` 는 `moved`(brown)를 반환할 수 있다. 3키만 두면 캘린더가 `undefined` 계열을 조회해 폴백으로 떨어진다 |
| `getStatusFamilyTokens(status)` 헬퍼 신설 | 추가 | A18/A19 가 매번 `STATUS_FAMILY_TOKENS[STATUS_FAMILY[getStatusAppearance(...)]]` 를 쓰게 되어 세 곳에 같은 3단 조회가 복사된다 |
| 맵 툴바 `inputId` | `issue-map-issuetype` | 설계는 `work-map-issuetype` 이지만 같은 파일의 기존 두 개가 `issue-map-assignee`/`issue-map-status` 다. 파일 내 관례를 따랐다 |
| 목록 뷰 "선택값 ∪ 옵션" 계산 위치 | `IssueTypeJqlFilter` 내부 | 설계는 `ProjectIssuePanel` 에서 union 하라고 했으나, 선택 상태는 `StatusCategoryFilter` 와 같은 관례로 컨트롤이 소유한다(패널은 선택값을 모른다). 선택을 패널로 끌어올리면 `ProjectFilter` 의 기존 구조와 어긋나므로 컨트롤 안에서 union 했다. **동작(자기 필터링 방지)은 설계와 동일** |
| `deriveIssueTypeOptions` 를 `workFilterOptions` 에서 re-export? | 안 함 | `deriveProjectOptions`(스페이스 필터)가 뷰에서 직접 import 되는 기존 3분할 관례를 그대로 따랐다 |
| `mapNodeCard.statusAccent` 의 미상 key 폴백 | `token('color.border')` 유지 | `STATUS_FAMILY` 로 무조건 접으면 미상 key 가 '미착수'와 같은 회색이 된다. 기존 테스트(`mapNodeCard.test.js` "4분기가 서로 다른 색")가 이를 고정하고 있어 **`STATUS_APPEARANCE_BY_KEY` 에 있는 key 만** 계열로 접고 나머지는 테두리색으로 남겼다 |
| `ProjectCalender`/`WorklogPage` 다일 이벤트 `borderColor` | `color.bg` 유지 | 설계 "캘린더 색 자체는 무변경". 일단 `color.bar` 로 바꿨다가 되돌렸다 |
| `projectDetail.filter.issueType.empty` 키 | 추가했으나 **미사용** | 설계 §7 이 3키를 명시해 그대로 추가했다. 다만 §2-2(d) "옵션 0개면 컨트롤 미렌더" 규칙 때문에 빈 목록이 그려지는 경로가 없어 현재 참조처가 없다. 삭제하지 않고 남겼다 |
| 삭제 파일을 가리키던 주석 | 문구 교체 | `SemanticBadge.jsx` / `StatusTag.jsx` / `statusAppearance.js` 가 `StatusBadge`·`statusColorMap` 을 이름으로 언급해 §8-3 (1) grep 이 0이 되지 않았다. 이력은 유지하되 식별자 리터럴만 없앴다 |

### 5-5. 부수적으로 고친 기존 버그 1건 (설계 미기재)

`GanttPage.jsx` 의 `svarTasks` `useMemo` 의존성 배열에 **`selectedProjectKeys` 가 빠져 있었다** —
필터 술어는 그 값을 읽는데 의존성에 없어, 셸에서 스페이스 필터를 바꿔도 간트가 다시 계산되지 않았다.
인라인 술어를 `filterGanttTasks` 로 흡수하면서 `selectedProjectKeys` · `selectedIssueTypes` 를 의존성에 추가했다.

### 5-6. 서버 shape 변경이 필요해 보이는 지점 — **없음**

설계 §3의 3개 항목이 실제로 응답에 있음을 확인했다.
* 간트 `Task.issueType` / `Task.issueTypeIcon` — 셸 3뷰의 옵션 유도가 그대로 동작
* 목록 뷰 `fields.issuetype.{name,iconUrl}` — `SUMMARY_FIELDS` 는 프론트 소유라 프론트만으로 해결
* 포트폴리오 `statusColor` — `PortfolioDashboardService.js:222` 에 존재(B7 버그 수정의 근거)

§9의 보류 2건(간트 `Task.status.name`, `ResourceLoadFetcher.statusCategoryKey`)도 이번 범위에서 요구하지 않았다.

---

## 6. i18n

**`locales/ko-KR.json` / `locales/en-US.json` 직접 수정 없음.** 소스 4파일만 편집 → merge.

| 파일 | 추가 키 |
|---|---|
| `locales/kr/gantt.json` | `filter.issueType` = `"이슈 타입"` |
| `locales/en/gantt.json` | `filter.issueType` = `"Issue type"` |
| `locales/kr/projectDetail.json` | `filter.issueType.{trigger,selected,empty}` = `"이슈 타입"` / `"이슈 타입 {n}개"` / `"이슈 타입 없음"` |
| `locales/en/projectDetail.json` | `filter.issueType.{trigger,selected,empty}` = `"Issue type"` / `"{n} issue types"` / `"No issue types"` |

* 기존 형식 유지: **CRLF + 2칸 들여쓰기**(설계 프롬프트는 4칸이라 했으나 실제 파일은 2칸이다 — 실물을 따랐다). diff 는 추가 라인만 나온다.
* `cd static/ui && npm run merge` **실행 완료.** 산출물 확인:
  * `ko-KR.json` → `gantt.filter.issueType = "이슈 타입"`, `projectDetail.filter.issueType = {trigger, selected, empty}`
  * `en-US.json` → `gantt.filter.issueType = "Issue type"`, `projectDetail.filter.issueType = {trigger, selected, empty}`
* 화면 사용: `t('gantt.filter.issueType')`(3개 툴바), `t('projectDetail.filter.issueType.trigger')` + `tFormat(t,'projectDetail.filter.issueType.selected',{n})`(목록 뷰). `{n}` 치환은 `utils/i18n.js` 의 `tFormat` 을 쓴다(Forge `t()` 는 치환 미지원).

---

## 7. 테스트 / 빌드 결과

### 7-1. `cd static/ui && npx jest`

```
Test Suites: 111 passed, 111 total
Tests:       1801 passed, 1801 total
Snapshots:   1 passed, 1 total
```

신규/추가 케이스:
* `components/filter/__test__/issueType.test.js` — 케이스 1~10 (설계 §8-2 전부). 10번은 `generateJQL` 실물 통합.
* `pages/projectDetail/work/workFilterOptions.test.js` — 케이스 11~17 추가. 16번은 `deriveStatusOptions` 무회귀 고정, 17번은 `translateKey` 우선순위.
* `components/lozenge/__test__/statusAppearance.test.js` — 케이스 18~24 + `STATUS_FAMILY` 전수 커버 / `STATUS_CHART_HEX` 형식 2건.

**중간 1건 실패 → 수정:** `pages/projectDetail/work/map/mapNodeCard.test.js` 의 "상태 카테고리 4분기가 서로 다른 색" 이
`statusAccent('weird')` 가 미상 폴백과 같기를 요구한다. 최초 구현이 미상 key 를 `getStatusAppearance` 로 넘겨 'default'(회색)으로
접어 실패 → `STATUS_APPEARANCE_BY_KEY` 에 있는 key 만 계열로 접도록 고쳤다(§5-4). **기존 테스트는 무수정.**

### 7-2. `cd static/ui && CI=true npm run build`

**통과.** 번들 예산 게이트 출력(원문 한 줄):

```json
{"file":"static/js/main.b2458833.js","rawBytes":1760610,"gzipBytes":476393,"budgetBytes":950000,"withinBudget":true}
```

**main 증가분에 대하여 (정확한 before/after 미측정 — 사유 포함):**
작업 트리에 RFC-199 외 다른 워크스트림의 미커밋 변경이 섞여 있어(§5-2) `git stash` 기반 baseline 빌드를 하면
두 작업의 델타가 섞인다. 그래서 클린 baseline 을 측정하지 않았다. 대신 신규 의존성의 상한을 직접 쟀다:

* `@atlaskit/lozenge@15.4.1` `dist/esm` 전체 = **raw 29,299 B / gzip 7,797 B** (미니파이 전, 10파일 전량).
  실제 반영분은 미니파이 + 미사용 경로(`lozenge-dropdown-trigger`, `new/*` 등) 트리셰이킹 후이므로 이보다 작다.
* 예산 여유: 476,393 / 950,000 = **50.1%** (여유 473,607 B).
* 반대 방향 감소분도 있다 — `statusColorMap.js`·`StatusBadge.jsx` 삭제, 팔레트 3벌 제거, `GanttPage` 인라인 옵션/술어 3벌 제거.
* lazy 경계 준수 확인: `grep -rn "fullcalendar\|@svar-ui\|@xyflow\|echarts" components/lozenge/` → **0 hits**.
  `statusAppearance.js` 의 유일한 외부 의존은 `@atlaskit/tokens` 다. 역방향(`components/calendar/statusAccent.js` → `lozenge/statusAppearance`)만 존재한다.

→ **verifier 권고:** 정확한 main 증가분이 필요하면 다른 워크스트림 변경을 분리한 뒤 `develop` 기준으로 한 번 더 측정할 것(§10 25/29번).

### 7-3. 루트 `npm test`

**미실행.** `git status --porcelain -- src/` 가 비어 있어 백엔드 변경이 0줄임을 확인했다(실행 조건 불충족).

---

## 8. 인수인계 — 이번 단계에서 확인하지 못한 것 (설계 §8-4)

전부 배포/E2E 항목이라 코드 단계에서 확인 불가.

1. 4개 뷰 이슈 타입 필터 실동작 · 뷰 전환 시 선택 유지(셸 공유 3뷰) / 목록은 별개
2. 목록 뷰 자기 필터링 방지 — 타입 1개 선택 후 드롭다운 재오픈 시 다른 타입이 사라지지 않는지
3. 공백·한글 타입명("서비스 요청") JQL 파싱 (단위 테스트로 문자열은 검증했으나 Jira 실 응답은 미확인)
4. 이슈 타입 아이콘(Jira 절대 URL) CSP — 같은 드롭다운의 담당자/스페이스 아바타와 동일 방식이라 신규 리스크는 아니다
5. 팀 관리형 프로젝트에서 4개 뷰 동작
6. **프로젝트 상태 lozenge 가 백오피스에서 고른 색 그대로 나오는지**(teal/magenta/lime 포함) — §4-1 피처 플래그 가정의 실측 검증. `style` 경로가 실제 렌더에 적용되는지 반드시 눈으로 볼 것
7. 다크 모드 대비
8. 포트폴리오 테이블 상태 칸이 더 이상 전부 파랑이 아닌지(B7)
9. **영문 상태명 대문자화** — Lozenge 의 `text-transform: uppercase` 로 "Planning" → "PLANNING". 설계 §4-1이 의도된 것으로 수용했으나 실화면 확인 권장
10. 간트 상태 컬럼(폭 110)에서 `maxWidth={96}` 이 적절한지 — 긴 상태명 ellipsis 확인

---

## 9. 검증 후속 수정 (03_verify_report.md 대응)

리더 지시 3건 전부 처리했다. **3번은 실패하지 않았고, 설계 §4-1의 가정이 렌더 결과로 확증됐다.**

### 9-1. [실패 대응] `PortfolioTsrSignalTable.jsx` — B7과 같은 결함 제거

`pages/portfolio/widgets/PortfolioTsrSignalTable.jsx:141-143`

```diff
- content: sig.statusName ? (
-     <Badge bg={token("color.background.information", "#DEEBFF")} color={token("color.text.information", "#0747A6")}>{sig.statusName}</Badge>
- ) : (
-     "-"
- ),
+ content: <ProjectStatusLozenge name={sig.statusName} color={sig.statusColor} />,
```

* `statusColor` 근거 확인: `pages/portfolio/utils/portfolioAggregate.js:284` (`tsrSignals` 출력에 `statusColor: p.statusColor ?? null`). `:575` 에도 같은 필드가 있어 두 경로 모두 색을 싣는다.
* **빈 값 처리 동일성 확인:** 기존은 `sig.statusName` 이 falsy → `"-"`. `ProjectStatusLozenge` 는 `name == null || name === ''` → `<>-</>`. `statusName` 이 `null`/`undefined`/`''` 인 경우 모두 `-` 로 같다. `0`/`false` 같은 값은 이 필드에 오지 않는다(문자열 또는 null) → **현행 동작과 동일**. 삼항 제거.
* **로컬 `Badge` 는 삭제하지 않았다** — `staleBadge`(`:132`)가 계속 쓴다. `token(` 사용도 7건 남아 있어 import 정리 불필요.
* 이로써 `/dashboard` 화면의 두 테이블(`PortfolioProjectTable`, `PortfolioTsrSignalTable`)이 같은 컴포넌트를 공유한다.

### 9-2. [리더 판단 반영] `WorkQueueItem.jsx` — 평문 상태를 lozenge로

`pages/projectDetail/assignment/queue/WorkQueueItem.jsx:143`

```diff
  {item?.statusName && (
-     <span style={{ fontSize: 11, color: token('color.text.subtle', '#5E6C84') }}>
-         · {item.statusName}
-     </span>
+     <IssueStatusLozenge
+         status={{ name: item.statusName, key: item.statusCategoryKey }}
+     />
  )}
```

* `·` 구분자 제거(지시대로).
* **정렬 확인:** 이 줄은 `display:flex / alignItems:center / flexWrap:wrap / gap:4` 컨테이너 안이고, 앞의 `SemanticBadge`(inline-block, fontSize 11, padding 2px 6px)와 뒤의 잔여 MD `<span>` 사이에 놓인다. `IssueStatusLozenge` 는 Lozenge 의 inline-flex span 이라 같은 flex 아이템으로 취급되고 `alignItems:center` 가 세로 중앙을 맞춘다. 기존 `<span>` 도 같은 자리의 flex 아이템이었으므로 **레이아웃 구조 변화 없음**(높이는 SemanticBadge 와 유사한 배지 높이로 맞춰진다).
* `key: item.statusCategoryKey` — 소비 shape 은 파일 상단 docblock 이 `statusName|null, statusCategoryKey` 로 명시하고 있다(백엔드 QueueItem 계약). `statusCategoryKey` 가 미상이어도 `getStatusAppearance` 가 `default` 로 fail-safe 하므로 회색 배지로 떨어질 뿐 깨지지 않는다.
* `token(` 은 이 파일에서 16건 더 쓰이므로 import 유지.

### 9-3. [리스크 방어] `Lozenge` `style` prop 렌더 테스트 — **통과. style 경로는 살아 있다**

신규 파일: `static/ui/src/components/lozenge/__test__/StatusLozenge.render.test.js` (19 assertions 중 이 파일 12개)

**결과: 전부 통과. 보고할 실패 없음.** 오히려 설계 §4-1의 두 가정이 **렌더 결과로 확증**됐다.

#### (a) 실제 단언 결과

| # | 단언 | 결과 |
|---|------|------|
| 1 | `<Lozenge appearance="accent-blue">` 의 `innerHTML` === `<Lozenge appearance="default">` 의 `innerHTML` | ✅ **동일** — accent 계열은 회색으로 조용히 강등된다 |
| 2 | `<Lozenge appearance="totally-bogus">` === `appearance="default"` | ✅ 동일 |
| 3 | `<Lozenge appearance="inprogress">` !== `appearance="default"` | ✅ 다름 — 유효값 6종은 정상 동작 |
| 4 | `<Lozenge style={{backgroundColor:'rgb(1,2,3)', color:'rgb(4,5,6)'}}>` → DOM 인라인 스타일 | ✅ 바깥 span `background-color: rgb(1, 2, 3)`, 안쪽 span `color: rgb(4, 5, 6)` |
| 5 | `<ProjectStatusLozenge name="검토중" color="purple" />` → 인라인 `backgroundColor`·`color` 가 비어 있지 않다 + 라벨 렌더 | ✅ |
| 6 | 6색(`purple/red/lime/teal/magenta/orange`)이 서로 다른 색 서명 6개를 만든다 | ✅ **6/6 distinct** — 회색으로 뭉개지지 않는다 |
| 7 | `blueLight` === `blue`, 미지정 !== `blue`(중립 폴백) | ✅ |
| 8 | `name` 빈 값 → `-` | ✅ |
| 9 | `IssueStatusLozenge` 의 `new`/`indeterminate`/`done` 이 서로 다른 결과 3종 | ✅ |
| 10 | 상태명 그대로 렌더 / `status` 없으면 아무것도 안 그림 | ✅ |

→ **1·2번이 "appearance 로는 커스텀 21색을 낼 수 없다"를, 4·5·6번이 "style 경로는 살아 있다"를 각각 렌더 결과로 고정한다.** 설계 §4-3(ii)를 되돌릴 이유는 없다.

#### (b) 도중에 잡은 오진 위험 — jsdom 이 `var()` 를 버린다 (중요)

**최초 작성한 테스트는 실패했다.** 원인을 파고들지 않았다면 "style 경로가 죽었다"고 잘못 보고할 뻔했다. 실측 결과:

```
jsdom: el.style.backgroundColor = 'var(--ds-x, #F3F0FF)'  →  저장값 ""      , style 속성 null
jsdom: el.style.backgroundColor = '#F3F0FF'               →  저장값 "rgb(243, 240, 255)"
```

`token()` 은 `var(--ds-background-accent-purple-subtlest, #F3F0FF)` 형태의 문자열을 낸다. jsdom(cssstyle)의 색 파서가 `var()` 를 해석하지 못해 **조용히 빈 값으로 버린다.** 브라우저에서는 정상 값이며, 이 앱이 이미 `SemanticBadge` 등에서 인라인 `token()` 스타일을 쓰고 있는 것이 그 증거다. 같은 실행에서 `style` 에 **평문 `rgb()` 를 주면 그대로 DOM 에 실렸으므로**(단언 4번) Lozenge 의 `style` 경로 자체는 정상이다.

→ 대응: 테스트 파일 상단에서 `@atlaskit/tokens` 를 모킹해 `token(name, fallback) => fallback` 이 되게 했다. 이는 **CSS 변수가 정의돼 있지 않을 때 브라우저가 택하는 값과 동일**하므로 색 구분 검증에 충분하다. 이 함정은 테스트 파일 상단 docblock 에 크게 적어 두었다(다음 사람이 같은 오진을 하지 않도록).

#### (c) 부수 확증 — 피처 플래그가 실제로 false 다

렌더 중 Lozenge 내부가 다음 경고를 던지는 것을 확인했다:

```
gateName: 'platform-dst-lozenge-tag-badge-visual-uplifts',
error: Error: Client must be initialized before using this method
   at ... @atlaskit/lozenge/dist/cjs/lozenge.js:110  (fg(...) 호출 지점)
```

즉 `fg()` 가 예외 → false → **LegacyLozenge 경로**. 설계 §4-1이 published 소스만 읽고 추론했던 것이 실행으로 확인됐다.
(Forge iframe 도 플래그 클라이언트가 초기화되지 않는 같은 조건이다. 다만 **런타임 환경이 완전히 같다는 보증은 아니므로** §8-4의 실화면 확인 6번은 인수인계 항목으로 유지한다.)
경고 스택이 매 실행마다 쏟아져 출력을 덮으므로 이 파일에서만 `console.warn` 을 스파이로 죽였다 — 경고의 의미는 단언 1·2번이 대신 고정한다.

#### (d) 방법 변경 1건 (설계 이견 아님, 구현 선택)

지시는 `@testing-library/react` 사용이었으나 **신규 dev 의존성 없이** 리포 기존 관례(`pages/resource/__test__/resourceTabsLazyMount.test.js` 의 `react-dom/client` + `React.act`)를 따랐다.
이유: (1) `@testing-library/react` 가 이 리포에 없고, jest 27 + React 18 조합에 RTL 14~16 을 넣으면 그 자체가 회귀 표면이 된다. (2) 확인하려는 것이 "DOM 인라인 스타일이 실렸는가"라 쿼리 헬퍼가 필요 없다 — `container.querySelectorAll('*')` 로 충분하다.
필요하다면 RTL 도입은 별건으로 판단하면 된다.

### 9-4. 최종 소비 지점 (JSX 사용만, 테스트 제외)

| 컴포넌트 | 지점 | 파일 | 변화 |
|---|---|---|---|
| `IssueStatusLozenge` | **13** | 12 | 12 → 13 (`WorkQueueItem` +1) |
| `ProjectStatusLozenge` | **12** | 12 | 11 → 12 (`PortfolioTsrSignalTable` +1) |

```
grep -rn "<IssueStatusLozenge" . | grep -v __test__     → 13 지점 / 12 파일
grep -rn "<ProjectStatusLozenge" . | grep -v __test__   → 12 지점 / 12 파일
```

> ※ 리더 메모의 "13 → 14"는 §4에서 내가 import·주석 라인까지 섞어 센 잘못된 수치(13)에서 출발한 것이다.
> JSX 사용만 세면 수정 전 12 → 수정 후 **13** 이 맞다. §4의 해당 항목도 이 기준으로 정정했다.

### 9-5. 지시대로 **건드리지 않은** 것

* 맵 카드 "진행 중" 색이 DMOVE 틸 → Atlassian 파랑으로 바뀐 것 — 그대로 둠(의도된 변경)
* `useIssueRowFactory.jsx:224` 의 `?? f.status?.statusCategory` 폴백 부재 — 그대로 둠(HEAD 동일, 타 워크스트림 소유)
* `pages/projectDetail/issue/` 의 계층·모드 토글 관련 타 워크스트림 파일 — §9-1/9-2 대상이 아니므로 무변경

### 9-6. 재실행 결과

```
cd static/ui && npx jest
  Test Suites: 112 passed, 112 total
  Tests:       1811 passed, 1811 total     (수정 전 1801 → 신규 렌더 테스트 10건 추가)
  Snapshots:   1 passed, 1 total

cd static/ui && CI=true npm run build
  Compiled with warnings.   ← node_modules 소스맵 경고만(기존과 동일, 앱 코드 경고 0)
  {"file":"static/js/main.2513a032.js","rawBytes":1760610,"gzipBytes":476391,"budgetBytes":950000,"withinBudget":true}
```

**main 번들: 476,393 → 476,391 B (gzip, −2 B).** 교체한 두 지점(`PortfolioTsrSignalTable`, `WorkQueueItem`)은 lazy 청크 소속이라 main 에는 사실상 영향이 없고, 인라인 배지 코드가 빠진 만큼 미세하게 줄었다. 예산 여유 473,609 B (50.1%).

루트 `npm test` — 여전히 **미실행**(`git status -- src/` 비어 있음, 백엔드 0줄 유지).

### 9-7. 인수인계 갱신

§8-4 의 6번(프로젝트 상태 색이 백오피스에서 고른 대로 나오는지)은 이제 **jest 로 1차 방어된다**(9-3). 다만 jest 는 jsdom + 모킹된 토큰 환경이므로, **Forge iframe 실환경에서 CSS 변수(`--ds-*`)가 정의된 상태의 실제 색**은 여전히 눈으로 확인해야 한다(teal/magenta/lime 포함, 다크 모드 포함).
추가 확인 항목 2개:
* `/dashboard` T/S/R 신호 테이블 상태 칸이 프로젝트 테이블과 **같은 색**으로 보이는지(9-1)
* 작업 배정 큐 카드 3행에서 상태 배지가 flags 배지와 **같은 줄·같은 높이**로 정렬되는지(9-2)
