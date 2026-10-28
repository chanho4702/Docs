# 작업관리 목록 뷰 — Jira 계층 펼치기 설계서

작성: 2026-09-07 / feature-architect
슬러그: `work-list-hierarchy`
입력: `_workspace/work-list-hierarchy/00_input/requirement.md`

---

## 0. 리더 확인 결론 (먼저 읽을 것)

> **신규 resolver·PermissionMap 변경은 없다. 백엔드 0줄, DB 0줄.**
> 목록 뷰는 프론트에서 `@forge/bridge requestJira`(`executeRequest('searchIssueWithJQL')`)로 Jira REST 를 직접 호출하고,
> 편집 경로가 쓰는 resolver(`updateGanttSchedule`·`updateIssueCoworkers`·`deleteProjectIssue`)는 **이미 등록·매핑돼 있는 것을 그대로 재사용**한다.
> 새로 부르는 서버 함수가 없으므로 `src/permission/PermissionMap.js` 도 손대지 않는다. 백엔드 단계를 돌릴 필요가 없다.

> **단, 리더의 §4 제안(요약 쿼리에 `parent` 를 얹어 골격을 공짜로 얻기)은 채택하지 않았다.**
> 이유는 §3-1 에 전부 적었다(요약은 프로젝트 전역 2000건 캡 + 평면 모드가 항상 지불하는 페이로드 + 무효화 경계 불일치).
> 대신 **그룹 단위 전용 골격 쿼리**를 둔다. 추가 네트워크는 "계층 모드로 카드를 펼칠 때 1~4회"다.

> **열린 질문 2건은 §9 에 모았다.** 특히 **초기 펼침 기본값**은 사용자 원문과 설계 효율이 서로 다른 답을 가리켜 리더 판단이 필요하다.

---

## 1. 개요 / 영향 범위

| 축 | 내용 |
|---|---|
| **백엔드** | **변경 없음.** resolver·Service·PermissionMap·`src/index.js` 전부 무변경 |
| **DB** | **변경 없음.** MySQL 테이블·KVS 엔티티·manifest attributes 무변경 |
| **프론트** | `pages/projectDetail/issue/` 안에서만 작업. 신규 파일 6개 + 수정 3개. **`ProjectIssuePanel.jsx`·`ProjectGroupCard.jsx` 는 무변경**(토글이 테이블 내부에 있으므로 props 계약이 그대로다) |
| **쿼리키** | `utils/queryKey/projectKeys.js` 의 `workListKeys` 에 2개 추가(`groupSkeleton`, `groupHierarchyPage`) |
| **i18n** | `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` 에 `projectDetail.issue.viewMode.*` / `projectDetail.issue.hierarchy.*` 추가 후 `cd static/ui && npm run merge` |
| **테스트** | 신규 `issue/workListTree.test.js`. 기존 `workListQuery.test.js`·`queryKeyContract.test.js` 는 깨지지 않아야 한다 |

### 1-1. 화면 구조 (변경 후)

```
ProjectIssuePanel.jsx                       (무변경)
  └ ProjectGroupCard.jsx                    (무변경)
      └ ProjectIssueTable.jsx               ★ 셸로 축소 (773줄 → ~230줄)
          ├ WorkListModeToggle.jsx          ★ 신규 [계층|평면]
          ├ useWorkListFlatPage.js          ★ 신규 (기존 평면 로직 **그대로 이동**)
          ├ useWorkListHierarchy.js         ★ 신규 (골격 + 상세 + 트리 + 슬라이싱)
          ├ useIssueRowFactory.jsx          ★ 신규 (head + createRow + 인라인 편집 5종 — 이동)
          │   └ HierarchyToggleCell.jsx     ★ 신규 (들여쓰기 + chevron, 이슈키 셀에만 주입)
          └ components/table/CursorPagingTable   (무변경)
```

---

## 2. 경계면 계약 (이 설계의 심장)

resolver 가 없으므로 계약의 축은 **① Jira REST 응답 → ② 순수 함수 → ③ 훅 반환 shape → ④ 테이블 props** 4단이다.
**두 모드가 ③에서 같은 shape 으로 수렴**하는 것이 이 설계의 핵심이다 — 셸이 모드를 분기하는 지점을 한 곳(어느 훅을 부르는가)으로 줄인다.

### ① Jira REST 계약 (`executeRequest('searchIssueWithJQL', body)` → `POST /rest/api/3/search/jql`)

| 용도 | 요청 body | 응답에서 읽는 것 |
|---|---|---|
| **골격** (신규) | `{ jql: buildGroupJql(projectId, groupKey, filter), fields: ['parent'], fieldsByKeys: true, maxResults: 500, nextPageToken? }` | `{ issues: [{ id, key, fields: { parent?: { key } } }], nextPageToken, isLast }` |
| **상세** (신규) | `{ jql: buildKeyInJql(chunk), fields: ['*all'], properties: ['movesRms'], fieldsByKeys: true, maxResults: 50 }` | `{ issues: [ …평면 페이지와 **완전히 같은 issue 객체** ], nextPageToken, isLast }` |
| **평면 페이지** (기존, 무변경) | `{ jql: buildGroupJql(...), fields: ['*all'], properties: ['movesRms'], fieldsByKeys: true, maxResults: pageSize, nextPageToken? }` | `{ issues, nextPageToken }` |

계약 주의:
- `/search/jql` 응답에는 **`total` 이 없다**(`worklogExport/utils/searchIssues.js` 주석 참조). 루트 개수를 알 방법은 골격 전량 조회뿐이다 — 오프셋 페이징의 전제.
- 루프 종료 조건은 `isLast === true || !nextPageToken || pageItems.length === 0` 순으로 본다. **`isLast` 를 상한 판정보다 먼저 본다**(worklogExport 가 밟은 "정확히 캡에 걸린 완결 검색을 truncated 로 오경고" 결함 회피).
- `executeRequest` 는 실패 시 **throw 하지 않고 `{success:false}` 를 반환**한다 → 호출부가 명시 검사 후 `throw` 로 승격해야 React Query 가 에러 상태로 인지한다.
- `fields.parent` 는 Jira Cloud 의 통합 Parent 필드다(에픽→스토리→하위이슈 전 구간). **없으면 `parentKey = null` 로 읽어 루트로 취급** — 사이트 구성 차이로 계층이 안 잡혀도 화면은 평면처럼 정상 동작한다(fail-soft, 크래시 없음).

### ② 순수 함수 계약 (`issue/workListTree.js` — 신규, 네트워크·React 의존 0)

