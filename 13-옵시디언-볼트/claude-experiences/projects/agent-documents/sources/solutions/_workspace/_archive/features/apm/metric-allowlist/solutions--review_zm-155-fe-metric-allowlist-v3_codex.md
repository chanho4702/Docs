## N1~N3 반영 판정

| N# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| N1 | 닫힘 | `src/__tests__/fixtures/apmCustomMetricContractSample.ts:60-65,94-103` — ACTIVE와 WARN을 모두 켜진 규칙으로 세어 `activeRules=2`, `seriesPerServiceMax=2` 및 파생 예산을 올바르게 계산한다. `src/pages/application-monitoring/collectors/apmCustomMetricDisplay.ts:129-141`의 등록 후 `activeRules + 1`도 새 ACTIVE 규칙 하나가 추가되는 BE 산식(`ApmCustomMetricRuleService.java:85-87,133-150`)과 일치한다. `src/__tests__/apmCustomMetricDisplay.test.ts:125-147`에서 픽스처와 +1 경로를 검증한다. |
| N2 | 닫힘 | `src/pages/application-monitoring/collectors/components/ApmTokenIssueDrawer.tsx:183-206,321-328` — 열림마다 dirty 상태를 초기화하고, 사용자 변경 후에는 늦은 응답의 prefill을 차단한다. `src/__tests__/ApmCollectorTokensTab.test.tsx:423-481`에서 응답이 먼저 온 정상 경로, 늦게 온 정상 경로, 추가→삭제→빈 목록 경로를 모두 다룬다. |
| N3 | 닫힘 | `src/pages/application-monitoring/services/customMetricSeries.ts:67-74,92-98,105-114` — `Math.ceil(createdAtMs / stepMs) * stepMs` 경계를 빈 사유와 부분 구간 각주가 함께 사용하며, 운영 UTC 기준 BE `ceilTo`(`ApmCustomMetricSeriesService.java:71-73,88-91`)와 일치한다. `src/__tests__/apmCustomMetricDisplay.test.ts:212-269`에 경계 정확·경계 사이 검증이 있다. |

- 새 결함 없음.

## 판정

승인

N1~N3 모두 계약 §2.1·§8·§9 및 현재 BE 구현과 정합하며 요구된 회귀 테스트도 갖췄다.  
정적 검토 범위에서 이번 반영으로 새로 생긴 결함을 발견하지 못했다.

확인하지 못한 것:

- 지시대로 빌드, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 브라우저에서의 실제 Ant Design 이벤트 동작과 FE-BE 통합 동작은 실행 검증하지 않았다.