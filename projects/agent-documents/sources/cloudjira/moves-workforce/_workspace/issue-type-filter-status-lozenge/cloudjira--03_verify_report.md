# 03 Verify Report — 이슈 타입 필터 + 상태 표시 통일 (RFC-199)

작성: 2026-09-07 · 검증자: integration-verifier
입력: `01_architect_design.md`(기준) · `02_frontend_report.md`(자기보고) · 작업 트리 실물
브랜치: `RFC-199` · 백엔드 변경: **0줄**(`git status --porcelain -- src/` 비어 있음 — 실측 확인)

---

## 0. 결론

| 분류 | 건수 | 요지 |
|---|---|---|
| **통과** | 26 | §10 작업 1~24 전부 실물 확인. 테스트/빌드/i18n/lazy 경계/grep 8종 모두 기대치 일치 |
| **실패** | 1 | **F-1** 프로젝트 상태 표시 지점 1곳 누락(`PortfolioTsrSignalTable.jsx:141-143`) — 설계 §6-B 인벤토리 자체의 누락 |
| **주의(판단 요청)** | 4 | 실패는 아니나 리더 판단이 필요한 항목 |
| **미검증** | 4 | 번들 증가분 정확치 · E2E 8종 · Jira 응답 필드 실측 2건 |

**자기보고 대조 결과: §10 1~24번 중 "했다고 적혔는데 파일이 안 바뀐 항목은 없다."** 24개 항목 전부 실제 변경으로 뒷받침된다(§1 표).

---

## 1. 자기보고 대조 — §10 작업 1~24 실물 확인

`git status` / `git diff` / 파일 실물 기준. **미이행 0건.**

### F1 — 이슈 타입 필터

| # | 주장 | 실물 확인 | 판정 |
|---|---|---|---|
| 1 | `components/filter/issueType.js` 신규 | untracked 신규 파일 존재. 4함수 전부 export(§5-2 시그니처 일치) | 통과 |
| 2 | 테스트 케이스 1~10 | `components/filter/__test__/issueType.test.js` — `it('1.')`~`it('10.')` 전부 존재 | 통과 |
| 3 | `filterGanttTasks` issueTypes 축 + `deriveStatusOptions` 2번째 인자 | `workFilterOptions.js` diff에서 양쪽 확인. `translateKey` 미전달 시 폴백=key(무회귀) | 통과 |
| 4 | 케이스 11~17 | `workFilterOptions.test.js`에 `test('11.')`~`test('17.')` 존재 | 통과 |
| 5 | 셸 state + 3뷰 prop | `ProjectWorkPanel.jsx` diff — `selectedIssueTypes` state, Tree/Map에 `selectedIssueTypes`/`onIssueTypeChange`, Gantt에 `filter.issueTypes`/`filter.setIssueTypes` | 통과 |
| 6 | 트리 옵션 유도 + Select | `ProjectTreeView.jsx` `deriveIssueTypeOptions(tasks)` + deps에 `selectedIssueTypes` 추가, `TreeStructurePanel.jsx` Select(`work-tree-issuetype`) | 통과 |
| 7 | 맵 동일 | `ProjectIssueMapView.jsx` + `IssueMapToolbar.jsx` Select(`issue-map-issuetype`) | 통과 |
| 8 | GanttPage 인라인 흡수 | `GanttPage.jsx:158-163` — `deriveAssigneeOptions`/`deriveStatusOptions(tasks, k=>t('gantt.status.'+k))`/`deriveIssueTypeOptions` 3개 전부 공용 모듈. `:180-186` `filterGanttTasks` 술어. 인라인 복사본 소멸 | 통과 |
| 9 | 간트 툴바 Select | `GanttToolbar.jsx` — `isClearable`, `Avatar size="small"`(파일 관례) | 통과 |
| 10 | `SUMMARY_FIELDS` | `workListQuery.js:22` `['project','status','issuetype']` | 통과 |
| 11 | 옵션 유도 + 전달 | `useWorkListQueries.js` `fetchWorkListSummary` 반환에 `issueTypeOptions`, `ProjectIssuePanel.jsx:83,159` 전달 | 통과 |
| 12 | `ProjectFilter` + `IssueTypeJqlFilter` | `ProjectFilter.jsx:79-129` 로컬 컨트롤(비-export), `quoteJqlValue` 사용, 옵션 0개면 `null` | 통과 |
| 13 | i18n 4파일 + merge | §7 참조 — 소스·merge 산출물 양쪽 확인 | 통과 |

### F2 — 상태 표시 통일

