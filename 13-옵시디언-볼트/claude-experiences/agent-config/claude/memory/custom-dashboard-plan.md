---
name: custom-dashboard-plan
description: "moveseye 커스텀 대시보드 기획/계약 진행 중 — 산출물 위치, 확정된 1차 범위와 설계 결정"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1e7209d5-c456-4b42-b787-ad45fdaa1f9b
---

moveseye에 **커스텀 대시보드**(위젯을 골라 배치하는 대시보드)를 신규 추가하는 작업이 2026-06-16 기획 단계 진행 중. 참고 구현은 `C:\CloudJira\moves-workforce\static\ui\src\pages\projectDetail\dashboard`(Forge 앱, react-grid-layout + dataType×chartType 위젯 모델).

**산출물(정본)**: `C:\solutions\_workspace\plan_custom-dashboard.md`(기획), `C:\solutions\_workspace\features\home\custom-dashboard\contract_custom-dashboard.md`(계약 초안). 세부는 이 두 파일이 단일 진실원천.

**확정된 1차(MVP) 범위·결정**:
- 소유 = **공유(전역 1벌)**, DB에 user_id 없음. 편집(추가/삭제/배치/리네임)은 **관리자 권한만**(Nest RolesGuard+@Roles / Spring @RolesGuarded+@Roles — 마커 누락 시 @Roles 무시 주의).
- 위젯 데이터 = **집계형 우선**(event_severity, event_trend, hostgroup_status, host_availability) + **custom_item**(사용자가 collected-info에서 임의 Zabbix 항목 골라 시계열화).
- 레이아웃 = **react-grid-layout**(신규 의존성), 12컬럼 드래그/리사이즈, edit모드 일괄 저장.
- 요약 KPI 패널 = **제외**(2차).
- custom_item 미결 3개 확정: ① 항목설명 = Zabbix description + **핵심 키 사전(FE constants)** 폴백, ② 위젯 데이터 = 신규 **`GET /host/{id}/items/history?itemids=&from=&to=`** 직호출(응답은 기존 `TMonitorChart[]` shape 호환 → FE 차트 파이프라인 재사용), ③ 다중 y축 = 2차.
- collected-info 확장: `items[]`에 **`description`**(BE: host.get selectItems에 'description' 추가) + **`chartable`**(valueType ∈ {0,3}) 추가.

**BE는 Nest+Spring 양쪽 병행 신설**([[be-dual-maintenance]] 규칙 적용 — 새 기능). dashboard_widget 테이블 1벌 공유.

**진행: 1번(데이터 기반) 양쪽 BE 구현 완료(2026-06-16).** ① collected-info(`/hosts/{id}/collected-info`)의 items[]에 `description`+`chartable`(value_type 0/3) 추가 — Nest host.service selectItems + DTO, Spring HostService + CollectedItem record. ② 신규 `GET /host/{id}/items/history?itemids=&from=&to=` — Nest `host/items/`(ItemsModule/Controller/Service+DTO), Spring `host/items/`(ItemsController/Service+DTO). 응답 시리즈 `{type,itemid,units,data}`, 숫자형만, 1h초과 trend폴백. 둘 다 컴파일 통과(Nest tsc / Spring compileJava). Zabbix 타입 확장: itemids 파라미터, item description 필드.

**진행: FE 수직 슬라이스 완료(2026-06-16).** 수집 정보 모달(`components/Modal/HostCollectedInfoModal.tsx`)에 ① 설명 컬럼(`constants/item-descriptions.ts`의 getItemDescription: description→key사전→name 폴백), ② 차트가능(chartable=숫자형) 항목만 체크 가능한 rowSelection, ③ 선택 시 하단 차트(`components/Chart/CustomItemChartPreview.tsx`, 최근1시간 고정, getItemsHistory→useHandelChartAction 공통 시각 눈금 재사용). api `getItemsHistory`, queryKey `CUSTOM_ITEM_CHART`, types TCollectedItem에 description/chartable, i18n(item_description/selected_items_chart). 타입체크·lint 통과. **미검증: 실 Zabbix 런타임(description 실태, 차트 정상).**

