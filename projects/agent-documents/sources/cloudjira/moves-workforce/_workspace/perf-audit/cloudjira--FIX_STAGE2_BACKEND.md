# 성능 감사 2단계 백엔드 수정 — A-3 · A-7 (2026-08-12)

> **rev3 (통합 검증 F-2 · O-1 반영)** — 문서 말미 「수정 이력(rev3)」.
> 1. **F-2** A-7 캐시가 백오피스 CRUD 목록 읽기까지 덮어 read-after-write 가 깨졌다 →
>    **CRUD 화면 목록 resolver 5종은 fresh, 서버 내부 소비자는 캐시**로 분리(TeamTreeCache F3 선례).
> 2. **O-1** 이슈 편입/해제(`updateProjectIdField` 계열)에도 참여자 캐시 무효화 추가.
>
> **rev2 (Codex 상위 모델 리뷰 반영)** — 아래 3건을 수정했다. 상세는 문서 말미 「수정 이력(rev2)」.
> 1. A-3 캐시가 **완료된 결과만** 담아 동시 진입에서 목표(2N→N) 미달 → **Promise 캐시**로 교체
> 2. A-3 **무효화 누락** — coworker/assignee 쓰기 경로 2곳에서 참여자 캐시 무효화
> 3. A-7 **`settings` 를 캐시 대상에서 제외**(급여 fail-close 경계 위반) → 사전 **5종만** 캐시

- 근거 문서: `_workspace/perf-audit/BACKEND_2026-08-12.md` (A-3, A-7) · `_workspace/perf-audit/CODEX_REVIEW_RFC187.md`
- 범위: **A-3 · A-7 두 건만**. 1단계 미커밋 변경(MyWorkService / WorklogService / `rdb/query/ProjectDashboard.js` / WorklogPage 등)은 손대지 않았다.
- **응답 shape 불변** — 이번 변경으로 바뀐 resolver 응답 필드는 **없다**.
- 테스트: 루트 `npm test` → **70 suites / 1,110 tests 전부 통과**.

---

## A-3. 대시보드 통계 2종의 동일 전량 스캔 중복

### 무엇을 했나

`getAssigneeStats`(담당자별 건수)와 `getIssueParticipantStats`(이슈별 참여자 수)가 **문자 단위로 같은 검색 URL**을
각자 전량 페이지 루프로 긁던 것을, **1패스 전용 페처 + 2집계**로 갈랐다.

| 파일 | 내용 |
|---|---|
| `src/api/jira/issue/ProjectParticipantFetcher.js` (**신규**) | 대시보드 참여자 전용 1패스 페처. `maxResults=100` + `nextPageToken` 루프는 종전과 동일, 이슈당 `{issueKey, accountId, displayName, avatar, coworkers}` 최소 필드만 남긴다 |
| `src/api/jira/issue/IssueApi.js:9-71` | `getAssigneeStats` — 페치 제거, 페처 결과에서 **집계만**. coworker bulk resolve는 종전대로 루프 밖 1회 |
| `src/api/jira/issue/IssueApi.js:73-115` | `getIssueParticipantStats` — 같은 페처 결과에서 참여자 수만 집계 |
| `src/resolver/projectIssue/ProjectUsersService.js:300-316` | 두 서비스에 `viewerId` 인자 통과(기본 `null`) |
| `src/resolver/projectDashboard/ProjectDashboardService.js:203-206, 265-282` | `principal?.accountId` 를 `viewerId` 로 전달 |

**계약 불변 근거**
- `getAssigneeStats` → `[{accountId, name, avatar, value}]` (미배정은 `accountId:'unassigned'`, `name:'unassigned'`)
- `getIssueParticipantStats` → `{averageParticipants, issueStats:[{name, value}]}`
- 두 함수의 export 위치·시그니처(추가 인자는 optional 뒤쪽)를 유지했으므로 기존 mock(`SalaryPolicyLeak.test.js:172-176`)과 내부 소비자(`ProjectDashboardService` 유일)가 그대로 동작한다.
- 순회 순서가 페이지 순서 그대로라 결과 배열 순서도 종전과 같다(차트 카테고리 순서 불변).

### 요청 간 캐시 — 도입했다. TTL 60초 · **프로세스 메모리** · 사용자별 키

