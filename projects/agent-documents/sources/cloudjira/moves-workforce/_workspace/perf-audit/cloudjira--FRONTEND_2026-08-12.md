# 프론트엔드 비효율·고비용 로직 감사 — 2026-08-12

- **대상**: `static/ui/src` 전체 (582 파일, JS/JSX)
- **소스**: `develop` @ `2556a51` 기준 작업 트리
- **방법**: 정적 추적(생산자/소비자 동시 읽기) + 빌드 산출물 소스맵 바이트 귀속 분석. **코드 수정 없음**
- **번들 계측**: `static/ui/build` 산출물(2026-08-12 15:34 빌드)의 `main.js.map` 을 VLQ 파싱해 패키지별 생성 바이트를 귀속

> 심각도 — **P1** 체감 큼 / **P2** 중간 / **P3** 사소

### 제외(재보고 안 함)
- 구독 감사(`_workspace/subscription-audit/AUDIT_2026-08-11.md`) 보고분 — F-8 소스 검색 무디바운스 등 `projectDetail/issue/subscription/` 전역
- RFC-160/182~185 커밋의 알려진 특성 — 폭 동결 계측, 패널 localStorage, `CardFullscreen`/`CardCollapseContext` 의 1회성 resize 디스패치(파일 주석에 의도 명시)
- 의도된 결정 — 코드 스플리팅 구조(2026-08-05 재도입), 워크로그 기능별 전용 페처 분리

---

## 요약

| 심각도 | 건수 | 대표 항목 |
|--------|------|-----------|
| **P1** | 14 | 번들 유출(main 34%), 숨김 탭 8 invoke, 탭 3중 마운트, `getUser` N+1 4곳, 간트 편집마다 전량 재조회, 3초 백그라운드 폴링 |
| **P2** | 21 | 대시보드 전량 폴링 44회, 칸반 폴링이 사용자 로드분 삭제, 광역 invalidate 2곳, staleTime 누락 8곳 |
| **P3** | 36 | 미메모 파생값·인라인 클로저·v5 무효 옵션 7곳·데드코드 |

**수정 우선순위 권고**: P1-1(번들 — 전 사용자 초기 로딩) → P1-13 + P1-12(표 어댑터·행 조립, 표 인스턴스 65개에 곱해짐) → P1-2/P1-3(탭 마운트 — 진입당 invoke·렌더 폭발) → P1-4 + P1-14(사용자 정보 N+1 과 그 캐시 키 설계는 **함께** 고쳐야 이득이 온전하다) → P1-5/P1-7/P1-9 순.

> **한 줄 정리**: 관행 자체는 잘 서 있다(디바운스 10곳, 캐시 패치 규약, 쿼리키 팩토리 계약 테스트, ECharts 분리, `assignment/` 모범 사례). 문제는 거의 전부 **그 관행에서 이탈한 소수 지점**이며, 이탈한 곳이 하필 **가장 큰 데이터·가장 잦은 진입 경로**에 몰려 있다.

---

## 전제 — 이 아래 여러 항목의 비용이 여기서 파생된다

### (a) React Query 전역 기본값이 비어 있다

`static/ui/src/index.js:37`
```js
const queryClient = new QueryClient()
```

`defaultOptions` 미지정 → v5 기본값 그대로: **`staleTime: 0`, `refetchOnMount: true`, `refetchOnWindowFocus: true`, `retry: 3`**.

- 훅 131개 중 127개소가 `staleTime` 을 개별 명시해 방어했지만, **누락된 8개 쿼리는 창 포커스가 돌아올 때마다·재마운트마다 재조회**된다(P2-6).
- `retry: 3` 도 전역이다. queryFn 에서 `if (!res?.success) throw` 하는 파일이 **40개**인데 `retry` 를 override 한 파일은 **9개**뿐 → 권한 거부·라이선스 차단·테이블 미준비처럼 **재시도해도 절대 성공하지 않는 실패**가 행동 1회당 **invoke 4회**(1s/2s/4s 백오프)를 태우고 나서야 에러 화면이 뜬다.
- **수정 방향**: `new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, e) => n < 2 && !isPermanentError(e) } } })` 로 바닥을 깔고, 실시간성이 필요한 곳만 개별 override.

### (b) 컴포넌트 메모이제이션이 사실상 없다

`React.memo` 사용처는 전 앱에 **1건**(`backoffice/page/projectStatus/modal/flow/ProjectStatusFlow.jsx:34`, xyflow 요구사항). `useMemo` 556 / `useCallback` 129 로 **데이터는 메모하지만 컴포넌트·행 조립은 메모하지 않는** 패턴이 일관돼 있다.

이 앱의 테이블은 Atlaskit DynamicTable 계약상 `rows = [{ key, cells: [{ content: <JSX/> }] }]` 형태라 **행 조립 자체가 JSX 트리 생성**이다. 따라서 `React.memo` 부재 자체보다 **`rows` 생성이 `useMemo` 밖에 있는 것**이 실제 비용이다 — P1-12(행 JSX 조립)와 P1-13(그 위에 얹히는 공용 어댑터)이 그 목록이다. (아키텍처 자체는 정상 판정 — 개별 지점만 고치면 되고, `TableSurface` 에 `React.memo` 를 한 번 두면 비메모 호출부를 고치지 않고도 상당 부분 방어된다)

---

## P1 — 체감 큼

### P1-1. 기본 진입 라우트가 마크다운 에디터·캘린더 스택을 `main` 번들에 고정시킨다 (측정치)

- **정적 import 체인**: `App.jsx:23` (`import WorklogPage from "./pages/myWork/WorklogPage"` — 의도적 정적) → `pages/myWork/WorklogPage.jsx:2-3` → `components/calendar/FullCalendar.jsx:1-5` (`@fullcalendar/*`, `@fullcalendar/moment-timezone`) / `pages/myWork/modal/WorklogModal.jsx:22-24` → `components/markdown/MarkdownEditor.jsx:1,10` (`@mdxeditor/editor` + `style.css`), `marklassian`, `adf-to-md`

`App.jsx:26-27` 이 코드 스플리팅의 목적을 **명시적으로** 이렇게 적어 두었다:

```
// 무거운 라이브러리(ECharts/ApexCharts/FullCalendar/MDXEditor/xyflow/kanban/gantt)가
// 각 페이지를 따라 main 밖으로 빠지는 것이 이 분리의 목적이다.
```

그런데 **FullCalendar 와 MDXEditor 는 목적대로 빠지지 않았다.** 기본 진입 라우트만 정적으로 두는 결정이, 그 라우트가 두 라이브러리를 정적으로 끌고 오는 바람에 무력화됐다.

**비용 정량** (소스맵 바이트 귀속, `main.4db70f69.js` 원본 3,702KB / gzip 898KB — 예산 950KB):

| 스택 | main 내 원본 바이트 | 비중 |
|------|---------------------|------|
| MDXEditor 계열 (`@mdxeditor/editor` + `lexical`·`@lexical/*` + `@codemirror/*` + `prismjs` + `micromark`/`mdast`/`marked` + `@radix-ui/*`) | **986 KB** | **27.3%** |
| FullCalendar + `moment`(-timezone) | **275 KB** | **7.6%** |
| 합계 | **1,261 KB** | **34.1%** |

- 개별 상위 기여: `@codemirror/view` 191KB, `@fullcalendar/core` 154KB, `lexical` 120KB, `@mdxeditor/editor` 99KB, `moment` 60KB, `prismjs` 55KB, `@codemirror/state` 49KB
- `main.895b72f2.css` **156KB** 에도 mdxeditor 클래스 15개소·`fc-daygrid` 등 FullCalendar 규칙이 포함
- gzip 환산 시 main 898KB 중 대략 **250~300KB** (원본 비중 34% × 콘텐츠별 압축률 편차). 예산 여유가 52KB 뿐이므로 **번들 예산 게이트를 실제로 위협하는 유일한 덩어리**다.
- **누가 이 비용을 내는가**: MDXEditor 는 `WorklogModal` 안에서만 쓰인다(`WorklogModal.jsx:619`) — **워크로그 등록 버튼을 한 번도 누르지 않은 사용자도 986KB 를 내려받는다.** ECharts(1,112KB 청크)는 같은 규칙으로 이미 올바르게 분리돼 있어(`components/chart/echart/ThemedECharts.js:15` 주석에 근거까지 명시) **관행이 한 곳만 어긋난 형태**다.

**교차 검증**: 두 가지 독립적인 계측이 같은 결론에 도달했다 — ① 소스맵 `mappings` VLQ 파싱으로 **생성 바이트**를 귀속(위 표), ② 소스맵 `sourcesContent` 를 패키지별 합산한 **원본 소스 크기**(MDXEditor 계열 2,002KB + FullCalendar 531KB + moment 189KB = main sourcesContent 총합 8,055KB 의 **34%**). 두 방법이 34%로 일치한다. 실체도 직접 확인했다 — `main.js` 안에 tz 데이터 문자열(`America/New_York`, `Asia/Seoul`, `Antarctica/Vostok`)과 `lexical` 심볼 118개, `fc-*` 클래스 223개가 그대로 있다.

**수정 방향**: `WorklogPage` 는 정적으로 유지(첫 화면 왕복 유지)하되 그 안에서 두 덩어리만 lazy 로 내린다 — ① `MarkdownEditor` 를 `React.lazy` + 모달 내부 Suspense 경계(모달 오픈 시에만 로드), ② `CustomFullCalendar` 를 `React.lazy` + 캘린더 영역 Suspense 경계. `marklassian`/`adf2md` 는 동적 `import()` 로 변환 시점에만. 효과 확인은 `CI=true npm run build` 후 `node scripts/check-bundle-budget.js`.

---

### P1-2. `/resource` 진입 시 **보이지 않는 탭 3개**의 데이터가 전부 로드된다

- `pages/resource/ResourcePage.jsx:52-73` — `<TabPanel>` 4개를 조건 없이 렌더
- 원인: Atlaskit `@atlaskit/tabs@18.3.4` 의 `TabPanel` 은 children 을 **무조건 렌더**하고 HTML `hidden` 속성만 붙인다 (`node_modules/@atlaskit/tabs/dist/cjs/components/tab-panel.js:22-41` — `React.createElement(Focusable, {..., hidden}, ... children)` 확인)

즉 4개 탭의 훅이 **동시에 실행**된다.

**비용 정량 — 페이지 진입 1회당 invoke 8건** (동일 키는 dedup 반영):

| resolver | 소유 탭 | 첫 화면에 필요? |
|---|---|---|
| `getResourceOverview` / `getResourceLoadSummary` / `getSettingData` / `getTeamOptions` | 인력현황(공유) | O |
| `getTeamAnalyticsScope` | 팀 분석(**숨김**) | X |
| **`getPortfolioDashboard`** | 팀 분석(**숨김**) | X — 전 프로젝트 raw + `members[]`·`monthlyEffort[]`·`weeklyEffort[]` 전량 |
| `getAssignmentProjectCards` | 프로젝트 배정(**숨김**) | X |
| **`getAssignmentProjectMetrics`** | 프로젝트 배정(**숨김**) | X — 전 프로젝트 Jira 배치 스캔 |

가장 무거운 2건이 **둘 다 숨김 탭 소유**다. 계산도 함께 낭비된다 — 숨김 `TeamAnalyticsTab` 이 `teamMetricsByTeam` + `rollupTeamTree`(`teamAnalytics/hooks/useTeamAnalyticsData.js:153-183`)를 돌리고 **ECharts 인스턴스 6개를 실제로 생성**하며, 숨김 `OrganizationTab` 이 `aggregateByTeam` + `rollupTeamTree`(`organization/OrganizationTab.jsx:110-129`)를, 숨김 `ProjectAssignmentBoard` 가 `hydratePeople` + `sortHydratedRows`(`assignment/ProjectAssignmentBoard.jsx:143-152`)를 전 인원에 대해 돌린다.

