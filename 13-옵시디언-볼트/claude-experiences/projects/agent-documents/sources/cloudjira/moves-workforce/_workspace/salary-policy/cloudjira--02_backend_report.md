# 급여 정책 (Salary Policy) — 백엔드 구현 리포트 · **RFC-163 Phase A (P0+P1)**

작성: backend-engineer / 2026-08-03
설계서: `_workspace/salary-policy/01_architect_design.md` (r3)
작업 위치: `C:\CloudJira\moves-workforce-rfc-163` (worktree, 브랜치 `RFC-163`, base `ea5ef4a`)

> 🔴 **frontend-engineer 는 §2 의 응답 shape 을 단일 진실로 삼으라.**
> 설계서 §6 과 **다르게 구현한 5곳**은 §3 에 이유와 함께 전부 명시했다. 설계서보다 이 문서가 우선한다.

---

## 0. 요약

| 항목 | 결과 |
|------|------|
| 범위 | §11 Phase A **P0 + P1 전부** (A1~A19 + A20~A24). **P2 미착수** |
| 신규 resolver | **0개** — 전부 기존 resolver 확장. 따라서 `src/index.js` **무변경**(신규 컨트롤러 없음) |
| `npm test` | **62 suites / 994 tests, 전부 통과** (baseline 56 / 860 → +6 suites / +134 tests, **실패 0**) |
| `EffectiveSalary.test.js` | ✅ **한 글자도 수정하지 않고 통과** (`git status` 클린 — §4 증빙) |
| baseline 대비 신규 실패 | **0건.** baseline 자체도 실패 0건이었다 |
| 미구현/보류 | 없음. 단 §5 에 배포·검증 필수 항목 4건 기록 |

---

## 1. 구현 파일 목록

### 신규 (3 + 테스트 5)

| 파일 | 역할 |
|------|------|
| `src/resolver/projectCost/SalaryPolicy.js` | **순수 모듈.** 정책 정규화·밴드 맵·대표값 해석·밴드 DTO·검증. Forge import **0개** |
| `src/resolver/projectCost/SalaryPolicyContext.js` | 정책 컨텍스트 로더(**계산 경로** — 실패 시 예외 전파) |
| `src/permission/SalaryVisibility.js` | 표시 게이팅 판정 단일 출처(**표시 경로** — 실패 시 숨김 폴백) |
| `src/resolver/projectCost/__test__/SalaryPolicy.test.js` | 순수 함수 + LEVEL_BAND 환산 (46 tests) |
| `src/resolver/__test__/SalaryPolicyLeak.test.js` | **누출 회귀 주 방어선** — 8지점 × 양방향 (25 tests) |
| `src/resolver/portfolioDashboard/__test__/PortfolioAggregatorSalaryPolicy.test.js` | A10 성능 계약 + A22 스냅샷 정책 (5 tests) |
| `src/resolver/backoffice/level/__test__/LevelSalaryBand.test.js` | 밴드 CRUD + KVS 규약 (15 tests) |
| `src/resolver/backoffice/setting/__test__/SalaryPolicySetting.test.js` | 정책 기본값·검증 + **manifest attribute 계약** (17 tests) |
| `src/rdb/query/__test__/PortfolioSnapshotSalaryPolicy.test.js` | UPSERT 3곳·SELECT·멱등 ALTER·migrate enqueue 계약 (10 tests) |

### 수정 (17 + 기존 테스트 2)

`manifest.yml` · `src/permission/PermissionMap.js` · `src/utils/errors/ErrorCodes.js` ·
`src/rdb/query/PortfolioSnapshotQuery.js` · `src/rdb/schema/ddl/{index.js, portfolioSnapshot.sql.js}` · `src/rdb/schema/migrate.js` ·
`src/resolver/backoffice/setting/{SettingDefaults.js, SettingService.js}` · `src/resolver/backoffice/level/LevelService.js` ·
`src/resolver/backoffice/user/{UserService.js, UserController.js}` ·
`src/resolver/portfolioDashboard/{PortfolioAggregator.js, PortfolioDashboardService.js, PortfolioSnapshotRepository.js}` ·
`src/resolver/projectCost/{EffectiveSalary.js, ProjectCostService.js}` ·
`src/resolver/projectDashboard/ProjectDashboardService.js` · `src/resolver/projectIssue/ProjectUsersService.js`

기존 테스트 2건 수정(§3-5 에 이유 명시): `PortfolioCostGate.test.js`, `SalaryChartGate.test.js`.

---

## 2. 경계면 계약 — **실제 응답 shape** (글자 그대로)

> `responseWrapper` 가 서비스 반환을 `{success:true, ...result}` 로 **루트에 spread** 한다.
> 아래는 프론트가 `invoke()` 로 받는 최종 형태다.

### 2-1. 설정 / 등급

