# APM 순위 11 — 알람 상태 저장·전송 원자성 설계안 (2026-10-08) — **1차 구현 완료, 코덱스 검수 중**(브랜치 `apm-alert-atomicity`, `features/apm/alerts/review_apm-alert-atomicity-20261008.md`)

근거: 코덱스 착수 전 의견 `_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md` §4(설계 순서 ①~⑨), 코드 지도(Explore 2026-10-08, 아래 요약), 백로그 APC-01·APC-05·APC-25(`moveseye-docs/guides/features/APM-수집과-운영.md` 4절). 기준 BE master `1c094a1`.

## 1. 현재 구조 (코드 지도 요약)

- `apm_alert_event`(V38:388-402): `service_id` nullable, `resolved_at` NULL=열림, 인덱스는 `(service_id, fired_at)` 하나, **UNIQUE 없음**. 최신 Flyway V70 → 신규 **V74**.
- 5분 `ApmAlertEvaluationService.evaluateAll()`(:281) — **한 @Transactional** 안에서 Zabbix 재시도·provisioning·값 측정·"조회 후 INSERT"(:367-377)·해소·고아 정리·`pushAll`·event backfill·cleanup retry 전부. STUCK_REQUEST도 똑같이 열고 닫고 push(:331-333 의도).
- 1초 `ApmStuckRequestMonitor.evaluate()` — **`synchronized(lock)` 전체**(:120-235) 안에서 DB(hydrate·targets·open/close·hasOpenEvent)와 **Zabbix**(`ledger.fire/settle` → provisioning·push). `currentValue()`도 같은 lock → 5분 evaluator가 이 lock을 기다린다.
- APC-25: 대상 제거 시 `open`·`alarmed`만 지우고 `observedAt`은 안 지움(:150-151) → 90초 동안 `currentValue=0`. 열린 행이 없던 서비스는 분기 자체를 안 타 `observedAt` 영구 잔류.
- 외부 배달은 **Zabbix Problem 하나**(메일·Slack은 Zabbix 미디어). push 실패 재시도 큐 없음(5분 evaluator의 재push로 자연 복구). 정리 큐 `apm_zbx_cleanup`(V53)이 outbox 선례.
- 동시성 테스트 0건(선례: `SchedulerLeaseServiceIT`·`ApmMetricIngestAtomicityIT`의 CountDownLatch).

## 2. 🔴 UNIQUE만 먼저 넣으면 생기는 교착 (코드 지도 §3-4)

1. evaluator가 긴 트랜잭션 안에서 서비스 A의 STUCK 이벤트를 INSERT(미커밋) → 2. 루프를 돌아 서비스 B의 `currentValue()`에서 monitor `lock` 대기 → 3. monitor는 `lock`을 쥔 채 `ledger.fire(A)`의 INSERT가 **UNIQUE 충돌 대기**(evaluator 커밋까지). JVM 잠금 ↔ PG 행 잠금 교차라 PG 교착 감지가 못 잡는다 → 1초 감시기 정지.
→ **①②③(UNIQUE·ON CONFLICT)과 ④(STUCK 전이 소유자 단일화)는 같은 커밋**이어야 한다.

## 3. 범위 제안

