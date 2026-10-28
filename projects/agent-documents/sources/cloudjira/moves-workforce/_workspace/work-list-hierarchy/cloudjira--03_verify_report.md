# 통합 정합성 검증 리포트 — 작업관리 목록 뷰 Jira 계층 펼치기

검증: 2026-09-07 / integration-verifier
슬러그: `work-list-hierarchy`
입력: `00_input/requirement.md` · `01_architect_design.md` · `02_frontend_report.md` · 워킹트리 실제 소스
검증 축: **① Jira REST → ② 순수 함수(`workListTree.js`) → ③ 훅 뷰모델 → ④ 테이블 props** (백엔드 0줄, resolver 없음)

## 종합 판정

| 분류 | 건수 |
|---|---|
| **통과** | 22 |
| **실패 (차단)** | **0** |
| **개선 권고 (비차단)** | 7 |
| **미검증 (실서버 필요)** | 5 |

**차단 결함 없음. 커밋·배포 진행 가능.** 아래 "개선 권고"는 전부 비차단이며, 리더가 원하면 별도 후속으로 넘기면 된다.

---

## 0. 실행 검증 결과 (원문)

```
$ cd static/ui && npx jest
Test Suites: 111 passed, 111 total
Tests:       1801 passed, 1801 total
Snapshots:   1 passed, 1 total
Time:        23.121 s
[exited with code 0]
```

```
$ cd static/ui && CI=true npm run build
The build folder is ready to be deployed.
> bundle:check
{"file":"static/js/main.25385b10.js","rawBytes":1760610,"gzipBytes":476392,"budgetBytes":950000,"withinBudget":true}
[exited with code 0]
```

```
$ npm test   (루트 / 백엔드 회귀 확인용)
Test Suites: 112 passed, 112 total
Tests:       1511 passed, 1511 total
[exited with code 0]
```

`git status --porcelain src/ manifest.yml package.json` → **빈 출력**. 백엔드 0줄 주장 사실 확인.

---

## 1. ★ 평면 모드 회귀 — **문자 단위 대조 결과: 통과**

`git show HEAD:…/ProjectIssueTable.jsx`(773줄)를 추출해 신규 `useIssueRowFactory.jsx` 와 블록별 `diff` 를 돌렸다. **육안 확인이 아니라 실제 diff 출력**이다.

| 블록 | HEAD 위치 | 신규 위치 | diff 결과 |
|---|---|---|---|
| `withTooltip` | 38–49 | `useIssueRowFactory.jsx:27-38` | **완전 동일 (0줄 차이)** |
| `head` (10셀) | 218–243 | `useIssueRowFactory.jsx:172-197` | **완전 동일 (0줄 차이)** |
| `ensureJiraPermission` | 180–187 | `useIssueRowFactory.jsx:76-83` | **완전 동일** |
| `mutateDate` + `updateDateField` | 189–216 | `useIssueRowFactory.jsx:101-128` | `searchByIssueId(variables.issueKey)` 에서 `variables.index` 제거 **1줄만** |
| `searchByIssueId` | 278–296 | `useIssueRowFactory.jsx:85-99` | 시그니처 `index` 제거 + 인덱스 패치 6줄 → `patchIssue(result, map)` |
| `assignIssue` | 298–307 | `useIssueRowFactory.jsx:130-139` | `index` 인자 제거 **2줄만** |
| `updateCoworker` + `updatePlannedMD` | 371–400 | `useIssueRowFactory.jsx:141-170` | `index` 인자 제거 **4줄만** |
| `createRow` (278줄) | 402–679 | `useIssueRowFactory.jsx:199-478` | 아래 8줄 외 **완전 동일** |

`createRow` 의 diff 전량(이게 전부다):
1. 시그니처 `(issue, index, coworkerMap)` → `(issue, {coworkerMap, hierarchy})` — **리더 Q2 승인분**
2. `issueKeyCell` 변수 추출 + `hierarchy` 분기 — **신규 기능**
3. `<StatusComponent/>` → `<IssueStatusLozenge/>` — **RFC-199 소유분** (§5 참조)
4. 편집 호출 4곳의 `index` 인자 제거 — **Q2 승인분**

### 지시된 개별 점검 항목