#### `getSettingData` — 필드 1 추가
```js
{ success:true,
  currency, hourRate, utilizationUnderBand, utilizationOverBand, utilizationRedBand,
  scopeTodoAmberRatio, scopeTodoRedRatio, progressThreshold,
  salaryPolicy: 'INDIVIDUAL' | 'LEVEL_BAND'      // ★ 항상 존재. 기존 설치도 자동 INDIVIDUAL
}
```
- `DEFAULT_SETTINGS.salaryPolicy = 'INDIVIDUAL'` + `getSettingDataService` 의 `{...DEFAULT_SETTINGS, ...saved}` 병합으로 **KVS 백필 불필요**.
- 권한 `'PUBLIC'` (무변경).

#### `updateSetting` — 입력 1 추가
```js
// 입력: { salaryPolicy?: 'INDIVIDUAL'|'LEVEL_BAND', ...기존 필드 }   (미전달 필드는 미변경)
{ success:true, content:{ settings:{ ...전체 settings, salaryPolicy } } }
```
- 도메인 밖 값 → `{success:false, error:{ code:'SETTING_SALARY_POLICY_INVALID', ... }}`. **`findById` 조차 하지 않고 저장 전에 거부**한다.

#### `getLevelList` — 필드 3 추가
```js
{ success:true,
  data:[ { id, name, description,
           salaryMin: number|null, salaryMax: number|null, salaryRepresentative: number|null } ] }
```
- **미설정은 반드시 `null`** — `undefined` 를 내려보내지 않는다(프론트가 undefined 분기를 하지 않게).
- 권한 OR-grant 에 `['SETTINGS','read']` **추가됨**(A16) → `SETTINGS read` 만 가진 세트도 조회 가능.

#### `findLevelById` — 필드 3 추가
```js
{ success:true,
  data:{ id,
         levelData:{ name, description,
                     salaryMin: number|null, salaryMax: number|null, salaryRepresentative: number|null } } }
```

#### `addLevel` / `updateLevel` — 입력 3 추가
```js
// addLevel 입력   : { name, description, salaryMin?, salaryMax?, salaryRepresentative? }
// addLevel 응답   : { success:true, data:{ id, LevelData } }
// updateLevel 입력: { id, name, description, isNameChanged, salaryMin?, salaryMax?, salaryRepresentative? }
// updateLevel 응답: { success:true, data:{ id, data } }
```
**밴드 입력 규약 (프론트가 지킬 것):**
- 미입력은 **`''` 또는 `null` 로 보내면 된다.** 서버가 `toBandAttribute()` 로 정규화해 **KVS 속성 자체를 생략**한다.
- `kvs.entity().set()` 은 전체 치환이므로 **빈 값 전송이 곧 밴드 해제**다. 별도 삭제 API 없음.
- 소수는 서버가 `Math.round` 한다(manifest `integer`).
- **`salaryRepresentative` 미전달 + min/max 둘 다 유효 → 서버가 `round((min+max)/2)` 로 채워 저장한다.**
  (UI 자동채움이 없어도 대표값이 생긴다. UI 는 "비어 있을 때만 자동채움" 규칙을 그대로 두면 된다.)
- `min > max` 또는 음수 → `{success:false, error:{code:'LEVEL_SALARY_BAND_INVALID'}}`, **저장 안 함**.
- 대표값이 `[min,max]` 범위 밖이어도 **허용**한다(경고는 프론트 몫).

> ⚠ `addLevel` 응답의 `data.LevelData` 는 **실제 저장된 정규화 결과**다(입력 에코가 아니다). 키 이름은 기존 그대로.

#### 신규 에러 코드 (`src/utils/errors/ErrorCodes.js`)
`SETTING_SALARY_POLICY_INVALID` · `LEVEL_SALARY_BAND_INVALID` · `SALARY_POLICY_LEVEL_BAND`

---

### 2-2. 사용자

#### `getUserListWithPaging`
```js
// INDIVIDUAL
{ success:true,
  salaryPolicy:'INDIVIDUAL',
  content:[ { userId, userName, userAvatarUrls,
              roleKey, roleName, levelKey, levelName, permissionKey, permissionName,
              teamKey, teamName,
              salary: number|null,                       // ← 개인 연봉
              createdAt } ],
  page:{ totalDataCnt, totalPages, isLastPage, isFirstPage, requestPage, requestSize } }

// LEVEL_BAND
{ success:true,
  salaryPolicy:'LEVEL_BAND',
  content:[ { userId, userName, userAvatarUrls,
              roleKey, roleName, levelKey, levelName, permissionKey, permissionName,
              teamKey, teamName,
              levelBand: { min:number|null, max:number|null } | null,   // ← salary 키 자체가 없다
              createdAt } ],
  page:{ ...동일 } }
```
> ⚠ `levelBand` 는 **`{min,max}` 2필드뿐**이다(대표값은 목록에 싣지 않는다 — 역산 방지).
> ⚠ `salary` **키의 부재 자체가 "정책상 제공 안 됨"의 신호**다. `row.salary ?? 0` 을 쓰면 "연봉 0원" 거짓이 된다.
> ⚠ 밴드가 없는 등급/등급 미지정 → `levelBand: null` (0 이 아니다).

