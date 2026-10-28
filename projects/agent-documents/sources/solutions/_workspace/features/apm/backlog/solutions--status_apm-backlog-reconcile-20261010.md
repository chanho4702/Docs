# APM 백로그 대조 — 09-28 전체 검토 · 09-29 개선 백로그 vs 현재 master (2026-10-10)

- 기준: BE `moveseye-be-spring` master `b61d33e`, FE `moveseyee_fe` master `cbadb3e`(둘 다 2026-10-10 HEAD, 작업 트리 깨끗).
- 대조한 백로그: `features/apm/full-review-20260928/backlog_apm-full-review-2026-09-28.md`(A1~A5·B1~B13·C), `features/apm/deadlock-fixes/backlog_apm-improvements-2026-09-29.md`(A·B·C·D). 근거 보고서: `features/apm/full-review-20260928/report_apm-full-review-2026-09-28.md`.
- 참고한 작업 기록: `features/apm/hardening-20261006/plan_apm-priority-execution-20261006.md`, `planning/apm-*-20261006.md`·`apm-*-20261008.md`, `reviews/review_apm-*-2026100*.md`, `moveseye-docs/guides/features/APM-수집과-운영.md` 4절(APC-xx).
- 방법: 항목마다 master 코드를 직접 열어 판정했다. 문서에 "해소"라고 적혀 있어도 코드를 다시 확인했다. 코드로 확인하지 못한 항목은 "미확인"으로 남겼다(추정 금지). 빌드·테스트·런타임 실행은 하지 않았다(읽기 전용).
- 경로 약어: `A/` = `moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/`, `M/` = `moveseye-be-spring/src/main/resources/db/migration/`, `F/` = `moveseyee_fe/src/`.

## 1. 한 줄 요약

**미해소 ❌ 30 · 부분 해소 🟡 6 · 보류/결정 ⏸ 3 · 미확인 4 · 해소 ✅ 13**(두 백로그 합계 56행. 09-28 B7=09-29 B3, B8=09-29 B1, B9=09-29 C5, C-BE2=09-29 D3은 같은 결함이 두 문서에 중복된 것이다). **배포 전 필수(09-28 🔴)는 6건 중 A5(`apm_alert_event` 보존 단계) 1건만 남았다.** A1·A2·A3·A4는 코드로 해소를 확인했다. 그리고 2026-10-10 "알람 이력은 규칙·서비스 삭제 뒤에도 보존" 결정과 현재 V38 FK `ON DELETE CASCADE`가 정면으로 충돌한다(B2). 이 충돌은 알람 전송 재설계에 흡수되지만, 배포 전에 반드시 해결해야 하는 항목이다.

## 2. 항목별 판정

### 2.1 09-28 전체 검토 — A(배포 전 🔴)

