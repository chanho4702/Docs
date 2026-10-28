# QA 7a — 성능·기반 백엔드 (Codex 3회 런 누적분)

검증자: approval-qa / 2026-08-12
대상 스펙: `spec-7a-backend.md` + `spec-7a2-continuation.md` + `spec-7a3-tests.md`
설계: `design-batch7.md` (D1~D9)
기준: `HEAD` (미커밋 working tree diff)

---

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | 0 |
| 중대 | 3 |
| 경미 | 9 |

빌드 게이트는 둘 다 통과했다. FAIL 사유는 (1) 기존 경로에 없던 런타임 크래시 경로가 새로 생겼고,
(2) 이 배치에서 가장 위험한 변경(hydrate)이 **실행되는 테스트가 하나도 없으며 그것을 덮는다고 주장하는
테스트는 다른 코드 경로를 검증**하고, (3) 매크로 렌더가 DB 쓰기·클러스터 락 경로로 바뀐 것이
잘못된 스펙 전제에서 나왔기 때문이다.

---

## 0. 검증 게이트 실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -pl approval-confluence9 -am test   → BUILD SUCCESS  (domain 53, c9 93, 실패 0)
mvn -pl approval-confluence10 compile   → BUILD SUCCESS
```
- `git status approval-confluence10/` 비어 있음 → **C10 소스 미수정 확인** ✓
- `clean`/`package`/`install` 미실행 ✓ (dev 인스턴스 보호)
- 수정 파일 제어문자(NUL 등) 0개, 파일 압축·재포매팅 없음
  (ApprovalRestResource 1731→1930줄, Repository 511→584줄, Macro 389→398줄, Panel 306→310줄,
   WorkflowService 303→305줄 — 전부 증가)
- 기존 테스트 파일 수정 0건 (`git status`에 `M` 표시된 test 파일 없음) → **기존 테스트 의미 변경 없음** ✓

---

## 1. 중대

### [중대-1] hydrate가 `List.of().sort()`를 호출한다 — 빈 승인자/이벤트 요청에서 500

`storage/ActiveObjectsApprovalRequestRepository.java:240-243`

```java
List<ApprovalApproverEntity> approvers = approversById.getOrDefault(entity.getRequestId(), List.of());
approvers.sort(...);                    // ← 승인자 행 0개면 UnsupportedOperationException
List<ApprovalEventEntity> events = eventsById.getOrDefault(entity.getRequestId(), List.of());
events.sort(...);                       // ← 이벤트 행 0개면 UnsupportedOperationException
```

**실측(probe, JDK 21.0.12):**
```
empty List.of().sort -> java.lang.UnsupportedOperationException
List.of(x).sort      -> java.lang.UnsupportedOperationException
```
`java.util.ImmutableCollections.AbstractImmutableList.sort()`는 원소 수와 무관하게 무조건 `uoe()`를 던진다.
`getOrDefault(..., List.of())`의 기본값을 그대로 정렬하므로, 행이 하나도 없는 requestId에서 반드시 터진다.

**도달 가능성 실측:** `save()`(429-459행)는
`entity.save()` → `saveApprovers(request)` → `saveNewEvents(request)` 세 단계로 나뉘어 있고,
`grep -rn "Transactional" approval-confluence9/src/main` 결과가 **0건**이다(트랜잭션 래퍼 없음).
즉 `entity.save()` 직후 예외·노드 장애가 나면 **APV/EVT 행이 없는 APR_REQ 행**이 남는다.

**회귀 판정:** HEAD의 `find(UUID)` 경로는 AO가 빈 배열을 돌려줘 정상 동작했다(`toRequest`가 빈 배열을 처리).
새 경로는 같은 데이터에서 UOE를 던지고, 그 예외가 `hydrate`를 부르는 **모든** 호출부를 무너뜨린다:
`/mine`, `/mine/requested`, `/notifications`, 그리고 `pageSnapshot` 경유의 **패널·매크로 렌더 전체**.
한 번 생기면 해당 사용자/페이지는 영구적으로 500이 된다.

부수 결함: `Comparator.comparing(ApprovalEventEntity::getOccurredAt)`는 `OCCURRED_AT`이 null이면 NPE다.
`ApprovalEventEntity`에 `@NotNull`이 없고, HEAD의 SQL `ORDER BY OCCURRED_AT ASC`는 null을 견뎠다.

**재작업 지시:**
```java
List<ApprovalApproverEntity> approvers =
        new ArrayList<>(approversById.getOrDefault(entity.getRequestId(), List.of()));
