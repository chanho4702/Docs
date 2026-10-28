# 자원관리 탭 재편 — [인력 현황 | 프로젝트 배정] 설계서

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **슬러그**: `resource-assignment-merge`
- **입력**: `_workspace/resource-assignment-merge/00_input/requirement.md`
- **전제 자산**: `_workspace/work-assignment/01_architect_design.md` §2 + `02_backend_report.md` §1/§7 (경계면 계약 무변경 재사용)

> **핵심 결론**: 백엔드 신규 resolver 0건. 재사용 자산(AssignmentPage·work-assignment resolver 3종·RequiredSkillEditor·AllocationGraph)을 조립한다.
> **유일한 백엔드 변경은 PermissionMap 권한 grant 확장 3건**(read 2·write 1)이며 프로젝트 상세 보안을 약화하지 않는다.
> 이 문서 §2(경계면=무변경 계약)와 §3-A(권한 전/후)가 단일 진실 원천이다.

---

## 0. 조사 결과 요약 (추측 아님 — 실제 코드 확인)

| 확인 항목 | 실제 코드 | 설계 반영 |
|---|---|---|
| `/resource` 진입 게이트 | `ResourcePage.jsx:16` — `canRead('RESOURCE_MANAGEMENT')`, 없으면 `NoPermissionPage` | 통합 탭 진입자는 **반드시 RESOURCE_MANAGEMENT read 보유** (해법의 전제) |
| `AssignmentPage` props | `AssignmentPage.jsx:68` — `{ project_id, toast }`. 높이 `PANEL_HEIGHT='78vh'`/`PANEL_MIN_HEIGHT=480`(:47-48). vh 는 같은 iframe 에서 검증됨 | **무수정 재사용** — 통합 탭도 동일 iframe |
| `AssignmentPage` 권한 읽기 | `:70-72` — `canWrite('PROJECT')`(배정), `canRead('RESOURCE_MANAGEMENT')`(드로어), `canWrite('RESOURCE_MANAGEMENT')`(드로어 편집) 을 **이미 store 에서 직접** 읽음 | 배정 게이트만 OR 로 1줄 확장(§4-3). 자원관리 권한 인식은 이미 존재 |
| board resolver 권한 | `PermissionMap.js:226` — `getWorkAssignmentBoard: R('PROJECT','detail')` | §3-A — OR 확장 |
| pool resolver 권한 | `:228` — `getWorkAssignmentPool: R('RESOURCE_MANAGEMENT','detail')` | **무변경** (이미 자원관리 read) |
| assign resolver 권한 | `:231` — `assignWorkItem: W('PROJECT','inherited')` | §3-A — OR 확장(write) |
| 셀렉터 resolver 권한 | `:66` — `getActiveProjects: R('PROJECT','list')` | §3-A — OR 확장(read). **간과 주의: 셀렉터도 PROJECT read 요구** |
| projectScope 검증 로직 | `permissionGuard.js:38-51` — `enforceProjectScope`. `scopedProjectIds(principal)===null` 이면 통과. `'detail'`/`'inherited'` + `payload.projectId` 미소속 → `PERMISSION_PROJECT_SCOPE_DENIED` | §3-A — mode 는 **'detail'/'inherited' 유지**(보안 불변) |
| `scopedProjectIds` | `PrincipalResolver.js:143-147` — admin `null`, `projectScope !== 'MEMBER_ONLY'` `null`, MEMBER_ONLY 만 `memberProjectIds` | RESOURCE_MANAGEMENT 롤은 projectScope='ALL' 전제(§3-A 보안 분석) |
| `getProjectSkills`(요구스킬 조회) | `:221` — `OR([['RESOURCE_MANAGEMENT','read'],['PROJECT','read']])` | **이미 자원관리 read 허용** — RequiredSkillEditor 조회 무변경 |
| `setProjectSkills`(요구스킬 편집) | `:222` — `W('PROJECT','detail')` | **무변경**(보수적) — 편집은 PROJECT write 보유자만, 미보유 자원관리자는 읽기전용 |
| `RequiredSkillEditor` 저장 후 | `RequiredSkillEditor.jsx:45-46` — `projectSkills`+`projectMatch` invalidate. 편집 게이트 `canWrite('PROJECT')`(:19) | §4-4 — 통합 탭에서 `assignmentKeys.board` invalidate 추가(SQL write 라 인덱스 지연 없음 → 안전) |
| match/allocation 참조 | grep 결과 — `ProjectMatchTab`·`AllocationTab` 은 **오직 `ResourcePage.jsx`** 에서만 import. 각 디렉토리 내부는 자족적 | §5 마이그레이션 — 안전 제거 판정 |
| `getActiveProjects` 응답 | `ProjectRepository.js:185-199` — `{ rows: [{ project_id(uuid), project_name, ... }] }`. `ProjectMatchTab.jsx:19` 가 `res.rows` 소비 | 셀렉터 재사용 계약 그대로 |
| `AllocationGraph` props | `AllocationTab.jsx:86-91` — `{ projects, members, links, onMemberClick }`. 클라 필터(`filters.projectIds`)가 이미 존재(:33-39) | §4-5 — 선택 projectId 로 필터해 넘김 |

