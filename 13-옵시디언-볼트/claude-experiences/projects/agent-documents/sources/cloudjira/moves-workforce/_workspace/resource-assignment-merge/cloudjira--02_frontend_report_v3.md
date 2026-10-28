# 자원관리 배정 탭 3단 구조 개편 — 프론트엔드 리포트 (v3)

- **일자**: 2026-07-23
- **브랜치**: RFC-160
- **입력**: `00_input/requirement_v3_3col.md` / 직전 상태 `02_frontend_report_v2.md`
- **범위**: 프론트 전용. board/pool/overview 훅·mergeMatch.js·백엔드 무수정.

---

## 1. 변경 파일 목록

| 파일 | 변경 |
|---|---|
| `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx` | 좌우 2분할(좌 = 카드목록+상세 세로스택) → **[좌 카드목록 \| 중 상세 \| 우 인원] 3열 가로 배치**. 공통 카드 프레임 상수 `PANEL_FRAME` 도입. 미선택 시 중간 칼럼 미렌더(2단). |
| `static/ui/src/pages/resource/assignment/people/CompanyResourceTable.jsx` | 배정 버튼 `isDisabled`에 `isMember`(선택 프로젝트에 이미 배정) 추가 + 비활성 사유 툴팁. |
| `static/ui/src/pages/resource/assignment/detail/ProjectDetailPanel.jsx` | `bare` prop 추가(최소 조정) — 3단에서 부모 칼럼 프레임이 border/배경/패딩을 제공하므로 자체 프레임 제거. 내부 로직·헤더 무변경. |
| `locales/kr/resource.json` · `locales/en/resource.json` | `resource.assignment.people.alreadyAssigned` 키 추가. |
| `locales/ko-KR.json` · `locales/en-US.json` | `npm run merge` 산출물(직접 수정 아님). |

제약 준수: board/pool/overview 훅·`mergeMatch.js`·`patchProjectMetric.js`·`buildAssignedRoster.js`·공용 컴포넌트 전부 무수정. 새 데이터 소스 없음(`row.match.isMember` 기존 hydrate 소비).

---

## 2. 레이아웃 구조 (3단 flex 배분)

외곽 컨테이너(무변경): `display:flex; gap:16; alignItems:stretch; height:78vh(PANEL_HEIGHT); minHeight:480(PANEL_MIN_HEIGHT); overflow:hidden`.

| 칼럼 | flex | 폭 | 내용 | 렌더 조건 |
|---|---|---|---|---|
| 좌 | `0 0 320px` (minWidth 280) | 고정 | `ProjectCardList` (sticky 헤더/필터 + 스크롤 리스트, height:100%) | 항상 |
| 중 | `0 0 340px` (minWidth 300) | 고정 | `ProjectDetailPanel bare` (내부 `flex:1; overflowY:auto; minHeight:0` 스크롤) | **`selectedCard` 있을 때만** |
| 우 | `1 1 0` (minWidth 0) | 가변 확장 | 헤더("전사 인력 · 프로젝트명" + selectPrompt) + `CompanyResourceTable` 스크롤 영역 | 항상 |

- **미선택 = 2단**: 중간 칼럼 미렌더 → 우측(`flex:1 1 0`)이 남는 폭을 흡수해 자연 확장. 선택 시 340px 중간 칼럼이 삽입되며 3단으로 확장.
- **공통 카드 프레임** `PANEL_FRAME`(상수 1회 정의, 세 칼럼 동일):
  `display:flex; flexDirection:column; minHeight:0; overflow:hidden; background: token('elevation.surface','#fff'); border: 1px solid token('color.border','#DFE1E6'); borderRadius:8; boxShadow: token('elevation.shadow.raised',…); padding:12`.
  프레임 배경을 `elevation.surface`로 둔 이유 = 좌/우 칼럼 내부 sticky 헤더가 이미 `elevation.surface`를 쓰므로 스크롤 시 색 이음새가 seamless.
