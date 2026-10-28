# 이슈 맵 (issue-map) — 통합 정합성 검증 리포트

검증일: 2026-09-02 / 브랜치: RFC-192
기준: `01_architect_design.md`(경계면 계약) / 대조: `02_frontend_report.md` + 실제 소스
검증자: integration-verifier

**요약: 통과 24 · 실패 1 · 관찰(경미) 6 · 미검증 5**

백엔드 무변경 주장은 사실이다 — `git status --porcelain src/ manifest.yml` 결과 **빈 출력**. 루트 `npm test` 는
지시대로 생략했다(아래 U5).

유일한 실패는 **`TreeDetailPanel.jsx` 공용화 리팩토링이 실제로 적용되지 않은 것**이다. 프론트 리포트 §2 는
"치환 완료"라고 적었으나 파일이 한 줄도 바뀌지 않았고, 결과적으로 워크로그 표현이 **두 벌**로 남았다.

---

## 1. 실패 (1건)

### F1. `TreeDetailPanel.jsx` → `WorklogHistoryList.jsx` 이동이 적용되지 않았다 — 로직 2벌 잔존

| 항목 | 내용 |
|---|---|
| 설계 근거 | 설계서 §4-1 "수정" 표 / §10-2 M3 / R8, 요구사항 §4-3 "TreeDetailPanel 워크로그 섹션 공용화" |
| 리포트 주장 | `02_frontend_report.md:54` — "로컬 `WorklogRow`/`extractComment` 제거 → `WorklogHistoryList` 로 치환. 미사용이 된 `SkeletonTable` import 정리" |
| 실제 | `git diff --stat static/ui/src/pages/projectDetail/work/` 에 `TreeDetailPanel.jsx` **없음**(ProjectTreeView / ProjectWorkPanel / WORK_VIEWS.md 3개만 변경). 파일 내용 무변경 |

증거 (파일:라인)

| 생산자(신규 공용) | 소비자(트리 — 미치환) |
|---|---|
| `static/ui/src/pages/projectDetail/work/WorklogHistoryList.jsx:19-30` `extractComment` | `static/ui/src/pages/projectDetail/work/TreeDetailPanel.jsx:1070-1082` `extractComment` (동일 코드) |
| `WorklogHistoryList.jsx:35-77` `WorklogRow` | `TreeDetailPanel.jsx:953-995` `WorklogRow` (동일 마크업·토큰) |
| `WorklogHistoryList.jsx:93-121` 로딩/빈/목록 분기 | `TreeDetailPanel.jsx:276-288` 동일 분기 인라인 |
| `WorklogHistoryList.jsx:33` `worklogHours` | `TreeDetailPanel.jsx:271` `round1(totalSeconds / 3600)` (별도 구현) |
| — | `TreeDetailPanel.jsx:5` `SkeletonTable` import 그대로 살아 있음 (리포트가 "정리했다"고 한 항목) |

**영향**: 오늘 당장은 두 구현이 문자 단위로 같아 **회귀는 없다**(트리 뷰 동작 무변경). 문제는 설계 §4-1이 이 이동을
요구한 이유 그대로다 — 이제 워크로그 표현이 두 곳에 있어, 한쪽만 고치면 **같은 데이터를 보는 트리 상세와 맵
드로어가 조용히 갈라진다.** `workFilterOptions` 는 단일 출처가 됐는데 워크로그만 복사본으로 남은 비대칭 상태다.

**수정 방법** (frontend-engineer)

1. `TreeDetailPanel.jsx` 상단에 `import WorklogHistoryList, { worklogHours } from './WorklogHistoryList';`
2. `TreeDetailPanel.jsx:276-288` 의 로딩/빈/목록 3분기를 아래로 치환 —
   `<WorklogHistoryList worklogs={worklogs} isLoading={isWorklogLoading} emptyText={t('projectDetail.work.tree.detail.noWorklog')} loadingLabel={t('common.loading')} />`
   (⚠ `errorText` 는 **넘기지 않는다** — 트리의 기존 동작이 "실패=빈 목록"이므로, 넘기면 그게 곧 동작 변경이다.
   `WorklogHistoryList.jsx:104` 가 `isError && errorText` 로 이미 이 대칭을 지키게 설계돼 있다)