| 함수 | 입력 | 출력 |
|---|---|---|
| `toSkeletonRows(jiraIssues)` | Jira 골격 issue[] | `[{ key, parentKey }]` — `fields.parent.key` 없으면 `parentKey: null` |
| `buildIssueHierarchy(rows)` | `[{key,parentKey}]` | `{ roots: Node[], byKey: Map<key, Node> }`, `Node = { key, parentKey, children: Node[] }` |
| `flattenHierarchy(roots, expandedKeys)` | 루트 배열 + `Set<key>` | `[{ key, depth, hasChildren, isExpanded }]` — 접힌 서브트리는 **행을 만들지 않는다** |
| `collectPageKeys(roots, pageIndex, pageSize, maxKeys)` | | `{ pageKeys: string[](DFS 순), rootCount, hasNext, truncated }` |
| `collectSubtreeKeys(node)` | Node | `string[]` (자기 자신 제외한 자손 전부) |
| `orderIssuesByKeys(issues, orderedKeys)` | 상세 issue[] + 순서 | 순서대로 재배열된 issue[] (`orderedKeys` 에 없는 건 버리고, 상세가 없는 키는 건너뛴다) |
| `chunkKeys(keys, size)` | | `string[][]` |
| `buildKeyInJql(keys)` | | `key IN ("A-1","A-2",…)` |
| `replaceIssueByKey(issues, nextIssue)` | | 같은 key 를 가진 원소만 교체한 새 배열 (없으면 **원본 참조 그대로 반환**) |

**계층 규칙 (이 문서가 단일 출처, `buildWorkTree` 와 규칙을 공유하되 코드는 공유하지 않는다):**
1. `parentKey` 가 없거나 **조회 집합(= 필터 통과 + 이 프로젝트 편입) 안에 없으면 루트로 승격.** 자식이 통째로 사라지지 않게 하는 규칙 — 트리 뷰(`buildWorkTree`)와 동일 판단이다.
2. 형제 순서 = **Jira 응답 순서 유지**(골격 조회 순서). `buildWorkTree` 의 "폴더 우선" 규칙은 여기 없다 — **폴더는 앱 계층 축이고 이번은 Jira parent 축이다. 섞지 않는다.**
3. 자기 자신이 부모인 경우, 순환(A→B→A)은 방문 집합으로 끊고 두 번째 등장 노드를 루트로 승격한다(Jira 가 만들 수 없는 상태지만 방어).

### ③ 훅 반환 shape — **두 모드 공통 뷰모델 (가장 중요한 계약)**

`useWorkListFlatPage(...)` 와 `useWorkListHierarchy(...)` 는 **같은 필드 집합**을 돌려준다. 셸은 이것만 본다.

```js
{
  // ── 데이터 ──
  visibleIssues: Issue[],      // 화면에 렌더할 Jira issue 객체(접힘 반영). 평면 = 페이지 전체
  userMap: { [accountId]: user },
  rowMeta: Map<issueKey, { depth, hasChildren, isExpanded }> | null,  // 평면은 null
  // ── 페이징 ──
  currentPageIndex: number,
  currentCount: number,        // ★ footer 산술의 단위 = "이 페이지의 **루트** 수"(평면은 행 수)
  hasNext: boolean,
  hasPrev: boolean,
  onNext(): void,
  onPrev(): void,
  // ── 상태 ──
  isLoading: boolean,          // 0페이지 최초 로드 → 테이블 스켈레톤
  isLoadingMore: boolean,      // 그 외 페이지 전환 → 다음/이전 버튼 스피너
  truncated: boolean,          // 상한 절단 안내 배너
  // ── 캐시 패치 앵커 ──
  patchQueryKey: QueryKey,     // 단건 편집·일괄 적용·일괄 제외가 setQueryData 할 대상 키
  // ── 계층 전용(평면은 undefined) ──
  expandedKeys?: Set<string>,
  toggleExpand?: (issueKey) => void,   // 접을 때 subtreeKeys 를 셸에 통지 → 선택 해제
  expandAll?: () => void,
  collapseAll?: () => void,
}
```

**`patchQueryKey` 가 가리키는 캐시 객체의 shape 은 두 모드가 동일해야 한다:**

```js
{ issues: Issue[], userMap: {...}, nextPageToken?: string|null }
```

이 동형성 덕분에 **기존 캐시 패치 유틸 3종이 계층 모드에서 코드 변경 없이 그대로 동작한다**:
`applyIssuePatches(old.issues, appliedByKey)`(일괄 적용) · `markIssuesDeleted(old.issues, keys)`(일괄 제외) · 신규 `replaceIssueByKey`(단건 편집). 셋 다 **이미 issueKey 기반**이다.

### ④ 테이블 컴포넌트 props — `CursorPagingTable` 은 **무변경으로 그대로 쓸 수 있다**

| prop | 평면 | 계층 |
|---|---|---|
| `head` / `rows` | 동일 (`useIssueRowFactory` 산출) | 동일 |
| `pageSize` / `onPageSizeChange` | 10·20·50 (이슈 수) | 10·20·50 (**루트 수**) |
| `currentPageIndex` | 커서 히스토리 인덱스 | 오프셋 인덱스 |
| `currentCount` | 이 페이지 행 수 | **이 페이지 루트 수** ← §4-2 참조 |
| `hasNext` | `!!nextPageToken` | `(pageIndex+1)*pageSize < rootCount` |
| `hasPrev` / `onPrev` / `onNext` / `isLoadingMore` / `isLoading` / `emptyView` | 동일 | 동일 |

→ **`CursorPagingTable`·`TableSurface` 는 한 줄도 고치지 않는다.** 펼침 chevron 은 셀 content 안에 들어가므로 표 컴포넌트가 계층을 알 필요가 없다.

---

## 3. §4 필수 답변 — 설계 결정 10건

### 3-1. Q1. 계층 골격 조회 전략 → **그룹 단위 전용 골격 쿼리를 신설한다** (요약 재사용 기각)

**리더 제안(요약에 `parent` 추가)은 성립하지 않는다.** 네 가지 이유:

1. **캡의 축이 다르다 (치명).** `fetchWorkListSummary` 는 `MAX_ISSUES 2000` / `MAX_PAGES 20` 을 **프로젝트 전역**에 건다. 그룹이 5개고 각 600건이면 뒤쪽 그룹은 골격이 **통째로 또는 부분만** 수집된다 → 그 그룹의 계층이 조용히 잘린다. 반면 평면 모드는 커서 페이징이라 2000건 너머까지 넘어간다. 즉 **같은 카드에서 모드만 바꿨는데 보이는 이슈 모집단이 달라진다.** 그룹 단위 골격이면 캡이 그룹당 2000이라 이 괴리가 거의 사라지고, 걸리더라도 그 그룹 안에서 일관된다.
2. **평면 모드 불변 제약 위반.** `SUMMARY_FIELDS` 에 `parent` 를 넣으면 계층을 한 번도 안 쓰는 사용자도 요약 응답 페이로드 증가를 **항상** 지불한다(`parent` 는 `{id,key,self,fields:{summary,status,priority,issuetype}}` 로 얇지 않다). 요약은 카드 목록을 그리려고 **무조건 1회 도는** 쿼리다. 제약 §5 "평면 모드의 동작·**성능**·캐시가 하나도 바뀌면 안 된다"에 정면으로 걸린다.
3. **무효화 경계 불일치.** 요약 키는 `['projectWorkList', pid, 'summary', filter]` 로 `groupAll(pid, groupKey)` prefix **밖**이다. 지금 `refreshSignal` 경로는 `invalidateGroup(groupKey)` 만 부르므로 골격이 요약 안에 있으면 **갱신되지 않는다**. 반대로 골격을 `groupAll` prefix 아래 두면 **기존 무효화 코드가 그대로 골격까지 갱신한다**(추가 코드 0줄).
4. **메모리.** 골격을 요약 캐시에 남기려면 `{groups, truncated}` 에 원본 issue 배열(최대 2000)을 얹어야 하고, 그 캐시는 gcTime 5분 동안 계층을 안 써도 살아 있다.

**채택안:**

```
workListKeys.groupSkeleton(projectId, groupKey, filter)
  = ['projectWorkList', projectId, 'group', groupKey, 'skeleton', filter]
```

- JQL 은 **평면 페이지와 완전히 같은 `buildGroupJql(projectId, groupKey, filter)`** — 모집단이 갈라질 여지를 없앤다.
- `fields: ['parent']`, `maxResults: 500`(경량 필드 전례: `getJqlIssue.getMyIssuePeriods` 가 6필드에 500 사용), `MAX_SKELETON_PAGES = 8`, `MAX_SKELETON_ISSUES = 2000`.
- 비용: 500건 이하 그룹 = **요청 1회**. 2000건 = 4회. 계층 모드로 카드를 펼칠 때만, 그리고 `staleTime 60s` + `groupAll` prefix 무효화로 페이지 이동·펼침·모드 왕복에서는 재조회 0회.
- `groupAll` prefix 아래 있으므로 기존 `invalidateGroup(groupKey)`(refreshSignal / 이슈 추가)가 **수정 없이** 골격을 함께 무효화한다.

**버린 대안 3안:**
- (A) 요약 재사용 — 위 4가지 이유로 기각.
- (B) 골격 없이 `ORDER BY parent` + 커서 페이징으로 부모·자식을 붙여 받기 — `/search/jql` 은 `total` 이 없고 부모가 다른 페이지 끝에 걸리는 경계를 통제할 수 없다. 페이지 경계에서 계층이 끊긴다.
- (C) 상세 조회를 `parent IN (이 페이지 루트들)` 로 재귀 확장 — 깊이만큼 왕복이 늘고(에픽→작업→하위이슈 = 3회), 깊이를 모르므로 종료 조건이 없다.

### 3-2. Q2. 페이지 정의 · 페이징 방식

- **계층 모드의 pageSize N = "최상위(루트) 이슈 N개"** 이고, 그 N개 서브트리에 속한 **자손은 전부 같은 페이지에 들어온다.** 서브트리는 절대 페이지를 가로질러 쪼개지지 않는다(쪼개면 부모 없는 자식이 다음 페이지 최상단에 뜬다).
- **커서(nextPageToken)를 쓰지 않는다.** 골격이 전량 있으므로 **오프셋 슬라이싱**이 가능하다: `roots.slice(pageIndex*pageSize, (pageIndex+1)*pageSize)` → DFS 로 자손 키 수집 → `pageKeys`.
  - 얻는 것: 임의 페이지 점프 가능, `hasNext` 를 응답 없이 즉시 판정, 뒤로 가기가 재조회 없이 캐시 히트.
  - `cursorHistory`/`advanceCursorHistory` 는 **평면 전용으로 남는다**(계층에서 쓰지 않는다).
- `CursorPagingTable` props 는 §2-④ 대로 **그대로 쓸 수 있다.** 유일한 판단은 `currentCount` 의 의미다:
  - **`currentCount = 이 페이지의 루트 수`** 로 넘긴다. footer 는 `start = pageIndex*pageSize+1`, `end = pageIndex*pageSize + currentCount` 를 계산하므로, 루트 수를 주어야 페이지 간 번호가 **연속·비중복**이 된다. 렌더 행 수(자손 포함)를 주면 2페이지 `21~78` 처럼 구간이 겹쳐 읽힌다.
  - 대신 표 상단 툴바에 보조 문구를 둔다: `projectDetail.issue.hierarchy.rowHint` = "상위 {roots}건 · 표시 {rows}행" (`tFormat`).
- 상세 키 상한 `MAX_DETAIL_KEYS = 500`. 초과하면 마지막 루트의 자손 꼬리를 잘라내고 `truncated: true` → 배너. (루트 20개에 자손이 500개 넘는 구성은 드물지만, 한 에픽에 하위 800개가 달린 프로젝트가 실제로 있다.)

### 3-3. Q3. 상세 조회 JQL · 청크 · 순서

- JQL = `key IN ("PRJ-1","PRJ-2",…)` **만.** `moves_RMS_projectId` 나 사용자 필터를 다시 AND 하지 않는다.
  - 이유: 키 자체가 이미 "필터를 통과한 편입 이슈"의 집합에서 나왔다. 다시 걸면 그 60초 사이 편입이 해제된 이슈가 **상세만 사라지고 골격에는 남아** 부모 없는 자식 행이 생긴다. 재적용의 이득(60초 최신성)보다 계층 파손 위험이 크다. 편입 해제는 골격 재조회 시점에 정리된다.
- **청크 크기 50, 동시성 3** (`utils/useJiraUserInfos.mapWithConcurrency` 재사용 — `BULK_APPLY_CONCURRENCY` 와 같은 값·같은 유틸).
  - 50인 이유: 평면 모드의 최대 페이지(50건 × `fields:*all` + `properties`)와 **응답 1건당 부피를 같게** 맞춘다. 이미 검증된 크기다.
  - 루트 20 + 자손 → 보통 1~3청크. 500키 상한 = 10청크(동시성 3 → 4웨이브).
  - 청크 내부에서도 `maxResults: 50` 응답이 부족하면 `nextPageToken` 을 **최대 2회** 따라간다(방어).