| 항목 | 판정 | 근거 |
|---|---|---|
| `InlineEdit` 패턴 · `useRef` 5종 | **통과** | `changeAssignee/Coworker/PlannedMD/StartDate/EndDate` 5개 ref 전부 이동, `useIssueRowFactory.jsx:70-74`. 셀 JSX 문자 동일 |
| 변경 감지 조건 (`!=` vs `!==`) | **통과** | 담당자는 느슨한 `!=` (`:238`), 시작일/기한/MD는 엄격한 `!==` (`:316,:380,:459`) — HEAD와 연산자까지 동일 |
| `isSameArrayElements` (협업자) | **통과** | `useIssueRowFactory.jsx:264` — `!isSameArrayElements(changeCoworker.current, getIssueCoworkerIds(issue))` 동일 |
| `ensureJiraPermission` + `canScheduleIssues`/`canEditIssues` 분기 | **통과** | `useIssueRowFactory.jsx:123-128` — `field === 'duedate' ? canScheduleIssues : canEditIssues`, 메시지 키 `jiraPermission.schedule`/`.edit` 동일. 담당자는 `canAssignIssues` + `.assign` (`:131`) |
| `buildTimetrackingPayload(originalEstimate, remainingEstimateSeconds)` | **통과** | `useIssueRowFactory.jsx:158` 호출 문자 동일. 인자 전달원 `issue.fields.timetracking?.remainingEstimateSeconds ?? null` (`:460`) 동일 |
| `isTimeTrackingUnsupportedError` 분기 | **통과** | `useIssueRowFactory.jsx:164` — 동일 위치·동일 토스트 매핑 |
| 토스트 문구 키 | **통과** | `common.toast.title.success` / `projectDetail.issue.toast.update.success` / `common.toast.title.Fail` / `common.toast.description.error` / `projectDetail.issue.timeTracking.disabled` — 전부 동일 |
| `showSelectColumn = canEdit && canBulkApply` head/rows 양쪽 동일 | **통과** | `ProjectIssueTable.jsx:105` 에서 1회 계산 → `useIssueRowFactory` **단일 prop**으로 주입 (`:163`). head(`:174`)와 row(`:210`)가 같은 클로저 변수를 본다 → 셀 수 불일치 구조적으로 불가 |
| `bulkTargets` 가 시작일/기한을 담지 않음 | **통과** | `ProjectIssueTable.jsx:132-142` — `{issueKey, remainingSeconds, spentSeconds, statusKey}` 4필드. HEAD 144-154와 동일. 의도적 생략 주석까지 보존 |
| `advanceCursorHistory` effect 의 `isPlaceholderData` 가드 | **통과** | `useWorkListFlatPage.js:39-44` — `if (!pageQuery.data \|\| pageQuery.isPlaceholderData) return;` HEAD 168-173과 문자 동일, deps 배열도 동일 |

### 평면 경로 부수 확인

| 항목 | HEAD | 신규 | 판정 |
|---|---|---|---|
| `resetSig` 문자열 | `${project_id}\|${groupKey}\|${JSON.stringify(filter ?? {})}\|${pageSize}` | 동일 (`ProjectIssueTable.jsx:69`) | 통과 |
| 쿼리키 | `workListKeys.groupPage(...)` | 동일 (`useWorkListFlatPage.js:30`) | 통과 |
| `isLoading` / `isLoadingMore` | `isFetching && idx===0` / `isFetching && idx>0` | 동일 (`useWorkListFlatPage.js:62-63`) | 통과 |
| `currentCount` | `rows.length` | `issues.length` — 평면은 `visibleIssues === issues` 이고 `__deleted` 행도 rows 에 남으므로 **같은 값** | 통과 |
| `refreshSignal` 시 `invalidateGroup` | `{refetch:false}` (page>0) | `{refetch: mode==='hierarchy'}` → **평면이면 false로 동일** (`ProjectIssueTable.jsx:192`) | 통과 |
| `useWorkListGroupPage` 신규 `enabled` 인자 | 없음 | `enabled = true` 기본값 (`useWorkListQueries.js:254`) — **호출부는 `useWorkListFlatPage` 1곳뿐**(전역 grep 확인) | 통과 |
| `SUMMARY_FIELDS` · `buildGroupJql` · `normalizeJqlMap` · `advanceCursorHistory` | — | 계층 작업은 무변경. `workListQuery.js` diff는 RFC-199의 `issuetype` 추가 1줄뿐 | 통과 |

> **부수 개선(회귀 아님):** `searchByIssueId` 는 담당자/협업자 경로에서 **숫자 id**를, 날짜/MD 경로에서 **이슈 키**를 받는다(HEAD부터 섞여 있었다). 인덱스 기반에서는 무관했고, 키 기반 전환 후에는 `getIssue` 응답의 `result.key`(권위 있는 값)로 찾으므로 인자 종류와 무관하게 정확하다. 설계서 §3-5 근거 3이 코드로 성립함을 확인.
> **부수 개선 2:** 구 `StatusComponent` 는 `status.colorName` 을 무가드 접근했고, `IssueStatusLozenge` 는 `if (!status \|\| !status.name) return null` 가드가 있다 → 엄격히 더 안전.

