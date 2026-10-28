# 공용 테이블 컴포넌트 기능 개선 설계서

> 2026-08-12 · 대상: `static/ui/src/components/table/` · **프론트 전용**(백엔드/DB/resolver 변경 없음)
> 근거: Atlaskit `@atlaskit/dynamic-table@18.3.12` 실물 소스(`node_modules/@atlaskit/dynamic-table/dist/cjs/`) + 호출부 63개 테이블 전수 조사

---

## 0. 조사에서 확정된 사실 (설계의 전제)

DynamicTable 실물 소스를 읽어 확인한 것. **이 4가지가 설계 선택의 근거**다.

| # | 사실 | 근거 |
|---|------|------|
| F1 | 정렬 값은 **오직 행 셀의 `key`** 다. `head.cells[i].key === sortKey` 인 위치 `i` 의 `cells[i].key` 를 꺼내 비교한다. `cell.sortKey` 같은 필드는 API에 없다 | `hoc/with-sorted-page-rows.js:25-34` (`getSortingCellValue`) |
| F2 | **행 셀의 `key` 는 React key 로 쓰이지 않는다** — `<td>` 의 React key 는 `cellIndex` 다. 즉 `key` 를 정렬값으로 덮어써도 재조정(reconciliation)에 아무 영향이 없다 | `components/table-row.js:42` (`key: cellIndex`) |
| F3 | `head.cells[i].width` 는 **숫자 = 퍼센트**. `--local-dynamic-table-width: {n}%` 를 만들고 `width: var(...)` 를 **`th` 와 `td` 양쪽에** 건다. `isFixedSize` 와 무관하게 항상 적용된다 | `styled/constants.js`, `styled/table-head.js`(`_1bsb8a2a`), `components/table-row.js:36-40` |
| F4 | `isFixedSize` 는 `<table>` 에 `table-layout: fixed` 를 주는 동시에 **`th`/`td` 에 `overflow:hidden`** 을 붙인다(`_1reo15vq _18m915vq`). DynamicTable 은 **`<colgroup>` 을 렌더하지 않는다** — `<table>` 의 자식은 `caption?/thead/tbody` 뿐 | `styled/dynamic-table.js`(`_1kqm1n9t`), `styled/table-cell.js`, `components/stateless.js:183-215` |
| F5 | 셀 객체의 **미지정 필드는 그대로 `<td>` 로 스프레드**된다(`content`/`testId` 만 제외). 지금 `StorageProjectList` 가 넣는 `sortKey` 는 DOM 으로 새어 React unknown-prop 경고를 낸다 | `components/table-row.js:29-45` |

부수 사실: 정렬은 **전체 rows 를 정렬한 뒤 페이지를 자른다**(`getSortedRows` → `getPageRows`). 비교기는 `Intl.Collator(undefined, {numeric:true, sensitivity:'accent'})` 이며 number 는 숫자 비교, **값이 `undefined` 면 비교가 무너진다**(`return modifier`).

### 호출부 전수 조사 결과 (63개 테이블 / 60개 파일)

| 분류 | 테이블 수 | 대표 |
|------|----------|------|
| **1. 정렬이 실제로 동작** | **3** (2파일) | `MyIssuesPanel`, `MyWorklogPanel`(flat/grouped) — 셀 `key` 에 `row.issueKey`·`r.seconds`(숫자)·`r.duedate ?? "9999-99-99"` 같은 **행별 실제 값**을 넣은 유일한 사례. **레퍼런스 패턴** |
| **2. 화살표만 뜨고 정렬 불변** | **32** (30파일) | portfolio 위젯 20종, teamAnalytics 6종, cost/progress/taskHistory 8종, `CostByIssueTable`(2) — 셀 `key` 가 헤더 key 와 같은 **고정 문자열** |
| **2-특수. 화살표가 뜨고 순서는 바뀌는데 데이터와 무관** | **2** | `StorageProjectList`, `StorageTableList` — 존재하지 않는 `cell.sortKey` 에 값을 걸었고 실제 `key` 는 `` `size-${idx}` `` 라 **어느 컬럼을 눌러도 원본 인덱스 순/역순**. 가장 오해를 부르는 상태 |
| **3. 화살표 없음** | **29** (27파일) | backoffice 10, resource 5, projectDetail 10, `MyTeamAnalysisPanel`(2), `ProjectList` 등 |

폭 관련:
- `head width` 지정: **8개 파일뿐** (`MyIssuesPanel`, `MyWorklogPanel`, `TeamCoverageTable`, `ResourceAnalysisTable`, `ResourceAnalysisTeamTable`, `ResourceAnalysisChart`(합 80), `ProgressRiskTable`, `CostByIssueTable`). 나머지 **전부 미지정**.
- `isFixedSize` 직접 전달: **0개**. `ChartTableToggle`(`ChartTableToggle.jsx:37`)을 거치는 **27개 테이블만 자동 true** → 이 27개는 이미 `table-layout: fixed` + 균등폭이라 출렁임이 없다. **울룩불룩은 나머지 36개 테이블의 문제**다.
- `TreeTable`(`WorklogTableTree`)은 DynamicTable 이 아니라 `@atlaskit/table-tree` 이고, 유일 호출부 `MyIssueTable` 이 이미 `columnWidths` px 배열을 준다.