- 각 칼럼 내부 스크롤은 `minHeight:0 + overflowY:auto` 유지.
- **중간 칼럼 헤더**: `ProjectDetailPanel` 자체가 상단에 `{name} · 작업 현황` 타이틀 헤더를 이미 렌더 → 별도 헤더 추가 불필요. `bare` prop으로 이중 border만 제거.
- 우측 헤더의 "· 프로젝트명" 표시와 `selectPrompt` 문구는 그대로 유지.

---

## 3. 배정 버튼 비활성 조건 (최종 코드)

`CompanyResourceTable.jsx`:

```js
// 이미 선택 프로젝트에 배정된 인력(match.isMember)은 배정 버튼 비활성
const isMember = selected && match?.isMember === true;
const assignReason = !selected
    ? t('resource.assignment.people.selectPrompt')
    : !canAssign
        ? t('assignment.action.noWritePermission')
        : isMember
            ? t('resource.assignment.people.alreadyAssigned')
            : null;
...
<Button
    appearance="primary"
    spacing="compact"
    isDisabled={!selected || !canAssign || isMember || busyAccountId === p.accountId}
    ...
```

- `match`는 기존 `const match = p.match;`(hydratePeople 결과, 선택 전 null). `isMember`는 **선택 상태 + `match.isMember === true`**일 때만 참 → 선택 전엔 `!selected` 경로가 우선이라 무영향.
- 기존 조건(`!selected`, `!canAssign`, `busyAccountId`) 동작·우선순위 그대로 유지. 툴팁 사유 우선순위: 미선택 → 권한없음 → **이미배정** → (없음).
- 사유가 있으면 기존 `assignReason` 툴팁 패턴(147행 근처)이 그대로 새 문구를 렌더.

---

## 4. 추가한 i18n 키

`locales/kr/resource.json` · `locales/en/resource.json` — `assignment.people` 하위:

| 키 | ko | en |
|---|---|---|
| `resource.assignment.people.alreadyAssigned` | 이미 배정된 인력입니다 | Already assigned to this project |

- ko-KR.json/en-US.json 직접 수정 없음. `npm run merge`로 생성.

---

