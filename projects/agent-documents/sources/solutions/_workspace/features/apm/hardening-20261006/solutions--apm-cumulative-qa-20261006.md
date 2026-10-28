# APM 순위 2~4 독립 QA — 2026-10-06

상태: 최종 diff·계약 대조 및 독립 검토 완료. 신규 차단 결함 없음. BE 203개·FE 117개 통과 증빙을 읽어 확인했다. 이 QA 담당은 테스트·빌드·DB·서버·브라우저를 실행하지 않았고 제품 소스를 수정하지 않았다. 실행 주체와 증빙은 아래 최종 검증 절에 구분했다. 리더의 bootJar는 완료 통보 전이므로 이 문서는 빌드 성공을 선언하지 않는다.

범위는 원시 계열 식별, CUMULATIVE 차분, 상태 예산, 적재 순서, BE→FE 사유 전달이다. 계약은 `./contract_apm-cumulative-correctness-20261006.md`이고 `api-contract-sync`의 정적 대조 기준을 적용했다. 코드 위치는 `moveseye-be-spring/` 또는 `moveseyee_fe/` 기준이며 병행 편집에 따라 줄 번호가 이동할 수 있다.

## 발견 사항과 처리

| 항목 | 기대 | 검토 시 실제 | 심각도 / 조치 |
|---|---|---|---|
| 동일 bytes 속성의 hash | 같은 binary이면 같은 원시 계열 | 최초 구현은 Base64 문자열을 그대로 hash하여 padding·URL-safe 차이로 계열 분리 | 중간, 해결. decode→hex 보완과 해당 회귀 통과 증빙 확인. `OtlpMetricIdentity.java:113` |
| int64 동등 표기 | 숫자/문자열/지수 표기가 같은 정수이면 동일 hash | 최초 BigInteger 파싱은 유효한 `intValue:"1e2"`에서 예외가 나 포인트 전체 skip | 높음, 해결. signed int64 exact decimal/exponent 변환과 128자 제한 및 회귀 통과 확인. `OtlpMetricIdentity.java:130` |
| typed null | unset 값은 원시 계열을 분리하지 않음 | 최초 `.has()` 분기는 null 문자열 또는 정수 파싱 예외로 갈 수 있었음 | 중간. `hasNonNull`·값 없는 속성 제외 반영 확인. `OtlpMetricIdentity.java:80,95,103` |
| 설정 계약 | 실제 2개 셀 풀·서비스별 제한 설명 | 초기 검토 당시 계약은 committed/pending 단일 예산 설명, 일부 설정 누락 | 해결. 최종 계약에 두 풀·서비스별 제한·future 설정·허용 범위·상호 제약 반영 확인 |
| 조회 사유 합계의 범위 | 반환된 사유의 합임을 구분 | BE는 상위 200행인데 FE는 그 반환 행만 합산 | 기존 제한. 새 중립 사유가 상위 행을 많이 차지하면 제외 사유 일부가 응답 밖으로 밀릴 수 있음. 전체 손실 원장으로 해석하면 안 됨 |

