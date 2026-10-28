# 이슈 맵 (issue-map) — 프론트엔드 구현 리포트

작성일: 2026-09-02 / 브랜치: RFC-192 / 설계서: `_workspace/issue-map/01_architect_design.md`

**백엔드 없음(프론트 전용).** `src/`·`manifest.yml`·`PermissionMap` **단 한 줄도 건드리지 않았다.**
데이터는 `useGanttData`(=`getProjectGanttData`, 쿼리키 `ganttKeys.data`) → `toSvarTasks` → `buildWorkTree` 재사용,
워크로그는 `useIssueWorklogs` 재사용, 커밋만 프론트에서 `requestJira` 로 직접 호출한다.

---

## 1. 신규 파일

### `static/ui/src/pages/projectDetail/work/map/` (신규 디렉토리)

| 파일 | 책임 | jest |
|---|---|---|
| `ProjectIssueMapView.jsx` | 뷰 루트. 화면 상태 전부 소유(§4-4). lazy default export | — |
| `IssueMapCanvas.jsx` | `<ReactFlow>` 래퍼. `nodeTypes` **모듈 상수**, Background/Controls/MiniMap, 읽기전용 플래그. 노드/엣지는 props 로만 받고 계산하지 않는다 | — |
| `IssueCardNode.jsx` | 이슈 티켓 카드(260×132). `React.memo`. `ExpandBadge` 도 여기서 export(폴더 노드가 재사용) | — |
| `FolderGroupNode.jsx` | 폴더 합성 노드(260×56). `React.memo` | — |
| `IssueMapToolbar.jsx` | 검색·담당자/상태/스페이스 필터·모두 펼침/접기·미니맵 토글 | — |
| `IssueMapDrawer.jsx` | `SideDrawer` + 헤더 + `@atlaskit/tabs` 2탭 | — |
| `MapWorklogTab.jsx` | `useIssueWorklogs` → `WorklogHistoryList` | — |
| `MapCommitTab.jsx` | `useIssueDevStatus` → 저장소 그룹 + 커밋 행 + 폴백 4분기 | — |
| `useIssueDevStatus.js` | dev-status 온디맨드 쿼리 훅 | — |
| **`layoutIssueTree.js`** | **순수** — 트리+접힘 → `{nodes, edges, bounds}` + `initialCollapsedIds` / `collectExpandableIds` | ✅ 16건 |
| **`parseDevStatusCommits.js`** | **순수** — dev-status 응답 방어·정규화 단일 지점. **절대 throw 하지 않는다** | ✅ 16건 |
| **`mapNodeCard.js`** | **순수** — SVAR 노드 → 카드 props + `statusAccent` | ✅ 7건 |
| `CardProgressBar.jsx` | 6px 진행 바(카드·드로어 헤더 공용) — **설계서에 없는 추가 파일**(§5 참조) | — |
| `issueMapActions.js` | 카드 내부 버튼 콜백 context — **설계서에 없는 추가 파일**(§5 참조) | — |
| `issueMap.css` | React Flow 오버라이드 + line-clamp. 색은 전부 `var(--ds-*)` | — |
| `layoutIssueTree.test.js` / `parseDevStatusCommits.test.js` / `mapNodeCard.test.js` | 설계서 §9-1 | ✅ |

### 트리와 공유하는 공용 모듈 (`work/`)

| 파일 | 책임 |
|---|---|
| **`workFilterOptions.js`** | **순수** — `deriveAssigneeOptions` / `deriveStatusOptions` / `filterGanttTasks`. `ProjectTreeView` 인라인 로직을 **동작 무변경 이동** |
| `workFilterOptions.test.js` | 12건 — 회귀 고정 케이스(이전 인라인 로직과 동일 결과) 포함 ✅ |
| **`WorklogHistoryList.jsx`** | 워크로그 행 목록 + `extractComment` + `worklogHours`. `TreeDetailPanel` 로컬 코드를 **동작 무변경 이동** |

### i18n (신규)

- `locales/kr/issueMap.json` · `locales/en/issueMap.json` — 설계서 §7-2 의 31개 키 전부. 파일명이 곧 네임스페이스라 파일 안은 `issueMap.` 접두 없이 중첩 객체.

---

## 2. 수정 파일

