---
name: team-managed-field-gap
description: 팀 관리형에서 Forge 필드는 fields 응답에서 빠짐 → coworker·등록일·등록자·wbsParent는 movesRms 이슈 프로퍼티로 이전 **완료**(현행 경로). projectId만 커스텀 필드 유지
metadata: 
  node_type: memory
  type: project
  originSessionId: 1a4bcb6b-0b7d-4b1a-8966-aa82bf0c081d
  modified: 2026-08-10T09:12:01.096Z
---

팀 관리형(team-managed/next-gen) 프로젝트에서 Forge `jira:customField`는 이슈의 필드 표현에 포함되지 않는다 (2026-07-14 실측: DWEB-30은 `fields=*all&expand=names`에 moves_RMS_* 전무, 회사 관리형 DS-4는 6종 존재). 단, `PUT /app/field/{id}/value` write는 성공하고 **JQL 검색 인덱스에는 반영**된다.

**Why:** JQL로만 소비하는 projectId는 정상처럼 보이고, `issue.fields[필드ID]`로 값을 읽는 coworker·assignedDate·assignedBy만 죽는 비대칭이 생긴다. 팀 관리형에는 관리자가 앱 필드를 레이아웃에 추가할 방법도 없다(플랫폼 제약).

## 현재 상태 — 이전 완료 (2026-08-10 코드 확인)

`manifest.yml`의 `jira:entityProperty`(key `movesRms`)에 선언돼 있고 **읽기 경로가 프로퍼티로 완전히 넘어갔다.**

- 스키마: `{ coworkers: accountId[], assignedAt:'yyyy-MM-dd', assignedAtIso: ISO, assignedById, wbsParent }`
- 검색은 `searchAlias`(`movesRmsCoworkers` / `movesRmsAssignedAt` / `movesRmsAssignedBy`)로 JQL 가능
- **읽기는 반드시 유틸만 사용**: 프론트 `static/ui/src/utils/jiraApi/coworkerProperty.js`, 백엔드 `src/api/jira/issue/IssuePropertyApi.js`. `issue.properties` 인라인 접근 금지(유틸 주석이 명시)
- **쓰기는 `mergeIssueProperty`**(read-merge-write) — `writeIssueProperty`는 전체 교체라 다른 키를 날린다
- `getCoworkerFieldIdApi` / `coworkerFieldId` 인자는 **호환 유지용이며 읽기에 쓰이지 않는다**(`IssueApi.js:379` 주석). 새 코드에서 이 경로로 coworker를 읽지 말 것
- `projectId`는 JQL 전용 소비라 **커스텀 필드 그대로** 유지

## PoC에서 확인된 제약 (여전히 유효)

⚠️ **date 인덱스는 write 시점에 date-only(`yyyy-MM-dd`)만 파싱** — datetime ISO는 **에러 없이 인덱스 누락**된다. 그래서 인덱스용 date-only(`assignedAt`)와 표시용 ISO(`assignedAtIso`)를 분리 저장한다.

기타: 선언 전 값도 일괄 인덱싱(재저장 불필요), 반영 ~1s, `in (...)`·`is EMPTY`·`currentUser()`·ORDER BY 전부 동작, search/jql properties 동봉 +6ms(~2%), 크기 제한 32,768B.
트레이드오프: 회사 관리형 이슈 화면에서의 필드 노출은 상실, 편집 권한자의 REST 위변조 가능.
미실측: clone 시 프로퍼티 복사 여부, dev/prod 동일 alias 충돌.

마이그레이션 배치는 사용자 결정으로 제거됐다(실 고객 0·사내 데이터 리셋 허용) — 전환 시점 이전 데이터는 공란이 정상이고 재등록으로 갈음한다.

관련: [[project-forge-env-field-duplication]] · [[project-jira-search-index-lag]]
