# 마이페이지 (My Page) — 백엔드 구현 리포트

브랜치: RFC-168 · 입력: `01_architect_design.md` · 구현자: backend-engineer

> **프론트가 소비할 실제 응답 shape을 글자 그대로 기록**한다. invoke 결과는 항상 `responseWrapper` 표준으로 최상위에 `success` 가 붙는다: `{ success:true, ...서비스반환 }` / 실패 `{ success:false, error:{ name, code, message, cause } }`.

---

## 1. 신규 구현 resolver (SELF, 2종)

파일: `src/resolver/myPage/MyPageController.jsx` (신규)
등록: `registerMyPageController(resolver)` — `src/index.js` 에 import + 호출 추가 완료.

둘 다 신규 Service/Repository/Query **없이** 기존 `resourceManagement/ResourceManagementService` 의
`getUserSkillsService` / `setUserSkillsService` 에 위임. accountId 는 `context.accountId` 로 **강제**(payload.accountId 무시 → 타인 스킬 열람/수정 차단). SELF 함수는 guard 가 principal 을 부착하지 않으므로 `setMySkills` 는 createdId 용 principal 을 `{ accountId: context.accountId }` 로 직접 구성해 전달.

### #4 `getMySkills` — 신규(SELF)
- 입력: `{}` (payload 무시, `context.accountId` 사용)
- 실제 응답 shape (success 시, 글자 그대로):
```js
{ success: true, data: { accountId: string, skillIds: string[] } }
```
- 위임: `getUserSkillsService({ accountId: context.accountId })`
- **설계서 §8 계약과 일치.**
- accountId 없음(미인증) 시: `getUserSkillsService` 가 `LogicalError(USER_ID_REQUIRED)` throw → `{ success:false, error:{ name, code, message, cause } }`.

### #5 `setMySkills` — 신규(SELF)
- 입력: `{ skillIds: string[] }` (accountId 는 context 로 강제)
- 실제 응답 shape (success 시, 글자 그대로):
```js
{ success: true, data: { accountId: string, count: number } }
```
- `count` = 저장된(중복 제거·falsy 제거 후) skillId 개수. set 시맨틱(DELETE by account → bulk INSERT 전체 교체).
- 위임: `setUserSkillsService({ accountId: context.accountId, skillIds }, { accountId: context.accountId })`
- **설계서 §8 계약과 일치.**

---

## 2. 재사용 resolver (무수정) — 실제 응답 shape

세 함수 모두 `MyWorkController.jsx` 에 SELF 로 이미 등록됨. **코드 변경 없음.** 프론트 소비를 위해 실제 반환 shape 기록.

### #1 `getMyProjectList` — 재사용 (`getMyProjectListService`, MyWorkService.jsx:10)
- 입력: `{ accountId }` (MyWorkController 가 context 로 강제)
- 실제 서비스 반환: `return { success: true, data }` → responseWrapper 통과 후 최상위:
```js
{ success: true, data: [ {
    ...project,                       // MyWorkRepository 원본 컬럼 (project_id, project_name, start_date, end_date, role_key, level_key, project_status_key, ...)
    role:  roleData | null,           // findRoleByIdService 의 roleData (없으면 null)
    level: levelData | null,          // findLevelByIdService 의 levelData (없으면 null)
    status: statusObj | null          // findProjectStatusByIdService 결과 객체 (없으면 null; 내부에 name/color 등 포함)
} ] }
```
- 주의: `role`/`level`/`status` 는 각 서비스가 돌려주는 객체 그대로(=`roleData`/`levelData`/status 객체). `status` 는 `{ name, color, ... }` 형태(설계서 §8과 일치). `project_id` 로 `allProjectIds` 조달.

### #2 `getMyIssueList` — 재사용 (`getMyIssueListService`, MyWorkService.jsx:204)
- 입력: `{ accountId, selectedProjectIds: string[], coworkerFieldId }` (accountId context 강제)
- 실제 서비스 반환: `return { data: issues }` → 최상위:
```js
{ success: true, data: [ Issue ] }
```
- `Issue` 는 Jira search 응답 이슈 원본. `fields.status.statusCategory`(`{ id, key, colorName, name }`) 포함 — **처리율/완료 판정은 `fields.status.statusCategory.key === 'done'`** 로 프론트 집계(설계서 §2 판단대로, 전용 집계 resolver 없음).
- `selectedProjectIds` 빈 배열이면 이슈 없음 → `data: []`. 프론트는 #1 결과의 project_id 전체를 넘길 것(`enabled: allProjectIds.length>0 && !!coworkerFieldId`).

### #3 `getMyCalendarWorklog` — 재사용 (`getMyCalendarWorklogService`, MyWorkService.jsx:141)
- 입력: `{ accountId, selectedProjectIds: string[], startDate, endDate }` (accountId context 강제)
- 실제 서비스 반환: `return { data: worklogChunks.filter(Boolean) }` → 최상위:
```js
{ success: true, data: [ Issue ] }   // 내가 작성한 워크로그가 1건 이상인 이슈만 (null 제거됨)
```
- 각 이슈의 `fields.worklog.worklogs` 는 **"내가 작성(author.accountId === accountId) + 날짜범위(startDate~endDate)" 로 필터된 배열**. worklog total>maxResults(20+) 시 추가 로드 후 합침(전용 병렬 페처, p-limit 5 — 공통 경로 미수정).
- 각 worklog 항목: `{ id, author:{ accountId, displayName, ... }, started, timeSpent, timeSpentSeconds, comment, ... }` (Jira 원본). 워크로그가 하나도 없는 이슈는 `data` 에서 제외됨.

