# 02 Frontend Report — `/resource` 프로젝트 배정 탭 개선 (관계도 이관 · 3레이어 · 팀 필터 · 팀 전체 배정)

작업일: 2026-08-03 · 범위: 프론트 전용 (**백엔드 무변경**)

---

## 0. 테스트 기준선 (직접 실측)

작업 착수 직후 `cd static/ui && npm test`(= `jest`) 를 **직접 실행**해 실측했다.

| 시점 | Suites | Tests | 결과 |
|---|---|---|---|
| **기준선 (작업 전)** | 56 (1 failed) | 970 (20 failed / 950 passed) | ❌ `src/pages/resource/teamAnalytics/__test__/teamAnalyticsI18n.test.js` 1개 suite 실패 |
| 기준선 — teamAnalytics 제외 | 53 | 828 (all passed) | ✅ |
| **작업 후 (최종)** | **60** | **1026** | ✅ **all passed** |

- 기준선의 20건 실패는 전부 `teamAnalyticsI18n.test.js`(다른 에이전트가 동시 작업 중인 `teamAnalytics` 네임스페이스의 kr/en 키 불일치)였다. 내 영역이 아니어서 손대지 않았고, 최종 실행 시점에는 해당 에이전트가 키를 맞춰 자연 해소됐다.
- 내 순증분: **suite +4 / test +42** (나머지 +14 test 는 teamAnalytics 에이전트 몫).
- **회귀 0** — 기존 통과 suite 중 실패로 바뀐 것 없음.

> `npm run merge` **미실행**, `npm run build` **미실행**(prebuild 가 merge 를 부른다). 지시대로 `locales/kr|en/*.json` 소스만 수정했다. 배포 전 누군가 반드시 merge 를 돌려야 `ko-KR.json`/`en-US.json` 에 반영된다.

---

## 1. 요구 1 — 관계도 이관 (인력 현황 → 프로젝트 배정)

### 인력 현황(`pages/resource/overview/ResourceOverviewTab.jsx`)에서 **제거**한 것
| 대상 | 비고 |
|---|---|
| `import AllocationGraphSection` | 유일 참조였음 (`AllocationGraphSection` 은 이제 배정 탭에서만 import) |
| `graphOpen` state + 접이식 토글 버튼 블록 | 하단 `borderTop` 구분선 포함 |
| `openMemberDrawer(accountId)` | 관계도 노드 클릭 전용이었음 → 배정 탭으로 **이동** |
| `ChevronRightIcon` / `ChevronDownIcon` import | 토글 전용 |
| `token` (`@atlaskit/tokens`) import | 이 파일에서 토글 블록에서만 쓰였음(2곳) — 전량 제거 후 잔존 참조 0 확인 |
| `normalizeTeamMeta` import | 팀 옵션 도출이 `deriveTeamOptions` 로 이동해 직접 참조 불필요 |

### **남긴** 것 (다른 용도로도 쓰임)
- `drawerTarget` state + `ResourceProfileDrawer` — 테이블 행 클릭(`ResourceOverviewTable.onRowSelect`)의 진입점이라 그대로 유지.
- `useTeamOptions`(팀 계층) / `resolveTeamFilter` / `matchesTeamFilter` — 인력 현황 자체의 팀 필터용.
- `useResourceOverview`, `useResourceLoadSummary`, `ResourceFilters`, 요약 카드, 집계 시각/stale 표기 — 전부 무관.

### 배치처
`pages/resource/assignment/ProjectAssignmentBoard.jsx` **최상단**, 좌우 2분할 패널 **위**. 기존과 같은 **접이식(기본 접힘)** 이며 `graphOpen === true` 일 때만 `AllocationGraphSection` 을 **마운트**한다 → `useResourceAllocation`(전사 배치) 은 열 때만 호출된다(온디맨드 비용 모델 유지).

컴포넌트는 **재사용**했다. `AllocationGraphSection` / `AllocationGraph` / `AllocationFilters` / `useResourceAllocation` 은 복제 없이 같은 파일을 쓴다(3레이어 대응으로 내부는 수정, 파일은 1벌).

---

## 2. 요구 2 — 3레이어 관계도 (프로젝트 → 팀 → 담당자)

수정: `pages/resource/allocation/allocationGraphOption.js` (전면 재작성) · `AllocationGraph.jsx`(props 추가) · `AllocationGraphSection.jsx`
신규: `pages/resource/allocation/allocationScale.js`

