# APM 지연 메트릭 재집계·시간창·보존 보호 계약

상태: 2026-10-06 구현·회귀 테스트 작성. 순위 5와 순위 7의 메트릭 최소 보호 범위를 함께 처리한다. Gradle·실DB 실행 검증은 루트 담당자가 순차 수행하며 결과는 별도 기록한다.

## API와 FE 영향

기존 OTLP 메트릭 수신 경로·조회 성공 응답 shape는 유지한다. 새 엔드포인트는 없다.

기존 수신 폐기 통계의 `reason: string`에 아래 값이 추가된다. 기존 32자 DB 컬럼 범위 안이다.

| reason | 의미 | 사용자 안내 |
|---|---|---|
| `METRIC_TIME_EXPIRED` | 관측 날짜가 현재 유효 raw 1m 보존 범위 밖 | 수집기 지연·관측 시각과 서버의 보존 설정 확인 |
| `METRIC_TIME_FUTURE` | 관측 시각이 허용 미래 편차(기본 300초) 초과 | 앱·수집기·서버 시계 확인 |
| `METRIC_TIME_RETIRED` | 이미 삭제한 날짜 범위의 재수신 | 보존 기간 확대가 삭제된 원본을 복구하지는 않음 |

위 사유는 영구 정책 제외다. DDL과 누적 기준값 갱신 전에 제외하고 기존 폐기 진단 통계에 반영한다. 정책 제외의 OTLP 응답은 기존 HTTP 200 `{}`를 유지하며 `partialSuccess` 필드를 새로 추가하지 않는다. 시간 누락/0의 기존 수신 시각 폴백은 유지한다.

재집계 queue가 가득 찼거나 DB·잠금·statement timeout이 실패하면 일시 장애로 기존 HTTP 503을 반환한다. receipt·원본·dirty 기록과 누적 메모리 기준값 공개를 함께 되돌린다. 200으로 받은 뒤 재집계 표시를 버리지 않는다.

재집계 진행·보존 보류는 기존 scheduler 실행 요약에 표시한다. 신규 상태 API는 이번 범위에 추가하지 않는다.

## 구현 불변식

- 1m 적재와 5m dirty marker 등록은 같은 트랜잭션이다.
- marker는 시간 버킷 단위로 합치며 generation 조건부 ACK로 처리 중 새 변경을 보존한다.
- 5m 재집계·1h 전파·5m ACK·정상 순회 watermark 저장은 같은 트랜잭션이다.
- 정상 순회와 과거 복구는 독립 처리 예산을 갖고 stage advisory 잠금으로 같은 단계의 결과 역행을 막는다.
- producer/consumer는 원본·대상 날짜 공유 잠금, retention은 날짜 배타 잠금을 사용한다.
- archive 설정과 무관하게 미집계 원본은 삭제하지 않는다. archive 게이트는 추가 AND 조건이다.
- 원본 파티션이 없는 구간으로 기존 상위 집계값을 덮어 축소하지 않는다.
- 기존 행 도입 보정은 영속 bootstrap cursor로 회차별 한정 처리한다. queue 기본 상한은 5m 4,096개·1h 1,024개이며 실제 지원 처리량 보증이 아니다.

## 도입 전 자료의 보수적 처리

V70은 단계별 `legacy_cutover`에 실제 도입 instant(`timestamptz`)를 고정한다. Java가 이를 기존 원본과 같은 JVM 시스템 시간대 축으로 변환한 뒤 다음 5분/1시간 경계부터 새 보장을 적용한다. DB session 시간대가 다르더라도 경계가 이동하지 않는다. 보존 설정의 현재 cutoff나 기존 count 비교만으로 과거 원본의 완전성을 추정하지 않는다. 예를 들어 보존 기간을 줄여 원본을 삭제한 뒤 다시 확대해 부분 재생성한 날은 현재 보존 범위 안이어도 검증된 자료가 아니다.

