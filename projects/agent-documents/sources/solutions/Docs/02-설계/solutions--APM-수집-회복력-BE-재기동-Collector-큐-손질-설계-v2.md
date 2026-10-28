# APM 수집 회복력 — BE 재기동·Collector 큐 손질 · 설계 v2

- 작성 2026-09-23 · v1 코덱스 1회차 반영 · **v2 코덱스 2회차 반영(착수본)** · 티켓 미정(사용자 배정 대기)
- 근거: 코드 대조(§1 표) + 코덱스 검수 r1 `reviews/review_apm-ingest-resilience-design_codex-r1.md`(필수 8건) · r2 `..._codex-r2.md`(필수 7건). 모델 gpt-5.6-sol high, 읽기 전용
- 상위 정본: `devdesign_apm.md` v3.1 §3.2(Collector yaml·file_storage)·§4.1(재시도 코드 계약)
- 워크트리: 미정 — BE·FE 모두 미커밋 0(BE `2339a2d`·FE `7db36a2` 기준)

## 0. 한 줄 결론

BE 재기동 구간의 APM 수집은 **이미 안전하다**(Collector 디스크 큐 + BE 503 재시도 계약 + 영수증 멱등). 프로세스 분리·Kafka는 **하지 않는다**(§3, 코덱스 2회 동의). 고칠 것은 다섯이다 — ① graceful shutdown+SSE 종료, ② 회복 직후 replay 폭주 방어(429), ③ 큐 넘침 알림·화면, ④ 기동 직후 STALE 유예, ⑤ 큐 상한·옵션.

### 0.1 v2 결정 (코덱스 r2 필수 7건) — 🔴 본문과 충돌하면 여기를 따른다

| # | r2 지적 | v2 결정 |
|---|---|---|
| S1 | SSE `closing` 사전 검사만으로는 등록·종료가 원자적이지 않다(검사 직후 종료 훅이 순회하고 그 뒤 등록되면 emitter 잔존) | **등록과 종료를 같은 lock으로 직렬화.** `synchronized(lock){ if(closing) return completedEmitter(); map.put(...) }` / 종료 훅 `synchronized(lock){ closing=true; 전부 complete; clear }`. `LiveSpanStreamService`는 이미 `synchronized` 메서드라 `stopped` 검사·등록·종료가 같은 모니터 안임을 테스트로 고정. ticker·deadline 경로는 `closing` 후 제출 금지(§2.1) |
| S2 | `await-termination 10s`만으로 배치 종료 정책이 안 닫힌다. `evaluateAll()`은 Zabbix 프로비저닝·push·orphan sweep·backfill이 한 실행에 섞여 "자연 수렴" 일반화 불가. 10초 초과 시 실행 이력 공백 가능 | **범위를 명확히 축소**: 이 티켓은 (a) `ContextClosedEvent` 후 **새 배치 시작 차단**(`SchedulerManager.execute()` 진입 가드, 스킵 로그) (b) 진행 중 배치에 10초 기회 — 두 가지만. 10초 초과분은 종전과 같이 interrupt(현 동작을 악화시키지 않음). "실행 이력 공백 없음" 검증 기대 **삭제**. 배치별 reconciliation은 후속 백로그(§3)로 명시 |
| S3 | graceful 20초와 "OTLP 요청은 완료까지 대기"는 처리 시간이 20초를 넘으면 동시에 성립 불가 | V0에서 **OTLP 적재 p99 실측** → `timeout-per-shutdown-phase = max(20s, p99×2)`로 확정. 초과 요청은 끊기고 Collector 재시도로 회복(영수증은 성공 뒤라 안전). 검증 문구를 "timeout 이내 요청은 200, 초과 요청은 재시도로 회복"으로 교체(§2.1) |
| S4 | Semaphore의 순서·보유 구간·해제·설정 검증 미정. "인증 뒤·본문 읽기 전"은 현 컨트롤러의 본문→인증 순서와 충돌. 429는 무손실이 아니라 30분 재시도 예산 소모 | **순서 확정**: Content-Type(415) → Content-Length(413) → **admission `tryAcquire`(429)** → 본문 읽기 → 토큰·라이선스 → 적재 → 영수증 → 응답. 인증 **전**에 잡는다(본문을 읽기 전에 거절해야 메모리를 안 쓴다; 무인증 요청이 permit을 잠깐 잡아도 즉시 401·해제라 무해). 보유 구간 = 획득~응답 생성, `try/finally` 단일 해제. 설정 범위 1~64, 기동 시 검증. 429 계수는 인메모리 카운터(DB 아님). "손실 없음" 문구 → "재시도 예산(30분) 안에서 회복". V2 합격 기준에 429 비율·연속 429 시간 상한 추가(§2.5·§4) |
| S5 | 20,000·500,000은 실측 전 확정 불가. 신호별 합·bbolt 오버헤드·compaction 중 유입 미포함. 30분 in-flight 폐기 때문에 "2.8시간 큐"≠"2.8시간 무손실" | **V0를 작업 1단계로 이동**(§5). 기본값·최대값은 V0 후 확정하며 설계에는 **잠정** 20,000 / 최대 200,000으로 표기. 디스크 산식에 bbolt 오버헤드 계수(V0 실측)·compaction 중 유입 포함. 안내서에 "장애가 30분을 넘으면 30분마다 소비자 수(10)만큼 배치가 폐기된다"를 별도 문장으로(§2.4) |
| S6 | 갱신 절차의 "큐 0"은 구간 `max(queue_size)` 합산이라 최신·신호별 판정 불가. rollback 절차 없음 | 상태 탭에 **신호별(`dims->>'data_type'`) 현재 큐 + 표본 시각** 표시(§2.2 B 화면 계약에 포함). 갱신 게이트 = "BE 정상 + 최근 60초 수신 초록 + 신호별 큐 0이 5분 연속". rollback = 재생성 전 YAML 백업(`.bak`)·재기동 실패 시 복원·큐 디렉터리 불변(§2.4 E) |
| S7 | 기본값(임계 5분·주기 5분)에서 첫 평가가 `bootAt+5분` 뒤라 `< threshold`가 거짓 → 유예가 한 번도 안 걸림 | 조건을 `minutes(bootAt, now) < threshold + intervalMin`으로. `intervalMin`은 `run(setting)`이 받는 스케줄러 행의 주기(기본 5). 기본값에서 첫 회차(≈5분)는 유예, 둘째 회차(≈10분)부터 판정. 최대 감지 지연 ≈ 임계 + 2×주기(기본 15분) + 기동·실행 지연(§2.3) |

