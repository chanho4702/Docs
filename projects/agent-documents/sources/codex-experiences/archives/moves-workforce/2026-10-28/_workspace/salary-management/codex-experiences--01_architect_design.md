# 급여 관리 리뉴얼 설계서 (salary-management)

작성: feature-architect / 2026-07-13
기준 요구사항: `_workspace/salary-management/00_input/requirement.md`

> 핵심 산출물은 **§2 경계면 계약**이다. backend/frontend는 이 표를 단일 진실로 삼는다.
> 요구사항 "가정" 섹션에서 미확정인 항목은 각 절에 **[가정]** / **[결정필요]** 로 표기했다.

---

## 1. 개요 / 영향 범위

프로젝트 인력의 급여를 **연봉(백오피스 전역)** 과 **투입 급여(프로젝트 로컬)** 로 이원화하고,
인원별 **계산 모드**(`PROJECT`=투입급여 기준 / `ANNUAL`=연봉 환산)를 도입한다.
급여 조회·편집 UI를 인력관리 탭에서 분리해 신규 **'급여 관리' 하위 탭**(PROJECT_COST 게이트)으로 이전한다.

### 축별 영향

| 축 | 신규 | 수정 |
|----|------|------|
| **DB** | — | `projectusers` 컬럼 추가 `salary_type VARCHAR(20) DEFAULT 'PROJECT'` (멱등 ALTER). `users.salary`는 스키마 변경 없음(의미만 "연봉"으로 재정의) |
| **백엔드 resolver** | `getProjectSalaryList`(급여탭 조회), `updateProjectMemberSalary`(급여·모드 편집) | `updateProjectUsersByKey`(salary 파라미터 제거는 안 함, 인력관리가 더 이상 salary 전송 안 함), 비용 환산 공유 헬퍼 신규 + `ProjectCostService`/`PortfolioAggregator` 유효급여 반영 |
| **백엔드 기타** | 순수 헬퍼 `EffectiveSalary.js`(jest) | `MEMBER_ROWS` 쿼리에 `salary_type`+`users.salary` 조인 추가 |
| **프론트 페이지** | `pages/projectDetail/salary/SalaryManagementPage.jsx` (+ 하위 컴포넌트) | `pages/projectDetail/user/ProjectUserPanel.jsx`(급여 컬럼 제거), `constants/tabs.js`(탭 추가) |
| **프론트 상태** | `queryKey/projectKeys.js`에 `salary(projectId,page)` 추가 | — |
| **권한** | `PermissionMap.js`에 신규 2함수 매핑 | — (카탈로그 변경 없음, PROJECT_COST 재사용) |
| **i18n** | `locales/kr/salary.json` + `locales/en/salary.json` | `locales/kr(en)/user.json` 급여→연봉 라벨, `projectDetail.json` 인력관리 급여 헤더 키(잔존/미사용) |

**[가정 확정]** 권한은 신규 카탈로그 없이 기존 `PROJECT_COST`(read/write) 재사용. 급여 관리 탭 노출/조회 = PROJECT_COST read, 편집 = PROJECT_COST write.

---

## 2. 경계면 계약 (최우선 — 글자 그대로 고정)

### 2.1 신규/변경 resolver

| resolver 함수 | 입력 payload | 성공 응답 shape (responseWrapper가 `success:true` 를 top-level에 spread) | 프론트 소비 훅 / 쿼리키 |
|--------------|-------------|--------------------------------|----------------------|
| **`getProjectSalaryList`** (신규, read) | `{ project_id: string(uuid), page?: number=1, pagesize?: number=10 }` | `{ success, rows: SalaryRow[], meta: { projectMonths: number } }` | `useQuery(projectKeys.salary(project_id, page))` → `invoke('getProjectSalaryList', {project_id, page})` |
| **`updateProjectMemberSalary`** (신규, write) | `{ project_member_id: string(uuid), salary?: number, salary_type?: 'PROJECT'\|'ANNUAL' }` (미전송 필드는 미변경) | `{ success, rows?: [], affectedRows?: number }` (프론트는 `success`만 사용) | `useMutation` → `invoke('updateProjectMemberSalary', params)`; onSuccess `invalidateQueries(projectKeys.salary(project_id))` **+ `projectKeys.cost(project_id)`** |
| `updateProjectUsersByKey` (기존, 변경 없음) | `{ project_member_id, role_key?, level_key?, salary? }` | `{ success, ... }` | 인력관리는 이제 `role_key`/`level_key`만 전송 (salary 미전송) |