### 좌표 설계 (`layout:'none'` 유지)
| 레이어 | x | y |
|---|---|---|
| 프로젝트 (category 0) | 60 | 컬럼 전체 높이 `H` 에 균등 분포 |
| 팀 (category 1) | 430 | **자기 팀원 y 의 평균(centroid)**, 겹치면 순서 유지한 채 `MIN_TEAM_GAP=42` 만큼 아래로 밀기 |
| 담당자 (category 2) | 800 | **팀 순서로 그룹핑**해 flatten 후 균등 분포 |

`H = max(프로젝트수, 담당자수, 팀수) × 46`. 담당자를 팀 단위로 묶어 쌓고 팀 노드를 그 중심에 두므로 **team→member 엣지가 교차하지 않는다**. 팀 정렬은 이름 오름차순, **"팀 미지정"은 항상 마지막**.

### 링크
- `프로젝트 → 팀` : distinct `(projectId, teamKey)` 쌍. **프로젝트 결정적 색상 유지**(`projectColor` = 해시 기반), 굵기 = 그 팀에서 해당 프로젝트에 배정된 인원 수(`1.4 + (n-1)*0.6`, 최대 5).
- `팀 → 담당자` : 담당자당 1개(사용자는 한 팀에만 속함). 팀 결정적 색상(`teamColor`, 해시 기반 / 미지정은 중립 회색 `#8993A4`).
- 프로젝트 → 담당자 **직결 엣지는 없다**(테스트로 고정).

### 팀 미소속 담당자 — 버리지 않는다
`memberTeamMap` 에 없거나 값이 `null`/빈 문자열이면 `TEAM_NONE_KEY = '__NONE__'` 그룹으로 떨어진다. `"팀 미지정 (n)"` 노드 1개를 두고 연결한다. `memberTeamMap` 이 통째로 없어도(팀 데이터 미로딩 등) **전원이 팀 미지정 노드에 붙어 살아남는다** — 테스트로 고정.

### 유지한 기존 자산
프로젝트 결정적 팔레트 · 담당자 아바타 `image://` symbol(프로브 성공분만 승격, CSP 폴백은 circle) · 중복배정(`assignedCount>=2`) 크기 확대 + 빨간 테두리 + 라벨 `(n)` · `emphasis.focus:'adjacency'` · tooltip formatter 분기 · 노드 클릭 → 인력 상세 드로어(`m:` prefix 판정 그대로).
추가: 팀 노드 라벨에 **인원 수** `개발팀 (12)`, 팀 노드 tooltip(인원 수 + 연결 프로젝트 수), 담당자 tooltip 에 소속 팀 1줄.

### 🔴 규모 대응 — 상한 + 절단 표기 (조용한 절단 금지)
**택한 방식: 접이식(온디맨드) + 상위 N개 프로젝트 상한 + 명시적 절단 배너 + 해제 토글.** 근거:

1. **접이식**을 유지한 이유 — 배정 탭은 이미 좌우(최대 3단) 분할로 밀도가 높다. 관계도를 항상 펼치면 본 작업(카드 선택 → 인력 배정)이 스크롤 아래로 밀린다. 접혀 있으면 `useResourceAllocation` 전사 조회도 발생하지 않는다.
2. **상위 N=15 프로젝트 상한**(`MAX_GRAPH_PROJECTS`) — 3레이어는 노드가 급증한다(프로젝트 20 + 팀 10 + 담당자 100 = 130+). 기존 2열 구현엔 상한이 **아예 없었다**. 자르는 기준은 `memberCount` 내림차순(= 관계도에서 볼 게 많은 프로젝트), 동률은 `projectName` 오름차순으로 **안정 선별**.
3. **원래 배열 순서는 보존** — 정렬은 "무엇을 남길지" 고르는 데만 쓴다. 순서를 바꾸면 y 좌표가 통째로 흔들려 필터를 만질 때마다 그래프가 튄다.
4. **절단은 반드시 표기** — `capAllocationScale` 이 `hiddenCount`/`totalProjects` 를 돌려주고, 화면은 warning `SectionMessage` 로
   *"배정 인원이 많은 상위 15개 프로젝트만 표시 중입니다. 전체 32개 중 17개가 빠졌습니다."* + **[전체 표시]** 버튼을 낸다. 펼친 뒤엔 **[상위 15개만 표시]** 로 되돌릴 수 있다.
