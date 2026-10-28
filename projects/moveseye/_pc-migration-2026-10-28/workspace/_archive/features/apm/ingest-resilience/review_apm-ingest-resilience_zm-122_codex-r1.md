# 검수 결과 — ZM-122 구현

첨부된 설계·인계서·BE/FE diff를 기준으로 검수했다.

## §1 중점 9건 답변

1. `ApmOtlpController.receive()` 분할 — 보완

`contentEncoding`은 분할 뒤 직접 쓰이지 않고, 앞에서 계산한 `gzipped`가 `receiveAdmitted(...)`로 전달되므로 누락은 없다. permit도 `try/finally` 안에서 인증 실패·본문 오류·적재 예외를 포함해 반환된다.

다만 두 가지 보완이 필요하다.

- 획득한 `Semaphore`를 지역 변수에 보관하지 않고 `finally`에서 다시 `admission()`을 호출한다. 현재 운영 생명주기에서는 같은 객체지만, 지연 초기화·테스트 재설정에 취약하다. `Semaphore permit = admission()`으로 잡고 같은 인스턴스를 `release()`해야 한다.
- 429가 본문을 읽지 않는 것은 제어 흐름상 맞지만, `ApmOtlpControllerTest.busyIsRejectedWith429BeforeIngest()`는 `getInputStream()` 미호출을 검증하지 않는다. 현재 테스트는 pipeline·인증 미호출만 확인한다.

더 큰 문제는 admission 뒤 인증보다 본문을 먼저 읽는 순서다. 무인증 chunked 요청이 본문을 천천히 보내면 permit 6개를 장시간 점유할 수 있다. 인계서의 “무인증 요청은 즉시 401·해제”는 현재 구현에서 성립하지 않는다. admission 획득 후 헤더 기반 토큰 인증을 하고, 그다음 본문을 읽는 순서가 안전하다.

2. `admission()` 지연 생성 — 보완

Spring 운영 경로에서는 `@PostConstruct validateAdmission()`이 요청 처리 전에 실행되므로 1~64 검증과 생성은 정상이다.

하지만 지연 경로는 다음 차이가 있다.

- `maxConcurrent > 64`도 그대로 허용한다.
- 먼저 생성된 뒤 `maxConcurrent`가 바뀌어도 Semaphore 크기는 바뀌지 않는다.
- 운영 경로와 테스트 경로가 서로 다른 설정 계약을 갖는다.

테스트가 `validateAdmission()`을 명시적으로 호출하거나 package-private 생성 팩토리를 쓰는 편이 낫다. 최소한 지연 경로에도 동일한 1~64 검증을 적용해야 한다.

3. STALE 유예와 `liveKeys` — 맞다, 테스트 보완 필요

`ApmAlertEvaluationService`의 STALE 유예 hunk에서 `continue`가 실행되는 시점에는 설명대로 `liveKeys` 등록이 이미 끝난 상태다. 기존 orphan sweep이 `liveKeys`를 기준으로 한다면 유예 중 트리거를 고아로 내려버리지 않는다.

다만 현재 신규 IT는 `evaluated/fired`만 검증한다. 열린 STALE 트리거 또는 바인딩이 유예 중 실제로 유지되는지까지 고정하지 않아, `liveKeys` 등록 위치가 뒤로 이동하는 변이를 잡지 못한다.

4. `bootAt` 초기값과 테스트 override — 맞다, 과하지 않다

`Instant.now()` 초기값 후 `ApplicationContext.getStartupDate()`로 교체하는 방식은 컨텍스트 없는 단위 테스트와 Spring 운영 경로를 모두 지원한다. `ApmAlertEvaluationIT`의 `@BeforeEach`에서 한 시간 전으로 돌리는 것도 기존 테스트 의미를 보존하는 합리적인 격리다.

다만 `inStartupGrace()`가 `bootAt`을 시스템 zone의 `LocalDateTime`으로 바꾼 뒤 `Duration.between(LocalDateTime, LocalDateTime)`을 사용한다. DST 전환 지역에서는 실제 경과시간과 벽시계 경과시간이 달라질 수 있다. 경과시간은 `Instant`로 계산하는 것이 안전하다.

5. `latestQueueBySignal` SQL 비용과 정확성 — 보완