## 5. 실행 결과

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm run merge` | 성공. `ko-KR.json:2076` / `en-US.json:2076`에 `alreadyAssigned` 반영 확인. |
| `npm test -- --testPathPattern=assignment` (CI) | **7 suites / 102 tests 통과** (mergeMatch·patchProjectMetric·projectDesign·candidateFilter·queueFilter·patchAssignmentCache·workloadState). 회귀 0. |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 경고 3건(analytics-next-stable-react-context, marklassian)뿐, **변경 코드 유래 경고 0**. 빌드 산출 정상. |

---

## 6. 소비 shape (verifier 교차 비교용, 무변경)

- `row.match.isMember`(boolean|해당없음) — `mergeMatch.hydratePeople` → `MatchInfo` 서브객체. 선택 전 `row.match === null`. **기존 hydrate 소비만, 새 조회·재계산 없음.**
- 중간 칼럼 `ProjectDetailPanel`은 `board.projectLoad`·`board.queue`·`people`·N2 `metric`으로만 조립(추가 invoke 0) — v2 계약 그대로.
- 계약 위반 없음. invalidate 경계·신호 재계산 금지·board/pool/assign 무변경 유지.

---

## v3.1 — 사용자 피드백 4건 (2026-07-23, 추가)

직전 v3(커스텀 PANEL_FRAME div 3개) 위에 사용자 피드백 4건 반영. **board/pool/overview 훅·mergeMatch.js·백엔드·정렬/조인 로직 무수정.**

### 변경 파일

| 파일 | 변경 |
|---|---|
| `pages/resource/assignment/ProjectAssignmentBoard.jsx` | 커스텀 `PANEL_FRAME` div 3개 → **공용 `Card` 3개**로 교체(제목+건수 헤더 / 좌 검색 headerRight). rows useMemo에 **isMember 제외 filter** 추가. Card 제목 노드(projectsTitle/detailTitle/peopleTitle) 도입. |
| `pages/resource/assignment/projects/ProjectCardList.jsx` | 자체 제목/검색/내부 스크롤 div 제거 → Card 본문 콘텐츠로 평탄화(sticky 필터 바 + 리스트, 스크롤은 Card 본문 하나). WorkQueuePanel 패턴. |
| `pages/resource/assignment/projects/ProjectFilterBar.jsx` | `showSearch` prop 추가(false 시 검색 입력 미렌더 — 검색이 Card 헤더로 이관됨). |
| `pages/resource/assignment/detail/ProjectDetailPanel.jsx` | bare 모드에서 자체 제목 제거(Card 소유) + column flex 채움. roster 리스트 `maxHeight:220` 제거 → `flex:1, minHeight:0, overflowY:auto`(중간 칼럼 남는 높이 전부 차지, 스크롤 1곳). roster에 **windowing** 적용. |
| `pages/resource/assignment/people/CompanyResourceTable.jsx` | isMember 비활성/`alreadyAssigned` 툴팁 **제거**(rows에서 제외되어 도달 불가). rows에 **windowing** 적용, sentinel을 테이블 아래 배치. |
| `utils/useInfiniteSlice.js` (신규) | 스크롤 점진 로딩 훅 + 순수 헬퍼 `computeNextCount`. |
| `utils/__test__/useInfiniteSlice.test.js` (신규) | `computeNextCount` 순수 로직 3케이스. |
| `locales/kr/resource.json` · `locales/en/resource.json` | v3에서 넣은 `resource.assignment.people.alreadyAssigned` **제거** 후 `npm run merge` 재실행. |

### 피드백 1 — 패널 시각 언어 통일 (공용 Card)

- `AssignmentPage.jsx` / `WorkQueuePanel.jsx` 참고: 세 칼럼 모두 공용 `components/card/Card.jsx` 사용. Card = `elevation.surface` 배경 + border + radius 10 + `elevation.shadow.raised`, 헤더(제목+건수 / headerRight)와 구분선은 스크롤 밖, 본문(contentStyle: `overflow:auto`)만 스크롤.
- **좌 Card**: title=`배정 대상 프로젝트 {visible}/{total}`, headerRight=`SearchInput`(재사용), 본문 = ProjectCardList(sticky 상태필터+토글 → 리스트). 검색/제목 중복 제거.
- **중 Card**: title=`{name} · 작업 현황`(detail.title), 본문 = `ProjectDetailPanel bare`.
- **우 Card**: title=`전사 인력 {rows.length}{· projectName}` + 로딩 스피너, 본문 = selectPrompt(미선택 시) + CompanyResourceTable.
- 칼럼 flex(3열 감안 조정): 좌 `1 1 340px / maxWidth 440 / minWidth 300`, 중 `1 1 320px / maxWidth 400 / minWidth 300`(선택 시만), 우 `3 1 520px / minWidth 0`. 각 칼럼 래퍼 `overflow:hidden`, Card `height:100%`(AssignmentPage 방식 그대로).

### 피드백 2 — 배정 인원 박스 높이 확대

- `ProjectDetailPanel` bare: 외곽 `display:flex; flexDirection:column; height:100%`, 로딩 외 본문도 `flex:1; minHeight:0; column`. 작업 요약 타일/roster 헤더는 `flexShrink:0`, **roster 리스트 = `flex:1; minHeight:0; overflowY:auto`**(maxHeight 220 제거) → 중간 칼럼 남는 높이 전부 차지.
- **이중 스크롤 방지**: 중간 Card 본문은 `ProjectDetailPanel`이 높이를 꽉 채워 넘치지 않으므로 실제 스크롤은 roster 리스트 1곳에서만 발생.

### 피드백 3 — 이미 배정된 인력 전사 목록에서 제외 (비활성 → 제외)

- **위치 = `ProjectAssignmentBoard.jsx` rows useMemo** (mergeMatch.js 무수정, 컴포넌트에서 filter):
  ```js
  const hydrated = sortHydratedRows(hydratePeople(people, matchMap, selected), selected);
  return selected ? hydrated.filter((r) => r.match?.isMember !== true) : hydrated;
  ```
  미선택 시 전원 표시 유지. 우측 Card 건수(`rows.length`)는 제외 적용 후 기준.
- `CompanyResourceTable`의 isMember 비활성 조건·`alreadyAssigned` 툴팁 분기 제거(`!selected`/`!canAssign`/`busy`는 유지). i18n 키 제거 + merge 재실행(ko-KR/en-US grep 0 확인).

### 피드백 4 — 스크롤 기반 점진 로딩(windowing)

- 공용 훅 `utils/useInfiniteSlice(items, {initial, step})` — 처음 N개만 렌더 → 리스트 하단 `sentinelRef` div를 `IntersectionObserver`(root=viewport; 중간 스크롤 컨테이너 클리핑 자동 반영, rootMargin 240px 프리페치)로 감지 → 보이면 step개씩 추가. 의존 배열(items) 변경 시 슬라이스 리셋. `IntersectionObserver` 미정의(jsdom) 가드 → 테스트 안전.
- **적용 1 — roster**: `useInfiniteSlice(roster, {initial:20, step:20})`, sentinel은 v3.1의 `flex:1` roster 리스트(스크롤 컨테이너) 안. 헤더 `배정 인원 {roster.length}명`은 전체 기준 유지.
- **적용 2 — 전사 인원**: `useInfiniteSlice(rows, {initial:30, step:30})`. CommonTable/DynamicTable은 **페이지네이션(rowsPerPage)만** 제공하고 스크롤 API가 없어 windowing으로 대체 — `rowsPerPage={Math.max(tableRows.length,1)}`로 페이지 분할 비활성, sentinel은 테이블 아래(우측 Card 본문 스크롤 컨테이너 안). `tableRows`는 `visibleRows` 위에서만 map(전량 map 방지).
- 정렬(sortHydratedRows)·조인은 무수정, 그 결과 위에서 슬라이스만. 헤더 건수는 전체 기준.

### 검증

| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공. `alreadyAssigned` ko-KR/en-US grep 0(제거 확인). |
| `npm test --testPathPattern="assignment\|useInfiniteSlice"` (CI) | **8 suites / 105 tests 통과**(신규 useInfiniteSlice 3건 포함). |
| `npm test` (전체) | **20 suites 통과 / 232 tests 통과**. 실패 1건 = `projectDetail/issue/workListQuery.test.js` — **본 작업과 무관·기존 이슈**(`@forge/bridge` 미목업으로 import 시점 크래시, 내가 건드리지 않은 파일). |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵 3건뿐, 변경 코드 유래 경고/에러 0. (초기 `react-hooks/exhaustive-deps` 미등록 규칙 참조 eslint 에러 → 해당 disable 주석 제거로 해결.) |

### 소비 shape (무변경)

- `row.match.isMember`로 제외 filter, `board.projectLoad`⋈`people`로 roster — 기존 hydrate/조인만 소비. windowing은 순수 렌더 슬라이스라 데이터 계약 무영향. invalidate 경계·신호 재계산 금지 유지.

---

## v3.2 — 프로젝트 카드 색/상태 색 수정 (2026-07-23, 추가)

사용자 피드백: "프로젝트 카드 색이랑 상태 색... 다른 페이지랑 다르고, 색도 안 보임." 원인 확인 후 `ProjectCard.jsx`만 수정(단일 파일, JSX 스타일/import 교체).

### 변경 파일
| 파일 | 변경 |
|---|---|
| `pages/resource/assignment/projects/ProjectCard.jsx` | 상태 pill → 공용 `components/lozenge/StatusBadge` 교체 / 선택·호버 표시 → 표준 selected 토큰. `theme` 의 tealBorder·tealTint import 제거. |

### 1. 상태 pill 안 보임 버그 → 공용 StatusBadge
- **원인**: 백엔드 `statusColor` 는 hex 가 아니라 상태 엔티티 **색상명**(COLOR_OPTIONS value, 예 "blueLight"). 기존 카드가 이를 `background: card.statusColor`(유효하지 않은 CSS 색 → 투명) + `color:#fff` 로 칠해 → 투명 배경 + 흰 글자 = 안 보임.
- **수정**: 자체 pill span 삭제 → `<StatusBadge label={card.statusName} color={card.statusColor} />`. 공용 StatusBadge 가 색상명 → Atlaskit accent 토큰(bg subtlest + text accent)으로 매핑(다크모드 대응). ProjectList·Portfolio 등 다른 페이지와 동일 방식.

