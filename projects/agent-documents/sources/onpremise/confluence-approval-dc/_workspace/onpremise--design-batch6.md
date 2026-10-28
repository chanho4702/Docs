# 배치 6 UI 설계 — 요청 메모 · 요청 회수 · 로컬 시각 · 영역 해시 · 사이드바 · 업무함 필터

작성: approval-ui-designer / 2026-08-12
대상 모듈: `approval-confluence9` (C10은 §J 백로그)
관련 선행 설계: `design-ui-overhaul.md`(토큰·pill), `design-inbox-sidebar.md`·`design-dual-sidebar.md`(wb-nav), `design-reapproval.md`(stale·재승인)

## 0. 전제와 확인된 현행 코드

### 0.1 백엔드 전제 (오케스트레이터 확정, 일부는 이미 도메인에 반영됨)
확인 결과 `approval-domain`에는 **이미** 다음이 들어 있다. UI 설계는 이 시그니처를 그대로 전제한다.

| 항목 | 현행 |
|------|------|
| `ApprovalStatus` | `PENDING, APPROVED, EXPIRED, REJECTED, CANCELLED` — **CANCELLED 존재** |
| `ApprovalEventType` | `REQUESTED, APPROVED, REJECTED, EXPIRED, CANCELLED` |
| 회수 | `ApprovalRequest.cancel(String actorKey, String reason, Instant now)` → CANCELLED 이벤트 append + status 전이 |
| 서비스 | `ApprovalWorkflowService.cancel(UUID requestId, String actorKey, String reason)` |
| 요청 메모 | `ApprovalRequest.requestMessage()` — REQUESTED 이벤트의 `reason`을 되읽는다 |
| 생성 | `createSequential/create(..., String requesterKey, String requestMessage)` |

> **즉시 발생하는 컴파일 파손**: `ApprovalMarkup.iconFor(ApprovalStatus)`는 4갈래 exhaustive switch다.
> CANCELLED가 추가된 순간 컴파일이 깨진다. §B-2가 이 수정을 포함한다.

아직 없어서 **백엔드에 요구**해야 하는 것은 §G에 모았다.

### 0.2 이 문서가 건드리는 파일
| 파일 | 절 |
|------|----|
| `macro/ApprovalMarkup.java` | A, B, C |
| `panel/ApprovalPagePanel.java` | B, C |
| `macro/ApprovalRegionMacro.java` | B, C, D |
| `macro/ApprovalRegionSupport.java` | D |
| `listener/ApprovalPageUpdateListener.java` | D |
| `resources/js/approval.js` | A, B, C, D |
| `resources/css/approval.css` | A, B, C, E-1 |
| `servlet/ApprovalInboxServlet.java` | A, B, C, E-2, F |
| `servlet/ApprovalSettingsServlet.java` | B, E-2 |
| `servlet/NavMarkup.java` | E |
| `settings/ApprovalSettings.java` | B |
| `notification/EmailNotificationMessage.java` / `EmailNotificationChannel.java` | A |

### 0.3 불변 규칙 (모든 절에 적용)
- 패널·매크로 HTML은 StringBuilder + `ApprovalMarkup.escape()` / `ApprovalRegionSupport.escape()` 통과.
- 서블릿은 text block + `__TOKEN__` 정규식 치환. `String.format` 금지(CSS `%` 충돌). 스크립트 주입 값은 `ApprovalJson.escapeForScript`.
- 서블릿 인라인 JS는 DOM 조립만 (`el()` + `textContent`). `innerHTML` 금지.
- `sr-only`는 **span에만** (`.dmove-approval-sr-only` / 서블릿의 `.sr-only`).
- 모달 내부 셀렉터는 항상 컨테이너 스코프(`approvalContainer(el)` 또는 `el.closest('.dmove-approval-modal')`). 매크로는 한 페이지에 여러 번 렌더링되므로 `document.querySelector`로 모달을 찾지 않는다.
- 매크로 렌더 마크업에 `id`/`for` 금지 → 라벨은 **감싸는 `<label>`**. (서블릿 화면은 단일 인스턴스라 id 사용 가능.)
- 새 색을 만들지 않는다. 패널/매크로는 기존 hex, 서블릿은 `--pending/--approved/--rejected/--expired/--accent` 토큰 재사용.

---

## A. 요청 메모 (requestMessage)

### A-1. 요청 모달 입력 — `ApprovalMarkup.appendRequestForm`

메모는 **direct/flow 공통**이므로 두 `<section class="dmove-approval-pane">` **바깥**, `modal__body`의 마지막 자식으로 넣는다. 탭을 바꿔도 사라지지 않아야 한다(`switchTab`은 `.dmove-approval-pane`만 토글하므로 자동으로 유지된다).

현행 (`ApprovalMarkup.java:312-317`):
```java
html.append("<div class=\"dmove-approval-flow-preview\" aria-live=\"polite\">");
html.append("<p class=\"dmove-approval-empty\">Flow를 선택하면 승인 순서와 담당자를 보여줍니다.</p></div></section></div>");
html.append("<div class=\"dmove-approval-modal__footer\">...
```
변경 — `</section>` 다음, `</div>`(body 닫기) **앞**에 삽입:
```java
html.append("<p class=\"dmove-approval-empty\">Flow를 선택하면 승인 순서와 담당자를 보여줍니다.</p></div></section>");
appendRequestMessageField(html);
html.append("</div>");
html.append("<div class=\"dmove-approval-modal__footer\">...
```
```java
/** 요청 메모는 direct/flow 공통 입력이라 pane 바깥에 둔다. id 대신 감싸는 label을 쓴다(매크로 다중 인스턴스). */
private static void appendRequestMessageField(StringBuilder html) {
    html.append("<div class=\"dmove-approval-field dmove-approval-field--message\">");
    html.append("<label><span class=\"dmove-approval-field__label\">요청 메모");
    html.append("<span class=\"dmove-approval-field__optional\">선택 · 최대 500자</span></span>");
    html.append("<textarea name=\"requestMessage\" class=\"textarea dmove-approval-textarea\" rows=\"3\" ");
    html.append("maxlength=\"500\" placeholder=\"결재자에게 전달할 내용\"></textarea></label>");
    html.append("<span class=\"dmove-approval-counter\" aria-hidden=\"true\">0 / 500</span></div>");
}
```

**글자수 제한 500자 — 근거.** REST는 body 없이 query 파라미터만 쓴다(코드베이스 관례). POST의 query string은 **요청 라인**에 들어가고 Tomcat `maxHttpHeaderSize` 기본 8192B에 요청 라인+헤더가 모두 포함된다. 한글 1자 = UTF-8 3B = 퍼센트 인코딩 9자.
- 500자 한글 → 4,500B.
- 나머지: base URL·resourceType·pageId·contentVersion·regionKey·regionHash(67자)·steps(승인자 10명 ≈ 500B) ≈ 1,000B.
- 쿠키 등 헤더 ≈ 1,000~1,500B.
합계 ≈ 7,000B로 8,192B 안에 남지만 여유가 크지 않다. 500자를 **상한**으로 잡고, 그 이상은 서버가 400으로 거절한다(§G). 1,000자 이상을 원하면 이 엔드포인트만 form-urlencoded body를 받도록 관례를 깨야 하므로 이번 배치 범위 밖.

**카운터를 live region으로 만들지 않는 이유**: 타이핑마다 스크린리더가 숫자를 읽어 방해가 된다. 한도는 라벨 텍스트("선택 · 최대 500자")에 넣고, 카운터는 `aria-hidden="true"` 시각 보조로 둔다. `aria-describedby`는 id가 필요해 매크로 다중 인스턴스에서 중복되므로 쓰지 않는다.

### A-2. approval.js — 카운터와 제출

`input` 리스너(현행 `approval.js:385`) 맨 앞에 추가:
```js
var memoInput = event.target.closest('textarea[name="requestMessage"]');
if (memoInput) {
    var field = memoInput.closest('.dmove-approval-field--message');
    var counter = field && field.querySelector('.dmove-approval-counter');
    if (counter) {
        counter.textContent = memoInput.value.length + ' / 500';
        counter.classList.toggle('is-limit', memoInput.value.length >= 500);
    }
    return;
}
```
`submit` 핸들러(현행 `approval.js:623-628`, `fromRequestId` 붙이는 곳 다음):
```js
var memoField = form.elements.requestMessage;
var requestMessage = memoField ? memoField.value.trim() : '';
if (requestMessage.length > 500) {          // maxlength 우회 방어
    showMessage(form, '요청 메모는 500자까지 입력할 수 있습니다.');
    return;
}
if (requestMessage) {
    url += '&requestMessage=' + encodeURIComponent(requestMessage);
}
```
- 위치는 `submit.disabled = true` **앞**(검증 실패 시 버튼이 잠기면 안 된다).
- `closeModal`에서 메모를 **지우지 않는다**. ESC나 오클릭으로 닫았을 때 작성 중인 글이 날아가면 안 된다. 성공 제출은 `window.location.reload()`로 이어지므로 자연히 초기화된다. (`resetReapproval`은 지금처럼 계속 호출한다.)

### A-3. 상세 모달 표시 — 요청 정보 섹션 신설

`detailDialog`의 body에서 **notice 다음, "승인 순서와 결정" 앞**에 삽입한다(`ApprovalMarkup.java:209` 다음). 결재자가 승인 버튼을 누르기 전에 가장 먼저 읽어야 하는 정보이므로 최상단이다.
```java
appendInvalidNotice(html, request, approvedVersion);
appendRequestMessage(html, request);          // ← 신규
html.append("<section class=\"dmove-approval-modal__section\">...승인 순서와 결정...
```
```java
/** 줄바꿈은 <br> 주입 대신 white-space:pre-wrap으로 살린다. escape()만 통과하면 안전하다. */
private static void appendRequestMessage(StringBuilder html, ApprovalRequest request) {
    String message = request.requestMessage();
    if (message == null || message.isBlank()) {
        return;
    }
    html.append("<section class=\"dmove-approval-modal__section dmove-approval-modal__section--message\">");
    html.append("<h3 class=\"dmove-approval-modal__section-title\">요청 메모</h3>");
    html.append("<p class=\"dmove-approval-request-message\">");
    html.append(escape(message));
    html.append("</p></section>");
}
```
> `escape()` 후 개행 문자는 그대로 남는다. `pre-wrap`이 렌더하므로 `<br>` 치환은 하지 않는다(치환하면 escape 이후에 마크업을 주입하는 셈이라 규칙 위반이다).

### A-4. 타임라인 사유 라벨 정리

메모는 REQUESTED 이벤트의 `reason`이므로 지금 그대로 두면 타임라인에 아무 설명 없이 본문만 뜬다. 이벤트 종류별 라벨을 붙인다.
```java
private static String reasonLabel(ApprovalEventType type) {
    return switch (type) {
        case REQUESTED -> "메모";
        case CANCELLED -> "회수 사유";
        case EXPIRED -> "만료 사유";
        default -> "사유";
    };
}
```
`appendTimeline`(현행 `409-413`):
```java
if (event.reason() != null) {
    html.append("<span class=\"dmove-approval-timeline__why\">");
    html.append("<span class=\"dmove-approval-timeline__why-label\">");
    html.append(escape(reasonLabel(event.type())));
    html.append("</span>");
    html.append(escape(reasonText(event)));
    html.append("</span>");
}
```
`reasonText`는 만료 코드만 문장으로 바꾸고 나머지는 원문 그대로(업무함 `reasonText`와 문구 일치):
```java
private static String reasonText(ApprovalEvent event) {
    if (event.type() != ApprovalEventType.EXPIRED) {
        return event.reason();
    }
    return switch (event.reason()) {
        case "CONTENT_VERSION_AFTER_APPROVAL" -> "승인 후 페이지가 수정되어 무효가 되었습니다.";
        case "CONTENT_VERSION" -> "승인 진행 중 페이지가 수정되어 무효가 되었습니다.";
        case "DEADLINE" -> "마감 시각이 지났습니다.";
        default -> event.reason();
    };
}
```
(현재 패널 타임라인은 `CONTENT_VERSION`을 날것으로 보여주는 상태다. 같은 함수를 만드는 김에 정리한다.)

