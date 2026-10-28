# 스페이스 사이드바 공존 · 앱 사이드바 접기 · 설정 화면 통합 (배치 4c)

대상 모듈: `approval-confluence9`. 구현: Codex. 이 문서는 스펙이며 클래스명·셀렉터·토큰명·URL을 **그대로** 쓴다.
직전 설계 `_workspace/design-inbox-sidebar.md` §A(배치 4a, 구현 완료)의 원칙을 승계한다:

- 서블릿 `<style>` 안 모든 셀렉터는 예외 없이 `#dmove-approval-app` 스코프. 콤마 조각마다 접두사를 붙인다.
- vanilla JS + AUI만. 이벤트 위임 유지. React/외부 CDN 없음.
- 서블릿 TEMPLATE는 Java text block + `__TOKEN__` 치환. 동적 문자열은 전부 escape.
- `<label>` 자체에 sr-only 금지 (clip이 input까지 먹는다). 라벨 텍스트만 `<span class="sr-only">`.

관련 파일

- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/NavMarkup.java` ← **신규**
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServlet.java`
- `approval-confluence9/src/main/java/kr/dmove/confluence/approval/c9/servlet/ApprovalSettingsServlet.java`
- `approval-confluence9/src/main/resources/atlassian-plugin.xml`
- `approval-confluence9/src/test/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServletRenderTest.java`

---

## 0. 결정 로그

| # | 결정 | 근거 |
|---|------|------|
| 0.1 | **스페이스 사이드바 공존은 포기한다.** `<meta name="decorator" content="main">` + `<meta name="spacekey">`는 no-op | §1 검증. 사이드바 게이트가 XWork 액션 밸류스택(`$theme`, `$spaceKey`)에 걸려 있고, meta 프로퍼티를 읽는 코드가 번들 데코레이터에 아예 없다. |
| 0.2 | 대신 **앱 사이드바 최상단에 "스페이스" 그룹**을 둔다: `← {스페이스명}`(스페이스 홈) + `페이지 목록` | 사용자의 실제 통증은 "돌아가기가 번거롭다"이다. 복귀 1클릭 + 스페이스 페이지 목록 1클릭이면 통증이 사라진다. 두 URL 모두 Confluence 자체 space-ia 플러그인이 쓰는 검증된 경로(§1.F)라 내부 API 의존이 없다. |
| 0.3 | 접힘 상태는 **rail(아이콘만 56px)**, 완전 숨김+플로팅 토글이 아니다 | 플로팅 토글은 `position:fixed`가 필요한데 데코레이터 하위에서 Confluence 크롬(헤더·스페이스 사이드바 splitter)과 z-index/좌표를 다툰다 — 스킬의 "크롬과 싸우지 않는다" 규칙 위반. rail은 문서 흐름에 남아 그리드 컬럼이 안정적이고, **접어도 "내 차례" 배지 점이 보인다**(접는 주 목적은 표 폭 확보이지 알림 포기가 아니다). |
| 0.4 | 접기 기능은 **≥1025px에서만 존재**한다 | ≤1024px에서는 §A.5(배치 4a)에 따라 사이드바가 이미 가로 스트립으로 변한다. 가로 스트립에 rail 개념이 없다. 모든 접힘 규칙을 `@media (min-width:1025px)`로 감싸고 토글 버튼을 숨긴다. |
| 0.5 | 사이드바 마크업은 **`NavMarkup` Java 헬퍼**가 만들고 두 서블릿에 `__APP_NAV__`/`__NAV_CSS__`/`__NAV_BOOT__`/`__NAV_SCRIPT__` 4개 토큰으로 주입 | TEMPLATE가 text block이라 include가 없다. 토큰 치환은 이미 두 서블릿에 있는 메커니즘이고, 한 번의 정규식 순회라 주입값 안의 `__…__`가 재치환되지 않는다(`ApprovalInboxServlet.java:24-27` 주석). CSS까지 토큰으로 빼야 두 화면의 사이드바가 드리프트하지 않는다. |
| 0.6 | NavMarkup은 **모드 2개**(`INBOX`/`SETTINGS`)를 갖는다. 업무함 항목이 업무함 화면에서는 `<button data-view>`, 설정 화면에서는 `<a href=…?view=…>` | 같은 화면 안 뷰 전환과 다른 화면으로의 이동은 다른 요소여야 한다. 링크를 버튼으로 위장하면 새 탭 열기·중간클릭·상태표시줄이 죽는다. |
| 0.7 | 설정 화면의 내부 3탭은 **`role="tablist"` ARIA를 유지**하고 시각만 세그먼트 컨트롤로 강등 | §0.1(배치 4a)에서 업무함 탭을 폐기한 이유는 "탭 안에 알림·설정 같은 이종 항목이 섞여서"였다. 설정 3탭(승인/Flow/그룹)은 **한 설정 페이지의 세 면**이고 이동이 아니다 — tablist가 정확하다. 이미 `aria-controls`/`aria-labelledby`까지 올바르게 붙어 있으므로 ARIA는 손대지 않고 클래스만 `.tab` → `.subnav__btn`으로 바꿔 사이드바의 pill 언어와 경쟁하지 않게 한다. |
| 0.8 | `spaceKey`는 요청 파라미터를 **절대 그대로 출력하지 않는다**. `SpaceManager.getSpace()`로 조회해 실재하는 `Space`를 얻고, VIEW 권한까지 확인한 뒤 **`space.getKey()`/`space.getName()`(DB 값)만** 링크와 라벨에 쓴다 | 이러면 인젝션 표면이 원천적으로 0이 된다(escape는 이중 안전장치). 권한 확인이 없으면 못 보는 스페이스의 **이름이 유출**된다 — 존재하지 않거나 권한 없으면 스페이스 그룹 없이 폴백. |

---

## 1. A의 기술 검증 결과 — **불가능**

검증 대상: `C:\Onpremise\confluence-approval-dc\approval-confluence9\target\confluence\webapp\`
(= `…\target\container\tomcat9x\cargo-confluence-home\webapps\confluence\` 와 바이트 동일. 아래 라인 번호는 두 사본 공통)

### 1.A `atl.space` 데코레이터는 없고, `main` == `atl.general`

`…\target\confluence\webapp\WEB-INF\decorators.xml`

```
 67:    <decorator name="main" page="main.vmd">
142:    <decorator name="page" page="page.vmd"/>
144:    <decorator name="space" page="space.vmd"/>
155:    <decorator name="atl.general" page="main.vmd"/>
156:    <decorator name="atl.admin" page="admin.vmd"/>
```

**`atl.general`과 `main`이 같은 `main.vmd`를 가리킨다.** 즉 `content="main"`으로 바꾸는 것 자체가 무의미하며,
현재 두 서블릿(`ApprovalInboxServlet.java:93`, `ApprovalSettingsServlet.java:56`)의
`<meta name="decorator" content="atl.general">`와 100% 동일한 출력이 나온다.

meta 기반 데코레이터 선택이 동작하는 근거 — `…\WEB-INF\sitemesh.xml:23-26`

```xml
<mapper class="com.opensymphony.module.sitemesh.mapper.PageDecoratorMapper">
    <param name="property.1" value="meta.decorator" />
    <param name="property.2" value="decorator" />
