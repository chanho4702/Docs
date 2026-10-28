# QA 8d — CC 참조자 UI + 8c 잔여 편승 검증 (2026-08-14)

대상 스펙: `_workspace/spec-8d-cc-ui.md` (변경 1~3 CC UI + 변경 4 편승 4건)
설계: `_workspace/design-batch8.md` (D7, D8)
기준 커밋: `2a7d6b3` (8c 확정분) — `git diff HEAD` = 8d 순수 변경분
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | 0 |
| 중대 | **1** |
| 경미 | 2 |

**중대 1건은 8c에서 이미 잡아 고쳤던 결함(qa-8c M3 → R4)의 재발**이다 — `approval.css`에
그 스코프에 존재하지 않는 커스텀 속성을 다시 참조했다. 수정은 **2줄**이지만,
같은 함정이 두 배치 연속 재발했으므로 그냥 넘기면 8e·8.5에서 또 나온다.
그 외 CC UI 전 항목과 편승 4건은 전부 PASS다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 112, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS
```
**112 확인** (8c 111 → +1). 증가분: `ApprovalInboxServletRenderTest` 9→10 (`참조_탭을_사이드바와_업무함_뷰에_렌더링한다`).

## JS 문법 검증 (node)
```
approval.js                          → OK
inbox   (script 2블록)                → inbox-0.js OK, inbox-1.js OK
settings(script 2블록)                → settings-0.js OK, settings-1.js OK
```
Sitemesh 꺾쇠 함정 0건, 미치환 토큰 0건.

## 재포매팅·압축 검사 (PASS)

`git diff HEAD --numstat` — 총 **297 insertions / 14 deletions**(코드 파일 기준). 삭제 14줄 전수:

| 파일 | +/- | 삭제 내역 |
|------|-----|-----------|
| ApprovalMarkup | 42/3 | `detailDialog` 시그니처 1, PIN input `autocomplete` 2줄(N3 교체) |
| ApprovalRegionMacro | 10/1 | `signatureResolver` → `signatureResolver, ccDisplayNames` 1줄 |
| ApprovalPagePanel | 10/1 | 동일 1줄 |
| ApprovalInboxServlet | 22/5 | TEMPLATE 서명 섹션 1, 주석 1, endpoint 1, badge 키맵 1, 부팅 배지 1 |
| approval.js | 153/2 | `scopeBtn` 셀렉터 1, focusin 셀렉터 1 |
| approval.css | 44/1 | `[data-approval-scope-pane] > label` → 2-셀렉터 1줄 |
| NavMarkup | 5/0 | 없음 |
| 테스트 2종 | 3/1, 8/0 | `signatureResolver);` → `signatureResolver,` 1줄 |

한 줄 압축·주석 삭제 없음. **기존 주석은 오히려 갱신됐다**
(`ApprovalInboxServlet:909` "/mine/requested의 badges에는…" → "/mine/requested와 /mine/cc의 badges에는…").

---

# 중대

## M1. CC 칩 CSS가 패널·매크로에서 무효 — **8c M3(R4로 고친 결함)의 재발**

**파일:줄** `approval-confluence9/src/main/resources/css/approval.css:634, 636`
```css
.dmove-approval-cc-chip {
    ...
    border: 1px solid var(--rule);      /* :634 */
    border-radius: 999px;
    background: var(--sunk);            /* :636 */
    font-size: 12px;
}
```

**실측**
- `approval.css`의 **커스텀 속성 정의 개수 = 0** (`grep -cE "^\s*--[a-z-]+:"` → 0).
- 8c 재작업(R4)으로 이 파일의 `var()` 사용을 **0건으로 만들었는데**, 8d가 **2건을 재도입**했다
  (`grep -n "var(--"` → `:634`, `:636` 둘뿐).
- `--rule`/`--sunk`는 `ApprovalInboxServlet` TEMPLATE의 `#dmove-approval-app` 스코프(`:121-127`)에만 정의돼 있다.
- 이 파일의 기존 관례는 하드코딩이다 — 테두리 `#dfe1e6`(`:205, :237, :366, :551`), 옅은 배경 `#ebecf0`(`:327`).