---

## 3. `getSkillList` 권한 완화 (설계서 §8 결정 반영)

- 위치: `src/permission/PermissionMap.js:205` (수정 후)
- 변경: `OR([['SKILL_MANAGEMENT','read'],['RESOURCE_MANAGEMENT','read'],['USER_MANAGEMENT','read']])` → **`'PUBLIC'`**
- 사유: My Page 는 전원 접근(`permission:null`). 스킬 편집 UI(`SkillMultiSelect`)가 일반 멤버에게도 카탈로그를 불러오려면 조회 게이팅 완화 필요. 스킬 마스터는 비민감 참조 데이터(스킬명/직군).
- **다른 화면 영향 확인 완료**: `getSkillList` 소비처는 (a) 프론트 invoke 3곳(백오피스 skill 페이지, `SkillMultiSelect`) — 완화로 접근만 넓어짐(조회), (b) 백엔드 내부 `ResourceManagementService.js:57` 의 `getSkillListService()` **직접 호출**(invoke 아님, 가드 미경유) → 권한 변경 영향 없음. **쓰기(add/update/delete/addBulk)Skill 권한은 그대로** — 완화는 목록 조회 1건 한정.
- 실제 `getSkillList` 응답 shape (참고, 프론트 SkillMultiSelect 가 소비):
```js
{ success: true, data: [ { id: string, name: string, category: string, description: string } ] }
```
  > 설계서 §8은 `{ id, name, category }` 로 기재했으나 **실제 서비스는 `description` 필드도 포함**한다(`SkillService.js:58`). 추가 필드일 뿐 계약 위배 아님(SkillMultiSelect 는 id/name/category 만 사용).

---

## 4. PermissionMap 신규 엔트리

`src/permission/PermissionMap.js` 하단(ResourceManagement 다음)에 추가:
```js
// ── MyPage (MyPageController, 2) — SELF ───────────────────────────────────
getMySkills: 'SELF',
setMySkills: 'SELF',
```
- 계약 테스트(`test/permission/permissionMap.contract.test.js`) 는 등록집합 ↔ 맵키집합을 대조하므로, 동 테스트의 `collectRegisteredNames()` 에도 `registerMyPageController(mock)` import + 호출 추가함(아니면 orphan-mapping 실패).

---

## 5. 변경/신규 파일 목록

| 파일 | 구분 | 내용 |
|------|------|------|
| `src/resolver/myPage/MyPageController.jsx` | 신규 | `registerMyPageController` + `getMySkills`/`setMySkills`(SELF, 기존 서비스 위임) |
| `src/index.js` | 수정 | `registerMyPageController` import + 등록 호출 추가 |
| `src/permission/PermissionMap.js` | 수정 | `getMySkills:'SELF'`, `setMySkills:'SELF'` 추가 / `getSkillList` → `'PUBLIC'` 완화 |
| `test/permission/permissionMap.contract.test.js` | 수정 | 신규 컨트롤러를 mock 등록집합에 반영(계약 테스트 통과용) |

- 신규 Service/Repository/Query/DB/마이그레이션/manifest **없음**(설계서 §5 대로 DB 변경 없음).

---

## 6. 테스트 결과 (`npm test`, 루트 jest)

```
Test Suites: 8 failed, 14 passed, 22 total
Tests:       219 passed, 219 total
```
- **백엔드 테스트 219개 전부 통과.** `test/permission/permissionMap.contract.test.js` **PASS**(신규 SELF 2종 매핑↔등록 대조 통과, getSkillList 구조 유효성 통과).
- 8개 실패 Suite 는 **전부 프론트(`static/ui/src/**`) ESM 파일** — 루트 jest 가 `import` 구문을 파싱 못 해 suite 로드 단계에서 실패(portfolioAggregate/taskHistory/gantt*/numberUtils/TimeUtils/jqlMaker/listUtils). **본 변경과 무관한 기존(pre-existing) 실패**이며 프론트 테스트는 `cd static/ui && npm test` 로 별도 실행됨.

---

## 7. 프론트 소비 체크리스트 (다음 단계 frontend 참고)

- 모든 응답은 최상위 `success` + `data`. 실패 시 `error` 확인.
- `getMySkills` → `res.data.skillIds`(string[]) 를 `SkillMultiSelect` value 로. `setMySkills({ skillIds })` 성공 후 `myPageKeys.mySkills(accountId)` invalidate.
- `getMyProjectList` → `res.data` (배열), `project_id`/`project_name`/`start_date`/`end_date`/`role`/`level`/`status`.
- `getMyIssueList` → `res.data` (Issue[]). 처리율 = `data.filter(i=>i.fields.status?.statusCategory?.key==='done').length / data.length`, 남은작업 = 그 외.
- `getMyCalendarWorklog` → `res.data` (Issue[]), `fields.worklog.worklogs` 는 이미 내 것으로 필터됨 → 평탄화해 최근순 리스트.
- accountId 는 넘겨도 서버가 context 로 덮어씀(무해). projectIds 는 #1 결과 전체 전달.
