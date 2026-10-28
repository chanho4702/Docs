# 급여 정책 (Salary Policy) 설계서 — **RFC-163**

작성: feature-architect / 2026-08-03 · **개정 r3** (A안 확정 반영, §13 개정 이력 참조)
기준 요구사항: `_workspace/salary-policy/00_input/requirement.md`
선행 설계: `_workspace/salary-management/01_architect_design.md` (§2 경계면 계약 = 현행 급여 구조의 단일 진실)
검증 기준 커밋: **`ea5ef4a`** (브랜치 `RFC-163`) — 본 문서의 모든 파일:라인 참조는 이 커밋 실측이다

> 핵심 산출물은 **§6 경계면 계약**이다. backend/frontend/verifier는 이 표를 단일 진실로 삼는다.
> 사용자 확정 결정 **D1~D8**은 전제로만 쓰고 재검토하지 않는다
> (D5 = 투입급여·계산모드 편집 거부 §4-6 · D6 = `getSummaryData` 기존 결함 별건 RFC 분리 §12 #11 ·
>  D7 = 구현 범위 P0+P1 §11 · **D8 = 스냅샷 정책 불일치 시 `costMasked` 승격(A안) §4-7-1**).
> **[정정]** 표시는 요구사항의 전제와 실제 코드가 다른 항목이다 — 추측으로 덮지 않고 실측을 적었다.
>
> ✅ **미확정 사항 없음.** 전 항목이 확정이며 구현 착수 가능하다.

---

## 0. 조사 결과 — 요구사항 전제 정정 (먼저 읽을 것)

설계 착수 전 `src/` 전역 grep + 실파일 확인으로 다음이 요구사항과 다름을 확인했다.
**구현자는 요구사항이 아니라 이 절을 신뢰하라.**

### 0-1. `resolveMemberSalaries` 호출자 전수 조사 결과 — 요구사항의 6곳이 아니라 2곳이다

| 함수 | 실제 호출 지점 | 비고 |
|------|---------------|------|
| `resolveMemberSalaries` | `src/resolver/projectCost/ProjectCostService.js:127` (캐시 miss) | |
| `resolveMemberSalaries` | `src/resolver/projectCost/ProjectCostService.js:195` (`buildByIssue`, 캐시 hit) | **여기가 누락되기 쉽다** |
| `computeEffectiveSalary` (직접) | `src/resolver/projectIssue/ProjectUsersService.js:175` (`getProjectSalaryListService`) | |
| `computeEffectiveSalary` (직접) | `src/resolver/portfolioDashboard/PortfolioAggregator.js:308` (`aggregateOneProject`) | 스냅샷 집계 |
| `computeProjectMonths` (직접) | 위 3파일 + 테스트 | |

**요구사항이 나열한 나머지 4곳은 `EffectiveSalary`를 전혀 호출하지 않는다:**

| 요구사항이 지목한 곳 | 실측 | 이번 설계에서의 처리 |
|---------------------|------|---------------------|
| `ProjectDashboardService` | `EffectiveSalary` 미사용. 대신 **독립 경로 2개**를 가진다: ① `getSummaryData` → SQL `IFNULL(SUM(pu.salary),0) AS total_salary` (`ProjectDashboard.js:10`) ② `getSalaryChartData` → `ProjectUsersQuery.GET_SALARY`(개인 투입급여 원시 리스트)로 히스토그램 | **별도 분기 필요** (§4-5) |
| `MyTeamAnalysisService` | 재무 축 자체가 없다(`MyTeamAnalysisService.js:19-20` 에 명시). `MyTeamAnalysisService.test.js:288-299` 가 `salary`/`annualSalary`/`cost`/`totalSalary` 문자열 미포함을 이미 단언 | **변경 없음** |
| `ResourceManagementService` | DTO 화이트리스트(`:116-134`)로 salary 미노출. `ResourceSalaryLeak.test.js` 가 지킴 | **변경 없음** |
| `ProjectTeamService` | 응답에 salary 없음. 단 `ProjectUsersQuery.INSERT` 가 `SELECT users.salary` 로 `projectusers.salary` 를 시드한다 | **쿼리 불변**(§4-6에서 별도 판단) |

### 0-2. 권한 카탈로그 키 이름 정정

요구사항의 `SETTING` / `LEVEL` 은 존재하지 않는 키다. 실제 키는:

| 요구사항 표기 | **실제 키** | 근거 |
|--------------|-----------|------|
| `SETTING` | **`SETTINGS`** | `PermissionMap.js:173` `updateSetting: W('SETTINGS')` |
| `LEVEL` | **`LEVEL_MANAGEMENT`** | `PermissionMap.js:59-64` |
| `USER_MANAGEMENT` | `USER_MANAGEMENT` (일치) | `PermissionMap.js:38-47` |
| `PROJECT_COST` | `PROJECT_COST` (일치) | `PermissionMap.js:137, 234` |

추가: `getSettingData` 는 **`'PUBLIC'`** 이다(`PermissionMap.js:172`). 인증된 Jira 사용자면 누구나 읽는다.

### 0-3. 엑셀 업로드는 이미 Salary 를 파싱하지 않는다

`uploadUsersExcelWithQueueService`(`UserService.js:478-567`)는 헤더맵에서 **`Email` 컬럼만** 찾고
(`const emailColIndex = headerMap['Email']`, `:501`), `items[]`에 `{email, createdId, permissionMemberKey}`만 넣는다.
`headerMap['Salary']` 조회는 **존재하지 않는다**. 업로드/다운로드가 비대칭이다(다운로드만 `Salary` 컬럼 보유).
→ 요구사항 §C의 "엑셀 업로드 `Salary` 헤더 동작 결정"은 **결정할 동작이 이미 '무시'** 다(§5-4에서 확정).

### 0-4. 기존 salary 노출 지점 전수 (조사 실측)

| # | resolver | 응답 위치 | 값 종류 | 현행 게이트 |
|---|---|---|---|---|
| 1 | `getUserListWithPaging` | `content[].salary` | 개인 연봉 원시 | `R('USER_MANAGEMENT')` — 비용 게이트 없음 |
| 2 | `findUserByAccountId` | root `salary` | 개인 연봉 원시 | `R('USER_MANAGEMENT')` |
| 3 | `getUserInfo` | `rows[].salary` (`SELECT *`) | 개인 연봉 원시(본인) | `'SELF'` |
| 4 | `downloadExcel` | `fileBase64` 내 `Salary` 컬럼 | 개인 연봉 원시(전원) | `R('USER_MANAGEMENT')` |
| 5 | `getProjectSalaryList` | `rows[].salary`, `rows[].annual_salary` | 투입급여 + 개인 연봉 원시 | `R('PROJECT_COST','detail')` |
| 6 | `getSummaryData` | root `total_salary` | Σ 투입급여 (1인 프로젝트면 개인값) | `R('DASHBOARD','detail')` — **비용 게이트 없음** |
| 7 | `getChartData`/`getChartDataById` (`salary`) | `chartData.summary.{min,max,avg,median}` + 버킷 | 분포(min/max 는 개인값) | `canReadCost` |
| 8 | `getPortfolioDashboard` | `projects[].members[].salary`, `.totalSalary` | **유효급여**(정책 파생) | `canReadCost` 키 strip |
| 9 | `getProjectCostSummary` | `budget/byRole/byLevel/byTeam/byIssue[].byMember[].cost` | 정책 파생 집계 | `R('PROJECT_COST','detail')` |

**⚠ 기존 결함 보고(이번 범위 밖, 별건 처리 권고):** #6 `getSummaryData.total_salary` 는 같은 컨트롤러의
salary 차트가 `canReadCost` 로 막혀 있는데도 **비용 게이트가 없다**. 1인 프로젝트에서는 그 사람의
투입급여 그대로다. 이번 설계는 이 결함을 **확대하지 않는 방향**(LEVEL_BAND에서 키 제거)으로만 다루고,
INDIVIDUAL 에서의 기존 노출은 무회귀 요건 때문에 **그대로 둔다**. 별도 RFC 권고.

### 0-5-A. 독립 검증 결과 — 서버 측 신규 salary 노출 경로 **0건** (r2 추가)

RFC-172~176(팀 도입·팀 분석 확충) 이후 추가된 서버 코드를 독립 검증한 결과,
`src/resolver/teamAnalytics/`, `src/permission/TeamAnalyticsScope.js`, `src/resolver/backoffice/team/*`,
`src/rdb/query/ProjectTeamQuery.js` 모두 **salary/cost 필드를 응답에 싣지 않는다.**
→ **§5-3 의 차단 지점 표는 서버 기준으로 완전하다.** teamAnalytics 백엔드 작업은 0건이다.

⚠ **단, 프론트는 다르다.** 팀 분석 화면은 `getPortfolioDashboard` 의 `members[].salary` 를
**프론트에서 롤업해 렌더**한다(§7-6(b), 6지점). 서버에 노출 경로가 없다는 사실이
"팀 분석에 인건비가 안 보인다"는 뜻이 아니다 — 그 값은 §11 A10 의 산출물이다.

### 0-5. `getSettingData` 캐시가 두 갈래로 쪼개져 있다

프론트에서 `invoke('getSettingData')` 하는 곳이 **18곳**인데,
- `settingKeys.detail()`(= `['settings','detail']`, `utils/queryKey/logicalAuditKeys.js:13`) 사용: **3곳**
  (`SettingPage.jsx`, `ProjectCalender.jsx`, `useProjectResourceMembers.js`)
- 인라인 `queryKey: ['getSettingData']` 사용: **15곳**
  (`MonthMmSummary`, `MyPage`, `WorklogPage`, `ResourceOverviewTable`, `LoadSummaryCards`, `TaskHistoryPage`,
   `InProgressIssueList`, `ProjectTreeView`, `ProjectAssignmentBoard`, `GanttPage`, `ProjectIssuePanel`,
   `IssueAnalysisPage`, `AssignmentPage` 등)

→ 정책 값을 이 15곳 캐시에 얹으면 정책 변경 후에도 stale 이 남는다. §7-3 에서 단일 소스를 정의한다.

---

## 1. 개요 / 영향 범위

전사 단위 **급여 산정 정책**(`salaryPolicy`)을 도입한다.

| 모드 | 급여 원천 | 개인 금액 |
|------|-----------|-----------|
| `INDIVIDUAL` (기본) | `users.salary`(연봉) / `projectusers.salary`(투입급여) — **현행 그대로** | 입력·표시 |
| `LEVEL_BAND` | 등급 밴드의 **대표값**을 `annualSalary` 슬롯에 넣고 **기존 월할식 그대로** 환산 | 저장 보존, **서버 응답에서 제거** |

### 축별 영향

| 축 | 신규 | 수정 |
|----|------|------|
| **KVS** | — | `settings` 에 `salaryPolicy`, `level` 에 `salaryMin`/`salaryMax`/`salaryRepresentative`. **manifest attributes 선언 필수**(§3-4) |
| **MySQL** | — | **급여 컬럼은 무변경**(`users.salary`·`projectusers.salary`·`salary_type`). **단 A안(D8) 으로 `portfolio_snapshot` 에 `salary_policy VARCHAR(20) NULL` 멱등 ALTER 1건 발생**(§4-7-1 A-1, `migrate.js` enqueue 필요) |
| **백엔드 신규 파일** | `src/resolver/projectCost/SalaryPolicy.js`(순수), `src/resolver/projectCost/SalaryPolicyContext.js`(로더), `src/permission/SalaryVisibility.js`(판정 단일출처) | — |
| **백엔드 수정** | — | `EffectiveSalary.js`, `SettingDefaults.js`, `SettingService.js`, `LevelService.js`, `UserService.js`, `UserController.js`, `ProjectUsersService.js`, `ProjectCostService.js`, `PortfolioAggregator.js`, `ProjectDashboardService.js`, `PermissionMap.js` |
| **프론트 신규** | `components/salary/SalaryCell.jsx`, `components/salary/SalaryField.jsx`, `hooks/useSalaryPolicy.js`, `backoffice/page/setting/SalaryPolicySetting.jsx` | — |
| **프론트 수정** | — | `SettingPage.jsx`, `useLevelList.js`, `LevelRegistrationModal`/`useLevelRegistrationModal`, `LevelEditModal`/`useLevelEditModal`, `UserListPaging.jsx`, `UserEditModal.jsx`/`useUserEditModal.js`, `UserRegistrationModal.jsx`, `SalaryManagementPage.jsx`, `SummaryPanel.jsx`, `AddChartModal.jsx` |
| **권한** | **신규 카탈로그 키 0개.** `getLevelList` OR-grant 에 `['SETTINGS','read']` 1개 추가(§8) | — |
| **i18n** | — | `setting.json`, `level.json`, `user.json`, `salary.json`, `cost.json` (kr/en 각각) |

---

## 2. 설계 원칙 (이 문서 전체를 관통하는 3줄)

1. **환산식은 한 글자도 바꾸지 않는다.** `computeEffectiveSalary` 의 `annualSalary` **입력 원천**만 바뀐다.
2. **정책 컨텍스트는 요청당 1회 조립해 주입한다.** 호출자가 각자 KVS 를 읽는 설계는 금지.
3. **차단은 프론트가 아니라 서버가 한다.** 프론트 분기는 **이중 방어**일 뿐이고, 실패 시 숨김 쪽으로 폴백한다.

---

## 3. 데이터 모델 (A)

### 3-1. `settings.salaryPolicy`

- **값 도메인:** `'INDIVIDUAL' | 'LEVEL_BAND'` (문자열 2값. enum 확장 여지를 위해 boolean 대신 문자열)
- **기본값:** `'INDIVIDUAL'`
- **폴백 메커니즘 — 마이그레이션이 필요 없는 이유:**
  `SettingDefaults.js` 의 `DEFAULT_SETTINGS` 에 `salaryPolicy: 'INDIVIDUAL'` 을 추가하면,
  `getSettingDataService` 가 `return {...DEFAULT_SETTINGS, ...(saved ?? {})}` (`SettingService.js:13`) 이므로
  **기존 설치는 코드 배포만으로 자동 INDIVIDUAL** 이 된다. KVS 백필 불필요.
  `onInstall` 시더(`SeedData.js:312-325`)도 `{...DEFAULT_SETTINGS, ...exists}` 라 동일하게 자동 반영.

**`src/resolver/backoffice/setting/SettingDefaults.js` diff:**
```js
 export const DEFAULT_SETTINGS = Object.freeze({
     currency: 'KRW',
     hourRate: 8,
     ...
     progressThreshold: 5,
+    // 급여 정책 — 'INDIVIDUAL'(개인 연봉 기준, 기존) | 'LEVEL_BAND'(등급 밴드 대표값 기준)
+    // ⚠ 이 기본값이 하위호환의 전부다. getSettingDataService 가 read 시점에 병합한다.
+    salaryPolicy: 'INDIVIDUAL',
 });
```

### 3-2. `level` 밴드 속성

| 필드 | 타입 | 의미 | 미입력 시 |
|------|------|------|----------|
| `salaryMin` | `integer` | 급여 범위 하한 | **속성 자체를 생략** |
| `salaryMax` | `integer` | 급여 범위 상한 | **속성 자체를 생략** |
| `salaryRepresentative` | `integer` | 비용 계산에 쓰는 대표값 | **속성 자체를 생략** |

**단위 규약 (⚠ 반드시 지킬 것):** 세 값의 단위는 **`users.salary` 와 완전히 동일**하다.
이 값이 `computeEffectiveSalary` 의 `annualSalary` 슬롯에 그대로 들어가기 때문이다.
단위 변환 코드는 **어디에도 넣지 않는다**. UI 표시 단위("만원" 등)는 기존 `user.json` 라벨 관례를 따른다.

**KVS 빈 문자열 금지 규약:**
```js
// ❌ 금지 — KVS 는 빈 문자열 저장을 거부한다(reference_forge_kvs_empty_string)
{ salaryMin: min || '' }
// ❌ 금지 — 정수 attribute 에 null 을 넣지 않는다
{ salaryMin: null }
// ✅ 규약 — 미입력이면 속성 자체를 만들지 않는다
const toBand = (v) => {
    const n = Number(v);
    return (v === null || v === undefined || v === '' || !Number.isFinite(n)) ? undefined : Math.round(n);
};
const data = {
    name,
    description,
    ...(toBand(salaryMin)            !== undefined && { salaryMin:            toBand(salaryMin) }),
    ...(toBand(salaryMax)            !== undefined && { salaryMax:            toBand(salaryMax) }),
    ...(toBand(salaryRepresentative) !== undefined && { salaryRepresentative: toBand(salaryRepresentative) }),
};
```
- `Math.round` 는 필수다. manifest 타입이 `integer` 이므로 소수를 넣으면 422 다.
- 읽기 시(`getLevelListService` / `findLevelByIdService`)는 **`?? null` 로 정규화**해 내려준다 —
  프론트가 `undefined` 분기를 하지 않게 한다(경계면 계약 §6).
- **밴드 해제 방법:** 프론트가 빈 문자열을 보내면 서버가 속성을 생략한 객체를 `save()` 한다.
  `kvs.entity().set(id, {...data})` 는 **전체 치환**이므로 이전 속성이 자동으로 사라진다(별도 삭제 API 불필요).

### 3-3. 대표값(representative) — **자동 계산 후 저장(persist)** [결정]

**결정: 저장한다.** 파생 계산(min/max 만 저장하고 매번 `(min+max)/2` 계산)은 채택하지 않는다.

**이유:**
1. 요구사항이 "관리자가 중앙값을 수정할 수 있어야 한다"고 명시한다. **파생값은 덮어쓸 자리가 없다.**
2. 파생 + "오버라이드일 때만 저장" 3상태 설계는 KVS 에서 특히 나쁘다 — "미저장(=파생)"과
   "0 을 명시 저장"을 구분하려면 별도 boolean attribute 가 하나 더 필요하고, KVS 는 null 저장이 껄끄럽다.
3. 비용 수치의 재현성. 저장하면 "이 프로젝트 비용은 그때 대표값 X로 계산됐다"가 명시적이다.

**자동 채움 규칙(UI 책임, 서버는 폴백만):**
- **UI:** `salaryRepresentative` 입력칸이 **비어 있을 때만** min/max 변경 시 `round((min+max)/2)` 를 자동 채운다.
  이미 값이 있으면 **절대 덮어쓰지 않는다.** 대신 필드 옆에 `[중앙값 계산]` 보조 버튼을 둬서
  관리자가 명시적으로 재계산할 수 있게 한다.
  → 이렇게 하면 "값이 자동으로 바뀌었는지 아닌지"를 추측하는 매직 휴리스틱이 필요 없다.
