# 팀(Team) 기능 P0 — 프론트엔드 구현 리포트

> 작성: 2026-07-27 / frontend-engineer (**2차 개정** — 통합 검증 F1/F2/F3/O1 대응 반영. 상세는 **§5**)
> 입력: `_workspace/team-management/02_backend_report.md`(**2차 개정판 — 응답 shape 단일 진실 원천**), `03_verify_report.md`, `01_architect_design.md` §6·§7·§9
> 범위: **P0 프론트 항목만.** P1(TEAM_ONLY·팀 상속 미리보기·팀장) / P2(프로젝트 배정) / P3-A(심화 분석) / **P3-B(DnD)** 는 손대지 않았다.
>
> ⚠ §1~§4 는 1차 구현 기준 서술이며, **2차 개정으로 달라진 부분은 §5 가 최신**이다(충돌 시 §5 우선).

---

## 0. 최우선 항목 처리 결과 — `updateUser` 회귀 (백엔드 §0-A)

**처리 완료.** `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js`

```js
invoke("updateUser", {
    id: userId,
    roleKey:       editValues.role?.value       ?? null,
    levelKey:      editValues.level?.value      ?? null,
    permissionKey: editValues.permission?.value ?? null,
    teamKey:       editValues.team?.value       ?? null,   // 신규
    salary: editValues.salary == null || editValues.salary === '' ? null : Number(editValues.salary),
})
```

- read-merge 시맨틱(`undefined`=보존 / `null`=해제)을 코드 주석으로 함수 위에 못박았다.
- **`updateUser` 호출부는 프론트 전체에서 이 한 곳뿐이다**(grep 전수 확인: `invoke("updateUser"` 1건). 다른 회귀 surface 없음.
- **안전 장치**: `editValues.team` 의 초기값은 `teamOptions` 조회 결과가 아니라 `findUserByAccountId` 응답의 `teamKey/teamName` 에서 직접 만든다. 옵션 로딩이 늦거나 실패해도 "팀이 비어 있는 상태로 저장 → 해제"가 일어나지 않는다.
- 추가로 `isDirty` 비교에 `team` 을 넣어, 팀만 바꿔도 저장 버튼이 활성화된다.

---

## 1. 소비한 응답 shape — 어느 필드를 어디서 읽는지

> 모든 팀 resolver 는 `res?.success` 를 **먼저** 확인한 뒤 `res.content` 를 읽는다.

| resolver | 읽는 경로 | 소비 위치 |
|---|---|---|
| `getTeamList` | `content.teams[]` (`teamKey,name,parentTeamKey,depth,sortOrder,description,leaderAccountId,leaderName,leaderAvatarUrls,permissionKey,permissionName,memberCount,descendantMemberCount`) | `useTeamTree.js` → `TeamPage` → `buildTeamTree`/`TeamTreePanel` |
| | `content.unassignedCount` | `TeamPage` 상단 Badge (`team.unassigned.count`) |
| | `content.hasCycle` / `content.cycleKeys[]` | `TeamPage` 경고 배너 + `TeamTreePanel` 노드별 경고 아이콘 |
| | `content.truncated` | `TeamPage` 경고 배너 |
| | **`content.limits.maxTeams`** | truncated 배너 문구의 `{max}` 치환. **프론트에 maxDepth/maxTeams 리터럴을 두지 않았다**(M6). `constants/team.js` 상단에 그 금지를 명시 |
| `findTeamById` | `content.team.*` / `content.ancestors[]` / `content.children[]` / `content.members[]` | `useTeamDetail.js` → `TeamDetailPanel` |
| | `content.ancestors` **마지막 원소** | 편집 모달의 "상위 팀" 라벨. ⚠ 백엔드에 `parentTeamName` 필드가 **없어서** ancestors 로 유도했다(§4-1) |
| | `content.members[].isLeader` | 팀원 행 "팀장" 배지 |
| `getTeamOptions` | `content.options[]` (`value,label,depth,parentTeamKey`), `content.truncated` | `hooks/useTeamOptions.js` → `components/select/TeamSelect.jsx`. `depth` 는 **메뉴 들여쓰기에만** 쓰고 label 문자열은 변형하지 않는다 |
| `addTeam` | `content.teamKey` | 생성 직후 해당 팀을 트리에서 자동 선택 |
| `updateTeam` | `success` 만 (content 없음) | 편집 모달 |
| `deleteTeam` | `content.detachedUserCount` / `permissionLostCount` / `inheritanceChangedCount` | 삭제 성공 토스트. 0 이 아닌 항목만 문장을 덧붙인다 |
| | `content.removedProjectAssignCount` | **읽지 않는다** — P0 에서 항상 0(백엔드 §0-B). 화면에 "0건 삭제"를 띄우는 건 오독을 부른다 |
| `assignUsersToTeam` | `content.movedCount` | 배치 성공 토스트 |
| `unassignUsersFromTeam` | `content.removedCount` | 소속 해제 성공 토스트 |
| `getUserListWithPaging` | `content[i].teamKey` / `teamName` | 사용자 목록 팀 컬럼 + 팀원 배치 모달 후보 목록. ⚠ 이 resolver 의 `content` 는 **배열**이고 `page` 는 루트다(팀 resolver 의 객체 content 와 다름) |
| `findUserByAccountId` | 루트 `teamKey` / `teamName` (`{success, ...data}` 스프레드) | 사용자 수정 모달 초기값 |
| `getUserMetaCount` | **루트** `team[]` (`{id,name,count}`, `id:null·name:'Unassigned'`=팀 미지정) | 사용자 페이지 4번째 StatCard. **`content` 래퍼 없음** — `meta?.team` 으로 읽음 |
| `addUser` | 입력 `formData.team = {value}` | 사용자 등록 모달 `<Field name="team">` |
| `downloadExcel` | 입력 `team = {value}` | `UserSearchFilter` 의 searchParams 를 그대로 전달(기존 경로 재사용) |

### 팀 필터 3상태 — `null` 금지 규약 준수

| 값 | 만드는 곳 |
|---|---|
| 키 부재/`team:null` → **전체** | Select clear 시 `null` 이 들어가고, 백엔드는 `searchParams.team?.value` 를 읽으므로 `undefined` 가 된다 |
| `{ value:'<teamKey>' }` → 해당 팀 | 일반 팀 옵션 |
| `{ value:'__NONE__' }` → 팀 미지정 | `TeamSelect includeNoneOption` 이 만드는 옵션. 상수는 `static/ui/src/constants/team.js` 의 `TEAM_FILTER_NONE` (백엔드 `TeamTree.TEAM_FILTER_NONE` 과 글자 그대로 동일) |

`{ value: null }` 을 만드는 코드 경로는 없다. 팀원 배치 모달은 아예 **`teamFilter?.value` 가 있을 때만 `team` 키를 payload 에 넣는다.**

---

## 2. 변경/신규 파일 목록

### 신규 (16)

| 파일 | 내용 |
|---|---|
| `static/ui/src/constants/team.js` | `TEAM_FILTER_NONE` + "한계값 리터럴 금지(M6)" 주석 |
| `static/ui/src/backoffice/page/team/buildTeamTree.js` | 순수 함수 — `buildTeamTree`/`flattenTree`/`collectParentIds`/`collectAncestorKeys`/`filterTeamsByKeyword`/`collectSelfAndDescendantKeys` |
| `static/ui/src/backoffice/page/team/__test__/buildTeamTree.test.js` | **25 케이스** (계층·고아승격·자기참조·사이클 종료·접힘·키워드 필터·상위팀 차단 집합) |
| `static/ui/src/backoffice/page/team/useTeamTree.js` | `getTeamList` 소비 |
| `static/ui/src/backoffice/page/team/useTeamDetail.js` | `findTeamById` 소비 |
| `static/ui/src/backoffice/page/team/teamErrors.js` | `TEAM_*` 코드 → `team.error.<CODE>` 매핑 (미매핑 코드는 서버 message 를 그대로 노출) |
| `static/ui/src/backoffice/page/team/TeamPage.jsx` | 페이지 — 권한 게이트·경고 배너·2패널·모달 3종·invalidate 소유 |
| `static/ui/src/backoffice/page/team/TeamTreePanel.jsx` | 좌 트리 (검색/접기/선택/인원 배지/사이클 아이콘). **DnD 없음** |
| `static/ui/src/backoffice/page/team/TeamDetailPanel.jsx` | 우 상세 (경로·팀장·권한세트·설명·하위팀·팀원 체크박스+소속해제) |
| `.../modal/regist/TeamRegistrationModal.jsx` + `useTeamRegistrationModal.js` | 팀 추가 |
| `.../modal/edit/TeamEditModal.jsx` + `useTeamEditModal.js` | 팀 수정 + 삭제(ConfirmModal) |
| `.../modal/member/TeamMemberAssignModal.jsx` + `useTeamMemberAssignModal.js` | 팀원 배치 |
| `static/ui/src/components/select/TeamSelect.jsx` | 공용 팀 Select (depth 들여쓰기, `includeNoneOption`, `excludeValues`) |
| `static/ui/src/hooks/useTeamOptions.js` | `getTeamOptions` 공용 훅 (fail-soft) |
| `locales/kr/team.json` · `locales/en/team.json` | 신규 네임스페이스 |

### 수정 (10)

| 파일 | 변경 |
|---|---|
| `static/ui/src/utils/queryKey/backofficeKeys.js` | `teams()` / `findTeams(teamKey)` / `teamOptions()` **3키 추가 (인라인 키 0건)** |
| `static/ui/src/App.jsx` | `TeamPage` import + `<Route path="/backoffice/team">` (`/backoffice/users` 다음) |
| `static/ui/src/layout/Sidebar.jsx` | `backofficeItems` 에 `/backoffice/team` (`permission:'TEAM_MANAGEMENT'`, `PeopleGroupIcon`) — 기존 `.filter(isReadable)` 이 자동 처리 |
| `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js` | **`?? null` 4필드 + `teamKey` 신규** / `team` 초기값·isDirty |
| `static/ui/src/backoffice/page/user/modal/edit/UserEditModal.jsx` | 팀 `TeamSelect` 필드 |
| `static/ui/src/backoffice/page/user/modal/regist/UserRegistrationModal.jsx` | `<Field name="team">` + `TeamSelect` |
| `static/ui/src/backoffice/page/user/UserListPaging.jsx` | 팀 컬럼(head + cell, `row.teamName`) |
| `static/ui/src/backoffice/page/user/UserPage.jsx` | 4번째 StatCard(`meta?.team`) |
| `static/ui/src/components/search/UserSearchFilter.jsx` | 팀 필터 `TeamSelect includeNoneOption` + `changeTeam` + `resetAll` 에 `permission`/`team` 보강 |
| `locales/kr|en/{common,user,permission}.json` | `common.pages.team`, `common.backoffice.workforceSetting.team.{title,description}`, `user.{col,form,filter,stat}.team`, `permission.desc.TEAM_MANAGEMENT` |

**쿼리키**: 인라인 배열 0건. 신규 3키는 전부 `backofficeKeys` 팩토리. 팀원 배치 모달의 후보 목록은 기존 `userKeys.list(params)` 를 `scope:'teamAssign'` 파라미터로 분리해 재사용한다(사용자 목록 캐시와 충돌 방지, `userKeys.all` invalidate 로 함께 갱신됨).

**invalidate 소유**: 전부 `TeamPage.refreshTeams()`. 모달 내부에서 `invalidateQueries` 를 호출하지 않는다(리포 계약). 대상 = `backofficeKeys.teams()` + `backofficeKeys.teamOptions()` + `userKeys.all` (+ 해당 `findTeams(teamKey)`).

---

## 3. 테스트 / 빌드 / i18n merge

### `npm run merge` — **실행함**

```
cd static/ui && npm run merge
```
`locales/kr/*.json` + `locales/en/*.json` → `locales/ko-KR.json` / `en-US.json` 재생성.
`ko-KR.json`/`en-US.json` 은 **직접 수정하지 않았다.** `locales/script/*.json`(빈 스텁)에도 넣지 않았다.

산출물 키 검증(생성된 ko-KR/en-US 에서 직접 조회):
```
team.page.title                                | ko: "팀 관리" | en: "Team Management"
team.tree.truncatedWarning                     | ko: "팀 수가 조회 한도({max})를 초과해…" | en: "Too many teams to load (limit {max})…"
team.unassigned.count                          | ko: "팀 미지정 {count}명" | en: "{count} without a team"
team.error.TEAM_NAME_DUPLICATED                | ko: "이미 존재하는 팀명입니다." | en: "This team name already exists."
team.toast.assignSuccess                       | ko: "{count}명을 배치했습니다." | en: "{count} member(s) assigned."
common.pages.team                              | ko: "팀 관리" | en: "Team Management"
common.backoffice.workforceSetting.team.title  | ko: "팀 관리" | en: "Team Management"
permission.desc.TEAM_MANAGEMENT                | ko: "조직 계층·팀 소속·팀장 지정을 관리합니다." | en: "Manage the org hierarchy, team membership, and team leads."
user.col.team / user.form.team / user.filter.team / user.stat.team | ko: "팀" | en: "Team"
```
→ `ResourceCatalog` 가 참조하는 두 키(`common.pages.team`, `permission.desc.TEAM_MANAGEMENT`)가 모두 반영됐다. 권한 관리 페이지에 키 문자열이 노출되는 문제 없음.

> ⚠ 치환 토큰(`{count}` 등)은 Forge `t()` 가 지원하지 않는다 → 전부 기존 `utils/i18n.js` 의 `tFormat(t, key, vars)` 로 소비했다.

### `npm test` (static/ui, jest) — **PASS**

```
> jira-global-page-custom-ui-static@0.1.62 test
> jest

PASS src/utils/__test__/jqlMaker.test.js
PASS src/utils/__test__/TimeUtils.test.js
PASS src/pages/projectDetail/taskHistory/taskHistory.transform.test.js
PASS src/utils/__test__/useInfiniteSlice.test.js
PASS src/components/filter/__test__/projectSpace.test.js
PASS src/utils/__test__/numberUtils.test.js
PASS src/pages/projectDetail/work/resolveTreeDrop.test.js
PASS src/pages/portfolio/utils/__test__/portfolioAggregate.test.js
PASS src/pages/projectDetail/gantt/ganttToastBatcher.test.js
PASS src/pages/projectDetail/work/buildWorkTree.test.js
PASS src/pages/projectDetail/work/relationSource.test.js
PASS src/pages/projectDetail/assignment/__test__/workloadState.test.js
PASS src/pages/resource/assignment/__test__/mergeMatch.test.js
PASS src/pages/projectDetail/assignment/__test__/queueFilter.test.js
PASS src/pages/projectDetail/gantt/ganttAdapter.folderLinks.test.js
PASS src/pages/resource/assignment/__test__/patchProjectMetric.test.js
PASS src/pages/projectDetail/assignment/__test__/patchAssignmentCache.test.js
PASS src/utils/__test__/listUtils.test.js
PASS src/pages/resource/assignment/__test__/projectDesign.test.js
PASS src/pages/projectDetail/issue/workListQuery.test.js
PASS src/pages/projectDetail/assignment/__test__/candidateFilter.test.js
PASS src/backoffice/page/team/__test__/buildTeamTree.test.js

Test Suites: 22 passed, 22 total
Tests:       279 passed, 279 total
Snapshots:   1 passed, 1 total
Time:        7.065 s
Ran all test suites.
```
- 신규 suite 1개 = `buildTeamTree.test.js` **25 케이스**(`npx jest src/backoffice/page/team --verbose` 로 개별 확인). 전체 22 suite / 279 test, 실패 0 · 스킵 0 · 회귀 0.
- 종료코드 재측정: `cmd /c "npm test > NUL 2>&1 & echo TEST_EXIT=%errorlevel%"` → **`TEST_EXIT=0`**

### `npm run build` — **성공**

```
> jira-global-page-custom-ui-static@0.1.62 build
> react-scripts build

Creating an optimized production build...
Compiled with warnings.

Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/context.ts' …
Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/index.ts' …
Failed to parse source map from '…/marklassian/index.ts' …

The bundle size is significantly larger than recommended.
…
The build folder is ready to be deployed.
```
- 경고 3건은 **node_modules 소스맵 누락**으로 이번 변경 이전부터 있던 것이다(우리 코드 경고 0건).
- 종료코드 재측정: `cmd /c "npm run build > NUL 2>&1 & echo BUILD_EXIT=%errorlevel%"` → **`BUILD_EXIT=0`**
- `prebuild` 가 merge 를 자동 실행하므로 빌드 산출물에도 신규 번역이 포함된다.

---

## 4. 백엔드 리포트와 달라진 점 · 미구현 · 발견한 문제

### 4-1. 백엔드 shape 과 다르게 소비한 곳 — **없음.** 단, 없는 필드를 유도한 곳 1건

| 항목 | 사정 | 대응 |
|---|---|---|
| 편집 모달의 "상위 팀" **라벨** | `findTeamById.content.team` 에는 `parentTeamKey` 만 있고 **`parentTeamName` 이 없다**. `getTeamOptions` 로딩을 기다리면 모달이 빈 값으로 잠깐 뜬다 | `content.ancestors`(루트→직속부모)의 **마지막 원소 `.name`** 을 부모 이름으로 썼다. 루트 팀이면 `ancestors=[]` 이고 `parentTeamKey` 도 null 이라 분기가 겹치지 않는다. 백엔드 변경 불필요 |

그 외 모든 접근 경로는 백엔드 리포트 §1 의 shape 을 글자 그대로 따랐다.

### 4-2. 설계서와 달라진 점 (프론트 판단, 근거 포함)

1. **삭제 영향 미리보기 → "삭제 후 토스트"로 이동.**
   설계서 §7 3차 키 `team.delete.preview.permissionLost` / `inheritanceChanged` 는 확인 모달의 **사전** 경고를 상정하지만, P0 에는 **미리보기 resolver 가 없다**(카운트는 `deleteTeam` 응답에만 있다). 사전에 알 수 없는 숫자를 확인 모달에 띄울 방법이 없어, 백엔드 리포트 §5 체크리스트대로 **성공 토스트에 문장으로** 노출했다. 0 이 아닌 항목만 덧붙여 "0명이 권한을 잃습니다" 같은 늑대소년 문구를 피했다.
   → P1 에서 `previewTeamDeletion` 류 resolver 가 생기면 확인 모달로 앞당길 수 있다.
2. **`team.error.TEAM_DEPTH_EXCEEDED` 문구에서 "10단계" 리터럴을 뺐다.**
   설계서 문구는 "팀 계층은 최대 **10**단계까지 가능합니다"인데, 이는 M6(프론트에 한계 리터럴 금지)를 번역 문자열로 우회하는 것이다. 백엔드가 `MAX_TEAM_DEPTH` 를 바꾸면 번역만 거짓말이 된다. → "팀 계층의 최대 단계를 초과했습니다."로 일반화.