**업무함 상속으로도 구제되지 않는다 (8c와 결정적으로 다른 점)**
8c의 도장(`.dmove-approval-stamp`)은 업무함 상세에도 렌더돼 그쪽은 상속으로 정상이었다.
그러나 **CC 칩이 있는 요청 모달(`appendRequestForm`)은 패널·영역 매크로에서만 렌더된다** —
`ApprovalInboxServlet`에 `.dmove-approval-request` 폼은 **0건**(실측).
즉 CC 칩은 항상 `#dmove-approval-app` 밖의 Confluence 콘텐츠 페이지에 그려지고,
**어떤 경로로도 토큰이 상속되지 않는다.**

**결과**
- `border: 1px solid var(--rule)` — var가 invalid at computed-value time이면 **단축 선언 전체가 무효**
  → 테두리가 아예 사라진다(1px도, 색도).
- `background: var(--sunk)` 무효 → 배경 없음(투명).
- `border-radius: 999px`·`padding`·`font-size`만 남아 **"칩"이 아니라 맨 텍스트 + × 버튼**으로 보인다.
  선택된 참조자와 주변 텍스트의 경계가 사라져 D8이 요구한 "칩 나열" UI가 성립하지 않는다.

**원인 — 스펙이 같은 함정을 반복했다**
8d 스펙 변경 1 마지막 줄: *"칩 스타일 — 기존 pill/chip 토큰 재사용(`--sunk` 배경, `--rule` 테두리 …)"*.
8c 스펙 금지 9도 `--approved`를 "기존 토큰"으로 예시해 같은 사고를 냈다.
**이 토큰들은 approval.css의 것이 아니라 업무함 서블릿의 것이다.**

**제안 수정** (2줄, 새 색상 값 없음)
```css
    border: 1px solid #dfe1e6;
    background: #ebecf0;
```

**재발 방지 제안 (코디네이터용)** — `approval-ui-style` 스킬에 한 줄 추가:
> `approval.css`(패널·매크로)에는 CSS 커스텀 속성이 정의돼 있지 않다. `var(--…)`를 쓰지 말고
> 하드코딩 색을 재사용하라. `--paper/--rule/--sunk/--approved/--sans` 등은
> 업무함·설정 서블릿 TEMPLATE의 `#dmove-approval-app` 스코프 전용이다.

---

# 경미

## m1. CC 미지정에도 렌더마다 `APR_CC` 조회 1회가 추가된다
`ApprovalPagePanel.java:154-156`, `ApprovalRegionMacro.java:165-167`
```java
List<String> ccDisplayNames = ccStore.findRecipients(request.id()).stream()
        .map(key -> displayName(key, names))
        .toList();
```
조건 없이 호출된다. 스펙 변경 2가 *"ccStore.findRecipients 1회는 허용"*이라고 명시했으므로 **위반은 아니다.**
다만 승인 패널이 붙은 **모든 페이지 뷰마다** SELECT가 1회 늘고, 영역 매크로가 여러 개인 페이지는
**매크로 수만큼** 늘어난다(각 매크로가 자기 request로 개별 조회). 기존 데이터는 CC 행이 0개라 결과는 항상 빈 Set.
→ 개선안: 영역 매크로가 여러 개인 페이지는 8b의 `findRecipientsBatch`로 묶거나,
   `signatureEnabled` 패턴처럼 "CC 기능이 실제로 쓰이는지" 게이트를 두는 방법. **잔여로 기록**(FAIL 사유 아님).

## m2. 재승인 프리필이 CC 칩을 지우지 않는다
`approval.js:822-828`이 `stepList(reapproveForm).replaceChildren()`으로 결재선만 초기화한다.
같은 페이지 세션에서 CC를 추가해 두고 제출하지 않은 채 "재승인"을 누르면 이전 CC 칩이 남는다.
**다만 `requestMessage`도 동일하게 초기화되지 않으므로 기존 동작과 일관**이고,
제출 성공 시 `window.location.reload()`로 상태가 사라진다. 스펙은 "CC를 **채우지** 않는다"만 요구했다 —
D5의 "CC 미승계"(서버가 이전 요청의 CC를 읽지 않음)는 **완전히 지켜지고 있다**(8b QA에서 확인, 이번에도 무변경).
정보성으로만 기록한다.

