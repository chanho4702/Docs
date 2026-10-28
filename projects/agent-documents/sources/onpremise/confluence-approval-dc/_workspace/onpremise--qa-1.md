# QA 1 — 배치 1 백엔드 수정 검증

- 대상 스펙: `_workspace/spec-1-backend.md`
- 검증일: 2026-08-11
- 검증자: approval-qa

## Verdict: **PASS (조건부)**

수정 1~7 모두 스펙대로 구현되었고, 과잉 변경·압축·회귀 없음. 도메인/C9 테스트 전량 통과.
단 아래 두 가지가 남는다.

- **조건 A (검증 미완)**: 실행 중인 Confluence 인스턴스가 jar를 잠그고 있어 `scripts/build.ps1`의
  패키징·descriptor 단언(Assert-AdapterArtifact, bytecode major 61)을 끝까지 돌리지 못했다.
  컴파일·테스트는 `mvn -pl approval-confluence9 -am test`로 대체 검증 완료.
- **조건 B (후속 필수)**: 수정 3(b)의 사용자 체감 증상("마감 임박 알림 미표시")이 절반만 해소됐다.
  백엔드는 스펙대로지만 업무함 UI가 `DUE_SOON`을 원문 그대로 출력한다 (MAJOR-1).

발견 항목: **7건** (치명 0 / 중대 1 / 경미 4 / 기존 결함 2)

---

## 1. 변경 범위 확인

`git diff --stat HEAD` 결과 — 지시된 3개 파일만 변경. 과잉 변경 없음.

| 파일 | 증감 |
|------|------|
| `approval-confluence9/.../c9/rest/ApprovalRestResource.java` | +43 / -10 상당 |
| `approval-confluence9/.../c9/notification/EmailNotificationChannel.java` | +3 |
| `approval-domain/.../domain/ApprovalRequest.java` | +11 / -10 |

합계 47 insertions, 10 deletions. C10 모듈·저장소 클래스·테스트 파일 모두 무변경. ✅

## 2. 압축/재포매팅 감지 — 이상 없음 ✅

라인 수가 모두 **증가**했다. 한 줄 압축·대량 재포매팅 흔적 없음.

| 파일 | HEAD | 현재 |
|------|------|------|
| `ApprovalRestResource.java` | 1413 | 1446 |
| `EmailNotificationChannel.java` | 130 | 133 |
| `ApprovalRequest.java` | 595 | 596 |

스타일 준수도 확인: 개별 import(`java.time.format.DateTimeParseException`)만 추가, 와일드카드 없음.
한 줄 한 statement, 중괄호 유지, 기존 한국어 주석 보존.

## 3. 스펙 수정 1~7 대조

| # | 항목 | 결과 | 비고 |
|---|------|------|------|
| 1 | 반려 사유 필수 강제 | ✅ | `decide()` reject 경로에 `approvalSettings.read().rejectionReasonRequired()` 전달 (L906). approve 경로 완전 불변 |
| 2 | expiresAt 파싱 500 → 400 | ✅ | try/catch → `IllegalArgumentException`. 람다 내부 선언으로 재할당 성립. 마감일 우선순위(화면→Flow→전역) 로직 순서 그대로 |
| 3a | IN_APP 채널 필터 | ✅ | 루프 **최상단**(L544), `repository.find` 호출보다 앞 — 불필요한 조회도 회피 |
| 3b | due-soon 항목 생성 | ✅ | eventType="DUE_SOON", reason=null, occurredAt=notification.createdAt, expiresAt 추가, 나머지 6개 키 동일. 일반 경로 불변 |
| 4a | create() 서버 페이지 버전 | ✅ | `denyPage(EDIT)` 통과 **직후**(L159). 파라미터 `contentVersion`은 시그니처 유지·값 무시 |
| 4b | expirePage() 서버 버전 | ✅ | `page.getVersion()` 사용. `version` 파라미터 유지·무시 |
| 5 | deleteGroup trim | ✅ | `groupName.trim()` + blank 400 추가 (배치 순서는 MINOR-2 참조) |
| 6 | 이메일 username 폴백 | ✅ | key 조회 null이면 `getUserByName` 재시도. 후속 `isDeactivated`/email 검사에 그대로 흘러감 |
| 7 | 지난 단계 메시지 분기 | ✅ | early return + 삼항 분기. `APPROVER_STEP_NOT_REACHED` 코드·차단 동작 불변 |

누락 0건, 과잉 0건, 의미 변형 0건.

### 동작 추론 검증 (존재 확인이 아닌)

