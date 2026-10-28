# 검수 요청 — ZM-122 APM 수집 회복력(BE 재기동·Collector 큐) 구현

- 작성 2026-09-28 · 구현 Claude · 검수 코덱스(gpt-5.6-sol high 권장, 읽기 전용)
- 설계 정본 `features/apm/ingest-resilience/devdesign_apm-ingest-resilience.md` v2(§0.1·§0.2 결정표 + §7 V0 실측). 설계 검수 이력 r1·r2는 같은 폴더.
- 워크트리: BE `C:/worktrees/zm-122-be`(브랜치 ZM-122, master `213d875` 기준, **미커밋**) · FE 본 트리 master **미커밋**
- 규모: BE 36파일 +829/−78(신규 2: V68 마이그레이션·`ApmCollectorStateServiceTest`) · FE 10파일 +164/−6 · 안내서 `guides/apm-handbook/12-operations.md` §7.2a 신설

## 1. 범위 — 무엇을 바꿨나

| # | 설계 | 변경 | 파일 |
|---|---|---|---|
| ① | §2.1 graceful shutdown | `server.shutdown=graceful`·`timeout-per-shutdown-phase` 20s(env `SHUTDOWN_PHASE_TIMEOUT`)·`spring.task.scheduling.shutdown.await-termination` 10s. SSE 3곳: `@EventListener(ContextClosedEvent)`에서 **lock 안에서 closing 플래그 → 기존 emitter 완료(lock 밖) → 이후 subscribe는 즉시 완료된 emitter**. `LiveSpanStreamService`는 기존 `synchronized` 모니터에 `closeForShutdown()` 추가·`pump()`에 `stopped` 가드. `SchedulerManager`: `ContextClosedEvent` 후 `execute()` 진입 차단 | `application.yml` · `event/stream/EventStreamHub` · `premium/apm/overview/live/ApmLiveStreamController` · `.../live/spans/LiveSpanStreamService` · `scheduler/SchedulerManager` |
| ② | §2.5 replay 폭주 방어 | 적재 컨트롤러에 Semaphore admission(`app.apm.otlp.max-concurrent` 기본 6, 1~64 기동 검증). 순서: 415 → 413(Content-Length) → **429 `APM_INGEST_BUSY` + `Retry-After: 2`** → 본문 읽기 → 인증 → 적재. permit은 `try/finally` 단일 해제. 429는 인메모리 카운터(`busyRejections()`) | `premium/apm/collector/ingest/ApmOtlpController` · `application.yml` |
| ③ | §2.2 큐 넘침 | 알림 `COLLECTOR_FAILURE` SQL을 `(send_failed% OR enqueue_failed%) AND coalesce(exporter) NOT IN (라이브)`로. 표시명 "전송 실패·큐 넘침". **V68** `apm_collector.enqueue_failed_total` + 상태 서비스 집계(라이브 exporter 제외) + 행 DTO `enqueueFailedTotal`·`queueBySignal[{signal,size,capacity}]`·`queueSampledAt`(최신 1분 칸, `dims->>'data_type'`) + 시계열 `enqueueFailed` | `alert/evaluate/ApmAlertEvaluator` · `alert/rule/ApmAlertKind` · `collector/state/*` · `core/domain/ApmCollector` · `db/migration/V68__…` |
| ④ | §2.3 STALE 기동 유예 | `ApmAlertEvaluationService.bootAt`(컨텍스트 `getStartupDate`, 테스트 override) · `evaluateAll(now, intervalMin)` 오버로드 · 조건 `lastSeen < bootAt && minutes(bootAt, now) < threshold + intervalMin` → `continue`(판정 불가) · 잡이 스케줄러 행 주기를 넘김 | `alert/evaluate/ApmAlertEvaluationService` · `ApmAlertEvaluationJob` |
| ⑤ | §2.4 큐 옵션 | 템플릿 `${QUEUE_SIZE}`(기본 10,000·1,000~200,000)·`${RETRY_MAX_ELAPSED}`(30m·5~1,440분)·`num_consumers: 10` 명시. `ApmCollectorConfigOptionsDto`/`ReqDto`/`DefaultsDto`에 `queueSize`·`retryMaxElapsedMin`(정식 생성자만, 편의 생성자 `this(...)`도 전달). FE: 타입·상수·`apmResolveConfigDefaults`·동기화 훅 필드·발급 Drawer 입력 2칸·상태 탭 열(큐 넘침·신호별 큐/상한·표본 시각 tooltip)·locales kr/en(라벨·힌트·도움말 2건) | `collector/config/*` · `apm/collector-template.yaml` · FE `types/apm.ts`·`constants/apm.ts`·`collectors/*`·`locales/*` |