| 파일 | 변경 |
|---|---|
| `work/ProjectWorkPanel.jsx` | `React.lazy(() => import('./map/ProjectIssueMapView'))` + `items` 에 `map` push(`canReadGantt` 블록 안, `@atlaskit/icon/core/node`) + `viewMode === 'map'` 렌더 분기 **기존 Suspense 경계 안쪽** + 필터 6종 전달. 첫 뷰(table) 정적 유지. 문서 주석 3→4뷰로 갱신 |
| `work/ProjectTreeView.jsx` | 인라인 `assigneeOptions`/`statusOptions`/`filtered` → `workFilterOptions` 호출로 치환. `matchesProjectKeys` 직접 import 제거(공용 모듈이 사용). **동작 무변경** |
| `work/TreeDetailPanel.jsx` | 로컬 `WorklogRow`/`extractComment` 제거 → `WorklogHistoryList` 로 치환. 미사용이 된 `SkeletonTable` import 정리. **마크업·토큰 동일** |
| `utils/jiraApi/requestJira.js` | `REQUEST_MAP` 에 `getIssueDevStatus: { GET, '/rest/dev-status/latest/issue/detail' }` + "비공개 API, 폴백 필수" 주석 |
| `utils/queryKey/projectKeys.js` | `issueDevStatus: (issueId) => ['issueDevStatus', issueId]` (`issueRelations` 바로 아래) |
| `locales/kr|en/projectDetail.json` | `work.view.map` = `맵` / `Map` |
| `locales/ko-KR.json` · `locales/en-US.json` | `npm run merge` 산출물(직접 수정 없음) |
| `work/WORK_VIEWS.md` | §1 표에 `map` 행, §2 "백엔드 없다" 원칙에 맵 포함, §7 온디맨드 표에 `useIssueDevStatus` + dev-status 경고, §8 i18n 에 `issueMap.json`, §9 함정 3건(nodeTypes 상수 / 콜백 context / progressPercent) 추가 |

---

## 3. 소비하는 shape (경계면)

백엔드 resolver 가 없으므로 경계면은 **순수모듈 ↔ 컴포넌트** 3곳이다. 전부 설계서 §2 그대로 구현했다.

### 3-a. SVAR 노드 → 카드 props (`toIssueCardProps`)

```js
// 입력: buildWorkTree 가 children 을 부착한 toSvarTasks 출력 노드
// 출력(카드가 아는 유일한 shape):
{
  id, issueKey,   // node.key ?? node.id  (SVAR 노드에 issueKey 필드는 없다 — 설계서 정정 반영)
  title,          // node.text ?? ''
  typeIconUrl, typeName,
  assignee,       // node.assigneeObj | null → null 이면 점선 원 + '미배정'
  status,         // node.statusCategory | null → null 이면 배지 미표시 (statusKey 는 어댑터가 통과시키지 않음)
  percent,        // node.progressPercent | null  ★ node.progress 가 아니다(§2-a-1)
  issueId,        // node.issueId | null → null 이면 커밋 버튼 자체를 렌더하지 않는다
  project, isFolder, childCount
}
```

- 상태 필터는 설계서대로 **어댑터 이전의 `task.statusKey`** 로 건다(`filterGanttTasks`).
- 진행도는 `progressPercent`(트리 상세 "처리율"과 같은 값). 되돌리려면 `mapNodeCard.js` 한 줄.

### 3-b. dev-status → `parseDevStatusCommits` 출력

요청: `executeRequest('getIssueDevStatus', { issueId, applicationType:'bitbucket', dataType:'repository' }, {})`

```js
{ ok, reason, errorCode, repositories: [{ id, name, url, truncated?, commits: [...] }], totalCommits }
// commit = { id, displayId, message, title, authorName, authorAvatar, timestamp, url, fileCount, merge }
```

방어 규칙표(설계서 §2-b)를 그대로 구현했고 **파서는 어떤 입력에도 throw 하지 않는다**:

| 입력 | 출력 |
|---|---|
| `null` / `undefined` | `REQUEST_FAILED` |
| `{success:false, error:{code}}` | `REQUEST_FAILED` + `errorCode: String(code)` |
| `detail` 배열 아님 | `UNEXPECTED_SHAPE` |
| 저장소 0 + `errors.length > 0` | `ERROR_RESPONSE` |
| 저장소 0 + errors 없음 | **`ok:true`, `repositories: []`** (오류가 아니라 빈 상태) |
| `issueId` 없음 | 훅이 `devStatusFailure('NO_ISSUE_ID')` 반환(조회 안 함) |

