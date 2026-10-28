# 통합 검증 리포트 — 공용 테이블 컴포넌트 기능 개선

> 2026-08-12 · 검증 기준 `01_architect_design.md`(§2 계약 / §8 테스트 설계 / §8-5 수동 검증) 대비 `02_frontend_report.md` + 실소스
> 프론트 전용이므로 경계면 = `components/table/*` ↔ 호출부. 백엔드 경계면 없음(resolver/DB 변경 0 — git status로 `src/` 무변경 확인).

**종합 판정: 조건부 통과 (2026-08-12 3차 재검증 최종).**
**코드 레벨 실패 0건** — F-1 → F-1b → 최종 수정까지 3회전 끝에 오버레이 좌표 문제가 구조적으로 해소됐고(`right >= 0` 불변식), F-2 계약 주석도 반영됐다. 계약·하위호환·성능·테스트·빌드 전부 통과.
**남은 조건 2가지** — ⑴ §8-5 브라우저 검증 7항목(특히 `table-layout:fixed` + % 폭에서 가로 스크롤바 유무) 미수행, ⑵ F-3 범위 밖 28파일 혼입에 대한 리더 판단. 둘 다 코드 결함이 아니므로 **배포 전 수동 확인을 조건으로 통과**로 본다.

---

## 0. 요약표

| 분류 | 건수 | 항목 |
|------|------|------|
| **통과** | 11 | 하위호환 / 호출부 무수정 / §2-B 3동작 / §2-C 판정표 / 화살표 시뮬레이션 3류 / 폭 동결 안전성 / 리사이즈-정렬 충돌 / 성능 메모 / 테스트 / 빌드·번들 / i18n |
| **해소** | 3 | ~~F-1~~ 오버레이 좌표 기준(§2-R R-1) · ~~F-1b~~ 컨테이너 폭 추종·가로 overflow(§2-R **R-7**) · ~~F-2~~ `sortValue` 균일성 계약(§2-R R-6) |
| **실패** | **0** | — |
| **권고** | 2 | `CommonTable.jsx` JSDoc 에 균일성 1줄(P-1) · `sortValue` shape 혼재 회귀 테스트 1건(P-2) — 둘 다 심각도 하 |
| **알려진 한계** | 1 | `gutter` 는 동결 시 1회 계측 — 동결 후 세로 스크롤바가 새로 생기면 핸들 최대 ~15px 오차(`maxHeight` 표 2곳 한정, 재마운트 시 해소). 설계 문서화 대상 |
| **범위 밖** | 1 | F-3 작업 트리에 이 기능과 무관한 28파일 수정 혼입(폰트 굵기 700→600 등) — 리더 판단 |
| **미검증** | 8 | §8-5 수동 검증 7항목 + `isLoading` 판정 붙들기(React 훅, 렌더 테스트 부재) |

---

## 1. 통과 (PASS)

### P-1. 하위 호환 무회귀 — 3종 래퍼 공개 props 무변경 ✅

구버전(git HEAD) ↔ 현재 구조분해 파라미터 목록을 `git diff`로 직접 대조했다.

| 컴포넌트 | 구버전 props | 현재 props | 판정 |
|---|---|---|---|
| `CommonTable.jsx:33-47` | head, rows, rowsPerPage=10, defaultPage=1, emptyMessage, emptyView, isLoading=false, skeletonRows, maxHeight, wrapperStyle, isFixedSize=false | **동일** + `isResizable=true`, `stableWidths=true` | 통과 (기본값 추가만, 기존 11개 이름·기본값 전부 보존) |
| `PagingTable.jsx:13-23` | head, rows, isLoading, pageInfo, page, onChangePage, onSearch, SearchBar, emptyMessage | **완전 동일**(구조분해 블록 diff 없음, 본문만 교체) | 통과 |
| `CursorPagingTable.jsx:15-29` | head, rows, isLoading, emptyView, pageSize, onPageSizeChange, currentPageIndex, currentCount, hasNext, hasPrev, onPrev, onNext, isLoadingMore | **완전 동일** | 통과 |

동작 계약도 보존됐다:
- `TableSurface.jsx:113-114` 가 `rowsPerPage`/`defaultPage` 를 **non-null 일 때만** 하달 → `PagingTable`·`CursorPagingTable`(서버 페이징이라 내부 페이지네이션을 쓰면 안 됨)의 "DynamicTable 페이지네이션 없음" 동작이 그대로 유지된다. `CommonTable` 만 기본 10/1 을 전달.
- `isLoading` → 스켈레톤 행 치환 + `DynamicTable isLoading={false}` 라는 기존 규약 유지(`TableSurface.jsx:47,110`).
- `head.cells` 가 0개일 때 `buildSkeletonRows` 가 `[]` 를 돌려주는 것도 구버전 `loadingRows ?? rows` 와 동일 결과(빈 배열은 nullish 아님).

### P-2. 호출부 무수정 ✅

`git status` 기준 표 호출부 중 수정된 파일은 **M1/M2/M3 4개뿐**이다.

```
static/ui/src/pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx   (M1)
static/ui/src/pages/portfolio/widgets/PortfolioProjectTable.jsx                        (M2)
static/ui/src/backoffice/page/storage/StorageProjectList.jsx                           (M3)
static/ui/src/backoffice/page/storage/StorageTableList.jsx                             (M3)
```

- `CommonTable`/`PagingTable`/`CursorPagingTable` 을 import 하는 호출부 파일은 실측 **38개**(설계서의 "60파일"은 테이블 인스턴스 기준 집계로 보이며, 무수정 조건 자체에는 영향 없음).
- `TreeTable.jsx` 무수정 ✅ (§9 비목표 준수)
- `@atlaskit/dynamic-table` 직접 import 는 **`TableSurface.jsx` 단 1곳**(전역 grep) → 공용 지점 우회 없음.

### P-3. §2-B 필수 3동작 ✅

| 필수 동작 | 구현 위치 | 확인 |
|---|---|---|
| ① `sortValue`/`sortKey` strip | `tableSort.js:199` `const { sortValue, sortKey, ...rest } = cell` | 통과. 추가로 `adaptRows:174-185` 가 **정렬 대상이 아닌 컬럼에 남은 sortValue/sortKey 도** 스캔해 걷어낸다 — F5 누수 완전 차단 |
| ② 정렬 컬럼 셀 `key` 를 정규화 정렬값으로 덮어쓰기 | `tableSort.js:200` `if (column) rest.key = column[r]` | 통과 |
| ③ 결측치 채움 · 컬럼 단위 타입 통일 | `tableSort.js:154-160` — `present.every(isNumericLike)` 로 컬럼 타입 결정, 숫자 `Number.NEGATIVE_INFINITY` / 문자 `''` | 통과 (§3-1 문구와 일치) |