### 2. 선택/호버 색 → 표준 selected 토큰
- WorkQueueItem 패턴으로 통일: 선택 시 `borderColor: var(--ds-border-selected, #388BFF)` + `borderLeftWidth 3` + `background: var(--ds-background-selected, #E9F2FF)`, 평시 `var(--ds-border)` / `var(--ds-surface)`.
- 선택 boxShadow ring 도 teal → `0 0 0 1px var(--ds-border-selected, #388BFF)`. hover 리프트(box-shadow overlay + translateY -1px)는 유지.
- `theme.js` 의 tealBorder/tealTint import 제거(카드 선택/호버 전용). **`tealFill`(ProjectDetailPanel 진행바)은 무수정** — grep 으로 teal 사용처 확인(tealBorder/tealTint 는 ProjectCard 전용, tealFill 은 ProjectDetailPanel 전용) 후 ProjectCard 만 교체. theme.js 파일은 tealFill 이 남아 유지.

### 검증
| 명령 | 결과 |
|---|---|
| `npm test --testPathPattern=assignment` (CI) | **7 suites / 102 tests 통과**(스타일 교체라 로직 테스트 무영향). |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵만, ProjectCard teal 잔여 참조 grep 0, 미사용 import 0. |

---

## v3.3 — 배정할 작업 없을 때 프로젝트 인력 배정 폴백 (2026-07-23, 추가)

