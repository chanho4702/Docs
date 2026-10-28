# QA 배치 6a 재작업 — 재검증 (3차)

- 기준 커밋: 2b894ed + 미커밋 워킹트리
- 검증자: approval-qa (독립 검증. 보고 미신뢰, 빌드·스캐너 모두 직접 실행)
- 판정: **PASS** (미해소 1 / 재작업 지시 9건 중 8건 RESOLVED, 1건 PARTIAL)
- 치명 0, 주의 1(신규), 경미 5

## 0. 빌드 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
```

`target/classes`·`target/test-classes`를 두 모듈 모두 삭제한 뒤 실행해 잔재 컴파일 결과를 배제했다.

| 모듈 | 결과 |
|------|------|
| approval-domain | **SUCCESS — Tests run 52, Failures 0, Errors 0** |
| approval-confluence9 | **SUCCESS — Tests run 70, Failures 0, Errors 0** |
| 전체 | **BUILD SUCCESS** |

c9 내역: listener 6(신규), RegionSupport 12, Notification 15(+2), EmailNotificationMessage 3(신규),
JsonDueSoon 5, Json 4, SettingsRest 1, StepSpec 6, GroupApproverResolver 4, StepRestoration 5,
InboxServletRender 6, Settings 2, RegionMacroSettingsCache 1. → 2차의 59에서 70으로 +11.

> 참고: 첫 시도에서 `clean` 을 붙였더니 `approval-confluence9/target/container/.../quickreload-6.2.0.jar`
> 삭제 실패로 BUILD FAILURE가 났다. 코드 문제가 아니라 cargo 컨테이너 디렉터리 파일 잠금이다.
> `clean` 없이(단 classes 디렉터리는 수동 삭제) 재실행해 위 결과를 얻었다.

## 1. 재작업 지시 9건 판정표

| # | 지시 | 판정 | 근거 |
|---|------|------|------|
| 1 | N2 컴파일 + mvn green | **RESOLVED** | `ApprovalRestResource:193 final String regionHashForSave = calculatedRegionHash;`. 위 §0 직접 실행으로 BUILD SUCCESS 확인 |
| 2 | N1 `@StringLength(80)` | **RESOLVED** | `ApprovalEntity.getRegionHash()`에 `@StringLength(80)` + 근거 주석("v1: + 64 hex = 67자"). 실측 해시 길이 67 확인(§2 E5) |
| 3 | N3 회수 사유 출력 | **RESOLVED (코드)** | 채널이 `rejected \|\| cancelled ? event.reason() : null`로 CANCELLED reason을 전달하고, Message의 CANCELLED 분기가 "회수 사유: "를 출력. 다만 채널 배선 자체는 무가드(§3 신규-2 참조) |
| 4 | B3 테스트 (REQUESTED 메일 "반려 사유" 부재) | **PARTIAL** | 테스트는 생겼으나 층이 틀렸다. 아래 §1-1 |
| 5 | `stale()` 4요건 | **RESOLVED** | 4요건 모두 코드 확인. 아래 §1-2 |
| 6 | 스캐너 3요건 | **RESOLVED** | 실측 13케이스 전부 기대대로. 아래 §2 |
| 7 | M4 테스트 (2/3/6) | **RESOLVED** | resolver 2·이메일 3·리스너 6. 리스너 6건은 형식적이지 않다. 아래 §1-3 |
| 8 | M3 문구·주석 원복 | **RESOLVED (실질)** | 문자열 리터럴 전수 대조로 **사용자 노출 문구 변경 0건** 확인. 아래 §1-4 |
| 9 | N5 압축 해제 / m3 주석 / N6 제거 | **RESOLVED** | 아래 §1-5 |

**미해소: 1건** (지시 4 PARTIAL)

### 1-1. 지시 4 — B3 테스트가 결함을 재현하지 못한다 (PARTIAL)

`EmailNotificationMessageTest.요청_메일은_요청_메모를_표기하고_반려_사유_문구가_없다()`는
`Context(..., reason=null, ..., requestMessage="빠른 검토 부탁드립니다")`를 **직접 조립**해
`assertFalse(body.contains("반려 사유"))`를 본다. reason이 null이므로 이 단언은 무조건 참이다.

원래 B3 결함은 **`EmailNotificationChannel`이 요청 메모를 reason 슬롯에 밀어 넣은 것**이었다.
Message 층에 Context를 손으로 넘기는 테스트는 그 배선을 통과하지 않으므로,
같은 회귀가 재발해도 이 테스트는 녹색을 유지한다. 지시 4가 요구한 불변식은 고정되지 않았다.

→ 후속: 채널의 슬롯 결정만 떼어낸 package-private 헬퍼
(`reasonSlot(eventType, event)` / `requestMessageSlot(eventType, request)`)를 만들고
이벤트 타입 4종에 대해 단언하면 층을 맞출 수 있다.

### 1-2. 지시 5 — `stale()` (RESOLVED)

`ApprovalRestResource.stale(request, regionHash, page, currentRegionHashes, approvedContentVersion)`:

| 요건 | 확인 |
|------|------|
| APPROVED 게이트 | `if (request.status() != ApprovalStatus.APPROVED) return false;` — 최상단 |
| `regionHashes()` 기반 | `currentRegionHashes`가 `ApprovalRegionSupport.regionHashes(...)` 결과. `regionBodies()` 경로 제거 → N4(중복 key 영구 stale) 해소. 실측 E1/E2로 두 체계가 여전히 다름을 확인했고, 프로덕션에서 `regionBodies()`를 부르는 곳은 이제 없다 |
| 접두사 폴백 | `regionHash.startsWith(ApprovalRegionSupport.HASH_PREFIX)` 불일치 시 해시 분기 자체를 타지 않고 버전 비교로 낙하 |
| 파싱 실패 폴백 | 스캔 실패 페이지는 `regionScanFailed`에만 담기고 `pageRegionHashes`에는 안 들어감 → `currentRegionHashes == null` → 버전 비교 |
| 페이지당 1회 스캔 | `pageRegionHashes.containsKey(pageId) \|\| regionScanFailed.contains(pageId)` 이중 가드로 `getBodyAsString()`+파싱이 페이지당 1회. 저장 해시는 `repository.findRegionHashes(ids)` 배치 1회 → m2 N+1 해소 |

교차 케이스도 맞다: 같은 페이지에 저장 해시 있는 요청과 없는 요청이 섞여도,
해시 없는 쪽은 `regionHash == null`이라 해시 분기를 건너뛰고 버전 비교로 간다.

### 1-3. 지시 7 — M4 테스트 품질 (RESOLVED)

- **resolver CANCELLED 2건** — `회수_수신자는_미결정_승인자와_요청자이고_취소자는_제외한다`(관리자 회수 →
  `{waiting, requester}`, 본인 회수 → `{waiting}`), `시스템_회수는_...`(system 회수 → `{waiting, requester}`).
  결정 완료자 `done` 제외·취소자 제외라는 두 불변식을 실제로 고정한다.
- **이메일 3건** — CANCELLED(회수 사유 O / "반려 사유" X), REQUESTED(요청 메모 O / "반려 사유" X),
  REJECTED(반려 사유 O). 슬롯 혼선의 **렌더링 측** 불변식은 고정된다(배선 측은 §1-1).
- **리스너 regionAction 6건** — KEEP / EXPIRE(해시 상이) / CANCEL(스캔 성공+부재) / EXPIRE(파싱 실패) /
  EXPIRE(접두사 없는 v0) / EXPIRE(저장 해시 null). **fail-safe 행렬 6칸을 빠짐없이 덮는다.**
  "자동 취소는 스캔 성공 + 영역 부재에서만"이라는 6a의 핵심 안전 불변식이 여기서 고정된다. 형식적이지 않다.

미덮개: `handle()` 자체(PENDING 게이트, PAGE 경로, 요청 단위 예외 격리)는 여전히 테스트가 없다.
순수 함수만 추출·검증됐다. Confluence 이벤트 목 비용을 감안하면 수용 가능하나 §3에 코드 리뷰로 대체한다.

### 1-4. 지시 8 — M3 원복 (RESOLVED, 실질)

`EmailNotificationMessage`의 **모든 문자열 리터럴을 base(2b894ed)와 전수 비교**했다.

- base에만 있는 리터럴: `"반려 사유: CONTENT_VERSION"` **1건뿐** — 이것은 코드가 아니라
  삭제된 javadoc **주석 안의 예시 문자열**이다.
- 즉 **사용자 노출 문구 변경 0건**. 2차에서 지적한 "승인 완료 후 페이지가 수정되어" / "승인된 버전" /
  "승인 진행 중 페이지가…" 3건 모두 원문 복원.
- 신규 리터럴은 CANCELLED/requestMessage 분기 것뿐: `"승인 요청이 회수되었습니다.\n"`, `"회수 사유: "`,
  `"요청 메모: "`, `"The approval request was cancelled.\n"`, `"Cancellation reason: "`,
  `"Request message: "`, `"CANCELLED"`×2. → 예외 허용 범위 안.
- subject 삼항: base와 diff 없음 → 원복 확인. 클래스 javadoc(`plain text email의 사용자 입력을…`): 원복 확인.
- 지시가 명시한 주석 2개 모두 복원: `/** 만료 사유 문자열. domain의 감사 사유 값을 그대로 쓴다. */`,
  `/** 만료 정보가 없는 기존 호출 경로용이다. */`.
- 가드 주석은 한 줄로 정리됨(`// 만료 사유와 요청 메모는 반려 사유 자리에 넣지 않는다…`).