`isNumericLike`(`:44-51`)가 `''` 를 숫자로 보지 않아(`trimmed !== ''` 가드) 빈 문자열 결측이 숫자 컬럼을 오염시키지 않는다.

### P-4. §2-C 판정표 5행 전부 구현 ✅

| 설계 §2-C 행 | 구현 | 확인 |
|---|---|---|
| `sortValue`/`sortKey` 보유 → 정렬 가능 | `tableSort.js:84` (조기 반환) | 통과 |
| 셀 `key` 서로 다른 값 2개 이상 → 정렬 가능 | `tableSort.js:88-93,95` | 통과 |
| `key` 전 행 동일/전무 → 정렬 불가 + `isSortable:false` 덮어쓰기 | `tableSort.js:95` + `adaptHead:119` | 통과 |
| `rows.length < 2` → 정렬 불가 | `tableSort.js:75` | 통과 |
| `isLoading` → 직전 판정 유지(`useRef`) | `TableSurface.jsx:59-69` | 코드상 구현 확인. **런타임 동작은 미검증**(§4 참조) |

`head.cells[i].isSortable !== true` 인 컬럼은 `tableSort.js:74` 에서 즉시 false → **호출부가 요청하지 않은 곳에 화살표를 새로 만들지 않는다**는 계약 준수 (전용 테스트 `tableSort.test.js:79-87` 존재).

### P-5. 보강 3건 타당성 재확인 ✅ (리더 승인 건)

1. **head 셀 `isResizable` strip** (`tableSort.js:117`) — 타당. `isResizable` 은 §2-A 신규 계약 필드이고 DynamicTable 은 head 셀의 미지정 필드도 `<th>` 로 스프레드하므로, strip 하지 않으면 F5 와 **정확히 같은 종류의** 새 unknown-prop 경고를 만들어냈을 것. strip 이 `TableSurface.jsx:99` 의 `edges` 계산(원본 `head.cells` 를 봄)보다 뒤에 오므로 기능 손실도 없다.
2. **`adaptTable` → `adaptHead`+`adaptRows` 분해** — 타당하며 **실제 버그를 막는다.** `headSignature`(`useStableColumnWidths.js:24-28`)는 컬럼 key 만 이어붙이므로, `ResourceAnalysisTable` 의 `mmHeader`/`effectiveMdHeader`(`baseMmDays`·`hourRate` 의존 툴팁)처럼 **key 는 그대로인데 content 가 바뀌는** 헤더가 시그니처 메모에 갇혀 옛 값으로 남는다. head 를 매 렌더 재작성하는 선택은 O(컬럼 수)라 비용도 무시할 만하다.
3. **`sortValue: null` 비폴백** (`tableSort.js:33-38`, `has()` 존재 여부로 분기) — 타당. M1 `effectiveMd` 가 실제로 이 경로를 밟는다(`ResourceAnalysisTable.jsx:211` `sortValue: effective ?? null`). 폴백했다면 결측 행의 정렬값이 문자열 `'effectiveMd'` 가 되어 `present.every(isNumericLike)` 가 깨지고 **컬럼 전체가 문자열 정렬**로 뒤집혔을 것. 회귀 테스트도 있다(`tableSort.test.js:118-127`).

부수 추가된 `resetEdgeWidths`(쌍의 합 보존)도 전체 합 100 불변식을 지킨다(`columnWidths.js:88-91`, 테스트 `columnWidths.test.js:91-105`).

### P-6. 화살표 판정 시뮬레이션 — 대표 3류 ✅

호출부 32개 파일의 head/rows 생성 코드를 전수로 열어 판정을 추론했다.

| 류 | 대상 | 판정 결과 | 근거 |
|---|---|---|---|
| **(a) 정상 정렬 유지** | `MyIssuesPanel.jsx` 5컬럼, `MyWorklogPanel.jsx` flat 4 + grouped 4 | **전부 유지 · 실동작** | 셀 key 가 실데이터(`row.issueKey`:115, `row.statusName`:135, `row.duedate ?? "9999-99-99"`:158, `r.started`:150, `r.seconds`:172·227) → 행마다 달라 판정 통과. **정규화 후에도 순서 동일**: `r.seconds`·`r.count` 는 원래 number → `Number` 유지, `row.isAssignee ? "1":"2"` 는 numeric-like → `1`/`2` 숫자 변환(순서 동일), 나머지 문자열은 String 유지 |
| **(b) 죽은 화살표 제거** | portfolio 위젯 15파일 · cost 4 · progress 3 · taskHistory 1 · teamAnalytics 5 (총 **30파일**) | **전부 제거** | 셀 key 가 컬럼 식별자 고정. 예: `PortfolioRiskTop.jsx:56-58` head `project/risk/diff` ↔ rows `:70-75` `key:'project'|'risk'|'diff'` |
| **(c) M2 부활** | `PortfolioProjectTable.jsx` | **7컬럼 부활 · 실동작** | head `:59-66` isSortable 7개 ↔ rows `:83,106-111` 에 `sortValue` 7개. `status`(`:60`)·`risk`(`:67`)는 원래 isSortable 없음 → 판정 대상 아님 ✅ |

