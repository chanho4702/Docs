# 알람 재설계 단위 5(Zabbix durable 수명주기 명령)·단위 6(5분 평가 분할) 설계 (2026-10-11)

> 작성: Plan 에이전트 조사(읽기 전용) → Claude 정리. 기준 워크트리 `C:\worktrees\apm-c05-followup`(브랜치 `apm-alert-history`, 단위 1~3 커밋, 단위 4 작업 중). 줄 번호는 그 워크트리 기준.
> 정본: `apm-alert-delivery-redesign-20261010.md` §3.3·§3.4·§6(🔴1·2·8·10)·§7 + 이관(unit1 `_codex4/5`, unit23 `_codex`, unit4 `_codex`).

## 0. 결정 요약
1. **Zabbix 쓰기는 명령 실행기 한 곳에서만.** 트랜잭션 밖에 남는 Zabbix 호출은 `history.push`(값 projection)와 읽기뿐.
2. **명령 장부 = `apm_zbx_cleanup` 확장 + `apm_zbx_command`로 이름 변경(V79)** — 정리 큐 성질(id 보존·백오프·성공 시 삭제·FK 없음) 계승, 운영 V53 행을 데이터 이관 없이 승계.
3. 명령은 "이 바인딩/객체를 **실행 시점 DB의 원하는 상태**로 맞춰라"는 durable 표식. PROVISION·SET_TRIGGER_STATUS는 실행 시 DB 재조회 → 합치기 가능·순서 무관. 순서가 필요한 그룹 둘만 `group_key`+`phase`로 DB 강제: 해소(-1 push → 트리거 내리기 → Problem 닫기 확인), 삭제(트리거 → 아이템).
4. 판정·삭제·CRUD 트랜잭션은 **명령 선적재 후 커밋**, 커밋 뒤 실행기를 깨우거나(화면은 제한 시간 동기 실행).
5. claim·lease·CAS는 **단위 4 디스패처 패턴 재사용**(DB `localtimestamp`, `FOR UPDATE SKIP LOCKED`, PROCESSING+claim_token, CAS) + `generation`(실행 중 재적재 시 재실행). 코드 공유는 하지 않음(의존 조건·결과 상태가 다름).
6. 고아 방지 3중: item 생성 직후 짧은 트랜잭션으로 item id 기록 / 기록 시 바인딩이 사라졌으면 보상 삭제 명령 적재 / 삭제 명령은 id가 없어도 **태그·키로 찾아 삭제**.
7. 단위 6: `evaluateAll`의 `@Transactional` 제거 → **판정 트랜잭션**(값 계산·전이·통지·바인딩 예약·고아 표식·명령 적재, Zabbix 0) / **커밋 뒤 Zabbix 단계**(이번 회차 명령 실행 → 일괄 존재 확인·프로비저닝 → 직전 차단 검사 후 값 push → 백필). 단위 1 전체 선잠금은 판정 트랜잭션 안으로만.

## 1. Zabbix 작업 분류
(a) projection — 다음 회차 재동기화로 복구 / (b) durable 명령 — 판정 트랜잭션 안 선적재 / (c) 읽기 — 트랜잭션 밖으로만.

| # | 호출 | 현행 위치 | 분류 | 근거 |
|---|---|---|---|---|
| 1 | `history.push`(측정값) | `EvaluationService:441`→`Bridge.pushAll:806-869`, 장부 `Ledger:156` | (a) | 활성·측정 가능 대상은 매 회차 재push(`:381-389`), 5분 평가엔 회차 안 FIRED→RESOLVED 없음. 1초 장부 edge는 단위 7 |
| 2 | 존재 확인 get(host/group/item/trigger 태그) | `ensureProvisioned`→`provision:306-342` 등 | (a) 읽기 | 매 회차 재확인, 태그·키로 재탐색 가능 |
| 3 | 생성 host/group/item/trigger.create, 옛 이름 trigger.update | `ensureHost:410`·`ensureGroup:427`·`ensureItem:479`·`ensureTrigger:534`·`alignLegacyDescription:624` | **(b) PROVISION** | 생성 id 기록 필요. item 후 trigger 실패 시 `markError`(`:337`)만 커밋·item id 유실, 외부 생성 후 DB 롤백 고아, 대상 삭제 시 다음 회차 없음 |
| 4 | 정의 강제 trigger.update | `applyOurDefinition:302` ← `ApmAlertService.syncNow:1034`(create·update·SLO), resync, 대조 재생성 | **(b) PROVISION(enforce)** | 회차 경로는 기존 트리거를 안 건드림(`:271-273`) → 임계 수정 직후 update 실패하면 **아무도 다시 안 덮음** + 02:00 대조가 사람 드리프트로 오인(`SyncService:182-187`). `syncNow` "배치가 이어 맞춘다" 주석은 기존 트리거엔 거짓 |
| 5 | 해소 -1 push | 고아 `Sweeper:247`→`:320`, 끄기 `:535`→`:1280` | **(b) RESOLVE_PUSH** | 대상에서 빠지면 다음 회차 push 없음, 트리거 내리기 **전** 필수 |
| 6 | trigger.update status | 고아 `Sweeper:248`/`:203`, 끄기·켜기 `setTriggersEnabled:1086`, 재시도 `retryPendingTriggerStatus:1274` | **(b) SET_TRIGGER_STATUS** | 원하는 상태가 바인딩 error 접두(`TRIGGER_STATUS_PENDING`)로 **실패 뒤에만** 기록 → 고아 표식 커밋 후 호출 전 crash면 영영 안 내림(🔴8) |
| 7 | Problem 닫기 problem.get+event.acknowledge | `resolveOpenProblems:1009-1047` ← 정리 큐 | **(b) RESOLVE_CONFIRM** | 요청 직후 완료 아님, 다음 회차 확인. 현행도 V53 RESOLVE |
| 8 | trigger/item.delete | `removeObjectsOf:1385-1432` ← 규칙 삭제·deleteRule·서비스 삭제·고아(규칙 없음), 큐 `removeOwnedObject` | **(b) DELETE_TRIGGER/ITEM** | 비가역. 화면 삭제는 실패해도 큐 없음(`:603-606`), 순서는 INSERT 순서 의존(🔴2) |
| 9 | 정리 큐 재시도 루프 | `retryDue:219-244`(@Transactional 안 I/O) | (b) 실행기 | APC-05 원인 |
| 10 | eventid 백필 event.get | `backfillZabbixEventIds:481-535` | (c)+(a) | 실패 허용, DB는 이벤트 한 열 |
| 11 | 대조 trigger/item.get | `SyncService.check:168`·`markNotSupported:214` | (c), 재생성은 (b) | 지금은 부모 선잠금 쥔 채 읽음 |
| 12 | THEIRS 채택 trigger.get | `adoptTheirThreshold:998` | (c) | 결정은 트랜잭션 안, 반영은 PROVISION(enforce) |
| 13 | 진단 status() | `zabbixStatus:346` | (c) | 표기만 |
| 14 | 1초 장부 provision+push | `Ledger.fire:132`·`settle:146` | 혼재, **단위 7** | §4.8 접점 규칙만 |

원칙: 명령은 외부 호출 인자 박제가 아니라 "맞춰야 한다"는 표식. 실행기는 실행 시점 DB에서 원하는 상태 재조회(SET_TRIGGER_STATUS 원하는 상태 = 규칙 존재 ∧ enabled ∧ `orphaned_at IS NULL`). 끄기→켜기 연속은 마지막 의사만 반영, 같은 바인딩 명령은 한 행. 재구성 불가한 값(삭제 대상 태그·키, -1 아이템 키, 닫기 기준 시각)만 `target` jsonb로 박제.

## 2. 단위 5 — 명령 장부
### 2.1 확장 + 이름 변경(권장)
V53 행 승계(UPDATE 한 번), 성질 동일, 정본 §6 🔴1과 일치, 참조는 엔티티·서비스·문서뿐. 이름 변경 원치 않으면 이름만 유지해도 나머지 동일.

### 2.2 스키마 V79 `V79__apm_zbx_command.sql`(5a)
- `apm_zbx_cleanup` → `apm_zbx_command`, `object_kind`→`command varchar(32)`, `zbx_id` NULL 허용(PROVISION·태그 삭제는 id 없음).
- 추가 열: `dedup_key varchar(200)`(멱등), `group_key varchar(80)`(순서 묶음, NULL=독립), `phase smallint`, `status`(PENDING|PROCESSING|DEAD, 성공=행 삭제), `binding_id`(FK 없음), `target jsonb`, `generation int`, `claim_token uuid`, `claimed_at`, `lease_until`, `updated_at`.
- V53 승계: TRIGGER→DELETE_TRIGGER(phase 0), ITEM→DELETE_ITEM(phase 1), 같은 규칙/SLO/서비스 묶음 `group_key='v53:…'`, RESOLVE→RESOLVE_CONFIRM(`target.resolveBefore = created_at`), `dedup_key = command:zbx_id`.
- UNIQUE(dedup_key), CHECK: command 6종·status 3종·PROCESSING⇔claim·attempts/phase≥0·삭제/해소 명령은 id 또는 target 필수·PROVISION/STAT은 binding_id 필수.
- 인덱스: due(PENDING, next_attempt_at,id), lease(PROCESSING), group(group_key,phase), binding.
- **V80**(5b): `error LIKE 'TRIGGER_STATUS_PENDING%'` 바인딩마다 SET_TRIGGER_STATUS 명령 INSERT + error NULL. 이후 대기 표식 정본은 명령 행.

### 2.3 명령 종류
| command | dedup_key | group/phase | target | 실행 시 재조회 | 성공 |
|---|---|---|---|---|---|
| PROVISION | `PROV:b{id}` | 독립 0 | `{enforce}`(OR 병합) | 바인딩·규칙·대상·원하는 status | item·trigger 존재 + 바인딩에 두 id |
| SET_TRIGGER_STATUS | `STAT:b{id}` | 단독 0 / 해소 그룹 1 | — | 원하는 상태(DB) | update 성공, 트리거 없음·남의 것=성공 |
| RESOLVE_PUSH | `RPUSH:b{id}` | 해소 0 | `{kind,scopeUid,clock}` | 공유 아이템이면 생략 | **soft**(1회 시도 후 성공 처리) |
| RESOLVE_CONFIRM | `RCONF:t{id}`/`RCONF:tag:{rule}:{scope}` | 해소 2(V53은 독립) | `{resolveBefore,ruleUid,scopeUid}` | 소유 | `clock < resolveBefore` 열린 Problem 0, 있으면 ack 후 2분 뒤 재확인 |
| DELETE_TRIGGER | `DELT:{id}`/`DELT:tag:…` | 삭제 0 | `{ruleUid,scopeUid}` | 소유 태그 | 없음·남의 것·삭제 |
| DELETE_ITEM | `DELI:{id}`/`DELI:key:{key}` | 삭제 1 | `{itemKey}` | 살아 있는 참조 | 삭제, **다른 바인딩 참조 시 "보존 완료"**(현행은 영원히 재시도) |

적재: `ON CONFLICT(dedup_key) DO UPDATE` — PROVISION/STAT은 `generation+1`, `next_attempt_at=least(기존,지금)`, DEAD면 부활, enforce OR. DELETE는 DO NOTHING.

### 2.4 그룹·phase 의존(DB 강제, 🔴2)
claim에 `group_key is null or not exists(같은 그룹 phase < 내 phase 행 — PENDING/PROCESSING/DEAD 모두 차단)`, `order by next_attempt_at, phase, id`.
- 삭제 그룹: DELT(0) → DELI(1). 트리거 DEAD면 아이템 삭제 차단(의도 — 아이템 먼저 지우면 남의 트리거 cascade).
- 해소 그룹(고아·끄기): RPUSH(0) → STAT(1) → RCONF(2, +60초).
- 기존 STAT 행 편입: 단독 PENDING이면 group·phase=1로 UPDATE, PROCESSING이면 generation+1.
- 복귀·켜기 = 해소 그룹 취소(RPUSH·RCONF DELETE, STAT 단독 전환·generation+1). 옛 `cancelResolve` 사고는 취소 + `resolveBefore` 필터로 이중 차단.

### 2.5 원하는 상태 선커밋(🔴8·🔴10)
| 경로 | 같은 트랜잭션 커밋 |
|---|---|
| 고아 판정 | 해소(ORPHANED) + markOrphaned + 해소 그룹 3행 |
| 복귀 | clearOrphan + 해소 그룹 취소 + STAT 단독 |
| 규칙 끄기 | enabled=false + 해소(RULE_DISABLED) + 바인딩마다 해소 그룹 |
| 규칙 켜기 | enabled=true + 해소 그룹 취소 + STAT + 대상마다 PROVISION(enforce) |
| 임계 수정·resync OURS·THEIRS | 규칙 UPDATE + 대상마다 PROVISION(enforce) |
| 규칙·SLO·서비스 삭제 | 해소 + 그 바인딩 다른 명령 취소 + **바인딩마다 삭제 그룹(id 없어도 태그·키)** + 행 삭제 |

"실패 후 큐 적재"와 "화면 삭제 큐 없음"은 전부 **항상 선적재**로 대체.

### 2.6 claim/lease/CAS/generation — `ApmZbxCommandStore`
- claim(짧은 트랜잭션): PENDING 도래 또는 리스 만료 PROCESSING 중 phase 통과분 `FOR UPDATE SKIP LOCKED LIMIT n` → PROCESSING·token·`lease_until=localtimestamp+lease`·attempts+1, generation 반환.
- 완료: `DELETE … WHERE id AND token AND generation`. 0행이면 `UPDATE status=PENDING, claim 해제, next_attempt_at=now WHERE id AND token`(재적재 → 즉시 재실행), 그것도 0행이면 LOST.
- 재시도: CAS로 PENDING·`min(60, 2^attempts)분`·last_error.
- `claimByIds`: 판정·화면이 자기 명령을 즉시 실행(SKIP LOCKED라 남이 잡았으면 건너뜀).
- 기동 검사: `batch × 명령당 최대 Zabbix 호출 수 × HTTP timeout < lease`(단위 4 `requireFitsLease` 패턴), 기본 lease 2분·batch 20.

### 2.7 실행기 위치 — 별도 워커 + 커밋 후 깨우기 + ID 지정 실행(권장)
- `ApmZbxCommandWorker` `@Scheduled(fixedDelay=${app.apm.zbx-command.interval-ms:15000})`, **라이선스 게이트 없음**(커밋된 정리 의무, 단위 4와 같은 판단).
- `wakeAfterCommit()`: afterCommit에 단일 스레드 executor로 drain 1회(AtomicBoolean 합치기).
- `runNow(ids, budget)`: 호출 스레드에서 ID 지정 claim.
- 실행 중 트랜잭션 없음 단언.
- 평가 잡 후단만 쓰는 안은 리스 crash 30분·라이선스·5분 지연 때문에 기각.

### 2.8 실패·재시도·DEAD
- 일시 실패: 백오프 재시도. **DELETE_*·RESOLVE_CONFIRM은 자동 DEAD 없음**(현행 정책). PROVISION·STAT은 바인딩 error 원문 배지, 재적재 시 즉시 재시도.
- 영구 실패(notOwned 이름·키 충돌, payload 손상, 미지 command): DEAD + 바인딩 error + 경고 로그, `retry-dead` 또는 재적재로 부활.
- RESOLVE_PUSH: soft 완료(후속 phase가 보장).
- attempts ≥ 24: 경고(5분 제한) + 재시도 계속.
- 상태: `ApmAlertZabbixStatusDto.commands{pending,processing,dead,oldestDueLagSec}`(FE는 단위 8).

### 2.9 외부 성공 후 기록 실패
모든 실행기 멱등(PROVISION 키·태그 선조회, DELETE 없음=성공, STAT 재쓰기 무해, CONFIRM 조회 후 닫기) → at-least-once로 수렴.

### 2.10 item 생성 후 trigger 실패 시 item id 보존 — `ApmZbxProvisioner`
1. 읽기(트랜잭션 없음): 바인딩·규칙·대상·원하는 status. 바인딩 없으면 CAS 완료.
2. Zabbix ensureHost → ensureItem → itemId.
3. 기록 ①: 바인딩 FOR UPDATE — 없으면 **보상 삭제 그룹**(DELT:tag + DELI:{itemId}) 적재·완료, 있으면 `recordItem(itemId)`.
4. Zabbix ensureTrigger(enforce, status=원하는 값) → triggerId.
5. 기록 ②: 바인딩 FOR UPDATE — 없으면 보상(DELT:{triggerId}+DELI:{itemId}), 있으면 markProvisioned·clearTriggerStatusPending + 명령 CAS 완료 **같은 트랜잭션**.
6. 4 실패 시 markError + 재시도(item id는 3에서 이미 남음).
→ 삭제와 엇갈려도·외부 성공 후 롤백도 태그·키 삭제 + 보상으로 잔해 0 수렴.

### 2.11 브리지 정리
- 저장소 쓰기 없는 저수준 연산 추가: `findOrCreateItem`, `findOrCreateTrigger(enforce,status)`, `setTriggerStatus`, `deleteTriggerByIdOrTags`, `deleteItemByIdOrKey`, `pushValues`, `openProblems/ack`.
- 기존 바인딩 저장 포함 메서드는 **1초 장부 전용 레거시**로만 남김(단위 7에서 제거).
- 가드: 쓰기 연산 진입 시 트랜잭션 활성이면 예외(장부 레거시 예외), `app.apm.zbx.forbid-in-tx` 기본 true.
- ArchUnit `ApmZbxWriteSingleEntryTest`: 브리지 쓰기 호출자 = 실행기·평가 Zabbix 단계·장부만.

## 3. 규칙 CRUD·삭제 경로
### 3.1 경로별
| 경로 | 변경 |
|---|---|
| create | 저장 → enabled면 대상마다 reserve + PROVISION(enforce) |
| update | 임계·창 변경 PROVISION(enforce), 끄기·켜기 §2.5 |
| resync OURS | PROVISION(enforce) |
| resync THEIRS | **facade가 트랜잭션 밖에서 먼저 읽고**, 트랜잭션 안 lockRuleByUid → 채택값 검증 → UPDATE → PROVISION(enforce) |
| delete(화면)·releaseSlo·syncSloRule(false) | 공용 `deleteRule`, §2.5 삭제 적재 |
| syncSloRule 생성·수정 | §2.5 |
| releaseService | 해소 SERVICE_DELETED → 모든 바인딩 삭제 그룹 → 명령 취소. 반환값 = 적재 명령 수(호출자 로그만 수정) |
| 고아(규칙 없음) | 판정 트랜잭션에서 삭제 그룹 + 바인딩 삭제 |
부수 효과: 서비스 삭제가 FOR UPDATE 쥔 채 Zabbix I/O 하던 문제 소멸(단위 1 이관 4), 전역 규칙 기존 바인딩 vs 서비스 삭제 외부 엇갈림도 §2.10으로 수렴(이관 1).

### 3.2 `ApmAlertRuleWriteFacade`(트랜잭션 없음)
① `alertService.update`(@Transactional: DB+명령, ruleUid+commandIds 반환) ② `worker.runNow(ids, 3초 예산)` ③ readOnly로 DTO(명령 대기 포함). 예산 안이면 현행과 같은 응답, 넘기면 즉시 응답 + "반영 중". SLO·서비스 삭제는 `wakeAfterCommit`(비동기).

### 3.3 응답 계약(추가만)
- `ApmAlertBindingSummaryDto.queued` — PENDING/PROCESSING 명령 걸린 바인딩, 🔴 **missing에서 뺌**(예약 바인딩이 빨간 실패로 보이지 않게), DEAD는 missing.
- SLO `burnAlert.zabbixSyncing`.
- `ApmAlertZabbixStatusDto.commands`.
- 불변식 `total = synced + pendingCache + drift + missing + queued`.
- 대조는 PROVISION 대기 바인딩에 drift를 세우지 않음.

### 3.4 FE(단위 8, 계약서는 이 단위에서)
`apmAlertSyncState` 우선순위 missing > drift > queued > pending > synced, "Zabbix 반영 중" 배지, SLO 번 카드 syncing, 변경 후 queued>0이면 5초 폴링. ⚠️ 옛 FE는 queued를 몰라 예약 바인딩이 초록으로 보임 → **FE 배지 반영을 이 병합 묶음에 포함**(U2).

## 4. 단위 6 — 5분 평가 분할
### 4.1 경계
```
evaluateAll (트랜잭션 없음 단언)
 ├ DecisionResult = decisionTx(decider.decide)    // TransactionTemplate, Zabbix 0(가드)
 │   lockAllForBatch → 규칙·대상(locked) → 측정 → 전이(+통지) → 바인딩 reserve + PROVISION(id 없는 것)
 │   → 고아/복귀(해소·표식·해소 그룹/취소·삭제 그룹) → PushPlan 불변 목록
 └ ZabbixSyncResult = zabbixPhase.run(plan)       // 트랜잭션 없음
     1 runNow(이번 회차 명령)  2 일괄 존재 확인(우리 태그 trigger.get 1회 + item.get 1회 → 없어진 것 PROVISION)
     3 직전 차단 검사(바인딩 존재 ∧ !orphaned ∧ enabled ∧ 해소 그룹 미대기 ∧ !missing) 통과분만 push → 결과 짧은 트랜잭션
     4 eventid 백필(단건 UPDATE)
```
`retryPendingTriggerStatus`·`retryDue` 삭제(워커 대체). 복귀 트리거 켜기(STAT)가 1에서 먼저 → 이번 값으로 바로 판정.

### 4.2 잠금 축소
`lockAllForBatch`는 판정 트랜잭션 안에서만(보유 = DB 측정+전이, Zabbix 지연 무관). Zabbix 단계는 판정이 만든 bindingId만, 그 사이 삭제는 §2.10 재확인·차단 검사가 걸러냄. 측정을 잠금 밖으로 빼는 최적화는 보류(decisionMs 계측).

### 4.3 바인딩별 짧은 트랜잭션
PROVISION 기록 ①② / push 결과(회차 1건, id 오름차순) / 백필 단건 / 존재 확인발 PROVISION 적재. → **프로비저닝 실패가 같은 회차 다른 전이를 롤백하지 않음**(이관 3).

### 4.4 결과 모델
`DecisionResult(rules,targets,evaluated,fired,resolved,orphaned,restored,removedBindings,commandsEnqueued,pushPlanned,decisionMs,commandIds,plan)`, `ZabbixSyncResult(provisionTried,provisionFailed,push,pushFenced,commands{tried,done,retried,dead,lost},backfilled,zabbixMs,failure)`, `EvaluationResult(decision,zabbix)` — summary 앞부분 토큰 유지.

### 4.5 Job 판정
판정 예외 = 실패(커밋 없음) / 판정 성공·Zabbix 단계 예외 = **실패**(메시지 "판정 커밋 완료(…) — Zabbix 단계 실패") / 대상 전부 프로비저닝 실패 = 실패(현행 유지) / 일부 = 성공+warn.

### 4.6 대조 배치(6b)
무잠금 목록 → Zabbix 일괄 읽기 → 바인딩별 짧은 트랜잭션(서비스 KEY SHARE → 규칙 SHARE → 바인딩 FOR UPDATE → drift·NOT_SUPPORTED, 트리거 없으면 PROVISION(enforce)) → `retryPendingTriggerStatus` 삭제.

### 4.7 IT 재구성
- `ApmAlertEvaluationIT` → `ApmAlertDecisionIT`(Zabbix 무호출) + 전체 흐름 IT + **crash 동치**(decide만 → 워커 drain·다음 회차 → 정상 흐름과 같은 Fake Zabbix 상태).
- RaceIT 유지, `ruleUpdatePausedInZabbixIoThenServiceDelete` → "PROVISION 실행기 item·trigger 사이 정지 → 서비스 삭제 → 재개 → 보상 → 잔해 0".
- LockOrderIT: 창을 "명령 적재 후 커밋 전 정지 vs 서비스 삭제"로.
- RetryTest → `ApmAlertZabbixPhaseOrderTest`(InOrder, 차단분 push 0). Sweeper 테스트: 브리지 호출 0. Cleanup 테스트 → `ApmZbxCommandStoreIT`+`ExecutorTest`. BridgeTest 저수준/레거시 분리.
- **`FakeZabbixAlertBackend`**(test support): 메모리 Zabbix(id·태그·키·status·Problem), 지연·실패 주입, "잔해 0" 상태 단언, **모든 Answer에서 트랜잭션 활성 시 실패**(장부 레거시 예외).

### 4.8 1초 장부 접점(단위 7 전)
장부 fire/settle은 기존 in-tx 레거시 경로 유지. 🔴 장부 안에서 새 PROVISION 실행기(REQUIRES_NEW 기록) 호출 금지 — 장부가 이벤트 행을 쥔 채 안쪽이 판정의 바인딩을 기다리고 판정은 장부 이벤트를 기다리는 **JVM 경유 교착(PG 감지 불가)**. ArchUnit으로 고정.

### 4.9 5초 지연 완료 조건(APC-05) `ApmAlertEvaluationLatencyIT`
서비스 3·규칙 4, Fake Zabbix 전 호출 5초 지연:
1. decisionMs가 무지연 기준 +200ms 이내·1초 미만.
2. Zabbix 단계 지연 중 다른 스레드의 `facade.update`·서비스 삭제 DB 트랜잭션 1초 안 커밋, facade 응답 3초+ε 안 `queued>0`.
3. 같은 구간 평가 커넥션 `idle in transaction` 0.
4. 지연 해제·drain 후 Fake Zabbix 상태 = 무지연 실행.

## 5. 잠금 순서(갱신)
**서비스 → SLO → 규칙 → 바인딩 → 이벤트 → 통지(advisory 공유+행) → 명령(행)**. 명령 행에서 앞 자원으로 역행하는 경로 없음.
| 경로 | 순서 |
|---|---|
| 5분 판정 | 서비스 KEY SHARE(전체) → 규칙 SHARE(전체) → 바인딩 → 이벤트 → 통지 → 명령 UPSERT, Zabbix 0 |
| 평가 Zabbix 단계 | 트랜잭션 없음, 짧은 트랜잭션은 바인딩 → 명령 / 바인딩 단독 / 이벤트 단건 |
| 명령 claim·완료 | 명령 행만 |
| PROVISION 기록 | 바인딩 FOR UPDATE → 명령 |
| 규칙 CRUD | 서비스 KEY SHARE → SLO → 규칙 → 바인딩 → 이벤트 → 통지 → 명령 |
| 규칙·SLO 삭제 | 위 + 바인딩·이벤트 잠금 → 통지 → 명령(취소·그룹) → DELETE, Zabbix 없음 |
| 서비스 삭제 | 서비스 UPDATE → SLO → 규칙 → 바인딩 → 이벤트 → 통지 → 명령 → DELETE |
| 대조(6b) | 무잠금 읽기 → Zabbix 읽기 → 대상별 서비스 KEY SHARE → 규칙 SHARE → 바인딩(FOR UPDATE, 새 바인딩은 예약 INSERT·item resource) → 가족(zt:) → resource → 명령 행 (2026-10-20 6b 5차) |
| 고아 정리·복귀(5분 판정 안) | 바인딩 UPDATE를 **적재 전에 flush** → 가족 → resource → 명령 행(취소 포함, `enqueueCancellingConfirms`) (6b 5차) |
| 1초 장부(단위 7 전) | 서비스 → 규칙 → 이벤트 → 통지 → **바인딩(예외, 일방향 — 단위 1 결론)** |
| 디스패처·활성화(단위 4) | advisory → 통지 / advisory 배타(try) → 이벤트 NOWAIT → 통지 |

## 6. 구현 단위(커밋 4개, master 병합은 단위 1~6 + FE 배지 묶음)
- **5a** 명령 장부 + 삭제·해소 확인: V79, Store·Worker, DELETE_*·RESOLVE_CONFIRM 실행기, 삭제 경로 5곳 선적재, `retryDue` 제거, cancel/enqueueResolve 이관. 테스트: V79 이관 IT, StoreIT(2-worker·리스·CAS LOST·generation·phase 차단·정렬), ExecutorTest(태그·키 삭제, 공유 보존, resolveBefore), DeletePathIT(롤백 시 명령 0, crash 모사 후 drain 잔해 0, trigger→item, 서비스 삭제 트랜잭션 Zabbix 0, 예약 바인딩 태그 정리). 뮤테이션: phase 조건·선적재 위치·generation CAS·SKIP LOCKED·resolveBefore.
- **5b** PROVISION·STAT·해소 그룹 + CRUD 전환: V80, Provisioner(단계 기록·보상), STAT(DB 원하는 상태), RPUSH(soft), 판정의 고아·복귀 DB+명령만, CRUD 7경로, facade·THEIRS 사전 읽기, DTO queued/zabbixSyncing/commands, 브리지 저수준·가드·레거시 분리, ArchUnit, 계약서. 테스트: ProvisionIT(item 성공·trigger 실패 → 삭제 → 잔해 0, 정지+서비스 삭제 양방향, crash 재실행 멱등), 끄기→켜기 연속, 해소 그룹 InOrder·공유 생략, V80, CRUD 트랜잭션 Zabbix 0·queued 배지·대조 drift 미표시, facade 빠름/지연, RaceIT 잔해 0 재단언, 총합 불변식. 뮤테이션: item id 기록·보상·STAT 재조회·phase·가드.
- **6a** 5분 평가 분할: Decider·ZabbixPhase, `@Transactional` 제거·가드, 결과 모델, Job 판정, 주석. 테스트: DecisionIT, EvaluationIT+crash 동치, PhaseOrderTest, **프로비저닝 실패 격리**, Zabbix 단계 예외 시 판정 커밋 유지, 차단 검사, RaceIT, LatencyIT. 뮤테이션: @Transactional 재부착·선잠금 위치·차단 검사·큰 트랜잭션.
- **6b** 대조 분할 + 계측(decisionMs·zabbixMs·due lag).
- 공통: alert.* → premium.apm.* + LicenseArchitectureTest, 격리 PG.

