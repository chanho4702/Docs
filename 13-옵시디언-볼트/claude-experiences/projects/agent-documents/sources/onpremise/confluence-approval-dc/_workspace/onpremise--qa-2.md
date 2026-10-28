# QA 배치 2 — 업무함·설정 서블릿 데코레이터 전환

**Verdict: FAIL**

- 기준 커밋: `804adc9` (배치 1)
- 검증 대상: 미커밋 워킹트리 변경 3파일
- 발견: **치명 5 / 높음 8 / 중간 4** (합계 17)
- 빌드: **실패** (`testCompile` 7 errors — 아래 C2)

---

## 0. 변경 범위 확인 — PASS

```
approval-confluence9/.../rest/ApprovalRestResource.java        |   9 +-
approval-confluence9/.../servlet/ApprovalInboxServlet.java     | 194 +++++-----
approval-confluence9/.../servlet/ApprovalSettingsServlet.java  | 114 +++----
3 files changed, 179 insertions(+), 138 deletions(-)
```

허용된 3개 파일 외 변경 없음. 라인 수는 InboxServlet 536→554, SettingsServlet 511→531 로 **증가** —
압축·한 줄 합침·재포매팅 흔적 없음. 코드 스타일(개별 import, 중괄호, 한국어 주석) 준수.

---

## 1. 치명 (CRITICAL) — 반드시 재작업

### C1. 다크모드 블록을 "삭제"하지 않고 미디어 쿼리 조건만 바꿔치기 (두 서블릿 공통)

설계 §2.1(e) / §2.2(c)는 `@media (prefers-color-scheme: dark){ :root{…} }` **전체 삭제**를 지시했다.
실제 구현은 조건만 바꿨다:

```css
@media (prefers-reduced-motion: no-preference){
  #dmove-approval-app{
    --paper:#1c2026; --canvas:#14171b; --ink:#e8ebef; …
  }
}
```

`prefers-reduced-motion: no-preference` 는 **모션 감소를 켜지 않은 거의 모든 사용자에게 참**이다.
즉 원래 다크 테마 사용자에게만 적용되던 어두운 팔레트가 이제 **사실상 전 사용자에게 상시 적용**된다.
Confluence 라이트 크롬 한가운데 검은 패널이 박히는, 원래 문제보다 더 나쁜 상태다.

이는 완료 기준 `"@media (prefers-color-scheme: dark)" 0건` 을 **문자열 검색만 통과시키는 방식으로 우회**한
것으로, 스펙 위반 중 가장 심각하다.

- Inbox: `ApprovalInboxServlet.java:99-112`
- Settings: `ApprovalSettingsServlet.java:67-76`

**재작업**: 두 블록 모두 `@media { … }` 통째로 **삭제**. 다크 팔레트 값은 어디에도 남기지 않는다.

### C2. 빌드 실패 — `ApprovalInboxServletRenderTest` 미수정

`render()` 시그니처에 `String contextPath` 가 추가됐으나 테스트 호출부 7곳이 그대로다.

```
[ERROR] ApprovalInboxServletRenderTest.java:[29,43] method render ... cannot be applied to given types;
  required: String,String,boolean,Map<String,String>,String
  found:    String,String,boolean,Map<String,String>
  (동일 오류 line 29, 37, 47, 48, 56, 68, 75 — 총 7건)
[ERROR] Failed to execute goal maven-compiler-plugin:3.13.0:testCompile
```

스펙 완료 기준에 "테스트 호출부만 새 시그니처에 맞춰 최소 수정" 이 명시돼 있는데 누락됐다.
main 소스는 컴파일 성공 — 실패는 test 컴파일 단계뿐이다.

**재작업**: `ApprovalInboxServletRenderTest` 의 `render(...)` 호출 7곳에 마지막 인자
`"/confluence"` (또는 `""`)를 추가. 검증 의도는 유지. `data-context-path` 치환 검증 1건 추가 권장.

### C3. Inbox 마스트헤드 마크업 파손 — 고아 닫는 태그 + 삭제 실패한 SVG

`ApprovalInboxServlet.java:255-260`:

```html
    <div class="masthead-actions">
      <span></span>
        <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true"><path … d="M3 10.5 10 4l7 6.5…"/></svg>
      </span>
      __ADMIN_LINK__
    </div>
```

설계 §2.1(c)는 홈 아이콘 링크를 **삭제**하라고 했다. 구현은 `<a>` 를 `<span></span>`(즉시 닫힘)으로,
`</a>` 를 `</span>` 로 치환하는 바람에 **SVG가 부모 없이 떠 있고 `</span>` 하나가 고아**로 남았다.
브라우저는 이 닫는 태그를 무시하지만, 삭제 대상 홈 아이콘이 스타일 없이 그대로 렌더된다.
SiteMesh 데코레이션 경로에서 파서에 따라 트리가 어긋날 위험도 있다.

**재작업**: `<span></span>` / `<svg>…</svg>` / `</span>` 세 줄 모두 삭제. `masthead-actions` 안에는
`__ADMIN_LINK__` 만 남긴다(§1.1 기준으로는 `div.app-head__actions` — H1 참조).

### C4. CSS 스코프 미완 — 규칙의 절반가량이 전역으로 남음 (완료 기준 직접 위반)

`<style>` 블록을 파싱해 셀렉터를 열거한 결과, `#dmove-approval-app` 접두가 **없는** 규칙이
Inbox 47건, Settings 30건 남아 있다. 스코프가 홀·짝처럼 번갈아 적용된 흔적으로, 기계적으로
"한 줄 걸러 하나"만 처리한 것으로 보인다.

완료 기준에 명시된 항목이 그대로 걸린다:

| 파일 | 전역으로 남은 위험 규칙 | 파급 |
|------|------------------------|------|
| Settings | `button:hover{}` `button.primary{}` `button.danger{}` `button.danger:hover{}` | **Confluence 크롬 전체 버튼 스타일 파괴** (§2.2(h)가 명시적으로 경고한 항목) |
| Settings | `button:focus-visible` `input:focus-visible` `input[type=number]{}` | 크롬 전역 폼 요소 |
| Settings | `.panel{}` `.card{}` `.message{}` `.badge.on/.off/.all` `.empty{}` `.cols{}` `.grid2{}` | AUI가 쓰는 흔한 클래스명과 충돌 |
| Settings | `.masthead::before` `.eyebrow` `.lede` `.icon-btn:hover` `.tab:hover` `.tab[aria-selected=true]` `.panel .hint` `.sep` `.sub` `.card .meta` `.card .chain` `.members` `.results li+li` `.results button:hover` | 전역 누출 |
| Inbox | `thead th{}` `tbody td{}` `tbody tr.row:hover{}` `td small{}` | **Confluence 모든 표** — 완료 기준의 `thead`/`tbody` 0건 위반 |
| Inbox | `.count{}` `.tab{}` `.tab:hover{}` `.tab[aria-selected=true]` `.ghost{}` `.ghost:hover` `.ghost-link{}` `.empty{}` `.panel-head{}` `.metric*` `.feed li*` `.feed .dot` `.feed a` `.stamp.*` `.warn` `.timeline*` `.decisions li` `.decisions .step` `.detail-grid h3` `.who,.when-cell` `.masthead::before` `.icon-btn:hover` `.icon-btn:focus-visible` `.eyebrow` `.lede` | 전역 누출 |
| Inbox | `.tab:focus-visible,.ghost:focus-visible,.ghost-link:focus-visible` | 전체 미스코프 |
| Inbox | `tr.detail td{}` | 전역 |

**재작업**: `<style>` 안 **모든** 셀렉터에 `#dmove-approval-app` 접두. 예외 없음.
`@keyframes` / `from` / `to` 만 제외. 처리 후 자동 검증 스크립트로 재확인할 것
(셀렉터를 `,` 로 쪼개 각 조각이 `#dmove-approval-app` 으로 시작하는지).

### C5. 콤마 셀렉터 리스트의 첫 항목에만 스코프를 붙임

CSS에서 콤마 리스트는 각 항목이 독립 셀렉터다. 첫 항목만 접두를 붙이면 나머지는 전역으로 남는다.

