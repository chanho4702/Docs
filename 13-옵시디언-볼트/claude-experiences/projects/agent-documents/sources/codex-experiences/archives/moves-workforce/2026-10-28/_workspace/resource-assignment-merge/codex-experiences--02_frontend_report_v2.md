# 자원관리 재편 v2 — 프론트엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **입력**: `requirement_v2.md`(사용자 확정) / `01_architect_design_v2.md` §4~§8 / `02_backend_report_v2.md` N1·N2 shape
- **검증**: `npm test` → **19 suites / 234 tests 통과** · `npm run build` → 신규 경고 0(기존 node_modules 소스맵만)

> **v1(셀렉터형 ProjectAssignmentTab) 폐기.** v2 = 좌우 2분할, 진입 즉시 양쪽 표시(드롭다운 셀렉터 없음). 좌 = 프로젝트 카드 목록(N1 즉시 + N2 지표 hydrate), 우 = 전사 인원 테이블(overview 재사용, 선택 시 적합도·신호 hydrate), 배정 = 인원 행 [배정] → 작업 선택 모달.

---

## 1. 신규 / 수정 / 제거 파일

### 신규
| 파일 | 역할 |
|---|---|
| `pages/resource/assignment/ProjectAssignmentBoard.jsx` | 좌우 2분할 셸 — 선택 상태 소유, board/pool 로드(선택 시), 드로어, 작업 모달 |
| `pages/resource/assignment/useAssignmentProjectCards.js` | N1 카드 훅 |
| `pages/resource/assignment/useAssignmentProjectMetrics.js` | N2 지표 훅(비차단 hydrate, `refetchOnWindowFocus:false`) |
| `pages/resource/assignment/mergeMatch.js` | **순수함수** people ⋈ board+pool candidates (필드 집합 표 명시) |
| `pages/resource/assignment/patchProjectMetric.js` | **순수함수** 배정 후 unassignedCount 낙관 패치 |
| `pages/resource/assignment/projects/ProjectCard.jsx` · `ProjectCardList.jsx` | 좌측 카드(이름·상태·기간·지표·요구스킬 칩 읽기전용) + 세로 목록 |
| `pages/resource/assignment/people/CompanyResourceTable.jsx` | 우측 전사 인원(선택 시 적합도·신호 컬럼 활성 + [배정] 버튼) |
| `pages/resource/assignment/modal/WorkPickerModal.jsx` | 작업 선택 모달(board.queue, 미배정 우선, 담당/협업) |
| `pages/resource/allocation/AllocationGraphSection.jsx` | 관계도 섹션(인력 현황 하단 접이식·온디맨드, AllocationFilters+Graph) |
| `__test__/mergeMatch.test.js` · `__test__/patchProjectMetric.test.js` | 순수함수 jest 21건 |

### 수정 (추가/최소 변경)
| 파일 | 변경 |
|---|---|
| `utils/queryKey/assignmentKeys.js` | `cards()` / `projectMetrics()` 팩토리 추가 |
| `pages/resource/ResourcePage.jsx` | 프로젝트 배정 탭 → `ProjectAssignmentBoard`(v1 Tab 대체) |
| `pages/resource/overview/ResourceOverviewTab.jsx` | 하단 접이식 관계도 섹션(`AllocationGraphSection`, graphOpen 시 마운트) |
| `pages/project/modal/ProjectModal.jsx` | **editId 시** budget 아래 `<RequiredSkillEditor projectId={editId} />` 섹션 |
| `pages/resource/match/RequiredSkillEditor.jsx` | onSaved docblock 정정(ProjectAssignmentTab 참조 제거) |
| `locales/kr\|en/resource.json` | 탭 라벨 + `resource.assignment.*`(v2) + `allocation.section`/`allocation.filter`/`allocation.empty` 복구 |
| `locales/kr\|en/project.json` | `modal.requiredSkills` 추가 |

### 제거 (v1 잔재)
- `pages/resource/assignment/ProjectAssignmentTab.jsx`(v1 셀렉터형) — 삭제.
- (v1에서 이미 제거된 `match/ProjectMatchTab`·`CandidateRankTable`·`useProjectSkillMatch`·`allocation/AllocationTab`은 그대로 부재.)
- `allocation/AllocationFilters.jsx` — v1에서 삭제했으나 v2 §7 관계도가 재사용하므로 **git 복원**.

