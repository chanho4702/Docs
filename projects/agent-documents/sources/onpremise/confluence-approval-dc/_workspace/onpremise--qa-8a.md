# QA 8a — 전자서명·PIN 백엔드 검증 (2026-08-13)

대상 스펙: `_workspace/spec-8a-signature-backend.md` / 설계: `_workspace/design-batch8.md` (D1~D4, D10 서버측)
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | 1 |
| 중대 | 3 |
| 경미 | 5 |
| 알려진 미완 | 1 |

치명 1건은 **옵션 off(기본값) 상태에서도 관리자 설정 화면 저장이 전면 파손**되는 회귀다.
즉 "옵션 off 무영향" 요구가 깨졌다. 게이트(테스트 100건 그린)로는 구조적으로 잡히지 않는다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test   → Tests run: 100, Failures: 0, Errors: 0  / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile   → BUILD SUCCESS
```
신규 `ApprovalPinServiceTest` 3건 포함(0.713s — PBKDF2 실제 수행 확인). 패키징은 미검증(인스턴스 실행 중, 스펙 금지 사항).

## 재포매팅·압축 검사 (PASS)

`git diff --stat`: **273 insertions(+), 11 deletions(-)** / 10개 파일.
삭제 11줄은 전부 시그니처 교체분(`detailDialog` 마지막 인자 3곳, `decide` 선언·호출 3곳,
`rejectionReasonRequired` 인자 1줄, 캐시 카운트 1줄)으로 1:1 대응 확인. 한 줄 압축·주석 삭제 없음.
`ApprovalRestResource.java`·`ApprovalMarkup.java` 기존 주석 전량 보존 확인.

---

# 치명

## C1. `POST /rest/approval/1.0/approvals/settings` 가 항상 400 — 관리자 설정 저장 전면 파손

**파일:줄**
- `approval-confluence9/.../rest/ApprovalRestResource.java:721-722` (신규 `@QueryParam` 2개)
- 같은 파일 `:745-746` (`|| !validBoolean(signatureEnabled) || !validBoolean(signaturePinRequired)`)
- 같은 파일 `:1863-1866` (`validBoolean`)
- `approval-confluence9/.../servlet/ApprovalSettingsServlet.java:294-310` (폼 제출 파라미터 목록)

**문제**
`validBoolean`은 null을 무효로 판정한다.

```java
private static boolean validBoolean(String value) {
    return value != null && ("true".equalsIgnoreCase(...) || "false".equalsIgnoreCase(...));
}
```

그런데 유일한 호출자인 관리자 설정 화면의 `settingsForm.onsubmit`(`ApprovalSettingsServlet.java:294-309`)은
`signatureEnabled`/`signaturePinRequired`를 **보내지 않는다** (설정 화면 체크박스는 8c 몫).
따라서 두 값은 항상 null → `!validBoolean(null)` → `Response.status(BAD_REQUEST)` 로 즉시 반환.

**실측 근거**
1. `ApprovalSettingsServlet.java:294-309` URLSearchParams 키 14개를 전수 확인 — 신규 2키 없음.
   (`signature`로 이 파일 전체 grep → 0건.)
2. `ApprovalRestResource.java:1864` `value != null &&` — null 즉시 false.
3. 화면 증상: `ApprovalSettingsServlet.java:311` `if (!result.ok) { say(settingsMessage, "입력값을 확인해 주세요.", "bad"); return; }`
   → 관리자가 무엇을 고쳐도 저장 불가, 원인 표시 없음.
4. `signatureEnabled` 자체를 켤 방법이 없으므로 8c에서 설정 화면을 고치기 전까지 8a 기능 전체가 도달 불가.

**게이트가 못 잡은 이유 (테스트 신뢰성 문제)**
`ApprovalRestResourceSettingsTest:43`은 8-인자 축약 오버로드
`resource.updateSettings("3","10","24","false","대기","승인","반려","만료")`를 호출한다.
그 오버로드(`ApprovalRestResource.java:802-829`)가 `String.valueOf(current.signatureEnabled())`로
**항상 non-null**을 채워 full 메서드에 넘기므로, null 경로는 어떤 테스트도 실행하지 않는다.
Codex가 추가한 assert 2줄(`"signatureEnabled":false` 포함 확인)도 이 non-null 경로만 본다.

**스펙 위반**
스펙 변경 1: *"null이면 기존 관례대로 처리 — 기존 boolean 파라미터(예: notificationsEnabled)가 null일 때
어떻게 하는지 :689-748에서 확인하고 동일하게."*
Codex는 "기존 boolean과 똑같이 null 거부"로 읽었으나, 기존 boolean들은 **폼이 항상 보내는 값**이라
null이 올 수 없다. 이 파일에서 "폼이 아직 안 보낼 수 있는 신규 파라미터"의 실제 관례는
같은 메서드 안의 `cancelledLabel`(`:770-772`)이다 — **blank면 현재 저장값 유지**.

**제안 수정** (`ApprovalRestResource.java:745-746`, `:753-764`)
```java
// 검증 블록: blank면 통과시킨다 (설정 화면이 아직 보내지 않는 신규 키 — cancelledLabel 관례)
|| (!blank(signatureEnabled) && !validBoolean(signatureEnabled))
|| (!blank(signaturePinRequired) && !validBoolean(signaturePinRequired))

