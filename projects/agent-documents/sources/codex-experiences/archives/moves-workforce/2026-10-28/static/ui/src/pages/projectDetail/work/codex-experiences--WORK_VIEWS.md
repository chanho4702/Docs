# 작업관리 — 뷰 전환 셸 · 트리 뷰 · 맵 뷰 설계/구조 문서

프로젝트 상세 **작업관리 탭**(`/project/:id` → 작업관리)의 뷰 전환 셸과 **트리 뷰 · 맵 뷰**를 다룬다.
간트 뷰의 데이터 모델·저장 방식·렌더 함정은 별도 문서(`src/resolver/gantt/GANTT.md`)에 있고, 여기서는 반복하지 않는다.

- 코드: `static/ui/src/pages/projectDetail/work/`
- 간트 코드: `static/ui/src/pages/projectDetail/gantt/` (트리가 데이터·훅·모달을 재사용)
- 백엔드: `src/resolver/gantt/` (트리 **전용 백엔드는 없다** — 아래 §2)

> 현행화 기준: 2026-09-30 (폴더 필터 · 트리 폴더 행 강조/안내선 · 이슈 생성 진입점 2곳 추가 · 맵 커밋 이력 제거) / 2026-09-02 (맵 뷰 추가 + 2차 수정)

---

## 1. 네 뷰의 관계 (ProjectWorkPanel)

작업관리 탭은 **같은 작업(이슈) 집합을 네 가지 방식으로 보는 뷰 전환 그룹**이다(2026-07-22 재편, 이전엔 별도 탭. 2026-09-02 `map` 추가).

| 뷰 | 컴포넌트 | 데이터 소스 | 성격 |
|----|----------|-------------|------|
| `table` (기본) | `../issue/ProjectIssuePanel` | 서버 JQL(`ProjectFilter`) | 목록 조회·이슈 추가 |
| `tree` | `ProjectTreeView` (lazy) | `getProjectGanttData` | 계층 구조 + 노드 상세/편집 |
| `gantt` | `../gantt/GanttPage` (lazy) | `getProjectGanttData` | 타임라인 + 일정/관계 편집 |
| `map` | `map/ProjectIssueMapView` (lazy) | `getProjectGanttData` | 프로젝트 카드를 정점으로 한 위→아래 조직도(React Flow) — **읽기 전용** |

### 1-0. 이슈 생성 · 추가 (2026-09-30)

| 진입점 | 위치 | 동작 | 뒤처리 |
|---|---|---|---|
| 「이슈 생성」 | 셸(`ProjectWorkPanel`) 뷰 전환 줄 — **4개 뷰 공통 버튼 1개** | `../issue/IssueCreateModal` — 스페이스 선택 | 간트 데이터(`ganttKeys.data`) + 목록 전체(`workListKeys.scope`) 무효화 |
| 「이 스페이스에 이슈 생성」 | 목록 뷰 그룹을 펼쳤을 때 **표 위 도구 줄 오른쪽 끝**(`ProjectIssueTable`, 왼쪽은 계층/평면 토글) | 같은 모달, `lockedSpaceKey = groupKey` 로 스페이스 잠금(아이콘 포함) | 그 그룹(0페이지 복귀) + 요약 재조회, 간트 데이터 stale 표시 |
| 「작업 추가」(기존 이슈 연결) | 목록 뷰 상단(`ProjectIssuePanel`) — **종전 그대로** | `IssueAddModal` | 종전 그대로 |

- 권한: 세 버튼 모두 `PROJECT write`(`canEdit`). 칸반 카드 모달의 목록은 종전대로 `KANBAN write`.
- 생성은 **사용자 자격 Jira 호출만** 쓴다(`requestJira` — 백엔드 없음): `project/search?action=create&keys=…`(등록된 스페이스 중 만들 수 있는 것) →
  `issue/createmeta/{key}/issuetypes`(하위 작업 유형 제외) → `issue/createmeta/{key}/issuetypes/{id}`(필드 메타) → `POST issue`
  → (생성 화면에 없던 입력) `PUT issue/{key}` → 연결.