</mapper>
```

### 1.B 사이드바 게이트는 2단이고 둘 다 XWork 밸류스택에 걸려 있다

`…\target\confluence\webapp\decorators\main.vmd`

```
23:    ## hasSpaceSideBar() indicates whether or not the theme supports rendering of the sidebar, not whether or not the
24:    ## sidebar is present on the current page. Sidebar is only present when there is a valid spaceKey
25:    #set($useNewSpaceIA = $theme.hasSpaceSideBar() && $spaceKey)
37:    #if ($useNewSpaceIA)
38:        #requireResource("com.atlassian.confluence.plugins.confluence-space-ia:spacesidebar")
39:    #end
41:    #parse("/decorators/includes/header.vm")
77:    #elseif ($useNewSpaceIA && ($decoratorUtil.hasSidebarContext() || $sitemeshPage.getProperty("page.ia-sidebar")))
79:        <div class="ia-splitter">
80:            <div class="ia-splitter-left">
81:                <div class="ia-fixed-sidebar" role="complementary" aria-label=$i18n.getText('nav.main.sidebar')>
82:                    #if($sitemeshPage.getProperty("page.ia-sidebar"))
83:                        $!sitemeshPage.getProperty("page.ia-sidebar")
84:                    #elseif($decoratorUtil.hasSidebarContext())
85:                        #foreach ($webPanel in $webInterfaceManager.getDisplayableWebPanels("atl.page.left.sidebar", …
```

`$spaceKey` · `$space` · `$theme`는 전역 Velocity 변수가 아니다 —
`…\target\confluence\webapp\WEB-INF\classes\velocity_implicit.vm`(2~67행 전역 변수 선언 목록)에 셋 다 **없다**.
전역인 것은 `decoratorUtil`(17행), `spaceManager`(52행), `request`(49행) 등뿐. 셋은 XWork 액션 밸류스택 산물이고,
플러그인 서블릿(`/plugins/servlet/…`)은 XWork FilterDispatcher를 타지 않아 밸류스택 자체가 없다.
Velocity는 조용히 null을 돌려주므로 `$useNewSpaceIA` = false로 고정된다.

### 1.C `<meta name="spacekey">`를 읽는 코드는 존재하지 않는다

데코레이터가 읽는 유일한 스페이스 키 소스 — `…\target\confluence\webapp\decorators\includes\header.vm`

```
 3:#set ($spaceKey = $!sitemeshPage.getProperty("page.spacekey"))
20:#if ($spaceKey)
21:<meta id="confluence-space-key" name="confluence-space-key" content="$htmlUtil.htmlEncode($spaceKey)">
73:## CONF-28933: spaceKey needs to be added to the context for SpaceSidebarCondition
75:#set($dummyResult = $extendedContext.put("spacekey", $spaceKey))
```

`page.spacekey`를 채우는 것은 meta가 아니라 **`<content tag="spacekey">`** 다:

- `…\decorators\space.vmd:150` → `<content tag="spacekey">#unencoded($helper.spaceKey)</content>`
- `…\decorators\panels\spacetoolspanel.vmd:87` / `spaceadminpanel.vmd:31` → `<content tag="spacekey">$space.key</content>`

webapp 전체에서 `getProperty("meta.` 는 2건뿐이고 spacekey는 없다 —
`…\template\includes\macros.vm:384`(`meta.help-path`), `:397`(`meta.infopanel-width`).

→ stock `HTMLPageParser`(`sitemesh.xml:11`) 기준 `<meta name="spacekey" content="KEY">`는 프로퍼티 `meta.spacekey`로만
들어가고, **이를 읽는 코드가 번들 데코레이터에 없다. no-op이다.**

### 1.D `<content tag="spacekey">`로 우회해도 안 된다 — 순서가 막는다

`main.vmd:25`의 `$spaceKey` 평가는 `header.vm`이 `#parse`되는 **41행보다 먼저**다.
서블릿이 `<content tag="spacekey">KEY</content>`를 올바르게 내보내도 `page.spacekey`는 41행에서야 `$spaceKey`가 되고,
`$useNewSpaceIA`는 이미 25행에서 false로 굳는다. 37~39행의 `#requireResource(…spacesidebar)`도 같은 이유로 못 산다.
게다가 `$theme`(밸류스택)가 없으면 25행 조건은 어차피 통과 불가.

두 번째 게이트 `$decoratorUtil.hasSidebarContext()`는 `DecoratorUtil.setSidebarContext($action.space, …)`로만 채워지는
request-scoped 상태이고, 호출처는 `space.vmd:39` / `page.vmd:49` / `blogpost.vmd:42` 세 데코레이터뿐이다.
서블릿이 HTML 출력으로 호출할 수 없다.

### 1.E 사이드바 본체는 soy이고 `Space` 객체를 요구한다

`…\WEB-INF\atlassian-bundled-plugins\com.atlassian.confluence.plugins.confluence-space-ia-19.2.61.jar` → `atlassian-plugin.xml`

```xml
<web-panel key="left-ia-sidebar-panel" location="atl.page.left.sidebar">
  <resource name="view" type="soy" location="…:soy-resources/Confluence.Templates.Sidebar.sidebar"/>
  <context-provider class="com.atlassian.confluence.plugins.ia.ui.DefaultSoySidebarContextProvider"/>
</web-panel>
```

`DefaultSoySidebarContextProvider` 상수풀에 `com/atlassian/confluence/spaces/Space`, `…/Spaced`,
`com/atlassian/confluence/pages/Page`, `currentPage`, `collector-key`, `page-tree-state` — 문자열 spaceKey로는 부족하고
**`Space` 객체 + 페이지 트리 상태**가 필요하다. 1.D 결론을 재확인.

### 1.F 검토했으나 채택하지 않은 대안

| 대안 | 비용/위험 | 판정 |
|---|---|---|
| 서블릿을 `<xwork>` 액션으로 전환 + `<meta name="decorator" content="space">`(`decorators.xml:144`) | URL(`/plugins/servlet/approval-inbox`) 폐기, 액션이 `Spaced` 구현 필요 → **업무함은 전 스페이스 횡단 뷰인데 스페이스 스코프를 강제**하게 된다. 전역 헤더 진입(`system.navigation`)에서는 spaceKey가 없어 아예 열리지 않는다 | 기각 |
| `atl.page.left.sidebar` 웹패널을 서블릿이 직접 조립 + `ia-splitter` 마크업 재현(`main.vmd:79-89`) | `Space` 객체·`SidebarContext`·soy 컨텍스트를 손으로 재현. 전부 내부 API, 마이너 업그레이드마다 깨진다 | 기각 |
| `<content tag="spacekey">`만 내보내 `<meta id="confluence-space-key">`와 스페이스 스코프 스타일시트(`header.vm:94`)를 채우기 | 사이드바는 안 나옴. 얻는 것은 `AJS.Meta`의 space-key뿐인데 우리는 안 쓴다. 반대로 **스페이스 커스텀 스타일시트가 우리 화면에 주입되는 리스크**만 생긴다 | 기각 |

**최종 결론: 불가능.** §0.2의 대안(앱 사이드바 내 "스페이스" 그룹)으로 간다.

### 1.G 부수 검증 — web-item link에서 spaceKey를 얻는 정확한 표현식

Confluence 자체 space-ia 플러그인이 **같은 섹션**에서 쓰는 정본
(`…\atlassian-bundled-plugins\com.atlassian.confluence.plugins.confluence-space-ia-19.2.61.jar` → `atlassian-plugin.xml`):