#### `findUserByAccountId`
```js
// INDIVIDUAL
{ success:true, salaryPolicy:'INDIVIDUAL',
  userId, userName, userAvatarUrls,
  creatorId, creatorName, creatorAvatarUrls, updaterId, updaterName, updaterAvatarUrls,
  createdAt, updatedAt,
  salary: number|null,
  roleKey, levelKey, permissionKey, teamKey, teamName }

// LEVEL_BAND
{ success:true, salaryPolicy:'LEVEL_BAND',
  ...동일,
  levelBand: { min:number|null, max:number|null } | null,   // salary 키 없음
  roleKey, levelKey, permissionKey, teamKey, teamName }
```
> `grantedBy==='TEAM_LEAD'` 마스킹은 **존재하는 키만** `null` 로 바꾼다 — LEVEL_BAND 에서 `salary:null` 이 되살아나지 않는다.

#### `getUserInfo`
```js
// INDIVIDUAL : { success:true, rows:[ { ...users 전 컬럼(salary 포함) } ], rowsAffected }
// LEVEL_BAND : { success:true, rows:[ { ...salary 키만 제거 } ],          rowsAffected }
```
> 게이팅은 **`UserController.js` 정의부**에서 한다. `getUserInfoService` 는 **무변경**이다
> (`PrincipalResolver.js:209,:235` 가 권한 판정마다 호출 → 서비스에 KVS 를 넣으면 안 된다).

#### `downloadExcel`
```js
{ success:true, filename, fileBase64, total }   // shape 동일
```
- LEVEL_BAND 에서 시트의 **`Salary` 컬럼 자체가 없다**(빈칸이 아니라 컬럼 제외). 나머지 컬럼 순서·이름 불변.

#### `updateUser`
```js
// INDIVIDUAL : { success:true, content:{ droppedFields:[] } }
// LEVEL_BAND : { success:true, content:{ droppedFields:['salary'] } }   ← salary 를 실제로 보냈을 때만
//              salary 미전송이면 { content:{ droppedFields:[] } }
```
- LEVEL_BAND 에서 `salary` 는 **키째 제거(`undefined`)** 되어 서비스로 간다 → DB 의 기존 연봉이 **보존**된다(D3 되돌리기).

#### `addUser`
- 응답 shape **무변경**. LEVEL_BAND 에서는 `formData.salary` 를 **저장하지 않는다**(INSERT 라 `null`).

#### `uploadUsersExcelWithQueue`
- **완전 무변경.** 파서는 `Email` 컬럼만 읽는다(§5-4). 계약 테스트가 `headerMap['Salary']` 부재를 못 박고 있다.

---

### 2-3. 프로젝트 급여 / 비용 / 대시보드

#### `getProjectSalaryList`
```js
// INDIVIDUAL
{ success:true,
  rows:[ { project_member_id, account_id, role_key, level_key,
           salary: number,
           salary_type: 'PROJECT'|'ANNUAL',
           annual_salary: number|null,
           effective_salary: number,
           total_count: number } ],
  meta:{ projectMonths:number, salaryPolicy:'INDIVIDUAL', unpricedMemberCount:number } }

// LEVEL_BAND
{ success:true,
  rows:[ { project_member_id, account_id, role_key, level_key,
           level_band: { min:number|null, max:number|null, representative:number|null } | null,
           effective_salary: number,                 // ← 등급 대표값 파생
           total_count: number } ],
  meta:{ projectMonths:number, salaryPolicy:'LEVEL_BAND', unpricedMemberCount:number } }
```
> ⚠ LEVEL_BAND rows 는 **명시 화이트리스트**로 조립된다(`...row` 스프레드 아님) — `salary` / `salary_type` / `annual_salary` 키가 전부 없다.
> ⚠ `level_band` 는 여기서만 **`representative` 를 포함**한다(급여 관리 탭이 대표값 기준임을 보여야 하므로). 사용자 목록의 `levelBand` 와 shape 이 다르다 — **`SalaryCell` 재사용 시 주의.**
> `project_id` 미전달 시: `{ success:true, rows:[], meta:{ projectMonths:0, salaryPolicy, unpricedMemberCount:0 } }`

