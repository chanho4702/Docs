# 검수 요청 — ZM-159 C5 메트릭 조회 완전성 + 인터페이스 차트 잔여 잘림 (구현)

- 요청: Claude · 2026-09-19 · 사용자 "코덱스 시켜가면서"
- BE 워크트리 `C:/worktrees/zm-159-be`(브랜치 `ZM-159`) · **미커밋 변경 전부가 이번 범위**(파일 11개, +535/−123)
- 설계: `_workspace/designs/devdesign_zm-159-c5-metric-completeness.md` **v1**
  (설계 검토 `review_zm-159-c5-design_codex.md` R1~R7 반영 — 특히 R3에 따라 "잘림 감지 후 대체"가 아니라 **원시를 쪼개 끝까지 읽기**로 방향을 바꿨다)

## 범위
| 층 | 변경 |
|---|---|
| engine-api | `HistoryScanResult(points, complete, stopReason)` · `SeriesResult(series, complete, stopReason, deliveredPoints)`(불변식 `complete ⇔ stopReason=COMPLETE`를 생성자에서 강제) · `ZabbixHistoryService.scanHistoryByItemids` · `MetricPort.querySeriesResult`(abstract) |
| engine-zabbix | **`ZabbixQueryExecutor`: 창 크기를 대상 id 수에 반비례해 넓힌다**(`adaptiveWindowSeconds`, 상한 하루) — 1콜 크기 약속(`id 수 × 창`)은 그대로 두고 콜 수만 줄인다. 정책 창이 이미 하루 이상인 trend.get은 불변. `ZabbixHistoryServiceImpl`이 `ZabbixQueryExecutor.scanWindows` 사용(창 × itemid 묶음 분할, `maxTotalRows=DEFAULT_HISTORY_LIMIT(10만)`), 명시 limit·기간 없는 호출은 종전 1콜 유지, 합친 뒤 시각순 정렬(DESC 지원), `getRange`도 분할. `ZabbixMetricAdapter`: 구현 정본을 `querySeriesResult`로 옮기고 `querySeries`는 `.series()` 통로, RAW는 히스토리 타입별 조회 중 하나라도 불완전이면 전체 불완전 |
| app | `LicenseGuardedMetricPort.querySeriesResult` 가드 위임 · `InterfaceService`: 상태 기계(긴 창=요약→원시→빈 결과 / 짧은 창=원시→요약 1회→빈 결과), 원시는 임시 맵에 세고 **한 묶음이라도 불완전하면 전부 버리고 남은 묶음 미조회** |
| 테스트 | `ZabbixHistoryServiceImplTest` 재작성(9, 가짜 자빅스가 itemids·time_from/till·limit를 실제 의미대로 적용) · `ZabbixMetricAdapterTest` 스텁 전환 · `InterfaceServiceTest` +3(12) |
- `./gradlew :test :engine-zabbix:test` 전부 통과(2026-09-19).

