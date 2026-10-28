# ZM-159 C5 4차 검수

- 검수 대상: `C:\worktrees\zm-159-be`의 현재 미커밋 변경 17개 추적 파일 + 신규 파일 2개
- 비교 기준: `review_zm-159-c5-v3_codex.md`, `review_zm-159-c5.md` 하단 `3차 검수 반영 기록`, `HEAD` 대비 현재 diff
- 검수일: 2026-09-19
- 구현 코드는 수정하지 않았다. 이 검수 문서만 산출했다.

## 결론

**수정 후 재검수 — 차단 유지.**

3차 R2인 “어댑터가 설정값 대신 고정 100,000으로 타입 간 남은 예산을 계산한다”는 실제로 해소됐다. `ZabbixMetricAdapter`가 동일 Spring bean인 `ZabbixCallLimits`를 주입받아 `getMaxHistoryRows() - held`를 다음 타입에 넘기므로, 비기본 설정도 계산의 정본이 된다.

그러나 3차 R1은 완전히 해소되지 않았다. `IntSupplier`는 **창을 확정하기 전**의 `기존 rows + windowPages`를 상한 안으로 줄였지만, 창을 소비자에게 전달할 때 `windowPages` 전체를 계속 보유한 채 소비자가 같은 행을 `Row`로 복제한다. 따라서 전달 중에는 다시 `확정 rows + 원본 JsonNode 버퍼 + 새 Row`가 동시에 살아 최대 약 2배까지 갈 수 있다. 새 테스트는 콜백 진입 직전만 측정해 이 구간을 보지 못한다. 메모리 상한은 C5의 핵심 안전 계약이므로 병합 차단을 유지한다.

추가로 `effectiveLimit`은 기존 1콜 호출자에는 영향을 주지 않지만, `maxHeldRows`와 명시 `limit`을 함께 쓰는 새 조합에서 잘린 결과를 `complete=true`로 보고할 수 있다. 이는 현재 운영 호출 경로에서는 재현되지 않는 계약 경계 결함이라 권장 수정으로 분류한다.

## 발견 사항

### R1 · 필수 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:211-215,269-299`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:89-115`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutorTest.java:759-785`

**문제** · `IntSupplier` 도입 후에도 소비자 누적과 실행기 버퍼가 실제 메모리에서 같은 상한을 공유하지 않는다. 3차 R1은 부분 해소됐지만 핵심 상한 계약은 아직 미해소다.

**근거** · 실행기는 각 창의 모든 페이지를 `windowPages`에 넣고(213, 269행), 남은 예산 공급자와 비교한다(273~274행). 여기까지는 `기존 rows + 창 버퍼 <= heldCap`을 만든다. 하지만 확정 단계는 `windowPages`를 제거하지 않은 채 순회하며 `pageConsumer.accept(committed)`를 호출한다(294~298행). 소비자는 해당 `JsonNode`들을 새 `Row`로 변환해 `rows`에 추가한다(109~115행). 콜백이 진행되는 동안 원본 페이지 전부는 여전히 `windowPages`에서 참조되고 새 `Row`도 누적되므로, 기존 누적을 `P`, 창 버퍼를 `B`라 하면 판정 시점에는 `P+B <= cap`이지만 전달 완료 직전에는 `P+B+B`가 된다. 여러 id 청크가 한 창에 모여 `B`가 cap에 가까우면 다시 최대 약 `2×cap`이다.

또한 페이지를 `windowPages`에 추가한 **뒤** 상한을 검사하므로(269~274행), 분할을 결정하는 순간에는 `P + B`가 현재 RPC 페이지만큼 일시 초과한다. 이는 3차에서 지적한 수신 순간 초과도 그대로 남았다는 뜻이다.

새 `windowBufferBudgetIsSharedWithConsumer` 테스트는 콜백 안에서 `held.get() + page.size()`를 기록한 다음 `held`를 증가시킨다(775~778행). 즉 “콜백 진입 전 누적 + 현재 page”만 세며, `held`를 늘린 뒤에도 그 page와 나머지 `windowPages`가 실행기에 남아 있는 상태는 측정하지 않는다. 테스트 설명의 “한 번도 상한을 넘지 않는다”를 실제로 증명하지 못한다.