**`meta.unpricedMemberCount` 판정식 (모드별로 다르다 — 의도적):**
| 모드 | 카운트 대상 |
|---|---|
| INDIVIDUAL | `salary_type==='ANNUAL'` **이면서** 유효급여 0 (= 연봉 미등록) |
| LEVEL_BAND | 유효급여 0 전부 (등급 미지정 / 밴드 미설정 / 대표값 0) |
> INDIVIDUAL 의 `PROJECT` 모드 0원 배정은 **세지 않는다** — 정상적인 0원이지 "가격 미산정"이 아니다.

#### `updateProjectMemberSalary`
```js
// INDIVIDUAL : { success:true, rows?, affectedRows? }   (기존)
// LEVEL_BAND : { success:false, error:{ name, code:'SALARY_POLICY_LEVEL_BAND', message, cause } }
```
- 거부 시 **DB 를 건드리지 않는다**(`updateSalaryByKeyRepository` 미호출).

#### `getProjectCostSummary` — 순수 추가 2필드
```js
{ success:true,
  currency, project:{startDate,endDate,memberCount}, rates, budget, evm,
  monthlyCost, plannedBudgetLine, byRole, byLevel, byTeam, byIssue,
  salaryPolicy: 'INDIVIDUAL'|'LEVEL_BAND',        // ★ 항상 존재
  unpricedMemberCount: number | null }            // ★ 항상 존재. ⚠ null 주의 ↓
```
- **필드 제거 없음.** LEVEL_BAND 에서도 shape 은 동일하고 **숫자만 대표값 파생**이 된다.
- ⚠ **`unpricedMemberCount` 가 `null` 인 경우가 있다**: 배포 직후 최대 10분간 살아 있는 **레거시 캐시**에는 이 값이 없다. `?? 0` 으로 채우면 "가격 미산정 0명"이라는 거짓이 되므로 서버가 `null`(= 집계 전)을 싣는다.
  → 프론트는 **`count > 0` 일 때만 경고**를 띄우면 된다(`null`/`0` 둘 다 미표시). 설계서는 `number` 라고 적었으나 실제는 `number|null` 이다.
- 정책 전환 시 캐시는 **read 시점에 자동 무효화**된다(캐시 `salaryPolicy` ↔ 현재 정책 대조).

#### `getSummaryData`
```js
// INDIVIDUAL : { success:true, project_id, project_name, start_date, end_date, total_member_count, total_salary }
// LEVEL_BAND : { success:true, project_id, project_name, start_date, end_date, total_member_count }
//              ↑ total_salary 키 자체가 없다 (프로젝트 행이 0건일 때도 마찬가지)
```
> 🔧 **r2(F2 수정):** 게이팅 위치가 **`ProjectDashboardController.js` 정의부**로 이동했다. `getSummaryDataService` 는 **무변경**(항상 `total_salary` 포함)이다 — 응답 계약은 위와 동일하며 프론트 영향 0. 상세는 §7 참조.
> **내부 소비자는 2곳이 아니라 3곳**이다 — `ProjectCostService:114` / `ProjectUsersService:170` / **`ProjectProgressService:70`**. 세 곳 모두 `start_date`/`end_date`/`total_member_count` 만 읽으므로 키 제거의 영향은 없다.
> 프론트 `SummaryPanel.jsx` 는 `data.total_salary === undefined` 를 "미제공"으로 판정하고 **KpiTile 을 렌더하지 않아야** 한다(`formatNumber(undefined)` 를 그리면 빈 타일이 남는다).

#### `getChartDataById` / `getChartData` — `data_type:'salary'`
```js
// LEVEL_BAND (권한은 있음)
{ success:true, dashboard_id,
  chartData:{ denied:true, reason:'SALARY_POLICY_LEVEL_BAND',
              histogram:[], summary:null, labels:[], datasets:[] } }

// 권한 없음 (기존, 무변경)
{ ... chartData:{ denied:true, reason:'PROJECT_COST_REQUIRED', histogram:[], summary:null, labels:[], datasets:[] } }
```
- **판정 순서: 권한 → 정책.** 둘 다 걸리면 `PROJECT_COST_REQUIRED` 가 이긴다.
- `getSalaryRepository` **미호출**.
- `data_type !== 'salary'` 위젯은 정책을 **조회조차 하지 않는다**(KVS 왕복 미추가).

