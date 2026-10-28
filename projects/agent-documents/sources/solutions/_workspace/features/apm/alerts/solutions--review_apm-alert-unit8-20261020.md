# 검수 요청 — APM 알람 재설계 단위 8: DEAD 회복 창구 + 반영 상태 화면 (2026-10-20)

- BE: 워크트리 `C:\worktrees\apm-c05-followup`(브랜치 `apm-alert-history`, HEAD `90918a0` = 6b 커밋 위 미커밋).
- FE: 워크트리 `C:\worktrees\apm-alert-history-fe`(브랜치 `apm-alert-history`, 미커밋).
- 설계: `apm-alert-unit5-6-design-20261011.md` §16·§16.9(설계 검수 조건부 진행 `_archive/.../review_apm-alert-unit8-design-20261020_codex.md` 반영). 계약: `contract_apm-alert-zabbix-apply.md` §1(inFlight)·§3(blocked 3필드)·§6.

## 범위
**BE**
- `command/ApmZbxDeadReason`(신규) — `classify(lastError)`: NOT_OWNED·NEUTRALIZE_TIMEOUT(🔴 `HOLD_TIMEOUT_PREFIX`, `RPUSH_HOLD_WAIT`는 아님)·UNIDENTIFIED·MANUAL_CLOSE·INVALID_COMMAND·OTHER. 실행기 상수 직접 참조.
- 실행기: 손상 명령 DEAD는 `Result.invalid(...)` = `INVALID_COMMAND:` 접두어(워커·DELETE·PROVISION·PUSH·RCONF·RPUSH·STAT), RCONF 수동 닫기 거부는 `MANUAL_CLOSE_DISABLED:`.
- `ApmZbxCommandStore`: `retryDead(long id)`(lane resource → 행 FOR UPDATE, lane 바뀌면 LANE_CHANGED, DEAD → PENDING·attempts 0·last_error 유지·generation 불변·RESOLVE_PUSH `confirmRechecks` 삭제) · `acknowledgeUnidentified(id, note, expectedGeneration, actor)`(같은 잠금, DEAD+UNIDENTIFIED+generation 일치만 삭제, released·stillBlocked, 감사 afterCommit) · `deadPage`/`blockedPage`(blocked = stats 정의)·`predecessorsOf`/`successorsOf` · `Stats.blockedByDead`.
- `command/ApmZbxCommandAdmin`(신규) — 목록(대상 해석: 바인딩 조인, 실패 시 rule_uid 열·target 스냅샷; waiting = 직접 후속 중 PUSH 제외, fencedPushes = 직접 후속 PUSH), DB 집계 `commands(stats)`(진단 EP도 공유), retry(성공 시 워커 깨우기·감사), acknowledge(메모·버전 필수).
- `ApmAlertCommandController`(신규) `/apm/alert-rules/zabbix-commands` GET·`/{id}/retry`·`/{id}/acknowledge` — 셋 다 `@LicenseExempt` + `requireApmEverLicensed` + `requireEdit`.
- `ApmAlertZabbixStatusDto.Commands` + blocked·blockedByDead·longestBlockedSec, `ApmAlertBindingSummaryDto.inFlight`(칸 무관 대기 명령 바인딩 수), ErrorCode 2종(`APM_ALERT_COMMAND_STATUS_INVALID`·`APM_ALERT_COMMAND_NOTE_REQUIRED`).
- 테스트: `ApmZbxCommandAdminIT` 12(만료 중 다시 시도한 켜기 = 실행기 DEFERRED·라이선스 복귀 뒤 켜짐 포함, 목록 대상·스냅샷·막힘=집계·검증·사유 분류·retry 의미·후속 해제·re-key 양방향·잠금 순서·확인 완료 버전·가드) · `ApmAlertCommandMvcTest` 5(모양·권한·만료 열림·미보유 거부) · `LicenseArchitectureTest` A5-e(면제 메서드 이름 고정·자체 판정).
- 뮤테이션: 확인 완료 버전 검사 제거 → `acknowledgeOnlySeenGeneration` 실패 ✅ · retry가 행을 먼저 잠금 → `retryLocksResourceBeforeRow` 실패 ✅.

