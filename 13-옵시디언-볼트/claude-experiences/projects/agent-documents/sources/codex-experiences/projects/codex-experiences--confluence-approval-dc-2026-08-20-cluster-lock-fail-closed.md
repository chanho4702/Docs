# Confluence Approval DC — cluster lock fail-closed

## 배경

Confluence 9 adapter의 `ClusterApprovalLockService.fromOsgi()`가 `ClusterLockService` 조회 실패 시
`ApprovalLockService.NO_OP`로 대체되고 있었다. 이 경로는 다중 node에서 같은 승인 요청을 동시에
변경할 때 read-modify-write 상태 전이가 유실될 위험이 있다.

## 결정

- OSGi 서비스 조회 실패 시 `NO_OP`를 사용하지 않는다.
- `ApprovalErrorCode.APPROVAL_LOCK_TIMEOUT`을 포함한 `ApprovalException`을 발생시키는 fail-closed
  구현을 반환한다.
- REST 경계는 이미 이 오류 코드를 HTTP 409 Conflict로 변환하므로, 클라이언트에는 재시도 가능한
  상태 변경 실패로 전달된다.
- `approval-domain`에는 Atlassian 의존성을 추가하지 않았다.

## 검증

- `ClusterApprovalLockServiceTest`로 fail-closed 구현이 action을 실행하지 않고 예외를 던지는지 확인했다.
- `mvn -B -pl approval-confluence9 -am package` 성공: domain 61건, Confluence 9 adapter 187건 테스트 통과.

## 후속 검증

실제 다중 node 환경에서 같은 요청에 대한 동시 승인·반려와 node 장애 중 lock 서비스 가용성을 검증한다.