3. **`team.tree.truncatedWarning` 에 `{max}` 치환자를 추가**해 `limits.maxTeams` 를 실제로 노출했다(설계서 원문은 숫자가 없어 `limits` 를 읽을 이유가 사라진다).
4. **키워드 검색을 트리 패널에 추가**(`team.tree.search`). 설계서 §6-6 은 명시하지 않았으나 500팀 한계 아래에서 트리만으로는 탐색이 불가능하다. 일치 팀의 **조상까지 유지**해 계층이 왜곡되지 않게 순수 함수로 구현하고 테스트했다.
5. **팀원 배치 모달을 `getUserListWithPaging` 재사용으로 구현.** 팀 전용 후보 resolver(`getTeamMemberCandidates`)는 P2 항목이다. 기존 목록 resolver 가 이미 `teamKey/teamName` 과 팀 필터를 지원하므로 신규 resolver 없이 "타 팀 소속자 검색 → 이동"이 가능하다.
6. **`UserSearchFilter.resetAll` 이 누락하던 `permission` 을 함께 보강**했다. 기존에는 `{users,role,level}` 만 리셋해 권한 필터가 화면과 어긋난 채 남아 있었다(팀을 추가하며 같은 결함을 복제하지 않기 위해 정정).

### 4-3. 명시적으로 만들지 않은 것 (P0 범위 밖 — 의도적)

- **드래그앤드롭 없음** (P3-B). `TeamTreePanel` 에 `draggable` 을 넣지 않았고, 상위 팀 변경은 편집 모달 Select 로만 한다. 파일 상단에 "여기에 draggable 을 붙이지 말 것" 주석을 남겼다.
- **`usePermissionStore.team` 확장 / `isTeamLead()` 셀렉터 없음** (설계서 §6-3 은 P1 로 표기).
- **"팀 상속" 권한 옵션 + 실효 권한 미리보기 없음** (§R7/§6-3 — P1). `buildTeamTree.js` 에 `collectAncestorKeys` 를 이미 넣어 뒀으므로 P1 에서 `nearestAncestorWith` 를 그 위에 얹으면 된다.
- **`projectKeys.projectTeams`** (설계서 §6-2) — P2 항목이라 추가하지 않았다.
- **분석/자원/포트폴리오 화면의 팀 필터·컬럼** (`resource.json`/`portfolio.json`/`cost.json`/`chartOptions.json` 키) — P2/P3-A 항목이라 키도 추가하지 않았다(쓰지 않는 키를 미리 넣으면 merge 산출물만 부풀고 검증 대상이 흐려진다).
- `team.project.*`, `team.analysis.*`, `team.filter.includeDescendants`, `permission.scope.TEAM_ONLY*`, `permission.inherit.*` 키 — 위와 같은 이유로 **미추가**.

### 4-4. 발견한 문제 / 리더 판단 요청

| # | 항목 | 상세 |
|---|---|---|
| 1 | **`TEAM_MANAGEMENT` 권한이 없으면 사이드바 진입이 아예 없다** | `migrateFrom` 미지정이라 기존 관리자(커스텀 세트)는 재시드 후에도 `TEAM_MANAGEMENT:{false,false}` 다. Jira ADMINISTER 보유자만 즉시 보인다. **배포 후 권한 관리 페이지에서 세트별로 켜 줘야 한다** — 운영 안내 필요 |
| 2 | 팀원 배치 모달의 후보 목록이 **페이지 단위 선택 유지** | 선택은 페이지를 넘겨도 유지되지만(Map 누적), 필터를 바꿔도 유지된다. 의도한 동작이나 "선택했는데 목록에 안 보임"으로 읽힐 수 있다 → 하단에 `{count}명 선택됨` 을 항상 노출해 완화. 500명 일괄 배치 가드(`TEAM_ASSIGN_BATCH_TOO_LARGE`)는 **P2 키**라 넣지 않았다 |
| 3 | `getUserMetaCount.team` 의 `name:'Unassigned'` 가 **번역되지 않는다** | role/level/permission 과 동일한 기존 규약(백엔드가 영문 리터럴을 내려줌)이라 StatCard 에 'Unassigned' 로 표시된다. 팀만 다르게 처리하면 4개 카드가 어긋나므로 **기존 규약을 따랐다.** 전체 번역은 별건으로 다뤄야 함 |
| 4 | `deleteTeam.removedProjectAssignCount` | 항상 0 이라 **화면에 노출하지 않았다**. P2 에서 `project_team` 이 생기면 토스트에 한 줄 추가하면 된다 |

### 4-5. 미확정 (실기동 확인 필요)

| # | 항목 |
|---|---|
| 1 | **`forge deploy` 선행 필수** — manifest 의 KVS `team` 엔티티가 미배포면 `addTeam` 이 422 로 실패한다. 프론트는 이 경우 서버 message 를 그대로 토스트에 띄운다(코드 매핑 없음) |
| 2 | `getTeamOptions` 실패 시 `TeamSelect` 는 **비활성 상태로 렌더**된다(fail-soft). 사용자 관리 화면에서 팀 필터만 회색이 되고 나머지는 정상 동작한다 — 실기동에서 UX 확인 필요 |
| 3 | 트리 성능은 500팀(백엔드 `MAX_TEAMS`) 기준으로만 설계했다. 가상 스크롤 없음 — 접힘으로 행 생성 자체를 줄이는 방식. 실데이터 100팀 이상에서 체감 확인 필요 |
| 4 | E2E 미수행 — Forge tunnel/배포 환경에서의 실동작 검증은 하지 않았다 |

---

## 5. 검증 반영 (2026-07-27, 2차 개정)

> 입력: `03_verify_report.md`(F1/F2/F3 + 관찰 O1~O8), `02_backend_report.md` **2차 개정판** §0-A·§1·§5-A
> 백엔드가 3건을 모두 수정했고, `getTeamList`/`getTeamOptions`/`findTeamById` 의 `parentTeamKey` 가
> **강등 반영된 유효 부모**가 되었으며 `rawParentTeamKey`·`demotedKeys`·`parentTeamName`·`isDemoted`·`leaderEmail` 이 추가됐다.

### 5-1. 분류표 — 반영 / 불필요 / 미반영

| # | 항목 | 판정 | 내용 · 근거 |
|---|---|---|---|
| **F1** | 사이클 시 서브트리 소실 | **반영** (이중 방어) | 백엔드 정규화로 이 입력은 더 이상 오지 않지만 **방어를 제거하지 않았다.** `buildTeamTree` 에 `findCycleMemberKeys` 내부 헬퍼를 추가해 **사이클 위의 노드만 루트로 승격**한다(사이클 구성원의 비사이클 자식은 그대로 아래 유지 — 백엔드 `buildTeamIndex` 강등 규칙과 동일 결과). 검증자 실측 입력 `a(parent=b), b(parent=a), c(parent=a), d` 로 **회귀 테스트 5건 추가** |
| **F1-주석** | `buildTeamTree.js:15-19` 의 잘못된 전제 | **반영** | 주석을 다시 썼다. "백엔드가 정규화하므로 정상 경로에서는 사이클 입력이 오지 않는다 — 그래도 방어는 이중으로 남긴다. F1 의 실패 양상은 **조용하다**(에러도 빈 화면도 아니고 서브트리만 사라진다)"로 근거까지 명시 |
| **F1-필드** | `demotedKeys` 활용 | **반영** | `useTeamTree` 가 `demotedKeys` 를 노출(구버전 응답 대비 `?? cycleKeys` 폴백). 트리 노드 경고 아이콘 판정을 `cycleKeys` → **`demotedKeys`(⊇)** 로 넓히고, 툴팁을 **사이클 / 그 외 강등**으로 분기했다. `TeamPage` 에 비(非)사이클 강등 전용 배너를 추가(사이클 배너와 **동시 표시 가능** — 사용자가 취할 조치가 다르다) |
| **F2** | 편집 모달 상위 팀 라벨 UUID 노출 | **반영 (필수)** | `useTeamEditModal` 에서 **`ancestors` 구조분해 자체를 제거**하고 `ancestors[last]` 유도 + `?? team.parentTeamKey` 폴백을 **삭제**했다. `useTeamDetail` 의 `ancestors` 는 브레드크럼(`TeamDetailPanel`)에서만 계속 쓴다 |
| **F2-가드** | 회귀 가드 테스트 | **반영** | 유도 로직을 **순수 함수 `toParentOption(team, fallbackLabel)`** 로 뽑아 테스트 가능하게 만들었다(훅 렌더 테스트는 `@testing-library/react` 미설치로 불가). `test.each` 로 `parentTeamName` **누락/null/빈문자열** 3케이스를 막는다 — 백엔드의 `test.each` 와 대칭 |
| **F3** | read-after-write | **불필요 (프론트 변경 0)** | 백엔드가 읽기 3종을 `loadTeamIndexFresh()` 로 전환했다. **React Query 캐싱은 그대로 뒀다** — 백엔드 fresh 전환의 전제가 "프론트 캐싱이 위에 있어 실제 호출이 페이지 로드당 1회"이므로, staleTime 을 낮추면 그 전제를 깨고 KVS 커서 루프 호출을 늘린다. `useTeamTree` 60초 / `useTeamDetail` 30초 / `useTeamOptions` 5분 **모두 유지** |
| **O1** | `JiraUserSelect` 의 leader `email` 누락 | **반영** | 편집 모달이 조립하는 leader 객체에 `email: team.leaderEmail ?? null` 추가. 백엔드 고지대로 **`members[]` 에서 찾지 않았다**(거기엔 없다). 코드 주석에 출처를 명시 |
| **O7** | 폼 초기화 effect 의 `permissionOptions` 불안정 | **반영 (부수)** | `initializedKeyRef` 로 **팀 1개당 1회만** 초기화한다. 옵션 조회 실패 시 매 렌더 새 `[]` 참조로 폼이 반복 리셋되던 문제 + `team` 재조회(staleTime 30초) 시 **사용자 입력이 날아가던** 문제를 함께 막는다. 모달을 닫으면 ref 해제 |
| **O8-동형** | 권한 세트 옵션 조회 실패 시 **조용한 해제** | **반영 (부수, 예방)** | O8 은 사용자 모달의 기존 결함이지만 **팀 모달에 같은 구조가 있었다**: `permissionOptions.find(...) ?? null` → 옵션 조회 실패 시 `permission:null` → 저장 시 `permissionKey:null` 로 **팀 권한 세트 해제**. `findTeamById` 가 `permissionKey`+`permissionName` 을 함께 주므로 **응답을 1순위 출처**로 바꿨다(옵션 라벨 → `permissionName` → 번역 폴백). 사용자 모달의 `team` 필드에 쓴 방어와 같은 패턴 |
| **O2** | `BackofficeDropdown` 에 팀 항목 없음 | **미반영 (전제 정정)** | ⚠ **`BackofficeDropdown` 은 어디서도 렌더되지 않는다.** `MainPage.jsx:3` · `Backoffice.jsx:4` 가 import 만 하고 JSX 에서 사용하지 않는다(`grep "<BackofficeDropdown"` → 0건). 실제 백오피스 내비게이션은 `Sidebar` 이고 팀 항목은 **이미 있다**. 여기에 항목을 추가하면 **도달 불가능한 죽은 UI** 가 늘 뿐이다. skill 누락도 같은 이유(기존 갭이 아니라 컴포넌트 자체가 죽어 있음) → **죽은 컴포넌트 제거 여부는 P0 밖, 리더 판단** |
| **O3** | 미사용 i18n 키 | **반영** | 실제 미사용 8키를 kr/en **양쪽에서 제거**: `tree.title`, `col.{name,parent,leader,memberCount}`, `placeholder.leader`, `button.unassign`(→`unassignCount` 로 대체됨), **`myTeam.title`(P1 키 — "P1 키를 넣지 마라" 지시에 맞춰 제거)**. `myTeam.leadBadge`·`col.{permission,description,descendantMemberCount}`·`filter.*` 는 **실사용 중이라 유지**. `error.TEAM_*` 5키는 `teamErrors.js` 가 템플릿 리터럴(`team.error.` + code)로 **동적 참조**하므로 정적 grep 에 안 잡힐 뿐 사용 중이다(검증자 스크립트의 오탐) |
| **O5** | StatCard 제목 4개 불일치 | **미반영** | `"Permission"/"Role"/"Level"` 하드코딩은 **팀 도입 이전부터 있던 것**이고, 3개를 i18n 으로 바꾸려면 `user.stat.{permission,role,level}` 키 신설 + 기존 화면 문구 변경이 따른다. P0 범위 밖의 기존 UI 정리라 손대지 않았다. 팀 카드만 `t('user.stat.team')` 인 비대칭은 **인지하고 남긴 상태** — 리더가 원하면 별건으로 통일 |
| **O4/O6** | 백엔드 항목 | **해당 없음** | O4(`findAccountIdsByTeamKeys` 미사용)는 백엔드, O6(`'Unassigned'` 미번역)은 §4-4 #3 에서 이미 고지한 기존 규약 |

### 5-2. 소비 shape 변경분 (백엔드 2차 개정 §1 기준)

| 필드 | 읽는 곳 | 용도 |
|---|---|---|
| `getTeamList.content.demotedKeys[]` | `useTeamTree` → `TeamPage`, `TeamTreePanel` | 강등 노드 경고 아이콘(⊇ cycleKeys) + 비사이클 강등 배너 |
| `getTeamList.content.teams[].parentTeamKey` | `buildTeamTree` | **의미가 유효 부모로 바뀌었다.** 접근 경로는 동일 — 코드 변경 불필요 |
| `getTeamList.content.teams[].rawParentTeamKey` | — | **읽지 않는다.** P0 화면에 "원래 상위 팀" 을 설명하는 UI 가 없다. 넣으면 P0 범위를 넘는 복구 UX 가 된다 |
| `findTeamById.content.team.parentTeamName` | `toParentOption` → `useTeamEditModal` | **상위 팀 라벨의 단일 출처** (F2) |
| `findTeamById.content.team.isDemoted` | `TeamDetailPanel` | `ancestors=[]` 의 두 의미(진짜 최상위 / 강등)를 구분해 **"최상위" 오표기 제거** |
| `findTeamById.content.team.leaderEmail` | `useTeamEditModal` | `JiraUserSelect.UserSingleValue` 의 `data.email` (O1) |
| `findTeamById.content.team.rawParentTeamKey` | — | **읽지 않는다.** 위와 같은 이유 |

**백엔드 shape 과 다르게 소비한 곳은 없다.** 1차 리포트 §4-1 에 적었던 "`ancestors` 마지막 원소로 부모 이름 유도"는 **이번에 완전히 제거**되어, 그 예외 항목은 해소됐다.

### 5-3. 변경 파일 (2차 개정분)

| 파일 | 변경 |
|---|---|
| `static/ui/src/backoffice/page/team/buildTeamTree.js` | `findCycleMemberKeys`(내부) + `buildTeamTree` 사이클 방어 / **`toParentOption` 신규 export** / 헤더 주석 정정 |
| `static/ui/src/backoffice/page/team/__test__/buildTeamTree.test.js` | **+12 케이스** (F1 사이클 5 · F2 UUID 가드 7). 25 → **37** |
| `static/ui/src/backoffice/page/team/useTeamTree.js` | `demotedKeys` 노출(+ 폴백), 주석에 유효부모/rawParentTeamKey 명시 |
| `static/ui/src/backoffice/page/team/TeamPage.jsx` | `demotedKeys` 수신, `nonCycleDemotedCount` 산출, 비사이클 강등 배너, 트리에 `demotedKeys` 전달 |
| `static/ui/src/backoffice/page/team/TeamTreePanel.jsx` | 경고 아이콘 판정 `cycleKeys` → `demotedKeys`, 툴팁 사이클/강등 분기 |
| `static/ui/src/backoffice/page/team/TeamDetailPanel.jsx` | `team.isDemoted` 분기 — 강등 노드를 "최상위"로 오표기하지 않음 |
| `static/ui/src/backoffice/page/team/modal/edit/useTeamEditModal.js` | **F2 유도 제거 → `toParentOption`** / `leaderEmail`(O1) / `initializedKeyRef`(O7) / permission 응답 1순위(O8 동형) |
| `locales/kr/team.json` · `locales/en/team.json` | **+5키** (`tree.demotedWarning`, `tree.demotedNode`, `detail.demoted`, `form.unknownParent`, `form.unknownPermission`) / **−8키**(O3). 63/63 대칭 |

### 5-4. 재검증 결과 (원문 · 종료코드 `cmd` 재측정)

```
# i18n merge
> cd static/ui && npm run merge
> node ../../locales/script/merge.js
team kr/en 키수: 63 63 | 대칭: true
team.tree.demotedWarning    | ko: "상위 팀 연결이 유효하지 않은 팀 {count}개가 최상위로 표시됩니다. …" | en: "{count} team(s) with an invalid parent link …"
team.tree.demotedNode       | ko: "상위 팀 연결이 유효하지 않아 최상위로 표시 중입니다." | en: "Shown at the top level because its parent link is invalid."
team.detail.demoted         | ko: "상위 팀 연결 이상 — 최상위로 표시 중" | en: "Invalid parent link — shown at the top level"
team.form.unknownParent     | ko: "(알 수 없는 상위 팀)" | en: "(Unknown parent team)"
team.form.unknownPermission | ko: "(알 수 없는 권한 세트)" | en: "(Unknown permission set)"
제거 확인 team.myTeam.title -> undefined undefined
```
`ko-KR.json`/`en-US.json` 직접 수정 없음. `locales/script/*.json` 미사용.

```
# 팀 테스트 상세
> npx jest src/backoffice/page/team --verbose
  buildTeamTree — 사이클 방어 (F1 회귀 가드)
    √ 사이클 구성원을 루트로 승격해 어떤 노드도 소실되지 않는다
    √ 사이클 구성원만 루트가 되고, 사이클에 없는 자식은 그대로 아래 붙는다
    √ 3노드 순환(a→b→c→a)도 전원 루트로 승격한다
    √ 사이클과 무관한 정상 서브트리는 영향을 받지 않는다
    √ 정상 트리에는 사이클 방어가 개입하지 않는다(무회귀)
  toParentOption — 상위 팀 라벨 (F2 회귀 가드)
    √ parentTeamName 을 라벨로 쓴다
    √ 루트/강등 노드(parentTeamKey=null)는 null 을 반환한다
    √ 이름을 모를 때(parentTeamName 누락) 라벨에 UUID 를 쓰지 않는다
    √ 이름을 모를 때(parentTeamName null) 라벨에 UUID 를 쓰지 않는다
    √ 이름을 모를 때(parentTeamName 빈 문자열) 라벨에 UUID 를 쓰지 않는다
    √ 이름을 몰라도 value 는 parentTeamKey 를 유지한다(저장 시 상위 팀 조용한 해제 방지)
    √ 폴백 라벨을 주지 않아도 UUID 로 대체하지 않는다

Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
```

```
# 전체 (static/ui)
Test Suites: 22 passed, 22 total
Tests:       291 passed, 291 total     ← 279 → 291 (+12), 실패 0 · 스킵 0 · 회귀 0
Snapshots:   1 passed, 1 total

> cmd /c "npm test > %TEMP%\fe_test2.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0

> cmd /c "npm run build > %TEMP%\fe_build2.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.
  Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/context.ts' …
  Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/index.ts' …
  Failed to parse source map from '…/marklassian/index.ts' …
```
경고 3건은 **node_modules 소스맵 누락**으로 팀 기능 착수 이전부터 존재한다(우리 코드 경고 0건).

### 5-5. 2차 개정에서 남긴 판단 · 미확정

