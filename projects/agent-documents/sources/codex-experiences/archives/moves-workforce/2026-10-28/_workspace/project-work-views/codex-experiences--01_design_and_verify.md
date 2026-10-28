# 프로젝트 상세 — 작업 그룹 뷰 전환 (project-work-views)

사용자 결정(2026-07-22): "그룹 내에서 뷰 전환으로 가자" + "트리는 좌측 구조 / 우측 상세 구조로".

## 1. 무엇을 바꿨나

### 탭 구조
```
before                              after
├ 작업 관리      (탭)               ├ 작업 관리 (탭)  ← 그룹
├ 작업 이력      (탭)               │    └ 뷰 전환: [목록 | 트리 | 간트]
├ 프로젝트 캘린더 (탭)               ├ 프로젝트 캘린더 (탭)
├ 간트          (탭)               └ 분석 및 리포트 (드롭다운 그룹)
└ 분석 및 리포트 (드롭다운 그룹)          … + 작업 이력  ← 이동
```

- **작업 이력을 작업 그룹에 넣지 않았다.** 이건 이슈 목록의 다른 표현이 아니라 시간축 분석
  (번업 + scope creep 인사이트)이고, 코드 주석에도 "번업/인사이트는 프로젝트 전체 기준 유지(필터 무관)"로
  명시돼 있다. 뷰 전환에 섞으면 "같은 걸 다르게 본다"는 약속이 깨지므로 분석 리포트로 옮겼다.
- 최상위 탭 4개(대시보드/인력/작업/캘린더) + 분석 그룹으로 정리됐다.

### 신규 파일
| 파일 | 역할 |
|---|---|
| `projectDetail/work/ProjectWorkPanel.jsx` | 뷰 셸 — 토글 + 공유 필터 소유 + 권한 게이트 |
| `projectDetail/work/ProjectTreeView.jsx` | 트리 뷰 — 좌: 계층 / 우: 선택 노드 상세 |
| `projectDetail/work/buildWorkTree.js` | 평면 SVAR 노드 → 트리/평탄화 (순수 함수) |
| `projectDetail/work/buildWorkTree.test.js` | 위 함수 테스트 11건 |

### 수정
- `constants/tabs.js` — 그룹 재구성, `canReadGantt` 인자 제거(셸이 직접 읽음)
- `components/tabs/ProjectDetailTabs.jsx` — 인자 시그니처 동기화
- `gantt/GanttPage.jsx` — `filter` prop(선택) 추가. 미주입 시 내부 state (기존 동작 하위호환)

## 2. 설계 판단

### 트리는 간트 데이터/계층을 그대로 소비한다
`useGanttData` + `toSvarTasks`를 재사용한다. 계층 규칙(이슈 부모 > 폴더 소속 > 루트)은 이미
`ganttAdapter`가 결정하므로 트리에서 **다시 해석하지 않는다** — 두 뷰가 서로 다른 트리를 그리는
사태를 원천 차단하기 위함. 트리는 `parent` 참조로 중첩만 만든다.

### 트리는 읽기 전용
편집(일정/담당자/폴더)은 간트가 담당한다. 편집 경로를 두 벌 유지하면 낙관 패치와 토스트 배칭
로직이 갈라진다 — 간트는 이미 인덱스 지연 대응 낙관 패치를 쓰고 있어 특히 위험하다.

### 필터 공유는 tree ↔ gantt 만
셸이 담당자·상태 필터를 소유해 두 뷰가 공유한다(뷰를 바꿔도 맥락 유지 = 뷰 전환의 실질).
목록 뷰는 `ProjectFilter` → **서버 JQL** 기반이라 필터 축 자체가 달라 공유하지 않는다.
억지로 합치면 JQL 생성과 클라이언트 필터가 뒤섞인다.

### 권한
tree/gantt 는 둘 다 `getProjectGanttData`(R('PROJECT_GANTT'))를 쓰므로 같은 게이트를 건다.
권한이 없으면 토글에서 항목을 빼고, **남는 항목이 하나면 토글 자체를 감춘다** —
선택지 하나짜리 전환 UI가 고장처럼 보이는 것을 피하기 위함.
권한 정책(PROJECT_GANTT 분리)은 **바꾸지 않았다** — 서버 가드까지 걸린 결정이라 임의 변경 대상이 아니다.

## 3. 검증

| 항목 | 결과 |
|---|---|
| 프론트 jest | **85 passed** (기존 74 + buildWorkTree 11) |
| 프론트 build | 성공, 신규 경로 경고 0 |
| i18n | `projectDetail.work.*` 추가 후 merge, work 폴더 t() 키 전수 검증 — 누락 0 |
| 아이콘 | list-bulleted/folder-closed/chevron-* /timeline/table 존재 확인 |