---

## 1. 개요 / 영향 범위

### 1.1 기능 요약
`/resource` 를 **3탭 → 2탭**으로 재편한다.
- **인력 현황**(overview) — 무변경 유지.
- **프로젝트 배정**(신규 통합 탭) — 프로젝트 셀렉터 → 선택 시 [요구 스킬 편집 + 작업 배정(AssignmentPage 그대로) + 관계도(보조)]. 기존 적합도(match)+배정현황(allocation)을 대체·흡수한다.

### 1.2 백엔드
- **신규 resolver 0건. 신규 서비스/DB/manifest 0건.**
- **변경: `src/permission/PermissionMap.js` grant 확장 3건** (§3-A). 응답 shape·서비스 로직 **전부 무변경**.
- `test/permission/permissionMap.contract.test.js` 는 키 집합 대조라 grant 값 변경만으로는 영향 없음(3키 이미 등록됨).

### 1.3 프론트
- **신규** `static/ui/src/pages/resource/assignment/ProjectAssignmentTab.jsx` (통합 탭 셸).
- **수정** `ResourcePage.jsx` (3탭→2탭), `AssignmentPage.jsx`(배정 게이트 OR 1줄), `RequiredSkillEditor.jsx`(옵셔널 `onSaved` prop).
- **제거** `match/ProjectMatchTab.jsx`, `match/CandidateRankTable.jsx`, `match/useProjectSkillMatch.js`, `allocation/AllocationTab.jsx`, `allocation/AllocationFilters.jsx` (§5).
- **재사용(무수정)** `AssignmentPage`, `match/RequiredSkillEditor`, `allocation/AllocationGraph`, `allocation/allocationGraphOption`, `allocation/useResourceAllocation`.
- 쿼리키: 신규 없음. `resourceKeys.activeProjects` / `assignmentKeys.board` 재사용.

### 1.4 DB
- **변경 없음.**

### 1.5 i18n
- 수정 `locales/kr/resource.json` + `locales/en/resource.json` — 탭 라벨 교체 + 통합 탭 섹션 키 추가(§6). AssignmentPage 자체의 `assignment.*`(별도 `assignment.json`)는 **무변경**.

---

## 2. 경계면 계약 (무변경 재사용 = 이것이 계약)

**신규/변경 resolver 없음.** work-assignment `02_backend_report.md` §1(E2E §7 반영분 포함)의 응답 shape 을 **그대로** 소비한다. 통합 탭은 소비 지점만 바꿀 뿐 계약을 건드리지 않는다.

| resolver | 입력 | 응답(무변경) | 대응 프론트 | 권한(변경) |
|---|---|---|---|---|
| `getActiveProjects` | `{}` | `{ success, rows:[{project_id,project_name,...}] }` | 셀렉터 `resourceKeys.activeProjects()` | **§3-A OR 확장(read)** |
| `getWorkAssignmentBoard` | `{ projectId }` | `{ success, content: BoardContent }` | `useWorkAssignmentBoard` / `assignmentKeys.board` | **§3-A OR 확장(read)** |
| `getWorkAssignmentPool` | `{ projectId }` | `{ success, content: PoolContent }` | `useWorkAssignmentPool` / `assignmentKeys.pool` | 무변경 |
| `assignWorkItem` | `{ projectId, issueId?, issueKey?, assigneeAccountId?, coworkerAccountIds? }` | `{ success, content: AssignResult }` | `useAssignWorkItem` → `patchAssignmentCache` | **§3-A OR 확장(write)** |
| `getProjectSkills` | `{ projectId }` | `{ success, data:{ skillIds } }` | `RequiredSkillEditor` / `resourceKeys.projectSkills` | 무변경(이미 OR) |
| `setProjectSkills` | `{ projectId, skillIds }` | `{ success }` | `RequiredSkillEditor` | 무변경(PROJECT write) |
| `getResourceAllocationGraph` | (useResourceAllocation) | `{ success, content:{ projects, members, links } }` | `AllocationGraph`(선택 필터) | 무변경 |

