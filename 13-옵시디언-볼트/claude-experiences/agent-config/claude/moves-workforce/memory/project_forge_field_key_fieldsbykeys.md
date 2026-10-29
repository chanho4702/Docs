---
name: forge-field-key-fieldsbykeys
description: "getCustomFieldId가 반환하는 건 Forge 필드 \"key\" — search/issue API fields에 넣을 땐 fieldsByKeys:true 필수, false면 응답에 앱 필드가 조용히 누락됨"
metadata: 
  node_type: memory
  type: project
  originSessionId: c8038c85-a3dd-4b89-b6e3-9bd206fcdd5c
---

`static/ui/src/constants/customField.js`의 `getCustomFieldId()`는 customfield_xxxxx **ID가 아니라 Forge 필드 key**(`appId__ENV__fieldKey`)를 반환한다. Jira search/jql·GET issue의 `fields` 파라미터는 기본(`fieldsByKeys:false`)이 ID 해석이라, key를 넣으면 매칭 실패로 **해당 필드가 응답에서 조용히 빠진다** (에러 없음 → 화면 공란).

**Why:** 작업이력 탭(2026-07-13 수정)에서 등록자/등록일시가 운영에서 공란 — write(asApp)는 정상이고 Jira에 값이 있는데 `fieldsByKeys:false`로 조회해서 못 읽은 것. MCP JQL로 운영 데이터 36건 존재 확인해서 write/read를 갈랐음.

**How to apply:** `getCustomFieldId` 결과를 `fields`에 넣는 모든 조회는 `fieldsByKeys: true` + 응답도 key로 접근(`issue.fields[forgeKey]`). 백엔드는 대신 `FieldApi`가 이름으로 customfield ID를 해석하는 방식(ID + byKeys:false)이라 혼동 주의. 관련: [[forge-readonly-field-write]], 앱 자체 권한 가드로 write가 조용히 거부되는 케이스는 permission hardening의 fail-close(PROJECT write=false Member 시드) 참고.