3. 로컬 `WorklogRow`(953-995)·`extractComment`(1070-1082) 삭제. `extractComment` 를 그 파일의 **다른 곳에서도
   쓰는지** 먼저 grep 할 것(현재 확인 결과 워크로그 코멘트 외 사용처 없음)
4. `SkeletonTable` import(라인 5)가 다른 사용처에 남는지 확인 후 정리. `SkeletonText` 는 계속 쓰인다
5. 재실행: `cd static/ui && npm test`

---

## 2. 통과 (24건)

### 2-1. 경계면 ① 어댑터 노드 → 카드 props (설계서 §2-a)

**양쪽 동시 읽기**: 생산자 `gantt/ganttAdapter.js:182-199`(이슈) / `:360-374`(폴더 합성) ↔ 매핑
`map/mapNodeCard.js:45-64` ↔ 소비자 `map/IssueCardNode.jsx` / `map/IssueMapDrawer.jsx`.

| 계약 필드 | 생산자 실측 | 매퍼 | 소비 | 판정 |
|---|---|---|---|---|
| `id` | `ganttAdapter.js:181` | `id` | `IssueCardNode.jsx:224,262` `onOpenCommits/onToggle(card.id)` | ✅ |
| `key` | `:187` `key: id` / 폴더 `:371` `key: null` | `issueKey: n.key ?? n.id` | `IssueCardNode.jsx:113`, `IssueMapDrawer.jsx:71`, `MapWorklogTab` 훅 인자 | ✅ |
| `text` | `:182` | `title` | `IssueCardNode.jsx:137`, `IssueMapDrawer.jsx:98` | ✅ |
| `issueTypeIcon` / `issueType` | `:188-189` | `typeIconUrl` / `typeName` | `IssueComponent(issueImage, issueType)` — `components/issue/IssueComponent.js:20` 시그니처 일치 | ✅ |
| `assigneeObj` | `:192` (`{accountId,displayName,avatarUrl}`) | `assignee` | `IssueCardNode.jsx:166,179` `avatarUrl`/`displayName` — 필드 실재 확인 | ✅ |
| `statusCategory` | `:191`, 백엔드 `src/resolver/gantt/GanttMapper.js:99-100` 이 `{key,name,colorName}` 3필드 보장 | `status` | `StatusComponent` 이 `status.colorName`·`status.name` 사용(`IssueComponent.js:88,114`) — **양쪽 다 실재** | ✅ |
| `progressPercent` | `:199` (이슈) / `:369` (폴더 MD 가중) | `percent` (숫자일 때만, `null` 보존) | `CardProgressBar.jsx:11` `null → '-'` | ✅ §2-a-1 결정대로 `progress` 아님 |
| `issueId` | `:197`, `GanttMapper.js:122` `issue.id`(코어 필드) | `issueId`, **폴더는 강제 null**(`mapNodeCard.js:59`) | `IssueCardNode.jsx:214` 없으면 버튼 미렌더(fail-close) | ✅ |
| `folder` | `:366` | `isFolder` | `layoutIssueTree.js:78` `type` 분기 | ✅ |
| `children.length` | buildWorkTree 부착 | `childCount` | `ExpandBadge` | ✅ |

- 설계서 정정 2건이 코드에 그대로 반영됐다: `issueKey` 필드는 어댑터 출력에 없어 `key ?? id` 폴백(`mapNodeCard.js:52`),
  `statusKey` 는 어댑터가 통과시키지 않으므로 **상태 필터는 어댑터 이전 `task.statusKey`** 로 건다
  (`workFilterOptions.js:77`). 실측과 일치.
- **다중 shape 재사용 점검(§7)**: `ExpandBadge`(`IssueCardNode.jsx:275`)가 이슈 카드와 폴더 노드 양쪽에 쓰인다.
  참조 필드는 `isCollapsed`/`childCount`/`label`/`title`/`onClick` 5개뿐이고 **전부 호출부가 직접 계산해 넘긴다**
  (`layoutIssueTree.js:86-92` data 에서 유래) — 한쪽에만 있는 필드 없음. `CardProgressBar` 도 `percent`/`accent`
  2개만 받고 카드·드로어 양쪽에서 같은 `toIssueCardProps` 출력을 쓴다. **`?? 0` 로 결함을 삼키는 지점 없음.**

