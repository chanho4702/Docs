---
name: project-jira-search-index-lag
description: Jira app/field/value write 직후 search/jql 재조회는 인덱스 지연으로 옛 값을 돌려줌 — invalidate 대신 서버 응답 캐시 패치
metadata: 
  node_type: memory
  type: project
  originSessionId: 809a0648-4fb8-4566-b144-71d8628be551
---

**Jira 커스텀필드 write 직후 search 재조회 금지 (인덱스 지연).** `PUT /rest/api/3/app/field/{id}/value`(및 표준 PUT /issue 필드 write도 동일 위험)는 즉시 저장되지만(직접 `GET /issue`는 새 값 반환), **`/rest/api/3/search/jql` 인덱스 반영은 수 초 이상 지연**된다.

**Why:** 간트 "상위 지정해도 하위로 안 들어감" 버그(2026-07-02)의 실제 원인. write 성공(2xx) 직후 React Query `invalidateQueries`가 search 기반 재조회를 트리거 → 옛 값(빈 필드)이 돌아와 staleTime 캐시로 박제. 실측: direct GET=`"ZUNU-2"`, search(수 초 후)=`"ZUNU-2"`, write 직후 search=빈값.

**How to apply:** app/커스텀필드 write 후 UI 갱신은 (1) **즉시 invalidate 금지**, (2) **서버 확정 응답(content)으로 React Query 캐시 부분 패치** (간트 `useSetParent`/`useSetLink` 패턴), (3) 전체 재동기화는 다음 자연 재조회에 맡김. search 기반 목록을 쓰는 모든 화면(작업 관리 등)에 공통 적용. 관련: [[project-svar-gantt]], [[projects/agent-documents/sources/claude-memory/C--CloudJira-moves-workforce/memory/claude-memory--project_forge_readonly_field_write|project_forge_readonly_field_write]]
