- R1 · 필수 · src/locales/kr.json:1726 · 값 종류가 규칙 전체의 첫 수신 때 고정된다고 안내하지만 실제 BE는 서비스×지표별로 고정하며 서비스마다 다르면 `MIXED`를 반환한다 · BE 정본 `ApmCustomMetricRuleDto.java:22`는 `MIXED(서비스마다 다름)`을 명시하므로 현재 kr/en 도움말·등록 모달은 고객에게 잘못된 동작을 안내한다 · 관련 kr/en 문구를 “서비스별 첫 수신으로 고정되며 같은 서비스에서 다른 종류만 폐기되고, 서비스 간 종류가 다르면 혼합으로 표시”로 교체한다
- R2 · 권장 · src/types/apm.ts:1491 · 규칙 DTO 타입과 계약 픽스처가 BE 정본의 `valueKind:"MIXED"` 및 `seatServices` 필드를 누락했다 · BE `ApmCustomMetricRuleDto.java:22,28`에는 두 계약이 존재하지만 로컬 픽스처가 동일하게 누락되어 `typecheck:contract`가 표류를 탐지하지 못한다 · 규칙용 `valueKind`에 `MIXED`를 추가하고 `seatServices:number` 및 해당 픽스처·표시를 반영한다
- R3 · 권장 · src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:153 · `__other__`의 건수 막대는 구현했지만 요구된 값 축 숨김은 적용하지 않았다 · 모든 카드가 같은 `buildApmTimeSeriesOption`을 사용해 `MIXED` 카드에도 일반 `yAxis`가 그대로 노출되고 테스트도 계열 값만 단언한다 · overflow 옵션의 `yAxis.show`·축 라벨·눈금을 숨기고 이를 테스트에서 단언한다
- R4 · 권장 · src/pages/application-monitoring/services/detail/tabs/ApmServiceCustomMetricsTab.tsx:155 · 음수가 가능한 `GAUGE`·`UPDOWN`도 `yAxis.min=0`인 공용 차트 옵션을 사용해 음수 값이 차트에서 잘린다 · `buildApmTimeSeriesOption`의 축은 `src/lib/echarts/apmTimeSeries.ts:303`에서 최솟값을 0으로 고정하지만 커스텀 게이지와 UpDown에는 비음수 계약이 없다 · `avg` 계열은 데이터 최솟값을 허용하도록 축 범위를 조정하고 음수 픽스처로 검증한다
- R5 · 권장 · src/hooks/useApmCustomMetrics.ts:35 · 등록·변경·삭제 성공 시 다섯 쿼리를 무효화하는 핵심 동작을 실제 훅 테스트가 검증하지 않는다 · 화면 테스트는 `useApmCustomMetrics`를 전부 mock하므로 규칙 목록·폐기 표 무효화가 빠져도 통과한다 · 실제 `QueryClient`로 create/change/delete 성공 후 `CUSTOM_METRIC_RULES`, `INGEST_DROPS`, 설정 기본값, 설치 가이드, 서비스 시계열 무효화를 단언한다
- 등록 흐름의 권한·분기·확인 모달 · 이상 없음 — `apm.edit` 가드, `customRule` 기반 받기/기존 규칙/차단 분기, 잘림·예약·상한 문구, 직접 등록 경로 부재를 확인했다
- 규칙 목록 액션 · 이상 없음 — `ACTIVE|WARN|DISABLED`, WARN 저장 계속 안내, enable/disable/clear-warning/delete 확인 모달과 호출 경로를 확인했다
- 기존 힌트 교체 · 이상 없음 — 고객 노출 `NOT_ALLOWLISTED` 문구는 관리자에게 받기를 요청하도록 교체됐고, 제품 팀 요청 문구는 예약된 런타임 지표 안내에만 남아 있다
- 메뉴·라우트 · 이상 없음 — 별도 메뉴·검색·라우트 없이 관리 콘솔 수집기의 `?tab=custom_metrics`와 서비스 상세 탭에만 추가됐으며 기존 권한·APM 라이선스 게이트를 상속한다
- 설치 가이드·폐기 사유 번역 · 이상 없음 — `customMetrics.regenerationRequired` 안내와 폐기 사유 2종이 kr/en에 대칭으로 추가됐고 검수번호·§·HTML 고객 문구는 없다

## 판정

수정 후 재검수

BE 정본과 다른 값 종류 안내가 고객에게 실제 저장·폐기 동작을 잘못 설명하므로 필수 수정이 필요하다.  
DTO 표류와 서비스 차트 축 처리, 핵심 무효화 테스트도 함께 보완해야 한다.

확인하지 못한 것:

- 지시상 빌드·TypeScript 검사·Jest·npm 명령은 실행하지 않았다.
- 보고서에 적힌 385개 테스트 통과 결과는 독립적으로 재현하지 않았다.
- 브라우저 렌더링과 실제 BE 연동 흐름은 확인하지 못했다.