## 중점 확인 요청
1. **동작 동등성**: 분할 전후로 같은 포인트 집합이 나오는가 — 창 경계(양 끝 포함)에서 중복·누락, itemid 묶음 경계, 같은 시각 다중 행의 순서(안정 정렬에 기댄다), `getRange`의 값 파싱(`asDouble(0)`) 유지.
2. **정렬 비용**: 합친 뒤 `Instant.parse`로 정렬한다 — 10만 포인트에서 비용·정확성(문자열 파싱 대신 epoch 보관이 나은가). `HistoryPoint.timestamp`가 ISO 문자열인 기존 계약을 바꾸지 않으려는 선택이다.
3. **예산 선택**: 보유 예산을 `DEFAULT_HISTORY_LIMIT(10만)`으로 하드코딩했다(설정 키 없음). 전역 `max-total-rows(50만)`/`max-held-rows(1만)`와의 관계가 맞는가 — 흘려보내기가 아니라 **전량 보유**라 `max-held-rows`를 크게 벗어난다는 점 포함.
4. **완전성 전파**: 어댑터에서 히스토리 타입이 여럿일 때 "하나라도 불완전 → 전체 불완전"이 옳은가(부분 계열만 정확한 결과를 주는 편이 나은 소비자가 있는가). `deliveredPoints`의 뜻(버린 행 제외)이 쓸모 있는가.
5. **상태 기계**: 긴 창에서 요약이 비고 원시가 불완전하면 빈 결과인데, 이때 화면은 아무 문구 없이 빈 차트다 — 허용 가능한가(문구는 응답 계약 변경이라 범위 밖으로 뒀다). 짧은 창에서 요약으로 대체하면 값의 뜻이 "그 시간의 최악 상태"로 바뀌는 것을 warn만으로 두는 것.
6. **호출 수 / 창 확대 규칙(직접 고친 지점, 중점)**: 창 1시간 고정이면 30일 차트가 아이템당 720콜이 되어
   `adaptiveWindowSeconds`를 넣었다 — `창 = min(정책창 × (max-ids ÷ 묶음 크기), 하루)`.
   ① 이 규칙이 "1콜 행 수 ≈ id × 시간"이라는 전제 위에서 타당한가(주기가 촘촘한 아이템은 전제가 깨진다).
   ② 넘치면 실행기가 응답을 버리고 다시 쪼개므로 **헛읽기**가 생긴다 — 하루 상한이 그 손해를 충분히 막는가
   (1초 주기 = 하루 86,400행 < 행 상한 10만이라는 계산에 기댄다).
   ③ 이 변경이 `scanByIds`(기간 없음)·`scanByCursor`·이미 검수 끝난 C6/C8 경로에 영향이 없는가.
   ④ 30일 창이면 여전히 30콜 × 묶음 수다 — `max-calls(2000)`·`deadline(120초)` 안에 드는가, 인터페이스 차트의
   `MAX_RAW_CALLS(20)`(포트 수 기준)이 이 분할을 고려해야 하는가.
7. 테스트가 위를 실제로 고정하는가.

## 출력 형식
- 발견마다 `R번호 · 심각도(필수/권장/참고) · 파일:줄 · 문제 · 재현/근거 · 제안`. 확인 못 한 것은 "추정".


---

## 반영 기록 (2026-09-19, 코덱스 gpt-5.6-sol high → `review_zm-159-c5_codex.md`)
판정: **수정 후 재검수**(차단 R1·R2). 전건 검토해 아래와 같이 반영했다.