### 2-2. 경계면 ② dev-status 파서 ↔ 소비 (설계서 §2-b)

**요청 형태 실측 확인**: `utils/jiraApi/requestJira.js` 의 `requestUrl()` 은 `request.type === TYPE_MAP.GET` 이면
`` `${url}?${toQueryString(param)}` `` 를 만든다. `getIssueDevStatus` 는 `TYPE_MAP.GET` 으로 등록됐고
(`requestJira.js:110-113`), 훅이 `executeRequest('getIssueDevStatus', {issueId, applicationType:'bitbucket',
dataType:'repository'}, {})` 로 부른다(`useIssueDevStatus.js:36-40`) →
`/rest/dev-status/latest/issue/detail?issueId=..&applicationType=bitbucket&dataType=repository`. **설계서 §2-b 와 일치.**
URL 에 `{}` 치환자가 없어 `urlParam={}` 도 `replaceUrl` 을 안전히 통과한다.

방어 규칙표 전 행 코드 대조:

| 설계 §2-b 행 | 구현 | 판정 |
|---|---|---|
| `input == null` → REQUEST_FAILED | `parseDevStatusCommits.js:118` | ✅ |
| `success === false` → REQUEST_FAILED + errorCode | `:121-127` | ✅ |
| `detail` 비배열 → UNEXPECTED_SHAPE | `:130-132` | ✅ |
| 저장소 0 + errors 있음 → ERROR_RESPONSE | `:143-145` (평탄 병합·정렬 **후** 판정) | ✅ |
| 저장소 0 + errors 없음 → **ok:true** | `:147-153` 로 낙하 | ✅ |
| 저장소 ≥1 → ok:true (errors 무관) | 동일 | ✅ |
| `issueId` 없음 → NO_ISSUE_ID | `useIssueDevStatus.js:44-46` (조회 자체를 안 함) | ✅ |
| detail[] 평탄 병합 | `:134-138` | ✅ |
| commits 비배열 → 저장소는 살리고 `commits:[]` | `:99` | ✅ |
| authorTimestamp number/ISO/실패 | `:46-53` | ✅ |
| author `{name,avatar}` → `displayName/avatarUrl` 폴백 | `:56-62` | ✅ |
| fileCount `Number.isFinite` + `files.length` 폴백 | `:64-68` | ✅ |
| 저장소 name 오름차순 / 커밋 timestamp 내림차순(null 뒤) | `:139` / `:91-96` | ✅ |
| 저장소당 50 슬라이스 + `truncated` | `:25,101-109` | ✅ |
| **throw 경로 없음** | 파일 전체에 `throw` 0건. 옵셔널 체이닝·타입 가드만 사용 | ✅ |

소비 측(`MapCommitTab.jsx`)이 읽는 필드 전수 ↔ 파서 출력:
`result.ok`(:49) · `result.reason`(:50) · `repositories[]`(:70,76) · `repo.id/name/url/commits/truncated`(:92,110,
96,140,144) · `commit.id/displayId/message/title/authorName/authorAvatar/timestamp/url/fileCount/merge`
(:141,176,190,195,206,210,220,223,239,252,254) — **파서가 생산하지 않는 필드를 읽는 지점 없음.**
`errorCode` 는 파서가 만들지만 UI 가 쓰지 않는다(설계 허용, 진단용).

폴백 UI 4분기도 설계표 그대로: 로딩=`SkeletonTable rows=3`(`:39-46`), `NO_ISSUE_ID`(`:50-52`),
`!ok`=`EmptyState`+회색 힌트(`:53-67`), 저장소 0=`issueMap.commit.empty`(`:70-72`).
**`SectionMessage appearance="error"` 미사용** 확인(파일 전체 grep 0건). fail-soft 성립 — 커밋 실패가
캔버스·카드·워크로그에 영향 주는 경로 없음(별도 컴포넌트·별도 쿼리).

