## 판정

**반려**

앞·뒤 경계 모델 자체는 올바른 방향이며, 경계 공용화·stage 60 상속·`legacy_hold` 비개입·fail-closed도 대체로 잘 구현됐습니다. 다만 경계 오판 1건과 거짓 정상값·스냅샷 영구 공백·1m 미판정·동일 스냅샷 위반이 남아 있어 배포 승인할 수 없습니다.

## 🔴 필수

- `ApmMetricCoverageReader.java:165-177` — **정렬되지 않은 stage 60 요청에서 첫 부분 시간의 stage 5 marker가 이후 정상 시간까지 전부 오염시킵니다.**
  
  예: 요청 `[10:30, 12:00)`, 5m marker `10:35`. H1 조회는 `10:00` 행을 읽지 않고 `11:00`부터 읽지만, 현재 코드는 marker를 찾은 뒤 `10:00`으로 내려 `incompleteFrom=10:00`을 반환합니다. 결과적으로 `11:00`도 미확정이 됩니다.
  
  stage 60의 upstream 탐색 시작을 실제 첫 포함 H1 버킷인 `ceil(trustedFrom, 60)`으로 정규화하십시오. `10:35`는 제외하고 `11:05` marker는 `11:00` 경계로 반환해야 합니다.

- `ApmSloService.java:288-308` — **뒤쪽만 잘린 경우에도 예산을 내는 규칙은 거짓 정상값을 만들 수 있습니다.**
  
  `incompleteFrom`은 막 닫힌 최신 버킷뿐 아니라 오래된 `BLOCKED` marker도 표현합니다. 현재는 임의로 짧아진 앞쪽 구간의 요청 수로 `errorBudgetTotal`과 `budgetRemainingPct`를 만들면서 필드 이름·스키마는 “창 전체 예산”이라고 말합니다.
  
  최소 수정은 `coverage.hasPrefix() || coverage.hasSuffix()`이면 두 예산 필드를 모두 `null`로 하는 것입니다. 부분값을 유지하려면 `measuredFromMs/measuredToMs`와 “부분 진단값”이라는 별도 계약이 필요합니다. 특히 `suffixReason=BLOCKED`는 반드시 null이어야 합니다.

- `ApmSloSnapshotService.java:197-215`, `ApmSloSnapshotJob.java:46,71` — **업그레이드 뒤 스냅샷 공백이 일시적이지 않고 영구화됩니다.**
  
  일간 데이터가 완전히 신뢰 가능해도 rolling window가 cutover를 포함하면 행 전체를 건너뜁니다. 30일 SLO가 정상화될 무렵 기본 backfill은 7일이어서 초기 약 23일은 자동 복구되지 않습니다.
  
  `dailyMeasured`가 신뢰 가능하면 `good/total/requests`는 저장하고, 미확정인 `budget_remaining`, `burn_1h`, `burn_6h`만 null로 저장하십시오. 세 컬럼은 이미 nullable이므로 Flyway 변경 없이 가능합니다.

- `ApmSloCalculator.java:460-466`, `ApmSloService.java:237-243`, `ApmAvailabilityService.java:196-198`, `ApmRedSeriesExporter.java:274-282` — **M1은 무조건 `COMPLETE`라 업그레이드 직후 짧은 창이 도입 전 원본을 정상값으로 사용합니다.**
  
  5m·30m·1h·6h burn window는 대부분 M1만 읽으므로, 롤업 coverage가 정확해도 `SLO_BURN`이 거짓 발화하거나 거짓 정상 복구할 수 있습니다. 최근 RED export와 availability도 동일합니다.
  
  V70 도입 instant를 다음 1분 경계로 정규화한 raw prefix coverage를 추가하고 M1 소비자에도 적용하십시오. 최소한 burn 평가만이라도 cutover를 가로지르면 `UNMEASURABLE`이어야 합니다.

- `ApmEndpointExporter.java:112-116` — **다운로드 재판정과 숫자가 같은 스냅샷이 아닙니다.**
  
  쓰기 직전에는 coverage만 새 `REPEATABLE_READ`에서 확인하고, 숫자는 이전 `plan()`에서 만든 `plan.state()`를 사용합니다. plan 이후 marker가 생성됐다가 ACK되면 coverage는 정상인데 오래된 집계가 출력될 수 있습니다.
  
  `routeTable` 재조회와 coverage 판정을 하나의 `consistent()` 안에서 수행해 그 결과로 행을 다시 구성하십시오. 재판정 결과가 계획과 달라지면 JSONL `_meta`도 실제 파일과 어긋나므로, endpoint 행에 coverage를 추가하거나 본문 시작 전 최종 계획을 재작성하는 방식도 필요합니다.

## 🟡 권장

- `ApmAvailabilityService.java:196-241,383-420` — M5 dirty marker가 있어도 최신 꼬리는 M1으로 덮어쓰는데 coverage는 전체를 M5 기준으로 막습니다. 거짓 정상값은 아니지만 24h 퍼센트와 최신 칸이 반복적으로 사라질 수 있습니다. `[from, tailTs)`만 M5 coverage를 적용하고 `[tailTs, to)`는 M1 판정을 적용하는 source-segment 방식이 적절합니다.

