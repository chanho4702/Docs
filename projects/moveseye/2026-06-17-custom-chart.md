---
type: project
tags: [project, moveseye, dmove, custom-chart, dashboard, react-grid-layout, echarts, frontend, spring]
created: 2026-06-17
updated: 2026-06-17
status: active
---

# 서버 모니터링 호스트별 커스텀 차트 (2026-06-16~17)

> 호스트 상세 페이지(`ServerMonitoringDetail`)에 **사용자가 Zabbix 수집 항목을 골라 만드는 커스텀 차트(위젯)** 추가.
> 드래그/리사이즈 배치(react-grid-layout) + DB 영속화. **BE는 Nest+Spring 양쪽 병행 구현**([[2026-06-10-spring-conversion]] 규칙).
> 보고 문서: `C:\solutions\_workspace\report_custom-dashboard.md` · 기획/계약: `_workspace/plan_·features/home/custom-dashboard/contract_custom-dashboard.md`

## 한 줄 요약
"전역 공유 대시보드 신설" 계획에서 **"기존 호스트 상세에 host 스코프 커스텀 차트"** 로 방향 전환해 완성. 6/16 BE/DB/FE 수직슬라이스, 6/17 UI 폴리싱·버그픽스 마감. 전 단계 타입체크 통과, 실 런타임 시각검증만 대기.

## 배경 / 방향 전환
- 처음엔 moves-workforce의 Forge 대시보드처럼 **신규 공유 대시보드 페이지 + 집계형 위젯**(event/hostgroup)을 기획했으나,
- 사용자 결정으로 **기존 서버 모니터링 상세 페이지에 host별 custom_item 차트만** 추가하는 방향으로 축소·확정. 집계형 위젯/전역 대시보드는 폐기·후순위.

## 구현 범위
- **DB** `dashboard_widget` (host_id 스코프, **user_id 없음=공유**): title·chart_type(varchar)·config(jsonb `{itemIds}`)·pos_x/y·width/height. Nest TypeORM 마이그레이션 / Spring Flyway 동일 스키마. dev DB(dmove) 적용 완료.
- **BE API** (Nest·Spring 동일): `GET/POST /host/{id}/widgets`, `PATCH /host/{id}/widgets/layout`, `PATCH/DELETE /host/{id}/widgets/{widgetId}`, `GET /host/{id}/items/history?itemids=&from=&to=`(history, 1h 초과 trend 폴백), `GET /hosts/{id}/collected-info`(+`description`+`chartable`).
- **FE**: `useWidgets`(CRUD+레이아웃), `WidgetCard`/`AddChartModal`/`CustomItemChartPreview`, react-grid-layout **v2**(`GridLayout`+`useContainerWidth`, WidthProvider 없음). 차트유형 line/area/bar/scatter(시계열)+pie/gauge(현재값 스냅샷). 템플릿("서버 기본 모니터링")=고정 좌표.

## 핵심 결정
- **위치·크기는 FE가 결정해 전달**, BE는 저장만. ("디폴트 크기는 프론트가 넘기는 게 향후 개발 편함") 템플릿은 좌표를 들고 옴.
- **항목 설명** = Zabbix description 우선 → 키 사전(FE 상수) → 항목명 폴백. 실데이터 description 잘 채워져 사전 보강은 거의 불필요.
- **차트화 허용** = value_type ∈ {0,3}(숫자형)만.
- **시계열 정합** = 시리즈별 타임스탬프 union으로 **공통 시각 눈금** 정렬(인덱스 기반 아님) + null 구간 `connectNulls`. ← 선이 안 그려지던 버그의 근본 해결.

## 함정 / 교훈 ⭐
- **react-grid-layout v2 `useContainerWidth`는 초기폭 1280px로 시작**. 탭으로 감싸 `destroyInactiveTabPane`(display:none→재마운트)하면 폭이 1280에 굳어 **그리드 우측에 여백**이 남음. → controlled 탭 + 탭 활성/위젯수 변동 시 `measureWidth()` 재측정으로 해결. (빈 여백폭이 1280 vs 실제폭 차이와 정확히 일치 → 원인 특정)
- **react-grid-layout 카드 배치는 `position:absolute` + `transform:translate(x,y)`**(cssTransforms). 첫 카드 `translate(8px,8px)`은 `margin[8,8]`의 바깥여백. 바깥만 없애려면 **`containerPadding:[0,0]`**(margin=카드사이는 유지).
- **ECharts(echarts-for-react) 캔버스가 카드를 넘침** = 마운트 시점 폭으로 캔버스 픽셀 고정 + resize가 한 박자 늦음 + overflow 클리핑 부재. → ReactECharts `style{w/h:100%}`+`opts{w/h:auto}`(컨테이너 종속) + 컨테이너 `overflow:hidden`.
- **AntD Tabs 하단 구분선 색 = 전역테마 `Tabs.colorBorderSecondary`**. 이 앱은 그 값이 `COLOR.100`(연파랑)이라 선이 파랗게 보임 → 해당 화면만 `ConfigProvider`로 회색 override. (ink bar(활성 밑줄)와 혼동 주의 — 그건 `inkBarColor`)
- **`syncTime`(동기화 시각)은 BE 전역 인터셉터가 모든 응답 envelope에 주입** — Nest `response.interceptor`, Spring `SyncTimeResponseAdvice` **양쪽 다 존재**. 즉 기본/커스텀 차트 어디서 가져와도 동일 = 페이지 공통값. → 최상단 1회 표시 + `useSyncUser`(목록과 동일) 수동 동기화 버튼. (카드별 `dataUpdatedAt`=클라 수신시각이라 "동기화 시간"과 의미 다름 → 제거)
- **axios 중복요청 자동취소**(`METHOD:URL` 키 AbortController)는 정상이지만, 인터셉터가 취소에러를 `reject`로 재전파하면 **`Uncaught CanceledError`** 콘솔 노이즈. → `isCancel`이면 `return new Promise(()=>{})`(영구 pending, 새 요청이 대체).
- **AntD Table 세로 스크롤은 `scroll.y`(px)** 필요 → 카드 가변높이에 맞추려면 `ResizeObserver`로 측정해 전달(헤더 고정 유지). 정렬: 표시값이 포맷문자열이면 행에 숨김 원본키(`_ts`) 넣고 그걸로 sorter.

## 상태 / 남은 것
- BE(Nest/Spring)·FE 전 단계 `tsc`/compile 통과. dashboard_widget dev DB 적용.
- ⚠️ **실 Zabbix 런타임 시각 검증 대기**: 위젯 생성/렌더·드래그리사이즈 저장·테이블 정렬·동기화 버튼 실데이터 확인.
- 후속(차순위): 단위 혼합 차트 **다중 Y축**, 집계형 위젯/전역 대시보드(보류).

## 링크
- 프로젝트 허브: [[moveseye]] · 온보딩 [[moveseye-overview]]
- BE 병행 기반: [[2026-06-10-spring-conversion]]
- Zabbix 데이터: [[zabbix-api-reference]](history.get float 빈결과 함정) · [[zabbix-agent-item-keys]]
