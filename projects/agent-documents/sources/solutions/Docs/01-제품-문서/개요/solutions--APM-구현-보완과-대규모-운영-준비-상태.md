---
title: APM 구현 보완과 대규모 운영 준비 상태
doc_type: reference
audience: [개발, 운영, QA, 기획]
status: current
owner: MovesEye 팀
baseline: 2026-10-06
reviewed_at: 2026-10-06
review_cycle: event-driven
source_of_truth: "moveseye-be-spring e55948c와 본문 검증 자료"
be_commit: e55948c7999474df6d7a580d0d6cfcf2d5143db7
previous_be_commit: 3637c77
fe_commit: 9dfcbe8
change_scope: "2026-10-06 APM 원자성·송신 큐·조회 상한·RUM 보완"
deployment_scope: source
qa_evidence: "선별 Java 521·Node 25·Chromium HTTP 4·bootJar 성공, 문서 독립 독자 검증"
---

# APM 구현 보완과 대규모 운영 준비 상태

후속 [전반 완성도 평가와 개선 우선순위](solutions--APM-%EC%A0%84%EB%B0%98-%EC%99%84%EC%84%B1%EB%8F%84-%ED%8F%89%EA%B0%80%EC%99%80-%EA%B0%9C%EC%84%A0-%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84.md)에서 원문 설정 전환·누적값 계산·화면 필터 등 추가 결함을 확인했습니다. 이 문서는 아래 4개 보완의 기록이며 전체 APM 정확성 보증은 아닙니다.

2026-10-06 후속 우선순위 1~8의 진행과 제한은 [우선순위별 보완 이력](solutions--APM-%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84%EB%B3%84-%EB%B3%B4%EC%99%84-%EC%9D%B4%EB%A0%A5.md)에 기록합니다. stage5의 dirty rollup은 SLO·availability·export 조회 완전성에 아직 반영되지 않았으므로 본 문서의 과거 scale-readiness 판단을 현재의 전체 준비 완료 근거로 사용하지 마십시오.

이 문서는 개발·운영·QA 담당자가 **무엇이 잘못됐고, 어느 코드를 어떻게 바꿨으며, 적용 시 무엇을 확인해야 하는지** 파악하기 위한 변경 기록입니다. 수정 전·후는 2절, 파일별 변경은 6절, 설정·API·적용 방법은 7절, 검증 재실행은 8절을 참조하세요.

코드 링크는 `moveseye-docs`와 `moveseye-be-spring`을 같은 상위 폴더에 둔 구성을 기준으로 합니다. `_workspace` 링크는 이 작업 환경의 원본 증거이며 문서 저장소만 clone하면 포함되지 않습니다. 핵심 동작·제한·검증 결과는 이 문서에도 기재했습니다.

**현재 APM은 핵심 기능과 대용량 방어 장치를 갖췄지만, 대규모 운영 대응이 완료됐다고 판정할 수는 없습니다.** 단일 BE에서의 수신·조회·관제 안정성을 먼저 보완했으며, 다중 BE의 상태 공유와 목표 규모별 종단 성능 검증은 남아 있습니다. 설정의 최대값은 성능 보증 수치가 아닙니다.

이 문서는 2026-10-06 사용자 지시에 따라 기존 분석을 현재 코드로 재확인하고 진행한 보완을 설명합니다. BE `3637c77`에서 `e55948c`로의 변경을 대상으로 하며, 실행 중인 공유 BE·FE를 재기동하거나 배포한 결과가 아닙니다. 목표 고객 규모는 아직 수치로 지정되지 않아 현재 기본값·설정 상한·기존 시험을 기준으로 평가했습니다.

## 1. 지금 구현된 범위

