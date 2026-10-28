# QA 5a-4 — 재승인 백엔드 4차(최종) 검증

- 기준 커밋: `82e5ce8` (미커밋 워킹트리)
- 이전: 1차 `qa-5a.md` (FAIL 12) / 2차 `qa-5ar.md` (FAIL 6) / 3차 `qa-5a3.md` (FAIL — N-5 회귀)
- 4차 재작업 수행자: 메인 Claude(직접). QA 3차 권장(§10.1 "평탄 저장으로 환원")대로 단계별 맵 기계 전면 제거.
- 검증자: approval-qa. 보고를 참조하지 않고 grep·코드 추적·**실행 probe**·빌드로 판정.
- 빌드 로그: `_workspace/mvn-5a4.log`

## 판정: **PASS**

3차의 유일한 blocker였던 **N-5가 원인 채로 소멸**했다. 단계 번호 이중 체계가 사라졌으므로
"밀림" 자체가 표현 불가능해졌다 — 증상을 막은 게 아니라 진입점을 없앴다.
3차 §11 재검증 조건 4개 **전부 충족**(2·3·4는 실행으로 확인).
신규 회귀 **0건**. 잔여는 기록용 경미 2건뿐이며 배포를 막지 않는다.

---

## 0. 검증 방법

1. `grep`으로 단계별 맵 심볼 전수 조사(저장소·REST·테스트).
2. 평탄 맵 first-wins 불변식을 `resolveStepSpec`·`toSteps`·`restoreSteps` 세 지점에서 **정형 대조**.
3. **실행 검증** — 임시 probe 테스트(`QaProbe5a4Test`)를 c9 테스트 소스에 넣어
   `resolveStepSpec → createSequential → saveApproverViaGroups가 만들 (step, actor, viaGroup, required)`를
   8개 시나리오 × 최대 3세대까지 출력시켰다. 검증 후 **삭제 완료**(`git status` 재확인 — 워킹트리 무변경).
4. `mvn -B -pl approval-confluence9 -am test` 직접 실행 (JDK 21 + Maven 3.9.16).
5. NUL 바이트 `perl` 직접 계수, 최장 라인 계수, `git diff --check`, 고아 import 스캔.

---

## 1. N-5 소멸 — 검증 1

단계별 맵 심볼을 저장소 전체에서 전수 검색했다.

```
viaGroupsByStep | ViaGroupsByStep | saveApproverViaGroupsByStep | findApproverViaGroupsByStep
→ No matches found   (approval-domain, approval-confluence9, approval-confluence10, docs, scripts 포함 전체)
```

**진입점이 사라졌다.** 남은 것은 평탄 API 한 쌍뿐이다.

| API | 위치 | 키 |
|---|---|---|
| `saveApproverViaGroups(UUID, Map<String,String>)` | `ActiveObjectsApprovalRequestRepository:317` | `actorKey` |
| `findApproverViaGroups(UUID)` | `:329` | `actorKey` |

호출부도 평탄 경로 하나로 수렴했다 — `ApprovalRestResource:276-278`이 생성 직후 **한 번만** 호출하고,
`restoredSteps == null ? approverResult.viaGroups() : restoredSteps.viaGroups()` 삼항으로
직접지정·Flow·복원 세 경로가 같은 평탄 맵 타입을 넘긴다.

`ApprovalRestResource:1324-1328`의 `StepResolution` record도 `Map<String,String> viaGroups` 단일 필드로 환원됐고,
`:1321-1322` 주석이 그 근거(도메인 dedup → 한 사람 한 단계 → 평탄 맵 비모호)를 명시한다.

**3차 N-5의 세 가지 실피해가 전부 소멸**한 것을 §3에서 실행으로 확인했다.

---

## 2. 평탄 맵 정확성 — 검증 2

### 2.1 불변식의 정형 진술

> 임의의 토큰 열에 대해, `viaGroups[a]`는 **a를 처음 언급한 토큰**의 출처와 같아야 하고,
> 도메인이 a를 배치하는 단계도 **a를 처음 언급한 토큰**의 단계여야 한다.

두 "처음"이 같은 토큰을 가리켜야 출처가 실제 소속 단계를 가리킨다. 세 지점 모두 first-wins인지 확인했다.

