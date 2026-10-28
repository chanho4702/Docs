## R1~R10 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 부분 | `src/pages/application-monitoring/services/runtimeSlots.ts:197-204`에서 `undefined`·`{}`·서버 키 존재를 구분한 점은 반영됐다. 그러나 `:202`의 “알려진 family에서 `expected`에 없으면 모두 skip”은 Python `memoryUsed`·`cpuUtilizationPct`, .NET `classCount`처럼 BE가 해당 family의 슬롯으로 선언한 판정까지 숨긴다. |
| R2 | 닫힘 | `src/pages/application-monitoring/shared/components/ApmEmptyReason.tsx:31-34`에서 `NOT_RECEIVED`에 설치 가이드와 폐기 경로가 모두 연결되고, `ApmServiceRuntimeTab.tsx:114-118`에서 서비스 폐기 요약도 표시한다. |
| R3 | 닫힘 | `src/pages/application-monitoring/shared/apmRetention.ts:385-394`에서 서버 경계는 `whole = to <= C`, `partial = from < C-5분`이고 폴백만 1시간 여유를 사용한다. `whole || partial` 구조라 `to <= C`인데 판정이 사라지는 모순도 없다. |
| R4 | 부분 | 배너 문구는 `src/locales/kr.json:162-163`에서 보수적 표현으로 수정됐다. 그러나 같은 판정의 빈 값 설명은 `src/locales/kr.json:107`과 `en.json:107`에서 여전히 “데이터가 남아 있지 않다/정리됐다”고 단정한다. |
| R5 | 부분 | `src/pages/application-monitoring/shared/apmRetention.ts:412-429`에서 독립적인 `gap` 상태를 만들고 `ApmRetentionNotice.tsx:106-113`에서 표시한다. 기본값은 `effectiveDays === promotionDays`라 `:421` 조건을 통과하지 않아 오탐이 없다. 다만 인스턴스 탭은 `ApmServiceInstancesTab.tsx:101,275`에서 `expired`만 표시 조건으로 사용해 실제 `gap` 배너가 누락된다. |
| R6 | 닫힘 | `src/pages/application-monitoring/shared/apmRetention.ts:98-99,165-170`에서 `Date.now()+clockOffsetMs`와 0 폴백을 구현했다. `ApmRetentionContext.tsx:31-35`는 `dataUpdatedAt`을 의존성에 포함하므로 재조회 성공 때마다 오프셋이 갱신된다. RED·런타임·인스턴스 호출부 모두 컨텍스트의 `days`를 전달하며, 배너와 `gap`도 같은 `apmRetentionState` 경로를 사용한다. |
| R7 | 닫힘 | `src/locales/kr.json:141-143`과 대응 영어 문구가 “일부 또는 전부가 보존 범위 밖이라 전체 기간을 판단할 수 없음”으로 수정됐다. |
| R8 | 닫힘 | `src/types/apm.ts:1375`의 `signal: "METRIC"`과 `:1401`의 `source: "PROCESS_MEMORY"`가 계약 및 BE DTO 상수와 일치한다. |
| R9 | 닫힘 | `src/__tests__/apmRetention.test.ts:335-356`에서 5분 경계와 `to=C/C+1ms`를 분리했고, `ApmServiceRuntimeTab.test.tsx:303-378`에서 `undefined`·`{}`·서버 키·억제 조건을 각각 검사한다. |
| R10 | 닫힘 | `src/__tests__/apmSelfExplainHooks.test.tsx:20-22,73-120`은 axios 경계만 mock하고 실제 `useDmoveQuery`의 두 번째 언랩을 통과한다. 직접 payload, 공유 키, staleTime, 포커스 재조회 비활성화, `enabled`를 검증한다. |

## 의도적 편차 판단

R1 억제 규칙: **부당** — JVM의 공통 process 슬롯과 선택적인 connection pool만 억제하는 것은 타당하며 실제 JVM 옵션 누락을 숨기지 않는다. 하지만 `runtimeSlots.ts:202`는 이를 모든 알려진 runtime의 `expected` 불일치로 일반화하여 BE가 실제 family 슬롯으로 판정한 Python memory/CPU와 .NET classCount까지 숨긴다. 예외를 명시적인 pool·JVM process 조합으로 좁혀야 한다.

R3 5분 여유: **타당** — 프리셋은 분 경계로 내림하므로 최대 약 1분의 정렬 차와 일반 요청 지연을 흡수하기에 충분하며, `C-30분` 같은 실제 결손은 여전히 잡는다. `to <= C`는 여유 없이 먼저 `whole`로 판정되어 경계 모순도 없다.

- N1 · 필수 · src/locales/kr.json:107 · 보수적 보존 경계를 근거로 데이터가 확실히 삭제됐다고 여전히 단정한다 · `apmRetentionEmptyReason`은 정책 경계만으로 `retention`을 선택하므로 파티션 특성상 행이 남았거나 단순 무요청인 경우도 “데이터가 남아 있지 않다”고 설명할 수 있고 `en.json:107`도 동일하다 · `whole`·`partial`과 같이 “보존이 보장되지 않아 일부 또는 전부가 없을 수 있다”는 문구로 양쪽 로케일을 수정한다.
- N2 · 권장 · src/pages/application-monitoring/services/detail/tabs/ApmServiceInstancesTab.tsx:101 · 새 `gap` 상태가 인스턴스 탭의 배너와 빈 숫자 칸에 노출되지 않는다 · 1분 유효 보존 3일·승격 7일에서 5일 창과 `metricsAvailable:true`이면 `retention.gap`은 생기지만 `isBeyondRetention`은 false이고 `:275`의 배너도 렌더되지 않는다 · `expired`와 `gap`을 분리해 `gap`에는 `ApmRetentionNotice state={retention}`을 렌더하고 해당 화면 테스트를 추가한다.

## 판정

**수정 후 재검수**

이유 1: 필수 R1 억제가 BE 정본보다 넓어 실제 runtime 슬롯 판정을 숨기며, R4의 단정 문구도 한 표시 경로에 남아 있다.  
이유 2: R5의 순수 판정은 고쳐졌지만 인스턴스 탭의 실제 표시 조건이 새 `gap`을 소비하지 않는다.

확인하지 못한 것:

- 지시에 따라 build, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 실제 브라우저의 Popover·Tooltip·인스턴스 배너 렌더링은 확인하지 않았다.
- 실행 중인 BE와 통합 호출하지 않았으며 계약서, BE 소스·표본 JSON, FE 정적 코드만 대조했다.
- 보고서에 기재된 기존 테스트 통과 결과와 재조회 시 React Query 런타임 동작은 재실행으로 검증하지 않았다.