- **순서 재배열:** `key IN` 결과 순서는 보장되지 않고 청크가 병렬이라 도착 순서도 무의미하다. 전 청크를 합친 뒤 `orderIssuesByKeys(issues, pageKeys)` 로 **DFS 트리 순서**로 재배열한다. 이 배열이 그대로 캐시의 `issues` 가 되고, 캐시 순서 = 렌더 순서 = 트리 순서로 일치한다.
- 실패 처리: 청크 하나라도 `{success:false}` 면 **쿼리 전체를 throw** 한다(부분 트리를 그리면 사용자는 "이슈가 사라졌다"로 읽는다).

### 3-4. Q4. 필터 × 계층

- **골격 조회는 상세·평면과 완전히 같은 필터를 받는다** (`buildGroupJql` 재사용). 필터별로 다른 골격 캐시 엔트리가 생긴다(키에 `filter` 포함).
- **부모가 필터에 걸러지면 자식은 루트로 승격**한다(§2-② 규칙 1). "부모를 보여주기 위해 필터 밖 이슈를 끌어오는" 보정은 **하지 않는다** — D2("보이는 행 = 편입·편집 가능한 행")를 깨고, 필터 결과에 필터 밖 행이 섞이면 일괄 적용 대상 판정이 흐려진다.
- 필터가 바뀌면 골격·상세 키가 함께 바뀌므로 재조회는 자동이고, 셸의 `resetSig` 가 페이지·선택·펼침을 초기화한다.

### 3-5. Q5. 행 단위 캐시 패치 → **두 모드 모두 issueKey 기반으로 통일한다**

현재 단건 편집은 `patchGroupPage(queryKey, old => old.issues[index] 교체)` 로 **인덱스 기반**이다. 계층에서는 렌더 행(접힘 반영 subset)의 인덱스와 캐시 `issues` 의 인덱스가 어긋나므로 그대로 쓸 수 없다.

**결정: `replaceIssueByKey(issues, nextIssue)` 로 통일한다. 모드별로 나누지 않는다.**

근거:
1. **모드마다 패치 규칙이 다르면 조용히 어긋난다**(리더 의견에 동의). 인라인 편집은 한 `createRow` 를 공유하는데 패치만 갈리면, 한쪽에서만 고쳐지는 사고가 정확히 여기서 난다.
2. **이 코드베이스는 이미 키 기반으로 이동해 왔다.** `markIssuesDeleted`·`applyIssuePatches` 가 전부 `issue.key` 로 찾는다. 그 주석이 이유까지 적어 뒀다 — *"백그라운드 재조회로 행 순서가 달라져도 다른 행에 표식이 붙지 않는다."* 단건 편집만 인덱스로 남아 있는 것이 오히려 예외다.
3. **키 기반이 더 정확하다.** 지금 `searchByIssueId(issueId, index)` 는 assignee·coworker 경로에서 **숫자 id**를, 날짜·MD 경로에서 **이슈 키**를 넘긴다(둘이 섞여 있다). 키 기반은 `result.key`(응답의 권위 있는 값)로 찾으므로 인자가 무엇이든 정확하다.
4. **평면 모드의 관측 가능한 동작은 바뀌지 않는다.** 캐시 shape 불변, 요청 횟수 불변, 갱신 결과 불변. 유일한 차이는 "캐시에 그 키가 없으면 아무것도 안 한다"인데, 인덱스 기반에서는 그 상황이 **엉뚱한 행을 덮어쓰는** 결함이었다.

구현:
```js
// useWorkListQueries.js 에 추가 (기존 patchGroupPage 는 남긴다 — 일괄 경로가 쓴다)
patchIssueByKey: (queryKey, nextIssue, userMapDelta = {}) =>
  queryClient.setQueryData(queryKey, (old) => {
    if (!old?.issues || !nextIssue?.key) return old;
    const issues = replaceIssueByKey(old.issues, nextIssue);
    if (issues === old.issues) return old;            // 못 찾으면 참조 그대로 → 리렌더 없음
    return { ...old, issues, userMap: { ...old.userMap, ...userMapDelta } };
  })
```
→ `createRow` 의 모든 편집 경로가 `index` 인자를 버리고 `patchIssue(result, map)` 하나만 부른다. **`createRow` 시그니처에서 `index` 가 사라지는 것이 이 결정의 부수 효과이자 이득이다**(§3-8 의 공유 목표와 맞물린다).

### 3-6. Q6. 선택 / 일괄 적용

**규칙: 체크박스 대상 = "현재 페이지에 실제로 렌더된 행"(= 펼쳐진 행)만.** 접힌 자식은 선택 대상이 아니다.

- `selectableIssues = visibleIssues.filter(i => !i.__deleted && i.key)` — 평면과 **같은 한 줄**이다. 계층에서는 `visibleIssues` 가 이미 접힘을 반영한 목록이라 자동으로 규칙이 성립한다.
- 머리글 전체선택 = 보이는 행 전체 / 해제 = 보이는 행 전체.
- **접기 시 그 서브트리의 선택을 즉시 해제한다.** `toggleExpand(key)` 가 접힘일 때 `collectSubtreeKeys(node)` 를 셸에 넘기고 셸이 `selectedKeys` 에서 뺀다.
  - 이 규칙이 있으면 "보이지 않는 대상이 일괄 적용에 들어가는 상황"이 **구조적으로 발생할 수 없다**(선택 집합 ⊆ 보이는 행 집합이 항상 참). 모달의 "대상 N건"과 화면이 어긋나지 않는다.
  - 대안(접힌 자식의 선택을 유지하고 모달에서 "숨겨진 M건 포함" 경고)은 기각: 경고를 읽지 않는 사용자에게 그대로 사고가 된다.
- 페이지 이동 시 선택 전체 해제 — **기존 평면과 동일**(`handlePrev`/`handleNext` 의 `clearSelection`).
- 필터·pageSize·그룹·프로젝트 변경 시 해제 — 기존 `resetSig` 블록 그대로.
- **부모 체크 시 자식 자동 선택은 넣지 않는다** (요청 밖, 제약 §5). 부모만 골라 일정을 밀고 싶은 사용자가 자식까지 밀려 버리면 되돌릴 수 없다.
- `bulkTargets` / `bulkDeleteTargets` 산출식은 **평면과 문자 그대로 동일**(입력이 `issues` → `visibleIssues` 로 바뀔 뿐).

### 3-7. Q7. 펼침 상태의 기본값과 보존