| 지점 | 코드 | 의미론 |
|---|---|---|
| `resolveStepSpec` 그룹 분기 | `:1380` `if (!viaGroups.containsKey(k)) viaGroups.put(k, v)` | first-wins |
| `resolveStepSpec` 개인 분기 | `:1387` `if (!viaGroups.containsKey(k)) viaGroups.put(k, null)` | first-wins |
| 도메인 `toSteps` | `ApprovalRequest:519` `if (seen.add(normalized)) stepKeys.add(...)` | first-wins |
| `restoreSteps` 스냅샷 분기 | `:1421` `if (!restoredViaGroups.containsKey(k)) ... put(k, previousViaGroups.get(k))` | first-wins |
| `restoreSteps` 그룹 분기 | `:1439` `if (!restoredViaGroups.containsKey(k)) ... put(k, v)` | first-wins |

또한 `resolveStepSpec`은 토큰마다 `steps.add(...)`를 **무조건** 실행하므로
`steps`의 인덱스 = 토큰 인덱스이고, `toSteps`는 그 리스트를 **같은 순서로** 순회한다.
두 first-wins가 같은 열거를 보므로 **가리키는 토큰이 항상 일치**한다. 3차 N-5의 번호 밀림은
`steps` 인덱스와 `ApprovalStep.order()`를 대응시켰기 때문인데, 평탄 맵은 그 대응을 **아예 요구하지 않는다.**

### 2.2 `containsKey` 가드가 필수인 이유 (putIfAbsent 함정)

개인 지정의 출처는 `null`이다. `putIfAbsent`는 **null 값을 부재로 취급**하므로
`user:alice;group:leads`에서 토큰1이 넣은 `alice→null`을 토큰2의 `alice→leads`가 **덮어쓴다.**
그러면 도메인은 alice를 1단계(개인)에 두는데 출처는 `leads`라고 말하는 **모순**이 생기고,
복원 시 `groupForWholeStep([alice], {alice:leads})`가 `"leads"`를 반환해
개인 단계가 그룹으로 **잘못 확장**된다. `containsKey` 가드가 이 경로를 막는다. `:1372` 주석이 이유를 적어 뒀다.

`restoreSteps`도 같은 이유로 `containsKey`가 필요하다 — 스냅샷 분기가 넣는 값이 `null`일 수 있고
(`:1422` `previousViaGroups.get(approverKey)`), 뒤따르는 그룹 분기가 그 사람을 재확장 목록에 포함할 수 있다.
**두 분기 모두 `containsKey`를 쓴다** ✓ (실행 확인: §3 시나리오 A·H).

### 2.3 `StepRestorationTest` 5번째 테스트가 이 불변식을 고정하는가 — **그렇다**

`StepRestorationTest:57-85` `그룹_출처는_앞_단계가_이긴다`가 **양쪽 순서를 모두** 단언한다.

```java
// 그룹이 앞
groupFirst = resolveStepSpec(parse("group:leads;user:alice"), resolver);
assertEquals("leads", groupFirst.viaGroups().get("alice"));   // ← 3차에 없던 단언
assertEquals("leads", groupFirst.viaGroups().get("bob"));
// 개인이 앞
userFirst = resolveStepSpec(parse("user:alice;group:leads"), resolver);
assertNull(userFirst.viaGroups().get("alice"));               // ← putIfAbsent면 "leads"가 되어 실패
assertEquals("leads", userFirst.viaGroups().get("bob"));
```

`containsKey`를 `putIfAbsent`로 되돌리면 `userFirst` 단언이 **실제로 깨진다.** 진짜 회귀 테스트다.
3차의 `viaGroupsByStep[1]`·`[2]` 단언이 이 두 줄로 대체됐고, 덮는 범위는 오히려 넓어졌다
(3차 테스트는 그룹-우선 순서만 봤다). `groupForWholeStep` 4건(전부 null / 전부 동일 그룹 / 단일 개인 / 혼합)은 유지 — c9 5건.

---

## 3. 종단 추적 — 검증 3 (실행)

3차와 동일하게 임시 probe로 **실제 코드를 돌렸다.** `restoreSteps`의 루프를 그대로 재현하고
(AO 조회만 fake로 대체), `saveApproverViaGroups`의 `viaGroups.get(actorKey)` 조회를 그대로 흉내 냈다.

### 3.1 지시받은 시나리오 — `user:alice;group:leads`, leads={alice,bob}

```
resolve   steps=[[alice], [alice, bob]]  req=[1, 1]  via={alice=null, bob=leads}
GEN1 rows (1,alice)=null req=1 | (2,bob)=leads req=1
restore   steps=[[alice], [alice, bob]]  req=[1, 1]  via={alice=null, bob=leads}
GEN2 rows (1,alice)=null req=1 | (2,bob)=leads req=1
GEN3 rows (1,alice)=null req=1 | (2,bob)=leads req=1
```

지시문의 예측과 **정확히 일치**한다. 판단:

- **저장 rows가 타당하다.** alice는 1단계에 살아남았고 그를 넣은 것은 개인 지정이므로 출처 `null`이 맞다.
  bob은 2단계에 살아남았고 그를 넣은 것은 `leads`이므로 `leads`가 맞다. **출처가 실제 소속 단계를 가리킨다** ✓
- **복원 결재선이 타당하다.** 2단계는 `groupForWholeStep([bob], flat) = "leads"` → 재확장 `[alice,bob]` →
  도메인 dedup → `[bob]`. 겉보기엔 제자리지만 **의미가 다르다**: 이제 leads의 **현재** 구성원을 다시 읽는다.
  구성원이 바뀌면 결과도 바뀐다(§3.3 H). 3차 N-5에서는 출처가 null이라 이 재확장이 아예 일어나지 않았다.
- **GEN2 = GEN3 — 고정점이다.** 재승인을 반복해도 결재선과 출처가 표류하지 않는다.
  8개 시나리오 전부에서 GEN2 이후 안정을 확인했다.

### 3.2 전원승인(requireAll) 그룹의 required 캡

같은 스펙에서 `leads.requireAll = true`:

```
resolve   steps=[[alice], [alice, bob]]  req=[1, 2]     ← 2단계 요구 2명
GEN1 rows (1,alice)=null req=1 | (2,bob)=leads req=1    ← 캡 적용
GEN2/GEN3 동일
```

`ApprovalRequest.requiredFor`(`:536-545`)의 `Math.min(value, stepKeys.size())`가 걸린다.
dedup으로 2단계가 `[bob]` 1명이 됐으므로 요구 인원도 1로 낮춰진다.
**캡이 없었다면 요구 2 > 승인자 1로 영원히 통과 불가능한 단계가 만들어졌을 것이다.** 캡은 HEAD 기존 코드로
이번 배치 미변경이며, 복원 경로에서도 정상 작동함을 실행으로 확인했다.
의미상으로도 온전하다 — alice(1단계) + bob(2단계) = leads 전원이 실제로 승인한다.

그룹이 앞인 `group:leads;user:alice` + requireAll에서는 `(1,alice)=leads req=2`, `(1,bob)=leads req=2`로
전원 조건이 **보존**되고, 복원도 `req=2`를 그대로 재생산한다 ✓

### 3.3 나머지 시나리오 (전부 실행)

| # | 스펙 | GEN1 저장 rows | 복원(GEN2) | 판정 |
|---|---|---|---|---|
| B | `group:leads;user:alice` | (1,alice)=leads, (1,bob)=leads | 동일 | ✓ 고정점 |
| **C** | **`group:leads;user:alice;group:devs`** | (1,alice)=leads, (1,bob)=leads, **(2,carol)=devs, (2,dave)=devs** | 동일 | ✓ **N-5 원 시나리오 해소** |
| D | `group:leads;group:devs` | (1,·)=leads ×2, (2,·)=devs ×2 | 동일 | ✓ |
| E | `user:carol;group:leads` | (1,carol)=null, (2,alice)=leads, (2,bob)=leads | 동일 | ✓ |
| H | `group:leads;user:carol`, 이후 leads: bob 탈퇴·erin 가입 | (1,alice)=leads, (1,bob)=leads, (2,carol)=null | **(1,alice)=leads, (1,erin)=leads, (2,carol)=null** | ✓ 재확장 실동작 |

**C가 3차 §11.2 재검증 조건 그 자체**다. 요구된 `(1,alice)=leads, (1,bob)=leads, (2,carol)=devs, (2,dave)=devs`가
실행으로 재현됐다. 3차에서는 `(2,carol)=null, (2,dave)=null`이었다.

**H는 재승인의 존재 이유를 보여 준다.** 탈퇴한 bob이 빠지고 신규 erin이 들어오며, 개인 단계 carol은
출처 `null`이라 스냅샷으로 보존된다. 그룹 단계는 갱신하고 개인 단계는 고정하는 설계 의도 그대로다.

### 3.4 3차 §11 재검증 조건 4개 종합

