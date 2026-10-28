# QA 8b — 2차 검증 (재작업 R1~R4 확인, 2026-08-13)

대상: `_workspace/spec-8b2-rework.md` (1차 QA `_workspace/qa-8b.md`의 재작업 지시문)
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **PASS**

| 심각도 | 1차 | 2차 |
|--------|-----|-----|
| 치명 | 0 | 0 |
| 중대 | 2 | **0** |
| 경미 | 5 | 5 (해소 2 · 잔여 2 · 신규 1) |

1차 중대 2건이 **모두 실질적으로 해소**됐다. 특히 R1은 내가 경고한 함정
("최종 승인 시 과거 중간 APPROVED 이벤트 일괄 적재")을 **코드와 테스트 양쪽에서** 회피했다.
1차 PASS 항목(CC 격리 증명)의 회귀도 없고, 코디네이터의 직접 수정 3건도 보존됐다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 109, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS
```

**테스트 카운트 107 → 109 (+2) 확인** — Codex 보고와 일치(1차의 "161" 허위 보고와 달리 이번은 정확).
증가분의 소재를 파일별로 특정했다:

| 테스트 클래스 | 1차 | 2차 | 신규 메서드 |
|---------------|-----|-----|-------------|
| `notification.ApprovalNotificationTest` | 16 | **17** | `final_approval_enqueues_exactly_two_in_app_cc_notifications` |
| `rest.ApprovalRestResourcePinTest` | 5 | **6** | `create_removes_username_approver_from_user_key_cc` |

`ApprovalRestResourcePinTest`는 **untracked 파일**이라 `git diff`에 나타나지 않는다 —
파일별 테스트 카운트를 대조하지 않았으면 R2 테스트의 존재를 놓칠 뻔했다(기록용).

## 재포매팅·압축 검사 (PASS)

`git diff --numstat` 전수. 1차 대비 증분만 표기:

| 파일 | 1차 +/- | 2차 +/- | 증분 해석 |
|------|---------|---------|-----------|
| `NotificationRecipientResolver` | 2/1 | **20/1** | +18 = `ccJoins` 메서드 13줄 + import 2 + 호출 3 |
| `ApprovalRestResource` | 359/14 | **363/14** | +4 = `eligibleApprovers` 정규화 블록 (삭제 불변) |
| `ApprovalNotificationService` | 12/7 | **13/7** | +1 = `import java.util.Set` |
| `ApprovalNotificationTest` | 38/16 | **66/16** | +28 = 신규 테스트 2종 + `MemoryCcStore` 생성자 |
| `ActiveObjectsApprovalRequestRepository` | 0/0 | **1/1** | R3 — 아래 별도 검증 |

**삭제 줄 수가 1차 43 → 2차 44로 단 1줄만 늘었고**, 그 1줄은 R3의 접근제어자 변경이다.
한 줄 압축·주석 삭제·무관한 줄 변경 없음.

---

# R1~R4 항목별 실측

## R1 (중대 해소) CC 중간 승인 알림 — **PASS, 함정 회피 확인**

### 구현 (`notification/NotificationRecipientResolver.java:44-64`)
```java
        if (ccJoins(request, event)) {
            recipients.addAll(ccKeys);
        }
        recipients.remove(event.actorKey());     // ← 순서 유지 ✓

    private static boolean ccJoins(ApprovalRequest request, ApprovalEvent event) {
        if (event.type() != ApprovalEventType.APPROVED) {
            return true;
        }
        if (request.status() != ApprovalStatus.APPROVED) {
            return false;
        }
        return request.events().stream()
                .filter(candidate -> candidate.type() == ApprovalEventType.APPROVED)
                .reduce((first, second) -> second)      // 마지막 APPROVED 이벤트
                .map(last -> last.id().equals(event.id()))
                .orElse(false);
    }
