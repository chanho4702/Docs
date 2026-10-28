# 업무함 사이드 메뉴 · 진입점 아이콘 · 요청 모달 · 영역 매크로 개편 설계

대상 모듈: `approval-confluence9` (C10 미이식, 백로그 기록만).
구현: Codex. 이 문서는 스펙이며, 여기 적힌 클래스명·셀렉터·토큰명·path 데이터를 **그대로** 쓴다.
직전 설계 `_workspace/design-ui-overhaul.md`(배치 1·2)의 원칙을 그대로 승계한다:
- 서블릿 `<style>` 안 모든 셀렉터는 예외 없이 `#dmove-approval-app` 스코프.
- `approval.css`는 페이지 컨텍스트용이며 **새 색을 발명하지 않고** 파일에 이미 있는 Atlassian 색만 재사용.
- vanilla JS + AUI만. 이벤트 위임(document 레벨 + `closest`) 유지.

관련 파일
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/panel/ApprovalPagePanel.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/macro/ApprovalRegionMacro.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/ui/ApprovalMarkup.java` ← **신규**
- `approval-confluence9/src/main/resources/atlassian-plugin.xml`
- `approval-confluence9/src/main/resources/css/approval.css`
- `approval-confluence9/src/main/resources/js/approval.js`

---

## 0. 결정 로그 (근거 포함)

| # | 결정 | 근거 |
|---|------|------|
| 0.1 | 업무함 4탭 → **좌측 세로 메뉴**(`nav` + `aria-current`), tablist/tabpanel 역할 **폐기** | 탭은 "같은 대상의 다른 면"을, 사이드 메뉴는 "다른 목록"을 뜻한다. 여기에 알림·설정까지 섞이므로 tablist는 의미가 깨진다. `nav` + `aria-current="page"`가 정확하고, Confluence 스페이스 사이드바와 같은 멘탈 모델이 된다. |
| 0.2 | 지표 4카드는 **유지하되 얇은 스트립으로 강등**해 우측 상단에 배치 | 메뉴 배지(내 차례/진행 중/내 요청/처리한 건)는 **"내가 할 일" 축**이고, 지표(PENDING/APPROVED/REJECTED/EXPIRED)는 **"요청의 상태" 축**이다. 축이 다르므로 중복이 아니고, 지우면 정보가 사라진다. 다만 주인공 자리는 이제 메뉴 배지가 가져갔으므로 30px 숫자 카드(높이 ~92px)를 19px 인라인 스트립(높이 ~44px)으로 낮춘다. 2컬럼이 되어 좁아진 우측 컬럼에서 4칸 카드가 찌그러지는 문제도 같이 해결된다. |
| 0.3 | 메뉴에 **roving tabindex를 쓰지 않는다** (모든 항목 tabbable) | WAI-ARIA APG에서 roving tabindex는 tablist/menu/grid 위젯 패턴이다. `nav` 랜드마크의 링크형 항목은 전부 tab 순서에 있어야 한다. 0.1 결정과 일관. |
| 0.4 | 업무함 메뉴 아이콘은 **인라인 SVG**, 스페이스 사이드바·상단 버튼 아이콘은 **CSS `mask` + data-URI** | 업무함은 우리가 마크업을 만드므로 인라인 SVG가 더 선명하고 인코딩 사고가 없다. web-item(사이드바/상단 버튼)은 label에 마크업을 넣을 수 없으므로 `::before` + `mask` + `currentColor`만이 유일한 수단이다. |
| 0.5 | 요청 모달의 **승인자/그룹 검색을 세그먼트 전환**(사용자 ↔ 그룹)으로 통합 | 현재 두 검색 input이 세로로 쌓여 있고 각자 결과 `<ul>`을 문서 흐름에 펼친다 → 위 필드에서 검색하면 아래 필드가 90~200px 밀려 내려가는 **레이아웃 점프**가 난다. 한 번에 하나만 보이면 점프가 사라지고 모달 높이가 90px 줄어든다. JS 계약(input name/results 클래스)은 그대로 두고 `hidden` 토글만 한다. |
| 0.6 | 패널·매크로가 공유하는 마크업을 **`ApprovalMarkup` 정적 헬퍼로 추출** | §D(요청 모달)와 §E(매크로)가 같은 pill/detail 모달/request 모달을 쓴다. 추출하지 않으면 같은 100여 줄이 두 벌 생기고 반드시 드리프트한다. |
| 0.7 | 요청 모달에서 `id`/`for` 짝을 **전부 제거**하고 `<label>`로 감싼다 | 매크로는 한 페이지에 여러 번 렌더링될 수 있다. 현재 패널이 쓰는 `id="dmove-approval-user-search"`를 매크로가 공유하면 **중복 id**가 생긴다. 감싸는 `<label>`은 id 없이 동일한 연결을 제공한다. |
| 0.8 | 요청 모달 여는 로직을 **컨테이너 스코프**로 변경 | 지금은 `document.querySelector('.dmove-approval-modal--request')` — 문서의 첫 번째를 집는다. §E 이후 한 페이지에 패널 모달 + 영역 모달 N개가 공존하므로 **반드시 깨진다**. §H 참조. |

---

## A. 업무함 2컬럼 레이아웃

### A.1 최종 마크업 구조

```
body
  div#dmove-approval-app.dmove-approval-app[data-actor-key][data-context-path]
    header.app-head
      h1                                  "__DISPLAY_NAME__님의 승인 업무함"
      p.lede
      ── div.app-head__actions 삭제 (관리자 링크가 메뉴로 이동)

    div.workbench                          ← 신규 2컬럼 그리드
      nav.wb-nav[aria-label="승인 업무함 메뉴"]
        h2.wb-nav__title                   "업무함"
        ul.wb-nav__group
          li > button.wb-nav__item.is-current[type=button][data-view=myturn]   [data-tab=myturn]    [aria-current=page]
                 span.wb-nav__icon (svg)  span.wb-nav__label "내 차례"   span.wb-nav__badge
          li > button.wb-nav__item        [data-view=waiting]   [data-tab=waiting]
          li > button.wb-nav__item        [data-view=requested] [data-tab=requested]
          li > button.wb-nav__item        [data-view=done]      [data-tab=done]
        h2.wb-nav__title                   "알림과 설정"      ← 이 요소의 border-top이 구분선
        ul.wb-nav__group.wb-nav__group--aux
          li > button.wb-nav__item[data-view=notifications]
                 span.wb-nav__icon (bell)  span.wb-nav__label "알림"  span.wb-nav__badge[data-badge=notifications]
          __ADMIN_LINK__                   ← li > a.wb-nav__item.wb-nav__item--link (관리자만)

      div.wb-main
        section.summary#summary            ← 얇은 스트립으로 재스타일 (id·자식 id 전부 유지)
          div.metric[data-k=PENDING]  > b#pending-count  + span[data-status-label=PENDING]
          … APPROVED / REJECTED / EXPIRED

        section.panel#view-list[aria-labelledby=view-list-title]
          div.panel-head
            h2#view-list-title             (JS가 현재 메뉴 라벨로 갱신)
            span.count#request-count[role=status]
          div.table-wrap > table
            thead > tr > th ×7
            tbody#list                     ← role=tabpanel / aria-labelledby 제거

        section.panel#view-notifications[aria-labelledby=view-notifications-title][hidden]
          div.panel-head
            h2#view-notifications-title    "알림"
            span.count#notification-count
            button.ghost#read-all[hidden]  "모두 읽음"
          ul.feed#notification-list[aria-live=polite]
```

`#view-list` / `#view-notifications`는 `aria-labelledby`를 가지므로 **region 랜드마크**가 된다.
목록 뷰를 바꾸면 랜드마크 이름이 "내 차례" → "진행 중"으로 바뀌어 스크린리더가 문맥을 잃지 않는다.
숨은 쪽은 `hidden`이라 접근성 트리에서 빠지므로 랜드마크가 둘로 보이지 않는다.

### A.2 기존 대비 변경/제거 목록

| 항목 | 처리 |
|------|------|
| `div.app-head__actions` + 그 안의 `__ADMIN_LINK__` | **제거**. `__ADMIN_LINK__` 토큰은 유지하되 값이 `<li><a class='wb-nav__item …'>` 형태로 바뀌고 위치가 `ul.wb-nav__group--aux` 안으로 이동 |
| `div.tabs[role=tablist]` + `button.tab ×4` | **제거** → `nav.wb-nav` 메뉴로 대체 |
| `tbody#list`의 `role="tabpanel" aria-labelledby="tab-myturn"` | **제거** |
| `section.panel#notification-panel` | id를 `view-notifications`로 개명, 위치를 목록 패널 **뒤로** 이동(초기 hidden) |
| `section.panel`(목록) | id `view-list` 부여, `.panel-head` 안 `.tabs` → `h2#view-list-title` |
| `<meta name="decorator">`, `#dmove-approval-app` 스코프 원칙 | **변경 없음** |
| TOKEN 정규식 / `render()` 시그니처 / `escape()` | **변경 없음** (`ADMIN_LINK` 토큰 이름 그대로) |

### A.3 `render(...)` 안 `ADMIN_LINK` 값 교체

현재 (`ApprovalInboxServlet.java` 58~61행):
```java
values.put("ADMIN_LINK", admin
        ? "<a class=\"aui-button aui-button-link\" href=\""
                + escape(ctx) + "/plugins/servlet/approval-settings\">승인 설정</a>"
        : "");
```
교체:
```java
values.put("ADMIN_LINK", admin
        ? "<li><a class='wb-nav__item wb-nav__item--link' href='"
                + escape(ctx) + "/plugins/servlet/approval-settings'>"
                + "<span class='wb-nav__icon'>" + ICON_SETTINGS + "</span>"
                + "<span class='wb-nav__label'>승인 설정</span></a></li>"
        : "");
```
클래스 상단에 상수 추가(작은따옴표 속성 — Java 문자열 escape 지옥 회피, HTML5에서 유효):
```java
private static final String ICON_SETTINGS =
        "<svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' "
                + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"
                + "<path d='M3.75 6.75h12.5M3.75 13.25h12.5'/>"
                + "<circle cx='8' cy='6.75' r='1.9'/><circle cx='12.5' cy='13.25' r='1.9'/></svg>";
```
> `escape(ctx)`가 `'`를 `&#39;`로 바꾸므로 작은따옴표 속성이어도 주입되지 않는다.

### A.4 TEMPLATE 본문 교체 (전문)

`<body>` ~ `</div>` 사이를 아래로 통째 교체한다. SVG는 Java text block 안이므로 큰따옴표 그대로 쓴다.