- `CoverageReaderMocks.java:18-22` — `completeByDefault()`는 이름 그대로 미설정 호출을 정상으로 만들어, 소비자가 coverage 호출을 삭제하거나 잘못된 stage를 써도 다수 테스트가 통과할 수 있습니다. coverage 기본 동작은 `AssertionError`로 두고 각 테스트가 `COMPLETE`를 명시적으로 stub하도록 바꾸거나, 최소한 모든 소비자 테스트에서 호출 stage·범위를 `verify`하십시오.

- `ApmRedSeriesExporter.java:290-296`, `ApmSloCalculator.java:363-366` — 모든 prefix를 `LEGACY_UNVERIFIED`로 축약합니다. `bootstrap_until > cutover` 방어가 실제 발동하면 cutover 이후의 임시 `BOOTSTRAP_PENDING` 구간까지 “업그레이드 이전 자료”로 안내됩니다. 값은 안전하게 비워지지만 원인 안내는 부정확합니다.

## 🟢 참고

- `ApmMetricDirtyStore.java:25-44`에서 롤업과 조회가 동일한 `cutoverBoundary()`를 공유하며, instant→JVM 시간대→다음 stage 경계 변환은 적절합니다.
- `ApmMetricCoverageReader.java:139-181`의 stage 60 앞쪽 경계 상속, `bootstrap_until` 방어, 신뢰 후보 구간 안 marker 탐색, `legacy_hold` 비개입, DB 예외 전파는 의도와 일치합니다.
- `firstIssue`와 APM의 기존 `Issue` 잔존은 검색 결과 0건입니다.
- RED chunk는 `ApmRedSeriesExporter.java:128-139`에서 coverage와 수치를 동일한 짧은 snapshot으로 읽습니다.
- 롤업 coverage가 검출된 경로에서는 Calculator가 `completenessVerified=false`, snapshot이 skip, burn이 `UNMEASURABLE`을 유지합니다. 문제는 M1 우회와 snapshot 영구 공백 정책입니다.
- plan DTO와 JSONL `_meta`의 `untrustedBeforeMs` 추가는 확인했습니다.
- 요청서의 **2,455개 통과 결과는 보고값**이며, 읽기 전용 조건 때문에 이번 검수에서 재실행하지 않았습니다.

## 의견 요청 답

1. **앞쪽 부분 coverage의 예산은 null이 맞습니다.** `measuredFromMs/measuredToMs`를 추가하는 것은 유용하지만, 그 경우에도 기존 `errorBudgetTotal`을 부분값으로 채우면 안 됩니다. 별도 “부분 구간 진단값”이어야 합니다.

2. **뒤쪽만 잘렸다고 예산을 계속 내는 현재 규칙은 안전하지 않습니다.** 최신 일시 marker만이라는 보장이 없고 `BLOCKED`가 같은 모델에 들어옵니다. 현 계약 그대로면 거짓 정상값 위험이 있습니다.

3. **스냅샷 정책 수정은 배포 전 필수입니다.** 단순히 최대 30일 기다리는 문제가 아니라 기본 7일 backfill 때문에 과거 날짜가 영구 누락됩니다. 일간 값과 rolling/burn 값을 분리 저장해야 합니다.

4. **가용성 최신 꼬리는 같은 릴리스에서 보완을 권장합니다.** RT-3 핵심 경계 분리의 승인만 놓고 단독 반려 사유까지는 아니지만, M1으로 실제 값을 덮어쓰면서 M5 marker로 다시 null 처리하는 것은 source 선택과 coverage가 불일치한 상태입니다.

5. **1m 미판정 위험도는 높음입니다.** 특히 짧은 burn window와 알람은 모두 M1이어서 거짓 발화·거짓 정상 복구가 가능합니다. 기존 설치본 업그레이드를 지원한다면 배포 전 차단해야 합니다.

## 테스트 공백

- stage 60 요청 시작이 정각이 아닌 경우:
  - `[10:30,12:00)` + marker `10:35`는 정상 `11:00`을 자르지 않아야 함.
  - marker `11:05`는 `incompleteFrom=11:00`이어야 함.
- 오래된 `BLOCKED` suffix가 창 중간에 있을 때 SLO 예산 필드가 null인지.
- 업그레이드 뒤 30일 동안 실제 snapshot scheduler 기본 `backfillDays=7`을 모사해 일간 값이 영구 누락되지 않는지.
- M1 범위의 전부 pre-cutover / 경계 통과 / 전부 post-cutover:
  - burn 5m·30m·1h·6h
  - availability
  - SLO series
  - RED·endpoint export
- endpoint에서 plan과 write 사이에 marker 생성→ACK 및 집계값 변경이 발생해도 coverage·숫자·JSONL meta가 같은 상태를 설명하는지.
- coverage 호출을 제거하거나 stage를 바꾸면 소비자 테스트가 실패하는 mutation 테스트. 현재 `completeByDefault()`는 이 회귀를 숨깁니다.
- `bootstrap_until > cutover`인 상태에서 marker까지 함께 존재할 때 경계와 사용자-facing reason 검증.
- `ApmLegacyUpgradeCoverageIT`의 고정 DB 이름을 사용한 동시 실행 충돌 및 `-Dit.db.required=true` 출시 게이트 실행.