---

## 2. 신규 계층 경로 — 통과

### 2-1. 두 훅의 뷰모델 동형성 · 셸의 무분기 소비 — **통과**

| 필드 | flat (`useWorkListFlatPage.js:51-67`) | hierarchy (`useWorkListHierarchy.js:138-169`) |
|---|---|---|
| `visibleIssues` `userMap` `rowMeta` `currentPageIndex` `currentCount` `hasNext` `hasPrev` `onNext` `onPrev` `isLoading` `isLoadingMore` `truncated` `patchQueryKey` `resetPage` | 14개 전부 | 14개 전부 |
| 계층 전용 9개 | 없음 | `skeletonTruncated` `detailTruncated` `rootCount` `rowCount` `expandedKeys` `toggleExpand` `expandAll` `collapseAll` `resetExpand` |

셸의 모드 분기는 `const vm = mode === 'hierarchy' ? tree : flat;` (`ProjectIssueTable.jsx:95`) **한 줄뿐**. 계층 전용 필드 소비 지점은 전부 `isHierarchy` 가드 아래이거나(`:302-338`), 평면에서 `null` 로 수렴하는 경로다(`buildRowHierarchy` 는 `vm.rowMeta?.get()` → 평면은 `rowMeta:null` → 항상 `null`). **평면 모드에서 `undefined` 함수 호출 위험 없음.**

### 2-2. `patchQueryKey` 캐시 shape 동형 + 패치 유틸 3종 동작 — **통과**

| 모드 | 캐시 객체 |
|---|---|
| flat (`fetchWorkListGroupPage`, `useWorkListQueries.js:120`) | `{ issues, nextPageToken, userMap }` |
| hierarchy (`fetchWorkListDetailByKeys`, `useWorkListQueries.js:236`) | `{ issues, userMap }` |

세 유틸 전부 `old.issues` 배열만 보고 **issueKey 로** 대상을 찾는다 → `nextPageToken` 유무와 무관:

| 유틸 | 호출 지점 | 계층 동작 |
|---|---|---|
| `applyIssuePatches` (일괄 적용) | `useBulkApply.js:109` ← `BulkApplyModal(queryKey={vm.patchQueryKey})` (`ProjectIssueTable.jsx:403`) | ✅ 키 기반 |
| `markIssuesDeleted` (일괄 제외) | `ProjectIssueTable.jsx:249-252` `patchGroupPage(vm.patchQueryKey, …)` | ✅ 키 기반 |
| `replaceIssueByKey` (단건 편집) | `useWorkListQueries.js:307-313` `patchIssueByKey` ← `useIssueRowFactory` 의 `patchIssue` | ✅ 못 찾으면 `old` 참조 그대로 반환 → 리렌더 없음 |

### 2-3. `rowMeta.onToggle` 주입이 rows 를 매 렌더 재생성하는가 — **통과 (재생성 없음)**

- `rowMeta` 는 `useWorkListHierarchy.js:96-104` 의 `useMemo(deps=[roots, expandedKeys, issues])` 산출물 → **참조가 안정**하다.
- `rows` memo(`ProjectIssueTable.jsx:293-300`)의 deps에 `vm.rowMeta` 가 들어 있다. 펼침이 바뀌면 `expandedKeys` → `rowMeta` 새 Map → rows 재생성. 안 바뀌면 재생성 없음.
- `onToggle: () => vm.toggleExpand(issueKey)` 는 memo 클로저 안에서 만들어지므로 **렌더마다 새로 만들어지지 않는다.**
- `toggleExpand` 자체는 `setExpandOverrides(prev => …)` 함수형 업데이트라 클로저가 한 렌더 뒤처져도 안전하다.
- 평면 모드는 `rowMeta === null`(상수) → memo 무효화 요인 아님.

### 2-4. 접기 시 서브트리 선택 해제 · "선택 집합 ⊆ 보이는 행" 불변식 — **통과 (코드로 성립)**

두 겹으로 보장된다:

1. **능동 해제.** `useWorkListHierarchy.js:106-120` `toggleExpand` 가 접힘일 때 `collectSubtreeKeys(byKey.get(issueKey))` 를 `onCollapseSubtree` 로 셸에 통지 → `ProjectIssueTable.jsx:79-85` `dropSelection` 이 `selectedKeys` 에서 차집합. `collapseAll` (`:126-132`)은 `roots.flatMap(collectSubtreeKeys)` 전량 통지.
2. **구조적 보장(더 강함).** 일괄 대상 산출식이 **선택 집합이 아니라 보이는 행에서 출발**한다:
   - `selectableIssues = visibleIssues.filter(!__deleted && key)` (`:108-111`)
   - `bulkTargets = selectableIssues.filter(selectedKeys.has(key))` (`:132-142`)
   - `bulkDeleteTargets = visibleIssues.filter(… && selectedKeys.has(key))` (`:146-151`)

   → 설령 해제 통지가 누락돼도 **보이지 않는 행은 일괄 대상에 들어갈 수 없다.** 설계서 §3-6 이 요구한 불변식이 실제로 코드에 박혀 있다.

페이지 이동(`handlePrev`/`handleNext` `:200-207`)·모드 전환(`handleModeChange` `:210-214`)·`resetSig` 변경(`:71-74`)·`refreshSignal`(`:182`) 시 `clearSelection()` 전부 확인.

### 2-5. `executeRequest` 실패의 명시 검사 → throw 승격 — **통과 (양쪽 다)**

`useWorkListQueries.js:140-147`
```js
const assertSearchOk = (result) => {
    if (result?.success === false) {
        const error = new Error('searchIssueWithJQL failed');
        error.cause = result.error;
        throw error;
    }
    return result;
};
```
- 골격: `:174` `assertSearchOk(await executeRequest(...))` — 루프 매 페이지
- 상세: `:221` 동일 — **청크 매 요청**. `mapWithConcurrency` 안에서 throw 되므로 청크 1개만 실패해도 쿼리 전체가 reject → 부분 트리 렌더 불가 (설계서 §3-3 준수)

### 2-6. `/search/jql` 루프 종료 조건 순서 — **통과**

`useWorkListQueries.js:179-186` (골격)
```js
if (result?.isLast === true) break;
nextPageToken = result?.nextPageToken || null;
if (!nextPageToken || pageItems.length === 0) break;
if (collected.length >= MAX_SKELETON_ISSUES || pageCount >= MAX_SKELETON_PAGES) { truncated = true; break; }
```
`isLast` → `nextPageToken` → 빈 페이지 → **그 다음에야** 상한. `worklogExport/utils/searchIssues.js:52-58` 의 확립된 순서와 동일. "정확히 상한에 걸린 완결 검색을 truncated 로 오경고" 결함 회피 확인. 상세(`:225-228`)도 같은 순서.

### 2-7. `fields.parent` 부재 시 fail-soft — **통과**

`workListTree.js:12-18` `parentKey: issue.fields?.parent?.key ?? null` — `fields` 자체가 없어도 옵셔널 체이닝으로 `null`. `buildIssueHierarchy` 에서 `parentKey === null` 은 루트. **계층이 전혀 안 잡히면 전원 루트 = 평면과 같은 화면**(완료기준 4). 유닛테스트 `workListTree.test.js:38` 가 `fields` 부재 케이스를 고정.

### 2-8. 쿼리키 prefix 하위성 → 기존 `invalidateGroup` 무수정 동작 — **통과**

`utils/queryKey/projectKeys.js:150-153`
```js
groupAll:            ['projectWorkList', pid, 'group', gk]
groupSkeleton:       ['projectWorkList', pid, 'group', gk, 'skeleton',  filter]
groupHierarchyPage:  ['projectWorkList', pid, 'group', gk, 'hierarchy', filter, pageIndex, pageKeys]
```
둘 다 `groupAll` prefix 하위. `useWorkListQueries.js:301-305` `invalidateGroup` 은 `queryKey: groupAll(...)` 로 무효화하므로 **코드 변경 0줄로 골격·상세까지 함께 무효화**된다. `workListTree.test.js:229` 가 prefix 하위성을, `:236`/`:243` 이 해시 동치성/키 집합 변화 감지를 고정. `queryKeyContract.test.js`(인라인 배열 금지) 통과.

### 2-9. ★ 펼침/접기 네트워크 0회 — **통과 (코드 증명)**

`grep -rn "expandedKeys" src/pages/projectDetail/issue/` 전수 확인 결과, **`expandedKeys` 가 어떤 쿼리키에도 들어가지 않는다.**