| 번호 | 판정 | 반영 |
|---|---|---|
| **R1 필수** | **실제 결함 — 확인** | 보유 상한과 받은 행 예산이 같은 값(10만)이라, 상한을 넘친 조각을 버리고 창을 쪼개기 <b>전에</b> `rowsSeen > maxTotalRows`가 먼저 걸려 `BUDGET_ROWS`로 끝났다 = "쪼개 끝까지 읽기"가 운영값에서 한 번도 동작하지 않았다. 둘을 분리했다 — 받은 행 예산은 전역 `max-total-rows`(50만) 그대로 두고, **보유 상한은 설정 키 `zabbix.call.max-history-rows`(기본 10만)**로 승격해 소비자(수집 람다)가 직접 강제한다(초과 시 내부 신호로 스캔 중단 → `stopReason=HELD_ROWS`). 재현 테스트 `splitStillWorksWhenHeldCapEqualsRowCap`(1콜 상한 == 보유 상한 조합)·`heldCapStopsAndReportsIncomplete` 추가 |
| **R2 필수** | **실제 결함 — 확인** | `getHistoryByItemids`·`getRange`를 **종전 1콜 그대로 되돌렸다**. 두 소비자가 실제로 깨졌다 — `ItemsService`는 "응답이 정확히 10만이면 잘린 것"으로 판정했고(분할 후 8만에서 멈추면 잘린 원시를 정상으로 채택), `HostService`는 DESC로 받아 잘려도 **최신** 구간이 남는 데 기댄다(분할은 과거→현재라 옛 구간이 남는다). 분할은 완전성을 함께 돌려주는 `scanHistoryByItemids`에만 있고, 그마저 **DESC·명시 limit·기간 없음은 1콜로 우회**한다. 1콜이 상한에 닿으면 `complete=false`(`ROW_CAP`)로 표시한다. `ItemsService`는 새 API로 이전해 완전성으로 판정하도록 고쳤다 |
| **R3 권장** | 반영 | 창 확대에 **밀도 상한**을 더했다 — `창 ≤ max(정책창, 1콜 행 상한 ÷ 묶음 크기)`. 아이템이 2개면 넓힘이 절반으로 줄어 "1초 주기여도 행 상한 안"이라는 근거가 id 수와 무관하게 성립한다. 테스트 2건(`windowWidensProportionallyToChunkFill`·`densityCapLimitsWidening`) |
| **R4 권장** | **부분 반영(잔여는 후속)** | `MAX_RAW_CALLS`가 세는 것은 포트 호출 수이고 그 안의 RPC 수는 아니라는 지적이 맞다. 다만 app 모듈은 엔진 정책(창·묶음)을 **볼 수 없다**(빌드가 의존을 막는다) — 정확한 RPC 추정은 포트 계약에 예산을 싣는 설계 변경이 필요하다. 이번엔 창 확대로 RPC 수 자체를 크게 줄이는 데 그치고, 요청 단위 공통 예산은 후속 티켓으로 남긴다 |
| **R5 권장** | 반영(일부 후속) | 보유 상한을 설정 키로 승격(R1과 같은 변경). 어댑터가 히스토리 타입마다 각각 상한을 적용해 최악 2배(FLOAT+UNSIGNED)가 되는 점은 남는다 — 타입은 실질 2종이고 불완전 타입을 만나도 나머지를 계속 읽는 편이 판정에 필요해 이번엔 유지하고 문서화한다 |
| **R6 권장** | 반영 | 정렬을 `Instant.parse` 비교에서 **epoch(long) 비교**로 바꿨다(내부 `Row`에 epoch 보관 → 정렬 후 한 번만 ISO 문자열 생성). 같은 시각 행의 상대 순서는 계약이 아님을 Javadoc에 명시 |
| **R7 필수** | 반영 | R1·R2 재현 테스트 추가(위), cap−1 추가, DESC 비분할, `getRange` 1콜 계약, 밀도 상한 2건. `ItemsService` 회귀 테스트를 완전성 축으로 이전. 어댑터의 불완전 전파·`querySeriesResult` 1회 위임은 남은 항목으로 기록 |
| **R8 참고** | 동의(범위 밖) | 빈 차트·요약 대체를 화면에 알리는 것은 응답 계약 변경이라 C7 후속으로 유지 |


---

## 재검수 v2 반영 기록 (2026-09-19, `review_zm-159-c5-v2_codex.md` → 차단 유지 R1·R2·R4)

| 번호 | 판정 | 반영 |
|---|---|---|
| **R1(v2) 필수** | **실제 결함 — 확인** | `history.get`의 1콜 행 상한(10만)과 보유 상한(10만)이 같아, "한 조각이 넘쳤다 = 전체가 이미 보유 상한 초과"가 되어 **쪼개 읽어도 완주할 수 없었다**. 1콜 행 상한을 **1만**으로 낮췄다(`DEFAULT_POLICIES`). 이제 한 조회가 최대 10묶음까지 모을 수 있고, 헛읽기 손해도 1만 행으로 줄었다. 두 값의 관계를 Javadoc에 못 박고 **기본값 관계를 검사하는 테스트**(`defaultPolicyKeepsRowCapBelowHeldCap`)를 넣었다. 지적대로 종전 R1 테스트는 넘침을 만들지 않았다 — `overflowActuallySplitsAndCompletes`(1콜 상한+1 행 → `limit=상한+1` 응답 → 실제 재분할 → 완주)와 `heldCapEqualToRowCapCannotComplete`(같으면 `HELD_ROWS`)로 교체 |
| **R2(v2) 필수** | **실제 결함 — 확인** | 실행기가 창을 확정하기 전 `windowPages`에 쌓는 버퍼는 보유 상한 밖이었다. `WindowScan.maxWindowRows`를 신설해 **확정 전 버퍼도 같은 상한**으로 묶고, 넘으면 창을 반으로 쪼갠다(더 못 쪼개면 `NO_PROGRESS`). 실행기 테스트 2건 추가. 어댑터의 타입별 누적(최악 2배)은 `HistoryGetParams.maxHeldRows`(요청별 남은 예산)를 신설해 **요청 전체가 하나의 예산을 나눠 쓰도록** 고쳤다(테스트 `querySeriesResult_passesRemainingHeldBudgetToLaterTypes`) |
| **R3(v2) 권장** | 반영 | 창 규칙을 "정책창 × 배율"에서 **밀도 기반 단일 공식**으로 바꿨다 — `창 = clamp(1콜 행 상한 × 가정 주기(60초) ÷ 묶음 크기, 정책창, 하루)`. 묶음이 꽉 차면 정책창으로 수렴한다. 지적대로 이것은 **보장이 아니라 가정**임을 Javadoc에 명시했다 — 넘쳐도 손해는 1콜 행 상한만큼의 헛읽기뿐이고, R1 수정으로 그 뒤 분할이 실제로 완주한다 |
| **R4(v2) 필수** | 반영 | 가짜 자빅스가 **`sortorder`를 limit보다 먼저 적용**하도록 고쳐 DESC "최신 구간 유지"를 실제로 검증한다. 추가: scan의 명시 limit 우회, `getRange` 값 폴백(`asDouble(0)`), 같은 시각 다중 아이템 multiset + 시간 단조성, 어댑터의 타입 하나만 불완전 → 전체 불완전·`stopReason`·`deliveredPoints`, `querySeries` 얇은 통로 동등성, 라이선스 ACTIVE에서 `querySeriesResult` 1회 위임 |
| 남긴 것 | — | ① 1콜 요청 body를 HEAD와 바이트 비교하는 테스트(코드 비교로는 동등 확인됨) ② 27/28/200개 경계의 헛읽기 횟수 측정 ③ 요청 단위 공통 RPC 예산(R4-v1, app이 엔진 정책을 볼 수 없어 포트 계약 변경 필요) — 전부 후속 |