잔여(경미, §3-5): `appendKoreanExpiry()`의 javadoc
`/** 만료 사유는 반려 사유가 아니다. 예전에는 같은 줄에 찍혀 "반려 사유: CONTENT_VERSION"처럼 나왔다. */`
는 여전히 삭제 상태다. 2차 보고서가 이 건을 열거에서 빠뜨렸으므로 지시 8의 "주석 2개"에는 안 들어갔지만,
"지시 외 주석 변경 원복"의 취지로는 남은 건이다.

### 1-5. 지시 9 (RESOLVED)

- **N5** `ApprovalRegionSupport`: 중괄호 없는 한 줄 `if`/`for`/`else` 0건, 한 줄 다중 statement 0건,
  최장 라인 126자(2차 237자에서 해소). `ApprovalPageUpdateListener`: `org.slf4j.Logger`,
  `org.slf4j.LoggerFactory`, `java.util.List/Map/Optional/UUID` 전부 개별 import로 이동,
  본문 FQN 잔존 0건, 최장 119자.
- **m3** `ApprovalRequest.cancel()`에 의도 javadoc 추가:
  "의도적으로 `expireIfDue`를 먼저 부르지 않는다 — 마감이 지났더라도 사람이 회수 의사를 밝힌 요청은
  '만료'가 아니라 '회수'로 마감하는 것이 감사 기록의 사실에 가깝다."
