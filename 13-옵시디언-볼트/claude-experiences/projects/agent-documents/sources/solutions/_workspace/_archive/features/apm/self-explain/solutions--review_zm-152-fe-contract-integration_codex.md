## 결함

- R1 · 필수 · src/pages/application-monitoring/services/detail/tabs/ApmServiceRuntimeTab.tsx:298 · 신 BE의 `absentSlots`가 카드 표시 여부를 결정하지 않아 서버 판정이 숨거나 존재하지 않는 슬롯을 결함으로 표시한다 · 근거: 카드는 항상 구 FE의 `card.expected`로 `ready/missing/skip`을 정한다. `family:"unknown"`과 `absentSlots:{processCpuPct:"NOT_RECEIVED",processMemoryBytes:"NOT_RECEIVED"}` 응답에서는 두 카드가 모두 `skip`되고, 계약의 dotnet 표본에서는 BE가 열거하지 않은 `cpuUtilizationPct` 카드가 `not_instrumented`로 추가 표시된다. `absentSlots:{}`도 키 자체가 없는 구 BE와 구분되지 않는다 · 수정안: `absentSlots !== undefined`이면 슬롯 존재 여부까지 서버 맵을 정본으로 사용하고, `{}`는 “부재 슬롯 없음”, `undefined`만 기존 `expected` 계산으로 폴백하도록 분리한다.

- R2 · 권장 · src/pages/application-monitoring/shared/components/ApmEmptyReason.tsx:31 · `NOT_RECEIVED`에서 계약에 명시된 폐기 사유 확인 경로가 빠져 있다 · 근거: `ACTIONS`가 설치 가이드만 제공하고, `ApmServiceDropsLine`도 `NOT_INGESTIBLE`에서만 렌더링된다. 따라서 해당 응답을 받은 런타임 카드에서는 설치 가이드 외에 수집기 상태나 서비스별 폐기 요약을 확인할 수 없다 · 수정안: `NOT_RECEIVED`에도 `drops` 경로를 추가하고, 서비스 UID가 있는 런타임 카드에서는 서비스별 폐기 요약을 함께 제공한다.

- R3 · 필수 · src/pages/application-monitoring/shared/apmRetention.ts:344 · 정확한 서버 경계인 `oldestAvailableMs`에도 1시간 여유를 빼 계약의 일부 밖·전체 밖 판정을 누락한다 · 근거: 경계가 `C`일 때 `from=C-30분`, `to=C`이면 계약상 `from<C`이고 `to<=C`이므로 전체 밖이지만, 현재는 `from<C-1시간`이 거짓이라 안내가 전혀 나오지 않는다 · 수정안: 1시간 여유는 브라우저 시계로 계산한 구 BE 폴백 경계에만 적용하고, 서버가 준 유한한 `oldestAvailableMs`에는 `from < C`, `to <= C`를 그대로 적용한다.

- R4 · 필수 · src/locales/kr.json:162 · 보수적 경계 이전을 “데이터가 남아 있지 않음/비어 있음”으로 단정해 실제 남은 행과 안내가 충돌한다 · 근거: 계약상 파티션 삭제 특성 때문에 `oldestAvailableMs` 이전에도 행이 남을 수 있다. 해당 범위를 조회해 데이터가 표시되어도 현재 전체·부분 문구는 데이터가 없다고 단정하며, 영어 문구도 동일하다 · 수정안: “보존이 보장되지 않아 일부 또는 전부가 없을 수 있다”처럼 보수적 경계의 의미를 나타내도록 양쪽 로케일의 `whole`·`partial` 문구를 수정한다.

- R5 · 권장 · src/pages/application-monitoring/shared/components/ApmRetentionNotice.tsx:68 · `resolutions[].mismatch` 안내는 다른 보존 상태가 이미 발생한 경우에만 표시되어 실제 해상도 공백 구간에서는 사라진다 · 근거: 1분 유효 보존 3일·승격 7일 설정에서 5일 창을 조회하면 앞 2일이 비지만, 1시간 보존에는 걸리지 않고 승격도 발생하지 않아 `resolved`가 `null`이 되며 `mismatchHint` 계산 전에 반환한다 · 수정안: 요청 해상도의 `effectiveDays < promotionDays` 구간 자체를 별도 상태로 계산하여, 다른 `expired/promoted` 상태가 없어도 해당 창이 공백 구간을 가로지르면 mismatch 안내를 표시한다.

