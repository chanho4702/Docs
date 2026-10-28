# 프론트엔드 구현 리포트 — 작업관리 목록 뷰 Jira 계층 펼치기

작성: 2026-09-07 / frontend-engineer
슬러그: `work-list-hierarchy`
입력: `01_architect_design.md` + 리더 확정 Q1(`INITIAL_EXPAND='all'`) / Q2(issueKey 캐시 패치 승인)
**백엔드 0줄** — `src/` 무변경. resolver·PermissionMap·DB·manifest 전부 손대지 않음.

---

## 1. 생성/수정 파일 목록 (실제 줄 수)

### 신규 (7)

| 파일 | 줄 |
|---|---|
| `static/ui/src/pages/projectDetail/issue/workListTree.js` | 175 |
| `static/ui/src/pages/projectDetail/issue/workListTree.test.js` | 247 |
| `static/ui/src/pages/projectDetail/issue/useWorkListFlatPage.js` | 68 |
| `static/ui/src/pages/projectDetail/issue/useWorkListHierarchy.js` | 173 |
| `static/ui/src/pages/projectDetail/issue/useIssueRowFactory.jsx` | 481 |
| `static/ui/src/pages/projectDetail/issue/HierarchyToggleCell.jsx` | 58 |
| `static/ui/src/pages/projectDetail/issue/WorkListModeToggle.jsx` | 32 |

### 수정 (5)

| 파일 | 줄 | 변경 |
|---|---|---|
| `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` | 438 (기존 776) | 셸로 축소 |
| `static/ui/src/pages/projectDetail/issue/useWorkListQueries.js` | 315 (+188/-0 대 HEAD) | 계층 fetcher·훅·`patchIssueByKey` 추가 |
| `static/ui/src/utils/queryKey/projectKeys.js` | +14 | `groupSkeleton` / `groupHierarchyPage` |
| `locales/kr/projectDetail.json` | +16 | i18n 12키 |
| `locales/en/projectDetail.json` | +16 | i18n 12키 |

### 무변경 확인 (설계서 §10 요구)

`ProjectIssuePanel.jsx` · `ProjectGroupCard.jsx` · `CursorPagingTable.jsx` · `TableSurface.jsx` — **이번 작업에서 한 줄도 건드리지 않았다.**
`workListQuery.js`(`SUMMARY_FIELDS`·`buildGroupJql`·`normalizeJqlMap`·`advanceCursorHistory`)도 무변경.

> ⚠️ **동시 작업 주의.** 작업 중 워킹트리에 **다른 에이전트의 RFC-199 변경(이슈 타입 필터 + 상태 Lozenge 통일)** 이 들어왔다.
> 그 결과 `ProjectIssuePanel.jsx`·`workListQuery.js`(`SUMMARY_FIELDS`에 `issuetype` 추가)·`useWorkListQueries.js`(`issueTypeOptions`)·
> `useIssueRowFactory.jsx`(`StatusComponent` → `IssueStatusLozenge`) 가 `git status` 상 수정으로 잡힌다.
> **이 변경들은 내 작업이 아니며 그대로 보존했다.** 검증자는 `git diff` 를 볼 때 두 작업이 섞여 있음을 감안할 것.

---

## 2. 실제로 구현된 훅 뷰모델 shape (코드 기준)

두 훅이 **같은 필드 집합**을 반환한다. 셸(`ProjectIssueTable`)은 `vm` 하나만 본다.

```js
// useWorkListFlatPage({projectId, groupKey, filter, pageSize, resetSig, enabled})
// useWorkListHierarchy({projectId, groupKey, filter, pageSize, resetSig, enabled, onCollapseSubtree})
{
  visibleIssues: Issue[],     // 계층은 접힘 반영 subset, 평면은 페이지 전체
  userMap: {[accountId]: user},
  rowMeta: Map<issueKey, {key, depth, hasChildren, isExpanded}> | null,  // 평면 = null
  currentPageIndex: number,
  currentCount: number,       // 평면=행 수 / 계층=이 페이지의 **루트 수**(pageRootCount)
  hasNext: boolean,
  hasPrev: boolean,
  onNext(), onPrev(),
  isLoading: boolean,
  isLoadingMore: boolean,
  truncated: boolean,
  patchQueryKey: QueryKey,
  resetPage(),                // ★ 설계서에 없던 추가 — refreshSignal 에서 셸이 두 모드를 함께 0페이지로
  // ── 계층 전용 (평면은 undefined) ──
  skeletonTruncated: boolean, // ★ 추가 — 절단 원인별 안내 문구 분기용
  detailTruncated: boolean,   // ★ 추가
  rootCount: number,          // ★ 추가 — 그룹 전체 루트 수
  rowCount: number,           // ★ 추가
  expandedKeys: Set<string>,
  toggleExpand(issueKey),
  expandAll(), collapseAll(), resetExpand(),
}
```

