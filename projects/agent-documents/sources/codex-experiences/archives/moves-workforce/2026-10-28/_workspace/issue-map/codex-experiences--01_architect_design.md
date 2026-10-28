# 이슈 맵 (issue-map) 설계서

작성일: 2026-09-02 / 브랜치: RFC-192 / 입력: `_workspace/issue-map/00_input/requirement.md`

조사한 실제 코드(추측 없음):
`WORK_VIEWS.md`, `ProjectWorkPanel.jsx`, `ProjectTreeView.jsx`, `TreeStructurePanel.jsx`, `TreeDetailPanel.jsx`,
`buildWorkTree.js`, `useIssueWorklogs.js`, `gantt/ganttAdapter.js`, `gantt/useGanttData.js`,
`src/resolver/gantt/GanttMapper.js`, `utils/jiraApi/requestJira.js`, `utils/queryKey/projectKeys.js`,
`backoffice/.../flow/ProjectStatusFlow.jsx`, `components/drawer/SideDrawer.jsx`,
`components/layout/ResizablePanels.jsx`, `components/skeleton/Skeleton.jsx`, `components/chart/EmptyState.jsx`,
`components/issue/IssueComponent.js`, `constants/statusColorMap.js`, `constants/chartPalette.js`,
`utils/useUrlParam.js`, `utils/i18n.js`, `utils/useJiraSiteUrl.js`, `locales/script/merge.js`, `static/ui/jest.config.js`, `manifest.yml`.

---

## 1. 개요 / 영향 범위

프로젝트 상세 > **작업관리 탭**의 4번째 뷰 `map`. 이슈를 티켓 카드 노드로 가로 트리 배치(React Flow 캔버스 + 직접 작성 레이아웃), 카드 클릭 → 우측 드로어(워크로그 이력 / 커밋 이력).

### 1-1. 백엔드: **없음**

트리 뷰와 **같은 원칙**이다 — 같은 이슈 집합을 다르게 보는 뷰는 전용 resolver 를 만들지 않는다(`WORK_VIEWS.md` §2). 읽기는 `useGanttData`(= `getProjectGanttData`, 쿼리키 `ganttKeys.data`)를 그대로 쓰고, 계층은 `toSvarTasks` → `buildWorkTree` 결과를 재사용한다. resolver·Service·Repository·`PermissionMap`·`src/index.js`·DB(MySQL/KVS)·마이그레이션 **전부 변경 없음**.

### 1-2. 프론트

| 구분 | 대상 |
|------|------|
| 신규 디렉토리 | `static/ui/src/pages/projectDetail/work/map/` (컴포넌트 8 + 순수모듈 3 + CSS 1 + 테스트 4) |
| 신규 공용 모듈 | `work/workFilterOptions.js`(트리·맵 공유), `work/WorklogHistoryList.jsx`(트리·맵 공유) |
| 수정 | `work/ProjectWorkPanel.jsx`(4번째 뷰), `work/ProjectTreeView.jsx`(필터 유도 로직 이관), `work/TreeDetailPanel.jsx`(워크로그 표현 이관), `utils/jiraApi/requestJira.js`(액션 1개), `utils/queryKey/projectKeys.js`(키 1개) |
| 라우트 | 신규 없음. `?view=map` (`useUrlParam('view')`) |
| 스토어 | 변경 없음(`useI18nStore`/`usePermissionStore` 소비만) |

### 1-3. i18n

| 파일 | 추가 |
|------|------|
| `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` | `work.view.map` 1개(기존 `table/tree/gantt` 객체에 추가) |
| `locales/kr/issueMap.json` · `locales/en/issueMap.json` | **신규 파일** — 기능 전용 키 전체 |

