---
name: project-docs-folder-subscription
description: "문서 관리 「Confluence 폴더 구독」 검토 결과(2026-10-01) — 가능·스코프 추가 없음, 사용자 지시로 기록만 하고 보류"
metadata:
  node_type: memory
  type: project
  originSessionId: 09c47656-08b2-49ec-8804-446d6dba94d0
  modified: 2026-10-01T07:47:01.906Z
---

문서 관리 탭에 Confluence 스페이스 폴더(또는 상위 페이지)를 프로젝트가 구독하는 기능 — 2026-10-01 검토, **사용자 "일단 기록만" → 구현 보류**.

- 가능: `type = folder`(폴더 목록), `type = page AND ancestor = <id>`(하위 재귀), `type = folder AND parent = <id>`(단계 펼침) 전부 `/wiki/rest/api/search` 하나 → `search:confluence` 그대로, 메이저 버전 없음(dmove 사이트 Rovo 실측).
- 권장 설계: 조회 시점 검색형 — 저장은 「어느 폴더를 보나」만(새 소형 SQL 테이블 `project_doc_source` + resolver get/add/remove, 읽기 R/쓰기 W PROJECT detail). 목록은 열 때 CQL 커서 페이징. 구독 문서는 이슈 미연결 「프로젝트 문서」로 별도 표시. 오래됨만 적용(끊김·필수 분류 해당 없음).
- 하지 말 것: RFC-171 `project_subscription` 재사용(스윕 배치가 처리하려 듦), 구독 문서를 `movesDocs` 이슈 프로퍼티에 자동 기록(쓰기 폭증·이슈당 30 상한), v2 `/wiki/api/v2/folders`(스코프 추가→메이저), asApp.
- 미확인: requestConfluence 에서 folder 결과 응답 모양, 스페이스 최상위 폴더만 거르는 CQL(최상위엔 parent 없음 → expand=content.ancestors 후 화면 필터 유력), 폴더 링크는 `/spaces/{key}/folder/{id}`.
- 작업량 2~3일(1단계 구독 저장+목록, 2단계 오래됨 집계·필터).
- 「작업 없이 프로젝트 문서로 연결」은 2026-10-01 **별도로 구현됨**(e2f2c42): KVS `ProjectDocs:{projectId}` + resolver getProjectDocLinks/setProjectDocLinks, 프론트 `PROJECT_TARGET`. 구독 구현 시 이 저장소와 합칠지 판단.

**How to apply:** 재개 요청 시 이 설계로 시작하고 미확인 3건을 먼저 실호출로 확인. 관련: [[project-confluence-page-property]]