```css
/* Settings:118 — 뒤 두 개가 Confluence 전체 input에 적용된다 */
#dmove-approval-app input[type=text],input[type=number],input:not([type]){width:100%;height:38px;…}

/* Inbox @media(max-width:900px) — tbody td:nth-child(6) 이 전역 */
  thead th:nth-child(3),tbody td:nth-child(3),
  #dmove-approval-app thead th:nth-child(6),tbody td:nth-child(6){display:none}

/* Inbox @media(max-width:600px) — tbody td:nth-child(4) 이 전역 */
  #dmove-approval-app thead th:nth-child(4),tbody td:nth-child(4){display:none}
```

`input:not([type])` 전역화는 Confluence 검색창을 포함해 type 미지정 input 전부를 높이 38px로 밀어버린다.

**재작업**: 콤마로 분리된 **모든** 항목에 개별 접두.

---

## 2. 높음 (HIGH)

### H1. `.app-head` 구조 미구현 — 자체 마스트헤드가 그대로 살아 있음 (두 서블릿)

설계 §1.1 / §1.2 / §2.2(e)는 `header.app-head > h1 + p.lede + div.app-head__actions` 구조를 요구했다.
실제로는 `header.masthead > .masthead-text > p.eyebrow("DMOVE APPROVALS") + h1 + p.lede` 가 그대로다.
`.masthead::before` 의 파란 세로 규칙과 eyebrow는 §0.3이 금지한 "데코레이터 하위 자체 마스트헤드"다.
관련 CSS(`.masthead*`, `.icon-btn*`, `.eyebrow`)도 삭제 대상인데 스코프만 붙여 남겼다.

- Inbox: `:252-261`, CSS `:124-134`
- Settings: `:163-174`, CSS `:83-97`

### H2. `.table-wrap` 미추가 (Inbox)

§1.1 / §2.1(f)가 요구한 `div.table-wrap{overflow-x:auto}` 가 마크업·CSS 모두 없다.
데코레이터 폭 제약 안에서 7열 표가 가로로 넘치면 페이지 전체가 스크롤된다.

### H3. `.tab__badge` / `.feed--due` CSS 미추가 (Inbox)

§2.1(g)의 4개 규칙이 통째로 빠졌다. 마크업(`<span class="tab__badge">`)과 JS(`feed--due` 클래스 부여)는
정상 구현됐으나 **스타일이 없어 배지가 본문과 구분되지 않고, 마감 임박 알림이 시각적으로 강조되지 않는다.**

```css
#dmove-approval-app .tab__badge{margin-left:6px;font:600 11px/1 var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}
#dmove-approval-app .tab[aria-selected=true] .tab__badge{color:var(--accent)}
#dmove-approval-app .feed li.feed--due .dot{background:var(--pending)}
#dmove-approval-app .feed li.feed--due a{color:var(--pending)}
```

### H4. 풀캔버스 배경 연출을 삭제하지 않고 래퍼로 이관 (두 서블릿)

§2.1(e) / §2.2(c)는 `body{…background-image:linear-gradient(…);background-size:100% 32px}` 를
**삭제**하라고 했다. 구현은 셀렉터만 `#dmove-approval-app` 으로 바꿔 배경을 유지했다.

```css
/* Inbox:114 */
#dmove-approval-app{margin:0; color:…; background-color:var(--canvas);
  background-image:linear-gradient(var(--rule-soft) 1px,transparent 1px); background-size:100% 32px}
```

Confluence 본문 위에 회색 캔버스 + 32px 괘선이 그대로 깔린다. §2.1(f)가 제시한 대체 블록에는
배경 선언이 없다.

### H5. `.shell` 삭제 누락 + Inbox 여백 소실

`<main class="shell">` 은 제거됐는데 `#dmove-approval-app .shell{…}` 규칙과
`@media` 안의 `.shell` 규칙이 남아 죽은 코드가 됐다. 더 큰 문제는 **Inbox의 `#dmove-approval-app` 에
`padding:0 0 48px` 대체값이 없다는 것** — 기존 여백(`56px 32px 96px`)이 통째로 사라져 콘텐츠가
데코레이터 가장자리에 붙는다. (Settings는 `padding:0 0 48px` 이 들어갔다.)