| 항목 | 규칙 |
|---|---|
| 초기 펼침 범위 | **전부 펼침 (권장, §9-Q1 에서 리더 확인 필요)** — 상수 `INITIAL_EXPAND = 'all' \| 'none'` 한 곳으로 뺀다 |
| 페이지 이동 | **유지.** 다른 페이지의 루트는 집합에 없으므로 자연히 접힌 상태이고, 뒤로 돌아왔을 때 맥락이 남는다 |
| 모드 전환 (계층↔평면↔계층) | **유지** (같은 그룹·같은 필터라면) |
| 필터 / pageSize / 그룹 / project_id 변경 | **초기화** — `resetSig` 에 동참 |
| `refreshSignal`(이슈 추가) | **초기화** (골격이 바뀌므로 옛 키 집합을 들고 있을 이유가 없다) |
| 저장 위치 | `useWorkListHierarchy` 내부 `useState(Set<issueKey>)`. localStorage·URL 동기화는 **하지 않는다**(요청 밖) |
| 전체 펼치기 / 접기 버튼 | **넣는다.** 루트 20개를 하나씩 여는 것은 평범한 사용에서 즉시 만나는 불편이고, 트리 뷰에 이미 `work.tree.expandAll`/`collapseAll` 전례가 있다 |

> 기본값 논쟁: 사용자 원문("에픽에서 펼치기를 누르면 작업이 나오고")은 **접힘 기본**을 시사한다. 반면 설계상 **우리는 어차피 그 페이지의 서브트리 상세를 전부 받아 둔다**(펼침 네트워크 0회 제약 때문). 받아 놓고 감추면 (a) 완료기준 4(계층 없는 프로젝트 = 평면과 같은 화면)를 위해 별도 분기가 필요하고, (b) 20개 에픽만 남은 화면에서 "이슈가 사라졌다" 오해가 난다. → **권장은 전부 펼침**, 최종 판단은 §9-Q1.

### 3-8. Q8. 컴포넌트 분해 (`createRow` 를 두 모드가 **공유**하는 것이 목표)

| 파일 | 신규/수정 | 책임 | 예상 |
|---|---|---|---|
| `issue/ProjectIssueTable.jsx` | 수정 (773 → **~230줄**) | 셸: 모드 토글 · 선택 상태 · 일괄 액션 바/모달 2종 · 뷰모델을 rows 로 매핑 · `CursorPagingTable` 렌더 | ~230 |
| `issue/useIssueRowFactory.jsx` | **신규(이동)** | `head` + `createRow` + 인라인 편집 5종(assignee·coworker·start·due·MD) + `searchByIssueId` + Jira 권한 사전 체크. **현행 코드를 그대로 옮긴다** | ~400 |
| `issue/HierarchyToggleCell.jsx` | **신규** | 이슈키 셀 래퍼: `depth` 들여쓰기 + chevron 버튼(또는 자리맞춤 spacer). 계층에서만 주입 | ~60 |
| `issue/useWorkListFlatPage.js` | **신규(이동)** | 커서 히스토리 · `useWorkListGroupPage` · `advanceCursorHistory` effect → 공통 뷰모델. **로직 무변경 이동** | ~90 |
| `issue/useWorkListHierarchy.js` | **신규** | 골격 쿼리 + 페이지 슬라이싱 + 상세 쿼리 + 펼침 상태 → 공통 뷰모델 | ~190 |
| `issue/workListTree.js` | **신규** | §2-② 순수 함수 전체 | ~170 |
| `issue/workListTree.test.js` | **신규** | §3-9 | ~230 |
| `issue/WorkListModeToggle.jsx` | **신규** | `[계층 \| 평면]` — `components/chart/ViewToggleButtons.jsx` 의 `ToggleBtn` 재사용 | ~35 |
| `issue/useWorkListQueries.js` | 수정 | `fetchWorkListSkeleton` · `fetchWorkListDetailByKeys` · `useWorkListSkeleton` · `useWorkListDetail` · `patchIssueByKey` 추가. **기존 함수 5개는 무변경** | +90 |
| `utils/queryKey/projectKeys.js` | 수정 | `workListKeys.groupSkeleton` · `groupHierarchyPage` 추가 | +8 |

**`createRow` 공유 방식 (복제 금지의 핵심):**

```js
// useIssueRowFactory.jsx
createRow(issue, { coworkerMap, hierarchy })
//   hierarchy = null                                            → 평면 (현재와 동일한 셀 출력)
//   hierarchy = { depth, hasChildren, isExpanded, onToggle }     → 계층
```
`hierarchy` 는 **`issueKey` 셀 하나에서만** 소비된다:
```js
{ key: 'issueKey', content: hierarchy
    ? <HierarchyToggleCell {...hierarchy}><IssueComponent .../></HierarchyToggleCell>
    : <IssueComponent .../> }
```
나머지 8개 셀(체크박스·요약·상태·담당자·협업자·시작일·기한·MD·처리율)은 **문자 그대로 손대지 않는다.** → 인라인 편집이 한쪽에서만 고쳐지는 사고가 구조적으로 불가능하다.

들여쓰기는 `Math.min(depth, 5) * 14px` 로 클램프한다 — `TableSurface` 가 첫 실데이터 페인트에서 컬럼 폭을 동결하므로, 깊이가 깊어져도 키 컬럼이 넘치지 않게.

### 3-9. Q9. 순수 함수 유닛테스트 — `issue/workListTree.test.js`

| describe | 케이스 |
|---|---|
| `toSkeletonRows` | ① `fields.parent.key` 추출 ② `parent` 없으면 `parentKey:null` ③ `fields` 자체가 없어도 크래시 없음 |
| `buildIssueHierarchy` | ① 에픽→작업→하위이슈 3단 조립 ② **부모가 집합에 없으면 루트로 승격**(고아 유실 방지) ③ 형제는 입력 순서 유지 ④ 자기참조/순환은 끊고 루트 승격 ⑤ 빈 입력 → `{roots:[], byKey:비어있음}` |
| `flattenHierarchy` | ① 전부 펼침 = DFS 전량 ② **접힌 서브트리는 행이 생기지 않는다** ③ `depth`·`hasChildren`·`isExpanded` 값 ④ 부모가 접혀 있으면 손자도 안 나온다(중첩 접힘) |
| `collectPageKeys` | ① pageIndex 0/1 슬라이싱이 **루트 기준**임 ② **서브트리가 페이지를 가로질러 쪼개지지 않음** ③ `hasNext` 경계(마지막 페이지 false) ④ `maxKeys` 초과 시 잘리고 `truncated:true` ⑤ 루트가 pageSize 보다 적을 때 |
| `orderIssuesByKeys` | ① `key IN` 도착 순서를 트리 순서로 재배열 ② `orderedKeys` 에 없는 이슈는 버린다 ③ **상세가 없는 키는 건너뛴다**(빈 구멍을 만들지 않는다) |
| `chunkKeys` / `buildKeyInJql` | ① 50 단위 분할 ② 나머지 청크 ③ 빈 배열 → `[]` ④ JQL 따옴표·콤마 조립 |
| `collectSubtreeKeys` | ① 자손 전부(자기 제외) ② leaf → `[]` — **접기 시 선택 해제 규칙의 근거** |
| `replaceIssueByKey` | ① 같은 key 만 교체 ② **없으면 원본 참조 그대로 반환**(리렌더 방지) ③ `__deleted` 행 보존 ④ 순서 불변 |
| 쿼리키 계약 | ① `groupSkeleton`·`groupHierarchyPage` 가 `groupAll(pid,gk)` **prefix 하위**임(기존 `invalidateGroup` 이 그대로 먹는지) ② 같은 필터 서명 → 같은 `hashKey` |

