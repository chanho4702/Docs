# 프론트 구현 리포트 — 공용 테이블 컴포넌트 기능 개선

> 2026-08-12 · 설계서 `01_architect_design.md` §10(P0~P3) 구현 · **프론트 전용**(백엔드/DB/resolver 변경 0)
> 리더 확정 가정 3건(죽은 화살표 제거 / TreeTable 범위 밖 / 폭 영속화 미구현)은 그대로 따랐다.

---

## 1. 신규 파일 (7)

| 파일 | 역할 |
|------|------|
| `static/ui/src/components/table/tableSort.js` | **순수 모듈.** 정렬 가능 판정(§2-C) + 셀 정규화 어댑터(§2-B, §3-1) |
| `static/ui/src/components/table/columnWidths.js` | **순수 모듈.** px→% 환산 / 최소폭 환산 / 리사이즈 델타 / 경계 리셋(§4-2) |
| `static/ui/src/components/table/useStableColumnWidths.js` | DOM 계측·동결·시그니처 리셋·`total<=0` 가드(§4-1) |
| `static/ui/src/components/table/ColumnResizeOverlay.jsx` | 절대배치 경계 핸들, pointer capture, 최소폭, 더블클릭 리셋(§5-1) |
| `static/ui/src/components/table/TableSurface.jsx` | 3종 표 공용 셸 — 어댑터+동결+오버레이+스켈레톤 |
| `static/ui/src/components/table/__test__/tableSort.test.js` | §8-1 |
| `static/ui/src/components/table/__test__/columnWidths.test.js` | §8-2 |
| `static/ui/src/components/table/__test__/tableContract.test.js` | §8-3 (정적 검사) |

## 2. 수정 파일 (9)

