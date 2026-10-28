# 검수 요청 — 알람 재설계 단위 1: 알람 이력 보존 기반(V76) (2026-10-10)

- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(master `3680909` 기준), 미커밋. diff 전문 `scratchpad/alert-unit1.diff`.
- 설계 `_workspace/features/apm/alerts/apm-alert-delivery-redesign-20261010.md` §3.1·§6(🔴3·🔴4)·§7 단위 1. 설계 검수 `_archive/features/apm/alerts/review_apm-alert-delivery-design-20261010_codex.md`.
- 구현 be-engineer, 요청서 Claude.

## 변경 요지
- **V76** `V76__apm_alert_event_history_snapshot.sql`: 스냅샷 13열(scope·rule_uid·rule_kind·threshold·threshold_unit·window_min·service_uid·service_name·service_env·service_env_norm·slo_uid·slo_name·resolve_reason) nullable 추가 → 백필(옛 kind 이름 정규화, scope·unit은 `ApmAlertKind` 표 CASE) → DO 블록 검증(빈 규칙 스냅샷·SERVICE/SLO인데 service_uid NULL이면 건수와 RAISE) → NOT NULL(scope·rule_kind·rule_uid·threshold·window_min) → FK를 `pg_constraint`에서 열·참조 테이블까지 제한해 찾아 DROP 후 `ON DELETE SET NULL`(rule_id NOT NULL 해제) → CHECK 5종 → 인덱스 `(service_uid, fired_at desc, id desc)`.
- 신규: `ApmAlertEventScope`, `ApmAlertResolveReason`(7종), `ApmAlertEventSnapshot` record, `ApmAlertEventSnapshots.of(rule, serviceId)`(서비스·SLO 최소 조회), `ApmAlertKind.eventScope()`.
- `ApmAlertEventStore.openIfAbsent(snapshot, firedAt, value)` — 스냅샷 INSERT. 대상 서비스가 사라져 스냅샷을 못 만들면 warn 후 열지 않음(예전엔 FK 위반으로 5분 배치 전체 롤백).
- 해소 사유: 회복 RECOVERED, 규칙 끄기 RULE_DISABLED, 삭제 RULE_DELETED, `releaseSlo` SLO_DELETED, 고아 ORPHANED, **서비스 삭제 시 `releaseService` 첫 단계에서 열린 이벤트를 SERVICE_DELETED로 닫음**. 해소는 `saveAllAndFlush`로 삭제보다 먼저.
- 조회: DTO에 `scope`·`resolveReason`·`ruleDeleted`·`serviceDeleted` 추가, `events` 서비스 필터를 스냅샷 `service_uid`로(`searchByServiceUid` 분리 — null uuid 타입 추론 회피), 지워진 서비스 uid 허용. `recent` 규칙 LEFT JOIN + `coalesce(현재, 스냅샷)`(env 필터 포함). eventid 백필 대상 `rule_id IS NOT NULL`. `countByServiceInWindow`는 그대로(설명은 보고서).

## 검증
- 격리 PG 5434: `premium.apm.alert.*` **220 통과**(신규 `ApmAlertEventHistoryIT` 8 — 백필 재생·CHECK 6종·raw DELETE 거부·삭제 후 이력 생존·지워진 uid 필터·recent 스냅샷 env). `premium.apm.*` 2451 중 실패 2 = `ApmCollectorLiveRuntimeTest` Windows 파일 잠금(단독 재실행 4/4 통과).
- **실데이터**: dev DB(V75) 복제본(`dmove_v76check`, 5434)에 V76 단일 트랜잭션 적용 성공 — 16행 백필(SERVICE 13: ERROR_RATE·P95_LATENCY·STUCK_REQUEST, SLO 3: SLO_BURN), 단위·스냅샷 채워짐.

## 의견 요청
1. service_uid CHECK를 NOT VALID가 아니라 "백필 실패=마이그레이션 실패"로 둔 판단 — 깨진 행이 있는 고객 설치본은 기동이 멈춘다. 대안(NOT VALID + 진단 로그)과 비교.
2. 스냅샷 생성 실패 시 이벤트를 열지 않고 warn만 — 알람 누락 위험 vs 배치 롤백.
3. SLO 화면 "번 레이트 알람 끄기"(실제는 규칙 삭제)를 RULE_DISABLED로 기록.
4. 걸림 감시기가 `ledger.fire`의 열기 실패를 무시하고 alarmed=true — 단위 7로 미룸이 괜찮은지.
5. 그 외 V76 함정(락·대용량 테이블에서 백필 UPDATE 시간·FK 재생성 검증 시간).