**`SalaryRow` shape (getProjectSalaryList.rows[] 각 원소):**
```
{
  project_member_id: string,   // BIN_TO_UUID
  account_id:        string,   // jira accountId (프론트가 별도 getUser 로 아바타/이름 조달)
  role_key:          string|null,
  level_key:         string|null,
  salary:            number,        // 투입 급여 (projectusers.salary). 편집 대상
  salary_type:       'PROJECT'|'ANNUAL',  // 계산 모드. 편집 대상. NULL이면 서버가 'PROJECT'로 정규화
  annual_salary:     number|null,   // 연봉 (users.salary). 읽기 전용. 미등록 시 null
  effective_salary:  number,        // 서버 환산 유효 인건비(투입 총단가 환산). 읽기 전용
  total_count:       number         // 페이징 총건수 (COUNT(1) OVER())
}
```

**effective_salary 산정(서버, §3.3 공유 헬퍼 — 월할 방식):**
- `salary_type='PROJECT'` → `effective_salary = round(salary)` (기존과 동일)
- `salary_type='ANNUAL'` → `effective_salary = round( (annual_salary / 12) × projectMonths )` (annual_salary null/0 또는 projectMonths 0 → 0)
- `projectMonths` = 프로젝트 기간의 개월수(소수). §3.3 `computeProjectMonths(start, end)`로 산정. **월급(연봉/12) × 투입 개월수** 개념 — 공휴일·유급휴가에도 급여가 지급된다는 실제 지급방식과 정합.

> 응답 필드는 **snake_case** 유지(기존 `findProjectusersByProjectId` 관례와 일치, 프론트가 `data.rows[].salary` 형태로 소비).

### 2.2 계약 불변식 (integration-verifier 검증 기준)

1. `getProjectSalaryList` 응답은 항상 `{success, rows, meta}` — `rows`는 배열, hit/miss 무관.
2. `effective_salary`는 항상 number(NaN 금지). `salary_type='PROJECT'` 행에서는 `effective_salary === salary`.
3. 기존 데이터(=`salary_type='PROJECT'`)에 대해 비용 탭(`getProjectCostSummary`) 결과가 **변경 전과 동일**(하위호환).
4. `updateProjectMemberSalary`는 `salary`/`salary_type` 둘 중 전송된 것만 갱신(빈 문자열/undefined = 미변경).

---

## 3. 백엔드 설계

### 3.1 DB 마이그레이션 (Forge SQL / TiDB — FK·트랜잭션 미지원, 멱등 ALTER)

**파일: `src/rdb/schema/ddl/projectusers.sql.js`** — export 추가
```js
export const ALTER_PROJECTUSERS_ADD_SALARY_TYPE = `
    ALTER TABLE projectusers
    ADD COLUMN IF NOT EXISTS salary_type VARCHAR(20) NOT NULL DEFAULT 'PROJECT'
`;
```
> TiDB는 `ADD COLUMN IF NOT EXISTS`를 지원한다. `migrationRunner`는 이름으로 실행이력을 추적해 1회만 돌지만, `IF NOT EXISTS`로 이력 리셋 시에도 멱등 보장. `NOT NULL DEFAULT 'PROJECT'` → 기존 전 행이 자동으로 PROJECT 모드 = **하위호환**.

**파일: `src/rdb/schema/ddl/index.js`** — re-export 추가
```js
export { CREATE_PROJECT_USERS_TABLE, ALTER_PROJECTUSERS_ADD_SALARY_TYPE } from './projectusers.sql';
```

**파일: `src/rdb/schema/migrate.js`** — import + 마지막에 enqueue (기존 v011 뒤)
```js
import { ..., ALTER_PROJECTUSERS_ADD_SALARY_TYPE } from './ddl';
// ...
    .enqueue('v011_create_project_skills_table', CREATE_PROJECT_SKILLS_TABLE)
    // 급여 관리 리뉴얼 — 인원별 계산 모드 컬럼
    .enqueue('v012_alter_projectusers_add_salary_type', ALTER_PROJECTUSERS_ADD_SALARY_TYPE)
```

### 3.2 쿼리 확장

**파일: `src/rdb/query/ProjectUsersQuery.js`** — 신규 쿼리 2개 추가

`FIND_SALARY_BY_PROJECT_ID` (급여탭 조회 — users 조인해 연봉 포함):
```sql
SELECT
    BIN_TO_UUID(pu.project_member_id) AS project_member_id,
    pu.account_id,
    pu.role_key,
    pu.level_key,
    pu.salary,
    COALESCE(pu.salary_type, 'PROJECT') AS salary_type,
    u.salary AS annual_salary,
    COUNT(1) OVER() AS total_count
FROM projectusers pu
LEFT JOIN users u ON u.account_id = pu.account_id
WHERE pu.project_id = UUID_TO_BIN(?)
```
> `findWithPagination(...)`로 LIMIT/OFFSET 부착(기존 `findProjectusersByProjectIdRepository` 패턴 재사용).