| 파일 | 변경 |
|------|------|
| `components/table/CommonTable.jsx` | 내부를 `TableSurface` 위임으로 교체. **공개 props 무변경** + `isResizable`/`stableWidths` 2개 추가(기본 true). JSDoc에 `sortValue`/`isResizable` 계약 명시 |
| `components/table/PagingTable.jsx` | `TableSurface` 위임(푸터는 `footer` prop). 공개 props 무변경 |
| `components/table/CursorPagingTable.jsx` | 동일. 공개 props 무변경 |
| `components/table/table.css` | `.table-wrapper{position:relative}`, `.is-width-frozen table{table-layout:fixed}`, `.is-width-frozen td{overflow-wrap:anywhere}`, 핸들 스타일. 기존 계약(th 600, `--ds-*` 토큰) 불변, 신규 색도 `--ds-border-selected` 토큰만 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisTable.jsx` | **M1** |
| `pages/portfolio/widgets/PortfolioProjectTable.jsx` | **M2** |
| `backoffice/page/storage/StorageProjectList.jsx` | **M3** |
| `backoffice/page/storage/StorageTableList.jsx` | **M3** |
| `locales/kr/common.json` · `locales/en/common.json` | `common.table.*` 4키 |

`TreeTable.jsx` 무수정(§9 비목표), 나머지 호출부 60파일 **무수정**.

---

## 3. 경계면 계약 구현 위치 (파일:라인)

| 계약 (설계서) | 구현 |
|---|---|
| §2-B 필수동작1 — `sortValue`/`sortKey` **strip** | `tableSort.js:199` (`const { sortValue, sortKey, ...rest } = cell`) |
| §2-B 필수동작2 — 정렬 컬럼 셀 `key` 를 정규화 정렬값으로 덮어쓰기 | `tableSort.js:200` (`rest.key = column[r]`) |
| §2-B 필수동작3 — 결측치 채우기(숫자 `-Infinity` / 문자 `''`)·컬럼 타입 통일 | `tableSort.js:157-166` |
| §2-C 화살표 판정(표 그대로) | `tableSort.js:68-104` (`resolveSortableColumns`) |
| §2-C `isLoading` 중 직전 판정 유지(`useRef`) | `TableSurface.jsx:59-69` |
| §2-A `isResizable` 는 우리 계약 전용 → `<th>` 누수 차단 | `tableSort.js:117` (**설계 보강**, 아래 §8-1) |
| §3-1 i18n 툴팁 주입(호출부 지정값 우선) | `tableSort.js:122-125` |
| §3-1 head 시그니처 메모 | `TableSurface.jsx:52,60-74` (`headSignature`) |
| §3-1 무변경 최적화(원본 참조 반환) | `tableSort.js:186` |
| §4-1 계측·동결 + `total<=0` 가드 | `useStableColumnWidths.js:44-59` |
| §4-1 시그니처 리셋 | `useStableColumnWidths.js:63` |
| §4-1 폭을 `head.cells[].width` 로 하달 | `TableSurface.jsx:88-90` |
| §4-1 `is-width-frozen` + `table-layout:fixed` | `TableSurface.jsx:101` / `table.css:68-74` |
| §5-1 pointer capture / 최소폭 48px / 더블클릭 리셋 / `isResizable:false` 경계 숨김 | `ColumnResizeOverlay.jsx:37,44,90,70` |
| §5-1 핸들 높이 = thead(행 클릭 보호) | `useStableColumnWidths.js:58` → `ColumnResizeOverlay.jsx` style `height` |

### 화살표 판정의 실제 동작 (요약)

`head.cells[i].isSortable === true` 인 컬럼만 판정한다. 컬럼별로 행을 훑어

1. 어느 행이든 `sortValue`/`sortKey` 가 non-null → **즉시 정렬 가능**(조기 반환).
2. 아니면 셀 `key` 의 서로 다른 값이 **2개 이상**이면 정렬 가능(실데이터를 key 에 넣은 `MyIssuesPanel`·`MyWorklogPanel` 무회귀).
3. `key` 가 전부 같거나(컬럼 식별자) 전부 없으면 **정렬 불가 → `adaptHead` 가 `isSortable:false` 로 덮어써 화살표가 사라진다**(죽은 화살표 32개).
4. `rows.length < 2` 는 무조건 정렬 불가.
5. `isLoading` 이면 **직전 판정을 `useRef` 로 붙든다.** 스켈레톤 행은 셀 key 가 컬럼 key 라 그대로 판정하면 매 로딩마다 화살표가 깜빡인다. 단 head 시그니처가 바뀐 경우엔 붙들지 않고 전부 false(길이 불일치 방지).

정렬값은 `sortValue > sortKey > key` 순으로 뽑되 **필드 존재 여부**로 갈린다 — `sortValue: null` 은 "값 없음"이지 key 폴백이 아니다(폴백하면 컬럼 식별자 문자열이 숫자 컬럼에 섞여 컬럼 전체가 문자열 정렬이 된다. M1 의 `effective ?? null` 이 실제로 이 경로를 밟는다. 회귀 테스트 있음).

---

## 4. 마이그레이션 3그룹 결과

| # | 파일 | 결과 |
|---|------|------|
| **M1** | `ResourceAnalysisTable.jsx` | 지표 5컬럼(`totalMm`/`effectiveMd`/`totalMd`/`totalHours`/`issueCount`)에 `isSortable:true` + 셀 `sortValue`. 표시값("1.25 MM", "8 h")이 아니라 원본 숫자. `effectiveMd` 는 backend 가 확정한 "분모 없음"을 `null` 로 그대로 넘겨 결측 처리(0 으로 바꾸지 않음) |
| **M2** | `PortfolioProjectTable.jsx` | 죽은 화살표 7개(`name`·`members`·`actualMm`·`salary`·`completion`·`schedule`·`utilization`)에 `sortValue` 주입 → 실동작. `pickCells` 게이팅 구조는 그대로라 `costMasked` 시 salary 컬럼이 빠지는 동작 무변경 |
| **M3** | `StorageProjectList.jsx` · `StorageTableList.jsx` | `sortKey` → `sortValue` 리네임(어댑터가 별칭도 읽으므로 무수정으로도 정상화되지만 오용 흔적을 지웠다). `<td>` 로 새던 unknown-prop 경고 소멸. **추가**: `name` 컬럼에도 `sortValue`(이름 문자열)를 줬다 — 이 컬럼은 셀 key 가 `name-{idx}` 라 판정은 통과하지만 정렬 결과가 **원본 인덱스 순**이었다(설계가 지목한 "오답 정렬"이 이 컬럼에도 남아 있었음). 4줄 |

그 외 호출부는 손대지 않았다.

---

## 5. i18n

- `locales/kr/common.json` · `locales/en/common.json` 의 `table` 블록에 `sortAsc`/`sortDesc`/`sortButton`/`resizeColumn` 4키 추가.
- **`cd static/ui && npm run merge` 실행 완료** → `ko-KR.json`/`en-US.json` 에 4키 반영 확인(직접 수정 없음).
- 앞 3키는 Atlaskit 이 영어 하드코딩('Sort ascending')하던 툴팁/aria 를 대체한다 — `adaptHead` 1곳 주입으로 전 표에 동시 적용.

---

## 6. 테스트 · 빌드 · 번들

| 항목 | 결과 |
|------|------|
| 신규 테스트 3파일 | **54 tests pass** (tableSort 19 / columnWidths 14 / tableContract 21) |
| 전체 `cd static/ui && npm test` | **69 suites / 1164 tests 전량 통과** (기존 66 suites 회귀 0, 스냅샷 1 통과) |
| `CI=true npm run build` | **성공** (eslint 에러 0 — CI 는 warning 을 error 로 올린다) |
| `bundle:check` | `gzipBytes 895,166` / budget `950,000` → **within budget**. 신규 의존성 0 |

> 빌드 1차 시도는 `// eslint-disable-next-line react-hooks/exhaustive-deps` 주석 때문에 실패했다 — 이 리포에는 `eslint-plugin-react-hooks` 규칙이 로드되지 않아 **정의되지 않은 규칙을 끄는 주석 자체가 에러**다. 주석을 일반 설명 주석으로 바꿔 해소(규칙이 없으므로 경고도 애초에 나지 않는다).

