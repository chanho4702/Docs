# Resource Allocation Graph — 백엔드 구현 리포트

> 설계 `01_architect_design.md` §2 계약 기준. frontend-engineer 는 이 문서의 **실제 응답 shape** 을 단일 진실로 소비한다.

## 1. 구현한 함수 (신규)

| 종류 | 이름 | 파일 |
|------|------|------|
| resolver 서비스(신규) | `getResourceAllocationGraphService({ includeClosed })` | `ResourceManagementService.js` |
| SQL 쿼리(신규 2변형) | `ProjectUsersQuery.FIND_ALL_ALLOCATIONS`(활성) / `FIND_ALL_ALLOCATIONS_WITH_CLOSED`(종료 포함) | `ProjectUsersQuery.js` |
| Controller 등록(신규) | `guardedDefine(resolver, 'getResourceAllocationGraph', …)` | `ResourceManagementController.js` |
| 권한 매핑(신규) | `getResourceAllocationGraph: R('RESOURCE_MANAGEMENT')` | `PermissionMap.js` |

`src/index.js` — `registerResourceManagementController` 기존 호출(line 64) → **변경 없음(확인 완료)**.

## 2. 실제 응답 shape (프론트가 글자 그대로 소비)

resolver: `getResourceAllocationGraph`
- 입력 payload: `{ includeClosed?: boolean }` (기본 `false` = 종료 제외/활성만)
- 권한: `R('RESOURCE_MANAGEMENT')`
- 접근 경로: `invoke('getResourceAllocationGraph', { includeClosed })` → `res.content.*`

**실제 성공 응답 (`res.content`):**
```jsonc
{
  "projects": [
    {
      "projectId": "uuid-string",          // BIN_TO_UUID
      "projectName": "string" | null,
      "statusKey": "status-xxx" | null,     // project.project_status_key
      "statusName": "진행중" | null,         // status 엔티티(KVS) 라벨 해석
      "statusColor": "green" | null,        // status 엔티티 color (상태 배지용, 엣지색 아님)
      "endDate": "2026-12-31" | null,       // date-only(yyyy-mm-dd)
      "closed": false,                      // isProjectClosed(endDate) — 재사용(ResourceMatch)
      "memberCount": 5                      // 이 프로젝트 배정 distinct 인원 수(정수)
    }
  ],
  "members": [
    {
      "accountId": "string",
      "displayName": "string",              // userMap 실패 시 accountId 폴백
      "avatarUrl": "https://.../48x48" | null, // jira.avatarUrls['48x48']
      "assignedCount": 3,                   // 배정된 distinct 프로젝트 수(중복배정 강조 기준, 정수)
      "util": 0.82 | null,                  // rollup utilizationPeople 재사용(없으면 null)
      "utilBand": "idle|normal|over|red|unknown"  // classifyUtilBand(util, bands)
    }
  ],
  "links": [
    { "projectId": "uuid-string", "accountId": "string", "roleKey": "role-xxx" | null, "roleName": "개발자" | null }
  ],
  "generatedAt": "2026-07-21T09:00:00.000Z" // new Date().toISOString()
}
```
- **엣지 색은 백엔드가 지정 안 함** (프론트가 projectId 기준 결정적 팔레트). `statusColor` 는 상태 배지용.
- **INNER JOIN**이라 배정 인력 ≥1 인 프로젝트만 등장(빈 프로젝트/무배정 인원은 노드 없음). 빈 상태는 프론트 처리.
- `links[]` 는 projectusers 행 1건 = 배정 1건(project↔account 유니크). N:M 엣지.
→ **설계서 §2.1 계약과 완전 일치.**

## 3. 계약 이탈 여부

- **이탈 없음.** projects/members/links/generatedAt 및 각 필드가 §2.1 과 글자 그대로 일치.
- `includeClosed` 만 서버 분기(활성 vs 종료 포함). 상태·프로젝트 다중선택 필터는 프론트 클라이언트 처리(설계 §2/§4.4) — 백엔드는 관여 안 함.
- `closed` 필드: 활성 로드(`includeClosed:false`)에서는 SQL 이 이미 미종료만 반환하므로 대개 `false`. 단 `end_date == 오늘` 경계는 SQL 활성(포함)·`isProjectClosed` 미종료(false)로 **일관**(둘 다 `>= CURDATE()` / `< today` 경계 동일).

## 4. 재사용 지점 (신규 페치 없음)

