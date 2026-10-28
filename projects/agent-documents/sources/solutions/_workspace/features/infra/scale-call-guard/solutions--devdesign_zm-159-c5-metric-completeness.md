# ZM-159 C5 — 메트릭 조회 완전성 계약 + 인터페이스 차트 잔여 잘림 · 설계 v1

- 작성 2026-09-19 · 상위 설계 §0.7 C5·C7 · 워크트리 BE `C:/worktrees/zm-159-be`(ZM-159)
- 선행: 알람 이력은 C8에서 `AlertScanOutcome`으로 완전성을 돌려주게 됐다. 메트릭 쪽에는 그 통로가 없다.

## 1. 현상
- 원시 시계열은 `ZabbixHistoryServiceImpl`이 `limit = DEFAULT_HISTORY_LIMIT(10만)`을 걸어 받는다. 상한에 닿으면 **warn 로그만** 남고 값은 잘린 채 올라온다.
- `ZabbixMetricAdapter.querySeries`는 `List<Series>`만 돌려주므로 **소비자는 잘렸는지 알 수 없다.**
- C6에서 인터페이스 상태 차트를 고쳤지만(6시간 초과·대규모는 시간 요약, 원시는 행 예산 묶음), **수집 주기가 1분보다 촘촘한 아이템**은 여전히 한 묶음이 상한에 닿을 수 있다. 그 경우 화면은 "구간 일부가 비어 있는 그림"을 정답처럼 그린다.

## 0. v1 결정 (코덱스 설계 검토 `_archive/features/infra/scale-call-guard/review_zm-159-c5-design_codex.md` R1~R7 반영) — 🔴 §2와 충돌하면 여기를 따른다
| 주제 | v1 결정 |
|---|---|
| R3 (핵심) | **잘림을 감지해 다른 통계로 바꾸지 않는다.** 원시 조회를 `ZabbixQueryExecutor.scanWindows`로 **기간 창 × itemid 청크 분할**해 끝까지 받는다 — trend.get이 이미 쓰는 경로. 분할로 해결되면 완전한 원시 그대로다 |
| R1 | 잘림 판정은 실행기가 이미 하는 `limit = maxRows + 1` 방식에 맡긴다(정확히 상한인 정상 데이터를 잘림으로 오판하지 않는다) |
| R2·R5 | 대체는 **최후 수단**. 흐름을 못 박는다 — 긴 창: 요약 → 비면 원시(분할) → 그래도 불완전이면 **빈 결과 + warn**(요약 재호출 없음). 짧은 창: 원시(분할) → 불완전이면 요약 **1회** → 비면 빈 결과. 대체가 일어나면 "최악 상태 기준 시간 요약"이라는 뜻이 되므로 로그에 남긴다 |
| R4 | 결과형을 **유일한 구현**으로 둔다 — `querySeriesResult`가 실제 구현, 기존 `querySeries`는 `.series()`만 꺼내는 얇은 통로. 라이선스 데코레이터는 두 메서드를 각각 오버라이드 |
| R6 | `SeriesResult(series, complete, stopReason, deliveredPoints)` — `deliveredPoints`는 소비자에 실린 포인트 합. `complete ⇔ stopReason=NONE`을 생성자에서 강제 |
| R7 | 테스트 매트릭스: cap−1/cap/cap+1 · FLOAT·UNSIGNED 중 하나만 초과 · 두 번째 청크에서 불완전이면 앞 청크 값도 버림 · 요약 먼저 빈 경우 원시 불완전 후 요약 재호출 없음 · 대체 시 `max`(최악 상태) 사용 · 라이선스 ACTIVE 1회 / 차단 0회 |

## 2. 구현 (v1 — 실제 반영본)
### 2.1 원시 조회를 끝까지 읽는다 (핵심, R3)
- `ZabbixHistoryServiceImpl`이 `ZabbixQueryExecutor.scanWindows`를 쓴다 — trend.get과 같은 경로.
  `history.get` 정책(창 1시간 · 1콜 10만 행 · itemids 200개)에 따라 **기간 창 × itemid 묶음**으로 나눠 순차 조회한다.
  1콜이 상한을 넘으면 실행기가 그 조각을 버리고 **창을 반으로, 그다음 id를 반으로** 쪼개 다시 읽는다.
- 그래서 종전에 "앞부분 10만 개만 받고 조용히 끝"나던 대부분이 **애초에 잘리지 않는다**.
- 🔴 **창 크기는 대상 아이템 수에 반비례해 넓힌다**(`ZabbixQueryExecutor.adaptiveWindowSeconds`, 상한 하루):
  `창 = clamp(1콜 행 상한 × 가정 주기(60초) ÷ 묶음 크기, 정책 창, 하루)`. 정책 창(3,000초)은 아이템을 꽉 채운
  묶음(200개) 기준이라, 아이템 하나짜리 차트에 그대로 쓰면 **콜 수만 폭증한다**(한 달 = 720콜 → 30콜).
  🔴 **정책 창과 1콜 행 상한은 짝이어야 한다** — `200개 × 3,000초 ÷ 1분 = 1만 행`(= 행 상한). 어긋나면 꽉 찬 묶음이
  매 창마다 넘쳐 헛읽기 뒤 분할한다. 정책 창이 이미 하루인 trend.get은 불변.