```html
<body><div id="dmove-approval-app" class="dmove-approval-app" data-actor-key="__ACTOR_KEY__" data-context-path="__CONTEXT_PATH__">
  <header class="app-head">
    <h1>__DISPLAY_NAME__님의 승인 업무함</h1>
    <p class="lede">내 차례인 결재와 내가 올린 요청을 한 곳에서 확인합니다.</p>
  </header>

  <div class="workbench">
    <nav class="wb-nav" aria-label="승인 업무함 메뉴">
      <h2 class="wb-nav__title">업무함</h2>
      <ul class="wb-nav__group">
        <li><button type="button" class="wb-nav__item is-current" data-view="myturn" data-tab="myturn" aria-current="page">
          <span class="wb-nav__icon"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z"/><path d="M5 16.25h10"/></svg></span>
          <span class="wb-nav__label">내 차례</span><span class="wb-nav__badge"></span></button></li>
        <li><button type="button" class="wb-nav__item" data-view="waiting" data-tab="waiting">
          <span class="wb-nav__icon"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 5.75V10l2.75 1.75"/></svg></span>
          <span class="wb-nav__label">진행 중</span><span class="wb-nav__badge"></span></button></li>
        <li><button type="button" class="wb-nav__item" data-view="requested" data-tab="requested">
          <span class="wb-nav__icon"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.75 2.75h6.5l4 4v10.5h-10.5z"/><path d="M11.25 2.75v4h4"/><path d="M10 14.25V9.75m0 0L8.25 11.5M10 9.75l1.75 1.75"/></svg></span>
          <span class="wb-nav__label">내 요청</span><span class="wb-nav__badge"></span></button></li>
        <li><button type="button" class="wb-nav__item" data-view="done" data-tab="done">
          <span class="wb-nav__icon"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M6.75 10.25 9 12.5l4.25-4.5"/></svg></span>
          <span class="wb-nav__label">처리한 건</span><span class="wb-nav__badge"></span></button></li>
      </ul>

      <h2 class="wb-nav__title">알림과 설정</h2>
      <ul class="wb-nav__group wb-nav__group--aux">
        <li><button type="button" class="wb-nav__item" data-view="notifications">
          <span class="wb-nav__icon"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13.5h10l-1.5-2.5V8.5a3.5 3.5 0 0 0-7 0V11z"/><path d="M8.5 15.5a1.5 1.5 0 0 0 3 0"/></svg></span>
          <span class="wb-nav__label">알림</span><span class="wb-nav__badge" data-badge="notifications"></span></button></li>
        __ADMIN_LINK__
      </ul>
    </nav>

    <div class="wb-main">
      <section class="summary" id="summary">
        <div class="metric" data-k="PENDING"><b id="pending-count">0</b><span data-status-label="PENDING"></span></div>
        <div class="metric" data-k="APPROVED"><b id="approved-count">0</b><span data-status-label="APPROVED"></span></div>
        <div class="metric" data-k="REJECTED"><b id="rejected-count">0</b><span data-status-label="REJECTED"></span></div>
        <div class="metric" data-k="EXPIRED"><b id="expired-count">0</b><span data-status-label="EXPIRED"></span></div>
      </section>

      <section class="panel" id="view-list" aria-labelledby="view-list-title">
        <div class="panel-head">
          <h2 id="view-list-title">내 차례</h2>
          <span class="count" id="request-count" role="status">0건</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>대상</th><th>상태</th><th>요청자</th><th>요청 시각</th><th>마감</th><th>Flow</th><th></th>
          </tr></thead>
          <tbody id="list"></tbody>
        </table></div>
      </section>

      <section class="panel" id="view-notifications" aria-labelledby="view-notifications-title" hidden>
        <div class="panel-head">
          <h2 id="view-notifications-title">알림</h2>
          <span class="count" id="notification-count">0</span>
          <button class="ghost" id="read-all" hidden>모두 읽음</button>
        </div>
        <ul class="feed" id="notification-list" aria-live="polite"></ul>
      </section>
    </div>
  </div>
</div>
```

---

## A.5 인라인 JS 변경 명세

기존 구조를 최대한 살린다. `TABS` 객체·필터 식·`render`·`detail`·`statusCell`·`deadlineCell`·
`renderNotifications`·`metrics`·`loadNotifications`는 **본문 로직 그대로**이고, 아래 8곳만 손댄다.

### (a) 상단 const 블록 — 참조 추가

현재:
```js
  const root = document.getElementById("dmove-approval-app"),
    base = (root.dataset.contextPath || "") + "/rest/approval/1.0/approvals",
    actor = root.dataset.actorKey,
    list = document.getElementById("list"),
    notificationList = document.getElementById("notification-list"),
    notificationCount = document.getElementById("notification-count"),
    readAll = document.getElementById("read-all"),
    statusLabels = __STATUS_LABELS__;
```
교체:
```js
  const root = document.getElementById("dmove-approval-app"),
    base = (root.dataset.contextPath || "") + "/rest/approval/1.0/approvals",
    actor = root.dataset.actorKey,
    list = document.getElementById("list"),
    listPanel = document.getElementById("view-list"),
    listTitle = document.getElementById("view-list-title"),
    requestCount = document.getElementById("request-count"),
    noticePanel = document.getElementById("view-notifications"),
    notificationList = document.getElementById("notification-list"),
    notificationCount = document.getElementById("notification-count"),
    notificationBadge = root.querySelector('[data-badge="notifications"]'),
    readAll = document.getElementById("read-all"),
    navItems = Array.from(root.querySelectorAll(".wb-nav__item[data-view]")),
    statusLabels = __STATUS_LABELS__;
  let all = [], requested = [], requestedLoaded = false, currentView = "myturn";
```
> 기존 `let all = [], requested = [];` 줄은 위 줄로 흡수되므로 **삭제**한다.
> 아래쪽에 따로 있는 `let requestedLoaded = false;`도 **삭제**한다(중복 선언 → SyntaxError).

### (b) `renderNotifications` — 메뉴 배지 동기화 1줄 추가

현재:
```js
    const unread = notifications.filter((item) => !item.readAt).length;
    notificationCount.textContent = unread ? "읽지 않음 " + unread : "모두 읽음";
    readAll.hidden = unread === 0;
```
교체:
```js
    const unread = notifications.filter((item) => !item.readAt).length;
    notificationCount.textContent = unread ? "읽지 않음 " + unread : "모두 읽음";
    readAll.hidden = unread === 0;
    if (notificationBadge) {
      notificationBadge.textContent = unread ? String(unread) : "";
      notificationBadge.classList.toggle("is-zero", unread === 0);
      notificationBadge.classList.toggle("wb-nav__badge--alert", unread > 0);
    }
```

### (c) `render(rows, empty)` — 마지막 줄 이동

현재 (함수 끝):
```js
    document.getElementById("request-count").textContent = rows.length + "건";
  }
```
교체:
```js
  }
```
(건수 표기는 (e)의 `show()`로 옮겨 라벨과 함께 한 번에 쓴다 — `role="status"`가 두 번 울리지 않게.)

### (d) `TABS` — 라벨 추가

현재:
```js
  const TABS = {
    myturn: {rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn === true), empty: "지금 내 차례인 결재가 없습니다."},
    waiting: {rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn !== true), empty: "앞 단계를 기다리는 결재가 없습니다."},
    requested: {rows: () => requested, empty: "내가 올린 승인 요청이 없습니다."},
    done: {rows: () => all.filter((r) => r.myDecision === "APPROVED" || r.myDecision === "REJECTED"), empty: "아직 처리한 건이 없습니다."},
  };
```
교체 — 필터 식은 **한 글자도 바꾸지 않고** `label`만 붙인다:
```js
  const TABS = {
    myturn: {label: "내 차례", rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn === true), empty: "지금 내 차례인 결재가 없습니다."},
    waiting: {label: "진행 중", rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn !== true), empty: "앞 단계를 기다리는 결재가 없습니다."},
    requested: {label: "내 요청", rows: () => requested, empty: "내가 올린 승인 요청이 없습니다."},
    done: {label: "처리한 건", rows: () => all.filter((r) => r.myDecision === "APPROVED" || r.myDecision === "REJECTED"), empty: "아직 처리한 건이 없습니다."},
  };
```

### (e) `syncTabBadges` → `syncNavBadges`, `show(tab)` 갱신

현재:
```js
  function syncTabBadges() {
    root.querySelectorAll(".tab").forEach((b) => {
      const badge = b.querySelector(".tab__badge");
      if (!badge) return;
      if (b.dataset.tab === "requested" && !requestedLoaded) { badge.textContent = ""; return; }
      badge.textContent = TABS[b.dataset.tab].rows().length;
    });
  }
  function show(tab) {
    const spec = TABS[tab] || TABS.myturn;
    list.setAttribute("aria-labelledby", "tab-" + tab);
    render(spec.rows(), spec.empty);
    syncTabBadges();
  }
```
교체:
```js
  function syncNavBadges() {
    root.querySelectorAll(".wb-nav__item[data-tab]").forEach((b) => {
      const badge = b.querySelector(".wb-nav__badge");
      if (!badge) return;
      if (b.dataset.tab === "requested" && !requestedLoaded) {
        badge.textContent = "";
        badge.classList.add("is-zero");
        return;
      }
      const n = TABS[b.dataset.tab].rows().length;
      badge.textContent = String(n);
      badge.classList.toggle("is-zero", n === 0);
    });
  }
  function show(tab) {
    const spec = TABS[tab] || TABS.myturn;
    const rows = spec.rows();
    listTitle.textContent = spec.label;
    render(rows, spec.empty);
    requestCount.textContent = spec.label + " " + rows.length + "건";
    syncNavBadges();
  }
```

### (f) 신규 `activate(view)` — 메뉴 상태 + 패널 전환

`show` 바로 아래에 넣는다.
```js
  function activate(view) {
    currentView = view;
    navItems.forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("is-current", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    const notice = view === "notifications";
    listPanel.hidden = notice;
    noticePanel.hidden = !notice;
    if (!notice) show(view);
    else syncNavBadges();
  }
```
> `aria-current`는 비활성 항목에서 **속성 자체를 제거**한다(`"false"`로 남기지 않는다).
> 포커스는 눌린 메뉴 버튼에 그대로 둔다 — `nav` 패턴에서 콘텐츠로 포커스를 훔치면 다음 항목으로
> Tab 이동이 끊긴다. 대신 랜드마크 이름(`#view-list-title`)과 `role="status"`인 `#request-count`가
> 전환 사실을 낭독한다.

### (g) 탭 클릭 핸들러 → 메뉴 클릭 핸들러

현재:
```js
  let requestedLoaded = false;
  root.querySelectorAll(".tab").forEach(
    (b) =>
      (b.onclick = async () => {
        root.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        if (b.dataset.tab === "requested" && !requestedLoaded) {
          try {
            requested = await (
              await fetch(base + "/mine/requested", {credentials: "same-origin"})
            ).json();
          } catch (_) {
            requested = [];
          }
          requestedLoaded = true;
        }
        show(b.dataset.tab);
      }),
  );
```
교체:
```js
  navItems.forEach(
    (b) =>
      (b.onclick = async () => {
        const view = b.dataset.view;
        if (view === "requested" && !requestedLoaded) {
          try {
            requested = await (
              await fetch(base + "/mine/requested", {credentials: "same-origin"})
            ).json();
          } catch (_) {
            requested = [];
          }
          requestedLoaded = true;
        }
        activate(view);
      }),
  );
```

