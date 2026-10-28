# 검수 요청 — 알람 재설계 단위 5a-2: 삭제·해소 확인 실행기, 워커, 삭제 경로 선적재 (2026-10-11)
- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(HEAD `68dc81b` = 단위 1~4 + 5a-1), 미커밋. diff `scratchpad/alert-5a2.diff`(HEAD 대비, 신규 파일 포함).
- 설계 `features/apm/alerts/apm-alert-unit5-6-design-20261011.md` §9 > §8, §10(5a-1 이관), **§11(5a-2 결과)**. 5a-1 검수 `review_apm-alert-unit5a1-20261011_codex3.md` 이관 목록.
- 범위: DELETE_TRIGGER·DELETE_ITEM·RESOLVE_CONFIRM 실행기, 워커, 삭제 경로 선적재, 브리지 저수준 연산. 끄기·켜기·PROVISION·STAT·PUSH 전환은 5b·6a.

## Zabbix 실측 (dev 7.0.6, 임시 호스트·그룹 생성 후 삭제 확인)
- `item.delete`는 그 item을 쓰는 trigger를 함께 삭제(거부 없음) → §9.2 확정: 선형화 후 붙은 DELETE_TRIGGER는 "트리거 없음" 성공.
- `trigger.delete`(직접·item cascade 모두)는 열린 Problem을 회복시키지 않음. 0·10·30초 `problem.get`·`event.get`에 value=1 잔존, 약 48분 뒤 problem.get에서만 사라짐, 회복 이벤트 없음 → R3 확정: 삭제 체인 RESOLVE_CONFIRM → DELETE_TRIGGER → DELETE_ITEM.

## 요지
- 허용 edge에 RCONF→DELT 추가, rank PROV·RPUSH 0 / STAT 1 / RCONF 2 / DELT 3 / DELI 4 / PUSH 5. maxZabbixCalls RCONF 6·DELT 5·DELI 5(토큰 2 포함), 최장 경로 계수 테스트로 고정.
- 정확 식별: 서버 검색은 넓게(트리거 owner·규칙·대상 태그 / 아이템 키), 코드에서 가상 호스트·owner·종류·정확 키 AND 재검증. 0건 성공, 복수 전부 삭제, id 100 초과는 DEAD.
- DELETE_ITEM: 조회 → `reconcileItemIds`(적재와 같은 잠금 순서로 m: lane을 정규 lane으로 이동, 같은 아이템의 DELETE_TRIGGER를 선행으로 복사, 선행 생기면 REQUEUED) → 참조 검사(zbx_itemid·논리 키·예약 바인딩이면 보존 완료) → `markLinearized` → item.delete.
- RESOLVE_CONFIRM: `clock <= cutoff`만 ack 닫기, 60초 뒤 재확인. 삭제 체인용(`beforeDelete`)은 10회 초과 시 포기·삭제 진행. manual_close=0만 남으면 일반은 DEAD, 삭제 체인용은 완료.
- 워커: 주기 drain + bounded executor(기본 4), 커밋 후 깨우기 트랜잭션당 1회·대기 합치기, `runNow` 예산 대기·cancel 금지·reject 시 PENDING, 실행 중 트랜잭션 있으면 반납, 라이선스 게이트 없음, `retryDue` 제거. 병렬 drain은 같은 resource claim 순서를 id로 보장하지 않음 → 순서는 edge로만, 테스트용 `drainOnCallerThread()`.
- 삭제 경로: 화면 삭제·`deleteRule`·SLO 해제·`releaseService`·고아 정리가 삭제 트랜잭션 안에서 바인딩 삭제 전에 `enqueueDelete`로 적재, 커밋 후 wake. 예약 바인딩은 태그·키로 적재. `releaseService` 반환값=적재 명령 수. 브리지 `removeObjects*`·`removeOwnedObject`·`resolveOpenProblems` 삭제, 트랜잭션 가드 붙은 RPC 단위 연산으로 교체.

## 검증
- 신규 `ApmZbxCommandExecutionIT` 15·`ApmAlertDeletePathIT` 7(실 PG + `FakeZabbixAlertBackend`, 트랜잭션 안 호출은 실패) 통과, `ApmZbxCommandWorkerTest`·수정 단위 테스트 통과.
- `premium.apm.alert.*` 433: 1차에서 `ApmAlertEvaluationRaceIT` 1 실패(앞 테스트 잔여 명령이 drain됨) → 명령 테이블 정리 후 RaceIT·LockOrderIT 재통과. 433 전체 재실행·`premium.apm.*` 전체 회귀는 **메모리 부족(OOM)으로 미완**.
- 뮤테이션 7종(적재 afterCommit 이동·id 화해 제거·cutoff `<`·트리거/아이템 exact 재검증 제거·선형화 제거·RCONF→DELT edge 제거) 전부 대응 테스트 실패.