---

## 7. 폭 동결 무회귀 근거

- **계측값을 정규화하지 않는다** — 계측 시점 폭은 호출부 `width` 선언이 이미 반영된 결과다. 합 80인 `ResourceAnalysisChart` 도 계측→% 환산이 현재 픽셀 비율 그대로라 모양이 바뀌지 않는다.
- **`isFixedSize` 27개(ChartTableToggle)**: prop 은 그대로 통과시키고(`TableSurface` → `DynamicTable`), 이미 균등폭이라 계측값도 균등 → 픽셀 무변화.
- **`isFixedSize` 를 새로 켜지 않는다** — 켜면 th/td 에 `overflow:hidden` 이 붙어 긴 문자열이 잘려 사라진다. `table-layout:fixed` 만 우리 CSS 로 주고 긴 토큰은 `overflow-wrap:anywhere` 로 접는다(둘 다 `.is-width-frozen` 스코프라 동결 전 표에는 영향 없음).
- **jsdom/레이아웃 없는 환경**: 합 0 → `toPercentWidths` 가 `null` → 동결하지 않고 현행 auto 유지(테스트/SSR 안전).
- 동결 전 `<table>` 탐색은 `table.tHead.rows[0].cells`(표준 API)로 한다 — `querySelectorAll('thead th')` 는 셀 안에 표가 중첩되면 남의 헤더까지 긁는다.

---

## 8. 설계 대비 이탈 / 보강 (3건, 전부 설계 의도 범위 내)