사용자: "프로젝트에 배정할 작업이 없으면 그냥 프로젝트 배정으로 해." 인원 행 [배정] 클릭 시, 선택 프로젝트에 배정 가능한 작업이 0건이면 작업 선택 모달 대신 프로젝트 인력(project_users)으로 배정하는 폴백을 추가.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `pages/resource/assignment/ProjectAssignmentBoard.jsx` | [배정] 클릭 분기(`handleAssignClick`) + 프로젝트 인력 배정 확인 모달/핸들러(`confirmAddMember`) + 탭 전용 toast(`ToastFlags`) 추가. |
| `locales/kr/resource.json` · `locales/en/resource.json` | `resource.assignment.member.*`(title/body/success/error/unregistered) 추가 → `npm run merge`. |

### 분기 기준
- `handleAssignClick(p)`: **`!board.isLoading && (board.queue?.length ?? 0) === 0`** 이면 `setMemberTarget(p)`(인력 배정 폴백), 아니면 기존 `setPickerTarget(p)`(WorkPickerModal).
- 기준 = **board.queue(배정 가능 작업 소스)가 비었을 때**. WorkPickerModal 이 작업을 고르는 소스가 board.queue 이고, 비어 있으면 고를 작업이 없다. board 로딩 중에는 안전하게 picker 로 폴백(오판 방지).
- **배정 가능 작업이 있는 경우 기존 WorkPickerModal 흐름은 완전 무변경.**

### invoke shape (기존 resolver 재사용 — 신규 resolver 없음)
- `invoke('insertProjectusers', { project_id: selectedProjectId, jiraUser: [{ value: person.accountId }] })` — `UserAddModal.jsx` 14행 호출 shape 그대로(`jiraUser` = JiraUserSelect value 배열 `[{value}]`).
- 프론트 게이트: 기존 `canAssign = canWrite('PROJECT') || canWrite('RESOURCE_MANAGEMENT')` 그대로([배정] 버튼 노출/활성 조건). 백엔드 권한 OR 확장은 backend-engineer 처리.