`UPDATE_SALARY_BY_KEY` (급여·모드 편집 — CASE '' 미변경 패턴, 기존 `UPDATE_BY_KEY_WITH_PARAMS`와 동일 컨벤션):
```sql
UPDATE projectusers
SET
    salary = (CASE ? WHEN '' THEN salary ELSE ? END),
    salary_type = (CASE ? WHEN '' THEN salary_type ELSE ? END),
    updated_id = ?
WHERE project_member_id = UUID_TO_BIN(?)
```

**파일: `src/rdb/query/PortfolioSnapshotQuery.js`** — `MEMBER_ROWS`에 컬럼 추가(비용/포트폴리오 유효급여 환산용)
```sql
MEMBER_ROWS: `
    SELECT
        pu.account_id,
        pu.role_key,
        pu.level_key,
        pu.salary,
        COALESCE(pu.salary_type, 'PROJECT') AS salary_type,
        u.salary AS annual_salary
    FROM projectusers pu
    LEFT JOIN users u ON u.account_id = pu.account_id
    WHERE pu.project_id = UUID_TO_BIN(?)
`,
```
> 컬럼 추가만 — 기존 소비부(포트폴리오)는 추가 컬럼을 무시해도 안전. `getProjectMemberRows`는 시그니처 불변.

### 3.3 공유 순수 헬퍼 (신규, jest 대상) — 월할 방식

> **[A 확정] 월할 환산.** 사용자 결정: "연봉 3600이면 월급 300, 이 기반으로 계산. 유급휴가/공휴일에도 급여는 나가므로 근무일 기반 환산은 부적합." → 유효급여 = **(연봉/12) × 투입 개월수**.
> 백엔드는 **dayjs 미탑재**(root package.json·`src/` 확인 결과 없음, 날짜는 네이티브 `Date` 사용 — `src/utils/workday.js`). 따라서 dayjs `.diff('month', true)` 대신 **총 달력일수 기반 등가 산식**(코디네이터 허용안)으로 확정.

**파일: `src/resolver/projectCost/EffectiveSalary.js`** (Forge 의존성 없음 → 단위 테스트)
```js
const MS_PER_DAY = 86400000;
const AVG_MONTH_DAYS = 365.25 / 12; // 30.4375 (윤년 평균)

/**
 * 프로젝트 기간의 개월수(소수). 종료일 포함(inclusive).
 * 총 달력일수 ÷ 평균 월길이(30.4375). 네이티브 Date만 사용(dayjs 불필요).
 *  - 1년(Jan1~Dec31, 365일) → 11.99 ≈ 12
 *  - 월 중간 시작/종료: 달력일수 기반이라 자연 처리
 *  - 1개월 미만: 예 15일 → 0.49
 *  - start==end: 1일 → 0.03
 *  - end < start / 누락 → 0
 */
export const computeProjectMonths = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    if (isNaN(start) || isNaN(end) || end < start) return 0;
    const inclusiveDays = Math.round((end - start) / MS_PER_DAY) + 1; // 종료일 포함
    return Math.round((inclusiveDays / AVG_MONTH_DAYS) * 100) / 100;   // 소수 2자리
};

// 멤버 1인 유효급여(투입 총단가 환산, 월할).
export const computeEffectiveSalary = ({ salaryType, salary, annualSalary }, { projectMonths }) => {
    const invest = salary || 0;
    if ((salaryType || 'PROJECT') !== 'ANNUAL') return Math.round(invest); // PROJECT: 기존 그대로
    const annual = annualSalary || 0;
    const months = projectMonths || 0;
    if (annual <= 0 || months <= 0) return 0; // 연봉 미등록/기간 미설정 → 비용 제외(기존 null salary와 동일 취급)
    return Math.round((annual / 12) * months);
};

// memberRows(snake) → 유효급여 반영 정규화 멤버 [{accountId, salary(=effective), roleKey, levelKey, salaryType, annualSalary, investSalary}]
export const resolveMemberSalaries = (memberRows, { projectMonths }) =>
    (memberRows || []).map((u) => {
        const investSalary = u.salary ?? 0;
        const effective = computeEffectiveSalary(
            { salaryType: u.salary_type, salary: investSalary, annualSalary: u.annual_salary },
            { projectMonths }
        );
        return {
            accountId: u.account_id,
            salary: effective,          // ← 비용 계산이 쓰는 salary를 "유효급여"로 치환
            investSalary,
            annualSalary: u.annual_salary ?? null,
            salaryType: u.salary_type ?? 'PROJECT',
            roleKey: u.role_key ?? null,
            levelKey: u.level_key ?? null,
        };
    });
```

