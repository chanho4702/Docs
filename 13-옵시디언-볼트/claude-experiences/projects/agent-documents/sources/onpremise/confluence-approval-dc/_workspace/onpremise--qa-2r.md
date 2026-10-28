# QA 배치 2 재작업 재검증 — 업무함·설정 서블릿 데코레이터 전환

**Verdict: PASS**

- 기준 커밋: `804adc9`
- 검증 대상: 미커밋 워킹트리 변경 4파일
- 1차 FAIL 17건: **17건 전부 RESOLVED** (미해소 0)
- 신규 발견: 결함 0 / 관찰 4 (전부 정보성)
- 빌드: **BUILD SUCCESS** — `Tests run: 48, Failures: 0, Errors: 0`
  (`ApprovalInboxServletRenderTest` 6건 **실제 실행·전부 통과**)

---

## 0. 변경 범위 — PASS

```
approval-confluence9/.../rest/ApprovalRestResource.java              |   9 +-
approval-confluence9/.../servlet/ApprovalInboxServlet.java           | 341 +++++++++---------
approval-confluence9/.../servlet/ApprovalSettingsServlet.java        | 213 ++++++------
approval-confluence9/.../servlet/ApprovalInboxServletRenderTest.java |  16 +-
4 files changed, 282 insertions(+), 297 deletions(-)
```

허용 범위(서블릿 2 + 테스트 1 + 배치 2분 `ApprovalRestResource.java`) 내. 그 외 변경 없음.

`ApprovalRestResource.java` diff는 1차 검증 때와 **동일**(deleteGroup 403→400 순서 교정,
`notification.eventId() == null` 가드). 재작업 중 추가 손질 없음 ✔

**압축·재포매팅 없음.** 라인 수 Inbox 536→523, Settings 511→504로 **감소**했으나 이는
삭제 지시(다크 `@media` 블록, masthead 마크업·CSS, `.shell`, `html{}` 규칙)가 추가분보다 컸기 때문이다.
최장 라인 Inbox 177자 / Settings 171자 — 모두 설계 원문이 제시한 CSS 한 줄 규칙 형태이며
Java 코드부(1~84행 / 1~55행)는 statement 한 줄·중괄호·개별 import 스타일 그대로다.
한 줄로 합쳐진 statement 없음 ✔

---

## 1. 치명 (CRITICAL) 5건

### C1. 다크 팔레트 조건 바꿔치기 — **RESOLVED**

판정 기준을 문자열 검색이 아니라 **"다크 팔레트 값이 파일 어디에도 없는가"**로 잡고 검사했다.

| 검사 | Inbox | Settings |
|------|-------|----------|
| `prefers-color-scheme` | 0건 | 0건 |
| `prefers-reduced-motion: no-preference` | 0건 | 0건 |
| `:root` | 0건 | 0건 |
| 다크 팔레트 hex (`#1c2026` `#14171b` `#e8ebef` `#0f1216` `#22272e` `#2b313a` `#8b98a8` `#3a424c` `#1a1f26`) | **0건** | **0건** |
| `#dmove-approval-app{` 팔레트 블록 개수 | **1개** | **1개** |

남은 `@media`는 각 파일 1개씩:
`@media (prefers-reduced-motion:reduce){#dmove-approval-app *{animation:none!important;transition:none!important}}`
— 설계 §0.3이 **유지하라고 지정한** 규칙이며 스코프도 붙어 있다.

즉 조건만 바꾼 우회가 아니라 **블록이 통째로 사라졌고, 어두운 색값 자체가 파일에 존재하지 않는다.**
팔레트 블록이 하나로 합쳐졌으므로 "두 번째 블록에 숨겨 두는" 재발 경로도 없다. ✔

### C2. 빌드 실패 / RenderTest 미수정 — **RESOLVED**

`render(...)` 호출 7곳 전부 5번째 인자 `"/confluence"` 추가. 검증 의도 약화 없음(기존 assertion 전부 보존).
지시한 신규 assertion 2건도 그대로 들어갔다 (`ApprovalInboxServletRenderTest.java:43-44`):

```java
assertTrue(html.contains("data-context-path=\"/confluence\""));
assertFalse(html.contains("__CONTEXT_PATH__"));
```

`ApprovalInboxServletRenderTest`: **Tests run 6, Failures 0, Errors 0** — 실제 실행 확인 ✔

### C3. 마스트헤드 마크업 파손 (고아 `</span>` + 삭제 실패 SVG) — **RESOLVED**

`ApprovalInboxServlet.java:223-229` 현재 상태:

```html
  <header class="app-head">
    <h1>__DISPLAY_NAME__님의 승인 업무함</h1>
    <p class="lede">…</p>
    <div class="app-head__actions">
      __ADMIN_LINK__
    </div>
  </header>
```