### (h) 초기 로드 — `show` → `activate`

현재:
```js
    .then((r) => {
      all = r;
      metrics();
      show("myturn");
    })
    .catch(() => show("myturn"));
```
교체:
```js
    .then((r) => {
      all = r;
      metrics();
      activate(currentView);
    })
    .catch(() => activate(currentView));
```

---

## A.6 서블릿 CSS — 추가/변경/삭제 블록 전문

모두 `#dmove-approval-app` 스코프. 콤마로 이어진 셀렉터는 **조각마다** 접두사를 붙인다.

### 삭제

| 삭제 대상 (현재 줄 기준) | 이유 |
|---|---|
| `#dmove-approval-app .app-head__actions{margin-top:10px;display:flex;gap:8px}` | 관리자 링크가 메뉴로 이동 |
| `#dmove-approval-app .tabs{…}` | 탭 폐기 |
| `#dmove-approval-app .tab{…}` / `.tab:hover{…}` / `.tab[aria-selected=true]{…}` | 탭 폐기 |
| `#dmove-approval-app .tab__badge{…}` / `.tab[aria-selected=true] .tab__badge{…}` | `.wb-nav__badge`로 대체 |
| `#dmove-approval-app .panel:nth-of-type(2){animation-delay:.1s}` | 패널 순서가 바뀌어 의미 없음 |
| `#dmove-approval-app .tab:focus-visible,` (콤마 조각) | `.wb-nav__item:focus-visible`로 교체 — 아래 §변경 참조 |

### 변경

`.summary` / `.metric` 블록(현재 108~117행)을 아래로 **통째 교체**:
```css
/* 지표 — 2컬럼이 된 뒤로는 주인공이 아니다. 얇은 계기 스트립으로 */
#dmove-approval-app .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);
  border:1px solid var(--rule);border-radius:8px;overflow:hidden;margin:0 0 16px}
#dmove-approval-app .metric{background:var(--paper);padding:10px 14px 10px 16px;position:relative;
  display:flex;align-items:baseline;gap:8px;min-width:0}
#dmove-approval-app .metric::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--muted);opacity:.55}
#dmove-approval-app .metric[data-k="PENDING"]::before{background:var(--pending);opacity:1}
#dmove-approval-app .metric[data-k="APPROVED"]::before{background:var(--approved);opacity:1}
#dmove-approval-app .metric[data-k="REJECTED"]::before{background:var(--rejected);opacity:1}
#dmove-approval-app .metric[data-k="EXPIRED"]::before{background:var(--expired);opacity:1}
#dmove-approval-app .metric b{font:700 19px/1 var(--mono);letter-spacing:-.02em;font-variant-numeric:tabular-nums;flex:none}
#dmove-approval-app .metric span{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
```

포커스 규칙(현재 131행)을 교체:
```css
#dmove-approval-app .wb-nav__item:focus-visible,#dmove-approval-app .ghost:focus-visible,#dmove-approval-app .ghost-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
```

애니메이션 지연 규칙(현재 203~207행)을 교체:
```css
#dmove-approval-app .metric,#dmove-approval-app .panel,#dmove-approval-app .wb-nav{animation:dmove-rise .42s cubic-bezier(.2,.7,.3,1) both}
#dmove-approval-app .summary .metric:nth-child(2){animation-delay:.04s}
#dmove-approval-app .summary .metric:nth-child(3){animation-delay:.08s}
#dmove-approval-app .summary .metric:nth-child(4){animation-delay:.12s}
#dmove-approval-app .wb-main .panel{animation-delay:.08s}
```

### 추가 — 레이아웃과 메뉴 (`.table-wrap` 규칙 바로 뒤에 넣는다)

```css
/* ── 2컬럼 작업대 ─────────────────────────────────────────── */
#dmove-approval-app .workbench{display:grid;grid-template-columns:216px minmax(0,1fr);gap:28px;align-items:start}
#dmove-approval-app .wb-main{min-width:0}

/* ── 좌측 메뉴 — Confluence 스페이스 사이드바와 같은 밀도 ───── */
#dmove-approval-app .wb-nav{position:sticky;top:16px;padding:0 20px 4px 0;border-right:1px solid var(--rule)}
#dmove-approval-app .wb-nav__title{margin:0 0 8px;padding:0 10px;font:600 10.5px/1.6 var(--mono);
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
#dmove-approval-app .wb-nav__group{list-style:none;margin:0;padding:0}
#dmove-approval-app .wb-nav__group--aux{margin-bottom:0}
#dmove-approval-app .wb-nav__group + .wb-nav__title{margin-top:18px;padding-top:16px;border-top:1px solid var(--rule)}
#dmove-approval-app .wb-nav li{margin:0}

#dmove-approval-app .wb-nav__item{display:flex;align-items:center;gap:9px;width:100%;
  border:0;background:transparent;font:inherit;font-size:13.5px;color:var(--ink-soft);text-align:left;text-decoration:none;
  padding:7px 10px;border-radius:6px;cursor:pointer;transition:background .15s,color .15s}
#dmove-approval-app .wb-nav__item:hover{background:var(--sunk);color:var(--ink)}
#dmove-approval-app .wb-nav__item[aria-current=page]{background:var(--accent-soft);color:var(--accent);font-weight:700}
#dmove-approval-app .wb-nav__icon{display:inline-flex;flex:none;color:var(--muted)}
#dmove-approval-app .wb-nav__item:hover .wb-nav__icon{color:var(--ink-soft)}
#dmove-approval-app .wb-nav__item[aria-current=page] .wb-nav__icon{color:var(--accent)}
#dmove-approval-app .wb-nav__label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#dmove-approval-app .wb-nav__badge{flex:none;min-width:1.6em;padding:1px 6px;border-radius:9px;
  background:var(--sunk);border:1px solid var(--rule);
  font:600 11px/1.5 var(--mono);color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
#dmove-approval-app .wb-nav__item[aria-current=page] .wb-nav__badge{background:var(--paper);border-color:var(--accent);color:var(--accent)}
#dmove-approval-app .wb-nav__badge.is-zero{opacity:.45}
#dmove-approval-app .wb-nav__badge.is-zero:empty{display:none}
#dmove-approval-app .wb-nav__badge--alert{background:var(--pending-bg);border-color:var(--pending);color:var(--pending)}
```

### 추가 — 반응형 (기존 `@media (max-width:900px)` **앞에** 넣는다)

```css
/* 좁아지면 메뉴가 상단 가로 스크롤 스트립이 된다 */
@media (max-width:1024px){
  #dmove-approval-app .workbench{grid-template-columns:1fr;gap:16px}
  #dmove-approval-app .wb-nav{position:static;display:flex;align-items:center;gap:12px;
    padding:0 0 2px;border-right:0;border-bottom:1px solid var(--rule);
    overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
  #dmove-approval-app .wb-nav__title{display:none}
  #dmove-approval-app .wb-nav__group{display:flex;gap:2px;flex:none}
  #dmove-approval-app .wb-nav__group--aux{padding-left:12px;border-left:1px solid var(--rule)}
  #dmove-approval-app .wb-nav__item{width:auto;white-space:nowrap;border-radius:6px 6px 0 0;padding:8px 12px}
  #dmove-approval-app .wb-nav__item[aria-current=page]{box-shadow:inset 0 -2px 0 var(--accent)}
  #dmove-approval-app .wb-nav__label{overflow:visible}
}
```

기존 `@media (max-width:600px)` 블록에 한 줄 추가:
```css
  #dmove-approval-app .summary{grid-template-columns:repeat(2,1fr)}
```
(900px 블록의 `.summary{grid-template-columns:repeat(2,1fr)}`는 그대로 두고, 600px에서도 2칸 유지 — 4칸이 44px 높이에서 줄바꿈 없이 들어가지 않는다.)

---

## B. 스페이스 사이드바 진입 링크 정리

### B.1 `atlassian-plugin.xml` 변경

```diff
     <web-item key="approval-inbox-link" name="Approval Inbox" section="system.navigation" weight="200">
-        <label>✓ 승인 업무함</label>
+        <label>승인 업무함</label>
         <link linkId="dmove-approval-inbox-link">/plugins/servlet/approval-inbox</link>
     </web-item>
 
     <web-item key="approval-inbox-sidebar-link" name="Approval Inbox Sidebar Link"
-              section="system.space.sidebar/main-links" weight="200">
-        <label>✓ 승인 업무함</label>
+              section="system.space.sidebar/main-links" weight="1000">
+        <label>승인 업무함</label>
         <link linkId="dmove-approval-inbox-sidebar-link">/plugins/servlet/approval-inbox</link>
         <styleClass>dmove-approval-inbox-sidebar-link</styleClass>
     </web-item>
```

- `weight="1000"` — Confluence 기본 main-links(페이지/블로그/스페이스 바로가기 등)는 전부 400 이하다.
  1000이면 확실히 **맨 아래**에 붙는다.
- `system.navigation` 쪽은 상단 헤더 텍스트 링크라 아이콘을 붙이지 않는다(라벨만 정리).

### B.2 `approval.css` 추가 (파일 맨 끝)

```css
/* ── 스페이스 사이드바 진입 링크 아이콘 ──────────────────────
   web-item은 label에 마크업을 못 넣는다. styleClass/linkId가 어느 요소에
   붙는지는 Confluence 버전마다 달라서(앵커 또는 li) 세 갈래를 모두 건다.
   같은 앵커가 두 셀렉터에 걸려도 ::before는 요소당 하나라 중복되지 않는다. */
a#dmove-approval-inbox-sidebar-link::before,
a.dmove-approval-inbox-sidebar-link::before,
li.dmove-approval-inbox-sidebar-link > a::before {
    content: "";
    display: inline-block;
    flex: none;
    width: 16px;
    height: 16px;
    margin-right: 8px;
    vertical-align: -3px;
    background-color: currentColor;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12.5 5 4.5h10l2 8v4H3z'/%3E%3Cpath d='M3 12.5h4l1 2h4l1-2h4'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12.5 5 4.5h10l2 8v4H3z'/%3E%3Cpath d='M3 12.5h4l1 2h4l1-2h4'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
}
```

> **검증 지시**: 배포 후 DevTools로 사이드바 항목 DOM을 확인하고, 세 셀렉터 중 실제로 맞은 것만
> 남기고 나머지는 지운다(주석에 "확인된 형태: …"를 남길 것). 셋 다 안 맞으면 실제 요소의
> 클래스/구조를 이 문서에 추가 보고한다.