상세 모달에서 메모가 두 곳(요청 메모 섹션 + 타임라인)에 보이는 것은 의도다. 섹션은 "읽어야 할 지시", 타임라인은 "감사 기록"이다.

### A-5. 업무함 표시

REST 응답에 `requestMessage`가 추가된다(전제). 표시 위치 2곳.

**(a) 행 — 대상 셀 보조 줄** (`render()` 안, 현행 `ApprovalInboxServlet.java:467-474`):
```js
const subject = el("td", r.pageTitle || "페이지 #" + r.pageId, "subject");
if (r.requestMessage) subject.append(el("small", "“" + r.requestMessage + "”", "memo"));
tr.append(subject, statusCell(r), …);
```
```css
#dmove-approval-app td small.memo{font-style:normal;color:var(--muted);
  max-width:44ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
```
(`td small`은 이미 `display:block; margin-top:4px; font-size:11.5px`.)

**(b) 상세 확장 — 전폭 메모 블록** (`detail(row)` 안, `grid` 앞):
```js
const td = el("td");
td.colSpan = 7;
if (row.requestMessage) {
  const box = el("div", undefined, "memo-block");
  box.append(el("h3", "요청 메모"), el("p", row.requestMessage));
  td.append(box);
}
td.append(grid);
```
```css
#dmove-approval-app .detail-grid h3,
#dmove-approval-app .memo-block h3{margin:0 0 12px;font:600 10.5px/1 var(--mono);
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}   /* 기존 .detail-grid h3 규칙에 셀렉터 추가 */
#dmove-approval-app .memo-block{margin:0 0 20px;padding:12px 14px;border-left:3px solid var(--rule);
  background:var(--paper);border-radius:0 6px 6px 0}
#dmove-approval-app .memo-block p{margin:0;white-space:pre-wrap;word-break:break-word;color:var(--ink)}
```
**(c) 타임라인 사유** — `reasonText(x)` 앞에 추가:
```js
if (x.type === "REQUESTED") return "메모: " + x.reason;
```

### A-6. 이메일 본문

> **먼저 고쳐야 할 버그**: 지금 구조에서 REQUESTED 알림이 나가면 이벤트 `reason`(=메모)이 `Context.reason`으로 흘러 **"반려 사유: {메모}"**로 찍힌다. 메모 기능이 들어가는 순간 발현한다.

`EmailNotificationChannel.deliver`(현행 `82-92`):
```java
boolean expiry = event.map(v -> v.type() == ApprovalEventType.EXPIRED).orElse(false);
boolean requested = event.map(v -> v.type() == ApprovalEventType.REQUESTED).orElse(false);
boolean cancelled = event.map(v -> v.type() == ApprovalEventType.CANCELLED).orElse(false);
… new EmailNotificationMessage.Context(
        title, pageUrl, dueSoon ? "마감 임박" : request.status().name(),
        actorName,
        (expiry || requested) ? null : event.map(ApprovalEvent::reason).orElse(null),  // 반려/회수 사유만
        request.expiresAt(), dueSoon, locale(recipient),
        expiry ? event.map(ApprovalEvent::reason).orElse(null) : null,
        expiry ? request.approvedContentVersion() : null,
        requested ? event.map(ApprovalEvent::reason).orElse(null) : null,  // ← requestMessage 신규
        cancelled)                                                          // ← 사유 라벨 분기용
```
`EmailNotificationMessage.Context`에 `String requestMessage`, `boolean cancelled` 추가(기존 8인자 편의 생성자는 `null,false`로 위임).

본문 위치 — **처리자 다음, 링크 앞**(한국어):
```
승인 요청에 변경 사항이 있습니다.

페이지: 제품 요구사항
상태: 승인 대기
처리자: 홍길동
요청 메모: 3분기 릴리스 범위 확정본입니다. 2단계까지 오늘 중 부탁드립니다.

페이지 열기: https://…
```
`appendKoreanDetail` 수정:
```java
if (actor != null) { body.append("처리자: ").append(actor).append('\n'); }
if (context.requestMessage() != null) {
    body.append("요청 메모: ").append(escape(context.requestMessage())).append('\n');
}
if (context.expiryReason() != null) { appendKoreanExpiry(body, context); return; }
if (reason != null) {
    body.append(context.cancelled() ? "회수 사유: " : "반려 사유: ").append(reason).append('\n');
}
```
영어는 `Request note: ` / `Withdrawal reason: `.
기존 `escape()`가 제어문자·개행을 공백으로 접으므로 메모는 한 줄이 된다 — plain text 메일 주입 방어 규칙을 유지하기 위한 의도된 동작이다.

### A-7. CSS 추가 (approval.css)
```css
.dmove-approval-field__optional{margin-left:6px;color:#5e6c84;font-size:11.5px;font-weight:400}
.dmove-approval-textarea{width:100%;margin-top:4px;min-height:64px;resize:vertical;
  font:inherit;font-size:13px;line-height:1.5}
.dmove-approval-field--message{position:relative;margin-bottom:4px}
.dmove-approval-counter{display:block;margin-top:4px;text-align:right;
  font-size:11.5px;color:#5e6c84;font-variant-numeric:tabular-nums}
.dmove-approval-counter.is-limit{color:#ae2e24;font-weight:600}
.dmove-approval-request-message{margin:0;padding:10px 12px;border-left:3px solid #dfe1e6;
  background:#f7f8f9;border-radius:0 4px 4px 0;color:#172b4d;font-size:13px;
  white-space:pre-wrap;word-break:break-word}
.dmove-approval-timeline__why-label{margin-right:6px;font-weight:600;color:#5e6c84}
```
`.dmove-approval-modal__body label{margin-top:12px}`가 이미 있으므로 메모 라벨의 상단 여백은 자동. `textarea`는 `.dmove-approval-modal__body input.text, select` 규칙에 안 걸리므로 위 클래스로 폭을 준다.

---

## B. 요청 회수 (CANCELLED)

### B-1. 라벨과 색 — 결정

| 항목 | 결정 | 근거 |
|------|------|------|
| 기본 상태 라벨 | **"회수"** (`statusLabels.CANCELLED`) | 나머지 상태 라벨이 "승인 대기 / 승인 완료 / 반려 / 만료"로 짧은 명사형이다. "반려"·"만료"와 2음절로 대칭. pill 폭도 좁게 유지된다. |
| 동작(버튼) 라벨 | **"요청 회수"** | 상태(명사)와 동작(동사구)을 구분한다. |
| 색 | `--expired` 계열 회색 재사용 (`#44546f` / 배경 `#f4f5f7`) | 스킬 규칙상 새 색 금지. 회수는 오류가 아닌 중립 종료라 회색이 의미상 맞다. |
| 만료와의 구분 | **점선 테두리** + 전용 아이콘 + 다른 라벨 | 같은 회색이어도 형태·문자·아이콘 3중으로 갈린다. "없던 일로 되돌림"을 점선으로 은유한다. |

### B-2. ApprovalMarkup — 아이콘·라벨·switch

**필수(컴파일)**: `iconFor`에 CANCELLED 갈래, `eventLabel`에 CANCELLED 갈래.
```java
/** 회수 = 원위치로 되돌리는 화살표. 원 안 도형이라 다른 상태 아이콘과 실루엣이 맞는다. */
public static final String ICON_CANCELLED =
        "<svg viewBox=\"0 0 20 20\" width=\"20\" height=\"20\" fill=\"currentColor\" aria-hidden=\"true\">"
        + "<path d=\"M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 1.6a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8Z\"/>"
        + "<path d=\"M9.1 6.2 5.9 9.4l3.2 3.2 1.1-1.1-1.3-1.3h2.2c1 0 1.8.8 1.8 1.8v1.4h1.6v-1.4"
        + "a3.4 3.4 0 0 0-3.4-3.4H8.9l1.3-1.3-1.1-1.1Z\"/></svg>";

case CANCELLED -> ICON_CANCELLED;      // iconFor
case CANCELLED -> "요청 회수";           // eventLabel
```
(path는 시안이다. 렌더 확인 후 두께가 안 맞으면 조정 가능 — 다른 아이콘과 같은 20×20 fill 스타일이라는 점만 지킬 것.)

`statusModifier`/`pillModifier`는 enum 이름에서 파생하므로 `--cancelled`는 CSS만 추가하면 된다.

`pill()`은 수정 불필요: CANCELLED는 `flagged`도 `showStale`도 아니고 step 배지 조건(PENDING)도 아니다.

### B-3. 상세 모달 — 회수 버튼과 확인 스텝

`detailDialog` 시그니처에 `boolean canCancel` 추가. 호출부(패널·매크로)에서 계산한다.

**누가 보는가** — 서버 판정:
```java
/** 승인자 키와 마찬가지로 requesterKey에도 userKey/username이 섞일 수 있다(불변식 7). */
private static boolean isRequester(ApprovalRequest request, ConfluenceUser user) {
    String key = user.getKey() == null ? null : user.getKey().getStringValue();
    if (key != null && key.equals(request.requesterKey())) {
        return true;
    }
    return user.getName() != null && user.getName().equals(request.requesterKey());
}

boolean canCancel = request.status() == ApprovalStatus.PENDING
        && (isRequester(request, user) || permissionManager.isConfluenceAdministrator(user));
```
`ApprovalPagePanel`·`ApprovalRegionMacro` 모두 `permissionManager`를 이미 들고 있다. 화면 노출은 편의일 뿐이고 **권한 판정은 REST가 다시 한다**(§G).

**footer**(현행 `221-231`) — 닫기와 승인/반려 사이:
```java
html.append("<button type=\"button\" class=\"aui-button\" data-approval-close=\"1\">닫기</button>");
if (canCancel) {
    html.append("<button type=\"button\" class=\"aui-button dmove-approval-cancel-open\" ");
    html.append("data-approval-cancel-open=\"1\" aria-expanded=\"false\">요청 회수</button>");
}
if (stale && canRequest) { … 재승인 … }
if (myTurn) { … 반려 / 승인 … }
```
> 회수는 파괴적이지만 주 동작이 아니다. `aui-button-primary`를 주지 않고 기본 버튼으로 두되, 확정 버튼에만 위험 색을 준다.

**확인 스텝** — body의 마지막 자식(감사 타임라인 섹션 다음, `</div>` 앞):
```java
if (canCancel) {
    html.append("<section class=\"dmove-approval-confirm\" hidden=\"hidden\" aria-label=\"요청 회수 확인\">");
    html.append("<p class=\"dmove-approval-confirm__lead\">이 승인 요청을 회수합니다. ");
    html.append("지금까지 받은 승인은 무효가 되며 되돌릴 수 없습니다.</p>");
    html.append("<label><span class=\"dmove-approval-field__label\">회수 사유");
    html.append("<span class=\"dmove-approval-field__optional\">선택 · 최대 200자</span></span>");
    html.append("<textarea name=\"cancelReason\" class=\"textarea dmove-approval-textarea\" rows=\"2\" ");
    html.append("maxlength=\"200\" placeholder=\"결재자에게 남길 사유\"></textarea></label>");
    html.append("<div class=\"dmove-approval-confirm__actions\">");
    html.append("<button type=\"button\" class=\"aui-button aui-button-link\" ");
    html.append("data-approval-cancel-abort=\"1\">돌아가기</button>");
    html.append("<button type=\"button\" class=\"aui-button dmove-approval-danger\" ");
    html.append("data-approval-cancel-confirm=\"1\">회수 확정</button></div></section>");
}
```
**`window.prompt`를 쓰지 않는 이유**: 반려는 기존 코드가 prompt를 쓰지만(부채), 회수는 (i) 되돌릴 수 없고 (ii) 사유가 선택이라 "빈 문자열 확인"과 "취소"를 prompt로 구분하기 어렵고 (iii) 일부 브라우저가 반복 prompt를 차단한다. 모달 안 인라인 확인이 스타일·포커스·ESC를 모두 통제할 수 있다.