## 7. 위험·미결
### 사용자 결정(권장 포함)
| # | 질문 | 권장 |
|---|---|---|
| U1 | 규칙 화면 쓰기 응답: 커밋 뒤 **제한 시간(3초) 동기 실행** vs 완전 비동기+폴링 | 제한 시간 동기(평소 응답 그대로, 느릴 때만 "반영 중") |
| U2 | FE "반영 중" 배지를 이 병합 묶음에 포함 | 포함(옛 FE는 예약 바인딩을 초록으로 표시) |
| U3 | 판정 커밋 후 Zabbix 단계 실패 시 잡 상태 | 실패(메시지 "판정 커밋 완료" 접두) |
| U4 | 명령 워커 라이선스 만료 중 실행 | 실행(커밋된 정리 의무) |

### 위험
- R1 판정 커밋 → 사용자 끄기 → 워커 -1·내리기 → 그 뒤 이번 회차 양수 push(ms 창) → 재활성 시 즉시 발화. 차단 검사로 축소 + **권장 강화: 켜기 방향 STAT 앞에 RESOLVE_PUSH(-1) phase 0**(꺼진 동안 들어가 이벤트 없음).
- R2 태그 기반 삭제는 태그 온전성 전제(남의 것 안 건드림 유지).
- R3 trigger.delete가 열린 Problem도 정리한다는 전제(추정) → dev Zabbix 7.x 실측, 남으면 삭제 그룹 phase 0에 RESOLVE_CONFIRM.
- R4 1초 장부 in-tx 레거시(단위 7까지) → §4.8 ArchUnit.
- R5 판정 보유 시간 = DB 측정 시간 → 계측.
- R6 평가 잡 crash 리스 30분 push 공백(현행과 같음, 별도 백로그).
- R7 facade runNow vs 워커 경쟁 → SKIP LOCKED, 놓친 쪽 queued.
- R8 명령 누적 → dedup으로 바인딩·객체당 1행, due lag 경고.
- R9 V53 RESOLVE 승계 resolveBefore=created_at(보수적 강화, 의도).
- R10 테이블 이름 변경 충돌(참조 엔티티·문서뿐).
- R11 일괄 존재 확인 응답 크기(대상 1,000+ 시 페이지).

### 닫히는 이관 항목
unit1 결과 1~4, 설계 🔴1·2·8·10, unit23 단위 5·6, unit4 단위 6(전이 지연 지표 decisionMs).

---

## 8. v2 개정 — 코덱스 1차 "재설계 필요"(`_archive/features/apm/alerts/review_apm-alert-unit5-6-design-20261011_codex.md`) 반영 (2026-10-11)

> 아래가 앞 절과 충돌하면 **이 절이 우선**한다.

### 8.1 명령 병합 규칙(🔴1)
- **모든 명령**이 충돌 시 `DO UPDATE`: `generation+1`, `next_attempt_at=least(기존, localtimestamp)`, DEAD면 `status=PENDING, attempts=0`. DELETE도 예외 없음(`DO NOTHING` 폐기).
- 병합 값: PROVISION `enforce` OR, RPUSH `clock=max`, RCONF `cutoffEpochSec=max`, DELETE target은 식별자 합집합.
- "보존 완료"(다른 참조 존재)도 **generation CAS**로만 종료 → 실행 중 재적재되면 재실행.
- 참조 검사 = `zbx_itemid` 일치 **또는** 같은 논리 item 키 `(host, kind, scopeUid/itemKey)`를 가진 바인딩(예약·id 미기록 포함).

### 8.2 의존 모델 — `group_key/phase` 대신 의존 표(🔴2)
- 새 표 `apm_zbx_command_dep(command_id, predecessor_id)`(둘 다 FK→명령 ON DELETE CASCADE, PK 둘). claim 조건: 선행 행이 **하나도 남아 있지 않을 것**(PENDING/PROCESSING/DEAD 모두 차단, 성공=행 삭제라 자동 해제).
- 삭제 그룹은 **논리 item resource 기준**: 같은 item을 참조하는 모든 DELETE_TRIGGER → 그 DELETE_ITEM의 선행. 새 삭제가 같은 item에 붙으면 의존 행만 추가(병합).
- 해소 체인: RPUSH → STAT → RCONF를 의존 행으로.
- 여러 명령을 한 트랜잭션에서 적재·취소할 때 **dedup_key 오름차순**으로 잠금.

### 8.3 리소스 시퀀서 — push도 같은 레인(🔴3)
- 모든 명령에 `resource_key`(바인딩 축: `b:{ruleId}:{scopeUid}`, item 축: `i:{host}:{itemKey}`). claim은 **같은 resource에 PROCESSING 행이 있으면 건너뜀** → 한 resource의 명령은 한 번에 하나.
- 5분 값 push = **`PUSH_CURRENT` projection 명령**(dedup `PUSH:b{id}`, 병합 시 최신 값·clock=max). 판정 트랜잭션에서 적재, 커밋 뒤 `runNow`.
- **fence**: 같은 resource에 PROVISION(enforce)·STAT·RPUSH·RCONF·DELETE가 PENDING/PROCESSING/DEAD로 있으면 PUSH_CURRENT는 실행하지 않고 대기(선행 의존 자동 부여). lifecycle 명령 적재 시 같은 resource의 대기 PUSH_CURRENT는 **삭제(supersede)**.
- 켜기 경로: `RPUSH(-1, **hard** — 실패 시 재시도)` → STAT(enable). soft는 끄기 경로의 RPUSH에만 유지.
- `history.push` 직접 호출은 제거(1초 장부 레거시만 예외, 단위 7).

### 8.4 리스·실행 예산(🔴4)
- claim은 **한 번에 한 행**(just-in-time), 외부 호출 사이마다 `token+generation` CAS로 **lease 갱신**.
- 기동 검사: 명령 종류별 최대 호출 수 × `ZabbixClient` 응답 timeout(30초) < lease. 기본 lease 10분, 갱신 주기 30초.
- `runNow(ids, budget)`: **bounded executor**(크기 설정값)에 제출하고 최대 3초 await, 타임아웃이면 같은 claim 소유자가 백그라운드에서 계속. 호출 스레드는 RPC를 직접 하지 않는다.
- U1은 이 모델일 때만 "제한 시간 동기(3초 await)", 아니면 완전 비동기.

### 8.5 V79 승계 절차(🔴5)
- 순서: rename → 새 열 nullable 추가 → 백필(command·dedup_key·resource_key·target·status·generation·updated_at) → 옛 UNIQUE `(object_kind, zbx_id)` **명시 DROP** → 새 UNIQUE(dedup_key) → NOT NULL·CHECK → 인덱스.
- V53 행의 의존 복원은 보수적으로: **이관된 모든 DELETE_ITEM은 이관된 모든 DELETE_TRIGGER를 선행으로**(V53 행은 소수, 과잉 대기는 안전 쪽).
- 키 길이: group/resource 키는 원문 대신 안정 해시(`md5(...)`) 접두 형식.
- IT는 **실 V53 seed**로: ITEM/TRIGGER/RESOLVE 혼재, 공유 item 다른 규칙, attempts·미래 next_attempt_at, 같은 trigger의 RESOLVE+DELETE, 이관 후 id·백오프·의존 보존.

### 8.6 경계·식별(🔴6)
- RCONF: `cutoffEpochSec`(전이 시각 초) 박제, **`clock <= cutoffEpochSec`**(같은 초 포함).
- 삭제 식별 정확 일치: trigger = synthetic host + owner + ruleUid + scopeUid + kind, item = synthetic host + owner + 정확한 key. 태그 검색 결과는 코드에서 AND 재검증, 0건=성공, 복수건=모든 owned exact-match 삭제.
- IT: 다른 host 같은 key, owner만 같은 다른 trigger, 예약 바인딩 null id.

### 8.7 🟡 반영
- 1초 장부·판정·워커 **3자 latch IT**(JVM 경유 교착 부재) + ArchUnit.
- 잠금 표에 같은 종류 행 정렬 명시(명령 `dedup_key ASC`, 바인딩·이벤트 `id ASC`).
- 배지 집계 상호 배타 정의를 SQL/서비스에서: 우선순위 `missing(DEAD 포함) > drift > queued > pendingCache > synced`로 각 바인딩을 정확히 한 칸에.
- 명령 실패는 **명령 행이 정본**, 바인딩 `error`는 NOT_SUPPORTED 등 바인딩 고유 사유만(명령 오류와 분리 — 별도 열 `command_error` 또는 DTO가 명령에서 직접 읽음).
- 배포는 **설치형 단일 노드 = coordinated stop**(rolling 미지원 명시). 다중 노드 rolling은 순위 15에서 expand/contract로.
- `trigger.delete`의 Problem 정리 전제는 구현 시 dev Zabbix 7.x 실측, 안 되면 삭제 체인 앞에 RCONF.
- 6b에 단위 4 이관(알림 reconcile 페이지 간 pause·claim 공정성·continuation) 포함.

### 8.8 사용자 결정 갱신
| # | 갱신 권장 |
|---|---|
| U1 | **bounded executor + 최대 3초 await**(8.4). 호출 스레드 RPC 금지 |
| U2 | 포함(변경 없음) |
| U3 | 실패 + **구조화 필드**(`decisionCommitted`, `failedPhase=ZABBIX`, `commandsPending`)를 실행 이력에 |
| U4 | **명령 종류별**: DELETE·해소(RPUSH·RCONF)·disable STAT은 라이선스 무관 실행 / PROVISION·enable STAT·PUSH_CURRENT는 라이선스 복구까지 PENDING 유지 |
| U5(신규) | 1초 장부의 in-tx Zabbix I/O(단위 7)를 **단위 1~6과 같은 배포에 묶을지** → 권장: **묶는다**(임시 예외 배포는 운영 설명 부담) |

### 8.9 구현 단위(개정)
0. **선행 게이트**: 단위 4 반려 해소·V78 커밋 → 번호 V79 확정.
1. **5a-1** 명령 대수 + 마이그레이션(V79 + 의존 표): 병합·generation·resource_key·의존·V53 실데이터 승계.
2. **5a-2** DELETE/RESOLVE 실행기: 공유 item 의존, cutoff 경계, 정확 식별 삭제, 보존 경쟁 IT.
3. **5b** PROVISION/STAT/facade: item 중간 기록·보상, lease 갱신, bounded `runNow`, queued 계약.
4. **6a** 판정 분할 + PUSH_CURRENT 시퀀서(직접 push 제거, fence).
5. **6b** 두 대조(Zabbix 대조 분할 + 알림 reconcile 공정성).
6. **7** 1초 장부(U5에 따라 같은 배포).
7. **8** FE·계약.
추가 필수 IT/뮤테이션: DELETE 재적재 경쟁, 공유 item 복수 trigger, 같은 초 cutoff, 지연된 양수 push↔disable↔enable, hanging RPC 3초 facade 응답, 기본 설정 lease 검증, 3자 교착.

## 9. v2 2차 검수 "조건부 진행"(`_archive/features/apm/alerts/review_apm-alert-unit5-6-design-20261011_codex2.md`) — 확정 사항 (2026-10-11)
### 9.1 resource 단일 실행의 원자성(🔴1)
- **`CREATE UNIQUE INDEX … (resource_key) WHERE status='PROCESSING'`** + claim은 행 단위 시도 → 23505 충돌이면 그 행 건너뛰고 다음 후보(같은 트랜잭션 savepoint 또는 행별 짧은 트랜잭션). 두 worker가 같은 resource 다른 행을 동시에 PROCESSING으로 만드는 일은 DB가 거부.
- lifecycle 적재 시 같은 resource의 **PENDING** PUSH_CURRENT는 같은 트랜잭션에서 DELETE(supersede). PROCESSING 중인 push는 끝까지 실행되고, lifecycle 명령은 partial UNIQUE 때문에 그 뒤에 실행 → 순서 "push → disable" 보장.
- 명령별 resource 매핑: PROVISION·STAT·RPUSH·RCONF·PUSH_CURRENT·DELETE_TRIGGER = 바인딩 축 `b:{ruleId}:{scopeUid}`(삭제된 바인딩은 target의 rule/scope로), DELETE_ITEM = item 축 `i:{host}:{itemKey}`. item 축과 바인딩 축의 순서는 dependency(§8.2)로.
- IT: 두 worker가 같은 resource의 PUSH_CURRENT·STAT, PROVISION·STAT을 동시 claim → 하나만 PROCESSING.

### 9.2 dependency 선형화(🔴2)
- dependency 추가 트랜잭션은 successor 명령 행을 `FOR UPDATE`로 잠그고 edge INSERT + successor `generation+1`.
- `DELETE_ITEM` 실행기는 외부 삭제 RPC **직전** 짧은 트랜잭션에서 자기 행 `FOR UPDATE` → token·generation 일치 + 선행 edge 0 재확인 → 통과하면 그 트랜잭션을 커밋하지 않고 **선형화 지점 마커**(`executing_since`)를 기록 후 커밋, 실패면 PENDING 복귀.
- 선형화 지점 이후 추가된 edge는 "사후 선행"으로 간주: 해당 DELETE_TRIGGER는 item이 이미 없으면 성공(Zabbix는 item 삭제 시 그 item을 쓰는 트리거를 함께 삭제 — **구현 시 dev Zabbix 7.x 실측 필수**, 실패하면 사후 선행이 생기는 순간 DELETE_ITEM 재실행 경로를 둔다).
- latch IT: DELETE_ITEM claim 후 RPC 직전 정지 → 새 DELETE_TRIGGER+edge 적재 → 재개 시 PENDING 복귀 / 선형화 지점 이후 적재 → 트리거 삭제 성공(없음).

### 9.3 lease 검증과 실행 규칙(🔴3)
- 기동 검증: `명령별 최대 호출 수 × (pool wait 5s + connect 10s + response 30s) + 여유 30s < lease`, 별도로 `lease > 단일 RPC 최악 45s × 2`. 기본 lease 10분.
- claim은 **executor 작업 안에서 실행 직전**에. facade 3초 await 만료 시 `Future.cancel(true)` 금지(작업은 계속). executor 큐 포화·reject 시 명령은 PENDING 유지, 응답은 `queued`.
- lease 갱신은 **RPC 사이마다**(token+generation CAS, 실패 시 즉시 중단) — 별도 heartbeat 스레드 없음.
- worker 병렬도 기본 4(Zabbix 커넥션 풀 10 이하), 정렬 `next_attempt_at, id`(aging), 같은 resource 연속 실행은 partial UNIQUE로 자연 제한.

### 9.4 계약 확정
- **Zabbix는 현재 상태 projection** — 5분 평가 값은 최신 값으로 병합되며, backlog가 평가 주기를 넘으면 짧은 양수→음수 사이 양수가 Zabbix에 전달되지 않을 수 있다(5분 평가는 원래 레벨 판정). edge 전달 보장은 독자 알림 창구(outbox)의 몫. 계약서·운영 문서에 명시.
- U4: STAT 실행기는 DB desired state **재조회 후** 라이선스 판정 — enable로 바뀌었고 라이선스 만료면 실행하지 않고 PENDING.
- U5: **단위 7(1초 장부)을 같은 배포 게이트에** — STUCK 경로도 sequencer로.

### 9.5 🟡 반영
- dependency: `CHECK(command_id <> predecessor_id)`, 허용 edge 종류표(RPUSH→STAT→RCONF, DELETE_TRIGGER→DELETE_ITEM, lifecycle→PUSH_CURRENT만), 추가 시 cycle 검사, 상태 API `blockedBy`·최장 차단 시간, 취소·supersede 시 edge 정리.
- V79: 가능한 행은 `rule_uid/slo_uid/service_id`로 좁게 복원, 불명확 행만 전역 barrier, 이관 결과(행·edge 수) 마이그레이션 로그, "migrated DEAD로 차단" 운영 조회, 복원 불가 행의 migration 전용 resource_key와 재적재 시 re-key 규칙.
- 계측: 명령 종류별 oldestDueLag, PUSH_CURRENT fence 시간, resource별 backlog, 처리량 테스트(예상 최대 바인딩 수).

### 9.6 구현 순서(최종)
1. 단위 4 반려 해소·V78 확정 → 2. **5a-1** V79+dependency 표+partial UNIQUE+최종 CHECK(PUSH_CURRENT 포함)+선형화 규칙 → 3. **5a-2** DELETE/RCONF + 동시 dependency IT → 4. **5b** PROVISION/STAT/facade + HTTP 상한 lease + bounded executor → 5. **6a** PUSH_CURRENT 전환 + resource claim 경쟁·처리량·알림 지연 테스트 → 6. **7** 1초 장부 sequencer 전환 → 7. **6b** 두 대조 → 8. **8** FE·계약.
배포: 단위 1~8 한 번에(coordinated stop), 중간 커밋 독립 배포 금지.

## 10. 5a-1 결과 (2026-10-11) — 코덱스 3회 왕복 후 **조건부 승인**
- 명령 장부 V79(rename·승계·의존 표·partial UNIQUE·pending_resource_key), Store(병합·supersede·fence·의존·가족 잠금 → 별칭 → resource 잠금 → 행 잠금 순서, claim 23505 건너뛰기·SKIP LOCKED, CAS 결과 기록), 기동 검증, 정리 큐 어댑터. 운영 진단 `guides/ops_v79-predeploy-diagnostics.md` D1~D7.
- **5a-2 필수 이관**: `knownIds` 없는 키 기반 DELETE_ITEM의 **id 화해** — 실행기가 정확한 item id를 조회한 뒤 외부 삭제·`markLinearized` **전에** 그 id를 Store의 가족 잠금·realias 경로로 반영(안 하면 `m:v53:i:{id}`와 정규 `i:` lane이 갈려 아이템 삭제가 트리거 삭제를 앞지를 수 있음). D7은 그 전까지 완전한 무결성 증명이 아님.
- **6a 이관**: id 화해·realias와 PUSH claim 교차 경쟁 IT, PUSH claim이 lifecycle 선잠금보다 먼저 이긴 경우 "PUSH 후 lifecycle" 순서 검증.
- 간헐 실패 관측: `ApmTraceReclassificationIT` "forward가 비어도 lookback 교정은 commit…" 회귀 실행 중 2회 실패·단독 통과(알람 무관 — 별도 백로그).

## 11. 5a-2 결과 (2026-10-11) — DELETE·RESOLVE_CONFIRM 실행기 + 워커 + 삭제 경로 선적재 (미커밋, 검수 전)
### 11.1 dev Zabbix 7.0.6 실측(dmove.co.kr, 임시 호스트·그룹 `moveseye-qa-probe-20261011-223315` 생성 → 실측 → 삭제 확인)
- ① `item.delete`는 그 아이템을 쓰는 트리거를 **함께 지운다**(거부하지 않음) → **§9.2 확정**: 선형화 뒤에 붙은 DELETE_TRIGGER는 트리거 없음(0건)으로 성공. 재실행 경로 불필요.
- ② `trigger.delete`는 열린 Problem을 **닫지 않는다** — 지운 뒤 0·10·30초 모두 `problem.get`·`event.get`에 그대로(value=1, r_eventid=0). 약 48분 뒤 `problem.get`에서는 사라졌으나 `event.get`은 회복 없이 남음(회복 이벤트 없음 = 액션의 회복 통지 없음). item.delete cascade로 지운 트리거도 같다.
- → **R3 확정**: 삭제 체인 = `RESOLVE_CONFIRM(beforeDelete) → DELETE_TRIGGER → DELETE_ITEM`. 허용 edge에 `RCONF→DELT` 추가, rank 재배치(PROV·RPUSH 0, STAT 1, RCONF 2, DELT 3, DELI 4, PUSH 5).
### 11.2 확정·추가 결정
- 삭제 체인 RCONF는 `confirm-give-up-attempts`(기본 10) 초과 시 경고 후 완료(삭제를 막지 않음). manual_close=0만 남으면 일반 확인 DEAD, 삭제 체인은 완료. 일반 확인(고아·끄기)은 포기 없음(§2.8 유지).
- `maxZabbixCalls` 실측 확정: RCONF 6(조회 2 + problem.get + ack + 토큰 2), DELT 5, DELI 5 — `ApmZbxCommandExecutionIT.realCallCountsFitDeclaredMaximum`가 가장 긴 경로로 고정.
- 🔴 병렬 drain에서는 같은 resource의 두 명령 claim 순서가 id로 보장되지 않는다(SKIP LOCKED + 23505 건너뛰기, 실측 — 뮤테이션 m6가 병렬 drain에서는 우연히 살아남음). 순서는 **edge로만** 보장한다. 결정적 테스트용 `worker.drainOnCallerThread()`.
- 커밋 후 깨우기는 한 트랜잭션에 한 번만 등록(트랜잭션 자원 키) + 대기 중 깨우기 합치기.
- 워커 `auto-run`(기본 true) — IT는 false.
### 11.3 6a·5b 이관
- 6a: §10 이관(화해·realias × PUSH claim 교차 IT) 유지.
- 5b: 끄기·켜기·고아 해소 그룹 전환 시 `enqueueResolve`/`cancelResolve` 대체, PROVISION과 DELETE_ITEM의 lane 경쟁(바인딩 축 PROVISION이 아이템을 다시 만드는 동안 item 축 DELETE_ITEM 참조 검사 — 5a-2는 "실행 시점 DB 참조"만 본다).
### 11.4 코덱스 5a-2 1차 반려 반영 (2026-10-11)
- 🔴1 id 경로 논리 식별: 트리거 명령은 id로 찾은 것도 `host + owner + ruleUid + (알면) scopeUid + kind`를 코드에서 AND 재검증(식별 null이면 언제나 거짓 — host+owner만 통과하던 경로 폐기). 규칙 식별은 target.ruleUid → 출처 칸 rule_uid 순, 없으면 **DEAD(`UNIDENTIFIED:`)** — 사람 확인. 아이템 명령은 정확 키 필수(id 경로도 키 재검증), 키 없으면 DEAD. 키 기반 DELETE_ITEM의 id 화해가 키 없는 이관 별칭에 정확 키를 물려준다(같은 id를 정확 키로 확인했으므로).
  - ⚠️ 결과: 규칙 uid가 없는 V53 이관 트리거 행·키 없는 V53 아이템 행(화해로 키를 못 받은 것)은 DEAD로 남는다 — Zabbix 잔해가 남을 수 있지만 남의 객체는 건드리지 않는다. 운영 진단에서 `last_error like 'UNIDENTIFIED%'` 행을 확인·수동 정리.
- 🔴2 삭제 체인 RCONF 포기 카운터 = `target.confirmRechecks`(ack 성공 → RECHECK 때만 +1, `ApmZbxCommandStore.recheckConfirm`). claim attempts는 보지 않는다. 포기 판정은 "지금도 열린 문제가 있음"을 조회로 확인한 뒤에만. 일반 RCONF가 삭제 체인으로 병합되는 순간(beforeDelete false→true) 적재 병합이 카운터를 지운다(0부터). 새 마이그레이션 없음(target JSON).
- 🟡 `ApmAlertOrphanSweeper.sweep` = `@Transactional(MANDATORY)`.
- **5b·6a 배포 게이트 — 완료 조건(이 브랜치 단독 배포 금지)**:
  1. 선형화 뒤 사후 선행 경로의 열린 Problem: `ApmZbxCommandExecutionIT.lateEdgeAfterLinearizationSucceedsWithTriggerGone`가 지금 "Problem 잔존(isOpen=true)"을 명시 단언한다. 5b·6a에서 (a) 사후 선행이 운영 경로에서 불가능함을 잠금으로 증명하거나 (b) item 삭제 전에 그 item을 쓰는 트리거의 Problem을 닫는 보상 경로를 넣고, 이 단언을 isFalse로 뒤집어야 완료.
  2. PROVISION/신규 바인딩과 DELETE_ITEM 경쟁: PROVISION·바인딩 생성이 item-family 잠금 또는 DELETE_ITEM generation/edge 갱신에 참여(참조 재조회만으로는 부족). 늦은 생성 IT 필수.
  3. 6a: §10 이관(화해·realias × PUSH claim 교차 IT) 유지.
  4. `premium.apm.*` 회귀를 shard로 재실행(전체 1회 실행은 OOM — 사용자 승인 대기).
### 11.5 코덱스 5a-2 2차 반려 반영 (2026-10-12)
- 🔴1 DELETE_ITEM 비가역 조건 = **그 아이템을 쓰는 Zabbix 트리거 0건(owner 무관)** — `trigger.get itemids`(상한 10)로 참조 검사 뒤·선형화 전에 확인, 1건이라도 있으면 지우지 않고 보존 완료(WARN 로그. 완료는 행 삭제라 last_error에는 남지 않는다). DELETE_ITEM `maxZabbixCalls` 5→6(조회 id·키 2 + 쓰는 트리거 1 + 삭제 1 + 토큰 2), 리스 검증은 6×45+30=300초 < 600초로 통과.
  - **§9.2 문구 갱신**: "선형화 뒤에 붙은 DELETE_TRIGGER는 트리거 없음(cascade)으로 성공"은 이제 **선형화 뒤 창에 새로 생긴 트리거**에만 해당한다. 그 전부터 아이템을 쓰던 트리거는 "쓰는 트리거" 검사가 아이템을 보존하고, 늦게 붙은 삭제 체인의 generation 변경으로 완료가 REQUEUED가 되어 해소 확인 → 트리거 삭제 → 아이템 순서로 끝난다(Problem도 닫힘, `lateChainForExistingTriggerIsOrderedAndClosesProblem`). 남는 창(선형화 ↔ item.delete 사이 새 트리거 생성)은 5b PROVISION 경쟁이며, 그 Problem 잔존은 `triggerCreatedAfterLinearizationIsCascaded`가 명시 고정한다 → **5b 배포 게이트**(§11.4-1·2를 이 문장으로 대체).
- 🔴2 트리거 명령 식별 = (ruleUid, scopeUid, kind) **셋 다 필수**(`TriggerIdentity`가 셋 다 non-null 강제). 명령에 없으면: RCONF는 살아 있는 바인딩(`zbx_triggerid` = 그 id)이 모든 id에 대해 하나의 일치하는 식별을 줄 때만 복원, DELETE_TRIGGER는 살아 있는 바인딩이 모든 id를 가리키면 보존 완료(쓰이는 트리거), 아니면 둘 다 `UNIDENTIFIED` DEAD. 완전 식별 DELETE_TRIGGER도 살아 있는 바인딩이 가리키는 트리거는 지우지 않는다. 일반 해소 확인 적재(`enqueueResolve`)는 이제 종류까지 싣는다.
- 🔴3 `UNIDENTIFIED` 정체: 운영 가이드 D2 비영행 = **배포 차단, 수동 정리**. 배포 뒤 안전 경로 `ApmZbxCommandStore.acknowledgeUnidentified(id, 메모)`(DEAD+UNIDENTIFIED만 · 행 삭제로 후속 edge 해소 · `[AUDIT]` WARN). 명령 장부 관리 API가 없어 노출은 단위 8로(현재 Store 메서드 + IT). V53 큐는 배포 전에 비우도록 가이드에 추가.
- 🟡 `recheckConfirm` generation CAS · 키 보충된 DEAD 이관 아이템 PENDING 부활 · drain이 풀 포화 시 호출 스레드에서 직접 돌지 않음(PENDING 유지).
### 11.6 사용자 결정 반영 — DELETE_ITEM은 아이템을 지우지 않는다 (2026-10-12)
- 코덱스 3차 🔴1(최종 확인 뒤 생긴 외부 트리거를 item.delete가 cascade 삭제) → 사용자 선택 **② 자동 item.delete 중단**. 관리자 정리 API·화면은 만들지 않고 운영 가이드(`guides/ops_apm-alert-item-cleanup.md`)만 제공.
- DELETE_ITEM의 마지막 단계 = `item.update status=1` + 태그 `apm_gc=pending`·`apm_gc_since=<UTC ISO-8601>`(owner·apm_* 태그 규약). `item.update`의 tags는 전체 교체라 기존 태그를 그대로 싣는다. 이미 비활성+표시면 호출 없이 완료(멱등), 아이템 없음=완료. 참조 검사·쓰는 트리거 검사·선형화·id 화해·정확 식별은 그대로. 명령 이름(DELETE_ITEM)은 V79 CHECK·장부 호환 때문에 유지.
- `maxZabbixCalls` DELETE_ITEM = 6(조회 2 + 쓰는 트리거 1 + 비활성화 1 + 토큰 2, 한 실행에 비활성화 1건 — 같은 키 아이템은 호스트에 하나라 정상은 1건, 넘치면 즉시 다음 실행). 리스 검증 6×45+30=300초 < 600초.
- 의미 변경: 테스트·운영에서 "아이템 잔해 0" = "살아 있는 우리 아이템 0(정리 대상은 비활성+표시로 남음)". 메모리 Zabbix의 `hasItem`/`ownedObjects`가 이 정의를 따른다.
- §11.5의 5b 게이트 "선형화 뒤 새 트리거 Problem 잔존"은 **해소** — 비활성화는 트리거를 지우지 않으므로 늦은 삭제 체인이 해소 확인 → 트리거 삭제로 Problem을 닫는다(`ourTriggerCreatedAfterLinearizationSurvivesAndIsCleaned`). 외부 트리거는 보존(`externalTriggerCreatedJustBeforeCleanupSurvives`).
- 🔴 **5b 요구사항(이번 미구현, 배포 게이트)**: PROVISION(및 현행 `ZabbixAlertBridge.ensureItem`)이 같은 키의 우리 아이템을 찾았는데 비활성 + `apm_gc=pending`이면 **재활성화(status=0) + `apm_gc`·`apm_gc_since` 태그 제거** 후 재사용해야 한다. 지금 코드는 그런 아이템을 그대로 재사용하므로, 규칙을 지웠다가 같은 (종류, 대상)으로 다시 만들면 push가 비활성 아이템으로 가 알람이 울리지 않는다 — 5b 전 단독 배포 금지 근거에 추가. IT: 정리 대상 아이템이 있는 상태에서 같은 규칙 재생성 → 아이템 활성·표시 제거·값 수신.
- 운영 가이드 링크: `ops_v79-predeploy-diagnostics.md` → `ops_apm-alert-item-cleanup.md`.
### 11.7 코덱스 5a-2 4차 반려 반영 — 태그 무변경 비활성화 (2026-10-12)
- 🔴 tag lost update: 자동 경로는 `item.update {itemid, status:1}`만 보낸다(태그 미전송). 근거: Zabbix 7.0 `item.update` 문서 "Only the passed properties will be updated, all others will remain unchanged." — §11.6의 `apm_gc`·`apm_gc_since` 태그 표시는 **폐기**.
- 정리 대상 판별 = **우리 가상 호스트 + owner 태그 + status=disabled + 살아 있는 바인딩이 참조하지 않음**(+ 그 아이템을 쓰는 트리거 0건). 코드 확인: APM 코드에서 우리 아이템을 비활성화하는 경로는 DELETE_ITEM뿐(규칙 끄기·고아 정리는 트리거 status만 바꾸고 아이템은 끄지 않는다 — `ZabbixAlertBridge.setTriggersEnabled` 주석·구현). 다른 비활성화는 사람(Zabbix 화면·MovesEye Zabbix 관리 화면 `ZabbixItemManageService`)뿐이라, "살아 있는 바인딩 참조 없음" 조건이 구분한다. 비활성 시각은 마이그레이션 없이 둘 곳이 없어 쓰지 않는다 — 운영 가이드 기준을 "시각"에서 "참조 없음 확인 + 삭제 직전 재조회"로 바꿨다. V80 미사용.
- 멱등: 이미 비활성이면 호출 없이 완료.
- 잔여(허용 범위): 조회와 `item.update` 사이에 owner 태그가 사람 손으로 지워지면 그 아이템도 비활성화된다(Zabbix에 조건부 갱신이 없어, 막으려면 직전 재조회 RPC가 필요하고 그래도 RPC 사이 창은 남는다). 태그는 되살리지 않고, 비활성화는 되돌릴 수 있으며 삭제는 하지 않는다 — `ownerTagRemovedBeforeDisableIsNotRestored`가 고정.
- 🔴 **5b 요구사항 갱신(§11.6 대체, 배포 게이트)**: PROVISION·현행 `ensureItem`이 같은 키의 우리 아이템(owner 태그)을 찾았는데 **status=1(비활성)**이면 **status=0으로 재활성화**(역시 태그 미전송) 후 재사용. 사람이 일부러 끈 아이템을 다시 켜는 셈이지만, 바인딩이 그 아이템을 쓰겠다는 의사가 우선이다(운영 가이드에 "MovesEye가 다시 쓰면 다시 켠다" 명시). IT: 정리 대상 아이템이 있는 상태에서 같은 규칙 재생성 → 활성·값 수신·태그 무변경.