---

## C. 승인 요청 버튼 아이콘

`approval.css` 추가 (B.2 바로 아래):

```css
/* ── 페이지 상단 액션 "승인 요청" 아이콘 (도장 모티프) ────────
   linkId가 앵커의 id가 되므로 #dmove-approval-request-action이 가장 확실한 후크다.
   button 갈래는 §E의 영역 매크로 트리거를 위한 것이다. */
a#dmove-approval-request-action::before,
a.dmove-approval-request-trigger::before,
button.dmove-approval-request-trigger::before,
li.dmove-approval-request-trigger > a::before {
    content: "";
    display: inline-block;
    flex: none;
    width: 16px;
    height: 16px;
    margin-right: 6px;
    vertical-align: -3px;
    background-color: currentColor;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z'/%3E%3Cpath d='M5 16.25h10'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z'/%3E%3Cpath d='M5 16.25h10'/%3E%3C/svg%3E") center / 16px 16px no-repeat;
}
```

정렬 주의
- `width/height:16px` + `vertical-align:-3px` — Confluence 상단 액션 버튼은 line-height 20~24px이므로
  16px 아이콘이 베이스라인에서 3px 내려가야 텍스트 중심과 맞는다.
- 앵커가 `display:flex`인 스킨이면 `vertical-align`이 무시되고 `align-items:center`가 먹으므로
  양쪽 모두 안전하도록 `flex:none`을 함께 둔다.
- **`::before`를 `.aui-icon` 위에 얹지 않는다** — Confluence가 이미 아이콘 span을 넣는 버전이면
  아이콘이 둘로 보인다. 확인 후 그런 경우에는 `content` 대신 기존 span을 `mask`로 덮는 방식으로 바꾸고
  이 문서에 보고할 것.

---

## D. 승인 요청 모달 재설계

### D.1 현재 모달 진단 (코드 기준)

| # | 문제 | 근거(현재 코드) |
|---|------|------|
| D-1 | **레이아웃 점프** — 승인자 검색 결과가 문서 흐름에 펼쳐지면서 아래 "그룹 추가" 필드와 "승인 순서"가 최대 208px 밀린다 | `.dmove-approval-results{margin:-1px 0 0;max-height:208px}` + 두 `.dmove-approval-field`가 세로로 연속 |
| D-2 | **탭이 떠 있다** — `padding:0 20px`인 밑줄 탭이 `padding:16px 20px 8px`인 헤더 아래에 붙어 정렬이 어긋나고, 항목 2개짜리 밑줄 탭은 시각적으로 빈약하다 | `.dmove-approval-tabs{padding:0 20px;border-bottom:2px solid #dfe1e6}` |
| D-3 | **순서 버튼이 디버그 UI처럼 보인다** — `↑ ↓ ×` 글리프를 `aui-button-link`에 텍스트로 넣었다. 폰트마다 크기·정렬이 달라진다 | `iconButton('dmove-approval-step-up', …, '↑')` |
| D-4 | **선택 목록에 위계가 없다** — 회색 납작한 줄에 파란 원형 번호만 있고, 사용자/그룹이 `"그룹: "` 접두 텍스트로만 구분된다 | `.dmove-approval-selected-step{background:#fafbfc}` / `addStep(form,'group',…, '그룹: ' + …)` |
| D-5 | **그룹의 requireAll이 선택 후 사라진다** — 검색 결과에서는 "전원 승인/한 명 승인"을 보여주는데 선택하면 그 정보가 없어진다 | 결과 버튼의 `meta.textContent`만 존재, `addStep`에 전달되지 않음 |
| D-6 | **결과 0건 상태가 없다** — 검색해도 아무 일도 안 일어난 것처럼 보인다 | `results.hidden = values.length === 0;` |
| D-7 | **제출 전 요약이 없다** — 몇 단계가 되는지 확인할 방법이 없다 | 해당 마크업 없음 |
| D-8 | **끝 항목의 ↑/↓가 살아 있다** — 눌러도 아무 일도 안 일어난다 | `if (current.previousElementSibling)` 로 조용히 무시 |
| D-9 | **푸터 메시지가 버튼을 밀어낸다** — 긴 오류 문구가 `margin-right:auto`로 버튼을 화면 밖으로 민다 | `.dmove-approval-modal__footer{flex-wrap 없음}` |
| D-10 | CSS 중복 — `.dmove-approval-modal__header`가 두 번 선언되어 있다(185행, 365행) | 파일 그대로 |

### D.2 JS 계약 — 절대 바꾸지 않는 것

`dmove-approval-request` / `dmove-approval-tab` / `data-approval-tab` / `dmove-approval-pane` /
`data-approval-pane` / `data-approval-mode` / `input[name=approverSearch]` /
`input[name=approverGroupSearch]` / `select[name=flowId]` / `input[name=steps]` /
`dmove-approval-results` / `dmove-approval-user-results` / `dmove-approval-group-results` /
`dmove-approval-select-user` / `dmove-approval-select-group` / `dmove-approval-selected-steps` /
`dmove-approval-selected-step` / `dmove-approval-step-order` / `dmove-approval-step-label` /
`dmove-approval-step-up` / `-down` / `-remove` / `dmove-approval-step-controls` /
`dmove-approval-flow-preview` / `dmove-approval-empty` / `dmove-approval-message` /
`data-approval-close` / `data-approval-autofocus` / `li[data-step-type][data-step-key]`

**추가**되는 것: `dmove-approval-scope`, `dmove-approval-scope__btn`, `data-approval-scope`,
`data-approval-scope-pane`, `dmove-approval-step-avatar`, `dmove-approval-step-body`,
`dmove-approval-step-meta`, `dmove-approval-step-summary`, `dmove-approval-step-btn`,
`dmove-approval-results__empty`, `dmove-approval-field__row`.

### D.3 새 요청 모달 마크업 (= `ApprovalMarkup.requestDialog`가 만드는 것)

```
div.dmove-approval-modal.dmove-approval-modal--request[hidden]
  div.dmove-approval-modal__backdrop[data-approval-close=1]
  div.dmove-approval-modal__box[role=dialog][aria-modal=true][aria-label=<dialogTitle>]
    form.dmove-approval-request[data-approval-mode=direct]
      div.dmove-approval-modal__header
        div
          h2                                        <dialogTitle>
          p.dmove-approval-modal__lead              <lead>
        button.aui-button.aui-button-link.dmove-approval-modal__close[data-approval-close=1][aria-label=닫기] "×"

      div.dmove-approval-tabs[role=tablist][aria-label="승인자 지정 방식"]
        button.dmove-approval-tab[data-approval-tab=direct][role=tab][aria-selected=true]  "승인자 직접 지정"
        button.dmove-approval-tab[data-approval-tab=flow]  [role=tab][aria-selected=false] "승인 Flow 사용"

      div.dmove-approval-modal__body

        section.dmove-approval-pane[data-approval-pane=direct][role=tabpanel][aria-label="승인자 직접 지정"]
          div.dmove-approval-field
            div.dmove-approval-field__row
              span.dmove-approval-field__label                        "승인자 추가"
              div.dmove-approval-scope[role=tablist][aria-label="승인자 검색 대상"]
                button.dmove-approval-scope__btn[data-approval-scope=user] [role=tab][aria-selected=true]  "사용자"
                button.dmove-approval-scope__btn[data-approval-scope=group][role=tab][aria-selected=false] "그룹"
            div[data-approval-scope-pane=user][role=tabpanel][aria-label="사용자 검색"]
              label                                   ← 스타일 없는 감싸는 라벨. label 자체에 sr-only를 주면 input까지 클리핑된다
                span.dmove-approval-sr-only "이름 또는 계정으로 검색"
                input[type=search][name=approverSearch].text[placeholder="이름 또는 계정으로 검색"][autocomplete=off]
              ul.dmove-approval-results.dmove-approval-user-results[hidden]
            div[data-approval-scope-pane=group][role=tabpanel][aria-label="그룹 검색"][hidden]
              label
                span.dmove-approval-sr-only "그룹 이름으로 검색"
                input[type=search][name=approverGroupSearch].text[placeholder="그룹 이름으로 검색"][autocomplete=off]
              ul.dmove-approval-results.dmove-approval-group-results[hidden]
              p.dmove-approval-hint    "그룹은 한 단계로 묶입니다. 전원 승인 여부는 그룹 설정을 따릅니다."

          div.dmove-approval-field
            span.dmove-approval-field__label                          "승인 순서"
            ol.dmove-approval-selected-steps[aria-live=polite]
            p.dmove-approval-empty   "아직 추가한 승인자가 없습니다. 위에서 검색해 추가하세요."
            p.dmove-approval-step-summary[aria-live=polite]

          input[type=hidden][name=steps]

        section.dmove-approval-pane[data-approval-pane=flow][role=tabpanel][aria-label="승인 Flow 사용"][hidden]
          div.dmove-approval-field
            label > span.dmove-approval-field__label "승인 Flow"
                  > select[name=flowId].select.dmove-approval-flow
                      option[value=""] "Flow를 선택하세요"
          div.dmove-approval-flow-preview[aria-live=polite]
            p.dmove-approval-empty "Flow를 선택하면 승인 순서와 담당자를 보여줍니다."

      div.dmove-approval-modal__footer
        span.dmove-approval-message[role=status]
        button.aui-button.aui-button-link[data-approval-close=1]  "취소"
        button.aui-button.aui-button-primary[type=submit]         <submitLabel>
```

변경 요점
1. `id`/`for` **전부 제거** → 감싸는 `<label>`. (§0.7, 매크로 다중 렌더링 대비)
   사용자 검색 input의 라벨은 `.dmove-approval-field__row`의 `span`이 시각적으로 담당하지만
   프로그래밍적 연결이 필요하므로 **스타일 없는 `<label>`로 감싸고 라벨 텍스트만 `<span class="dmove-approval-sr-only">`에 넣는다**
   (label 자체에 sr-only를 주면 clip이 input까지 숨긴다 — 1차 QA C-1 사고의 원인).
2. 두 검색 필드를 **`data-approval-scope-pane`으로 배타 전환** → D-1 해소.
3. `.dmove-approval-step-summary` 추가 → D-7 해소.
4. 빈 상태 문구에 다음 행동을 넣는다 → D-6/D-4 보조.

### D.4 `approval.js` 변경 명세

#### (a) `iconButton` — 텍스트 글리프 → SVG (D-3)

