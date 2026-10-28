# 배치 8a — 전자서명·PIN 백엔드 (설정 2키 + APR_SIGN/APR_PIN + PIN 검증)

너는 이 저장소의 구현 담당이다. 아래 스펙을 **그대로** 구현하라. 설계 배경: `_workspace/design-batch8.md` (D1~D4, D10 서버측).

## 금지 목록 (위반 시 전체 재작업)
1. **기존 코드 재포매팅·압축 금지.** 수정 지점 외의 줄을 건드리지 마라. 파일 줄 수가 이유 없이 줄면 실패다.
2. **검증 게이트 우회 금지** — 조건 바꿔치기, 셀렉터 표기 변경, 테스트 약화 금지.
3. 원시 NUL 바이트 삽입 금지.
4. Java text block 안의 정규식은 `\\d`처럼 이스케이프 두 배.
5. `Map.putIfAbsent`는 null 값을 부재 취급 — "null 마커" 맵에는 containsKey 가드.
6. **approval-confluence10 수정 금지** (컴파일 확인만).
7. `mvn clean`/`package`/`install` 금지 — 로컬 인스턴스 실행 중이라 jar 잠금. 아래 게이트 명령만.
8. **git 커밋 금지.**
9. **하지 않은 일을 했다고 보고하지 마라.** 완료 보고는 실제 변경한 파일만 나열하라.
10. **PIN 원문을 로그·예외 메시지·URL에 절대 넣지 마라.**

## 배경 (실측 완료 — 재조사 불필요)
- 설정: `approval-confluence9/.../settings/ApprovalSettings.java` — PluginSettings, `Values` record(:124-139), `bool(key, fallback)` 헬퍼 있음.
- 설정 REST: `ApprovalRestResource.java` — GET :591-598, POST :689-774(QueryParam String + validBoolean + Values 위치 인자), 테스트용 축약 오버로드 :776-801, settingsObject :1561-1582.
- 결정 공통 진입점: `ApprovalRestResource.decide(String requestId, String actorKey, boolean approve, String reason)` :1015-1052. denyCurrent(:1028)와 workflowService 호출(:1029) 사이가 PIN 검증 지점.
- AO 등록: `approval-confluence9/src/main/resources/atlassian-plugin.xml` :13-21 `<ao>` 모듈.
- AO 함정: unique 컬럼은 `activeObjects.create(Type.class, new DBParam("COL", v))`로 INSERT 시점 주입 (`ActiveObjectsApprovalRequestRepository.java:470-476` 주석 참조). 조회 컬럼은 `@StringLength(255)` + `@Indexed` (CLOB은 인덱스 불가).
- DI 관례: Spring 주입 없음 — `ComponentLocator` + 수동 new (`ApprovalRestResource.java:107-112` 참조).

## 변경 1 — 설정 2키 (D1)
`ApprovalSettings.java`:
- 키 상수 `SIGNATURE_ENABLED = PREFIX + "signatureEnabled"`, `SIGNATURE_PIN_REQUIRED = PREFIX + "signaturePinRequired"`.
- `Values` record 끝에 `boolean signatureEnabled, boolean signaturePinRequired` 추가. `read()`/`save()` 각 2줄 (기본 false).
`ApprovalRestResource.java`:
- POST /settings에 `@QueryParam("signatureEnabled")`, `@QueryParam("signaturePinRequired")` String 2개 + validBoolean 검증 + Values 생성자 인자. **null이면 기존 관례대로 처리** — 기존 boolean 파라미터(예: notificationsEnabled)가 null일 때 어떻게 하는지 :689-748에서 확인하고 동일하게.
- :776-801 축약 오버로드: full 호출 인자에 null 2개 추가(기존 테스트 불변 유지가 목적).
- settingsObject에 `signatureEnabled`, `signaturePinRequired` put.
테스트: `ApprovalSettingsTest`(round-trip + 기본 false), `ApprovalRestResourceSettingsTest`(응답 키 존재 + 저장 반영).

