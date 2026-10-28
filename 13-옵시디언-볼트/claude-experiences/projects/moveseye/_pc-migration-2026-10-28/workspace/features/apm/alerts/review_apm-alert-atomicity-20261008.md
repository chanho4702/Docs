# 검수 요청 — APM 순위 11 알람 원자성 1차 (2026-10-08)

구현: Claude(SOLO-CLAUDE). 검수: Codex. 기준 BE master `1c094a1`(브랜치 `apm-alert-atomicity`, worktree `C:/worktrees/apm-c05-followup`).
설계 정본: `features/apm/alerts/apm-alert-atomicity-20261008.md`(§5 코덱스 의견 반영본·§6 사용자 결정: 1차 먼저 / V74 loser DELETE / PG ≥15 전제). 코덱스 설계 의견 `review_apm-alert-atomicity-design-20261008_codex.md`.

## 범위 (BE 9파일 + 문서 2)

| 파일 | 내용 |
|---|---|
| `db/migration/V74__apm_alert_event_open_unique.sql` | ① 열린 중복 행 정리 — 정본은 `fired_at asc, id asc` 최초 행, 정본 `zbx_eventid` null이면 loser에서 보강, loser **DELETE** ② `CREATE UNIQUE INDEX apm_alert_event_open_uq ON apm_alert_event (rule_id, service_id) NULLS NOT DISTINCT WHERE resolved_at IS NULL`(PG 15+) |
| `alert/evaluate/ApmAlertEventStore.java`(신규) | ③ `openIfAbsent(ruleId, serviceId, firedAt, value)` — JdbcTemplate `INSERT … ON CONFLICT DO NOTHING RETURNING id`(대상 없는 ON CONFLICT — 이 표의 유일 제약은 PK+V74뿐), `query().stream().findFirst()`(0행 정상), 호출자 트랜잭션 참여 |
| `alert/evaluate/ApmAlertEvaluationService.java` | ③ 열기를 store로. ④ `STUCK_REQUEST`는 `liveKeys`·`ensureProvisioned`·값 push까지 하고 **open/resolve 블록 `continue`**(측정 기반 전이 소유자 = 감시기, push 유지 = 장부 push 실패의 유일 재시도). 생성자 마지막 인자 `eventStore` 추가 |
| `alert/evaluate/ApmStuckRequestLedger.java` | ③ `fire`를 store로 |
| `alert/evaluate/ApmStuckRequestMonitor.java` | ⑧a **lock-free 공개 스냅샷** `volatile Snapshot published`(tick 끝에 `Map.copyOf`) — `currentValue()`·`openCount()`는 `synchronized` 밖, 스냅샷 없으면 empty. ⑩ `alarmed: Map<Long, AlarmState(ruleId, open)>` — 처음 보거나 ruleId 바뀌면 DB 재질의, 10초 재읽기 뒤 `reconcileAfterRefresh`(대상 밖 `observedAt` 제거 / ruleId 바뀐 서비스는 추적 행 `RULE_OFF`+상태 폐기 / 걸린 요청 있는 서비스는 `hasOpenEvent` 재조정 — 새 대상 읽은 **뒤**). ⑨ 대상 제거 분기에도 `observedAt.remove`. `lastSuccessfulTickMs` + 30초 넘게 실패 시 ERROR 로그 |
| 테스트 | `ApmStuckRequestMonitorTest` +4(APC-25 재추가·규칙 A→B·외부 해소 뒤 재조정·**lock 쥔 채 fire 막힌 동안 currentValue 즉시 반환**), `ApmAlertEvaluationRetryTest` +2(STUCK은 열지 않고 push·liveKeys 유지 / ON CONFLICT 삽입 행 수로 fired), **`ApmAlertEventStoreIT`(신규 4, 실 PG)**: 인덱스 정의(NULLS NOT DISTINCT), 수집기 축 NULL 한 키·닫힌 뒤 재열기·평범한 INSERT는 UNIQUE 위반, **두 트랜잭션 동시 open → 뒤쪽은 winner 커밋까지 대기 후 empty**, winner 롤백이면 loser가 열고 롤백이 INSERT를 되돌림 |
| `moveseye-docs/operations/설치-배포-가이드.md`·`guides/자주-묻는-질문.md` | PostgreSQL 최소 **15(필수)** — V74 근거 명시(사용자 결정) |

## 의도 — 선택과 버린 대안

