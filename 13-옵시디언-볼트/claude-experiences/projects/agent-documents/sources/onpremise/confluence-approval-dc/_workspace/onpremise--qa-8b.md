# QA 8b — CC 참조자 백엔드 검증 (2026-08-13)

대상 스펙: `_workspace/spec-8b-cc-backend.md` / 설계: `_workspace/design-batch8.md` (D5~D7)
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | 0 |
| 중대 | **2** |
| 경미 | 5 |

**핵심 격리 요구(금지 10번)는 완벽히 지켜졌다** — APR_APV 무변경, 도메인 무변경, 승인자 저장소 무변경.
FAIL 사유는 알림 쪽 2건이다. 특히 M1은 **스펙 자체의 전제가 사실과 달랐고**(배치 7의
"매크로 lazy expiration" 전례와 동일 유형), Codex가 그 전제를 그대로 구현한 뒤
**새로 쓴 테스트가 버그를 고정**해 게이트를 통과시켰다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 107, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS
```

**테스트 카운트: 107 (8a 106 → +1).** Codex가 보고한 "161 tests"는 근거를 찾을 수 없다 — m2 참조.

## 재포매팅·압축 검사 (PASS)

`git diff --numstat` 파일별 삭제 줄 수 전수 확인:

| 파일 | +/- | 삭제 내역 |
|------|-----|-----------|
| ApprovalRestResource | 359 / 14 | 시그니처 교체분(8a 13 + `requestsJson(..., true)` 1) |
| ApprovalNotificationTest | 38 / 16 | `resolve()` 2-인자 → 3-인자 호출 갱신 + 생성자 인자 추가 |
| ApprovalNotificationService | 12 / 7 | 생성자 4종 시그니처 교체 |
| 나머지 12개 파일 | 각 1~8 / 0~1 | 전부 1줄 교체 |

**총 43 deletions 전부 1:1 교체로 설명된다.** 한 줄 압축·주석 삭제·무관한 줄 변경 없음.

---

# 중대

## M1. CC가 **중간 승인마다** 알림을 받는다 — 설계 D6 위반 (스펙 전제 오류)

**파일:줄**
- `notification/NotificationRecipientResolver.java:42` — `recipients.addAll(ccKeys);`
- `approval-domain/.../ApprovalRequest.java:248-255` — APPROVED 이벤트 발생 지점
- `notification/ApprovalNotificationService.java:62-64` — 이벤트 전체 재순회
- `notification/ApprovalNotificationTest.java:75-88` — 버그를 고정하는 신규 테스트

**스펙의 전제가 사실이 아니다**
스펙 변경 3은 이렇게 단정한다:
> ccKeys 합류 규칙: `REQUESTED`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED` 분기에서 …
> **중간 단계 통과(부분 승인)는 이벤트가 없으므로 자연히 제외.**

실측 결과 **부분 승인에도 이벤트가 있다.** `ApprovalRequest.approve()`:
```java
decisions.put(normalizedActorKey, new ApprovalDecision(...));
events.add(new ApprovalEvent(
        UUID.randomUUID(), ApprovalEventType.APPROVED, normalizedActorKey, now, null, target.contentVersion()
));                                     // ← 승인 결정마다 무조건 추가 (:248-250)
updatedAt = now;
if (currentStepIndex() >= steps.size()) {
    status = ApprovalStatus.APPROVED;   // ← 상태 전이는 마지막 단계에서만 (:253-255)
}
```
즉 `APPROVED` **이벤트**는 결재자 한 명이 승인할 때마다 하나씩 쌓이고,
`APPROVED` **상태**만 최종 시점에 바뀐다. 둘은 별개다.

**구현이 그 전제를 그대로 따랐다**
`resolve()`의 `recipients.addAll(ccKeys)`가 switch **밖**에 있어 도달하는 모든 이벤트에 CC가 합류한다.
`ApprovalEventType`은 정확히 5개(REQUESTED/APPROVED/REJECTED/EXPIRED/CANCELLED)뿐이라
`default -> return Set.of()`는 실행되지 않는다 — **5개 전부 CC 합류**.

**결과 (동작 추론)**
결재선 3단계, CC 1명인 요청:

