# ZM-159 C5 재검수 v2

- 검수 대상: `C:\worktrees\zm-159-be` 현재 미커밋 변경 16개 파일
- 기준: `HEAD` 대비 diff, 기존 검수 `review_zm-159-c5_codex.md`, 반영 기록, 설계 v1
- 코드 수정 없음. 이 문서만 작성했다.

## 결론

**수정 후 재검수 — 차단 유지.**

기존 R2(레거시 1콜 동작)는 해소됐고, 기존 R6(epoch 정렬)도 회귀 없이 반영됐다. 기존 R1도 `max-total-rows`와 `max-history-rows`를 분리하고 `HeldRowsExceeded`를 동기 소비자 중단 신호로 쓰는 방향 자체는 맞다. 그러나 운영 기본값에서는 `history.get` 1콜 행 상한과 보유 상한이 둘 다 100,000이라, 재분할이 필요했던 조회가 완전 종료하는 경우가 논리적으로 존재하지 않는다. 더구나 보유 상한은 서비스의 `Row` 누적만 제한하고 실행기가 먼저 쌓는 `windowPages`는 제한하지 못한다. 이 두 문제는 메모리·완전성 보호의 핵심이므로 병합 차단이다.

## 발견 사항

### R1 · 필수 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:62,69`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:81,98-110`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:273-288`

**문제** · 받은 행 예산과 보유 상한은 분리됐지만, 기본 설정에서는 “overflow 후 재분할 완주”가 여전히 불가능하다.

**근거** · 기본 `history.get.max-rows`와 `max-history-rows`가 모두 100,000이다. 이 조회는 `IdAxis.EXCLUSIVE`이고 시간창도 서로 겹치지 않으므로, 어떤 단일 조각이 `maxRows`를 초과했다면 논리 조회 전체 행 수도 반드시 100,000을 초과한다. 실행기는 이제 첫 overflow에서 `BUDGET_ROWS`로 즉시 끝나지 않고 창을 쪼개지만, 확정 페이지를 소비하는 순간 서비스가 100,000행까지만 담고 다음 행에서 `HeldRowsExceeded`를 던져 최종 결과는 `HELD_ROWS`다. 즉 기존 R1의 조기 `BUDGET_ROWS` 사유만 바뀌었을 뿐, 운영 기본값에서 재분할로 완전 결과를 만드는 핵심 약속은 복구되지 않았다.

신규 `splitStillWorksWhenHeldCapEqualsRowCap` 테스트도 이를 재현하지 않는다. `maxRows=3`, `heldCap=3`인데 데이터도 정확히 3행이라 첫 호출의 응답 크기가 상한을 **넘지 않으며**, 재분할이 한 번도 일어나지 않는다. 테스트 이름·주석과 실제 자극이 다르다.

**제안** · 재분할 완주가 목적이면 per-RPC `maxRows`를 보유 상한보다 작게 두어야 한다. 예를 들어 1콜 상한을 낮추고 논리 조회 보유 상한은 100,000으로 유지하면, 한 조각은 넘쳐도 전체는 100,000 이하인 조회를 실제로 분할 완주할 수 있다. 테스트는 최소한 `(maxRows+1)`행으로 첫 호출 overflow와 호출 수 증가를 증명하고, `heldCap > maxRows`에서는 완전 종료, `heldCap == maxRows`에서는 `HELD_ROWS`를 기대해야 한다. 분할 없이 정확히 cap인 별도 테스트는 현재 `exactlyAtCapIsComplete`가 이미 담당한다.

### R2 · 필수 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:210,226-279`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:81-110`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:157-179`

**문제** · `zabbix.call.max-history-rows`는 전체 메모리 보유 상한이 아니다. `HeldRowsExceeded`가 실행되기 전에 실행기가 한 시간창의 모든 item 청크 응답을 `windowPages`에 먼저 보유한다.

