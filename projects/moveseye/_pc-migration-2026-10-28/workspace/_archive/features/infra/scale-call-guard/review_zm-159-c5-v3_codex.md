# ZM-159 C5 3차 검수

- 검수 대상: `C:\worktrees\zm-159-be`의 현재 미커밋 변경 17개 추적 파일 + 신규 파일 2개
- 비교 기준: `HEAD` 대비 diff, `review_zm-159-c5-v2_codex.md`, `review_zm-159-c5.md` 하단 `재검수 v2 반영 기록`
- 검수일: 2026-09-19
- 코드 수정 없음. 이 검수 문서만 작성했다.

## 결론

**수정 후 재검수 — 차단 유지.**

기존 R1은 운영 기본값에서 해소됐다. `history.get` 1콜 상한이 10,000으로 낮아져 보유 상한 100,000보다 작고, 실제 `maxRows+1` overflow 후 창을 재분할해 완주하는 테스트도 생겼다. 기존 R4에서 요구한 핵심 테스트(실제 overflow, DESC 최신 subset, 명시 limit 우회, `getRange` 폴백, 동일 epoch 보존, 어댑터 불완전 전파, 라이선스 ACTIVE 1회 위임)도 추가됐다.

그러나 기존 R2의 본질인 **요청 전체 메모리 보유 상한**은 아직 해소되지 않았다. `maxWindowRows`는 실행기의 창 버퍼 하나만 제한하고, 서비스가 앞선 창에서 이미 누적한 `rows`와 예산을 공유하지 않는다. 정상적으로 상한에 딱 맞는 창 버퍼는 그대로 소비되므로 누적 `Row`와 `JsonNode` 창 버퍼가 동시에 최대 약 2배까지 존재할 수 있다. 또한 어댑터는 설정된 `max-history-rows`가 아니라 고정 100,000을 기준으로 히스토리 타입 간 남은 예산을 계산해, 운영자가 상한을 낮추면 FLOAT+UNSIGNED 합계가 설정 상한을 넘는다. 두 문제 모두 새 변경이 약속한 상한의 핵심 경계이므로 병합 차단이다.

## 발견 사항

### R1 · 필수 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:211-215,269-296`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:82-113`

**문제** · `maxWindowRows`는 확정 전 창 버퍼만 별도로 제한할 뿐, 서비스가 이미 누적한 `rows`와 합친 **요청 전체 보유량**을 같은 상한 안에 묶지 못한다. 기존 v2 R2는 미해소다.

**근거** · 서비스는 요청 시작 때 계산한 `heldCap`을 모든 창에 동일하게 `.maxWindowRows(heldCap)`으로 넘긴다. 실행기는 각 창마다 `windowBufferedRows=0`에서 다시 시작하고, `windowBufferedRows > maxWindowRows`일 때만 분할한다. 따라서 앞선 창들에서 서비스의 `rows`가 이미 `heldCap-1`개인 상태에서도 다음 창이 정확히 `heldCap`개를 버퍼링하면 분할되지 않는다. 292~296행의 소비 단계에는 전체 `windowPages`가 계속 살아 있고, 소비자는 `rows`를 `heldCap`까지 채운 뒤 다음 행에서야 `HeldRowsExceeded`를 던진다. 이 순간 메모리에는 최대 약 `heldCap`개의 `Row`와 `heldCap`개의 `JsonNode`가 동시에 남는다. 새 페이지를 추가한 뒤 272행에서 초과를 검사하므로 분할을 결정하는 순간에도 버퍼가 일시적으로 `heldCap + 현재 페이지`까지 올라간다.

현재 `windowBufferCapSplitsWindow` 테스트는 소비자에게 전달된 **개별 페이지 크기**만 `<=2`인지 검사한다. 앞선 창에서 이미 누적한 소비자 보유량과 다음 창 버퍼의 합계를 관찰하지 않아 이 반례를 잡지 못한다.

**제안** · 실행기와 소비자가 같은 요청 단위 held budget을 공유하게 한다. 예를 들어 `WindowScan`에 고정 `maxWindowRows`가 아니라 현재 소비자 보유량을 반영할 수 있는 남은 예산 공급자/예산 객체를 넘기고, 다음 창은 `heldCap - committedRows` 이하만 버퍼링하도록 한다. 최소한 창 확정 직전 버퍼와 이미 누적한 결과의 합계를 검사해야 한다. 통합 테스트는 첫 창에서 `heldCap-1`개를 확정한 뒤 다음 창에 `heldCap`개를 만들고, 두 저장소의 합산 최대치와 종료 사유를 고정해야 한다.

### R2 · 필수 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/metric/ZabbixMetricAdapter.java:165-194`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:82-84`

**문제** · 히스토리 타입 간 남은 예산을 설정값이 아닌 계약 상수 100,000으로 계산한다. `zabbix.call.max-history-rows`를 낮춘 환경에서는 요청 전체 보유량이 설정 상한을 넘는다.

