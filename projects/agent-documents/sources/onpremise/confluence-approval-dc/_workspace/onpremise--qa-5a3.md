# QA 5a-3 — 재승인 백엔드 3차 검증

- 기준 커밋: `82e5ce8` (미커밋 워킹트리)
- 이전: 1차 `_workspace/qa-5a.md` (FAIL, 12건) / 2차 `_workspace/qa-5ar.md` (FAIL, 미해소 2 + 신규 4)
- 3차 재작업 수행자: 메인 Claude(직접). 구현자와 무관하게 동일 기준으로 판정한다.
- 검증자: approval-qa (독립 검증). 보고를 참조하지 않고 diff·빌드·**실제 코드 실행**으로 판정.

## 판정: **FAIL** (재작업 1회 더)

qa-5ar §8 재검증 조건 4개 중 **2 PASS / 1 부분 / 1 성립 불가**, §7 N-2·N-4 **모두 RESOLVED**,
NUL 바이트 **제거 확인**. 그러나 이번 재작업이 **신규 중급 회귀 1건(N-5)**을 만들었다.

핵심은 두 가지다.

1. **2차 QA의 F-3 진단 자체가 틀렸다.** 도메인 `toSteps`가 단계 간 actorKey를 전역 dedup하므로
   `(STEP_ORDER=2, alice)` 행은 **애초에 생성되지 않는다.** 2차가 "결재선 확대"라고 판정한 시나리오는
   실재하지 않았다. 즉 이번 재작업은 **도달 불가능한 버그를 고쳤다.**
2. 그 과정에서 도입한 단계별 저장(`saveApproverViaGroupsByStep`)이 **단계 번호 체계 불일치**로
   실제 도달 가능한 경로에서 **그룹 출처를 통째로 잃는다.** 이전의 평탄 저장은 이 경우를 맞게 처리했다.

---

## 0. 검증 방법

1. `git status`/`git diff`로 파일 범위·압축 확인, `perl`로 NUL 바이트 직접 계수.
2. `mvn -B -pl approval-confluence9 -am test` **직접 실행** (JDK 21 + Maven 3.9.16, `scripts/build.ps1` 경로).
   로그: `_workspace/mvn-5a3.log`.
3. **손 추적에 그치지 않고 실제 코드를 실행했다.** 임시 probe 테스트를 c9 테스트 소스에 넣어
   `resolveStepSpec` → `ApprovalRequest.createSequential` → 저장될 행의 `VIA_GROUP`을 출력시키고
   검증 후 삭제했다(워킹트리 무변경 확인 완료). 아래 §3·§6의 수치는 전부 그 실행 결과다.
4. 1차 PASS 구간(도메인 전이표) 회귀 스팟 체크.

---

## 1. 재검증 조건 판정표 (qa-5ar §8)

| # | 조건 | 판정 | 근거 |
|---|---|---|---|
| 1 | `mvn` 전체 green **+ c9 테스트 수 증가** | **PASS** | domain 48/48, c9 **48 → 53**(+5), `BUILD SUCCESS` |
| 2 | `resolveStepSpec("group:leads;user:alice")` 단계별 분리를 테스트로 고정 | **부분 PASS** | 함수 단위 불변식은 진짜로 고정됨. 그러나 조건이 요구한 **행 단위**(`(2,alice).VIA_GROUP=null`) 불변식은 **테스트 불가** — 그 행이 존재할 수 없다(§3) |
| 3 | 시나리오 (iii)가 `group:leads;user:alice`로 복원 | **성립 불가 (원 결함 없음)** | 도메인 dedup으로 1세대 요청이 이미 **단일 단계**다. 복원 결과 `group:leads`가 **저장된 요청에 충실한 정답**. 2차의 확대 주장은 오진(§3) |
| 4 | `flowId`+`fromRequestId` 동시 시 Flow의 viaGroups 저장 | **PASS** | `:192`·`:212` 양쪽에 `blank(flowId)` 추가, Flow 분기가 `viaGroupsByStep`을 정확히 인계(§4) |