**제안** · 동적 숫자 공급자만 추가할 것이 아니라 버퍼의 소유권/표현을 하나로 만든다. 예를 들어 실행기가 최종 타입으로 매핑한 객체를 버퍼링하고 확정 시 그 객체 참조 자체를 소비자 목록으로 이동해 `JsonNode → Row` 이중 표현을 만들지 않거나, 소비형 계약을 바꿔 페이지를 제거·해제하며 전달하고 변환 중 중복까지 budget에 계산한다. RPC 응답을 받은 직후의 초과도 막으려면 남은 예산에 맞춰 요청 `limit`을 줄이거나, “현재 페이지 1개”의 headroom을 별도 예약해야 한다. 회귀 테스트는 콜백 전 수치가 아니라 실행기 버퍼 잔량과 소비자 누적을 콜백 **중/후**까지 함께 계측해야 한다.

### R2 · 권장 · `engine-api/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/model/HistoryGetParams.java:7-11`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:65-77,159-187`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:388-397,413-424`

**문제** · 1콜 우회 경로에서 `effectiveLimit`이 명시 `limit`보다 작은 `maxHeldRows`로 요청을 줄여도, `scanHistoryByItemids`는 명시 limit이 있었다는 이유만으로 잘림을 완전 결과로 보고한다. 보유 예산 소진 사유도 `HELD_ROWS`가 아니라 `ROW_CAP`이 된다.

**근거** · `effectiveLimit`은 `min(limit, maxHeldRows)`를 요청에 싣는다(163~165, 187행). 그러나 우회 경로의 `capped`는 `params.limit() == null`일 때만 참이다(75행). 예를 들어 `limit=100, maxHeldRows=10`이면 Zabbix에는 `limit=10`이 전송되고 10건만 돌아와도 `complete=true`다. `limit=null, maxHeldRows=10`이면 불완전으로는 표시하지만 사유는 예산 소진이 아닌 `ROW_CAP`이다. `DESC` 또는 기간 없는 조회에 `maxHeldRows=0`을 주면 RPC는 생략되지만 같은 조건 때문에 `ROW_CAP`으로 끝난다.

더불어 `HistoryGetParams`는 `maxHeldRows=null`이면 설정값을 쓴다고 설명하지만, 1콜 우회의 `effectiveLimit`은 `ZabbixCallLimits#getMaxHistoryRows()`를 보지 않고 기본 100,000을 쓴다. 따라서 설정을 50,000으로 낮춰도 `DESC`/기간 없음 우회는 호출자가 명시적으로 `maxHeldRows`를 전달하지 않으면 100,000까지 받을 수 있다.

현재 프로덕션 호출자 검색 결과 `maxHeldRows`를 넘기는 곳은 RAW 시계열 어댑터뿐이며, 이 경로는 ASC+기간+limit 없음이라 분할 경로를 탄다. `HostService`, `queryRecentText`, `ApmSyntheticService`의 기존 1콜 호출은 `maxHeldRows`를 넘기지 않으므로 이번 변경으로 요청 body가 달라지지 않는다. 즉 기존 1콜 동등성은 유지되지만 새 공개 조합의 완전성 계약이 잘못됐다.

**제안** · 1콜 유효 상한을 `min(요청 limit 또는 기본 안전핀, 명시 maxHeldRows 또는 설정 maxHistoryRows)`로 단일화한다. 유효 상한이 요청한 N보다 보유 예산 때문에 작아졌고 그 상한에 닿으면 `complete=false, stopReason=HELD_ROWS`로 반환한다. `limit > maxHeldRows`, `DESC + maxHeldRows=0`, 기간 없음 + 비기본 설정 상한을 각각 테스트한다.

### R3 · 권장 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:22-33,70-79,103-129`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:296-310`

