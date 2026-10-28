- R1 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/core/batch/retention/ApmRetentionDays.java:137 · 0 이하 보존 일수를 응답 경계에서만 1일로 보정해 실제 배치 삭제 범위와 불일치한다. · 근거: `oldestAvailableMs()`는 `Math.max(1, days)`를 적용하지만 `ApmRetentionJob`은 같은 값을 그대로 `dropExpiredPartitions`·`deleteStale*`에 전달한다. 예를 들어 `raw1mDays=0`이면 배치는 오늘 자정 이전 파티션을 삭제하지만 응답은 `now-1일`부터 보존된다고 알리며, 음수이면 미래 시각을 기준으로 오늘 데이터까지 삭제할 수 있다. `ApmRetentionPolicyTest:125`는 이 불일치를 정상 동작으로 고정한다. · 수정안: `ApmRetentionDays.from()`에서 모든 일수를 양수로 검증·정규화하여 배치와 응답이 동일한 값만 사용하게 하거나 설정 저장 단계에서 0 이하를 거부하고, 배치 인자와 응답 경계를 함께 검증하는 테스트를 추가한다.
- R2 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorController.java:82 · 예외 목록·시계열의 `oldestAvailableMs`가 부모 그룹의 더 짧은 보존 기간을 무시한다. · 근거: 두 EP는 `errorGroup1hDays`만 사용하지만 `ApmRetentionService.deleteStaleErrorGroups()`는 `errorGroupDays`가 지난 부모와 해당 부모의 모든 `apm_error_group_1h` 자식을 함께 삭제한다. `errorGroupDays=7`, `errorGroup1hDays=90`에서 8일 된 그룹은 이미 사라졌는데 응답은 90일 전까지 조회 가능하다고 표시한다. · 수정안: 두 EP의 경계를 `min(errorGroup1hDays, errorGroupDays)`로 계산하고 두 설정이 역전된 테스트를 추가한다.
- R3 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryController.java:78 · DB 쿼리 목록·시계열도 부모 그룹의 실제 삭제 기준을 무시해 보존 경계를 과거로 과장한다. · 근거: 응답은 `dbQuery5mDays`만 참조하지만 `deleteStaleDbQueryGroups()`는 `dbQueryGroupDays`가 지난 부모와 모든 5분 자식을 먼저 삭제한다. `dbQueryGroupDays=7`, `dbQuery5mDays=30`이면 8일 된 데이터가 삭제된 뒤에도 `now-30일`을 반환한다. · 수정안: 두 EP 모두 `min(dbQuery5mDays, dbQueryGroupDays)`를 사용하고 설정 역전 사례를 검증한다.
- R4 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/slo/ApmSloCalculator.java:483 · `OUT_OF_RETENTION` 판정이 유효 보존 설정과 연결되지 않아 보존을 줄인 설치본에서 `NO_REQUESTS`로 오판한다. · 근거: `planSegments()`는 `ApmResolution`의 고정 7/30/400일만 사용하므로 유효 `rollup1hDays`를 전혀 알지 못하고, 유효한 7·30일 롤링 창에는 항상 비어 있지 않은 세그먼트를 만든다. 예를 들어 `rollup1hDays=1`로 줄인 뒤 7일 SLO에서 보존된 요청이 없으면 `measuredFrom/to`는 7일 전체로 남고 `requests=0`이 되어 `unknownReason()`이 `NO_REQUESTS`를 반환한다. 계약에서 말한 “보존을 창보다 짧게 줄인 설치본용” 분기는 발생하지 않는다. · 수정안: 측정 계획에 `ApmRetentionPolicy`의 유효 H1 경계를 반영하고 `Measured`에 보존으로 잘린 상태를 명시적으로 전달하여 요청 수 판정보다 먼저 `OUT_OF_RETENTION`을 결정한다.
- R5 · 권장 · src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/drop/ApmServiceDropTally.java:53 · 동시 기록 시 10,000키 상한을 넘을 수 있고 `lastSeenMs`가 과거로 되돌아갈 수 있다. · 근거: 여러 스레드가 동시에 `cells.size()<10000`을 본 뒤 서로 다른 키를 `computeIfAbsent`하면 모두 삽입된다. 또한 113행의 volatile 비교 후 대입은 원자적이지 않아, 시각 2000을 본 스레드가 쓴 뒤 시각 1000을 본 스레드가 덮어쓰면 마지막 관측이 1000으로 퇴행한다. 현재 테스트는 순차 호출만 사용한다. · 수정안: 신규 키 자리를 `AtomicInteger` CAS 또는 임계구역으로 예약하고, 마지막 시각은 `AtomicLong.accumulateAndGet(nowMs, Math::max)`로 갱신한다. 카운트는 경합이 큰 경로라면 `LongAdder`를 사용하고 동시 시작 테스트를 추가한다.
- R6 · 권장 · src/test/java/com/dmove/moveseye/premium/apm/slo/ApmSloUnknownReasonTest.java:51 · `OUT_OF_RETENTION` 테스트가 운영 측정 경로에서 생성되지 않는 `Measured`를 직접 만들어 핵심 결함을 검출하지 못한다. · 근거: 테스트는 유효한 요청 창에 `measuredFrom==measuredTo`인 객체를 수동 주입해 `unknownReason()` 한 함수만 검증한다. 실제 `measureBatch()`는 유효한 롤링 창에서 고정 해상도로 항상 세그먼트를 생성하므로 이 상태를 만들지 않으며, 동적 보존 설정이 무시되어도 테스트는 통과한다. · 수정안: 실제 `measureBatch()`와 보존 정책을 통과시키고, H1 보존이 SLO 창보다 짧은 경우의 `Measured` 및 최종 `unknownReason`을 검증한다.
- 기존 응답 호환: 이상 없음 — 계약 표본 JSON 14개를 대조한 결과 기존 키의 값·타입·null 규칙 변화는 없었고 새 키 추가만 확인했다. `service-detail.json`의 일부 키 순서 이동은 JSON 의미를 바꾸지 않는다.
- 성능·부하: 이상 없음 — 서비스 목록과 개요의 `received`는 각각 `VALUES × EXISTS` 배치 쿼리 1회이며 서비스별 N+1은 아니다. 상세의 마지막 액티브 요청 조회만 단건 추가된다.
- 런타임 슬롯·액티브 요청·수신 판정: 이상 없음 — `absentSlots`는 슬롯별 ingestible OR와 실제 allowlist 대조 테스트를 사용하고, `activeRequestsObserved`는 선택된 해상도의 표본 수, `received`는 요청 집계와 같은 해상도·반개구간을 사용한다. `metricsAvailable`도 기존 `ApmResolution.choose(from,to,60)==M1` 규칙과 일치한다.
- 권한·라이선스·패키지 방향: 이상 없음 — 신규 두 EP 모두 클래스의 `@RequiresFeature(Feature.APM)` 뒤 메서드에서 `requireRead()`를 호출하며, premium 코드가 app repository를 직접 주입한 경로는 없다. 서비스별 응답에는 token/account 식별자가 노출되지 않는다.
- 보존 조회의 JDBC·캐시·배치 리팩터: 이상 없음 — 단일 행 읽기는 부작용 없는 SELECT이고 60초 로컬 캐시 및 읽기 실패 시 기본값 폴백이 명시되어 있다. 19개 옵션 키·기본값과 배치 호출 순서 자체는 기존 코드와 동일하다.

## 판정

수정 후 재검수

이유 1: 예외·DB 쿼리 보존 경계와 SLO 사유가 실제 삭제 정책과 달라 FE가 데이터 부재 원인을 잘못 안내한다.  
이유 2: 보존 일수의 비정상값 처리 불일치와 메모리 카운터의 동시성 보장이 해소되어야 계약상 자기설명 정보가 신뢰 가능하다.

확인하지 못한 것

- 요청에 따라 빌드·테스트는 실행하지 않았다.
- PostgreSQL `EXPLAIN`을 통한 `VALUES × EXISTS` 및 `max(bucket_start)`의 실제 실행 계획은 확인하지 않았다.
- 실운영 `scheduler_setting` 값과 실제 파티션·데이터 보존 상태는 확인하지 않았다.
- 동시 수신 부하에서 10,000키 상한 초과와 타임스탬프 퇴행을 동적으로 재현하지 않았다.