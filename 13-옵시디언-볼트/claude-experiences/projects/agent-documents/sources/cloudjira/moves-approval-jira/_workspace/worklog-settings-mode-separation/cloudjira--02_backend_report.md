# 백엔드 구현 보고서

## 구현 결과

- `worklogApprovalScopeOf()`로 운영 모드와 이슈 연결 여부를 한 곳에서 판정한다.
  - 단독 모드: 정상 입력 경로 워크로그가 승인 대상
  - 연동 모드: `effective.issueLinked === true`인 이슈만 승인 대상
- 연동 모드의 미연결 이슈는 자동 요청에서 출처 증명, 원장 관찰, Workforce 아웃박스, 승인 요청 저장 전에 `NOT_APPLICABLE`로 끝낸다.
- 수동 요청과 재승인 요청은 미연결 이슈에서 `WORKLOG_APPROVAL_SCOPE_EXCLUDED`로 거부한다.
- 조회는 기존 요청·결정·감사 이력을 유지하면서 `scope`를 반환하고 신규 요청/재승인 동작만 닫는다.
- 서명 검증 완료 `movesRms.org`의 `leads[]`가 있는 사용자만 연동 이슈에서 자기 워크로그 승인자로 자신을 선택할 수 있다.
  - 후보 목록: 기존 상위 팀장 뒤에 본인을 추가
  - 수동 요청: 본인 선택을 조건부 허용
  - 자동 요청: 상위 팀장 뒤에 본인을 추가하고 기존 이슈 열람 검사를 동일 적용
  - 결정 직전: 현재 연동 모드, 현재 이슈 연결, 현재 서명 검증 팀장 자격을 다시 확인
- `ApprovalService.beforeDecide`에 서버 `principal`과 `decision`을 전달한다. 자기 승인 재검증 실패 시 승인 저장 전에 `APPROVER_NOT_ELIGIBLE`로 닫는다.
- 승인 저장 구조는 바꾸지 않았다. 기존 조건부 승인자 UPDATE, 요청 CAS, append-only `APPROVED` 이벤트가 그대로 적용되며 `actor_key === requester_key`로 자기 승인을 감사에서 식별할 수 있다.

## resolver 계약

### 신규 `getWorklogApprovalIdentity`

- 권한: `SELF`
- 입력: 없음. 대상 사용자는 `request.principal.accountId`로 고정
- 실제 응답 shape:

```js
{
  status: 'DISABLED' | 'NONE' | 'VERIFIED',
  team: { teamKey, displayName } | null,
  leaders: Array<{ accountId, displayName, avatarUrl }>,
  isWorkforceTeamLead: boolean,
  ledTeams: Array<{ teamKey, displayName }>,
  selfApprovalAllowed: boolean,
}
```

표시 이름 조회에 실패한 팀장은 식별자를 화면에 노출하지 않도록 `leaders`에서 제외한다. 권한 판정은 표시 이름이 아니라 서명 검증 조직 원문을 사용한다.

### 확장 `listWorklogApprovalCandidates`

```js
{
  users,
  defaultApproverIds,
  needsApprover,
  scope: {
    mode: 'LINKED' | 'STANDALONE',
    eligible: boolean,
    reason: null | 'WORKFORCE_ISSUE_NOT_LINKED',
  },
  selfApprovalAllowed: boolean,
}
```

미연결 이슈는 `users: []`, `defaultApproverIds: []`, `needsApprover: false`를 반환한다.

### 확장 `getWorklogCertification`

기존 응답을 유지하면서 다음 필드를 추가한다.

```js
{
  scope: {
    mode: 'LINKED' | 'STANDALONE',
    eligible: boolean,
    reason: null | 'WORKFORCE_ISSUE_NOT_LINKED',
  },
  selfApprovalAllowed: boolean,
}
```

범위 제외 시 기존 상태·승인 이력은 반환하지만 `canRequest`와 `canAppeal`은 `false`다.

### 자동 요청 범위 제외 응답

```js
{
  status: 'NOT_APPLICABLE',
  created: false,
  scopeReason: 'WORKFORCE_ISSUE_NOT_LINKED',
}
```

## resolver 등록

- `WorklogCertificationController`: `guardedDefine('getWorklogApprovalIdentity', ...)`
- `PermissionMap`: `getWorklogApprovalIdentity: 'SELF'`
- 기존 `registerWorklogCertificationController`가 이미 `CONTROLLER_REGISTRARS`에 있어 추가 registrar 변경은 없다.
- 권한 계약 테스트로 등록 키와 `PermissionMap` 일치를 확인했다.

## 스키마·Jira 권한

- 마이그레이션: 없음
- 테이블/컬럼: 변경 없음
- manifest 모듈/scope: 변경 없음
- 신규 `asApp` 사유: 없음
- 자동 요청의 작성자 조직 조회는 기존 허용 사유 `worklog-approval-author-org`를 그대로 사용한다.

## 검증

실행 명령:

```text
npx jest src/resolver/worklogCertification src/resolver/approval src/resolver/workforce src/domain/worklogCertification test/permission/permissionMap.contract.test.js --runInBand
```

결과:

- Test Suites: 36 passed, 36 total
- Tests: 539 passed, 539 total
- `git diff --check`: 통과

에이전트 단계 규칙에 따라 전체 bundle/UI build/Forge lint는 실행하지 않았다. 모든 에이전트 완료 후 최종 검증 단계에서 실행해야 한다.

## 잔여 리스크

- 연결 해제된 기존 PENDING 요청은 일반 승인자가 계속 결정할 수 있다. 감사 이력과 기존 요청 보존을 위한 설계 선택이다.
- 해당 요청에서 작성자 본인이 승인자인 경우에는 결정 직전 현재 연결·팀장 자격을 재검증하므로, 연결 해제 뒤 자기 승인은 거부된다.
- 팀장 표시 이름 조회가 실패하면 설정 화면의 팀장 이름은 축소 표시되지만 승인 자격 판정에는 영향을 주지 않는다.

## 발견

- 별도 범위의 결함은 발견하지 않았다.