프론트는 위젯당 `invoke('getChartDataById')` 1회이므로(`ChartTemplate.js`) assignee/issue 두 위젯은
**서로 다른 invoke** 다. 요청 스코프 메모만으로는 감사가 지적한 중복(1,000이슈 프로젝트 = 검색 20회, 그중 10회 완전 중복)이
그대로 남는다. 그래서 페처에 모듈 스코프 단일 엔트리 TTL 캐시를 뒀다. 보수적으로 잡은 근거:

| 결정 | 근거 |
|---|---|
| **TTL 60초** | `TeamTreeCache.getTeamIndex` 관례. 같은 파일 계열의 워크로그 위젯 KVS 캐시(10분)보다 **10배 보수적**이다. stale 은 "담당자를 바꾼 뒤 차트 반영이 최대 60초 늦다" 하나뿐이다 |
| **KVS 가 아니라 프로세스 메모리** | 이 검색은 `as:'user'` 라 **결과가 호출자 권한으로 필터링**된다. `Assignee:{projectId}` 형태의 KVS 공유 캐시(감사 수정방향 ②)는 사용자 간 가시 범위를 섞을 수 있어 채택하지 않았다 |
| **캐시 키에 `viewerId`(호출자 accountId) 포함** | 같은 인스턴스에 다른 사용자가 와도 남의 가시 범위를 보지 않는다 |
| **`viewerId` 없으면 캐시 미사용** | principal 전달이 빠지면 조용히 공유되지 않게 fail-safe |
| **엔트리 1개만 유지** | 대시보드는 한 사용자가 한 프로젝트 위젯을 연속 렌더한다. 다른 키가 오면 교체되므로 상주 메모리가 상수(`memoryMB: 256` 보호) |

정합성 상 **무효화 지점은 없다**(Jira 이슈가 원본이고 앱이 쓰기를 하지 않는 읽기 전용 집계 — TTL 만료가 유일한 갱신 경로).

### 효과

- 한 요청 안에서 두 통계를 모두 쓰는 `getChartData`(전체 차트) 경로: 검색 **2×N → N회**.
- 위젯별 invoke 경로: 같은 인스턴스로 라우팅되면 두 번째 위젯이 검색 **N회 → 0회**. 라우팅이 갈리면 종전과 동일(무회귀).
- 프론트 구조(위젯별 invoke)는 **손대지 않았다**.

---

## A-7. 마스터 사전 무캐시 KVS 스캔 (감사 6종 중 **5종 적용**, settings 제외)

### 무엇을 했나

`backoffice/team/TeamTreeCache.getTeamIndex` 와 **동형**인 60초 모듈 캐시를 공용 모듈로 뽑아 적용했다.
rev1 은 6종 전부에 붙였으나 rev2 에서 `settings` 를 철회해 **최종 5종**이다(R3).

- **신규**: `src/resolver/backoffice/DictionaryCache.js`
  - `readDictionary(name, loader)` / `invalidateDictionary(name)` / `invalidateAllDictionaries()`
  - TTL **60초**(getTeamIndex 관례 그대로).
  - **값이 아니라 Promise 를 담는다** — 한 요청에서 같은 사전을 `Promise.all` 로 동시에 읽는 곳이 여럿이라(`buildPeopleContext` + `getResourceProfile` 의 role 2회 등) 값만 담으면 동시 진입이 전부 miss 한다. loader 실패는 캐시하지 않는다.
  - **한계를 파일 상단 주석에 명시**: Forge 는 인스턴스가 여러 개라 **캐시도 invalidate 도 호출된 인스턴스에만 적용된다** → 백오피스에서 사전을 고쳐도 다른 인스턴스는 TTL(60초)이 지나야 새 값을 본다.
  - 캐시 값은 호출 간 공유되므로 **각 서비스가 호출마다 얕은 복사**해 반환한다(소비자 변형에 의한 캐시 오염 차단. 특히 `LevelController.gateLevelBands` 가 응답을 가공한다).

(rev3: 아래 "읽기" 는 **서버 내부 소비자 경로**다. 같은 이름의 백오피스 CRUD resolver 는 fresh 로 갈렸다 — 「수정 이력 R3/F-2」)