1. **대상 없는 `ON CONFLICT DO NOTHING`**: `ON CONFLICT (rule_id, service_id) WHERE resolved_at IS NULL` 추론이 `NULLS NOT DISTINCT` 인덱스에 대해 성립하는지 PG 문서로 확신이 없어, 표의 유일 제약이 PK+V74뿐임을 근거로 대상 없이 썼다(인덱스 정의가 바뀌어도 문장이 안 깨진다). ⚠️ 나중에 다른 UNIQUE가 추가되면 그 충돌도 "이미 열림"으로 삼킨다 — 주석으로 못 박음.
2. **evaluator의 STUCK `continue` 위치**: `pushes.add` 직후·`breached` 판정 전. 코덱스 권고 그대로.
3. **감시기 I/O는 아직 `synchronized` 안**(⑧ 전체는 2차). 교착은 ⑧a(배치가 lock을 안 기다림)로 끊었다 — 교착의 한쪽 간선(배치→JVM lock)을 제거.
4. **`reconcileAfterRefresh`의 DB 재질의 범위**: 걸린 요청이 있는 서비스만(`hasOpenEvent` 10초마다 그 수만큼). 전 서비스 재질의는 비용 대비 이득 없음.
5. **V74 정리는 서비스 축·수집기 축을 `PARTITION BY rule_id, service_id` 한 문장으로**(윈도 파티션은 NULL을 한 묶음으로 본다).
6. 문서 FAQ의 "PostgreSQL 13+"는 사실상 낡은 값(V24·V63 `ALTER TYPE`은 12+)이었고 이번에 15로.

## 중점 확인 요청

- [ ] **대상 없는 ON CONFLICT**의 위험(1번) — 추론 문법을 써야 한다고 보는지.
- [ ] **`reconcileAfterRefresh`가 lock 안에서 DB를 부른다**(hasOpenEvent·close). 기존에도 lock 안 I/O였지만 호출이 늘었다. 교착 간선은 배치 쪽에서 끊었으므로 안전하다고 봄.
- [ ] **규칙 A→B 교체 시 같은 tick에서 RULE_OFF 닫고 새 규칙으로 다시 연다** — 장부에 close/open 쌍이 생기고 이벤트는 A 이벤트가 열린 채(관리 경로가 닫을 때까지) B 이벤트가 새로 열림. A 이벤트 해소는 규칙 끄기/고아 정리 경로에 맡긴다.
- [ ] **외부 해소 뒤 재발화 지연 최대 10초**(재읽기 주기). 1초로 당길 필요가 있는지.
- [ ] `published` 스냅샷에 `observedAt`만 든 서비스가 실림(대상 밖은 제거됨). 배치의 `currentValue` 의미(empty/0/양수)는 그대로.
- [ ] V74이 운영 DB에서 실제로 지울 행 수 — dev DB에는 중복이 없어 정리 분기는 **실행만 됐고 효과는 미검증**. 운영 적용 전 `select rule_id, service_id, count(*) from apm_alert_event where resolved_at is null group by 1,2 having count(*)>1` 확인 권고.
- [ ] 설계안 §6 "단일 BE 기준" 한정 문구 — 다중 BE에서 raw `@Scheduled` monitor 노드별 실행 문제는 그대로.

## 검증 현황

**통과**: `ApmStuckRequestMonitorTest` 10 · `ApmAlertEvaluationRetryTest` 4 · `ApmAlertEventStoreIT` 4(실 PG) · `ApmAlertEvaluationIT` 14(실 PG; 묶음 실행 때 1건 값 불일치 → 단독 재실행 통과, 다른 워크트리의 동시 테스트로 판단) · `ApmAlertJobTest` 10 · `ApmAlertOrphanSweeperTest` 15 · `ApmAlertServiceTest` 45 · `ApmSchemaIT` 20 · `ApmStuckRequestQueryServiceTest` 1.
**못 한 것**: 운영 중복 행 실데이터 정리 검증, dev BE 런타임(감시기+배치 실제 동시 실행), `ZabbixAlertBridgeTest`(bridge 미변경이라 생략), 전체 BE 테스트.

## 검수 결과 1차 (Codex, 2026-10-08 — 전문 `review_apm-alert-atomicity-20261008_codex.md`)