### B-4. 컨테이너 data 속성 추가 (중요)

지금 `data-approval-actor-key`는 **현재 사용자가 승인자일 때만** 붙는다(`resolveActorKey`). 요청자는 대개 승인자가 아니므로 회수 POST의 `actorKey`를 만들 수 없다. 컨테이너에 항상 붙는 사용자 키가 필요하다.

`ApprovalPagePanel.openPanel` / `ApprovalRegionMacro.openRegion` 양쪽:
```java
String currentUserKey = user.getKey() == null ? user.getName() : user.getKey().getStringValue();
html.append(" data-approval-user-key=\"").append(escape(currentUserKey)).append("\"");
if (canCancel) {
    html.append(" data-approval-can-cancel=\"1\"");
}
```
(`openPanel`/`openRegion`에 `user`·`canCancel` 파라미터 추가.)

### B-5. approval.js — 회수 인터랙션

`click` 위임에서 **`.dmove-approval-action` 일반 분기보다 앞**에 둔다(그 분기는 `approvalActorKey`가 없으면 그냥 return하므로 회수가 삼켜진다).
```js
function closeConfirm(confirmBox) {
    var opener = confirmBox.closest('.dmove-approval-modal')
        .querySelector('[data-approval-cancel-open]');
    confirmBox.hidden = true;
    if (opener) {
        opener.setAttribute('aria-expanded', 'false');
        opener.disabled = false;
        opener.focus();
    }
}

var cancelOpen = event.target.closest('[data-approval-cancel-open]');
if (cancelOpen) {
    event.preventDefault();
    var cancelModal = cancelOpen.closest('.dmove-approval-modal');
    var confirmBox = cancelModal && cancelModal.querySelector('.dmove-approval-confirm');
    if (!confirmBox) { return; }
    confirmBox.hidden = false;
    cancelOpen.setAttribute('aria-expanded', 'true');
    cancelOpen.disabled = true;
    confirmBox.scrollIntoView({block: 'nearest'});
    var reasonBox = confirmBox.querySelector('textarea[name="cancelReason"]');
    if (reasonBox) { reasonBox.focus(); }
    return;
}
var cancelAbort = event.target.closest('[data-approval-cancel-abort]');
if (cancelAbort) {
    event.preventDefault();
    closeConfirm(cancelAbort.closest('.dmove-approval-confirm'));
    return;
}
var cancelConfirm = event.target.closest('[data-approval-cancel-confirm]');
if (cancelConfirm) {
    event.preventDefault();
    var cancelContainer = approvalContainer(cancelConfirm);
    if (!cancelContainer || !cancelContainer.dataset.approvalRequestId
            || !cancelContainer.dataset.approvalUserKey) { return; }
    var box = cancelConfirm.closest('.dmove-approval-confirm');
    var reasonValue = (box.querySelector('textarea[name="cancelReason"]').value || '').trim();
    var cancelUrl = restBase() + '/' + encodeURIComponent(cancelContainer.dataset.approvalRequestId)
        + '/cancel?actorKey=' + encodeURIComponent(cancelContainer.dataset.approvalUserKey);
    if (reasonValue) { cancelUrl += '&reason=' + encodeURIComponent(reasonValue); }
    cancelConfirm.disabled = true;
    showMessage(cancelConfirm, '');
    post(cancelUrl).then(function () { window.location.reload(); }).catch(function (error) {
        cancelConfirm.disabled = false;
        showMessage(cancelConfirm, (error && error.body) || '요청 회수에 실패했습니다.');
    });
    return;
}
```
`showMessage`는 `.dmove-approval-modal` 스코프의 `.dmove-approval-message`(footer)를 찾으므로 그대로 동작한다.

**ESC 우선순위** — `keydown` 핸들러 수정:
```js
var open = document.querySelector('.dmove-approval-modal:not([hidden])');
if (!open) { return; }
var openConfirm = open.querySelector('.dmove-approval-confirm:not([hidden])');
if (openConfirm) { closeConfirm(openConfirm); return; }   // 확인 스텝 먼저 닫는다
closeModal(open);
```
**`closeModal` 정리** — 모달을 닫을 때 확인 스텝을 초기화(다음에 열었을 때 열린 채로 남지 않게):
```js
var confirmBox = modal.querySelector('.dmove-approval-confirm');
if (confirmBox && !confirmBox.hidden) {
    confirmBox.hidden = true;
    var opener = modal.querySelector('[data-approval-cancel-open]');
    if (opener) { opener.setAttribute('aria-expanded', 'false'); opener.disabled = false; }
}
```
(단, 여기서는 `opener.focus()`를 부르지 않는다 — `closeModal`이 이미 `modalOpener`로 포커스를 되돌린다.)

### B-6. 업무함 '내 요청' 행 액션

- 서블릿 루트에 관리자 플래그 노출: `<div id="dmove-approval-app" … data-admin="__IS_ADMIN__">`, `values.put("IS_ADMIN", admin ? "1" : "0")`, TOKEN 정규식에 `IS_ADMIN` 추가.
- 행 액션 셀(현행 `485-489`):
```js
const td = el("td");
td.append(a, document.createTextNode("  "), open);
if (currentView === "requested" && r.status === "PENDING") {
  const withdraw = el("button", "회수", "ghost ghost--danger");
  withdraw.onclick = () => openCancelForm(tr, r, open);
  td.append(document.createTextNode("  "), withdraw);
}
```
`/mine/requested`는 정의상 본인이 올린 요청만 돌려주므로 소유자 검사가 따로 필요 없다. **관리자가 남의 요청을 회수하는 경로는 페이지 상세 모달(§B-3)**로 일원화한다 — 업무함에는 남의 요청이 애초에 목록되지 않으므로 여기에 관리자 분기를 넣으면 죽은 코드가 된다. (`data-admin`은 §F 필터의 관리자 전용 옵션과 향후 확장용으로 남긴다.)

- `openCancelForm(tr, row, openButton)`: 상세 행이 닫혀 있으면 먼저 연 뒤, 상세 셀 최상단에 폼을 넣는다(기존 확장 메커니즘 재사용 — 별도 모달 시스템을 만들지 않는다).
```js
function openCancelForm(tr, row, openButton) {
  let next = tr.nextElementSibling;
  if (!next || !next.classList.contains("detail")) {
    next = detail(row);
    tr.after(next);
    openButton.textContent = "닫기";
    openButton.setAttribute("aria-expanded", "true");
  }
  const cell = next.firstElementChild;
  if (cell.querySelector(".cancel-form")) {
    cell.querySelector(".cancel-form textarea").focus();
    return;
  }
  const form = el("div", undefined, "cancel-form");
  form.append(el("p", "이 승인 요청을 회수합니다. 되돌릴 수 없습니다.", "cancel-form__lead"));
  const label = el("label");
  label.append(el("span", "회수 사유 (선택 · 최대 200자)"));
  const area = el("textarea");
  area.maxLength = 200; area.rows = 2; area.placeholder = "결재자에게 남길 사유";
  label.append(area);
  const actions = el("div", undefined, "cancel-form__actions");
  const abort = el("button", "돌아가기", "ghost");
  const confirm = el("button", "회수 확정", "ghost ghost--danger");
  const msg = el("span", "", "message");
  abort.onclick = () => { form.remove(); };
  confirm.onclick = async () => {
    confirm.disabled = true;
    const url = base + "/" + encodeURIComponent(row.id) + "/cancel?actorKey=" + encodeURIComponent(actor)
      + (area.value.trim() ? "&reason=" + encodeURIComponent(area.value.trim()) : "");
    try {
      const res = await fetch(url, {method: "POST", credentials: "same-origin",
        headers: {"X-Atlassian-Token": "no-check"}});
      if (!res.ok) throw new Error(await res.text());
      location.reload();          // 필터 상태는 URL에 있으므로 그대로 복원된다(§F-2)
    } catch (e) {
      confirm.disabled = false;
      msg.textContent = (e && e.message) || "요청 회수에 실패했습니다.";
    }
  };
  actions.append(msg, abort, confirm);
  form.append(label, actions);
  cell.prepend(form);
  area.focus();
}
```
`location.reload()`를 쓰는 이유: 필터·뷰 상태가 URL 쿼리에 반영되므로(§F-2) 새로고침으로도 화면이 보존된다. approval.js의 관례와도 일치한다.

### B-7. 지표 노출 — 결정과 근거

**결정: 기존 4칸 고정 그리드에 5번째 칸을 넣지 않는다. 대신 §F-1에서 지표를 칩 레일로 바꾸고, CANCELLED는 "건수 > 0일 때만 나타나는 칩"으로 넣는다.**

근거:
1. **레이아웃**: 현재 `.summary{grid-template-columns:repeat(4,1fr)}`이고 900px 이하에서 `repeat(2,1fr)`로 접힌다. 5칸은 (a) 데코레이터 안 콘텐츠 폭(대략 900~1100px)에서 칸당 ~180px로 라벨이 잘리고 (b) 2열로 접히면 홀수라 마지막 칸이 혼자 남아 그리드가 무너진다.
2. **의미**: 지표는 `/mine`(내가 승인자인 요청) 기준이다. 승인자 입장에서 "회수됨"은 상태 분포라기보다 사건이며, 상시 0인 칸이 계기판의 1/5를 차지하는 것은 낭비다.
3. **누락 아님**: 회수는 (a) 요청자에게는 '내 요청' 탭 배지와 목록에 그대로 보이고 (b) 승인자에게는 알림으로 전달된다(§G에서 백엔드에 회수 알림 enqueue를 요구한다). (c) §F-1의 칩은 개수가 0이면 숨고 1건이라도 있으면 나타나므로 "있을 때만 보이는" 정확한 노출이 된다.
4. 만료에 합산하는 안은 기각. "만료"는 시간/편집에 의한 무효이고 "회수"는 사람의 철회다. 합치면 감사 관점에서 사실을 흐린다.

### B-8. 설정 화면 — CANCELLED 라벨

`ApprovalSettings.read()`의 `Map.of`에 한 쌍 추가(현재 4쌍 → 5쌍, `Map.of` 상한 10쌍 이내):
```java
"CANCELLED", label("CANCELLED", "회수")
```
`save()`는 map을 순회하므로 변경 없음.
`ApprovalSettingsServlet` "상태 표시명" 그리드에 필드 추가:
```html
<div class="field"><label for="label-cancelled">회수</label><input id="label-cancelled" required maxlength="100"></div>
```
+ 읽기(`285-288` 옆) `document.getElementById("label-cancelled").value = value.statusLabels.CANCELLED;`
+ 저장 payload에 `cancelledLabel` 추가. REST `saveSettings`에 `@QueryParam("cancelledLabel")` 추가(§G).

