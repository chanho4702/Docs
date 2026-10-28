# QA 5a-R — 재승인 백엔드 재작업 재검증

- 기준 커밋: `82e5ce8` (미커밋 워킹트리)
- 1차 QA: `_workspace/qa-5a.md` (FAIL, 12건) / 재작업 스펙: `_workspace/spec-5ar-rework.md`
- 검증자: approval-qa (독립 검증). Codex 보고를 참조하지 않고 diff·빌드·데이터 역산으로 판정.

## 판정: **FAIL** (재작업 1회 더)

12건 중 **10건 RESOLVED / 2건 미해소**(F-3 중, F-11 정보) + 신규 4건(중 1 / 경 1 / 정보 2).

빌드는 완전 green이 되었고(치명 해소), 복원 전략도 "스냅샷 + 명확한 그룹 단계만 재확장"으로
스펙대로 교체됐다. 그러나 **F-3의 근본 원인이 읽기 쪽이 아니라 쓰기 쪽에 있었고 쓰기 쪽은 그대로**여서,
재작업이 겨냥한 바로 그 시나리오(`group:leads;user:alice`, alice ∈ leads)가 **여전히 결재선을 확대**한다.

---

## 0. 검증 방법

1. `git status` / `git diff`로 파일 범위·압축·재포매팅 확인.
2. `mvn -B -pl approval-confluence9 -am test` **직접 실행** (JDK 21 + Maven 3.9.16, `scripts/build.ps1` 경로).
3. 복원 로직을 **저장 계층이 실제로 기록하는 `ApprovalApproverEntity.VIA_GROUP` 값에서 역산**해
   지시된 5개 시나리오를 손으로 추적.
4. 1차에서 PASS였던 도메인 전이표·dedupeKey 불변식 스팟 체크.

## 1. 빌드 — **green**

```
approval-domain      Tests run: 48, Failures: 0, Errors: 0, Skipped: 0
approval-confluence9 Tests run: 48, Failures: 0, Errors: 0, Skipped: 0
BUILD SUCCESS
```

도메인은 46 → 48로 2건 증가(F-7 커버리지 2건). **c9는 48 → 48로 변동 없음** — qa-5a §7이 재검증
조건으로 요구한 복원 시나리오 3건 테스트가 **추가되지 않았다**(아래 F-13).

## 2. 파일 범위 / 압축·재포매팅

변경 파일 6개로 1차와 동일. 신규 파일·허용 외 파일 **0건**. 리스너·스케줄러·알림 리졸버 미수정 ✓.

| 파일 | 최장 라인 |
|---|---|
| `ApprovalRestResource.java` (1567줄) | 122자 |
| `ActiveObjectsApprovalRequestRepository.java` (524줄) | 105자 |
| `ApprovalRequest.java` | 119자 |

압축·한 줄 합치기 없음. `git diff --check` 통과. 지시 외 문구 변경 없음. 주석 전부 한국어 ✓.

---

## 3. 판정표 (1차 12건)