> ⚠️ 계약 리마인더(work-assignment §5 그대로 유효): `content` 래핑 / `candidates[].company` null 가능 / `project.util` 대개 null / `assignWorkItem` payload 에 `projectId` 필수 / invalidate 금지(assign 경로). 통합 탭 전환으로 **바뀌지 않는다**.

---

## 3-A. 권한 변경 — 전/후 표 + 보안 분석 (최우선 논점)

### 실측 판정: 통합 탭에서 RESOURCE_MANAGEMENT read 보유·PROJECT read **미**보유 자원관리자가 프로젝트를 고르면?

두 종류 장벽이 독립적으로 작동한다.
- **장벽 A (grant, `isSatisfied`)**: `getActiveProjects`/`getWorkAssignmentBoard` 는 grant 가 `PROJECT read` 단일. 자원관리자가 PROJECT read 없으면 **`PERMISSION_DENIED`** → 셀렉터가 비고, 선택해도 board 가 뜨지 않는다. (현재 match 탭도 동일 제약을 안고 있다.)
- **장벽 B (`enforceProjectScope`)**: `scopedProjectIds(principal)!==null`, 즉 **projectScope='MEMBER_ONLY' 비관리자만** 대상. 비소속 projectId → `PERMISSION_PROJECT_SCOPE_DENIED`.

### 변경표

| resolver | 변경 전 | 변경 후 | 새로 열리는 대상 |
|---|---|---|---|
| `getActiveProjects` | `R('PROJECT','list')` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')` | 자원관리 read 보유·PROJECT read 미보유자가 활성 프로젝트 목록 조회 |
| `getWorkAssignmentBoard` | `R('PROJECT','detail')` | `OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'detail')` | 동일 사용자가 작업 큐/후보 board 조회 |
| `assignWorkItem` | `W('PROJECT','inherited')` | `OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']], 'inherited')` | 자원관리 **write** 보유자가 배정 실행 |
| `getWorkAssignmentPool` | `R('RESOURCE_MANAGEMENT','detail')` | **무변경** | — |
| `setProjectSkills` | `W('PROJECT','detail')` | **무변경** | — (요구스킬 편집은 프로젝트 오너 권한 유지) |

### 보안 영향 분석 (프로젝트 상세 보안 무약화 근거)

1. **project mode 를 'detail'/'inherited' 그대로 유지** → 장벽 B(스코프 검증)는 **한 줄도 약해지지 않는다**. MEMBER_ONLY 사용자의 비소속 프로젝트 접근은 read·write 모두 여전히 차단된다.
2. **read 확장(board/getActiveProjects)의 안전성**:
   - board 의 전사 컬럼·전사 풀은 이미 서비스가 `companyScopeVisible`(=RESOURCE_MANAGEMENT read)로 **부분 마스킹**한다. grant 에 RESOURCE_MANAGEMENT read 를 OR 로 더해도 마스킹 규칙은 불변 → 전사 지표 노출 범위가 넓어지지 않는다.
   - 프로젝트 상세 **작업 배정 탭**(다른 화면)의 진입자는 애초에 PROJECT read 보유자다. OR 확장은 그들의 판정을 바꾸지 않는다(`PROJECT read`로 이미 통과). **프로젝트 상세 회귀 없음.**
   - 신규로 열리는 것은 "자원관리 read 보유·PROJECT read 미보유" 사용자가 **프로젝트 작업 큐/후보를 보는 것** = 자원관리 기능의 본질(인력을 어디에 배정할지 판단). 승인 가능한 확장.
3. **write 확장(assign)의 신중한 처리** — 요구 §5-1 의 write 보안 판단:
   - `RESOURCE_MANAGEMENT` **read** 가 아니라 **write** 를 요구한다. 조회 전용 자원관리자(read만)는 배정할 수 없다 → 최소 권한 원칙 준수.
   - RESOURCE_MANAGEMENT write 는 `setUserSkills` 등 **인력 편집권**이다. "누구를 어느 작업에 배정" 은 인력 운용 행위라 의미가 정합한다.
   - **Jira `ASSIGN_ISSUES` 가 최종 판정자**다(assignee write 는 `as:'user'`). 앱 권한을 넘어도 Jira 권한이 없으면 서버가 4xx 전파 → 이중 방어.
4. **RESOURCE_MANAGEMENT 롤은 projectScope='ALL' 운영을 전제**한다. 자원관리는 전사 인력을 다루는 롤이므로 MEMBER_ONLY 와의 조합은 실무상 비정상이다. 이는 **권한 데이터 설정 가이드**이지 코드 약화가 아니다. 만약 MEMBER_ONLY 자원관리자가 존재하면 장벽 B 에 의해 소속 프로젝트만 보게 되며, 이는 안전한 축소이지 위험이 아니다.