| # | 주장 | 실물 확인 | 판정 |
|---|---|---|---|
| 14 | `@atlaskit/lozenge@^15.4.1` | `static/ui/package.json` +1, `package-lock.json` +660 | 통과 |
| 15 | `statusAppearance.js` | 신규 파일. 매핑 2표 + `STATUS_FAMILY`(+`moved:'warning'`) + `STATUS_FAMILY_TOKENS` + `STATUS_CHART_HEX` | 통과 |
| 16 | 케이스 18~24 | `components/lozenge/__test__/statusAppearance.test.js` — `it('18.')`~`it('24.')` + 보강 2건 | 통과 |
| 17 | rename + 소비 2곳 | `git status`에 `RM StatusLozenge.jsx -> SemanticLozenge.jsx`. 소비 파일 정확히 2개(`StorageUsageGauge`, `KanbanCard`) | 통과 |
| 18 | `StatusLozenge.jsx` 신규 | 진입점 2개, `isBold` 둘 다 명시, 커스텀 색은 `style` | 통과 |
| 19 | A2~A11 + `StatusComponent` 삭제 | HEAD의 `StatusComponent` 소비 11파일/12지점 전부 교체 + 정의 삭제 확인(아래 §2) | 통과 |
| 20 | 캘린더 A12~A17 | `statusAccent.js` 재작성(`getStatusAppearance` 단일 출처), 호출부 5곳 status 객체 전달 | 통과 |
| 21 | 팔레트 A18~A20 | `mapNodeCard.js` switch 제거, `ProjectGroupCard` hex 제거, `MyContributionCharts` `STATUS_CHART_HEX` | 통과 |
| 22 | B2~B12 (B7 버그 포함) | `ProjectStatusLozenge` 소비 11파일 확인. `PortfolioProjectTable.jsx:105` `color={p.statusColor}` 전달 | 통과 |
| 23 | 2파일 삭제 | `git status` `D statusColorMap.js` / `D StatusBadge.jsx`, `ls` 부재 확인 | 통과 |
| 24 | grep 8종 자체 확인 | 재실행 결과 일치(§4) | 통과 |

---

## 2. 다중 shape 재사용 점검 — `IssueStatusLozenge` 13개 호출부 전수 (최우선)

컴포넌트는 `status.name` **하나만** 렌더한다(`StatusLozenge.jsx:36,39`). `!status || !status.name` 이면 `null` — 조용한 빈 배지가 나올 수 있는 형태다. **13개 호출부 전부 생산 코드까지 거슬러 대조했다.**

| # | 호출부 | 넘기는 객체 | 생산 코드 | `name` 실재? |
|---|---|---|---|---|
| A2 | `pages/myPage/sections/MyIssuesPanel.jsx:139` | `{name: row.statusName, colorName: row.statusColorName}` | 같은 파일 `:74` `f.status?.name`, `:76` `f.status?.statusCategory?.colorName` | ✅ 조립값 |
| A3 | `pages/myWork/table/MyIssueTable.jsx:78` | `statusCategory` | 같은 파일 `:146` `issue.fields.status?.statusCategory` (Jira REST) | ✅ |
| A4 | `pages/projectDetail/dashboard/widgets/IssueListWidget.jsx:110` | `{name: issue.statusName, colorName: issue.statusColorName}` | 서버 집계 응답(짝으로 제공) | ✅ 조립값 |
| A5 | `pages/projectDetail/gantt/GanttChart.jsx:85` | `row.statusCategory` | `ganttAdapter.js:191` ← `GanttMapper.js:99-101` `{key, name, colorName}` | ✅ |
| A6 | `pages/projectDetail/issue/useIssueRowFactory.jsx:224` | `issue.fields.statusCategory` | Jira REST `fields:['*all']` 응답의 **최상위** `statusCategory` | ⚠ §6-M3 |
| A7 | `pages/projectDetail/taskHistory/TaskHistoryTable.jsx:144` | `it.statusCategory` | `taskHistory.transform.js:66` `issue?.fields?.status?.statusCategory` | ✅ |
| A8 | `work/map/IssueCardNode.jsx:124` | `card.status` | `mapNodeCard.js:58` `toIssueCardProps` → `n.statusCategory` ← `buildWorkTree` ← 간트 Task | ✅ |
| A9 | `work/map/IssueMapDrawer.jsx:75` | `card.status` | 〃 | ✅ |
| A10a | `work/TreeDetailPanel.jsx:163` | `node.statusCategory` | `buildWorkTree.js` 계약(`{…, statusCategory, …}`) ← 간트 Task | ✅ |
| A10b | `work/TreeDetailPanel.jsx:926` | `item.statusCategory` | 〃 | ✅ |
| A11 | `resource/overview/profile/InProgressIssueList.jsx:100` | `{name: it.statusName, key:'indeterminate'}` | `useResourceProfile.js:11` 계약에 `statusName` 존재. `key`는 JQL이 진행중만 뽑으므로 상수 확정(주석으로 근거 명시) | ✅ 조립값 |
| A+ | `analysisReport/issue/IssueAnalysisTable.jsx:270` | `issue.status` | `src/resolver/issueAnalysis/IssueAnalysisService.js:89` `status: issue.fields.statusCategory` (전체 객체) | ✅ |

**판정: 통과.** 3종 shape(Jira `statusCategory` / 서버 `{statusName,statusColorName}` / 조립 `{name,key}`)이 섞여 있으나 **모두 `name`을 실제로 갖는다.** 설계가 진입점을 2개로 나눈(`IssueStatusLozenge` / `ProjectStatusLozenge`) 판단이 실제로 효과를 냈다 — 프로젝트 상태 shape(`{name, color}`)이 이슈 진입점으로 새어 들어간 곳이 0이다.

**`?? null`/옵셔널 체이닝이 결함을 삼키는 형태: 발견 없음.** 13곳 중 11곳이 호출 **전에** truthy 가드를 두고(`it.statusCategory ? … : '-'`), 컴포넌트 자체도 `null` 반환으로 fail-safe다. 이전 `StatusComponent`가 `status.colorName`을 무가드 접근했던 것보다 오히려 견고해졌다.

**렌더 계약 무회귀:** 구 `StatusComponent`(HEAD `IssueComponent.js:87-118`)도 `{status.name}` 을 그렸다 — 라벨 의미 변화 없음(설계 가정 A2 준수).

### `ProjectStatusLozenge` 11개 호출부