**근거** · 어댑터의 `remainingHeldRows`는 항상 `ZabbixHistoryService.DEFAULT_HISTORY_LIMIT(100_000) - alreadyHeld`를 반환한다. 서비스의 `min(params.maxHeldRows(), limits.getMaxHistoryRows())`는 **각 타입 호출별** 상한일 뿐 요청 전체 합계를 알지 못한다. 예를 들어 `max-history-rows=50,000`에서 FLOAT가 40,000점을 완전하게 반환하면, 어댑터는 UNSIGNED에 60,000의 남은 예산을 넘기고 서비스는 이를 50,000으로 줄인다. 최종 보유량은 90,000점으로 설정 상한 50,000을 초과한다. 반대로 설정을 100,000보다 크게 올려도 어댑터는 100,000에서 잘라 설정 확장이 적용되지 않는다.

추가된 `querySeriesResult_passesRemainingHeldBudgetToLaterTypes`는 첫 호출의 cap에서 2를 뺐는지만 검증하고, 서비스 설정값과 어댑터 기준값이 다른 경우를 검증하지 않는다.

**제안** · 요청 전체 예산의 정본을 고정 계약 상수가 아니라 실제 `ZabbixCallLimits#getMaxHistoryRows()`로 단일화한다. 모듈 경계를 유지해야 한다면 서비스가 유효 상한/남은 예산을 포함한 요청 단위 budget handle을 제공하거나, 어댑터가 설정 중립적인 단일 다중-type 조회 계약을 호출하게 한다. `max-history-rows=50,000`과 `150,000` 양쪽에서 두 타입 합계와 두 번째 호출의 cap을 검증해야 한다.

### R3 · 권장 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:62-75,101-114,145-154,180-190`, `engine-zabbix/src/test/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImplTest.java:312-319`

**문제** · `history.get.max-rows < max-history-rows` 관계는 기본값 테스트로만 고정됐고, 설정 오버라이드에는 강제되지 않는다.

**근거** · 생성자는 각 값을 양수로만 검증하고 메서드 정책도 개별 필드의 양수 여부만 확인한다. 따라서 `zabbix.call.policy.history.get.max-rows=100000`, `zabbix.call.max-history-rows=100000` 또는 더 작은 보유 상한을 설정해도 기동은 성공한다. 주석은 이 관계가 깨지면 overflow 분할 완주가 불가능하다고 명시하고, 클래스 설명은 잘못된 설정이면 기동 실패한다고 약속한다. 새 테스트는 `ZabbixCallLimits.defaults()`만 보므로 운영 설정 회귀를 막지 못한다.

**제안** · 모든 정책을 해석한 뒤 history 정책의 `maxRows < maxHistoryRows`를 기동 시 검증하고, 같음/역전 설정이 실패하는 테스트를 추가한다. 의도적으로 허용할 것이라면 “분할 완주 불가지만 안전하게 불완전 종료”라는 설정 계약으로 문서화해야 한다.

### R4 · 권장 · `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixCallLimits.java:70-75`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/client/ZabbixQueryExecutor.java:442-465`

**문제** · 1콜 상한 하향은 분할 가능성을 복구하지만, 다수 itemid의 희소 데이터 조회에서는 RPC 수를 최대 약 8배 늘린다. 기능 회귀는 아니지만 deadline/call budget 여유를 확인할 부하 근거가 없다.

**근거** · 기본 200개 청크에서 이전 100,000행 공식은 목표 창이 `100000×60÷200=30,000초`였고, 현재 10,000행 공식은 `3,000초`가 정책 하한 3,600초로 clamp된다. 하루 조회는 대략 3콜에서 24콜로 증가한다. 데이터가 조밀하면 보유 상한에 일찍 걸려 의도대로 불완전 종료하지만, 희소 데이터는 결과 행 수가 100,000 미만이어도 RPC latency 때문에 `deadline-ms=120000`에 먼저 닿을 수 있다. 반면 itemid 1개는 하루 상한으로 유지되고, 명시 limit/DESC/기간 없는 `getHistoryByItemids`와 `getRange`는 레거시 1콜 경로라 영향이 없다.

**제안** · 1/50/200 itemid × 6시간/1일/30일의 희소·1분 밀도 시나리오에서 RPC 수와 deadline 종료 사유를 고정하거나 실측한다. 현재 값을 유지한다면 200개 청크의 예상 호출 증가를 운영 문서와 메트릭에 남긴다.

### R5 · 권장 · `engine-api/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/model/HistoryGetParams.java:7-21`, `engine-zabbix/src/main/java/com/dmove/moveseye/zabbix/timeseries/history/ZabbixHistoryServiceImpl.java:65-84`

**문제** · 공개 계약의 `maxHeldRows`는 “이 조회가 보유할 포인트 상한”으로 설명되지만, 명시 limit·기간 없음·DESC 등 1콜 우회에서는 완전히 무시된다.

**근거** · `scanHistoryByItemids`는 65~76행에서 먼저 `legacySingleCall`로 반환하고, `maxHeldRows`를 읽는 코드는 82행 이후에 있다. 현재 어댑터는 ASC+기간+limit 없음만 사용하므로 당장 R2의 주 경로에서는 발생하지 않지만, 다른 호출자가 `maxHeldRows=1_000`과 `limit=100_000` 또는 DESC를 함께 주면 최대 100,000점을 보유할 수 있다. 필드 Javadoc만 보면 이 예외를 알 수 없다.