int64의 지수 표기, bytes의 표준/URL-safe·padding 동등 표현, null의 unset 의미는 [공식 ProtoJSON 문서](https://protobuf.dev/programming-guides/json/)로 확인했다. 위 반례는 정적 입력/분기 대조로 발견했으며 직접 실행한 재현 결과로 표기하지 않는다.

최종 소스에서 위 identity 결함의 원래 분기는 제거됐고 24회차 identity 회귀 통과 증빙을 확인했다. 추가 신규 차단 결함은 확인하지 못했으므로 독립 검토를 종료한다. 기존 한계와 후속 순위의 문제를 해결 완료로 확대하지 않는다.

## BE 불변식 검토

| 경계 | 확인 결과 / 근거 |
|---|---|
| 원시 계열과 저장 차원 분리 | resource·scope·schema URL·원래 metric·unit·kind·monotonic·typed point attrs로 SHA-256 hash. 시간·누적값·histogram bounds는 계열 key에서 제외하고 bounds는 별도 schema 판정. `otel/metric/OtlpMetricIdentity.java:20` 이후, `MetricIngestor.java:756` |
| canonical 속성 | key 정렬, typed string/int 구분, array 순서 유지, kvlist key 정렬. signed int64 boundary·동등 표현·bytes·null 회귀가 `OtlpMetricIdentityTest`에 반영됐고 실행 증빙을 확인. 전체 ProtoJSON parser 적합성 보증은 아님 |
| 원문 로그 | 신규 identity 실패는 포인트 단위 고정 메시지이며 원문 속성·예외 내용을 출력하지 않음. 공통 resource/scope 실패도 memoize한 고정 오류로 변환. `OtlpMetricsReader.java:202,234`. 기존 metric-level 경고 `:111`의 metric 이름/예외 출력까지 모두 제거됐다는 뜻은 아님 |
| 최초 관측 | startTime이 알려져 있고 최근이어도 기준만 기록. 새 resource/scope/unit key로 갈라진 초기 누적값을 통째로 재가산하지 않음. `CumulativeDeltaTracker.java:150` |
| unknown start | `startTime==time`이면 값이 있어도 기여 0, 기준만 저장. 다음 동일 epoch 관측에서 정상 차분. 같은 timestamp 재수신은 먼저 중복/충돌로 판정. `:139,150` |
| 시각·epoch | 과거 time 또는 이전 start epoch는 기준 불변. 같은 time·동일 observation은 DUPLICATE, 값/schema 차이는 CONFLICT. 명확하게 이전 관측 이후 시작한 새 epoch만 전체 누적값 수용. `:138~165` |
| histogram schema | 같은 epoch 경계 변경은 재기준화하며 서로 다른 격자끼리 뺄셈하지 않음. 길이가 같아도 경계 hash로 구분. 감소를 0으로 clamp하지 않고 구간 보류. `:162~173,198` |
| 유효성 | 미래 시각·start>end·비유한/음수 값·음수 count·경계 순서·bucket 음수/overflow·count 합 불일치에서 기존 상태 유지. `:179` |
| 원래 admission 순서 | 원본 순서로 차원 정규화 결과를 미리 만들고 CUMULATIVE 슬롯만 stable time sort. route 상한의 최초 admission은 time sort로 뒤집지 않음. `MetricIngestor.java:315,410,432` |
| DELTA/GAUGE/UpDownCounter | DELTA는 tracker 상태/검증/예산을 통과하지 않고 whole 값을 반환. GAUGE·non-monotonic SUM은 순간값 처리 유지. reader의 typed JSON hash는 tracked CUMULATIVE에만 계산. `CumulativeDeltaTracker.java:126`, `MetricIngestor.java:749`, `OtlpMetricsReader.java:202`. 모델 fallback hash 계산은 남아 있어 CPU 비용까지 완전 동일하다고 주장하지 않음 |
| DB commit 경계 | production `ingestOnce`의 stripe 잠금 안에서 REQUIRES_NEW receipt+store 트랜잭션이 반환한 뒤 pending 공개. receipt loser는 operation 관측을 수행하지 않아 신규 예약 없음. `MetricIngestor.java:137`, `receipt/ApmMetricBatchWriter.java:20,27`, tracker `:79` |
| 실패 후 통계·live | dropStats의 token/service 반영은 afterCommit에 등록되고 live 역시 afterCommit. 정상 rollback 때 통계·live만 먼저 공개하지 않음. `ApmIngestDropStatRecorder.java:87,129,155`, `MetricIngestor.java:269` |

## 예산 계수 검토

`CumulativeDeltaTracker.java:43~47,209~269`의 세 계수는 서로 다른 대상이다.

- `reservedSeries`: committed 계열과 아직 commit하지 않은 신규 계열 예약. `seriesPerService.compute`로 서비스별 상한도 적용하며 서비스 상한 실패 시 전역 예약을 돌려준다.
- `committedCellCapacity`: committed 실제 histogram 셀 + 각 pending snapshot이 committed보다 증가한 셀만 예약한다.
- `pendingCells`: 각 배치가 마지막으로 보관하는 pending snapshot의 실제 셀이다. 기존 계열 교체에도 필요하다.

`stage`는 양의 증가분을 먼저 CAS로 예약한다. 두 번째 풀 예약이나 snapshot 생성이 실패하면 그 단계의 신규 예약만 반환하고 이전 pending/committed는 유지한다. 교체가 성공한 뒤 감소분을 반환한다. commit은 실제 map 교체 이전 값으로 음의 차이를 정산하고, rollback은 마지막 pending과 committed 차이의 양수 부분을 돌려준다. 공통 finally에서 pending 셀을 반환한다. 현재 코드의 이 산식에서는 같은 배치의 반복 갱신이 신규 계열 수를 중복 예약하지 않는다.

`sweep(:281)`는 stripe를 확보한 만료 committed만 제거한다. 자기 배치의 pending key도 건너뛰므로 동일 스레드 재진입에서 예약을 이중 반환하지 않는다. `clear(:308)`는 배치 내부 호출을 금지하고 모든 stripe를 같은 번호순으로 잠근 뒤 map·계수를 초기화한다. batch 잠금도 번호순이므로 검토한 경로에 역순 잠금은 없다.

예산의 두 셀 풀은 snapshot 보호이며 요청 JSON/배열·delta 결과·DB row/live 자료까지 포함한 전체 heap 상한이 아니다. 프로세스 로컬 상태여서 다중 BE의 서로 다른 배치와 프로세스 재시작 연속성을 해결하지 않는다.

## BE↔FE 대조

| 항목 | BE | FE | 판정 |
|---|---|---|---|
| 전체 사유 API | `ApmIngestStatusController:46,101`: GET `/apm/ingest/drops`, optional tokenId/from/to, requireEdit | `services/apm.api.ts:468`, optional params | 일치, 경로 변경 없음 |
| 서비스 사유 API | controller `:130`: GET `/drops/by-service`, optional UUID serviceUid, requireRead | `apm.api.ts:477`, `useApm.ts:372` | 일치 |
| 전체 DTO | `ApmIngestDropsDto:57`: rows·routeOverflow. reason/string, metricName/nullable string, count/long, lastSeenAt/string, signal/string | `types/apm.ts:1401,1426`의 필드·nullable 일치 | 신규 reason 8종 등록. 기존 알 수 없는 reason의 원문 fallback 유지 |
| 서비스 DTO | `ApmServiceDropSummaryDto:14`: source/countingSinceMs/countingSince/overflowCount/services; service의 total/truncated/rows; row의 lastSeenMs 포함 | `types/apm.ts:1441~1480` | 필드 일치. record boolean `truncated` 그대로 소비 |
| 래퍼 소비 | ApiResult payload | `ApmServiceDropsLine:49~54`에서 query.data.services | 과다 언랩 없음 |
| 새 사유 전달 | tracker reason → token 기록·service 기록, METRIC signal. `MetricIngestor:758` | APM_DROP_REASONS·한/영 라벨·tone 추가 | 일치 |
| 중립 집계 | `IngestStats.lostPoints:173`에서 DUPLICATE·UNKNOWN_START 제외 | `apmCollectorDisplay:111`에서 동일 2종 제외, 표에는 유지 | 일치. stored/intentional의 기존 제외 차이가 있으므로 두 수치의 전수 동일은 아님 |
| 서비스 total | 모든 반환 사유 합(중립 포함) | 서비스 라벨을 수집 사유로 정정 | 손실량 오해 완화 |

기존 인증·HTTP200/body error 인터셉터는 이번 diff에서 바뀌지 않았다. 라이브 Swagger나 실제 로그인 호출을 재실행하지 않았으므로 이번 검토가 인증 런타임 재검증을 대신하지 않는다.

`ApmIngestDropsDto.java:53`은 rows가 상위 200행임을 명시한다. `apmLostDropCount`는 그 응답에 대해서만 합산하므로 전체 손실 총량의 증거가 아니다. 신규 중립 사유가 많아져도 이 제한을 감추면 안 된다.

## 회귀 범위 검토

작성된 테스트 코드를 읽어 다음 시나리오의 의도를 확인했다. 실행 결과는 아래 리더 증빙이 정본이다.

1. `OtlpMetricIdentityTest`: typed 구분/정렬/중복 key, resource·scope·schema·unit 변화, int64 경계·동등 표현·bytes·null, invalid identity의 포인트 단위 격리, DELTA/GAUGE 기존 수용.
2. `CumulativeDeltaTrackerTest`: 최초값·zero-duration baseline, out-of-order·중복·충돌·reset·동일 길이 schema 변화, invalid poisoning 방지, snapshot 복사, 전역/서비스/pending 한도·실패 예약 반환·self-sweep·서로 다른 stripe의 경쟁.
3. 같은 key의 snapshot 크기 `3→2→4`를 한 batch에서 바꾸는 commit/rollback 회귀를 권고했고 `CumulativeDeltaTrackerTest:292`에 반영됐다. 최종 committed 3 또는 4, pending 0, reservedSeries 1을 직접 확인한다.
4. `ApmMetricIngestAtomicityIT` 최신 편집: 독립 200/201 누적 계열을 같은 저장 차원에 합친 뒤 count 12·행 1·tracker 2, 서로 다른 tracker의 동일 receipt 경쟁, SQL/commit 실패에서 row·receipt·기준·예산·live 롤백, 신규 baseline을 포함한 재시도. 직접 tracker 테스트만으로 대체하면 안 된다.
5. `MetricIngestorTest:139,153,169,188`에 독립 상태코드 합계12, 역순 CUMULATIVE와 Gauge 순서·원본 불변, 중립 사유의 lostPoints 제외, resource enrichment의 첫 관측 보류가 있다. 실제 fixture reader 회귀와 collector 자기 메트릭 테스트도 유지됐다. route admission 보존은 구현 순서의 정적 대조로 확인했으며 이를 상한 경계의 별도 동시성 부하 시험으로 확대하지 않는다.
6. FE 담당 보고서 `./qa_apm-cumulative-fe-20261006.md`와 Jest JSON 원본을 확인했다. FE 실행을 반복하지 않았으며 BE 런타임과 연결된 브라우저 E2E 결과로 확대하지 않는다.

## 최종 검증 증빙

| 실행 주체 / 범위 | 결과 | 확인한 증빙 |
|---|---|---|
| 리더 / BE 회귀, nested 포함 XML 24개 suite | 203개, 실패0·오류0·skip0 | `../../../_archive/features/apm/hardening-20261006/apm-priority-20261006/cumulative-be/summary.json` |
| 리더 / 원시 identity | 위 203개에 포함된 24회차 통과 | 같은 summary의 `OtlpMetricIdentityTest` |
| 리더 / 실제 PostgreSQL 원자성·저장 | 위 203개에 포함된 AtomicityIT 14개, StoreIT 11개 통과, skip0 | 같은 summary 및 리더의 실제 PG 실행 확인 메시지 |
| FE 담당 / Jest | 3개 suite, 117개 통과, 실패0·skip0 | `../../../_archive/features/apm/hardening-20261006/apm-priority-20261006/cumulative-fe-jest.json`를 직접 읽어 집계 확인 |
| FE 담당 / 전체 TypeScript | `npx tsc --noEmit` 종료0 | `./qa_apm-cumulative-fe-20261006.md`의 실행 기록 |

이전 평가의 521개 또는 단계1의 79개를 이번 203개에 합산하지 않았다. bootJar의 최종 결과와 커밋 여부는 리더가 별도 기록한다.

최종 계약의 두 셀 풀·기본값·서비스별 상한과 전역 상한의 관계, 미래 허용창, 첫 관측 baseline, unknown-start와 명확한 새 epoch, parser 단계 제외의 통계 한계, 상위200행 제한을 실제 코드와 대조했다. 모두 현재 구현 범위에 맞게 기술됐다. 상위200행 제한은 계약에 반영됐으나 FE에 완전한 손실 원장이 새로 제공된 것은 아니다.

## 후속 순위와의 경계

현재 tracker의 미래 시각 검사는 `ingestOnce.preparePartitions(:133)` 이후다. 임의 과거/미래 입력의 partition DDL·보존 컷오프 보호는 순위 7과 순위 5의 선행 guard 설계에서 처리해야 한다. 본 작업의 `maxFutureSeconds`만으로 수신 전체 시간창이 보호됐다고 설명하면 안 된다.

지연 버킷의 5m/1h 재집계·retention 보호는 별도 계획 `./apm-late-rollup-20261006.md`에 정리했다. 본 작업의 CUMULATIVE 과거 포인트 거절은 metric rollup의 오래된 버킷을 복구하는 기능이 아니다.