- **서버:** `salaryRepresentative` 가 미전달이고 `salaryMin`·`salaryMax` 가 둘 다 유효하면
  `Math.round((min + max) / 2)` 로 채워 저장한다(API 직접 호출 대비 폴백).

**검증(서버):**
- `salaryMin > salaryMax` → `LogicalError(ErrorCodes.LEVEL_SALARY_BAND_INVALID)`
- 음수 → 동일 에러
- `salaryRepresentative` 가 `[min, max]` 범위 밖 → **거부하지 않고 허용**(관리자 판단 존중). 단 프론트가 경고 표시.

### 3-4. `manifest.yml` attributes diff (⚠ 적용 금지 — 설계서 기재만)

```diff
       - name: level
         attributes:
           id:
             type: string
           name:
             type: string
           description:
             type: string
+          # 급여 정책 LEVEL_BAND 용 급여 밴드. 미입력 등급은 **속성 자체가 없다**(KVS 빈 문자열 거부).
+          # 단위는 users.salary 와 동일 — 변환하지 않는다.
+          salaryMin:
+            type: integer
+          salaryMax:
+            type: integer
+          salaryRepresentative:
+            type: integer
         indexes:
           - name
```

```diff
       - name: settings
         attributes:
           currency:
             type: string
           ...
           progressThreshold:
             type: float
+          # 급여 산정 정책 — 'INDIVIDUAL' | 'LEVEL_BAND'. 미설정 설치는 DEFAULT_SETTINGS 병합으로 INDIVIDUAL.
+          salaryPolicy:
+            type: string
```

**⚠ 배포 순서 주의 (§10-3 에 재기재):**
- manifest 선언 **없이** `salaryMin` 을 저장하면 KVS 가 **422 semantic error** 를 낸다.
- manifest 스키마는 **`forge deploy` 로만 반영된다.** `forge tunnel` 은 코드만 갈아끼우므로 스키마가 안 바뀐다.
- → **manifest 변경과 밴드 저장 코드는 같은 커밋에 두고 `forge deploy` 한 번으로 동시 반영**한다. 분리 배포 금지.

### 3-5. MySQL — **급여 컬럼 무변경, 스냅샷 컬럼 1건 추가** (r3 정정)

**급여 데이터는 DDL 무변경이다.** `users.salary`, `projectusers.salary`, `projectusers.salary_type`
모두 손대지 않고, `ddl/users.sql.js`·`ddl/projectusers.sql.js` 도 그대로 둔다.
LEVEL_BAND 에서도 값은 계속 저장·보존된다(D3 되돌리기 요건).

**단 A안(D8) 확정으로 마이그레이션 1건이 발생한다** — `migrate.js` 에 신규 enqueue가 **있다**:

| 테이블 | 변경 | 마이그레이션 |
|---|---|---|
| `users` | 없음 | 없음 |
| `projectusers` | 없음 | 없음 |
| **`portfolio_snapshot`** | `+ salary_policy VARCHAR(20) NULL` | **`v0NN_alter_portfolio_snapshot_add_salary_policy`** 멱등 ALTER (§4-7-1 A-1) |

> ⚠ **`NULL` 허용이 의도다.** `NOT NULL DEFAULT 'INDIVIDUAL'` 을 쓰면 정책 도입 이전 스냅샷이
> "INDIVIDUAL 로 집계됨"이라고 **주장**하게 되는데, 그건 우연히 맞는 말이라 위험하지 않다 —
> 오히려 `normalizeSalaryPolicy(null) === 'INDIVIDUAL'` 로 읽기 시점에 접는 편이(A-4) DDL 을
> 단순하게 유지한다. TiDB 는 FK·트랜잭션 미지원이므로 기존 멱등 ALTER 관례(v012 선례)를 그대로 따른다.

---

## 4. 급여 해석 경로 (B) — 이번 설계에서 가장 위험한 절

### 4-1. 신규 순수 모듈 `src/resolver/projectCost/SalaryPolicy.js`

Forge 의존성 없음 → jest 단위테스트 대상. `EffectiveSalary.js` 와 같은 위치·같은 성격.

```js
export const SALARY_POLICY = Object.freeze({ INDIVIDUAL: 'INDIVIDUAL', LEVEL_BAND: 'LEVEL_BAND' });

/** 모르는 값·undefined·null 은 전부 INDIVIDUAL. (계산 경로의 기본은 '기존 동작') */
export const normalizeSalaryPolicy = (v) => (v === 'LEVEL_BAND' ? 'LEVEL_BAND' : 'INDIVIDUAL');

/**
 * getLevelListService().data → { [levelId]: {min, max, representative} }
 * 밴드 3필드가 모두 없는 등급은 **맵에 넣지 않는다**(존재 = 가격이 있다).
 */
export const buildLevelBandMap = (levelRows = []) => { ... };

/**
 * 등급키 → 대표 연봉. 없으면 null.
 * ⚠ representative 가 없고 min/max 만 있으면 여기서 (min+max)/2 로 **읽기 시 폴백**한다
 *   (저장 폴백이 실패했거나 API 직접 편집으로 생긴 반쪽 데이터 방어).
 */
export const resolveLevelBandAnnual = (levelKey, bandMap) => { ... };

/** 밴드 표시용 shape. 응답에 그대로 싣는다. 없으면 null. */
export const toLevelBandDto = (levelKey, bandMap) => // { min:number|null, max:number|null, representative:number|null } | null
```

### 4-2. `computeEffectiveSalary` 확장 — **무회귀를 구조로 보장한다**

**`src/resolver/projectCost/EffectiveSalary.js` diff:**

```diff
-export const computeEffectiveSalary = ({ salaryType, salary, annualSalary }, { projectMonths }) => {
+export const computeEffectiveSalary = (
+    { salaryType, salary, annualSalary, levelKey },
+    { projectMonths, policy = 'INDIVIDUAL', levelBands = null } = {}
+) => {
+    /*
+     * ── LEVEL_BAND 분기 ────────────────────────────────────────────────────
+     * 급여 **원천**만 바뀐다. 월할 환산식((annual/12) × projectMonths)은 아래 ANNUAL 경로와
+     * 문자 그대로 동일하다. salary(투입급여)·annualSalary(개인 연봉)는 **읽지 않는다**.
+     * 등급 미지정 / 밴드 미설정 / 대표값 0 → 0 (기존 `annual <= 0 → 0` 규약과 동일. 새 규약 없음)
+     */
+    if (policy === 'LEVEL_BAND') {
+        const annual = resolveLevelBandAnnual(levelKey, levelBands) ?? 0;
+        const months = projectMonths || 0;
+        if (annual <= 0 || months <= 0) return 0;
+        return Math.round((annual / 12) * months);
+    }
+
+    // ↓↓↓ 아래는 한 글자도 수정하지 않는다 (INDIVIDUAL = 기존 동작 그대로) ↓↓↓
     const invest = salary || 0;
     if ((salaryType || 'PROJECT') !== 'ANNUAL') return Math.round(invest);
     const annual = annualSalary || 0;
     const months = projectMonths || 0;
     if (annual <= 0 || months <= 0) return 0;
     return Math.round((annual / 12) * months);
 };
```

**무회귀가 구조적으로 보장되는 이유 (3중):**
1. **기본 인자** `policy = 'INDIVIDUAL'` — 두 번째 인자로 `{projectMonths}` 만 넘기는 **기존 4개 호출부는
   분기에 진입 자체를 못 한다.**
2. **입력 필드 분리** — LEVEL_BAND 분기는 `levelKey` + `levelBands` 만 읽고, INDIVIDUAL 분기는
   `salary`/`annualSalary`/`salaryType` 만 읽는다. 서로의 입력을 건드리지 않는다.
3. **기존 코드 라인 물리적 무수정** — 위 diff 는 순수 **추가**다. 기존 5줄은 그대로다.

**무회귀 게이트(구현 필수):**
> `src/resolver/projectCost/__test__/EffectiveSalary.test.js` **파일을 한 줄도 수정하지 않고** 전 케이스가
> 통과해야 한다. 이 테스트가 수정을 요구하면 그것이 곧 회귀 신호다. LEVEL_BAND 케이스는
> **신규 파일** `__test__/SalaryPolicy.test.js` 에 쓴다.

### 4-3. `resolveMemberSalaries` 확장

```diff
-export const resolveMemberSalaries = (memberRows, { projectMonths }) =>
+export const resolveMemberSalaries = (memberRows, { projectMonths, policy = 'INDIVIDUAL', levelBands = null } = {}) =>
     (memberRows || []).map((u) => {
+        const isBand = policy === 'LEVEL_BAND';
         const investSalary = u.salary ?? 0;
         const effective = computeEffectiveSalary(
-            { salaryType: u.salary_type, salary: investSalary, annualSalary: u.annual_salary },
-            { projectMonths }
+            { salaryType: u.salary_type, salary: investSalary, annualSalary: u.annual_salary, levelKey: u.level_key },
+            { projectMonths, policy, levelBands }
         );
         return {
             accountId: u.account_id,
             salary: effective,
-            investSalary,
-            annualSalary: u.annual_salary ?? null,
-            salaryType: u.salary_type ?? 'PROJECT',
+            /*
+             * 🔒 LEVEL_BAND 에서는 개인 금액을 **애초에 실어 나르지 않는다**(심층 방어).
+             *   ProjectCostService 는 members 를 응답에 싣지 않지만, 이 함수의 반환은 3개 도메인이
+             *   공유하므로 여기서 끊는 것이 가장 싸다.
+             */
+            investSalary: isBand ? null : investSalary,
+            annualSalary: isBand ? null : (u.annual_salary ?? null),
+            salaryType:   isBand ? null : (u.salary_type ?? 'PROJECT'),
             roleKey: u.role_key ?? null,
             levelKey: u.level_key ?? null,
             teamKey: u.team_key ?? null,
+            /** 순수 추가 — 'INDIVIDUAL' | 'LEVEL_BAND' | 'UNPRICED'(가격 산정 불가). 경고 UI·검증용 */
+            salarySource: isBand ? (effective > 0 ? 'LEVEL_BAND' : 'UNPRICED') : 'INDIVIDUAL',
         };
     });
```
> `salarySource` 는 `teamKey` 추가(P3-A) 선례와 동일한 **순수 추가**다. 세 도메인 모두 무해.

### 4-4. 정책 컨텍스트 로더 — **요청당 1회** (호출자별 KVS 조회 금지)

**`src/resolver/projectCost/SalaryPolicyContext.js` (신규):**
```js
/**
 * 정책 + 등급 밴드 맵을 **요청당 1회** 조립한다.
 *
 * ⚠ 호출자마다 KVS 를 각자 읽으면 안 된다(Forge 256MB / 응답시간). 이미 settings 를 들고 있는
 *   호출자는 `{ settings }` 를 넘겨 **중복 조회 0** 으로 만든다.
 * ⚠ INDIVIDUAL 이면 getLevelList 를 **호출하지 않는다** — 기존 경로에 KVS 왕복이 늘지 않는다.
 *   (그래서 Promise.all 병렬이 아니라 의도적 직렬이다)
 */
export const loadSalaryPolicyContext = async ({ settings } = {}) => {
    const s = settings ?? await getSettingDataService();
    const policy = normalizeSalaryPolicy(s?.salaryPolicy);
    if (policy !== 'LEVEL_BAND') return { policy, levelBands: null, isLevelBand: false };
    const levelRes = await getLevelListService();
    return { policy, levelBands: buildLevelBandMap(levelRes?.data ?? []), isLevelBand: true };
};
```

**호출자별 주입 지점 (전수):**

| 호출자 | 정책 조회 비용 | 주입 방법 |
|--------|--------------|----------|
| `ProjectCostService.getProjectCostSummaryService` (캐시 miss) | **+0회** — `:89` 에서 이미 `getSettingDataService()` 호출 중 | `loadSalaryPolicyContext({ settings })` 로 재사용. `resolveMemberSalaries(memberRows, { projectMonths, policy, levelBands })` |
| `ProjectCostService.buildByIssue` (캐시 hit) | +1~2회 | `buildByIssue({..., policy, levelBands })` 로 **인자 전달**. 캐시 payload 에 `salaryPolicy` 저장하고 hit 시 현재 정책과 대조(§4-7) |
| `ProjectUsersService.getProjectSalaryListService` | +1~2회 | 기존 `Promise.all` 에 `loadSalaryPolicyContext()` 추가 |
| `PortfolioAggregator.aggregateOneProject` | **+0회** — `aggregateAllProjects:492` 가 `getSettingDataService()` 를 **전체 배치에 1회** 호출해 `settings` 를 각 프로젝트에 전달 중 | `aggregateAllProjects` 에서 `loadSalaryPolicyContext({settings})` 를 **1회** 조립해 `aggregateOneProject(project, settings, holidays, coworkerFieldId, policyCtx)` 로 전달. **프로젝트 수 × KVS 조회가 절대 생기면 안 된다** |
| `ProjectDashboardService.getSummaryDataService` | +1회 | 표시 게이팅 전용 → `resolveSalaryPolicySafe()`(§5-2) 사용 |
| `ProjectDashboardService.getSalaryChartData` | +1회 | 동일 |
| `UserService` 목록/상세/엑셀 | +1회 | 동일. 단 `getUserListWithPagingService` 는 `roleLevelMap()` 이 이미 `getLevelListService()` 를 호출하므로(`:134`) **레벨 조회 재사용 가능** |

**⚠ 금지 사항 명문화:** `EffectiveSalary.js` / `SalaryPolicy.js` 안에서 `getSettingDataService`·`getLevelListService`
를 import 하지 않는다. 이 두 파일은 **순수 함수 모듈**로 남아야 jest 가 Forge mock 없이 돈다.

### 4-5. 등급 미지정(`level_key = null`) 처리 — LEVEL_BAND 모드

| 상황 | 유효급여 | 근거 |
|------|---------|------|
| `level_key = null` | **0** | 기존 `annual <= 0 → 0` 규약과 **동일**. 새 sentinel(-1/null) 을 만들지 않는다 |
| 등급은 있으나 밴드 미설정 | **0** | 동일 |
| 대표값 0 또는 음수 | **0** | 동일 |
| `projectMonths = 0`(기간 미설정) | **0** | 기존 ANNUAL 규약과 동일 |

**기존 규약과의 정합:** LEVEL_BAND 의 0 처리는 INDIVIDUAL/ANNUAL 의 "연봉 미등록 → 0" 과 **문자 그대로 같은 규칙**이다.
따라서 `CostCalculator` / `groupCostByKey` / `buildSalaryMap` 하류는 **무변경**으로 동작한다.
(0 인 멤버는 이미 존재하던 케이스다 — 신규 경계 케이스가 아니다.)

**화면 경고 (0 이 조용히 섞이지 않게):**
- 서버가 `unpricedMemberCount`(유효급여 0 인 인원 수)를 응답에 **순수 추가**한다.
  - `getProjectSalaryList` → `meta.unpricedMemberCount`
  - `getProjectCostSummary` → root `unpricedMemberCount`
- 프론트: 값 > 0 이면 상단 `SectionMessage(appearance="warning")` — `cost.warn.unpriced` /
  `salary.warn.unpriced` ("등급 밴드가 없어 N명의 인건비가 0으로 계산되었습니다. 등급 관리에서 밴드를 설정하세요.")
- 행 단위: 급여 관리 탭에서 `level_band === null` 인 행에 경고 뱃지(기존 `salary.warn.noAnnual` 뱃지 패턴 그대로).
- **명단은 내려주지 않는다** — 카운트만으로 충분하고, 최소 노출 원칙에 부합.

### 4-6. `projectusers.salary`(투입급여)의 처리 — ✅ **D5 확정** (초판에서 권고안으로 제시 → 사용자 승인)

**문제:** `ProjectUsersQuery.INSERT` 는 인력 배정 시 `SELECT users.salary` 로 개인 연봉을 `projectusers.salary` 에 복사한다.
LEVEL_BAND 에서 이 값이 (a) 계속 복사되고 (b) `getProjectSalaryList` 로 노출된다면 정책이 무의미해진다.