판정 **🟡 보완 후 승인** — 🔴0·🟡4·🟢1. 통과: 교착 두 간선(이벤트 INSERT·바인딩 행) 모두 끊김, V74 SQL 정확, ⑧a·④·⑨·push 유지.

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🟡 | 대상 없는 `ON CONFLICT`가 PK(복원 뒤 시퀀스 지연)·향후 UNIQUE 충돌까지 "이미 열림"으로 삼킴 | [x] `on conflict (rule_id, service_id) where resolved_at is null do nothing` — PG가 NULLS NOT DISTINCT 부분 인덱스를 추론함을 `ApmAlertEventStoreIT.secondOpenIsNoop`(NULL 키)로 실행 확인 |
| 2 | 🟡 | 재기동 직후 `hydrate`는 open만 복원·alarmed 비어 있어 A→B 규칙 교체 시 A 행이 재조정 안 됨 | [x] `reconcileAfterRefresh`가 `alarmed ∪ open`을 돌고 복원 행의 `row.ruleId`도 대상 ruleId와 비교 → 불일치면 RULE_OFF+재열기. 테스트 `hydratedRowsUnderReplacedRuleAreReopened` |
| 3 | 🟡 | `tick()` catch는 hang을 못 보고 `lastSuccessfulTick` 소비자 없음, 스냅샷은 `tickMs` 축이라 늙지 않음 | [x] 스냅샷에 `publishedWallMs`, `currentValue()`는 벽시계 기준 90초 넘으면 empty. `stalledForMs()`를 **5분 배치**(다른 실행 경로)가 읽어 30초 넘으면 ERROR. actuator 없음·기본 스케줄러 단일 스레드라 같은 풀의 watchdog은 부적합 — 배치가 watchdog |
| 4 | 🟡 | 필수 회귀 중 V74 정리 SQL 미실행, DB 없으면 skip, STUCK 0/empty·off→on·JDBC→JPQL 누락 | [x] `v71CleanupReplay`(인덱스 내리고 중복 6행 → SQL 재생 → 정본·보강·삭제·닫힌 행 보존 검증) · `jdbcOpenThenJpaResolveInOneTransaction` · RetryTest `stuckRequestZeroAndEmptyDoNotTransition` · MonitorTest `offThenOnWithOngoingRequestRefires` · `IntegrationTestSupport.testDatabaseAvailable`: `-Dit.db.required=true`면 DB 없을 때 **실패**. [ ] 미반영: 바인딩 행 잠금 교차 교착 재현 IT, push 성공→rollback/push 실패→commit crash-gap(둘 다 outbox 2차의 완료 조건으로 이관) |
| 5 | 🟢 | 장부 클래스 주석이 옛 소유권 모델 | [x] 주석 갱신 |

반영 검증: `ApmStuckRequestMonitorTest` 12 · `ApmAlertEvaluationRetryTest` 5 · `ApmAlertEventStoreIT` 6(실 PG) · `ApmAlertEvaluationIT` 14 통과.

## 검수 결과 2차 (Codex, 2026-10-08 — 전문 `review_apm-alert-atomicity-20261008_codex2.md`)

판정 **🟡 보완 후 승인** — 🔴0·🟡3. 1차 🟡1(ON CONFLICT 추론)·🟢5 닫힘, 🟡2·3·4 부분 닫힘 → 아래 반영.

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🟡 | 90초 넘는 hang이면 `currentValue()`가 empty라 배치가 `continue` → 루프 안의 watchdog에 못 닿음, 첫 tick부터 hang이면 `-1` | [x] watchdog을 `evaluateAll` **루프 앞**에서 값과 무관하게 1회. `stalledForMs()`는 성공 tick이 없으면 **기동 시각** 기준. RetryTest `verify(stuckMonitor).stalledForMs()` |
| 2 | 🟡 | 복원 행 `ruleId=null`(규칙 삭제 FK SET NULL)을 현재 규칙 행처럼 채택, A/B 혼합 복원이면 `anyMatch`로 B 행까지 RULE_OFF | [x] 행 단위 `Objects.equals(row.ruleId, currentRuleId)`로 불일치(null 포함)만 닫고 제거, 재조정 close를 `Tick.closed`에 합산. 테스트 `mixedRestoredRowsCloseOnlyForeignOnes`(B 유지·A/null 닫고 재열기·재발화 없음). 기존 mock 행에도 ruleId 채움 |
| 3 | 🟡 | `-Dit.db.required`가 Gradle JVM 속성이라 테스트 worker에 안 넘어감 | [x] `build.gradle.kts` `tasks.withType<Test>`에 `systemProperty("it.db.required", -D ?: IT_DB_REQUIRED ?: "false")`. `-Dit.db.required=true`로 IT 실행 확인(DB 있음 → 통과) |

반영 검증: `ApmStuckRequestMonitorTest` 14 · `ApmAlertEvaluationRetryTest` 5 · `ApmAlertEventStoreIT` 6 · `ApmAlertEvaluationIT` 14 · `ApmAlertJobTest` 10 통과(`-Dit.db.required=true`).

## 검수 결과 3차 (Codex, 2026-10-08 — 전문 `review_apm-alert-atomicity-20261008_codex3.md`)

**승인** — 🔴0·🟡0·🟢3(2차 지적 전부 닫힘), 남은 결함 없음.

## 커밋 전 추가 조치 — 마이그레이션 번호 V71 → **V74**

같은 날 ZM-78 세션(워크트리 `zm-78-be`)이 공유 테스트 DB에 V72·V73을 적용해 두어, V71은 "적용 안 된 과거 번호"로 Flyway 검증에 걸렸다(`ApmSchemaIT` 20건 컨텍스트 실패 — 코드 결함 아님). 병합 순서와 무관하게 안전하도록 **V74**로 올리고 코드·테스트·문서의 참조를 전부 바꿨다. ⚠️ ZM-78이 V74를 쓰지 않도록 메모리에 기록.