---

## 3차 검수 반영 기록 (2026-09-19, `review_zm-159-c5-v3_codex.md` → 차단 R1·R2)
v3에서 "기존 R1(분할 완주 불가)과 R4(테스트 공백)는 해소"로 확인됐고, 남은 차단 2건과 권장 3건을 반영했다.

| 번호 | 판정 | 반영 |
|---|---|---|
| **R1(v3) 필수** | **실제 결함 — 확인** | `maxWindowRows`가 고정값이라 "소비자가 이미 쌓은 양 + 실행기 창 버퍼"가 상한의 <b>2배</b>까지 갈 수 있었다. 필드를 **`IntSupplier`(남은 양)**로 바꿔 매 판정마다 `보유 상한 − 이미 쌓은 포인트`를 묻는다. 실행기 테스트 `windowBufferBudgetIsSharedWithConsumer`가 "전달 순간의 (쌓은 양 + 페이지)"가 한 번도 상한을 넘지 않음을 고정한다. 예산 소진으로 못 쪼갠 경우 사유를 `HELD_ROWS`로 정정 |
| **R2(v3) 필수** | **실제 결함 — 확인** | 어댑터가 설정값 대신 계약 상수(10만)로 남은 예산을 계산해, `max-history-rows`를 낮추면 타입 합계가 설정 상한을 넘었다(예: 5만 설정에 9만 보유). 어댑터에 `ZabbixCallLimits`를 주입해 **설정값을 정본**으로 쓴다(어댑터도 engine-zabbix라 주입에 문제 없다) |
| **R3(v3) 권장** | 반영 | `history.get.max-rows < max-history-rows`를 **기동 시 검증**한다(`requireHistoryRowCapBelowHeldCap`) — 잘못된 설정은 기동 실패. 테스트를 "잘못된 조합은 거부된다"로 교체 |
| **R4(v3) 권장** | 반영 | 1콜 상한을 1만으로 낮추면서 정책 창(3,600초)이 상한과 어긋나, 꽉 찬 묶음은 **매 창마다 넘쳐 헛읽기 후 분할**하게 되는 것을 발견했다(지적이 가리킨 RPC 증가의 실제 원인). 정책 창을 **3,000초**로 맞췄다 — `200개 × 3,000초 ÷ 1분 = 1만 행`(= 행 상한)으로 정확히 짝이 맞는다. 두 값이 짝이어야 한다는 것을 양쪽 Javadoc에 명시 |
| **R5(v3) 권장** | 반영 | `maxHeldRows`가 1콜 우회 경로에서 무시되던 것을 고쳤다 — 요청 `limit`에 반영하고(`effectiveLimit`), 예산이 0이면 호출하지 않는다(자빅스에 `limit=0`은 "무제한"으로 읽힐 수 있다) |