**🔄 방향 전환(2026-06-16) — 사용자 결정**: 신규 공유 대시보드 페이지/집계형 위젯 계획은 보류. 대신 **기존 `ServerMonitoringDetail`(호스트 상세 차트 페이지)에 host별 custom_item 커스텀 차트를 추가**하는 방향으로 확정.
- 위치: 기존 서버 모니터링 상세 페이지(신규 페이지 X).
- 저장: **호스트별**(dashboard_widget을 host_id 스코프, **공유**·user_id 없음). "등록"=DB 저장.
- 배치: **react-grid-layout** 포함(드래그/리사이즈 + 레이아웃 저장).
- 수집정보 모달은 **정보 표시 전용으로 복귀**(체크박스/차트 제거, 설명 컬럼+가로스크롤만). 항목→차트 선택은 상세페이지 "차트 추가" 모달로 이동.
- description 실데이터 잘 채워짐 → 키 사전 보강 불필요.
- 집계형 위젯(event/hostgroup)·공유 전역 대시보드는 폐기/후순위.

**진행: ① BE 데이터계층 완료(2026-06-16, 양쪽).** `dashboard_widget`(host_id 스코프, 공유) CRUD+layout. Nest `host/widgets/`(엔티티+마이그레이션 1781000000000+module/controller/service/dto), Spring `host/widgets/`(domain/DashboardWidget+WidgetConfig record jsonb, repo, service, controller, WidgetDtos, Flyway V2). 엔드포인트: GET/POST `/host/{id}/widgets`, PATCH `/host/{id}/widgets/layout`, PATCH/DELETE `/host/{id}/widgets/{widgetId}`. 편집=인증 사용자 누구나. chart_type varchar('line'/'area'), config jsonb {itemIds}. 둘 다 컴파일 통과. **DB 미적용(코드만)** — 적용은 사용자가 나중에.

**진행: ② FE 완료(2026-06-16).**
- (a) 연동: `types/dashboard-widget.ts`, `services/widget.api.ts`, `hooks/useWidgets.ts`(목록+create/update/delete/saveLayout mutation), queryKey `WIDGET_QUERY_KEY`. react-grid-layout 설치(`--legacy-peer-deps`, react19 peer 경고 무시).
- (b) UI: `pages/monitoring/server-monitoring/WidgetCard.tsx`, `AddChartModal.tsx`(collected-info 숫자형 항목 멀티select→위젯 생성), `ServerMonitoringDetail.tsx`에 react-grid-layout 그리드 영역 통합(편집모드 토글, 차트 추가 버튼, onDragStop/onResizeStop→saveLayout). `CustomItemChartPreview` height 100%로 조정해 위젯 카드 채움. i18n 7키 추가.
- ⚠️ react-grid-layout 배포 타입이 WidthProvider/Layout 미노출 → ServerMonitoringDetail에서 로컬 RglItem/RglComponent 타입 정의 + `(GridLayout as unknown as {WidthProvider}).WidthProvider(GridLayout)` 캐스팅으로 우회.
- 타입체크·lint 통과(양쪽 단계).

**DB 적용 완료(2026-06-16)**: dev DB(dmove)에 dashboard_widget 테이블 존재 확인(psql, 이미 생성돼 있었음 — Nest migrationsRun 자동 추정). 스키마가 엔티티/마이그레이션과 1:1 일치(chart_type default 'line', config jsonb, pos_x/y/width4/height6, host_id 인덱스). 접속: localhost:5432 dmove postgres/<dev-db-pw>.

**FE react-grid-layout = v2**(설치본): 사용자가 ServerMonitoringDetail을 v2 API로 수정 — `import { GridLayout, useContainerWidth, type Layout }`, `gridConfig`/`dragConfig`/`resizeConfig`, `containerRef`(ref 캐스팅), `useTranslation` 사용. (참고 moves-workforce DashboardPage와 동일 v2 패턴). 타입체크 통과.

