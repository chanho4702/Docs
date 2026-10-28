# QA 7a — 2차 (재작업 검증)

검증자: approval-qa / 2026-08-12
대상 스펙: `spec-7a4-rework.md` (R1~R7)
1차 보고서: `qa-7a.md` (FAIL — 중대 3, 경미 9)
기준: `HEAD` (미커밋 working tree diff)

---

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | 0 |
| 중대 | 1 |
| 경미 | 6 |

1차 FAIL 사유(R1·R2·R3)는 **전부 실질적으로 해소**됐고 R4·R5·R7도 적용됐다.
FAIL 사유는 **R6 하나**다 — 스펙이 "손대지 마라"고 못박은 기존 400 응답 본문까지 JSON으로 바꿔,
승인 요청 생성 실패 시 사용자에게 `{"error":"..."}` raw JSON이 그대로 표시되는 회귀가 생겼다.
수정 범위는 4줄 되돌리기다.

---

## 0. 검증 게이트 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -pl approval-confluence9 -am test  → BUILD SUCCESS (domain 54, c9 94, 실패 0)
mvn -pl approval-domain test           → BUILD SUCCESS (54: ApprovalRequestTest 25 / Concurrent 3 /
                                          ExpiryReason 10 / PageSnapshotExpiry 2 / Sequential 14)
mvn -pl approval-confluence10 compile  → BUILD SUCCESS
```
- Codex 보고("domain 54 + c9 94 그린") **수치 일치 확인** ✓
- `clean`/`package`/`install` 미실행 ✓ (dev 인스턴스 보호)
- `git status approval-confluence10/` 비어 있음 → C10 소스 미수정 ✓

---

## 1. R별 판정

### R1 — hydrate 빈 행 조립 : **PASS**

`storage/ActiveObjectsApprovalRequestRepository.java:267-275`
```java
List<ApprovalApproverEntity> requestApprovers =
        new ArrayList<>(approversById.getOrDefault(entity.getRequestId(), List.of()));
requestApprovers.sort(Comparator.comparingInt(...getStepOrder).thenComparingInt(...getID));
List<ApprovalEventEntity> requestEvents =
        new ArrayList<>(eventsById.getOrDefault(entity.getRequestId(), List.of()));