> **가장 오판하기 쉬운 지점을 별도로 확인했다.** "행마다 key 가 다르지만 데이터와 무관(인덱스·id)" 이라 **화살표가 남는데 정렬이 무의미한** 컬럼은 현재 **0건**이다.
> - 동적 시리즈 컬럼 5곳(`PortfolioEffortTrend.jsx:60/72`, `PortfolioRoleLevelDist.jsx:40/52`, `TeamCompositionStack.jsx:48/57`, `TeamUtilBandStack.jsx:55/66`, `TeamProjectStack.jsx:78/94`)은 key 가 **열 방향으로만** 변하고 행 방향으로는 상수 → 정상적으로 제거된다.
> - `` `${p.issueKey}-${i}` `` 같은 인덱스 표현식(`PortfolioProblemBubble.jsx:75`, `PortfolioUtilization.jsx:228`, `PortfolioScheduleGantt.jsx:207`)은 전부 **행 key**(React key)이지 셀 key 가 아니다 — 판정에 관여하지 않는다.
> - 이 부류의 유일한 실사례였던 storage 2파일은 M3 가 해소했다. 특히 `StorageProjectList.jsx:35` `name` 컬럼(셀 key `` `name-${idx}` `` → 원본 인덱스 순 정렬)은 **설계서가 지목하지 않은 잔여 오답**이었고 프론트가 `sortValue: p.name` 로 잡았다 — 리포트 §8-3 의 주장이 코드로 확인된다. `StorageTableList.jsx:16` `desc` 컬럼은 `isSortable:false` 라 판정 대상이 아니어서 `` `desc-${idx}` `` key 가 남아도 무해하다.

한편 **§2-E "정상 정렬 3개 무회귀"** 도 성립하나, `MyIssuesPanel` `issueKey` 컬럼의 문자열 사전순 정렬(`X-10 < X-9`)은 **개선 전부터 있던 동작**이며 이번 변경으로 달라지지 않는다(정규화가 String 유지).

### P-7. 폭 동결 안전성 ✅

| 점검 | 결과 | 근거 |
|---|---|---|
| 스켈레톤 단계 동결 방지 | 통과 | `useStableColumnWidths.js:44` `if (isLoading \|\| rowCount < 1) return;` — `rowCount` 는 `TableSurface.jsx:82` 에서 **스켈레톤이 아닌 `dataRows.length`** 를 넘긴다 |
| 빈 상태 동결 방지 | 통과 | 같은 가드(`rowCount < 1`). 동결 **후** 필터로 0건이 되는 경우는 시그니처가 같아 기존 폭 유지 → 의도된 동작 |
| 시그니처 리셋 | 통과 | `:31,43,63` — `frozen` 이 `{signature, baseline, widths, theadHeight}` 한 덩어리라 **원자적으로** 리셋된다. 시그니처 불일치 동안 `active=null` → `is-width-frozen` 해제 → auto 로 다시 그린 뒤 재계측 |
| jsdom/레이아웃 없는 환경 가드 | 통과 | `columnWidths.js:29` `if (!(total > 0)) return null` → `useStableColumnWidths.js:56` 에서 동결 중단. 전용 테스트 `columnWidths.test.js:28-33` |
| 계측 대상 오염(중첩 표) | 통과 | `:51` `table.tHead?.rows?.[0]?.cells` (표준 API) — `querySelectorAll('thead th')` 회피 |
| 컬럼 수 불일치 | 통과(fail-safe) | `:52` `headCells.length !== columnCount` 면 동결하지 않음 |
| 무한 루프 | 통과 | 의존성 배열 없는 `useLayoutEffect` 지만 `:43` 가드가 동결 후 O(1) 탈출 |
| `ChartTableToggle` 27표 무회귀 | 통과 | `isFixedSize` 는 `TableSurface.jsx:111` 로 **그대로 통과**만 시킨다. 이미 균등폭 → 계측값도 균등 → 동일 |
| 계측값 미정규화(합 80 유지) | 통과 | `toPercentWidths` 는 픽셀 **비율**을 100%로 환산 — 선언값이 아니라 렌더 결과를 본다 |

### P-8. 리사이즈 ↔ 정렬 클릭 충돌 없음 ✅

- 핸들은 헤더 `Pressable` **내부가 아니라** 형제 오버레이다(`ColumnResizeOverlay.jsx`) → 접근성 위반(버튼 안 인터랙티브 요소) 회피.
- `.table-col-resize-overlay { pointer-events: none }` + `.table-col-resizer { pointer-events: auto }`(`table.css:87,98`) → **핸들 6px 밖은 정렬 버튼이 그대로 받는다.**
- 핸들 위에서는 `pointerdown` 에서 `preventDefault()` + `stopPropagation()`(`:35-36`) 하고 이벤트 타깃 자체가 핸들이므로 정렬이 발동하지 않는다.
- 핸들 높이 = `theadHeight` 로 제한(`:81`) → `rows[].onClick` 행 클릭(M1 `ResourceAnalysisTable.jsx:175` 포함) 무간섭.
- `touch-action: none`(`table.css:97`) + `setPointerCapture` → 전역 `body{user-select}` 오염 없음.
- **sticky thead 는 이 리포에 존재하지 않는다**(`position:sticky` 전역 grep 결과 3건 모두 표와 무관: `ProjectCardList.jsx:34`, `WorkQueuePanel.jsx:79`) → "스크롤 시 헤더는 고정인데 핸들만 흘러내림" 은 발생하지 않는다. **단 좌표 기준 문제는 별건 — F-1 참조.**

### P-9. 성능 패턴 ✅

| 점검 | 결과 |
|---|---|
| head 시그니처 메모(인라인 head 대응) | `TableSurface.jsx:53,68,74` — `useMemo` 의존성이 `head` 객체 참조가 아니라 `signature` 문자열. §3-1 준수 |
| 무변경 최적화(원본 참조 반환) | `tableSort.js:187` `if (!needsRewrite) return rows` — 레거시 표(대다수)에서 렌더당 O(행×열) 할당 0. 테스트 `tableSort.test.js:150-167` 가 `toBe(rows)` 로 참조 동일성 단언 |
| 100행 규모 정렬 어댑터 비용 | 정렬 대상 컬럼만 스캔(`:152 if (!sortable?.[i]) continue`). 비정렬 표는 `hasSortMeta` 스캔 O(행×열) 의 `hasOwnProperty` 2회뿐 → 100행×10열 = 2,000회/렌더, 무시 가능 |
| 계측 비용 | 동결 후 `useLayoutEffect` 가 O(1) 로 탈출. `ResizeObserver` 미도입(설계 §4-2 준수) |
| 오버레이 위치 계산 | `widths` 누적합(%) — DOM 을 매 프레임 읽지 않음(`ColumnResizeOverlay.jsx:66-72`). 드래그 시작 시 `getTableWidth()` 1회만 |
| 신규 의존성 | 0 (`package.json` 무변경) |

> 관찰(문제 아님): `adaptHead` 는 의도적으로 매 렌더 새 head 객체를 만든다(P-5-2 근거). head 를 `useMemo` 로 안정화해 둔 소수 호출부는 DynamicTable 재렌더가 1회 더 생기지만, 호출부 대다수가 이미 head 를 인라인 생성하므로 실질 변화 없음.