## 의견 요청
1. 삭제 체인 RCONF 포기 기준(10회 × 60초)과 manual_close=0 시 완료 처리 정책.
2. 선형화 후 사후 선행 경로에서 item cascade로 지워진 트리거의 열린 Problem이 닫히지 않는 문제 — 5b·6a 이관으로 충분한가.
3. 5b PROVISION 재생성과 DELETE_ITEM 참조 검사 경쟁 — 이관으로 충분한가.
4. 병렬 drain에서 같은 resource 순서를 edge로만 보장하는 것이 §9 선형화와 충돌하지 않는가.

## 2. 코덱스 1차 **반려**(`_codex.md`) → 반영 (2026-10-11)
- 🔴1 ID 경로 식별: 트리거는 ID로 찾아도 가상 호스트·owner·규칙 uid 필수, 대상·종류는 알면 함께 일치. 식별 없으면 항상 남의 것. 규칙 uid는 target `ruleUid` → 출처 `rule_uid` 폴백, 둘 다 없으면 DEAD(`UNIDENTIFIED…`). 아이템은 ID 경로도 정확 키 필수(없으면 DEAD). 적재 시 바인딩 식별을 못 찾아도 규칙 uid 전달, 키 기반 DELETE_ITEM 화해 때 키 없던 이관 아이템 행에 정확 키 물려줌.
- 🔴2 포기 카운터: target JSON `confirmRechecks` — ack 성공 후 재확인으로 갈 때만 증가(Store `recheckConfirm`, 실행기 결과 `countConfirmRecheck`). 포기 판정은 조회로 열린 Problem 확인 뒤에만. 삭제 체인 병합 시 카운터 초기화.
- 🟡 sweep `@Transactional(MANDATORY)`, 사후 선행 IT에 열린 Problem 심고 "잔존" 단언(5b·6a 게이트로 뒤집을 대상, 설계서 §11.4 완료 조건 4개).
- 영향: 규칙 uid 없는 V53 트리거 행·정확 키 못 받은 V53 아이템 행은 DEAD 잔류 → 운영 수동 정리(`last_error` `UNIDENTIFIED`).
- 검증: ExecutionIT 19(신규 5)·DeletePathIT 8(신규 1)·단위 통과. 뮤테이션 m7(ID 경로 host+owner만)·m8(카운터=attempts) 대응 IT 실패. 전체 회귀 미실행. diff `scratchpad/alert-5a2-r2.diff`.

## 3. 코덱스 2차 **반려**(`_codex2.md`) → 반영 (2026-10-12)
- 🔴1 외부 트리거 cascade: DELETE_ITEM은 참조 검사 뒤·선형화 전에 `trigger.get itemids`(owner 무관, 상한 10)로 쓰는 트리거 조회 → 1건이라도 있으면 보존 완료(경고 로그). 상한 DELI 6, 리스 300초<600초. 늦은 체인이 기존 트리거에 붙으면 보존→REQUEUED→RCONF→DELT→DELI로 Problem 닫힘. 남는 것은 선형화 뒤 새로 생긴 트리거(5b PROVISION 경쟁)뿐 — Problem 잔존을 IT로 고정, 5b 게이트(§11.5).
- 🔴2 부분 식별: 트리거 식별은 (ruleUid, scopeUid, kind) 셋 필수. 부족하면 RCONF는 살아 있는 바인딩이 단일 식별을 줄 때만 복원, DELT는 살아 있는 바인딩이 모든 id를 가리키면 보존 완료, 그 밖은 UNIDENTIFIED DEAD. 완전 식별 DELT도 살아 있는 바인딩이 가리키면 보존. `enqueueResolve`에 kind 포함.
- 🔴3 정체: 운영 가이드 D2 비영행=배포 차단+정리 절차 4단계, "배포 전 V53 큐 비우기". Store `acknowledgeUnidentified(id, note)`(DEAD+`UNIDENTIFIED`만, 행 삭제로 edge 해소, `[AUDIT]` 로그). API 노출은 단위 8 상태 API와 함께(그전엔 가이드 SQL).
- 🟡 recheck generation CAS, 키 보충 DEAD 이관 아이템 PENDING 부활, 포화 시 호출 스레드 직접 실행 제거. RaceIT·LockOrderIT 삭제 검증을 "삭제 트랜잭션 Zabbix 0 + DELT 적재"로 변경(실행은 DeletePathIT가 메모리 Zabbix로).
- 검증: ExecutionIT 26·DeletePathIT 8·StoreIT 43·RaceIT+LockOrderIT 25·단위 통과. 뮤테이션 m9(쓰는 트리거 검사 제거)·m10(recheck CAS 제거)·m2·m4a·m7·m5 전부 대응 IT 실패(m5는 끼어드는 지점 조정 후). 전체 회귀 미실행. diff `scratchpad/alert-5a2-r3.diff`.