- **수정 1**: `ApprovalWorkflowService`에 4-인자 `reject`가 실재(L131). 도메인
  `ApprovalRequest.reject`가 `rejectionReasonRequired && reason blank` → `REJECTION_REASON_REQUIRED`
  throw(L238). `decide()`의 catch가 해당 코드를 **400**으로 매핑(L913-916). 경로 완결. ✅
- **수정 2**: `ClusterApprovalLockService.withLock`은 supplier의 RuntimeException을
  래핑하지 않고 그대로 전파(L82, finally는 unlock만). 따라서 람다 안에서 던진
  `IllegalArgumentException`이 `create()`의 `catch (IllegalArgumentException)`에 도달 → **400**. ✅
- **수정 3a**: `ApprovalNotificationService.IN_APP = "IN_APP"` 상수 실재. enqueue 경로가
  IN_APP/EMAIL 두 행을 적재(L60-62, L79-81)하므로 필터로 정확히 중복이 제거된다. ✅
- **수정 4a NPE 안전성**: `denyPage`는 `pageManager.getPage(id) == null`이면 **404 반환**(L1107-1110).
  통과 시점에 페이지 존재가 보장되므로 뒤이은 `page.getVersion()`은 안전. ✅
- **수정 4b 정합성**: `ApprovalPageUpdateListener`도 `event.getPage().getVersion()`(실제 버전)을
  넘긴다. REST 경로가 이제 리스너와 같은 기준을 쓴다 — 정합. ✅
- **수정 7**: `SequentialApprovalTest`는 메시지 문자열이 아니라 **에러 코드만** 단언(L30, L73).
  테스트 수정 불필요, 실제로 무수정 통과. ✅

## 4. 빌드 결과

| 대상 | 명령 | 결과 |
|------|------|------|
| domain | `powershell.exe -File scripts\build.ps1 -Target domain` | **BUILD SUCCESS** — 44 tests, 0 failures |
| confluence9 | `scripts\build.ps1 -Target confluence9` | **실행 불가 (환경)** — 아래 참조 |
| confluence9 | `mvn -B -pl approval-confluence9 -am test` | **BUILD SUCCESS** — 48 tests, 0 failures |

confluence10은 빌드하지 않았다. ✅

### 환경 이슈 (코드 결함 아님)

1. **`pwsh` 미설치**. 이 머신에는 PowerShell 7이 없다. `agents/approval-qa.md`와 codebase-map의
   빌드 명령을 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\build.ps1 ...`로
   고쳐야 한다.
2. **실행 중인 C9 인스턴스가 domain jar를 잠금**. java PID 37360 / 47012 (2026-08-10 기동)이
   `approval-domain\target\approval-domain-0.1.0-SNAPSHOT.jar` 핸들을 쥐고 있어
   `maven-clean-plugin`이 2회 연속 실패:
   ```
   [ERROR] Failed to execute goal ...maven-clean-plugin:3.2.0:clean (default-clean)
   on project approval-domain: Failed to clean project: Failed to delete
   C:\Onpremise\confluence-approval-dc\approval-domain\target\approval-domain-0.1.0-SNAPSHOT.jar
   ```
   `clean` 없는 `test` 페이즈로 우회 검증했다. **그 결과 패키징 단계와
   `Assert-AdapterArtifact`(plugin key, macro key, web-panel location, application-version 9.2.0-9.2.99,
   bytecode major version 61)는 미검증 상태로 남는다.** 인스턴스 정지 후 `-Target confluence9`
   전체 실행 1회가 필요하다. 이번 diff는 descriptor·bytecode 타깃에 영향을 주지 않으므로
   실패 가능성은 낮다고 판단한다.

## 5. 경계면 검사

- **notifications() due-soon**: `eventType`이 리터럴 `"DUE_SOON"`, IN_APP 필터가 for 루프 첫 문장
  (try 블록보다 바깥). 요구대로. ✅
- **create() effectiveContentVersion**: `denyPage(pageId, Permission.EDIT)` 통과 이후에 읽힘.
  page null 불가(위 4a 참조). ✅
- **decide()**: reject 경로에만 settings 읽기 추가. approve 경로는 `workflowService.approve(id, actorKey)`
  그대로. ✅
- **`/approvals/users` key 필드 (회귀 전례)**: `userObject()`가 여전히
  `confluenceUser.getKey().getStringValue()`를 우선하고 key 부재 시에만 `u.getName()` 폴백(L1437-1441).
  그룹 멤버 경로(L477)도 동일 규칙. **회귀 없음.** ✅
- **JSON ↔ JS shape**: 일반 알림 항목의 9개 키는 무변경. due-soon 항목은 동일 키 집합 + `expiresAt`.
  `ApprovalJson.instant(null)`은 null 반환이라 null-safe. → MAJOR-1 참조.

## 6. 회귀 가드 확인

| 가드 | 결과 |
|------|------|
| `dedupeKey` / `saveApprovers` / `saveNewEvents` / `isLegacyMinimum` | ✅ 저장소 파일 자체가 diff에 없음 |
| `denyPage`/`denyCurrent` 검증 순서·응답 코드 | ✅ create/decide/expirePage 모두 불변 (deleteGroup은 MINOR-2) |
| `/approvals/users`의 `key` = user key | ✅ 무변경 |
| 기존 테스트 무수정 통과 | ✅ 테스트 파일 diff 0건, domain 44 + c9 48 전량 통과 |
| C10 모듈 무변경 | ✅ |
| 락 재진입 / 도메인 전이 위치 | ✅ `inTargetLock` 구조 불변 |
| escape() 규칙 | ✅ 해당 코드 미접촉 |

---

## 발견 항목

### MAJOR-1 — DUE_SOON이 업무함에 원문 enum으로 표시된다 (후속 배치 필수)

파일: `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java:319`

```js
const eventLabel = (s) =>
  ({REQUESTED: "요청 생성", APPROVED: "승인", REJECTED: "반려", EXPIRED: "만료"})[s] || s;