| 출처 | ID | 제목 | 상태 | 근거(파일:줄 / 커밋) | 남은 일 | 규모 |
|---|---|---|---|---|---|---|
| 09-28 | A1 | OTLP 메트릭 적재 멱등(영수증 선점 + 1m 단일 트랜잭션) | ✅ | `e55948c`. `A/collector/ingest/receipt/ApmMetricBatchWriter.java:27-37`(`insert … on conflict (token_id, body_sha256) do nothing` 뒤 같은 REQUIRES_NEW 트랜잭션에서 적재), `A/collector/ingest/store/MetricIngestor.java:162`. 실 PG IT `ApmMetricIngestAtomicityIT`(동시 동일 본문·중간 SQL 실패·영수증 커밋 실패 케이스) | 회복력 설계서 문구 정정(§0 "영수증 멱등", `:111`)은 문서 쪽이라 미확인 | — |
| 09-28 | A2 | SSE writer 풀을 동시 시청 상한에서 산정 | ✅ | `e55948c`. `A/overview/live/spans/LiveSpanStreamService.java:150-152`(큐 = `active + waiting`), `writer-threads` 1~32 설정 `ApmLiveStreamProperties.java:45`, `LiveSpanStreamScaleTest` | — | — |
| 09-28 | A3 | 열린 알람 이벤트 부분 UNIQUE | ✅ (1차) | `3de55ec`. `M/V74__apm_alert_event_open_unique.sql`(중복 열림 중 최초 행만 남기고 DELETE, `NULLS NOT DISTINCT` 부분 UNIQUE), `A/alert/evaluate/ApmAlertEventStore.java:53`(`on conflict (rule_id, service_id) where resolved_at is null do nothing`), 호출부 `ApmAlertEvaluationService.java:386`·`ApmStuckRequestLedger.java:118` | 커밋 뒤 Zabbix 전송(outbox)은 2차로 넘어감. **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수** | — |
| 09-28 | A4 | `app.apm.live.max-services` 상한 단일화(200) | ✅ | `9a35de1`·`ab78f4f`. `A/overview/live/ApmLiveProperties.java:101` `@Max(200)` ↔ `LiveSpanRing.java:147`(1~200) | — | — |
| 09-28 | A5 | `apm_alert_event` 보존 단계·옵션 키 | ❌ | `A/core/batch/retention/ApmRetentionJob.java:137-174`에 알람 이벤트 단계가 없다. `ApmAlertEventRepository.deleteByFiredAtBefore`(:137)를 부르는 곳이 0이다. 엔티티 주석도 "현재는 무제한 누적"이라고 적고 있다(`A/core/domain/ApmAlertEvent.java:40-43`) | 보존 옵션 키 + 단계 추가. **닫힌 이벤트만** `fired_at`(또는 `resolved_at`) 기준으로 지운다. 10-10 이력 보존 결정과 보존 일수를 함께 정한다 | 0.5일 |

### 2.2 09-28 — B(운영 규모 🟠)

