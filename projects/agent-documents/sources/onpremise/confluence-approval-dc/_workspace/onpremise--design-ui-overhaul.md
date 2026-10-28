# UI 전면 개편 설계 — 데코레이터 통합 + 패널 pill/모달

대상 모듈: `approval-confluence9` (C10 미이식, 백로그 기록만).
구현: Codex. 이 문서는 스펙이며, 여기 적힌 클래스명·토큰명·셀렉터를 그대로 쓴다.

관련 파일
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalSettingsServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/panel/ApprovalPagePanel.java`
- `approval-confluence9/src/main/resources/js/approval.js`
- `approval-confluence9/src/main/resources/css/approval.css`

---

## 0. 전제와 데이터 계약

### 0.1 REST가 이미 내려주는 필드 (변경 없음)
`GET /rest/approval/1.0/approvals/mine?actorKey=` 및 `/mine/requested` 의 요청 객체
(`ApprovalRestResource#requestObject`)에 아래가 이미 있다. 새로 추가할 필요 없다.

```
id status resourceType pageId pageTitle regionKey contentVersion revision
requesterKey requesterDisplayName minimumApprovals approvalCount
stepCount currentStepOrder approvedContentVersion expiredByEdit requiresReapproval
myStepOrder myTurn createdAt updatedAt expiresAt dueSoon flowId flowName
decisions[] steps[] events[] myDecision
```

특히 **`myTurn`(boolean)**, **`myStepOrder`(int)**, **`myDecision`("APPROVED"|"REJECTED"|null)**,
**`dueSoon`(boolean)** 가 4탭 분기의 근거다. 추가 REST 작업 없음.

### 0.2 REST가 새로 내려줘야 하는 것 (알림 피드용, 별도 작업)
`GET /notifications` 의 항목에 다음 계약을 전제한다.

| 필드 | 기존 | 변경 |
|------|------|------|
| `eventType` | `REQUESTED\|APPROVED\|REJECTED\|EXPIRED` | **`DUE_SOON` 추가** |
| `reason` | 문자열 또는 null | DUE_SOON 항목은 **항상 null** |
| `expiresAt` | 없음 | **추가** (ISO-8601, DUE_SOON 항목은 non-null) |

UI는 `expiresAt`이 없으면 마감 문구를 생략하도록 방어적으로 짠다(REST 선행/후행 순서에 무관하게 동작).

### 0.3 CSS 충돌 방지 원칙 (서블릿 두 화면 공통)
데코레이터 하위에서는 서블릿의 `<style>`이 Confluence 크롬 전체에 적용된다.
**서블릿 `<style>` 안의 모든 셀렉터는 예외 없이 루트 ID `#dmove-approval-app` 으로 스코프한다.**

- `*{box-sizing:border-box}` → `#dmove-approval-app *{box-sizing:border-box}`
- `body{...}` → 삭제하고 필요한 값만 `#dmove-approval-app{...}` 으로 이관
- `h1{...}` → `#dmove-approval-app h1{...}`
- `table{...}`, `thead th{...}`, `tbody td{...}`, `label{}`, `input[...]{}`, `button{}` 전부 동일 처리
- `:root{--paper:...}` → `#dmove-approval-app{--paper:...}` (토큰을 루트 대신 래퍼에 정의)
- `@keyframes rise` → `@keyframes dmove-rise` 로 개명(전역 네임스페이스라 스코프 불가)
- `@media (prefers-reduced-motion:reduce){*{...}}` → `@media (prefers-reduced-motion:reduce){#dmove-approval-app *{...}}`

클래스명(`.panel .tab .card .stamp` 등)은 ID 스코프 덕분에 유지해도 안전하다. 대량 개명 불필요.

---

## 1. 화면별 최종 마크업 구조

### 1.1 승인 업무함 (`ApprovalInboxServlet`)

```
html
  head
    meta[charset=utf-8]
    title                                        "승인 업무함"
    meta[name=decorator][content=atl.general]     ← 신규
    style                                        (전부 #dmove-approval-app 스코프)
  body
    div#dmove-approval-app.dmove-approval-app
      [data-actor-key=__ACTOR_KEY__]
      [data-context-path=__CONTEXT_PATH__]        ← body가 아니라 이 div에 둔다(§2.1 주의)

      header.app-head
        h1                                       "__DISPLAY_NAME__님의 승인 업무함"
        p.lede                                   "내 차례인 결재와 내가 올린 요청을 한 곳에서 확인합니다."
        div.app-head__actions
          __ADMIN_LINK__                          (a.aui-button.aui-button-link, 관리자만)

      section.summary#summary
        div.metric[data-k=PENDING]  > b#pending-count  + span[data-status-label=PENDING]
        div.metric[data-k=APPROVED] > b#approved-count + span[data-status-label=APPROVED]
        div.metric[data-k=REJECTED] > b#rejected-count + span[data-status-label=REJECTED]
        div.metric[data-k=EXPIRED]  > b#expired-count  + span[data-status-label=EXPIRED]

      section.panel#notification-panel
        div.panel-head
          h2                                     "알림"
          span.count#notification-count
          button.ghost#read-all[hidden]          "모두 읽음"
        ul.feed#notification-list[aria-live=polite]
          li[.unread][.feed--due]                (JS 생성)
            span.dot
            div
              a[href=<ctx>/pages/viewpage.action?pageId=…]
              span.note                          (부가 설명, 선택)
            span.when

      section.panel
        div.panel-head
          div.tabs[role=tablist][aria-label="승인 업무함 목록"]
            button.tab[data-tab=myturn]    [role=tab][aria-selected=true ][id=tab-myturn]    "내 차례"    > span.tab__badge
            button.tab[data-tab=waiting]   [role=tab][aria-selected=false][id=tab-waiting]   "진행 중"    > span.tab__badge
            button.tab[data-tab=requested] [role=tab][aria-selected=false][id=tab-requested] "내 요청"    > span.tab__badge
            button.tab[data-tab=done]      [role=tab][aria-selected=false][id=tab-done]      "처리한 건"  > span.tab__badge
          span.count#request-count
        div.table-wrap                            ← 신규(가로 스크롤 컨테이너)
          table[role=table]
            thead > tr > th ×7                    대상 / 상태 / 요청자 / 요청 시각 / 마감 / Flow / (액션)
            tbody#list[role=tabpanel][aria-labelledby=tab-myturn]   ← 탭 전환 시 aria-labelledby 갱신
```

탭 정의 (필터는 §3.4 참고)

| data-tab | 라벨 | 필터 | 빈 상태 문구 |
|----------|------|------|--------------|
| `myturn` | 내 차례 | `all` 중 `r.status==="PENDING" && r.myTurn===true` | 지금 내 차례인 결재가 없습니다. |
| `waiting` | 진행 중 | `all` 중 `r.status==="PENDING" && r.myTurn!==true` | 앞 단계를 기다리는 결재가 없습니다. |
| `requested` | 내 요청 | `/mine/requested` 결과 전체 | 내가 올린 승인 요청이 없습니다. |
| `done` | 처리한 건 | `all` 중 `r.myDecision==="APPROVED" \|\| r.myDecision==="REJECTED"` | 아직 처리한 건이 없습니다. |

초기 선택 탭은 `myturn`.

행 상세(`tr.detail`)는 기존 구조 유지(`.detail-grid` → 좌 `.decisions`, 우 `.timeline`). 변경 없음.