| # | 등급 | 항목 | 판정 | 근거 |
|---|---|---|---|---|
| F-1 | 치명 | 옛 의미 도메인 테스트 잔존 → 빌드 red | **RESOLVED** | `ApprovalRequestTest:140` `승인된_요청은_페이지가_편집되어도_유지된다`로 이름·본문 재작성(`assertFalse` + `APPROVED`). 삭제 아님 ✓. 전체 green |
| F-2 | 중 | "한 단계 = 단일 그룹/단일 사용자" 전제 붕괴 | **RESOLVED** | 문자열 재구성 폐기 → `restoreSteps()` 스냅샷. 3인·required=1 단일 단계가 그대로 복원되고 `findFirst` 유실 경로 소멸. 잔여: legacy 판정이 아직 REST에 있음(아래 주석) |
| F-3 | 중 | 같은 사용자가 그룹·개인 단계에 함께 있으면 viaGroup 오염 | **NOT RESOLVED** | 읽기만 단계별(`findApproverViaGroupsByStep`)로 바뀌고 **쓰기는 여전히 평탄 맵**(`saveApproverViaGroups`). §4 참조 |
| F-4 | 중 | 비활성 등록 그룹이 400으로 안 걸림 | **RESOLVED** | `restoreSteps:1389` `registeredGroup(g).filter(ApprovalGroupEntity::isEnabled).orElseThrow(unavailableGroup)` + `resolveDirectRequest` 실패도 같은 문구로 감싸 400 |
| F-5 | 경 | 테스트 이름이 검증 내용과 반대 | **RESOLVED** | `승인_완료_후_편집은_상태를_바꾸지_않는다`, `승인_후_편집_호출_전에도_승인_버전을_알려준다`로 개명 |
| F-6 | 경 | 새 테스트만 영문 camelCase | **RESOLVED** | `승인된_요청은_마감_시각이_지나도_유지된다`, `복원된_옛_승인_후_편집_만료는_재승인이_필요하다` |
| F-7 | 경 | REJECTED/EXPIRED 불변 커버리지 공백 | **RESOLVED** | `ExpiryReasonTest` 2건 추가. 각각 `expireForContentVersion`·`expireIfDue` 둘 다 false 단언 ✓ |
| F-8 | 경 | `findPrevRequestIds`가 `findFlowIds` IN 배치 복제 | **RESOLVED** | `findColumn(Collection<UUID>, Function<ApprovalEntity,String>)` 추출, 두 메서드가 위임(`:280`, `:312`) |
| F-9 | 경 | import 정렬 붕괴 | **RESOLVED** | `ApprovalApproverEntity`가 `ApprovalFlowEntity` 위로 이동, storage 블록 알파벳 순 복구 |
| F-10 | 경 | 삭제된 페이지 반복 `getPage` | **RESOLVED** | `requestsJson:969` `containsKey` 검사 후 `put` — null도 캐시됨 |
| F-11 | 정보 | `fromRequestId` + `approverKeys` 조합에서 클라 값 무시 | **OPEN** | `:191`/`:207` 폴백 조건이 여전히 `blank(steps)`만 본다. 스펙에도 미반영 |
| F-12 | 정보 | 5a 단독 배포 시 화면 후퇴 | **해당 없음(유효)** | 릴리스 노트 항목. 5b와 묶어 배포 |

> F-2 잔여: qa-5a F-2 3)이 요구한 "legacy 판정을 repository로 이동"은 미수행이다.
> `ApprovalRestResource:1366 isLegacyMinimum`은 여전히 REST에서 `activeObjects.find(ApprovalApproverEntity…)`를
> 직접 친다. 다만 판정 기준은 이제 저장 계층과 **일치**한다 — 저장 쪽(`:513`)이 `steps==1 && required>1`일 때만
> `STEP_ORDER=0`을 쓰고, REST가 `STEP_ORDER <= 0`을 보므로 두 집합이 같다(구 데이터의 기본값 0도 포함).
> 기능적 구멍은 없으므로 F-2는 RESOLVED로 두되, 계층 위반은 정리 대상으로 남긴다.

---

## 4. 지시된 5개 시나리오 직접 추적

추적 전제 — 저장 계층이 실제로 만드는 데이터:
`ApprovalApproverEntity` 행은 **(STEP_ORDER, ACTOR_KEY) 단위**로 존재하고(`saveApprovers:441` `rowKey`),
`STEP_ORDER = step.order()`이며 `isLegacyMinimum`(단일 단계 + required>1)일 때만 0이다.
**그러나 `VIA_GROUP`은 `saveApproverViaGroups:317`이 `viaGroups.get(actorKey)`로 actorKey 하나당 한 값을
모든 행에 똑같이 쓴다.** 이 한 줄이 아래 (iii)의 원인이다.

### (i) 단일 단계 3인 · required=1 → 스냅샷 그대로 — **PASS**

생성: `create(approverKeys=a,b,c, minimumApprovals=1)` → 도메인 단일 단계 required=1
→ 저장 `isLegacyMinimum` = `1 && 1>1` = false → `STEP_ORDER=1`, `STEP_REQUIRED=1`,
`VIA_GROUP` 전부 null(`resolveDirectRequest(keys, [])` → `{a:null,b:null,c:null}`).

