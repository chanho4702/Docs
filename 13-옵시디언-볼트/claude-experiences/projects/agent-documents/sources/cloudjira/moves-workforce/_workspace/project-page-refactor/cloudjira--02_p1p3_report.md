# 프로젝트 관리 페이지 P1→P2→P3 리팩토링 보고서

- 작성일: 2026-07-13 (브랜치 RFC-152)
- 선행: `00_audit.md`(감사) → `01_p0_fix_report.md`(P0) 승인 후 잔여 항목 순차 진행
- 각 단계 완료 시 검증 수행, 전 단계 그린 상태에서만 다음 단계 진입 (테스트 실패 0건)

---

## P1 — 정합/UX

### 1. 목록↔칸반 상호 캐시 무효화 (감사 F-14/F-15)

- `static/ui/src/utils/queryKey/projectKeys.js`
  - `projectPagingQueryKeys.all = ["projects"]` prefix 키 신설 (인라인 `["projects"]` 제거 목적).
  - 공용 헬퍼 신설:
    - `invalidateProjectViews(queryClient)` — projects + kanban 동시 무효화 (프로젝트 데이터 변이용)
    - `invalidateStatusViews(queryClient)` — projectStatus + kanban 동시 무효화 (상태/컬럼 변이용)
- 적용 지점 (3~5분 폴링 의존 제거):
  | 변이 | 위치 | 무효화 |
  |---|---|---|
  | 프로젝트 생성/수정 | ProjectModal saveMutation.onSuccess | invalidateProjectViews |
  | 목록 삭제 | ProjectList deleteProjectMutation.onSuccess | invalidateProjectViews |
  | 칸반 카드 이동 | cardMove onSettled | invalidateProjectViews (목록 상태 컬럼 반영) |
  | 칸반 카드 삭제 | deleteCard onSettled | invalidateProjectViews |
  | 칸반 카드 이름변경 | renameCard onSuccess(성공 시) | invalidateProjectViews |
  | 컬럼 추가 | addColumn onSuccess(성공 시) | invalidateStatusViews |
  | 컬럼 이름변경 | renameStatus onSuccess(성공 시) | invalidateStatusViews |
  | 컬럼 삭제 | deleteColumn onSuccess(성공 시) | invalidateProjectViews + invalidateStatusViews (소속 프로젝트 상태가 이전 상태로 이동하므로 둘 다) |
- ProjectModal이 양쪽을 직접 무효화하게 되면서 칸반의 `onSaved` 콜백(kanban invalidate 중복) 제거.

### 2. Pagination 제어형 전환 (F-16)

- `ProjectList.jsx`: `defaultSelectedIndex={page-1}`(비제어, 최초 마운트만 반영) → `selectedIndex={page-1}`(제어형). 검색으로 `setPage(1)` 시 하이라이트가 데이터와 동기화됨. Atlaskit `@atlaskit/pagination` types의 `selectedIndex` prop 지원 확인 후 적용.
- 부수: 하드코딩 라벨 "Next/Previous/Page" → 기존 키 재사용 `t('common.table.next'/'common.table.prev')` + `common.table.page` 키 신설 (F-24 선반영).

### 3. load more 조건 정리 (F-22)

- 불일치의 실체: `getOldProjectsForKanban`은 상태 무관 `end_date < CURDATE()-7일` 페이징(ProjectRepository.js:110)인데 버튼은 마지막 컬럼 푸터 전용이었음 — 클릭 시 다른 컬럼에도 카드가 삽입됨.
- 해소 방향: **데이터에 UI를 맞춤** — 버튼을 컬럼 푸터에서 꺼내 보드 레벨 우측 상단으로 이동, 라벨을 명시적으로("지난 프로젝트 더보기" / "Load older projects", `projectStatus.kanban.loadMoreOld` 신설). 로드된 카드는 각자의 상태 컬럼으로 들어간다는 의미가 배치와 일치.
- 서버를 마지막 상태로 한정하는 대안은 기각 — 종료일이 지난 진행중(지연) 프로젝트가 영구 미표시되는 부작용 때문. `lastStatusId` 변수는 사용처 소멸로 제거.
- 미해결(의도): `hasMoreOld` 초기값 true라 과거 데이터가 없어도 버튼이 1회 노출됨(클릭 시 사라짐). 초기 로드 응답에 존재 플래그를 넣는 계약 변경은 과잉으로 판단, 보류.

**P1 검증**: merge 성공 · 프론트 테스트 8 suites/73 tests PASS · 빌드 성공.

---

## P2 — 디자인 통일