## 12. 5b 결과 (2026-10-12) — PROVISION·STAT·RPUSH 실행기 + 화면 쓰기 facade + item-family 게이트 (미커밋, 검수 전)
### 12.1 실행기
- **PROVISION**(`ApmZbxProvisionExecutor`, 호출 상한 **10** = 토큰 2 + 호스트 4 + 아이템 2 + 트리거 2, 12→10으로 낮춤): 실행 시점 DB 재조회(바인딩·규칙·대상 — 대상은 상태 무관 `rule.ApmAlertBindingScopes`, 원하는 status = 규칙 켜짐 ∧ 고아 아님) → U4 라이선스 없으면 **DEFERRED**(새 결과 종류 — 시도 원복, 5분) → 같은 키의 **선형화된** DELETE_ITEM이 있으면 DEFERRED(5초) → 호스트 → 아이템(🔴 비활성 우리 아이템은 `item.update {itemid, status:0}` 태그 미전송으로 재활성화, §11.7 게이트) → **기록 ①**(바인딩 FOR UPDATE, item id만) → 트리거(정확 식별 태그 조회 1회, 없으면 원하는 status로 생성, enforce면 표현식·이름·심각도·status 덮기) → **기록 ②**(`markProvisioned`는 강제·생성·재활성화·id 변경일 때만 — A1/A2 원칙 유지). 기록 ①·② 시점에 바인딩이 없으면 **보상**(정확 식별 DELT + 키 DELI) 적재. `ZABBIX_OBJECT_NOT_OWNED` = DEAD, 그 밖은 재시도. 오류는 **명령 행이 정본**(바인딩 error 미기록, §8.7).
- **SET_TRIGGER_STATUS**(`ApmZbxTriggerStatusExecutor`, 상한 4): 원하는 상태를 DB에서 재조회 → 🔴 **재조회 뒤** 라이선스 판정(U4 — enable만 막음, disable은 무관) → 정확 식별 **태그 조회 1회**(id 경로 생략 — 상한 유지) → update 1회. 0건=완료(PROVISION이 원하는 status로 만든다). 성공 시 옛 표식 해제.
- **RESOLVE_PUSH**(`ApmZbxResolvePushExecutor`, 상한 3, 12/4→3): 공유 아이템(다른 활성·비고아 소비자)이면 생략. soft(끄기·고아)=1회 시도 후 완료, hard(켜기)=전송 실패면 재시도, 🔴 **"없음"(아이템 없음·꺼짐)이면 완료** — 재시도하면 뒤의 PROVISION이 영원히 막힌다(교착).
- 브리지 저수준 연산 추가(트랜잭션 가드): `commandHost`·`provisionItem`·`provisionTrigger`·`setTriggerStatus`·`pushResolveValue`. 옛 `setTriggersEnabled`·`setTriggerEnabled`·`pushUnmeasurable` 삭제(호출처 0). `retryPendingTriggerStatus`는 평가·대조 시작부에 남김(V80 뒤 대상 0, 6a·6b에서 제거).
### 12.2 🔴 5b 게이트 — item-family(설계 §11.4~§11.7 이관)
- **새 바인딩 예약이 item-family 선형화에 참여**: `ZabbixAlertBridge.reserveBinding`(규칙 화면·평가·1초 장부·대조 공통 예약 입구)이 INSERT **뒤** `ApmZbxCommandStore.joinItemFamily(host,key)`로 같은 키의 family advisory(= DELETE_ITEM 선형화와 같은 키·네임스페이스)를 커밋까지 쥔다. INSERT 뒤인 이유: 먼저 잡으면 "family 보유 → 서비스 KEY SHARE 대기" 대 "서비스 삭제(서비스 보유) → 같은 키 DELI 적재의 family 대기"로 교착.
- **DELETE_ITEM 선형화가 family 잠금 안에서 참조를 재조회**(`markLinearized(c, itemFamily, stillReferenced)` → 새 결과 `REFERENCED` = 보존 완료). 예약이 먼저 커밋 → 선형화가 본다. 선형화가 먼저 → 예약이 "선형화된 정리 있음"을 보고 그 바인딩의 PROVISION을 적재(규칙 화면 경로는 원래 적재) → PROVISION은 정리가 끝날 때까지 DEFERRED → 비활성 아이템을 다시 켠다.
- 기존 바인딩은 참여하지 않는다(이미 참조로 보인다).
- §11.4/§11.5 단언 뒤집기: 해당 단언(`lateEdgeAfterLinearizationSucceedsWithTriggerGone`의 isOpen=true, `triggerCreatedAfterLinearizationIsCascaded`)은 5a-2 4·5차에서 이미 `ourTriggerCreatedAfterLinearizationSurvivesAndIsCleaned`(Problem 닫힘)로 바뀌어 남은 "잔존 고정" 단언 없음 — 확인만.
### 12.3 화면 쓰기·고아(§2.5)
- 생성·임계 수정·resync OURS/THEIRS = 바인딩 예약 + PROVISION(enforce) 적재, 끄기 = 이벤트 해소 + 바인딩마다 **해소 그룹** RPUSH(soft) → STAT → RCONF(cutoff 지금), 켜기 = 해소 확인 취소(🔴 삭제 체인 확인 `beforeDelete`는 취소 안 함) + RPUSH(hard) → STAT, **RPUSH(hard) → PROVISION(enforce)** edge(아래 결정). 트랜잭션 안 Zabbix 0.
- 고아 판정 = `markOrphaned` + 해소 그룹, 복귀 = `clearOrphan` + RPUSH·RCONF 취소 + STAT 단독. 판정 트랜잭션에 함께 적재, 커밋 뒤 깨우기(평가 분할 자체는 6a).
- `ApmAlertRuleWriteFacade`(트랜잭션 없음): 쓰기 커밋 → 그 규칙 바인딩 lane의 대기 명령(RCONF 포함)을 `worker.runNow(ids, 3초)` → 읽기 전용 재조회. 3초 초과·풀 포화 = **QUEUED**(cancel 금지 — 백그라운드 계속), 포화면 `rejected=true` + 깨우기. resync THEIRS의 Zabbix 읽기는 커밋 전·트랜잭션 밖(`readTheirThreshold`). SLO 경로는 facade 없이 커밋 뒤 깨우기.
- 대조(02:00)는 PROVISION 대기 바인딩을 건너뛴다(드리프트·재생성 없음, §3.3).
### 12.4 계약(추가만, FE는 단위 8) — `features/apm/alerts/contract_apm-alert-zabbix-apply.md`
- `ApmAlertBindingSummaryDto.queued`·`commandFailed`(우선순위 missing(명령 DEAD 포함) > drift > queued > pendingCache > synced, 불변식 total = synced+pendingCache+drift+missing+queued), `error`는 바인딩 고유 사유 없으면 명령 last_error.
- `ApmAlertRuleDto.zabbixApply{state APPLIED|QUEUED|FAILED, pendingCommands, rejected}` — 쓰기 응답에만.
- `ApmAlertZabbixStatusDto.bindingQueued`·`commands{pending,processing,dead,oldestDueLagSec}`, SLO `burnAlert.zabbixSyncing`.
### 12.5 V80
`V80__apm_trigger_status_pending_to_command.sql` — `error LIKE 'TRIGGER_STATUS_PENDING%'` 바인딩마다 `STAT:b{id}` 명령(정규 바인딩 lane, 대상 uid 없으면 `m:b:{id}`, 원문은 last_error, 기존 행이면 병합·DEAD 부활) + 바인딩 error NULL. 멱등. V79 무수정.
### 12.6 결정(설계 대비)
1. **PROVISION rank 0 → 1, 허용 edge `RESOLVE_PUSH → PROVISION` 추가** — §2.5(켜기 = STAT + PROVISION(enforce))와 §8.3(켜기 = RPUSH(hard) → STAT)을 합치면 enforce PROVISION이 status를 켜며 -1 정렬을 앞지를 수 있다(R1). 켜기의 기존 바인딩은 RPUSH → PROVISION edge로 묶는다. ⚠️ 새 대상(바인딩 없음)은 RPUSH가 없어 공유·재활성 아이템의 옛 양수로 즉시 발화할 수 있다(잔여, 6a PUSH_CURRENT와 함께 재검토).
2. 기록 ②와 명령 완료 CAS는 **같은 트랜잭션이 아니다**(§2.10과 다름) — 워커가 완료를 별도 트랜잭션에서 기록. 사이에서 멈추면 재실행이 같은 객체를 찾아 ②를 다시 쓴다(멱등, at-least-once).
3. PROVISION 비 enforce 경로는 기존 트리거의 옛 이름 정렬(`alignLegacyDescription`)을 하지 않는다 — 평가 레거시 경로가 계속 한다(6a에서 이관 여부 결정).
4. U3 구조화 필드(`decisionCommitted`·`failedPhase`·`commandsPending`)는 평가 잡 판정이라 **6a 범위**로 남김.
5. 화면 쓰기 응답 요약(`summarize`)은 규칙마다 명령 집계 질의 1회(목록 N+1) — 규칙 수 규모라 허용, 필요 시 일괄 조회로.
### 12.7 검증
- 신규: `ApmZbxProvisionIT` 13 · `ApmZbxStatusCommandIT` 10 · `ApmAlertRuleWritePathIT` 10 · `V80MigrationIT` 2 · `ApmZbxWriteSingleEntryTest`(ArchUnit) 2, 단위 테스트 갱신(Bridge 50·CleanupService 7·Sweeper 10·AlertService 51·Mvc 8·Properties 5·Sync 11).
- 기존 회귀(클래스별 단독, 격리 DB 5434, `-Dit.db.required=true`): ExecutionIT 30·DeletePathIT 8·StoreIT 43·V79 8·RaceIT 24·LockOrderIT 1·EvaluationIT 14·EventHistoryIT 19·NotificationIT 18·DispatchIT 47·EventStoreIT 6·EventSearchIT 6·JobTest 10·RetryTest 8·StuckMonitorTest 16·TransitionSingleEntry 4·ContractFixture 36·SloServiceTest 26·ServiceDetailAlertRules 2·LicenseArchitectureTest 9 전부 통과. `premium.apm.*` 전체 회귀는 병합 직전(결정대로) 미실행.
- RaceIT `ruleUpdatePausedInZabbixIoThenServiceDelete`는 §4.7대로 "PROVISION 실행기 Zabbix I/O 중 정지 → 서비스 삭제가 기다리지 않음 → 재개 → 기록 ① 보상"으로, LockOrderIT 멈춤 지점은 "바인딩 예약(+family 잠금) 뒤·커밋 전"으로 바꿈.
- 뮤테이션 11종 전부 대응 테스트 실패: 재활성화 제거(3건)·STAT 라이선스 재판정 제거·예약 family 참여 제거(2건)·선형화 참조 재조회 제거(2건)·기록 ① 제거·보상 제거·STAT DB 재조회 제거(want=true, 5건)·facade cancel(true)·해소 그룹 edge 제거·R1 edge(RPUSH→PROVISION) 제거·CRUD 트랜잭션 안 Zabbix 호출.
### 12.8 코덱스 5b 1차 반려 반영 (2026-10-12, `_archive/features/apm/alerts/review_apm-alert-unit5b-20261012_codex.md`)
- 🔴1 **캐시된 호스트 소유권** — 명령 실행기의 `commandHost`는 캐시를 **읽지 않고 매번** `host.get`으로 존재·owner 태그를 확인한다(확인 성공 시 캐시 갱신, 실패 시 비움). 선택 근거: (안전) "하위 호출 실패 시 무효화"는 owner 태그만 지워진 경우를 못 막는다 — 남의 호스트가 된 id로 `item.get`은 빈 결과, `item.create`는 **성공**해 고객 호스트를 오염시키고 실패가 나지 않으니 무효화도 안 된다. (비용) PROVISION 1회당 `host.get` 1회, 드문 명령이고 호출 상한 10에 이미 포함. 평가 레거시 경로(5분·대상 수만큼)는 캐시를 쓰고 실패 시 비우는 옛 동작 유지(`provision()` catch 그대로) + `provisionItem` 실패 시에도 캐시 비움. 테스트: 캐시 적재→태그 제거(DEAD·쓰기 0·캐시 비움), 캐시 적재→호스트 삭제(재생성으로 수렴, 정체 0).
- 🔴2 **실행 중 명령 취소** — `Store.cancel`·`cancelResolveConfirms`는 PROCESSING 행을 **지우지 않고** `target.cancelled=true` + `generation+1`만 남긴다(PENDING·DEAD는 그대로 삭제). 행이 lane(partial UNIQUE)과 edge를 계속 쥐므로 고아 복귀의 STAT(on) 등 후속은 진행 중인 외부 호출(-1 push)이 끝난 **뒤에만** 돈다. 완료 기록은 REQUEUED, 재claim 시 워커가 표식을 보고 실행기 없이 완료(행 삭제 → edge 해소). 같은 dedup 재적재(새 의사)는 병합에서 표식을 지운다. RESOLVE_PUSH는 push 직전 리스 갱신(이른 차단)도 추가 — 단 그 직후의 취소는 위 표식이 막는다. 5a-2 RCONF 취소 경로도 같은 문제(물리 삭제)라 같은 규칙으로 바꿨다(진행 중 닫기 요청은 cutoff 이전 Problem만이라 무해했지만 lane 순서를 지키게). ⚠️ 평가 레거시의 직접 push(트랜잭션 안 `pushAll`)는 lane 밖이라 진행 중 -1과의 순서는 6a PUSH_CURRENT가 보장해야 한다(아래 이관).
- 🟡 facade 완료 판정 = 실행 대상과 같은 집합(binding 명령 ∪ 같은 lane의 RCONF). RCONF만 남으면 QUEUED(`pendingCommands`), 바인딩 `queued`는 binding 명령 기준 그대로.
- 🟡 정확 소유 식별 트리거 중복: STAT은 원하는 상태와 다른 것만 한 번에 하나씩(호출 상한 4) 바꾸고 남으면 즉시 재실행, PROVISION(enforce)은 우리 정의와 다른 것만 한 실행 최대 4개(`TRIGGER_ENFORCE_BATCH`, 상한 10의 남은 몫) 덮고 남으면 재실행. 남의 트리거는 정확 식별에서 빠진다.
- 🟡 규칙 목록·서비스별 목록의 명령 요약 = 목록 전체 바인딩 명령 상태 질의 1회 후 map 전달(단건 EP는 규칙 몫 1회).
- 🟡 테스트 추가: 기록 ② 뒤·완료 전 리스 만료 재claim 수렴, V80 수집기 축('collector')·SLO(slo_uid)·대상 uid 불명 fallback(`m:b:{id}`, FK 끈 세션으로 재현).
- 검증(클래스별 단독, 5434, `-Dit.db.required=true`): ProvisionIT 17·StatusCommandIT 13·WritePathIT 11·V80 3·StoreIT 43·ExecutionIT 30·DeletePathIT 8·RaceIT 24·LockOrderIT 1·EvaluationIT 14·EventHistoryIT 19·BridgeTest 50·CleanupServiceTest 7·AlertServiceTest 52·SweeperTest 10·WorkerTest 7·Mvc 8·ArchUnit 2 전부 통과. 뮤테이션 9종 전부 대응 테스트 실패: 실행기 호스트 캐시 신뢰·취소=물리 삭제·워커의 표식 무시·병합의 표식 유지·facade RCONF 제외·STAT 첫 번째만·PROVISION 첫 번째만·목록 N+1. (`provisionItem` 실패 시 캐시 비움은 레거시 경로 보조라 단독 뮤테이션으로는 잡히지 않는다 — 실행기 경로는 사전 확인이 막는다.)
- 누적 diff `scratchpad/alert-5b-r2.diff`.

### 12.9 이관 — 🔴 모두 "합본 배포 전 필수"
- **6a**: 신규·비활성(재활성화) 아이템의 옛 양수 값 대응 — `트리거 disabled 확보 → 현재값 push(PUSH_CURRENT) → STAT(on)` 순서 보장(단순 "PROVISION 후 PUSH_CURRENT"는 부족) · 평가 트랜잭션 안 Zabbix 호출 제거(`ensureProvisioned`·`pushAll`·`retryPendingTriggerStatus`) — 이로써 진행 중 -1과 현재값 push의 lane 순서도 보장 · U3 구조화 필드(`decisionCommitted`·`failedPhase`·`commandsPending`) · 비enforce PROVISION 뒤 트리거 옛 이름 정렬 책임 인수.
- **7**: 1초 stuck ledger의 트랜잭션 안 `ensureProvisioned`·`pushAll` 제거.
- **6b**: `zabbixStatus()`의 읽기 전용 트랜잭션 안 Zabbix 조회 분리 · 02:00 대조의 외부 호출 분리(바인딩 부재·레거시 경로 포함 명령화) · ArchUnit 범위 확대(읽기·레거시 호출까지).
- **8**: 독자 알림 창구 — 사용자 결정대로 대기.

### 12.10 코덱스 5b 2차 반려 반영 (2026-10-12, `_archive/features/apm/alerts/review_apm-alert-unit5b-20261012_codex2.md`)
- 🔴 **RESOLVE_PUSH push 직전 읽기 전용 소유 확인** — `ZabbixAlertBridge.checkResolvePushTarget`(RPC 2: `host.get` 이름+owner 태그, `item.get` 그 호스트·정확 키+owner 태그+status) → `OURS | MISSING | FOREIGN`.
  - FOREIGN(호스트 owner 없음 · 같은 키 아이템 owner 없음 — 태그 제거·남의 아이템으로 교체 포함): **hard(켜기)=DEAD**(`ZABBIX_OBJECT_NOT_OWNED:` — edge로 뒤의 STAT(on)·PROVISION을 막는다, 사람이 충돌을 풀고 retry-dead·재적재), **soft(끄기·고아)=밀지 않고 완료 + WARN**. soft를 DEAD로 하지 않은 근거: soft 뒤의 STAT(트리거 내리기 — 우리 트리거는 정확 식별로 따로 확인)·RCONF(열린 Problem 닫기)는 정리 의무라, 남의 아이템 충돌에 묶어 멈추면 "껐는데 계속 울린다"가 된다. -1 생략의 손실은 회복 이벤트 하나이고 RCONF가 Problem을 직접 닫는다.
  - MISSING(호스트·아이템 없음 · 아이템 꺼짐)=지금처럼 완료(PROVISION이 만들거나 다시 켠다 — 막으면 교착).
  - 아이템 id는 식별이 아니다(재생성·사람 재작성으로 바뀐다) — 다른 실행기와 같은 식별(우리 호스트 owner + 정확 키 + 아이템 owner, §8.6).
  - 호출 상한 RESOLVE_PUSH 3 → **5**(토큰 2 + 확인 2 + push 1), 리스 검증 5×45+30=255초 < 600초. 가장 긴 경로 실측 = 5(`callCountsFitDeclaredMaximum`), 상한 값은 `ApmZbxCommandPropertiesTest`가 고정.
  - 테스트: owner 태그 제거 · 같은 키 남의 아이템 교체 · 호스트 소유 상실 × hard/soft = 6건(hard는 DEAD + 뒤 STAT PENDING, soft는 완료, 모두 push 0). 뮤테이션 3종(확인 전체 제거 → 6건+호출 수 실패, 아이템 owner 확인 제거 → 4건, 호스트 owner 확인 제거 → 2건) 전부 잡힘.
- 🟡1 **PROVISION·트리거 수렴의 외부 TOCTOU — 쓰기 직전 재확인은 넣지 않고 잔여 위험을 수용한다**(4차에서 근거 문구 정정). 근거는 **완전 제거 불가와 비용**이다: (1) **Zabbix API에는 조건부 update(CAS·if-match)가 없다** — 소유·태그를 조건으로 거는 쓰기 수단이 없어, 재확인을 넣어도 "재확인 ↔ 쓰기" 사이 창은 원리적으로 남는다. (2) 비용: 쓰기마다 확인 RPC가 붙으면 PROVISION 상한이 10 → 최대 15가 되고 리스 검증(15×45+30=705초)이 기본 600초를 넘어 lease 상향이 필요하다. ⚠️ 창의 길이는 경로마다 다르다 — 아이템 재활성화는 같은 `item.get` 결과 바로 다음 RPC지만, **중복 트리거 수렴은 `trigger.get` 한 번 뒤 `trigger.update`를 최대 4번 연속**하므로 뒤쪽 대상일수록 판정이 여러 RPC만큼 오래된다(3차에서 쓴 "RPC 하나 사이"는 이 경로에 틀린 표현이었다). 남는 위험은 그 창 안에서 사람이 owner 태그를 지우는 경우이고, 그때도 우리 쓰기는 태그를 건드리지 않아 되돌릴 수 있다(5a-2 §11.7과 같은 허용 범위). RESOLVE_PUSH·STAT만 확인을 새로 넣은 이유는 그쪽은 "확인 자체가 없었다"(🔴)이지 창 축소가 아니기 때문이다.
- 🟡3 `ApmAlertRuleController` 클래스 주석을 실제 동작(커밋 후 워커 풀·최대 3초·QUEUED·삭제는 깨우기만)으로 수정.
- 검증: StatusCommandIT 19 · WritePathIT 11 · PropertiesTest 5 · ArchUnit 2 · Mvc 8 통과(클래스별, 5434, `-Dit.db.required=true`). 누적 diff `scratchpad/alert-5b-r3.diff`.

### 12.11 이관 추가 — 단위 8(🔴 합본 배포 전 필수)
- **`ZABBIX_OBJECT_NOT_OWNED` DEAD의 운영자 회복 창구**: ⚠️ (4차 정정 — §12.13) 규칙 수정·resync는 `PROV:b{id}`만 재적재해 DEAD hard RPUSH를 되살리지 못하고, `retryDead()`는 production 호출처가 없다 — 지금은 운영 회복 경로가 없다. 일시적 태그 누락까지 DEAD로 확정될 수 있으므로, 단위 8의 명령 장부 상태 API·화면에 (a) DEAD 명령 목록(사유·대상), (b) 개별 retry-dead, (c) 규칙별 resync 진입을 노출한다(설계 §2.8 `retry-dead`, §11.5 `acknowledgeUnidentified`와 같은 창구).

### 12.12 코덱스 5b 3차 반려 반영 (2026-10-12, `_archive/features/apm/alerts/review_apm-alert-unit5b-20261012_codex3.md`)
- 🔴 **hard RPUSH의 공유 생략이 소유 확인을 우회** — 고쳤다. 판정 순서:
  - **hard(켜기)**: 소유 확인 → `FOREIGN` = DEAD(뒤의 STAT(on)·PROVISION을 edge로 막는다) · `MISSING` = 완료 · `OURS`일 때만 "아이템 id 없음·공유 소비자" 생략 = 완료 → 그 밖은 push. hard의 완료는 뒤 명령의 edge를 푸는 행위라, 남의 객체인 채 "공유라서 생략 = 완료"로 끝나면 남의 아이템을 읽는 우리 트리거가 켜졌다.
  - **soft(끄기·고아)**: 순서 유지 — "id 없음·공유 = 완료" → 소유 확인 → push. 판단: soft의 이른 완료는 **외부 쓰기를 하지 않는** 생략이라 남의 객체 위험이 없고, 뒤의 STAT(off)·RCONF는 정리 의무라 풀리는 것이 맞다(확인 RPC도 아낀다).
  - 테스트: hard + 공유 소비자 + foreign 3종(owner 태그 제거·남의 아이템 교체·호스트 소유 상실) → RPUSH DEAD, STAT·PROVISION 모두 PENDING, Zabbix 쓰기 0. hard + 공유 + 우리 객체 → 생략 완료·STAT(on) 실행. 뮤테이션(hard도 생략을 먼저) → 3건 실패.
- 🔴(검토 요청) **STAT의 호스트 소유 미확인 — 위험으로 판단해 넣었다.** 트리거 정확 식별은 호스트 *이름*·트리거 owner·규칙/대상/종류 태그만 보고 호스트 owner는 안 본다. 사람이 우리 가상 호스트를 가져가(owner 태그 제거) 자기 감시에 쓰는 경우, 그 위 트리거를 켜는 것은 남의 호스트 감시를 바꾸는 쓰기다. `ZabbixAlertBridge.commandHostState`(host.get 1, 캐시 안 씀)를 트리거 조회 전에 본다: `MISSING` = 완료(트리거도 없다) · `FOREIGN` = 켜기 DEAD(`ZABBIX_OBJECT_NOT_OWNED`) / 끄기 쓰지 않고 완료+WARN(정리 의무를 묶지 않는다). 호출 상한 SET_TRIGGER_STATUS 4 → **5**, 리스 5×45+30=255초 < 600초(`ApmZbxCommandPropertiesTest`), 가장 긴 경로 실측 5(`callCountsFitDeclaredMaximum`). 테스트 `statRefusesForeignHost`, 뮤테이션(호스트 확인 제거) → 실패.
- 🟡 §12.10 TOCTOU 근거 문구 정정(위).
- 검증: StatusCommandIT 24 · PropertiesTest 5 · WritePathIT 11 · ProvisionIT 17 · ArchUnit 2 통과(클래스별, 5434, `-Dit.db.required=true`). 누적 diff `scratchpad/alert-5b-r4.diff`.

### 12.13 §12.11 보강 — DEAD 회복 창구(단위 8, 🔴 합본 배포 전 필수)
- **지금 실제로 일어나는 일(코드 확인)**:
  - 규칙 **수정·resync OURS·THEIRS**는 `PROV:b{id}`만 재적재한다(`ApmAlertService.provisionTargets`). 병합으로 DEAD였던 PROVISION은 PENDING으로 살아나지만, **DEAD 상태의 `RPUSH:b{id}`(hard)는 되살아나지 않는다** — 그 RPUSH가 PROVISION·STAT의 선행이라 둘 다 계속 PENDING(차단)이다. 즉 resync를 해도 아무 Zabbix 쓰기가 일어나지 않고 화면은 `queued`로 남는다.
  - 규칙을 **껐다 켜면**: 끄기가 `RPUSH:b{id}`를 soft로 재적재(병합 — DEAD 부활, target `hard=false`로 덮임) → soft는 FOREIGN이면 쓰지 않고 완료 → 막혀 있던 STAT·PROVISION이 풀려 돈다(PROVISION은 소유 확인에서 다시 DEAD). 다시 켜면 hard RPUSH가 새로 적재돼 충돌이 그대로면 다시 DEAD. 회복 수단이 아니다.
  - `ApmZbxCommandStore.retryDead()`(전체 DEAD 부활)는 **production 호출처가 없다**(관리 API·화면 없음). `acknowledgeUnidentified`도 마찬가지(테스트만).
- **따라서 회복 창구는 "resync·재적재"에 기대면 안 된다.** 단위 8에서 명령 장부 상태 API·화면에: (a) DEAD 명령 목록(사유 원문·대상 lane·막고 있는 후속 명령 `blockedBy`), (b) **개별 retry-dead**(그 행을 PENDING으로 — hard RPUSH면 다시 소유 확인부터), (c) 규칙별 resync 진입은 보조.
- **운영자 절차(필요하다고 판단)**: hard RPUSH·STAT(on)·PROVISION이 `ZABBIX_OBJECT_NOT_OWNED`로 DEAD면 ① Zabbix에서 충돌을 푼다(남의 호스트·아이템 이름/키를 바꾸거나 우리 것이면 owner 태그 복구) ② 그 DEAD 행을 개별 retry-dead → RPUSH가 OURS로 확인되면 push 후 완료, 막혀 있던 STAT·PROVISION이 이어서 돈다. 충돌을 풀 수 없으면(고객이 그 이름을 계속 쓴다) 규칙을 끄거나 지운다(끄기 = soft로 정리만, 지우기 = 삭제 체인). 단위 8 전까지는 운영 가이드의 SQL(해당 행 `status='PENDING', attempts=0, next_attempt_at=localtimestamp`)로 대신한다 — 가이드 보강 필요.

