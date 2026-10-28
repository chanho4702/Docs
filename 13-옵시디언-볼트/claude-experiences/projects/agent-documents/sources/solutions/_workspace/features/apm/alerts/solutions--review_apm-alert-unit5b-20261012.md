# 검수 요청 — APM 알람 재설계 단위 5b (생성·상태 실행기, 화면 쓰기 경로 명령화)

- 일자: 2026-10-12
- 브랜치: `apm-alert-history`(워크트리 `C:\worktrees\apm-c05-followup`), 미커밋. 직전 커밋 `09c5261`(5a-2)
- diff: scratchpad `alert-5b.diff`(5,376줄)
- 설계 정본: `_workspace/features/apm/alerts/apm-alert-unit5-6-design-20261011.md` §2·§4·§8·§11(5b 게이트)·§12(이번 결과)
- FE 계약: `_workspace/features/apm/alerts/contract_apm-alert-zabbix-apply.md`(FE 반영은 단위 8)
- 이 브랜치는 단독 배포하지 않는다(6a·7·6b·8 후 BE·FE 함께 병합).

## 1. 범위

1. **실행기 3종**
   - `ApmZbxProvisionExecutor`: 실행 시 DB 재조회 → 아이템·트리거 생성/정렬. 아이템 확보 직후 id 기록(①), 트리거 후 나머지 기록(②). 같은 키의 꺼진 우리 아이템은 `item.update {itemid,status:0}`(태그 미전송) 후 재사용. 실행 중 바인딩 소멸 시 정리 명령 재적재(보상). 라이선스 없으면 `DEFERRED`(시도 수 원복).
   - `ApmZbxTriggerStatusExecutor`: 원하는 상태(규칙 켜짐 ∧ 비고아)를 DB에서 다시 읽은 뒤 라이선스 판정. 만료 중엔 켜기만 막고 끄기는 수행.
   - `ApmZbxResolvePushExecutor`: -1 1회 push. soft(끄기·고아)는 1회 후 완료, hard(켜기)는 전송 실패 시 재시도, 아이템 없음·꺼짐은 완료. 다른 활성 규칙이 같은 아이템을 읽으면 생략.
2. **5b 게이트**: 꺼진 우리 아이템 재활성화(PROVISION·기존 평가 경로). 신규 바인딩 예약은 행 insert **뒤** item-family 잠금을 커밋까지 보유(먼저 잡으면 서비스 삭제와 교착). DELETE_ITEM은 선형화 직전 잠금 안에서 참조 재조회 → 새 바인딩 있으면 보존 완료. 반대 순서면 PROVISION이 정리 완료 후 재활성화.
3. **화면 쓰기 경로**: 생성·수정·끄기·켜기·resync·고아/복귀는 트랜잭션 안 Zabbix 호출 없이 명령만 적재.
   - 끄기: RPUSH(-1) → STAT(off) → RCONF. 켜기: 남은 RCONF 취소 → RPUSH(hard) → STAT(on).
   - `ApmAlertRuleWriteFacade`(비트랜잭션): 커밋 후 해당 규칙 명령을 최대 3초 실행, 초과·풀 포화 시 `QUEUED` 응답, 작업은 취소하지 않음. resync THEIRS의 Zabbix 읽기는 커밋 전·트랜잭션 밖.
   - 02:00 대조는 PROVISION 대기 바인딩 건너뜀.
4. **응답 필드(추가만)**: 바인딩 요약 `queued`·`commandFailed`(queued는 missing에 미포함, 우선순위 missing>drift>queued>pendingCache>synced), 규칙 DTO `zabbixApply`(APPLIED|QUEUED|FAILED, 쓰기 응답만), 진단 DTO `bindingQueued`·`commands`, SLO `burnAlert.zabbixSyncing`.
5. **V80**: 바인딩의 `TRIGGER_STATUS_PENDING` 표식 → STAT 명령 이관 후 표식 제거(재실행 안전). V79 무수정.
6. **lease**: maxZabbixCalls PROVISION 12→10, RESOLVE_PUSH 4→3. 실측 최장 경로와 일치하도록 테스트 고정.

## 2. 설계와 다르게 정한 것

1. 켜기 순서 보강: PROVISION rank 0→1, "RPUSH → PROVISION" edge 허용(PROVISION이 -1보다 먼저 트리거를 켜 옛 값으로 재발화하는 R1 방지).
2. 기록 ②와 명령 완료가 같은 트랜잭션이 아님(§2.10과 다름). 사이 정지 시 재실행이 같은 객체를 찾아 재기록.
3. 비enforce PROVISION은 옛 트리거 이름 정렬을 하지 않음(평가 쪽 기존 경로가 수행).
4. U3 구조화 필드(`decisionCommitted` 등)는 6a로.
5. 켜기 RPUSH가 "아이템 없음·꺼짐"이면 완료 처리(재시도하면 그 -1을 기다리는 PROVISION이 영구 정체).