| 호출부 | `name` | `color` |
|---|---|---|
| `ProjectStatusEditModal.jsx:96` / `ProjectStatusRegistrationModal.jsx:80` | `option?.label` | `option?.value` (COLOR_OPTIONS value) ✅ |
| `useProjectStatusList.js:73` | `row.name` | `row.color` ✅ |
| `MyProjectsPanel.jsx:180-181` | `project.statusName` | `project.statusColor` ← `:79-80` `p.status?.{name,color}` ✅ |
| `MyProjectList.jsx:176-177` | `project.status.name` | `project.status.color` ✅ |
| `PortfolioProjectTable.jsx:105` | `p.statusName` | `p.statusColor` ← `portfolioAggregate.js:574` ✅ **(B7 버그 수정 확인)** |
| `ProjectModal.jsx:308` | `option?.label` | `option?.color` ✅ |
| `ProjectDetailDrawer.jsx:187` | `status.name` | `status.color` ✅ |
| `ProjectList.jsx:66` | `statusMap[…]?.name` | `.color` ✅ |
| `ProjectCard.jsx:110` | `card.statusName` | `card.statusColor` ✅ |
| `ProjectHistoryList.jsx:45` | `h.projectStatusName` | **미전달** — 서버가 색을 주지 않음. `src/resolver/resourceManagement/ResourceManagementService.js:344` 가 `projectStatusName` **만** 싣는다(실측). 중립 폴백이 맞다 ✅ |

`getProjectStatusStyle` 커버리지: `PROJECT_STATUS_ACCENT_NAME` 키 21개 = `COLOR_OPTIONS` value 21개 **정확히 일치**(수기 대조). 미매핑 0.

---

## 3. 동일 데이터 다중 경로 재검색 — **실패 1건**

`statusName` / `statusColor` / `project.status` / `projectStatusName` / `status.color` 로 프론트 전역 재검색했다.

### ❌ F-1 [실패] 프로젝트 상태 표시 지점 1곳 누락 — 설계 §6-B 인벤토리 자체의 누락

**파일:라인:** `static/ui/src/pages/portfolio/widgets/PortfolioTsrSignalTable.jsx:141-143`

```jsx
status: {
    key: "status",
    content: sig.statusName ? (
        <Badge bg={token("color.background.information", "#DEEBFF")} color={token("color.text.information", "#0747A6")}>{sig.statusName}</Badge>
    ) : ( "-" ),
},
```

**무엇이 어긋났나**

* 이것은 **프로젝트 상태**를 그리는 지점이다(`sig.statusName`). 설계 §6-B 인벤토리(B1~B12)에 없어 교체되지 않았다.
* `statusColor` 는 **이미 이 행에 실려 있다** — `static/ui/src/pages/portfolio/utils/portfolioAggregate.js:284` `statusColor: p.statusColor ?? null`.
* 즉 **B7과 완전히 같은 결함**(색이 있는데 안 넘겨 전부 파랑)이 같은 화면(`/dashboard` 전사 통합 대시보드)의 **형제 위젯**에 그대로 남았다.
* 결과: RFC-199 이후 전사 대시보드에서 **프로젝트 테이블은 상태별 색 lozenge, T/S/R 신호 테이블은 전부 파란 사각 배지** — 한 화면 안에서 상태 배지가 두 외형이 된다. 이번 RFC 가 없애려던 실패 모드 그 자체이므로 **실패로 분류한다.**

**수정 방법**

```jsx
// import 추가
import { ProjectStatusLozenge } from "../../../components/lozenge/StatusLozenge";

// :141-143 교체
content: <ProjectStatusLozenge name={sig.statusName} color={sig.statusColor} />,
```

(`ProjectStatusLozenge` 는 name 빈 값이면 `-` 를 그리므로 삼항 분기도 함께 제거 가능. 로컬 `Badge` 컴포넌트는 같은 파일의 `staleBadge`(`:131`)가 계속 쓰므로 **삭제하지 말 것.**)

**설계서 갱신 필요:** §6-B 소비처 수 **11 → 12**, §8-3 grep (4) `ProjectStatusLozenge` 기대치도 그에 맞춰.

### 검색했으나 실패가 아닌 지점 (근거 명시)

| 지점 | 판정 |
|---|---|
| `pages/projectKanban/utils/buildData.js:16` `color: status.color` | **해당 없음.** 칸반 컬럼 메타로만 흐르고 `ColumnHeader.jsx:37,47` 은 `column.title` 을 평문으로 그린다(색 배지 아님). `statusList` 의 color 는 `ProjectModal`(B8, 교체됨)로 흘러간다 |
| `pages/projectDetail/dashboard/widgets/TopologyWidget.jsx:170` `issue.statusName` | **해당 없음.** ECharts 툴팁 텍스트 |
| `pages/resource/allocation/AllocationFilters.jsx:30`, `assignment/projects/projectCardFilter.js:69`, `teamAnalytics/*` | **해당 없음.** 필터 옵션 라벨(§6-C 집계·필터 계열) |
| `utils/projectLifecycle.js:55-66` | **해당 없음.** 종료 판정 로직 |
| `pages/projectDetail/issue/subscription/SubscriptionList.jsx:9,107` | **해당 없음.** 구독 동기화 상태(`lastSyncStatus`)이지 프로젝트/이슈 상태가 아님 |