최근 1일 파티션 제한은 긍정적이나 현재 구현은 수집기마다 두 쿼리를 실행하는 N+1 구조다. 수집기 수가 늘면 `list()` 호출당 `2N` 쿼리가 된다. 관련 복합 인덱스와 `EXPLAIN (ANALYZE, BUFFERS)` 근거가 없으므로 비용이 허용 범위라고 확정하기 어렵다.

정확성 결함도 있다.

- 첫 `max(bucket_start)` 쿼리는 live exporter를 제외하지 않는다.
- 두 번째 쿼리만 live exporter를 제외한다.
- 따라서 가장 최신 칸에 live exporter만 있고 저장 exporter의 최신 칸이 그보다 이전이면, 최신 시각은 잡히지만 결과 행은 빈 배열이 된다.

첫 쿼리에도 동일한 `coalesce(exporter) NOT IN (...)` 조건을 적용하거나, CTE/`DISTINCT ON`으로 저장 exporter의 최신 칸을 한 번에 구해야 한다. `data_type`이 없는 옛 행을 `""`로 반환하고 FE에서 `?`로 표시하는 것은 호환상 허용 가능하다.

6. 상태 서비스의 `enqueueFailed` live 제외 — 보완

`enqueueFailed`에서 live exporter를 제외한 것은 맞다. 하지만 일관성 문제는 실제로 존재한다.

- `ApmCollectorStateService`: `sendFailedTotal`은 live 포함, `enqueueFailedTotal`은 live 제외
- `ApmCollectorMetricStore.series()`: 둘 다 live 제외
- `ApmAlertEvaluator.collectorFailureSeries()`: 둘 다 live 제외

따라서 상태 행의 “전송 실패” 누계와 차트·알림 값의 의미가 다르다. 기존 동작 유지라는 이유는 이해되지만, 같은 화면에서 나란히 노출하면 운영자가 비교할 수 없다. `sendFailedTotal`도 저장 exporter로 통일하거나, 최소한 UI/API 명칭에 포함 범위를 명시해야 한다.

`queueSize` 누계도 상태 서비스에서는 live를 포함하지만 `queueBySignal`은 live를 제외하므로 같은 큐 열의 위·아래 숫자가 서로 다른 범위다.

7. FE `queueBySignal` 렌더 — 보완

두 번째 줄 배치는 정보 밀도 면에서는 적절하다. 다만 현재 `width: 150`에서 신호 3개의 `size/capacity` 문자열은 여러 줄로 감길 가능성이 커 “두 번째 줄”에 머물지 않는다.

또한 표본 시각을 native `title`에 상대시간만 넣어 다음 문제가 있다.

- 키보드·모바일·스크린리더 접근성이 약하다.
- 정확한 시각을 확인할 수 없다.
- 오래된 표본인지 화면에서 즉시 구분되지 않는다.

Ant Design `Tooltip` 또는 접근 가능한 별도 텍스트로 “상대시간 + ISO 시각”을 제공하고, 60초 초과 표본은 경고 표시하는 편이 좋다. `aria-label`도 함께 두는 것이 바람직하다.

8. 템플릿 헤더 자리표시 설명 — 맞다

새 `${QUEUE_SIZE}`와 `${RETRY_MAX_ELAPSED}`는 생성기에서 치환되고, 설정 줄의 실제 값도 외부 `otelcol validate` 9조합으로 검증됐다. 주석 속 자리표시는 YAML 실행 의미가 없으므로 `verifyNoUnexpectedPlaceholder`가 설정 줄만 검사하는 정책과 충돌하지 않는다.

다만 `.replace(...)`가 템플릿 전체에 적용되어 헤더 주석의 자리표시도 실제 값으로 바뀐다는 점은 알고 있어야 한다. 현재 기능상 문제는 아니다.

9. 선재 `ApmMetric1mStoreIT` 실패 — 보완

이번 diff가 해당 recorder/store를 변경하지 않았다는 점에서는 ZM-122 원인일 가능성이 낮다. 그러나 “09-15에도 있었다”는 기록만으로 회귀가 아님을 확정할 수는 없다.

커밋 전 최소한 다음 중 하나는 남겨야 한다.

- 동일 커밋·동일 DB 조건에서 master 재현 로그
- 기존 이슈 번호와 격리 사유
- flaky 테스트로 공식 분리한 근거

