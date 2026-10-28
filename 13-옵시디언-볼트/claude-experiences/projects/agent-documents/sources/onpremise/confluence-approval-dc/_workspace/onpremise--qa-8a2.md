# QA 8a — 2차 검증 (재작업 R1~R6 확인, 2026-08-13)

대상: `_workspace/spec-8a2-rework.md` (1차 QA `_workspace/qa-8a.md`의 재작업 지시문)
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **PASS**

| 심각도 | 1차 | 2차 |
|--------|-----|-----|
| 치명 | 1 | **0** |
| 중대 | 3 | **0** |
| 경미 | 5 | 6 (신규 3 · 미해소 0 · 재발 1 · 잔여 2) |
| 알려진 미완 | 1 | **0** |

1차의 치명 1건·중대 3건·미완 1건이 **전부 해소**됐고, 1차 PASS 항목의 회귀도 없다.
경미 6건은 배포를 막지 않는다 — 8c 또는 잔여 항목으로 넘길 것을 권고한다.
다만 그중 2건(N1 Javadoc, N4 R1 테스트 강도)은 **1차 지적을 절반만 고친 것**이라 기록해 둔다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 106, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS
```

**테스트 카운트 100 → 106 (+6) 확인** — Codex 보고와 일치.
- `rest.ApprovalRestResourcePinTest` **5건** (신규, 0.513s — PBKDF2 실제 수행)
- `rest.ApprovalRestResourceSettingsTest` 1 → **2건** (+1, R1 회귀 테스트)
- 나머지 파일 카운트는 1차와 동일 (약화·삭제 없음)

패키징은 여전히 미검증(인스턴스 실행 중, 스펙 금지 사항).

## 재포매팅·압축 재검사 (PASS)

`git diff --stat`: **347 insertions(+), 13 deletions(-)** / 10개 파일 (1차 273/11 → 순증).
삭제 13줄 = 1차의 11줄 + 2줄(`repository.find(id)` → `decisionRepository.find(id)`,
`approvalSettings.read().statusLabel(...)` → `current.statusLabel(...)`). 전부 1:1 교체 대응.
한 줄 압축·주석 삭제·무관한 줄 변경 없음.

---

# R1~R6 항목별 실측

## R1 (치명 해소) POST /settings 400 회귀 — **PASS**

**production 수정 확인** `ApprovalRestResource.java`
- `:771-772` 검증이 blank 허용으로 변경:
  ```java
  || (!blank(signatureEnabled) && !validBoolean(signatureEnabled))
  || (!blank(signaturePinRequired) && !validBoolean(signaturePinRequired))
  ```
  → 설정 화면 폼(`ApprovalSettingsServlet.java:294-309`, 여전히 두 키를 안 보냄)이 보낸
  요청은 이제 검증을 통과한다. 잘못된 값(`"maybe"`)은 여전히 400 — 검증이 약화되지 않았다.
- `:781` `ApprovalSettings.Values current = approvalSettings.read();` 1회 선언,
  `:793-794` `blank(x) ? current.signatureEnabled() : Boolean.parseBoolean(x.trim())`,
  `:800` `current.statusLabel("CANCELLED")`로 중복 `read()` 제거 — 지시대로.

**회귀 테스트 확인** `ApprovalRestResourceSettingsTest:52-77`
`full_overload_preserves_blank_signature_settings_and_saves_explicit_values`가
**17-인자 full 오버로드를 직접 호출**한다(축약 오버로드 우회 확인 ✓).
- null 2개 → **200** + 저장값 `"false"`
- `"true","true"` → **200** + 저장값 `"true"`
치명 증상(항상 400)은 이 테스트가 확실히 막는다.
→ 다만 "이전 값 유지" 자체의 검증 강도는 약하다. **N4** 참조.

## R2 (중대 해소) decisions[] 서명 N+1 — **PASS**

**배치 조회 도입 확인** `ApprovalRestResource.java:1529-1542`
```java
Map<String, String> userKeyCache = settings.signatureEnabled() ? new HashMap<>() : Map.of();
Set<String> registeredSignatureUserKeys = Set.of();
if (settings.signatureEnabled()) {
    for (ApprovalRequest request : requests) {
        for (String actorKey : request.eligibleApproverKeys()) {
            userKeyCache.computeIfAbsent(actorKey, this::resolveUserKey);   // actorKey당 1회
        }
    }
    ... registeredSignatureUserKeys = signatureStore.findRegisteredKeys(userKeys);  // AO 1회
}
```
`requestObject:1668-1675`는 이제 캐시/Set 조회만 한다 — 루프 안의 `resolveUserKey`·`signatureStore.find` 제거 확인.
**복잡도: O(요청수 × 승인자수) AO 쿼리 → O(1) AO 쿼리 + O(distinct actorKey) userAccessor 조회.**

**off일 때 사전 조회 0회 — 확인**
`if (settings.signatureEnabled())` 하나가 캐시 구축·`findRegisteredKeys`를 **모두** 감싼다.
off면 `userKeyCache = Map.of()`, `registeredSignatureUserKeys = Set.of()`로 시작해
`resolveUserKey`도 `signatureStore.*`도 **한 번도 호출되지 않는다**.
`requestObject`의 `if (signatureEnabled)` 분기도 미실행이라 `decisions[]` 키 집합 불변.
PIN 쪽은 `ApprovalRestResourcePinTest:57-64`가 `pinStore.findCount == 0`으로 **행위 검증**까지 한다.

**저장소 신규 메서드** `ActiveObjectsApprovalSignatureStore.java:46-59`
- `Query.select("USER_KEY")` 프로젝션 — CLOB `DATA`를 안 읽는다(등록 여부만 필요). 지시대로.
- `inClause("USER_KEY", keys.size())` + `keys.toArray()` — 기존 `ApprovalRestResource.inClause` 관례와 동일 형태.
- **빈 컬렉션 가드 있음**(`:49-51` `if (keys.isEmpty()) return Set.of();`).
  이게 없었으면 `/mine` 결과 0건 + signatureEnabled=on에서 `USER_KEY IN ()` SQL 오류로 500이 났다.
  실제로 `ApprovalRestResourcePinTest`의 성공 경로가 이 코드를 타고 통과한다(AO 프록시가 빈 배열 반환).
- `LinkedHashSet`으로 중복 제거 후 쿼리 — 파라미터 수 폭증 방지.

## R3 (중대 해소) imageUrl actorKey URL 인코딩 — **PASS**

`ApprovalRestResource.java:1771-1774`
```java
return "/rest/approval/1.0/approvals/" + requestId
        + "/signature-image?actorKey=" + URLEncoder.encode(actorKey, StandardCharsets.UTF_8);
