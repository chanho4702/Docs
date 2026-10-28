# 자원관리 재편 v3 — 백엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **범위**: (A) `insertProjectusers` 권한 OR 확장 1키 + 계약 테스트 갱신 / (B) 사용자 mid-turn 요청 — 배정 인원 명단 중복 게이지 바 1개 제거(프론트).
- **테스트**: 루트 `npm test` → **18 suites / 334 tests 전부 통과** / 프론트 `resource/assignment` → **3 suites / 35 tests 통과**. 회귀 0.

---

## A. `insertProjectusers` 권한 OR 확장 (게이트 미러링 위반 해소)

### 배경
/resource [프로젝트 배정] 탭의 "배정할 작업 없음 → 프로젝트에 인력으로 배정" 폴백은 `assignWorkItem`(239행)과 동일한 배정 게이트(PROJECT write **OR** RESOURCE_MANAGEMENT write)를 써야 한다. 그러나 폴백이 재사용하는 기존 resolver `insertProjectusers`(74행)는 `W('PROJECT', 'inherited')` = PROJECT write 단일이라, RESOURCE_MANAGEMENT write 만 가진 사용자는 프론트 버튼은 보이는데 서버 가드가 거부(게이트 미러링 위반).

### 변경 — `src/permission/PermissionMap.js`
```js
// 변경 전 (74행)
insertProjectusers: W('PROJECT', 'inherited'),

// 변경 후
insertProjectusers: OR([['PROJECT', 'write'], ['RESOURCE_MANAGEMENT', 'write']], 'inherited'),
```
- `assignWorkItem`(239행)과 **동일 패턴** — write 요구(read 아님) + project mode `'inherited'` 유지.
- 사유 주석 3줄 추가([resource-assignment-merge 2026-07-23]).
- **무약화 근거**: (1) read 가 아니라 write 를 요구하므로 조회 전용 자원관리자(read만)는 여전히 배정 불가(최소 권한). (2) project mode `'inherited'` 유지 → payload 에 projectId 추출되면 소속 검증 그대로 걸림(스코프 불변). (3) resolver/service 로직 무변경 — 기존 `insertProjectusers` 재사용.

### resolver 응답 shape
- **resolver/service 로직은 무변경**이므로 `insertProjectusers` 응답 shape은 기존과 동일(이번 작업은 권한 매핑 1키 + 게이트 통과 principal 집합만 넓힘). 프론트는 소비 경로를 바꿀 필요 없음.

### 계약 테스트 — `test/permission/permissionMap.contract.test.js`
`resource-assignment-merge grant OR 확장` describe 블록 기존 스타일에 맞춰 추가:

1. **키 형태 검증** (`getWorkAssignmentPool` 테스트 위):
   - `insertProjectusers` = OR[PROJECT write, RESOURCE_MANAGEMENT write], project=`inherited`
   - RESOURCE_MANAGEMENT **read 로는 안 열림**(`hasGrant(...,'RESOURCE_MANAGEMENT','read') === false`) — 최소 권한 고정.
2. **isSatisfied OR 시맨틱** (assignWorkItem write OR 테스트 뒤, 동일 principal 픽스처 재사용):
   - `resourceReadOnly`(자원관리 read만) → `insertProjectusers` **차단**(write 필요).
   - `resourceWrite`(자원관리 write) → `insertProjectusers` **통과**(PROJECT 미보유여도).

### 계약 테스트 결과
```
test/permission/permissionMap.contract.test.js (6.4 s)  PASS
Test Suites: 18 passed, 18 total
Tests:       334 passed, 334 total   (직전 331 → +3: 키형태 1 + isSatisfied 2)
```

---

## B. 배정 인원 명단 중복 게이지 바 제거 (사용자 mid-turn 요청, 프론트)

### 진단
`static/ui/src/pages/resource/assignment/detail/ProjectDetailPanel.jsx` 의 "배정 인원 명단" 각 로우가 **동일한 `r.completionRate` 를 두 번** 게이지 바로 렌더:
- `WorkloadCell` (유지) — 진행바 + `pct%` + 할당/처리/남은 MD 브레이크다운 + 툴팁 (정보량 풍부, overview 등 타 화면과 공용).
- `MiniProgress` (제거) — 같은 `completionRate` 를 틸 바 + `pct%` 로만 다시 표기(순수 중복).

### 변경
1. 로우에서 `<span style={{flex:'0 0 100px'}}><MiniProgress rate={r.completionRate}/></span>` 삭제 → `WorkloadCell` 단일 게이지 유지.
2. 미사용이 된 로컬 `MiniProgress` 함수 정의 삭제.
3. `MiniProgress` 만 쓰던 `import { tealFill } from '../theme'` 삭제(그 외 참조 없음 grep 확인).
- `MiniProgress` 를 참조하는 테스트/타 파일 없음(`static/ui/src` 전역 grep 0건).

### 결과
- 프론트 `resource/assignment` 테스트 3 suites / 35 tests 통과. 회귀 0.

---

## v3.5 — 프로젝트 배정 취소(멤버 제거) resolver 신설