복원: REST `isLegacyMinimum` = 어떤 행도 `STEP_ORDER<=0`이 아님 → false → `restoreSteps`.
`groupForWholeStep(step1, {a:null,b:null,c:null})` → 첫 키 a의 viaGroup이 null → **즉시 null 반환**
→ `stepApprovers=[[a,b,c]]`, `stepRequired=[1]` **스냅샷 그대로** ✓.
1차 F-2의 "3명이 순차 3단계로 뒤집힌다"는 소멸 ✓.

### (ii) `group:leads`(전원승인) + `user:alice` 2단계, alice ∉ leads — **PASS**

생성: `resolveStepSpec` → 평탄 viaGroups `{carol:leads, dave:leads, alice:null}`
→ 행 `(1,carol)=leads (1,dave)=leads (2,alice)=null`.

복원:
- step1 — `groupForWholeStep` = `leads`(전원 동일 non-null) → `registeredGroup("leads")` 활성 확인 →
  `resolveDirectRequest([], [leads])` 재확장 → `required = isRequireAll() ? 확장인원수 : 1` = **확장 인원수** ✓
  (`resolveStepSpec:1349`의 최초 생성 규칙과 동일한 식 → 일관 ✓)
- step2 — `viaGroups.get(alice)==null` → null 반환 → `[alice]`, `required=1` **스냅샷** ✓

`restoredViaGroups = {1: 새 구성원→leads, 2: {alice:null}}` → `saveApproverViaGroupsByStep`가
새 요청의 `(STEP_ORDER, ACTOR_KEY)` 행에 정확히 매핑됨(이전·신규 모두 step order 1..n) ✓.

### (iii) alice가 leads 구성원이기도 한 경우 — **FAIL (F-3 미해소)**

`steps=group:leads;user:alice`, alice ∈ leads로 **원 요청을 생성**하면:

1. `resolveStepSpec:1350` — token1(GROUP leads) → `resolved.viaGroups().forEach(viaGroups::putIfAbsent)`
   → `{alice:leads, bob:leads}`
2. `resolveStepSpec:1354` — token2(USER alice) → `viaGroups.putIfAbsent("alice", null)` → **no-op**(이미 존재)
3. 평탄 맵 `{alice:leads, bob:leads}`을 `saveApproverViaGroups`가 **모든 행**에 기록
   → `(1,alice)=leads`, `(1,bob)=leads`, **`(2,alice)=leads`** ← 오염

복원 시 `findApproverViaGroupsByStep`는 `{1:{alice:leads,bob:leads}, 2:{alice:leads}}`를 돌려주고,
`groupForWholeStep(step2=[alice], {alice:leads})` → **`"leads"` 반환** → step2가 leads 전체로 **재확장**된다.

결과: `group:leads;user:alice` → `group:leads;group:leads`. **1차 F-3과 증상이 완전히 동일하다.**
피해는 표시 문제가 아니라 결재 권한 확대다 — leads가 `requireAll=false`면 alice 개인 결재 단계를
**leads 아무나 1명이 대신 통과**시킬 수 있다. `requireAll=true`면 반대로 전원 승인으로 조여진다.

역순 `user:alice;group:leads`는 `putIfAbsent`로 alice가 null로 먼저 박혀 안전하다 — **순서 의존성도 그대로**다.

읽기 쪽(`findApproverViaGroupsByStep`)과 새 저장 쪽(`saveApproverViaGroupsByStep`)은 올바른 모양이지만,
**그 단계별 데이터를 처음 만들어 내는 경로가 없다.** `saveApproverViaGroupsByStep`은 오직 복원 경로에서만
호출되므로(`:278`), 사용자가 실제로 재승인할 대상인 **1세대 요청은 항상 평탄·오염된 데이터**를 갖는다.

### (iv) 비활성 그룹 400 — **PASS**