⚠ `merge.js`는 **파일명이 곧 네임스페이스**다(`locales/script/merge.js` 실측). `issueMap.json` → `issueMap.*`. 추가 후 `cd static/ui && npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.

---

## 2. 경계면 계약

백엔드 resolver 가 없으므로 이 기능의 경계면은 **(a) 어댑터 노드 → 카드 props**, **(b) Jira dev-status 응답 → 파서 출력**, **(c) 워크로그 훅 출력 → 드로어** 세 곳이다. 이 표가 backend/frontend 대신 **순수모듈 ↔ 컴포넌트**의 단일 진실이다.

### 2-a. `useGanttData` → `toSvarTasks` 노드 → 카드 props

`toIssueCardProps(svarNode)` (`map/mapNodeCard.js`, 순수 함수). **좌변 필드명은 `ganttAdapter.toSvarTasks` 실측 출력 그대로다.**

| SVAR 노드 필드 (실측) | 값 | 카드 props | 폴백 |
|---|---|---|---|
| `id` | 이슈 key 문자열(`GanttMapper`: `task.id = issue.key`) | `id` | 필수 |
| `key` | `id`와 동일값(어댑터가 `key: id`로 복사) | `issueKey` | `id` |
| `text` | `task.summary ?? id` | `title` | `''` |
| `issueTypeIcon` | `f.issuetype.iconUrl \| null` | `typeIconUrl` | `null` |
| `issueType` | 이슈 유형명 문자열 \| null | `typeName` | `null` |
| `assigneeObj` | `{ accountId, displayName, avatarUrl }` \| null | `assignee` | `null` → 미배정 표기 |
| `statusCategory` | `{ key, name, colorName }` \| null | `status` | `null` → 배지 미표시 |
| `progressPercent` | `f.aggregateprogress.percent` (0~100) \| null. 폴더는 MD 가중 롤업 | `percent` | `null` → 바 비움 + `-` |
| `progress` | `computeProgress×100`(0~100, 근사) | (사용 안 함, §2-a-1) | — |
| `issueId` | 숫자 Jira id **문자열** (`issue.id`) \| null | `issueId` | `null` → 커밋 조회 불가 |
| `project` | `{ id, key, name, avatarUrl }` \| null | `project` | `null` |
| `folder` | `true`면 폴더 합성 노드 | `isFolder` | `false` |
| `folderId` / `folderParentId` / `folderDepth` | 폴더 전용 | 폴더 노드 렌더에만 사용 | — |
| `children.length` (buildWorkTree 부착) | 자식 수 | `childCount` | `0` |

**⚠ 요구사항 정정 2건 (실측 결과)**

1. **`issueKey` 라는 필드는 SVAR 노드에 없다.** `id`와 `key`가 둘 다 이슈 key 문자열이다. 카드는 `node.key ?? node.id`를 쓴다. (원본 이슈 재매핑 불필요)
2. **`statusKey` 는 어댑터가 통과시키지 않는다.** `toSvarTasks` 출력에는 `statusCategory`만 있다(`statusKey`는 필터 단계의 **원본 task** 에만 있다). 상태 필터는 트리와 동일하게 **어댑터 이전의 `task.statusKey`** 로 건다. 카드 배지는 `statusCategory`.

#### 2-a-1. 진행도는 `progressPercent` 를 쓴다 (결정)

요구사항은 `progress`(0~100)라고 적었지만, 실측상 두 값의 의미가 다르다:

- `svar.progress` = `computeProgress(fields)*100` — done이면 100, 아니면 `timeSpent/originalEstimate` **근사**. 간트 막대 채움 전용.
- `svar.progressPercent` = `f.aggregateprogress.percent` — **트리 상세 패널의 "처리율"이 쓰는 값**(`TreeDetailPanel`: `<ProgressBar percent={node.progressPercent} />`). 폴더 노드는 어댑터가 MD 가중 평균을 넣는다.

같은 화면 그룹(트리/맵)이 같은 숫자를 보여야 하므로 **카드는 `progressPercent`** 를 쓴다. `null`이면 바를 비우고 `-`로 표기한다. 새 진행도 정의를 만들지 않는다는 요구는 지켜진다(트리의 정의를 그대로 차용).

### 2-b. Jira dev-status 응답 → `parseDevStatusCommits` 출력

요청: `executeRequest('getIssueDevStatus', { issueId, applicationType: 'bitbucket', dataType: 'repository' }, {})`
(GET → `param`이 쿼리스트링이 된다. URL 에 `{}` 치환자가 없으므로 `urlParam`은 `{}`.)

**출력 계약(항상 이 shape. throw 하지 않는다):**

```js
{
  ok: boolean,                 // false면 화면은 오류/빈 상태만 그린다
  reason: null | 'REQUEST_FAILED' | 'ERROR_RESPONSE' | 'UNEXPECTED_SHAPE' | 'NO_ISSUE_ID',
  errorCode: string | null,    // executeRequest 에러 봉투의 error.code (403/404 등)
  repositories: [
    {
      id: string | null,
      name: string,            // 없으면 '' — 화면은 name 없으면 '(unknown)' 라벨
      url: string | null,      // 저장소 링크(없으면 링크 비활성)
      commits: [
        {
          id: string,          // 전체 해시
          displayId: string,   // 짧은 해시(없으면 id.slice(0,7))
          message: string,     // 원문 전체
          title: string,       // message 첫 줄 trim (UI 1줄 표시용)
          authorName: string | null,
          authorAvatar: string | null,
          timestamp: number | null,  // epoch ms 로 정규화
          url: string | null,        // Bitbucket 커밋 URL
          fileCount: number | null,
          merge: boolean
        }
      ]
    }
  ],
  totalCommits: number
}
```

**정규화·방어 규칙 (전부 파서 안에서, jest 대상):**

| 입력 상황 | 출력 |
|---|---|
| `input == null` | `ok:false, reason:'REQUEST_FAILED'` |
| `input.success === false` (executeRequest 에러 봉투) | `ok:false, reason:'REQUEST_FAILED', errorCode: input.error?.code` |
| `Array.isArray(input.detail) === false` | `ok:false, reason:'UNEXPECTED_SHAPE'` |
| `detail` 정상 + 파싱된 저장소 0 + `input.errors?.length > 0` | `ok:false, reason:'ERROR_RESPONSE'` |
| `detail` 정상 + 저장소 0 + errors 없음 | **`ok:true`, `repositories:[]`** → 화면 "연동된 저장소 없음" |
| `detail` 정상 + 저장소 ≥1 (errors 유무 무관) | `ok:true` + 파싱 결과 |
| `issueId` 없음(훅이 조회 자체를 안 함) | `ok:false, reason:'NO_ISSUE_ID'` |

- `detail[]`을 순회하며 각 항목의 `repositories[]`를 평탄 병합한다(dev-status 는 detail 이 배열이다).
- `commits`가 배열이 아니면 그 저장소는 `commits: []`로 살린다(저장소는 목록에 남긴다).
- `authorTimestamp`: number 면 그대로, string 이면 `Date.parse` 시도, 실패/부재면 `null`.
- `author`: `{ name, avatar }`(dev-status 형식) 우선, 없으면 `displayName`/`avatarUrl`도 시도, 전부 없으면 `null`.
- `fileCount`: `Number.isFinite` 아니면 `null`. `files?.length` 폴백 허용.
- 정렬: 저장소는 `name` 오름차순, 커밋은 `timestamp` **내림차순**(null 은 뒤).
- 상한: 저장소당 커밋 `MAX_COMMITS_PER_REPO = 50` 슬라이스(응답 폭주 방어). 잘렸으면 `repo.truncated = true`.

**소비 훅** `useIssueDevStatus(issueId, { enabled })` (`map/useIssueDevStatus.js`)

```
queryKey : projectKeys.issueDevStatus(issueId)   // ['issueDevStatus', issueId]
enabled  : !!issueId && enabled                  // 커밋 탭이 열렸을 때만 (온디맨드)
staleTime: 1000 * 60 * 5
retry    : false                                 // 비공개 API — 재시도 무의미
queryFn  : parseDevStatusCommits(await executeRequest(...))
반환      : { result, isLoading }   // isError 를 쓰지 않는다 — 판정은 result.ok 하나로 통일
```

**폴백 UI 계약** (드로어 커밋 탭):

| 상태 | 표시 |
|---|---|
| `isLoading` | `SkeletonTable rows={3}` (스피너 금지) |
| `ok && totalCommits > 0` | 저장소 그룹 → 커밋 목록 |
| `ok && repositories.length === 0` | `EmptyState` + `issueMap.commit.empty`("연동된 저장소가 없습니다") |
| `!ok` (REQUEST_FAILED / ERROR_RESPONSE / UNEXPECTED_SHAPE) | `EmptyState` + `issueMap.commit.unavailable` + 회색 힌트 `issueMap.commit.unavailableHint`. **`SectionMessage appearance="error"` 를 쓰지 않는다** — 비공개 API 미지원은 사용자 잘못이 아니고, 붉은 오류 박스는 앱이 고장난 인상을 준다 |
| `reason === 'NO_ISSUE_ID'` | `EmptyState` + `issueMap.commit.noIssueId` |

맵의 나머지(캔버스·카드·워크로그 탭)는 커밋 결과와 **무관하게** 정상 동작해야 한다(fail-soft).

### 2-c. `useIssueWorklogs` 출력 → 드로어 워크로그 탭

기존 훅을 **무수정 재사용**한다(`useIssueWorklogs(issueKey)`).

| 훅 반환 | 타입 | 드로어 표시 |
|---|---|---|
| `worklogs` | Jira worklog 배열, **started 내림차순 정렬 완료** | 행 목록 |
| `worklogs[].author.displayName` / `.avatarUrls['24x24']` | string / string | 아바타 + 이름 |
| `worklogs[].started` | ISO 문자열 | `slice(0,10)` 날짜 |
| `worklogs[].timeSpent` | `'3h 30m'` 표기 문자열 | 굵게 |
| `worklogs[].comment` | ADF 객체 \| 문자열 | `extractComment()` 로 텍스트만, 1줄 말줄임 |
| `totalSeconds` | number | 헤더 `· {n}h` (`Math.round(x/3600*10)/10`) |
| `isLoading` | boolean | `SkeletonTable rows={3}` |
| `isError` | boolean | `EmptyState` + `issueMap.worklog.unavailable` |

⚠ `executeRequest`는 실패 시 **throw 하지 않고 `{success:false}`를 반환**한다. `useIssueWorklogs`는 이미 `Array.isArray(res?.worklogs)` 로 방어하고 있어 실패 시 빈 배열이 된다 → 화면은 "워크로그 없음"으로 보인다. 이 동작은 기존 트리와 동일하므로 **바꾸지 않는다**(맵만 다르게 굴면 두 화면이 어긋난다).

---

## 3. 백엔드 설계

**없음.** 트리 뷰와 같은 원칙이다 — 같은 이슈 집합을 다르게 보는 뷰는 전용 resolver 를 만들지 않고 `getProjectGanttData`(+`ganttKeys.data` 캐시)를 공유한다. 계층 규칙을 재해석하면 트리·간트·맵이 서로 다른 트리를 그리게 된다(`WORK_VIEWS.md` §2).

따라서 `src/` 는 **단 한 줄도 바뀌지 않는다**: Controller/Service/Repository 신규 없음, `PermissionMap` 등록 없음, `src/index.js` `CONTROLLER_REGISTRARS` 변경 없음, `ErrorCodes` 추가 없음, `manifest.yml` scope 추가 없음(`read:jira-work` 로 프론트 `requestJira` 가 나간다 — dev-status 프록시 허용 여부는 §8 리스크).

---

## 4. 프론트엔드 설계

### 4-1. 파일 목록

**신규 — `static/ui/src/pages/projectDetail/work/map/`**

| 파일 | 책임 | jest |
|---|---|---|
| `ProjectIssueMapView.jsx` | 뷰 루트. `useGanttData` → 필터 → `toSvarTasks` → `buildWorkTree` → `layoutIssueTree` → 캔버스/드로어. **모든 화면 상태를 소유**(§4-4). lazy default export | — |
| `IssueMapCanvas.jsx` | `<ReactFlow>` 래퍼. `nodeTypes`·엣지 기본값·`Background`/`Controls`/`MiniMap`·`fitView`·읽기전용 플래그. 노드/엣지 배열을 props 로 받는다(계산 안 함) | — |
| `IssueCardNode.jsx` | 이슈 티켓 카드 커스텀 노드. `toIssueCardProps` 소비. 카드 클릭/커밋 버튼/펼침 chevron 3개 상호작용 | — |
| `FolderGroupNode.jsx` | 폴더 합성 노드(그룹 헤더 카드). 커밋·워크로그 버튼 없음 | — |
| `IssueMapToolbar.jsx` | 검색 + 담당자/상태/스페이스 필터 + 모두 펼침/접기 + 미니맵 토글 | — |
| `IssueMapDrawer.jsx` | `SideDrawer` + 헤더(키/제목/담당자/상태/진행도) + 탭 2개 | — |
| `MapWorklogTab.jsx` | `useIssueWorklogs` → `WorklogHistoryList` | — |
| `MapCommitTab.jsx` | `useIssueDevStatus` → 저장소 그룹 + 커밋 행. `router.open` 외부 링크 | — |
| `useIssueDevStatus.js` | dev-status 온디맨드 쿼리 훅 | — |
| **`layoutIssueTree.js`** | **순수** — 트리+접힘 → `{nodes, edges}` 좌표. `initialCollapsedIds`, `collectExpandableIds` 포함 | ✅ |
| **`parseDevStatusCommits.js`** | **순수** — dev-status 응답 shape 방어·정규화 단일 지점 | ✅ |
| **`mapNodeCard.js`** | **순수** — SVAR 노드 → 카드 props 매핑(§2-a) + `statusAccent(statusCategoryKey)` | ✅ |
| `issueMap.css` | React Flow 오버라이드(엣지/핸들/컨트롤/미니맵)와 카드 line-clamp. 색은 `var(--ds-*)` | — |
| `layoutIssueTree.test.js` / `parseDevStatusCommits.test.js` / `mapNodeCard.test.js` | §7 | ✅ |

**신규 — 트리와 공유하는 공용 모듈 (`work/`)**

| 파일 | 책임 | 왜 뽑는가 |
|---|---|---|
| **`workFilterOptions.js`** | **순수** — `deriveAssigneeOptions(tasks)`, `deriveStatusOptions(tasks)`, `filterGanttTasks(tasks, {assignees, statuses, projectKeys, search})` | 지금 이 로직은 `ProjectTreeView.jsx` 안에 인라인으로 있다. 맵이 복사하면 **두 뷰가 다른 트리를 그릴 수 있다** — 요구사항 §2("트리 뷰와 같은 트리")를 코드 수준에서 보장하려면 단일 출처여야 한다 |
| **`WorklogHistoryList.jsx`** | 워크로그 행 목록 + 합계 + `extractComment` | 요구사항 §4-3 "TreeDetailPanel 워크로그 섹션 재사용/공용화 검토"의 답. `WorklogRow`/`extractComment` 를 그대로 옮긴다 |
| `workFilterOptions.test.js` | §7 | ✅ |

**수정**

| 파일 | 변경 | 제약 |
|---|---|---|
| `work/ProjectWorkPanel.jsx` | ① `const ProjectIssueMapView = React.lazy(() => import('./map/ProjectIssueMapView'))` ② `items` 에 `{ mode:'map', icon:<NodeIcon/>, label:t('projectDetail.work.view.map') }` 를 `canReadGantt` 블록 안에 push ③ `viewMode === 'map'` 렌더 분기 — 기존 Suspense 경계 **안쪽** ④ tree/gantt 와 **같은 필터 6종** 전달 | 첫 뷰(table) 정적 유지. Suspense 경계 밖으로 나가면 React #426 |
| `work/ProjectTreeView.jsx` | 인라인 `assigneeOptions`/`statusOptions`/`filtered` 계산 → `workFilterOptions` 호출로 치환 | **동작 무변경 리팩토링.** 정렬 순서(`{new:0, indeterminate:1, done:2}`)·고아 승격·폴더 미필터 규칙 그대로 |
| `work/TreeDetailPanel.jsx` | 로컬 `WorklogRow`/`extractComment` 제거 → `WorklogHistoryList` import | **동작 무변경.** 마크업·토큰 동일 |
| `utils/jiraApi/requestJira.js` | `REQUEST_MAP` 에 `getIssueDevStatus: { type: TYPE_MAP.GET, url: '/rest/dev-status/latest/issue/detail' }` 추가 + "비공개 API, 폴백 필수" 주석 | 기존 항목 형식 그대로 |
| `utils/queryKey/projectKeys.js` | `issueDevStatus: (issueId) => ['issueDevStatus', issueId]` (`issueWorklogs`/`issueRelations` 바로 아래) | `queryKeyContract.test.js` 준수 |

### 4-2. 컴포넌트 트리

```
ProjectWorkPanel  (셸 — 필터 소유, ?view 소유)
└─ <Suspense fallback={<PageSkeleton/>}>
   └─ ProjectIssueMapView          ★ 화면 상태 전부 소유
      ├─ IssueMapToolbar           (검색·필터·펼침/접기·미니맵 토글)
      ├─ IssueMapCanvas            (ReactFlow)
      │   ├─ nodeTypes.issueCard  → IssueCardNode
      │   │     ├─ IssueComponent  (재사용 — 키 + 유형 아이콘 + Jira 링크)
      │   │     ├─ StatusComponent (재사용 — 상태 배지)
      │   │     ├─ Avatar          (@atlaskit/avatar)
      │   │     └─ CardProgressBar (map 로컬 — 6px 바)
      │   ├─ nodeTypes.folderGroup → FolderGroupNode
      │   ├─ <Background variant="dots"/>  <Controls/>  {showMiniMap && <MiniMap/>}
      └─ IssueMapDrawer            (SideDrawer 재사용)
         ├─ header: 키·제목·담당자·상태·진행도
         └─ <Tabs @atlaskit/tabs>
            ├─ MapWorklogTab  → useIssueWorklogs → WorklogHistoryList
            └─ MapCommitTab   → useIssueDevStatus → RepoGroup[] → CommitRow[]
