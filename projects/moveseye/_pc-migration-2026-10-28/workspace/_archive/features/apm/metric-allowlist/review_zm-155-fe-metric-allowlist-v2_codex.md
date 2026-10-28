## R1~R5 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 닫힘 | `src/locales/kr.json:1402,1726-1728,1816`, `src/locales/en.json:1402,1726-1728,1816` — kind가 서비스×지표별 첫 수신으로 고정되고, 동일 서비스의 다른 kind는 폐기되며, 서비스 간 종류 차이는 `MIXED`/“서비스마다 다름”으로 표시된다고 안내한다. |
| R2 | 닫힘 | `src/types/apm.ts:1495-1523`, `src/__tests__/fixtures/apmCustomMetricContractSample.ts:29-75` — 현재 BE `ApmCustomMetricRuleDto.java:13-37`의 전 필드와 일치하며 `valueKind: "MIXED"` 및 `seatServices`도 포함한다. 단, 같은 픽스처의 예산 의미 오류는 N1로 별도 지적한다. |
| R3 | 닫힘 | `src/pages/application-monitoring/services/customMetricSeries.ts:119-129`, `src/__tests__/ApmServiceCustomMetricsTab.test.tsx:175-190` — overflow의 `yAxis.show`, 축 라벨·눈금·분할선을 숨기며 렌더 테스트가 실제 옵션을 단언한다. |
| R4 | 닫힘 | `src/pages/application-monitoring/services/customMetricSeries.ts:131-134`, `src/__tests__/ApmServiceCustomMetricsTab.test.tsx:146-163` — `avg` 축에서 `min: 0`을 제거하고 `scale: true`를 적용한다. 음수 GAUGE 픽스처와 COUNTER의 0축 유지도 검증한다. |
| R5 | 닫힘 | `src/hooks/useApmCustomMetrics.ts:35-40`, `src/__tests__/apmCustomMetricHooks.test.tsx:45-52,98-137` — 실제 `QueryClient.invalidateQueries`를 감시해 등록·enable·disable·clear-warning·삭제마다 5개 query-key prefix를 정확히 단언한다. |

## F1~F5 회신 반영

- F1 — 반영: 새 폐기 사유는 `CUSTOM_SERIES_OVERFLOW`, `CUSTOM_KIND_UNSUPPORTED` 두 종만 추가됐다(`src/types/apm.ts:1398-1414`). 규칙 관리 권한도 `useApmPermissions().canEdit`을 사용한다(`src/pages/application-monitoring/collectors/ApmCollectorsPage.tsx:42-49`).
- F2 — 부분: 운영 코드는 서버의 `activeRules`에 1만 더한다(`src/pages/application-monitoring/collectors/apmCustomMetricDisplay.ts:132-143`). 그러나 계약 픽스처가 WARN 포함 정의를 위반한다(N1).
- F3 — 반영: `regenerationRequired` 상단 배너와 서버 `notices` 목록을 모두 유지한다(`src/pages/application-monitoring/collectors/tabs/ApmCollectorInstallTab.tsx:414-439,510`).
- F4 — 부분: `filterMetricsExtra`를 `processors.filterMetrics.extra`로 싣고 접힌 패널도 마운트한다. 다만 늦은 응답이 사용자가 비워 둔 목록을 덮을 수 있다(N2).
- F5 — 반영: `seatServices` 타입·표시·테스트와 `maxSeriesPerService` 안내가 추가됐다(`src/types/apm.ts:1507-1512`, `src/pages/application-monitoring/collectors/tabs/ApmCollectorCustomMetricsTab.tsx:189-205`, `src/__tests__/ApmCollectorsPage.test.tsx:1004-1009`).

- N1 · 필수 · `src/__tests__/fixtures/apmCustomMetricContractSample.ts:29-75,90-99` · 계약 픽스처의 `activeRules`가 WARN 포함 정의와 모순된다 · 픽스처에는 `enabled:true`인 ACTIVE와 WARN 규칙이 각각 하나씩 있지만 `activeRules`와 `seriesPerServiceMax`는 1이다. 현재 BE는 `isEnabled`를 세므로 둘 다 포함한다(`ApmCustomMetricRuleService.java:85-87`) · `activeRules=2`로 바꾸고 모든 파생 예산값과 `apmCustomMetricDisplay.test.ts:125-132`의 등록 후 기대값을 3개 기준으로 재계산한다.
- N2 · 필수 · `src/pages/application-monitoring/collectors/components/ApmTokenIssueDrawer.tsx:181-199` · 늦게 도착한 `filterMetricsExtra`가 사용자가 손댄 뒤 빈 목록을 덮는다 · 현재 보호 조건은 `current.length > 0`뿐이어서, 응답 전에 행을 추가했다가 모두 삭제한 경우 빈 배열을 사용자 의도로 구분하지 못한다. 이는 계약 F4의 “사용자가 행을 손댔으면 덮지 않는다”와 다르다 · Form.List의 touched 상태나 별도 사용자 편집 ref를 확인하고, 지연 응답 전 add/remove 후 빈 목록이 유지되는 테스트를 추가한다.
- N3 · 필수 · `src/pages/application-monitoring/services/customMetricSeries.ts:78-82,88-95` · 등록 직후 빈 구간 경계를 BE의 ceil 버킷이 아니라 무조건 `createdAt + step`으로 계산한다 · BE는 경계에 정확히 등록되면 그 버킷부터 허용하고, 경계 사이에 등록됐을 때만 다음 경계로 올린다(`ApmCustomMetricSeriesService.java:70-91,141-142`). 현재 테스트도 경계에 맞춘 생성 시각을 1시간 동안 등록 전으로 오판한다(`apmCustomMetricDisplay.test.ts:202-210`) · `ceil(createdAt / stepMs) * stepMs` 공통 경계를 계산해 빈 사유와 부분 구간 각주 판정에서 함께 사용한다.

## 판정

수정 후 재검수

F4의 늦은 응답이 사용자 설정을 덮을 수 있어 명시된 회신 조건을 충족하지 못한다.  
등록 시각 버킷 판정과 WARN 포함 예산 픽스처도 현재 BE 동작을 잘못 고정한다.

확인하지 못한 것:

- 지시대로 빌드, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 보고서의 395개 테스트 통과 결과를 독립적으로 재현하지 않았다.
- 브라우저 렌더링과 실제 BE 연동은 확인하지 않았다.