```xml
<web-section key="main-links" name="Main Links" location="system.space.sidebar" weight="100"/>

<web-item key="spacebar-pages" name="Pages" section="system.space.sidebar/main-links" weight="10">
  <link id="spacebar-pages-link">/collector/pages.action?key=$htmlUtil.urlEncode($helper.spaceKey)</link>
</web-item>
<web-item key="spacebar-blogs" … weight="20">
  <link id="spacebar-blog-link">/pages/viewrecentblogposts.action?key=$htmlUtil.urlEncode($helper.spaceKey)</link>
</web-item>
```

- `$helper`는 `com.atlassian.confluence.themes.ThemeHelper`다 —
  `ConfluenceWebFragmentHelper.getContext(Map)` 바이트코드가 request attribute `view.page.action.helper`를
  `checkcast com/atlassian/confluence/themes/ThemeHelper` 한 뒤 `"helper"` 키로 넣는다(없으면 `action.getHelper()` 폴백).
  런타임 구현은 `GlobalHelper`/`PageHelper`이고 `getSpaceKey()` / `getSpaceName()` / `getSpace()`를 갖는다.
  → 저장소의 `$helper.page.id`(`atlassian-plugin.xml:58`)가 동작하는 이유도 이 구현 폴백이다.
- 인코딩은 **`$htmlUtil.urlEncode(...)`**. `$generalUtil.urlEncode`는 **존재하지 않는다**
  (`javap com.atlassian.confluence.util.GeneralUtil` → urlEncode 계열 없음). 번들 어디에도 사용 예 없음.
- `$spacekey`(소문자 컨텍스트 키)는 `DefaultWebInterfaceContext.setSpace()`가 채우지 않으므로 쓰지 않는다.
- 미해석 시 Velocity는 참조를 **문자열 그대로** 남긴다. 서블릿은 그 쓰레기 값을 받아도 §0.8 조회에서 걸러 폴백해야 한다.

---

## 2. 서블릿별 마크업/토큰 변경 명세

### 2.1 신규 `NavMarkup` (servlet 패키지)

```java
package kr.dmove.confluence.approval.c9.servlet;

/**
 * 업무함과 설정 화면이 공유하는 앱 사이드바를 만든다.
 * 두 서블릿의 TEMPLATE는 text block이라 include가 없으므로 마크업·CSS·스크립트를 토큰으로 주입한다.
 * 이 클래스가 유일한 출처이며, 서블릿 쪽에 사이드바 마크업을 복사하지 않는다.
 */
public final class NavMarkup {

    /** 서블릿이 검증을 끝낸 스페이스. key/name은 반드시 DB 값(Space#getKey/#getName)이어야 한다. */
    public record SpaceRef(String key, String name) {}

    public enum Mode { INBOX, SETTINGS }

    public static String css()                                   { … }  // __NAV_CSS__
    public static String boot()                                  { … }  // __NAV_BOOT__
    public static String script()                                { … }  // __NAV_SCRIPT__
    public static String nav(Mode mode, String contextPath, SpaceRef space, boolean admin) { … } // __APP_NAV__

    static String escape(String v) { …기존 서블릿 escape와 동일 본문… }
    private static String urlEncode(String v) { return URLEncoder.encode(v, StandardCharsets.UTF_8); }

    private NavMarkup() {}
}
```

두 서블릿의 `private static String escape`는 **본문을 `return NavMarkup.escape(v);` 한 줄로 위임**한다
(호출부를 건드리지 않으면서 escape 규칙을 한 곳에 둔다).

#### `nav(...)`가 만드는 구조

```
nav.wb-nav#dmove-approval-nav[aria-label="승인 앱 메뉴"]

  div.wb-nav__bar                                        ← 토글 줄. 항상 첫 요소
    button.wb-nav__toggle[type=button][aria-expanded=true]
        [aria-controls=dmove-approval-nav][title=메뉴 접기][aria-label=메뉴 접기]
      svg (chevrons-left, 16px, aria-hidden)

  ── space != null 일 때만 ────────────────────────────
  h2.wb-nav__title  "스페이스"
  ul.wb-nav__group
    li > a.wb-nav__item.wb-nav__item--back[href={ctx}/display/{urlEncode(space.key)}]
           span.wb-nav__icon  (arrow-left svg)
           span.wb-nav__label {space.name}
    li > a.wb-nav__item[href={ctx}/collector/pages.action?key={urlEncode(space.key)}]
           span.wb-nav__icon  (pages svg)
           span.wb-nav__label "페이지 목록"
  ── ─────────────────────────────────────────────────

  h2.wb-nav__title  "업무함"
  ul.wb-nav__group
    ×4 : myturn / waiting / requested / done
      Mode.INBOX    → li > button.wb-nav__item[type=button][data-view=X][data-tab=X]
                            span.wb-nav__icon (svg) span.wb-nav__label span.wb-nav__badge
                            (myturn 만 class에 is-current 추가 + aria-current=page)
      Mode.SETTINGS → li > a.wb-nav__item[href={inboxHref}?view=X{&spaceKey=…}]
                            span.wb-nav__icon (svg) span.wb-nav__label      ← 배지 없음

  h2.wb-nav__title  "알림과 설정"
  ul.wb-nav__group.wb-nav__group--aux
    li 알림
      Mode.INBOX    → button.wb-nav__item[data-view=notifications] … span.wb-nav__badge[data-badge=notifications]
      Mode.SETTINGS → a.wb-nav__item[href={inboxHref}?view=notifications{&spaceKey=…}]
    li 승인 설정        ← admin 일 때만
      Mode.INBOX    → a.wb-nav__item[href={ctx}/plugins/servlet/approval-settings{?spaceKey=…}]
      Mode.SETTINGS → span.wb-nav__item.is-current[aria-current=page]
                      ← 자기 자신으로 가는 링크를 만들지 않는다. `<a href="#">`도 금지
```

아이콘 SVG는 배치 4a에서 확정된 것을 그대로 재사용한다
(`ApprovalInboxServlet.java:277,280,283,286,293`의 5개 + `ICON_SETTINGS`(`:31-35`)).
NavMarkup으로 옮기고 서블릿의 `ICON_SETTINGS` 상수는 **삭제**한다. 신규 SVG 3개(§2.2)만 추가.

- `<button>`은 항상 `type="button"`(설정 화면 폼 안에 들어갈 일은 없지만 규칙 유지).
- 속성은 작은따옴표로 쓴다(Java escape 지옥 회피, HTML5 유효). `escape()`가 `'`를 `&#39;`로 바꾸므로 주입 불가.
- **URL 조립 규칙**: 완성된 URL 문자열을 만든 뒤 **통째로 `escape()`** 한다. 그래야 `?view=myturn&spaceKey=DEV`의
  `&`가 `&amp;`로 나가 HTML 속성에서 유효하다. 값은 조립 전에 `urlEncode()`.
  ```java
  String q = space == null ? "" : "&spaceKey=" + urlEncode(space.key());
  String href = escape(ctx + "/plugins/servlet/approval-inbox?view=" + view + q);
  ```
  `urlEncode`가 공백을 `+`로 바꾸지만 스페이스 키는 영숫자(+개인 스페이스 `~`)뿐이라 안전하다. `~`는 `%7E`가 되며 정상 동작.

#### 신규 아이콘 3종 (NavMarkup 상수)