```

`DUE_SOON` 키가 없어 `|| s` 폴백으로 **"DUE_SOON"** 문자열이 그대로 렌더된다.
`notificationDetail()`도 `eventType !== "EXPIRED"`면 빈 문자열을 돌려주므로 부가 설명도 없고,
수정 3(b)가 새로 넣은 `expiresAt` 키는 `renderNotifications()`에서 **아무도 소비하지 않는다**.

배치 1은 백엔드 스펙 한정이므로 이것이 배치 1의 스펙 위반은 아니다. 다만 원래 증상
("마감 임박 알림 미표시")은 완전히 해소되지 않았다 — 표시는 되나 판독 불가 상태다.

**배치 2 스펙 제안** (`ApprovalInboxServlet.java`):
1. `eventLabel` 맵에 `DUE_SOON: "마감 임박"` 추가.
2. `notificationDetail(item)` 선두에 분기 추가:
   ```js
   if (item.eventType === "DUE_SOON") {
     return item.expiresAt ? fmt(item.expiresAt) + " 마감 예정입니다." : "곧 마감됩니다.";
   }
   ```
   (기존 `if (item.eventType !== "EXPIRED") return "";` 보다 **앞**에 둘 것.)
3. `ApprovalInboxServletRenderTest`에 DUE_SOON 라벨 케이스 추가.

### MINOR-1 — `notification.eventId()` null 시 NPE로 /notifications 전체가 500

파일: `ApprovalRestResource.java:552`

```java
if (notification.eventId().startsWith("due-soon:")) {
```

변경 **전** 코드에서 eventId는 `value.id().toString().equals(notification.eventId())` 형태로만
쓰여 null-safe였다. 이제 수신자 측 호출이라 null이면 NPE가 난다. 감싸는 catch는
`IllegalArgumentException`만 잡으므로 NPE는 그대로 올라가 **엔드포인트 전체가 500**이 되고,
정상 알림까지 한 건도 안 나온다.

`ApprovalNotificationEntity.getEventId()`에는 `@NotNull` 제약이 없다
(`approval-confluence9/.../c9/storage/ApprovalNotificationEntity.java:13`). 현재 write 경로는
모두 non-null을 넣으므로 발생 확률은 낮지만, 1행이 전체를 죽이는 구조라 방어값이 크다.

수정안:
```java
String eventId = notification.eventId();
if (eventId != null && eventId.startsWith("due-soon:")) {
```

### MINOR-2 — `deleteGroup()`의 blank 검사가 권한 검사보다 앞에 있다

파일: `ApprovalRestResource.java:449-454`

```java
if (blank(groupName)) {
    return Response.status(Response.Status.BAD_REQUEST).build();
}
if (!isAdministrator()) {
    return Response.status(Response.Status.FORBIDDEN).build();
}
```

비관리자가 공백 groupName으로 호출하면 403이 아니라 400을 받는다. 이 저장소의 관례는
권한 우선이다 — `denyCurrent()`는 `user == null → 401` 다음에 `blank(key) → 400` 순서다(L1119-1124).
정보 노출은 없어 심각도는 낮지만 순서를 뒤집는 편이 관례에 맞다.
(참고: JAX-RS `{groupName}` 경로 변수 특성상 완전 빈 세그먼트는 404로 걸러지므로
실제 진입은 공백/인코딩된 공백뿐이다.)

수정안: 두 블록의 순서를 맞바꾼다.

### MINOR-3 — create()의 페이지 버전 읽기가 락 바깥이라 좁은 TOCTOU가 남는다

파일: `ApprovalRestResource.java:159-160`

`page.getVersion()`을 `inTargetLock` **바깥**에서 읽는다. 버전 N을 읽은 뒤 저장 전에 다른
사용자가 페이지를 N+1로 편집하면, N+1에 대한 `ApprovalPageUpdateListener` 만료 처리는 이미
지나간 뒤라 이 요청은 N 기준으로 남아 만료되지 않는다.

스펙이 "denyPage 통과 후"로 위치를 지정했으므로 **Codex 책임 아님**(지시 준수).
클라이언트 값을 믿던 이전보다는 명백히 개선이다. 다만 완전 해소는 아니므로 백로그 기록 권고.
근본 해결은 `inTargetLock` 람다 안에서 버전을 다시 읽고 `ApprovalTarget`을 재구성하는 것이나,
`target`이 락 이름 산출에 쓰이므로(`ApprovalLockNames.forTarget`) 구조 변경 부담이 있다 —
별도 배치로 검토할 것.

### MINOR-4 — `DateTimeParseException`의 cause가 유실된다

파일: `ApprovalRestResource.java:190-192`

```java
} catch (DateTimeParseException exception) {
    throw new IllegalArgumentException(
            "expiresAt은 ISO-8601 UTC 형식이어야 합니다. 예: 2026-08-31T15:00:00Z");
}
```

`exception`을 cause로 넘기지 않아 원문 파싱 오류가 로그에서 사라진다. 스펙 예시 코드가
그렇게 쓰여 있어 지시 준수이며, 사용자 대면 메시지는 의도대로다. 진단성만 아쉬움.
선택적 개선: `new IllegalArgumentException("...", exception)`.

### PRE-1 (기존 결함, 이번 배치 무관) — 서블릿에 하드코딩 컨텍스트 패스 8곳

codebase-map의 "서블릿 템플릿에 하드코딩 컨텍스트 패스 금지 — `__CONTEXT_PATH__` 토큰 주입"
규칙 위반이 남아 있다. 이번 diff는 이 파일들을 건드리지 않았다.

- `ApprovalInboxServlet.java:51, 252, 294, 355, 485`
- `ApprovalSettingsServlet.java:148, 151, 252`

`/confluence` 이외 컨텍스트 패스로 배포하면 REST base(`:294`, `:252`)까지 깨져 업무함·설정 화면이
전부 동작하지 않는다. 별도 배치 권고.

### PRE-2 (기존 동작, 참고) — 잘못된 expiresAt이 열린 요청 존재 시 409로 가려진다

파싱이 `inTargetLock` 안, CONFLICT 검사 **뒤**에서 일어난다(L171-193). 이미 열린 요청이 있는
대상에 잘못된 형식으로 요청하면 400이 아니라 409를 받는다. 변경 전과 동일한 순서이므로
이번 배치의 회귀는 아니다.

---

## 재작업 요구 (배치 1 범위)

**없음 — 배치 1은 PASS.** MINOR-1과 MINOR-2는 다음 배치에 함께 태워도 무방한 수준이나,
MINOR-1은 장애 반경이 엔드포인트 전체이므로 우선 처리를 권한다.

## 후속 조치 체크리스트

- [ ] MAJOR-1: 업무함 `DUE_SOON` 라벨·상세 문구 (배치 2 프론트에 반드시 포함)
- [ ] MINOR-1: `eventId()` null 가드
- [ ] MINOR-2: `deleteGroup()` 권한 검사 우선으로 순서 교정
- [ ] C9 인스턴스 정지 후 `powershell.exe -File scripts\build.ps1 -Target confluence9` 전체 1회
      (패키징 + descriptor/bytecode 단언 확정)
- [ ] `agents/approval-qa.md`·codebase-map의 빌드 명령을 `pwsh` → `powershell.exe`로 정정
- [ ] 백로그: MINOR-3 (락 내부 버전 재확인), PRE-1 (컨텍스트 패스 토큰화)
- [ ] 이식 백로그: 수정 1~7 전부 C10 미반영 상태 기록
