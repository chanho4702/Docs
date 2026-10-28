# APM 전반 재평가 — 프론트엔드·조사 흐름·설치 경험

2026-10-06 · 읽기 전용 소스 감사 · FE `9dfcbe8`, BE `e55948c`

## 평가 범위와 결론

현재 `moveseyee_fe`의 APM 화면·조회 훅·API·라우팅을 읽고, 필요한 Spring Controller와 DTO를 대조했다. 10/01 UX 보고서는 이전 관찰로만 참고하고 해결 여부는 현재 코드로 다시 확인했다. **이번 감사에서는 브라우저 실행, 실제 API 요청, 부하시험, 신규 테스트를 수행하지 않았다.** 아래의 확정은 소스 경로와 계약의 확정이며 실제 운영 사고 발생을 뜻하지 않는다. 제품 소스·커밋·공유 서버는 변경하지 않았다.

**기능의 폭은 넓고 데이터의 한계를 정직하게 표시하려는 설계가 좋다. 다만 장애 조사에서 필터와 갱신 버튼을 믿을 수 없는 잔여 결함이 있고, 대규모 서비스 목록을 다루는 FE 조회 구조는 아직 소규모를 전제로 한다.** 화면 수나 테스트 수를 곧바로 완성도 점수로 바꾸기보다, 조사 결과의 정확성 → 부하 제어 → 조사 동선 → RUM 확장 순으로 개선하는 것이 맞다.

경로는 `C:/solutions/` 기준이다. P1은 이 감사에서 먼저 고칠 높은 우선순위, P2는 다음 개선 순서를 뜻한다. 보안 취약점의 심각도 표기가 아니다.

## 유지할 장점

1. **실패와 무관측을 구분한다.** `useDmoveQuery.ts:37`은 HTTP 200 업무 오류를 query error로 올리고 세션 변경 후 오래된 결과를 폐기한다. `shared/components/ApmQueryError.tsx:29`과 `shared/apmQueryState.ts:31`은 권한 거부를 정상 0건으로 삼키지 않는다. 서비스 목록은 `received`로 요청 없음과 수신 없음을 구분한다(`ApmServiceListPage.tsx:147`). 런타임도 미수신/수집 불가/미계측 사유를 나눈다(`ApmServiceRuntimeTab.tsx:88`).
2. **트레이스 조사 도구가 실질적으로 있다.** 목록·산점도·Trace ID 조회, waterfall·flame, span 속성·비동기 링크와 복귀 경로가 있다. 큰 waterfall은 가상 스크롤을 사용한다(`traces/waterfall/ApmTraceWaterfall.tsx:191`). flame 조회는 활성 탭에만 실행한다(`traces/ApmTraceDetailPage.tsx:103`). 없는 trace와 권한 거부도 다르게 안내한다.
3. **실시간 SSE에는 방어와 설명이 있다.** 재접속, retryable 제어, replay/snapshot 복구, 영구 거절 시 중단을 구현했다(`hooks/useApmLiveSpans.ts:75`, `:156`, `:183`). 대기열·연결 상한·중단은 별도 안내하고(`realtime/ApmLiveStreamNotice.tsx:57`), X-View는 표시/관측 건수·부분 범위·표본 축소를 표시한다(`realtime/ApmXViewTab.tsx:135`). 숨은 실시간 탭의 연결 유지 자체는 09/23 사용자 결정이므로 무조건 결함으로 분류하지 않았다.
4. **설치 경험은 단순 코드 한 줄 수준을 넘었다.** Linux/Windows/macOS와 Java/.NET/Node/Python/Go 조합, 경로 변경에 따른 서버의 명령 재생성, 수신 검증, 공식 문서 참조가 있다(`types/apm.ts:1530`, `collectors/tabs/ApmCollectorInstallTab.tsx:228`, `:581`). 실제 언어별 기능 범위는 다를 수 있어 설치 선택지 존재가 모든 지표의 동등 지원을 증명하지는 않는다.
5. **10/01 핵심 UX 수정은 일부 실제 반영됐다.** 트레이스의 수동 갱신은 목록+산점도 갱신으로 수정됐다(`traces/ApmTracesPage.tsx:27`). 오류 Top 5에서 0을 제외한다(`overview/components/ApmTopServicesCard.tsx:80`). 사용 가능한 서비스 탭만 노출한다(`services/ApmServiceDetailPage.tsx:250`). 합성 가용성은 선택 기간 라벨로 바뀌었다(`synthetics/ApmSyntheticDetailPage.tsx:344`). `ApmNavLink`는 메뉴 이동에 기간·환경을 유지한다(`utils/apmNavigation.ts:3`).