현재:
```js
    function iconButton(className, label, text) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'aui-button aui-button-link ' + className;
        button.setAttribute('aria-label', label);
        button.textContent = text;
        return button;
    }
```
교체:
```js
    var ICON_UP = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
        + '<path fill="currentColor" d="M8 5.2 3.9 9.3 2.8 8.2 8 3l5.2 5.2-1.1 1.1z"/></svg>';
    var ICON_DOWN = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
        + '<path fill="currentColor" d="M8 10.8 12.1 6.7l1.1 1.1L8 13 2.8 7.8l1.1-1.1z"/></svg>';
    var ICON_REMOVE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
        + '<path fill="currentColor" d="M12.4 4.7 9.1 8l3.3 3.3-1.1 1.1L8 9.1l-3.3 3.3-1.1-1.1L6.9 8 3.6 4.7l1.1-1.1L8 6.9l3.3-3.3z"/></svg>';

    /** svg는 이 파일 안의 정적 리터럴이다. 사용자 입력이 섞이지 않으므로 innerHTML이 안전하다. */
    function iconButton(className, label, svg) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'aui-button aui-button-subtle dmove-approval-step-btn ' + className;
        button.setAttribute('aria-label', label);
        button.innerHTML = svg;
        return button;
    }
```

#### (b) `addStep` — 아바타/메타/본문 래퍼 (D-4, D-5)

현재 시그니처: `addStep(form, type, key, label)`
교체 시그니처: `addStep(form, type, key, label, meta)`

```js
    function stepInitial(label) {
        var text = String(label || '').replace(/^그룹:\s*/, '').trim();
        return text ? text.charAt(0).toUpperCase() : '?';
    }

    function addStep(form, type, key, label, meta) {
        var duplicate = stepItems(form).some(function (item) {
            return item.dataset.stepType === type && item.dataset.stepKey === key;
        });
        if (duplicate) {
            return;
        }
        var item = document.createElement('li');
        item.className = 'dmove-approval-selected-step';
        item.dataset.stepType = type;
        item.dataset.stepKey = key;

        var order = document.createElement('span');
        order.className = 'dmove-approval-step-order';
        item.appendChild(order);

        var avatar = document.createElement('span');
        avatar.className = 'dmove-approval-step-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = stepInitial(label);
        item.appendChild(avatar);

        var body = document.createElement('span');
        body.className = 'dmove-approval-step-body';
        var name = document.createElement('span');
        name.className = 'dmove-approval-step-label';
        name.textContent = label;
        body.appendChild(name);
        if (meta) {
            var note = document.createElement('span');
            note.className = 'dmove-approval-step-meta';
            note.textContent = meta;
            body.appendChild(note);
        }
        item.appendChild(body);

        var controls = document.createElement('span');
        controls.className = 'dmove-approval-step-controls';
        controls.appendChild(iconButton('dmove-approval-step-up', label + ' 순서 올리기', ICON_UP));
        controls.appendChild(iconButton('dmove-approval-step-down', label + ' 순서 내리기', ICON_DOWN));
        controls.appendChild(iconButton('dmove-approval-step-remove', label + ' 제거', ICON_REMOVE));
        item.appendChild(controls);

        stepList(form).appendChild(item);
        syncSteps(form);
    }
```
> `.dmove-approval-step-label`이 `.dmove-approval-step-body` 안으로 한 겹 들어가지만
> `syncSteps`는 `.dmove-approval-step-order`만 찾고 `li.dataset`만 읽으므로 계약이 깨지지 않는다.

호출부 2곳:
```js
        if (button.classList.contains('dmove-approval-select-user')) {
            addStep(form, 'user', button.dataset.userKey, button.dataset.displayName, '사용자');
            …
        if (button.classList.contains('dmove-approval-select-group')) {
            addStep(form, 'group', button.dataset.groupName,
                '그룹: ' + (button.dataset.displayName || button.dataset.groupName),
                button.dataset.requireAll === 'true' ? '그룹 · 전원 승인' : '그룹 · 한 명 승인');
            …
```
그룹 결과 버튼 생성부에 데이터 1줄 추가:
```js
                button.dataset.groupName = group.name;
                button.dataset.displayName = group.displayName || group.name;
                button.dataset.requireAll = String(!!group.requireAll);
```

#### (c) `syncSteps` — 요약 + 끝 항목 비활성 (D-7, D-8)

현재:
```js
    function syncSteps(form) {
        var items = stepItems(form);
        items.forEach(function (item, index) {
            var order = item.querySelector('.dmove-approval-step-order');
            if (order) {
                order.textContent = String(index + 1);
            }
        });
        form.elements.steps.value = items…
        syncStepEmptyState(form);
    }
```
교체:
```js
    function syncSteps(form) {
        var items = stepItems(form);
        items.forEach(function (item, index) {
            var order = item.querySelector('.dmove-approval-step-order');
            if (order) {
                order.textContent = String(index + 1);
            }
            var up = item.querySelector('.dmove-approval-step-up');
            var down = item.querySelector('.dmove-approval-step-down');
            if (up) { up.disabled = index === 0; }
            if (down) { down.disabled = index === items.length - 1; }
        });
        form.elements.steps.value = items
            .map(function (item) {
                return item.dataset.stepType + ':' + item.dataset.stepKey;
            })
            .join(';');
        var summary = form.querySelector('.dmove-approval-step-summary');
        if (summary) {
            summary.textContent = items.length
                ? '총 ' + items.length + '단계 · 위에서 아래 순서로 승인합니다.'
                : '';
        }
        syncStepEmptyState(form);
    }
```

#### (d) ↑/↓ 클릭 후 포커스 유실 방지 (D-8 부작용 차단)

현재:
```js
        if (button.classList.contains('dmove-approval-step-up')) {
            var current = button.closest('li');
            if (current.previousElementSibling) {
                current.parentNode.insertBefore(current, current.previousElementSibling);
            }
            syncSteps(form);
            return;
        }
        if (button.classList.contains('dmove-approval-step-down')) {
            var item = button.closest('li');
            if (item.nextElementSibling) {
                item.parentNode.insertBefore(item.nextElementSibling, item);
            }
            syncSteps(form);
            return;
        }
```
교체:
```js
        if (button.classList.contains('dmove-approval-step-up')
                || button.classList.contains('dmove-approval-step-down')) {
            var moving = button.closest('li');
            if (button.classList.contains('dmove-approval-step-up')) {
                if (moving.previousElementSibling) {
                    moving.parentNode.insertBefore(moving, moving.previousElementSibling);
                }
            } else if (moving.nextElementSibling) {
                moving.parentNode.insertBefore(moving.nextElementSibling, moving);
            }
            syncSteps(form);
            // 끝으로 이동해 방금 누른 버튼이 disabled가 되면 포커스가 body로 날아간다.
            var keep = button.disabled
                ? moving.querySelector('.dmove-approval-step-up:not([disabled]),'
                    + ' .dmove-approval-step-down:not([disabled]),'
                    + ' .dmove-approval-step-remove')
                : button;
            if (keep) { keep.focus(); }
            return;
        }
```

#### (e) 검색 결과 0건 상태 (D-6)

`clearResults` 아래에 추가:
```js
    function showEmptyResult(form, selector, message) {
        var results = form.querySelector(selector);
        if (!results) {
            return;
        }
        results.replaceChildren();
        var item = document.createElement('li');
        item.className = 'dmove-approval-results__empty';
        item.textContent = message;
        results.appendChild(item);
        results.hidden = false;
    }
```
`search()`의 성공 콜백 교체:
```js
            .then(function (values) {
                if (input.value.trim() !== query) {
                    return;
                }
                if (!values.length) {
                    showEmptyResult(form, selector, '검색 결과가 없습니다.');
                    return;
                }
                showResults(form, selector, values, toButton);
            })
```

#### (f) 검색 대상(사용자/그룹) 전환 (D-1)

`switchTab` 아래에 추가:
```js
    function switchScope(form, scope) {
        Array.from(form.querySelectorAll('.dmove-approval-scope__btn')).forEach(function (btn) {
            btn.setAttribute('aria-selected', String(btn.dataset.approvalScope === scope));
        });
        Array.from(form.querySelectorAll('[data-approval-scope-pane]')).forEach(function (pane) {
            pane.hidden = pane.dataset.approvalScopePane !== scope;
        });
        var input = form.querySelector('[data-approval-scope-pane="' + scope + '"] input');
        if (input) {
            input.focus();   // 그룹이면 focusin 핸들러가 전체 목록을 띄운다
        }
    }
```
click 리스너 최상단(`.dmove-approval-tab` 분기 **바로 뒤**)에 삽입:
```js
        var scopeBtn = event.target.closest('.dmove-approval-scope__btn');
        if (scopeBtn) {
            event.preventDefault();
            switchScope(scopeBtn.closest('.dmove-approval-request'), scopeBtn.dataset.approvalScope);
            return;
        }
```

#### (g) `renderFlowPreview` — 선택 목록과 같은 카드로 (일관성)

현재 각 항목이 `order`(선택) + `label`만 만든다. 아래처럼 아바타/본문을 맞춘다.
```js
        flow.approvers.forEach(function (approver, index) {
            var item = document.createElement('li');
            item.className = 'dmove-approval-selected-step';
            item.dataset.stepType = approver.type === 'GROUP' ? 'group' : 'user';
            if (flow.sequential) {
                var order = document.createElement('span');
                order.className = 'dmove-approval-step-order';
                order.textContent = String(index + 1);
                item.appendChild(order);
            }
            var avatar = document.createElement('span');
            avatar.className = 'dmove-approval-step-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = stepInitial(approver.displayName);
            item.appendChild(avatar);
            var body = document.createElement('span');
            body.className = 'dmove-approval-step-body';
            var label = document.createElement('span');
            label.className = 'dmove-approval-step-label';
            label.textContent = (approver.type === 'GROUP' ? '그룹: ' : '') + approver.displayName;
            body.appendChild(label);
            item.appendChild(body);
            list.appendChild(item);
        });
```

#### (h) `syncStepEmptyState` — 요약 줄도 같이 감춘다

현재:
```js
    function syncStepEmptyState(form) {
        var empty = form.querySelector('.dmove-approval-pane[data-approval-pane="direct"] .dmove-approval-empty');
        if (empty) {
            empty.hidden = stepItems(form).length > 0;
        }
    }
```
변경 없음(요약은 `syncSteps`가 빈 문자열로 만들고 CSS `:empty`가 숨긴다).

### D.5 `approval.css` — 요청 모달 블록 (교체/추가/삭제)

**삭제**
| 대상 | 이유 |
|---|---|
| `.dmove-approval-region-request input[name="minimumApprovals"]{width:60px}` | 해당 input이 마크업에 없다(dead) |
| `.dmove-approval-page-request input[name="minimumApprovals"]{width:60px}` | 동일 |
| `.dmove-approval-page-panel__actions,.dmove-approval-page-request{…}` 규칙 전체 | 배치 2에서 `__actions` 제거됨, `page-request` 클래스도 §E에서 폐기 |
| `.dmove-approval-region__actions,.dmove-approval-region-request{…}` 규칙 전체 | §E에서 인라인 액션/폼 제거 |
| `.dmove-approval-modal__header{align-items:flex-start}` (364~367행의 중복 선언) | D-10 — 아래 통합 규칙으로 흡수 |