---

# 편승 4건 (변경 4) — 전부 PASS

## N1 (qa-8c-r2) 승인 PIN 스텝 열 때 회수 스텝 닫기 — **PASS, 제안과 동일**
`approval.js:933-941`
```js
var cancelBoxOpen = approvalModal.querySelector('.dmove-approval-confirm:not(.dmove-approval-confirm--reject):not(.dmove-approval-confirm--pin)');
if (rejectBoxOpen) { rejectBoxOpen.hidden = true; }
if (cancelBoxOpen) { cancelBoxOpen.hidden = true; }
var cancelOpenButton = approvalModal.querySelector('[data-approval-cancel]');
if (cancelOpenButton) { cancelOpenButton.disabled = false; cancelOpenButton.setAttribute('aria-expanded', 'false'); }
```
`qa-8c-r2.md` N1의 제안 수정과 **문자 단위로 일치**한다(회수 버튼 `disabled`/`aria-expanded` 복구 포함).
이로써 상호 배타 매트릭스가 완성됐다:

| 여는 스텝 | 반려 닫기 | 회수 닫기 | PIN 닫기 |
|-----------|-----------|-----------|----------|
| 반려 | — | ✓ | ✓ |
| 회수 | ✓ | — | ✓ |
| 승인 PIN | ✓ | **✓ (신규)** | — |

## N2 PIN input 비우기 — **Codex 주장이 코드 레벨에서 정확하다. 실기동 관찰은 별개 원인으로 추정**

코디네이터가 "Codex 주장을 실측하라"고 지시한 항목이다. **실측 결과 Codex가 맞다.**

`approval.js:610-616` (8c에서 들어온 코드, 8d가 손대지 않음)
```js
var pin = pinInput.value; pinInput.value = ''; pinConfirm.disabled = true;
post(approveUrl, new URLSearchParams({pin: pin})).then(function () { window.location.reload(); })
    .catch(function (error) {
        pinConfirm.disabled = false;
        if (pinMessage) { pinMessage.textContent = pinErrorText(error, '승인 처리에 실패했습니다.'); }
    });
```
- `pinInput.value = ''`가 **`post()` 호출 전**에 실행된다 → 성공·실패와 무관하게 비워진다.
- `.catch`는 값을 복원하지 않는다(메시지와 버튼 상태만 건드린다).
- 즉 **403/409를 받아도 코드상 input은 반드시 빈 상태다.**

**그럼 실기동에서 왜 값이 남아 보였나 — 가장 유력한 가설: Chrome 자동완성 재채움**
N3의 전제가 바로 그것이다 — *"`off`는 Chrome이 무시하고 저장된 비밀번호를 제안한다(실기동에서 자동 채움 관찰)"*.
`type="password"` 필드를 스크립트로 비워도, 비밀번호 관리자가 재채움하는 것은 알려진 동작이다.
8c 시점의 PIN input은 `autocomplete="off"`였고, **8d의 N3가 이를 `new-password`로 바꿨다.**

→ **판정: 코드 결함 아님. N3 적용분으로 실기동 재관찰이 필요하다.**
   재관찰에서도 값이 남으면 자동완성이 아닌 다른 원인이므로 별건으로 재조사해야 한다
   (그 경우 `readonly` 토글이나 전송 후 `pinInput.blur()` 같은 추가 방어를 검토).

## N3 `autocomplete="new-password"` — **PASS, 5개 필드 전수 적용**
| 필드 | 위치 | 확인 |
|------|------|------|
| 승인 PIN 스텝 | `ApprovalMarkup.appendPinConfirmation` | `new-password` ✓ |
| 반려 스텝 PIN | `ApprovalMarkup.appendRejectConfirmation` | `new-password` ✓ |
| 내 서명 — 현재 PIN | `ApprovalInboxServlet` `data-signature-current-pin` | `new-password` ✓ |
| 내 서명 — 새 PIN | `data-signature-new-pin` | `new-password` ✓ |
| 내 서명 — 확인 PIN | `data-signature-confirm-pin` | `new-password` ✓ |

`autocomplete="off"`가 남은 PIN 필드 **0건**. `type="password" inputmode="numeric" maxlength="12"`도 전부 유지 ✓