HEAD 기준 `StatusBadge` 소비 전수(9파일) + `StatusTag`(1) + 평문(1) = 11 → §6-B와 정확히 일치. **삭제된 컴포넌트를 참조하는 잔존 코드는 0이다**(빌드 통과가 이를 뒷받침).

---

## 4. §8-3 grep 8종 — 직접 실행 결과

`cd static/ui/src` 기준. 구현자 §4 보고와 **전부 일치**.

| # | 명령 | 기대 | 실측 | 판정 |
|---|---|---|---|---|
| 1a | `grep -rn "statusColorMap\|STATUS_COLOR_MAP" .` | 0 | **0** | 통과 |
| 1b | `grep -rn "lozenge/StatusBadge\|from './StatusBadge'" .` | 0 | **0** | 통과 |
| 1c | `grep -rn "StatusComponent" .` | 0 | **0** | 통과 |
| 2 | `ls constants/statusColorMap.js components/lozenge/StatusBadge.jsx` | 부재 ×2 | **No such file ×2** | 통과 |
| 3a | `grep -rn "lozenge/StatusLozenge'" .` | 신규 컴포넌트만 | **10 hits, 전부 신규 상태 컴포넌트 import** | 통과 |
| 3b | `grep -rn "SemanticLozenge" .` | 정의1+소비2 | **7 lines / 4 files** — 정의 1(`SemanticLozenge.jsx:62`), 소비 2파일(`StorageUsageGauge`, `KanbanCard`), 주석 1(`MiniBadge.jsx:7`). **소비 파일 수는 설계대로 정확히 2** | 통과 (설계 "3 hits"는 파일 수 기준 표기, 라인 수와 혼동) |
| 4a | `grep -rn "IssueStatusLozenge" . \| wc -l` | 정의1+소비12 | **26 lines** = 정의 1 + 주석 1 + import 12 + 사용 13 (파일 12 / 지점 13) | 통과 (기대치 12→13, §5-1 참조) |
| 4b | `grep -rn "ProjectStatusLozenge" . \| wc -l` | 정의1+소비11 | **28 lines** = 정의 1 + 주석 3 + import 11 + 사용 11 (파일 11) | 통과 (단 F-1 로 실제로는 12여야 함) |
| 5 | 하드코딩 상태 hex | 3줄만 | **불가 — 아래** | 대안 실행 |
| 6 | `grep -rn "fullcalendar\|@svar-ui\|@xyflow\|echarts" components/lozenge/` | 0 | **0** | 통과 |
| 7 | 4개 툴바 `issueType` | 4 files | **4 files** | 통과 |
| 8 | `GanttPage` 인라인 제거 | 2+ | **6 hits**(import 4 + 사용 2), 인라인 옵션 유도·술어 모두 소멸 | 통과 |

### grep (5) — 구현자 이견 검증 결과: **주장이 맞다**

직접 확인한 수치:

```
grep -rn "#8590A2|#0C66E4|#22A06B|#4C9AFF|#36B37E|#8993A4" .        → 261 hits
  그 중 token(…, '#…') 폴백 형태                                    → 181 hits
  나머지 non-token 라인                                              →  80 hits
```

`#8993A4` 만 봐도 192건 중 **151건이 `token('color.text.subtlest', '#8993A4')` 형태의 라이트 폴백값**이다. 나머지 80건은 비용·포트폴리오·진척도 차트의 **독자 팔레트**(`chartPalette.js:59`, `PortfolioUtilization`, `PortfolioCostScatter`, `IssueAnalysisCharts` 등)로 상태와 무관하다. **설계의 "3줄만 남아야 한다"는 달성 불가능하다.** 구현자 §5-3 판정 인정.

**대안(범위 한정) 실행 결과:**

```
grep -n "#8590A2|#0C66E4|#22A06B|#4C9AFF|#36B37E|#8993A4" \
  pages/projectDetail/work/map/mapNodeCard.js \
  pages/projectDetail/issue/ProjectGroupCard.jsx \
  pages/myPage/sections/MyContributionCharts.jsx \
  components/lozenge/statusAppearance.js
→
  MyContributionCharts.jsx:110  itemStyle: { color: "#4C9AFF" }        ← ★ 아래
  statusAppearance.js:133       bar: token('…information.bold', '#0C66E4')   (token 폴백)
  statusAppearance.js:138       bar: token('…success.bold', '#22A06B')        (token 폴백)
  statusAppearance.js:163-165   STATUS_CHART_HEX 3줄                          ★ 설계 기대치
```

★ `MyContributionCharts.jsx:110` 은 **상태 색이 아니다** — 일별 워크로그 시간 막대 차트의 단색이다(같은 파일 `:14-18` 의 상태 버킷은 `STATUS_CHART_HEX` 로 접혔다). 범위 밖·무회귀. **설계 의도(상태 팔레트 5벌 → 1벌)는 충족됐다.**

---

## 5. 설계 이견 3건 판정

### (a) 설계 인벤토리 누락 — **사실. 인정.**

`git grep -n "StatusComponent" HEAD -- static/ui/src` 실행 결과, HEAD 시점 소비처는 **11파일 / 12지점**:

```
MyIssuesPanel:138 · MyIssueTable:77 · IssueAnalysisTable:269 · IssueListWidget:109
GanttChart:83 · ProjectIssueTable:423 · TaskHistoryTable:143 · TreeDetailPanel:162,925
IssueCardNode:123 · IssueMapDrawer:74
```