r2 🟡 2건: breakdown 이벤트 계약(§2.2 — Zabbix 이벤트에는 합계만, 분리 값은 화면 열로 대체해 범위 축소) · 영수증 창 표현("없앤다" → "정상 종료에서 강제 중단 가능성을 줄인다"로 정정).

### 0.2 v1 결정 (코덱스 r1 필수 8건)

| # | r1 지적 | v1 결정 |
|---|---|---|
| R1 | Boot 3.3 graceful phase는 `MAX−1024`(jar 확인 `2147482623`, StartStop `MAX−2048`). 기존 emitter만 닫으면 신규 연결 경쟁 | 근거 정정. `ContextClosedEvent` 훅 유지(바이트코드로 순서 확인). closing 플래그 + 신규 구독 차단 → v2 S1로 원자성 보강 |
| R2 | 스케줄러 기본은 배치 interrupt. 외부 부작용 롤백 불가 | `await-termination=true`·10s → v2 S2로 범위 확정 |
| R3 | replay 폭주: 소비자 10×배치 1,024, 적재 경로 상한 없음, Hikari 10 | §2.5 신설(admission 429) → v2 S4로 계약 확정 |
| R4 | `sizer: bytes`는 논리 크기≠디스크, 신호별 ×3, compaction 여유 근거 없음 | bytes 폐기, requests 유지, 신호별 명시, 여유 = 큐 파일 2배 |
| R5 | `2048×2^20` int 오버플로, 큐 메트릭 단위 파급 | bytes 폐기로 소멸 |
| R6 | "큐 비우기"는 손실 절차 | 삭제. 큐 0 확인 후 재생성 → v2 S6로 판정·rollback 보강 |
| R7 | SQL 괄호·`coalesce`, F9 과장, self metric reset | SQL 확정, 화면 열 범위 포함, reset 검증 항목 |
| R8 | `ApplicationReadyEvent`는 늦다. 감지 지연은 임계+주기 | `getStartupDate()` 사용 → v2 S7로 조건 재정의 |

직접 확인한 것: 영수증은 성공 뒤 `REQUIRES_NEW`(`ApmOtlpReceiptService:78`) · `seenAt`=`Instant.now()`(`ApmOtlpController:377`) · 적재 경로 Semaphore 없음(`LiveBodyReader`만) · 413 경계·결정적 오류 4xx 분류·영수증 원자성은 별건(§3).

## 1. 현상 — 코드로 확인한 사실

