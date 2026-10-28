# 스펙 7a — 성능·기반 백엔드 (배치 하이드레이션·서버 페이징·알림 스키마·규칙 명문화)

설계 원문: `_workspace/design-batch7.md` (필독 — 결정 D1~D7과 근거). 이 스펙이 설계와 다르면 스펙이 우선.

## 반복 실수 금지 (위반 = 즉시 FAIL)
1. **파일 재포매팅 금지** — 손대는 줄만 수정. 파일을 한 줄로 압축하거나 들여쓰기 스타일을 바꾸지 마라.
2. **검증 게이트 우회 금지** — 테스트를 통과시키기 위해 테스트/조건을 바꿔치기하지 마라. 기존 테스트 의미 변경 금지(깨지면 원인을 고쳐라).
3. **원시 제어 문자 금지** — 소스에 NUL 등 비인쇄 문자를 넣지 마라.
4. Java text block 안 이스케이프: `\d` 불법 — `\\d`. `\(` 불법 — `\\(`.
5. `Map.putIfAbsent`는 null 값을 "부재"로 본다 — null 마커 맵에는 `containsKey` 가드.
6. **C10(approval-confluence10) 파일 수정 금지.** 단 컴파일은 깨지면 안 된다(도메인 시그니처 변경 시 주의).
7. **빌드는 테스트만**: 로컬 dev 인스턴스가 실행 중이다. `clean`·`package`·`install` 금지. 아래 검증 게이트 명령만 사용.
8. git 커밋 금지 (오케스트레이터가 한다).

