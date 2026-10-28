# QA 5a — 재승인 백엔드 (버전 기록 모델)

- 기준 커밋: `82e5ce8` (미커밋 워킹트리 검증)
- 스펙: `_workspace/spec-5a-reapproval-backend.md` / 설계: `_workspace/design-reapproval.md` §1·§2
- 검증자: approval-qa (독립 검증). Codex 보고는 참조하지 않고 diff·빌드·동작 추론으로 판정.

## 판정: **FAIL** (재작업 필요)

발견 12건 — 치명 1 / 중 3 / 경 6 / 정보 2.

치명은 **빌드 red**(도메인 테스트 1건이 옛 의미를 그대로 단언)이고,
중 3건은 모두 **`fromRequestId` 결재선 복원 경로의 의미 왜곡**이다.
도메인 만료 축소 자체(§1)와 저장 계층(§2.1)은 설계대로 정확하다.

---

## 0. 검증 방법

1. `git status` / `git diff`로 허용 파일 범위·압축·재포매팅 확인.
2. 도메인 전이표를 코드 경로별로 추적하고 테스트 커버리지와 대조.
3. `fromRequestId` 복원을 **저장 계층이 실제로 만들어 내는 데이터 형태**(`ApprovalApproverEntity.STEP_ORDER`,
   `VIA_GROUP`)에서 역산해, 스펙이 전제한 "한 단계 = 단일 그룹 또는 단일 사용자"가 성립하는지 검증.
4. `mvn -B -pl approval-confluence9 -am test` (toolchain: JDK 21 + Maven 3.9.16, `scripts/build.ps1` 경로).

## 1. 파일 범위 / 압축·재포매팅

허용 파일 외 변경 **0건**. 리스너·스케줄러·알림 리졸버 **미수정 확인**.

```
M approval-domain/.../ApprovalRequest.java                       596 → 593 줄
M approval-domain/.../ExpiryReasonTest.java                      104 → 132 줄
M approval-confluence9/.../storage/ApprovalEntity.java            94 →  99 줄
M approval-confluence9/.../storage/ActiveObjects...Repository.java 471 → 510 줄
M approval-confluence9/.../rest/ApprovalRestResource.java       1449 → 1537 줄
```

- 압축·한 줄 합치기 **없음**. 최장 라인 122자(200자 기준 이하). `git diff --check` 통과.
- 지시 외 문구 변경: 없음(주석 변경은 스펙 §1이 지시한 "과거 데이터 전용" 명시 범위 내).
- 죽은 코드: `canExpire()` 삭제됨 ✓. `pageTitle(long)`은 다른 2곳(`:588`, `:610`)에서 계속 사용되므로 잔존 정상.

## 2. 빌드 결과

| 모듈 | 결과 |
|---|---|
| approval-domain | **FAIL** — Tests run 46, Failures 1 |
| approval-confluence9 | main/test 컴파일 OK, Tests run 48, Failures 0 |

```
[ERROR] ApprovalRequestTest.승인된_요청도_페이지가_편집되면_만료된다:146 expected: <true> but was: <false>
```

`verify`(패키징·descriptor 검증)는 테스트 실패로 미실행 — **패키징 미검증**.
C9 인스턴스 잠금 문제는 없었고 `clean` 없이도 재현된다.

## 3. 불변식 재확인 — 만료 축소 × dedupeKey

`dedupeKey(request)` = `PENDING`이면 `"open:"+scopeKey(target)`, 그 외 `"closed:"+id`
(`ActiveObjectsApprovalRequestRepository.java:395`).