| 시점 | 이벤트 | 현재 동작 | 설계 D6 의도 |
|------|--------|-----------|--------------|
| 요청 | REQUESTED | CC 알림 ✓ | ✓ |
| 1단계 승인 | APPROVED | **CC 알림 (불필요)** | ✗ |
| 2단계 승인 | APPROVED | **CC 알림 (불필요)** | ✗ |
| 3단계 승인(최종) | APPROVED | CC 알림 ✓ | ✓ |

CC는 2회 받아야 할 알림을 **4회** 받는다. `emailNotificationsEnabled`가 켜져 있으면 이메일도 4통이다.
설계 D6 원문: *"`REQUESTED` + 최종 결정(`APPROVED`/`REJECTED`/`EXPIRED`/`CANCELLED`)에 ccKeys 합류,
**중간 단계 통과는 제외**."*
(`REJECTED`/`EXPIRED`/`CANCELLED`는 요청을 종료시키므로 본질적으로 1회뿐 — 문제는 `APPROVED`만이다.)

**신규 테스트가 이 버그를 검출하지 못하고 고정했다**
`ApprovalNotificationTest.java:75-88` `cc는_요청과_최종_결정_알림에_포함되고_actor는_제외된다`:
```java
ApprovalRequest request = request("requester", List.of("approver"), List.of());  // 승인자 1명
assertEquals(Set.of("requester", "cc"),
        resolver.resolve(request, event(ApprovalEventType.APPROVED, "approver"), Set.of("cc")));
```
승인자가 **1명뿐**이라 그 APPROVED가 중간인지 최종인지 구분이 불가능하다.
테스트 이름은 "최종 결정"이라고 주장하지만 **중간 승인 케이스를 한 번도 실행하지 않는다.**
현재 구현과 올바른 구현 양쪽 모두 이 테스트를 통과한다 — 검증력이 0이다.

**수정 시 반드시 피해야 할 함정 (Codex가 놓칠 지점)**
`ApprovalNotificationService.enqueueFor`는 호출될 때마다 **누적된 이벤트 전체를 재순회**한다:
```java
java.util.Set<String> ccKeys = ccStore.findRecipients(request.id());
for (ApprovalEvent event : request.events()) {          // ← 과거 이벤트까지 매번 다시 처리
    for (String recipientKey : recipientResolver.resolve(request, event, ccKeys)) {
        store.createIfAbsent(event.id().toString(), request.id().toString(), recipientKey, IN_APP, ...);
```
따라서 `request.status() == ApprovalStatus.APPROVED` **하나만으로 게이트하면 고쳐지지 않는다.**
최종 승인 시점에는 과거 중간 APPROVED 이벤트들도 함께 재평가되는데, 그때는 status가 이미 APPROVED라
전부 CC 합류 조건을 만족한다. `createIfAbsent`의 중복 키에 `recipientKey`가 포함되므로
"CC + 과거 이벤트 id" 조합은 아직 없는 행이라 **그 순간 한꺼번에 생성된다** — 총량은 그대로다.

**제안 수정** — 이벤트 단위로 "마지막 APPROVED"를 식별해야 한다.
```java
// switch 이후, remove(actorKey) 이전
if (ccJoins(request, event)) {
    recipients.addAll(ccKeys);
}
recipients.remove(event.actorKey());
...

/** CC는 요청과 최종 결정만 받는다. APPROVED 이벤트는 결재자마다 쌓이므로
 *  (ApprovalRequest.approve()가 결정마다 이벤트를 추가한다) 마지막 것만 최종이다. */
private static boolean ccJoins(ApprovalRequest request, ApprovalEvent event) {
    if (event.type() != ApprovalEventType.APPROVED) {
        return true;   // REQUESTED/REJECTED/EXPIRED/CANCELLED는 본질적으로 1회
    }
    if (request.status() != ApprovalStatus.APPROVED) {
        return false;  // 아직 진행 중 = 중간 승인
    }
    return request.events().stream()
            .filter(e -> e.type() == ApprovalEventType.APPROVED)
            .reduce((first, second) -> second)      // 마지막 APPROVED 이벤트
            .map(last -> last.id().equals(event.id()))
            .orElse(false);
}
```
이 판정은 **재순회에 대해 안정적**이다 — status가 APPROVED로 굳고 마지막 APPROVED 이벤트도 바뀌지 않으므로,
몇 번을 다시 돌려도 CC 대상 이벤트는 정확히 하나다.