```java
private static final String ICON_COLLAPSE =
        "<svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' "
                + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"
                + "<path d='M11.5 6 7.5 10l4 4'/><path d='M15 6l-4 4 4 4'/></svg>";
private static final String ICON_BACK =
        "<svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' "
                + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"
                + "<path d='M16 10H4.5'/><path d='M9 4.75 3.75 10 9 15.25'/></svg>";
private static final String ICON_PAGES =
        "<svg viewBox='0 0 20 20' width='16' height='16' fill='none' stroke='currentColor' "
                + "stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>"
                + "<path d='M6.75 2.75h5l3.5 3.5v11h-8.5z'/><path d='M11.75 2.75v3.5h3.5'/>"
                + "<path d='M4.25 5.25v12h8'/></svg>";
```

### 2.2 `ApprovalInboxServlet` 변경

#### (a) TOKEN 정규식 (현재 `:28-29`)

```java
private static final Pattern TOKEN =
        Pattern.compile("__(ACTOR_KEY|CONTEXT_PATH|DISPLAY_NAME|ADMIN_LINK|STATUS_LABELS)__");
```
교체:
```java
private static final Pattern TOKEN = Pattern.compile(
        "__(ACTOR_KEY|CONTEXT_PATH|DISPLAY_NAME|NAV_CSS|APP_NAV|NAV_BOOT|NAV_SCRIPT|STATUS_LABELS)__");
```
`ADMIN_LINK` 토큰과 `ICON_SETTINGS` 상수(`:31-35`)는 **삭제** — NavMarkup이 대체.

#### (b) `doGet` — 스페이스 해석 추가 (현재 `:37-55`)

```java
@Override
protected void doGet(HttpServletRequest req, HttpServletResponse resp)
        throws ServletException, IOException {
    ConfluenceUser u = AuthenticatedUserThreadLocal.get();
    if (u == null) {
        resp.sendError(401);
        return;
    }
    String key = u.getKey() == null ? u.getName() : u.getKey().getStringValue();
    PermissionManager pm = ComponentLocator.getComponent(PermissionManager.class);
    ApprovalSettings.Values settings = ApprovalSettings.fromComponentLocator().read();
    resp.setContentType("text/html; charset=UTF-8");
    resp.getWriter().write(render(
            key,
            u.getFullName(),
            pm != null && pm.isConfluenceAdministrator(u),
            settings.statusLabels(),
            req.getContextPath(),
            resolveSpace(req, u, pm)));
}

/**
 * spaceKey 파라미터를 Space로 해석한다. 없거나·존재하지 않거나·볼 권한이 없으면 null(폴백).
 * 반환하는 key/name은 반드시 DB 값이다 — 요청 파라미터 문자열은 어떤 경로로도 화면에 나가지 않는다.
 * web-item Velocity가 미해석되면 "$htmlUtil.urlEncode(...)" 같은 쓰레기가 들어올 수 있는데, 그 역시 여기서 걸러진다.
 */
static NavMarkup.SpaceRef resolveSpace(HttpServletRequest req, ConfluenceUser user, PermissionManager pm) {
    String raw = req.getParameter("spaceKey");
    if (raw == null || raw.isEmpty() || raw.length() > 255) {
        return null;
    }
    SpaceManager spaceManager = ComponentLocator.getComponent(SpaceManager.class);
    if (spaceManager == null) {
        return null;
    }
    Space space = spaceManager.getSpace(raw);
    if (space == null || (pm != null && !pm.hasPermission(user, Permission.VIEW, space))) {
        return null;
    }
    return new NavMarkup.SpaceRef(space.getKey(), space.getName());
}
```
추가 import: `com.atlassian.confluence.spaces.Space`, `…spaces.SpaceManager`,
`com.atlassian.confluence.security.Permission`.

#### (c) `render(...)` (현재 `:57-80`)

시그니처에 `NavMarkup.SpaceRef space`를 **마지막 인자로** 추가하고 값 맵을 교체:

```java
static String render(String key, String name, boolean admin,
        Map<String, String> statusLabels, String contextPath, NavMarkup.SpaceRef space) {
    Map<String, String> values = new LinkedHashMap<>();
    String ctx = contextPath == null ? "" : contextPath;
    values.put("ACTOR_KEY", escape(key));
    values.put("CONTEXT_PATH", escape(ctx));
    values.put("DISPLAY_NAME", escape(name));
    values.put("NAV_CSS", NavMarkup.css());
    values.put("APP_NAV", NavMarkup.nav(NavMarkup.Mode.INBOX, ctx, space, admin));
    values.put("NAV_BOOT", NavMarkup.boot());
    values.put("NAV_SCRIPT", NavMarkup.script());
    values.put("STATUS_LABELS", ApprovalJson.escapeForScript(ApprovalJson.write(statusLabels)));
    … 이하 Matcher 루프 그대로 …
}
```
`ADMIN_LINK` put은 삭제.

#### (d) TEMPLATE — CSS 영역

- **삭제**: `:114-142` (`/* ── 2컬럼 작업대 … */` ~ `.wb-nav__badge--alert{…}`) 전체 → `__NAV_CSS__` 로 교체.
  삽입 위치는 현재 `:112` `.table-wrap` 규칙 **바로 뒤**(동일 위치).
- **변경**: `:163`
  ```css
  #dmove-approval-app .wb-nav__item:focus-visible,#dmove-approval-app .ghost:focus-visible,#dmove-approval-app .ghost-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  ```
  → nav 조각은 NavMarkup.css가 소유하므로 페이지 것만 남긴다:
  ```css
  #dmove-approval-app .ghost:focus-visible,#dmove-approval-app .ghost-link:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  ```
- **삭제**: `:242-253` `@media (max-width:1024px){…}` 블록 전체 → NavMarkup.css가 소유(설정 화면도 동일 반응형이 필요).
- 나머지(`:233-239` 애니메이션 포함)는 그대로.

#### (e) TEMPLATE — 본문

`:266` 여는 div 직후에 boot 스크립트, `:273-297` `<nav …>…</nav>` 전체를 `__APP_NAV__` 로 교체:

```html
<body><div id="dmove-approval-app" class="dmove-approval-app" data-actor-key="__ACTOR_KEY__" data-context-path="__CONTEXT_PATH__">__NAV_BOOT__
  <header class="app-head">
    <h1>__DISPLAY_NAME__님의 승인 업무함</h1>
    <p class="lede">내 차례인 결재와 내가 올린 요청을 한 곳에서 확인합니다.</p>
  </header>

  <div class="workbench">
__APP_NAV__

    <div class="wb-main">
      …(:300-327 그대로)…
    </div>
  </div>
</div>
```

`</script>` 직전(현재 `:617` `})();` 다음 줄)에 `__NAV_SCRIPT__` 를 넣지 **않는다** — 별도 `<script>`로 분리한다:

```html
</script>
<script>__NAV_SCRIPT__</script>
</body></html>
```
> 기존 IIFE 안에 넣으면 설정 화면과 코드가 갈라진다. 독립 IIFE로 두면 두 화면이 같은 문자열을 쓴다.

### 2.3 `ApprovalSettingsServlet` 변경

#### (a) TOKEN / render 시그니처

```java
private static final Pattern TOKEN =
        Pattern.compile("__(CONTEXT_PATH|NAV_CSS|APP_NAV|NAV_BOOT|NAV_SCRIPT)__");
```