`restoreSteps:1389-1391` `registeredGroup(g).filter(isEnabled).orElseThrow(() -> unavailableGroup(g))`.
미등록·비활성 모두 걸린다. Confluence에서 삭제/활성 구성원 0명인 경우는 `resolveDirectRequest`가 던지는
`IllegalArgumentException`을 `:1395`에서 같은 문구로 다시 감싼다. 문구는 설계 §2.3과 일치:
`"결재선의 그룹 {G}을 더 이상 사용할 수 없습니다. 결재선을 다시 구성해 주세요."`
예외는 `inTargetLock` 람다 안에서 던져져 `:290` `catch (IllegalArgumentException)` → **400** ✓
(기존 `:184`/`:218` 등과 같은 경로).

### (v) legacy 요청 폴백 — **PASS**

원 요청이 `minimumApprovals=2, 승인자 3인` → 도메인 단일 단계 required=2 → 저장 `isLegacyMinimum` true
→ `STEP_ORDER=0`, `STEP_REQUIRED=0`. 로드 시 `toSteps`가 `<=0`을 보고 빈 목록 → `ApprovalRequest.restore(...)`
→ 단일 단계 required = `entity.getMinimumApprovals()`.

복원: REST `isLegacyMinimum` true → `restoreSteps` 미호출(`restoredSteps=null`) →
`:208-211` `effectiveMinimum = previousRequest.minimumApprovals()`(= 단계 required 합 = 2 ✓),
`approvers = eligibleApproverKeys()`, viaGroups는 평탄 맵 재사용.
`stepApprovers == null`이므로 `:252` `validForRequest` 검증을 거쳐 `workflowService.request(...)` 경로 ✓,
저장도 `restoredSteps == null` → `saveApproverViaGroups` 평탄 경로 ✓ **일관**.

### viaGroups 저장 맵 ↔ 단계 복원 일관성

| 경로 | steps 산출 | viaGroups 저장 | 일관 |
|---|---|---|---|
| `steps` 문자열 | `resolveStepSpec` | `saveApproverViaGroups`(평탄) | **✗ 단계별 정보 소실 → F-3 원인** |
| Flow(단계 있음) | `flowResolution` | `saveApproverViaGroups`(평탄) | **✗ 동일 문제** |
| Flow(단계 없음)·최소인원·legacy 폴백 | 단일 단계 | `saveApproverViaGroups`(평탄) | ✓ (단계가 하나라 무해) |
| `fromRequestId` 복원 | `restoreSteps` | `saveApproverViaGroupsByStep` | ✓ |
| **`flowId` + `fromRequestId` 동시** | Flow가 덮어씀 | `restoredSteps.viaGroups()` | **✗ 신규 N-1** |

응답 렌더링(`requestObject:1055`)은 평탄 `findApproverViaGroups`를 쓰지만 `eligibleApproverKeys()`
자체가 actorKey 집합이라 표시 의미는 이전과 동일 — 회귀 없음(요청당 AO 1회 조회 N+1은 기존 이슈).

---

## 5. 회귀 스팟 체크 (1차 PASS 구간)

| 항목 | 결과 |
|---|---|
| `expireForContentVersion` PENDING 전용 (`ApprovalRequest:266`) | 변경 없음 ✓ |
| `isDueForExpiry`/`expireIfDue` PENDING 전용, `canExpire()` 삭제 | 변경 없음 ✓ |
| `EXPIRED_BY_EDIT_AFTER_APPROVAL` 신규 생성 경로 부재 | 유지 ✓ (소비처는 과거 데이터용으로 잔존) |
| `requiresReapproval()` 하위 호환(restore) | `ExpiryReasonTest` 유지 + green ✓ |
| dedupeKey 불변식 / `findOpenRequest` / `nextRevision` | 저장 계층 미변경, 영향 없음 ✓ |
| 리스너·스케줄러·`NotificationRecipientResolver` | 미수정 ✓ |
| `ApprovalEntity.getPrevRequestId` `@StringLength(64)` | 유지 ✓ |
| `stale` 계산 (`APPROVED && page.version > approvedContentVersion`) | 유지 ✓, `page` 캐시 경유로 변경 |
| `savePrevRequestId` 호출 위치 (`inTargetLock` 내부, 생성 성공 후) | `:272-274` ✓ |