- 상세 쿼리키 = `groupHierarchyPage(pid, gk, filter, currentPageIndex, pageSlice.pageKeys)`
- `pageSlice` = `useMemo(collectPageKeys(roots, currentPageIndex, pageSize, MAX_DETAIL_KEYS), [roots, currentPageIndex, pageSize])` — **펼침 상태와 무관**
- 펼침은 `flattenHierarchy(roots, expandedKeys)` 의 렌더 필터링뿐 (`useWorkListHierarchy.js:96-104`)

→ 펼침/접기 시 쿼리키 불변 → 재조회 없음. **치명적 결함 없음.**

### 2-10. 성능 패턴 — 통과

| 항목 | 판정 |
|---|---|
| N+1 금지 | `resolveCoworkerUserMap(issues)` 를 **페이지 단위 1회** 호출(`useWorkListQueries.js:235`). 이슈당 GET 없음 |
| 동시성 제한 | `mapWithConcurrency(chunks, DETAIL_CONCURRENCY=3, …)` (`:206`) — `BULK_APPLY_CONCURRENCY` 와 같은 값·같은 유틸 |
| 청크 크기 | `DETAIL_CHUNK_SIZE=50` = 평면 최대 페이지와 동일 부피 |
| 공통 페치 경로 오염 | `fetchWorkListSummary`·`fetchWorkListGroupPage`·`SUMMARY_FIELDS` 무변경(계층 작업 기준). 계층은 **전용 fetcher 2개** 신설 |
| 골격 비용 | `staleTime 60s` + `groupAll` prefix 캐시 → 페이지 이동·펼침·모드 왕복에서 재조회 0회 |

### 2-11. `CursorPagingTable` footer 산술 정합 — **통과**

`components/table/CursorPagingTable.jsx:74-75`
```js
const start = currentCount === 0 ? 0 : currentPageIndex * pageSize + 1;
const end   = currentPageIndex * pageSize + currentCount;
```
설계서 §3-2 가정과 **정확히 일치**. 계층이 `currentCount = pageSlice.pageRootCount`(루트 수)를 넘기므로 페이지 구간이 연속·비중복이 된다. 렌더 행 수(자손 포함)를 넘겼다면 구간이 겹쳐 읽혔을 것. `CursorPagingTable.jsx`·`TableSurface.jsx` 는 `git status` 상 **무변경** 확인.

---

## 3. 설계서 §8 "의도적으로 넣지 않은 것" — 과설계 점검 통과

`grep -rn "localStorage|sortValue|onDrag|draggable|childCount|autoSelect" src/pages/projectDetail/issue/` → **매치 0건.**

| 항목 | 판정 |
|---|---|
| 부모 체크 시 자식 자동 선택 | 없음 (`toggleSelect` 는 단일 키만 조작, `ProjectIssueTable.jsx:118-123`) |
| 하위 N건 배지 | 없음 |
| 모드 localStorage/URL 저장 | 없음 (`useState('hierarchy')` 만, `:56`) |
| 계층 모드 정렬 | 없음 (`sortValue` 미제공 → `TableSurface` 가 화살표 자동 은닉) |
| DnD | 없음 |

---

## 4. i18n — 통과

| 점검 | 결과 |
|---|---|
| 12키가 `locales/kr/projectDetail.json`·`locales/en/projectDetail.json` 양쪽에 존재 | ✅ 12/12 |
| `ko-KR.json`/`en-US.json` 에 merge 반영 | ✅ 12/12 (`viewMode.hierarchy/flat/tooltip`, `hierarchy.expandAll/collapseAll/expandRow/collapseRow/rowHint/pageUnit/truncated/detailTruncated/orphanHint`) |
| `ko-KR.json`/`en-US.json` **직접 수정 없음** | ✅ `CI=true npm run build` 의 prebuild 가 `merge` 를 재실행했고, 그 후 `git diff --stat locales/ko-KR.json locales/en-US.json` 이 **작업 전과 동일한 24줄**로 유지 → merge 산출물과 소스가 일치(수기 편집 흔적 없음) |
| `locales/script/*.json`(빈 스텁) 오염 | ✅ 없음 |
| `{roots}`/`{rows}` 보간 | ✅ `tFormat(t, 'projectDetail.issue.hierarchy.rowHint', {roots, rows})` (`ProjectIssueTable.jsx:330-333`) — Forge `t()` 직접 보간 아님 |
| RFC-199 키(`filter.issueType.trigger/selected`) | ✅ 양쪽 존재 (동시 작업분, 참고) |

### `issue.hierarchy.orphanHint` — **미사용 확인 → 제거 권고**