**설계서 §2-③과 다른 점(전부 추가, 제거 없음):** `resetPage` / `skeletonTruncated` / `detailTruncated` / `rootCount` / `rowCount`.
`rowMeta` 의 값에는 `key` 가 포함된다(`flattenHierarchy` 출력 그대로). 셸이 `onToggle` 을 붙여 셀에 넘긴다:

```js
// ProjectIssueTable.jsx — buildRowHierarchy
{depth, hasChildren, isExpanded, onToggle: () => vm.toggleExpand(issueKey)}   // 평면은 null
```

**캐시 객체 shape(두 모드 동형, `patchQueryKey` 가 가리키는 값):**
```js
{ issues: Issue[], userMap: {...}, nextPageToken?: string|null }   // 계층은 nextPageToken 없음
```
→ `applyIssuePatches`(일괄 적용) · `markIssuesDeleted`(일괄 제외) · `replaceIssueByKey`(단건) 3종 모두 무수정 재사용.

**쿼리키 (`workListKeys`):**
```js
groupSkeleton(pid, gk, filter)                  = ['projectWorkList', pid, 'group', gk, 'skeleton', filter]
groupHierarchyPage(pid, gk, filter, idx, keys)  = ['projectWorkList', pid, 'group', gk, 'hierarchy', filter, idx, keys]
```
둘 다 `groupAll(pid, gk)` prefix 하위 → 기존 `invalidateGroup(groupKey)` 가 코드 변경 없이 골격·상세를 함께 무효화한다(테스트로 고정).

---

## 3. Jira REST 요청 body (실제 값)

`executeRequest('searchIssueWithJQL', body)` → `POST /rest/api/3/search/jql`

**골격** (`fetchWorkListSkeleton`, `useWorkListQueries.js`)
```js
{
  jql: buildGroupJql(projectId, groupKey, filter),   // 평면 페이지와 **완전히 같은 JQL**
  fields: ['parent'],
  fieldsByKeys: true,
  maxResults: 500,          // SKELETON_PAGE_SIZE
  nextPageToken?: string    // 2페이지부터만
}
// 상한: MAX_SKELETON_PAGES=8, MAX_SKELETON_ISSUES=2000
// 루프 종료: isLast===true  →  !nextPageToken  →  pageItems.length===0  →  (그 다음에야) 상한
// 반환: { rows: [{key, parentKey}], truncated }
```

**상세** (`fetchWorkListDetailByKeys`)
```js
{
  jql: 'key IN ("PRJ-1","PRJ-2",…)',   // buildKeyInJql — projectId/사용자 필터를 다시 AND 하지 않음
  fields: ['*all'],
  properties: ['movesRms'],
  fieldsByKeys: true,
  maxResults: 50,           // DETAIL_CHUNK_SIZE
  nextPageToken?: string    // 방어적으로 최대 2회만 추적(MAX_DETAIL_FOLLOW)
}
// 청크 50 / 동시성 3(mapWithConcurrency, = BULK_APPLY_CONCURRENCY) / 페이지 키 상한 MAX_DETAIL_KEYS=500
// 청크 하나라도 {success:false} 면 쿼리 전체 throw(부분 트리 금지)
// 반환: { issues: Issue[](pageKeys DFS 순), userMap }
```

**평면 페이지** — `fetchWorkListGroupPage` **무변경**(`fields:['*all']`, `properties:['movesRms']`, `maxResults: pageSize`).

`executeRequest` 는 실패해도 throw 하지 않고 `{success:false}` 를 반환하므로, 두 신규 fetcher 모두 `assertSearchOk()` 로 명시 검사 후 `throw` 승격한다(React Query 에러 상태 인지).
`fields.parent` 가 없으면 `parentKey = null` → 루트 취급(fail-soft). 계층이 안 잡혀도 화면은 평면처럼 정상 동작하고 크래시가 없다.

---

## 4. i18n

`locales/kr/projectDetail.json` · `locales/en/projectDetail.json` 의 `issue` 네임스페이스에 **12키 추가**(설계서 §6 그대로):

`issue.viewMode.hierarchy` · `issue.viewMode.flat` · `issue.viewMode.tooltip`
`issue.hierarchy.expandAll` · `collapseAll` · `expandRow` · `collapseRow` · `rowHint` · `pageUnit` · `truncated` · `detailTruncated` · `orphanHint`