`findColumn` 추출이 `findFlowIds`의 IN 배치 의미를 바꾸지 않았는지 확인:
null 값 스킵·`IN_CLAUSE_BATCH` 분할·`LinkedHashMap` 누적 모두 동일 ✓.

---

## 6. 신규 발견

### N-1 (중) `flowId` + `fromRequestId` 동시 전달 시 복원과 Flow가 충돌한다

`:190-193`의 `restoredSteps` 계산 조건은 `blank(steps) && previousRequest != null && !isLegacyMinimum(...)`뿐이고
**`flowId`를 보지 않는다.** 그래서 둘 다 오면:

1. `restoreSteps(previousRequest)`가 먼저 돈다 → 이전 결재선의 그룹이 비활성이면
   **Flow가 그 그룹을 쓰지도 않는데 400**이 난다.
2. `:238-244`에서 Flow가 `stepApprovers`/`stepRequired`를 덮어쓴다. 그런데 `restoredSteps`는 여전히 non-null이라
   `:275-278`이 **`saveApproverViaGroupsByStep(restoredSteps.viaGroups())`** 쪽으로 간다 →
   *버려진* 복원 결과의 그룹 출처를 새 요청 행에 쓰고, **Flow가 만든 `flowResolution.viaGroups()`는 폐기**된다.
   구성원이 다르면 대부분의 행이 `VIA_GROUP=null`이 되어 그룹 출처가 통째로 사라진다.

**재작업**: `restoredSteps` 계산 조건에 `blank(flowId)`를 추가하거나,
viaGroups 저장 분기를 "어느 경로가 실제로 `stepApprovers`를 만들었는가"로 판정하도록 바꾼다.

### N-2 (경) `String effectiveSteps = steps;`가 죽은 변수다

`:189`에서 선언 후 재할당이 없고 `:191`·`:194`에서만 읽힌다. `steps`를 그대로 쓰면 된다
(같은 메서드 `:207`은 이미 `blank(steps)`를 직접 본다 — 표현 불일치도 함께 해소).

### N-3 (정보) legacy `approverGroups` 요청의 통과 조건이 재승인에서 바뀔 수 있다

`approverGroups=G, minimumApprovals=1`로 만든 단일 단계 요청은 `STEP_ORDER=1`·전원 `VIA_GROUP=G`이라
복원 시 "명확한 그룹 단계"로 판정되어 `required = G.isRequireAll() ? n : 1`로 재계산된다.
G가 `requireAll=true`면 원래 1명이면 됐던 단계가 **전원 승인으로 조여진다**.
등록 그룹 정책을 진실로 보는 의도된 동작일 수 있으나, 스펙에 명시가 없으므로 확정 필요.

### N-4 (정보) `saveApprovers:448`이 단계별 viaGroup을 재평탄화할 여지

행을 새로 만들 때 `approver.setViaGroup(existingViaGroups.get(actorKey))`를 쓰는데
`existingViaGroups`는 **actorKey 단위**(`:432`)라 같은 사람의 다른 단계 값이 last-wins로 섞인다.
현재는 생성 후 단계 구성이 바뀌지 않아 행이 재생성되지 않으므로 발현하지 않지만,
`saveApproverViaGroupsByStep`으로 애써 저장한 단계별 값을 무너뜨릴 수 있는 유일한 경로다.
F-3 근본 수정 시 `rowKey(stepOrder, actorKey)` 단위로 함께 바꿀 것.

### F-13 (경) qa-5a §7이 재검증 조건으로 요구한 복원 시나리오 테스트 3건이 없다

c9 테스트 수가 48 → 48로 그대로다. 재작업 스펙의 완료 기준은 "테스트 실행이 불가한 환경이면 손 추적"이라는
단서를 달았으나 이 환경은 `mvn ... test`가 정상 동작한다. F-3이 재작업 후에도 살아남은 것 자체가
**시나리오를 고정하는 테스트가 없기 때문**이다.