## 3. 검증

- JDK17·격리 DB 5434·`-Dit.db.required=true`·`--no-daemon`·힙 1g·클래스 단위.
- 신규: `ApmZbxProvisionIT` 13(늦은 바인딩 vs 아이템 정리 latch 3종), `ApmZbxStatusCommandIT` 10, `ApmAlertRuleWritePathIT` 10, `V80MigrationIT` 2, `ApmZbxWriteSingleEntryTest`(ArchUnit) 2.
- 기존 회귀 통과: ExecutionIT·DeletePathIT·StoreIT·V79·RaceIT·LockOrderIT·EvaluationIT·EventHistoryIT·Notification/Dispatch·EventStore/Search·Job·Retry·StuckMonitor·ContractFixture·SloService·LicenseArchitecture 외 수정 단위 테스트. RaceIT "I/O 중 정지"는 §4.7대로 PROVISION 정지→삭제 비대기→재개→보상으로 교체, LockOrderIT 정지 지점은 예약 뒤·커밋 전으로 교체.
- 뮤테이션 11종 전부 검출: 재활성화 제거·라이선스 재판정 제거·예약 잠금 참여 제거·선형화 안 참조 재조회 제거·기록① 제거·보상 제거·STAT DB 재조회 제거·facade `cancel(true)`·끄기 순서 edge 제거·켜기 RPUSH→PROVISION edge 제거·트랜잭션 안 Zabbix 호출.
- `premium.apm.*` 전체 회귀는 병합 직전 분할 실행(사용자 결정).

## 4. 의견 요청

1. 켜기 시 바인딩이 처음 생기는 대상은 -1 단계가 없다. 공유 아이템·재활성 아이템의 옛 양수로 즉시 발화 가능 — 6a PUSH_CURRENT와 함께 볼지, 5b에서 막아야 하는지.
2. 규칙 목록 요약의 규칙별 명령 집계 조회(N+1) — 지금 일괄 조회로 바꿔야 하는지.
3. `zabbixStatus()`가 읽기 전용 트랜잭션 안에서 Zabbix를 읽는 기존 동작 — 6b로 미뤄도 되는지.
4. 설계와 다르게 정한 5건(§2) 각각 수용 가능한지.

## 5. 2차 반영(1차 검수 반려 대응) — diff `alert-5b-r2.diff`(누적)

- 🔴1 캐시 host: 실행기 경로는 캐시를 읽지 않고 쓰기 전 매번 `host.get`으로 존재+owner tag 확인(확인 시 캐시 갱신, 실패 시 무효화). 근거: tag만 제거된 경우 `item.create`가 성공해 실패 기반 무효화로는 첫 오염을 못 막음. 비용 PROVISION당 1회(상한 10 안). 5분 평가의 옛 일괄 `provision()`은 캐시 유지·실패 시 무효화, `provisionItem` 실패 시에도 무효화. 테스트: 캐시→tag 제거(쓰기 0·DEAD·캐시 비움), 캐시→host 삭제(재생성 수렴).
- 🔴2 PROCESSING 취소: PROCESSING 행은 물리 삭제 대신 `target.cancelled` 표식+세대 증가, PENDING·DEAD는 기존대로 삭제. 행이 lane·edge를 유지해 후행 STAT(on)은 진행 중 RPUSH 종료 후에만 claim. 진행 중 실행의 완료 기록은 REQUEUED, 재claim 시 워커가 표식 보고 무실행 완료. 재적재 시 표식 해제. RPUSH push 직전 renew 추가. 5a-2 RCONF 취소도 동일 규칙 적용. latch 테스트: RPUSH 진행 중 고아 복귀 → STAT 미claim·push 1회·이후 트리거 on. 잔여: 5분 평가 트랜잭션 내 직접 push와의 순서는 6a 이관.
- 🟡: facade 완료 판정 = 실행 대상과 같은 집합(바인딩 명령+같은 lane RCONF), RCONF만 남으면 QUEUED / 정확 소유 트리거 중복 시 STAT·PROVISION 전부 수렴(이미 맞으면 생략, 상한 초과 시 즉시 재실행) / 목록 명령 요약 일괄 조회 / 기록② 후 lease 만료 재claim 수렴 테스트 / V80 collector·SLO·`m:b:{id}` 테스트.
- 테스트: ProvisionIT 17·StatusCommandIT 13·WritePathIT 11·V80 3·StoreIT 43·ExecutionIT 30·DeletePathIT 8·RaceIT 24·LockOrderIT 1·EvaluationIT 14·EventHistoryIT 19·BridgeTest 50·CleanupServiceTest 7·AlertServiceTest 52·SweeperTest 10·WorkerTest 7·MvcTest 8·ArchUnit 2 전부 통과.
- 뮤테이션 9종 전부 검출(실행기 캐시 신뢰·취소 물리 삭제·워커 표식 무시·재적재 표식 미해제·facade RCONF 제외·STAT 첫 트리거만·PROVISION 첫 트리거만·N+1 등). `provisionItem` 실패 시 무효화는 단독 뮤테이션 미검출(보조 경로).
- 설계서 §12.8(2차 결과)·§12.9(이관 목록, 합본 배포 전 필수).