| 영역 | 소스에서 제공하는 기능 | 남은 경계 |
|---|---|---|
| 수집·서비스 성능 | OTLP 메트릭/트레이스 수신, 서비스·인스턴스 등록, RED·런타임·엔드포인트 | 계열 수 증가에 따른 저장·조회 비용, 누적형 직전값의 노드 공유 |
| 원인 조사 | 트레이스 워터폴, 오류·DB 호출·외부 의존, 서비스 맵 | 범용 로그 상관 검색·연속 프로파일링·DB 실행 계획 진단은 별도 |
| 실시간 관제 | 완료 요청 X-View, SSE, Java 진행 중 요청·걸림 장부 | 실제 동시 관제 성능·네트워크, 다중 BE 수신/조회 일관성 |
| 운영 기능 | SLO, 합성 점검, 알람 판정·이력, 리포트·내보내기 | 알람 동시 생성과 외부 전송 경계 개선, 실제 환경별 종단 검증 |
| 브라우저·환경 | RUM 페이지·오류·Vitals, 메시징·Kubernetes 관련 경로 | 실제 브라우저/브로커/클러스터 조합별 지원 증거 |
| 보존 | 1분→5분→1시간 집계, 파티션 정리, 콜드 아카이브 | 아카이브 검색·복원·pin 및 장기 상세 정책은 별도 보류 |

## 2. 이번에 보완한 결함

| 변경 | 수정 전 문제 | 수정 후 동작 |
|---|---|---|
| 메트릭 수집 | 중복 확인·가산 적재·영수증 기록이 분리됨 | 영수증 선점과 전체 1분 적재를 함께 commit/rollback. 메모리 기준값은 성공 후 공개 |
| SSE 송신 | 연결 설정은 최대 700개지만 executor 대기열은 고정 100개 | 활성+대기 연결 수에 맞춘 대기열, 연결당 작업 한 개, 종료 작업 제거 |
| 시계열 조회 | 긴 기간·짧은 간격에서 빈 데이터에도 대량 Point 할당 | 일반 시간축 20,000칸·가용성 120,000칸을 집계 전에 검사 |
| RUM Web Vitals | HTTP 503 등 일시 실패 시 관측값 소실 | 동일 본문으로 최대 3회 전송하되 시간·건수·바이트 상한과 동의 조건 적용 |

### 메트릭 재전송과 저장을 한 번의 DB 작업으로 처리

기존에는 중복 영수증 조회, 더하기 방식 메트릭 저장, 영수증 기록이 분리돼 있었습니다. 동일 본문이 동시에 도착하거나 일부 SQL만 성공한 뒤 재전송되면 집계가 달라질 수 있었습니다.

이제 메트릭 수신은 **영수증 선점과 전체 1분 집계를 같은 트랜잭션에서 커밋**합니다. 실패 시 둘 다 취소하며, 서비스 귀속 실패도 전체 배치의 503 재전송으로 처리합니다. 파티션 준비는 트랜잭션 앞에 둡니다. 누적형 메트릭의 직전값·히스토그램 경계 캐시·live 반영도 실패한 배치를 성공으로 노출하지 않도록 조정했습니다.

처리 순서는 다음과 같습니다. 원자성 범위는 영수증과 메트릭 적재이며 서비스·인스턴스 등록과 파티션 DDL까지 되돌리는 것은 아닙니다.

1. OTLP 파싱, 서비스 귀속, 적재 대상 날짜의 파티션 준비.
2. 누적형에 필요한 잠금을 순서대로 획득하고 임시 차분 상태 시작.
3. `ApmMetricBatchWriter`가 `REQUIRES_NEW` 트랜잭션을 열고 `(token_id, body_sha256)` 영수증을 `INSERT ... ON CONFLICT DO NOTHING`으로 선점.
4. 이미 커밋된 동일 요청이면 적재를 건너뜀. 새 요청이면 정규화·bounds 등록·1분 UPSERT 수행. SQL 실패는 삼키지 않고 전체 rollback.
5. DB commit 후 bounds 캐시·live·drop 통계를 공개하고 누적형 기준값 확정. Collector 상태와 Kubernetes 보강 정보는 적재 성공 뒤 처리.

트랜잭션 확대에 따른 교착도 함께 보완했습니다. bounds는 실제 `(family, bounds)` 키 순서로 먼저 등록하되 관측 행 순서는 유지해 exemplar·차원 선택 규칙이 바뀌지 않게 했습니다. route 캐시 초기화 SQL이 실패하면 예외를 다시 던지고, 정상 조회한 경우에만 `warmed`를 표시합니다. 실패한 PostgreSQL 트랜잭션을 빈 배치 성공처럼 반환하지 않도록 하기 위한 변경입니다.

전체 수신을 하나의 잠금으로 직렬화하지 않습니다. 누적형은 service/instance 단위의 256개 잠금 구역을 정해진 순서로 획득하며, DELTA·GAUGE 전용 배치는 이 잠금 없이 처리합니다. 해시가 같은 구역으로 겹치거나 한 배치가 많은 인스턴스를 포함하면 대기는 생길 수 있습니다.