### 계약 테스트 영향
`permissionMap.contract.test.js` 는 **등록집합 ↔ 맵키집합** 대조다. 3키는 이미 등록·매핑돼 있고 grant **값**만 바뀌므로 대조 테스트는 영향 없이 통과한다. (OR 헬퍼는 PermissionMap 에 이미 존재 — `getRoleList` 등.)

---

## 4. 프론트엔드 설계

### 4.1 컴포넌트 트리 (신규 / 재사용 / 제거 3분류)

```
static/ui/src/pages/resource/
├── ResourcePage.jsx                      [수정] 3탭 → 2탭
├── assignment/
│   └── ProjectAssignmentTab.jsx          [신규] 통합 탭 셸
├── match/
│   ├── RequiredSkillEditor.jsx           [수정] 옵셔널 onSaved prop
│   ├── ProjectMatchTab.jsx               [제거]
│   ├── CandidateRankTable.jsx            [제거]
│   └── useProjectSkillMatch.js           [제거]
├── allocation/
│   ├── AllocationGraph.jsx               [재사용·무수정]
│   ├── allocationGraphOption.js          [재사용·무수정]
│   ├── useResourceAllocation.js          [재사용·무수정]
│   ├── AllocationTab.jsx                 [제거]
│   └── AllocationFilters.jsx             [제거]
└── overview/…                            [무변경]

재사용(무수정, 타 디렉토리):
  projectDetail/assignment/AssignmentPage.jsx  (project_id, toast) ← §4-3 배정게이트 1줄만 수정
```

### 4.2 `ProjectAssignmentTab.jsx` (신규 셸)

```
상태(로컬 useState)
  projectId       — 셀렉터 선택 (uuid)
  skillEditorOpen — 요구 스킬 편집 패널 접기/펼치기 (기본 접힘)
  graphOpen       — 관계도 섹션 접기/펼치기 (기본 접힘, 온디맨드)
  toast = ToastFlags()   — AssignmentPage 에 주입할 토스트 (인터페이스 §4-6)
  queryClient

레이아웃
  1) 프로젝트 셀렉터 (ProjectMatchTab 패턴 그대로 복제)
       useQuery(resourceKeys.activeProjects(), invoke('getActiveProjects') → res.rows)
       options = rows.map(p => ({ label: p.project_name, value: p.project_id }))
       @atlaskit/select, placeholder=resource.assignment.selectProject
  2) projectId 없음 → resource.assignment.noProject 안내
  3) projectId 있음:
     a. 요구 스킬 편집 (접이식)
          <RequiredSkillEditor
             projectId={projectId}
             onSaved={() => queryClient.invalidateQueries({ queryKey: assignmentKeys.board(projectId) })}
          />
     b. 작업 배정 (핵심) — key={projectId} 로 프로젝트 전환 시 내부 상태 리셋
          <AssignmentPage project_id={projectId} toast={toast} />
     c. 관계도 (보조, 접이식·온디맨드) — §4-5
  {toast.FlagUI}
```

- **셀렉터를 별도 훅으로 추출하지 않는다** — `ProjectMatchTab` 의 셀렉터 로직(≈20줄)을 그대로 옮긴다(그 파일은 제거되므로 중복 아님).
- `<AssignmentPage key={projectId} ... />` — key 를 projectId 로 주어 **프로젝트 변경 시 선택 작업/필터/poolOpen 로컬 상태가 초기화**되게 한다(AssignmentPage 는 project_id 변경을 스스로 감지하지만, 선택 이슈 state 잔존 방지를 위해 명시적 remount 가 안전).

### 4.3 `AssignmentPage.jsx` 최소 변경 (배정 게이트 OR — 백엔드 정합)

현재(`:70,:312`):
```js
const canWriteProject = usePermissionStore((s) => s.canWrite('PROJECT'));
...
canWrite={canWriteProject}
```
변경:
```js
const canWriteProject  = usePermissionStore((s) => s.canWrite('PROJECT'));
const canWriteResource = usePermissionStore((s) => s.canWrite('RESOURCE_MANAGEMENT')); // 이미 존재(:72)
const canAssign = canWriteProject || canWriteResource;   // 백엔드 assignWorkItem OR 와 정합
...
canWrite={canAssign}
```
- **하위호환**: 프로젝트 상세 문맥에서 "PROJECT write 미보유·RESOURCE write 보유" 사용자에게 배정 버튼이 노출된다. 백엔드 assign 이 이미 그들에게 열렸으므로 프론트-백엔드 **정합**이지 회귀가 아니다. 그런 사용자는 프로젝트 상세 진입(PROJECT read) 자체가 필요해 실질 모수가 극소다.
- 옵셔널 prop(`context`) 도입은 **과설계** — 백엔드 OR 통일과 프론트 OR 통일이 대칭이므로 컨텍스트 분기 불필요.
- Jira 사전 가드(`useJiraProjectPermissions.canAssignIssues`)는 그대로 유지 — write 확장과 무관하게 Jira 권한이 최종 판정.