**환산 수식(확정):** `effectiveSalary(ANNUAL) = round( (annualSalary / 12) × projectMonths )`, `projectMonths = round(inclusiveCalendarDays / 30.4375, 2)`.
- 검증: 연봉 3600, Jan1~Dec31(365일) → projectMonths 11.99 → (3600/12)×11.99 = 300×11.99 = **3597 ≈ 3600**(월급 300×12와 정합).
- **공휴일 페치 불필요**: projectMonths는 start/end만 필요 → 급여탭 조회(`getProjectSalaryList`)에서 공휴일 페치 제거(가벼워짐). 비용 서비스의 기존 MM 안분/공휴일 로직은 **불변**(scheduleRate용으로 계속 사용). 바뀌는 건 ANNUAL 멤버의 유효급여 산정뿐.
- 경계 케이스는 위 JSDoc(1개월 미만/월중간/동일일/역전·누락)에 명시. jest로 전 케이스 커버.

### 3.4 급여탭 Service (신규 함수 — 기존 ProjectUsers 도메인에 배치)

**파일: `src/resolver/projectIssue/ProjectUsersService.js`** — 함수 추가

`getProjectSalaryListService({ project_id, page=1, pagesize=10 })`:
1. 병렬 페치: `getSummaryDataService({project_id})`(기간 start/end), `findSalaryByProjectIdRepository({page,pagesize},[project_id])`(급여 행). **공휴일 페치 없음**(월할 환산은 start/end만 필요).
2. `projectMonths = computeProjectMonths(summary.start_date, summary.end_date)`.
3. 각 행에 `effective_salary = computeEffectiveSalary({salaryType:row.salary_type, salary:row.salary, annualSalary:row.annual_salary}, {projectMonths})` 부착. `salary_type` NULL은 'PROJECT'로 정규화(쿼리 `COALESCE`가 처리).
4. return `{ rows: mappedRows, meta: { projectMonths } }`.
> 기간 미설정 시 projectMonths=0 → ANNUAL 행 effective=0(프론트가 `salary.warn.noPeriod` 안내). PROJECT 행은 영향 없음.

`updateProjectMemberSalaryService({ salary='', salary_type='', project_member_id }, { accountId })`:
- `salary_type` 유효성: `['PROJECT','ANNUAL']` 외 값이면 `LogicalError('INVALID_SALARY_TYPE')`(빈문자열은 미변경 의미이므로 통과).
- params = `[salary, salary, salary_type, salary_type, accountId, project_member_id]` → `updateSalaryByKeyRepository`.

**파일: `src/resolver/projectIssue/ProjectUsersRepository.js`** — 함수 2개 추가
```js
export const findSalaryByProjectIdRepository = async (pageParams, params) =>
    await executeQuery(findWithPagination(ProjectUsersQuery.FIND_SALARY_BY_PROJECT_ID, pageParams), params);

export const updateSalaryByKeyRepository = async (params) =>
    await executeQuery(ProjectUsersQuery.UPDATE_SALARY_BY_KEY, params);
```

### 3.5 Controller 등록

**파일: `src/resolver/projectIssue/ProjectUsersController.js`** — guardedDefine 2개 추가
```js
guardedDefine(resolver, 'getProjectSalaryList', ({payload}) => getProjectSalaryListService(payload));
guardedDefine(resolver, 'updateProjectMemberSalary', ({payload, context}) => updateProjectMemberSalaryService(payload, context));
```
> `registerProjectUsersController`는 이미 `src/index.js`에 등록됨 → **index.js 변경 불필요**.

### 3.6 비용/포트폴리오 유효급여 반영

**파일: `src/resolver/projectCost/ProjectCostService.js`**
- `projectMonths = computeProjectMonths(projStart, projEnd)` 계산(라인 124 부근, projStart/projEnd 이미 존재. 공휴일 추가 페치 불필요).
- `normalizeMembers(memberRows)` 를 `resolveMemberSalaries(memberRows, {projectMonths})` 로 교체.
- **`totalSalary`를 summary.total_salary(=Σ 투입급여) 대신 `members.reduce((a,m)=>a+m.salary,0)`(=Σ 유효급여) 로 계산**. 이래야 BAC/AC/EV·byRole·byLevel·byIssue가 모드별 유효급여로 일관.
- 캐시 hit 경로 `buildByIssue`도 동일하게 `resolveMemberSalaries(memberRows, {projectMonths})` 사용. `buildByIssue` 시그니처에 `projectMonths` 전달 → 캐시 payload에 `_projectMonths` 저장(기존 `_totalWorkDays`와 대칭). (기존 `_totalWorkDays`/`_hourRate`는 그대로 유지 — scheduleRate·MD 안분용)
> 하위호환: 전 멤버 PROJECT 모드면 유효급여=투입급여 → totalSalary/AC/EV 전부 기존과 동일 = **불변식 3 충족**.