정규화: `detail[]` 평탄 병합 / `commits` 비배열이면 저장소는 살리고 `commits:[]` / `authorTimestamp` number·ISO→epoch ms·그 외 null / `displayId` 없으면 `id.slice(0,7)` / `title` = message 첫 줄 / 커밋 timestamp 내림차순(null 뒤) / 저장소 name 오름차순 / 저장소당 50건 슬라이스 + `truncated:true` / `totalCommits` 는 슬라이스 **후** 합계.

**판정은 `result.ok` 하나로 통일**했다. `isError` 를 함께 보지 않는 이유는 `executeRequest` 가 실패해도 throw 하지 않아 React Query 는 성공으로 보기 때문 — 두 갈래 판정은 반드시 어긋난다.

폴백 UI: 로딩=`SkeletonTable rows=3`(스피너 없음) / 저장소 0=`EmptyState`+`issueMap.commit.empty` / 실패=`EmptyState`+`issueMap.commit.unavailable`+회색 힌트 / `NO_ISSUE_ID`=`issueMap.commit.noIssueId`. **`SectionMessage appearance="error"` 를 쓰지 않는다.** 커밋이 실패해도 캔버스·카드·워크로그는 무영향(fail-soft).

### 3-c. `useIssueWorklogs` → 드로어 워크로그 탭

훅 **무수정 재사용**. 실패 시 빈 배열이 되어 "워크로그 없음"으로 보이는 기존 동작을 유지했다(트리와 같은 표현). `WorklogHistoryList` 의 `errorText` 는 맵에서만 지정해 `isError` 가 실제로 뜨는 경우에 안내를 띄운다 — 트리 호출부는 `errorText` 를 넘기지 않으므로 **트리 동작은 이전과 완전히 동일**하다.

---

## 4. 쿼리키

`utils/queryKey/projectKeys.js` 에 `issueDevStatus(issueId) => ['issueDevStatus', issueId]` 1개 추가. 인라인 키 배열 없음 — `queryKeyContract.test.js` 통과.

훅 설정: `enabled: !!issueId && (커밋 탭이 열렸을 때)`, `staleTime 5분`, `retry: false`.

---

## 5. 설계서와 달라진 점 (4건, 전부 사소)

| # | 설계서 | 구현 | 이유 |
|---|---|---|---|
| 1 | map 디렉토리 컴포넌트 8개 | **10개** — `CardProgressBar.jsx`, `issueMapActions.js` 추가 | ① 진행 바를 카드와 드로어 헤더가 함께 쓴다(설계서 §6-8 "카드와 같은 `CardProgressBar`") — 카드 모듈에서 export 하면 드로어가 카드를 import 하게 된다. ② 카드 내부 버튼 콜백을 `node.data` 에 넣으면 선택이 바뀔 때마다 data 를 새로 만들어야 해서 `React.memo` 가 전부 무효가 된다(§4-5 메모 경계 붕괴) → context 로 분리 |
| 2 | 로딩 = `SkeletonTable` (§10-2 M1) | 캔버스는 `SkeletonBlock(height 480, radius 10)` | 캔버스는 표가 아니다. `Skeleton.jsx` 주석의 규칙("구조를 흉내내기 어려운 것은 덩어리 하나")을 따랐다. **커밋/워크로그 탭은 설계대로 `SkeletonTable rows=3`** |
| 3 | 드로어 닫기 = 버튼 | `span[role=button]` + `CrossIcon` | Atlaskit `Button`(new)은 텍스트 자식 전제라 아이콘 전용에 부적합. 같은 파일군의 `RelationRow` 삭제 버튼과 같은 관행 |
| 4 | (명시 없음) | 레이아웃 노드에 `style:{width,height}` 도 부여 | React Flow 래퍼 엘리먼트 크기를 못박아, 카드 내부의 `width/height:100%` 가 접히지 않게 하는 안전장치 |

`proOptions={{hideAttribution:true}}` 는 쓰지 않고 설계서 §6-7 대로 **CSS(`.react-flow__attribution{display:none}`)만** 사용했다.

**설계서 §11 남은 가정 4건은 전부 설계서 판단대로 구현**했다(진행도=`progressPercent` / 카드클릭=드로어·chevron=펼침·더블클릭=펼침 / 가로 방향 / 공용화 리팩토링 포함).

---

## 6. i18n merge

