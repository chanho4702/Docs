# 작업 배정 기능 감사 기록

기준: 2026-08-26

## P0 — `assignWorkItem`이 권한 확인 프로젝트와 실제 대상 issue의 소속을 대조하지 않음

- PermissionMap은 `assignWorkItem`을 `PROJECT` 또는 `RESOURCE_MANAGEMENT` write의 `inherited` 프로젝트 범위로 매핑한다. 이 가드는 payload의 `projectId`만 보고 허용 여부를 판단한다(`src/permission/PermissionMap.js`, `src/permission/permissionGuard.js:38-50`).
- writer는 `projectId`를 필수로 받지만 대상 issue를 단건 GET한 뒤 assignee와 coworker property를 곧바로 변경한다. 조회한 `beforeRaw`의 프로젝트 필드나 RMS project field와 `projectId`를 비교하지 않는다(`src/resolver/workAssignment/WorkAssignmentWriter.js:48-105`).
- 이미 다른 resolver의 직접 호출 방어를 위해 `isIssueInProjects()` helper가 존재하며, 주석도 ``허용 projectId + 비소속 issueId`` 조합 방어를 목적으로 명시한다(`src/api/jira/issue/IssueApi.js:293-320`). 이 writer에는 사용되지 않는다.

영향: 제한된 프로젝트 범위를 가진 사용자가 본인이 허용된 `projectId`와 별도 프로젝트의 Jira issue ID/key를 조합해 제출하면, Jira 자체 권한이 허용하는 범위에서 타 프로젝트 issue의 담당자 또는 협업자 property를 변경할 수 있다. UI 경로는 정상 project queue에서 ID를 가져오므로 막지만 direct invoke를 막지 못한다.

권장 수정: issue 단건 GET 응답에서 RMS 프로젝트 ID를 읽어 payload `projectId`와 일치하는지 확인하고, `MEMBER_ONLY`/`TEAM_ONLY` 범위에서는 공용 `isIssueInProjects()` 또는 동일한 단건 검증을 반드시 수행한다. issue ID/key 혼용, 허용 projectId + 타 프로젝트 issue 조합을 거부하는 회귀 테스트를 추가한다.