1. **`isResizable` 도 head 셀에서 strip 한다** (`tableSort.js:117`). 설계 §2-B 의 strip 요구는 행 셀만 명시했으나, DynamicTable 은 **head 셀의 미지정 필드도 `<th>` 로 스프레드**한다(`components/table-head.js` 의 `restCellProps` → `styled/table-head.js` 의 `rest`). 그대로 두면 신규 계약 필드가 새 unknown-prop 경고를 만들었을 것 — F5 와 같은 이유의 필연적 보강.
2. **`adaptTable` 을 `adaptHead` + `adaptRows` 로 분해**하고 `TableSurface` 는 둘을 따로 부른다. head 를 시그니처로 메모하면(설계 §3-1) 번역·툴팁 등 **헤더 content 가 바뀌었는데 시그니처가 같아 옛 헤더가 남는다**(예: `ResourceAnalysisTable` 의 `baseMmDays` 의존 툴팁). → 행 변환만 시그니처 메모하고 head 는 매 렌더 재작성(컬럼 수만큼이라 값싸다). `adaptTable` 합성 API 는 그대로 export 한다.
3. **M3 에 `name` 컬럼 `sortValue` 4줄 추가** (§4 표 참고). 설계는 "6줄 리네임"이었으나 같은 화면에 남은 오답 정렬을 그대로 두면 M3 의 목적("오답 정렬 정상화")이 절반만 달성된다.

부수 추가: `columnWidths.resetEdgeWidths` (더블클릭 리셋을 순수 함수로 뽑아 테스트 대상에 포함. 쌍의 합을 보존해 전체 합 100 을 깨지 않는다).

---

## 9. 남은 것 (미수행)

- **§8-5 수동 검증 7항목** — 브라우저 확인이 필요해 이 단계에서 수행하지 않았다. 특히 (a) 리사이즈 드래그 실감, (b) 다크 테마 핸들 색, (c) `maxHeight` 스크롤 표에서 오버레이 위치, (d) 첫 실데이터 페인트 시 리플로우 1회가 눈에 띄는지.
- 알려진 한계(설계 문서화 그대로): 정렬 시 페이지 1 복귀 없음 / 라우트 이탈 후 복귀 시 폭은 계측 기준선으로 리셋 / 실데이터 컬럼이 우연히 전 행 동일값이면 화살표가 사라짐.
- `CursorPagingTable`·`PagingTable` 은 이번에도 정렬을 열지 않았다(§3-2 — 현재 페이지만 정렬되는 새 오해 방지).

---

## 10. 수정 이력 — 통합 검증(`03_verify_report.md`) 후속 (2026-08-12)

### F-1 (실패 · 수정 완료) — 오버레이 좌표 기준 불일치

`widths[]` 는 **테이블 폭** 기준 %인데 오버레이가 `.table-wrapper` **패딩 박스**(`left:0; right:0`)에 깔려 있어,
`maxHeight` 표에 세로 스크롤바가 뜨면 두 기준이 스크롤바 폭(≈15px)만큼 갈라져 핸들이 컬럼 경계를 벗어났다.
(영향: `PortfolioUtilization.jsx:136`, `ProgressRiskTable.jsx:141`, 그리고 `tableMaxHeight` 를 넘기는 `ChartTableToggle` 호출부)

검증 리포트 §2 **1안(권장)** 그대로 반영 — 계측 시 테이블 폭을 함께 동결해 오버레이에 px 폭을 준다.

| 파일:라인 | 변경 |
|---|---|
| `useStableColumnWidths.js:60-72` | 계측 시 `tableWidth: table.getBoundingClientRect().width` 를 `frozen` 에 함께 저장(주석에 사유) |
| `useStableColumnWidths.js:89` | 훅 반환값에 `tableWidth` 추가(시그니처 리셋 시 스크롤바 변화도 재계측됨) |
| `TableSurface.jsx:79` | 훅에서 `tableWidth` 수신 |
| `TableSurface.jsx:120-122` | `ColumnResizeOverlay` 로 `tableWidth` 하달 |
| `ColumnResizeOverlay.jsx:19` | `tableWidth` prop 추가 |
| `ColumnResizeOverlay.jsx:84` | 최상위 div 에 `style={{ width: tableWidth }}` — 핸들 `left:%` 의 기준 상자를 **테이블**로 고정 |
| `ColumnResizeOverlay.jsx:65-66` | `tableWidth <= 0` 이면 렌더하지 않는다(기준 상자가 없으면 전 핸들이 어긋나므로 fail-safe) |
| `ColumnResizeOverlay.jsx:32-34,45-46` | 드래그 환산용 실시간 폭 지역변수를 `liveTableWidth` 로 개명 — 새 prop 과의 이름 충돌 제거(**드래그는 여전히 `pointerdown` 시점의 실제 폭을 쓴다**) |
| `table.css:82-92` | `.table-col-resize-overlay` 에서 `right: 0` 제거 + 사유 주석 |