**필수 회귀 테스트** (없으면 같은 버그가 재발한다)
승인자 **2명 이상 / 2단계 이상** 요청으로:
① 1단계 승인 직후 APPROVED 이벤트에 CC **미포함**
② 최종 승인 후 마지막 APPROVED 이벤트에만 CC 포함, 그 이전 APPROVED 이벤트에는 여전히 미포함
③ `enqueueFor`를 최종 승인 후 호출했을 때 CC에게 적재되는 in-app 알림 행이 **정확히 2개**
   (REQUESTED 1 + 최종 APPROVED 1) — 서비스 레벨에서 행 수를 세어 검증할 것.

## M2. CC에서 승인자 제거가 키 형식 불일치로 실패한다

**파일:줄** `rest/ApprovalRestResource.java:344-351`

```java
Set<String> ccRecipients = ccResult.approverKeys().stream()
        .map(this::resolveUserKey)          // ← CC는 userKey로 정규화
        .filter(Objects::nonNull)
        .filter(key -> !key.equals(requesterKey))
        .collect(Collectors.toCollection(LinkedHashSet::new));
ccRecipients.removeAll(stepApprovers == null
        ? new LinkedHashSet<>(approvers)    // ← 승인자는 원본 키 그대로 (정규화 없음)
        : stepApprovers.stream().flatMap(Collection::stream).collect(Collectors.toSet()));
```

**문제**
좌변 `ccRecipients`는 `resolveUserKey`를 거친 **정규화된 userKey**인데,
우변 `approvers`/`stepApprovers`는 요청 파라미터에서 온 **원본 키**다.
이 저장소의 승인자 키에 username이 섞인다는 사실은 설계 D3(`design-batch8.md:38-40`)과
`ApprovalRestResource.java:352-355` 주석이 명시하고 있으며, `denyCurrent`(`:1766`)가
`key.equalsIgnoreCase(u.getName())`를 허용하는 것도 같은 이유다.

**실패 시나리오**
승인자를 username `alice`로 지정하고 같은 사람을 CC에도 넣으면
→ `ccRecipients = {"402883...alice-userkey"}`, `approvers = {"alice"}` → `removeAll` 매칭 실패
→ **승인자가 CC 행을 갖는다.**

결과:
- 그 사람의 **업무함 "참조" 탭에 자기가 결재할 요청이 중복 노출**된다.
- 이미 결재를 마쳐 최종 APPROVED 알림 대상이 아니던 승인자가 CC 자격으로 알림을 받는다.
- (알림 중복 자체는 `LinkedHashSet` 덕에 1건으로 합쳐지므로 그쪽 피해는 없다.)

스펙 변경 2 *"요청자 본인과 요청의 eligible 승인자 키는 CC 집합에서 제거"* 미충족.

**참고**: 요청자 제거(`!key.equals(requesterKey)`)는 **정상**이다 —
`requesterKey = userKey(AuthenticatedUserThreadLocal.get())`(`:341`)이라 양쪽 다 userKey다.

**제안 수정**
```java
Set<String> eligible = (stepApprovers == null
                ? approvers.stream()
                : stepApprovers.stream().flatMap(Collection::stream))
        .map(this::resolveUserKey)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());
ccRecipients.removeAll(eligible);
```
`resolveUserKey`는 요청당 승인자 수만큼만 호출되므로 비용은 무시할 만하다
(원하면 8a의 `userKeyCache` 패턴 재사용).

**필수 회귀 테스트**: 승인자를 username으로, CC를 같은 사람의 userKey로 지정한 create가
`ccStore.saveAll`을 **호출하지 않는지**(또는 그 키가 빠지는지) 검증.

---

# 경미

## m1. 8b 스펙 밖 변경 3건이 작업 트리에 섞여 있다

| 파일 | 변경 | 내용 |
|------|------|------|
| `servlet/ApprovalInboxServlet.java` | +2 | 템플릿에 `#title-heading{display:none}` |
| `servlet/ApprovalSettingsServlet.java` | +2 | 동일 |
| `resources/css/approval.css` | +28 | 사이드바 아이콘 마스크·간격 보정 |