```
`URLEncoder`가 `+`→`%2B`, 공백→`+`, `&`→`%26`, 한글→UTF-8 percent-encoding으로 처리한다.
쿼리 스트링에서 `+`는 서블릿 컨테이너가 공백으로 디코드하므로 **공백 처리도 정확**하다.
`requestId`는 `UUID.toString()`이라 인코딩 불필요 — 올바른 판단.

## R4 (중대 해소) contextPath / UriInfo 제거 — **PASS**

전수 grep 결과 `ApprovalRestResource.java`에 `UriInfo`, `javax.ws.rs.core.Context`, `@Context`,
`contextPath` **0건**. 필드·메서드·import 전부 제거 확인.
`imageUrl`은 컨텍스트 패스 없는 상대 경로(`/rest/approval/1.0/approvals/...`)만 담는다 —
`root.dataset.contextPath`를 클라이언트가 붙이는 저장소 관례로 복귀했고,
싱글턴 `@Context` 주입 실패 시 조용히 404가 되던 위험이 제거됐다.

> **8c 스펙에 반드시 넣을 것** (Codex가 "8c 스펙 부재"로 미반영이라 보고한 항목):
> `decisions[].signature.imageUrl`은 **상대 경로**이므로 소비 측에서
> `root.dataset.contextPath`를 앞에 붙여 `<img src>`에 사용한다.

## R5 (미완 해소) `ApprovalRestResourcePinTest` — **PASS, 형식적이지 않음**

신규 파일 `src/test/java/.../rest/ApprovalRestResourcePinTest.java` (5 테스트, 전부 통과).
**decide() 분기를 실제로 타는지 실행 경로를 추적해 확인했다:**

`resource.approve(id, "alice", pin)` → `decide(id, "alice", true, null, pin)` →
1. `decisionRepository.find(id)` → `InMemoryRequestRepository`에 저장된 실제 `ApprovalRequest` 반환 ✓
2. `denyPage(100L, VIEW)` → `pageManager` 프록시가 `new Page()` 반환, `permissionManager` 프록시가
   `hasPermission`에 true 반환 → 통과 ✓
3. `denyCurrent("alice")` → 인증 사용자 프록시의 `getKey()`가 `new UserKey("alice")` →
   `userKey(u)="alice"`와 일치 → 통과 ✓
4. **`settings.signatureEnabled() && settings.signaturePinRequired()` 분기 도달** ✓
5. `pinService.verify("alice", pin, now)` — `register`도 같은 `"alice"` 키를 쓰므로 키 정합 ✓

| 테스트 | 케이스 | 검증 내용 | 판정 |
|--------|--------|-----------|------|
| `off_approves_without_pin_and_does_not_look_up_pin` | off + pin=null | 200 **AND `pinStore.findCount == 0`** | 행위 검증 ✓ |
| `enabled_without_registered_pin_returns_not_set` | on + 미등록 | 403 + 본문 `PIN_NOT_SET:` 시작 | ✓ |
| `enabled_with_invalid_pin_returns_invalid` | on + 오답 | 403 + 본문 `PIN_INVALID:` 시작 | ✓ |
| `enabled_with_valid_pin_approves` | on + 정답 | 200 | ✓ |
| `five_invalid_attempts_return_locked` | 오답 4회 후 5회째 | 409 + 본문 `PIN_LOCKED:` 시작 | ✓ |

**형식적 검증이 아니라고 판단한 근거**
- off 케이스가 상태코드만이 아니라 **`pinStore.findCount == 0`을 assert** — "off면 PIN을 조회조차 하지
  않는다"를 행위로 못 박았다. 존재 확인이 아니라 부작용 부재 검증.
- 5회 잠금 케이스가 **REST 엔드포인트를 5번 실제 호출**해 누적 상태를 만든다
  (서비스 단위 테스트로 우회하지 않음).
- 성공 경로(`enabled_with_valid_pin_approves`)는 실제 도메인 `ApprovalWorkflowService.approve`를 거쳐
  `requestJson` → `requestsJson`까지 완주하므로, **R2의 서명 배치 경로(signatureEnabled=true)도
  덤으로 실행된다**(`resolveUserKey` → `findRegisteredKeys(빈 결과)` → `{"type":"auto"}`).
  즉 R2 코드가 NPE·SQL 오류 없이 도는 것이 이 테스트로 간접 보증된다.
- 스텁이 전부 JDK `Proxy` 기반이라 mock 프레임워크 도입 없이 기존 테스트 관례(`ApprovalRestResourceSettingsTest`)를 따랐다.

## R6 (경미 5건) — **4/5 PASS, 1건 불완전**

| 항목 | 위치 | 결과 |
|------|------|------|
| `SignatureRef` 위치 이동 | `ApprovalMarkup.java:160-162` | **불완전 → N1** |
| 매직바이트 + 최소 크기 | `ApprovalRestResource.java:889-899` | PASS (메시지는 N2) |
| `nosniff` 헤더 | `:872-873`, `:993-994` | **PASS** — 두 이미지 엔드포인트 모두 `.header("X-Content-Type-Options", "nosniff")` |
| `PBEKeySpec.clearPassword()` | `ApprovalPinService.java:91-101` | **PASS** — `spec`을 try 밖에서 생성하고 `finally { spec.clearPassword(); }`. 예외 경로에서도 확실히 지워진다. |
| `resetPin` 401 우선 | `ApprovalRestResource.java:919-921` | **PASS** — `AuthenticatedUserThreadLocal.get() == null → 401`을 `isAdministrator()` 앞에 배치. 다른 신규 엔드포인트 5개와 일관. |

매직바이트 검증 실측 (`:889-899`): PNG `89 50 4E 47`, JPEG `FF D8 FF`, 하한 8바이트, 상한 51,200바이트.
1차에 지적한 `data="="`(0바이트) 통과 구멍은 `decoded.length < 8`로 막혔다.

---

# 신규·잔여 경미 6건

## N1. (재발) `detailDialog` Javadoc이 여전히 고아 — Javadoc 블록 2개 연속

`ApprovalMarkup.java:160-163`
```java
    /** 상태 상세 모달. {@code nameResolver}는 actorKey → 표시 이름이며, 캐시는 호출측 책임이다. */
    /** {@code signatureResolver}는 actorKey의 서명 참조를 제공한다. */
    public static void detailDialog(
```
record는 Javadoc 위로 올라갔으나(지시 이행 ✓), `signatureResolver` 설명을 **기존 블록 안에 한 줄로
추가하는 대신 새 Javadoc 블록을 하나 더 만들었다**. Java에서 연속된 `/** */` 중
메서드에 결합되는 것은 **마지막 하나뿐**이므로, `nameResolver` 설명은 1차와 마찬가지로 여전히
`detailDialog`의 문서가 아니다(이번엔 dangling comment). `javadoc` 실행 시 첫 블록은 사라진다.

**수정** — 한 블록으로 병합:
```java
    /**
     * 상태 상세 모달. {@code nameResolver}는 actorKey → 표시 이름이며, 캐시는 호출측 책임이다.
     * {@code signatureResolver}는 actorKey의 서명 참조를 제공한다(null이면 서명 기능 off).
     */
```

## N2. 형식·크기하한 위반에 "50KB 이하여야 합니다" 오답 메시지

`ApprovalRestResource.java:889-899`. `decoded.length < 8`(너무 작음)과 매직바이트 불일치(형식 오류)가
크기 초과와 **같은 조건문**에 묶여 있어, PNG가 아닌 파일을 올린 사용자에게 "서명 이미지는 50KB
이하여야 합니다."라고 답한다. 8c의 "내 서명" 화면에서 사용자가 원인을 오해한다.
(재작업 지시문의 "기존 400 평문 메시지 재사용"이 모호했던 탓 — 두 메시지 중 잘못된 쪽을 골랐다.)
**수정**: 크기 조건과 형식 조건을 분리해 형식 위반은 "서명 이미지 형식이 올바르지 않습니다."를 반환.

## N3. 서명 캐시 사전 조회가 APPROVE 결정 없는 승인자까지 포함

`ApprovalRestResource.java:1533-1537`. 사전 루프가 `eligibleApproverKeys()` **전부**에 대해
`resolveUserKey`(userAccessor 최대 2회)를 호출하지만, 실제 렌더 조건은
`d != null && d.type() == APPROVE`(`:1669`)뿐이다.
→ `/mine` **내차례** 탭처럼 전부 PENDING이라 승인 결정이 0건인 목록에서도,
signatureEnabled=on이면 distinct 승인자 수만큼 userAccessor 조회 + AO 쿼리 1회가 발생한다.
(1차의 N+1 대비 여전히 압도적으로 개선됐고 off면 0회이므로 경미.)
**수정**: 사전 루프의 `computeIfAbsent`를 렌더 조건과 동일하게 게이트.
```java
ApprovalDecision d = request.decisions().get(actorKey);
if (d != null && d.type() == ApprovalDecisionType.APPROVE) {
    userKeyCache.computeIfAbsent(actorKey, this::resolveUserKey);
}
```

## N4. R1 회귀 테스트가 "이전 값 유지"를 실제로 검증하지 않는다

`ApprovalRestResourceSettingsTest:60-70`. null 호출을 **빈 PluginSettings**(기본값 false) 위에서만
수행하고 `"false"`를 assert한다. 따라서 production 코드가
`blank(x) ? current.signatureEnabled() : ...` 대신 **`blank(x) ? false : ...`로 하드코딩돼 있어도
이 테스트는 통과한다.** 그 버그는 "관리자가 서명을 켠 뒤 다른 설정을 저장하면 서명이 조용히 꺼진다"로
나타나며, 8c에서 체크박스가 붙기 전까지 실제로 발생 가능하다.
**수정**: 두 호출의 순서를 뒤집어 보존을 검증 — 먼저 `"true","true"`로 저장 → 그 다음 null 2개로 호출
→ 여전히 `"true"`인지 assert.

## N5. R5 테스트에 `(signatureEnabled=true, signaturePinRequired=false)` 조합이 없다

설계 D1의 "`signaturePinRequired`는 `signatureEnabled=true`일 때만 유효" 계층에서, on/off 조합 4개 중
`(false,false)`와 `(true,true)`만 검증된다. `(true,false)` = 서명은 켜고 PIN은 안 쓰는
**가장 흔한 운용 조합**에서 PIN을 요구하지 않는다는 보증이 없다.
**수정**: `fixture(true, false)`로 pin=null 승인이 200 + `pinStore.findCount == 0`인 케이스 1건 추가.
같은 김에 응답 JSON에 `"signature"` 키가 on일 때 존재(`"type":"auto"`)하고 off일 때 부재하는지
assert하면 R2 경로의 계약까지 고정된다.

## N6. `decisionRepository` / `repository` 이원화

`ApprovalRestResource.java:102, 118, 141, 165, 169`. 테스트에서 in-memory 저장소를 주입하기 위해
도메인 포트 `ApprovalRequestRepository` 필드를 추가했다. 운영 생성자에서 `decisionRepository = repository`
(**동일 객체**)이므로 **동작 차이는 없다** — 확인 완료.
다만 `decide()`만 `decisionRepository.find()`를 쓰고 나머지 4곳(`:255, :373, :976, :1161`)은
`repository.find()`를 써서 읽는 사람이 차이를 오해할 수 있다.
테스트 seam으로서는 정당한 선택(구상 클래스 `ActiveObjectsApprovalRequestRepository`는 대체 불가)이므로
**필드 옆에 의도 주석 1줄**만 권고: `// 테스트에서 in-memory 저장소를 주입하기 위한 포트. 운영에서는 repository와 동일 객체.`

---

# 1차 PASS 항목 회귀 스팟체크 — 되돌림 없음

| 1차 PASS 항목 | 2차 재확인 | 결과 |
|---------------|-----------|------|
| 옵션 off 무영향 (decide 경로) | `:1227` `signatureEnabled && signaturePinRequired` 게이트 유지, off면 `pinService` 미호출 | 유지 ✓ (+ `PinTest`가 findCount==0으로 검증) |
| 옵션 off 무영향 (decisions[] 키 집합) | `:1668` `if (signatureEnabled)` 유지, off면 `signature` 키 부재 | 유지 ✓ |
| 옵션 off 무영향 (POST /settings) | **1차 치명 → 해소** | 개선 ✓ |
| PIN `@FormParam` 3곳 | `approve:1135-1140`, `reject:1143-1150`, `registerPin:920` | 유지 ✓ |
| PIN 원문 로그·예외·URL 미유출 | `pin/` 패키지 `LOGGER` 0건, 예외 메시지 고정 문자열, URL은 actorKey만(인코딩됨) | 유지 ✓ (+ `clearPassword`로 힙 잔존까지 개선) |
| PBKDF2 210k / 16B SecureRandom / `MessageDigest.isEqual` | `ApprovalPinService.java:17-20, 43-44, 62-64` 무변경 | 유지 ✓ |
| 잠금 로직 + `ApprovalPinServiceTest` 3건 | 파일 무변경(`hash()` 외), 3건 전부 통과 | 유지 ✓ |
| AO `@Unique` DBParam create (upsert 포함) | 두 스토어 `save()` 무변경 (`:36-38`, Pin `:28-30`) | 유지 ✓ |
| `<ao>` 엔티티 2종 등록 | `atlassian-plugin.xml:21-22` 무변경 | 유지 ✓ |
| decide() PIN 검증 위치 (denyCurrent 직후·workflowService 이전) | `:1224` 검증 → `:1244` workflow | 유지 ✓ |
| `settings.read()` 중복 없음 | `:1227` 1회 + `:1251` 재사용 | 유지 ✓ |
| 오류 코드 403/403/409 + 접두 | 문구 무변경 | 유지 ✓ (+ PinTest가 접두를 assert) |
| mime 화이트리스트 (SVG 거부) | `:885` 정확 일치 비교 무변경 | 유지 ✓ (+ 매직바이트 2중화) |
| 이미지 서빙 권한 체인 404/403 | `:970-985` 무변경 | 유지 ✓ (+ nosniff) |
| `Cache-Control: private, max-age=300` | 양쪽 엔드포인트 유지 | 유지 ✓ |
| `resolveUserKey` 조회 순서 = `displayName` | `:1751-1769` 무변경 | 유지 ✓ |
| `detailDialog` 본문 렌더 무변경 (8c 몫) | diff에 시그니처·Javadoc만 | 유지 ✓ |
| 호출부 2곳 + 테스트 null 전달 | `ApprovalPagePanel:158`, `ApprovalRegionMacro:183`, `ApprovalMarkupCancelTest:63` | 유지 ✓ |
| JAX-RS 경로 충돌 없음 | 경로 셋 무변경 | 유지 ✓ |
| 테스트 약화 없음 | `SettingsCacheTest` 16 유지, 기존 파일 카운트 전부 동일 | 유지 ✓ |

---

# 결론 및 후속 권고

**배치 8a는 PASS.** 커밋 및 8b 착수 가능.

후속 처리 권고:
1. **8c 스펙 작성 시 필수 반영** — `decisions[].signature.imageUrl`은 상대 경로이므로
   `root.dataset.contextPath`를 붙여 사용할 것 (R4의 남은 절반, Codex가 정직하게 미반영 보고한 항목).
2. **8c 배치에 끼워 넣기 좋은 경미 3건** — N1(Javadoc 병합), N2(형식 오류 메시지 분리),
   N5(`(true,false)` 케이스 + signature JSON 키 assert). 어차피 같은 파일을 건드린다.
3. **잔여로 기록** — N3(사전 캐시 게이트), N4(보존 테스트 강화), N6(주석 1줄).
   전부 1줄~5줄 수정이라 `docs/backlog.md`의 잡항목으로 묶어도 무방하다.
4. **실기동 확인 사항** (자동 게이트로는 불가) — QuickReload 재설치 후
   `APR_SIGN`·`APR_PIN` 테이블 생성 여부, 관리자 설정 화면 저장이 200으로 돌아왔는지(치명 C1 실증),
   `signatureEnabled=off` 상태에서 패널·매크로·업무함이 배치 전과 동일한지.