#### `getPortfolioDashboard` — 순수 추가 2필드 + A안 마스킹
```js
{ success:true,
  lastAggregatedAt, aggregateStatus, projects, roleMeta, levelMeta, teamMeta, memberTeamMap,
  ...(costMasked ? {} : { salaryBuckets }),
  costMasked: boolean,
  costMaskedReason: 'NONE' | 'PERMISSION' | 'SNAPSHOT_STALE_POLICY',   // ★ 항상 존재
  salaryPolicy: 'INDIVIDUAL' | 'LEVEL_BAND',                           // ★ 항상 존재
  utilization, utilizationBands, scopeBands, problemIssues }
```
- `emptyShape()`(`aggregateStatus:'EMPTY'`)에도 **두 필드가 있다** → 루트 키 parity 유지.
- **A안 마스킹:** 스냅샷 `salary_policy` 가 현재 정책과 하나라도 다르면 `costMasked:true` + `costMaskedReason:'SNAPSHOT_STALE_POLICY'` → 기존 `stripMemberCost` 경로가 발동해 `members[].salary` / `totalSalary` / `salaryBuckets` 가 전부 사라진다. **프론트 게이팅 코드는 무수정으로 동작한다.**
- `salary_policy IS NULL`(정책 도입 이전 스냅샷)은 `INDIVIDUAL` 로 접힌다 → INDIVIDUAL 운영 중에는 **마스킹이 발동하지 않는다(현행 동작 불변)**, LEVEL_BAND 로 전환하는 순간 자동으로 가려진다.
- **권한 축이 정책 축보다 먼저 판정된다** — 둘 다 걸리면 `'PERMISSION'`.

---

## 3. 설계서와 다르게 구현한 부분 (5건) — **추측으로 덮지 않았다**

| # | 설계서 | 실제 구현 | 이유 |
|---|--------|----------|------|
| **D-1** | §4-3 `resolveMemberSalaries` 반환에 `salarySource` 를 **항상** 추가 | **LEVEL_BAND 일 때만** 추가(조건부 스프레드) | 무조건 추가하면 INDIVIDUAL 반환 shape 이 바뀌어 **무회귀 게이트(`EffectiveSalary.test.js:126` `toEqual`)가 깨진다.** 지시상 그 파일은 무수정이 절대 조건이고, §6-4 #2("INDIVIDUAL 응답은 바이트 단위로 동일, 예외는 `salaryPolicy`·`unpricedMemberCount` 뿐")도 `salarySource` 를 예외로 두지 않았다. **조건부가 두 규칙을 모두 만족한다.** `salarySource` 는 어떤 resolver 응답에도 실리지 않으므로(=내부 값) 프론트 영향 0 |
| **D-2** | §5-3 #8/#9 `updateUser`/`addUser` 게이팅을 **UserService** 에 | `updateUser` 는 **UserController**, `addUser` 만 Service | `updateUserService` 에 KVS 조회를 넣으면 서비스 단위 계약 테스트(`UpdateUserMerge.test.js`, 무회귀 자산)가 Forge mock 없이 못 돈다. 또 `getUserInfo` 의 Controller 게이팅 선례(§5-3 ⚠#3)와 일관된다. **`addUser` 는 내부 소비자가 없어 Service 에 두어도 안전** |
| **D-3** | §6-3 `getProjectCostSummary.unpricedMemberCount: number` | **`number \| null`** | 배포 직후 10분간 남는 **레거시 캐시**에 이 값이 없다. `?? 0` 으로 채우면 "가격 미산정 0명" 거짓이 된다(설계서가 `byTeam` 에 대해 기록한 것과 같은 함정). 루트 키는 항상 존재시키되 값만 `null` 로 구분 가능하게 했다 |
| **D-4** | §6-3 `getPortfolioDashboard.salaryPolicy` = **스냅샷 집계 당시 정책** | **현재 정책**(`currentPolicy`) | 스냅샷이 여러 개라 정책이 섞이면 **단일 값을 만들 수 없다**(`'MIXED'` 는 계약 도메인 밖). 불일치가 하나라도 있으면 `costMasked` 로 승격되므로, **마스킹되지 않은 모든 응답에서는 두 정의가 동치**다. 마스킹된 응답에서는 "현재 정책"이 프론트 안내(재집계 유도)에 더 유용하다 |
| **D-5** | `portfolio_snapshot` (설계서 표기) | 실제 테이블명 **`portfolio_project_snapshot`**, 마이그레이션 번호 **`v015`** | 실측. 마지막 enqueue 가 `v014_create_project_team_table` 이었다(설계서는 "v012 뒤, 번호는 구현 시 확인" 이라 지시) |

### 3-5. 기존 테스트 2건을 수정한 이유 (숨기지 않고 명시)

| 파일 | 수정 | 이유 |
|---|---|---|
| `PortfolioCostGate.test.js:102` | `JSON.stringify` 검사 전에 **`salaryPolicy` 루트 키만** 제거 | A18 이 추가한 `salaryPolicy` 는 **정책 모드 문자열**(금액 아님)인데 이름에 'salary' 가 들어간다. **설계서 §6-4 #3 이 이 예외를 명시적으로 지시**했다("그 키를 먼저 제거하고 검사"). 값 자체를 `'INDIVIDUAL'` 로 단언해 검증 강도를 유지했고, 나머지 전 경로는 그대로 검사된다 |
| `SalaryChartGate.test.js` | `SettingService` **mock 추가**(기본 = 정책 미설정) | salary 데이터셋이 이제 정책도 본다. mock 이 없으면 `resolveSalaryPolicySafe` 가 KVS 실패 → **fail-close 로 'LEVEL_BAND'** 를 반환해 권한 축 테스트가 정책 축 때문에 거짓 실패한다. **기존 단언은 한 줄도 약화하지 않았고**, LEVEL_BAND 케이스 3건을 추가했다 |