**파일: `src/resolver/portfolioDashboard/PortfolioAggregator.js`** (라인 289~393)
- `projectMonths = computeProjectMonths(startDate, endDate)` (aggregator가 이미 보유한 project start/end 사용, 공휴일 불필요).
- members 조립 시 `salary: u.salary ?? 0` → `salary: computeEffectiveSalary({salaryType:u.salary_type, salary:u.salary, annualSalary:u.annual_salary}, {projectMonths})`.
- `totalSalary`(라인 393)는 그대로 `members.reduce` — 이미 유효급여 반영됨.

### 3.7 에러 케이스

| 상황 | 처리 |
|------|------|
| `project_id` 누락 | 기존 패턴대로 서비스에서 방어(빈 rows 반환 또는 LogicalError). getProjectSalaryList는 빈 `rows:[]` + meta 반환 권장 |
| `salary_type` 부정값 | `LogicalError('INVALID_SALARY_TYPE', ...)` → responseWrapper가 `{success:false,error}` 직렬화 |
| 연봉 미등록(ANNUAL인데 users.salary null) | effective=0 (비용 제외). 급여탭에서 경고 뱃지 표시(프론트 §4) |
| 프로젝트 기간 미설정 | ANNUAL effective=0, meta.projectMonths=0 → 프론트가 "기간 설정 필요"(`salary.warn.noPeriod`) 안내 |

---

## 4. 프론트엔드 설계

### 4.1 인력관리 탭 급여 컬럼 제거

**파일: `static/ui/src/pages/projectDetail/user/ProjectUserPanel.jsx`**
- `head.cells`에서 `{ key: 'salary', content: ... }` 블록(라인 64~75) **삭제**. → head는 name/role/level/action 4열.
- `rows`의 `{key:'salary', content: ... InlineEdit ...}` 블록(라인 187~216) **삭제**.
- salary 전용 import 정리: `formatNumber, parseNumber`(numberUtils), `Tooltip`, `InformationIcon`(다른 데서 안 쓰면) 제거. `updateMutation`는 role/level 편집에 계속 사용하므로 유지.
- 조회 쿼리(`findProjectusersByProjectId`)·업데이트(`updateProjectUsersByKey`)는 유지하되, 인력관리는 salary를 더 이상 전송하지 않음(role_key/level_key만).

### 4.2 인력관리 탭을 부모-자식 구조로 개편 (급여 관리 = 자식 탭)

> **[B 확정]** 사용자 결정: "분석 및 리포트가 작업분석 등 자식 메뉴를 갖듯, **인력 관리 탭 아래 하위 탭**으로." → `analysisReport`가 쓰는 `children:[...]` 패턴(tabs.js 라인 118~173, `CommonTab`이 렌더)을 그대로 적용해 인력관리(`projectUser`)를 부모 탭으로 승격.

**구조:**
```
인력 관리 (부모, projectUser)   ← 컴포넌트 없음, children만
 ├─ 인력 목록 (자식, projectUserList) = 기존 ProjectUserPanel  ← 기본(첫) 자식, 항상 노출
 └─ 급여 관리 (자식, projectSalary)   = SalaryManagementPage    ← canRender: () => canReadCost
```

**파일: `static/ui/src/constants/tabs.js`** — 기존 `projectUser` 탭 객체(라인 66~74)를 아래로 교체. 시그니처는 이미 `canReadCost` 수신 → 변경 불필요.
```jsx
import CoinsIcon from "@atlaskit/icon-lab/core/coins"; // 이미 import됨(비용탭)
import SalaryManagementPage from "../pages/projectDetail/salary/SalaryManagementPage";
// ...
{
    key: 'projectUser',
    label: (
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <PeopleGroupIcon label="" />
            {t('projectDetail.tabs.0')}   {/* "인력 관리" (부모 유지) */}
        </span>
    ),
    children: [
        {
            key: 'projectUserList',
            label: (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PeopleGroupIcon label="" />
                    {t('projectDetail.tabs.userList')}   {/* 신규 키 "인력 목록" */}
                </span>
            ),
            component: () => <ProjectUserPanel project_id={project_id} toast={toast} />,
            // canRender 없음 → 항상 노출(기본 자식). 기존 인력관리 진입 동작 보존.
        },
        {
            key: 'projectSalary',
            label: (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <CoinsIcon label="" />
                    {t('salary.tab.label')}   {/* "급여 관리" */}
                </span>
            ),
            component: () => <SalaryManagementPage project_id={project_id} toast={toast} />,
            canRender: () => canReadCost,   // PROJECT_COST read
        },
    ],
},
```
> 부모 탭은 `component` 없이 `children`만(analysisReport와 동일). `CommonTab`이 첫 렌더가능 자식(=인력 목록)을 기본 선택하므로 **기존 인력관리 진입 = 인력 목록**으로 자연 보존. PROJECT_COST 없는 사용자는 급여 관리 자식이 숨겨지고 인력 목록만 보임.
> **검증 포인트(frontend)**: `CommonTab`의 children 기본 선택 로직이 "첫 번째 canRender 통과 자식"인지 실물 확인(analysisReport에서 progress/cost가 canRender 걸린 것과 동일하게 동작하는지). 다르면 인력 목록이 항상 첫 자식이므로 문제 없음.