## 검증 게이트 (전부 통과해야 완료)
cmd.exe 기준, 저장소 루트에서:
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -pl approval-confluence10 compile
```
(mvn은 PATH에 없다. 두 번째 명령은 컴파일만 — 패키징하면 실행 중 인스턴스가 죽는다.)

## 변경 1 — 저장소 배치 하이드레이션 (`approval-confluence9/.../storage/ActiveObjectsApprovalRequestRepository.java`)

`findByApproverKey`, `findByRequesterKey`, `findByPageId`의 "행마다 `find(UUID)`" 패턴(요청 N건 = 3N+1 쿼리)을 제거한다.

1. 내부 헬퍼 `private List<ApprovalRequest> hydrate(Collection<String> requestIds)` 신설:
   - requestIds를 **500개 단위 청크**로 나눠, 청크마다 정확히 3쿼리:
     `ApprovalEntity WHERE REQUEST_ID IN (...)`, `ApprovalApproverEntity WHERE REQUEST_ID IN (...)`, `ApprovalEventEntity WHERE REQUEST_ID IN (...)`.
   - requestId별로 그룹핑해 기존 `toRequest` 조립 로직과 **동일한 규칙**(승인자 정렬, 이벤트 정렬, legacy STEP_ORDER=0 처리)으로 `ApprovalRequest`를 만든다. 기존 `toRequest`를 "이미 로드된 행 배열"을 받는 오버로드로 분리해 재사용하라 — 조립 규칙 이중화 금지.
   - 입력 순서 무관하게 안정적으로 돌려주고, 호출부가 정렬한다.
2. 세 조회 메서드는 후보 ID 수집 1쿼리(현행 유지) + `hydrate` 1회로 재작성. 중복 제거는 `LinkedHashSet`(O(N²) `noneMatch` 제거).
3. **동일 결과 보장**: 반환 집합·각 aggregate의 내용이 기존 구현과 동일해야 한다. 기존 테스트가 그대로 통과해야 하고, 아래 신규 테스트로 고정한다.
4. IN 절 파라미터는 AO `Query.select().where("REQUEST_ID IN (?, ?, ...)", ids...)` 형태 — 물음표 개수를 청크 크기에 맞춰 생성.

메타 컬럼 통합 읽기:
5. `findFlowIds`/`findPrevRequestIds`/`findRegionHashes`(같은 APR_REQ를 3번 IN 조회)를 대체하는 `Map<UUID, RequestMeta> findMeta(Collection<UUID> ids)` 신설 — REQ IN 1쿼리로 `flowId`·`prevRequestId`·`regionHash` 세 값을 한 번에. `RequestMeta`는 record(3필드, null 허용). 기존 3개 메서드는 유지하되 사용처(ApprovalRestResource)가 findMeta로 옮겨가면 내부 위임 또는 그대로 둔다(삭제 금지 — C10 아님, 외부 사용 없음 확인 시 삭제 가능).
6. `findApproverViaGroups(UUID)`의 배치판 `Map<UUID, Map<String, String>> findApproverViaGroupsBatch(Collection<UUID> ids)` 신설 (APV IN 1쿼리).

## 변경 2 — 도메인 pageSnapshot (`approval-domain/.../ApprovalWorkflowService.java`)

- `public List<ApprovalRequest> pageSnapshot(long pageId)` 신설: `findByPageId` 1회 로드 후, `findLatestPageRequest`가 현재 수행하는 **만료 sweep(expireIfDue 저장) 부수효과를 동일하게** 적용한 목록을 반환. `findLatestPageRequest`는 pageSnapshot에 위임하도록 리팩터링(의미 변화 0 — 기존 도메인 테스트가 감시).
- 도메인 `ApprovalRequestRepository` **인터페이스에 새 abstract 메서드를 추가하지 마라** (C10이 구현 중). 추가가 불가피하면 `default` 구현 필수.

## 변경 3 — 패널·매크로 렌더 이중 로드 제거

- `ApprovalPagePanel`: 렌더당 `workflowService.findLatestPageRequest` + `approvedHistory`가 각각 `findByPageId`를 불러 2회 로드. → `pageSnapshot` 1회 결과에서 latest와 history를 모두 파생. 화면 출력(HTML)은 **바이트 단위로 기존과 동일**해야 한다.
- `ApprovalRegionMacro`: 동일하게 매크로당 pageSnapshot 1회로 region latest·history 파생. (기존 `findLatestContentRegionRequest`의 최신 선택 규칙 — revision·updatedAt — 을 그대로 재현.)

## 변경 4 — 서버 페이징·필터 REST (`ApprovalRestResource.java`)

`GET /approvals/mine`과 `GET /approvals/mine/requested` 를 공통 계약으로 확장:

파라미터 (전부 optional):
- `limit` 기본 50, 1~200 클램프(0 이하·비숫자는 50, 200 초과는 200)
- `offset` 기본 0, 음수는 400 `{"error":"offset은 0 이상이어야 합니다."}`
- `status` CSV — `PENDING,APPROVED,REJECTED,EXPIRED,CANCELLED` 화이트리스트 외 토큰이 있으면 400
- `q` — 페이지 제목 부분일치, 대소문자 무시, 100자 절단
- `spaceKey` — 파생 spaceKey(아래 변경 5)와 정확 일치
- `requesterKey` — `ApprovalRequest.requesterKey()` 정확 일치
- `flowId` — findMeta의 flowId와 정확 일치 (빈 문자열 파라미터는 "필터 없음")
- `createdFrom` / `createdTo` — **ISO-8601 순간**(`Instant.parse` 가능 값). 파싱 실패 400. createdAt 기준 `from ≤ t < to` (to는 exclusive — 클라이언트가 로컬 다음날 자정을 보낸다)
- `due` — `soon|over|none` 외 값 400. soon=마감 존재+미경과+dueSoon 기준 이내(기존 dueSoon 계산 재사용), over=마감 경과, none=마감 없음. PENDING 외 상태에는 due 필터가 자동으로 false 매칭(마감 개념은 진행 중에만 의미)
- `myTurn=1` — 현재 사용자가 지금 단계의 미결정 승인자(기존 myTurn 직렬화 로직을 필터 술어로 추출해 재사용)
- `myDecided=1` — 현재 사용자의 승인자 행에 결정이 존재 (업무함 "처리한 건" 탭용)

처리 순서 (두 엔드포인트 동일):
1. 후보 로드(현행 merge + canView) — 이 시점 목록이 **후보 집합**.
2. 후보 집합에서 `statusCounts`와 `facets` 계산 (필터 적용 전):
   - `statusCounts`: 상태별 건수 + `myTurn`, `dueSoon`, `dueOver` 건수.
   - `facets`: `requesters`(key+displayName), `flows`(id+name), `spaces`(key+name) — 각각 이름 오름차순, 최대 100개.
3. 필터 적용 → `updatedAt` desc 정렬 → `total` = 필터 후 건수.
4. `[offset, offset+limit)` 슬라이스만 직렬화.
5. 응답: `{"items":[...], "total": N, "statusCounts": {...}, "facets": {...}}` (기존 배열 형태 폐기 — 업무함 JS는 7b에서 함께 수정된다. 이 배치 커밋 시점에 업무함이 일시적으로 깨지는 것은 예정된 상태).

직렬화 비용 (requestsJson/requestObject):
- `findFlowIds`+`findPrevRequestIds`+`findRegionHashes` 3회 IN → `findMeta` 1회.
- 요청마다 부르던 `findApproverViaGroups` → 슬라이스 ID로 `findApproverViaGroupsBatch` 1회, 맵을 requestObject에 전달.
- Flow 전건 로드(`activeObjects.find(ApprovalFlowEntity.class)`) → 슬라이스에 등장하는 flowId만 IN 조회(flowId 전무 시 쿼리 생략).
- 단건 경로(`requestJson`)도 같은 배치 API를 (1건짜리 컬렉션으로) 사용.

## 변경 5 — spaceKey/spaceName 파생 (`requestObject`)

- `requestObject` 출력에 `spaceKey`, `spaceName` 추가 — `pages` 캐시의 page에서 `getSpaceKey()`/`getSpace().getName()`. page가 null이거나 space가 null이면 두 필드 모두 생략(null 출력 금지, 키 자체를 넣지 않는다).
- **AO 컬럼 추가 금지** (설계 D4 — 파생으로 충분).

## 변경 6 — 알림 저장소 (`ApprovalNotificationEntity.java`, `ActiveObjectsApprovalNotificationStore.java`, `ApprovalRestResource` notifications 경로)

1. 엔티티: `RECIPIENT_KEY`·`EVENT_ID`·`REQUEST_ID`를 `@StringLength(UNLIMITED)` → `@StringLength(255)`. `RECIPIENT_KEY`와 `REQUEST_ID`에 `@Indexed` 추가. `@Unique`·NOT NULL **추가 금지** (자동 마이그레이션 안전선). `LAST_ERROR`는 UNLIMITED 유지.
2. `markReadForRecipient`: `Query.select().where("RECIPIENT_KEY = ? AND READ_AT IS NULL", recipientKey)`로 대상만 로드. `ids`는 `Set`으로 변환해 판정.
3. `findForRecipient`: WHERE 유지 + `order("CREATED_AT DESC")` + `limit(int)` 파라미터 추가(기존 시그니처는 limit 200 기본으로 위임). 메모리 정렬 제거.
4. `findPending`: 조건 + order + `Query.limit(limit)` — 전건 로드 후 subList 제거. (NEXT_ATTEMPT_AT 조건 의미 유지.)
5. REST `notifications` 엔드포인트: 알림 1건당 `repository.find`(3쿼리)+getPage 2회 → 알림들의 requestId를 모아 `hydrate` 1회(변경 1의 헬퍼를 노출하는 c9 저장소 메서드 `findAllByIds(Collection<UUID>)` 신설), pageTitle은 기존 `pages`/`pageTitle` 캐시 경로 재사용, 이벤트는 하이드레이션된 aggregate에서 탐색. 같은 requestId 중복 알림은 맵 재사용.
6. `ApprovalNotificationStore` 인터페이스(존재 시)에 시그니처 변화가 생기면 C9 내부 인터페이스인지 확인 — 도메인 인터페이스면 default 필수.

## 변경 7 — fromRequestId + 명시 결재선 규칙 (`ApprovalRestResource.create`)

현행: `steps`/`flowId`가 있으면 복원 안 함(명시 우선)인데 `approverKeys`/`approverGroups`는 조건에 빠져 **조용히 무시**된다.
- 복원 조건을 `blank(steps) && blank(flowId) && blank(approverKeys) && blank(approverGroups) && previousRequest != null …`로 확장 (restoreSteps 분기와 legacy minimum 분기 **양쪽 모두**).
- 즉 `fromRequestId`+`approverKeys` 조합 = approverKeys로 새 결재선을 만들고 fromRequestId는 PREV_REQUEST_ID 계보 연결만.
- README.md의 create 파라미터 설명에 규칙 한 줄 추가: "fromRequestId는 steps·flowId·approverKeys·approverGroups가 모두 없을 때만 이전 결재선을 복원하며, 그 외에는 계보 연결(PREV_REQUEST_ID)로만 쓰인다."

## 테스트 (신규 — 전부 approval-confluence9 test 소스)

기존 테스트 파일 패턴(JUnit5, Proxy/수제 fake — Mockito 없음)을 따른다.
1. `StepRestorationTest`에 추가: fromRequestId+approverKeys → 복원하지 않음(새 결재선), fromRequestId+approverGroups → 동일, fromRequestId 단독 → 복원. (기존 테스트 구조가 REST 내부 정적 로직을 어떻게 검증하는지 먼저 읽고 같은 수법으로. 조건 판정을 정적 헬퍼로 추출하면 테스트가 쉬워진다 — 예: `static boolean shouldRestore(String steps, String flowId, String approverKeys, String approverGroups, ApprovalRequest previous)`.)
2. 페이징 파라미터 정규화 정적 헬퍼 테스트: limit 클램프(0→50? 아니다 — 0 이하·비숫자 50, 1~200 그대로, 201→200), offset 음수 거절, status CSV 화이트리스트.
3. 필터 술어 테스트: due(soon/over/none)와 myTurn/myDecided 판정을 정적/패키지 프라이빗 술어로 추출해 단위 테스트 (요청 aggregate는 기존 테스트처럼 `ApprovalRequest.restore`로 조립).
4. IN 청크 분할 유닛 테스트: 500 경계(499/500/501)에서 청크 수와 원소 보존.
5. 알림 store는 AO 의존이라 단위 테스트 불가 — 로직 중 순수 부분(ids Set 판정 등)이 추출 가능하면 추출·테스트, 아니면 생략 가능.

## 완료 보고 형식
- 변경 파일 목록 + 각 변경 1줄 요약
- 검증 게이트 2개 명령의 실제 출력 요약 (테스트 수 포함)
- 스펙에서 벗어난 판단이 있으면 사유 명시