```

### 함정 회피 여부 — 코드 추적으로 검증

`ApprovalNotificationService.enqueueFor`는 호출될 때마다 `request.events()` **전체를 재순회**한다.
2단계 결재선(first → second)에서 최종 승인 직후 `enqueueFor`가 도는 시나리오를 이벤트별로 추적했다:

| 재순회 대상 이벤트 | `ccJoins` 판정 | CC 알림 |
|--------------------|----------------|---------|
| REQUESTED | `type != APPROVED` → **true** | 합류 (요청 시점에 이미 적재 → `createIfAbsent` 중복 제거) |
| APPROVED #1 (중간) | status는 APPROVED지만 **마지막 APPROVED가 아님** → **false** | **미합류 ✓ 함정 회피** |
| APPROVED #2 (최종) | 마지막 APPROVED → **true** | 합류 (신규 1건) |

→ CC에게 남는 in-app 행은 **REQUESTED 1 + 최종 APPROVED 1 = 정확히 2건**.
`status == APPROVED`만으로 게이트했다면 APPROVED #1도 통과해 총 3건이 됐을 것이다.

**판정의 안정성(재순회 멱등성) 확인**: 최종 승인 이후 `status`는 APPROVED로 고정되고
마지막 APPROVED 이벤트도 바뀌지 않으므로, `enqueueFor`를 몇 번 다시 호출해도
CC 합류 대상 이벤트는 항상 동일한 하나다. **증분 호출(결정마다 1회)과 일괄 호출(마지막 1회)의
결과가 같다** — 중간 승인 시점에는 `status != APPROVED`라 false, 최종 시점에는 마지막만 true.

**`events()` 순서 전제 검증** — `reduce((first, second) -> second)`가 "마지막"을 고르려면
스트림 순서가 시간순이어야 한다.
`ApprovalRequest.events()`(`:434-436`)는 `return List.copyOf(events);` — 삽입 순서를 보존하는
`List` 복사본이다(Set이었다면 이 로직이 깨졌다). ✓

**부수 케이스 확인**
- 승인자 1명 요청: APPROVED 이벤트 1개, status APPROVED, 그것이 마지막 → CC 합류 ✓ (정상)
- 단계 내 `minimumApprovals=2`: 1번째 승인 시 status PENDING → false, 2번째에 true ✓
- 편집으로 EXPIRED된 후: `status != APPROVED` → 과거 APPROVED 이벤트에 CC 미합류.
  이미 적재된 최종 APPROVED CC 행은 삭제되지 않으므로 유실 없음. EXPIRED 이벤트 자체는
  `type != APPROVED` → CC 합류 ✓
- `requiresReapproval()`은 status와 직교(`ApprovalRequest.java:445`)라 판정이 흔들리지 않음 ✓

### 신규 테스트 — **중간/최종을 실제로 구분한다**

**① 리졸버 레벨** `ApprovalNotificationTest:74-96` (기존 테스트를 승인자 2명·2단계로 교체)
```java
ApprovalRequest request = ApprovalRequest.createSequential(..., List.of(List.of("first"), List.of("second")), ...);

assertEquals(Set.of("first","second","cc"), resolver.resolve(request, event(REQUESTED,"requester"), Set.of("cc")));

request.approve("first", NOW.plusSeconds(1));
ApprovalEvent firstApproved = request.events().get(request.events().size() - 1);
assertEquals(Set.of("requester"), resolver.resolve(request, firstApproved, Set.of("cc")));   // ← ① 중간 승인에 CC 미포함

request.approve("second", NOW.plusSeconds(2));
ApprovalEvent finalApproved = request.events().get(request.events().size() - 1);
assertEquals(Set.of("requester"), resolver.resolve(request, firstApproved, Set.of("cc")));   // ← ② 최종 후 과거 이벤트 재평가에도 미포함
assertEquals(Set.of("requester","cc"), resolver.resolve(request, finalApproved, Set.of("cc")));
```
- 1차 QA가 지적한 "승인자 1명이라 구분 불가" 문제가 **해소**됐다 — 실제 도메인 객체로
  단계별 승인을 진행시켜 중간/최종 이벤트를 각각 잡아낸다.
- **핵심**: `finalApproved` 이후에 `firstApproved`를 **다시** 평가하는 assert(위 ②)가 있다.
  이것이 정확히 내가 경고한 함정의 직접 회귀 가드다. `status == APPROVED`만으로 게이트한
  구현은 이 줄에서 실패한다.

**② 서비스 레벨 "정확히 2건"** `ApprovalNotificationTest:98-112`
```java
request.approve("first", NOW.plusSeconds(1));
request.approve("second", NOW.plusSeconds(2));
new ApprovalNotificationService(store, settings(true), new MemoryCcStore(Set.of("cc")), clock()).enqueueFor(request);

assertEquals(2, store.rows.stream()
        .filter(row -> "cc".equals(row.recipientKey()) && ApprovalNotificationService.IN_APP.equals(row.channel()))
        .count());