## 변경 2 — APR_SIGN 엔티티 + 저장소 (D3)
새 파일 `storage/ApprovalSignatureEntity.java`:
```java
@Table("APR_SIGN")
public interface ApprovalSignatureEntity extends Entity {
    @Unique @Indexed @StringLength(255) String getUserKey(); void setUserKey(String v);
    @StringLength(64) String getMimeType(); void setMimeType(String v);
    @StringLength(StringLength.UNLIMITED) String getData(); void setData(String v); // base64
    Long getUpdatedAtMillis(); void setUpdatedAtMillis(Long v);
}
```
새 파일 `storage/ApprovalSignatureStore.java` (인터페이스) + `storage/ActiveObjectsApprovalSignatureStore.java`:
- `Optional<Signature> find(String userKey)` — record Signature(String userKey, String mimeType, String base64Data, Instant updatedAt).
- `void save(String userKey, String mimeType, String base64Data, Instant now)` — upsert: 기존 행 있으면 setter+save, 없으면 **DBParam("USER_KEY", userKey)로 create**.
- `void delete(String userKey)`.
- 검증은 저장소가 아니라 REST에서(변경 4).
`atlassian-plugin.xml` `<ao>`에 entity 추가.

## 변경 3 — APR_PIN 엔티티 + PinService (D4)
새 파일 `storage/ApprovalPinEntity.java`:
```java
@Table("APR_PIN")
public interface ApprovalPinEntity extends Entity {
    @Unique @Indexed @StringLength(255) String getUserKey(); void setUserKey(String v);
    @StringLength(255) String getPinHash(); void setPinHash(String v);   // base64
    @StringLength(255) String getSalt(); void setSalt(String v);          // base64
    int getIterations(); void setIterations(int v);
    int getFailedCount(); void setFailedCount(int v);
    Long getLockedUntilMillis(); void setLockedUntilMillis(Long v);
    Long getUpdatedAtMillis(); void setUpdatedAtMillis(Long v);
}
```
새 파일 `pin/ApprovalPinService.java` (패키지 `kr.dmove.confluence.approval.c9.pin`):
- PBKDF2WithHmacSHA256, salt 16바이트 `SecureRandom`, iterations 210_000, 키 길이 256비트. 비교는 `MessageDigest.isEqual`.
- `void register(String userKey, String pin, String currentPin, Instant now)` — PIN 형식 4~12자(공백 불가) 아니면 `IllegalArgumentException("PIN은 4~12자여야 합니다.")`. 기존 PIN이 있으면 currentPin 검증(불일치 시 아래 VerifyResult 규칙과 동일하게 실패 카운트 증가). 저장은 upsert(DBParam 함정 동일).
- `VerifyResult verify(String userKey, String pin, Instant now)` — enum/record: `OK`, `NOT_SET`, `INVALID(int remainingAttempts)`, `LOCKED(Instant until)`.
  - 행 없음 → NOT_SET.
  - LOCKED_UNTIL 미래 → LOCKED (카운트 증가 없음).
  - 불일치 → FAILED_COUNT+1, 5회째면 LOCKED_UNTIL = now+15분, INVALID(남은 횟수 = 5-count, 0이면 LOCKED 반환).
  - 일치 → FAILED_COUNT=0, LOCKED_UNTIL=null, OK.
- `boolean isSet(String userKey)`, `void resetByAdmin(String userKey)` (행 삭제).
- **PIN 원문은 어떤 로그·예외 메시지에도 넣지 않는다.**
`atlassian-plugin.xml` `<ao>`에 entity 추가.
테스트 `pin/ApprovalPinServiceTest.java`: 등록·검증 성공, 불일치 5회→잠금, 잠금 중 시도 무증가, 만료 후 재시도 가능, NOT_SET, 형식 검증, 변경 시 currentPin 필요. (AO 없이 테스트 가능하도록 저장을 인터페이스로 분리하거나, 기존 저장소 테스트 관례를 따르라 — 기존 `Test` 파일들이 AO를 어떻게 다루는지 `src/test/java/.../storage/`를 보고 같은 방식으로.)

## 변경 4 — 서명·PIN REST (D3/D4)
`ApprovalRestResource.java`에 추가 (기존 관례: query/path 파라미터 — **이번 배치의 예외**: 서명 데이터와 PIN은 `@FormParam` POST body. 이유: PIN·서명은 URL에 남으면 access log 유출, 50KB base64는 URL 한계 초과. 이 예외를 각 메서드 주석 1줄로 명시):
- `GET /approvals/signature` — 로그인 사용자 본인 서명 **메타만**: `{registered: bool, mimeType, updatedAt, pinSet: bool}` (data 미포함 — 목록·부팅용).
- `GET /approvals/signature/image` — 본인 서명 이미지 원본: `Response.ok(bytes, mimeType)` + `Cache-Control: private, max-age=300`. 없으면 404.
- `POST /approvals/signature` — `@FormParam("mime") @FormParam("data")`(base64). 검증: mime ∈ {image/png, image/jpeg}, base64 디코드 성공 && 디코드 크기 ≤ 51_200 bytes, base64 문자 정규식 `[A-Za-z0-9+/=\\s]+`. 위반 시 400 평문 메시지(기존 IAE→400 관례).
- `POST /approvals/signature/delete` — 본인 것 삭제.
- `POST /approvals/pin` — `@FormParam("pin") @FormParam("currentPin")` → pinService.register. IAE→400 평문, 기존 PIN 불일치→403 `PIN_INVALID`.
- `POST /approvals/pin/reset` — `@QueryParam("userKey")`, isAdministrator() 아니면 403 (기존 :706 관례).
- `GET /approvals/{id}/signature-image` — `@QueryParam("actorKey")`. 검증: 요청 존재(404) → canView(기존 denyPage/canView 관례) → actorKey가 그 요청의 `decisions()` 키에 존재(아니면 403) → actorKey를 userKey로 정규화(아래 변경 6 리졸버 재사용) 후 서명 조회, 없으면 404. `Cache-Control: private, max-age=300`.
- 인증: 위 엔드포인트 전부 로그인 필수(기존 `currentUser`/`denyAnonymous` 관례를 :591-598, :674-687에서 확인하고 동일 적용).