### B-9. CSS 추가 (approval.css)
```css
/* 회수: 만료와 같은 회색이지만 점선 테두리로 "없던 일"을 표시한다 */
.dmove-approval-pill--cancelled{color:#44546f;background:#f4f5f7;border-style:dashed}
.dmove-approval-status--cancelled{color:#44546f;background:#f4f5f7;
  box-shadow:inset 0 0 0 1px #b3bac5}
.dmove-approval-timeline li.is-cancelled::before{border-color:#44546f;border-style:dashed;background:#f4f5f7}
.dmove-approval-timeline li.is-requested::before{border-color:#0052cc}

/* 회수 확인 스텝 */
.dmove-approval-confirm{margin-top:20px;padding:14px 16px;border:1px solid #f5cd47;
  border-radius:6px;background:#fffae6}
.dmove-approval-confirm[hidden]{display:none}
.dmove-approval-confirm__lead{margin:0 0 8px;font-size:13px;font-weight:600;color:#7f5f01}
.dmove-approval-confirm__actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.dmove-approval-danger{color:#ae2e24!important}
.dmove-approval-danger:hover{background:#ffecea!important}
```
업무함(서블릿 CSS):
```css
#dmove-approval-app .stamp.CANCELLED{color:var(--expired);background:transparent;border-style:dashed}
#dmove-approval-app .timeline li.is-cancelled::before{border-color:var(--expired);border-style:dashed}
#dmove-approval-app .ghost--danger{color:var(--rejected);border-color:var(--rule)}
#dmove-approval-app .ghost--danger:hover{background:var(--rejected-bg);border-color:var(--rejected)}
#dmove-approval-app .cancel-form{margin:0 0 18px;padding:12px 14px;border:1px solid var(--pending);
  border-radius:8px;background:var(--pending-bg)}
#dmove-approval-app .cancel-form__lead{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--pending)}
#dmove-approval-app .cancel-form label{display:block}
#dmove-approval-app .cancel-form textarea{width:100%;margin-top:4px;font:inherit;font-size:13px;resize:vertical}
#dmove-approval-app .cancel-form__actions{display:flex;align-items:center;gap:8px;margin-top:10px}
#dmove-approval-app .cancel-form__actions .message{margin-right:auto;color:var(--rejected);font-size:12.5px}
```
업무함 JS `statusCell`에도 한 줄:
```js
} else if (r.status === "CANCELLED") {
  td.append(el("small", r.requesterDisplayName ? "요청자가 회수" : "회수됨"));
}
```
(정확히는 회수 주체가 관리자일 수도 있으므로, CANCELLED 이벤트의 actor를 쓰려면 상세를 봐야 한다. 행에서는 "회수됨"으로 통일하고 주체는 타임라인에서 보게 한다. → `el("small", "회수됨")` 한 줄로 단순화.)

---

## C. 타임스탬프 로컬 표시

### C-1. 목표 형식
```
2026-08-12 14:03:22 (UTC+9)
```
- 초까지 표시(감사 목적).
- 오프셋은 **뷰어 브라우저의 시간대**에서 해당 시각 기준으로 계산 → DST가 있는 지역도 정확.
- 오프셋 표기 규칙:
  - 0이면 `UTC`
  - 분이 0이면 `UTC+9`, `UTC-5` (시는 0 패딩하지 않는다 — 사람이 읽는 표기)
  - 분이 있으면 `UTC+5:30`, `UTC-3:30` (분은 2자리 패딩)

### C-2. 서버 마크업 — `<time>` 래핑

`ApprovalMarkup`에 헬퍼 추가:
```java
/** JS가 죽어도 ISO 원문이 그대로 보이는 것이 폴백이다. datetime과 본문 모두 escape를 통과시킨다. */
public static void time(StringBuilder html, String iso) {
    if (iso == null || iso.isBlank()) {
        return;
    }
    html.append("<time class=\"dmove-approval-time\" datetime=\"").append(escape(iso)).append("\">");
    html.append(escape(iso)).append("</time>");
}

public static void time(StringBuilder html, java.time.Instant value) {
    if (value != null) {
        time(html, value.toString());
    }
}
```
치환할 호출부 3곳:

| 위치 | 현행 | 변경 |
|------|------|------|
| `detailDialog` 마감 (`188-190`) | `html.append(escape(request.expiresAt().toString()));` | `time(html, request.expiresAt());` |
| `appendHistory` (`351`) | `html.append(escape(entry.approvedAtIso()));` | `time(html, entry.approvedAtIso());` |
| `appendTimeline` (`407`) | `html.append(escape(event.occurredAt().toString()));` | `time(html, event.occurredAt());` |

`HistoryEntry.approvedAtIso()`가 빈 문자열일 수 있다(`orElse("")`) → `time()`이 blank를 걸러 아무것도 출력하지 않는다. 그 경우 "v3 승인 — " 뒤가 비므로 `appendHistory`에서 blank일 때 "시각 미상"을 쓴다:
```java
html.append(" 승인 — ");
if (entry.approvedAtIso() == null || entry.approvedAtIso().isBlank()) {
    html.append("시각 미상");
} else {
    time(html, entry.approvedAtIso());
}
```

### C-3. approval.js — 치환

```js
function pad2(value) { return value < 10 ? '0' + value : String(value); }

/** 오프셋은 그 시각 기준으로 구한다(서머타임이 있는 지역에서 과거 시각이 어긋나지 않게). */
function offsetLabel(date) {
    var minutes = -date.getTimezoneOffset();
    if (minutes === 0) { return 'UTC'; }
    var abs = Math.abs(minutes);
    var hours = Math.floor(abs / 60);
    var rest = abs % 60;
    return 'UTC' + (minutes < 0 ? '-' : '+') + hours + (rest ? ':' + pad2(rest) : '');
}

function formatLocal(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) { return null; }
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
        + ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds())
        + ' (' + offsetLabel(date) + ')';
}

/** 서버가 심어 둔 ISO를 뷰어 시간대 표기로 바꾼다. 실패하면 ISO를 그대로 둔다. */
function localizeTimes(scope) {
    var nodes = (scope || document).querySelectorAll('time.dmove-approval-time[datetime]');
    Array.prototype.forEach.call(nodes, function (node) {
        if (node.dataset.approvalLocalized === '1') { return; }
        var text = formatLocal(node.getAttribute('datetime'));
        if (!text) { return; }
        node.textContent = text;
        node.title = node.getAttribute('datetime');   // 원본 ISO는 툴팁으로 남긴다
        node.dataset.approvalLocalized = '1';
    });
}
```
`init()`에 `localizeTimes();` 추가. 멱등(`data-approval-localized`)이므로 이후 부분 갱신이 생겨도 안전하다.

### C-4. Intl을 쓰지 않는 이유 (설계 결정)

과제 지시는 "Intl 사용"이었으나 **로컬 getter 방식을 권한다.** 목표 포맷이 로케일 독립적인 ISO 유사 고정 형식이므로 Intl이 주는 이점이 없는 반면 위험이 셋이다.

1. **`hour12:false`의 h24 버그** — 일부 엔진에서 자정이 `24:00`으로 나온다. 피하려면 `hourCycle:'h23'`을 써야 하는데 두 옵션은 상호작용 규칙이 까다롭다.
2. **로케일 구분자** — 현재 업무함 `fmt`가 `.replace(/\\./g,'-')`로 한국어 로케일의 점을 하이픈으로 바꾸는 임시 처리를 하고 있다. 브라우저 언어가 `en-US`면 `08/12/2026`이 되어 이 치환이 통하지 않는다(현존 버그).
3. **비그레고리력·비ASCII 숫자** — `th-TH` 기본 달력은 불기라 `2569`, `ar-EG`는 아라비아-인도 숫자가 나온다. 감사 화면에서 치명적이다.

`Date`의 로컬 getter는 이미 뷰어 시간대 기준이고, 오프셋은 어차피 `getTimezoneOffset()`에서 와야 한다. 즉 Intl을 써도 시간대 처리는 나아지지 않고 형식만 불안정해진다. (특정 IANA 시간대로 **고정** 표시해야 한다는 요구가 새로 생기면 그때 `Intl.DateTimeFormat(…, {timeZone})`로 바꾸고 `formatToParts`로 조립할 것.)

### C-5. 업무함 통일

업무함은 별도 IIFE라 approval.js의 클로저를 공유할 수 없다. **같은 15줄을 서블릿 템플릿에 복제**하고 양쪽에 상호 참조 주석을 단다.
```js
// approval.js의 formatLocal과 같은 규칙이다. 한쪽만 고치지 말 것.
const pad2 = …, offsetLabel = …, fmtTime = (v) => (v ? formatLocal(v) : "-");
```
- 기존 `fmt`는 **삭제**하고 호출부를 `fmtTime`으로 교체(알림 `when`, 결정 `decidedAt`, 타임라인 `occurredAt`, 요청 시각 셀, 마감 셀, `notificationDetail`의 마감 문구).
- **표 열은 예외**: `2026-08-12 14:03:22 (UTC+9)`는 27자라 좁은 셀에서 줄바꿈된다. 열 단위 시각은 한 사용자에게 오프셋이 동일하므로 **헤더에 한 번만** 붙인다.
```html
<th>요청 시각 <span class="tz" data-tz-suffix></span></th>
<th>마감 <span class="tz" data-tz-suffix></span></th>
```
```js
const tz = "(" + offsetLabel(new Date()) + ")";
document.querySelectorAll("[data-tz-suffix]").forEach((n) => { n.textContent = tz; });
const fmtCell = (v) => (v ? formatLocal(v).replace(/ \(UTC[^)]*\)$/, "") : "-");   // 셀은 초까지, 오프셋은 헤더
```
```css
#dmove-approval-app .tz{font:400 10.5px/1 var(--mono);color:var(--muted);letter-spacing:0;text-transform:none}
```
  단독으로 읽히는 시각(알림 목록, 타임라인 meta, 결정 verdict)은 **오프셋 포함 전체 형식**을 쓴다.
  → "초 + 오프셋으로 통일"이라는 요구는 지키되, 표 안에서 같은 문자열을 수십 번 반복하는 대신 열 머리에서 한 번 선언하는 형태다. 문자 그대로의 통일을 원하면 `fmtCell` 대신 `fmtTime`을 쓰고 `.when-cell{white-space:normal}`로 두 줄 허용하면 된다(권장하지 않음).

### C-6. CSS
```css
.dmove-approval-time{font-variant-numeric:tabular-nums;white-space:nowrap}
```

---

## D. 영역 해시 — 추출·정규화·비교 규칙

### D-0. 지금 코드의 치명적 한계 (먼저 고쳐야 함)

`ApprovalRegionSupport.APPROVAL_REGION_MACRO`는
```java
"<ac:structured-macro\\b(?=[^>]*\\bac:name\\s*=\\s*(['\\\"])approval-region\\1)[^>]*>(.*?)</ac:structured-macro>"
```
**non-greedy**라 영역 본문 안에 다른 매크로가 하나라도 있으면 **첫 번째 중첩 매크로의 닫는 태그에서 잘린다.** 고객(CJLBioVault)은 HTML 매크로로 페이지를 구성하므로 중첩이 예외가 아니라 기본이다. 이 정규식으로 본문을 뽑아 해시하면 **잘린 뒤쪽 내용이 바뀌어도 감지하지 못한다(거짓 음성)** — 승인된 내용이 몰래 바뀌는, 이 기능에서 가장 나쁜 실패다.

→ 정규식 대신 **깊이 인식 스캐너**를 만들고, `hasDuplicateKey`도 같은 스캐너 위로 옮긴다(단일 출처).

### D-1. 추출 — `ApprovalRegionSupport` 신규 API

```java
/** 정규화·해시 규칙 버전. 규칙을 바꾸면 v2로 올린다(§D-5). */
static final String HASH_PREFIX = "v1:";

/** 페이지 storage format → (regionKey → 해시). 파싱 실패는 Optional.empty (전량 만료 방지). */
static Optional<Map<String, String>> regionHashes(String storageFormat);

/** 단일 영역 해시. 없으면 null. */
static String regionHash(String storageFormat, String regionKey);

/** 중복 key 검사 — 위 스캐너 결과를 재사용한다. */
static boolean hasDuplicateKey(String storageFormat, String regionKey);
```

