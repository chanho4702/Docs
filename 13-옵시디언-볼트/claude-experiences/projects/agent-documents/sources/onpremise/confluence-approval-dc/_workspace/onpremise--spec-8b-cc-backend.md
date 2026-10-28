# 배치 8b — CC 참조자 백엔드 (APR_CC + 알림 + /mine/cc)

너는 이 저장소의 구현 담당이다. 아래 스펙을 **그대로** 구현하라. 설계 배경: `_workspace/design-batch8.md` (D5~D7). 배치 8a(서명·PIN 백엔드)가 이미 적용된 트리 위에서 작업한다.

## 금지 목록 (위반 시 전체 재작업)
1. **기존 코드 재포매팅·압축 금지.** 수정 지점 외의 줄을 건드리지 마라.
2. 검증 게이트 우회 금지 — 조건 바꿔치기·테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. Java text block 안의 정규식은 `\\d`처럼 이스케이프 두 배.
5. `Map.putIfAbsent` null 마커 맵에는 containsKey 가드.
6. **approval-confluence10 수정 금지** (컴파일 확인만).
7. `mvn clean`/`package`/`install` 금지. 아래 게이트 명령만.
8. **git 커밋 금지.**
9. **하지 않은 일을 했다고 보고하지 마라.**
10. **APR_APV(승인자 테이블)에 role 컬럼을 추가하지 마라. CC는 반드시 별도 테이블이다.** (승인자 저장 로직 `saveApprovers`가 모르는 행을 삭제하므로 role 방식은 데이터 유실을 만든다.)

## 배경 (실측 완료 — 재조사 불필요)
- create REST: `ApprovalRestResource.java:141-156` — QueryParam만.
- resolver: `notification/NotificationRecipientResolver.java:11-45` — `resolve(ApprovalRequest, ApprovalEvent)`, 이벤트 타입 switch, 마지막에 본인 제외(:42). 생성 지점: `ApprovalNotificationService.java:25,33,40`의 `new NotificationRecipientResolver()`.
- enqueue: `ApprovalNotificationService.enqueueFor(request)` :53-66.
- /mine/requested 패턴: `ApprovalRestResource.java:363-385` → 공통 `mineResponse(...)` :1054-1102, badges :1211-1222.
- 배치 하이드레이션: `ActiveObjectsApprovalRequestRepository.findAllByIds` (배치 7에서 추가됨).
- 그룹 스냅샷 확장: create 경로에서 approverGroups를 요청 시점 구성원으로 확장하는 기존 코드를 찾아 (ApprovalRestResource create 부근) CC 그룹도 같은 유틸을 재사용하라.
- AO 함정: unique 없음(이 테이블은 unique 불필요), 조회 컬럼 `@StringLength` + `@Indexed` 필수.

## 변경 1 — APR_CC 엔티티 + 저장소
새 파일 `storage/ApprovalCcEntity.java`:
```java
@Table("APR_CC")
public interface ApprovalCcEntity extends Entity {
    @Indexed @StringLength(64) String getRequestId(); void setRequestId(String v);
    @Indexed @StringLength(255) String getRecipientKey(); void setRecipientKey(String v);
    Long getCreatedAtMillis(); void setCreatedAtMillis(Long v);
}
```
새 파일 `storage/ApprovalCcStore.java` + `storage/ActiveObjectsApprovalCcStore.java`:
- `void saveAll(UUID requestId, Collection<String> recipientKeys, Instant now)` — 기존 행 조회 후 없는 것만 create(중복 방지). 요청 생성 시 1회 호출.
- `Set<String> findRecipients(UUID requestId)`.
- `Map<UUID, Set<String>> findRecipientsBatch(Collection<UUID> requestIds)` — REQUEST_ID IN 청크 조회(기존 `chunks()`/IN 배치 관례 `ActiveObjectsApprovalRequestRepository` 참조, 청크 500).
- `List<UUID> findRequestIdsByRecipient(String recipientKey)`.
`atlassian-plugin.xml` `<ao>`에 entity 추가.

