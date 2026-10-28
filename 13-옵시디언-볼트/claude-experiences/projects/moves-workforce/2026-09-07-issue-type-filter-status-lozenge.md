# 2026-09-07 이슈 타입 필터 + 상태 표시 Lozenge 통일 (RFC-199)

프로젝트: [[moves-workforce]] · 브랜치 RFC-199(develop 기준) · 하네스 `feature-harness` 순차 파이프라인(architect → frontend → verifier, **백엔드 0줄**) · 커밋 `16e8870`·푸시 전

## 무엇을 했나
사용자 요구 두 가지. (1) 작업관리 페이지에 이슈 타입 필터, (2) "상태 표시하는 컴포넌트 모두 통일, 지라에서 제공하는 것처럼".

- **이슈 타입 필터 4개 뷰 전부**(목록·트리·간트·맵). 셸(`ProjectWorkPanel`)이 소유하는 클라이언트 필터 3개 뷰 + 목록 뷰는 서버 JQL(`issuetype IN (...)`). 옵션은 이미 받아오는 응답에서 유도 — 네트워크 추가 0회.
- **상태 표시 통일**: `components/lozenge/StatusLozenge.jsx` 한 파일에 진입점 2개(`IssueStatusLozenge` / `ProjectStatusLozenge`). 이슈 상태 13지점 + 프로젝트 상태 12지점 교체. `constants/statusColorMap.js`·`components/lozenge/StatusBadge.jsx` 삭제, 기존 `StatusLozenge`(아이콘 배지)는 `SemanticLozenge`로 rename.
- 결과: jest 112 suites / 1811 tests 통과, `CI=true npm run build` 통과(gzip 476,391 / 예산 950,000).

## 결정과 이유
1. **`@atlaskit/lozenge`를 설치하되 커스텀 색은 `appearance`가 아니라 `style`로 낸다.** 아래 교훈 참조. 프로젝트 상태는 관리자가 백오피스에서 21색 중 고른 값이라 Lozenge appearance 6종으로 접으면 "고른 색과 다른 색이 나오는" 화면이 된다.
2. **props 하나로 합치지 않고 진입점 2개.** `ScopeSplitCell` 회귀(한 컴포넌트에 2종 shape → `?? 0`이 결함을 삼킴, CLAUDE.md 2026-07-22)를 그대로 재현할 구조였다. 진입점을 나누면 잘못된 shape이 호출 지점에서 드러난다. 검증에서 실제로 효과 확인 — 프로젝트 상태 shape이 이슈 진입점으로 새어든 곳 0.
3. **필터 매칭 단위는 이슈 타입 "이름"(id 아님).** 간트 Task 계약에 타입 id가 없고, 멀티 스페이스 프로젝트(RFC-171 구독)에서 id로 필터하면 같은 "Task"가 스페이스마다 갈라진다.
4. **작업 배정 대기열의 평문 상태도 통일 대상에 포함**(설계는 [D] 제외로 분류했으나 리더가 뒤집음). [D]의 정의는 "의미 배지/태그"인데 그 지점은 Jira 이슈 상태를 평문으로 그리는 곳이었다. 요구가 "모두 통일"이다.
5. **맵 카드 진행 중 색이 DMOVE 틸 → Atlassian 파랑**으로 바뀌는 것을 수용. 사용자가 "지라에서 제공하는 것처럼"을 명시했다. [[dmove-brand-palette]]보다 이 요구가 우선.