### 재사용 (무수정)
`useWorkAssignmentBoard/Pool`, `useAssignWorkItem`, `patchAssignmentCache`, `queue/queueFilter`, `queue/WorkQueueItem`, `queue/WorkQueueFilters`, `candidate/GapSignalBadge`, `useResourceOverview/LoadSummary`, `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation`/`AllocationFilters`, `RequiredSkillEditor`, `ConfirmModal`, `CommonTable`, `UserAvatar`, `UtilBadge`/`AssignedIssueCell`/`WorkloadCell`/`SkillChip`/`StatusBadge`, `ResourceProfileDrawer`.

---

## 2. 소비하는 응답 shape (verifier 교차 비교용)

| resolver | 훅/소비처 | content 경로 |
|---|---|---|
| `getAssignmentProjectCards` (N1) | `useAssignmentProjectCards` | `res.content.cards[]` = `{ projectId(uuid), projectName, statusKey, statusName, statusColor, startDate, endDate, requiredSkills:[{id,name}] }`, `generatedAt` |
| `getAssignmentProjectMetrics` (N2) | `useAssignmentProjectMetrics` → `metricMap:Map(projectId→Metric)` | `res.content.metrics[]` = `{ projectId(uuid), unassignedCount, dueSoonCount, overdueCount, openTotal, truncated }`, `meta.{generatedAt,projectsScanned,projectsTruncated,dueSoonDays}` |
| `getWorkAssignmentBoard` | `useWorkAssignmentBoard`(선택 시) | `content.{candidates[], queue[], projectLoad[], meta.thresholds}` (무변경) |
| `getWorkAssignmentPool` | `useWorkAssignmentPool`(선택 시) | `content.candidates[]` (무변경) |
| `assignWorkItem` | `useAssignWorkItem`(모달) | `content` = AssignResult (무변경) → `patchAssignmentCache`(board) + `patchProjectMetric`(metrics) |
| `getResourceOverview` / `getResourceLoadSummary` | `useResourceOverview` / `useResourceLoadSummary` | `content.people` / `content.load` (무변경, 인력 현황과 캐시 공유) |

- **조인 키 = `projectId`(uuid)**: Card.projectId ↔ Metric.projectId (`metricMap.get(card.projectId)`).
- **N2 비차단**: 카드(N1) 먼저 렌더, 지표 미도착 시 `isMetricsPending` → 카드 지표 자리 `-`. 부분 성공(프로젝트별 Jira 실패)은 0 으로 온다.

---

## 3. 다중 shape 조인 — `mergeMatch.js` 필드 집합 표 (ScopeSplitCell 사건 재발 방지)

우측 테이블 행은 **people(전사) 와 candidate(board/pool) 두 shape 을 조인**한다. 각 필드 유래를 모듈 docblock + 코드에 명시하고 유닛테스트로 고정했다:

| 컬럼/필드 | 유래 shape | 근거 |
|---|---|---|
| accountId·displayName·avatarUrls·roleName·levelName·util·utilBand·skills | **people** (getResourceOverview) | 행 정체성/기본 컬럼 |
| 부하(todo/inProgress/done·spent/remaining·completionRate) | **loadMap** (getResourceLoadSummary, accountId 조인) | 컴포넌트에서 별도 조인 |
| coverage·score·matchedCount·requiredCount·matchedSkills·missingSkills·signals·company·isMember | **candidate** (board/pool) | `MatchInfo` 서브셋만 추출 |

- `hydratePeople`: 행의 이름/가동률/부하는 **people 유래 유지**, `match` 서브객체에만 candidate 유래. 혼동 지점 0(테스트로 고정: "이름/가동률은 people, score/signals는 candidate").
- **신호 재계산 절대 금지**: `signals` 는 서버값 그대로 전달만(`toMatchInfo` 에서 `c.signals` 복사, 재계산 코드 없음). `GapSignalBadge` 는 렌더만.
- 정렬 `sortHydratedRows`(score desc → util asc → 이름)는 **표시 순서일 뿐** — signals/coverage 재계산 아님(테스트로 명시).
- board(멤버) ⋈ pool(비멤버) 겹칠 때 **board 우선**(pool 먼저 넣고 board 로 덮어씀).

