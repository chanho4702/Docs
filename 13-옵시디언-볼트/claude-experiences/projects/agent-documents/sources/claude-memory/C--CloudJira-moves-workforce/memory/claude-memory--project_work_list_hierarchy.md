---
name: project-work-list-hierarchy
description: 작업관리 목록 뷰 Jira parent 계층(에픽>작업>하위이슈) 펼치기 — 골격+상세 2단 조회 설계와 그 함정
metadata: 
  node_type: memory
  type: project
  originSessionId: 43c482ed-1842-4a7e-b095-e2880f004c31
  modified: 2026-09-07T02:16:30.170Z
---

작업관리 **목록** 뷰(`/project/:id` → 작업관리 → `?view=table`)에 Jira 네이티브 `parent` 계층 펼치기를 추가했다(2026-09-07, 프론트 전용·백엔드 0줄, 커밋 전). 그룹 카드 안에 `[계층|평면]` 토글, 기본 계층. 계층 대상은 **이 프로젝트에 편입된 이슈만**(projectId 일치, 미편입 자식은 숨김) — "보이는 행 = 편집 가능한 행".

**설계의 핵심 4가지:**
- **골격 + 상세 2단 조회.** 그룹 단위로 `fields:['parent']`만 받아 계층 골격을 만들고(`workListTree.js` 순수함수), 현재 페이지 루트의 서브트리 키만 `key IN (...)` 청크로 상세 조회한다. 페이지 단위 = "이슈 20건"이 아니라 **"루트 20개 + 자손 전부"**.
- **기존 요약 쿼리(`fetchWorkListSummary`) 재사용은 기각.** 그 2000건 상한은 *프로젝트 전역* 축이라 그룹이 여럿이면 뒤쪽 그룹 계층이 조용히 잘린다(평면은 커서 페이징이라 상한 없음) → 모드만 바꿔도 모집단이 달라진다. 골격 쿼리 키를 `workListKeys.groupAll` **prefix 하위**로 두면 기존 `invalidateGroup`이 수정 0줄로 골격까지 무효화한다.
- **쿼리키에 `expandedKeys`를 절대 넣지 않는다.** 넣으면 펼칠 때마다 재조회가 난다. 서브트리 상세를 미리 받아 두므로 펼치기/접기는 네트워크 0회.
- **선택 집합 ⊆ 보이는 행 불변식.** 체크박스 대상은 펼쳐진 행만이고, 접으면 그 서브트리 선택을 즉시 해제한다 → 안 보이는 이슈가 일괄 적용으로 변경되는 사고가 구조적으로 불가능. (부모 체크 시 자식 자동 선택은 의도적으로 넣지 않음)

**회귀 방지 구조:** 인라인 편집 5종이 든 `createRow`는 `useIssueRowFactory.jsx`로 분리해 두 모드가 **공유**하고, 계층은 `hierarchy` 인자를 issueKey 셀 하나에서만 소비한다. 복제하면 편집이 한쪽에서만 고쳐진다. 단건 편집 캐시 패치는 인덱스 → **issueKey 기반으로 통일**(백그라운드 재조회로 행 순서가 바뀌면 인덱스는 엉뚱한 행을 덮어쓴다. `markIssuesDeleted`가 이미 키 기반이던 이유).

**미검증(배포 후 최우선):** `fields:['parent']` 응답에 `fields.parent.key`가 실제로 오는지. 안 오면 전원 루트로 읽혀 **크래시 없이 조용히 평면과 같은 화면**이 된다(fail-soft라 실패가 눈에 안 띈다). `/search/jql`에 `isLast`가 오는지, `maxResults:500`을 honor하는지도 미실측.

관련: [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_work_views|project_work_views]](목록/트리/간트/맵 4뷰 관계 — 트리는 앱 계층 wbsParent+폴더 축이라 **다른 축**이다), [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_work_bulk_apply|project_work_bulk_apply]], [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_table_surface|project_table_surface]]