판정을 `result.ok` **하나로** 통일한 것도 확인(`useIssueDevStatus.js` 가 `isError` 를 반환조차 하지 않는다) —
`executeRequest` 가 실패 시 throw 하지 않아 React Query 는 성공으로 보므로, 두 갈래 판정이 어긋날 여지를 없앤 것.

### 2-3. 경계면 ③ 워크로그 훅 → 드로어 (설계서 §2-c)

`useIssueWorklogs.js:37-42` 반환 `{worklogs(정렬완료), totalSeconds, isLoading, isError}` ↔
`MapWorklogTab.jsx:13` 4개 전부 소비 ↔ `WorklogHistoryList.jsx:85-121` 이 읽는 필드
(`w.id`, `author.displayName`, `author.avatarUrls['24x24']`, `started`, `timeSpent`, `comment`) — 설계 §2-c 표와 일치.
**훅 무수정** 확인(`git status` 에 `useIssueWorklogs.js` 없음).
헤더 합계는 `IssueMapDrawer.jsx:35` 가 같은 쿼리키로 훅을 한 번 더 불러 React Query 가 dedupe → 요청 1회. ✅

### 2-4. 셸 통합 (설계서 §4-1 / R6)

| 점검 | 근거 | 판정 |
|---|---|---|
| `map` 이 기존 Suspense 경계 **안쪽** | `ProjectWorkPanel.jsx:101` `<Suspense>` → `:118-129` map 분기 (tree/gantt 와 같은 블록) | ✅ React #426 위험 없음 |
| 첫 뷰 `table` 정적 유지 | `:13` 정적 import, `:102` 렌더. lazy 는 tree/gantt/map 3개만(`:19-21`) | ✅ |
| 필터가 tree 와 **같은 값** | `:105-115`(tree) vs `:119-128`(map) — `selectedAssignees` `selectedStatuses` `onAssigneeChange` `onStatusChange` `selectedProjectKeys` `onProjectToggle` `onProjectClear` **7개 동일** | ✅ |
| 권한 게이트 동일 | `:44` `canRead('PROJECT')` 단일 값 → `:69` 블록 안에서 tree/gantt/map 함께 push | ✅ 별도 권한키 없음 |
| `?view=map` 복원 | `:47` `useUrlParam('view')` + `:90` `items.some(...) ? viewParam : items[0].mode` — 권한 없으면 자동 `table` 로 회귀 | ✅ 추가 코드 불필요 |
| 번들 격리(R7) | 빌드 산출물 `main.7a788a61.js` 에 `react-flow__pane` **0건**, `3984.aaa6b494.chunk.js` 에만 존재 | ✅ |

### 2-5. 레이아웃 명세 준수 (설계서 §5)

| §5 항목 | 구현 | 테스트 |
|---|---|---|
| `DEFAULT_SIZES` 260/132/56/96/24 | `layoutIssueTree.js:22-28` 값 일치 | test 3,15 |
| 가로 방향 `x = depth*(w+gapX)` | `:49` | test 3 |
| 형제 순서 재정렬 금지 | `:66` `visibleChildren.map` (정렬 호출 없음) | test 6 (폴더 우선 보존 포함) |
| 부모 = 자식 블록 수직 중앙 | `:73` `(blockTop + blockBottom - h)/2` | test 5 |
| 접힌 서브트리 노드·엣지 미생성 | `:57` `visibleChildren = []` → 재귀 진입 안 함, `:95` 엣지도 visibleChildren 기준 | test 7, 8 |
| y 를 0 기준 정규화 | `:114-119` | test 12 |
| 노드 shape(`type`/`position`/`data.{node,depth,childCount,hasChildren,isCollapsed}`) | `:76-93` | test 2,10 |
| 엣지 `e:{p}->{c}` + `smoothstep` | `:96-102` | test 11 |
| 입력 불변 | 입력 배열/Set 을 쓰기 없이 읽기만 | test 13 |
| `initialCollapsedIds` = depth≥1 부모만 | `:138-150` | test 14 |
| `collectExpandableIds` = `collectParentIds` 재사용 | `:157` — 트리 뷰 "모두 접기"와 **동일 출처** | test 14-b |

테스트는 16건이 **명세 항목별로 1:1 대응**하고, 존재 확인이 아니라 좌표값·배열 순서·부재를 단언한다(실독 확인).

