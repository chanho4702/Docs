# QA 8c — 전자서명·PIN UI 검증 (2026-08-13)

대상 스펙: `_workspace/spec-8c-signature-ui.md` + `spec-8c2-continuation.md` + `spec-8c3-final.md`
설계: `_workspace/design-batch8.md` (D2, D9, D10)
기준 커밋: `24862fe` (`git diff HEAD` = 8c 순수 변경분). 코디네이터 직접 수정분은 `e57169a`로 커밋 완료.
검증자: approval-qa (독립 실행). Codex 완료 보고는 신뢰하지 않고 게이트를 직접 재실행함.

## verdict: **FAIL**

| 심각도 | 건수 |
|--------|------|
| 치명 | **1** |
| 중대 | 3 |
| 경미 | 4 |

치명 1건은 **기본 설정(signatureEnabled=false)에서 반려 확정 버튼이 JS 런타임 오류로 완전히 죽는** 회귀다.
최우선 요구인 "off 무영향"을 정면으로 위반하며, 8b까지 정상 동작하던 기능이 8c로 깨졌다.
Java 테스트 111건 그린·`node --check` 통과와 **무관한** DOM 런타임 오류라 게이트가 구조적으로 잡을 수 없다.

---

## 게이트 재실행 결과 (직접 실행)

```
JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
mvn -B -pl approval-confluence9 -am test  → Tests run: 111, Failures: 0, Errors: 0 / BUILD SUCCESS
mvn -B -pl approval-confluence10 compile  → BUILD SUCCESS
```
**111 확인** (8b 109 → +2). 증가분 소재: `ApprovalMarkupCancelTest` 4→5, `ApprovalInboxServletRenderTest` 8→9.
(`ApprovalRestResourceSettingsTest`는 2건 유지 — 변경 7의 케이스가 기존 메서드에 시나리오로 추가됐다. 아래 PASS 항목 참조.)

## 서블릿 JS 문법 검증 (배치 7 관례, node)

TEMPLATE text block을 추출 → Java escape 해제(`\"`, `\\`) → `__TOKEN__` 치환 → `<script>` 블록 분리 후 `node --check`:
```
inbox:    script 블록 2개, 템플릿 52,231자   → inbox-0.js OK, inbox-1.js OK
settings: script 블록 2개, 템플릿 27,285자   → settings-0.js OK, settings-1.js OK
approval.js (일반 파일)                      → OK
```
- **Sitemesh 함정 0건** — 두 서블릿의 `<style>` 블록 CSS 주석에 태그형 꺾쇠(`<tag`) 없음.
- **미치환 토큰 0건** — `__..__` 잔존 없음. 신규 토큰 `USER_DISPLAY_NAME`·`SIGNATURE_ENABLED`·`SIGNATURE_PIN_REQUIRED`가 `TOKEN` 정규식(:32)에 정확히 등록됨.
- `/^\\d{4,12}$/`가 text block에서 `/^\d{4,12}$/`로 렌더됨을 확인 — 금지 4(이스케이프 두 배) 준수.

## 재포매팅·압축 검사 (PASS)

`git diff HEAD --numstat` 전수. 총 **347 insertions / 24 deletions**(코드 파일 기준), 삭제 24줄 전수 확인:

| 파일 | +/- | 삭제 내역 |
|------|-----|-----------|
| ApprovalMarkup | 38/9 | Javadoc 2줄→1줄 병합, 시그니처·호출부 교체 7줄 |
| ApprovalRegionMacro | 57/4 | 생성자 3줄 재작성, `null` → resolver 1줄 |
| ApprovalPagePanel | 55/1 | `null` → resolver 1줄 |
| ApprovalInboxServlet | 54/5 | TOKEN 정규식·render 시그니처·body 태그·activate 1줄·부팅 view 1줄 |
| ApprovalRestResource | 1/1 | catch 메시지 문구 1줄 |
| NavMarkup | 6/1 | `if (!notification)` 조건 확장 1줄 |
| approval.js | 41/3 | `post()` 시그니처 2줄, reject post 호출 1줄 |
| approval.css | 3/0 | 없음 |

**코디네이터 직접 수정분 보존 확인** — `e57169a`가 넣은 `#title-heading` 숨김·사이드바 풀하이트·아이콘 간격은
전부 HEAD에 있고 8c diff에 **삭제가 한 줄도 없다**(css 3/0, 서블릿 삭제분은 전부 8c 자체 교체분).
한 줄 압축·주석 삭제 없음.

---

# 치명

## C1. 반려 확정 버튼이 TypeError로 완전 파손 — **기본(off) 구성 포함**

**파일:줄** `approval-confluence9/src/main/resources/js/approval.js:567`

