# 재작업 8b-2 — QA FAIL 수정 (중대 2건 + 경미 2건)

너는 이 저장소의 구현 담당이다. 배치 8b 구현이 QA에서 FAIL했다. 아래 항목만 고쳐라. **다른 줄은 건드리지 마라.**

## 금지 목록 (위반 시 전체 재작업)
1. 기존 코드 재포매팅·압축 금지. 수정 지점 외의 줄 변경 금지.
2. 검증 게이트 우회·테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. approval-confluence10 수정 금지 (컴파일 확인만).
5. mvn clean/package/install 금지. git 커밋 금지.
6. APR_APV(승인자 테이블)에 role 컬럼 추가 금지.
7. 하지 않은 일을 했다고 보고하지 마라. **직전 보고의 "161 tests"는 허위였다(실측 107). 이번 보고는 게이트 출력의 "Tests run:" 줄을 그대로 인용하라.**
8. `ApprovalInboxServlet.java`·`ApprovalSettingsServlet.java`·`approval.css`에 있는 스펙 밖 diff(데코레이터 제목 숨김·아이콘 간격 보정)는 코디네이터의 직접 수정분이다 — **절대 건드리거나 되돌리지 마라.**

참고: 스펙 원문 `_workspace/spec-8b-cc-backend.md`, QA 상세 `_workspace/qa-8b.md`.

### R1 (중대) CC 알림이 중간 승인마다 발송된다 — 스펙 전제가 틀렸다
8b 스펙의 *"중간 단계 통과는 이벤트가 없으므로 자연히 제외"*는 **사실이 아니다.**
`approval-domain/.../ApprovalRequest.java:248-250`이 **승인 결정마다** `APPROVED` 이벤트를 추가하고,
상태 전이는 `:253-255`에서만 일어난다. 지금 구현은 3단계 결재선에서 CC에게 4번 알린다(설계 D6은 2번).

`NotificationRecipientResolver.resolve`에서 `recipients.addAll(ccKeys)`를 조건부로 바꿔라.
- `APPROVED`가 아닌 이벤트(REQUESTED/REJECTED/EXPIRED/CANCELLED) → 항상 합류
- `APPROVED` → `request.status() == ApprovalStatus.APPROVED` **이면서**
  그 이벤트가 `request.events()` 중 **마지막 APPROVED 이벤트**일 때만 합류
- `recipients.remove(event.actorKey())`는 지금처럼 합류 **뒤에** 유지할 것

**함정 (반드시 읽어라)**: `ApprovalNotificationService.enqueueFor`는 호출될 때마다
`request.events()` **전체를 재순회**한다. `status == APPROVED`만으로 게이트하면,
최종 승인 시점에 과거 중간 APPROVED 이벤트들이 전부 조건을 만족해
CC 알림이 한꺼번에 생성된다(`createIfAbsent` 키에 recipientKey가 들어가 중복 제거가 안 된다).
"마지막 APPROVED 이벤트" 식별이 필수다.

**테스트 필수** — 현재 테스트(`cc는_요청과_최종_결정_알림에_포함되고_actor는_제외된다`)는
승인자가 1명뿐이라 중간/최종을 구분하지 못하고 버그를 고정하고 있다. 승인자 2명 이상으로 바꿔서:
① 1단계 승인 직후 APPROVED 이벤트 → CC 미포함
② 최종 승인 후 마지막 APPROVED 이벤트에만 CC 포함, 이전 APPROVED에는 미포함
③ 서비스 레벨: 최종 승인까지 진행한 뒤 `enqueueFor` 호출 시 CC에게 적재된 in-app 행이 **정확히 2개**

### R2 (중대) CC에서 승인자 제거가 키 형식 불일치로 실패한다
`ApprovalRestResource.java:344-351`. `ccRecipients`는 `resolveUserKey`로 정규화됐는데
`removeAll` 대상인 `approvers`/`stepApprovers`는 원본 키다. 승인자 키에 username이 섞이는 것은
이 저장소의 알려진 사실이다(`:352-355` 주석, 설계 D3). 승인자를 username으로 지정하고
같은 사람을 CC에 넣으면 제거되지 않아 참조 탭에 중복 노출된다.
승인자 쪽도 `resolveUserKey`로 정규화한 뒤 `removeAll`하라.
**테스트**: 승인자=username, CC=같은 사람의 userKey인 create에서 CC가 비는지 검증.

### R3 (경미) `inClause` 중복 제거
`ActiveObjectsApprovalCcStore`의 private `inClause`를 지우고,
`chunks`를 재사용한 것과 같은 방식으로 `ActiveObjectsApprovalRequestRepository`의 것을
package-private static으로 공유하라. 8a의 `ActiveObjectsApprovalSignatureStore` 사본도 함께 정리.

### R4 (경미) FQN 인라인 정리
`ApprovalNotificationService.java:62`의 `java.util.Set<String>`을 상단 import로 옮겨라.
`ApprovalNotificationTest`의 `MemoryCcStore`도 동일.

### 게이트
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
**현재 C9 테스트는 107건이다(161이 아니다).** R1·R2의 신규 테스트로 몇 건이 되는지 실측해서 보고하라.