설계 §6-A 는 A2~A10(9파일/11지점)만 열거해 **`IssueAnalysisTable.jsx:269` 를 빠뜨렸다.** 설계대로 A2~A10 만 고치고 `StatusComponent` 정의를 지웠다면 존재하지 않는 심볼 import 로 **빌드가 깨진다.** 구현자의 대응(같은 규칙으로 교체)이 옳다.

넘긴 객체 `issue.status` 의 shape 도 확인했다 — `src/resolver/issueAnalysis/IssueAnalysisService.js:89` 가 `status: issue.fields.statusCategory` 를 통째로 실으므로 `name`/`key`/`colorName` 전부 있다. 같은 파일 `:312` 가 `issue.status?.key` 를 쓰는 것도 이 shape 을 뒷받침한다.

**조치:** 설계서 §5-1 소비처 수 12 → **13**, §6-A 표에 A+ 행 추가, §8-3 grep (4) 기대치 갱신. F-1 을 반영하면 §6-B 는 11 → 12.

### (b) 다른 워크스트림 혼입 — **사실. 아래 목록으로 분리.**

작업 트리에 **RFC-199 외 2개 워크스트림**이 섞여 있다. 커밋 범위 분할용 3분류:

#### ① RFC-199 전용 (48개 — 그대로 커밋 가능)

```
locales/kr/gantt.json                       locales/en/gantt.json
static/ui/package.json                      static/ui/package-lock.json

static/ui/src/components/filter/issueType.js                        (신규)
static/ui/src/components/filter/__test__/issueType.test.js          (신규)
static/ui/src/components/lozenge/statusAppearance.js                (신규)
static/ui/src/components/lozenge/__test__/statusAppearance.test.js  (신규)
static/ui/src/components/lozenge/StatusLozenge.jsx                  (신규)
static/ui/src/components/lozenge/SemanticLozenge.jsx                (rename, git mv)
static/ui/src/components/lozenge/StatusBadge.jsx                    (삭제)
static/ui/src/constants/statusColorMap.js                           (삭제)
static/ui/src/components/lozenge/SemanticBadge.jsx
static/ui/src/components/lozenge/StatusTag.jsx
static/ui/src/components/issue/IssueComponent.js
static/ui/src/components/project/ProjectFilter.jsx
static/ui/src/components/calendar/statusAccent.js
static/ui/src/components/calendar/FullCalendar.jsx
static/ui/src/components/calendar/UnscheduledIssuesPopup.jsx
static/ui/src/backoffice/page/projectStatus/modal/edit/ProjectStatusEditModal.jsx
static/ui/src/backoffice/page/projectStatus/modal/regist/ProjectStatusRegistrationModal.jsx
static/ui/src/backoffice/page/projectStatus/useProjectStatusList.js
static/ui/src/backoffice/page/storage/StorageUsageGauge.jsx
static/ui/src/pages/myPage/sections/MiniBadge.jsx
static/ui/src/pages/myPage/sections/MyContributionCharts.jsx
static/ui/src/pages/myPage/sections/MyIssuesPanel.jsx
static/ui/src/pages/myPage/sections/MyProjectsPanel.jsx
static/ui/src/pages/myWork/WorklogPage.jsx
static/ui/src/pages/myWork/myProject/MyProjectList.jsx
static/ui/src/pages/myWork/table/MyIssueTable.jsx
static/ui/src/pages/portfolio/widgets/PortfolioProjectTable.jsx
static/ui/src/pages/project/ProjectDetailDrawer.jsx
static/ui/src/pages/project/ProjectList.jsx
static/ui/src/pages/project/modal/ProjectModal.jsx
static/ui/src/pages/projectDetail/analysisReport/issue/IssueAnalysisTable.jsx
static/ui/src/pages/projectDetail/calender/ProjectCalender.jsx
static/ui/src/pages/projectDetail/dashboard/widgets/IssueListWidget.jsx
static/ui/src/pages/projectDetail/gantt/GanttChart.jsx
static/ui/src/pages/projectDetail/gantt/GanttPage.jsx
static/ui/src/pages/projectDetail/gantt/GanttToolbar.jsx
static/ui/src/pages/projectDetail/issue/ProjectGroupCard.jsx
static/ui/src/pages/projectDetail/issue/ProjectIssuePanel.jsx
static/ui/src/pages/projectDetail/issue/workListQuery.js
static/ui/src/pages/projectDetail/taskHistory/TaskHistoryTable.jsx
static/ui/src/pages/projectDetail/work/ProjectTreeView.jsx
static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx
static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx
static/ui/src/pages/projectDetail/work/TreeStructurePanel.jsx
static/ui/src/pages/projectDetail/work/workFilterOptions.js
static/ui/src/pages/projectDetail/work/workFilterOptions.test.js
static/ui/src/pages/projectDetail/work/map/IssueCardNode.jsx
static/ui/src/pages/projectDetail/work/map/IssueMapDrawer.jsx
static/ui/src/pages/projectDetail/work/map/IssueMapToolbar.jsx
static/ui/src/pages/projectDetail/work/map/ProjectIssueMapView.jsx
static/ui/src/pages/projectDetail/work/map/mapNodeCard.js
static/ui/src/pages/projectKanban/KanbanCard.jsx
static/ui/src/pages/resource/assignment/projects/ProjectCard.jsx
static/ui/src/pages/resource/overview/profile/InProgressIssueList.jsx
static/ui/src/pages/resource/overview/profile/ProjectHistoryList.jsx
```

#### ② 다른 워크스트림 = "작업 목록 계층/모드 토글" (RFC-199 아님 — 9개)