**FE**
- 타입·API·훅: binding `queued·commandFailed·inFlight`, rule `zabbixApply`, status `bindingQueued·commands(+3)`, SLO `zabbixSyncing`, 장부 행·페이지·retry/ack 결과(`reason` no-op 코드).
- 배지: `missing > drift > queued > pending > synced`(queued 톤 warning — 팔레트에 info 없음), 꺼진 규칙도 commandFailed → 반영 멈춤·inFlight → 반영 중(감추지 않음).
- 폴링: 목록 `inFlight>0`(옛 응답 queued) 또는 쓰기 응답 QUEUED면 5초, 새 작업이면 상한(3분) 재시작, 쓰기 직후 10초 유예. 토스트: QUEUED=info, FAILED=warning(원문).
- SLO 번 카드: 미반영이어도 syncing이면 "Zabbix 반영 중"(빨강 아님).
- Zabbix 탭 "반영 명령" 카드(진단 조회와 독립 — 로딩·실패여도 렌더): 멈춤/막힘 세그먼트, 서버 페이지(50, Pagination), 행 상세(규칙/스코프 uid·zbxIds·host/key·원문), 다시 시도(사유별 선행 조치 모달, `Modal.useModal`), 확인 완료(메모 필수 + generation 전송 + 상세 표시), 규칙 링크(`?rule=`), hard RPUSH NOT_OWNED는 "재동기화로 안 풀림" 안내, 대기·실행 중이면 5초 폴링.
- 만료 fallback: 알람 규칙 라우트 `FeatureGate fallback` — APM 보유(has)인데 사용 불가면 업셀 + 회복 카드만.
- 오류 코드 매핑 2종, i18n kr/en, 도움말 `alert_zbx_commands`(위젯 수 135), 계약 픽스처 갱신.
- 테스트: `ApmAlertZbxCommandsCard.test` 8 · `ApmAlertRulesPage.test`(queued 배지·inFlight 폴링·QUEUED 응답 폴링·꺼진 규칙 멈춤 배지) · `apmAlertDisplay.test` · `ApmSloPage.test`(syncing) · `apmHelpContent.test`. 관련 6 스위트 124 통과, tsc·typecheck:contract·eslint 통과.

## 판단 요청
1. retry·acknowledge 잠금(resource → 행, 가족 없음)이 적재·워커·6b 대조와 교착 없이 안전한가. acknowledge 삭제가 후속 edge를 CASCADE로 푸는 것 외 영향.
2. 라이선스 면제를 retry까지 연 것 — 되살린 켜기·값 전송이 실행기 DEFERRED로 막히는지(코드 확인 요청), 만료 FE fallback 범위.
3. 목록 대상 해석(조인 실패 시 스냅샷)·waiting/fencedPushes 정의, BLOCKED 정의 = stats.
4. FE 폴링 조건(inFlight·QUEUED·유예·상한 재시작)과 배지 우선순위·꺼진 규칙 표시.
5. 빠진 필수 테스트(설계 §16.9 🔴7 목록 대비 — 미작성: retry ↔ worker claim 경합 직접 IT(DEAD는 claim 대상이 아니라 순차 IT로 대신), NEUTRALIZE_TIMEOUT 회복 후 -1 전 STAT 금지(기존 6a IT `neutralizeTimeoutIsDeadNotEnable`·`retryDead` 카운터 초기화 경로 재사용), 600초 경계(기존 PUSH 실행기 IT)). 이 대체가 충분한가.

## 검증 현황
- BE 회귀(클래스별 단독, 23개 전부 통과): ApmZbxCommandAdminIT 12 · ApmAlertCommandMvcTest 5 · LicenseArchitectureTest 10 · ApmAlertSyncIT 27 · ZabbixAlertBridgeTest 27 · ApmZbxProvisionIT 19 · ApmZbxCleanupServiceTest 9 · ApmZbxCommandStoreIT 44 · ApmAlertRuleLockOrderIT 1 · ApmZbxWriteSingleEntryTest 8 · ApmAlertRuleMvcTest 8 · WritePathIT 11 · ZabbixPhaseIT 26 · StatusCommandIT 38 · ExecutionIT 30 · EvaluationIT 14 · RaceIT 24 · DeletePathIT 8 · LedgerIT 11 · EventHistoryIT 19 · JobTest 11 · ApmAlertServiceTest 52 · ApmZbxCommandWorkerTest 12.
- FE: 관련 6 스위트 124 + 카드 8 통과, tsc·typecheck:contract·eslint 0.

---

## 2차 (2026-10-21) — 1차 조건부 승인 반영

1차 결과: `_workspace/_archive/features/apm/alerts/review_apm-alert-unit8-20261020_codex.md`(조건부 승인, 🔴3·🟡4).