## 6. 3차 반영(2차 검수 반려 대응) — diff `alert-5b-r3.diff`(누적)

- 🔴 RPUSH 소유 확인: push 직전 읽기 전용 2 RPC(우리 가상 host 존재+owner tag / 그 host의 정확 key item의 owner tag·상태). foreign(host owner 없음·item owner 없음·교체)이면 hard=`ZABBIX_OBJECT_NOT_OWNED` DEAD(후행 STAT·PROVISION은 edge로 차단), soft=push 없이 완료+경고(뒤의 STAT off·RCONF 정리 의무를 막지 않기 위함, 잃는 것은 회복 이벤트 하나이고 Problem은 RCONF가 닫음). missing·disabled는 기존대로 완료→PROVISION. item id는 식별 기준으로 쓰지 않음(owner+정확 key). maxZabbixCalls RPUSH 3→5(토큰2+확인2+push1), lease 5×45+30=255s, 최장 경로 5회 테스트 고정. 확인↔push 사이 1 RPC 창은 Zabbix 조건부 push 부재로 잔존(설계서 명시).
- 🟡1 PROVISION·트리거 쓰기 직전 재확인은 미도입: 조건부 update 부재로 창이 남고, 상한 15·lease 705s로 기본 600s 초과. 설계서 명시.
- 🟡2 NOT_OWNED DEAD 회복 창구(DEAD 목록·retry-dead·규칙 resync) §12.11 단위 8 이관(합본 전 필수).
- 🟡3 ApmAlertRuleController 클래스 주석 실제 비동기 동작으로 수정.
- 테스트: 신규 6(owner 제거·같은 key foreign 교체·host 소유 상실 × hard/soft, 전부 push 0, hard는 DEAD+STAT PENDING). StatusCommandIT 19·WritePathIT 11·PropertiesTest 5·ArchUnit 2·Mvc 8 통과. 뮤테이션 3종(소유 확인 전체 제거·item owner만 제거·host owner만 제거) 전부 검출.

## 7. 4차 반영(3차 검수 반려 대응) — diff `alert-5b-r4.diff`(누적)

- 🔴 hard RPUSH 판정 순서: hard는 소유 확인 먼저 → FOREIGN=DEAD(STAT on·PROVISION edge 유지) / MISSING=완료 / OURS일 때만 "item id 없음·공유 소비자"면 push 생략 완료, 아니면 push. soft는 기존 순서 유지(생략은 쓰기 아님, 후행 STAT off·RCONF는 정리 의무). 테스트: hard+공유+foreign 3종 → RPUSH DEAD·STAT/PROVISION PENDING·쓰기 0, hard+공유+OURS → push 생략·STAT on 실행. 뮤테이션(hard도 공유 생략 선행) → foreign 3건 실패.
- STAT host 소유 확인 추가: 트리거 조회 전 `host.get` 1회(캐시 미사용). host 없음=완료, foreign+on=DEAD(`ZABBIX_OBJECT_NOT_OWNED`), foreign+off=쓰기 없이 완료+경고. STAT 상한 4→5, lease 255s. 최장 경로 5회 테스트 고정. `statRefusesForeignHost` 추가, 뮤테이션 검출.
- 문서: §12.10 TOCTOU 근거를 "조건부 update 부재로 완전 제거 불가 + 재확인 시 상한 15·705s → 잔여 위험 수용"으로 정정(중복 트리거는 get 1회 후 update 최대 4회 명시). §12.11 정정·§12.13 신설: resync·수정은 `PROV:b{id}`만 재적재하고 DEAD hard RPUSH는 부활하지 않음(PROVISION·STAT 막힘, 화면 queued), 껐다 켜기는 회복 수단 아님, `retryDead()`·`acknowledgeUnidentified` production 호출처 없음 → 단위 8 회복 창구(DEAD 목록·막힌 후속 명령·개별 retry-dead)는 resync 재적재에 의존 금지, 운영자 절차(Zabbix 충돌 해소 → 개별 retry-dead → 후속 실행). 단위 8 전 운영 가이드 SQL 보강은 미착수.
- 테스트: StatusCommandIT 24·PropertiesTest 5·WritePathIT 11·ProvisionIT 17·ArchUnit 2 통과.