**1차 QA(8a) 시점의 `git status`에는 이 3개 파일이 없었다** — 8b 작업 중에 생긴 변경이다.
8b 스펙의 변경 목록(변경 1~4)에도, Codex 완료 보고에도 없다.
내용 자체는 CC와 무관한 UI 보정(주석에 "Confluence 9.2 실측"이라 적혀 있어 이전 배치의 잔여
작업으로 보인다)이라 **8b 판정에는 영향이 없다.**
→ **코디네이터 확인 요청**: 사용자가 직접 넣은 수정인지, Codex가 스펙 밖으로 손댄 것인지.
후자라면 금지 1번(수정 지점 외 변경)·9번(보고 누락) 위반으로 기록해야 한다.

## m2. Codex의 "161 tests" 보고는 사실과 다르다 — 실측 107

리액터 로그 전수 확인 결과 테스트를 실행한 모듈은 `approval-confluence9` 하나뿐이고
합계는 `Tests run: 107`이다(8a 106 → **+1**). 161이라는 숫자의 출처를 찾을 수 없다.

**증가분 1건의 내역**: `ApprovalNotificationTest` 15 → 16.
스펙 변경 3이 요구한 4개 케이스(REQUESTED에 CC 포함 / APPROVED에 CC 포함 / CC 본인이 actor면 제외 /
resolveDueSoon 미포함)는 **테스트 메서드 1개 안의 4개 assert**로 뭉쳐 있다(형식상 충족).

**테스트가 아예 없는 영역** — CC 저장소(`saveAll` 중복 방지, `findRecipientsBatch` 청크,
`findRequestIdsByRecipient`), create의 ccKeys/ccGroups 파싱·그룹 확장·정규화·중복 제거,
`/mine/cc` 엔드포인트, `cc[]` JSON. M2가 게이트에 걸리지 않은 직접 원인이다.

## m3. 단건 응답 1건당 CC 테이블 조회 2회

- `requestJson(request)` → `requestsJson(List.of(request), true)` → `ccStore.findRecipientsBatch` (`:1551`)
- `notificationService.enqueueSafely(request)` → `ccStore.findRecipients` (`ApprovalNotificationService:62`)

create·approve·reject·cancel 응답마다 2회. CC를 안 쓰는 요청도 동일하게 조회한다.
(알림이 꺼져 있으면 `enqueueFor`가 `:60-62`에서 먼저 return하므로 그쪽은 이미 가드됨 ✓.)
개선하려면 `enqueueFor`가 조회한 결과를 재사용하거나, CC 미사용 여부를 메타로 캐시.

## m4. `inClause` 헬퍼가 3중 복제됐다

`ActiveObjectsApprovalRequestRepository`(private, 원본) / `ActiveObjectsApprovalSignatureStore`(8a) /
`ActiveObjectsApprovalCcStore`(8b) — 동일 구현 3벌.
`chunks`는 패키지 private static을 재사용했으므로(`ActiveObjectsApprovalCcStore.java:54`),
`inClause`도 같은 방식으로 공유하면 된다.

## m5. `java.util.Set` / `java.util.Collection` FQN 인라인

`ApprovalNotificationService.java:62` `java.util.Set<String> ccKeys = ...`,
`ApprovalNotificationTest`의 `MemoryCcStore` 메서드 3개. 파일 상단 import 관례 이탈.

---

# 검증 PASS 항목 (동작 추론 기준)

## 1. CC 격리 (금지 10번) — **완전 PASS**

**변경되지 않은 것을 실측으로 증명했다:**
```
git diff --stat -- storage/ApprovalApproverEntity.java \
                   storage/ActiveObjectsApprovalRequestRepository.java \
                   approval-domain/
→ (출력 없음 = 무변경)
```
- **APR_APV에 role 컬럼 없음** — `ApprovalApproverEntity`는 requestId/actorKey/decisionType/
  decidedAt/viaGroup/stepOrder/stepRequired 그대로. 파일 자체가 무변경.
- **`ActiveObjectsApprovalRequestRepository` 무변경** → `findByApproverKey`, `saveApprovers`
  (retained 밖 행 삭제 로직), `toRequest`, hydrate/assemble, viaGroups 3종 전부 무손상.
  설계 D5가 경고한 "8개 지점 오염"이 하나도 발생하지 않았다.