**교체** — `.dmove-approval-modal__header` 통합, 여백 정돈
```css
.dmove-approval-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 24px 12px;
}

.dmove-approval-modal__header h2 {
    margin: 0;
    font-size: 18px;
    line-height: 1.35;
    letter-spacing: -0.01em;
}

.dmove-approval-modal__lead {
    margin: 4px 0 0;
    color: #5e6c84;
    font-size: 13px;
    line-height: 1.5;
}

.dmove-approval-modal__body {
    padding: 4px 24px 20px;
    overflow-y: auto;
}

.dmove-approval-modal__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 24px 18px;
    border-top: 1px solid #dfe1e6;
}

.dmove-approval-modal__footer .dmove-approval-message {
    margin-right: auto;
    min-width: 0;
    flex: 1 1 200px;          /* 길어지면 버튼을 밀지 않고 스스로 줄바꿈한다 (D-9) */
}

.dmove-approval-modal--request .dmove-approval-modal__box {
    width: min(600px, calc(100vw - 32px));
}
```

**교체** — 탭을 세그먼트 컨트롤로 (D-2)
```css
.dmove-approval-tabs {
    display: inline-flex;
    gap: 2px;
    margin: 0 24px;
    padding: 3px;
    border: 0;
    border-radius: 8px;
    background: #f1f2f4;
}

.dmove-approval-tab {
    border: 0;
    border-radius: 6px;
    margin: 0;
    background: transparent;
    padding: 6px 14px;
    font: inherit;
    font-size: 13px;
    color: #44546f;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
}

.dmove-approval-tab:hover {
    background: rgba(9, 30, 66, 0.06);
}

.dmove-approval-tab[aria-selected="true"] {
    background: #fff;
    color: #0052cc;
    font-weight: 700;
    border-bottom-color: transparent;
    box-shadow: 0 1px 2px rgba(9, 30, 66, 0.16);
}

.dmove-approval-tab:focus-visible {
    outline: 2px solid #0052cc;
    outline-offset: 1px;
}
```

**추가** — 필드 헤더 행 + 검색 대상 세그먼트
```css
.dmove-approval-field__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
}

.dmove-approval-field__row .dmove-approval-field__label {
    margin: 0;
}

.dmove-approval-scope {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 6px;
    background: #f1f2f4;
}

.dmove-approval-scope__btn {
    border: 0;
    border-radius: 4px;
    background: transparent;
    padding: 3px 10px;
    font: inherit;
    font-size: 12px;
    color: #5e6c84;
    cursor: pointer;
}

.dmove-approval-scope__btn[aria-selected="true"] {
    background: #fff;
    color: #172b4d;
    font-weight: 700;
    box-shadow: 0 1px 1px rgba(9, 30, 66, 0.16);
}

.dmove-approval-scope__btn:focus-visible {
    outline: 2px solid #0052cc;
    outline-offset: 1px;
}

[data-approval-scope-pane][hidden] {
    display: none;
}
```

**추가/교체** — 검색 결과
```css
.dmove-approval-results {
    list-style: none;
    margin: -1px 0 0;
    padding: 0;
    max-height: 208px;
    overflow-y: auto;
    border: 1px solid #dfe1e6;
    border-top-color: #c1c7d0;
    border-radius: 0 0 4px 4px;
    background: #fff;
    box-shadow: 0 6px 12px -8px rgba(9, 30, 66, 0.35);
}

.dmove-approval-results__empty {
    padding: 12px;
    color: #5e6c84;
    font-size: 13px;
    text-align: center;
}

.dmove-approval-result__meta {
    display: block;
    font-size: 12px;
    color: #5e6c84;
}
```
(`.dmove-approval-results li + li`, `.dmove-approval-results .aui-button` 규칙은 유지.)

**교체** — 선택된 승인자 카드 (D-3, D-4, D-5)
```css
.dmove-approval-selected-steps {
    list-style: none;
    margin: 0;
    padding: 0;
}

.dmove-approval-selected-step {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 10px;
    border: 1px solid #dfe1e6;
    border-radius: 6px;
    margin-bottom: 8px;
    background: #fff;
    box-shadow: 0 1px 1px rgba(9, 30, 66, 0.06);
}

/* 카드 사이를 잇는 점선 — 이 목록이 "순서"라는 걸 형태로 말한다 */
.dmove-approval-selected-step + .dmove-approval-selected-step::before {
    content: "";
    position: absolute;
    left: 21px;
    top: -9px;
    height: 9px;
    border-left: 2px dotted #c1c7d0;
}

.dmove-approval-step-order {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    background: #0052cc;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    flex: none;
}

.dmove-approval-step-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: #dfe1e6;
    color: #42526e;
    font-size: 12px;
    font-weight: 700;
    flex: none;
}

.dmove-approval-selected-step[data-step-type="group"] .dmove-approval-step-avatar {
    border-radius: 6px;
    background: #deebff;
    color: #0747a6;
}

.dmove-approval-step-body {
    flex: 1;
    min-width: 0;
}

.dmove-approval-step-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #172b4d;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dmove-approval-step-meta {
    display: block;
    margin-top: 1px;
    font-size: 11.5px;
    color: #5e6c84;
}

.dmove-approval-step-controls {
    display: inline-flex;
    gap: 2px;
    flex: none;
}

.dmove-approval-step-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    min-width: 24px;
    padding: 0;
    border-radius: 4px;
    color: #5e6c84;
}

.dmove-approval-step-btn:hover:not([disabled]) {
    background: #ebecf0;
    color: #172b4d;
}

.dmove-approval-step-btn[disabled] {
    opacity: 0.35;
    cursor: default;
}

.dmove-approval-step-btn.dmove-approval-step-remove:hover {
    background: #ffecea;
    color: #ae2e24;
}

.dmove-approval-step-summary {
    margin: 8px 0 0;
    color: #5e6c84;
    font-size: 12px;
}

.dmove-approval-step-summary:empty {
    display: none;
}

/* Flow 미리보기는 읽기 전용이라 카드 그림자/연결선을 뺀다 */
.dmove-approval-flow-preview .dmove-approval-selected-step {
    box-shadow: none;
    background: #fff;
}

.dmove-approval-flow-preview .dmove-approval-selected-step + .dmove-approval-selected-step::before {
    display: none;
}
```
> 기존 `.dmove-approval-step-controls .aui-button{min-width:20px;padding:0 4px;line-height:1}` 는
> **삭제**하고 위 `.dmove-approval-step-btn` 규칙으로 대체한다.

**교체** — 빈 상태
```css
.dmove-approval-empty {
    margin: 6px 0 0;
    padding: 16px 12px;
    border: 1px dashed #dfe1e6;
    border-radius: 6px;
    background: #fafbfc;
    color: #5e6c84;
    font-size: 13px;
    text-align: center;
}
```

---

## E. approval-region 매크로 개편

### E.1 목표 구조

```
section.dmove-approval-region
  [data-approval-page-id][data-approval-content-version][data-approval-region-key]
  [data-approval-status][data-approval-can-request]
  [data-approval-request-id][data-approval-actor-key]        (해당될 때만)

  header.dmove-approval-region__header
    span.dmove-approval-region__key       "콘텐츠 승인"  + code(regionKey, default 아닐 때만)
    ── 요청 있음:  button.dmove-approval-pill.dmove-approval-pill--{status}[data-approval-detail-open=1]
                    (§ApprovalMarkup.pill — 패널과 완전히 동일한 마크업/아이콘/모디파이어)
    ── 요청 없음:  span.dmove-approval-pill.dmove-approval-pill--none
    ── canRequest: button.aui-button.aui-button-link.dmove-approval-request-trigger  "승인 요청"

  div.dmove-approval-region__notice        (중복 key 경고 — 유지)
  span.dmove-approval-message[role=status]
  div.dmove-approval-region__body          (매크로 body 원본 그대로)

  div.dmove-approval-modal.dmove-approval-modal--detail[hidden]     (요청 있을 때)
  div.dmove-approval-modal.dmove-approval-modal--request[hidden]    (canRequest일 때)
```

**영역 밖으로 나가는 것**: 상태 라벨/단계 수/버전/마감 인라인 span, `dmove-approval-steps` 목록,
`dmove-approval-region__timeline`, `dmove-approval-region__actions`의 승인·반려 버튼, 인라인 요청 폼.
전부 detail 모달 / request 모달로 이동한다.

### E.2 신규 `ApprovalMarkup` (§0.6 추출)

`approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/ui/ApprovalMarkup.java`

```java
package kr.dmove.confluence.approval.c9.ui;

public final class ApprovalMarkup {
    private ApprovalMarkup() {}

    // ApprovalPagePanel의 ICON_* 6개를 그대로 이관 (문자열 리터럴 변경 금지)
    public static final String ICON_PENDING  = "...";
    public static final String ICON_APPROVED = "...";
    public static final String ICON_REJECTED = "...";
    public static final String ICON_EXPIRED  = "...";
    public static final String ICON_NONE     = "...";
    public static final String ICON_CARET    = "...";

    public static String escape(String value);
    public static String statusModifier(ApprovalStatus status);
    public static String pillModifier(ApprovalStatus status);
    public static String iconFor(ApprovalStatus status);
    public static String decisionLabel(ApprovalDecision decision);
    public static String eventLabel(ApprovalEventType type);
    public static String progressLabel(ApprovalRequest request);

    /** 요청 없음 pill (span — 열 상세가 없으므로 버튼이 아니다). */
    public static void emptyPill(StringBuilder html, String label);

    /** 상세 모달을 여는 상태 pill. statusLabel은 raw 값을 넘기면 내부에서 escape한다. */
    public static void pill(StringBuilder html, ApprovalRequest request, String statusLabel);

    /**
     * 상세 모달. nameResolver는 actorKey → 표시 이름(캐시는 호출측 책임).
     * dialogTitle 예: "페이지 승인 상태" / "영역 승인 상태".
     */
    public static void detailDialog(
            StringBuilder html,
            ApprovalRequest request,
            String statusLabel,
            String dialogTitle,
            java.util.function.UnaryOperator<String> nameResolver,
            boolean myTurn,
            int myStepOrder);

    /** 요청 생성 모달(또는 진행 중 안내). canRequest=false면 아무것도 쓰지 않는다. */
    public static void requestDialog(
            StringBuilder html,
            boolean canRequest,
            boolean alreadyOpen,
            String dialogTitle,
            String lead,
            String submitLabel);
}
```

- `ApprovalPagePanel`은 `ICON_*`, `pill`, `appendDetailDialog`, `appendRequestDialog`, `appendSteps`,
  `appendTimeline`, `progressLabel`, `statusModifier`, `pillModifier`, `iconFor`, `decisionLabel`,
  `eventLabel`, `escape`를 **전부 삭제**하고 `ApprovalMarkup` 호출로 바꾼다.
  `displayName(key, cache)`와 `resolvePage`, `resolveActorKey`, `openPanel`은 패널에 남는다.
  호출 예: `ApprovalMarkup.detailDialog(html, request, settings.statusLabel(request.status().name()),
  "페이지 승인 상태", key -> displayName(key, names), myTurn, myStepOrder);`