```js
post(restBase() + '/' + encodeURIComponent(rejectContainer.dataset.approvalRequestId)
    + '/reject?actorKey=' + encodeURIComponent(rejectContainer.dataset.approvalActorKey || '')
    + '&reason=' + encodeURIComponent(reason),
    rejectContainer.closest('.dmove-approval-modal').dataset.approvalPinRequired === '1'
        ? new URLSearchParams({pin: rejectPin}) : undefined)
```

**문제 — `rejectContainer.closest('.dmove-approval-modal')`는 항상 `null`이다**

1. `rejectContainer = approvalContainer(rejectConfirmButton)` 이고,
   `approvalContainer`(`approval.js:10-12`)는
   `element.closest('.dmove-approval-page-panel, .dmove-approval-region')` —
   즉 **패널/영역 컨테이너**를 돌려준다.
2. 상세 모달은 그 컨테이너의 **자손**이다. 실측:
   - `ApprovalPagePanel.render`: `openPanel(html, ...)`(`:284` `<div class="dmove-approval-page-panel"`)
     → `ApprovalMarkup.detailDialog(...)` → `requestDialog(...)` → `html.append("</div>")`(`:197`)
   - `ApprovalRegionMacro`: `openRegion(...)` → `detailDialog(...)` → 동일 구조
3. `Element.closest()`는 **자기 자신과 조상만** 탐색한다. 패널 컨테이너는 모달의 조상이므로
   거기서 `.dmove-approval-modal`을 찾으면 **null**.
4. `null.dataset` → **`TypeError: Cannot read properties of null (reading 'dataset')`**
   → 핸들러가 그 자리에서 중단, `post()`는 **호출되지 않는다**.

**영향 범위가 전 구성이다**
이 표현식은 `post(...)`의 **두 번째 인자**라 `pinRequired` 값과 무관하게 **항상 평가된다**.
따라서 `signatureEnabled=false`(기본값, 전자서명 미사용 조직)에서도 **반려가 전혀 되지 않는다.**
사용자에게는 "반려 확정"을 눌러도 아무 일도 일어나지 않는 것으로 보인다(버튼은 `disabled=true`로 굳고
메시지도 뜨지 않는다 — `post` 앞에서 죽어 `.catch`가 실행되지 않기 때문).

**같은 파일의 올바른 패턴과 대조**
바로 아래 PIN 핸들러(`:585`)는 `pinConfirm.closest('.dmove-approval-modal')` — **버튼**에서 시작해
위로 올라가므로 모달을 정확히 찾는다. 반려 핸들러도 이미 같은 값을 `confirmModal`(`:552`)로
**선언해 두고 있으면서** 엉뚱하게 `rejectContainer`를 썼다.

**게이트가 못 잡은 이유**
`approval.js`는 Java 단위 테스트 대상이 아니고, `node --check`는 문법만 본다(문법은 정상 — 직접 확인).
DOM 런타임 오류라 111건 그린과 아무 관계가 없다. 화면 테스트로만 드러난다.

**제안 수정** (`approval.js:567`)
```js
    + '&reason=' + encodeURIComponent(reason),
    confirmModal && confirmModal.dataset.approvalPinRequired === '1'
        ? new URLSearchParams({pin: rejectPin}) : undefined)
```
`confirmModal`은 `:552`에 이미 선언돼 있다. null 가드(`confirmModal &&`)를 반드시 함께 넣을 것.

---

# 중대

## M1. PIN 오류 접두를 떼지 않아 내부 코드가 사용자에게 노출된다

**파일:줄** `approval.js:47-52`(`post`), `:569`(반려), `:595`(승인 PIN)

스펙 변경 4 요구:
> 응답 본문이 `PIN_NOT_SET:`/`PIN_INVALID:`/`PIN_LOCKED:`로 시작하면 **접두를 떼고** 스텝 내 메시지 영역에 표시

구현은 `post()`가 응답 본문을 그대로 `error.body`에 담고(`:49-51`), 두 핸들러가
`(error && error.body)`를 그대로 출력한다. 접두 제거 로직이 **어디에도 없다**(전수 grep).

**결과** — 서버가 8a에서 정한 본문(`ApprovalRestResource:1224-1240`)이 날것으로 표시된다:
- `PIN_INVALID:PIN이 올바르지 않습니다. 남은 시도 4회`
- `PIN_LOCKED:잘못된 시도가 반복되어 15분간 잠겼습니다.`
- `PIN_NOT_SET:서명 PIN이 등록되어 있지 않습니다. 업무함 > 내 서명에서 등록하세요.`

접두는 클라이언트가 코드를 구분하라고 붙인 것이지 사용자에게 보이라고 만든 게 아니다.

**제안 수정** — 공용 헬퍼 1개를 추가하고 두 핸들러에서 사용:
```js
function pinErrorText(error, fallback) {
    var body = (error && error.body) || '';
    var match = /^(PIN_NOT_SET|PIN_INVALID|PIN_LOCKED):([\s\S]*)$/.exec(body);
    return match ? match[2] : (body || fallback);
}
```