현재처럼 전체 결과가 962 통과/1 실패인 상태는 조건부 통과로 기록할 수 있지만, 깨끗한 CI 통과로 표현하면 안 된다.

## §2 결함

### 🔴 데이터 손실·회귀·보안

1. 스케줄러 운영 경로에서 `@Transactional`이 사라졌다

`ApmAlertEvaluationService`에서 기존 `evaluateAll(LocalDateTime)`에만 `@Transactional`이 남아 있고, 새 `evaluateAll(LocalDateTime, int)`에는 없다. 그런데 `ApmAlertEvaluationJob.run()`은 새 2인자 메서드를 직접 호출한다.

Spring proxy 관점에서 스케줄러 호출은 트랜잭션 없이 실행된다. 그 결과 프로비저닝·push 상태·orphan sweep·backfill 중간 실패 시 부분 반영될 수 있으며, 기존 원자성을 깨는 명백한 회귀다.

필수 수정: 2인자 운영 메서드에도 `@Transactional`을 적용하고, 스케줄러 호출에서 실제 트랜잭션이 활성화되는 테스트를 추가해야 한다.

2. 무인증 slow-body 요청으로 admission 전체를 점유할 수 있다

`ApmOtlpController.receive()` 순서는 admission → 본문 전체 읽기 → 인증이다. 공격자가 Content-Length 없이 또는 제한 이하 길이로 본문을 천천히 전송하면 인증되지 않은 요청 6개만으로 모든 permit을 붙잡을 수 있다.

정상 Collector는 계속 429를 받고, 공격이 재시도 예산보다 길면 실제 텔레메트리 유실로 이어질 수 있다. “무인증 요청은 즉시 401”이라는 설계 전제가 틀렸다.

필수 수정: admission 획득 후 토큰·라이선스를 본문보다 먼저 검증하되, 모든 경로는 같은 `finally`에서 permit을 반환해야 한다.

### 🟡 보완

1. SSE 등록은 직렬화됐지만 등록 직후 전송과 ticker는 종료와 직렬화되지 않았다

`EventStreamHub.subscribe()`와 `ApmLiveStreamController.stream()`은 map 등록 후 lock을 놓고 초기 event/snapshot을 보낸다. 그 사이 `closeForShutdown()`이 emitter를 완료하면 완료된 emitter에 `send()`가 실행될 수 있다.

또한 두 클래스의 ticker 경로에는 `closing` 가드가 추가되지 않았다. 설계 §0.1의 “ticker·deadline 경로는 closing 후 제출 금지”와 어긋난다. `ConcurrentHashMap`의 weakly consistent 순회가 clear 이전 항목을 계속 볼 가능성도 있다.

늦은 구독 분기에서는 `emitter.complete()`를 lifecycle lock 안에서 부른다. 현재 callback은 `ConcurrentHashMap.remove()`뿐이고 Java monitor는 재진입 가능하므로 당장 데드락이 발생하지는 않지만, 코드 주석의 “complete는 lock 밖” 원칙과 모순된다.

`LiveSpanStreamService`의 같은-monitor `stopped` 검사와 `pump()` 가드는 적절하지만 이를 고정하는 신규 테스트가 없다.

2. `SchedulerManager` 종료 차단에 check-then-run 경쟁이 남는다

`execute()` 시작에서만 volatile `closing`을 확인한다. 확인 직후 `ContextClosedEvent`가 발생하고 실제 `job.run()`이 그 뒤 시작되는 창이 있다. 적어도 lease 획득 후 실행 직전에 재확인하거나 종료 상태와 job 시작을 직렬화해야 한다.

3. STALE 경과시간 계산이 DST에 안전하지 않다

`Instant bootAt`을 시스템 zone의 `LocalDateTime`으로 변환한 뒤 벽시계 기준 `Duration`을 계산한다. 봄철 DST 전환에서는 실제 10분이 70분으로 계산되어 유예가 일찍 끝날 수 있고, 가을 전환에서는 유예가 과도하게 늘어날 수 있다.

`< threshold + intervalMin` 경계 자체는 설계와 일치한다. 다만 정확히 같은 경계값에서 `<`와 `<=` 변이를 구분하는 테스트가 없다.

4. `intervalMinutes()`의 실제 스케줄 계약이 테스트되지 않았다

