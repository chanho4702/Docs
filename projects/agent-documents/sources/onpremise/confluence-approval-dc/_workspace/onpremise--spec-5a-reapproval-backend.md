# 배치 5a: 재승인 — 버전 기록 모델 (도메인 + 저장 + REST)

**시작 전에 반드시 `_workspace/design-reapproval.md`를 읽어라.** 이 배치는 그 설계의 §1(도메인),
§2(저장·REST)를 구현한다. §3(UI)은 다음 배치다.

## 반복 실수 금지 규칙
1. 파일 압축·재포매팅 금지 (statement 한 줄 하나, 200자 미만).
2. 지시 외 문구·주석 변경 금지.
3. 죽은 코드 금지 — 대체된 코드는 삭제.
4. 완료 기준을 스스로 검증하고 보고에 결과 포함.

## 수정 파일 (이외 금지)
- approval-domain/src/main/java/kr/dmove/confluence/approval/domain/ApprovalRequest.java
- approval-domain/src/test/java/... (ExpiryReasonTest 등 — 새 모델에 맞는 시나리오 재작성, §아래)
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/storage/ApprovalEntity.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/storage/ActiveObjectsApprovalRequestRepository.java
- approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/rest/ApprovalRestResource.java
- approval-confluence9/src/test/java/... (영향 테스트 최소 수정)

## 구현 내용

### 1. 도메인 — 만료 범위 축소 (설계 §1.1)
`ApprovalRequest`:
- `expireForContentVersion`: `status == PENDING`일 때만 만료. APPROVED는 어떤 경우에도 유지.
  기존 `wasApproved` 분기와 `EXPIRED_BY_EDIT_AFTER_APPROVAL` 사유 생성 코드는 제거하되,
  상수와 `requiresReapproval()`/`expiredByEdit()`는 기존 데이터 복원·표시용으로 유지 (주석으로
  "과거 데이터 전용, 새로 생성되지 않음" 명시).
- `expireIfDue` / `isDueForExpiry`의 `canExpire()`: PENDING 전용으로 변경. `canExpire` 메서드명이
  더 이상 분기 의미가 없으면 인라인해도 된다.
- 클래스 Javadoc의 만료 서술을 버전 기록 모델로 갱신.

### 2. 도메인 테스트 재작성
- ExpiryReasonTest 중 "승인 후 편집 → EXPIRED(AFTER_APPROVAL)" 시나리오 → "승인 후 편집 →
  APPROVED 유지 + expireForContentVersion이 false 반환"으로 재작성.
- "승인 후 마감 경과 → EXPIRED" 시나리오가 있으면 "APPROVED 유지"로 재작성.
- PENDING 편집 만료(CONTENT_VERSION)·마감 만료(DEADLINE) 시나리오는 그대로 유지·통과해야 한다.
- restore 경로로 EXPIRED_BY_EDIT_AFTER_APPROVAL 과거 데이터를 복원하면 requiresReapproval()이
  여전히 true인 것을 검증하는 테스트 1건 추가 (하위 호환).

### 3. 저장 — PREV_REQUEST_ID (설계 §2.1)
- `ApprovalEntity`에 `getPrevRequestId()/setPrevRequestId(String)` 추가 (nullable, AO가 자동 컬럼 추가).
- Repository에 `saveFlowId`와 같은 패턴으로 `savePrevRequestId(UUID requestId, String prevRequestId)`
  와 `findPrevRequestIds(Collection<UUID>)` (IN 절 배치 — findFlowIds 패턴 재사용) 추가.

### 4. REST — fromRequestId 결재선 재사용 (설계 §2.3)
`create()`에 `@QueryParam("fromRequestId") String fromRequestId` 추가:
- fromRequestId가 있고 steps가 blank면, 이전 요청을 조회해 단계 지정 문자열을 복원한다:
  - 이전 요청의 각 단계에서 구성원의 viaGroup(repository.findApproverViaGroups)이 있으면
    그 단계는 `group:{그룹명}`, 없으면 `user:{key}` (생성 규칙상 한 단계는 단일 그룹 또는 단일 사용자).
  - 복원한 문자열을 기존 resolveStepSpec 경로로 처리 → 그룹은 요청 시점 구성원으로 재확장.
  - 그룹이 삭제/비활성/구성원 0이면 400 + "결재선의 그룹 {이름}을 더 이상 사용할 수 없습니다. 결재선을 다시 구성해 주세요."
  - legacy(단계 순서 없는) 요청이면 같은 승인자 집합 + minimumApprovals 재사용.
- 클라이언트가 steps를 함께 보내면 steps 우선 (프리필 후 수정 케이스). 이때도 fromRequestId 연결은 저장.
- 이전 요청이 없거나 대상(target scope)이 다르면 400.
- 생성 성공 시 `repository.savePrevRequestId(request.id(), fromRequestId)` 호출.
- 응답 requestObject에 `previousRequestId` 필드 추가 (findPrevRequestIds로 일괄 조회 — requestsJson에서).

### 5. REST — stale 파생 (설계 §2.2, §3.3 서버 계산)
- requestObject에 `stale`(boolean) 추가: `status == APPROVED && 페이지 현재 버전 > approvedContentVersion`.
  페이지 버전은 requestsJson에서 pageManager로 페이지별 1회 조회해 재사용 (요청마다 중복 조회 금지).
  페이지가 없으면 false.

## 완료 기준 (자가 검증·보고)
- 도메인: APPROVED 요청에 expireForContentVersion/expireIfDue를 호출해도 상태 불변 (테스트로 증명).
- fromRequestId 경로: viaGroup 기반 그룹 재확장이 resolveStepSpec을 거치는지 코드로 확인.
- `git diff --check` 통과. mvn 불가 시 보고 (QA 수행).

## 코드 스타일
개별 import, statement 한 줄, 중괄호 필수, 주석 한국어(왜를 설명).