| 서비스 | 읽기(캐시 적용) | 상한 규약 |
|---|---|---|
| `getRoleListService` | `RoleService.js:51` | `findAll()` **유지**(100건 캡 그대로) |
| `getLevelListService` | `LevelService.js:110` | `findAll()` 유지 |
| `getSkillListService` | `SkillService.js:75` | `findAllPaged('name',100,CATALOG_MAX_ITEMS)` 유지(bulk 경로와 같은 상수) |
| `getProjectStatusListService` | `ProjectStatusService.js:95` | `findAll()` 유지 |
| `getPublicHolidayListService` | `PublicHolidayService.js:49` | `findByField('by-date')` 유지 (B-12 는 별건이라 손대지 않음) |
| ~~`getSettingDataService`~~ | **캐시하지 않음(rev2 철회)** | 급여 fail-close 경계 위반 — 「수정 이력 R3」 참조 |

> `getProjectStatusExistLinkService`(칸반 전용, `findByFilterExists`)는 감사 표에 없어 캐시하지 않았다.
> `permission` 사전은 감사 표의 6종에 없고 권한 판정 축이라 이번 범위에서 제외했다.
> `settings` 는 rev2 에서 제외돼 **최종 적용은 5종**이다.

### 무효화 지점 (쓰기 경로 grep 전수)

(rev2: `settings` 행 제외 — 캐시 자체를 철회했다)

| 사전 | 무효화 위치 |
|---|---|
| role | `RoleService.js:25`(addRole) · `:88`(delete) · `:109`(update) · `:126`(addRoleBulk) |
| level | `LevelService.js:74`(addLevel) · `:154`(delete) · `:177`(update) · `:193`(addLevelBulk) |
| skill | `SkillService.js:45`(addSkill) · `:114`(delete) · `:135`(update) · `:158`(addSkillBulk) |
| status | `ProjectStatusService.js:24`(addProjectStatus) · `:63`(칸반 add) · `:68`(칸반 add 링크실패 롤백 delete) · `:171`(delete-isolated) · `:211`(delete 본체) · `:260`(update) · `:374`(`saveStatusOrder` — 순서 재정의도 status write. `setStatusLink`·`deleteProjectStatus` 가 이 경로로 들어온다) |
| holiday | `PublicHolidayService.js:27`(add) · `:77`(delete) · `:91`(update) |
| status (시드) | `SeedData.js:27` `runSeed()` 말미 `invalidateAllDictionaries()` — `ensureSeed()` 가 `userPermissionCheckService` 를 통해 **resolver 인스턴스 안에서** 돌 수 있어 필요하다 |

- `addRoleBulk/addLevelBulk/addSkillBulk` 는 `addCatalogItemsBulk` 를 **await 한 뒤** 무효화하도록 async 로 바꿨다(반환값 shape 불변: `{data:{added, skipped}}`).
- **쓰기 검증 경로는 캐시를 타지 않는다** — 이름 중복 판정(`checkDuplicated`)·`findById`·`updateSetting` 의 `prev` 읽기는 전부 KVS 직접 조회 그대로다(`loadTeamIndexFresh` 규약과 동형). stale 인덱스로 중복 판정을 하지 않는다.
- `src/trigger/demoSeed.js`(웹트리거)는 role/level/status 를 쓰지만 **resolver 와 다른 Forge 함수 = 다른 모듈 인스턴스**라 그 인스턴스의 캐시를 지워도 의미가 없다(시연용 도구이기도 하다). 무효화를 추가하지 않았고, 그 경로 이후 최대 60초 stale 은 TTL 로 자연 해소된다.

### 수용한 한계 (명시)

1. **인스턴스별 캐시** — 백오피스에서 역할/등급/스킬/상태/공휴일을 고치면 **다른 인스턴스는 최대 60초** 옛 값을 본다. 고친 관리자 본인의 화면은 (같은 인스턴스로 라우팅될 때) 즉시 반영되지만 보장은 아니다. `TeamTreeCache` 가 이미 같은 계약이다.
2. ~~`settings.salaryPolicy` 60초 stale 수용~~ — **rev2 에서 철회.** 늦게 닫히는 방향(급여 노출 지속)이라 권한의 stale(늦게 열리는 방향)과 성질이 다르다. 「수정 이력 R3」 참조.

### 효과 (감사 산정 기준)

- `/backoffice/users` 진입: role 3 + level 3 → **각 1회**(같은 요청 내 동시 호출까지 Promise 공유로 흡수).
- `/resource` 인력현황 진입: role/level/skill 중복 스캔 제거(settings 는 제외 — `findById` 1건이라 애초에 가장 싼 축).
- 프로젝트 대시보드: level/role 위젯 `W` 개 → `findAll` **W회 → 1회**(60초 내).