## 4. 코덱스 3차 **반려**(`_codex3.md`) → 사용자 결정 반영 (2026-10-12)
- 🔴1(조회~item.delete 사이 외부 트리거 cascade): **사용자 결정 = 자동 item.delete 중단, 운영 가이드만**. DELETE_ITEM 마지막 단계를 `item.update status=1` + 태그 `apm_gc=pending`·`apm_gc_since`(UTC)로 교체(tags 전체 교체라 기존 태그 함께 전송). 이미 표시면 호출 없이 완료, 없으면 성공. 참조·쓰는 트리거 검사·선형화·화해·정확 식별 유지. 명령 이름 DELETE_ITEM 유지(V79 CHECK 호환). 한 실행 1건 비활성화, 상한 6.
- "잔해 0" = 살아 있는 우리 아이템 0. 선형화 뒤 새 우리 트리거는 이제 지워지지 않고 늦은 체인이 Problem 닫고 삭제 → §11.5 Problem 잔존 게이트 해소.
- 5b 요구사항(§11.6): PROVISION이 비활성+표시 아이템을 재활성화·표시 제거 후 재사용(현재는 비활성 그대로 재사용 → 알람 안 울림, 5b 전 단독 배포 금지).
- 운영 가이드 신설 `guides/ops_apm-alert-item-cleanup.md`, ops_v79에서 링크. 🟡 D1 총건수>0 배포 차단, raw SQL은 단위 8 전 임시, UNIDENTIFIED 메시지에 빠진 칸 나열.
- 검증: ExecutionIT 28·DeletePathIT 8·단위 통과. latch IT(정리 직전 외부 트리거 생성 → 보존), m11(비활성화→delete) 8 실패, m5·m9 재확인 실패. diff `scratchpad/alert-5a2-r4.diff`.

## 5. 코덱스 4차 **반려**(`_codex4.md`) → 반영 (2026-10-12)
- 🔴 tag lost update: 자동 경로는 `item.update {itemid, status:1}`만 전송(Zabbix 7.0 item.update "Only the passed properties will be updated"). `apm_gc`·`apm_gc_since` 태그 폐기. 이미 비활성이면 호출 없이 완료.
- 정리 대상 정의 = 우리 가상 호스트 + owner 태그 + 비활성 + 살아 있는 바인딩 참조 없음(+ 쓰는 트리거 0). APM에서 우리 아이템을 끄는 경로는 DELETE_ITEM뿐(규칙 끄기·고아 정리는 트리거 상태만). 비활성 시각은 저장하지 않음(V80 미사용), 가이드 기준은 "참조 없음 + 삭제 직전 재조회".
- 허용 범위: 조회~update 사이 사람이 owner 태그를 지우면 비활성화는 됨(태그 복구·삭제 없음, 되돌릴 수 있음).
- 5b 게이트 §11.7: 같은 키의 비활성 우리 아이템은 재활성화(status=0, 태그 미전송) 후 재사용.
- 🟡 가이드 전면 개정: 판별 표, 삭제 직전 `selectTriggers` 재조회·0건 아니면 중단, 정리 중 트리거 변경 금지, "영향 없음"은 조건부, 삭제 영향을 값 이력 / 트리거 객체 연쇄 삭제로 구분.
- 검증: ExecutionIT 30(신규 2: 외부 태그 보존, owner 미복구)·DeletePathIT 8·BridgeTest 통과. m12(태그 전송 되살리기) → 신규 2건 실패. diff `scratchpad/alert-5a2-r5.diff`.
