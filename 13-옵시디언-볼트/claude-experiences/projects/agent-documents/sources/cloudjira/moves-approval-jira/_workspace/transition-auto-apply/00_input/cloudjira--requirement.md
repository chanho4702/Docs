# 상태 전환 승인 후 자동 적용 요구사항

## 사용자 요구

현재 상태 전환 승인은 승인 완료 후 사용자가 Jira 전환을 다시 실행해야 한다. 사용자는 상태 변경 시 승인 요청을 만들고, 최종 승인되면 승인된 목적 상태로 실제 Jira 이슈 상태가 자동 변경되기를 요구한다.

## 제품 해석

1. 요청자가 전환 승인 요청을 만들 때 기존처럼 issueId, fromStatusId, transitionId, toStatusId와 Flow를 고정한다.
2. 최종 승인 전에는 Jira 이슈 상태가 바뀌지 않는다.
3. 최종 승인 직후 앱이 고정된 transitionId로 Jira transition REST를 자동 실행한다.
4. 실행 주체는 요청자다. `api.asUser(requesterAccountId)` offline impersonation을 사용하여 요청자의 현재 Jira 권한·워크플로 조건을 그대로 적용하고 Jira 이력의 행위자도 요청자로 보존한다. 최종 결재자의 권한으로 대신 전환하지 않는다.
5. 실행 직전 현재 상태가 fromStatusId인지, transitionId가 현재도 toStatusId로 가능한지, 프로젝트 규칙/승인 요청이 여전히 유효한지 재확인한다.
6. 승인 상태와 전환 적용 상태를 분리한다. 최소 상태는 WAITING/APPLYING/APPLIED/FAILED/UNKNOWN/BLOCKED이며 CAS와 owner predicate를 사용한다.
7. Jira POST 뒤 timeout/network/5xx 또는 SQL 확정 실패는 UNKNOWN으로 남기고 자동 재POST하지 않는다. 현재 상태/changelog 대조로 성공 여부를 확인할 수 있어야 한다. 동일 승인으로 중복 전환하지 않는다.
8. 권한 상실, 필수 transition screen 필드, workflow 조건 변경 등 안전한 실패는 FAILED/BLOCKED와 구체적 code로 표시한다. 요청자에게 재시도 또는 관리자 확인 경로를 제공한다. 이미 목적 상태에 도달했다면 changelog/소비 근거를 확인해 APPLIED 또는 수동 확인으로 처리하고 다른 경로 변경을 승인 성공으로 위조하지 않는다.
9. 함수형 workflow validator는 유지한다. 앱의 자동 POST도 validator를 통과하고 승인 요청은 한 번만 소비한다. 기존 외부/수동 전환 방어를 약화하지 않는다.
10. 승인 상세·업무함·알림·증명서·한영 가이드에서 `승인 상태`와 `상태 변경 적용 상태`를 분리하고, 최종 승인 후 자동 적용·실패·UNKNOWN의 조치 방법을 충분히 고지한다.

## 보안·플랫폼 제약

- Atlassian 공식 문서상 backend `api.asUser(accountId).requestJira`는 offline user impersonation scope 선언이 필요하다. manifest scopes를 map으로 바꾸고 실제 필요한 `read:jira-work`/`write:jira-work` 중 최소 범위만 `allowImpersonation:true`로 설정한다. `storage:app`, `read:jira-user`에는 impersonation을 주지 않는다.
- scope/module 변경이므로 설치 시 `forge install --upgrade`가 필요하고 Marketplace 보안/개인정보 문서에도 requester impersonation 목적을 고지한다.
- asApp 전환 write는 사용하지 않는다. 엔티티 프로퍼티를 판정 근거로 사용하지 않는다.
- 실제 Jira transition POST가 Forge workflow validator를 재진입해 승인 후보를 통과하는지, history actor가 requester인지, offline impersonation consent/지원 범위는 개발 사이트 실측 항목이다.

## 완료 기준

- 최종 승인 전 Jira transition POST 0회.
- 최종 승인 CAS 승자만 자동 transition POST 최대 1회.
- 같은 결정/재시도/동시 호출에서 POST 1회 이하.
- POST 후 모호한 결과는 자동 재POST 0회.
- 반려·만료·취소 시 POST 0회.
- 요청자 권한 상실과 현재 상태 변경을 fail-closed 처리.
- validator 소비/trigger reconciliation과 자동 적용 ledger가 모순 없이 수렴.
- 기존 수동 승인 전환 방어와 transition 변경 감지 회귀 통과.
- kr/en UI·가이드 및 resolver 3종 등록, 신규 테이블 readiness, CAS rev 증가 검증.

## 공식 근거

- Forge requestJira: `api.asUser(accountId)`는 offline user impersonation scope가 필요하다.
  https://developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/
- Forge manifest permissions: impersonation 대상 scope를 map으로 선언하고 `allowImpersonation:true`를 사용한다.
  https://developer.atlassian.com/platform/forge/manifest-reference/permissions/
- Jira transition REST: `POST /rest/api/3/issue/{issueIdOrKey}/transitions`, 사용자는 Browse projects와 Transition issues 권한 및 workflow 조건을 만족해야 한다.
  https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/