```
static/ui/src/pages/projectDetail/issue/HierarchyToggleCell.jsx     (untracked, 신규)
static/ui/src/pages/projectDetail/issue/WorkListModeToggle.jsx      (untracked, 신규)
static/ui/src/pages/projectDetail/issue/useWorkListFlatPage.js      (untracked, 신규)
static/ui/src/pages/projectDetail/issue/useWorkListHierarchy.js     (untracked, 신규)
static/ui/src/pages/projectDetail/issue/workListTree.js             (untracked, 신규)
static/ui/src/pages/projectDetail/issue/workListTree.test.js        (untracked, 신규)
static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx       (M, -500/+153 리팩토링)
static/ui/src/utils/queryKey/projectKeys.js                         (M, +14 groupSkeleton/groupHierarchyPage)
AGENTS.md                                                           (M, +8 하네스 문서 — 제3 워크스트림)
```

#### ③ 혼재 — 한 파일 안에 두 워크스트림 (헝크 단위 분할 필요, 4개)

| 파일 | RFC-199 부분 | 다른 워크스트림 부분 |
|---|---|---|
| `static/ui/src/pages/projectDetail/issue/useIssueRowFactory.jsx` (untracked 신규) | `:16` `IssueStatusLozenge` import · `:224` 상태 셀 | **파일 전체가 계층 워크스트림의 신규 파일** |
| `static/ui/src/pages/projectDetail/issue/useWorkListQueries.js` | `:6` `deriveIssueTypeOptions` import · `fetchWorkListSummary` 반환의 `issueTypeOptions` | `SKELETON_*` 상수, `assertSearchOk`, `fetchWorkListSkeleton`, `fetchWorkListDetailByKeys`, `useWorkListSkeleton`, `useWorkListDetail`, `useWorkListGroupPage` 의 `enabled` 인자, `patchIssueByKey` |
| `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` | `filter.issueType.{trigger,selected,empty}` | `viewMode.*`(3키) · `hierarchy.*`(9키) |
| `locales/ko-KR.json` · `locales/en-US.json` (merge 산출물) | 위 두 소스의 merge 결과 — **두 워크스트림 키가 함께 들어 있다.** 소스를 갈라 커밋한 뒤 각 커밋에서 `npm run merge` 를 다시 돌려야 산출물이 정합한다 |

#### ④ 어느 쪽도 아님

`README.md` — 이 세션 시작 시점(`git status` 스냅샷)에 **이미 `M`** 이었다. 내용은 "Forge SQL 12 → 13 table" 문서 현행화로 RFC-199 와 무관.

> **리더 참고:** ②③ 때문에 `git add .` 로 RFC-199 를 커밋하면 미완의 계층 모드 기능이 함께 들어간다. ①만 `git add <path>` 로 스테이징하고, ③의 4파일은 헝크 단위(`git add -p`)로 나눠야 한다. `useIssueRowFactory.jsx` 는 계층 워크스트림의 신규 파일이므로 그쪽 커밋에 통째로 넣되, RFC-199 커밋에서는 `StatusComponent` 정의를 지우지 않거나 두 커밋을 붙여 배치해야 중간 커밋에서 빌드가 깨지지 않는다.

### (c) grep (5) 불가 — **사실. 인정.** (§4 참조. 대안 실행 결과 설계 의도 충족)

---

## 6. 주의 — 리더 판단 요청 (실패 아님)

### M1. `WorkQueueItem.jsx:143-145` — Jira 이슈 상태명이 평문으로 남았다

```jsx
{item?.statusName && (
    <span style={{ fontSize: 11, color: token('color.text.subtle', '#5E6C84') }}>
        · {item.statusName}
    </span>
)}
```

설계 §6-D 가 이 파일을 "의미 배지 — 무변경" 으로 **명시 분류**했으므로 구현자 판단은 설계 준수다. 다만 §6-B12(`ProjectHistoryList` 의 평문 `<span>` → lozenge)와 판단이 갈린다 — 둘 다 "평문으로 그리던 상태"였는데 하나는 lozenge 로 승격되고 하나는 남았다. 보조 메타 라인(`플래그 · 상태 · 잔여`)이라 의도적 제외로 보이나, "상태 표시는 전부 lozenge" 원칙을 엄격히 적용하려면 §9 후속 후보로 기록할 것.

### M2. 맵 카드 "진행 중" 색이 DMOVE 틸 → Atlassian 파랑으로 바뀐다

`mapNodeCard.js` 의 `statusAccent('indeterminate')` 가 `token('color.icon.brand', '#21ADAD')`(DMOVE 브랜드 틸) 에서 `token('color.background.information.bold', '#0C66E4')`(Atlassian 파랑)로 바뀌었다. 설계 A18("5개 팔레트를 하나로 접는다")의 **의도된 결과**이고 이슈 맵 카드 스트립·진행바·미니맵 3곳에 함께 적용된다. 다만 브랜드 팔레트 이탈이므로 실화면 확인 권장(§8-4 신규 항목).

### M3. `useIssueRowFactory.jsx:224` — 백엔드보다 방어가 약한 필드 접근 (RFC-199 회귀 아님)

`issue.fields.statusCategory` 를 **폴백 없이** 읽는다. 백엔드 `src/resolver/gantt/GanttMapper.js:97` 은 같은 값을 `f.statusCategory ?? f.status?.statusCategory` 로 **폴백을 두고** 읽는다. `fields:['*all']` 응답에 최상위 `statusCategory` 가 없는 사이트/이슈 타입이 있으면 이 셀만 **에러 없이 빈칸**이 된다.

