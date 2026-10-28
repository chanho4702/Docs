# 배치 1: 백엔드 버그 수정 (approval-confluence9 + approval-domain)

코드 리뷰에서 확인된 버그를 수정한다. 아래 지시된 변경 외에는 어떤 파일도 손대지 말 것.

## 수정 1: 반려 사유 필수 설정이 강제되지 않는 버그

파일: `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/rest/ApprovalRestResource.java`

`decide()` 메서드의 현재 코드:

```java
ApprovalRequest request =
        approve
                ? workflowService.approve(id, actorKey)
                : workflowService.reject(
                        id,
                        actorKey,
                        reason);
```

문제: 3-인자 `reject`는 내부적으로 `rejectionReasonRequired=false`로 고정되어, 관리자 설정
`rejectionReasonRequired`가 저장만 되고 강제되지 않는다.

변경: 반려 경로에서 설정을 읽어 4-인자 오버로드에 전달한다.

```java
ApprovalRequest request =
        approve
                ? workflowService.approve(id, actorKey)
                : workflowService.reject(
                        id,
                        actorKey,
                        reason,
                        approvalSettings.read().rejectionReasonRequired());
```

참고: `ApprovalWorkflowService`에는 이미 `reject(UUID, String, String, boolean)` 오버로드가 있고,
도메인이 `REJECTION_REASON_REQUIRED` 예외를 던지면 decide()의 기존 catch가 400으로 매핑한다.
도메인 코드는 수정하지 말 것.

## 수정 2: 잘못된 expiresAt 형식이 500으로 터지는 버그

파일: 동일 (`ApprovalRestResource.java`)

`create()` 메서드의 현재 코드:

```java
Instant expiration = blank(expiresAt) ? null : Instant.parse(expiresAt.trim());
```

문제: `Instant.parse`가 던지는 `java.time.format.DateTimeParseException`은
`IllegalArgumentException`이 아니라서 create()의 catch에 걸리지 않고 500이 된다.

변경: parse를 try/catch로 감싸고 `IllegalArgumentException`으로 변환한다.

```java
Instant expiration;
try {
    expiration = blank(expiresAt) ? null : Instant.parse(expiresAt.trim());
} catch (DateTimeParseException exception) {
    throw new IllegalArgumentException("expiresAt은 ISO-8601 UTC 형식이어야 합니다. 예: 2026-08-31T15:00:00Z");
}
```

`java.time.format.DateTimeParseException` import를 추가한다.
주의: 이 코드는 `inTargetLock` 람다 안에 있다. 변수 재할당이 필요하므로 람다 안에서
선언 위치를 적절히 조정하되, 기존 마감일 우선순위 로직(화면 expiresAt → Flow → 전역 설정)은
그대로 유지할 것.

## 수정 3: 업무함 알림 중복(채널 미구분)과 마감 임박 알림 미표시

파일: 동일 (`ApprovalRestResource.java`), `notifications()` 메서드

현재 코드:

```java
for (ApprovalNotification notification : notificationStore.findForRecipient(recipientKey)) {
    try {
        Optional<ApprovalRequest> request = repository.find(UUID.fromString(notification.requestId()));
        if (request.isEmpty() || !canView(request.get())) {
            continue;
        }
        ApprovalEvent event = request.get().events().stream()
                .filter(value -> value.id().toString().equals(notification.eventId()))
                .findFirst()
                .orElse(null);
        if (event == null) {
            continue;
        }
        ...
```

문제 2가지:
(a) `findForRecipient`는 IN_APP과 EMAIL 행을 모두 돌려주는데 채널 필터가 없어, 이메일 알림이
켜진 설치에서는 같은 알림이 두 줄씩 표시된다.
(b) 마감 임박 알림의 eventId는 `"due-soon:{requestId}:{epochMillis}"` 합성 키라 감사 이벤트와
매칭되지 않아 `event == null → continue`로 영원히 표시되지 않는다.

변경:
(a) 루프 첫 줄에서 IN_APP이 아닌 행은 건너뛴다:

```java
if (!ApprovalNotificationService.IN_APP.equals(notification.channel())) {
    continue;
}
```

(b) eventId가 `"due-soon:"`으로 시작하면 감사 이벤트를 찾지 말고 다음 필드로 항목을 만든다:
- `"eventType"`: `"DUE_SOON"`
- `"reason"`: null
- `"occurredAt"`: `ApprovalJson.instant(notification.createdAt())`
- `"expiresAt"`: `ApprovalJson.instant(request.get().expiresAt())` — 이 키는 due-soon 항목에만 추가
- 나머지 키(id, requestId, pageId, pageTitle, approvedContentVersion, readAt)는 기존 항목과 동일하게 채운다.

일반 이벤트 경로는 기존 로직 그대로 유지하되, 일반 항목에도 `"expiresAt"` 키를 넣을 필요는 없다.
`ApprovalNotificationService`는 이미 import되어 있다.

## 수정 4: contentVersion을 클라이언트 값 대신 서버 페이지 버전으로 확정

파일: 동일 (`ApprovalRestResource.java`)

(a) `create()` 현재 코드:

```java
ApprovalTarget target =
        new ApprovalTarget(
                ApprovalResourceType.valueOf(resourceType.trim().toUpperCase()),
                pageId,
                regionKey,
                contentVersion);
```

문제: 클라이언트가 보낸 `contentVersion`을 그대로 신뢰한다. 실제 페이지 버전보다 큰 값을 보내면
이후 편집으로도 만료되지 않는 승인이 만들어진다.