### 캐시 처리
- **project_users 는 SQL write → Jira 인덱스 지연 무관** → 성공 시 해당 프로젝트 `assignmentKeys.board(id)` + `assignmentKeys.pool(id)` **invalidate 허용**(assign 경로의 invalidate 금지 규약과 별개 — 그건 Jira search/jql 인덱스 지연 때문). 재조회로 `isMember` 갱신 → 해당 인원이 전사 인력 rows 에서 **자동 제외**(v3.1 selected 필터) + 배정 인원 명단(ProjectDetailPanel roster)에 등장.
- **카드 지표(unassignedCount 등) 패치 불필요** — 작업(이슈) 변동이 없으므로 N2 metrics 무영향.
- 토스트: 성공 `member.success` / 실패 `member.error` / `UNREGISTERED_USER`(백오피스 미등록) → `member.unregistered`. `/resource` 라우트엔 toast 프롭이 없어 탭 전용 `ToastFlags()` 인스턴스를 두고 `{toast.FlagUI}` 렌더(App.jsx 와 동일 패턴, 훅이라 최상위 호출).
- 확인 모달 = 공용 `components/modal/ConfirmModal`(AssignmentPage 패턴), `assignment.confirm.yes/no` 재사용, appearance="warning", 진행 중 닫기 차단(memberBusy).

### 검증
| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공. member 키 ko-KR/en-US 반영 확인. |
| `npm test --testPathPattern="assignment\|useInfiniteSlice"` (CI) | **8 suites / 105 tests 통과**(회귀 0). |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵만, 변경 코드 유래 경고/미사용 import 0. |

---

## v3.4 — 중간 카드 배정 인원 명단 누락 버그 수정 (2026-07-24)

사용자: "프로젝트 배정하면 중간 카드에 배정 인원 떠야 하는데 안 뜬다."

### 원인
`buildAssignedRoster` 가 `board.projectLoad` 만 기반으로 명단을 만들었다. `projectLoad` 는 백엔드 `WorkAssignmentService.aggregateProjectLoad(pass.issues)` — **프로젝트 이슈의 담당/협업자 집계**라 사실상 "이슈 참여자" 목록이다. 따라서 이슈를 하나도 배정받지 않은 인원(특히 v3.3 `insertProjectusers` 폴백으로 방금 추가된 신규 멤버)은 board 를 invalidate/재조회해도 projectLoad 에 없어 명단에서 빠졌다. 명단이 "프로젝트 멤버"가 아니라 "이슈 참여자"였던 것.

### 수정 (프론트 전용, 백엔드 무수정)
- **프로젝트 멤버 정체성**은 `board.candidates`(isMember=true 후보, `useWorkAssignmentBoard` 가 `candidates: data?.candidates` 로 노출)에 있다 → 이를 명단 기반에 추가.
- `buildAssignedRoster(memberCandidates, projectLoad, people)` 로 시그니처 확장.
- **행 집합 = `memberCandidates` accountId ∪ `projectLoad` accountId (Map dedup)** — 멤버인데 이슈 없는 사람도, 멤버 아닌데 이슈 참여한 사람(Z)도 모두 포함.
- 각 행: 정체성(displayName/avatar/role/level) = **people 우선 → candidate 폴백 → accountId**(candidate 에도 이 필드 존재, mergeMatch.js 주석 근거). 수치 = projectLoad 조인(없으면 0/null — 신규 멤버는 0건).
- 정렬 유지(assignedCount desc → 이름). 헤더 `roster.length` 는 자연히 멤버 포함 수.

### 배선
| 파일 | 변경 |
|---|---|
| `assignment/buildAssignedRoster.js` | 시그니처 3인자 + 멤버∪이슈참여자 합집합, candidate 정체성 폴백. docblock 갱신. |
| `assignment/detail/ProjectDetailPanel.jsx` | `memberCandidates` prop 추가 → `buildAssignedRoster(memberCandidates, projectLoad, people)` + useMemo 의존성. |
| `assignment/ProjectAssignmentBoard.jsx` | `<ProjectDetailPanel memberCandidates={board.candidates} … />` 연결(`useWorkAssignmentBoard` 반환 필드명 확인). |
| `assignment/__test__/projectDesign.test.js` | 3인자 시그니처로 케이스 갱신 + **"멤버인데 projectLoad 에 없는 인원 0건 포함"** / dedup 테스트 추가. |

### 연결 흐름 (v3.3 폴백 → 이 수정)
폴백 배정(insertProjectusers) → `assignmentKeys.board(id)` invalidate → 재조회로 `board.candidates` 에 신규 멤버 포함 → 합집합 roster 에 0건 수치로 즉시 표시.

