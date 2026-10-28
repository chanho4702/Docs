# 검수 요청 — APM 알람 재설계 단위 6a (2026-10-12)

- 브랜치 `apm-alert-history`(워크트리 `C:\worktrees\apm-c05-followup`), 기준 HEAD `2e5af81`(5b), 미커밋.
- 설계·결과 정본: `_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md` **§13**(13.1~13.7).
- 누적 diff: scratchpad `alert-6a.diff`(28 파일, 신규 4·삭제 1).

## 범위
1. 5분 평가 분할 — `evaluateAll` 비트랜잭션화(트랜잭션 안 호출 시 거부), 판정 `decide()`(Zabbix 0) 커밋 → `ApmAlertZabbixPhase`(트랜잭션 밖: 이번 회차 명령 병렬 실행·최대 60초 대기 → 일괄 존재 확인 RPC 3회 → 소실·비활성·옛 이름 PROVISION 적재, eventid 백필 단건 UPDATE).
2. PUSH_CURRENT 실행기 — 쓰기 전 소유 확인(foreign=DEAD, missing=PROVISION 적재), 규칙 꺼짐·고아면 미전송, 10분 초과 값 폐기, 상한 5.
3. 옛 값 재발화 방지 — 모든 켜기 경로 "-1 정렬 → 트리거 켜기 → 현재 값". 고아 복귀 = hard -1 → STAT. 이력 있는 아이템 새 트리거 = 꺼진 채 생성 → -1 → 켜기 → 현재 값(대기 중 값 재적재). 재활성화 아이템은 서버 설정 캐시 대비 hard -1이 최대 ~2분 대기.
4. U3 필드 `decisionCommitted`·`failedPhase`·`commandsPending`, 잡 실패 메시지.
5. 옛 트리거 이름 정렬(비강제 PROVISION, 사람이 바꾼 표현식 보존).
6. host 캐시 필드 제거 + 호스트 생성 JVM 내 직렬화(PROVISION 상한 10→11, lease 525s).

## 설계 대비 변경(§13.5)
- 켜는 순서 "꺼진 채→현재 값→켜기" 대신 "-1→켜기→현재 값"(값 push는 같은 lane lifecycle 뒤로만 fence 가능).
- DEAD PROVISION은 판정·존재 확인 모두 재적재하지 않음(예전 5분 재시도 폐지 → 단위 8 회복 창구).

## 검증
- 신규 `ApmAlertEvaluationZabbixPhaseIT` 17, `ApmAlertEvaluationDecisionTest` 10. 회귀 25 클래스 단독 통과. 뮤테이션 18종 전부 검출(호스트 생성 직렬화 제거만 비결정).

## 남은 의문(§13.7)
Zabbix 트리거 켜기/생성 시 마지막 값 즉시 판정 여부 미실측, 단위 7·6b의 host.get 증가, 대상 1,000+ 규모, 복귀 시 깜빡임, 5b 4차 🟡2 미반영, 새 설정 키 2개 yml 미기재.

## 2차 — 1차 반려 반영 (설계서 §13.8)
- 🔴1: "-1→켜기" 명령을 trigger 쓰기 **전에** 장부 커밋. 브리지 찾기/쓰기 분리. crash 테스트 `crashAfterHeldTriggerCreateStillEnables`.
- 🔴2: cacheReady·다른 소비자 생략 조건 제거. 켜짐 목표 + 아이템 신규 아님 + (트리거 없음|아이템 꺼짐|강제인데 전부 꺼짐)이면 -1 뒤 켜기. 공유 아이템은 5b 결정대로 -1 생략 유지(남은 의문).
- 🔴3a: 꺼진 아이템 + 켜진 기존 트리거 → 우리 트리거 먼저 끄기 → 아이템 재활성 → -1 → 켜기. 부분 실패 시 아이템 미재활성.
- 🔴3b: 보류 -1은 전용 카운터 `target.confirmRechecks`, 15초×20회 초과 시 DEAD(`NEUTRALIZE_TIMEOUT`) — STAT 미해제. 규칙 켜기·고아 복귀 경로는 캐시 미동기만 대기→DEAD, 아이템 없음/꺼짐은 완료(교착 회피). DEAD 부활 시 카운터 리셋.
- 🟡1 실패 시 장부 실집계·나머지 `?`. 🟡2 foreign host 단락(`hostForeign=true`). 🟡3 JVM-local 명시·already exists 5초 재확인. 🟡4 yml 기재.
- 테스트 변경: `ApmZbxStatusCommandIT.deadStatDoesNotBlockProvisionOrDeleteChain`의 PROVISION을 비강제로(강제면 보류 재적재가 같은 키 DEAD STAT을 병합 부활).
- 18 클래스 단독 통과, 뮤테이션 11종 검출. 누적 diff scratchpad `alert-6a-r2.diff`.

## 3차 — 2차 반려 반영 (설계서 §13.9)
- 🔴1 neutralize 상속: (i) 장부 병합 — 새 의사가 보류가 아니면 `neutralize`·보류 카운터 제거(soft뿐 아니라 규칙 켜기 hard도 — RPUSH↔PROVISION 상호 대기 방지), 새 의사도 보류면 유지. (ii) 실행기 — 아이템 없음/꺼짐 대기는 `hard && neutralize`에만. PROCESSING 중 병합 시 카운터 미증가로 새 의사 재실행.
- 테스트(StatusCommandIT): `softDisableDoesNotInheritNeutralize`(PENDING·PROCESSING·DEAD), `deleteAfterStuckHoldCompletes`, `softWithStaleNeutralizeCompletes`.
- 🟡1 실패 집계 = 판정 명령 ∪ 대상 바인딩 잔여 명령(`idsForBindings`), 테스트 `failureLedgerCountsFollowUps`. 🟡2 공유 아이템 -1 생략 유지 + 설계서에 위험·장기안(마지막 성공 push 시각, 단위 8 이후 백로그). 🟡3 `forcedProvisionRevivesDeadStatBehindNewPush` + 묵시적 부활 경로 문서화.
- 통과: StatusCommandIT 32, ZabbixPhaseIT 25, StoreIT 43, ProvisionIT 17, WritePathIT 11, DeletePathIT 8, ExecutionIT 30, RaceIT 24, ArchUnit 3. 뮤테이션 5종 검출. 누적 diff `alert-6a-r3.diff`.