* HEAD `ProjectIssueTable.jsx:423` 이 정확히 같은 접근을 하고 있었다 → **RFC-199 가 만든 회귀는 아니다.** 파일 이동만 따라간 것.
* 하지만 이번 검증이 찾는 "조용한 빈 배지" 형태 그 자체이므로 기록한다. 저비용 하드닝: `status={issue.fields.statusCategory ?? issue.fields.status?.statusCategory}`.
* 판단은 리더에게 — 계층 워크스트림 소유 파일이므로 그쪽에서 고치는 편이 커밋 분할에 유리하다.

### M4. `CALENDAR_STATUS_ACCENT` — 소비자 0인 죽은 export

`components/calendar/statusAccent.js:17` 정의 + `FullCalendar.jsx:19` 재export 뿐, 실제 소비자가 없다. 구현자가 "하위호환 유지"로 남긴 것이나 이제 참조가 없다. 정리 여부는 선택(무해).

### M5. `IssueTypeJqlFilter.toggle` — `setState` 업데이터 안에서 `addJqlMap` 부수효과 호출

`ProjectFilter.jsx:96-104`. React 업데이터 함수 안에서 부수효과를 내는 안티패턴이지만, **같은 파일의 기존 `StatusCategoryFilter`(`:34-42`)가 문자 단위로 같은 구조**다(관례 준수). 루트 `index.js` 가 `ReactDOM.render`(legacy) 라 StrictMode 이중 호출도 없다. **무회귀 — 조치 불필요.**

---

## 7. 실행 검증 · i18n · lazy 경계

### 7-1. 테스트 — 통과

```
cd static/ui && npx jest
Test Suites: 111 passed, 111 total
Tests:       1801 passed, 1801 total
Snapshots:   1 passed, 1 total          [exit 0]
```

구현자 보고와 **정확히 일치**. 신규 3 스위트 전부 PASS 확인(`components/filter/__test__/issueType.test.js`, `components/lozenge/__test__/statusAppearance.test.js`, `workFilterOptions.test.js`).

설계 §8-2 케이스 1~24 전수 실재 확인:

| 파일 | 케이스 |
|---|---|
| `issueType.test.js` | `it('1.')`…`it('10.')` — 10/10 ✅ |
| `workFilterOptions.test.js` | `test('11.')`…`test('17.')` — 7/7 ✅ (기존 1~6 무수정 유지 확인) |
| `statusAppearance.test.js` | `it('18.')`…`it('24.')` — 7/7 ✅ + 보강 2건(`STATUS_FAMILY` 전수 커버, `STATUS_CHART_HEX` 형식) |

### 7-2. 빌드 — 통과

```
cd static/ui && CI=true npm run build
{"file":"static/js/main.25385b10.js","rawBytes":1760610,"gzipBytes":476392,
 "budgetBytes":950000,"withinBudget":true}                     [exit 0]
```

구현자 보고(`gzipBytes 476393`)와 1바이트 차 — 해시만 다르고 동일 결과. 예산 소진 **50.1%**(여유 473,608 B).

### 7-3. 루트 `npm test` — **미실행(정당)**

`git status --porcelain -- src/` **비어 있음**을 직접 확인했다. 백엔드 변경 0줄이므로 설계 §8-1 의 "변화 없음이 통과 기준"에 해당한다. 구현자 판단 인정.

### 7-4. i18n — 통과

`locales/ko-KR.json` / `en-US.json` **직접 수정 없음**(diff 는 merge 산출물 형태). `locales/script/*.json` 미사용.

| 키 | kr 소스 | en 소스 | `ko-KR.json` | `en-US.json` | 코드의 `t()` |
|---|---|---|---|---|---|
| `gantt.filter.issueType` | ✅ "이슈 타입" | ✅ "Issue type" | ✅ | ✅ | `GanttToolbar:116` · `IssueMapToolbar:106` · `TreeStructurePanel:176` |
| `projectDetail.filter.issueType.trigger` | ✅ | ✅ | ✅ | ✅ | `ProjectFilter:106` |
| `projectDetail.filter.issueType.selected` | ✅ "이슈 타입 {n}개" | ✅ "{n} issue types" | ✅ | ✅ | `ProjectFilter:109` (`tFormat` 로 `{n}` 치환 — Forge `t()` 는 치환 미지원이므로 올바름) |
| `projectDetail.filter.issueType.empty` | ✅ | ✅ | ✅ | ✅ | **참조처 없음** (설계 §7 이 명시해 추가, §2-2(d) "옵션 0개면 미렌더" 규칙 탓에 도달 경로가 없다 — 무해) |

**키 문자열 정확 일치 확인.** merge 실행 확인(산출물에 키 존재).

> ⚠ 위 §5(b)③ — merge 산출물에는 다른 워크스트림의 `projectDetail.viewMode.*` / `projectDetail.hierarchy.*` 12키도 함께 들어 있다. 커밋을 나눌 때 소스를 먼저 갈라 각 커밋에서 `npm run merge` 를 다시 돌릴 것.

### 7-5. lazy 경계 — 통과

```
grep -rn "fullcalendar|@svar-ui|@xyflow|echarts" components/lozenge/   → 0 hits
```