cutover 이전에 기존 target 행이 있는 버킷은 자동 대입하지 않는다. bootstrap는 해당 버킷을 개별 큐에 넣지 않고 stage의 `legacy_hold` 진단으로 압축한다. retention은 그 날짜의 기존 역사 target 존재를 직접 확인해 원본 자동삭제를 보류한다. 새 수신 때문에 생긴 역사 marker는 bounded queue에서 `LEGACY_SOURCE_UNVERIFIED`로 남는다. target이 없는 버킷은 최초 생성할 수 있지만 기존 상위 1h가 있으면 그 단계에서 다시 보류한다.

이 정책은 정상적인 과거 자료도 보수적으로 보류할 수 있다. 검증된 backfill/수동 해제 절차는 아직 제공하지 않으며, 보류 원본의 디스크 증가와 신규 역사 marker의 queue 점유를 운영에서 확인해야 한다. `legacyHold5m/1h`는 자동 해제되지 않는 진단이다. 기존 marker의 `SOURCE_OR_TARGET_RETIRED`, `SOURCE_CONTRACTION`도 자동 원본 복원을 뜻하지 않는다.

## 작업 예산과 실패 처리

정상 순회 기본 5m 60개·1h 12개는 각각 최대 288개·48개로 제한한다. bootstrap는 기본 60개와 큐 잔여 중 작은 수만 조회하며 날짜별 cursor로 이어간다. repair는 기본 12개·6개로 독립 실행한다. 각 phase 기본 120초, SQL statement 기본 60초, 잠금 대기 기본 1초다. DDL도 메트릭 날짜 잠금과 DB timeout을 적용한다. 이는 보호 기본값이며 대규모 처리량·지연 SLO를 보증하지 않는다.

stage 5가 실패해도 stage 60을 소비한다. 상위 큐 포화로 하위 집계가 실패한 회차에도 상위 큐가 빠져나갈 수 있다. stage 60의 ready 조회는 upstream 5m 작업이 남은 hour를 제외해 뒤의 독립적인 복구를 굶기지 않는다. 일시적인 upstream pending에서는 정상 순회를 기다린다. 영구 보류는 같은 트랜잭션에 legacy HOLD 또는 blocked marker를 남긴 뒤 정상 frontier를 진행한다. marker 기록이 실패하면 frontier도 롤백한다.

watermark는 첫 순회의 진행점이며 단독으로 구간의 최종 완전성을 증명하지 않는다. 개별 미완료는 dirty·blocked·legacy HOLD가 표현하며 retention은 이들을 함께 검사한다. 영구 보류 한 건 때문에 이후 최신 5m/1h 집계와 모든 원본 보존이 정지하지 않게 분리했다. pending도 완료 보장이 아니라 남은 작업 수이며 blocked와 bootstrap/legacy 진단을 함께 확인한다.

## 검증 대상으로 작성한 회귀

- 실제 PG에서 늦은 동일 PK 및 새 instance의 1m→5m→1h 반영과 재실행 안정성.
- 집계 SQL 뒤 생산자가 커밋한 경우 generation ACK가 새 marker를 보존하는 별도 연결 경합.
- 1h 전파 실패 시 5m 결과·ACK·frontier 롤백, 상위 큐 포화 뒤 1h 소비를 통한 회복.
- stage 중복 실행 차단, upstream 보류 hour 뒤의 독립 repair 진행, bounded bootstrap cursor와 여유 조회 이후 경쟁 예약 롤백.
- 동일 count지만 다른 sum인 역사 원본의 대입 방지, source 소실/축소 방지, 보존 날짜 잠금과 삭제 경계의 재생성 금지.
- 실제 수신의 큐 포화 시 receipt·원본·누적 tracker 롤백 후 한 번만 재적재, 시간창 제외의 DDL·귀속·tracker 선행 차단.

## 남는 범위

trace/RUM 전체 timestamp 정책, 트레이스 재분류, archive 파일의 source freshness와 checksum 실패 후 처리, 실제 복합 부하시험은 별도 후속이다. 이미 삭제된 원본과 상위 집계의 과거 불일치를 이 기능이 복구한다고 보장하지 않는다.