## 개선 우선순위

### F1 · P1 · 환경 필터가 실제 분석 데이터의 범위를 제한하지 않는다

- **종류:** 기능 결함. 보안의 tenant 격리 문제를 주장하는 것이 아니라 분석 범위 표시의 불일치다.
- **발동 조건:** 전역 트레이스/오류/DB/외부 호출 화면에서 서비스 미선택 상태로 `env=prod` 등을 선택한다. 기존 서비스 선택 후 다른 환경으로 바꾸는 경우에도 서비스 선택값을 따로 제거하지 않는다.
- **근거:** `moveseyee_fe/src/pages/application-monitoring/errors/ApmErrorsPage.tsx:22`·`:36`, `db/ApmDbCallsPage.tsx:20`·`:34`, `dependencies/ApmDependenciesPage.tsx:20`·`:34`는 env를 서비스 선택 옵션의 `/services/overview`에만 전달한다. 실제 조회는 `errors/components/ApmErrorExplorer.tsx:53`, `db/components/ApmDbExplorer.tsx:53`, `dependencies/components/ApmDependencyExplorer.tsx:62`이며 env가 없다. BE도 `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorController.java:73`, `trace/dbquery/ApmDbQueryController.java:68`, `trace/dependency/ApmDependencyController.java:63`에서 env를 받지 않는다. 서비스가 없으면 전 서비스가 대상이다.
- **트레이스도 같은 결함:** `traces/ApmTracesPage.tsx:26`·`:47`은 env를 옵션 조회에만 쓰며, `traces/useApmTraceFilters.ts:78`·`:90`의 실제 filters에 env가 없다. `hooks/useApm.ts:403`·`:422`의 목록/산점도 query와 BE `trace/query/ApmTraceController.java:89`·`:123`, `trace/query/ApmTraceQueryService.java:116`의 Filter에도 env가 없다. 트레이스의 **수동 갱신은 수정됐지만 환경 필터는 수정되지 않았다.**
- **사용자 영향:** prod를 보고 있다고 생각하면서 dev/staging 트레이스·오류·SQL을 포함한 결과를 판단할 수 있다. 필터가 선택지에만 작용한다는 설명도 없다.
- **현재 방어:** 특정 serviceUid를 선택하면 해당 서비스로 좁혀진다. 서비스 상세 탭은 fixedServiceUid를 사용한다. 이것으로 전역 환경 필터 결함이 해결되지는 않는다.
- **개선:** BE 집계·조회에 env 조건을 추가하고 FE query key/API/본문/CSV 내보내기까지 같은 범위를 사용한다. 구현 전에는 실제 적용하지 못하는 환경 필터를 해당 화면에서 노출하지 않거나 선택지 필터임을 명확히 분리한다. 환경 변경 때 선택 서비스가 새 범위에 속하는지도 검증한다.
- **완료 조건:** prod/dev의 같은 이름 서비스와 서로 다른 오류·SQL을 넣고, env 변경 시 목록·상세·시계열·내보내기의 모집단이 일치한다. 선택 서비스의 환경이 바뀌면 잘못된 조합을 자동 해제하거나 분명히 거절한다.
- **신뢰도:** 높음 — FE 표시 → hook 인자 → BE Controller까지 대조. 실제 브라우저 재현은 미실시.

