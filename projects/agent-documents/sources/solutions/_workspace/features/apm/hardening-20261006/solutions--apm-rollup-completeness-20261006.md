# APM 롤업 완전성 조회 연동 최소안

2026-10-06 읽기 분석. 순위 5 구현 뒤 별도 후속이며 이 문서로 제품 코드를 변경하지 않는다. 1차 검증은 루트 담당자가 수행 중이다.

## 확인한 소비자와 문제

| 소비자 | 현재 판정 | 영향 |
|---|---|---|
| `service/status/ApmAvailabilityService.pctTailStart`, `pct24hBatch`, `series` | watermark 이전은 5m, 최신 꼬리는 1m으로 보완. 퍼센트 캐시는 service/end 키 | dirty·blocked·legacy 구간을 완전한 관측처럼 셀 수 있고, 캐시도 dirty 추가를 모름 |
| `slo/ApmSloCalculator.coarseTrustedUntil`, `measureBatch` | watermark까지 coarse, 뒤는 더 세밀한 단. `Counted`로 SLI/budget/burn 계산 | 보류 구간이 누락·축소된 채 `OK`가 될 수 있음. raw 부분 재생성도 fallback만으로 해결되지 않음 |
| `export/source/ApmRedSeriesExporter` | plan의 `incompleteFromMs`는 watermark; 행이 있으면 `ApmExportCoverage.DATA` | 보류 행을 DATA로 내보낼 수 있음. planToken은 시각·해상도 고정이며 데이터 snapshot은 아님 |
| `export/source/ApmEndpointExporter` | route 집계 전체를 합치며 plan의 미완료 시각만 watermark로 표시 | 부분 원본의 요청수·오류율·백분위를 완전한 창의 값처럼 내보낼 수 있음. endpoint CSV에는 coverage 열이 없음 |

watermark는 첫 순회 진행점이다. 최종 완전성은 dirty, blocked, legacy 범위, bootstrap 상태, 삭제 경계와 함께 판정해야 한다. 현재 cutoff 안에 raw 파티션이 존재한다는 사실은 도입 전 자료의 완전성 증거가 아니다.

## 공통 읽기 판정

`core/metric`에 요청 범위를 받는 읽기 전용 `ApmMetricCoverageReader`를 두는 최소안을 권고한다. 외부 API는 추가하지 않는다. 내부 결과는 안전 범위와 `PENDING`, `BLOCKED`, `LEGACY_UNVERIFIED`, `BOOTSTRAP_PENDING`, `RETIRED`, `UNKNOWN`을 구분한다. 기존 enum의 형식적 확장이 아니라 호출자가 신뢰 여부를 결정할 증거를 반환한다.

1. 5m을 읽는 범위는 stage 5 marker, 1h는 stage 60과 같은 hour의 upstream stage 5 marker를 모두 확인한다. marker는 서비스별이 아니므로 현재 스키마에서는 해당 시간의 모든 서비스를 보수적으로 미완료로 처리한다. 서비스별 최적화를 위해 원본을 전수 조회하지 않는다.
2. cutover 이전은 자동 verified 판정하지 않는다. 현 V70에는 과거 bucket별 provenance가 없고 `legacy_hold`는 stage 전체의 요약뿐이다. 가장 작은 안전 구현은 **cutover 이전 요청 범위를 일괄 미검증**으로 간주하는 것이다. 기존 target 조회를 이용해 범위를 좁힐 수는 있지만 기존 target 없음도 raw 완전성을 증명하지 않는다. 검증된 backfill/별도 provenance 없이 역사 범위를 정확하다고 승격하지 않는다.
3. cutover 이후 raw이고 실제 유효 보존·삭제 경계 안이며 원본 파티션이 남은 경우에만 raw fallback 후보로 삼는다. 그래도 열린 최신 버킷은 완성값이 아니며 기존 ingest lag를 적용한다. `legacy`, `SOURCE_CONTRACTION`, source unavailable의 raw fallback은 금지한다.
4. 지연 marker가 사라진 뒤 별도 읽기에서 원본을 조회하는 TOCTOU를 피한다. 짧은 요청 트랜잭션의 동일 snapshot으로 메타와 수치 질의를 묶거나, 단일 SQL/CTE에서 범위 판정과 집계를 함께 한다. 장시간 다운로드 전체에 반복 읽기 트랜잭션을 유지하지 않는다. 각 chunk를 제한된 snapshot으로 읽는다.
5. 판정 질의 실패·budget 초과는 UNKNOWN이다. 이를 빈 dirty 목록이나 verified로 바꾸지 않는다.

## 기존 응답 필드 사용

### SLO와 burn, snapshot

최소 구현은 요청 창에 안전하게 fallback할 수 없는 구간이 하나라도 있으면 그 창의 SLI·budget·burn을 `null`, 상태를 기존 `UNKNOWN`, `unknownReason`을 기존 `NOT_MEASURABLE`로 보낸다. 좋은 조각만 합쳐 전체 요청 SLI로 발표하지 않는다. `coveragePct`의 분모는 요청 수인데 legacy에서는 전체 요청 수 자체가 불명확하므로 100%나 임의 비율을 만들지 않고 nullable 필드를 사용한다.

`Measured`에 내부 완전성 상태를 추가하고 기존 생성자는 호환 overload로 유지한다. histogram 경계 의미인 `mixedBounds`를 dirty 전용 플래그로 재사용하지 않는다. `unknownReason`는 내부 불완전성 판정을 `NO_REQUESTS`/`OUT_OF_RETENTION` 추정보다 먼저 확인해야 한다. 요청수 0을 만들어 넣는 것만으로 UNKNOWN을 구현하면 실제 무트래픽으로 오인하므로 금지한다.