| 출처 | ID | 제목 | 상태 | 근거 | 남은 일 | 규모 |
|---|---|---|---|---|---|---|
| 09-28 | B1 | 메트릭 부분 실패 폐기 사유 `RESOLVER_FAILURE` 분리 | 🟡 | 실제 HTTP 경로(`ApmOtlpIngestDispatcher.java:87` → `ingestOnce`)에서는 귀속 장애가 1건이라도 있으면 **배치 전체를 503**으로 돌려보낸다(`MetricIngestor.java:133-135`, `e55948c`). 그래서 `UNKNOWN_SERVICE`로 잘못 세는 일이 없다. 다만 `Attribution.failure()`는 여전히 `UNKNOWN_SERVICE`를 들고 있고(`:419-421`), 부분 실패에도 200을 주는 레거시 `ingest()`(`:229`, `MetricIngestPipeline.java:114`)가 남아 있다. 사유 코드는 추가되지 않았다 | 레거시 `ingest()` 경로를 제거하거나 사유 코드를 추가한다(실익은 낮음) | 0.25일 |
| 09-28 | B2 | 서비스 삭제 시 FK 없는 파생 표 정리 | ❌ | `A/service/list/ApmServiceQueryService.java:537-555`는 `releaseService` 뒤 `apm_service` 1행만 지운다. span·trace_summary·edge·dependency·messaging·error_group·db_query_group 정리 코드가 없다. 반대로 알람 이벤트는 `M/V38__apm_p1.sql:390-391` `rule_id … ON DELETE CASCADE`·`service_id … ON DELETE CASCADE`로 **함께 삭제된다** → 10-10 "이력 보존" 결정과 충돌. ⚠️ `service_id` NULL은 이미 "전역 규칙"을 뜻하고 V74 UNIQUE가 `NULLS NOT DISTINCT`라서, `SET NULL`로 바꾸면 의미가 섞이고 열린 행끼리 충돌한다. `rule_id`도 NOT NULL이라 규칙 삭제 뒤 보존하려면 스키마 변경과 규칙명 스냅샷이 필요하다 | 파생 표 고아 정리(또는 조회 시 고아 제외) + 알람 이력 보존 스키마. **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수**(알람 이력 보존 부분) | 1~2일 + 보존 스키마 |
| 09-28 | B3 | 롤업 late-arrival 재계산 + 보존 일수 상수→options 단일화 | 🟡 | 지연 도착은 해소됐다: 영속 dirty 큐 `M/V70__apm_metric_dirty_rollup.sql`, `A/core/batch/rollup/ApmRollupService.java:76,221,238`(`2f84b55`·`c05bd85`·`9a35de1`). 보존 단일화는 남아 있다: `A/core/metric/ApmResolution.java:27-33`(7/30/400 상수, :68)를 내보내기·가용성·`ApmMetricStore.java:536`이 계속 쓴다. RUM은 옵션 자체가 없다(`ApmRetentionService.java:64-71`, `ApmRetentionDays.java:22,99-103`) | 조회·내보내기의 보존 판정을 `ApmRetentionDays`/`ApmRetentionPolicy`로 통일하고 RUM 보존 옵션을 추가한다 | 1~2일 |
| 09-28 | B4 | P5 SSE tick 잠금 밖 직렬화·1초 예산 / P1.5 view별 1회 계산 | ❌ | `LiveSpanStreamService.java:251` `synchronized void tick()`이 tick 전체를 잠근다. 1초 예산 계측은 찾지 못했다. P1.5는 구독마다 `snapshots.tick(...)`을 다시 계산한다(`A/overview/live/ApmLiveStreamController.java:342-347` → `ApmLiveSnapshotService.java:91-104`, 매번 `load()`) | 직렬화를 잠금 밖으로 빼고, (serviceUid, env) 키당 1회만 계산 | 3~5일 |
| 09-28 | B5 | 1m 파티션 `bucket_start` 인덱스·BRIN + 롤업 EXPLAIN·부하 시험 | ❌ | 1m 인덱스는 `M/V38__apm_p1.sql:232-233` `(service_id, metric, bucket_start)` 하나뿐이다. BRIN이나 `bucket_start` 선행 인덱스를 추가한 마이그레이션이 없다(V39~V75) | 운영형 EXPLAIN 뒤 인덱스 마이그레이션 + 부하 시험 | 2일 + 실측 |
| 09-28 | B6 | 파티션 캐시 무효화·DDL을 수신 스레드 밖으로 | 🟡 | 긴 적재 트랜잭션 안에서는 DDL을 하지 않게 됐다(`ApmPartitionService.java:170-190`, 메트릭 날짜 가드). 그러나 준비 단계가 **여전히 수신 스레드**에서 돈다(`MetricIngestor.java:144-148` `store.preparePartitions`). 캐시 `known`도 프로세스 로컬 그대로다(`ApmPartitionService.java:122`) | 선생성 실패 시 수신 경로의 DDL을 줄이는 경보·재시도. 다중 노드에서는 캐시 무효화 | 1일 |
| 09-28 | B7 | 알람 평가 트랜잭션에서 Zabbix I/O 분리·부분 실패 표기·mixed histogram UNKNOWN·THEIRS 바인딩별 | ❌ | `ApmAlertEvaluationService.java:273-284` `evaluateAll`이 `@Transactional`이고, 그 안에서 `ensureProvisioned`(:334)·`orphanSweeper.sweep`(:407)·`pushAll`(:409)을 부른다. mixed histogram은 여전히 관측이 가장 많은 bounds 하나만 쓴다(`ApmAlertEvaluator.java:251-290`). THEIRS는 임계를 찾은 첫 scope를 `break`로 채택한다(`ApmAlertService.java` 약 :918-927) | **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수** | 2일 |
| 09-28 | B8 | STUCK 감시기 잠금 밖 DB/Zabbix I/O + observedAt 정리 | 🟡 | `3de55ec`에서 observedAt 정리를 끝냈다(`ApmStuckRequestMonitor.java:198`, `:303` `removeIf`). lock-free 스냅샷 공개(`:109`)와 `lastSuccessfulTick` 경고(`:111`)도 들어갔다. 그러나 `synchronized (lock)`(:166) 안에서 `ledger.fire/settle`(:256·:260 → DB INSERT + Zabbix)을 여전히 호출한다 | **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수** | 1일 |
| 09-28 | B9 | 트레이스 목록 keyset·service_ids GIN·route trigram·scatter 비용 상한 | ❌ | `A/trace/query/ApmTraceQueryService.java:201,217` `limit ? offset ?`에 offset 상한이 없다(컨트롤러 `ApmTraceController.java:99`도 그대로 전달). `:148` `= any(service_ids)`, `:158` `root_name ilike`가 그대로이고 GIN·trgm 마이그레이션이 없다(`using gin`은 `V44:98` attrs뿐). scatter는 `SCATTER_SCAN_CAP=200_000`(:65)이 09-02부터 있었고 그 뒤 변경이 없다 | EXPLAIN 뒤 keyset/offset 상한·GIN/trgm 결정 | 2일 |
| 09-28 | B10 | 합성 결과 기간 상한 + Zabbix 삭제↔binding reconciliation | ❌ | `A/synthetic/ApmSyntheticService.java:386-393`은 from/to를 그대로 쓰고 상한이 없다(마지막 변경 `0ef3a2d` 09-07). `synthetic/` 패키지에 주기 reconciliation 잡이 없다 | 기간 상한(예: 31일) + 고아 binding 정리 잡 | 1일 |
| 09-28 | B11 | RUM rps·일 예산 재시작 내성 | ❌ | `A/rum/.../RumRateLimiter.java:13` "재시작 시 초기화" — 프로세스 메모리 그대로(`85d9e9d`는 환급만 추가) | 다중 노드나 재시작 우회가 실제로 문제될 때 Redis/DB 카운터 | 1일 |
| 09-28 | B12 | SQL 마스킹 16KB 초과 자유 텍스트 UNMASKABLE | ❌ | `A/.../ApmSqlMasker.java:118-120` `looksLikeSql`이 길이 > 16,384면 false를 돌려줘 원문이 그대로 통과한다(마지막 변경 `083a47f` 09-02) | 초과분을 `UNMASKABLE`로 처리 | 0.5일 |
| 09-28 | B13 | `keepRawSql` 켜기를 관리자 축으로 + `currentOp` 원문 게이트 | ❌ | `A/.../ApmSettingController.java:133` `access.requireEdit` 그대로. `aab73fc`는 과거 원문 **열람**을 저장 설정과 분리한 것이고, **켜는 권한**은 바꾸지 않았다. `currentOp`는 확장 마스킹에만 기대고 BE 게이트가 없다(`ApmStuckRequestLedger.java:64`, `ApmStuckRequest.java:25`) | `keepRawSql`을 켤 때만 관리자 검사 + currentOp 노출 게이트 | 0.5일 |