**근거** · 기간 스캔은 나중 청크가 overflow하면 창 전체를 다시 읽어야 하므로, 210행에서 `windowPages`를 만들고 각 청크의 `List<JsonNode>`를 265행에 축적한 뒤, 모든 청크가 성공한 276~279행에서야 소비자를 호출한다. itemid가 200개를 넘으면 한 창에 여러 페이지가 생기므로, 서비스의 `rows.size() >= heldCap` 검사는 이미 최대 `max-total-rows`에 가까운 `JsonNode`들이 메모리에 들어온 뒤 작동할 수 있다. 소비 중에는 `windowPages`와 최대 100,000개의 `Row`가 겹친다. 따라서 코드·주석의 “메모리에 보유할 포인트 상한 10만”과 테스트명 “메모리는 상한 안에 묶인다”는 사실이 아니다.

`HeldRowsExceeded` 자체의 전파는 안전하다. `scanWindows`는 동기 실행이고 소비자 예외를 잡지 않으므로 예외가 즉시 서비스까지 전파되며, 지속되는 실행기 상태나 비동기 작업도 없다. 현재 페이지를 일부 소비한 결과는 정확히 `heldCap`개까지만 남고 `complete=false/HELD_ROWS`로 반환된다. 문제는 예외 전파 계약이 아니라 **예외가 소비자 호출 시점에야 발생한다는 것**이다.

추가로 어댑터는 FLOAT·UNSIGNED를 별도 호출하고 첫 불완전 이후에도 다음 타입을 계속 읽어 `byItem`에 쌓으므로, 요청 전체에서는 보유량이 타입 수만큼 늘 수 있다. 이는 기존 검수 R5의 잔여 위험이기도 하다.

**제안** · `max-history-rows`를 진짜 요청 단위 상한으로 만들려면 실행기 내부의 확정 전 버퍼도 같은 예산에 포함해야 한다. 창 전체 rollback이 필요하다면 청크 페이지를 임시 저장하는 순간 별도 held budget을 차감하고 초과 시 소비 전에 명시적 불완전 결과로 끝내거나, history 전용으로 더 작은 per-RPC 페이지와 트랜잭션성 있는 소비/rollback 구조를 둔다. 어댑터에는 history type 전체를 합친 공통 보유 예산을 적용하고, 첫 불완전 이후 다른 타입을 계속 읽을 정책도 명시한다.

### R3 · 권장 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:437-448`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:318-347`

**문제** · `window <= max(policyWindow, maxRows/perChunk)` 공식은 “adaptive 확대가 기존 정책보다 더 위험해지지 않게 하는 상한”으로는 타당하지만, 주석·반영 기록처럼 “1초 주기에도 id 수와 무관하게 1콜 행 상한을 지킨다”는 보장은 아니다.

**근거** · 정수 나눗셈은 내림이므로 `maxRows/perChunk`가 지배하는 구간에서는 안전한 방향이고, `scale=maxIds/perChunk`의 내림도 과대 확대 대신 보수적 과소 확대를 만든다. `perChunk=min(전체 id 수,maxIds)`를 한 번 계산하는 것도 마지막 소청크를 덜 넓힐 뿐 안전성 회귀는 없다. 다만 `Math.max(policyWindow, ...)` 때문에 정책창 자체가 밀도 상한보다 크면 축소하지 않는다. 기본값은 `policyWindow=3,600`, `maxRows=100,000`이므로 itemid 28개부터 1초당 1행 가정에서도 `28×3,600=100,800`행이다. 200개 청크는 720,000행 상당이다. 이 경우 실행기 overflow 분할이 안전망이지만, R1의 동일 보유 상한과 받은 행 예산을 소비한다.

현재 `densityCapLimitsWidening`은 이 사실을 그대로 보여 주는 테스트다. `maxRows/perChunk=5초`인데 정책창 10초를 유지하고, 실제 데이터는 2행뿐이라 overflow·예산 소모를 검증하지 않는다. 나눗셈 비정합 경계, 27/28개 경계, `maxIds+1`에서 마지막 1개 청크가 보수적으로 3,600초를 쓰는 경우도 없다.