현재 `Measured.from/to` 한 쌍은 가운데 구멍을 표현할 수 없다. 최소안은 창 전체의 최종 SLO 판정을 UNKNOWN으로 하고 숫자 근거는 관측치일 뿐임을 명시하는 것이다. 내부 상태에서 미측정 구간을 누락하지 않는다. `count()`와 `burnWindowsBatch()`도 같은 불완전성을 전달해 하나라도 unknown인 창을 정상 burn `NONE`으로 접지 않는다. 일 snapshot/알람이 같은 판정을 소비하는지 함께 검증한다. 완료되지 않은 날의 snapshot을 성공값으로 저장하지 않는다.

### Availability

`ApmAvailabilityDto.Point.status`는 이미 nullable이며 키 부재는 답할 수 없는 칸이다. 미검증 구간은 이 경로를 사용한다. 기존 `UNKNOWN`은 수신/수집기 관측 결과이므로 삭제·부분원본의 의미로 확장하지 않는다. `pct24hBatch` 분모에서도 해당 칸을 제외하고, 안전하게 판단된 칸이 없으면 기존 nullable 퍼센트를 유지한다. 이 값은 SLA가 아닌 수신 연속성이라는 기존 의미도 유지한다.

coverage 조회는 캐시 hit 판정 전에 한 번 수행한다. dirty/legacy 영향 범위는 캐시를 우회하고, 정상 범위에서도 이전 dirty 처리 전 캐시가 남지 않도록 캐시 삭제 또는 짧은 범위 revision을 적용한다. 서비스마다 별도 coverage 질의를 추가하지 않는다.

### Export

RED는 기존 `PARTIAL` coverage를 열림 외에 미완료/미검증에도 적용하고 `DATA`보다 먼저 판정한다. 신뢰할 수 없는 수치 칸은 null로 비워 확정 측정값으로 오인하지 않게 한다. `PARTIAL` 의미 확장은 계약 문구와 FE 라벨 검증이 필요하지만 열과 enum을 새로 추가할 필요는 없다. 기존 `incompleteFromMs`는 창 안 최초 미완료 시각으로 잡을 수 있으나 그 뒤 전체가 미완료라는 보수적 요약이며 정확한 구멍 목록은 아니다.

endpoint는 행 단위 coverage 열이 없으므로 최소한 plan `notes`와 `incompleteFromMs`에 보류를 반영한다. 숫자 안전성을 위해 불완전한 전체 창을 정상 집계 숫자로 내보내지 말고 route 식별 열을 유지한 채 불확실한 요청수·오류율·latency 등 수치 열을 비우는 방안을 권고한다. `allowed=false`를 쓰면 기존 TOO_LARGE 의미와 충돌하므로 재사용하지 않는다. 빈 숫자 허용은 CSV/JSONL 계약 회귀로 확인한다.

다운로드는 계획 시점의 clean 판정을 그대로 믿지 않는다. RED 각 chunk, endpoint 집계 생성 시 coverage를 다시 읽고 같은 snapshot의 숫자와 결합한다. 이미 응답을 시작한 뒤 실패하면 새로운 DATA를 만들어 마무리하지 않는다. JSONL 메타·plan notes와 실제 행 coverage의 일관성을 시험한다.

## 조회 예산과 우선 구현 순서

- 동일 `(from,to)`에서 stage state 2행+partition state 3행은 1회, 범위 dirty는 stage/bucket PK를 이용해 1회로 묶는다. 기본 queue 상한 합계 5,120개를 그대로 힙에 반복 적재하지 않는다. 상세 칸이 필요 없는 SLO는 EXISTS/최초 미완료만 읽는다.
- availability 24h 한 배치의 coverage 추가 왕복은 서비스 수와 무관하게 최대 2회로 제한한다. 결과는 288개 칸의 mask로 재사용한다.
- burn 네 창은 최대 6h 합집합을 한 번 조회해 네 범위로 잘라 쓴다. SLO 수×네 창×stage 조회를 만들지 않는다.
- export는 기존 `chunkCells`에 맞춰 범위를 제한하고 서비스 밖 루프에서 동일 시간 mask를 공유한다. 같은 chunk를 서비스 수만큼 다시 질의하지 않는다.
- 메타 판정 SQL에는 짧은 statement timeout(초기 제안 1~2초, 실측으로 조정)을 적용한다. timeout은 clean이 아닌 UNKNOWN이다. 장기 캐시로 새 marker를 숨기지 않는다.

우선순위는 ① SLO/burn/snapshot의 거짓 OK 제거 ② RED/endpoint의 거짓 DATA 제거 ③ availability 칸/퍼센트와 캐시 정합 순서다. API 필드 shape는 유지할 수 있으나 `PARTIAL`, nullable 수치, `NOT_MEASURABLE` 해석은 FE와 함께 검증해야 한다.

필수 회귀: watermark보다 오래된 dirty, 같은 count·다른 sum legacy raw, raw 파티션만 존재하는 부분 재생성, clean plan 뒤 신규 수신, 캐시 hit 뒤 dirty 추가, mixedBounds와 completeness 독립성, unknown burn의 발화/복구 오인 금지, 다서비스 batch 질의 수 고정, metadata timeout의 fail-closed.