- **`approval-domain/` 전체 무변경** → `eligibleApproverKeys()`, `decisions()`, `ApprovalRequestRepository`
  포트 계약 불변. CC는 도메인이 모르는 개념으로 남았다(D5 "도메인 밖" 준수).
- **CC가 흐르는 경로는 `ApprovalCcStore` 단 하나** — `grep ccStore\.` 전수:
  `ApprovalRestResource:373`(saveAll), `:473`(/mine/cc), `:1551`(cc[] JSON),
  `ApprovalNotificationService:62`(알림). 그 외 없음.
- **`decisions[]` 무오염** — `requestObject`의 결정 루프는 `r.eligibleApproverKeys()`만 순회(`:1712`).
  CC는 `o.put("cc", ...)`(`:1745-1752`)로만 나가고 decisions 배열에 닿지 않는다.
- **`/mine` 내차례·진행중·처리한건 무오염** — 소스가 `repository.findByApproverKey` 계열이고
  `mineResponse`의 `matchesView`/`isMyTurn`/`hasMyDecision`은 `currentKey` 기준. CC 유입 경로 없음.
- **CC는 결재 권한을 못 얻는다** — `canDecideNow`/`denyCurrent`가 `eligibleApproverKeys`만 보므로
  CC로 지정돼도 승인·반려 API는 403.

## 2. CC 저장 (create) — PASS (M2 제외)

- `@QueryParam("ccKeys")`, `@QueryParam("ccGroups")` 추가(`:203-204`), CSV 파싱은 기존 `keys()`
  재사용(`:2007-2015` — trim/공백 제거/distinct) ✓
- 그룹 확장은 승인자와 **동일한** `groupApproverResolver.resolveDirectRequest`(`:342-343`) ✓
  → 등록 그룹 검증(`groupExists` 없으면 IAE), 비활성 사용자 제외, 요청 시점 구성원 스냅샷 —
  전부 승인자와 같은 규칙으로 자동 적용됨.
- **빈 CC 안전성 확인**: `resolveDirectRequest(List.of(), List.of())` →
  `resolve`가 루프를 돌지 않고 빈 Result 반환, `!groupNames.isEmpty()` 가드로 예외도 없음
  → **CC를 안 쓰는 기존 create가 400이 되지 않는다** ✓ (회귀 위험 지점이었으나 통과)
- 빈 CC면 저장 생략 ✓ (`:372` `if (!ccRecipients.isEmpty())`)
- **저장 순서가 정확하다** — `ccStore.saveAll`(`:373`)이 `notificationService.enqueueSafely`(`:375`)
  **앞**에 있어 REQUESTED 알림이 CC를 포함한다. 뒤바뀌었으면 첫 알림에서 CC가 누락됐다.
- **재승인(fromRequestId) CC 미승계 ✓** — CC 집합은 오직 쿼리 파라미터에서만 온다.
  `shouldRestore` 분기(`:290-292`)는 이전 요청의 승인자만 복원하고 CC는 읽지 않는다.
- `saveAll` 중복 방지 ✓ (`ActiveObjectsApprovalCcStore:25-27` 기존 행 조회 후 없는 것만 create,
  입력도 `LinkedHashSet`으로 1차 dedupe, null/blank 스킵)

## 3. resolver 3-인자 — PASS (M1 제외)

- **2-인자 오버로드 잔존 없음 ✓** — `resolve(ApprovalRequest, ApprovalEvent)`가 완전히 교체됐고
  호출부 전부 3-인자로 갱신(죽은 코드 금지 준수).
- **본인 제외가 CC 합류 *후*에 적용 ✓** — `:42` `addAll(ccKeys)` → `:43` `remove(event.actorKey())`.
  순서가 반대였다면 CC 본인이 일으킨 이벤트에서 자기 알림을 받았을 것이다.
  신규 테스트가 이 케이스(`resolve(..., APPROVED, "cc"), Set.of("cc")` → `Set.of("requester")`)를 검증 ✓