### P-10. 테스트 실행 + §8 케이스 대조 ✅

```
cd static/ui && npm test
  Test Suites: 69 passed, 69 total
  Tests:       1164 passed, 1164 total
  Snapshots:   1 passed, 1 total
```

| 설계 §8 케이스 | 커버 위치 | 판정 |
|---|---|---|
| §8-1 레거시 식별자 key → 정렬 불가 + `isSortable:false` | `tableSort.test.js:13-30` | ✅ |
| §8-1 실데이터 key → 정렬 가능 유지 | `:32-40` | ✅ |
| §8-1 `sortValue` → key 대체 | `:42-51` | ✅ |
| §8-1 `sortKey` 별칭 | `:53-62` (+우선순위 `:64-71`) | ✅ 초과 |
| §8-1 rows 0건/1건 | `:73-77` | ✅ |
| §8-1 strip 회귀 가드 | `:91-104` | ✅ |
| §8-1 결측 정규화·타입 단일화 | `:106-148` (숫자/문자/혼재 3케이스) | ✅ 초과 |
| §8-1 무변경 최적화 참조 동일성 | `:150-167` | ✅ |
| §8-1 `isSortable` 미지정 컬럼 | `:79-87` | ✅ |
| §8-2 `toPercentWidths` 합 100·잔차·0폭 방어 | `columnWidths.test.js:11-34` | ✅ |
| §8-2 `applyResizeDelta` 인접2·합보존·클램프·대칭 | `:47-88` | ✅ |
| §8-2 `minPctFromPx` 0 방어 | `:36-45` | ✅ |
| §8-3 3종이 `TableSurface` 사용 + DynamicTable 직접 사용 금지 | `tableContract.test.js:15-27` | ✅ (설계보다 강함 — 역방향 가드 포함) |
| §8-3 `CommonTable` 공개 props 유지 | `:29-52` | ✅ |
| §8-3 마이그레이션 3그룹 `sortValue` 사용 | `:54-73` | ✅ (+`sortKey` 잔존 금지 가드) |
| §8-4 스냅샷 무영향 | 실행 결과 `Snapshots: 1 passed` | ✅ |
| §2-C `isLoading` 직전 판정 유지 | **테스트 없음** | ⚠ 미검증(§4-8) |

### P-11. 빌드 · 번들 ✅

```
cd static/ui && CI=true npm run build   → 성공(exit 0), eslint 에러 0
bundle:check → {"gzipBytes":895166,"budgetBytes":950000,"withinBudget":true}
```
설계 §8-5-7 의 "gzip 950KB 예산, 현재 895KB" 와 정확히 일치 — **신규 코드로 인한 증가분이 반올림 단위 이하**다(신규 의존성 0).

### P-12. i18n ✅

| 점검 | 결과 |
|---|---|
| 소스 파일에 4키 추가 | `locales/kr/common.json` · `locales/en/common.json` 의 `table` 블록에 `sortAsc`/`sortDesc`/`sortButton`/`resizeColumn` ✅ |
| merge 실행 | `locales/ko-KR.json` · `locales/en-US.json` 에 동일 4키 반영 확인(diff) ✅ — 산출물 갱신이지 직접 수정이 아님 |
| `locales/script/*.json`(빈 스텁) 오용 | 없음 ✅ |
| `t()` 키 경로 일치 | `TableSurface.jsx:41-43,122` 의 `common.table.*` 가 기존 `common.table.pageSize`/`prev`/`next`(`CursorPagingTable.jsx:80,103,113`)와 동일 네임스페이스 ✅ |
| 주입 지점 | `adaptHead`(`tableSort.js:121-125`) 1곳 — 호출부 지정값 우선(`== null` 체크) ✅ |

---

## 2. 실패 (FAIL)

> **[2026-08-12 재검증] F-1·F-2 수정 반영분 확인 완료.** 원 증상은 둘 다 해소됐으나 **F-1 수정이 새 부작용 2건을 도입**했다(=내가 제시한 1안의 결함). 재검증 결과는 §2-R 에 기록한다. 아래 F-1/F-2 원문은 이력 보존용이다.

---

## 2-R. 재검증 결과 (F-1 / F-2 수정 반영분)

### R-1. §2 1안과의 일치 — **일치 ✅**

| 1안 요구 | 구현 | 판정 |
|---|---|---|
| 계측 시 테이블 폭을 `frozen` 에 함께 저장 | `useStableColumnWidths.js:70` `tableWidth: table.getBoundingClientRect().width ?? 0` | ✅ |
| 훅이 `tableWidth` 를 노출 | `:89` `tableWidth: active?.tableWidth ?? 0` (시그니처 불일치 시 0 — `widths`/`theadHeight` 와 동일한 원자적 리셋 규약) | ✅ |
| `TableSurface` 가 오버레이에 하달 | `TableSurface.jsx:79` 구조분해 → `:122` `tableWidth={tableWidth}` | ✅ |
| 오버레이 최상위 div 에 px width | `ColumnResizeOverlay.jsx:84` `style={{ width: tableWidth }}` | ✅ |
| `table.css` 의 `right: 0` 제거 | `.table-col-resize-overlay` 에서 `right: 0` 삭제(`left:0; top:0; height:0` 유지), 사유 주석 동반 | ✅ |

### R-2. 드래그 델타 환산이 여전히 실시간 폭 기준인가 — **유지 ✅**

- `ColumnResizeOverlay.jsx:33` `const liveTableWidth = getTableWidth?.() ?? 0;` — `getTableWidth`(`TableSurface.jsx:92-95`)는 **DOM 을 그 순간 실측**한다. 이 값으로 `dragRef.current.tableWidth`(`:45`)와 `minPct`(`:46`)를 정하고, `handlePointerMove:54` 가 `drag.tableWidth` 를 쓴다.
- 즉 **드래그 환산·최소폭 클램프는 `pointerdown` 시점의 실제 테이블 폭** 기준이고, 신규 prop `tableWidth`(계측 시점 동결값)는 **오버레이 좌표 상자에만** 쓰인다. 두 용도가 코드상 완전히 분리돼 있다.
- 개명(`tableWidth` → `liveTableWidth`)의 성격: 개명 전에도 지역 변수가 prop 을 가려(shadow) **동작은 동일**했으므로 실동작 버그는 아니었다. 다만 같은 이름의 두 값(동결 폭 / 실측 폭)이 한 함수 안에 공존하면 이후 수정에서 뒤바뀌기 쉬웠다 — **예방적 개선으로 타당**하며, 지금은 이름만 보고도 어느 쪽인지 알 수 있다.