### F2 · P1 · 수동 갱신의 대상과 상대 시간창 전진이 화면마다 다르다

- **종류:** 기능 결함. 과거 트레이스 갱신 결함이 전 APM에서 해결된 상태는 아니다.
- **발동 조건:** 자동 갱신 OFF 상태로 한동안 두었다가 `지금 새로고침`을 누른다.
- **근거:** `errors/ApmErrorsPage.tsx:47`, `db/ApmDbCallsPage.tsx:47`, `dependencies/ApmDependenciesPage.tsx:45`는 여전히 서비스 선택 옵션의 `listQuery.refetch()`만 실행한다. 실제 분석 query는 F1의 별도 Explorer에 있다. 개요(`overview/ApmOverviewPage.tsx:275`), 서비스 목록(`services/ApmServiceListPage.tsx:353`), 서비스 맵(`service-map/ApmServiceMapPage.tsx:152`)은 실제 query를 refetch하지만 상대 구간을 전진시키지 않는다. `hooks/useApmTimeRange.ts:97`은 OFF에서 interval을 만들지 않고, `:103`의 구간은 preset/tick/manualRefresh 등이 바뀔 때만 재계산된다.
- **사용자 영향:** 버튼을 눌러도 최신 오류·DB 호출이 반영되지 않거나, '최근 1시간'이 처음 연 시점의 고정 1시간으로 남는다. 관제 화면에서 정상 회복 여부를 잘못 판단할 수 있다.
- **현재 방어:** 트레이스와 서비스 상세는 `useApmRefresh`를 사용한다. 이 훅은 상대창을 전진시킨 뒤 활성 query만 갱신하고 중복 fetch를 피한다(`hooks/useApmRefresh.ts:13`). 자동 갱신을 켜면 별도의 tick으로 창이 전진한다.
- **개선:** 현재의 `useApmRefresh`를 전 분석 화면에 적용해 실제 활성 데이터 query를 빠짐없이 지정한다. 상세 drawer·시계열·분포도 포함하되 닫힌 탭은 호출하지 않는다. 고정 사용자 지정 창은 구간을 그대로 두고 재조회한다.
- **완료 조건:** 자동 갱신 OFF + 상대창에서 시간을 진행시킨 후 버튼 클릭 시 `to`가 현재로 이동하고 실제 데이터 endpoint가 호출된다. 고정창에서는 from/to를 보존한다. 오류/DB/외부 호출 목록과 열린 상세가 함께 갱신된다.
- **신뢰도:** 높음 — 이벤트 handler와 시간창 memo 의존 관계로 확인. 이번 감사의 런타임 재현은 없음.

### F3 · P1 · 서비스가 많아질수록 선택기 하나도 전체 성능 집계를 가져온다