```

### 4-3. 권한

- 뷰 노출: `usePermissionStore(s => s.canRead('PROJECT'))` — tree/gantt 와 **같은 게이트**(`ProjectWorkPanel`의 기존 `canReadGantt` 블록에 그대로 얹는다). 별도 권한 키를 만들지 않는다.
- 쓰기 권한(`canWrite`) 불필요 — 맵은 **읽기 전용**(요구사항 §7). 카드 DnD·편집·모달 전부 없음.
- `?view=map` 인데 권한이 없으면 기존 파생 로직(`items.some(...) ? viewParam : items[0].mode`)이 자동으로 `table` 로 되돌린다 — 추가 코드 불필요.

### 4-4. 상태 소유 위치

| 상태 | 소유 | 초기값 | 리셋 조건 |
|---|---|---|---|
| `selectedAssignees` / `selectedStatuses` / `selectedProjectKeys` | **`ProjectWorkPanel`(셸)** — tree·gantt·map 3뷰 공유 | 기존 그대로 | 없음(뷰 전환에도 유지) |
| `search` | `ProjectIssueMapView` | `''` | `project_id` 변경 |
| `collapsedIds: Set` | `ProjectIssueMapView` | 트리 최초 도착 시 `initialCollapsedIds(tree)` (= 루트만 펼침) | `project_id` 변경 시 `didInitRef` 리셋 후 재적용 |
| `selectedId: string \| null` | `ProjectIssueMapView` | `null` | `project_id` 변경 / 필터로 노드가 사라지면 해제(`visibleIds` 감시 — 트리와 동일) |
| `drawerTab: 'worklog' \| 'commit'` | `ProjectIssueMapView` | `'worklog'` | `project_id` 변경 시 `'worklog'` |
| `showMiniMap: boolean` | `ProjectIssueMapView` | `true` | — |
| 드로어 폭 | `SideDrawer` 내부 + localStorage `projectDetail.issueMapDrawer.width` | 520 | — |
| 뷰포트(팬/줌) | React Flow 내부 | `fitView` | — |

- **`search` 를 셸로 올리지 않는다**: 트리도 자기 것을 갖고 있다(`ProjectTreeView` 로컬 state). 대칭 유지.
- **필터가 바뀌어도 `collapsedIds` 를 재계산하지 않는다.** 사용자가 편 상태를 지운다. 트리에 없는 id 가 Set 에 남아도 조회만 하므로 무해.
- 상호작용 분리(요구사항 §4-1/§4-2 충돌 해소 — **결정**):
  - **카드 본문 클릭** → 선택 + 드로어 열기(현재 탭 유지)
  - **chevron 배지 클릭** → 펼침/접힘 (`stopPropagation`)
  - **카드 더블클릭** → 펼침/접힘 (편의 경로)
  - **커밋 버튼 클릭** → 선택 + `drawerTab='commit'` + 드로어 열기 (`stopPropagation`)
  - **폴더 노드 클릭** → 펼침/접힘만. 드로어를 열지 않는다(폴더는 워크로그·커밋이 없다)

### 4-5. 렌더 파이프라인 (메모 경계)

```
tasks/folders/folderIssues (useGanttData)
  └─ useMemo[tasks, filters, search]        filterGanttTasks + toSvarTasks + buildWorkTree
        └─ useMemo[tree, collapsedIds]      layoutIssueTree  → { nodes, edges }
              └─ useMemo[nodes, selectedId] nodes.map(n => ({...n, selected: n.id === selectedId}))