조회 완전성 진단도 후속이다. `ApmAvailabilityService.pctTailStart`와 `ApmSloCalculator.coarseTrustedUntil`의 원본 fallback, `ApmRedSeriesExporter.incompleteFrom`과 `ApmEndpointExporter.plan`의 미완료 표시는 현재 watermark만 읽으며 dirty/legacy HOLD를 직접 반영하지 않는다. 이번 변경은 해당 계산·응답 shape를 변경하지 않는다. 따라서 보류 구간의 기존 집계가 조회/SLO/내보내기에 남을 수 있고 `incompleteFrom=null`만으로 지연 변경까지 모두 반영됐다고 해석해서는 안 된다. scheduler의 pending/blocked/legacyHold와 보존 보류를 함께 확인해야 한다.

## 🔄 FE 요청사항

폐기 사유 표시와 관련 union/라벨에 위 세 reason을 추가한다. 일시 장애 HTTP 503과 정책 제외 HTTP 200 `{}`의 기존 처리 계약은 유지한다.

## 2026-10-10 RT-3 — 조회 완전성의 앞·뒤 경계 분리 (1단계, DB 변경 없음)

배경: 기존 롤업 자료가 있는 설치본은 V70 도입 때 `legacy_hold=true`(자동 해제 없음)가 되고, 조회 판정이 그것을 요청 창 **시작부터** 미확정(`Issue(from)`)으로 압축해 SLO 시계열·RED/엔드포인트 내보내기·가용성이 사실상 영구히 비었다(정본 `features/apm/alerts/apm-legacy-hold-rt3-20261010.md`, 원인 `_archive/features/apm/alerts/review_apm-legacy-hold-rt3-20261010_codex.md`).

### 판정 규칙 (`ApmMetricCoverageReader.coverage(stage, from, to)` → `Coverage`)
- **앞쪽 `untrustedBefore`(+`prefixReason` = `BOOTSTRAP_PENDING` | `LEGACY_UNVERIFIED`)** — 도입 경계 이전만 미검증. 경계는 `ApmMetricDirtyStore.cutoverBoundary`(롤업 `legacyCutover`와 같은 함수: 도입 instant를 JVM 시간대로 바꾼 뒤 stage 다음 경계 — 5m은 다음 5분, 1h는 다음 정각). stage 60은 stage 5·60 경계 중 늦은 것을 정시로 올린다. bootstrap 진행 중이면 사유만 `BOOTSTRAP_PENDING`(훑는 끝이 도입 경계보다 뒤면 그 끝까지). `legacy_hold`는 경계를 바꾸지 않는다(hold 여부와 무관하게 도입 이전은 미검증, 이후는 새 보장).
- **뒤쪽 `incompleteFrom`(+`suffixReason` = `PENDING` | `BLOCKED`)** — dirty marker 검색은 `max(from, untrustedBefore)` 이후에서만. 도입 이전 marker(`LEGACY_SOURCE_UNVERIFIED` 등)는 신뢰 구간을 자르지 않는다. stage 60은 겹치는 stage 5 marker를 상속(정시로 내림). 첫 marker 이후 전부를 자르는 보수적 동작은 유지.
- 신뢰 구간 = `[max(from, untrustedBefore), min(to, incompleteFrom ?? to))`. `untrustedBefore`는 창 끝보다 뒤일 수 있다(창 전체 미검증 — 그 값이 안전한 재요청 시작). DB 오류는 전파(fail closed), `consistent()` 동일 REPEATABLE_READ 스냅샷 유지.
- 🔴 `legacy_hold` 자동 해제 없음은 그대로다. 검증 rebuild(2단계)·관리자 운영 동작(3단계)은 이번 범위 밖.