---

## 1. 개요 / 영향 범위

목표 3가지: **(1) 폭 안정화 (2) 정렬 실동작 + 죽은 화살표 제거 (3) 컬럼 폭 드래그 조절**. 전부 `components/table/` 안에서 해결하고 호출부는 무수정으로 동작해야 한다.

- **백엔드**: 없음. resolver·서비스·DB·권한 변경 없음.
- **DB**: 없음.
- **프론트 신규 파일** (`static/ui/src/components/table/`)
  - `TableSurface.jsx` — DynamicTable 기반 3종(`CommonTable`/`PagingTable`/`CursorPagingTable`)이 공유하는 셸. 어댑터·폭 동결·리사이즈 오버레이를 여기서 1회 구현
  - `tableSort.js` — **순수 모듈**. 정렬 가능 컬럼 판별 + 셀 정규화 어댑터
  - `columnWidths.js` — **순수 모듈**. px→% 환산, 리사이즈 델타 적용, 최소폭 클램프
  - `useStableColumnWidths.js` — DOM 계측 + 폭 state 훅
  - `ColumnResizeOverlay.jsx` — 헤더 경계 드래그 핸들
  - `__test__/tableSort.test.js`, `__test__/columnWidths.test.js`, `__test__/tableContract.test.js`
- **프론트 수정 파일**
  - `CommonTable.jsx`, `PagingTable.jsx`, `CursorPagingTable.jsx` — 내부를 `TableSurface` 위임으로 교체. **공개 props 는 불변**
  - `table.css` — `.table-wrapper { position: relative }`, `.table-wrapper.is-width-frozen table { table-layout: fixed }`, 리사이즈 핸들 스타일(전부 `--ds-*` 토큰)
  - 마이그레이션 3그룹(§7-C)
  - `TreeTable.jsx` — **변경 없음**(§9 비목표)
- **i18n**: `locales/kr/common.json` · `locales/en/common.json` 의 `common.table.*` 에 4키 추가
- **신규 의존성**: **없음**. `ResizeObserver` 도 쓰지 않는다(§4-2 근거).

---

## 2. 경계면 계약 (핵심 — 구현의 단일 진실)

프론트 전용 기능이므로 경계면은 **`components/table/*` ↔ 호출부**다. 아래 표가 계약이며, backend/DB 계약은 없다.

### 2-A. `head.cells[]` 계약

| 필드 | 타입 | 신규? | 의미 | 미지정 시 (하위 호환) |
|------|------|-------|------|----------------------|
| `key` | `string` | 기존 | 컬럼 식별자. 정렬 대상 컬럼은 **필수** | 정렬 불가 |
| `content` | `ReactNode` | 기존 | 헤더 내용 | — |
| `isSortable` | `boolean` | 기존 | **"정렬 의도"**. 최종 화살표 노출은 §2-C 판정을 통과해야 한다 | `false` → 화살표 없음 (현행 유지) |
| `width` | `number` (%) | 기존 | **초기 폭 힌트**. 동결 계측의 기준선이 된다 (§4-1) | 브라우저 auto 계산값이 그대로 계측·동결됨 |
| `isResizable` | `boolean` | **신규** | `false` 면 이 컬럼의 **오른쪽 경계** 핸들을 숨긴다 | `true` |
| `shouldTruncate` | `boolean` | 기존 | 그대로 통과 | 기존 동작 |

**`widthPx` 는 계약에 넣지 않는다.** 근거: F3 대로 DynamicTable 은 width 를 `%` 로만 해석한다. px 를 지원하려면 컨테이너 폭을 상시 관측(`ResizeObserver`)해 매 리사이즈마다 %로 재환산해야 하는데, §4-1 의 계측-동결이 이미 "지금 보이는 픽셀 폭 그대로 고정"을 준다. 이득 없이 관측자만 늘어난다. px 는 **리사이즈 최소폭**(`MIN_COL_PX = 48`)에서만 쓴다.

### 2-B. `rows[].cells[]` 계약

| 필드 | 타입 | 신규? | 의미 |
|------|------|-------|------|
| `content` | `ReactNode` | 기존 | 셀 표시 내용. **정렬에 쓰이지 않는다** |
| `sortValue` | `number \| string \| null` | **신규 · 권장** | **정렬 값의 단일 출처.** 표시값과 무관한 원본 값(초, ISO 날짜, 숫자)을 넣는다 |
| `sortKey` | `number \| string` | **기존 오용의 별칭(deprecated)** | `sortValue` 가 없을 때만 읽는다. `StorageProjectList`/`StorageTableList` 2파일 무수정 구제용 |
| `key` | `string \| number` | 기존 | **레거시 정렬 값**. `sortValue`/`sortKey` 둘 다 없을 때만 정렬값으로 해석 |

