# 자원관리 탭 재편 (resource-assignment-merge) — 프론트엔드 리포트

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **입력**: `01_architect_design.md` §4/§5/§6 + `02_backend_report.md`(권한 grant OR 확장 3건, 응답 shape 무변경)
- **검증**: `npm test` → **17 suites / 213 tests 통과** · `npm run build` → 신규 경고 0(기존 node_modules 소스맵만)

> `/resource` 를 3탭 → 2탭으로 재편. 신규 resolver 0건, 재사용 자산 조립. `AssignmentPage` 는 배정 게이트 1줄만 수정(프로젝트 상세 동작 불변).

---

## 1. 신규 / 수정 / 제거 파일

### 신규
| 파일 | 역할 |
|---|---|
| `pages/resource/assignment/ProjectAssignmentTab.jsx` | 통합 탭 셸 — 프로젝트 셀렉터 + 요구 스킬 편집(접이식) + `AssignmentPage` 재사용 + 관계도(접이식·온디맨드) |

### 수정
| 파일 | 변경 |
|---|---|
| `pages/resource/ResourcePage.jsx` | 3탭 → 2탭(인력 현황 \| 프로젝트 배정). import 교체(`ProjectMatchTab`/`AllocationTab` → `ProjectAssignmentTab`). 진입 게이트 `canRead('RESOURCE_MANAGEMENT')` 무변경 |
| `pages/projectDetail/assignment/AssignmentPage.jsx` | **배정 게이트 1줄** — `canAssign = canWriteProject \|\| canWriteResource`, `CandidatePanel canWrite={canAssign}`. `canWriteResource` 는 이미 존재하던 변수 재사용 |
| `pages/resource/match/RequiredSkillEditor.jsx` | 옵셔널 `onSaved` prop 추가, `onSuccess` 끝에 `onSaved?.()` 1줄 |
| `locales/kr/resource.json` · `locales/en/resource.json` | 탭 라벨 교체 + `assignment.*` 섹션 추가 + 미사용 키 정리(§4) |

### 제거 (5파일, §5 — grep 재확인 후)
`match/ProjectMatchTab.jsx`, `match/CandidateRankTable.jsx`, `match/useProjectSkillMatch.js`, `allocation/AllocationTab.jsx`, `allocation/AllocationFilters.jsx`
- 제거 전 grep: 5파일 모두 외부 참조 0(서로 간 내부 참조 + 주석뿐). **dangling import 0건**(빌드 후 재확인).

### 재사용 (무수정)
`AssignmentPage`(게이트 1줄 제외), `allocation/AllocationGraph`, `allocation/allocationGraphOption`, `allocation/useResourceAllocation`, `overview/profile/ResourceProfileDrawer`, `components/feedback/ToastFlags`, `SkillMultiSelect`.

---

## 2. 소비하는 응답 shape (verifier 교차 비교용)

**신규/변경 resolver 없음** — work-assignment `02_backend_report.md` §1 계약을 그대로 소비. 통합 탭이 추가로 소비하는 경로:

| resolver | 소비처 | content 경로 |
|---|---|---|
| `getActiveProjects` | `ProjectAssignmentTab` 셀렉터 | `res.rows[].{project_id(uuid), project_name}` → `{label, value}` (ProjectMatchTab 패턴 복제) |
| `getWorkAssignmentBoard`/`Pool`/`assignWorkItem` | `<AssignmentPage>`(무수정) | work-assignment 기존 경로 그대로 — `content` 래핑, `candidates[].company` null 가능, `project.util` 대개 null, `projectKey/Name/AvatarUrl`, flags 빈 배열 가능 |
| `getProjectSkills`/`setProjectSkills` | `RequiredSkillEditor`(무수정) | `res.data.skillIds` / `res.success` |
| `getResourceAllocationGraph` | `ProjectGraphSection` → `useResourceAllocation`(무수정) | `res.content.{projects[],members[],links[]}`. 필터: `links[].projectId === 선택 projectId`, `members` 는 그 링크의 `accountId` 로 조인 |