| 경로 | 축소 전 | 축소 후 | 판정 |
|---|---|---|---|
| dedupe 유니크 | APPROVED는 이미 `closed:{id}` | 동일 | 영향 없음 ✓ |
| APPROVED→EXPIRED 전이 | 둘 다 `closed:{id}` (키 불변) | 전이 자체가 사라짐 | 영향 없음 ✓ |
| `findOpenRequest` | PENDING만 open 판정 | 동일 | APPROVED가 영구 유지돼도 **새 요청 생성 가능** ✓ |
| `findOpenRequest`의 lazy expire | APPROVED도 `isDueForExpiry` 대상 | PENDING만 | 불필요한 lock 진입 감소, 의미 변화 없음 ✓ |
| `nextRevision` | 상태 무관 `max(revision)+1` | 동일 | 재승인 요청 revision 증가 ✓ |
| `findLatestPageRequest` | 마감 지난 APPROVED를 EXPIRED로 정리 | APPROVED 유지 | **의도된 변화**, 단 5b UI 전까지 표시 후퇴(F-12) |
| `expireDueAll`(스케줄러) | APPROVED도 만료 | PENDING만 | 리스너·스케줄러 무수정으로 새 의미 획득 ✓ |

결론: **만료 축소는 dedupeKey 불변식과 충돌하지 않는다.** "열린 요청은 대상당 하나"는 PENDING 정의에만
의존하고, APPROVED는 축소 전에도 이미 `closed:` 쪽이었다.

## 4. 도메인 전이표 판정

| 전이 | 구현 | 테스트 | 판정 |
|---|---|---|---|
| PENDING + 편집(version↑) → EXPIRED(`CONTENT_VERSION`) | `ApprovalRequest.java:266` | ExpiryReasonTest:32, ApprovalRequestTest:115 | ✓ |
| PENDING + 같은 version → 불변 | `:266` 앞 조건 | ApprovalRequestTest:151 | ✓ |
| PENDING + 마감 경과 → EXPIRED(`DEADLINE`) | `:291` | ExpiryReasonTest:60, ApprovalRequestTest:161 | ✓ |
| APPROVED + 편집 → 불변(false 반환) | `:266` | ExpiryReasonTest:45 | **구현 ✓ / 테스트 모순**(F-1, F-5) |
| APPROVED + 마감 경과 → 불변 | `:286`,`:291` | ExpiryReasonTest:108 | ✓ |
| REJECTED + 편집/마감 → 불변 | `status != PENDING` | 없음 | 구현 ✓ / **커버리지 공백**(F-7) |
| EXPIRED + 편집/마감 → 불변(재만료 없음) | `status != PENDING` | 없음 | 구현 ✓ / **커버리지 공백**(F-7) |
| 과거 `CONTENT_VERSION_AFTER_APPROVAL` 복원 → `requiresReapproval()==true` | `:411` | ExpiryReasonTest:120 | ✓ 하위 호환 확보 |

`EXPIRED_BY_EDIT_AFTER_APPROVAL` 신규 생성 경로는 **전 코드베이스에서 소멸**했다
(생성처는 `expireForContentVersion` 한 곳뿐이었고 그 분기가 제거됨).
소비처(`ApprovalMarkup:279`, `EmailNotificationMessage:60/93`, `ApprovalInboxServlet:314/325/448`)는
과거 행 표시용으로 그대로 살아 있다 ✓.

## 5. 알림·리스너·스케줄러

- `NotificationRecipientResolver` **미수정** ✓. `EXPIRED` + `reason.startsWith("CONTENT_VERSION")`으로
  승인자까지 알리는 규칙은 그대로이며, 이제 그 reason은 `CONTENT_VERSION`(PENDING 편집)만 도달한다.
  `AFTER_APPROVAL` 알림은 **새로 만들어질 수 없다** ✓ (설계 §2.4 일치).
- `ApprovalPageUpdateListener:64` 무수정 ✓ — `expireForPageVersion`이 실제로 만료된 요청만 반환하므로
  APPROVED 요청에 대한 알림도 자동으로 사라진다.
- `ExpirySweepScheduler:118` 무수정 ✓ — `expireDueAll`이 `isDueForExpiry`로 거른다.

---

## 발견 항목