**어댑터의 필수 동작 3가지 (이걸 어기면 계약 위반)**
1. `sortValue`·`sortKey` 는 DynamicTable 로 내려보내기 전 **반드시 셀 객체에서 제거**한다. F5 대로 미지정 필드는 `<td>` 로 스프레드되어 React unknown-prop 경고를 낸다(현재 storage 2파일에서 실제로 발생 중 — 이번에 같이 없어진다).
2. 정렬 대상 컬럼의 셀 `key` 를 **정규화된 정렬값으로 덮어쓴다**. F2 로 안전함이 보장된다.
3. **결측치를 남기지 않는다.** F1 의 비교기는 값이 `undefined` 면 `return modifier` 로 순서를 망가뜨린다. 컬럼 단위로 타입을 통일해 채운다(§3-1).

### 2-C. 정렬 가능 판정 (화살표 노출 규칙) — **사용자 불만의 핵심**

`head.cells[i].isSortable === true` 인 컬럼에 대해서만 판정한다. **호출부가 요청하지 않은 곳에 화살표를 새로 만들지 않는다.**

| 입력 상태 | 판정 | 결과 |
|-----------|------|------|
| 어느 행이든 `sortValue` 또는 `sortKey` 를 가짐 | **정렬 가능** | 화살표 노출 + 실동작 |
| 둘 다 없고, 셀 `key` 의 **서로 다른 non-null 값이 2개 이상** | **정렬 가능** | 화살표 유지 + 실동작 (`MyIssuesPanel` 계열 무회귀) |
| 둘 다 없고, 셀 `key` 가 **모든 행에서 동일**하거나 전부 없음 | **정렬 불가** | **`isSortable` 을 `false` 로 덮어써 화살표 제거** (죽은 화살표 32개 정리) |
| `rows.length < 2` | 정렬 불가 | 화살표 제거 (정렬해도 순서가 안 바뀜) |
| `isLoading`(스켈레톤 행) | **직전 판정 유지** | 로딩 중 화살표가 깜빡이지 않게 `useRef` 로 마지막 판정을 붙든다 |

이 규칙이 "컬럼 식별자를 key 에 넣은 32개 테이블"과 "실데이터를 넣은 3개 테이블"을 **코드 수정 없이 기계적으로 갈라낸다.** 컬럼 식별자는 정의상 행마다 동일하고, 실데이터는 정의상 행마다 다르기 때문.

> 알려진 경계: 실데이터 컬럼인데 현재 데이터가 우연히 전부 같은 값이면 화살표가 사라진다. 그 상태에서는 정렬해도 순서가 안 바뀌므로 **어포던스가 없는 편이 정직하다**. 문서화만 하고 예외 처리하지 않는다.

### 2-D. `TableSurface` / 4종 래퍼 props 계약

| props | 신규? | 기본값 | 비고 |
|-------|-------|--------|------|
| `head`, `rows`, `isLoading`, `emptyView`, `emptyMessage`, `rowsPerPage`, `defaultPage`, `maxHeight`, `wrapperStyle`, `isFixedSize`, `skeletonRows` | 기존 | 현행 그대로 | **CommonTable 공개 API 무변경** |
| `isResizable` | **신규** | `true` | 테이블 전체 리사이즈 on/off |
| `stableWidths` | **신규** | `true` | 폭 동결 on/off (탈출구) |

`PagingTable`·`CursorPagingTable` 은 `TableSurface` 에 자기 푸터/검색바를 `children`(또는 `footer`)으로 넘기고 나머지는 그대로 위임한다. **두 컴포넌트의 공개 props 도 무변경.**

### 2-E. 하위 호환 요약 — "호출부를 하나도 안 고쳤을 때"

| 현재 상태 | 개선 후 |
|-----------|---------|
| 화살표 없는 29개 | **그대로** 화살표 없음. 폭만 안정화 + 리사이즈 가능 |
| 죽은 화살표 32개 | **화살표가 사라진다.** 정렬 동작은 원래 없었으므로 기능 손실 0 |
| 오답 정렬 2개(storage) | `sortKey` 별칭을 읽어 **저절로 정상 동작**하고 React 경고도 사라진다 |
| 정상 정렬 3개(myPage) | **그대로 동작**. `key` 값이 행마다 달라 판정을 통과 |
| `width` 지정 8파일 | 그 폭이 첫 페인트에 반영된 뒤 **그 상태 그대로 동결** (합 80인 `ResourceAnalysisChart` 포함 — 정규화하지 않으므로 모양이 안 바뀐다) |
| `isFixedSize` 27개(ChartTableToggle) | 이미 `table-layout: fixed` + 균등폭 → 계측값도 균등 → **픽셀 단위 무변화** |

---

## 3. 정렬 실동작 설계

### 3-0. 방식 선택: DynamicTable 내장 정렬 + 셀 key 어댑터 ✅ (자체 정렬 ❌)