### 4.4 `RequiredSkillEditor.jsx` 최소 변경 (반영 경로 + invalidate 조화)

- **배치**: 통합 탭 셀렉터 아래 접이식 섹션(인라인 편집기라 모달보다 인라인이 자연스럽다). `getProjectSkills` 는 이미 자원관리 read 허용이라 조회 무변경. 편집 버튼은 기존대로 `canWrite('PROJECT')` 일 때만 노출(미보유 자원관리자는 읽기전용 SkillMultiSelect).
- **반영 경로 + invalidate 원칙과의 조화 (요구 §5-2 핵심)**:
  - 요구 스킬을 바꾸면 board 의 `requiredSkills` 와 각 후보 `coverage/matchedSkills/missingSkills` 가 달라진다. 이를 갱신하려면 board 재조회가 필요하다.
  - **이 지점의 invalidate 는 안전하다**: work-assignment 의 invalidate **금지** 원칙은 `assignWorkItem` write 직후 `search/jql` **인덱스 지연** 때문이다. 요구 스킬은 `skill_mapping` **SQL write** 라 인덱스 지연이 없다 → board 재조회는 방금 저장한 스킬을 **즉시 정확히** 반영한다. 화면 롤백 위험 없음.
  - 따라서 **`assignmentKeys.board(projectId)` invalidate 는 requiredSkills 저장 후에 한해 정당한 유일한 지점**이다. (assign 캐시 패치 경로는 여전히 invalidate 금지.)
  - 구현: 옵셔널 `onSaved` prop 추가. 저장 성공(`onSuccess`) 시 기존 invalidate 뒤에 `onSaved?.()` 호출. 통합 탭이 board invalidate 를 넘긴다.
    ```js
    export default function RequiredSkillEditor({ projectId, onSaved }) { ...
      onSuccess: (res) => { ...
        queryClient.invalidateQueries({ queryKey: resourceKeys.projectSkills(projectId) });
        queryClient.invalidateQueries({ queryKey: resourceKeys.projectMatch(projectId) }); // 잔존(무해)
        onSaved?.();   // ★ 통합 탭: board invalidate
      }
    ```
  - `projectMatch` invalidate 는 useProjectSkillMatch 제거 후 소비자가 없어 무해하게 no-op 이 된다(라인 유지 — RequiredSkillEditor 단독 회귀 방지).

### 4.5 관계도(AllocationGraph) 흡수 — 선택 프로젝트 중심 필터 (요구 §5-3 판정)

**판정**: 전사 관계도를 그대로 두지 않는다. 통합 탭은 단일 프로젝트 선택 문맥이므로 **선택 프로젝트 중심으로 필터**한다. 전사 전체 관계도는 노이즈이며, `/resource` 인력 현황/기존 배정현황과 목적이 중복된다.

**구현**:
```
관계도 섹션 (ProjectAssignmentTab 내부, 접이식·기본 접힘)
  graphOpen 토글 버튼 (resource.assignment.graph.toggle)
  graphOpen === true 일 때만:
    const { projects, members, links } = useResourceAllocation({ includeClosed: true });
      ★ enabled = graphOpen (온디맨드 — 전사 배치 비용을 열 때만 지불)
    // 선택 프로젝트 + 직접 연결된 인력만 남긴다
    const projSet = new Set([projectId]);
    const fLinks    = links.filter(l => projSet.has(l.projectId));
    const acctSet   = new Set(fLinks.map(l => l.accountId));
    const fProjects = projects.filter(p => projSet.has(p.projectId));
    const fMembers  = members.filter(m => acctSet.has(m.accountId));
    <AllocationGraph projects={fProjects} members={fMembers} links={fLinks}
                     onMemberClick={openDrawer} />
```
- `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation` **무수정 재사용**. `AllocationFilters` 는 프로젝트가 이미 단일 선택이라 **불필요 → 제거**.
- **드로어**: 관계도 노드 클릭 → `ResourceProfileDrawer`(canReadResource 보유 = 진입 전제라 항상 열림). AssignmentPage 가 이미 드로어를 갖지만 관계도 섹션은 ProjectAssignmentTab 소유라 별도 drawer state 하나 더 둔다(또는 AllocationGraph 의 onMemberClick 을 ProjectAssignmentTab 로컬 drawer 로 연결).
- **검증 포인트(구현자)**: `useResourceAllocation` 반환 `projects[].projectId`·`links[].projectId` 가 셀렉터 value(=`getActiveProjects.rows[].project_id`, uuid)와 **동일 체계**인지 확인. `getResourceAllocationGraph` 가 RMS project_id(uuid)를 쓰면 매칭된다. 불일치 시 조인 실패로 관계도가 빈다 → integration-verify 필수 항목.
- **대안 검토**: 뷰 전환(탭 within 탭)보다 하단 접이식 섹션이 낫다 — 배정 작업 중 관계도를 참조로 곁에 두는 흐름이 자연스럽고, 뷰 전환은 배정 컨텍스트를 잃는다.