- **`resolveDueSoon` CC 미포함 ✓** — 별도 메서드(`:48-57`)로 ccKeys 파라미터 자체가 없다.
  테스트도 `assertFalse(resolver.resolveDueSoon(request).contains("cc"))`로 확인 ✓
- **`ccStore.findRecipients` 1회 조회 ✓** — `enqueueFor:62`에서 이벤트 루프 **밖**.
  `notificationsEnabled` 체크(`:59-61`) 뒤에 있어 알림 off면 조회조차 안 한다 ✓
- **생성 지점 전부 갱신 ✓** — `ApprovalRestResource:129`(forConfluence),
  `ApprovalPageUpdateListener:73`, `ExpirySweepScheduler:71`. 3곳 모두 `ActiveObjectsApprovalCcStore` 주입.
  누락됐다면 컴파일 에러가 났을 것(생성자 인자 필수화 — 올바른 설계).
- ccKeys에 null/blank가 섞여도 `removeIf(blank)`(`:44`)가 정리 ✓

## 4. `/mine/cc` — PASS

- **파라미터 세트가 `/mine/requested`와 완전 동일** (13개: status, limit, offset, q, spaceKey,
  requesterKey, flowId, createdFrom, createdTo, due, viewStatus, myTurn, myDecided) — 1:1 대조 확인 ✓
- 401 처리·`IllegalArgumentException` → 400 `{"error": ...}` 형식까지 requested와 동일 ✓
- **배치 하이드레이션 준수 ✓** — `repository.findAllByIds(ccStore.findRequestIdsByRecipient(userKey(user)))`
  (`:473`). N+1 없음.
- **userKey 단일 조회 ✓** — requested는 `merge(findByRequesterKey(userKey), findByRequesterKey(getName()))`로
  username 이중 조회를 하지만, CC는 신규 테이블이라 userKey만 쓴다(설계 D7 "username 정규화 아님" 준수).
- **`mineResponse` 재사용 + 최소 변경 ✓** — 기존 16-인자 오버로드를 남기고(`:1316-1322`,
  `cc=false`로 위임) 17-인자를 신설. `/mine`·`/mine/requested` 호출부 무수정.
- **limit 클램프·offset·필터·정렬·페이징 전부 공유 ✓** (`normalizeLimit` 상한 200 등)
- **canView 필터 유지 ✓** (`:1349-1354`) — CC로 지정됐어도 페이지 VIEW 권한이 없으면 목록에서 제외.
  설계 D6이 "의도된 동작(권한 우회 금지)"으로 명시한 그대로.
- **badges `{"cc": PENDING 건수}`만 ✓** (`:1481-1486`) — requested 분기(`:1487-1490`)와 동일 패턴이고
  cc 분기가 먼저 `return`하므로 myTurn/waiting/decided가 섞이지 않는다.

## 5. JSON `cc[]` — PASS

- **단건 GET에만 ✓** — `requestJson(request)`(`:1631-1634`)만 `requestsJson(list, **true**)`를 호출.
  `mineResponse`(`:1369`)는 2-인자 `requestsJson(slice)` → `includeCc=false`(`:1543-1545`).
  따라서 `/mine`·`/mine/requested`·**`/mine/cc` 목록 항목 모두 cc 키 없음** ✓
  (스펙 "/mine/cc 목록 항목은 기존 항목 직렬화 그대로 재사용" 준수)
- **비면 키 자체 생략 ✓** — `:1745` `if (!ccKeys.isEmpty())`. 빈 배열이 아니라 키 부재 = 응답 불변 원칙 준수.
- **displayName 이중 조회 관례 재사용 ✓** — `displayName(key, names)`(`:1749`)로 기존 캐시 맵 공유.
- 조회는 `findRecipientsBatch`(`:1551`)로 배치 ✓ (단건이라 실익은 없지만 경로 일관)

## 6. AO — PASS

- `ApprovalCcEntity`: `REQUEST_ID` `@Indexed @StringLength(64)`, `RECIPIENT_KEY` `@Indexed @StringLength(255)`,
  `CREATED_AT` Long — 스펙과 완전 일치. **`@Unique` 없음**(스펙 "unique 불필요")이므로
  8a의 DBParam 함정이 적용되지 않고, `activeObjects.create(...)` + setter가 올바른 패턴 ✓