변경: `denyPage(pageId, Permission.EDIT)` 통과 후(페이지 존재가 보장된 시점) 실제 페이지 버전을
읽어 사용한다. 파라미터는 하위 호환을 위해 남기되 값은 무시한다.

```java
AbstractPage page = pageManager.getPage(pageId);
int effectiveContentVersion = page.getVersion();
ApprovalTarget target =
        new ApprovalTarget(
                ApprovalResourceType.valueOf(resourceType.trim().toUpperCase()),
                pageId,
                regionKey,
                effectiveContentVersion);
```

(b) `expirePage()` 현재 코드:

```java
List<ApprovalRequest> expired = workflowService.expireForPageVersion(pageId, version);
```

변경: 같은 원칙으로 서버 버전을 사용한다 (denyPage 통과 후이므로 페이지는 존재).

```java
AbstractPage page = pageManager.getPage(pageId);
List<ApprovalRequest> expired = workflowService.expireForPageVersion(pageId, page.getVersion());
```

`version` 파라미터는 시그니처에 남기고 무시한다. `AbstractPage`는 이미 import되어 있다.

## 수정 5: 등록 그룹 삭제 시 공백 미정리

파일: 동일 (`ApprovalRestResource.java`), `deleteGroup()`

현재:

```java
activeObjects.deleteWithSQL(ApprovalGroupEntity.class, "GROUP_NAME = ?", groupName);
```

변경: 저장 경로(`saveGroup`)와 동일하게 trim한다.

```java
activeObjects.deleteWithSQL(ApprovalGroupEntity.class, "GROUP_NAME = ?", groupName.trim());
```

groupName이 null/blank면 400을 먼저 돌려준다 (blank 체크 추가).

## 수정 6: 이메일 수신자가 username으로 저장된 경우 발송 누락

파일: `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/notification/EmailNotificationChannel.java`

`deliver()` 현재 코드:

```java
ConfluenceUser recipient = userAccessor.getUserByKey(new UserKey(notification.recipientKey()));
```

문제: 승인자 키에는 user key가 원칙이지만 username이 섞일 수 있다(코드베이스 관례상 조회는
key→name 이중 조회). key 조회 실패 시 조용히 발송을 건너뛴다.

변경:

```java
ConfluenceUser recipient = userAccessor.getUserByKey(new UserKey(notification.recipientKey()));
if (recipient == null) {
    recipient = userAccessor.getUserByName(notification.recipientKey());
}
```

## 수정 7: 이미 통과한 단계의 승인자에게 나가는 오해성 메시지

파일: `approval-domain/src/main/java/kr/dmove/confluence/approval/domain/ApprovalRequest.java`

`ensureCurrentStep()` 현재 코드:

```java
private void ensureCurrentStep(String actorKey) {
    int stepOrder = stepOrderOf(actorKey);
    int currentOrder = currentStepIndex() + 1;
    if (stepOrder != currentOrder) {
        throw new ApprovalException(
                ApprovalErrorCode.APPROVER_STEP_NOT_REACHED,
                "아직 " + stepOrder + "단계 차례가 아닙니다. 현재는 " + currentOrder + "단계입니다."
        );
    }
}
```

문제: 자기 단계가 이미 통과된 경우(예: 2인 단계에서 요구 인원 1명이 먼저 승인)에도 "아직
차례가 아닙니다"라고 나간다. 방향이 반대다.

변경: 지난 단계와 미래 단계 메시지를 구분한다. 예외 코드와 차단 동작은 그대로 유지한다.

```java
private void ensureCurrentStep(String actorKey) {
    int stepOrder = stepOrderOf(actorKey);
    int currentOrder = currentStepIndex() + 1;
    if (stepOrder == currentOrder) {
        return;
    }
    String message = stepOrder < currentOrder
            ? stepOrder + "단계는 이미 통과되어 더 이상 결정할 수 없습니다. 현재는 " + currentOrder + "단계입니다."
            : "아직 " + stepOrder + "단계 차례가 아닙니다. 현재는 " + currentOrder + "단계입니다.";
    throw new ApprovalException(ApprovalErrorCode.APPROVER_STEP_NOT_REACHED, message);
}
```

## 회귀 가드 (바꾸면 안 되는 것)

- `dedupeKey`, `saveApprovers`, `saveNewEvents`, `isLegacyMinimum` 등 저장소 로직 일절 손대지 말 것.
- `denyPage`/`denyCurrent` 권한 검증 순서와 응답 코드 유지.
- `/approvals/users` 응답의 `key` 필드는 user key여야 한다 (username 반환으로 바꾸는 회귀 전례 있음).
- 기존 테스트(approval-domain, approval-confluence9의 src/test)는 수정하지 말고 통과해야 한다.
  단, 수정 7로 메시지 문자열을 검증하는 테스트가 깨지면 해당 assertion만 새 메시지에 맞게 갱신 가능.
- C10 모듈(approval-confluence10)은 이번 배치에서 손대지 말 것.

## 코드 스타일 (필수 준수)

- 개별 import만 사용, 와일드카드 import 금지.
- statement는 한 줄에 하나, 중괄호는 항상 사용.
- 기존 파일을 재포매팅하거나 여러 줄을 한 줄로 압축하지 말 것. 지시된 변경 외에는 손대지 말 것.
- 주석은 한국어로, 기존 주석 스타일(왜를 설명)을 따를 것.