`<span></span>` / 홈 아이콘 `<svg>` / 고아 `</span>` 세 줄 모두 삭제됨.
`masthead` 문자열 0건. 스크립트로 정적 HTML의 태그 균형(`span a div header section table ul nav tbody thead form`)을
세어 본 결과 **양 파일 모두 불균형 0** ✔

### C4. CSS 스코프 미완 (Inbox 47건 / Settings 30건 전역 잔존) — **RESOLVED**

Codex 보고를 신뢰하지 않고 파서를 직접 작성해 재검증했다.
Java text block을 언이스케이프 → `<style>` 추출 → 주석 제거 → 중괄호 구조를 순회하며
at-rule 스택(`@media`/`@keyframes` 중첩)을 추적하고, 각 규칙의 셀렉터를 **콤마로 분리해 조각 단위**로 판정:

```
=== Inbox    === total selector pieces: 101, UNSCOPED: 0
=== Settings === total selector pieces:  63, UNSCOPED: 0
```

`@keyframes` 내부 `from`/`to`만 예외 처리했고, `#dmove-approval-appfoo` 같은
**접두어 글루잉(경계 없이 붙여 쓴 위장)** 도 별도로 검사했으나 0건.

교차 확인으로 정규식 grep(위험 셀렉터 `button|input|thead|tbody|table|label|html|body|h1|td|tr|.panel|.card|
.badge|.empty|.tab|.count|.ghost|.feed|.stamp|.warn|.timeline|.decisions|.members|.results|.sep|.sub|.cols|
.grid2|.message|.shell` 로 시작하는 규칙 중 `#dmove-approval-app` 없는 줄)도 돌렸고,
매치된 6줄은 전부 JS 코드(`try {`, `button.onclick = () => {`)로 **CSS 오탐**이었다.

qa-2가 반드시 포함하라고 지목한 셀렉터 개별 확인:

| 셀렉터 | 현재 |
|--------|------|
| `button:hover` `button.primary` `button.primary:hover` `button.danger` `button.danger:hover` | Settings:102-106 전부 `#dmove-approval-app ` 접두 ✔ |
| `button:focus-visible` `input:focus-visible` | Settings:73 각 조각 개별 접두 ✔ |
| `input[type=number]` | Settings:93 접두 ✔ |
| `thead th` `tbody td` `tbody tr.row:hover` `td small` | Inbox:157/159/161/165 접두 ✔ |
| `tr.detail td` | Inbox:177 접두 ✔ |
| `.tab:focus-visible,.ghost:focus-visible,.ghost-link:focus-visible` | Inbox:131 세 조각 모두 개별 접두 ✔ |

### C5. 콤마 셀렉터 리스트 첫 항목에만 스코프 — **RESOLVED**

qa-2가 지목한 3곳 모두 조각별 접두로 교정됐다.

```css
/* Settings:91 — 세 조각 전부 스코프 */
#dmove-approval-app input[type=text],#dmove-approval-app input[type=number],#dmove-approval-app input:not([type]){…}

/* Inbox:214-215 — 네 조각 전부 스코프 */
  #dmove-approval-app thead th:nth-child(3),#dmove-approval-app tbody td:nth-child(3),
  #dmove-approval-app thead th:nth-child(6),#dmove-approval-app tbody td:nth-child(6){display:none}

/* Inbox:218 — 두 조각 전부 스코프 */
  #dmove-approval-app thead th:nth-child(4),#dmove-approval-app tbody td:nth-child(4){display:none}
```

`input:not([type])` 의 전역화(Confluence 검색창 38px 붕괴) 해소 확인.
C4의 조각 단위 파서가 `@media` 내부까지 순회했으므로 이 항목은 C4 결과(UNSCOPED 0)로 함께 증명된다 ✔

---

