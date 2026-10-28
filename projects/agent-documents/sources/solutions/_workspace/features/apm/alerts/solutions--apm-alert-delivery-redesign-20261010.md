# APM 알람 전송 재설계(채널 중립) + 알람 이력 보존 — 설계안 (2026-10-10)

> 사용자 결정(2026-10-10): ① 독자 알림 창구(메일·웹훅 발송 구현)만 **대기**, 그 외 알람 작업은 전부 진행해 **"창구 하나만 꽂으면 되는" 상태**로. ② 규칙·서비스 삭제 후에도 **알람 이력 보존**.
> 흡수 항목: 순위 11 2차(outbox·커밋 뒤 전송·멱등), 09-29 B1~B3(요청 걸림 알람 재설계), 09-28 B7(평가 트랜잭션 Zabbix I/O 분리)·B8(감시기 잠금 밖 I/O), APC-05.
> 현행 지도: 조사 결과 요약은 §1. Flyway는 **V76부터**(V72·73 GPU 브랜치, V74·75 알람).

## 1. 현행 문제 (조사 근거 파일:줄은 `alert/…` 기준)

| # | 문제 | 근거 |
|---|---|---|
| P1 | 5분 평가 `evaluateAll`이 **트랜잭션 하나** 안에서 Zabbix 호출 6종(재시도·프로비저닝·고아 정리·`history.push`·`event.get` 백필·정리 큐)을 한다 — Zabbix가 느리면 DB 커넥션·행 잠금을 그만큼 쥔다(APC-05) | `ApmAlertEvaluationService:283-415` |
| P2 | 1초 감시기가 **JVM lock → DB 트랜잭션 → Zabbix HTTP** 순으로 겹쳐 잡는다 | `ApmStuckRequestMonitor:166`, `Ledger.fire/settle:113-136` |
| P3 | 전송 실패 복구가 "5분 뒤 재push"뿐, 재시도 기록 없음. 독자 창구가 붙을 자리(전이 단위 통지)가 없다 | `Ledger:41-42`, Job |
| P4 | 이력이 규칙·서비스 삭제 시 FK CASCADE로 소멸. `ApmAlertQueryStore.recent`는 규칙 INNER JOIN이라 규칙 없는 이력이 위젯에서 빠짐. 수집기 축 NULL과 삭제로 생긴 NULL 구분 불가 | V38:388-402, `QueryStore:79-102` |
| P5 | 서비스 삭제 경로는 열린 이벤트를 닫지 않는다. 화면 규칙 삭제는 Zabbix 정리 실패 시 정리 큐에 안 넣는다(SLO 경로와 불일치) | `ApmServiceQueryService:536-549`, `ApmAlertService.delete:571-593` |

## 2. 목표 구조

```
[판정 트랜잭션(짧음)]  값 계산 · 이벤트 열기/해소(+스냅샷) · 통지 행(outbox) INSERT  → COMMIT
        │
        ├─▶ [Zabbix 동기화(트랜잭션 밖)]  프로비저닝 · history.push(이번 회차 값) · 백필 · 정리 큐
        │        레벨 기반: 실패해도 다음 회차가 최신 값을 다시 민다 → 별도 outbox 불필요(명시)
        │
        └─▶ [통지 디스패처(채널 중립)]  apm_alert_notification PENDING 행 → AlertChannel.deliver()
                 지금 등록된 채널 = 없음(독자 창구 대기). 메일 등은 AlertChannel 빈 하나 추가로 끝.
```

**핵심 판단 — Zabbix는 "통지 채널"이 아니라 "값 동기화 대상"이다.** Zabbix 알림은 우리가 민 값을 Zabbix 트리거가 판정해 Zabbix 미디어로 나간다(레벨 기반). 그래서 Zabbix 쪽은 전이(FIRED/RESOLVED) 단위 outbox가 아니라 **커밋 뒤 최신 값 동기화 + 실패 시 다음 회차 재동기화**가 맞다. 전이 단위 durable 통지(outbox)는 **독자 창구 전용**이며, 그 계층을 지금 완성해 둔다.

## 3. 변경 상세