## 변경 2 — create에 ccKeys/ccGroups
`ApprovalRestResource.create` (:141-156)에 `@QueryParam("ccKeys") String ccKeys, @QueryParam("ccGroups") String ccGroups` 추가:
- CSV 파싱(기존 approverKeys 파싱 관례 재사용). ccGroups는 요청 시점 구성원으로 확장(기존 그룹 확장 유틸 재사용, 등록 그룹 검증도 동일 규칙).
- 정규화: 각 키를 userKey로 정규화(기존 이중 조회 관례 — username이 오면 userKey로). 
- **요청자 본인과 요청의 eligible 승인자 키는 CC 집합에서 제거** (승인자는 이미 당사자 알림 수신).
- 요청 저장 성공 후 `ccStore.saveAll(...)`. CC가 비면 호출 생략.
- 재승인(fromRequestId) 경로에서 CC 승계는 **하지 않는다** (요청마다 명시 지정).

## 변경 3 — 알림 (resolver 3-인자)
- `NotificationRecipientResolver.resolve(ApprovalRequest, ApprovalEvent)` → `resolve(ApprovalRequest, ApprovalEvent, Set<String> ccKeys)`로 확장 (기존 2-인자를 지우고 호출부 전부 수정 — 오버로드 잔존 금지, 죽은 코드 방지).
- ccKeys 합류 규칙: `REQUESTED`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` 분기에서 기존 수신자 집합에 ccKeys 전부 add. **중간 단계 통과(부분 승인)는 이벤트가 없으므로 자연히 제외.** 본인 제외(:42) 규칙은 ccKeys 합류 **후에** 적용되어야 한다(순서 유지).
- `resolveDueSoon`은 CC 미포함 (마감 임박은 결재 당사자용).
- `ApprovalNotificationService.enqueueFor` :53-66에서 `ccStore.findRecipients(request.id())` 1회 조회 후 resolver에 전달. ApprovalNotificationService 생성자에 ccStore 의존 추가 — 생성 지점들(:25,33,40 부근과 이 서비스를 만드는 곳 전부)을 수정.
- 이메일 경로는 무수정 (기존 게이트 그대로 통과).
테스트: `notification/NotificationRecipientResolverTest`(기존 파일 있으면 케이스 추가): REQUESTED에 CC 포함, APPROVED에 CC 포함, CC 본인이 actor면 제외, resolveDueSoon 미포함.

## 변경 4 — /mine/cc + badges.cc + JSON cc[]
- `GET /approvals/mine/cc` 신설 — `/mine/requested`(:363-385)와 동일 파라미터 세트. 소스: `ccStore.findRequestIdsByRecipient(currentUserKey)` → `repository.findAllByIds(...)` → 기존 `mineResponse(...)` 재사용. mineResponse에 구분 플래그가 필요하면 requested 플래그와 같은 방식으로 확장(예: enum 또는 boolean cc 파라미터 — 기존 시그니처를 보고 최소 변경 선택).
- badges: cc 뷰 응답의 badges는 `{"cc": <PENDING 건수>}`만 (requested 분기 :1211-1215와 동일 패턴).
- 상세 JSON(`requestJson` :1380-1478)에 `cc` 배열 추가: `[{key, displayName}]` — CC가 없으면 빈 배열이 아니라 **키 자체 생략** (응답 불변 원칙). displayName은 기존 이중 조회 관례(:1486-1503) 재사용.
- `/mine`·`/mine/requested` 목록 항목에는 cc를 넣지 않는다 (목록 비대 방지) — 상세(단건 GET)와 /mine/cc 항목에만.
  - /mine/cc 목록 항목은 기존 항목 직렬화 그대로 재사용(추가 필드 불필요).

## 게이트 (전부 실행하고 결과를 보고에 포함)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
- 완료 보고: 변경 파일 목록(신규/수정 구분) + 게이트 결과 + 미완 항목(있으면 정직하게).