초 단위 올림, 분 단위 값, null/0 폴백은 코드상 합리적이다. 그러나 `ApmAlertJobTest`는 `anyInt()`만 사용해 실제 전달값을 검증하지 않는다. 초 단위 61초→2분, 분 단위, 비정상 값 폴백을 각각 고정해야 한다.

5. `latestQueueBySignal()`은 live-only 최신 칸에서 빈 결과를 반환한다

앞서 설명한 첫·둘째 쿼리의 exporter 조건 불일치다. 운영자가 빈 신호별 큐를 “큐 없음/0”으로 오해할 수 있으므로 수정이 필요하다.

또한 최신 1분 칸에서 `max(m.max)`를 사용하므로 엄밀한 현재값이 아니라 “최신 칸 내부 최대값”이다. 큐 0 판정에는 보수적으로 작동하지만 API 설명의 “현재 큐”와는 다르다.

6. 상태 행과 차트·알림의 exporter 범위가 다르다

`sendFailedTotal`과 `queueSize`는 상태 행에서 live를 포함하지만 새 시계열·신호별 큐·알림은 live를 제외한다. API 계약이나 명칭을 통일해야 한다.

7. 신호별 큐 조회가 `2N` 쿼리다

수집기 행마다 `max(bucket_start)`와 집계를 각각 실행한다. 설치형이라도 수집기 수가 늘면 상태 탭 갱신 주기마다 반복된다. 단일 CTE/윈도 함수 쿼리 또는 수집기 전체 batch 조회를 권장한다. 최소한 파티션별 복합 인덱스와 실행계획 검증이 필요하다.

8. FE의 구 BE 호환은 응답 쪽만 충분히 방어됐다

`enqueueFailedTotal`, `queueBySignal`, `queueSampledAt`, `enqueueFailed`를 optional로 두고 `?? null`로 차트에 전달한 것은 맞다.

반면 새 FE는 defaults sync로 `queueSize`와 `retryMaxElapsedMin`을 채워 구 BE 요청에도 전송한다. TypeScript optional은 구 BE가 unknown JSON field를 허용한다는 보장이 아니다. 구 BE ObjectMapper 설정을 고정하는 계약 테스트가 필요하다.

9. 서비스 관리자 종료 timeout 안내가 설계대로 완료되지 않았다

실측상 graceful 단계는 4.25초지만 전체 프로세스 종료는 약 25초다. 인계서도 안내서 §7.9 미반영을 인정한다. systemd·Windows Service·Docker timeout이 짧으면 정상 종료 정책이 무효화되고 강제 종료될 수 있다.

10. 디스크 용량 안내가 compaction 여유를 충분히 드러내지 않는다

FE 도움말은 약 240KB×queue size만 안내한다. 설계 결정에는 bbolt 오버헤드와 compaction 중 유입·큐 파일 2배 여유가 포함돼 있다. 최대값 200,000은 세 신호 합과 compaction 여유까지 고려하면 매우 큰 디스크를 요구하므로 운영 문서에서 최악치를 명시해야 한다.

### 🟢 참고·정상 확인

- `collectorFailureSeries`의 `(send_failed OR enqueue_failed)` 괄호, 시간 범위 `[from,to)`, `coalesce(exporter,'')`는 올바르다.
- 다만 현재 IT는 잘못된 service/time 범위의 enqueue 행과 exporter 없는 행을 넣지 않아 괄호·`coalesce` 변이를 충분히 잡지 못한다.
- `ApmCollectorConfigOptionsDto`의 정식 생성자, `ReqDto.options()`, `ConfigService` 복사, `EMPTY`, 테스트 호출처는 첨부 diff 범위에서 모두 새 필드를 전달한다.
- 템플릿의 기본값·사용자값·범위 검증과 Collector 0.159 validate 결과는 강한 검증이다.
- FE의 신규 응답 필드 optional 처리와 `point[key] ?? null`은 구 응답 호환에 적절하다.
- kr/en 신규 locale 키는 서로 대응하며 첨부 JSON 문법도 유효하다.
- 신규 테스트는 정상 시나리오를 폭넓게 다루지만 다음 변이는 놓친다: SSE 실제 동시 경쟁, late emitter 완료 여부, 429 본문 미읽기, 401·파싱 예외 permit 반환, STALE 정확 경계, interval 계산, SQL 괄호·coalesce, live-only 최신 큐, DTO 복사 경로 필드 누락, 구 BE 요청 호환, 상태 탭 접근성.