### API 계약 변경 (전부 nullable 추가 — 기존 필드·의미 유지)
| 위치 | 변경 |
|---|---|
| `GET /apm/slos/{uid}/series` `ApmSloSeriesDto` | 🆕 `untrustedBeforeMs: long \| null` — 이 시각 이전은 업그레이드 이전 미검증이라 점을 싣지 않음(points는 이 시각부터, 응답 격자로 올린 값). 🔴 (10-11 개정) `untrustedBeforeMs` **또는** `incompleteFromMs`가 있으면 `errorBudgetTotal`·모든 `budgetRemainingPct`가 `null` — 잘린 창으로 예산을 만들지 않는다(뒤쪽 경계는 오래된 BLOCKED도 표현). 부분값 계약은 두지 않는다 |
| SLO 행·상세 `unknownReason` | 🆕 값 `LEGACY_UNVERIFIED` — 롤링 창이 도입 이전 구간에 걸쳤다(창이 경계를 지나면 저절로 풀림). dirty·blocked는 종전 `NOT_MEASURABLE` |
| SLO 상세 캘린더 오늘 칸 `unknownReason` | 업그레이드 당일(오늘 0시가 도입 경계 이전) `LEGACY_UNVERIFIED`. `requests=null`·`total=0`은 무트래픽이 아님 |
| 내보내기 계획 `ApmExportPlanDto` | 🆕 `untrustedBeforeMs: long \| null`(`incompleteFromMs` 바로 뒤). `notes`에 앞쪽 안내 별도 줄("…이전 구간은 … 검증되지 않아 값을 비웠습니다. 시작 시각을 이 시각 이후로 좁히면…") |
| JSONL `_meta` | 🆕 `untrustedBeforeMs` |
| RED CSV/JSONL `coverage` 열 | 🆕 `LEGACY_UNVERIFIED`(앞쪽, 수치·게이지 전부 빈 칸). 뒤쪽은 기존 `ROLLUP_INCOMPLETE`(2026-10-07 도입, 수치·게이지 빈 칸) |
| endpoints 파일 | 창 전체 집계라 앞·뒤 어느 쪽과 겹쳐도 숫자 열 전체 빈 칸(종전 유지). 안전한 재요청 시작은 계획의 `untrustedBeforeMs` |

### 서버 내부 의미 (응답 shape 무변경)
- SLO 측정(`Measured`)은 요청 창이 미신뢰 구간과 하나라도 겹치면 `completenessVerified=false`(현행) + 경계·사유 보존. 번 레이트·일 스냅샷·`SLO_BURN` 알람은 종전대로 미확정을 성공·정상으로 굳히지 않는다(스냅샷은 건너뜀, 알람은 측정 불가 값). 업그레이드 뒤 7일 창 SLO는 최대 7일, 30일 창은 최대 30일 `UNKNOWN(LEGACY_UNVERIFIED)`이며 그동안 캘린더 과거 칸 스냅샷도 쌓이지 않는다(롤링 창 미검증 → skip).
- 가용성 시계열: 영향 칸만 `status` 없음. 24h 퍼센트: 창 전체가 신뢰될 때까지 키 없음(null).

### 🔄 FE 요청사항 (RT-3)
1. `types/apm.ts`: `ApmSloSeries.untrustedBeforeMs?: number | null`, `ApmExportPlan.untrustedBeforeMs?: number | null`, SLO `unknownReason` union에 `'LEGACY_UNVERIFIED'`, RED `coverage` union에 `'ROLLUP_INCOMPLETE' | 'LEGACY_UNVERIFIED'`(앞의 것이 아직 없다면 함께).
2. SLO 상세 차트: `untrustedBeforeMs` 이전 음영 + "업그레이드 이전 구간은 검증되지 않아 표시하지 않습니다" 안내. 값이 있으면 번다운 곡선·예산 숫자를 그리지 않고 SLI 점만.
3. SLO 표·헤더·캘린더: `LEGACY_UNVERIFIED`를 처리 지연(`NOT_MEASURABLE`)·무트래픽(`NO_REQUESTS`)과 다른 문구로(예: "업그레이드 이전 구간 포함 — 창이 지나면 표시").
4. 내보내기 모달: `untrustedBeforeMs`·`incompleteFromMs` 중 하나라도 있으면 경고, `untrustedBeforeMs < toMs`면 "이 시각 이후로 받기" 재요청 범위 제안. RED 도움말에 `LEGACY_UNVERIFIED` 의미.
5. 계약 표본 `slo-series.json`에 `"untrustedBeforeMs": null` 추가됨 — FE 픽스처 사본이 있으면 같이 갱신(`npm run typecheck:contract`).


