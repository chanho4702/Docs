# APM 대규모 처리 감사 및 조회 자원 보호 — 2026-10-06

판정: **대규모 처리를 고려한 방어선은 존재하지만, 수천 서비스·다중 BE·운영 규모 동시 부하까지 준비됐다고 판정할 증거는 없다.** 단일 DB의 파티션·rollup, 라이브 메모리 제한, 일부 목록 상한과 브라우저 표시 제한은 구현됐다. 서비스/인스턴스 총량, 차원 조합 수, 노드 간 라이브·예산 공유와 실측 검증은 별개다.

이번 범위는 `moveseye-be-spring/premium/apm`의 저장·조회·보존·cardinality 및 FE 표시 한도다. OTLP 영수증 원자성과 SSE writer 수정은 다른 담당 범위이므로 해당 완료 판정은 최종 통합 보고서를 따른다. 공유 서버 재기동·DB 변경·부하 시험은 이 감사에서 실행하지 않았다. 테스트 실행은 root가 순차 조율한다.

경로 표기: `BE/`는 `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/`, `FE/`는 `moveseyee_fe/src/`, `SQL/`은 `moveseye-be-spring/src/main/resources/db/migration/`다. 행 번호는 본 작업 시점 소스 기준이다.

## 1. 바로 확인하고 보완한 자원 소모 경로

### Q1. 가용성의 무제한 포인트 생성 — 구현 완료, 통합 테스트 결과 별도

- 수정 전 `service/status/ApmAvailabilityService.java:179-180`은 `duration / requestedStep`을 `int`로 축소하고, 219행부터 그만큼 `Point`를 생성했다. `ApmTimeRange.of`에는 최대 기간이 없다.
- `GET /apm/services/{uid}/availability`는 `step=1`도 받아들인다(`service/ApmServiceController.java:236`). 30일이면 **2,592,000개**, 90일이면 **7,776,000개**의 점을 생성한다. DB에 데이터가 없어도 빈 칸을 채운다. 이 수치는 코드 산식이며 실제 OOM 재현 결과가 아니다.
- 보존에 따라 5m/1h 테이블을 고르는 기능은 요청된 가용성 칸 폭을 바꾸지 않으므로 위 할당을 방지하지 못한다. 매우 큰 입력은 `int` 변환 overflow까지 가능했다.
- **수정:** long 값으로 먼저 검사하고 **120,000칸**을 초과하면 DB 집계·배열 생성 전에 `APM_QUERY_TOO_MANY_POINTS`를 반환한다. 기본 300초, 요청 step 보존, 빈 칸의 의미는 유지한다. 400일 기본 간격은 **115,200칸**으로 허용된다.
- 근거: `BE/core/metric/ApmTimeRange.java:33`, `:36`, `:39`; `BE/service/status/ApmAvailabilityService.java:180`.

### Q2. 일반 시계열의 무제한 빈 격자 생성 — 구현 완료, 통합 테스트 결과 별도

- 수정 전 `service/red/ApmSeriesQueryService.grid`는 시작을 바닥 경계로 내린 뒤 끝까지 반복했다. 자동 1시간 해상도라도 임의의 매우 큰 종료 시각을 받으면 유한한 실용 상한이 없었다.
- **수정:** RED, endpoint RED, 유효한 instance RED, status code, heatmap, runtime의 **시간축 격자**를 20,000칸으로 제한한다. 각 공개 조회에서 메트릭·패밀리·배포 집계 전 검사하고, `grid` 자체에서도 다시 검사한다. floor로 생긴 첫 칸과 마지막 부분 칸까지 센다.
- 400일 자동 1시간 해상도 **9,600칸**, 최근 7일 1분 해상도 **10,080칸**은 유지한다. 기간을 일괄 90일로 잘라 장기 집계 기능을 없애지 않았다.
- 기존처럼 1m 축으로 답할 수 없는 instance 조회는 빈 시계열을 반환한다. 새 제한은 실제 격자를 생성하는 경로에 적용된다.
- 근거: `BE/service/red/ApmSeriesQueryService.java:172`, `:195`, `:225`, `:556`, `:619`, `:720`, `:880`, `:893`.
- **한계:** 20,000은 격자 한 개의 시간축 칸 수다. runtime 계열 수·histogram 열 수를 곱한 전체 JSON 크기/포인트 예산이 아니다. 전 계열 합계, SQL 스캔 행 수, 요청 동시성까지 해결됐다는 뜻이 아니다.

