# APM 지연 메트릭 재집계 독립 검수

작성일: 2026-10-06. 상태: **3차 정적 검수 완료, 루트의 실제 PostgreSQL 실행 결과 대기**.

검수 대상은 `planning/apm-late-rollup-20261006.md`, `contract_apm-late-rollup-20261006.md`, BE·FE 현재 작업 트리다. 제품 코드, DB, 서버, 테스트, 빌드, 커밋은 변경하거나 실행하지 않았다. 아래 반례는 코드로 도출한 검증 시나리오이며 실제 PostgreSQL 실행 결과가 아니다. 구현 담당자의 동시 수정으로 줄 번호가 이동할 수 있다.

## 발견 사항

BE 경로는 `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/` 기준이다.

| ID | 기대 | 현재 코드와 반례 | 심각도 | 권고·상태 |
|---|---|---|---|---|
| RQ-1 | 하류 queue가 full이어도 하류 소비가 실행되어 자동 복구 | 초기 `core/batch/rollup/ApmRollupJob.run`은 `rollup5m` 실패 시 `rollup1h` 미실행 | 높음 | **코드 수정 확인.** 5m 예외를 보관하고 1h 실행 후 오류를 보고한다. `fullHourlyQueueStillDrainsWhenFiveMinuteStageFails` 작성 확인, 실행 결과는 루트 담당 |
| RQ-2 | 불완전한 과거 원본으로 기존 target을 대입하지 않음 | 구 버전 raw 삭제 후 부분 재수신으로 raw=5, 기존 5m=10일 수 있음. 현재 보존 cutoff 및 count 비교만으로는 완전성 증명이 안 됨 | 높음 | **코드 수정 확인.** 실제 도입 instant를 기준으로 이전 existing target 대입을 차단하고 legacy HOLD를 압축한다. 동일 count/다른 sum 회귀 작성 확인. 운영상 제약은 아래 참고 |
| RQ-3 | 복구 불가능한 앞쪽 항목이 뒤의 복구 가능한 항목을 굶기지 않음 | 초기 ready60은 upstream pending hour도 먼저 N개로 선택 | 높음 | **코드 수정 확인.** ready60의 `NOT EXISTS upstream`으로 선두 독점 차단. 일시 pending은 forward 대기, 영구 blocked는 1h `UPSTREAM_BLOCKED`를 영속화한 뒤 진행 |
| RQ-3b | 구 버전의 target·watermark 부분 완료를 인계해도 최신 hour 집계 진행 | 구 버전에서 target B 저장 후 별도 watermark 저장 전에 종료한 상태(target B, watermark B-5m)면 legacy HOLD가 5m frontier와 최신 1h ceiling을 붙잡음 | 높음 | **코드 수정 확인.** 루트 결정에 따라 같은 transaction에서 HOLD/blocked 근거를 먼저 남긴 뒤 `holdAndAdvance`로 첫 순회 watermark 전진. 새 업그레이드 회귀는 과거 sum100 유지·현대 5m/1h=20·과거 원본 삭제 HOLD를 확인하도록 작성됨. 조회 소비자의 WM 단독 신뢰 한계는 아래 별도 미해결 |
| RQ-4 | DB session 시간대와 JVM bucket 축이 달라도 cutover 일치 | 루트가 V70 `localtimestamp`의 UTC/KST 불일치를 발견 | 높음 | **코드 수정 확인.** V70 `timestamptz CURRENT_TIMESTAMP` → JDBC `OffsetDateTime` → Instant → JVM LocalDateTime → 다음 stage 경계. DB 세 시간대 회귀 작성 확인 |

## RQ-2의 합의된 최소 보호 정책

루트는 실제 도입 시각 cutover와 legacy 기존 target 보류를 승인했다. bootstrap의 legacy 보호 범위는 압축된 상태로 남겨 일반 dirty queue 슬롯을 모두 소모하지 않게 하고, 새 수신 때문에 생긴 역사 marker는 유한 queue에 남긴다. 해당 legacy 범위의 원본 자동 삭제도 보류한다.

이 정책은 기존의 정상적인 역사 집계도 보수적으로 보호한다. 도입 전 데이터 전체의 정확성을 보증하지 않으며, 검증한 backfill이나 복원 후 보호를 해제하는 운영 절차가 아직 구현되지 않으면 문서에 미해결로 표시해야 한다. stage별 cutoff와 첫 경계 버킷의 범위를 명시해야 하고, 단순히 현재 보존 기간 안이라는 사실을 과거 완전성 증거로 삼으면 안 된다.