```
- 요구한 ③번 케이스 **존재 확인** ✓
- `enqueueFor`를 **최종 승인 후 1회만** 호출하는 형태 = 3개 이벤트를 전부 status APPROVED 상태에서
  재평가하는 **최악 시나리오**를 정면으로 친다. 함정 검증으로 올바른 설계.
- 채널을 `IN_APP`으로 좁혀 세므로 email 행이 섞여 오탐하지 않는다 ✓
- `MemoryCcStore(Set.of("cc"))` 생성자를 새로 만들어 CC를 실제로 주입한다(기존 무인자 생성자는
  빈 Set 유지 → 기존 테스트 8종 영향 없음) ✓

## R2 (중대 해소) CC 승인자 제거 키 정규화 — **PASS, 테스트 판별력 확인**

### 구현 (`rest/ApprovalRestResource.java:344-355`)
```java
Set<String> ccRecipients = ccResult.approverKeys().stream()
        .map(this::resolveUserKey).filter(Objects::nonNull)
        .filter(key -> !key.equals(requesterKey))
        .collect(Collectors.toCollection(LinkedHashSet::new));
Set<String> eligibleApprovers = (stepApprovers == null
        ? approvers.stream()
        : stepApprovers.stream().flatMap(Collection::stream))
        .map(this::resolveUserKey)            // ← 승인자 쪽도 정규화 (수정 지점)
        .filter(Objects::nonNull)
        .collect(Collectors.toSet());
ccRecipients.removeAll(eligibleApprovers);
```
양쪽 모두 `resolveUserKey`를 거친 뒤 비교한다 ✓. `stepApprovers`/`approvers` 분기 유지 ✓.
`requesterKey`는 원래부터 `userKey(...)`라 정규화 대상이 아니다 ✓.

### 테스트가 **실제로 판별하는지** 검증
`ApprovalRestResourcePinTest:114-142` `create_removes_username_approver_from_user_key_cc`
```java
resource.create("PAGE", 100L, null, 1, 1,
        "alice",            // approverKeys  ← username 형
        null,
        "alice-user-key",   // ccKeys        ← userKey 형 (같은 사람)
        null, 1, null, null, null, null, null, null);