- **N6** `findRegionHash(UUID)` 단건 조회 전 저장소 grep 0건 → 제거 확인. `findRegionHashes` 배치만 남음.

## 2. 스캐너 실측 (컴파일 산출물에 probe 직접 실행, 지시 6)

`approval-confluence9/target/classes` + `approval-domain/target/classes`에 대해 probe 컴파일·실행.

### A. 구조 파손 → `Optional.empty()`

| 입력 | 결과 | 판정 |
|------|------|------|
| A1 매크로 열고 안 닫음 | `EMPTY(parse-fail)` | **OK (2차 미해소분 해소)** |
| A2 `rich-text-body`만 미종료 + 매크로는 닫힘 | `EMPTY` | **OK (2차 불일치 해소)** |
| A3 `rich-text-body` 닫힘 + 매크로 미종료 | `EMPTY` | OK |
| A4 중첩 `rich-text-body` 하나 미종료 | `EMPTY` | OK |
| A5 CDATA 미종료 | `EMPTY` | OK |
| A7 정상 대조군 | `{k=v1:b8fa…}` | OK |
| A8 영역 없는 정상 페이지 | `{}` (부재) | OK — 파싱 실패와 구분됨 |
| A6 영역 **밖** 여분의 `</ac:structured-macro>` | `{k=v1:b8fa…}` (파손으로 안 봄) | 경미, §3-3 |

