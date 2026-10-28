# MovesEye 개발 설계 — 차트 공용 드릴다운: 툴팁 링크 + 차트↔표 전환 (ZM-119 후속, FE 전용)

> 작성 2026-08-27 · Claude · v1 · 티켓 **ZM-119**(이어서) · **BE 무변경**
> 요청(사용자): "각 항목 툴팁 클릭하면 세부 데이터로 이동, 로우 데이터 볼 수 있게 차트마다 버튼으로 표 전환". 범위 = **자산 관리 전체 차트**(1단계) → **이벤트/알림 · 자빅스 관리 하위 신설 페이지**(2단계).
> 토대: [devdesign_asset-dashboard.md](../../assets/asset-dashboard/solutions--devdesign_asset-dashboard.md) §4.3(클릭 딥링크 규칙) · `AssetChartCard` · `deepLink.ts` · 공용 `DmoveChart`(모달형 데이터표 선례)

## 0. 실측(2026-08-27, ZM-119 브랜치)
- 자산 영역 ECharts 8곳: 대시보드 HBar(공용)·Stacked(공용)·취득연도·활동추이 / 비용 도넛(공용, 4회)·월별추이·번다운·상각스케줄 / Cloud 실청구 막대. 나머지는 래핑·Progress·SVG.
- **툴팁 클릭 전례 0**(`enterable` 0건) · **차트↔표 토글 UI 전례 0** · 모달형 "데이터표"(`DmoveChart`→`TableDataChartModal`)는 `xAxis.data` 전제라 가로막대·도넛에 못 씀 · `chartDataView.ts`(toolbox dataView)는 시간축 튜플 전용.
- 클릭 딥링크는 `AssetHBarCard`·`AssetStackedBarCard` 2곳뿐(`onEvents.click` → `onSelect`). 비용 카드·시간축 차트는 클릭 없음.
- `AssetChartCard.extra`와 `hint`가 **배타적**(extra 주면 물음표 사라짐).
- 🐛 `CostMonthlyTrendCard.tsx:106` `costChartColors[2]`·`CostHwDepreciationPage.tsx:232` `color: costChartColors` — 함수를 배열로 취급(색 undefined). 이번에 같이 수정.

## 1. 원칙
1. **한 카드 한 데이터** — 차트와 표는 같은 `rows`를 그린다. 표가 "로우 데이터"다(차트가 Top N으로 접은 것도 표는 전부).
2. **드릴다운은 한 함수** — 막대 클릭·툴팁 링크·표 행 클릭이 전부 카드의 `onSelect(row)` 하나로 수렴(기존 `goToList`/`tagLink` 재사용). 링크가 없는 항목(착지 축 없음)은 셋 다 없다 — 툴팁에만 링크가 있고 클릭은 안 되는 상태 금지.
3. **표는 키보드 경로** — canvas 드릴다운이 마우스 전용이던 문제(ZM-116 잔여)를 표 뷰가 해소한다. 행 클릭은 `activatable`(Enter/Space).
4. **범용 컴포넌트** — 2단계(이벤트/자빅스)가 배선만 하면 되도록 `components/Chart/`에 둔다. 자산 전용 로직(deepLink)은 카드 밖.

## 2. 컴포넌트

### 2.1 `components/Chart/ChartCard.tsx` (신규 — `AssetChartCard`를 승격·대체)
```ts
interface ChartCardProps<Row> {
  id: string;                       // 뷰 상태 저장 키·툴팁 링크 스코프
  title: string; hint?: string; subtitle?: ReactNode; extra?: ReactNode;   // extra와 hint 공존(배타 해제)
  loading?: boolean; isEmpty?: boolean; emptyDescription?: string; bodyHeight?: number;
  table: { columns: ColumnsType<Row>; rows: Row[]; rowKey: keyof Row | ((r: Row) => string);
           onRowSelect?: (row: Row) => void; selectLabel?: string };   // onRowSelect 있으면 행 클릭+"보기" 열
  defaultView?: 'chart' | 'table';
  children: ReactNode;              // 차트
}
```
- 툴바(`Card.extra`): `[hint ?] [extra] [Segmented: 차트 | 표]`(아이콘 `BarChartOutlined`/`TableOutlined`, `aria-label`). 빈 상태·로딩엔 토글 비활성.
- 뷰 상태: 카드 로컬 + `sessionStorage['chartView:'+id]`(페이지 리마운트에도 유지, 다른 사용자 공유 없음). URL에 넣지 않는다(데이터 결정 상태가 아님).
- 표 뷰: `DmoveTable`(`showPagination={false} hasQuery={false} size="small" tableLayout="fixed"`, `loading` 명시, `scroll={{y: bodyHeight-48}}`), `onRowSelect` 있으면 행 `activatableProps` + 마지막 열 "보기 →". 값 열은 기존 포맷터(숫자 천단위·USD 4자리 등) 재사용.
- 숨김 텍스트(a11y)는 차트 뷰에서만(표 뷰는 DOM이 값).