### 1. 하드코딩 색 → token() (F-17~19)

| 위치 | before | after |
|---|---|---|
| ProjectList.jsx (프로젝트명 링크) | `#0052CC` | `token('color.link')` |
| ProjectKanbanBoard.jsx (로딩 오버레이) | `rgba(255,255,255,0.7)` | `color-mix(in srgb, token('elevation.surface') 70%, transparent)` |
| ProjectModal.jsx (로딩 오버레이) | `rgba(255,255,255,0.4)` | 동일 패턴 40% |
| ProjectKanbanBoard.jsx (프로젝트 추가 점선 버튼) | `#CBD5E1` | `token('color.border')` |
| AddColumnForm.jsx | `#1868DB` 테두리 + **raw 토큰 문자열** `backgroundColor:"color.background.disabled"`(CSS 무효였음) | `token('color.border.focused')` + `token('elevation.surface')` |

### 2. 컬럼 삭제 → 공용 ConfirmModal

- `ProjectKanbanBoard.jsx`: `window.confirm(deleteAlert)` → `deleteColumnTarget` 상태 + P0의 `components/modal/ConfirmModal` 재사용. 제목 키 `projectStatus.kanban.deleteTitle`(상태 삭제/Delete status) 신설, 본문은 기존 `deleteAlert` 재사용. `deleteColumnMutation.onSettled`에서 모달 닫기.

### 3. i18n 하드코딩 정리 (F-24/F-25)

- Pagination Next/Previous/Page → `common.table.*` (P1에서 처리).
- ProjectHeader 새로고침 IconButton `label="refresh"` → `common.button.refresh`("새로고침"/"Refresh") 신설. ButtonGroup aria label도 t()로.
- `locales/kr/common.json` 오타 수정: "장싱적으로" → "정상적으로" (uploadSuccess).
- 의도적으로 안 한 것: ProjectModal DatePicker의 `clearControlLabel`/`openCalendarLabel` 영문 aria 라벨 — 화면 비노출 텍스트로 우선순위 낮음, 키 남발 방지 차원에서 보류(기록).

### 4. 접근성 — button 시맨틱 (F-26)

- KanbanCard 더보기 드롭다운 트리거, 인력/이슈 패널 진입 아이콘 2개: `Box+onClick`(키보드 접근 불가) → Atlaskit `IconButton`(label + isTooltipDisabled={false}로 툴팁 유지). 미사용이 된 `iconButtonStyle` xcss 제거.
- 칸반 컬럼 헤더 더보기 트리거 동일 교체 (ColumnHeader로 이동 후에도 유지).
- 보드 우측 컬럼 추가 IconButton에 누락돼 있던 `label` 부여(`projectStatus.addButton`).

### 5. (추가 요청) ProjectModal 상태 표시 → StatusBadge

- `ProjectModal.jsx`의 상태 Select `formatOptionLabel`: StatusTag(하드코딩 hex 테두리) → **공용 `components/lozenge/StatusBadge`** — 옵션 목록·선택값 렌더 모두 상태 색상이 accent 토큰 쌍으로 반영, 목록·Portfolio와 동일 톤(다크모드 대응). StatusTag import 제거.

### 6. (추가 요청) 목록 검색/액션 UI를 인력 관리 탭 패턴으로

- **타깃 패턴 확인** (`pages/projectDetail/user/ProjectUserPanel.jsx`): 우측 정렬 default-appearance `Button iconBefore={AddIcon}`(Box paddingBlock space.200), 행 액션은 드롭다운 없이 **직접 노출된 아이콘+텍스트 버튼**(`Button iconBefore={DeleteIcon}`). 검색 인풋은 인력탭에 없어 인접 이슈탭 필터(ProjectFilter)의 컴팩트 검색 박스(SearchIcon 내장 + `appearance="none"` + `color.border` 박스)를 준용.
- **before**: 라벨 달린 Form 필드 + Retry 아이콘 + primary 검색 버튼 + primary 추가 버튼 / 액션 컬럼은 "추가 작업" 드롭다운(수정/삭제).
- **after** (`ProjectHeader.jsx` 재작성, `ProjectList.jsx` 액션 셀 교체):
  - 한 줄 구성: [SearchIcon 내장 컴팩트 검색 인풋(placeholder=프로젝트 이름)] [새로고침 IconButton(subtle)] [검색 버튼(default)] … 우측 [프로젝트 추가 `Button iconBefore={AddIcon}`(default)].
  - 액션 컬럼: 드롭다운 제거 → `Inline`에 [수정 EditIcon][삭제 DeleteIcon] 직접 노출 버튼 (인력탭과 동일 형태).
  - **동작 불변**: Form 제출(Enter/검색 버튼) → setSearchParam+1페이지, 권한 없으면 info 토스트, 삭제는 P0 ConfirmModal 경유 — 전부 그대로.
  - 공용화 판단: 검색 인풋 공용 컴포넌트 추출은 하지 않음 — 사용처 2곳의 결합(폼 제출 vs 즉시 JQL 필터)이 달라 무리한 추상화로 판단(스타일 상수만 준용).