**관계도 조인 키 확인**: `useResourceAllocation` 의 `projects[].projectId`/`links[].projectId` 는 `getResourceAllocationGraph` 가 내려주는 RMS project_id(uuid). 셀렉터 value(=`getActiveProjects.rows[].project_id`, uuid)와 **동일 체계** → 조인 성립. (배포 후 실데이터 1회 확인 권장 — 불일치 시 관계도가 빈다.)

---

## 3. 권한 게이트 미러링 표 (백엔드 grant OR ↔ 프론트)

| 대상 | 프론트 게이트 | 백엔드 grant(02_backend §1) | 정합 |
|---|---|---|---|
| 통합 탭 진입 | `canRead('RESOURCE_MANAGEMENT')` (ResourcePage) | — (진입 전제) | ✅ |
| 셀렉터 조회 | 서버 grant OR | `getActiveProjects` = OR[PROJECT read, **RESOURCE_MANAGEMENT read**] | ✅ 자원관리 read 로 통과 |
| board 조회 | 서버 grant OR | `getWorkAssignmentBoard` = OR[PROJECT read, **RESOURCE_MANAGEMENT read**] | ✅ |
| 전사 컬럼/풀 | `board.meta.companyScopeVisible`/`poolAvailable`(서버 마스킹) | `getWorkAssignmentPool` = RESOURCE_MANAGEMENT read (무변경) | ✅ 마스킹 불변 |
| **배정 실행** | **`canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')`** + `canAssignIssues!==false` | `assignWorkItem` = OR[PROJECT **write**, RESOURCE_MANAGEMENT **write**] | ✅ **write 로 미러링**(read 아님 — 백엔드 §6-2 경고 준수) |
| 요구 스킬 편집 | `canWrite('PROJECT')` (RequiredSkillEditor 무변경) | `setProjectSkills` = PROJECT write (무변경) | ✅ 미보유=읽기전용 |
| 후보/노드 드로어 | `canRead('RESOURCE_MANAGEMENT')` | `getResourceProfile` = RESOURCE_MANAGEMENT read | ✅ 진입 전제라 항상 참 |

- **핵심 주의 준수**: assign 미러링을 `canWrite('RESOURCE_MANAGEMENT')`(write)로 했다. read 로 하면 버튼이 보이는데 서버가 거부하는 불일치가 난다 — 그 실수를 피했다.
- **프로젝트 상세 회귀 없음**: 게이트가 `PROJECT write || RESOURCE write` 로 넓어졌지만, 프로젝트 상세 작업 배정 탭 진입자는 애초 PROJECT write 보유자라 OR 의 첫 항으로 이미 통과 → 판정 불변. "PROJECT write 없고 RESOURCE write 있는" 사용자에게만 버튼이 새로 열리며, 이는 백엔드 OR 와 정합(회귀 아님).

---

## 4. i18n

- **탭 라벨**: `tab.match`·`tab.allocation` **제거**, `tab.assignment`(프로젝트 배정 / Project Assignment) **추가**.
- **신규 섹션** `resource.assignment.*` (7키): `selectProject`, `noProject`, `requiredSkills.title/toggle`, `graph.title/toggle/empty`.
- **미사용 키 정리**(§6 선택 사항 수행): `match` 는 RequiredSkillEditor 가 실제 쓰는 `editRequired`/`placeholder`/`save.success` 만 남기고 나머지(CandidateRankTable 소멸분) 삭제. `allocation` 은 AllocationGraph/option 이 쓰는 `tooltip`/`legend` 만 남기고 `title`/`description`/`filter`/`node`/`empty`(AllocationTab/Filters 소멸분) 삭제.
- **AssignmentPage 자체 i18n**(`assignment.json`) 무변경 — 같은 컴포넌트 재사용이라 문구 그대로.
- **merge 실행 완료** → `ko-KR.json`/`en-US.json` 반영. resource 네임스페이스 **kr/en 각 97키, 완전 대칭**. 통합 탭 사용 키 10개 전수 존재(누락 0).

---

## 5. 재사용 컴포넌트 무수정 준수