`locales/kr|en/issueMap.json` 신규 + `projectDetail.json` 의 `work.view.map` 추가 후 **`cd static/ui && npm run merge` 실행 완료**.
`ko-KR.json` / `en-US.json` 직접 수정 없음. 산출물 검증:

```
ko issueMap.commit.open   = Bitbucket에서 열기
en issueMap.card.children = {count} sub-items
ko/en projectDetail.work.view.map = 맵 / Map
```

`{count}`·`{hours}` 치환은 전부 `tFormat(t, key, vars)` 사용(Forge `t()` 는 보간 미지원).
재사용 키(신규 생성 안 함): `gantt.filter.assignee`, `gantt.filter.status`, `gantt.error.load`, `common.loading`.

---

## 7. 테스트 / 빌드 결과 (실행 원문)

### `cd static/ui && npm test` — 전체 통과

```
Test Suites: 106 passed, 106 total
Tests:       1722 passed, 1722 total
Snapshots:   1 passed, 1 total
Time:        20.542 s
```

신규 4개 스위트(51건) 포함. 기존 `buildWorkTree.test.js` · `resolveTreeDrop.test.js` · `relationSource.test.js` · `queryKeyContract.test.js` 전부 그대로 통과 → 공용화 리팩토링 회귀 없음.

### `cd static/ui && CI=true npm run build` — 통과

```
Compiled with warnings.        ← node_modules source-map 경고(사전 존재, 기준선 빌드에도 동일)
{"file":"static/js/main.18b9afc6.js","rawBytes":1592736,"gzipBytes":436997,"budgetBytes":950000,"withinBudget":true}
```

**번들 예산(R7) 확인** — 변경 전후를 같은 조건에서 각각 빌드해 비교했다:

| | main gzip |
|---|---|
| 변경 전(기준선, `git stash` 후 빌드) | 436,928 B |
| 변경 후 | 436,997 B |
| **증가폭** | **+69 B** (예산 950,000 B 대비 46.0%) |

`@xyflow/react` 는 main 에 새지 않았다 — `grep "react-flow__pane"` 결과 lazy 청크 1개(`3984.*.chunk.js`)에만 존재, main 에는 0건.

### 루트 `npm test` (백엔드)

**실행하지 않았다.** `src/` 를 한 줄도 수정하지 않았으므로 영향이 없다(리더가 확인을 원하면 그대로 돌리면 된다).

---

## 8. dev 배포 후 리더 수동 확인 항목

**★ 1순위 — dev-status 실호출 (설계서 R1, 유일하게 로컬에서 검증 불가한 지점)**

1. 맵에서 커밋이 달린 이슈 카드의 `</>` 버튼 클릭 → 커밋 탭.
   - **성공**: 저장소 그룹 + 커밋 행(짧은 해시·메시지 첫 줄·파일 수·시각)이 보이고, 해시/↗ 클릭 시 `router.open` 으로 Bitbucket 새 탭.
   - **실패(403/404 등)**: **붉은 오류 박스가 아니라** 회색 안내("커밋 정보를 불러올 수 없습니다" + 힌트)여야 한다. 이때도 캔버스·카드·워크로그 탭은 정상이어야 한다.
   - 브라우저 네트워크 탭에서 `/rest/dev-status/latest/issue/detail?issueId=...&applicationType=bitbucket&dataType=repository` 의 실제 상태코드와 응답 body 를 확보해 주면, shape 이 다를 경우 `parseDevStatusCommits.js` + 그 테스트만 고치면 된다(격리 완료).
   - 전면 실패로 판명되면 잘라낼 범위는 `MapCommitTab` + `useIssueDevStatus` + 카드 커밋 버튼 **3곳뿐**이다.

**그 외**

2. `?view=map` 새로고침 복원 · 뒤로가기(Forge history 라우터).
3. 뷰 전환 시 담당자/상태/스페이스 필터 유지(tree ↔ gantt ↔ map). 검색어는 뷰별 로컬(설계 의도).
4. **트리 뷰와 맵의 계층·형제 순서가 동일**한지 같은 필터 상태에서 대조(폴더 우선 정렬 포함).
5. 상호작용 분리: 카드 본문 클릭→드로어 / 커밋 버튼→커밋 탭 / chevron→펼침(드로어 안 열림) / 더블클릭→펼침 / **폴더 노드 클릭→펼침만**.
6. 최초 진입이 "루트만 펼침"인지, 필터를 바꿔도 펼친 상태가 유지되는지(재계산하지 않는 것이 의도).
7. **다크 모드** 전환 시 카드·엣지·컨트롤·미니맵 색(전부 `token()`/`var(--ds-*)`, 하드코딩 색 없음).
8. **회귀 육안 확인(공용화 리팩토링)** — 트리 뷰의 담당자/상태/스페이스/검색 필터 결과와 상세 패널 워크로그 표시가 이전과 동일한지.
9. 대량 이슈 프로젝트에서 팬/줌 체감(초기 루트만 펼침 + 접힌 서브트리 미생성으로 방어했으나 실데이터 확인 필요).