## 변경 5 — decide() PIN 검증 (D4)
- `approve`(:939-944)·`reject`(:946-953)에 `@FormParam("pin") String pin` 추가 → `decide(requestId, actorKey, approve, reason, pin)`.
- `decide()` :1028 denyCurrent 직후:
```java
ApprovalSettings.Values settings = approvalSettings.read();
if (settings.signatureEnabled() && settings.signaturePinRequired()) {
    // PIN은 form body로만 받는다 — query string은 access log에 남는다.
    ApprovalPinService.VerifyResult vr = pinService.verify(currentUserKey, pin, Instant.now());
    ... NOT_SET → 403 평문 "서명 PIN이 등록되어 있지 않습니다. 업무함 > 내 서명에서 등록하세요." (+ 코드 구분 가능하게 본문 앞에 "PIN_NOT_SET:" 접두)
    ... INVALID → 403 "PIN_INVALID:PIN이 올바르지 않습니다. 남은 시도 N회"
    ... LOCKED → 409 "PIN_LOCKED:잘못된 시도가 반복되어 15분간 잠겼습니다."
}
```
  - `currentUserKey`는 이 메서드의 기존 본인 판정에 쓰는 사용자 키와 동일한 값 사용 (:1022-1028 확인).
  - `settings.rejectionReasonRequired()`를 이미 읽고 있으면(:1035) read() 중복 호출하지 말고 한 번만.
- 기본값(off)일 때 pin 파라미터는 완전 무시 — 기존 테스트가 전부 그대로 통과해야 한다.
테스트 `rest/ApprovalRestResourcePinTest.java` (기존 REST 테스트 파일의 구성 방식을 따라): off면 무영향, on+NOT_SET→403, on+오답→403, on+정답→승인 성공, LOCKED→409.

## 변경 6 — SignatureRef 리졸버 (D2 서버측 준비; 렌더는 8c에서)
- `ApprovalMarkup.java`에 `public record SignatureRef(boolean image, String imageUrl) {}` 추가하고, `detailDialog`에 `java.util.function.Function<String, SignatureRef> signatureResolver` 파라미터를 추가하라 (null 허용 = 기능 off). **이번 배치에서는 파라미터만 추가하고 본문 렌더는 바꾸지 마라** — appendSteps 수정은 8c.
- 호출부(panel `ApprovalPagePanel.java` :145-159, `macro/ApprovalRegionMacro.java`)와 이 시그니처를 쓰는 테스트에 null 전달로 컴파일 맞춤.
- `decisions[]` JSON(:1419-1435): `signatureEnabled=true`일 때만 각 결정 오브젝트에 `signature` 키 추가:
  - APPROVE 결정만: 등록 서명 있으면 `{"type":"image","imageUrl": contextPath+"/rest/approval/1.0/approvals/{id}/signature-image?actorKey="+key}` 없으면 `{"type":"auto"}`.
  - actorKey→userKey 정규화 헬퍼: userAccessor로 key 조회 실패 시 username 조회 (기존 displayName 이중 조회 관례 :1486-1503과 동일 순서), 결과 userKey로 서명 store 조회.
  - off면 signature 키 자체가 없어야 한다(기존 응답 불변).

## 게이트 (전부 실행하고 결과를 보고에 포함)
```
set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
```
- 둘 다 성공해야 한다. C10은 컴파일만(패키징 금지 — 인스턴스 실행 중).
- 완료 보고: 변경 파일 목록(신규/수정 구분) + 게이트 결과 + 미완 항목(있으면 정직하게).