```java
@Override
protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
    ConfluenceUser user = AuthenticatedUserThreadLocal.get();
    PermissionManager permissionManager = ComponentLocator.getComponent(PermissionManager.class);
    if (user == null || permissionManager == null || !permissionManager.isConfluenceAdministrator(user)) {
        response.sendError(HttpServletResponse.SC_FORBIDDEN);
        return;
    }
    response.setContentType("text/html; charset=UTF-8");
    response.getWriter().write(render(
            request.getContextPath(),
            ApprovalInboxServlet.resolveSpace(request, user, permissionManager)));
}

static String render(String contextPath, NavMarkup.SpaceRef space) {
    Map<String, String> values = new LinkedHashMap<>();
    String ctx = contextPath == null ? "" : contextPath;
    values.put("CONTEXT_PATH", escape(ctx));
    values.put("NAV_CSS", NavMarkup.css());
    // 설정 화면에 도달한 사용자는 이미 Confluence 관리자다 → admin=true 고정
    values.put("APP_NAV", NavMarkup.nav(NavMarkup.Mode.SETTINGS, ctx, space, true));
    values.put("NAV_BOOT", NavMarkup.boot());
    values.put("NAV_SCRIPT", NavMarkup.script());
    … Matcher 루프 그대로 …
}
```
`resolveSpace`는 `ApprovalInboxServlet`의 package-private static을 재사용한다(같은 패키지).

#### (b) TEMPLATE — CSS

- `:58-67` 토큰 블록에 2줄 추가(NavMarkup.css의 `--pending` 참조를 채운다):
  ```css
    --pending:#a86400; --pending-bg:#fdf3e0;
  ```
- `:71` `.app-head .lede` 규칙 **바로 뒤**에 `__NAV_CSS__` 삽입.
- **삭제**: `:72` `#dmove-approval-app .app-head__actions{…}` (업무함 링크가 사이드바로 이동).
- **변경**: `:73`
  ```css
  #dmove-approval-app .tab:focus-visible,#dmove-approval-app button:focus-visible,#dmove-approval-app input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  ```
  →
  ```css
  #dmove-approval-app button:focus-visible,#dmove-approval-app input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  ```
- **교체**: `:75-80` (`/* 메뉴 */` ~ `.tab[aria-selected=true]`) → 세그먼트 컨트롤(§4.4).
- **추가**: `:137` 애니메이션 규칙을
  ```css
  #dmove-approval-app .panel,#dmove-approval-app .wb-nav{animation:dmove-rise .4s cubic-bezier(.2,.7,.3,1) both}
  ```
  로 교체.

> **함정**: 이 파일 `:100-102`의 `#dmove-approval-app button{border:1px solid var(--rule);background:var(--paper);padding:8px 14px}`
> 는 특이도 (1,0,1)이고 `.wb-nav__toggle`/`.wb-nav__item` 규칙은 (1,1,0)이라 우리 쪽이 이긴다. 다만
> **`border`/`background`/`padding`을 NavMarkup.css가 명시적으로 선언해야** 한다(현재 `.wb-nav__item`은 이미
> `border:0;background:transparent;padding:7px 10px`을 선언 — 유지). `.wb-nav__toggle`도 동일하게 3속성을 반드시 명시.

#### (c) TEMPLATE — 본문

`:140-153` 를 교체하고 `:155-240`의 세 `<section class="view">`를 `.wb-main`으로 감싼다:

```html
</style></head><body><div id="dmove-approval-app" class="dmove-approval-app" data-context-path="__CONTEXT_PATH__">__NAV_BOOT__
  <header class="app-head">
    <h1>승인 설정</h1>
    <p class="lede">전역 정책, 반복 사용할 승인 Flow, 결재선에 올릴 승인 그룹을 관리합니다.</p>
  </header>

  <div class="workbench">
__APP_NAV__

    <div class="wb-main">
      <div class="subnav" role="tablist" aria-label="승인 설정 영역">
        <button type="button" class="subnav__btn" data-view="approval" role="tab" aria-selected="true"  id="view-tab-approval" aria-controls="view-approval">승인 설정</button>
        <button type="button" class="subnav__btn" data-view="flow"     role="tab" aria-selected="false" id="view-tab-flow"     aria-controls="view-flow">Flow 설정</button>
        <button type="button" class="subnav__btn" data-view="group"    role="tab" aria-selected="false" id="view-tab-group"    aria-controls="view-group">그룹 설정</button>
      </div>

      …(:155-240 세 section 그대로, 들여쓰기만 조정)…
    </div>
  </div>
</div>
```

- `<div class="app-head__actions">`(`:144-146`)와 그 안의 업무함 링크는 **삭제**.
- `<nav class="menu" role="tablist">` → `<div class="subnav" role="tablist" aria-label="승인 설정 영역">`.
  `nav` 랜드마크를 뗀다 — 앱 사이드바가 이미 `nav`이고, 이건 페이지 내 탭이지 내비게이션이 아니다.
- `class="tab"` → `class="subnav__btn"`, `type="button"` 명시(폼 밖이지만 규칙 유지).
- `role/aria-selected/id/aria-controls/data-view`와 세 `<section class="view" …>`는 **한 글자도 바꾸지 않는다**.

`</script>` 직전(`:501` `})();` 다음)에 §2.2(e)와 동일하게 별도 스크립트 태그로 `__NAV_SCRIPT__` 추가.

---

## 3. 인라인 JS 변경 명세

### 3.1 `NavMarkup.boot()` — FOUC 방지 (두 화면 공통)

여는 `<div id="dmove-approval-app">` **직후**에 인라인 동기 스크립트로 놓는다. 이 시점에 루트 요소는 이미 파싱되어 있고
자식은 아직이므로 `document.currentScript.parentNode`가 정확히 루트다. 파서 블로킹이라 첫 페인트 전에 클래스가 붙는다.

```html
<script>(function(){try{if(localStorage.getItem("dmove-approval-nav-collapsed")==="1"){document.currentScript.parentNode.classList.add("is-nav-collapsed");}}catch(e){}})();</script>
```

> `localStorage` 접근은 반드시 try/catch — Confluence를 iframe/샌드박스나 쿠키 차단 환경에서 열면 접근 자체가 throw한다.
> 이 시점에는 토글 버튼이 아직 파싱되지 않아 `aria-expanded`를 못 고친다. §3.2의 `sync()`가 초기 1회 호출로 맞춘다
> (같은 문서 안의 동기 스크립트이므로 보조기술이 잘못된 값을 읽을 창은 실질적으로 없다).

### 3.2 `NavMarkup.script()` — 접기 토글 (두 화면 공통, 독립 IIFE)

```js
(function () {
  var root = document.getElementById("dmove-approval-app");
  if (!root) { return; }
  var nav = document.getElementById("dmove-approval-nav");
  var toggle = nav && nav.querySelector(".wb-nav__toggle");
  if (!toggle) { return; }
  var KEY = "dmove-approval-nav-collapsed";

  function sync() {
    var collapsed = root.classList.contains("is-nav-collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    var text = collapsed ? "메뉴 펼치기" : "메뉴 접기";
    toggle.setAttribute("aria-label", text);
    toggle.title = text;
    // 접힌 rail에서는 라벨이 보이지 않는다. 마우스 사용자를 위한 툴팁을 붙이고, 펴면 중복이므로 뗀다.
    Array.prototype.forEach.call(nav.querySelectorAll(".wb-nav__item"), function (item) {
      var label = item.querySelector(".wb-nav__label");
      if (!label) { return; }
      if (collapsed) { item.setAttribute("title", label.textContent); }
      else { item.removeAttribute("title"); }
    });
  }

  toggle.addEventListener("click", function () {
    var collapsed = root.classList.toggle("is-nav-collapsed");
    try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch (e) {}
    sync();
  });

  sync();
})();
```