### 4.6 `ResourcePage.jsx` (3탭 → 2탭)

```jsx
<Tabs id="resource-tabs">
  <TabList>
    <Tab>{t('resource.tab.overview')}</Tab>
    <Tab>{t('resource.tab.assignment')}</Tab>   {/* match·allocation 2탭을 대체 */}
  </TabList>
  <TabPanel><div style={{...}}><ResourceOverviewTab /></div></TabPanel>
  <TabPanel><div style={{...}}><ProjectAssignmentTab /></div></TabPanel>
</Tabs>
```
- import 교체: `ProjectMatchTab`/`AllocationTab` 제거, `ProjectAssignmentTab` 추가. 진입 게이트(`canRead('RESOURCE_MANAGEMENT')`)는 무변경.

### 4.7 toast 인터페이스 (재사용 전제 검증)
- AssignmentPage 는 `toast?.showSuccess?.(title, desc)` / `toast?.showError?.(title, desc)` 호출(`:206,:217`).
- `ToastFlags()`(RequiredSkillEditor 가 사용)는 `showSuccess(title,msg)`/`showError(title,msg)`/`FlagUI` 제공 → **인터페이스 일치**. ProjectAssignmentTab 이 `const toast = ToastFlags()` 를 만들어 AssignmentPage 에 주입하고 `{toast.FlagUI}` 를 렌더한다.
- 구현자 확인: `ToastFlags` 의 실제 export 시그니처가 위와 일치하는지 1회 확인(경로 `components/feedback/ToastFlags`).

### 4.8 권한 게이트 요약 (프론트)

| 대상 | 게이트 | 비고 |
|---|---|---|
| 통합 탭 진입 | `/resource` 진입 = `canRead('RESOURCE_MANAGEMENT')` | ResourcePage 게이트 그대로 |
| 셀렉터/board 조회 | 서버 grant OR(§3-A) | 자원관리 read 로 통과 |
| 전사 컬럼/풀 | `board.meta.companyScopeVisible`/`poolAvailable`(서버) | AssignmentPage 기존 로직 |
| 배정 실행 | `canWrite('PROJECT') \|\| canWrite('RESOURCE_MANAGEMENT')` + `canAssignIssues!==false` | §4-3 |
| 요구 스킬 편집 | `canWrite('PROJECT')` | 무변경(미보유=읽기전용) |
| 후보/노드 드로어 | `canRead('RESOURCE_MANAGEMENT')` | 진입 전제라 항상 참 |

---

## 5. 마이그레이션 (제거 파일 — 참조 전수 확인 완료)

grep 결과 `ProjectMatchTab`·`AllocationTab` 은 **오직 `ResourcePage.jsx`** 에서만 참조되고, 각 하위 컴포넌트는 그 두 탭 안에서만 소비된다. 아래 제거는 안전하다.

| 제거 파일 | 유일 소비처 | 대체 |
|---|---|---|
| `match/ProjectMatchTab.jsx` | ResourcePage | ProjectAssignmentTab |
| `match/CandidateRankTable.jsx` | ProjectMatchTab | AssignmentPage 이중 스코프 후보 테이블(더 풍부) |
| `match/useProjectSkillMatch.js` | CandidateRankTable | board 응답에 coverage 포함(추가 invoke 불필요) |
| `allocation/AllocationTab.jsx` | ResourcePage | ProjectAssignmentTab 관계도 섹션 |
| `allocation/AllocationFilters.jsx` | AllocationTab | 단일 프로젝트 선택이라 불요 |

