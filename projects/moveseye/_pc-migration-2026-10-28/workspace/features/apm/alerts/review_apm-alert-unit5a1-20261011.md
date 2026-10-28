# 검수 요청 — 알람 재설계 단위 5a-1: Zabbix 명령 장부 대수·마이그레이션 (2026-10-11)
- 워크트리 `C:\worktrees\apm-c05-followup`, 브랜치 `apm-alert-history`(HEAD `3015cd7` = 단위 1~4), 미커밋. diff `scratchpad/alert-5a1.diff`(HEAD 대비, rename 포함).
- 설계 `features/apm/alerts/apm-alert-unit5-6-design-20261011.md` §8·§9(우선), 설계 검수 `_codex.md`·`_codex2.md`.
- 범위: V79·의존 표·Store·설정/기동 검증·기존 정리 큐 어댑터. 실행기·호출처 전환은 5a-2/5b.

## 요지
- V79: rename `apm_zbx_cleanup→apm_zbx_command`(열·시퀀스·PK), 옛 UNIQUE·인덱스 DROP, nullable 추가→백필→NOT NULL·CHECK(명령 7종 PUSH_CURRENT 포함, 상태 3, PROCESSING⇔claim, 마커는 PROCESSING일 때만, 종류별 식별자 필수)·UNIQUE(dedup_key)·`UNIQUE(resource_key) WHERE status='PROCESSING'`. 의존 표 `apm_zbx_command_dep`(PK·양 FK CASCADE·자기 edge 금지).
- V53 승계: TRIGGER→DELETE_TRIGGER(`DELT:t{id}`, 살아 있는 바인딩이 가리키면 정규 바인딩 축 resource, 아니면 `m:v53:t:{id}`), ITEM→DELETE_ITEM(`m:v53:i:{id}`), RESOLVE→RESOLVE_CONFIRM(cutoff=적재 시각). 의존: 같은 rule/slo/service면 트리거→아이템, 출처 전부 빈 행만 전역 barrier. 실 seed: TRIGGER 5·ITEM 3·RESOLVE 2 → edge 11·barrier 2. 이관 로그 RAISE WARNING.
- Store(`premium.apm.alert.command`): enqueue(병합 §8.1 전 종류, supersede — **PENDING·DEAD push 모두**, push 적재 시 같은 resource lifecycle을 선행으로 fence, DELETE_TRIGGER→DELETE_ITEM 자동 연결), addDependency(successor FOR UPDATE·predecessor KEY SHARE·허용 종류표·사이클 검사·generation+1), cancel, claimOne/claimByIds(행별 REQUIRES_NEW, 23505면 다음 후보, 리스 만료+선행 생긴 PROCESSING은 먼저 PENDING 해제), renewLease·markLinearized·complete·retry·dead·release(전부 token CAS, push 재PENDING 시 재fence), stats·blockedBy·retryDead.
- 설정 lease 10분 + 기동 검증(`ZabbixHttpLimits` 공통 상수 — ZabbixClient도 사용): PROVISION 12회×45초+30초=570초<600초.
- 어댑터 `ApmZbxCleanupService`: 호출처 시그니처 유지, 저장만 Store. 과도기 차이 2(재적재 시 재시도 시각 당김, 같은 평가 트랜잭션 RESOLVE는 다음 회차) — 5a-2 워커 전환 시 소멸.

## 검증
- 격리 PG 5434 `premium.apm.*`+LicenseArchitectureTest+FlywayMigrationSmokeIT **2,639 통과**, engine-zabbix·engine-api 통과. 신규 StoreIT 28·V79MigrationIT 6·PropertiesTest 4·어댑터 8. 뮤테이션 4종(partial UNIQUE·선행 조건·generation CAS·DELETE DO NOTHING) → 대응 IT 실패 확인.

