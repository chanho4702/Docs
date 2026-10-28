# ZM-154 FE 3차 재검수 결과

**종합 판정: 수정 후 재검수**

**차단 항목: R6** — `React.StrictMode`의 effect 재실행으로 `closedRef`가 최초 마운트부터 `true`가 되어, 개발 환경에서는 정상 다운로드 파일까지 전부 버립니다.

## 발견 사항

- R6 · 필수 · [ApmExportModal.tsx:120](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A120) · `closedRef`가 `React.StrictMode` 최초 마운트 과정에서 영구적으로 `true`가 됩니다. · 앱은 [main.tsx:29](file:///C:/solutions/moveseyee_fe/src/main.tsx%3A29)에서 `React.StrictMode`로 실행됩니다. 개발 모드에서는 effect가 `setup → cleanup → setup`으로 점검되는데, cleanup만 `closedRef.current = true`로 설정하고 다음 setup에서 `false`로 복원하지 않습니다. 따라서 [ApmExportModal.tsx:139](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A139)가 정상 응답도 닫힌 모달의 응답으로 판단해 `saveAs`를 실행하지 않습니다. 테스트 helper도 [ApmExportButton.test.tsx:70](file:///C:/solutions/moveseyee_fe/src/__tests__/ApmExportButton.test.tsx%3A70)처럼 `StrictMode` 없이 렌더링하므로 요청서에 기록된 11건 통과로는 이 회귀를 발견할 수 없습니다. · effect setup에서 먼저 `closedRef.current = false`로 초기화한 뒤 cleanup에서 `true`로 바꾸고, `StrictMode`로 감싼 정상 다운로드 테스트를 추가하십시오.

- R2 · 참고 · [ApmExportModal.tsx:137](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A137) · 2차 R2의 첫 항목인 `plan.stepSeconds` 재전송에 따른 메타 불일치는 닫혔습니다. · 다운로드가 계획 조회와 동일한 원래 `params`를 사용하므로 `requestedStepSeconds`와 `stepEscalated`의 의미를 FE가 바꾸지 않습니다. [ApmExportButton.test.tsx:122](file:///C:/solutions/moveseyee_fe/src/__tests__/ApmExportButton.test.tsx%3A122)도 같은 요청값 사용을 고정합니다. · 현재 구현을 유지하십시오.

- R2 · 참고 · [ApmExportButton.tsx:53](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportButton.tsx%3A53) · 미래 `to` 절단만으로 모든 경우의 “계획↔파일 실제 창 동일”이 보장되지는 않습니다. · 정상적으로 동기화된 시계에서는 버튼 시각이 두 BE 요청보다 과거가 되므로 [ApmExportRequest.java:59](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java%3A59)의 `min(to, nowMs)`가 더 이상 창을 바꾸지 않습니다. 그러나 클라이언트 시계가 서버보다 빠르면 여전히 두 요청이 각자의 `nowMs`로 절단될 수 있습니다. 더 중요하게는 [ApmResolution.java:100](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmResolution.java%3A100)과 [ApmResolution.java:173](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmResolution.java%3A173)이 매 요청의 `nowMs`로 7일·30일 보존 승격을 재계산합니다. 경계를 넘으면 M1→M5 또는 M5→H1로 바뀌고, [ApmRedSeriesExporter.java:85](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java%3A85)와 [ApmExportGrid.java:27](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportGrid.java%3A27)의 해상도별 `floor/ceil` 때문에 실제 `fromMs/toMs`·행 수·파일명이 달라집니다. · 완전한 보장은 BE plan token 또는 서버가 확정한 정규화 요청값을 다운로드에 전달하는 계약이 필요합니다. FE에서 값싸게 위험을 줄이려면 다운로드 직전 계획을 한 번 재조회하고 `fromMs/toMs/stepSeconds/filename/allowed`가 기존 계획과 달라졌으면 다운로드를 중단해 새 계획을 다시 확인하게 할 수 있습니다. 다만 이 방법도 재조회와 다운로드 사이의 경쟁 및 시계 오차까지 제거하지는 못하므로, 후속을 BE 범위로 남기는 판단은 타당합니다. 주석의 “FE가 막을 수 없다”는 “FE만으로 완전히 보장할 수 없다”로 표현하는 편이 정확합니다.

## 검증 범위

테스트는 요청대로 실행하지 않았습니다. 요청서에는 `ApmExportButton` 11건과 `apmExportApi` 9건, 총 20건 통과 및 ESLint·`tsc` 통과가 기록되어 있습니다. 이번 판정은 소스 검토 결과이며, 해당 테스트는 `StrictMode` 경로를 포함하지 않습니다.

- 1차 R1: **닫힘** — 세션 epoch 변경 후 파일 저장과 오류 상태 반영을 차단함.
- 1차 R2: **부분** — 미래 `to`의 일반적인 요청별 절단과 `stepSeconds` 재전송 문제는 닫힘. 시계 오차·보존 경계 재승격은 BE 계획 고정 없이는 잔존함.
- 1차 R3: **부분** — 닫힌 모달의 늦은 파일 저장은 차단했으나 요청 자체와 BE 실행 슬롯은 중단하지 않음.