| 후보 | 판단 | 근거 |
|------|------|------|
| **(A) 내장 정렬 유지 + `sortValue → cell.key` 어댑터** | **채택** | ① F2 로 `key` 덮어쓰기가 **무해함이 소스로 증명**된다 ② 내장 정렬은 rows 전체를 정렬한 뒤 페이지를 자르므로 **페이지네이션과의 상호작용이 이미 옳다** ③ `aria-sort`·화살표 방향·토글(ASC↔DESC) 상태가 이미 접근성까지 갖춰 구현돼 있다 ④ 추가 코드가 **순수 매핑 함수 1개** |
| (B) 래퍼가 rows 를 직접 정렬, `isSortable` 은 화살표 UI 용으로만 | 기각 | stateful DynamicTable 이 `sortKey`/`sortOrder`/`page` 내부 state 를 계속 들고 있어 **이중 상태**가 된다. `onSort` 를 받아 우리가 정렬해도 내부는 다시 셀 key 로 재정렬한다(`withSortedPageRows` 는 항상 탄다). 회피하려면 `DynamicTableStateless` 로 갈아타고 page/sort 를 전부 재구현해야 하는데, 63개 테이블 회귀 위험 대비 이득이 없다 |
| (C) 컬럼 key 를 접두어로 붙여 유일성 확보 | 기각 | 애초에 유일성이 필요 없고(F2), `Intl.Collator(numeric)` 이 음수·소수를 문자 규칙으로 처리해 **-5 > 3** 같은 오답이 난다 |

### 3-1. 어댑터 (`tableSort.js` — 순수 함수)

```
resolveSortableColumns(head, rows) -> boolean[]        // §2-C 판정
adaptTable(head, rows, { sortable, labels }) -> { head, rows }
```

- **컬럼 단위 타입 통일**: 그 컬럼의 non-null 정렬값이 전부 숫자(또는 숫자로 해석되는 문자열)면 `Number` 로, 아니면 `String` 으로 통일. 결측치는 숫자 컬럼 `Number.NEGATIVE_INFINITY`, 문자 컬럼 `''`.
  - 근거: F1 비교기가 **타입이 섞이면 숫자를 무조건 앞으로 몰고**, `undefined` 면 비교 자체가 무너진다. 통일하면 `Intl.Collator(numeric)` 과 숫자 비교 둘 다 정확해진다.
  - 결측치는 ASC 에서 맨 앞, DESC 에서 맨 뒤로 모인다. **일관되게 한쪽 끝**이면 충분하다(문서화).
- **무변경 최적화**: 정렬 대상 컬럼 중 `sortValue`/`sortKey` 도 없고 정규화도 불필요하면 **`rows` 를 새 배열로 만들지 않고 원본 참조를 그대로 반환**한다. 레거시 테이블(대다수)에서 렌더당 O(행×열) 할당이 0이 된다.
- **head 재작성**: `isSortable` 을 판정 결과로 덮어쓰고, 정렬 가능 컬럼에 i18n 툴팁(`ascendingSortTooltip`/`descendingSortTooltip`/`buttonAriaRoleDescription`)을 주입한다. Atlaskit 기본값이 영어 하드코딩(`'Sort ascending'`)이라 **공용 레벨에서 1회 주입하면 63개 테이블이 한 번에 한국어가 된다.**
- **메모 키**: 호출부 다수가 `head` 를 렌더마다 인라인 생성한다(`ResourceOverviewTable`, `PortfolioProjectTable` 등 확인). `useMemo` 의존성을 `head` **객체 참조**로 잡으면 매 렌더 재계산된다 → `head.cells.map(c => `${c.key}:${c.isSortable?1:0}`).join('|')` **시그니처 문자열**을 의존성으로 쓴다.

### 3-2. 서버 페이징 테이블의 정렬 범위

`CursorPagingTable`(3개) · `PagingTable`(1개) 은 DynamicTable 이 **현재 페이지만** 받는다. 현재 이 4개 테이블은 `isSortable` 을 하나도 쓰지 않으므로 **이번 범위에서 정렬을 열지 않는다**(현상 유지 = 화살표 없음). 여는 순간 "전체가 아니라 이 페이지만 정렬"이라는 새 오해가 생기고, 제대로 하려면 서버 정렬 파라미터가 필요하다 — 별건이다.

---

## 4. 폭 안정화 설계

### 4-0. 방식 선택: 계측-동결 + `table-layout: fixed` ✅

| 후보 | 판단 | 근거 |
|------|------|------|
| **(A) 첫 실데이터 페인트를 계측해 % 로 동결 + 자체 CSS 로 `table-layout: fixed`** | **채택** | 지금 보이는 폭을 **그대로** 고정하므로 63개 테이블 중 어느 것도 모양이 변하지 않는다. 폭이 콘텐츠 의존을 끊으므로 페이지 전환·필터·정렬에 불변 |
| (B) `<colgroup>` 주입 | 기각 | **F4 — DynamicTable 은 colgroup 을 렌더하지 않고 넣을 prop 도 없다.** `<table>` DOM 에 직접 `insertBefore` 하려면 React 가 소유한 자식 목록 앞에 외부 노드를 끼우게 되어 삽입 위치 계산이 깨질 수 있다. `table-layout: fixed` 에서 **첫 행의 셀 폭이 곧 컬럼 폭**이므로 colgroup 과 결과가 동일하고, `th width` 는 문서화된 prop 이다 |
| (C) 호출부 63개에 head width 전수 지정 | 기각 | 요구사항 "호출부 전수 수정 최소화" 위반. 게다가 값을 사람이 정하면 유지보수가 영원히 따라다닌다 |
| (D) `isFixedSize` 를 전역 기본 true 로 | 기각 | width 미지정 컬럼이 **균등 분할**된다 → 55개 테이블이 즉시 뭉개진다. 게다가 F4 대로 `td` 에 `overflow:hidden` 이 붙어 긴 문자열이 **잘려 사라진다** |