> 대조군: 나머지 탭 컨테이너는 정상이다. `components/tabs/CommonTab.jsx:70-81` 은 **활성 탭 하나만** 렌더한다(`MainPageTabs`/`ProjectDetailTabs` 가 이걸 쓴다). `ResourcePage` 만 raw `TabPanel` 을 쓰는 예외다.

**수정 방향**: `Tabs` 에 `selected`/`onChange` 를 붙여 `{selected === n && <XxxTab/>}` 로 감싸거나, `CommonTab` 으로 이관한다.

**같은 원인의 소규모 사례**: `pages/projectDetail/issue/IssueAddModal.jsx:207-211` — "작업 추가" 모달을 열기만 해도 `activeTab === 0` 인데 `SubscriptionTab` 이 마운트돼 구독 데이터 페치가 시작된다.

---

### P1-3. 프로젝트 상세 진입 시 **활성 탭 전체가 3번 마운트되고 2번 폐기**된다

연쇄 (모두 확인):
1. `pages/projectDetail/ProjectDetailPage.jsx:22` — `const toast = ToastFlags();` (렌더 본문 직접 호출)
2. `components/feedback/ToastFlags.js:75-86` — `return { showSuccess: ..., FlagUI: <FlagPortal register={register}/> };` — **매 렌더 새 객체 리터럴 + 새 JSX**
3. `components/tabs/ProjectDetailTabs.jsx:22-25` — `useMemo(..., [t, project_id, toast, ...])` → `toast` 아이덴티티가 매번 바뀌어 **메모가 절대 히트하지 않는다**
4. `constants/tabs.js:80,99,109,...` — `component: () => <DashboardPage project_id={project_id}/>` 형태의 **인라인 화살표 컴포넌트 12개**가 매번 새 함수로 생성
5. `components/tabs/CommonTab.jsx:78` — `<ActivePage />` 의 element **type 이 달라지므로 React 가 서브트리를 통째로 언마운트/리마운트**

**비용 정량**: `ProjectDetailPage` 는 진입 시 최소 3회 렌더한다(초기 / `forgeContextKeys.current()` = `view.getContext()` 해소 / `findProjectById` 해소 — `:29-42`). 즉 **기본 탭 `DashboardPage` 가 3번 마운트되고 2번 버려진다.** 마운트마다 ECharts 인스턴스 재생성 + `react-grid-layout` 재측정 + staleTime 없는 쿼리 재요청(`dashboard/DashboardPage.jsx:52-55` `getChartInfo`, `dashboard/summary/SummaryPanel.jsx:15-20` `getSummaryData`)이 따라온다. 이후 부모가 한 번만 더 렌더되면 사용자가 걸어둔 필터·선택 노드·뷰모드가 **전부 초기화**된다.

**수정 방향**: `const toast = useMemo(() => ToastFlags(), [])` (내부 `show*` 는 이미 ref 기반이라 안전) + `tabs.js` 의 인라인 화살표를 컴포넌트 참조 + props 전달로 교체.

---

### P1-4. `getUser` N+1 — 4개 화면이 인원 수만큼 개별 Jira 호출 (벌크 경로가 이미 있는데 미사용)