requestEvents.sort(Comparator.comparing(...getOccurredAt, Comparator.nullsLast(naturalOrder())));
```
- 불변 리스트 `.sort()` 제거 ✓ (가변 복사본), OCCURRED_AT null NPE 가드 ✓
- 신설 `ActiveObjectsApprovalRequestRepositoryAssemblyTest:25,40-41`이 승인자 0·이벤트 0 요청을
  실제로 조립하고 `eligibleApproverKeys().isEmpty()`·`events().isEmpty()`를 단언 — **케이스 실커버** ✓

**전제 실측 — 1차 보고서 정정:**
1차 중대-1은 "HEAD의 `find(UUID)`는 같은 데이터에서 정상 동작했다"고 적었으나 **사실이 아니다.**
HEAD 경로도 승인자 0행이면 `toRequest` → `steps.isEmpty()` 분기 → `ApprovalRequest.restore(eligible={})`
→ `singleStep`(`ApprovalRequest.java:545-546`)에서 `ApprovalException("승인자는 한 명 이상이어야 합니다.")`를 던졌다.
즉 이 케이스는 **1부가 만든 회귀가 아니라 선재 결함**이었고, 재작업은 UOE와 선재 예외를 **둘 다** 없앴다.
(1차의 UOE 실측 자체는 정확했다. 도달 시 결과가 500이라는 결론도 동일.)

**그 대가로 도메인 가드가 완화됐다 (스펙 범위 밖 변경, 기록 필요):**
`domain/ApprovalRequest.java:603,621` — `normalizeSteps`의 두 예외(`"승인 단계가 하나 이상 필요합니다."`,
`"승인자는 한 명 이상이어야 합니다."`)가 `return List.of()`로 바뀌었다.
`storage/...Repository.java:135-141`에 빈 행 전용 분기(`steps.isEmpty() && eligible.isEmpty()` →
`restoreSequential(..., List.of(), ...)`)가 신설돼 이 완화가 실제로 필요하다.

- **생성 경로는 여전히 방어됨** ✓ — `create`→`singleStep`(545-546), `createSequential`→`toSteps`(560-561,584-585)이
  빈 승인자를 계속 거부한다. 완화의 영향은 **restore 계열 한정**.
- **0단계 aggregate의 런타임 안전성 실측** — `currentStepIndex()`(485-491)는 빈 리스트에서 0 반환(IOOBE 없음),
  `canDecideNow`(397-398)는 `stepOrderOf`=0이라 항상 false, `approve()`는 `ensureEligible`에서 차단.
  → 승인 불가·조회 가능 상태로 안전하게 존재한다.
- **잔여 리스크**: fail-fast 상실. 앞으로 조립 로직 버그로 단계가 비면 예외 대신
  "승인자 0명 PENDING 요청"이 조용히 화면에 나온다. (현재 다른 조립 버그는 AssemblyTest가 잡음 — 아래 R2)

### R2 — chunks 단일 출처 + 조립 테스트 : **PASS** (커버리지 보강 여지)

- `hydrate`(224-251)의 인라인 분할 루프 제거, **232행 `for (List<String> batch : chunks(ids))`** ✓
  → `chunks()` 사용처가 hydrate/`findMeta`(378)/`findApproverViaGroupsBatch`(453) 셋 모두 단일 출처가 됐고,
  `ChunkTest`(499/500/501)가 이제 **hydrate가 실제로 지나는 코드**를 덮는다 ✓
- `assemble`(253-282)이 package-private 진입점으로 분리되고 hydrate가 245행에서 이를 호출 →
  `AssemblyTest:24`가 **프로덕션 `assemble`을 직접 호출**한다. Proxy로 AO 엔티티 인터페이스만 fake하고
  조립 로직은 실물이다 — **자기만족 stub 아님** ✓
- 커버 확인:
  - 이벤트 정렬(HEAD `ORDER BY OCCURRED_AT ASC`): later/earlier 역순 입력 → `[earlier, later]` 단언(45-46) ✓
  - 승인자 정렬 tiebreak(HEAD `ORDER BY ..., ID ASC`): id 2/1 역순 입력 → `[alice, bob]` 단언(44) ✓
  - legacy STEP_ORDER=0: 42-43행 `steps().size()==1`·`minimumApprovals()==1`.
    legacy 분기가 사라지면 이제 0단계 aggregate가 되어 44행이 실패하므로 **실효 가드** ✓
  - 빈 행(R1 회귀 가드) ✓ / requestId 2건 혼재 시 행이 엉뚱한 요청에 붙지 않음 ✓
- **미커버(경미-2 참조)**: STEP_ORDER≥1 다단계 정렬(비교자 1차 키), 두 요청이 **모두** 행을 가진 분배.

### R3 — 매크로 읽기 전용 복원 + sweep 축소 : **PASS**

- `domain/ApprovalWorkflowService.java:217-219` `pageSnapshotReadOnly(long)` 신설 —
  `repository.findByPageId` 결과만 반환(순수 읽기) ✓
- `macro/ApprovalRegionMacro.java:84-85`
  ```java
  // 매크로 렌더링은 읽기 전용이며 lazy expiration이나 저장을 수행하지 않는다.
  List<ApprovalRequest> snapshot = workflowService.pageSnapshotReadOnly(target.pageId());
  ```
  → 읽기 전용 주석 복원 ✓, DB 쓰기·클러스터 락 경로 제거 ✓.
  덤으로 `approvedHistory`(:195)가 snapshot을 재사용해 HEAD의 `findByPageId` 추가 호출도 사라짐(순이득)
- `ApprovalWorkflowService.java:207-215` `pageSnapshot`의 sweep이 **최신 PAGE 요청 1건**으로 축소 ✓
  — `latestPageRequest`로 고르고 due일 때만 `expireDue` → `snapshot.set(indexOf(...), ...)`.
  `ApprovalRequest`는 equals 미오버라이드(동일성 비교)이므로 `indexOf`가 같은 인스턴스를 정확히 찾는다 ✓.
  치환 위치가 보존되므로 재선택 시 동률 규칙(뒤가 이김)도 그대로 ✓
- `findLatestPageRequest`(197-199)가 `latestPageRequest(pageSnapshot(pageId))`로 위임 —
  HEAD 의미(최신 PAGE lazy expiration + 반환)와 **동률 포함 동일** ✓
- `PageSnapshotExpiryTest`가 새 의미로 재작성 ✓ (untracked 신규 파일이므로 기존 테스트 의미 변경 아님)
  - `:33-39` 최신 PAGE due만 EXPIRED, **영역 due·과거 PAGE due는 PENDING 유지**, 저장소 영속 상태까지 확인,
    `saveCalls == 1`
  - `:50-54` `pageSnapshotReadOnly`는 상태 미변경 + **`saveCalls == 0`** — 읽기 전용을 저장 호출 횟수로 직접 검증 ✓

### R4 — latest 셀렉터 단일 출처 : **PASS**
`ApprovalWorkflowService.java:201-205` `public static Optional<ApprovalRequest> latestPageRequest(List)`.
`findLatestPageRequest`(198)와 `panel/ApprovalPagePanel.java:91`이 **같은 함수**를 호출한다 ✓
(패널의 `Stream.max`(앞이 이김) 불일치 제거).

### R5 — myTurn 술어 단일 출처 : **PASS**
`ApprovalRestResource.java:1160-1162` `static boolean isMyTurn(...)` 하나를
필터(`matchesFilters:1156`)·집계(`statusCounts:1190`)·직렬화(`requestObject:1379`)가 공유 ✓
(1348행의 재구현 `currentKey != null && r.canDecideNow(currentKey)` 소멸 확인).

### R6 — 400 본문 JSON 통일 : **FAIL (중대-1)** — 아래 §2

### R7 — 기타 확정 수정 : **PASS** (잔여 경미 3)
1. **README:180-182** ✓ — `…하위 호환으로 남아 있으며 \`steps\`가 함께 오면 무시됩니다.`가 한 문장으로 복원되고,
   `fromRequestId` 문장은 빈 줄 뒤 **독립 문단**으로 이동. 직접 읽어 문맥 정상 확인.