```
$ grep -rn "orphanHint" static/ui/src locales/
locales/kr/projectDetail.json:159   locales/ko-KR.json:2282
locales/en/projectDetail.json:159   locales/en-US.json:2261
```
**`static/ui/src` 전체에 소비처가 0건.** 프론트 리포트 §4의 진술이 사실임을 확인.

- **권고:** `locales/kr|en/projectDetail.json` 에서 이 키를 삭제하고 `npm run merge` 재실행.
- 이유: 설계서 §6 이 키를 열거했으나 §2·§3 어디에도 배치 계약이 없다. 필터 상태에서는 고아 승격이 다수 행에 발생하므로 행 단위 아이콘은 노이즈가 되고, 이는 §8 "과설계 금지"에 걸린다. 남겨 두면 "번역은 있는데 화면에 없다"가 다음 감사에서 다시 지적된다.
- **또는** 리더가 문구를 살리기로 판단하면, 배치 자리(예: 계층 모드 툴바 `pageUnit` 툴팁에 한 문장 병기)를 지정해 frontend 에 재지시. **어느 쪽이든 리더 결정 사항**이며 지금 상태가 버그는 아니다.

---

## 5. ★ RFC-199(동시 작업)와의 상호작용 — 판정만 수행, 수정 없음

> 워킹트리에 RFC-199(이슈 타입 필터 + 상태 Lozenge 통일)의 커밋 전 변경이 **63개 파일**에 걸쳐 함께 들어 있다. 아래는 **판정만**이며 RFC-199 코드는 한 줄도 건드리지 않았다.

### 5-1. 두 작업이 서로를 덮어썼는가 — **아니오. 반쪽 남은 곳 없음**

| 공유 파일 | RFC-199 변경 | 계층 변경 | 판정 |
|---|---|---|---|
| `workListQuery.js` | `SUMMARY_FIELDS` 에 `'issuetype'` 추가 (1줄) | **없음**(설계서가 금지) | ✅ 충돌 없음 |
| `useWorkListQueries.js` | `deriveIssueTypeOptions` import + `fetchWorkListSummary` 반환에 `issueTypeOptions` | 계층 fetcher/훅/`patchIssueByKey` 추가(+188줄) | ✅ **양쪽 모두 온전**. 계층분이 평면 5함수와 `SUMMARY_FIELDS` 를 손대지 않아 겹침 자체가 없다 |
| `ProjectIssuePanel.jsx` | `issueTypeOptions` 유도 + `ProjectFilter` 로 전달 (6줄) | **없음** | ✅ 계층 작업 무변경 주장 사실 |
| `ProjectGroupCard.jsx` | `STATUS_DOT` 색 출처를 `getStatusFamilyTokens` 로 이관 (9줄) | **없음** | ✅ 계층 작업 무변경 주장 사실 |
| `useIssueRowFactory.jsx` (신규) | `StatusComponent` → `IssueStatusLozenge` | 파일 자체가 계층 작업 산출물 | ✅ **RFC-199 변경이 신규 파일에 반영됨**(아래 5-3) |
| `utils/queryKey/projectKeys.js` | 없음 | `groupSkeleton`/`groupHierarchyPage` (+14줄) | ✅ 충돌 없음 |

### 5-2. RFC-199 이슈 타입 필터가 계층 모드에서 무시되는가 — **아니오. 정상 적용됨**

경로를 끝까지 추적했다:
```
IssueTypeJqlFilter.toggle  → addJqlMap('issuetype', {state:'=', value:[quoteJqlValue(name)…]})
                           → jqlMap → normalizeJqlMap → filter (정규 서명)
                           → buildGroupJql(projectId, groupKey, filter)
                              ├ 평면:   fetchWorkListGroupPage  (useWorkListQueries.js:108)
                              └ 계층:   fetchWorkListSkeleton   (useWorkListQueries.js:158)  ← 같은 함수
```
**골격이 평면 페이지와 완전히 같은 `buildGroupJql` 을 쓰므로 이슈 타입 필터가 자동으로 계층에 반영된다.** 상세 쿼리(`key IN`)에 필터를 재적용하지 않는 것은 설계서 §3-3 의 의도된 결정이며, 키가 이미 필터를 통과한 골격에서 나오므로 정합하다.

`filter` 는 `resetSig`(`ProjectIssueTable.jsx:69`)에 포함되므로 타입 필터를 바꾸면 계층 페이지·펼침·선택이 초기화되고 골격 쿼리키도 바뀌어 재조회된다. ✅

### 5-3. 상태 Lozenge 통일이 신규 `useIssueRowFactory.jsx` 의 상태 셀에 반영됐는가 — **예**