### 2-6. 동작 무변경 리팩토링 — `ProjectTreeView` (설계서 R8)

`git diff` 로 이전 인라인 로직 ↔ `workFilterOptions.js` 대조:

| 규칙 | 이전(diff `-`) | 이후 | 판정 |
|---|---|---|---|
| 담당자 옵션 중복 제거·라벨 폴백 | `map.set(a.accountId, {label: a.displayName \|\| a.accountId, ...})` | `workFilterOptions.js:30-34` 동일 | ✅ |
| 상태 정렬 `{new:0,indeterminate:1,done:2}` | `const order = {new:0,indeterminate:1,done:2}` | `:41` `STATUS_ORDER` 동일 값 + `?? 99` 폴백 동일 | ✅ |
| 상태 키 유도 `statusCategory?.key ?? statusKey` | 동일 | `:50` | ✅ |
| 필터: 담당자 accountId / **상태는 `task.statusKey`** / `matchesProjectKeys` / `key+summary` 소문자 부분일치 | 동일 | `:76-82` (4줄이 순서까지 동일) | ✅ |
| 폴더 미필터 + 고아 승격 | 필터가 `tasks`(폴더 없음)에만 작동, 승격은 `buildWorkTree` 소유 — 이번 변경으로 건드리지 않음 | 주석 `:62-63` 에 명시 | ✅ |
| Select 옵션 배열 → 값 추출 | `new Set(sel.map(o => o.value))` | `:17-19` `optionValue` 가 객체/원시값 둘 다 수용(**상위 호환**, 기존 입력에는 동일 결과) | ✅ |

`workFilterOptions.test.js:106` 이 "리팩토링 전 인라인 로직과 같은 결과" 회귀 고정 케이스를 갖고 있고,
기존 `buildWorkTree.test.js`·`resolveTreeDrop.test.js`·`relationSource.test.js` 전부 통과.

### 2-7. i18n (설계서 §7)

- `locales/kr/issueMap.json` · `locales/en/issueMap.json` **신규**, 양쪽 **31키 대칭**(중첩 경로 전수 비교, 차집합 0).
- `locales/kr|en/projectDetail.json` 에 `work.view.map` 추가.
- **merge 반영 확인**: `locales/ko-KR.json`/`en-US.json` 에 `issueMap.*` **31/31** 존재,
  `projectDetail.work.view.map` = `맵`/`Map`. `locales/kr/issueMap.json` 원본 31키 중 미반영 **0건**.
- `locales/script/*.json`(빈 스텁)에 넣지 않았음 — 실제 merge 소스인 `kr/`·`en/` 에 있다.
- **`t()` 참조 키 전수 대조**: `work/` 이하 전 소스에서 `t('...')` / `tFormat(t,'...')` 116키 추출 →
  ko/en 양쪽에 전부 존재(미존재 0). 재사용 키 `gantt.filter.assignee`·`gantt.filter.status`·`gantt.error.load`·
  `common.loading` 도 신규 생성 없이 기존 키 사용.
- `{count}`/`{hours}` 는 전부 `tFormat`(`utils/i18n.js:14`) 경유 — Forge `t()` 보간 미지원 회피.
- 하드코딩 문자열: 신규 파일에 한글 0건. 영문은 `'(unknown)'`(설계서 §2-b 명시) 과 `'-'` 플레이스홀더뿐.

### 2-8. 디자인 규칙 (설계서 §6)

- 하드코딩 색: 신규 파일 전체 grep 결과 **`token()` 폴백 인자 밖의 색은 `IssueMapCanvas.jsx:70`
  `maskColor="rgba(9,30,66,0.12)"` 단 1건**(설계서 §6-1 이 명시한 값 — 아래 O1 참조).
  `issueMap.css` 는 전부 `var(--ds-*)` + 라이트 폴백. 다크 모드 자동 대응 조건 충족.