**컴포넌트 트리 (신규 `pages/projectDetail/salary/`):**
```
SalaryManagementPage.jsx
 ├─ (헤더) meta 안내: 투입 개월수 {projectMonths}개월 + InfoTip(월할 환산식: (연봉/12)×개월수)
 └─ SalaryTable (CommonTable 재사용)
      열: 사용자(UserAvatar) | 연봉(읽기) | 계산 모드(Select 편집) | 투입 급여(InlineEdit 편집) | 유효 인건비(읽기·환산결과)
      - 연봉/투입급여: Number(...).toLocaleString(), 미등록 연봉은 '-' + 경고 뱃지
      - 계산 모드: Atlaskit Select [{label:t('salary.mode.project'),value:'PROJECT'},{label:t('salary.mode.annual'),value:'ANNUAL'}]
      - 편집권한: usePermissionStore(s=>s.canWrite('PROJECT_COST'))
 └─ Pagination (기존 ProjectUserPanel과 동일 10건 페이징)
```
- 데이터: `useQuery({ queryKey: projectKeys.salary(project_id, page), queryFn: () => invoke('getProjectSalaryList', {project_id, page}) })`.
- 사용자 표시: 기존 ProjectUserPanel과 동일하게 `executeRequest('getUser',{accountId})` 병렬 조회 → userMap(아바타/이름). (급여탭도 account_id만 오므로 동일 패턴 재사용)
- 편집 mutation: `invoke('updateProjectMemberSalary', {project_member_id, salary?|salary_type?})`; onSuccess → `invalidateQueries(projectKeys.salary(project_id))` **및 `projectKeys.cost(project_id)`**(비용탭 정합). optimistic update는 ProjectUserPanel의 salary InlineEdit 패턴 이식.
- 모드 변경 시 유효 인건비 즉시 재계산이 필요하므로 mutation 성공 후 리스트 invalidate로 서버 재환산값 수신(낙관적 재계산은 하지 않음 — projectMonths 등 서버 소유값 의존).

### 4.3 쿼리키 팩토리

**파일: `static/ui/src/utils/queryKey/projectKeys.js`** — `projectKeys`에 추가
```js
export const projectKeys = {
    progress: (projectId) => ['projectProgress', projectId],
    cost: (projectId) => ['projectCost', projectId],
    taskHistory: (projectId) => ['projectTaskHistory', projectId],
    salary: (projectId, page) => page == null
        ? ['projectSalary', projectId]
        : ['projectSalary', projectId, page],   // invalidate는 prefix ['projectSalary', projectId]로
};
```

### 4.4 권한 체크
- 탭 노출: `canReadCost = canRead('PROJECT_COST')` (이미 ProjectDetailTabs.jsx에서 파생).
- 편집 UI 활성화: `usePermissionStore(s=>s.canWrite('PROJECT_COST'))`. read-only 사용자는 값만 표시(InlineEdit/Select 비활성).

### 4.5 백오피스 라벨(급여→연봉)
- 라벨 텍스트만 i18n으로 교체(§6). 백오피스 사용자 관리 화면(`backoffice/page/user/...`)은 코드 변경 없이 키 값만 "연봉"으로 바뀜.

---

## 5. DB 설계 (요약)

| 테이블 | 변경 | 마이그레이션 |
|--------|------|-------------|
| `projectusers` | `+ salary_type VARCHAR(20) NOT NULL DEFAULT 'PROJECT'` | v012 멱등 ALTER (ADD COLUMN IF NOT EXISTS) |
| `users` | 없음 (`salary` 의미만 "연봉"으로 재정의) | 없음 |

- 기존 전 행 → `salary_type='PROJECT'` 자동 → 계산 결과 하위호환.
- FK/CASCADE 미사용(TiDB), 앱레벨 처리 유지. 인덱스 추가 불필요(project_id 조회는 기존 INDEX 사용).

---

## 6. i18n 키 목록 (`locales/kr/*.json` + `locales/en/*.json` → `npm run merge`)

> merge 소스 실경로: **`C:/CloudJira/moves-workforce/locales/kr/`, `locales/en/`** (파일=네임스페이스). `static/ui/locales/kr`는 빈 스텁. `ko-KR.json`/`en-US.json` 직접수정 금지.