### B. 빈 요소 표기 정규화 (N6)

| 비교 | 결과 | 기대 |
|------|------|------|
| `<br></br>` vs `<br/>` | SAME | SAME **OK (2차 미구현 해소)** |
| `<br />` vs `<br/>` | SAME | SAME OK |
| `<em></em>` vs `<em/>` | SAME | SAME OK |
| `<span class="x"></span>` vs `<span class="x"/>` | SAME | SAME OK (속성 보존) |
| `<em>t</em>` vs `<em/>` | DIFF | DIFF OK (과잉 정규화 아님) |

### C. CDATA 내부 공백 보존 (§D-3) — 요구 3건 전부 확인

| 비교 | 결과 | 기대 |
|------|------|------|
| CDATA 안 `a   b` vs `a b` | DIFF | DIFF **OK (2차 §D-3 위반 해소)** |
| CDATA 안 줄바꿈 개수 차이 | DIFF | DIFF OK |
| CDATA 안 선행 탭 유무 | DIFF | DIFF OK |
| CDATA **밖** `a   b` vs `a b` | SAME | SAME OK (정규화 유지) |
| CDATA 안 `</ac:structured-macro>` 리터럴 + tail | 본문 안 잘림, tail 살아있음 | OK (m4 유지) |

### D·E. 회귀·체계

`macro-id`/`schema-version` 변형 무시 SAME, 태그 사이 개행/들여쓰기 무시 SAME,
`&lt;script&gt;` vs `<script>` DIFF, 영역 안 자기닫힘 매크로 보존(본문 온전) — 전부 1차·2차 결론 유지.
해시 길이 67 (`v1:`+64hex). `hasDuplicateKey` true.
중복 key에서 `regionHashes()`는 A·B 두 본문을 함께 해시(`v1:00b7…`), `regionBodies()`는 첫 영역만
(`{k=<p>one</p>}`) — 두 체계는 여전히 다르지만 **프로덕션 소비자가 `regionHashes()`로 통일**되어 무해.
파싱 실패 시 `regionHash(String,String)`은 `null` 반환 → 생성 경로가 400으로 차단(fail-safe).

## 3. 신규 발견 (3차)

### 3-1. 주의 — CANCELLED 본문 분기가 이벤트 타입이 아니라 `request.status()`로 갈린다
`EmailNotificationMessage.appendKorean/English`의 회수 분기는 `"CANCELLED".equals(context.status())`다.
`context.status()`는 채널에서 `request.status().name()`으로 채워지므로 **이벤트가 아니라 요청의 현재 상태**다.
반면 바로 옆 reason 슬롯과 expiry 분기는 이벤트 타입 기반이라 판정 기준이 섞였다.

실제 영향: 알림은 outbox에 적재됐다가 스케줄러가 나중에 발송한다. REQUESTED 행이 아직 미발송인
상태에서 요청이 회수되면, 발송 시점의 `request.status()`가 CANCELLED이므로 **요청 알림 메일이
"승인 요청이 회수되었습니다." 본문으로 나가고 요청 메모는 조기 return에 걸려 누락**된다.
(회수는 PENDING에서만 가능하므로 APPROVED/REJECTED 이벤트와는 겹치지 않아 창은 좁다.)
→ 후속: Context에 이벤트 타입을 넘겨 expiry와 동일하게 이벤트 기반으로 분기할 것.