| # | 사실 | 근거 |
|---|---|---|
| F1 | Collector→BE exporter는 `sending_queue{storage: file_storage, queue_size: 5000}` + `retry_on_failure{max_elapsed_time: 30m}`. `num_consumers`·`sizer` 생략(기본 10·requests) | `collector-template.yaml:99-100` |
| F2 | `queue_size`는 **요청(배치) 수이고 신호별(metrics/traces/logs)로 따로** 적용. batch는 512건이 차면 5초를 안 기다림 → 바쁜 서비스는 초당 여러 배치 | 같은 파일 `:91` · exporterhelper v0.159 README |
| F3 | `max_elapsed_time`은 소비자가 꺼내 재시도 중인 **요청 하나**에 걸린다(`0`=무한). 장기 장애에서 30분마다 ≈소비자 수(10)배치 폐기, 나머지는 대기 → 실질 유실 경계는 큐 상한 **과** 30분 폐기 둘 다 | README |
| F4 | BE는 적재 예외를 전부 **503**, 영수증은 **성공 뒤 독립 트랜잭션** | `ApmOtlpController.java:72-82, 273-278` · `ApmOtlpReceiptService.java:73-78` |
| F5 | `server.shutdown`·`spring.task.scheduling.shutdown.*` 없음 → 종료 시 처리 중 요청·배치가 끊긴다 | `application.yml:4-5, 25-31` |
| F6 | SSE 3곳은 `@PreDestroy`에서 emitter `complete()`. 신규 구독 차단 없음 | 각 클래스 |
| F7 | 서비스 `last_seen_at`은 BE 수신 시각. STALE = `now − lastSeenAt > threshold` | `ApmOtlpController:377` → `ApmRegistryWriter.touchService` · `ApmAlertEvaluator.java:163-170` |
| F8 | 알림 평가 잡은 `interval` 트리거, `initialDelay = period`(기본 5분), fixedDelay | `SchedulerManager.java:217-219` |
| F9 | `COLLECTOR_FAILURE`는 `send_failed%`만 합산. `enqueue_failed`는 저장되지만 알림·저장 exporter 화면 행에 없음 | `ApmAlertEvaluator.java:340-356`, `ApmCollectorMetricStore.java:65-115` |
| F10 | 설치 옵션은 큐 디렉터리만 | `ApmCollectorConfigOptionsDto.java` |
| F11 | 적재 경로에 동시 상한 없음(라이브만 `Semaphore`+429). Hikari 명시 없음(기본 10), 스케줄러 풀 4 | `LiveBodyReader.java:34-53`, `application.yml:25-31` |

## 2. 항목별 설계

### 2.1 Graceful shutdown (BE 전역) — F5·F6 · R1·R2 · S1·S2·S3

**설정**

```yaml
server:
  shutdown: graceful
spring:
  lifecycle:
    timeout-per-shutdown-phase: ${SHUTDOWN_PHASE_TIMEOUT:20s}   # V0 실측 후 max(20s, OTLP 적재 p99×2)로 확정
  task:
    scheduling:
      shutdown:
        await-termination: true
        await-termination-period: 10s
```

**종료 순서(확인됨)**: `ContextClosedEvent` → `LifecycleProcessor.onClose()`(graceful `MAX−1024`: 활성 요청 0까지 최대 timeout 대기 → `MAX−2048` 서버 stop) → 빈 파괴(`@PreDestroy`, 스케줄러 executor 최대 10s). 최악 ≈ timeout + 10s + α. **서비스 관리자 stop timeout은 이 합보다 커야 한다** — 설치 번들 정의(systemd `TimeoutStopSec`·Windows 서비스·Docker `stop_timeout`)와 함께 맞춘다(안내서 §7.9).

**SSE 3곳 — 등록·종료 직렬화(S1)**

```java
private final Object lock = new Object();
private boolean closing;                       // lock 안에서만

SseEmitter subscribe(...) {
    synchronized (lock) {
        if (closing) { var e = new SseEmitter(0L); e.complete(); return e; }   // 즉시 종료, FE가 재접속
        subscriptions.put(id, sub);
        return sub.emitter();
    }
}
@EventListener(ContextClosedEvent.class)
void closeForShutdown() {
    List<Subscription> snapshot;
    synchronized (lock) { if (closing) return; closing = true; snapshot = List.copyOf(subscriptions.values()); subscriptions.clear(); }
    snapshot.forEach(s -> quietly(s.emitter()::complete));   // lock 밖에서 complete (콜백 재진입 회피)
}
```

| 클래스 | 변경 |
|---|---|
| `event/stream/EventStreamHub` | 위 구조. `@PreDestroy`는 `closeForShutdown()` 재호출(멱등). 하트비트 ticker는 `closing` 후 send 금지 |
| `premium/apm/overview/live/ApmLiveStreamController` | 동일. 1초 ticker는 `closing`이면 tick 스킵 |
| `premium/apm/overview/live/spans/LiveSpanStreamService` | 이미 `synchronized` 메서드 — `stopped` 검사·connection 등록·`close(c)`가 같은 모니터 안임을 **테스트로 고정**. writer·snapshot·deadline 제출 경로에 `stopped` 검사 추가 |

