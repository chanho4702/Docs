# ZM-154 FE 검수 결과

- 검수 대상: FE 커밋 `39ece8e`만
- 검수 기준: 검수 요청서, `features/apm/data-export/contract_apm-data-export.md`, 지정 인접 코드 및 BE `ApmExportController`·`ApmExportRequest`·`ApmExportPlanDto` 실물
- 종합 판정: **수정 후 재검수**
- 차단 항목: **R1, R2**
- 테스트는 요청에 따라 실행하지 않고 소스만 검토했습니다.

## 발견 사항

- R1 · 필수 · [ApmExportModal.tsx:115](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A115) · 이전 로그인 세션에서 시작한 다운로드가 계정 전환 후 저장될 수 있음 · `downloadExport()`는 React Query 밖의 수동 GET이고, 응답 직후 세션 확인 없이 116행에서 `saveAs()`를 실행합니다. 따라서 최대 10분짜리 요청 도중 `switchClientSession()`이 발생해 화면이 재마운트되어도 Promise는 계속 실행됩니다. `useDmoveQuery`의 세션 epoch 검사는 이 요청에 적용되지 않아 이전 계정의 파일이 새 계정 화면에서 저장될 수 있습니다. · 다운로드 시작 시 `getSessionEpoch()`를 고정하고 응답 후 `saveAs()` 직전에 다시 비교하여 달라졌으면 폐기하십시오. 가능하면 세션 전환·언마운트 시 요청도 중단하고, 이를 지연 Promise 기반 테스트로 고정해야 합니다.

- R2 · 필수 · [ApmExportModal.tsx:91](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A91), [ApmExportModal.tsx:115](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A115) · 미래 `to` 요청에서 계획과 실제 파일의 기간·행 수·파일명이 달라질 수 있음 · 툴바는 오늘 이후 날짜만 막아 오늘의 미래 시각은 선택할 수 있습니다([ApmToolbar.tsx:139](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmToolbar.tsx%3A139)). BE는 계획과 다운로드 요청마다 각각 `to = min(to, nowMs)`를 계산합니다(`ApmExportRequest.java:59`). FE는 두 요청에 원래의 미래 `scope.to`를 다시 보내므로, 그 사이 시간이 흐르면 다운로드의 실제 `toMs`가 계획보다 늦어집니다. 그럼 파일 내용은 늘어났는데 `saveAs()`에는 이전 계획의 파일명이 사용됩니다. · 모달을 여는 순간 `to`를 `Math.min(to, Date.now())`로 확정하거나, 미래 시간 선택 자체를 막으십시오. 미래 종료 시각과 지연된 다운로드를 사용해 두 요청의 숫자 파라미터가 동일함을 검증해야 합니다.

- R3 · 권장 · [ApmExportModal.tsx:144](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A144), [ApmExportModal.tsx:149](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A149) · 다운로드 중 취소·닫기를 눌러도 요청과 파일 저장이 취소되지 않음 · 취소 버튼과 모달 닫기는 항상 `onClose`를 실행하지만, 진행 중인 Axios 요청에는 취소 신호가 없고 완료 후 `saveAs()`도 그대로 호출됩니다. 사용자가 취소했다고 생각한 뒤 파일이 나타날 수 있으며, 숨은 요청이 최대 10분 동안 BE 동시 내보내기 슬롯을 점유합니다. · 다운로드 중 닫기를 막거나, 취소 시 요청을 실제 중단하고 완료 콜백도 무효화하십시오.

- R4 · 권장 · [apmExportApi.test.ts:93](file:///C:/solutions/moveseyee_fe/src/__tests__/apmExportApi.test.ts%3A93) · 중점 항목 9의 실제 Axios 경로와 R1·R2 회귀가 테스트에 고정되지 않음 · API 테스트는 `axiosInstance` 전체를 mock하여 `responseType: "blob"` 상태의 HTTP 401 → refresh → 재시도 경로를 검증하지 않습니다. JSON 오류도 정확히 `application/json`인 Blob만 사용합니다. 세션 전환, 모달 종료 후 응답, 미래 `to` 정규화 테스트도 없습니다. 언랩 깊이와 숫자형 from/to 자체는 실제 `useDmoveQuery`를 사용한 컴포넌트 테스트로 검증됩니다. · 실제 인터셉터 배선을 이용해 `application/json;charset=UTF-8`, Blob 401 재인증, 세션 epoch 변경, 미래 `to`를 각각 추가하십시오.

- R5 · 권장 · [ApmExportModal.tsx:168](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A168), [ApmExportModal.tsx:198](file:///C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx%3A198) · 파일 형식과 해상도 입력에 프로그램적으로 연결된 접근성 레이블이 없음 · 앞의 `<Text>`는 `Radio.Group`·`Select`와 `label` 또는 `aria-labelledby`로 연결되지 않아 보조 기술에서 컨트롤 목적을 알기 어렵습니다. · 번역된 `aria-label`을 추가하거나 `Form.Item`/`htmlFor`로 레이블을 연결하십시오.

## 확인된 계약 일치 사항

BE 실물을 읽어 대조한 결과, `from`·`to`는 양쪽 EP 모두 Java `Long`이고 내부 요청은 `long` ms입니다. FE도 `number` ms를 보내며 ISO 문자열 변환은 없습니다. `ApmExportPlanDto`의 필드 이름과 FE `TApmExportPlan`도 일치합니다.

`kr.json`·`en.json`은 모두 JSON 파싱에 성공했고, `apm.export.*` leaf key는 각각 41개로 집합 차이가 없습니다.

## 중점 확인 요청 9~13

- 9 · 충족 — `blob.type.includes("application/json")`은 `application/json;charset=UTF-8`도 판정하며, 실제 HTTP 401은 Blob 본문 파싱 전 공통 인터셉터가 상태 코드로 refresh합니다. 다만 테스트는 R4처럼 부족합니다.
- 10 · 충족 — Axios 인터셉터가 응답 본문을 반환하고, `getExportPlan`은 envelope을 유지하며, `useDmoveQuery`가 `envelope.data`를 꺼내므로 모달의 `plan.filename` 접근 깊이가 맞습니다.
- 11 · 충족 — `useApmTimeRange`의 `from/to`는 ms `number`, FE 쿼리 이름은 `from/to`, BE는 `Long from/to`입니다. 단 미래 종료 시각의 재절단 문제는 R2입니다.
- 12 · 충족 — 양쪽 JSON 유효, `apm.export.*` 키 집합 동일, 동일 객체 내 중복·기존 키 충돌 없음.
- 13 · 불충족 — 언랩 깊이와 숫자형 파라미터는 고정했지만 Blob 401 인터셉터, 세션 전환, 미래 `to`, 취소 후 완료 경로가 테스트되지 않았습니다.