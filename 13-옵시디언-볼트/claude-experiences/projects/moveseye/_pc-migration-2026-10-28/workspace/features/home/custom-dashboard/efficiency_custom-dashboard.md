# 커스텀 대시보드 — 효율성 검사 리포트

> **적용 상태(2026-06-17 패치 완료)**: #1·#5(BE Nest+Spring), #3·#4·#7(FE) 반영 — 빌드/타입 검증 통과.
> #2(자동 refetch 정책)는 **현상 유지로 확정**(#1으로 호출량 충분히 감소, 모니터링 실시간성 보존). #6(invalidate 제거)은 보류.
>
> 작성일 2026-06-17 · 범위: 데이터 호출(API) ↔ 뷰잉(렌더링) 경로의 정적 효율성 점검
> 대상: FE `CustomItemChartPreview`/`WidgetCard`/`ServerMonitoringDetail`/`useWidgets`, BE `ItemsService`(Nest+Spring), Zabbix history/trend 호출
> 성격: **정적 코드 점검 + 예측 가능 이슈**. 런타임 부하 측정은 미수행(별도 functional-qa 필요).

---

## 0. 한눈에 — 심각도 순

| # | 영역 | 이슈 | 심각도 | 핵심 비용 |
|---|------|------|--------|-----------|
| 1 | BE | history.get **itemid별 N+1 호출** (Nest·Spring 동일) | 🔴 높음 | 위젯의 항목 수 M → JSON-RPC M회. value_type별 2회로 축소 가능 |
| 2 | FE | 위젯별 독립 쿼리 × **3분 자동 refetch**가 BE N+1과 곱연산 | 🔴 높음 | 3분마다 Σ(위젯별 M) 회의 history.get |
| 3 | FE | `CustomItemChartPreview` 테이블 데이터 **매 렌더 무조건 계산**(view=chart여도) | 🟡 중간 | grid·parseDataChart·tableData를 불필요하게 매 렌더 |
| 4 | FE | `echartOption` 매 렌더 새 객체 + `notMerge` → 풀 리렌더 | 🟡 중간 | 데이터 무변경에도 ECharts 전체 재계산 |
| 5 | BE | trend **폴백도 itemid별 개별 호출** | 🟡 중간 | 보존기간 초과 장기 조회 시 추가 N+1 |
| 6 | FE | `saveLayout` 성공 시 위젯 목록 **전체 invalidate→refetch** | 🟢 낮음 | 드래그 종료마다 위젯 목록 GET 1회(데이터 재요청은 없음) |
| 7 | FE | `layout` 배열 매 렌더 재생성(`ServerMonitoringDetail`) | 🟢 낮음 | GridLayout에 매번 새 배열 참조 |

---

## 1. 🔴 BE — history.get itemid별 N+1 (Nest·Spring 동일)

**위치**: `moveseye-be/src/host/items/items.service.ts:40-79`, `moveseye-be-spring/.../host/items/ItemsService.java:41-70`

```ts
return Promise.all(
  chartableItems.map(async (item) => {
    const history = await this.zabbixHistoryService.getHistoryByItemids(authToken, {
      from, to, itemids: [item.itemid],   // ← itemid 1개씩
      history: value_type === '3' ? UNSIGNED : FLOAT,
    });
    ...
  }),
);
```

위젯이 항목 M개를 담으면 **`history.get` JSON-RPC가 M회** 발생한다. 그런데 `getHistoryByItemids`는 이미 `itemids: string[]` 배열을 받는다 — itemid별로 쪼갤 이유가 없다.

**제약**: Zabbix `history.get`의 `history` 파라미터(value_type)는 호출당 하나라 float(0)·unsigned(3)를 섞어 한 번에 못 받는다. 따라서 **value_type 2그룹으로 묶어 최대 2회**로 줄일 수 있다.

**권고**:
1. `chartableItems`를 `value_type`(0/3) 기준으로 그룹핑.
2. 그룹별 `getHistoryByItemids({ itemids: [그룹 전체], history: type })` 1회 호출.
3. 응답을 `itemid`로 그룹핑(`history.itemid` 이미 존재)해 시리즈 매핑.
   → **M회 → 최대 2회**. `Promise.all`은 그대로 두 그룹 병렬.

---

## 2. 🔴 FE — 위젯별 독립 쿼리 × 3분 자동 refetch

**위치**: `CustomItemChartPreview.tsx:104-119` + `usePeriodTimes.ts:21-38`

- 각 `WidgetCard` → `CustomItemChartPreview`가 **자기 쿼리**로 `getItemsHistory`를 호출(queryKey에 `itemIdsKey,period,from,to` 포함 → 위젯끼리 캐시 공유 없음).
- `usePeriodTimes`가 `period` 기반일 때 **3분(`THREE_MINUTES`)마다 `from/to`를 갱신** → queryKey 변경 → 전 위젯 자동 refetch.

결과: **3분마다 `Σ(위젯별 history.get M_i)` 회**의 BE 호출. 이슈 #1의 N+1과 곱해진다.
예) 위젯 6개·평균 항목 3개 → 현재 3분마다 ~18회 history.get. #1 수정 시 위젯당 ≤2회 → ~12회, #1+호스트 단위 통합까지 가면 더 축소.