| 재사용 | 출처 | 용도 |
|--------|------|------|
| `userMap(rows)` | `backoffice/user/UserService` | accountId→{displayName, avatarUrls} **bulk 1회**(getBulkJiraUsersApi, N+1 없음). distinct accountId 만 전달. |
| `getRoleListService()` | `backoffice/role/RoleService` | `res.data` → roleName 라벨(links) |
| `getProjectStatusListService()` | `backoffice/projectStatus/ProjectStatusService` | `res.rows` → statusName/statusColor 라벨(projects) |
| `getRollupMeta()` | `portfolioDashboard/PortfolioSnapshotRepository` | `utilizationPeople` **KVS 1회 read** → util(members). 신규 워크로그 페치 없음. |
| `getSettingDataService()` | `backoffice/setting/SettingService` | util band 경계값(`resolveBands`) |
| `classifyUtilBand` | `resourceManagement/ResourceMatch` | util → utilBand |
| **`isProjectClosed(endDate)`** | `resourceManagement/ResourceMatch` (export) | closed 판정 — **resource-profile v2에서 도입한 것 재사용(중복 정의 안 함)**. 서비스 내 v1 로컬 `isProjectClosed`(status+name+date, 객체인자)와 이름 충돌 회피 위해 **`isProjectClosedByEndDate` 로 alias import**. |

- `buildPeopleContext()` 전체는 호출 안 함(skill/salary 불필요) — 필요한 조각만 병렬 조립(경량).
- 단일 SQL(project_users⋈project) 1회 + 병렬 재사용 조립 → **N+1 없음**. asApp 미사용(userMap 내부는 기존 bulk API). DDL 마이그레이션 없음.

## 5. 부분 성공 폴백

- `userMap` 실패 → `.catch` 빈 Map → member `displayName=accountId`, `avatarUrl=null`(그래프는 렌더).
- `getRollupMeta` 실패 → `.catch` null → `util=null`, `utilBand='unknown'`.
- role/status/settings(KVS read)는 정상 경로(라벨 미해석 시 개별 필드 null 폴백).
- **SQL 실패만 전파**(responseWrapper → `{success:false, error}`). 입력 검증 불필요(includeClosed 기본 false).

## 6. DDL 검증

- `project`: `project_name`, `project_status_key`, `end_date` 존재 확인(`ddl/project.sql.js`).
- `projectusers`: `project_id`, `account_id`, `role_key`, `INDEX(project_id, account_id)` 존재 확인(`ddl/projectusers.sql.js`).
- 쿼리 컬럼명 전부 실재. `end_date` 활성 필터 = `end_date IS NULL OR end_date >= CURDATE()` (FIND_ACTIVE_PROJECT_COUNT / PortfolioAggregator 컨벤션과 동일).

## 7. 변경/신규 파일

| 파일 | 변경 |
|------|------|
| `src/rdb/query/ProjectUsersQuery.js` | `FIND_ALL_ALLOCATIONS` / `FIND_ALL_ALLOCATIONS_WITH_CLOSED` 2변형 추가. |
| `src/resolver/resourceManagement/ResourceManagementService.js` | `getResourceAllocationGraphService` 신규 + `isProjectClosed` alias import. |
| `src/resolver/resourceManagement/ResourceManagementController.js` | `guardedDefine` 1건 추가. |
| `src/permission/PermissionMap.js` | `getResourceAllocationGraph: R('RESOURCE_MANAGEMENT')` 추가. |
| `src/index.js` | **변경 없음**(기존 호출). |

## 8. 테스트 결과 (`npm test` / 루트 jest, worktree 제외 스코프)

worktree 노이즈 제외 위해 `npx jest --roots ./src ./test` 로 리포 루트만 스코프:
```
Test Suites: 14 passed, 14 total
Tests:       229 passed, 229 total
Snapshots:   0 total
```
- **테스트 실패 0건.** 229건 전부 통과.
- `test/permission/permissionMap.contract.test.js` PASS → 신규 resolver `getResourceAllocationGraph` **등록집합 ↔ PermissionMap 키 정합 확인**(Controller guardedDefine 1건 ↔ 맵 R 매핑 1건).
- 신규 jest 케이스는 없음(이 라운드는 순수함수 신설 없이 v2 `isProjectClosed` 재사용). 기존 229건 회귀 없음.
- (참고) 전체 `npm test` 는 `.claude/worktrees/RFC-168/` 하위 suite 22건이 SyntaxError(ESM) 로 실패 표기되나 **타 세션 worktree 노이즈**로 제외 판정 — 내 변경과 무관, 리포 루트 동일 suite 는 전부 PASS.
```
```