## 2. 높음 (HIGH) 8건

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| H1 | `.app-head` 구조 미구현 | **RESOLVED** | Inbox:223-229 / Settings:141-147 이 설계 §1.1·§1.2 구조 그대로(`header.app-head > h1 + p.lede + div.app-head__actions`). `eyebrow`·`masthead`·`icon-btn` 문자열 **양 파일 0건** — 마크업·CSS 모두 삭제됨 |
| H2 | `.table-wrap` 미추가 | **RESOLVED** | 마크업 Inbox:257 `<div class="table-wrap"><table role="table">` … `:262 </table></div>` (태그 균형 확인), CSS Inbox:105 `#dmove-approval-app .table-wrap{overflow-x:auto}` |
| H3 | `.tab__badge`/`.feed--due` CSS 미추가 | **RESOLVED** | Inbox:132-133, :150-151. 설계 §2.1(g) 4개 규칙과 **문자 단위 일치** |
| H4 | 풀캔버스 배경을 래퍼로 이관 | **RESOLVED** | `linear-gradient`·`background-size` **양 파일 0건**. `#dmove-approval-app{…}` 에 background 선언 없음. 블록이 설계 §2.1(f) 원문과 동일 |
| H5 | `.shell` 잔존 + Inbox 여백 소실 | **RESOLVED** | `.shell` 문자열 **양 파일 0건**(본문·`@media` 모두). Inbox:98 `color:var(--ink); font:15px/1.6 var(--sans); padding:0 0 48px;` — 대체 여백 들어감. 팔레트 블록이 §2.1(f) 형태 **하나로 통합** |
| H6 | `waiting` 탭 힌트 미구현 | **RESOLVED** | Inbox:371-374 가 설계 §3.8(d) 코드와 일치: `+ (r.myStepOrder > 0 && !r.myTurn ? " · 내 차례 " + r.myStepOrder + "단계" : "")`. REST가 `myStepOrder` 를 내려주는 것도 재확인 |
| H7 | Settings 업무함 링크 이름 소실 | **RESOLVED** | Settings:145 `<a class="aui-button aui-button-link" href="__CONTEXT_PATH__/plugins/servlet/approval-inbox">승인 업무함</a>` — SVG 삭제, 텍스트 노드로 접근 가능한 이름 확보 |
| H8 | 성립 불가 `#dmove-approval-app html{}` | **RESOLVED** | `text-size-adjust` **양 파일 0건** |

---

## 3. 중간 (MEDIUM) 4건

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| M1 | Settings 뷰 탭 a11y | **RESOLVED** | Settings:150-152 버튼에 `id=view-tab-{approval\|flow\|group}` + `aria-controls=view-{…}`, :155/:189/:215 섹션에 `id=view-{…}` + `role="tabpanel"` + `aria-labelledby=view-tab-{…}`. 설계 §1.2와 1:1 일치 |
| M2 | Inbox tablist `aria-label` | **RESOLVED** | Inbox:249 `<div class="tabs" role="tablist" aria-label="승인 업무함 목록">` |
| M3 | 문구 3건 | **RESOLVED** | 탭 라벨 `처리한 건`(:253) / waiting 빈 상태 `앞 단계를 기다리는 결재가 없습니다.`(:475) / DUE_SOON 기본 `곧 마감됩니다. 승인 여부를 결정해 주세요.`(:306) — 셋 다 설계 원문과 일치 |
| M4 | `.tab` 전역 셀렉터 | **RESOLVED** | Inbox:480/494/497, Settings:254/256/257 모두 `root.querySelectorAll(…)`. `document.querySelectorAll` 는 Inbox:290 `[data-status-label]` 1곳만 남음(아래 N3 참조) |

---

## 4. 1차 PASS 항목 회귀 스팟 체크 — 회귀 없음

| 항목 | 결과 |
|------|------|
| TABS 4탭 필터 | myturn `PENDING && myTurn===true` / waiting `PENDING && myTurn!==true` / requested `requested` / done `myDecision==="APPROVED"\|\|"REJECTED"` — 설계 §1.1 표와 일치 ✔ |
| 초기 탭 | `show("myturn")` then/catch 두 곳 ✔ |
| `requestedLoaded` 플래그 | `let requestedLoaded = false`(:493) 후 성공·실패 무관 `true`. TDZ 없음(`show()` 는 fetch `.then()` 이후에만 호출) ✔ |
| `syncTabBadges` | requested 미로드 시 빈 배지 ✔ |
| `String(x === b)` | 명시적 문자열화 유지 ✔ |
| DUE_SOON 분기 | `eventLabel` 맵 `DUE_SOON:"마감 임박"`, `notificationLabel`/`notificationDetail` 최상단 분기, EXPIRED 분기 순서 보존, `!item.expiresAt` 방어 전부 유지 ✔ |
| `feed--due` 클래스 부여 | `(item.readAt ? "" : "unread") + (item.eventType === "DUE_SOON" ? " feed--due" : "")` ✔ |
| `aria-live="polite"` | `ul.feed#notification-list` 유지 ✔ |
| context-path 토큰 | 하드코딩 `/confluence/` **양 파일 0건**. `__CONTEXT_PATH__` 는 Inbox 1곳·Settings 2곳으로 전부 **HTML 속성**(`data-context-path`, `href`). JS 문자열 리터럴 안에 없음. 렌더 후 JS에 남은 `__TOKEN__` 0개(스크립트 확인) ✔ |
| 인라인 JS `node --check` | text block 언이스케이프 → `<script>` 추출 → `__STATUS_LABELS__` 를 JSON으로 치환 후 검사: **Inbox SYNTAX OK / Settings SYNTAX OK** ✔ |
| 백슬래시 이스케이프 | JS 내 백슬래시는 Inbox `.replace(/\\./g, "-")` 1곳뿐. text block에서 `/\./g` 로 정확히 렌더 ✔ |
| decorator meta | 양 파일 `<meta name="decorator" content="atl.general">` 유지 ✔ |
| `@keyframes dmove-rise` | 개명 유지, 참조부(`.metric,.panel` / `tbody tr.row` / Settings `.panel`) 갱신 유지 ✔ |
| 회귀 가드 | `escape()` 규칙, `ApprovalJson.escapeForScript` 로 `__STATUS_LABELS__` 처리, `Matcher.quoteReplacement`, 토큰 1회 순회 치환 전부 유지 ✔ |
| REST 경계 | JS 소비 필드(`myTurn/myStepOrder/myDecision/stepCount/currentStepOrder/dueSoon`, 알림 `id/pageId/eventType/reason/pageTitle/approvedContentVersion/occurredAt/expiresAt/readAt`) 모두 응답에 존재 ✔ |
| JS diff 검사 | HEAD 대비 JS 변경 라인을 전수 확인 — 전부 설계 §3.8(a)~(g)·§2.1(i) 지정분. 의도 외 로직 변경 0건 ✔ |