2. **facets** ✓ — `ApprovalRestResource.java:1198-1230`이 `LinkedHashMap` + `facet()` 헬퍼(1236-1241)로
   키 순서를 `key→name`/`id→name`으로 고정, 결과도 `requesters→flows→spaces` 순서 고정(1226-1228),
   각 목록은 `sortedFacet`(1232-1234)로 name 오름차순. `Map.of` 비결정성 제거 ✓.
   NPE 가드: requester는 `name == null ? requesterKey : name`, space는 `getSpace()`·`getSpaceKey()`·
   `getSpace().getName()` 셋 다 non-null일 때만 추가 → NPE 불가 ✓
3. **장라인** — 274열 라인 소멸. 현재 최대 **136열**, 120열 초과 8줄(HEAD는 1줄/122열). 개선됐으나 완전 정렬은 아님.

---

## 2. 중대

### [중대-1] R6가 범위를 넘어 **기존** 400을 JSON으로 바꿨다 — 요청 생성 실패 메시지가 raw JSON으로 노출

스펙 R6: *"기존 다른 엔드포인트의 400 관례가 평문이라면 **이번에 추가된 파라미터 검증 400만** JSON으로 하고
기존 것은 손대지 않는다."*

적용 위치 3곳 중 2곳은 정확하다:
- `ApprovalRestResource.java:359` `/mine` — 신규 파라미터 검증 ✓
- `ApprovalRestResource.java:383` `/mine/requested` — 신규 파라미터 검증 ✓

그런데 3곳째가 **신규 검증이 아니다**:
- `ApprovalRestResource.java:314-317` — `POST /approvals`(승인 요청 생성)의 **기존** `IllegalArgumentException` 400
```java
} catch (IllegalArgumentException e) {
    return Response.status(Response.Status.BAD_REQUEST)
            .entity(ApprovalJson.write(Map.of("error", e.getMessage())))   // HEAD: .entity(e.getMessage())
            .build();
}
```