---

## 4. 무회귀 증빙

### 4-1. `EffectiveSalary.test.js` — **무수정 통과** ✅
```
$ git status --porcelain src/resolver/projectCost/__test__/EffectiveSalary.test.js
(출력 없음 = 변경 없음)

PASS src/resolver/projectCost/__test__/EffectiveSalary.test.js   (29 tests)
```
`computeEffectiveSalary` 의 기존 INDIVIDUAL 5줄은 **물리적으로 한 글자도 바뀌지 않았다.** LEVEL_BAND 분기를 그 앞에 추가만 했다.

**무회귀가 구조로 보장되는 3중 장치 (설계서 §4-2 그대로):**
1. 기본 인자 `policy = 'INDIVIDUAL'` → `{projectMonths}` 만 넘기는 기존 호출부는 분기에 **진입 자체를 못 한다**
2. 입력 필드 분리 → LEVEL_BAND 는 `levelKey`+`levelBands` 만, INDIVIDUAL 은 `salary`/`annualSalary`/`salaryType` 만 읽는다
3. 기존 라인 물리적 무수정

### 4-2. `npm test` 전량
```
Test Suites: 62 passed, 62 total
Tests:       994 passed, 994 total
Time:        ~10 s
```
**baseline**(작업 착수 전, 동일 커맨드): `56 passed / 860 passed`, 실패 0.
→ **baseline 대비 신규 실패 0건.** 증가분은 전부 이번에 추가한 테스트다.

### 4-3. §6-4 7-C — 정책 주입 지점 4곳 전수 확인
```
$ grep -rn "resolveMemberSalaries\|computeEffectiveSalary" src/ --include=*.js | grep -v __test__
```
| 함수 | 지점 | 주입 |
|------|------|------|
| `resolveMemberSalaries` | `ProjectCostService.js:146` (캐시 miss) | ✅ `{ projectMonths, policy, levelBands }` |
| `resolveMemberSalaries` | `ProjectCostService.js:226` (`buildByIssue`, **캐시 hit**) | ✅ `{ projectMonths, policy, levelBands }` |
| `computeEffectiveSalary` 직접 | `ProjectUsersService.js:181` | ✅ `{ projectMonths, policy, levelBands }` |
| `computeEffectiveSalary` 직접 | `PortfolioAggregator.js:314` | ✅ `{ projectMonths, policy, levelBands }` |

### 4-4. 성능 계약 (테스트로 고정)
> 🔧 **r2 정정:** 아래 표의 `ProjectCostService` 캐시 miss "+0" 은 **r1 시점에 사실이 아니었다**(F2). 수정 후 사실이 되었다 — 정정 경위는 §7 참조.

| 경로 | KVS 조회 증가 | 보증 |
|------|--------------|------|
| `PortfolioAggregator.aggregateAllProjects` | **INDIVIDUAL +0 / LEVEL_BAND +1 (배치 전체)** | `PortfolioAggregatorSalaryPolicy.test.js` — 프로젝트 5개여도 `getLevelList` **1회**, `getSettingData` **1회** |
| `ProjectCostService` 캐시 miss | **+0** — `:105` 의 `settings` 재사용 (**r2 에서 실제로 +0 이 됨**. r1 은 `getSummaryDataService` 가 내부에서 정책을 읽어 **+1** 이었다) | `SalaryPolicyLeak.test.js` — "서비스는 정책을 조회하지 않는다" |
| `ProjectCostService` 캐시 hit | +1~2 (정책 대조에 필요. 이 경로는 워크로그·이슈 전량 재페치라 상대 비용 무시 가능) | 코드 |
| `PortfolioDashboardService` | **+0** — 기존 `Promise.all` 의 `settings` 재사용 | 코드 |
| `getUserListWithPaging` | +1 (settings 단건). 밴드 맵은 `roleLevelMap()` 의 `levelMap` **재사용 → +0** | 코드 |
| `findUserByAccountId` | +1. `getLevelList` 는 **LEVEL_BAND 일 때만** | 코드 |
| 대시보드 차트 | salary 위젯이 있을 때만 **루프 밖에서 1회** | `SalaryChartGate.test.js` — role 위젯은 `getSettingData` 미호출 단언 |
| `getUserInfoService` / `PrincipalResolver` | **+0** — 서비스 무변경, 게이팅은 Controller | 코드 |
| `getSummaryDataService` 내부 소비자 **3곳** | **+0** (**r2 에서 수정.** r1 은 3곳 전부 +1 이었다) | `SalaryPolicyLeak.test.js` — `mockGetSettingData` 미호출 단언 |