## M2. PIN 스텝의 상호 배타·ESC·닫기 리셋 미구현 — 스텝 상태가 누수된다

스펙 변경 4: *"기존 반려/회수 스텝과 동일한 상호 배타·ESC 우선순위 규칙"*. 네 지점 모두 미이행.

**(a) ESC가 PIN 스텝을 닫지 못하고 엉뚱한 버튼을 누른다** (`approval.js:792-812`)
```js
var confirm = open.querySelector('.dmove-approval-confirm:not([hidden])');   // = PIN 박스
if (confirm) {
    if (confirm.classList.contains('dmove-approval-confirm--reject')) { ...reject-abort 클릭...; return; }
    var back = open.querySelector('[data-approval-cancel-back]');            // 회수 스텝의 '돌아가기'
    if (back) { back.click(); }                                             // ← 회수 스텝 버튼을 누른다
    return;                                                                  // ← PIN 스텝은 그대로, 모달도 안 닫힘
}
```
`[data-approval-pin-back]` 분기가 없다. PIN 스텝이 열린 상태에서 ESC는
canCancel이면 **회수 스텝 버튼을 클릭**하고, 아니면 **아무 일도 하지 않는다**(모달조차 안 닫힘).

**(b) 회수 스텝을 열어도 PIN 스텝이 안 닫힌다** (`:599-607`)
`.dmove-approval-confirm--reject`만 `hidden = true`로 만든다. PIN 박스는 열린 채 → 두 스텝이 겹쳐 표시.

**(c) 반려 스텝을 열 때 PIN 스텝이 안 닫힐 수 있다** (`:531`)
```js
var cancelConfirm = rejectModal.querySelector('.dmove-approval-confirm:not(.dmove-approval-confirm--reject)');
```
`querySelector`는 **DOM 순서상 첫 매치**를 준다. `detailDialog`의 렌더 순서는
`appendCancelConfirmation`(`ApprovalMarkup:505`, 수식어 없는 plain `.dmove-approval-confirm`)
→ `appendRejectConfirmation` → `appendPinConfirmation`.
따라서 **canCancel일 때 회수 박스가 선택되고 PIN 박스는 숨겨지지 않는다**
(요청자가 동시에 승인자인 흔한 경우). canCancel이 아닐 때만 우연히 PIN 박스가 잡혀 동작한다.

**(d) 모달을 닫아도 PIN 스텝과 승인 버튼 상태가 리셋되지 않는다** (`:415-437`)
`closeModal`은 `.dmove-approval-confirm` 첫 매치와 `.dmove-approval-confirm--reject`만 리셋한다.
PIN 박스는 대상이 아니고, 승인 클릭 시 걸린 `button.disabled = true`(`:777`)도 해제되지 않는다
(`data-approval-pin-back`을 눌러야만 풀린다).
→ **승인 클릭 → PIN 스텝 열림 → ESC/닫기로 모달 종료 → 다시 열면 PIN 스텝이 열린 채 승인 버튼이 비활성.**
사용자가 "돌아가기"를 찾아 누르기 전까지 승인 동선이 막힌다.

**제안 수정**
- ESC 핸들러에 PIN 분기 추가: `confirm.classList.contains('dmove-approval-confirm--pin')`이면
  `[data-approval-pin-back]`을 클릭하고 return.
- 회수 열기·반려 열기 양쪽에서 PIN 박스를 명시적으로 `hidden = true` 처리
  (`:531`의 `:not(--reject)` 셀렉터에 의존하지 말고 `querySelector('.dmove-approval-confirm--pin')`을 따로 잡을 것).
- `closeModal`에 PIN 박스 리셋 블록 추가: `hidden = true`, 메시지 비우기, PIN input 비우기,
  `[data-approval-action="approve"]`의 `disabled = false`.

## M3. 자동 도장 CSS가 패널·매크로에서 전부 무효 — 정의되지 않은 커스텀 속성 사용

**파일:줄** `approval-confluence9/src/main/resources/css/approval.css:803, 805`
```css
.dmove-approval-stamp--auto { ... background:var(--approved-bg); color:var(--approved); font:700 12px/1 var(--sans); ... }
.dmove-approval-pin-message:not(:empty) { ... color:var(--rejected); }
```

**실측**
- `approval.css` 전체에 **커스텀 속성 정의가 0개**다(`^\s*--[a-z-]+:` 전수 grep → 0건).
- 파일 전체의 `var()` 사용은 **8c가 추가한 이 2줄이 전부**다(`grep -c "var(--"` → 2).
- 기존 관례는 하드코딩이다: 승인 `#216e4e`(`:71-72, :105, :701, :771`), 반려 `#ae2e24`(`:800-802`).
- `--approved`/`--approved-bg`/`--rejected`/`--sans`는 `ApprovalInboxServlet` TEMPLATE의
  `#dmove-approval-app` 스코프(`:121-127`)에만 정의돼 있다.