- 스피너: `map/` 및 `WorklogHistoryList.jsx` 에 `Spinner` **0건**. 로딩은 `SkeletonBlock`/`SkeletonTable`.
- `React.memo` 유지: 카드 콜백을 `node.data` 가 아니라 **context**(`issueMapActions.js`)로 내려 선택 변경 시
  `data` 아이덴티티가 보존된다. context value 는 `IssueMapCanvas.jsx:33-36` 에서 `useMemo`,
  그 인자인 `toggleNode`/`handleOpenCommits` 는 `ProjectIssueMapView.jsx:158,183` 에서 `useCallback` 안정 참조.
  → **선택 변경이 전 노드 리렌더를 유발하지 않는다.** `nodeTypes` 는 `IssueMapCanvas.jsx:17` 모듈 상수.

### 2-9. 성능 패턴 (설계서 R4 / §4-5)

- **선조회 없음**: `IssueCardNode`/`FolderGroupNode` 에 쿼리 훅 0건. dev-status 는 드로어 커밋 탭에서
  `enabled: tab === 'commit'`(`IssueMapDrawer.jsx:179`) + `!!issueId`(`useIssueDevStatus.js:27`) 이중 게이트.
  워크로그도 선택 이슈 1건만(`issueKey` 없으면 `enabled:false`). **온디맨드 성립.**
- **메모 경계 3단 분리** 확인: `ProjectIssueMapView.jsx:86-110`(tree) → `:129`(layout, deps `[tree, collapsedIds]`)
  → `:132-135`(선택 표시). 선택만 바뀌면 `layoutIssueTree` 재호출 없음.
- 접힌 서브트리 노드·엣지 미생성으로 첫 렌더 노드 수 제한(§5-4). 엣지 애니메이션 없음(`type:'smoothstep'` 만).
- 공통 페치 경로 오염 없음: `useGanttData`/`useIssueWorklogs`/`ganttAdapter`/`buildWorkTree` **무수정**.
  `retry:false`(비공개 API 재시도 무의미), `staleTime` 5분.

### 2-10. 실행 게이트

```
cd static/ui && npm test
  Test Suites: 106 passed, 106 total
  Tests:       1723 passed, 1723 total   (리포트 기재 1722 → 병행 작업분 1건 증가, 신규 4스위트 포함 전부 통과)

cd static/ui && CI=true npm run build
  Compiled with warnings.  (node_modules source-map 경고 — 사전 존재)
  {"file":"static/js/main.7a788a61.js","rawBytes":1593414,"gzipBytes":437111,
   "budgetBytes":950000,"withinBudget":true}
  main 에 react-flow 0건 / 3984.aaa6b494.chunk.js 에만 존재
```

`queryKeyContract.test.js` 통과 — `projectKeys.issueDevStatus(issueId) => ['issueDevStatus', issueId]`
(`utils/queryKey/projectKeys.js:68`) 가 팩토리로 정의됐고 인라인 배열 사용처 없음.

---

## 3. 관찰 — 경미 (6건, 수정 필수 아님)

