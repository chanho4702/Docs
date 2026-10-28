# 배치 6a: 취소(CANCELLED)·요청 메모·영역 해시 — 도메인 + 저장 + REST

고객 피드백(게시글 단위 결재 운영) 반영 백엔드. UI는 다음 배치(6b, design-batch6.md 기반).

## 반복 실수 금지 규칙
압축·재포매팅 금지(한 줄 200자 미만) / 지시 외 변경 금지 / 죽은 코드 금지 / "전부 삭제·이관" 지시는
끝까지 수행 / putIfAbsent는 null 값을 부재로 취급하므로 null 마커 맵에 금지 / 원시 제어 문자 삽입 금지 /
완료 기준을 자가 검증하고 결과를 보고에 포함.

## 수정 파일
- approval-domain: ApprovalStatus, ApprovalEventType, ApprovalRequest, ApprovalWorkflowService,
  ApprovalErrorCode(필요 시), 도메인 테스트
- approval-confluence9: ApprovalEntity, ActiveObjectsApprovalRequestRepository, ApprovalRestResource,
  ApprovalSettings(라벨), ApprovalRegionSupport(+테스트), ApprovalPageUpdateListener,
  NotificationRecipientResolver, EmailNotificationMessage/EmailNotificationChannel(메모·취소 반영),
  관련 테스트

## 1. CANCELLED 상태 (도메인)
- `ApprovalStatus.CANCELLED`, `ApprovalEventType.CANCELLED` 추가.
- `ApprovalRequest.cancel(String actorKey, String reason, Instant now)`:
  - PENDING에서만 허용. 아니면 `APPROVAL_ALREADY_CLOSED` 예외 (기존 ensureOpen 재사용).
  - actorKey는 취소 주체 기록용(권한 판정은 REST) — null 금지, trim.
  - CANCELLED 이벤트(reason nullable) 추가, status=CANCELLED, updatedAt 갱신.
  - 만료 경로(canExpire/isDueForExpiry/expireForContentVersion)는 CANCELLED에 반응하지 않아야 한다.
- `ApprovalWorkflowService.cancel(UUID requestId, String actorKey, String reason)` — withRequestLock + save.
- dedupeKey: CANCELLED는 closed 취급(기존 로직이 `PENDING ? open : closed`라 자동 충족 — 확인만).
- 도메인 테스트: PENDING→CANCELLED 성공(이벤트·사유), APPROVED/REJECTED/EXPIRED/CANCELLED에서 취소
  시 예외, 취소 후 편집·마감에 불변, restore 왕복. 한국어 메서드명.

## 2. 요청 메모 (도메인 + REST)
- 도메인: create/createSequential에 `requestMessage`(nullable, trim, blank→null) 전달 →
  `created()`의 REQUESTED 이벤트 reason으로 저장. restore 경로는 변경 불필요(이벤트로 복원됨).
  `requestMessage()` 접근자: 첫 REQUESTED 이벤트의 reason 반환.
- WorkflowService request/requestSequential 오버로드에 requestMessage 추가 (기존 시그니처는 유지하고
  위임 — 호출부 호환).
- REST create: `@QueryParam("requestMessage")` (trim, 500자 초과면 400 "요청 메모는 500자 이하").
  requestObject에 `requestMessage` 필드 추가.
- 알림: REQUESTED 이메일 본문에 메모 포함 (EmailNotificationMessage Context에 필드 추가 — 기존
  reason 자리와 구분. EXPIRED reason 처리와 섞지 말 것).

## 3. 취소 REST + 알림
- `POST /approvals/{requestId}/cancel?actorKey={key}&reason={optional}`:
  - 로그인 + 대상 페이지 VIEW + (actorKey가 본인) 검증은 decide()와 동일 패턴.
  - 권한: 요청자 본인(requesterKey와 userKey/username 매칭) **또는** isAdministrator(). 아니면 403
    "요청자 또는 관리자만 회수할 수 있습니다."
  - 성공 시 notificationService.enqueueSafely(request).