**유지**: `RequiredSkillEditor`(재사용), `AllocationGraph`/`allocationGraphOption`/`useResourceAllocation`(재사용).
**쿼리키**: `resourceKeys.projectMatch` 는 소비자 소멸로 미사용화되나 **라인 삭제하지 않는다**(RequiredSkillEditor 가 여전히 invalidate 호출 → no-op, 무해). 제거하면 RequiredSkillEditor 를 함께 손대야 해 diff 확대.
**백엔드 resolver**: `getProjectSkillMatch` resolver 는 **제거하지 않는다**(다른 잠재 소비 가능성 + 계약 테스트 키). 프론트 소비만 사라진다.
**테스트**: match/allocation 전용 프론트 테스트가 있으면 함께 제거(현재 assignment/__test__ 는 통합 탭에서 계속 유효 — 무변경).

---

## 6. i18n 변경 목록

### 6.1 수정 `locales/kr/resource.json` / `locales/en/resource.json`

**탭 라벨 교체** (`tab` 섹션):
| 키 | 조치 | kr | en |
|---|---|---|---|
| `tab.overview` | 유지 | 인력 현황 | Overview |
| `tab.match` | **제거** | — | — |
| `tab.allocation` | **제거** | — | — |
| `tab.assignment` | **추가** | 프로젝트 배정 | Project Assignment |

**통합 탭 셸 신규 섹션** (`assignment` — resource.json 내):
| 키 | kr | en |
|---|---|---|
| `assignment.selectProject` | 프로젝트 선택 | Select a project |
| `assignment.noProject` | 프로젝트를 먼저 선택하세요 | Select a project first |
| `assignment.requiredSkills.title` | 요구 스킬 | Required skills |
| `assignment.requiredSkills.toggle` | 요구 스킬 편집 | Edit required skills |
| `assignment.graph.title` | 인력 배정 관계도 | Assignment relationship graph |
| `assignment.graph.toggle` | 관계도 보기 | Show relationship graph |
| `assignment.graph.empty` | 이 프로젝트에 연결된 배정이 없습니다 | No assignments linked to this project |

- **재사용 유지 키**: `match.selectProject`·`match.requiredSkills`·`match.editRequired`·`match.placeholder`·`match.noRequired`·`match.save.success` 는 `RequiredSkillEditor` 가 계속 사용 → **유지**.
- **미사용화 키(제거 선택)**: `match.rank/coverage/matched/missing/candidates/load/inProgress/remaining/remainingTip/noProject/requiredSkills(중복)` 는 CandidateRankTable 제거로 소비자 소멸. **삭제해도 되나 필수 아님**(merge 산출물 크기 영향 미미). 삭제 시 en/kr 대칭 유지.
- `allocation.*` 섹션(기존 배정현황 문구): AllocationGraph 재사용에 필요한 키는 유지. AllocationTab/AllocationFilters 전용 키(`allocation.title/description/empty` 등)는 통합 탭이 `assignment.graph.*` 로 대체하므로 미사용화(삭제 선택).
- **merge**: `cd static/ui && npm run merge` → `ko-KR.json`/`en-US.json` 생성. 직접 수정 금지, `locales/script/*.json` 은 빈 스텁.

### 6.2 AssignmentPage 자체 i18n
- `assignment.*`(별도 `locales/kr|en/assignment.json`) 는 **무변경**. 통합 탭이 같은 AssignmentPage 를 렌더하므로 그 문구가 그대로 재사용된다.

---

## 7. 구현 작업 분해

### 7.1 Backend 체크리스트
- [ ] **B1** `PermissionMap.js` — 3키 grant 확장 (§3-A)
  - `getActiveProjects: OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'list')`
  - `getWorkAssignmentBoard: OR([['PROJECT','read'],['RESOURCE_MANAGEMENT','read']], 'detail')`
  - `assignWorkItem: OR([['PROJECT','write'],['RESOURCE_MANAGEMENT','write']], 'inherited')`
  - `getWorkAssignmentPool`·`setProjectSkills`·`getProjectSkills` **무변경**
- [ ] **B2** `npm test` — `permissionMap.contract.test.js` 통과(키 집합 불변). 기존 순수함수 테스트 회귀 없음 확인
- [ ] **B3** (선택) 권한 확장 회귀 테스트 1건 — 자원관리 read/write 보유·PROJECT 미보유 principal 에 대한 `isSatisfied` OR 통과 단위 테스트