- 🔴 **1콜 행 상한(1만) < 보유 상한(10만)** — 같으면 "한 조각이 넘쳤다 = 이미 보유 상한 초과"가 되어 쪼개도 완주할 수
  없다. 이 관계는 **기동 시 검증**한다(어기면 기동 실패). 이번 콜의 상한은 다시 `min(정책 상한, 남은 보유 자리)`다.
- 보유 예산은 설정값 `zabbix.call.max-history-rows`(기본 10만, 종전 안전핀과 같은 값)이며 **실행기의 창 버퍼와 나눠 쓴다**
  — 소비자가 쌓은 만큼을 뺀 "남은 자리"를 실행기가 매번 묻고, 전달한 페이지는 즉시 놓아준다. 겹치는 양은 페이지 하나뿐이다.
- 한 화면이 조회를 여러 번 나눠 하면(히스토리 타입별) **남은 예산을 넘겨** 요청 전체 보유량을 묶는다(`HistoryGetParams.maxHeldRows`).
- 호출자가 `limit`을 직접 준 조회(상위 N건)와 기간이 없는 조회는 **종전 1콜 그대로**다 — 쪼개면 "N건"의 뜻이 달라진다.
- 창·묶음 순회 순서는 계열이 섞이므로 합친 뒤 **시각순으로 정렬**한다(`DESC` 요청이면 역순).

### 2.2 완전성 통로
```java
// engine-api
record HistoryScanResult(List<HistoryPoint> points, boolean complete, String stopReason)
record SeriesResult(List<Series> series, boolean complete, String stopReason, long deliveredPoints)

ZabbixHistoryService.scanHistoryByItemids(...)   // 이력 서비스
MetricPort.querySeriesResult(...)                // 포트 — 구현 정본
MetricPort.querySeries(...)                      // 얇은 통로(.series()만 꺼냄)
```
- 어댑터 RAW 경로는 히스토리 테이블(`value_type`)별로 조회가 나뉘므로 **하나라도 불완전하면 결과 전체가 불완전**이다
  — 어느 계열이 잘렸는지 소비자가 알 수 없어 "일부만 정확"을 완전으로 보고하지 않는다.
- HOURLY_TREND 경로는 `ZabbixTrendServiceImpl`이 불완전을 오류로 끊으므로 돌아왔다면 항상 완전.
- `LicenseGuardedMetricPort`가 두 메서드를 각각 가드한다(차단 시 소스 조회 0회).

### 2.3 인터페이스 상태 차트 — 하나의 상태 기계 (R2·R5)
```
긴 창(>6h) 또는 원시 호출이 과대   : 요약 → (비면) 원시 → (불완전이면) 빈 결과 + warn
짧은 창                            : 원시 → (불완전이면) 요약 1회 → (비면) 빈 결과 + warn
```
- 요약과 원시를 서로 되부르며 돌지 않는다(`summaryTried` 한 번).
- **부분 반영 금지**: 원시는 임시 맵에 세고, 묶음 중 하나라도 불완전하면 **그때까지 센 값을 버리고** 남은 묶음도 조회하지 않는다.
  잘린 원시를 그대로 세면 관측이 끊긴 구간이 "인터페이스 0개"로 보여 장애처럼 읽힌다.
- 대체가 일어나면 값의 뜻이 **"그 시간의 가장 나쁜 상태"**(trend max)로 바뀌므로 warn에 남긴다.

## 3. 테스트
- `ZabbixHistoryServiceImplTest`(9) — 창×묶음 분할·합친 결과 시간순 · **상한과 같으면 완전**(R1) · 초과 시 창 분할로 완주 ·
  더 못 쪼개면 `NO_PROGRESS` 불완전 · 명시 limit은 1콜 · 기간 없으면 1콜 · DESC · getRange 분할·정렬 · 대상 0개면 무호출.
- `ZabbixMetricAdapterTest` — 기존 RAW 경로 전부 결과형 스텁으로 전환(동작 불변 확인).
- `InterfaceServiceTest`(12) — 원시 잘림 → 요약 대체 · 요약이 먼저 비고 원시도 잘리면 빈 결과(요약 재호출 없음) ·
  뒤 묶음이 잘리면 앞 묶음 값도 버림.

## 3.5 검수 이력
코덱스(`gpt-5.6-sol` high) 5회 왕복 — 설계 1회 + 구현 4회. 차단으로 잡힌 실제 결함:
1. `enabledRulesOnly`… 아님 — **① 1콜 상한 == 보유 상한이라 "쪼개 완주"가 논리적으로 불가능**(v2 R1)
2. **② 분할이 기존 소비자 2곳을 깨뜨림** — `ItemsService`의 "10만이면 잘림" 판정, `HostService`의 DESC 최신 구간(v2 R2)
3. **③ 실행기 창 버퍼가 보유 상한 밖**(v3 R1·v4 R1) — 최대 2배까지 살아 있었다
4. **④ 어댑터가 설정값 대신 상수로 남은 예산 계산**(v3 R2)
최종 판정 **병합 승인 가능(필수 0건)** — 상세는 `reviews/review_zm-159-c5*.md`.

## 4. 범위 밖
- 화면에 "일부만 표시" 문구(인터페이스 차트) — 응답 계약 변경이 필요해 별도.
- 다른 메트릭 소비자(CPU·메모리·디스크 차트)로의 확산 — 필요해질 때 같은 메서드를 쓰면 된다.
- `max-response-bytes` 16MiB 하향(대규모 메모리 실측 선행).