- R6 · 필수 · src/pages/application-monitoring/shared/ApmRetentionContext.tsx:26 · 계약의 서버 시각 `nowMs`를 버리고 모든 폴백 경계를 브라우저 `Date.now()`로 계산한다 · 근거: 컨텍스트에는 일수만 저장되고 `apmRetentionState`는 기본적으로 클라이언트 시각을 쓴다. 사용자 PC 시계가 서버보다 이틀 빠르거나 빠르면 `oldestAvailableMs`가 없는 RED·런타임 화면의 보존 및 승격 안내가 이틀씩 어긋날 수 있다 · 수정안: 서버 응답 시각과 수신 당시 클라이언트 시각의 오프셋을 컨텍스트에 보관하고, 판정 시 `Date.now()+offset`을 사용하며 응답 없음·실패 때만 로컬 시각으로 폴백한다.

- R7 · 필수 · src/locales/kr.json:143 · SLO `OUT_OF_RETENTION` 설명이 “잴 수 있는 구간이 남아 있지 않다”고 잘못 단정한다 · 근거: BE는 창 시작이 보존 경계 밖이면 일부 보존 구간이 남아 있어도 요청 수보다 먼저 `OUT_OF_RETENTION`을 반환한다. 예를 들어 30일 SLO 중 최근 7일을 측정할 수 있어도 현재 문구는 측정 가능 구간이 전혀 없다고 안내한다 · 수정안: “기간 일부 또는 전부가 보존 범위 밖이라 전체 SLO 기간을 판단할 수 없다”로 한국어와 영어 문구를 수정한다.

- R8 · 권장 · src/types/apm.ts:1372 · 서비스별 폐기 계약의 고정값 `signal:"METRIC"`과 `source:"PROCESS_MEMORY"`를 모두 `string`으로 선언해 계약 타입 검사가 잘못된 값을 허용한다 · 근거: 현재 `typecheck:contract` 픽스처는 `signal:"TRACE"`나 `source:"DATABASE"`로 바뀌어도 컴파일되므로 새 필드의 값 계약을 고정하지 못한다 · 수정안: 각각 `"METRIC"`과 `"PROCESS_MEMORY"` 리터럴 타입으로 좁히고 계약 픽스처가 이를 검사하게 한다.

- R9 · 권장 · src/__tests__/apmRetention.test.ts:309 · 테스트가 서버 경계에도 1시간 여유를 두는 잘못된 동작을 정상으로 고정한다 · 근거: 이 테스트는 `from=oldest-30분`에서 `null`을 기대하며 계약의 `from < oldestAvailableMs` 규칙과 반대다. 런타임 테스트도 `absentSlots`에 슬롯이 없을 때 무조건 구 판정으로 돌아가는 현재 동작을 고정한다 · 수정안: 서버 경계의 `C-1ms/C/C+1ms`와 `to=C`를 검사하고, 런타임은 `absentSlots`의 `undefined`·`{}`·키 존재를 각각 분리해 테스트한다.

- R10 · 권장 · src/__tests__/ApmSelfExplain.test.tsx:53 · 새 retention 및 service-drops 훅을 전부 mock해 쿼리 키·staleTime·enabled·직접 payload 언랩 규약을 검증하지 않는다 · 근거: 화면 테스트는 가공된 `data`만 주입하므로 실제 훅이 envelope을 한 겹 더 기대하거나 staleTime·권한 조건을 잃어도 통과한다 · 수정안: `useDmoveQuery`와 서비스 함수를 경계에서 mock하는 훅 단위 테스트를 추가해 직접 payload, 공유 쿼리 키, 10분/1분 staleTime, 포커스 재조회 비활성화 및 권한별 `enabled`를 고정한다.

## 관점별 이상 없음

- 관점 2 이상 없음 — 빈 값 판정은 전체 보존 밖 → `received:false` → 액티브 요청 옵션 → 요청 수 순서이며 `false`, `null`, `undefined`를 별도로 처리한다.
- 관점 7 이상 없음 — `metricsAvailable` boolean을 표 배지와 small multiple에 함께 전달하고, 필드가 없거나 행이 없을 때만 기존 7일 계산으로 폴백한다.

## 판정

수정 후 재검수

이유 1: 서버 런타임 판정과 정확한 보존 경계가 무시되어 정상 슬롯을 결함으로 안내하거나 보존 밖인 빈 화면에 아무 안내도 나오지 않는다.  
이유 2: 보수적 경계와 SLO 부분 보존을 절대적인 데이터 부재로 표현해 사용자가 수집 중단 또는 측정 불가 범위를 잘못 이해할 수 있다.

확인하지 못한 것:

- 요청에 따라 빌드, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 실제 브라우저에서 Popover 지연 마운트, 콘솔 출력 및 403 토스트 발생 여부는 확인하지 않았다.
- 실행 중인 BE와의 통합 호출은 하지 않았으며 계약서·BE 워크트리 표본과 정적 코드만 대조했다.