**스케줄러(S2)** — 이 티켓의 범위는 둘뿐: (a) `SchedulerManager`에 `closing` 플래그(`ContextClosedEvent`) → `execute()` 진입 시 `closing`이면 시작하지 않고 `info` 로그 (b) `await-termination` 10s. 10초를 넘는 배치는 종전처럼 interrupt되며 실행 이력이 비어 있을 수 있다(현 동작과 동일). 배치별 중단 안전성·외부 부작용 reconciliation은 §3 후속.

**부수 이득(정정)**: F4의 "적재 커밋 → 영수증 전 종료" 창은 정상 종료에서 **강제 중단 가능성이 줄어든다**. timeout 초과·JVM crash·OS 강제 종료·영수증 기록 실패에서는 창이 남는다(한 배치 두 번 계산 — 주석에 감수한 대가로 기록됨).

**FE**: `EventSource` 자동 재접속 + `Last-Event-ID` 되감기. 변경 없음.

**검증**: (a) SSE 3종만 연결한 채 종료 → 2초 미만, `Commencing graceful shutdown`→`Graceful shutdown complete`. (b) OTLP 배치 진행 중 종료 → **timeout 이내 요청은 200 완료, 초과 요청은 끊기고 Collector 재시도로 회복**(영수증 없음 → 중복 거절 없음 → 재적재). (c) 종료 플래그 후 `subscribe()` → 즉시 완료된 emitter. (d) 종료 플래그 후 배치 트리거 → 시작 안 함 로그. 단위: 3클래스 "종료 중 등록 경쟁"을 두 스레드로 재현(등록 스레드가 lock 대기 중 종료 → 등록 결과가 즉시 완료 emitter).

### 2.2 큐 넘침을 수집기 실패 알림·화면에 포함 — F9 · R7 · S6

**A — 알림 SQL** (`ApmAlertEvaluator.collectorFailureSeries`):

```sql
where service_id = ?                      -- 센티널(수집기 자기 메트릭)
  and ( metric like 'otelcol_exporter_send_failed%'
     or metric like 'otelcol_exporter_enqueue_failed%' )
  and coalesce(dims->>'exporter', '') not in ('otlphttp/moveseye-live', 'otlp_http/moveseye-live')
  and bucket_start >= ? and bucket_start < ?
```

- kind `COLLECTOR_FAILURE` 유지(고객 규칙 호환). 표시명 "APM 수집기 전송 실패·큐 넘침". **Zabbix 이벤트에는 합계만** 싣는다(evaluator 반환 계약 `Point` 불변). 원인 분리는 아래 B의 화면 열이 맡는다(범위 축소, r2 🟡).
- 라이브 exporter 제외는 저장 경로 지표와 같은 조건.

**B — 화면 계약**(`ApmCollectorMetricStore` 저장 경로 집계 → 상태 DTO → FE `ApmCollectorStatusTab`):

| 필드 | 뜻 | 출처 |
|---|---|---|
| `sendFailed` | 전송 실패 합(기존) | 기존 |
| `enqueueFailed` | 큐 넘침 합(3신호, 라이브 제외) | 신규 |
| `queueBySignal[{signal, size}]` | **신호별 현재 큐 길이**(`dims->>'data_type'`, 최신 칸의 값) | 신규(S6) |
| `queueSampledAt` | 큐 표본 시각(최신 칸 `bucket_start`) | 신규(S6) |

구 서버는 키를 안 주므로 FE는 없으면 "—". 🔴 `data_type` 속성명은 Collector 0.159 실측으로 확정(없으면 exporter 단위 합계만 표시하고 신호별 열은 숨김).

**한계(문서화)**: BE 다운 중 self metric도 같은 큐를 탄다 → 실시간 관측 불가, 회복 뒤 도착. Collector 재기동 시 counter reset → 증분 계산이 음수 증분을 0으로 처리하는지 검증(V4). 안내서에 "넘침 의심 시 Collector 로컬 로그 보존".

**검증**: `ApmAlertEvaluatorTest` — enqueue만 → >0 · 라이브만 → 0 · exporter dims 없음 → 포함 · send_failed 회귀. 화면: 상태 탭 스냅샷에 열·신호별 큐·표본 시각.

### 2.3 기동 직후 STALE 판정 유예 — F7·F8 · R8 · S7

**현황**: 기동 후 첫 평가는 ≈5분 뒤(F8). 오탐 조건 = "다운 > 임계" ∧ "재전송이 그 서비스까지 첫 평가 전에 못 미침". §2.4로 큐를 키우면 더 자주 성립.

**결정**: `bootAt` = `ApplicationContext.getStartupDate()`(`Instant`). `ApmAlertEvaluationJob.run(setting)`이 스케줄러 행의 주기(`intervalMinutes`, 기본 5)를 평가 서비스에 넘기고, `staleMinutes`는

```
if (lastSeenAt < bootAt && minutes(bootAt, now) < threshold + intervalMin) return Optional.empty();
```

