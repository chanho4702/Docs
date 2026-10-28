# 급여 관리 리뉴얼 — 백엔드 구현 보고서 (Phase A)

구현: backend-engineer / 2026-07-13
설계서: `_workspace/salary-management/01_architect_design.md` (§2 경계면 계약 = 단일 진실)

> **frontend 필독**: 아래 §"실제 응답 shape"이 글자 그대로의 계약이다. invoke 소비 코드는 이 shape을 기준으로 작성하라.

---

## 1. 변경/신규 파일 목록

### 신규
| 파일 | 내용 |
|------|------|
| `src/resolver/projectCost/EffectiveSalary.js` | 순수 헬퍼: `computeProjectMonths`, `computeEffectiveSalary`, `resolveMemberSalaries` |
| `src/resolver/projectCost/__test__/EffectiveSalary.test.js` | jest 34케이스 (월할 환산·경계·하위호환) |

### 수정
| 파일 | 변경 |
|------|------|
| `src/rdb/schema/ddl/projectusers.sql.js` | `ALTER_PROJECTUSERS_ADD_SALARY_TYPE` export 추가(멱등 ADD COLUMN IF NOT EXISTS) |
| `src/rdb/schema/ddl/index.js` | `ALTER_PROJECTUSERS_ADD_SALARY_TYPE` re-export |
| `src/rdb/schema/migrate.js` | import + `v012_alter_projectusers_add_salary_type` enqueue (v011 뒤) |
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_SALARY_BY_PROJECT_ID`, `UPDATE_SALARY_BY_KEY` 쿼리 2개 추가 |
| `src/rdb/query/PortfolioSnapshotQuery.js` | `MEMBER_ROWS`에 `salary_type` + `u.salary AS annual_salary` (users LEFT JOIN) 추가 |
| `src/resolver/projectIssue/ProjectUsersRepository.js` | `findSalaryByProjectIdRepository`, `updateSalaryByKeyRepository` 추가 |
| `src/resolver/projectIssue/ProjectUsersService.js` | `getProjectSalaryListService`, `updateProjectMemberSalaryService` 추가 (+ import 3개) |
| `src/resolver/projectIssue/ProjectUsersController.js` | guardedDefine `getProjectSalaryList`, `updateProjectMemberSalary` 등록 |
| `src/permission/PermissionMap.js` | `getProjectSalaryList: R('PROJECT_COST','detail')`, `updateProjectMemberSalary: W('PROJECT_COST','inherited')` |
| `src/utils/errors/ErrorCodes.js` | `INVALID_SALARY_TYPE` 코드 추가 |
| `src/resolver/projectCost/ProjectCostService.js` | `normalizeMembers`(로컬) 제거→`resolveMemberSalaries`, `totalSalary=Σ유효급여`, 캐시 `_projectMonths`, `buildByIssue`에 projectMonths 전달 |
| `src/resolver/portfolioDashboard/PortfolioAggregator.js` | `members.salary`를 `computeEffectiveSalary`로 산정(월할), `projectMonths=computeProjectMonths(startDate,endDate)` |

> **index.js 변경 없음**: `registerProjectUsersController`는 이미 `src/index.js`에 등록됨. 신규 함수는 같은 컨트롤러 안 guardedDefine이라 재등록 불필요.

---

## 2. 실제 응답 shape (글자 그대로 — frontend 소비 계약)

모든 함수는 `guardedDefine`(→ 내부 responseWrapper)로 감싸져 `invoke` 결과가
성공 시 `{ success: true, ...서비스반환 }`, 실패 시 `{ success: false, error }`로 직렬화된다.

### `getProjectSalaryList`
- 입력 payload: `{ project_id: string, page?: number=1, pagesize?: number=10 }`
- 서비스 반환: `{ rows, meta }` → invoke 결과:
```
{
  success: true,
  rows: SalaryRow[],
  meta: { projectMonths: number }
}
```
- `SalaryRow` (각 원소, **snake_case**):
```
{
  project_member_id: string,          // BIN_TO_UUID
  account_id:        string,          // jira accountId (프론트가 getUser 로 아바타/이름 조달)
  role_key:          string | null,
  level_key:         string | null,
  salary:            number,          // 투입 급여 (projectusers.salary). 편집 대상
  salary_type:       'PROJECT' | 'ANNUAL',  // 서버가 NULL→'PROJECT' 정규화. 편집 대상
  annual_salary:     number | null,   // 연봉 (users.salary). 읽기 전용. 미등록 시 null
  effective_salary:  number,          // 서버 환산 유효 인건비. 읽기 전용. 항상 number(NaN 없음)
  total_count:       number           // 페이징 총건수 (COUNT(1) OVER())
}
```
- **project_id 누락/미소속 프로젝트 등 빈 결과**: `{ success: true, rows: [], meta: { projectMonths: 0 } }` (rows는 항상 배열).
- **effective_salary 불변식**: `salary_type='PROJECT'` 행은 `effective_salary === Math.round(salary)`. `salary_type='ANNUAL'`는 `round((annual_salary/12) × projectMonths)`, annual_salary null/0 또는 projectMonths 0 → 0.

### `updateProjectMemberSalary`
- 입력 payload: `{ project_member_id: string, salary?: number|'', salary_type?: 'PROJECT'|'ANNUAL'|'' }`
  - 미전송/빈 문자열 필드는 **미변경**(CASE '' 패턴). frontend는 변경 안 하는 필드에 `''`를 보내거나 아예 생략하면 된다.
- 서비스 반환: `executeQuery` 결과(Forge SQL) 그대로 → invoke 결과:
```
{
  success: true,
  rows?: [],            // Forge SQL 결과 객체의 필드 (UPDATE는 보통 빈 배열/undefined)
  affectedRows?: number // 변경 행 수 (Forge SQL 제공값)
  // ...(Forge SQL 결과 객체의 나머지 필드가 spread됨)
}
```
> frontend는 **`success`만 사용**할 것(계약 §2.1). 나머지 필드는 부가 정보이며 shape이 Forge SQL 드라이버에 의존한다.
- `salary_type`이 `'PROJECT'|'ANNUAL'|''` 이외 값 → `{ success:false, error:{ name:'LogicalError', code:'INVALID_SALARY_TYPE', ... } }`.

---

## 3. 계약 불변식 검증 (설계 §2.2)

1. ✅ `getProjectSalaryList` 응답은 항상 `{success, rows, meta}` — rows는 배열(hit/miss 무관, 빈 케이스도 `rows:[]`).
2. ✅ `effective_salary`는 항상 number(NaN 금지 — 헬퍼가 `|| 0` 가드). PROJECT 행 `effective_salary === round(salary)`.
3. ✅ 하위호환: 전 멤버 PROJECT 모드면 `Σ유효급여 = Σ투입급여`. ProjectCostService의 `totalSalary`가 기존 `summary.total_salary`와 동일값이 되어 BAC/AC/EV·byRole/byLevel/byIssue 결과 불변. (jest `resolveMemberSalaries` 하위호환 케이스로 커버, 기존 CostCalculator/PortfolioAggregator 테스트 전부 통과)
4. ✅ `updateProjectMemberSalary`는 전송된 필드만 갱신(빈 문자열/undefined = 미변경, `CASE ? WHEN '' THEN col ELSE ? END`).

---

## 4. 설계 대비 달라진 점

- **거의 없음.** 설계서 §3을 그대로 구현. 파일 경로/함수명/쿼리 모두 계약대로.
- `INVALID_SALARY_TYPE`를 `ErrorCodes.js`에도 추가(설계는 LogicalError만 언급했으나 프로젝트 컨벤션상 코드 상수 등록). LogicalError 첫 인자로 문자열 코드를 직접 전달하므로 동작에는 영향 없음.
- 설계 §7-7이 언급한 `permissionMap.contract.test.js`는 **실제로 존재**(`test/permission/permissionMap.contract.test.js`, root jest가 실행). 두 신규 매핑 추가 후 통과 확인.
- `getProjectSalaryListService`에 `pagesize` 파라미터도 payload에서 받도록 구현(기본 10). 프론트는 `{project_id, page}`만 보내도 됨.
- ProjectCostService 미스 경로의 로컬 `normalizeMembers` 함수는 제거(더 이상 사용처 없음). 미스 경로 `members`는 이제 `resolveMemberSalaries` 결과(=`.salary`가 유효급여)를 그대로 `buildSalaryMap`/byRole/byLevel/byIssue에 사용.

---

## 5. npm test 결과 (root, jest)

```
Test Suites: 14 passed, 14 total
Tests:       219 passed, 219 total
Time:        ~8.7 s
```
- 신규 `src/resolver/projectCost/__test__/EffectiveSalary.test.js` — **PASS** (computeProjectMonths 경계 10, computeEffectiveSalary PROJECT/ANNUAL 14, resolveMemberSalaries 6).
- `test/permission/permissionMap.contract.test.js` — **PASS** (신규 2매핑 ↔ 등록집합 정합).
- 기존 `CostCalculator.test.js`, `PortfolioAggregator(.AsApp).test.js` 전부 통과(하위호환 회귀 없음).
- StorageService 테스트의 `console.error` 출력은 **의도된 catch-path 테스트**(기존, 실패 아님).

**잔존 실패 없음.**

---

## 6. frontend 인수인계 메모

- 조회: `invoke('getProjectSalaryList', { project_id, page })` → `res.rows`(SalaryRow[]), `res.meta.projectMonths`(헤더 "투입 개월수" 표시용).
- 편집: `invoke('updateProjectMemberSalary', { project_member_id, salary?, salary_type? })` → `res.success`만 확인. onSuccess에서 `projectKeys.salary(project_id)` **+ `projectKeys.cost(project_id)`** invalidate(비용 탭 정합).
- 사용자 표시명/아바타는 `account_id`로 별도 조달(기존 ProjectUserPanel의 getUser 병렬조회 패턴 재사용) — 응답에 displayName 없음.
- 경고 UI 트리거: `annual_salary === null`(연봉 미등록 → `salary.warn.noAnnual`), `meta.projectMonths === 0`(기간 미설정 → `salary.warn.noPeriod`). 두 경우 ANNUAL 행 `effective_salary`는 0.
- 권한: 탭 노출/조회 = `canRead('PROJECT_COST')`, 편집 = `canWrite('PROJECT_COST')`. 서버 가드도 동일(PROJECT_COST detail/inherited).