**문제** · 새 기동 검증은 논리적으로 맞고 저장소 기본 설정도 안전하지만, 운영에 예전 `history.get.max-rows=100000`을 명시해 둔 경우 배포 즉시 기동 실패하는 설정 마이그레이션이다. 새 `max-history-rows` 키는 클래스 상단 설정 목록에도 빠져 있다.

**근거** · 기본값은 `10,000 < 100,000`이라 통과한다. 저장소 전체의 추적된 yml/properties/env/Docker 설정에서는 두 키의 오버라이드를 찾지 못했으므로 **저장소에 보이는 배포 설정은 깨지지 않는다**. 하지만 생성자는 `rowCap >= maxHistoryRows`면 예외를 던진다(123~129행). 이전 기본 100,000을 Vault/외부 환경 변수에 명시적으로 고정한 환경은 새 기본 `max-history-rows=100000`과 같아져 실패한다. 외부 운영 설정은 이 worktree만으로 확인할 수 없다. 테스트는 같음 조합의 실패와 기본값의 성공을 고정해 코드 동작은 증명한다.

**제안** · 배포 전 Vault/환경 변수에서 `zabbix.call.policy.history.get.max-rows`와 `zabbix.call.max-history-rows`를 함께 점검하고 `rowCap < heldCap`으로 마이그레이션한다. `ZabbixCallLimits`의 설정 키 목록과 운영 샘플/릴리스 노트에 새 키와 기동 실패 조건을 추가한다. 이는 검증을 완화하라는 뜻이 아니라 의도된 breaking config를 배포 절차에 드러내라는 제안이다.

### R4 · 참고 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:70-79`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:447-480`

**문제** · 정책 창 3,600→3,000초 변경은 고밀도 기본 시나리오의 헛읽기를 크게 줄이지만, overflow가 없던 희소 시나리오에서는 일부 다중-id 조회의 정상 RPC 수를 약 20% 늘린다.

**근거** · 200개 itemid가 60초마다 한 점이면 3,000초 창 `[0..2999]`에는 item당 50점, 총 10,000점이 들어 1콜 행 상한과 맞는다. 종전 3,600초는 약 12,000점이라 매 창 최초 호출이 10,001점에서 overflow한 뒤 두 반창을 다시 읽어 시간당 약 3콜, 하루 약 72콜이 된다. 새 값은 하루 약 29콜이라 이 주 경로에서는 개선이다. 반대로 데이터가 희소해 3,600초 창도 넘치지 않았다면 하루 약 24콜에서 29콜로 약 20.8% 증가한다. 1~166개 itemid는 `adaptiveWindowSeconds`의 계산값이 정책 하한보다 커 차이가 없고, 영향은 주로 청크가 167~200개로 찬 경우다.

**제안** · 기본값 변경은 유지해도 된다. 다만 200개 청크의 1일/30일 희소·1분 밀도에서 calls와 stopReason을 부하 테스트나 운영 메트릭으로 확인한다. 설정 오버라이드에서도 `maxIds × windowSeconds ÷ 60 <= maxRows` 관계가 자동 검증되지는 않으므로 운영 문서에 세 값을 한 묶음으로 조정한다고 명시한다.

## 3차 차단 항목 재판정

### 3차 R1 — 부분 해소, 차단 유지

- 해소: 앞 창에서 소비자가 누적한 수량만큼 다음 창의 허용 버퍼가 줄어든다. 분할 불가 종료가 서비스에서 `HELD_ROWS`로 교정되는 것도 확인했다.
- 미해소: `windowPages`를 유지한 채 소비자가 `Row`를 새로 만들기 때문에 **전달 중 원본+변환본 중복 보유**가 남는다. 페이지 수신 후 검사하는 순간의 일시 초과도 남는다.
- 테스트 공백: 새 peak 테스트는 콜백 후에도 남은 실행기 버퍼를 세지 않는다.

### 3차 R2 — 해소