### 6.1 신규 파일 `locales/kr/salary.json`
```json
{
  "tab": { "label": "급여 관리" },
  "title": "급여 관리",
  "table": {
    "user": "사용자",
    "annualSalary": "연봉",
    "mode": "계산 모드",
    "investSalary": "투입 급여",
    "effectiveSalary": "유효 인건비"
  },
  "mode": { "project": "투입 급여 기준", "annual": "연봉 환산" },
  "meta": {
    "projectMonths": "투입 개월수",
    "unit": "개월",
    "help": "연봉 환산 = (연봉 ÷ 12) × 투입 개월수. 월급 기준이라 공휴일·유급휴가에도 급여가 반영됩니다. 투입 급여 기준은 입력한 투입 급여를 그대로 사용합니다."
  },
  "warn": {
    "noAnnual": "연봉이 등록되지 않아 유효 인건비가 0으로 계산됩니다. 백오피스 사용자 관리에서 연봉을 등록하세요.",
    "noPeriod": "프로젝트 기간이 설정되지 않아 연봉 환산이 불가합니다. 프로젝트 일정을 먼저 설정하세요."
  },
  "toast": {
    "success": "급여 정보가 수정되었습니다.",
    "error": "급여 수정 중 오류가 발생했습니다."
  },
  "empty": "등록된 인력이 없습니다."
}
```

### 6.2 신규 파일 `locales/en/salary.json`
```json
{
  "tab": { "label": "Salary" },
  "title": "Salary Management",
  "table": {
    "user": "User",
    "annualSalary": "Annual Salary",
    "mode": "Calc Mode",
    "investSalary": "Assigned Salary",
    "effectiveSalary": "Effective Cost"
  },
  "mode": { "project": "Assigned salary", "annual": "Annual-based" },
  "meta": {
    "projectMonths": "Assigned months",
    "unit": "mo",
    "help": "Annual-based = (annual salary ÷ 12) × assigned months. Monthly-salary basis, so pay applies through holidays/paid leave. Assigned mode uses the entered assigned salary as-is."
  },
  "warn": {
    "noAnnual": "No annual salary registered, so effective cost is 0. Set the annual salary in backoffice user management.",
    "noPeriod": "Project period is not set, so annual conversion is unavailable. Set the project schedule first."
  },
  "toast": {
    "success": "Salary updated.",
    "error": "Failed to update salary."
  },
  "empty": "No members registered."
}
```

### 6.3 백오피스 급여→연봉 라벨 변경 (`user.json` kr/en)
| 키 | 기존(kr) | 변경(kr) | 변경(en) |
|----|---------|---------|---------|
| `user.table.header.salary` | 급여 | **연봉** | **Annual Salary** |
| `user.modal.edit.label.salary` | 급여 | **연봉** | **Annual Salary** |
| `user.modal.regist.label.salary` | 급여 | **연봉** | **Annual Salary** |
| (placeholder/unit "만원"은 유지) | — | — | — |

### 6.4 인력관리 탭 라벨 키
- **신규 키** `projectDetail.tabs.userList` = "인력 목록" (kr) / "Members" (en) — 부모-자식 개편으로 자식 탭 라벨 필요.
  - `locales/kr/projectDetail.json` → `tabs` 객체에 `"userList": "인력 목록"` 추가.
  - `locales/en/projectDetail.json` → `tabs` 객체에 `"userList": "Members"` 추가.
- `projectDetail.user.table.head.3`("급여")는 인력 목록에서 컬럼 제거로 **미사용**. 키 삭제 시 head 인덱스가 밀리므로(현재 4=추가작업) **키는 남기고 UI에서만 제거**(회귀 최소화).

### 6.5 엑셀 업로드/다운로드 헤더 [C 확정]
- **[확정]** 백엔드 `UserService.js` 엑셀 다운로드 헤더 `Salary`(라인 528) 및 업로드 파서 컬럼명은 **머신 계약이므로 `Salary` 그대로 유지**. UI 라벨만 "연봉"으로 변경(§6.3). → 기존 업로드 템플릿 호환 보존, 백엔드 엑셀 코드 변경 없음.

---

## 7. 구현 작업 분해 (backend → frontend 순서 강제)