- NotificationRecipientResolver: CANCELLED → 수신자 = 아직 결정하지 않은 승인자 + (취소자가 요청자가
  아니면) 요청자. actorKey(취소자)는 제외(기존 규칙).
- EmailNotificationMessage: CANCELLED 문구 ("승인 요청이 회수되었습니다" + 사유 있으면 표기).
- ApprovalSettings statusLabels에 CANCELLED 기본 라벨 "회수" 추가 (read/save/updateSettings 검증 포함).
- 업무함 REST(/mine 등)는 상태 필터 파싱이 valueOf라 자동 수용 — 확인만.

## 4. 영역 해시 (게시글 단위 정밀화)
- `ApprovalRegionSupport`에 추가:
  - `static Map<String, String> regionBodies(String storageFormat)` — approval-region 매크로별
    (key → 정규화 body). key 미지정은 DEFAULT_KEY. 중복 key는 첫 번째 것 사용.
  - 정규화: rich-text-body 내부 문자열 trim + 연속 공백(스페이스/탭/개행)을 단일 스페이스로.
    과도한 정규화(태그 제거 등) 금지 — 목적은 편집기 왕복 노이즈 흡수.
  - `static String regionHash(String normalizedBody)` — SHA-256 hex 32자
    (ApprovalLockNames.shortHash와 같은 방식이되 여긴 c9 유틸로).
  - 단위 테스트: 공백 변형 동일 해시, 내용 변경 상이 해시, 매크로 추출(중첩·다중 key).
- `ApprovalEntity`에 `REGION_HASH`(nullable string) + repository save/restore에 통과시키지 않고
  adapter 전용 setter/getter(saveFlowId 패턴): `saveRegionHash(UUID, String)`, requestObject 노출 불필요.
- REST create: `@QueryParam("regionHash")` — CONTENT_REGION일 때만 저장 (blank면 저장 안 함).
- **리스너(ApprovalPageUpdateListener) 개편**:
  - PageUpdateEvent 시 페이지의 PENDING 요청을 대상별로 처리:
    - PAGE 요청: 기존 expireForPageVersion 유지.
    - CONTENT_REGION 요청 + REGION_HASH 있음: 새 storage format에서 regionBodies 추출 →
      (a) 해당 key 부재 → **취소** (cancel, actorKey="system", 사유 "REGION_REMOVED" — reason 문자열 상수),
      (b) 해시 다름 → 편집 만료(expireForContentVersion 경로 — 단 페이지 버전 조건이 이미 참),
      (c) 해시 같음 → 유지.
    - CONTENT_REGION + 해시 없음(기존 데이터): 기존 페이지 버전 만료 폴백.
  - 리스너가 storage format을 얻는 방법: event.getPage().getBodyAsString().
  - cancel의 actorKey "system": 도메인 cancel은 actorKey 필수 — "system" 리터럴 사용을 허용하되
    NotificationRecipientResolver에서 취소자 제외 규칙과 충돌 없는지 확인.
- **stale 판정 정밀화**: 매크로(ApprovalRegionMacro)의 stale 계산은 6b(UI 배치)에서 해시 비교로
  바꾼다 — 이번 배치에서는 REST requestObject의 `stale`만: CONTENT_REGION + REGION_HASH 있는 요청은
  현재 페이지 storage에서 해당 영역 해시를 구해 비교(다르면 stale), 해시 없으면 기존 버전 비교.
  (pageManager.getPage(pageId).getBodyAsString() — requestsJson에서 페이지당 1회 캐시, 기존 버전
  캐시와 함께.)

## 완료 기준 (자가 검증·보고)
- 도메인·c9 전체 테스트 green (mvn 가능 시 실행; 불가 시 시나리오 손추적 보고 — 특히
  취소 전이표, 영역 해시 3케이스(유지/만료/제거취소)).
- CANCELLED가 만료 sweep·lazy expiration에 절대 걸리지 않음을 코드로 확인.
- git diff --check 통과.

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 주석 한국어(왜를 설명).