- **종류:** 확장성 개선. 특정 규모에서 반드시 장애가 난다는 실측 결과는 없다.
- **발동 조건:** 서비스 수가 수백·수천으로 증가하고 여러 사용자가 상세·트레이스·오류 등 서비스 선택기가 있는 화면을 연다. 서비스 카드 보기에서는 DOM도 서비스 수만큼 커진다.
- **근거:** `services/ApmServiceDetailPage.tsx:99`는 uid/label 옵션을 만들기 위해 `/services/overview`를 요청한다. 전역 오류/DB/외부 호출도 같은 방식이다. BE `service/list/ApmServiceQueryService.java:179`는 findAll 후 후보 전체에 assembleRows를 수행한다. FE 목록은 클라이언트 정렬·필터를 명시한다(`services/ApmServiceListPage.tsx:58`, `:119`), 카드 뷰는 `services/components/ApmServiceCards.tsx:55`의 rows.map으로 모든 카드를 만든다.
- **사용자 영향:** 옵션 드롭다운 때문에 RED·spark를 계산·전송하고 브라우저가 전량 보관한다. 서비스 증가와 관제자 증가가 함께 BE/네트워크/브라우저 비용을 키운다.
- **현재 방어:** BE에 env/q/includeHidden 필터가 있고 일반 표는 클라이언트 pagination을 한다(`ApmServiceListPage.tsx:453`, `components/Table/DmoveTable.tsx:84`). **표의 현재 페이지 DOM이 제한된 것과 API/브라우저 데이터가 전량인 것은 다르다.** 오류·DB 목록의 서버 pagination, waterfall 가상화, 인스턴스 비교 개수 상한도 이미 있다.
- **개선:** 서비스 메타데이터 검색 endpoint와 성능 overview를 분리한다. 목록은 서버 정렬·필터·cursor/page, 카드 뷰는 가상화 또는 서버 페이징을 도입한다. 요약·facet은 목록 페이지와 별도 계약으로 유지한다.
- **완료 조건:** 1,000/10,000개 합성 서비스에서 드롭다운 조회가 RED/spark 집계를 실행하지 않고 응답/DOM/메모리가 화면 크기에 비례한다. BE 집계 비용·페이지 지연·브라우저 memory와 동시 사용자 수를 함께 측정한다. 목표 숫자는 제품의 지원 규모 결정 후 확정한다.
- **신뢰도:** 구조는 높음, 성능 영향의 크기는 미측정.

### F4 · P1 · 일반 조회는 떠난 화면의 요청을 취소하지 못하고 상대창 폴링의 제어가 분산돼 있다

- **종류:** 부하 제어의 공백. 데이터 누출이나 결과 뒤섞임을 주장하는 항목은 아니다.
- **발동 조건:** 느린 조회 중 기간·서비스·탭을 연속 변경하거나 상대창 자동 갱신 화면을 여러 탭에 열어 둔다.
- **근거:** `hooks/useDmoveQuery.ts:31`의 queryFn은 무인자이며 `:37`에서도 TanStack Query의 QueryFunctionContext/signal을 전달하지 않는다. APM hook(`hooks/useApm.ts:110`)과 API(`services/apm.api.ts:176`)도 일반 조회 signal을 받지 않는다. `services/axiosInstance.ts:132`는 method+전체 URL+params가 같은 요청의 중복은 취소하지만, from/to가 다른 이전 요청은 다른 키다. 상대 시간창 hook은 `useApmTimeRange.ts:99`에서 자체 interval을 실행하고 각 query는 다시 `refetchInterval`을 설정한다. 일반 시간창 interval에는 탭 visibility 조건이 없다.
- **사용자 영향:** 빠른 조건 변경 시 사용하지 않는 HTTP 요청이 지속될 수 있다. 상대창 키 변경은 query의 interval background 정책과 별개로 새 조회를 생성할 수 있다. 정확한 요청 배수·DB 절감 효과는 이 감사에서 측정하지 않았다.
- **현재 방어:** 계정 전환 epoch 검사, 동일 요청 중복 취소, HTTP timeout, 폴링 OFF, query key의 기간 구분이 있다. 내보내기 API는 이미 caller signal을 전달한다(`services/apm.api.ts:1023`). 실시간 SSE의 숨은 탭 유지 정책은 사용자 결정이므로 일반 조회와 나누어 다뤄야 한다.
- **개선:** QueryFunctionContext.signal → useDmoveQuery → APM API → axios를 연결하고, 공통 시간 context에서 상대창 tick·조회 스케줄을 하나로 관리한다. 일반 대시보드의 숨은 탭/오프라인 정책과 관제실의 계속 수신 정책을 구분한다. HTTP 취소가 DB query 중단까지 보장한다고 가정하지 말고 BE deadline과 연계한다.
- **완료 조건:** 느린 API를 모사해 조건 변경·unmount 때 이전 요청의 AbortSignal이 발생하는지 검증한다. 화면당 한 갱신 주기에 필요한 query만 한 번씩 실행되는지 요청 계수로 확인한다. 숨은 일반 탭의 요청 감소와 관제실 SSE 지속을 각각 시험한다.
- **신뢰도:** signal 미전달은 높음. background/중복 부하의 실제 배수는 추정이며 런타임 검증 필요.