- `atlassian-plugin.xml:21-23` — `ApprovalSignatureEntity`, `ApprovalPinEntity`, `ApprovalCcEntity` 3종 등록 ✓
- **IN 청크 관례 준수 ✓** — `ActiveObjectsApprovalCcStore:54`가
  `ActiveObjectsApprovalRequestRepository.chunks(...)`를 **직접 재사용**(같은 패키지의 package-private static).
  `IN_CLAUSE_BATCH = 500` 확인(`ActiveObjectsApprovalRequestRepository:36`) — 스펙의 "청크 500" 일치.
- `findRecipientsBatch` 빈 입력 가드 ✓ (`:51-53`) — `REQUEST_ID IN ()` SQL 오류 방지.
- `findRecipientsBatch`는 죽은 코드가 아니다 ✓ — `:1551`에서 사용.

## 7. 8a 회귀 스팟체크 — 되돌림 없음

| 8a 항목 | 재확인 | 결과 |
|---------|--------|------|
| PIN 검증 위치·코드 매핑 | `decide()` 무변경(생성자 인자만 추가) | 유지 ✓ |
| 서명 REST 6종 | 전부 무변경 | 유지 ✓ |
| `signatureEnabled` off 무영향 | `requestObject` 서명 분기 무변경 | 유지 ✓ |
| POST /settings blank 허용(1차 치명 수정) | `:818-819`, `:837-838` 유지 | 유지 ✓ |
| imageUrl 상대경로 + URLEncoder | `signatureImageUrl` 무변경 | 유지 ✓ |
| `ApprovalRestResourceSettingsTest` 2건 | 카운트 유지 | 유지 ✓ |

**`ApprovalRestResourcePinTest` 의미 약화 없음 ✓** (코디네이터 지적 사항)
파일 전체를 읽어 대조한 결과, 변경은 `fixture(...)`의 **생성자 인자 2개 추가**뿐이다:
```java
new ApprovalNotificationService(new NoOpNotificationStore(), settings,
        new ActiveObjectsApprovalCcStore(activeObjects), Clock.systemUTC()),   // ← ccStore 추가
...
new ActiveObjectsApprovalCcStore(activeObjects),                              // ← ccStore 추가
requests);
```
- 5개 테스트 메서드의 **assert가 하나도 바뀌지 않았다** — `pinStore.findCount == 0`,
  `startsWith("PIN_NOT_SET:")`, `startsWith("PIN_INVALID:")`, 200, `startsWith("PIN_LOCKED:")` 전부 그대로.
- `fixture(signatureEnabled, signaturePinRequired)` 인자 조합도 불변(false/false, true/true).
- 주입된 `ActiveObjectsApprovalCcStore`는 빈 AO 프록시 위에서 동작하므로
  `findRecipients` → 빈 Set, `findRecipientsBatch` → 빈 Map. PIN 분기 판정에 영향 없음.
- 실행 시간 0.518s(8a 0.513s)로 동일 — PBKDF2가 여전히 실제로 돈다.
- 부수 효과: `requestJson`이 이제 `findRecipientsBatch`를 타므로 **8b의 CC JSON 경로도
  이 테스트가 간접 커버**한다(NPE·프록시 오류 없이 통과).

---

# Codex 재작업 지시문 초안 (spec-8b2-rework.md 에 삽입)