**한계:** 동일 본문 중복 방어와 서로 다른 본문의 누적형 차분은 다른 문제입니다. 차분 직전값은 여전히 JVM 메모리이므로 여러 BE에 수신을 분산하거나 BE를 재시작해도 연속성이 유지된다고 보증하지 않습니다. DB는 커밋했지만 커밋 응답이 유실되어 애플리케이션이 실패로 판단하는 경우에도, 후속 새 배치의 차분 상태를 확실하게 복구하려면 영속 checkpoint가 필요합니다. Collector가 정상 수신 응답을 잃고 같은 본문을 재전송하는 경우와 구분해야 합니다. 영수증 보존기간이 지난 재전송과 바이트가 다른 동일 관측도 이번 보증 범위 밖입니다. 트레이스 영수증 경로는 이번 변경 대상이 아닙니다.

근거: [원자적 writer](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/receipt/ApmMetricBatchWriter.java), [메트릭 조립](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/store/MetricIngestor.java), [차분 상태](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/collector/ingest/normalize/CumulativeDeltaTracker.java).

### 동시 관제 연결과 송신 작업 큐의 상한 일치

기존 writer는 4개 스레드·100개 작업 큐였지만 활성 500개·대기 200개까지 설정할 수 있었습니다. 특히 전체 연결에 작업을 넣는 동안 같은 monitor를 writer도 기다리므로, 정상 연결이 많기만 해도 작업 큐가 먼저 차는 경로가 있었습니다. 실제 Servlet 송신은 비동기이므로 느린 연결 하나가 항상 writer 하나를 점유한다는 설명은 정확하지 않습니다.

작업 큐를 활성+대기 연결 상한에 맞추고 연결당 송신 작업 한 개를 유지합니다. 닫힌 연결의 대기 작업은 즉시 제거하며, socket write timeout은 실제 송신 시작부터 셉니다. 실행기 대기는 기존 연결 큐의 5초 제한으로 별도 통제합니다.

`APM_LIVE_STREAM_WRITER_THREADS`를 추가했습니다. 기본 4, 설정 범위 1~32입니다. 기본 활성 40·대기 10은 유지합니다. 송신 바이트 예산·연결별 큐 제한도 유지하며, 스레드 수를 올린다고 네트워크 처리량이 보장되는 것은 아닙니다.

근거: [stream service](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/LiveSpanStreamService.java), [연결 설정](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/overview/live/spans/ApmLiveStreamProperties.java), [SSE 검증 상세](../../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-SSE-%EC%86%A1%EC%8B%A0-%EC%9A%A9%EB%9F%89-%EB%B6%84%EC%84%9D-%EB%B0%8F-%EB%B3%B4%EC%99%84-2026-10-06.md).

### 대형 시계열의 메모리 할당을 집계 전에 거절

기존 가용성 조회는 30일·1초 간격에서 데이터가 없어도 약 259만 개 Point를 생성했습니다. 일반 시계열도 기간에 따라 빈 격자를 계속 생성할 수 있었습니다.

서비스 RED·endpoint·instance·상태코드·heatmap·runtime 시계열은 시간 격자당 **20,000칸**, 가용성은 **120,000칸**으로 제한합니다. 초과 시 메트릭 집계·대형 배열 생성 전에 `APM_QUERY_TOO_MANY_POINTS`를 반환합니다. 기존 오류 규약인 HTTP 200 + body `code:400`을 유지합니다. 400일·1시간 집계(9,600칸)와 가용성 기본 300초 간격(115,200칸)은 허용합니다. 상세는 [조회 상한 계약](../../06-API-%EA%B3%84%EC%95%BD/solutions--APM-%EC%8B%9C%EA%B3%84%EC%97%B4-%EC%A1%B0%ED%9A%8C-%EC%9E%90%EC%9B%90-%EC%83%81%ED%95%9C-%EA%B3%84%EC%95%BD-2026-10-06.md)을 따릅니다.

이것은 기간 전체를 90일로 자르는 제한이 아닙니다. 또한 시간 격자당 상한이므로 여러 계열을 합한 총 응답 크기, 모든 SQL의 스캔량, 트레이스 목록의 조회 비용을 한꺼번에 제한하는 기능도 아닙니다.

