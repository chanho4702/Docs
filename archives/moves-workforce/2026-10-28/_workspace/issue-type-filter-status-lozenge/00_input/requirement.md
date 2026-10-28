# 요구사항 — 작업관리 이슈 타입 필터 + 상태 표시 컴포넌트 통일 (RFC-199)

작성: 2026-09-07 · 브랜치 `RFC-199`(develop 기준) · 사용자 확정 범위 반영

## 1. 작업관리 페이지 이슈 타입 필터

프로젝트 상세 > 작업관리 탭(`static/ui/src/pages/projectDetail/work/`, 뷰 4종: 목록 | 트리 | 간트 | 맵)에 **이슈 타입(issuetype) 필터**를 추가한다. **4개 뷰 전부**가 대상이다(사용자 확정).

- **트리·간트·맵**: 셸(`ProjectWorkPanel.jsx`)이 소유하는 공용 필터(담당자/상태/스페이스)에 이슈 타입 축을 더한다. 필터 순수 로직은 `work/workFilterOptions.js`(`deriveAssigneeOptions`/`deriveStatusOptions`/`filterGanttTasks`)가 단일 출처이므로 여기에 `deriveIssueTypeOptions` + `filterGanttTasks`의 `issueTypes` 축을 추가한다. 간트 Task 계약에 `issueType`, `issueTypeIcon`이 **이미 있다**(`src/resolver/gantt/GANTT.md` §Task) → 백엔드 변경 0줄 예상. 옵션은 로드된 task에서 유도(담당자 필터와 같은 방식), 아이콘 표시.
- **목록 뷰**: 서버 JQL 기반(`components/project/ProjectFilter.jsx`, `addJqlMap`)이라 축이 다르다. `issuetype in (...)` JQL 조건을 만드는 필터 컨트롤을 추가한다. 옵션 출처는 설계자가 결정(프로젝트의 이슈 타입 메타 조회 `requestJira` vs 현재 목록에서 유도). 기존 `statusCategory`/`assignee` 필터의 패턴(`DropdownJql` 등)을 따른다.
- 필터 상태는 셸이 소유하고 뷰로 내리지 않는다(`WORK_VIEWS.md` §1-2 규칙). 필터로 부모가 걸러진 노드는 루트 승격(기존 규칙 유지).
- i18n: `locales/kr|en/gantt.json`의 `gantt.filter.*` 관례를 따른다(작업관리 뷰는 간트 키 재사용).

## 2. 상태 표시 컴포넌트 통일 (Jira 방식)

"상태를 표시하는 컴포넌트를 전부 하나로 통일하고, Jira가 제공하는 것처럼 보이게" — **Jira 이슈 상태 + 프로젝트 상태 둘 다** 대상이다(사용자 확정).

### Jira 방식이란
Jira 이슈 상태 Lozenge: `statusCategory`에 따라 색이 정해진다.
- `new`(할 일, colorName `blue-gray`) → 회색(default)
- `indeterminate`(진행 중, colorName `yellow`) → 파랑(inprogress)
- `done`(완료, colorName `green`) → 초록(success)
- 굵은(bold) 대문자 스타일. Atlaskit 공식 `@atlaskit/lozenge`(appearance: default | inprogress | success | removed | moved | new)가 그 자체다. 현재 `static/ui/package.json`에 **미설치** → 설치 후 사용(Atlaskit 공식 디자인시스템이므로 CLAUDE.md 스택 정책에 부합). 설치가 불가하면 `SemanticBadge`가 이미 "미설치 환경용 경량 구현"이라 그 위에 얹는다.

