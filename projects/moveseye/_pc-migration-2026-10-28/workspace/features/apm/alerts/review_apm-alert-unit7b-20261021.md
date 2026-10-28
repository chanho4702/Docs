# 검수 요청 — 알람 재설계 단위 7b (아이템별 단조 Zabbix 시각 + 측정 표본 신선도) · 2026-10-21

- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(HEAD `bb14c07` 위 미커밋)
- 설계: `apm-alert-unit5-6-design-20261011.md` §18(실측)·§18.4(v2)·§18.5(v3, 구현 착수본). 설계 검수 1차 재설계 → 2차 조건부 진행(조건 2건은 §18.5에 반영).
- 실측: `_archive/features/apm/alerts/zbx_clock_probe_20261021.*`(clock 역전·같은 tuple·켤 때 판정), `zbx_ns_probe_20261021.*`(같은 초 다른 ns·같은 tuple ACK·clock=지금 ns=1).

## 변경
| 파일 | 내용 |
|---|---|
| `V89__apm_zbx_item_push_mark.sql` | 아이템별 `(last_clock, last_ns, last_sample_ms)` |
| `ApmZbxItemPushClock`(새) | 트랜잭션 없음 확인 → 아이템 키 JVM 잠금 `tryLock(lockWait)`(못 잡으면 LOCK_BUSY) → 잡은 뒤 `stillValid`(claim renew·값 나이) → 짧은 REQUIRES_NEW 트랜잭션 예약(`FOR UPDATE`, 없으면 `(max(원하는, 지금), 1)` INSERT·충돌 시 재잠금, 옛 표본이면 STALE_SAMPLE, 아니면 `max(원하는, last)`·같으면 ns+1·넘치면 다음 초) → 커밋 뒤 pusher → 잠금 해제. `lastClock()` 읽기 |
| `PushValue.at(clock, ns)` | ns 보존 생성 |
| `ZabbixAlertBridge.pushResolveValue/pushCurrentValue` | `(clock, ns)` 인자 |
| `ApmZbxResolvePushExecutor` | 마지막 renew+push를 할당기로(표본 null — -1은 표본 아님) |
| `ApmZbxPushCurrentExecutor` | `target.sampleMs`(없으면: STUCK이면 LEGACY_SAMPLE_DROPPED 완료, 아니면 cutoff×1000), 값 나이 = 지금 − sampleMs(잠금 뒤 재검사), 할당기 경유, STALE_SAMPLE은 완료(배달 성공 기록 안 함), LOCK_BUSY는 RETRY |
| `ApmZbxCommandSpec.pushCurrent(…, sampleMs)` | target `{value, sampleMs}`. 4인자 = 표본 = clock×1000(롤업 계열) |
| `ApmZbxCommandStore` | PUSH_CURRENT 병합을 `sampleMs`(옛 행 cutoff×1000) 큰 쪽으로. `PendingPush.sampleMs` |
| `ApmZbxProvisionExecutor` | 보류 재적재가 원래 sampleMs를 옮김(옛 STUCK 값은 버림) |
| `ApmAlertEvaluationService` | STUCK은 `currentSample`(값+tickMs 같은 스냅샷), 나머지 표본 = now(ms) |
| `ApmStuckRequestMonitor.currentSample` | 값·tickMs 한 번에(`currentValue`는 위임) |
| `ApmZbxCleanupService.enqueueStuckValue` | 1초 장부 표본 = tick 시각(now와 nowMs가 같은 순간 — 감시기 계약) |
| `ApmZbxResolveConfirmExecutor` | 실효 cutoff = `max(cutoff, 그 아이템 lastClock)` |
| `ApmZbxCommandProperties.pushLockWaitMs`(기본 5000) | PUSH_CURRENT·RESOLVE_PUSH 리스 검증식에 더함. `@ConstructorBinding` + 10인자 보조 생성자 |
| `FakeZabbixAlertBackend` | 실측 모델: 같은 tuple 처음 것만(응답 ok), 역전 도착 카운트 |

## 테스트(격리 DB 5434, 클래스별 단독)
- 새 `ApmZbxItemPushClockIT` 8: 첫 예약 (지금, 1) · tuple 엄격 증가(같은 초 ns·옛 clock 끌어올림·새 clock ns 0) · ns 넘침 · 옛 표본 거부/같은 표본 허용/-1은 표본 무변경 · 재검증 실패면 예약 없음 · 같은 아이템 직렬(LOCK_BUSY·대기 후 순서) · 트랜잭션 안 거부 · 대기 병합은 표본 큰 쪽.
- `ApmStuckRequestLedgerIT` +3: 정리 뒤 옛 표본 양수 미전송(마지막 값 0·역전 0) · 같은 초 fire·settle 둘 다 남음(버림 0) · 옛 STUCK 행 버림.
- `ApmZbxCommandExecutionIT` +1: 실효 cutoff가 예약 시각까지 포함(그 뒤 새 알람은 남김).
- `ApmAlertEvaluationDecisionTest`: STUCK 값의 sampleMs = tick.
- `ZabbixAlertBridgeTest`: 할당 ns 전송.
- 결과: DecisionTest 10 · ItemPushClockIT 8 · ZabbixPhaseIT 27 · RuleWritePathIT 11 · StatusCommandIT 38 · StuckRequestLedgerIT 14 · ExecutionIT 31 · StoreIT 44 · AdminIT 15 · DeletePathIT 8 · V86MigrationIT 8 · ApmSchemaIT 20 · BridgeTest 27 · PropertiesTest 5 — 전부 통과.
- **뮤테이션 8종 전부 실패 확인(복원 후 원본 확인)**: 병합을 cutoff 기준으로 · 표본 검사 제거 · ns 증가 제거 · 아이템 잠금 공유 제거 · 잠금 뒤 재검증 무시 · 첫 예약 ns 0(1차엔 살아남음 → 저장 ns·다음 예약까지 단언 보강 후 실패) · 실효 cutoff 제거 · 옛 STUCK 버림 제거.
- 미실시: 할당기를 거친 실제 dev Zabbix 재실측(같은 초 다른 ns의 실제 반영은 ns 프로브로 확인했다 — 할당기 자체는 DB·가짜 Zabbix로 검증).