### 3-2. 경미 — 리스너 `expireForEdit`가 "이번 호출의 전이 여부"가 아닌 결과 status로 알림을 건다
```java
ApprovalRequest expired = workflowService.expireForContentVersion(request.id(), currentContentVersion);
if (expired.status() == ApprovalStatus.EXPIRED) { notificationService.enqueueSafely(expired); }
```
기존 경로 `expireForPageVersion` → `expireInLock`은 lock 안에서 다시 읽어 **이번 호출이 실제로 전이시킨
경우에만** 반환한다. 그 javadoc이 명시적으로 경고한다: "lock 밖에서 읽은 값으로 판단하면 다른 node가
이미 만료시킨 요청을 또 만료된 것으로 세어 같은 알림이 두 번 나간다."
새 코드는 이미 EXPIRED인 요청에도 `enqueueSafely`를 부른다.
**실피해 없음**: `store.createIfAbsent(eventId, …)`가 멱등이라 중복 메일은 생기지 않는다.
다만 (a) 도메인이 문서화한 규약을 우회했고, (b) 이미 만료된 요청마다 전체 이벤트×수신자 수만큼
불필요한 DB 왕복이 생긴다. 또 lock 범위가 target lock → request lock으로 바뀌어 동시 요청 생성과의
상호배제가 약해졌다(중복 검사는 여전히 `inTargetLock` 안이라 열린 요청 둘 문제는 없음).

### 3-3. 경미 — 영역 밖 여분의 닫는 매크로 태그는 파손으로 보지 않는다
`macroDepth < 0` 가드는 영역 매크로 스캔 루프 **안**에서만 동작한다. 영역이 정상 종료된 뒤 최상위에
떠 있는 `</ac:structured-macro>`는 opening이 아니라 바깥 루프가 그냥 건너뛴다(실측 A6).
지시 6의 요구(미종료 구조)는 충족했고 자동 취소 가드가 뚫리는 방향도 아니라 정보성으로 남긴다.

### 3-4. 경미 — 지시 6의 신규 스캐너 동작 3종에 단위 테스트가 없다
미종료 → `Optional.empty()`, 빈 요소 표기 정규화, CDATA 내부 공백 보존 — 실측으로는 전부 통과하지만
`ApprovalRegionSupportTest` 신규 6건은 정규화·중복 key만 덮는다. 지시 7의 수량 요구에는 없던 항목이나,
가장 되돌아가기 쉬운 정규화 규칙이 무가드로 남는다.

### 3-5. 경미 — M3 잔여
`appendKoreanExpiry()` javadoc 1개 미복원(§1-4), 채널의 기존 주석 1줄 재작성
(`// 만료 사유는 반려 사유 자리에 넣지 않는다. 두 값의 의미가 다르고 본문 문장도 다르다.` →
`// 만료 사유·요청 메모는 …`, 로직이 바뀌었으므로 정당화 여지 있음),
`Context` record 헤더 뒤 빈 줄 1개 삭제.

### 3-6. 경미 — `regionBodies()`가 사실상 테스트 전용 데드코드
프로덕션 호출부 0건(테스트 2곳만). javadoc은 "기존 호출 경로 호환용"이라 하지만 그 경로가 없다.

## 4. 회귀 스팟 체크