- **스페이스 선택 제한**: 이 프로젝트에 **이미 등록된 스페이스**(활성 구독 ∪ 연결된 작업이 있는 스페이스)만 고른다.
  연결된 작업의 스페이스는 목록 뷰 요약 훅(`useWorkListSummary`, 필터 없음)을 재사용한다 — 목록을 본 뒤면 추가 조회가 없고 협업 모드 분기도 훅이 한다.
  표시 = 등록된 것 ∩ `action=create` 결과(구독 스페이스를 위로). 검색어는 이 목록 안에서만(클라이언트 필터).
  등록된 스페이스가 0개면 "먼저 「작업 추가」나 구독으로 등록" 안내, 등록됐지만 만들 권한이 전부 없으면 따로 안내하고 생성 버튼을 막는다.
  목록 그룹 버튼(스페이스 잠금)은 이미 등록된 스페이스라 제한과 무관하다.
- 필드 메타에 **모달이 채우지 않는 필수 필드**(`project·issuetype·summary·reporter·assignee·description·customfield_10015·duedate·timetracking` 외)가 있거나
  메타 조회가 실패하면(필드 목록이 비어 와도 실패로 본다) 생성 버튼을 막고 필드 이름을 알린다 — Jira 에서 만든 뒤 「작업 추가」로 연결하도록 안내.
- 생성 직후 「작업 추가」와 **같은 호출·같은 인자**로 연결한다: `updateProjectIdField` → `recordIssueAssignedDate`(비차단).
  연결 서버가 이슈 접근을 **검색(JQL)**으로 확인하므로(`areIssuesAccessible`) 막 만든 이슈는 인덱스 지연으로 거부될 수 있다 → 실패 시 1초·2초 뒤 두 번 더 시도.
  그래도 실패하면 이슈 키와 함께 "「작업 추가」로 연결"을 안내한다(이슈는 이미 생겼으므로 모달은 닫는다 — 재시도는 중복 생성).
- 스페이스·이슈 유형 선택은 이름 앞에 16px 아이콘(스페이스 `avatarUrls['16x16']`→`24x24`, 유형 `iconUrl`)을 목록·선택값 양쪽에 그린다. 로드 실패 시 이름만.
- **시작일·기한·계획 작업량**(선택): 간트와 같은 필드·같은 환산 — 시작일 `customfield_10015`, 기한 `duedate`(둘 다 `YYYY-MM-DD` 그대로),
  계획 작업량 `timetracking.originalEstimate = ${plannedHours(md, hourRate)}h`(`../gantt/useGanttMutations.js`의 `plannedHours`, `hourRate`는 `getSettingData`, 기본 8).
  입력은 막지 않는다. 그 유형의 **생성 화면에 있으면 생성 요청에**, 없으면(흔히 timetracking 은 편집 화면에만 있다) **생성 직후 `PUT issue`로 따로** 저장하고
  입력 아래에 "만든 뒤 따로 저장됩니다"를 붙인다. 담당자·설명도 같은 규칙이다. 계획 작업량의 편집 저장은 간트 `useUpdatePlannedMd` 와 같이
  `getIssue?fields=timetracking` 후 `buildTimetrackingPayload`(remaining 동봉). 편집 실패는 비차단 — 이슈·연결은 성공으로 두고
  "…은(는) 저장하지 못했습니다 — 간트에서 입력하세요"를 알린다(시간 추적 꺼짐이면 그 안내를 덧붙인다).
  세 필드는 여기서 채울 수 있으므로 필수여도 차단 대상이 아니다. 시작일 > 기한(같은 날 허용)·음수/문자 MD 는 생성 버튼을 막는다.
- 설정 캐시(`settingKeys.detail()`)는 `SettingPage`·`useSalaryPolicy` 와 같은 모양(`success` 제거)으로 채운다.
- 순수 로직(ADF 변환·필수 필드 판정·생성 화면 필드 판정·검증·생성 계획(본문/편집 분리)·스페이스 제한·오류 문구·생성→편집→연결 순서)은 `../issue/issueCreate.js` 한 곳에 있다.
- 무효화가 뷰를 가리지 않는 이유: 보이는 뷰는 즉시 재조회되고 안 보이는 뷰는 stale 표시만 되어 다음 진입 때 읽는다 — 분기가 없어 경로가 하나다.
  목록 키는 prefix 무효화라 협업 모드의 권한 주체 구분('app')이 붙은 키까지 포함되고, 간트 키는 협업 모드여도 같다(서버가 경로 판정).
  협업 모드 판정 키(`collabKeys.access`)는 건드리지 않는다.
- ⚠ 목록은 Jira 검색(JQL)으로 읽으므로 생성·연결 직후 인덱스 지연으로 새 이슈가 한 박자 늦게 보일 수 있다(「작업 추가」와 같은 한계).