### F-1 (치명) 도메인 테스트가 옛 의미를 단언한 채 남아 빌드가 깨진다

`approval-domain/src/test/java/kr/dmove/confluence/approval/domain/ApprovalRequestTest.java:139-148`

```java
void 승인된_요청도_페이지가_편집되면_만료된다() {
    ...
    boolean changed = request.expireForContentVersion(8, NOW.plusSeconds(2));
    assertTrue(changed);                                   // ← 새 모델에서 false
    assertEquals(ApprovalStatus.EXPIRED, request.status()); // ← 새 모델에서 APPROVED
}
```

스펙 §2는 "승인 후 편집 → EXPIRED" 시나리오를 **모두** 재작성하라고 지시했는데 `ExpiryReasonTest`만
손봤다. 스펙 "완료 기준 — 자가 검증·보고"가 수행되지 않았다는 증거이기도 하다.

**재작업**: 이 테스트를 `승인된_요청은_페이지가_편집돼도_유지된다`로 이름·본문 모두 재작성
(`assertFalse(changed)` + `assertEquals(APPROVED, status())`). 삭제하지 말 것 — 전이표의 핵심 칸이다.

### F-2 (중) `requestStepSpec`의 "한 단계 = 단일 그룹 또는 단일 사용자" 전제가 실제 데이터에서 깨진다

`ApprovalRestResource.java:1349`(`isLegacyMinimum`), `:1357`(`requestStepSpec`)

저장 계층은 **`steps().size()==1 && requiredApprovals>1`일 때만** `STEP_ORDER=0`을 쓴다
(`ActiveObjectsApprovalRequestRepository.java:499`). 그런데 REST의 새 `isLegacyMinimum`은
`STEP_ORDER <= 0`으로 판정한다. 두 판정이 어긋나는 구멍이 있다:

**"단일 단계 · 승인자 여러 명 · 최소 승인 1명" 요청** — `create()`의 `minimumApprovals` 경로
(단계 순서 없는 legacy Flow 적용 시 `flowApprovers(flow)` + `flow.getMinimumApprovals()==1`,
또는 REST `approverKeys` 직접 호출)로 지금도 생성 가능하다. 이 요청은
`requiredApprovals==1`이라 `STEP_ORDER=1`로 저장되고 → REST `isLegacyMinimum`=false →
단계 복원 경로로 들어간다. 그 결과:

- 사용자 3명 단일 단계(1명만 승인하면 통과) → `user:a;user:b;user:c` →
  **순차 3단계 전원 승인**으로 의미가 뒤집힌다.
- 직접 지정 사용자 + 그룹 구성원이 한 단계에 섞인 경우(legacy Flow의 USER+GROUP, 최소 1명) →
  `findFirst` 한 개만 채택해 `group:G` 하나만 남고 **직접 지정 승인자가 조용히 사라진다**.

**재작업**:
1. 단계별로 판정한다 — `step.approverKeys().size()==1`이면 `user:` 토큰,
   그 외에는 **그 단계의 모든 키가 같은 non-null viaGroup을 가질 때만** `group:` 토큰.
2. 두 조건 어디에도 해당하지 않는 단계(혼합·다인 비그룹 단계)가 하나라도 있으면,
   단계 복원을 포기하고 **최소 인원 재사용 경로**(승인자 집합 + `minimumApprovals`)로 폴백한다.
3. legacy 판정은 REST에서 AO(`ApprovalApproverEntity`)를 직접 뒤지지 말고
   repository에 노출한다(예: `repository.hasLegacyApproverRows(UUID)`). 현재 구현은
   저장 계층 private 규칙(`:499`)을 REST가 다른 기준으로 재구현한 상태다.

### F-3 (중) 같은 사용자가 그룹 단계와 개인 단계에 함께 있으면 viaGroup이 오염돼 결재선이 확대된다

