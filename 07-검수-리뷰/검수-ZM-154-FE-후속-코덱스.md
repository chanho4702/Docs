- R1 · 필수 · src/pages/application-monitoring/shared/components/ApmExportModal.tsx:214 · 구 BE v1 응답에 `planToken`이 없어도 다운로드를 허용해 엔드포인트 필터가 빠진 잘못된 파일을 저장한다 · 근거: `undefined` 토큰은 `clean()`에서 제거되고 만료 검사도 통과한다. v1 BE는 `method` 요청 파라미터를 받지 않고 `q`를 endpoint exporter에 적용하지 않으므로, 필터링된 표에서 받아도 파일은 전체 데이터가 된다. 오류·재조회 루프 없이 조용히 성공한다 · 수정안: wire 응답을 v1/v2 union으로 모델링하고 `planToken` 존재를 런타임 검증한다. v2 의존 필터가 있는데 토큰이 없으면 다운로드를 차단하고 서버 버전 불일치 안내를 표시한다

- R2 · 권장 · src/services/axiosInstance.ts:142 · 호출부 취소 직후 같은 `requestKey`의 대체 요청이 등록되는 경합에서는 취소된 요청이 다시 영구 pending이 된다 · 근거: 호출부 중단이 자기 controller를 맵에서 지워도, 취소 오류가 응답 인터셉터에 도착하기 전에 같은 키의 새 요청이 등록되면 `controllers.has(cancelledKey)`가 true가 되어 180줄의 미완료 Promise를 반환한다. 두 동일 다운로드를 겹친 뒤 첫 호출을 abort하면 첫 호출의 `catch/finally`가 끝나지 않는다 · 수정안: 호출부가 취소한 interceptor signal을 별도 `WeakSet`이나 config 플래그로 표시하고, 응답 인터셉터에서는 이 표식을 먼저 검사해 무조건 reject한다. 기존 signal 없는 중복 취소만 대체 요청 존재 시 pending으로 유지한다

- R3 · 권장 · src/services/linkCallerSignal.ts:49 · 호출부 abort 리스너가 요청 완료 시 제거되지 않는다 · 근거: `{ once: true }`는 abort가 발생했을 때만 제거한다. 완료·실패했지만 abort되지 않은 장수명 caller signal을 재사용하면 각 요청의 controller와 `requestKey` closure가 signal에 계속 누적된다 · 수정안: `linkCallerSignal`이 unsubscribe 함수를 반환하게 하고 config에 보관한 뒤 성공·실패·401 재시도 전 경로에서 호출한다

- R4 · 권장 · src/pages/application-monitoring/shared/apmExport.ts:86 · 만료를 클라이언트 절대 시계로 선판정해 클라이언트 시계가 서버보다 30분 이상 빠르면 다운로드가 영구적으로 불가능하다 · 근거: 서버가 새 토큰을 발급해도 `planTokenExpiresAtMs <= Date.now()`가 계속 true여서 누를 때마다 재계획만 하고 다운로드하지 않는다. 시계가 늦은 경우는 BE의 `APM_EXPORT_INVALID`로 수렴하지만 빠른 경우는 수렴하지 않는다 · 수정안: 클라이언트 선판정을 제거하고 BE의 INVALID를 만료 판정의 정본으로 사용하거나, 신뢰할 수 있는 서버 시각 오프셋이 있을 때만 선판정한다

- R5 · 권장 · src/__tests__/linkCallerSignal.test.ts:55 · 401 재시도 테스트 2건은 실제 axios 인터셉터·adapter·`mergeConfig` 흐름을 통과하지 않아 배선 회귀를 검출하지 못한다 · 근거: 테스트가 helper를 직접 호출해 재시도를 손으로 재현한다. `axiosInstance.ts`의 134~144줄을 이전 구현으로 되돌려도 이 테스트들은 그대로 통과하며, `apmExportApi.test.ts`도 axios 인스턴스를 mock한다 · 수정안: 실제 axios 인스턴스와 사용자 adapter를 사용해 401→refresh→재요청을 실행하고, 호출부가 이미 abort된 경우와 재시도 도중 abort되는 경우를 각각 검증한다. `axiosInstance.ts` 배선을 되돌리면 실패해야 한다

- F6 개요 화면: 이상 없음 — 전체 서비스 RED 버튼은 기존 서비스 상세와 같은 `toolbarLeading`을 사용하고, 외부 `Flex`와 내부 `Space`가 모두 wrap된다. 온보딩 화면에서는 미노출되며 라우트의 `apm.view`·`FeatureGate("APM")`를 동일하게 적용받는다.
- v2 파라미터 정합: 이상 없음 — 계획과 다운로드가 같은 `params`를 사용하고 다운로드에만 `planToken`을 추가한다. `method`는 `endpoints`로 제한되며 쿼리 키에 `q`·`method`를 포함한다. `refetch()` 반환값도 사용하지 않는다.
- INVALID 처리: 이상 없음 — 자동 재다운로드가 없고 재조회 실패 시 `planQuery.error`로 버튼이 잠겨 자동 무한 루프는 발생하지 않는다.
- 현재 v2 계약 타입·픽스처: 이상 없음 — 네 필드의 순서와 타입이 계약과 일치하고 epoch millisecond 값은 JavaScript 안전 정수 범위다. 다만 v1 혼용은 R1과 같이 별도 런타임 분기가 필요하다.
- 로케일: 이상 없음 — kr/en 신규 키가 대칭이며 고객 문구에 검수번호·`§`·HTML 태그가 없다.
- 일반적인 취소·X·Esc·언마운트·계정 전환 및 StrictMode 경로: 이상 없음 — 같은 핸들러와 effect cleanup으로 중단되고, 취소 후 오류 Alert를 건너뛰며 `finally`에서 상태를 복구한다. 동일 키 경합 예외는 R2다.
- `_callerSignal` 보존: 이상 없음 — 설치된 axios의 `mergeConfig`는 미등록 config 키를 `mergeDeepProperties`로 복사하므로 401 재시도 config에 남는다.
- signal 없는 기존 요청: 이상 없음 — 첫 요청과 401 재시도 모두 caller signal을 연결하지 않아 기존 중복 취소 규칙은 유지된다.

## 판정

수정 후 재검수

- 구 BE와 혼재할 때 필터가 빠진 파일을 정상 파일로 저장하는 R1은 “잘못된 파일”에 해당하는 필수 결함이다.
- 동일 키 취소 경합, 리스너 정리, 빠른 클라이언트 시계 및 실제 인터셉터 회귀 테스트도 보완이 필요하다.

확인하지 못한 것:

- 지시대로 빌드·Jest·npm 명령은 실행하지 않아 보고서의 147건 통과를 재검증하지 못했다.
- 브라우저 네트워크의 실제 `(canceled)` 상태, BE 스트림 슬롯 반납, 401 실통신 재시도는 확인하지 못했다.
- 모바일 실제 폭과 편집 모드의 시각적 배치는 코드의 wrap 구조만 확인했으며 브라우저 실측은 하지 못했다.