`useIssueRowFactory.jsx:224`
```jsx
{key:'issueStatus', content: <IssueStatusLozenge status={issue.fields.statusCategory}/>},
```
- import 경로 `../../../components/lozenge/StatusLozenge` (`:16`) — RFC-199 가 새로 만든 파일. 구 `StatusLozenge` 는 `SemanticLozenge.jsx` 로 rename 됐고 구 `StatusComponent` 는 `IssueComponent.js` 에서 삭제(-34줄)됐다. **삭제된 심볼을 참조하는 잔재 없음**(빌드 통과가 이를 뒷받침).
- 넘기는 shape `issue.fields.statusCategory` 는 다른 RFC-199 호출 지점(`GanttChart.jsx:85` `row.statusCategory`, `TreeDetailPanel.jsx:163` `node.statusCategory`, `TaskHistoryTable.jsx:144`)과 **동일 계열**. `getStatusAppearance` 가 `status.key ?? status.colorName ?? DEFAULT` 순으로 보므로 `statusCategory`(`{key, colorName, name}`)에 정합. ✅

### 5-4. `issueTypeOptions` 유도가 계층 골격 도입으로 깨지는가 — **아니오**

`issueTypeOptions` 는 `fetchWorkListSummary`(요약 쿼리, `workListKeys.summary`) 산출물이고, 계층 골격은 `workListKeys.groupSkeleton` 의 **별개 쿼리**다. 요약 쿼리는 카드 목록을 그리려고 모드와 무관하게 항상 1회 돌므로, **계층 모드에서도 이슈 타입 옵션이 정상 유도된다.** 설계서 §3-1 이 요약 재사용을 기각한 결정이 여기서 RFC-199 와의 결합도 낮춤으로 되돌아왔다. ✅

> **리더 참고:** 두 작업이 한 워킹트리에 섞여 있어 `git commit -a` 는 위험하다. 계층 작업분은 `static/ui/src/pages/projectDetail/issue/{workListTree.js,workListTree.test.js,useWorkListFlatPage.js,useWorkListHierarchy.js,useIssueRowFactory.jsx,HierarchyToggleCell.jsx,WorkListModeToggle.jsx,ProjectIssueTable.jsx,useWorkListQueries.js}` + `static/ui/src/utils/queryKey/projectKeys.js` + `locales/{kr,en}/projectDetail.json` 의 hierarchy/viewMode 12키다. 단 `useWorkListQueries.js`·`useIssueRowFactory.jsx`·`locales/*/projectDetail.json` 은 RFC-199 변경이 **같은 파일 안에** 섞여 있어 파일 단위 분리가 불가능하다 — 커밋 분리를 원하면 hunk 단위 stage 가 필요하다.

---

## 6. 개선 권고 (비차단 · 전부 리더 판단 사항)

| # | 위치 | 내용 | 권고 |
|---|---|---|---|
| R1 | `locales/kr\|en/projectDetail.json:159` | `issue.hierarchy.orphanHint` 소비처 0건 | 키 삭제 + `npm run merge`, 또는 배치 자리 지정 후 frontend 재지시 (§4) |
| R2 | `useWorkListHierarchy.js:162-163` | `rootCount`·`rowCount` 를 반환하지만 셸이 **소비하지 않는다**(`ProjectIssueTable.jsx` grep 0건). `expandedKeys` 도 미소비 | 죽은 export 3개 제거. rowHint 는 `vm.currentCount` + `rows.length` 를 쓰고 있어 기능상 문제 없음 |
| R3 | `useWorkListQueries.js:131` | `MAX_SKELETON_PAGES = 8` 은 500건/페이지 기준 **도달 불가**(2000/500 = 4페이지에서 이슈 상한이 먼저 걸린다). 반대로 Jira 가 페이지당 500 미만을 돌려주면(예: 100) **800건에서 조기 truncated** 가 난다 | 상한을 `Math.ceil(MAX_SKELETON_ISSUES / SKELETON_PAGE_SIZE) + 1` 로 유도하거나 24 정도로 올린다. `worklogExport/utils/searchIssues.js:16` 이 `PAGE_MAX = Math.ceil(MAX/PAGE)+1` 로 이미 그렇게 한다 |
| R4 | `useWorkListHierarchy.js:96-104` | `flattenHierarchy` 가 **그룹 전량(최대 2000노드)** 을 매 토글마다 순회해 rowMeta Map 을 만든다. 실제 필요한 것은 현재 페이지의 ≤500키뿐 | 네트워크 비용은 0이라 비차단. 큰 그룹에서 토글 체감이 느리면 `pageKeys` 범위로 좁힌다 |
| R5 | `ProjectIssueTable.jsx:330-333` | `rowHint` 의 `rows` 는 `rows.length` 라 **`__deleted` 빈 행도 센다** | `visibleIssues.filter(i => !i.__deleted).length` 로 바꾸면 정확. 일괄 제외 직후에만 어긋난다 |
| R6 | `useWorkListHierarchy.js:67-70` | 골격 재조회로 루트 수가 줄어 `pageIndex` 가 범위 밖이 되면 `pageKeys=[]` → 빈 표 + footer 가 `0 - 40` 같은 구간을 표시(`hasPrev` 는 true라 footer 가 살아 있다) | `pageIndex > 0 && pageKeys.length === 0` 이면 `setCurrentPageIndex(0)` 으로 클램프. 드문 경합 상황 |
| R7 | `ProjectIssueTable.jsx:293-300` | `rows` memo deps 에 `createRow`(=`vm.patchQueryKey` 클로저)가 없다 → 페이지 전환 중 `placeholderData` 로 `visibleIssues` 참조가 유지되는 찰나에 **직전 페이지의 `patchQueryKey`** 로 패치될 수 있다 | **HEAD 도 동일 구조(인덱스 기반)였으므로 회귀 아님.** 화면에 보이는 행이 직전 페이지 행이므로 실사용 영향은 사실상 없다. 고치려면 deps 에 `vm.patchQueryKey` 추가 |