**🔴 반영**
1. re-key 경합 — `ApmZbxCommandAdminIT.retryLaneChangedWhileWaiting`(결정적): 옛 lane resource를 쥔 트랜잭션이, retry가 그 lane에서 **실제로 기다리기 시작한 것을 pg_locks로 확인한 뒤** 행을 정규 lane으로 옮기고(DEAD 유지) 커밋 → retry = `LANE_CHANGED`·행 DEAD 그대로. 헬퍼 `raceOnLane(lane, contender, whileHeld)`. 뮤테이션: LANE_CHANGED 검사 제거 → 실패 ✅.
2. NEUTRALIZE_TIMEOUT 회복 체인 — `ApmAlertEvaluationZabbixPhaseIT.neutralizeTimeoutRetryStillGatesEnable`: 캐시 미동기 지속으로 DEAD → `retryDead` → 다시 DEAD(NEUTRALIZE_TIMEOUT)·STAT PENDING·트리거 꺼짐·-1 한 번도 없음 → 캐시 동기 후 `retryDead` → -1 → STAT 완료·트리거 켜짐.
3. acknowledge 경쟁·롤백 감사 — `acknowledgeRacesWithReenqueueAndRetry`(같은 `raceOnLane`: 기다리는 사이 generation+1 → GENERATION_CHANGED, status PENDING → NOT_DEAD, 둘 다 행 유지) · `auditOnlyAfterCommit`(임시 PG 트리거로 삭제 실패 → 예외·행 유지·`[AUDIT]` 0건, 트리거 제거 뒤 성공 → 1건). 뮤테이션: 감사를 afterCommit 밖(삭제 전 즉시)으로 → 실패 ✅.
   FE 폴링 수명 — `ApmAlertRulesPage.test` "상한에 닿아 멈춘 뒤 새 QUEUED 작업이 오면…": `Date.now` 고정 → 상한 초과(inFlight 그대로)면 5초 폴링 아님·`data-expired=true` → QUEUED 응답 → 5초 재개·`data-expired=false` → 새 작업 기준 2분 59초에도 폴링. 뮤테이션: `setPollSince(at)` → `prev ?? at` → 실패 ✅.

**🟡 반영**
- 목록 페이지 보정 — `ApmAlertZbxCommandsCard`: `page > ceil(total/50)`이면 마지막 페이지로(데이터 도착 후). 테스트 "목록이 줄어 지금 페이지가 끝을 넘으면…"(51건 2쪽 → total 50 → offset 0). 뮤테이션: 보정 제거 → 실패 ✅.
- 목록 한 스냅샷 — `ApmZbxCommandAdmin.list`에 `@Transactional(readOnly = true, isolation = REPEATABLE_READ)`(장부 조회는 모두 `jdbc`라 같은 트랜잭션에 합류).
- retry 감사 행 요약 — 감사를 장부(`retryDead(id, actor)`)로 옮겨 **커밋 뒤**, 되살리기 전 command·dedup·lane·attempts·generation·이전 오류(200자). Admin의 즉시 로그는 제거. `auditOnlyAfterCommit`이 내용을 확인.
- 600초 "경계 검증" 표현 — 1차 요청서 문구 철회(기존 테스트는 30분 전 값 폐기 확인일 뿐, 경계 검증 아님).

**검증**: BE `ApmZbxCommandAdminIT` 15 · `ApmAlertEvaluationZabbixPhaseIT` 27 · `ApmAlertCommandMvcTest` 5 · `ApmZbxCommandStoreIT` 44 · `LicenseArchitectureTest` 10 통과. FE tsc·typecheck:contract·eslint 0, 관련 5 스위트 118 통과(카드 9·규칙 화면 33 포함).

**판단 요청(2차)**: 🔴1~3이 해소됐는가 · `raceOnLane`의 결정성(pg_locks 대기 확인 → 쥔 쪽 변경·커밋) · 목록 REPEATABLE READ가 워커·적재와 충돌 없는가(읽기 전용, 잠금 없음).

**2차 결과: 승인**(`_workspace/_archive/features/apm/alerts/review_apm-alert-unit8-20261021_codex_r2.md`). 🟡1 반영 — `auditOnlyAfterCommit`의 실패 주입을 `BEFORE DELETE`에서 **지연 제약 트리거**(`AFTER DELETE … DEFERRABLE INITIALLY DEFERRED`, 커밋 시점 실패)로 바꿔 삭제·감사 등록 뒤 커밋 롤백까지 검증. 뮤테이션: 삭제 직후 동기 감사 → 실패 ✅. 🟡2(600초 정확 경계 IT)는 PUSH 실행기 범위라 이월.
