# 재작업 8a-2 — QA FAIL 수정 (치명 1 + 중대 3 + 경미 5 + 미완 1)

너는 이 저장소의 구현 담당이다. 배치 8a 구현이 QA에서 FAIL했다. 아래 항목만 고쳐라. **다른 줄은 건드리지 마라.**

## 금지 목록 (위반 시 전체 재작업)
1. 기존 코드 재포매팅·압축 금지. 수정 지점 외의 줄 변경 금지.
2. 검증 게이트 우회·테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. approval-confluence10 수정 금지 (컴파일 확인만).
5. mvn clean/package/install 금지. git 커밋 금지.
6. PIN 원문을 로그·예외 메시지·URL에 넣지 마라.
7. 하지 않은 일을 했다고 보고하지 마라.

참고: 스펙 원문 `_workspace/spec-8a-signature-backend.md`, QA 상세 `_workspace/qa-8a.md`.

### R1 (치명) POST /settings 400 회귀 수정 — `ApprovalRestResource.java`
`signatureEnabled`/`signaturePinRequired`는 **설정 화면이 아직 보내지 않는 신규 키**다
(체크박스는 8c). 지금 코드는 null을 무효로 판정해 관리자 설정 저장이 항상 400이다.
같은 메서드 안 `cancelledLabel`(`:770-772`)의 "blank면 현재 값 유지" 관례로 바꿔라.
- `:745-746` 검증: `(!blank(x) && !validBoolean(x))` 형태로 변경.
- `:753` 앞에서 `ApprovalSettings.Values current = approvalSettings.read();`를 한 번만 선언하고
  `:763-764`를 `blank(x) ? current.signatureEnabled() : Boolean.parseBoolean(x.trim())`로 변경.
  `:771`의 기존 `approvalSettings.read()`도 이 `current`로 대체(중복 read 제거).
- **테스트 필수**: `ApprovalRestResourceSettingsTest`에 **full 오버로드를 직접 호출**하는 케이스를
  추가하라(축약 오버로드는 non-null을 채워 넣어 이 경로를 못 탄다).
  `signatureEnabled=null, signaturePinRequired=null`로 호출 → 200 + 저장된 값이 이전 값 그대로임을 assert.
  그리고 `"true", "true"`로 호출 → 200 + PluginSettings에 반영됨을 assert.

### R2 (중대) decisions[] 서명 N+1 제거 — `ApprovalRestResource.java`
`requestObject` 안에서 승인 결정마다 `resolveUserKey` + `signatureStore.find`를 호출하는 구조를
요청 단위 캐시로 바꿔라. `displayName`이 `Map<String,String> names`를 쓰는 방식과 동일하게 한다.
- `ApprovalSignatureStore`에 `Set<String> findRegisteredKeys(Collection<String> userKeys)` 추가
  (`ActiveObjectsApprovalSignatureStore`에서 `inClause("USER_KEY", n)` 1회 쿼리, `DATA` 컬럼 미사용).
- `requestsJson`에서 `signatureEnabled`일 때만 `Map<String,String> userKeyCache`를 만들고,
  `requestObject`에 `names`와 나란히 전달. `resolveUserKey`는 `computeIfAbsent`로 감싼다.
- `signatureEnabled=false`면 이 사전 조회를 **한 번도 하지 않아야 한다**(off 무영향 유지).

### R3 (중대) imageUrl actorKey URL 인코딩 — `ApprovalRestResource.java:1717-1720`
`URLEncoder.encode(actorKey, StandardCharsets.UTF_8)`로 감싸라. actorKey는 username일 수 있고
`+`·공백·`&`가 들어가면 서버가 다른 키로 읽어 403이 된다.

### R4 (중대) contextPath 조립 방식 변경 — `ApprovalRestResource.java`
`@Context UriInfo` 싱글턴 필드 주입을 **제거**하고, JSON `imageUrl`에는 컨텍스트 패스 없는
상대 경로(`/rest/approval/1.0/approvals/{id}/signature-image?actorKey=...`)만 담아라.
컨텍스트 패스는 8c에서 소비 측(`root.dataset.contextPath`)이 붙인다 — 이 저장소의 기존 관례이며
(`ApprovalInboxServlet.java:331,431,682`, `ApprovalSettingsServlet.java:256`, `NavMarkup.java:181`),
싱글턴 주입 실패 시 조용히 404가 되는 위험이 사라진다.
`import javax.ws.rs.core.Context/UriInfo`와 `contextPath()` 메서드도 함께 제거.
**8c 스펙에 "imageUrl은 상대 경로이므로 contextPath를 앞에 붙여 사용" 한 줄을 남길 것.**

### R5 (미완) `rest/ApprovalRestResourcePinTest.java` 작성
기존 REST 테스트(`ApprovalRestResourceSettingsTest`)의 구성 방식을 따르되,
`decide()`의 PIN 분기를 **실제로 실행**해야 한다(서비스 단위 테스트로 대체 금지).
케이스 5개: ① off(기본)면 pin=null로도 승인 성공·PIN 조회 0회 ② on+미등록 → 403 본문 `PIN_NOT_SET:` 시작
③ on+오답 → 403 본문 `PIN_INVALID:` 시작 ④ on+정답 → 200 ⑤ 5회 실패 후 → 409 본문 `PIN_LOCKED:` 시작.

### R6 (경미) 아래 5건
- `ApprovalMarkup.java:158-162`: `SignatureRef` record를 `detailDialog`의 Javadoc **위**로 옮겨
  Javadoc이 다시 `detailDialog`에 붙게 하라. Javadoc에 `signatureResolver` 설명 1줄 추가.
- `ApprovalRestResource.java:866-887`: 디코드 길이 하한(8바이트) + PNG(`89 50 4E 47`)/
  JPEG(`FF D8 FF`) 매직바이트 검사 추가. 위반 시 기존 400 평문 메시지 재사용.
- `ApprovalRestResource.java:857-860`, `:952-955`: 이미지 응답에
  `.header("X-Content-Type-Options", "nosniff")` 추가.
- `pin/ApprovalPinService.java:91-99`: `PBEKeySpec`을 `finally`에서 `clearPassword()`.
- `ApprovalRestResource.java:918-921`: `resetPin`도 비로그인 시 401을 먼저 반환하도록 통일.

### 게이트 (전부 재실행하고 결과 보고에 포함)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
R1·R5의 신규 테스트가 **실제로 실행되어 카운트가 늘었는지**(현재 100건 → 증가) 보고에 명시하라.