### 1.2 승인 설정 (`ApprovalSettingsServlet`)

```
html
  head
    meta[charset=utf-8]
    title                                        "승인 설정"
    meta[name=decorator][content=atl.general]     ← 신규
    style                                        (전부 #dmove-approval-app 스코프)
  body
    div#dmove-approval-app.dmove-approval-app[data-context-path=__CONTEXT_PATH__]
      header.app-head
        h1                                       "승인 설정"
        p.lede                                   "전역 정책, 반복 사용할 승인 Flow, 결재선에 올릴 승인 그룹을 관리합니다."
        div.app-head__actions
          a.aui-button.aui-button-link[href=<ctx>/plugins/servlet/approval-inbox]  "승인 업무함"

      nav.menu[role=tablist]
        button.tab[data-view=approval][role=tab][aria-selected=true ][id=view-tab-approval][aria-controls=view-approval]  "승인 설정"
        button.tab[data-view=flow]    [role=tab][aria-selected=false][id=view-tab-flow]    [aria-controls=view-flow]      "Flow 설정"
        button.tab[data-view=group]   [role=tab][aria-selected=false][id=view-tab-group]   [aria-controls=view-group]     "그룹 설정"

      section.view#view-approval[data-view=approval][role=tabpanel][aria-labelledby=view-tab-approval]
        form.panel#settings-form                 (내부 구조 변경 없음)
      section.view#view-flow[data-view=flow][role=tabpanel][aria-labelledby=view-tab-flow][hidden]
        div.cols > form.panel#flow-form + div.panel(등록한 승인 Flow)
      section.view#view-group[data-view=group][role=tabpanel][aria-labelledby=view-tab-group][hidden]
        div.cols > form.panel#group-form + div.panel(등록한 승인 그룹)
```

`<main class="shell">` 은 두 화면 모두 **삭제** — 데코레이터가 이미 `main` 랜드마크와 폭 제약을 준다.
`.shell{max-width:1200px;margin:0 auto;padding:56px 32px 96px}` 는 `#dmove-approval-app{padding:0 0 48px}` 로 대체.

### 1.3 페이지 패널 (`ApprovalPagePanel`) — 요청 없음

```
div.dmove-approval-page-panel
  [data-approval-page-id][data-approval-content-version]
  [data-approval-status=NONE][data-approval-can-request=0|1]
  span.dmove-approval-pill.dmove-approval-pill--none
    span.dmove-approval-pill__icon      (svg[aria-hidden=true] — 빈 문서 아이콘)
    span.dmove-approval-pill__label     "승인 요청 없음"
  span.dmove-approval-message[role=status]
  div.dmove-approval-modal.dmove-approval-modal--request[hidden]      (canRequest일 때만)
```

요청 없음 상태의 pill은 열 상세가 없으므로 `<span>`이다(버튼 아님). 요청 생성은 기존 페이지 도구 메뉴의
`#dmove-approval-request-action` / `.dmove-approval-request-trigger` 가 담당한다(변경 없음).

### 1.4 페이지 패널 — 요청 있음

```
div.dmove-approval-page-panel
  [data-approval-page-id][data-approval-content-version]
  [data-approval-status=PENDING|APPROVED|REJECTED|EXPIRED]
  [data-approval-can-request=0|1]
  [data-approval-request-id][data-approval-actor-key]        (해당될 때만)

  button.dmove-approval-pill.dmove-approval-pill--{pending|approved|rejected|expired}
    [type=button][aria-haspopup=dialog][aria-expanded=false]
    [data-approval-detail-open=1]
    [aria-label="승인 상태 상세 보기"]
    span.dmove-approval-pill__icon                  svg[aria-hidden=true] (상태별 도형, §1.6)
    span.dmove-approval-pill__label                 escape(settings.statusLabel(status))
    span.dmove-approval-pill__step                  "2/3단계"           (PENDING이고 stepCount>1일 때만)
    span.dmove-approval-pill__flag                  "!"                 (requiresReapproval || expiredByEdit)
      └ span.dmove-approval-sr-only                 "재승인 필요"        (색맹·스크린리더 대응)
    span.dmove-approval-pill__caret                 svg[aria-hidden=true] (아래 화살표)

  span.dmove-approval-message[role=status]

  div.dmove-approval-modal.dmove-approval-modal--detail[hidden]
    div.dmove-approval-modal__backdrop[data-approval-close=1]
    div.dmove-approval-modal__box[role=dialog][aria-modal=true][aria-label="페이지 승인 상태"]
      div.dmove-approval-modal__header
        div
          h2                                        "페이지 승인 상태"
          p.dmove-approval-modal__lead
            span.dmove-approval-status.dmove-approval-status--{status}   상태 라벨
            span.dmove-approval-page-panel__count                        "2 / 3단계 진행 중"
            span.dmove-approval-page-panel__version                      "v7 기준 승인"   (APPROVED + version)
        button.aui-button.aui-button-link.dmove-approval-modal__close[data-approval-close=1][aria-label=닫기]  "×"
      div.dmove-approval-modal__body
        div.dmove-approval-notice.dmove-approval-notice--warning          (재승인/편집 만료일 때만)
        section.dmove-approval-modal__section
          h3.dmove-approval-modal__section-title    "승인 순서와 결정"
          ol.dmove-approval-steps                   (기존 마크업 그대로 재사용)
            li.dmove-approval-step[--passed|--current]
              span.dmove-approval-step__order
              span.dmove-approval-step__approvers
                span.dmove-approval-step__approver  displayName
                span.dmove-approval-step__decision  "승인|반려|미결정"
          p.dmove-approval-hint                     "n단계 · 앞 단계 승인을 기다리는 중"  (myStepOrder>0 && PENDING && !myTurn)
        section.dmove-approval-modal__section
          h3.dmove-approval-modal__section-title    "감사 타임라인"
          ol.dmove-approval-timeline
            li[.is-approved|.is-rejected|.is-expired|.is-requested]
              b                                     eventLabel
              span.dmove-approval-timeline__meta    "홍길동 · 2026-08-11T04:00:00Z"
              span.dmove-approval-timeline__why     reason (있을 때만)
      div.dmove-approval-modal__footer
        span.dmove-approval-message[role=status]
        button.aui-button[data-approval-close=1]                                        "닫기"
        button.aui-button.dmove-approval-action[data-approval-action=reject]            "반려"    (myTurn일 때만)
        button.aui-button.aui-button-primary.dmove-approval-action
          [data-approval-action=approve][data-approval-autofocus=1]                     "승인"    (myTurn일 때만)

  div.dmove-approval-modal.dmove-approval-modal--request[hidden]        (canRequest일 때만, 기존 내용 그대로)
```

핵심: 배너에는 pill 하나 + 메시지 span만 남는다. 단계·타임라인·안내문·승인/반려 버튼은 전부 detail 모달로 이동.

### 1.5 요청 생성 모달 클래스 변경
`ApprovalPagePanel#appendRequestDialog` 가 만드는 두 갈래(진행 중 안내 / 실제 폼) 모두
`class="dmove-approval-modal"` → **`class="dmove-approval-modal dmove-approval-modal--request"`**.
내부 구조는 그대로.

### 1.6 상태 아이콘 (인라인 SVG, 20×20 viewBox, `fill="currentColor"`, `aria-hidden="true"`)
색만으로 구분하지 않도록 도형을 다르게 한다.

