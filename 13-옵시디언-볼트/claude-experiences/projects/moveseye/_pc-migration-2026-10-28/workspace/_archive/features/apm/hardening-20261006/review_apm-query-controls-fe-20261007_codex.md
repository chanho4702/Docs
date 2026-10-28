# 코덱스 검수 전문 1차 — APM 순위 9~10 FE (2026-10-07, gpt-5.6-sol high, 읽기 전용)

요청서: review_apm-query-controls-fe-20261007.md · 대상 FE 작업 트리(기준 dfb0442)

## 요약

판정: **보완 후 재검수 필요**

- 🔴 1건
- 🟡 3건
- 🟢 0건

BE 파라미터 계약, export `env` 검증, `planToken` 전달, 외부 호출 `(serviceUid,target)` 처리는 대체로 정확합니다. 다만 수동 갱신 적용 누락과 env 상태 경계에 계약 위반이 남았습니다.

### 1. 🔴 수동 갱신 전환이 3개 화면에서 누락됨

- 심각도: 🔴
- 위치:
  - [ApmOverviewPage.tsx:240](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/ApmOverviewPage.tsx:240>)
  - [ApmServiceListPage.tsx:353](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceListPage.tsx:353>)
  - [ApmServiceMapPage.tsx:152](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:152>)
  - 계약은 활성 목록·차트·옵션·열린 상세 갱신을 요구합니다: [contract:49](</C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:49>), 계획의 최소 키 집합은 [planning:93](</C:/solutions/_workspace/features/apm/hardening-20261006/apm-query-controls-20261006.md:93>)부터 명시돼 있습니다.
- 반례: 자동 갱신 OFF·상대 1시간 창에서 2분 대기 후 ↻를 누르면 세 화면은 `query.refetch()`만 호출합니다. [useApmRefresh.ts:15](</C:/solutions/moveseyee_fe/src/hooks/useApmRefresh.ts:15>)의 시간창 전진이 실행되지 않아 과거 `from/to`를 다시 조회합니다. 서비스 맵에서는 열린 `EDGE_SERIES`도 갱신되지 않습니다([ApmEdgeDetailPanel.tsx:62](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/components/ApmEdgeDetailPanel.tsx:62>)).
- 권고:
  - 개요: `OVERVIEW`, `SERVICES`
  - 서비스 목록: `SERVICES` — 툴바와 onboarding 버튼이 같은 handler 사용
  - 서비스 맵: `SERVICES`, `SERVICE_MAP`, `EDGE_SERIES`
  - 모두 `useApmRefresh`로 전환하십시오.

### 2. 🟡 서비스 맵의 env 변경이 서비스·엣지 선택을 지우지 않음

- 심각도: 🟡
- 위치: 선택 상태는 [ApmServiceMapPage.tsx:52](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:52>)에 있으나 툴바에는 `envResetKeys`가 없습니다([ApmServiceMapPage.tsx:140](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:140>)). 계약은 한 번의 URL 갱신을 요구합니다([contract:46](</C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:46>)).
- 반례: `env=prod&mapService=prodSvc&mapEdge=...`에서 stage로 변경하면 prod 서비스가 남아 `env=stage&service=prodSvc` 교집합이 됩니다([ApmServiceMapPage.tsx:57](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/service-map/ApmServiceMapPage.tsx:57>)). 맵은 빈 화면이 되고 URL에는 유효하지 않은 엣지도 남습니다.
- 권고: `envResetKeys={[APM_MAP_PARAM.SERVICE, APM_MAP_PARAM.EDGE]}`를 전달해 env와 함께 원자적으로 제거하십시오.

### 3. 🟡 FE env 정규화가 BE 정본과 달라 query key가 서로 다른 요청을 합칠 수 있음

- 심각도: 🟡
- 위치:
  - FE는 `trim().toLowerCase()`만 수행합니다: [apm.ts:841](</C:/solutions/moveseyee_fe/src/constants/apm.ts:841>)
  - BE는 `trim → NFC → Locale.ROOT lowercase → 128자 절단`입니다: [ApmNaming.java:51](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/registry/auto/ApmNaming.java:51>), [ApmNaming.java:38](</C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/registry/auto/ApmNaming.java:38>)
  - 계약도 BE 정규화를 정본으로 지정합니다: [contract:11](</C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:11>)
- 반례: JS `trim()`은 앞의 `U+2003 EM SPACE`를 제거하지만 Java `String.trim()`은 제거하지 않습니다. 따라서 `"prod"`와 `"\u2003prod"`는 FE query key에서는 같지만 BE에서는 서로 다른 환경입니다. 같은 화면에서 URL만 전환하면 이전 환경의 캐시가 재사용될 수 있습니다. 이 helper를 쓰는 export `env` 대조([apmExport.ts:105](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/apmExport.ts:105>))에도 같은 맹점이 있습니다.
- 권고: 가장 안전한 최소 수정은 query key에 요청 원문을 넣는 것입니다. 정규화 키를 유지하려면 BE의 NFC·Java trim·128 UTF-16 절단을 정확히 복제하고 Unicode 경계 테스트를 추가해야 합니다.

### 4. 🟡 고정 서비스 상세로 env가 유입되어 숨은 필터로 남음