### 검증
| 명령 | 결과 |
|---|---|
| `npm test --testPathPattern="assignment\|useInfiniteSlice"` (CI) | **8 suites / 107 tests 통과**(roster 케이스 +2: 0건 멤버 포함·dedup). |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵만, 변경 코드 유래 경고 0. |

---

## v3.5 — 프로젝트 배정 취소 (2026-07-24)

사용자: "할당 취소도 가능하게 해줘." 중간 카드 배정 인원 명단 행에서 프로젝트 배정(멤버십) 취소.

### 백엔드 계약 (backend v3.5, `02_backend_report_v3.md`)
- `invoke('removeProjectMemberByAccount', { project_id, accountId })` — payload 키 정확히 **`project_id`**(inherited scope 검증).
- 성공: `{ success: true, project_id, accountId, removed: true }` (content 래핑 없음).
- 실패: `{ success: false, error: { code: 'USER_NOT_FOUND', ... } }` — **분기는 `res.success === false` 로만**.
- 시맨틱: **멤버십(project_users)만 제거**, 이슈 담당/협업은 유지. 권한 = insertProjectusers 와 동일 OR.

### isMember 플래그 규칙 (buildAssignedRoster)
- v3.4 합집합 roster 에는 "멤버 아닌 이슈 참여자" 행도 있다(project_users 행 없음 → 취소 불가).
- 각 행에 **`isMember: candMap.has(accountId)`** 추가 = **멤버 후보(board.candidates) 유래 여부**. 이슈만 참여한 계정(candMap 미포함)은 false.
- 배정 취소 버튼은 **`canAssign && row.isMember`** 일 때만 노출 → 취소 불가 행엔 안 뜬다.
- 테스트: "isMember: 멤버 후보 유래는 true, 이슈만 참여한 계정(Z)은 false" 추가.

### 변경 파일
| 파일 | 변경 |
|---|---|
| `assignment/buildAssignedRoster.js` | roster 행에 `isMember` 플래그 추가. docblock 갱신. |
| `assignment/detail/ProjectDetailPanel.jsx` | `canAssign`/`onRemoveMember` prop + 명단 행에 [배정 취소] 버튼(`canAssign && r.isMember`, subtle compact, `marginLeft:auto` 우측 정렬). |
| `assignment/ProjectAssignmentBoard.jsx` | `removeTarget`/`removeBusy` 상태 + `confirmRemoveMember`(invoke) + danger ConfirmModal(assignedCount>0 경고). ProjectDetailPanel 에 canAssign/onRemoveMember 전달. |
| `assignment/__test__/projectDesign.test.js` | isMember 플래그 테스트 추가. |
| `locales/kr\|en/resource.json` | `member.remove/removeTitle/removeBody/removeWarn/removeSuccess/removeError` 추가 → `npm run merge`. |

### 소비 shape / 캐시
- 소비 = roster 행의 `accountId`(removeProjectMemberByAccount payload) + `assignedCount`(경고 문구 분기) + `isMember`(버튼 노출) + `displayName`(모달 문구). 서버 응답은 `res.success` 만 소비(content 래핑 없음 계약과 정합).
- 성공 시 `assignmentKeys.board(id)` + `assignmentKeys.pool(id)` invalidate(SQL 멤버십 → 인덱스 지연 무관). 재조회로 `board.candidates` 에서 빠짐 → roster 에서 사라지고, isMember 갱신으로 전사 인력 rows 에 재등장. v3.3 폴백과 동일 구조(ProjectAssignmentBoard 에 모달/mutation, 콜백 전달).
- 토스트: 기존 탭 전용 `ToastFlags` 재사용 — removeSuccess/removeError. danger 모달 + `assignment.confirm.yes/no` 재사용.

### 검증
| 명령 | 결과 |
|---|---|
| `npm test --testPathPattern="assignment\|useInfiniteSlice"` (CI) | **8 suites / 108 tests 통과**(isMember +1). |
| `npm run build` | **Compiled with warnings** — 기존 node_modules 소스맵만, 변경 코드 유래 경고 0. |