- **일자**: 2026-07-24
- **범위**: /resource [프로젝트 배정] 탭 배정 인원 명단에서 "프로젝트 배정 취소"를 위한 신규 resolver 1건. roster 행에 `project_member_id`(PK)가 없고 `accountId` 만 있어 기존 `deleteProjectUsersByKey`(PK 요구)를 못 써서, `(project_id, accountId)` 복합키 삭제 경로 신설.
- **테스트**: 루트 `npm test` → **18 suites / 337 tests 전부 통과** (직전 334 → +3: 계약 키형태 1 + isSatisfied 2).

### 신규 resolver — `removeProjectMemberByAccount`

| 항목 | 값 |
|---|---|
| resolver 함수명 | `removeProjectMemberByAccount` |
| 권한 | `OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']], 'inherited')` — insertProjectusers/assignWorkItem 미러링 |
| 등록 위치 | `ProjectUsersController.js` `guardedDefine(resolver, 'removeProjectMemberByAccount', ({payload}) => removeProjectMemberByAccountService(payload))` |
| service | `removeProjectMemberByAccountService({project_id, accountId})` |
| repository | `deleteProjectMemberByAccountRepository([project_id, accountId])` |
| SQL | `ProjectUsersQuery.DELETE_BY_PROJECT_AND_ACCOUNT` (`WHERE project_id = UUID_TO_BIN(?) AND account_id = ?`) |

**입력 payload (프론트가 보낼 것)**:
```js
{ project_id: string /*uuid*/, accountId: string /*Jira accountId*/ }
```
> ★ inherited scope 가드가 `payload.project_id` 로 소속 검증하므로 `project_id` 를 **반드시 payload 에 포함**해야 한다(키 이름 `project_id`, `projectId` 아님 — 가드는 둘 다 보지만 서비스/SQL 은 `project_id` 소비).

**성공 응답 shape (`invoke` 수신값, 글자 그대로)** — responseWrapper 가 `...result` 스프레드:
```js
{
  success: true,
  project_id: string,   // 요청 그대로 echo
  accountId: string,    // 요청 그대로 echo
  removed: true
}
```
> `content` 래핑 없음 — 최상위에 `project_id`/`accountId`/`removed` 가 바로 붙는다. 프론트는 `res.success` 로 성공 판정 후 해당 accountId 행을 명단에서 제거(또는 쿼리 invalidate)하면 된다.

**대상 행 미존재(이미 제거됨/오타 accountId)** — `rowsAffected === 0`:
```js
{
  success: false,
  error: { name: 'LogicalError', code: 'USER_NOT_FOUND', message: 'USER_NOT_FOUND', cause: '' }
}
```
> 시맨틱: 인력 관리 탭 `deleteProjectUsersByKey` 와 동일 — **멤버십만 제거**(이슈 담당/coworker 해제는 하지 않음). Forge SQL 단건 DELETE 라 트랜잭션/cascade 무관.

### 수정 파일 (지시 범위 내 6종)
1. `src/rdb/query/ProjectUsersQuery.js` — `DELETE_BY_PROJECT_AND_ACCOUNT` 추가 (DELETE_BY_KEY 스타일 답습).
2. `src/resolver/projectIssue/ProjectUsersRepository.js` — `deleteProjectMemberByAccountRepository` 추가.
3. `src/resolver/projectIssue/ProjectUsersService.js` — `removeProjectMemberByAccountService` 추가 + import 1줄.
4. `src/resolver/projectIssue/ProjectUsersController.js` — `guardedDefine('removeProjectMemberByAccount', ...)` 등록 + import 1줄.
5. `src/permission/PermissionMap.js` — `removeProjectMemberByAccount` OR 매핑 + 사유 주석.
6. `test/permission/permissionMap.contract.test.js` — 키형태 1 + isSatisfied 2 계약 테스트(insertProjectusers 스타일).

### 개선 제안 (이번 미구현 — 지시대로 제안만)
- **전용 not-found 에러 코드**: 현재 대상 행 미존재를 `USER_NOT_FOUND` 로 재사용(ErrorCodes.js 무변경 제약). 의미 정확도를 위해 `PROJECT_MEMBER_NOT_FOUND` 신설을 후속 검토 권장. 프론트는 code 문자열이 아니라 `success` 로 분기하면 이 변경에 영향받지 않음.
- **payload 필수값 가드 부재**: `project_id`/`accountId` 누락 시 별도 검증 throw 없이 DELETE→`rowsAffected===0`→`USER_NOT_FOUND` 로 귀결(또는 undefined 바인딩 시 SqlError). 프론트 계약이 둘 다 항상 전송하므로 현 범위에선 무해하나, 방어적 required 체크(예: `ASSIGNMENT_PROJECT_ID_REQUIRED` 재사용)는 후속 고려 가능.

---

## 제약 준수
- **A/v3.5 백엔드**: 지시한 파일들만 수정. v3.5 는 신규 resolver 1건 + 기존 계층 패턴(Query/Repo/Service/Controller/PermissionMap/계약테스트) 답습, resolver/service 로직은 기존 함수 무변경(신규 추가만). ErrorCodes.js·index.js 무수정(ProjectUsersController 는 이미 index.js 등록됨 → 신규 컨트롤러 아님).
- **B 프론트**: 사용자 직접 요청에 따른 중복 UI 제거(순수 삭제, shape·데이터 경로 영향 없음). v3.5 에서는 프론트 무수정(별도 담당).
