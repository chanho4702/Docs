# ZM-154 FE 재검수 결과

**종합 판정: 수정 후 재검수**

**차단 항목: R2** — 미래 `to`에 따른 격자 차이는 해소됐지만, 계획의 실제 `stepSeconds`를 다운로드의 요청값으로 덮어쓰면서 계획과 파일 메타가 달라지고, 보존 경계에서는 다운로드가 다시 승격되어 실제 창까지 달라질 수 있습니다.

## 발견 사항

- R2 · 필수 · [ApmExportModal.tsx:131](C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:131) · 계획의 실제 해상도를 다운로드의 요청 해상도로 바꿔 계획과 파일의 의미가 달라집니다. · 계획 요청이 `step=null`이면 BE 계획의 `requestedStepSeconds`는 `null`이지만, 다운로드는 `step=plan.stepSeconds`를 보내 파일의 JSONL `_meta.requestedStepSeconds`가 60/300/3600으로 바뀝니다. 사용자가 60초를 요청했지만 보존 때문에 300초로 승격된 경우에는 계획이 `requestedStepSeconds=60`, `stepEscalated=true`인데 파일은 `requestedStepSeconds=300`, `stepEscalated=false`가 됩니다. 이는 [ApmExportPlan.java:40](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportPlan.java:40), [ApmExportService.java:258](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:258), [ApmExportService.java:274](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:274)에서 확인됩니다. · FE만 고친다면 버튼의 `to` clamp는 유지하되 다운로드에는 계획 조회와 동일한 원래 `params`를 보내는 것이 최소 수정입니다. 계획값 재사용을 계약으로 보장하려면 BE의 plan token 또는 요청값과 확정 해상도를 분리하는 계약이 필요합니다.

- R2 · 필수 · [ApmExportModal.tsx:133](C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:133) · 계획값을 다시 보내도 모든 경계에서 멱등하지는 않습니다. · 미래 `toMs` 자체는 안전합니다. BE가 [ApmExportRequest.java:59](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java:59)에서 다시 현재 시각으로 잘라도, 같은 격자 안이면 [ApmRedSeriesExporter.java:85](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:85)의 ceil이 계획의 미래 경계로 돌아가고, 경계를 지난 뒤에는 이미 정렬된 `toMs`가 그대로 유지됩니다. 실측 결과와 일치합니다. 하지만 `ApmResolution.choose`는 매 요청의 새 `nowMs`로 보존 승격을 다시 계산합니다([ApmResolution.java:100](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmResolution.java:100), [ApmResolution.java:173](C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmResolution.java:173)). 예를 들어 7일 보존 경계 바로 안쪽에서 M1 계획을 만들면, 계획이 내림한 `fromMs`가 다음 다운로드에서는 보존 밖으로 판정되어 M5로 재승격될 수 있습니다. 그러면 `toMs`가 5분 경계로 다시 올라가 행 수·헤더·파일 내용과 FE가 사용하는 계획 파일명이 달라집니다. · 최소한 7일·30일 보존 경계 직전/직후 회귀 테스트를 추가하고, 계획과 다운로드에 동일 요청을 사용하는 방식으로 되돌리거나 서버에서 계획을 고정해야 합니다.

- R1 · 참고 · [ApmExportModal.tsx:137](C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:137) · 세션 전환 누수는 발견되지 않았습니다. · 성공 응답은 저장 전에, 오류 응답은 `setDownloadError` 전에 epoch를 재검사합니다. `finally`는 닫힌 모달에는 상태를 갱신하지 않습니다. 세션 전환은 [sessionEpoch.ts:38](C:/solutions/moveseyee_fe/src/utils/sessionEpoch.ts:38)에서 listener를 동기 호출하고, APM 화면을 감싼 [PageWrapper.tsx:83](C:/solutions/moveseyee_fe/src/routes/PageWrapper.tsx:83)의 epoch key가 하위 트리를 재마운트하므로 `closedRef`도 함께 활성화됩니다. 세션만 바뀌고 cleanup 전인 짧은 구간에 `setDownloading(false)`가 실행될 수 있으나 민감 데이터·오류·파일은 전달되지 않으며 기존 트리는 곧 폐기됩니다. · 차단 수정 없음.

- R3 · 권장 · [ApmExportModal.tsx:117](C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:117) · 반쪽 반영이 새 결함을 만들지는 않습니다. · 조건부 렌더링이 모달을 실제 unmount하므로 cleanup에서 `closedRef=true`가 되고, 이후 성공·실패 응답과 `finally`의 `setState`가 모두 차단됩니다. 정상 성공의 `onClose()` 직후 `finally`는 React가 같은 비동기 작업의 상태 갱신을 처리하는 구간이며 민감한 후속 동작도 없습니다. 다만 Axios 요청과 BE 실행 슬롯은 계속 유지됩니다. · 후속으로 AbortController를 연결하되 현재 승인의 차단 사유는 아닙니다.

- R4 · 권장 · [ApmExportButton.test.tsx:91](C:/solutions/moveseyee_fe/src/__tests__/ApmExportButton.test.tsx:91) · 새 테스트는 변경 경로에는 실제로 닿지만 R2의 의미 회귀를 가립니다. · `Date.now` 스파이는 실제 버튼 클릭의 clamp에, `bumpSessionEpoch`는 컴포넌트와 동일한 module singleton에, 닫기 테스트는 실제 unmount cleanup에 연결됩니다. 그러나 첫 테스트는 계획 요청으로 `step:null`을 보낸 뒤 [fixture:24](C:/solutions/moveseyee_fe/src/__tests__/fixtures/apmExportContractSample.ts:24)의 `requestedStepSeconds:60` 응답을 사용합니다. 실제 BE에서는 발생할 수 없는 조합이므로 자동 해상도와 승격 메타 불일치를 발견하지 못합니다. 세션 테스트도 성공 응답만 다루며 `PageWrapper` 재마운트와 오류 응답 경로는 고정하지 않습니다. · 자동 step, 명시 step 승격, 보존 경계, 다운로드 reject 후 세션 전환을 추가하십시오.

기존 동작에서는 계획 조건 변경 시 재조회, `allowed=false` 다운로드 비활성화, 모달 unmount에 따른 원문 체크 초기화가 깨진 흔적은 없습니다.

정적 검사는 `tsc --noEmit --incremental false`, 변경 파일 ESLint, `git diff --check`가 통과했습니다. Jest는 읽기 전용 환경에서 임시 haste-map 생성이 `EPERM`으로 막혀 이번 세션에서는 실행 결과를 확인하지 못했습니다. 요청서에 기록된 20건 통과는 **추정**으로만 인정했습니다.

- 1차 R1: **닫힘**
- 1차 R2: **부분** — 미래 `to` 격자는 닫혔으나 요청 해상도 메타와 보존 경계 재승격이 남음
- 1차 R3: **부분** — 늦은 응답은 폐기하지만 요청 중단은 미구현