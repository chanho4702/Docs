---
type: project
tags: [project, moveseye, dmove, backend, nestjs, zabbix-sync, audit, data-integrity, performance]
created: 2026-06-02
updated: 2026-06-02
status: active
---

# MovesEye BE — Zabbix Sync 로직 진단 (기능 결함 + 효율성) (2026-06-02)

> 자산관리(`/asset`) 기능 착수를 앞두고, "Zabbix에서 데이터를 가져와 DB에 저장"하는 핵심 로직을 검토한 기록.
> 대상 파일: `moveseye-be/src/zabbix-sync/services/zabbix-sync.service.ts` (약 643줄).
> 서비스 개요는 [[moveseye-overview]], BE 전반 진단은 [[2026-06-02-be-codebase-audit]] 참고.
> 이 노트의 가치 = **현재 동기화 로직의 데이터 정합성 위험 7건 + 효율성 5건 + 설계 부채 1건**을 우선순위까지 정리.

## 배경 — 자산관리는 아직 미구현

- `moveseye-be/CLAUDE.md`의 "향후 추가 예정"에 **자산 관리(`/asset`) — Asset Host(`/asset/hosts`) 구현 중**으로만 명시.
- 실제로 BE에 `asset` 모듈 **없음**, FE에도 asset 화면 **없음**(`assets/images/...` 로고 경로만 검색됨).
- 현재 **Zabbix → DB 영속 저장**의 유일한 경로는 `ZabbixSyncService.executeSync()`.

### Zabbix → DB 저장 경로 (현존)

| 메서드                                       | Zabbix API                                         | 저장 엔티티                        | 방식                        |
| ----------------------------------------- | -------------------------------------------------- | ----------------------------- | ------------------------- |
| `syncHostGroups()` (L176)                 | `hostgroup.get` (`selectHosts: ['hostid','name']`) | `HostGroup` (+ `hosts` JSONB) | 전체 삭제 후 재삽입               |
| `syncUserGroups()` (L95)                  | `usergroup.get`                                    | `UserGroup`                   | 전체 삭제 후 재삽입               |
| `syncUsers()` (L252)                      | `user.get`                                         | `User` + 관계 테이블               | create/update/delete diff |
| `handleUserUserGroupsTable()` (L556)      | —                                                  | `UserUserGroup`               | 전체 삭제 후 재삽입               |
| `handleHostGroupUserGroupsTable()` (L605) | —                                                  | `UserGroupHostGroup`          | 전체 삭제 후 재삽입               |

- 자산(서버/호스트) 데이터는 `syncHostGroups()`에서 `HostGroup.hosts` (jsonb, `HostData[] = {id,name}`)로 **그룹에 중첩 저장**됨. 호스트 단독 테이블 없음.
- 트리거: `user/services/user.service.ts:1404 runSync()` → `executeSync()` → `syncRoles()` → Redis `SYNC_TIME_KEY` 갱신. (스케줄/수동 양쪽 호출 가능)
- 호스트 메트릭(`src/host/` cpu·memory·disk·network)은 Zabbix history/trend **실시간 조회만**, DB 저장 안 함.

---

## 🔴 기능상 문제 (데이터 정합성)