**진행: ③ UI 폴리싱/버그픽스 완료(2026-06-17, 전부 순수 FE — BE 무변경).**
- **탭 분리**: `ServerMonitoringDetail`을 `Tabs`로 기본 차트 / 커스텀 차트 전환(호스트 박스=DetailLayout 하위). `destroyInactiveTabPane`(비활성 탭 언마운트 — RGL `useContainerWidth`가 display:none서 폭0 측정 방지). controlled `activeKey`+`useEffect`로 커스텀 탭 활성/위젯수 변동 시 `measureWidth()` 재측정 → **그리드 폭이 초기값 1280px에 굳어 우측 여백 남던 버그 해결**. 탭 하단 구분선이 전역테마 `Tabs.colorBorderSecondary:COLOR.100`(연파랑)이라 → 이 화면만 `ConfigProvider`로 `COLOR.borderColor`(회색) override.
- **기간 필터 이동**: `DetailLayout`에 `hideIndexTimeFilter` prop 추가(graph 단일차트면 무시·항상표시, index 대시보드만 숨김). routes의 **server monitoring detail에만** 전달. `RangeDatePicker`를 **베이직 탭 안**으로 이동(커스텀은 카드별 자체 기간필터라 불필요). network/ec2/graph 영향 없음.
- **기본 차트 캔버스 넘침**: `DmoveChart` ReactECharts에 `style{w/h:100%}`+`opts{w/h:auto}`(컨테이너 종속), `.content-chart`/`.print-container`에 `overflow:hidden`(클리핑 안전망).
- **레전드 스크롤**: `CustomItemChartPreview` 시계열 legend에 `type:"scroll"` override(`useHandelChartAction`은 공유라 안 건드림).
- **동기화 시간 = 전역 공통**: BE `response.interceptor`(Nest)/`SyncTimeResponseAdvice`(Spring) **양쪽**이 모든 응답 envelope에 Redis `SYNC_TIME_KEY` 주입 → 기본/커스텀 동등. → 최상단 우측에 공통 `SyncTime` 1회 + `useSyncUser`(목록과 동일: Zabbix 동기화 트리거+토스트+10분주기, onSuccess=collected-info refetch) **수동 동기화 버튼**. 카드별 `dataUpdatedAt` 오버레이는 제거.
- **그리드 바깥여백 제거**: `gridConfig.containerPadding:[0,0]`(margin=카드사이 유지, 바깥=0 → 기본차트와 정렬).
- **axios 취소에러 정리**: `axiosInstance` response 인터셉터 `isCancel`→`return new Promise(()=>{})`(영구pending)로 unhandled rejection 콘솔에러 제거.
- **커스텀 차트 테이블 보기**: 가로 `scroll.x:"max-content"`(time컬럼 fixed)+세로 `ResizeObserver`로 카드높이 측정→`scroll.y`(헤더고정). 컬럼 **정렬** sorter(시간=숨김`_ts`기준, 값=숫자·"-"는 -Infinity). `TABLE_HEADER_HEIGHT`/`numericValue` 상수화.
- 전 단계 `npx tsc --noEmit` 통과. **여전히 실 런타임 시각 검증은 사용자 확인 대기.**

**남은 것**: ⚠️ **실 런타임 미검증** — dev(BE Nest/Spring + FE) 기동 후 로그인하여 호스트 상세에서 ①수집정보 모달 설명/가로스크롤 ②차트 추가 모달(숫자형 항목)→위젯 생성 ③커스텀 차트 렌더 ④드래그/리사이즈 저장(onDragStop/onResizeStop→PATCH layout) 확인. 집계형 위젯·다중 y축·기간 필터는 후순위.

**Why:** 구현 착수 전 결정사항이 코드에 안 남아 있어 다음 세션 연속성 위해 기록. **How to apply:** 구현 재개 시 위 두 _workspace 문서를 먼저 읽고, fullstack-feature 파이프라인(계약→BE병행→api-contract-sync→FE→QA)으로 진행. 관련: [[moveseye-spring-conversion]].