**권고안(확정):**
| 항목 | 결정 | 이유 |
|------|------|------|
| `ProjectUsersQuery.INSERT` 의 salary 복사 | **그대로 둔다(쿼리 무변경)** | D3 "저장은 보존, 되돌리기 가능"의 직접 요건. 저장은 되지만 **노출·계산에서 빠진다** |
| `getProjectSalaryList` 응답의 `salary`/`annual_salary` | **키 제거** | 개인 금액 노출 경로 (§0-4 #5) |
| `updateProjectMemberSalary`(투입급여·모드 편집) | **거부** — `LogicalError('SALARY_POLICY_LEVEL_BAND')` | LEVEL_BAND 에서 투입급여·모드는 계산에 쓰이지 않는다. 쓰이지 않는 값을 편집하게 두면 "왜 숫자가 안 바뀌나"가 발생 |
| 급여 관리 탭 UI | **읽기 전용 밴드 뷰**로 전환 | §7-5 |

이 결정은 D3 의 자연스러운 확장이며 사용자 확정 결정과 충돌하지 않는다.

### 4-7. `ProjectCost` KVS 캐시와 정책 전환 (⚠ 놓치기 쉬움)

`ProjectCost:{projectId}` 캐시는 TTL 10분이다. 정책을 바꿔도 최대 10분간 **옛 정책 숫자**가 나온다.
KVS 에는 프리픽스 삭제 API 가 없으므로 일괄 무효화가 불가능하다.

**해법 (선례 대칭):** 캐시 payload 에 `salaryPolicy` 를 **저장하고, hit 시 현재 정책과 대조해 다르면 캐시를 버린다.**
```diff
     if (cached && new Date(cached.expireTime) >= new Date()) {
+        // 정책이 바뀐 뒤의 캐시는 옛 정책 숫자다 — 프리픽스 삭제가 없으므로 read 시점에 무효화한다.
+        //  (_projectMonths 를 캐시에 넣은 선례와 동일 계열. 단 이 값은 응답에도 실리므로 언더스코어 없음)
+        if (normalizeSalaryPolicy(cached.value.salaryPolicy) !== currentPolicy) {
+            // fall through to cache-miss path
+        } else {
         const byIssue = await buildByIssue({ ..., policy: currentPolicy, levelBands });
         return assembleResponse(cached.value, byIssue);
+        }
     }
```
> `currentPolicy` 를 알려면 캐시 hit 경로에서도 정책 조회가 필요하다. `getSettingDataService()` 는
> KVS 단건 read 1회로 가볍고, 캐시 hit 경로는 이미 워크로그·이슈 전량을 재페치하므로 **상대 비용이 무시 가능**하다.

### 4-7-1. `portfolio_snapshot` 지연 — ✅ **A안 확정 (D8)**

**문제(실제 노출 구멍이다 — P2 배너로 처리할 사안이 아니다):**
`portfolio_snapshot` 은 배치 산출물이라 정책을 `LEVEL_BAND` 로 바꿔도 **다음 집계까지 개인 연봉 파생 숫자가 남는다.**
그리고 그 숫자를 **팀 분석 KPI·롤업 테이블·비교 막대**(§7-6(b) 6지점)와 **포트폴리오 위젯**(§7-6(c) 10여 지점)이
**정책 분기 없이 그대로 렌더한다.** 즉 정책을 켠 직후 "숨겼다고 생각한 값"이 화면에 계속 보인다.

**확정: A안 — 정책 불일치 스냅샷은 비용축을 마스킹한다.**
스냅샷에 **집계 당시 정책**을 저장하고, 응답 조립 시 **현재 정책과 대조**해 다르면 `costMasked = true` 로 승격한다.

**선정 근거 (B·C 불채택 사유):**

| 안 | 판정 | 사유 |
|---|---|---|
| **A** | ✅ **채택** | 기존 `costMasked` 신호를 포트폴리오(`costGating.js`)·팀 분석(`useTeamAnalyticsData.js:108`)이 **이미 전부 존중**한다 → **프론트 무수정으로 20여 개 렌더 지점이 한 번에 가려진다.** fail-close 방향과 정합 |
| B (큐 재집계 트리거) | ✗ | 배치 경로를 새로 연결해야 해 작업량·리스크가 늘고, 큐 지연 동안·재집계 실패 시 **결국 A 의 방어가 또 필요하다**. A 위에 얹는 선택적 개선이지 대안이 아니다 |
| C (배너만) | ✗ | **숫자가 그대로 보인다** — 노출이 배치 주기만큼 지속돼 요구사항 위반 |

**A 의 알려진 대가(수용):** 재집계 전까지 비용 축이 통째로 빈다(과잉 차단). 정책을 되돌린 직후에도 한 번 가려진다.
→ `costMaskedReason` + 안내(A-5·A-6)로 "왜 비었는지"를 설명해 완화한다.

#### A-1 ~ A-7 확정 설계

| # | 파일 | 변경 | 우선 |
|---|---|---|---|
| **A-1** | `src/rdb/schema/ddl/portfolioSnapshot.sql.js` + `ddl/index.js` + `migrate.js` | `ALTER TABLE portfolio_snapshot ADD COLUMN IF NOT EXISTS salary_policy VARCHAR(20) NULL` 멱등 ALTER → `ddl/index.js` re-export → `migrate.js` 에 **`v013_alter_portfolio_snapshot_add_salary_policy`** enqueue(v012 뒤. 실제 번호는 구현 시 `migrate.js` 마지막 enqueue 확인). **`NULL` = 정책 도입 이전 스냅샷** — `NOT NULL DEFAULT` 를 쓰면 옛 스냅샷이 INDIVIDUAL 로 위장해 마스킹을 빠져나간다 | **P0** |
| **A-2** | `src/rdb/query/PortfolioSnapshotQuery.js`(UPSERT `:24`·`:48`·SELECT `:73` 계열) + `PortfolioSnapshotRepository.js:33` 주변 | write 컬럼·파라미터에 `salary_policy` 추가, read SELECT 에 컬럼 추가. `total_salary` 와 **정확히 같은 자리**에 끼운다(UPSERT 3곳: 컬럼목록·VALUES·`ON DUPLICATE KEY UPDATE`) | **P0** |
| **A-3** | `PortfolioAggregator.aggregateOneProject` | 스냅샷 payload 에 `salaryPolicy` 포함(§4-4 에서 정책 컨텍스트를 이미 인자로 받으므로 **추가 조회 0**) | **P0** |
| **A-4** | `PortfolioDashboardService.js:132-134` | 마스킹 판정 확장 (아래 코드) | **P0** |
| **A-5** | `PortfolioDashboardService` 응답 | `costMaskedReason` **순수 추가** — 값 도메인·parity 규칙은 아래 별도 항 | **P0** |
| **A-6** | `PortfolioDashboardPage.jsx` / `ComparisonTabs.jsx` (Cost 탭 안내) / teamAnalytics 안내 | **`costMaskedReason` 별 안내 문구 분기.** 코드상 마스킹 동작은 무수정이고 **문구만 갈린다** | **P1** |
| **A-7** | `PortfolioCostGate.test.js` | 케이스 추가 — 스냅샷 정책 ≠ 현재 정책이면 `costMasked:true` + `salary` 키 전멸 + `costMaskedReason:'SNAPSHOT_STALE_POLICY'`. 권한은 있는(`COST_READER`) principal 로 검사해 **권한 축과 정책 축이 독립임**을 못 박는다 | **P0** |

**A-4 판정 코드 (확정):**
```js
// PortfolioDashboardService.js — 기존 :132-134 확장
const currentPolicy = normalizeSalaryPolicy((await getSettingDataService())?.salaryPolicy);
/*
 * 🔴 스냅샷이 **어느 정책으로 집계됐는지** 와 현재 정책이 다르면 그 숫자는 옛 정책 산물이다.
 *   salary_policy IS NULL(정책 도입 이전 스냅샷)도 **불일치로 취급**한다 —
 *   그 스냅샷은 개인 연봉 기준이 확실하므로 LEVEL_BAND 에서 절대 흘리면 안 된다.
 *   ⚠ INDIVIDUAL 에서는 NULL 도 불일치가 되어 과잉 마스킹이 되므로, NULL 은
 *     "현재 정책이 INDIVIDUAL 이면 일치"로 본다(옛 스냅샷 = 개인 연봉 기준 = INDIVIDUAL 과 동치).
 */
const snapshotPolicyOf = (r) => normalizeSalaryPolicy(r.salary_policy); // NULL → 'INDIVIDUAL'
const snapshotStalePolicy = rows.some((r) => snapshotPolicyOf(r) !== currentPolicy);

const permissionDenied = !canReadCost(principal);
const costMasked = permissionDenied || snapshotStalePolicy;
const costMaskedReason = !costMasked ? 'NONE'
    : permissionDenied ? 'PERMISSION'
    : 'SNAPSHOT_STALE_POLICY';
```
> `normalizeSalaryPolicy(null) === 'INDIVIDUAL'`(§4-1)이므로 **옛 스냅샷은 INDIVIDUAL 로 접힌다.**
> 이것이 의도다: 정책 도입 이전 스냅샷은 개인 연봉 기준이므로 INDIVIDUAL 과 동치이고,
> LEVEL_BAND 로 전환하면 자동으로 불일치가 되어 가려진다. **NULL 을 별도 sentinel 로 다루지 않는다.**
> 권한 축(`permissionDenied`)이 정책 축보다 **먼저** 판정된다 — 둘 다 참이면 `'PERMISSION'` 이 이긴다
> (권한이 없으면 재집계해도 어차피 못 본다 — 사용자에게 더 정확한 안내다).

#### `costMaskedReason` 값 도메인 (확정)

| 값 | 의미 | 프론트 안내 |
|---|---|---|
| `'NONE'` | 마스킹 없음(`costMasked === false`) | — |
| `'PERMISSION'` | `PROJECT_COST` read 미보유 (**기존 동작**) | 기존 `portfolio.cost.masked` 문구 유지 |
| `'SNAPSHOT_STALE_POLICY'` | 권한은 있으나 스냅샷이 **옛 정책으로 집계됨** | `portfolio.cost.staleSnapshot` — "급여 정책이 변경되어 이전 집계 결과를 표시하지 않습니다. 재집계 후 확인하세요." + 기존 수동 재집계 CTA |

**⚠ 루트 키 parity 규칙 (`PortfolioCostGate.test.js:165` 관례):**
`costMaskedReason` 은 **모든 응답에 항상 존재**한다 — `costMasked === false` 일 때도 `'NONE'` 을 싣는다.
`emptyShape()`(`PortfolioDashboardService.js:121` 계열)에도 포함해야 루트 키 집합 parity 테스트가 통과한다.
키를 조건부로 붙이면 프론트가 `undefined` 분기를 하게 되고, 그게 정확히 §6-2 가 금지한 패턴이다.

---

## 5. salary 노출 차단 (C) — 게이팅 단일 지점

### 5-1. 판정 단일 출처 `src/permission/SalaryVisibility.js` (신규)

`CostAccess.js`(30줄, 순수 함수 + 상수)와 **정확히 같은 형태**로 만든다. 복사본이 N개 생기면
한쪽만 고쳤을 때 게이트가 갈린다 — `CostAccess.js` 주석이 이미 그 교훈을 기록하고 있다.

```js
/** 급여 은닉 사유 코드. 기존 COST_DENIED_REASON('PROJECT_COST_REQUIRED') 와 형제. */
export const SALARY_HIDDEN_REASON = 'SALARY_POLICY_LEVEL_BAND';

/** 개인 급여 금액을 응답에 실어도 되는가. 정책이 INDIVIDUAL 일 때만 true. */
export const canShowIndividualSalary = (policy) => normalizeSalaryPolicy(policy) === 'INDIVIDUAL';

/**
 * 정책 조회 실패 시의 **표시 게이팅 전용** 폴백.
 * ⚠ fail-close 의 의미: 실패하면 **숨기는 쪽**(LEVEL_BAND)으로 간다. 노출 쪽 폴백 금지.
 * ⚠ **계산 경로에는 쓰지 않는다** — 계산에서 LEVEL_BAND 로 폴백하면 비용 숫자가 조용히 바뀐다.
 *    계산 경로는 예외를 그대로 전파해 responseWrapper 가 {success:false} 를 내게 한다.
 */
export const resolveSalaryPolicySafe = async () => {
    try { return normalizeSalaryPolicy((await getSettingDataService())?.salaryPolicy); }
    catch (e) { console.error('[SalaryVisibility] policy load failed → hide', e); return 'LEVEL_BAND'; }
};
```

**표시 게이팅 vs 계산 경로의 fail 분기 (⚠ 핵심):**

| 경로 | 정책 조회 실패 시 | 이유 |
|------|-----------------|------|
| **표시**(user 목록/상세/엑셀/급여탭 rows) | `LEVEL_BAND` 로 폴백 = **숨김** | 노출 사고 방지가 화면 가용성보다 우선 |
| **계산**(ProjectCost / PortfolioAggregator) | **예외 전파**(`{success:false}`) | 폴백은 어느 쪽이든 숫자를 거짓으로 만든다. 조용한 오답보다 명시적 실패가 낫다 |

### 5-2. strip 방식 — 얕고 명시적으로 (재귀 stripper 금지)

**결정:** 각 노출 지점에서 **얕은 명시 구조분해**로 제거한다. 범용 재귀 stripper 는 만들지 않는다.

**이유:** `PortfolioDashboardService.stripMemberCost`(`:98-101`)가 이미
`({ salary, ...rest }) => rest` 한 줄이다 — 이 선례를 따른다. 재귀 stripper 는 (a) 무엇이 지워질지
호출부에서 예측 불가하고 (b) `byLevel[].planned` 같은 **정당한 집계 필드**를 오삭제할 위험이 있으며
(c) 응답 크기만큼 순회 비용이 든다.

**회귀 방지는 테스트가 담당한다** — `PortfolioCostGate.test.js:102-103` 관례(직렬화 문자열 검사)를 그대로 이식:
```js
const serialized = JSON.stringify(res);
expect(serialized).not.toContain('salary');
expect(serialized).not.toContain('Salary');
```

### 5-3. 차단 지점 전수 목록 + 조치

| # | resolver | 응답 필드 | LEVEL_BAND 조치 | 난이도 |
|---|---|---|---|---|
| 1 | `getUserListWithPaging` | `content[].salary` | **키 제거**. 대신 `levelBand:{min,max}\|null` 추가. `mapUserRowsToDto` 단일 지점(`UserService.js:98-129`)에서 처리 — `roleLevelMap()` 이 이미 `getLevelListService()` 를 호출하므로 밴드 맵 **추가 조회 0** | 하 |
| 2 | `findUserByAccountId` | root `salary` | **키 제거**. 기존 `MASKED_FOR_TEAM_LEAD` 마스킹 지점(`:320-323`)과 같은 자리에서 처리 | 하 |
| 3 | `getUserInfo` | `rows[].salary` (`SELECT *`) | **키 제거 — 단 반드시 Controller 레이어에서** (아래 ⚠) | **중** |
| 4 | `downloadExcel` | xlsx `Salary` 컬럼 | 헤더 배열(`:642-655`)·행 빌더(`:629`)에서 **컬럼 자체 제외**. `Salary` 를 빈칸으로 두는 방식 금지(컬럼 존재 자체가 "여기 값이 있었다" 신호) | 하 |
| 5 | `uploadUsersExcelWithQueue` | — | **변경 없음**(§0-3, §5-4) | — |
| 6 | `getProjectSalaryList` | `rows[].salary`, `rows[].annual_salary`, `rows[].salary_type` | **키 제거** + `level_band` 추가 (§6) | 중 |
| 7 | `updateProjectMemberSalary` | (write) | **거부** `LogicalError('SALARY_POLICY_LEVEL_BAND')` | 하 |
| 8 | `updateUser` | (write) | `salary` **무시** + `droppedFields:['salary']` — **기존 관례 재사용**(`UserService.js:475` 가 이미 `{content:{droppedFields}}` 반환, `TeamLeadFieldPolicy` 선례) | 하 |
| 9 | `addUser` | (write) | `salary` 무시(저장 안 함). 응답 shape 무변경 | 하 |
| 10 | `getSummaryData` | root `total_salary` | **키 제거**(`?? 0` 으로 거짓 0 을 그리지 못하게). ⚠ `SummaryPanel.jsx:32` 가 `formatNumber(data?.total_salary)` 로 소비하고 **`:39` 가 KpiTile 로 렌더**한다 → §7-6(a) | 중 |
| 11 | `getChartData`/`getChartDataById`(`salary`) | 히스토그램 | `{denied:true, reason:'SALARY_POLICY_LEVEL_BAND', summary:null, ...}` + **`getSalaryRepository` 를 호출하지 않는다**(`SalaryChartGate.test.js:45` 관례) | 하 |
| 12 | `getPortfolioDashboard` | `members[].salary`, `totalSalary` | **키 제거 없음**(정책 파생값이므로 — 아래 참조). **단 A안(D8): 스냅샷 정책 ≠ 현재 정책이면 `costMasked` 승격**으로 기존 `stripMemberCost` 가 발동 → 이 경우에만 키가 사라진다(§4-7-1) | 중 |
| 13 | `getProjectCostSummary` | `byRole/byLevel/byTeam/byIssue` | **변경 없음** — 아래 참조 | — |
| **N1** | `PortfolioDashboardService.js:37, :121, :277` | root `salaryBuckets` (= `SALARY_BUCKET_BOUNDS` 상수) | **변경 없음.** 버킷 **경계 상수**이지 개인값이 아니다. ⚠ 단 §6-4 불변식 #3 의 문자열 검사 예외 처리 필요(아래) | — |
| **N2** | `PortfolioAggregator.js:410` | 스냅샷 **write** — `total_salary` 컬럼 = `Σ members[].salary` | **A10 에 포함**(별도 조치 아님). 정책 주입이 되면 이 합계도 자동으로 대표값 파생이 된다 — **다만 작업 항목에 명시**(§11 A10) | — |
| **N3** | `PortfolioSnapshotQuery.MEMBER_ROWS:104-115` (`pu.salary`:109, `salary_type`:110, `u.salary AS annual_salary`:111) | 스냅샷 집계용 **원시 조회** | **쿼리 무변경.** LEVEL_BAND 에서 `computeEffectiveSalary` 가 이 컬럼들을 **읽지 않을 뿐**이다(§4-2 입력 필드 분리). 응답에 나가지 않으므로 노출 지점이 아니다 | — |

**#12·#13 을 손대지 않는 근거 (중요):**
LEVEL_BAND 에서 이 값들은 **모두 등급 대표값 파생**이다. 대표값은 등급 페이지에서 이미 공개된
값이므로, `members[].salary` 나 `byLevel[].planned ÷ memberCount` 를 역산해도 **새로운 개인 정보가 나오지 않는다**.
즉 LEVEL_BAND 는 하류 비용 데이터의 민감도를 **자동으로 낮춘다**. 기존 `canReadCost` 게이트만 유지하면 된다.
(INDIVIDUAL 에서는 기존 게이트가 그대로 유효하다.)

**⚠ N1 과 §6-4 불변식 #3 의 충돌 해소 (명시적 결정):**
불변식 #3 은 "LEVEL_BAND 응답의 `JSON.stringify` 에 `'salary'` 가 등장하지 않는다"인데,
`getPortfolioDashboard` 는 #12 에 따라 `salaryBuckets`·`totalSalary`·`members[].salary` 를 계속 내려보낸다.
→ **불변식 #3 의 검사 대상에서 `getPortfolioDashboard`(#12)·`getProjectCostSummary`(#13) 를 의도적으로 제외한다.**
검사 대상은 **#1~#11 뿐**이며, 이는 "개인 원시 급여를 내려보내는 경로"와 정확히 일치한다.
(§6-4 #3 에 이 제외를 명기했다. 제외를 적지 않으면 검증자가 #12 를 위반으로 오판한다.)

**⚠ 급여 히스토그램 게이팅이 프로젝트/전사에서 갈리는 문제 [결정]:**

| 지점 | 데이터 | 이번 조치 |
|---|---|---|
| **프로젝트** 급여 히스토그램 (#7 `getChartData(salary)`) | `ProjectUsersQuery.GET_SALARY` → **`projectusers.salary` 원시값** 분포. `summary.{min,max}` 는 **문자 그대로 개인 금액** | **LEVEL_BAND 에서 `denied`**(#11) |
| **전사** 급여 히스토그램 (`utils/portfolioAggregate.js:100-116` `salaryHistogram`, 렌더 `widgets/PortfolioSalaryHistogram.jsx:11-16`) | `getPortfolioDashboard.projects[].members[].salary` 를 `accountId` 로 **dedup 후 버킷팅**(`:106`). **버킷 count 만 출력**하고 min/max/개별값은 내보내지 않음(`:111-117`) | **변경 없음** |

**게이팅이 갈리는 것은 의도적이며, 데이터 성격이 실제로 다르기 때문이다:**
1. **입력이 다르다.** 프로젝트 히스토그램은 **개인 원시 투입급여**를 읽는다(정책 파생이 아니다 —
   `GET_SALARY` 는 `EffectiveSalary` 를 거치지 않는 §0-1 의 독립 경로다). 전사 히스토그램은
   **이미 정책이 적용된 `members[].salary`** 를 읽는다. LEVEL_BAND 에서 전사 히스토그램의 입력은
   전부 **대표값 파생**이라 개인 금액이 아니다.
2. **출력이 다르다.** 프로젝트 히스토그램은 `summary.{min, max, avg, median}` 을 **그대로 응답에 싣는다** —
   `min`/`max` 는 정의상 특정 개인의 금액이다. 전사 히스토그램은 `{bucket, count}` 만 낸다.
3. **LEVEL_BAND 에서 전사 히스토그램은 사실상 "등급 분포"가 된다.** 대표값이 등급 수만큼의 이산값이므로
   버킷 카운트는 등급별 인원 분포와 같고, 이는 등급 페이지에서 이미 공개된 정보의 함수다.

→ **전사 히스토그램은 조치 불필요.** 단 이 판단은 §5-3 #12 에 종속된다(#12 를 뒤집으면 함께 재검토).
   [P2 UX 개선, 이번 범위 밖] LEVEL_BAND 에서 위젯 제목을 "급여 구간 분포" → "등급 밴드 분포"로
   바꾸면 의미가 더 정확해진다. 기능적 필요는 없다.

**⚠ #3 `getUserInfo` — 서비스 내부 소비자 함정 (CLAUDE.md 2026-07-13 교훈 재발 지점):**
`getUserInfoService` 는 프론트뿐 아니라 **`src/permission/PrincipalResolver.js:209, 235`** 가 직접 호출한다
(권한 판정마다). 여기에 정책 조회를 넣으면 **모든 권한 판정에 KVS 왕복이 추가**된다 — 절대 금지.
→ **게이팅은 `UserController.js:42-44` 의 정의부에서 한다:**
```js
guardedDefine(resolver, 'getUserInfo', async ({ payload, context }) => {
    const res = await getUserInfoService({ ...payload, accountId: context?.accountId });
    if (canShowIndividualSalary(await resolveSalaryPolicySafe())) return res;
    return { ...res, rows: (res?.rows ?? []).map(({ salary, ...rest }) => rest) };
});
```
서비스는 **무변경** → `PrincipalResolver` 무영향.

### 5-4. 엑셀 업로드 `Salary` 헤더 — **무시(현행 유지)** [결정]

**결정: 무시.** 경고도 거부도 하지 않는다.

**이유:**
1. 파서가 애초에 `Salary` 컬럼을 읽지 않는다(§0-3). "무시"가 이미 현재 동작이며, 코드 변경이 0이다.
2. "거부"는 기존 업로드 템플릿(다운로드 산출물 재업로드)을 깨뜨린다 — 정책과 무관한 회귀.
3. "경고"는 파서에 헤더 스캔 로직을 새로 넣어야 하는데, 얻는 것이 없다(값이 저장되지 않으므로 위험이 없다).

**단, 방어는 남긴다 (P1):**
- `downloadExcel` 은 LEVEL_BAND 에서 `Salary` 컬럼을 **제외**한다(#4) → 재업로드 파일에도 없다.
- `UserService.js` 업로드 파서에 주석으로 규약을 명문화하고, 계약 테스트로 못 박는다:
  `SalaryPolicyLeak.test.js` — "업로드 items[] 에 salary 키가 없다"(향후 Salary 파싱 추가 시 정책 가드 없이 들어오는 것을 차단).

### 5-5. 누출 방지 테스트 — 기존 관례 준수

기존 4종의 관례를 확인했고 그대로 따른다:

| 기존 테스트 | 관례 | 이번에 차용할 곳 |
|---|---|---|
| `ResourceSalaryLeak.test.js` | 픽스처에 금지 키를 **심고**, 실서비스를 호출해 응답 **전체를 재귀 스캔**(`findForbiddenKeys`, `:77-85`) + 정상 필드 존치 단언(과잉삭제 방어) | user 목록/상세 |
| `ProjectUsersSalaryLeak.test.js` | mock 없는 **SQL 문자열 계약 테스트** (`not.toMatch(/\bsalary\b/)` + 과잉삭제 방어 컬럼 존재 단언 + 플레이스홀더 개수) | 신규 쿼리 없으므로 해당 없음 |
| `SalaryChartGate.test.js` | principal 매트릭스 + **레포지토리가 호출조차 안 됐음**(`not.toHaveBeenCalled()`) 단언 | #11 salary 차트 |
| `PortfolioCostGate.test.js` | 키 부재 + `JSON.stringify` 문자열 검사 + **루트 키 집합 parity** + 허용 principal 무회귀 | 전 지점 |
| `teamScopeLeak.test.js`(프론트) | **런타임 + 정적 2부 구성** — 아래 별도 서술 | 프론트 §7-4 (**정적부의 헬퍼 2개만**) |

**⚠ `ResourceSalaryLeak.test.js` 금지 키 집합 주의:**
원본의 `FORBIDDEN_COST_KEYS` 는 `{'salary', 'totalSalary', 'rate'}` 다(`:75`).
`rate`(단가)는 **자원관리 DTO 고유 필드**이므로 user 목록/상세에 차용할 때는 **제외**한다.
이번 신규 테스트의 금지 키는 `{'salary', 'annual_salary', 'annualSalary', 'total_salary', 'totalSalary'}` 로 정의한다.

**⚠ `teamScopeLeak.test.js` 의 실제 구성 (설계 초안의 서술을 정정한다):**

| 범위 | 성격 | 내용 |
|---|---|---|
| `:1-207` (**약 62%**) | **런타임 누출 테스트** | salary 픽스처(`:32-40`)를 심고 `teamMetricsByTeam`/`rollupTeamTree` 를 실제로 돌려, 비가시 팀의 MD·인건비가 어느 행에도 섞이지 않음을 단언(`:64-70`, `:109-113`). 스코프 미전달 시 `throw` 도 단언(`:130-143`) |
| `:216-338` | **정적 소스 검사** | 금지 패턴은 **`salary` 가 아니다.** 실제로 금지하는 것은 ① `aggregateByTeam(` **직접 호출**(`:254-262`) ② `rollupTeamTree`/`teamMetricsByTeam` 호출 시 **scope 인자 누락**(`:264-277`) |

→ **이번에 차용하는 것은 정적부의 두 헬퍼뿐이다:**
`collectJs` 재귀 파일 수집(`:237-250`)과 **대상 0건 방어**(`:279-284` — "경로 오타로 검사가 조용히 0건이 되면
통과해 버린다"는 교훈). 금지 패턴·검사 대상은 §7-4 에서 **새로 정의**하며, 원본의 `aggregateByTeam` 규칙과는 무관하다.
또한 `:211-215` 의 경고("초안의 넓은 범위가 정상 소비처를 전부 위반으로 만들었다")를 §7-4 의 **제외 영역 결정 근거**로 인용한다.

**신규 테스트 파일:**
- `src/resolver/__test__/SalaryPolicyLeak.test.js` — 정책 LEVEL_BAND 로 #1·#2·#3·#4·#6·#9·#10·#11 을 호출해
  `JSON.stringify` 에 `'salary'`/`'Salary'` 미포함 + INDIVIDUAL 무회귀(값이 그대로 있음) 양방향 단언.
- `src/resolver/projectCost/__test__/SalaryPolicy.test.js` — 순수 함수 + LEVEL_BAND 환산.
- `static/ui/src/components/salary/__test__/salaryRenderGuard.test.js` — 정적 검사(§7-4).

---

## 6. 경계면 계약 (F) — **구현의 단일 진실 원천**

> `responseWrapper` 는 서비스 반환을 `{success:true, ...result}` 로 **루트에 spread** 한다.
> 아래 shape 은 프론트가 실제로 받는 최종 형태다.

### 6-1. 설정 / 등급 (신규 resolver 0개 — 전부 기존 확장)

| resolver | 입력 | 성공 응답 shape (글자 그대로) | 프론트 소비 |
|---|---|---|---|
| **`getSettingData`** (기존, 필드 1 추가) | `{}` | `{ success:true, currency, hourRate, utilizationUnderBand, utilizationOverBand, utilizationRedBand, scopeTodoAmberRatio, scopeTodoRedRatio, progressThreshold, salaryPolicy: 'INDIVIDUAL'\|'LEVEL_BAND' }` — **`salaryPolicy` 는 항상 존재**(DEFAULT_SETTINGS 병합) | `useSalaryPolicy()` / `settingKeys.detail()` |
| **`updateSetting`** (기존, 입력 1 추가) | `{ salaryPolicy?: 'INDIVIDUAL'\|'LEVEL_BAND', ...기존 필드 }` (미전달 필드는 미변경) | `{ success:true, content:{ settings:{ ...전체 settings, salaryPolicy } } }` | `SalaryPolicySetting.jsx` → `onSettingsUpdated(res.content.settings)` |
| **`getLevelList`** (기존, 필드 3 추가) | `{}` | `{ success:true, data:[ { id, name, description, salaryMin:number\|null, salaryMax:number\|null, salaryRepresentative:number\|null } ] }` — **미입력은 `null` 로 정규화해 내려준다**(프론트에 `undefined` 를 보내지 않는다) | `useLevelList` / `backofficeKeys.levels()` |
| **`findLevelById`** (기존, 필드 3 추가) | `{ id }` | `{ success:true, data:{ id, levelData:{ name, description, salaryMin:number\|null, salaryMax:number\|null, salaryRepresentative:number\|null } } }` | `useLevelEditModal` / `backofficeKeys.findLevels(id)` |
| **`addLevel`** (기존, 입력 3 추가) | `{ name, description, salaryMin?:number\|null\|'', salaryMax?:..., salaryRepresentative?:... }` | `{ success:true, data:{ id, LevelData } }` (기존 유지) | `useLevelRegistrationModal` |
| **`updateLevel`** (기존, 입력 3 추가) | `{ id, name, description, isNameChanged, salaryMin?, salaryMax?, salaryRepresentative? }` | `{ success:true, data:{ id, data } }` (기존 유지) | `useLevelEditModal` |

**밴드 입력 규약(양방향):** 프론트는 미입력을 `''` 또는 `null` 로 보내도 된다.
서버가 `toBand()` 로 정규화해 **속성 자체를 생략**한다(§3-2). 프론트는 `undefined` 를 보내지 않는다.

**신규 에러 코드** (`src/utils/errors/ErrorCodes.js`):
- `SETTING_SALARY_POLICY_INVALID` — `salaryPolicy` 가 도메인 밖
- `LEVEL_SALARY_BAND_INVALID` — `min > max` 또는 음수
- `SALARY_POLICY_LEVEL_BAND` — LEVEL_BAND 에서 개인 급여 write 시도

### 6-2. 사용자 (LEVEL_BAND 에서 shape 변화)

| resolver | 입력 | INDIVIDUAL 응답 | LEVEL_BAND 응답 |
|---|---|---|---|
| **`getUserListWithPaging`** | `{ page, size, searchParams }` | `{ success:true, salaryPolicy:'INDIVIDUAL', content:[ { userId, userName, userAvatarUrls, roleKey, roleName, levelKey, levelName, permissionKey, permissionName, teamKey, teamName, salary:number\|null, createdAt } ], page:{...기존} }` | `{ success:true, salaryPolicy:'LEVEL_BAND', content:[ { userId, userName, userAvatarUrls, roleKey, roleName, levelKey, levelName, permissionKey, permissionName, teamKey, teamName, levelBand:{min:number\|null,max:number\|null}\|null, createdAt } ], page:{...기존} }` |
| **`findUserByAccountId`** | `{ accountId }` | `{ success:true, salaryPolicy:'INDIVIDUAL', ...기존 DTO(salary 포함) }` | `{ success:true, salaryPolicy:'LEVEL_BAND', ...기존 DTO에서 salary 키 제거, levelBand:{min,max}\|null }` |
| **`getUserInfo`** | `{}` (accountId 는 context 강제) | `{ success:true, rows:[{ ...users 전 컬럼(salary 포함) }], rowsAffected }` | `{ success:true, rows:[{ ...salary 키 제거 }], rowsAffected }` |
| **`downloadExcel`** | `{ searchParams? }` | `{ success:true, filename, fileBase64, total }` — 시트에 `Salary` 컬럼 있음 | 동일 shape, 시트에서 **`Salary` 컬럼 제외** |
| **`updateUser`** | `{ id, roleKey?, levelKey?, permissionKey?, salary?, teamKey?, droppedFields? }` | `{ success:true, content:{ droppedFields:[] } }` | `{ success:true, content:{ droppedFields:['salary'] } }` — salary 저장 안 함 |

**⚠ 계약 불변식 — `salary` / `levelBand` 는 상호배타적이고, `?? 0` 으로 채워선 안 된다.**
`salary` 키의 **부재 자체가 "정책상 제공 안 됨"의 신호**다. 프론트가 `row.salary ?? 0` 을 쓰면
"연봉 0원"이라는 거짓이 된다. `PortfolioFilterBar.jsx:124` 주석이 이미 같은 함정을 기록하고 있다
(`p.totalSalary ?? 0` 이 서버가 지운 키를 0 으로 만들어 버린 사례). **`SalaryCell` 이 이 규칙의 유일한 구현부다**(§7-4).
`salaryPolicy` 는 **두 모드 모두에 항상 존재**한다(루트 키 parity — `PortfolioCostGate.test.js:165` 관례).

### 6-3. 프로젝트 급여 / 비용 / 대시보드

| resolver | 입력 | INDIVIDUAL 응답 | LEVEL_BAND 응답 |
|---|---|---|---|
| **`getProjectSalaryList`** | `{ project_id, page?, pagesize? }` | `{ success:true, rows:[{ project_member_id, account_id, role_key, level_key, salary:number, salary_type:'PROJECT'\|'ANNUAL', annual_salary:number\|null, effective_salary:number, total_count:number }], meta:{ projectMonths:number, salaryPolicy:'INDIVIDUAL', unpricedMemberCount:number } }` | `{ success:true, rows:[{ project_member_id, account_id, role_key, level_key, level_band:{min:number\|null,max:number\|null,representative:number\|null}\|null, effective_salary:number, total_count:number }], meta:{ projectMonths:number, salaryPolicy:'LEVEL_BAND', unpricedMemberCount:number } }` |
| **`updateProjectMemberSalary`** | `{ project_member_id, salary?, salary_type? }` | `{ success:true, rows?, affectedRows? }` (기존) | `{ success:false, error:{ name, code:'SALARY_POLICY_LEVEL_BAND', message, cause } }` |
| **`getProjectCostSummary`** | `{ projectId, coworkerFieldId }` | 기존 shape **+ 순수 추가** `salaryPolicy:'INDIVIDUAL'`, `unpricedMemberCount:number` | 동일 shape, `salaryPolicy:'LEVEL_BAND'`. **숫자만 정책 반영** — 필드 제거 없음 |
| **`getSummaryData`** | `{ project_id }` | `{ success:true, total_member_count:number, total_salary:number, start_date, end_date, ... }` | `{ success:true, total_member_count:number, start_date, end_date, ... }` — **`total_salary` 키 없음** |
| **`getChartDataById`** / **`getChartData`** (`data_type:'salary'`) | 기존 | 기존 | `{ success:true, chartData:{ denied:true, reason:'SALARY_POLICY_LEVEL_BAND', histogram:[], summary:null, labels:[], datasets:[] } }` — `getSalaryRepository` **미호출** |
| **`getPortfolioDashboard`** | 기존 | 기존 shape **+ 순수 추가 2필드**: `salaryPolicy`(스냅샷 집계 당시 정책, `'INDIVIDUAL'\|'LEVEL_BAND'`), `costMaskedReason`(`'NONE'\|'PERMISSION'\|'SNAPSHOT_STALE_POLICY'` — **항상 존재**) | 동일 + **A안 마스킹 승격**: 스냅샷 정책 ≠ 현재 정책이면 `costMasked:true`, `costMaskedReason:'SNAPSHOT_STALE_POLICY'` 로 기존 `stripMemberCost` 경로를 탄다(§4-7-1) |

**⚠ `meta.unpricedMemberCount` 의 의미는 모드별로 다르다(의도적):**
- INDIVIDUAL: `salary_type='ANNUAL'` 인데 연봉 미등록 → 유효급여 0 인 인원 수
- LEVEL_BAND: 등급 미지정 or 밴드 미설정 → 유효급여 0 인 인원 수
둘 다 "가격이 안 매겨진 인원 수"라는 동일 개념이므로 하나의 필드로 충분하다. 프론트 문구만 분기.

### 6-4. 계약 불변식 (integration-verifier 검증 기준)

1. `getSettingData` 응답에 `salaryPolicy` 가 **항상** 존재하고 값은 `'INDIVIDUAL'`/`'LEVEL_BAND'` 둘 중 하나다.
2. `salaryPolicy === 'INDIVIDUAL'` 일 때 **§6-2·§6-3 의 모든 응답이 변경 전과 바이트 단위로 동일**하다
   (`salaryPolicy`·`unpricedMemberCount` 순수 추가 필드 제외).
3. `salaryPolicy === 'LEVEL_BAND'` 일 때 §5-3 표의 **#1~#11 응답**을 `JSON.stringify` 한 문자열에
   `'salary'`·`'Salary'` 가 **등장하지 않는다**(단 `salaryPolicy` 키 자체는 예외 — 테스트에서 그 키를 먼저 제거하고 검사).
   **⚠ 검사 대상에서 #12(`getPortfolioDashboard`)·#13(`getProjectCostSummary`)·N1(`salaryBuckets`) 은
   의도적으로 제외한다** — 이들은 정책 파생 집계라 키를 계속 내려보낸다(§5-3 의 "N1 과 불변식 #3 충돌 해소" 참조).
   제외를 모르고 검사하면 정상 동작이 위반으로 잡힌다.
4. `computeEffectiveSalary` 를 2번째 인자 `{projectMonths}` 만으로 호출하면 **기존과 완전히 동일한 값**을 낸다.
5. `getLevelList` 의 밴드 3필드는 항상 `number` 또는 `null` — `undefined` 를 내려보내지 않는다.
6. LEVEL_BAND 에서 `updateProjectMemberSalary`·`updateUser(salary)` 는 **DB 를 변경하지 않는다**.
7-A. **`costMaskedReason` 은 `getPortfolioDashboard` 의 모든 응답에 존재한다** — `costMasked === false` 여도
   `'NONE'` 을 싣고, `emptyShape()` 에도 포함한다. 루트 키 집합 parity 테스트(`PortfolioCostGate.test.js:165`)로 검증.
7-B. **권한 축과 정책 축은 독립이다.** `PROJECT_COST` read 보유자라도 스냅샷 정책이 어긋나면
   `costMasked:true` / `costMaskedReason:'SNAPSHOT_STALE_POLICY'` 다. 둘 다 걸리면 `'PERMISSION'` 이 우선한다.
7-C. **정책 컨텍스트를 받아야 하는 지점 4곳이 전부 받는다.** 함수가 두 종류이므로 grep 도 두 번 해야 한다
   (§0-1 과 동일한 분류다 — 한 함수로 뭉뚱그리면 오탐이 난다):

   | 함수 | 지점 | 파일:라인 |
   |------|------|----------|
   | `resolveMemberSalaries` | 2곳 | `ProjectCostService.js:127`(캐시 miss), `:195`(`buildByIssue`, 캐시 hit) |
   | `computeEffectiveSalary` **직접 호출** | 2곳 | `ProjectUsersService.js:175`, `PortfolioAggregator.js:308` |

   하나라도 빠지면 같은 프로젝트에서 비용 탭·급여 탭·전사 대시보드 숫자가 서로 갈린다.
   검증 시 `grep -rn "resolveMemberSalaries\|computeEffectiveSalary" src/ --include=*.js` **한 번에** 두 함수를 모두 잡을 것.

---

## 7. 프론트엔드 설계 (D)

### 7-1. 설정 페이지 '급여 정책' 카드 — 저장 경로 = **기존 `updateSetting` 확장** [결정]

**결정: 신규 resolver 를 만들지 않고 `updateSetting` 에 `salaryPolicy` 를 추가한다.**

**이유:**
1. `updateSettingService` 는 이미 **부분 갱신 패턴**(`...(x != null && { x })`)이다 — 한 줄 추가로 끝난다.
   `EtcSetting` 이 currency/hourRate 만 보내도 다른 필드가 보존되는 것과 정확히 같은 구조.
2. 요구 권한이 이미 동일하다: `updateSetting: W('SETTINGS')`. 신규 resolver 를 만들면 PermissionMap 신규 키 +
   `permissionMap.contract.test.js` 갱신 + 프론트 invalidate 경로가 하나 더 생긴다 — 순이익이 없다.
3. 응답이 `{content:{settings}}` 로 **전체 settings 를 돌려주므로** 프론트 캐시 갱신 경로
   (`SettingPage.reflectSavedSettings` → `queryClient.setQueryData(settingKeys.detail(), next)`)를 그대로 재사용한다.

**서버 검증 추가(`updateSettingService`):**
```js
if (salaryPolicy != null && salaryPolicy !== 'INDIVIDUAL' && salaryPolicy !== 'LEVEL_BAND') {
    throw new LogicalError(ErrorCodes.SETTING_SALARY_POLICY_INVALID, "salaryPolicy must be 'INDIVIDUAL' or 'LEVEL_BAND'");
}
```

**컴포넌트: `static/ui/src/backoffice/page/setting/SalaryPolicySetting.jsx`**
```
SettingPage
 ├─ <EtcSetting settings onSettingsUpdated />          (기존)
 └─ <SalaryPolicySetting settings onSettingsUpdated /> (신규 — 동일 prop 계약, 형제 카드)
      ├─ Card(title=t('setting.salaryPolicy.title'), footer=[저장])
      ├─ RadioGroup  ◉ 등급 기반(LEVEL_BAND)  ○ 인원별(INDIVIDUAL)
      ├─ 선택별 설명 2줄 (t('setting.salaryPolicy.levelBand.desc') / .individual.desc)
      ├─ [LEVEL_BAND 선택 시] 밴드 미설정 등급 경고
      │     "등급 N개에 급여 밴드가 없습니다. 해당 등급 인원의 인건비는 0으로 계산됩니다."
      └─ 우하단 링크 [등급 밴드 설정 →] → useNavigate('/backoffice/level')
```
- 밴드 미설정 등급 수는 `backofficeKeys.levels()` **캐시를 그대로 읽어** 계산한다 → **추가 네트워크 0**.
  조회 실패(권한 등) 시 경고를 **표시하지 않는다**(graceful degrade, 저장은 막지 않는다).
- 저장 버튼은 이 카드 자체의 footer. `EtcSetting` 의 저장 버튼과 독립 (각자 부분 갱신).

### 7-2. 등급 페이지 밴드 컬럼 — INDIVIDUAL 에서 **숨김** [결정]

**결정: 숨긴다**(컬럼·모달 필드 모두 렌더하지 않는다). 비활성 처리하지 않는다.

**이유:**
1. INDIVIDUAL 에서 밴드는 **어디에서도 쓰이지 않는 죽은 값**이다. 비활성으로 보여주면
   "왜 못 쓰나"를 설명하는 툴팁이 또 필요해지고, 그게 정확히 사용자가 거부한 "더러운 UI"다.
2. 등급 페이지는 원래 3열(등급/설명/작업)짜리 단순 표라 컬럼 2개 증감의 시각적 충격이 작다.
3. 값은 KVS 에 그대로 보존되므로 정책을 되돌리면 즉시 복구된다.

**숨김의 부작용 방어:** INDIVIDUAL 일 때 등급 페이지 상단에 **얇은 안내 1줄**을 둔다 —
`t('level.policy.individualNotice')` = "급여 정책이 '인원별'이라 급여 밴드는 사용되지 않습니다. [설정에서 변경 →]".
이게 "숨겨서 못 찾는" 문제를 막는다.

**변경 파일:**
- `useLevelList.js` — `useSalaryPolicy()` 로 `head.cells`·`rows[].cells` 를 조건부 구성.
  LEVEL_BAND 일 때만 `salaryBand`(범위)·`representative`(대표값) 2열 삽입 (`action` 앞).
  `<SalaryCell>` 로 렌더 (§7-4).
- `LevelRegistrationModal.jsx` / `LevelEditModal.jsx` — LEVEL_BAND 일 때만 3필드 렌더:
  `salaryMin` / `salaryMax` (Textfield type=number) + `salaryRepresentative` (Textfield + `[중앙값 계산]` 버튼).
  자동 채움은 **대표값이 비어 있을 때만**(§3-3).
- `useLevelRegistrationModal.js` / `useLevelEditModal.js` — mutation payload 에 3필드 추가,
  `isDirty` 비교 대상에 3필드 추가.
- 클라이언트 검증: `min > max` → `ErrorMessage(t('level.modal.validation.bandRange'))`, 서버 검증과 이중.

**[P2 별건]** `LevelList.jsx:9` 가 `useLevelList` 의 반환에서 `loading` 을 구조분해하는데
훅은 `isLoading` 을 반환한다(`useLevelList.js:70`) — **로딩 스피너가 영영 뜨지 않는 기존 버그**다.
밴드 컬럼 작업 중 눈에 띌 것이므로 함께 고칠 것을 권고(범위 밖, 1줄).

### 7-3. 정책 값 단일 소스 — **React Query 훅 + 기존 `settingKeys` 재사용** [결정]

**결정: Zustand 스토어를 새로 만들지 않는다.** 신규 훅 `useSalaryPolicy()` 를 만들고,
내부 쿼리키는 **기존 `settingKeys.detail()`**(`utils/queryKey/logicalAuditKeys.js:13-16)를 **그대로 재사용**한다.

**이유:**
1. `salaryPolicy` 는 **서버 상태**이고 이미 React Query 로 관리되는 `settings` 레코드의 한 필드다.
   Zustand 로 빼면 settings 의 **세 번째 사본**(인라인키 캐시 / settingKeys 캐시 / store)이 생긴다.
2. `usePermissionStore` 와 성격이 다르다 — 권한은 앱 부팅 시 1회 로드 후 세션 내 불변이지만,
   정책은 같은 세션에서 관리자가 바꾸고 즉시 반영돼야 한다(invalidate 가 필요).
3. `settingKeys.detail()` 재사용 = 이미 그 키를 쓰는 3개 화면(`SettingPage`, `ProjectCalender`,
   `useProjectResourceMembers`)과 캐시를 공유 → **추가 네트워크 0**. 신규 쿼리키 팩토리를 만들지 않는다.

**`static/ui/src/hooks/useSalaryPolicy.js` (신규):**
```js
export const useSalaryPolicy = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: settingKeys.detail(),                    // ← 기존 팩토리 재사용. 신규 키 없음
        queryFn: async () => {
            const r = await invoke('getSettingData');
            if (!r?.success) throw new Error(r?.error?.message ?? 'getSettingData failed');
            const { success, ...setting } = r;
            return setting;
        },
        staleTime: 10 * 60 * 1000,                         // SettingPage 와 동일
    });

    // ⚠ 프론트 fail-close: 로딩 중·실패면 policy=null → 급여를 **렌더하지 않는다**.
    //   서버가 이미 안 내려주므로 이중 방어다. 절대 INDIVIDUAL 로 낙관 폴백하지 않는다.
    const policy = (isLoading || isError || !data) ? null
        : (data.salaryPolicy === 'LEVEL_BAND' ? 'LEVEL_BAND' : 'INDIVIDUAL');

    return {
        policy,
        isLevelBand: policy === 'LEVEL_BAND',
        showIndividualSalary: policy === 'INDIVIDUAL',     // null 이면 false = 숨김
        isPolicyLoading: policy === null,
    };
};
```

**[P2 권고, 이번 필수 범위 아님]** §0-5 의 인라인 `['getSettingData']` **15곳을 `settingKeys.detail()` 로 통일**.
지금은 그 15곳이 salary 를 렌더하지 않으므로 정책 정합성 문제가 없지만, 캐시가 갈려 있으면
언젠가 같은 함정을 밟는다. 별도 정리 작업으로 분리한다(이번 기능의 리스크를 늘리지 않기 위해).

### 7-4. 조건부 렌더를 몰아넣을 곳 — **급여 전용 공용 컴포넌트 2개** (사용자 명시 요구 "UI/UX 더럽지 않게")

**핵심 규칙: `salary` 금액을 렌더하거나 입력받는 JSX 는 아래 두 컴포넌트뿐이다.**
호출부에는 `if (isLevelBand)` 가 **한 줄도 들어가지 않는다.**

**① `static/ui/src/components/salary/SalaryCell.jsx` — 표시 전용**
```jsx
<SalaryCell amount={row.salary} band={row.levelBand} />
```
| 정책 | amount/band | 렌더 |
|------|------------|------|
| `null`(로딩/실패) | — | 빈칸(스켈레톤). **금액을 절대 안 그린다** |
| INDIVIDUAL | amount 있음 | `formatNumber(amount)` |
| INDIVIDUAL | amount 없음 | `-` |
| LEVEL_BAND | band 있음 | `3,000~3,800만` (범위만. **대표값은 여기 안 쓴다**) |
| LEVEL_BAND | band 없음 | `-` + 경고 툴팁 `t('salary.warn.noBand')` |

- 내부에서 `useSalaryPolicy()` + `useI18nStore` 를 직접 읽는다(호출부가 정책을 몰라도 됨).
- **`?? 0` 을 하지 않는다** — §6-2 불변식의 유일한 구현부다.
- 등급 페이지 대표값 열은 `<SalaryCell amount={row.salaryRepresentative} />` 로 재사용(정책이 이미 LEVEL_BAND 이므로
  대표값은 그냥 금액이다). → 별도 variant prop `mode="plain"` 을 둬서 정책 분기를 우회하게 한다.

**② `static/ui/src/components/salary/SalaryField.jsx` — 입력 전용**
```jsx
<SalaryField value={editValues.salary} onChange={(n) => setEditValues(p => ({...p, salary: n}))} />
```
- INDIVIDUAL → 기존 `Textfield` + `formatNumber`/`parseNumber` + `HelperMessage(t('cost.salaryBasis.help'))` 그대로.
- LEVEL_BAND → **`null` 을 반환**(필드 자체가 사라진다). 모달 상단에 안내 1줄
  `t('user.policy.levelBandNotice')` = "급여 정책이 '등급 기반'이라 개인 연봉은 입력·표시되지 않습니다."
- 로딩(`policy === null`) → 필드 비활성 + 스켈레톤.
- **교체 대상 블록(실측 라인 — 종료 라인 주의):**
  - `UserEditModal.jsx` **`:212-230`** — `{/* Salary */}`(212) ~ `)}`(230). `{!isTeamLeadOnly && (` 로 감싼
    조건부 블록이므로 **230 을 빠뜨리면 JSX 가 깨진다**(닫는 `)}` 가 남는다).
  - `UserRegistrationModal.jsx` **`:144-163`** — `<Field name="salary" …>`(144) ~ `</Field>`(163).
  → 두 모달에 정책 분기가 **0줄**.

**정적 검사 테스트 `static/ui/src/components/salary/__test__/salaryRenderGuard.test.js`**

관례는 `teamScopeLeak.test.js:216-338` 의 **정적 검사 블록**에서 두 가지만 차용한다(§5-5 참조):
`collectJs` 재귀 수집 헬퍼(`:237-250`)와 **대상 0건 방어**(`:279-284`). 금지 패턴 자체는 새로 정의한다.

**검사 대상 디렉터리 [결정] — 개인 금액을 렌더하는 영역만 검사한다:**
```js
const TARGETS = [
  'backoffice/page/user',            // 개인 연봉 목록·모달
  'backoffice/page/level',           // 밴드/대표값
  'pages/projectDetail/salary',      // 급여 관리 탭
];
// 금지: /\brow\.salary\b/, /\beditValues\.salary\b/, /formatNumber\([^)]*salary/i
// 제외: components/salary/SalaryCell.jsx, SalaryField.jsx (유일한 구현부)
// ⚠ 대상이 0개면 자동 통과하므로 targets.length > 0 을 반드시 함께 단언한다
```

**⚠ 의도적 제외 영역과 그 근거 (검사 밖이라는 사실을 명시한다):**

| 제외 영역 | 렌더하는 값 | 제외 근거 |
|---|---|---|
| `pages/resource/teamAnalytics/**` (약 6지점) | `getPortfolioDashboard.projects[].members[].salary` 롤업 | **개인 원시값이 아니다.** LEVEL_BAND 에서는 대표값 파생이라 §5-3 #12 근거가 그대로 적용된다. 게이트는 이미 `costMasked`·`canReadReport` 로 존재하며(§7-6), 이 영역의 안전성은 **정적 검사가 아니라 §11 A10(서버 정책 주입)이 보장한다** |
| `pages/portfolio/**` (약 14지점) | `totalSalary` / `members[].salary` | 동일. 여기에 정적 금지 패턴을 걸면 **정상 소비처 20여 곳이 전부 위반으로 잡힌다** — `teamScopeLeak.test.js:211-215` 가 기록한 실패(초안의 넓은 범위가 정상 소비처를 전부 위반으로 만든 사건)를 그대로 반복하게 된다 |

> **즉 이 정적 검사는 "개인 원시 급여가 새 화면으로 번지는 것"만 막는다.** 파생 집계 경로의 안전은
> 서버(A10)가 책임지며, 그 검증은 §11 Phase C 4항(성능·정책 주입 확인)과 §7-6 의 의존 관계 명시로 대신한다.
> 검사 범위를 넓히는 대안은 **채택하지 않는다** — 오탐 20건이 테스트를 무력화한다.

### 7-5. 급여 관리 탭(`SalaryManagementPage.jsx`) — LEVEL_BAND 읽기 전용 뷰

| 열 | INDIVIDUAL(기존) | LEVEL_BAND |
|----|-----------------|-----------|
| 사용자 | UserAvatar | 동일 |
| 연봉 | `annual_salary` 읽기 | **열 제거** |
| 계산 모드 | InlineEdit Select | **열 제거** (모드가 무의미) |
| 투입 급여 | InlineEdit Textfield | **열 제거** |
| 등급 밴드 | — | **신규 열** `<SalaryCell band={row.level_band} />` |
| 유효 인건비 | `effective_salary` 읽기 | 동일(값은 대표값 파생) |

- 헤더의 `projectMonths` + InfoTip 은 유지. InfoTip 문구만 정책별 분기(`salary.meta.help` / `salary.meta.helpLevelBand`).
- LEVEL_BAND 에서는 `updateMutation` 을 **호출하지 않는다**(InlineEdit 자체가 없음). 서버 거부는 이중 방어.
- `meta.unpricedMemberCount > 0` 이면 상단 `SectionMessage(warning)` — `salary.warn.unpriced`.
- 기존 `hasNoPeriod` 경고는 그대로(두 모드 공통).

### 7-6. 그 외 소비 지점

#### (a) 작업 대상

| 파일:라인 | 변경 | 우선 |
|------|------|------|
| `UserListPaging.jsx:32, :73` | 헤더 라벨을 정책별로(`user.table.header.salary` / `.salaryBand`), 셀을 `<SalaryCell amount={row.salary} band={row.levelBand}/>` 로 교체 | P0 |
| `SummaryPanel.jsx` **`:30-32`(계산) + `:39`(렌더)** | `:32` `formatNumber(data?.total_salary)` 가 키 부재를 `formatNumber(undefined)` 로 흘린다 → **키 부재를 '미제공'으로** 판정(`data.total_salary === undefined`). `:39` 의 `<KpiTile label={…title.cost} value={totalSalary} …/>` 를 **LEVEL_BAND 에서 렌더하지 않는다**. ⚠ `:39` 가 실제 제거 대상이므로 **`:30-32` 만 보고 작업하면 KpiTile 이 남아 빈 값이 그려진다** | P1 |
| `AddChartModal.jsx:24-25` | 기존 `canReadCost || x.key !== 'salary'` 필터에 `&& !isLevelBand` 추가 → LEVEL_BAND 에서 급여 위젯 자체를 목록에서 제거 | P1 |

#### (b) 팀 분석 프론트 — **코드 변경 0, 그러나 A10 에 전적으로 의존한다** ⚠

RFC-175/176 이 `getPortfolioDashboard.projects[].members[].salary` 를 **프론트에서 팀별로 롤업해 렌더**하는
경로를 추가했다. 이 경로에는 **정책 분기가 한 줄도 없다.**

| 파일:라인 | 렌더 내용 | 현행 게이트 |
|---|---|---|
| `pages/resource/teamAnalytics/TeamKpiRow.jsx:120` | 팀 인건비 KPI (`₩…M`) | `!costMasked`(`:119`) + `canReadReport && !costMasked`(`:71`, `:98`) |
| `pages/resource/teamAnalytics/charts/TeamRollupTable.jsx:87, :134-136` | 직속/누적 인건비 병기 컬럼 | `canReadReport && !costMasked` |
| `pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:60, :87, :125` | 팀별 인건비 비교 막대(`TEAM_COST_AXIS`) | `availableTeamAxes(costMasked)`(`:60`), `resolveTeamAxis(rawAxis, costMasked)`(`:66`) |
| `utils/team/teamMetrics.js:174` | `salary: isNum(m?.salary) ? m.salary : null` ← **서버 members[].salary 를 행으로 수신하는 진입점** | 없음(순수함수) |
| `utils/team/teamMetrics.js:241, :342, :445, :486` / `:364 TEAM_COMPARISON_AXES` / `:372 TEAM_COST_AXIS='salary'` / `:385 availableTeamAxes` | 팀 그룹핑·트리 롤업 합산 | — |
| `utils/team/teamAnalyticsFields.js:18` | `ADDITIVE_SUM_FIELDS` 에 `'salary'` 포함 | — |

**의존 관계 (구현자·검증자 필독):**
> 이 6개 지점의 값은 **전적으로 §11 A10(`PortfolioAggregator` 정책 주입)의 산출물**이다.
> **A10 이 누락되거나 잘못 구현되면, 팀 분석 KPI·롤업 테이블·비교 막대에 개인 연봉 파생 숫자가
> 그대로 렌더된다.** 프론트에는 이를 막을 방어가 없다 — `costMasked` 는 *권한* 게이트이지 *정책* 게이트가 아니다.
>
> 따라서 **A10 은 프론트 작업이 0건이라는 이유로 우선순위를 낮추면 안 된다.** P0 이며 리스크 '상'이다.
> 검증 시 LEVEL_BAND 로 스냅샷을 재집계한 뒤 `TeamKpiRow` 의 인건비가 대표값 파생인지 확인할 것.

`teamMetrics.js:173-174` 는 이미 `?? 0` 을 쓰지 않는다(`isNum(m?.salary) ? … : null`, 주석에 근거 명시).
**이 파일은 손대지 않는다** — 이미 §6-2 불변식을 지키고 있다.

#### (c) 포트폴리오 위젯의 `?? 0` — **고치지 않는다 (코드 변경 0건)** [결정, 실측 근거]

§6-2 에서 "`salary` 키 부재를 `?? 0` 으로 채우면 거짓이 된다"고 못 박았고, A안(§4-7-1) 채택으로
`costMasked` 승격 경로가 새로 생겼으므로 **"₩0 이 그려지는 것 아니냐"** 는 우려가 정당하다.
**`costGating.js` 를 실측한 결과 그렇지 않다.** 아래가 근거다.

**`?? 0` 이 발동하는 조건은 두 가지뿐이다:**
1. 서버가 `salary` 키를 지운 경우 = **`costMasked === true` 응답**(`stripMemberCost`, `PortfolioDashboardService.js:98-101`).
   A안으로 `SNAPSHOT_STALE_POLICY` 경로가 추가돼 이 조건에 **도달하는 빈도가 늘어난다.**
2. LEVEL_BAND 자체로는 발동하지 **않는다** — §5-3 #12 에 따라 키가 그대로 오기 때문이다(값만 대표값 파생).

**그런데 조건 1에서도 `0` 은 화면에 도달하지 못한다.** `costGating.js` 가 **값이 아니라 UI 요소를 제거**하기 때문이다
(그 파일 `:50-51` 주석이 정확히 이 이유를 적어 두었다 — *"0원 기준이면 초록불 오신호가 된다. 값을 가리는 것보다 위험해 컬럼째 뺀다"*).

| `?? 0` 지점 | `costMasked=true` 시 화면 도달 | 차단 지점 (실측) |
|---|---|---|
| `portfolioAggregate.js:37` (`summarizeSelection.totalSalary`) | ✗ | `PortfolioFilterBar.jsx:128` `showSalaryChip(costMasked) &&` → 칩 미렌더 |
| `portfolioAggregate.js:91` (프로젝트 행 `totalSalary`) | ✗ | `projectTableColumnKeys(:74)` / `signalTableColumnKeys(:64)` 가 `'salary'` 키를 목록에서 제거 → `pickCells` 가 셀을 안 뽑음 |
| `portfolioAggregate.js:106` (`salaryHistogram`) | ✗ | 호출자 `PortfolioSalaryHistogram.jsx` 가 **어디에서도 import 되지 않는 고아 위젯**. 게다가 `gateSalaryBuckets(:45)` 가 buckets 를 `[]` 로 끊어 붙여도 빈 상태 |
| `portfolioAggregate.js:301, :324, :355, :373, :477` (CostTab 계산) | ✗ | `ComparisonTabs.jsx:88` `!showCostTab(costMasked)` → **CostTab 자체가 렌더되지 않고** `SectionMessage` 로 대체 |
| `PortfolioProjectTable.jsx:20, :102` | ✗ | `projectTableColumnKeys(costMasked)` (`costGating.js:74`) |
| `PortfolioTsrSignalTable.jsx:17, :153` | ✗ | `signalTableColumnKeys(costMasked)` (`:64` salary 컬럼 + `:60` Cost 신호등 `'c'` 컬럼). 정렬 가중도 `signalLevelsForSort(:85)` 로 `costLevel` 제외 |
| `PortfolioSalaryByProject.jsx:36, :65` | ✗ | **고아 위젯** — 어디에서도 import 되지 않음 |

**팀 분석도 동일하다.** `useTeamAnalyticsData.js:108` 이 같은 `isCostMasked` 를 쓰고,
`TeamKpiRow.jsx:119`(`{!costMasked && (`), `TeamRollupTable.jsx:87·:134`(컬럼 조건부 삽입),
`TeamCompareBar.jsx:60`(`availableTeamAxes(costMasked)` 가 축 목록에서 `salary` 제거)가
전부 **KPI/컬럼/축 자체를 제거**한다 — ₩0 을 그리는 경로가 없다.

**→ 결정: (i) 상위 차단 유지, `?? 0` 수정 0건.** (ii)`?? null` + `'—'` 표기는 채택하지 않는다:
이미 요소가 렌더되지 않으므로 표기를 바꿀 자리가 없고, 10여 곳을 건드리면 `costGating.js` 가 확립한
**단일 출처 원칙**(그 파일 `:4-14` 가 기록한, 인라인 게이팅이 실패했던 이력)을 다시 흩뜨린다.

**남는 조치는 A-6 하나뿐이다 — 문구 분기.**
사용자가 보는 것은 **₩0 이 아니라 빈 영역 + 안내 문구**다. 문제는 그 문구가 지금은 하나뿐이라
"권한 없음"과 "재집계 필요"가 구분되지 않는다는 것이다. `costMaskedReason` 으로 분기한다(§4-7-1, §9-7).

**⚠ 잠재 위험 기록 (이번 범위 밖, 별건 백로그):**
`PortfolioSalaryByProject.jsx` 는 **고아 위젯인데 `costGating` 을 경유하지 않는다**(`projects` 를 직접 받아
`r.totalSalary ?? 0` 을 렌더). 누군가 이 위젯을 다시 붙이면 **게이팅 없이 ₩0 이 그려진다.**
지금은 미참조라 실해가 없지만, 파일 상단에 "부활 시 `costGating` 경유 필수" 주석을 남길 것을 권고한다.
(`PortfolioSalaryHistogram.jsx` 는 `salaryBuckets` prop 이 `gateSalaryBuckets` 로 이미 끊기므로 부활해도 안전하다.)

#### (d) 변경 없음

| 파일 | 사유 |
|---|---|
| `utils/portfolio/costGating.js` | **손대지 않는다.** A안의 마스킹 판정은 전부 서버(A-4)에서 끝나고, 프론트는 기존 `costMasked` 를 그대로 소비한다 |
| `utils/team/teamMetrics.js`, `utils/team/teamAnalyticsFields.js` | 이미 키 부재를 `null` 로 다룬다(`teamMetrics.js:173-174`). 서버 값만 바뀐다 |
| `PortfolioProjectTable`·`PortfolioTsrSignalTable`·`PortfolioFilterBar`·`ComparisonTabs` 의 게이팅 로직 | 위 (c) 실측대로 이미 요소 단위 차단이 걸려 있다 |

#### (e) A-6 (P1) — **유일한 프론트 작업: `costMaskedReason` 문구 분기**

| 파일 | 변경 |
|---|---|
| `PortfolioDashboardPage.jsx` | `data?.costMaskedReason` 을 `ComparisonTabs`·`PortfolioTsrSignalTable` 에 전달(기존 `costMasked` prop 옆에 나란히) |
| `sections/ComparisonTabs.jsx:88-92` | Cost 탭 대체 `SectionMessage` 문구를 분기 — `'PERMISSION'` → 기존 `portfolio.cost.masked` **문구 유지**, `'SNAPSHOT_STALE_POLICY'` → `portfolio.cost.staleSnapshot` + 기존 수동 재집계 CTA |
| `pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:168` (`teamAnalytics.costMasked` 문구 지점) | 동일 분기 — `teamAnalytics.costMaskedStale` 추가 |

> ⚠ **A-6 을 생략하면 안 된다.** 마스킹 **동작**은 A-4 만으로 완결되지만, 사용자는 "권한이 없어서"인지
> "재집계가 안 돼서"인지 구분할 수 없다. 두 상황의 대응 행동이 완전히 다르다(관리자 문의 vs 재집계 버튼).
> 화면에 보이는 것은 ₩0 이 아니라 **빈 영역 + 안내 문구**이므로((c) 참조), 이 문구가 사실상 유일한 정보다.

### 7-7. 정책 전환 UX — **확인 다이얼로그 필수** [결정]

**필요하다.** 이유: 전환이 (a) 전사 비용 수치를 즉시 바꾸고 (b) 개인 연봉 표시를 즉시 없애며
(c) 캐시(ProjectCost 10분 / portfolio_snapshot 다음 배치) 때문에 **반영이 즉시가 아니다**.

**다이얼로그 문구는 전환 방향별로 다르게 한다:**

| 전환 | 문구 키 | 내용 |
|------|--------|------|
| → LEVEL_BAND | `setting.salaryPolicy.confirm.toLevelBand` | "개인 연봉이 화면과 API 응답에서 즉시 숨겨집니다. **저장된 값은 삭제되지 않으며 언제든 되돌릴 수 있습니다.** 인건비는 등급 대표값 기준으로 재계산됩니다. 급여 밴드가 없는 등급의 인원은 인건비 0으로 계산됩니다." |
| → INDIVIDUAL | `setting.salaryPolicy.confirm.toIndividual` | "개인 연봉이 다시 표시됩니다. 인건비가 개인 연봉·투입 급여 기준으로 돌아갑니다." |
| 공통 꼬리 | `setting.salaryPolicy.confirm.cacheNote` | "프로젝트 비용 분석은 최대 10분 후, 전사 대시보드는 다음 집계 시 반영됩니다." |

- 다이얼로그는 Atlaskit `ModalDialog`. `window.confirm` 은 쓰지 않는다(등급 삭제가 쓰긴 하지만 문구가 길다).
- 저장 성공 후:
  ```js
  queryClient.invalidateQueries({ queryKey: settingKeys.all });   // 정책 즉시 전파
  queryClient.invalidateQueries({ queryKey: ['projectCost'] });   // projectKeys.cost prefix
  queryClient.invalidateQueries({ queryKey: userKeys.all });      // 사용자 목록 shape 변경
  queryClient.invalidateQueries({ queryKey: backofficeKeys.levels() });
  ```

---

## 8. 권한 (E)

**신규 카탈로그 키 0개.** 기존 키를 재사용한다. (§0-2 의 실제 키 이름 사용)

| 동작 | 매핑 | 변경 |
|------|------|------|
| 정책 조회 | `getSettingData: 'PUBLIC'` | **변경 없음.** 정책 **모드**는 비밀이 아니다(UI 에서 어차피 드러난다). 금액은 여기 안 실린다 |
| 정책 저장 | `updateSetting: W('SETTINGS')` | **변경 없음** |
| 밴드 편집 | `addLevel`/`updateLevel`: `W('LEVEL_MANAGEMENT')` | **변경 없음** |
| 밴드 조회 | `getLevelList: OR([['LEVEL_MANAGEMENT','read'], ['USER_MANAGEMENT','read']])` | **`['SETTINGS','read']` 1개 추가** ↓ |
| 개인 급여 노출 | `PROJECT_COST` / `USER_MANAGEMENT` 기존 게이트 | **변경 없음.** 정책 게이트는 기존 권한 게이트와 **AND** 로 겹친다(둘 다 통과해야 노출) |

**`getLevelList` OR-grant 확장 근거:**
급여 정책 설정 카드가 "밴드 미설정 등급 N개" 경고를 표시하려면 등급 목록이 필요하다.
`SETTINGS` write 만 가진 커스텀 권한 세트는 현재 `getLevelList` 를 호출할 수 없다.
등급 이름·밴드는 이미 `USER_MANAGEMENT read` 로도 열려 있어 민감도가 낮으므로 확장이 정당하다.
```diff
-    getLevelList: OR([['LEVEL_MANAGEMENT', 'read'], ['USER_MANAGEMENT', 'read']]),
+    // 급여 정책 설정 카드가 "밴드 미설정 등급 수"를 계산하려면 등급 목록이 필요하다.
+    getLevelList: OR([['LEVEL_MANAGEMENT', 'read'], ['USER_MANAGEMENT', 'read'], ['SETTINGS', 'read']]),
```
**대안(확장하지 않는 안):** 경고 카운트를 생략하고 조회 실패 시 조용히 넘어간다.
→ **권고는 확장**이되, 프론트는 **어느 쪽이든 graceful degrade** 하도록 구현한다(조회 실패 = 경고 미표시, 저장은 정상).

**신규 resolver 가 0개이므로 `permissionMap.contract.test.js` 는 맵 키 추가 없이 통과한다.**
(OR-grant 배열 확장만 있으므로 등록집합↔맵키집합 대조에 영향 없음)

**서버 가드 fail-close:** §5-1 표 참조. 표시 게이팅은 실패 시 숨김, 계산은 실패 시 예외 전파.

---

## 9. i18n 키 목록

> merge 소스: `locales/kr/*.json` + `locales/en/*.json` → `cd static/ui && npm run merge`.
> `locales/script/*.json` 은 빈 스텁이라 거기 넣으면 반영 안 된다. `ko-KR.json`/`en-US.json` 직접 수정 금지.

### 9-1. `locales/kr/setting.json` (기존 파일에 `salaryPolicy` 객체 추가)
```json
"salaryPolicy": {
  "title": "급여 정책",
  "description": "인건비 산정에 사용할 급여 기준을 선택합니다. 전사에 하나의 기준이 적용됩니다.",
  "option": { "levelBand": "등급 기반", "individual": "인원별" },
  "levelBand": { "desc": "등급에 급여 범위를 매핑해 대표값으로 인건비를 계산합니다. 개인 연봉은 저장·표시되지 않습니다." },
  "individual": { "desc": "인원별로 입력한 연봉·투입 급여로 인건비를 계산합니다." },
  "link": { "level": "등급 밴드 설정 →" },
  "warn": { "missingBand": "등급 {count}개에 급여 밴드가 없습니다. 해당 등급 인원의 인건비는 0으로 계산됩니다." },
  "confirm": {
    "title": "급여 정책을 변경할까요?",
    "toLevelBand": "개인 연봉이 화면과 API 응답에서 즉시 숨겨집니다. 저장된 값은 삭제되지 않으며 언제든 되돌릴 수 있습니다. 인건비는 등급 대표값 기준으로 재계산됩니다. 급여 밴드가 없는 등급의 인원은 인건비 0으로 계산됩니다.",
    "toIndividual": "개인 연봉이 다시 표시됩니다. 인건비가 개인 연봉·투입 급여 기준으로 돌아갑니다.",
    "cacheNote": "프로젝트 비용 분석은 최대 10분 후, 전사 대시보드는 다음 집계 시 반영됩니다.",
    "confirmButton": "변경",
    "cancelButton": "취소"
  }
}
```

### 9-2. `locales/en/setting.json`
```json
"salaryPolicy": {
  "title": "Salary Policy",
  "description": "Choose the salary basis used for labor cost. One basis applies company-wide.",
  "option": { "levelBand": "Level-based", "individual": "Per person" },
  "levelBand": { "desc": "Map a salary range to each level and use its representative value for labor cost. Individual salaries are neither stored in views nor returned by the API." },
  "individual": { "desc": "Compute labor cost from each person's annual and assigned salary." },
  "link": { "level": "Configure level bands →" },
  "warn": { "missingBand": "{count} level(s) have no salary band. Members at those levels are costed as 0." },
  "confirm": {
    "title": "Change the salary policy?",
    "toLevelBand": "Individual salaries are immediately hidden from views and API responses. Stored values are not deleted and this is reversible. Labor cost is recomputed from level representative values. Members at levels without a band are costed as 0.",
    "toIndividual": "Individual salaries become visible again. Labor cost returns to the per-person annual/assigned basis.",
    "cacheNote": "Project cost analysis reflects the change within 10 minutes; the portfolio dashboard reflects it at the next aggregation.",
    "confirmButton": "Change",
    "cancelButton": "Cancel"
  }
}
```

### 9-3. `locales/kr/level.json` 추가분
```json
"table": { "header": { "salaryBand": "급여 범위", "representative": "대표값" } },
"modal": {
  "field": {
    "salaryMin": "급여 하한", "salaryMax": "급여 상한", "salaryRepresentative": "대표값",
    "representativeHint": "인건비 계산에 사용됩니다. 비워 두면 중앙값이 자동 입력됩니다.",
    "calcMedian": "중앙값 계산"
  },
  "placeholder": { "salaryMin": "예: 3000", "salaryMax": "예: 3800", "salaryRepresentative": "예: 3400" },
  "validation": {
    "bandRange": "하한은 상한보다 클 수 없습니다.",
    "bandNegative": "0 이상의 값을 입력하세요.",
    "representativeOutOfRange": "대표값이 급여 범위를 벗어났습니다. 그대로 저장할 수 있습니다."
  }
},
"policy": { "individualNotice": "급여 정책이 '인원별'이라 급여 밴드는 사용되지 않습니다.", "goSetting": "설정에서 변경 →" }
```
(en: `salaryBand`="Salary Range", `representative`="Representative", `salaryMin`="Min", `salaryMax`="Max",
`representativeHint`="Used for labor cost. Leave blank to auto-fill the midpoint.", `calcMedian`="Use midpoint",
`bandRange`="Min cannot exceed max.", `bandNegative`="Enter a value of 0 or more.",
`representativeOutOfRange`="Representative is outside the range. You can still save it.",
`individualNotice`="Salary policy is 'Per person', so salary bands are unused.", `goSetting`="Change in Settings →")

### 9-4. `locales/kr/user.json` 추가분
```json
"table": { "header": { "salaryBand": "급여 범위" } },
"policy": { "levelBandNotice": "급여 정책이 '등급 기반'이라 개인 연봉은 입력·표시되지 않습니다." }
```
(en: `salaryBand`="Salary Range", `levelBandNotice`="Salary policy is 'Level-based', so individual salary is neither entered nor displayed.")

### 9-5. `locales/kr/salary.json` 추가분
```json
"table": { "levelBand": "급여 범위" },
"warn": {
  "noBand": "등급이 지정되지 않았거나 해당 등급에 급여 밴드가 없어 인건비가 0으로 계산됩니다.",
  "unpriced": "급여 밴드가 없어 {count}명의 인건비가 0으로 계산되었습니다. 등급 관리에서 밴드를 설정하세요."
},
"meta": { "helpLevelBand": "등급 기반 = (등급 대표값 ÷ 12) × 투입 개월수. 개인 연봉·투입 급여는 사용되지 않습니다." },
"policy": { "levelBandNotice": "급여 정책이 '등급 기반'이라 개인 급여는 편집할 수 없습니다." }
```
(en 대응 키 동일 구조)

### 9-6-A. `locales/kr|en/portfolio.json` 추가분 (A-6 / B15)
```json
"cost": {
  "staleSnapshot": "급여 정책이 변경되어 이전 집계 결과의 인건비는 표시하지 않습니다. 재집계 후 확인하세요."
}
```
(en: `"staleSnapshot": "The salary policy changed, so labor cost from the previous aggregation is hidden. Re-aggregate to view it."`)
> 기존 `portfolio.cost.masked`(권한 없음) 문구는 **변경하지 않는다** — `costMaskedReason:'PERMISSION'` 경로가 그대로 쓴다.

### 9-6-B. `locales/kr|en/teamAnalytics.json` 추가분 (A-6 / B15)
```json
"costMaskedStale": "급여 정책이 변경되어 인건비 축을 표시하지 않습니다. 재집계 후 확인하세요."
```
(en: `"costMaskedStale": "Labor cost axis is hidden because the salary policy changed. Re-aggregate to view it."`)
> 기존 `teamAnalytics.costMasked` 는 유지.

### 9-6. `locales/kr/cost.json` 추가분
```json
"warn": { "unpriced": "급여 밴드가 없어 {count}명의 인건비가 0으로 계산되었습니다." },
"salaryPolicy": { "levelBand": "등급 기반", "individual": "인원별", "basis": "인건비 산정 기준" }
```

**⚠ merge 필수:** 위 파일 저장 후 `cd static/ui && npm run merge` (또는 `npm run build` 의 prebuild).

---

## 10. 마이그레이션 · 롤백 (G)

### 10-1. 기존 설치(정책 미설정) 하위호환
- **KVS 마이그레이션 불필요.** `DEFAULT_SETTINGS.salaryPolicy = 'INDIVIDUAL'` 만 추가하면
  `getSettingDataService` 의 `{...DEFAULT_SETTINGS, ...saved}` 병합이 read 시점에 자동 보충한다(§3-1).
- **급여 데이터 DB 마이그레이션 불필요.** `users`/`projectusers` 는 신규 enqueue 없음.
- **⚠ 단 A안(D8) 으로 `migrate.js` enqueue 1건이 있다** — `portfolio_snapshot.salary_policy` 멱등 ALTER(§3-5, §4-7-1 A-1).
  기존 스냅샷 행은 `NULL` 로 남고 `normalizeSalaryPolicy(null) === 'INDIVIDUAL'` 로 접히므로 **백필 불필요**.
  INDIVIDUAL 운영 중인 기존 설치는 마스킹이 발동하지 않는다(현행 동작 불변) — **LEVEL_BAND 로 전환하는 순간
  옛 스냅샷이 자동으로 불일치가 되어 가려진다**. 이것이 A안의 하위호환 경로다.
- 기존 `level` 레코드는 밴드 속성이 없다 → `getLevelListService` 가 `?? null` 로 정규화(§6-1).
  **KVS 백필 불필요.**
- `normalizeSalaryPolicy` 가 `undefined`/불명 값을 전부 `'INDIVIDUAL'` 로 접는다 → 계산 경로도 자동 하위호환.

### 10-2. `LEVEL_BAND` → `INDIVIDUAL` 되돌리기

| 데이터 | 보존 여부 | 확인 |
|--------|----------|------|
| `users.salary`(개인 연봉) | **완전 보존** — LEVEL_BAND 에서 read/write 어느 쪽도 하지 않음. `updateUser` 는 salary 를 무시할 뿐 기존 값을 덮지 않는다(`pick(salary, current.salary)` 인데 salary 를 `undefined` 로 넘기면 현재값 보존) | ⚠ **구현 주의**: `updateUserService` 에 salary 를 `null` 로 넘기면 **NULL 로 날아간다**. LEVEL_BAND 에서는 반드시 `undefined`(미전달)로 만들어야 한다 |
| `projectusers.salary`(투입급여) | **완전 보존** — 편집 거부, INSERT 쿼리 무변경 | |
| `projectusers.salary_type` | **완전 보존** | |
| `level.salaryMin/Max/Representative` | 보존 — INDIVIDUAL 에서 UI 만 숨김 | |

**되돌린 뒤 유일하게 달라지는 것:** LEVEL_BAND 기간 중 **신규 등록한 사용자**는 연봉이 없다
(입력 UI 가 없었으므로 `null`). 되돌린 뒤 그 인원만 연봉 미입력 상태다.
→ 정책 카드 확인 다이얼로그(→LEVEL_BAND)에 이 사실을 넣지 않는다(문구가 길어짐). 대신
**설계 문서와 릴리스 노트에 기재**하고, 되돌리기 다이얼로그(→INDIVIDUAL)에 한 줄 추가 권고:
"등급 기반으로 운영하는 동안 등록된 인원은 연봉이 비어 있을 수 있습니다."

**되돌리기 후 비용 수치:** `ProjectCost` 캐시는 §4-7 의 정책 대조로 즉시 무효 → 다음 조회에서 원래 숫자 복귀.
`portfolio_snapshot` 은 다음 집계까지 LEVEL_BAND 숫자가 남는다 → 수동 재집계 CTA 안내.

### 10-3. 배포 순서 (⚠ 사고 나기 쉬운 지점)

```
1) manifest.yml 에 level.salaryMin/salaryMax/salaryRepresentative + settings.salaryPolicy 선언 추가
2) forge deploy          ← 이 단계에서만 KVS 스키마가 갱신된다
3) 밴드/정책을 저장하는 코드 사용 시작
```
- **manifest 선언 없이 저장하면 KVS 가 422 semantic error** 를 던진다. `CustomEntityManager.save` 가
  `CustomEntityError.init(e)` 로 감싸 `{success:false}` 가 나가므로 조용히 실패하지는 않지만,
  "왜 등급 저장이 안 되나"로 시간을 태운다.
- **`forge tunnel` 은 스키마를 갱신하지 않는다** — 코드만 갈아끼운다. 로컬 개발 중 밴드 저장이
  422 로 실패하면 먼저 `forge deploy` 를 한 번 돌렸는지 확인할 것.
- **실무 권고: manifest 변경과 코드를 같은 커밋에 두고 `forge deploy` 한 번으로 동시 반영한다.**
  분리 배포하면 그 사이 창에서 저장이 전부 422 다.
- **롤백 시 manifest attribute 는 제거하지 않는다.** 이미 저장된 레코드가 semantic 검증에 걸릴 수 있다.
  코드만 되돌리고 선언은 남긴다(빈 속성은 무해).
- `settings.salaryPolicy` 도 **string attribute 선언이 필요하다** — 잊기 쉽다(기존 settings 는 이미
  11개 attribute 를 선언 중이므로 여기에 12번째를 추가).

---

## 11. 구현 작업 분해 (H)

> 순서: **백엔드 전부 → 프론트** (경계면 계약 확정 후 프론트 착수). 난이도 하/중/상, 리스크 하/중/상.
>
> 🔴 **구현 범위 = P0 + P1 (사용자 확정 D7).** 표의 **P2 항목은 전부 이번 범위 밖**이며 착수하지 않는다.
> 기록 목적으로 표에 남겨두되 "범위 밖" 표기를 달았다. 별건 백로그로 분리한다.
>
> ✅ §4-7-1 **A안 확정(D8)** 이 아래 표에 반영돼 있다 — 백엔드 **A20~A24**(P0 5건, A-1·A-2·A-3·A-4/A-5·A-7),
> 프론트 **B15**(P1, A-6). 기존 B13(C안 배너)은 **폐기**됐다.

### Phase A — 백엔드 (backend-engineer)

| # | 우선 | 작업 | 난이도 | 리스크 | 비고 |
|---|------|------|--------|--------|------|
| A1 | **P0** | `manifest.yml` — `level` 3속성 + `settings.salaryPolicy` 선언 (§3-4) | 하 | **중** | 배포 순서 위반 시 전부 422 |
| A2 | **P0** | `SettingDefaults.js` — `salaryPolicy:'INDIVIDUAL'` 추가 | 하 | 하 | 하위호환의 전부 |
| A3 | **P0** | `SalaryPolicy.js` 신규(순수) + `__test__/SalaryPolicy.test.js` | 중 | 하 | Forge import 금지 |
| A4 | **P0** | `EffectiveSalary.js` — 기본 인자 방식 확장(§4-2, §4-3). **기존 테스트 무수정 통과가 게이트** | 중 | **상** | 무회귀 핵심. 기존 5줄 물리적 무수정 |
| A5 | **P0** | `SalaryPolicyContext.js` 신규 로더(§4-4) | 중 | 중 | INDIVIDUAL 에서 getLevelList 미호출(직렬 의도) |
| A6 | **P0** | `SalaryVisibility.js` 신규(§5-1) — `CostAccess.js` 형태 복제 | 하 | 하 | 표시/계산 fail 분기 주석 필수 |
| A7 | **P0** | `SettingService.js` — `salaryPolicy` 부분 갱신 + 도메인 검증 | 하 | 하 | |
| A8 | **P0** | `LevelService.js` — 밴드 3필드 CRUD, `toBand()` 속성 생략 규약, `?? null` 응답 정규화, min>max 검증 | 중 | 중 | KVS 빈 문자열 함정 |
| A9 | **P0** | `ProjectCostService.js` — 정책 주입 ×2(캐시 miss `:127` / hit `:195`) + 캐시 `salaryPolicy` 대조 무효화(§4-7) + `unpricedMemberCount` | 중 | **상** | **hit 경로 누락이 가장 흔한 사고** |
| A10 | **P0** | `PortfolioAggregator.js` — ① `aggregateAllProjects`(`:492` 부근)에서 정책 컨텍스트 **1회** 조립 → `aggregateOneProject` 로 전달 ② `:308` `computeEffectiveSalary` 에 정책 주입 ③ **`:410` `totalSalary: members.reduce(...)` 스냅샷 write 가 자동으로 대표값 파생이 되는지 확인**(N2) ④ `MEMBER_ROWS` 쿼리는 **무변경**(N3) | 중 | **상** | 프로젝트 수 × KVS 조회가 생기면 성능 사고. **§7-6(b) 팀 분석 프론트 6지점이 전적으로 이 항목에 의존한다 — 누락 시 개인 연봉 파생 숫자가 팀 KPI 에 그대로 렌더된다** |
| A11 | **P0** | `ProjectUsersService.js` — `getProjectSalaryListService` 정책 분기(rows shape ×2, meta 확장), `updateProjectMemberSalaryService` LEVEL_BAND 거부 | 중 | 중 | |
| A12 | **P0** | `UserService.js` — `mapUserRowsToDto`(#1), `findUserByAccountId`(#2), `downloadExcel`(#4), `updateUserService`(#8, **salary 를 `undefined` 로**), `addUser`(#9) | 중 | **상** | §10-2 의 `null` vs `undefined` 함정 |
| A13 | **P0** | `UserController.js` — `getUserInfo` **Controller 레이어** 게이팅(#3) | 하 | **상** | `PrincipalResolver` 내부 호출자 함정(§5-3) |
| A14 | **P1** | `ProjectDashboardService.js` — `getSummaryData` `total_salary` 키 제거(#10), salary 차트 denied(#11, 레포 미호출) | 중 | 중 | |
| A15 | **P0** | `ErrorCodes.js` — 3개 코드 추가 | 하 | 하 | |
| A16 | **P1** | `PermissionMap.js` — `getLevelList` OR-grant 에 `['SETTINGS','read']` 추가 | 하 | 하 | 계약 테스트 영향 없음 |
| A17 | **P0** | `src/resolver/__test__/SalaryPolicyLeak.test.js` 신규 — 8개 지점 × 양방향(§5-5) | 중 | 하 | 회귀 방지의 주 방어선 |
| A18 | **P1** | `PortfolioDashboardService.js` — 응답에 `salaryPolicy`(스냅샷 정책) 순수 추가 | 하 | 하 | A20 과 같은 파일 — 함께 작업 |
| **A20** | **P0** | **[A-1]** `ddl/portfolioSnapshot.sql.js` 에 `ALTER … ADD COLUMN IF NOT EXISTS salary_policy VARCHAR(20) NULL` → `ddl/index.js` re-export → `migrate.js` enqueue(v012 뒤 번호 확인) | 하 | 중 | **NULL 허용 필수** — `NOT NULL DEFAULT` 금지(§3-5) |
| **A21** | **P0** | **[A-2]** `PortfolioSnapshotQuery.js` UPSERT 3곳(컬럼목록 `:24` / VALUES / `ON DUPLICATE KEY UPDATE` `:48`) + SELECT `:73` 계열에 `salary_policy` 추가, `PortfolioSnapshotRepository.js:33` 주변 write 파라미터 추가 | 중 | **중** | `total_salary` 와 같은 자리에 끼운다. **UPSERT 3곳 중 하나만 빠져도 조용히 NULL 로 남는다** |
| **A22** | **P0** | **[A-3]** `PortfolioAggregator.aggregateOneProject` — 스냅샷 payload 에 `salaryPolicy` 포함 | 하 | 하 | A10 에서 정책 컨텍스트를 이미 받으므로 추가 조회 0 |
| **A23** | **P0** | **[A-4/A-5]** `PortfolioDashboardService.js:132-134` 마스킹 판정 확장 + `costMaskedReason` 3값 부착(**`emptyShape()`(`:121`) 포함 — 항상 존재**) | 중 | **상** | 판정 순서(권한 우선) 준수. parity 누락 시 프론트가 `undefined` 분기하게 됨 |
| **A24** | **P0** | **[A-7]** `PortfolioCostGate.test.js` 케이스 추가 — `COST_READER`(권한 보유) principal + 스냅샷 정책 불일치 → `costMasked:true`, `costMaskedReason:'SNAPSHOT_STALE_POLICY'`, `salary` 키 전멸. 루트 키 parity 재확인 | 중 | 하 | 권한 축·정책 축 독립성 증명 |
| A19 | **P0** | `npm test` 전량 — 특히 `EffectiveSalary.test.js` **무수정** 통과 확인 | 하 | 하 | |

### Phase B — 프론트 (frontend-engineer, Phase A 계약 확정 후)

| # | 우선 | 작업 | 난이도 | 리스크 |
|---|------|------|--------|--------|
| B1 | **P0** | `hooks/useSalaryPolicy.js` 신규 — `settingKeys.detail()` 재사용, 로딩=숨김 폴백(§7-3) | 하 | 하 |
| B2 | **P0** | `components/salary/SalaryCell.jsx` + `SalaryField.jsx` 신규(§7-4). **`?? 0` 금지** | 중 | 중 |
| B3 | **P0** | `SalaryPolicySetting.jsx` 신규 + `SettingPage.jsx` 에 형제 카드 추가 + 확인 다이얼로그(§7-1, §7-7) | 중 | 중 |
| B4 | **P0** | 등급 페이지 — `useLevelList`(컬럼 2개 조건부), 등록/수정 모달 3필드 + 중앙값 자동채움/버튼, min>max 검증(§7-2) | 중 | 중 |
| B5 | **P0** | `UserListPaging.jsx` / `UserEditModal.jsx` / `useUserEditModal.js` / `UserRegistrationModal.jsx` — `<SalaryCell>`·`<SalaryField>` 로 교체, 조건부 렌더 0줄 | 중 | 중 |
| B6 | **P0** | `SalaryManagementPage.jsx` — LEVEL_BAND 읽기전용 밴드 뷰(§7-5) | 중 | 중 |
| B7 | **P1** | `SummaryPanel.jsx` — `total_salary` 키 부재를 '미제공'으로(0 금지), LEVEL_BAND 에서 KpiTile 미렌더 | 하 | **중** (`?? 0` 함정) |
| B8 | **P1** | `AddChartModal.jsx` — 급여 위젯 필터에 `&& !isLevelBand` | 하 | 하 |
| B9 | **P0** | i18n — `setting/level/user/salary/cost` **+ `portfolio`·`teamAnalytics`(A-6 문구, §9-6-A·B)** kr·en 추가 → `npm run merge` | 하 | 하 |
| B10 | **P1** | `components/salary/__test__/salaryRenderGuard.test.js` 정적 검사(대상 0건 방어 포함) | 중 | 하 |
| B11 | ~~P2~~ | **[이번 범위 밖 — D7]** 인라인 `['getSettingData']` 15곳 → `settingKeys.detail()` 통일(§0-5). 별건 백로그 | — | — |
| B12 | ~~P2~~ | **[이번 범위 밖 — D7]** `LevelList.jsx` `loading` ↔ `isLoading` 기존 버그 수정(1줄). 별건 백로그 | — | — |
| ~~B13~~ | — | **폐기.** C안(배너)은 §4-7-1 에서 불채택 — **B15(A-6)로 대체됨** | — | — |
| **B15** | **P1** | **[A-6]** `costMaskedReason` 문구 분기 — `PortfolioDashboardPage.jsx`(prop 전달), `ComparisonTabs.jsx:88-92`(Cost 탭 안내), `TeamCompareBar.jsx:168`(팀 분석 안내). **마스킹 동작은 무수정, 문구만 갈린다**(§7-6(e)) | 하 | 중 |
| B14 | **P0** | `cd static/ui && npm run build` (prebuild merge 포함) 통과 | 하 | 하 |

### Phase C — 검증 (integration-verifier)

1. **§6-4 계약 불변식 7항** 교차 검증(resolver 응답 shape ↔ 프론트 invoke 소비).
2. **다중 shape 재사용 컴포넌트 점검** — `SalaryCell` 에 `amount`(개인 금액) / `band`(범위) / `mode="plain"`(대표값)
   3종이 들어간다. 각 호출부가 넘기는 필드가 그 shape 의 생산 코드와 일치하는지 전수 대조
   (CLAUDE.md 2026-07-22 교훈: 양쪽이 계약을 지켜도 재사용 지점에서 결함이 난다).
3. **서비스 내부 소비자 점검** (CLAUDE.md 2026-07-13 교훈) — `src/` 전역 grep 으로 전수 확인:
   - `getUserInfoService` → `PrincipalResolver.js:209, :235` (게이팅이 Controller 에만 있는지)
   - `getSummaryDataService` → `ProjectCostService:95`, `ProjectUsersService:170` 이 `start_date`/`end_date` 만 소비하는지
   - **`resolveMemberSalaries`(2곳) + `computeEffectiveSalary` 직접 호출(2곳)** — §6-4 #7 의 표 그대로.
     **두 함수를 한 번에 grep 할 것**(한 함수만 보면 2곳을 놓친다)
4. **팀 분석·포트폴리오 파생 경로 실물 확인** (§7-6(b)) — LEVEL_BAND 로 스냅샷을 재집계한 뒤
   `TeamKpiRow`/`TeamRollupTable`/`TeamCompareBar` 의 인건비가 **대표값 파생인지** 확인.
   프론트 코드 변경이 0건이라 **A10 이 잘못되면 여기서만 드러난다**.
5. **`?? 0` 오작업 점검** — §7-6(c) 의 포트폴리오 10여 지점이 **수정되지 않았는지** 확인(불필요한 회귀 방지).
   `costGating.js` 도 무수정이어야 한다(A안 판정은 전부 서버에 있다).
6. **A안 마스킹 실물 확인** — 정책을 전환한 뒤 **재집계 없이** 포트폴리오·팀 분석을 열어
   ① 인건비 축이 비고 ② `costMaskedReason === 'SNAPSHOT_STALE_POLICY'` 문구가 뜨고
   ③ **₩0 이 어디에도 그려지지 않는지** 확인. 재집계 후 값이 대표값 파생으로 복귀하는지도 확인.
7. **루트 키 parity** — `costMaskedReason` 이 `costMasked:false` 응답과 `emptyShape()` 에도 존재하는지.
8. **성능 회귀 점검** — `PortfolioAggregator` 에서 KVS 조회가 프로젝트 수만큼 늘지 않았는지.
9. **마이그레이션 확인** — `portfolio_snapshot.salary_policy` ALTER 가 멱등이고, 기존 행이 `NULL` 로 남아
   INDIVIDUAL 운영 시 마스킹이 발동하지 않는지(현행 동작 불변).
10. `npm test` + `cd static/ui && npm test` + `npm run build`.

---

## 12. 결정 요약 (판단이 갈린 지점 · 권고안)

| # | 항목 | 결정 | 대안(불채택) | 근거 |
|---|------|------|-------------|------|
| 1 | 대표값 저장 방식 | **자동계산 후 저장(persist)** | 파생 계산 | 관리자 수정 요구(D2). 파생은 덮어쓸 자리가 없음 |
| 2 | 대표값 자동채움 시점 | **빈 칸일 때만 + `[중앙값 계산]` 버튼** | 편집 시 항상 재계산 / "auto 여부" 플래그 저장 | 매직 휴리스틱·추가 attribute 없이 의도가 명확 |
| 3 | 정책 저장 경로 | **기존 `updateSetting` 확장** | 신규 resolver | 부분갱신 패턴 이미 존재, 권한 동일, 계약 테스트 무영향 |
| 4 | 등급 밴드 컬럼(INDIVIDUAL) | **숨김 + 안내 1줄** | 비활성 표시 | "왜 못 쓰나" 툴팁이 또 필요 = 사용자가 거부한 더러운 UI |
| 5 | 정책 값 공유 | **React Query 훅 + 기존 `settingKeys.detail()` 재사용** | Zustand 신규 스토어 / 신규 쿼리키 | 서버 상태이며 세션 중 변경됨. 사본 3개 방지, 추가 네트워크 0 |
| 6 | 조건부 렌더 위치 | **`SalaryCell`/`SalaryField` 2개 컴포넌트에 집중 + 정적 검사** | 화면마다 `if (isLevelBand)` | 사용자 명시 요구("UI/UX 더럽지 않게"). 호출부 분기 0줄 |
| 7 | 정책 전환 확인 | **방향별 문구 + 캐시 지연 안내 다이얼로그 필수** | 무확인 저장 | 전사 비용 수치가 바뀌고 반영이 즉시가 아님 |
| 8 | strip 방식 | **얕은 명시 구조분해 + 테스트 방어** | 범용 재귀 stripper | `stripMemberCost` 선례. 정당한 집계 필드 오삭제 위험 |
| 9 | 엑셀 업로드 `Salary` | **무시(현행 유지)** | 경고 / 거부 | 파서가 애초에 안 읽음. 거부는 기존 템플릿 회귀 |
| 10 | `projectusers.salary` 편집 | **LEVEL_BAND 에서 거부** ✅ **사용자 확정(D5)** | 편집 허용(계산엔 미반영) | 쓰이지 않는 값 편집 = "왜 숫자가 안 바뀌나" |
| 11 | `getSummaryData.total_salary` 기존 게이트 부재 | **별건 RFC 로 분리** ✅ **사용자 확정(D6)**. 이번엔 LEVEL_BAND 키 제거만 | 이번 RFC 에서 함께 수정 | 기존 결함을 확대하지 않되, 무회귀 요건 때문에 INDIVIDUAL 동작은 손대지 않는다 |
| 12 | 포트폴리오/비용 집계 필드 | **변경 없음** | 추가 마스킹 | LEVEL_BAND 파생값은 공개된 대표값의 함수 = 새 정보 없음 |
| 13 | `getLevelList` 권한 | **OR-grant 에 `['SETTINGS','read']` 추가** | 확장 없이 경고 생략 | 민감도 낮고(이미 USER_MANAGEMENT 로 열림) 설정 카드에 필요. 단 프론트는 실패해도 degrade |
| 14 | fail-close 폴백 방향 | **표시=숨김 / 계산=예외 전파** | 전부 숨김 / 전부 INDIVIDUAL | 계산에서 숨김 폴백은 숫자를 조용히 거짓으로 만든다 |
| 15 | 정적 검사 범위 | **개인 원시 급여 렌더 영역 3곳만** + teamAnalytics·portfolio 는 **의도적 제외** | 파생 렌더 경로까지 확대 | 확대하면 정상 소비처 20여 곳이 오탐 → 테스트 무력화(`teamScopeLeak.test.js:211-215` 선례) |
| 16 | 포트폴리오 위젯 `?? 0` 10여 곳 | **현행 유지(작업 0건)** | 키 부재 대응으로 전부 수정 | #12 에 따라 LEVEL_BAND 에서도 키가 계속 온다 → `?? 0` 이 발동하지 않는다. 수정은 불필요한 회귀 |
| 17 | 전사 급여 히스토그램 | **변경 없음** (프로젝트 히스토그램은 `denied`) | 동일하게 `denied` | 입력이 정책 파생값이고 출력이 `{bucket,count}` 뿐 — 프로젝트 쪽의 `summary.{min,max}`(=개인 금액)와 성격이 다르다 |
| 18 | 불변식 #3 검사 대상 | **#1~#11 만.** #12·#13·N1 의도적 제외 | 전 응답 일괄 검사 | 파생 집계는 키를 계속 내려보낸다 — 제외를 안 적으면 정상 동작이 위반으로 잡힌다 |
| 19 | 구현 범위 | **P0 + P1** ✅ **사용자 확정(D7)**. P2 2건(B11·B12)은 범위 밖, B13 은 폐기 | 전 범위 | 별건 백로그로 분리 |
| 20 | 스냅샷 정책 지연 | **A안 — 정책 불일치 시 `costMasked` 승격** ✅ **사용자 확정(D8)** | B(큐 재집계) / C(배너만) | 기존 `costMasked` 를 포트폴리오·팀 분석이 이미 전부 존중 → **프론트 무수정으로 20여 지점이 가려진다.** B 는 배치 경로 신설이라 리스크↑ 이고 실패 시 결국 A 가 필요, C 는 숫자가 그대로 보여 요구사항 위반 |
| 21 | `costMaskedReason` 값 도메인 | **`'NONE'` / `'PERMISSION'` / `'SNAPSHOT_STALE_POLICY'`, 항상 존재** | 마스킹 시에만 부착 / boolean 플래그 추가 | 조건부 키는 프론트에 `undefined` 분기를 만든다(§6-2 가 금지한 패턴). 루트 키 parity 관례(`PortfolioCostGate.test.js:165`) 준수 |
| 22 | `?? 0` 10여 곳 수정 여부 | **(i) 상위 차단 유지 — 코드 변경 0건** | (ii) `?? null` + `'—'` / (iii) 혼합 | **실측 결과 `costGating.js` 가 이미 위젯·컬럼·탭 단위로 차단**해 `0` 이 화면에 도달하지 않는다(§7-6(c) 표). 10여 곳을 건드리면 `costGating.js:4-14` 가 확립한 단일 출처 원칙을 다시 흩뜨린다 |
| 23 | `portfolio_snapshot.salary_policy` NULL 허용 | **`VARCHAR(20) NULL`** | `NOT NULL DEFAULT 'INDIVIDUAL'` | 읽기 시 `normalizeSalaryPolicy(null) → 'INDIVIDUAL'` 로 접으면 되므로 DDL 을 단순하게 유지. 옛 스냅샷은 실제로 개인 연봉 기준이라 INDIVIDUAL 과 동치이고, LEVEL_BAND 전환 시 자동 불일치가 된다 |

✅ **미해결 사항 없음.** backend-engineer / frontend-engineer 는 본 설계서 §6 경계면 계약을 단일 진실로 착수 가능.
단 §0 의 정정 사항(호출자 분류·권한 키 이름·엑셀 파서·설정 캐시 분열)은 요구사항과 다르므로
**요구사항이 아니라 이 문서를 따를 것.**

---

## 13. 개정 이력

| 개정 | 일자 | 항목 | 내용 |
|------|------|------|------|
| r1 | 2026-08-03 | — | 초판 (요구사항 D1~D4 기준, base `ea5ef4a`) |
| **r2** | 2026-08-03 | **§6-4 #7** | 🔴 **자기모순 수정.** "`resolveMemberSalaries` 호출부 4곳"은 오류 — 실제는 `resolveMemberSalaries` 2곳(`ProjectCostService:127, :195`) + `computeEffectiveSalary` 직접 2곳(`ProjectUsersService:175`, `PortfolioAggregator:308`). §0-1 과 일치시키고 함수별 grep 표로 재작성 |
| r2 | 2026-08-03 | **§7-6(b) 신설** | 🔴 **최대 누락 보완.** RFC-175/176 의 팀 분석 프론트 6지점(`TeamKpiRow:120`, `TeamRollupTable:87,:134-136`, `TeamCompareBar:60,:87,:125`, `teamMetrics.js:174,:241,:342,:445,:486,:364,:372`, `teamAnalyticsFields.js:18`) 추가. **프론트 작업 0건이지만 §11 A10 에 전적으로 의존**한다는 관계를 명시 |
| r2 | 2026-08-03 | **§7-6(c) 신설** | 포트폴리오 `?? 0` 10여 지점을 **"고치지 마라"** 로 명시. §6-2 불변식을 보고 작업 대상으로 오인해 불필요한 회귀를 만드는 것을 차단. #12 종속 관계 명기 |
| r2 | 2026-08-03 | **§7-4** | 정적 검사 대상 3곳을 유지하되 **teamAnalytics·portfolio 약 20지점을 의도적 제외로 명시**하고 근거(오탐 20건이 테스트를 무력화, `teamScopeLeak.test.js:211-215` 선례) 기재 |
| r2 | 2026-08-03 | **§5-5** | `teamScopeLeak.test.js` 서술 정정 — `:1-207`(62%)은 **런타임** 누출 테스트, 정적검사는 `:216-338` 이며 금지 패턴은 `salary` 가 아니라 `aggregateByTeam(` 직접호출·scope 누락. 차용 대상은 `collectJs`(`:237-250`)와 0건 방어(`:279-284`) **2개뿐**임을 명시. `ResourceSalaryLeak` 의 `rate` 키는 차용 제외 |
| r2 | 2026-08-03 | **§5-3** | N1(`salaryBuckets` 상수) / N2(`PortfolioAggregator:410` 스냅샷 write) / N3(`MEMBER_ROWS:104-115` 원시 조회) 3건 추가. **N1 과 불변식 #3 의 충돌 해소** 명시 |
| r2 | 2026-08-03 | **§5-3 / §6-4 #3** | 불변식 #3 검사 대상에서 **#12·#13·N1 의도적 제외** 명기 |
| r2 | 2026-08-03 | **§5-3** | **히스토그램 게이팅 불일치 해소** — 프로젝트(`denied`) vs 전사(변경 없음)가 갈리는 근거 3가지(입력 성격·출력 형태·LEVEL_BAND 에서의 의미) 기재 |
| r2 | 2026-08-03 | **§4-7-1 신설** | 🔴 `portfolio_snapshot` 지연을 **결정 대기**로 승격(기존 P2 배너 처리는 요구사항 미충족). A/B/C 트레이드오프 표 + **A 채택 시 변경 스케치 A-1~A-7** 사전 작성 |
| r2 | 2026-08-03 | **라인 참조 4건** | `SummaryPanel.jsx:31`→**`:32`**(+렌더 `:39` 추가), `UserEditModal.jsx:212-229`→**`:212-230`**(`)}` 누락 시 JSX 파손), `UserRegistrationModal.jsx:144-160`→**`:144-163`**, §7-6 `SummaryPanel:29-38`→**`:30-32` + `:39`** |
| r2 | 2026-08-03 | **§11** | 구현 범위 **P0+P1(D7)** 명시, P2 3건(B11·B12·B13) "범위 밖" 표기. A10 에 N2·N3 및 **§7-6(b) 의존 관계** 추가. Phase C 를 5항→7항으로(팀분석 실물 확인·`?? 0` 오작업 점검 추가) |
| r2 | 2026-08-03 | **§12** | D5(투입급여 편집 거부)·D6(별건 RFC 분리)·D7(P0+P1) 사용자 확정 반영. 결정 #15~#19 추가. 미해결 1건(§4-7-1) 명시 |
| r2 | 2026-08-03 | **§0** | 독립 검증 결과 반영 — 서버 측 신규 salary 노출 경로 0건 확인(§0-5-A 신설) |
| **r3** | 2026-08-03 | **§4-7-1** | ✅ **A안 확정(D8).** 결정 대기 → 확정 설계로 승격. A/B/C 표를 "선정 근거"로 축약(B·C 불채택 사유만 존치). A-1~A-7 을 우선순위 포함 확정 표로 재작성 + **A-4 판정 코드 확정**(권한 축 우선, `normalizeSalaryPolicy(null)→INDIVIDUAL` 로 옛 스냅샷 처리) |
| r3 | 2026-08-03 | **§4-7-1** | **`costMaskedReason` 값 도메인 확정** — `'NONE'`/`'PERMISSION'`/`'SNAPSHOT_STALE_POLICY'`, `costMasked:false` 와 `emptyShape()` 포함 **항상 존재**(루트 키 parity) |
| r3 | 2026-08-03 | **§7-6(c) 재작성** | 🔴 **`costGating.js` 실측 근거로 "(i) 코드 변경 0건" 확정.** `?? 0` 발동 조건(= `costMasked` 응답)을 명시하고, **그 조건에서도 `costGating` 이 위젯·컬럼·탭 단위로 차단해 `0` 이 화면에 도달하지 않음**을 지점별 표로 증명. `PortfolioSalaryByProject`/`PortfolioSalaryHistogram` 이 **고아 위젯**임을 실측 확인. 전자는 게이팅 미경유라 부활 시 위험 → 별건 백로그 기록 |
| r3 | 2026-08-03 | **§7-6(d)(e)** | (d) 에 `costGating.js` 무수정 명시. **(e) 신설 — A-6 문구 분기가 유일한 프론트 작업**임을 파일:라인과 함께 확정 |
| r3 | 2026-08-03 | **§1 / §3-5 / §10-1 모순 정정** | 🔴 A-1 이 `migrate.js` enqueue 를 발생시키므로 "MySQL 변경 없음"·"DB 마이그레이션 불필요" 서술을 **정정**. 급여 컬럼은 여전히 무변경이고 `portfolio_snapshot.salary_policy` 1건만 추가됨을 표로 분리. `NULL` 허용 근거 기재 |
| r3 | 2026-08-03 | **§5-3 #12 / §6-3 / §6-4** | #12 를 "키 제거 없음, 단 A안 마스킹 승격 시 기존 `stripMemberCost` 발동"으로 정정. 계약 표에 `salaryPolicy`+`costMaskedReason` 2필드 추가. 불변식에 **7-A(parity)·7-B(권한 축·정책 축 독립)** 추가하고 기존 #7 을 7-C 로 이동 |
| r3 | 2026-08-03 | **§9-6-A·B 신설** | A-6 문구 i18n — `portfolio.cost.staleSnapshot`, `teamAnalytics.costMaskedStale` (kr/en). 기존 `portfolio.cost.masked`·`teamAnalytics.costMasked` 는 무변경 |
| r3 | 2026-08-03 | **§11** | Phase A 에 **A20~A24**(A-1·A-2·A-3·A-4/A-5·A-7) P0 편입, Phase B 에 **B15**(A-6) P1 편입, **B13 폐기**(C안 불채택). B9 에 portfolio·teamAnalytics i18n 추가. Phase C 를 7항→10항으로(A안 마스킹 실물 확인·parity·마이그레이션 검증 추가) |
| r3 | 2026-08-03 | **§12 / 헤더** | 결정 #20~#23 추가(A안 채택·`costMaskedReason` 도메인·`?? 0` 미수정·NULL 허용). **미해결 0건**으로 갱신하고 헤더의 "미확정 1건" 경고 제거, D8 을 확정 결정 목록에 추가 |