## 2. 의도 — 왜 이렇게

- **SSE를 `ContextClosedEvent`에서 닫는 이유**: Boot 3.3의 graceful lifecycle은 phase `MAX−1024`로 **먼저** 멈추며 활성 요청 0을 기다린다. `@PreDestroy`는 그 뒤라 거기서만 닫으면 SSE가 활성 요청으로 남아 매 재기동이 20초를 채운다. `ContextClosedEvent`는 `doClose()`에서 lifecycle stop **이전**에 발행된다(spring-context 6.1.14 바이트코드 확인).
- **등록·종료를 같은 lock으로**: 플래그만 보면 "검사 직후 종료 훅 순회 → 그 뒤 등록"의 창에 emitter가 남는다(코덱스 r2 S1). `complete()`는 lock 밖에서 부른다(onCompletion 콜백이 map.remove를 불러 재진입).
- **admission을 인증 앞에**: 본문(최대 2MB gzip)을 읽고 풀기 전에 거절해야 메모리를 안 쓴다. 무인증 요청이 permit을 잠깐 잡아도 즉시 401·해제. 429는 exporter 재시도 대상이라 폐기가 아니라 지연 — 단 30분 재시도 예산을 쓴다.
- **bytes sizer 폐기·요청 수 유지**: 논리 크기≠디스크, 신호별 ×3, `2048×2^20` int 오버플로, 큐 메트릭 단위 파급(코덱스 r1 R4·R5).
- **유예 폭 = 임계 + 주기**: 스케줄러 `initialDelay = period`라 임계만 보면 기본값(5·5)에서 첫 회차가 이미 경계 밖(코덱스 r2 S7). 기본값에서 첫 회차 유예·둘째부터 판정. 감지 최대 지연 ≈ 임계 + 2×주기.
- **STALE 유예의 `empty` 처리**: 기존 의미("잴 것이 없었다" = push·판정 없음)를 그대로 써 Zabbix 트리거 상태를 유지. 기동 전 열린 STALE 이벤트는 유예 중 열려 있다(의도).
- **큐 넘침을 별도 kind로 나누지 않음**: 고객 규칙 호환. 원인 분리는 화면 열(전송 실패 vs 큐 넘침)이 맡고 Zabbix 이벤트에는 합계만(코덱스 r2 🟡).
- 버린 대안: 마지막 평가 시각 저장 방식(정밀하지만 상태 필요) · `max_elapsed_time 0`(독 배치가 소비자 영구 점유) · 큐 디렉터리 삭제 절차(손실).

## 3. 중점 확인 요청 — 스스로 불안한 지점

1. **`ApmOtlpController.receive()` 분할**: admission 뒤를 `receiveAdmitted(authorization, request, signal, gzipped, wireLimit)`로 옮겼다. `contentEncoding`이 뒤에서 더 이상 안 쓰이는지, early return 경로에서 permit 누수가 없는지(`try/finally` 하나로 감쌌다).
2. **`admission()` 지연 생성**: 테스트가 컨트롤러를 직접 조립해 `@PostConstruct`가 안 돌므로 `maxConcurrent`가 0이면 6으로 접는다. 운영에서는 `@PostConstruct`가 1~64 검증 후 생성. 이중 경로가 위험한지.
3. **STALE 유예와 `liveKeys`**: 유예로 `continue`해도 `liveKeys`에는 이미 넣었으므로 고아 정리가 트리거를 내리지 않는다고 봤다. `ApmAlertOrphanSweeper` 관점에서 맞는지.
4. **`bootAt` 초기값**: 빈 생성 시각(`Instant.now()`) → `@PostConstruct`에서 `ApplicationContext.getStartupDate()`로 당김. 컨텍스트가 없는 테스트 경로에서 IT는 `overrideBootAt`으로 1시간 전으로 둔다(기존 STALE IT가 유예에 걸리지 않게). 이 테스트 배선이 과한지.
5. **`latestQueueBySignal` SQL 비용**: `max(bucket_start)` 서브쿼리 + 최신 칸 group by, 최근 1일 한정, 수집기 수만큼 `list()`마다 실행. 파티션(일)·인덱스 관점에서 허용 범위인지. `data_type`이 없는 옛 행은 signal `''`로 나온다(FE는 `?`로 표시).
6. **상태 서비스 `enqueueFailed` 라이브 제외**: `point.attributes().get("exporter")`로 판정. 기존 `sendFailed` 집계는 라이브를 **안 뺀다**(기존 동작 유지) — 일관성 문제로 볼지.
7. **FE `queueBySignal` 렌더**: 큐 열에 두 번째 줄(작은 글씨)로 `traces 11/5000 · metrics 0/5000`, `title`에 표본 시각 relative. 접근성·표 높이 관점 의견.
8. **템플릿 헤더 자리표시 설명 2줄 추가**: `verifyNoUnexpectedPlaceholder`는 설정 줄만 보므로 주석은 안전하다고 봤다.
9. **선재 플레이크**: `ApmMetric1mStoreIT` "폐기 통계는 flush에서 사유·메트릭별로 합산된다"가 단독 실행에서도 실패(EmptyResultDataAccessException). 내 diff는 레코더·스토어를 건드리지 않았다(메모리에 09-15 기록된 동일 증상). master에서 재현 확인은 본 트리 bootRun 중이라 못 했다.