**제안** · 이 공식을 유지한다면 명칭과 설명을 “adaptive 확대 상한”으로 좁히고 정책창은 별도 baseline임을 명시한다. 정말 1초 밀도 행 상한을 보장하려면 `maxRows/perChunk`가 정책창보다 작을 때 창을 축소해야 한다. 어느 선택이든 27/28/200/201개 itemid와 1초 밀도 데이터를 넣어 overflow 횟수, `rowsSeen`, 종료 사유를 고정한다.

### R4 · 필수 · `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:76-97,174-230,273-304`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapterTest.java:544-582`, `src/test/java/com/dmove/moveseye/host/items/ItemsServiceLongRangeTest.java:73-123`

**문제** · 테스트가 통과하지만 R1·R2와 완전성 전파의 치명 경로를 고정하지 않는다.

**근거** · 다음 공백이 있다.

- R1 재현 테스트는 위에서 설명한 대로 cap+1을 만들지 않아 overflow·재분할을 전혀 검증하지 않는다.
- 가짜 Zabbix는 itemids·기간·limit만 적용하고 `sortfield/sortorder`를 적용하지 않는다. DESC 테스트는 요청 파라미터만 보고 “최신 subset 유지”를 검증하지 않는다.
- `scanHistoryByItemids`의 명시 limit 우회는 직접 테스트하지 않는다. 현재 명시 limit 테스트는 기존 `getHistoryByItemids`만 호출한다.
- 기간 없음·DESC 1콜이 정확히 100,000행일 때 `complete=false/ROW_CAP`이 되는 테스트가 없다.
- `getRange`의 누락·비숫자 값이 계속 `asDouble(0)`이 되는 테스트가 없다.
- 같은 epoch의 여러 itemid/여러 행 multiset과 안정 정렬을 고정하지 않는다.
- `ZabbixMetricAdapterTest`는 모든 `HistoryScanResult`를 `complete=true`로만 만든다. FLOAT/UNSIGNED 중 하나만 불완전할 때 전체 `SeriesResult.complete=false`, 최초 stopReason, `deliveredPoints`, `querySeries` 얇은 통로를 검증하지 않는다.
- `ItemsServiceLongRangeTest`는 불완전 결과 폐기·trend 폴백은 고정했지만, 정확히 cap인 완전 결과를 채택하는 새 의도와 여러 창/청크 완주 결과는 고정하지 않는다.
- 라이선스 리플렉션 테스트는 차단 상태 0회는 자동으로 잡지만 ACTIVE에서 `querySeriesResult`가 정확히 1회 위임되는 명시 테스트는 없다.

**제안** · 위 매트릭스를 추가하되 특히 R1은 첫 RPC의 `limit=maxRows+1` 응답, 실제 재분할 호출, 최종 종료 사유를 함께 assert한다. 1콜 동등성은 `getHistoryByItemids`·`getRange` 요청 map 전체를 `HEAD` 기준 expected map과 비교하고 로그 캡처까지 넣는다.

## 기존 지적 대응 확인

### 기존 R1 — 부분 해소, 차단 유지

- `max-total-rows`와 `max-history-rows`의 설정값 분리는 실제 반영됐다.
- 소비자 예외는 실행기에서 삼켜지지 않고 안전하게 동기 전파된다.
- 하지만 기본 `maxRows == heldCap`이라 overflow 분할 완주는 불가능하고, 실행기 내부 버퍼는 held cap 밖이다(R1·R2).

### 기존 R2 — 해소 확인

`getHistoryByItemids`와 `getRange`는 `HEAD`와 비교해 1콜 요청 동작이 복원됐다.