### 4-5. fail-close 방향 (경로별로 다르다 — 테스트로 고정)
| 경로 | 정책 조회 실패 시 | 검증 |
|------|-----------------|------|
| **표시**(user 목록/상세/엑셀/summary/차트) | `LEVEL_BAND` 폴백 = **숨김** | `SalaryPolicyLeak.test.js` — "getSettingData 가 실패하면 개인 연봉을 내려보내지 않는다" |
| **계산**(ProjectCost / PortfolioAggregator / getProjectSalaryList / updateProjectMemberSalary) | **예외 전파** → `{success:false}` | `loadSalaryPolicyContext` 는 try/catch 없음 |

---

## 5. 배포·후속 단계에서 반드시 확인할 것

1. **⚠ `manifest.yml` 과 코드는 같은 커밋으로 `forge deploy` 하라.** manifest 선언 없이 밴드를 저장하면 KVS 가 **422 semantic error** 를 낸다. **`forge tunnel` 은 스키마를 갱신하지 않는다** — 로컬에서 밴드 저장이 422 면 `forge deploy` 를 한 번 돌렸는지 먼저 확인.
2. **마이그레이션 `v015_alter_portfolio_snapshot_add_salary_policy`** 가 실행돼야 `salary_policy` 컬럼이 생긴다. 멱등(`ADD COLUMN IF NOT EXISTS`)이고 기존 행은 `NULL` 로 남는다(백필 불필요).
3. **정책 전환 후 재집계 전까지** 포트폴리오·팀 분석의 비용축이 통째로 비는 것은 **의도된 동작**(A안의 알려진 대가). `costMaskedReason:'SNAPSHOT_STALE_POLICY'` 문구 분기(B15/A-6)가 프론트에서 반드시 붙어야 사용자가 "권한 없음"과 구분할 수 있다.
4. **롤백 시 manifest attribute 는 제거하지 마라.** 이미 저장된 레코드가 semantic 검증에 걸린다. 코드만 되돌리고 선언은 남긴다.

---

## 6. frontend-engineer 인계 노트 (읽고 시작할 것)

1. **`?? 0` 절대 금지** — `salary` / `total_salary` / `levelBand` / `unpricedMemberCount` 전부. 키 부재·`null` 은 "정책상 제공 안 됨"이지 0이 아니다. `SalaryCell` 이 이 규칙의 **유일한 구현부**여야 한다.
2. **`SalaryCell` 에 들어가는 밴드 shape 이 2종이다** (§2-3 경고 재게시):
   - 사용자 목록/상세 → `levelBand: {min, max}` (**representative 없음**)
   - 급여 관리 탭 → `level_band: {min, max, representative}` (snake_case + representative)
   - 등급 페이지 대표값 열 → 그냥 숫자(`salaryRepresentative`) → `mode="plain"`
   재사용 지점에서 필드명을 각 생산 코드와 **전수 대조**할 것(CLAUDE.md 2026-07-22 교훈).
3. **정책은 `getSettingData.salaryPolicy` 하나가 원천**이다. 각 응답에 실린 `salaryPolicy`(user 목록/상세, `meta.salaryPolicy`, 대시보드 루트)는 **그 응답이 어떤 모드로 만들어졌는지**를 말해주는 것이지 별도 원천이 아니다 — 렌더 분기는 `useSalaryPolicy()` 하나로 통일하되, **응답의 `salaryPolicy` 와 훅의 값이 어긋나면 응답 쪽을 믿어라**(캐시 stale 방어).
4. **i18n 은 아직 0건이다.** 설계서 §9 의 키 전부 + `npm run merge` 는 프론트 단계 몫이다. 서버 에러 코드 3종만 `ErrorCodes.js` 에 추가돼 있다.
5. **`costGating.js` 와 포트폴리오 `?? 0` 10여 지점은 손대지 마라**(§7-6(c)·(d)). A안 판정은 전부 서버에 있고, 그 파일들을 건드리면 단일 출처 원칙이 흩어진다. 프론트 작업은 **B15(문구 분기) 하나뿐**이다.

---

## 7. 개정 이력

### r2 — 2026-08-03 · **F2(성능 결함) 수정 + r1 리포트 오류 정정**

출처: `_workspace/salary-policy/03_verify_report.md` §2 F2 (integration-verifier 지적).

#### 7-1. 무엇이 잘못됐나