---

## 테스트

```
npm test  (root, jest)
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
```

첫 실행에서 `SettingService.test.js` · `SalaryPolicySetting.test.js` 2건이 실패했다 —
두 파일은 **write 없이 KVS mock 반환값만 바꿔 가며** `getSettingDataService()` 를 반복 호출해서,
케이스 간에 캐시가 남으면 앞 케이스 값이 나온다. 캐시의 정상 동작이 드러난 것이므로 서비스가 아니라
테스트에 `beforeEach` 리셋(`invalidateAllDictionaries()`)을 넣어 해소했다
(`SalaryPolicySetting.test.js:19,25` · `SettingService.test.js:17,24`).

## 변경 파일

**신규**
- `src/api/jira/issue/ProjectParticipantFetcher.js`
- `src/resolver/backoffice/DictionaryCache.js`

**수정**
- `src/api/jira/issue/IssueApi.js`
- `src/resolver/projectIssue/ProjectUsersService.js`
- `src/resolver/projectDashboard/ProjectDashboardService.js`
- `src/resolver/backoffice/role/RoleService.js`
- `src/resolver/backoffice/level/LevelService.js`
- `src/resolver/backoffice/skill/SkillService.js`
- `src/resolver/backoffice/projectStatus/ProjectStatusService.js`
- `src/resolver/backoffice/publicHoliday/PublicHolidayService.js`
- `src/resolver/backoffice/setting/SettingService.js`
- `src/seed/SeedData.js`
- `src/resolver/backoffice/setting/__test__/SettingService.test.js` (캐시 리셋)
- `src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js` (캐시 리셋)

resolver 신규 등록 없음 → `PermissionMap.js` · `CONTROLLER_REGISTRARS` 변경 없음.
KVS 신규 속성 없음 → `manifest.yml` 변경 없음.

---

# 수정 이력 (rev2) — Codex 상위 모델 리뷰 반영

## R1. A-3 캐시가 in-flight 를 잡지 못했다 (핵심 목표 미달)

- **지적**: 완료된 `records` 만 캐시해서, 두 위젯이 **동시에** invoke 되는 표준 첫 진입에서는 둘 다 miss →
  각자 전량 스캔. 목표한 2N → N 이 정작 첫 진입에서 달성되지 않았다.
- **수정**: `ProjectParticipantFetcher.js:99-118` — **값이 아니라 Promise 를 담는다**(A-7 `DictionaryCache` 와 같은 패턴).
  loader 실패 시 엔트리를 되돌려 실패를 TTL 동안 재생하지 않는다.
- **효과**: 동시 진입 첫 렌더에서도 검색이 **1벌만** 나간다(1,000이슈 = 20회 → 10회).

## R2. A-3 무효화 누락 — coworker/assignee write

- **지적**: `updateIssueCoworkersService` 가 참여자 통계 캐시를 비우지 않아, 협업자를 저장해도 최대 60초 옛 참여자 수가 보인다.
- **수정**(coworker 쓰기 경로 grep 전수 — `coworkers:` write 는 2곳뿐):

| 무효화 지점 | 무엇을 쓰나 |
|---|---|
| `src/resolver/projectIssue/ProjectUsersService.js:410` | `updateIssueCoworkersService` — coworker 프로퍼티 merge |
| `src/resolver/workAssignment/WorkAssignmentWriter.js:96-98` | `assignIssueApi`(담당자) + `mergeIssueProperty`(협업자). **담당자도 참여자 통계의 입력**이라 둘 중 하나만 바뀌어도 무효화한다 |

  `AssignedDateRecorder`·구독 편입 경로는 `assignedAt` 계열만 쓰고 coworkers 를 바꾸지 않아 대상이 아니다.
  무효화가 **호출된 인스턴스에만 적용된다**는 점은 두 호출부 주석과 페처 헤더에 명시했다.
- **수용한 한계(판단 기록)**: 권한이 회수된 사용자에게 캐시 유효 구간(≤60초) 동안 집계가 나갈 수 있다.
  개별 이슈 내용이 아니라 **담당자별 건수 / 이슈별 참여자 수라는 집계 통계**이고 TTL 이 짧아 수용한다.
  (원본 검색은 여전히 `as:'user'` 이고 캐시 키가 사용자별이라 **남의 가시 범위가 섞이지는 않는다**.)
  이 판단을 `ProjectParticipantFetcher.js` 헤더 「stale 의 수용 범위」에 남겼다.