### §7 지시 항목

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| N-2 | 죽은 변수 `effectiveSteps` | **RESOLVED** | 심볼 소멸. `:192`·`:195`·`:212` 모두 `blank(steps)` 직접 사용 — 표현 불일치도 해소 |
| N-4 | `existingViaGroups`를 rowKey 키로 | **RESOLVED** | `:429-433` `rowKey(stepOrder, actorKey)` 적재, `:449` 동일 키로 조회. 회귀 위험 심사 결과 **정합적**(§5) |
| — | 저장소 파일 NUL 바이트 제거 | **RESOLVED** | 워킹트리 4개 파일 전부 **0바이트**. `rowKey` 구분자가 실제 `\0` → `":"`로 교체됨(§7) |

---

## 2. 빌드

```
approval-domain      Tests run: 48, Failures: 0, Errors: 0, Skipped: 0
approval-confluence9 Tests run: 53, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

c9 증가분 5건은 전부 신규 `StepRestorationTest`다.

**테스트 품질 판별** — 형식적이지 않다. `groupForWholeStep` 4건은 qa-5ar §7.3이 지정한 표
(전부 null / 전부 동일 그룹 / 단일 사용자 null / 혼합)를 정확히 덮고, 각각 판정 분기가 다르다.
5번째 `단계별_그룹_출처는_단계_간에_섞이지_않는다`는 `viaGroupsByStep[1]`·`[2]`를 따로 단언하므로
`putIfAbsent` 회귀가 재도입되면 **실제로 깨진다**. 진짜 불변식 테스트다.

**다만 지키는 경계가 틀렸다.** 이 테스트는 `resolveStepSpec`의 출력만 본다. 그 출력이 저장 행에
어떻게 매핑되는지(= 실제 결함이 사는 곳, §6)는 어떤 테스트도 덮지 않는다.

---

## 3. 조건 (3) 재추적 — 쓰기 경로를 처음부터 끝까지 (실행 검증)

`steps="group:leads;user:alice"`, `leads = {alice, bob}`, alice ∈ leads.

**1) `resolveStepSpec`** (`ApprovalRestResource:1369-1397`) — 지시대로 고쳐졌다.

```
steps            = [[alice, bob], [alice]]
viaGroupsByStep  = {1={alice=leads, bob=leads}, 2={alice=null}}
```

단계 2가 `{alice:null}`로 **독립**돼 있다 ✓. 2차가 지목한 `putIfAbsent` 오염은 사라졌다.

**2) `workflowService.requestSequential` → `ApprovalRequest.createSequential` → `toSteps`**
(`ApprovalRequest.java:504-534`, **이번 배치 미변경 · 기존 코드**)

```java
Set<String> seen = new LinkedHashSet<>();
for (...) {
    for (String key : keys) { if (seen.add(normalized)) stepKeys.add(normalized); }
    if (stepKeys.isEmpty()) { continue; }          // ← 단계가 통째로 사라진다
    steps.add(new ApprovalStep(steps.size() + 1, stepKeys, required));
}
```

`seen`은 **단계 경계를 넘어 전역**이다. 토큰2의 alice는 토큰1에서 이미 소비됐으므로
`stepKeys`가 비고 → `continue` → **단계 자체가 버려진다.**

실행 결과:

```
A domain step order=1 keys=[alice, bob] required=1
(단계 2 없음)
```

**3) `saveApprovers`** — `request.steps()`를 순회하므로 만들어지는 행은 `(1,alice)`, `(1,bob)` **둘뿐**이다.

**4) `saveApproverViaGroupsByStep`** — `(1,alice)→leads`, `(1,bob)→leads`.

### 결론

`(STEP_ORDER=2, ACTOR_KEY=alice)` 행은 **존재한 적이 없다.**
qa-5ar §4(iii)가 "`(2,alice)=leads`로 오염 → 복원이 `group:leads;group:leads`로 확대"라고 한 것은
**저장 계층이 만드는 데이터를 잘못 역산한 오진**이다. 평탄 저장이든 단계별 저장이든 그 행은 없다.

복원(`restoreSteps`)은 단일 단계 `[alice,bob]`/전원 `leads` → `groupForWholeStep` = `"leads"` →
`group:leads` 하나를 돌려준다. 이는 **저장된 요청 그대로**이며 정답이다.

**진짜 문제는 다른 데 있다** — `group:leads;user:alice`를 입력하면 **요청 생성 시점에 개인 단계가 조용히 사라진다**
(도메인 dedup, 기존 동작, 이번 배치 범위 밖). 사용자는 2단계를 지정했는데 1단계 요청이 만들어진다.
5a의 결함은 아니지만 **별건으로 기록해 둔다(N-6)**.

---

## 4. 조건 (4) — `flowId` + `fromRequestId` 동시

| 지점 | 코드 | 판정 |
|---|---|---|
| `:191-194` restoredSteps | `blank(steps) && blank(flowId) && previousRequest != null && !isLegacyMinimum(...)` | `blank(flowId)` 추가됨 → **restoredSteps = null** ✓ |
| `:212` legacy 분기 | `blank(steps) && blank(flowId) && previousRequest != null && isLegacyMinimum(...)` | flowId 배제 확인 ✓ — Flow가 legacy 최소인원 덮어쓰기를 이긴다 |
| `:245-250` Flow(단계 있음) | `viaGroupsByStep = flowResolution.viaGroupsByStep()` | **Flow 값이 저장된다** ✓ |
| `:234-238` Flow(단계 없음) | `viaGroupsByStep = null` 명시 초기화 + `approverResult = flowApprovers(flow)` | 평탄 경로로 정확히 물러남 ✓ |
| `:279-281` | `savePrevRequestId`는 flowId와 무관하게 호출 | 이전 요청 연결 유지 ✓ |

N-1의 두 증상(엉뚱한 400, Flow viaGroups 폐기) 모두 소멸. `stepApprovers != null ⟺ viaGroupsByStep != null`
불변식이 4개 경로 전부에서 성립함을 확인했다. **PASS**

---

## 5. N-4 회귀 위험 심사 — rowKey 키 변경이 "변경분만 반영"과 정합적인가

`saveApprovers`(`:421-465`)는 행을 지우고 다시 만들지 않고 `rowKey`로 매칭해 유지한다.
키를 `actorKey` → `(stepOrder, actorKey)`로 바꾼 영향:

| 상황 | 동작 | 판정 |
|---|---|---|
| 생성 시(기존 행 0개) | 전 행이 새로 만들어져 `viaGroup=null` → 직후 `saveApproverViaGroups(ByStep)`이 덮어씀 | 영향 없음 ✓ |
| 승인·반려·만료 후 재저장 | 같은 `(step, actor)` 행이 매칭돼 **retained** → `setViaGroup`은 생성 분기에서만 호출되므로 **기존 값 그대로 보존** | 영향 없음 ✓ |
| `legacyMinimum` 플립 | `isLegacyMinimum(request)`(`:514`)는 `steps().size()==1 && required>1`로 **request 객체에서 결정론적으로 파생**. 단계는 생성 후 불변이므로 저장 간 뒤집히지 않음 | 도달 불가 ✓ |
| 단계 이동(같은 actor가 다른 step으로) | 옛 행 삭제 + 새 행 `existingViaGroups.get(새 rowKey)` = null → **출처 소멸** | **맞는 동작** — 아래 |

**"단계 이동 시 출처가 사라지는 게 맞는 동작인가"에 대한 판단: 맞다.**
`VIA_GROUP`은 "이 사람을 **이 단계에** 넣은 그룹"이라는 뜻이다. 단계가 달라지면 그 출처는 더 이상
사실이 아니므로, 옛 값을 끌고 오는 것이야말로 출처 날조다. 게다가 결재선을 사후 변경하는 API가
없어 이 경로는 현재 **도달 불가**다. 키 변경은 모든 도달 가능 경로에서 **동작 중립**이다. **RESOLVED.**

부수 효과 하나: 키가 `actorKey`였을 때는 같은 사람의 서로 다른 단계 행이 last-wins로 섞였는데,
도메인 dedup 덕에 그 상황도 실제로는 발생하지 않았다. 즉 N-4는 실해 없는 정리였다.

---

## 6. 신규 발견

### N-5 (중) `resolveStepSpec`의 단계 번호와 도메인 `toSteps`의 단계 번호가 어긋나 그룹 출처가 소실된다 — **이번 재작업이 만든 회귀**

두 곳이 **서로 다른 기준으로 단계 번호를 매긴다.**

| 위치 | 번호 부여 |
|---|---|
| `ApprovalRestResource:1380` | `steps.size() + 1` — `steps`에 **토큰마다 무조건 add**하므로 = **토큰 인덱스+1** |
| `ApprovalRequest:528` | `steps.size() + 1` — 흡수된 단계는 `continue`로 **건너뛴 뒤** add하므로 = **살아남은 단계 순번** |

앞 단계에 흡수돼 사라지는 토큰이 하나라도 있으면 그 뒤 단계 번호가 **밀린다.**
`saveApproverViaGroupsByStep`은 `viaGroupsByStep.get(행의 STEP_ORDER)`로 조회하므로 **엉뚱한 단계의 맵**을 본다.

**실행으로 확인** — `steps="group:leads;user:alice;group:devs"`, `leads={alice,bob}`, `devs={carol,dave}`:

```
resolveStepSpec viaGroupsByStep = {1={alice=leads, bob=leads}, 2={alice=null}, 3={carol=devs, dave=devs}}
도메인 단계                      = 1:[alice,bob]   2:[carol,dave]      ← 토큰2가 흡수돼 번호가 밀림
저장될 행 (step,actor) -> VIA_GROUP:
   (1,alice) -> leads
   (1,bob)   -> leads
   (2,carol) -> null        ← viaGroupsByStep[2]={alice:null} 를 보고 carol 조회 실패
   (2,dave)  -> null