## N4 내 서명 화면 레이아웃 — **PASS, 새 색상 0**
`ApprovalInboxServlet:161-172`에 세로 필드 블록 CSS 추가.
사용 토큰: `--rule`, `--sunk`, `--paper`, `--ink`, `--accent` — **5개 전부 같은 파일 `:121-127`의
`#dmove-approval-app` 스코프에 정의돼 있음을 확인**(M1과 달리 스코프 안이라 정상 동작).
- 기존 클래스 관례 재사용: `.dmove-approval-field`, `.dmove-approval-field__label` (마크업 관례와 동일 이름)
- `.signature-card`, `.dmove-approval-signature-preview/canvas/actions` — 카드+필드 블록 구조
- `touch-action:none`(캔버스 스크롤 방지), `width:min(100%,320px)` 반응형
- **하드코딩 색상 리터럴 0건** (`#` 색상값 추가 없음) ✓

---

# 검증 PASS 항목 (동작 추론 기준)

## 1. CC 미지정 무영향 — PASS

| 경로 | 확인 | 결과 |
|------|------|------|
| 요청 모달 | 피커는 항상 렌더(스펙 요구). 선택 0건이면 칩 목록 비고 hidden input 값 `""` | ✓ |
| 제출 | `ccKeys`/`ccGroups`가 `''`면 `if (ccKeys)`/`if (ccGroups)`가 false → **파라미터 자체 생략** → 기존 URL과 동일 | ✓ |
| 상세 모달 | `appendCc`가 `null` 또는 `isEmpty()`면 **즉시 return** → 섹션 마크업 0바이트 | ✓ |
| 업무함 기존 4탭 | TABS에 `cc` 키만 추가, 기존 4탭의 `params`·endpoint·badge 키 무변경 | ✓ |
| 배지 | `hasOwnProperty` 가드 유지 → cc 키가 안 와도 다른 배지를 0으로 덮지 않음 | ✓ |
| 기존 데이터 | APR_CC에 행이 없으면 `findRecipients`가 빈 Set → `ccDisplayNames` 빈 리스트 → 섹션 생략 | ✓ |

## 2. CC 피커 셀렉터 충돌 — **PASS (핵심 검증, 이벤트 위임 경로 전수 추적)**

| 위임 지점 | 승인자 | CC | 충돌 여부 |
|-----------|--------|-----|-----------|
| 검색 input (`input` 이벤트) | `input[name="approverSearch"]` / `approverGroupSearch` | `ccSearch` / `ccGroupSearch` | 별개 name ✓ |
| 결과 컨테이너 (`form.querySelector`) | `.dmove-approval-user-results` / `.dmove-approval-group-results` | `.dmove-approval-cc-user-results` / `.dmove-approval-cc-group-results` | **별개 클래스 토큰** ✓ |
| 결과 버튼 (`click`) | `.dmove-approval-select-user` / `-group` | `.dmove-approval-select-cc-user` / `-group` | 별개 토큰 ✓ + CC 분기가 **앞**에 위치해 조기 return ✓ |
| scope 버튼 (`click`) | `[data-approval-scope]` | `[data-approval-cc-scope]` | 아래 별도 검증 |
| scope pane | `[data-approval-scope-pane]` | `[data-approval-cc-scope-pane]` | 별개 **속성명** ✓ |
| focusin 전체목록 | `input[name="approverGroupSearch"]` | 셀렉터에 `ccGroupSearch` 추가 | 동일 UX 제공 ✓ |

**scope 버튼 — 실제로 충돌이 있었고 올바르게 해소됐다**
`appendCcField`가 만드는 CC 탭 버튼은 `class="dmove-approval-scope__btn"`을 **그대로 갖는다**(스타일 재사용 목적).
따라서 기존 핸들러의 `event.target.closest('.dmove-approval-scope__btn')`은 **CC 버튼도 잡았을 것**이다.
8d는 이를 `event.target.closest('[data-approval-scope]')`로 교체했다.
- 승인자 버튼에 `data-approval-scope`가 실제로 있음을 확인 — `ApprovalMarkup.java:325-326` ✓
  → **셀렉터 교체는 승인자 쪽에 대해 등가**이고, CC 버튼(속성이 `data-approval-cc-scope`)은 더 이상 매칭되지 않는다.
