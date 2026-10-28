# QA 4c — 앱 사이드바 접기 / 스페이스 복귀 동선 / 설정 통합

- 기준 커밋: `2b53754` (미커밋 워킹트리 검증)
- 스펙: `_workspace/spec-4c-dual-sidebar.md` / 설계: `_workspace/design-dual-sidebar.md`
- 검증자: approval-qa (독립 검증). Codex 보고는 참조하지 않고 실제 렌더 출력으로 판정.

## 판정: **PASS** (재작업 없이 커밋 가능)

발견 6건 — 치명 0 / 중 1 / 경 5. 중 1건은 설계 원문을 그대로 구현한 결과이므로
이번 배치의 구현 결함이 아니며, 후속 하드닝 항목으로 분리 제안한다.

---

## 0. 검증 방법 (존재 확인이 아니라 동작 확인)

`target/classes` + 모듈 classpath에 임시 하니스를 붙여 **실제 render 출력 5종**을 파일로 뽑고,
그 산출물을 기계적으로 검사했다. 소스 육안 검사만으로 판정한 항목은 없다.

| 산출물 | 조건 |
|---|---|
| `inbox-nospace.html` | INBOX, admin=true, space=null |
| `inbox-space.html` | INBOX, admin=true, space=`SpaceRef("DEV", "개발 <팀> & \"친구\"")` |
| `inbox-user.html` | INBOX, admin=false, space=null |
| `settings-nospace.html` | SETTINGS, space=null |
| `settings-space.html` | SETTINGS, space=`SpaceRef("~admin", "개인 스페이스")` |

검사기: (a) `<style>` 블록을 중괄호 워킹으로 파싱해 **콤마 조각 단위** 스코프 검사,
(b) 같은 미디어 컨텍스트 안 **중복 셀렉터** 검사, (c) 모든 인라인 `<script>`를 파일로 떼어 `node --check`,
(d) nav 내부 href의 생 `&` 검사, (e) 잔존 토큰 검사.

---

## 1. 파일 범위 / 압축·재포매팅

허용 파일 외 변경 **0건**.

```
M ApprovalInboxServlet.java      (+112/-138 전체 diff 기준)
M ApprovalSettingsServlet.java
M atlassian-plugin.xml
M ApprovalInboxServletRenderTest.java
? NavMarkup.java (신규)
```

압축 감지 결과 — 이상 없음.

| 파일 | 라인 수 | 최장 라인 |
|---|---|---|
| `NavMarkup.java` | 287 | 154자 |
| `ApprovalInboxServlet.java` | 577 | 159자 |
| `ApprovalSettingsServlet.java` | 516 | 170자 |

200자 초과 라인 0건, 한 줄로 합쳐진 statement 0건, 지시 외 문구 변경 0건
(설정 화면 3탭의 `role`/`aria-selected`/`id`/`aria-controls`/`data-view`와 세 `<section class="view">`는 diff상 한 글자도 안 바뀜 — 설계 §6-12 충족).

---

## 2. 설계 1:1 대조

### 2.1 NavMarkup 4토큰 — PASS
`__NAV_CSS__` / `__APP_NAV__` / `__NAV_BOOT__` / `__NAV_SCRIPT__` 4개 모두 두 서블릿 TOKEN 정규식에 등재되고
값 맵에 채워진다. 5개 산출물 전부 **잔존 `__TOKEN__` 0건**.
`ADMIN_LINK` 토큰과 인박스의 `ICON_SETTINGS` 상수는 실제로 **삭제**됨(잔존 죽은 코드 없음).
두 서블릿 `escape()`는 `return NavMarkup.escape(value);` 한 줄 위임 — 호출부 무변경.

### 2.2 Mode.INBOX / Mode.SETTINGS 분기 — PASS

렌더된 nav 실측:

| 항목 | INBOX | SETTINGS |
|---|---|---|
| 업무함 4항목 | `<button type='button' data-view=X data-tab=X>` + `<span class='wb-nav__badge'>` | `<a href='…?view=X&amp;spaceKey=…'>` , 배지 없음 |
| 알림 | `<button data-view='notifications'>` + `badge[data-badge=notifications]` (data-tab 없음) | `<a href='…?view=notifications&amp;…'>` |
| 승인 설정 | `<a href='…/approval-settings{?spaceKey}'>` | `<span class='wb-nav__item is-current' aria-current='page'>` (자기 링크 아님, `href="#"` 아님) |
| `aria-current='page'` 개수 | 1 (myturn) | 1 (승인 설정) |
| nav 내 `data-view` 개수 | 5 | **0** |
| nav 내 `data-tab` 개수 | 4 | 0 |

`admin=false` → `approval-settings` 문자열이 출력에 아예 없음(href 목록 `[]`).

### 2.3 스페이스 복귀 그룹 — PASS
`space != null`일 때만 nav 최상단(토글 바 바로 뒤)에 `<h2>스페이스</h2>` + 2항목.
`space == null`이면 `wb-nav__item--back` 문자열 자체가 출력에 없음.

URL 조립 규칙(완성 후 통째 escape, 값은 조립 전 urlEncode) 실측:

```
/confluence/display/%7Eadmin
/confluence/collector/pages.action?key=%7Eadmin
/confluence/plugins/servlet/approval-inbox?view=myturn&amp;spaceKey=%7Eadmin
```
- `&` → `&amp;` 로 나감 (생 `&` 0건, 정규식 검사 통과)
- `~` → `%7E` (설계 §2.1 예상대로)
- 스페이스명 `개발 <팀> & "친구"` → `개발 &lt;팀&gt; &amp; &quot;친구&quot;` (원문 `<팀>` 출력 0건)

### 2.4 rail 접힘 CSS — PASS
`@media (min-width:1025px)` 게이트 1개, 그 안에 `.is-nav-collapsed` 규칙 9종(그리드 56px, rail padding,
토글 회전 180deg, title/label sr-only 클리핑, 배지 7px 점, is-zero display:none) 전부 설계와 동일.
`.workbench`의 `transition:grid-template-columns …,gap …` 존재.
`@media (max-width:1024px)` 가로 스트립 블록은 NavMarkup으로 이관되어 두 화면이 공유
(인박스 원본 위치에서 실제 삭제 확인).
`@media (prefers-reduced-motion:reduce){… * …}` 규칙이 두 화면 모두 `__NAV_CSS__` **뒤**에 위치 → 접힘 transition까지 커버(설계 §4.1 메모 준수).

---

## 3. 보안 — spaceKey (중점 2)

### 3.1 요청 파라미터 직접 출력 경로 — **0건 (PASS)**

- 저장소 전체에서 `getParameter("spaceKey")` 호출부는 **1곳**: `ApprovalInboxServlet:80` (`resolveSpace`).
- 그 지역변수 `raw`의 전체 사용처는 3줄뿐 — null/빈/길이(≤255) 검사, `spaceManager.getSpace(raw)`.
  출력 경로로 흘러가지 않는다.
- `new NavMarkup.SpaceRef(...)` 생성부도 **1곳**: `ApprovalInboxServlet:92`,
  인자는 `space.getKey()` / `space.getName()` (DB 값)뿐.
- `ApprovalSettingsServlet`은 `ApprovalInboxServlet.resolveSpace`를 재사용(같은 패키지) — 독자 파싱 경로 없음.
- 미해석 Velocity 리터럴(`$htmlUtil.urlEncode($helper.spaceKey)`)이 그대로 실려와도 `getSpace()`가 null → 폴백.

### 3.2 web-item 인코딩 — PASS
```xml
<link linkId="dmove-approval-inbox-sidebar-link">/plugins/servlet/approval-inbox?spaceKey=$htmlUtil.urlEncode($helper.spaceKey)</link>
```
`$generalUtil.urlEncode` 사용 0건. `system.navigation` 전역 헤더 web-item은 그대로(spaceKey 없음).
`approval-settings`용 web-item 미추가. 설계 §5와 동일. XML well-formed 확인, 필터링된
`target/classes/atlassian-plugin.xml`에도 표현식이 원형 그대로 실림(`${}` 필터와 충돌 없음).