r1 은 `getSummaryDataService` **서비스 내부**에서 `resolveSalaryPolicySafe()` 를 호출했다.
`getSettingDataService` 에는 메모이즈가 없으므로, 이 서비스를 부르는 **모든 내부 소비자**에게 KVS 왕복이 추가됐다.

| 내부 소비자 | r1 의 실제 비용 | 비고 |
|---|---|---|
| `ProjectCostService.js:114` | **+1** | `:105` 에서 이미 `settings` 를 읽는데 **또 읽었다** → r1 리포트 §4-4 의 "캐시 miss **+0**" 이 **사실과 달랐다** |
| `ProjectUsersService.js:170` | +1 (`:172` 의 정책 조회와 합쳐 +2~3) | |
| **`ProjectProgressService.js:70`** | +1 | **r1 리포트와 설계서 §11 Phase C 3항이 양쪽 다 놓친 3번째 소비자.** 진척도 페이지는 `total_salary` 를 쓰지도 않으므로 **100% 낭비**였다 |

**동작은 정상이었다**(세 곳 모두 `start_date`/`end_date`/`total_member_count` 만 소비, 전부 `Promise.all` 안). 순수 성능 결함이다.

**근본 원인 — 내가 스스로 세운 원칙을 이 한 곳에서만 어겼다.**
`getUserInfo` 는 `PrincipalResolver` 내부 호출자 때문에 Controller 에서 게이팅했고(§2-2), `updateUser` 도 같은 이유로 Controller 로 올렸다(§3 D-2). `getSummaryData` 는 **내부 소비자가 3곳으로 오히려 더 많은** 동일 상황인데 서비스에 넣었다.
→ 판단 기준을 명문화한다: **"resolver 전용이 아닌 서비스에는 정책 조회를 넣지 않는다. 게이팅은 Controller 정의부."**

#### 7-2. 수정 내용

| 파일 | 변경 |
|---|---|
| `src/resolver/projectDashboard/ProjectDashboardService.js` | `getSummaryDataService` 를 **r1 이전 원형으로 되돌렸다**(항상 `total_salary` 포함, 정책 조회 없음). 재발 방지용 경고 주석에 **내부 소비자 3곳을 파일:라인으로 명시** |
| `src/resolver/projectDashboard/ProjectDashboardController.js` | `getSummaryData` 정의부에서 게이팅 — `canShowIndividualSalary(await resolveSalaryPolicySafe())` 가 false 면 `const {total_salary, ...rest} = res` 로 키 제거 |
| `src/resolver/__test__/SalaryPolicyLeak.test.js` | #10 단언 3건을 **서비스 호출 → 등록된 Controller 핸들러 호출**로 이동. **단언은 약화하지 않았고**, F2 회귀 가드 1건을 **추가**했다(`getSummaryDataService` 호출 시 `getSettingData` **미호출** + 서비스 반환에 `total_salary` 존치) |

**불변으로 유지된 것 (지시대로):**
- `getSummaryData` **응답 계약 무변경** — LEVEL_BAND 에서 `total_salary` 키가 사라지는 동작은 그대로다(§2-3 참조). **프론트 소비 코드 영향 0.**
- `getSummaryDataService` 자체 무변경 → 내부 소비자 3곳은 r1 이전과 동일한 shape 을 본다.
- fail-close 방향 그대로 — 표시 경로이므로 정책 조회 실패 시 `LEVEL_BAND`(숨김) 폴백.
- 게이팅 위치만 옮겼을 뿐 **정책은 바뀌지 않았다.**

#### 7-3. 수정 후 검증

```
Test Suites: 62 passed, 62 total
Tests:       995 passed, 995 total       (r1: 994 → F2 회귀 가드 1건 추가)
```
- **실패 0건.** baseline(56 suites / 860 tests, 실패 0) 대비 신규 실패 **0건** 유지.
- `EffectiveSalary.test.js` — **여전히 무수정 통과**(F2 수정은 이 파일과 무관).
- `static/ui/` **무변경**(frontend-engineer 가 F1 작업 중이라 손대지 않았다).

#### 7-4. r1 리포트에서 정정된 문장

| 위치 | r1 (틀림) | r2 (정정) |
|---|---|---|
| §4-4 성능 표 | `ProjectCostService` 캐시 miss **+0** | r1 시점엔 **+1** 이었다. **r2 수정으로 실제 +0 이 되었다** |
| §2-3 `getSummaryData` 주석 | 내부 소비자 **2곳**(`ProjectCostService`, `ProjectUsersService`) | **3곳** — **`ProjectProgressService:70` 누락** |

> 📌 다음 사람이 같은 함정을 밟지 않도록: `getSummaryDataService` 는 **resolver 4개 경로가 아니라 내부 3곳이 공유하는 공용 조회 함수**다. 여기에 무언가를 추가하기 전에 반드시 `grep -rn "getSummaryDataService" src/` 를 먼저 돌려라.