## 교훈
- **🔴 Atlaskit 컴포넌트의 default export가 피처 플래그 래퍼일 수 있다.** `@atlaskit/lozenge@15`의 default export는 `fg('platform-dst-lozenge-tag-badge-visual-uplifts')`로 New/Legacy를 가른다. **Forge Custom UI(iframe·CRA 번들)에는 플래그 클라이언트가 부트스트랩되지 않아 `fg()`가 예외 → 항상 Legacy**. 그리고 Legacy는 유효값 밖 appearance를 **조용히 `default`(회색)로 강등**한다 → `accent-blue` 같은 신형 appearance로 색을 내면 21색이 전부 회색으로 죽는다. 에러도 경고도 없다. 설계 에이전트가 published 소스를 직접 읽어 잡았고, 렌더 테스트로 확증했다(`appearance="accent-blue"`의 innerHTML === `"default"`의 innerHTML).
- **🔴 jsdom은 `var(--ds-x, #hex)`를 조용히 버린다.** `el.style.backgroundColor = 'var(--ds-x,#F3F0FF)'` → 저장값 `""`. `@atlaskit/tokens`의 `token()`이 정확히 그 형태를 낸다. 그래서 인라인 스타일 테스트가 실패하는데, **Lozenge 문제로 오진하기 딱 좋다**(같은 실행에서 평문 `rgb()`는 정상으로 실린다). `token(name, fallback) => fallback`으로 모킹해야 검증된다. 브라우저에서 CSS 변수 미정의 시 택하는 값과 같으므로 의미도 맞다.
- **docblock의 "단일 출처"를 믿지 말고 grep으로 확인하라.** `workFilterOptions.js`는 스스로 단일 출처라 적어 뒀지만 실제로는 트리·맵만 쓰고 `GanttPage.jsx`가 옵션 유도와 필터 술어를 인라인으로 복제한 3번째 사본이었다. 새 축을 그냥 얹었으면 4번째 축이 2벌이 됐다. 흡수하면서 기존 버그(`svarTasks` useMemo 의존성에 `selectedProjectKeys` 누락 → 스페이스 필터가 간트에 무반응)도 드러났다.
- **"형제 위젯"을 항상 같이 찾아라.** 설계 인벤토리가 `PortfolioTsrSignalTable`을 빠뜨려, 같은 화면(`/dashboard`)에서 한 테이블은 새 배지·다른 테이블은 옛 파란 배지가 될 뻔했다. verifier가 잡았다. 설계 인벤토리 자체의 누락은 구현자가 아니라 검증자가 잡는다.
- **미검증 리스크는 단위 테스트로 바꿀 수 있는지 먼저 보라.** verifier가 "style prop 적용 여부 — 틀리면 21색 전부 회색, 배포 후 최우선"으로 올린 항목이 실제로는 렌더 테스트 한 개로 배포 전에 확정 가능했다.
- **동시 작업 중인 다른 워크스트림이 작업 트리에 섞일 수 있다.** 구현 도중 제3자가 `ProjectIssueTable.jsx`를 리팩토링해 행 팩토리를 새 파일로 빼냈고, 그 새 파일이 내가 삭제한 컴포넌트를 다시 import해 빌드가 깨졌다. 파일 mtime으로 외부 작업임을 확인했다. **커밋 범위를 파일 단위로 나눌 때 로케일 JSON은 혼재 파일이라 헝크 분할 + 커밋별 `npm run merge` 재실행이 필요하다.**

## 커밋 분할 (2026-09-07)
같은 `RFC-199` 브랜치에 **두 워크스트림**이 얹혀 있었다(이 작업 + 다른 세션의 "작업관리 목록 뷰 Jira 계층 펼치기"). 사용자가 "저기 작업 끝났어"라고 확인해 준 뒤 **커밋 2개를 인접 배치**로 나눴다.
- `16e8870` 이슈 타입 필터 + 상태 Lozenge 통일 (66파일)
- `80309f4` 목록 뷰 계층 펼치기 (14파일)
- 미커밋 잔류: `AGENTS.md`(제3 워크스트림 하네스 문서) · `README.md`(세션 시작 시점부터 M)

**로케일 헝크 분할 방법** — `locales/{kr,en}/projectDetail.json`에 두 워크스트림 키가 섞여 있고 merge 산출물(`ko-KR.json`/`en-US.json`)은 둘을 합쳐 낸다. 그래서 커밋별로 산출물이 정합하려면:
1. 전체본 백업 → `git show HEAD:<파일>`로 되돌린 뒤 내 블록만 텍스트 삽입 → `npm run merge` → 커밋 1
2. 전체본 복원 → `npm run merge` → 커밋 2
`json.dump`로 다시 쓰면 CRLF·들여쓰기가 통째로 바뀌어 diff가 폭발하므로 **텍스트 삽입**으로 한다. 앵커 줄에서 들여쓰기·개행을 그대로 가져오면 형식이 보존된다.

**커밋 순서가 중요하다.** 계층 워크스트림의 `useIssueRowFactory.jsx`가 이 작업이 만든 `IssueStatusLozenge`를 import하므로, 컴포넌트를 만드는 커밋이 **먼저** 와야 중간 커밋에서 빌드가 깨지지 않는다. 반대로 커밋 1 단독은 목록 뷰 이슈 타입 옵션(`useWorkListQueries.js`가 커밋 2 소유)이 없어 그 필터만 비는데, 두 커밋을 붙여 두면 브랜치 tip은 정합하다.

## 남은 것
- 푸시 안 함(사용자가 커밋만 지시).
- E2E·배포 미수행. 배포 후 확인: 프로젝트 상태 21색이 실제 브라우저에서 색으로 나오는지(테스트로 확정했으나 실환경 1회 확인), 목록 뷰 이슈 타입 필터가 팀 관리형 프로젝트에서 동작하는지.
- 후속 후보: 간트 Task에 `status:{name}` 추가해 카테고리명("진행 중") 대신 실제 상태명("코드 리뷰") 표시 · 툴바 3개를 공용 `WorkFilterBar`로 추출(이번에 옵션 유도·필터 술어는 단일화돼 훨씬 싸짐).