### 회귀 점검
- `CommonTab`은 활성 탭을 로컬 `useState`로만 관리 → 딥링크/영속 상태 없음.
  탭 key 재배치로 인한 진입 경로 회귀 없음.
- `GanttPage` 사용처는 `ProjectWorkPanel` 단 한 곳(나머지 grep 히트는 전부 주석).
  `filter` 미주입 시 기존 내부 state 경로가 그대로 동작.
- `ProjectIssuePanel`은 칸반 모달(`context="kanban"`)에서도 쓰는데 그 호출부는 무변경.
- `ganttToastBatcher`는 "GanttPage 언마운트 후에도 flush 도달" 설계라 뷰 전환으로 언마운트가
  잦아져도 성공 토스트가 유실되지 않는다.

### 미검증
- **E2E 미수행.** 실제 폴더/WBS가 있는 프로젝트에서 트리 계층이 간트와 동일하게 보이는지는
  배포 후 확인 필요(어댑터를 공유하므로 로직상으론 동일하지만 실데이터 미대조).
- 뷰 전환 시 간트(SVAR)는 재마운트된다. 데이터는 react-query 캐시(staleTime 5분)로 재조회가
  없지만 SVAR 초기화 비용은 남는다. 대량 이슈 프로젝트에서의 체감 지연 미측정.

---

# 4. 2차 — 트리 편집 기능 (사용자 요청)

요청: 우측 상세에서 **시작일/기한/동료/계획작업량 편집**, **처리율 표시**, **쌓인 워크로그 조회**,
**좌우 카드 높이 동일**, **폴더 생성·드래그앤드롭·상위 지정**.

## 4-1. 핵심 원칙 — write 는 전부 간트 것을 재사용

1차 설계에서 "트리는 읽기 전용"으로 뒀던 이유(편집 경로 2벌 → 낙관 패치/토스트 배칭 분기)는
**mutation 훅과 모달을 그대로 재사용**하는 것으로 해소했다. 트리 전용 write 로직은 0줄이다.

| 기능 | 재사용한 것 |
|---|---|
| 시작일/기한 | `GanttScheduleModal` → `useUpdateSchedule` |
| 동료(협업자) | `GanttUserModal(isMulti)` → `useUpdateCoworkers` (간트 `handleCoworkerSubmit` 과 동일 인자) |
| 계획 작업량 | 인라인 입력(간트 `PlannedMdCell` 과 동일 상호작용) → `useUpdatePlannedMd` |
| 상위 지정 | `GanttParentModal` → `useSetParent` |
| 폴더 생성/이름변경/이동/삭제/소속 | `GanttFolderNameModal`·`GanttFolderMoveModal`·`GanttFolderAssignModal` → 폴더 mutation 5종 |
| 토스트 | `useGanttToastBatcher` (드래그성 연발 성공 알림 묶기) |

## 4-2. 드래그앤드롭 — 라우팅 규칙을 순수 함수로 고정

`resolveTreeDrop.js` 가 "무엇을 어디에 떨어뜨렸는가 → 어떤 mutation 인가"를 결정한다.
**규칙은 간트(GanttChart move-task intercept)와 의도적으로 동일**하다. 두 뷰의 드롭 의미가 갈라지면
같은 데이터를 두 화면에서 옮긴 결과가 어긋나기 때문.

```
드롭 대상 = 폴더 : 폴더→moveFolder(순환 차단) / 이슈→setIssueFolder(+wbsParent 있으면 먼저 해제)
드롭 대상 = 이슈 : 폴더→무시                  / 이슈→setParent(자손 순환 차단)
드롭 대상 = 루트 : 폴더→루트 이동             / 이슈→상위 해제
```
드래그 중에만 나타나는 **루트 드롭존**을 목록 하단에 두어 최상위로 빼내는 경로를 명시했다.

## 4-3. 상세 패널 구성

- 처리율: 숫자 대신 **진행 바**(0%/진행/100% 색 구분)
- 속성 그리드: 담당자 · 시작일✎ · 기한✎ · 동료✎ · 계획작업량✎(인라인) · Jira 프로젝트
- 계층 액션: 상위 지정 / 폴더 지정
- **쌓인 워크로그**: `useIssueWorklogs` — 프론트에서 `getIssueWorklogs`(requestJira 액션에 이미 존재)
  직접 호출. 신규 resolver 0. "작성자=나" 가 아니라 이슈 전체 워크로그가 필요한데 그런 계약의 SELF
  resolver 가 없고, 사용자 컨텍스트 호출이면 Jira 가 가시성을 통제한다.
- 폴더 선택 시엔 하위 개수/롤업 기간/계획MD/처리율 + 폴더 액션 4종
- **좌우 패널 높이 고정**(`68vh`) — 요청대로 동일. 내부는 각자 스크롤.