근거: [공통 상한](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmTimeRange.java), [시계열 조회](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/red/ApmSeriesQueryService.java), [가용성 조회](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/service/status/ApmAvailabilityService.java).

### RUM Web Vitals에 유한 재전송 추가

기존 snippet은 fetch가 HTTP 503을 반환해도 완료로 처리했습니다. 이제 429·502·503·504와 네트워크 실패·응답 시간 초과에 한해 최대 3회 전송합니다. 관측 유효기간은 60초, 요청 timeout은 5초, 전송 중 포함 최대 20건·직렬화 본문 합계 32KiB입니다. backoff에 jitter를 적용하고 `Retry-After`보다 먼저 보내지 않습니다.

재전송 본문의 시각·id·값을 그대로 유지해 기존 RUM 영수증 중복 제거를 사용합니다. 동의를 철회하고 반환된 정리 함수를 호출하면 대기분을 비우고 요청을 중단합니다. 페이지 종료 시 예약 재시도는 폐기하며 최종 Vital과 전송 중 요청은 keepalive 한 번에 맡깁니다. localStorage 등 영속 저장은 사용하지 않습니다.

**한계:** 브라우저 종료 시 전달을 보장하지 않습니다. 이 보완은 Web Vitals 전송에 적용되며 trace exporter의 SDK 재시도 정책을 바꾼 것은 아닙니다. 서버가 성공했으나 응답만 유실된 재전송은 저장 중복을 막더라도 기존 수신량 기반 일 예산을 다시 소비할 수 있습니다. 서버 적재 실패의 예산 환급 규칙은 유지합니다. 이미 고객에게 복사된 snippet은 새 코드로 교체해야 적용됩니다.

근거: [snippet](../../moveseye-be-spring/src/main/resources/apm/rum-snippet.js), [서버 receipt gating](../../moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/rum/ingest/RumStore.java).

## 3. 대규모 운영 판정

| 축 | 현재 방어 | 현재 판단·남은 작업 |
|---|---|---|
| 수집 폭주 | 본문·동시 수신 제한, 429/503, Collector 큐, 이번 메트릭 원자성 | 실제 Collector→BE UPSERT 지속 처리율·장애 후 회복 속도 재실측 필요 |
| 실시간 보관 | 최대 15분, 전체 140만 포인트·사전 예산, 초과 시 제한 | 메모리 보호가 전량 표시 보장은 아님. 서비스/route별 손실·표본 비율 관측 필요 |
| 동시 관제 | 기본 40+10, 설정 상한 500+200, 작업 큐와 느린 연결 격리 보완 | 합성 fan-out 검증은 있음. 실제 최대 연결·최대 프레임·프록시 시험은 별도 |
| 큰 조회 | 해상도 승격, 결과 제한, 이번 시계열 포인트 상한 | 서비스 목록 전량 로딩·전체 집계, 기간 검색 비용, 총 응답 예산 개선 필요 |
| 계열·용량 | route 제한, 파티션·집계·보존·아카이브 | 서비스·인스턴스·메트릭 계열 총량 예산, 저장 효율·용량 경보 미흡 |
| 다중 BE·HA | 일부 DB 유일성·배치 락 | live 링·누적형 차분·일부 rate limit/예산은 노드 로컬. 임의 분산·장애 전환의 정합성 미완료 |
| 알람 | 자체 판정·기록·조회와 Zabbix 통지 연결 | 열린 이벤트 동시 생성, 락/트랜잭션 내부 외부 I/O, 종료 이력 보존은 잔여 |

알람의 소유권·외부 전송 재설계는 기존의 **독자 알림 시스템과 함께 처리한다는 결정**을 유지합니다. 이번 보완으로 해당 문제까지 해결했다고 취급하지 않습니다.

### 기존 대용량 시험을 해석하는 범위

2026-09-01에는 서비스 10개·인스턴스 30개·HTTP 차원 300개/인스턴스 등의 합성 데이터 **약 1,404만 행**으로 PostgreSQL 시험을 했습니다. 당시 1분 테이블은 인덱스 포함 약 **686B/행**, 하루 데이터 약 **9.6GB**였습니다. 동일 분포를 7일로 환산한 약 67.4GB는 추정이며, 트레이스·WAL·백업·아카이브가 포함된 총 설치 용량이 아닙니다.

