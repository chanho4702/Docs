---
type: topic
tags: [topic, backend, memory-budget, zabbix, streaming, lesson]
created: 2026-09-19
updated: 2026-09-19
---

# MovesEye history scan의 요청 단위 보유 예산

2026-09-19 ZM-159 C5 3차 검수에서 확인한 메모리 상한 교훈.

- `windowPages <= cap`과 `consumerRows <= cap`을 각각 만족해도 두 저장소가 동시에 살아 있으면 요청 전체 보유량은 최대 약 `2 × cap`이 될 수 있다. 메모리 안전 계약은 개별 컬렉션이 아니라 요청 단위 공유 budget으로 집행해야 한다.
- 고정 cap을 `IntSupplier(남은 양)`로 바꿔도 충분하지 않다. 실행기가 버퍼 목록을 계속 참조한 채 콜백 소비자가 같은 행을 다른 표현으로 복제하면, 판정 전에는 `consumer + buffer <= cap`이어도 콜백 중에는 `consumer + 원본 buffer + 변환본`이 다시 최대 약 `2 × cap`이 된다. 테스트도 콜백 진입 전 수치뿐 아니라 콜백 중/후 실행기 잔여 버퍼까지 계측해야 한다.
- 설정 가능한 상한을 계층 사이에 전달할 때 공개 기본 상수로 남은 예산을 계산하면 안 된다. 실제 설정값이 기본값보다 작으면 여러 하위 호출의 합계가 설정 상한을 넘고, 더 크면 설정 확장이 무시된다.
- `perCallRows < heldRows` 같은 교차 불변식은 기본값 테스트만으로 부족하다. 설정 오버라이드까지 기동 시 검증해야 한다.
- 동적 잔여량으로 RPC `limit`을 낮출 때는 **정책 상한 overflow**와 **보유 예산 overflow**를 구분해야 한다. 잔여량이 0이면 `limit=1` 탐침 결과를 일반 창 분할로 보내지 말고 즉시 예산 종료해야 하며, 단일 초·단일 ID처럼 더 쪼갤 수 없는 단위가 잔여량을 넘은 경우도 `NO_PROGRESS`가 아니라 `HELD_ROWS`로 원인을 보존해야 한다.

관련 검수서: `C:\solutions\_workspace\_archive\features\infra\scale-call-guard\review_zm-159-c5-v3_codex.md`
최종 검수서: `C:\solutions\_workspace\_archive\features\infra\scale-call-guard\review_zm-159-c5-v5_codex.md`