```
선택만 바뀔 때 **레이아웃을 다시 계산하지 않는다**(마지막 map 만 재실행). 선택 표시는 React Flow 의 `selected` prop 을 커스텀 노드에서 읽어 처리한다.

`nodeTypes` 객체는 **모듈 스코프 상수**로 둔다(컴포넌트 안에서 만들면 매 렌더 전체 노드가 언마운트/재마운트된다 — React Flow 의 대표적 함정).

---

## 5. 레이아웃 알고리즘 명세 (`layoutIssueTree.js`)

구현자가 그대로 옮길 수 있도록 전부 확정한다. dagre/d3-hierarchy 미사용.

### 5-1. 시그니처

```js
layoutIssueTree(tree, collapsedIds = new Set(), sizes = DEFAULT_SIZES)
  → { nodes: RFNode[], edges: RFEdge[], bounds: { minX, minY, maxX, maxY } }
```

- `tree` = `buildWorkTree(svarNodes)` 결과(루트 배열, 각 노드에 `children`).
- `collapsedIds` = 접힌 노드 id 집합.
- 순수 함수. `Date`/`Math.random`/DOM 접근 금지. 입력을 변형하지 않는다.

### 5-2. 상수

```js
export const DEFAULT_SIZES = {
    nodeWidth:   260,   // 카드 폭(이슈·폴더 공통 — 열 정렬이 어긋나지 않게)
    issueHeight: 132,   // 이슈 카드 높이
    folderHeight: 56,   // 폴더 노드 높이
    gapX:         96,   // 열 사이 수평 간격 → colStep = 260 + 96 = 356
    gapY:         24,   // 형제 사이 수직 간격
};
```

### 5-3. 방향

**가로 트리 — 루트 좌측, 자식 우측.** 티켓 카드는 가로로 길고(260×132) 제목이 2줄이라, 세로 트리로 쌓으면 같은 화면에 보이는 깊이가 절반이 된다. 핸들은 부모 `Position.Right`(source) → 자식 `Position.Left`(target).

### 5-4. 알고리즘 (O(n), 단일 패스)

```
x(depth) = depth * (nodeWidth + gapX)
h(node)  = node.folder ? folderHeight : issueHeight

cursorY = 0                     // 다음 leaf 가 놓일 y

place(node, depth):
    visibleChildren = collapsedIds.has(node.id) ? [] : (node.children ?? [])
    if visibleChildren.length === 0:
        y = cursorY
        cursorY += h(node) + gapY
    else:
        childBoxes = visibleChildren.map(c => place(c, depth + 1))   // ★ 배열 순서 그대로
        first = childBoxes[0], last = childBoxes[childBoxes.length - 1]
        y = (first.y + (last.y + h(last.node)) - h(node)) / 2        // 자식 블록 중앙 정렬
        // 부모가 자식보다 커서 위로 밀려나 겹치는 경우 방어:
        y = Math.max(y, ???)  ← 아래 §5-5 참조
    emit node at { x: x(depth), y }
    return { node, y }

for root of tree: place(root, 0)
```

- **자식 순서는 `buildWorkTree` 출력 순서를 그대로 쓴다.** 재정렬 금지 — 정렬 규칙(폴더 우선, 그 안에서 입력 순서)은 `buildWorkTree.orderSiblings` 소유다. 여기서 다시 정렬하면 트리와 맵의 형제 순서가 갈라진다.
- 루트가 여러 개면 위에서 아래로 순서대로 쌓인다(cursorY 연속). 루트 사이 추가 여백은 두지 않는다(`gapY` 로 충분).

### 5-5. 겹침 방어

자식 1개 + 부모가 폴더(56px)인 경우처럼 중앙 정렬 결과가 음수/역행할 수 있다. **부모 y 는 `min(firstChild.y, y)` 로 클램프하지 않고**, 대신 다음 규칙 하나만 둔다:

> `y = clamp(centered, firstChild.y - (h(node) - h(first.node)), lastChildBottom - h(node))`
> 단 계산 결과가 `firstChild.y` 보다 작아질 수 있으면 그대로 둔다 — 부모 열(depth d)과 자식 열(depth d+1)은 **x 가 다르므로 겹치지 않는다**. 같은 열 안에서의 충돌만 막으면 되고, 같은 열은 `cursorY` 가 단조 증가라 구조적으로 충돌하지 않는다.

→ **결론: 추가 클램프 불필요.** `y = (first.y + lastBottom - h(node)) / 2` 를 그대로 쓴다. 다만 `bounds.minY` 가 음수가 될 수 있으므로 마지막에 전체 노드 y 에 `-bounds.minY` 를 더해 **0 기준으로 정규화**한다(미니맵/`fitView` 안정).

### 5-6. 반환 노드/엣지 shape

```js
// nodes[i]
{
  id: node.id,
  type: node.folder ? 'folderGroup' : 'issueCard',
  position: { x, y },
  width: sizes.nodeWidth,
  height: h(node),
  draggable: false,
  connectable: false,
  data: {
    node,                                  // SVAR 노드 원본 (카드가 toIssueCardProps 로 소비)
    depth,
    childCount: node.children?.length ?? 0,
    hasChildren: (node.children?.length ?? 0) > 0,
    isCollapsed: collapsedIds.has(node.id),
  },
}