| 위치 | 코드 | 비용 |
|---|---|---|
| `pages/projectDetail/cost/CostByIssueTable.jsx:66-74` | `for (let i=0; i<accountIds.length; i+=5) { await Promise.all(...map(id => executeRequest('getUser', {accountId:id}))) }` | 멤버 40명 → **40 호출 / 8 순차 라운드**, 비용 탭 **진입 즉시**(드로어 열기 전) |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:112-118` | `Promise.all(userIds.map(accountId => executeRequest('getUser', {accountId})))` | 페이지당 10 호출, 100명 프로젝트 완주 = **100 호출**. staleTime 없어 재진입마다 반복 |
| `pages/projectDetail/user/ProjectUserPanel.jsx:88-101` | 동일 패턴 | 페이지당 10 호출, 10페이지 = **100 호출**. staleTime 없음 |
| `pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:131-144` | 5개씩 순차 배치 | 팀 필터 시 `USER_MAX=100` → **100 호출 / 20 순차 라운드** |

**이미 벌크 경로가 있다**: `utils/useJiraUserInfos.js:5-26` (`fetchBulkUsers` — `/user/bulk`, 50 id/호출) + `utils/jiraApi/users/getUserInfos.js` (`useUserInfos`, staleTime 10분). `pages/projectDetail/taskHistory/TaskHistoryTable.jsx:108` 은 이미 이걸 쓴다.

**수정 방향**: 네 곳 모두 `useUserInfos(accountIds)` 로 교체 → 100명이 **2 호출**. `CostByIssueTable` 은 추가로 `enabled` 를 드로어 오픈에 걸어 진입 시 0 호출로.

---

### P1-5. 간트/트리 인라인 편집 3종이 매번 **프로젝트 이슈 전량 재조회**를 건다 (+ 캐시 패치 규약 위반)

- `pages/projectDetail/gantt/useGanttMutations.js:443-445` (담당자) / `:511-513` (협업자) / `:584-586` (계획 MD)

```js
onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ganttKeys.data(projectId) });
},
```

세 훅 모두 `onMutate` 낙관 패치 + `onError` 롤백을 이미 갖춰 놓고 **마지막에 전체 무효화**를 건다. `ganttKeys.data` 는 `getProjectGanttData` — 서버에서 프로젝트 이슈를 JQL 로 전량 페이징 수집(`src/resolver/gantt/GanttService.js:66-71`)하고 폴더 3쿼리 + `resolveCoworkerUsersMap` 벌크 유저 조회까지 하는 **가장 무거운 resolver** 다.

**비용 정량**: 그리드에서 담당자 1명 변경 = 권한조회(모듈 TTL 캐시 hit) + `assignIssue` + **수 초짜리 전량 재조회 1회**. 20행 연속 지정 = 전량 재조회 20회.

**추가로 협업자(`useUpdateCoworkers`)는 규약 위반이다**: 이 훅이 부르는 `updateProjectIdField` 는 `src/resolver/projectIssue/ProjectUsersService.js:270-283` 에서 `setAppFieldValueForIssues`(앱 커스텀필드 write)를 탄다. **커스텀필드 write 직후 invalidate** 는 Jira 검색 인덱스 지연 때문에 이 리포가 금지한 바로 그 패턴이다(CLAUDE.md「프론트엔드 Jira 직접 호출」).

> 같은 파일 계열이 정반대 관행을 명시적으로 구현해 두었다 — `useGanttFolderMutations.js:16-21`(invalidate 금지, 응답 기반 부분 패치), `useGanttMutations.js:156-158`(일정/부모/링크는 "인덱스 지연 때문에 invalidate 안 씀" 근거 주석). **이 3개만 이탈**했다.

**수정 방향**: `onSettled` 3개를 제거하고 `onSuccess` 에서 서버 응답으로 해당 task 만 `setQueryData` 패치 — 헬퍼 `patchTask` 가 같은 파일 `:23` 에 이미 있다.

---

### P1-6. 순차 20페이지 이슈 크롤 2곳 + **이슈 1건 등록이 전체 재크롤을 유발**

- `pages/projectDetail/issue/useWorkListQueries.js:60-79` — `do { await executeRequest('searchIssueWithJQL', param) } while (nextPageToken)`, 상한 `issue/workListQuery.js:17-19` (`MAX_PAGES=20, MAX_ISSUES=2000, PAGE=100`)
- `pages/projectDetail/taskHistory/TaskHistoryPage.jsx:54-87` — 동일 구조, 상한 `:21-23`

커서 기반이라 **병렬화 불가, 전부 직렬**. 1,200 이슈 프로젝트 = 첫 픽셀 전에 **12회 왕복**. 작업목록 쪽은 그 결과를 `buildGroups`(`workListQuery.js:75-98`)로 그룹별 `{count, statusDist}` **정수 몇 개**로 줄여 버린다 — 2,000개 이슈 객체를 받아 개수만 쓴다.

**재트리거**: `pages/projectDetail/issue/IssueAddModal.jsx:119` 이슈 1건 등록 → `invalidateQueries(projectKeys.taskHistory(project_id))` → **12회 크롤 전체 재실행**. `issue/subscription/useSubscriptions.js:34` 도 같은 키를 무효화한다.

**부수**: `useWorkListQueries.js:88` 이 `fields: ['*all']` 로 전 필드를 받는다 — 테이블이 실제 쓰는 건 9개다.

**수정 방향**: 그룹 카운트는 `maxResults:0` 카운트 쿼리 또는 서버 집계 resolver 로. 작업이력은 등록된 이슈를 `setQueryData` 로 append.

---

### P1-7. `JobPollingManager` — 3초 raw `setInterval` 이 **백그라운드 탭에서도** 계속 돈다

- `polling/jobPolling.js:3` — `export const POLL_INTERVAL_MS = 3000;`
- `polling/JobPollingManager.jsx:50` — job 당 독립 `setInterval(async () => {...}, 3000)`
- `stores/useJobStore.js:43` — `addJob` 이 `.slice(0, 5)` 로 최대 5건 추적
- `App.jsx:94` — `MemoryRouter` 바로 아래 무조건 마운트 → **앱의 모든 화면**에서 동작

**핵심**: 순수 `setInterval` 이라 `document.visibilityState` 를 보지 않는다. 대조군으로, 같은 앱의 React Query 폴링은 `@tanstack/query-core` 의 `queryObserver.js:215` `if (this.options.refetchIntervalInBackground || focusManager.isFocused())` 가드로 백그라운드에서 자동 정지한다. **이 폴링만 예외다.**

종료 조건도 `isTerminalJob` 또는 `job === null` 뿐이다. resolver 가 계속 실패하면 backoff 가 30초에서 캡되고(`jobPolling.js:4,7-10`) **영구히 멈추지 않는다**.

**비용 정량**: 추적 job 5건 기준 **20 invoke/분 = 1,200 invoke/시간**(`getUploadJobStatus`), 브라우저 탭을 다른 곳에 두어도 유지. `useJobStore` 의 localStorage TTL 이 24h(`useJobStore.js:6`)라 브라우저를 다시 열어도 재개된다.

**수정 방향**: `document.hidden` 이면 스킵하고 `visibilitychange` 로 재개(1줄 가드). 경과 시간에 따른 간격 상향(예: 5분 후 10초)과 N회 후 포기 조건 추가.

---

### P1-8. 사용자 검색이 **키 입력마다 `invoke`**, 게다가 입력이 유실된다

- `components/select/UserSearchSelect.jsx:100-113` — `handleInputChange` 가 `loadUsers({search: val, nextPage:0})` 를 **디바운스 없이** 즉시 호출
- 진입 경로: `backoffice/page/user/UserListPaging.jsx:132` → `components/search/UserSearchFilter.jsx:150`

```js
const loadUsers = useCallback(async ({ search, nextPage = 0 }) => {
    if (loadingRef.current) return;      // ← :46  인플라이트 중 입력은 버려진다
    ...
    const res = await invoke("searchUser", { keyword: search, page: nextPage, size: 10 });
```

- `utils/useDebounce.js` 가 있고 형제 `pages/project/ProjectHeader.jsx:30` 은 `useDebounce(name, 300)` 을 쓴다 — 이 파일만 빠졌다.
- 더 나쁜 건 `:46` 의 조기 return 이다. **요청이 떠 있는 동안의 키 입력은 버려진다.** `reqSeqRef`(`:60,70`)는 응답 역전만 막지 이 드롭은 못 막으므로, 마지막 글자의 검색이 아예 발사되지 않아 옛 결과가 남는 경로가 생긴다.

**비용 정량**: 검색어 N글자 = 최대 **N회 `invoke('searchUser')`**(각각 Jira 사용자 검색 왕복). "홍길동" 입력 시 6회 시도 중 일부는 드롭돼 결과가 어긋난다.

**수정 방향**: `useDebounce(keyword, 300)` 후 effect 에서 1회만 호출. 디바운스가 들어가면 `loadingRef` 조기 return 가드 자체가 불필요해진다.

---

### P1-9. `/myWork` 진입 시 **같은 워크로그 resolver 를 두 번** 호출한다

`pages/myWork/WorklogPage.jsx:79-87` (캘린더 가시 범위) 과 `:118-126` (상단 KPI 요약, 이번 달 1일~말일) 이 **둘 다** `useMyWorklogList({... mine:true})` 를 호출한다.

`pages/myWork/utils/useMyWorklogList.js:20` 의 쿼리 키가 날짜 범위를 포함하므로(`myWorkKeys.worklogList(resolverName, selectedProjectIds, startDate, endDate)`) 두 쿼리는 **캐시가 갈리고 서버를 2번 친다**.

기본 진입 상태에서 FullCalendar 의 `dateRange` 는 이번 달을 완전히 **포함하는** 6주 구간이다. 즉 (2)가 필요로 하는 데이터는 (1)에 **이미 전부 들어 있다**.

**비용 정량**: `/myWork` 진입 1회당 선택 프로젝트 전체에 대한 무거운 Jira 워크로그 집계 **2회**(`getMyCalendarWorklog`). 프로젝트 선택을 바꿀 때마다 다시 2회.

**수정 방향**: 요약은 (1)의 결과에서 계산(`useMyWorklogSummary` 는 이미 순수 reduce다), 캘린더가 이번 달을 벗어난 경우에만 요약용 쿼리를 `enabled` 로 켠다.

---

### P1-10. 아바타 프로브가 관계도를 **아바타 수만큼 전체 재그리기** 한다

`pages/resource/allocation/AllocationGraph.jsx:26,30-49,51-54,75`

```js
const [avatarOkSet, setAvatarOkSet] = useState(() => new Set());            // :26
img.onload = () => { setAvatarOkSet(prev => prev.has(url) ? prev : new Set(prev).add(url)); }; // :37-40
const option = useMemo(() => buildAllocationOption({...avatarOkSet}), [..., avatarOkSet]);      // :51-54
<ECharts option={option} notMerge={true} .../>                                                  // :75
```

`onload` 마다 **새 `Set`** 이 만들어져 `option` useMemo 가 무효화되고, `notMerge={true}` 라 ECharts 가 매번 **전량 teardown 후 재그리기** 한다. 루트가 `ReactDOM.render`(legacy — `index.js:2,39`)라 **네이티브 `img.onload` 는 배칭되지 않는다** → 이미지 1개 로드 = 렌더 1회.

**비용 정량**: 아바타 M명 → **M회 리렌더 × M회 `buildAllocationOption` 전체 재구성**(`allocation/allocationGraphOption.js:98-357` — 노드 `projects+teams+members` + 엣지 `projectTeamPairs+members` 전량 + tooltip 클로저 재생성) **× M회 ECharts notMerge 재그리기**. 상한 `MAX_GRAPH_PROJECTS=15` 에서 담당자 50~100명이면 **50~100연속 전체 재그리기** → 관계도를 펼친 직후 수 초간 프리즈.

**수정 방향**: `onload` 결과를 `useRef` 에 모아 `requestAnimationFrame`/짧은 타이머로 **1회만** flush 하거나, 프로브를 `Promise.allSettled` 로 묶어 전부 끝난 뒤 `setAvatarOkSet` 을 한 번만 호출.

---

### P1-11. 커스텀 대시보드 위젯이 **서로의 리사이즈를 전역으로 증폭**시킨다

`components/chart/echart/EchartPanel.jsx:21-35`

```js
const observer = new ResizeObserver(() => {
    window.dispatchEvent(new Event("resize"));   // ← 스로틀 없음
});
observer.observe(containerRef.current);
```

`echarts-for-react` 는 **window resize 를 구독**한다(같은 사실이 `components/card/CardFullscreen.jsx:17`, `components/card/collapse/CardCollapseContext.jsx:50` 주석에 명시돼 있다). 따라서 **한 위젯의 컨테이너가 커지면 페이지의 모든 ECharts 인스턴스가 재측정·재렌더**된다.

사용처는 `pages/projectDetail/dashboard/ChartTemplate.js` — `react-grid-layout` 위에 위젯 6~12개가 올라가는 프로젝트 대시보드다.

**비용 정량**: 위젯 N개 각각이 ResizeObserver 를 갖는다. 위젯 하나를 드래그/리사이즈하면 레이아웃 재배치로 여러 컨테이너 크기가 바뀌고 → 각 옵저버가 발화 → 각각 전역 resize 디스패치 → **N개 차트가 매번 재측정**. 드래그는 프레임 단위로 발생하므로 **드래그 1초 = 최대 60프레임 × N 디스패치 × N 차트 재측정 (O(N²))**. 게다가 차트 리사이즈가 컨테이너 크기를 다시 건드리면 옵저버가 재발화하는 되먹임 경로가 열려 있다.

> 대조군: `CardFullscreen.jsx:25`·`CardCollapseContext.jsx:55`·`portfolio/widgets/ChartBox.jsx:19`·`resource/teamAnalytics/TeamChartBox.jsx:32` 는 전부 **1회성 `setTimeout` 디스패치**(100~200ms)라 문제없다 — 연속 발화하는 것은 `EchartPanel` 하나뿐이다.

**수정 방향**: 전역 디스패치를 버리고 해당 차트 인스턴스에만 `echartsInstance.resize()` 를 호출하거나, 최소한 rAF 로 코얼레스 + 크기 변화가 실제로 있을 때만 발화.

---

### P1-12. 검색 입력 무디바운스 + 대량 행 조립 미메모 (4개 화면)

`utils/useDebounce.js` 는 앱 전역에서 10곳이 정상 사용 중인데(200~500ms), 아래 4곳만 빠져 있고 **하필 대상 배열이 가장 크다**.

| 위치 | 무디바운스 지점 | 미메모 행 조립 | 비용 정량 |
|---|---|---|---|
| `pages/projectDetail/work/ProjectTreeView.jsx:87,171,192` | `search` state 즉시 갱신(`work/TreeStructurePanel.jsx:105-115`) | — (파이프라인 자체가 비쌈) | 한 글자당 `tasks.filter` → `gantt/ganttAdapter.js:101-239 toSvarTasks`(부모집합 2회 스캔 + 전 노드 매핑) → `:253-396 synthesizeFolderNodes`(폴더 재귀 롤업) → `buildWorkTree` → `flattenTree` → `nodesById` Map 재구축. **500 이슈 + 20 폴더에서 3글자 = 파이프라인 3회 완주 + 좌측 행 전량 재렌더** |
| `pages/resource/organization/OrganizationTab.jsx:99,290-326` | `backoffice/page/team/TeamTreePanel.jsx:127` `onChange={e => onSearchChange(e.currentTarget.value)}` | `:290` `const rows = members.map(...)` — `useMemo` 없음, `members` 는 팀 미선택 시 **전사 인원 전량**(`:167-175`), `head`(`:279-288`)도 매 렌더 새 객체 | **500명 조직에서 키 한 번당 3,000개 셀 객체 + 그 안의 `UserAvatar`/`SemanticBadge`/`SkillTags`/`Badge` 엘리먼트.** `directOnly` 토글·팀 선택·트리 접기에서도 동일 |
| `pages/myPage/sections/MyIssuesPanel.jsx:112-174` / `MyWorklogPanel.jsx:148,205` | `SearchInput`(`MyIssuesPanel.jsx:185-189`) | 필터링(`rowsData`)은 `:61-100` 에서 메모했는데 **정작 비싼 엘리먼트 조립(`:112`)이 메모 밖** | `getMyIssueList` 는 서버 페이징이 없어 전량을 내려준다. 이슈 N건 = **키 입력 1회당 N×5 셀**. `CommonTable rowsPerPage=10` 이라 DOM 은 10행인데 **버려질 N-10행을 매번 만든다** |
| `backoffice/page/team/TeamPage.jsx:97-99` + `TeamTreePanel.jsx:127` | 동일 | `useMemo` 3단은 걸려 있음 | 서버 상한 500팀 기준 **키 입력당 1,500회 순회 + 최대 500개 `TeamNodeRow` 재렌더**(memo 없음, 인라인 style) |

**같은 부류의 미메모 행 조립** (검색과 무관하게 부모 상호작용마다 발생):
- `pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx:159-249` — `const rows = members.map(...)` 미메모. 부모 `ResourceAnalysisPage.jsx:44-55` 가 state 12개를 소유하므로 DatePicker 한 글자·퀵필터·팀 선택·체크박스·드로어 개폐가 전부 재렌더를 유발. 전량 페치 모드 `members` 최대 500(`resourceMembersAdapter.js:25`), `CommonTable` 은 10행만 그림 → **상호작용 1회당 ~4,000 셀 엘리먼트 생성, 그중 40개만 화면에 나감**
- `pages/resource/overview/ResourceOverviewTable.jsx:69-121` — `rows` 는 `useMemo` 지만 deps 의 `onRowSelect` 가 부모(`ResourceOverviewTab.jsx:155`)에서 **인라인 화살표**라 항상 무효화. `rowsPerPage=15` 인데 전량 조립 → **500명이면 4,000셀, 남는 건 120셀.** 드로어 5회 개폐 = 10회 반복
- `pages/resource/assignment/people/CompanyResourceTable.jsx:60,158` + `ProjectAssignmentBoard.jsx:468` — 동일한 인라인 `onRowSelect`. `onAssign` 은 `useCallback` 으로 제대로 고정돼 있어 **한 쪽만 놓친 케이스**
- `pages/project/ProjectList.jsx:18,24-26,44-79` — 파생 데이터를 `useState`+`useEffect` 로 들고 있어 **데이터 1회당 렌더 2회**(빈 rows → effect → setRows/setPages → 재렌더). `statusMap`(`:24`)도 매 렌더 재생성. `ProjectPage.jsx:30` 의 5분 폴링으로 유휴 상태에서도 반복
- `pages/projectDetail/progress/ProgressRiskTable.jsx:62,73` — `rows`/`head` 둘 다 미메모, 80행 기준 480셀/렌더

**수정 방향**: 위 검색 4곳에 `useDebounce(search, 200~300)`, 행 조립 전부 `useMemo`, 부모의 인라인 콜백을 `useCallback` 으로 고정. `CompanyResourceTable` 의 `useInfiniteSlice`(30개 윈도잉) 패턴이 이미 리포에 있으므로 대형 표는 그쪽으로 수렴시킬 수 있다.

---

### P1-13. 공용 표 어댑터가 **매 렌더 O(행×열)** 로 도는 호출부가 절반이다 (표 인스턴스 65개에 곱해짐)

`components/table/TableSurface.jsx:46-75` 는 두 개의 `useMemo` 를 `dataRows`(= `rows` prop **참조**)에 의존시킨다.

```js
const dataRows = Array.isArray(rows) ? rows : [];                       // :46
const effectiveRows = isLoading ? buildSkeletonRows(head, skeletonRowCount) : dataRows;  // :47
...
const sortable = useMemo(() => { ... resolveSortableColumns(head, dataRows) }, [signature, isLoading, dataRows]);  // :60-68
const adaptedRows = useMemo(() => adaptRows(head, effectiveRows, sortable), [signature, effectiveRows, sortable]); // :71-75
```

**호출부가 렌더마다 새 배열을 만들면 두 메모가 통째로 무효화된다.** `CommonTable` 호출 파일 35개 중 **17곳이 `rows` 를 메모하지 않는다** — `MyIssuesPanel.jsx:112`, `MyTeamAnalysisPanel.jsx:202`, `PortfolioCostOverrunRank.jsx:27`, `PortfolioProjectTable.jsx:78`, `PortfolioTsrSignalTable.jsx:117`, `PortfolioUtilization.jsx:143`(인라인 `rows={topPeople.map(...)}`), `ResourceAnalysisChart.jsx:165`, `ResourceAnalysisTable.jsx:159`, `ResourceAnalysisTeamTable.jsx:117`, `TeamCoverageTable.jsx:93`, `IssueAddModal.jsx:59`, `ProgressRiskTable.jsx:73`, `StorageTableList.jsx:29`, `FailListModal.jsx:17`, `OrganizationTab.jsx:290` 외. (P1-12 와 같은 지점들이지만 **비용의 층이 다르다** — 거기서는 JSX 조립, 여기서는 그 위에 얹히는 공용 어댑터)

**비용 정량** (실제 함수 본문 확인):
- `resolveSortableColumns`(`tableSort.js:72-101`) — 정렬 가능 컬럼마다 **전 행 루프**. `sortValue`/`sortKey` 가 없는 컬럼은 조기 탈출이 안 되고 끝까지 스캔한다.
- `adaptRows`(`tableSort.js:146-175`) — 정렬 가능 컬럼마다 `rows.map` + `filter` + `map` = **행 길이 배열 3개 할당**. 이후 `sortValue`/`sortKey` 잔류 검사로 **전 행 × 전 셀** 을 한 번 더 스캔한다.
- 200행 × 정렬 컬럼 4개 = 렌더당 **배열 슬롯 ~2,400개 + O(200×8) 스캔**.
- 로딩 중에는 `:47` 의 `buildSkeletonRows(...)`(`skeletonRows.js:21`)가 매 렌더 새 배열을 만들어 **메모를 확정적으로 무효화**한다.

**배수**: 공용 표 인스턴스 총 **65개**(`CommonTable` 37 + `ChartTableToggle` 24 + `CursorPagingTable` 3 + `PagingTable` 1).

**수정 방향**: `effectiveRows` 를 `useMemo([signature, skeletonRowCount, isLoading, rows])` 로 감싸고, `<DynamicTable>` 을 `frozenHead`/`adaptedRows`/`rowsPerPage` 만 보는 `React.memo` 래퍼로 감싼다 — 그러면 **비메모 호출부 17곳을 고치지 않고도 방어**된다.

> **부수 조건부 비용**: `TableSurface.jsx:88-90` 의 `frozenHead` 는 폭 동결이 켜져 있으면 **항상 새 참조**다(`:82` 주석대로 `adaptedHead` 도 의도적으로 메모하지 않는다). Atlaskit `dynamic-table` 의 `withSortedPageRows` 는 `getDerivedStateFromProps` 를 **prevProps 비교 없이 매 렌더** 실행한다(`node_modules/@atlaskit/dynamic-table/dist/cjs/hoc/with-sorted-page-rows.js:145-165`).
> — **정렬이 걸려 있지 않으면** `getSortedRows`(`:37-40`)가 `rows` 를 그대로 반환하고 `getPageRows` 슬라이스만 하므로 **비용은 무시할 만하다**.
> — **사용자가 정렬 헤더를 클릭한 뒤**에는 매 렌더 `Array.from(rows)` 전량 복사 + `Intl.Collator.compare` 기반 `.sort()` 가 돈다. 200행이면 렌더당 **≈1,530회 collator 비교**. 즉 이 경로는 "정렬을 켠 표"에서만 발현한다.

---

### P1-14. `useUserInfos` 의 쿼리키가 **accountId 배열 전체** — 화면 간 캐시 공유 0, 페이지마다 전량 재조회

`utils/queryKey/jiraKeys.js:4`
```js
userInfos: (accountIds) => ['jiraUserInfos', accountIds],
```

**id 집합 전체가 키**라서 집합이 한 명이라도 다르면 완전히 다른 캐시 엔트리가 된다. **사용자 단위 캐시가 없어 겹치는 인원을 매번 다시 받는다.** 소비처 6곳(`myPage/MyPageHeader.jsx:37`, `myWork/modal/WorklogModal.jsx:97`, `myWork/MyIssueTable.jsx:41`, `project/ProjectDetailDrawer.jsx:90`, `projectDetail/calender/useProjectWorkersSchedule.js:34`, `projectDetail/taskHistory/TaskHistoryTable.jsx:108`)이 전부 서로 다른 키를 쓴다.

**비용 정량**: `TaskHistoryTable` 을 20행/페이지로 10페이지 넘기면 → **캐시 엔트리 10개 × bulk 요청 10회**. 실제 등장 인원이 30명뿐이어도 최대 200명분을 페치한다(**≈6.7배 과다**). 화면을 옮기면(작업이력 → 프로젝트 드로어) 같은 팀원인데도 처음부터 다시 받는다.

**겹치는 문제 2건 (같은 경로)**:
- `utils/useJiraUserInfos.js:16-24` — 50개 청크를 `for...of await` 로 **직렬** 처리. 200명 = 4청크 = **4회 직렬 왕복**. `Promise.all`(또는 동시성 2~3 제한)이면 1회분이다. 백엔드에는 `p-limit` 관행이 있는데 프론트 이 경로에만 없다.
- `utils/jiraApi/users/getUserInfos.js:8-12` — `useMemo(..., [accountIds])` 인데 호출부가 인라인 배열(`memberRows.map(...)`, `accountId ? [accountId] : []`)을 넘기므로 **매 렌더 `Set` 생성 + `sort` 가 다시 돈다**.

**수정 방향**: 키를 accountId **단위**로 쪼개거나(`['jiraUser', id]` + `useQueries`), 최소한 bulk 응답을 `queryClient.setQueryData` 로 개별 사용자 캐시에 심어 다음 집합이 히트하게 한다. 청크 루프는 `Promise.all` 로.

> 이 항목은 P1-4(`getUser` N+1)의 **수정 목적지**이기도 하다 — 네 화면을 `useUserInfos` 로 옮기기 전에 키 설계를 먼저 고쳐야 이득이 온전히 난다.

---

## P2 — 중간

### P2-1. 재집계 폴링이 대시보드 **전체 페이로드**를 15초마다 최대 44회 다시 받는다
`pages/portfolio/PortfolioDashboardPage.jsx:34-35,62-68` — `refetchInterval: aggregating ? AGGREGATION_POLL_MS(15s) : false`, `AGGREGATION_MAX_WAIT_MS = 11분`.

**주기 자체는 합리적이다 — 문제는 폴링 대상이다.** 완료 판정에 필요한 건 `data.lastAggregatedAt` 한 필드뿐인데(`:115-122`), 매 틱마다 `getPortfolioDashboard` 가 전 프로젝트 raw(`projects[]` + 각 프로젝트의 `members[]`·`monthlyEffort[]`·`weeklyEffort[]`·`issueSummary`)를 통째로 내려준다. 백엔드에 가벼운 상태 조회가 없다 — `src/resolver/portfolioDashboard/PortfolioDashboardController.js` 등록 함수는 `getPortfolioDashboard`, `triggerPortfolioAggregation` 둘뿐.

**비용**: 재집계 버튼 1클릭 = 최대 `11min / 15s = 44회` 전량 페치. 프로젝트 50건 × 멤버 20명이면 매 틱 수백 KB. 매 응답이 `data` 참조를 갱신 → `usePortfolioFilter.js:65-68` `selectedProjects` → **전 위젯 재집계 + 전 ECharts 재그리기가 44회 연쇄**.

**수정**: `lastAggregatedAt`/`aggregateStatus` 만 주는 경량 resolver 를 폴링하고, 값이 바뀐 시점에 `getPortfolioDashboard` 를 1회만 invalidate.

### P2-2. 칸반 3분 폴링이 사용자가 "더 불러온" 카드를 3분마다 지운다
`pages/projectKanban/ProjectKanbanBoard.jsx:63-86`(`refetchInterval: 3*60*1000`) vs `:165-203`.
`queryFn`(65-83)은 `buildStatusData` + `applyProjectListToDataSource` 로 dataSource 를 **처음부터 다시 만든다**. 반면 `loadMoreOldProjects` 는 `queryClient.setQueryData` 로 기존 캐시에 **병합**한다 → 3분 폴링이 병합분을 전부 날린다. 그런데 `oldPage`/`hasMoreOld` state(`:36-37,196-197`)는 남아 있어 "더보기"를 다시 눌러도 **다음 페이지부터** 가져온다(사라진 카드는 안 돌아온다).

**비용**: 칸반 체류 중 3분마다 invoke 2회 + **사용자가 명시적으로 로드한 카드 소실**(5건씩 3페이지 = 15장).
**수정**: 폴링 제거(변이는 `useKanbanMutations` 가 낙관 패치+정확 invalidate 로 이미 처리) 또는 추가 로드 상태에서 `refetchInterval` 을 끈다.

### P2-3. 급여 편집 1회 = 급여 전 페이지 재조회 + 원가 재집계
`pages/projectDetail/salary/SalaryManagementPage.jsx:135-136`. `projectKeys.salary(project_id)` 를 page 없이 부르면 **프리픽스**(`utils/queryKey/projectKeys.js:91-93`)라 캐시된 모든 페이지가 재조회되고, `projectKeys.cost` 는 KVS 10분 캐시로 보호되는 가장 무거운 원가 집계를 버린다. staleTime 이 없으니 `getUser` 10회 웨이브(P1-4)까지 따라온다.
**비용**: 셀 1개 확정 = 20+ invoke. 10건 편집 = 원가 재집계 10회.
**수정**: 해당 행만 `setQueryData` 패치, cost 는 `refetchType:'none'`.

### P2-4. `UserPage` 의 `userKeys.all` 4회 — 무관한 쿼리까지 재조회
`backoffice/page/user/UserPage.jsx:204,215,224,236`. `utils/queryKey/userKeys.js:2-12` 기준 `all = ["users"]` 가 `list`/`meta`/`failList`/`findUser` 를 **전부** 덮는다. 이 페이지에 마운트된 하위 쿼리는 3개다.
**비용**: 사용자 1명 등록(204)·수정(215) 1회당 **3 invoke** — 그중 `getAllFailList`(엑셀 업로드 실패 목록)는 등록/수정과 무관하므로 **행동 1회당 1 invoke 가 순수 낭비**.
**수정**: 등록/수정/삭제는 `userKeys.lists()` + `userKeys.meta()` 만, 업로드(224)·실패목록(236)에서만 `failList()`.

### P2-5. 워크로그 드래그/저장이 월 전체 재조회 (캐시 패치 규약 위반)
`pages/projectDetail/calender/worklogDrop.js:48` — `invalidateQueries(calendarKeys.projectWorklogs({projectId,startDate,endDate}))` 바로 다음 줄 `:51` 에서 이미 `event.setExtendedProp('worklog', result)` 로 로컬 패치를 한다. `calender/ProjectCalender.jsx:279` 도 동일.
**비용**: 드래그 1건당 `getProjectCalendarWorklog`(월 범위 JQL + 워크로그 확장) 1회. 10건 재배치 = 10회. 인덱스 지연으로 옛 `started` 가 돌아와 이벤트가 원위치로 튀는 회귀 리스크 동반.

### P2-6. `staleTime` 미설정 8개 — 창 포커스 복귀·재마운트마다 재조회
전역 기본값이 `staleTime:0` + `refetchOnWindowFocus:true` 이므로(전제 (a)) 아래는 **다른 창을 봤다가 돌아올 때마다** 재조회된다.

| 위치 | resolver |
|---|---|
| `backoffice/page/user/UserPage.jsx:137-143` | `getAllFailList` |
| `backoffice/page/user/UserPage.jsx:145-150` | `getUserMetaCount` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:28-38` | `getProjectStatusList` |
| `backoffice/page/projectStatus/ProjectStatusPage.jsx:40-47` | `getStatusLink` |
| `pages/myWork/myProject/useMyProjectList.js:16-23` | `getMyProjectList` |
| `pages/projectDetail/dashboard/summary/SummaryPanel.jsx:15-20` | `getSummaryData` |
| `pages/projectDetail/dashboard/DashboardPage.jsx:52-55` | `getChartInfo` |
| `pages/projectDetail/issue/ProjectIssuePanel.jsx:48-51` | `getSettingData` (→ P2-7) |
| `pages/projectDetail/salary/SalaryManagementPage.jsx:74-78`, `user/ProjectUserPanel.jsx:70-74`, `analysisReport/resource/hooks/useProjectResourceMembers.js:87-102,131-144` | 목록/`getUser` |

형제 훅들은 이미 5분을 준다(`useSkillList.js:44`, `useRoleList.js:45`, `usePublicHolidayList.js:44`, `usePermissionList.js:58`) — 위만 누락이다. `/myWork` 는 기본 진입 라우트라 라우트를 오갈 때마다 프로젝트 목록을 매번 다시 받고, 그 결과가 워크로그 페치 체인(P1-9)의 입구다.

### P2-7. `settingKeys.detail()` 하나에 staleTime 이 5가지 + queryFn 3벌
`getSettingData` 는 17개소에서 호출되지만 전부 같은 키 `settingKeys.detail()` 이라 dedup 은 정상이다. 그런데 **관측자별 staleTime 이 제각각**이다 — 30분(`myWork/WorklogPage.jsx:150`, `myPage/MyPage.jsx:115`, `projectDetail/{assignment,gantt,taskHistory,work,calender}`, `resource/*`), 10분(`backoffice/page/setting/SettingPage.jsx:26`, `MonthMmSummary.jsx:41`, `hooks/useSalaryPolicy.js:63`, `IssueAnalysisPage.jsx:31`, `useProjectResourceMembers.js:74`), **무설정 1건**(`projectDetail/issue/ProjectIssuePanel.jsx:48-51`).

**비용**: React Query 의 stale 판정은 관측자 단위다 → **무설정 관측자가 마운트될 때마다 무조건 재조회**되고, 그 결과가 공유 캐시를 갱신한다. 즉 작업관리(목록) 탭에 들어갈 때마다 `getSettingData` 1회가 추가된다. 만료 시점도 마운트 순서에 좌우돼 비결정적이다.

queryFn 도 3벌이라 **저장되는 shape 이 갈린다** — `SettingPage.jsx:16-27` 은 `const {success, ...setting} = result` 로 success 를 벗기고, `WorklogPage.jsx:144-152`·`MonthMmSummary.jsx:38-42` 는 envelope 통째로 넣는다. 현재는 소비부가 전부 루트의 `hourRate` 만 읽어 **우연히** 동작한다.
**수정**: `useSettingData()` 공용 훅 1개로 통합.

### P2-8. 팀 분석 탭이 같은 전체 집계를 두 번 돌리고, 축 버튼 클릭마다 다시 돌린다
`pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:74-85` 가 훅이 이미 계산해 둔 `metrics`(`hooks/useTeamAnalyticsData.js:153-170`)를 안 쓰고 `teamComparison(...)` 을 호출하는데, 이 함수가 내부에서 **`teamMetricsByTeam` 을 통째로 다시 부른다**(`utils/team/teamMetrics.js:430-435`).
**비용**: 탭 진입 1회당 `teamMetricsByTeam` **2회 실행**(각각 `Σ(projects × members)` 순회 + `aggregateByTeam` 2회 + `utilizationPeople` 전량 map). `axis` 가 deps 에 있어 **축 버튼(가동률/공수/진척률/인건비) 클릭 1회당 전체 집계가 통째로 재실행**된다 — 실제로 바뀌는 건 정렬 기준과 topN 절단뿐(`teamMetrics.js:457-494`).
**수정**: `teamComparison` 을 축 무관 부분(= `teamMetricsByTeam`)과 축 의존 부분(정렬+topN+'기타')으로 분리하고 앞쪽은 훅의 `metrics` 재사용.

### P2-9. 간트 데이터 로드가 **서버가 쓰지도 않는 값**에 직렬로 막혀 있다
`pages/projectDetail/gantt/useGanttData.js:18-33` — `coworkerFieldId` 쿼리가 `isSuccess` 될 때까지 본 쿼리가 `enabled:false`. 그런데 `src/resolver/gantt/GanttService.js:56` 은 `({projectId, coworkerFieldId} = {})` 로 구조분해만 하고 **본문 어디서도 쓰지 않는다**(전체 파일 grep 결과 시그니처/주석 2건뿐, "앱 커스텀필드 id 조달 불필요" 주석 존재).
**비용**: 간트·트리 첫 로드가 `getCustomFieldId`(내부적으로 `view.getContext()` — `constants/customField.js:4`) 브리지 왕복 1회를 기다린 뒤에야 시작하는 **불필요한 직렬 워터폴**. 게다가 같은 `view.getContext()` 결과가 `forgeContextKeys.current()`(`ProjectDetailPage.jsx:29`, staleTime Infinity)와 `jiraKeys.coworkerField()` **두 키에 중복 캐시**된다(`calender/useProjectCalender.js:9` 는 또 다른 `calendarKeys.coworkerField()` — 3벌).

### P2-10. 트리 행 전량이 memo 없이 인라인 클로저 5개씩 받는다
`pages/projectDetail/work/TreeStructurePanel.jsx:194-213` — `rows.map` 안에서 `onToggle`/`onSelect`/`onDragStart`/`onDragOver`/`onDrop` 5개를 전부 인라인 생성. `TreeNodeRow`(`:251`)는 `React.memo` 가 아니고, `handleDragOver`(`:67-73`)는 dragover 이벤트마다 `setDropTargetId(id)` 를 호출한다.
**비용**: 드래그로 행 하나를 지나칠 때마다 **가시 행 전량 재렌더**(500행이면 500 × Tooltip/Avatar/Icon 트리 재생성). 검색 한 글자·노드 선택도 동일.

### P2-11. 간트 호스트에 MutationObserver 2개가 매 DOM 변경마다 전체 스윕
`pages/projectDetail/gantt/GanttChart.jsx:436-468`(placeholder 클래스) 와 `:475-529`(폴더 클래스). 각각 `mo.observe(host, {childList:true, subtree:true})` 로 걸려 `host.querySelectorAll('.wx-bar[data-task-id]')` 전량 순회 + 클래스 토글을 하고, 두 번째는 `.wx-grid .wx-body .wx-row[data-id]` 까지 추가 순회하며 행마다 최대 4개 클래스를 토글한다. 마운트/`tasks` 변경 시 **각각 30프레임 rAF 펌프**(`:457-461`, `:518-522`)가 붙는다.
**비용**: SVAR 이 스크롤/줌 때 행을 재생성하므로 스크롤 드래그 1회에 두 옵저버가 계속 깨어난다. 200행 기준 **프레임당 ~1,800회 클래스 연산**.
**수정**: 두 이펙트를 하나로 합쳐 스윕 1회로 줄이고 `apply` 를 rAF 코얼레스.

### P2-12. 인력 분석 — 뷰 토글 1회당 500행 전량 재페치
`pages/projectDetail/analysisReport/resource/hooks/useProjectResourceMembers.js:87-102`(staleTime 없음 + `keepPreviousData:true` = v5 무효) / `:131-144`(N+1 `getUser`, staleTime 없음). `resourceMembersAdapter.js:62-63` 의 `pagesize = isFullFetch ? 500 : 10` 이 쿼리 키에 들어간다(`:88-92`).
**비용**: 인별↔팀별 토글 3회 = `findProjectusersByProjectId` **6 invoke**(그중 3회는 500행 페이로드) + 인별 복귀마다 `getUser` 100회 루프 재실행. alt-tab 복귀만으로도 동일 비용 재발생.
**수정**: 두 쿼리에 staleTime 5~10분, `placeholderData: keepPreviousData` 로 교체. 500행이 10행의 상위집합이므로 1회 페치 후 클라 슬라이싱도 가능.

### P2-13. 마이페이지 프로젝트 카드 1클릭 = 무거운 JQL invoke 2건
`pages/myPage/MyPage.jsx:67,85-104` + `sections/MyProjectsPanel.jsx:94-99,159` — 카드 클릭이 즉시 `selectedProjectIds` 를 갱신 → `myPageKeys.issues(...)`(`getMyIssueList`) + `myPageKeys.worklogs(...)`(`getMyCalendarWorklog`) 두 키가 동시에 바뀐다.
**비용**: 카드 클릭 1회당 **invoke 2건**. 프로젝트 10개를 하나씩 골라 스코프를 좁히면 **20건**. `keepPreviousData` 는 깜빡임만 막고 요청은 그대로 나간다. 선택 조합마다 새 캐시 엔트리가 쌓인다.
**수정**: `normalizedProjectIds` 에 200~300ms 디바운스, 또는 명시적 "적용" 버튼.

### P2-14. `getProjectUserWithScroll` 이 캐시 계층 없이 편집 열 때마다 재호출
`pages/projectDetail/user/ProjectIssueAssignSelect.jsx:47,58-63` — React Query 대신 `useState` + 마운트 이펙트로 `invoke`. 호출 지점은 `issue/ProjectIssueTable.jsx:290`(담당자)/`:314`(협업자) 의 `InlineEdit editView`(편집 중에만 렌더 = 열 때마다 새 마운트) 와 `gantt/GanttUserModal.jsx:78`(상위가 `key={task.id}` 로 강제 재마운트).
**비용**: 셀/모달 1회 오픈 = invoke 1회, 캐시 0. **20행 담당자 지정 = 동일 첫 페이지 20회 invoke.** 담당자+협업자면 2배. (검색 입력 자체는 400ms 디바운스 정상)

### P2-15. 상세 드로어 확장 시 같은 차트/테이블이 2벌 마운트
`pages/projectDetail/analysisReport/issue/IssueAnalysisPage.jsx:99` 가 드로어를 닫지 않고 확장 포털을 열며, `components/drawer/SideDrawer.jsx:100` 은 `isOpen` 이면 children 을 계속 마운트해 둔다 → `IssueAnalysisChart` 가 `:117` 과 `:143` 양쪽에, `WorklogDetailPanel` 이 `:123` 과 `:147` 양쪽에. `analysisReport/resource/ResourceAnalysisPage.jsx:353-362`(드로어) / `:383-392`(포털) 동일.
**비용**: 화면에 하나만 보이는데 ECharts 인스턴스 2개가 초기화·재드로우(`notMerge={true}`) + 워크로그 테이블 행 2벌. invoke 는 키 공유라 추가 없음(순수 렌더/GPU 낭비).

### P2-16. 대시보드 제목 변경이 메타 전량 재조회 → 위젯 전량 재레이아웃
`pages/projectDetail/dashboard/DashboardPage.jsx:184-190` — `updateChartTitle` 직후 `invalidateQueries(projectKeys.dashboardInfo)`. 응답이 `:58-72` 이펙트를 재실행해 `items` 배열이 새로 생성되고 `ReactGridLayout` 이 6~12개 위젯을 재배치한다. 새 제목은 이미 손에 있으므로 `setQueryData` 로 충분하다. (P1-3 의 3중 마운트와 곱해진다)

### P2-17. `SalaryCell` 이 **셀마다** `useQuery` 를 만든다
`components/salary/SalaryCell.jsx:52` — `const { policy, isLevelBand, isPolicyLoading } = useSalaryPolicy(responsePolicy);` 가 컴포넌트 최상단, `mode` 분기(`:54-58`)보다 **위**에 있다. `hooks/useSalaryPolicy.js:53-64` 는 `useQuery({queryKey: settingKeys.detail()})` 이다.

네트워크는 dedupe 되지만 **QueryObserver 는 셀 인스턴스마다 생성**되고, 그 키가 invalidate 되면 **전 셀이 동시에 리렌더**된다. 게다가 `mode='plain'`/`'band'` 는 정책을 전혀 쓰지 않고 즉시 반환하는데 훅은 이미 실행된 뒤다 — `salary/SalaryManagementPage.jsx:234,265,284` 3곳과 `backoffice/page/level/useLevelList.js:74-75` 2곳이 전부 `mode="plain"`/`"band"` 다. `responsePolicy` 를 넘겨받는 경우(`:75` 우선 적용)에도 훅은 그대로 돈다.

**비용 정량**: 급여관리 표 50행 × 급여 컬럼 2개 = **한 화면에 QueryObserver 100개**. `settingKeys.detail()` invalidate(P2-3 의 급여 저장 경로 포함) 한 번에 100개 컴포넌트가 동시 리렌더. `backoffice/page/user/UserListPaging.jsx:92` 도 같은 구조.
**수정**: 정책을 표 컨테이너에서 1회 읽어 `policy` prop 으로 내려보내고(`SalaryCell` 은 이미 prop 우선), 셀 내부 훅은 폴백으로만. 최소한 `mode !== 'policy'` 면 훅을 타지 않게 분기.

### P2-18. `DropdownJql` 이 드롭다운을 **열지 않아도** 마운트 즉시 Jira REST 를 친다
`components/project/DropdownJql.jsx:61-69` — `useEffect(() => { ... searchHook(searchTermDebounced) ... }, [searchTermDebounced])` 에 **열림 여부 가드가 없다.** 마운트 시점(`searchTermDebounced === ''`)에도 실행된다. React Query 를 쓰지 않고 로컬 `useState` 라 **캐시도 없다** — 같은 화면을 다시 들어갈 때마다 반복.

`components/filter/ProjectFilter.jsx:135,141` 이 `DropdownJql` 을 2개 렌더하므로 **화면당 `getProjects` + `getUsersGroups` 2회**가 사용자 조작 전에 나간다.
**비용 정량**: `ProjectFilter` 사용처 4곳(`IssueAnalysisTable.jsx:321`, `IssueAddModal.jsx:200`, `ProjectIssuePanel.jsx:151`, `TaskHistoryPage.jsx:100`) × 2 = 4화면 모두 방문 시 **Jira REST 8회**, 전부 조작 전 프리페치.
**수정**: `DropdownMenu` 의 `onOpenChange` 로 최초 오픈 시에만 페치하거나 `useQuery` + `enabled: isOpen` + `staleTime`.

### P2-19. `JiraUserSelect` 도 키 입력마다 `invoke` (P1-8 과 같은 부류)
`components/select/JiraUserSelect.jsx:99-113` — `AsyncCreatableSelect` 의 `loadOptions` 는 react-select 가 디바운스하지 않으므로 입력마다 `invoke('searchJiraUsers')`. 인력 추가 모달 등에서 사용.
**비용**: "김철수" 입력 시 한글 IME 조합 중간 단계 포함 **8~11회 invoke**(디바운스 시 1회).
**수정**: `loadOptions` 를 디바운스 래핑하거나 `useDebounce(keyword, 300)` 기반으로 전환. **같은 폴더 안에서 규칙이 갈린다** — `ProjectUserSelect.jsx:94`(1000ms), `DropdownJql.jsx:50`(500ms)은 디바운스가 있다.

### P2-20. `CardCollapseProvider` 컨텍스트 값이 접기 1회에 전 카드를 리렌더시킨다
`components/card/collapse/CardCollapseContext.jsx:58` — `const api = useMemo(() => ({ state, toggle }), [state, toggle])`. `state` 가 바뀌면 새 객체 → `useCardCollapse` 소비자 **전원**(카드 + `BentoTile`) 리렌더.
**비용**: 전사 대시보드 위젯 10~15개 기준 카드 1개를 접을 때 **~25개 컴포넌트 리렌더**(+ `:55` 의 전역 resize 디스패치로 차트 재측정 1회).
**수정**: `state` 와 `toggle` 을 컨텍스트 2개로 분리하거나 셀렉터형으로.

### P2-21. `TaskHistory` 테이블이 React Query 바깥 — 캐시 0
`pages/projectDetail/taskHistory/TaskHistoryTable.jsx:39-45,57-87,90-93` — `useState` 직접 관리. 커서는 보관하지만 응답은 버려 **Next → Prev → Next = 3회 추가 요청**. 형제 `analysisReport/issue/IssueAnalysisTable.jsx:176-187` 은 커서를 쿼리 키에 넣어 staleTime 5분으로 Prev 가 캐시 히트한다 — **의도된 패턴이 바로 옆에 있다**.

---

## P3 — 사소

| # | 위치 | 내용 |
|---|------|------|
| P3-1 | `pages/projectDetail/gantt/useGanttMutations.js:540` | 계획MD 저장 전 `executeRequest('getIssue', {fields:'timetracking'})` 단건 GET. MD 편집 1회 = 권한조회 + getIssue + updateIssue + (P1-5의) 전량 재조회 |
| P3-2 | `pages/projectDetail/work/TreeDetailPanel.jsx:501,534-541` | `splitDependencies(ganttLinks, node.id)` 와 `nodesById.forEach(...)` 가 useMemo 없이 매 렌더 O(전체 노드) 스캔. 상위가 검색·드래그오버마다 재렌더되므로 곱해진다 |
| P3-3 | `pages/projectDetail/gantt/GanttChart.jsx:103-120` | `mousemove` 마다 `setTip({x,y,task})` state 갱신(초당 ~60회). 별도 컴포넌트 격리는 의도적이나 같은 task·근접 좌표면 스킵 가능 |
| P3-4 | `useProjectResourceMembers.js:170`, `cost/CostByIssueTable.jsx:39`, `cost/CostByIssueChart.jsx:18`, `cost/CostByRoleLevel.jsx:61` | `data?.x ?? {}` / `?? []` 가 로딩 중 **매 렌더 새 참조** → 차트 option useMemo 무효화 → `notMerge={true}` 로 **차트 전체 재드로우** |
| P3-5 | `pages/projectDetail/dashboard/ChartTemplate.js:128-131` | 테이블이 닫혀 있어도(`isSwitch` false, `:279`) 1000+ 행 객체를 만들고, `.sort()` 가 React Query 캐시 배열을 **제자리 변형**한다 |
| P3-6 | `ChartTemplate.js:104,165,248` | head memo 의존성에 `t` 누락, option 의존성에 `t` 누락(로케일 전환 후 라벨 stale), filter memo 는 `teamNote`(매 렌더 새 JSX, `:195-200`)에 의존해 **영구 미스** |
| P3-7 | `dashboard/DashboardPage.jsx:255,280-282` | 인라인 `layout={items.map(...)}` + 카드당 인라인 화살표 3개(12위젯 = 36 클로저/렌더) |
| P3-8 | `dashboard/DashboardPage.jsx:159,177` | `projectKeys.dashboardData` 를 무효화하는데 이 키를 등록한 `useQuery` 가 없다(`projectKeys.js:65` 정의, 참조는 이 2줄뿐). 무해하지만 실제 위젯 데이터가 `dashboardItem` 키에 있다는 사실을 가린다 |
| P3-9 | `pages/projectDetail/issue/IssueAddModal.jsx:59` | `rows` 미메모 + `rowsPerPage=100` + `maxResults:100`. 체크박스 20번 = 100행 객체 20회 재구축(≈2,000 엘리먼트). `:128-141` 검색은 300ms 디바운스가 있으나 React Query 밖이라 모달 재오픈 시 캐시 0 |
| P3-10 | `pages/projectDetail/user/ProjectUserPanel.jsx:237,255` | 같은 프리픽스 키(`projectKeys.users`)를 onSuccess/onSettled 에서 **2회** 무효화 → `:216` 의 낙관 패치가 즉시 폐기 |
| P3-11 | `pages/projectDetail/user/ProjectTeamBar.jsx:100` | `onDone={() => refetch()}` 인데 `hooks/useProjectTeams.js:71` 이 이미 invalidate 한다 → 저장 1회당 `getProjectTeams` **2회** |
| P3-12 | `pages/projectDetail/issue/ProjectIssueTable.jsx:548-553,150-163` | memo 의존성의 `jiraPermissions` 가 `utils/jiraApi/useJiraEditGuards.js:116` `return data ?? mapPermissions(null)` 로 **로딩 중 매 렌더 새 객체** → 전 행(최대 50) × InlineEdit 4개 트리 재구축. `head` 도 미메모 |
| P3-13 | `pages/projectDetail/issue/ProjectIssueTable.jsx:193-199` | 셀 인라인 편집 1회당 write + `getIssue(*all)` + `getBulkUser` = **3 왕복**. 20행 일괄 편집 = ~60 요청 (캐시 패치 전략 자체는 규약 준수) |
| P3-14 | `analysisReport/team/ProjectTeamAnalysisPage.jsx:94-97` + `resource/ResourceAnalysisTeamTable.jsx:67-70` | 같은 `members` 배열로 `aggregateByTeam` 을 **각각** 수행(최대 500행 × 2). 페이지 주석 `:90-93` 이 중복을 인지하고 있다 |
| P3-15 | `progress/ProgressBars.jsx:30,54`, `progress/ProgressStatusDistribution.jsx:31,65` | 매 렌더 새로 만든 배열을 useMemo 의존성에 넣어 memo 가 절대 히트하지 않음(6행/3행이라 비용은 미미) |
| P3-16 | `analysisReport/resource/ResourceAnalysisPage.jsx:41-42` | `getDefaultDateRange()` 를 매 렌더 호출(형제 `ProjectTeamAnalysisPage.jsx:56` 은 `useMemo(...,[])` 로 올바름) |
| P3-17 | `calender/ProjectCalender.jsx:226,235,247,266,336` | FullCalendar 에 인라인 클로저 5개 → 워크로그 모달 개폐만으로 옵션 셋이 바뀌어 `eventContent` 가 전 셀 재실행(`dayMaxEvents=3` × ~35셀) |
| P3-18 | `pages/portfolio/PortfolioDashboardPage.jsx:196-200` | `signalBands` 가 렌더 본문에서 매번 새 객체 → `PortfolioTsrSignalTable.jsx:69` 의 `signals` useMemo 가 항상 무효화되어 `tsrSignals` + `signalLevelsForSort` 를 2×N log N 회 재실행. P2-1 의 폴링 44회와 곱해진다 |
| P3-19 | `pages/portfolio/utils/portfolioAggregate.js:73-79,111-118` | `keys.map(k => selected.map(p => members.filter(...).length))` = `O(keys × projects × members)`. `salaryHistogram` 도 버킷마다 `Array.from(seen.values()).filter(...)` 로 전체 배열 재생성. 호출부가 전부 `useMemo` 라 빈도는 낮다 |
| P3-20 | `pages/projectKanban/ProjectKanbanBoard.jsx:205-227` | `configMap` 이 `useMemo` 없이 인라인 → `<Kanban configMap={configMap}>`(`:259`)에 매번 새 참조 → 카드 N장 재렌더. 같은 파일의 다른 핸들러 7개는 전부 `useCallback` 인데 여기만 빠졌다 |
| P3-21 | `components/select/ProjectUserSelect.jsx:152`, `ProjectIssueSelect.jsx:172` | `components={{ MenuList: ({children}) => {...} }}` 로 **렌더 본문에서 컴포넌트를 정의**한다(내부에 `useRef`/`useLayoutEffect` 보유). 부모 렌더마다 컴포넌트 identity 가 바뀌어 react-select 가 MenuList 를 **매번 언마운트/리마운트** → 스크롤 위치 손실(그래서 `scrollPosRef` 로 수동 복원하는 코드가 있다). 호이스팅하면 복원 코드가 불필요해진다 |
| P3-22 | `components/table/useStableColumnWidths.js:41-84` | `useLayoutEffect` 에 의존성 배열이 없다(의도적). 정상 경로는 첫 실데이터 페인트에서 동결돼 `:43` 가드로 O(1) 이지만, `toPercentWidths` 가 `null` 을 반환하는 경우(`:55` — 총합 0 = `display:none`)에는 **영원히 동결되지 않아** 매 렌더 `getBoundingClientRect()` 를 컬럼 수+2회 호출한다. **숨겨진 탭·접힌 카드 안의 표**가 여기 해당한다(P1-2 의 `ResourcePage` 숨김 탭과 곱해진다). → 실패 시 시그니처를 "측정 불가"로 기록해 재시도를 막을 것 |
| P3-23 | `backoffice/page/user/UserPage.jsx:198,207` | `UserRegistrationModal`/`UserEditModal` 을 `isOpen=false` 여도 항상 렌더하고 두 모달이 최상단에서 `usePermissionCatalog()` 호출(`hooks/usePermissionCatalog.js:32-41` 에 `enabled` 가드 없음) → **페이지 진입 1회당 `getPermissionCatalog` 1 invoke 낭비** |
| P3-24 | `pages/myWork/myProject/MyProjectList.jsx:95-97` | `projects.filter(...)` 가 useMemo 없이 매 렌더, `searchQuery.toLowerCase()` 를 항목마다 재생성 |
| P3-25 | `utils/jiraApi/issue/getJqlIssue.js:33` → `pages/myWork/MyLogSummary.jsx:32` | 개수만 필요한데 `maxResults`/`fields` 미지정으로 기본 50건을 받아 `.length` 를 쓴다 → **51건 이상이면 KPI 숫자가 50에서 멈춘다**(정확성 문제 겸함) |
| P3-26 | `pages/project/modal/ProjectModal.jsx:99-107,129` | `staleTime:0` 으로 열 때마다 `findProjectById` 재조회(편집 모달이라 의도일 수 있음). `:129` `Promise.all(userSet.values().map(...))` 는 Set 이터레이터에 `.map` 을 거는 형태(ES2025 Iterator Helpers)라 런타임에 따라 throw 가능 — 성능 축은 아니나 기록 |
| P3-27 | `pages/myPage/hooks/useMyPermissionMatrix.js:34-59` | `sections`(중첩 map) + `all`(flatMap) + `summary`(filter 3회)가 매 렌더 실행되고 새 `sections` 배열을 반환해 `MyPermissionSection` 이 항상 리렌더. 카탈로그 14개 수준이라 실비용은 작다 |
| P3-28 | `pages/resource/assignment/projects/ProjectCardList.jsx:64` | `cards.map(...)` 이 메모 밖 + `ProjectCard` 미메모 → 보드 리렌더마다 전 카드 재렌더(수십 장 상한) |
| P3-29 | `keepPreviousData: true` **7곳** — `useProjectResourceMembers.js:101,159`, `cost/useProjectCostSummary.js:43`, `dashboard/summary/SummaryPanel.jsx:19`, `progress/ProgressPage.jsx:42`, `salary/SalaryManagementPage.jsx:77`, `user/ProjectUserPanel.jsx:73` | `@tanstack/react-query@5.95.2` 에서 이 **불리언 옵션은 제거**됐다(v5는 `placeholderData: keepPreviousData` 함수 형태만 유효 — `useWorkListQueries.js:119`·`useLevelList.js:56` 이 올바른 예). 네트워크 낭비는 없으나 페이지 전환마다 테이블이 스켈레톤으로 비워지고 10행(급여는 InlineEdit+Select 포함 ~60셀)이 전량 재마운트된다 |
| P3-30 | `analysisReport/resource/hooks/useProjectResourceMembers.js:87`, `salary/SalaryManagementPage.jsx:74` | `enabled` 누락(형제 쿼리 `:158` 에는 있음) |
| P3-31 | `pages/resource/overview/ResourceOverviewTable.jsx:41`, `assignment/people/CompanyResourceTable.jsx:47`, `organization/OrganizationTab.jsx:279`, `myPage/sections/MyIssuesPanel.jsx:102` | `head` 객체가 매 렌더 새로 생성 → `CommonTable`→`TableSurface` 의 컬럼 폭 동결 계측이 재실행될 여지 |
| P3-32 | `pages/projectDetail/user/IssueAssignSelect.jsx` | **데드코드** — `static/ui/src` 전역 import 0건이고, 비동기 아닌 `Select` 에 `loadOptions`/`defaultOptions`(`:51-52`)를 넘겨 배선해도 옵션이 안 뜬다. 살아 있는 검색 경로로 오인되지 않도록 기록 |
| P3-33 | `utils/useRoleLevelPermissions.js:10-54` vs `:56-84` | `useRoleLevelPermissions` 와 `useRoleLevel` 이 roles/levels 쿼리를 **글자 그대로 복붙**했다. 쿼리키가 같아 네트워크는 공유되지만 유지보수 이중화이고, `enabled` 가드가 없어 `components/search/UserSearchFilter.jsx:54` 처럼 필터 UI 가 보이기만 하면 invoke 3회가 나간다 |
| P3-34 | `components/chart/echart/ThemedECharts.js` 소비처 전반 | `echarts-for-react` 는 `node_modules/echarts-for-react/lib/core.js:52` 에서 `isEqual(pick(props, ['option', ...]))` 로 **깊은 비교**를 한다. 값이 같으면 `setOption` 은 건너뛰지만 **series 데이터 배열 전체를 매 렌더 순회**한다. `option` 을 인라인 조립해 넘기는 소비처가 남아 있으면 그만큼 곱해진다(대다수는 메모돼 있음 — 「통과」 참조) |
| P3-35 | `polling/JobPollingManager.jsx:24` | `const { jobIds, forgetJob, cleanupJob, init } = useJobStore();` — 셀렉터 없이 스토어 전체 구독. 앱 루트에 상시 마운트되지만 `useJobStore` 상태가 `jobIds` 하나뿐이라 실손해는 미미하다. **공용 레이어에서 셀렉터 없이 구독하는 유일한 지점**이라 기록만 남긴다 |
| P3-36 | `components/table/TableSurface.jsx:47` | 로딩 중 `buildSkeletonRows(head, skeletonRowCount)`(`skeletonRows.js:21`)가 매 렌더 새 배열을 만들어 `adaptedRows` 메모를 **확정적으로** 무효화한다(P1-13 의 로딩 구간 비용) |

---

## 통과 (확인했고 문제 없음)

> 침묵 = 미검증 오독을 막기 위해 명시한다.

| 축 | 확인 내용 | 판정 |
|----|----------|------|
| **렌더 루프 안 `invoke()` (진성 N+1)** | 582 파일 전 범위에서 `.map()`/`forEach` **렌더 루프** 안의 `invoke`/`requestJira` **0건**. P1-4 의 `getUser` 는 전부 queryFn 내부 루프(수정 대상이지만 렌더 루프는 아니다) | **통과** |
| **`requestJira` 경로 집중화** | 프론트의 Jira 직접 호출은 `utils/jiraApi/requestJira.js:168` 단일 지점을 통과한다. 산발적 `requestJira` 호출 없음 | **통과** |
| **코드 스플리팅 구조** | `App.jsx` 라우트 15개 + `constants/tabs.js` 탭 13개 + `ProjectWorkPanel.jsx` 뷰 2개가 `React.lazy`. 빌드 산출물에서 **echarts(1,112KB 청크)·xyflow·svar-gantt·exceljs·react-grid-layout·kanban-kit 이 main 에 0바이트** 확인 → 분리 자체는 의도대로 동작 중이다(예외는 P1-1 두 덩어리) | **통과** |
| **탭 활성-only 렌더** | `components/tabs/CommonTab.jsx:70-81` 이 활성 탭 1개만 렌더 + Suspense/ChunkErrorBoundary 경계 소유. `MainPageTabs`/`ProjectDetailTabs` 가 이를 사용 | **통과** (예외 2건: P1-2 `ResourcePage`, `IssueAddModal`) |
| **폴링 백그라운드 정지** | `pages/project/ProjectPage.jsx:30`(5분)·`projectKanban/ProjectKanbanBoard.jsx:85`(3분)은 `refetchIntervalInBackground` 미설정 → `query-core/queryObserver.js:215` 의 `focusManager.isFocused()` 가드로 백그라운드 탭에서 정지. `ProjectPage.jsx:31` 에 해당 옵션이 **주석 처리**된 것도 의도적. 두 탭은 `CommonTab` 상 동시에 살아 있지도 않다 | **통과** (예외: P1-7 `JobPollingManager` 는 raw setInterval 이라 이 보호 밖) |
| **모달 데이터 선로드** | `components/modal/CommonModal.jsx:26` 이 `{isOpen && children}` 으로 게이트 → `TeamSelect`·`ProjectUserPanel`·`ProjectIssuePanel`·`RequiredSkillEditor` 등이 열기 전까지 마운트 안 됨. `projectKanban/KanbanCard.jsx:188,194` 가 카드마다 모달 2개를 렌더하지만 같은 이유로 카드당 invoke 0 | **통과** (예외: P3-23 `UserPage` 의 모달 2종은 `CommonModal` 밖에서 훅을 호출) |
| **`enabled` 가드** | resource/portfolio/myPage 전 훅이 권한·식별자 가드 보유(`canRead`, `canReadReport`, `!!accountId && projectIds.length>0`, `!!teamKey`, `!!projectId && enabled`). myWork/backoffice 도 `useMyWorklogList.js:28`, `useMyIssueTable.js:23`, `WorklogPage.jsx:104,134`, `ProjectDetailDrawer.jsx:85,104,114`, `useSkillQuickAddModal.js:31`, `useUserEditModal.js:86,114`, `useTeamMemberAssignModal.js:44` 정상 | **통과** (누락 2건 P3-30) |
| **ECharts `option` 메모화** | portfolio 위젯 13종 + teamAnalytics 6종 + allocation + myPage 3종 + `cost/*`·`progress/ProgressSCurve.jsx:127`·`analysisReport/issue/IssueAnalysisChart.jsx:252`·`taskHistory/TaskHistoryBurnup.jsx:70`·`dashboard/ChartTemplate.js:160` **전부 `useMemo` + 올바른 deps**. `t`(`stores/useI18nStore.js:4-13`)와 `isDark` 는 안정 참조 | **통과** (deps 가 매번 바뀌는 예외 2건: P1-10, P3-4) |
| **ECharts 테마 등록 위치** | `components/chart/echart/ThemedECharts.js:15` 가 `utils/echartsTheme`(=`import * as echarts`) 를 소유하고 `App.jsx:3-7` 이 진입부 import 를 금지하는 근거를 명시. 빌드에서 echarts 0바이트 in main 으로 실증됨 | **통과** |
| **Zustand 셀렉터 범위** | 스토어 셀렉터가 **새 객체/배열을 반환하는 지점 0건**(`s => s.t`, `s => s.canRead('X')` 등 스칼라만). 광역 재렌더 유발 없음. projectDetail 트리에 React Context 도 없다 | **통과** |
| **쓰기 후 캐시 패치 규약** | `projectDetail/assignment/*`(`useAssignWorkItem.js:17,45-51` — invalidate 금지 + `refetchOnWindowFocus:false`), `gantt/useGanttFolderMutations.js:16-21`, `useGanttMutations` 의 일정/부모/링크 3종(`:156-158` 근거 주석), `ProjectIssueTable` 의 `patchGroupPage`, `resource/assignment/patchAssignmentCache.js:6,95` 전부 준수 | **통과** (위반 2건: P1-5 `useUpdateCoworkers`, P2-5 워크로그 드롭) |
| **낙관적 업데이트** | `projectKanban/useKanbanMutations.js` 6종 모두 `onMutate` 낙관 패치 + `onError` 롤백 + 정확 범위 invalidate(`utils/queryKey/projectKeys.js:25-39`) | **통과** |
| **광역 invalidate 남발** | `backoffice/page/setting/SalaryPolicySetting.jsx:116-121`(6키)와 `backoffice/page/team/TeamPage.jsx:103-111`(5키)은 **해당 페이지에 활성 관측자가 없어 stale 마킹으로 끝난다**(실제 재조회 0~1회). `TeamPage.jsx:106-108` 에 근거 주석도 있다. `utils/queryKey/salaryBandInvalidation.js` 는 전용 테스트로 고정 | **통과** (실제 폭파 2건: P2-3 급여, P2-4 사용자) |
| **쿼리키 팩토리 계약** | 인라인 배열 리터럴 0건. `utils/queryKey/queryKeyContract.test.js:24` 가 `invalidateQueries|setQueryData|...(\[` 패턴을 정규식으로 금지 | **통과** |
| **서버 페이징** | `backoffice/page/user/UserListPaging.jsx:33`(`getUserListWithPaging`), `pages/project/ProjectPage.jsx:26`(page/pagesize), `IssueAnalysisTable`·`TaskHistoryTable`(커서), `getProjectSalaryList`(page), `findProjectusersByProjectId`(page/pageSize), `assignment/ProjectGroupCard.jsx:55-56,127-134`(1회 lazy 마운트 후 `display` 토글 → 접기/펴기 재조회 0) 정상. **전량 수신 후 클라 페이징은 `useTeamMemberAssignModal.js:54-86` 1건뿐이고, `:19-25` 주석에 "서버 페이징 경로는 권한 축이 달라 쓸 수 없다"는 근거가 문서화**돼 있다 | **통과** |
| **가상화/윈도잉** | `resource/assignment/people/CompanyResourceTable.jsx:45` 가 `useInfiniteSlice(rows,{initial:30,step:30})`. `CommonTable`→`TableSurface`→DynamicTable 은 `rowsPerPage` 로 DOM 행 제한. (문제는 DOM 이 아니라 그 앞단 조립 — P1-12) | **통과** |
| **디바운스 적용 현황** | 정상 10곳 — `AssignmentPage.jsx:108-109`(200ms), `ProjectIssuePanel.jsx:42`·`IssueAddModal.jsx:35`·`IssueAnalysisTable.jsx:164`·`TaskHistoryTable.jsx:47`·`useSubscriptionPreview.js:26`(300ms), `ProjectHeader.jsx:30`(300ms), `ProjectIssueAssignSelect.jsx:78`(400ms), `DropdownJql.jsx:50`(500ms), `ProjectAssignmentBoard.jsx:77`(200ms), `ProjectUserSelect.jsx:60,109`(1000ms) | **통과** (누락 5곳: P1-8, P1-12) |
| **Jira 권한 조회 캐싱** | `utils/jiraApi/useJiraEditGuards.js:26-27,51-71` 모듈 TTL 5분 캐시 → 뮤테이션마다 재조회 없음 | **통과** |
| **동일 resolver 중복 호출 (키 공유)** | `getSettingData` 17개소 전부 `settingKeys.detail()` 공유, `getResourceOverview` 4개 탭 공유(`resourceKeys.overview()`), `getPortfolioDashboard` 를 `/dashboard` 와 팀 분석 탭이 공유(`useTeamAnalyticsData.js:29-33,83` 이 캐시 값 형태까지 맞춤), `ganttKeys.data` 를 GanttPage/ProjectTreeView 가 공유(뷰 전환 재조회 0) | **통과** (staleTime 불일치만 P2-7, `view.getContext()` 3중 키만 P2-9) |
| **팀 집계 알고리즘 복잡도** | `utils/team/` 의 `teamMetricsByTeam`·`rollupTeamTree`·`aggregateByTeam`·`projectTeamMatrix`·`compositionByTeam` 전부 단일 순회 + Map 기반. `rollupTeamTree` 는 O(teams) + 사이클 방어(`visited`) 보유 | **통과** (중복 호출만 P2-8, P3-14) |
| **`projectDetail/assignment/` 전 축** | 보드 1 invoke(`useWorkAssignmentBoard.js:22-34`), 풀은 `poolOpen && meta?.poolAvailable` 온디맨드(`AssignmentPage.jsx:96`), 전 파생값 메모화, 전 핸들러 `useCallback`, 순수 유틸이 미변경 시 원본 참조 반환 → **리포 내 모범 사례** | **통과** |
| **관계도 온디맨드 로드** | `AllocationGraphSection` 은 `graphOpen` 일 때만 마운트 → `getResourceAllocationGraph` 가 펼칠 때만 발사(`ProjectAssignmentBoard.jsx:336-340`) | **통과** |
| **FullCalendar 리사이즈 처리** | `components/calendar/FullCalendar.jsx:27-38` 의 ResizeObserver 는 **자기 인스턴스에만** `getApi().updateSize()` 를 호출한다(전역 디스패치 아님) | **통과** |
| **1회성 전역 resize 디스패치** | `components/card/CardFullscreen.jsx:25`, `components/card/collapse/CardCollapseContext.jsx:55`, `portfolio/widgets/ChartBox.jsx:19`, `resource/teamAnalytics/TeamChartBox.jsx:32` 는 전부 `setTimeout` 1회성(100~200ms) — 연속 발화 없음 | **통과** (연속 발화 1건: P1-11) |
| **중복 유틸/의존성** | `from 'moment'` 직접 import **0건** — moment 는 `@fullcalendar/moment-timezone` 전이 의존성뿐이고 앱 코드는 `dayjs` 로 통일. **이중 날짜 라이브러리 사용 없음.** ECharts 는 `ThemedECharts` 단일 진입 | **통과** |
| **스토어 중복 로드 가드** | `stores/usePermissionStore.js:37` · `stores/useLicenseStore.js:82` 의 `_loaded`/`_loading` 가드 덕에 `App.jsx:72-78` 의 이중 `useEffect`(StrictMode 이중 실행 포함)에서도 invoke 1회 | **통과** |
| **`adaptRows` 무변경 최적화** | `components/table/tableSort.js:191` 의 `if (!needsRewrite) return rows` 가 실제로 동작한다. `sortValue` 를 쓰는 표가 4개뿐(`StorageProjectList`, `StorageTableList`, `PortfolioProjectTable`, `ResourceAnalysisTable`)이라 **O(행×열) 객체 전량 재할당 경로는 거의 타지 않는다** — P1-13 의 실비용은 스캔·임시배열 쪽이다 | **통과** |
| **`hooks/` 의 staleTime·enabled** | `useProjectTeams`(60s + enabled), `useTeamOptions`(5m + enabled), `useTeamUserCandidates`(5m + enabled), `usePermissionCatalog`(10m + gcTime), `usePublicHolidayList`(30m), `useJiraEditGuards`(5m + 모듈 TTL 캐시) 정상. `useTeamMemberCandidates` 의 `staleTime:0` 은 `:37` 에 근거가 명시된 **의도적** 선택 | **통과** |
| **`CardFullscreen` 이중 렌더 없음** | `components/card/CardFullscreen.jsx:29` 의 `if (!isOpen) return null` 로 닫힌 동안 children 을 그리지 않는다(`Card.jsx:82` 가 항상 렌더하는 것처럼 보이나 실비용 0). **P2-15 의 드로어 이중 마운트와는 다른 구조** | **통과** |
| **`useInfiniteSlice`** | `utils/useInfiniteSlice.js` — IntersectionObserver 정리·의존성 정상 | **통과** |
| **`JobPollingManager` 내부 방어** | `inFlightRef` 중복 호출 차단 · `nextPollAtRef` 지수 백오프 · `intervalsRef` 중복 인터벌 방지 · 언마운트 정리(`:40-44`) 모두 갖춤 — 결함은 **백그라운드 미정지와 종료 조건**(P1-7)뿐 | **통과** |

---

## 미검증 (이 감사로 확인할 수 없는 것)

| 항목 | 사유 |
|------|------|
| P1-1 의 **gzip 절감량 정확치** | 원본 바이트 귀속(1,261KB / 34.1%)은 소스맵으로 확정했으나, gzip 은 콘텐츠별 압축률이 달라 실제 lazy 분리 후 `node scripts/check-bundle-budget.js` 를 다시 돌려야 확정된다. 본문의 250~300KB 는 비례 추정치다 |
| 각 항목의 **실제 체감 지연(ms)** | 정적 분석이라 호출 횟수·재렌더 범위·바이트만 정량화했다. 프로파일러 실측(React DevTools Profiler / Performance 탭)은 미수행 |
| 대량 데이터 시나리오의 **실제 데이터 규모** | 500명 조직·2,000 이슈·50 프로젝트 등은 코드의 상한 상수(`USER_MAX=100`, `MAX_ISSUES=2000`, `MAX_GRAPH_PROJECTS=15`, 팀 500)에서 가져온 값이다. 운영 사이트의 실제 분포는 미확인 |
| Forge iframe 에서 `refetchOnWindowFocus` 의 **실제 발화 빈도** | Jira 페이지와 iframe 사이 포커스 전환이 `focusManager` 에 어떻게 잡히는지는 배포 환경 실측 필요. 전제 (a) 의 비용은 "발화한다면"의 조건부다 |
| `EchartPanel` 의 ResizeObserver **되먹임 루프 실재 여부** | 코드 경로상 가능하나(차트 resize → 컨테이너 크기 변화 → 옵저버 재발화), 실제로 무한 루프에 들어가는지는 브라우저 실측 필요. 리사이즈 증폭(N개 차트 동시 재측정) 자체는 코드로 확정 |
| 테스트·빌드 실행 | 이 감사는 **읽기 전용**이라 `npm test`·`npm run build` 를 새로 돌리지 않았다. 번들 수치는 기존 `build/` 산출물(2026-08-12 15:34, `main.4db70f69.js` = raw 3,701,918B / gzip 898,285B / 예산 950,000B) 기준이다 |
| P1-13 의 Atlaskit 재정렬이 **실제로 얼마나 자주 발현하는지** | 코드상 `getSortedRows` 는 `sortKey` 가 있을 때만 정렬한다(확인 완료). 즉 "사용자가 정렬 헤더를 클릭한 표"에서만 발현하는데, 실사용에서 정렬을 켜 둔 채 오래 머무는 비율은 미확인이다. **정렬을 켜지 않은 표에서의 비용(우리 쪽 `resolveSortableColumns`/`adaptRows` 재실행)은 조건 없이 발생**하므로 항목 자체는 성립한다 |
| 한글 IME 조합 중 `onInputChange` **실제 발화 횟수** | P1-8·P2-19 의 "8~11회"는 조합 중간 단계가 매번 발화한다는 가정이다. 브라우저·IME 조합에 따라 다르므로 실측 필요(디바운스 적용의 타당성은 가정과 무관하게 성립) |