- 이벤트 위임을 쓰지 않는 유일한 예외다. 사이드바는 서버가 한 번 렌더링하고 다시 갈리지 않는 정적 마크업이며
  (패널/매크로처럼 통째로 교체되지 않는다), `nav` 밖 클릭까지 document 리스너로 받을 이유가 없다.
- `sync()`는 `title` 속성만 만지고 클래스는 만지지 않는다 — CSS가 상태의 단일 출처다.
- 토글이 숨겨지는 ≤1024px에서도 스크립트는 무해하게 동작한다(클릭이 발생하지 않음).

### 3.3 업무함 인라인 JS — `?view=` 딥링크 수용

설정 화면의 업무함 링크가 `?view=waiting` 같은 형태로 오므로 초기 뷰를 URL에서 읽는다.
`TABS` 선언(`ApprovalInboxServlet.java:549-554`) **뒤**, `syncNavBadges` 정의 **앞**에 삽입:

```js
  // 설정 화면 사이드바가 ?view=…로 넘어온다. prototype 오염을 피해 hasOwnProperty로만 판정한다.
  (function () {
    var q = null;
    try { q = new URLSearchParams(location.search).get("view"); } catch (_) {}
    if (q === "notifications" || (q && Object.prototype.hasOwnProperty.call(TABS, q))) {
      currentView = q;
    }
  })();
```

`currentView`는 이미 `:347`에서 `let`으로 선언되어 있고, 초기 로드(`:613`, `:615`)가 `activate(currentView)`를 부르므로
**그 외 변경은 없다.** `requested` 뷰로 딥링크된 경우 `requestedLoaded`가 false라 목록이 비는데,
이는 클릭 경로와 동일하게 처리한다 — `activate` 직전에 프리로드를 넣지 않고, 아래 한 줄만 `activate` 안에 추가한다:

```js
  function activate(view) {
    currentView = view;
    …기존 그대로…
  }
```
→ 변경 없음. 대신 초기 fetch 체인(`:608-615`)을 교체:

```js
  fetch(base + "/mine?actorKey=" + encodeURIComponent(actor), {credentials: "same-origin"})
    .then((r) => (r.ok ? r.json() : []))
    .then(async (r) => {
      all = r;
      metrics();
      if (currentView === "requested" && !requestedLoaded) {
        try {
          requested = await (await fetch(base + "/mine/requested", {credentials: "same-origin"})).json();
        } catch (_) { requested = []; }
        requestedLoaded = true;
      }
      activate(currentView);
    })
    .catch(() => activate(currentView));
```

### 3.4 설정 화면 인라인 JS — 셀렉터 1곳

현재 (`ApprovalSettingsServlet.java:254-259`):
```js
  root.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      root.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === tab)));
      root.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== tab.dataset.view; });
    };
  });
```
교체 — `.tab` → `.subnav__btn` 만 바꾼다:
```js
  root.querySelectorAll(".subnav__btn").forEach((tab) => {
    tab.onclick = () => {
      root.querySelectorAll(".subnav__btn").forEach((x) => x.setAttribute("aria-selected", String(x === tab)));
      root.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== tab.dataset.view; });
    };
  });
```
> `.wb-nav__item`은 `.subnav__btn`이 아니고 사이드바 링크에는 `data-view`도 없으므로(§2.1 SETTINGS 모드)
> 두 셀렉터가 서로를 잡지 않는다. **NavMarkup의 SETTINGS 모드는 `data-view` 속성을 절대 출력하지 않는다** — 계약.

---

## 4. CSS

전부 `#dmove-approval-app` 스코프. 콤마로 이어진 셀렉터는 조각마다 접두사를 붙인다.

### 4.1 `NavMarkup.css()` 전문 (두 화면 공통, 토큰 `__NAV_CSS__`)

```css
/* ── 접근성 유틸 ─────────────────────────────────────────── */
#dmove-approval-app .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;
  overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}

/* ── 2컬럼 작업대 ─────────────────────────────────────────── */
#dmove-approval-app .workbench{display:grid;grid-template-columns:216px minmax(0,1fr);gap:28px;align-items:start;
  transition:grid-template-columns .18s cubic-bezier(.2,.7,.3,1),gap .18s cubic-bezier(.2,.7,.3,1)}
#dmove-approval-app .wb-main{min-width:0}

/* ── 앱 사이드바 ─────────────────────────────────────────── */
#dmove-approval-app .wb-nav{position:sticky;top:16px;padding:0 20px 4px 0;border-right:1px solid var(--rule);min-width:0}
#dmove-approval-app .wb-nav__bar{display:flex;justify-content:flex-end;margin:0 0 10px}
#dmove-approval-app .wb-nav__toggle{display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--muted);
  font:inherit;cursor:pointer;transition:background .15s,color .15s}
#dmove-approval-app .wb-nav__toggle:hover{background:var(--sunk);color:var(--ink)}
#dmove-approval-app .wb-nav__toggle svg{transition:transform .18s cubic-bezier(.2,.7,.3,1)}

#dmove-approval-app .wb-nav__title{margin:0 0 8px;padding:0 10px;font:600 10.5px/1.6 var(--mono);
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
#dmove-approval-app .wb-nav__group{list-style:none;margin:0;padding:0}
#dmove-approval-app .wb-nav__group--aux{margin-bottom:0}
#dmove-approval-app .wb-nav__group + .wb-nav__title{margin-top:18px;padding-top:16px;border-top:1px solid var(--rule)}
#dmove-approval-app .wb-nav li{margin:0}

#dmove-approval-app .wb-nav__item{position:relative;display:flex;align-items:center;gap:9px;width:100%;
  border:0;background:transparent;font:inherit;font-size:13.5px;color:var(--ink-soft);text-align:left;text-decoration:none;
  padding:7px 10px;border-radius:6px;cursor:pointer;transition:background .15s,color .15s}
#dmove-approval-app .wb-nav__item:hover{background:var(--sunk);color:var(--ink)}
#dmove-approval-app .wb-nav__item[aria-current=page]{background:var(--accent-soft);color:var(--accent);font-weight:700;cursor:default}
#dmove-approval-app .wb-nav__icon{display:inline-flex;flex:none;color:var(--muted)}
#dmove-approval-app .wb-nav__item:hover .wb-nav__icon{color:var(--ink-soft)}
#dmove-approval-app .wb-nav__item[aria-current=page] .wb-nav__icon{color:var(--accent)}
#dmove-approval-app .wb-nav__label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* 스페이스 복귀 — 나가는 링크라 다른 무게를 준다 */
#dmove-approval-app .wb-nav__item--back{font-weight:600;color:var(--ink)}
#dmove-approval-app .wb-nav__item--back .wb-nav__icon{color:var(--ink-soft)}
#dmove-approval-app .wb-nav__item--back:hover{background:var(--accent-soft);color:var(--accent)}
#dmove-approval-app .wb-nav__item--back:hover .wb-nav__icon{color:var(--accent)}

#dmove-approval-app .wb-nav__badge{flex:none;min-width:1.6em;padding:1px 6px;border-radius:9px;
  background:var(--sunk);border:1px solid var(--rule);
  font:600 11px/1.5 var(--mono);color:var(--muted);text-align:center;font-variant-numeric:tabular-nums}
#dmove-approval-app .wb-nav__item[aria-current=page] .wb-nav__badge{background:var(--paper);border-color:var(--accent);color:var(--accent)}
#dmove-approval-app .wb-nav__badge.is-zero{opacity:.45}
#dmove-approval-app .wb-nav__badge.is-zero:empty{display:none}
#dmove-approval-app .wb-nav__badge--alert{background:var(--pending-bg);border-color:var(--pending);color:var(--pending)}

#dmove-approval-app .wb-nav__item:focus-visible,#dmove-approval-app .wb-nav__toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* ── 접힘(rail) — 넓은 화면에서만 존재한다 ─────────────────── */
@media (min-width:1025px){
  #dmove-approval-app.is-nav-collapsed .workbench{grid-template-columns:56px minmax(0,1fr);gap:20px}
  #dmove-approval-app.is-nav-collapsed .wb-nav{padding:0 8px 4px 0}
  #dmove-approval-app.is-nav-collapsed .wb-nav__bar{justify-content:center}
  #dmove-approval-app.is-nav-collapsed .wb-nav__toggle svg{transform:rotate(180deg)}
  #dmove-approval-app.is-nav-collapsed .wb-nav__title{position:absolute;width:1px;height:1px;margin:-1px;padding:0;
    overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
  #dmove-approval-app.is-nav-collapsed .wb-nav__group + .wb-nav__title + .wb-nav__group{margin-top:10px;padding-top:10px;border-top:1px solid var(--rule)}
  #dmove-approval-app.is-nav-collapsed .wb-nav__item{justify-content:center;gap:0;padding:8px 0}
  #dmove-approval-app.is-nav-collapsed .wb-nav__label{position:absolute;width:1px;height:1px;margin:-1px;padding:0;
    overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
  /* 배지는 사라지지 않고 점이 된다. 텍스트는 남아 스크린리더가 개수를 읽는다. */
  #dmove-approval-app.is-nav-collapsed .wb-nav__badge{position:absolute;top:4px;right:6px;
    min-width:0;width:7px;height:7px;padding:0;border-radius:50%;
    font-size:0;line-height:0;overflow:hidden;background:var(--muted);border-color:var(--muted)}
  #dmove-approval-app.is-nav-collapsed .wb-nav__item[aria-current=page] .wb-nav__badge{background:var(--accent);border-color:var(--accent)}
  #dmove-approval-app.is-nav-collapsed .wb-nav__badge--alert{background:var(--pending);border-color:var(--pending)}
  #dmove-approval-app.is-nav-collapsed .wb-nav__badge.is-zero{display:none}
}

/* ── 좁아지면 사이드바가 상단 가로 스크롤 스트립이 된다 ────── */
@media (max-width:1024px){
  #dmove-approval-app .workbench{grid-template-columns:1fr;gap:16px}
  #dmove-approval-app .wb-nav{position:static;display:flex;align-items:center;gap:12px;
    padding:0 0 2px;border-right:0;border-bottom:1px solid var(--rule);
    overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
  #dmove-approval-app .wb-nav__bar{display:none}
  #dmove-approval-app .wb-nav__title{display:none}
  #dmove-approval-app .wb-nav__group{display:flex;gap:2px;flex:none}
  #dmove-approval-app .wb-nav__group--aux{padding-left:12px;border-left:1px solid var(--rule)}
  #dmove-approval-app .wb-nav__item{width:auto;white-space:nowrap;border-radius:6px 6px 0 0;padding:8px 12px}
  #dmove-approval-app .wb-nav__item[aria-current=page]{box-shadow:inset 0 -2px 0 var(--accent)}
  #dmove-approval-app .wb-nav__label{overflow:visible}
}
```