| 상태 | 도형 | path (`d`) |
|------|------|-----------|
| PENDING | 시계 | `M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.9 3.6v4.1l3.1 1.9-.8 1.3-3.9-2.4V5.6h1.6Z` |
| APPROVED | 체크 | `M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 11.4L5.6 10l1.1-1.1L9 11.2l4.3-4.3 1.1 1.1L9 13.4Z` |
| REJECTED | × 원 | `M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.2 10.1-1.1 1.1L10 11.1l-2.1 2.1-1.1-1.1L8.9 10 6.8 7.9l1.1-1.1L10 8.9l2.1-2.1 1.1 1.1L11.1 10l2.1 2.1Z` |
| EXPIRED | 빗금 원 | `M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 1.6c1.5 0 2.9.5 4 1.4L5 14a6.4 6.4 0 0 1 5-10.4Zm0 12.8c-1.5 0-2.9-.5-4-1.4L15 6a6.4 6.4 0 0 1-5 10.4Z` |
| NONE | 빈 문서 | `M6 2.5h5.2L15 6.3V17a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 5 17V3a.5.5 0 0 1 .5-.5H6Zm5 1.4V7h3.1L11 3.9Z` |
| caret | 아래 화살표 | `M5.7 7.5 10 11.8l4.3-4.3 1.1 1.1L10 14 4.6 8.6l1.1-1.1Z` |

Java에서 `"` 이스케이프가 많으므로 `private static final String ICON_PENDING = "<svg …>"` 형태 상수로 뽑고
`iconFor(ApprovalStatus)` 스위치로 고른다. **정적 문자열이므로 escape() 대상이 아니다** (동적 값이 아님).

---

## 2. 서블릿 TEMPLATE 변경 목록

### 2.1 `ApprovalInboxServlet`

**(a) TOKEN 정규식에 `CONTEXT_PATH` 추가**

현재:
```java
private static final Pattern TOKEN = Pattern.compile("__(ACTOR_KEY|DISPLAY_NAME|ADMIN_LINK|STATUS_LABELS)__");
```
변경:
```java
private static final Pattern TOKEN =
        Pattern.compile("__(ACTOR_KEY|CONTEXT_PATH|DISPLAY_NAME|ADMIN_LINK|STATUS_LABELS)__");
```

**(b) `doGet` 이 컨텍스트 패스를 넘긴다**

현재:
```java
resp.getWriter()
        .write(render(key, u.getFullName(), pm != null && pm.isConfluenceAdministrator(u), settings.statusLabels()));
```
변경:
```java
resp.getWriter().write(render(
        key,
        u.getFullName(),
        pm != null && pm.isConfluenceAdministrator(u),
        settings.statusLabels(),
        req.getContextPath()));
```
`render(...)` 시그니처에 `String contextPath` 파라미터를 마지막에 추가.

**(c) 토큰 값 등록 + ADMIN_LINK 재작성**

현재:
```java
values.put("ADMIN_LINK", admin
        ? "<a class=\"icon-btn\" href=\"/confluence/plugins/servlet/approval-settings\" "
                + "title=\"승인 설정\" aria-label=\"승인 설정\">"
                + "<svg viewBox=\"0 0 20 20\" width=\"17\" height=\"17\" aria-hidden=\"true\">"
                + "<path fill=\"currentColor\" d=\"M8.6 2h2.8l.35 2.1c…\"/>"
                + "</svg></a>"
        : "");
```
변경:
```java
String ctx = contextPath == null ? "" : contextPath;
values.put("CONTEXT_PATH", escape(ctx));
values.put("ADMIN_LINK", admin
        ? "<a class=\"aui-button aui-button-link\" href=\""
                + escape(ctx) + "/plugins/servlet/approval-settings\">승인 설정</a>"
        : "");
```
아이콘 SVG 링크는 삭제한다(데코레이터 하위 자체 마스트헤드 금지).

**(d) `<head>` 에 데코레이터 메타 추가**

현재:
```
<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>승인 업무함</title><style>
```
변경:
```
<!doctype html><html><head><title>승인 업무함</title><meta name="decorator" content="atl.general"><style>
```
`lang`/`viewport`/`charset` 은 데코레이터가 넣으므로 제거(중복 선언이 크롬과 어긋나는 걸 막는다).

**(e) 삭제할 CSS 블록**

| 삭제 대상 | 이유 |
|-----------|------|
| `@media (prefers-color-scheme: dark){ :root{ … } }` 전체 | 자체 다크모드 금지 — Confluence 테마와 충돌 |
| `html{-webkit-text-size-adjust:100%}` | 크롬 전역 영향 |
| `body{ margin:0; … background-image:linear-gradient(…); background-size:100% 32px }` | 풀캔버스 배경 연출 금지 |
| `.shell{max-width:1200px;margin:0 auto;padding:56px 32px 96px}` | 데코레이터가 폭·여백 담당 |
| `.masthead`, `.masthead::before`, `.masthead-text`, `.masthead-actions`, `.icon-btn`, `.icon-btn:hover`, `.icon-btn:focus-visible`, `.eyebrow` | 자체 마스트헤드 제거 |
| `@media (max-width:900px){ .shell{…} }` 안의 `.shell` 규칙 | 위와 동일 |

**(f) 추가/치환할 CSS 블록** (모두 `#dmove-approval-app` 스코프)

```css
#dmove-approval-app{
  /* 토큰: 기존 :root 값 그대로 이관, 새 색 발명 금지 */
  --paper:#fff; --canvas:#f6f5f2; --sunk:#fbfaf8;
  --ink:#1b2733; --ink-soft:#41505f; --muted:#6d7c8c;
  --rule:#e4e1da; --rule-soft:#efedE8;
  --accent:#0b5cd5; --accent-soft:#e8f0fe;
  --pending:#a86400; --pending-bg:#fdf3e0;
  --approved:#1c7a4e; --approved-bg:#e6f4ec;
  --rejected:#b4342a; --rejected-bg:#fceceb;
  --expired:#69788a; --expired-bg:#eef0f2;
  --shadow:0 1px 2px rgba(27,39,51,.06),0 8px 24px -16px rgba(27,39,51,.28);
  --mono:ui-monospace,"Cascadia Mono","SF Mono",Consolas,"D2Coding",monospace;
  --sans:"Pretendard","Pretendard Variable",-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif;
  color:var(--ink); font:15px/1.6 var(--sans); padding:0 0 48px;
}
#dmove-approval-app *{box-sizing:border-box}
#dmove-approval-app .app-head{margin:0 0 24px}
#dmove-approval-app .app-head h1{margin:0 0 6px;font-size:24px;line-height:1.25;letter-spacing:-.02em;font-weight:700}
#dmove-approval-app .app-head .lede{margin:0;color:var(--muted);max-width:56ch}
#dmove-approval-app .app-head__actions{margin-top:10px;display:flex;gap:8px}
#dmove-approval-app .table-wrap{overflow-x:auto}
```
나머지 기존 규칙(`.summary .metric .panel .panel-head .count .tabs .tab .ghost .ghost-link
.feed table thead th tbody td .subject .who .when-cell .stamp .warn tr.detail .detail-grid
.decisions .timeline .empty`)은 **선택자 앞에 `#dmove-approval-app ` 을 붙여 그대로 유지**한다.
`h1{...}` 처럼 요소만 있는 규칙은 `.app-head h1` 로 좁힌다.