### 2.3 09-28 — C(개선 🟡) BE

| 출처 | ID | 제목 | 상태 | 근거 | 남은 일 | 규모 |
|---|---|---|---|---|---|---|
| 09-28 | C-BE1 | 영수증 키에 signal 추가 | ❌ | `ApmMetricBatchWriter.java:30-32` 충돌 키가 `(token_id, body_sha256)` | V76+ 키 확장 | 0.5일 |
| 09-28 | C-BE2 | `ApmIngestDropStatRecorder` flush 정렬 | ❌ | flush가 `List.copyOf(pending.keySet())`(ConcurrentHashMap)를 정렬 없이 batchUpdate한다(파일 :210 부근) | HA 전환 시 키 정렬(09-29 D3과 같은 항목) | 0.1일 |
| 09-28 | C-BE3 | STUCK 조회 skip/size 오차 | ✅ | `b61d33e`. `A/alert/query/ApmStuckRequestQueryService.java:54-56` `OffsetBasedPageRequest(skip, size)` | — | — |
| 09-28 | C-BE4 | SSE 라이선스 재검사 | ❌ | 연결 시점에만 `@RequiresFeature`로 검사한다(`ApmLiveStreamController.java:11-12`, `ApmLiveSpansStreamController.java:11-12`). tick 중 재검사는 찾지 못했다 | 주기 재검사 또는 만료 시 종료 | 0.5일 |
| 09-28 | C-BE5 | `package-info` 위반 아키텍처 테스트 | ❌ | `A/core/domain/ApmReportSnapshot.java`가 여전히 `premium.apm.report`를 import한다. APM 패키지 규칙용 ArchUnit 테스트가 없다(`ApmArchiveGateArchTest`는 아카이브 게이트 전용) | 의존 정리 + ArchUnit 규칙 | 0.5~1일 |
| 09-28 | C-BE6 | 계약 문서 낡음 5곳 | ❌ | `_workspace/features/apm/core/contract_apm.md:1253-1256` 알람 규칙 권한이 아직 "관리자"다. `features/apm/realtime/contract_apm-p5-live.md:243,749,820` `arenaPressure`를 "누적 카운터"로 적고 있지만 코드는 tick 증분이다(`LiveSpanStreamService.java:254-261`). `:242` `patterns`, `:818` `live{}`, `:98` `nodeId`, `features/apm/core/contract_apm-p4.md:396` `ttfbP75Ms`도 갱신 표시가 없다(코드와의 세부 대조는 arenaPressure만 했다) | 문서 갱신 | 0.5일 |
| 09-28 | C-BE7 | 수신 컨트롤러 클래스 주석 표(403·400·503 누락) | ✅ | `2b17971`. `A/collector/ingest/ApmOtlpController.java:66-78` 표에 415·413·429·403·400·503이 있다 | — | — |
| 09-28 | C-BE8 | `ApmReceiveToken.tokenHash` `@JsonIgnore` | ❌ | `A/core/domain/ApmReceiveToken.java:43` 클래스 `@Getter`, `:64-65` 필드에 `@JsonIgnore`가 없다 | 어노테이션 1줄 | 0.1일 |
| 09-28 | C-BE9 | `/apm/live/stream` MCP 401 경로 | 미확인 | SSE 401/ERROR 디스패치 보강(`GlobalExceptionHandler.java:55-72`, `SecurityConfig.java:67-88` `9b858be`)은 확인했다. MCP 요청이 이 EP에 왔을 때의 실제 응답은 코드만으로 판정하지 못했다 | 런타임 확인 | — |