| # | 항목 | 상태 |
|---|---|---|
| 1 | `rawParentTeamKey` 미소비 | **의도적.** "원래 상위: X" 를 보여주는 복구 UX 는 P0 범위 밖이다. 필요해지면 `TeamDetailPanel` 의 강등 문구 뒤에 한 줄 붙이면 된다(백엔드 변경 0) |
| 2 | 사이클 방어 유지 | **의도적.** 백엔드가 정규화해도 제거하지 않는다 — F1 의 실패 양상이 조용해서(에러 없음·빈 화면 없음·서브트리만 소실) 회귀 시 발견이 늦다 |
| 3 | React Query staleTime 무변경 | **의도적.** 백엔드 fresh 전환의 전제를 지킨다(§5-1 F3) |
| 4 | `toParentOption` 이 이름 미상일 때 `value` 를 유지 | `null` 을 반환하면 저장 시 `parentTeamKey:null` 로 **상위 팀이 조용히 해제**된다 — 라벨 결함보다 나쁘다. 테스트로 고정 |
| 5 | 강등 노드의 트리 위치 | 백엔드가 `parentTeamKey:null` 로 내리므로 **트리 최상위에 나타난다.** 사용자는 그 노드를 선택해 편집 모달로 상위 팀을 고칠 수 있다(F1 이 막았던 복구 경로가 열렸다) — **실기동 확인 필요(미확정)** |
| 6 | E2E 미수행 | 2차 개정 후에도 동일. `demotedKeys`/`isDemoted` 표시 경로는 **이상 데이터가 있어야 발현**하므로 로컬에서 재현하지 않았다(순수 함수 테스트로만 고정) |

---
---

# P1 — 권한 확장 (TEAM_ONLY · 팀 상속 · 팀장) 프론트

> 작성: 2026-07-27 / frontend-engineer
> 입력: `02_backend_report.md` **P1 절**(§P1-0 계약 변경 5건 · §P1-3 · §P1-4 D1~D6 · §P1-7), `03_verify_report.md` §7, `01_architect_design.md` §9 P1 · §R3/R3-A/R3-C · §R7 · §H1 재설계
> 범위: **P1 프론트만.** P2(프로젝트-팀 배정 · `addTeamMembersToProject` · `projectKeys.projectTeams`) / P3(심화 분석 · **DnD**)는 손대지 않았다.

## P1-A. 최우선 — P1-N2 처리 결과

백엔드 경고: `permissionOptions.find(...) ?? null` 은 **옵션 조회 실패 → `null`** 이 되고,
P1 부터 `permission_key = NULL` 은 **"팀 상속"** 이라 조회 실패 한 번이
**"상속 전환 → 조상 팀에 세트가 없으면 전 권한 상실"** 이 된다.

**해결 방식: 값을 만드는 규칙 자체를 바꿨다.** 저장을 막는 방어가 아니라, **실패해도 값이 안 바뀌게** 했다.

`static/ui/src/backoffice/page/user/userFormOptions.js` (신규, 순수 함수 4종)

| 함수 | 불변식 |
|---|---|
| `toKeyedOption(key, options, unknownLabel, knownLabel?)` | **key 를 항상 value 로 보존.** 옵션 목록은 *라벨*에만 쓴다. 옵션이 `[]`(조회 실패)여도 `null` 을 만들지 않는다. 라벨에 원시 키(UUID)를 쓰지 않는다 |
| `toPermissionOption(permissionKey, options, labels)` | `permissionKey == null` → **"팀 상속" 옵션**(P1 의미 반영). 세트가 있으면 조회 실패에도 **키 보존**(상속으로 전환되지 않는다) |
| `toPermissionKeyPayload(selected)` | 세트 → 키 / **"팀 상속" 명시 선택 → `null`** / **값 없음 → `undefined`**(키를 안 보냄 = read-merge 보존) |
| `withTeamInheritOption(options, label)` | 권한 Select 맨 앞에 "팀 상속" 을 넣는다 — R2 팀 fallback 의 **유일한 진입점**(§R7) |

**의도적 선택과 우발적 실패의 구분이 코드 구조로 성립한다:**

| 상황 | 이전 | 지금 |
|---|---|---|
| 옵션 조회 실패 | `null` → 저장 시 **상속 전환** | 키 보존 → **아무것도 안 바뀜** |
| 관리자가 Select 를 비움 | `null` → 상속 전환 | **불가능** — 권한 Select 는 `isClearable` 을 제거했다 |
| 관리자가 "팀 상속" 선택 | (표현 불가) | `null` → **의도대로 상속 전환** |
| 폼 미초기화 상태 저장 | `null` → 상속 전환 | `undefined` → **read-merge 보존** |

부수로 `initializedIdRef` 를 넣어 **사용자 1명당 1회만** 폼을 채운다(검증 O7 동형 — 옵션 쿼리 실패 시
`[]` 가 매 렌더 새 참조라 effect 가 재실행되며 입력이 리셋되던 문제).

**회귀 가드**: `__test__/userFormOptions.test.js` **24건**. `test.each` 로 옵션 `[]`/`undefined`/키 부재 3케이스,
`toPermissionKeyPayload` 의 `null` vs `undefined` 구분, **JSON 직렬화 후 키가 실제로 사라지는지**까지 단언한다.

## P1-B. §R7 실효 권한 미리보기 — 백엔드와 **실물 대조**

`resolveInheritedPermission(teams, teamKey)` (`backoffice/page/team/buildTeamTree.js`) — 백엔드
`TeamTree.nearestAncestorWith(index, key, t => !!t.permissionKey)` 의 프론트 미러. `getTeamList` 의
`parentTeamKey`/`permissionKey` 로 계산하므로 **추가 resolver 0**.

⚠ 규칙 이중 구현이라 설계서가 "동일 픽스처 대조"를 요구했다. **기대값을 손으로 적지 않고 백엔드 모듈을
직접 import 해 실행 결과와 비교한다** — `__test__/inheritedPermission.test.js`:

```js
import { buildTeamIndex, nearestAncestorWith } from '../../../../../../../src/resolver/backoffice/team/TeamTree';
...
const expected = nearestAncestorWith(index, teamKey, (t) => !!t.permissionKey);
const actual   = resolveInheritedPermission(FE_FIXTURE, teamKey);
expect(actual?.permissionKey ?? null).toBe(expected?.permissionKey ?? null);
```
→ 백엔드 규칙이 바뀌면 **이 테스트가 즉시 깨져** 프론트 미러를 고치도록 강제한다. 복사본 대조가 아니다.

7케이스(자기 팀 우선 · 가까운 조상 우선 · 중간 팀 · 루트 자신 · 체인에 없음 · 형제 무간섭 · 손상 부모키) + 4건.

**이 테스트를 위해 `static/ui/jest.config.js` 를 1회 수정했다** — 아래 P1-E 참조.

### 거짓 경고 방지 (자체 발견)

미리보기 초안은 `teams` 가 비면 "상속받을 권한이 없습니다 — 모든 권한을 잃게 됩니다" 를 띄웠다.
그런데 **팀 목록 조회 실패도 빈 배열**이라, 조회가 실패했을 뿐인데 관리자에게 거짓 경고가 간다.
→ `isLoading` 이면 아무 주장도 하지 않고, `isError` 면 중립 문구(`permission.inherit.previewUnknown`)를 쓴다.
"모른다"를 "없다"로 말하지 않는다.

## P1-C. 소비한 응답 shape (백엔드 §P1-0 계약 변경 5건)

| # | resolver | 필드 | 읽는 곳 | 조치 |
|---|---|---|---|---|
| 1 | `userPermissionCheck` | `team.{teamKey,teamName,isTeamLead,leadingTeamKeys,permissionSource}` | `usePermissionStore` | **반영.** 키가 항상 존재한다는 전제를 활용해 `EMPTY_TEAM` 기본값을 **같은 shape** 으로 두고, 소비부는 optional chaining 없이 읽는다. 셀렉터 4종(`isTeamLead`/`getTeamKey`/`getLeadingTeamKeys`/`getPermissionSource`) |
| | | `projectScope: 'ALL'|'MEMBER_ONLY'|'TEAM_ONLY'` | `ProjectScopeField`, `MyPageHeader` | **반영.** 값 도메인만 넓어져 필드 접근은 불변 |
| 2 | `updateUser` | `content.droppedFields[]` | `useUserEditModal` | **반영** — `notifyDroppedFields` |
| 3 | `setUserSkills` | **루트** `droppedFields[]` | `UserSkillEditModal` | **반영** |
| 4 | `removeProjectMemberByAccount` | **루트** `droppedFields[]` | `ProjectAssignmentBoard` | **반영** |
| 5 | `findUserByAccountId` 마스킹 | `salary`·`permissionKey` → `null` | — | **조치 없음.** 백엔드 고지대로 팀장 축에 이 resolver 가 없어 **호출 지점 0**. 마스킹이 실제로 발현하는 경로가 없다 |
| — | `findTeamById.content.team.parentTeamName` | — | `MyTeamSection` | P1 에서 "내 팀" 헤더의 상위 팀 표기에 재사용(F2 때 추가된 필드) |

`droppedFields` 의 응답 위치가 resolver 마다 다르다(`content.` vs 루트) → `utils/droppedFields.js` 가
**두 위치를 모두 본다.** 호출부가 위치를 외우지 않게 하고, 백엔드가 위치를 바꿔도 조용히 놓치지 않는다.

## P1-D. 구현 항목 (§9 P1 프론트 체크리스트)

| 체크리스트 항목 | 상태 |
|---|---|
| `usePermissionStore` `team` + `isTeamLead()`/`getTeamKey()` | ✅ (+`getLeadingTeamKeys`/`getPermissionSource`). 실패 시 `EMPTY_TEAM` 으로 초기화(fail-close) |
| `/backoffice/permission` TEAM_ONLY 옵션 | ✅ `ProjectScopeField` 를 **Toggle(2상태) → Select(3상태)** 로 교체. `value`/`onChange` 계약 불변이라 두 모달은 무수정 |
| 〃 팀 미소속자 경고 배너 | ✅ `getTeamList.unassignedCount` 기반. 조회 실패 시 **인원수 경고만 생략**(fail-soft) |
| 〃 `peopleWarning` 배너 | ✅ TEAM_ONLY 선택 시 항상 노출(H4 운영 규칙) |
| `/backoffice/users` 권한 Select "팀 상속" | ✅ `withTeamInheritOption`. **`isClearable` 제거** — 의미 있는 상태를 "지우기"로 만들지 않는다 |
| 〃 실효 권한 미리보기 1줄 | ✅ 4상태(상속됨 / 상속 없음 / 팀 미소속 / **확인 불가**) |
| 〃 팀장 경로면 급여·권한·팀 입력란 미렌더 | ✅ `isTeamLeadOnly = isTeamLead() && !canWrite('USER_MANAGEMENT')` |
| `droppedFields` 경고 토스트 | ✅ 3개 호출부 전부 |
| `/backoffice/team` 편집 모달 팀 권한세트 Select | ✅ **P0 에서 이미 구현** — P1 에서 추가 작업 없음 |
| **`/my-page` "내 팀" 섹션** | ✅ 신규 (`MyTeamSection` + `useMyTeam`) |
| 팀 필터 `'__NONE__'` | ✅ P0 유지(무변경) |
| i18n 추가 + merge | ✅ 20키, kr/en 대칭 |

### `/my-page` "내 팀" — 팀장 축이 **실제로 여는 것만** 만들었다

백엔드 teamLead 축은 P1 에서 **4키**다(D1 로 `addTeamMembersToProject` 는 P2 연기):
`findTeamById`(teamKey) · `getUserSkills`(accountId) · `setUserSkills`(accountId) · `removeProjectMemberByAccount`(accountId).

→ 섹션이 제공하는 기능은 **팀원 목록 + 스킬 편집**뿐이다.
- 직무·등급·급여·권한 편집 버튼을 **만들지 않았다** — 팀장 축에서 의도적으로 제거된 항목이라, 버튼을 두면 누를 때 서버가 거부하는 "조용한 실패"가 된다.
- 프로젝트 배정 버튼도 **없다**(P2). 배정 취소는 프로젝트 상세 인력 탭에 이미 있다.
- 스킬 편집은 `/resource` 의 `UserSkillEditModal` 을 **그대로 재사용**한다 — 같은 resolver 쌍을 쓰므로 편집 로직이 두 벌로 갈라지지 않는다(§H1 "부분 개방은 전면 차단보다 위험하다"의 회피).

**선행 read 가 전부 열려 있는지 직접 확인**(H1 의 교훈 — 축을 write 에만 붙이면 화면이 안 열린다):

| 호출 | grant | Member 팀장 통과? |
|---|---|---|
| `findTeamById` | `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` **+ `teamLead.teamTargets:['teamKey']`** | ✅ 팀장 축 |
| `getUserSkills` | `OR[...]` **+ `teamLead.accountTargets:['accountId']`** | ✅ 팀장 축 |
| `setUserSkills` | `W(RESOURCE_MANAGEMENT)` **+ `teamLead.accountTargets:['accountId']`** | ✅ 팀장 축 |
| `getSkillList` (스킬 카탈로그) | **`'PUBLIC'`** | ✅ |

→ 4개 모두 열려 있어 **읽기→편집→저장 경로가 끊기지 않는다.** `setUserSkills` allowlist 가
`['accountId','skillIds']` 이고 모달이 정확히 그 2키만 보내므로 `droppedFields` 는 `[]` 다(오탐 토스트 없음).

`getTeamList` 는 **쓰지 않는다** — 그 resolver 에는 팀장 축이 없어 Member 팀장에게 거부된다.
팀 목록은 `leadingTeamKeys`(store)에서, 상세는 `findTeamById` 에서만 온다.

## P1-E. 백엔드/설계서와 달라진 점 · 판단

| # | 항목 | 판단 |
|---|---|---|
| 1 | **`useUserEditModal` 의 `permissionKey` 만 `?? null` 을 벗어났다** | P0 무회귀 목록의 "`?? null` 4필드"에서 **권한만 `toPermissionKeyPayload` 로 교체**했다. role/level/team 은 `?? null` **그대로**다. 근거: P1 에서 그 필드의 `null` 은 "리셋"이 아니라 **"팀 상속"** 이라 의미가 바뀌었고, 이것이 P1-N2 가 요구한 처리다. **C1 계약은 훼손되지 않는다** — `undefined`=보존 / `null`=해제 규약을 그대로 쓰되, `null` 에 도달하는 경로를 "명시적 선택" 하나로 좁혔을 뿐이다. 테스트로 고정 |
| 2 | **사용자 *등록* 모달에는 "팀 상속" 옵션을 넣지 않았다** | `addUserService` 는 `permission?.value ?? await getMemberId()` 라 **미지정이면 Member 세트로 채운다**(`UserService.js:349`). `{value:null}` 을 보내도 `null ?? getMemberId()` 로 Member 가 된다 → 옵션을 만들면 **"팀 상속을 골랐는데 Member 가 저장되는" 조용한 실패**가 된다. 신규 사용자는 Member 로 만들고 수정 모달에서 상속으로 바꾸는 흐름. **백엔드가 INSERT 경로에서 명시적 null 을 수용하도록 바꾸면 그때 추가할 항목** |
| 3 | **`static/ui/jest.config.js` transform 을 인라인 babel 옵션으로 변경** | `.babelrc` 는 **파일 위치 기준** 탐색이라 `static/ui` 밖 파일에 적용되지 않아, §R7 대조 테스트가 백엔드 모듈을 import 하는 순간 `Unexpected token 'export'` 로 죽었다. → transform 에 `babelrc:false, configFile:false` + **`.babelrc` 와 동일한 presets** 를 명시했다. `.babelrc` 는 `npm start`/`npm run build`(react-scripts) 경로에서 계속 쓰이므로 **삭제하지 않았다**(양쪽을 함께 고치라는 주석을 남김). 변경 후 기존 291건 전부 통과 확인 |
| 4 | **i18n 키 이름이 설계서 §7 과 다르다** | 설계서는 `permission.scope.TEAM_ONLY` 와 `permission.scope.TEAM_ONLY.desc` 를 동시에 요구하는데, **JSON 에서 같은 키가 문자열이면서 객체일 수 없다.** 기존 형제 키(`scope.all`/`scope.memberOnly`/`scope.allHelp`)의 명명을 따라 `scope.teamOnly` / `scope.teamOnlyHelp` / `scope.teamOnlyWarning` / `scope.teamOnlyPeopleWarning` 으로 정했다. `permission.inherit.*` 는 설계서 그대로 |
| 5 | `permission.inherit.previewUnknown` 신설 | 설계서 §R7 표에 없는 4번째 상태. "팀 목록을 못 불러왔다"를 "상속할 게 없다"로 말하지 않기 위해 필요했다(위 P1-B) |
| 6 | `ProjectScopeField` Toggle → Select | 3상태를 2상태 위젯으로 표현할 수 없다. `value`/`onChange` 계약을 유지해 편집/등록 모달과 `usePermissionEditModal` 은 **1줄도 바꾸지 않았다** |
| 7 | D1~D6 (백엔드가 설계서와 다르게 구현한 6건) | 프론트 영향은 **D1 하나**(`addTeamMembersToProject` P2 연기) — "내 팀" 섹션에 배정 버튼을 만들지 않은 근거로 반영. D2~D6 는 서버 내부 사안이라 프론트 조치 없음 |
| 8 | 검증 **F4**(사용자 수정 모달 팀 라벨 UUID) | **이미 수정돼 있었다**(코디네이터가 `team.form.unknownTeam` 과 함께 반영). 그 인라인 유도를 `toKeyedOption` 호출로 **통합**해 규칙을 한 곳에 모으고 테스트로 덮었다 |

## P1-F. 신규/변경 파일

### 신규 (6)
| 파일 | 내용 |
|---|---|
| `static/ui/src/backoffice/page/user/userFormOptions.js` | **P1-N2 핵심** — 순수 함수 4종 + `TEAM_INHERIT_VALUE` |
| `static/ui/src/backoffice/page/user/__test__/userFormOptions.test.js` | 24건 — 옵션 실패 시 값 보존 · null/undefined 구분 · 직렬화 |
| `static/ui/src/backoffice/page/team/__test__/inheritedPermission.test.js` | 11건 — **백엔드 모듈 직접 import 대조**(§R7) |
| `static/ui/src/utils/droppedFields.js` | §R3-C — `extractDroppedFields`(2위치) + `notifyDroppedFields` |
| `static/ui/src/pages/myPage/hooks/useMyTeam.js` | 팀장 축 데이터(`findTeamById` 만) |
| `static/ui/src/pages/myPage/sections/MyTeamSection.jsx` | **팀장 축의 유일한 진입점** |