계약은 [`./contract_apm-query-resource-limits.md`](contract_apm-query-resource-limits.md)에 기록했다. 응답은 기존 규약대로 **HTTP 200 + body code 400**, 성공 payload shape은 동일하다.

## 2. 현재 있는 규모 방어선과 그 적용 범위

| 축 | 확인한 기본값·상한 | 판정과 근거 |
|---|---|---|
| DB 메트릭 보존 | 1m 7일 / 5m 30일 / 1h 400일 | 일 파티션과 3단 집계 구현. `BE/core/batch/retention/ApmRetentionDays.java:70-72`; `SQL/V38__apm_p1.sql:209-278` |
| trace 보존 | span·summary 7일, edge·DB·dependency 30일, error group 시간 집계 90일 | `ApmRetentionDays.java:83-88`. 날짜별 DROP과 그룹 본체 정리를 구분함 |
| RUM 보존 | 5m 30일 / span 7일 / 오류 지문 90일 | `ApmRetentionDays.java:99-103` |
| registry 캐시 | TTL 10분 / last-seen 쓰기 60초 절제 / 맵 20,000 초과 시 clear | `BE/service/registry/auto/ApmRegistrar.java:86-96`, `:412-458`. 캐시 크기는 DB 서비스/인스턴스 수 상한이 아님 |
| 메트릭 route cardinality | 기본 서비스당 500, 초과 `__other__`; 추적 서비스 LRU 512 | `BE/collector/ingest/normalize/ApmDimsNormalizer.java:65`, `:73`, `:89-95`, `:282`. method/status/runtime 차원 조합 전체를 500개로 제한하는 것은 아님 |
| 라이브 요약 메모리 | 기본 서비스 200 / route 200 / heap budget 384MiB, 서비스 설정 최대 2,000 | `BE/overview/live/ApmLiveProperties.java:95`, `:104`, `:145-160`. 곱셈 기반 기동 검증 있음. 설정 최대값은 처리량 보장값이 아님 |
| 라이브 점 저장 | 창 기본·최대 900초, 전체 1,400,000점, base 기본 1,300,000 / emphasis 기본 50,000 | `BE/overview/live/spans/LiveSpanStorageProperties.java:12-26`. 노드 메모리 상한이며 DB 보존과 별개 |
| trace 상세·목록 | 상세 5,000 span, 목록 최대 500, scatter 최대 600셀×20점 | `BE/trace/query/ApmTraceQueryService.java:50`, `:73-78`. scatter 반환량 제한은 기간 내 SQL 스캔량 제한과 다름 |
| 서비스맵 | edge 최대 2,000 + truncated 표시 | `BE/servicemap/ApmServiceMapQueryService.java:37`, `:99-128`. 서비스 노드 seed 전체와 edge 상한을 혼동하면 안 됨 |
| endpoint·dependency·DB 목록 | 각 최대 500 | `BE/service/red/ApmSeriesQueryService.java:103`; `BE/trace/dependency/ApmDependencyQueryService.java:32`; `BE/trace/dbquery/ApmDbQueryService.java:36` |
| job 조회 | job 500 / run 2,000 / lane별 200 | `BE/job/ApmJobQueryService.java:46-62` |
| rollup catch-up | 회차당 5m bucket 60 / 1h bucket 12 | `BE/core/batch/rollup/ApmRollupService.java:115-117`. 단일 문장 크기 축소 구현; 이전 주석의 '하루/이틀' 표현은 실제 5시간/12시간과 다름 |
| 배치 중복 실행 | scheduler_lease job_key 방어 | `BE/core/batch/rollup/ApmRollupJob.java:42`; partition·retention·trace rollup도 동일 scheduler 경유. 이것이 실시간 메모리 공유를 제공하지는 않음 |
| RUM token | 기본 일 관측 100,000 / 최대 10,000,000 / RPS 설정 최대 1,000 | `BE/rum/token/RumTokenService.java:43-44`. 일 예산은 노드 로컬 |
| 브라우저 live | projection 300,000점 / dense 100,000점 / 5m snapshot 32MiB·15m 96MiB / 서비스 타일 60 | `FE/pages/application-monitoring/realtime/liveSpans/constants.ts:6-9`, `:46`; `view.ts:160`. 하드웨어에서의 FPS·메모리 증명과 별개 |
| 브라우저 instance 비교 | 동시 시계열 최대 6 | `FE/pages/application-monitoring/services/detail/tabs/ApmServiceInstancesTab.tsx:49`, `:123` |