스캐너 알고리즘 (인덱스 1회 순회, 정규식 없음):
1. 커서를 옮기며 다음 토큰을 구분한다.
   - `<![CDATA[` … `]]>` → **원문 그대로** 보존, 내부는 파싱하지 않는다.
   - `<!--` … `-->`, `<?` … `?>` → 원문 보존.
   - `<` … `>` → 태그. 단, `"` / `'`로 열린 속성값 안의 `>`는 종료로 보지 않는다.
   - 그 외 → 텍스트.
2. `ac:structured-macro` 시작 태그에서 `ac:name` 속성값을 읽는다(따옴표 두 종류, 속성명 대소문자 무시). 값이 `approval-region`이면 영역 시작.
   - `<ac:structured-macro … />` 자기닫힘이면 본문 없음 → 건너뛴다.
3. 영역 매크로의 **직속 자식** `<ac:parameter ac:name="key">…</ac:parameter>`에서 key를 읽고 storage 언이스케이프 후 trim. 비었으면 `DEFAULT_KEY`.
4. 영역 매크로의 **직속 자식** `<ac:rich-text-body>`의 여는 태그 다음부터, **깊이로 짝을 맞춘** 닫는 태그 직전까지가 raw body다. `ac:structured-macro`·`ac:rich-text-body` 각각 스택 깊이를 센다.
5. 같은 key의 영역이 둘 이상이면 문서 순서대로 정규화 결과를 `(NUL)`으로 이어 붙인 뒤 한 번 해시한다. (둘 중 어느 쪽이 바뀌어도 무효화된다 — "두 영역은 같은 승인 요청을 공유합니다" 경고와 의미가 일치한다.)
6. 어떤 단계에서든 구조가 깨지면(닫는 태그 없음 등) `Optional.empty()`.

### D-2. 정규화 — 적용 (raw body 대상, CDATA/주석 **바깥**만)

| # | 규칙 | 근거 |
|---|------|------|
| N1 | `\r\n`, `\r` → `\n` | 플랫폼·편집기 차이 |
| N2 | 태그 **내부** 공백 런을 한 칸으로, `/>`·`>` 직전 공백 제거 (`<br />` ≡ `<br/>`) | 직렬화기 표기 요동. 속성 순서·따옴표 종류는 **건드리지 않는다**(직렬화기가 안정적이라 이득 없이 코드만 는다) |
| N3 | 모든 태그에서 신원 전용 속성 제거: `ac:macro-id`, `ac:local-id`, `ac:schema-version`, `ri:version-at-save` | 콘텐츠가 아니면서 편집·복사·업그레이드로 값이 바뀐다. 특히 `ac:schema-version`은 Confluence 업그레이드 시 일괄 변경될 수 있어, 남겨두면 **인스턴스 전체의 PENDING이 한 번에 만료**된다 |
| N4 | 텍스트 노드의 공백 런을 한 칸으로 | 편집기 재포맷 |
| N5 | `>` [공백] `<` → `><` | 들여쓰기·줄바꿈 변동 흡수 |
| N6 | 빈 요소 정규화: `<X …></X>` → `<X …/>` (토큰 인접 판정, 정규식 아님) | XML상 동치인 두 표기의 왕복 변동 |
| N7 | 최종 `trim()` | 앞뒤 여백 |

**N5의 대가를 명시적으로 받아들인다.** `<span>a</span> <span>b</span>`의 유의미한 한 칸이 사라져 "그 한 칸만 바꾼 편집"을 놓친다(거짓 음성). 반대편 위험은 "내용이 안 바뀐 저장인데 PENDING이 만료되는 것"(거짓 양성)인데, 편집기 왕복에서 들여쓰기 변동은 **거의 매번** 생기는 반면 인라인 한 칸만 바뀌는 편집은 드물고 피해도 작다. 이 교환이 이 기능의 존재 이유(HTML 매크로 페이지에서 남의 영역 수정 때문에 내 결재가 죽는 것 방지)와 일치한다.

### D-3. 정규화하지 **않는** 것 (과잉 정규화 금지선)

| 하지 않는 것 | 근거 |
|--------------|------|
| 엔티티 디코딩(`&lt;` → `<`) | `&lt;script&gt;`와 실제 `<script>`가 같은 해시가 되어 **내용 동일성 자체가 붕괴**한다 |
| CDATA 내부 공백 정리 | 편집기는 `ac:plain-text-body`를 불투명하게 취급해 왕복 변동이 없다. 반대로 여기서 공백을 뭉개면 HTML 매크로 안의 `<pre>`·JS 문자열 변경을 놓친다 |
| 태그명·속성명 대소문자 변환 | XML은 대소문자를 구분하고 편집기는 바꾸지 않는다 |
| 속성 순서 정렬 | 이득 없음, 파서만 복잡해짐 |
| 주석 제거 | 저자가 남긴 콘텐츠일 수 있다 |
| 공백 **전부** 제거 | `"승인 완료"` ≠ `"승인완료"`. 단어 경계가 사라지면 실제 텍스트 변경을 놓친다 |

### D-4. 해시
```java
String hash = HASH_PREFIX + sha256Hex(normalized.getBytes(StandardCharsets.UTF_8));  // "v1:" + 64 hex = 67자
```
- `MessageDigest.getInstance("SHA-256")` (JDK 표준, 추가 의존 없음).
- AO 컬럼: `@StringLength(80)` (여유 포함). `ApprovalEntity`에 `REGION_HASH` 추가 — unique가 아니므로 create 시 DBParam 강제는 아니지만, 기존 `saveFlowId`/`savePrevRequestId`와 같은 패턴을 따른다.

### D-5. 버전 접두사가 하는 일
비교 시 저장된 해시의 접두사가 현재 `HASH_PREFIX`와 다르면 **"불일치"가 아니라 "판정 불가(unknown)"**로 다룬다 → 페이지 버전 폴백으로 물러난다. 정규화 규칙을 개선할 때 전 인스턴스의 PENDING을 몰살시키지 않기 위한 안전장치다.

### D-6. 리스너 판정 흐름 — `ApprovalPageUpdateListener.onPageUpdate`

```
newStorage = event.getPage().getBodyAsString()
hashes     = ApprovalRegionSupport.regionHashes(newStorage)      // Optional

PAGE 요청            → 기존 그대로 (버전 기반 만료)
CONTENT_REGION 요청 →
  ├ 저장된 regionHash == null            → 버전 기반 만료 (마이그레이션 전 요청)
  ├ hashes.isEmpty() (파싱 실패)          → 버전 기반 만료 (fail-safe: 자동 회수 금지)
  ├ 저장된 접두사 != HASH_PREFIX          → 버전 기반 만료 (§D-5)
  ├ hashes에 key 없음 & PENDING           → cancel(system, "REGION_REMOVED")
  ├ hashes.get(key).equals(저장 해시)     → **아무 것도 하지 않는다** ← 이 기능의 핵심 이득
  └ 다르면                                → 기존 편집 만료 (EXPIRED, reason=CONTENT_VERSION)
```
- **회수는 PENDING에만.** APPROVED 요청은 영역이 사라져도 "그 시점 그 버전이 승인됐다"는 기록이므로 건드리지 않는다(배치 5의 버전 기록 모델).
- 파싱 실패를 REGION_REMOVED로 오인하면 멀쩡한 요청이 대량 회수된다. **"스캔이 성공했고 그 결과에 key가 없을 때"만** 삭제로 판정한다.
- 자동 회수·만료 모두 기존처럼 `notificationService::enqueueSafely`로 흘린다.

### D-7. stale 판정 (매크로 렌더)
```java
String currentHash = regionHashCached(conversionContext, target.regionKey());
String approvedHash = request.regionHash();   // 저장 계층에서 주입 (§G)
boolean hashKnown = approvedHash != null && currentHash != null
        && approvedHash.startsWith(ApprovalRegionSupport.HASH_PREFIX);
boolean stale = request.status() == ApprovalStatus.APPROVED
        && (hashKnown
                ? !approvedHash.equals(currentHash)
                : approvedVersion != null && target.contentVersion() > approvedVersion);
```
pill 문구(`v1 승인 · v5 미승인`)는 **그대로** 둔다. 버전 번호는 여전히 "언제 기준인지"를 알려주는 정보다. 달라지는 것은 판정뿐 — 페이지가 v5여도 이 영역의 바이트가 그대로면 stale이 아니고 pill은 `승인 완료 · v1`을 유지한다. 이게 고객이 원한 동작이다.

### D-8. 매크로 렌더 — `data-approval-region-hash`

`ApprovalRegionMacro`:
```java
private static final String REGION_HASH_CACHE_KEY =
        ApprovalRegionMacro.class.getName() + ".regionHashes";

/** settingsFor와 같은 캐시 패턴. 한 페이지에 영역이 여러 개여도 스캔은 한 번이다. */
private static Map<String, String> regionHashes(ConversionContext context) { … }
```
`openRegion`에 추가:
```java
if (regionHash != null) {
    html.append(" data-approval-region-hash=\"")
        .append(ApprovalRegionSupport.escape(regionHash))
        .append("\"");
}
```
(해시는 hex뿐이지만 escape 규칙은 예외 없이 통과시킨다.)
중복 key 검사도 같은 캐시 결과(키 목록·출현 횟수)를 쓰도록 통합해 `getBodyAsString()` 재파싱을 없앤다.

### D-9. JS — create 쿼리 포함

`submit` 핸들러:
```js
if (resourceType === 'CONTENT_REGION') {
    url += '&regionKey=' + encodeURIComponent(container.dataset.approvalRegionKey);
    if (container.dataset.approvalRegionHash) {
        url += '&regionHash=' + encodeURIComponent(container.dataset.approvalRegionHash);
    }
}
```
**서버 계약(§G)**: 서버는 저장할 해시를 **자기가 다시 계산한다.** 클라이언트 값은 낙관적 충돌 검사용이다 — 값이 오고 서버 계산값과 다르면 409(사용자가 페이지를 열어둔 사이 내용이 바뀌었다). 클라이언트 JS는 이미 409에서 `window.location.reload()`하므로 추가 분기 없이 자연히 최신 화면으로 복구된다. 클라이언트가 값을 안 보내면 서버 계산값을 그대로 저장한다.

---

## E. 업무함/설정 사이드바 레이아웃

### E-1. 아이콘–라벨 간격 (스페이스 사이드바 진입 링크)

현행 (`approval.css:804-817`):
```css
a#dmove-approval-inbox-sidebar-link::before, … {
    content:""; display:inline-block; flex:none;
    width:16px; height:16px; margin-right:8px; vertical-align:-3px;
    -webkit-mask:url("…viewBox='0 0 20 20' … M3 12.5 5 4.5h10l2 8v4H3z …") center / 16px 16px no-repeat;
}
```
간격이 넓어 보이는 원인은 셋이고, 셋 다 고친다.

**(a) 마스크 글리프의 자체 여백 (가장 큰 원인).** 트레이 path의 bbox는 `x 3–17, y 4.5–16.5`(획 두께 1.6 포함 시 대략 `2.2–17.8 / 3.7–17.3`)로, 20×20 뷰박스 안에서 좌우에 각각 ~2단위(16px 렌더 기준 ~1.7px)의 빈 공간이 있다. Confluence 기본 아이콘은 박스를 꽉 채우므로 우리 것만 더 떨어져 보인다.
→ **viewBox를 글리프에 맞춰 좁힌다**: data URI 안의 `viewBox='0 0 20 20'` → `viewBox='2 3 16 15'`. (path는 그대로.) 같은 16px 박스에서 글리프가 커져 여백이 사라진다.
같은 처리를 상단 액션 도장 아이콘(`822-836`, path bbox `x 5–15`)에도 적용: `viewBox='4 2.5 12 15'`.