당시 서비스 목록 cold 조회 13~14초 문제 등에 이후 코드 개선이 들어갔습니다. 그 수치를 현재 코드의 지연으로 단정하지 않으며, 개선 뒤 같은 규모의 재측정 증거가 부족하다는 뜻입니다. 또한 SQL `INSERT SELECT` 적재 속도는 실제 OTLP 수신 처리율이 아닙니다.

서비스 수만으로 수용량을 정할 수 없습니다. 최소한 **활성 계열/분, 저장 행/일, span/초, 보존기간, 동시 관제 연결**을 함께 정해야 합니다. 근거: [기존 R3 시험](../../08-%EA%B2%80%EC%A6%9D-QA/solutions--R3-APM-Postgres-%EB%B3%BC%EB%A5%A8-%EB%A1%A4%EC%97%85-%EC%A7%88%EC%9D%98-%EC%8B%A4%EC%B8%A1-%28WBS-1.7%29.md), [9월 DB 감사](../../04-%EB%B6%84%EC%84%9D-%EA%B0%90%EC%82%AC/solutions--APM-DB-%EC%84%B1%EB%8A%A5-%EA%B0%90%EC%82%AC-%EC%9D%B8%EB%8D%B1%EC%8A%A4-%ED%96%89-%ED%81%AC%EA%B8%B0-%EC%A1%B0%ED%9A%8C-%EA%B3%84%EC%B8%B5-%282026-09-17%29.md).

## 4. 이번 검증과 적용 상태

- SSE 관련 Gradle **147개 시험 통과**(15개 클래스, 실패·건너뜀 0): 기본·확장·최대 합성 fan-out, 느린 연결 격리, 작업 대기 timeout·재연결 복구 포함. 실제 운영 네트워크 용량 시험은 아님.
- RUM Node 테스트 25개 통과. 실제 Chromium HTTP 시험 4개 통과(503 복구·동일 본문, 429 대기, 401 무재시도, 동의 철회). 브라우저 시험은 OTel SDK 대역과 로컬 시험 수신기를 사용했으며 제품 BE 종단 시험은 아님.
- 메트릭 저장 관련 최종 **86개 시험 통과**(실패·건너뜀 0). 이 안에 실제 PostgreSQL 원자성 **11개**가 포함되며, 동일 본문 경합·재전송 모사·중간 SQL/commit 실패·bounds 롤백·역순 등록·route 워밍 SQL 실패를 검증했습니다. 별도 normalize/drop/controller/pipeline 회귀도 통과했습니다. 초기 실행의 SQL 통계 기대값 실패 한 건은 단독 재실행 통과했지만 최초 간섭 원인은 확정하지 못했습니다.
- 조회 상한·RUM·아키텍처 최종 회귀 **135개 통과**(14개 클래스, 실패·건너뜀 0). 일반 시계열 6개 경로, 경계 +1ms, 30일·1초 가용성 거절, 400일 집계 유지, HTTP200/body400 오류 계약과 기존 RUM 저장 동작을 포함합니다.
- 보존한 실행의 **클래스별 최종 결과를 합하면 Java 선별 회귀 521개·63개 클래스, 실패·오류·건너뜀 0**입니다. 앞선 147·86·135와 중복되는 합계이므로 서로 더하지 않습니다. 전체 프로젝트 테스트를 전부 실행했다는 뜻은 아닙니다. [최종 집계](../../_workspace/verification/apm-20261006-final-summary.json).
- JDK 17에서 `:bootJar --max-workers=1` 성공. [통합 검증 기록](../../08-%EA%B2%80%EC%A6%9D-QA/solutions--APM-%EC%8B%A0%EB%A2%B0%EC%84%B1-%EB%8C%80%EA%B7%9C%EB%AA%A8-%EB%8C%80%EC%9D%91-%EB%B3%B4%EC%99%84-%EA%B2%80%EC%A6%9D-2026-10-06.md).
- FE 응답 성공 shape, 경로, DB 스키마 변경 없음. BE의 기존 `ApmCollectorController.java` 미커밋 변경은 보존했습니다.
- 공유 BE·FE 재기동과 운영 배포는 수행하지 않았습니다. 소스 커밋 상태는 9절을 따릅니다.