## 13. 6a 결과 (2026-10-12) — 5분 평가 분할 + PUSH_CURRENT + 옛 값 재발화 순서 (미커밋, 검수 전)
### 13.1 구조
- `ApmAlertEvaluationService.evaluateAll` = **트랜잭션 없음 단언**(있으면 `IllegalStateException`) → 판정 `decide()`(자기 `TransactionTemplate`, REQUIRES_NEW, Zabbix 0) → 커밋 → `runZabbixPhase()`(트랜잭션 밖). `@Transactional` 제거.
- **판정**: 부모 선잠금 → 활성 규칙 → 대상마다 `bridge.reserveBinding`(DB만) → 측정 → 전이(+통지) → 고아/복귀(원하는 상태 + 명령) → **한 묶음** 적재(`ApmZbxCleanupService.enqueueEvaluation`, MANDATORY): 객체 없는 바인딩의 비강제 PROVISION + 이번 값 PUSH_CURRENT. 고아 정리를 **값 적재보다 먼저** — 복귀의 lifecycle 뒤로 값이 fence된다(반대면 supersede로 값이 지워진다).
- **Zabbix 단계**(`evaluate/ApmAlertZabbixPhase`, 신규): ① 이번 회차 명령(판정 묶음 + 고아 정리 명령 id — `OrphanSweep.commandIds` 추가)을 `ApmZbxCommandWorker.runIds`(신규 — worker-threads 병렬, 최대 `app.apm.alert.zabbix-phase-await-ms` 기본 60초, cancel 금지)로 실행 + **후속 바퀴**(실행기가 이어 적재한 지금 도래 명령, 최대 4바퀴 — `Store.dueIdsForBindings`) ② 값 push 3갈래 집계(존재 확인 **전** — 존재 확인의 PROVISION이 대기·DEAD push를 supersede하면 실패가 "끝남"으로 세진다) ③ **일괄 존재 확인**(`bridge.inventory` RPC 3 + `provisionNeed`) → 빠졌거나 꺼졌거나 옛 이름인 대상에 비강제 PROVISION(자기 짧은 트랜잭션, **PROVISION 행이 이미 있으면 건너뜀 — DEAD를 되살리지 않는다**) + 실행 + 후속 ④ eventid 백필(event.get 트랜잭션 밖, `ApmAlertEventStore.attachZabbixEventIfAbsent` 단건 UPDATE `zbx_eventid IS NULL` — 엔티티 저장이 해소와 덮어쓰기 경쟁하던 것 제거) ⑤ 요약.
- 평가 경로에서 사라진 것: `ensureProvisioned`·`pushAll`·`retryPendingTriggerStatus`(V80 뒤 대상 0). 브리지의 세 메서드는 1초 장부(단위 7)·대조(6b) 레거시로 남김. ArchUnit `evaluationNeverWritesZabbix`(evaluate 패키지, 장부 제외)로 고정.

### 13.2 PUSH_CURRENT 실행기 `ApmZbxPushCurrentExecutor`
- 호출 상한 4 → **5**(토큰 2 + 소유 확인 2 + push 1, RESOLVE_PUSH와 같은 `checkResolvePushTarget`). 리스 5×45+30=255초.
- 순서: DB 재조회(바인딩·규칙 없음 / 규칙 꺼짐 / 고아 → **밀지 않고 완료** — 직전 차단 검사) → U4 라이선스(DEFERRED) → **값 나이 > `app.apm.alert.push-max-age-sec`(기본 600) → 버림**(오래 막힌 옛 값을 늦게 밀면 지난 장애로 Problem) → 소유 확인: FOREIGN = DEAD(`ZABBIX_OBJECT_NOT_OWNED`), MISSING(없음·꺼짐) = 비강제 PROVISION 적재 후 완료(DEAD PROVISION은 되살리지 않음) → push: 성공 = 바인딩 `markCacheReady`/`clearPushError`(바인딩 FOR UPDATE 짧은 트랜잭션), 캐시 유예 2분 안 "없음" = 15초 재확인(`PUSH_CACHE_WAIT:` 사유), 그 밖 = 바인딩 push 오류 배지 + 재시도.
- 순서 보장은 저장소(5a-1)의 fence·supersede·lane이 한다: 진행 중 push ↔ 끄기 = "push → -1"(lane), 진행 중 RPUSH ↔ 이번 값 = 값이 fence 뒤.

### 13.3 🔴 옛 값 재발화 방지 — "-1 정렬 → 켜기 → 현재 값"(동등한 fencing)
| 켜는 경로 | 6a 처리 |
|---|---|
| 규칙 켜기(5b) | 변경 없음 — RPUSH(hard) → STAT·PROVISION(enforce) |
| **고아 복귀** | `enqueueRestore`: RCONF 취소 + **RPUSH(hard) → STAT**(5b의 "RPUSH 취소 + STAT 단독" 대체). 대기 중 soft RPUSH는 병합돼 hard, 실행 중이면 generation으로 다시 돈다. 이번 값은 그 뒤 fence |
| **새 트리거(이력 있는 아이템)** | PROVISION이 `hold = 원하는 켜짐 ∧ 아이템을 만들지 않았음 ∧ (다시 켰음 ∨ ¬(이 바인딩이 그 아이템에 값을 밀어 왔음 ∨ 다른 활성 소비자))`이면 트리거를 **꺼진 채 생성**(`provisionTrigger(..., createDisabled)`), 기록 ② 트랜잭션에서 RPUSH(hard, -1) → STAT 적재 + 대기 중이던 값(PUSH_CURRENT)을 읽어 **다시 적재**(supersede로 잃지 않게 — `Store.pendingPush`) |
| **다시 켠 아이템 + 캐시 지연** | RPUSH(hard)가 소유 확인 OURS 뒤 push "없음"이면 캐시 지연으로 보고 15초 재확인 최대 9회(약 2분, `RPUSH_CACHE_WAIT:`), 넘기면 예전처럼 완료(교착 방지) |
- §12.9의 "트리거 disabled 확보 → 현재값 push → STAT(on)"을 문자 그대로 하지 않은 근거는 13.5 D1.

### 13.4 U3 구조화 필드·잡 판정
- `EvaluationResult(decision, zabbix)` — 옛 접근자(rules·targets·evaluated·fired·resolved·provisionFailed·push·orphan) 유지 + `decisionCommitted()`·`failedPhase()`(NONE|ZABBIX)·`commandsPending()`. 요약 한 줄: 옛 앞부분 토큰 그대로 + `decisionCommitted=true failedPhase=… commandsPending=… commandsDead=… queued(prov push repair) fenced backfill decisionMs zabbixMs`.
- Zabbix 단계 예외는 결과로 접고(판정은 이미 커밋), 잡이 `"APM 알람 평가 — 판정 커밋 완료(rules targets fired resolved) — Zabbix 단계 실패: … | 요약"`으로 던진다. 판정 예외는 그대로(커밋 없음). "대상 전부 프로비저닝 실패" 판정 유지.
- `provisionFailed` 정의 변경: 이번 대상 중 **객체가 아직 없고**(id null) 그 바인딩의 명령이 **오류 원문을 남겼거나 DEAD**(명령 행이 정본, §8.7). 제한 시간 안에 아직 안 돈 PROVISION은 실패로 세지 않는다.

### 13.5 설계와 다르게 정한 것
- **D1 "disabled → 현재값 → STAT(on)" 대신 "-1 → STAT(on) → 현재값"**: 장부의 허용 edge는 lifecycle → PUSH_CURRENT뿐이고 PUSH는 같은 lane의 lifecycle 전부를 선행으로 잡는다(5a-1 fence) — "push → STAT"은 표현할 수 없다(edge를 새로 열면 fence와 사이클). 효과: Zabbix가 켤 때 판정하면 -1을 보고 무발화, 다음 값(현재값)으로 판정 — 결과가 같다. 켤 때 판정하지 않으면 "disabled 상태에서 민 현재값"은 다음 값까지 판정되지 않아 오히려 5분 늦다. 대가: 아이템 이력에 -1 한 점, 복귀 때 열린 Problem이 남아 있으면 -1이 회복시켰다가 현재값이 재발화(통지 깜빡임 — 13.7).
- **D2 고아 복귀 = RPUSH(hard) → STAT**(5b는 STAT 단독). 6a에서 이번 값이 STAT 뒤로 fence되므로 soft -1 실패·생략 시 옛 양수가 남은 채 먼저 켜진다. 5b 테스트 2건 기대값 수정(`ApmZbxCleanupServiceTest.restoreCancelsConfirmAndQueuesHardPushThenStat`, `ApmZbxStatusCommandIT.restoreDuringInFlightResolvePushKeepsOrder` — -1 두 번, 트리거 확인은 그 뒤).
- **D3 DEAD 비부활**: 판정·존재 확인 모두 DEAD PROVISION을 다시 적재하지 않는다(적재 병합이 DEAD를 되살리므로 매 회차 NOT_OWNED를 다시 돌리게 된다). 예전 평가는 5분마다 재시도했다 — 일시 오류의 PENDING 재시도는 백오프(2분~)로 계속된다. 그 바인딩의 값은 DEAD 뒤에 fence돼 기다린다(회복은 단위 8).
- **D4 호스트 id 캐시 제거**(과제 "신뢰 경로 제거 또는 소유 확인" → 제거): 캐시 필드 자체를 지웠다. 모든 호스트 쓰기 경로가 매번 host.get. 대신 **호스트 생성 JVM 직렬화 + 잠근 뒤 이중 확인**(병렬 첫 프로비저닝에서 host.create 경쟁 실측 — IT에서 둘 중 하나가 "already exists"로 2분 밀림) → PROVISION 호출 상한 10 → **11**(리스 11×45+30=525초 < 600). 설치형 단일 노드 전제, 다중 노드는 재시도로 수렴.
- **D5 옛 이름 정렬 인수**: 비강제 PROVISION의 트리거 단계가 조회 결과 이름이 정확히 우리 옛 형식이면 이름만 update(추가 조회 없음 — 상한 안). 그 PROVISION은 일괄 존재 확인이 `LEGACY_NAME`으로 적재한다. 표현식 드리프트는 그대로.
- **D6 eventid 백필**: 엔티티 `saveAll` → 단건 조건부 UPDATE(`ApmAlertEventStore` — 전이 단일 입구 허용 목록 안).
- **D7** 실행 대기 60초 + 후속 바퀴(설계는 "runNow(이번 회차 명령)"만). 남은 것은 주기 drain.

### 13.6 검증 (클래스별 단독, 격리 DB 5434, `-Dit.db.required=true`, JDK17, 힙 1g init 스크립트)
- 신규: `ApmAlertEvaluationZabbixPhaseIT` 17 · `ApmAlertEvaluationDecisionTest` 10(옛 `ApmAlertEvaluationRetryTest` 8건을 판정 단위로 옮기고 삭제).
- 회귀 통과: EvaluationIT 14 · RaceIT 24(판정을 바깥 트랜잭션에서 멈추는 두 헬퍼를 `decide()` + `runZabbixPhase()`로) · ProvisionIT 17 · StatusCommandIT 26 · WritePathIT 11 · StoreIT 43 · ExecutionIT 30 · DeletePathIT 8 · LockOrderIT 1 · EventHistoryIT 19 · NotificationIT 18 · DispatchIT 47 · BridgeTest 50 · CleanupServiceTest 7 · SweeperTest 10 · WorkerTest 7 · PropertiesTest 5 · ArchUnit 3 · JobTest 11 · SyncServiceTest 11 · AlertServiceTest 52 · Mvc 8 · TransitionSingleEntry 4 · StuckRequestMonitorTest 16 · LicenseArchitectureTest 9. `premium.apm.*` 전체 회귀는 결정대로 미실행.
- 뮤테이션 18종 전부 대응 테스트 실패(원복 확인): @Transactional 재부착(2인자 운영 입구) · 트랜잭션 단언 제거 · 판정+Zabbix 한 트랜잭션 · 선잠금 제거(RaceIT 5건) · 고아 정리를 값 적재 뒤로 · hold 제거(2건) · 자기 공급 판정 제거 · 값 재적재 제거 · RPUSH 캐시 대기 제거 · 복귀 STAT 단독 · push 직전 차단 검사 제거 · push 소유 확인 제거 · 값 나이 제한 제거 · 판정의 DEAD 부활 · 존재 확인의 DEAD 부활 · 옛 이름 정렬 제거 · 존재 확인 제거 · push 집계를 존재 확인 뒤로. 호스트 생성 직렬화 제거는 경쟁이라 결정적 뮤테이션으로 고정하지 못했다.
- 누적 diff `scratchpad/alert-6a.diff`.

### 13.7 이관 — 🔴 합본 배포 전
- **단위 7(1초 장부)**: 장부는 여전히 트랜잭션 안 `ensureProvisioned`·`pushAll`. ⚠️ 6a 영향: (a) 호스트 캐시를 지워 장부 fire/settle마다 트랜잭션 안 host.get 1회가 늘었다(APC-05가 장부 안에서는 조금 나빠짐 — 단위 7에서 사라진다), (b) 장부의 직접 push는 lane 밖이라 STUCK_REQUEST 바인딩의 RPUSH(-1)·PUSH_CURRENT와 순서가 보장되지 않는다 — 단위 7에서 PUSH_CURRENT로 옮길 것.
- **6b(대조)**: `applyOurDefinition`(레거시) — 캐시 제거로 바인딩마다 host.get +1(일 1회). `retryPendingTriggerStatus`는 대조에만 남음(6b에서 제거). 일괄 존재 확인 `bridge.inventory`·`provisionNeed`를 대조의 바인딩 부재 판정에 재사용 가능. ArchUnit `evaluationNeverWritesZabbix`를 sync 패키지로 확장.
- **단위 8**: (a) DEAD PROVISION 뒤에 fence돼 계속 기다리는 PUSH_CURRENT — 바인딩 요약(`commandsByBinding`)은 PUSH를 빼고 세므로 화면에는 PROVISION DEAD로만 보인다(원인은 같다). (b) 평가 요약의 `commandsPending`·`commandsDead`를 상태 API에.
- **실측 필요(dev Zabbix 7.x)**: "트리거를 켜거나 만들 때 마지막 값으로 즉시 판정하는가" — 13.3·D1 전체가 이 보수적 가정 위에 있다. 판정하지 않는다면 hold·복귀 -1은 불필요한 -1 한 점일 뿐(해는 없음).
- **규모(R5·R11 갱신)**: 판정 한 트랜잭션이 대상 수만큼 resource advisory 잠금을 쥐고 명령을 적재한다(PG lock table `max_locks_per_transaction` 공유분) — 대상 1,000+에서 decisionMs·잠금 수 계측 필요. 값 push가 바인딩당 RPC 3(소유 확인 2 + push)으로 예전 일괄 push 1회보다 많다(대신 대상마다 item.get·trigger.get 하던 ensureProvisioned 2N이 존재 확인 3회로 줄었다) — PUSH_CURRENT 일괄 실행은 미착수. 존재 확인 응답 크기(R11) 페이지 미적용.
- **복귀 통지 깜빡임**: 복귀 시점에 그 트리거의 Problem이 아직 열려 있으면(해소 확인 전) -1이 회복 이벤트를 만들고 현재값이 재발화한다.
- 코덱스 5b 4차 🟡2(STAT foreign+off → RCONF 진행·STAT(on) DEAD가 독립 체인을 막지 않음 회귀 테스트)는 6a에서 하지 않았다.
- `app.apm.alert.zabbix-phase-await-ms`(60000)·`app.apm.alert.push-max-age-sec`(600)는 `@Value` 기본값만 있고 `application.yml`에 적지 않았다.

### 13.8 코덱스 6a 1차 반려 반영 (2026-10-13, `_archive/features/apm/alerts/review_apm-alert-unit6a-20261012_codex.md`)
- **🔴1 crash 창(꺼진 채 생성 → 기록 ② 전)** — "-1 → 켜기" 명령을 **트리거에 쓰기 전에** 장부에 커밋한다(`ApmZbxProvisionExecutor.enqueueNeutralizeThenEnable`, 바인딩 FOR UPDATE → 명령, 짧은 트랜잭션). 재실행이 "이번에 만들었나"(`created`)를 몰라도 명령은 이미 있다. 이 PROVISION이 lane을 쥐고 있는 동안(PROCESSING — 리스 만료 뒤 재claim 포함) 두 명령은 돌지 않고, PROVISION이 실패해 PENDING으로 돌아가 먼저 돌아도 안전하다(아래 fail-closed 보류 + STAT은 트리거가 없으면 할 일 없음 + 다음 PROVISION이 같은 dedup으로 다시 적재). 브리지의 찾기·쓰기를 나눴다: `findProvisionItem`·`createProvisionItem`·`reenableItem`, `findExactTriggers`·`writeTrigger`(옛 `provisionItem`·`provisionTrigger` 삭제 — 호출처는 실행기뿐). 테스트 `crashAfterHeldTriggerCreateStillEnables`(대역에 `failAfterNext` — 본문 실행 뒤 예외).
- **🔴2 cacheReady 예외 제거** — 보류 조건에서 "이 바인딩이 값을 밀어 왔다"·"다른 활성 소비자" 생략을 지웠다. 보류 = 원하는 켜짐 ∧ 아이템을 이번에 만들지 않았음 ∧ (트리거 없음 ∨ 아이템 꺼짐 ∨ 강제인데 트리거 전부 꺼짐). 공유 아이템이면 -1 자체는 RESOLVE_PUSH가 건너뛴다(5b 규칙 — 다른 활성 규칙에 거짓 RECOVERY를 내지 않는다; 남는 판단은 아래). `inventoryRecreatesDeletedTrigger`의 "-1 없음" 고정을 "-1 → 켜기"로 바로잡음.
- **🔴3a 꺼진 아이템 + 켜진 기존 트리거** — 순서: 아이템 찾기 → 트리거 찾기 → 보류 명령 커밋 → **켜져 있는 우리 트리거를 먼저 끈다**(비강제여도, 한 실행 최대 3 + 옛 이름 정렬 1) → 남은 게 있으면 아이템을 켜지 않고 즉시 다음 실행 → 다 껐으면 아이템 `status:0`(태그 미전송) → 기록 ②. 켜기는 -1이 들어간 뒤 STAT(on). 테스트 `disabledItemWithEnabledTriggerIsHeldFirst`, 끈 뒤·다시 켜기 전 멈춤 `holdWaitsForItemReenableAfterCrash`.
- **🔴3b fail-open 제거** — 보류 -1(`RESOLVE_PUSH` target `neutralize=true`, `ApmZbxCommandSpec.neutralizePush`)은 **-1이 실제로 들어갈 때까지** 기다린다: 아이템 없음·꺼짐도 재확인(PROVISION이 다시 켜는 중), 캐시 미동기도 재확인. 카운터는 **보류 전용**(`target.confirmRechecks` — `Result.countedRecheck`, `Store.recheckConfirm(c, delay, message)`; claim 시도 수와 섞이지 않는다), 15초 × 20(약 5분)을 넘기면 **DEAD**(`NEUTRALIZE_TIMEOUT:`) — 뒤의 STAT(on)은 풀리지 않고 트리거는 꺼진 채 남는다(운영 상태 = 명령 DEAD, 단위 8 회복 창구). 규칙 켜기·복귀 경로의 hard RPUSH(보류 아님)도 캐시 미동기는 같은 보류 재확인 → DEAD(완료로 넘기지 않음). 아이템 없음·꺼짐은 그 경로에서만 예전처럼 완료(RPUSH → PROVISION edge 교착 방지 — 그 PROVISION이 꺼진 아이템을 보면 위 3a 순서로 자기 보류를 남긴다). 같은 dedup 재적재로 DEAD가 살아날 때·`retryDead()` 때 카운터는 0부터. 테스트 `neutralizeTimeoutIsDeadNotEnable`, `neutralizeCounterIsHoldSpecific`(attempts 40이어도 일찍 포기하지 않음).
- **🟡1** Zabbix 단계 예외 때 이번 회차 명령의 장부 상태(남은·DEAD)는 실제로 센다(`ApmAlertZabbixPhase.ledgerState`), 그 밖의 칸(push 3갈래·provFail·repair·fenced·backfill)은 요약에 `?`(0으로 오해하지 않게). 집계 자체가 실패하면 장부 칸도 `?`.
- **🟡2** 일괄 존재 확인에서 우리 이름의 호스트가 남의 것이면 대상별 PROVISION을 적재하지 않는다 — 경고 로그 + 요약 `hostForeign=true` 한 번(`ZabbixSyncResult.hostForeign`). ⚠️ 값 push는 바인딩마다 소유 확인(RPC 2)으로 DEAD가 되고, 다음 회차 적재 병합이 되살리므로 남의 호스트 상태가 이어지는 동안 회차마다 바인딩 수 × 2 읽기가 남는다(쓰기 0).
- **🟡3** 호스트 생성 직렬화는 JVM 안 최적화일 뿐 HA 직렬화가 아니라고 주석에 명시. 다른 인스턴스·사람과의 생성 경쟁으로 `already exists`면 PROVISION이 2분 백오프 대신 **5초 재확인**(`HOST_RACE_RECHECK`, 추가 RPC 없음 — 호출 상한 11 유지). 테스트 `hostCreateRaceRechecksSoon`.
- **🟡4** `application.yml`에 `app.apm.alert.zabbix-phase-await-ms`(`APM_ALERT_ZABBIX_PHASE_AWAIT_MS`, 60000)·`push-max-age-sec`(`APM_ALERT_PUSH_MAX_AGE_SEC`, 600) 명시.
- 다른 테스트 영향: `ApmZbxStatusCommandIT.deadStatDoesNotBlockProvisionOrDeleteChain`의 PROVISION을 비강제로 — 강제면 꺼진 트리거를 보고 보류를 적재해 같은 dedup STAT을 병합으로 되살린다(새 의사 = 부활, §8.1). 테스트 의도("DEAD STAT이 다른 명령을 막지 않는다")는 그대로.
- **검증**(클래스별 단독, 5434, `-Dit.db.required=true`, 힙 1g): ZabbixPhaseIT 24(신규 7) · DecisionTest 10 · ProvisionIT 17 · StatusCommandIT 26 · WritePathIT 11 · RaceIT 24 · ExecutionIT 30 · EvaluationIT 14 · StoreIT 43 · DeletePathIT 8 · LockOrderIT 1 · BridgeTest 50 · WorkerTest 7 · CleanupServiceTest 7 · SweeperTest 10 · JobTest 11 · PropertiesTest 5 · ArchUnit 3(저수준 쓰기 목록에 `createProvisionItem|reenableItem|writeTrigger`) 통과.
- **뮤테이션 11종 전부 잡힘**: 켜기 명령을 쓰기 뒤(생성 시)로 · cacheReady 생략 부활 · 꺼진 아이템 전 트리거 끄기 생략 · 보류 상한 fail-open · 카운터=attempts · 보류 -1의 아이템 꺼짐=완료 · 남의 호스트 단락 제거 · 실패 시 장부 집계 생략 · 생성 경쟁 짧은 재확인 제거 · 보류 전체 제거(2건) · 값 재적재 제거. (1차의 m07 "자기 공급 판정 제거"는 코드가 없어져 폐기, m06·m08은 r7·r8로 대체.) 한 묶음(y1~y3) 실행 직전 여유 메모리가 2.48GB로 기준(2.5) 아래였다 — 실행은 정상 종료.
- 누적 diff `scratchpad/alert-6a-r2.diff`.
- **남는 판단·의문**: (1) 공유 아이템의 보류는 -1을 생략하고 켠다 — 다른 활성 규칙이 같은 측정값을 매 회차 밀지만 그 쪽 push가 실패 중이면 마지막 값이 오래됐을 수 있다(거짓 RECOVERY와 맞바꾼 5b 결정 — 바꾸려면 "그 소비자의 최근 push 시각" 같은 신선도 칸이 필요). (2) 1초 장부·대조의 레거시 `ensureItemRaw`는 여전히 꺼진 아이템을 트리거보다 먼저 다시 켠다(🔴3a와 같은 순서 문제) — 단위 7·6b에서 PROVISION 명령으로 옮기면 사라진다. (3) 보류 상한(5분) 뒤 DEAD는 사람이 retry-dead해야 켜진다 — 단위 8 회복 창구 전까지는 운영 가이드 SQL. (4) "Zabbix가 켤 때 판정하는가" 실측은 여전히 미실시.

### 13.9 코덱스 6a 2차 반려 반영 (2026-10-13, `_archive/features/apm/alerts/review_apm-alert-unit6a-20261012_codex2.md`)
- **🔴1 보류(neutralize) 상속 정체** — 둘 다 했다(방어 두 겹):
  - **저장소 병합**(`ApmZbxCommandStore.upsert`, RESOLVE_PUSH): 새 의사가 보류(`neutralize=true`)가 아니면 병합 결과에서 `neutralize`와 보류 카운터(`confirmRechecks`)를 **지운다**. 새 의사가 보류면 둘 다 유지(같은 PROVISION의 재적재 — 카운터를 이어 센다), DEAD에서 되살릴 때는 카운터 0부터(1차 반영 그대로). 근거: dedup이 같은 행은 "마지막 의사"를 실행한다(§8.1) — 끄기·고아(soft)·규칙 켜기(보류 아닌 hard)는 보류와 다른 의사다. 특히 규칙 켜기의 hard는 `RPUSH → PROVISION` edge가 있어, 보류를 상속하면 "아이템 없음"을 기다리는 RPUSH와 그 아이템을 켤 PROVISION이 서로를 기다린다.
  - **실행기**(`ApmZbxResolvePushExecutor`): 아이템 없음·꺼짐의 보류 재확인은 `hard && neutralize`에만. soft에 표식 잔재가 있어도 완료(정리 의무를 막지 않는다). 캐시 미동기 보류는 원래 hard 경로 안에만 있다.
  - 실행 중(PROCESSING) 병합: generation이 갈려 진행 중 실행의 보류 재확인은 카운터를 올리지 않고 REQUEUED → 새(soft) 의사로 다시 돈다.
  - 테스트(`ApmZbxStatusCommandIT`): `softDisableDoesNotInheritNeutralize`(PENDING·PROCESSING·DEAD 세 경우 — 병합된 target에 neutralize·카운터 없음, DEAD 0, RPUSH(soft) → STAT(off) → RCONF 전부 완료), `deleteAfterStuckHoldCompletes`(같은 상태 + 끄기 + 삭제 → RCONF → DELETE_TRIGGER → DELETE_ITEM 완료, 트리거 삭제), `softWithStaleNeutralizeCompletes`(실행기 방어).
- **🟡1** Zabbix 단계 실패 집계 = 판정 명령 id ∪ **이번 대상 바인딩에 남은 명령 전부**(`Store.idsForBindings`) — 실행 중 PROVISION이 이어 적재한 보류 -1·STAT·다시 적재한 값까지 센다. 테스트 `ApmAlertEvaluationZabbixPhaseIT.failureLedgerCountsFollowUps`.
- **🟡2 공유 아이템 -1 생략(현행 유지, 위험 기록)**: 보류·켜기의 hard RPUSH도 우리 아이템을 다른 활성 바인딩(규칙 켜짐·고아 아님)이 읽으면 -1을 생략하고 완료한다 → STAT(on). ⚠️ 위험: 그 다른 소비자의 push가 실패 중(캐시·권한·Zabbix 장애)이면 아이템의 마지막 값이 오래된 양수일 수 있고, 새로 켠 트리거가 그 값으로 거짓 Problem을 열 수 있다(추정 — 실측 전). 반대로 -1을 보내면 그 다른 소비자의 살아 있는 트리거에 거짓 RECOVERY가 **확정적으로** 난다 — 그래서 생략을 유지한다. **장기안**: 바인딩에 "마지막 성공 push 시각"(예: `last_push_ok_at`, PUSH_CURRENT 성공 기록 시 갱신)을 두고, 공유 생략은 다른 활성 소비자 중 하나라도 평가 주기 × 2 안에 push 성공했을 때만 — 아니면 보류(-1 대신 "다음 PUSH_CURRENT 성공까지 STAT 대기")로. 마이그레이션이 필요해 6a 밖(단위 8 이후 백로그).
- **🟡3 묵시적 DEAD STAT 부활(문서화 + 테스트 고정)**: 강제(enforce) PROVISION이 꺼진 트리거를 보면 -1 보류를 적재하고, 그때 같은 dedup(`STAT:b{id}`)의 DEAD STAT이 병합으로 **PENDING으로 되살아난다**(§8.1 "재적재 = 새 의사 = 부활"). 이것은 단위 8의 운영자 회복 창구(개별 retry-dead)와 **별개인 자동 경로**다 — 사람이 규칙을 수정·resync(=강제 PROVISION)하는 것이 곧 "다시 시도"가 된다. 안전 조건: 되살아난 STAT은 같은 적재 묶음의 새 `RPUSH(hard, neutralize) → STAT` edge 뒤에 서고(-1이 실제로 들어가기 전엔 claim되지 않는다), 실행 때 호스트 소유를 다시 확인한다(남의 호스트면 다시 DEAD). 테스트 `ApmZbxStatusCommandIT.forcedProvisionRevivesDeadStatBehindNewPush`(같은 행 id 부활, 선행에 새 RPUSH, -1 전 claim 불가, 순서 push → on). 비강제 PROVISION은 꺼진 트리거만으로는 보류를 적재하지 않아 부활시키지 않는다(`deadStatDoesNotBlockProvisionOrDeleteChain`).
- **검증**(클래스별 단독, 5434, `-Dit.db.required=true`, 힙 1g, 실행 전 여유 메모리 대기 스크립트): StatusCommandIT 32 · ZabbixPhaseIT 25 · StoreIT 43 · ProvisionIT 17 · WritePathIT 11 · DeletePathIT 8 · ExecutionIT 30 · RaceIT 24 · ArchUnit 3 통과. ⚠️ StatusCommandIT 1회는 여유 메모리 1.72GB에서 돌렸다(대기 없이 — 규칙 위반, 정상 통과). 이후는 2.5GB 미만이면 기다리는 스크립트로만 실행.
- **뮤테이션 5종 전부 잡힘**: 병합이 neutralize를 남김(3건) · 병합이 카운터를 남김(2건 — DEAD 경우는 부활 규칙이 따로 지워 정상) · 실행기 soft 보류 · 실패 집계를 판정 id만 · 보류 묶음의 RPUSH → STAT edge 제거.
- 누적 diff `scratchpad/alert-6a-r3.diff`.
- **3차 조건부 승인 조건 반영(2026-10-13)**: `ApmZbxStatusCommandIT.enableAfterStuckHoldReholdsAndOrders`(보류 RPUSH가 PENDING·PROCESSING(RECHECK 반환)·PROCESSING(DEAD 반환)·DEAD — hard 병합이 표식·카운터 제거, 진행 중 결과는 REQUEUED로 새 의사를 못 덮음, hard 완료 뒤 PROVISION이 새 neutralize 적재, 새 -1 전 STAT claim 불가, 순서 trigger off → item status:0 → -1 → trigger on, 잔여·DEAD 0) + `holdThenToggleSequencesConverge`(보류→끄기→켜기→끄기, 보류→켜기→끄기 — 잔여·DEAD 0, 최종 꺼짐). 결함 없음(코드 무변경). 뮤테이션 2종(hard 병합이 보류 유지, PROVISION 재보류 생략) 각 4건 검출. 누적 diff `scratchpad/alert-6a-r4.diff`.