**`cd static/ui && npm run merge` 실행 완료** → `locales/ko-KR.json` / `locales/en-US.json` 에 반영 확인:
```
ko viewMode: {"hierarchy":"계층","flat":"평면","tooltip":"Jira 상위–하위 구조로 …"}
ko hierarchy keys: [expandAll, collapseAll, expandRow, collapseRow, rowHint, pageUnit, truncated, detailTruncated, orphanHint]
en hierarchy.rowHint: "{roots} top-level · {rows} rows shown"
```
`ko-KR.json`/`en-US.json` 직접 수정 없음. `{roots}`/`{rows}` 치환은 `utils/i18n.js` 의 `tFormat` 사용.

> **`issue.hierarchy.orphanHint` 는 추가했으나 아직 어디서도 소비하지 않는다.** 설계서 §6 이 키를 열거하지만
> §2·§3 의 어떤 계약도 이 문구를 놓을 자리를 지정하지 않았다(행 단위 배지를 넣으면 필터 상태에서 대다수 행에
> 아이콘이 붙어 노이즈가 된다). 과설계를 피해 키만 두었다 — 리더 판단이 필요하면 §7 참조.

---

## 5. 테스트 / 빌드 출력

```
$ cd static/ui && npx jest
Test Suites: 111 passed, 111 total
Tests:       1801 passed, 1801 total
Snapshots:   1 passed, 1 total
Time:        25.832 s
```
- 신규 `workListTree.test.js` — **32 tests passed** (설계서 §3-9 케이스 전체 + 쿼리키 prefix/해시 계약 3건)
- 기존 `workListQuery.test.js` · `queryKeyContract.test.js` · `queryKeyFactories.test.js` · `bulkApply.test.js` · `bulkDelete.test.js` **무회귀**

```
$ cd static/ui && CI=true npm run build
EXIT=0
Compiled with warnings.
  (경고는 전부 node_modules 소스맵 — @atlaskit/analytics-next-stable-react-context, marklassian. 기존과 동일)
> bundle:check
{"file":"static/js/main.b2458833.js","rawBytes":1760610,"gzipBytes":476393,"budgetBytes":950000,"withinBudget":true}
```

---

## 6. 설계서와 다르게 구현한 지점 + 이유

| # | 지점 | 설계서 | 실제 | 이유 |
|---|---|---|---|---|
| 1 | `useWorkListGroupPage` | "기존 함수 5개 무변경" | **선택 인자 `enabled = true` 추가** | 계층이 기본 모드라, 평면 훅을 끄지 않으면 카드를 펼칠 때마다 쓰지 않는 평면 페이지 요청이 **항상 1회** 더 나간다. §4-4 의 "비활성 쪽은 `enabled:false` → 네트워크 0" 을 지키려면 필수. 기본값 true 라 **인자를 생략한 호출의 동작은 완전히 동일**하고, 다른 호출부는 없다(grep 확인) |
| 2 | 페이지 리셋 위치 | 셸이 `setPageIndex(0)` | **각 훅이 `resetSig` 를 받아 렌더 중 스스로 리셋** + `resetPage()` 노출 | 커서 히스토리(평면)와 오프셋(계층)은 서로 호환되지 않는 상태다. 하나의 `pageIndex` 를 공유하면 모드 전환 시 의미가 어긋난다. 리셋 타이밍(렌더 중, 조회 나가기 전)은 원본과 동일 |
| 3 | `collectPageKeys` 반환 | `{pageKeys, rootCount, hasNext, truncated}` | **`pageRootCount` 추가** | `currentCount` = "이 페이지의 루트 수"를 훅에서 재계산하지 않고 슬라이싱 결과에서 그대로 받기 위해(경계에서 `Math.min` 재구현 = 규칙 이중 구현) |
| 4 | `truncated` 안내 | 단일 배너 | `skeletonTruncated` / `detailTruncated` 분리 | 설계서 §6 이 `hierarchy.truncated`(골격 상한)와 `hierarchy.detailTruncated`(페이지 상세 상한) **두 문구**를 요구하는데, 단일 boolean 으로는 어느 쪽인지 고를 수 없다 |
| 5 | `refreshSignal` 시 무효화 | 페이지>0 이면 항상 `refetch:false` | **계층 모드에서는 `refetch:true`** | 평면은 0페이지로 키가 바뀌며 조회가 나가지만, **계층의 골격 키는 페이지와 무관하게 그대로**라 stale 표시만으로는 갱신되지 않는다(옛 계층이 남는다). 평면 경로의 동작은 그대로 |
| 6 | `orphanHint` | §6 에 키 열거 | 키만 추가, 미소비 | §4 참조. 배치 자리를 지정한 계약이 없고, 행 단위 아이콘은 과설계 |