**결과**
- **업무함 상세**: 도장이 `#dmove-approval-app` 안에 렌더되므로 토큰이 상속돼 **정상** ✓
  (`approval.css`는 `atl.general` 컨텍스트 web-resource이고 업무함 서블릿도 `<meta decorator="atl.general">`이라 로드된다 — 확인함).
- **Confluence 콘텐츠 페이지의 패널·매크로 상세 모달**: 그 스코프 밖이라 **전부 무효**
  - `background: var(--approved-bg)` 무효 → 배경 없음
  - `color: var(--approved)` 무효 → 본문 색 상속 → `border: 1.5px solid currentColor`도 회색
  - **`font: 700 12px/1 var(--sans)` — var가 invalid이면 그 선언이 invalid at computed-value time이 되어
    단축 속성의 모든 롱핸드(font-weight 700, font-size 12px 포함)가 날아간다.**
→ 설계 D2가 요구한 "`--approved` 색 원형 도장"이 **회색 원 + 상속 폰트**로 렌더된다.
   `appendSteps`가 D2의 주 렌더 지점이므로 기능의 핵심 시각 요소가 의도대로 나오지 않는다.

(스펙 금지 9가 `--approved`를 "기존 토큰" 예시로 든 것이 오도했다 — 그 토큰은 서블릿 스코프 전용이다.)

**제안 수정** — `approval.css`의 기존 하드코딩 관례를 따르고 `font` 단축을 롱핸드로 분리:
```css
.dmove-approval-stamp--auto { display:inline-flex; width:34px; height:34px; margin-left:6px;
  align-items:center; justify-content:center; border:1.5px solid #216e4e; border-radius:50%;
  background:#dcfff1; color:#216e4e; font-weight:700; font-size:12px; line-height:1;
  vertical-align:middle; white-space:nowrap; transform:rotate(-6deg); }
.dmove-approval-pin-message:not(:empty) { display:block; margin-top:8px; color:#ae2e24; }
```
(`#dcfff1`는 기존 `.dmove-approval-pill--approved`(`:701`)의 배경색 재사용 — 새 색상 추가 아님.)

---

# 경미

## m1. 변경 7의 "형식 오류 메시지 분리"가 실제 증상을 고치지 않았다
`ApprovalRestResource.java:963-969`는 **크기 초과·크기 하한(8바이트 미만)·PNG/JPEG 매직바이트 불일치**를
하나의 조건문에 묶어 전부 `"서명 이미지는 50KB 이하여야 합니다."`로 응답한다.
8c는 그 아래 `catch (IllegalArgumentException)`(`:973`)의 문구만
`"서명 이미지 형식이..."` → `"서명 데이터 형식이..."`로 바꿨는데, **그 블록은 원래도 형식 메시지였다**.
→ PNG가 아닌 파일을 올리면 여전히 "50KB 이하여야 합니다"가 뜬다. qa-8a2 N2의 증상 **미해소**.
(스펙 변경 7이 원인을 "base64 디코드 실패"로 잘못 기술한 탓 — Codex는 스펙 문구를 그대로 따랐다.)

## m2. 내 서명 화면의 PIN 검증이 서버보다 엄격하다 (`\d` vs `\S`)
`ApprovalInboxServlet` PIN 저장 핸들러: `/^\d{4,12}$/`.
서버 `ApprovalPinService.validate`는 `\S{4,12}` — 설계 D4가 "숫자 강제 안 함"으로 정한 규칙이다.
→ 영문 섞인 PIN은 화면에서 등록 불가하지만 서버는 허용. 한쪽으로 통일할 것
(도장 UI가 `inputmode="numeric"`이므로 숫자 정책으로 통일하려면 서버 `validate`도 함께 바꿔야 한다).

## m3. 파일 업로드가 `file.type`을 검증 없이 mime으로 보낸다
`accept="image/png,image/jpeg"`는 파일 선택 대화상자의 힌트일 뿐 우회 가능하고,
클라 검증은 크기(50KB)만 한다. GIF 등을 고르면 서버 400으로 막히지만
m1 때문에 메시지가 "50KB 이하"로 나와 사용자가 원인을 오해한다.
클라에서 `image/png`·`image/jpeg`만 통과시키면 정확해진다.

## m4. 반려 흐름의 PIN input 비우기가 실패 경로에만 있다
승인 PIN 스텝은 전송 직전 `pinInput.value = ''`(`:594`)로 즉시 비우지만,
반려는 `.catch` 안에서만 비운다(`:568`). 성공 시 `location.reload()`라 실질 피해는 없으나
스펙 변경 4 "전송 직후 PIN input 값은 비운다"와 어긋난다.

---

# 검증 PASS 항목 (동작 추론 기준)