---

# 2차 수정 (2026-09-02) — dev 실화면 피드백 반영

입력: `_workspace/issue-map/00_input/requirement_v2.md`

## A. 무엇을 바꿨나 (요구 4건)

### A-1. 배치 방향을 위→아래 조직도로 뒤집었다

`layoutIssueTree.js` 전면 수정. 루트가 맨 위, 자식은 아래 행, 형제는 옆으로 나란히.

| | v1 (좌→우) | v2 (위→아래) |
|---|---|---|
| 행/열 진행 | x = depth × colStep, 형제는 y 로 쌓임 | **y = depth × (issueHeight + gapY)**, 형제는 x 로 나열 |
| 부모 정렬 | 자식 블록의 **수직** 중앙 | 자식 블록의 **수평** 중앙 |
| 핸들 | Right(source) → Left(target) | **Bottom(source) → Top(target)** |
| 좌표 정규화 | `minY` → 0 | **`minX` → 0** |
| 상수 | `gapX 96 / gapY 24` | `gapX 32`(형제 수평) / `gapY 64`(행 수직), `rootHeight 84` 추가 |

- 행 높이는 `issueHeight` 기준으로 **균일**하다 → 폴더(56)·루트(84)는 행 **상단 정렬**되고, 같은 깊이의 작업이 한 줄로 정렬돼 비교가 된다.
- 헤더 주석의 "가로(좌→우)" 근거를 새 방향의 근거로 교체했다(v1 이 왜 틀렸는지 — 형제가 세로로 쌓여 "무엇이 같은 단계인지"가 안 읽혔다 — 를 함께 남겼다).
- **형제 순서(`buildWorkTree` 배열 순서 그대로)와 접힘 규칙(접힌 서브트리는 노드·엣지 미생성)은 무변경.**

### A-2. 프로젝트 루트 카드를 항상 그린다

- 합성 노드 `project:<project_id>`, 타입 `projectRoot`, depth 0. `buildWorkTree` 루트 배열 전체가 그 자식(`ProjectIssueMapView` 의 tree memo 에서 합성).
- 이름: `invoke('findProjectById', { project_id })` → `rows[0].project_name`. 쿼리키는 `findProjectByIdQueryKeys(project_id)` 로 **상세 페이지와 동일** → 이미 캐시에 있어 추가 invoke 가 사실상 나가지 않는다. 미도착/실패 시 `issueMap.root.fallback`("프로젝트").
- 이슈 수 · 폴더 수를 부제로 표시(폴더가 0이면 폴더 수는 감춘다).
- **접기 불가**: `initialCollapsedIds`·`collectExpandableIds` 가 `projectRoot` 를 제외하고, 레이아웃도 `!node.projectRoot && collapsed.has(id)` 로 한 번 더 방어한다(접히면 화면에 카드 한 장만 남는다).
- **클릭해도 드로어 없음**: `handleSelectNode` 가 `projectRoot` 를 즉시 반환하고 `drawerNode` 에서도 제외.
- 디자인: DMOVE 틸 2px 테두리 + 좌측 6px 틸 스트립 + 틸 아이콘 배지 + 굵은 이름(14/700). 이슈 카드(1px 회색 테두리 · 상태색 4px 스트립)와 한눈에 구분된다.

### A-3. 엣지 2종 (계층 실선 / 의존 점선+화살표)

