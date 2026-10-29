---
name: project_forge_readonly_field_write
description: "readOnly Forge 커스텀필드는 PUT /issue 로 못 씀 → /app/field/{id}/value (asApp) 엔드포인트로 write"
metadata: 
  node_type: memory
  type: project
  originSessionId: 13da91e1-7bd9-4a68-af5e-6de268599c15
---

Forge `jira:customField` 중 `readOnly: true` 필드(예: `projectIdField`, `wbsParentField`, `predecessorsField`)는 **표준 `PUT /rest/api/3/issue/{key}` (fields) 로 갱신 불가** — 400 `"Field does not support update 'customfield_xxxxx'"` 에러가 난다.

**해결:** 앱 전용 값 엔드포인트로 write.
`PUT /rest/api/3/app/field/{fieldIdOrKey}/value` (**반드시 asApp** — 앱이 자기 필드에 write), body `{ updates: [{ issueIds: [<숫자 issue id>], value }] }`.
- `issueIds`는 issue **key 아님**, 숫자 id. (key만 있으면 검색 응답 raw issue의 `.id` 사용)
- value: string 필드=문자열("PROJ-8"/해제는 ""), object 필드=객체({links:[...]}). putJiraJson이 body를 JSON.stringify 하므로 native 값 전달.

레퍼런스 구현: `ProjectUsersService.updateCustomField`(기존 projectIdField), `IssueApi.updateAppCustomFieldValue`(간트 M3용 추가).

이 asApp은 [[feedback_no_asapp]] 예외다 — 앱 자기 필드 write는 사용자 컨텍스트 경로가 원천적으로 없어 asApp 불가피(스코프 확대 아님).

발견 경위: 간트 M3([[project_svar_gantt]]) 관계 편집(setGanttParent/setGanttLink)이 배포 후 "Field does not support update" 로 실패. M2 일정 write(customfield_10015/duedate=표준필드)는 정상이라 readOnly 앱필드만 문제임이 드러남. (2026-07-01 수정)