### 최종 구현의 운영 영향

- `legacy_hold`는 stage별 진단 boolean이며 실제 보존 gate는 날짜별 기존 target 존재를 다시 조회한다. 자동 해제되지 않는 진단과 실제 삭제 가능 여부는 같지 않다.
- cutover 이전 target이 하나라도 있는 날의 raw/5m 원본은 보수적으로 남는다. 상류 partition이 존재하면 하류 삭제도 막으므로 해당 날짜의 1h도 나중에 함께 남을 수 있다. 일반 보존 기간이 지나도 자동 정리되지 않는 범위를 운영 문서에서 명시해야 한다.
- bootstrap가 제외한 역사 target은 queue 슬롯을 쓰지 않는다. 반면 신규 역사 수신이 만든 marker는 blocked여도 `pending_count`에 남는다. 이 marker가 configured capacity를 채우면 현대 버킷의 새 수신도 503으로 밀려난다. 기본 raw 7일과 4096 슬롯만으로 모든 사용자 보존 설정을 보증할 수 없다.
- `enqueueLocked`는 기존 blocked reason을 null로 초기화하고 generation을 증가시킨다. 따라서 새 수신 때 같은 역사 버킷이 재평가되지만 cutover 보호가 유지되는 한 다시 blocked가 된다. marker를 잃지는 않으나 운영 복구 또는 검증된 해제 없이 슬롯이 회수되지는 않는다.
- `count` 축소 검사는 cutover 이후 외부 삭제 등 일부 이상을 추가 감지하는 장치다. 같은 count의 다른 sum/min/max/histogram을 검증하는 완전성 근거가 아니다. legacy 보호를 대신하지 않는다.
- JVM 시스템 시간대를 변경하면 기존 timestamp 파티션·원본 축 전체가 달라지는 기존 제약은 여전히 남는다. 이번 수정은 DB session과 JVM 시간대의 불일치를 바로잡으며 운영 중 JVM timezone 변경을 지원한다고 뜻하지 않는다.

### watermark 의미 변경이 조회에 남기는 영향

루트는 개별 미완료를 HOLD/blocked로 남긴 뒤 기존 watermark를 첫 순회 진행점으로 전진시키는 정책을 선택했다. `ApmRollupService:252~286`에서 이 순서가 같은 transaction 안에 있고, `ApmSettingService.saveWatermark`의 REQUIRED transaction이 해당 transaction에 참여하는 것을 확인했다. marker 또는 HOLD 저장이 실패하면 watermark만 독립적으로 커밋되는 구조가 아니다. retention은 pending·legacy target·bootstrap를 별도로 확인하므로 watermark만으로 원본을 삭제하지 않는다.

다만 다음 소비자는 여전히 watermark를 집계의 신뢰 경계로 사용한다.

| 소비자 | 남는 영향 |
|---|---|
| `service/status/ApmAvailabilityService.pctTailStart` | HOLD 구간도 watermark가 지났다는 이유로 raw fallback에서 빠질 수 있음 |
| `slo/ApmSloCalculator.coarseTrustedUntil` | 미완료 또는 검증하지 못한 과거 집계가 SLO 계산의 coarse 신뢰 범위에 들어갈 수 있음 |
| `export/source/ApmRedSeriesExporter.incompleteFrom` | dirty/HOLD가 남았어도 내보내기 미완료 표시가 없을 수 있음 |
| `export/source/ApmEndpointExporter.plan` | 동일하게 WM만으로 완전성 범위를 판단하여 남은 변경을 설명하지 못할 수 있음 |

이는 계약 문서의 `남는 범위`에 명시되어 있다. **집계 작업의 진행과 원본 삭제 보호는 개선됐지만, 화면·SLO·내보내기를 포함한 완전성 판단은 아직 완료되지 않았다.** 대규모 운영·정확성 평가에서 이 항목을 단순 문서 제약으로 낮추면 안 된다. 과거 target의 수치가 유지된다는 사실은 최신 source와 일치한다는 보증이 아니다.

`legacyTargetCommittedWithoutWatermarkDoesNotStopModernFiveMinuteAndHourlyWork`는 이 정책의 핵심 인계 시나리오를 확인하도록 작성됐고, 일시 pending의 기존 frontier 유지 회귀도 함께 보존됐다. 테스트 실행 성공 여부는 루트가 별도로 확인한다.