---

## 4차 검수 반영 기록 (2026-09-19, `review_zm-159-c5-v4_codex.md` → 차단 R1)
v4에서 3차 R2(어댑터 설정값)는 해소 확인. 남은 차단 1건과 권장 3건을 반영했다.

| 번호 | 판정 | 반영 |
|---|---|---|
| **R1(v4) 필수** | **부분 결함 — 확인** | 두 구간이 남아 있었다. ① **전달 중**: 원본 `JsonNode` 버퍼 전체를 붙든 채 소비자가 같은 행을 복제 → 전달한 페이지를 **즉시 놓아주도록**(`windowPages.set(i, null)`) 고쳐 겹치는 양을 페이지 하나로 줄였다. ② **수신 순간**: 페이지를 받은 뒤에 상한을 보니 일시적으로 초과 → 이번 콜의 상한을 **"정책 상한과 남은 자리 중 작은 쪽"**으로 낮춰 요청하고, 넘침 판정도 같은 값으로 한다(작은 상한에 닿은 응답을 정상으로 보면 조용히 잘린다). 이제 초과는 판정용 +1행뿐이다 |
| **R2(v4) 권장** | 반영 | 우회(1콜) 경로의 완전성 계약을 정리했다 — 유효 상한 = `min(요청 N 또는 안전핀, 보유 예산)`, 상한에 닿았을 때 **호출자가 요청한 N을 채운 것만 완전**, 우리가 건 상한이면 불완전(`HELD_ROWS`/`ROW_CAP`). `maxHeldRows` 미지정이면 scan 경로는 **설정값**을 쓴다. 🔴 레거시 `getHistoryByItemids`·`getRange`는 종전 안전핀 그대로다(설정값을 끌어오면 요청 body가 달라진다) — 이를 고정하는 테스트 추가 |
| **R3(v4) 권장** | 인지·문서화 | 저장소 설정에는 두 키의 오버라이드가 없어(직접 확인) 기동 실패는 나지 않는다. 외부(환경변수·Vault)에서 옛 `max-rows=100000`을 고정한 환경은 배포 전 점검이 필요하다 — **배포 주의사항**으로 보고서에 남긴다 |
| **R4(v4) 참고** | 수용 | 희소 데이터 + 꽉 찬 묶음(167~200개)에서 RPC가 약 20% 늘지만, 주 경로(1분 밀도)에서는 하루 72콜 → 29콜로 준다. 실측은 후속 |


---

## 5차 검수 결과 (2026-09-19, `review_zm-159-c5-v5_codex.md`) — ✅ **병합 승인 가능(필수 0건)**
4차 차단 R1 해소 확인. C6 trend(`maxWindowRows` 미설정·정책 창 하루)와 C8 alert(`scanByCursor`)는 이번 변경의 영향이 없음도 확인됐다. 비차단 권장 3건 처리:

| 번호 | 처리 |
|---|---|
| R1(v5) 권장 | **반영** — 보유 자리가 0인데 읽을 행이 남으면 쓸모없는 이진 분할 없이 즉시 종료. 더 못 쪼개는 넘침도 원인을 구분해 "정책 상한"이면 `NO_PROGRESS`, "남은 보유 자리"면 `BUDGET_ROWS`로 알리고, 이력 서비스가 후자를 `HELD_ROWS`로 옮긴다 |
| R2(v5) 권장(낮음) | **후속** — "전달한 페이지가 실행기 목록에서 해제되는가"를 고정하는 테스트. 관측 지점이 필요해(결과에 최대 버퍼량을 싣는 등) 별도로 다룬다. 현재는 구현의 참조 해제 순서로만 보장 |
| R3(v5) 권장(낮음) | **반영** — 설정 키 목록에 `zabbix.call.max-history-rows` 추가, **기동 실패 조건**을 클래스 Javadoc에 명시. 🔴 배포 주의: 외부(환경변수·Vault)에 옛 `policy.history.get.max-rows=100000`을 고정한 환경은 올리기 전에 두 값을 함께 조정해야 한다 |