**(g) 탭 배지·마감 임박 CSS 추가**
```css
#dmove-approval-app .tab__badge{margin-left:6px;font:600 11px/1 var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}
#dmove-approval-app .tab[aria-selected=true] .tab__badge{color:var(--accent)}
#dmove-approval-app .feed li.feed--due .dot{background:var(--pending)}
#dmove-approval-app .feed li.feed--due a{color:var(--pending)}
```

**(h) `@keyframes rise` → `@keyframes dmove-rise`** 및 이를 참조하는
`.metric,.panel{animation:rise …}` / `tbody tr.row{animation:rise …}` 도 `dmove-rise` 로 변경 + ID 스코프.

**(i) 인라인 스크립트 하드코딩 경로 제거**

현재:
```js
const base = "/confluence/rest/approval/1.0/approvals",
  actor = document.body.dataset.actorKey,
```
변경:
```js
const root = document.getElementById("dmove-approval-app"),
  ctx = root.dataset.contextPath || "",
  base = ctx + "/rest/approval/1.0/approvals",
  actor = root.dataset.actorKey,
```
> **중요**: `data-actor-key` 를 `<body>` 에 두면 안 된다. SiteMesh 데코레이션에서 원본 `<body>` 속성은
> 보존이 보장되지 않는다. 반드시 `#dmove-approval-app` div로 옮긴다.

현재(2군데):
```js
link.href = "/confluence/pages/viewpage.action?pageId=" + encodeURIComponent(item.pageId);
…
a.href = "/confluence/pages/viewpage.action?pageId=" + encodeURIComponent(r.pageId);
```
변경: `"/confluence/"` → `ctx + "/"`.

**(j) `<body data-actor-key="__ACTOR_KEY__">` → `<body>`**, 속성은 래퍼 div로 이동:
```
<body><div id="dmove-approval-app" data-actor-key="__ACTOR_KEY__" data-context-path="__CONTEXT_PATH__">
```
그리고 `<main class="shell">…</main>` 래퍼 제거, 닫는 태그는 `</div></body>`.

### 2.2 `ApprovalSettingsServlet`

**(a) 토큰 치환 메커니즘을 새로 도입** (지금은 `render()`가 TEMPLATE을 그대로 반환)

현재:
```java
static String render() {
    return TEMPLATE;
}
```
변경: `ApprovalInboxServlet` 과 동일한 패턴으로
```java
private static final Pattern TOKEN = Pattern.compile("__(CONTEXT_PATH)__");

static String render(String contextPath) {
    Map<String, String> values = new LinkedHashMap<>();
    values.put("CONTEXT_PATH", escape(contextPath == null ? "" : contextPath));
    Matcher matcher = TOKEN.matcher(TEMPLATE);
    StringBuilder out = new StringBuilder(TEMPLATE.length() + 64);
    while (matcher.find()) {
        matcher.appendReplacement(out, Matcher.quoteReplacement(values.getOrDefault(matcher.group(1), "")));
    }
    matcher.appendTail(out);
    return out.toString();
}

private static String escape(String v) { /* ApprovalInboxServlet.escape 와 동일 구현 */ }
```
`doGet` 은 `response.getWriter().write(render(request.getContextPath()));`

**(b) `<head>` 교체** — 인박스와 동일:
```
<!doctype html><html><head><title>승인 설정</title><meta name="decorator" content="atl.general"><style>
```

**(c) 삭제할 CSS 블록**

| 삭제 대상 |
|-----------|
| `@media (prefers-color-scheme: dark){ :root{…} }` 전체 |
| `body{margin:0;…background-image:linear-gradient(…);background-size:100% 32px}` |
| `.shell{max-width:1120px;margin:0 auto;padding:56px 32px 96px}` |
| `.masthead`, `.masthead::before`, `.masthead-text`, `.eyebrow`, `.masthead-actions`, `.icon-btn`, `.icon-btn:hover` |
| `@media(max-width:860px){.shell{…}}` 안의 `.shell` |

`.icon-btn:focus-visible,.tab:focus-visible,button:focus-visible,input:focus-visible{outline:…}` 는
`#dmove-approval-app .tab:focus-visible,#dmove-approval-app button:focus-visible,#dmove-approval-app input:focus-visible{…}`
로 축소한다.

**(d) `:root{…}` → `#dmove-approval-app{…}`** (인박스와 동일 토큰 + `--danger:#b4342a; --ok:#1c7a4e;` 유지)

**(e) 마스트헤드 → `.app-head`** (§1.2 구조). 두 개의 icon-btn 링크 중 홈 링크는 **삭제**,
업무함 링크만 `a.aui-button.aui-button-link[href="__CONTEXT_PATH__/plugins/servlet/approval-inbox"]` 로 남긴다.

**(f) 인라인 스크립트 하드코딩 제거**

현재:
```js
const base = "/confluence/rest/approval/1.0/approvals";
```
변경:
```js
const root = document.getElementById("dmove-approval-app");
const base = (root.dataset.contextPath || "") + "/rest/approval/1.0/approvals";
```

**(g) `<main class="shell">` 제거**, `<body><div id="dmove-approval-app" data-context-path="__CONTEXT_PATH__">` … `</div></body>`.

**(h) 요소 셀렉터 전부 ID 스코프**: `label{}`, `input[type=text],input[type=number],input:not([type]){}`,
`input[type=number]{}`, `button{}`, `button:hover{}`, `button.primary{}`, `button.danger{}`, `*{box-sizing}`.
특히 `button{…}` 를 스코프하지 않으면 **Confluence 크롬의 모든 버튼이 깨진다.**