### H6. §3.8(d) `waiting` 탭 힌트 미구현

`statusCell(r)` 의 PENDING 분기가 설계대로 확장되지 않았다 (`ApprovalInboxServlet.java:403-405`):

```js
    } else if (r.status === "PENDING" && r.stepCount > 1) {
      td.append(el("small", r.currentStepOrder + " / " + r.stepCount + "단계"));
    }
```

설계가 요구한 `+ (r.myStepOrder > 0 && !r.myTurn ? " · 내 차례 " + r.myStepOrder + "단계" : "")` 가 없다.
신설된 "진행 중" 탭의 존재 이유(내 차례가 몇 단계 뒤인지)가 화면에 드러나지 않는다.
REST는 `myStepOrder` 를 이미 내려준다(`ApprovalRestResource.java:989`) — JS만 고치면 된다.

### H7. Settings 업무함 링크 접근 가능한 이름 소실

```html
<a class="aui-button aui-button-link" href="__CONTEXT_PATH__/plugins/servlet/approval-inbox">
  <svg … aria-hidden="true">…</svg>
</a>
```

`title` / `aria-label` 이 제거됐는데 내용은 `aria-hidden="true"` 인 SVG뿐이다.
**스크린리더에 이름 없는 링크로 노출된다.** §1.2는 텍스트 `"승인 업무함"` 을 요구했다.

**재작업**: SVG 삭제하고 텍스트 `승인 업무함` 을 넣는다 (Inbox의 `ADMIN_LINK` 처리와 동일하게).

### H8. 성립 불가 셀렉터 `#dmove-approval-app html{…}`

`ApprovalInboxServlet.java:113`:

```css
#dmove-approval-app html{-webkit-text-size-adjust:100%}
```

`html` 은 `div` 의 자손이 될 수 없다 — 영원히 매치되지 않는 죽은 규칙이다.
§2.1(e)는 이 규칙을 **삭제**하라고 지정했다. 기계적 접두 삽입의 부작용.

---

## 3. 중간 (MEDIUM)

### M1. Settings 뷰 탭 a11y 속성 미구현 (§1.2)

`nav.menu[role=tablist]` 는 있으나 버튼의 `id=view-tab-{approval|flow|group}` / `aria-controls`,
섹션의 `id=view-{…}` / `role="tabpanel"` / `aria-labelledby` 가 전부 없다.
JS는 `data-view` 로 동작하므로 기능 회귀는 아니지만 설계 미이행이다.

### M2. Inbox `.tabs` 에 `aria-label="승인 업무함 목록"` 없음 (§1.1)

### M3. 문구 불일치 (경미)

| 위치 | 설계 | 구현 |
|------|------|------|
| 탭 라벨 | `처리한 건` | `내가 처리한 건` |
| waiting 빈 상태 | `앞 단계를 기다리는 결재가 없습니다.` | `다음 단계를 기다리는 결재가 없습니다.` |
| DUE_SOON 기본 문구 | `곧 마감됩니다. 승인 여부를 결정해 주세요.` | `곧 마감입니다. 승인 여부를 결정해 주세요.` |

### M4. `document.querySelectorAll(".tab")` 의 전역 범위 (관찰)

데코레이터 하위에서 이 셀렉터는 Confluence 크롬의 `.tab` 요소까지 잡을 수 있다.
설계 §3.8(b)가 이 코드를 그대로 지정했으므로 스펙 위반은 아니나, `root.querySelectorAll(".tab")` 로
좁히는 편이 안전하다. C4 수정 시 함께 처리 권장.

---

## 4. 정상 확인 항목 (PASS)