### 1. `isSyncing` 동시 실행 가드가 죽어 있음 — race condition
- `isSyncing` 필드를 **선언(L29)만 하고 어디서도 사용하지 않음**.
- 대조군: 형제 서비스 `event/event-sync-service.ts`는 동일 패턴을 정상 사용 — `if (this.isSyncing) return`(L34) / `this.isSyncing = true`(L38) / `finally`에서 `false`(L193).
- **왜 심각한가**: 이 서비스는 동기화 중간 상태를 **인스턴스 필드**(`syncedUserGroups`, `syncedHostGroups`, `userGroupRelations`, `hostGroupRelations`)로 들고 다님. `executeSync()` 진입 시 이 필드들을 리셋(L66-69)하므로, 두 번째 sync가 첫 번째 진행 중 끼어들면 서로의 in-memory 상태를 덮어써 **관계 테이블이 엉뚱한 ID로 채워짐**.
- **수정**: `executeSync` 진입부 `if (this.isSyncing) return; this.isSyncing = true;` + `try/finally`에서 해제. (근본 해법은 #11 — 상태를 필드에서 제거)

### 2. 트랜잭션이 단계별로 쪼개져 부분 적용(partial commit)
- `executeSync`는 5단계를 **각각 독립 트랜잭션**으로 커밋. 모든 단계가 "전체 삭제 후 재삽입".
- 3단계(users)에서 실패하면 1·2단계(host/user group)는 **이미 커밋**되어, 그룹은 새 데이터인데 관계 테이블은 비거나 옛 ID를 가리키는 깨진 상태로 잔존.
- `catch`(L82-85)는 로그만 찍고 rethrow — **롤백 없음**.
- **수정**: 전체를 단일 트랜잭션으로 묶거나, "삭제는 마지막에" staging→swap 패턴.

### 3. 빈 응답 가드 부재 → 전체 데이터 소실 위험 ⚠️ 최우선
- `syncHostGroups`/`syncUserGroups`는 **무조건 먼저 전체 삭제**(L109-114, L190-195) 후 Zabbix 결과 삽입.
- Zabbix가 일시 장애·권한 문제로 **빈 배열을 정상 반환**하면, 삭제만 일어나고 `groupsToInsert.length > 0` 조건(L143, L223)에 막혀 재삽입 0건 → **모든 호스트그룹/유저그룹 데이터 소실**.
- **수정**: 응답이 비었으면 sync 중단(삭제 전 가드). "0건일 리 없다"는 도메인 불변식 명시.

### 4. `ALTER SEQUENCE ... RESTART WITH 1` — 외부 참조 무효화
- 매 sync마다 `user_group_id_seq`(L117-119)·`host_group_id_seq`(L197-199)를 1로 리셋하고 PK를 새로 발급.
- 같은 sync 안에서 관계 테이블은 새 ID로 다시 채우지만, **이 PK를 참조하는 다른 테이블**(권한·알림 설정 등)이 있으면 전부 끊어짐. 동시성 환경에서 시퀀스 리셋 자체도 위험.
- **수정**: 시퀀스 리셋 제거. 자연키(`zabbixHostGroupId`/`zabbixUsrgrpid`) 기반 upsert로 PK 안정성 확보.

### 5. UserGroup/HostGroup은 무차별 삭제, User만 diff — 전략 불일치
- `syncUsers`는 create/update/delete를 비교(diff)로 정교하게 처리(L289-310).
- 반면 UserGroup·HostGroup은 `where('1=1')` **전체 삭제 후 재삽입** → 수동 생성한(=Zabbix에 없는) 그룹이 매 sync마다 사라짐.
- 같은 서비스 안에 두 전략 혼재. **수정**: 그룹도 자연키 기반 diff/upsert로 통일.

### 6. `Not(UserRole.ADMIN)` — SUPER_ADMIN 삭제 가능성
- `syncUsers` 기존 유저 조회가 `userRole: Not(UserRole.ADMIN)`(L270)만 제외.
- SUPER_ADMIN 계정이 Zabbix 목록에 없으면 `usersToDelete`(L310)에 포함되어 **삭제될 수 있음**.
- **수정**: `Not(In([ADMIN, SUPER_ADMIN]))` 또는 `platform = ZABBIX` 기준 필터. (UserRole enum 실제 값 확인 필요)

### 7. `Number(rel.hostGroupId) || 0` — 조용히 깨진 FK 생성
- `handleHostGroupUserGroupsTable`에서 변환 실패 시 `0`으로 폴백(L630-631) → groupId 0인 관계 row가 그대로 INSERT되어 무결성 깨짐.
- **수정**: 0/NaN이면 해당 관계 필터링 또는 예외.

---

## 🟡 효율성 문제

### 8. `[...acc, x]` 스프레드 누적 → O(n²)
- `processUsersToCreate`(L414), `processUsersToUpdate`(L459)가 reduce 안에서 매 반복 새 배열 생성. 유저 수가 많을수록 제곱으로 느려짐.
- **수정**: `acc.push(x); return acc;` → O(n). (또는 `_.map`)

### 9. `processUsersToCreate`의 async reduce — 비밀번호 해싱 직렬화
- reduce에 async를 써서(L385-417) `await result`로 유저별 `hashPassword()`(bcrypt, 비싼 연산)를 **순차 실행** → 유저 수에 비례한 지연.
- **수정**: `Promise.all(users.map(async u => { await u.hashPassword(); ... }))`로 병렬화.

### 10. `save()` 대량 호출
- `save`는 엔티티별 존재 확인 후 INSERT/UPDATE → 대량 신규 삽입엔 비효율.
- 생성 ID가 필요한 HostGroup/UserGroup은 불가피하나, **신규 User는 `insert()`** 또는 청크 분할이 빠름.

### 11. 인스턴스 필드에 중간 상태 보관 — 설계상 취약점 (근본 원인)
- `collectUserGroupRelations`/`collectHostGroupRelations`가 결과를 **클래스 필드**(`userGroupRelations` 등)에 저장하고 다른 메서드가 소비.
- 이것이 **#1(동시성)의 근본 원인**이자 단위 테스트를 어렵게 만듦.
- **수정**: 반환값으로 넘기는 순수 함수형으로 리팩터링.

### 12. status 판정 로직 중복
- INACTIVE 그룹 판정(`_.some(usrgrps...)`)이 create(L392-397)·update(L446-452)에 복붙.
- **수정**: `resolveUserStatus(zabbixUser): UserStatus` 헬퍼 추출.

---

## 🟢 설계 부채 (자산관리와 직결)

### 13. 호스트를 `HostGroup.hosts` JSONB에 중첩 저장
- `database/models/host-group.entity.ts`: 호스트가 그룹 엔티티의 `jsonb` 컬럼(`HostData[]`, `host_data`)에 박혀 있음.
  ```ts
  @Column({ type: 'jsonb', name: 'host_data', default: [] })
  hosts: HostData[];   // HostData = { id: string; name: string }
  ```
- 결과:
  - 호스트가 여러 그룹에 속하면 **중복 저장**
  - **호스트 단위 조회·조인·인덱싱·페이징 불가**
- **자산관리(`/asset/hosts`)를 제대로 만들려면 호스트를 별도 정규화 테이블(`Host` 엔티티 + 그룹과 M:N)로 분리하는 것이 사실상 전제 조건.** 현 JSONB 구조 위에 자산관리를 얹으면 검색·페이징·상세조회에서 즉시 막힘.

---

## 우선순위

| 순위 | 항목 | 근거 |
|---|---|---|
| 1 | #3 빈 응답 가드 · #1 동시성 가드 | 데이터 소실/오염 직결, 수정 비용 작음 |
| 2 | #2 트랜잭션 통합 · #6 SUPER_ADMIN 보호 | 정합성 |
| 3 | #8·#9 효율성(스프레드/직렬 해싱) | 핫패스 |
| 4 | #13 호스트 정규화 | 자산관리 착수 전 결정 필요 (설계) |

## 교훈 (Lessons)
- **"전체 삭제 후 재삽입"은 외부 소스의 빈 응답에 취약하다.** 삭제 전에 응답 비어있음 가드를 반드시 둔다. 가능하면 자연키 기반 upsert/diff로 전환.
- **선언만 된 가드 필드(`isSyncing`)는 형제 모듈과 대조하면 누락이 드러난다.** 같은 패턴의 다른 구현을 레퍼런스로 비교하는 게 빠른 진단법.
- **여러 단계 sync는 트랜잭션 경계를 한 번 더 의심한다** — 단계별 커밋은 중간 실패 시 부분 적용을 남긴다.
- **인스턴스 필드에 중간 상태를 들고 다니는 서비스**는 동시성·테스트 양쪽에서 취약. 상태는 반환값으로 흘려보낸다.
- JSONB 중첩은 쓰기는 편하나 **조회·조인이 필요한 도메인(자산)에는 부적합** — 정규화 시점을 기능 착수 전에 결정.

## 관련 노트
- [[moveseye-overview]] — 서비스 개요/구조
- [[2026-06-02-be-codebase-audit]] — BE 전반 건강 진단
- [[2026-06-02-fullstack-harness]] — 풀스택 하네스(자산관리 구현 시 사용)
- [[nestjs-operations]] — NestJS 운영/트랜잭션 패턴