### 2.3 text block 안 JS 이스케이프 주의
- Java text block에서 `\` 는 여전히 escape 문자다. 기존 코드의
  `.replace(/\\./g, "-")` 는 JS에서 `/\./g` 로 읽힌다. **새로 쓰는 정규식의 백슬래시도 반드시 두 번 쓴다**
  (`\\d`, `\\s`, `\\.`). `\n`, `\t`, `\u` 도 마찬가지.
- 템플릿 안에 `"""` 나 `\` 로 끝나는 줄이 생기지 않게 한다.
- `__STATUS_LABELS__` 는 `ApprovalJson.escapeForScript(...)` 를 통과한 **JSON 리터럴**이므로
  `const statusLabels = __STATUS_LABELS__;` 처럼 따옴표 없이 그대로 둔다(현행 유지).
- `__CONTEXT_PATH__` 는 **JS 문자열 리터럴 안에 직접 넣지 않는다.** HTML 속성(`data-context-path`, `href`)에만
  넣고 JS는 `dataset` 으로 읽는다 — JS 이스케이프 문제를 원천 차단.
- `Matcher.quoteReplacement` 는 그대로 유지(치환값의 `$`, `\` 방어).

---

## 3. `approval.js` 변경 명세

### 3.1 `showMessage` — 모달 안 메시지 대상 보정
현재:
```js
function showMessage(element, message) {
    var container = element.closest('.dmove-approval-request') || approvalContainer(element);
    var target = container && container.querySelector('.dmove-approval-message');
```
변경:
```js
function showMessage(element, message) {
    var container = element.closest('.dmove-approval-request, .dmove-approval-modal')
        || approvalContainer(element);
    var target = container && container.querySelector('.dmove-approval-message');
```
이유: 승인/반려 버튼이 detail 모달 footer로 이동했다. 보정하지 않으면 오류 메시지가 배너의
숨은 `.dmove-approval-message` 로 들어가 사용자가 못 본다.
요청 폼의 submit 버튼은 `.dmove-approval-request`(form)가 더 가까우므로 기존 동작 유지.

### 3.2 `modalOf()` 삭제 (dead code)
현재:
```js
function modalOf(element) {
    var container = approvalContainer(element);
    return container && container.querySelector('.dmove-approval-modal');
}
```
호출부가 없다. 삭제한다. (남겨두면 새 클래스 분리 후 오작동 소지)

### 3.3 `openModal` / `closeModal` — opener 기억 + aria-expanded + 포커스 복귀
현재:
```js
function openModal(modal) {
    if (!modal) { return; }
    modal.hidden = false;
    document.body.classList.add('dmove-approval-modal-open');
    var form = modal.querySelector('.dmove-approval-request');
    if (form) { syncStepEmptyState(form); renderFlowPreview(form); }
    var focusable = modal.querySelector('input, select');
    if (focusable) { focusable.focus(); }
}

function closeModal(modal) {
    if (!modal) { return; }
    modal.hidden = true;
    document.body.classList.remove('dmove-approval-modal-open');
}
```
변경:
```js
var modalOpener = null;

function openModal(modal, opener) {
    if (!modal) { return; }
    modalOpener = opener || null;
    if (modalOpener && modalOpener.hasAttribute('aria-expanded')) {
        modalOpener.setAttribute('aria-expanded', 'true');
    }
    modal.hidden = false;
    document.body.classList.add('dmove-approval-modal-open');
    var form = modal.querySelector('.dmove-approval-request');
    if (form) { syncStepEmptyState(form); renderFlowPreview(form); }
    var focusable = modal.querySelector(
        '[data-approval-autofocus], input, select, .dmove-approval-modal__close');
    if (focusable) { focusable.focus(); }
}

function closeModal(modal) {
    if (!modal) { return; }
    modal.hidden = true;
    document.body.classList.remove('dmove-approval-modal-open');
    if (modalOpener) {
        if (modalOpener.hasAttribute('aria-expanded')) {
            modalOpener.setAttribute('aria-expanded', 'false');
        }
        if (document.body.contains(modalOpener)) { modalOpener.focus(); }
        modalOpener = null;
    }
}
```

### 3.4 click 리스너 — detail pill 핸들러 추가 + 요청 모달 셀렉터 분리
현재 (line 337~358 구간):
```js
    var trigger = event.target.closest('.dmove-approval-request-trigger, #dmove-approval-request-action');
    if (trigger) {
        var modal = document.querySelector('.dmove-approval-modal');
        if (modal) {
            event.preventDefault();
            openModal(modal);
        }
        return;
    }
    var closer = event.target.closest('[data-approval-close]');
    if (closer) {
        event.preventDefault();
        closeModal(closer.closest('.dmove-approval-modal'));
        return;
    }
```
변경 (`.dmove-approval-tab` 처리 직후, closer 처리 앞에 pill 분기를 넣는다):
```js
    var detailOpener = event.target.closest('[data-approval-detail-open]');
    if (detailOpener) {
        event.preventDefault();
        var panel = approvalContainer(detailOpener);
        var detailModal = panel && panel.querySelector('.dmove-approval-modal--detail');
        if (detailModal) {
            openModal(detailModal, detailOpener);
        }
        return;
    }
    var trigger = event.target.closest('.dmove-approval-request-trigger, #dmove-approval-request-action');
    if (trigger) {
        var modal = document.querySelector('.dmove-approval-modal--request');
        if (modal) {
            event.preventDefault();
            openModal(modal, trigger);
        }
        return;
    }
    var closer = event.target.closest('[data-approval-close]');
    if (closer) {
        event.preventDefault();
        closeModal(closer.closest('.dmove-approval-modal'));
        return;
    }
```
순서 제약: pill 분기는 하단의 공통 버튼 매칭
(`.dmove-approval-select-user, …, .dmove-approval-action`)보다 **위**에 있어야 한다.
pill은 그 목록에 없으므로 충돌은 없지만, early-return이 명확해야 유지보수가 쉽다.

### 3.5 승인/반려 처리 — 변경 없음(동작 확인만)
```js
    var container = approvalContainer(button);
    if (!container || !container.dataset.approvalRequestId || !container.dataset.approvalActorKey) { return; }
```
detail 모달이 `.dmove-approval-page-panel` **내부**에 렌더링되므로 `closest` 가 그대로 패널을 찾는다.
`post(url).then(function () { window.location.reload(); })` 유지.
실패 시 `showMessage(button, …)` 은 §3.1 보정 덕에 모달 footer의 메시지로 들어간다.

### 3.6 ESC 핸들러 — 변경 없음
```js
var open = document.querySelector('.dmove-approval-modal:not([hidden])');
if (open) { closeModal(open); }
```
detail/request가 동시에 열리는 경로가 없으므로 그대로 둔다. `closeModal` 이 opener 포커스를 복귀시킨다.

### 3.7 `syncTriggerVisibility` — 요청 모달만 본다
현재:
```js
item.hidden = document.querySelector('.dmove-approval-modal') === null;
```
변경:
```js
item.hidden = document.querySelector('.dmove-approval-modal--request') === null;
```
보정하지 않으면 detail 모달만 있는(=편집 권한 없는) 페이지에서 상단 "승인 요청" 버튼이 잘못 노출된다.

### 3.8 인박스 인라인 스크립트 — 4탭 + DUE_SOON (`ApprovalInboxServlet` TEMPLATE 내부)

**(a) `show(tab)` 교체**

현재:
```js
  function show(tab) {
    const rows =
      tab === "pending"
        ? all.filter((r) => r.status === "PENDING")
        : tab === "done"
          ? all.filter((r) => r.myDecision === "APPROVED" || r.myDecision === "REJECTED")
          : requested;
    render(rows, tab === "pending" ? "지금 내 차례인 결재가 없습니다." : …);
  }
```
변경:
```js
  const TABS = {
    myturn:    {rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn === true),
                empty: "지금 내 차례인 결재가 없습니다."},
    waiting:   {rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn !== true),
                empty: "앞 단계를 기다리는 결재가 없습니다."},
    requested: {rows: () => requested,
                empty: "내가 올린 승인 요청이 없습니다."},
    done:      {rows: () => all.filter((r) => r.myDecision === "APPROVED" || r.myDecision === "REJECTED"),
                empty: "아직 처리한 건이 없습니다."},
  };
  function syncTabBadges() {
    document.querySelectorAll(".tab").forEach((b) => {
      const badge = b.querySelector(".tab__badge");
      if (!badge) return;
      if (b.dataset.tab === "requested" && !requestedLoaded) { badge.textContent = ""; return; }
      badge.textContent = TABS[b.dataset.tab].rows().length;
    });
  }
  function show(tab) {
    const spec = TABS[tab] || TABS.myturn;
    document.getElementById("list").setAttribute("aria-labelledby", "tab-" + tab);
    render(spec.rows(), spec.empty);
    syncTabBadges();
  }
```

**(b) 탭 클릭 핸들러** — `requested` 캐시 플래그를 명시적으로 둔다
(현재는 `!requested.length` 라서 결과가 0건이면 매번 다시 부른다).
```js
  let requestedLoaded = false;
  document.querySelectorAll(".tab").forEach((b) => {
    b.onclick = async () => {
      document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      if (b.dataset.tab === "requested" && !requestedLoaded) {
        try { requested = await (await fetch(base + "/mine/requested", {credentials: "same-origin"})).json(); }
        catch (_) { requested = []; }
        requestedLoaded = true;
      }
      show(b.dataset.tab);
    };
  });
```
> 기존 `x.setAttribute("aria-selected", x === b)` 는 boolean을 넘겨 `"true"/"false"` 문자열화에 의존한다.
> `String(x === b)` 로 명시한다.

**(c) 초기 로드** — `show("pending")` → `show("myturn")` (2군데: then / catch).

**(d) `waiting` 탭 힌트**: `statusCell(r)` 의 PENDING 분기에서 내 단계를 알려준다.
```js
    } else if (r.status === "PENDING" && r.stepCount > 1) {
      td.append(el("small", r.currentStepOrder + " / " + r.stepCount + "단계"
        + (r.myStepOrder > 0 && !r.myTurn ? " · 내 차례 " + r.myStepOrder + "단계" : "")));
    }
```

**(e) `eventLabel` 에 DUE_SOON 추가**

현재:
```js
  const eventLabel = (s) =>
    ({REQUESTED: "요청 생성", APPROVED: "승인", REJECTED: "반려", EXPIRED: "만료"})[s] || s;
```
변경: 맵에 `DUE_SOON: "마감 임박"` 추가.

**(f) `notificationLabel` / `notificationDetail` 에 DUE_SOON 분기 추가**

현재:
```js
  function notificationLabel(item) {
    if (item.eventType !== "EXPIRED") return eventLabel(item.eventType);
    …
  }
  function notificationDetail(item) {
    if (item.eventType !== "EXPIRED") return "";
    …
  }
```
변경:
```js
  function notificationLabel(item) {
    if (item.eventType === "DUE_SOON") return "마감 임박";
    if (item.eventType !== "EXPIRED") return eventLabel(item.eventType);
    if (item.reason === "CONTENT_VERSION_AFTER_APPROVAL") return "승인 후 수정됨 · 재승인 필요";
    if (item.reason === "CONTENT_VERSION") return "승인 중 수정됨 · 재요청 필요";
    return "마감 만료";
  }
  function notificationDetail(item) {
    if (item.eventType === "DUE_SOON") {
      if (!item.expiresAt) return "곧 마감됩니다. 승인 여부를 결정해 주세요.";
      const left = Math.max(0, Math.round((new Date(item.expiresAt) - Date.now()) / 3600000));
      return fmt(item.expiresAt) + " 마감"
        + (left > 0 ? " · 약 " + left + "시간 남았습니다." : " · 마감이 임박했습니다.");
    }
    if (item.eventType !== "EXPIRED") return "";
    …기존 그대로…
  }
```
`expiresAt` 부재를 견디도록 방어한다(REST 배포 순서 무관).

**(g) `renderNotifications` 에 DUE_SOON 클래스 부여**

현재:
```js
      const li = el("li", undefined, item.readAt ? "" : "unread");
```
변경:
```js
      const li = el("li", undefined,
        (item.readAt ? "" : "unread") + (item.eventType === "DUE_SOON" ? " feed--due" : ""));
```

---

## 4. `approval.css` 추가/삭제 블록

### 4.1 삭제
| 블록 | 이유 |
|------|------|
| `.dmove-approval-page-panel__timeline{…}` | 타임라인이 detail 모달로 이동 → `.dmove-approval-timeline` 로 대체 |
| `.dmove-approval-page-panel__approvers{…}` | Java에서 이미 미사용(dead) |
| `.dmove-approval-page-panel__decision{…}` | Java에서 이미 미사용(dead) |
| `.dmove-approval-page-panel__summary{…}` | pill 하나로 대체 |
| `.dmove-approval-page-panel__waiting{…}` | 모달 안 `.dmove-approval-hint` 로 대체 |

### 4.2 변경
```css
/* 배너에는 pill 하나만. flex-wrap·padding·배경을 걷어내 metadata banner에 녹인다 */
.dmove-approval-page-panel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    font-size: 12px;
}
```
```css
/* 모달 안에서는 단계 목록을 세로로. 매크로(.dmove-approval-region)의 가로 chip 레이아웃은 건드리지 않는다 */
.dmove-approval-modal--detail .dmove-approval-steps {
    flex-direction: column;
    gap: 4px;
    margin: 0;
}

.dmove-approval-modal--detail .dmove-approval-step {
    border-radius: 4px;
    padding: 6px 10px;
}
```

**유지(삭제 금지)**: `.dmove-approval-status*`, `.dmove-approval-steps`, `.dmove-approval-step*`,
`.dmove-approval-notice*`, `.dmove-approval-page-panel__count`, `.dmove-approval-page-panel__version`
— 매크로(`ApprovalRegionMacro`)와 detail 모달이 함께 쓴다.

### 4.3 추가
```css
/* ── 상태 pill (배너의 유일한 요소) ───────────────────────── */
.dmove-approval-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 2px 10px;
    border: 1px solid currentColor;
    border-radius: 12px;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    cursor: default;
}

button.dmove-approval-pill { cursor: pointer; }

button.dmove-approval-pill:hover { filter: brightness(0.96); }

.dmove-approval-pill:focus-visible {
    outline: 2px solid #0052cc;
    outline-offset: 2px;
}

.dmove-approval-pill__icon,
.dmove-approval-pill__caret {
    display: inline-flex;
    flex: none;
}

.dmove-approval-pill__caret { opacity: 0.6; }

.dmove-approval-pill__step {
    padding-left: 6px;
    border-left: 1px solid currentColor;
    font-weight: 400;
    opacity: 0.85;
}

.dmove-approval-pill__flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #ae2e24;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    flex: none;
}

.dmove-approval-pill--pending  { color: #5e4db2; background: #eae6ff; }
.dmove-approval-pill--approved { color: #216e4e; background: #dcfff1; }
.dmove-approval-pill--rejected { color: #ae2e24; background: #ffecea; }
.dmove-approval-pill--expired,
.dmove-approval-pill--none     { color: #44546f; background: #dcdfe4; }

/* ── 상세 모달 ──────────────────────────────────────────── */
.dmove-approval-modal--detail .dmove-approval-modal__box {
    width: min(640px, calc(100vw - 32px));
}

.dmove-approval-modal--detail .dmove-approval-modal__lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.dmove-approval-modal__section + .dmove-approval-modal__section {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid #dfe1e6;
}

.dmove-approval-modal__section-title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #5e6c84;
}

/* 상세 모달 감사 타임라인 */
.dmove-approval-timeline {
    list-style: none;
    margin: 0;
    padding: 0 0 0 16px;
    border-left: 2px solid #dfe1e6;
}

.dmove-approval-timeline li {
    position: relative;
    padding: 0 0 12px 6px;
}

.dmove-approval-timeline li:last-child { padding-bottom: 0; }

.dmove-approval-timeline li::before {
    content: "";
    position: absolute;
    left: -23px;
    top: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fff;
    border: 2px solid #5e6c84;
}

.dmove-approval-timeline li.is-approved::before { border-color: #216e4e; }
.dmove-approval-timeline li.is-rejected::before { border-color: #ae2e24; }
.dmove-approval-timeline li.is-expired::before  { border-color: #44546f; }

.dmove-approval-timeline__meta {
    display: block;
    color: #5e6c84;
    font-size: 12px;
}

.dmove-approval-timeline__why {
    display: block;
    margin-top: 2px;
    color: #44546f;
    font-size: 12px;
}

/* 스크린리더 전용 텍스트 */
.dmove-approval-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
}
```
`approval.css` 는 페이지 컨텍스트(AUI 로드됨)에서만 쓰이므로 서블릿 토큰 팔레트가 아니라
기존 approval.css의 Atlassian 색상값 체계를 그대로 따른다 — **새 색을 발명하지 않고 파일 안에 이미 있는
값(`#5e4db2/#eae6ff`, `#216e4e/#dcfff1`, `#ae2e24/#ffecea`, `#44546f/#dcdfe4`, `#dfe1e6`, `#5e6c84`)만 재사용**했다.

---

## 5. `ApprovalPagePanel.java` 렌더링 변경 명세

### 5.1 `renderEmpty` 교체
현재:
```java
private String renderEmpty(AbstractPage page, boolean canRequest) {
    StringBuilder html = new StringBuilder();
    openPanel(html, page, null, null, "NONE", canRequest);
    html.append("<div class=\"dmove-approval-page-panel__summary\">")
            .append("<strong class=\"dmove-approval-page-panel__title\">페이지 승인</strong>")
            .append("<span class=\"dmove-approval-status dmove-approval-status--none\">승인 요청 없음</span>")
            .append("</div>");
    html.append("<span class=\"dmove-approval-message\" role=\"status\"></span>");
    appendRequestDialog(html, canRequest, false);
    html.append("</div>");
    return html.toString();
}
```
변경 후 본문:
```java
openPanel(html, page, null, null, "NONE", canRequest);
html.append("<span class=\"dmove-approval-pill dmove-approval-pill--none\">")
        .append("<span class=\"dmove-approval-pill__icon\">").append(ICON_NONE).append("</span>")
        .append("<span class=\"dmove-approval-pill__label\">승인 요청 없음</span>")
        .append("</span>");
html.append("<span class=\"dmove-approval-message\" role=\"status\"></span>");
appendRequestDialog(html, canRequest, false);
html.append("</div>");
```

### 5.2 `renderRequest` 구조
```java
String actorKey = resolveActorKey(request, user);
boolean myTurn = actorKey != null && request.canDecideNow(actorKey);
int myStepOrder = actorKey == null ? 0 : request.stepOrderOf(actorKey);
Map<String, String> names = new HashMap<>();

StringBuilder html = new StringBuilder();
openPanel(html, page, request.id().toString(), actorKey, request.status().name(), canRequest);
appendPill(html, request, settings);                          // ① 배너에 남는 유일한 요소
html.append("<span class=\"dmove-approval-message\" role=\"status\"></span>");
appendDetailDialog(html, request, settings, names, myTurn, myStepOrder);   // ② 상세 모달
appendRequestDialog(html, canRequest, request.status() == ApprovalStatus.PENDING);  // ③ 요청 모달
html.append("</div>");
return html.toString();
```

### 5.3 신규 `appendPill`
```java
private void appendPill(StringBuilder html, ApprovalRequest request, ApprovalSettings.Values settings) {
    boolean flagged = request.requiresReapproval() || request.expiredByEdit();
    html.append("<button type=\"button\" class=\"dmove-approval-pill ")
            .append(pillModifier(request.status()))
            .append("\" data-approval-detail-open=\"1\" aria-haspopup=\"dialog\" aria-expanded=\"false\"")
            .append(" aria-label=\"승인 상태 상세 보기\">")
            .append("<span class=\"dmove-approval-pill__icon\">")
            .append(iconFor(request.status()))            // 정적 SVG 상수 — escape 대상 아님
            .append("</span>")
            .append("<span class=\"dmove-approval-pill__label\">")
            .append(escape(settings.statusLabel(request.status().name())))   // ← escape 필수
            .append("</span>");
    if (request.status() == ApprovalStatus.PENDING && request.steps().size() > 1) {
        html.append("<span class=\"dmove-approval-pill__step\">")
                .append(Math.min(request.currentStepOrder(), request.steps().size()))
                .append("/")
                .append(request.steps().size())
                .append("단계</span>");
    }
    if (flagged) {
        html.append("<span class=\"dmove-approval-pill__flag\" aria-hidden=\"true\">!</span>")
                .append("<span class=\"dmove-approval-sr-only\">")
                .append(request.requiresReapproval() ? "재승인 필요" : "요청 무효")
                .append("</span>");
    }
    html.append("<span class=\"dmove-approval-pill__caret\">").append(ICON_CARET).append("</span>")
            .append("</button>");
}

private static String pillModifier(ApprovalStatus status) {
    return "dmove-approval-pill--" + status.name().toLowerCase(Locale.ROOT);
}
```
정수(`currentStepOrder()`, `steps().size()`)는 escape 불필요.
`settings.statusLabel(...)` 은 관리자가 입력한 문자열이므로 **반드시 escape**.

### 5.4 신규 `appendDetailDialog`
```java
private void appendDetailDialog(
        StringBuilder html,
        ApprovalRequest request,
        ApprovalSettings.Values settings,
        Map<String, String> names,
        boolean myTurn,
        int myStepOrder) {
    Integer approvedVersion = request.approvedContentVersion();
    html.append("<div class=\"dmove-approval-modal dmove-approval-modal--detail\" hidden=\"hidden\">")
            .append("<div class=\"dmove-approval-modal__backdrop\" data-approval-close=\"1\"></div>")
            .append("<div class=\"dmove-approval-modal__box\" role=\"dialog\" aria-modal=\"true\" ")
            .append("aria-label=\"페이지 승인 상태\">")
            .append("<div class=\"dmove-approval-modal__header\"><div>")
            .append("<h2>페이지 승인 상태</h2>")
            .append("<p class=\"dmove-approval-modal__lead\">")
            .append("<span class=\"dmove-approval-status ").append(statusModifier(request.status()))
            .append("\">").append(escape(settings.statusLabel(request.status().name())))
            .append("</span>")
            .append("<span class=\"dmove-approval-page-panel__count\">")
            .append(escape(progressLabel(request)))
            .append("</span>");
    if (request.status() == ApprovalStatus.APPROVED && approvedVersion != null) {
        html.append("<span class=\"dmove-approval-page-panel__version\">v")
                .append(approvedVersion).append(" 기준 승인</span>");
    }
    html.append("</p></div>")
            .append("<button type=\"button\" class=\"aui-button aui-button-link dmove-approval-modal__close\" ")
            .append("data-approval-close=\"1\" aria-label=\"닫기\">×</button></div>")
            .append("<div class=\"dmove-approval-modal__body\">");

    // ── 안내문: 현행 renderRequest의 notice 블록을 그대로 이곳으로 옮긴다 ──
    if (request.requiresReapproval()) {
        html.append("<div class=\"dmove-approval-notice dmove-approval-notice--warning\">")
                .append("승인이 끝난 뒤 페이지가 수정되어 ");
        if (approvedVersion != null) {
            html.append("v").append(approvedVersion).append(" 승인분이 ");
        }
        html.append("무효가 되었습니다. 다시 승인을 받으려면 승인 요청을 새로 올려야 합니다.</div>");
    } else if (request.expiredByEdit()) {
        html.append("<div class=\"dmove-approval-notice dmove-approval-notice--warning\">")
                .append("승인이 진행되는 중에 페이지가 수정되어 요청이 무효가 되었습니다. ")
                .append("지금까지 받은 승인은 초기화되었습니다.</div>");
    }

    html.append("<section class=\"dmove-approval-modal__section\">")
            .append("<h3 class=\"dmove-approval-modal__section-title\">승인 순서와 결정</h3>");
    appendSteps(html, request, names);                       // 기존 메서드 재사용, 변경 없음
    if (myStepOrder > 0 && request.status() == ApprovalStatus.PENDING && !myTurn) {
        html.append("<p class=\"dmove-approval-hint\">")
                .append(myStepOrder)
                .append("단계 · 앞 단계 승인을 기다리는 중입니다.</p>");
    }
    html.append("</section>")
            .append("<section class=\"dmove-approval-modal__section\">")
            .append("<h3 class=\"dmove-approval-modal__section-title\">감사 타임라인</h3>");
    appendTimeline(html, request, names);                    // §5.5에서 마크업만 교체
    html.append("</section></div>")
            .append("<div class=\"dmove-approval-modal__footer\">")
            .append("<span class=\"dmove-approval-message\" role=\"status\"></span>")
            .append("<button type=\"button\" class=\"aui-button\" data-approval-close=\"1\">닫기</button>");
    if (myTurn) {
        html.append("<button type=\"button\" class=\"aui-button dmove-approval-action\" ")
                .append("data-approval-action=\"reject\">반려</button>")
                .append("<button type=\"button\" class=\"aui-button aui-button-primary dmove-approval-action\" ")
                .append("data-approval-action=\"approve\" data-approval-autofocus=\"1\">승인</button>");
    }
    html.append("</div></div></div>");
}
```
`renderRequest` 안에 있던 notice 블록과 `dmove-approval-page-panel__actions` 블록은 **삭제**한다
(위 메서드로 이동).

### 5.5 `appendTimeline` 마크업 교체
현재:
```java
html.append("<ol class=\"dmove-approval-page-panel__timeline\">");
for (ApprovalEvent event : request.events()) {
    html.append("<li><strong>")
            .append(escape(eventLabel(event.type())))
            .append("</strong> ")
            .append(escape(event.actorKey() == null ? "시스템" : displayName(event.actorKey(), names)))
            .append(" · ")
            .append(escape(event.occurredAt().toString()));
    if (event.reason() != null) {
        html.append(" · ").append(escape(event.reason()));
    }
    html.append("</li>");
}
html.append("</ol>");
```
변경:
```java
html.append("<ol class=\"dmove-approval-timeline\">");
for (ApprovalEvent event : request.events()) {
    html.append("<li class=\"is-")
            .append(event.type().name().toLowerCase(Locale.ROOT))   // enum → 안전, escape 불필요
            .append("\"><b>")
            .append(escape(eventLabel(event.type())))
            .append("</b><span class=\"dmove-approval-timeline__meta\">")
            .append(escape(event.actorKey() == null ? "시스템" : displayName(event.actorKey(), names)))
            .append(" · ")
            .append(escape(event.occurredAt().toString()))
            .append("</span>");
    if (event.reason() != null) {
        html.append("<span class=\"dmove-approval-timeline__why\">")
                .append(escape(event.reason()))
                .append("</span>");
    }
    html.append("</li>");
}
html.append("</ol>");
```

### 5.6 `appendRequestDialog` 클래스만 변경
두 곳의 `"<div class=\"dmove-approval-modal\" hidden=\"hidden\">"` 를
`"<div class=\"dmove-approval-modal dmove-approval-modal--request\" hidden=\"hidden\">"` 로 바꾼다.
나머지 본문은 손대지 않는다.

### 5.7 escape 규칙 (반드시 준수)
| 값 | escape |
|----|--------|
| `settings.statusLabel(...)` | **필요** — 관리자 입력 |
| `displayName(...)` | **필요** — 사용자 이름 |
| `event.reason()` | **필요** |
| `event.occurredAt().toString()` | 필요(관례 유지) |
| `progressLabel(request)` | 필요(관례 유지) |
| `decisionLabel(...)`, `eventLabel(...)` | 필요(관례 유지) |
| int/Integer (`step.order()`, `approvedVersion`, `stepCount`) | 불필요 |
| enum `name().toLowerCase()` | 불필요 |
| 정적 SVG 상수 `ICON_*` | 불필요(리터럴) |

### 5.8 C10 이식 백로그
`approval-confluence10` 은 순차 승인 이전 상태라 이 변경을 따라가지 않는다.
이식 백로그에 "패널 pill/detail 모달 + 서블릿 데코레이터화" 항목만 기록한다.

---

## 6. 접근성 체크리스트

**pill**
- [ ] 상태가 있는 pill은 `<button type="button">`, `aria-haspopup="dialog"`, `aria-expanded="false"`(열리면 `"true"`)
- [ ] 요청 없음 pill은 `<span>` (조작 불가한 것을 버튼으로 만들지 않는다)
- [ ] 색 + 텍스트 + 도형이 다른 아이콘 3중 표현 (색맹 대응)
- [ ] `!` 경고 뱃지는 `aria-hidden="true"` + 인접 `.dmove-approval-sr-only` 로 "재승인 필요" 낭독
- [ ] `:focus-visible` 아웃라인 2px (§4.3)

**모달 (detail / request 공통)**
- [ ] `role="dialog" aria-modal="true" aria-label="…"`
- [ ] backdrop `data-approval-close="1"` 클릭 시 닫힘
- [ ] ESC 닫힘 (기존 keydown 리스너)
- [ ] 열릴 때 포커스 이동: `[data-approval-autofocus]` → `input,select` → `.dmove-approval-modal__close`
- [ ] 닫힐 때 opener(pill / 상단 트리거)로 포커스 복귀 (§3.3)
- [ ] 닫기 버튼에 `aria-label="닫기"` (`×` 문자만으로는 낭독 불가)

**메시지 / 라이브 영역**
- [ ] 승인/반려 실패 메시지는 detail 모달 footer의 `.dmove-approval-message[role="status"]` 에 표시
- [ ] 인박스 알림 목록 `ul#notification-list` 에 `aria-live="polite"`
- [ ] 결과 목록 `.dmove-approval-selected-steps` 의 `aria-live="polite"` 유지

**인박스 / 설정 탭**
- [ ] `div.tabs[role="tablist"]` + 각 `button[role="tab"][aria-selected]`
- [ ] 각 탭 버튼에 `id="tab-{key}"`, 패널(`tbody#list` / `section.view`)에 `role="tabpanel"` + `aria-labelledby`
- [ ] `aria-selected` 는 `String(...)` 로 명시 문자열 지정
- [ ] 탭 배지 숫자는 장식이 아니라 실제 텍스트(스크린리더가 읽는다)

**데코레이터 통합**
- [ ] `<main>` 을 직접 만들지 않는다 — 데코레이터의 랜드마크와 중복되면 안 됨
- [ ] `h1` 은 페이지당 하나(각 화면의 `.app-head h1`)
- [ ] 서블릿 `<style>` 의 모든 셀렉터가 `#dmove-approval-app` 스코프인지 grep 검증
      (`button{`, `table{`, `h1{`, `body{`, `*{`, `:root{`, `input` 시작 규칙이 남아 있으면 실패)
- [ ] 자체 `@media (prefers-color-scheme: dark)` 블록이 두 서블릿 모두에서 0건
- [ ] `prefers-reduced-motion` 규칙 유지(스코프만 추가)

**하드코딩 경로**
- [ ] 두 서블릿 TEMPLATE·Java 문자열에서 `"/confluence/"` 가 0건인지 grep 검증