## 3. 남은 병목·HA 공백

### 높음: BE 수평 확장은 라이브와 예산의 합산을 보장하지 않는다

`RumRateLimiter.java:13-19`가 명시적으로 단일 노드 `HashMap` 일 예산이며 재시작 시 초기화된다고 설명한다. N개 BE가 독립적으로 예산을 가지면 구성 전체의 허용량이 최대 N배가 될 수 있다. 라이브 링·buffer 역시 노드 메모리다. 공유 PostgreSQL과 batch lease가 있어도 분산 수신한 라이브를 다른 노드 SSE에서 자동으로 합쳐 볼 수 없다. sticky session만으로 모든 Collector 수신과 사용자 시청의 동일 노드 배치를 보장하는 설계가 되지는 않는다.

이번 조사에서 분산 fan-in/라우팅·일 예산 외부화·롤링 재기동의 수량 보존을 닫은 종단 검증 자료는 찾지 못했다. 따라서 **다중 BE에서 DB 집계까지 모두 N배가 된다**고 단정하지 않고, 노드 로컬 상태가 실제로 필요한 경로를 나눠 판단해야 한다.

### 중간~높음: 서비스 목록은 서버 페이지 조회가 아니다

`BE/service/list/ApmServiceQueryService.java:179`에서 `services.findAll()` 후 필터링하고, `:613-673`에서 대상 전체에 RED·spark·recent·가용성·instance를 조립한다. instance 전량 조회는 `findLiveByServiceIdIn`으로 고쳐졌지만(`:782-793`), **서비스 목록 전체 조립 자체가 페이지 단위가 된 것은 아니다.**

FE `ApmServiceListPage.tsx:76-83`은 전체 `services`를 받고 `:110-120`에서 상태·태그 필터와 정렬, `:453-454`에서 테이블에 전체 rows를 전달한다. FE 테이블에 페이지 버튼이 있어도 서버의 집계·전송량은 줄지 않는다. 상세 페이지의 서비스 선택용 조회도 `ApmServiceDetailPage.tsx:99`에서 같은 무거운 overview를 재사용한다.

`ApmRegistrar.java:182`, `:273`, `:335`에서는 자동 서비스·인스턴스 등록이 일어나며 DB 개수의 전역 hard cap은 확인되지 않았다. 캐시 제한과 일시적인 라이브 서비스 제한을 등록 개수 제한으로 설명하면 안 된다. 수천 서비스에서 경량 서비스 선택 API와 서버 필터/페이지 집계가 우선 과제다. 이번 세션에서 처리량 저하를 실측한 것은 아니다.

### 중간: 호스트 연결의 캐시 미스당 자산 조회

`BE/service/hostlink/ApmZabbixHostLinker.java:99-115`가 이름마다 `lookup`을 부르고, `:153-171`에서 `assetService.getList`를 매번 실행한다. 캐시가 비었거나 만료되면 서로 다른 이름 N개에 N번 조회한다. 캐시 상한 2,000에 도달하면 전체 clear한다(`:145-147`). 비용과 정확성에 영향이 적은 개선 후보는 정규화 이름 집합을 한 번에 조회하고 원문 키별로 결과를 배분하는 것이다. 기존 보고서 R6 지적은 유지된다.

### 중간: 오류/DB/RUM 파생 테이블 질의는 별도 검증이 필요하다