### 3.1 V76 — 알람 이력 보존(스냅샷 + FK)
- `apm_alert_event`에 열 추가: `scope varchar(16) NOT NULL DEFAULT 'SERVICE'`(SERVICE|COLLECTOR — NULL 구분용), `rule_uid uuid`, `rule_kind varchar(32)`, `threshold double precision`, `threshold_unit varchar(16)`, `service_uid uuid`, `service_name text`, `service_env varchar(128)`, `resolve_reason varchar(24)`(RECOVERED|RULE_DISABLED|RULE_DELETED|SERVICE_DELETED|ORPHANED|MANUAL — 기존 해소 행은 NULL=미상).
- 백필: 기존 행을 규칙·서비스 조인으로 채움, `scope = CASE WHEN service_id IS NULL THEN 'COLLECTOR' ELSE 'SERVICE' END`.
- FK: `rule_id` **NOT NULL 해제 + ON DELETE SET NULL**, `service_id` **ON DELETE SET NULL**(기존 CASCADE 제약 DROP 후 재생성, 이름은 `pg_constraint`로 찾아 DO 블록). 선례 `apm_stuck_request.rule_id SET NULL`(V67).
- 🔴 V74 부분 UNIQUE `(rule_id, service_id) NULLS NOT DISTINCT WHERE resolved_at IS NULL`: 삭제로 rule_id가 NULL이 된 **열린** 행이 남으면 서로 충돌·오판 가능 → **삭제 경로는 반드시 먼저 닫는다**(3.4). 안전망으로 `CHECK (resolved_at IS NOT NULL OR rule_id IS NOT NULL)` 추가(열린 행은 규칙 필수).
- 기록: `ApmAlertEventStore.openIfAbsent`가 스냅샷 열을 함께 INSERT(규칙·서비스는 호출자가 이미 들고 있음).

### 3.2 V77 — 통지 outbox `apm_alert_notification`
| 열 | 비고 |
|---|---|
| id bigserial | |
| event_id bigint REFERENCES apm_alert_event ON DELETE CASCADE | 이력이 보존되므로 CASCADE는 보존 배치 삭제 때만 |
| transition varchar(16) | FIRED \| RESOLVED |
| channel varchar(32) | 채널 키(예: `email`). 행 = 이벤트 전이 × 채널 |
| status varchar(16) | PENDING \| SENT \| DEAD \| SKIPPED(채널 꺼짐) |
| attempts int, next_attempt_at timestamp, last_error text, created_at, sent_at | 백오프 `min(60분, 2^n분)`(정리 큐와 동일), 최대 시도 후 DEAD |
| UNIQUE (event_id, transition, channel) | **멱등 키** — 같은 전이를 두 번 적어도 한 행 |
| INDEX (status, next_attempt_at) | 디스패처 폴링 |
- 행 생성: 이벤트를 **연/닫은 같은 트랜잭션**에서 `AlertChannelRegistry.enabledChannels()` 각각에 `INSERT … ON CONFLICT DO NOTHING`. 지금은 등록 채널 0개라 행이 생기지 않는다(테스트는 가짜 채널로).
- 디스패처 `ApmAlertNotificationDispatcher`: `@Scheduled` 짧은 주기(예: 10초) + `SELECT … FOR UPDATE SKIP LOCKED LIMIT n` 행 단위 claim(다중 BE 안전) → 트랜잭션 밖에서 `channel.deliver(AlertNotification)` → 결과를 짧은 트랜잭션으로 기록. 채널이 등록 해제됐으면 SKIPPED.
- SPI: `interface AlertChannel { String key(); boolean enabled(); DeliveryResult deliver(AlertNotification n); }` — `AlertNotification`은 이벤트 스냅샷(규칙 종류·임계·서비스명·env·값·발화/해소 시각·해소 사유) + 링크용 uid. **이력 스냅샷만으로 메시지를 만들 수 있게**(규칙이 지워진 뒤 RESOLVED 통지도 가능).

### 3.3 5분 평가 분할 (P1)
1. `evaluateAll` → **판정 트랜잭션**(`TransactionTemplate`): 값 계산·`openIfAbsent`/resolve(+reason RECOVERED)·통지 행·push 목록 산출. Zabbix 호출 0.
2. 커밋 뒤 **Zabbix 동기화**(트랜잭션 밖, 단계별 짧은 트랜잭션은 바인딩 상태 기록만): `retryPendingTriggerStatus` → 프로비저닝 → 고아 정리 → `pushAll` → 백필 → 정리 큐. **순서는 현행 그대로**(고아 정리→push, -1→트리거 내리기, 트리거→아이템 삭제).
3. 고아 정리의 이벤트 해소(ORPHANED)는 판정 트랜잭션 쪽으로, Zabbix 호출만 2로.
4. Job 실패 판정·결과 집계 유지.

### 3.4 삭제·끄기 경로 (P4·P5)
- 규칙 삭제(화면·SLO 공통 `deleteRule`로 통일): 열린 이벤트 해소(RULE_DELETED)+RESOLVED 통지 행 → 바인딩 읽어 둠 → 행 삭제(이력은 SET NULL로 남음) → 커밋 뒤 Zabbix 객체 삭제, **실패 시 정리 큐**(화면 경로도).
- 서비스 삭제: `releaseService`에서 **그 서비스의 열린 이벤트를 먼저 해소(SERVICE_DELETED)**, 이후 동일.
- 규칙 끄기: 해소 reason RULE_DISABLED.