### 수정 (10)
| 파일 | 변경 |
|---|---|
| `static/ui/src/stores/usePermissionStore.js` | `team` 상태 + 셀렉터 4종 + 실패 시 `EMPTY_TEAM` |
| `static/ui/src/backoffice/page/team/buildTeamTree.js` | `resolveInheritedPermission` 추가(§R7 미러) |
| `static/ui/src/backoffice/page/user/modal/edit/useUserEditModal.js` | **P1-N2 전면** · 팀 상속 옵션 · 미리보기 · `isTeamLeadOnly` · `droppedFields` · `initializedIdRef` |
| `static/ui/src/backoffice/page/user/modal/edit/UserEditModal.jsx` | 팀 상속 옵션 렌더 · `isClearable` 제거 · 미리보기 SectionMessage · 팀장 경로 3필드 미렌더 |
| `static/ui/src/backoffice/page/permission/modal/ProjectScopeField.jsx` | Toggle → 3상태 Select + 경고 배너 2종 |
| `static/ui/src/pages/myPage/MyPage.jsx` | `MyTeamSection` 배치 |
| `static/ui/src/pages/myPage/sections/MyPageHeader.jsx` | `projectScope` 3분기 |
| `static/ui/src/pages/resource/overview/UserSkillEditModal.jsx` | `droppedFields` 토스트 |
| `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx` | `droppedFields` 토스트 |
| `static/ui/jest.config.js` | transform 인라인 babel 옵션(위 P1-E #3) |
| `locales/kr|en/{team,user,permission,myPage}.json` | **20키** 추가 |

## P1-G. 검증 결과 (원문 · 종료코드 `cmd` 재측정)

```
# i18n merge
> cd static/ui && npm run merge
ALL 19 KEYS OK (ko+en)          ← 신규 키 전수 조회 (+ previewUnknown 1건 추가 후 재확인)
team        65/65  대칭: true
user        89/89  대칭: true
permission  60/60  대칭: true
myPage     120/120 대칭: true
common     105/105 대칭: true
```
`ko-KR.json`/`en-US.json` 직접 수정 없음. `locales/script/*.json` 미사용.

```
# 전체 테스트 (static/ui)
Test Suites: 24 passed, 24 total
Tests:       326 passed, 326 total       ← 291 → 326 (+35). 실패 0 · 스킵 0 · 회귀 0
Snapshots:   1 passed, 1 total

> cmd /c "npm test > %TEMP%\p1t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0

> cmd /c "npm run build > %TEMP%\p1b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.
  Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/context.ts' …
  Failed to parse source map from '…/@atlaskit/analytics-next-stable-react-context/src/index.ts' …
  Failed to parse source map from '…/marklassian/index.ts' …
  1.7 MB (+2.47 kB)  build\static\js\main.*.js
```
경고 3건은 **node_modules 소스맵 누락**으로 팀 기능 착수 이전부터 존재한다(우리 코드 경고 0건).

신규 35건 내역: `userFormOptions` 24 + `inheritedPermission` 11.

## P1-H. P0 무회귀 확인 (직접 grep)

| 항목 | 실측 |
|---|---|
| `?? null` 4필드 | `useUserEditModal.js:188-192` — role/level/team `?? null` **유지**, permission 만 `toPermissionKeyPayload`(위 P1-E #1 근거). salary 분기 불변 |
| `invoke("updateUser")` 호출부 | **여전히 1곳** |
| `toParentOption` value 보존 | `buildTeamTree.js:245` `if (!value) return null` — 미변경, 테스트 7건 통과 |
| 팀 필터 3상태 | `constants/team.js:20` `'__NONE__'` 미변경. `{value:null}` 생성 경로 **0** |
| `limits`/`truncated`/`hasCycle`/`demotedKeys` 배너 | `TeamPage.jsx` 미변경 |
| **DnD** | 팀·마이페이지 전체 grep → `TeamTreePanel.jsx:18` **금지 주석 1건뿐** |
| **P2/P3 코드** | `addTeamMembersToProject`/`projectTeams`/`getTeamMemberCandidates` grep → `MyTeamSection.jsx:28` **주석 1건뿐**, 코드 0 |
| 기존 291건 | 전부 통과(jest transform 변경 후 재확인) |

## P1-I. 미구현 · 발견한 문제 · 미확정

### 의도적 미구현
- **사용자 등록 모달의 "팀 상속"** — 백엔드 INSERT 경로가 `?? getMemberId()` 라 표현 불가(P1-E #2)
- **H4(내 팀원만 조회)** — 설계서가 비목표로 선언
- **P2 전량** — 프로젝트-팀 배정, `projectKeys.projectTeams`, 팀원 일괄 추가
- `findUserByAccountId` 마스킹 대응 — 호출 지점 0(백엔드 §P1-0 #5)

### 발견한 문제

| # | 내용 | 판단 |
|---|---|---|
| FE-P1-1 | **`useTeamTree` 는 `!res.success` 에서 throw 하므로 React Query 가 기본 3회 재시도한다.** `/backoffice/permission` 에서 TEAM_ONLY 를 고른 관리자가 `getTeamList` grant(TEAM_MANAGEMENT/USER_MANAGEMENT read)를 없으면 **권한 거부 응답을 4번** 받는다 | 기능·보안 영향 없음(fail-soft 로 배너만 생략). `retry:false` 를 넣으면 P0 팀 페이지 동작도 함께 바뀌므로 **이번 범위에서 건드리지 않았다** — 리더 판단 |
| FE-P1-2 | **"내 팀" 팀 선택기에 다른 팀 이름을 표시할 수 없다.** `leadingTeamKeys` 는 키만 주고 이름은 `findTeamById`(선택된 1개)에서만 온다. 리더인 팀이 2개 이상이면 선택되지 않은 항목이 "다른 팀"으로 표시된다 | UUID 노출은 하지 않았다(F2/F4 규칙 준수). 근본 해결은 `userPermissionCheck.team` 에 `leadingTeams:[{teamKey,name}]` 을 싣는 것 — **백엔드 1필드 추가면 끝난다.** 팀장이 2팀 이상을 겸임할 때만 발현 |
| FE-P1-3 | `permissionSource: 'none'` 상태(로그인은 되는데 전 리소스 false)를 **UI 가 아직 안내하지 않는다** | store 셀렉터(`getPermissionSource`)는 넣었으나 화면 문구는 §9 P1 체크리스트에 없어 만들지 않았다. 마이페이지 "내 권한" 섹션에 한 줄 추가가 자연스러운 자리 — 리더 판단 |

### 미확정 (배포/E2E 필요)

| # | 항목 |
|---|---|
| 1 | **팀장 축 실기동**(백엔드 P1-U2) — Member 세트 팀장이 `/my-page` "내 팀" 에서 팀원 목록을 보고 스킬을 저장할 수 있는가. 로컬은 권한 매트릭스 대조로만 확인했다(위 P1-D 표) |
| 2 | **TEAM_ONLY 실기동**(P1-U1) — 세트에 지정 + 팀원 배치 후 프로젝트 목록이 실제로 좁혀지는가 |
| 3 | 팀 미지정자 경고의 `unassignedCount` — `getTeamList` 가 fresh 로드(F3)라 정확하지만, PERMISSION_MANAGEMENT 만 가진 계정에서 실제로 거부되는지 미확인(fail-soft 는 코드로 보장) |
| 4 | 리더 겸임(2팀 이상) 팀장의 팀 선택기 UX — FE-P1-2 |
| 5 | E2E 미수행 — 팀장 계정을 만들어 화면을 열어본 적이 없다 |

---

## P1-J. O4 보강 (2026-07-28) — §R7 대조 테스트에 사이클 픽스처 추가

> 지적: 대조 테스트의 픽스처가 **F1 정규화가 적용된 입력**뿐이라, 정규화가 되돌려지면
> 테스트는 통과한 채 미리보기가 거짓말한다. 검증자 랜덤 대조 — 정규화 입력 18,044건 **0 불일치** /
> raw 입력 **282건 불일치**(전부 사이클, fail-open 방향).

### 판단 — **프론트가 틀렸다. 백엔드가 옳다.**

불일치를 재현해 원인을 특정했다.

| 층 | 사이클 노드 처리 |
|---|---|
| 백엔드 `buildTeamIndex` | 사이클 구성원의 `parentOf` 를 **`null` 로 강등** → `pathOf(사이클노드) = [self]` → `nearestAncestorWith` 는 **자기 세트만** 본다 |
| 프론트(기존) | `parentTeamKey` 를 **그대로 따라감**(방문 집합으로 종료만 함) → **사이클 상대 팀의 세트까지 봤다** |

→ 미리보기가 **"상속받는다"고 표시했는데 실제 판정은 권한 없음** = **fail-open 오표시**.
미리보기는 "당신이 잃게 될 권한"을 알리는 화면이라 이 방향의 오차가 가장 나쁘다 —
관리자에게 "괜찮다"고 보여주고 실제로는 그 사용자가 전 권한을 잃는다.

**정상 경로에서는 발현하지 않는다**(백엔드 F1 정규화가 사이클을 응답에 싣지 않음).
그러나 P0 에서 `buildTeamTree` 에 "방어 코드를 제거하지 마라"고 못박은 것과 **같은 이유**로,
미리보기 경로도 응답 정규화에 의존하지 않게 만들어야 한다.

### 수정 — 강등 규칙을 프론트에도 적용 (이중 방어)

`resolveInheritedPermission` 이 조상 체인을 오르다가 **사이클 구성원에 닿으면 거기서 멈춘다**
(= 루트로 강등된 것으로 취급, 백엔드 `pathOf` 와 동일).

```js
if (cycleMembers.has(cursor)) break;   // 사이클 구성원 = 루트 강등 → 부모를 따라가지 않는다
```

사이클 판정은 `buildTeamTree` 가 이미 쓰는 **`findCycleMemberKeys` 를 그대로 재사용**했다 —
같은 파일 안에서 사이클 규칙이 두 벌로 갈라지지 않게 하기 위함이다.
손상 부모키(dangling)는 기존 `byKey.has(cursor)` 검사가 이미 같은 결과를 낸다.

### 픽스처 — raw(비정규화) 입력을 양쪽에 동일하게 준다

`RAW_CYCLE_BE` / `RAW_CYCLE_FE` (같은 데이터의 KVS 형태 / 응답 형태) **12팀**:

| 구조 | 의도 |
|---|---|
| `cycA(세트A) ↔ cycB(세트B)` | 2노드 상호 참조 — 상대 세트를 상속하면 안 된다 |
| `cycChild → cycA` | 사이클 구성원의 자식 |
| `selfRef → selfRef`, `selfRefChild → selfRef` | 자기참조 |
| `dangling → ghost`, `danglingChild → dangling` | 손상 부모키 |
| `tri1 → tri2 → tri3 → tri1` (tri2 만 세트 보유) | **3노드 순환** — 실제 불일치가 나온 케이스 |
| `root(세트R) → rootChild` | 이상 데이터와 섞여도 정상 서브트리 무영향 |

**12팀 전부**를 `it.each` 로 백엔드 실행 결과와 대조한다(케이스를 골라 적으면 조합을 빠뜨린다).
+ 의미를 못박는 단언 6건(사이클 자기 세트만 / 자식은 구성원까지만 / 3노드 순환 / 자기참조 / dangling / 정상 서브트리).

### 검출력 자기검증 — 방어를 빼면 **실제로 잡힌다**

"통과했지만 사실은 아무것도 검사하지 않는" 테스트를 배제하기 위해, 방어 1줄을 임시로 제거하고 실행했다.

```
× tri1 — 백엔드 판정과 일치
    Expected: null
    Received: "perm-T"
× tri3 — 백엔드 판정과 일치
    Expected: null
    Received: "perm-T"
× 3노드 순환에서 세트 없는 구성원은 순환 상대의 세트를 상속하지 않는다
    Received: {"teamKey":"tri2","permissionKey":"perm-T","permissionName":"T세트", ...}

Tests: 3 failed, 26 passed, 29 total
```
→ 기대 `null`(권한 없음) ↔ 실제 `perm-T`. **검증자가 보고한 fail-open 방향과 정확히 일치**한다.
확인 후 즉시 원복했다(`grep` 으로 복원 확인).

### 결과

| 항목 | 값 |
|---|---|
| `inheritedPermission.test.js` | 11 → **29건** (+18: raw 12팀 대조 + 의미 단언 6) |
| 전체 프론트 | 326 → **344건** (+18). 실패 0 · 스킵 0 · **회귀 0** |
| 소스 변경 | `buildTeamTree.js` — `resolveInheritedPermission` 에 `cycleMembers` 판정 + 주석. **다른 파일 무변경** |
| i18n | 변경 없음(merge 불필요) |

```
> cmd /c "npm test > %TEMP%\o4t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 24 passed, 24 total
Tests:       344 passed, 344 total

> cmd /c "npm run build > %TEMP%\o4b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.      ← node_modules 소스맵 3건(기존), 우리 코드 경고 0
```

### 무회귀 재확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| `?? null` 4필드 | role/level/team `?? null` 유지, permission 만 `toPermissionKeyPayload`(P1 규칙) |
| `toParentOption` value 보존 | `buildTeamTree.js:261` `if (!value) return null` 미변경 |
| `'__NONE__'` | `constants/team.js:20` 미변경 |
| `limits` 리터럴 | `maxDepth: 10`/`maxTeams: 500`/`MAX_TEAMS` 프론트 전역 **0건** |
| **DnD** | 금지 주석 1건 외 **0건** |
| **P2/P3 코드** | `addTeamMembersToProject`/`projectTeams`/`getTeamMemberCandidates` **0건** |
| `jest.config.js` | 지시대로 **미변경** |

### 남은 한계 (미확정)

| # | 내용 |
|---|---|
| 1 | 이 방어는 **미리보기 경로 한정**이다. `buildTeamTree`(트리 렌더)는 P0 에서 이미 같은 규칙을 갖고 있으나, 향후 `getTeamList` 응답을 소비하는 **새 계산 코드가 생기면 같은 함정이 반복**된다. 근본 해결은 "응답을 받는 즉시 한 번 정규화한 뒤 전 소비부가 그것만 쓰는" 어댑터 층이지만, 기존 소비부를 전부 옮기는 일이라 이번 범위에서 하지 않았다 — **리더 판단** |
| 2 | 검증자가 쓴 랜덤 대조(18,044건)를 프론트 테스트로 옮기지 않았다. 고정 픽스처 12팀 + 의미 단언으로 대체했다 — 랜덤 생성기를 프론트에 두면 실패가 재현되지 않는 테스트가 될 수 있어서다. 랜덤 대조는 검증자 도구에 남는 편이 맞다고 판단 |

---

## P1-K. 실기동 피드백 대응 (2026-07-28) — 팀 등록/편집 실효 권한 경고

> 피드백: **"팀 생성 시 권한을 아무것도 선택 안 해도 그냥 생성된다 — 문제 있다."**
> 세트 없는 팀에 배치되고 개인 권한이 **"팀 상속"** 인 사용자는 `permissionSource:'none'` → **전 리소스 권한 상실**.
> P1-N2 에서 막은 사고가 **팀 쪽 입구로 다시 들어오는** 경로다.

### 판단 — 지시에 동의한다. 경고하되 저장은 막지 않는다

**필수 입력으로 만들지 않았다.** 근거 3가지:

1. **조상에 세트가 있으면 하위 팀은 비워두는 것이 정상 운영**이다 — `nearestAncestorWith` 가 존재하는 이유가 그것이다. 무조건 필수로 만들면 설계(R2 상속)를 부정하게 된다.
2. 조직 개편 중 "팀 먼저 만들고 권한은 나중" 이 정상 흐름이고, 차단하면 **루트 팀을 만들 때마다** 세트를 강제로 골라야 한다.
3. 위험한 조합은 **"미지정 ∧ 조상에도 없음"** 하나뿐이다. 그 한 경우만 `warning` 톤으로 눈에 띄게 하면 목적이 달성된다.

### 4분기 판정 — 순수 함수 `resolveTeamPermissionEffect`

`backoffice/page/team/buildTeamTree.js` (기존 `resolveInheritedPermission` 재사용).

| # | 조건 | 톤 | 문구 |
|---|---|---|---|
| ① | 이 팀에 세트 지정 | info | "이 팀의 권한 세트: {name} — 개인 권한이 지정되지 않은 팀원에게 적용됩니다." |
| ② | 미지정 + 조상에 세트 있음 | info | "상위 팀 '{team}' 의 권한 세트({name})를 상속합니다." (**정상, 경고 아님**) |
| ③ | 미지정 + 조상에도 없음 | **warning** | "이 팀과 상위 팀 어디에도 권한 세트가 없습니다. 이 팀에 배치되고 개인 권한이 '팀 권한 상속' 인 사용자는 **모든 권한을 잃습니다.**" |
| ④ | **모름** | info | "상위 팀 정보를 불러오지 못해 상속받을 권한을 확인할 수 없습니다." |

**④ 가 지시받은 거짓 경고 방지다.** "모른다"로 떨어지는 조건을 **3가지**로 잡았다:
- 팀 목록 **로딩 중** → `null` 반환(아무것도 렌더하지 않는다)
- 팀 목록 **조회 실패**(`isError`)
- **상위 팀이 로드된 목록에 없음** — `truncated`(500팀 상한)나 부분 로드 상황. 지시에 없던 3번째 케이스인데,
  빈 배열만 막고 이걸 놓치면 같은 거짓 경고가 다른 입구로 들어온다.

**판정이 팀 목록 없이 확정되는 두 경우는 ④로 새지 않는다:**
- ① 세트 지정 → 조상과 무관
- ③ 중 **최상위 팀**(부모 없음) → 조상 자체가 없으므로 확정

→ 조회가 실패해도 "루트 팀에 세트 없음" 경고는 정상 동작한다. 가장 흔한 발현 케이스다.

### 자기 팀의 저장된 세트를 섞지 않는다

탐색을 **부모부터** 시작한다(`resolveInheritedPermission(teams, parentTeamKey)`).
`teams` 는 `getTeamList` 의 **저장된** 값이라, 편집 모달에서 세트를 방금 비운 팀을 self 부터 탐색하면
**자기 자신의 옛 세트를 주워 "상속됨"으로 오표시**된다. 테스트로 고정했다.

### 등록 모달 — 상위 팀 Select 를 바꾸면 경고도 따라 바뀐다

Atlaskit `<Field>` 는 값이 폼 내부에 갇혀 다른 필드와 함께 판단할 수 없다.
→ `parent`·`permission` 두 필드를 **로컬 state 로 미러링**했다. `fieldProps.onChange` 는 **그대로 호출**하므로
폼 제출 경로(`handleSubmit(formData)`)는 1줄도 바뀌지 않았다. 모달을 닫으면 미러를 비운다
(다음에 열 때 이전 선택이 남아 잘못된 안내를 하지 않도록).

`defaultParentTeamKey`(트리에서 하위 팀 추가로 진입)도 판정에 반영한다.

### 문구는 두 모달이 공유한다

`TeamPermissionEffect.jsx` (렌더 전용). 등록·편집이 **같은 문구·같은 톤**을 쓰게 한다 —
같은 상황을 두 화면이 다르게 설명하면 그 자체가 결함이다.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `backoffice/page/team/buildTeamTree.js` | `resolveTeamPermissionEffect` 신규(순수) |
| `backoffice/page/team/TeamPermissionEffect.jsx` | **신규** — 배너 렌더(등록·편집 공유) |
| `backoffice/page/team/__test__/teamPermissionEffect.test.js` | **신규 20건** |
| `backoffice/page/team/modal/edit/useTeamEditModal.js` | `permissionEffect` 산출(폼 값 기준) + `useTeamTree` 로딩/에러 함께 읽기 |
| `backoffice/page/team/modal/edit/TeamEditModal.jsx` | 배너 렌더 |
| `backoffice/page/team/modal/regist/TeamRegistrationModal.jsx` | 폼 값 미러 2개 + 배너 렌더 |
| `locales/kr|en/team.json` | `team.permission.effect.{own,inherited,none,unknown}` **4키** |

**코디네이터 변경(무한 스피너 수정)은 건드리지 않았다** — `useTeamDetail` 의 `NON_RETRYABLE`/`retry`,
`TeamDetailPanel` 의 `SectionMessageAction`/`onRetry`, `TeamPage` 의 `onRetry={detail.refetch}`,
`common.button.retry` 키 모두 grep 으로 잔존 확인했다.

### 검증

```
> npm run merge
team 69/69 대칭: true   common 106/106 대칭: true
team.permission.effect.{own,inherited,none,unknown} — ko/en 4키 전부 존재
common.button.retry ko: 다시 시도 | en: Retry      ← 코디네이터 추가분 보존
```

```
> cmd /c "npm test > %TEMP%\o5t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 25 passed, 25 total
Tests:       364 passed, 364 total        ← 344 → 364 (+20). 실패 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\o5b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                   ← node_modules 소스맵 3건(기존)
```

> ⚠ **빌드가 실제로 결함을 잡았다.** 첫 시도에서 `TeamEditModal.jsx` 의 `</FieldBlock>` 을 실수로
> 지워 `Failed to compile` 이 났다(`BUILD=1`). **테스트 364건은 그대로 통과했다** — 순수 함수만 덮기
> 때문이다. 수정 후 재빌드해 `BUILD=0` 확인. 테스트만 보고 넘겼으면 깨진 화면이 나갈 뻔했다.

### 무회귀 재확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| `?? null` 4필드 | role/level/team `?? null` 유지, permission 만 `toPermissionKeyPayload`(P1 규칙) |
| `toParentOption` value 보존 | 미변경 |
| `'__NONE__'` / `limits` 리터럴 | 미변경 / 프론트 전역 0건 |
| **DnD** | 금지 주석 1건 외 **0건** |
| **P2/P3 코드** | **0건** |
| 코디네이터 수정 3파일 | 전부 잔존 |

### 남은 한계 (미확정)

| # | 내용 |
|---|---|
| 1 | 경고는 **팀 폼 안에서만** 뜬다. 이미 만들어진 "세트 없는 팀"을 **트리에서 한눈에 식별할 수단은 없다** — 팀을 하나씩 열어봐야 한다. 트리 노드에 표식을 붙이는 편이 낫지만 `getTeamList.teams[]` 에 `permissionKey` 가 이미 있어 **프론트만으로 가능**하다(백엔드 변경 0). 이번 지시 범위를 넘어 하지 않았다 — **리더 판단** |
| 2 | 백엔드가 병행 중인 **시드 세트 4종**(PM/PMO/Team Lead/Team Member) 배포 후에는 ③ 분기 도달 빈도가 줄어든다. 문구는 그대로 유효하다(파일 겹침 없음 확인) |
| 3 | E2E 미수행 — 경고 문구가 실제 화면에서 어떻게 보이는지(모달 높이·스크롤) 확인하지 않았다 |

---
---

# P2-a — 프로젝트-팀 배정 + 팀 축 소비 (프론트)

> 작성: 2026-07-28 / frontend-engineer
> 입력: `02_backend_report.md` **P2-a 절**(§P2-a-0 배포 순서 · §P2-a-1 실제 shape · §P2-a-2 N1 규약 · §P2-a-3 E1~E6), `01_architect_design.md` §3 팀 지표 단일 정의 · §9 P2-a 체크리스트 · §16
> 범위: **P2-a 만.** P2-b(N7·N5) / P2-c(N6·U12) / `PortfolioTeamDist`(L-4 제외)는 **손대지 않았다.**

## P2a-A. 인계 4건 처리 결과

### 1. `aggregateByTeam` — **`?? 0` 금지**를 함수 계약으로 못박았다

`static/ui/src/utils/team/aggregateByTeam.js` (순수) + **39건 테스트**.

| 상황 | 결과 |
|---|---|
| 기여 행이 하나도 없음 | **`null`**(집계 전) — **`0` 이 아니다** |
| 일부만 없음 | 있는 값만 합산 + **`missing[field]` 에 빠진 인원 수** (조용히 삼키지 않는다) |
| 실제 값이 0 | `0` 그대로 (모름과 구분) |
| 분모 합이 0 | **`null`** (Infinity 를 내지 않는다) |
| 분자·분모 중 **한쪽만** 있음 | 기여하지 않음 (비율 왜곡 방지) |

- `avgFields` 는 **`{field, numerator, denominator}` 3필드 스펙만** 받는다. **단순 산술평균 옵션을 API 에 두지 않았다** — 두면 언젠가 쓰인다(설계서 M2).
  테스트로 고정: `{field:'util'}` 만 넘기면 `null` 이 나오고 **`0.5`(산술평균)가 나오지 않는다.**
- 산술평균이 실제로 틀린 값을 낸다는 것도 테스트로 고정했다 — 분모가 다른 2인(`9/10`, `1/90`)에서 가중은 `0.1`, 산술평균은 `≈0.46`.
- 팀 미소속을 **숨기지 않는다**(숨기면 소계 합 ≠ 전체 합). 항상 **마지막 그룹**.
- 이름을 어디서도 못 찾아도 **teamKey(UUID)를 라벨로 쓰지 않는다**(F2/F4 규칙 유지).

### 2. 가동률 "집계 전" 구분 — `hasWeightedMetrics`

`hasWeightedMetrics(utilization)` 를 같은 모듈에 뒀다. **서버 판정을 그대로 쓴다**(백엔드 E5 — 소비처마다 재도출하면 판정이 갈린다). 필드가 없는 구버전 응답은 **`false`(모른다) — fail-close**.

> ⚠ P2-a 에는 **가동률을 그리는 화면이 아직 없다**(N6/N7 은 P2-b/c). 이 회차의 산출물은 **함수와 계약**이고, 소비처는 다음 회차다 — 설계서가 `aggregateByTeam` 을 P3-A 에서 P2 로 앞당긴 이유 그대로다.

### 3. `assignmentReady: false` = "모른다"

`useProjectTeams` 가 두 상태를 **분리 노출**하고, `ProjectTeamBar` 가 3분기로 렌더한다:

| 상태 | 표시 |
|---|---|
| `assignmentReady === false` | `team.project.notReady` — **"스키마 갱신 대기"**. "담당 팀 없음"이라고 말하지 않는다 |
| `true` ∧ `teams.length === 0` | `team.project.empty` — 진짜 배정 없음 |
| `true` ∧ 팀 있음 | 뱃지 목록 |

`assignmentReady` 필드가 아예 없으면(구버전) **`false`** 로 떨어뜨린다 — fail-close.
편집 버튼도 `assignmentReady` 일 때만 노출한다(미준비 상태에서 저장하면 서버가 에러를 전파하므로).

### 4. `deleteTeam.removedProjectAssignCount` — `number | null` 분기

```js
if (content.removedProjectAssignCount === null) lines.push(t('team.delete.assignSkipped'));
else if ((content.removedProjectAssignCount ?? 0) > 0) lines.push(tFormat(t, 'team.delete.assignRemoved', {...}));
```
- **`null`(정리 미수행)을 "0건 정리됨"이라고 말하지 않는다** — 정리되지 않은 것을 정리됐다고 하는 거짓 보고다.
- `0`(대상 없음)은 **문장을 만들지 않는다**(소음). `null` 일 때만 건너뛴 사실을 알린다.
- 기존 P0/P1 토스트 문구(`detached`/`permissionLost`/`inheritanceChanged`)는 **1줄도 바꾸지 않았다.**

### 5. N1 UI 규약

두 실행 경로를 **버튼으로 명시 분리**했다 — `accountIds` 유무가 모드를 결정하므로 한 버튼으로 합치면 의미가 뒤집힌다.

| 버튼 | payload | 비활성 조건 |
|---|---|---|
| **[팀 전체 추가]** | `accountIds` **키 자체를 안 보냄** (`includeDescendants` 적용) | 후보 0명 |
| **[선택 N명 추가]** | `accountIds: [...]` (`includeDescendants` 무시) | **선택 0명** ← 서버 `TEAM_MEMBER_SELECTION_EMPTY` 도달 방지(1차 방어) |

- 훅에도 **2차 가드**를 뒀다: `Array.isArray(accountIds) && length === 0` 이면 invoke 하지 않고 던진다.
  키를 빼면 "팀 전체"가 되어 **의미가 뒤집히므로** 조용히 넘기지 않는다.
- **`alreadyAssigned` 는 서버 판정을 그대로 쓴다.** 프론트가 프로젝트 인력 목록과 교차시키지 않는다.
- 하위 포함 토글을 바꾸면 **선택을 비운다** — 모집단이 달라져 "보이지 않는 사람이 추가되는" 상태를 막는다.
- 스코프 위반은 **전체 거부**다. `error.cause`(위반 accountId 배열) 길이를 읽어 "요청 전체가 취소되었습니다"로 안내한다.

## P2a-B. 소비한 응답 shape

| resolver | 읽는 경로 | 소비 위치 |
|---|---|---|
| `getProjectTeams` | `content.teams[].{teamKey,name,isPrimary,memberCount,assignedMemberCount}` | `useProjectTeams` → `ProjectTeamBar` |
| | **`content.assignmentReady`** | 3분기 렌더(위) |
| `setProjectTeams` | `content.savedCount` | 저장 토스트 |
| `getTeamMemberCandidates` | `content.candidates[]`(`alreadyAssigned` 포함) / `total` / `assignedCount` | `TeamMemberPickModal` |
| `addTeamMembersToProject` | `content.{addedCount,skippedCount}` · `error.cause` | 결과 토스트 |
| `findProjectusersByProjectId` | 행의 **`teamKey`/`teamName`**(camelCase) | 인력 탭 팀 컬럼 · 분석 리포트 팀 컬럼/필터 |
| `getResourceOverview` | `content.people[].teamKey/teamName` · **`content.teamMeta`** | `/resource` 팀 컬럼·필터 |
| `deleteTeam` | `content.removedProjectAssignCount` (**`number\|null`**) | 삭제 토스트 |
| `getTeamOptions` | `content.options[].{value,label,depth,parentTeamKey}` | 팀 계층(후손 판정) — **아래 P2a-D #1 참조** |
| `getPortfolioDashboard` | `utilization.people[].investedMd/availMd`, `utilization.hasWeightedMetrics`, 루트 `teamMeta`/`memberTeamMap` | **아직 소비처 없음**(P2-b/c). `aggregateByTeam`/`hasWeightedMetrics` 가 계약만 확정 |
| `getResourceProfile` | `content.profile.teamKey/teamName` | **미소비**(드로어 표시는 체크리스트에 없어 넣지 않았다) |

`getResourceAnalysisList` 에는 팀이 **없다**(백엔드 E1 — KVS 10분 캐시라 팀 이동이 얼어붙는다).
→ 팀은 **행 축(`findProjectusersByProjectId`)에서만** 읽고, 지표와 accountId 로 병합한다. 백엔드 판단을 그대로 따랐다.

## P2a-C. 구현 항목 (§9 P2-a 프론트 체크리스트)

| 체크리스트 | 상태 |
|---|---|
| `projectKeys.projectTeams` + `projectKeys.teamMemberCandidates` | ✅ **인라인 키 0건.** `teamMemberCandidates` 키에 **`includeDescendants` 포함**(빼면 토글해도 옛 목록이 남는다) |
| `useProjectTeams` / `useTeamMemberCandidates` | ✅ (+ `useSetProjectTeams` / `useAddTeamMembersToProject`) |
| 인력 탭 — 담당 팀 뱃지 | ✅ `ProjectTeamBar` — 대표팀 표시, `assignedMemberCount/memberCount`, 삭제된 팀(`name:null`)도 **숨기지 않는다** |
| 인력 탭 — 팀 컬럼 | ✅ `teamName ?? '-'`(UUID 라벨 금지) |
| 인력 탭 — 팀원 일괄 추가 + 골라 담기 모달 | ✅ `TeamMemberPickModal` (체크박스 · `alreadyAssigned` 비활성 · 0명 실행 비활성) |
| 담당 팀 편집 | ✅ `ProjectTeamEditModal` — 대표팀 후보를 **선택된 팀으로 제한**(서버 `TEAM_NOT_FOUND` 1차 방어) + 전량 해제 경고 |
| `/resource` 팀 필터·컬럼(+ 하위 포함 토글) | ✅ |
| 리소스 분석 리포트 팀 컬럼·필터 | ✅ **페이징 경계 처리 포함**(아래 P2a-D #2) |
| `aggregateByTeam` 순수함수 + 테스트 | ✅ 39건 |
| (선택) 배정 관계도 노드 팀 색상 | ⬜ **미구현** — 체크리스트가 `(선택)`. 백엔드도 E6 로 같은 이유로 미구현이라 소비처가 없다 |

## P2a-D. 백엔드/설계서와 달라진 점 · 판단

| # | 항목 | 판단 |
|---|---|---|
| 1 | **팀 계층 조회에 `getTeamList` 가 아니라 `getTeamOptions` 를 쓴다** | 하위 포함 판정에 `parentTeamKey` 가 필요한데, `getTeamList` 의 grant 는 `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` 라 **`/resource`(RESOURCE_MANAGEMENT)·프로젝트 상세(PROJECT) 사용자에게 항상 거부**된다 → 화면 진입마다 실패 호출이 쌓인다. `getTeamOptions` 는 grant 가 5키로 넓고 **`parentTeamKey` 를 함께 준다**. `resolveTeamFilter` 가 두 shape(`teamKey`/`value`)을 흡수하도록 어댑터를 넣고 **동치 테스트**를 붙였다 |
| 2 | **분석 리포트 팀 필터는 전량 조회로 전환한다** | 이 목록은 10건 페이징이라 현재 페이지만 필터하면 **"3페이지의 개발팀 사람이 안 보이는" 조용한 오답**이 된다. 팀 필터가 켜지면 `pagesize: 500` 으로 1회 조회하고 페이지네이션을 숨긴다(설계서 N3-1 과 같은 처리, 백엔드 변경 0). **쿼리키에 `pagesize` 를 넣어** 인력 탭 캐시(`['projectUsers', id, page]`)와 섞이지 않게 했다. 500명 초과 프로젝트는 **필터를 비활성화하고 이유를 말한다**(잘린 결과를 보여주지 않는다) |
| 3 | `getResourceProfile.teamKey/teamName` 미소비 | 드로어 팀 표시는 §9 체크리스트에 없다. 넣으면 검증 대상만 는다 — 백엔드 E6 와 같은 판단 |
| 4 | i18n `team.project.addMembers.result` → **`team.project.addResult`** | 설계서 키에 **점이 들어 있어** `t()` 의 경로 탐색(`a.b.c`)으로 도달할 수 없다. `addMembers`(버튼 라벨, 문자열)와 `addMembers.result`(중첩)가 **같은 키에 공존할 수 없는** 것과 같은 문제(P1 `permission.scope.TEAM_ONLY` 와 동형) → 평탄화했다. **merge 산출물에 점 포함 키가 0건임을 검사로 확인** |
| 5 | 남은 `?? 0` 5곳 | **의도적.** 전부 서버가 **항상 number 로 보장하는 카운트**(`memberCount`·`assignedMemberCount`·`addedCount`·`skippedCount`·`savedCount`)에만 붙어 있다. `null` 이 "모름"을 뜻하는 **지표 경로(`aggregateByTeam`)에는 `?? 0` 이 0건**이고, `total`/`assignedCount` 는 `?? 0` 대신 `null` 체크로 통과시킨다(조회 전이면 문구를 아예 만들지 않는다) |
| 6 | E1~E6 (백엔드가 설계서와 다르게 한 6건) | 프론트 영향은 **E1·E5·E6 셋**. E1 → 팀을 행 축에서만 읽음(위 P2a-B). E5 → `hasWeightedMetrics` 를 재도출하지 않고 그대로 소비. E6 → 관계도 노드 팀 색상 미구현. E2/E3/E4 는 서버 내부·안내 문구라 조치 없음 |

## P2a-E. 신규/변경 파일

### 신규 (7)
| 파일 | 내용 |
|---|---|
| `static/ui/src/utils/team/aggregateByTeam.js` | **팀 롤업 순수 함수** + `hasWeightedMetrics` |
| `static/ui/src/utils/team/__test__/aggregateByTeam.test.js` | 39건 — `?? 0` 회귀 가드 중심 |
| `static/ui/src/utils/team/teamFilter.js` | 클라이언트 팀 필터(3상태 + 하위 포함) — 두 shape 흡수 |
| `static/ui/src/utils/team/__test__/teamFilter.test.js` | 23건 |
| `static/ui/src/hooks/useProjectTeams.js` | `getProjectTeams` / `setProjectTeams` |
| `static/ui/src/hooks/useTeamMemberCandidates.js` | `getTeamMemberCandidates` / `addTeamMembersToProject`(N1 가드) |
| `static/ui/src/pages/projectDetail/user/{ProjectTeamBar,ProjectTeamEditModal,TeamMemberPickModal}.jsx` | 인력 탭 UI 3종 |

### 수정 (9)
| 파일 | 변경 |
|---|---|
| `utils/queryKey/projectKeys.js` | `projectTeams` · `teamMemberCandidates` **2키** |
| `backoffice/page/team/teamErrors.js` | P2-a 에러 5코드 번역 + 스코프 에러 2종 `NON_RETRYABLE` |
| `backoffice/page/team/modal/edit/useTeamEditModal.js` | `removedProjectAssignCount` **`null`/`0`/`>0` 3분기** |
| `pages/projectDetail/user/ProjectUserPanel.jsx` | 담당 팀 바 + 팀 컬럼 |
| `pages/resource/overview/{ResourceOverviewTab,ResourceFilters,ResourceOverviewTable,useResourceOverview}.jsx/js` | 팀 필터·컬럼·`teamMeta` |
| `pages/projectDetail/analysisReport/resource/{ResourceAnalysisPage,ResourceAnalysisTable}.jsx` | 팀 컬럼·필터·전량 조회 전환 |
| `locales/kr\|en/{team,resource,projectDetail}.json` | **34키** |

## P2a-F. 검증 (원문 · 종료코드 `cmd` 재측정)

```
# i18n merge
> cd static/ui && npm run merge
ALL 35 KEYS OK
team          105/105 대칭: true
resource      139/139 대칭: true
projectDetail 339/339 대칭: true
common        106/106 · user 89/89 · permission 61/61 · myPage 121/121  전부 대칭
점 포함 키: 없음        ← t() 경로 탐색으로 도달 불가능한 키 0건
```

```
> cmd /c "npm test > %TEMP%\p2t2.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 27 passed, 27 total
Tests:       426 passed, 426 total      ← 364 → 426 (+62). 실패 0 · 스킵 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\p2b2.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존), 우리 코드 경고 0
  1.71 MB (+4.85 kB)  build\static\js\main.*.js
```

> **테스트 통과를 빌드 성공의 근거로 쓰지 않았다** — 지시대로 `npm run build` 를 매번 별도로 돌렸다.
> (지난 회차에 JSX 태그 누락으로 테스트 364건 통과 + 빌드 실패가 실제로 났다.)

## P2a-G. 범위·무회귀 확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| **P2-b/P2-c 코드** | `getMyTeamWorkAnalysis`/`PortfolioTeamComparison`/`PortfolioTeamDist`/`costMasked`/`CostAccess` → **0건** |
| **대시보드 미변경** | `git status -- static/ui/src/pages/portfolio static/ui/src/pages/projectDetail/dashboard` → **무출력**(P2-c 단독 롤백 가능) |
| **DnD** | 금지 주석 1건 외 **0건** |
| `?? null` 4필드 | role/level/team `?? null` 유지, permission 은 `toPermissionKeyPayload`(P1 규칙) |
| `toParentOption` value 보존 | 미변경 |
| `'__NONE__'` | `constants/team.js:20` 미변경 — 클라이언트 팀 필터도 **같은 센티넬**을 쓴다 |
| `limits` 리터럴 | 프론트 전역 `maxDepth: 10`/`maxTeams: 500`/`MAX_TEAMS` **0건** (분석 리포트의 `TEAM_FILTER_PAGE_SIZE=500` 은 **프론트 전량조회 크기**이지 서버 한계값이 아니다 — 별개 상수) |
| `truncated`/`hasCycle`/`demotedKeys` 배너 | `TeamPage.jsx` 미변경 |
| `teamQueryRetry`/`toTeamQueryError` | 신규 훅 2종이 **그대로 재사용**(정책이 훅마다 갈리지 않게) |
| 기존 364건 | 전부 통과 |

## P2a-H. 미확정 · 발견한 문제

| # | 항목 |
|---|---|
| **FE-P2a-1** | **`assignmentReady:false` 화면을 실측한 적이 없다.** `v014` 미실행 상태를 로컬에서 재현하지 않았다(백엔드 `TableReadiness` 도 mock 기반). 배포 직후 마이그레이션 전 창에서 문구가 실제로 뜨는지 확인 필요 — **P2a-U1 과 같은 창** |
| **FE-P2a-2** | 분석 리포트 팀 필터의 **전량 조회 전환 시 500명 경계**를 실데이터로 확인하지 않았다. `total_count > 500` 이면 필터를 막지만, 정확히 500명인 프로젝트에서 마지막 1명이 잘리지 않는지는 서버 `pagesize` 동작에 의존한다 |
| **FE-P2a-3** | **가동률 2필드를 그리는 화면이 아직 없다.** `aggregateByTeam`/`hasWeightedMetrics` 는 테스트로만 검증됐고 **실응답으로 한 번도 돌려보지 않았다.** P2-b(N7) 착수 시 첫 실사용이 된다 — 그때 `investedMd`/`availMd` 가 실제로 `null` 로 오는지 함께 확인해야 한다 |
| **FE-P2a-4** | TEAM_ONLY 스코프가 **넓어진다**(담당 배정만 있는 프로젝트가 새로 보임). 프론트 변경은 없지만 **사용자 체감이 바뀌는 변화**라 배포 안내가 필요하다 — 리더 판단 |
| **FE-P2a-5** | `getTeamOptions` 는 `truncated` 를 주지만 **팀 필터 화면에서 그 배너를 띄우지 않는다**(팀 500개 초과 시 옵션 일부 누락). `/backoffice/team` 에는 배너가 있다. 필터 드롭다운에도 필요한지 — 리더 판단 |
| **FE-P2a-6** | E2E 미수행 — 담당 팀 편집·골라 담기 모달을 실제로 열어본 적이 없다 |

---

## P2a-I. P2a-F1 수정 (2026-07-28) — `teamMeta` shape 불일치

> 지적: `aggregateByTeam` 의 JSDoc 이 `teamMeta` 를 `{[teamKey]:{name}}` 로 선언했는데
> **실제 생산자 둘 다 형태가 다르다.** 검증자 실행 결과 두 shape 모두 팀명이 `"팀 미지정"` 으로 오표기.

### 판단 — 내 JSDoc 이 틀렸다. 생산 측은 설계서대로다

`src/` 실측으로 세 형태가 공존함을 확인했다:

| 출처 | 코드 | 실제 shape |
|---|---|---|
| `getPortfolioDashboard.teamMeta` | `PortfolioDashboardService.js:111` `Object.fromEntries([...byKey.values()].map(t => [t.teamKey, t.name]))` | **객체 · 값이 문자열** |
| `getResourceOverview.content.teamMeta` | `ResourceManagementService.js:148` `[...byKey.values()].map(t => ({ id, name, parentTeamKey, depth }))` | **배열 · 키가 `id`** |
| 내 JSDoc | — | 객체 · 값이 객체 |

내 구현은 `teamMeta?.[teamKey]?.name` 하나만 봤다. 나머지 두 경우엔 `undefined` → `group.teamName ?? unassignedLabel` 로 떨어져 **소속된 사람이 전부 "팀 미지정"** 이 된다. 에러도 빈 값도 아니라 **조용하다** — 이 파일이 막으려던 계열 그대로다.

### 수정

**1. `normalizeTeamMeta` 신설 (export)** — 세 shape 을 전부 흡수해 `Map<teamKey, name>` 으로 정규화.
`teamFilter.normalizeTeams`(`teamKey`/`value`/`id`)와 **같은 방식**이다. 배열은 `id`/`teamKey`/`value` + `name`/`label`,
객체는 문자열값 / `{name}` / `{label}` 을 받는다. 알 수 없는 형태·빈 이름은 **던지지 않고 빈 Map**
— 이름 사전은 보조 출처이고, 여기서 던지면 지표 집계 전체가 죽는다.

**2. "팀 없음" ≠ "이름 모름" 분리** — 지적대로 두 상태가 한 라벨로 뭉쳐 있었다.

| 상태 | `teamName` | 신규 플래그 |
|---|---|---|
| `teamKey == null` (진짜 미소속) | `unassignedLabel` | `isUnassigned:true, hasName:false` |
| `teamKey` 있음 · 이름 찾음 | 팀명 | `isUnassigned:false, hasName:true` |
| `teamKey` 있음 · **이름 모름** | **`unknownTeamLabel`**(신규 옵션) | `isUnassigned:false, hasName:false` |

`teamKey` 는 세 경우 모두 보존해 드릴다운이 끊기지 않고, 이름을 몰라도 **라벨에 UUID 를 쓰지 않는다**(F2/F4 규칙 유지).
호출부는 이미 있는 `team.form.unknownTeam` 키를 넘기면 된다(i18n 추가 없음).

**3. JSDoc 을 실제 계약으로 정정** — 세 shape 을 표로 명시하고 생산자 파일명을 적었다.

**4. 죽은 폴백 정리** — `ResourceOverviewTab.jsx` 의 `teamMeta?.[key]?.name` 은 **배열에 키 접근**이라
항상 `undefined` 였다. `normalizeTeamMeta` 로 교체했다. (오늘 무해했던 이유는 행의 `p.teamName` 이 항상 채워져
폴백에 도달하지 않아서다 — 원인이 해소된 게 아니라 **가려져 있었다.**)

**5. `teamFilter.normalizeTeams` 에 `id` 추가** — 같은 shape 불일치 계열이라 함께 막았다.
`getResourceOverview.teamMeta`(배열·`id`·`parentTeamKey`)를 계층 소스로 넘겨도 후손이 펴진다.

### 검출력 자기검증 — 구 구현으로 되돌리면 **실제로 잡힌다**

```
× 포트폴리오(객체·문자열값)
    Expected: "개발팀"      Received: "팀 미지정"
× 리소스(배열·id)
    Expected: "개발팀"      Received: "팀 미지정"
× 팀은 있는데 이름을 못 찾으면 unknownTeamLabel — 미지정으로 찍지 않는다
    Expected: "(알 수 없는 팀)"  Received: "팀 미지정"

Tests: 3 failed, 57 passed, 60 total
```
→ 검증자가 보고한 증상과 **글자 그대로 일치**한다. 확인 후 원복(`grep` 으로 복원 확인).

기존 39건이 이 결함을 못 잡은 이유도 분명하다 — **전부 JSDoc shape 하나로만 호출**했다.
신규 테스트는 `it.each` 로 **세 shape 을 모두** 통과시킨다.

### 변경 파일 (4) · i18n 변경 없음

| 파일 | 변경 |
|---|---|
| `utils/team/aggregateByTeam.js` | `normalizeTeamMeta` 신설(export) · `unknownTeamLabel` 옵션 · `isUnassigned`/`hasName` 플래그 · JSDoc 정정 |
| `utils/team/__test__/aggregateByTeam.test.js` | **+21건** (shape 3종 × 흡수/집계, "팀 없음 ≠ 이름 모름" 5건, 방어 8건) |
| `utils/team/teamFilter.js` | `normalizeTeams` 에 `id` 추가 + 주석 |
| `utils/team/__test__/teamFilter.test.js` | +1건 (배열·`id` shape) |
| `pages/resource/overview/ResourceOverviewTab.jsx` | 죽은 폴백 → `normalizeTeamMeta` |

### 검증 (종료코드 `cmd` 재측정)

```
> cmd /c "npm test > %TEMP%\f1t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 27 passed, 27 total
Tests:       448 passed, 448 total      ← 426 → 448 (+22). 실패 0 · 스킵 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\f1b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존), 우리 코드 경고 0
```
빌드를 테스트와 **별도로** 돌려 확인했다(테스트 통과를 빌드 근거로 쓰지 않았다).

### 무회귀 재확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| 대시보드 `git status` | **무출력** — P2-c 단독 롤백 가능 상태 유지 |
| P2-b/P2-c 코드 | **0건** |
| DnD | 금지 주석 1건 외 **0건** |
| `aggregateByTeam` 의 `?? 0` | **주석 3건뿐, 코드 0건** — 지표 경로 무오염 |
| `?? null` 4필드 | 유지(permission 은 `toPermissionKeyPayload`) |
| `limits` 리터럴 | 프론트 전역 **0건** |
| `'__NONE__'` / `toParentOption` | 미변경 |

### 남은 한계

| # | 내용 |
|---|---|
| 1 | `unknownTeamLabel` 은 **옵션이고 기본값이 빈 문자열**이다. 넘기지 않으면 이름 모르는 팀이 빈 라벨로 렌더된다. 필수 인자로 만들 수도 있었으나 그러면 기존 호출부가 전부 깨진다 → **P2-b/c 구현자가 `t('team.form.unknownTeam')` 을 넘겨야 한다.** 현재 프로덕션 소비자가 0이라 지금은 무해하고, 넘기지 않아도 **"미지정"으로 오표기되지는 않는다**(빈 라벨이지 거짓 정보가 아니다) |
| 2 | 세 번째 shape 이 또 생기면 같은 문제가 반복된다. 근본 해결은 백엔드가 `teamMeta` 형태를 **하나로 통일**하는 것이지만, 두 응답 모두 이미 배포돼 있어 이번 범위 밖이다 — **리더 판단** |
| 3 | `getResourceOverview.teamMeta` 는 `parentTeamKey`·`depth` 를 갖고 있어 `/resource` 의 계층 소스로 쓰면 `getTeamOptions` 호출을 없앨 수 있다. 이번엔 **바꾸지 않았다**(구버전 응답에 `teamMeta` 가 없으면 후손 확장이 조용히 죽는다). 어댑터는 준비돼 있다 |

---
---

# P2-b — N7(내 팀 업무 분석) + N5(캘린더 팀 필터) 프론트

> 작성: 2026-07-28 / frontend-engineer
> 입력: `02_backend_report.md` **P2-b 절**(§P2-b-0 필독 3가지 · §P2-b-2 N7 · §P2-b-3 N5 · §P2-b-4 F1~F3 · §P2-b-7 인계), `03_verify_report.md` §10, `01_architect_design.md` §3 N5·N7 · §3 팀 지표 단일 정의 · §16
> 범위: **P2-b 만.** P2-c(N6 대시보드 비교 · U12 인건비 게이트)는 **파일 하나도 건드리지 않았다.**

## P2b-A. 백엔드가 못박은 3가지 처리 결과

### 1. `teamKey` 를 항상 보낸다 — **이중 방어**

`getMyTeamWorkAnalysis` 는 `grants: []` + `teamLead` 단독 축이라, `teamKey` 가 없으면
빈 화면이 아니라 **`PERMISSION_DENIED`** 가 나간다.

| 층 | 방어 |
|---|---|
| 훅 (`useMyTeamAnalysis`) | `enabled: enabled && !!teamKey` — **팀 선택 전에는 요청이 나가지 않는다** |
| 렌더 (`MyTeamSection`) | `{selectedTeamKey && <MyTeamAnalysisPanel …/>}` — 패널 자체를 마운트하지 않는다 |

`selectedTeamKey` 는 P1 의 `useMyTeam` 이 `leadingTeamKeys[0]` 으로 채우므로, 리딩 팀이 1개여도 그 키가 실린다.
쿼리키도 `myPageKeys.teamAnalysis(teamKey)` 로 **teamKey 를 포함**한다(팀 전환 시 캐시가 섞이지 않게).

### 2. `?? 0` 금지 — 신규 파일 **코드 0건**

`grep "?? 0"` 결과 신규 2파일에서 **주석 2건뿐, 코드 0건**.

| 값 | 처리 |
|---|---|
| `utilization`/`investedMd`/`availMd`/`completionRate` = `null` | 훅이 **가공하지 않고 그대로** 넘긴다. UI 는 `-`(집계 전) |
| `hasWeightedMetrics === false` | **가동률을 아예 그리지 않는다.** `SectionMessage` 로 "집계 전" + `aggregateStatus` 안내 |
| `hasWeightedMetrics` 필드 부재(구버전) | `=== true` 비교라 **`false`** — fail-close |

`utilBand` 로 배지를 그리는 유혹이 있었지만, `hasWeightedMetrics === false` 면 밴드도 신뢰할 수 없으므로
가동률 축 전체를 `-` 로 둔다. **"가동률 0인 팀"은 어떤 경로로도 렌더되지 않는다.**

### 3. 팀 롤업은 `aggregateByTeam` 으로만 — **첫 실사용**

P2-a 에서 만들고 P2a-I 로 고친 함수의 **첫 실제 소비처**다. 지시대로 플래그를 UI 에 연결했다:

| 산출 | UI 연결 |
|---|---|
| `missing[field] > 0` | 값 옆에 **경고색 `*`** + 툴팁 `"{count}명은 아직 집계 전이라 합계에서 제외되었습니다."` — 조용히 삼키지 않는다 |
| `isUnassigned` | `unassignedLabel`(팀 미지정) |
| `hasName === false` | `unknownTeamLabel` = **`t('team.form.unknownTeam')` 을 넘겼다** (안 넘기면 빈 문자열이 되는 함정 — P2a-I 한계 #1) + 톤을 낮춰 미소속과 시각적으로 구분 |
| 가동률 | 가중 `{field:'utilization', numerator:'investedMd', denominator:'availMd'}` |

`teamMeta` 는 **배열**(F2)이지만 `normalizeTeamMeta` 가 흡수하므로 그대로 넘겼다 — P2a-I 수정이 여기서 값을 한다.

## P2b-B. 롤업에서 **제외한** 두 지표와 근거

지시에 없던 판단이라 근거를 남긴다. 둘 다 **합산하면 틀린 숫자**가 된다.

| 지표 | 팀 행 | 근거 |
|---|---|---|
| **`completionRate`** | **표기 안 함**(팀원 행에만) | 사람당 `spent/(spent+remaining)` 인데 서버가 **분자·분모를 주지 않는다.** `avgFields` 는 가중 전용이라 계산할 수 없고, 산술평균은 설계가 금지한 방식이다(분모가 다른 사람을 평균 내면 틀린다). 설계서 §3 은 N7 에 "팀원 평균 완수율"을 적었지만, **가중에 필요한 두 값이 응답에 없어 그대로는 구현할 수 없다.** 화면 하단 note 에 "완수율은 최근 26주 기준이라 팀 소계를 내지 않는다"를 명시했다 |
| **`projectCount`** | **`-`** | 두 팀원이 같은 프로젝트에 있으면 **중복 계상**된다. 설계서가 `issueCount` 에 대해 내린 판단과 동형이다 |
| `todo`/`inProgress`/`done` | **합산함** | 이슈 담당자는 1명이라 팀원 간 **가산적**이다(중복 없음) |

→ 서버에 `spent`/`remaining` 을 추가하면 팀 완수율을 가중으로 낼 수 있다. **리더 판단**.

## P2b-C. N5 — 금지 3항목을 지켰다

| 금지 | 실측 확인 |
|---|---|
| 그룹 키에 `teamKey` 금지 | `git diff` 에서 `` `${schedule_start_date}__${schedule_end_date}__${schedule_type}` `` 줄이 **`-`(삭제) 없이 그대로** |
| `+1일 보정` 금지 | `end: addDaysToDateString(first.schedule_end_date, 1)` 줄도 **무변경** |
| 필터를 `filtered` 단계에만 | `schedules.filter(...)` 한 곳에만 팀 조건을 AND 로 얹었다. 그룹핑·`first` 선택 로직 미접촉 |

**회귀 가드 테스트 4건**(`teamFilterByAccount.test.js`)이 훅의 그룹핑을 재현해 단언한다:
- 필터 전후 살아남은 이벤트의 **`start`/`end`/그룹키가 바이트 단위로 동일**
- **전체 필터에서 이벤트 개수가 늘지 않는다** — 그룹 키가 팀별로 갈리면 3건으로 분열해 이 테스트가 깨진다
- 팀 미지정 필터도 통합 이벤트를 쪼개지 않는다

**맵 규약 준수**: `memberTeamMap` 은 팀 미소속자의 **키가 아예 없다**(`null` 값 금지). 따라서
`map[accountId] === undefined` 가 곧 "팀 미지정"이다 — `matchesTeamFilterByAccount` 가 이 규약을 그대로 구현하고 테스트로 고정했다.

**degrade**: 팀 축이 비면(`teamOptions.length === 0`) **필터 UI 자체를 렌더하지 않는다.**
캘린더는 그대로 산다. 눌러도 아무 일이 없는 컨트롤을 만들지 않기 위함이다.

## P2b-D. 소비한 응답 shape

| resolver | 읽는 경로 | 소비 위치 |
|---|---|---|
| `getMyTeamWorkAnalysis` | `content.members[]`(전 필드) | `MyTeamAnalysisPanel` 팀원 표 |
| | `content.teamMeta`(**배열**) | `aggregateByTeam` → `normalizeTeamMeta` 가 흡수 |
| | `content.scope.{memberCount,includesDescendants}` | 헤더 배지·"하위 팀 포함" 표기 |
| | `content.{lastAggregatedAt,aggregateStatus}` | 집계 시각 / "집계 전" 안내 |
| | **`content.hasWeightedMetrics`** | 가동률 렌더 여부(재도출 안 함 — F1/E5) |
| `getProjectCalendarWorklog` | **루트** `memberTeamMap` / `teamMeta`(**객체 맵**) | 캘린더 팀 필터 |
| | 기존 `data` | 무변경 |

> `teamMeta` 가 N7 은 배열, 캘린더는 객체 맵이다. **통일하지 않는 것이 백엔드 설계 규칙**이고
> `normalizeTeamMeta` 가 이미 세 형태를 흡수하므로 소비 코드가 갈리지 않는다.

## P2b-E. 신규/변경 파일

### 신규 (4)
| 파일 | 내용 |
|---|---|
| `pages/myPage/hooks/useMyTeamAnalysis.js` | N7 — `teamKey` 필수 `enabled`, `null` 무가공 통과 |
| `pages/myPage/sections/MyTeamAnalysisPanel.jsx` | 팀 소계 표 + 팀원 표 + 집계 전 안내 |
| `utils/team/__test__/teamFilterByAccount.test.js` | **13건** — 맵 규약 9 + **N5 회귀 가드 4** |

### 수정 (5)
| 파일 | 변경 |
|---|---|
| `utils/queryKey/myPageKeys.js` | `teamAnalysis(teamKey)` **1키**(인라인 키 0) |
| `utils/team/teamFilter.js` | `matchesTeamFilterByAccount` 신규(accountId ↔ memberTeamMap) |
| `pages/myPage/sections/MyTeamSection.jsx` | `selectedTeamKey` 있을 때만 분석 패널 마운트 |
| `pages/projectDetail/calender/useProjectWorkersSchedule.js` | `filtered` 단계에만 팀 조건 AND (**그룹키·+1일 무변경**) |
| `pages/projectDetail/calender/ProjectCalender.jsx` | 팀 필터 Select · 워크로그 작성자 팀 필터 · degrade 분기 |
| `locales/kr\|en/myPage.json` | **15키** (`myPage.team.analysis.*`) |

## P2b-F. 검증 (원문 · 종료코드 `cmd` 재측정)

```
# i18n merge
ALL 23 KEYS OK
myPage 136/136 · team 105/105 · resource 139/139 · projectDetail 339/339
common 106/106 · user 89/89 · permission 61/61      전부 대칭
키 안에 점 포함: 없음        ← t() 경로 탐색 불가 키 0건(P2-a 교훈)
```

```
> cmd /c "npm test > %TEMP%\p2bt.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 28 passed, 28 total
Tests:       461 passed, 461 total      ← 448 → 461 (+13). 실패 0 · 스킵 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\p2bb.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존), 우리 코드 경고 0
  1.71 MB (+2.7 kB)  build\static\js\main.*.js
```
빌드를 테스트와 **별도로** 돌렸다(테스트 통과를 빌드 근거로 쓰지 않았다).

## P2b-G. 범위·무회귀 확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| **P2-c 표면 미변경** | `git status -- pages/portfolio pages/projectDetail/dashboard` → **무출력**. `costMasked`/`CostAccess`/`PortfolioTeamComparison`/`PortfolioTeamDist` → **0건**. 단독 롤백 가능 상태 유지 |
| **캘린더 날짜 로직** | 그룹 키·`addDaysToDateString(+1)` 줄이 diff 에 **삭제(-)로 등장하지 않음** |
| **신규 파일 `?? 0`** | **주석 2건뿐, 코드 0건** |
| **DnD** | 금지 주석 1건 외 **0건** |
| `?? null` 4필드 | 유지(permission 은 `toPermissionKeyPayload`) |
| `toParentOption` / `'__NONE__'` / `normalizeTeamMeta` | 미변경 |
| `limits` 리터럴 | 프론트 전역 **0건** |
| `teamQueryRetry`/`toTeamQueryError` | 신규 훅이 **그대로 재사용** |
| 기존 448건 | 전부 통과 |

## P2b-H. 미확정 · 발견한 문제

| # | 항목 |
|---|---|
| **FE-P2b-1** | **`aggregateByTeam` 첫 실사용이지만 실응답으로는 아직 못 돌렸다**(P2b-U1). 로컬은 순수 함수 테스트뿐이다. 특히 `teamMeta` **배열** 형태는 `normalizeTeamMeta` 테스트로만 확인됐고 **실제 N7 응답으로 검증한 적이 없다** — P2a-F1 이 정확히 이 축의 불일치였다. **실기동 1순위** |
| **FE-P2b-2** | **캘린더 팀 필터는 하위 팀을 전개하지 않는다.** `memberTeamMap` 은 `{accountId: teamKey}` 평면 맵이라 계층이 없고, `teamMeta` 도 캘린더에서는 객체 맵(`{key: name}`)이라 `parentTeamKey` 가 없다. `getTeamOptions` 를 추가로 부르면 되지만 **호출을 늘리지 않았다** — 프로젝트 캘린더의 팀 필터는 "이 프로젝트 인력의 팀"이라 계층이 얕고, 하위 팀 인원도 이미 개별 옵션으로 노출된다. 필요하면 `getTeamOptions` 1줄 추가로 가능 — **리더 판단** |
| **FE-P2b-3** | **팀 완수율을 팀 행에 내지 않았다**(위 P2b-B). 설계서 §3 의 "팀원 평균 완수율"을 그대로 구현하려면 서버가 `spent`/`remaining` 을 줘야 한다. 산술평균으로 대체하지 않았다 — 설계가 금지한 방식이고 값이 틀린다 |
| **FE-P2b-4** | N7 실기동 미검증(P2b-U4) — 실제 팀장 계정으로 `/my-page` 진입 시 `getMyTeamWorkAnalysis` 통과 여부. `teamKey` 누락 시 **PERMISSION_DENIED** 라 이중 방어를 넣었지만 **실제로 통과하는 것을 본 적은 없다** |
| **FE-P2b-5** | 관리자(`isAdmin`)는 grants 우회로 통과하지만 `leadingScopeAccountIds=[]` 라 **빈 결과**를 받는다(M-3 의도). 이때 화면은 `myPage.team.analysis.empty` 를 띄운다 — 팀장이 아닌데 섹션이 보이는 경우가 있는지는 실기동 확인 필요 |
| **FE-P2b-6** | E2E 미수행 — 분석 표·캘린더 팀 필터를 실제로 열어본 적이 없다 |

---

## P2b-I. 검증 반영 (2026-07-28) — F1 수정 + O1 구조 개선

### P2b-F1 (Medium) — **내가 틀렸다.** 세 카운트도 가산적이지 않다

`ResourceLoadFetcher.js:287-306` 을 직접 열어 확인했다:

```js
const participantCount = Math.max(1, (hasAssignee ? 1 : 0) + coworkers.length);
const perSpent = spent / participantCount;      // ← 나눈다 (가산적)
const perRem   = rem   / participantCount;      // ← 나눈다 (가산적)
...
for (const pid of participants) {
    if (cat === 'new') cur.todoCount += 1;      // ← 나누지 않는다 (중복 계상)
    else if (cat === 'indeterminate') cur.inProgressCount += 1;
    else if (cat === 'done') cur.doneCount += 1;
    cur.spentSeconds += perSpent;
    cur.remainingSeconds += perRem;
}
```

**내 리포트의 "이슈 담당자는 1명이라 가산적"은 사실이 아니었다.** JQL 이
`assignee in (...) OR movesRmsCoworkers in (...)` 로 가져오고, coworker 는 이 앱의 **1급 커스텀 필드**다.
같은 팀 두 명이 한 이슈에 참여하면 **팀 소계가 2번 센다.** 팀원 행은 정상이고 **소계만 틀렸다.**

`projectCount` 를 뺀 근거가 그대로 적용되는데, 나는 그 근거를 세 카운트에 적용하지 않았다.
**같은 판단을 한 화면 안에서 일관되게 적용하지 못한 것이 결함의 형태다.**

#### 수정 — 분류를 상수로 고정하고 테스트로 감시

주석만으로는 다음 사람이 다시 더한다 → `pages/myPage/sections/teamAnalysisFields.js` 신설:

| 상수 | 내용 |
|---|---|
| `ADDITIVE_SUM_FIELDS` | `['effortMd']` — 배치 ①글로벌 산출물이라 사람마다 자기 워크로그 기준(겹치지 않는다) |
| `NON_ADDITIVE_FIELDS` | `['todoCount','inProgressCount','doneCount','projectCount','completionRate']` + 각 사유 주석 |
| `WEIGHTED_AVG_FIELDS` | `[{utilization, investedMd, availMd}]` |

- 패널이 이 상수를 **import 해서** `aggregateByTeam` 에 넘긴다(단일 출처).
- 팀 소계 표에서 **세 컬럼을 제거**했다 — 항상 `-` 인 컬럼은 "왜 비었지?"를 남긴다.
  설계서가 `issueCount` 에 대해 내린 **"표기 생략"** 과 같은 처리다. **팀원 표에는 그대로** 있다.
- 화면에 이유를 남겼다(`myPage.team.analysis.subtotalNote`) — 조용히 생략하지 않는다.

#### 회귀 가드 12건 (`__test__/teamAnalysisFields.test.js`)

- `it.each(NON_ADDITIVE_FIELDS)` — **누가 다시 sumFields 에 넣으면 그 자리에서 깨진다**
- 교집합 공집합 · 상수 동결 · 가중 스펙 3필드 형태
- **왜 틀리는지를 실행으로 증명**: 같은 팀 2명이 같은 이슈 1건에 참여한 픽스처에서
  `sumFields` 에 `doneCount` 를 넣으면 `2` 가 나온다(실제 완료 이슈는 1건). 현재 설정에서는 컬럼 자체가 없다.

> 근본 해결은 서버가 중복 제거한 팀 단위 카운트를 주는 것이다. **이번 범위가 아니라 하지 않았다** —
> 지금은 틀린 숫자를 안 보여주는 것이 우선이다. 리더 판단 항목으로 남긴다.

### P2b-O1 — 회귀 가드가 훅을 재구현하던 문제

지적대로 N5 테스트가 그룹핑을 **다시 짜고 있었다.** 그러면 훅의 그룹 키에 `teamKey` 가 들어가도
테스트는 통과한다 — 감시하려던 회귀를 정확히 놓친다.

**§R7 미러 때와 같은 처방**: 훅과 테스트가 **같은 함수**를 쓰게 만들었다.

`pages/projectDetail/calender/scheduleGrouping.js` 신설(순수):
- `buildScheduleGroupKey(schedule)` — `` `${start}__${end}__${type}` ``
- `groupSchedules(schedules)` — 입력 순서 보존 그룹 배열

훅은 인라인 그룹핑을 지우고 `groupSchedules(filtered)` 를 호출한다.
테스트는 **그 함수를 import** 하므로 훅이 바뀌면 즉시 깨진다.

추가로 **그룹 키 자체의 계약**을 4건 단언했다 — `account_id` 가 달라도 같은 키 /
**`team_key` 가 달라도 같은 키** / 기간·타입이 다르면 다른 키.

#### 검출력 자기검증 — 그룹 키에 `teamKey` 를 넣어보면 잡힌다

```
× 기간 + 타입만으로 구성된다
    Expected: "2026-08-03__2026-08-07__ANNUAL"
    Received: "2026-08-03__2026-08-07__ANNUAL__"
× team_key 가 달라도 같은 키다 — 팀 축은 그룹핑에 관여하지 않는다
    Expected: "2026-08-03__2026-08-07__ANNUAL__sales"
    Received: "2026-08-03__2026-08-07__ANNUAL__dev"
Tests: 2 failed, 15 passed
```
→ 이전 구조(재구현)에서는 **이 변경이 테스트를 전혀 건드리지 못했다.** 확인 후 원복.

### 변경 파일 (6)

| 파일 | 변경 |
|---|---|
| `pages/myPage/sections/teamAnalysisFields.js` | **신규** — 가산/비가산 분류 단일 출처 |
| `pages/myPage/sections/__test__/teamAnalysisFields.test.js` | **신규 12건** — 분류 불변식 + 중복 계상 증명 |
| `pages/projectDetail/calender/scheduleGrouping.js` | **신규** — 그룹 키/그룹핑 순수 함수 |
| `pages/myPage/sections/MyTeamAnalysisPanel.jsx` | `sumFields` 상수화 · 소계 3컬럼 제거 · 사유 note · 헤더 표 정정 |
| `pages/projectDetail/calender/useProjectWorkersSchedule.js` | 인라인 그룹핑 → `groupSchedules` (날짜 로직 무변경) |
| `utils/team/__test__/teamFilterByAccount.test.js` | 재구현 제거 → 공유 함수 import · **+4건**(그룹 키 계약) |
| `locales/kr\|en/myPage.json` | `analysis.note` 정정 + `analysis.subtotalNote` **1키** |

### 검증 (종료코드 `cmd` 재측정)

```
> npm run merge
myPage 137/137 · team 105/105 · resource 139/139 · projectDetail 339/339 · common 106/106  전부 대칭
키 안에 점: 없음

> cmd /c "npm test > %TEMP%\f2t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 29 passed, 29 total
Tests:       477 passed, 477 total      ← 461 → 477 (+16). 실패 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\f2b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존)
```
빌드를 테스트와 **별도로** 돌렸다.

### 무회귀 재확인 (grep 실측)

| 항목 | 결과 |
|---|---|
| **P2-c 격리** | `git status -- pages/portfolio pages/projectDetail/dashboard` **무출력** · `costMasked`/`CostAccess`/`PortfolioTeamComparison` **0건** |
| **캘린더 `+1일 보정`** | diff 에 삭제(`-`) 없음 — 무변경 |
| **지표 경로 `?? 0`** | `aggregateByTeam`/N7 3파일 **주석 외 코드 0건** |
| **DnD** | 금지 주석 1건 외 **0건** |
| `?? null` 4필드 / `normalizeTeamMeta` / `'__NONE__'` / `limits` 리터럴 | 전부 유지 |
| 기존 461건 | 전부 통과 |

### 남은 한계

| # | 내용 |
|---|---|
| 1 | **팀 단위 이슈 건수를 지금은 제공하지 못한다.** 서버가 `participantCount` 로 나눈 **분수 카운트**나 중복 제거한 팀 카운트를 주면 복원할 수 있다. 화면에는 왜 없는지 문구로 남겼다 — **리더 판단** |
| 2 | `NON_ADDITIVE_FIELDS` 는 **내가 실측으로 분류한 목록**이다. 새 지표가 응답에 추가되면 **분류를 안 하고 그냥 합산될 위험**이 남는다(테스트는 등재된 것만 감시한다). 새 필드 합산 시 이 파일을 먼저 보라는 주석을 남겼다 |
| 3 | 그룹 키 공유는 **N5 한 곳만** 적용했다. 다른 화면에도 "테스트가 로직을 재구현" 패턴이 있는지는 확인하지 않았다 — 별건 |
| 4 | E2E 여전히 미수행 — 실기동 확인은 FE-P2b-1·FE-P2b-4 그대로 남아 있다 |

---
---

# P2-c — N6(대시보드 팀별 비교) + U12(인건비 게이팅) 프론트

> 작성: 2026-07-28 / frontend-engineer
> 입력: `02_backend_report.md` **P2-c 절**(§P2-c-0 동작 축소 · §P2-c-1 계약/3층 규칙 · §P2-c-4 프론트 담당), `01_architect_design.md` §3 N6 · §16(H-1/H-2/M-1/M-2/M-4/L-4), `05_fable_review_p2.md`
> 범위: **P2-c.** `PortfolioTeamDist`(L-4 제외)는 만들지 않았다.

## 🚨 P2c-A. 이 작업이 없으면 상태가 더 나빠진다 — 실행으로 증명

서버가 급여 3필드의 **키를 지웠지만** 프론트 집계부는 전부 `?? 0` 폴백이다.
JS 에서 `undefined ?? 0` 과 `null ?? 0` 은 똑같이 `0` → **키를 지워도 "₩0" 이 나온다.**

`__test__/costGate.test.js` 가 이 사실을 **실행으로 고정**했다(추정이 아니다):

```
√ summarizeSelection.totalSalary 가 0 이 된다 → 칩을 그리면 "₩0M"
√ tsrSignals.resource.totalSalary 가 0 이 된다 → 컬럼을 그리면 "₩0"
√ costByRoleLevel 이 0 짜리 막대를 만든다 → Cost 탭을 그리면 빈 값이 아니라 0
√ costKpi 도 0 을 낸다
√ 마스킹 전에는 실제 값이 나온다(대조군)
```

→ **거짓 숫자를 막는 방어선은 서버가 아니라 아래 7지점 게이팅이다.** 같은 배포에 함께 내야 한다.

## P2c-B. 게이팅 7지점 — 조치와 근거 (**배포 후 확인 목록**)

| # | 위치 | 조치 | 왜 그 방식인가 |
|---|---|---|---|
| **1** | `PortfolioFilterBar` 합계 칩 | **필드 숨김** (`{!costMasked && …}`) | 인원·공수 칩은 남는다. 칩 하나만 빠지므로 레이아웃이 깨지지 않고 화면 전체를 막지 않는다 |
| **2** | `PortfolioTsrSignalTable` salary 컬럼 | **컬럼 제거** | 값만 가리면 `₩0` 자리가 남는다. 컬럼째 빼야 "없는 정보"가 된다 |
| **3** | 〃 Cost 신호등 | **컬럼 제거** + **정렬 가중에서도 제외** | `costLevel`/`cpi`/`burnRate` 가 전부 `totalSalary` 기반이라 **0원 기준이면 초록불(오신호)** 이 된다. 값을 가리는 것보다 위험하다. ⚠ 추가로 red/amber **정렬 카운팅에서도 뺐다** — 컬럼은 감췄는데 순서가 오신호에 좌우되면 그것도 거짓 정보다 |
| **4** | `PortfolioProjectTable` salary 컬럼 | **컬럼 제거** | ⚠ **고아가 아니다** — `PortfolioTsrSignalTable:174` 의 "풀 수치표" 토글에서 렌더된다(백엔드 P2-c-3 실측 확인). 검토서대로 건너뛰었으면 여기가 "₩0" 으로 남았다 |
| **5** | Cost 탭 전체 | **탭 유지 + 안내 문구** | 탭을 목록에서 지우면 **사용자가 변화를 인지할 수 없고**(보이지 않는 제거), 빈 차트를 그리면 "₩0" 이 된다. 이유를 말하는 것이 두 실패 모드를 모두 피한다 |
| **6** | `salaryBuckets` 전달 | **미전달**(`costMasked ? [] : …`) | ⚠ 현재 **렌더 소비자가 없다**(유일 소비처 `PortfolioSalaryHistogram` 은 고아). 방어적 차단이며 그 사실을 아래 P2c-E 에 남겼다 |
| **7** | N6 인건비 축 | **선택지 제거 + MD 폴백** | 축이 사라진 채 남으면 빈 차트가 되고, `?? 0` 이 끼면 "₩0" 막대가 된다. `resolveTeamAxis` 가 현재 축을 `effortMd` 로 되돌린다 |

**고아 위젯 2종은 게이팅하지 않았다** — `PortfolioSalaryByProject`·`PortfolioSalaryHistogram` 은 외부 참조 0건이다.
죽은 코드를 가리면 커버리지 착각만 생긴다(U16 삭제 권고로 분리). 대신 **"여전히 고아인지" 자체를 테스트로 감시**한다 —
되살아나면 게이트 없이 급여가 노출되므로.

## P2c-C. N6 팀별 비교 위젯

### 4축 · `aggregateByTeam` 단일 롤업

| 축 | 계산 | 비고 |
|---|---|---|
| 가동률 | 가중 `Σ investedMd / Σ availMd` | **`utilization.people[]`(전사)** 에서 — 프로젝트 필터 무관 |
| 투입 공수 | `Σ effortMd` | **MD**. MM 아님(§16 M-2) |
| 완수율 | 가중 `Σ(completionRate × MD) / Σ MD` | 분자를 미리 만들어 `avgFields` 가중 기계에 태웠다 |
| 인건비 | `Σ salary` | `costMasked` 면 축 제거 |

**`NON_ADDITIVE_FIELDS`(P2-b) 규칙 준수**: 합산하는 것은 `effortMd`·`salary` 뿐이고 둘 다 프로젝트별 기여라 가산적이다.
비율 2축은 전부 가중이다. **카운트류는 합산하지 않는다** → P2b-F1 재발 없음.

### 🔴 가동률만 프로젝트 필터에 반응하지 않는다 (M-1)

축을 고르면 **전용 `SectionMessage`** 를 띄운다: "가동률은 전사 기준이며 프로젝트 선택의 영향을 받지 않습니다."
표기하지 않으면 사용자가 "필터가 안 먹는다"고 오해한다.
배치 미실행이면 **0% 로 그리지 않고** "집계 전"을 표기한다(`hasUtilizationData === false`).

### `기타` 묶음 = 합계 보존

상위 10팀 + **`기타(N개 팀)`** + **`팀 미지정`**(항상 마지막, 숨기지 않음).
자르기만 하면 "팀 소계 합 ≠ 전체"가 되어 §R6 결함과 같아진다 → **테스트가 합계 일치를 단언**한다.
⚠ 단 **비율 축은 묶어서 합산하지 않는다**(서로 다른 분모의 비율을 더하면 무의미) → `null`.

### dedup 비대칭

인원수는 **accountId dedup**, 공수·인건비는 **dedup 하지 않는다**(프로젝트별 기여의 합).
⚠ `aggregateByTeam.memberCount` 는 **행 수**(project × member)라 인원수가 아니다 — 직접 dedup 한 값으로 덮었다.
InfoTip 에 명시했다(안 하면 "인원 10명인데 인건비 15명분"으로 보인다).

## P2c-D. `teamMeta` 3층 규칙 (H-2) 준수

| 층 | 구현 |
|---|---|
| `teamMeta` | **이름 사전으로만** — `normalizeTeamMeta` 를 통해 이름 조회에만 쓴다 |
| `memberTeamMap` | 사람 → 팀 매핑 |
| **선택지/표시 대상** | **`projects[].members[]` ∘ `memberTeamMap`** 에서만 파생 |

**금지 2건을 테스트로 고정**:
- `teamMeta` 에만 있는 팀은 **절대 등장하지 않는다**(TEAM_ONLY 사용자가 못 보는 팀을 고르는 것을 차단)
- `utilization.people[]` 에만 있는 팀도 등장하지 않는다(필터 무관 글로벌이라 스코프 밖이 섞인다 — M-1)
  → 가동률 **값**은 전사로 계산하되 **표시 대상 팀은 스코프에서만** 온다

## P2c-E. 백엔드/설계서와 달라진 점

| # | 항목 | 판단 |
|---|---|---|
| 1 | **`teamComparison` 을 `portfolioAggregate.js` 가 아니라 별도 파일로 뺐다** | 백엔드 리포트는 같은 파일을 지정했으나, **P2-c 는 단독 롤백 단위**로 유지해야 하고 `portfolioAggregate.js` 는 P0~P2-b 전 화면이 공유하는 500줄 공용 모듈이다. 섞으면 롤백 diff 가 다른 위젯과 얽힌다. → `utils/teamComparison.js` 신설. **`portfolioAggregate.js` 는 `git diff` 무변경**(확인 완료) |
| 2 | **Cost 탭을 목록에서 지우지 않고 안내 문구로 대체** | 백엔드 지시("안내 문구로 대체")를 따랐다. 탭 제거는 **보이지 않는 변화**라 사용자가 이유를 알 수 없다 |
| 3 | **Cost 신호등 정렬 가중에서도 `costLevel` 제외** | 지시에 없던 추가 조치. 컬럼만 감추면 **순서가 0원 기준 오신호에 좌우된다** — 가린 값이 뒤에서 순위를 흔들면 그것도 거짓 정보다 |
| 4 | **#6 `salaryBuckets` 은 현재 렌더 소비자가 0** | 유일 소비처가 고아 위젯이다. 그래도 차단했다(방어). 이 사실을 명시하지 않으면 "게이팅했으니 안전"이라는 착각이 생긴다 |
| 5 | N6 위젯을 **Resource 탭에 배치** | 자원 축 위젯이고, Cost 탭에 두면 `costMasked` 일 때 위젯 전체가 안내 문구에 묻힌다(인건비 축만 빼면 나머지 3축은 정상 동작해야 한다) |
| 6 | `TeamSelect isMulti` 미추가 | 설계서 M-4 는 팀 멀티셀렉트를 언급하지만 **§9 P2-a/c 프론트 체크리스트의 N6 항목은 "비교 위젯"** 이다. 현재 위젯은 상위 10팀 자동 선정 방식이라 셀렉터가 필요 없다 — 쓰지 않는 prop 을 미리 넣지 않았다 |

## P2c-F. 신규/변경 파일

### 신규 (4)
| 파일 | 내용 |
|---|---|
| `pages/portfolio/utils/teamComparison.js` | N6 순수 함수 + 축 상수 + `availableTeamAxes`/`resolveTeamAxis` |
| `pages/portfolio/utils/__test__/teamComparison.test.js` | **25건** |
| `pages/portfolio/utils/__test__/costGate.test.js` | **23건** — U12 회귀 가드 |
| `pages/portfolio/widgets/PortfolioTeamComparison.jsx` | N6 위젯 |

### 수정 (5)
| 파일 | 변경 |
|---|---|
| `pages/portfolio/PortfolioDashboardPage.jsx` | `costMasked` 파생 · 3컴포넌트에 전달 · `salaryBuckets` 조건부(#6) · 팀 축 전달 |
| `pages/portfolio/PortfolioFilterBar.jsx` | 합계 칩 게이팅(#1) |
| `pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | salary 컬럼(#2) · Cost 신호등(#3) · **정렬 가중 제외** · 하위 전달 |
| `pages/portfolio/widgets/PortfolioProjectTable.jsx` | salary 컬럼(#4) |
| `pages/portfolio/sections/ComparisonTabs.jsx` | Cost 탭 안내(#5) · N6 위젯 마운트 |
| `locales/kr\|en/portfolio.json` | **13키** |

**`portfolioAggregate.js` 무변경** — `git diff --stat` 무출력.

## P2c-G. 검증

### 회귀 가드의 **검출력을 자기검증**했다 (2회 수정)

구조 검사를 처음 짰을 때 **게이팅을 지워도 통과**했다. 두 번 잡았다:

| 발견 | 원인 | 수정 |
|---|---|---|
| #4 게이팅을 지워도 통과 | 창 안에서 `costMasked` 라는 **단어**만 찾았는데 시그니처 기본값 `costMasked = false` 가 걸렸다 | **구문**을 찾도록 변경(`costMasked ?` / `&&` / `!costMasked`) + LOOKBACK 12→6 + "기본값 선언만 있으면 실패" 단언 추가 |
| #3·#7 오탐 | 토큰이 렌더 지점이 아니었다(#3 툴팁 빌더, #7 import 줄) | #3 은 `key: "c"`(렌더 셀), #7 은 인자 전달이라 줄 단위 검사에 맞지 않아 **전용 구조 단언**으로 분리 |

수정 후 재검증 — #4 게이팅을 실제로 제거하면:
```
× #4 풀 수치표 salary 컬럼 — costMasked 게이팅이 존재한다
    Received: "ungated at line 54: { key: \"salary\", content: t(\"portfolio.table.salary\"), isSortable: true },"
Tests: 1 failed, 22 passed
```
→ **이제 실제로 잡는다.** 확인 후 원복.

### 실행 결과 (종료코드 `cmd` 재측정)

```
> npm run merge
ALL 13 KEYS OK
portfolio 266/266 · team 105/105 · myPage 137/137 · resource 139/139 · projectDetail 339/339 · common 106/106  전부 대칭
키 안에 점: 없음

> cmd /c "npm test > %TEMP%\pct.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 31 passed, 31 total
Tests:       525 passed, 525 total      ← 477 → 525 (+48). 실패 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\pcb.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존)
```
빌드를 테스트와 **별도로** 돌렸다. (실제로 JSX attribute 자리에 `{/* */}` 주석을 넣은 실수를 빌드가 잡았고 수정했다.)

### 무회귀 (grep 실측)

| 항목 | 결과 |
|---|---|
| `portfolioAggregate.js` | **git diff 무변경** — 공용 집계부 무오염 |
| `?? 0` 지표 경로 | `aggregateByTeam`/`teamComparison` **코드 0건**(주석만) |
| `?? null` 4필드 · `normalizeTeamMeta` · `'__NONE__'` | 유지 |
| `limits` 리터럴 | 프론트 전역 **0건** |
| **DnD** | 금지 주석 1건 외 **0건** |
| 기존 477건 | 전부 통과 |

## P2c-H. 미확정 · 인계

| # | 항목 |
|---|---|
| **FE-P2c-1** | 🔴 **백엔드 §P2-c-00 의 깨진 HEAD 는 프론트가 고칠 수 없다.** `src/permission/CostAccess.js` 가 미추적이라 clean checkout 시 앱 전체가 로드 실패한다. **커밋 전 `git add` 필수** — 리더 조치 항목 |
| **FE-P2c-2** | **`costMasked` 실응답을 못 봤다.** 7지점 게이팅은 **구조 검사 + 순수 함수 테스트**로만 검증됐다. 실제 Member 계정으로 `/dashboard` 를 열어 7지점이 사라지는지 확인이 필요하다 — **배포 후 확인 목록은 위 P2c-B 표** |
| **FE-P2c-3** | N6 위젯 실기동 미검증(P2c-U5). `utilization.people[]` 에 `investedMd`/`availMd` 가 실제로 실려 오는지는 P2-a 배치 산출물에 달려 있다 — 배치 미실행 구간이면 "집계 전"으로 표시된다 |
| **FE-P2c-4** | **`?? 0` 폴백 8곳을 그대로 뒀다.** 게이팅으로 렌더를 막았지만 **집계 함수 자체는 여전히 0 을 만든다.** 근본 수정(폴백 제거)은 비게이팅 소비자까지 영향이 있어 범위를 넘는다 — 리더 판단. 현재는 **테스트가 이 사실을 명시적으로 고정**해 두었다 |
| **FE-P2c-5** | 고아 위젯 2종(U16) — 게이팅하지 않았고 **고아 상태를 테스트로 감시**한다. 삭제는 별건 |
| **FE-P2c-6** | 배포 노트 필요(P2c-U2) — §P2-c-0 "누가/무엇을" 표. **일반 사용자 대다수가 대시보드 인건비를 못 보게 된다** |

---

## P2c-I. 검증 반영 (2026-07-28) — F2 감시 장치 재설계 + O2 fail-close

### P2c-F2 — 근접 탐색이 잘못된 도구였다

검증자가 게이팅을 하나씩 제거해 **6/7 만 검출**됨을 밝혔다. `#2` 만 통과한 원인이 재현됐다:

> `#2`(salary 컬럼) 토큰이 있는 줄의 LOOKBACK 창(97~103)에 **`#3`(Cost 신호등)의 게이트(`:99`)가
> 들어와** 정규식을 만족시켰다 — **이웃 게이트를 빌려 통과**했다.

내가 이미 두 번 고친 자리다(단어→구문, LOOKBACK 12→6). 세 번째로 창을 줄이는 것은
**또 다른 이웃에 걸릴 뿐**이라는 지적이 맞다. **근접 탐색이라는 도구 자체가 틀렸다** —
"게이트가 근처에 있다"와 "이 컬럼이 그 게이트에 묶여 있다"는 다른 명제인데, 전자로 후자를 검사했다.

#### 수정 — 게이트를 단일 출처로 모으고, 테스트는 **출력**을 단언

`pages/portfolio/utils/costGating.js` 신설. 7지점이 **전부 이 함수들만 소비**한다:

| 함수 | 지점 |
|---|---|
| `showSalaryChip(costMasked)` | #1 |
| `signalTableColumnKeys(costMasked)` | **#2·#3** — 컬럼 **키 목록**을 반환 |
| `signalLevelsForSort(sig, costMasked)` | #3 부수(정렬 가중) |
| `projectTableColumnKeys(costMasked)` | #4 |
| `showCostTab(costMasked)` | #5 |
| `gateSalaryBuckets(buckets, costMasked)` | #6 |
| `availableTeamAxes`/`resolveTeamAxis` | #7 (기존) |
| `isCostMasked(data)` | 판정(O2) |

컴포넌트는 **키 목록 → 셀 정의 맵 → `pickCells`** 구조로 바뀌었다.
컬럼이 목록에 없으면 **렌더될 방법이 없다**(인라인 삼항이 사라졌다 — `grep` 확인: 컴포넌트 인라인 삼항 **0건**).
`pickCells` 는 정의 없는 키를 **조용히 버리지 않고 던진다** — 키와 셀이 갈리는 상태를 숨기지 않기 위함이다.

테스트는 소스를 읽지 않고 **함수 출력**을 단언한다:
`signalTableColumnKeys(true)` 가 `'salary'`/`'c'` 를 포함하지 않는다 — 텍스트가 아니라 **동작**이다.
이웃에서 빌릴 것이 없다.

부수로 **컬럼 순서 안정성**도 단언했다(마스킹 목록 = 비마스킹 목록에서 2컬럼만 제거) — 컬럼 밀림 방지.

#### 🔴 7/7 자기검증 — 게이트를 하나씩 제거해 재측정

`costGating.js` 의 각 게이트를 "항상 열림"으로 바꾸고 테스트를 돌렸다:

```
#1      DETECTED (1 failed)
#2/#3   DETECTED (2 failed)      ← Cost 신호등 컬럼
#2b     DETECTED (2 failed)      ← salary 컬럼 (이전에 놓쳤던 지점)
#4      DETECTED (1 failed)
#5      DETECTED (1 failed)
#6      DETECTED (1 failed)
O2      DETECTED (6 failed)      ← fail-close 판정
=> 전건 검출 OK
```
**6/7 → 7/7.** 각 변형 후 즉시 원복했고, 최종 `git diff` 로 원본 복구를 확인했다.

### P2c-O2 — **fail-close 로 바꿨다**

> 판단: **`=== true`(fail-open) → `!== false`(fail-close).**

근거 3가지:

1. **계약상 `costMasked` 는 항상 존재한다**(`emptyShape()` 포함). 부재는 구버전 서버이거나 깨진 응답 —
   둘 다 **"모른다"** 다. 이 회차 내내 지켜온 규칙("모른다"를 "없다"로 말하지 마라)과 같은 축이다.
   `usePermissionStore` 의 `?? false`, `hasWeightedMetrics === true`, `assignmentReady === true` 와 동일한 처리다.
2. **이 플래그가 지키는 것은 재무 데이터**다. 실패 방향의 손해가 비대칭이다 —
   조용한 유출 vs 눈에 보이는 축소. 후자가 낫다.
3. **서버만 롤백하면 게이트가 열린 채 급여가 다시 흐른다.** 보안 게이트가 배포 순서에 의존해선 안 된다.
   절차로 막을 수 있어도 **코드가 스스로 안전한 편**이 낫다는 지적에 동의한다.

**트레이드오프(반드시 인지할 것)**: 구버전 서버(= `costMasked` 미탑재)에서는
**`PROJECT_COST` 보유자도 포트폴리오 인건비를 못 본다.**
- 완화: 프로젝트 상세 Cost 탭은 **별도 게이트**라 영향받지 않는다. 해소는 서버 배포뿐이다.
- 발현 조건: **프론트만 먼저 배포**했을 때. 코디네이터 지침대로 **같은 배포에 함께 내면 발생하지 않는다.**
- 실패 양상이 **가시적**(안내 문구)이라 원인 추적이 가능하다 — 조용한 "₩0" 과 다르다.

`0`·`''` 같은 falsy 값도 `false` 가 아니면 가린다(테스트로 고정).

### 변경 파일 (7)

| 파일 | 변경 |
|---|---|
| `pages/portfolio/utils/costGating.js` | **신규** — 게이팅 단일 출처 8함수 + `pickCells` |
| `pages/portfolio/widgets/PortfolioTsrSignalTable.jsx` | 인라인 삼항 → `signalTableColumnKeys` + `pickCells`(head/rows 동일 키), 정렬은 `signalLevelsForSort` |
| `pages/portfolio/widgets/PortfolioProjectTable.jsx` | 〃 `projectTableColumnKeys` |
| `pages/portfolio/PortfolioFilterBar.jsx` | `showSalaryChip` |
| `pages/portfolio/sections/ComparisonTabs.jsx` | `showCostTab` |
| `pages/portfolio/PortfolioDashboardPage.jsx` | `isCostMasked`(**fail-close**) · `gateSalaryBuckets` |
| `pages/portfolio/utils/__test__/costGate.test.js` | 소스 스캔 폐기 → **동작 단언 11건** + fail-close 9건 |

i18n 변경 없음. **`portfolioAggregate.js` 여전히 무변경**(`git diff` 무출력).

### 검증 (종료코드 `cmd` 재측정)

```
> cmd /c "npm test > %TEMP%\f3t.txt 2>&1 & echo FRONTEND_TEST_EXIT=%errorlevel%"
FRONTEND_TEST_EXIT=0
Test Suites: 31 passed, 31 total
Tests:       530 passed, 530 total      ← 525 → 530 (+5). 실패 0 · 회귀 0

> cmd /c "npm run build > %TEMP%\f3b.txt 2>&1 & echo FRONTEND_BUILD_EXIT=%errorlevel%"
FRONTEND_BUILD_EXIT=0
Compiled with warnings.                 ← node_modules 소스맵 3건(기존)
```
빌드를 테스트와 **별도로** 돌렸다.

### 무회귀 (grep 실측)

| 항목 | 결과 |
|---|---|
| `portfolioAggregate.js` | **git diff 무변경** |
| 컴포넌트 인라인 게이팅 삼항 | **0건**(단일 출처 우회 없음) |
| 7지점 실동작 | 위 7/7 자기검증 |
| `NON_ADDITIVE_FIELDS` · `?? null` 4필드 | 유지 |
| **DnD** | 금지 주석 1건 외 **0건** |
| 기존 525건 | 전부 통과 |

### 남은 한계

| # | 내용 |
|---|---|
| 1 | **fail-close 전환으로 프론트-선행 배포가 불가능해졌다.** 프론트만 먼저 나가면 인건비가 전원에게 가려진다. 함께 배포하면 무해하지만 **배포 순서 제약이 생긴 것은 사실**이다 — 배포 노트에 추가 필요 |
| 2 | 게이팅은 `costGating.js` 가 단일 출처지만, **누가 그 함수를 안 쓰고 새 급여 컬럼을 직접 추가하면** 감시 밖이다. 현재 컬럼 구조에서는 `pickCells` 가 키를 강제하지만 새 위젯은 스스로 규칙을 따라야 한다 — `?? 0` 폴백 8곳(FE-P2c-4)이 남아 있는 한 이 위험은 유지된다 |
| 3 | 실기동 미검증은 그대로(FE-P2c-2·3). `costMasked` 실응답을 본 적이 없다 |
