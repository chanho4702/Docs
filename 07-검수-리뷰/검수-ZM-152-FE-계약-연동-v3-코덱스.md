## 잔여 반영 판정

| 항목(R1/N1/N2) | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 부분 | 억제 로직은 명시 배열로 바뀌었고, 커넥션 풀·JVM process 억제는 `runtimeSlots.ts:214-225`, Python `memoryUsed`·`cpuUtilizationPct` 및 .NET `classCount` 노출은 `ApmServiceRuntimeTab.test.tsx:373-400`에서 확인된다. 다만 허용된 목록 밖인 비-JVM `memoryUsed/non_heap` 억제가 `runtimeSlots.ts:226-227`에 다섯 번째 예외로 남아 있고 테스트도 이를 고정한다(`ApmServiceRuntimeTab.test.tsx:402-406`). 슬롯 표현 중복 방지는 필요하더라도 서버 `absentSlots` 억제 예외가 아니라 카드 적용 범위로 처리해야 한다. |
| N1 | 닫힘 | `apm.empty_reason.retention.body`가 데이터 부재 가능성 표현으로 수정됐다(`kr.json:105-107`, `en.json:105-107`). `apm.retention.whole/partial/gap/mismatch`도 가능성 표현이며 삭제·정리를 단정하는 문구는 남지 않았다(`kr.json:161-172`, `en.json:161-172`). |
| N2 | 닫힘 | `expired`와 `gap`을 별도로 계산하고, `gap` 배너를 독립적으로 렌더한다(`ApmServiceInstancesTab.tsx:101-108,277-288`). 숫자 칸은 값이 `null`이면서 `expired` 또는 `gap`일 때만 배지를 표시한다(`:105-111`). 3일 유효 보존·5일 창에서 배너, 배지 3개, 기존 전체 보존 밖 안내 미표시를 검증한다(`ApmServiceInstancesTab.test.tsx:219-228`). |

새 결함(회귀): 없음.

## 판정

**수정 후 재검수**

이유 1: N1과 N2는 요구한 문구·표시·테스트 조건을 충족했다.  
이유 2: R1은 필수 카드 노출은 복구됐지만, v2가 허용한 명시 목록 밖 억제 규칙이 여전히 남아 있어 완전히 닫히지 않았다.

확인하지 못한 것:

- 지시에 따라 build, TypeScript 검사, Jest 및 npm 명령은 실행하지 않았다.
- 실제 브라우저의 런타임 카드·인스턴스 배너·Tooltip 렌더링은 확인하지 않았다.
- 실행 중인 BE와 통합 호출하지 않았다.
- BE 트리에는 전용 계약 JSON으로 JVM `runtime.json`만 확인됐다. Python·.NET은 BE `RuntimeSlotMap.java:323-355`, 계약서 §1과 FE 파생 픽스처·테스트를 대조했으며, 별도 Python·.NET runtime JSON은 확인하지 못했다.