- `getHistoryByItemids`: `LinkedHashMap`의 파라미터 순서와 값이 `output → history → sortfield → sortorder → itemids → time_from → time_till → limit`로 동일하다. 기본 정렬 ASC, 명시 정렬 원문, 기본/명시 limit, 경고 조건과 경고 문구가 같다. 공통 `ZabbixClient`가 같은 `ObjectMapper.writeValueAsBytes`로 이 map을 직렬화하므로 요청 body도 동일하다.
- 값 변환은 numeric 타입의 `Double.valueOf`, epoch→ISO, 비numeric 문자열 보존이 종전과 같다. 계산 위치만 helper로 이동했다.
- `getRange`: 파라미터·순서(`clock ASC`)·10만 상한·`asDouble(0)`·경고 문구가 종전과 같다.
- `scanHistoryByItemids`: DESC, 명시 limit, 한쪽이라도 기간이 없는 요청, ASC 이외의 정렬을 1콜로 우회한다. 암묵 limit 요청이 10만에 닿으면 `ROW_CAP`을 표시하고, 명시 limit에 정확히 닿는 것은 요청된 상위 N건이므로 complete로 보는 판단도 맞다.
- `ItemsService`는 “응답 크기가 cap인가” 대신 `scan.complete()`로 불완전 원시를 버린다. 정확히 10만이어도 실행기가 끝까지 읽었음을 증명하면 채택하므로 종전의 보수적 오탐을 없애면서 “잘린 원시를 채택하지 않는다”는 의도를 보존한다.

단, 이 동등성은 코드 비교로 확인됐고 테스트가 wire body·로그·최신 subset을 완전히 고정하지는 않는다(R4).

### 기존 R3 — 부분 해소

정수 나눗셈과 전체 id 수 기준 `perChunk`는 모두 보수적인 방향이다. 마지막 소청크의 창을 별도로 넓히지 않아 호출 수가 늘 수 있지만 안전성 문제는 아니다. 다만 공식은 정책창 자체를 줄이지 않으므로 엄밀한 밀도 상한이 아니라 “adaptive 확대 상한”이다(R3).

### 기존 R6 — 해소 확인

정렬은 `Row(epoch long)`을 만든 뒤 `Comparator.comparingLong`으로 수행하고 ISO 문자열은 결과 생성 때 한 번만 만든다. `Instant.parse`를 비교마다 반복하던 비용은 제거됐다. Java의 `List.sort`는 stable이므로 같은 epoch 행은 스캔 입력 상대 순서를 유지한다. 같은 시각 행의 상대 순서는 외부 계약이 아니라는 Javadoc도 맞다. 레거시 1콜 경로는 별도 재정렬하지 않아 Zabbix 응답 순서를 그대로 보존하고, `getRange`도 변경되지 않았다.

다만 동일 epoch multiset·상대 순서를 고정하는 테스트는 없다(R4).

## 검증 결과

- `git diff --check`: 오류 없음. `ZabbixHistoryServiceImpl.java`의 LF→CRLF 경고만 있음.
- 관련 테스트 묶음:
  - `ZabbixHistoryServiceImplTest`, `ZabbixMetricAdapterTest` 통과
  - `ItemsServiceLongRangeTest`, `InterfaceServiceTest`, `LicenseGuardedPortTest` 통과
- 전체 재실행(`--rerun-tasks`):
  - root `:test`: **3,928 tests / 0 failures / 0 errors**
  - `:engine-zabbix:test`: **255 tests / 0 failures / 0 errors**
- 기존 미커밋 소스·테스트는 수정하지 않았다.

## 종합 판정

**수정 후 재검수.** 기존 R2와 R6은 승인 가능하다. 그러나 기존 R1은 설정 분리와 예외 전파만 고쳐졌고, 기본값에서 overflow 분할 완주가 불가능한 논리 충돌과 실행기 내부 버퍼의 보유 상한 우회가 남았다. 이를 재현해야 할 테스트도 overflow를 만들지 않아 차단을 해제할 근거가 없다. R1·R2와 R4의 핵심 재현 테스트를 반영하기 전에는 병합하지 않는 것이 안전하다.