### F-2 (권고 · 반영 완료) — `sortValue` 균일 제공 계약

`tableSort.js:20-22` 계약 JSDoc에 추가:
> 정렬 컬럼의 `sortValue` 는 **모든 행에 균일하게** 준다. 일부 행만 주면 나머지가 셀 `key`(컬럼 식별자)로 폴백해 그 컬럼이 조용히 **문자열 정렬로 강등**된다. 값이 없는 행은 필드를 빼지 말고 `sortValue: null` 로 명시할 것(결측으로 처리돼 한쪽 끝에 모인다).

### 재검증 결과

| 항목 | 결과 |
|------|------|
| `npx jest src/components/table --silent` | **3 suites / 54 tests 통과** |
| `CI=true npm run build` | **성공** (eslint 에러 0) |
| `bundle:check` | `gzipBytes 895,187` / budget `950,000` → within budget (F-1 수정분 +21 B) |

F-3(작업 트리의 무관한 28파일 혼입)은 이번 기능 범위 밖이라 손대지 않았다.

---

## 11. 수정 이력 2차 — 재검증 §2-R **F-1b** (2026-08-12)

### 증상 — 1차 수정(px 고정폭)이 도입한 부작용 2건

오버레이를 `style={{ width: tableWidth }}` 로 **계측 시점 px 에 못 박으면서** 컨테이너 폭 변화 추종을 잃었다.
표는 `table-layout:fixed` + `table { width:100% }` 라 컨테이너를 따라가는데 오버레이만 고정이라

- **A. 핸들 어긋남** — 창 리사이즈·**Jira 사이드바 접기(≈240px, Forge iframe 이라 흔하다)** 시 오차 = (현재 테이블 폭 − 계측 폭) × 누적%.
- **B. 없던 가로 스크롤바** — `.table-wrapper` 가 `overflow-x:auto` 라 절대배치 자식도 overflow 에 기여한다. 컨테이너가 좁아지면 px 고정 오버레이가 래퍼를 넘쳐 스크롤바가 생긴다.

### 수정 — §2-R 권장안(여백 보정) 그대로

폭을 고정하는 대신 **컨테이너 폭과 무관한 상수인 `gutter`(= 래퍼 폭 − 테이블 폭 ≈ 세로 스크롤바 폭)만** 동결하고,
오버레이를 다시 래퍼에 붙인다(`left:0` + `right:gutter`). 폭 변화를 자동 추종하고 `right >= 0` 이라 넘침이 구조적으로 불가능하다.

| 파일:라인 | 변경 |
|---|---|
| `useStableColumnWidths.js:59-60` | `tableWidth` + `wrapperWidth` 를 각각 계측 |
| `useStableColumnWidths.js:62-75` | 왜 폭이 아니라 여백을 저장하는지(컨테이너 추종·overflow 불가) 주석 |
| `useStableColumnWidths.js:82` | `gutter: Math.max(0, wrapperWidth - tableWidth)` 를 `frozen` 에 저장 (`tableWidth` 는 fail-safe 판정용으로 유지) |
| `useStableColumnWidths.js:102` | 훅 반환값에 `gutter` 추가 |
| `TableSurface.jsx:79` | 훅에서 `gutter` 수신 |
| `TableSurface.jsx:121-123` | 오버레이로 `gutter` 하달 |
| `ColumnResizeOverlay.jsx:20` | `gutter = 0` prop 추가 |
| `ColumnResizeOverlay.jsx:90,92` | `style={{ width: tableWidth }}` → **`style={{ right: safeGutter }}`** (width 지정 제거, CSS 의 `left:0` 이 살아 폭을 결정) |
| `table.css:81-86` | 주석을 새 방식으로 갱신(`right` 는 인라인, `right:0` 고정도 px 고정도 안 되는 이유) |