### 1-1. 코드 스플리팅 전제 (깨뜨리면 화면 전체가 죽는다)

- 첫 뷰(`table`)는 **정적 import**, 트리·간트·맵은 `React.lazy`. 간트는 `@svar-ui/react-gantt`, 맵은 `@xyflow/react`(+`dist/style.css`)를 통째로 끌고 오므로 분리 이득이 크다.
- lazy 뷰는 반드시 `ProjectWorkPanel` 내부의 **Suspense 경계 아래**에 있어야 한다. 경계 없이 suspend 하면 React error #426.
  루트 `index.js`가 `ReactDOM.render`(legacy)라 `startTransition`·`isPending`은 무효 — #426은 Suspense 경계로만 막힌다.

### 1-2. 필터 공유 규칙

셸(`ProjectWorkPanel`)이 **담당자 / 상태 / Jira 프로젝트(스페이스)** 필터를 소유해 `tree ↔ gantt ↔ map` 사이에서만 공유한다.

- 공유하는 이유: 두 뷰가 **같은 데이터 소스**라 "이 담당자의 작업만" 보던 맥락이 뷰를 바꿔도 유지돼야 한다.
- `table`을 제외하는 이유: 서버 JQL 기반이라 필터 축 자체가 다르다(자체 상태 유지).
- `GanttPage`는 `filter` prop 미주입 시 로컬 state 로 동작한다 — 셸 밖 단독 사용 하위호환.
- **폴더** 필터(2026-09-30)는 **트리 ↔ 간트만** 공유한다(맵은 폴더 선택지를 두지 않는다). 상태는 폴더 id 배열(+ 「폴더 없음」 예약값 `NO_FOLDER`)이고
  URL 에는 싣지 않는다 — 다른 공유 필터(담당자·상태·스페이스)도 화면 상태라 같은 관례다. 조회·쿼리 키 변경 없음.

```js
<GanttPage filter={{ assignees, statuses, setAssignees, setStatuses,
                     projectKeys, onProjectToggle, onProjectClear,
                     folderIds, setFolderIds }} />
```

### 1-3. 권한

- 트리·간트·맵 전부 `getProjectGanttData`(서버 `R('PROJECT','detail')`)를 쓰므로 **같은 게이트**를 적용한다. 맵은 읽기 전용이라 `canWrite` 를 쓰지 않는다.
  (2026-07-23 간트 권한 통합: `PROJECT_GANTT` → `PROJECT`. 프로젝트 상세 read 면 트리/간트 조회 가능)
- 권한 없는 뷰는 토글 항목에서 빼고, 남는 항목이 하나뿐이면 **토글 자체를 감춘다** — 선택지 하나짜리 전환 UI 는 고장처럼 보인다.
- 권한이 빠져 현재 뷰가 선택 불가가 되면 첫 뷰로 되돌린다(빈 화면 방지).
- 협업 모드(아키텍처 §4.4 ⑥)가 켜진 프로젝트의 참여자는 간트 데이터가 앱 자격으로 조회된다(서버 판정, 키·shape 불변). 목록 뷰는 `useWorkListQueries` 의 페처 훅에서 전용 resolver 로 분기하고(쿼리 키 끝에 `'app'`), 트리 상세·맵 드로어 워크로그는 `useIssueWorklogs(issueKey, projectId)` 가 분기한다. 트리 상세의 연관관계는 본인 권한 그대로다.
- 협업 경로 워크로그(트리 상세·맵 드로어·프로젝트 캘린더)의 작성자에는 **이메일이 의도적으로 빠져 있다**(앱 권한이 사용자의 이메일 공개 설정을 넘을 수 있음). 이메일이 없으면 툴팁은 이름만 보여 준다.
- 쓰기는 `canWrite('PROJECT')`. 트리에서는 DnD·모달 진입·인라인 편집 노출이 전부 이 값에 걸린다.

---

## 2. 트리 뷰·맵 뷰는 백엔드가 없다 (핵심 원칙)

트리 뷰와 맵 뷰는 **전용 resolver 를 만들지 않는다.** 읽기는 `useGanttData`(= `getProjectGanttData`), 쓰기는 간트의 mutation 훅을 **그대로** 호출한다.

```
useGanttData(projectId)            ← 간트와 동일 쿼리키(ganttKeys.data) = 캐시 공유
      │
      ▼
toSvarTasks(filtered, {folders, folderIssues, hourRate, placeholderStart})   ← 계층 규칙 소유자
      │  평면 SVAR 노드 [{ id, text, type, parent, folder?, ... }]
      ▼
buildWorkTree(nodes)  →  flattenTree(tree, collapsedIds)  →  화면 행
```