### 3.5 요청 걸림 감시기 (P2, B1~B3)
- lock 안: 메모리 판정만 → **명령 목록**(OPEN_ROW·CLOSE_ROW·SAVE·FIRE·SETTLE) 산출.
- lock 밖: 명령을 `Ledger`의 짧은 트랜잭션으로 적용(이벤트 열기/해소+통지 행) → 커밋 뒤 Zabbix 동기화(프로비저닝+push)는 **단일 스레드 executor**로 넘겨 1초 tick을 막지 않게(서비스별 마지막 값만 유지하는 coalescing — 밀린 push는 최신 값만).
- 1차의 lock-free 스냅샷·단일 소유권 유지. 명령 적용 실패 시 메모리 상태 되돌림 규칙: 이벤트 열기 실패면 `alarmed`를 세우지 않음(다음 tick 재시도).
- 다중 BE에서 감시기가 노드마다 도는 문제는 **범위 밖**(순위 15). V74 UNIQUE·통지 멱등 키로 중복 이벤트·중복 통지는 막힌다.

### 3.6 조회 (P4)
- `ApmAlertQueryStore.recent`: 규칙 INNER → LEFT JOIN, kind·서비스명은 `coalesce(현재값, 스냅샷)`.
- `ApmAlertService.events`/`toDto`: 규칙·서비스가 없으면 스냅샷으로 채움 + DTO에 `ruleDeleted`·`serviceDeleted`·`resolveReason`·`scope` 추가.
- FE: 장애 탭 표에 "삭제된 규칙/서비스" 표시(링크 없음)·해소 사유 열. 계약서 갱신.

## 4. 범위 밖(명시)
- 실제 메일·웹훅 발송, 채널 설정 화면, 수신자 관리 → **독자 창구 작업**(대기).
- 다중 BE 감시기 소유권(순위 15).
- 알람 이력 보존 기간 배치(현재 무제한 누적 — 별도 백로그).

## 5. 검증 계획
- 단위: 판정 트랜잭션에 Zabbix mock 호출 0회, 커밋 뒤 순서 고정, 감시기 명령 산출.
- 실 PG IT: V76 백필·FK SET NULL(규칙·서비스 삭제 후 이력 남음, 열린 행 CHECK)·V77 멱등 키·`SKIP LOCKED` 동시 claim 2스레드·가짜 채널 SENT/재시도/DEAD·규칙 삭제 후 RESOLVED 통지 스냅샷.
- 회귀: `alert.*` 전체, `ApmAlertEvaluationIT`·`ApmAlertEventStoreIT`·`ZabbixAlertBridgeTest`·`ApmAlertJobTest`.
- 지연 주입: Zabbix mock 5초 지연 시 판정 트랜잭션 시간 불변(APC-05 완료 조건).

## 6. 코덱스 의견 / 결정 (2026-10-10, `_archive/features/apm/alerts/review_apm-alert-delivery-design-20261010_codex.md`)
판정 **조건부 진행**. 반영 결정:

| # | 지적 | 결정 |
|---|---|---|
| 🔴1 | "Zabbix는 값 동기화라 outbox 불필요"는 **일반 값 push에만** 맞다. RESOLVE(-1·problem 닫기)·트리거 상태 변경·트리거/아이템 삭제는 다음 회차에 재구성 불가 → durable command | **채택.** Zabbix 작업 2분류: ① 최신 값 projection(레벨, 재동기화) ② **수명주기 명령**(durable, 판정·삭제 트랜잭션 안에서 **선적재**, 커밋 뒤 실행, 성공 시 제거, at-least-once+멱등). `apm_zbx_cleanup`을 확장 |
| 🔴2 | 정리 큐 trigger→item 순서가 DB로 보장 안 됨, `retryDue`가 트랜잭션 안 I/O | 명령에 `phase`/그룹 의존 추가(ITEM은 같은 그룹 TRIGGER 완료 후 claim), claim·결과만 짧은 트랜잭션 |
| 🔴3 | scope는 SERVICE\|SLO\|SYSTEM(ARCHIVE_HOLD도 NULL 축), DEFAULT 금지, window_min·env_norm·SLO 스냅샷 필요 | **채택.** nullable 추가→백필→검증→NOT NULL. CHECK 4종 |
| 🔴4 | nullable rule_id 전파(엔티티·findAllById null·백필 대상·삭제된 service_uid 필터) | 단위 1에서 전수 수정 |
| 🔴5 | outbox claim은 PROCESSING+lease 필요(트랜잭션 닫으면 claim 소멸) | **채택.** claim_token·lease_until, 만료 재claim, at-least-once 계약 명시 |
| 🔴6 | 채널별 FIRED→RESOLVED 순서 | FIRED terminal 전 RESOLVED claim 금지, FIRED DEAD면 RESOLVED SKIPPED |
| 🔴7 | 채널 0개→켜면 RESOLVED만 오는 문제 | **채널 최초 활성화 시 당시 열린 이벤트에 bootstrap FIRED 생성**(활성화 트랜잭션+advisory lock). 메커니즘은 지금 구현, 실제 채널만 대기 |
| 🔴8 | 고아/복귀 desired state를 먼저 커밋 | `trigger_sync_pending`/desired 상태를 판정 트랜잭션에 기록, worker 성공 시에만 해제. worker에는 scalar command만 |
| 🔴9 | 감시기 명령 실패 시 메모리 규칙·generation | 명령별 ack 규칙 표 + 서비스별 generation. **Zabbix 미디어도 창구로 유지**(사용자 10-10 "자빅스 창구 이외에도")하므로 감시기 push는 latest-only가 아니라 **edge-aware**(양수 edge·회복 edge 각각 최소 1회) |
| 🔴10 | 삭제 경로: 정리 명령 **항상 선적재**, 서비스 삭제 선해소 | 채택 |
| 🟡 | 해소 중앙화·FK DO 블록 열 단위 제한·DecisionResult/ZabbixSyncResult 분리·lease 30분 복구 지연·executor drain·stuck OPEN 멱등 | 해당 단위에서 반영 |