## 4. 검증 현황

**통과**
- BE 단위·IT(워크트리, `:test`, 코덱스 r1 반영 후 재실행): collector.* + alert.* + event.stream.* + scheduler.* + overview.live.* **1,232건 중 실패 1**(위 #9 선재 플레이크, 동일 테스트). 신규·수정 테스트: `EventStreamHubTest`(+2) · `ApmLiveStreamControllerTest`(+1) · `SchedulerManagerTest`(+1) · `ApmOtlpControllerTest`(+2, 28/28) · `ApmAlertJobTest`(스텁 2인자) · `ApmAlertEvaluationIT`(+4: 유예·기동 후 수신·주기 폭·큐 넘침 합산) · `ApmCollectorStateServiceTest`(신규 2) · `ApmCollectorMetricStoreIT`(+2, 별도 인스턴스 C로 격리) · `ApmCollectorQueryServiceTest`(enqueueFailed) · `ApmCollectorConfigGeneratorTest`(+2: 기본값·치환·범위) · 골든 회귀(`ApmCollectorLiveConfigTest`) 불변
- FE(코덱스 r1 반영 후): `tsc` 0 · `npm run typecheck:contract` 0 · jest 수집기 4스위트 147/147
- V0 실측(설계 §7): 적재 p99 3.6s/8.5s(회복) · 배치당 디스크 ≈240KB · 0.25배치/초 · 소진 1.2배치/초 · 조회 p95 200ms대
- V6: 새 템플릿 `otelcol validate` 9조합(1,000·10,000·200,000 × 5m·30m·1440m) PASS, Collector 0.159.0

**실측 통과(§5)**: V1·V2·V4·V4b·V5·V7 · V6(validate 9조합)

**미검증**
- V3 런타임(기동 후 5·10·15분 STALE 0) — IT로만 확인(dev DB에 알림 규칙·Zabbix 프로비저닝 없음)
- 새 FE→구 BE / 구 FE→새 BE 양방향 호환은 타입 optional로만 보장(런타임 미검증)
- 안내서 §7.9 서비스 관리자 stop timeout 문구 — 미반영(§7.2a에만 언급)

## 5. 실측 결과 (2026-09-28 새 jar)

| 단계 | 결과 |
|---|---|
| V5 | 부하 500/초·SSE 2종 열린 채 JMX `shutdown()` → `Graceful shutdown complete` **4.25초**(진행 중 OTLP 완료 대기, SSE는 먼저 닫힘) · 프로세스 종료 ≈25초(스케줄러 await 10초 포함). ⚠️ Windows 콘솔 Ctrl+C는 JVM에 닿지 않아 JMX Admin MBean(`SPRING_APPLICATION_ADMIN_ENABLED`)으로 종료시켰다 — 설치형 서비스 정의의 stop 방식은 별도 확인 필요 |
| V1 | 5분 정지 → 큐 트레이스 64·메트릭 41·로그 64 배치, `enqueue_failed` 0 |
| V4 | 큐 상한 1,000·정상 샘플 100%·1,000/초: 약 250초에 트레이스 큐 1,000 도달, `enqueue_failed_spans` 초당 ≈2,000 폐기. 회복 후 행 `enqueueFailedTotal`·`queueBySignal traces 1000/1000`·`queueSampledAt` ✅ |
| V4b | 넘침 뒤 3분 유지 후 소진(1,000배치 381초): 1m 저장소 `enqueue_failed_spans` 12행 합 388,096 · **알림 SQL 합 419,003**(COLLECTOR_FAILURE 발화 조건 성립) · 행 389,632/11,673 · 시계열 EP `enqueueFailed [173,056·215,040·0]` ✅. ⚠️ 누적 카운터의 첫 표본(30초 scrape)은 증분을 못 만들어 넘침 직후 30초 안에 Collector가 죽으면 1m 행이 없다(엔티티 누계에는 남는다) |
| V7 | 큐가 찬 채(1,000/60/38) Collector 강제 종료→재시작: 큐 997/5/7 복원(소진 시작), 넘침 카운터 reset ✅ |
| V2 | 소진 108초(트레이스), 적재 p50 3.3s·p95 5.8s·p99 7.1s(admission 없던 구 jar 6.3/8.1/8.5), **429 60건/2xx 366건 = 14%**, 503 0, 조회 p95 214·253·44ms(무부하 대비 악화 없음) → `max-concurrent` 기본 6 확정 |

## 6. 코덱스 구현 검수 r1 반영 (2026-09-28, `_archive/features/apm/ingest-resilience/review_apm-ingest-resilience_zm-122_codex-r1.md`)

판정 "필수 수정 5건 후 커밋" → 전건 반영. 🟡도 대부분 같은 라운드에 처리.

- [x] 🔴1 `evaluateAll(now, intervalMin)`에 `@Transactional` 누락 → 부여(운영 경로 회귀 수정). `ApmAlertJobTest.jobPassesIntervalToService`가 잡이 2인자를 실제 값으로 부르는 것을 고정
- [x] 🔴2 admission 뒤 본문을 인증보다 먼저 읽음 → **인증·용도·라이선스를 본문 읽기 앞으로**(헤더만 쓰므로 본문 불필요). 무인증 slow-body가 permit을 못 잡는다. permit은 지역 변수로 잡아 같은 객체를 반환
- [x] 🔴3 SSE 늦은 구독의 `complete()`를 lock 밖으로, `closing`을 volatile로 두고 하트비트·tick 경로가 종료 중 send하지 않게, `SchedulerManager`는 lease 획득 뒤 실행 직전 재확인(리스 반환)
- [x] 🔴4 `latestQueueBySignal` 첫 쿼리에도 라이브 exporter 제외 + IT(라이브만 있는 더 늦은 칸이 최신이 되지 않음)
- [x] 🔴5 안내서 §7.9 "서비스 관리자 stop timeout ≥ 40초" 행 + `application.yml` 주석에 회복 p99 8.5s·전체 종료 25s
- [x] 🟡3 STALE 경과를 `Instant`로(DST-safe) · 🟡4 `intervalMinutes` 단위 테스트 · 경계(`<`) IT
- [x] 🟡6 상태 행 `sendFailedTotal`·`queueSize`도 저장 exporter만(시계열·신호별 큐·알림과 범위 통일) + 단위 테스트
- [x] 🟡 FE 표본 시각을 Tooltip(상대시간 + ISO)·`aria-label`·`tabIndex`로, locale 키 `queue_sampled_at`
- [ ] 🟡7 `latestQueueBySignal` 2N 쿼리 — **미반영**: 설치형 수집기 수는 한 자릿수, 최근 1일·인스턴스·메트릭 조건이라 파티션 1~2개만 읽는다. 수집기 20대 초과 시 CTE 일괄 조회로 바꾸는 것을 후속으로 기록
- [ ] 🟡8 구 BE의 unknown JSON 필드 허용 — **미반영(근거 기록)**: Spring Boot 기본 `FAIL_ON_UNKNOWN_PROPERTIES=false`이고 application.yml에 override 없음(grep). 런타임 계약 테스트는 후속
- [ ] 🟡1 SSE 실제 동시 경쟁 테스트·429 본문 미읽기 테스트 — 미추가(구조상 lock·순서로 보장, 후속)
- [ ] #9 선재 플레이크 — master 재현은 본 트리 bootRun 중이라 못 함. 조건부 통과로 기록
