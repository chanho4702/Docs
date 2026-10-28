# APM 도메인 코드 개선 백로그 (2026-09-29)

방금 `ApmMetric1mStore` 동시 배치 UPSERT 데드락(#ZM-122 `ad57ea5`)을 고친 뒤, premium/apm 전 도메인을 3분할 병렬 리뷰(적재·배치 동시성 / 조회·읽기 성능 / 트레이스·알람·RUM)해서 나온 개선점. 심각도·성격별 정렬. **아직 미구현 — 분석만.**

> 전제: 설치형 1벌 배포(HA 아님), 대용량 = 호스트 5천·아이템 1천만·서비스 수백·K8s 파드 churn.

---

> **✅ 완료(2026-09-30)**: A1·A2 **커밋 `5b6d5a0`**(#ZM-122 master, 미푸시). RumStore phase 분리+테이블별 PK 정렬+receipt gating+error 샘플 OBS_ORDER 보존+span start_ts, ApmCollectorLogStore 정렬. 코덱스 **조건부 승인 3건 전부 반영**(span start_ts·error 샘플 보존·결정적 검증). 단위 7건(RumStoreTest 6+CollectorLogStoreTest 1)+RumSchemaIT 9건(동시성 포함) 통과. 인계서 `_workspace/features/apm/deadlock-fixes/review_apm-rum-collectorlog-deadlock.md`. ⚠️코덱스 검수 전문은 메모리 문제로 미캡처(조건만 확보).
>
> **남은 것**: B2+B3+B1(알람 걸림 재설계)·C1/C2(조회 성능)·나머지 — 위 착수 순서 참조.

## A. 데드락 형제 (방금 고친 것과 같은 클래스 — 최우선)

### A1. 🟡→🔴(RUM은 무음 손실) `rum/ingest/RumStore.java` — timing·error 집계 행 미정렬 UPSERT
- **문제**: `store()`가 관측을 `(groupId,browser,os,country,time,receipt)`로 정렬하지만 그 키는 `apm_rum_page_5m`·`apm_rum_session_5m`만 덮는다. 실제로 여러 관측이 공유하는 집계 행은 정렬 밖:
  - `apm_rum_timing_5m` 키 `(group_id,bucket,kind,name)` — browser/os/country 없어 다른 page 키 관측끼리 같은 행 경합. `o.timings()`는 리스트 순서.
  - `apm_rum_js_error_group(group,fingerprint)`·`apm_rum_error_5m(group,fingerprint,bucket)` — `o.errors()`도 미정렬.
  - 파서 상한 관측 4096·관측당 128이라 트랜잭션이 길어 충돌 창이 큼.
- **영향**: 동시 요청이 같은 `group_id+bucket` timing 행을 역순 UPDATE → deadlock. `ApmRumIngestController`가 예외→**503**. 🔴정정(코덱스): 실제 전송은 `sendBeacon`이 아니라 `fetch(..., keepalive:true)`(rum-snippet.js:63)이고 **`response.ok`를 확인 안 해** 503도 성공처럼 종료·재전송 안 함 → **무음 데이터 손실 결론은 유지**(근거만 정정).
- **개선(코덱스 보강)**: timing/error만 정렬로는 **불완전**. ① receipt INSERT 성공한 관측만 후속 집계에 포함(gating 보존) ② page/session 전체 먼저 → timing → error를 **테이블별 phase로 분리**(관측별 교차 실행 제거) ③ error group 최초 `type/sample_stack` 규칙 보존 ④ **session PK(`session_hash`)도 정렬 대상**(현 comparator엔 없음). 데이터 의미는 안전(전부 `+=`/`least`/`greatest`). 실제 PostgreSQL 동시 통합 테스트 동반. **← 실질 최우선(P0).**

### A2. 🟡 `collector/state/ApmCollectorLogStore.java:75-89` — `@Transactional` 안 미정렬 다중 UPSERT
- **문제**: `record()`(@Transactional)가 `counts`(LinkedHashMap=페이로드 순서)를 forEach로 `apm_collector_log_1m` 키별 `ON CONFLICT DO UPDATE`. 자연키 `(token_id,instance_id,pipeline,component,bucket_start)` 중 pipeline·component만 갈려 동시 배치가 겹치는 행을 반대 순서로 잠금 → deadlock. 트랜잭션이라 잠금 보유가 단일 batchUpdate보다 김.
- **영향**: LOGS 경로 503 → 수집기 재시도(손실 아님, 스퓨리어스 503/재시도).
- **개선**: `counts`를 `TreeMap`으로 바꾸거나 엔트리를 키 5필드 전순서 정렬 후 iterate.

---

## B. 동시성/락 보유 (알람 평가)

### B1. 🟡 `alert/evaluate/ApmStuckRequestMonitor.java:120-236` — in-memory lock 안에서 Zabbix HTTP
- **문제**: `evaluate()` 전체가 `synchronized(lock)`이고 그 안에서 `ledger.fire/settle`이 Zabbix HTTP(ensureProvisioned·pushAll)를 낸다. 같은 락을 1초 감시기와 5분 배치(`currentValue()`)가 공유 → Zabbix 지연 시 1초 감시기 정지 + 5분 배치(@Transactional)가 **DB 커넥션 연 채** 블록.
- **개선**: 락 안에서는 부작용 수집만, Zabbix I/O는 락 놓고 실행. `currentValue()` 읽기 경로를 fire/settle 락과 분리.

### B2. 🟡 STUCK_REQUEST 이중 소유 (확인 필요) — `ApmStuckRequestMonitor` ↔ `ApmAlertEvaluationService.java:319-369`
- **문제**: 요청 걸림 이벤트를 1초 감시기(ledger fire/settle)와 5분 배치(findOpen→save)가 각자 연/닫는다. 공유 락도 (rule,service,open) 유니크 제약도 없어 동시 창에 이벤트 2행, 또는 배치가 닫았는데 감시기 `alarmed`가 true로 남아 저알람 발산 여지.
- **개선**: 소유를 감시기로 일원화하거나 `apm_alert_event`에 열린 상태 부분 유니크 인덱스. 최소한 배치 open/close를 감시기 캐시에 반영.

### B3. 🟢 `alert/evaluate/ApmAlertEvaluationService.java:262-390` — 단일 @Transactional에 Zabbix I/O 누적
- **문제**: `evaluateAll` 한 트랜잭션에 프로비저닝·pushAll·orphanSweeper·cleanupQueue·backfill까지 전부 Zabbix HTTP. 대상 증가 시 DB 커넥션 보유가 HTTP 총합만큼 길어짐(클래스 주석 §8.4가 인정한 자리에 더 얹힘).
- **개선**: 값 push·정리 큐를 트랜잭션 밖으로. 현재 5분 주기라 known-risk 유지 가능.

---

## C. 조회/읽기 성능 (대용량)

### C1. ✅ 완료(2026-09-30, 커밋 대기) `service/list/ApmServiceQueryService` (`liveInstances`) — `findAll()` 전량 로드 → `findLiveByServiceIdIn` 배치
- 리포지토리에 JPQL `findLiveByServiceIdIn(serviceIds, since)`(요청 서비스만 + `lastSeenAt is null or >= since`로 기존 JVM 필터 의미 보존) 추가, `liveInstances`가 그것만 조회. NOT NULL 컬럼이라 null 분기는 실데이터엔 없음(방어 보존). IT `ApmInstanceRepositoryIT`(경계·서비스 필터).

### C2. 🟡 `service/hostlink/ApmZabbixHostLinker.java:99-171` — 인스턴스마다 비-sargable ILIKE 자산 풀스캔
- **문제**: `resolve(hostNames)`가 이름마다 `assetService.getList`(내부 `ILIKE '%kw%'`) 개별 호출 → 이름당 자산 테이블(호스트 5천) 풀스캔. 캐시 미스 폭 큼.
- **개선**: 배치 정확일치(`WHERE lower(name) IN (...)`) 1질의. (자산 서비스 변경 필요.)

### C3. ✅ 완료(2026-09-30, 커밋 대기) `alert/query/ApmStuckRequestQueryService` — 행별 `findById` → `findAllById` 1회
- distinct serviceId 모아 `findAllById`. N+1 재발 방지 단위 테스트 `ApmStuckRequestQueryServiceTest`.

### C4. 🟢 `trace/query/ApmServiceRefLookup.java:44-67` — 조회마다 `apm_service` 전량 로드 (map은 1요청 2회)
- **개선**: 짧은 TTL(30초) 공용 캐시, 또는 최소한 `map()`에서 `byId()` 결과로 uid→id 역맵 만들어 중복 스캔 제거.

### C5. 🟢 `trace/query/ApmTraceQueryService.java:138-140` — `involved` 필터 `= any(service_ids)` 무인덱스 배열 스캔 (확인 필요)
- **개선**: `service_ids` GIN 인덱스(`&&`/`@>` 전환) 또는 involved 조회 창 상한. 문서화된 트레이드오프.

### C6. 🟢 `trace/errors/ApmErrorQueryService.java:134`·`trace/dbquery/ApmDbQueryService.java:111` — `count(*)` 상한 없음
- **개선**: 실측 병목이면 트레이스 목록의 capped-count 패턴 적용. 낮은 우선순위.

---

## D. 견고성/기타 (경미)

- ✅ **D1 완료(2026-09-30, 커밋 `92e6857`)** `boundsId()` 조회에 `family` 추가(V43 unique=(bounds,family) 다중행 방지) + 시드 부재 시 원인 명시 예외 + 기동 시 `verifyBoundsSeed`(ApplicationReadyEvent)로 ERROR 로그(부팅 차단 안 함). (bounds_id NOT NULL이라 "건수만 저장" 폴백은 스키마상 불가 → 코덱스 권고대로 검증 쪽으로.)
- **D2 🟢 `collector/ingest/ApmOtlpController.java:452-476`** — LOGS 경로만 영수증 dedup 없음 → 커밋 후 네트워크 단절 시 로그 카운터 중복 가산(덧셈 병합). 계약/주석 명시 또는 dedup 태우기. (주석이 "WARN 수는 손실 수 아님"으로 이미 부정확 용인.)
- **D3 🟢 `collector/ingest/drop/ApmIngestDropStatRecorder.java:180-215`** — flush 배치 미정렬 UPSERT. 현재 `synchronized`+단일 인스턴스라 무해. **HA 전환 시** 키 정렬 필요 — 주석만 남겨도 충분.
- **D4 🟢(확인 필요) `trace/ingest/ApmTraceSummaryStore.java:238-259`** — `merge`/`update`가 잠금 트랜잭션 안에서 `ensurePartition` 재호출. 보통 캐시 히트지만, 보존 배치가 그 파티션을 방금 DROP+캐시 제거한 직후 재생성 경로면 트랜잭션 안 `CREATE TABLE PARTITION OF`(부모 ACCESS EXCLUSIVE) → 스팬 수신 정지. 매우 드묾(7일 지난 날짜로 지연 도착). 재생성 파티션 보장을 writer의 트랜잭션 밖 단계로.

---

## 안전 확인 (형제 패턴이지만 문제 없음 — 재조사 불필요)

- **롤업·보존·파티션유지·트레이스/messaging/job 롤업**: 전부 `SchedulerManager`+`scheduler_lease`(job_key별) 단일 인스턴스 직렬 → 배치 간 동시 데드락 구조적 부재.
- **`ApmTraceWriter`·`ApmSpanStore`·`ApmTraceSummaryStore`**: trace_id 단위 `pg_advisory_xact_lock` 하나로 감싸 동일 행 경합·이중 요약행 차단(merge 운영 호출자 writer 1곳 확인). 적재 실패는 던져 503→재전송, dedup 멱등.
- **`ApmMetric1mStore.nullifyConflicted`**: 정렬된 batch에서 파생 → UPSERT와 같은 잠금 순서(방금 수정이 이 두 번째 문장까지 덮음).
- **admission 세마포어**: permit 누수 없음(tryAcquire 실패=미획득, 성공=finally 반납), backpressure=429(재시도)라 손실 아님, durable 큐 없음.
- **조회 경로 전반**: 목록·개요는 `IN` 배치 6질의로 N+1 차단, 트레이스/맵은 LIMIT·CAP·MAX_EDGES 상한, 정렬키·테이블명 화이트리스트라 **SQL 인젝션 없음**, null vs 0 분리·캐시 권한 축·시간대(LocalDateTime 격자)·200+code 계약 전부 견고.
- **alert/sync**: 전량 삭제-재삽입 없음(drift 배지·사라진 트리거 재생성만). cleanup RESOLVE 취소 누락은 orphan sweeper `cancelResolve`로 방어.

---

## 권장 착수 순서 (코덱스 반영 최종)

1. **A1 RumStore** — 위 4조건(gating·phase 분리·type 보존·session 정렬) + PostgreSQL 동시 IT
2. **B2 + B3 + B1** — STUCK_REQUEST 단일 소유권 + 외부 I/O/DB 트랜잭션 분리를 **한 재설계로** (B1 단독 분리 시 tick 중복 발화 위험이라 묶어야 함)
3. **C1, C2** — 현 규모에서 즉시 반복 비용
4. **C5** — 운영 `EXPLAIN (ANALYZE, BUFFERS)` 후 GIN 결정
5. **A2** — 작은 예방 패치로 A1과 묶을 때 함께 hardening
6. C3, C4, C6, D1, HA 대비 D3

---

## 코덱스 검수 2차 — RUM 예산환급·bounds family·stuck N+1·C1 (gpt-5.6-sol high, 2026-10-01)

4개 커밋(`85d9e9d`·`92e6857`·`c1d14fb`·`79becc0`) 검수 → **조건부 승인, 🔴 0**(핵심 로직 전부 정확). 보강은 전부 테스트+주석, **커밋 `d2b42c8`로 반영 완료**:
- [x] 🟡 bounds family 회귀 테스트(쿼리에 family 인자)·시드 0건 명시 예외·`verifyBoundsSeed` 부팅 비차단 → `RumStoreTest` 3건 추가(IT가 아니라 단위로 — heap 순서상 IT는 구버전도 통과할 수 있어 결정적 가드는 단위).
- [x] 🟡 클라이언트 실패(400·429) 무환급 `never().refund` → `ApmRumIngestMvcTest.clientFailuresNeverRefundBudget`.
- [x] 🟢 stuck 테스트 검출력(distinct 집합 캡처·누락 서비스 null) → `ApmStuckRequestQueryServiceTest` 보강.
- [x] 🟢 `ApmServiceQueryService` 상단 "전량 조회" 오래된 주석 정정.
- 코덱스 확인(문제없음): 환급 서버잘못 한정·synchronized 정합·charged 추적·drop stat count·JPQL 경계(`>=`)/null/서비스필터/빈가드/중복 모두 정확.
- ⚠️ 포그라운드로 실행(백그라운드는 시스템 메모리 부족으로 3회 강제 종료됨).

## 코덱스 검수 (gpt-5.6-sol high, 2026-09-29)

전건 코드 대조. 방향 대체로 동의, 아래 수정.

**A1 [동의·P0, 지금 수정 찬성(조건부)]**: deadlock 실재 확인. 단 근거 정정(sendBeacon→fetch keepalive, 위 반영) + 수정 범위 4조건(위 반영). "timing/error만 정렬"로 좁히면 불완전.
**A2 [이견 → LOW 예방]**: 패턴은 실재하나 정상 구성은 self-log exporter `num_consumers:1`·`retry_on_failure:false`·PK에 `instance_id` 포함이라 동일 PK 동시 충돌이 매우 약함. P0 아님. 정렬은 싸고 안전하니 **A1과 묶어 예방적 hardening**. (또한 "503→수집기 재시도"는 이 경로엔 틀림 — 재시도 꺼져 있어 발생 시 health 카운터 유실.)
**B1 [동의 MEDIUM]** / **B2 [동의 HIGH]** / **B3 [동의 HIGH]**: 셋을 "DB 판정 트랜잭션 → 외부 push → 결과 기록 트랜잭션" 단일 재설계로. B1만 떼면 tick 중복 발화.
**C1 [동의 MEDIUM]**(단 단일 서비스 detail은 이미 `findByServiceIdAndLastSeenAtAfter` 사용) / **C2 [동의 MEDIUM]** / **C3 [동의 LOW]** / **C4 [이견]**(TTL 캐시보다 요청별 단일 snapshot API 먼저) / **C5 [조건부]**(파티션 pruning 있으니 EXPLAIN 먼저) / **C6 [동의 LOW]**.
**D1 [이견]**: `bounds_id` NOT NULL이라 "건수만 저장" 폴백은 스키마와 안 맞음 → **기동 시 시드 검증 fail-fast**가 맞음. + 더 직접적 잠재결함: bounds 조회가 `family`를 조건에 안 넣음(V43 unique가 `(bounds,family)`라 향후 같은 배열 다른 family면 단일 조회가 깨질 수 있음).
**D2 [이견 LOW]** / **D3 [동의, 조치 불필요]** / **D4 [오탐에 가까움]**(트랜잭션 안 ensurePartition은 UPDATE 0행 뒤 retention 경합 복구 fallback, writer가 이미 밖에서 확보).

**코덱스가 추가로 잡은 것:**
- ✅ **[추가 HIGH] 완료(2026-09-30, 커밋 `85d9e9d`)** RUM 일 예산이 저장 실패에도 소비됨 → `RumRateLimiter.refund()` + 컨트롤러 `catch(Exception)`에서 서버 잘못(503)만 환급 + `RUM_UNAVAILABLE` drop stat 기록. 클라이언트 잘못은 유지. 테스트: RumSecurityTest·ApmRumIngestMvcTest.
- **[추가 MEDIUM] A1 수정 범위에 session 전순서 포함**(위 ④로 반영).

**최종 의견**: A1 지금 수정 **찬성**(4조건 필수), A2 **조건부 찬성**(A1과 묶어 hardening). 우선순위 실질은 A1.