approvers.sort(Comparator.comparingInt(ApprovalApproverEntity::getStepOrder)
        .thenComparingInt(ApprovalApproverEntity::getID));
List<ApprovalEventEntity> events =
        new ArrayList<>(eventsById.getOrDefault(entity.getRequestId(), List.of()));
events.sort(Comparator.comparing(
        ApprovalEventEntity::getOccurredAt, Comparator.nullsLast(Comparator.naturalOrder())));
```
(가변 복사본으로 감싸고, 이벤트 정렬에 null-safe 비교자를 쓴다.)
회귀 테스트: 승인자 0건·이벤트 0건 requestId를 하이드레이션해도 예외 없이 aggregate가 나오는지.

---

### [중대-2] hydrate 동등성이 미검증이고, 그것을 덮는다는 테스트가 다른 경로를 검증한다

`design-batch7.md` §5는 QA 게이트로 **"저장소: 배치 하이드레이션 동등성(기존 3N+1 결과와 동일 집합·순서),
IN 청크 경계(500±1)"** 을 요구했다.

- 신규 `ActiveObjectsApprovalRequestRepositoryChunkTest`는 `chunks()`(249-256행)를 499/500/501로 검증한다.
- 그런데 **`hydrate()`는 `chunks()`를 쓰지 않는다.** 224-225행에 자체 인라인 분할 루프가 따로 있다:
  ```java
  for (int start = 0; start < ids.size(); start += IN_CLAUSE_BATCH) {
      List<String> batch = ids.subList(start, Math.min(start + IN_CLAUSE_BATCH, ids.size()));
  ```
  `chunks()`의 실제 사용처는 `findMeta`(340-352행)와 `findApproverViaGroupsBatch`(415-427행)뿐이다.

즉 이 배치 최대 위험 변경(하이드레이션)의 **분할 경로도, 조립 결과도 실행되는 테스트가 0개**다.
스펙 변경1-1의 "조립 규칙 이중화 금지" 취지에도 분할 로직이 두 곳으로 갈라져 어긋난다.

(공정을 위해 명시: `toRequest`는 오버로드로 정확히 단일 출처로 분리됐고, 정렬 키도 HEAD의 SQL
`ORDER BY STEP_ORDER ASC, ID ASC` / `ORDER BY OCCURRED_AT ASC`와 일치한다. legacy STEP_ORDER=0 처리도
공유 `toRequest` 안에 그대로 있다. **조립 규칙 자체는 정합**하다 — 문제는 검증 부재와 분할 로직 이중화다.)

**재작업 지시:**
1. `hydrate`의 인라인 분할 루프를 `chunks(ids)`로 교체해 분할 로직을 한 곳으로 모은다.
   → ChunkTest가 그제서야 실제 경로를 덮는다.
2. AO 없이 동등성을 고정하는 테스트를 추가한다. `activeObjects`를 `Proxy` 기반 fake로 주입해
   (기존 c9 테스트가 Mockito 없이 Proxy/수제 fake를 쓰는 패턴 그대로) 다음을 고정:
   - 승인자 0건 / 이벤트 0건 요청이 예외 없이 복원된다 (중대-1 회귀 가드)
   - 같은 데이터에 대해 `find(UUID)` 결과와 `hydrate(List.of(id))` 결과의 aggregate가 동일
     (status·eligibleApproverKeys 순서·steps·decisions·events 순서)
   - 501개 id 입력 시 REQ/APV/EVT 각각 2회씩, 총 6회 `find` 호출 (청크 수 계측)

---

### [중대-3] 매크로 렌더가 DB 쓰기 + 클러스터 락 경로로 바뀌었다 (잘못된 스펙 전제에서 유래)

`macro/ApprovalRegionMacro.java:84`

HEAD의 매크로는 다음 주석과 함께 **읽기 전용**이었다:
```java
// findLatestContentRegionRequest는 AO 읽기 세 번만 수행하고 lazy expiration이나 저장을 하지 않는다.
Optional<ApprovalRequest> request = repository.findLatestContentRegionRequest(...);
```
현재는 `workflowService.pageSnapshot(target.pageId())`를 부른다. 그 안(`ApprovalWorkflowService.java:203-215`)에서
due 요청마다 `expireDue(id)` → `withRequestLock(...)` → `repository.save(request)`가 실행된다.
**주석은 함께 삭제됐고, 그 자리에 대체 문서도 없다.**

경위: `spec-7a2-continuation.md` §1-2가 "lazy expiration 의미가 1부 이전과 동일하게 복원되는지 확인"이라고
지시했으나, **1부 이전(HEAD)의 매크로에는 lazy expiration이 애초에 없었다.** 스펙의 전제가 사실과 다르고
구현은 스펙을 충실히 따랐다. 결과적으로 배치 범위를 넘는 동작 확대가 일어났다.

**영향:**
- 매크로 렌더 경로가 쓰기 트랜잭션과 `ClusterLockService` 획득을 수행한다. 페이지 내보내기(PDF/Word),
  검색 인덱싱, 읽기 전용 컨텍스트의 렌더에서 쓰기가 발생하면 렌더 자체가 실패할 수 있다.
- 매크로 K개인 페이지는 `pageSnapshot`을 K회 호출한다(설계 D6이 인정한 한계). 첫 회가 sweep을 끝내므로
  쓰기는 1회로 수렴하지만, `findByPageId`(3쿼리)는 K회 그대로다.
- `ClusterApprovalLockService.fromOsgi()`(45-55행)는 실패 시 `NO_OP`로 폴백하므로 기동 자체는 안전하다.

**재작업 지시 — 오케스트레이터 결정 필요:**
- (A) 의도된 확대라면: 매크로에 "렌더 시 lazy expiration으로 쓰기가 발생한다"는 주석을 복원하고
  `features.md`/README에 명시. 내보내기·인덱싱 컨텍스트에서의 쓰기 안전성을 화면 검증 항목에 추가.
- (B) 의도가 아니라면: 도메인에 sweep 없는 `pageSnapshotReadOnly(long)`(또는
  `pageSnapshot(pageId, boolean sweep)`)를 추가하고 매크로만 그것을 쓰게 한다. 패널은 HEAD에서도
  `findLatestPageRequest`로 sweep을 했으므로 현행 유지.

권장은 (B) — HEAD 주석이 "저장을 하지 않는다"를 명시적 설계로 못박아 두었기 때문이다.

---

## 2. 경미

### [경미-1] 패널의 latest 선택 동률 규칙이 `findLatestPageRequest`와 반대다
- domain `ApprovalWorkflowService.java:198-200`:
  `reduce((left, right) -> !right.createdAt().isBefore(left.createdAt()) ? right : left)`
  → `right >= left`면 right 채택 = **동률 시 뒤가 이김** (HEAD 원본 루프와 동일, 의미 보존 ✓)
- panel `ApprovalPagePanel.java:91-93`:
  `max(Comparator.comparing(ApprovalRequest::createdAt))`
  → `Stream.max`는 `BinaryOperator.maxBy` = `compare(a,b) >= 0 ? a : b` → **동률 시 앞이 이김**

`spec-7a2` §1-2는 "패널: snapshot에서 latest(PAGE, **기존 findLatestPageRequest와 같은 규칙**)"을 요구했다.
dedupeKey 불변식 때문에 같은 ms에 PAGE 요청 2건이 생길 여지는 사실상 없어 실사용 영향은 없다.
**수정:** 도메인에 `public static Optional<ApprovalRequest> latestPage(List<ApprovalRequest>)` 정적 헬퍼를
두고 `findLatestPageRequest`와 패널이 함께 쓰게 한다(규칙 단일 출처).

### [경미-2] 매크로 latest 선택 키가 createdAt → (revision, updatedAt)로 바뀌었다 — 실사용 영향 없음
HEAD의 실제 규칙은 `ActiveObjectsApprovalRequestRepository.findLatestContentRegionRequest`(59-74행)의
`entity.getCreatedAt().after(latest.getCreatedAt())` — **createdAt 기준**이었다.
`spec-7a2` §1-2가 "revision·updatedAt"이라고 적었고 구현이 그대로 따랐다(`ApprovalRegionMacro.java:87-88`).

**실측으로 회귀 아님을 확인:**
- `ApprovalWorkflowService.nextRevision`(239-248)은 **같은 target scope의 max(revision)+1**이다.
- `ApprovalRestResource.java:282` `revision > 0 ? revision : workflowService.nextRevision(target)`
- `grep -n "revision" approval.js` → **0건** (클라이언트가 revision을 보내지 않음)

→ regionKey별 revision은 항상 단조 증가하므로 `max(revision)`과 `max(createdAt)`은 같은 요청을 고른다.
**회귀 아님으로 판정.** 다만 스펙의 잘못된 전제를 기록해 둔다(후속 배치가 이 오해를 증폭시키지 않도록).

부작용: `findLatestContentRegionRequest`가 **호출부 0인 죽은 코드**가 됐다
(`grep -rn "findLatestContentRegionRequest" --include=*.java .` → 정의 1건뿐). 삭제 또는 사용 복원 필요.

### [경미-3] myTurn 술어가 이중화됐다 (스펙 명시 위반)
- 필터: `ApprovalRestResource.java:1154-1156` `isMyTurn(request, currentKey)`
- 직렬화: 같은 파일 **1348행** `o.put("myTurn", currentKey != null && r.canDecideNow(currentKey));`

`spec-7a2` §작업2: "due/myTurn/myDecided 판정은 직렬화 로직과 **한 곳의 술어**를 공유하도록 추출(이중화 금지)".
현재 식은 문자 그대로 동일해 동작 차이는 없지만 단일 출처가 아니다.
**수정:** 1348행을 `o.put("myTurn", isMyTurn(r, currentKey));`로.
(참고: `dueSoon`은 필터·직렬화 모두 `ApprovalJson.dueSoon`을 쓰므로 이미 단일 출처 ✓)

### [경미-4] 400 응답 본문이 스펙이 명시한 JSON 형태가 아니다
`spec-7a-backend.md` 변경4는 `offset` 음수에 `{"error":"offset은 0 이상이어야 합니다."}`를 명시했으나,
`/mine`(356-357행)·`/mine/requested`(378-379행)는 `Response.status(BAD_REQUEST).entity(e.getMessage())` —
**평문 메시지**를 돌려준다. HEAD의 `/mine`도 평문이었으므로 회귀는 아니다.
**7b 착수 전 결정 필요:** 업무함 JS가 에러 본문을 JSON으로 파싱하도록 설계됐다면 여기서 깨진다.
JSON으로 통일하려면 `ApprovalJson.write(Map.of("error", e.getMessage()))`로.

### [경미-5] README 문장이 두 동강 났다
`README.md:180-183`
```
`minimumApprovals`·`approverKeys`·`approverGroups` 파라미터는 하위 호환으로 남아 있으며
                                            ← 새 문장이 기존 문장 한가운데 삽입됨
`fromRequestId`는 … 계보 연결(`PREV_REQUEST_ID`)로만 쓰입니다.
`steps`가 함께 오면 무시됩니다.
```
원문은 "…하위 호환으로 남아 있으며 `steps`가 함께 오면 무시됩니다."라는 한 문장이었다.
현재는 앞 문장이 미완으로 끊기고, "`steps`가 함께 오면 무시됩니다."가 fromRequestId 문장에 붙어 의미가 뒤바뀐다.
**수정:** 새 문장을 기존 문단이 끝난 뒤(빈 줄 다음)로 옮긴다.

### [경미-6] 알림 REST의 getPage 캐시가 절반만 적용됐다
`ApprovalRestResource.java:621` `canView(request)` → `canView`(1455-1459)가 알림마다
캐시 없는 `pageManager.getPage(pageId)`를 호출한다. 신설된 `titles` 캐시(616행)는 `pageTitle`만 덮는다.
스펙 변경6-5의 "getPage 2회 → 페이지 캐시 재사용"이 1회로만 줄었다.
**수정:** `mineResponse`처럼 `Map<Long, AbstractPage> pages` 캐시를 만들고 권한 판정도 그 캐시로.

### [경미-7] 신규 코드의 스타일이 파일 관례를 벗어난다
`ApprovalRestResource.java`: 120열 초과 라인 **13개**(최대 **274열**). HEAD는 1개(최대 122열).
한 줄 다중 statement(1188행 `counts.put(...); counts.put(...); counts.put(...);`),
다중 변수 동시 선언(1193행 `Map<...> requesters = ..., flowValues = ..., spaces = ...;`).
**기존 라인 재포매팅·파일 압축은 없다**(스펙 금지 항목 위반 아님). 신규 코드 가독성 문제로만 기록.

### [경미-8] facets가 `Map.of`를 써서 JSON 키 순서가 비결정적이고 NPE 여지가 있다
`ApprovalRestResource.java:1197-1201`. `Map.of`는 JVM SALT로 반복 순서가 실행마다 달라져
`{"key":…,"name":…}` / `{"name":…,"key":…}`가 섞인다(응답 바이트 비결정 → 후속 스냅샷 테스트 방해).
또 `page.getSpace().getName()`이 null이면 `Map.of`가 NPE를 던진다
(requesters는 `displayName`이 1424-1447행에서 null을 반환하지 않으므로 안전 ✓,
 flows는 `Optional…orElse(flowId)`로 안전 ✓ — spaces만 노출).
**수정:** `LinkedHashMap`으로 조립하고 space name은 `Objects.toString(name, key)` 폴백.

### [경미-9] Flow IN 조회에 청크 분할이 없다
`ApprovalRestResource.java:1160-1166`(facets용)과 1243-1249행(직렬화용)이 `inClause`를 직접 쓰고
저장소의 `IN_CLAUSE_BATCH` 분할을 거치지 않는다. Flow가 500개를 넘을 일은 현실적으로 없으나
저장소가 방어하는 Oracle IN 상한 규칙과 어긋난다. 기록만.

---

## 3. PASS 확인 항목 (의미 기반 대조 완료)

### 하이드레이션 동등성 (조립 규칙 자체)
- `toRequest(entity)` → `toRequest(entity, approvers[], events[])` 오버로드로 분리, **조립 규칙 단일 출처** ✓
- 메모리 정렬 키가 HEAD의 SQL과 일치: 승인자 `STEP_ORDER ASC, ID ASC` ↔ `comparingInt(getStepOrder).thenComparingInt(getID)`,
  이벤트 `OCCURRED_AT ASC` ↔ `comparing(getOccurredAt)` ✓ (안정 정렬이라 동률 시 삽입 순서 유지)
- legacy STEP_ORDER=0 처리는 공유 `toRequest` 내부에 그대로 존재, 이중화 없음 ✓
- `findByApproverKey` 중복 제거가 O(N²) `noneMatch` → `LinkedHashSet` ✓, 반환 집합 동일 ✓
- `findByPageId`/`findByRequesterKey`도 후보 ID 1쿼리 + hydrate 1회 ✓
- 반환 **순서**는 REQ IN 쿼리 순서로 바뀌었으나 스펙 변경1-1이 "입력 순서 무관, 호출부가 정렬"을 명시했고
  모든 호출부(REST는 updatedAt desc, 패널/매크로는 자체 max/sorted)가 정렬한다 ✓

### pageSnapshot 의미 보존
- `findLatestPageRequest`의 latest 선택 규칙이 HEAD 원본 루프와 **동률 포함 동일** ✓
  (HEAD `!request.createdAt().isBefore(latest.createdAt())` → 뒤가 이김 / 현재 `reduce`도 뒤가 이김)
- sweep 순서가 "expire 먼저 → latest 선택"으로 바뀌었으나 `createdAt`은 불변이라 선택 결과 동일 ✓
- 모든 due 요청이 `expireDue(id)` 경유 = `withRequestLock` 락 규칙 준수 ✓ (직접 `expireIfDue`+`save` 우회 없음)
- due가 아닌 요청은 손대지 않음 ✓
- 도메인 `ApprovalRequestRepository` 인터페이스에 abstract 메서드 추가 없음 → C10 컴파일 유지 ✓

### 서버 페이징 REST
- `normalizeLimit`(1091-1098): null→50, 공백→NFE→50, "0"/"-1"→50, "abc"→50, "1"→1, "200"→200, "201"→200 ✓
- `parseOffset`(1100-1108): blank→0, 음수→`IllegalArgumentException`.
  **`catch (NumberFormatException)`이 IAE를 삼키지 않음을 확인** — IAE가 NFE의 상위 타입이므로 그대로 전파돼 400 ✓
- `parseStatuses`(1110-1121): CSV, 화이트리스트 외 토큰 → 400 ✓ (대소문자 무시, trim)
- `parseInstant`: `Instant.parse` 실패 → 400 ✓ / `from ≤ t < to` (to exclusive) — 1146-1147행 ✓
- `parseDue`: soon|over|none 외 400 ✓ / `matchesDue`(1162-1168) PENDING 아니면 무조건 false ✓
- **statusCounts·facets는 `candidates`(canView 통과, 필터 적용 전) 기준** ✓ (1080-1081행)
- **`total` = `filtered.size()` (필터 후·슬라이스 전)** ✓ (1088행)
- **슬라이스만 직렬화** ✓ (`requestsJson(slice)`, 1085-1088행)
- 응답 JSON 이스케이프: 값은 전부 `ApprovalJson.write` 경유(items=`requestsJson`, statusCounts/facets=`write`),
  문자열 연결로 붙는 것은 리터럴 키와 `filtered.size()` 정수뿐 → **이스케이프 구멍 없음** ✓
- `statusCounts`가 5개 status를 0으로 선초기화해 키가 항상 존재 ✓
- 후보 로드의 canView가 `pages` 캐시 기반 인라인으로 바뀌었으나 `canView`(1455-1459)와 의미 동일
  (`u != null`은 `/mine`의 `denyCurrent`(1476-1488)와 `/mine/requested`의 명시 null 체크가 보장) ✓

### q 필터
`term = q.trim().substring(0, min(100, len)).toLowerCase()` (1067행) → 100자 절단 ✓,
`page.getTitle().toLowerCase().contains(term)` → 부분일치·대소문자 무시 ✓,
page/title null이면 불일치 처리 ✓ (후보 집합이 이미 page != null을 보장)

### 직렬화 비용
- `findFlowIds`+`findPrevRequestIds`+`findRegionHashes` 3회 → `findMeta` 1회 ✓ (REQ IN 1쿼리로 3컬럼)
- regionHash 소비부가 `!meta.containsKey(id) || meta.get(id).regionHash() == null`로 **`containsKey` 가드** ✓
  (스펙 금지사항 5 "null 마커 맵에 putIfAbsent 금지" 함정 회피)
- `findApproverViaGroups` 요청별 호출 → `findApproverViaGroupsBatch` 1회 + `getOrDefault(id, Map.of())` ✓
- Flow 전건 로드 → 슬라이스 flowId만 IN 조회, flowId 전무 시 쿼리 생략 ✓
- 단건 경로 `requestJson`(1277-1280)이 `requestsJson(List.of(request))`로 위임 → 같은 배치 API 재사용 ✓

### spaceKey/spaceName 파생
`page != null && page.getSpace() != null`일 때만 두 키를 넣고, 아니면 **키 자체를 넣지 않음** ✓ (1328-1331행)
AO 컬럼 추가 없음 ✓ (D4 준수)

### 알림
- `markReadForRecipient`: `WHERE RECIPIENT_KEY = ? AND READ_AT IS NULL` ✓, `ids`를 `HashSet`으로 판정 ✓,
  빈 ids = 전체 대상 의미 보존 ✓
- `findForRecipient`: `.order("CREATED_AT DESC").limit(limit)`, 메모리 정렬 제거 ✓, 기존 시그니처는 200으로 위임 ✓
- `findPending`: 조건 + `.order("NEXT_ATTEMPT_AT ASC").limit(limit)`, 전건 로드+subList 제거 ✓,
  `NEXT_ATTEMPT_AT <= ?` 조건 의미 유지 ✓
- REST `notifications`: requestId 수집 → `findAllByIds` 1회 → 맵 조회로 전환 ✓,
  같은 requestId 중복 알림은 맵 재사용 ✓, 이벤트는 하이드레이션된 aggregate에서 탐색 ✓
- `ApprovalNotificationStore`는 **c9 내부 인터페이스**이며 추가 메서드가 `default`라 기존 구현·테스트 페이크 무영향 ✓
- 엔티티: `EVENT_ID`/`REQUEST_ID`/`RECIPIENT_KEY` → `@StringLength(255)`,
  `REQUEST_ID`·`RECIPIENT_KEY`에 `@Indexed`, `@Unique`·NOT NULL 추가 없음,
  `LAST_ERROR`는 `@StringLength(UNLIMITED)` 유지 ✓ — **스펙 변경6-1 그대로**

> 미검증으로 남는 항목: D5가 QA 필수로 지목한 **기존 알림 데이터가 있는 H2 홈에서의 스키마 마이그레이션**.
> `package`/`install` 금지 제약상 이번 QA에서 실행 불가. 7b 화면 검증 시 반드시 확인할 것
> (CLOB→VARCHAR(255) 축소는 자동 마이그레이션이 거부할 수 있는 대표 케이스다).

### shouldRestore
`ApprovalRestResource.java:1593-1597`
```java
static boolean shouldRestore(String steps, String flowId, String approverKeys, String approverGroups,
        ApprovalRequest previous) {
    return blank(steps) && blank(flowId) && blank(approverKeys) && blank(approverGroups) && previous != null;
}
```
- restoreSteps 분기(214행)와 legacy minimum 분기(230행) **양쪽 모두** 적용 ✓ (스펙 변경7 요구사항)
- README 문구 존재 ✓ (배치 위치는 경미-5)

### 신규 테스트 실질성
| 테스트 | 판정 |
|--------|------|
| `ShouldRestoreTest` (5) | ✓ 프로덕션 `ApprovalRestResource.shouldRestore`를 직접 호출. 4조합 + previous null. 스텁 아님 |
| `ApprovalRestResourceFilteringTest` (5) | ✓ `normalizeLimit`/`parseOffset`/`parseStatuses`/`matchesDue`/`isMyTurn`/`hasMyDecision` 실 메서드 호출. aggregate는 `ApprovalRequest.restore`로 조립(스펙 지시대로). 단 due는 버킷별 positive만 검증하고 cross-negative(soon 요청이 over에 안 걸리는지)는 없음 — 보강 권장 |
| `PageSnapshotExpiryTest` (1) | ✓ 실제 `ApprovalWorkflowService.pageSnapshot` 실행. 반환 snapshot과 **저장소 영속 상태** 양쪽을 검증. due 2건 EXPIRED + non-due 1건 PENDING 유지 |
| `ActiveObjectsApprovalRequestRepositoryChunkTest` (3) | ✗ 중대-2 — 실제 hydrate 경로를 덮지 않음 |

- **게이트 우회·조건 바꿔치기 흔적 없음** ✓ (기존 테스트 파일 diff 0건, 어떤 프로덕션 조건도 테스트를 위해 완화되지 않음)
- Codex 결함 패턴 스캔: 파일 압축 없음 ✓ / 제어문자 0 ✓ / text block 미변경 ✓ / 검증 문자열 우회 없음 ✓

### C10 안전
- `approval-confluence10/` working tree 변경 0건 ✓
- `mvn -pl approval-confluence10 compile` → BUILD SUCCESS ✓
- `package`/`install` 미실행 → QuickReload 교차 설치 위험 없음 ✓

### 배치 범위 밖 파손(예정된 것)
`grep -rn "approvals/mine"` 결과 `/mine` 소비자는 `ApprovalInboxServlet.java:788, 883, 890` 뿐이다.
응답이 배열 → `{items,total,statusCounts,facets}`로 바뀌어 **업무함이 현재 깨진 상태**이며,
이는 `design-batch7.md` §2가 예고한 계획된 상태다(7b에서 복구). 그 외 소비자 없음 ✓

---

## 4. 재작업 지시 요약 (우선순위 순)

1. **[중대-1]** `ActiveObjectsApprovalRequestRepository.java:240-243` — `getOrDefault(..., List.of())` 결과를
   `new ArrayList<>(...)`로 감싸고, 이벤트 정렬에 `Comparator.nullsLast` 적용. (위 코드 블록 그대로)
2. **[중대-2]** 같은 파일 224-225행의 인라인 분할을 `chunks(ids)`로 교체.
   Proxy fake `ActiveObjects`로 hydrate 동등성 + 빈 행 회귀 + 501개 청크 계측 테스트 추가.
3. **[중대-3]** 매크로 sweep 정책 결정. (B) 권장 — `pageSnapshotReadOnly(long)` 신설 후
   `ApprovalRegionMacro.java:84`가 그것을 쓰게 하고, HEAD의 "저장을 하지 않는다" 주석 복원.
4. **[경미-1]** 도메인에 `latestPage(List)` 정적 헬퍼 추출 → `findLatestPageRequest`와 패널이 공유.
5. **[경미-3]** `ApprovalRestResource.java:1348` → `isMyTurn(r, currentKey)`.
6. **[경미-5]** README 새 문장을 기존 문단 뒤로 이동.
7. **[경미-2]** 죽은 `findLatestContentRegionRequest` 처리(삭제 또는 매크로가 다시 사용) 결정.
8. **[경미-4]** 400 본문 JSON화 여부를 7b 착수 전에 결정.
9. **[경미-6/7/8/9]** 알림 page 캐시, 신규 코드 줄바꿈, facets `LinkedHashMap`화, Flow IN 청크 — 여력 시.