평탄 맵(재작업 전 동작)         = {alice=leads, bob=leads, carol=devs, dave=devs}   ← 이쪽이 정답이었다
```

**재작업 전 `saveApproverViaGroups`는 이 경우를 맞게 처리했다.** 회귀가 맞다.

피해 방향 분석: 밀림이 **틀린 그룹명**을 넣을 수는 없다. `viaGroupsByStep[N]`의 키는 전부
도메인이 단계 N(=토큰 N+d)을 처리하는 시점에 이미 `seen`에 들어간 사람들이고, 밀린 단계의 승인자는
정의상 아직 `seen`이 아니기 때문이다. 따라서 결과는 **항상 null** — 권한 확대는 아니고 **출처 소실**이다.
그래도 실피해가 셋이다.

1. **재승인 복원에서 그룹 재확장이 사라진다.** `groupForWholeStep([carol,dave], {carol:null,dave:null})` → null →
   스냅샷으로 굳는다. 이후 devs에 들어온 사람은 결재선에 안 잡히고, 나간 사람은 계속 남는다.
2. **F-4(비활성 그룹 400) 가드가 이 단계들에 적용되지 않는다.** 출처가 null이라 그룹 단계로 판정되지 않아
   `registeredGroup(g).filter(isEnabled).orElseThrow`(`:1428-1430`)를 아예 타지 않는다.
   비활성·삭제된 그룹이 조용히 스냅샷으로 되살아난다 — 설계 §2.3이 막으려던 바로 그 우회로다.
3. **응답 JSON의 그룹 출처 배지가 사라진다.** `requestObject:1062`가 평탄 `findApproverViaGroups`를 읽어
   `:1074`·`:1094` `viaGroup` 필드를 채우는데, 그 값이 null이 된다. 5a 이전 대비 **눈에 보이는 후퇴**다.

**재작업 지시** — 두 번호 체계를 억지로 맞추지 말고 **없애는 쪽**을 권한다.

`toSteps`의 전역 dedup 때문에 **한 사람은 최대 한 단계에만 존재한다.** 따라서
`actorKey → 그룹명` 평탄 맵은 **애초에 모호하지 않다.** 단계별 맵 자체가 불필요한 장치였다.
가장 단순한 해법은 요청 생성 **후** 평탄 맵으로 저장하는 기존 방식으로 되돌리는 것이다
(`saveApproverViaGroups(request.id(), resolution.viaGroups())`).
단계별 저장을 유지하려면, `viaGroupsByStep`을 토큰 인덱스가 아니라 **생성된 `request.steps()`를 순회하며
평탄 맵에서 되채우는** 방식으로 만들어야 한다. 어느 쪽이든 §3의 오진 위에 세운 구조물은 정리 대상이다.

> 이 결함은 `단계별_그룹_출처는_단계_간에_섞이지_않는다` 테스트를 **통과하면서** 발생한다.
> 그 테스트가 `resolveStepSpec` 출력에서 멈추고 도메인 단계 번호와 대조하지 않기 때문이다.

### N-6 (중, 5a 범위 밖) `group:leads;user:alice`(alice ∈ leads) 요청은 개인 단계가 조용히 사라진다

§3에서 확인한 도메인 dedup의 직접 결과다. 사용자는 "leads 중 1명 → 그다음 alice 결재" 2단계를
지정했는데 실제로는 `[alice,bob]` 1단계 요청이 만들어지고, **경고도 오류도 없다.**
`toSteps`는 이번 배치 미변경이므로 5a의 회귀는 아니지만, 재승인 복원이 이 왜곡된 요청을 그대로
재생산하므로 5a와 무관하다고 할 수도 없다. 정책 확정 필요 — 400으로 막을지, 뒤 단계를 우선할지,
현행 유지(앞 단계 우선)를 명문화할지.

### 잔존 (2차에서 이월, 이번 지시 대상 아님)

| # | 항목 | 상태 |
|---|---|---|
| F-11 | `fromRequestId` + `approverKeys` 동시 시 클라 값 무시 | **OPEN** — `:212` legacy 분기가 여전히 `approvers`를 이전 요청 것으로 덮어씀 |
| N-3 | legacy `approverGroups` 요청의 required 재계산 정책 | **OPEN** — 스펙 미명시 |
| F-2 잔여 | `isLegacyMinimum`이 REST에서 AO 직접 조회(`:1405`) | **OPEN** — 기능 구멍은 없음(저장 계층 `:514`와 판정 집합 일치), 계층 위반만 |
| F-12 | 5a 단독 배포 시 화면 후퇴 | 유효 — 5b와 묶어 배포 |

---

## 7. NUL 바이트 / rowKey 구분자

**워킹트리: 전부 깨끗하다.** `perl`로 직접 계수:

```
ApprovalRestResource.java                    0
ActiveObjectsApprovalRequestRepository.java  0
StepRestorationTest.java                     0
ApprovalEntity.java                          0
```

원인도 확인했다. `HEAD`(82e5ce8) 버전 `ActiveObjectsApprovalRequestRepository.java` 오프셋 19548에
NUL이 **1개** 남아 있고, 그 위치는 `rowKey`의 구분자 리터럴이다 — 즉 **소스에 생 `\0` 바이트를 박아 넣었었다**:

```java
return stepOrder + "\0" + actorKey;      // HEAD (cat -v로 보면 "^@")
return stepOrder + ":" + actorKey;       // 워킹트리 (:469) — 교체됨
```

**`git diff --stat`의 텍스트 취급은 이번 수정의 증거가 아니다.** NUL이 오프셋 19548로 git의
binary 판별 창(앞 8000바이트) 밖에 있어 **수정 전에도 텍스트로 취급됐다.** 실제 증거는 위 바이트 계수다.
(참고: `git diff` 출력을 `grep`에 물리면 아직 `Binary file matches`가 뜬다 — pre-image인 HEAD 쪽에
NUL이 들어 있기 때문이며, 커밋하면 사라진다.)

**`':'` 충돌 불가 확인.** `rowKey = stepOrder + ":" + actorKey`에서 `stepOrder`는 `int`라 **숫자만**으로
렌더링된다. 따라서 문자열의 **첫 `':'`가 언제나 구분자**이고, `actorKey`에 `':'`가 몇 개 들어 있든
`(int, String) → String` 매핑은 **단사**다. 예: `(1,"2:x")`→`"1:2:x"`, `(12,":x")`→`"12::x"` — 충돌 없음.
NUL을 쓸 이유가 없었고, `":"`가 정확한 선택이다.

---

## 8. 파일 범위 / 압축 · 지시 외 변경

변경 6개 + 신규 1개 — **2차 목록과 정확히 일치하고, 신규는 지시된 테스트 1개뿐**이다.

```
M approval-confluence9/.../rest/ApprovalRestResource.java              (+190/-)
M approval-confluence9/.../storage/ActiveObjectsApprovalRequestRepository.java
M approval-confluence9/.../storage/ApprovalEntity.java
M approval-domain/.../ApprovalRequest.java
M approval-domain/.../ApprovalRequestTest.java
M approval-domain/.../ExpiryReasonTest.java
? approval-confluence9/.../rest/StepRestorationTest.java               (신규, §7.3 지시)
```

| 파일 | 최장 라인 |
|---|---|
| `ApprovalRestResource.java` | 122자 |
| `ActiveObjectsApprovalRequestRepository.java` | 105자 |
| `StepRestorationTest.java` | 107자 |
| `ApprovalRequest.java` | 119자 |

압축·한 줄 합치기 **없음**. `git diff --check` 통과. 주석 전부 한국어 ✓.
리스너·스케줄러·알림 리졸버 **미수정** ✓. 지시 외 문구·로직 변경 **0건**.

새로 추가된 `StepGroupResolver` 인터페이스(`:1335`)와 `resolveStepSpec` static 오버로드(`:1369`)는
테스트 주입을 위한 분리로, 프로덕션 경로는 private 래퍼(`:1351`)를 그대로 쓴다 — 의미 변화 없음 ✓.

---

## 9. 회귀 스팟 체크 — 1차 PASS였던 도메인 전이표

| 전이 | 구현 | 판정 |
|---|---|---|
| PENDING + 편집 → EXPIRED(`CONTENT_VERSION`) | `ApprovalRequest:266` | ✓ |
| PENDING + 마감 → EXPIRED(`DEADLINE`) | `:288-292` | ✓ |
| APPROVED + 편집 → 불변 | `status != PENDING` 가드 | ✓ `승인된_요청은_페이지가_편집되어도_유지된다` green |
| APPROVED + 마감 → 불변 | `:288` | ✓ `승인된_요청은_마감_시각이_지나도_유지된다` green |
| REJECTED/EXPIRED + 편집·마감 → 불변 | `status != PENDING` | ✓ 전용 테스트 2건 green |
| 과거 `AFTER_APPROVAL` 복원 → `requiresReapproval()` | `:409` | ✓ 하위 호환 테스트 green |
| `canExpire()` 삭제 | 삭제 유지 | ✓ |
| `EXPIRED_BY_EDIT_AFTER_APPROVAL` 신규 생성 경로 | 부재 유지 | ✓ |
| dedupeKey / `findOpenRequest` / `nextRevision` | `:409-413` 등 미변경 | ✓ |
| `findColumn` 위임 (`findFlowIds`/`findPrevRequestIds`) | `:313` 등 | ✓ |
| import 정렬, 페이지 캐시 `containsKey` | 2차 상태 유지 | ✓ |

도메인 테스트 파일은 2차 이후 **추가 변경 없음**(diff 동일). 도메인 48건 전부 green. **회귀 없음.**

---

## 10. 재작업 지시

1. **N-5 (중, 필수)** — 단계 번호 이중 체계를 없앤다. 권장은 **평탄 저장으로 환원**이다.
   도메인 dedup이 "한 사람 = 한 단계"를 보장하므로 `actorKey → 그룹명` 맵은 모호하지 않고,
   단계별 맵은 처음부터 불필요했다. 단계별 저장을 굳이 유지한다면 `viaGroupsByStep`을
   **토큰 인덱스가 아니라 생성된 `request.steps()` 기준으로** 다시 만들어야 한다.
   회귀 방지 테스트: `group:leads;user:alice;group:devs`(alice ∈ leads)에서
   `(2,carol).VIA_GROUP == "devs"`를 단언할 것. **이 테스트가 지금 코드에서 반드시 실패해야 한다.**
2. **§3·N-6 정책 확정** — `group:X;user:a`(a ∈ X)에서 개인 단계가 사라지는 현행 동작을
   400으로 막을지, 뒤 단계를 우선할지, 현행 유지를 명문화할지 스펙에 적는다.
   qa-5ar §7.1이 전제한 "(2,alice) 행" 모델은 **폐기**한다 — 실재하지 않는다.
3. **테스트 경계 상향** — `resolveStepSpec` 출력에서 멈추지 말고
   `resolveStepSpec → createSequential → 저장될 (step, actor, viaGroup)`까지 한 번에 단언하는
   테스트를 둔다. N-5가 5개 테스트를 전부 통과하며 빠져나간 이유가 이 공백이다.
4. 선택: F-11 · N-3 · F-2 잔여(계층 위반) 정리.

## 11. 재검증 조건

1. `mvn -B -pl approval-confluence9 -am test` green **이면서** N-5 회귀 테스트가 포함될 것.
2. `group:leads;user:alice;group:devs`(alice ∈ leads)의 저장 행이
   `(1,alice)=leads`, `(1,bob)=leads`, `(2,carol)=devs`, `(2,dave)=devs`일 것 — **실행으로 확인**.
3. 그 요청의 재승인 복원이 devs 단계를 **그룹으로 재확장**하고, devs가 비활성이면 **400**이 날 것.
4. 응답 JSON의 `viaGroup` 필드가 carol·dave에 대해 `devs`로 채워질 것.