### 현재 상태 (설계자가 인벤토리를 확정할 것)
`static/ui/src/components/lozenge/`에 4종 + 별도 색맵 2종이 공존한다.
| 컴포넌트/맵 | 용도 | 사용처 수 |
|---|---|---|
| `lozenge/StatusBadge.jsx` | 프로젝트 상태 pill(사용자 지정 COLOR_OPTIONS 색 → accent 토큰) | 9 |
| `lozenge/StatusLozenge.jsx` | success/info/error/warn 아이콘 배지 | 2 |
| `lozenge/StatusTag.jsx` | 테두리형 태그(부수 정보) | 1 |
| `lozenge/SemanticBadge.jsx` | 앱 판정 의미(success/warning/danger/neutral) | 11 |
| `constants/statusColorMap.js` | Jira `statusCategory.colorName` → subtle 톤(이슈 배지 `components/issue/IssueComponent.js`, myWork, 캘린더) | 3 |
| `components/calendar/statusAccent.js` | 캘린더 전용 색 바 | 캘린더 |
그 밖에 `statusCategory`/`colorName`을 직접 읽어 그리는 지점이 **39개 파일**(작업관리 트리/맵/간트, 내 작업 MyIssueTable, 마이페이지 sections, 칸반 카드, 포트폴리오 위젯, 캘린더 팝업 등). 설계자가 `grep -rln "colorName\|statusCategory"`로 전수 인벤토리를 만들고 **"상태 표시"인 것과 "집계/필터 로직"인 것을 구분**해 대상 목록을 확정한다.

### 목표
1. **공용 상태 컴포넌트 1개**(예: `components/lozenge/StatusLozenge.jsx`를 재정의하거나 새 `JiraStatusLozenge`) — 입력은 (a) Jira 이슈 `status`(`statusCategory.key|colorName` + name) 또는 (b) 프로젝트 상태 엔티티(name + 사용자 지정 `color`). 출력은 Atlaskit Lozenge 외형.
2. **Jira 이슈 상태**를 그리는 모든 지점이 이 컴포넌트를 쓴다. `statusColorMap.js`의 subtle 톤은 폐기(또는 새 컴포넌트 내부로 흡수).
3. **프로젝트 상태**(백오피스에서 색을 고르는 KVS 엔티티, `StatusBadge` 9곳)도 같은 컴포넌트로. 사용자 지정 색(`COLOR_OPTIONS` value: blue/green/red/yellow/… + Light 변형)을 Lozenge appearance 또는 accent 색으로 매핑하는 규칙을 설계자가 정한다(예: green→success, blue→inprogress, gray→default, red→removed, purple→new, yellow→moved, 그 외→accent 토큰 커스텀). 백오피스 상태 편집 모달의 미리보기도 같은 컴포넌트.
4. 의미 배지(`SemanticBadge`: 좋음/주의/나쁨)와 테두리 태그(`StatusTag`)는 **"상태"가 아니라 판정/부수정보**이므로 통일 대상에서 제외하되, 설계자가 판단해 Lozenge로 수렴 가능한 것은 제안한다. 스토리지 게이지 등 비상태 용도의 `StatusBadge` 사용은 그대로 두거나 SemanticBadge로 옮긴다.
5. 캘린더는 이벤트 칩이라 Lozenge를 못 쓴다 — `statusAccent.js`의 색만 Jira 카테고리 색(회색/파랑/초록)과 **같은 토큰 계열**로 맞춘다.
6. 삭제되는 컴포넌트/맵은 사용처를 전부 옮긴 뒤 파일을 지운다(잔존 import 0).

## 3. 제약
- 백엔드 변경은 원칙적으로 없음. 이슈 타입 필터가 서버 shape 변경을 요구하면 설계서에 명시.
- `React.lazy` 탭 구조·Suspense 경계 유지(CLAUDE.md 코드 스플리팅 주의). 캘린더 스택은 lazy 뒤에 있어야 하므로 새 공용 컴포넌트가 `FullCalendar.jsx`를 import하면 안 된다.
- 번역: `locales/kr|en/*.json`에 추가 후 `npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.
- 검증: 프론트 jest + `CI=true npm run build`(번들 예산 게이트) + 루트 `npm test`.
- 디자인: DMOVE 팔레트가 아니라 **Jira/Atlaskit 상태 색**을 그대로 쓴다(사용자가 "지라에서 제공하는 것처럼"이라고 명시).