- 신규 순수 모듈 **`buildDependencyEdges(links, folderLinks, visibleNodeIds)`** (jest 8건).
  - 출처는 `useGanttData` 가 이미 들고 있는 `links`(이슈 Blocks) + `folderLinks` — **추가 조회 없음**.
  - 가시성: `GanttPage.jsx:195-222` 와 같은 규칙(이슈 링크 = 양 끝점이 필터 통과 이슈 / 폴더 링크 = 양 끝점이 실제 SVAR 노드) **+ 양 끝점이 현재 레이아웃에 존재**. 세 조건이 전부 "그 id 가 현재 노드 집합에 있는가"로 환원되므로 호출부는 `visibleNodeIds` 하나만 넘긴다(그 집합이 이미 필터·어댑터·펼침을 모두 통과한 결과다). 근거를 파일 주석에 남겼다.
  - self-link 무시, 같은 방향 중복 제거(이슈 링크와 폴더 링크가 겹치는 경우), 반대 방향은 별개 엣지.
  - `markerEnd.type` 은 문자열 `'arrowclosed'`(= `MarkerType.ArrowClosed` 와 같은 값) → 순수 모듈이 `@xyflow/react` 를 import 하지 않는다.
- **핸들 분리**: 계층 `child-in`(Top) / `child-out`(Bottom), 의존 `dep-in`(Left) / `dep-out`(Right). `HANDLE` 상수를 `layoutIssueTree.js` 가 소유하고 `IssueCardNode`·`FolderGroupNode`·`ProjectRootNode` 가 함께 쓴다. 폴더도 `folderLinks` 의 끝점이 될 수 있어 의존 핸들을 함께 달았다.
- **색**: 순수 모듈은 style 을 만들지 않고, 뷰가 선택 강조와 함께 한 번에 입힌다(토큰이 필요해서).
  계층 = `color.border.bold` opacity .85 / 의존 = 같은 색 opacity **.5** + `strokeDasharray '6 4'` + 화살표 → 구조가 먼저 읽히고 관계가 그 위에 얹힌다. 선택 노드에 닿은 엣지는 **기존 규칙대로 틸(`color.icon.brand`) + 2px**(의존 엣지는 화살표 색도 함께 바뀐다).
- **범례**: 캔버스 좌상단 `<Panel position="top-left">` 에 실선=하위 작업 / 점선=선후행. SVG 선 두 개 + 라벨, 색은 전부 토큰.

### A-4. 초기 펼침 규칙 변경

`initialCollapsedIds` — **프로젝트 루트 + 모든 폴더는 펼침, 자식이 있는 이슈만 접힘**(깊이 무관).
v1 의 "depth ≥ 1 부모 전부 접기"가 상위 이슈 아래 폴더를 통째로 숨겨 "간트에서 만든 폴더가 맵에 없다"는 오해를 샀던 것이 원인이다. 근거를 함수 주석에 남겼다.

## B. 실제 변경 파일 (`git diff --stat` + untracked 실측)

리포트 작성 **전에** 디스크 상태를 확인했다. 아래는 그 출력 그대로다.

```
=== git diff --stat (tracked) ===
 README.md                                          |   2 +-      <- 다른 세션
 locales/en-US.json                                 |  77 +++-
 locales/en/calendar.json                           |   9 +-      <- 다른 세션(캘린더)
 locales/en/projectDetail.json                      |   3 +-
 locales/ko-KR.json                                 |  77 +++-
 locales/kr/calendar.json                           |   9 +-      <- 다른 세션(캘린더)
 locales/kr/projectDetail.json                      |   3 +-
 static/ui/src/components/calendar/FullCalendar.css | 473 ++++--   <- 다른 세션(캘린더)
 static/ui/src/components/calendar/FullCalendar.jsx | 318 ++++--   <- 다른 세션(캘린더)
 .../projectDetail/calender/ProjectCalender.jsx     |  83 ++--     <- 다른 세션(캘린더)
 .../pages/projectDetail/work/ProjectTreeView.jsx   |  50 +--
 .../pages/projectDetail/work/ProjectWorkPanel.jsx  |  30 +-
 .../pages/projectDetail/work/TreeDetailPanel.jsx   |  80 +---
 .../ui/src/pages/projectDetail/work/WORK_VIEWS.md  |  50 ++-
 static/ui/src/utils/jiraApi/requestJira.js         |   8 +
 static/ui/src/utils/queryKey/projectKeys.js        |   2 +
 16 files changed, 877 insertions(+), 397 deletions(-)
```

캘린더 6개(+`README.md`)는 **다른 세션 작업이라 건드리지 않았다.**

**1차 리포트 정정 확인** — `TreeDetailPanel.jsx` 공용화가 실제로 디스크에 적용됐는지 `git diff` 로 검증했다(1차 때 누락 의심 지적):