assertEquals(201, response.getStatus());
assertTrue(ccStore.recipientKeys.isEmpty());
```
파라미터 위치를 `create` 시그니처(`:198-214`)와 1:1 대조해 `approverKeys`/`ccKeys` 자리 확인 ✓.
스텁 `userAccessorForAlice()`(`:201-206`)는 `getUserByKey`·`getUserByName` 양쪽에
`alice()`(`:215-219`, key = `"alice-user-key"`)를 돌려준다.

**구·신 코드 대조로 판별력 확인:**

| | 구 코드(1차) | 신 코드(2차) |
|---|---|---|
| `ccRecipients` | `{"alice-user-key"}` | `{"alice-user-key"}` |
| `removeAll` 인자 | `{"alice"}` (원본) | `{"alice-user-key"}` (정규화) |
| 결과 | `{"alice-user-key"}` → `saveAll` 호출 | `{}` → `saveAll` 미호출 |
| assert | **실패** | 통과 |

→ 이 테스트는 구 코드에서 확실히 깨진다. **형식적 테스트가 아니다** ✓

부수 확인: 인증 사용자 `user()`의 키는 `"alice"`이므로 `requesterKey = "alice"`이고
`!"alice-user-key".equals("alice")` → CC가 요청자 필터에서 걸러지지 **않는다**.
즉 요청자 필터가 우연히 테스트를 통과시키는 일이 없다 ✓ (검증이 승인자 제거 경로를 정확히 겨냥).

## R3 (경미 해소) `inClause` 공유 — **PASS**

`ActiveObjectsApprovalRequestRepository`의 유일한 변경을 `git diff`로 확인했다 —
**접근제어자 1줄뿐**이다:
```diff
-    private static String inClause(String column, int size) {
+    static String inClause(String column, int size) {
```
소비 측:
- `ActiveObjectsApprovalCcStore:55` → `ActiveObjectsApprovalRequestRepository.inClause(...)` (사본 삭제됨)
- `ActiveObjectsApprovalSignatureStore:55` → 동일 (8a 사본도 함께 정리됨) ✓

`ApprovalRestResource:2005`의 private 사본은 남아 있으나, 이는 `rest` 패키지라
`storage`의 package-private 메서드에 접근할 수 없다 — **구조상 불가피**하며 지시 범위 밖이다(정보).

## R4 (경미 해소) FQN 정리 — **PASS**

`java.util.Set` / `java.util.Collection` 인라인 FQN 전수 grep 결과 **import 문에만 존재**:
- `ApprovalNotificationService.java:12` `import java.util.Set;` → `:62`가 `Set<String> ccKeys`로 정리됨
- `ApprovalNotificationTest.java:20, 24` import 추가 → `MemoryCcStore` 시그니처 정리됨

(참고: `ApprovalRestResourcePinTest`의 `CapturingCcStore`·`MemoryCcStore`에는 `java.util.Collection`
인라인이 남아 있다 — R4 지시 대상 파일이 아니었다. 아래 n4.)

---

# 코디네이터 직접 수정 3건 — 보존 확인

사용자 지시로 코디네이터가 직접 넣은 변경(데코레이터 제목 숨김 + 아이콘 간격 보정)이
Codex 재작업으로 되돌려지지 않았는지 확인했다.

| 파일 | +/- | 검증 |
|------|-----|------|
| `servlet/ApprovalInboxServlet.java` | 2/0 | `title-heading` 2건(주석+규칙) 잔존 ✓ |
| `servlet/ApprovalSettingsServlet.java` | 2/0 | `title-heading` 2건 잔존 ✓ |
| `resources/css/approval.css` | 28/0 | 1차와 동일 28줄, 삭제 0 ✓ |

세 파일 모두 1차 QA 시점과 **바이트 단위로 동일한 numstat**이다. 되돌림·덮어쓰기 없음.

---

# 1차 PASS 항목 회귀 스팟체크 — 되돌림 없음

## CC 격리(금지 10번) — 여전히 완전 PASS

```
git diff --stat -- approval-domain/ storage/ApprovalApproverEntity.java
→ (출력 없음 = 무변경)
```
- **APR_APV role 컬럼 없음** — `ApprovalApproverEntity` 무변경 ✓
- **`approval-domain/` 전체 무변경** — `eligibleApproverKeys()`, `decisions()`,
  `ApprovalRequestRepository` 포트 계약 불변 ✓
- **`ActiveObjectsApprovalRequestRepository`는 R3의 접근제어자 1줄만 변경** — diff 전문을 읽어
  다른 변경이 없음을 확인했다. `findByApproverKey`(`:200`), `saveApprovers`(`:515`)는
  본문·위치 모두 그대로 ✓ (설계 D5가 경고한 "8개 지점 오염" 여전히 0건)

## 기타

| 1차 PASS 항목 | 재확인 | 결과 |
|---------------|--------|------|
| `resolveDueSoon` CC 미포함 | 별도 메서드(`:66-75`), ccKeys 파라미터 없음. 테스트 assert 유지 | 유지 ✓ |
| 본인 제외가 CC 합류 **후** | `:44-47` 순서 유지 | 유지 ✓ |
| 2-인자 오버로드 잔존 없음 | `resolve`는 3-인자 하나뿐 | 유지 ✓ |
| resolver 생성 지점 3곳 | REST·listener·scheduler 무변경 | 유지 ✓ |
| `/mine/cc` 파라미터·badges·canView | 무변경 | 유지 ✓ |
| `cc[]` 단건 GET 한정 | `requestsJson(list, true)`는 `requestJson`만 | 유지 ✓ |
| AO 청크 500·빈 입력 가드 | `chunks` 재사용, `findRecipientsBatch:51-53` 가드 | 유지 ✓ |
| CC 없는 create가 400 안 됨 | `resolveDirectRequest(empty,empty)` 안전 | 유지 ✓ + **신규 테스트가 실증** (create 201 확인) |
| 8a PIN/서명 | `ApprovalRestResourcePinTest` 5건 assert 무변경, PBKDF2 실제 수행 | 유지 ✓ |

---

# 경미 (신규 1 · 잔여 2)

## n1. (신규) CC 테스트가 PIN 테스트 파일에 들어가 있다
`ApprovalRestResourcePinTest.java:114-142` `create_removes_username_approver_from_user_key_cc`.
파일 이름·목적(PIN)과 내용(CC 중복 제거)이 어긋난다. 스텁(`emptyActiveObjects`, `permissionManager`,
`pageManager`, `InMemoryRequestRepository`)을 재사용하려는 실용적 이유는 이해되지만,
8c/8d에서 CC 테스트가 늘어나면 찾기 어려워진다.
→ `rest/ApprovalRestResourceCcTest.java`로 분리하고 스텁은 공용 헬퍼로 빼는 것을 권고(잔여).

## n2. (신규) "CC 본인이 actor면 제외" assert가 이제 다른 이유로 통과한다
`ApprovalNotificationTest:93-94`
```java
assertEquals(Set.of("requester"), resolver.resolve(request, event(ApprovalEventType.APPROVED, "cc"), Set.of("cc")));
```
`event(APPROVED, "cc")`는 `request.events()`에 없는 **합성 이벤트**다. R1 이후 `ccJoins`가
"마지막 APPROVED 이벤트인가"를 보므로 이 이벤트는 **false** → CC가 애초에 합류하지 않는다.
따라서 `recipients.remove(event.actorKey())`를 지워도 이 assert는 통과한다 —
"CC actor 제외"를 더 이상 격리 검증하지 않는다.
(actor 제외 자체는 기존 테스트들이 승인자 actor로 커버하므로 **회귀 위험은 낮다**.)
→ CC가 항상 합류하는 이벤트로 바꾸면 격리된다:
`resolver.resolve(request, event(ApprovalEventType.CANCELLED, "cc"), Set.of("cc"))`에
`"cc"`가 없어야 함을 assert.

## n3. (잔여, 1차 m2) CC 저장소·`/mine/cc`·`cc[]` JSON 테스트 여전히 0건
R2 테스트가 create 경로를 처음으로 커버했지만, `ApprovalCcStore`의 `saveAll` 중복 방지·
`findRecipientsBatch` 청크·`findRequestIdsByRecipient`, `/mine/cc` 엔드포인트,
`cc[]` JSON 직렬화는 여전히 자동 테스트가 없다. 8d 착수 전 보강 권고.

## n4. (잔여, 1차 m3) 단건 응답 1건당 CC 테이블 조회 2회
`requestJson` → `findRecipientsBatch` 1회 + `enqueueSafely` → `findRecipients` 1회.
1차와 동일, 미변경. 경미하므로 잔여로 기록.

## n5. (정보) `ccJoins`가 이벤트마다 `events()`를 스트림 순회 — `enqueueFor` 1회당 O(E²)
요청당 이벤트 수 E는 실무상 한 자릿수라 무시할 만하다. 신경 쓰인다면
`enqueueFor`에서 마지막 APPROVED 이벤트 id를 1회 계산해 넘기는 방식으로 O(E)가 된다.
(현 구현은 resolver의 "스냅샷+이벤트만" 순수성을 지키는 대가이므로 설계상 타당한 선택.)

---

# 결론 및 후속 권고

**배치 8b는 PASS.** 커밋 및 8c 착수 가능.

1. **8d UI 착수 전 남은 보강** — n3(CC 저장소·`/mine/cc`·`cc[]` 테스트).
   8d가 참조 탭·CC 피커를 붙이면 이 경로들이 처음으로 사용자에게 노출된다.
2. **8c 스펙에 반영할 8a 잔여** (qa-8a2 결론에서 이월) —
   `decisions[].signature.imageUrl`은 상대 경로이므로 `root.dataset.contextPath`를 붙여 사용.
3. **잡항목 묶음** — n1(CC 테스트 파일 분리), n2(actor 제외 assert 격리),
   n4(CC 조회 2회), 그리고 8a 잔여 3건(Javadoc 병합·형식 오류 메시지 분리·사전 캐시 게이트).
   전부 1~5줄이라 `docs/backlog.md`의 잡항목으로 묶어도 된다.
4. **실기동 확인 사항** (자동 게이트로는 불가) — QuickReload 재설치 후 `APR_CC` 테이블 생성,
   CC 지정 요청의 알림이 요청 1회 + 최종 결정 1회만 오는지, 참조 탭 노출,
   CC가 승인/반려 버튼을 얻지 못하는지(403).

## Codex 보고 정확도 (기록)

1차의 "161 tests" 허위 보고와 달리, 이번 보고("Tests run: 109", R1~R4 전부 반영, 미완 없음)는
**전 항목이 실측과 일치**했다. 다만 R2 테스트가 untracked 파일(`ApprovalRestResourcePinTest`)에
들어가 `git diff`로는 보이지 않았다 — 검증 시 **파일별 테스트 카운트 대조**가 필요했던 사례로 기록.