5. 잘린 프로젝트에만 연결된 **담당자·링크도 함께 제거**된다(고아 노드 방지).

`allocationScale.js` 는 순수 함수로 분리해 6개 케이스를 테스트로 고정했다.

### ⚠ 링크 기준 — **배정(assignment)** 이다. 투입이 아니다
- 원천 확인: `getResourceAllocationGraph` → `ResourceManagementService.getResourceAllocationGraphService` → `ProjectUsersQuery.FIND_ALL_ALLOCATIONS` = **`projectusers ⋈ project`**. 워크로그가 아니다.
- **기존 원천을 그대로 유지**했다(전사 배정을 한 번에 읽는 resolver 는 이것뿐이고, 투입 기준으로 바꾸면 미착수 인원이 통째로 사라진다).
- **화면 표기**: 필터 바로 아래에 상시 캡션을 둔다 —
  `resource.allocation.basis` = *"링크 기준: 프로젝트 인력 배정(등록된 배정 명단) — 워크로그 투입 공수가 아닙니다. 배정만 되고 아직 착수하지 않은 인원도 표시됩니다."*

### 팀 축의 출처 (백엔드 무변경으로 해결)
`getResourceAllocationGraph.members[]` 에는 팀이 없다. 팀은 **`getResourceOverview.content.people[].teamKey/teamName`** 에서 `accountId` 로 잇는다.
- 두 훅 모두 `resourceKeys` 캐시이고, **배정 탭은 이미 `useResourceOverview` 를 쓰고 있어** 추가 네트워크 호출이 사실상 0이다(같은 queryKey 캐시 히트).
- 팀 이름은 `people[].teamName` 우선, 없으면 `normalizeTeamMeta(teamMeta)` 폴백(배열/객체 shape 3종 흡수 — P2a-F1 계열 함정 회피).
- `users` 테이블에 없는 `accountId`(백오피스 미등록자)는 **팀 미지정으로 표시**된다. 숨기지 않는다.

---

## 3. 요구 3 — 전사 인력 카드 팀 필터

신규 `pages/resource/assignment/people/PeopleTeamFilter.jsx` (전사 인력 Card 의 `headerRight`).

### 재사용한 유틸 (새로 짜지 않았다)
| 용도 | 재사용 대상 |
|---|---|
| 팀 목록 | **`useTeamOptions`** (= `getTeamOptions`). 🔴 `getTeamList` 는 grant 가 `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` 라 `RESOURCE_MANAGEMENT` 만 가진 사용자에게 **항상 거부** → 쓰지 않았다(함정 T2). 실패해도 fail-soft(하위 팀 포함이 자기 팀만 걸리는 정도로 degrade) |
| 하위 팀 포함 판정 | **`utils/team/teamFilter.js` 의 `resolveTeamFilter` + `matchesTeamFilter`** 무수정 재사용 — 인력 현황 탭과 **같은 판정**. 키 집합은 행마다가 아니라 `useMemo` 로 **1회** 계산(O(n) 유지) |
| "팀 미지정" | **`constants/team.js` 의 `TEAM_FILTER_NONE = '__NONE__'`** 센티넬. 🔴 `null` 을 값으로 보내지 않는다(필터가 통째로 사라짐) |
| 팀 Select 옵션 집합 | **신규 공용 순수 함수 `utils/team/deriveTeamOptions.js`** — 인력 현황 탭이 인라인으로 갖고 있던 distinct 로직을 추출해 **두 화면이 같은 함수를 쓰도록** 통일. 이름을 못 구한 팀은 옵션을 만들지 않는다(UUID 라벨 금지 규칙 유지) |

- "하위 팀 포함" 체크박스는 **특정 팀을 골랐을 때만** 노출(전체·미지정에는 적용 대상이 없다) — 인력 현황 탭 `ResourceFilters` 와 동일 규칙.
- 필터는 `hydratePeople` **이전**에 적용해 적합도 계산 대상 자체를 줄인다.
- 카드 헤더 카운트를 `필터수 / 전체수 · 팀명` 으로 바꿔 몇 명이 걸러졌는지 감춰지지 않게 했다.

---

## 4. 요구 4 — 팀 전체 할당

**백엔드 변경 없음.** `insertProjectusers` 의 `jiraUser` 가 원래 배열이라 그대로 다건을 넘긴다.