### R-3. `tableWidth <= 0` fail-safe 부작용 — **없음 ✅**

- 가드 위치: `ColumnResizeOverlay.jsx:66` `if (!Array.isArray(widths) || widths.length < 2 || !(theadHeight > 0) || !(tableWidth > 0)) return null;`
- **동결 전에는 애초에 오버레이가 렌더되지 않는다** — `TableSurface.jsx:97` 의 `showResizer` 가 `Array.isArray(widths) && widths.length > 1` 을 요구하므로, 계측 전(`widths === null`)에는 `<ColumnResizeOverlay>` 자체가 마운트되지 않는다. 새 가드는 "동결은 됐는데 `tableWidth` 만 0" 인 희귀 경로용 이중 안전망이다.
- **다른 동작 무간섭**: 정렬(`adaptHead`/`adaptRows` → `frozenHead`/`adaptedRows`)과 폭 동결(`frozenHead` 의 `cells[].width`)은 `TableSurface.jsx:88-90` 에서 `widths` 만 보고 결정되며 오버레이 렌더 여부와 **경로가 완전히 분리**돼 있다. 오버레이가 null 이면 **드래그 핸들만** 사라지고 화살표·폭 동결·`is-width-frozen` 클래스는 그대로다.
- jsdom 등 레이아웃 없는 환경은 `toPercentWidths` 가 null 을 돌려줘(`columnWidths.js:29`) 동결 자체가 일어나지 않으므로 이 가드까지 오지도 않는다.

### R-4. 테스트 재실행 — **통과 ✅**

```
cd static/ui && npx jest src/components/table --silent
  Test Suites: 3 passed, 3 total
  Tests:       54 passed, 54 total
```

### R-5. **[신규 실패] F-1b — 1안이 도입한 부작용 2건**

**심각도: 중** · **이것은 내(검증자) 1안 권고의 결함이다.** 오버레이 좌표 상자를 래퍼(`right:0`, 컨테이너 추종)에서 **계측 시점 px 고정폭**으로 바꾸면서, 원 증상(세로 스크롤바 ~15px)은 해소했지만 **컨테이너 폭 변화 추종을 잃었다.**

동결 후 표는 `table-layout: fixed` + `.table-wrapper table { width: 100% }`(`table.css:49,69`)라 **컨테이너 폭이 바뀌면 테이블 폭도 따라 바뀐다.** 반면 오버레이는 `style={{ width: tableWidth }}` 로 계측 시점 px 에 못 박혀 있다. 재계측은 시그니처 변경·재마운트에서만 일어난다(`useStableColumnWidths.js:43`).

| 부작용 | 증상 | 조건 |
|---|---|---|
| **A. 핸들 위치 어긋남** | 핸들 `left` 는 `widths[]` 누적%인데 기준 상자 폭이 낡아, 어긋남 = (현재 테이블 폭 − 계측 폭) × 누적%. 최우측 경계에서 최대. | 창 리사이즈, **Jira 사이드바 접기/펼치기(≈240px)** — Forge iframe 앱이라 실제로 흔하다 |
| **B. 가로 스크롤바 유발** | `.table-wrapper` 는 `overflow-x: auto`(`table.css:10`)이고 절대배치 자식은 scrollable overflow 에 기여한다. 컨테이너가 계측 시점보다 **좁아지면** 오버레이(px 고정)가 래퍼를 넘쳐 **없던 가로 스크롤바가 생긴다.** 종전 `right: 0` 에서는 구조적으로 불가능했던 증상 | 컨테이너가 좁아지는 모든 경우 |

**수정 방법 (권장 — 두 문제를 동시에 해소)**
오버레이를 **다시 래퍼에 붙이되(`left:0` + `right`), 세로 스크롤바 폭만 인라인으로 보정**한다. 스크롤바 폭은 컨테이너 폭과 무관하게 일정하므로 동결값으로 충분하고, `right` 방식은 컨테이너 폭 변화를 자동 추종하며 `right >= 0` 이라 가로 overflow 도 만들지 않는다.

1. `useStableColumnWidths.js:65-71` — `tableWidth` 대신(또는 함께) **여백**을 저장:
   ```js
   const wrapperWidth = wrapperRef.current.getBoundingClientRect().width;
   const tableWidth   = table.getBoundingClientRect().width;
   // ≈ 세로 스크롤바 폭. 컨테이너 폭이 바뀌어도 이 값은 변하지 않는다.
   gutter: Math.max(0, wrapperWidth - tableWidth),
   ```
   `tableWidth` 는 fail-safe 판정용으로 계속 노출해도 무방하다.
2. `TableSurface.jsx:122` — `tableWidth={tableWidth}` 옆에 `gutter={gutter}` 하달.
3. `ColumnResizeOverlay.jsx:84` — `style={{ width: tableWidth }}` → `style={{ right: gutter }}` (`width` 지정 제거. `table.css` 의 `left: 0` 이 그대로 살아 `left:0 + right:gutter` 로 폭이 결정된다).
4. `:66` 의 `!(tableWidth > 0)` fail-safe 는 그대로 두어도 된다(계측 실패 판정으로 계속 유효).

> **참고**: 오버레이를 `<table>` 의 형제가 아니라 테이블을 감싸는 별도 `position:relative` 래퍼 안에 두는 방식도 가능하나, DOM 구조를 바꾸면 `.table-wrapper` 선택자에 의존하는 기존 CSS(`table.css:15-46`, `card-flush-body`, `clickable-rows`, `app-main--backoffice` 보정)를 전부 재확인해야 한다 — 3번 수정이 최소 변경이다.

### R-7. **[F-1b 수정 재검증 — 해소 ✅]** (2026-08-12 2차)

#### R-7-1. 3파일이 권장안과 일치하는가 — **일치 ✅**