---

## 7. 미검증 (실서버/E2E 필요 — 추측으로 통과 처리하지 않음)

| # | 항목 | 왜 여기서 검증 불가 |
|---|---|---|
| U1 | `fields: ['parent']` 응답에 `fields.parent.key` 가 실제로 오는가 (회사 관리형/팀 관리형, 에픽·스토리·하위이슈 전 구간) | 실 Jira 인스턴스 필요. **안 오면 전원 루트 = 평면과 같은 화면**(fail-soft, 크래시 없음)이라 **기능이 조용히 무력화**된다. **배포 후 최우선 확인 대상** |
| U2 | `/search/jql` 응답에 `isLast` 필드가 존재하는가 | 없으면 `nextPageToken` 기반 종료로 폴백되지만, 정확히 상한에 걸린 완결 검색이 `truncated` 로 오경고될 수 있다 |
| U3 | `/search/jql` 이 `maxResults: 500` 을 실제로 honor 하는가 | R3 의 조기 truncated 위험과 직결. 코드베이스 전례(`getJqlIssue.js:43` `MY_ISSUE_PERIODS_PAGE_SIZE = 500`)가 있으나 이 엔드포인트·이 필드 조합은 실측 미수행 |
| U4 | 펼침/접기 시 devtools Network 요청 0건 | **코드상으로는 §2-9 에서 증명 완료**(쿼리키에 `expandedKeys` 부재). 실측만 남음 |
| U5 | 인라인 편집 5종 · 일괄 적용 · 일괄 제외의 **계층 모드 실동작** | 유닛테스트가 순수 함수만 덮는다. 설계서 §10 F5 수동 시나리오 ①~⑥ 미수행 |

---

## 8. 결론

- **차단 결함 0건.** 평면 모드 회귀는 문자 단위 diff 로 부재를 확인했고, 유일한 차이는 리더가 승인한 Q2(index→issueKey)와 RFC-199 소유의 lozenge 교체다.
- 설계서 §2 의 4단 경계면 계약이 **전부 코드로 성립**한다. 특히 (a) 두 훅의 뷰모델 동형성, (b) 캐시 shape 동형에 따른 패치 유틸 3종 무수정 재사용, (c) 쿼리키에 `expandedKeys` 부재로 인한 펼침 네트워크 0회, (d) 선택 집합 ⊆ 보이는 행 불변식의 이중 보장이 확인됐다.
- RFC-199 와의 상호작용에서 **반쪽만 남은 변경이 없다.** 이슈 타입 필터는 `buildGroupJql` 공유 덕에 계층에 자동 적용되고, 상태 Lozenge 통일은 신규 파일에 반영돼 있다.
- 남은 리스크는 전부 **실 Jira 응답 형태 의존**(U1~U3)이다. 특히 **U1(`fields.parent` 실제 응답)** 은 실패해도 화면이 깨지지 않고 조용히 평면처럼 보이므로, 배포 직후 반드시 실데이터로 확인해야 한다.