- 기본값(임계 5·주기 5): 첫 회차(≈5분)는 유예, 둘째(≈10분)부터 판정. 임계 1분·주기 5분: 첫 회차만 유예. 임계 30분: 7회차까지 유예.
- `empty` = "잴 것이 없었다"(push·판정 없음). **기동 전 열린 STALE 이벤트는 유예 중 유지**(의도, 도움말 명시).
- 기동 후 한 번이라도 수신한 서비스(`lastSeenAt ≥ bootAt`)는 정상 판정.
- **실제 장애 감지 최대 지연 ≈ 임계 + 2×주기(기본 15분) + 기동·실행 지연** — 도움말·안내서 문구.
- `minutes < 0`(시계 역행)은 0으로 클램프. DB `LocalDateTime`은 시스템 zone으로 변환(기존과 동일).
- 미리보기(`staleSeries`) 불변. 버린 대안: 마지막 평가 시각 저장 방식(상태 필요, 후속).

**검증**: 단위 — (a) 임계 5·주기 5·bootAt+5.5분·lastSeen=bootAt−10분 → empty (b) bootAt+10.5분 → 판정값 (c) lastSeen ≥ bootAt → 정상 (d) `ApmAlertEvaluationService` 테스트: 유예 회차 push 0회·기존 열린 이벤트 유지.

### 2.4 큐 상한 상향 + 설치 옵션 노출 — F1·F2·F3·F10 · R4·R5·R6 · S5·S6

**A — 단위는 요청 수 유지, 기본 10,000(신호별, §7 V0 확정)**. bytes sizer 폐기(논리 크기≠디스크·신호별 ×3·메트릭 단위 파급·least performant). V0 실측: 배치당 디스크 ≈240KB, 기본 샘플링·1,000 SERVER/초에서 0.25배치/초 → 10,000 = 약 11시간·최대 ≈2.4GB(트레이스). 범위 1,000~200,000.

**B — 재시도 시간**: `max_elapsed_time` 30m 유지, 옵션 노출(기본 30). `0`(무한)은 모든 예외가 503(F4)이라 결정적 오류 배치가 소비자를 영구 점유 → 금지. 안내서에 별도 문장: **"BE 장애가 30분을 넘으면 30분마다 소비자 수(10)만큼의 배치가 폐기된다. 큐가 남아 있어도 무손실 시간은 30분이다."**

**C — 옵션 2개**

| 필드 | 타입 | 기본(잠정) | 범위(잠정) | 템플릿 변수 |
|---|---|---|---|---|
| `queueSize` | Integer | 10000 | 1,000 ~ 200,000 | `${QUEUE_SIZE}` |
| `retryMaxElapsedMin` | Integer | 30 | 5 ~ 1,440 | `${RETRY_MAX_ELAPSED}` (`{n}m`) |

- BE: `ApmCollectorConfigOptionsDto` 필드 2 + `EMPTY`(🔴 편의 생성자 금지, P4 D1) · `ApmCollectorConfigGenerator.intOption` 범위·치환 · defaults DTO 2 필드 · `ApmCollectorConfigGeneratorTest` · yaml validate 테스트 · 템플릿에 `num_consumers: 10` 명시.
- FE: `types/apm.ts` · `apmCollectorDisplay.ts` · `ApmTokenIssueDrawer.tsx` 입력 2칸(단위 "배치"·"분", 도움말 "신호별 적용", **예상 디스크 표시** = 산식 D) · `useApmConfigDefaultsSync.ts` · 항상 명시 전송 · 테스트 3파일 · `typecheck:contract`.
- 🔴 양방향 호환 테스트: 새 FE→구 BE(미지 필드 무시 — Jackson `FAIL_ON_UNKNOWN_PROPERTIES` 설정 확인) · 구 FE→새 BE(기본값). 계약 픽스처에 둘 다.

**D — 디스크 안내**(안내서 §7.2): ① 큐 상한은 신호별 ② `필요 디스크 ≈ Σ신호(평균 배치 바이트 × queueSize) × k_bbolt × 2 + compaction 중 유입분` — `k_bbolt`(파일 오버헤드 계수)·평균 배치 바이트·유입분은 **V0 실측값** ③ 디스크가 차면 `enqueue_failed` 폐기 → §2.2 알림 ④ `memory_limiter`는 디스크와 무관 ⑤ B의 30분 문장.

**E — 기존 고객 갱신**(S6): 템플릿 변경은 설치된 Collector에 자동 반영되지 않는다.
1. 게이트: BE 정상 · 수집기 상태 탭 "최근 60초 수신" 초록 · **신호별 큐 0이 5분 연속**(§2.2 B의 `queueBySignal`·`queueSampledAt`로 판정)
2. 현재 YAML 백업(`config.yaml.bak`) → 토큰·설정 탭에서 설정 **재생성**(토큰 불변) → Collector 재시작
3. 재시작 실패 시 `.bak` 복원 후 재시작. **큐 디렉터리는 어떤 경우에도 삭제·변경하지 않는다**
4. V7(백로그 있는 상태의 재시작 보존) 실패 시 릴리스 차단
릴리스 노트·안내서 §7.2 "기존 설치 갱신 절"에 반영. 구 설정 감지·"재생성 필요" 배너는 후속 백로그.