---

## 4. 좌측 카드 지표 & 배정 후 낙관 패치

- 카드 지표는 `metricMap.get(projectId)` 조인. 미도착 = `-`(스켈레톤), 도착했는데 없으면 0.
- `Metric.truncated`(프로젝트당 1500 초과) → 카드에 `*` 툴팁, `meta.projectsTruncated`(활성 80 초과) → 목록 상단 안내.
- **배정 후 낙관 패치**: `WorkPickerModal` 이 assign 성공 시 `queryClient.setQueryData(assignmentKeys.projectMetrics(), prev => patchProjectMetric(prev, projectId, result))` 로 해당 projectId 의 `unassignedCount` 를 조정. `patchProjectMetric` 은 `previous`/`item` flags(없으면 assignee/coworker 유무)로 미배정→배정 전이를 감지해 -1/+1/0. **N2 invalidate 하지 않음**(인덱스 지연) — 낙관 패치 + 자연 갱신(staleTime).

---

## 5. 권한 게이트 (백엔드 정합)

| 대상 | 프론트 게이트 | 백엔드 grant |
|---|---|---|
| 탭 진입 | `canRead('RESOURCE_MANAGEMENT')` (ResourcePage) | — |
| 카드/지표 조회 | 서버 grant OR | N1/N2 = OR[PROJECT read, RESOURCE_MANAGEMENT read] |
| **배정 실행** | **`canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')`** | `assignWorkItem` = OR[PROJECT write, RESOURCE_MANAGEMENT write] |
| 요구 스킬 편집(ProjectModal) | `canWrite('PROJECT')` (RequiredSkillEditor 내부) | `setProjectSkills` = PROJECT write |
| 드로어 | `canRead('RESOURCE_MANAGEMENT')` (진입 전제) | `getResourceProfile` = RESOURCE_MANAGEMENT read |

- 배정 게이트는 write 로 미러링(read 아님) — `ProjectAssignmentBoard.canAssign = canWriteProject || canWriteResource`, `CompanyResourceTable` [배정] 버튼에 전달.
- **AssignmentPage(프로젝트 상세) 무영향**: v2 는 AssignmentPage 를 렌더하지 않는다(자체 좌우 구조). board/pool/assign 훅·순수함수만 import 재사용. AssignmentPage 게이트 OR 1줄(기적용)은 유지 — 회귀 없음.

---

## 6. invalidate 경계 (핵심 규약)

- **assign 경로 invalidate 0건** — `useAssignWorkItem`(patchAssignmentCache) + `patchProjectMetric`(setQueryData) 패치만. `assignment/` 신규 코드에 `invalidateQueries` 0건(grep 확인).
- N2(`projectMetrics`)는 `refetchOnWindowFocus:false` — 낙관 패치를 옛 값으로 덮지 않음.
- 요구 스킬 저장(RequiredSkillEditor)은 `resourceKeys.projectSkills` invalidate(SQL write, 인덱스 지연 없음 — 안전). ProjectModal 문맥에선 board invalidate 불필요(v2 배정 카드는 N1 자연 반영).

---

## 7. 관계도 이동 (인력 현황 탭)

- `ResourceOverviewTab` 하단에 `▸ 배정 관계도`(`resource.allocation.section`) 접이식 토글(기본 접힘). `graphOpen` 시에만 `AllocationGraphSection` **마운트** → `useResourceAllocation` 온디맨드(전사 배치 비용을 열 때만).
- `AllocationGraphSection` = 삭제된 AllocationTab 의 필터+그래프 로직을 인력 현황용으로 이관(`AllocationFilters` 재사용, 전사 문맥). 노드 클릭 → overview 의 `ResourceProfileDrawer`(people 에서 fallbackPerson 조회).
- **배정 탭에서는 관계도 완전 제거**(요구 §부가).

---

## 8. i18n