## 6. 코덱스 1차 **반려**(`_codex.md`) → 반영 (2026-10-11)
| # | 지적 | 반영 |
|---|---|---|
| 🔴1 | 삭제·끄기 vs 평가 INSERT 경쟁(Zabbix 삭제 후 롤백) | 열기: 서비스 `FOR KEY SHARE`(수신의 last_seen_at 갱신은 막지 않음)→규칙 `FOR SHARE`, 없거나 꺼졌으면 `SKIPPED`, `INSERT…SELECT…WHERE EXISTS(enabled FOR SHARE) ON CONFLICT`. 삭제·끄기: 맨 처음 네이티브 `FOR UPDATE`(JPA PESSIMISTIC_WRITE는 FOR NO KEY UPDATE라 KEY SHARE를 못 막음) — 순서 서비스→규칙→바인딩→이벤트. 2-트랜잭션 실 PG IT 5건(규칙·서비스·SLO 삭제·끄기 + 반대 순서), 잠금 제거 시 5건 실패 확인(뮤테이션). 남은 틈: 서비스 DELETE의 알람 밖 CASCADE(instance·trace 요약) 대기·커밋 실패 → 단위 5. 5분 배치 내 부모 무잠금 바인딩·해소 후 부모 잠금 요청으로 교착 가능(PG가 감지·롤백, 삭제 쪽 롤백은 Zabbix 정리 전) → 단위 6 |
| 🔴2 | 스냅샷 실패 시 push·alarmed | `Outcome{OPENED,ALREADY_OPEN,SKIPPED}`. 5분 평가: push를 판정 뒤에 담고 SKIPPED·스냅샷 실패면 이벤트·push 생략. 감시기: SKIPPED면 alarmed=false·fired 미증가→다음 tick 재시도. 테스트 고정 |
| 🔴3 | SLO 스냅샷 불변식 | 백필 RAISE + CHECK `slo_snapshot_chk`(slo_uid·slo_name 둘 다 — 원천 name NOT NULL), 런타임 empty 2경우 |
| 🔴4 | recent value wasNull | `getObject(5, Double.class)`, 다른 wasNull 7곳 정상 확인, 테스트 |
| 🟡 | FK confkey·open_reason_chk·미사용 메서드 제거·kind 8+별칭 3 순회·대용량 절차 주석 | 전부 반영(미끼 FK 2종 IT) |

검증: 격리 PG 5434 `premium.apm.*` **2,463 전부 통과**(alert 232). diff `scratchpad/alert-unit1-r2.diff`.

## 7. 코덱스 2차 **반려**(`_codex2.md`) → 반영 (2026-10-11)
- 🔴1 잠금 순서: `ApmAlertParentLocks.lockAllForBatch()` — 모든 서비스 `FOR KEY SHARE` → 모든 규칙 `FOR SHARE`(id 오름차순, 꺼진 규칙 포함 — 트리거 상태 재시도가 꺼진 규칙 바인딩도 씀)를 `evaluateAll`·`ApmAlertSyncService.syncAll` **첫 문장**에. 화면 경로(update·delete·resync·syncSloRule)는 엔티티 읽기 **전에** `FOR UPDATE`. 1초 장부 `settle`도 부모 잠금 선행(빈틈 발견·수정). 교착 분석(배치 대기는 화면 경로 첫 잠금에서만 / 삭제 선행 시 배치는 서비스 KEY SHARE에서 대기·규칙 이하 미보유) 요청서 아래 원문 참조.
- 🔴2 옛 임계: 잠근 뒤 다시 읽기(주) + `openIfAbsent` 잠금 후 kind·threshold·window 대조 불일치 시 SKIPPED(1초 감시기 안전망).
- 실제 `evaluateAll()` 경쟁 IT `ApmAlertEvaluationRaceIT` 9건(규칙 삭제·서비스 삭제·끄기·임계 수정 × 양방향 + α), 배치 선잠금 제거 시 4건 실패(뮤테이션 확인). 교착 자체는 결정적 재현 불가.
- 🟡 잠금 보유: 단위 6 전까지 규칙 수정·끄기·삭제·서비스 삭제가 배치 한 회차를 기다릴 수 있음(주석 명시). IT 측정 38~194ms(Zabbix 대역 — 운영 대표성 없음).
- 검증: 격리 PG 5434 alert 242 통과, `premium.apm.*` 2473 중 2 실패(`ApmCollectorLiveRuntimeTest` Windows 파일 잠금, 단독 4/4 — 직전 전체 실행은 실패 0). diff `scratchpad/alert-unit1-r3.diff`.