## 판단 요청
1. 설계 §18.4·§18.5 대비 누락·왜곡(특히 대기 병합 SQL의 옛 행 혼합, 첫 예약 경합 루프).
2. `STOPPED` 처리 — PushCurrent는 잠금 뒤 재검증 실패 시 `ctx.renew()`를 다시 불러 claim 상실(stopped)과 값 나이 초과(done)를 가른다. 두 번 부르는 비용·의미.
3. 실효 cutoff를 `TriggerIdentity.kind·scopeUid`로 만든 아이템 키에서 읽는다 — 식별 복원 경로(`restoreFromLiveBinding`)에서도 같은 키가 되는가.
4. 테스트의 FakeZabbix 모델(트리거 판정 자체는 흉내 내지 않고 역전 도착 수로 대신)이 주장을 충분히 뒷받침하는가.

## 1차 결과: 조건부 승인 (`_archive/features/apm/alerts/review_apm-alert-unit7b-20261021_codex.md`) → 반영(2차 요청)
- 🔴1 잠금 대기 중 interrupt를 값 만료로 오인해 완료·삭제 → 할당기에 `Outcome.INTERRUPTED` 신설(예약 없음). PushCurrent는 중단 사유를 갈라 **값이 늙었을 때만 완료**, claim 상실·interrupt는 `stopped()`(반납 — 행 보존, 두 번째 renew 호출 제거). ResolvePush도 INTERRUPTED → stopped.
  - 테스트: `ApmZbxItemPushClockIT.interruptWhileWaitingReservesNothing`(대기 스레드 interrupt → INTERRUPTED·예약 없음), 새 `ApmZbxPushCurrentExecutorTest` 3(interrupt → STOPPED·push 없음 / 잠금 뒤 claim 상실 → STOPPED / 기다리는 사이 600초 초과 → DONE). 뮤테이션(interrupt → done) → 실패 ✅.
- 🟡 옛 행 병합 정규화 — 기존 행이 이기면 `(excluded.target - 'sampleMs') || c.target`(새 행 표본이 섞이지 않음). 테스트 `legacyWinnerKeepsItsOwnValueAndNoSample`.
- 🟡 미반영(기록): 할당기 우회 ArchUnit(실행기 안 람다 호출이라 "할당기 경유"를 바이트코드 규칙으로 표현하기 어렵다 — 두 호출처는 리뷰로 고정), 잠금 대기 중 generation 변경·첫 INSERT 충돌·PROVISION 재적재 뒤 만료의 직접 테스트, 할당기 경유 실제 Zabbix 재실측.
- 결과: ItemPushClockIT 10 · PushCurrentExecutorTest 3 · StuckRequestLedgerIT 14 · StatusCommandIT 38 · ZabbixPhaseIT 27 통과.

## 2차 결과: 승인 (`_archive/features/apm/alerts/review_apm-alert-unit7b-20261021_codex_r2.md`)
🔴 없음. 🟡1 반영 — interrupt IT가 `last_ns` 불변·pusher 미호출까지 단언. 🟡2(병합 시 cutoff는 두 행 최댓값 — 신선도·나이는 sampleMs, 순서는 할당기라 기능 영향 없음)·🟡3(잠금 대기 중 generation 변경·첫 INSERT 충돌·PROVISION 재적재 뒤 만료·복원 식별 경로의 직접 테스트, 할당기 우회 ArchUnit, 할당기 경유 실제 Zabbix 재실측)은 유지보수 항목으로 남긴다.

## 후속: 할당기 경유 실제 Zabbix 재실측 (2026-10-22, 🟡3 중 1건 해소)
`_archive/features/apm/alerts/zbx_live_alloc_probe_20261022.{log,java.txt}` — 옛 방식은 역전 도착에서 거짓 Problem·같은 tuple에서 해소 값 유실을 재현했고, 할당기 경유는 두 경우 모두 트리거 OK(늦은 옛 표본은 STALE_SAMPLE로 미전송, 같은 초는 ns 1·2로 둘 다 저장). 임시 객체 삭제 확인.