- `ZabbixMetricAdapter`가 `ZabbixCallLimits`를 생성자 주입받고, 다음 히스토리 타입의 예산을 `limits.getMaxHistoryRows() - held`로 계산한다(`ZabbixMetricAdapter.java:81-87,172-179`).
- `ZabbixHistoryServiceImpl`도 같은 설정 bean으로 요청별 값과 설정 상한 중 작은 값을 적용한다(`ZabbixHistoryServiceImpl.java:83-85`).
- 따라서 50,000 설정에서 첫 타입 40,000건을 보유하면 다음 타입에는 10,000만 전달되고, 기존처럼 고정 상수 때문에 총 90,000이 되는 경로는 사라졌다.
- 현재 테스트 `querySeriesResult_passesRemainingHeldBudgetToLaterTypes`는 기본값에서 차감만 확인한다. 코드 결함은 아니지만 비기본 50,000/150,000을 직접 넣는 테스트를 추가하면 3차 반례가 더 정확히 고정된다.

## IntSupplier의 C6/C8 영향

- C6 `trend.get`: `ZabbixTrendServiceImpl`의 `WindowScan`은 `maxWindowRows`를 설정하지 않는다. `IntSupplier`는 null인 기존 경로에 개입하지 않는다. 또한 trend 기본 정책 창은 86,400초라 `adaptiveWindowSeconds`가 조기 반환해 기존 1일 창도 그대로다.
- C8 대량 알람: `ZabbixAlertAdapter`는 `scanWindows`가 아니라 `scanByCursor`와 `max-scan-rows`를 사용한다. `maxWindowRows` 필드 타입 변경과 history 정책 창 변경의 직접 영향이 없다.
- 저장소 내 `maxWindowRows` 프로덕션 설정 지점은 `ZabbixHistoryServiceImpl` 하나뿐이다. 모노레포 전체 재컴파일도 통과했으므로 C6/C8에 소스 호환 회귀는 확인되지 않았다.

## 1콜 동등성 판정

- `maxHeldRows`를 주지 않는 기존 명시 limit, 기간 없음, DESC 조회는 `effectiveLimit` 결과가 종전과 같고 1콜을 유지한다.
- `getRange`도 변경 없이 1콜+100,000 안전핀을 유지한다.
- 새로 `maxHeldRows`를 준 호출은 의도대로 더 작은 limit 또는 무호출이 된다. 다만 R2의 완전성/사유/설정 상한 문제가 있어 이 새 조합까지 “동등하고 정확하다”고 판정할 수는 없다.

## 검증 결과

- `git diff --check`: 오류 없음.
- 핵심 관련 테스트 재실행: `ZabbixQueryExecutorTest`, `ZabbixHistoryServiceImplTest`, `ZabbixMetricAdapterTest` 통과.
- 전체 재실행(`--rerun-tasks`):
  - root `:test`: **3,929 tests / 0 failures / 0 ignored**
  - `:engine-zabbix:test`: **269 tests / 0 failures / 0 ignored**
- 빌드 경고는 기존 deprecated/unchecked 및 `javax.annotation.meta.When` 관련 경고뿐이며 실패는 없었다.
- 검수 전후 미커밋 파일 목록은 동일하다. 구현 코드는 수정하지 않았다.

## 종합 판정

**수정 후 재검수.** 3차 R2는 해소됐고, 기동 검증·기본 정책 창 정합·1콜 limit 반영은 의도대로 들어갔다. 기본 배포 설정, C6, C8, 기존 `maxHeldRows` 미사용 1콜 호출의 직접 회귀도 확인되지 않았다.

병합 차단 사유는 R1 하나다. 동적 남은 예산은 창 확정 전 수량만 묶을 뿐, 전달 중 `windowPages(JsonNode)`와 소비자 `rows(Row)`가 중복 생존해 요청 전체 메모리 상한을 여전히 최대 약 2배까지 열어 둔다. 이 중복 보유를 제거하거나 budget에 포함하고, 콜백 중/후 peak를 잡는 반례 테스트가 추가되기 전에는 병합하지 않는 것이 안전하다.