### Phase A — 백엔드 (backend-engineer)
1. [DB] `ddl/projectusers.sql.js`에 `ALTER_PROJECTUSERS_ADD_SALARY_TYPE` 추가 → `ddl/index.js` re-export → `migrate.js` v012 enqueue.
2. [Query] `ProjectUsersQuery.js`에 `FIND_SALARY_BY_PROJECT_ID`, `UPDATE_SALARY_BY_KEY` 추가. `PortfolioSnapshotQuery.MEMBER_ROWS`에 `salary_type`+`u.salary AS annual_salary` 조인 추가.
3. [Helper] `projectCost/EffectiveSalary.js` 신규(`computeProjectMonths`, `computeEffectiveSalary`, `resolveMemberSalaries`) + jest 테스트(PROJECT=투입급여, ANNUAL 월할환산, 1년≈12개월, 1개월미만/월중간/동일일/역전·누락 경계, annual null/0 가드, 하위호환).
4. [Repo] `ProjectUsersRepository.js`에 `findSalaryByProjectIdRepository`, `updateSalaryByKeyRepository` 추가.
5. [Service] `ProjectUsersService.js`에 `getProjectSalaryListService`(기간 페치 + `computeProjectMonths` + 유효급여 부착, **공휴일 페치 없음**), `updateProjectMemberSalaryService` 추가.
6. [Controller] `ProjectUsersController.js`에 `getProjectSalaryList`(guardedDefine), `updateProjectMemberSalary`(guardedDefine) 등록.
7. [Permission] `src/permission/PermissionMap.js`에 매핑 추가:
   ```js
   getProjectSalaryList: R('PROJECT_COST', 'detail'),
   updateProjectMemberSalary: W('PROJECT_COST', 'inherited'),
   ```
   → 계약 테스트(`permissionMap.contract.test.js`) 통과 확인.
8. [Cost] `ProjectCostService.js`: `projectMonths=computeProjectMonths(projStart,projEnd)`, `normalizeMembers`→`resolveMemberSalaries(...,{projectMonths})` 치환, `totalSalary=Σ유효급여`, 캐시 payload `_projectMonths` 추가, `buildByIssue`에 projectMonths 전달해 유효급여 반영.
9. [Portfolio] `PortfolioAggregator.js`: `projectMonths=computeProjectMonths(start,end)`, members.salary를 `computeEffectiveSalary(...,{projectMonths})`로 산정.
10. `npm test` (helper·cost·permission 계약).

### Phase B — 프론트 (frontend-engineer, Phase A 계약 확정 후)
1. [queryKey] `projectKeys.js`에 `salary(projectId, page)` 추가.
2. [Page] `pages/projectDetail/salary/SalaryManagementPage.jsx`(+ SalaryTable) 신규. getProjectSalaryList 소비(meta.projectMonths 헤더 표시), updateProjectMemberSalary mutation(salary+cost invalidate), userMap 병렬조회, PROJECT_COST canWrite 게이트, 연봉 미등록/기간 미설정 경고.
3. [Tabs] `constants/tabs.js`의 `projectUser` 탭을 부모-자식 구조로 개편(자식: 인력 목록=ProjectUserPanel, 급여 관리=SalaryManagementPage/canReadCost). 기본 자식=인력 목록.
4. [인력관리] `ProjectUserPanel.jsx`에서 salary head/row 셀 제거 + 미사용 import 정리(인력 목록 자식 탭으로 그대로 재사용).
5. [i18n] `locales/kr(en)/salary.json` 생성, `user.json` 급여→연봉 라벨 3키 변경, `projectDetail.json` `tabs.userList` 키 추가(kr/en) → `cd static/ui && npm run merge`.
6. `cd static/ui && npm run build` (merge 자동 실행) 확인.

### Phase C — 검증 (integration-verifier)
- §2.2 불변식 4항 교차검증(응답 shape ↔ invoke 소비, effective_salary=salary(PROJECT), 비용 하위호환).
- 권한 매핑 누락(deny-by-default) 계약 테스트, 빌드/jest.

---

## 8. 결정 사항 (전부 확정)

- **[A] 환산식 = 월할** ✅ 확정 — `effective(ANNUAL) = round((annual/12) × projectMonths)`. `projectMonths = round(inclusiveCalendarDays / 30.4375, 2)`(네이티브 Date, dayjs 불필요). 근무일 기반 폐기(유급휴가·공휴일에도 급여 지급되는 실제와 정합). 공휴일 페치는 급여탭에서 제거. 비용 서비스의 기존 MM 안분·scheduleRate 로직은 불변.
- **[B] 탭 배치 = 인력관리의 자식 탭** ✅ 확정 — `analysisReport`의 `children:[]` 패턴으로 인력관리(부모) → [인력 목록(기본), 급여 관리(canReadCost)]. 기존 진입 동작 = 인력 목록으로 보존.
- **[C] 엑셀 헤더 = `Salary` 유지** ✅ 확정 — 머신 헤더 불변, UI 라벨만 연봉. 백엔드 엑셀 코드 변경 없음.
- **[D] 할당 시 모드 = 기본 PROJECT 삽입** ✅ 확정 — 인력 추가는 PROJECT로 삽입, 모드 편집은 급여 관리 탭에서. UserAddModal 변경 없음.

> 미해결 사항 없음. backend-engineer / frontend-engineer는 본 설계서를 단일 진실로 구현 착수 가능.