## off 무영향 — **부분 PASS** (C1 제외)

| 경로 | 확인 내용 | 결과 |
|------|-----------|------|
| 설정 화면 | 체크박스 2개는 신규 섹션에만 추가, 기존 필드·onsubmit 키 무변경. 8a에서 blank 허용이라 REST 회귀 없음 | ✓ |
| 상세 모달 마크업 | `pinRequired=false`면 `appendPinConfirmation` 미호출, 반려 스텝의 PIN 필드도 미출력 | ✓ |
| 패널/매크로 렌더 | `settings.signatureEnabled()`가 false면 resolver = `null` → `appendSteps`의 도장 분기 자체가 실행 안 됨. `signatureStore` 조회 **0회** | ✓ |
| 업무함 | `view=signature`는 별도 뷰. `activate()`가 `signaturePanel.hidden = !signature`로 매번 세팅, off면 안내 문구만 | ✓ |
| approval.js 승인 폴스루 | `approvalModal.dataset.approvalPinRequired === '1'`이 false → 기존 URL 조립으로 즉시 POST. **`data-approval-pin-required="0"`이 항상 출력되지만 JS는 `'1'`만 검사** | ✓ |
| approval.js 반려 | — | **✗ C1** |

(`data-approval-pin-required="0"` 속성이 off에서도 출력되는 것은 스펙 변경 4가 `1|0` 출력을 명시적으로
요구했으므로 의도된 동작이다. JS가 `'1'`만 보므로 동작 영향 없음.)

## PIN 전송 경로 — PASS (**pin이 query에 유입되지 않는다**)
- 승인: `approveUrl`은 `.../approve?actorKey=...`만, pin은 `new URLSearchParams({pin: pin})`로 **body**(`:593-595`)
- 반려: `.../reject?actorKey=...&reason=...`, pin은 body(`:567`)
- 내 서명 화면: `signatureRequest`가 `body: new URLSearchParams(body)`(`:950`)
- **전수 grep 결과 URL 조립 문자열에 `pin=`이 들어가는 곳 0건** ✓
- HEAD(`24862fe`)가 `@FormParam` → `formOnlyParam(httpRequest, "pin")`으로 바꾼 서버 계약과 정합 ✓
  (`formOnlyParam`은 form body만 읽으므로 query 유입 자체가 차단된다)
- PIN input: `type="password" inputmode="numeric" autocomplete="off" maxlength="12"` — 금지 7 준수 ✓
- 콘솔·로그에 PIN 출력 없음(전수 확인) ✓

## 반려 흐름 스텝 2중첩 없음 — PASS
`appendRejectConfirmation`이 `pinRequired`일 때 사유 textarea **아래에 PIN 필드를 같은 섹션 안에** 추가하고
기존 "반려 확정" 버튼이 그대로 PIN까지 실어 보낸다(`approval.js:557-558`). 별도 스텝을 만들지 않았다 ✓
(설계 D10 "스텝 2중첩을 피한다" 준수.)

## 리졸버 연결 (변경 3 / 8c3 잔여 1) — PASS
- **패널 싱글턴 필드 캐시 금지 준수 ✓** — `Map<String, SignatureRef> signatures = new HashMap<>()`가
  `ApprovalPagePanel.render` **메서드 로컬**(`:150`), 매크로도 동일(`:164`). 필드는 stateless 저장소 참조뿐.
- `settings.signatureEnabled()`일 때만 생성, off면 `null` ✓
- `computeIfAbsent`로 렌더 1회 범위 캐시 ✓ (`SignatureRef`는 항상 non-null이라 금지 5의 null 마커 문제 무관)
- userKey 정규화 순서 = `getUserByKey` → 실패 시 `getUserByName` — 기존 `displayName` 관례와 동일 ✓
- `URLEncoder.encode(actorKey, StandardCharsets.UTF_8)` ✓ (8a QA R3에서 잡은 항목 유지)
- contextPath는 `ComponentLocator.getComponent(HttpContext.class)` — 하드코딩 아님, null 가드 있음 ✓
- 8a QA R4가 정한 "REST JSON은 상대 경로" 계약과 충돌 없음 — 서버 렌더 경로는 자체적으로 contextPath를 붙인다 ✓

## 상세 모달 도장 렌더 (변경 2) — PASS (스타일은 M3)
- `signatureResolver != null && decision != null && decision.type() == APPROVE`일 때만 ✓
- image / auto 분기 ✓, `escape()` 적용 ✓
- 축약 이름: `displayName.length() <= 2 ? displayName : 마지막 2자` ✓ (1자면 그대로)
- `aria-hidden="true"` ✓ (결정 텍스트가 이미 스크린리더에 노출됨)
- **`appendTimeline` 무수정 ✓** (설계 결정 준수 — diff에 없음)
- Javadoc 2블록 → 1블록 병합 ✓ (qa-8b2 N1 해소, `SignatureRef` record는 Javadoc 위 유지)