### 권한 게이트
- `canAssign = canWrite('PROJECT') || canWrite('RESOURCE_MANAGEMENT')` (resolver grant `OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']], 'inherited')` 와 일치).
- **읽기 전용 사용자에게는 버튼을 렌더하지 않는다**(`bulk.visible = canAssign` → 미노출, disabled 도 아님).

### 실행 전 확인 절차
`ConfirmModal`(warning) 로 **대상 인원 수를 반드시 확인**시킨다:
> "개발팀 12명을 [Web App] 프로젝트에 배정합니다. 진행할까요?"
> (부가) "이미 배정된 인원은 대상에서 제외됩니다. 되돌리려면 배정 명단에서 한 명씩 취소해야 합니다."

버튼 라벨에도 대상 수를 표기(`팀 전체 배정 (12)`). 비활성 시 Tooltip 으로 사유 제시:
| 조건 | 사유 문구 |
|---|---|
| write 없음 | 버튼 자체 미노출 |
| 프로젝트 미선택 | `resource.assignment.people.selectPrompt` |
| 팀 미선택 | `resource.assignment.bulk.selectTeam` |
| `board.isLoading` | `resource.assignment.bulk.loading` (적합도 로딩 중엔 잠금 — 아래 참조) |
| 대상 0명 | `resource.assignment.bulk.noTarget` |

### 미등록자 처리
- 대상은 `useResourceOverview().people` 파생이고, 그 원천은 `buildPeopleContext` → **`findUsersRepository({})`** = 백오피스 `users` 테이블 전량이다. 즉 **구조적으로 미등록 accountId 가 섞일 수 없다** — 사전 필터가 필요 없는 게 아니라 이미 걸러진 집합이다.
- 그래도 삭제 레이스 등으로 서버가 `UNREGISTERED_USER`(전체 거부)를 낼 수 있으므로 **그 코드만 별도 문구**(`resource.assignment.member.unregistered` = "백오피스에 등록되지 않은 사용자입니다")로 정확히 전달한다. 조용히 실패하지 않는다.

### 중복 배정 동작 — **확인 결과: 서버가 멱등 스킵**
`ProjectUsersQuery.INSERT` 는 `INSERT ... SELECT ... FROM users WHERE NOT EXISTS(SELECT 1 FROM projectusers WHERE project_id=? AND account_id=users.account_id)` 구조다.
→ **이미 배정된 인원이 섞여도 그 행만 조용히 스킵되고, 전체가 거부되지 않으며, 중복 행도 생기지 않는다.**

프론트에서도 이중으로 막았다:
- 프로젝트 선택 시 우측 목록은 이미 `match.isMember === true` 인원을 제외한다 → 기본적으로 미배정자만 대상.
- 다만 `board` 로딩 중엔 `match` 가 `null` 이라 제외 판정이 안 된다 → **`board.isLoading` 동안 버튼을 잠가** 확인 모달의 인원 수와 실제 삽입 수가 어긋나지 않게 했다.
- ⚠ 알려진 잔여 오차: 서버가 스킵한 건수를 응답으로 알려주지 않으므로 성공 토스트의 `{count}` 는 **요청 인원 수**다(스킵이 있으면 실제 신규 배정 수보다 클 수 있다). 위 게이트로 실질 발생 가능성은 낮지만, 정확히 하려면 백엔드가 `insertedCount` 를 반환해야 한다 — 이번 회차 백엔드 무변경 원칙에 따라 보류.

### 실패 처리
`invoke()` 는 `{success:false}` 로도 **정상 resolve** 하므로 `res?.success === false` 를 먼저 본다(throw 에만 의존하지 않는다). 실패 시 토스트로 사유 노출, 성공 시 `assignmentKeys.board/pool` invalidate → 배정 인원이 좌측 상세에 나타나고 우측 전사 인력에서 사라진다.

---

## 5. 변경 파일

### 신규
| 경로 | 내용 |
|---|---|
| `static/ui/src/pages/resource/allocation/allocationScale.js` | 규모 상한 순수 함수(`capAllocationScale`) |
| `static/ui/src/pages/resource/assignment/people/PeopleTeamFilter.jsx` | 팀 Select + 하위 팀 포함 + [팀 전체 배정] |
| `static/ui/src/utils/team/deriveTeamOptions.js` | 팀 Select 옵션 공용 도출(두 화면 단일 원천) |
| `static/ui/src/pages/resource/allocation/__test__/allocationGraphOption.test.js` | 3레이어 구조 10건 |
| `static/ui/src/pages/resource/allocation/__test__/allocationScale.test.js` | 상한/절단 6건 |
| `static/ui/src/pages/resource/allocation/__test__/allocationI18n.test.js` | 신규/재사용 i18n 키 kr·en 파리티 21건 |
| `static/ui/src/utils/team/__test__/deriveTeamOptions.test.js` | 옵션 도출 5건 |