```
 static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx | 80 +++-------------------
 1 file changed, 9 insertions(+), 71 deletions(-)
-import { SkeletonTable, SkeletonText } from '.../Skeleton';
+import { SkeletonText } from '.../Skeleton';
+import WorklogHistoryList from './WorklogHistoryList';
-function WorklogRow({ worklog }) { ...            (제거됨)
-const extractComment = (comment) => { ...         (제거됨)
```

→ 현재 디스크 상태 기준 **적용돼 있다**(로컬 `WorklogRow`/`extractComment` 제거 + `WorklogHistoryList` 치환 완료).

### 신규(untracked) 파일 — `git status --porcelain -uall` 실측

```
locales/en/issueMap.json
locales/kr/issueMap.json
static/ui/src/pages/projectDetail/work/WorklogHistoryList.jsx
static/ui/src/pages/projectDetail/work/workFilterOptions.js
static/ui/src/pages/projectDetail/work/workFilterOptions.test.js
static/ui/src/pages/projectDetail/work/map/CardProgressBar.jsx
static/ui/src/pages/projectDetail/work/map/FolderGroupNode.jsx
static/ui/src/pages/projectDetail/work/map/IssueCardNode.jsx
static/ui/src/pages/projectDetail/work/map/IssueMapCanvas.jsx
static/ui/src/pages/projectDetail/work/map/IssueMapDrawer.jsx
static/ui/src/pages/projectDetail/work/map/IssueMapToolbar.jsx
static/ui/src/pages/projectDetail/work/map/MapCommitTab.jsx
static/ui/src/pages/projectDetail/work/map/MapWorklogTab.jsx
static/ui/src/pages/projectDetail/work/map/ProjectIssueMapView.jsx
static/ui/src/pages/projectDetail/work/map/ProjectRootNode.jsx           * 2차 신규
static/ui/src/pages/projectDetail/work/map/buildDependencyEdges.js       * 2차 신규
static/ui/src/pages/projectDetail/work/map/buildDependencyEdges.test.js  * 2차 신규
static/ui/src/pages/projectDetail/work/map/issueMap.css
static/ui/src/pages/projectDetail/work/map/issueMapActions.js
static/ui/src/pages/projectDetail/work/map/layoutIssueTree.js
static/ui/src/pages/projectDetail/work/map/layoutIssueTree.test.js
static/ui/src/pages/projectDetail/work/map/mapNodeCard.js
static/ui/src/pages/projectDetail/work/map/mapNodeCard.test.js
static/ui/src/pages/projectDetail/work/map/parseDevStatusCommits.js
static/ui/src/pages/projectDetail/work/map/parseDevStatusCommits.test.js
static/ui/src/pages/projectDetail/work/map/useIssueDevStatus.js
```

### 2차에서 **수정**한 파일 (전부 맵 범위)

| 파일 | 변경 |
|---|---|
| `map/layoutIssueTree.js` | 방향 전환(위→아래), `rootHeight`·`gapX/gapY` 재정의, `HANDLE` 상수 신설, `projectRoot` 타입 + 접기 불가 방어, 계층 엣지에 핸들·`data.kind` 부여, `initialCollapsedIds`/`collectExpandableIds` 규칙 변경(`collectParentIds` 의존 제거) |
| `map/layoutIssueTree.test.js` | 새 방향으로 전면 갱신 + 루트/초기펼침 테스트 추가 (15 → **18건**) |
| `map/ProjectIssueMapView.jsx` | `findProjectById` 조회, 루트 노드 합성, `links`/`folderLinks` 소비, `buildDependencyEdges` 연결, 엣지 2종 스타일링, `hasContent` 기반 빈 상태 판정, `projectRoot` 클릭/드로어 제외, 캔버스에 `t` 전달 |
| `map/IssueMapCanvas.jsx` | `nodeTypes` 에 `projectRoot` 등록, 범례 `<Panel>` 추가, 미니맵 루트 색 틸 |
| `map/IssueCardNode.jsx` | 핸들 4개(상/하 계층 + 좌/우 의존)로 교체 |
| `map/FolderGroupNode.jsx` | 핸들 4개로 교체 |
| `locales/kr\|en/issueMap.json` | `root.fallback` / `root.issueCount` / `root.folderCount` / `legend.hierarchy` / `legend.dependency` 5키 추가 |
| `work/WORK_VIEWS.md` | §2-1 "맵 뷰의 추가 규칙" 표 신설(배치·루트·엣지·의존 출처·초기 펼침), 순수 모듈 4개로 갱신, 함정 2건 추가 |