// edges[i]  — 보이는 부모-자식 쌍만
{
  id: `e:${parent.id}->${child.id}`,
  source: parent.id,
  target: child.id,
  type: 'smoothstep',
  pathOptions: { borderRadius: 14 },
}
```

접힌 노드의 자손은 **노드도 엣지도 만들지 않는다**(`flattenTree` 와 같은 사상 — 대량 이슈에서 렌더 비용이 구조적으로 준다).

### 5-7. 접힘 헬퍼

```js
initialCollapsedIds(tree)   // 자식을 가진 노드 중 depth >= 1 전부 → "루트만 펼침"
collectExpandableIds(tree)  // 자식을 가진 노드 전부 (모두 접기용). buildWorkTree.collectParentIds 재사용 가능하면 그것을 쓴다
```
- 모두 펼침 = `setCollapsedIds(new Set())`
- 모두 접기 = `setCollapsedIds(new Set(collectParentIds(tree)))` — 트리 뷰와 **완전히 동일**한 호출

---

## 6. 디자인 명세

"이쁘게"가 명시 요구이므로 값까지 확정한다. **하드코딩 색 금지 — 전부 `token(name, fallbackHex)`**(기존 코드 관행: `token('color.icon.brand', '#21ADAD')`).

### 6-1. 캔버스

| 항목 | 값 |
|---|---|
| 높이 | `72vh`, `minHeight 480` (트리의 `PANEL_HEIGHT` 와 동일) |
| 배경 | `elevation.surface.sunken`, 테두리 1px `color.border`, radius 10 (트리 패널 껍데기와 동일) |
| 그리드 | `<Background variant="dots" gap={18} size={1} color={token('color.border','#DFE1E6')} />` |
| 컨트롤 | `<Controls showInteractive={false} position="bottom-right" />` |
| 미니맵 | 토글. `<MiniMap pannable zoomable nodeColor={n => statusAccent(n.data.node.statusCategory?.key)} maskColor="rgba(9,30,66,0.12)" />` |
| 줌 | `minZoom={0.25} maxZoom={1.5}`, `fitView`, `fitViewOptions={{ padding: 0.2, maxZoom: 1 }}` |
| 읽기전용 | `nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} elementsSelectable` |

### 6-2. 이슈 카드 (260 × 132)

```
┌╴4px accent╶┬──────────────────────────────────┐
│            │ [16px 유형아이콘] PROJ-123  [상태] │  ← row1, h 20
│            │ 이슈 제목이 길면 두 줄까지만 표시  │  ← row2, h 36 (2줄 clamp)
│            │ 하고 말줄임 처리한다              │
│            │ ▓▓▓▓▓▓░░░░░░░░░░          62%    │  ← row3, h 14
│            │ (av) 홍길동          [</>] [▸ 3] │  ← row4, h 24
└────────────┴──────────────────────────────────┘
```

| 요소 | 스펙 |
|---|---|
| 컨테이너 | `border-radius: 10px`, `border: 1px solid ${token('color.border','#DFE1E6')}`, `background: token('elevation.surface','#FFF')`, `box-shadow: token('elevation.shadow.raised')`, `padding: 10px 12px 10px 16px`, `box-sizing: border-box`, `overflow: hidden`, `cursor: pointer`, `transition: box-shadow 120ms, transform 120ms, border-color 120ms` |
| accent 스트립 | 좌측 절대배치 `width:4px; top:0; bottom:0; border-radius:10px 0 0 10px`, 색 = `statusAccent(statusCategory.key)` |
| 이슈 키 줄 | `IssueComponent` 재사용(키 + 유형 아이콘 + Jira 이동). 폰트 12/600. 우측 끝 `StatusComponent`(재사용, `statusCategory` 그대로) |
| 제목 | 13px / line-height 1.4 / `font-weight 500` / `color.text` / `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden` (`issueMap.css`) |
| 진행 바 | track h 6px radius 3 `color.background.neutral`, fill = accent 색, 우측 수치 12px/600 `color.text`, `null` 이면 fill 0% + `-` |
| 담당자 | `<Avatar size="xsmall" appearance="circle">` + 이름 12px `color.text.subtle`, 1줄 말줄임. 미배정이면 점선 원(1px dashed `color.border`) + `issueMap.card.unassigned` (11px `color.text.subtlest`) |
| 커밋 버튼 | 24×24, `@atlaskit/icon/core/commit`(실측 존재), `color.icon.subtle` → hover 시 `color.icon.brand`. `title/aria-label = t('issueMap.card.commits')`. `issueId` 가 null 이면 **버튼 자체를 렌더하지 않는다** |
| 펼침 배지 | 자식이 있을 때만. `chevron-right`(접힘)/`chevron-down`(펼침) + 자식 수. h 20 radius 10 padding `0 6px`, bg `color.background.neutral`, 11px/700 `color.text.subtle`. hover 시 bg `color.background.neutral.hovered` |

### 6-3. 상태 색 (`statusAccent`, `mapNodeCard.js`)

`statusCategory.key` 기준 — 앱 전역 약속과 어긋나지 않게 한다.

| key | 색 | 근거 |
|---|---|---|
| `new` | `token('color.icon.subtle', '#6B778C')` | 회색 = 미착수 |
| `indeterminate` | `token('color.icon.brand', '#21ADAD')` | DMOVE 틸(PRIMARY) = 진행 중 |
| `done` | `token('color.icon.success', '#22A06B')` | `semanticChartColor('success')` 라이트값과 동일 |
| null/미상 | `token('color.border', '#DFE1E6')` | |

⚠ `constants/chartPalette.js` 는 **canvas(ECharts) 전용**이다(파일 주석: `token()` 은 `var(--ds-*)` 문자열이라 canvas 가 못 읽는다). 카드는 DOM 이므로 `token()` 을 쓰되, `done`/`indeterminate` 의 라이트 hex 값이 `semanticChartColor` 와 일치하도록 폴백을 맞춘다(미니맵도 같은 함수를 쓰므로 차트와 색 약속이 유지된다).

### 6-4. 호버 / 선택

| 상태 | 스펙 |
|---|---|
| hover | `transform: translateY(-1px)`, `box-shadow: token('elevation.shadow.overlay')`, `border-color: token('color.border.bold','#758195')` |
| selected (`selected` prop) | `border: 2px solid token('color.border.selected','#388BFF')` + `box-shadow: 0 0 0 3px ${token('color.blanket.selected','rgba(56,139,255,0.20)')}`. 테두리가 2px 가 되어도 **높이가 변하면 안 된다** → `box-sizing: border-box` 필수(레이아웃 좌표는 고정값이라 카드가 커지면 어긋난다) |
| focus-visible | 선택과 동일한 링(키보드 접근성) |

### 6-5. 폴더 노드 (260 × 56)

`background: token('elevation.surface.sunken','#F7F8F9')`, `border: 1px dashed token('color.border','#DFE1E6')`, radius 10.
좌측 `FolderClosedIcon`/`FolderOpenIcon` `color.icon.brand`(틸), 이름 13px/600 1줄 말줄임, 우측 자식 수 배지 + chevron. 진행 바·담당자·커밋 버튼 **없음**(이슈가 아니다).

### 6-6. 엣지

| 항목 | 값 |
|---|---|
| 기본 | `type:'smoothstep'`, `pathOptions.borderRadius 14`, stroke `token('color.border.bold','#758195')`, `strokeWidth 1.5`, `opacity .8` |
| 선택 노드에 연결된 엣지 | stroke `token('color.icon.brand','#21ADAD')`, `strokeWidth 2`, `opacity 1` (`ProjectIssueMapView` 가 `selectedId` 기준으로 `edges` 에 `style` 부착 — 레이아웃 재계산 없이 map 단계에서) |
| 화살표 | **없음**. 좌→우 가로 트리는 방향이 자명하고, 노드 수백 개에서 화살표는 시각 소음이 된다 |
| 애니메이션 | **없음**. 항상 흐르는 점선은 대량 노드에서 CPU 를 먹고 산만하다 |

### 6-7. 다크 모드

- 카드·엣지·배경 색은 전부 `token()` → `var(--ds-*)` 로 자동 대응.
- `issueMap.css` 의 React Flow 오버라이드도 CSS 변수만 쓴다:
  `.react-flow__controls button { background: var(--ds-surface); color: var(--ds-text); border-bottom-color: var(--ds-border); }`
  `.react-flow__minimap { background: var(--ds-surface-sunken); }`
  `.react-flow__attribution { display: none; }`
- `@xyflow/react/dist/style.css` 는 `IssueMapCanvas.jsx` 에서 import(`ProjectStatusFlow.jsx` 전례와 동일). lazy 청크 안이므로 main 번들에 들어가지 않는다.
- 하드코딩 hex 는 `token()` 의 **두 번째 인자(폴백)** 로만 등장한다.

### 6-8. 드로어

`SideDrawer` 재사용 — 오버레이·좌측 폭 드래그·localStorage 가 공짜로 따라온다(`components/drawer/SideDrawer.jsx` 주석: "새 드로어는 껍데기를 다시 만들지 말고 이걸 쓴다").

```jsx
<SideDrawer
    isOpen={!!selectedNode && !isFolderNodeId(selectedNode.id)}
    onClose={() => setSelectedId(null)}
    label={t('issueMap.drawer.title')}
    storageKey="projectDetail.issueMapDrawer.width"
    defaultWidth={520}
    minWidth={400}
    header={/* 키·제목·담당자·상태·진행도 + 닫기 버튼 */}