지키는 이유:

- **계층이 두 벌로 갈라지는 것을 막는다.** 계층 규칙(이슈 부모 > 폴더 소속 > 루트)은 `ganttAdapter.toSvarTasks` 소유이고 트리에서 재해석하지 않는다. 재해석하면 같은 데이터인데 트리와 간트가 다른 트리를 그린다.
- **낙관 패치·토스트 배칭이 갈라지는 것을 막는다.** 쓰기는 `useUpdateSchedule` / `useSetParent` / `useSetLink` / `useUpdateCoworkers` / `useUpdatePlannedMd` + 폴더 5종(`useCreateFolder` / `useRenameFolder` / `useMoveFolder` / `useDeleteFolder` / `useSetIssueFolder`)을 공유한다. 모달도 `GanttScheduleModal` / `GanttUserModal` / `GanttParentModal` / `GanttFolder*Modal` 재사용.
- 쿼리키가 같으므로 **한 뷰의 편집이 다른 뷰에 즉시 반영**된다(재조회 없음).

트리 전용 코드는 **표현·라우팅 순수 로직 3개**뿐이다: `buildWorkTree.js`, `resolveTreeDrop.js`, `relationSource.js` (모두 jest 대상).
트리·간트 공용 폴더 필터 `folderFilter.js`(§4-1-1)도 jest 대상이다.

맵 뷰도 같은 파이프라인을 타고, `buildWorkTree` 결과를 좌표로 바꾸는 순수 함수 `map/layoutIssueTree.js` 하나만 더 붙인다
(`map/mapNodeCard.js`·`map/buildDependencyEdges.js` 포함 3개 모두 jest 대상). 필터 로직은 트리와 **공용**이다 —
`workFilterOptions.js`(`deriveAssigneeOptions` / `deriveStatusOptions` / `filterGanttTasks`)가 단일 출처다.
복사하면 두 뷰가 조용히 다른 트리를 그린다. 워크로그 행 표현도 `WorklogHistoryList.jsx` 로 공용화했다.

### 2-1. 맵 뷰의 추가 규칙 (2026-09-02 2차 수정)

| 항목 | 규칙 |
|---|---|
| 배치 | **위 → 아래 조직도.** 행 y = `depth × (issueHeight + gapY)`(균일), 형제는 옆으로 나란히, 부모 x = 자식 블록 수평 중앙. 폴더·루트는 행 상단 정렬 |
| 프로젝트 루트 | 합성 노드 `project:<project_id>`(타입 `projectRoot`, depth 0). `buildWorkTree` 루트 전체가 그 자식. **접을 수 없고 드로어를 열지 않는다.** 이름은 `findProjectByIdQueryKeys(project_id)` — 상세 페이지와 **같은 쿼리키**라 추가 invoke 가 나가지 않는다 |
| 엣지 | 계층(부모→하위)=**실선**(상/하 핸들) / 간트 연결 관계=**점선+화살표**(좌/우 핸들, `dep-in`·`dep-out`). 의존선은 더 옅게 그려 구조가 먼저 읽히게 한다 |
| 의존 엣지 출처 | 같은 응답의 `links`(이슈 Blocks) + `folderLinks`. 가시성은 `GanttPage` 와 동일 + **양 끝점이 지금 캔버스에 있는 노드**일 때만(`buildDependencyEdges`) |
| 초기 펼침 | 프로젝트 루트 + **모든 폴더는 펼침**, 자식 있는 이슈만 접힘. (v1 의 "루트만 펼침"은 상위 이슈 아래 폴더를 숨겨 "폴더가 안 보인다"는 오해를 샀다) |

> 예외: 상세 패널의 **워크로그**(`useIssueWorklogs`)와 **Jira 연관관계**(`useIssueRelations`)만 선택 시점에 이슈 1건을 온디맨드 조회한다. 전체 이슈에 `subtasks`/`issuelinks`/워크로그를 얹으면 목록 조회가 무거워지기 때문(§5).

---

## 3. 레이아웃