| # | 조건 | 판정 | 근거 |
|---|---|---|---|
| 1 | mvn green + N-5 회귀 테스트 포함 | **PASS** | 빌드 §4. 회귀 테스트는 `StepRestorationTest` 5번째가 담당(§2.3) — 지시한 행 단위 대신 **불변식 원인 지점**을 고정하는 형태로, 단계 번호 체계가 없어졌으므로 행 단위 단언은 목적을 잃었다 |
| 2 | C 시나리오 저장 행 — **실행 확인** | **PASS** | §3.3 C. 4개 행 전부 일치 |
| 3 | devs 단계 그룹 재확장 + 비활성이면 400 | **PASS** | 재확장 실행 확인(§3.3 C·H). 비활성 400은 `(2,carol)=devs`가 복구된 결과 `groupForWholeStep`이 `"devs"`를 반환 → `restoreSteps:1427-1429` `registeredGroup(g).filter(isEnabled).orElseThrow(unavailableGroup)` 진입 → `IllegalArgumentException` → `:289-290` catch → **400**. 3차에는 출처가 null이라 이 가드를 통째로 우회했다 |
| 4 | 응답 JSON `viaGroup`이 carol·dave에 `devs` | **PASS** | `:1054` 평탄 `findApproverViaGroups` → `:1066`(decisions) `:1086`(steps[].approvers) 두 곳 모두 주입. 행 값이 `devs`이므로 배지 복구 |

---

## 4. 빌드 — 검증 4

`mvn -B -pl approval-confluence9 -am test` 직접 실행:

```
ApprovalRequestTest              21
ConcurrentApprovalTest            3
ExpiryReasonTest                 10
SequentialApprovalTest           14
approval-domain      Tests run: 48, Failures: 0, Errors: 0, Skipped: 0

ApprovalRegionMacroSettingsCacheTest  1     ApprovalStepSpecTest        6
ApprovalRegionSupportTest             6     GroupApproverResolverTest   4
ApprovalNotificationTest             13     StepRestorationTest         5
ApprovalJsonDueSoonTest               5     ApprovalInboxServletRenderTest 6
ApprovalJsonTest                      4     ApprovalSettingsTest        2
ApprovalRestResourceSettingsTest      1
approval-confluence9 Tests run: 53, Failures: 0, Errors: 0, Skipped: 0

BUILD SUCCESS
```

**도메인 48 + c9 53 = 지시 기준 정확히 일치.** 3차 대비 테스트 수 변동 없음(단계별 단언 → 양방향 순서 단언으로
5번째 테스트의 **내용만** 교체). 회귀 스팟 체크: 도메인 만료 전이표 관련 `ExpiryReasonTest` 10건 ·
`SequentialApprovalTest` 14건 전부 green — 1차 PASS 구간 **회귀 없음**.

---

## 5. 파일 범위 / NUL / 압축 — 검증 5

변경 6개 + 신규 1개 — **3차 목록과 완전히 동일**하고, 신규는 지시된 테스트 1개뿐이다.

```
M approval-confluence9/.../rest/ApprovalRestResource.java                        (+197/-48 중 13 hunk)
M approval-confluence9/.../storage/ActiveObjectsApprovalRequestRepository.java   (+41)
M approval-confluence9/.../storage/ApprovalEntity.java                           (+5, PREV_REQUEST_ID)
M approval-domain/.../ApprovalRequest.java                                       (+23)
M approval-domain/.../ApprovalRequestTest.java                                   (+6)
M approval-domain/.../ExpiryReasonTest.java                                      (+62)
? approval-confluence9/.../rest/StepRestorationTest.java                         (신규, 지시됨)
```

5a 허용 범위(재승인 백엔드: REST 생성 경로 · 승인자 출처 저장 · 이전 요청 연결 · 만료 정책) **내**.
리스너·스케줄러·알림 리졸버·프론트엔드 **미수정** ✓. C10 모듈 **미수정** ✓.

| 파일 | NUL | 최장 라인 |
|---|---|---|
| `ApprovalRestResource.java` | **0** | 122 |
| `ActiveObjectsApprovalRequestRepository.java` | **0** | 105 |
| `ApprovalEntity.java` | **0** | 73 |
| `ApprovalRequest.java` | **0** | 119 |
| `ApprovalRequestTest.java` | **0** | 142 |
| `ExpiryReasonTest.java` | **0** | 117 |
| `StepRestorationTest.java` | **0** | 107 |

**NUL 0건** ✓ (3차가 `\0` → `":"`로 고친 `rowKey` 구분자 유지 — `ActiveObjectsApprovalRequestRepository:439`).
`git diff --check` 통과 ✓. 최장 라인은 전부 일반 서술형 코드 한 줄이며 **압축·한 줄 합치기 없음** ✓.
주석 전부 한국어 ✓. 지시 외 문구·로직 변경 **0건**.

`rowKey(stepOrder, actorKey)` 기반 `existingViaGroups`(N-4 수정)는 유지됐다. 평탄 저장으로 환원했어도
`saveApprovers`의 **행 보존**은 여전히 행 단위 매칭이 정확하다(같은 사람의 행이 재생성될 때 어느 행의
값을 물려받는지 결정) — 두 계층의 키가 달라도 모순이 아니다. `saveApproverViaGroups`가 생성 직후
전 행을 평탄 맵으로 덮어쓰고, 이후 재저장에서는 `setViaGroup`이 생성 분기에서만 호출되어 보존된다. **정합적** ✓