### 2026-10-11 RT-3 개정 (코덱스 반려 `_archive/features/apm/alerts/review_apm-legacy-hold-rt3-be-20261011_codex.md` 반영)
- **1h marker 탐색 시작**: 실제로 읽히는 첫 버킷 `ceil(trustedFrom, stage)`부터. 정각에 안 맞는 1h 요청 `[10:30, 12:00)`에서 `10:35` 5m marker는 제외, `11:05`는 `incompleteFrom=11:00`.
- **SLO 시계열 예산**: 앞이든 뒤든 잘리면 `errorBudgetTotal`·`budgetRemainingPct` 모두 null(위 표 개정). FE는 `incompleteFromMs`만 있어도 번다운을 그리지 않는다.
- **1m 원본도 판정**: stage `RAW=1` — stage 5 행의 도입 instant를 같은 함수(`cutoverBoundary`)로 **다음 1분 경계**에 맞춘 앞쪽 경계만(뒤쪽 없음). 적용: SLO 측정(번 레이트 창 포함)·SLO 시계열·가용성·RED/엔드포인트 내보내기. RED 1m 칸도 도입 이전이면 `LEGACY_UNVERIFIED`.
- **번 레이트**: 네 창(5m·30m·1h·6h) 중 하나라도 미신뢰 구간에 걸리면 네 창 모두 null → `burnCondition=UNKNOWN`, `SLO_BURN`은 측정 불가 값. 요청 0건으로 비는 줄은 종전대로 줄 단위.
- **일 스냅샷**: 일간 창이 신뢰되면 `good/total/requests`는 저장. 롤링·1h·6h 창이 **도입 이전 미검증만** 걸렸으면 그 값(`budget_remaining`·`burn_1h`·`burn_6h`)만 null로 굳힌다(기다려도 그날 기준으로는 검증되지 않으므로 확정 행). 처리 지연(dirty·blocked·bootstrap)이 걸리면 종전대로 건너뛰고 백필을 기다린다. → 업그레이드 뒤 백필 7일 밖으로 일간 값이 영구 누락되던 문제 해소. 캘린더 과거 칸은 `budgetRemainingPct=null`일 수 있다.
- **앞쪽 사유**: 도입 이전은 bootstrap 진행 여부와 무관하게 `LEGACY_UNVERIFIED`. bootstrap이 도입 경계 너머까지 훑는 동안의 연장 구간만 `BOOTSTRAP_PENDING`(기다리면 풀림) — SLO `unknownReason`은 `NOT_MEASURABLE`, RED `coverage`는 `ROLLUP_INCOMPLETE`, 스냅샷은 건너뜀.
- **가용성 원천별 판정**: 1m으로 덮어 읽는 꼬리 `[tail, to)`는 1m 원본 판정, 그 앞은 롤업 판정. 24h 퍼센트도 두 구간이 모두 완전할 때만.
- **endpoint 내보내기**: 숫자(`routeTable`)·coverage·워터마크를 한 `consistent()` 스냅샷에서 읽어 계획을 만들고, 쓰기는 계획의 행을 **다시 읽지 않고** 그대로 흘린다. 근거: 다운로드는 본문 직전에 계획을 다시 세우고(`ApmExportService.download`) 그 계획으로 헤더·JSONL `_meta`·본문을 모두 쓰므로 셋이 같은 상태를 말한다(행 coverage 열 추가 대신 "본문 전 최종 계획" 방식 — 파일 스키마 버전 변경 불필요). 쓰기 단계에서 coverage만 따로 재판정하던 것은 숫자와 다른 스냅샷이라 제거.
- 내보내기 `notes`의 앞쪽 안내 문구: "…이전 구간은 집계를 검증할 수 없어(업그레이드 이전 자료이거나 도입 보정 진행 중) 값을 비웠습니다."

#### 🔄 FE 요청사항 추가 (10-11)
6. SLO 시계열: `incompleteFromMs`만 있어도 예산이 null이다 — 번다운 차트는 두 경계 중 하나라도 있으면 "창이 잘려 예산을 계산하지 않음" 안내.
7. SLO 캘린더 과거 칸: `budgetRemainingPct`·`burn1h`·`burn6h`가 null이고 `sliPct`는 있는 칸(업그레이드 직후 최대 창 길이만큼)을 정상 표시 — 예산 칸만 "—".
8. 1m 해상도 RED 파일에도 `LEGACY_UNVERIFIED`가 나올 수 있다(업그레이드 직후 7일 이내 기간).