## 5. 다음 작업의 우선순위

1. **목표 규모를 정한 종단 시험:** 수집·롤업·조회·SSE를 동시에 실행하고 CPU·힙·GC·DB p95·큐 지연·유실/중복을 측정합니다. 이후 설치 사양과 지원 규모를 확정합니다.
2. **계열·저장 비용 통제:** service/instance cardinality 예산, 등록 폭주·유령 인스턴스 정리, 서비스 목록 집계/페이지네이션, 행 크기 절감과 실제 SQL 계획 검증.
3. **다중 BE가 필요할 경우 상태 소유권 설계:** 누적형 차분·live 수신/조회 라우팅·예산 공유·장애 전환을 함께 정합니다. BE 복제 수 증가만으로 해결되지 않습니다.
4. **알람 재설계:** 단일 이벤트 소유권·DB 유일성·외부 전송 분리·종료 이력 보존을 독자 알림 작업과 함께 처리합니다.
5. **실환경 검증·확장:** Kubernetes·메시징·비-JVM·아카이브 파일시스템별 종단 증거를 채우고, 고객 요구에 따라 복원·로그 상관·프로파일링을 추진합니다.

## 6. 파일별 변경 내역

아래 Java 경로는 별도 표시가 없으면 `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/` 아래입니다.

| 파일·클래스 | 구체적 변경 |
|---|---|
| `collector/ingest/ApmIngestPipeline.java`, `MetricIngestPipeline.java`, `ApmOtlpController.java` | `ingestOnce` 경로 추가. 메트릭 요청을 원자적 writer로 연결하고 중복 요청의 성공 응답 유지. traces 기존 경로 보존 |
| `collector/ingest/receipt/ApmMetricBatchWriter.java` **신규** | 영수증 선점과 적재 callback을 같은 독립 트랜잭션으로 실행. DB 유일 키로 동시 동일 본문 처리 조정 |
| `collector/ingest/receipt/ApmOtlpReceiptService.java` | 메트릭·트레이스의 영수증 처리 책임을 주석에 구분 |
| `collector/ingest/store/MetricIngestor.java` | 서비스 귀속 선처리, 파티션 준비, 누적형 batch 잠금, 성공 이후 live·Collector 상태 반영 |
| `collector/ingest/normalize/CumulativeDeltaTracker.java` | 256개 잠금 구역과 배치 임시 상태 도입. 성공 시 기준값 공개, 실패 시 폐기 |
| `collector/ingest/store/ApmMetric1mStore.java` | bounds 선등록 순서 통일·결과 재사용, 트랜잭션 전용 캐시, commit 후 공유 캐시 반영, SQL 실패 전파 |
| `collector/ingest/normalize/ApmDimsNormalizer.java` | route 워밍 SQL 실패를 실제 트랜잭션에서는 전파. 성공 전 `warmed` 표시 방지 |
| `collector/ingest/drop/ApmIngestDropStatRecorder.java` | 트랜잭션 중 기록한 drop 통계를 commit 후 반영하여 rollback 배치의 통계 공개 방지 |
| `overview/live/spans/LiveSpanStreamService.java` | executor 용량 산정, 연결별 작업 추적·취소, 실행 대기와 실제 write timeout 구분 |
| `overview/live/spans/ApmLiveStreamProperties.java`, `src/main/resources/application.yml` | `writer-threads` 설정과 1~32 검증, 기본 4 유지 |
| `core/metric/ApmTimeRange.java` | long 기반 포인트 수 검증과 일반/가용성 상한 정의 |
| `service/red/ApmSeriesQueryService.java`, `service/status/ApmAvailabilityService.java` | 실제 시간축 크기를 집계 SQL·배열 생성 전에 검사 |
| `engine-api/.../common/exception/ErrorCode.java` | `APM_QUERY_TOO_MANY_POINTS` 오류 코드 추가 |
| `src/main/resources/apm/rum-snippet.js` | Web Vitals 재전송 큐, 동일 본문 재사용, Retry-After·timeout·동의·페이지 수명 처리 |
| `rum/ApmRumIngestController.java`, `ApmRumIngestMvcTest.java` | 브라우저가 503을 재시도하지 않는다는 오래된 주석 정정. 서버 처리 로직은 유지 |