**P2 검증**: merge 성공(신규 키 ko-KR/en-US 반영 확인) · 빌드 EXIT=0.

---

## P3 — 구조 (순수 리팩토링, 동작 변경 없음)

### 1. useKanbanMutations 훅 분리 (F-21/D1)

- 신규 `static/ui/src/pages/projectKanban/useKanbanMutations.js` (약 340줄): `withOptimistic` 헬퍼 + 변이 6종(cardMove/addColumn/deleteColumn/deleteCard/renameCard/renameStatus)을 보드에서 **그대로 이동** — useGanttMutations.js 전례(낙관 패치+롤백 패턴 주석) 준수.
- 이동 시 유일한 어댑테이션 2건(동작 동일): 모달 닫기 `setDeleteCardTarget(null)`/`setDeleteColumnTarget(null)` → 훅 옵션 콜백 `onCardDeleteSettled`/`onColumnDeleteSettled` (보드가 동일 setter 전달). P0~P2에서 수정된 success 분기·invalidate 정책은 변경 없이 그대로 이전.
- `ProjectKanbanBoard.jsx`: 727줄 → **333줄** (보드는 조회 쿼리 + 핸들러 + 렌더만 담당).

### 2. hover 리렌더 완화 (F-21)

- 신규 `ColumnHeader.jsx`: 컬럼 헤더(이름 InlineEdit + 삭제 드롭다운)를 컴포넌트로 추출, `hoveredColId`(보드 전역 state) → 헤더 로컬 `hover` state. 컬럼 hover 시 보드 전체 리렌더 → 해당 헤더만 리렌더. KanbanCard의 기존 로컬 hover 패턴과 동일 — **과도한 memo 최적화는 하지 않음**(configMap useMemo화 등 추가 최적화는 실측 근거 없어 보류).

### 3. 데드 코드 제거 (F-29~31, F-34)

- `AddCardForm.jsx` 파일 삭제 (참조 0건 — 한글 하드코딩/무효 토큰 스타일 결함도 함께 소멸).
- `refreshStatus` 46줄 제거 (참조 0건, 부적절한 "추가 성공" 토스트 포함) — console.error 1건도 함께 소멸.
- `lastStatusId` 제거 (P1 load more 이동으로 사용처 소멸).
- 미사용 import/변수 정리: ProjectPage(`useEffect`, `t`+useI18nStore, `queryClient`+useQueryClient), ProjectModal(`Inline`), ProjectList(P0에서 `useMemo`/`kanbanQueryKeys`/`StatusTag` 정리 완료), KanbanCard(`iconButtonStyle`), 보드 재작성으로 미사용 import 전부 소거(Grep로 잔재 0건 확인).
- `toast.FlagUI` 이중 렌더 제거: ProjectList 쪽 삭제 (ProjectPage 렌더 유지 — FlagPortal register 경합 해소).
- 의도적으로 남긴 것: `loadMoreOldProjects`의 `console.error` — 잔재가 아닌 실패 경로 로깅(사용자 피드백 추가는 동작 변경이라 P3 범위 밖, 감사 F-13 Mid로 잔존 기록).

**P3 순수 이동 자가 확인**: 훅 파일은 보드의 P2 시점 코드와 라인 단위 동일(위 콜백 2건만 치환), ColumnHeader는 JSX 동일 + `hoveredColId === column.id` → 로컬 `hover` 치환. 보드에서 `useMutation/withOptimistic/refreshStatus/hoveredColId` 참조 0건 Grep 확인.

---

## 검증 결과 종합

| 단계 | 검증 | 결과 |
|---|---|---|
| P1 | merge + 프론트 테스트 + 빌드 | PASS (73 tests) / 빌드 성공 |
| P2 | merge + 빌드 (신규 키 번들 반영 확인) | PASS / EXIT=0 |
| P3 | 루트 테스트 + 프론트 테스트 + 빌드 | **백엔드 14 suites/219 tests PASS · 프론트 8 suites/73 tests PASS · 빌드 EXIT=0** |
| 공통 | 빌드 로그 src 레벨 ESLint 경고 | 0건 (기존 node_modules 소스맵 경고만) |