`repository.findApproverViaGroups`는 **actorKey 하나당 그룹명 하나**로 접는다
(`ActiveObjectsApprovalRequestRepository.java:344`). 쓰기 쪽도 마찬가지로
`resolveStepSpec`의 `putIfAbsent`(먼저 만난 단계가 이김) 결과를 모든 행에 같은 값으로 쓴다.

시나리오 — `group:leads;user:alice` (alice ∈ leads):
저장 시 alice.VIA_GROUP = `leads` → `requestStepSpec` 2단계에서 `viaGroups.get("alice") != null` →
`group:leads` 발행 → 복원 결과 `group:leads;group:leads`. **개인 결재 단계가 그룹 전체 단계로 확대된다.**
(반대 순서 `user:alice;group:leads`는 우연히 정상 복원된다 — 순서 의존 버그.)

`ApprovalApproverEntity`는 `STEP_ORDER`와 `VIA_GROUP`을 행 단위로 갖고 있으므로 데이터는 이미 충분하다.

**재작업**: 최소 조치는 F-2의 1)(단일 키 단계는 무조건 `user:`)로 이 시나리오가 막힌다.
근본 조치는 단계별 viaGroup 조회
(`Map<Integer, Map<String,String>> findApproverViaGroupsByStep(UUID)`)를 추가해
`requestStepSpec`이 단계별 값을 보게 하는 것이다. 최소 조치만 택할 경우 그 이유를 주석으로 남길 것.

### F-4 (중) 비활성화된 등록 그룹이 400으로 걸리지 않는다

`ensureReusableGroupsAvailable`(`:1377`)은 `groupApproverResolver.resolveDirectRequest`에 의존하는데,
그 `Directory.groupExists`는 `userAccessor.getGroup(name) != null`(`:1506`)만 본다.
따라서 잡히는 것은 **Confluence 그룹 삭제**와 **활성 구성원 0명**뿐이고,
관리자가 `ApprovalGroupEntity.enabled=false`로 내린 그룹은 그대로 재확장된다.
설계 §2.3은 "삭제·**비활성화**됐으면 400"을 명시했고, `/groups` 검색은 `isEnabled`로 거르므로
**재승인 경로만 비활성 그룹을 되살리는 우회로**가 된다.

**재작업**: `ensureReusableGroupsAvailable`에 `registeredGroup(name).map(ApprovalGroupEntity::isEnabled).orElse(false)`
검사를 추가하고, 실패 시 같은 안내 문구로 400.

### F-5 (경) 테스트 이름이 검증 내용과 반대·무의미해졌다

- `ExpiryReasonTest:45` `승인_완료_후_편집은_재승인_필요로_기록된다` → 본문은 "APPROVED 유지"를 단언한다.
  `승인_완료_후_편집은_상태를_바꾸지_않는다`로 개명.
- `ExpiryReasonTest:73` `승인이_난_content_version을_만료된_뒤에도_알려준다` → `expireForContentVersion`이
  더 이상 아무 일도 하지 않으므로 "만료된 뒤에도"가 거짓. 편집 호출 후에도 `approvedContentVersion`이
  유지된다는 취지로 개명하거나, 과거 데이터 restore 시나리오로 재작성.

### F-6 (경) 새 테스트 2건만 영문 camelCase — 파일 컨벤션 불일치

`approvedRequestRemainsApprovedAfterDeadline`, `restoredLegacyExpiredAfterApprovalStillRequiresReapproval`.
같은 파일의 나머지 테스트는 모두 한국어 밑줄 명명이다. 한국어 이름으로 통일.

### F-7 (경) 전이표 커버리지 공백 — REJECTED/EXPIRED 불변

`status != PENDING` 한 줄이 REJECTED·EXPIRED까지 함께 막지만, 그 사실을 고정하는 테스트가 없다.
`reject` 후 `expireForContentVersion`/`expireIfDue`가 false이고 상태가 그대로인 테스트 1건,
이미 EXPIRED인 요청의 재만료가 false인 테스트 1건 추가 권장.