신규 회귀 테스트는 `ApmMetricIngestAtomicityIT`, `LiveSpanStreamScaleTest`, `ApmQueryResourceLimitTest`입니다. 기존 `ApmOtlpControllerTest`, `CumulativeDeltaTrackerTest`, `ApmMetric1mStoreIT`, `ApmLiveStreamPropertiesTest`, `ApmAvailabilityServiceTest`, `src/test/resources/apm/rum-snippet.test.mjs`도 변경했습니다. `ApmMetric1mStoreIT`는 token 삭제 전에 대기 drop 통계를 flush하여 fixture 간 FK 간섭을 막습니다.

## 7. 설정·API·적용 영향

### 설정과 코드 상한

| 항목 | 값 | 변경 방법 |
|---|---|---|
| SSE writer 스레드 | 기본 4, 허용 1~32 | 신규 환경변수 `APM_LIVE_STREAM_WRITER_THREADS`, Spring 속성 `app.apm.live.spans.stream.writer-threads` |
| SSE 활성 연결 상한 | 기본 40, 최대 500 | 기존 `APM_LIVE_STREAM_MAX_ACTIVE`, Spring 속성 `app.apm.live.spans.stream.max-active` |
| SSE 대기 연결 상한 | 기본 10, 최대 200 | 기존 `APM_LIVE_STREAM_MAX_WAITING`, Spring 속성 `app.apm.live.spans.stream.max-waiting` |
| SSE executor 작업 큐 | 활성+대기 연결 상한의 합 | 별도 환경변수 없음. 기존 연결 설정에서 계산하며 최대 700 |
| 일반 시계열 시간축 | 최대 20,000칸 | `ApmTimeRange.MAX_SERIES_POINTS` 코드 상수 |
| 가용성 시간축 | 최대 120,000칸 | `ApmTimeRange.MAX_AVAILABILITY_POINTS` 코드 상수 |
| RUM 관측 보관 | 전송 중 포함 최대 20건·본문 합계 32KiB·60초 | snippet 내부 상수. 영속 저장 없음 |
| RUM 전송 | 최초 포함 최대 3회·요청당 5초 timeout | snippet 내부 상수. 1초 기반 지수 backoff+jitter, `Retry-After` 우선 |

SSE 기동 로그에서 writer 수와 작업 큐 용량을 확인할 수 있습니다. 스레드 증설 전 실제 CPU·송신 대기·연결 종료 지표를 측정해야 하며 최대 설정을 기본 권장값으로 해석하지 않습니다.

### API 호환성

URL·인증/권한·성공 payload는 유지합니다. 조회 초과 오류는 기존 HTTP **200** + body **`code:400`** 규약을 따릅니다. FE의 필수 수정과 DB migration은 없습니다.

적용 경로는 `GET /apm/services/{uid}/` 아래 `red-series`, `endpoints/series`, `instances/{instanceId}/series`, `status-codes`, `latency-heatmap`, `runtime`, `availability`입니다. instance의 기존 제공 불가 해상도는 빈 응답을 유지합니다. availability의 step 생략·0 이하 기본값은 기존 300초입니다.

아래는 초과 오류의 관련 필드 예시입니다. `requestedPoints`는 계산한 long 값이며 가용성에서는 `maxPoints`가 120,000입니다.

```json
{
  "code": 400,
  "errorCode": "APM_QUERY_TOO_MANY_POINTS",
  "message": "조회할 시간 구간이 너무 많습니다. 기간을 줄이거나 조회 간격을 늘려 주세요.",
  "data": { "maxPoints": 20000, "requestedPoints": 20001 }
}
```

RUM은 429·502·503·504·네트워크 오류·timeout만 재시도합니다. 200의 `partialSuccess`, 401 등 영구 오류와 500은 재시도하지 않습니다. `Retry-After`가 남은 60초 유효기간을 넘으면 조기 재전송하지 않고 해당 관측을 폐기합니다.

### 적용 및 되돌리기

서버 보완은 새 BE JAR을 배포·재기동해야 적용됩니다. writer 설정을 생략하면 기존 4개 스레드를 사용합니다. 이 작업에서는 공유 서버를 재기동하지 않았습니다.