### 2.4 09-28 — C(개선 🟡) FE

| 출처 | ID | 제목 | 상태 | 근거 | 남은 일 | 규모 |
|---|---|---|---|---|---|---|
| 09-28 | C-FE1 | 막대 null→0 4곳 | ❌ | `F/pages/application-monitoring/overview/components/ApmTopServicesCard.tsx:81`, `services/components/ApmTopEndpointsCard.tsx:68`, `synthetics/ApmSyntheticDetailPage.tsx:204`, `shared/apmChartTable.ts:227-228` | 못 잰 값은 막대에서 빼거나 "없음"으로 표시 | 0.5일 |
| 09-28 | C-FE2 | `useApmEdgeSeries`/`useApmInstallGuide` enabled | 🟡 | edge는 `toRef`만 검사한다(`F/hooks/useApm.ts:519`). install guide는 `options.enabled ?? true`뿐이다(`F/hooks/useApmCollectors.ts:238`) | 필수 파라미터 전부 검사 | 0.1일 |
| 09-28 | C-FE3 | APM 라우트 lazy import | ❌ | `F/routes/routes.tsx:109-122` 정적 import, `lazy(` 0건 | `React.lazy` 분리 | 0.5일 |
| 09-28 | C-FE4 | ECharts ARIA·무대 키보드 | ❌ (ARIA) / 미확인(키보드) | APM 페이지·공용 컴포넌트에서 `aria: {` 0건 | ARIA 옵션 일괄 적용 | 0.5일 |
| 09-28 | C-FE5 | 수집기 토큰 폴링 탭별 | ❌ | `F/pages/application-monitoring/collectors/ApmCollectorsPage.tsx:49` 페이지 레벨에서 `useApmReceiveTokens({ refreshMs, enabled: canManage })` — 탭과 무관하게 폴링 | 활성 탭일 때만 enabled | 0.1일 |
| 09-28 | C-FE6 | Transactions/Instances 차트 옵션 memo | 미확인 | 두 탭 모두 주요 옵션이 `useMemo`다(`ApmServiceTransactionsTab.tsx:269-316`, `ApmServiceInstancesTab.tsx:115-166`, 09-01 `5f25846`부터). 원 지적이 가리킨 구체 위치를 특정하지 못했다 | 원문(코덱스 fe 출력) 재확인 | — |
| 09-28 | C-FE7 | 메시징/잡 서버 페이지네이션 | ❌ | `F/types/apm.ts:3883-3887` `TApmJobsParams`에 페이지 파라미터가 없다. `F/services/apm.api.ts:946-967` 전량 조회 | BE 페이지 EP + FE 연동 | 1~2일 |
| 09-28 | C-FE8 | 계약 픽스처 3종 | ❌ | `F/__tests__/fixtures/*.ts`에 `TApmStuckRequestsRes`·`TApmLiveStreamStatsDto`·`TApmLiveActiveRequestsDto` 0건 | 픽스처 추가(`typecheck:contract`) | 0.5일 |
| 09-28 | C-FE9 | `Table`/`Select` 래퍼 | ❌ | antd 직접 import 5파일(`ApmProcessorOptionsFields.tsx`·`ApmDbExplorer.tsx`·`ApmErrorGroupPanel.tsx`·`ApmServiceTransactionsTab.tsx`·`ApmSyntheticDrawer.tsx`) | 래퍼로 교체 | 0.5일 |
| 09-28 | C-FE10 | `-`/`—` 통일 | 미확인 | 전수 grep 안 함 | — | — |
| 09-28 | C-FE11 | 주석 수치 drift(사이드바 6→9, 화면 13→14) | 미확인 | 위치를 특정하지 못함 | — | — |
| 09-28 | C-FE12 | 픽스처 `as unknown as` 11곳 | ❌ | APM 테스트·픽스처에 현재 42곳(APM 관련 전체 46). 원 집계 범위와 달라 단순 비교는 못 함 | 타입 정합 픽스처로 교체 | 1일 |
| 09-28 | C-FE13 | 정책: 스파크라인 null→0 유지 여부 | ⏸ | 결정 기록을 찾지 못했다(백로그 :56 "결정 필요" 그대로) | 사용자 결정 | — |