| 자산 | 방식 |
|---|---|
| `AssignmentPage` | 배정 게이트 1줄만 수정(프로젝트 상세·자원관리 탭 공통 정합 개선, 전용 분기 없음). `key={projectId}` 로 프로젝트 전환 시 remount(선택 이슈/필터/poolOpen 리셋) |
| `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation` | **무수정**. 필터는 `ProjectGraphSection` 에서만(선택 프로젝트 + 직접 연결 인력). `AllocationFilters` 는 단일 프로젝트 문맥이라 제거 |
| `RequiredSkillEditor` | 옵셔널 `onSaved` prop 추가(하위호환 — 미전달 시 기존 동작). `projectMatch` invalidate 라인 유지(소비자 소멸로 no-op, 무해 — RequiredSkillEditor 단독 회귀 방지) |
| `ToastFlags` | 훅이라 `ProjectAssignmentTab` 최상위에서 `const toast = ToastFlags()` 호출(useMemo 래핑 불가 — 다른 소비처와 동일 패턴), `AssignmentPage` 에 주입 + `{toast.FlagUI}` 렌더 |

**온디맨드 관계도**: `useResourceAllocation` 이 `enabled` 파라미터를 받지 않으므로(무수정 원칙), 관계도를 `ProjectGraphSection` 서브컴포넌트로 분리해 `graphOpen === true` 일 때만 **마운트** → 전사 배치 호출을 열 때만 지불(훅 조건부 호출 위반 없이 달성).

---

## 6. invalidate 경계 (핵심 규약 준수)

- **assign 경로 invalidate 여전히 0건** — `useAssignWorkItem` 은 `setQueryData` + `patchAssignmentCache` 만(work-assignment 그대로).
- **`assignmentKeys.board` invalidate 는 요구 스킬 저장 경로에만** — `ProjectAssignmentTab` 이 `RequiredSkillEditor.onSaved` 로 `invalidateQueries({ queryKey: assignmentKeys.board(projectId) })` 를 넘긴다. 요구 스킬은 `skill_mapping` **SQL write** 라 인덱스 지연이 없어 board 재조회가 방금 저장한 스킬을 즉시 정확히 반영 → 화면 롤백 위험 없음(설계 §4.4 판정).
- 이 지점 외 `assignmentKeys.*` invalidate 는 코드베이스에 없음.

---

## 7. 검증 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm test` | **17 suites / 213 tests 통과** (assignment/filter 순수함수 회귀 0 — 게이트/탭 변경은 렌더 계층) |
| `cd static/ui && npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, **신규 코드 유래 경고 0**, 제거 5파일 dangling import 0 |
| 제거 파일 참조 | grep 재확인 — `ProjectMatchTab`/`CandidateRankTable`/`useProjectSkillMatch`/`AllocationTab`/`AllocationFilters` import 0건 |
| 공용 컴포넌트 | AllocationGraph/option/useResourceAllocation/ResourceProfileDrawer/ToastFlags **무수정** |

---

## 8. 설계서와 달라진 점

| 설계 | 실제 | 이유 |
|---|---|---|
| 관계도 `useResourceAllocation({..., enabled: graphOpen})` | 훅에 `enabled` 미지원 → `ProjectGraphSection` 을 `graphOpen` 시에만 마운트 | 훅 무수정 원칙 + 조건부 훅 호출 금지. 마운트 게이팅으로 동일한 온디맨드 달성 |
| 미사용 i18n 키 "삭제 선택" | 삭제 수행 | dead 키 0 유지(kr/en 대칭). RequiredSkillEditor/AllocationGraph 실사용 키만 남김 |
| 요구 스킬 편집 배치 | 접이식 섹션(기본 접힘) + 관계도도 접이식(기본 접힘) | 배정(핵심)을 시각적 우선순위로. 스킬 편집/관계도는 보조라 온디맨드 |

**계약 위반 없음.** 응답 shape·payload 규약·invalidate 경계 전부 준수, 배정 게이트만 백엔드 OR 와 대칭으로 확장.