- `detailDialog`의 lead에 **마감 표기를 추가**한다(매크로가 갖고 있던 정보를 잃지 않게):
  `request.expiresAt() != null` 이면
  `<span class="dmove-approval-modal__deadline">마감 …</span>`.

### E.3 detail 모달 lead 클래스 개명

`dmove-approval-page-panel__count` / `dmove-approval-page-panel__version` 은 이제 매크로도 쓴다.
이름이 거짓이 되므로 개명한다.

| 기존 | 신규 |
|------|------|
| `.dmove-approval-page-panel__count` | `.dmove-approval-modal__progress` |
| `.dmove-approval-page-panel__version` | `.dmove-approval-modal__version` |
| `.dmove-approval-region__version` | (삭제 — 위로 흡수) |
| `.dmove-approval-region__count` | (삭제) |
| `.dmove-approval-region__deadline` | `.dmove-approval-modal__deadline` |
| `.dmove-approval-region__approvers` | (삭제 — `.dmove-approval-steps` 사용) |
| `.dmove-approval-region__timeline` | (삭제 — `.dmove-approval-timeline` 사용) |

`approval.css` 교체 블록:
```css
.dmove-approval-modal__progress,
.dmove-approval-modal__deadline {
    color: #44546f;
    font-size: 12px;
}

.dmove-approval-modal__version {
    color: #216e4e;
    font-size: 12px;
    font-weight: 600;
}
```
(기존 `.dmove-approval-page-panel__count{…}` 와 `.dmove-approval-page-panel__version,.dmove-approval-region__version{…}` 규칙은 삭제.)

### E.4 `ApprovalRegionMacro.java` 변경

**(a) `UserAccessor` 주입** — 지금은 승인자를 raw key로 노출한다(`appendApprovers`가
`escape(approverKey)`를 그대로 쓴다). 패널과 동일하게 표시 이름을 쓴다.
```java
private final UserAccessor userAccessor;          // 생성자에서 requireComponent(UserAccessor.class)

/** 패널의 displayName과 동일 구현. 캐시는 렌더링 1회 범위(지역 Map). */
private String displayName(String actorKey, Map<String, String> cache) { … }
```

**(b) `renderRequest` 시그니처에 `ApprovalTarget target` 추가 — 잠재 버그 수정**

현재:
```java
return request.map(value -> renderRequest(value, renderedBody, user, canRequest, duplicate, settings))
        .orElseGet(() -> renderEmpty(target, renderedBody, canRequest, duplicate));
```
```java
openRegion(html, request.target(), request.id().toString(), actorKey, request.status().name());
```
`request.target()`의 `contentVersion`은 **요청이 만들어진 시점의 버전**이다. 이걸 그대로
`data-approval-content-version`에 쓰면, 반려/만료 뒤 이 영역에서 재요청할 때 JS가 **낡은 버전**을
서버로 보낸다. 페이지 패널은 항상 `page.getVersion()`을 쓴다.

교체:
```java
return request.map(value -> renderRequest(target, value, renderedBody, user, canRequest, duplicate, settings))
        .orElseGet(() -> renderEmpty(target, renderedBody, canRequest, duplicate));
```
```java
openRegion(html, target, request.id().toString(), actorKey, request.status().name(), canRequest);
```

**(c) `openRegion`에 `data-approval-can-request` 추가** — 패널과 dataset 계약을 맞춘다.
```java
html.append("\" data-approval-can-request=\"").append(canRequest ? "1" : "0").append("\"");
```

**(d) `renderEmpty` 본문 교체**
```java
StringBuilder html = new StringBuilder();
openRegion(html, target, null, null, "NONE", canRequest);
html.append("<header class=\"dmove-approval-region__header\">");
appendRegionKey(html, target.regionKey());
ApprovalMarkup.emptyPill(html, "승인 요청 없음");
appendRequestTrigger(html, canRequest);
html.append("</header>");
appendDuplicateWarning(html, duplicate);
html.append("<span class=\"dmove-approval-message\" role=\"status\"></span>");
appendBody(html, body);
ApprovalMarkup.requestDialog(html, canRequest, false,
        "영역 승인 요청", "이 영역에 대한 승인자를 순서대로 지정합니다.", "영역 승인 요청");
return html.append("</section>").toString();
```

**(e) `renderRequest` 본문 교체**
```java
String actorKey = resolveActorKey(request, user);
boolean decidable = actorKey != null && request.canDecideNow(actorKey);
int myStepOrder = actorKey == null ? 0 : request.stepOrderOf(actorKey);
Map<String, String> names = new HashMap<>();

StringBuilder html = new StringBuilder();
openRegion(html, target, request.id().toString(), actorKey, request.status().name(), canRequest);
html.append("<header class=\"dmove-approval-region__header\">");
appendRegionKey(html, target.regionKey());
ApprovalMarkup.pill(html, request, settings.statusLabel(request.status().name()));
appendRequestTrigger(html, canRequest);
html.append("</header>");
appendDuplicateWarning(html, duplicate);
html.append("<span class=\"dmove-approval-message\" role=\"status\"></span>");
appendBody(html, body);
ApprovalMarkup.detailDialog(html, request, settings.statusLabel(request.status().name()),
        "영역 승인 상태", key -> displayName(key, names), decidable, myStepOrder);
ApprovalMarkup.requestDialog(html, canRequest, request.status() == ApprovalStatus.PENDING,
        "영역 승인 요청", "이 영역에 대한 승인자를 순서대로 지정합니다.", "영역 승인 요청");
return html.append("</section>").toString();
```

**(f) 신규 helper 2개**
```java
private void appendRegionKey(StringBuilder html, String regionKey) {
    html.append("<span class=\"dmove-approval-region__key\">콘텐츠 승인");
    if (regionKey != null && !ApprovalRegionSupport.DEFAULT_KEY.equals(regionKey)) {
        html.append("<code>").append(ApprovalRegionSupport.escape(regionKey)).append("</code>");
    }
    html.append("</span>");
}

private void appendRequestTrigger(StringBuilder html, boolean canRequest) {
    if (!canRequest) {
        return;
    }
    html.append("<button type=\"button\" class=\"aui-button aui-button-link ")
            .append("dmove-approval-request-trigger\">승인 요청</button>");
}
```
> `ApprovalRegionSupport.DEFAULT_KEY`는 package-private `static final`이고 매크로와 같은 패키지라
> 그대로 참조할 수 있다.

**(g) 삭제할 메서드**: `appendHeader`, `appendApprovers`, `appendTimeline`, `appendRequestForm`,
`statusModifier`, `decisionLabel`, `eventLabel`. `appendBody`는 `<span class="dmove-approval-message">`
부분을 떼고 `<div class="dmove-approval-region__body">`만 남긴다(메시지 span은 (d)(e)에서 한 번만 쓴다 —
**컨테이너 안에 `.dmove-approval-message`가 둘이면 `showMessage`가 엉뚱한 쪽에 쓴다**).

**(h) `renderBodyOnly`** — 변경 없음.

### E.5 `approval.css` — 영역 헤더

**교체**
```css
.dmove-approval-region__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid #dcdfe4;
    background: #f7f8f9;
}

.dmove-approval-region__key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #44546f;
}

.dmove-approval-region__key code {
    padding: 1px 6px;
    border-radius: 4px;
    background: #dfe1e6;
    color: #42526e;
    font-size: 11px;
    font-weight: 600;
}

/* pill부터 오른쪽 정렬 */
.dmove-approval-region__header .dmove-approval-pill {
    margin-left: auto;
}

.dmove-approval-region__header .dmove-approval-request-trigger {
    flex: none;
}
```

**삭제**: `.dmove-approval-region__count,.dmove-approval-region__deadline{…}`,
`.dmove-approval-region__approvers,.dmove-approval-region__timeline{…}`,
`.dmove-approval-region__approvers{…}`, `.dmove-approval-region__timeline{…}`,
`.dmove-approval-region__actions,.dmove-approval-region-request{…}`,
`.dmove-approval-region-request input[name="minimumApprovals"]{…}`.

**유지**: `.dmove-approval-region`, `__body`, `__notice`.

### E.6 dataset 계약 확인 (approval.js 관점)

| 계약 | 패널 | 매크로(개편 후) | 사용처 |
|------|------|-----------------|--------|
| `.dmove-approval-page-panel` / `.dmove-approval-region` 컨테이너 | ✔ | ✔ `section` | `approvalContainer()` — 변경 불필요 |
| `data-approval-page-id` | ✔ | ✔ `target.pageId()` | submit URL |
| `data-approval-content-version` | ✔ | ✔ **`target.contentVersion()`**(E.4-b 수정 후 현재 버전) | submit URL |
| `data-approval-region-key` | — | ✔ | `resourceType` 판정 + `regionKey` 파라미터 |
| `data-approval-request-id` | ✔ | ✔ | 승인/반려 URL |
| `data-approval-actor-key` | ✔ | ✔ | 승인/반려 URL |
| `data-approval-status` / `data-approval-can-request` | ✔ | ✔ (can-request 신규) | CSS/디버그 후크 |

**detail pill 분기가 region에서 동작하는 조건** (approval.js 357~366행, 코드 변경 없이 충족)
1. pill이 `[data-approval-detail-open]`을 갖고 있을 것 → `ApprovalMarkup.pill`이 항상 붙인다.
2. pill이 `section.dmove-approval-region`의 **자손**일 것 → 헤더 안에 있으므로 참.
3. detail 모달이 **같은 `section` 안**에 있을 것 → E.4-(e)에서 `</section>` 앞에 넣는다.
4. 승인/반려 버튼이 detail 모달 footer에 있고, 그 모달이 컨테이너 안이므로
   `approvalContainer(button)`이 region을 찾아 `dataset.approvalRequestId/ActorKey`를 읽는다.
   → 기존 승인/반려 경로가 region에서도 그대로 동작한다.

---

## F. 모달 셀렉터 충돌 — 반드시 함께 고칠 것

§E 이후 한 페이지에 `.dmove-approval-modal--request`가 **여러 개** 존재할 수 있다
(페이지 패널 1개 + 영역 매크로 N개). 아래 두 곳이 문서 전역 `querySelector`라 반드시 깨진다.

### F.1 요청 트리거 → 컨테이너 스코프