## 14. 단위 7 결과 (2026-10-13) — 1초 STUCK 장부의 Zabbix I/O를 명령 장부·시퀀서로 전환 (미커밋, 검수 전)
> 기준 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`, HEAD `0c7ee42`(6a). 누적 diff `scratchpad/alert-7.diff`. 이관 출처: §1 표 14행, §4.8, §9.4 U5, §13.7 단위 7, §13.8 남는 의문 (2), 6a 검수 1·2·3차 "이관 목록 — 단위 7".

### 14.1 구조
- **장부(`evaluate/ApmStuckRequestLedger`) = Zabbix 0.** fire·settle은 이벤트 전이(열기·RECOVERED 해소)와 **같은 트랜잭션에서 명령만** 적재한다 — `ApmZbxCleanupService.enqueueStuckValue`(`MANDATORY`): 바인딩 예약(`reserveBinding`, DB·item-family 참여) → 객체 없는 바인딩이면 비강제 `PROVISION`(PROVISION이 DEAD면 되살리지 않고 값도 적재하지 않음 — 6a D3과 같은 규칙) → 이 값의 `PUSH_CURRENT`(`PUSH:b{id}`, clock = 장부 시각 초) **한 묶음**. 장부의 `ZabbixAlertBridge` 의존은 없어졌다(`ensureProvisioned`·`pushAll` 호출 제거).
- **커밋 뒤 즉시 실행 = 워커 전용 레인.** `ApmZbxCommandWorker.dispatchAfterCommit(ids, bindingIds)` — 트랜잭션 안이면 afterCommit에 걸고(롤백이면 무동작), **기다리지 않는다**. 전용 레인(`apm-zbx-command-urgent`, 스레드 1 + 대기열 64)이 `runChain`: 맡긴 id → 같은 바인딩의 지금 도래한 후속(PROVISION이 이어 적재한 "-1 → 켜기 → 다시 적재한 값")을 최대 4바퀴, 한 바퀴 실행 0이면 정지. 대기열 포화면 깨우기(주기 drain이 최종 보증). `auto-run=false`(IT)면 무동작 — IT는 `worker.dispatch`를 직접 부른다.
- **lane·순서는 6a 그대로.** 걸림 값은 5분 평가와 같은 `b:{ruleUid}:{scopeUid}` lane의 PUSH_CURRENT라 진행 중인 -1·끄기·켜기 뒤로 fence되고(lane 밖 직접 push 제거), 5분 평가의 값과 dedup 한 행으로 병합된다(더 새 clock이 이긴다).
- **레거시 `ensureItemRaw` 경로 제거(STUCK 쪽).** 꺼진 우리 아이템이면 PUSH_CURRENT 실행기가 MISSING → PROVISION 적재 → PROVISION의 3a 순서(켜진 트리거 끄기 → 아이템 `status:0` → -1 → STAT(on) → 값)를 탄다. 남은 호출처는 대조(6b)의 `applyOurDefinition`뿐.

### 14.2 브리지 정리(호출처 grep 기준)
- 삭제: `ensureProvisioned`(호출처 = 장부뿐), `pushAll`·`PushRequest`(장부뿐). `PushSummary`는 평가 요약이 쓰므로 남김(주석 갱신).
- `applyOurDefinition`(대조 6b)만 남아 내부 `provision(…, enforce)`를 그 메서드에 합치고 `ensureTrigger`의 `enforce` 인자·비강제 분기를 지웠다(호출처 0이 된 분기). `alignLegacyDescription`은 `writeTrigger`(비강제 PROVISION)가 쓰므로 유지. `retryPendingTriggerStatus`·`readTrigger`·`itemError`·`ensureItemRaw`는 대조·resync가 써서 유지(6b).

### 14.3 설계와 다르게·추가로 정한 것
- **D1 전용 레인(스레드 1).** 공용 풀(`worker-threads`)에 넣으면 5분 평가의 `runIds`(최대 60초)·화면 쓰기가 풀을 채운 동안 걸림 알람이 늦는다(IT로 재현 — 공용 풀이면 거절). 대가: Zabbix 동시 호출 상한 `worker-threads + 1`(기본 5 ≤ 커넥션 풀 10). 리스 검증식은 명령당 호출 수라 영향 없음. 같은 resource 단일 실행(partial UNIQUE)은 그대로라 lane 순서는 깨지지 않는다.
- **D2 기다리지 않음(대기 0).** 화면 쓰기의 `runNow(3초)`와 달리 bounded 대기도 두지 않았다 — 호출 스레드는 감시기 tick(JVM `lock` 보유)이라 기다리면 곧 1초 주기 지연이다. 이벤트 판정은 이미 DB에 커밋됐고 tick은 Zabbix 결과를 쓸 데가 없다. 레거시보다 tick은 빨라졌다(Zabbix 지연이 tick에 안 닿는다), Zabbix 도착은 커밋 직후 전용 레인이라 레거시(같은 tick 안)와 같은 수준.
- **D3 🔴 PUSH_CURRENT의 MISSING = 값 보존 대기(6a 동작 변경, 5분 평가에도 적용).** 6a는 "아이템 없음·꺼짐 → PROVISION 적재 후 완료(값 버림)"였다. 1초 장부는 열기 한 번·닫기 한 번만 미는데, 버리면 그 걸림이 다음 5분 배치까지 Zabbix에 안 닿는다(레거시는 같은 tick에 다시 만들고 밀었다). 이제 PROVISION을 적재하고 `RECHECK(PUSH_WAIT_PROVISION)` — 재대기가 같은 lane의 PROVISION을 선행으로 다시 건다(`Store.refence`). 첫 대기는 0초(선행이 풀리면 바로), 같은 사유 반복은 15초 간격(사람이 계속 지우는 경우의 빈 회전 방지), 값 나이 상한(600초)이 끝을 보장. PROVISION DEAD면 예전처럼 버린다. 평가 요약은 이 사유를 "대기"로 센다(`ApmAlertZabbixPhase.countPushes`).
- **D4 projection 병합 수용(§9.4 그대로).** fire와 settle이 실행 전에 둘 다 커밋되면 `PUSH:b{id}` 한 행으로 병합돼 0만 간다(우리 이력은 열림·닫힘 둘 다 남는다 — `fireThenSettleBeforeRunMergesToLatest`가 고정). 레거시 동기 push는 Zabbix가 살아 있으면 양수 edge를 전달했다. 전용 레인이 커밋 직후 실행하므로 창은 "Zabbix 실행 지연 > 감시기 다음 settle"일 때만이고, edge 전달 보장은 독자 알림 창구(사용자 결정 — 대기)의 몫.
- **D5 레거시 단위 테스트 이관.** `ZabbixAlertBridgeTest`의 비강제 확보·`pushAll` 전용 10건 삭제 / 강제(`applyOurDefinition`)로 재지정 / 옛 이름 정렬·사람 이름 보존은 `writeTrigger(enforce=false)`로 재지정. A1·A2(확인만 하면 synced_at·drift·error 무변경)는 실행기 경로에 테스트가 없어서 `ApmZbxProvisionIT.existenceOnlyKeepsGraceDriftAndError`로 옮겼다.
- **D6** 메모리 Zabbix의 `allowInTx`(장부 레거시용 예외) 제거 — 트랜잭션 안 호출은 예외 없이 실패.
- ArchUnit(`ApmZbxWriteSingleEntryTest`, 3 → 6): `evaluate` 패키지 **전체** Zabbix 쓰기 금지(장부 예외 제거) · 장부·감시기는 `ZabbixAlertBridge`의 어떤 메서드도(읽기 포함) 부르지 않음 · 장부·감시기·적재 입구는 명령 실행을 동기로 부르지 않음(워커 `runNow|runIds|drain|drainOnCallerThread|runOne|runChain|tick`, 실행기 `execute`) · 실행기 `execute`는 `alert.command`만.

### 14.4 잠금 순서(§5 "1초 장부(단위 7 전)" 행 대체)
| 1초 장부 | 서비스 → 규칙 → 이벤트 → 통지 → 바인딩(예약 — 단위 1의 일방향 예외 유지) → 명령(resource advisory·행), **Zabbix 0**. 커밋 뒤 전용 레인은 트랜잭션 없음(명령 claim·결과 = 명령 행, PROVISION 기록 = 바인딩 → 명령) |
|---|---|
§4.8 교착(장부가 이벤트 행을 쥔 채 실행기의 바인딩 기록을 기다림)은 **구조로 불가능**: 장부 트랜잭션은 실행을 부르지도 기다리지도 않고, 실행은 커밋 뒤 다른 스레드다. 3자 IT `ApmStuckRequestLedgerIT.ledgerDecisionWorkerNoDeadlock`(장부 settle 커밋 전 정지 + 5분 평가 + 전용 레인 실행 → 놓으면 전부 종료).

### 14.5 검증(클래스별 단독, 격리 DB 5434, `-Dit.db.required=true`, JDK17, `--no-daemon`, 힙 1g init, 실행 전 여유 메모리 2.5GB 대기)
- 신규: `ApmStuckRequestLedgerIT` 6(경계 Zabbix 0·커밋 뒤 실행 / settle·반복 fire / projection 병합 / 꺼진 아이템 3a 순서 + 값 보존 / 공용 풀 포화 중 전용 레인 2초 미만 / 3자 교착 없음), `ApmAlertEvaluationZabbixPhaseIT.valueWaitsBehindProvisionWhenItemDeleted`, `ApmZbxProvisionIT.existenceOnlyKeepsGraceDriftAndError`, 단위 `ApmZbxCommandWorkerTest` +4, `ApmZbxCleanupServiceTest` +2, ArchUnit +3.
- 통과: LedgerIT 6 · ZabbixPhaseIT 26 · ProvisionIT 18 · StatusCommandIT 38 · RaceIT 24 · NotificationIT 18 · WritePathIT 11 · EvaluationIT 14 · ExecutionIT 30 · DeletePathIT 8 · LockOrderIT 1 · StoreIT 43 · DecisionTest 10 · StuckRequestMonitorTest 16 · WorkerTest 11 · CleanupServiceTest 9 · BridgeTest 40 · ArchUnit 6 · Mvc 8 · LicenseArchitectureTest 9 · TransitionSingleEntry 4. `premium.apm.*` 전체 회귀는 결정대로 미실행. ⚠️ 첫 실행 한 번은 단위 테스트 두 클래스(WorkerTest·CleanupServiceTest)를 한 gradle 실행에 묶었다(규칙 "클래스 하나씩" 위반 — 이후 전부 단독).
- 뮤테이션 11종 전부 잡힘(`scratchpad/mut7/`, 각 테스트 클래스 단독 실행): k01 적재 입구가 트랜잭션 안에서 `runNow` 대기 → ArchUnit·CleanupServiceTest · k02 커밋 뒤 맡기기 누락 → CleanupServiceTest · k03 객체 없는 바인딩 PROVISION 누락 → CleanupServiceTest·LedgerIT 2 · k04 DEAD PROVISION 부활 → CleanupServiceTest · k05 커밋 전 즉시 실행 → WorkerTest · k06 afterCommit 스레드가 실행 대기 → WorkerTest · k07 전용 레인 대신 공용 풀 → WorkerTest·LedgerIT 2 · k08 후속 바퀴 없음 → WorkerTest · k09 MISSING이면 값 버림(6a 동작) → LedgerIT·ZabbixPhaseIT · k10 대기 사유를 실패로 셈 → ZabbixPhaseIT · k11 A1·A2(확인만 해도 markProvisioned) → ProvisionIT.

### 14.6 남은 의문·이관
1. 🔴(검수 판단 요청) **lifecycle 적재의 supersede가 걸림 값을 지운다.** 5a-1 규칙상 같은 lane에 lifecycle(PROVISION 포함)이 적재되면 대기 중인 PUSH_CURRENT는 삭제된다. 판정의 "객체 없음" PROVISION·존재 확인 repair·규칙 수정이 STUCK 값 실행 전에 끼면 그 값은 사라지고, 다음 5분 판정이 감시기 현재 값을 다시 적재할 때까지(최대 5분) Zabbix가 옛 값이다(3자 IT가 이 현상을 실제로 보였다 — 감시기를 멈춘 IT라 재적재가 없었다). 판정 경로는 같은 묶음에 자기 값을 싣고, PROVISION 보류 경로는 대기 값을 다시 적재하므로 운영 영향은 "드문 창 + 최대 5분"으로 본다. 고치려면 supersede 대상을 끄기·삭제 의사(STAT·RPUSH(soft)·RCONF·DELETE)로 좁히고 PROVISION은 fence만 — 저장소 대수 변경이라 단위 7에서는 하지 않았다.
2. **clock 역전(단위 7 이전부터).** 5분 판정은 감시기의 직전 tick 공개 값을 판정 시각 clock으로 적재한다. 장부 settle(0)이 이미 실행·삭제된 뒤 판정이 그보다 이른 clock의 양수를 새 행으로 적재하면 늦게 도착한 옛 양수가 Zabbix에 들어간다. Zabbix `last()`가 도착 순인지 clock 순인지 dev 7.x 실측 필요(§13.7 실측 항목과 함께).
3. 감시기 tick의 장부 **DB** I/O는 여전히 `lock` 안(기존 결정, outbox 2차). Zabbix I/O만 빠졌다.
4. PUSH_CURRENT 실패의 바인딩 배지(유예 초과 = 실패) 단위 테스트는 레거시 `pushAll`과 함께 지웠다 — 실행기 경로의 같은 분기(`withinCacheGrace` 밖 "없음" = 배지 + 재시도)는 캐시 대기 IT만 있고 유예 초과 IT는 없다(보강 후보).
5. 레거시 `ensureItemRaw`(꺼진 아이템을 트리거보다 먼저 켬)는 대조의 `applyOurDefinition`에 남아 있다 — 6b에서 PROVISION(enforce)로 옮기면 사라진다(§13.8 의문 (2)의 대조 몫).
6. 전용 레인 대기열(64) 포화 → 깨우기 → 공용 풀 drain(포화면 다음 주기 15초). 서비스 수천 개가 같은 초에 걸리는 규모는 미계측.
7. 사용자 확정 결정 준수 확인: 자동 `item.delete` 없음(DELETE_ITEM = `status:1`), 꺼진 우리 아이템 `status:0` 재활성화 재사용(PROVISION 경유), 독자 알림 창구 대기, DEAD 회복 창구는 단위 8, DEAD 자동 부활 없음(장부도 DEAD PROVISION을 되살리지 않는다).

### 14.7 코덱스 단위 7 1차 반려 반영 (2026-10-13, `_archive/features/apm/alerts/review_apm-alert-unit7-20261013_codex.md`)
- **🔴1 존재 보장 lifecycle이 대기 값을 지우던 명령 유실(§14.6-1) — 고쳤다.** `ApmZbxCommandStore.enqueue`의 supersede를 **값을 무효화하는 lifecycle**로만 좁혔다(`Plan.supersedesPush`):
  - 지운다(PENDING push): soft `RESOLVE_PUSH`(끄기·고아), `RESOLVE_CONFIRM`, `DELETE_TRIGGER`·`DELETE_ITEM`(삭제 체인 — 명시 폐기).
  - 지우지 않고 **선행 edge만**(신규 `fenceExistingPushes` — 새 lifecycle → 같은 lane의 대기 push): `PROVISION`(존재 보장·재활성화·강제), hard `RESOLVE_PUSH`(켜기·복귀·보류 -1), `SET_TRIGGER_STATUS`.
  - STAT은 방향(on/off)을 실행 때 DB에서 읽어 적재 시점엔 모른다 → fence만. 끄기 의사는 해소 그룹으로 같은 묶음의 soft RPUSH·RCONF가 지우고, 그 밖에 STAT(off) 뒤에 남은 값은 PUSH_CURRENT 실행기의 직전 차단 검사(규칙 꺼짐·고아 → 밀지 않고 완료)가 막는다 — "규칙 꺼짐/고아 미전송" 의미 유지. 코덱스 제안("STAT(off)는 supersede")과 이 점이 다르다.
  - DEAD push(남의 객체 등으로 멈춘 옛 값)는 예전처럼 어느 lifecycle이든 지운다 — 다음 값 적재가 새 행으로 만든다.
  - 6a 순서 유지: 대기 값은 새 hard RPUSH·STAT(on)·PROVISION 뒤로 edge가 걸려 "-1 → 켜기 → 현재 값"을 그대로 지킨다(현재 값이 -1보다 앞서 나가는 경로 없음 — 실행 중(PROCESSING) push는 예전처럼 lane이 "push → lifecycle"로 직렬화). 값 나이 600초 폐기는 실행기 그대로.
  - 테스트: `ApmZbxCommandStoreIT.ensuringLifecycleFencesPendingPush`(PROVISION·hard RPUSH·STAT 적재 뒤 push 남음·선행 3개·lifecycle 다 끝난 뒤에만 claim), `lifecycleSupersedesPendingPush`를 soft RPUSH·RCONF로 갱신. `ApmStuckRequestLedgerIT`: `standaloneProvisionKeepsPendingFireValue`(걸림 양수 대기 + 강제 PROVISION → 양수가 Zabbix 마지막 값), `standaloneProvisionKeepsPendingSettleZero`(settle 0 대기 + 비강제 PROVISION → 0이 마지막 값), `processingLifecycleThenSettleValueArrivesLast`(이미 PROCESSING인 PROVISION 뒤에 settle 0 → fence, 끝난 뒤 0이 마지막 값), 3자 IT의 `commandCount()==0`을 "settle 0이 Zabbix 마지막 값"으로 교체.
- **🟡1 clock 역전 — 코드 수정 보류, 위험·근본안 기록(실측 안 함).** 위험: 5분 판정은 잡이 트랜잭션·부모 잠금 진입 전에 만든 `now`로 clock을 만들고, 감시기 API는 공개 스냅샷의 `tickMs`를 들고도 값만 돌려준다. 성공한 명령 행은 지워져 "마지막으로 적용한 값"의 영속 watermark가 없다. 그래서 늦게 깨어난 판정이 이미 처리된 settle 0 뒤에 옛 양수를 새 행으로 보낼 수 있다(병합은 행이 살아 있을 때만 clock을 비교한다). Zabbix `history.push`의 clock은 수집 시각이고 `last()`는 같은 초 여러 값의 순서를 보장하지 않는다(공식 문서). 근본안: 감시기가 값과 함께 **샘플 version/timestamp**(tick 단조 번호 또는 tickMs)를 넘기고, 바인딩에 **마지막 적용 version을 영속화**(PUSH_CURRENT 성공 기록 때 갱신)해 실행기가 그보다 오래된 projection을 밀지 않고 완료한다(마이그레이션 필요). 판정에서 잠금 뒤 `now`를 다시 구하는 것만으로는 낡은 스냅샷 문제가 안 풀린다.
  - 🔴 **합본 전 dev Zabbix 7.x 실측 항목**: (a) 새 clock의 0을 민 뒤 더 옛 clock의 양수를 밀면 `last()`·트리거 상태가 되돌아가는가, (b) 같은 초에 -1 / 0 / 양수를 순서대로 밀었을 때 `last()`와 트리거 판정. 되돌아가면 즉시 🔴로 승격하고 위 근본안을 구현한다. (메인이 따로 판단 — 이번에는 실측하지 않았다.)
- **🟡2 전용 레인 포화 회귀** — `ApmZbxCommandWorkerTest.urgentLaneSaturationFallsBackToDrain`: 실행 1(막힘) + 대기 64 + 65번째 거절(`dispatch`가 null) → 거절된 명령은 레인이 claim하지 않고(PENDING 그대로) 깨우기 → 공용 풀 drain(`claimOne`)이 실행·완료한다.
- **🟡3 §4.9 지연 행렬(1초 장부 몫)** — `ApmStuckRequestLedgerIT.latencyMatrixWithFiveSecondZabbix`: 서비스 3·STUCK 규칙 3, Zabbix 전 호출 5초 지연 — (1) fire 트랜잭션이 무지연 기준 +200ms 이내·1초 미만, (2) 전용 레인이 느린 Zabbix 안에 있는 동안 다른 스레드의 서비스 삭제가 1초 안 커밋, (3) 그 구간 `idle in transaction` 0, (4) 지연 해제·drain 뒤 상태가 무지연과 같음(남은 서비스는 마지막 값, 지운 서비스는 우리 트리거 없음·아이템 비활성). 화면 쓰기 facade의 "3초+ε queued" 칸은 5b `ApmAlertRuleWritePathIT`·5분 평가 칸은 6a `slowZabbixDoesNotHoldDecisionLocks`가 맡는다 — 4칸 전체를 한 테스트로 묶지는 않았다.
  - ⚠️ ArchUnit의 한계(기록만): 6개 규칙은 장부·감시기·평가의 **직접** 호출만 막는다. 다른 클래스를 감싼 간접 호출(wrapper)이나 새 이름의 레거시 메서드는 규칙 이름 목록에 없으면 통과한다. 실제 방어는 (a) 메모리 Zabbix의 "트랜잭션 안 호출 = 실패"(IT 전체), (b) 워커 `runOne`의 트랜잭션 활성 거부, (c) 브리지 저수준 연산의 `requireNoTransaction` 가드다 — 구조적 증명은 아니다.
- **단위 8 이관 추가**: PROVISION이 **실행 중** DEAD가 되면, 그 뒤에 fence된 기존 PUSH_CURRENT는 의존에 묶여 claim되지 않고 값 나이 600초 폐기도 claim된 뒤에야 평가된다(판정·장부는 PROVISION이 이미 DEAD면 새 push를 만들지 않지만, 먼저 적재된 push는 남는다). DEAD 회복 창구·`blockedBy` 표시에서 이 push의 운명(회복 시 함께 풀림 / 나이 초과면 폐기)을 명시적으로 다룰 것. 자동 부활은 요구하지 않는다.
- 남은 의문 갱신: §14.6-1은 위로 해소. 나머지(§14.6-2 clock 역전 = 위 🟡1, 3~7)는 그대로.
- **검증**(클래스별 단독, 5434, `-Dit.db.required=true`, 힙 1g, 실행 전 여유 메모리 2.5GB 대기): LedgerIT 10(신규 4, 연속 2회 재실행 통과) · StoreIT 44 · WorkerTest 12 · StatusCommandIT 38 · ZabbixPhaseIT 26 · ProvisionIT 18 · RaceIT 24 · ExecutionIT 30 · DeletePathIT 8 · WritePathIT 11 · EvaluationIT 14 통과. LedgerIT 한 번은 같은 컨텍스트의 다른 스케줄 잡(`scheduling-*` 스레드의 `problem.get`)이 대역 호출 기록에 섞여 "호출 0" 단언이 깨졌다 — 이 IT가 일으킨 호출만 보도록(`ours()`) 고쳤다(제품 결함 아님).
- **뮤테이션 5종 전부 잡힘**(`scratchpad/mut7/`, 클래스 단독): r01 모든 lifecycle이 대기 push를 지움(예전 동작) → StoreIT 1·LedgerIT 3 · r02 역방향 fence 없음 → StoreIT 2(LedgerIT는 순차 drain이라 못 잡음 — 순서는 StoreIT가 고정) · r03 hard RPUSH도 지움 → StoreIT · r04 soft RPUSH도 남김 → StoreIT · r05 레인 거절 시 깨우기 누락 → WorkerTest.
- 누적 diff `scratchpad/alert-7-r2.diff`.

### 14.8 코덱스 단위 7 2차 "조건부 승인" 반영 (2026-10-19, `_archive/features/apm/alerts/review_apm-alert-unit7-20261013_codex2.md`)
- 🔴 없음. 1차 🔴1 해소·STAT fence 설계 차이 코드상 성립 확인. **조건: 단위 8 DEAD 회복 창구 합본 필수**(실행 중 PROVISION·hard RPUSH·STAT이 DEAD가 되면 fence된 push는 claim조차 안 돼 600초 폐기도 안 돈다 — 회복·`blockedBy` 노출에서 처리).
- 🟡 반영: StoreIT supersede 분류 4종 단언(DELETE_TRIGGER·DELETE_ITEM 추가), LedgerIT `statOffAfterPendingValueBlocksPush`(대기 값 → 규칙 끄기 → STAT fence → 실행 → 값 미전송).
- 합본 전 실측 이관 유지: 새 clock 0 뒤 옛 clock 양수, 같은 초 -1/0/양수의 Zabbix `last()`·트리거 상태. 되돌림이 보이면 sample version + 바인딩 마지막 적용 version 영속화를 합본 전에.

---

## 15. 단위 6b 설계 — 대조 분할 · 상태 진단 분리 · 알림 재조정 이어하기 (2026-10-19, 구현 전)

기준: 브랜치 `apm-alert-history` HEAD `bad215d`(단위 7). 이관 근거: §4.6 · §12.9 6b · §13.7 6b · §14.6-5 · 단위 4 2차 검수 이관(재조정 공정성·continuation).

### 15.1 현재(코드 확인)
- `ApmAlertSyncService.syncAll`(02:00, `@Transactional`): ① `lockAllForBatch`(모든 서비스 KEY SHARE·모든 규칙 SHARE)를 쥔 채 ② `bridge.retryPendingTriggerStatus`(Zabbix 쓰기) ③ 규칙×대상마다 `readTrigger`(trigger.get) → 없으면 **`applyOurDefinition`(트랜잭션 안 Zabbix 생성·갱신 + `ensureItemRaw`)** / 있으면 표현식 비교로 drift 표시·해제 ④ `itemError`(대상마다 item.get)로 NOT_SUPPORTED 표시·해제. 대상 N개면 Zabbix RPC ≈ 2N, 그동안 규칙 수정·끄기·삭제가 전부 기다린다.
- `ApmAlertService.zabbixStatus`(`@Transactional(readOnly=true)`): `bridge.status()`의 Zabbix 읽기 4종(hostgroup·host·item·action)을 **읽기 트랜잭션 안에서** 부른다(커넥션 점유 = Zabbix 지연).
- `AlertChannelActivation.reconcile`: 페이지마다 배타 try-lock·enabled 재확인(일시정지는 다음 페이지에서 멈춤 — 단위 4에서 해결됨). 남은 것: (a) 커서가 호출마다 0부터 — 시간 상한(`reconcileMaxSeconds`)에 걸리면 "다시 부르면 이어진다"는 로그가 거짓(다시 처음부터, 이벤트가 많으면 영영 완료 못 함) (b) 페이지 사이 양보 없이 곧바로 배타 잠금을 다시 시도 (c) 페이지 쿼리에 statement timeout 없음.
- 호출처 0이 될 레거시: `applyOurDefinition`·`ensureItemRaw`·`retryPendingTriggerStatus`(V80 뒤 대상 0, 대조에만 호출)·`itemError`. `readTrigger`는 resync THEIRS의 트랜잭션 밖 읽기(`readTheirThreshold`)가 쓰므로 **유지**.

### 15.2 대조 새 구조(6a 5분 평가와 같은 3단)
1. **무잠금 목록**(짧은 읽기 트랜잭션 또는 무트랜잭션): 켜진 규칙 × `targetsOf` → `(ruleId, ruleUid, kind, threshold, scope, bindingId?)`. 바인딩이 없으면 "바인딩 없음"으로 표시만(생성은 3단계 트랜잭션에서).
2. **Zabbix 일괄 읽기(트랜잭션 없음, `requireNoTransaction`)** — 대상 수와 무관하게 RPC 상수:
   - `inventory(token)`(host.get·item.get·trigger.get 3회) 재사용. 단 대조는 표현식이 필요 → `inventory`에 옵션 하나(`withExpressionAndState`)를 더해 trigger.get에 `expandExpression:true`·`expression`, item.get에 `state`·`error`를 함께 받는다(추가 RPC 0). 5분 평가 호출은 기존 출력 그대로(응답 크기 불변).
   - 호스트가 MISSING이면 전 대상 "트리거 없음"으로, FOREIGN이면 **대상별 명령 0 + 경고 1줄 + 요약 `hostForeign=true`**(6a 🟡2와 같은 판단).
   - 읽기 실패 = 전 대상 `failed`(잡이 던진다 — 지금과 같은 "전부 실패면 Zabbix 미연결" 의미).
3. **바인딩별 짧은 트랜잭션**(대상마다 `TransactionTemplate`, 하나 실패해도 계속): 잠금 순서 = **서비스 KEY SHARE → 규칙 SHARE → 바인딩 FOR UPDATE(없으면 생성) → 명령(resource advisory)** — 장부·평가와 같은 순서(§5).
   - 재확인: 규칙이 여전히 존재·켜짐인지(아니면 건너뜀), `provisionPending(bindingId)`면 건너뜀(종전 규칙 유지 — 반영 대기 중엔 drift를 세우지 않는다).
   - 판정은 2단계 스냅샷으로만(트랜잭션 안 Zabbix 0):
     - `provisionNeed`가 `ITEM_MISSING`·`ITEM_DISABLED`·`TRIGGER_MISSING`·`LEGACY_NAME` → **비강제 PROVISION 적재**(`withOrigin(…, "02:00 대조 — " + need)`). 이미 PROVISION 행이 있으면(대기·실행·DEAD) 적재 안 함 — 6a `repair`와 같은 규칙(DEAD를 되살리지 않는다).
     - 트리거 있음 → 표현식 정규화 비교: 다르면 `markDrift`, 같고 drift였으면 해제(종전과 같음 — **덮어쓰지 않는다**).
     - 아이템 `state=NOT_SUPPORTED` → `markError(NOT_SUPPORTED…)`, 아니면 `clearNotSupportedError`(세운 쪽이 내린다, 종전).
   - 🔴 **PROVISION을 비강제로 고른 이유(§4.6 "PROVISION(enforce)"와 다른 점)**: 2단계 읽기와 실행 사이에 사람이 트리거를 되살렸거나 고쳤으면, enforce는 그 표현식을 우리 값으로 덮는다 = 대조가 "사람의 결정을 뒤집지 않는다"는 원칙(클래스 주석 ①)을 깬다. 비강제는 없는 것만 만들고 있는 것은 정렬(옛 이름)만 한다 — 종전 `applyOurDefinition`(트리거가 없을 때만 불림)의 의미와 같다. 검수 판단 요청.
4. **커밋 뒤**: 명령은 워커가 실행(자동 drain). 잡은 기다리지 않는다(일 1회 그물 — 결과 요약은 "적재 수"). 6a처럼 `runIds`로 짧게 돌릴지는 선택 — **기다리지 않는 쪽 권장**(02:00 배치가 Zabbix 지연만큼 길어질 이유가 없다).
5. **`retryPendingTriggerStatus` 삭제** — V80이 남은 표식을 STAT 명령으로 옮겼고 호출처는 대조뿐. 꺼진 규칙의 트리거가 켜져 있는 경우(종전 ④의 목적)는 대조가 **꺼진 규칙도** 2단계 스냅샷으로 보고, 트리거 status ≠ 원하는 상태면 `SET_TRIGGER_STATUS` 적재(STAT은 실행 때 원하는 상태를 DB에서 읽는다). 꺼진 규칙은 drift·NOT_SUPPORTED는 계속 세지 않는다(종전 "소음" 판단 유지).

결과 `SyncResult(checked, drift, repairsQueued, statusQueued, notSupported, failed, hostForeign, decisionMs, zabbixMs)` — `recreated`는 `repairsQueued`로 이름이 바뀐다(실제 생성은 실행기가 한다). 잡의 "전부 실패면 던진다"는 유지.

### 15.3 상태 진단(`zabbixStatus`) 분리
- `@Transactional(readOnly)` 제거. 순서: `bridge.status()`(트랜잭션 없음 — 메서드 첫 줄에 `requireNoTransaction`) → DB 읽기(바인딩 요약·명령 통계)는 각 저장소 호출의 기본 트랜잭션 또는 `TransactionTemplate(readOnly)` 한 번. 응답 계약 불변.

### 15.4 레거시 제거
- 삭제: `applyOurDefinition`·`ensureItemRaw`·`retryPendingTriggerStatus`·`itemError`. ⚠️ `alignLegacyDescription`은 **유지** — PROVISION 실행 경로(`provisionTrigger`, 비강제 분기)가 옛 이름 정렬에 쓴다(호출처가 대조만이 아님, 코드 확인)·`ApmAlertSyncService.check/markNotSupported`의 직접 호출. 남은 브리지 쓰기는 command 패키지 실행기 전용 저수준 연산만.
- 단위 테스트 `ApmAlertSyncServiceTest`는 새 구조 IT(`ApmAlertSyncIT`, FakeZabbix)로 이관: 공백은 drift 아님 · 덮어쓰지 않음 · 되돌리면 배지 해제 · 사라짐 → PROVISION 적재(직접 생성 아님) · NOT_SUPPORTED 표시·회복 · 꺼진 규칙 drift 안 셈 + 상태 어긋남은 STAT 적재 · 하나 실패해도 계속 · 호스트 FOREIGN이면 명령 0 · **트랜잭션 안 Zabbix 호출 0**(FakeZabbix `inTx` 단언) · PROVISION 대기·DEAD면 건너뜀.

### 15.5 ArchUnit 확대
- `sync` 패키지: 브리지 **쓰기** 메서드 호출 금지(평가·장부와 같은 규칙), command 실행기 직접 호출 금지.
- 브리지 쓰기 메서드(저수준 provision·status·push·delete)는 `command` 패키지에서만 호출.
- 런타임 가드: `inventory`·`status`·`readTrigger`에 `requireNoTransaction`(읽기도 트랜잭션 안 금지 — §12.9 "읽기·레거시 호출까지").

### 15.6 알림 재조정 이어하기(단위 4 이관)
- `reconcile(key, afterEventId)` — 커서를 받아 그 뒤부터. `Result`에 `nextCursor`(완료면 null). 관리 API는 `after` 쿼리 파라미터를 받고 응답에 `nextCursor`를 싣는다(추가만 — 단위 8 화면이 "이어서" 버튼으로 쓴다). 활성화 bootstrap도 같은 커서 반환.
- 페이지 사이 양보: 페이지 커밋 뒤 `props.reconcilePagePauseMs`(기본 20ms) 쉰 뒤 다음 배타 try-lock — 공유 잠금으로 기다리던 전이 적재·claim이 그 틈에 들어간다.
- 페이지 쿼리 `SET LOCAL statement_timeout = props.reconcileStatementTimeoutMs`(기본 5000ms) — 초과는 그 페이지 실패로 끝내고 커서를 돌려준다(다시 부르면 그 페이지부터).
- 테스트: 상한 도달 → nextCursor 반환 → 그 커서로 재호출이 처음부터 다시 보지 않음(검사 이벤트 수 합 = 전체) · 커서 재호출 멱등 · 페이지 사이 전이 적재가 굶지 않음(배타 루프 중 공유 잠금 획득 시간 상한).

### 15.7 잠금·트랜잭션 표(§5 "대조(6b)" 행 확정)
| 대조(6b) | 무잠금 목록 → Zabbix 일괄 읽기(트랜잭션 없음) → 대상별: 서비스 KEY SHARE → 규칙 SHARE → 바인딩 FOR UPDATE → 명령(resource advisory·행). **트랜잭션 안 Zabbix 0** |
|---|---|

### 15.8 위험·의문(검수 판단 요청)
1. 비강제 PROVISION(15.2-3 🔴) — §4.6과 다르게 고른 것이 맞는가.
2. 꺼진 규칙의 트리거 상태 어긋남을 STAT으로 고치는 것(15.2-5) — 종전엔 "표식이 있는 바인딩"만 재시도했다. 이제 스냅샷 비교로 넓어진다: 사람이 Zabbix에서 일부러 켠 트리거를 매일 밤 다시 끈다 = 사람 결정 뒤집기인가? (규칙이 꺼졌다는 것이 우리 쪽의 명시 결정이므로 이행으로 본다 — 판단 요청.)
3. 2단계 스냅샷과 3단계 사이 경쟁: 스냅샷이 "트리거 없음"인데 그 사이 평가·규칙 수정이 PROVISION을 적재·실행했다면 → 3단계의 PROVISION 존재 확인에서 걸러지거나(대기·실행 중), 이미 완료됐으면 중복 비강제 PROVISION 1건(실행기가 "이미 있음"으로 완료 — 무해).
4. 응답 크기(R11): 대조용 inventory는 expression·state·error까지 받는다 — 대상 1,000+면 큼. 페이지는 이번에도 미적용(일 1회).
5. 다중 노드: 02:00 배치가 노드마다 돌면 적재 dedup으로 중복 실행은 막히나 Zabbix 읽기는 노드 수배 — 순위 15(다중 노드)로.

### 15.9 v2 개정 — 코덱스 6b 설계 1차 "재설계 필요"(`_archive/features/apm/alerts/review_apm-alert-unit6b-design-20261019_codex.md`) 반영 (2026-10-19)
§15.2-5·15.4·15.6·15.8을 아래로 **대체**한다. 확정: 비강제 PROVISION(§15.8-1 찬성 — §4.6의 enforce 원안은 **폐기**), 꺼진 규칙 상태 복구 = 이행(찬성, 단 단독 STAT 금지).

**🔴1 대상 집합 분리**
- (A) 객체 복구·drift·NOT_SUPPORTED: `enabled 규칙 × targetsOf`(바인딩 없으면 생성 + 비강제 PROVISION).
- (B) 트리거 상태 대조: 켜진·꺼진 규칙의 **기존 바인딩만**(`bindings.findAll` 중 트리거 id 또는 정확 식별이 가능한 것). 꺼진 규칙·고아 바인딩에는 **새 바인딩·PROVISION을 만들지 않는다.** drift·NOT_SUPPORTED는 (A)에서만 센다(꺼진 규칙 소음 판단 유지).

**🔴2 상태 어긋남은 기존 의미 묶음으로만**
- 원하는 상태 = 규칙 존재 ∧ enabled ∧ `orphaned_at IS NULL`(STAT 실행기와 같은 정의, `ApmZbxTriggerStatusExecutor:70·113`). 스냅샷 트리거 status와 비교:
  - 원하는 OFF인데 Zabbix 켜짐 → `enqueueResolveGroup`(soft RPUSH → STAT → RCONF) — 열린 Problem까지 닫는다.
  - 원하는 ON인데 Zabbix 꺼짐 → `enqueueEnable`(남은 RCONF 취소 + hard RPUSH → STAT) — 옛 양수로 즉시 재발화 방지.
- 같은 대조 회차에 (A)가 그 바인딩에 PROVISION을 적재했으면 (B) 묶음을 적재하지 않는다(PROVISION이 원하는 status로 만들고, 꺼진 채 만든 트리거의 "-1 → 켜기"는 PROVISION 실행기가 이어 적재한다 — §13.3).

**🔴3 DEAD 비부활 — 모든 적재 경로**
- 저장소에 `lifecycleStates(bindingIds) → Map<bindingId, Set<(command, status)>>` 추가(PROVISION·RPUSH·STAT·RCONF·DELETE_*; PUSH_CURRENT 제외).
- (A) PROVISION·(B) 묶음 모두: 그 바인딩에 lifecycle 명령이 **어떤 상태든(PENDING·PROCESSING·DEAD)** 있으면 적재하지 않는다 — upsert 병합이 DEAD를 PENDING으로 되살리기 때문(`ApmZbxCommandStore:672`). 대기·실행 중이면 그 명령이 수렴시키고, DEAD는 단위 8 회복 창구 몫. 요약에 `skippedDead`로 센다.
- 확인과 적재 사이 경쟁: 3단계 트랜잭션이 바인딩 FOR UPDATE + resource advisory를 쥔 뒤 확인하므로 같은 바인딩의 다른 적재 경로(평가·규칙 쓰기)와 직렬화된다.

**잠금 순서 정규화(🟡)**: 서비스 KEY SHARE → SLO(규칙이 SLO 축이면 FOR KEY SHARE) → 규칙 SHARE → 바인딩 FOR UPDATE → 명령. 대상별 트랜잭션은 한 바인딩만 다루므로 같은 종류 다중 id 정렬 문제는 없다.

**🔴4 알림 재조정 커서 — 서명된 불투명 값 + 마지막 검증 스윕**
- 커서 = base64url(JSON `{v:1, ch, gen, phase, after, hwm}`) + HMAC-SHA256. 키는 JWT 비밀에서 라벨로 파생(`ApmExportPlanToken`과 같은 방식, 라벨 `apm-alert-reconcile-cursor`). `gen` = 채널 상태 행의 `activated_at`(epoch ms), `hwm` = 첫 호출 때 `max(apm_alert_event.id)`.
- 거부: 서명 불일치·다른 채널·`gen` 불일치(그 사이 끄고 다시 켬)·`after > hwm`·`v` 미지원 → 400 `APM_ALERT_RECONCILE_CURSOR_INVALID`(새 오류 코드). 커서 없이 부르면 처음부터.
- phase: `SCAN`(after → hwm 페이지) → hwm 도달 시 `VERIFY`(0 → hwm 한 번 더, 멱등 — 누락만 채움) → VERIFY가 끝까지 가야 `complete=true`. 시간 상한이면 그 phase·after로 `nextCursor`.
- 🔴 커서 아래 이벤트의 후발 해소: 채널이 켜진 뒤의 전이는 정상 경로(outbox 적재, 공유 잠금)가 행을 만든다 — 재조정이 채우는 것은 "켜지기 전·빈 없는 노드"의 누락뿐이다. VERIFY가 그 경계(첫 SCAN 시작 후 커서 아래로 지나간 이벤트가 그 사이 RESOLVED가 된 경우)를 한 번 더 덮는다.
- 활성화(bootstrap)도 같은 커서를 돌려준다(`activate` 결과 + 관리 API 응답에 `nextCursor`, 요청은 `cursor` 파라미터). 추가만 — 단위 8 화면이 "이어서"로 쓴다.

**🔴5 statement timeout(57014)**
- 페이지 트랜잭션 첫 문장 `SET LOCAL statement_timeout = :ms`(기본 5000, `reconcileStatementTimeoutMs`).
- `57014`는 `withRetry` 재시도 대상이 아니다. 트랜잭션 **밖**에서 잡아: 그 페이지 전체 롤백 → 집계에서 제외 → `complete=false`, `nextCursor` = 마지막으로 커밋된 페이지의 커서(첫 페이지면 입력 커서 그대로), 결과에 `timedOut=true`. HTTP는 200(부분 결과). 로그 WARN.

**🔴6 삭제 목록(호출 그래프 단위)**
- 삭제: `applyOurDefinition`·`ensureItemRaw`·`retryPendingTriggerStatus`·`itemError`와 그것만 쓰던 `binding(rule,scope,now)`·`ensureItem`·`ensureTrigger`·`triggerStatus`·`StatusOutcome`·`applyTriggerStatus`·`TriggerStatusRetryResult`·`ownedTrigger`. **구현 시 각 심볼의 호출처를 컴파일러로 확인**하고, 다른 경로(PROVISION 저수준 연산)가 쓰는 것이 나오면 남긴다. `alignLegacyDescription`·`readTrigger`는 유지.

**🟡 반영**
- `status()`: `requireNoTransaction`을 `try` **바깥** 첫 문장에(안이면 오용 예외가 `reachable=false`로 삼켜진다). `readTrigger`·`inventory`도 가드.
- ArchUnit: `sync` 패키지가 command 실행기 클래스에 **의존 자체 금지** + 브리지 쓰기 메서드 호출 금지. 브리지 쓰기 저수준 연산은 command 패키지만.
- 알림 페이지 사이 양보: 트랜잭션·advisory를 놓은 뒤, 전체 deadline에 포함.
- §15.8-5 정정: 스케줄러는 분산 lease(30분 TTL)를 먼저 잡아 정상 시 한 노드만 돈다. 위험은 실행이 TTL을 넘기거나 lease 유실 → **대조 실행 시간 상한을 lease TTL의 절반(15분)으로** 두고 넘으면 남은 대상은 다음 날로(요약 `truncated=true`). 적재는 dedup·DEAD 비부활로 중복 실행에도 수렴.
- §15.8-4 inventory 크기: 대조는 아이템·트리거 수·응답 소요(ms)를 요약에 싣고, 아이템 5,000 또는 트리거 5,000 초과 시 WARN(페이지 전환 기준 — 순위 15).

**검증 목록(IT, FakeZabbix·격리 DB)** — §15.4 목록에 더해: 꺼진 규칙의 켜진 트리거 → 해소 묶음으로 Problem 닫힘·꺼짐 / 켜진 규칙의 꺼진 트리거 → 켜기 묶음(-1 뒤 켜짐, 옛 양수 재발화 없음) / 모든 명령 종류 DEAD 유지(대조가 되살리지 않음) / 스냅샷 뒤 규칙 끄기·삭제 경쟁(3단계 재확인으로 적재 안 함) / 같은 회차 PROVISION과 상태 묶음 중복 없음 / 동일 description 복수 정확 트리거(가장 작은 id 기준, 종전 `provisionNeed`와 같음) / 실행 시간 상한 truncated. 알림: 커서 이어하기 합 = 전체 · 서명 위조·다른 채널·gen 불일치·after>hwm 거부 · VERIFY 전엔 complete=false · 커서 아래 후발 해소가 VERIFY에서 채워짐 · 57014 → 부분 결과·커서 유지·집계 제외.

### 15.10 v3 개정 — 코덱스 6b 설계 2차 "재설계 필요"(`_archive/features/apm/alerts/review_apm-alert-unit6b-design-20261019_codex2.md`) 반영 (2026-10-19)
**범위 분할**: 6b = Zabbix 대조·상태 진단·레거시 정리·ArchUnit. **알림 재조정 이어하기(§15.6·§15.9 🔴4·🔴5)는 단위 6c로 분리**한다 — 2차 🔴5~8(세대 열 V82 `activation_generation`, VERIFY 원시 id 구간 페이지, 활성화 시점 열린 이벤트의 FIRED+RESOLVED 재구성, 첫 페이지 57014 effective cursor·cause chain 판정)은 6c 설계에 그대로 옮긴다. 🔴7(활성화 직후 FIRED 생성 전 해소 → RESOLVED 누락)은 **단위 4 코드의 실제 결함**이다 — 현재 등록 채널 0개라 운영 영향 없음, 채널 출시 전 필수(6c). 6c는 단위 8 뒤, 병합 전에 한다(사용자 결정 "창구만 꽂으면 되는 상태"의 일부).

**🔴1(2차) ON 복구 = `enqueueRestore`**: 남은 RCONF 취소 + hard RPUSH → STAT, PROVISION 없음(`ApmZbxCleanupService:273`). `enqueueEnable`은 강제 PROVISION을 함께 싣는 "사용자 규칙 켜기" 의미라 대조에 쓰지 않는다. OFF 복구 = `enqueueResolveGroup`(확인됨).

**🔴2·3(2차) 억제 규칙 = "DEAD가 걸린 lane만 건너뛴다, 나머지는 적재해 병합에 맡긴다"**
- 연관: 바인딩의 lane = `bindingResource(ruleUid, scopeUid)`. RCONF·DELETE_*는 `binding_id`가 없지만 그 resource(또는 `pending_resource_key`)가 같다 → 저장소 `laneStates(resourceKeys) → Map<resource, LaneState{dead, blockedByDead, pendingOrProcessing}>`를 **resource 키 기준**으로 조회(`coalesce(pending_resource_key, resource_key)`, PUSH_CURRENT 제외). 식별 불가 `m:` 키는 대조 대상이 아니다.
- 판정:
  - lane에 DEAD lifecycle → **건너뜀**(`skippedDead`). 자동 부활 금지, 단위 8 회복 창구 몫.
  - lane에 DEAD 선행에 막힌 PENDING → **건너뜀**(`blockedByDead`) — 곧 수렴할 명령으로 보지 않는다.
  - 그 밖(PENDING·PROCESSING이 있든 없든) → **적재한다**. upsert가 PENDING이면 target 병합(soft→hard 등), PROCESSING이면 generation+1로 다시 돌린다(`ApmZbxCommandStore:679~685`) — 최신 원하는 의사로 수렴. STAT은 원하는 상태를 실행 때 DB에서 읽으므로 대기 STAT도 최신 의사를 대표한다. 대기가 있었으면 `merged`로 센다.
- 이 판정은 3단계 트랜잭션에서 바인딩 FOR UPDATE + resource advisory를 쥔 뒤 한다(다른 적재 경로와 직렬화).

**🔴4(2차) 같은 회차 PROVISION과 상태 묶음**
- need가 `ITEM_MISSING`·`TRIGGER_MISSING`·`ITEM_DISABLED`면 상태 묶음을 **생략** — 셋 다 PROVISION 실행기가 트리거 status까지 원하는 상태로 수렴시킨다(생성 시 원하는 status로 만들고, 꺼진 아이템 재활성화는 3a 순서로 트리거를 다룬다 — §12·§13.3).
- need가 `LEGACY_NAME`(트리거·아이템 존재, 비강제라 status 보존)이면 상태 비교를 **그대로 해서** 어긋나면 묶음도 적재. 둘은 순서 무관 — 비강제 PROVISION의 기존 트리거 처리는 이름 정렬뿐이라 status를 건드리지 않는다(`ZabbixAlertBridge:1367~1374`).

**🟡(2차) 반영**: 요약 `SyncResult`에 `skippedDead`·`blockedByDead`·`merged`·`repairsQueued`·`statusQueued`를 분리. (커서 길이 제한·constant-time 비교·57014 정책·빈 테이블 hwm=0은 6c로.)

**최종 6b 범위(구현 착수본)** = §15.2(1~4단계, 비강제 PROVISION) + §15.9 🔴1(대상 집합 분리)·🔴2(의미 묶음, ON은 Restore로 정정)·잠금 순서·🔴6(삭제 호출 그래프)·🟡(가드 위치·ArchUnit 의존 금지·15분 상한·inventory 계측) + §15.10 억제 규칙·같은 회차 규칙 + §15.3(zabbixStatus 분리). 검증 목록은 §15.9의 대조 항목.

### 15.11 v4 확정 — 코덱스 6b 설계 3차 "조건부 진행"(`_archive/features/apm/alerts/review_apm-alert-unit6b-design-20261019_codex3.md`) 조건 반영 (2026-10-19)
**적재 전 사전 확인(preflight) — 같은 의도면 건너뛰고, 다른 의도만 병합**
- 조회: 이 바인딩이 만들 dedup 키 `PROV:b{id}`·`RPUSH:b{id}`·`STAT:b{id}`·`RCONF:t{trig}|g{hash}`(🔴 **dedup 기준** — `m:` 별칭으로 남은 행도 dedup이 같으므로 잡힌다) ∪ lane `coalesce(pending_resource_key, resource_key) = b:{resource}`의 lifecycle 행(PUSH_CURRENT 제외). 각 행의 상태·target(hard 여부·enforce)·DEAD 선행 차단 여부.
- 판정(우선순위 순):
  1. 어느 행이든 **DEAD** → 건너뜀 `skippedDead`(자동 부활 금지 — upsert가 DEAD를 PENDING으로 되살리고 정규 lane으로 re-key하기 때문).
  2. PENDING이 **DEAD 선행에 막힘** → 건너뜀 `blockedByDead`.
  3. **같은 의도가 이미 대기·실행 중** → 건너뜀 `alreadyQueued`(upsert의 generation+1이 실행 중 완료 CAS를 깨 REQUEUED churn을 만들기 때문):
     - 복구 PROVISION: `PROV:b` 행 존재(PENDING·PROCESSING, enforce 무관 — 비강제가 기존 강제를 약화시키지 않는다).
     - OFF 묶음: soft `RPUSH:b` + `STAT:b` 존재.
     - ON 묶음: hard `RPUSH:b` + `STAT:b` 존재 + RCONF 없음.
  4. 그 밖(의도가 다르거나 일부만 있음) → 적재 = upsert 병합(soft↔hard 최신 우선, RCONF 취소는 `enqueueRestore`가) `merged` 또는 신규 `repairsQueued`·`statusQueued`.
- 🔴 `DELETE_ITEM`(`i:` lane) DEAD는 **바인딩 대조를 막지 않는다**(결정): 삭제 체인은 바인딩이 지워질 때 생기고 대조는 남은 바인딩만 본다. 공유 아이템의 다른 활성 바인딩이 그 아이템을 필요로 하면 PROVISION이 재활성화하는 것이 맞다(사용자 결정 "꺼진 우리 아이템은 재활성화해 재사용").
- 확인과 적재는 3단계 트랜잭션에서 바인딩 FOR UPDATE + resource advisory(xact)를 먼저 잡은 뒤(같은 바인딩의 평가·규칙 쓰기 적재와 직렬화).

**같은 회차 생략 목록 = `HOST_MISSING`·`ITEM_MISSING`·`TRIGGER_MISSING`·`ITEM_DISABLED`**(PROVISION이 원하는 status까지 수렴). `LEGACY_NAME`만 상태 묶음도 판정(순서 무관 — 3차 🟢 확인). `HOST_FOREIGN`은 대상별 명령 0.

**IT 추가**: `m:b:*` DEAD 별칭이 있으면 정규 적재 안 함 · 같은 의도 PROCESSING에 반복 대조해도 generation 불변 · HOST_MISSING이면 상태 묶음 없음 · LEGACY_NAME 양쪽 순서 · 같은 의도 skip 집계.

**diff 경계**: 6b 커밋은 `notify/*`·채널 스키마·활성화 API를 건드리지 않는다. 6c는 채널 출시 전 필수.

## 16. 단위 8 설계 — DEAD 회복 창구 + 반영 상태 화면 (2026-10-20, 구현 전)

> 근거 이관: §2.8·§3.4·§11.5 🔴3·§12.4·§12.11·§12.13·§13(D3·단위 8 이관 a·b)·§13 3차 "fence된 push의 운명". 합본 배포 전 필수(코덱스 5b 조건).
> 범위: BE(명령 장부 조회·개별 재시도·UNIDENTIFIED 확인 API, 상태 집계 보강) + FE(5b 계약 반영 — queued 배지·쓰기 후 폴링·SLO syncing, Zabbix 탭 명령 장부 패널). 알림 채널(6c)·스키마 변경 없음(Flyway 추가 없음).

### 16.1 BE API (전부 `apm.edit`, 200+body code 관례)
| EP | 동작 |
|---|---|
| `GET /apm/alert-rules/zabbix-commands?status=DEAD\|BLOCKED&limit=50&offset=0` | 명령 장부 목록. `DEAD`(기본) = DEAD 행, `BLOCKED` = 도래했는데 선행에 막힌 PENDING(`stats.blocked`와 같은 정의). id 오름차순 페이지(`PagedListDto`), limit 상한 200 |
| `POST /apm/alert-rules/zabbix-commands/{id}/retry` | 개별 retry-dead. 응답 `{retried:boolean, status, reason?}` |
| `POST /apm/alert-rules/zabbix-commands/{id}/acknowledge` body `{note}` | `acknowledgeUnidentified`(DEAD+UNIDENTIFIED만, 행 삭제로 후속 edge 해소). note 필수(공백 거부 → `APM_ALERT_COMMAND_NOTE_REQUIRED`). 응답 `{acknowledged:boolean, released:[id]}` |
- 🔴 **세 EP 모두 `@LicenseExempt` + `requireApmEverLicensed()`**(채널 컨트롤러 운영 안전 명령과 같은 판단): 워커는 라이선스 게이트 없이 커밋된 정리 의무를 계속하므로, 라이선스가 만료돼도 그 정체를 사람이 풀 창구가 있어야 한다. 새 의사를 만드는 경로가 아니다(이미 적재된 행을 되살리거나 지운다).
- 감사: retry·acknowledge 모두 `[AUDIT]` WARN에 사용자 id·행 요약(id·command·dedup·resource·last_error 앞 200자)·메모.
- 없는 id·조건 불일치(DEAD 아님, UNIDENTIFIED 아님)는 예외가 아니라 `retried=false`/`acknowledged=false` + 현재 상태(사라졌으면 `status=null`) — 두 사람이 동시에 누르는 화면이라 멱등이 맞다.

### 16.2 목록 행 DTO `ApmZbxCommandRowDto`
`id, command, status, reason(코드), lastError(원문, 2000자 절단), attempts, generation, createdAt, updatedAt, nextAttemptAt, target{ruleUid, ruleKind, ruleExists, scopeUid, scopeName, bindingId, bindingExists, triggerId, itemId, host?, itemKey?}, waiting:{count, commands[≤5]{id, command, status}}(이 행을 선행으로 기다리는 후속), blockedBy:[{id, command, status, reason}](BLOCKED 목록에서만), fencedPushes(이 바인딩의 PUSH_CURRENT 대기 수 — §13 3차), acknowledgeable(boolean = UNIDENTIFIED DEAD), retryable(boolean = DEAD)`.
- **reason 코드**(last_error 접두어 → 화면 안내의 키, 원문은 그대로 함께): `NOT_OWNED`(`ZABBIX_OBJECT_NOT_OWNED:`) · `NEUTRALIZE_TIMEOUT`(`RPUSH_HOLD_WAIT:` = `HOLD_TIMEOUT_PREFIX`) · `UNIDENTIFIED`(`UNIDENTIFIED`) · `INVALID_COMMAND`(binding_id·cutoff·kind 누락, 실행기 없음, id 상한 초과 — 코드 결함·손상 payload) · `OTHER`. 접두어 상수는 실행기의 상수를 참조한다(문자열 복제 금지 — 바뀌면 컴파일·테스트가 잡게).
- target 해석: `binding_id` 있으면 바인딩·규칙·서비스/SLO 조인(§`SCOPE_UID_SQL`·`BINDING_JOINS` 재사용), 없으면 `rule_uid` 열 + `target.kind/scopeUid/zbxIds/host/itemKey`. 규칙·바인딩이 지워졌으면 `ruleExists=false`/`bindingExists=false`(이름 없이 uid만). resource 키는 md5라 역산하지 않는다.
- 조회는 읽기 전용 트랜잭션 1개, 후속(`waiting`)·선행(`blockedBy`)은 페이지 id 집합으로 일괄 조회(N+1 금지).

### 16.3 개별 retry-dead — `ApmZbxCommandStore.retryDead(long id)`
1. 트랜잭션(REQUIRES_NEW) 안: 행을 잠금 없이 읽어 lane resource(`coalesce(pending_resource_key, resource_key)`)를 얻는다 → **resource advisory(xact)** → 행 `FOR UPDATE` → 다시 읽어 `status='DEAD'`이고 lane이 같은지 확인(바뀌었으면 false — 그 사이 재적재 병합·re-key).
   - 잠금 순서 = §5(가족 → resource → 행). 가족 잠금은 잡지 않는다: 상태만 바꾸고 edge·dedup·generation을 건드리지 않으므로 가족 불변식(같은 아이템 축 PROVISION ↔ DELETE_ITEM 선형화)에 참여하지 않는다 — 그 판단은 실행 때 실행기가 다시 한다(PROVISION은 claim 뒤 가족 참여, DELETE_ITEM은 선형화). ⚠️ 검수 판단 요청.
2. `status='PENDING', attempts=0, next_attempt_at=localtimestamp, last_error`는 **남긴다**(화면이 "다시 시도 중 — 이전 실패: …"를 보일 수 있게, 성공하면 행이 지워진다), RESOLVE_PUSH면 `target - 'confirmRechecks'`(일괄 `retryDead()`와 같은 규칙). **generation은 올리지 않는다**(실행 중 행이 아니므로 완료 CAS를 깰 대상이 없다 — DEAD는 리스가 없다).
3. 커밋 뒤 `worker.wakeAfterCommit()`.
4. 후속 효과(문서·화면 안내): 이 행 뒤에 fence된 STAT·PROVISION·PUSH_CURRENT는 이 행이 완료(=삭제)될 때 edge CASCADE로 풀린다. fence된 PUSH_CURRENT는 claim될 때 값 나이 600초를 넘으면 폐기된다(기존 규칙) — 다음 5분 평가가 새 값을 다시 만든다. 다시 DEAD가 되면(충돌 미해결) 같은 자리로 돌아온다(자동 반복 없음).
- 일괄 `retryDead()`는 production 호출처를 만들지 않는다(사람이 하나씩 원인을 보고 누르게 — 충돌을 안 푼 채 일괄로 되살리면 같은 DEAD가 반복된다). 테스트용으로만 남긴다.
- **D3 유지**: 대조·평가는 계속 DEAD를 되살리지 않는다. 회복은 이 창구(사람) 또는 규칙 수정·resync(강제 PROVISION — §13 🟡3 묵시 부활, 단 DEAD hard RPUSH는 못 살림 §12.13)뿐.

### 16.4 상태 집계 보강(`ApmAlertZabbixStatusDto.commands`, 추가만)
`blocked`(도래했는데 선행에 막힌 PENDING 수 — `stats.blockedTotal`), `blockedByDead`(그 중 선행에 DEAD가 있는 수 — 새 집계, `blockedByMigratedDead`와 같은 쿼리에 filter 추가), `longestBlockedSec`. 기존 4필드 불변.

### 16.5 FE (워크트리 `apm-alert-history-fe`, 5b 계약 반영 + 새 패널)
1. 타입: `TApmAlertBindingSummary.queued·commandFailed`, `TApmAlertRuleDto.zabbixApply?`, `TApmAlertZabbixStatus.bindingQueued·commands`, SLO `burnAlert.zabbixSyncing`, 새 `TApmZbxCommandRow`.
2. `apmAlertSyncState`: `missing > drift > queued > pending > synced`(+`none`). 배지 문구 "Zabbix 반영 중"(톤 `warning`이 아닌 `info` 계열 — 기다리면 되는 정상 과정. `pending`과 구분). `missing`이고 `commandFailed>0`이면 툴팁에 "반영 명령이 멈췄습니다 — Zabbix 탭 '반영 명령'에서 원인을 확인하고 다시 시도" + `error` 원문.
3. 쓰기 후 폴링: 생성·수정·resync 응답의 `zabbixApply.state==='QUEUED'` 또는 목록의 어느 규칙이든 `bindings.queued>0`이면 규칙 목록 쿼리 `refetchInterval` 5초, 해소되면 끔. 상한 3분(넘으면 멈추고 "반영이 오래 걸립니다 — Zabbix 탭 확인" 안내, 수동 새로고침 가능). `FAILED`면 토스트에 `bindings.error`.
4. SLO 번 카드: `zabbixSyncing`이면 "Zabbix 반영 중" 태그.
5. Zabbix 탭(`ApmAlertZabbixTab`) 새 카드 **"반영 명령"**: 집계(대기·실행 중·멈춤·막힘·가장 오래 밀린 대기)와 세그먼트(멈춤 DEAD / 막힘 BLOCKED) 표. 열: 종류(한국어 명령명), 대상(규칙 종류·서비스/SLO 이름, 지워졌으면 "삭제된 규칙"), 사유(코드별 안내 + 원문 펼침), 기다리는 후속 수, 시도·마지막 변경 시각, 동작.
   - 동작 "다시 시도"(DEAD): AntD `Modal.confirm`(브라우저 dialog 아님)에 사유별 선행 조치 안내(NOT_OWNED = "Zabbix에서 이름 충돌을 먼저 푸세요 — 풀지 않으면 다시 멈춥니다"). 성공 시 목록·집계·규칙 목록 무효화.
   - 동작 "확인 완료"(UNIDENTIFIED만): 메모 입력 필수 모달 + "이 명령을 지우고 기다리던 명령을 풀어 줍니다(되돌릴 수 없음)" 경고. 운영 가이드 링크(`guides/ops_v79-predeploy-diagnostics.md` D2는 내부 문서라 화면엔 문구만).
   - 0건이면 카드는 집계만("멈춘 명령 없음").
6. i18n kr/en, 화면 도움말(`apmHelpContent`) 항목 추가, `queryKey` 추가. 계약 픽스처(`apm/contract/*.json`) 사본 동기화 + 새 목록 표본.
7. 라우트: 이미 `/setting/apm/alert-rules`(관리 콘솔). FE 브랜치는 master보다 7커밋 뒤 — 병합 때 합친다(이 단위에서 rebase하지 않음).

### 16.6 계약
`contract_apm-alert-zabbix-apply.md`에 §6(명령 장부 API·행 DTO·reason 코드)·§3 보강(blocked 3필드) 추가.

### 16.7 테스트
- BE IT(`ApmZbxCommandAdminIT`, 실 DB): DEAD 목록 target 해석(바인딩 있음/규칙 삭제됨/RCONF 무바인딩/`m:` 별칭) · reason 매핑 표 · `waiting`·`fencedPushes` 집계 · BLOCKED 목록 = stats 정의 · 개별 retry: DEAD→PENDING·attempts 0·last_error 유지·generation 불변·RESOLVE_PUSH 카운터 삭제 · 비 DEAD는 false · 동시 재적재(re-key)와 경쟁 시 false · retry 뒤 워커가 실행해 완료되면 후속 STAT이 풀림(Fake Zabbix) · NOT_OWNED 미해결이면 다시 DEAD · acknowledge: UNIDENTIFIED만·note 필수·released 반환 · 잠금 순서(retry가 적재와 교착 없음 — 두 스레드).
- MVC: 권한(edit 아님 → 403 code)·라이선스 만료여도 3 EP 통과(`requireApmEverLicensed`)·잘못된 status 파라미터.
- ArchUnit: 새 컨트롤러 경로가 브리지 쓰기를 부르지 않음(기존 규칙 범위 확인).
- FE jest: `apmAlertSyncState` 우선순위 표 · 배지 queued · 폴링 켜짐/꺼짐/상한 · 반영 명령 카드(빈/DEAD/BLOCKED, 다시 시도 모달 사유별 문구, 확인 완료 메모 필수) · 계약 픽스처 typecheck.

### 16.8 검수 판단 요청
1. 개별 retry가 가족 잠금 없이 resource → 행 잠금만 잡는 것이 안전한가(§16.3-1).
2. `last_error`를 PENDING 복귀 뒤에도 남기는 것 — 확인함: `ApmAlertService.summarize`는 `dead>0`일 때만 missing·commandFailed, PENDING이면 queued이고 `error`에 원문 폴백(일시 실패 백오프 PENDING과 같은 모양). 오판 없음으로 보지만 검수 확인 요청.
3. 라이선스 면제 범위(조회까지 면제하는가).
4. 일괄 retry 미노출 결정.

### 16.9 v2 — 코덱스 단위 8 설계 "조건부 진행"(`_archive/features/apm/alerts/review_apm-alert-unit8-design-20261020_codex.md`) 반영 (2026-10-20)
**🔴1 사유 매핑 정정**: DEAD 접두어는 `NEUTRALIZE_TIMEOUT:`(`ApmZbxResolvePushExecutor.HOLD_TIMEOUT_PREFIX`), `RPUSH_HOLD_WAIT:`는 상한 전 PENDING 재확인 사유다(§16.2 표 오기). 분류기는 **`command` 패키지의 `ApmZbxDeadReason.classify(lastError)`**(실행기 package-private 상수 직접 참조). 🟡 반영: RCONF의 수동 닫기 거부를 `MANUAL_CLOSE_DISABLED:` 접두어 + 코드 `MANUAL_CLOSE`로 분리(안내 = "Zabbix 트리거에서 수동 닫기를 허용하거나 문제를 직접 해소한 뒤 재시도"). 코드: `NOT_OWNED · NEUTRALIZE_TIMEOUT · UNIDENTIFIED · MANUAL_CLOSE · INVALID_COMMAND · OTHER`.

**🔴2 라이선스 만료 진입**: (BE) 목록 응답 `ApmZbxCommandPageDto{items,total,limit,offset,stats}` — `stats`는 DB 장부만으로 만든 집계(pending·processing·dead·oldestDueLagSec·blocked·blockedByDead·longestBlockedSec). 회복 카드는 `zabbix-status`(Zabbix 호출·라이선스 게이트)와 **독립**이다. (FE) 알람 규칙 라우트의 `FeatureGate fallback` = `has('APM')`(보유)인데 `allowsFeature` false(만료·보관)면 **업셀 + 회복 카드만** 그린다(규칙 편집·진단 탭은 열지 않는다). 진단 탭 안에서도 카드는 상태 조회 실패와 무관하게 렌더. (테스트) `LicenseArchitectureTest` 면제 허용 목록에 새 3 메서드 추가 + 자체 판정 검증. 되살린 PROVISION·STAT(on)·PUSH_CURRENT의 **실행기 라이선스 검사(DEFERRED)는 그대로** — 채널 선례와 다른 "실행기 검사 전제 예외"로 문서화.

**🔴3 확인 완료 = 본 버전에 한정**: 요청 `{note, expectedGeneration}`. 잠근 뒤 `generation`이 다르면 지우지 않고 `acknowledged=false, reason=GENERATION_CHANGED`(재확인 요구). 같은 트랜잭션에서 지우기 전 행 요약·직접 후속 id를 확보해 응답 `{acknowledged, reason?, released:[id], stillBlocked:[id]}`(`stillBlocked` = 다른 선행이 남은 후속). 감사 WARN은 커밋 뒤가 아니라 트랜잭션 안 — 롤백이면 남지 않도록 `afterCommit` 동기화로 기록. 행 DTO에 `generation` 포함.

**🔴4 대상 식별 정보**: 행 `target`에 `zbxIds`(`zbx_id ∪ target.zbxIds`), `host`·`itemKey`(DELETE_ITEM), 명령 스냅샷의 `ruleUid`(`rule_uid` 열)·`scopeUid`·`kind`(target) — 바인딩·규칙 조인이 실패해도 스냅샷으로 채운다. FE는 행 펼침(상세)으로 전부 보여 준다(확인 완료 모달에도).

**🔴5 폴링 조건·꺼진 규칙 배지**: (BE) `ApmAlertBindingSummaryDto.inFlight`(추가) = 대기·실행 명령이 있는 바인딩 수(**칸과 무관** — drift·missing 칸이어도 센다). (FE) 폴링 시작 = 목록의 `inFlight>0`(옛 응답은 `queued`) **또는** 쓰기 응답 `zabbixApply.state=QUEUED` **또는** retry 성공. 새 작업이 생기면 상한(3분)을 다시 잰다. 꺼진 규칙 배지: `commandFailed>0` → 반영 멈춤(빨강) · `inFlight>0`/`queued>0` → 반영 중 · 그 밖 "사용 안 함"(끄기 명령의 대기·실패를 감추지 않는다).

**🔴6 전 페이지 접근**: 서버 페이지(limit 50, offset) + 표 아래 페이지 이동(`DmoveTable showPagination=false` + `Pagination`). 정렬 id 오름차순 고정.

**🔴7 테스트 추가(§16.7 보강)**
- 잠금·CAS: retry ↔ 6b guard(양쪽 선점), retry ↔ worker claim(`SKIP LOCKED` — DEAD는 claim 대상 아님), 이전 claim의 늦은 결과가 새 실행을 못 바꿈(claim_token CAS), retry ↔ DELETE_ITEM 선형화·새 바인딩 예약.
- re-key: 재적재 먼저 → lane 변경 no-op(`LANE_CHANGED`), retry 먼저 → 성공 후 재적재 병합 수렴(경쟁이면 항상 false 단언 금지).
- 회복 체인: hard RPUSH(NOT_OWNED) 회복 후 STAT·PROVISION 진행 · NEUTRALIZE_TIMEOUT 카운터 초기화 후 실제 -1 성공 전 STAT 금지 · PUSH_CURRENT 600초 경계.
- 확인 완료: 중복 · retry와 경쟁 · generation 변경 · 다중 대상 · 선행 둘인 후속(`stillBlocked`) · 롤백 시 감사 없음.
- 라이선스·API: EXPIRED·ARCHIVED 통과, NONE·INVALID·APM 미보유 거부(`requireApmEverLicensed`), 되살린 실행은 라이선스 없으면 DEFERRED, body code 실패.
- FE: drift+PENDING·DEAD+PENDING·꺼진 규칙 배지, QUEUED 응답만으로 폴링 시작, 새 작업 시 상한 재설정, 2페이지 행 접근, 진단 API 실패에도 회복 카드 유지, 만료 fallback.

**🟡 반영**: `waiting` = 직접 후속 중 PUSH_CURRENT 제외(수·상위 5), `fencedPushes` = 직접 후속 PUSH_CURRENT 수(바인딩 전체 아님) — FE는 합치지 않고 따로 적는다. no-op 사유 코드 `NOT_FOUND · NOT_DEAD · LANE_CHANGED · GENERATION_CHANGED · NOT_UNIDENTIFIED`(화면이 "이미 처리됨"과 "아직 DEAD"를 가른다). DEAD 행에서 규칙으로 가는 링크(규칙 탭 `?rule=`) + "hard RPUSH 멈춤은 재동기화로 풀리지 않는다" 안내. queued 톤은 팔레트에 info가 없어 `warning` 유지(§16.5-2 정정).


## 17. 단위 6c 설계 — 알림 재조정 이어하기 + 단위 4 RESOLVED 누락 수정 (2026-10-21, 구현 전)

> 범위: BE `alert.notify`(활성화·재조정·outbox) + V88 + 계약 `contract_apm-alert-channels.md`. FE는 채널 API를 쓰지 않는다(grep 0건) — 변경 없음. 6b 2차 검수가 6c로 넘긴 🔴4(커서)·🔴5(57014)·🔴7(RESOLVED 누락)·2차 🔴5~8을 닫는다.
> 전제(10-21 사용자 결정): 알람 브랜치를 master(`1d50f6e`) 위로 rebase하고 V76~V80을 **V83~V87로 번호를 다시 매겼다**(outOfOrder 미사용). 6c 마이그레이션은 **V88**.

### 17.1 🔴 결함 — 활성화 때 열려 있던 이벤트가 bootstrap 전에 닫히면 FIRED·RESOLVED가 모두 없다(6b 2차 🔴7)
- 지금: `enqueueResolved`는 "그 채널 FIRED가 있는 활성 채널"에만 RESOLVED를 만든다(`ApmAlertNotificationOutbox:71`). bootstrap 페이지는 `resolved_at IS NULL`인 것만 FIRED를 만든다(`AlertChannelActivation:381`). 활성화 순간 열려 있던 이벤트가, bootstrap 커서가 거기 닿기 전에 닫히면 둘 다 건너뛴다. 클래스 주석의 "채널이 모르는 짧은 장애 = 켜기 전에 닫힌 것과 같다"는 틀렸다. 그 이벤트는 활성화 순간 **열려 있었으므로** 채널이 알아야 한다.
- **수정 A — 해소 시점에 짝을 만든다(시계 비교 없음).** 이벤트가 **지금** 닫힌다면 활성화 뒤에 닫히는 것이고, 활성화 순간 열려 있었거나 활성화 뒤에 열린 것이다. 둘 다 채널이 알아야 한다. 따라서 `enqueueResolved`는 활성 채널마다:
  1. 그 채널 FIRED가 있으면 RESOLVED(종전과 같다).
  2. 그 채널 FIRED가 **없으면 FIRED와 RESOLVED를 함께** 만든다(FIRED를 먼저 INSERT — id 순서. 디스패처는 FIRED가 SENT가 되기 전에는 RESOLVED를 claim하지 않는다 — `ApmAlertNotificationStore` 🔴6).
  - "해소만 가는" 일은 여전히 없다(코덱스 단위 2·3 🔴7의 의도 유지). 켜기 전에 열리고 닫힌 이벤트는 해소 트랜잭션이 채널 꺼짐을 보므로 행이 없다(종전과 같다).
  - FIRED가 SKIPPED·DEAD로 이미 있으면 1번 경로다(종전 처리: RESOLVED는 FIRED 상태를 보고 SKIPPED 또는 전송).
  - 직렬화: 해소 트랜잭션은 공유 advisory를 잡고 상태를 읽는다. 활성화 뒤집기(배타)의 앞이나 뒤에만 놓인다 — 앞이면 채널 꺼짐(행 없음, 활성화 순간 이미 닫힘), 뒤면 켜짐(짝 생성). bootstrap 페이지(배타)와도 직렬화되고 `ON CONFLICT DO NOTHING`이라 중복이 없다.
- **수정 B — 빈 없는 노드에서 열리고 닫힌 이벤트(롤링 배포 창)의 보충.** 빈이 없는 노드는 `registry.isEmpty()`라 적재를 아예 하지 않는다. 그 노드에서 닫힌 이벤트는 수정 A로도 잡히지 않는다. 재조정에서 채운다:
  - 채널 상태 행에 `activation_event_hwm bigint`(V88) — 켜는 트랜잭션(배타 잠금 안)에서 `coalesce(max(apm_alert_event.id), 0)`.
  - 재조정 페이지에 3번째 조건을 더한다: **닫힘 ∧ 이 채널 FIRED 없음 ∧ `id > activation_event_hwm`** → FIRED+RESOLVED. 그 hwm 뒤 id는 켠 뒤에 커밋된 이벤트다. 켤 때 아직 커밋되지 않았던 낮은 id는 아래 한계를 보라. 켠 뒤에 생긴 이벤트는 열렸든 닫혔든 채널이 알아야 한다.
  - `id ≤ activation_event_hwm`인 닫힌 이벤트 중 FIRED가 없는 것은 **켜기 전에 닫힌 것**과 **켠 뒤 빈 없는 노드에서 닫힌 것**을 시각 없이 가를 수 없다. `resolved_at`은 앱 시계, `activated_at`은 DB 시계다. 그래서 채우지 않는다(**한계 — 계약 §3에 명시**). 이 경우가 생기려면 이벤트가 켜기 전부터 열려 있었고, bootstrap이 거기 닿기 전에, 빈 없는 노드에서 닫혀야 한다. "빈을 모든 노드에 배포한 뒤 켠다"는 전제를 지키면 생기지 않는다.
  - id 순서 주의: 켤 때 커밋되지 않았던 낮은 id의 이벤트는 커밋 때 스스로 `enqueueFired`를 부른다(뒤집기가 공유 잠금 보유자를 기다리지 않고 try-lock하므로, 그 트랜잭션이 적재 단계에 들어가 있었다면 뒤집기가 실패하고 재시도). 빈이 있는 노드라면 FIRED가 생긴다. 빈 없는 노드에서 열렸고 id가 hwm 이하라면 수정 B의 한계와 같다.

### 17.2 세대(V88) — 6b 2차 🔴5
- `apm_alert_channel_state`에 `activation_generation bigint NOT NULL DEFAULT 1`, `activation_event_hwm bigint NOT NULL DEFAULT 0`.
- 켜기 UPSERT: 새 행이면 `generation = 1`. `enabled false → true`면 `generation = generation + 1`, `activation_event_hwm = (select coalesce(max(id),0) from apm_alert_event)`. `activated_at`은 감사 시각으로만 남긴다.
- 기존 행(V84 뒤 켜진 적이 있는 채널 — 운영 0개)은 DEFAULT 1/0을 받는다. hwm 0이면 수정 B의 3번째 조건이 모든 닫힌 이벤트(FIRED 없음)를 대상으로 삼는다. 운영에 등록 채널이 0개라 영향이 없다. 그래도 마이그레이션이 `enabled = true` 행의 hwm을 `max(id)`로 채운다(보수적 — 과거로 거슬러 짝을 만들지 않는다).

### 17.3 재조정 커서 — 서명된 불투명 값(6b 1차 🔴4 · 2차 🔴8 · 🟡)
- 형식: `v1.<base64url(payload)>.<base64url(HMAC-SHA256)>`. payload는 `channel|gen|after|hwm`(10진수, `|` 구분)이다. 키는 JWT 비밀에서 라벨 `moveseye/apm-alert/reconcile-cursor/v1`로 파생한다(`ApmExportPlanToken`과 같은 방식). 클래스는 `AlertReconcileCursor`.
- 검증 순서(실패는 전부 `APM_ALERT_RECONCILE_CURSOR_INVALID`, HTTP 400 + body code):
  1. 길이 ≤ 256.
  2. 점 3조각, 버전 `v1`.
  3. base64url 디코드.
  4. 서명 비교(`MessageDigest.isEqual`, 상수 시간) — 서명 전에는 payload를 해석하지 않는다.
  5. 필드 4개를 엄격히 파싱(음수 금지, 앞뒤 공백 금지).
  6. `channel`이 경로 키와 같은지.
  7. `0 ≤ after ≤ hwm`.
- `gen`은 **각 페이지 트랜잭션에서** 배타 잠금을 잡은 뒤 상태 행과 비교한다. 다르면 첫 페이지에서는 `CURSOR_INVALID`(그 사이 껐다 켰다 — 새 활성화가 자기 보충을 했다)로 거부한다. 도중 페이지에서는 `complete=false`·`nextCursor=null`·`superseded=true`로 멈춘다.
- 커서 없이 부르면: 첫 페이지 트랜잭션(배타 잠금 안)에서 `gen`과 `hwm = coalesce(max(id),0)`을 읽어 **유효 커서 `{gen, after=0, hwm}`를 먼저 확정**한다(2차 🔴8 — 첫 페이지가 57014여도 돌려줄 커서가 있다). 첫 트랜잭션이 커밋되기 전에 실패하면 그 값은 버려진다. 그때는 `nextCursor=null`이고, 다시 부르면 처음부터다(멱등).
  - 활성화는 뒤집기 트랜잭션에서 `gen`·`hwm`을 정하고(같은 값을 `activation_event_hwm`에도 쓴다), 그 커서로 보충을 시작한다.
- 빈 테이블이면 hwm=0, 곧바로 `complete=true`.

### 17.4 페이지 — 원시 id 구간(6b 2차 🔴6)
- 페이지마다 새 트랜잭션에서:
  1. 배타 try-lock을 잡는다.
  2. 상태와 세대를 확인한다.
  3. `SET LOCAL statement_timeout = :ms`(설정 `reconcile-statement-timeout-ms`, 기본 5000).
  4. **구간 경계**: `select max(id) from (select id from apm_alert_event where id > :after and id <= :hwm order by id limit :pageSize) x` → `end`(null이면 `end = hwm`).
  5. 그 구간 `(after, end]` 안에서 할 일이 있는 행만 `for key share nowait`로 잠근다. 조건 셋:
     - 열림 ∧ FIRED 없음
     - 이 채널 FIRED 있음 ∧ 닫힘 ∧ RESOLVED 없음
     - 닫힘 ∧ FIRED 없음 ∧ `id > activation_event_hwm`
  6. 그 id들에 FIRED와 RESOLVED를 INSERT(`ON CONFLICT DO NOTHING`).
  7. 커밋하고 `after = end`. `end == hwm`이면 `complete=true`.
- 할 일이 0건이어도 `after`가 전진한다. 그래서 유한 번에 끝난다. 이력이 커도 한 페이지는 PK 범위 `pageSize`행만 본다.
- VERIFY phase는 **두지 않는다**. 6b 1차 🔴4의 VERIFY는 "커서 아래 이벤트의 후발 해소"를 덮으려던 것이다. 수정 A로 해소 시점에 짝이 생기므로, 커서 아래에서 나중에 닫힌 이벤트도 빈이 있는 노드라면 스스로 FIRED·RESOLVED를 갖는다. 빈 없는 노드의 경우는 수정 B의 3번째 조건이 덮는다(hwm 뒤는 같은 세대의 다음 재조정이 다시 본다). **검수 판단 요청**.
- 시간 상한(`reconcile-max-seconds`) 도달 시 `complete=false`, `nextCursor`는 마지막으로 커밋한 페이지 뒤 커서다.
- 페이지 사이 양보는 종전과 같다(잠금을 놓고 다음 try-lock). sleep은 넣지 않는다 — 대기 중인 공유 잠금 보유자가 먼저 받는다(기존 공정성 IT 유지).

### 17.5 statement timeout(57014) — 6b 1차 🔴5 · 2차 🔴8 · 🟡
- cause chain 전체에서 `SQLException.getSQLState() == "57014"` **그리고** 메시지에 `statement timeout`이 있을 때만 시간 초과로 본다(`ApmArchiveSource:639` 선례). 그 밖의 57014(사용자 취소·종료)는 그대로 던진다.
- 시간 초과면 그 페이지 트랜잭션 전체가 롤백된다. 그 페이지는 집계에서 빼고, 결과는 `timedOut=true`·`complete=false`·`nextCursor = 마지막으로 커밋된 커서`(첫 페이지면 17.3의 유효 커서)다. HTTP 200(부분 결과), 로그는 WARN.
- `withRetry`(잠금 경합 재시도)는 57014를 재시도하지 않는다(종전 `isLockConflict`에 없다 — 유지).

### 17.6 API·결과(추가만)
- `POST /apm/alert-channels/{channel}/reconcile?cursor=...`(선택). `activate`는 그대로다.
- `Result`에 필드 셋을 더한다(이름 유지):
  - `nextCursor`(String, 완료·중단이면 null)
  - `timedOut`
  - `superseded`
- 기존 `bootstrapFired`·`catchUpResolved`는 의미를 넓힌다. 수정 B의 짝은 각각 FIRED·RESOLVED에 센다.
- 새 오류 코드 `APM_ALERT_RECONCILE_CURSOR_INVALID`(ErrorCode, HTTP 400).
- 계약 `contract_apm-alert-channels.md`: §1 표(쿼리 `cursor`), §3(페이지 = 원시 id 구간, 이어하기, 수정 A·B, 한계), §4 타입, 오류 코드, 변경 이력.

### 17.7 테스트(IT, 격리 DB 5434 — `ApmAlertNotificationIT`·`ApmAlertNotificationDispatchIT`에 추가 또는 새 `ApmAlertReconcileCursorIT`)
- **수정 A**
  - 활성화 뒤 bootstrap 페이지 전에 닫힌 이벤트에 FIRED·RESOLVED가 둘 다 생기고, 디스패처가 FIRED → RESOLVED 순으로 보낸다.
  - 켜기 전에 열리고 닫힌 이벤트에는 행이 0건이다.
  - FIRED SKIPPED 이벤트가 닫히면 RESOLVED만 생긴다(짝을 새로 만들지 않는다).
  - 같은 이벤트를 bootstrap과 해소가 경쟁해도 행은 각 1건이다.
- **수정 B**
  - 빈 없는 노드에서 열리고 닫힌 이벤트(`id > activation_event_hwm`)를 재조정이 짝으로 채운다.
  - `id ≤ hwm`의 닫힌·FIRED 없는 이벤트는 채우지 않는다(한계 고정 테스트).
  - 재활성화는 hwm을 새로 정한다.
- **커서**
  - 상한에 걸려 nextCursor를 받고 이어 부르면, 검사 구간 합이 전체와 같고 앞부분을 다시 보지 않는다.
  - 같은 커서로 다시 불러도 멱등이다.
  - 서명 위조·다른 채널·gen 불일치(껐다 켬)·`after > hwm`·버전 미지원·길이 초과·필드 이상은 전부 `CURSOR_INVALID`다.
  - 도중 세대가 바뀌면 superseded로 멈춘다.
  - 빈 테이블이면 complete다.
- **원시 구간**: 할 일 0건인 대량 이력(예: 5,000행, pageSize 500)이 정확히 ⌈N/500⌉ 페이지에 끝나고 nextCursor가 전진한다.
- **57014**
  - 첫 페이지에서 시간 초과(테스트 훅으로 `pg_sleep`, timeout 50ms)가 나면 유효 커서를 돌려주고, 그 페이지 행은 0건이다.
  - 도중 페이지에서 시간 초과가 나면 직전 커서를 돌려주고 집계에서 뺀다.
  - 사용자 취소 57014는 그대로 던진다.
- 기존 활성화·재조정·폐기·공정성 IT 회귀.
- **뮤테이션**
  - 짝 생성 제거
  - 3번째 조건 제거·hwm 무시
  - 구간 경계 대신 actionable limit
  - gen 비교 제거
  - 첫 페이지 유효 커서 대신 null
  - 57014 판정 제거

### 17.8 잠금 순서 — 바뀌지 않는다
해소 경로: … → 이벤트 → 통지(공유 advisory). 짝 INSERT도 공유 잠금 안이다. 재조정 페이지: 통지(배타 try) → 이벤트(KEY SHARE NOWAIT). 새 잠금은 없다.

### 17.9 검수 판단 요청
1. VERIFY 폐지(17.4) — 수정 A·B로 VERIFY의 목적이 사라졌다는 판단이 맞는가.
2. 수정 B의 한계(`id ≤ activation_event_hwm`의 닫힌·FIRED 없는 이벤트, 빈 없는 노드에서 닫힘)를 문서화된 한계로 두는 것. 대안은 이벤트 행에 DB 시각 `resolved_db_at`을 더해 `activated_at`과 같은 시계로 비교하는 것이다. 이벤트 표 변경이 필요하다.
3. 해소 시점 짝(수정 A)이 이벤트 대량 해소(전역 규칙 끄기 = 수천 건) 때 공유 잠금 안에서 INSERT를 두 배로 하는 비용 — 배열 파라미터 한 문장씩이다(FIRED 없는 것만 FIRED, 그다음 RESOLVED).

### 17.10 v2 — 코덱스 6c 설계 1차 "재설계 필요"(`_archive/features/apm/alerts/review_apm-alert-unit6c-design-20261021_codex.md`) 반영 (2026-10-21)
§17.3·17.1 수정 B 설명·17.5·17.6 오류 응답·17.7을 아래로 **대체·보강**한다. 수정 A·세대·원시 구간·VERIFY 폐지(조건부 찬성)는 유지한다.

**🔴1 초기 커서 = 별도의 짧은 트랜잭션에서 확정한다**
- 커서 없는 `reconcile`:
  - **초기화 트랜잭션**: 배타 try-lock(`withRetry`) → 채널 켜짐 확인(꺼짐이면 `ChannelInactive` → `STATE_INVALID`, 종전과 같다) → `gen`·`hwm = coalesce(max(id),0)`을 읽는다 → 커밋. 쓰기는 없다.
  - 그 뒤 보충 페이지를 실행한다. 첫 페이지가 57014면 그 **초기 커서**(`after=0`)를 돌려준다.
- 초기화 자체가 실패하면(잠금 재시도 창 초과 등) 커서 없이 종전 오류(`CHANNEL_BUSY` 등)가 난다. "초기화 실패"(오류 응답)와 "보충 페이지 timeout"(200 + `timedOut=true` + 커서)은 이렇게 갈린다.
- 활성화: 뒤집기 트랜잭션이 커밋되면 거기서 정한 `gen`·`hwm`이 초기 커서다. 뒤집기 실패는 종전 오류이고 커서는 없다.
- 커서를 받은 `reconcile`은 초기화 없이 그 커서로 페이지를 시작한다. 첫 페이지 트랜잭션에서 gen이 다르면 `CURSOR_INVALID`다.

**🔴2 수정 B = "hwm 조회 스냅샷" 기준의 제한적 복구(정확한 활성화 경계가 아니다)**
- `activation_event_hwm`은 뒤집기 트랜잭션의 SELECT가 **본** 최대 id다. 빈 없는 노드는 공유 advisory에 참여하지 않으므로 경계는 양쪽으로 어긋날 수 있다.
  - **과잉**: hwm을 읽은 뒤부터 뒤집기가 커밋되기 전까지 빈 없는 노드가 열고 닫아 커밋한 이벤트(id > hwm). 활성화 커밋 직전 몇 ms 안에 닫힌 장애에 짝이 한 쌍 갈 수 있다. "해소만"이 아니라 열림·해소가 함께 가므로 수신 측 상태는 맞다.
  - **과소**: 낮은 id를 먼저 할당했지만 늦게 커밋한 이벤트, 그리고 `id ≤ hwm`의 닫힌·FIRED 없는 이벤트.
- 계약 §3에 "롤링 배포 중(해당 채널 빈이 없는 노드가 있는 동안)의 보충은 **최선 노력**이며 열림·해소를 함께 보내는 쪽으로만 어긋난다(해소만 가지 않는다). 완전성은 **해당 채널 빈이 모든 노드에 배포된 뒤 켰을 때만** 보장한다"고 쓴다.
- `complete=true`의 의미는 "**이 커서의 고정 구간 `(0, hwm]`을 끝까지 훑었다**"로 한정한다. 그 구간에서 나중에 커밋된 낮은 id나, 빈 없는 노드가 뒤늦게 닫은 이벤트는 그 커서를 이어 불러도 다시 보지 않는다. 보충하려면 **커서 없이 새 스캔**을 시작한다(🟡2 반영 — 계약 §1의 "배포 완료 뒤 한 번 재조정" 문구를 "배포 완료 뒤 커서 없이 한 번"으로 바꾼다).
- 🟡3: "빈 없는 노드"는 **그 채널의 빈이 없는 노드**로 쓴다(다른 채널 빈이 있어도 `s.channel = any(registry.keys())`에서 빠진다 — `ApmAlertNotificationOutbox:58`).

**🔴3 오류 응답 = 전역 규약(HTTP 200 + body `code:400`)**
- `ApiError(ErrorCode.APM_ALERT_RECONCILE_CURSOR_INVALID, 메시지)`, 기본 상태(`GlobalExceptionHandler:37·43`, 계약 §0의 규약)를 쓴다. 실제 HTTP 400은 쓰지 않는다.

**🔴4 커서 payload — 채널을 마지막 필드로(무손실)**
- payload = `gen|after|hwm|channel`(UTF-8). 파싱은 `split("\\|", 4)` — 앞 셋은 엄격한 10진수(`[0-9]{1,19}`, long 범위)이고 넷째는 나머지 전부다(`|` 포함 가능). 서명이 먼저 검증되므로 조작된 payload는 해석 단계에 오지 않는다.
- 길이 상한: 채널 키는 `AlertChannelRegistry.MAX_KEY_LENGTH`(32자, V84 `varchar(32)`) — UTF-8 최대 128바이트. payload ≤ 19×3+3+128 = 188바이트 → base64url 251자 + MAC 43자 + 고정부 4자 ≈ 300자. **커서 상한 512자**(상수 + 32자 4바이트 문자 키 왕복 테스트로 고정).

**🟡 반영**
1. **수정 A를 한 문장으로** — 두 INSERT 사이에 일시정지가 끼면 READ COMMITTED의 문장별 스냅샷 때문에 "FIRED만 있고 RESOLVED 없음"이 생길 수 있다. 그 상태는 다시 켤 때의 보충이 고치지만 피할 수 있다. 그래서 `enqueueResolved`를 CTE 한 문장으로 쓴다.
   - `ch`(활성 채널) → `newf`(FIRED 없는 (이벤트, 채널)에 FIRED INSERT … RETURNING) → RESOLVED INSERT의 대상은 `(기존 FIRED ⋈ ch) ∪ newf`.
   - 한 스냅샷이라 채널 집합이 두 INSERT에서 같다.
   - CTE가 INSERT한 행은 본문 스캔에 보이지 않으므로 `newf`의 RETURNING을 합친다.
2. **디스패처 순서 설명 정정**: RESOLVED claim 조건은 같은 채널 FIRED가 SENT이거나 **DEAD이면서 결과 불명**(`delivery_uncertain`)일 때다. 확실히 미전송인 DEAD와 SKIPPED는 RESOLVED를 SKIPPED로 만든다(`ApmAlertNotificationStore:147·191`). 짝으로 새로 만든 FIRED는 PENDING이라 정상 경로를 탄다.
3. **57014 정책 표기**: cause chain 탐색은 선례(`ApmArchiveSource:643`)와 같다. `statement timeout` 메시지 검사는 이번에 강화한 정책이다. 같은 페이지가 반복해서 timeout이면 자동 전진은 보장되지 않는다. 결과의 `timedOut=true`와 로그(페이지 구간 `after`~`hwm`, 페이지 크기)를 보고 운영자가 `reconcile-statement-timeout-ms`를 올리거나 `reconcile-page-size`를 줄인다(계약 §3에 명시).

**§17.7 테스트 보강(위 대체분 포함)**
- 초기화: 첫 페이지 57014 → 200 + 초기 커서(`after=0`, 그 hwm)·0행 / 그 커서로 재호출하면 같은 hwm으로 이어진다 / 초기화 잠금 실패 → `CHANNEL_BUSY`(커서 없음).
- 수정 A
  - 한 문장 — 짝 생성 중 일시정지 경쟁에서 FIRED와 RESOLVED가 같이 있거나 같이 없다(mutation: 두 문장으로 쪼개면 실패. 결정적 재현은 문장 사이 훅으로).
  - 짝 생성 뒤 일반 폐기(FIRED PENDING·RESOLVED PENDING → 둘 다 SKIPPED)와 강제 폐기.
  - 확실한 DEAD FIRED → RESOLVED SKIPPED / 결과 불명 DEAD FIRED → RESOLVED 전송.
  - 짝의 단건 재시도.
- 커서: `|`를 포함한 채널 키 왕복 / 오류가 body `code:400` + `APM_ALERT_RECONCILE_CURSOR_INVALID`(HTTP 200).
- 수정 B: 과잉 창 — hwm 조회 뒤·뒤집기 커밋 전에 커밋된 닫힌 이벤트(빈 없는 노드 흉내 — registry를 비운 적재)에 짝이 생긴다(계약 문구 고정) / 과소 — `id ≤ hwm` 닫힘·FIRED 없음은 채우지 않는다.
- complete 범위: 완료 뒤 구간 안에 늦게 커밋된 낮은 id는 같은 커서로 재방문하지 않고, 커서 없는 새 스캔이 채운다.

**6c 설계 2차 결과: 진행**(`_archive/features/apm/alerts/review_apm-alert-unit6c-design-20261021_codex_r2.md`) — 새 🔴 없음, §17.9 세 항목 모두 찬성. 🟡 반영 예정: ① 늦은 커밋 테스트를 `activation_event_hwm < id ≤ 이전 스캔 hwm`(새 스캔이 수정 B로 보충) / `id ≤ activation_event_hwm`(새 스캔도 제외) / 열림·FIRED 있는 닫힘(다른 조건)으로 나눈다 ② 문구 "보충할 때는 짝으로 보내지만 일부 이벤트는 짝 자체가 누락될 수 있다 — 해소 단독 방지와 보충 완전성은 별개" ③ 보충 문자 키 테스트는 Registry 통과 16자, 128바이트 상한은 커서 codec 단위 테스트로 ④ 페이지 크기·timeout은 절대 비용 상한이 아니다(문장별 timeout, 경계 조회 뒤 늦은 커밋).


## 18. dev Zabbix 7.0.6 실측(2026-10-21) — clock 역전·같은 초·켤 때 판정 → 🔴 승격 + 단위 7b 설계(구현 전)

### 18.1 실측(dmove.co.kr, 임시 호스트·그룹 `moveseye-qa-probe-20261021-*` — trapper float 아이템 + `last(/h/k)>0` 트리거, 끝난 뒤 삭제 확인 0/0)
스크립트 `_archive/features/apm/alerts/zbx_clock_probe_20261021.py`, 출력 `…/zbx_clock_probe_20261021.log`. 모든 push는 과거 clock(단조 기준)·ns=0.

| # | 동작 | item `lastvalue` | 트리거 |
|---|---|---|---|
| a1 | 양수 5 @t | 5 | PROBLEM(t) |
| a2 | 0 @t+20 | 0 | OK(t+20) |
| **a3** | **옛 양수 9 @t+10(0보다 이른 clock)을 뒤에 push** | **0 그대로(clock 순)** | **🔴 PROBLEM(lastchange = t+10), 열린 채 유지** |
| a4 | 더 옛 양수 @t-30 | 0 | PROBLEM 유지(새 값 올 때까지) |
| b1 | 같은 초·ns=0으로 -1, 0, 7을 **따로 세 번** | **-1**(history에 1행만) | OK |
| b2 | 같은 초·ns=0으로 -1, 0, 7을 **한 번에** | **-1**(1행만) | OK |
| b3 | 같은 초·ns=0으로 7, 0, -1을 한 번에 | **7**(1행만) | PROBLEM |
| c1~c5 | 0(OK) → 트리거 끔 → 양수 4 → 켬 → 5·25·85초 관찰 | 4 | **OK 유지(켤 때 판정 안 함)** |
| c6 | 켠 뒤 새 양수 4 | 4 | PROBLEM |

해석:
- **(a) 🔴 확정** — `last()`(아이템 마지막 값)는 clock 순이지만 **트리거는 값이 도착할 때 그 값으로 판정한다**. 이미 0으로 정리된 뒤 옛 clock의 양수가 도착하면 거짓 Problem이 열리고, 다음 값이 올 때까지 닫히지 않는다. §14.7 🟡1·§14.8에서 적은 "되돌아가면 즉시 🔴" 조건이다.
- **(b) 🔴 새 발견** — 같은 `(clock, ns)` 값은 **처음 것만 저장되고 나머지는 응답이 success여도 버려진다**(같은 호출 안에서도). 우리 push는 모두 초 단위·`ns=0`(`PushValue.at`)이다. 그래서 같은 초에 "-1 정렬 → 현재 값"을 밀면 현재 값이 사라진다. `enqueueNeutralizeThenEnable`이 다시 적재하는 대기 값은 **옛 clock**(`v.clock()`)을 그대로 쓰는데, -1은 `now`다 → (a)와 (b) 모두에 걸린다.
- **(c) 켤 때 판정하지 않는다** — 다음 값이 와야 판정한다. §13.3의 "-1 정렬 → 켜기 → 현재 값"은 필요 이상으로 보수적이지만 해는 없다(켠 뒤의 현재 값 push가 판정을 만든다). 바꾸지 않는다.

### 18.2 단위 7b 설계 — 아이템별 단조 Zabbix 시각 + 측정 표본 신선도
**목표**: 같은 아이템에 대해 (1) Zabbix로 가는 `(clock, ns)`가 도착 순서와 같은 순으로 **엄격히 증가**하고, (2) 이미 반영한 표본보다 **오래된 측정 표본은 밀지 않는다**. (1)만 하면 늦은 옛 양수가 "새 시각"으로 들어가 거짓 Problem이 남고, (2)만 하면 같은 초 버림·도착 역전이 남는다 — 둘 다 필요하다.

1. **V89 `apm_zbx_item_push_mark`** — `item_resource varchar PK`(`ApmZbxCommandKeys.itemResource(host, key)` — 공유 아이템은 여러 바인딩이 같은 행), `last_clock bigint`, `last_ns int`, `last_sample_sec bigint null`(마지막으로 민 **측정 표본**의 시각), `updated_at`.
2. **`ApmZbxItemPushClock`(새, bridge 아래)** — 두 push 입구(`ZabbixAlertBridge.pushUnmeasurable`·`pushCurrent`)가 반드시 거친다(ArchUnit: `history.push` 호출은 이 클래스 경유만).
   - **아이템별 직렬화**: JVM 안 아이템 키별 잠금(striped)으로 "예약 → push"를 감싼다. 같은 아이템의 두 바인딩 lane이 동시에 밀어도 도착 순서 = 예약 순서.
   - **예약(짧은 트랜잭션, 커밋)**: 행 `FOR UPDATE`(없으면 INSERT) →
     - 측정 표본(`PUSH_CURRENT`)이고 `sample_sec < last_sample_sec`면 **밀지 않는다**(`STALE_SAMPLE`, 명령은 완료 — 더 새 표본이 이미 반영됐다). 같으면 민다(켜기 뒤 같은 표본 재적용).
     - 시각 = `clock = max(원하는 clock, last_clock)`, `clock == last_clock`이면 `ns = last_ns + 1`(999,999,999를 넘으면 `clock + 1, ns 0`), 아니면 `ns = 0`. 그 값으로 행을 갱신하고, 측정 표본이면 `last_sample_sec = max(last_sample_sec, sample_sec)`.
     - 커밋 뒤 트랜잭션 밖에서 `history.push(value, clock, ns)`.
   - **push 실패**: 행은 이미 전진했다. 같은 명령의 재시도는 더 큰 `(clock, ns)`를 받으므로 순서가 지켜진다. 실패한 값이 끝내 DEAD여도 "그보다 옛 표본을 막는다"는 방향으로만 보수적이다(다음 평가가 더 새 표본을 민다).
   - **-1(RPUSH·NEUTRALIZE)** 은 측정 표본이 아니다 — `last_sample_sec`를 건드리지 않고 시각만 단조로 받는다. 그래서 "-1 → 켜기 → 현재 값"의 현재 값은 -1보다 뒤 `(clock, ns)`로 들어가고(같은 초 버림 없음), 표본 신선도 검사만 받는다.
3. **표본 시각(sample_sec)의 출처** — 지금 PUSH_CURRENT의 `cutoff`(clock)는 5분 판정의 `now`(잠금 전)이다. §14.7 🟡1의 지적대로 **STUCK 계열은 감시기 공개 스냅샷의 `tickMs`**가 실제 표본 시각이다. 감시기 조회 API가 값과 함께 `tickMs`를 돌려주고, 판정이 STUCK 규칙의 PUSH_CURRENT에 그 값을 표본 시각으로 싣는다. 1초 장부의 settle 0도 그 tick 시각이다. 롤업 계열 규칙은 창 끝(`now`)이 표본 시각이다. 명령 `target`에 `sampleSec`(없으면 `cutoff`)를 더한다(추가만 — 옛 행 호환).
4. **다중 노드**: JVM 잠금은 노드 안에서만 직렬화한다. 두 노드가 같은 아이템을 거의 동시에 밀면 도착이 예약 순서와 어긋날 수 있다(행 단조성은 DB가 지킨다). 설치형 단일 노드 전제 — 호스트 생성 직렬화(§13.8 D4)와 같은 한계로 기록하고, 순위 15(다중 노드)로 넘긴다.
5. **테스트**
   - FakeZabbix를 실측대로 바꾼다: 같은 `(clock, ns)`는 처음 것만, 트리거는 도착 값으로 판정.
   - 단위: 예약 규칙(같은 초 ns 증가·ns 넘침·옛 clock 끌어올림·옛 표본 거부·같은 표본 허용·-1은 표본 무변경).
   - IT: (가) settle 0 실행 뒤 옛 표본 양수 PUSH_CURRENT → 밀지 않음, 트리거 OK 유지 (나) 같은 초 -1 → 켜기 → 현재 값이 버려지지 않음 (다) 공유 아이템 두 바인딩 동시 push의 도착 순서 = 예약 순서 (라) push 실패 뒤 재시도의 단조성.
   - 뮤테이션: 표본 검사 제거 · ns 증가 제거 · 잠금 제거 · -1이 표본을 갱신.
   - 구현 뒤 dev Zabbix 재실측(같은 스크립트를 할당기 경유로) — a3·b1이 사라지는지.
6. **범위 밖(그대로)**: (c)에 따른 §13.3 순서 단순화(해가 없어 유지) · 공유 아이템 -1 생략 위험(§13.9 🟡2, 별개).

### 18.3 검수 판단 요청
1. (1)+(2) 조합이 (a)·(b)를 닫는가. 특히 "Zabbix 시각은 지금 쪽으로 끌어올리고, 늦은 값은 표본 시각으로 거른다"는 분리가 맞는가.
2. 표본 시각 출처 — STUCK은 `tickMs`, 롤업은 창 끝. 다른 축(SLO 번 레이트·수집기 정지 등)에 빠진 것이 없는가.
3. JVM 잠금 + DB 예약 대신 push를 아이템 lane(`i:`)으로 옮기는 안 — fence 구조(바인딩 lane)와 충돌해 고르지 않았다. 판단 요청.
4. 예약 커밋 뒤 push 실패 시 "행만 전진"의 부작용.

### 18.4 v2 — 코덱스 7b 설계 1차 "재설계 필요"(`_archive/features/apm/alerts/review_apm-alert-unit7b-design-20261021_codex.md`) 반영 (2026-10-21)
§18.2를 아래로 **보강·대체**한다. 유지하는 것: 전송 시각과 표본 시각의 분리, 바인딩 lane 유지와 아이템 단위 전송 직렬화(§18.3-3 지지).

**실측 해석 정정(18.1)**
- b는 "저장은 첫 값만"이 확인된 사실이다. "나머지도 success 응답"은 원시 출력에 항목별 ACK가 없어 **확인되지 않았다**. 재실측에서 항목별 ACK를 기록한다.
- c는 "기존 트리거를 끈 뒤 켬"에만 해당한다. 트리거 생성·아이템 재활성화까지 일반화하지 않는다(§13.3 순서는 그대로 둔다).

**🔴1 대기 값 병합도 표본 시각으로**
- PUSH_CURRENT `target` = `{value, sampleMs, clock}`(한 묶음). 표본 시각은 **ms**로 둔다(🟡 — 초로 줄이면 tick 정밀도를 잃는다).
- 저장소 upsert 병합 규칙: `excluded.cutoff >= c.cutoff` 대신 **`sampleMs`가 큰 쪽**을 남긴다(값·표본·clock을 함께 바꾼다). 같으면 나중 적재. 반례 "settle 0(sample 101) 대기 중에 옛 양수(sample 100, cutoff 101)가 들어와 0을 지움"이 닫힌다.
- `pendingPush` 재적재(`enqueueNeutralizeThenEnable`, §13.3)는 `{value, sampleMs}`를 그대로 옮긴다. clock은 할당기가 정하므로 옛 clock을 보존할 필요가 없다.
- 감시기: STUCK 평가와 장부 fire/settle은 **같은 `Snapshot`에서 값과 `tickMs`를 한 번에** 받는다(`ApmStuckRequestMonitor` 조회 API가 `(value, tickMs)`를 돌려준다).
- 표본 출처표(코덱스 §18.3-2 그대로 채택):

  | 종류 | 표본 시각 |
  |---|---|
  | STUCK 평가·장부 fire/settle | 같은 tick의 `tickMs` |
  | ERROR_RATE·P95_LATENCY·ACTIVE_REQUESTS_SPIKE·COLLECTOR_FAILURE | 계산 창 끝(`now`) |
  | SLO_BURN | 네 창이 공유하는 `windowEnd`(측정 결과 -1도 표본이다) |
  | STALE | 경과 시간을 계산한 평가 기준 시각 |
  | ARCHIVE_HOLD | 보류 건수를 관측한 시각 |
  | RPUSH·NEUTRALIZE(-1 정렬) | 표본 아님 — 표본 watermark를 갱신하지 않는다 |

**🔴2 전환 규칙(배포 시점)**
- 배포 방식은 설치형 단일 노드의 **중지 후 일괄 교체**다(§12.9·`guides/ops_v79-predeploy-diagnostics.md`). 옛 워커는 새 코드가 뜨기 전에 멈춰 있다.
- **옛 PUSH_CURRENT 행(sampleMs 없음)**: STUCK 계열이면 **밀지 않고 완료**한다(`LEGACY_SAMPLE_DROPPED` 로그). 표본 시각을 복원할 수 없고, 다음 평가 회차가 새 표본으로 다시 적재한다. 롤업·SLO·STALE·ARCHIVE_HOLD는 옛 `cutoff`가 곧 창 끝 = 표본 시각이라 `sampleMs = cutoff × 1000`으로 읽는다.
- **빈 watermark의 첫 예약**: 행이 없으면 `clock = max(원하는 clock, 벽시계 지금 초) + 1`, `ns = 0`에서 시작한다. 옛 코드가 민 clock은 모두 그 push의 적재 시각 이하이고 적재 시각은 배포 전이므로 지금보다 작다 → 첫 tuple이 기존 이력보다 엄격히 크다. Zabbix 조회가 필요 없다. 벽시계 역행은 지원 범위 밖으로 기록한다.

**🔴3 잠금 대기 = 리스 예산 안 + 획득 뒤 재검증**
- 순서: (트랜잭션 없음 — `requireNoTransaction`) → 아이템 잠금 `tryLock(lockWaitMs)`(설정 `push-lock-wait-ms`, 기본 5000). 못 잡으면 RETRY(백오프, DEAD 아님) → **잡은 뒤** `ctx.renew()`(claim·generation·리스 재확인 — 실패면 쓰지 않고 끝) + 값 나이 재확인(`max-age`) → 예약 트랜잭션(짧게, 커밋) → 트랜잭션 밖 push → 잠금 해제.
- JVM 잠금을 쥔 채 트랜잭션을 열고 기다리는 경로는 없다. 예약 트랜잭션은 잠금을 잡은 **뒤**에 열고, push 전에 닫는다.
- 리스 검증식에 잠금 대기를 더한다. PUSH_CURRENT와 RPUSH의 `maxZabbixCalls × callTimeout + lockWait + slack < lease`를 기동 검증으로 고정한다(`ApmZbxCommandProperties`·`ApmZbxCommandPropertiesTest`).

**🔴4 결과를 모르는 전송(timeout·응답 유실) — 남는 위험으로 명시**
- 확정 실패에서 예약 번호가 비는 것은 무해하다(Zabbix는 빈 번호를 모른다).
- timeout이나 응답 유실이면 원격 처리 여부를 확정할 수 없다. 그 옛 값이 원격에서 늦게 처리되면 더 큰 tuple의 새 값보다 늦게 도착할 수 있고, a3처럼 거짓 Problem이 날 수 있다. JVM 잠금과 DB 예약으로는 이를 막지 못한다.
- 수렴: 활성·측정 가능 대상은 매 5분 회차에 현재 값을 다시 민다(§1 표 1행). 그래서 거짓 상태는 **최대 한 평가 주기** 안에 새 tuple로 덮인다. 결과를 모르는 실패가 나면 해당 아이템에 "다음 회차 강제 재push" 표식을 남긴다(값 변화가 없어도 민다). **엄격한 도착 순서는 정상 전송에 한해 보장한다**고 계약·주석에 적는다.

**🟡 반영**
- `last_sample_ms`의 의미는 "마지막으로 **예약한** 표본"이다(전송 실패에도 전진). `STALE_SAMPLE` 완료는 배달 성공으로 치지 않는다 — 캐시 준비·오류 배지를 해제하지 않는다.
- 다중 노드에서는 다른 tuple이 역순으로 도착해 a3가 재현될 수 있다. HA 안전성을 주장하지 않는다(순위 15).
- 재실측 항목: 항목별 ACK, 같은 초·서로 다른 ns(ns 1·2가 순서대로 반영되는가), 기존 이력이 있는 아이템의 첫 예약, 대기 0과 옛 양수의 병합 결과, 잠금 대기 중 claim 상실.

**V89(확정안)**: `apm_zbx_item_push_mark(item_resource varchar(300) PK, last_clock bigint not null, last_ns int not null, last_sample_ms bigint null, force_repush boolean not null default false, updated_at timestamp not null)`.

**테스트(18.2-5 보강)**
- 단위
  - 예약: 같은 초 ns 증가, ns 넘침, 옛 clock 끌어올림, 첫 예약 `now + 1`
  - 표본: 옛 표본 거부, 같은 표본 허용, -1은 표본 무변경, SLO -1은 표본 갱신
  - 병합: sampleMs가 큰 쪽이 남는다
  - 옛 행: STUCK은 버림, 롤업은 cutoff로 읽음
- IT
  - (가) 대기 settle 0 + 옛 양수 적재 → 병합 뒤 0이 남는다
  - (나) settle 0 실행 뒤 옛 표본 push → 생략, 트리거 OK
  - (다) 같은 초 -1 → 켜기 → 현재 값이 보존된다
  - (라) 공유 아이템 동시 push의 도착 순서
  - (마) 잠금 대기 중 generation 변경 → 쓰지 않는다
  - (바) 결과 불명 실패 → force_repush 표식 → 다음 회차가 민다
- FakeZabbix 실측 모델: 같은 tuple은 첫 값만, 트리거는 도착 값으로 판정.
- 뮤테이션
  - 병합을 cutoff 기준으로 되돌림
  - 표본 검사 제거
  - ns 증가 제거
  - 잠금 획득 뒤 renew 제거
  - 첫 예약 +1 제거
  - force_repush 무시

### 18.5 v3 — 코덱스 7b 설계 2차 "조건부 진행"(`_archive/features/apm/alerts/review_apm-alert-unit7b-design-20261021_codex_r2.md`) 조건 반영 + ns 실측 (2026-10-21, 구현 착수본)
**추가 실측**(`_archive/features/apm/alerts/zbx_ns_probe_20261021.py`·`.log`, 임시 객체 삭제 확인 0/0): 같은 초에 ns 1·2·3으로 -1·0·7을 밀면(따로·한 번에 모두) **세 값이 다 저장되고 ns 순으로 정렬**되며, `lastvalue`·트리거는 가장 큰 ns(7 → PROBLEM)를 따른다. 같은 `(clock, ns)` 두 번째 호출도 항목별 응답은 `success`였고 값은 버려졌다(b의 ACK 확인). `clock = 지금, ns = 1`도 정상 반영. → ns 증가 할당이 실제로 동작한다.

**🔴1 해소 확인 경계 = 전송 시각 축**
- 첫 예약은 미래 clock을 만들지 않게 바꾼다: 행이 없으면 `clock = max(원하는 clock, 지금 초)`, **`ns = 1`**(옛 코드의 push는 모두 `ns = 0`이고 clock ≤ 배포 전 시각이므로 엄격히 크다). 끌어올림도 `max(원하는, last_clock)`라 미래 clock은 생기지 않는다.
- RCONF 실행기의 실효 cutoff = **`max(target.cutoff, 그 바인딩 아이템의 last_clock)`**(실행 시점에 DB에서 읽는다 — Zabbix 호출 아님). 같은 lane의 앞 push는 RCONF보다 먼저 끝나므로 그 예약 시각이 포함된다. 다른 lane(공유 아이템)의 뒤늦은 push도 포함되지만, 끄기 경로는 그때 트리거가 이미 꺼졌고(STAT off 뒤) 삭제 경로는 트리거를 지울 것이라 해가 없다. 재활성화의 새 Problem 보호는 기존대로 켜기·복귀가 남은 RCONF를 **취소**해서 지킨다.
- 테스트: "첫 양수 push 직후 같은 초에 규칙 삭제 → RCONF가 그 Problem을 닫는다", "RCONF 실행 직전 공유 아이템 push의 예약 시각 포함".

**🔴2 값 나이는 원래 표본 시각으로**
- `max-age` 검사 = `지금 − sampleMs`(옛 행은 `cutoff`). 할당된 Zabbix tuple은 나이 판정에 쓰지 않는다. 재적재(`pendingPush` → PROVISION 보류 뒤)·재시도에서도 원래 `sampleMs`를 보존한다. 잠금 획득 뒤 다시 검사한다.

**🟡 반영·정정**
- `force_repush`는 **뺀다**. 5분 평가는 측정 가능한 활성 대상마다 매 회차 현재 값을 적재한다(`ApmAlertEvaluationService` 적재 루프 — 값이 같아도 민다). 그래서 결과 불명 전송 뒤의 수렴은 "다음 평가가 성공하고, 유효 표본이 있고, 그 push가 성공한 뒤 옛 요청이 다시 도착하지 않으면"이라는 **조건부 기대치**다. 시간 상한으로 쓰지 않는다(주기는 설정값).
- 잠금을 못 잡으면 기존 RETRY 백오프를 탄다(5초는 대기 상한일 뿐 재시도 간격 상한이 아니다).
- push 입구의 실제 이름은 `pushResolveValue`·`pushCurrentValue`다. 둘 다 `(clock, ns)`를 받게 바꾸고, 할당기를 거치지 않는 호출은 ArchUnit으로 막는다.
- V89 확정: `apm_zbx_item_push_mark(item_resource varchar(300) PK, last_clock bigint not null, last_ns int not null, last_sample_ms bigint null, updated_at timestamp not null)`.