### F-8 (경) `findPrevRequestIds`가 `findFlowIds`의 IN 배치 로직을 통째로 복제

`ActiveObjectsApprovalRequestRepository.java:277`과 `:305`가 인덱스 변수명만 다른 25줄 중복이다
(스펙은 "findFlowIds 패턴 재사용"이라고 했다). 배치 루프를
`private Map<UUID,String> findColumn(Collection<UUID>, Function<ApprovalEntity,String>)`로 뽑고
두 메서드가 그것을 호출하도록 정리.

### F-9 (경) import 정렬이 깨졌다

`ApprovalRestResource.java:24` — `ApprovalApproverEntity`가 `ApprovalGroupEntity` **뒤에** 삽입됐다.
같은 블록의 나머지는 알파벳 순이다. `ApprovalFlowEntity` 위로 이동.

### F-10 (경) 삭제된 페이지는 여전히 요청마다 `getPage`를 친다

`ApprovalRestResource.java:963` — `HashMap.computeIfAbsent`는 매퍼가 null을 돌려주면 **매핑을 저장하지 않는다.**
페이지가 삭제된 대상의 요청이 목록에 여럿 있으면 그 수만큼 `pageManager.getPage`가 반복된다.
"페이지별 1회"를 보장하려면 `containsKey` 검사 후 `put`으로 바꿀 것.
(정상 페이지에 대해서는 캐시가 동작하며, 기존 `pageTitle()` per-request 조회 대비 개선이다 ✓.)

### F-11 (정보) `fromRequestId` + `approverKeys` 조합에서 클라이언트 값이 조용히 무시된다

`:203`의 폴백 조건은 `blank(steps)`만 본다. legacy 이전 요청 + `approverKeys` 전달 시
`approverKeys`가 버려지고 이전 승인자 집합이 쓰인다. 현 UI는 `steps`만 보내므로 실사용 영향은 없으나,
스펙의 우선순위 규칙에 `approverKeys/approverGroups`도 포함시키거나 두 값 동시 전달을 400으로 막는 편이 안전하다.

### F-12 (정보) 5a 단독으로는 화면이 후퇴한다 — 5b와 함께 배포할 것

승인 후 편집해도 요청이 APPROVED로 남고 `findLatestPageRequest`가 그것을 계속 최신으로 돌려주므로,
패널·매크로·업무함은 **"승인 완료"만 표시**한다(기존에는 "재승인 필요" 안내가 떴다).
`stale`/`previousRequestId`는 REST 응답에만 실렸고 소비처가 아직 없다.
5a만 커밋하는 것은 무방하나 **배포는 5b(UI)와 묶어야 한다.**

---

## 6. 스펙 항목 1:1 대조