### 4-1. 동작 (`useStableColumnWidths.js`)

```
상태:  baseline: number[]|null   (계측 결과 %)
       widths:   number[]|null   (baseline 또는 사용자 리사이즈 결과)
       signature: head 컬럼 키 목록 — 바뀌면 전부 리셋
```

1. `widths === null && !isLoading && rows.length > 0` 인 첫 `useLayoutEffect` 에서 계측:
   `wrapperRef.current.querySelector('table')` → `thead > tr > th, thead > tr > td` 의 `getBoundingClientRect().width` 배열 → `toPercentWidths()`.
   - 계측 시점의 폭은 **호출부의 `width` 선언이 이미 반영된 결과**다. 그래서 선언 폭을 따로 우대할 필요가 없고, **정규화도 하지 않는다** — 합 80인 `ResourceAnalysisChart` 가 지금 모양 그대로 유지되는 이유.
   - `total <= 0`(jsdom 등 레이아웃 없는 환경)이면 **동결하지 않고 현행 동작을 유지**한다. 기존 테스트/SSR 안전.
2. 동결되면 `head.cells[i].width = widths[i]` 로 내려보내고(F3), 래퍼 div 에 `is-width-frozen` 클래스를 붙여 `table-layout: fixed` 를 건다.
   - **`isFixedSize` 를 켜지 않는 이유**: F4 의 `overflow:hidden` 부작용(내용 잘림)을 피하려고 `table-layout` 만 우리 CSS 로 준다. 긴 토큰 대응은 `td { overflow-wrap: anywhere }` 로 따로 처리.
   - `isFixedSize` prop 자체는 **통과시킨 채 그대로 둔다**(ChartTableToggle 27개 무회귀).
3. `signature` 변경(컬럼 구성 변화: `pickCells` 권한 게이팅, 정책 분기, 동적 series) 시 `widths=null` 로 리셋 → 재계측.

**페이지 전환 시 불변 보장 메커니즘**
- *표 내부 페이지 전환·정렬·필터·데이터 갱신*: `widths` 가 state 로 살아 있고 `table-layout: fixed` 라 **폭 계산이 콘텐츠를 아예 보지 않는다** → 완전 불변.
- *라우트/탭 전환(언마운트→재마운트)*: 재계측한다. 같은 컬럼 구성·같은 첫 페이지면 같은 값이 나온다. 마운트를 넘어 픽셀 단위로 못 박으려면 영속화가 필요한데 §5-3 대로 이번 범위에서 제외한다.
- *남는 리플로우 1회*: 스켈레톤 → 실데이터 전환. 스켈레톤 셀은 `%` 폭 `div` 라 컬럼 폭을 지시하지 못하므로(헤더 텍스트만 반영됨) **스켈레톤 단계에서 동결하면 실데이터가 잘린다.** 그래서 실데이터 첫 페인트까지 기다린다. 이후로는 리플로우가 없다.

### 4-2. `columnWidths.js` (순수 함수 — 테스트 대상)

```
toPercentWidths(pxWidths) -> number[]       // 합이 정확히 100 (마지막 컬럼이 반올림 잔차 흡수)
minPctFromPx(minPx, tableWidthPx) -> number
applyResizeDelta(widths, edgeIndex, deltaPct, minPct) -> number[]   // i, i+1 만 변경 · 합 보존 · 클램프
```

`ResizeObserver` 불필요: 폭이 `%` 라 컨테이너가 넓어지면 브라우저가 알아서 비례 확대한다. 드래그 중 필요한 픽셀 폭은 `pointerdown` 시점에 `table.getBoundingClientRect().width` 로 1회 읽으면 된다.

---

## 5. 컬럼 리사이즈 설계

### 5-1. 왜 오버레이인가

핸들을 `head.cells[].content` 안에 넣을 수 없다 — 정렬 가능 헤더는 content 가 **`Pressable`(버튼) 내부**에 들어가므로(`components/table-head-cell.js`) 핸들 클릭이 정렬을 발동시키고, 버튼 안의 인터랙티브 요소는 접근성 위반이다.

→ `.table-wrapper`(`position: relative`) 안에 **절대배치 오버레이**로 컬럼 경계 핸들을 그린다. 위치는 §4 의 `widths` 누적합이라 DOM 을 매 프레임 읽지 않는다.

```
<div class="table-wrapper is-width-frozen" ref>          // position: relative
   <DynamicTable ... />
   <ColumnResizeOverlay widths=... theadHeight=... />     // 동결된 뒤에만 렌더
   {footer}                                               // PagingTable / CursorPagingTable
</div>
```

