# 프로젝트 issue 연결 기능 감사 기록

기준: 2026-08-26

## P0 — `updateProjectIdField`가 대상 Jira issue의 프로젝트 소속을 검증하지 않음

- `updateProjectIdField`는 `PROJECT` write의 `inherited` scope resolver지만 요청 payload가 `{ customFieldId, issueId, value }`뿐이라 project ID가 없다(`src/resolver/projectIssue/ProjectUsersController.js:31`, `ProjectUsersService.js:272-294`). permission guard는 프로젝트 ID를 찾지 못하면 범위 검사를 건너뛴다.
- service는 대상 issue에 Jira custom field를 바로 PUT한다. issue가 어떤 RMS 프로젝트에 속하는지, 새 `value`가 실제 존재하는 RMS 프로젝트인지 확인하지 않는다.
- 이 필드는 RMS 프로젝트와 Jira issue의 귀속을 결정하는 핵심 연결값이다. 제한된 범위 사용자라도 Jira 권한이 허용하면 임의 issue의 소속을 변경해 타 프로젝트 데이터의 조회·분석·배정 경계를 오염시킬 수 있다.

권장 수정: 이 resolver를 프로젝트 귀속 변경 전용 경로로 재설계한다. 기존 issue의 RMS project field와 새 project ID를 서버에서 읽고, 호출자가 기존·신규 양쪽 프로젝트에 write 권한이 있는지 검증한다. 최소한 대상 issue의 실제 소속을 역산해 제한된 범위와 대조하고, 존재하지 않는 project ID 및 타 프로젝트 issue 직접 호출을 거부한다.