### 수정
| 경로 | 내용 |
|---|---|
| `static/ui/src/pages/resource/allocation/allocationGraphOption.js` | 2열 → **3레이어** 전면 재작성, `teamColor`/`TEAM_NONE_KEY` export |
| `static/ui/src/pages/resource/allocation/AllocationGraph.jsx` | `memberTeamMap`/`teamNameMap` props 추가 |
| `static/ui/src/pages/resource/allocation/AllocationGraphSection.jsx` | 팀 축 결합 + 상한/절단 배너 + 기준 캡션 |
| `static/ui/src/pages/resource/overview/ResourceOverviewTab.jsx` | 관계도 섹션 제거, 팀 옵션을 `deriveTeamOptions` 로 통일 |
| `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx` | 관계도 상단 배치 + 팀 필터 + 팀 전체 배정 |
| `locales/kr/resource.json`, `locales/en/resource.json` | 신규 키 15개 (아래) |

### i18n 신규 키 (kr·en 동시 추가, **merge 미실행**)
`resource.allocation.basis` / `.truncated` / `.showAll` / `.showTop` / `.legend.team` / `.tooltip.teamProjects`
`resource.assignment.bulk.button` / `.title` / `.body` / `.note` / `.success` / `.error` / `.noTarget` / `.selectTeam` / `.loading`

재사용(신규 아님): `team.unassigned.label`, `team.filter.label`, `team.filter.all`, `team.filter.includeDescendants`, `resource.assignment.member.unregistered`, `assignment.action.noWritePermission`, `assignment.confirm.yes/no`.

---

## 6. 경계면 계약 — 소비하는 응답 shape (백엔드 무변경, 기존 계약 그대로)

| resolver | 접근 경로 | 비고 |
|---|---|---|
| `getResourceAllocationGraph` | `res.content.{projects,members,links,generatedAt}` | 기존 훅 무수정 |
| `getResourceOverview` | `res.content.{people[].teamKey/teamName, teamMeta}` | 팀 축 결합에만 추가 소비, 훅 무수정 |
| `getTeamOptions` | `res.content.options[].{value,label,depth,parentTeamKey}` | `useTeamOptions` 무수정 |
| `insertProjectusers` | 요청 `{ project_id, jiraUser: [{value: accountId}, ...] }` / 응답 `res.success` | **배열 다건** — 서버 시그니처 그대로 |

**신규 쿼리키 없음** — 기존 `resourceKeys.allocation/overview`, `backofficeKeys.teamOptions`, `assignmentKeys.board/pool` 재사용. 인라인 키 배열 사용 없음.

---

## 7. 다른 에이전트 영역 침범 없음

읽기만 하고 **수정하지 않았다**: `pages/resource/teamAnalytics/**` · `utils/team/teamMetrics.js` · `utils/team/teamAnalyticsFields.js` · `components/chart/echart/options/**` · `locales/*/teamAnalytics.json`.
(`utils/team/aggregateByTeam.js` 의 `normalizeTeamMeta` 는 **import 만** 했다.)

---

## 8. 배포 전 필요 조치 / 잔여 리스크

1. 🔴 **`cd static/ui && npm run merge` 실행 필요** — 이번 회차에서 의도적으로 돌리지 않았다. 안 돌리면 새 15개 키가 화면에 원문 키로 찍힌다.
2. **E2E 미수행**(로컬 테스트만). 특히 확인 필요:
   - Forge iframe CSP 에서 아바타 `image://` 로드 여부(기존과 동일한 미확인 항목, circle 폴백은 동작).
   - 3레이어 `layout:'none'` 좌표(x 60/430/800)가 좁은 화면에서 잘리는지 — `roam:true` 로 팬/줌은 가능.
   - 팀 전체 배정 실제 SQL 멱등 스킵 동작(코드상 `NOT EXISTS` 확인, 런타임 미확인).
3. 성공 토스트 `{count}` 는 요청 수 기준(§4 잔여 오차). 정확한 신규 배정 수가 필요하면 백엔드가 `insertedCount` 를 반환해야 한다.