### 2.5 회복 직후 replay 폭주 방어 — F11 · R3 · S4

**문제**: BE가 올라오면 소비자 10개가 최대 1,024건 배치를 동시에 밀어 넣는다. 적재 경로에 상한이 없어 Hikari(기본 10)를 전부 점유하면 조회·배치(풀 4)가 커넥션 대기.

**결정 — admission Semaphore, 순서 확정**

| 순서 | 단계 | 실패 코드 | 비고 |
|---|---|---|---|
| 1 | Content-Type | 415 | 기존 |
| 2 | Content-Length | 413 | 기존, 본문 안 읽음 |
| 3 | **admission `tryAcquire()`** | **429 `APM_INGEST_BUSY`** + `Retry-After: 2` | 신규. 인증 **전**·본문 읽기 **전**(메모리를 쓰기 전에 거절). 무인증 요청이 permit을 잠깐 잡아도 4단계 401 즉시·해제 |
| 4 | 본문 읽기·압축 해제 | 400/413 | 기존 |
| 5 | 토큰·라이선스·중복 | 401/403/200 | 기존 |
| 6 | 적재 → 영수증 → 응답 | 503/200 | 기존 |

- permit 보유 = 3단계 획득 ~ 응답 생성. `try/finally`로 **정확히 한 번** 해제(모든 early return·예외 포함, 테스트로 고정).
- 설정 `app.apm.ingest.max-concurrent` 기본 **6**(잠정 — Hikari 10 − 스케줄러·조회 몫; **V2 결과가 확정 게이트**), 범위 1~64, 기동 시 검증(0·음수·과대 → 기동 실패).
- 429 계수는 인메모리 카운터(`ApmIngestRecentTracker` 계열) — DB 쓰기 없음. 화면 문구는 "지연"(폐기 아님).
- **429는 무손실이 아니다**: 같은 배치가 30분 내내 429면 `max_elapsed_time`으로 폐기된다. 그래서 V2 합격 기준에 "replay 중 429 비율 < 20%, 개별 배치 연속 429 < 5분"을 둔다. `Retry-After` 준수는 Collector 실측(V2)으로 확인하고, 설계는 exporter 자체 backoff만 전제한다.
- `num_consumers: 10` 명시. 낮추지 않는다(429가 자연 스로틀, 소비자 축소는 정상 시 처리량도 줄임).

**검증**: 단위 — 동시 7번째 요청 429·해제 후 통과·429 시 본문 미읽기·예외 경로 해제. 부하 — §4 V2.

## 3. 범위 밖 (의도적으로 안 하는 것)

- **APM ingest 프로세스 분리** — 재기동 문제는 큐가 해결. 분리 근거(ingest가 조회 p95를 해침) 미관측. 설치형 1벌에서 프로세스 추가는 설치 번들 공백을 키움. 실시간 관제 SSE가 같은 프로세스라 중계층 필요. 재검토 트리거: V2에서 조회 p95 악화 실측 / 점검 창 수시간 유실 실발생.
- **역할 스위치(ingest-only jar)** — 분리의 헤지. 백로그.
- **Kafka** — 보관·재전송·완충은 Collector 큐가 담당, 소비자 BE 하나. 코덱스 2회 동의. **현 구조가 해결하지 않는 것**: Collector 호스트·디스크 장애 · BE+DB 동시 장기 점검 · 큐 파일 손상 · 다중 BE 분배 · 수일 보관. 전제가 SaaS/다중 인스턴스/독립 SLO로 바뀌면 재검토.
- 배치별 중단 안전성·외부 부작용 reconciliation(S2) — 백로그.
- 마지막 평가 시각 기반 정밀 STALE 보정.
- 413 영구 손실 경계(상위 §4.1 별건) · BE 결정적 오류의 4xx 분류(독 배치 근본 가드) · 적재+영수증 단일 트랜잭션.
- 구 설정 감지 배너·설정 버전 표시.

## 4. 검증 계획 (dev, BE :3000 + 로컬 Collector 0.159.0)