**사용자 가시 회귀 (경계면 교차 확인):**
`resources/js/approval.js:28-34`의 `post()`는 실패 응답을 `response.text()`로 읽어 `error.body`에 담고,
`:766` `showMessage(form, (error && error.body) || '승인 요청 생성에 실패했습니다.')`가 **그 문자열을 그대로** 화면에 쓴다.
따라서 지금은 요청 생성 실패 시 사용자가 이렇게 본다:

```
{"error":"최소 승인 인원보다 승인자가 적습니다."}
```

해당되는 메시지(전부 이 catch로 떨어진다): "최소 승인 인원보다 승인자가 적습니다.",
"expiresAt은 ISO-8601 UTC 형식이어야 합니다…", "사용할 수 없는 승인 Flow입니다.",
"이전 승인 요청을 찾을 수 없습니다.", "이전 승인 요청의 대상이 현재 대상과 다릅니다.",
"승인 영역을 안전하게 읽을 수 없습니다.", "Flow의 최소 승인 인원보다 승인자가 적습니다."
→ 패널·영역 매크로의 요청 모달 전부 동일 경로.

부수 문제: 같은 엔드포인트의 `ApprovalException` 400(`:313`)은 평문 그대로라
**한 엔드포인트가 400 본문 형식을 두 가지로 섞어 반환**한다. 409 경로(`:187-189`)도 평문이며
`approval.js:757`이 `error.body.indexOf('영역이 변경')`으로 그 평문에 의존한다(현재는 무사).

**재작업 지시 (4줄):** `:314-317`을 HEAD 형태로 되돌린다.
```java
} catch (IllegalArgumentException e) {
    return Response.status(Response.Status.BAD_REQUEST).entity(e.getMessage()).build();
}
```
`/mine`·`/mine/requested`의 JSON 400은 그대로 둔다.

---

## 3. 경미

### [경미-1] `Map.of("error", e.getMessage())`는 메시지가 null인 IAE에서 400을 500으로 바꾼다
`:316`, `:359`, `:383`. `Map.of`는 null 값에 NPE를 던지고, 그 NPE는 이 catch 밖으로 나가 500이 된다.
현재 도달 경로의 IAE는 모두 메시지를 갖지만(직접 throw 또는 `UUID.fromString`/`Enum.valueOf`), 방어가 없다.
**수정:** `Map.of("error", String.valueOf(e.getMessage()))` 또는 `LinkedHashMap` 사용.

### [경미-2] AssemblyTest가 비교자 1차 키(STEP_ORDER)를 검증하지 않는다
`AssemblyTest:27`의 두 승인자는 모두 `stepOrder = 0`이라 `thenComparingInt(getID)`만 판정에 쓰인다.
비교자를 `comparingInt(getID).thenComparingInt(getStepOrder)`로 뒤집어도 이 테스트는 통과한다.
또 두 requestId가 **모두** 행을 갖는 분배 케이스가 없다(한쪽은 빈 요청).
**보강안:** stepOrder 1/2 승인자를 역순 입력해 단계 순서를 단언하는 케이스 1개, 두 요청이 각각 승인자·이벤트를
가진 혼재 케이스 1개 추가.

### [경미-3] 도메인 fail-fast 상실 (R1 부수효과 — 기록)
`ApprovalRequest.normalizeSteps`(603,621)의 예외 제거로 restore 계열이 0단계 aggregate를 조용히 만든다.
생성 경로는 방어되고 런타임 안전성도 실측 확인했으나(§R1), 향후 조립 버그가 예외 대신
"승인자 0명 요청"으로 나타난다. `features.md`에 "승인자 행이 유실된 요청은 승인 불가 상태로 복원된다"를 남길 것.

### [경미-4] 매크로가 읽기 전용인데 클러스터 락 서비스를 물고 있다
`ApprovalRegionMacro.java:54-55`가 생성자에서 `ClusterApprovalLockService.fromOsgi()`로
`ApprovalWorkflowService`를 만든다. `pageSnapshotReadOnly`는 락을 쓰지 않으므로 동작 문제는 없고
`fromOsgi()`는 실패 시 `NO_OP` 폴백이라 기동도 안전하다. 읽기 전용 렌더러가 쓰기용 협력자를 갖는 구조만 기록.