> ## 재작업 8b-R — QA FAIL 수정 (중대 2건 + 경미 2건)
>
> 아래 항목만 고쳐라. **다른 줄은 건드리지 마라.** 기존 금지 목록(재포매팅 금지·게이트 우회 금지·
> 커밋 금지·C10 수정 금지·**APR_APV에 role 컬럼 금지**)은 그대로 적용된다.
>
> ### R1 (중대) CC 알림이 중간 승인마다 발송된다 — 스펙 전제가 틀렸다
> 8b 스펙의 *"중간 단계 통과는 이벤트가 없으므로 자연히 제외"*는 **사실이 아니다.**
> `approval-domain/.../ApprovalRequest.java:248-250`이 **승인 결정마다** `APPROVED` 이벤트를 추가하고,
> 상태 전이는 `:253-255`에서만 일어난다. 지금 구현은 3단계 결재선에서 CC에게 4번 알린다(설계 D6은 2번).
>
> `NotificationRecipientResolver.resolve`에서 `recipients.addAll(ccKeys)`를 조건부로 바꿔라.
> - `APPROVED`가 아닌 이벤트(REQUESTED/REJECTED/EXPIRED/CANCELLED) → 항상 합류
> - `APPROVED` → `request.status() == ApprovalStatus.APPROVED` **이면서**
>   그 이벤트가 `request.events()` 중 **마지막 APPROVED 이벤트**일 때만 합류
> - `recipients.remove(event.actorKey())`는 지금처럼 합류 **뒤에** 유지할 것
>
> **함정 (반드시 읽어라)**: `ApprovalNotificationService.enqueueFor`는 호출될 때마다
> `request.events()` **전체를 재순회**한다. `status == APPROVED`만으로 게이트하면,
> 최종 승인 시점에 과거 중간 APPROVED 이벤트들이 전부 조건을 만족해
> CC 알림이 한꺼번에 생성된다(`createIfAbsent` 키에 recipientKey가 들어가 중복 제거가 안 된다).
> "마지막 APPROVED 이벤트" 식별이 필수다.
>
> **테스트 필수** — 현재 테스트(`cc는_요청과_최종_결정_알림에_포함되고_actor는_제외된다`)는
> 승인자가 1명뿐이라 중간/최종을 구분하지 못하고 버그를 고정하고 있다. 승인자 2명 이상으로 바꿔서:
> ① 1단계 승인 직후 APPROVED 이벤트 → CC 미포함
> ② 최종 승인 후 마지막 APPROVED 이벤트에만 CC 포함, 이전 APPROVED에는 미포함
> ③ 서비스 레벨: 최종 승인까지 진행한 뒤 `enqueueFor` 호출 시 CC에게 적재된 in-app 행이 **정확히 2개**
>
> ### R2 (중대) CC에서 승인자 제거가 키 형식 불일치로 실패한다
> `ApprovalRestResource.java:344-351`. `ccRecipients`는 `resolveUserKey`로 정규화됐는데
> `removeAll` 대상인 `approvers`/`stepApprovers`는 원본 키다. 승인자 키에 username이 섞이는 것은
> 이 저장소의 알려진 사실이다(`:352-355` 주석, 설계 D3). 승인자를 username으로 지정하고
> 같은 사람을 CC에 넣으면 제거되지 않아 참조 탭에 중복 노출된다.
> 승인자 쪽도 `resolveUserKey`로 정규화한 뒤 `removeAll`하라.
> **테스트**: 승인자=username, CC=같은 사람의 userKey인 create에서 CC가 비는지 검증.
>
> ### R3 (경미) `inClause` 중복 제거
> `ActiveObjectsApprovalCcStore`의 private `inClause`를 지우고,
> `chunks`를 재사용한 것과 같은 방식으로 `ActiveObjectsApprovalRequestRepository`의 것을
> package-private static으로 공유하라. 8a의 `ActiveObjectsApprovalSignatureStore` 사본도 함께 정리.
>
> ### R4 (경미) FQN 인라인 정리
> `ApprovalNotificationService.java:62`의 `java.util.Set<String>`을 상단 import로 옮겨라.
> `ApprovalNotificationTest`의 `MemoryCcStore`도 동일.
>
> ### 게이트
> ```
> set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
> ```
> **현재 C9 테스트는 107건이다(161이 아니다).** R1·R2의 신규 테스트로 몇 건이 되는지 실측해서 보고하라.

---

# 코디네이터 확인 요청

1. **스펙 밖 변경 3건의 출처** (m1) — `ApprovalInboxServlet`·`ApprovalSettingsServlet`·`approval.css`.
   1차 QA(8a) 시점에는 없던 변경이다. 사용자 직접 수정이면 정상, Codex면 금지 1·9번 위반 기록 대상.
2. **"161 tests" 보고** (m2) — 실측 107. Codex 보고 신뢰도 관련 기록 사항
   (`MEMORY.md`의 "Codex 보고를 그대로 믿지 말 것" 항목에 사례 추가 권고).
3. **8d UI 착수 전 R1 필수** — CC 알림 스팸은 화면이 붙는 순간 사용자에게 즉시 보인다.