메모

- 접힘 애니메이션은 `.workbench`의 `grid-template-columns` transition **하나**뿐이다. 트랙 개수가 같고 첫 트랙만
  216px↔56px이라 보간된다(Chromium/Firefox). 미지원 브라우저에서는 스냅되는데, 기능은 그대로다.
- `prefers-reduced-motion`은 두 서블릿에 이미 있는
  `@media (prefers-reduced-motion:reduce){#dmove-approval-app *{animation:none!important;transition:none!important}}`
  가 `*`로 잡으므로 **추가 규칙이 필요 없다**. 이 규칙이 `__NAV_CSS__`보다 **뒤에** 오도록 삽입 위치를 지킬 것
  (인보스 `:239`, 설정 `:138` — 둘 다 `__NAV_CSS__` 삽입 지점보다 아래다. OK).
- `.wb-nav__title`/`.wb-nav__label`의 sr-only 본문을 인라인으로 반복한 이유: 접힘 상태는 CSS만으로 전환되어야 하고
  JS가 클래스를 붙이지 않기 때문이다(`.sr-only` 유틸을 붙였다 뗐다 하면 상태 출처가 둘이 된다).
- 접힘 상태에서 `.wb-nav__group + .wb-nav__title + .wb-nav__group`에 구분선을 옮긴 이유: 제목이 sr-only가 되면
  제목에 달린 `border-top`이 0높이 요소에 그려져 사라진다.

### 4.2 업무함 CSS에서 삭제할 것

| 삭제 대상 (`ApprovalInboxServlet.java` 현재 라인) | 이유 |
|---|---|
| `:114-142` 2컬럼 + `.wb-nav*` 전체 | `__NAV_CSS__`로 이관 |
| `:163`의 `#dmove-approval-app .wb-nav__item:focus-visible,` 조각 | 같음 (`.ghost`/`.ghost-link` 조각만 남긴다) |
| `:242-253` `@media (max-width:1024px)` 블록 | 같음 |

### 4.3 설정 CSS에서 삭제/추가할 것

| 대상 (`ApprovalSettingsServlet.java` 현재 라인) | 처리 |
|---|---|
| `:72` `.app-head__actions` | 삭제 |
| `:73`의 `.tab:focus-visible,` 조각 | 삭제 (나머지 조각 유지) |
| `:75-80` `/* 메뉴 */` `.menu` `.tab` `.tab:hover` `.tab[aria-selected=true]` | §4.4로 교체 |
| `:58-67` 토큰 블록 | `--pending`/`--pending-bg` 2개 추가 |
| `:71` 뒤 | `__NAV_CSS__` 삽입 |
| `:137` | `#dmove-approval-app .panel,#dmove-approval-app .wb-nav{animation:…}` 로 교체 |

### 4.4 설정 화면 세그먼트 컨트롤 (`.subnav`)

```css
/* 페이지 내부 탭 — 앱 사이드바(pill)와 언어가 겹치지 않게 침하 트랙 위 세그먼트로 */
#dmove-approval-app .subnav{display:inline-flex;gap:2px;padding:3px;margin:0 0 20px;
  background:var(--sunk);border:1px solid var(--rule);border-radius:8px;max-width:100%;overflow-x:auto;scrollbar-width:thin}
#dmove-approval-app .subnav__btn{border:0;background:transparent;font:inherit;font-size:12.5px;font-weight:600;
  color:var(--muted);padding:6px 14px;border-radius:6px;white-space:nowrap;cursor:pointer;
  transition:background .15s,color .15s,box-shadow .15s}
#dmove-approval-app .subnav__btn:hover{color:var(--ink)}
#dmove-approval-app .subnav__btn[aria-selected=true]{background:var(--paper);color:var(--ink);
  box-shadow:0 1px 2px rgba(27,39,51,.08)}
#dmove-approval-app .subnav__btn:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
#dmove-approval-app .view[hidden]{display:none}
```

- 앱 사이드바의 활성 항목은 **accent 채움 pill**, 페이지 내 세그먼트는 **무채색 흰 칩**. 색으로 위계가 갈린다
  (1차 = 파랑, 2차 = 중성). accent 밑줄 탭을 그대로 두면 사이드바 pill과 같은 강도로 경쟁한다.