## R3. A-7 `settings` 캐시가 급여 fail-close 를 깼다 (가장 중요) — **철회**

- **지적**: 다른 인스턴스가 INDIVIDUAL 을 캐싱한 60초 동안, 관리자가 LEVEL_BAND 로 전환한 **뒤에도**
  개인 급여가 계속 나갈 수 있다. RFC-163 의 fail-close 경계를 시간 축으로 뚫는다.
  rev1 은 이것을 "권한 판정 90초 stale 과 같은 급"으로 봤으나, **권한은 늦게 열리는 방향(닫힘→열림 지연)이고
  이쪽은 늦게 닫히는 방향(노출 지속)이라 방향이 반대다.** 지적이 옳다.
- **수정**: `settings` 를 캐시 대상에서 **제외**했다. 사전 캐시는 **role/level/skill/status/holiday 5종**만 적용한다.
  - `SettingService.js` — `readDictionary`/`invalidateDictionary` 제거, 원래 구현으로 복귀.
    같은 자리에 **다시 넣지 말라는 이유**를 주석으로 남겼다(`:9-17`).
  - `DictionaryCache.js:1-9` — 헤더에 `settings` 제외 사유 명시.
  - `SeedData.js:17-18,27` — 주석을 "status 를 썼다"로 정정(무효화 호출 자체는 status 때문에 유지).
  - 테스트 리셋 정리: `SettingService.test.js` · `SalaryPolicySetting.test.js` 의 `invalidateAllDictionaries()`
    `beforeEach` 를 **제거**(캐시가 없어져 불필요) → 두 파일은 **원본과 diff 0**.
- 비용 관점 손실은 작다: `settings` 는 다른 사전과 달리 `findAll` 전량 스캔이 아니라 **`findById` 1건 read** 다.

## rev2 테스트

```
npm test  (root, jest)
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
```

## rev2 변경 파일

- `src/api/jira/issue/ProjectParticipantFetcher.js` — Promise 캐시 + stale 수용 범위 주석
- `src/resolver/projectIssue/ProjectUsersService.js` — import + `:410` 무효화
- `src/resolver/workAssignment/WorkAssignmentWriter.js` — import + `:96-98` 무효화
- `src/resolver/backoffice/setting/SettingService.js` — 캐시 철회(+ 재도입 금지 주석)
- `src/resolver/backoffice/DictionaryCache.js` — 헤더에 settings 제외 사유
- `src/seed/SeedData.js` — 주석 정정
- `src/resolver/backoffice/setting/__test__/SettingService.test.js` · `SalaryPolicySetting.test.js` — 리셋 제거(원복)

---

# 수정 이력 (rev3) — 통합 검증 F-2 · O-1 반영

## F-2. A-7 캐시가 백오피스 CRUD 목록까지 덮었다 → fresh / 캐시 **분리**

- **지적**: RolePage 등이 저장 직후 목록을 재조회할 때 다른 인스턴스로 라우팅되면 **방금 저장한 항목이 목록에 없고**,
  다시 저장하면 중복 검증(`checkDuplicated`, KVS 직접 조회)에 걸려 **"목록엔 없는데 저장은 거부"** 가 재현된다.
  `findAll` 100건 하드캡 때 밟았던 것과 같은 부류다.
- **결정적 선례**: 내가 참조한 `TeamTreeCache.js:88-90` 이 **정확히 이 경로를 배제**하며 사유를
  "read-after-write 가 깨지기 때문(F3)"으로 적어 뒀다. 캐시를 가져오면서 그 분리를 같이 가져오지 않은 것이 누락이다.
- **수정**: 5종 사전 전부에 **fresh 변형**을 추가하고 **백오피스 CRUD 화면 목록 resolver 만** 그쪽으로 돌렸다.
  `loadXxxList()`(원 로더)를 공유하므로 **응답 shape 은 두 경로가 완전히 동일**하다.