### 1차(권장) — ①②③ + ④ + ⑨ (+ ⑧ 부분)
| # | 내용 | 파일 |
|---|---|---|
| ① | V74: `(rule_id, COALESCE(service_id,0))`별 열린 행 중 **최신 1건**만 남기고 나머지 `resolved_at=now()`(`findOpen`이 최신순 → 최신이 정본) | 신규 `V74__apm_alert_event_open_unique.sql` |
| ② | `CREATE UNIQUE INDEX apm_alert_event_open_uq ON apm_alert_event (rule_id, (COALESCE(service_id,0))) WHERE resolved_at IS NULL` | 같은 V74 |
| ③ | 열기 경로 2곳을 JdbcTemplate `INSERT … ON CONFLICT (rule_id, (COALESCE(service_id,0))) WHERE resolved_at IS NULL DO NOTHING RETURNING id`로 — 삽입 행 수로 "새로 열렸나" 판정(JPA save+예외 의존 금지). 전용 `ApmAlertEventStore`(`ApmArchiveHoldStore` 패턴) | 신규 store, `ApmAlertEvaluationService:367-377`, `ApmStuckRequestLedger.fire:114-122` |
| ④ | STUCK_REQUEST 이벤트 **전이 소유자 = 1초 monitor**. evaluator는 STUCK에 대해 `liveKeys`·`ensureProvisioned`·값 push만 하고 open/resolve는 건너뜀(고아 정리·바인딩 유지 제약 :333 존중). ⚠️ evaluator의 STUCK push는 남긴다 — ledger push 실패의 유일한 복구 경로 | `ApmAlertEvaluationService:331-388` |
| ⑨ | 대상 제거 시 `observedAt.remove` + `targets`에서 빠진 모든 서비스의 `observedAt` 정리(`open`에 없던 서비스 포함) | `ApmStuckRequestMonitor:138-153` |
| ⑧′ | (부분) evaluator가 쓰는 `currentValue()`/`openCount()`는 lock 안 **메모리 읽기만**이라 그대로. monitor의 ledger I/O를 lock 밖으로 빼는 ⑧ 전체는 2차 | — |
| 테스트 | 실 PG 동시성 IT: evaluator INSERT 트랜잭션 보류 중 ledger.fire 동시 → 열린 행 1건·교착 없음(타임아웃 가드) · V74 정리 IT(중복 3건→1건) · `ApmStuckRequestMonitorTest` observedAt · `ApmAlertEvaluationIT` STUCK은 evaluator가 열지 않음 | |

효과: APC-01(중복 열림) 해소, §3-3 "잘못된 해소"(evaluator가 monitor가 막 연 이벤트를 닫음) 해소, APC-25 해소. **남는 것**: APC-05(판정 트랜잭션 안 Zabbix I/O), 전송 후 crash 멱등.

### 2차 — ⑤⑥⑦⑧ (outbox)
`apm_alert_delivery` outbox(idempotency key `(rule, service, transition, version)`, attempts·next_attempt_at·status — `apm_zbx_cleanup` 구조 복제), 판정·전이+intent 짧은 트랜잭션 → 커밋 뒤 worker가 Zabbix provisioning/push, monitor `synchronized` 안은 command 계산만. 새 위험: "커밋 후 push 전 crash"(outbox가 보완), monitor `alarmed` 메모리↔DB 불일치 보정 규칙, push 실패 복구 경로 재설계, `evaluateAll` 트랜잭션 분할로 IT 검증 순서 변경. 완료 조건에 provider 지연 주입 측정(APC-05).

## 4. 결정 필요
1. 1차 범위를 ①②③④⑨로 갈지, 처음부터 2차(outbox)까지 갈지. 권장 **1차 먼저**(교착·중복·오해소가 실제 결함, outbox는 crash 창 재설계라 별도 검수 단위).
2. ④에서 evaluator의 STUCK 값 push 유지 여부 — 권장 **유지**(ledger push 실패의 복구 경로).
3. V74 정리 규칙 "최신 1건 정본" — 대안 "가장 오래된 1건"(최초 발화 시각 보존). `findOpen` 최신순과 일관되는 최신 권장. 단 `fired_at`이 사고 시작을 뜻하므로 **가장 오래된 행의 fired_at을 최신 행에 복사**하는 절충 검토.

## 5. 코덱스 의견 (2026-10-08, 전문 `_archive/features/apm/alerts/review_apm-alert-atomicity-design-20261008_codex.md`)

§2 교착 **성립 확인**(PG는 JVM 대기를 못 봄). 단 ④만으로는 부족 — `ensureProvisioned`의 **바인딩 행 잠금**으로 같은 역순 교착이 재현된다(evaluator가 바인딩 행을 잠근 채 `currentValue()` 대기 ↔ monitor가 lock 쥔 채 `fire()`의 provisioning에서 바인딩 행 대기). 설계안 ⑧′("메모리 읽기라 그대로")는 틀렸다.