### 3.3 발견 — [중] PermissionManager null 시 VIEW 검사 fail-open

`ApprovalInboxServlet:89`
```java
if (space == null || (pm != null && !pm.hasPermission(user, Permission.VIEW, space))) {
```
`pm == null`이면 **VIEW 검사를 건너뛰고 스페이스 이름이 렌더된다**(설계 §0.8의 "권한 없으면 이름 유출" 시나리오와 정확히 같은 결과).
- 설정 화면은 영향 없음 — `pm == null`이면 render 전에 403.
- 업무함만 노출면. `ComponentLocator.getComponent(PermissionManager.class)`가 null인 상황은
  플러그인 전반이 이미 망가진 상태라 실현 가능성은 낮다.
- **설계 원문 §2.2(b)의 코드를 그대로 옮긴 것**이므로 Codex 구현 결함이 아니다. 설계 쪽 fail-open이다.

권장 수정(1줄, 후속 배치 가능):
```java
if (space == null || pm == null || !pm.hasPermission(user, Permission.VIEW, space)) {
```

---

## 4. 설계 "주의 함정" 2건 (중점 3)

### 4.1 (a) 토글 버튼이 설정 화면 일반 button 규칙에 안 덮이는지 — PASS

- 설정 화면 `#dmove-approval-app button{…}` 특이도 (1,0,1)
- `#dmove-approval-app .wb-nav__toggle{…}` 특이도 (1,1,0) → 승리 (선언 순서와 무관)
- 토글이 `border:0` / `background:transparent` / `padding:0` **3속성을 모두 명시** (NavMarkup.css 75–77행)
  + `border-radius:6px` / `color` / `font:inherit`까지 명시 → 잔존 상속 없음
- hover도 `#dmove-approval-app .wb-nav__toggle:hover` (1,2,0) > `#dmove-approval-app button:hover` (1,1,1) → 승리
- `.subnav__btn` 동일 구조로 (1,1,0) > (1,0,1), `border:0;background:transparent;padding:6px 14px;border-radius:6px` 명시
- `#dmove-approval-app .results button{…}` (1,1,1)은 `.results` 하위에만 적용 → nav 토글과 무관

SETTINGS 모드 nav 항목은 `<a>`/`<span>`이라 `button` 규칙 자체가 매칭되지 않는다(2중 안전).

### 4.2 (b) SETTINGS 모드 data-view 미출력 — PASS

- 렌더 실측: settings 페이지 nav 내부 `data-view` **0개** (space 유/무 양쪽).
- 설정 JS 셀렉터는 `.subnav__btn` / `.view` 두 개뿐. nav 마크업이 쓰는 클래스는
  `wb-nav`, `wb-nav__bar`, `wb-nav__toggle`, `wb-nav__title`, `wb-nav__group(--aux)`,
  `wb-nav__item(--back)`, `wb-nav__icon`, `wb-nav__label`, `wb-nav__badge`, `is-current`
  — `subnav__btn`도 `view`도 없다. 교차 매칭 0.
- 역방향도 확인: 인박스 JS의 `.wb-nav__item[data-view]` / `.wb-nav__item[data-tab]`은
  설정 페이지의 `.subnav__btn`(클래스 불일치)을 잡지 않는다.

---

## 5. FOUC 부트 스크립트 (중점 4) — PASS

```html
<script>(function(){try{if(localStorage.getItem("dmove-approval-nav-collapsed")=="1"){document.currentScript.parentNode.classList.add("is-nav-collapsed");}}catch(e){}})();</script>
```
- 삽입 위치: 두 화면 모두 여는 `<div id="dmove-approval-app" …>` **직후 같은 줄**.
  IIFE가 동기 실행되므로 `document.currentScript`는 자기 자신, `parentNode`는 정확히 루트 div. 파서 블로킹 → 첫 페인트 전 클래스 부착.