| 단계 | 행위 | 기대 / 측정 |
|---|---|---|
| **V0(1단계)** | 합성 부하(1,000 스팬/초 + 메트릭 + 로그) 10분, BE 정지 | 신호별 큐 파일 증가율 → **배치당 디스크 바이트·초당 배치 수·bbolt 계수·compaction peak** 확정(§2.4 A·D 입력). 별도 정상 상태에서 **OTLP 적재 p99**(§2.1 timeout 입력). `otelcol_exporter_queue_size`의 `data_type` 속성 존재 확인(§2.2 B) |
| V1 | 부하 중 BE 정지 5분 | ✅ 09-28 큐 64/41/64 배치, `enqueue_failed` 0 |
| V2 | BE 기동(정상 유입 유지) | ✅ 09-28 §7 V2 참조(소진 108초·p99 7.1s·429 14%). 큐 소진 곡선 단조 감소 · 조회 API p95/p99 3개 · Hikari active/pending · DB CPU·lock wait · 429/503/413 수 · 소진 중 새 `enqueue_failed` 0. **합격**: p95 무부하 대비 2배 이내, pending 0 유지, 429 비율 < 20%, 개별 배치 연속 429 < 5분. → `max-concurrent` 기본값 확정 |
| V3 | 기동 후 5·10·15분 평가 | IT 4건으로 확인(유예·기동 후 수신·주기 폭·경계). 런타임은 격리 DB에 STALE 규칙이 없고 규칙 생성이 사용자 Zabbix에 트리거를 만들므로 생략 |
| V4 | `queueSize` 1,000·정상 샘플 100%·1,000 SERVER/초, BE 차단 | ✅ 09-28 약 250초에 트레이스 큐 1,000 도달, `enqueue_failed_spans` 15,360→55,296(초당 ≈2,000 스팬 폐기). 회복 후 `/apm/collectors` 행: `enqueueFailedTotal 7680`·`queueBySignal traces 1000/1000`·`queueSampledAt` 표시 ✅. ⚠️ 넘침 30초 뒤 Collector를 죽인 회차에서는 1m 저장소에 `enqueue_failed` 증분 행이 없었다(누적 카운터 첫 표본은 증분을 못 만든다, scrape 30초) → **V4b(넘침 후 3분 유지) ✅**: 1m 저장소 `enqueue_failed_spans` 12행·합 388,096(카운터 389,632, 첫 표본만 유실) · 알림 SQL(전송 실패+큐 넘침, 라이브 제외) 30분 합 **419,003** → `COLLECTOR_FAILURE` 발화 조건 성립 · 행 `enqueueFailedTotal 389,632`·`sendFailedTotal 11,673` · 시계열 EP `enqueueFailed [173,056 · 215,040 · 0]` · 1,000배치 소진 381초 |
| V5 | SSE 2종 연결 유지 + OTLP 진행 중 종료 | ✅ 09-28 graceful complete 4.25초(진행 중 적재 완료 후), SSE가 대기를 붙잡지 않음. 종료 중 등록 경쟁은 단위 테스트로 고정. 🔴 Windows에서 Ctrl+C는 JVM에 안 닿았다 — JMX Admin MBean으로 종료 |
| V6 | `otelcol validate`(기본·범위 양끝) | ✅ 2026-09-28 PASS — queueSize {1,000·10,000·200,000} × maxElapsed {5m·30m·1440m} 9조합, Collector 0.159.0. 골든 회귀는 BE 테스트(`ApmCollectorLiveConfigTest`)로 확인 |
| V7 | 백로그 있는 상태에서 Collector 재시작 | ✅ 09-28 트레이스 1,000·로그 60·메트릭 38 배치가 찬 채 강제 종료→재시작 후 큐 997/5/7로 복원(이미 소진 시작), 넘침 카운터는 0으로 리셋(설계대로). `.bak` 복원 절차는 문서로만(실연 생략) |

## 5. 작업 순서·공수

| 순서 | 항목 | 레포 | 공수 |
|---|---|---|---|
| 1 | **V0 실측**(큐 산정·p99·`data_type`) | dev | 0.5일 |
| 2 | §2.1 graceful + SSE 직렬화 + 스케줄러 가드 | BE | 0.75일 |
| 3 | §2.5 ingest admission 429 | BE | 0.5일 |
| 4 | §2.3 STALE 유예 | BE | 0.25일 |
| 5 | §2.2 알림 SQL + 화면 계약(신호별 큐·표본 시각) | BE+FE | 0.75일 |
| 6 | §2.4 옵션·템플릿·안내서·갱신 절차 | BE+FE+안내서 | 1일 |
| 7 | V1~V7 실측 | dev | 1일 |

합계 ≈ 4.75일. 2·3·4는 BE 첫 커밋, 5·6은 BE→FE 순으로 계약 맞춘 뒤 각각 커밋.

## 7. V0 실측 결과 (2026-09-28, ZM-122 착수 1단계) — 🔴 §2.4·§2.1의 숫자는 여기를 따른다

환경: 격리 BE `:3002`(워크트리 jar, DB `dmove_apm`@5433, Redis DB 5) · Collector 0.159.0 별도 인스턴스(grpc 4327·http 4328·self 8889) · 프록시 `:4402`→BE(지연·상태 기록, 차단 스위치) · 합성 OTLP 생성기(SERVER+CLIENT 스팬, 히스토그램 메트릭, 로그) · 하네스는 scratchpad `v0/`(제품 소스 수정 0).