```
┌────────────────────────── 작업관리 탭 ──────────────────────────┐
│                                      [목록] [트리] [간트]      │
│ ┌── 좌 4 : TreeStructurePanel ──┐ ┌── 우 6 : TreeDetailPanel ─┐│
│ │ 검색 · 펼치기/접기 · 폴더추가 │ │ 헤더(요약·상태·이슈키)   ││
│ │ 담당자·상태·프로젝트 필터     │ │ 처리율                    ││
│ │ ── 계층 트리(DnD) ──          │ │ 속성(담당/일정/협업자/MD) ││
│ │  ▾ 📁 폴더                    │ │ 연관 관계(§5)             ││
│ │      ▾ PROJ-1 상위 작업       │ │ 워크로그                  ││
│ │          PROJ-2 하위 작업     │ │                           ││
│ │ [루트로 드롭] (드래그 중만)   │ │                           ││
│ └───────────────────────────────┘ └───────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

- 좌우 높이는 `80vh` 고정, 내부 각자 스크롤(요청 사항).
- ⚠️ **Atlaskit `<Inline>` + `xcss({flex})` 조합 금지.** `Inline`은 `grow` prop 없이는 `flex-grow`가 붙지 않고(기본 hug), `xcss`는 토큰 기반이라 `flex:'4'` 같은 raw 값이 무시된다 → 컨테이너가 부모 폭을 못 채우는 버그가 났다. 폭 제어가 필요한 레이아웃은 일반 `div` + 인라인 flex 로 명시한다.
- 자식 패널에도 `flex:1; width:100%; minWidth:0`을 명시한다. 없으면 선택 노드 내용 길이에 따라 폭이 출렁인다.

---

## 4. 트리 조립 (`buildWorkTree.js`)

| 함수 | 역할 |
|------|------|
| `buildWorkTree(nodes)` | 평면 SVAR 노드 → 중첩 트리(`children` 부착, 원본 불변) |
| `flattenTree(tree, collapsedIds)` | 접힘 반영 렌더 행 `[{ node, depth, hasChildren, isCollapsed }]` |
| `collectParentIds(tree)` | 자식 보유 노드 id (전체 접기용) |
| `isFolderNodeId(id)` / `stripFolderNodeId(id)` | `folder:<uuid>` 판정/변환 |

규칙:

- **고아 노드는 루트로 승격.** `parent`가 0/누락이거나 **필터로 부모가 걸러진** 노드를 루트에 올린다. 안 그러면 필터 결과에서 자식이 통째로 사라진다.
- **형제 정렬은 폴더 우선**, 그 안에서는 입력 순서 유지(폴더 자체 순서는 어댑터의 `sortOrder`).
- 접힌 서브트리는 행을 **아예 만들지 않는다** — 가상 스크롤 없이도 큰 트리에서 렌더 비용이 준다.

### 4-1. 필터와 폴더

폴더는 `tasks`에 없다(어댑터가 합성하는 구조 노드). 그래서 담당자/상태/프로젝트/검색 필터는 **이슈 task 에만** 걸리고, 폴더는 살아남은 자식 이슈를 담는다(간트와 동일 규칙). 검색어는 `key + summary` 부분일치.

### 4-1-1. 폴더 필터 (`folderFilter.js`, 2026-09-30)

트리·간트가 **같은 함수** `applyFolderFilter`를 쓴다(맵은 미적용). 흐름: 폴더 조건 → 나머지 필터(`filterGanttTasks`) → 보일 폴더 → `toSvarTasks`.

| 함수 | 역할 |
|------|------|
| `expandFolderSelection(folders, selectedIds)` | 선택 폴더 + 하위 폴더 전체(임의 깊이). 없는 id·`NO_FOLDER` 제외, 순환 데이터는 방문 집합으로 멈춤 |
| `filterByFolders(tasks, folderIssues, expanded, includeUnfoldered)` | 작업 거르기. 선택이 없으면 전부 통과 |
| `selectVisibleFolders(folders, visibleTasks, folderIssues, expanded)` | 선택 범위 안에서 작업이 남은 폴더만(+그 조상 폴더). 부모가 빠진 폴더는 최상위로 올림 |
| `deriveFolderOptions(folders, noFolderLabel)` | 선택지 — 「폴더 없음」 + `flattenFolderTree` 순서·깊이(들여쓰기) |

- **소속 판정**: `folderIssues` 는 직속 소속만 담는다. 작업의 폴더는 `effectiveParent` 를 따라 **맨 위 조상 이슈**의 폴더로 본다 —
  폴더에 넣은 이슈의 하위 이슈가 화면에서 그 폴더 아래 보이는 것(어댑터 규칙)과 맞춘다. 소속은 **다른 필터 전의 전체 작업** 기준이다.
- **빈 폴더 숨김은 폴더 필터가 켜졌을 때만.** 꺼져 있으면 종전대로 빈 폴더도 보인다(끌어다 놓을 자리). 담당자 등 다른 필터만으로는 폴더를 숨기지 않는다.
- 폴더 필터 중 최상위로 올린 폴더는 화면용 복사본이다. 폴더 이동·삭제 모달은 전체 `folders` 를 쓴다.
- 선택지는 폴더가 1개 이상일 때만 보인다. UI 는 `FolderFilterSelect.jsx`(트리 필터 줄·`GanttToolbar` 공용).

### 4-1-2. 폴더 행 강조 · 들여쓰기 안내선 (`TreeStructurePanel`, 2026-09-30)

- 폴더 행: 배경 `color.background.neutral`(선택·드롭 대상일 때는 그 색이 우선), 굵은 이름, 폴더 아이콘(펼침 `folder-open` / 접힘 `folder-closed`),
  오른쪽 끝에 **하위 작업 수 · 처리율**. 둘 다 간트 폴더 롤업(`synthesizeFolderNodes`)의 값 그대로다 — 수는 `descendantCount`(하위 폴더 포함 자손 작업 수, 어댑터가 롤업에 쓰는 집합의 크기),
  처리율은 폴더 노드의 `progressPercent`(MD 가중). 자손 작업이 없으면 처리율은 빼고 수만 보인다. 트리에서 계산식을 새로 만들지 않는다.
- 안내선: 깊이마다 `color.border` 1px 세로선(펼침 화살표 칸 가운데). 행 사이 간격이 없어 위아래로 이어진다. 마지막 자식에서 끊는 모양은 두지 않는다.

### 4-2. 선택 상태

- `project_id`가 바뀌면 접힘·선택을 초기화한다.
- 선택 노드가 필터로 화면에서 사라지면 선택 해제(`visibleIds` 감시) — 유령 상세가 남지 않게.

---

## 5. 드래그앤드롭 (`resolveTreeDrop.js`)

드롭 1건 → mutation 의도를 결정하는 **순수 함수**. 실제 mutate 호출은 `ProjectTreeView`가 한다.

| 드롭 대상 ↓ / 드래그 → | 폴더 | 이슈 |
|---|---|---|
| **폴더** | `moveFolder`(중첩 이동) | `setIssueFolder`(소속 지정) |
| **이슈** | 무시(이슈는 폴더의 부모가 될 수 없다) | `setParent`(상위 지정) |
| **루트**(빈 영역/드롭존) | `moveFolder(parent=null)` | `setParent(parentKey=null)` = 상위 해제 |

- ★ **라우팅 규칙은 간트(`GanttChart`의 move-task intercept)와 의도적으로 동일**하다. 두 뷰가 같은 데이터를 편집하는데 드롭 의미가 다르면 결과가 어긋난다 — **규칙을 바꾸면 양쪽을 같이 바꿔야 한다.**
- 이슈를 폴더에 넣을 때 `wbsParent`(앱 상위 지정)가 있으면 **먼저 해제**한다(`clearWbsParent`). 어댑터 우선순위상 이슈-부모가 있으면 폴더 소속이 시각적으로 무효라서.
- 순환(자기 자신/자손으로 이동)은 `isDescendantNode`로 **클라에서 먼저** 막는다. 최종 방어는 서버(`detectTreeCycle` / `detectFolderCycle`).
- 변화 없는 드롭은 `null` 반환으로 스킵 — 무의미한 write 를 안 보낸다. 현재 부모가 폴더면 "이슈 부모 없음"으로 정규화해 비교(간트와 동일).
- 드롭존은 드래그 중일 때만 렌더한다(`canWrite && dragId`).
- Firefox 는 `dataTransfer`에 데이터가 없으면 드래그를 시작하지 않는다 → `setData('text/plain', id)` 필수.

---

## 6. 상세 패널의 출처 표기 (`relationSource.js`, TreeDetailPanel)

트리 상세의 "연관 관계" 섹션은 **어느 저장소에서 온 관계인지**를 구분해 보여준다. 판정 규칙만 순수 함수로 분리해 테스트한다 — 규칙이 틀리면 같은 관계가 두 번 나오거나, Jira가 정의한 상위를 워크포스가 지정한 것처럼 보여주는 사고가 난다.

### 6-1. 사실관계 (오해하기 쉬운 지점)

1. **선후행은 앱 전용 저장소가 아니다.** 간트/트리의 선후행 = **Jira 네이티브 이슈 링크의 `Blocks` 타입 그 자체**(백엔드 `GanttMapper.buildLinksFromIssueLinks`가 `type.name === 'Blocks'`만 간선으로 뽑는다).
   → 간트에서 그렸는지 Jira 화면에서 만들었는지 **구분 불가**. 구분되는 척하지 않고 "Jira 이슈 링크로 저장됨"만 한 번 정직하게 안내한다.
   → 같은 링크를 "Jira 연결"과 "선후행"에 모두 그리면 1건이 2번 보인다 → `excludeBlocksLinks`로 Jira 연결 목록에서 Blocks 제외.
2. **상위는 저장소가 실제로 둘이다.**
   - `wbsParent` — 앱이 이슈 프로퍼티 `movesRms.wbsParent`에 저장. Jira 상위를 **override** 한다.
   - Jira `parent` — 표준 필드.
   - 병합 규칙(백엔드 `GanttMapper.buildTasksAndLinks`): `effectiveParent = wbsParent(집합 내) ?? jiraParent(집합 내) ?? null`.
3. 폴더 소속 / 하위 지정(`wbsChildren`)은 앱 전용 → 워크포스 배지.

### 6-2. `resolveParentOrigin` 이 구분하는 상태

| 반환 필드 | 의미 | 화면 |
|-----------|------|------|
| `source: 'workforce' \| 'jira' \| null` | 실제 적용 중인 상위의 출처 | 배지(틸=앱 / 블루=Jira) |
| `isOverridden` | 워크포스 지정이 Jira 상위를 가리고 있음 | 가려진 Jira 상위를 흐리게 함께 표시 |
| `isWbsUnapplied` | 워크포스 지정은 있으나 대상이 조회 범위 밖/필터됨 | 미적용 안내 |
| `isOutOfView` | 적용 상위가 현재 트리 화면에 없음 | 범위 밖 안내 |

### 6-3. 판정 시 주의

- Blocks 판정은 **반드시 타입명**(`typeName === 'Blocks'`)으로. `relation`(`type.outward`/`inward` = 'blocks' / 'is blocked by')은 방향별 표시 문구라 **로케일·커스텀 링크타입에서 깨진다**.
- `BLOCKS_LINK_TYPE_NAME`은 백엔드 `GanttMapper.BLOCKS_TYPE_NAME`과 **값이 일치해야 한다**(프론트 번들이 백엔드 모듈을 import 하지 않아 값만 복제). 한쪽만 바꾸면 링크가 "Jira 연결"로 새어 나오는 중복이 되살아난다.
- `typeName`이 없는 항목(구버전 캐시 등)은 판정 불가 → 보수적으로 남긴다.
- **범위 밖 Blocks 유실 방지**: 백엔드 links 는 프로젝트 페치 집합 안의 Blocks 만 남긴다(dangling/교차프로젝트 제외). Blocks 를 Jira 연결에서 무조건 빼면 범위 밖 링크가 화면에서 통째로 사라지므로, `pickOutOfScopeBlocks`가 남은 것을 읽기 전용으로 따로 보여준다.

### 6-4. 편집 위임

상세 패널은 **입력 수집만** 하고 write 로직을 갖지 않는다. 상위(`ProjectTreeView`) 콜백 → 간트와 같은 mutation.
계획 작업량(MD)만 인라인 편집(간트 그리드 `PlannedMdCell`과 동일한 상호작용: 클릭 → 입력 → Enter 저장 / Esc 취소 / blur 커밋), 일정·협업자·상위·폴더는 간트 모달을 재사용한다.

선후행 방향 계약: `source`=선행, `target`=후행.
- 선행 삭제 → `{ source: 상대, target: 이 노드 }`
- 후행 삭제 → `{ source: 이 노드, target: 상대 }`

---

## 7. 온디맨드 조회 2종 (맵 드로어는 워크로그만)

| 훅 | 쿼리키 | 조회 | 비고 |
|----|--------|------|------|
| `useIssueRelations(issueKey)` | `projectKeys.issueRelations(key)` | `GET issue?fields=parent,subtasks,issuelinks` | staleTime 60s. 실패해도 throw 안 하고 빈 결과 |
| `useIssueWorklogs(issueKey)` | `projectKeys.issueWorklogs(key)` | 이슈 워크로그 | 총 시간 합계 표시. 트리 상세·맵 드로어 공용 |

`executeRequest`는 실패 시 `{ success:false }`를 **반환**한다(throw 아님) → 호출부에서 반드시 체크할 것.

맵 드로어의 커밋 이력 탭·카드 커밋 아이콘은 **2026-09-30 제거**했다. Jira 개발 정보 API 가 Forge 에서 401 이라 동작한 적이 없다
(2026-09-02 실측). 드로어는 워크로그 이력 하나라 탭 없이 제목 줄 + 목록으로 그린다. 커밋 이력이 다시 필요하면 Bitbucket 연동을 별도로 설계한다.

---

## 8. i18n

- 트리 전용 키: `locales/kr|en/projectDetail.json` → `projectDetail.work.tree.*`, `projectDetail.work.view.*`
- 이슈 생성 키: `locales/kr|en/projectDetail.json` → `projectDetail.issue.create.*`
- 맵 전용 키: `locales/kr|en/issueMap.json`(신규 네임스페이스) → `issueMap.*`. 뷰 라벨만 `projectDetail.work.view.map`.
  `{count}`/`{hours}` 치환은 `tFormat(t, key, vars)` — Forge `t()` 는 보간을 지원하지 않는다.
- 폴더·필터·토스트·에러는 **간트 키를 그대로 재사용**한다(`locales/kr|en/gantt.json` → `gantt.folder.*`, `gantt.filter.*`, `gantt.toast.*`, `gantt.error.*`).
  폴더 필터는 `gantt.filter.folder` · `gantt.filter.noFolder`, 트리 폴더 행 요약은 `projectDetail.work.tree.folderTaskCount`(`{count}` → `tFormat`).
- `ko-KR.json` / `en-US.json` 직접 수정 금지 — 추가 후 `cd static/ui && npm run merge`.

---

## 9. 함정 모음 (유지보수 주의)

- **계층·드롭 규칙을 트리에서 재구현하지 말 것.** 어댑터(`toSvarTasks`)와 `resolveTreeDrop`이 단일 출처다. 간트만 고치고 트리를 두면 두 뷰가 다른 트리를 그린다.
- **lazy 뷰는 Suspense 경계 아래에.** 경계를 걷어내면 뷰 전환 시 React error #426.
- **필터 상태를 뷰 컴포넌트로 내리지 말 것.** 셸이 소유해야 tree↔gantt 전환 시 맥락이 유지된다.
- **Blocks 판정은 타입명으로.** 표시 문구(`relation`)로 판정하면 로케일 전환에서 조용히 깨진다.
- **폴더 노드는 `tasks`에 없다.** 폴더 관련 로직에서 `tasks.find`로 폴더를 찾으려 하면 항상 실패한다 — `svarNodes`(어댑터 출력)를 봐야 한다.
- **협업자 write 는 숫자 `issueId` 필수.** 없으면 스킵한다(`node.issueId`는 어댑터 passthrough).
- **`Textfield type="number"`에는 `onWheel={e => e.target.blur()}`.** 없으면 스크롤로 값이 바뀐다.
- **React Flow `nodeTypes` 는 모듈 스코프 상수로.** 컴포넌트 안에서 만들면 매 렌더마다 전체 노드가 언마운트/재마운트된다.
- **맵 카드의 콜백은 `node.data` 가 아니라 context 로.** data 에 넣으면 선택이 바뀔 때마다 data 를 새로 만들어야 해서 `React.memo` 가 전부 무효가 된다(`map/issueMapActions.js`).
- **맵 진행도는 `progressPercent`(= 트리 상세의 "처리율")를 쓴다.** `svar.progress` 는 간트 막대 채움용 근사값이라 숫자가 다르다.
- **맵의 계층 엣지와 의존 엣지는 핸들을 나눠 쓴다**(상/하 vs 좌/우). 같은 핸들에 물리면 두 종류의 선이 한 점에서 엉킨다.
- **프로젝트 루트는 접기 대상에서 빼야 한다.** `initialCollapsedIds`·`collectExpandableIds` 둘 다 `projectRoot` 를 제외한다 — 루트가 접히면 화면에 카드 한 장만 남는다(레이아웃도 방어한다).

---

## 10. 참고

- 간트 데이터 모델·저장 방식·SVAR 렌더 함정: `src/resolver/gantt/GANTT.md`
- 진척도 산식: `src/resolver/projectProgress/CALCULATION.md`