| 항목 | 결과 |
|------|------|
| 리스너 `regionAction` 추출 동치성 — PAGE 경로 | **유지**. `resourceType() == PAGE`면 `regionAction` 을 타지 않고 곧장 `expireForEdit` → 기존 `expireForContentVersion` 의미 그대로 |
| 리스너 — PENDING 게이트 | **유지 + 강화**. 기존 `expireForPageVersion`은 전 요청을 lock 안에서 시도하고 도메인 `expireForContentVersion`이 상태를 걸렀다. 새 코드는 루프 앞단에서 `status != PENDING → continue`로 먼저 거른다. 도메인 게이트도 그대로 남아 있어 이중 방어 |
| 리스너 — 예외 격리 | **유지**. 요청 단위 `try/catch (RuntimeException)` + warn 로그 + 계속 진행. `ApprovalException extends RuntimeException`이므로 `findRequired` NOT_FOUND도 잡힌다. 단 루프 **밖**의 `findByPageId`·`getBodyAsString`·`regionHashes`·`findRegionHashes`는 무방비(기존도 동일) |
| 리스너 — 알림 판정 | §3-2 참조 (경미) |
| `requestObject` 시그니처 변경 호출측 | **정합**. 호출부는 `ApprovalRestResource:1079` 단 1곳. 신규 파라미터 `regionHash`(4번째)·`currentRegionHashes`(6번째) 모두 선언 순서대로 `regionHashes.get(r.id())`, `pageRegionHashes.get(r.target().pageId())`로 전달. 타입 모두 구분 가능해 오배치 위험 없음. 컴파일 통과 |
| `stale()` PAGE 경로 의미 | **유지**. CONTENT_REGION+해시 조건에 안 걸리면 기존 `page.getVersion() > approvedContentVersion` 그대로 |
| 취소 REST 권한 | 무변경. `denyPage(VIEW)` → `denyCurrent(actorKey)` → 요청자(userKey/username 대소문자 무시) 또는 관리자, 그 외 403 / NOT_FOUND 404 / ALREADY_CLOSED 409 / 잘못된 UUID 400 |
| 생성 경로 CONTENT_REGION 게이트 | 신규. 파싱 실패·영역 부재 시 400, 클라이언트가 보낸 `regionHash`와 불일치 시 409. `page`는 `denyPage` 통과 후 `pageManager.getPage`로 확보 |
| CANCELLED enum 전개 | `ApprovalMarkup.icon()/label()`에 `CANCELLED -> ICON_EXPIRED / "회수"` 추가 — switch 누락 없음(컴파일 확인) |
| 5a 자산 | StepRestoration 5, StepSpec 6, GroupApproverResolver 4 등 전부 green |
| 도메인 | 52건 green (회수 전이·감사 이벤트·마감 4상태 거부·요청 메모 정규화 포함) |

## 5. 위생·범위

- `git diff --check` **통과** (출력은 LF→CRLF 경고뿐, whitespace error 0, exit 0).
- **NUL 0**: 워킹트리에서 변경/신규인 전 파일 스캔 결과 NUL 바이트 0.
  `_workspace/design-batch6.md`도 **0** — 2차에서 지적한 43261바이트 위치의 리터럴 NUL이 제거됐다.
- 장문 라인: 신규 코드에 200자 초과 0건. 140자 초과 중 신규는
  `ApprovalRegionSupportTest:114`(184자, 기대값 문자열) 1건뿐이고, 나머지(`ApprovalMarkup` CSS/SVG 상수,
  `ApprovalInboxServlet`, `ApprovalNotificationTest:227~237`)는 base에도 동일하게 존재하는 기존 라인이다.
- 지시 외 코드 변경: 없음. 변경 파일 19개(java) 전부 6a 범위.
  `.claude/skills/approval-dev/SKILL.md`·`CLAUDE.md`·`docs/features.md`·
  `docs/requirements-cjlbiovault-2026-08-12.md`는 하네스·문서 갱신 건으로 2차와 동일 판단.

## 6. 후속 권고 (배포 차단 아님)

1. **(지시 4 미해소)** 채널의 슬롯 결정 로직을 package-private 헬퍼로 떼어내 이벤트 타입 4종
   (REQUESTED/REJECTED/CANCELLED/EXPIRED)에 대한 테스트를 붙일 것. 현재 B3 테스트는 층이 맞지 않아
   같은 회귀를 못 잡는다.
2. **(§3-1)** `EmailNotificationMessage.Context`에 이벤트 타입을 넘겨 회수 분기를 `request.status()`가
   아닌 이벤트 기반으로 바꿀 것.
3. **(§3-2)** 리스너 만료 알림을 `expireInLock` 계열 API로 되돌려 "이번 호출이 전이시킨 경우"만
   enqueue하도록 정렬할 것.
4. **(§3-4)** 미종료 → `Optional.empty()`, `<br></br>`/`<br/>` 동일 해시, CDATA 내부 공백 보존을
   `ApprovalRegionSupportTest`에 고정할 것(실측은 통과하나 무가드).
5. **(§3-5, §3-6)** `appendKoreanExpiry` javadoc 복원, `regionBodies()` 제거 검토.