- CC 분기(`ccScopeBtn`)가 승인자 분기보다 **앞**에서 `return`하므로 이중 처리도 없다 ✓
- `closest('[data-approval-cc-scope]')`가 pane(`data-approval-cc-scope-pane`)을 잡을 위험 없음 —
  CSS 속성 셀렉터는 접두 매칭이 아니라 **정확 일치**다 ✓

**중복 추가 방지 (클라)** `addCc`(`approval.js:246-253`)
```js
var recipients = type === 'group' ? ccState(form).groups : ccState(form).users;
if (recipients.some(function (recipient) { return recipient.key === key; })) { return; }
```
user/group 배열을 분리해 각각 key 중복을 막는다 ✓ (같은 이름의 사용자와 그룹은 서로 간섭하지 않는다)
승인자로 이미 추가된 사용자를 CC에 넣는 것은 막지 않는다 — 스펙 지시대로(서버가 8b R2에서 정규화 후 제거) ✓

**상태 격리** `ccSelections = new WeakMap()` (form 키) — 한 페이지에 영역 매크로가 여러 개여도
폼별로 독립된 `{users, groups}`를 갖는다 ✓ 전역 배열이었다면 매크로 간 오염이 났을 구조다.

**제출 조립** `approval.js:1021-1028`
```js
var ccKeys = (form.elements.ccKeys.value || '').trim();
var ccGroups = (form.elements.ccGroups.value || '').trim();
if (ccKeys)   { url += '&ccKeys='   + encodeURIComponent(ccKeys); }
if (ccGroups) { url += '&ccGroups=' + encodeURIComponent(ccGroups); }
```
CSV 조립은 `syncCc`의 `.map(...).join(',')` ✓, 인코딩 ✓, 비면 생략 ✓, 기존 파라미터 순서 무변경 ✓.
`form.elements.ccKeys`가 없어 TypeError가 날 위험 — `appendCcField`가 `appendRequestForm`에서
**무조건** 호출되므로 모든 요청 폼에 존재한다. 업무함에는 `.dmove-approval-request` 폼이 0건이라
이 핸들러가 그쪽에서 발화하지 않는다 ✓ (approval.js는 `atl.general` 컨텍스트라 업무함에도 로드된다)

## 3. 참조 탭 — PASS
- `NavMarkup:212` — "내 요청" 아래·"처리한 건" 위에 `appendInboxItem(..., "cc", "참조", ICON_CC, false, false)` ✓
  `ICON_CC`는 기존 ICON_* 상수와 동일 스타일(20×20 viewBox, `stroke='currentColor'`, `stroke-width='1.6'`) ✓
  배지 인자 `false` = 배지 표시 안 함... **아니다** — 4번째 인자가 배지 여부다.
  `myturn`만 `true`이고 `waiting`/`requested`/`done`/`cc` 전부 `false`로 **기존 탭들과 동일** ✓
- `TABS.cc = {label:"참조", empty:"참조로 지정된 결재가 없습니다."}` + `TABS.cc.params = {}` —
  `requested`와 동일 구조 ✓
- endpoint 3분기 `currentView === "cc" ? "/mine/cc" : currentView === "requested" ? "/mine/requested" : "/mine"` ✓
- badge 키맵 `{..., requested: "requested", cc: "cc"}` ✓
- **부팅 배지 규칙** — `requested` 패턴을 정확히 확장:
  `if ((view === "requested" || view === "cc") && !hasOwnProperty(badges, "myTurn")) loadBadges();`
  주석도 "/mine/requested와 /mine/cc의 badges에는…"으로 갱신 ✓
- 행 렌더·필터·칩·페이징은 공통 경로 재사용(수정 0) ✓ — `/mine/cc` 응답이 `mineResponse` 산출이라 같은 형태(8b에서 확인)
- 목록 행에 `cc`를 렌더하지 않음 — `detail(row)` 무수정 ✓ (8b가 `cc[]`를 단건 GET에만 넣었으므로 목록 행엔 애초에 없다)