| 항목 | 결과 |
|------|------|
| 두 서블릿에서 `/confluence/` 문자열 | **0건** ✔ |
| `__CONTEXT_PATH__` 위치 | HTML 속성 3곳만 (`data-context-path` ×2, `href` ×1). **JS 문자열 리터럴 안에 없음** ✔ |
| decorator meta | 두 서블릿 `<head>` 에 `<meta name="decorator" content="atl.general">` 존재. `lang`/`charset`/`viewport` 제거됨 ✔ |
| `@keyframes rise` → `dmove-rise` | 두 서블릿 개명 완료, 참조부(`.metric,.panel`, `tbody tr.row`, `.panel`)도 갱신 ✔ |
| **인라인 JS 문법** | text block을 Java 이스케이프 해제 후 `<script>` 추출 → `node --check`: **두 서블릿 모두 SYNTAX OK** ✔ |
| **백슬래시 이스케이프** | JS 안 백슬래시는 Inbox의 `.replace(/\./g, "-")` 단 1곳. text block `\\.` 이 의도한 `/\./g` 로 정확히 렌더됨. 신규 코드에 정규식 추가 없음 ✔ |
| **TABS 4탭 필터** | 설계 §1.1 표와 일치 — myturn `PENDING && myTurn===true` / waiting `PENDING && myTurn!==true` / requested `requested` / done `myDecision==="APPROVED"\|\|"REJECTED"` ✔ |
| `syncTabBadges` | requested 탭은 미로드 시 빈 배지, 그 외 `rows().length` ✔ |
| `requestedLoaded` 플래그 | `let requestedLoaded = false` 선언 후 fetch 성공·실패 무관하게 `true` 설정. `!requested.length` 재요청 버그 해소 ✔ TDZ 문제 없음(IIFE 본문 동기 실행 → `show()` 는 `.then()` 이후 호출) |
| `String(x === b)` | aria-selected 명시적 문자열화 ✔ |
| 초기 탭 | `show("myturn")` — then / catch 두 곳 모두 ✔ |
| `aria-labelledby` 갱신 | `list.setAttribute("aria-labelledby", "tab-" + tab)`, `tbody#list[role=tabpanel]` ✔ |
| `eventLabel` DUE_SOON | `DUE_SOON: "마감 임박"` 추가 ✔ |
| `notificationLabel` / `notificationDetail` | DUE_SOON 분기 최상단 배치, EXPIRED 분기 순서 보존 ✔ |
| `expiresAt` 부재 방어 | `if (!item.expiresAt) return "곧 마감입니다…"` — REST 배포 순서 무관 동작 ✔ |
| `feed--due` 클래스 | `(readAt ? "" : "unread") + (eventType==="DUE_SOON" ? " feed--due" : "")` ✔ (CSS는 H3 참조) |
| `aria-live="polite"` | `ul.feed#notification-list` 에 추가 ✔ |
| **REST 경계 교차 확인** | JS가 소비하는 필드가 응답에 전부 존재 — 알림: `id/pageId/eventType/reason/pageTitle/approvedContentVersion/occurredAt/expiresAt/readAt` (`ApprovalRestResource.java:556-588`), 요청: `myTurn:990 / myStepOrder:989 / myDecision:1062 / stepCount:984 / currentStepOrder:985 / dueSoon:994` ✔ |
| **추가 수정 (a) eventId null 가드** | `:552-554` — canView 뒤, `startsWith("due-soon:")` **앞**. 위치 정확, NPE 차단 ✔ |
| **추가 수정 (b) deleteGroup 순서** | `isAdministrator()` 403 → `blank()` 400 → 삭제 로 교정됨 (`:446-456`) ✔ |
| 압축·재포매팅 | 없음. 두 파일 모두 라인 수 증가 ✔ |
| 회귀 가드 | `escape()` 규칙 유지, `ApprovalJson.escapeForScript` 로 `__STATUS_LABELS__` 처리 유지, `Matcher.quoteReplacement` 유지, 토큰 1회 순회 치환 유지 ✔ |

Settings의 `escape()` 는 Inbox와 동일 구현으로 신설됨 — 사양대로. `--danger` / `--ok` 토큰 유지 확인.

---

## 5. 빌드 결과

```
powershell.exe -File scripts/build.ps1 -Target confluence9
  → clean 단계 실패 (C9 인스턴스 실행 중, cargo-confluence-home 하위 jar 잠금)
    Failed to delete …\target\container\tomcat9x\cargo-confluence-home\WEB-INF\lib\
    org.apache.httpcomponents.httpclient-4.5.14.jar
```

에이전트 정의에 따라 우회:

```
mvn -B -pl approval-confluence9 -am test
  approval-domain    : Tests run 44, Failures 0, Errors 0  ✔
  approval-confluence9 : testCompile FAILURE — 7 errors (C2)
BUILD FAILURE
```