### 2.5 09-29 개선 백로그

| 출처 | ID | 제목 | 상태 | 근거 | 남은 일 | 규모 |
|---|---|---|---|---|---|---|
| 09-29 | A1 | RumStore timing·error 미정렬 UPSERT 교착 | ✅ | `5b6d5a0`·`d2b42c8`. `A/rum/ingest/RumStore.java:46-47` `OBS_ORDER`, :106-112 phase 분리·영수증 게이팅 | — | — |
| 09-29 | A2 | ApmCollectorLogStore 미정렬 UPSERT | ✅ | `5b6d5a0`. `ApmCollectorLogStore.java:81-82` 키 정렬 | — | — |
| 09-29 | B1 | STUCK 감시기 lock 안 Zabbix HTTP | 🟡 | lock-free 스냅샷으로 `currentValue()`가 lock과 분리됐다(`3de55ec`, `ApmStuckRequestMonitor.java:109`). `ledger.fire/settle`은 여전히 lock 안이다(:166·:256·:260). 09-28 B8과 같은 항목 | **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수** | — |
| 09-29 | B2 | STUCK_REQUEST 이중 소유 | ✅ | `3de55ec`. 평가기는 STUCK을 열거나 닫지 않는다(`ApmAlertEvaluationService.java:371-377`). V74 UNIQUE + `ON CONFLICT` | **비고: 알람 전송 재설계에 흡수**(전송 원자성은 2차) | — |
| 09-29 | B3 | evaluateAll 단일 @Transactional에 Zabbix I/O 누적 | ❌ | 09-28 B7과 같은 근거(`ApmAlertEvaluationService.java:273-284,334,407-409`) | **비고: 알람 전송 재설계(outbox·채널 중립, 2026-10-10 착수)에 흡수** | — |
| 09-29 | C1 | `liveInstances` 전량 로드 | ✅ | `79becc0`. `A/service/list/ApmServiceQueryService.java:782` `findLiveByServiceIdIn` | — | — |
| 09-29 | C2 | ApmZabbixHostLinker 이름별 ILIKE 풀스캔 | ❌ | `A/service/hostlink/ApmZabbixHostLinker.java:163` 이름마다 `assetService.getList(query)`(마지막 변경 09-01 `ee8ad09`) | 배치 정확 일치 1질의(자산 서비스 변경) | 1일 |
| 09-29 | C3 | 요청 걸림 조회 N+1 | ✅ | `c1d14fb`. `ApmStuckRequestQueryService.java:61` `findAllById` | — | — |
| 09-29 | C4 | `ApmServiceRefLookup` 조회마다 전량 로드 | ❌ | `A/trace/query/ApmServiceRefLookup.java:51-75` `byId()`·`idByUid()` 모두 `apm_service` 전량 조회 | 요청별 단일 snapshot(코덱스 권고) | 0.5일 |
| 09-29 | C5 | `involved = any(service_ids)` 무인덱스 | ❌ | 09-28 B9와 같은 근거(`ApmTraceQueryService.java:148`) | EXPLAIN 뒤 GIN 결정 | (B9에 포함) |
| 09-29 | C6 | 에러·DB 조회 `count(*)` 상한 없음 | ❌ | `A/trace/errors/ApmErrorQueryService.java:144,197`, `A/trace/dbquery/ApmDbQueryService.java:118` | capped-count 패턴 | 0.5일 |
| 09-29 | D1 | bounds 조회 family + 시드 검증 | ✅ | `92e6857`·`d2b42c8` | — | — |
| 09-29 | D2 | LOGS 경로 영수증 dedup 없음 | ❌ | `A/collector/ingest/receive/ApmOtlpLogSignalHandler.java`에 영수증·dedup 처리가 없다(APC-23과 같은 항목) | 계약 명시 또는 dedup | 0.5일 |
| 09-29 | D3 | DropStat flush 미정렬(HA 대비) | ⏸ | 코덱스 "조치 불필요"(현재 synchronized·단일 인스턴스). 코드는 미정렬 그대로(09-28 C-BE2) | HA 전환 시 | — |
| 09-29 | D4 | TraceSummaryStore 트랜잭션 안 ensurePartition | ⏸ | 코덱스 판정 "오탐에 가까움"(백로그 :119 — UPDATE 0행 뒤 경합 복구 fallback) | — | — |
| 09-29 | 추가 | RUM 일 예산이 저장 실패에도 소비 | ✅ | `85d9e9d`·`d2b42c8` `RumRateLimiter.refund()` | — | — |