- **탭 라벨**: `resource.tab.assignment`(프로젝트 배정 / Project Assignment). `tab.match`/`tab.allocation` 는 v1에서 이미 제거됨.
- **v1 `resource.assignment.*` 키 폐기 → v2 키로 교체**: `projects.{title,empty,truncated}`, `card.{unassigned,dueSoon,overdue,truncated}`, `people.{title,selectPrompt}`, `col.{roleLevel,skills,fit,signal,assign}`, `picker.forMember`, `external`. + `allocation.section`.
- **복구**: `allocation.filter.*`·`allocation.empty`(v1에서 관계도 이관 전 삭제했으나 AllocationFilters/Section 재사용에 필요).
- **신규** `project.modal.requiredSkills`.
- **재사용**: 배정 모달의 확인/액션/큐/경고 문구는 work-assignment `assignment.json`(`assignment.confirm.*`·`action.*`·`queue.empty`·`warn.notMember`) 그대로. 신호 배지 `GapSignalBadge` 도 `assignment.signal.*` 재사용(중복 키 없음).
- **merge 실행 완료** → resource 네임스페이스 kr/en 각 대칭. 코드 사용 키 74개 전수 존재(누락 0).

---

## 9. 검증 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **19 suites / 234 tests 통과** (신규 mergeMatch 15 + patchProjectMetric 6 = 21건, 회귀 0) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, **신규 코드 유래 경고 0**, dangling import 0 |
| invalidate 경계 | assign 경로 `invalidateQueries` 0건(grep) |
| 공용 컴포넌트 | AllocationGraph/option/useResourceAllocation/AllocationFilters/RequiredSkillEditor/board·pool·assign 훅 무수정 |

---

## 10. 설계서와 달라진 점

| 설계 | 실제 | 이유 |
|---|---|---|
| `match/RequiredSkillEditor` → project/modal 로 **이동** | match/ 에 **존치**하고 ProjectModal 에서 import | 파일 이동은 상대 import 경로 4곳 변경 리스크. 기능(ProjectModal 통합)은 import 로 충족. match/ 는 RequiredSkillEditor 1파일만 남음 |
| `AllocationGraphSection` 위치 미규정 | `allocation/` 에 신규 배치(삭제된 AllocationTab 로직 이관) | 관계도 자산과 동일 디렉토리 응집 |
| RequiredSkillEditor `onSaved` | v1에서 추가한 prop 유지(v2 ProjectModal 은 미전달) | 하위호환 옵셔널 — 제거하면 diff 확대. docblock만 정정 |

**계약 위반 없음.** N1/N2 조인 키·board/pool/assign 무변경 계약·invalidate 경계·신호 재계산 금지 전부 준수. 배정 게이트는 백엔드 OR 와 write 대칭.

---

## §추가 (2026-07-23) — 프로젝트 배정 탭 디자인/기능 개편 (사용자 "이쁘게" 요구)

기능 5건 + 전체 디자인 폴리시. **board/pool/assign 훅·캐시 패치 무변경, 신호 재계산 금지, invalidate 경계 유지, 공용 컴포넌트 수정 0.**

### 레이아웃 결정
- 좌우 2분할 78vh 유지(작업 배정 탭 관례). **좌측 = 카드 목록(sticky 헤더+필터) 위 / 선택 프로젝트 상세 패널 아래**로 상하 분할(카드 55% · 상세 최대 45%, 각자 스크롤). 우측 = 전사 인원 테이블(sticky 헤더).
- 상세 패널을 좌측 하단에 둔 이유: 카드를 고른 맥락 바로 아래에서 "이 프로젝트에 누가/얼마나"를 보고, 우측(전사 인원)에서 배정 액션으로 시선이 흐르는 좌→우 결정 동선. 별도 모달/탭 전환은 컨텍스트를 잃음.

### 작업 1 — 좌측 필터 + 디폴트 (순수 로직 분리)
- 신규 `projects/projectCardFilter.js`(순수) + `projects/ProjectFilterBar.jsx`(검색 + 상태 멀티 + "종료·일정오버 포함" 토글).
- **디폴트 필터식**: `!card.isClosed && !(card.endDate && card.endDate < today)` = `isLiveCard`. 토글 시 전량.
- `isClosed`(status-only)와 일정오버(endDate<today)는 **독립 판정**(백엔드 §9 준수). 유닛테스트로 경계 고정(당일 endDate=오버 아님, 종료지만 오버 아님 등).