| 권장안 | 구현 | 판정 |
|---|---|---|
| 계측 시 `gutter = wrapperWidth − tableWidth` 저장 | `useStableColumnWidths.js:59-60,80-86` — `wrapperRef.current.getBoundingClientRect().width` 로 래퍼 폭을 읽고 `gutter: Math.max(0, wrapperWidth - tableWidth)` 로 동결. `Math.max` 가 **원천에서 음수를 차단** | ✅ |
| 훅이 `gutter` 노출 | `:102` `gutter: active?.gutter ?? 0` — `widths`/`theadHeight`/`tableWidth` 와 동일한 "시그니처 불일치 시 중립값" 규약 | ✅ |
| `TableSurface` 가 하달 | `:79` 구조분해 → `:122` `gutter={gutter}` (`tableWidth` 는 fail-safe 판정용으로 병행 유지) | ✅ |
| 오버레이: `width` 제거 + `right: gutter` | `ColumnResizeOverlay.jsx:92` `<div className="table-col-resize-overlay" style={{ right: safeGutter }}>` — 인라인 `width` 없음 | ✅ |
| `table.css` 의 `left: 0` 유지, `right`/`width` 미지정 | `.table-col-resize-overlay { position:absolute; top:0; left:0; height:0; pointer-events:none }` — `right` 는 인라인 전용임을 주석으로 못 박음 | ✅ |
| 드래그 환산은 실시간 폭 유지 | `:33` `liveTableWidth = getTableWidth()` → `dragRef.tableWidth`/`minPct`. 신규 `gutter` 는 좌표 상자 전용으로 **드래그 경로에 관여하지 않음** | ✅ |
| `tableWidth <= 0` fail-safe 유지 | `:66` 가드 그대로 | ✅ |

#### R-7-2. `right >= 0` 보장 → 가로 overflow 구조적 불가 — **확인 ✅**

- **값 경로 2중 보증**: ① 생산 측 `Math.max(0, wrapperWidth - tableWidth)`(`useStableColumnWidths.js:86`) ② 소비 측 `const safeGutter = Number.isFinite(gutter) && gutter > 0 ? gutter : 0`(`ColumnResizeOverlay.jsx:89`). `NaN`·`undefined`·음수가 전부 0 으로 수렴하므로 **`safeGutter` 는 항상 유한 실수 ≥ 0**.
- **박스 계산**: 오버레이는 `left: 0`(CSS) + `right: safeGutter`(인라인)이고 **`width` 는 `auto`** 다. 절대배치에서 `left`/`right` 가 지정되고 `width:auto` 면 used width = 컨테이닝 블록 폭 − left − right = **래퍼 패딩박스 − safeGutter ≤ 래퍼 패딩박스**. over-constrained 해소 규칙(left+width+right 전부 non-auto일 때만 발생)에도 걸리지 않는다. → 오버레이의 오른쪽 가장자리가 래퍼 패딩 오른쪽 경계를 **넘을 수 없다** → `.table-wrapper`(`overflow-x:auto`)의 우측 scrollable overflow 에 기여 불가. **F-1b ⓑ(가로 스크롤바 유발) 구조적으로 소멸.** ✅
- **컨테이너 폭 변화 추종**: 폭이 `left/right` 로 결정되므로 창 리사이즈·Jira 사이드바 토글(≈240px)에 오버레이가 테이블과 **함께** 늘고 준다. 핸들 `left` 는 % 라 자동으로 비례한다. **F-1b ⓐ(핸들 어긋남) 소멸.** ✅
- **핸들 자식의 넘침 여부**: 마지막 핸들의 `left` 는 `widths[0..n-2]` 누적합이라 **마지막 컬럼 폭(최소 `MIN_COL_PX` 상당, 통상 ≥5%)만큼 100% 에 못 미친다.** 핸들 폭 6px(`margin-left:-3px`)이 그 여유를 넘을 수 없으므로 자식 경로로도 넘침이 생기지 않는다. ✅

#### R-7-3. `gutter` 0 폴백 재량 판단 — **타당 ✅ (오히려 필수)**

구현측이 "gutter 비정상 시 미렌더 대신 0 폴백"을 재량으로 택했다. 검토 결과 **이 판단이 옳고, 반대로 했다면 심각한 회귀였다.**

- **`gutter === 0` 은 오류가 아니라 정상 다수 케이스다.** `maxHeight` 를 쓰지 않는 표(호출부 38개 중 `PortfolioUtilization.jsx:136`·`ProgressRiskTable.jsx:141` 2곳을 제외한 거의 전부)는 세로 스크롤바가 없어 `wrapperWidth === tableWidth` → gutter 가 **정당하게 0** 이다. `gutter <= 0` 을 실패로 보고 렌더를 포기했다면 **사실상 모든 표에서 리사이즈 기능이 사라졌을 것**이다.
- **실패 시 열화가 유계(bounded)하고 방향이 안전하다.** gutter 를 못 읽은 최악의 경우 동작은 종전 `right: 0` 과 동일 — 즉 **F-1 원 증상(핸들 최대 ~15px 오차)으로 되돌아갈 뿐**이고, 기능 소실·레이아웃 파괴·가로 스크롤바는 없다. 코드 주석(`:86-88`)도 이 트레이드오프를 정확히 기술한다.
- `tableWidth <= 0`(계측 자체 실패)에는 **여전히 미렌더** 가드가 걸려 있어(`:66`), "기준 상자를 전혀 모르는 경우"와 "여백만 모르는 경우"를 **다른 강도로** 처리한다. 판단이 일관적이다.

> **잔여(수용 가능, 실패 아님)**: `gutter` 는 동결 시점 1회 계측이므로, 동결 **이후** 필터·데이터 증가로 세로 스크롤바가 새로 생기거나 사라지면 값이 낡아 핸들이 최대 ~15px 어긋난다. `maxHeight` 표(2곳)에서만, 스크롤바 상태가 동결 후 토글될 때만 발생하며 시그니처 변경·재마운트 시 재계측된다. F-1b(최대 240px + 가로 스크롤바) 대비 2자릿수 작은 잔차라 **알려진 한계로 문서화**하는 선에서 마무리한다.

#### R-7-4. 테스트 재실행 — **통과 ✅**

```
cd static/ui && npx jest src/components/table --silent
  Test Suites: 3 passed, 3 total
  Tests:       54 passed, 54 total
```

### R-6. F-2 재검증 — **부분 반영 (잔여 경미)**