## 3. 다음 착수 추천 순서

알람 재설계에 흡수되는 항목(09-28 A3 잔여·B2의 알람 이력 부분·B7·B8, 09-29 B1~B3)은 이 순서에서 뺐다.

**배포 전 필수**
1. **A5 `apm_alert_event` 보존 단계**(0.5일). 닫힌 이벤트만 지우고 보존 일수는 옵션 키로 둔다. 10-10 이력 보존 결정과 일수를 함께 확정하고, 알람 재설계에서 스키마(rule/service FK)를 바꾸기 전에 보존 기준 컬럼을 맞춘다.
2. (권장) **B13 `keepRawSql` 켜기 관리자 축**(0.5일). 🟠으로 분류됐지만 개인정보를 다루는 보안 항목이고 작다.

**운영 규모**

3. B10 합성 결과 기간 상한 + binding reconciliation(1일)
4. B12 SQL 마스킹 16KB 초과 UNMASKABLE(0.5일)
5. B3 잔여: 보존 상수 단일화 + RUM 보존 옵션(1~2일)
6. C2 HostLinker 배치 정확 일치(1일)
7. B9/C5 트레이스 목록 offset 상한·keyset, GIN/trgm(EXPLAIN 선행, 2일) + C6 capped count(0.5일) + C4 서비스 참조 snapshot(0.5일)
8. B5 1m `bucket_start` 인덱스/BRIN + 롤업 EXPLAIN·부하 시험(2일 + 실측)
9. B6 잔여: 파티션 선생성 실패 경보·수신 경로 DDL 축소(1일)
10. B4 P5 tick 잠금 밖 직렬화 / P1.5 view별 1회 계산(3~5일)
11. B11 RUM 예산 재시작 내성(1일, 다중 노드·재시작 우회가 실제 문제가 될 때)
12. B1 잔여: 레거시 `ingest()` 정리 또는 사유 코드(0.25일)

**개선(묶음)**

13. BE: C-BE8 `tokenHash @JsonIgnore` · C-BE6 계약 문서 갱신 · C-BE4 SSE 라이선스 재검사 · C-BE1 영수증 키 signal(V76+) · C-BE5 package-info/ArchUnit · D2 LOGS dedup
14. FE: C-FE1 null→0 막대 4곳 · C-FE5 토큰 폴링 탭별 · C-FE2 enabled · C-FE8 계약 픽스처 3종 · C-FE3 lazy import · C-FE4 ARIA · C-FE9 래퍼 · C-FE12 `as unknown as` · C-FE7 메시징/잡 서버 페이지(BE 동반)
15. 결정: C-FE13 스파크라인 null→0 정책