## 4-4. 검증

| 항목 | 결과 |
|---|---|
| 프론트 jest | **101 passed** (1차 85 + resolveTreeDrop 16) |
| build | 성공, work 경로 경고 0 |
| i18n | `projectDetail.work.tree.*` 확장, work 폴더 9파일 t() 키 전수 검증 — 누락 0 |
| 재사용 키 | 상위지정/협업자 라벨은 신규 생성 없이 기존 `gantt.parent.*`·`gantt.coworker.*` 사용 |

`resolveTreeDrop` 테스트 16건이 간트와의 규칙 등가성을 고정한다 —
폴더 자기자손 순환, 이슈 자손 순환, 변화없음 스킵, wbsParent 동반 해제, 루트 드롭 4케이스,
parent 체인 순환 데이터에서의 무한루프 방어까지 포함.

## 4-5. 미검증
- **E2E 미수행**: 실제 드래그 조작(HTML5 DnD)과 폴더/WBS 실데이터에서의 동작은 배포 후 확인 필요.
- 트리 DnD 는 SVAR 내장이 아닌 HTML5 네이티브 구현이라 간트와 조작감이 다를 수 있다(규칙은 동일).

---

# 5. 3차 — 레이아웃 버그 수정 + 관계 출처 구분

## 5-1. 레이아웃 붕괴 (스크린샷 제보)

증상: 좌우 폭 비율이 의도와 반대, **좌측에서 노드를 선택할 때마다 우측 패널이 점점 줄어듦**.

원인 2가지:
1. **패널 최상위 컨테이너에 `width`가 없었다.** 부모가 flex row 이므로 자식은 flex-basis:auto →
   콘텐츠 폭만 차지한다. 선택 노드가 바뀌면 상세 내용 길이가 달라져 폭이 출렁였다.
   → `TreeStructurePanel` / `TreeDetailPanel` 최상위에 `flex:1; width:100%; minWidth:0` 명시.
2. **flex-basis 를 340/380px 로 줘서 비율이 틀어졌다.** basis 를 크게 주면 "남는 공간"만 4:6 으로
   나뉘어 실제 폭 비율이 의도와 달라진다. → `flex: '4 1 0'` / `'6 1 0'` + `minWidth` 로 하한만 보장.

추가 보정: 카드에 `overflow:hidden`(내부 목록/상세만 스크롤 — 스크롤바 이중 노출 방지),
워크로그 행 `minWidth:0`(긴 코멘트에 행이 밀리지 않게), 높이 `68vh → 80vh`(요청).

### 같은 결함의 다른 인스턴스
`Inline` + `xcss({flex})` 조합은 **마이페이지에도 있었다**(좌우 2분할 2곳) → 같이 수정.
`myWork/WorklogPage`·`IssueAnalysisPage` 에도 같은 패턴이 남아 있으나 이번 범위 밖이라 손대지 않았다.

**교훈(재발 방지):** Atlaskit `<Inline>` 은 `grow` prop 없이 flex-grow 가 붙지 않고(기본 `hug`),
`xcss` 는 토큰 기반이라 `flex:'4'` 같은 raw 값이 **조용히 무시**된다.
폭을 채워야 하는 분할 레이아웃에는 이 조합을 쓰지 말 것. 코드에 주석으로 남겼다.

## 5-2. 연관 관계 — 출처 구분

Jira 원본 관계와 이 앱이 지정한 관계는 만들어진 곳이 달라, 섞어 놓으면 "누가 지정한 관계인지"
알 수 없다. 두 그룹으로 나누고 출처 배지를 달았다.

| 배지 | 포함 |
|---|---|
| **Jira 연결**(파랑) | 상위 이슈(parent) · 하위 이슈(subtasks) · 연결 이슈(issuelinks, 관계 문구별) |
| **Workforce 지정**(틸) | 상위 지정(wbsParent) · 하위 지정(이 이슈를 상위로 지정한 이슈들) · 소속 폴더 · 선행 작업 · 후행 작업 |

Workforce 그룹은 추가 요청 없이 이미 로드된 데이터로 만든다 —
wbsParent/폴더는 `toSvarTasks` passthrough, 선후행은 `useGanttData().links`.
배지 색은 브랜드 틸 스케일(#14756E/#E9F7F4/#6FD3C6)을 쓴다.

## 5-3. 검증
- 빌드 성공, 프론트 **101 tests 통과**, work 폴더 i18n 키 전수 검증 누락 0.
- 레이아웃은 계산상 컨테이너 1384px 기준 좌 553 / 우 830 (4:6), 좁아지면 minWidth(320/420)에서 wrap.
- **실제 화면 재확인 필요** — 이번 수정은 제보 스크린샷 기반이라 배포 후 눈으로 한 번 더 봐야 한다.