### 2.2 `components/Chart/tooltipLink.ts` (신규)
- `tooltipLinkHtml({cardId, key, label})` → `<a class="chart-tooltip-link" data-chart-card="{cardId}" data-chart-key="{key}" href="#">{label} →</a>` (escape).
- `useTooltipLinkDelegation(cardId, onSelectKey)`: `document`에 **위임 클릭 리스너 1개**(카드 마운트 시 등록/해제) — `closest('[data-chart-card="<id>"]')` 매칭 시 `preventDefault` + `onSelectKey(key)`. 툴팁이 `appendToBody`라 body 위임이 유일한 경로.
- 툴팁 옵션 헬퍼 `tooltipEnterable(base)` → `{...base, enterable: true, hideDelay: 250, confine: true}`; `appendToBody: true` 유지.
- 축 트리거(`trigger:"axis"`) 차트는 formatter가 항목마다 링크를 만들되 **착지 축이 있는 계열만**. 없으면 링크 없음.

### 2.3 차트별 표·링크 매핑 (1단계)
| 차트 | 표 컬럼 | 행/툴팁 링크 |
|---|---|---|
| 자산 HBar(분류·그룹·OS·소유자·완성도·만료) | 항목·건수(·비율) | 기존 `onSelect`(딥링크 있는 항목만) |
| Stacked(소스×커버리지·생애주기·live) | 구간·건수·비율 | `segment.onSelect`(live는 없음) |
| 취득연도 | 연도·자산 수·내용연수 초과 | 없음(목록 축 없음) |
| 30일 활동 추이 | 일자·5계열 | 없음 |
| 비용 도넛(구성·분류별·소유자별·lifecycle·상각방법) | 항목·금액·비율 | 분류별→HW 탭 `?deviceType=`, 소유자별→`?owner=`, lifecycle→`?lifecycle=` (`SearchCostHwDto` 어휘). 구성·상각방법은 없음 |
| 월별 비용 추이 | 월·상각·유지보수·리스·합계·(실적/예상) | 없음 |
| 장부가액 번다운 | 월·장부가액 | 없음 |
| 상각 스케줄 | 월·상각액·누계·장부가액 | 없음 |
| Cloud 실청구 막대 | 일자·금액 | 없음(기존 `toolbox.dataView` 제거 — 표 토글로 통일; EC2 개요 쪽도 동일 컴포넌트라 같이 바뀜) |

## 3. 2단계 (이벤트/알림 · 자빅스 관리 신설 페이지) — 2026-08-27 인벤토리 결과 반영
- 🔴 **실측: `pages/event-alert/**`·`pages/zabbix-management/**`(8월 신설 6페이지 포함)에 ECharts 차트가 0건.** 이벤트 데이터 차트는 인접 2곳뿐 → 2단계 대상은 이 둘 + 공용 `DmoveChart` 범용화:
  | 차트 | 착지 | 비고 |
  |---|---|---|
  | 홈 위젯 "알람 심각도 분포" 도넛(`AlarmSeverityPieWidget`) | `/event-alert/problem?status=<severity>&show=history` | 목록이 `stringParams`를 BE에 그대로 전달 → 즉시 동작. 🔴 심각도 키는 `status`(`severity`는 렌즈 전용) |
  | 호스트그룹 "알림 추이" 스택막대(`HostGroupAlertTrend`, `DmoveChart`) | `problem?status=&from=&to=&groupId=&show=history` — `HostGroupSummaryPanel.applyFilter`와 같은 키·형식(공용 헬퍼) | `DmoveChart`에 `onPointClick`·`tooltipLinks`·`inlineTable` 옵션 prop 추가(미지정 시 기존 동작 불변, 모달 "데이터표"는 유지) |
- 홈 위젯은 `HomeWidgetShell`이 이미 카드라 `ChartCard`의 토글·표를 크롬 없이 쓰는 분리 컴포넌트(`ChartViewToggle`·`ChartTableView`)로 배선(이중 카드 금지).
- 모니터링 커버리지 페이지는 URL 필터를 읽지 않아 착지 불가(선행 작업 필요) — 차트도 없어 이번 범위 아님.
- 다른 세션(zm-118)의 **자빅스 개요 신설 페이지는 미커밋** → 병합 후 같은 카드로 배선.

## 4. 판정 규칙
- 툴팁 링크 ↔ 클릭 ↔ 표 행 링크는 **같은 항목 집합**(테스트로 고정).
- 표 행 수 = 데이터 전량(Top N 접기 무시), 차트 뷰의 "그 외 N"은 표에서 펼쳐진 개별 행.
- `enterable` 툴팁은 `hideDelay`로 이동 시간을 주되 250ms 초과 금지(잔상).
- 뷰 상태는 세션 한정, URL·서버 저장 없음.

## 5. 테스트
- `ChartCard`: 토글 → 표 렌더(행 수=rows)·행 클릭/Enter → `onRowSelect`·sessionStorage 복원·빈 상태 토글 비활성.
- `tooltipLink`: HTML escape · 위임 리스너가 `data-chart-card` 스코프 밖 클릭 무시 · 언마운트 해제.
- 각 카드: formatter 출력에 링크 포함 여부가 `onSelect` 유무와 일치(규칙 4).
- 기존 스위트 회귀(echarts mock 그대로).