이미 고객 애플리케이션에 복사한 RUM snippet은 **해당 애플리케이션에서 교체·재배포**해야 합니다. BE JAR 교체만으로 기존 복사본은 바뀌지 않습니다. 동의 철회 시 `consentGranted()`가 false를 반환하게 하고 초기화 함수가 반환한 정리 함수도 호출해야 합니다. `pagehide`는 대기 재시도를 버리며, 페이지가 복원되어도 버린 관측을 다시 보내지 않습니다.

DB 스키마 변경이 없어 서버를 이전 JAR로 되돌리는 데 별도 역방향 migration은 없습니다. 다만 이전 버전의 수신·조회·SSE 문제가 다시 노출됩니다. RUM 복사본의 롤백은 서버와 별도로 관리합니다.

## 8. 검증 재실행 안내

JDK 17·Node.js와 프로젝트의 PostgreSQL 통합 테스트 환경이 필요합니다. 공유 IT DB를 쓰는 Gradle 테스트는 동시에 실행하지 않습니다. 아래 명령은 BE 저장소 루트에서 순차 실행하는 대표 재검증이며, 과거 521개 집계와 정확히 같은 클래스 집합을 뜻하지 않습니다.

```powershell
.\gradlew.bat :test --max-workers=1 --tests '*collector.ingest.*'
.\gradlew.bat :test --max-workers=1 --tests '*overview.live.spans.*'
.\gradlew.bat :test --max-workers=1 --tests '*ApmQueryResourceLimitTest' --tests '*ApmAvailabilityServiceTest' --tests '*ApmSeriesSelfExplainTest' --tests '*ApmExportGridParityTest' --tests '*ApmResolutionTest' --tests '*premium.apm.rum.*' --tests '*OtelArchitectureTest'
node --test src/test/resources/apm/rum-snippet.test.mjs
.\gradlew.bat :bootJar --max-workers=1
```

실제 브라우저 검증 스크립트는 작업 환경의 `_workspace/verification/apm-20261006-rum-browser.py`입니다. Python Playwright와 Microsoft Edge를 사용하며 OTel SDK는 대역, HTTP는 로컬 시험 수신기입니다. 원자성 시험의 DB SQL/commit 실패는 실제 PostgreSQL에서 유발했지만, 응답 유실은 동일 본문 재호출로 모사한 것입니다. 운영 네트워크 장애 시험으로 해석하지 않습니다.

## 9. 변경 이력과 커밋 범위

- **2026-10-06:** APM 현재 구현·규모 대응 분석, 4개 보완, 선별 회귀·브라우저 검증·JAR 빌드 완료.
- **2026-10-06 문서화:** 수정 전·후, 트랜잭션 범위, 파일별 변경, 오류 계약, 설정·적용/롤백·재검증 절차를 추가.
- **독립 독자 검증:** 문서만 읽은 검토자가 변경 전후·원자성·SSE·오류 계약·적용/롤백·시험 한계·재검증의 7개 질문에 답함. 관측 수의 집계 범위를 통일하고 기존 연결 환경변수도 명시함.
- **BE 커밋 `e55948c7999474df6d7a580d0d6cfcf2d5143db7`:** `#ZM-122 [FIX] APM 수신 원자성·SSE 송신 큐·조회 상한·RUM 재시도 보완 -2026-10-06`. 코드·설정·테스트 29개 파일, 1,496줄 추가·130줄 삭제.
- BE의 기존 `ApmCollectorController.java` import 정리는 이번 변경에 포함하지 않습니다. FE 소스 변경은 없습니다.
- 문서 저장소의 기존 파일명 변경·다른 문서 편집은 별도 작업으로 보존합니다. 이 보고서만 선택하여 커밋하고, 로컬 인벤토리의 안내는 유지합니다. 원격 push와 배포는 별도입니다.

2026-10-06 후속으로 dirty/legacy/bootstrap 상태를 SLO, snapshot, availability, RED·endpoint export 소비자까지 연결했습니다. 해당 소비자 경로에서 불완전 데이터가 정상 값으로 표시되는 위험은 줄였지만, 선택 회귀 테스트는 대규모 처리량·장시간 부하·다중 BE 장애 복구를 증명하지 않습니다. 우선순위별 상세와 잔여 범위는 [보완 이력](solutions--APM-%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84%EB%B3%84-%EB%B3%B4%EC%99%84-%EC%9D%B4%EB%A0%A5.md)을 참조하십시오.