**Zabbix 정의(명시)**: Zabbix는 기존대로 **전이 알림 창구**(Zabbix 미디어)다. 5분 평가의 값 push는 5분 단위라 회차 안 FIRED→RESOLVED가 없으므로 최신 값 projection으로 충분하고, 1초 감시기만 edge-aware 큐로 전이를 보존한다.

## 7. 구현 단위(코덱스 권장, 순서 고정 — 5 전에 6 배포 금지)
1. V76 이력 보존 기반(스냅샷·scope·CHECK·FK SET NULL·엔티티 nullable·조회 fallback·마이그레이션 IT)
2. 이벤트 전이 단일화(open/resolve(reason) 단일 서비스·삭제 경로 통일·서비스 삭제 선해소)
3. V77 통지 outbox + SPI(같은 트랜잭션 INSERT·가짜 채널·순서·활성화 bootstrap)
4. 통지 디스패처(PROCESSING lease·SKIP LOCKED·백오프·DEAD/SKIPPED·2-worker IT)
5. Zabbix durable 수명주기 명령(정리 큐 확장·선적재·desired/pending·phase 의존·I/O 트랜잭션 제거)
6. 5분 평가 분할(판정 트랜잭션/외부 단계·결과 모델·IT 재구성·지연 주입)
7. 1초 감시기 명령/ack 상태기계(lock 밖 적용·generation·edge-aware 큐·drain)
8. 계약·FE(scope·resolveReason·삭제 표시·삭제된 서비스 필터)
+ 09-28 A5(알람 이력 보존 단계 배치)는 이력 보존 결정과 묶어 단위 1 또는 별도 소단위로.

각 단위 = 독립 커밋(빌드·관련 테스트 통과) + 코덱스 검수.

### 단위 1 결과 (2026-10-11) — 코덱스 5회 왕복 후 **조건부 승인**
- 🔴 **배포 조건: 단위 1은 단독 배포 금지, 단위 5·6과 함께 master 병합.** 브랜치 `apm-alert-history`에만 커밋.
- 잠금 순서 전 경로 통일: 서비스(KEY SHARE/FOR UPDATE) → SLO → 규칙 → 바인딩 → 이벤트. 배치는 시작 시 전체 선잠금 + 잠근 집합만 처리(phantom 차단). 화면 경로는 lock-then-read. 바인딩 첫 생성은 I/O 전 예약(INSERT ON CONFLICT).
- **단위 5·6으로 이관(완료 조건에 포함)**:
  1. 규칙 CRUD의 `syncNow/applyOurDefinition`도 커밋 뒤 durable 작업으로 — 전역 규칙 기존 바인딩 Zabbix 갱신 vs 서비스 삭제의 외부 엇갈림(고아) 해소.
  2. item 생성 후 trigger 실패 시 item id 미기록·외부 성공 후 DB 롤백 시 Zabbix 객체만 남음 → 수명주기 명령(단위 5).
  3. 단위 6 완료 조건: 프로비저닝 실패가 해당 바인딩의 짧은 트랜잭션에만 영향, 같은 회차 다른 이벤트 전이를 롤백하지 않음.
  4. 잠금 보유 시간: 배치 중 규칙 화면 수정 대기, 서비스 삭제 Zabbix I/O 중 같은 서비스 수신 UPDATE 대기 → 단위 5·6에서 해소.
  5. 이력 표시명(서비스명·SLO명) 스냅샷은 발화 직전 값일 수 있음(허용).