## C. i18n

`locales/kr|en/issueMap.json` 에 5키 추가 후 **`cd static/ui && npm run merge` 실행 완료.** `ko-KR.json`/`en-US.json` 직접 수정 없음. 산출물 검증:

```
ko root: {"fallback":"프로젝트","issueCount":"작업 {count}건","folderCount":"폴더 {count}개"} legend: {"hierarchy":"하위 작업","dependency":"선후행"}
en root: {"fallback":"Project","issueCount":"{count} work items","folderCount":"{count} folders"} legend: {"hierarchy":"Sub-items","dependency":"Dependencies"}
ko commit.open still: Bitbucket에서 열기      <- 기존 키 유실 없음
```

## D. 테스트 / 빌드 결과 (실행 원문)

### `cd static/ui && npm test` — 전체 통과

```
Test Suites: 107 passed, 107 total
Tests:       1734 passed, 1734 total
Snapshots:   1 passed, 1 total
Time:        24.247 s
```

1차 대비 스위트 +1(`buildDependencyEdges.test.js`), 테스트 +12(레이아웃 15→18, 의존 엣지 +8, 초기 펼침 3건 포함). 기존 트리 테스트(`buildWorkTree`·`resolveTreeDrop`·`relationSource`)와 `queryKeyContract` 전부 통과.

### `cd static/ui && CI=true npm run build` — 통과

```
Compiled with warnings.      <- node_modules source-map 경고(사전 존재)
{"file":"static/js/main.cf9e9b0e.js","rawBytes":1593414,"gzipBytes":437110,"budgetBytes":950000,"withinBudget":true}
```

- main gzip **437,110 B** / 예산 950,000 B (46.0%).
- `@xyflow/react` 는 여전히 main 에 없다 — `grep "react-flow__pane"`: main **0건**, lazy 청크 `3984.*.chunk.js` 에만 존재.
- ⚠ 1차 때 낸 "+69 B" 같은 **정확한 증가폭은 이번엔 측정하지 않았다** — 워킹트리에 다른 세션의 캘린더 변경이 섞여 있어 `git stash` 로 기준선을 잡으면 그 작업까지 함께 되돌리게 되기 때문이다. 절대값이 예산의 절반 이하이고 xyflow 격리가 유지되므로 R7 위험은 없다.
- 내 파일에서 발생한 eslint 경고 없음(경고는 `@atlaskit`·`marklassian` source map 3건뿐, 기준선과 동일).

## E. 유지된 것 (요구 §5)

카드 클릭=드로어 / chevron=펼침 / 더블클릭=펼침 / 폴더 클릭=펼침만, 셸 필터 공유(tree↔gantt↔map), 워크로그·커밋 드로어와 커밋 fail-soft(붉은 오류 대신 안내 빈 상태), 색은 전부 `token()`/`var(--ds-*)`, 접힌 서브트리 노드·엣지 미생성, `nodeTypes` 모듈 상수, 콜백 context 분리(`React.memo` 유지).

## F. dev 재배포 후 확인 항목 (2차)

1. **맵이 위→아래 조직도로 보이는지**, 같은 깊이 작업이 한 줄로 정렬되는지.
2. **최상단에 프로젝트 이름 카드**(틸)가 있고 이슈 수·폴더 수가 맞는지. 이름이 안 나오면 폴백("프로젝트")이 뜨는지.
3. 루트 카드 클릭 시 **아무 일도 없어야** 한다(드로어 X, 접힘 X). "모두 접기"를 눌러도 루트는 펼쳐진 채여야 한다.
4. **폴더가 처음부터 보이는지**(1차 불만의 직접 원인). 자식 있는 이슈만 접힌 상태로 시작.
5. **간트에서 만든 선후행이 점선+화살표로** 보이는지, 계층 실선과 구분되는지. 좌상단 범례 확인.
6. 접힌 서브트리 안쪽으로 향하는 의존선이 **그려지지 않는지**(허공에서 시작하는 선이 없어야 한다).
7. 노드 선택 시 그 노드에 닿은 엣지(계층·의존 모두)가 **틸로 강조**되는지.
8. 다크 모드에서 루트 카드·범례·점선 색.
9. (1차 항목 유지) **dev-status 실호출** — 커밋 탭 성공/실패 양쪽. 실패 시 붉은 오류 없이 안내 빈 상태 + 나머지 화면 정상.