## 의견 요청
1. dedup 이중 축(`DELT:t{id}` vs `DELT:g{md5}`)으로 같은 트리거 두 행 가능 — 5a-2 흡수 규칙으로 미뤄도 되나.
2. DEAD push까지 supersede.
3. 선형화 이후 선행 edge → item 명령 재실행(멱등 삭제) 정책.
4. 이관 아이템 resource가 `m:` 임시 키인 동안 새 정규 DELETE_ITEM과 resource가 갈리는 문제(itemId 자동 연결로 선후 유지).
5. maxZabbixCalls 추정값.

## 6. 코덱스 1차 **반려**(`_codex.md`) → 반영 (2026-10-11)
- 🔴 PROCESSING 중 re-key 유실: `pending_resource_key` 열 — PROCESSING 행에 정규 키 재적재 시 기록, PROCESSING을 빠져나가는 모든 경로(완료 재대기·retry·dead·release·선형화 복귀·리스 만료 해제)와 재claim이 같은 SQL에서 적용. claim은 pending 키를 "그 lane 실행 중"으로 간주. `markLinearized`는 pending 키 있으면 REQUEUED. 별칭(dedup 다른 같은 대상): 정규 적재 시 **같은 Zabbix id를 가진 `m:` 행을 정규 lane으로 이동**(양방향, 실행 중이면 pending+generation+1) — V53 행엔 키·uid가 없어 id만 공통 식별자. 한계: 정규 적재 커밋 직전 순간 정규 lane 다른 명령 claim 가능하나 m: 행 generation 증가로 순서대로 재실행·삭제 멱등으로 수렴.
- 🟡 release generation 판정, 잠금 순서 3단계(① resource advisory 해시 오름차순 → ② 기존 명령 행 한 문장 id 오름차순 FOR UPDATE → ③ 새 행 INSERT dedup 오름차순, PUSH 결과 기록도 ①→②, deadlock 재시도는 호출자 롤백이라 없음), 동시 IT 3종×15라운드, 23505 후 다음 후보·SKIP LOCKED IT, V53 진단 seed(행 15·edge 19)·운영 메모 `guides/ops_v79-predeploy-diagnostics.md`(D1~D5), 어댑터 최초 오류 `last_error` 복구, V79 실패 롤백 IT, DEAD push supersede+CASCADE 테스트.
- 검증: `premium.apm.*`+LicenseArchitectureTest+FlywayMigrationSmokeIT **2,651 통과**. 뮤테이션 8종 전부 대응 IT 실패. diff `scratchpad/alert-5a1-r2.diff`.

## 7. 코덱스 2차 **반려**(`_codex2.md`) → 반영 (2026-10-11)
- 🔴1 별칭 TOCTOU: 대상 id 가족 잠금(`zt:{id}`·`zi:{id}`, resource 잠금과 별도 네임스페이스)을 별칭 판정보다 먼저 — 가족 잠금 → 별칭 판정 → resource 잠금 → 기존 행 잠금 → INSERT. latch IT 2(트리거·아이템 계열 양방향).
- 🔴2 미커밋 lifecycle 중 push claim: 기존 행 선잠금에 lifecycle 대상 resource의 PUSH_CURRENT를 상태 무관 포함(pending 정규 키 = spec resource라 함께 덮임) → claim은 SKIP LOCKED로 건너뛰고 커밋 시 supersede. latch IT.
- 🟡 pending 키 있는 만료 PROCESSING 즉시 재claim IT, 운영 진단 D6(lane PROCESSING 2행+)·D7(같은 가족 같은 id가 다른 lane) + IT.
- 검증: StoreIT 43 통과. 회귀 2,656 중 1 실패 `ApmTraceReclassificationIT`(trace rollup, 무관, 단독 15/15 — 간헐, 이전에도 1회 관측). 뮤테이션: 가족 잠금 제거 → 2 실패, push 선잠금 제거 → 4 실패. diff `scratchpad/alert-5a1-r3.diff`.