기존 `workListQuery.test.js` 는 **손대지 않는다**(평면 회귀 가드).

### 3-10. Q10. i18n 신규 키 — §6

---

## 4. 프론트엔드 상세 설계

### 4-1. 쿼리키 추가 (`utils/queryKey/projectKeys.js`)

```js
export const workListKeys = {
    // …기존 6개 무변경…
    // 계층 골격 — groupAll(pid,gk) prefix 하위라 기존 invalidateGroup 이 그대로 무효화한다
    groupSkeleton: (projectId, groupKey, filter) =>
        ['projectWorkList', projectId, 'group', groupKey, 'skeleton', filter],
    // 계층 상세 — pageKeys 를 키에 넣는다(골격이 바뀌어 이 페이지 키 집합이 달라지면 자동 재조회)
    groupHierarchyPage: (projectId, groupKey, filter, pageIndex, pageKeys) =>
        ['projectWorkList', projectId, 'group', groupKey, 'hierarchy', filter, pageIndex, pageKeys],
};
```

> `pageKeys` 를 키에 넣는 이유: `(pageIndex, pageSize)` 만 넣으면 골격이 갱신돼 페이지의 실제 키 집합이 바뀌어도 **쿼리키가 그대로라 재조회가 안 나간다**(옛 이슈 목록이 박제된다). 키 배열은 최대 500개 문자열이라 `hashKey` 비용은 무시할 수준이고, 디버깅 시 무엇을 조회했는지가 키에 그대로 보인다.

### 4-2. `useWorkListQueries.js` 추가분 (기존 함수 5개는 무변경)

```js
export const SKELETON_FIELDS = ['parent'];
export const SKELETON_PAGE_SIZE = 500;
export const MAX_SKELETON_PAGES = 8;
export const MAX_SKELETON_ISSUES = 2000;
export const DETAIL_CHUNK_SIZE = 50;
export const DETAIL_CONCURRENCY = 3;      // = BULK_APPLY_CONCURRENCY
export const MAX_DETAIL_KEYS = 500;

fetchWorkListSkeleton({ projectId, groupKey, filter })
  → { rows: [{key, parentKey}], truncated }      // isLast 우선 종료, 상한 절단

fetchWorkListDetailByKeys({ keys })
  → { issues: Issue[](입력 keys 순서), userMap }  // 청크 병렬 → 합치기 → orderIssuesByKeys

useWorkListSkeleton({ projectId, groupKey, filter, enabled })
  → useQuery(groupSkeleton 키, staleTime: WORK_LIST_STALE_TIME)

useWorkListDetail({ projectId, groupKey, filter, pageIndex, pageKeys, enabled })
  → useQuery(groupHierarchyPage 키, staleTime: WORK_LIST_STALE_TIME,
             placeholderData: prev => prev)      // 페이지 전환 중 직전 행 유지(평면과 동일 UX)
```

`useWorkListInvalidator` 에 `patchIssueByKey` 추가(§3-5). `invalidateGroup`·`invalidateSummary`·`patchGroupPage` 는 **무변경**.

### 4-3. `useWorkListHierarchy.js` 흐름

```
skeleton = useWorkListSkeleton(...)                     // 그룹 전량, fields:['parent']
   ↓ toSkeletonRows → buildIssueHierarchy               // useMemo(rows)
{ roots, byKey }
   ↓ collectPageKeys(roots, pageIndex, pageSize, MAX_DETAIL_KEYS)   // useMemo
{ pageKeys, rootCount, hasNext, truncated }
   ↓ useWorkListDetail(..., pageKeys)                   // key IN 청크 병렬
{ issues(트리 순서), userMap }
   ↓ flattenHierarchy(roots, expandedKeys) ∩ issues     // useMemo
visibleIssues + rowMeta
```

- `enabled`: 골격은 `!!projectId && !!groupKey && mode==='hierarchy'`, 상세는 추가로 `pageKeys.length > 0`.
- `isLoading = skeleton.isPending || (detail.isPending && pageIndex === 0)`
- `isLoadingMore = pageIndex > 0 && detail.isFetching && !detail.isPending`
- `truncated = skeleton.truncated || pageSlice.truncated`
- `patchQueryKey = groupHierarchyPage(projectId, groupKey, filter, pageIndex, pageKeys)`
- **`visibleIssues` 는 `issues` 를 필터링해 만든다** — 캐시 `issues` 배열은 언제나 페이지 전량(접힘 무관)이라 §2-③의 shape 동형성이 유지된다.
- `__deleted` 표식 행은 평면과 같이 빈 행으로 렌더한다. 삭제된 부모의 자식은 그대로 남는다(다음 골격 재조회에서 정리) — 평면의 "행을 빼지 않고 표식만 남긴다" 규약과 일관.

### 4-4. `ProjectIssueTable.jsx` (셸) 책임

```jsx
const [mode, setMode] = useState('hierarchy');   // D1: 기본 계층
const flat  = useWorkListFlatPage({ ..., enabled: mode === 'flat' });
const tree  = useWorkListHierarchy({ ..., enabled: mode === 'hierarchy' });
const vm    = mode === 'hierarchy' ? tree : flat;
const { head, createRow } = useIssueRowFactory({ ..., patchIssue });
const rows = vm.visibleIssues.map(issue => issue.__deleted
    ? { keys: null, cells: [] }
    : createRow(issue, { coworkerMap: vm.userMap, hierarchy: vm.rowMeta?.get(issue.key) ?? null }));
```

