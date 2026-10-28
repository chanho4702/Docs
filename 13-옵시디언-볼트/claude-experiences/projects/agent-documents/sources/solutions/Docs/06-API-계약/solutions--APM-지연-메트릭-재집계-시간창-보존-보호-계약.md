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