- localStorage 키 `dmove-approval-nav-collapsed` — boot과 `script()`의 `KEY` 상수가 동일 문자열(페이지당 2회 등장 확인).
- `localStorage` 접근과 `currentScript` 역참조가 **둘 다 try 안** → 샌드박스/iframe/쿠키차단 및 currentScript null 모두 무해.
- 게이트 `@media (min-width:1025px)` 1개. ≤1024px에서는 클래스가 붙어도 규칙이 없고 `.wb-nav__bar{display:none}`으로 토글이 탭 순서에서도 빠진다.

경미 발견 — 설계는 `==="1"`, 구현은 `=="1"`. `getItem`은 `string|null`이라 동작 동일(`null == "1"` → false). 기능 영향 없음.

---

## 6. 접힘 a11y (중점 5) — PASS

| # | 항목 | 결과 |
|---|---|---|
| 1 | `<nav id='dmove-approval-nav' aria-label='승인 앱 메뉴'>` 1개, 설정 3탭은 `div role=tablist` | OK |
| 2 | `aria-current='page'` 정확히 1개 (양 모드, space 유/무 4조합 전부) | OK |
| 3 | 설정 화면 "승인 설정"은 `<span>` (자기 링크 없음) | OK |
| 4 | 뷰 전환=button / 화면 이동=`<a href>` | OK |
| 5 | 토글 `aria-expanded` + `aria-controls='dmove-approval-nav'` + `aria-label`, SVG `aria-hidden='true'` | OK, `sync()`가 클릭·초기 1회 동기화 |
| 6 | 접힘 시 항목 `title = label.textContent`, 펴면 `removeAttribute` | OK (`sync()`) |
| 7 | 접힘 시 label/title은 `display:none`이 아니라 sr-only 클리핑 | OK |
| 8 | 접힘 배지 `font-size:0`, 텍스트 노드 유지 | OK |
| 11 | `.wb-nav__item:focus-visible` / `.wb-nav__toggle:focus-visible` / `.subnav__btn:focus-visible` 3종 모두 존재 | OK |
| 13 | 복귀 링크 접근명 = 스페이스 **이름**, 아이콘 `aria-hidden` | OK |
| 14 | reduced-motion `*` 규칙이 `__NAV_CSS__` 뒤 | OK |
| 16 | 신규 `<label>` 없음, `<label>` 자체 sr-only 0건 | OK |

`sync()`는 `title`만 만지고 클래스는 안 만진다 — 상태 단일 출처(CSS) 유지 확인.

---

## 7. 이전 배치 회귀 (중점 6) — PASS

| 항목 | 결과 |
|---|---|
| 4탭 → 사이드 메뉴 동작 (`TABS`/`activate`) | `navItems = .wb-nav__item[data-view]` 5개 매칭, `activate()`가 비활성 항목 `aria-current` 제거. `show()`는 `TABS[tab] \|\| TABS.myturn` 폴백 유지 |
| `syncNavBadges` | `.wb-nav__item[data-tab]` 4개. 알림은 data-tab 없음 → `renderNotifications`가 전담(설계대로 분리) |
| `?view=` 딥링크 | `TABS` 선언 뒤·`syncNavBadges` 앞에 삽입. `hasOwnProperty.call`로 prototype 오염 차단, `notifications` 별도 허용. 잘못된 값이면 `myturn` 유지 |
| `requested` 딥링크 프리로드 | 초기 fetch 체인에 `async` + 조건부 `/mine/requested` 삽입, `.catch(() => activate(currentView))` 유지 |
| DUE_SOON 렌더링 | `notificationLabel`/`notificationDetail`/`feed--due`/`deadlineCell` diff 무변경 |
| `__CONTEXT_PATH__` 토큰 | 두 화면 `data-context-path` 정상 치환, 하드코딩 컨텍스트 패스 잔존 0 |
| 서블릿 `<style>` 스코프 (콤마 조각) | **0건** — 5개 산출물 전부 |
| `prefers-color-scheme` | **0건** |
| 같은 셀렉터 중복 정의 | **0건** (미디어 컨텍스트별 집계) |
| 인라인 JS `node --check` | 5개 산출물 × 3 스크립트 = **15/15 통과** (부트 / 페이지 IIFE / `__NAV_SCRIPT__`) |
| escape 규칙 | `&<>"'` 5종 유지, NavMarkup 1곳으로 통합 후 두 서블릿 위임 |