| resolver / 소비자 | 경로 | 함수 |
|---|---|---|
| `getRoleList` (RolePage) | **fresh** | `RoleService.js:71` `getRoleListFreshService` ← `RoleController.js:17` |
| `getLevelList` (LevelPage·급여밴드) | **fresh** | `LevelService.js:128` `getLevelListFreshService` ← `LevelController.js:39` (`gateLevelBands` 그대로 적용) |
| `getSkillList` (SkillPage) | **fresh** | `SkillService.js:94` `getSkillListFreshService` ← `SkillController.js:17` |
| `getProjectStatusList` (ProjectStatusPage) | **fresh** | `ProjectStatusService.js:112` `getProjectStatusListFreshService` ← `ProjectStatusController.js:20` |
| `getPublicHolidayList` (PublicHolidayPage) | **fresh** | `PublicHolidayService.js:64` `getPublicHolidayListFreshService` ← `PublicHolidayController.js:16` |
| `getProjectStatusExistLink` (칸반) | fresh(무변경) | 애초에 캐시 대상이 아니었다 |
| `UserService.roleLevelMap`(사용자 목록·메타) | **캐시** | `getRoleListService` / `getLevelListService` |
| `TeamService` · `ProjectTeamService`(후보/멤버 표시) | **캐시** | `getRoleListService` / `getLevelListService` |
| `ResourceManagementService.buildPeopleContext` · `getResourceProfile` · 배정 그래프 | **캐시** | role / level / skill / status |
| `PortfolioDashboardService` · `PortfolioAggregator` | **캐시** | role / level / status / holiday |
| `ProjectDashboardService` level·role 위젯 | **캐시** | `getLevelListService` / `getRoleListService` |
| `AssignmentProjectService`(작업배정 후보) | **캐시** | status / skill |
| `ProjectCostService` · `ProjectProgressService` · `IssueAnalysisService` · `ResourceAnalysisService` | **캐시** | holiday |
| `MyTeamAnalysisService` · `SalaryPolicyContext`(밴드) | **캐시** | role / level |

- **효과 재산정(정직하게)**: fresh 로 되돌린 만큼 이득이 줄었다. `/backoffice/users` 진입의 role 3회는
  **1(fresh, 프론트 `getRoleList`) + 1(캐시, `roleLevelMap` ×2 흡수) = 2회**다(3 → 2). level 도 같다.
  `/resource`·대시보드·포트폴리오·비용/진척도처럼 **서버 내부에서 반복 읽는** 경로는 감소폭이 그대로다
  (그쪽이 애초에 A-7 비용의 대부분이었다).
- **`getSkillList` 트레이드오프 기록**: 이 resolver 는 SkillPage 뿐 아니라 `/resource` 의 `SkillMultiSelect`
  도 호출한다. resolver 가 하나라 **정확성(read-after-write) 쪽을 택해 fresh** 로 뒀다 —
  프론트발 호출은 캐시 이득을 잃지만 서버 내부(`buildPeopleContext`)의 스킬 조회는 캐시를 유지한다.

## O-1. 이슈 편입/해제도 참여자 통계의 입력이다

- **지적**: `updateProjectIdFieldService` / `deleteProjectIssueService` 는 이슈의 앱 projectId 를 지정·해제해
  **참여자 통계의 모집단 자체**를 바꾸는데 캐시 무효화가 없었다.
- **수정**(R2 와 동일 처리):
  - `src/resolver/projectIssue/ProjectUsersService.js:285-287` — `updateProjectIdFieldService`
  - `src/resolver/projectIssue/ProjectUsersService.js:298-299` — `deleteProjectIssueService`
- 무효화가 **호출된 인스턴스 한정**이라는 점은 R2 와 같게 주석에 명시했다.

## rev3 테스트

```
npm test  (root, jest)
Test Suites: 70 passed, 70 total
Tests:       1110 passed, 1110 total
```

## rev3 변경 파일

- `src/resolver/backoffice/role/RoleService.js` · `RoleController.js`
- `src/resolver/backoffice/level/LevelService.js` · `LevelController.js`
- `src/resolver/backoffice/skill/SkillService.js` · `SkillController.js`
- `src/resolver/backoffice/projectStatus/ProjectStatusService.js` · `ProjectStatusController.js`
- `src/resolver/backoffice/publicHoliday/PublicHolidayService.js` · `PublicHolidayController.js`
- `src/resolver/projectIssue/ProjectUsersService.js`

resolver 이름·개수 변경 없음(핸들러가 부르는 서비스 함수만 교체) → `PermissionMap.js` · `CONTROLLER_REGISTRARS` 무변경.