**(b) 고정 마진 과다.** `margin-right:8px` → **`6px`**. (a)로 회수되는 ~1.7px과 합쳐 총 ~3.7px 좁아진다.

**(c) 부모가 flex이면 컨테이너 `gap`이 마진에 더해진다.** Confluence 버전에 따라 사이드바 항목 앵커가 flex일 수 있고, 그러면 우리 `::before`는 flex 아이템이 되어 `gap + margin-right`가 이중으로 붙는다.
→ 앵커 쪽에 가드 규칙을 추가한다(플렉스가 아니면 무시된다):
```css
a#dmove-approval-inbox-sidebar-link,
a.dmove-approval-inbox-sidebar-link,
li.dmove-approval-inbox-sidebar-link > a,
a#dmove-approval-request-action,
a.dmove-approval-request-trigger,
li.dmove-approval-request-trigger > a{gap:0}
```

**앱 내부 사이드바**: `NavMarkup.css()`의 `.wb-nav__item{gap:9px}` → **`8px`**. 아이콘은 16px SVG를 인라인으로 넣으므로 자체 여백 문제는 없다(`stroke` 도형이 뷰박스를 거의 채운다).

**검증(QA 항목)**: 스페이스 사이드바에서 네이티브 "페이지"·"블로그" 항목과 "승인 업무함" 항목을 나란히 두고, 아이콘 오른쪽 끝 → 라벨 첫 글자 왼쪽 끝 거리를 개발자 도구로 측정. 오차 1px 이내가 목표. 실제 값이 다르면 (b)의 6px만 조정한다(다른 두 교정은 유지).

### E-2. 사이드바를 콘텐츠 영역 왼쪽 전체 기둥으로

**현재 구조와 문제**
```
#dmove-approval-app
├─ header.app-head        ← h1 + lede가 전폭
└─ div.workbench {grid: 216px 1fr; align-items:start}
   ├─ nav.wb-nav          ← position:sticky; 내용 높이만큼만 → "떠 있는 기둥"
   └─ div.wb-main
```
원인은 둘이다. (1) 제목이 그리드 **바깥 위**에 있어 사이드바가 중간부터 시작한다. (2) `align-items:start` + `position:sticky`라 nav 박스가 내용 높이로 줄어들어 `border-right` 괘선이 짧게 끊긴다.

**마크업 변경 (두 서블릿 TEMPLATE 동일)**
```html
<div id="dmove-approval-app" …>__NAV_BOOT__
  <div class="workbench">
__APP_NAV__
    <div class="wb-main">
      <header class="app-head">
        <h1>__DISPLAY_NAME__님의 승인 업무함</h1>
        <p class="lede">…</p>
      </header>
      …지표/필터/패널…
    </div>
  </div>
</div>
```
= `header.app-head` 블록을 `.wb-main`의 첫 자식으로 **이동**만 한다(내용 변경 없음). `ApprovalSettingsServlet`도 동일.

**NavMarkup.nav() 구조 변경** — 늘어난 기둥과 sticky를 분리하려면 내부 래퍼가 필요하다.
```java
html.append("<nav id='dmove-approval-nav' class='wb-nav' aria-label='승인 앱 메뉴'>");
html.append("<div class='wb-nav__inner'>");
…기존 bar/title/group 전부…
html.append("</div></nav>");
```
`script()`의 `nav.querySelector(".wb-nav__toggle")`·`nav.querySelectorAll(".wb-nav__item")`은 후손 검색이라 그대로 동작한다.

**CSS 변경 (NavMarkup.css())**
```css
/* 사이드바가 콘텐츠 영역 왼쪽을 세로로 관통한다. 기둥은 늘리고(stretch) 붙박이는 안쪽에서 한다. */
#dmove-approval-app .workbench{display:grid;grid-template-columns:216px minmax(0,1fr);gap:28px;
  align-items:stretch;min-height:60vh;
  transition:grid-template-columns .18s cubic-bezier(.2,.7,.3,1),gap .18s cubic-bezier(.2,.7,.3,1)}
#dmove-approval-app .wb-nav{padding:0 20px 24px 0;border-right:1px solid var(--rule);min-width:0}
#dmove-approval-app .wb-nav__inner{position:sticky;top:56px}
#dmove-approval-app .wb-main{min-width:0}
#dmove-approval-app .wb-main .app-head{margin:0 0 24px}
```
- `align-items:start` → **`stretch`**: nav 그리드 아이템이 행 높이를 채워 `border-right`가 위에서 아래까지 이어진다.
- `position:sticky`는 **`.wb-nav__inner`로 이동**. 늘어난 박스에는 sticky가 의미가 없다(움직일 여지가 없다). 안쪽 래퍼가 붙박이 역할을 한다.
- `top:56px` 근거: Confluence 9의 `.aui-header`는 40px 고정이다. 40 + 16px 여유 = 56px. 기존 `top:16px`은 스크롤 시 항목이 헤더 밑으로 들어가는 문제가 있었다.
- **min-height는 `60vh`.** `calc(100vh - 260px)` 같은 값은 데코레이터 크롬 높이를 가정한 매직 넘버라 스킨/공지 배너에 따라 깨진다. `60vh`는 가정 없이 "짧은 화면에서도 기둥이 충분히 길다"만 보장한다.

**접힘(rail) 규칙** — `@media (min-width:1025px)` 블록에서 padding 셀렉터만 갱신:
```css
#dmove-approval-app.is-nav-collapsed .workbench{grid-template-columns:56px minmax(0,1fr);gap:20px}
#dmove-approval-app.is-nav-collapsed .wb-nav{padding:0 8px 24px 0}
```
나머지(`.wb-nav__bar`, `__title`, `__item`, `__label`, `__badge`) 규칙은 후손 셀렉터라 래퍼가 생겨도 그대로 맞는다.

**≤1024 가로 스트립** — flex/overflow를 `.wb-nav`에서 `__inner`로 옮긴다:
```css
@media (max-width:1024px){
  #dmove-approval-app .workbench{grid-template-columns:1fr;gap:16px;min-height:0}
  #dmove-approval-app .wb-nav{position:static;padding:0 0 2px;
    border-right:0;border-bottom:1px solid var(--rule)}
  #dmove-approval-app .wb-nav__inner{position:static;display:flex;align-items:center;gap:12px;
    overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
  … 기존 __bar/__title/__group/__item/__label 규칙 그대로 …
}
```
`min-height:0`으로 되돌리는 것이 중요하다 — 1열에서 60vh 최소 높이는 짧은 목록 아래에 빈 공간만 만든다.

**데코레이터 크롬과의 여백**
- 앱 루트 `padding:0 0 48px` 유지. **좌측 패딩·마진을 새로 넣지 않는다** — 데코레이터 `#main`이 이미 좌우 패딩을 준다. 사이드바 기둥이 콘텐츠 영역 왼쪽 끝에 붙는 것이 목표다.
- `position:fixed`·`height:100vh` 금지. 데코레이터가 자체 스크롤/스티키 헤더를 가지므로 뷰포트 고정은 크롬과 싸운다. sticky + min-height만 쓴다.
- 리스크: 상위 컨테이너에 `overflow:hidden`이 걸려 있으면 sticky가 죽는다. 그 경우에도 레이아웃은 유지되고 nav만 같이 스크롤되므로 허용 가능한 열화다(QA 확인 항목).

---

## F. 업무함 지표 재디자인 + 필터 + 페이징

기존 `TABS`/`render`/`detail` 구조를 유지하고 그 위에 **필터 상태 객체 하나**를 얹는다.

### F-1. 지표 → 행동 유도형 상태 칩 레일

**제거**: `<section class="summary">` 마크업, `.summary`/`.metric` CSS(`124-134`), 입장 모션의 `.summary .metric:nth-child()` 지연(`213-215`), `metrics()` 함수, `#pending-count`·`#approved-count`·`#rejected-count`·`#expired-count` id, `[data-status-label]` 초기화 루프.

**대체 마크업**
```html
<section class="facets" aria-label="상태 요약과 필터">
  <div class="chips" id="status-chips" role="group" aria-label="상태 필터"></div>
</section>
```
**칩 구성** (JS 생성)
- 상태 칩 5종: PENDING / APPROVED / REJECTED / EXPIRED / **CANCELLED**.
- 주의 칩 2종: `마감 임박`(dueSoon), `기한 지남`(expiresAt < now && PENDING).
- **표시 규칙**: 건수 0이면 숨긴다. 단 현재 켜져 있는 칩은 0이어도 남긴다(끌 수 없으면 갇힌다).
- **개수 의미(패싯 카운트)**: "현재 탭 + 상태 외 모든 필터"를 적용한 뒤의 건수. 상태 칩을 켜도 다른 상태 칩의 숫자가 0으로 무너지지 않아야 탐색이 된다.

```js
const STATUS_ORDER = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"];
function renderChips(base) {                       // base = 상태 필터 제외 후 rows
  const box = document.getElementById("status-chips");
  box.replaceChildren();
  STATUS_ORDER.forEach((s) => {
    const n = base.filter((r) => r.status === s).length;
    const on = state.status.includes(s);
    if (!n && !on) return;
    const chip = el("button", undefined, "chip chip--" + s);
    chip.type = "button";
    chip.dataset.status = s;
    chip.setAttribute("aria-pressed", String(on));
    chip.append(el("b", String(n), "chip__n"), el("span", label(s), "chip__t"));
    chip.onclick = () => { toggleStatus(s); };
    box.append(chip);
  });
  [["soon", "마감 임박", (r) => r.dueSoon === true],
   ["over", "기한 지남", (r) => r.status === "PENDING" && r.expiresAt && new Date(r.expiresAt) < Date.now()]]
    .forEach(([k, text, test]) => {
      const n = base.filter(test).length;
      const on = state.due === k;
      if (!n && !on) return;
      const chip = el("button", undefined, "chip chip--due chip--due-" + k);
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(on));
      chip.append(el("b", String(n), "chip__n"), el("span", text, "chip__t"));
      chip.onclick = () => { setFilter("due", on ? "" : k); };
      box.append(chip);
    });
}
```
**CSS**
```css
#dmove-approval-app .facets{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
#dmove-approval-app .chips{display:flex;flex-wrap:wrap;gap:8px}
#dmove-approval-app .chip{display:inline-flex;align-items:center;gap:7px;padding:5px 12px 5px 10px;
  border:1px solid var(--rule);border-radius:999px;background:var(--paper);color:var(--ink-soft);
  font:inherit;font-size:12.5px;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
#dmove-approval-app .chip::before{content:"";width:7px;height:7px;border-radius:50%;
  background:var(--muted);flex:none}
#dmove-approval-app .chip--PENDING::before{background:var(--pending)}
#dmove-approval-app .chip--APPROVED::before{background:var(--approved)}
#dmove-approval-app .chip--REJECTED::before{background:var(--rejected)}
#dmove-approval-app .chip--EXPIRED::before{background:var(--expired)}
#dmove-approval-app .chip--CANCELLED::before{background:transparent;box-shadow:inset 0 0 0 1.5px var(--expired)}
#dmove-approval-app .chip--due{border-style:dashed}
#dmove-approval-app .chip--due-soon::before{background:var(--pending)}
#dmove-approval-app .chip--due-over::before{background:var(--rejected)}
#dmove-approval-app .chip__n{font:700 13px/1 var(--mono);font-variant-numeric:tabular-nums}
#dmove-approval-app .chip:hover{background:var(--sunk)}
#dmove-approval-app .chip[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
#dmove-approval-app .chip[aria-pressed="true"] .chip__n{color:var(--accent)}
#dmove-approval-app .chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
#dmove-approval-app .facets{animation:dmove-rise .42s cubic-bezier(.2,.7,.3,1) both}
```
왜 이게 나은가: (i) 개수를 보여주는 기능은 유지하면서 **누르면 걸러진다**는 목적이 생긴다. (ii) 칩은 wrap하므로 상태가 5개든 7개든 그리드가 무너지지 않는다(§B-7의 5칸 문제 해소). (iii) 색·점 모양·숫자·라벨 4중 신호라 색맹 대응이 유지된다. (iv) 새 토큰 없이 기존 상태색만 쓴다.

