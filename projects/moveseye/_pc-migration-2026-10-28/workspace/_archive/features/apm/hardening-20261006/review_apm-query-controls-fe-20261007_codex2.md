# 코덱스 검수 전문 2차 — APM 순위 9~10 FE (2026-10-07, gpt-5.6-sol high, 읽기 전용)

## 요약

판정: **조건부 승인 — 핵심 수정은 반영됐으나 경계 결함 2건이 남았습니다.**

- 🔴 0건
- 🟡 1건
- 🟢 1건
- 기준 HEAD는 `dfb0442`이며, 수정 파일과 신규 `apmAggPagesWiring.test.tsx`까지 포함해 확인했습니다.
- 파일은 변경하지 않았습니다.

## 남은 결함

### 🟡 export env 대조가 특정 Unicode 값에서 fail-open 가능

- 위치: [constants/apm.ts:836](</C:/solutions/moveseyee_fe/src/constants/apm.ts:836>), [apmExport.ts:103](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/apmExport.ts:103>), [apmExport.ts:112](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/apmExport.ts:112>)
- 현재 `normalizeApmEnv`는 JS `trim().toLowerCase()`이고, 주석도 BE 정본과 Unicode 공백·NFC·128자 절단이 다르다고 인정합니다.
- 그런데 “차단 쪽으로만 틀린다”는 설명은 성립하지 않습니다.

반례:

- 요청 env: `"\u2003prod"`
- 계획 env: `"prod"`
- BE 정본에서는 U+2003을 보존하므로 서로 다른 값이지만, FE는 양쪽 모두 `"prod"`로 만들어 `apmExportEnvUnsupported()`가 `false`를 반환합니다. 즉 계약상 불일치인데 다운로드를 허용할 수 있습니다.
- 현재 테스트는 missing/null/일반 문자열 불일치만 확인합니다: [ApmExportButton.test.tsx:829](</C:/solutions/moveseyee_fe/src/__tests__/ApmExportButton.test.tsx:829>).

권고: BE의 Java trim·NFC·`Locale.ROOT` lowercase·128 UTF-16 절단을 정확히 이식하거나, 최소한 U+2003 비대칭·NFC·128자 경계 테스트를 추가하십시오.

### 🟢 상세 내부 Top5 딥링크 한 곳이 `env`를 다시 복사

- 위치: [ApmServiceDetailPage.tsx:171](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceDetailPage.tsx:171>), [ApmServiceOverviewTab.tsx:104](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceOverviewTab.tsx:104>), [ApmServiceOverviewTab.tsx:108](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/detail/tabs/ApmServiceOverviewTab.tsx:108>)
- 상세 컨테이너가 원본 `searchParams`를 넘기고, Top5 endpoint 링크가 전체 query를 복사합니다.

반례:

`/services/svc?env=prod&preset=6h`을 직접 열고 느린 endpoint를 누르면 새 링크에도 `env=prod`가 남습니다. 상세 API는 env를 읽지 않으므로 데이터 오류는 없지만, “상세 URL에 env를 유입시키지 않는다”는 규칙에는 예외입니다.

권고: 상세 컨테이너에서 `search={apmServiceDetailSearch(searchParams)}`를 넘기거나 `endpointHref` 내부에서 helper를 적용하십시오.

## 1차 항목별 닫힘 여부

1. 🔴1 수동 갱신 — **닫힘**. 개요는 `OVERVIEW·SERVICES`([ApmOverviewPage.tsx:77](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/ApmOverviewPage.tsx:77>)), 목록은 `SERVICES`([ApmServiceListPage.tsx:54](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceListPage.tsx:54>)), 맵은 `SERVICES·SERVICE_MAP·EDGE_SERIES`([ApmServiceMapPage.tsx:35](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:35>))로 `useApmRefresh`를 사용합니다. 세 화면에 실행되는 옛 `query.refetch()`는 없습니다.

2. 🟡2 맵 `envResetKeys` — **닫힘**. `mapService·mapEdge`가 함께 초기화됩니다: [ApmServiceMapPage.tsx:45](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:45>), [ApmServiceMapPage.tsx:160](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:160>).

3. 🟡3 쿼리 키 원문 — **부분 닫힘**. 지정된 8개 구성처는 모두 `params.env ?? null` 원문입니다: [useApm.ts:398](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:398>), [useApm.ts:537](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:537>), [useApm.ts:560](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:560>), [useApm.ts:572](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:572>), [useApm.ts:628](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:628>), [useApm.ts:685](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:685>), [useApm.ts:703](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:703>), [useApm.ts:724](</C:/solutions/moveseyee_fe/src/hooks/useApm.ts:724>). 다만 export 대조의 근사 정규화에는 위 🟡 반례가 남았습니다.

4. 🟡4 상세 env 유입 — **부분 닫힘**. 목록 표·카드, 서비스 전환, Top Services, Heatmap, Recent Alerts, LivePanel에는 helper가 적용됐습니다. `ApmActiveTab`도 helper 호출 대신 `tab`만 새로 만들어 env를 제외합니다: [ApmActiveTab.tsx:287](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/realtime/ApmActiveTab.tsx:287>). 다만 상세 내부 Top5 endpoint 링크 한 곳이 빠졌습니다.

## 반영 불필요 항목

- 상세 서비스 전환 옵션이 전 환경이 된 것은 **의도된 동작**입니다. 계약도 고정 service를 정본으로 규정합니다: [contract:22](</C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:22>). 옵션은 `표시명 (env)`로 구분됩니다: [ApmServiceDetailPage.tsx:107](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceDetailPage.tsx:107>). prod와 stage가 함께 나오는 테스트도 있습니다: [ApmServiceDetailPage.test.tsx:903](</C:/solutions/moveseyee_fe/src/__tests__/ApmServiceDetailPage.test.tsx:903>).
- query string을 붙이지 않는 알람·SLO·Synthetic·Jobs 등의 직접 상세 링크는 env를 전달하지 않으므로 helper 적용이 필요 없습니다.
- Collector/trace 상세의 재시도 `refetch()`와 export plan 모달의 `planQuery.refetch()`는 이번 세 화면의 수동 시간창 전진 문제와 무관합니다.