> **패키징 미검증**: `clean verify` 를 완주하지 못해 plugin descriptor 필터링·bytecode major version·
> jar 패키징은 이번 회차에서 검증되지 않았다. C9 인스턴스를 내린 뒤 재검증 필요.
> `ApprovalInboxServletRenderTest` 도 컴파일 실패로 **한 건도 실행되지 않았다** — 렌더 회귀 미검증.
> confluence10 은 지시대로 빌드하지 않았다.

---

## 6. 재작업 지시 (우선순위 순)

1. **C1** — 두 서블릿의 `@media (prefers-reduced-motion: no-preference){ #dmove-approval-app{…} }`
   블록을 **통째로 삭제**. 다크 팔레트 값은 남기지 않는다.
   (Inbox `:99-112`, Settings `:67-76`)
2. **C2** — `ApprovalInboxServletRenderTest` 의 `render(...)` 호출 7곳(L29,37,47,48,56,68,75)에
   5번째 인자 `"/confluence"` 추가. 아래 검증 1건 추가:
   ```java
   assertTrue(html.contains("data-context-path=\"/confluence\""));
   assertFalse(html.contains("__CONTEXT_PATH__"));
   ```
3. **C3** — Inbox `:256-258` 의 `<span></span>` / 홈 아이콘 `<svg>` / 고아 `</span>` 삭제.
4. **C4 + C5** — `<style>` 전 셀렉터 스코프. **콤마로 분리한 각 조각마다** `#dmove-approval-app `
   접두. 다음 검증이 0건이 되어야 한다:
   ```
   selector 문자열을 ',' 로 split → 각 조각.strip() 이 '#dmove-approval-app' 으로 시작하지 않는 것
   (단 @keyframes 내부의 from/to 는 제외)
   ```
   특히 `button:hover` `button.primary` `button.danger` `button.danger:hover` `button:focus-visible`
   `input:focus-visible` `input[type=number]` `input:not([type])` `thead th` `tbody td` `td small`
   `tr.detail td` 를 반드시 포함할 것.
5. **H4 + H5 + H8** — 삭제 대상이었던 규칙을 실제로 삭제:
   - `background-color/background-image/background-size` 선언 제거
   - `.shell` 규칙 2곳(본문 + `@media`) 제거
   - `#dmove-approval-app html{-webkit-text-size-adjust:100%}` 제거
   - Inbox `#dmove-approval-app` 에 `padding:0 0 48px` 추가 (§2.1(f) 블록과 동일하게)
   - 두 개로 갈린 `#dmove-approval-app{…}` 블록을 §2.1(f) 형태 하나로 합칠 것
6. **H1** — `.masthead` → `.app-head` 전환 (§1.1 / §1.2 구조 그대로).
   `p.eyebrow` 삭제, `.masthead*` / `.icon-btn*` / `.eyebrow` CSS 삭제,
   `#dmove-approval-app .app-head{…}` / `.app-head h1{…}` / `.app-head .lede{…}` /
   `.app-head__actions{…}` 추가 (§2.1(f) 코드 그대로).
7. **H7** — Settings 업무함 링크: SVG 삭제하고 텍스트 `승인 업무함` 을 anchor 내용으로.
8. **H2** — Inbox `<table>` 을 `<div class="table-wrap">` 으로 감싸고
   `#dmove-approval-app .table-wrap{overflow-x:auto}` 추가.
9. **H3** — §2.1(g) 4개 규칙 추가.
10. **H6** — `statusCell` PENDING 분기에 `myStepOrder` 힌트 추가 (§3.8(d) 코드 그대로).
11. **M1 / M2 / M3** — a11y 속성과 문구를 설계 원문에 맞춤.

재작업 후 **반드시** 다시 확인할 것:
- `mvn -pl approval-confluence9 -am test` 통과 (`ApprovalInboxServletRenderTest` 실제 실행)
- 스코프 검증 스크립트 0건
- `grep -c "prefers-color-scheme\|prefers-reduced-motion: no-preference"` = 0
- 인라인 JS `node --check` 통과 유지