### 7.2 Frontend 체크리스트
- [ ] **F1** `AssignmentPage.jsx` — 배정 게이트 `canWriteProject || canWriteResource` (§4-3, 1줄)
- [ ] **F2** `RequiredSkillEditor.jsx` — 옵셔널 `onSaved` prop + `onSuccess` 에서 `onSaved?.()` (§4-4)
- [ ] **F3** `assignment/ProjectAssignmentTab.jsx` 신규 — 셀렉터 + RequiredSkillEditor(onSaved=board invalidate) + `<AssignmentPage key={projectId}>` + 관계도 섹션 + ToastFlags 주입 (§4-2/4-5)
- [ ] **F4** `ResourcePage.jsx` — 3탭→2탭, import 교체 (§4-6)
- [ ] **F5** 제거 — `match/ProjectMatchTab.jsx`, `match/CandidateRankTable.jsx`, `match/useProjectSkillMatch.js`, `allocation/AllocationTab.jsx`, `allocation/AllocationFilters.jsx` (§5)
- [ ] **F6** i18n — `resource.json`(kr/en) 탭 라벨 교체 + `assignment.*` 섹션 추가 → `npm run merge` (§6)
- [ ] **F7** `cd static/ui && npm run build` — prebuild merge 포함 통과. 제거 파일에 대한 dangling import 0건 확인

### 7.3 검증 포인트 (integration-verifier 전달)
1. **권한 OR 정합** — `assignWorkItem` 백엔드 OR ↔ AssignmentPage 프론트 `canWrite('PROJECT')||canWrite('RESOURCE_MANAGEMENT')` 일치. board/getActiveProjects read OR 도 대칭.
2. **projectScope 불변** — `permissionGuard.enforceProjectScope` 코드 diff 0. mode 값이 'detail'/'inherited'/'list' 그대로인지.
3. **프로젝트 상세 회귀 없음** — 프로젝트 상세 작업 배정 탭(`tabs.js:106`)이 여전히 동일 AssignmentPage 를 렌더하고, PROJECT read/write 사용자 동작 불변.
4. **invalidate 경계** — 코드베이스에 `invalidateQueries(assignmentKeys.board)` 는 **RequiredSkillEditor 저장 경로에만** 존재(assign 경로엔 0건). `useAssignWorkItem` 은 `setQueryData` 패치만 유지.
5. **관계도 조인 키** — `useResourceAllocation` 의 projectId 체계 ↔ `getActiveProjects.rows[].project_id`(uuid) 일치(불일치 시 관계도 빈다).
6. **제거 파일 dangling import 0건** — 5개 제거 파일을 참조하는 import 가 남아있지 않은지 grep(`ProjectMatchTab`/`CandidateRankTable`/`useProjectSkillMatch`/`AllocationTab`/`AllocationFilters`).
7. **응답 shape 무변경** — work-assignment `02_backend_report.md` §1 계약 소비 경로가 통합 탭에서도 동일(content 래핑, company null 가능, project.util null).
8. **toast 인터페이스** — `ToastFlags()` 가 `showSuccess/showError/FlagUI` 를 제공, AssignmentPage 호출과 일치.
9. **i18n 대칭** — 사용 `resource.tab.assignment`·`resource.assignment.*` 키가 kr/en 양쪽에 존재하고 merge 산출물에 반영.
10. **build 통과** — `static/ui npm run build`.

---

## 8. 가정 및 한계 (명시)

1. **RESOURCE_MANAGEMENT 롤은 projectScope='ALL' 운영 전제.** MEMBER_ONLY 자원관리자는 장벽 B 로 소속 프로젝트만 보게 되며(안전한 축소), 비소속을 보려면 권한 데이터에서 projectScope 를 ALL 로 설정해야 한다. 코드로 열지 않는다(보안).
2. **요구 스킬 편집권은 PROJECT write 로 유지.** 자원관리자가 PROJECT write 없으면 요구 스킬은 읽기 전용이다(보수적 선택). 필요 시 후속에서 별도 논의.
3. **관계도는 선택 프로젝트 1개 중심**이다. 전사 배정 관계도가 필요하면 그것은 별도 화면의 몫이며 통합 탭 범위 밖이다.
4. **board invalidate 는 요구 스킬 저장 시에만** 정당하다(SQL write, 인덱스 지연 없음). assign 캐시 패치 경로의 invalidate 금지 원칙은 그대로 유효하다.
5. **AssignmentPage 는 무수정 재사용**(배정 게이트 1줄 제외). 이 1줄은 프로젝트 상세에도 적용되는 백엔드-프론트 정합 개선이지 자원관리 전용 분기가 아니다.
6. **신규 백엔드 resolver·DB·manifest 0건.** 권한 grant 3건 확장이 유일한 백엔드 변경이다.