현재 (`approval.js` 367~375행):
```js
        var trigger = event.target.closest('.dmove-approval-request-trigger, #dmove-approval-request-action');
        if (trigger) {
            var modal = document.querySelector('.dmove-approval-modal--request');
            if (modal) {
                event.preventDefault();
                openModal(modal, trigger);
            }
            return;
        }
```
교체:
```js
        var trigger = event.target.closest('.dmove-approval-request-trigger, #dmove-approval-request-action');
        if (trigger) {
            // 영역 안 트리거는 그 영역의 모달을, 상단 페이지 액션(컨테이너 밖)은 페이지 패널의 모달을 연다.
            var scope = approvalContainer(trigger);
            var modal = scope
                ? scope.querySelector('.dmove-approval-modal--request')
                : document.querySelector('.dmove-approval-page-panel .dmove-approval-modal--request');
            if (modal) {
                event.preventDefault();
                openModal(modal, trigger);
            }
            return;
        }
```

### F.2 `syncTriggerVisibility` → 페이지 패널 스코프

현재:
```js
        item.hidden = document.querySelector('.dmove-approval-modal--request') === null;
```
교체:
```js
        item.hidden = document.querySelector('.dmove-approval-page-panel .dmove-approval-modal--request') === null;
```
> 이 보정이 없으면 "페이지 편집 권한은 없는데 영역 요청 모달만 있는" 경우에도 상단 승인 요청 버튼이
> 노출되고, 눌러도 영역용 모달이 열려 엉뚱한 요청을 만들게 된다.

### F.3 충돌 없음이 확인된 곳 (변경 불필요)

| 코드 | 이유 |
|------|------|
| `detailOpener` 분기 — `approvalContainer(...).querySelector('.--detail')` | 이미 컨테이너 스코프 |
| `closer` 분기 — `closer.closest('.dmove-approval-modal')` | 자기 모달만 닫는다 |
| ESC 핸들러 — `document.querySelector('.dmove-approval-modal:not([hidden]))'` | 동시에 둘이 열리는 경로가 없다 |
| `showMessage` — `closest('.dmove-approval-request, .dmove-approval-modal')` | 이벤트 발생 요소 기준 상향 탐색 |
| `syncSteps/addStep/search/switchTab/switchScope` | 전부 `form.querySelector` |
| `loadAvailableFlows` — `document.querySelectorAll('select[name="flowId"]')` | 모든 select에 옵션을 채우는 게 의도된 동작 |
| `openModal`의 `modal.querySelector('.dmove-approval-request')` | 모달 스코프 |

---

## G. 아이콘 자산 (그대로 붙여넣을 것)

### G.1 CSS mask용 (§B, §C)

**업무함 트레이** — 원본 SVG
```svg
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M3 12.5 5 4.5h10l2 8v4H3z'/><path d='M3 12.5h4l1 2h4l1-2h4'/></svg>
```
data-URI (인코딩: `<`→`%3C`, `>`→`%3E`만. 작은따옴표 속성이라 `#`·`"` 인코딩 불필요)
```
data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12.5 5 4.5h10l2 8v4H3z'/%3E%3Cpath d='M3 12.5h4l1 2h4l1-2h4'/%3E%3C/svg%3E
```

**결재 도장** — 원본 SVG
```svg
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z'/><path d='M5 16.25h10'/></svg>
```
data-URI
```
data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z'/%3E%3Cpath d='M5 16.25h10'/%3E%3C/svg%3E
```
> `mask`는 알파만 쓰므로 `stroke='black'`(불투명)이면 색은 `background-color: currentColor`가 결정한다.
> `-webkit-mask`를 **반드시 함께** 쓴다(구형 Safari/일부 DC 클라이언트 대응).

### G.2 업무함 메뉴 인라인 SVG (§A.4에 이미 삽입되어 있음)

공통 래퍼: `viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`

| 항목 | 도형 | 내용 |
|------|------|------|
| 내 차례 | 도장 | `<path d="M8 3.5h4v3.25l1 3.5h1.5v3H5.5v-3H7l1-3.5z"/><path d="M5 16.25h10"/>` |
| 진행 중 | 시계 | `<circle cx="10" cy="10" r="7"/><path d="M10 5.75V10l2.75 1.75"/>` |
| 내 요청 | 문서+위화살표 | `<path d="M4.75 2.75h6.5l4 4v10.5h-10.5z"/><path d="M11.25 2.75v4h4"/><path d="M10 14.25V9.75m0 0L8.25 11.5M10 9.75l1.75 1.75"/>` |
| 처리한 건 | 체크 원 | `<circle cx="10" cy="10" r="7"/><path d="M6.75 10.25 9 12.5l4.25-4.5"/>` |
| 알림 | 종 | `<path d="M5 13.5h10l-1.5-2.5V8.5a3.5 3.5 0 0 0-7 0V11z"/><path d="M8.5 15.5a1.5 1.5 0 0 0 3 0"/>` |
| 승인 설정 | 슬라이더 | `<path d="M3.75 6.75h12.5M3.75 13.25h12.5"/><circle cx="8" cy="6.75" r="1.9"/><circle cx="12.5" cy="13.25" r="1.9"/>` |

도형이 전부 다르므로 **색 없이도 구분**된다(색맹 대응). 상태 pill(§design-ui-overhaul §1.6)은
채워진 20×20 도형, 메뉴는 선 아이콘 — 두 계층이 시각적으로 섞이지 않는다.

### G.3 순서 조작 버튼 SVG (§D.4-a에 이미 있음)

viewBox 16×16, `fill="currentColor"`, `aria-hidden="true" focusable="false"`.
`focusable="false"`는 IE/구형 Edge에서 SVG가 탭 순서에 끼는 것을 막는다.

---

## H. 접근성 체크리스트

**업무함 메뉴 (§A)**
- [ ] `nav[aria-label="승인 업무함 메뉴"]` — 페이지에 nav가 둘 이상이므로 라벨 필수
- [ ] 활성 항목만 `aria-current="page"`, 비활성은 **속성 제거**(`"false"` 금지)
- [ ] `role="tablist"` / `role="tab"` / `role="tabpanel"` / `aria-selected` **전부 제거** — nav 패턴과 혼용 금지
- [ ] 메뉴 항목 전부 tab 순서에 있다(roving tabindex 없음, §0.3)
- [ ] 배지는 장식이 아니라 실제 텍스트 — 접근 이름이 "내 차례 3"이 된다
- [ ] `#view-list` / `#view-notifications` 는 `aria-labelledby`로 이름을 갖는 region이며, 목록 뷰 전환 시 이름이 갱신된다
- [ ] `#request-count[role="status"]` 가 "내 차례 12건"을 낭독한다 (`render`에서 중복 갱신하지 않는다 — §A.5-c)
- [ ] 뷰 전환 시 포커스를 훔치지 않는다(눌린 메뉴 버튼에 유지)
- [ ] `.wb-nav__item:focus-visible` 아웃라인 2px
- [ ] 아이콘 `<svg aria-hidden="true">`, 라벨 텍스트는 별도 span
- [ ] `#notification-list[aria-live="polite"]` 유지. 패널이 `hidden`인 동안은 접근성 트리에서 빠지므로 백그라운드 로드가 낭독을 유발하지 않는다
- [ ] `h1`은 페이지에 하나(`.app-head h1`), `<main>`을 직접 만들지 않는다(데코레이터 랜드마크와 중복 금지)

**요청 모달 (§D)**
- [ ] `role="dialog" aria-modal="true" aria-label` 유지, backdrop/ESC 닫기 유지
- [ ] **`id`/`for` 0건** — 모든 폼 컨트롤은 감싸는 `<label>`로 연결 (매크로 다중 렌더링 시 중복 id 방지)
- [ ] 시각적 라벨이 없는 검색 input은 스타일 없는 `<label>`로 감싸고, 라벨 텍스트만 `<span class="dmove-approval-sr-only">`에 넣는다 (label에 sr-only 금지 — input까지 클리핑됨)
- [ ] 내부 세그먼트(`.dmove-approval-scope`)에도 `aria-label="승인자 검색 대상"` — 바깥 tablist와 구분
- [ ] 순서 버튼은 아이콘만 있으므로 `aria-label`(“홍길동 순서 올리기”) 필수, 내부 svg는 `aria-hidden`
- [ ] 첫/마지막 항목의 ↑/↓는 `disabled`, **누른 버튼이 disabled가 되면 같은 카드의 다른 버튼으로 포커스 이동**(§D.4-d)
- [ ] `.dmove-approval-selected-steps[aria-live="polite"]`, `.dmove-approval-step-summary[aria-live="polite"]` 유지
- [ ] 그룹/사용자 구분이 아바타 모양(원 vs 라운드 사각) + 메타 텍스트("그룹 · 한 명 승인") 이중으로 표현된다 — 색 단독 금지
- [ ] 검색 결과 0건에 `.dmove-approval-results__empty` 텍스트 노출
- [ ] 푸터 오류 메시지가 버튼을 밀어내지 않는다(`flex-wrap` + `flex:1 1 200px`)

**영역 매크로 (§E)**
- [ ] pill이 `<button aria-haspopup="dialog" aria-expanded>` (요청 있음) / `<span>` (요청 없음)
- [ ] 영역 key `<code>`는 시각 보조일 뿐, 상태 정보를 담지 않는다
- [ ] 컨테이너 안 `.dmove-approval-message`는 **정확히 하나** (`showMessage`가 첫 번째를 잡는다)
- [ ] 중복 key 경고는 모달이 아니라 영역 안에 남는다(즉시 보여야 하는 저작 오류)

**진입점 (§B, §C)**
- [ ] 아이콘은 `::before` 장식이므로 접근 이름에 영향 없음 — label 텍스트가 유일한 이름
- [ ] `mask` 미지원 브라우저에서도 텍스트 라벨만 남고 레이아웃이 깨지지 않는다(빈 16px 박스)
- [ ] `currentColor`를 쓰므로 hover/active/고대비 모드에서 텍스트와 같은 색을 따라간다

**회귀 grep 체크**
- [ ] 서블릿 TEMPLATE에 `role="tab"`, `aria-selected`, `.tabs`, `.tab__badge` 0건
- [ ] `approval.js`에 `document.querySelector('.dmove-approval-modal--request')`(스코프 없는 형태) 0건
- [ ] `approval.css`에 `dmove-approval-region__timeline|__approvers|__count|__actions|region-request` 0건
- [ ] `approval.css`에 `dmove-approval-page-panel__count|__version|__actions|page-request` 0건
- [ ] 서블릿 `<style>`에 `#dmove-approval-app` 없이 시작하는 셀렉터 0건
- [ ] 두 서블릿·Java 문자열에 `"/confluence/"` 0건

---

## I. C10 이식 백로그

`approval-confluence10`은 순차 승인 이전 상태라 이 변경을 따라가지 않는다.
백로그에 아래 한 줄만 기록한다.

> 업무함 2컬럼 사이드 메뉴 · 진입점 아이콘(mask) · 요청 모달 재설계 · region 매크로 pill/모달화
> (+ `ApprovalMarkup` 공용 마크업 추출)