---

## 6. 발견 — 2건 (둘 다 경미, 배포 비차단)

### L-1 (경미, 테스트 강도) `assertNull(userFirst.viaGroups().get("alice"))`는 "키 부재"와 "값 null"을 구분하지 못한다

`StepRestorationTest:83`. 프로덕션 코드는 `:1388`에서 alice를 **null 값으로 명시 삽입**하므로 실제로는 키가 존재하고,
`restoreSteps:1421`의 `containsKey` 가드는 **키 존재에 의존**한다. 만약 개인 분기가 "아예 넣지 않는" 쪽으로
바뀌면 불변식이 깨지는데 이 단언은 여전히 통과한다.

`assertTrue(userFirst.viaGroups().containsKey("alice"))` 한 줄이면 닫힌다.
**현재 코드는 정확하므로 실피해 없음** — 미래 회귀 감지 폭의 문제다.

### L-2 (경미, 이월) N-6(dedup으로 개인 단계 소실) 정책이 스펙에 명문화되지 않았다

3차 §10.2 지시 항목. `_workspace/design-reapproval.md`에 관련 서술이 없고,
`docs/progress-2026-08-11-2.md:55`에 "requireAll 그룹과 앞 단계 중복 인원 제거의 상호작용
(전원 조건 조용한 축소) — UX 안내 추가 후보"로 **배치 1~3 시점부터 알려진 항목**으로만 남아 있다.

즉 정책은 사실상 "**현행 유지(앞 단계 우선), 사용자 안내는 후속**"이고 그 근거도 문서에 있다.
동작 자체는 §3에서 확인했듯 **결정론적이고 안전**하며(요구 인원 캡으로 교착 없음, 재승인 고정점),
`toSteps`는 이번 배치 미변경이다. **5a의 결함이 아니므로 비차단**. 5b 또는 UX 배치에서 안내 문구와 함께 종결 권장.

### 발견에 넣지 않은 것

- `ApprovalRestResource:60` `import java.util.LinkedHashSet;`가 미사용이다.
  단, `git show HEAD` 확인 결과 **HEAD에서도 이미 미사용**이었다 — 이번 배치가 만든 것이 아니므로 5a 발견이 아니다.
  다음에 이 파일을 만질 때 함께 정리하면 된다.
- `ApprovalEntity.PREV_REQUEST_ID` 신규 컬럼: 같은 엔티티의 `FLOW_ID`와 동일한 방식(AO 자동 스키마 갱신,
  전용 upgrade task 없음)이라 기존 관례와 **일관**. 1~3차에서도 미지적.

---

## 7. 이월 (5a 범위 밖 · 별건)

| # | 항목 | 상태 |
|---|---|---|
| F-11 | `fromRequestId` + `approverKeys` 동시 시 클라 값 무시 | **OPEN** — `:208-212` legacy 분기가 `approvers`를 이전 요청 것으로 덮어씀 |
| N-3 | legacy `approverGroups` 요청의 required 재계산 정책 | **OPEN** — 스펙 미명시 |
| F-2 잔여 | `isLegacyMinimum`이 REST에서 AO 직접 조회(`:1401-1406`) | **OPEN** — 기능 구멍 없음, 계층 위반만 |
| F-12 | 5a 단독 배포 시 화면 후퇴 | 유효 — **5b와 묶어 배포** |
| N-6 | dedup 개인 단계 소실 (= L-2) | 문서화 대기 |

---

## 8. 결론

3차의 blocker N-5는 **증상 봉합이 아니라 구조 제거**로 해소됐다. 단계 번호를 두 곳에서 독립적으로
매기던 이중 체계가 사라졌으므로, 밀림이라는 실패 양식 자체가 코드에 표현될 수 없다.
평탄 맵의 정당성(도메인 dedup ⇒ 한 사람 한 단계)은 §2.1에서 세 지점의 first-wins 일치로 확인했고,
§3에서 8개 시나리오 × 3세대를 실행해 **저장 rows·복원 결재선·required 캡·구성원 변동 반영**이
전부 타당하며 **고정점**임을 확인했다. 3차 재검증 조건 4개 전부 충족, 빌드 domain 48 + c9 53 green,
파일 범위·NUL·압축 전부 통과. 잔여 2건은 경미하며 배포를 막지 않는다.

**배치 5a: PASS. 커밋 가능.** 단, F-12에 따라 **화면(5b)과 묶어 배포**할 것.