### F5 · P2 · 외부 호출 목록의 행 식별자와 상세 시계열의 범위가 다르다

- **종류:** 조사 범위·선택 상태의 불일치. BE의 전 서비스 합산 자체는 명시된 정상 기능이다.
- **발동 조건:** 서비스 필터 없이 서비스 A·B가 같은 외부 target을 호출하는 목록에서 B 행을 클릭한다.
- **근거:** 행 키는 serviceUid+target이다(`shared/apmAggDisplay.ts:68`). 그러나 클릭은 target만 저장한다(`dependencies/components/ApmDependencyExplorer.tsx:194`). series는 현재 service 필터(null)+target으로 조회하고(`:64`), selectedRow는 target만으로 첫 행을 찾는다(`:70`). BE `trace/dependency/ApmDependencyController.java:74`는 service 미지정 시 전 서비스 합산이라고 명시한다. 따라서 B를 클릭해도 A+B 시계열을 보고 selectedRow의 mixedBounds는 첫 행(A)의 값으로 보완될 수 있다.
- **사용자 영향:** 선택 행의 서비스별 수치와 아래 차트가 다른 모집단이 된다. 기본 제목·도움말은 '선택한 외부 대상'이라고만 하여 합산 여부가 충분히 드러나지 않는다.
- **현재 방어:** 특정 서비스 필터를 먼저 선택하거나 서비스 상세에서 열면 해당 서비스 범위이므로 문제가 좁아진다. BE 시계열 자체의 mixedBounds도 사용한다.
- **개선:** 선택 상태를 serviceUid+target으로 보존하고 서비스별 추이로 연결한다. 전 서비스 합산을 유지하려면 별도 '전체 호출 서비스 합산' 선택을 제공하고 제목·선택 강조·metadata 판정을 그 집계 범위와 맞춘다.
- **완료 조건:** 같은 target을 호출하는 두 서비스의 지연·오류가 다를 때 각 행 클릭 결과가 명시한 모집단과 일치한다. 혼재 경고는 다른 행의 metadata를 빌리지 않는다.
- **신뢰도:** 동작 경로 높음. 의도된 제품 동선의 최종 선택은 설계 판단 사항이며 실제 사용자 오인은 미검증.

### F6 · P2 · 트레이스로 들어갈 때 조사 맥락이 일부 경로에서 끊긴다

- **종류:** 조사 UX의 미완성. trace detail 조회가 잘못되거나 trace를 못 찾는다는 주장은 아니다.
- **발동 조건:** 과거 custom 기간/환경을 선택한 오류·DB·트레이스 목록 또는 exemplar에서 trace detail에 들어간 뒤 다른 APM 분석 메뉴로 이동하거나 링크를 공유한다.
- **근거:** `errors/components/ApmErrorGroupPanel.tsx:143`, `db/components/ApmDbQueryPanel.tsx:162`, `traces/components/ApmTraceTable.tsx:161`, `services/components/ApmExemplarStrip.tsx:116`은 traceId 경로만 만들고 기간·환경·원래 조사 경로를 넘기지 않는다. 메뉴의 context 보존은 **현재 URL**에서 읽는다(`utils/apmNavigation.ts:16`). trace 상세는 ID로 조회하므로 trace 자체는 열린다(`traces/ApmTraceDetailPage.tsx:100`). RUM→trace는 명시 custom 기간을 전달하는 다른 구현이다(`rum/ApmRumPageDetail.tsx:197`).
- **사용자 영향:** 브라우저 뒤로가기는 원래 URL을 복원할 수 있지만 trace detail에서 다른 메뉴로 연속 조사하면 선택 기간·환경이 기본으로 돌아간다. 공유 링크에도 조사 출발점이 없다.
- **현재 방어:** APM 사이드바 메뉴 간 공통 기간·환경 보존, 서비스 목록→상세 보존, trace 비동기 링크의 복귀 경로가 있다. 전 경로 미지원은 아니다.
- **개선:** 공통 trace navigation helper로 기간·환경·선택 span·안전한 returnTo를 일관되게 전달한다. 기존 async trace 전용 복귀 맥락과 섞이지 않도록 규약을 정한다.
- **완료 조건:** 과거 장애창에서 오류/DB→trace→서비스 맵/트레이스 목록까지 이동해도 같은 시간·환경이 유지된다. 새 탭·공유 링크·뒤로가기에서도 현재 조사 위치를 설명할 수 있다.
- **신뢰도:** 높음 — 링크 생성과 context 읽기 경로 확인. 브라우저 종단 재현은 미실시.