>
```

- 헤더: 1행 `IssueComponent`(키+유형+링크) + `StatusComponent`, 2행 제목 15px/600, 3행 담당자 칩 + 진행 바(카드와 같은 `CardProgressBar`).
- 탭: `@atlaskit/tabs` — `[워크로그 이력 · {n}h]`, `[커밋 이력]`. `selected` 인덱스는 `drawerTab` 에서 파생(`0|1`).
- 커밋 행: `(av) 홍길동  a1b2c3d  fix: 로그인 리다이렉트  3 files  09-01 14:20  [↗]`
  - 짧은 해시는 등폭(`font-family: ui-monospace, SFMono-Regular, monospace`), `color.text.brand`, 클릭 시 `router.open(commit.url)`.
  - `commit.url` 이 없으면 클릭 비활성(회색). Forge iframe 은 일반 `<a href>` 로 밖으로 못 나간다 → **`router.open` 만 쓴다**(`useJiraSiteUrl` 주석 근거).
  - 저장소 그룹 헤더: `BranchIcon` + 저장소명(600) + 커밋 수 배지. `repo.url` 있으면 헤더도 `router.open`.
  - `repo.truncated` 면 그룹 하단에 `issueMap.commit.truncated` 힌트 1줄.
- 로딩은 전부 `SkeletonTable`/`SkeletonText`. **스피너 금지**(RFC-178).

---

## 7. i18n 키 목록

### 7-1. `locales/kr/projectDetail.json` / `locales/en/projectDetail.json`

기존 `work.view` 객체(현재 `table`/`tree`/`gantt`)에 1개 추가:

| 키 | kr | en |
|---|---|---|
| `projectDetail.work.view.map` | `맵` | `Map` |

### 7-2. `locales/kr/issueMap.json` · `locales/en/issueMap.json` (신규 파일)

파일명이 네임스페이스이므로 파일 내용은 **`issueMap.` 접두 없이** 중첩 객체로 쓴다.

| 최종 키 | kr | en |
|---|---|---|
| `issueMap.toolbar.search` | `작업 키 · 이름 검색` | `Search key or name` |
| `issueMap.toolbar.expandAll` | `모두 펼침` | `Expand all` |
| `issueMap.toolbar.collapseAll` | `모두 접기` | `Collapse all` |
| `issueMap.toolbar.minimapShow` | `미니맵 표시` | `Show minimap` |
| `issueMap.toolbar.minimapHide` | `미니맵 숨김` | `Hide minimap` |
| `issueMap.card.unassigned` | `미배정` | `Unassigned` |
| `issueMap.card.commits` | `커밋 이력` | `Commit history` |
| `issueMap.card.children` | `하위 {count}건` | `{count} sub-items` |
| `issueMap.card.expand` | `하위 펼치기` | `Expand children` |
| `issueMap.card.collapse` | `하위 접기` | `Collapse children` |
| `issueMap.empty` | `표시할 작업이 없습니다.` | `No work items to display.` |
| `issueMap.emptyFiltered` | `필터 조건에 맞는 작업이 없습니다.` | `No work items match the current filters.` |
| `issueMap.error.load` | `작업 정보를 불러오지 못했습니다.` | `Failed to load work items.` |
| `issueMap.drawer.title` | `작업 상세` | `Work item detail` |
| `issueMap.drawer.close` | `닫기` | `Close` |
| `issueMap.drawer.tab.worklog` | `워크로그 이력` | `Worklogs` |
| `issueMap.drawer.tab.commit` | `커밋 이력` | `Commits` |
| `issueMap.drawer.progress` | `처리율` | `Progress` |
| `issueMap.worklog.total` | `합계 {hours}h` | `Total {hours}h` |
| `issueMap.worklog.empty` | `등록된 워크로그가 없습니다.` | `No worklogs recorded.` |
| `issueMap.worklog.unavailable` | `워크로그를 불러올 수 없습니다.` | `Unable to load worklogs.` |
| `issueMap.commit.empty` | `연동된 저장소가 없습니다.` | `No linked repositories.` |
| `issueMap.commit.unavailable` | `커밋 정보를 불러올 수 없습니다.` | `Unable to load commit information.` |
| `issueMap.commit.unavailableHint` | `Jira 개발 정보 연동이 없거나 조회 권한이 없을 수 있습니다. 다른 정보는 정상 표시됩니다.` | `The Jira development information integration may be unavailable or you may lack permission. Other details are unaffected.` |
| `issueMap.commit.noIssueId` | `이 작업은 커밋 조회를 지원하지 않습니다.` | `Commit lookup is not available for this item.` |
| `issueMap.commit.count` | `커밋 {count}건` | `{count} commits` |
| `issueMap.commit.fileCount` | `파일 {count}개` | `{count} files` |
| `issueMap.commit.merge` | `머지` | `Merge` |
| `issueMap.commit.open` | `Bitbucket에서 열기` | `Open in Bitbucket` |
| `issueMap.commit.truncated` | `최근 {count}건만 표시합니다.` | `Showing the latest {count} only.` |
| `issueMap.folder.childCount` | `하위 {count}건` | `{count} items` |

`{count}` / `{hours}` 치환은 **`tFormat(t, key, vars)`** 사용(`utils/i18n.js`). Forge `t()` 는 보간을 지원하지 않는다.

**재사용(신규 키 만들지 말 것):** `gantt.filter.assignee`, `gantt.filter.status`, `gantt.error.load`, `common.loading`, `projectDetail.work.tree.*`(있으면 우선 재사용).

추가 후 반드시 `cd static/ui && npm run merge`.

---

## 8. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R1 | **dev-status 는 Atlassian 비공개 API.** Forge 프록시가 `/rest/dev-status/latest/...` 를 허용하는지, `read:jira-work` classic scope 로 충분한지 **문서상 보장이 없다.** 403/404 가능 | 설계·구현이 성공/실패 양쪽을 모두 다룬다(§2-b 폴백 계약). 실패해도 맵·워크로그는 무영향. **실호출 검증은 dev 배포 후 리더가 수행**(요구사항 §3-3 명시). 실패 시 잘라낼 범위 = `MapCommitTab` + `useIssueDevStatus` + 카드 커밋 버튼 3곳뿐 |
| R2 | **응답 shape 이 문서와 다를 수 있다**(비공개 API 라 계약 변경 통지가 없다) | 파싱을 `parseDevStatusCommits` **한 곳**에 가둔다. shape 변화 시 이 파일 + 테스트만 고친다. 컴포넌트는 파서 출력 계약만 안다 |
| R3 | **applicationType=bitbucket 고정** → GitHub/GitLab 연동 사이트는 항상 "저장소 없음" | 요구사항 확정 범위(A안). "연동된 저장소 없음"이 오해를 부르지 않도록 `unavailableHint` 문구로 연동 부재 가능성을 함께 안내 |
| R4 | **대량 이슈 성능.** 수백 노드를 React Flow 가 동시에 그리면 팬/줌이 끊긴다 | ① 초기 = 루트만 펼침 → 첫 렌더 노드 수가 루트+직속 자식으로 제한 ② 접힌 서브트리는 노드·엣지를 **아예 만들지 않는다** ③ 레이아웃은 O(n) 단일 패스 + `useMemo[tree, collapsedIds]` ④ 선택 변경이 레이아웃을 재계산하지 않게 메모 경계 분리(§4-5) ⑤ 엣지 애니메이션 없음 ⑥ `nodeTypes` 모듈 상수 · 노드 컴포넌트 `React.memo`. 가상화는 범위 밖(요구사항 §4-1) |
| R5 | **팀 관리형 프로젝트에서 숫자 issue id 확보** | `GanttMapper.normalizeIssue` 가 `issueId: issue.id` 를 담고 어댑터가 passthrough 한다 — **커스텀 필드가 아니라 Jira 코어 필드**라 팀 관리형에서도 빠지지 않는다. 다만 fail-close 로 `issueId == null` 이면 커밋 버튼을 렌더하지 않고 탭은 `NO_ISSUE_ID` 빈 상태 |
| R6 | **lazy 경계 이탈 → React #426** | 반드시 `ProjectWorkPanel` 의 **기존 Suspense 안쪽**에 둔다. 첫 뷰(table) 정적 유지. `CI=true npm run build` 로 청크 분리 확인 |
| R7 | **번들 예산.** `@xyflow/react` 가 main 으로 새면 경고선(950KB gzip) 근처가 위험 | 맵 뷰가 lazy 이고 `@xyflow/react`·`dist/style.css` import 가 그 하위에만 있으면 map 청크로 떨어진다. 현재 다른 사용처(`ProjectStatusFlow`)도 백오피스 하위다. `npm run bundle:check` 출력에서 main gzip 증가폭을 확인 |
| R8 | **공용화 리팩토링 회귀**(`ProjectTreeView` 필터, `TreeDetailPanel` 워크로그) | 두 변경 모두 **동작 무변경 이동**으로 제한. 트리 뷰를 열어 담당자/상태/스페이스/검색 필터와 워크로그 표시가 이전과 동일한지 육안 확인 + `buildWorkTree.test.js` 등 기존 테스트 통과 |
| R9 | **진행도 필드 결정(§2-a-1)이 요구사항 문구와 다르다** | 설계서에 근거를 남겼다. 리더가 `progress`(간트 막대 근사값)를 원하면 `mapNodeCard.js` 의 한 줄만 바꾸면 된다(격리 완료) |

---

## 9. 테스트 목록

### 9-1. jest 순수 로직 (`cd static/ui && npm test`)

**`map/layoutIssueTree.test.js`**
1. 빈 트리 → `{nodes:[], edges:[], bounds}` (크래시 없음)
2. 단일 루트 leaf → `x=0`, `y=0`, `type:'issueCard'`
3. 깊이별 x = `depth * (nodeWidth + gapX)` (0 / 356 / 712)
4. 형제 3개 leaf → y 가 `issueHeight + gapY` 간격으로 단조 증가
5. 부모가 자식 블록의 **수직 중앙**에 온다 (자식 2개일 때 부모 y = 두 자식 중앙)
6. **자식 순서가 `buildWorkTree` 배열 순서와 동일**(재정렬 없음) — 폴더 우선 정렬이 보존되는지 포함
7. `collapsedIds` 에 있는 노드의 **자손 노드가 결과에 없다**
8. 접힌 노드로 향하는 **자손 엣지도 없다**
9. 접으면 그 아래 형제의 y 가 위로 당겨진다
10. 폴더 노드는 `type:'folderGroup'` + `height = folderHeight`
11. 엣지 id 형식 `e:{parent}->{child}` + `type:'smoothstep'`
12. `bounds.minY === 0` (정규화 확인)
13. 입력 `tree`/`collapsedIds` 를 변형하지 않는다(불변성)
14. `initialCollapsedIds` = depth≥1 의 부모 노드만(루트 부모는 미포함)
15. `sizes` 를 주입하면 좌표가 그 값을 따른다

**`map/parseDevStatusCommits.test.js`**
1. `null` → `ok:false, reason:'REQUEST_FAILED'`
2. `{success:false, error:{code:403}}` → `ok:false, REQUEST_FAILED, errorCode:403`
3. `{}` / `{detail:'x'}` → `ok:false, UNEXPECTED_SHAPE`
4. `{detail:[], errors:[{message:'x'}]}` → `ok:false, ERROR_RESPONSE`
5. `{detail:[{repositories:[]}], errors:[]}` → **`ok:true`, repositories:[]** (빈 상태이지 오류가 아니다)
6. 정상 1저장소 2커밋 → 필드 매핑 전수 확인(`displayId`/`title`/`authorName`/`authorAvatar`/`timestamp`/`url`/`fileCount`/`merge`)
7. `detail` 이 2개면 저장소가 평탄 병합된다
8. `commits` 가 배열이 아니면 그 저장소는 `commits:[]` 로 살아남는다
9. `authorTimestamp` ISO 문자열 → epoch ms 정규화 / 잘못된 값 → `null`
10. `displayId` 부재 → `id.slice(0,7)`
11. `message` 여러 줄 → `title` 은 첫 줄만
12. 커밋 정렬 = timestamp 내림차순, `null` 은 뒤
13. 저장소 정렬 = name 오름차순
14. 커밋 51건 → 50건 슬라이스 + `truncated:true`
15. `totalCommits` = 슬라이스 **후** 합계

**`map/mapNodeCard.test.js`**
1. 이슈 노드 → `issueKey`(=`key`)/`title`(=`text`)/`assignee`(=`assigneeObj`)/`status`(=`statusCategory`)/`percent`(=`progressPercent`)/`issueId` 매핑
2. `key` 부재 시 `id` 폴백
3. `progressPercent` null → `percent: null` (0 으로 바꾸지 않는다)
4. `assigneeObj` null → `assignee: null`
5. 폴더 노드(`folder:true`) → `isFolder:true`, `issueId:null`
6. `statusAccent`: `new`/`indeterminate`/`done`/`null` 4분기

**`work/workFilterOptions.test.js`**
1. `deriveAssigneeOptions` — 중복 accountId 제거, `displayName` 없으면 accountId 라벨
2. `deriveStatusOptions` — `new < indeterminate < done` 정렬, 중복 제거
3. `filterGanttTasks` — 담당자/상태/스페이스/검색어 각각 + 조합
4. 검색어는 `key + summary` 부분일치(대소문자 무시)
5. 빈 필터 = 전체 통과
6. **회귀 고정**: 리팩토링 전 `ProjectTreeView` 인라인 로직과 동일 결과(같은 입력 → 같은 출력 케이스 3건)

### 9-2. 게이트

- `cd static/ui && npm test` — 전체 통과(기존 `buildWorkTree.test.js`·`queryKeyContract.test.js`·`resolveTreeDrop.test.js` 포함)
- `cd static/ui && CI=true npm run build` — 통과 + `bundle:check` main gzip 증가폭 확인(R7)
- 루트 `npm test` — **백엔드 무변경이므로 영향 없어야 한다**(변경 시 회귀 신호)

### 9-3. 수동 확인(리더/verifier)

1. `?view=map` 새로고침 복원 · 뒤로가기
2. 뷰 전환 시 담당자/상태/스페이스 필터 유지(tree ↔ gantt ↔ map)
3. **트리 뷰와 맵의 계층·형제 순서가 동일**한지 대조(같은 필터 상태에서)
4. 카드 클릭 → 드로어 / 커밋 버튼 → 커밋 탭 / chevron → 펼침(드로어 안 열림)
5. 폴더 노드 클릭 → 펼침만
6. 다크 모드 전환 시 카드·엣지·컨트롤·미니맵 색 정상
7. 커밋 API 실패(403/404) 시 붉은 오류 없이 안내 빈 상태 + 나머지 화면 정상 (dev 배포 후)

---

## 10. 구현 작업 분해

### 10-1. 백엔드

**없음.** `src/` 변경 0줄. (backend-engineer 단계는 건너뛴다)

### 10-2. 프론트엔드 (권장 순서)

**M0 — 순수 로직 먼저 (테스트로 계약 고정)**
- [ ] `map/layoutIssueTree.js` + `layoutIssueTree.test.js` (§5)
- [ ] `map/parseDevStatusCommits.js` + `parseDevStatusCommits.test.js` (§2-b)
- [ ] `map/mapNodeCard.js`(`toIssueCardProps` + `statusAccent`) + `mapNodeCard.test.js` (§2-a)
- [ ] `work/workFilterOptions.js` + `workFilterOptions.test.js`
- [ ] `npm test` 통과 확인

**M1 — 배선 (뷰가 뜬다)**
- [ ] `utils/jiraApi/requestJira.js` — `getIssueDevStatus` 액션 추가
- [ ] `utils/queryKey/projectKeys.js` — `issueDevStatus(issueId)` 추가
- [ ] `locales/kr|en/issueMap.json` 신규 + `projectDetail.json` 의 `work.view.map`
- [ ] `cd static/ui && npm run merge`
- [ ] `work/ProjectWorkPanel.jsx` — lazy import + `items` push(`@atlaskit/icon/core/node`) + 렌더 분기(Suspense 안쪽) + 필터 6종 전달
- [ ] `map/ProjectIssueMapView.jsx` 뼈대 — `useGanttData` → `filterGanttTasks` → `toSvarTasks` → `buildWorkTree` → `layoutIssueTree`, 로딩(`SkeletonTable`)·에러(`SectionMessage` + `gantt.error.load`)·빈 상태(`EmptyState`)
- [ ] `map/IssueMapCanvas.jsx` + `map/issueMap.css` — ReactFlow/Background/Controls/MiniMap

**M2 — 카드·상호작용**
- [ ] `map/IssueCardNode.jsx` (§6-2, `React.memo`) — `IssueComponent`/`StatusComponent`/`Avatar` 재사용
- [ ] `map/FolderGroupNode.jsx` (§6-5)
- [ ] 펼침/접힘 + `initialCollapsedIds` 최초 1회 적용 + `project_id` 리셋
- [ ] `map/IssueMapToolbar.jsx` — 검색·필터(트리와 같은 `Select`/`ProjectFilterDropdown`)·모두 펼침/접기·미니맵 토글
- [ ] 선택 강조(`selected` prop) + 선택 엣지 하이라이트 + `visibleIds` 감시 해제

**M3 — 드로어**
- [ ] `work/WorklogHistoryList.jsx` 추출 + `TreeDetailPanel.jsx` 치환(동작 무변경)
- [ ] `map/IssueMapDrawer.jsx` — `SideDrawer` + 헤더 + `@atlaskit/tabs`
- [ ] `map/MapWorklogTab.jsx`
- [ ] `map/useIssueDevStatus.js` + `map/MapCommitTab.jsx` — 폴백 4분기(§2-b) + `router.open`

**M4 — 마감**
- [ ] `ProjectTreeView.jsx` 를 `workFilterOptions` 로 치환(동작 무변경 검증)
- [ ] 다크 모드 육안 확인
- [ ] `npm test` + `CI=true npm run build` + `bundle:check` 증가폭 확인
- [ ] `WORK_VIEWS.md` 갱신 — §1 표에 `map` 행 추가, §2 "백엔드 없다" 원칙에 맵 포함, §7 온디맨드 조회 표에 `useIssueDevStatus` 추가, §8 i18n 에 `issueMap.json` 추가

---

## 11. 남은 가정 (리더 확인 요망, 보수적 해석으로 진행)

1. **진행도 = `progressPercent`** (§2-a-1). 요구사항의 `progress` 문구와 다르나 트리와 숫자를 맞추기 위한 선택. 뒤집으려면 `mapNodeCard.js` 1줄.
2. **카드 클릭 = 드로어 / chevron = 펼침** (§4-4). 요구사항 §4-1과 §4-2가 상충해 이렇게 갈랐다(더블클릭도 펼침으로 허용).
3. **레이아웃 방향 = 가로(좌→우)** (§5-3). 요구사항이 "설계 판단"으로 위임.
4. **`ProjectTreeView`/`TreeDetailPanel` 공용화 리팩토링을 범위에 포함**(§4-1). 복사 금지·단일 출처 원칙 때문이며, 순수 이동으로 제한한다. 범위를 더 좁히길 원하면 이 2건만 빼면 된다(맵이 로직을 복사하게 되고 두 뷰가 갈라질 위험을 감수).