| 요구 | 결과 |
|---|---|
| `tableSort.js` 계약 주석에 균일성 요구 추가 | **✅ 반영** — `:20-23` 에 "정렬 컬럼의 `sortValue` 는 모든 행에 균일하게 준다 / 값 없는 행은 필드를 빼지 말고 `sortValue: null` 로 명시" + 위반 시 증상(문자열 정렬 강등)까지 명시. 요구한 것보다 정확하다 |
| `CommonTable.jsx` JSDoc 에도 반영 | ⚠ **미반영** — `:18-20` 의 `sortValue` 설명에 균일성 문구가 없다. 호출부 개발자가 실제로 읽는 곳은 이쪽이므로 1줄 추가 권장(심각도 하) |
| 회귀 테스트 1건 추가 | ⚠ **미추가** — 테스트 수가 54건으로 이전과 동일(tableSort 19 / columnWidths 14 / tableContract 21). 심각도 하 |

계약 자체는 단일 진실 위치(`tableSort.js`)에 정확히 들어갔으므로 **F-2 는 실질 해소**로 본다. 남은 2건은 권고로 강등한다.

---

### F-1. (원문 · 해소됨) 오버레이 좌표 기준 불일치 — 세로 스크롤 표에서 핸들이 컬럼 경계와 어긋난다

**심각도: 낮음** (핸들 정렬 오차만. 정렬·데이터·폭 동결에는 영향 없음) → **2026-08-12 수정 확인, 원 증상 해소. 단 R-5 부작용 발생.**

- **생산자** `columnWidths.js` / `useStableColumnWidths.js:54` — `widths[]` 는 **테이블 폭** 기준 %다(`th` 의 `getBoundingClientRect().width` 합을 100으로 환산).
- **소비자** `table.css:81-88` + `ColumnResizeOverlay.jsx:81` — 오버레이는 `.table-wrapper` 의 **패딩 박스** 기준(`left:0; right:0`)이고, 핸들은 그 폭에 대한 `left: {누적%}` 이다.

두 기준은 보통 같지만(`table.css:49` `table { width: 100% }`), **`maxHeight` 가 지정돼 `overflowY:auto` 가 걸린 표에서 세로 스크롤바가 뜨면** 테이블 폭 = 래퍼 패딩 박스 폭 − 스크롤바(≈15px) 가 되어 갈라진다. 오차는 누적%에 비례해 커지고 최우측 경계에서 최대 ~15px 다.

**영향 범위**(`maxHeight` 전달 호출부):
- `static/ui/src/pages/portfolio/widgets/PortfolioUtilization.jsx:136` (`maxHeight={180}` — 행이 많아 거의 항상 스크롤)
- `static/ui/src/pages/projectDetail/progress/ProgressRiskTable.jsx:141` (`maxHeight="40vh"`)
- `static/ui/src/components/chart/ChartTableToggle.jsx:38` — `tableMaxHeight` 를 넘기는 호출부가 생기면 동일 증상(현재 기본 `undefined` 라 27표 대부분은 무영향)

**수정 방법 (택1)**
1. *(권장)* 계측 시 테이블 폭을 함께 저장해 오버레이에 px 폭을 준다.
   `useStableColumnWidths.js:58` 근처에서 `const tableWidth = table.getBoundingClientRect().width;` 를 `frozen` 에 같이 담고, `TableSurface.jsx:118` 에서 `tableWidth` 를 내려 `ColumnResizeOverlay` 의 최상위 `div` 에 `style={{ width: tableWidth }}` 를 주고 `table.css:85` 의 `right: 0` 을 제거한다. (스크롤바 폭이 바뀌어도 시그니처 리셋 시 재계측된다.)
2. 간단한 대안: `ColumnResizeOverlay.jsx:76` 최상위 div 에 `style={{ width: getTableWidth() }}` 를 렌더 시점에 계산해 넣고 `right:0` 제거. 다만 렌더 중 DOM 읽기가 생기므로 1안보다 열등하다.

---

## 3. 권고 · 범위 밖

### F-2. (권고) 컬럼 내 `sortValue` shape 혼재 시 조용한 문자열 정렬 — 계약 문서 미비

`rawSortValue`(`tableSort.js:33-38`)는 **필드 존재 여부**로 분기하므로, **같은 컬럼에서 일부 행만 `sortValue` 필드를 갖고 나머지 행은 필드 자체가 없으면** 없는 행이 `cell.key`(= 컬럼 식별자 문자열)로 폴백한다. 그러면 `present.every(isNumericLike)`(`:156`)가 깨져 **컬럼 전체가 String 정렬**로 조용히 뒤집힌다(숫자 10 이 2 뒤로 간다). 에러도 경고도 나지 않는다.

- **현재 마이그레이션 3그룹은 해당 없음** — M1/M2/M3 전부 단일 `.map` 빌더라 컬럼별 shape 이 균일하다. `StorageProjectList.jsx:64-71` 의 `commonRow`(별도 리터럴)도 4셀 전부 `sortValue` 를 갖도록 처리돼 있어 안전하다. **즉 지금은 버그가 아니다.**
- 다만 설계 §7-B 각주가 예고한 확산(`PortfolioTsrSignalTable`, `CostByIssueTable`, `MyTeamAnalysisPanel`)에서 조건부 셀을 만들면 그대로 밟는다.
- **수정 방법**: `CommonTable.jsx` JSDoc 의 `sortValue` 설명(현 `:35-37`)과 `tableSort.js` 상단 계약 주석(`:14-18`)에 1줄 추가 — "**한 컬럼에는 전 행에 일관되게 `sortValue` 를 주라. 값이 없으면 필드를 생략하지 말고 `sortValue: null` 을 주라**(생략하면 셀 key 로 폴백해 컬럼 타입이 문자열로 무너진다)". `tableSort.test.js` 에 회귀 케이스 1개 추가 권장.

### F-3. (범위 밖) 작업 트리에 이 기능과 무관한 28파일 수정이 섞여 있다

`git status` 상 수정 파일 37개 중 **이 기능과 무관한 28개**가 함께 올라와 있다. 프론트 리포트가 선언한 수정 파일 9개에 포함되지 않는다.