### F-2. 필터 바

**마크업** — `#view-list` 패널 헤드 아래.
```html
<div class="panel-head">
  <h2 id="view-list-title">내 차례</h2>
  <span class="count" id="request-count" role="status">0건</span>
  <button type="button" class="ghost" id="filter-toggle" aria-expanded="false" aria-controls="filter-bar">필터</button>
</div>
<form class="filters" id="filter-bar" hidden>
  <div class="filters__row">
    <label class="filters__f filters__f--grow"><span class="sr-only">대상 검색</span>
      <input type="search" id="f-q" placeholder="페이지 제목 검색" autocomplete="off" maxlength="100"></label>
    <label class="filters__f"><span>스페이스</span><select id="f-space"><option value="">전체</option></select></label>
    <label class="filters__f"><span>요청자</span><select id="f-requester"><option value="">전체</option></select></label>
    <label class="filters__f"><span>Flow</span><select id="f-flow"><option value="">전체</option></select></label>
  </div>
  <div class="filters__row">
    <label class="filters__f"><span>요청일</span><select id="f-range">
      <option value="">전체</option><option value="1">오늘</option><option value="7">최근 7일</option>
      <option value="30">최근 30일</option><option value="custom">직접 지정</option></select></label>
    <label class="filters__f" data-custom hidden><span>시작</span><input type="date" id="f-from"></label>
    <label class="filters__f" data-custom hidden><span>끝</span><input type="date" id="f-to"></label>
    <label class="filters__f"><span>마감</span><select id="f-due">
      <option value="">전체</option><option value="soon">임박만</option>
      <option value="over">지남만</option><option value="none">마감 없음</option></select></label>
    <label class="filters__check"><input type="checkbox" id="f-myturn">내 차례만</label>
    <button type="button" class="ghost" id="filter-reset">전체 해제</button>
  </div>
</form>
<div class="active-filters" id="active-filters" aria-label="적용된 필터"></div>
```
- 서블릿 화면은 단일 인스턴스라 `id`/`for` 사용이 안전하다(매크로 제약과 다름). 여기서는 감싸는 `<label>`을 쓰므로 `for`도 불필요하다.
- `f-space`/`f-requester`/`f-flow` 옵션은 **로드된 행에서 distinct 추출**해 채운다(서버 왕복 없음).
- `마감` select와 §F-1의 주의 칩은 **같은 `state.due`를 공유**한다(단일 진실 원천). 칩은 바로가기, select는 전체 목록.
- 필터 바는 기본 접힘. 활성 필터가 하나라도 URL에 있으면 열린 채로 시작한다.

**상태 객체와 판정**
```js
const PAGE = 50;
const state = {q:"", status:[], space:"", requester:"", flow:"", from:"", to:"", due:"", myturn:false, limit:PAGE};

function matches(r, skip) {
  if (skip !== "q" && state.q && !(r.pageTitle || "").toLowerCase().includes(state.q.toLowerCase())) return false;
  if (skip !== "status" && state.status.length && !state.status.includes(r.status)) return false;
  if (skip !== "space" && state.space && r.spaceKey !== state.space) return false;
  if (skip !== "requester" && state.requester && (r.requesterKey || "") !== state.requester) return false;
  if (skip !== "flow" && state.flow && (r.flowId || "") !== state.flow) return false;
  if (skip !== "myturn" && state.myturn && r.myTurn !== true) return false;
  if (skip !== "date" && (state.from || state.to)) {
    const t = new Date(r.createdAt).getTime();
    if (state.from && t < new Date(state.from + "T00:00:00").getTime()) return false;
    if (state.to && t > new Date(state.to + "T23:59:59.999").getTime()) return false;
  }
  if (skip !== "due" && state.due) {
    if (state.due === "none" && r.expiresAt) return false;
    if (state.due === "soon" && r.dueSoon !== true) return false;
    if (state.due === "over" && !(r.status === "PENDING" && r.expiresAt
        && new Date(r.expiresAt) < Date.now())) return false;
  }
  return true;
}
```
`show(tab)` 수정:
```js
function show(tab) {
  const spec = TABS[tab] || TABS.myturn;
  const tabRows = spec.rows();
  renderChips(tabRows.filter((r) => matches(r, "status")));
  const rows = tabRows.filter((r) => matches(r));
  listTitle.textContent = spec.label;
  render(rows, spec.empty);
  requestCount.textContent = spec.label + " " + rows.length + "건"
    + (rows.length !== tabRows.length ? " (전체 " + tabRows.length + "건 중)" : "");
  renderActiveFilters();
  syncNavBadges();
  writeUrl();
}
```
- **사이드바 배지는 필터를 적용하지 않는다**(`syncNavBadges`는 지금처럼 `TABS[x].rows().length`). 배지는 "그 탭에 뭐가 있나"를 알리는 지표이고, 필터를 반영하면 다른 탭으로 이동할 이유가 사라진다.
- 검색 입력은 200ms 디바운스.
- 필터·탭이 바뀌면 `state.limit = PAGE`로 리셋.

**활성 필터 칩**
```js
function renderActiveFilters() {
  const box = document.getElementById("active-filters");
  box.replaceChildren();
  const items = [];
  if (state.q) items.push(["q", "검색: " + state.q]);
  state.status.forEach((s) => items.push(["status:" + s, "상태: " + label(s)]));
  if (state.space) items.push(["space", "스페이스: " + (spaceName(state.space) || state.space)]);
  if (state.requester) items.push(["requester", "요청자: " + requesterName(state.requester)]);
  if (state.flow) items.push(["flow", "Flow: " + flowName(state.flow)]);
  if (state.from || state.to) items.push(["date", "기간: " + (state.from || "…") + " ~ " + (state.to || "…")]);
  if (state.due) items.push(["due", "마감: " + {soon:"임박만", over:"지남만", none:"없음"}[state.due]]);
  if (state.myturn) items.push(["myturn", "내 차례만"]);
  if (!items.length) return;
  items.forEach(([key, text]) => {
    const b = el("button", undefined, "afchip");
    b.type = "button";
    b.append(el("span", text), el("span", "×", "afchip__x"), el("span", " 필터 제거", "sr-only"));
    b.onclick = () => clearFilter(key);
    box.append(b);
  });
  const all = el("button", "전체 해제", "ghost");
  all.type = "button";
  all.onclick = resetFilters;
  box.append(all);
}
```
`aria-live`를 붙이지 않는다 — `#request-count`가 이미 `role="status"`라 필터 변경마다 "내 차례 12건 (전체 40건 중)"이 한 번 읽힌다. 활성 필터 칩까지 live로 만들면 이중 낭독이 된다. (`×` 기호는 `span`, 보조 설명도 `span.sr-only` — sr-only는 span에만 규칙 준수.)

**URL 동기화**
```js
function writeUrl() {
  const p = new URLSearchParams();
  const sp = new URLSearchParams(location.search).get("spaceKey");
  if (sp) p.set("spaceKey", sp);                 // 스페이스 문맥 진입 링크 보존
  p.set("view", currentView);
  if (state.q) p.set("f_q", state.q);
  if (state.status.length) p.set("f_status", state.status.join(","));
  if (state.space) p.set("f_space", state.space);
  if (state.requester) p.set("f_requester", state.requester);
  if (state.flow) p.set("f_flow", state.flow);
  if (state.from) p.set("f_from", state.from);
  if (state.to) p.set("f_to", state.to);
  if (state.due) p.set("f_due", state.due);
  if (state.myturn) p.set("f_myturn", "1");
  history.replaceState(null, "", location.pathname + "?" + p.toString());
}
```
읽기는 기존 `?view=` 파싱 IIFE를 확장하고 **화이트리스트 검증**을 건다.
```js
try {
  const q = new URLSearchParams(location.search);
  state.q = (q.get("f_q") || "").slice(0, 100);
  state.status = (q.get("f_status") || "").split(",").filter((s) => STATUS_ORDER.includes(s));
  state.due = ["soon","over","none"].includes(q.get("f_due")) ? q.get("f_due") : "";
  state.myturn = q.get("f_myturn") === "1";
  state.from = /^\d{4}-\d{2}-\d{2}$/.test(q.get("f_from") || "") ? q.get("f_from") : "";
  …
} catch (_) {}
```
- `replaceState`(pushState 아님): 필터 조작마다 뒤로가기 히스토리가 쌓이면 방해가 된다. 새로고침·URL 공유·§B-6의 `location.reload()` 복원은 그대로 된다.
- `f_space`/`f_requester`/`f_flow`는 키 값이므로 검증 없이 문자열 비교에만 쓰인다(DOM 삽입은 `textContent`).

**스페이스 필터는 백엔드 확장이 필요하다** — 현재 `requestObject`에 `pageId`/`pageTitle`만 있고 스페이스 정보가 없다. `page`(AbstractPage)를 이미 들고 있으므로 두 줄이면 된다(§G).

**CSS**
```css
#dmove-approval-app .filters{display:flex;flex-direction:column;gap:10px;padding:12px 20px;
  border-bottom:1px solid var(--rule);background:var(--sunk)}
#dmove-approval-app .filters[hidden]{display:none}
#dmove-approval-app .filters__row{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}
#dmove-approval-app .filters__f{display:flex;flex-direction:column;gap:3px;min-width:0;
  font-size:11.5px;color:var(--muted)}
#dmove-approval-app .filters__f--grow{flex:1 1 220px}
#dmove-approval-app .filters__f input,#dmove-approval-app .filters__f select{font:inherit;font-size:13px;
  padding:5px 8px;border:1px solid var(--rule);border-radius:6px;background:var(--paper);color:var(--ink);min-width:0}
#dmove-approval-app .filters__check{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-soft)}
#dmove-approval-app .filters__row .ghost{margin-left:auto}
#dmove-approval-app .active-filters:empty{display:none}
#dmove-approval-app .active-filters{display:flex;flex-wrap:wrap;gap:6px;padding:10px 20px;
  border-bottom:1px solid var(--rule-soft)}
#dmove-approval-app .afchip{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;
  border:1px solid var(--accent);border-radius:999px;background:var(--accent-soft);color:var(--accent);
  font:inherit;font-size:12px;cursor:pointer}
#dmove-approval-app .afchip__x{font-weight:700;line-height:1}
#dmove-approval-app .afchip:hover{background:var(--paper)}
#dmove-approval-app .afchip:focus-visible,#dmove-approval-app .chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:600px){#dmove-approval-app .filters__f--grow{flex:1 1 100%}}
```

### F-3. 더 보기(클라이언트 페이징)

```html
<div class="more-bar" id="more-bar" hidden>
  <button type="button" class="ghost" id="more">더 보기</button>
  <span class="count" id="more-count"></span>
</div>
```
(테이블 `</table>` 다음, `.table-wrap` 바깥.)

