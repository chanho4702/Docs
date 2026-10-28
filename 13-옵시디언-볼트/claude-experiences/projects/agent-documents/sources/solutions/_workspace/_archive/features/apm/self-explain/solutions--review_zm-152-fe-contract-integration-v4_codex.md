## R1 반영 판정

| R1 | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 닫힘 | 억제 목록은 커넥션 풀 카드 슬롯 2개와 JVM의 `processCpuPct`·`processMemoryBytes`만 포함한다(`runtimeSlots.ts:220-229`, 테스트 `ApmServiceRuntimeTab.test.tsx:428-433`). `non_heap`은 `families: [JVM]` 카드 범위로 이동했고(`runtimeSlots.ts:82-90`), 비-JVM 부재 시 메모리 카드 1장, JVM 부재 시 2장을 각각 단언한다(`ApmServiceRuntimeTab.test.tsx:403-426`). 값 존재 판정이 family 범위 검사보다 먼저 실행되어 비-JVM `memoryUsed` 렌더를 유지하며(`runtimeSlots.ts:204-209`), Node 시계열 렌더 테스트도 이를 확인한다(`ApmServiceRuntimeTab.test.tsx:215-225`). |

새 결함: 없음.

## 판정

승인

이유 1: v3에서 지적한 비-JVM `non_heap` 억제 예외가 제거되고 카드 정의 범위로 정상 이동했다.  
이유 2: JVM·비-JVM 부재 분기와 비-JVM 값 존재 회귀 경로가 코드 및 테스트에서 모두 보존된다.

확인하지 못한 것:

- 지시에 따라 build, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 실제 브라우저 렌더링과 실행 중인 BE 연동은 확인하지 않았다.