### [경미-5] `renderEmpty`의 `snapshot` 파라미터 미사용
`ApprovalRegionMacro.java:102-109` — 전달만 하고 본문에서 쓰지 않는다(빈 상태는 이력을 그리지 않음). 죽은 인자.

### [경미-6] space name이 null이면 facet에서 제외된다
`ApprovalRestResource.java:1218-1222`. NPE는 막혔으나 1차 권고(`key` 폴백)와 달리 해당 공간이
필터 후보에서 아예 빠진다. 실사용에서 Space name이 null인 경우는 드물어 기록만.

---

## 4. 회귀 스캔 (1차 PASS 항목 유지 확인)

- **파일 압축·재포매팅 없음** — 라인 수 전부 증가:
  REST 1731→1961, Repository 511→619, Macro 389→399, Panel 306→308, WorkflowService 303→310.
  `ApprovalRequest` 651→647(-4)은 **삭제된 가드 4줄과 정확히 일치**(§R1) — 압축 아님 ✓
- **원시 제어 문자 0개** (`approval-confluence9/src`, `approval-domain/src`, `README.md` 전수) ✓
- **추적 중인 테스트 파일 수정 0건** — `git status`에 `M` 표시된 test 파일 없음.
  변경된 `PageSnapshotExpiryTest`는 이번 배치 신규(`??`)이고 R3-5가 의미 변경을 명시 지시 ✓
- **게이트 우회·조건 바꿔치기 흔적 없음** — 테스트를 통과시키려 프로덕션 조건을 느슨하게 한 곳은
  `normalizeSteps` 완화 한 곳뿐이며, 이는 R1이 요구한 동작(빈 행 정상 조립)의 필요조건이고
  §R1에 영향 범위를 실측해 기록했다. 그 외 없음 ✓
- 1차 PASS 항목 유지: statusCounts·facets 기준이 `candidates`(1085-1086) ✓ /
  `total = filtered.size()`(1094) ✓ / 슬라이스만 직렬화(`requestsJson(slice)`) ✓ /
  응답 문자열 연결은 리터럴 키 + `ApprovalJson.write` + 정수뿐(이스케이프 구멍 없음) ✓ /
  `shouldRestore` 양 분기(214, 230) ✓ / regionHash `containsKey` 가드(1258-1259) ✓ /
  `findMeta`·`findApproverViaGroupsBatch` 배치화 유지 ✓ /
  알림 엔티티 `@StringLength(255)`+`@Indexed`(재작업 중 무변경) ✓
- **C10 안전**: working tree 변경 0건, `compile` SUCCESS, `package`/`install` 미실행 ✓

---

## 5. 미검증으로 남는 항목

- **기존 알림 데이터가 있는 H2 홈에서의 스키마 마이그레이션**(`LAST_ERROR` 외 3컬럼 CLOB→VARCHAR(255)).
  `package`/`install` 금지 제약으로 이번에도 실행 불가 — **7b 화면 검증에서 반드시 확인**.
- `hydrate`의 AO 쿼리 횟수(501건 → REQ/APV/EVT 각 2회) 계측. `chunks()` 단위 테스트로 분할 규칙은
  고정됐으나 실제 쿼리 횟수는 AO fake가 없어 미측정.
- 업무함(`/mine` 소비자 `ApprovalInboxServlet:788,883,890`)은 응답 shape 변경으로 여전히 깨진 상태 —
  `design-batch7.md` §2가 예고한 계획된 상태(7b에서 복구).

---

## 6. 재작업 지시 요약

1. **[중대-1]** `ApprovalRestResource.java:314-317` → `.entity(e.getMessage())`로 원복(4줄).
   `/mine`(359)·`/mine/requested`(383)의 JSON 400은 유지.
2. **[경미-1]** 같은 3곳의 `Map.of("error", …)`에 null 메시지 방어(`String.valueOf`).
3. **[경미-2]** AssemblyTest에 stepOrder 1/2 정렬 케이스 + 두 요청 모두 행 보유 케이스 추가.
4. **[경미-3]** `features.md`에 "승인자 행 유실 요청은 승인 불가 상태로 복원" 명시.
5. **[경미-4/5/6]** 매크로 락 서비스 의존·`renderEmpty` 죽은 인자·space name 폴백 — 여력 시.
