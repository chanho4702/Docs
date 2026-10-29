---
name: project-issue-map
description: "작업관리 4번째 뷰 \"이슈 맵\"(React Flow 카드 트리 + 워크로그/커밋 드로어) 구현 완료(2026-09-02) — Jira dev-status 내부 API는 Forge에서 401이라 커밋 탭은 B안(Bitbucket OAuth) 전까지 폴백 상태"
metadata: 
  node_type: memory
  type: project
  originSessionId: dfeb7d1b-d8a0-4106-9199-97b5db225e94
  modified: 2026-09-02T02:06:23.237Z
---

2026-09-02 사용자 요청("이슈 구조를 한눈에, 티켓 박스 트리 + Bitbucket 커밋 이력")으로 프로젝트 상세 > 작업관리 탭에 **4번째 뷰 `map`** 추가(`static/ui/src/pages/projectDetail/work/map/`). 별도 탭이 아닌 뷰로 넣은 이유: 트리 뷰와 같은 데이터·계층(`useGanttData` → `toSvarTasks` → `buildWorkTree`)이라 화면을 두 곳으로 가르지 않기 위함. **백엔드 0줄**.

- 캔버스 `@xyflow/react`(이미 의존성), 레이아웃은 직접 작성한 순수 함수 `layoutIssueTree.js`. **2차(사용자 피드백)**: 위→아래 조직도형(형제 옆으로), 최상단은 합성 **프로젝트 이름 루트 카드**(`project:<id>`, `findProjectById` 캐시 공유), 계층=실선·간트 선후행(`links`+`folderLinks`)=점선(`buildDependencyEdges`, 핸들 상하/좌우 분리), 초기 펼침=루트+폴더 펼침·자식 있는 이슈만 접힘. 카드 클릭=드로어, chevron=펼침.
- 진행도는 `progress`가 아니라 **`progressPercent`**(트리 상세 "처리율"과 같은 값). `svar.progress`는 간트 막대용 근사값.
- 트리와 공용화: `workFilterOptions.js`(필터 유도), `WorklogHistoryList.jsx`(워크로그 행) — 동작 무변경 이동. 프론트 에이전트가 `TreeDetailPanel` 치환을 리포트에만 적고 실제로 안 해서 verifier가 잡음(리더가 직접 수정).
- 커밋 이력: `requestJira` 액션 `getIssueDevStatus`(`/rest/dev-status/latest/issue/detail`) + `parseDevStatusCommits`(throw 없음, `{ok, reason, ...}` 고정 shape) fail-soft. **커뮤니티/Atlassian 스태프 답변(2024-03, 2025-08): dev-status는 private API라 scope가 없어 Forge에서 401 "scope does not match"** → 커밋 탭은 안내 빈 상태로 떨어질 것이 거의 확실. 실제 커밋은 B안(manifest external auth provider + Bitbucket REST + 레포 등록 UI, 별도 RFC)만 가능.
- **커밋 `2459414`(RFC-192, 2026-09-02)**, moves-rms(tom-chkim-dev) 배포 완료. 연결선 미표시 신고 → 노드에 `handles` 좌표 직접 주입(RF v12, DOM 측정 불요) + 300노드 이하 전체 펼침 기본 + 필터 고정 폭으로 대응, 실화면 재확인은 사용자 몫. 커밋 시 다른 세션 캘린더 변경은 stash→merge 재생성으로 분리. 산출물 `_workspace/issue-map/`.

**Why:** 요구사항의 A안(dev-status)은 설계 시점에 실측 불가였고, 배포 후 검증 전에 공개 자료로 불가 판정이 나왔다.
**How to apply:** Jira 개발 정보(커밋/PR/브랜치)가 필요한 기능은 처음부터 B안(외부 OAuth) 규모로 잡을 것. 커밋 버튼을 노출 유지할지/플래그로 숨길지는 사용자 결정 대기.

관련: [[project-work-views]] · [[project-svar-gantt]] · [[feedback-no-asapp]]


**2026-09-30 갱신:** 커밋 드로어·카드 커밋 아이콘·dev-status 호출은 **제거됨**(사용자 결정, Bitbucket 연동 대안도 안 함). 맵 드로어는 워크로그만. 같은 커밋(d7f956f)에 작업관리 「이슈 생성」(우리 화면에서 Jira 스페이스에 이슈 생성 후 자동 연결, 4개 뷰 공통 버튼+목록 그룹 하단 스페이스 고정, 모달이 못 채우는 Jira 필수 필드가 있으면 차단)도 들어감. 실제 Jira 미검증(createmeta 응답 키·팀 관리형).