### F7 · P2 · RUM은 집계 대시보드로는 유효하지만 여러 사이트의 성능 저하를 좁히는 기능은 부족하다

- **종류:** 기능 미지원/확장 과제. 이미 계약에 없는 값을 FE가 누락했다는 버그가 아니다.
- **발동 조건:** 여러 사이트·토큰을 함께 수집하거나 특정 페이지의 Web Vitals가 언제 나빠졌는지 조사한다.
- **근거:** BE `rum/ApmRumController.java:35`·`:55`·`:64`·`:73`의 전역 조회는 from/to와 breakdown by만 받는다. 사이트/토큰 필터가 없다. FE `rum/ApmRumPage.tsx:65`의 검색은 페이지 표만 제한하고 상단 분포는 전체 기준이라고 명시한다. `types/apmRum.ts:31`의 시계열 Point에는 pv/sessions만 있고 p75가 없다. BE `rum/page/RumQueryDto.java:32`도 동일하다. 상세의 p75 추이는 실제 chart 대신 미제공 안내다(`rum/ApmRumPageDetail.tsx:131`).
- **사용자 영향:** 페이지별 전체 기간 p75는 알 수 있지만 특정 시점의 악화·회복을 시계열로 추적할 수 없다. 여러 사이트의 전역 분포가 합쳐져 대표성을 판단하기 어렵다. 현재 sessions는 5분·페이지·차원별 distinct의 합으로 전체 기간의 고유 방문자/세션과 다르다(`types/apmRum.ts:6`).
- **현재 방어:** 전체/표 검색 범위를 안내하고, p75 추이가 없다고 명시하며, truncated·mixedBounds·rebucketed와 집계 세션 의미를 표시한다. 세션 열/범례는 `locales/kr.json:209`의 **'버킷 세션 합'**이고 `:236`은 **'전체 기간의 고유 세션 수가 아닙니다'**라고 명시한다. `rum/components/ApmRumTrafficCard.tsx:55`에서 이를 각주로 표시하므로 현재 FE를 고유 세션 오표기 버그로 분류하면 안 된다. RUM이 비어 있을 때는 단일 안내와 기간 확대·설치 진입을 제공한다. 미제공 값이나 고유 세션 수를 지어내지 않는다.
- **개선:** 사이트/토큰 범위 선택을 모든 RUM query에 적용한 뒤 페이지별 Web Vitals 추이를 추가한다. 페이지 이동·JS 오류·백엔드 trace의 연계 맥락도 같은 범위를 유지한다. 고유 세션이 제품 요구라면 보존·개인정보 정책을 포함한 별도 산정 계약부터 정한다.
- **완료 조건:** 두 사이트에서 같은 경로를 수집해도 사이트 선택에 따라 모든 카드·표·breakdown이 동일 모집단을 사용한다. 시간별 합성 Web Vitals 분포를 넣었을 때 악화 시점과 전체창 p75가 각각 올바르게 표시된다.
- **신뢰도:** 계약상 미지원은 높음. 실제 데이터가 채워진 화면의 UX·성능은 미검증.

## 부가 기능 성숙도와 평가 경계