## 업무함 상세 도장 (변경 6) — PASS
`ApprovalInboxServlet:521-529`
- `x.signature && x.type === "APPROVE"` 가드 ✓
- **`stamp.src = (root.dataset.contextPath || "") + x.signature.imageUrl`** — 상대 경로에 contextPath 결합 ✓
  (8a QA R4의 미반영 잔여였던 항목이 여기서 정확히 처리됐다)
- `el()` 헬퍼 + DOM API 사용이라 문자열 주입 없음 = escape 문제 원천 차단 ✓
- auto 도장 `name.length > 2 ? name.slice(-2) : name` ✓

## 내 서명 화면 (변경 5) — PASS (m2/m3 제외)
- `__SIGNATURE_ENABLED__` 토큰 주입 + `TOKEN` 정규식 등록 ✓, off면 안내 문구만 노출(`disabled.hidden = enabled`) ✓
- 캔버스 pointer events(`pointerdown`/`move`/`up` + `setPointerCapture`) ✓, 펜 2.5px `lineCap round` ✓
- **빈 캔버스 저장 차단 ✓** — `hasDrawing` 플래그, 미그림이면 "그린 서명이 없습니다." 메시지 후 return
- 50KB 클라 검증 ✓ (`file.size > 51200`)
- PIN 2회 일치 + 4~12자 클라 검증 ✓, `pinSet`이면 "현재 PIN" 필드 노출(`current.hidden = !value.pinSet`) ✓
- `signaturePinRequired && !pinSet`일 때 안내 배너 ✓ (`notice.hidden = !(...)`)
- 삭제는 인라인 버튼 — `confirm()` 미사용 ✓
- `escape()`로 토큰 주입(`values.put("USER_DISPLAY_NAME", escape(name))`) ✓
- 직접 `.onclick`/`.onchange` 바인딩은 이 서블릿의 **기존 관례**와 일치(금지 10은 `approval.js` 대상) ✓
- 사이드바 전환: `NavMarkup`이 `signature`에 `data-tab`을 붙이지 않고 `data-view`만 출력(`:237-241`),
  `activate()`가 `initSignature(); writeUrl(); return;`으로 목록 로드 없이 전환 ✓ (8c3 잔여 2 충족)

## 신규 테스트 2건 — 형식적이지 않음
**`ApprovalMarkupCancelTest.승인_결정은_등록_여부에_따라_이미지와_자동_도장으로_렌더된다`**
- 실제 `detailDialog`를 두 번 호출(resolver가 image / auto를 각각 반환)해 HTML을 비교
- `assertTrue(image.contains("src=\"...actorKey=approver\""))` — URL 조립까지 고정
- **`assertFalse(image.contains("--auto"))` / `assertFalse(auto.contains("--image"))`** — 분기 상호 배타를 양방향 검증
- `assertTrue(auto.contains(">승인</span>"))` — nameResolver가 "김승인"이므로 **마지막 2자 축약 규칙**을 정확히 겨냥
- `ApprovalRequest.restore(...)`로 APPROVE 결정이 실제로 있는 요청을 만든다(스텁 조작 아님) ✓

**`ApprovalInboxServletRenderTest.내_서명은_일반_탭과_분리된_사이드바_뷰로_전환된다`**
- `data-view='signature'` 존재 + **`data-view='signature' data-tab='signature'` 부재**를 함께 검증 —
  "탭이 아니라 뷰"라는 계약을 양방향으로 고정 ✓
- `view === "notifications" || view === "signature"`, `signaturePanel.hidden = !signature`,
  `initSignature(); writeUrl();` — 전환 로직 3개 지점을 문자열로 고정
- 기존 시각 테스트에 `id="view-signature"`·`data-signature-canvas` assert 추가
- (JS 소스 문자열 매칭이라 리팩터링에 취약하지만, 이 저장소 서블릿 렌더 테스트의 기존 관례 그대로다)

## 변경 7 잔여 편승 — 테스트는 PASS
`ApprovalRestResourceSettingsTest`는 테스트 **개수**는 2로 유지하면서 기존 메서드에 시나리오 2개를 덧붙였다:
- **`"true","true"` 저장 → null 2개 호출 → 여전히 `"true"`** — qa-8a2 N4가 지적한
  "기본 false 위에서만 검증돼 하드코딩 false도 통과" 문제를 **정확히 해소** ✓
- **`(signatureEnabled="true", signaturePinRequired="false")` 조합** 추가 ✓
(메시지 분리 자체는 미해소 — m1.)

## 기타
- 설정 화면: 체크박스 2개, `loadSettings` 반영, `onsubmit` 파라미터 2개,
  `signature-enabled` 변경 시 `signature-pin-required` disabled 토글 ✓ (스펙 변경 1 전항목)