* `statusAppearance.js` 의 유일한 외부 의존은 `@atlaskit/tokens` — 순수 상수 모듈.
* `StatusLozenge.jsx` 는 `react` + `@atlaskit/lozenge` + 자기 파일만 import. `components/calendar/*` 참조 0.
* **방향 검증:** `components/calendar/statusAccent.js` → `lozenge/statusAppearance` **단방향만** 존재. 역방향 0.
* `pages/myWork/WorklogPage.jsx:7` 이 `components/calendar/statusAccent` 에서 **직접** import 한다(`FullCalendar.jsx` 경유 아님) — 이 페이지는 `LazyFullCalendar` 로 캘린더 스택을 lazy 경계 뒤에 두므로 **경계 유지가 맞다.** 구현자 §3-A17 판단 인정.
* 번들 예산 게이트: `withinBudget: true`, 소진 50.1%.

---

## 8. 미검증 (추측으로 통과 처리하지 않음)

| # | 항목 | 왜 확인 못 했나 |
|---|---|---|
| U1 | **`@atlaskit/lozenge` 추가로 인한 main 정확한 증가분** | 클린 baseline 빌드를 하려면 `git stash` 로 작업 트리를 비워야 하는데, ②③ 의 다른 워크스트림 미커밋 변경(untracked 신규 7파일 포함)을 건드리게 되어 수행하지 않았다. 절대값(gzip 476,392 / 예산 950,000, 50.1%)만 확인. 정확한 델타가 필요하면 워크스트림 분리 후 `develop` 기준 재측정 필요 |
| U2 | **Jira `fields:['*all']` 응답에 최상위 `statusCategory` 가 실제로 오는지** | 배포 환경 실측 필요. 안 오면 목록 뷰 상태 셀이 **에러 없이 빈칸**이 된다(M3). HEAD 와 동일 접근이라 RFC-199 회귀는 아니나, 코드만으로는 판정 불가 |
| U3 | **`Lozenge` 의 `style` prop 이 실제 렌더에 적용되는지**(§4-1 피처 플래그 가정) | 설계의 핵심 가정(`fg()` 가 Forge Custom UI 에서 false → 레거시 경로 → `style` 인라인 적용). 코드 정적 분석으로는 검증 불가. **틀리면 프로젝트 상태 21색이 전부 회색이 된다** — 배포 후 최우선 확인 항목 |
| U4 | **설계 §8-4 E2E 8종 + 신규 2종** | 배포 필요. 아래 인수인계 참조 |

### 인수인계 — 배포 후 확인 (설계 §8-4 + 이번 검증이 추가한 2건)

1. 4개 뷰 이슈 타입 필터 실동작 · 뷰 전환 시 선택 유지(셸 3뷰 공유) / 목록은 별개
2. 목록 뷰 자기 필터링 방지 — 타입 1개 선택 후 드롭다운 재오픈
3. 공백·한글 타입명("서비스 요청") JQL 파싱 (문자열은 단위 테스트로 검증됨, Jira 실응답 미확인)
4. 이슈 타입 아이콘(Jira 절대 URL) CSP
5. 팀 관리형 프로젝트에서 4개 뷰 동작
6. **프로젝트 상태 lozenge 가 고른 색 그대로 나오는지**(teal/magenta/lime) ← **U3, 최우선**
7. 다크 모드 대비
8. 포트폴리오 프로젝트 테이블이 더 이상 전부 파랑이 아닌지(B7) — **F-1 수정 후 T/S/R 신호 테이블도 함께**
9. 영문 상태명 대문자화("Planning" → "PLANNING") 수용 여부
10. 간트 상태 컬럼 `maxWidth={96}` ellipsis
11. **[신규] 이슈 맵 카드 "진행 중" 색이 틸 → 파랑으로 바뀐 것 수용 여부** (M2)
12. **[신규] 목록 뷰 상태 셀이 실제로 값을 그리는지** (M3/U2)

---

## 9. 리더 조치 요약

| 우선 | 대상 | 조치 |
|---|---|---|
| **P0** | frontend-engineer | **F-1** — `pages/portfolio/widgets/PortfolioTsrSignalTable.jsx:141-143` 을 `<ProjectStatusLozenge name={sig.statusName} color={sig.statusColor} />` 로 교체(로컬 `Badge` 는 `staleBadge` 가 계속 쓰므로 존치). 색은 `portfolioAggregate.js:284` 에 이미 있다 |
| **P0** | feature-architect | 설계서 갱신 — §6-A 에 `IssueAnalysisTable` 추가(12→13), §6-B 에 `PortfolioTsrSignalTable` 추가(11→12), §8-3 (4) 기대치 갱신, (5) 를 범위 한정 grep 으로 교체 |
| **P1** | 리더 | 커밋 범위 분할 — §5(b) ①②③④ 목록 사용. ③ 4파일은 헝크 분할 + 각 커밋에서 `npm run merge` 재실행 |
| **P2** | 리더 판단 | M1(`WorkQueueItem` 평문 상태) · M2(맵 카드 틸→파랑) · M3(`useIssueRowFactory` 폴백) |
| **P2** | 배포 후 | U2 · U3 · E2E 12종 |

**F-1 을 제외하면 이번 구현은 설계를 정확히 이행했다.** 특히 §4-4 의 "진입점 2분리" 판단은 13개 이슈 상태 호출부 + 11개 프로젝트 상태 호출부 전수 대조에서 shape 혼입 0건으로 실제 효과를 확인했다. 이번 F-1 은 구현 결함이 아니라 **설계 인벤토리의 누락**이며, 같은 성격의 누락이 §6-A 에도 하나 있었다(구현자가 빌드 실패로 잡아냈다).