| 스펙 항목 | 구현 | 판정 |
|---|---|---|
| §1 `expireForContentVersion` PENDING 전용 | `ApprovalRequest.java:266` | ✓ |
| §1 `wasApproved` 분기·AFTER_APPROVAL 생성 제거 | 제거됨 | ✓ |
| §1 상수·`requiresReapproval()`·`expiredByEdit()` 유지 + 주석 명시 | `:35`,`:403`,`:409` | ✓ |
| §1 `expireIfDue`/`isDueForExpiry` PENDING 전용, `canExpire()` 인라인 | `:286`,`:291`, 메서드 삭제 | ✓ |
| §1 클래스 Javadoc 갱신 | `:24-26` 버전 기록 모델 서술 추가 | ✓ |
| §2 AFTER_APPROVAL 시나리오 재작성 | ExpiryReasonTest만 수정 | **✗ F-1** |
| §2 마감 경과 APPROVED 유지 테스트 | ExpiryReasonTest:108 | ✓ |
| §2 PENDING 편집/마감 시나리오 유지 | 유지·통과 | ✓ |
| §2 restore 하위 호환 테스트 1건 | ExpiryReasonTest:120 | ✓ |
| §3 `ApprovalEntity.getPrevRequestId/set` | `:95-99`, `@StringLength(64)` | ✓ (UUID 36자, 여유 충분) |
| §3 `savePrevRequestId` | Repository `:260`, `saveFlowId`와 동일 패턴 | ✓ |
| §3 `findPrevRequestIds` IN 배치 | Repository `:305` | ✓ 기능 / F-8 중복 |
| §4 `@QueryParam("fromRequestId")` | `:151`, 필수 파라미터 검사에도 포함 | ✓ |
| §4 viaGroup 기반 단계 복원 | `:1357` | **✗ F-2, F-3** |
| §4 복원 문자열이 `resolveStepSpec`을 거쳐 재확장 | `:194` 동일 경로 | ✓ |
| §4 그룹 소멸 시 400 + 지정 문구 | `:1385` 문구 일치 | 부분 ✓ / **F-4(비활성)** |
| §4 legacy 요청 폴백(집합 + minimumApprovals) | `:203-208` | 로직 ✓ / 진입 판정 **F-2** |
| §4 steps 동시 전달 시 steps 우선 + 연결은 저장 | `:189`, `:268` | ✓ |
| §4 이전 요청 없음/대상 불일치 400 | `:184`, `:186`(`sameTargetScope`는 contentVersion 제외) | ✓ |
| §4 `savePrevRequestId` 호출 위치 | inTargetLock **내부**, 생성 성공 후, `saveFlowId` 옆 | ✓ |
| §4 응답 `previousRequestId` (일괄 조회) | `:1023`, `requestsJson`에서 IN 배치 | ✓ |
| §5 `stale` 서버 계산 | `:1024` `APPROVED && page.version > approvedContentVersion` | ✓ |
| §5 페이지별 1회 조회 | `:961-964` pageId 단위 캐시 | ✓ / F-10(삭제 페이지) |
| §5 페이지 없으면 false | `page != null` 가드 | ✓ |
| 완료 기준: `git diff --check` | 통과 | ✓ |
| 완료 기준: 자가 검증·보고 | 도메인 테스트 red 상태로 보고됨 | **✗** |

`requestJson(단건)`이 `requestsJson`을 재사용하므로 `POST`/`GET /{id}`/승인·반려 응답에도
`previousRequestId`·`stale`이 함께 실린다 ✓. `pageTitle` 필드는 `page == null ? null : getTitle()`로
기존 `pageTitle(long)`과 의미가 동일해 JS 경계면(`ApprovalInboxServlet:466` `r.pageTitle || "페이지 #"+r.pageId`)에
영향 없음 ✓.

---

## 7. 재작업 지시 (우선순위)

1. **F-1** `ApprovalRequestTest:139` 재작성 → `mvn -B -pl approval-confluence9 -am test` green 확인 후 보고.
2. **F-2 + F-3** `requestStepSpec` 단계별 판정으로 교체 + 혼합/다인 비그룹 단계는 최소 인원 폴백,
   legacy 판정을 repository로 이동. 다음 3개 시나리오의 복원 결과를 테스트로 고정:
   - 단일 단계 3명 · 최소 1명 → 단계 문자열 복원 대신 집합+최소인원 재사용
   - `group:leads;user:alice` (alice ∈ leads) → `group:leads;user:alice`
   - `user:a;group:G;user:b` → 그대로
3. **F-4** 비활성 등록 그룹 400 추가.
4. **F-5 · F-6 · F-7** 테스트 이름·커버리지 정리.
5. **F-8 · F-9 · F-10** 정리성 수정.
6. F-11 · F-12는 스펙/릴리스 노트 반영 사항(코드 변경 선택).

재검증 시 `mvn -B -pl approval-confluence9 -am test` **전부 green**과
`_workspace/qa-5a.md`의 F-2 시나리오 3건 테스트 존재를 확인한다.