- 두 훅을 **항상 부르되**(훅 규칙) 비활성 쪽은 `enabled:false` → 네트워크 0. 평면 모드에서 계층 조회가 나가지 않는 것이 제약 준수의 핵심.
- 선택·일괄 모달·`ConfirmModal`·액션 바는 **현행 코드 그대로**. `queryKey` 로 넘기던 값만 `vm.patchQueryKey` 로 교체.
- `resetSig` 에 `mode` 를 **넣지 않는다** — 모드 전환에서 펼침·선택을 날리지 않기 위해. 대신 모드 전환 시 `clearSelection()` 만 명시 호출한다(보이는 행 집합이 달라지므로).
- `refreshSignal` effect: 기존 로직 + `tree.resetExpand()` + `setPageIndex(0)`.

### 4-5. 권한

**변경 없음.** `canEdit`·`canBulkApply`(=`usePermissionStore.canWrite('PROJECT')`)·`useJiraProjectPermissions(groupKey)` 를 현행 그대로 쓴다. 계층은 표현 계층 변경이므로 새 권한 축이 없다. `showSelectColumn = canEdit && canBulkApply` 도 그대로(head/rows 양쪽에 같은 값을 쓰는 규칙 유지 — 셀 수가 어긋나면 표가 깨진다).

### 4-6. Zustand 스토어

**변경 없음.** `useI18nStore`(`t`) · `usePermissionStore` 만 소비한다.

---

## 5. DB 설계

**해당 없음.** MySQL 테이블·KVS 엔티티·`manifest.yml` attributes 변경 없음. 계층은 Jira `parent` 필드에서 매 조회 시 파생하며 앱이 저장하지 않는다(앱 계층 `wbsParent` 와 **다른 축**임에 유의 — 이번 기능은 `wbsParent` 를 읽지도 쓰지도 않는다).

---

## 6. i18n 키 목록

`locales/kr/projectDetail.json` · `locales/en/projectDetail.json` (네임스페이스 `projectDetail`, merge 후 `projectDetail.*` 로 접근). **`ko-KR.json`/`en-US.json` 직접 수정 금지 → `cd static/ui && npm run merge`.**

| 키 | kr | en |
|---|---|---|
| `issue.viewMode.hierarchy` | 계층 | Hierarchy |
| `issue.viewMode.flat` | 평면 | Flat |
| `issue.viewMode.tooltip` | Jira 상위–하위 구조로 묶어서 봅니다. 평면은 모든 이슈를 한 줄씩 나열합니다. | Groups issues by their Jira parent–child structure. Flat lists every issue in one level. |
| `issue.hierarchy.expandAll` | 모두 펼치기 | Expand all |
| `issue.hierarchy.collapseAll` | 모두 접기 | Collapse all |
| `issue.hierarchy.expandRow` | 하위 작업 펼치기 | Expand child issues |
| `issue.hierarchy.collapseRow` | 하위 작업 접기 | Collapse child issues |
| `issue.hierarchy.rowHint` | 상위 {roots}건 · 표시 {rows}행 | {roots} top-level · {rows} rows shown |
| `issue.hierarchy.pageUnit` | 페이지 단위는 상위 이슈 기준입니다. 하위 작업은 상위와 같은 페이지에 함께 표시됩니다. | Pages are counted by top-level issues. Child issues always appear on the same page as their parent. |
| `issue.hierarchy.truncated` | 이슈가 많아 계층 일부만 구성했습니다. 필터로 범위를 좁혀 주세요. | Too many issues to build the full hierarchy. Narrow the range with filters. |
| `issue.hierarchy.detailTruncated` | 하위 작업이 많아 이 페이지의 일부만 표시됩니다. | This page has too many child issues to show them all. |
| `issue.hierarchy.orphanHint` | 상위 이슈가 이 프로젝트에 없거나 필터에 걸러져 최상위로 표시됩니다. | The parent is outside this project or filtered out, so this issue is shown at the top level. |

- `{roots}`·`{rows}` 치환은 `utils/i18n.js` 의 **`tFormat(t, key, vars)`** 를 쓴다(Forge `t()` 는 보간 미지원 — WORK_VIEWS.md §8 규약).
- 기존 키 재사용: `issue.group.truncated`, `issue.bulk.*`, `issue.table.*`, `common.table.*`, `common.empty`. 새로 만들지 않는다.

---

## 7. 성능 · 제약 점검표

| 제약 | 지켜지는 방식 |
|---|---|
| **평면 모드 동작·성능·캐시 무변경** | 평면 경로의 JQL·필드·쿼리키·`staleTime`·`placeholderData`·커서 히스토리 전부 그대로 이동. 계층 훅은 `enabled:false` 로 네트워크 0. `SUMMARY_FIELDS` 를 건드리지 않는다(요약 재사용 기각의 최대 이유) |
| **인라인 편집 5종 동작 동일** | 두 모드가 `createRow` 를 **공유**. 편집 경로는 `patchIssue(result)` 하나로 통일 |
| **일괄 적용/제외 동작 동일** | 캐시 shape `{issues,userMap}` 동형 → `applyIssuePatches`·`markIssuesDeleted` 무수정 재사용 |
| **펼치기/접기 네트워크 0회** | 페이지 진입 시 그 페이지 루트의 **서브트리 상세를 전부** 받아 캐시에 둔다. 펼침은 렌더 필터링만 |
| **write 직후 재조회 금지(인덱스 지연)** | 편집·일괄은 `invalidate` 하지 않고 캐시 패치만. 기존 규약 그대로 |
| **N+1 금지** | coworker 는 페이지 단위 `resolveCoworkerUserMap` 1회 bulk(기존). 상세는 `key IN` 청크 + `mapWithConcurrency(3)` — 이슈당 GET 없음 |
| **과설계 금지** | 부모 체크→자식 자동 선택 ✗ / 필터 밖 부모 끌어오기 ✗ / localStorage·URL 펼침 동기화 ✗ / 하위 개수 배지 ✗ (§8) |

---

## 8. 의도적으로 **넣지 않은 것** (보류 사유)