- 핸들 i: `left: calc(누적% - 3px)`, `top: 0`, `width: 6px`, `height: theadHeight`(계측 시 같이 읽음), `cursor: col-resize`, `role="separator"`, `aria-label={t('common.table.resizeColumn')}`.
  - 높이를 헤더로 제한하는 이유: 표 전체 높이로 깔면 `rows[].onClick` 행 클릭(현재 8개 테이블에서 사용)을 가로막는다.
- 마지막 컬럼 뒤에는 핸들 없음. `head.cells[i].isResizable === false` 인 컬럼의 오른쪽 경계도 없음.
- **드래그**: `pointerdown` → `setPointerCapture` → `pointermove` 마다 `deltaPct = (clientX - startX) / tableWidthPx * 100` → `applyResizeDelta` → `pointerup` 해제. 인접 두 컬럼만 주고받으므로 **합이 항상 100** 이고 나머지 컬럼은 미동도 하지 않는다.
- **최소 폭**: `MIN_COL_PX = 48`. 드래그 시작 시 `minPctFromPx` 로 환산해 양쪽 모두에 클램프.
- **더블클릭 → 그 경계의 두 컬럼만 `baseline` 으로 복귀.** 코드 3줄, 잘못 끈 폭을 되돌릴 유일한 탈출구라 포함.
- 드래그 중 `body { user-select: none }` 은 핸들에 `touch-action: none` + `e.preventDefault()` 로 갈음(전역 스타일 오염 회피).

### 5-2. 4종 적용 범위

| 컴포넌트 | 폭 동결 | 정렬 어댑터 | 리사이즈 |
|----------|---------|-------------|----------|
| `CommonTable` | O | O | O |
| `PagingTable` | O | O | O |
| `CursorPagingTable` | O | O | O |
| `TreeTable`(`WorklogTableTree`) | — | — | — |

`TreeTable` 은 DynamicTable 이 아니라 `@atlaskit/table-tree` 다(별도 엔진, `columns`/`headers`/`columnWidths` API, 정렬 미지원). 유일 호출부 `MyIssueTable` 이 **이미 px `columnWidths` 를 고정**해서 출렁임 대상이 아니다. 공용 레벨 1회 구현으로 커버되지 않으므로 이번 범위에서 제외한다(§9).

### 5-3. 영속화(localStorage) — **보류**

`widths` 는 컴포넌트 state 라 **표 페이지 전환·정렬·필터·데이터 갱신 동안 유지**된다. 라우트를 떠났다 오면 계측 기준선으로 돌아간다.
localStorage 영속화를 넣지 않는 이유: 저장 키 설계(화면×권한별 컬럼 구성이 `pickCells`/정책 분기로 달라진다)와 컬럼 구성 변경 시 무효화 규칙이 필요해 **기능 대비 상태가 과하다**. 요구사항도 "필수 아님"으로 두었다. 사용자가 실제로 아쉬워하면 `columnWidthStorageKey` prop 1개로 뒤에 붙일 수 있게 훅 인터페이스만 열어 둔다(구현하지 않음).

---

## 6. i18n 키 목록

`locales/kr/common.json` · `locales/en/common.json` 의 기존 `common.table` 블록(현재 `pageSize`/`resultCount`/`prev`/`next`/`page`)에 추가. 추가 후 `cd static/ui && npm run merge`.

| 키 | kr | en |
|----|----|----|
| `common.table.sortAsc` | `오름차순 정렬` | `Sort ascending` |
| `common.table.sortDesc` | `내림차순 정렬` | `Sort descending` |
| `common.table.sortButton` | `정렬 버튼` | `Sort button` |
| `common.table.resizeColumn` | `컬럼 너비 조절` | `Resize column` |

> 앞의 3키는 Atlaskit 이 영어로 하드코딩해 두던 툴팁/aria 를 대체한다 — 공용 어댑터 1곳 주입으로 63개 테이블에 동시 적용된다.

---

## 7. 마이그레이션 계획

### 7-A. 무수정 호환 (호출부 60파일)
§2-E 표대로 코드 변경 없이 동작한다. 별도 작업 없음.

### 7-B. 새 계약을 적용할 대표 화면 — **3그룹**
"정렬 가치 × 수정 비용 × 계약 경로 커버리지" 기준으로 골랐다. 세 그룹이 계약의 **세 경로를 각각 하나씩** 밟는다.

| # | 대상 | 현재 | 작업 | 왜 이곳인가 |
|---|------|------|------|------------|
| **M1** | `pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx` | 화살표 **없음**, `width` 8개 이미 지정 | head 5개 지표 컬럼에 `isSortable: true` + 셀에 `sortValue` (총MM/유효MD/총MD/총시간/이슈수) | 8컬럼 중 5개가 순수 숫자지표이고 "누가 제일 많이 투입됐나"가 이 화면의 존재 이유. **경로: 신규 `sortValue` 도입** |
| **M2** | `pages/portfolio/widgets/PortfolioProjectTable.jsx` | **죽은 화살표 7개** | 행 `pickCells` 에서 `key: "completion"` 옆에 `sortValue: p.completionRate` 등 추가(9컬럼 중 7개) | 사용자가 **이미 눌러보고 안 된다는 걸 아는** 화면(기능 부재가 아니라 고장으로 보임). `PortfolioTsrSignalTable` 이 토글로 이 표를 렌더하므로 파급도 크다. **경로: 죽은 화살표 부활** |
| **M3** | `backoffice/page/storage/StorageProjectList.jsx`, `StorageTableList.jsx` | **오답 정렬** (`sortKey` 오용) | 어댑터가 `sortKey` 별칭을 읽으므로 **무수정으로 정상화**된다. 정리 차원에서 `sortKey` → `sortValue` 리네임(6줄) | "크기 순"을 눌렀는데 크기와 무관한 순서가 나오는 유일한 오답 케이스. **경로: deprecated 별칭 + React 경고 제거** |