## 4. 상세 참조자 섹션 — PASS
- `appendCc`(`ApprovalMarkup:400-414`): 빈/`null`이면 생략, `escape()` 적용, `, ` 구분 ✓
- 배치 위치: `appendRequestMessage` **뒤**, "승인 순서와 결정" 섹션 **앞** — 스펙대로 ✓
- 파라미터는 **시그니처 끝에만 추가** → 테스트 수정이 `null` 1개 추가로 끝났다 ✓
- 호출부 2곳(`ApprovalPagePanel:192-196`, `ApprovalRegionMacro:216-220`) + 테스트 2곳 정합, C10 compile SUCCESS ✓
- **displayName은 기존 `names` 캐시 Map을 공유** — CC 이름 해석에 별도 조회 캐시를 만들지 않고
  승인자 이름 해석과 같은 Map을 쓴다 → 같은 사람이 승인자이자 CC면 조회 1회 ✓
- `ccStore.findRecipients` 호출은 렌더당 **1회**(스펙 상한 준수) ✓ — 단 m1 참조

## 5. 8c 결과 회귀 스팟체크 — 되돌림 없음

| 8c 확정 항목 | 재확인 | 결과 |
|--------------|--------|------|
| 반려 확정의 `confirmModal` 기준(8c 치명 수정) | `approval.js` 해당 줄 무변경 | 유지 ✓ |
| `pinErrorText` 접두 제거 | 무변경, 승인·반려 양쪽 유지 | 유지 ✓ |
| ESC PIN 분기 / `closeModal` PIN 리셋 | 무변경 | 유지 ✓ |
| 도장 CSS 하드코딩(8c R4) | `.dmove-approval-stamp--auto/--image` 무변경, var() 없음 | 유지 ✓ |
| 서명 업로드 메시지 분리(8c R5) | `ApprovalRestResource` 8d 변경 0 | 유지 ✓ |
| PIN 클라 검증 `\S{4,12}` (8c R6) | `ApprovalInboxServlet` 유지 확인 | 유지 ✓ |
| 업로드 mime 클라 검증 | 유지 | ✓ |
| `signature` 뷰 전환(`data-tab` 미출력) | `NavMarkup` 무변경, 테스트 유지 | 유지 ✓ |
| pin이 query에 유입 안 됨 | `grep "pin="` → 0건 | 유지 ✓ |

---

# Codex 재작업 지시문 초안 (`spec-8d2-rework.md`)

> # 배치 8d 재작업 — QA FAIL 수정 (중대 1건, 2줄)
>
> 너는 이 저장소의 구현 담당이다. **아래 1건만 고쳐라. 다른 코드를 건드리지 마라.**
> 원 스펙 `_workspace/spec-8d-cc-ui.md`의 금지 목록이 그대로 적용된다.
>
> ## R1 (중대) CC 칩 CSS가 패널·매크로에서 무효 — `approval.css:634, 636`
>
> `.dmove-approval-cc-chip`이 `var(--rule)`·`var(--sunk)`를 참조하는데,
> **`approval.css`에는 CSS 커스텀 속성이 하나도 정의돼 있지 않다**(정의 개수 0, 실측).
> 그 토큰들은 `ApprovalInboxServlet` TEMPLATE의 `#dmove-approval-app` 스코프 전용이다.
>
> CC 칩이 들어가는 요청 모달은 **패널·영역 매크로에서만** 렌더된다
> (`ApprovalInboxServlet`에 `.dmove-approval-request` 폼은 0건). 따라서 토큰이 상속될 경로가 없고,
> `border` 단축은 var가 invalid이면 **선언 전체가 무효**가 되어 테두리가 통째로 사라진다.
> 결과적으로 칩이 배경·테두리 없는 맨 텍스트로 보인다.
>
> **이것은 배치 8c에서 이미 잡아 고쳤던 결함과 같은 유형이다**
> (qa-8c M3 → 8c4-rework R4에서 `.dmove-approval-stamp`의 var()를 전부 하드코딩으로 바꿨다).
> 8d 스펙 변경 1이 "`--sunk` 배경, `--rule` 테두리"라고 적은 것이 오도했다 — 그 문구를 따르지 마라.
>
> 이 파일의 기존 관례(하드코딩)로 바꿔라. **새 색상 값은 쓰지 마라** — 아래 두 값은 이미 이 파일에 있다
> (테두리 `#dfe1e6`: `:205, :237, :366, :551` / 옅은 배경 `#ebecf0`: `:327`).
> ```css
>     border: 1px solid #dfe1e6;
>     background: #ebecf0;
> ```
> 수정 후 `grep -c "var(--" approval-confluence9/src/main/resources/css/approval.css`가
> **0**이 되는지 확인해서 보고하라.
>
> ## 게이트 (실행하고 "Tests run:" 줄을 그대로 인용)
> ```
> set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
> ```
> **현재 C9 테스트는 112건이다.** CSS만 바뀌므로 112 유지가 정상이다.