| 항목 | 사유 |
|---|---|
| 부모 체크 시 자식 자동 선택 | 요청 밖. 부모만 골라 일정을 미는 사용을 되돌릴 수 없게 만든다 |
| 접힌 부모 행의 "하위 N건" 배지 | chevron 자체가 자식 존재를 알린다. 골격에서 개수는 알지만 계약·번역·폭이 늘어난다. 실사용 불편이 확인되면 그때 |
| 계층 모드에서 정렬(컬럼 헤더 정렬) | 계층 순서와 정렬은 양립하지 않는다. `TableSurface` 는 `sortValue` 가 없으면 화살표를 자동으로 감추므로 **아무 조치 없이도** 계층 모드에서 죽은 정렬 UI 가 생기지 않는다 |
| 모드 선택의 localStorage/URL 저장 | D1 은 "카드 안 토글, 기본 계층"까지만 확정. 저장은 요청 밖 |
| 필터 밖 부모를 문맥용으로 표시 | D2("보이는 행 = 편입·편집 가능한 행")를 깬다 |
| 드래그로 상위 변경 | 트리 뷰의 영역(`resolveTreeDrop`). 목록에 들이면 두 화면이 서로 다른 계층 축(Jira parent vs wbsParent+폴더)을 편집하게 된다 |

---

## 9. 리더 확인이 필요한 열린 질문

**Q1 (결정 필요). 계층 모드 초기 펼침 기본값 — `전부 펼침` vs `전부 접힘`?**
- 사용자 원문("에픽에서 펼치기를 누르면 작업이 나오고")은 **접힘**을 시사.
- 설계 관점 권장은 **펼침**: (a) 그 페이지의 서브트리 상세를 어차피 전부 받아 둔다(펼침 0회 제약), (b) 완료기준 4(계층 없는 프로젝트 = 평면과 같은 화면)가 분기 없이 충족, (c) 20개 에픽만 뜬 화면이 "이슈가 사라졌다"로 읽힐 위험.
- 어느 쪽이든 **상수 `INITIAL_EXPAND` 한 줄**이라 나중 변경 비용은 0. 미회신 시 **`'all'`(전부 펼침)** 로 진행한다.

**Q2 (확인). `createRow` 의 `index` 인자 제거 = 단건 편집 캐시 패치를 인덱스 → issueKey 기반으로 전환하는 것**은 평면 모드의 *내부* 변경이다(관측 동작·요청 수·캐시 shape 은 불변, §3-5). 제약 §5 "평면은 하나도 바뀌면 안 된다"를 **파일 diff 기준**으로 엄격히 읽는다면 사전 승인이 필요하다. 승인하지 않을 경우의 대안은 "평면=인덱스 / 계층=키" 이원화인데, 이는 리더가 지적한 "두 모드가 다른 패치 규칙을 가지면 조용히 어긋난다"에 정확히 해당하므로 **권장하지 않는다.**

**참고(결정 불요, 통지).** 계층 모드는 골격 상한(그룹당 2000건)을 갖는다. 2000건이 넘는 그룹에서는 계층이 잘리고 `issue.hierarchy.truncated` 배너가 뜬다(평면은 커서 페이징이라 상한 없음). 리더 §4 제안대로 요약을 재사용했다면 이 상한이 **프로젝트 전역 2000건**이 되어 더 자주·더 조용히 잘렸을 것이다.

---

## 10. 구현 작업 분해

### backend
- **없음.** (resolver·PermissionMap·DB·manifest 무변경)

### frontend

**F1. 순수 로직 (테스트 먼저 가능)**
- [ ] `issue/workListTree.js` 신규 — §2-② 함수 9개
- [ ] `issue/workListTree.test.js` 신규 — §3-9 케이스 전체
- [ ] `utils/queryKey/projectKeys.js` — `workListKeys.groupSkeleton` / `groupHierarchyPage` 추가 (+ prefix 하위성 테스트)

**F2. 데이터 훅**
- [ ] `useWorkListQueries.js` — `fetchWorkListSkeleton` / `fetchWorkListDetailByKeys` / `useWorkListSkeleton` / `useWorkListDetail` / `patchIssueByKey` 추가 (**기존 5개 함수와 `SUMMARY_FIELDS` 는 절대 손대지 않는다**)
- [ ] `issue/useWorkListFlatPage.js` 신규 — 현행 평면 로직(커서 히스토리 state, `advanceCursorHistory` effect, `isLoading`/`isLoadingMore` 판정)을 **동작 무변경으로** 이동 + §2-③ 뷰모델로 반환
- [ ] `issue/useWorkListHierarchy.js` 신규 — §4-3 흐름 + 펼침 상태(`expandedKeys`, `toggleExpand`, `expandAll`, `collapseAll`, `resetExpand`) + `onCollapseSubtree` 통지

**F3. 렌더 분해 (여기서 평면 회귀가 나면 안 된다)**
- [ ] `issue/useIssueRowFactory.jsx` 신규 — `head` + `createRow` + 편집 5종을 `ProjectIssueTable.jsx` 에서 **그대로** 이동. 시그니처만 `createRow(issue, {coworkerMap, hierarchy})` 로, 편집 경로의 `index` 인자를 `patchIssue(result, map)` 로 교체
- [ ] `issue/HierarchyToggleCell.jsx` 신규 — `depth` 들여쓰기(최대 5단 클램프) + chevron/spacer, `aria-expanded`, `expandRow`/`collapseRow` 라벨
- [ ] `issue/WorkListModeToggle.jsx` 신규 — `ToggleBtn`(`components/chart/ViewToggleButtons.jsx`) 재사용
- [ ] `issue/ProjectIssueTable.jsx` 수정 — §4-4 셸로 축소. 선택·일괄 모달·`ConfirmModal`·액션 바는 유지, `queryKey` → `vm.patchQueryKey`, 접기 시 서브트리 선택 해제 연결, 모드 전환 시 `clearSelection()`
- [ ] `ProjectIssuePanel.jsx` / `ProjectGroupCard.jsx` / `CursorPagingTable.jsx` / `TableSurface.jsx` — **무변경 확인**

**F4. i18n**
- [ ] `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` 에 §6 키 12개 추가
- [ ] `cd static/ui && npm run merge` 실행 (`ko-KR.json`/`en-US.json` 직접 수정 금지)

**F5. 검증**
- [ ] `cd static/ui && npm test` — 신규 `workListTree.test.js` 통과 + 기존 `workListQuery.test.js`·`queryKeyContract.test.js`·`bulkApply.test.js`·`bulkDelete.test.js` 무회귀
- [ ] `cd static/ui && CI=true npm run build` 통과
- [ ] 수동 회귀 시나리오: ① 평면 모드에서 인라인 편집 5종 + 일괄 적용 + 일괄 제외 ② 계층 모드에서 동일 5종 ③ 펼침/접기 시 네트워크 요청 0건(devtools) ④ 접힌 자식이 선택에 남지 않음 ⑤ 부모-자식 관계가 없는 그룹에서 평면과 같은 화면 ⑥ 필터를 걸어 부모를 제외했을 때 자식이 루트로 남는지