> 선택 후보(범위 밖): `PortfolioTsrSignalTable`(M2 와 동일 레시피, 11컬럼), `pages/myPage/sections/MyTeamAnalysisPanel.jsx` MemberTable(9컬럼 전부 지표, 단 셀 key 자체가 없어 신규 작업량이 M1 수준), `pages/projectDetail/cost/CostByIssueTable.jsx`(금액 정렬 수요 높음). M1~M3 가 자리 잡은 뒤 같은 레시피로 확산한다.

### 7-C. 레퍼런스 패턴
`MyWorklogPanel` 이 표시값(`"3h"`)이 아니라 `r.seconds`(숫자)를 정렬값으로 쓴다. **"표시값이 아니라 원본 값을 `sortValue` 에 넣는다"** — 이걸 `sortValue` JSDoc 의 예시로 못 박는다.

---

## 8. 테스트 설계

**전제: 이 리포에는 `@testing-library/react` 가 없다**(`package.json` 미포함, `node_modules` 부재). 기존 65개 테스트는 전부 순수 함수 단위이며 `projectTeamAnalysisWiring.test.js` 처럼 **소스 정적 검사** 전례가 있다. 따라서 **로직을 순수 모듈로 뽑는 것이 테스트 가능성의 전제**다(§1 파일 분리가 이 때문).

### 8-1. `__test__/tableSort.test.js`
- 레거시 컬럼 식별자 key(모든 행 동일) → **정렬 불가 판정 · `isSortable` 이 `false` 로 덮어써짐** (죽은 화살표 32개 대표)
- 실데이터 key(행마다 다름) → **정렬 가능 유지** (`MyIssuesPanel` 무회귀)
- `sortValue` 명시 → 정렬 가능, `cell.key` 는 `sortValue` 로 대체됨
- `sortKey` 별칭 → 정렬 가능 (storage 2파일 구제)
- `rows` 0건/1건 → 정렬 불가
- **`sortValue`/`sortKey` 필드가 결과 셀 객체에서 제거된다** ← F5 회귀 가드(td 누수 방지)
- 결측치 정규화: 숫자 컬럼 → `-Infinity`, 문자 컬럼 → `''`, 컬럼 내 타입 단일화
- **무변경 최적화**: 레거시 전용 테이블은 `rows` 가 **동일 참조**로 반환된다
- `isSortable` 미지정 컬럼에는 어떤 경우에도 화살표가 생기지 않는다

### 8-2. `__test__/columnWidths.test.js`
- `toPercentWidths`: 합이 **정확히 100**, 마지막 컬럼이 반올림 잔차 흡수, 0폭/빈 배열 방어
- `applyResizeDelta`: 인접 2컬럼만 변화 · 합 보존 · 최소폭 클램프 · 경계에서 더 줄지 않음 · 음/양 델타 대칭
- `minPctFromPx`: 테이블 폭 0 방어

### 8-3. `__test__/tableContract.test.js` (정적 검사)
- `CommonTable`/`PagingTable`/`CursorPagingTable` 소스가 `TableSurface` 를 사용한다 (공용 지점 우회 방지)
- `CommonTable` 이 노출하던 props 이름이 그대로 있다 (공개 API 무변경 가드)
- 마이그레이션 3그룹 파일이 `sortValue` 를 사용한다

### 8-4. 기존 테스트 영향
- **스냅샷**: 유일한 `.snap` 은 `portfolioAggregate.test.js.snap`(데이터 스냅샷) → 무영향. 컴포넌트 스냅샷은 존재하지 않는다.
- **렌더 테스트 없음** → 63개 호출부 테스트 회귀 없음.
- 폭 계측은 jsdom 에서 `width: 0` 이라 §4-1 가드로 **동결이 일어나지 않는다** → 혹시 추가될 렌더 테스트도 현행 동작을 본다.

### 8-5. 수동 검증 (요구사항 검증 포인트 대응)
1. `PortfolioProjectTable`(M2) — 지표 컬럼 클릭 시 ASC/DESC 실제 토글
2. 임의의 portfolio 위젯 — **화살표가 더 이상 안 뜬다**
3. `ResourceOverviewTable`(15행/페이지) — 1↔2 페이지 전환 시 컬럼 폭 **불변**
4. 리사이즈 후 페이지 전환·정렬·필터에도 폭 유지, 최소폭에서 더 안 줄어듦
5. `CursorPagingTable`(`IssueAnalysisTable`)·`PagingTable`(`UserListPaging`)에서도 폭 동결·리사이즈 동작
6. 다크 테마에서 핸들/헤더 색 확인 (`--ds-*` 토큰만 사용)
7. `CI=true npm run build` — 번들 예산(gzip 950KB, 현재 895KB) 통과. 신규 의존성 0이라 증가분은 자체 코드 수 KB