## 4. 판정하지 못한 항목

| ID | 이유 | 확인 방법 |
|---|---|---|
| 09-28 C-BE9 `/apm/live/stream` MCP 401 경로 | MCP 인터셉터 → SSE 예외 처리 경로의 최종 응답은 코드만으로 확정할 수 없다 | 런타임 MCP 호출 1회 |
| 09-28 C-FE6 Transactions/Instances 차트 옵션 memo | 현재 주요 옵션이 이미 `useMemo`라서 원 지적의 위치를 특정하지 못했다 | 원문 `scratchpad/codex_out_apm_fe.md`(세션 임시, 소실 가능) 또는 재검토 |
| 09-28 C-FE10 `-`/`—` 통일 | 전수 grep 안 함 | APM 로케일·컴포넌트 grep |
| 09-28 C-FE11 주석 수치 drift | 해당 주석 위치를 특정하지 못함 | grep "사이드바" 수치 주석 |
| (부분) C-FE4 무대 키보드 | ARIA만 확인했다 | 실시간 무대 컴포넌트 키 핸들러 확인 |
| (부분) A1의 회복력 설계서 문구 정정 | 문서 쪽 항목이라 코드로 판정할 수 없다 | `devdesign_apm-ingest-resilience.md` §0·`:111` 확인 |

## 5. 런타임 검증에서 새로 나온 항목 (2026-10-10, `features/apm/hardening-20261006/qa_apm-runtime-20261010.md`)

| ID | 내용 | 상태 | 비고 |
|---|---|---|---|
| RT-1 | SLO 캘린더 dev 예외 "Heatmap must use with visualMap"(`26795a4`의 측정 불가 series가 visualMap 밖) | ✅ 수정(FE 미커밋) | `lib/echarts/apmSloCharts.ts` visualMap 배열화 + 숨은 piecewise 맵, 테스트 고정 |
| RT-2 | 공용 `DmoveTable`이 `limit` 없는 진입에서 `limit=10&offset=0`으로 덮어써 요청 2회·offset만 있는 옛 주소는 1페이지로 | ✅ 수정(FE 미커밋) | `defaultPageSize` prop + 빠진 쪽만 채움, `DmoveTablePagination.test.tsx` |
| RT-3 | 🔴 **업그레이드 설치본에서 SLO·내보내기가 창 전체를 "미확정"으로 표시** — 기존 롤업 데이터가 있으면 V70 도입 시 `legacy_hold=true`가 걸리고(`ApmRollupService:259,340`) **자동 해제·해제 수단이 없다**(`ApmMetricDirtyStore.noteLegacyHold` "자동 해제하지 않는다", `set legacy_hold=false` 코드 0건). `ApmMetricCoverageReader.stateIssue`가 hold면 `from`부터 이슈 → 소비자 모델(`incompleteFrom` 이후 잘라냄)이 **앞쪽 미검증 구간[from, cutover)**을 표현 못 해 cutover 이후 신뢰 구간까지 버림 | ❌ 미해소 — **원인 확정·해법 `apm-legacy-hold-rt3-20261010.md`**(1단계 앞·뒤 경계 분리, 배포 전 필수) | dev DB에서 실측(stage 5·60 모두 `bootstrap_complete=f, legacy_hold=t`). 해법 후보: (a) hold를 cutover 이전 구간에만 적용하고 소비자가 "앞쪽 미검증" 구간을 따로 받기, (b) 관리자 legacy 검증·해제 동작, (c) bootstrap 완료 시 hold 자동 해제 조건. **순위 5 후속 결함 — 코덱스 설계 의견 필요** |
| RT-4 | 끊긴 SSE의 `/error` 처리에서 `AccessDeniedException` 스택이 여전히 로그에 남음(09-29 `9b858be` 이후 재현) | ❌ 미해소 | 기능 영향 없음, 로그 오염 |
