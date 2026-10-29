---
name: permission-audit-2026-09
description: "권한 시스템 감사(2026-09-03) 결과와 사용자가 확정한 설계 의도 — 집계 차트는 asApp 배치로 일관성 우선, 상세 데이터는 Jira 권한(asUser)이 자연 차단"
metadata: 
  node_type: memory
  type: project
  originSessionId: 501c8f8f-f1bd-467d-9e07-72b3dcd74ffe
  modified: 2026-09-03T06:04:15.014Z
---

권한 시스템 감사(2026-09-03, 코드 검증 완료) 핵심 결과:

**사용자가 확정한 설계 의도 (2가지)**
1. 프로젝트에 할당된 인원은 그 프로젝트 정보만 본다 → `projectScope` MEMBER_ONLY로 우리 DB만 보고 판정 (Jira 권한과 무관).
2. 프로젝트 안에 있어도 Jira 권한 없는 이슈는 못 본다 → 별도 코드 없이 `asUser()` 호출로 Jira가 자연 차단.
3. **전사 대시보드 집계(PortfolioAggregator)가 `asApp` 배치인 것은 의도된 결정** — "Jira 권한이 없어서 못 봐도 차트는 일관적이어야 한다". 결함으로 재지적하지 말 것.
   - 알려진 부작용: 프로젝트 상세 탭(대시보드/진척도/비용)은 asUser 실시간 계산이라 Jira 권한 제한 사용자는 전사 집계와 숫자가 어긋날 수 있음. 문의 오면 이게 원인.

**RFC-198 로 수정 완료(2026-09-03, 브랜치 RFC-198, 커밋 7ab82d3·develop 푸시 완료 2026-09-07, forge deploy·E2E 미수행)** — 아래 1~3.
- 새 모듈 `src/permission/PermissionAssignment.js`(assertCanAssignPermissionSet: "자기가 가진 것까지만 배정", admin·PERMISSION_MANAGEMENT write 는 상한 없음, **시드 permission-Member(edit:false)는 면제** — 안 그러면 사용자 관리자가 사용자를 못 만든다). UserService(addUser/updateUser)·TeamService(addTeam/updateTeam/assignUsersToTeam) 5경로가 같은 판정. 컨트롤러는 principal 을 서비스 2번째 인자로 전달.
- `scopedProjectIds(undefined) → []`, 배치는 `SYSTEM_PRINCIPAL`(PrincipalResolver export) 명시.
- 가드 detail/inherited 는 스코프 사용자에게 projectId 필수. `searchRegisteredJiraUsers` 는 none 으로 변경.
- 테스트: test/permission/permissionAssignment.test.js, projectScopeGuard.test.js. 기존 UpdateUserMerge·SalaryPolicyLeak 는 PermissionAssignment 를 mock.
- 프론트: permissionError.permissionSetErrorMessage + permission.error.setEscalation/setNotFound 번역, 사용자/팀 모달 토스트.
- 경험 노트: claude-experiences/projects/moves-workforce/2026-09-03-permission-audit-rfc198.md

**감사 당시 지적 (우선순위순, 1~3 은 위에서 해소)**
1. USER_MANAGEMENT write가 `updateUserService`(UserService.js:497)로 자기에게 `permission-Admin` 배정 가능. TEAM_MANAGEMENT write도 `updateTeamService`로 팀에 Admin 세트 상속 가능. 세트 존재·Admin 여부·PERMISSION_MANAGEMENT 보유 검증 없음.
2. `scopedProjectIds(undefined)`가 null(=전체) 반환 → principal 누락 시 fail-open. `assertProjectIdWritable`은 fail-close라 규약 불일치.
3. `enforceProjectScope`는 `projectId ?? project_id` 없으면 skip. `searchRegisteredJiraUsers`는 detail 선언인데 payload `{keyword}`라 검증 0회. detail resolver의 실제 payload에 projectId 존재를 검사하는 계약 테스트 없음.
4. `clearPrincipalCache` 호출처 0, 세트 참조 무결성 없음(deletePermission이 team.permissionKey 미확인), `getSettingData` PUBLIC, PermissionMap 주석 stale(updateIssueCoworkers는 이미 assertIssueIdsInProject로 닫힘).
5. 설계 갭: 프로젝트 단위 역할(PM vs 팀원) 없음 — 별도 RFC 규모.

**Why:** 사용자가 "쉽게 설명"을 요청했고 집계 예외를 의도로 확정했다. 다음 권한 작업 때 같은 지적을 반복하지 않기 위함.
**How to apply:** 권한 관련 후속 요청 시 남은 4·5(세트 삭제 참조 검사·캐시 무효화·getSettingData PUBLIC·프로젝트 단위 역할)부터 제안. 집계 asApp은 건드리지 말 것. 세트 배정 UI 에서 배정 불가 세트 비활성화는 미구현(서버 거부만). 관련: [[permission-hardening]], [[team-management]], [[no-asapp]]