**fail-safe 판단(§2-R 3번 — 내 재량 항목)**: `gutter` 가 유한한 양수가 아니면 **`0` 으로 폴백**한다(`ColumnResizeOverlay.jsx:90`) — 종전 `right:0` 과 동일한 동작이다.
미렌더를 택하지 않은 이유: 최악의 결과가 "스크롤바 폭만큼 핸들이 밀림"(원래 F-1 수준)인데, 미렌더는 **스크롤바가 없는 정상 표에서까지 리사이즈 기능을 통째로 없앤다** — 손실이 증상보다 크다.
`tableWidth <= 0` 가드(`:67`)는 §2-R 4번대로 유지했다(계측 실패 판정으로 계속 유효하며, 그 경우는 애초에 오버레이가 마운트되지 않는 이중 안전망이다).

드래그 델타 환산(`liveTableWidth`, `pointerdown` 시점 실측)은 지시대로 **손대지 않았다** — 오버레이 좌표(동결값)와 드래그 환산(실측값)의 분리는 그대로다.

### 재검증 결과 (2차)

| 항목 | 결과 |
|------|------|
| `npx jest src/components/table --silent` | **3 suites / 54 tests 통과** |
| `CI=true npm run build` | **성공** (eslint 에러 0) |
| `bundle:check` | `gzipBytes 895,186` / budget `950,000` → within budget |

### 남은 항목 (미착수 — 지시 범위 밖)

- §2-R R-6 권고 2건(심각도 하): `CommonTable.jsx` JSDoc 에 `sortValue` 균일성 1줄, `sortValue` shape 혼재 회귀 테스트 1건.
- §8-5 브라우저 검증 — 특히 이번 수정의 핵심인 **(a) 사이드바 접기/창 리사이즈 시 핸들 추종, (b) 좁아질 때 가로 스크롤바 미발생, (c) `maxHeight` 표(`PortfolioUtilization`·`ProgressRiskTable`)에서 핸들이 컬럼 경계에 붙는지** 는 실기 확인이 필요하다.
- F-3(무관한 28파일 혼입) 미개입.

---

## 12. 후속 수정 — 사용자 실사용 피드백 2건 (2026-08-12)

범위: `components/table/table.css` 안에서만 해결(JSX·로직 무변경).

### U-1. "핸들이 잘 안 잡힌다" — 히트 영역과 시각선 분리

겨냥하는 폭과 보여야 하는 폭은 다른데 둘 다 6px 이었다. 상자만 넓히고 선은 그대로 얇게 둔다.

| 파일:라인 | 변경 |
|---|---|
| `table.css:126-142` | `.table-col-resizer` 히트 영역 **6px → 14px**(`margin-left: -7px` 로 경계 중앙 유지). `cursor: col-resize`·`touch-action: none`·`pointer-events` 규약 그대로 |
| `table.css:145-156` | 시각선(`::after`)을 상자 중앙(`left: 6px`)에 배치, 기본 2px·투명. `transition: background-color` 만(기하 애니메이션은 드래그가 끌리는 느낌을 준다) |
| `table.css:158-162` | hover/드래그 중 **선이 4px 로 굵어지고** `--ds-border-selected` 색이 들어온다 |

정렬 클릭과의 충돌은 그대로 없다 — 상자 바깥은 `pointer-events` 가 헤더 버튼으로 간다(핸들 상자는 컬럼당 최대 7px씩만 잠식하고, 최소폭 48px 컬럼에서도 가운데가 남는다).

### U-2. "컬럼을 좁히면 옆 컬럼과 글자가 겹친다" — 넘침 정책 확정

**원인**(코드 확인): `table-layout: fixed` 에서 컬럼보다 넓은 셀 내용은 **잘리지 않고 셀 밖으로 그려진다**. 기존 규칙은 `overflow-wrap: anywhere` 뿐이라 **접을 수 없는 내용**은 그대로 넘쳤다 — `white-space: nowrap` 텍스트(`PortfolioProjectTable` 의 Badge, `ResourceAnalysisTable` 의 지표 span), 폭이 고정된 요소(`MdBar` 100px, 아바타, 배지).

