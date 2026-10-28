## R1~R6 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 닫힘 | `ApmRetentionDays.java:114-159`에서 0 이하를 기본값으로 정규화하고, `ApmRetentionJob.java:103-123`과 `ApmRetentionPolicy.java:115-128`이 모두 같은 `from()`을 사용한다. 양수 19개는 그대로 배치 인자로 전달된다(`ApmRetentionNormalizationTest.java:67-95`). 기존 `0`은 무기한이 아니며 파티션은 오늘 이전을 삭제하고(`ApmPartitionService.java:218-230`), 비파티션은 현재 시각 이전을 삭제했다(`ApmRetentionService.java:148-175`). 따라서 기본값 폴백은 삭제 범위를 넓히지 않는다. 응답 및 `mismatch`도 정규화된 실제 배치값을 사용한다(`ApmRetentionDto.java:72-93`). |
| R2 | 닫힘 | `errorGroupVisibleDays()`가 부모·자식의 `min`을 계산한다(`ApmRetentionDays.java:161-169`). 예외 목록과 시계열 모두 이 값을 사용한다(`ApmErrorController.java:71-84`, `110-117`). 부모 삭제가 자식까지 먼저 삭제하는 실제 경로와 일치한다(`ApmRetentionService.java:148-154`). |
| R3 | 닫힘 | `dbQueryVisibleDays()`가 부모·자식의 `min`을 계산한다(`ApmRetentionDays.java:171-174`). DB 쿼리 목록과 시계열 모두 적용됐다(`ApmDbQueryController.java:66-80`, `117-124`). 부모 삭제 시 5분 자식도 함께 삭제하는 경로와 일치한다(`ApmRetentionService.java:169-175`). 외부 의존·서비스 맵은 별도 본체 연쇄 삭제 없이 해당 파티션 보존만 적용된다(`ApmRetentionService.java:113-121`). |
| R4 | 닫힘 | `measureBatch()`가 유효 H1 경계를 구해 계획 시작점을 자르고 `retentionClipped`를 전달한다(`ApmSloCalculator.java:397-434`). `unknownReason()`은 요청 수보다 이를 먼저 판정한다(`ApmSloCalculator.java:916-933`). 정상 400일 설정에서는 `planFrom == fromMs`라 기존 계획이 그대로이며 기본 7·30일 경로 테스트도 유지됐다(`ApmSloUnknownReasonTest.java:82-97`). 추가 설정 조회는 60초 캐시로 묶여 SLO별 N+1이 아니라 캐시 만료 시 1회다(`ApmRetentionPolicy.java:73-81`). |
| R5 | 닫힘 | 신규 키는 `AtomicInteger` CAS로 예약하고 경합 패배 시 반환한다(`ApmServiceDropTally.java:55-92`). 카운트는 `LongAdder`, 마지막 시각은 `AtomicLong.accumulateAndGet(max)`다(`ApmServiceDropTally.java:139-155`). 테스트는 16개 worker를 시작 latch로 동시에 풀어 신규 키 삽입과 공유 키 갱신을 실제로 경합시킨다(`ApmServiceDropTallyTest.java:85-129`). |
| R6 | 닫힘 | 테스트가 직접 만든 `Measured`가 아니라 실제 `measureBatch()`를 통과한다(`ApmSloUnknownReasonTest.java:64-113`). R4의 잘림 전달을 제거하면 `retentionClipped` 단언과 최종 사유 단언이 실패하는 구조다(`ApmSloUnknownReasonTest.java:74-79`, `109-112`). |

- 새 결함 없음.

## 판정

승인

이유 1: R1~R6의 원인이 모두 실제 배치·응답·측정 경로에서 닫혔으며, 양수 보존 설정과 정상 SLO 설정의 기존 계산 경로도 유지된다.  
이유 2: 재반영으로 인한 응답 의미 회귀나 SLO별 추가 쿼리, 동시성 상한·시각 퇴행 문제를 정적 검토에서 발견하지 못했다.

확인하지 못한 것

- 요청에 따라 빌드·테스트를 실행하지 않았다.
- 실운영 `scheduler_setting` 값과 과거 배치로 이미 삭제된 데이터 상태는 확인하지 않았다.
- 실제 동시 수신 부하에서 CAS 상한과 `lastSeenMs` 단조성을 동적으로 재현하지 않았다.
- PostgreSQL에서 SLO 조회와 보존 설정 조회의 실제 실행 계획·지연은 측정하지 않았다.
- 현재 `master` 참조는 요청 기준 이후로 이동했으므로, 검수 비교는 명시된 `3f731d5`를 기준으로 수행했다.