// Values 생성: blank면 현재 값 유지
ApprovalSettings.Values current = approvalSettings.read();
...
blank(signatureEnabled) ? current.signatureEnabled() : Boolean.parseBoolean(signatureEnabled.trim()),
blank(signaturePinRequired) ? current.signaturePinRequired() : Boolean.parseBoolean(signaturePinRequired.trim()),
```
(`:771` 에서 이미 `approvalSettings.read()`를 호출하므로 지역변수 `current` 하나로 합쳐 중복 read 제거.)

**추가 회귀 테스트 필수** — `ApprovalRestResourceSettingsTest`에
`signatureEnabled=null, signaturePinRequired=null`로 **full 오버로드를 직접 호출**해 200 + 기존 값 유지를
검증하는 케이스를 넣어라. 축약 오버로드로는 이 회귀를 영원히 못 잡는다.

---

# 중대

## M1. `decisions[]` 서명 해석이 N+1 — 배치 7a가 제거한 패턴의 재도입

**파일:줄** `ApprovalRestResource.java:1613-1621` (+ `:1696-1715` `resolveUserKey`)

```java
if (signatureEnabled) {
    if (d != null && d.type() == ApprovalDecisionType.APPROVE) {
        String userKey = resolveUserKey(key);                       // userAccessor 최대 2회
        Optional<...> signature = signatureStore.find(userKey ...); // AO 쿼리 1회
```

**문제**
`requestObject`는 요청 1건 × 승인자 1명마다 호출된다. `/mine`은 `normalizeLimit` 상한이 200(`:1285`)이고
`requestsJson`이 슬라이스 전체를 직렬화하므로, 승인자 3명·승인 완료 상태 기준
**최대 600회 `userAccessor` 조회 + 600회 AO SELECT**가 응답 1건에 발생한다.
같은 사용자가 여러 요청에 반복 등장해도 캐시가 없다 — 바로 옆의 `displayName`은
`Map<String,String> names` 요청 단위 캐시(`:1670-1674`, `:1488`)를 쓰는데 서명 경로만 캐시가 없다.
배치 7a에서 "저장소 배치 하이드레이션"으로 걷어낸 구조가 그대로 되살아난다.

**영향 범위** `signatureEnabled=on`일 때만. off면 분기 자체가 실행되지 않으므로 현행 성능 동일.

**제안 수정**
`requestsJson`(`:1488` 부근)에서 `names`와 같은 자리에 요청 단위 캐시 2개를 만들어 `requestObject`에 전달:
`Map<String,String> userKeyCache`(actorKey→userKey), `Map<String,Boolean> signaturePresence`(userKey→등록 여부).
`resolveUserKey`/`signatureStore.find`를 `computeIfAbsent`로 감싸면 사용자 수만큼으로 줄어든다.
가능하면 `ApprovalSignatureStore`에 `Set<String> findRegisteredKeys(Collection<String> userKeys)`
(IN 절 1회, `inClause` `:1882` 재사용)를 추가해 AO 왕복을 1회로 접어라 — 서명 **본문**은 필요 없고
"등록 여부"만 있으면 `type: image|auto` 판정이 끝난다.

## M2. `signatureImageUrl`이 actorKey를 URL 인코딩하지 않는다

**파일:줄** `ApprovalRestResource.java:1717-1720`

```java
return contextPath() + "/rest/approval/1.0/approvals/" + requestId
        + "/signature-image?actorKey=" + actorKey;
```

**문제**
`actorKey`는 userKey(hex)일 수도, **username일 수도** 있다 — `denyCurrent`(`:1766`)가
`key.trim().equalsIgnoreCase(u.getName())`를 허용하고, 실제로 승인자 키에 username이 혼재한다는 사실은
설계 D3(`design-batch8.md:38-40`)에 명시돼 있다. Confluence/LDAP username에는 `+`, 공백, `&`, `#`,
한글이 들어갈 수 있다.

**실패 시나리오**
- username `kim+lee` → 쿼리스트링 디코드 시 `kim lee` → `decisions().containsKey("kim lee")` false → **403**
- username `a&b=c` → `actorKey=a` 로 잘림 → **403**
- 한글 username → 인코딩 미지정으로 브라우저·컨테이너 인코딩에 따라 깨짐
어느 경우도 예외 없이 조용히 도장이 안 뜨는(또는 403) 형태라 8c 화면 테스트에서도 특정 계정에서만 재현된다.

**제안 수정**
```java
+ "/signature-image?actorKey="
+ java.net.URLEncoder.encode(actorKey, java.nio.charset.StandardCharsets.UTF_8);
```
(`requestId`는 UUID 문자열이라 인코딩 불필요.)

## M3. `contextPath()`가 `@Context UriInfo` 필드 주입에 의존 — 실패 시 조용히 잘못된 URL

**파일:줄** `ApprovalRestResource.java:110-111` (`@Context private UriInfo uriInfo;`), `:1722-1729`

**문제**
1. 이 리소스는 `@Named` 싱글턴이다. 요청 스코프 타입인 `UriInfo`를 **싱글턴의 필드**에 주입하는 것은
   Jersey 프록시 지원 여부에 달린 동작이며, 이 저장소에 선례가 없다.
2. 주입이 안 되면 `uriInfo == null` → `contextPath()`가 `""` 반환 → **예외 없이** `/rest/approval/...`
   (컨텍스트 패스 누락) URL을 내보낸다. Confluence가 루트(`/`)에 배포된 개발 인스턴스에서는
   **정상처럼 보이고**, `/confluence` 같은 컨텍스트 패스 배포에서만 404가 난다.
3. 코드베이스의 실제 관례와 어긋난다 — 이 저장소는 REST가 절대 절대경로를 만들지 않고
   **클라이언트가 `root.dataset.contextPath`를 붙인다**:
   `ApprovalInboxServlet.java:331`, `:431`, `:682`, `ApprovalSettingsServlet.java:256`, `NavMarkup.java:181`.
   (`grep -rn "contextPath" --include=*.java` 전수 확인 — 서버측에서 URL을 조립하는 곳은 이번 신규 코드가 유일.)
   또한 `ApprovalRestResourceSettingsTest` 같은 단위 테스트는 `new ApprovalRestResource(...)`로 만들어
   `uriInfo`가 항상 null이므로, 테스트에서는 이 경로가 결코 검증되지 않는다.

**제안 수정 (택1, 2안 권장)**
1. `@Context UriInfo`를 유지하되 실기동 검증 필수 + null일 때 WARN 로그 1회.
2. **(권장)** JSON에는 컨텍스트 패스 없는 상대 경로만 담고
   (`"/rest/approval/1.0/approvals/{id}/signature-image?actorKey=..."`),
   8c의 JS/서버 렌더에서 `root.dataset.contextPath`를 붙인다 — 기존 관례와 동일해지고
   `@Context`/`UriInfo` 의존과 싱글턴 주입 리스크가 함께 사라진다.
   `import javax.ws.rs.core.Context/UriInfo`도 제거 가능.

---

# 경미

## m1. `SignatureRef` record가 `detailDialog`의 Javadoc을 가로챘다
`ApprovalMarkup.java:160-162`. record가 Javadoc 주석과 메서드 선언 **사이**에 삽입돼,
`/** 상태 상세 모달. {@code nameResolver}는 actorKey → 표시 이름이며, 캐시는 호출측 책임이다. */`가
이제 `SignatureRef`를 설명한다. `detailDialog`는 문서 없는 메서드가 됐다.
"수정 지점 외의 줄을 건드리지 마라" 위반. → record를 Javadoc **위**로 옮기고, 8c에서 쓸
`signatureResolver` 설명 1줄을 기존 Javadoc에 덧붙여라.

## m2. 서명 최소 크기·매직바이트 미검증 + `nosniff` 없음
`ApprovalRestResource.java:866-887`, `:848-863`, `:931-960`.
- `data="="` 는 정규식 `[A-Za-z0-9+/=\s]+` 통과 → `getMimeDecoder().decode` 0바이트 → `0 <= 51_200` 통과
  → **빈 서명이 저장**되고 이후 `Response.ok(new byte[0], "image/png")`가 서빙된다.
- mime과 실제 바이트의 일치를 검증하지 않는다. `image/png`로 선언하고 SVG/HTML 바이트를 저장 가능.
  응답 Content-Type이 `image/png`라 브라우저가 SVG로 실행하지는 않지만,
  `X-Content-Type-Options: nosniff` 헤더가 없어 방어가 한 겹뿐이다.
→ 디코드 길이 하한(예: 8바이트) + PNG `89 50 4E 47` / JPEG `FF D8 FF` 매직바이트 검사
  + 두 이미지 엔드포인트에 `.header("X-Content-Type-Options", "nosniff")` 추가 권고.

## m3. `PBEKeySpec.clearPassword()` 미호출
`pin/ApprovalPinService.java:93-95`. PIN 사본(char[])이 GC 전까지 힙에 남는다.
`try { ... } finally { ((PBEKeySpec) spec).clearPassword(); }` 권고.
(원문 로그/예외 유출은 없음 — 아래 PASS 항목 참조.)

## m4. `decide()`가 approve 경로에서도 `approvalSettings.read()`를 호출하게 됐다
`ApprovalRestResource.java:1190`. 기존에는 reject 인자로만(`approvalSettings.read().rejectionReasonRequired()`)
읽었다. 응답·부작용은 동일하고 read()는 PluginSettings 캐시 조회라 실질 영향은 없으나,
"off일 때 배치 전과 완전 동일" 기준에서는 승인 1건당 설정 get 약 16회가 새로 추가된 것이다. 기록만 남긴다.

## m5. `resetPin`이 비로그인 시 401이 아니라 403
`ApprovalRestResource.java:918-928`. 다른 신규 엔드포인트 5개는 전부
`AuthenticatedUserThreadLocal.get() == null → 401`인데, `resetPin`만 `isAdministrator()`가
null 사용자에 false를 돌려 403이 된다. 기능상 무해하나 비일관.

---

# 알려진 미완 (Codex 자진 신고)

## K1. `rest/ApprovalRestResourcePinTest.java` 미작성 — PIN 게이트 회귀 방어가 0
스펙 변경 5가 요구한 5개 케이스(off 무영향 / on+NOT_SET→403 / on+오답→403 / on+정답→승인 성공 / LOCKED→409)
중 **어느 것도 자동 테스트가 없다**. 현재 `decide()`의 PIN 분기(`:1190-1206`)를 실행하는 테스트는 0건이며,
`ApprovalPinService` 단위 테스트만 존재한다. 즉 `signatureEnabled && signaturePinRequired` 조합의
결정 경로가 통째로 미검증이고, 이후 배치에서 이 분기를 깨도 게이트가 그린으로 통과한다.
C1이 정확히 같은 유형(테스트가 안 닿는 경로)의 사고이므로 재작업에서 반드시 메워야 한다.

---

# 검증 PASS 항목 (동작 추론 기준)

## 옵션 off 무영향 — **부분 PASS** (C1 제외)
- `decide()` `:1190-1206`: `settings.signatureEnabled() && settings.signaturePinRequired()`가 false면
  `pinService`를 **아예 호출하지 않는다**. `pin` 파라미터는 완전 무시. 기존 401/404/403/409 매핑 불변.
- `requestObject` `:1613-1621`: `signatureEnabled=false`면 `x.put("signature", ...)` 자체가 실행되지 않아
  `decisions[]` 오브젝트의 **키 집합이 배치 전과 동일**. `LinkedHashMap` 순서도 불변.
- `detailDialog`: 신규 파라미터는 선언만 됐고 본문에서 참조되지 않는다(8c 몫). 호출부 2곳 모두 `null` 전달.
- `settingsObject` `:1798-1799`: GET /settings 응답에 키 2개 **추가**. 소비 측(JS)이 알 수 없는 키를
  무시하므로 무해하며 스펙이 요구한 변경.
- **깨진 것**: POST /settings (→ C1).

## PIN 보안 — PASS
- `@FormParam` 확인: `approve` `:1099-1103`, `reject` `:1107-1113`, `registerPin` `:900-916` 모두
  `pin`/`currentPin`이 `@FormParam`. `@QueryParam`으로 pin을 받는 곳 0건.
- **PIN 원문 유출 없음** (전수 확인): 신규 코드에 `LOGGER` 호출 0건.
  `PinInvalidException` 메시지는 고정 문자열 `"PIN_INVALID"`,
  `IllegalArgumentException`은 고정 문자열 `"PIN은 4~12자여야 합니다."`,
  `hash()`의 `IllegalStateException`은 고정 문자열 + 원인 예외(PIN 미포함).
  `registerPin`이 `exception.getMessage()`를 400 본문에 넣지만(`:914`) 그 값은 위 고정 문자열뿐.
  URL 조립(`signatureImageUrl`)에도 PIN 없음.
- 해시: `PBKDF2WithHmacSHA256`, `KEY_LENGTH=256`, `ITERATIONS=210_000`,
  `byte[16]` + `SecureRandom.nextBytes` (`ApprovalPinService.java:17-20, 43-44, 91-99`).
- 비교: `MessageDigest.isEqual` (`:62-64`) — 상수시간. 저장 iterations로 재해시하므로 파라미터 변경 대응 가능.

## PIN 잠금 로직 + 테스트 실질성 — PASS
`ApprovalPinService.verify` `:49-80` 동작 추론:
- 행 없음 → `NotSet` (`:51-53`)
- `lockedUntil` 미래 → `Locked` 즉시 반환, **store.save 호출 없음 = 카운터 불변** (`:55-57`)
- 잠금 만료 → 로컬 사본에서 `failedCount=0, lockedUntil=null` 리셋 후 진행 (`:58-61`)
- 불일치 → `failures = count+1`, 5 이상이면 `now+15분` 잠금 + `Locked`, 아니면 `Invalid(5-failures)` (`:70-79`)
- 일치 → `failedCount=0, lockedUntil=null` 저장 + `Ok` (`:65-69`)

`ApprovalPinServiceTest`는 **형식적이지 않다** — 검증 근거:
- `:32-36` 1~4회 실패마다 `remainingAttempts()`가 4,3,2,1인지 **값까지** assert.
- `:37-40` 5회째 Locked → **store에서 failedCount를 직접 읽어**(`store.find("user").orElseThrow().failedCount()`)
  잠금 중 재시도 후 값이 **동일한지** 비교. "카운터 무증가"를 상태로 검증하는 올바른 방식.
- `:41-42` `NOW + 15*60 + 1`초에서 다시 `Invalid`로 복귀 → 만료 처리 검증.
- `:48-56` NOT_SET, 형식 오류(`"12 4"` 공백), 변경 시 currentPin 불일치 → `PinInvalidException`,
  정상 변경 후 새 PIN 검증, `isSet`/`resetByAdmin`까지 커버.
- `MemoryStore`는 `ApprovalPinStore` 인터페이스 구현 — AO 없이 테스트 가능하게 분리한 것이 스펙 요구와 일치.

## AO 함정 — PASS
- `ActiveObjectsApprovalSignatureStore.save` `:33-35`: 신규 행일 때
  `activeObjects.create(ApprovalSignatureEntity.class, new DBParam("USER_KEY", userKey))` — **upsert 경로 포함** 준수.
- `ActiveObjectsApprovalPinStore.save` `:28-30`: 동일 패턴 준수.
- `atlassian-plugin.xml:21-22`: `ApprovalSignatureEntity`, `ApprovalPinEntity` 둘 다 `<ao>`에 등록됨.
- `ApprovalSignatureEntity`: `USER_KEY` `@Unique @Indexed @StringLength(255)`,
  `MIME_TYPE(64)`, `DATA` `StringLength.UNLIMITED`(CLOB, 인덱스 없음), `UPDATED_AT` — 스펙 일치.
- `ApprovalPinEntity`: `USER_KEY` `@Unique @Indexed(255)`, `PIN_HASH(255)`, `SALT(255)`,
  `ITERATIONS/FAILED_COUNT` int, `LOCKED_UNTIL/UPDATED_AT` Long — 스펙 일치.
- `delete`는 양쪽 다 find→loop delete로 unique 제약과 무관하게 안전.

## 서명 REST — PASS (m2 제외)
- mime 화이트리스트 `:874`: `"image/png".equals(mime) || "image/jpeg".equals(mime)` — 정확 일치이므로
  `image/svg+xml`, `image/png; charset=..`, 대문자 변형 모두 **거부**. SVG 차단 확인.
- 디코드 크기 `:880-882`: `decoded.length > 51_200 → 400`. (인코딩 전 길이가 아니라 **디코드 후** 검사 — 올바름.)
- base64 정규식 `:112`: `Pattern.compile("[A-Za-z0-9+/=\\s]+")` + `matches()` → 빈 문자열도 거부(`+` 최소 1회).
  저장 시 `data.replaceAll("\\s","")`로 공백 제거 후 보관(`:883`).
- 이미지 서빙 권한 체인 `:931-960`:
  요청 없음 → **404** / `canView` 실패 또는 `actorKey`가 `decisions()`에 부재 → **403** /
  서명 없음 → **404**. 404·403 구분이 스펙대로이며, `denyPage`(`:1742-1755`)의 기존 관례
  (권한 없음=403)와도 일치. `UUID.fromString` 실패는 catch에서 404.
- `actorKey`가 `decisions()` 키에 있는지 검사하는 것은 `requestObject`가 imageUrl을 붙이는 조건
  (`d != null && APPROVE`, `:1614`)과 동일 키(`eligibleApproverKeys()` 원소)를 쓰므로 정합.
- `Cache-Control: private, max-age=300` 양쪽 이미지 엔드포인트 모두 설정 (`:857-860`, `:952-955`).
- 인증: 신규 엔드포인트 6개 중 5개가 `AuthenticatedUserThreadLocal.get() == null → 401`
  (기존 `getSettings` `:614-616`, `notifications` `:623-626` 관례와 동일). `resetPin`만 m5.

## `decide()` PIN 검증 위치 — PASS
- `:1183-1189` `denyPage` → `denyCurrent` → `:1190` `approvalSettings.read()` → `:1191-1206` PIN 검증
  → `:1207` `workflowService`. **denyCurrent 이후 · workflowService 이전** 확정.
- `settings.read()` 중복 없음: `:1190`에서 한 번 읽고 `:1214`에서 `settings.rejectionReasonRequired()` 재사용.
  기존 `approvalSettings.read().rejectionReasonRequired()` 호출은 제거됨.
- 사용자 키: `userKey(AuthenticatedUserThreadLocal.get())` (`:1193`). `denyCurrent`가
  `userKey(u)` 또는 `u.getName()` 둘 다 actorKey로 허용하므로(`:1766`), **actorKey를 쓰면 PIN 키가
  갈릴 수 있다** — 실제 userKey를 쓴 이 선택이 옳다. `denyCurrent`가 이미 null 사용자를 401로 걸러
  NPE 불가.
- 코드 매핑: `NOT_SET → 403 "PIN_NOT_SET:..."`, `Invalid → 403 "PIN_INVALID:...남은 시도 N회"`,
  `Locked → 409 "PIN_LOCKED:..."` — 스펙 문구·접두·상태코드 전부 일치.

## `decisions[]` signature 필드 — PASS (M1/M2 제외)
- `signatureEnabled` 게이트 `:1613`, APPROVE 결정만 `:1614`, 등록 유무로 `image`/`auto` 분기 `:1617-1619`,
  off면 키 부재 — 전부 스펙대로.
- `resolveUserKey` `:1696-1715`의 조회 순서(`getUserByKey(new UserKey(k))` → 실패 시 `getUserByName(k)`)가
  `displayName` `:1670-1693`의 이중 조회 순서와 **동일**. 스펙 요구 충족.
  `RuntimeException`을 각각 삼키는 것도 기존과 동일한 방어.
- 단건 응답도 동일 동작: `requestJson(request)` `:1513-1516`이 `requestsJson(List.of(request))`를 경유하므로
  `POST /approve`·`GET /{id}`·`POST /` 응답이 목록과 같은 shape을 갖는다(누락 없음).

## SignatureRef — PASS (m1 제외)
- `ApprovalMarkup.detailDialog`에 `Function<String, SignatureRef> signatureResolver` 파라미터만 추가,
  **본문 렌더 무변경** (diff 상 `appendSteps`·`appendTimeline` 무수정) — 8c 몫 준수.
- 호출부 2곳(`ApprovalPagePanel.java:158`, `ApprovalRegionMacro.java:183`) + 테스트 1곳
  (`ApprovalMarkupCancelTest.java:63`) 모두 `null` 전달로 컴파일 정합. C10 compile SUCCESS.

## 기타 확인
- **JAX-RS 경로 충돌 없음**: `@Path("/signature")`(`:832`)와 기존 `@Path("/{requestId}")`(`:341`)는
  리터럴 문자 수 우선 규칙상 `/signature`가 이긴다(리터럴 10자 vs 0자). `/pin`, `/settings`도 동일.
  `/signature/image`와 `/{requestId}/signature-image`는 두 번째 세그먼트가 달라 무관.
- **테스트 약화 없음**: `ApprovalRegionMacroSettingsCacheTest`의 `14 → 16`은 신규 bool 키 2개를
  `read()`가 추가로 읽는 정확한 반영. 조건 바꿔치기·assert 삭제 없음.
  `ApprovalSettingsTest`는 기본 false assert 2줄 + round-trip 테스트 1건 순증(스펙 요구 충족).

---

# Codex 재작업 지시문 초안 (spec-8a-rework 에 삽입)

> ## 재작업 8a-R — QA FAIL 수정 (치명 1 + 중대 3 + 경미 5 + 미완 1)
>
> 아래 항목만 고쳐라. **다른 줄은 건드리지 마라.** 기존 금지 목록(재포매팅·게이트 우회·커밋 금지·
> C10 수정 금지·PIN 원문 유출 금지)은 그대로 적용된다.
>
> ### R1 (치명) POST /settings 400 회귀 수정 — `ApprovalRestResource.java`
> `signatureEnabled`/`signaturePinRequired`는 **설정 화면이 아직 보내지 않는 신규 키**다
> (체크박스는 8c). 지금 코드는 null을 무효로 판정해 관리자 설정 저장이 항상 400이다.
> 같은 메서드 안 `cancelledLabel`(`:770-772`)의 "blank면 현재 값 유지" 관례로 바꿔라.
> - `:745-746` 검증: `(!blank(x) && !validBoolean(x))` 형태로 변경.
> - `:753` 앞에서 `ApprovalSettings.Values current = approvalSettings.read();`를 한 번만 선언하고
>   `:763-764`를 `blank(x) ? current.signatureEnabled() : Boolean.parseBoolean(x.trim())`로 변경.
>   `:771`의 기존 `approvalSettings.read()`도 이 `current`로 대체(중복 read 제거).
> - **테스트 필수**: `ApprovalRestResourceSettingsTest`에 **full 오버로드를 직접 호출**하는 케이스를
>   추가하라(축약 오버로드는 non-null을 채워 넣어 이 경로를 못 탄다).
>   `signatureEnabled=null, signaturePinRequired=null`로 호출 → 200 + 저장된 값이 이전 값 그대로임을 assert.
>   그리고 `"true", "true"`로 호출 → 200 + PluginSettings에 반영됨을 assert.
>
> ### R2 (중대) decisions[] 서명 N+1 제거 — `ApprovalRestResource.java`
> `requestObject` 안에서 승인 결정마다 `resolveUserKey` + `signatureStore.find`를 호출하는 구조를
> 요청 단위 캐시로 바꿔라. `displayName`이 `Map<String,String> names`를 쓰는 방식과 동일하게 한다.
> - `ApprovalSignatureStore`에 `Set<String> findRegisteredKeys(Collection<String> userKeys)` 추가
>   (`ActiveObjectsApprovalSignatureStore`에서 `inClause("USER_KEY", n)` 1회 쿼리, `DATA` 컬럼 미사용).
> - `requestsJson`에서 `signatureEnabled`일 때만 `Map<String,String> userKeyCache`를 만들고,
>   `requestObject`에 `names`와 나란히 전달. `resolveUserKey`는 `computeIfAbsent`로 감싼다.
> - `signatureEnabled=false`면 이 사전 조회를 **한 번도 하지 않아야 한다**(off 무영향 유지).
>
> ### R3 (중대) imageUrl actorKey URL 인코딩 — `ApprovalRestResource.java:1717-1720`
> `URLEncoder.encode(actorKey, StandardCharsets.UTF_8)`로 감싸라. actorKey는 username일 수 있고
> `+`·공백·`&`가 들어가면 서버가 다른 키로 읽어 403이 된다.
>
> ### R4 (중대) contextPath 조립 방식 변경 — `ApprovalRestResource.java`
> `@Context UriInfo` 싱글턴 필드 주입을 **제거**하고, JSON `imageUrl`에는 컨텍스트 패스 없는
> 상대 경로(`/rest/approval/1.0/approvals/{id}/signature-image?actorKey=...`)만 담아라.
> 컨텍스트 패스는 8c에서 소비 측(`root.dataset.contextPath`)이 붙인다 — 이 저장소의 기존 관례이며
> (`ApprovalInboxServlet.java:331,431,682`, `ApprovalSettingsServlet.java:256`, `NavMarkup.java:181`),
> 싱글턴 주입 실패 시 조용히 404가 되는 위험이 사라진다.
> `import javax.ws.rs.core.Context/UriInfo`와 `contextPath()` 메서드도 함께 제거.
> **8c 스펙에 "imageUrl은 상대 경로이므로 contextPath를 앞에 붙여 사용" 한 줄을 남길 것.**
>
> ### R5 (미완) `rest/ApprovalRestResourcePinTest.java` 작성
> 기존 REST 테스트(`ApprovalRestResourceSettingsTest`)의 구성 방식을 따르되,
> `decide()`의 PIN 분기를 **실제로 실행**해야 한다(서비스 단위 테스트로 대체 금지).
> 케이스 5개: ① off(기본)면 pin=null로도 승인 성공·PIN 조회 0회 ② on+미등록 → 403 본문 `PIN_NOT_SET:` 시작
> ③ on+오답 → 403 본문 `PIN_INVALID:` 시작 ④ on+정답 → 200 ⑤ 5회 실패 후 → 409 본문 `PIN_LOCKED:` 시작.
>
> ### R6 (경미) 아래 5건
> - `ApprovalMarkup.java:158-162`: `SignatureRef` record를 `detailDialog`의 Javadoc **위**로 옮겨
>   Javadoc이 다시 `detailDialog`에 붙게 하라. Javadoc에 `signatureResolver` 설명 1줄 추가.
> - `ApprovalRestResource.java:866-887`: 디코드 길이 하한(8바이트) + PNG(`89 50 4E 47`)/
>   JPEG(`FF D8 FF`) 매직바이트 검사 추가. 위반 시 기존 400 평문 메시지 재사용.
> - `ApprovalRestResource.java:857-860`, `:952-955`: 이미지 응답에
>   `.header("X-Content-Type-Options", "nosniff")` 추가.
> - `pin/ApprovalPinService.java:91-99`: `PBEKeySpec`을 `finally`에서 `clearPassword()`.
> - `ApprovalRestResource.java:918-921`: `resetPin`도 비로그인 시 401을 먼저 반환하도록 통일.
>
> ### 게이트 (전부 재실행하고 결과 보고에 포함)
> ```
> set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
> ```
> R1·R5의 신규 테스트가 **실제로 실행되어 카운트가 늘었는지**(현재 100건 → 증가) 보고에 명시하라.