## 신규/삭제 파일

- 신규: `pages/projectKanban/useKanbanMutations.js`, `pages/projectKanban/ColumnHeader.jsx` (P0 신규: `components/modal/ConfirmModal.jsx`, `components/lozenge/StatusBadge.jsx`)
- 삭제: `pages/projectKanban/AddCardForm.jsx`

## 의도적으로 하지 않은 것 (과잉 방지)

1. 검색 인풋 공용 컴포넌트화 — 사용처 2곳의 동작 모델(폼 제출 vs 즉시 필터)이 달라 추상화 이득 없음.
2. `hasMoreOld` 초기값 정확화 — 초기 로드 응답 계약 변경 필요, 노출 1회 후 자가 수정되는 Low라 보류.
3. configMap/renderListFooter memo화 — 실측 근거 없는 선최적화 배제 (코디네이터 지침).
4. DatePicker aria 라벨 번역, ProjectFilter의 `#fff` 아이콘색 — 비노출/타 화면 범위.
5. 칸반 초기 로드 페이징(F-36), KanbanBoard 90vh 하드코딩(F-B3) — 감사 P3 외 항목, 별도 과제.

---

## 후속 반영 — 프로젝트 목록 UI 사용자 피드백 (2026-07-13)

P2에서 만든 형태에 대한 사용자 피드백을 **목록 페이지 한정**으로 반영 (다른 테이블 미변경).

### 1. 액션 컬럼
- 헤더 라벨: `project.list.head5` kr "추가 작업"→**"작업"**, en "Extra Action"→**"Actions"** — 이 키의 사용처는 ProjectList 헤더 1곳뿐임을 grep으로 확인(인력관리·이슈 테이블은 별도 키라 영향 없음).
- P2의 [수정][삭제] 직접 노출 버튼 → **"…"(more) 드롭다운 하나로 통일** (`ProjectList.jsx` extra 셀): 칸반 카드/컬럼 헤더와 동일 컨벤션 — `DropdownMenu` + `IconButton(ShowMoreHorizontalIcon, subtle/compact, 툴팁)` 트리거, 메뉴 [수정] / [삭제(tone="danger")].
- 수정 = 기존 모달 열기, 삭제 = 기존 ConfirmModal 플로우 그대로.
- 권한: `canWrite('PROJECT')` 아니면 "…" 버튼 자체 미노출. 핸들러 내부 권한 가드(토스트)는 방어선으로 유지.

### 2. 검색 박스 (`ProjectHeader.jsx` 재작성)
- 검색 버튼·새로고침(Retry) 버튼·Atlaskit Form/Field 제거 → 제어형 인풋 단독 구성.
- **300ms 디바운스 자동 검색**: 기존 `utils/useDebounce` 재사용 — debounced 값 변경 시 `setSearchParam` + `setPage(1)` (제어형 Pagination 정합). 마운트 시 '' 적용은 초기 searchParam과 동일 쿼리키라 불필요 refetch 없음.
- **Enter 즉시 검색** 유지(디바운스 대기 생략).
- **초기화 = 인풋 내 X(clear)**: 값이 있을 때만 `elemAfterInput`에 CrossIcon IconButton 노출(코드베이스 CrossIcon 관례 준용), 클릭 시 즉시 전체 목록 복귀. 신규 키 `common.button.clear`("지우기"/"Clear").
- 정리: P2에서 추가했던 `common.button.refresh` 키는 사용처 소멸로 kr/en에서 제거(고아 키 방지).

### 검증 (후속 반영)
- merge 성공 — 번들 확인: head5 "작업"/"Actions", `common.button.clear` 반영, refresh 키 제거.
- 프론트 테스트 8 suites / 73 tests PASS · 빌드 EXIT=0 · src 레벨 경고 0건.

## 참고 — 워킹트리의 범위 외 변경

`git status`에 본 작업이 건드리지 않은 파일 5건의 수정이 존재: `pages/projectDetail/gantt/useGanttMutations.js`, `pages/projectDetail/issue/ProjectIssueTable.jsx`, `utils/jiraApi/requestJira.js`, `utils/jiraApi/useJiraEditGuards.js`, `utils/queryKey/jiraKeys.js` (+ `.gitignore`, 기존 미추적 md 2건). 병행 작업분으로 보이며 본 보고서 범위에 포함되지 않음 — 커밋 시 분리 확인 필요.