**권고(난이도 순)**:
- (저) refetch 주기가 모니터링 의도에 맞는지 확인 — 커스텀 차트는 자동 갱신이 꼭 필요치 않을 수 있다. 불필요하면 `usePeriodTimes`에 긴 주기/수동 갱신 옵션 부여(상단 동기화 버튼과 일원화).
- (중) 같은 호스트의 위젯 데이터를 **호스트 단위로 합쳐** 한 번에 조회(공통 period 그룹별 1쿼리, 위젯은 itemId로 슬라이스). 위젯마다 period가 제각각이면 period별로만 묶어도 호출 수 급감.

---

## 3. 🟡 FE — 테이블 데이터 매 렌더 무조건 계산

**위치**: `CustomItemChartPreview.tsx:138-173`

```ts
const grid = getChartTimeGrid(data ?? []);
const seriesValues = (data ?? []).map(...parseDataChart...);
const tableColumns = [...];
const tableData = grid.map(...);   // ← view가 "chart"여도 매 렌더 실행
```

`view === "table"`일 때만 쓰는 `grid/seriesValues/tableColumns/tableData`가 **차트 보기에서도, 매 렌더마다** 계산된다. 데이터가 크고 위젯이 많으면 누적 비용이 크다.

**권고**: `view === "table"` 가드로 분기하거나 `useMemo([data, view])`로 메모이즈. 최소한 `tableData.map`은 테이블 진입 시에만.

---

## 4. 🟡 FE — echartOption 매 렌더 새 객체 + notMerge

**위치**: `CustomItemChartPreview.tsx:222-244`

`echartOption`(`buildSnapshotOption` 포함)이 **매 렌더 새 객체**로 만들어지고 `<ReactECharts notMerge />`라 데이터가 안 바뀌어도 ECharts가 전체 옵션을 재적용/재계산한다. 부모 리렌더(기간 Select·동기화 등)에 차트가 같이 흔들린다.

**권고**: `useMemo([data, chartType, options.options])`로 옵션 메모이즈. `notMerge`가 꼭 필요한 경우(시리즈 수 변동)만 조건부.

---

## 5. 🟡 BE — trend 폴백도 itemid별 개별

**위치**: `items.service.ts:61-70`, `ItemsService.java:65-69`

history가 비면 itemid마다 `getTrendByItemids([item.itemid])`를 또 개별 호출. 장기 기간(보존기간 초과) 다항목 위젯에서 2차 N+1.

**권고**: #1 그룹핑과 동일하게 trend도 **빈 itemid를 모아 1회** 조회 후 itemid로 분배.

---

## 6. 🟢 FE — saveLayout 후 전체 invalidate

**위치**: `useWidgets.ts:53-57` + `ServerMonitoringDetail.tsx:97-108`

드래그/리사이즈 종료(`onLayoutChange`)마다 `saveLayout` → `onSuccess: invalidate` → 위젯 목록 GET 재요청. 차트 데이터는 캐시 유지라 재요청되진 않지만, 좌표는 이미 클라이언트가 알고 있으므로 목록 재조회는 불필요하다.

**권고**: 레이아웃 mutation은 **낙관적 업데이트**(`setQueryData`로 좌표만 갱신)로 처리하고 invalidate 생략. 드래그가 잦으면 저장 호출 자체를 debounce.

---

## 7. 🟢 FE — layout 배열 매 렌더 재생성

**위치**: `ServerMonitoringDetail.tsx:86-94` — `widgets.map(...)`가 매 렌더 새 `layout` 생성.

**권고**: `useMemo([widgets])`. (영향은 작음 — RGL이 내부 상태를 들고 있어 시각적 문제는 없으나 불필요한 참조 변경.)

---

## 8. 긍정적으로 잘 된 부분

- `collected-info`를 `ServerMonitoringDetail`·`WidgetCard`가 **동일 queryKey로 캐시 공유** → 위젯 수와 무관하게 네트워크 1회 (`ServerMonitoringDetail.tsx:55` 주석에 의도 명시).
- 위젯 생성은 axios 중복요청 취소 회피를 위해 **순차 처리**(`ServerMonitoringDetail.tsx:261`) — 의도적 트레이드오프.
- `getItemsHistory` queryKey가 `itemIdsKey,period,from,to`로 정확히 구성 → 캐시 키 충돌/과다 무효화 없음.
- BE가 차트 불가능(value_type) 항목을 서버에서 선제 필터 → 불필요한 history 조회 차단.

---

## 9. 권고 우선순위 (ROI 순)

1. **#1 BE N+1 제거**(value_type 그룹핑) — 코드 국소, 효과 큼. Nest·Spring 양쪽 동시.
2. **#2 자동 refetch 정책 점검** — 한 줄 설정으로 호출 빈도 즉시 감소. #1과 곱연산이라 함께 효과.
3. **#3/#4 FE 메모이즈** — 렌더 비용·체감 부드러움 개선.
4. **#5 trend 폴백 그룹핑** — #1과 같은 패턴, 함께 처리.
5. **#6/#7** — 여력 있을 때.

> 다음 단계 제안: #1·#2·#5는 BE/FE 코드 수정이 필요한 항목이라 원하면 be-engineer·fe-engineer로 실제 패치까지 진행 가능. 본 리포트는 점검·권고까지만.
</content>
</invoke>