**채택 정책: 접기 우선 · 자르기는 최후 (wrap-first, clip-fallback)** — `table.css:75-105`

| 순서 | 규칙 | 효과 |
|---|---|---|
| 1 | `overflow-wrap: anywhere` (기존 유지) | 보통의 긴 텍스트는 **접어서** 전부 보인다 — 데이터 손실 0, 행이 높아질 뿐 |
| 2 | `overflow: hidden` (신규, `th`+`td`) | 접을 수 없는 것만 잘린다. **겹쳐서 둘 다 못 읽느니 하나를 자르는 편이 낫다** |
| 3 | `text-overflow: ellipsis` (신규) | 잘린 것이 텍스트면 "…" 로 잘렸음을 알린다 |

*ellipsis 전면 적용(=`white-space: nowrap` 강제)을 택하지 않은 이유*: 그러면 **모든 셀이 한 줄로 고정**되어, 지금은 접혀서 다 보이던 긴 이름·설명이 전부 잘린다. 설계서 §4-1 이 `isFixedSize` 를 거부한 이유(내용이 잘려 사라짐)와 같은 손실을 자초하게 된다. 자르기는 **접기가 불가능할 때만** 나타나는 폴백이어야 한다.

**지시한 3개 제약 처리**

| 제약 | 처리 |
|---|---|
| (a) 체크박스·아바타·배지가 찌그러지지 않을 것 | `overflow: hidden` 은 **크기를 바꾸지 않는다**(자르기지 축소가 아니다). 컬럼이 그 요소보다 좁을 때만 가장자리가 잘리고, 이는 사용자가 직접 좁힌 결과다 |
| (b) `shouldTruncate` 표와 충돌 없을 것 | Atlaskit 은 그 경우 `white-space: nowrap`(`_o5721q9c`) + `text-overflow: ellipsis`(`_1bto1l2s`) 를 얹는다. 우리 규칙은 **`white-space` 를 건드리지 않으므로** 그 표는 종전과 동일하게 한 줄+말줄임으로 동작한다. `isFixedSize` 27표는 Atlaskit 이 이미 같은 `overflow:hidden`(`_1reo15vq _18m915vq`)을 걸어 둔 상태라 변화 없음 |
| (c) 툴팁 동작 보존 | Atlaskit Tooltip 은 **포털로 body 에 그려져** 셀의 overflow 에 영향받지 않는다. `menuPortalTarget={document.body}` 를 쓰는 셀 내 Select(`ProjectUserPanel`·`SalaryManagementPage`)도 동일 |

**추가 안전장치 — 편집 중 자르기 해제** (`table.css:97-105`)
셀 안 인라인 편집기는 컬럼보다 넓을 수 있고(`ProjectIssueTable` 의 `DatePicker` 는 `minWidth: 220`), 그것까지 자르면 **입력 자체가 불가능**해진다. 편집기는 포커스를 받으므로 `td:focus-within { overflow: visible }` 이 **"지금 편집 중인 셀"만** 정확히 골라 자르기를 푼다. 읽기 상태의 겹침 방지는 그대로 유지된다.

### 검증 (3차)

| 항목 | 결과 |
|------|------|
| `npx jest src/components/table --silent` | **3 suites / 54 tests 통과** |
| `CI=true npm run build` | **성공** (eslint 에러 0) |
| `bundle:check` | `gzipBytes 895,184` / budget `950,000` → within budget |

> CSS 전용 변경이라 자동 테스트가 잡아 줄 수 있는 부분이 없다. **실기 확인 필요**: 핸들 잡기 쉬워졌는지, 좁힌 컬럼에서 겹침이 사라졌는지, `ProjectIssueTable`·`ProjectUserPanel`·`SalaryManagementPage` 의 인라인 편집(날짜 선택기 포함)이 좁은 컬럼에서도 정상 입력되는지.
