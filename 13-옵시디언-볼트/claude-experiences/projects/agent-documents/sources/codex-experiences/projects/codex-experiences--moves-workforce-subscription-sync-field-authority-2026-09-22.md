# Moves Workforce 수동 구독 동기화 필드 조회 권한 (2026-09-22)

## 증상
프로젝트 상세의 `지금 동기화` 실행 시 `moves_RMS_projectId field not found`가 반환됐다.

## 원인
수동 동기화만 `getProjectIdFieldIdApi()` 기본값인 `asUser()`로 `/rest/api/3/field`를 조회했다. 사용자 권한이나 Jira 응답 범위에 따라 앱의 readOnly 필드가 목록에서 빠지면, 실제 필드가 있어도 `null`로 판정됐다. 예약 동기화·이벤트·백필·삭제는 이미 `getProjectIdFieldIdApi('app')`를 사용하고, 실제 쓰기도 `/rest/api/3/app/field/{fieldId}/value`를 `asApp()`으로 호출한다.

## 결정
수동 동기화의 앱 소유 필드 식별도 `asApp()`으로 통일했다. 필드 key 매칭은 표시 이름 `moves_RMS_projectId`가 아니라 manifest module key `projectIdField`를 사용한다.

## 회귀 방지
`ProjectSubscriptionSync.test.js`에서 수동 동기화가 `getProjectIdFieldIdApi('app')`를 호출하고 해당 ID를 sweeper에 전달하는지 검증한다.

## 연결
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-deletion-hardening-2026-09-22|moves-workforce-project-deletion-hardening-2026-09-22]]