---

# 코디데이터에게

## 1. 재발 방지 (권고)
`approval-ui-style` 스킬에 한 줄을 넣어 두면 8e·8.5에서 같은 사고가 반복되지 않는다:
> **`approval.css`(패널·매크로용)에는 CSS 커스텀 속성이 정의돼 있지 않다.** `var(--…)` 금지 —
> 하드코딩 색을 재사용하라(테두리 `#dfe1e6`, 옅은 배경 `#ebecf0`, 승인 `#216e4e`, 반려 `#ae2e24`).
> `--paper/--rule/--sunk/--ink/--accent/--approved/--sans`는 업무함·설정 **서블릿 TEMPLATE**의
> `#dmove-approval-app` 스코프 전용이며, 서블릿 안에서는 정상 동작한다.

두 배치 연속으로 스펙 문구가 이 함정을 유도했다(8c 금지 9, 8d 변경 1). 스펙에 토큰 이름을 예시로 쓸 때
**어느 스타일시트인지** 명시하는 것이 근본 해법이다.

## 2. N2 실기동 재관찰 요청
"승인 PIN 스텝에서 403/409 후 input이 안 비워진다"는 관찰은 **코드상 재현되지 않는다**
(`post()` 호출 전에 비운다 — 위 N2 분석 참조). N3의 `autocomplete="new-password"`가 적용된
이번 빌드에서 **같은 동선을 다시 밟아 주기 바란다.**
- 해소됐다면 원인은 Chrome 자동완성이었고 N3로 끝난 것이다.
- 여전히 값이 남는다면 자동완성이 아닌 다른 원인이므로 별건으로 재조사가 필요하다.

## 3. 실기동 확인 목록 (R1 수정 후)
1. **CC 미지정 무영향** — 요청 모달에서 CC를 건드리지 않고 요청 생성 → 기존과 동일하게 동작하는지.
   상세 모달에 "참조" 섹션이 **뜨지 않는지**. 업무함 기존 4탭 정상.
2. **CC 피커** — 사용자/그룹 탭 전환, 검색 결과 클릭 추가, 칩 표시(**R1 수정 후 테두리·배경이 보여야 한다**),
   × 제거, 같은 사람 두 번 추가 차단. **승인자 검색과 CC 검색이 서로의 결과를 오염시키지 않는지**
   (한 화면에서 둘 다 검색해 볼 것 — 이번 배치 최대 위험 지점이었다).
3. **참조 탭** — CC로 지정된 계정으로 로그인 → 사이드바 "참조" → 목록·배지·빈 상태 문구.
   다른 탭으로 이동했다 돌아왔을 때 배지가 0으로 덮이지 않는지.
4. **상세 참조자 섹션** — CC 있는 요청의 패널·매크로 상세 모달에 "참조" 섹션이 이름 나열로 뜨는지.
5. **편승 N1** — 요청자 본인이 승인자인 요청에서 회수 스텝을 연 뒤 승인 클릭 →
   회수 스텝이 닫히고 PIN 스텝만 열리는지(qa-8c-r2 N1의 재현 시나리오).
6. **편승 N4** — 내 서명 화면 카드 정렬.

## 4. 잔여 (backlog 후보)
- m1: 패널·매크로의 CC 조회를 배치화하거나 게이트 추가.
- 8a~8c 이월분: CC 저장소·`/mine/cc`·`cc[]` JSON 테스트 0건, CC 테스트 파일 분리,
  "CC actor 제외" assert 격리, `ccJoins` O(E²), 단건 응답당 CC 조회 2회.