- `SQL/V44__apm_trace.sql:211-219` 오류 집계 PK `(group_id,bucket_start)`, `:248-260` DB 집계 PK `(group_id,bucket_start)`, `SQL/V57__apm_rum_kubernetes.sql:78-81` RUM 오류 PK `(group_id,fingerprint,bucket)`가 유지된다. 후속 마이그레이션에서 시간축 보조 인덱스 추가는 확인되지 않았다.
- `BE/trace/errors/ApmErrorQueryService.java:260-269`는 기간 집계를 만든 뒤 서비스 그룹에 조인한다. `:134`의 정확한 count와 `:141`의 목록 조회가 같은 모집단 비용을 각각 낼 수 있다. 부분 문자열 검색 `:255-257`에는 `%...%`를 사용하며 pg_trgm용 인덱스는 마이그레이션에서 확인되지 않았다.
- **기존 감사의 표현 정정:** PK 선두가 그룹이란 이유만으로 '인덱스를 절대로 못 탄다', '항상 seq scan'이라고 단정할 수는 없다. 서비스 필터의 선택도, 조인 계획, PostgreSQL 버전·통계·파티션 수에 따라 다르다. 이 세 질의는 실제 대규모 데이터로 EXPLAIN (ANALYZE, BUFFERS) 후 인덱스 추가 효과와 INSERT 비용을 비교해야 한다.
- 이번 포인트 제한은 위 count·집계 SQL 비용이나 OFFSET 비용을 제한하지 않는다. 전역 조회 동시성·시간 제한과 페이지 계약은 별도 검토가 필요하다.

### 중간: 저장 밀도 문제와 일부 보존 공백

`SQL/V38__apm_p1.sql:215`, `:239`, `:262`의 `dims_hash char(64)`와 `dims jsonb`가 유지된다. 차원 사전 테이블(`apm_dims`)·binary hash 전환 마이그레이션은 확인되지 않았다. 보존 기간 제한은 행 증가 속도와 저장 밀도 개선을 대신하지 않는다.

`BE/core/batch/retention/ApmRetentionJob.java:137-174`는 partition, 지문, instance, drop, receipt, token, deployment, SLO, messaging, job, stuck-request, RUM 정리를 수행한다. **apm_alert_event 종료 이력 자체를 정리하는 단계는 없다.** 열린 알람을 함께 삭제하지 않도록 종료 시각 기반 정책이 필요하다.

Vault에는 'APM 알람을 Zabbix에서 분리하고 B1/B2/B3를 독자 알림 작업 때 함께 처리'한 결정이 남아 있다. 이 감사에서 알람 소유권/외부 I/O를 단독 변경하지 않았다.

## 4. 기존 보고서 재판정

| 기존 항목 | 현재 판정 |
|---|---|
| gap R1 OTLP 원자성, R4 SSE writer | 병렬 구현 담당의 검증 보고서 참조. 이 감사에서 중복 판정하지 않음 |
| gap R2 열린 알람 중복 / R5 외부 I/O | 알람 분리 결정과 같이 다뤄야 함. 본 작업 범위에서는 수정하지 않음 |
| gap R3 RUM 재전송 | root 담당의 이번 수정·브라우저 검증 결과 참조 |
| gap R6 host linker N+1·alert event 보존 | 현재 코드에서 유지됨 |
| DB 감사 Q1 24h 가용성 원시 조회 | M5 기본 + watermark 기반 M1 tail 구현 유지. `ApmAvailabilityService.java:105`, `:382-385`, `:471`. 개선 후 동일 14M 데이터 재측정은 찾지 못함 |
| DB 감사 Q2 sort 제거 | Java 정렬 여부만으로 성능 향상을 확정할 수 없음. 기존 A/B 결과의 work_mem 영향 설명 유지 |
| DB 감사 R1 rollup 회차 축소 | 60/12 코드 유지. 복구 처리율 재측정은 별도 |
| DB 감사 S1/S2 저장 밀도 | 미해결. 686B/행은 과거 환경의 측정값이며 현재 모든 입력에 적용되는 고정 상수 아님 |
| DB 감사 파생 3종 인덱스 | 미추가. '항상 미사용/seq scan' 표현은 약화하고 실제 실행 계획 검증 필요로 분류 |
| DB 감사 시간창 무상한 | 공통 기간 상한은 없음. 이번에 가용성·일반 격자 생성 상한을 추가했으므로 이 OOM 경로는 별도 보완. 나머지 SQL 범위 비용까지 해결됐다는 판정은 불가 |
| 'errorGroup1h가 trace 보존과 연동' | 기본 상수는 현재 90일(`ApmRetentionDays.java:86`)이므로 단순 7일로 안내하면 틀림 |

## 5. 부하 시험 증거와 증명하지 못한 것