## §3 설계 대조

| 설계 항목 | 구현 상태 | 어긋남 |
|---|---|---|
| S1 등록·종료 lock 직렬화 | 부분 일치 | map 등록과 closing 설정은 직렬화됐으나 초기 send/snapshot과 ticker가 closing과 직렬화되지 않았다. late emitter의 `complete()`도 lock 안에서 실행된다. |
| S2 종료 후 새 배치 차단 | 부분 일치 | `SchedulerManager.execute()` 첫머리 가드는 있으나 check 이후 실제 `job.run()` 전 종료가 끼어드는 경쟁이 남는다. |
| 기존 알림 평가 트랜잭션 유지 | 불일치 | 새 스케줄러 경로가 호출하는 2인자 `evaluateAll()`에 `@Transactional`이 없다. |
| S3 shutdown timeout 20초 | 일치 | 회복 p99 8.5초×2보다 20초가 크다. 다만 `application.yml` 주석은 정상 p99 3.6초만 기록했다. |
| S4 415→413→admission→본문→인증 | 순서 일치, 안전 전제 불일치 | 설계 순서는 구현됐지만 무인증 slow-body가 permit을 오래 잡을 수 있어 “즉시 401” 전제가 성립하지 않는다. 설계 결정 자체의 수정이 필요하다. |
| S4 permit 단일 반환 | 대체로 일치 | `try/finally`는 맞지만 획득한 Semaphore와 반환할 Semaphore를 지역 변수로 동일하게 고정하지 않았다. |
| S6 저장 exporter의 최신 신호별 큐 | 부분 불일치 | 최신 시각을 찾는 첫 쿼리에 live 제외 조건이 없어 live-only 최신 칸에서 빈 결과가 된다. UI도 표본 시각을 hover title로만 제공한다. |
| S7 `threshold + interval`, `<` 경계 | 일치 | 공식과 경계는 맞다. 다만 DST-safe elapsed time과 정확 경계 테스트가 없다. |
| 수집기 실패 SQL 괄호·coalesce·live 제외 | 일치 | alert SQL은 요구대로 구현됐다. 상태 행의 기존 `sendFailedTotal`은 live 포함이라 화면 계약은 불일치한다. |
| 기본 queue 10,000·retry 30m·범위·num_consumers 10 | 일치 | 생성기·DTO·FE·템플릿·외부 validate가 대응한다. |
| 서비스 관리자 timeout 안내 | 불일치 | 인계서가 §7.9 미반영을 명시한다. 실측 전체 종료 약 25초를 운영 timeout에 반영해야 한다. |
| 양방향 구버전 호환 | 부분 일치 | 구 응답을 받는 새 FE는 안전하다. 새 FE 요청을 받는 구 BE는 unknown field 허용 여부가 런타임으로 검증되지 않았다. |

## §4 판정

**필수 수정 5건 후 커밋**

필수 항목은 다음과 같다.

1. `ApmAlertEvaluationService.evaluateAll(now, intervalMin)`의 트랜잭션 회귀 수정 및 운영 호출 테스트
2. admission 획득 후 본문보다 먼저 인증해 무인증 slow-body permit 고갈 차단
3. SSE 초기 send/ticker 및 Scheduler 실제 실행 직전의 shutdown 경쟁 제거
4. `latestQueueBySignal()`의 live 제외 조건 불일치 수정
5. systemd·Windows Service·Docker 종료 timeout 운영 안내 완성

그 외 DST-safe 시간 계산, 상태 행과 시계열의 live exporter 의미 통일, N+1 SQL, FE 접근성·구 BE 계약 테스트도 가능하면 같은 수정 라운드에서 처리하는 것이 좋다.

커밋은 **BE 1개 + FE 1개 분할이 적절하다.**

- BE 커밋: V68, 도메인·DTO·SQL·admission·shutdown·STALE·템플릿·테스트·운영 안내를 하나의 원자적 변경으로 포함
- FE 커밋: optional 타입, defaults, 발급 폼, 상태/차트, locale, 테스트
- 순서는 BE 먼저가 안전하다. 새 BE→구 FE는 추가 JSON 필드라 비교적 안전하지만, 새 FE→구 BE는 신규 요청 필드 허용 여부가 아직 런타임으로 검증되지 않았다.