| 영역 | 현재 판단 | 과장하지 말아야 할 부분 |
|---|---|---|
| 주요 메뉴·권한 | APM 라이선스 게이트와 apm.view, 관리 페이지 apm.edit 분리가 있다. RUM/SLO 진입점도 있다. | 메뉴가 숨겨졌다는 이유로 기능 미구현이라고 판단하면 안 된다. 오류·DB·외부 호출·메시징에는 별도 라우트/검색·하위 진입이 있다. |
| 런타임·설치 | 5개 runtime family의 슬롯별 카드, 3 OS × 5 stack 설치 가이드, 수신 확인이 있다. | 설치 명령 제공과 언어/버전/계측 조합의 실제 운영 검증은 별개다. 모든 언어의 모든 지표 동등 지원을 보증할 근거는 이번 범위에 없다. |
| 메시징·배치 | destinations/series, jobs/runs/timeline과 trace 연결, 계측 규약 설명이 구현돼 있다. `messaging/ApmMessagingPage.tsx:70`에서 두 절을 제공한다. | 큐 자체의 broker 관리 도구나 모든 프레임워크 자동 발견과 같은 수준으로 평가할 수 없다. 실데이터 채워진 E2E는 이번에 미검증이다. 수동 갱신 버튼도 해당 최상위 페이지에는 없다. |
| K8s | 인스턴스의 pod/node/namespace/deployment 정보를 보여 준다(`services/detail/tabs/ApmServiceInstancesTab.tsx:206`). | 이것은 APM 인스턴스와 K8s 메타데이터 연결이다. 전체 클러스터의 리소스·이벤트·배포 운영 제품의 완성도를 뜻하지 않는다. |
| RUM 초기 경험 | 빈 카드 반복은 줄었고 사이트 토큰·동의/설치 안내와 백엔드 trace 연결이 있다. | 미설치와 수집 중단을 일반 RUM 사용자에게 확정 판별하는 상태 계약은 제한적이다. 현재 빈 안내는 '기간 확대 또는 설정 확인' 수준이다. |
| 수신/보존 한계 표시 | 집계 지연, 보존 경계, 샘플 기준, histogram 혼재를 설명한다. | 설명이 존재해도 F1/F2 같은 조작-실제조회 불일치를 대신 해결하지는 않는다. |

추가로 10/06 새 `APM_QUERY_TOO_MANY_POINTS` 오류는 FE 공통 resolver의 전용 매핑이 없어 일반 오류 문구로 내려간다(`services/apiEnvelope.ts:38`, `:68`, `shared/components/ApmQueryError.tsx:40`). FE의 자동 step 선택으로 정상 UI에서 항상 발동하는 결함은 아니므로 상위 7건에는 넣지 않았다. 초과 시 기간 축소/해상도 변경을 안내하고 maxPoints/requestedPoints를 이용한 복구 UX를 후속으로 연결하는 것이 좋다.

## 권장 검증 순서

1. 서로 다른 환경에 같은 외부 target·페이지 경로를 갖는 작은 fixture로 **필터·선택·모집단**을 먼저 검증한다.
2. fake clock + 실제 QueryClient로 **수동 갱신·상대창 전진·query 종류**를 검증하고, 브라우저 network 로그로 확인한다.
3. 지연 응답·화면 이탈로 **AbortSignal·query 중복·숨은 일반 탭 정책**을 확인한다.
4. 서비스 수와 사용자 수를 늘려 **metadata 검색/overview API·카드 렌더·메모리**의 지원 규모를 측정한다.
5. 실제 RUM·메시징·K8s 데이터를 넣은 대표 장애 시나리오로 조사 종료까지 검증한다. 정적 구현 존재를 이 검증의 대체물로 삼지 않는다.

기존 10/01 보고서: [APM UX 평가](../../../apm-ux-review-20261001/review.md). 기존 기능·대규모 보완 보고서: [apm-scale-readiness.md](../../../../moveseye-docs/overview/apm-scale-readiness.md).