### 수정된 1차 범위 — ①②③④⑨ + ⑧a + ⑩
- **⑧a lock-free 스냅샷**: monitor가 tick 완료 시 immutable map(`AtomicReference`/volatile)을 공개, `currentValue()`/`openCount()`는 `synchronized`에 들어가지 않고 직전 tick 스냅샷만 읽는다. 시작 직후 스냅샷 없으면 empty(0 날조 금지). target 제거 시 스냅샷에서도 제거.
- **⑩ `alarmed` 재조정**: `Map<Long,Boolean>` → `Map<Long, AlarmState(ruleId, open)>`. 10초 target refresh **뒤** tracked 서비스만 `hasOpenEvent(currentRule, service)`로 재조정, ruleId 바뀌면 기존 tracked row `RULE_OFF`로 닫고 새 규칙으로 재평가. (evaluator의 전이 보정을 빼면 규칙 off→on·A→B 교체·고아 해소 뒤 영구 미발화가 새로 드러난다.)
- **④ 문구 한정**: STUCK의 *측정값 기반* open/정상 resolve 소유자 = monitor. 규칙 off/delete·고아 해소의 관리적 resolve는 기존 경로 유지. evaluator는 STUCK에 대해 `targetsOf`·`liveKeys`·`ensureProvisioned`·(스냅샷 값 있으면) push까지 하고 open/resolve 블록만 건너뜀. **push 유지 필수**(ledger push 실패의 유일한 내구 재시도).
- **⑨**: `targets ∪ open` 순회 밖의 서비스도 `observedAt.keySet().removeIf(!targets.containsKey)`.
- **monitor health**: `lastSuccessfulTick` 경고(evaluator fallback이 사라지므로).
- **V74**: 정본은 **최초 행**(`fired_at ASC, id ASC` — fired_at/value는 "처음 터진 시각·값"), 정본 `zbx_eventid` null이면 loser에서 보강. "최신 행+fired_at 복사" 절충은 value 왜곡이라 폐기. loser 처리는 결정 필요 — (a) DELETE(지표 정확: `resolved_at=now()`는 가짜 MTTR·발화 수 중복, `ApmAlertQueryStore:79,124`) (b) `resolved_at=fired_at`(감사 보존, 발화 수 중복 수용) (c) `deduplicated_into` 열 추가. 현 스키마에선 (a)가 정직, 이벤트 id 장기 외부 참조가 있으면 (c).
- **인덱스**: PG 15면 `UNIQUE (rule_id, service_id) NULLS NOT DISTINCT WHERE resolved_at IS NULL` + `ON CONFLICT (rule_id, service_id) WHERE resolved_at IS NULL DO NOTHING RETURNING id`. 15 미만 호환이면 V41처럼 서비스/수집기 인덱스 2개. `COALESCE(…,0)`는 service_id=0을 NULL과 같은 키로 보는 틈.
- **JdbcTemplate INSERT ↔ JPQL**: 같은 트랜잭션이면 보임(`ZabbixSyncServiceImpl:79` 선례). store는 `REQUIRED`(REQUIRES_NEW 금지), `DO NOTHING RETURNING`은 0행이라 `queryForObject` 금지(`query(...).stream().findFirst()`), "JPA resolve 미flush → JDBC open" 순서는 DO NOTHING 함정 → open/resolve를 store로 통일하거나 flush. rollback IT로 JDBC INSERT가 같은 트랜잭션임을 고정.
- **필수 회귀 14종**(전문 §5): V74 마이그레이션(서비스 키·NULL 키 중복 3건·동률·닫힌 행), ON CONFLICT 문법 실행, latch 동시 open(열린 행 1건), winner 보류→commit/rollback, 바인딩 행 잠금 중 `currentValue()`(⑧a), 스냅샷 timeout, evaluator STUCK 양수/0/empty(열지 않음·push 유지·liveKeys), 0→N→N→0 정확히 1 open/1 resolve, 규칙 A→B 교체, off→on·고아 해소 뒤 재발화, APC-25 재추가, JDBC open→JPQL→JPA resolve, JDBC open 뒤 rollback, push 성공 뒤 rollback/push 실패 뒤 commit(outbox 전 crash-gap 명시). 출시 게이트에선 PG를 띄워 **skip 불가**.
- **2차(outbox) 분리 가능** — 위 보강을 반영했을 때만. 1차 완료 문구는 "**단일 BE 기준** APC-01 해소"(다중 BE에서 raw `@Scheduled` monitor가 노드마다 돌아 조기 settle 문제는 남음).

## 6. 결정 (사용자)
- [x] 범위: **1차 먼저**(①②③④⑨+⑧a+⑩). outbox는 2차
- [x] V74 loser: **(a) DELETE** — 이벤트 id 외부 장기 참조 없음
- [x] PG **15+ 전제**(PG는 우리가 설치) — 설치 가이드·FAQ에 최소 버전 15 명시(V74 근거)