`render(rows, empty)` 수정 요점:
```js
function render(rows, empty) {
  list.replaceChildren();
  if (!rows.length) { …기존 empty 행… ; syncMore(0, 0); return; }
  const shown = rows.slice(0, state.limit);
  const frag = document.createDocumentFragment();          // 행마다 reflow하지 않는다
  shown.forEach((r, index) => {
    const tr = el("tr", undefined, "row");
    if (index < 8) tr.style.animationDelay = index * 0.03 + "s";   // 애니메이션은 첫 화면에만
    …기존 셀 조립…
    frag.append(tr);
  });
  list.append(frag);
  syncMore(shown.length, rows.length);
}

function syncMore(shown, total) {
  const bar = document.getElementById("more-bar");
  const btn = document.getElementById("more");
  const info = document.getElementById("more-count");
  bar.hidden = total <= shown;
  info.textContent = total ? shown + " / " + total + "건 표시" : "";
  btn.textContent = "더 보기 (남은 " + Math.max(0, total - shown) + "건)";
}

document.getElementById("more").onclick = () => {
  state.limit += PAGE;
  const before = list.querySelectorAll("tr.row").length;
  show(currentView);
  const rows = list.querySelectorAll("tr.row");
  // 버튼이 사라지면 포커스가 body로 날아간다 → 새로 추가된 첫 행으로 옮긴다
  if (document.getElementById("more-bar").hidden && rows[before]) {
    const link = rows[before].querySelector("a");
    if (link) link.focus();
  }
};
```
```css
#dmove-approval-app .more-bar{display:flex;align-items:center;gap:12px;padding:12px 20px;
  border-top:1px solid var(--rule-soft)}
#dmove-approval-app .more-bar[hidden]{display:none}
#dmove-approval-app .more-bar .count{margin-left:auto}
```
- `state.limit` 리셋 시점: 탭 전환, 필터 변경, 정렬(향후).
- 상세 확장 행은 `tr.after()`로 붙으므로 `querySelectorAll("tr.row")` 인덱스와 어긋나지 않는다(`.detail`은 `row` 클래스가 아니다).
- 렌더 비용의 진짜 병목은 DOM이 아니라 `/mine` 응답 자체다(요청마다 decisions/steps/events 전량) — §G의 서버 페이징이 근본책이다. 클라이언트 페이징은 렌더/스크롤 부담만 줄인다.

---

## G. 백엔드 후속 요구 (오케스트레이터·backend 담당)

이 UI 설계가 성립하려면 필요한 서버 쪽 항목이다. 우선순위 순.

**이번 배치에 반드시 필요**
1. `POST /approvals/{id}/cancel?actorKey=&reason=` — 요청자 본인 또는 Confluence 관리자만. `actorKey`는 신뢰하지 않고 세션 사용자로 재검증. PENDING이 아니면 409. 성공 시 요청자·미결 승인자에게 알림 enqueue(§B-7의 "지표에 안 넣는" 근거가 이 알림에 의존한다).
2. `requestObject`에 **`requestMessage`** 추가.
3. `requestObject`에 **`spaceKey`, `spaceName`** 추가 (`page.getSpaceKey()`, `page.getSpace().getName()`; page가 null이면 null) — §F-2 스페이스 필터.
4. `POST /approvals`에 `requestMessage` 파라미터. **500자 초과 시 400**(메시지: "요청 메모는 500자까지 입력할 수 있습니다.").
5. 설정: `ApprovalSettings.read()`에 `CANCELLED` 라벨(기본 "회수"), REST `saveSettings`에 `@QueryParam("cancelledLabel")`.
6. 영역 해시:
   - `ApprovalEntity.REGION_HASH` 컬럼(`@StringLength(80)`) + `saveRegionHash`/`findRegionHashes` (`savePrevRequestId` 패턴).
   - create 시 **서버가 storage에서 재계산해 저장**. 클라이언트 `regionHash`가 오고 다르면 409.
   - `ApprovalRequest`(또는 REST/패널 조회 경로)에서 저장된 해시를 읽을 수 있어야 한다 — 도메인 aggregate를 오염시키지 않으려면 배치 5의 `prevRequestId`처럼 **어댑터 계층에서 map으로 주입**하는 방식을 권한다.
   - 도메인에 **해시 기반 만료 진입점** 필요: `expireForContentVersion`은 버전 비교를 내장하므로 그대로는 못 쓴다. 예) `expireForRegionChange(int currentContentVersion, Instant now)` — PENDING만, 사유 `CONTENT_VERSION`.
   - `cancel(actorKey, …)`의 `normalizeActorKey`가 null을 허용하는지 확인. 시스템 회수(REGION_REMOVED)의 actor 표기가 필요하다(null → 화면에서 "시스템"으로 표시되는 기존 규칙 재사용이 가장 깔끔).
   - 업무함 `stale` 계산도 CONTENT_REGION이면 해시 기준으로.
7. 이메일: `EmailNotificationMessage.Context`에 `requestMessage`·`cancelled` (§A-6). **REQUESTED 이벤트의 reason이 "반려 사유"로 찍히는 버그를 같이 막아야 한다.**

**성능 배치(다음)로 미루는 것 — 서버 페이징·필터**
```
GET /approvals/mine?actorKey=&limit=50&offset=0
    &status=PENDING,REJECTED&q=&spaceKey=&requesterKey=&flowId=
    &createdFrom=2026-08-01&createdTo=2026-08-12&due=soon|over|none
→ {"items":[…], "total": 173}
```
- `limit` 상한 200, 기본 50. `offset` 음수 거절.
- `/mine/requested`도 동일 계약.
- 목록 응답에서 `events`를 빼고 상세 조회(`GET /approvals/{id}`)에서만 채우는 안을 함께 검토 — 현재 `requestObject`는 요청 1건마다 `findApproverViaGroups` 등 AO 조회가 붙어 목록 크기에 선형으로 비싸다.
- 서버 페이징이 들어오면 §F의 클라이언트 필터는 "서버 파라미터 조립기"로 바꾸면 되고, `state`/URL 스키마는 그대로 재사용된다(그래서 키 이름을 REST 파라미터와 맞춰 뒀다).

---

## H. 접근성 체크리스트

**입력·라벨**
- [ ] 매크로/패널 내부의 모든 입력은 **감싸는 `<label>`** (id/for 금지 — 한 페이지 다중 렌더).
- [ ] 글자수 카운터는 `aria-hidden="true"`. 한도는 **라벨 텍스트**에 명시("선택 · 최대 500자"). live region으로 만들지 않는다.
- [ ] `sr-only`는 **span에만** (`.dmove-approval-sr-only`, 서블릿 `.sr-only`). div/button 자체에 붙이지 않는다.

**모달·확인 스텝**
- [ ] 상세/요청 모달: `role="dialog" aria-modal="true" aria-label` 유지.
- [ ] 회수 버튼 `aria-expanded`, 확인 섹션 `aria-label="요청 회수 확인"`.
- [ ] 확인 스텝을 열면 사유 textarea로 포커스, `scrollIntoView({block:'nearest'})`.
- [ ] **ESC 우선순위**: 확인 스텝 → 모달. 확인 스텝을 닫으면 포커스가 "요청 회수" 버튼으로 복귀.
- [ ] 모달을 닫으면 확인 스텝 상태 초기화(다음에 열 때 펼쳐진 채로 남지 않게).
- [ ] 위험 동작은 색만으로 구분하지 않는다 — 텍스트("회수 확정") + 2단계 확인 + 경고 문구.

**상태 표현**
- [ ] CANCELLED는 색(회색) + 라벨("회수") + 아이콘 + 점선 테두리 **4중 신호**. EXPIRED와 색이 같아도 구분된다.
- [ ] 상태 칩은 점 색 + 숫자 + 텍스트 병행. 색만으로 상태를 구분하는 지점이 없다.

**시각**
- [ ] `<time datetime>` 원본 ISO 유지, 표시 텍스트만 치환, `title`에 ISO 보존.
- [ ] JS 미동작 시 ISO 원문이 그대로 보인다(폴백).
- [ ] 열 머리의 `(UTC+9)`는 시각 정보의 일부이므로 `sr-only`가 아니라 보이는 텍스트로 둔다.

**필터·목록**
- [ ] 칩은 `<button type="button" aria-pressed>` (링크·체크박스 흉내 금지), 묶음은 `role="group" aria-label`.
- [ ] 활성 필터 제거 버튼에 `<span class="sr-only"> 필터 제거</span>`. `×`만 단독으로 두지 않는다.
- [ ] 라이브 리전은 `#request-count`(`role="status"`) 하나로 통일. 활성 필터 컨테이너·칩 레일에는 `aria-live` 금지(이중 낭독).
- [ ] 필터 바 토글 버튼에 `aria-expanded`/`aria-controls`.
- [ ] "더 보기"로 버튼이 사라질 때 포커스를 새로 추가된 첫 행으로 이동.
- [ ] 표의 `td.colSpan = 7` 유지(열 수 변경 없음). 열을 추가하면 empty/detail 양쪽을 같이 고칠 것.
- [ ] 모든 새 인터랙티브 요소에 `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`.

**모션·크롬**
- [ ] 새 애니메이션은 입장 `dmove-rise` 재사용만. `prefers-reduced-motion` 블록이 `#dmove-approval-app *`를 덮으므로 자동 적용된다.
- [ ] 데코레이터 하위에서 `position:fixed`/`100vh`/자체 다크모드 금지(§E-2).

---

## I. 기존 코드에서 제거할 부분

| 파일 | 제거 |
|------|------|
| `ApprovalInboxServlet` | `<section class="summary">` 마크업, `.summary`/`.metric` CSS 블록, 입장 모션의 `.summary .metric:nth-child(2|3|4)` 지연 규칙, `metrics()` 함수와 호출, `#pending-count` 등 4개 id, `[data-status-label]` 초기화 루프, `fmt` 상수(→ `formatLocal`/`fmtCell`), `@media(max-width:900px)`·`(600px)`의 `.summary` 규칙 |
| `ApprovalRegionSupport` | `APPROVAL_REGION_MACRO`·`KEY_PARAMETER` 정규식 상수와 정규식 기반 `hasDuplicateKey` 본문 (→ 스캐너 재사용) |
| `ApprovalMarkup` | 제거 없음. 단 `iconFor`의 exhaustive switch에 CANCELLED 추가는 **필수**(컴파일) |
| `NavMarkup.css()` | `.wb-nav{position:sticky;top:16px}` (→ `.wb-nav__inner{position:sticky;top:56px}`), `.workbench{align-items:start}` (→ `stretch`), ≤1024의 `.wb-nav` flex/overflow 선언 (→ `__inner`) |
| 두 서블릿 TEMPLATE | `header.app-head`의 **위치**(삭제가 아니라 `.wb-main` 안으로 이동) |

---

## J. C10 이식 백로그 (approval-confluence10)
C9 전용으로 구현하고, 다음 항목을 이식 목록에 적어 둔다. C10은 순차 승인 이전 상태라 자동으로 따라오지 않는다.
- CANCELLED 상태/아이콘/pill·stamp CSS, 회수 모달·확인 스텝, `/cancel` 엔드포인트
- requestMessage 입력·표시·이메일
- `<time>` 래핑 + `localizeTimes`
- `ApprovalRegionSupport` 스캐너·정규화·해시(정규식 버전의 중첩 매크로 버그도 함께)
- `wb-nav__inner` 구조 변경, 아이콘 간격 교정
- 업무함 칩/필터/더 보기

---

## K. 구현 순서 제안
1. **B-2 + iconFor** (컴파일 복구가 먼저다) → 설정 라벨(B-8)
2. A(요청 메모) 전체 — 마크업·JS·상세·업무함·이메일(A-6의 버그 수정 포함)
3. B 나머지 — 상세 모달 회수, `data-approval-user-key`, 업무함 회수
4. C(시각) — 서버 `<time>` → approval.js → 업무함 통일
5. D(영역 해시) — 스캐너·정규화·해시 → 리스너 → 매크로 렌더/JS. **스캐너 단위 테스트를 먼저 쓸 것**(중첩 매크로·CDATA·자기닫힘·중복 key·깨진 XML 5케이스)
6. E(사이드바) — 마크업 이동 → CSS → 아이콘 간격
7. F(업무함) — 칩 → 필터 상태/URL → 활성 칩 → 더 보기