- `:81`의 `.view[hidden]{display:none}` 규칙은 위 블록에 흡수했으므로 원래 자리에서 삭제(중복 방지).
- `.subnav__btn`은 `#dmove-approval-app button`(`:100`)보다 특이도가 높아 일반 버튼 스타일을 확실히 덮는다.

---

## 5. `atlassian-plugin.xml` 변경

```diff
     <web-item key="approval-inbox-sidebar-link" name="Approval Inbox Sidebar Link"
               section="system.space.sidebar/main-links" weight="1000">
         <label>승인 업무함</label>
-        <link linkId="dmove-approval-inbox-sidebar-link">/plugins/servlet/approval-inbox</link>
+        <!--
+            스페이스에서 진입할 때만 스페이스 컨텍스트를 넘긴다. 서블릿은 SpaceManager 조회 + VIEW 권한 확인에
+            성공할 때만 사이드바에 "스페이스" 그룹을 그리고, 실패하면 전역 모드로 폴백한다.
+            $helper.spaceKey / $htmlUtil.urlEncode 는 Confluence 자체 space-ia 플러그인이 같은 섹션에서 쓰는 표현식이다.
+        -->
+        <link linkId="dmove-approval-inbox-sidebar-link">/plugins/servlet/approval-inbox?spaceKey=$htmlUtil.urlEncode($helper.spaceKey)</link>
         <styleClass>dmove-approval-inbox-sidebar-link</styleClass>
     </web-item>
```

그 외 변경 없음.

- `system.navigation`(전역 헤더, `:35-38`)은 **그대로 둔다** — 전역 진입에는 스페이스 컨텍스트가 없다.
- `approval-settings` 서블릿용 web-item은 추가하지 않는다. 설정은 앱 사이드바로만 들어간다(관리자에게만 보임).
- `$helper.spaceKey`가 미해석되어 URL에 리터럴이 실려도 §2.2(b)의 `resolveSpace`가 null을 돌려 폴백한다.
  **배포 후 검증 지시**: 스페이스 사이드바의 "승인 업무함" 링크 href를 DevTools로 확인해 `?spaceKey=DEV` 형태인지 보고,
  아니면 실제 렌더 결과를 이 문서에 추가 보고할 것 (차선책은 `$space.key` — analytics 번들 플러그인 용례, 단 미인코딩).

---

## 6. 접근성 체크리스트

| # | 항목 | 확인 방법 |
|---|---|---|
| 1 | 앱 사이드바는 `<nav aria-label="승인 앱 메뉴">`. 페이지 내 세그먼트는 `nav`가 아니다(`div role=tablist`) | 랜드마크 목록에 nav가 하나만 |
| 2 | 현재 항목은 `aria-current="page"` **하나만**. 비활성 항목은 속성 자체를 제거(`"false"`로 남기지 않음) | 업무함: 활성 뷰 1개 / 설정: "승인 설정" 1개 |
| 3 | 설정 화면의 "승인 설정" 항목은 **링크가 아니라 `<span class="wb-nav__item is-current" aria-current="page">`** | 자기 자신으로 가는 링크 금지 |
| 4 | 업무함 항목: 같은 화면 뷰 전환 = `<button type="button">`, 다른 화면 이동 = `<a href>` | 설정 화면에서 중간클릭/새 탭이 동작 |
| 5 | 토글: `aria-expanded`(true/false) + `aria-controls="dmove-approval-nav"` + `aria-label`을 JS가 상태와 동기화. SVG는 `aria-hidden="true"` | 접었다 펴며 AT 낭독 확인 |
| 6 | 접힌 rail에서 각 항목에 `title` 부여, 펴면 제거(툴팁 중복 방지). `title`은 라벨 텍스트와 동일 | §3.2 `sync()` |
| 7 | 접힌 rail에서 라벨/그룹 제목은 **`display:none`이 아니라 sr-only 클리핑** — 접근성 트리에 남는다 | 접힌 상태로 스크린리더 탐색 시 "내 차례" 낭독 |
| 8 | 접힌 배지는 `font-size:0`으로 시각만 점이 되고 텍스트 노드는 남는다 | 접힌 상태에서 "내 차례 3"이 읽혀야 함 |
| 9 | 초기 접힘 상태는 첫 페인트 전에 결정(§3.1) — 레이아웃 시프트 없음. `aria-expanded`는 `sync()` 초기 호출로 정합 | 새로고침 시 깜빡임 없음 |
| 10 | roving tabindex를 쓰지 않는다. 사이드바 모든 항목이 tab 순서에 있다 | 배치 4a 결정 0.3 승계 |
| 11 | 포커스 링: `.wb-nav__item:focus-visible`, `.wb-nav__toggle:focus-visible`, `.subnav__btn:focus-visible` 모두 `outline:2px solid var(--accent)` | 키보드로 전 항목 순회 |
| 12 | 설정 3탭의 `role=tab` / `aria-selected` / `aria-controls` / `aria-labelledby` / `id`는 **한 글자도 변경하지 않는다** | diff 확인 |
| 13 | 스페이스 복귀 링크의 접근명은 스페이스 **이름**(코드 아님). 아이콘은 `aria-hidden` | "← 개발팀" 으로 낭독 |
| 14 | `prefers-reduced-motion:reduce`에서 접힘 transition·rise 애니메이션 모두 정지 (기존 `*` 규칙이 커버, §4.1 삽입 순서 준수) | OS 설정 켜고 확인 |
| 15 | 색만으로 상태를 전달하지 않는다 — 활성 항목은 accent 배경 **+ font-weight 700 + `aria-current`**, 배지는 숫자 텍스트 병행 | 흑백 스크린샷 검토 |
| 16 | `<label>` 자체에 sr-only를 주지 않는다(이번 배치에 신규 `<label>` 없음 — 설정 화면 기존 `<label for>`는 그대로 유지) | 규칙 확인 |
| 17 | 권한 없는 스페이스 키를 넘겨도 이름이 노출되지 않는다 | `?spaceKey=` 로 비공개 스페이스 키를 넣어 폴백 확인 |

---

## 7. 테스트 영향

`approval-confluence9/src/test/java/kr/dmove/confluence/approval/c9/servlet/ApprovalInboxServletRenderTest.java`
의 7개 `render(...)` 호출(`:29,37,49,50,58,70,77`)에 **마지막 인자 `null`(space 없음)** 을 추가한다.

추가 권장 케이스 (같은 파일 또는 신규 `NavMarkupTest`):

1. `render(..., new NavMarkup.SpaceRef("DEV", "개발 <팀>"))` → `개발 &lt;팀&gt;` 이 나오고 `<팀>` 원문이 없다.
2. `render(..., new NavMarkup.SpaceRef("DEV", "개발팀"))` → href에 `?view=` 없는 설정 링크가 `?spaceKey=DEV`를 갖고,
   업무함 링크들이 `?view=…&amp;spaceKey=DEV`를 갖는다(`&amp;` 그대로, 생 `&` 아님).
3. `render(..., null)` → 마크업에 `wb-nav__item--back` 이 없다.
4. `admin=false` → `approval-settings` 문자열이 결과에 없다(기존 `:49-50` 테스트와 동일 취지, NavMarkup 경유로 재확인).
5. `ApprovalSettingsServlet.render("/confluence", null)` → `aria-current='page'` 가 정확히 1회.