**제안** · 1콜 우회에서도 `maxHeldRows`를 요청 limit과 결과 보유량에 적용하거나, 필드명을 분할 스캔 전용으로 좁히고 Javadoc/검증에서 우회 조합을 거부한다. 최소한 명시 limit·DESC·기간 없음 각각의 경계 테스트를 둔다.

## 기존 차단 항목 재판정

### 기존 R1 — 기본값 기준 해소

- 기본 `history.get.max-rows=10,000`, `max-history-rows=100,000`으로 관계가 분리됐다.
- `overflowActuallySplitsAndCompletes`가 첫 호출의 `limit=maxRows+1`, 실제 호출 수 증가, 최종 완전을 함께 검증한다.
- `heldCapEqualToRowCapCannotComplete`도 `HELD_ROWS`를 검증한다.
- 단, 설정 오버라이드 관계는 강제되지 않는다(R3).

### 기존 R2 — 미해소, 차단 유지

- `windowPages` 자체에 `maxWindowRows`를 추가한 방향은 맞고, 단일 창 버퍼가 과대해지면 재분할한다.
- 그러나 이미 누적한 서비스 `rows`와 창 버퍼가 같은 budget을 공유하지 않아 요청 전체 메모리는 상한 밖이다(R1).
- 히스토리 타입 간 총량도 기본 100,000에서는 맞지만 설정값이 다르면 깨진다(R2).

### 기존 R4 — 주요 공백 해소, 새 경계 공백 잔존

해소 확인:

- 실제 overflow 후 재분할 완주와 `heldCap==maxRows` 불완전
- 가짜 Zabbix의 sortorder-before-limit 및 DESC 최신 subset
- scan의 명시 limit 1콜 우회
- `getRange` 비숫자 0 폴백
- 동일 epoch 다중 행 multiset과 시간 단조성
- FLOAT/UNSIGNED 일부 불완전의 전체 전파, stopReason, deliveredPoints, `querySeries` 얇은 통로
- 라이선스 ACTIVE의 `querySeriesResult` 정확히 1회 위임

잔존 공백:

- 누적 `rows` + `windowPages`의 합산 최대 보유량(R1)
- 비기본 `max-history-rows`에서 타입 간 총량(R2)
- 설정된 per-call/held 관계 역전의 기동 실패(R3)
- `maxHeldRows`와 1콜 우회 조합(R5)

## 기존 C6/C8 스캔 영향

- `maxWindowRows`는 현재 `ZabbixHistoryServiceImpl`만 설정한다. C6의 `trend.get`은 이 필드를 넘기지 않고 기본 정책 창도 하루라 `adaptiveWindowSeconds`의 조기 반환으로 기존 1일 창이 유지된다.
- C8 대량 알람은 `scanByCursor`와 `max-scan-rows` 경로를 사용하므로 `maxWindowRows`와 `history.get` 1콜 상한 하향의 직접 영향이 없다.
- 공용 `scanWindows`의 선택 필드 추가 자체로 C6/C8 동작이 바뀌는 경로는 확인되지 않았다.

## 검증 결과

- `git diff --check`: 오류 없음.
- 관련 테스트 재실행: `ZabbixHistoryServiceImplTest`, `ZabbixQueryExecutorTest`, `ZabbixMetricAdapterTest`, `ItemsServiceLongRangeTest`, `InterfaceServiceTest`, `LicenseGuardedPortTest` 통과.
- 전체 재실행(`--rerun-tasks`):
  - root `:test`: **3,929 tests / 0 failures / 0 errors / 0 skipped**
  - `:engine-zabbix:test`: **268 tests / 0 failures / 0 errors / 0 skipped**
- 빌드 경고는 기존 deprecated/unchecked 및 `javax.annotation.meta.When` 관련 경고뿐이며 실패는 없었다.
- 검수 전후 `C:\worktrees\zm-159-be`의 미커밋 파일 목록은 동일하다. 구현 코드는 수정하지 않았다.

## 종합 판정

**수정 후 재검수.** 기존 R1의 기본값 논리 충돌과 기존 R4의 핵심 테스트 공백은 해소됐다. 1콜 상한 하향이 레거시 1콜 경로나 C6/C8 스캔을 직접 바꾸지는 않지만, 다수 itemid 희소 조회의 RPC 증가는 별도 실측이 필요하다.

병합 차단 사유는 두 가지다. 첫째, `maxWindowRows`가 소비자 누적 결과와 예산을 공유하지 않아 기존 R2의 “요청 전체 보유 상한”을 보장하지 못한다. 둘째, 어댑터가 고정 100,000을 기준으로 타입 간 남은 예산을 계산해 비기본 `max-history-rows` 설정에서 총 보유 상한을 위반한다. 이 둘을 요청 단위 공통 budget으로 묶고 해당 반례 테스트를 추가하기 전에는 병합하지 않는 것이 안전하다.