1. **2026-09-01 R3:** `_workspace/features/apm/core/r3_apm-volume.md:3`, `:51`에 서비스 10·인스턴스 30 기반 **14.04M행 합성 적재** 기록. `:106-119`에 686B/행과 7일/3단 환산. `:218-225`에는 동시 조회 4의 지연 증가가 있다. `:295`가 **동시 수신 부하 없음**을 명시하고 `:376`이 개선 후 같은 데이터 재적재·재실측을 하지 못했음을 밝힌다.
2. **용량 예측:** 같은 문서 `:138-139`, `:385`의 서비스 50·인스턴스 5 **3단 약 770GB**는 기존 입력 차원 분포에 대한 환산이다. 실제 50×5 규모 현행 시스템을 돌려 측정한 용량이나 보장 한도가 아니다.
3. **2026-09-15 R-P5:** `_workspace/guides/apm-handbook/13-verification.md:17`, `:40`은 합성 OTLP·캡처 서버 대역·공유 호스트 **600 SERVER/초** 천장을 명시한다. 실제 javaagent→BE→브라우저 전 구간을 검증한 시험과 구분해야 한다.
4. **2026-09-19 실제 SSE 1회:** `_workspace/features/apm/realtime/r-p5-live-stream_2026-09-19.md:3-17`은 11분, snapshot 2개 CRC 일치, 658 spans frame, 표본 종료→수신 p95 **1.895초** 기록. 실제 연결의 유효한 증거지만 브라우저 렌더, 40/500명 fan-out, 느린 사용자 혼합 부하는 측정하지 않았다.
5. 핸드북 `13-verification.md:54-55`에는 운영 예산 32/96MiB, 브라우저, 느린 writer, 실제 javaagent A/B 등에 대한 증거 공백이 남는다. 최신 코드 기능 존재만으로 미실측 항목을 PASS 처리하지 않는다.

## 6. 기능 미완성과 다음 검증

기능 폭은 RED, endpoint, trace, 오류, DB/외부 의존, 서비스맵, SLO·합성, RUM, messaging/job, live 관제, 파일 아카이브까지 넓다. 다음 영역은 이번 조사에서 완료 증거를 찾지 못했다: 범용 애플리케이션 로그 상관 검색, 연속 프로파일링, 아카이브 검색·복원·pin, 실제 Kubernetes RBAC/TLS·다중 클러스터, 실제 브로커 producer→consumer, 비-JVM 진행 중 요청 동등 지원. 파일 아카이브 자체는 구현됐으므로 미구현으로 재분류하지 않는다.

우선순위:

1. 이번 조회 포인트 제한·OTLP·SSE·RUM 수정의 회귀 검증과 계약 확인.
2. 실제 고객 규모를 행/분·서비스·instance·route 조합·span/초·동시 시청자로 정의하고 격리 환경에서 수신+조회+rollup+retention 동시 부하 재측정. CPU/RSS/GC, DB I/O·WAL·pool, p95/p99, accepted/rejected/dropped, 노드 재시작과 수량 보존을 함께 기록.
3. 서비스 목록/선택 API 페이지화와 host linker 배치 조회; SQL 실행 계획 기반 인덱스·정확 count 비용 개선.
4. 저장 차원 사전 및 운영 용량 관측, 실제 HA 라우팅/공유 예산/장애 복구 설계. 다중 BE 보장 범위를 선언하기 전에 2노드 재분산·롤링 재시작 시험.

## 7. 이번 구현 검증 대상

- `ApmQueryResourceLimitTest`: 6개 조회 경로의 저장소 미접촉 거절, 400일 자동 해상도, 20,000칸과 +1ms 경계, MockMvc HTTP200/body400/errorCode 계약.
- `ApmAvailabilityServiceTest` 추가 4건: 30일×1초 거절, Long.MAX 입력의 int overflow 방어, 400일×300초 유지, 120,000칸 초과 거절.
- 기존 `ApmAvailabilityServiceTest`, `ApmSeriesSelfExplainTest`, `ApmExportGridParityTest`, `ApmResolutionTest` 회귀 실행은 root가 통합 실행한다.
- 작성 시 정적 `git diff --check` 통과. 공유 서버 재기동·부하 시험은 수행하지 않음. 테스트 통과 여부는 최종 통합 기록을 정본으로 한다.