---

## 5. 신규 발견 (전부 정보성 — 결함 아님)

- **N1. `--canvas` 토큰이 미사용 상태로 남음** (양 파일).
  H4로 배경 연출을 지운 결과 `--canvas:#f6f5f2` 를 참조하는 규칙이 없다.
  다만 설계 §2.1(f)가 이 토큰을 **포함한 블록을 그대로 제시**했으므로 스펙 준수 결과다. 조치 불필요.
- **N2. 패키징 미검증.** 지시대로 `mvn -B -pl approval-confluence9 -am test` 만 돌렸다.
  `clean verify` 는 C9 dev 인스턴스의 `cargo-confluence-home` 를 지우게 되므로 이번에도 실행하지 않았다.
  → plugin descriptor 필터링 / bytecode major version 61 / jar 패키징은 **여전히 미검증**.
  인스턴스를 내린 뒤 `scripts/build.ps1 -Target confluence9` 로 1회 확인 필요.
- **N3. `document.querySelectorAll("[data-status-label]")`** (Inbox:290) 는 여전히 document 범위다.
  M4 지시 대상(`.tab`)이 아니었고 속성명이 앱 고유라 크롬과 충돌할 여지는 사실상 없다. 조치 불필요.
- **N4. 설계 문서 내부 모순(구현 아님).** §1.1/§1.2 구조도는 `meta[charset=utf-8]` 을 그리고 있으나
  §2.1(d)/§2.2(b)는 `charset` 제거를 명시한다. 구현은 후자(명시적 변경 지시)를 따랐고 1차 QA도 이를 PASS로 판정했다.
  데코레이터가 `<head>` 를 제공하므로 구현 쪽이 옳다. 설계 문서 §1.1/§1.2 구조도를 나중에 정리하면 좋다.

---

## 6. 빌드 결과

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test

  ApprovalRegionMacroSettingsCacheTest      1
  ApprovalRegionSupportTest                 6
  ApprovalNotificationTest                 13
  ApprovalJsonDueSoonTest                   5
  ApprovalJsonTest                          4
  ApprovalRestResourceSettingsTest          1
  ApprovalStepSpecTest                      6
  GroupApproverResolverTest                 4
  ApprovalInboxServletRenderTest            6   ← 1차에는 컴파일 실패로 0건 실행
  ApprovalSettingsTest                      2

  Tests run: 48, Failures: 0, Errors: 0, Skipped: 0
  approval-domain SUCCESS / approval-confluence9 SUCCESS
  BUILD SUCCESS (29.1s)
```

confluence10 은 지시대로 빌드하지 않았다.

---

## 7. 완료 기준 대조

| 스펙 §완료 기준 | 결과 |
|-----------------|------|
| 셀렉터 조각 전부 `#dmove-approval-app` 시작 (keyframes from/to 제외), 스크립트 0건 | **0건** ✔ (Inbox 101조각 / Settings 63조각) |
| `prefers-color-scheme` + `prefers-reduced-motion: no-preference` 0건 | **0건** ✔ |
| `prefers-reduced-motion:reduce` 는 스코프 붙여 유지 | 양 파일 1건씩 스코프 유지 ✔ |
| 인라인 `<script>` `node --check` 통과 | 양 파일 SYNTAX OK ✔ |
| `eyebrow`/`masthead`/`icon-btn` 0건 | **0건** ✔ |
| 테스트 파일 새 시그니처로 컴파일 | 컴파일 + 6건 실행 통과 ✔ |
| 지시 외 파일 변경 금지 | 준수 ✔ |

**재작업분 승인. 커밋 가능.** (N2 패키징 검증은 인스턴스 종료 후 별도 1회 수행 권장.)
