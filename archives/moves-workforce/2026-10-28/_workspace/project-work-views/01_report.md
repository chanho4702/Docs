
---

## §추가 (2026-07-23) — 트리 프로젝트 아이콘 + 트리·간트 스페이스 필터

작업 관리(트리·간트) 뷰에 두 가지를 추가했다. **백엔드 무변경**(노드에 `project { key, name, avatarUrl }` 이 이미 실려 있음), 공용 승격분 외 공용 컴포넌트 수정 0건, `ganttAdapter`/`GanttMapper`/`DropdownJql`/`ProjectFilter` 무수정.

### A. 트리 노드 Jira 프로젝트 아이콘 + 프로젝트 이동 링크

- **`TreeStructurePanel.jsx` (`TreeNodeRow`)**: 이슈 행에 Jira 프로젝트 아바타(16px, `Avatar square xsmall`)를 표시. 사용자 요청대로 **프로젝트 정보 선행** 순서 → `[프로젝트 아바타] [이슈타입 아이콘] [이슈키] [요약]`. 폴더 노드는 project 가 없어 미표시(폴더 아이콘 유지).
  - 아바타 클릭 → `router.open(`${siteUrl}/browse/${project.key}`)` 로 Jira 프로젝트 이동. **노드 선택/DnD 와 분리**: `onClick`/`onMouseDown` 에 `stopPropagation`, `draggable={false}`. 툴팁에 프로젝트명.
  - `avatarUrl` null 이면 `Avatar name=` 기본 글리프로 자리 확보(레이아웃 흔들림 없음).
- **`TreeDetailPanel.jsx`**: 속성 영역의 기존 "Jira 프로젝트" 필드 값을 **클릭 가능한 `ProjectChip`**(아바타 + 이름 + 링크 톤)으로 교체. 클릭 시 동일 이동.
- **신규 `utils/useJiraSiteUrl.js`**: `view.getContext()` 에서 siteUrl 1회 취득(InProgressIssueList 인라인 패턴을 재사용 가능하게 추출). Custom UI iframe 은 `<a href>` 로 못 나가므로 `router.open` 사용(코드베이스 기존 패턴 — `IssueComponent`/`InProgressIssueList`/`FullCalendar`).
- **재사용 판단**: `components/issue/IssueComponent.ProjectComponent` 가 있으나 shape 이 다르다(`avatarUrls['16x16']`/`id` vs 노드의 `avatarUrl`/`key`). 공용 컴포넌트 수정 금지라 인라인으로 패턴만 따랐다.

### B. 트리·간트 스페이스(프로젝트) 멀티필터

1 RMS 프로젝트에 여러 Jira 프로젝트 이슈가 섞이는 구조 대응. **목록 뷰(서버 JQL 필터)는 손대지 않음** — 트리↔간트 공유 필터에만 추가(기존 담당자·상태 필터와 동일 축).

- **공용 승격**: 작업 배정 큐용으로 만든 `ProjectFilterDropdown` 을 `components/filter/ProjectFilterDropdown.jsx` 로 이동(멀티선택 `DropdownMenu` + `DropdownItemCheckbox`). 순수 로직은 신규 `components/filter/projectSpace.js`(`matchesProjectKeys`/`deriveProjectOptions`/`toKeySet`). 두 화면이 **같은 UI·같은 시맨틱(빈 Set=전체, OR)·같은 옵션 shape** 을 공유.
- **상태 소유**: `ProjectWorkPanel` 이 `selectedProjectKeys`(Set) + `toggleProject`/`clearProjects` 를 소유해 tree/gantt 에 공유(담당자·상태와 동일 방식). 목록 뷰 제외.
- **트리(`ProjectTreeView`)**: `tasks` 에서 `deriveProjectOptions` 로 옵션 유도, 기존 담당자/상태 필터의 `tasks.filter` 에 `matchesProjectKeys(task.project?.key, selectedProjectKeys)` 조건 AND 추가. `TreeStructurePanel` 필터 바에 드롭다운(옵션 2개 이상일 때만).
- **간트(`GanttPage`)**: `filter` prop 에 `projectKeys`/`onProjectToggle`/`onProjectClear` 추가(미주입 시 로컬 Set — **하위호환 유지**). 동일 필터 지점에 동일 조건. `GanttToolbar` 에 드롭다운(옵션 2개 이상).
- **폴더 규칙**: 폴더는 `tasks` 에 없고 `toSvarTasks` 가 추가하는 구조 노드다. 이슈 task 기준 필터는 폴더를 직접 건드리지 않고 폴더는 살아남은 자식 이슈로 롤업된다 — **담당자/상태 필터와 완전히 동일한 규칙**(코드·주석으로 고정).
- **옵션 유도는 로드된 노드 데이터에서만**(별도 API 없음).

### C. 옵션에 프로젝트 아바타 (요청 2)

- `deriveProjectOptions` 를 `(items, getKey, getName, getAvatar?)` 로 확장, 옵션 shape 을 **`{ value, label, avatarUrl }`** 로 통일(트리·간트·큐 공용). 아바타는 같은 key 의 **첫 non-null** 값을 채운다(이슈마다 없을 수 있음).
- 트리·간트는 `task.project?.avatarUrl`, 큐는 백엔드 additive `projectAvatarUrl`(§work-assignment 리포트 참조)을 accessor 로 전달.
- `ProjectFilterDropdown` 각 옵션 앞에 `Avatar square xsmall`(16px). `avatarUrl` null 이면 Atlaskit 기본 글리프가 자리를 채워 레이아웃 유지.

### 검증
- `cd static/ui && npm test` → **17 suites / 213 tests 통과**(신규 `projectSpace.test.js` 포함, 폴더 통과 규칙·avatar 유도 고정).
- `cd static/ui && npm run build` → 신규 코드 유래 경고 0.
- i18n: 신규 키 없음 — 공용 드롭다운이 기존 `assignment.queue.project.*` / `assignment.search.empty` 를 재사용(중복 키 방지 지시 준수). merge 불필요.

**신규 파일**: `components/filter/projectSpace.js`, `components/filter/ProjectFilterDropdown.jsx`, `components/filter/__test__/projectSpace.test.js`, `utils/useJiraSiteUrl.js`
**수정 파일**: `pages/projectDetail/work/{ProjectWorkPanel,ProjectTreeView,TreeStructurePanel,TreeDetailPanel}.jsx`, `pages/projectDetail/gantt/{GanttPage,GanttToolbar}.jsx`