## 경계면 대조

| 항목 | 기대(BE·계약) | 실제(FE) | 판정 |
|---|---|---|---|
| 폐기 reason | `METRIC_TIME_EXPIRED`, `METRIC_TIME_FUTURE`, `METRIC_TIME_RETIRED` | `src/types/apm.ts`의 `APM_DROP_REASONS` 및 kr/en 번역에 세 값 존재 | 일치 |
| 수집 제외 집계 | 세 값은 저장하지 않은 영구 정책 제외 | `apmLostDropCount`가 stored/intentional/observation-only에 해당하지 않는 세 값을 포함 | 일치 |
| OTLP 정책 제외 응답 | 기존 HTTP 200 `{}`, 신규 `partialSuccess` 필드 없음 | FE용 새 성공 payload 계약 없음. OTLP는 수집기가 호출 | 컨트롤러 `ApmOtlpController` 528~529 확인 |
| 일시 오류 | queue·DB·잠금 오류는 HTTP 503, 수신 transaction rollback | 기존 OTLP 성공·오류 처리 변경 없음 | 컨트롤러 catch 530~538 확인. 실제 HTTP·DB 검증은 루트 담당 |
| Swagger 사유 설명 | 신규 reason을 문서에 표시 | BE `ApmIngestDropsDto.Row.reason` 설명에는 아직 세 값 미반영 | 구현 중 문서 배선 확인 필요, 기능 blocker로 세지 않음 |

시각 제외는 서비스 등록/귀속 전에 결정되므로 현재 구현은 token 축의 전역 폐기 통계에 기록한다. 서비스 축 통계에 세 reason이 실제로 포함된다고 주장하려면 별도의 귀속·recordForService 경로가 필요하다. 계약은 전역 통계 범위로 명확히 적는 편이 현재 코드와 맞는다.

## 현재 확인한 정합성 장치

- source UPSERT와 dirty enqueue는 Spring 적재 경로에서 같은 REQUIRED transaction에 참여한다.
- queue 상태 행은 stage 오름차순으로 잠그고, generation 조건부 ACK가 새 수신의 marker를 보존한다.
- stage transaction advisory lock은 forward와 repair의 동일 target 결과 역행을 막는다.
- 메트릭 날짜 공유 잠금과 retention 배타 잠금을 같은 키로 사용하며, archive OFF에서도 메트릭 보존 gate를 적용한다.
- `ApmPartitionService.ensurePartition`는 잠금 안에서 retired 경계를 재검사하고 캐시만 믿고 파티션 존재를 판단하지 않는다.

이 항목들은 정적 읽기에서 확인한 구현 구조다. latch·실제 두 connection을 사용한 경합 검증을 대체하지 않는다.

## 최종 재검토 시 필요한 증거

1. queue full 상황에서도 job이 1h를 소비하여 다음 회차 5m가 복구되는 실제 job 경로.
2. 도입 전 보존 축소→삭제→확대→부분 재생성, 동일 count/다른 sum, 누락된 target key의 보호.
3. bootstrap legacy 범위가 dirty queue 상한을 영구 소모하지 않고 원본 보호 상태로 남는지 확인.
4. 영구 blocked upstream 여러 hour 뒤에 있는 정상 hour repair의 진행.
5. source snapshot 뒤 다른 connection이 원본과 generation을 commit했을 때 오래된 ACK가 marker를 지우지 않는지 확인.
6. 5m result·1h 전파·ACK·watermark 실패의 전체 rollback, 수신 queue 초과의 receipt·tracker rollback.
7. retention과 producer/consumer 동시 실행, DDL 준비 후 DROP 및 설정 변경 시 파티션 재생성 방지.
8. 최종 DTO 설명·계약 문서·FE reason 표현 대조.

최종 판정: **RQ-1·RQ-2·RQ-3·RQ-3b·RQ-4는 최종 코드에서 수정 확인했다. 현재 허용된 수집·재집계·원본 보존 범위에서 추가 정적 blocker는 발견하지 못했다. 실제 PostgreSQL 실행 성공은 아직 이 검수의 증거가 아니며, 조회·SLO·내보내기 완전성 및 legacy 해제 운영 절차는 높은 우선순위의 미해결로 남는다.**