- 심각도: 🟡
- 위치:
  - 상세 페이지가 URL env를 읽고([ApmServiceDetailPage.tsx:54](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceDetailPage.tsx:54>)) 서비스 옵션 요청에 전달합니다([ApmServiceDetailPage.tsx:105](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceDetailPage.tsx:105>)).
  - 서비스 전환도 전체 query string을 보존합니다([ApmServiceDetailPage.tsx:140](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceDetailPage.tsx:140>)).
  - 서비스 목록이 전체 query를 상세 링크로 전달합니다([ApmServiceListPage.tsx:130](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceListPage.tsx:130>), [ApmServiceListPage.tsx:186](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/services/ApmServiceListPage.tsx:186>)). 개요 링크도 같은 문제가 있습니다([ApmTopServicesCard.tsx:140](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/overview/components/ApmTopServicesCard.tsx:140>)).
- 반례: `services?env=prod`에서 상세로 들어가면 env 셀렉터는 보이지 않지만 `/services/overview`는 계속 prod로 제한됩니다. 서비스 전환 옵션도 prod 서비스만 남습니다. 계약의 “고정 service가 정본이며 전역 env를 상속하지 않는다”와 어긋납니다([contract:22](</C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:22>)).
- 권고: 상세 링크 생성 시 `env`를 제거하고, 상세의 서비스 옵션 조회는 `{from,to}`만 사용하십시오. `handleServiceChange`도 정리된 query string만 보존해야 합니다.

## 중점 확인 요청별 판정

- BE↔FE 계약 정합: **부분 적합** — `service`·`env` 명칭과 그룹 상세/series, export `env`·`planToken`은 일치하나 정규화와 고정 상세 env 유입은 부적합입니다.
- `setEnv(next, resetKeys)`: **구현 자체는 적합** — [useApmTimeRange.ts:157](</C:/solutions/moveseyee_fe/src/hooks/useApmTimeRange.ts:157>)에서 한 번의 `updateParams`; 실제 호출자는 툴바 하나뿐입니다. 다만 서비스 맵의 `envResetKeys`가 누락됐습니다.
- 외부 호출 선택: **적합** — 선택 서비스와 target을 한 번에 저장하고([ApmDependencyExplorer.tsx:109](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/dependencies/components/ApmDependencyExplorer.tsx:109>)), series는 선택 서비스 하나만 호출합니다([ApmDependencyExplorer.tsx:95](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/dependencies/components/ApmDependencyExplorer.tsx:95>)). null UID·옛 링크도 합산으로 대체하지 않습니다.
- `useApmRefresh` 키: **부적합** — 오류·DB·외부 호출·서비스 상세의 추가 키는 맞지만 개요·서비스 목록·서비스 맵 전환이 빠졌습니다.
- query key env 정규화: **부적합** — ASCII 공백·대소문자에는 맞지만 BE 정본과 완전히 같지 않아 캐시 alias 가능성이 있습니다.
- 고정 서비스 탭 env: **부분 적합** — Explorer API 요청에서는 env를 제거하지만, 상세 컨테이너의 옵션 요청·URL에는 남습니다.
- 계획 응답 env·토큰: **적합(정규화 결함 제외)** — env 요청 시 missing/null/different를 차단하고([ApmExportModal.tsx:157](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:157>)), 계획과 동일한 params에 토큰만 더합니다([ApmExportModal.tsx:229](</C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:229>).

## 테스트가 못 잡는 케이스

- 신규 배선 테스트는 네 페이지만 열거하고([apmAggPagesWiring.test.tsx:101](</C:/solutions/moveseyee_fe/src/__tests__/apmAggPagesWiring.test.tsx:101>)) `useApmRefresh` 자체를 mock합니다([apmAggPagesWiring.test.tsx:48](</C:/solutions/moveseyee_fe/src/__tests__/apmAggPagesWiring.test.tsx:48>)). 개요·서비스 목록·서비스 맵과 실제 시간창 전진을 검증하지 않습니다.
- query key 테스트는 `"prod"`와 `" PROD "`만 비교합니다([apmHooks.test.ts:183](</C:/solutions/moveseyee_fe/src/__tests__/apmHooks.test.ts:183>)). Unicode whitespace, NFC 조합형, 128자 경계가 없습니다.
- 고정 탭 테스트는 Explorer의 API 인자만 검사합니다([apmAggScreens.test.tsx:343](</C:/solutions/moveseyee_fe/src/__tests__/apmAggScreens.test.tsx:343>)). 실제 상세 URL과 `/services/overview` 옵션 요청의 env 잔류는 잡지 못합니다.
- 실제 QueryClient·MemoryRouter·브라우저에서 env 전환, 상대 시간 전진, 열린 edge/group 동시 갱신은 검증되지 않았습니다.

## 반영 불필요 항목

- env를 요청하지 않았을 때 BE JSON에서 `env:null`이 생략되는 것은 문제없습니다. FE는 env를 요청한 경우에만 검증하며, 요청했는데 키가 없으면 올바르게 차단합니다.
- `planTokenExpiresAtMs`를 클라이언트 시계로 선판정하지 않는 현재 방식은 유지해야 합니다.
- null UID 외부 호출 행과 target-only 옛 링크의 “선택 없음” 처리는 계약과 일치합니다.
- `all_services_env` i18n key 이름은 내부 식별자이므로 변경할 필요가 없습니다.
- `git diff --check`는 통과해 CRLF/공백 오류는 확인되지 않았습니다.

파일은 변경하지 않았습니다.