- 성격: **폰트 굵기 정규화**(`700/800/"bold"` → `600`) + 카드 선택/호버 스타일 통일 + echarts 테마 `fontWeight` 지정. 예: `components/card/Card.jsx:24`, `backoffice/page/permission/modal/usePermission.js:21`, `pages/myPage/sections/MiniBadge.jsx:43`, `utils/echartsTheme.js:29,44,48`, `pages/resource/assignment/projects/ProjectCard.jsx`(스타일 재작성), `pages/projectDetail/cost/CostPage.css`, `pages/projectDetail/progress/ProgressPage.css` 등.
- **M1 파일 안에도 침투해 있다** — `ResourceAnalysisTable.jsx:198` 의 `fontWeight: 700 → 600` 은 이번 기능과 무관한 변경이 같은 diff 에 섞인 것이다.
- **조치 요청(리더)**: 별건 UI 일관성 작업으로 보이므로 **커밋을 분리**하거나, 의도된 동반 변경이면 리포트에 명시할 것. 이 리포트의 통과 판정은 표 관련 9개 파일에 한정한다.

---

## 4. 미검증 (브라우저·런타임 필요 — 추측으로 통과 처리하지 않음)

렌더 테스트 인프라(`@testing-library/react`)가 이 리포에 없고 브라우저 구동도 하지 않았다.

| # | 항목 | 출처 | 특기 |
|---|---|---|---|
| 1 | `PortfolioProjectTable`(M2) 지표 컬럼 클릭 시 ASC/DESC 실제 토글 | §8-5-1 | 코드 경로는 P-6(c)로 확인, 실제 토글은 미확인 |
| 2 | 임의 portfolio 위젯에서 화살표가 더 이상 안 뜬다 | §8-5-2 | 판정 로직은 P-6(b)로 30파일 추론 완료, 렌더 미확인 |
| 3 | `ResourceOverviewTable`(15행/페이지) 1↔2 페이지 전환 시 컬럼 폭 불변 | §8-5-3 | — |
| 4 | 리사이즈 후 페이지 전환·정렬·필터에도 폭 유지, 최소폭 클램프 | §8-5-4 | 순수 함수는 테스트 완료, 드래그 실감 미확인 |
| 5 | `CursorPagingTable`(`IssueAnalysisTable`)·`PagingTable`(`UserListPaging`) 폭 동결·리사이즈 | §8-5-5 | — |
| 6 | 다크 테마 핸들/헤더 색 | §8-5-6 | 토큰(`--ds-border-selected`)만 사용함은 `table.css:114` 로 확인 |
| 7 | **`table-layout: fixed` + % 폭에서 표가 가로로 넘치지 않는지** | §8-5 파생 | ⚠ **최우선 확인 권장.** 이 앱에는 전역 `box-sizing: border-box` 가 없다(`@atlaskit/css-reset` 에 해당 규칙 부재, 앱 CSS 에도 없음). 계측은 border-box 폭인데 재적용은 CSS `width` 다 — 브라우저가 fixed 테이블 레이아웃에서 셀 `width` 를 border-box 로 해석하면 정확히 일치하고, content-box 로 해석하면 컬럼마다 padding(th 24px)만큼 넓어져 **모든 동결 표에 가로 스크롤바가 생긴다.** `ResourceAnalysisChart`(폭 합 80 + `isFixedSize`)가 현재 정상 렌더된다는 점이 전자를 시사하지만 **코드로는 확정할 수 없다.** 표 2~3개에서 가로 스크롤바 유무만 보면 즉시 판명된다 |
| 8 | `isLoading` 중 직전 정렬 판정 붙들기(화살표 깜빡임 방지) | §2-C 5행 | 구현은 `TableSurface.jsx:59-69` 확인. 훅 동작 검증 불가 |

부수 관찰(미검증, 위험 낮음):
- 셀 내부 `minWidth`(예: `pages/resource/overview/WorkloadCell.jsx:58` `minWidth:150`)는 **동결 시점의 auto 레이아웃에 이미 반영**되므로 계측값이 그 폭을 그대로 담는다. 다만 동결 **후** 컨테이너가 크게 좁아지면(반응형) fixed % 가 minWidth 밑으로 내려가 내용이 셀 밖으로 넘칠 수 있다.
- `.table-wrapper` 에 `position: relative` 가 새로 붙었지만(`table.css:12`), 셀 내부의 `position:absolute` 요소(`WorkloadCell.jsx:67`, `CompletionBar.jsx:42`)는 모두 **자기 부모에 `position:relative` 를 갖고 있어** 컨테이닝 블록이 바뀌지 않는다 → 회귀 없음.
- 리사이즈 핸들은 `role="separator"` 지만 `tabIndex` 가 없어 **키보드로 조작할 수 없다**(`ColumnResizeOverlay.jsx:82-84`). 설계가 요구하지 않은 항목이라 실패로 분류하지 않는다.

---

## 5. 재작업 지시 요약 (frontend-engineer)

| # | 파일:라인 | 내용 | 우선도 | 상태 |
|---|---|---|---|---|
| ~~F-1~~ | `table.css` · `ColumnResizeOverlay.jsx` · `useStableColumnWidths.js` · `TableSurface.jsx` | 오버레이 폭 기준을 테이블 실측 폭으로 교체 | 중 | **완료(2026-08-12)** — R-1 확인 |
| ~~F-2~~ | `tableSort.js:20-23` | `sortValue` 컬럼 균일성 계약 주석 | 하 | **완료(2026-08-12)** — R-6 확인 |
| ~~F-1b~~ | `useStableColumnWidths.js:80-86,102` · `TableSurface.jsx:79,122` · `ColumnResizeOverlay.jsx:20,89,92` · `table.css` | 오버레이 좌표 상자를 `width:{px}` → `left:0 + right:{gutter}` 로 교체 | 중 | **완료(2026-08-12)** — R-7 확인. `right ≥ 0` 2중 보증으로 가로 overflow 구조적 불가, 컨테이너 폭 변화 자동 추종 |
| P-1 | `CommonTable.jsx:18-20` | JSDoc `sortValue` 설명에 "한 컬럼에는 전 행 균일하게, 값 없으면 `sortValue: null`" 1줄 추가(호출부가 실제로 읽는 위치) | 하 | 잔여 |
| P-2 | `__test__/tableSort.test.js` | 컬럼 내 일부 행만 `sortValue` 를 가질 때 문자열 강등이 일어남을 못 박는 회귀 케이스 1건 | 하 | 잔여 |
| F-3 | (리더 판단) | 표와 무관한 28파일(폰트 굵기 정규화 등)을 커밋에서 분리하거나 리포트에 명시 | 중 | 미해결 |