---

## 7. 재작업 지시 (우선순위)

### 1. F-3 근본 수정 — 단계별 viaGroup을 **쓰기 시점부터** 남긴다

읽기만 단계별로 바꾸는 것으로는 해결되지 않는다. 1세대 요청의 데이터 자체를 단계별로 만들어야 한다.

- `StepResolution`에 `Map<Integer, Map<String, String>> viaGroupsByStep`을 추가한다.
  `resolveStepSpec`이 토큰 순서 인덱스+1(= 도메인 `step.order()`)을 키로,
  GROUP 토큰이면 `resolved.viaGroups()`를, USER 토큰이면 `{value: null}`을 넣는다.
  **`putIfAbsent`로 단계 간에 섞지 말 것** — 단계마다 독립된 맵이다.
- `steps` 문자열 경로(`:276`)와 Flow-단계 경로(`:242`) 모두
  `saveApproverViaGroups` → `saveApproverViaGroupsByStep(resolution.viaGroupsByStep())`으로 교체한다.
- 평탄 `saveApproverViaGroups`는 단계가 하나뿐인 경로(최소 인원·단계 없는 Flow·legacy 폴백)에만 남긴다.
- `saveApprovers:432,448`의 `existingViaGroups`를 `rowKey(stepOrder, actorKey)` 키로 바꾼다(N-4).

수정 후 (iii) 재추적 기대값: `(2,alice).VIA_GROUP = null` →
`groupForWholeStep(step2)` = null → **`[alice]` 스냅샷** → 복원 결과 `group:leads;user:alice` ✓,
역순도 동일하게 동작(순서 의존성 소멸).

### 2. N-1 — `restoredSteps` 계산에 `blank(flowId)` 조건 추가(또는 viaGroups 저장 분기 재설계)

### 3. F-13 — 복원 시나리오를 c9 테스트로 고정

`restoreSteps`/`groupForWholeStep`이 `activeObjects`에 직접 묶여 있어 그대로는 테스트하기 어렵다.
**순수 판정부만 분리**해 테스트한다 — 예:
`static String groupForWholeStep(List<String> approverKeys, Map<String,String> viaGroups)`를
package-private static으로 두고 `ApprovalStepSpecTest` 옆에 다음 4건을 넣는다.

| 입력 | 기대 |
|---|---|
| `[a,b,c]` / 전부 null | `null` (스냅샷) |
| `[carol,dave]` / 전부 `leads` | `"leads"` (재확장) |
| `[alice]` / `{alice:null}` | `null` (개인 단계 보존) |
| `[alice,bob]` / `{alice:null, bob:leads}` | `null` (혼합 → 스냅샷) |

추가로 `resolveStepSpec("group:leads;user:alice")`의 `viaGroupsByStep`이
`{1:{alice:leads,bob:leads}, 2:{alice:null}}`임을 단언하는 테스트 1건 — 이것이 F-3의 회귀 방지선이다.

### 4. N-2 — 죽은 변수 `effectiveSteps` 제거

### 5. 선택 정리

- F-2 잔여: `isLegacyMinimum`을 `repository.hasLegacyApproverRows(UUID)`로 옮겨 REST의 AO 직접 조회 제거.
- N-3: legacy `approverGroups` 요청의 required 재계산 정책을 스펙에 명문화.
- F-11: `fromRequestId` + `approverKeys` 동시 전달 규칙을 스펙에 명시하거나 400으로 차단.

---

## 8. 재검증 조건

1. `mvn -B -pl approval-confluence9 -am test` 전부 green **이면서 c9 테스트 수가 증가**할 것.
2. `resolveStepSpec("group:leads;user:alice")`(alice ∈ leads)로 만든 요청의
   `(STEP_ORDER=2, ACTOR_KEY=alice)` 행 `VIA_GROUP`이 **null**임을 테스트로 고정.
3. §4 (iii) 재추적이 `group:leads;user:alice`로 복원될 것.
4. `flowId` + `fromRequestId` 동시 전달 시 Flow의 viaGroups가 저장될 것.
