# 검수 요청 — APM 알람 재설계 단위 7 (2026-10-13)

- 브랜치 `apm-alert-history`(워크트리 `C:\worktrees\apm-c05-followup`), 기준 HEAD `0c7ee42`(6a), 미커밋.
- 설계·결과 정본: `_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md` **§14**. 이관 근거: §4.8, §9.4 U5, §13.7, 6a 검수 `review_apm-alert-unit6a-20261012_codex*.md`의 "단위 7".
- 누적 diff: scratchpad `alert-7.diff`.

## 범위
1. 1초 STUCK 장부 fire/settle: 트랜잭션 안 Zabbix 호출 0. `ApmZbxCleanupService.enqueueStuckValue`로 바인딩 예약 + (객체 없으면) 비강제 PROVISION + PUSH_CURRENT 적재. PROVISION DEAD면 되살리지 않고 값도 미적재. 장부는 브리지 미사용.
2. 커밋 뒤 `ApmZbxCommandWorker.dispatchAfterCommit` → 전용 실행 레인(스레드 1, 대기열 64), 대기 0, 같은 바인딩 후속 명령 최대 4바퀴.
3. 걸림 값 = 5분 평가와 같은 lane `PUSH:b{id}`의 PUSH_CURRENT(6a fence·supersede). lane 밖 직접 push 제거.
4. STUCK에서 레거시 `ensureItemRaw` 제거 → PROVISION 3a 순서.
5. 브리지 `ensureProvisioned`·`pushAll`·`PushRequest` 삭제(장부 외 호출처 없음). 6b용 `applyOurDefinition`·`retryPendingTriggerStatus`·`ensureItemRaw`·`alignLegacyDescription` 유지.
6. ArchUnit 3→6: evaluate 패키지 전체 Zabbix 쓰기 금지(장부 예외 제거), 장부·감시기 브리지 호출 금지, 장부·감시기·적재 입구 동기 실행 금지, 실행기 execute는 command 패키지만.

## 설계 대비 변경(§14.3)
- 전용 레인 분리(공용 풀은 5분 평가가 최대 60초 점유 → 걸림 알람 지연·거절 IT 재현). Zabbix 동시 호출 상한 worker-threads+1(기본 5).
- 대기 0(호출 스레드가 감시기 잠금을 쥔 tick 스레드).
- **6a 동작 변경**: PUSH_CURRENT가 아이템 없음·꺼짐이면 값을 버리지 않고 PROVISION 뒤 대기(5분 평가에도 적용, 요약은 "대기"로 집계).
- fire·settle이 실행 전 둘 다 커밋되면 0만 Zabbix로(§9.4 병합 수용).
- 레거시 단위 테스트 이관·정리, FakeZabbix `allowInTx` 예외 제거.

## 검증
신규 `ApmStuckRequestLedgerIT` 6 등. 21개 클래스 단독 통과(StatusCommandIT 38, ZabbixPhaseIT 26, BridgeTest 40, ArchUnit 6 …). 뮤테이션 k01~k11 검출.

## 남은 의문(§14.6) — 검수 판단 요청
1. **같은 lane에 lifecycle 명령(PROVISION 등) 적재 시 실행 전 걸림 값이 supersede되어 삭제** → 다음 5분 판정까지 최대 5분 옛 값 잔존(3자 교착 IT에서 관찰). 수정 시 supersede 대상을 끄기·삭제 의사로 좁혀야 함.
2. clock 역전(기존 경쟁): settle 0 실행 후 더 이른 clock 양수가 늦게 도착. Zabbix last() 도착순/clock순 미실측.
3. 감시기 잠금 안 장부 DB I/O는 기존 결정대로 유지(outbox 2차).
4. PUSH_CURRENT "유예 초과=실패 배지" 분기 IT 없음.
5. 레거시 ensureItemRaw는 6b 대조에 잔존. 6. 전용 레인 대기열 포화 규모 미계측.

## 2차 — 1차 반려 반영 (설계서 §14.7)
- 🔴1: `Store.enqueue`의 PUSH_CURRENT supersede를 `Plan.supersedesPush`로 제한 — soft RPUSH·RCONF·DELETE_TRIGGER·DELETE_ITEM만 대기 값 삭제. PROVISION·hard RPUSH·STAT은 `fenceExistingPushes`로 대기 값 앞에 선행 edge만. DEAD push는 어떤 lifecycle이든 삭제(종전). **코덱스 제안과 다른 점**: STAT은 적재 시점에 on/off를 모름(실행 시 DB 판독) → 지우지 않고 fence만. 끄기는 같은 묶음 soft RPUSH·RCONF가 지우고, 남은 값은 실행기가 규칙 꺼짐·고아로 미전송, 600초 폐기 유지.
- 테스트: LedgerIT 신규 3(양수 대기+PROVISION, settle 0 대기+PROVISION, PROCESSING PROVISION 뒤 settle 0 → 모두 Zabbix 마지막 값 도달), 3자 교착 IT 단언을 "settle 0이 마지막 값"으로. StoreIT `ensuringLifecycleFencesPendingPush` 신규, 기존 supersede 테스트는 soft RPUSH·RCONF 기준.
- 🟡1 clock 역전: 설계서에 위험·근본안(샘플 version + 바인딩 마지막 적용 version) 기록, 합본 전 실측 항목. 🟡2 `urgentLaneSaturationFallsBackToDrain`. 🟡3 `latencyMatrixWithFiveSecondZabbix`. 단위 8 이관 추가(실행 중 PROVISION DEAD 시 묶인 push).
- 통과: LedgerIT 10, StoreIT 44, WorkerTest 12, StatusCommandIT 38, ZabbixPhaseIT 26, ProvisionIT 18, RaceIT 24, ExecutionIT 30, DeletePathIT 8, WritePathIT 11, EvaluationIT 14. 뮤테이션 r01~r05 검출. diff `alert-7-r2.diff`.

## 3차 — 2차 조건부 승인 반영 (2026-10-19)
- 코덱스 2차: **조건부 승인**(`review_apm-alert-unit7-20261013_codex2.md`) — 1차 🔴1 해소 확인, 새 🔴 없음. 조건 = 단위 8 DEAD 회복 창구를 합본 필수로 유지(이미 이관 목록).
- 🟡1 반영: `ApmZbxCommandStoreIT.lifecycleSupersedesPendingPush`에 DELETE_TRIGGER·DELETE_ITEM supersede 단언 추가 — `supersedesPush` 분류 4종 전부 고정.
- 🟡2 반영: `ApmStuckRequestLedgerIT.statOffAfterPendingValueBlocksPush` 신규 — 대기 걸림 값 → 규칙 끄기 → STAT 적재(지우지 않고 fence) → 실행 → Zabbix 마지막 값 불변·트리거 꺼짐·명령 0. 설계 차이(STAT은 fence만)를 한 IT로 고정.
- 재실행(격리 DB 5434, 클래스별 단독): 아래 결과 참조.
- 결과: 단위 WorkerTest 12 · CleanupServiceTest · ArchUnit(WriteSingleEntry) · BridgeTest 40 / IT LedgerIT **11**(신규 포함) · StoreIT 44 · ZabbixPhaseIT 26 · ProvisionIT 18 · WritePathIT 11 — 전부 통과.