---

## 8. 빌드 (중점 7) — PASS

toolchain: `C:\Onpremise\.toolchains\apache-maven-3.9.16` + JDK 21.0.12.8 (scripts/build.ps1 기준)

```
mvn -B -pl approval-confluence9 -am test
  approval-domain      : Tests run 44, Failures 0, Errors 0, Skipped 0
  approval-confluence9 : Tests run 48, Failures 0, Errors 0, Skipped 0
    └ ApprovalInboxServletRenderTest : Tests run 6, Failures 0   ← 실제 실행 확인
  BUILD SUCCESS

mvn -B -pl approval-confluence9 -am package -DskipTests
  approval-confluence9-0.1.0-SNAPSHOT.jar / .obr 생성
  BUILD SUCCESS
```
C9 인스턴스 잠금 이슈 없이 패키징까지 확인. `clean verify`(bytecode major/descriptor assert)는 미실행 —
이번 배치는 어댑터 클래스·descriptor 버전 범위를 건드리지 않으므로 위험 없음.

---

## 9. 발견 목록

| # | 심각도 | 항목 | 조치 |
|---|---|---|---|
| F1 | 중 | `resolveSpace`의 `pm != null &&` 로 인한 VIEW 검사 fail-open (§3.3). 설계 원문 그대로라 4c 구현 결함은 아님 | 후속 1줄 수정 권장 |
| F2 | 경 | `#dmove-approval-app .sr-only{…}` 는 두 화면 어디서도 쓰이지 않는 **죽은 CSS** (매크로는 별도 클래스 `dmove-approval-sr-only` 사용, 별도 스타일시트). 설계 §4.1이 명시한 블록이라 지시 이행 결과 | 삭제 또는 설계 문서에서 제거 |
| F3 | 경 | `NavMarkup.css()`가 설계 §4.1의 섹션 주석 4개를 누락(`/* 스페이스 복귀 … */`, `/* ── 접힘(rail) … */`, `/* ── 좁아지면 … */`, `/* 배지는 사라지지 않고 점이 된다 … */`), `접근성 유틸` → `접근성 유틸리티` | 가독성만 영향. 다음 손댈 때 복원 |
| F4 | 경 | `boot()`이 `==="1"` 대신 `=="1"` | 동작 동일. 다음 손댈 때 정정 |
| F5 | 경 | RenderTest는 시그니처 적응만 반영. 설계 §7의 권장 5케이스(스페이스명 이스케이프, href의 `&amp;`, space=null 시 `--back` 부재, `admin=false`, 설정 `aria-current` 1회) 미추가. NavMarkupTest도 없음 — 스펙 필수 항목은 아니지만 **이번 QA가 손으로 검증한 불변식이 CI에 남지 않는다** | 다음 배치에서 `NavMarkupTest` 추가 권장 |
| F6 | 경 | `?view=notifications`/`?view=waiting` 딥링크 시, `/mine` fetch가 끝나야 `activate()`가 불려 서버 렌더된 `myturn` 활성 표시·목록 패널이 잠깐 보인다(로드 후 자동 교정) | 체감 미미. 필요 시 딥링크 IIFE 직후 `activate(currentView)` 선행 호출 |

**재작업 지시: 없음.** F1만 후속 하드닝 배치로 올리고, F2~F6은 다음에 같은 파일을 열 때 함께 정리하면 된다.