**설계 그대로 지킨 것(변경 없음):** `INITIAL_EXPAND='all'` 상수 1곳 / 커서 아닌 오프셋 슬라이싱 / `key IN` 에 필터 재적용 금지 / 청크 50·동시성 3 / `isLast` 우선 종료 / `MAX_DETAIL_KEYS=500` 꼬리 절단 / 접기 시 서브트리 선택 해제 / 부모 체크→자식 자동 선택 없음 / 계층 정렬·DnD·localStorage·하위 N건 배지 없음 / `CursorPagingTable`·`TableSurface` 무변경.

### F3(렌더 분해) — 셀 JSX 이동 검증

`useIssueRowFactory.jsx` 의 9개 셀 중 **바뀐 것은 `issueKey` 하나뿐**이다.
```jsx
{key: 'issueKey', content: hierarchy
    ? <HierarchyToggleCell {...hierarchy}>{issueKeyCell}</HierarchyToggleCell>
    : issueKeyCell}
```
나머지 8개(체크박스·요약·상태·담당자·협업자·시작일·기한·MD·처리율)는 cut & paste 그대로다.
`InlineEdit`/`useRef` 패턴, `ensureJiraPermission` 사전 체크(assign/edit/schedule), `buildTimetrackingPayload` 호출,
`isTimeTrackingUnsupportedError` 분기, 토스트 문구 키 — 전부 무변경.
편집 경로에서 사라진 것은 `index` 인자뿐이고, `searchByIssueId(id)` 가 `patchIssue(result, map)` 를 부른다(Q2 승인분).

---

## 7. 남은 위험 · 미검증 항목

**실제 Jira 데이터로만 확인 가능 (E2E 미수행):**
1. **`fields: ['parent']` 응답 형태.** 회사 관리형/팀 관리형, 에픽·스토리·하위이슈 전 구간에서 `fields.parent.key` 가 실제로 오는지. 안 오면 전부 루트 = 평면과 같은 화면(fail-soft)이라 **깨지지는 않지만 기능이 무력화**된다. 배포 후 최우선 확인 대상.
2. **`/search/jql` 의 `isLast` 필드 존재 여부.** 없으면 `nextPageToken` 기반 종료로 자동 폴백되지만, 그때 "정확히 상한에 걸린 완결 검색"이 `truncated` 로 오경고될 수 있다.
3. **펼침/접기 시 네트워크 0회.** 코드상 렌더 필터링뿐이지만 devtools 로 실측 필요(설계서 §10 F5 수동 시나리오 ③).
4. **큰 그룹(2000건 초과)에서 골격 절단 배너.** 상한 로직은 유닛테스트로 고정했으나 실제 절단 상황은 미재현.
5. `key IN` 청크의 `nextPageToken` 추적(최대 2회) 경로 — 50키에 50 결과라 정상적으로는 도달하지 않는다.

**코드상 알려진 트레이드오프:**
6. `groupHierarchyPage` 쿼리키에 최대 500개 문자열 배열이 들어간다 → React Query 가 렌더마다 해시한다. 설계서 §4-1 이 의도적으로 택한 비용(옛 목록 박제 방지)이며 실측은 안 했다.
7. 계층 모드에서 **1페이지 → 0페이지로 되돌아올 때** 스켈레톤 대신 직전 행이 유지된다(`placeholderData`). 평면은 0페이지에서 스켈레톤을 띄운다. 설계서 §4-3 의 `isLoading` 공식을 그대로 따른 결과이고, `staleTime 60s` 라 실제로는 캐시 히트로 재조회가 없어 눈에 띄지 않을 것으로 본다.
8. 계층 모드의 모집단 상한은 **그룹당 2000건**이다(평면은 커서 페이징이라 상한 없음). 같은 카드에서 모드를 바꾸면 2000건 초과 그룹에서 보이는 이슈 집합이 달라진다 — 설계서 §9 참고 항목에 통지된 내용.

**동시 작업 리스크:**
9. 워킹트리에 RFC-199(이슈 타입 필터 + 상태 Lozenge 통일) 변경이 함께 들어 있다. 두 작업이 같은 파일 4개(`useWorkListQueries.js`, `workListQuery.js`, `ProjectIssuePanel.jsx`, `useIssueRowFactory.jsx`)를 건드렸으므로, 커밋 분리가 필요하면 리더가 판단할 것. **양쪽 변경 모두 보존한 상태에서 테스트 1801건 + 빌드가 통과한다.**