## 8. 코덱스 3차 **반려**(`_codex3.md`) → 반영 (2026-10-11)
- 🔴1 phantom: `lockAllForBatch()`가 잠근 서비스·규칙 id 집합(`Locked`) 반환 → `evaluateAll`·`syncAll`·트리거 상태 재시도·고아 정리(`sweep(…, covered)` — 방금 만든 규칙 바인딩을 고아로 내리지 않게)·eventid 보강이 잠근 집합만 처리, 새 행은 다음 회차. `@SpyBean`으로 잠금 직후 규칙 생성 커밋 IT(평가·대조).
- 🔴2 lock-then-read: 서비스 삭제 첫 문장 `lockByUidForUpdate` 후 HIDDEN 검사. SLO 수정·삭제·`releaseSlo`·`syncSloRule`은 서비스(KEY SHARE)→SLO(FOR UPDATE)→규칙 순. 서비스 삭제 선잠금 서비스→SLO→규칙→바인딩→이벤트. IT 4건(수신 HIDDEN→ACTIVE vs 삭제 양방향, 번 규칙 생성 vs SLO 삭제 양방향).
- 🟡 `evaluateAll()` vs 1초 장부 fire/settle 양방향 IT, 잠금 보유 주석, 표시명 스냅샷은 발화 직전 값일 수 있음(보고만).
- 뮤테이션: phantom 필터·서비스 선잠금·SLO 선잠금 제거 시 3건 실패 확인.
- 범위 밖(기존): 5분 배치와 1초 장부의 **첫 프로비저닝 동시 실행** 시 바인딩 UNIQUE 위반(조회 후 INSERT) — IT에서 재현. 장부는 다음 tick 재시도. 단위 5(수명주기 명령)에서 다룰 후보.
- 검증: 격리 PG 5434 alert 251, `premium.apm.*` **2,482 전부 통과**. diff `scratchpad/alert-unit1-r4.diff`.

## 9. 코덱스 4차 **반려**(`_codex4.md`) → 반영 (2026-10-11)
- 🔴1 서비스 삭제↔규칙 수정 교착: 규칙 화면 경로(수정·끄기·켜기·삭제·resync) 전부 `lockRuleByUid` — 무잠금으로 부모(service_id·slo_id) 읽기 → 서비스 KEY SHARE → SLO FOR UPDATE → 규칙 FOR UPDATE → 부모 재확인(불일치 시 최대 3회 재시도). `slo_id` updatable=false, `service_id` 변경 코드 없음. IT `ApmAlertRuleLockOrderIT` + RaceIT 6건(바인딩 없는 서비스별·SLO 규칙 update/resync × 서비스 삭제 양방향) + I/O 도중 정지 1건. 뮤테이션(서비스·SLO 잠금 제거) 시 실패 확인.
- 🔴2 첫 프로비저닝 UNIQUE: `binding()`이 Zabbix I/O 전 `reserve`(INSERT … ON CONFLICT DO NOTHING — 서비스 축·수집기 축 부분 UNIQUE 둘 다 대상이라 대상 미지정) 후 재조회. 예약 행 = id 없음·cache_ready=false·error 없음(기존 새 엔티티와 동일, `isMissing`). 평가 vs 장부 IT를 바인딩 미리 생성 없이 — 1개만 생성.
- 🟡 `targetsOf(rule, visibleRule)` — override 계산을 잠근 규칙으로 제한, IT.
- 잠금 순서 표(배치·대조·장부·규칙 CRUD·SLO CRUD·서비스 삭제·수신)는 에이전트 보고 원문 참조(아래 요약): 전 경로 서비스→SLO→규칙→바인딩→이벤트, 예외 1초 장부의 이벤트→바인딩(배치가 STUCK 이벤트 미접촉이라 일방향).
- 검증: 격리 PG 5434 alert 262, `premium.apm.*` **2,493 전부 통과**. diff `scratchpad/alert-unit1-r5.diff`.