---

## 9. 비목표 (하지 않는 것)

- **개별 화면 커스텀 정렬/폭 코드** — 전부 `components/table/` 안에서 해결. 마이그레이션 3그룹도 `sortValue` 데이터 제공만 한다
- **외부 라이브러리 도입** (`react-table`, `react-resizable` 등) — 번들 예산 + 회귀 위험
- **DynamicTable 교체 / 자체 table 구현** — 63개 테이블 전면 회귀 위험. F2·F3 로 기존 컴포넌트 안에서 목표가 전부 달성된다
- **`TreeTable`(`@atlaskit/table-tree`) 개선** — 별도 엔진, 유일 호출부가 이미 `columnWidths` 고정 (§5-2)
- **서버 사이드 정렬** — `CursorPagingTable`/`PagingTable` 정렬 개방은 별건 (§3-2)
- **컬럼 폭 localStorage 영속화** — 보류, 사유는 §5-3
- **정렬 시 페이지 1 복귀** — DynamicTable stateful 이 `page` 를 내부 state 로 들고 있어 외부에서 리셋하려면 page 를 완전 제어해야 한다. 알려진 한계로 문서화만
- **백엔드/DB/i18n 외 서버 변경** — 없음

---

## 10. 구현 작업 분해 (frontend 전용)

### P0 — 공용 코어 (호출부 무수정, 여기까지가 요구사항 1·2의 본체)
- [ ] `components/table/tableSort.js` — `resolveSortableColumns` / `adaptTable` (§2-B, §2-C, §3-1). `sortValue`·`sortKey` **strip 필수**
- [ ] `components/table/columnWidths.js` — `toPercentWidths` / `minPctFromPx` / `applyResizeDelta` (§4-2)
- [ ] `components/table/useStableColumnWidths.js` — 계측·동결·시그니처 리셋·`total<=0` 가드 (§4-1)
- [ ] `components/table/ColumnResizeOverlay.jsx` — 절대배치 핸들, pointer capture, 최소폭, 더블클릭 리셋 (§5-1)
- [ ] `components/table/TableSurface.jsx` — 어댑터+동결+오버레이+스켈레톤+empty 를 묶은 셸. `isLoading` 중 정렬 판정 붙들기(`useRef`), head 시그니처 메모
- [ ] `components/table/table.css` — `.table-wrapper{position:relative}`, `.is-width-frozen table{table-layout:fixed}`, `td{overflow-wrap:anywhere}`, `.table-col-resizer`(hover/active 시 `--ds-border-selected`). **폰트 굵기(th 600) 등 기존 계약 불변**
- [ ] `CommonTable.jsx` / `PagingTable.jsx` / `CursorPagingTable.jsx` — `TableSurface` 위임. **공개 props 무변경** (JSDoc 갱신)

### P1 — i18n
- [ ] `locales/kr/common.json` · `locales/en/common.json` 에 `common.table` 4키 추가 (§6)
- [ ] `cd static/ui && npm run merge`

### P2 — 마이그레이션 (§7-B)
- [ ] M1 `ResourceAnalysisTable.jsx` — 지표 5컬럼 `isSortable` + `sortValue`
- [ ] M2 `PortfolioProjectTable.jsx` — 죽은 화살표 7개에 `sortValue` 주입
- [ ] M3 `StorageProjectList.jsx` / `StorageTableList.jsx` — `sortKey` → `sortValue` 리네임(6줄)

### P3 — 테스트·검증
- [ ] `__test__/tableSort.test.js` (§8-1)
- [ ] `__test__/columnWidths.test.js` (§8-2)
- [ ] `__test__/tableContract.test.js` (§8-3)
- [ ] `cd static/ui && npm test` 전량 통과
- [ ] `cd static/ui && CI=true npm run build` — 번들 예산 확인
- [ ] §8-5 수동 검증 7항목

---

## 11. 설계 가정 (구현 전 확인 요망)

1. **죽은 화살표 32개는 "제거"가 정답이다.** 요구사항 원문("기능 없는 화살표 제거가 사용자 불만의 핵심")에 따라 32개 테이블에서 화살표가 사라진다. 이 중 정렬 수요가 큰 화면은 M2 처럼 `sortValue` 를 채워 되살리는 것이 정공법이며, 순차적으로 확산한다.
2. **`TreeTable` 은 이번 범위 밖**(§5-2). 요구사항 검증 포인트에 `TreeTable` 이 언급돼 있으나 별도 엔진이라 공용 1회 구현으로 커버되지 않는다. `MyIssueTable` 은 이미 `columnWidths` px 고정이라 출렁임이 없다.
3. **폭 영속화 미구현**(§5-3). "리사이즈 후 페이지 전환에도 유지"는 **표 내부 페이지 전환·정렬·필터**까지 보장하고, 라우트 이탈 후 복귀는 계측 기준선으로 리셋된다.