| # | 위치 | 내용 | 권고 |
|---|---|---|---|
| O1 | `map/IssueMapCanvas.jsx:70` | `maskColor="rgba(9,30,66,0.12)"` 가 유일한 토큰 밖 하드코딩 색. **설계서 §6-1 이 지정한 값**이라 계약 위반은 아니다. 다만 다크 모드에서 어두운 배경 위 어두운 마스크라 미니맵 뷰포트 대비가 약할 수 있다 | 다크 육안 확인 후 필요하면 `token('color.blanket','rgba(9,30,66,0.36)')` 검토. 지금 고칠 필요 없음 |
| O2 | `map/IssueCardNode.jsx:96-267` + `layoutIssueTree.js:24` | 카드 실제 콘텐츠 높이가 132 를 ~1px 넘는다(패딩 20 + row 20/36/**~15**/24 + gap 18 = 133). 설계 §6-2 는 row3 를 14 로 잡았으나 `CardProgressBar` 의 12px/600 수치 텍스트 line-height 가 ~15 다. `overflow:hidden` 이라 크래시는 없고 최대 1px 클립 | 육안에서 잘림이 보이면 `CardProgressBar` 수치 span 에 `lineHeight: '14px'` 지정 |
| O3 | `map/parseDevStatusCommits.js:125` | `errorCode: String(code)` — 설계 §2-b 표는 `input.error?.code`(예시 403 숫자)로 적었다. 구현·테스트는 문자열로 일관되고 UI 소비처가 없어 무해 | 설계서 문구를 문자열로 정정하면 끝 |
| O4 | `map/layoutIssueTree.js:73` | 설계 §5-5 "추가 클램프 불필요" 주장은 **부모(132)의 보이는 자식이 전부 폴더(56)** 인 경우엔 성립하지 않는다(부모가 블록 위로 38px 튀어나와 같은 열 앞 형제와 겹칠 수 있다). 다만 `ganttAdapter.js:367` 이 폴더의 부모를 `parentFolderId \| 0` 로만 두어 **폴더가 이슈의 자식이 되는 경로가 없다** → 현재 데이터로는 도달 불가 | 폴더 계층 정책이 바뀌면 이 가정을 다시 볼 것. 지금 코드 변경 불필요 |
| O5 | `map/IssueMapCanvas.jsx:45-46` | 카드 더블클릭 시 `onNodeClick` 2회 + `onNodeDoubleClick` 1회가 순차 발생. 이슈 카드는 선택 2회(멱등) + 토글 1회로 의도대로지만, **폴더 노드는 토글이 3회** 돌아 최종 상태는 맞되 중간에 레이아웃이 2번 더 튄다(깜빡임) | 신경 쓰이면 폴더에서 `onNodeDoubleClick` 을 무시. 기능 결함 아님 |
| O6 | 작업 트리 전반 | 검증 중 워킹 트리에 **이 기능과 무관한 변경**(`components/calendar/*`, `pages/projectDetail/calender/*`, `locales/*/calendar.json`)이 병행 유입됐다. 커밋 시 범위가 섞일 수 있다 | 커밋 전 `git add` 를 issue-map 범위로 한정할 것 |

---

## 4. 미검증 (5건 — 추측으로 통과 처리하지 않음)

| # | 항목 | 이유 / 필요한 것 |
|---|---|---|
| U1 | **dev-status 실호출**(설계 R1/R2) | `/rest/dev-status/latest/issue/detail` 이 Forge 프록시를 통과하는지, `read:jira-work` 로 충분한지, 응답 shape 이 파서 가정과 같은지는 **로컬에서 검증 불가**. dev 배포 후 네트워크 탭에서 상태코드 + 응답 body 확보 필요. 실패 시 붉은 박스가 아니라 회색 안내가 뜨는지도 함께 확인(코드상으로는 보장, 실호출로 재확인) |
| U2 | 다크 모드 육안 | `token()`/`var(--ds-*)` 사용은 정적으로 확인했으나 실제 대비·미니맵 마스크(O1)·React Flow 컨트롤 렌더는 브라우저 확인 필요 |
| U3 | 대량 이슈 팬/줌 체감(R4) | 메모 경계·접힘 미생성은 코드로 확인했으나 수백 노드 실데이터 프레임률은 미측정 |
| U4 | 트리 ↔ 맵 계층·형제 순서 육안 대조 | **같은 `filterGanttTasks` → `toSvarTasks` → `buildWorkTree` 를 쓴다는 것은 코드로 확인**했고, `layoutIssueTree` 가 재정렬하지 않는 것도 테스트로 고정됐다. 다만 같은 필터 상태에서의 실화면 대조는 미수행 |
| U5 | 루트 `npm test`(백엔드) | 지시에 따라 **생략**. 근거: `git status --porcelain src/ manifest.yml` 이 빈 출력 — 백엔드 무변경 확인. `src/` 를 건드리는 후속 작업이 생기면 반드시 실행할 것 |

---

## 5. 재작업 지시 요약 (리더용)

- **frontend-engineer 재호출 1건**: F1 — `TreeDetailPanel.jsx` 를 `WorklogHistoryList` 로 치환(위 4단계).
  `errorText` 를 넘기지 않는 것이 핵심(트리 기존 동작 보존).
- backend-engineer 재호출: **없음**(`src/` 무변경 확인).
- F1 수정 후 `cd static/ui && npm test` 재실행이면 충분하다(빌드는 영향 없음).
- 나머지 O1~O6 는 기능 결함이 아니므로 재작업 대상에서 제외 권고. dev 배포 후 U1~U4 를 리더가 확인.