| 단계 | 조건 | 결과 |
|---|---|---|
| A 기준 | 500 SERVER/초(=1,000 스팬/초)·5서비스·120초, BE 정상 | 생성 12만 스팬 → tail 샘플링 후 BE 도착 **7,532**(≈6%), DB 일치. 적재 지연 **트레이스 p50 1.8s·p99 3.6s**(배치 ~300스팬, gzip 15KB) · 메트릭 p99 0.2s · 로그 p99 0.07s |
| B 차단 | 1,000 SERVER/초·600초, BE 차단(프록시 refuse) | 큐 증가: **트레이스 0.25배치/초**(600초에 151배치)·메트릭 0.13/초·로그 0.19/초. 큐 파일: 트레이스 33.5MB(≈**240KB/배치**), 메트릭·로그 8MB. `enqueue_failed` 0 |
| C 회복 | 프록시 복구 + 정상 부하 500/초·240초, 구 jar(admission 없음) | 트레이스 151배치 **128초에 소진**(≈1.2배치/초, 소비자 10). 소진 중 트레이스 적재 **p50 6.3s·p99 8.5s·max 8.6s**(512스팬 배치 10개 동시). 조회 API p95: services/overview 194ms·overview 220ms·errors 95ms(무부하 단일 표본 162ms 대비 악화 없음). 429/503 0 |
| **V5 종료** | 부하 500/초 + SSE 2종 열린 상태, JMX Admin `shutdown()`(새 jar) | `Application shutdown requested` → `Commencing graceful shutdown` → **`Graceful shutdown complete` 4.25초**(진행 중 OTLP 적재 완료 대기; SSE는 ContextClosedEvent에서 먼저 닫혀 대기를 붙잡지 않음) · 포트 닫힘 ≈11초 · 프로세스 종료 ≈25초(스케줄러 await 10초 + 빈 파괴) — 20초 타임아웃 미도달 |
| **V1 정지** | 500/초·BE 5분 정지(graceful로 내린 상태) | 큐: 트레이스 64·메트릭 41·로그 64 배치, `enqueue_failed` 0 |
| **V2 회복** | 새 jar(admission 6) 기동, 정상 부하 유지, 6분 관측 | 트레이스 74→0 **108초**·메트릭 83초에 소진. 소진 중 트레이스 적재 **p50 3.3s·p95 5.8s·p99 7.1s**(admission 없던 C: 6.3/8.1/8.5 — 개선). **429 = 60건 / 2xx 366건(14%, 기준 20% 이내)**, 503 0. 조회 API p95 214·253·44ms(C와 동등, pending 없음). → `max-concurrent` 기본 **6 확정** |
| 지표 | Collector self metrics | `otelcol_exporter_queue_size{data_type=metrics|traces|logs}`·`queue_capacity` 존재 확인 → 신호별 큐·사용률 표시 가능(§2.2 B) |

**설계 숫자 확정**
- §2.4 A: 배치 단위 유지, 기본 **10,000**(트레이스 ≈2.4GB 최대, 이 부하에서 ≈11시간; `normalPct` 100%면 ≈4배치/초라 ≈40분), 범위 1,000~200,000(신호당 ≈48GB). F2의 "10분대 소진"은 **샘플링 전 기준의 과대 추정**이었다 — 저장 경로 배치는 tail 샘플링 뒤라 기본 설정에서는 시간 단위로 버틴다.
- §2.4 B: 30분 유지(옵션 5~1,440). 안내 문장 "장애가 30분을 넘으면 30분마다 소비자 수(10)만큼 배치 폐기"는 실측 구조와 일치.
- §2.1 S3: 적재 p99 3.6s(정상)·8.5s(회복 폭주) → `timeout-per-shutdown-phase` **20s 유지**(p99×2 = 17s < 20s).
- §2.5: admission 6으로 회복 소진 시간은 같고(108초 vs 128초) 트레이스 적재 p99는 8.5→7.1초로 내려갔으며 429 비율 14%(기준 20%). 기본 **6 확정**. 정상 부하에서도 429가 드물게(0.3%) 난다 — 폐기가 아니라 지연이라 허용.

## 6. 코덱스 왕복 이력

| 회차 | 파일 | 결과 |
|---|---|---|
| r1 | `reviews/review_apm-ingest-resilience-design_codex-r1.md` | 필수 8건 → v1 §0.2 전건 반영 |
| r2 | `reviews/review_apm-ingest-resilience-design_codex-r2.md` | R1~R8 수용 3·부분 5·미수용 0, 신규 필수 7건 → v2 §0.1 전건 반영(반대 유지 0, 범위 축소 2: 배치 reconciliation·이벤트 breakdown) |
