# 이슈 맵 (issue-map) — 요구사항

작성일: 2026-09-02 / 브랜치: RFC-192

## 1. 목적

프로젝트 상세에서 **이슈 구조(계층)를 한눈에** 보는 화면이 없다. 이슈를 **티켓 카드**로 그리고, 카드를 누르면 하위 이슈가 **선으로 연결되어 펼쳐지는** 트리 맵을 추가한다. 카드에서 바로 **커밋 이력**과 **워크로그 이력**을 볼 수 있어야 한다.

## 2. 위치 (사용자 확인 사항 — 별도 탭이 아닌 작업관리 뷰)

- 프로젝트 상세 > **작업관리 탭**의 뷰 전환 그룹에 **4번째 뷰 `map`** 으로 추가한다. (기존 `[table | tree | gantt]` → `[table | tree | gantt | map]`)
- 셸: `static/ui/src/pages/projectDetail/work/ProjectWorkPanel.jsx`
  - `React.lazy` + 기존 Suspense 경계 아래(#426 방지). 첫 뷰(table)만 정적.
  - `?view=map` URL 파라미터(`useUrlParam('view')`)로 복원.
  - 권한: tree/gantt와 동일하게 `canRead('PROJECT')`.
  - 필터: tree/gantt와 공유하는 담당자/상태/스페이스 필터를 **같이 받는다**(같은 데이터 소스).
- 이유: 트리 뷰가 이미 같은 계층을 보여준다. 같은 데이터를 보는 화면이 탭 두 곳으로 갈라지면 안 된다(`WORK_VIEWS.md` §2 원칙).

## 3. 데이터 (백엔드 없음 — 프론트 전용)

### 3-1. 이슈·계층
- `useGanttData(projectId)` (= `getProjectGanttData`, 쿼리키 `ganttKeys.data`) 를 그대로 쓴다. **전용 resolver를 만들지 않는다.**
- 계층은 `ganttAdapter.toSvarTasks(...)` → `buildWorkTree(nodes)` 결과를 재사용한다. 트리 뷰와 **같은 트리**를 그려야 한다(계층 규칙 재해석 금지: 이슈 부모 > 폴더 소속 > 루트).
- 폴더 노드(`folder`)는 이슈가 아니므로 카드 형태가 다르다(그룹 헤더/접힘 컨테이너 등 설계 판단). 커밋/워크로그 버튼 없음.
- 카드에 필요한 필드는 SVAR 노드에 이미 있다: `id`, `text`(제목), `issueKey`(확인 필요 — 없으면 원본 이슈 매핑), `assigneeObj`(담당자), `progress`(0~100, 이슈 진행도 + 자손 MD 가중 롤업), `statusCategory`, `statusKey`.
  - **진행도 정의를 새로 만들지 않는다.** 간트/트리와 같은 `progress` 값을 쓴다.

### 3-2. 워크로그 이력
- `static/ui/src/pages/projectDetail/work/useIssueWorklogs.js` (`useIssueWorklogs(issueKey)`) 재사용. 선택 이슈 1건 온디맨드.

### 3-3. 커밋 이력 (A안 — Jira 개발 정보 내부 API)
- 프론트 `requestJira`로 **사용자 컨텍스트** 호출. `asApp` 금지.
- 엔드포인트(Jira 개발 패널이 쓰는 비공개 API):
  - `GET /rest/dev-status/latest/issue/detail?issueId={numericIssueId}&applicationType=bitbucket&dataType=repository`
  - 응답 대략: `{ detail: [{ repositories: [{ name, url, commits: [{ id, displayId, message, author:{name, avatar}, authorTimestamp, url, fileCount, merge }] }] }], errors: [] }`
  - `issueId`는 **숫자 id** (key 아님). SVAR 노드에 숫자 id가 있는지 확인, 없으면 원본 이슈에서 매핑.
- `static/ui/src/utils/jiraApi/requestJira.js`의 액션 맵에 `getIssueDevStatus` 추가(기존 `getIssueWorklogs`와 같은 방식).
- **비공개 API이므로 fail-soft가 필수**: 403/404/네트워크 오류·응답 shape 불일치 시 화면이 죽지 않고 "커밋 정보를 불러올 수 없음 / 연동된 저장소 없음" 빈 상태를 보여준다. 응답 파싱은 전용 순수 함수(`parseDevStatusCommits` 등, jest 대상)로 분리해 shape 방어를 한 곳에 둔다.
- 커밋 버튼은 **클릭 시에만** 조회(온디맨드). 전체 이슈에 대해 선조회하지 않는다.
- 실호출 검증(Forge 프록시가 이 경로를 허용하는지)은 **구현 후 dev 배포에서 리더가 별도 수행**한다. 설계·구현은 성공/실패 양쪽을 다 다루면 된다.

## 4. 화면

### 4-1. 캔버스
- `@xyflow/react`(이미 의존성, `ProjectStatusFlow.jsx`에서 사용 중) 로 팬/줌/엣지. 커스텀 nodeType으로 카드 렌더.
- 레이아웃은 **직접 작성**한다(dagre/d3-hierarchy 없음). 가로 방향 트리(루트 좌측 → 자식 우측) 또는 세로 방향 중 설계 판단. 순수 함수 `layoutIssueTree(tree, collapsedIds, sizes)` → `{nodes, edges}` (jest 대상).
- 노드 클릭(또는 카드의 펼침 토글)으로 **하위 펼침/접힘**. 초기 상태는 루트만 펼침(대규모 프로젝트에서 한 번에 다 그리지 않는다). "모두 펼침/모두 접기" 툴바 제공.
- 엣지: 부모→자식 곡선(smoothstep/bezier), 접힌 노드는 자식 수 배지.
- 대량 이슈(수백 건) 대응: 접힘 기본 + 펼친 노드만 렌더. 가상화까지는 요구하지 않음.

### 4-2. 카드(티켓) 구성
1. 이슈 키 (+ 이슈 타입 아이콘이 있으면 표시)
2. 제목 (2줄 말줄임)
3. 담당자 (아바타 + 이름, 미배정 표시)
4. 진행도 바 (`progress` 0~100, 상태 카테고리 색 반영)
5. **커밋 이력 버튼** (클릭 → 우측 드로어의 커밋 탭)
6. 하위 펼침 토글 + 자식 수
- 카드 클릭 → 드로어 열림(개요/워크로그/커밋). 선택 카드 강조.

### 4-3. 드로어 (우측 패널)
- 탭 2개: **워크로그 이력**, **커밋 이력** (개요 정보는 상단 헤더에 키/제목/담당자/상태/진행도).
- 워크로그: 작성자 아바타·시간·기간·코멘트 요약, 합계 시간. (`TreeDetailPanel`의 워크로그 섹션이 있다면 표현을 재사용/공용화 검토)
- 커밋: 저장소별 그룹 → 커밋 목록(짧은 해시·메시지 1줄·작성자·시각·파일 수). 해시 클릭 시 Bitbucket 커밋 URL 새 창(`router.open` 또는 `<a target=_blank>` — Forge iframe 제약 고려).
- 빈 상태·오류 상태·로딩 스켈레톤 각각 제공(스피너 금지, `components/skeleton`).
- 패널 너비/접기는 RFC-185 공용 레이아웃(`Resizable Panels`) 재사용 검토.

### 4-4. 디자인 톤
- "이쁘게"가 명시 요구. Atlaskit 토큰 + DMOVE 틸 스케일(PRIMARY #21ADAD) 기반. 카드 그림자/호버/선택 상태, 엣지 색은 `constants/chartPalette.js`·상태 카테고리 색과 일관.
- 다크 모드 토큰 준수(하드코딩 색 금지, `token()` 사용).
- 캔버스 배경은 React Flow `Background`(dots) + 미니맵 선택.

## 5. i18n
- `locales/kr/*.json`, `locales/en/*.json`에 추가 후 `npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.
- 키 접두: `projectDetail.work.view.map`, `issueMap.*`

## 6. 테스트
- 순수 로직 jest: 레이아웃(`layoutIssueTree`), dev-status 파서(`parseDevStatusCommits`), 펼침 상태 계산.
- 프론트 `npm test` + `CI=true npm run build` 통과.
- 쿼리키는 `utils/queryKey/` 팩토리에 추가(`projectKeys.issueDevStatus(issueId)` 등) — `queryKeyContract.test.js` 준수.

## 7. 범위 밖
- 이슈 편집(DnD 부모 변경, 일정 편집)은 트리/간트에 있으므로 맵에서는 **읽기 전용**.
- Bitbucket REST 직접 연동(B안), PR/브랜치 목록.
- 백엔드 resolver·PermissionMap 변경 없음.