### 작업 2 — 카드 상태 가시성
- StatusBadge를 statusColor 배경 pill로 크게. 기간 + D-day(`~2026-12-17 · D-45` / 지연 시 red `D+12 지연`). 지표를 **컬러 카운트 칩**(미배정=info·임박=warning·지연=danger, 0이면 회색). 닫힌 카드 dimmed(opacity .6)+종료 배지, 일정오버 red 기간+오버 배지.

### 작업 3 — 선택 프로젝트 상세 패널 (추가 조회 0)
- 신규 `detail/ProjectDetailPanel.jsx` + 순수 `buildAssignedRoster.js`(`buildAssignedRoster`/`buildTaskSummary`).
- **작업 요약**: 열린 작업/미배정/임박/지연 타일(metric 우선, 없으면 queue.flags 폴백).
- **배정 인원 명단**: `board.projectLoad` ⋈ `people`(accountId 조인) → 아바타+이름+직무/등급 · 건수(`AssignedIssueCell`) · 남은작업량(`WorkloadCell`) · 완수율 미니 진행바(틸). **board 훅 데이터로만**, 추가 invoke 없음.
- **다중 shape 출처 표**(ScopeSplitCell 재발 방지) `buildAssignedRoster.js` docblock에 명시: 이름/아바타/직무 = **people**, 건수/작업량/완수율 = **projectLoad**. 유닛테스트로 "이름은 people, 수치는 projectLoad, 미존재 계정 accountId 폴백" 고정.

### 작업 4 — 스킬 직군별 그룹핑
- 신규 순수 `skillGroups.js`(`groupSkillsByCategory`, category '' → "기타" 마지막) + `SkillGroupChips.jsx`(공용 `SkillChip` 재사용, 직군 라벨 + 칩). 마이페이지 스킬 그룹 패턴.
- 카드 요구스킬(N1 `requiredSkills[].category`) · 우측 테이블 스킬을 동일 패턴으로 통일. board의 matched/missing은 category가 없어 **본인 보유 스킬(p.skills)에서 category 보강**(매칭 스킬은 보유분이라 매칭됨), 미보유는 "기타".

### 작업 5 — 인원 보강 + 디자인 폴리시
- 우측 테이블: 직무/등급 컬럼 유지, 적합도 활성 시 매칭(초록)/미보유(빨강) 스킬을 직군 그룹으로.
- **디무브 틸(#21ADAD)**: 카드 선택 보더/배경 틴트, 완수율 진행바 채움 = 틸(`theme.js`). semantic(warning/danger)은 Atlaskit 토큰 유지(브랜드색으로 안 덮음).
- 전 색상 `token()` 기반 다크모드 대응(하드코딩 hex는 폴백 인자만). 카드 hover 리프트(box-shadow+translateY, 160ms), 선택 시 틸 보더+틴트. 좌우 sticky 헤더/필터, 각자 스크롤.

### 소비 shape 변경분 (§9)
- `Card.isClosed`(status-only) → `isLiveCard`/필터. `requiredSkills[].category` → 직군 그룹.
- 닫힌 카드는 N2 지표 미도착 → 카드 지표 칩 '-'(정상, `isPending`으로 처리).

### 신규/수정 파일
**신규**: `projects/projectCardFilter.js`, `projects/ProjectFilterBar.jsx`, `detail/ProjectDetailPanel.jsx`, `buildAssignedRoster.js`, `skillGroups.js`, `SkillGroupChips.jsx`, `theme.js`, `__test__/projectDesign.test.js`(14건).
**수정(재작성)**: `projects/ProjectCard.jsx`, `projects/ProjectCardList.jsx`, `people/CompanyResourceTable.jsx`(스킬 그룹), `ProjectAssignmentBoard.jsx`(필터·상세패널 배선), `locales/kr|en/resource.json`(assignment 섹션 v2 키).

### 검증
- `npm test` → **20 suites / 248 tests 통과**(신규 projectDesign 14건 = 필터/오버 경계·직군 그룹·roster 조인/요약).
- `npm run build` → 신규 경고 0(node_modules 소스맵만).
- 제약: board/pool/assign 훅·`patchAssignmentCache`·`patchProjectMetric` 무변경, `invalidateQueries` 0건(grep), 공용 컴포넌트(SkillChip/AssignedIssueCell/WorkloadCell/UserAvatar/ConfirmModal 등) props 재사용만.