- `NavMarkup`: `ICON_SIGNATURE` 상수 추가(기존 ICON_* 스타일 동일), "알림" 아래·"승인 설정" 위 배치, 배지 없음 ✓
- 새 CSS 색상 값 추가 없음 — 다만 존재하지 않는 토큰을 참조(M3)
- `.claude/skills/approval-dev/SKILL.md` 변경은 코디네이터의 하네스 갱신(모델 지정 + 직접 수정 경로 폐지)으로
  8c 코드와 무관 — 검증 범위 밖.

---

# Codex 재작업 지시문 초안 (`spec-8c4-rework.md`)

> # 배치 8c 재작업 — QA FAIL 수정 (치명 1 + 중대 3 + 경미 4)
>
> 너는 이 저장소의 구현 담당이다. **아래 항목만 고쳐라. 다른 코드를 건드리지 마라.**
> 원 스펙 `_workspace/spec-8c-signature-ui.md`의 금지 목록·UI 규칙이 그대로 적용된다
> (재포매팅 금지 · 게이트 우회/테스트 약화 금지 · C10 수정 금지 · clean/package/커밋 금지 ·
> PIN 원문 로그/URL 금지 · 새 CSS 색상 값 추가 금지 · 허위 보고 금지).
>
> ## R1 (치명) 반려 확정이 TypeError로 죽는다 — `approval.js:567`
> `rejectContainer.closest('.dmove-approval-modal')`는 **항상 null**이다.
> `rejectContainer`는 `approvalContainer()`가 돌려주는 `.dmove-approval-page-panel`/`.dmove-approval-region`이고,
> 상세 모달은 그 **자손**이라 `closest()`(조상만 탐색)로는 찾을 수 없다.
> `null.dataset` → TypeError로 핸들러가 죽어 **`signatureEnabled=false`인 기본 구성에서도 반려가 전혀 되지 않는다.**
>
> 같은 함수 `:552`에 이미 `var confirmModal = rejectConfirmButton.closest('.dmove-approval-modal');`가
> 선언돼 있다. 그것을 쓰고 **null 가드를 반드시 넣어라**:
> ```js
> confirmModal && confirmModal.dataset.approvalPinRequired === '1'
>     ? new URLSearchParams({pin: rejectPin}) : undefined
> ```
> 바로 아래 PIN 핸들러(`:585`)가 `pinConfirm.closest(...)`로 **버튼에서** 올라가는 올바른 패턴이니 참고하라.
>
> ## R2 (중대) PIN 오류 접두를 떼고 표시하라 — `approval.js`
> 지금은 `PIN_INVALID:PIN이 올바르지 않습니다...`가 접두째 화면에 나온다.
> 공용 헬퍼를 `post()` 근처에 1개 추가하고 승인 PIN 핸들러·반려 핸들러 양쪽에서 사용하라:
> ```js
> function pinErrorText(error, fallback) {
>     var body = (error && error.body) || '';
>     var match = /^(PIN_NOT_SET|PIN_INVALID|PIN_LOCKED):([\s\S]*)$/.exec(body);
>     return match ? match[2] : (body || fallback);
> }
> ```
> 접두가 없는 기존 오류는 지금과 똑같이 표시되어야 한다(회귀 금지).
>
> ## R3 (중대) PIN 스텝 상호 배타·ESC·닫기 리셋 — `approval.js`
> 네 지점 전부 고쳐라.
> 1. **ESC 핸들러**(`:797-810`): 열린 confirm이 `.dmove-approval-confirm--pin`이면
>    `[data-approval-pin-back]`을 클릭하고 return하는 분기를 `--reject` 분기 옆에 추가.
> 2. **회수 열기**(`:599-607`): `.dmove-approval-confirm--pin`도 `hidden = true` 처리.
> 3. **반려 열기**(`:531`): `:not(.dmove-approval-confirm--reject)` 셀렉터는 DOM 순서상 첫 매치만 잡아
>    canCancel일 때 회수 박스가 선택되고 PIN 박스가 남는다. PIN 박스를
>    `rejectModal.querySelector('.dmove-approval-confirm--pin')`으로 **따로 잡아** 숨겨라.
> 4. **`closeModal`**(`:415-437`): PIN 박스 리셋 블록 추가 —
>    `hidden = true`, `.dmove-approval-pin-message` 비우기, `[data-approval-pin-input]` 값 비우기,
>    `[data-approval-action="approve"]`의 `disabled = false`.
>    (지금은 승인 클릭으로 걸린 `disabled`가 모달을 닫아도 안 풀려 승인 동선이 막힌다.)
>
> ## R4 (중대) 도장 CSS가 패널·매크로에서 무효 — `approval.css:803, 805`
> `var(--approved)`/`var(--approved-bg)`/`var(--sans)`/`var(--rejected)`는 **`approval.css`에 정의되어 있지 않다.**
> 이 파일에는 커스텀 속성 정의가 0개이고(전수 확인), 그 토큰들은
> `ApprovalInboxServlet` TEMPLATE의 `#dmove-approval-app` 스코프에만 있다.
> 업무함은 상속으로 동작하지만 **Confluence 콘텐츠 페이지의 패널·매크로 상세 모달에서는 전부 무효**가 되고,
> 특히 `font: 700 12px/1 var(--sans)`는 var가 invalid이면 **단축 속성 전체가 무효**가 되어
> font-weight·font-size까지 사라진다.
>
> 이 파일의 기존 관례(하드코딩)를 따르고 `font` 단축을 롱핸드로 분리하라. **새 색상 값은 쓰지 마라** —
> 승인 `#216e4e`(`:71-72, :701, :771`)와 승인 배경 `#dcfff1`(`:701`), 반려 `#ae2e24`(`:800-802`)는 이미 있는 값이다.
> ```css
> .dmove-approval-stamp--auto { display:inline-flex; width:34px; height:34px; margin-left:6px;
>   align-items:center; justify-content:center; border:1.5px solid #216e4e; border-radius:50%;
>   background:#dcfff1; color:#216e4e; font-weight:700; font-size:12px; line-height:1;
>   vertical-align:middle; white-space:nowrap; transform:rotate(-6deg); }
> .dmove-approval-pin-message:not(:empty) { display:block; margin-top:8px; color:#ae2e24; }
> ```
>
> ## R5 (경미) 서명 업로드 오류 메시지 실제 분리 — `ApprovalRestResource.java:963-969`
> 8c는 `catch (IllegalArgumentException)`의 문구만 바꿨는데 **그 블록은 원래도 형식 메시지였다.**
> 실제 증상은 `:963-968`이 크기 초과·크기 하한(8바이트)·PNG/JPEG 매직바이트 불일치를 한 조건문에 묶어
> 전부 `"서명 이미지는 50KB 이하여야 합니다."`로 답하는 것이다.
> 조건을 둘로 쪼개라 — **크기 위반만** "서명 이미지는 50KB 이하여야 합니다.",
> **매직바이트 불일치·8바이트 미만**은 "서명 데이터 형식이 올바르지 않습니다."
>
> ## R6 (경미) 나머지 3건
> - **PIN 형식 정책 통일**: 업무함 내 서명 화면은 `/^\d{4,12}$/`(숫자만), 서버
>   `ApprovalPinService.validate`는 `\S{4,12}`다. 설계 D4가 "숫자 강제 안 함"이므로
>   **클라를 `/^\S{4,12}$/`로 완화**하고 안내 문구도 "4~12자"로 맞춰라(서버는 건드리지 마라).
> - **업로드 mime 클라 검증**: `ApprovalInboxServlet`의 `[data-signature-file]` onchange에서
>   `file.type`이 `image/png`·`image/jpeg`가 아니면 "PNG 또는 JPEG 파일만 등록할 수 있습니다." 메시지 후 return.
> - **반려 PIN input 비우기**: 승인 스텝처럼 `post()` **호출 직전**에 `rejectPinField.value = ''`
>   (지금은 `.catch` 안에만 있다). `.catch`의 기존 비우기는 남겨도 무방.
>
> ## 게이트 (전부 실행하고 "Tests run:" 줄을 그대로 인용하라)
> ```
> set JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence9 -am test
> C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd -B -pl approval-confluence10 compile
> ```
> **현재 C9 테스트는 111건이다.** 변경 후 몇 건인지 실측해서 보고하라.
> 추가로 `node --check approval-confluence9/src/main/resources/js/approval.js`를 실행해 문법을 확인하라
> (R1~R3이 전부 이 파일이다).
>
> 완료 보고: 변경 파일 목록 + 게이트 결과 + 미완 항목(있으면 정직하게).

---

# 코디네이터에게

1. **R1은 화면 테스트로만 드러나는 종류다.** 재작업 후 반드시 실기동으로
   **signatureEnabled=false 상태에서 반려 확정**이 되는지 먼저 확인할 것. 자동 게이트로는 영원히 못 잡는다.
2. **8c는 approval.js가 4건 중 3건(R1~R3)의 무대다.** 재작업 후 이 파일만 집중 검토하면 된다.
3. **실기동 확인 목록** (재작업 QA 통과 후):
   - off: 패널·매크로 상세 모달에서 승인/반려/회수 3동선, 업무함 목록·상세, 설정 저장
   - on + PIN off: 도장 렌더(패널·매크로·업무함 상세), 내 서명 등록/삭제/업로드
   - on + PIN on: 승인 PIN 스텝, 반려 사유+PIN 결합, 오답/미등록/잠금 3오류 메시지,
     ESC·닫기 후 재진입 시 스텝 상태
