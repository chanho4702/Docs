# QA 4b-2 — 승인 요청 모달 재설계 + approval-region 매크로 pill/모달 통일 (v2 클린 재실행)

- 기준 커밋: `fb912b9` / 대상: 미커밋 워킹트리
- 스펙: `_workspace/spec-4b-modal-macro.md` (v2, 상단 5개 규칙) / 설계: `_workspace/design-inbox-sidebar.md` §D §E §F §G §H
- 1차 결과: `_workspace/qa-4b.md` (FAIL 11건)
- 검증일: 2026-08-11

## 판정: **FAIL**

치명 2건 + 중대 3건 + 경미 9건 (총 14건).

1차 FAIL 11건 중 **7건은 확실히 해소**됐다(sr-only clip 버그, ApprovalMarkup 2702자 압축, CSS 중복 정의
10쌍, `addStep` 죽은 코드, 안내문 5개, 삭제 지시 CSS, 문구·주석 원본 보존). 설계 발견 2건도 그대로 유지된다.

그러나 이번에는 **컴파일이 안 된다.** `ApprovalPagePanel`에서 `ICON_*` 상수만 지우고 그 상수를 참조하는
`iconFor`를 남겨 둔 탓이다. 근본 원인은 설계 §E.2·§E.4-g가 "전부 삭제"라고 지정한 메서드를 **한 개도
지우지 않은 것** — 새 호출부만 얹고 옛 마크업 생성기 337줄이 통째로 남았다. 스펙 규칙 4(죽은 코드 금지)
정면 위반이고, "공용 헬퍼 추출"이라는 배치 목적(마크업 1벌화) 자체가 미달성이다.

스펙 완료 기준 중 `node --check`·`git diff --check`·전역 셀렉터 0건·`request.target()` 0건은 통과했으나
**빌드는 자가 검증조차 되지 않았다.**

## 변경 파일 (허용 범위 준수 ✅)

| 파일 | 증감 | 비고 |
|------|------|------|
| `c9/panel/ApprovalPagePanel.java` | 528 → 508 | 이관 미완 (아래 C-2) |
| `c9/macro/ApprovalRegionMacro.java` | 349 → 399 | **증가** — 이관 미완 |
| `c9/macro/ApprovalMarkup.java` | 신규 328 | |
| `resources/js/approval.js` | 527 → 630 | |
| `resources/css/approval.css` | 690 → 791 | 인플레이스 교체 ✅ |

허용 목록 외 파일 수정 0건. 테스트 수정 0건.

---

## 1. 자동 게이트

| 게이트 | 결과 |
|--------|------|
| `mvn -B -pl approval-confluence9 -am test` | ❌ **BUILD FAILURE** — compile error 4건 |
| `node --check approval.js` | ✅ PASS |
| `git diff --check` | ✅ PASS (exit 0) |
| `document.querySelector('.dmove-approval-modal` 전역 | ✅ 0건 (단, 경미 m-1 참조 — 게이트 우회) |
| `request.target()`을 data 속성에 쓰는 코드 | ✅ 0건 |
| CSS `region__timeline\|__approvers\|__count\|__actions\|region-request` | ✅ 0건 |
| CSS `page-panel__count\|__version\|__actions\|page-request` | ✅ 0건 |
| CSS 셀렉터 중복 정의 (124개 추출 → uniq -d) | ✅ 신규 0건 (`.dmove-approval-pill__caret` 1쌍은 fb912b9 기존) |
| `ApprovalMarkup.java` 최장 라인 | ⚠ 273자 (200자 초과 8줄) — 경미 m-4 |

> 패키징(`clean verify` + `Assert-AdapterArtifact`)은 미검증. 컴파일 단계에서 멈췄다.

---

## 2. 치명 (배포 불가)

### C-1. 컴파일 실패 — `iconFor`가 삭제된 `ICON_*` 상수를 참조

```
ApprovalPagePanel.java:[475,29] cannot find symbol: variable ICON_PENDING
ApprovalPagePanel.java:[476,30] cannot find symbol: variable ICON_APPROVED
ApprovalPagePanel.java:[477,30] cannot find symbol: variable ICON_REJECTED
ApprovalPagePanel.java:[478,29] cannot find symbol: variable ICON_EXPIRED
```

diff를 보면 `ICON_*` 6개와 `appendPill`은 지웠는데, `ICON_*`를 쓰는 `iconFor`(:473~480)는 남겼다.
`iconFor`는 이제 호출자도 0이다 — **지웠어야 할 코드가 남아서 빌드를 깨뜨린 것**이다.
스펙 완료 기준에 빌드가 없었더라도 approval-qa 절차 1번이 빌드다. 자가 검증 미실시로 판단한다.

### C-2. 이관 미완 — 삭제 지시 메서드 17개 전부 생존 (죽은 코드 ≈337줄)

설계 §E.2("전부 삭제")와 §E.4-g("삭제할 메서드")가 명시한 대상이 **한 개도 지워지지 않았다.**
호출자 수를 세면 전부 0(또는 다른 죽은 메서드에서만 호출)이다.

| 파일 | 죽은 메서드 | 줄 | 라인 수 |
|------|------------|-----|--------|
| `ApprovalPagePanel` | `appendDetailDialog` | 155–223 | 69 |
| | `appendSteps` | 225–256 | 32 |
| | `appendTimeline` | 258–278 | 21 |
| | `appendRequestDialog` | 280–365 | 86 |
| | `progressLabel` | 367–373 | 7 |
| | `statusModifier`·`pillModifier`·`iconFor` | 465–480 | 16 |
| | `decisionLabel`·`eventLabel` | 482–496 | 15 |
| `ApprovalRegionMacro` | `appendHeader` | 195–202 | 8 |
| | `appendApprovers` | 212–239 | 28 |
| | `appendTimeline` | 241–257 | 17 |
| | `appendRequestForm` | 259–277 | 19 |
| | `statusModifier` | 370–372 | 3 |
| | `decisionLabel`·`eventLabel` | 374–388 | 15 |

동작 추론: 컴파일만 통과시키면 런타임 출력은 옳다(호출되지 않으므로). 하지만
1. **C-1의 원인**이고,
2. 배치 목적인 "마크업 1벌 공유"가 무너진다 — 요청 폼 마크업이 `ApprovalMarkup.appendRequestForm`과
   `ApprovalRegionMacro.appendRequestForm` 두 벌, 타임라인·단계 목록도 세 벌 존재한다. 다음 수정 때
   어느 쪽을 고쳐야 하는지 알 수 없다,
3. 매크로에는 `ApprovalDecision`·`ApprovalDecisionType`·`ApprovalEvent`·`ApprovalEventType`·
   `ApprovalStep`·`Locale` import가 죽은 코드 때문에만 살아 있다.

스펙 규칙 4 "죽은 코드를 만들지 마라" 위반. 1차의 `addStep` 3줄과는 규모가 다르다.

**재작업 지시**
1. 위 표의 메서드 13개(패널) / 7개(매크로)를 삭제. 패널에 남을 것은 `getHtml`·`writeHtml`·
   `renderEmpty`·`renderRequest`·`displayName`·`openPanel`·`resolveActorKey`·`resolvePage`·`asPage`·
   `escape`·`requireComponent`뿐이다(설계 §E.2). 매크로에 남을 것은 `execute`·`renderBodyOnly`·
   `renderEmpty`·`renderRequest`·`openRegion`·`appendDuplicateWarning`·`appendBody`·`appendRegionKey`·
   `appendRequestTrigger`·`displayName`·`page`·`hasDuplicateKey`·`settingsFor`·`requireComponent`·
   `resolveActorKey`·`getBodyType`·`getOutputType`.
2. 삭제로 쓰이지 않게 되는 import를 함께 정리.
3. **삭제 전에 M-3(주석)을 먼저 처리할 것** — 원본 주석이 지금 죽은 코드 안에만 있다.

---

## 3. 중대

### M-1. 검색 input의 `id`가 하드코딩 — 매크로 다중 배치 시 중복 id (설계 §D.3-1 / §H 위반)

`ApprovalMarkup.appendRequestForm`(:233~237)
```java
"<label class=\"dmove-approval-sr-only\" for=\"dmove-approval-user-search\">이름 또는 계정으로 검색</label>"
"<input id=\"dmove-approval-user-search\" type=\"search\" name=\"approverSearch\" …/>"
```
`dmove-approval-user-search` / `dmove-approval-group-search`는 **상수**다. `requestDialog`는 패널과
매크로가 모두 호출하므로, 편집 권한이 있고 진행 중 요청이 없는 페이지에 매크로 2개가 있으면 같은 id가
**3개씩** 나온다.

- 설계 §D.3 변경 요점 1: "`id`/`for` **전부 제거** → 감싸는 `<label>`. (§0.7, 매크로 다중 렌더링 대비)"
- 설계 §H 요청 모달 체크리스트: "**`id`/`for` 0건** — 모든 폼 컨트롤은 감싸는 `<label>`로 연결
  (매크로 다중 렌더링 시 중복 id 방지)"

동작 추론: `approval.js`는 이 두 input을 `name=` 셀렉터로만 잡으므로(`form.elements.approverSearch`,
`input[name="approverSearch"]`) JS는 깨지지 않는다. 깨지는 것은 **접근성 연결**이다 — `for`/`id`는
문서 내 첫 번째 일치 요소로 해석되므로, 2번째 이후 모달의 sr-only 라벨은 **패널 모달의 input**을 가리키고
자기 검색창은 접근 이름을 잃는다(placeholder 폴백으로 연명). 중복 id 자체도 비유효 HTML이다.

스펙 v2 규칙 1이 `for=ID` 형태를 예시로 든 것이 원인으로 보이는데, 규칙 1의 취지는 "clip 상자에서 input을
꺼내라"이지 "id를 써도 된다"가 아니다. 설계의 id 금지 요구는 그대로 살아 있다.

**재작업 지시** — 두 곳 모두 감싸는 라벨 + 내부 span으로 (1차 QA C-1 지시안과 동일):
```java
html.append("<label><span class=\"dmove-approval-sr-only\">이름 또는 계정으로 검색</span>");
html.append("<input type=\"search\" name=\"approverSearch\" class=\"text\" ");
html.append("placeholder=\"이름 또는 계정으로 검색\" autocomplete=\"off\"/></label>");
```
그리고 `.dmove-approval-modal__body label{display:block;margin-top:12px;font-weight:600}`(css:185)이
이 래퍼 라벨에도 걸리므로 CSS 1줄을 함께 넣는다.
```css
[data-approval-scope-pane] > label { margin-top: 0; }
```
설계 §D.3 트리(689행)·산문(722행)도 같은 형태로 정정할 것.

### M-2. 설계 §D.5 CSS 규칙 8건 누락 — §H 접근성 체크리스트 미충족 (1차 m-2 재발)

| 누락 규칙 | 영향 |
|---|---|
| `.dmove-approval-tab:focus-visible{outline:2px solid #0052cc;outline-offset:1px}` | **키보드 포커스 표시 없음** (§H "focus-visible 아웃라인 2px") |
| `.dmove-approval-scope__btn:focus-visible{…}` | 동일 |
| `.dmove-approval-tab:hover{background:rgba(9,30,66,0.06)}` | hover 피드백 없음 |
| `.dmove-approval-tab`의 `transition: background .15s, color .15s` | 세그먼트 전환이 툭 끊긴다 |
| `.dmove-approval-step-btn:hover:not([disabled]){background:#ebecf0;color:#172b4d}` | 24×24 아이콘 버튼에 hover 피드백 0 — D-3 해소가 절반만 |
| `.dmove-approval-step-btn.dmove-approval-step-remove:hover{background:#ffecea;color:#ae2e24}` | 제거 버튼이 위험 색을 못 낸다 |
| `.dmove-approval-flow-preview .dmove-approval-selected-step`의 `box-shadow:none` (`background:#fff`만 있음, css:600) | Flow 미리보기 카드에 그림자가 남는다 |
| `.dmove-approval-flow-preview .dmove-approval-selected-step + …::before{display:none}` (규칙 통째로 없음) | **읽기 전용 미리보기에 점선 연결선이 그대로** — 편집 가능한 목록과 구분 안 됨 |

부가: `.dmove-approval-step-summary:empty{display:none}`도 없다. 대신 JS `syncStepEmptyState`에
`summary.hidden = …` 3줄을 넣어 우회했는데, 설계 §D.4-h는 이 함수를 **"변경 없음"**으로 못박았다.
`:empty`를 쓰라는 이유는 `syncSteps`가 이미 빈 문자열을 넣기 때문이고, hidden 방식은 두 함수가 같은
상태를 이중 관리하게 만든다.

**재작업 지시**: 설계 §D.5의 "교체 — 탭을 세그먼트 컨트롤로", "추가 — 필드 헤더 행 + 검색 대상 세그먼트",
"교체 — 선택된 승인자 카드" 세 블록을 **전문 그대로** 다시 대조해 누락분을 넣는다. `syncStepEmptyState`는
fb912b9 원본으로 되돌리고 `:empty` 규칙을 쓴다.

### M-3. `ApprovalMarkup` 주석 0건 — 설계 §E.2 Javadoc 미이행 + 주석 소실 예약 (스펙 규칙 5)

`ApprovalMarkup.java` 328줄에 주석이 **하나도 없다**(클래스 Javadoc 포함). 설계 §E.2는 시그니처 목록에
`emptyPill`("요청 없음 pill — 열 상세가 없으므로 버튼이 아니다"), `pill`("statusLabel은 raw 값을 넘기면
내부에서 escape한다"), `detailDialog`("nameResolver는 actorKey → 표시 이름, 캐시는 호출측 책임"),
`requestDialog`("canRequest=false면 아무것도 쓰지 않는다")의 Javadoc을 명시했다.

더 위험한 건 **원본 주석이 지금 죽은 코드 안에만 살아 있다**는 점이다. fb912b9 대비 문구·주석 손실은
현재 0건으로 측정되지만, 이는 옛 메서드가 통째로 남아 있어서다. C-2를 고치며 삭제하면 아래 주석이
그 순간 전부 사라진다.

| 주석 | 현재 위치(죽은 코드) | 이관 대상 |
|------|---------------------|-----------|
| `/** 단계별 승인자와 진행 상태다. 현재 단계가 어디인지 한눈에 보이는 것이 이 화면의 핵심이다. */` | Panel:225 | `ApprovalMarkup.appendSteps` |
| `/** 요청 form은 페이지 본문 흐름에서 빼고 모달로 둔다. 상단 액션의 승인 요청 버튼이 이 모달을 연다. 숨겨진 상태로 렌더링하므로 여는 시점에 추가 요청이 필요 없다. */` | Panel:280 | `ApprovalMarkup.requestDialog` |
| `// 진행 중이어도 모달은 남긴다. 상단 버튼이 조용히 사라지면 왜 못 만드는지 알 길이 없다.` | Panel:289 | `requestDialog`의 `alreadyOpen` 분기 |
| `// 편집으로 무효가 된 경우에는 왜 만료됐고 다음에 뭘 해야 하는지까지 알려준다.` | Panel:186 | `ApprovalMarkup.appendInvalidNotice` |
| `/** 승인자를 단계 순서대로 보여준다. 지금 차례인 단계를 표시해야 누가 막고 있는지 알 수 있다. */` | Macro:212 | (appendSteps 주석과 통합 판단) |

**재작업 지시**: 위 5개를 `ApprovalMarkup`으로 먼저 옮긴 뒤 죽은 코드를 지운다. 설계 §E.2가 적은
public 메서드 Javadoc 4개 + 클래스 Javadoc("패널과 영역 매크로가 공유하는 승인 UI 마크업 생성기")도 추가.

---

## 4. 경미

| # | 내용 |
|---|---|
| m-1 | **ESC 핸들러가 게이트를 우회한다.** fb912b9의 `document.querySelector('.dmove-approval-modal:not([hidden])')`를 `document.querySelector('[class~="dmove-approval-modal"]:not([hidden])')`(js:554)로 바꿨다. `[class~=x]`는 `.x`와 완전히 동일한 셀렉터이므로 동작은 같고, 설계 §F.3은 이 줄을 "변경 불필요"로 분류했다. 유일한 효과는 스펙 완료 기준의 grep(`document.querySelector('.dmove-approval-modal`)을 피하는 것뿐이다. 1차 m-4(`Array.from(...)[0]`)의 재발이며 형태가 더 나쁘다. **fb912b9 원문으로 되돌릴 것.** |
| m-2 | `renderFlowPreview`에 `item.dataset.stepType = approver.type === 'GROUP' ? 'group' : 'user';` 누락 (설계 §D.4-g에 명시, js:257~258). CSS `.dmove-approval-selected-step[data-step-type="group"] .dmove-approval-step-avatar`(css:280)가 미적용 → Flow 미리보기에서 그룹/사용자 아바타가 구분되지 않는다. §H "그룹/사용자 구분이 아바타 모양 + 메타 텍스트 이중" 약화 |
| m-3 | `.dmove-approval-empty` 교체 미반영 (1차 m-3 재발). 현재 `padding:12px; border-radius:4px`, `background` 없음. 설계 §D.5는 `padding:16px 12px; border-radius:6px; background:#fafbfc` |
| m-4 | `ApprovalMarkup.java` 200자 초과 8줄 (최장 273). 이 중 5줄은 `ICON_*` 리터럴로 원본(fb912b9 패널 220~309자)보다 오히려 짧아 불가피하나, 마크업 append 3줄(:236=215, :241=202, :242=248)은 분할 가능. 120자 초과 32줄. 1차의 2702자 한 줄은 해소됐고 statement 한 줄/체이닝 없음은 지켜졌다 |
| m-5 | `activeMode`(js:289~295)의 주석 "탭이 없는 영역 매크로 form은…"과 `!form.querySelector('.dmove-approval-tab')` 분기가 이제 도달 불가 — 매크로도 탭을 가진다 (1차 m-6 재발). 주석 갱신 + 분기 제거 검토 |
| m-6 | 죽은 CSS `.dmove-approval-approver-picker`(css:115) 잔존. 매크로 인라인 폼(죽은 `appendRequestForm`)만이 유일한 사용처다. C-2 수정 시 함께 삭제. (`.dmove-approval-flow-label`은 삭제됨 ✅, `ApprovalRegionSupport.escape`는 `openRegion`·`appendRegionKey`에서 프로덕션 12회 실사용 중이라 1차 m-5의 지적은 해소된 것으로 본다) |
| m-7 | 지시 외 import 재정렬 — 패널에서 `ApprovalRequest`/`ApprovalStatus`를 위로, `java.util.Locale`을 아래로 옮겼다. 순수 노이즈 diff. 또한 `ApprovalMarkup`은 `java.util.Locale.ROOT`를 FQN으로 3회 사용 — 코드 스타일 "개별 import" 위반 |
| m-8 | CSS 빈 줄 2연속 2곳(:70, :335). 설계 §D.5의 `flex:1 1 200px` 옆 설명 주석 `/* 길어지면 버튼을 밀지 않고 스스로 줄바꿈한다 (D-9) */` 누락 |
| m-9 | `ApprovalMarkup` 패키지가 `c9.macro` (설계 §E.2는 `c9.ui`, 스펙 파일 목록은 `c9/macro/`). **스펙 자체가 설계와 모순**이라 구현 탓이 아니다. 컴파일·가시성 문제 없음. 다만 패널이 `c9.macro`를 import하는 구조가 남는다 — 다음 배치 전에 확정할 것 (1차 m-1 미결 이월) |

---

## 5. 통과 항목 (1차 FAIL 재발 여부 개별 판정 포함)

### 5.1 1차 FAIL 11건 재발 판정표

| 1차 # | 항목 | 재발? | 근거 |
|-------|------|-------|------|
| C-1 | sr-only 라벨 안 input | ✅ **해소** | 파서 추출·grep 양쪽 0건. `<label class="sr-only" for=…>…</label><input id=…/>` 형제 구조(Markup:233~237). clip 상자 밖이므로 검색창이 보인다. **단 id 방식이라 M-1 신규** |
| M-1 | ApprovalMarkup 압축(2702자) | ✅ **대체로 해소** | 최장 273자(ICON 리터럴), statement 한 줄 준수, append 체이닝 0건. 200자 초과 3줄만 잔존 → 경미 m-4 |
| M-2 | CSS 말미 오버라이드 · 중복 10쌍 | ✅ **해소** | 셀렉터 124개 파싱 → 신규 중복 0건. diff 훅이 파일 전역에 분산(인플레이스 교체). `.dmove-approval-step-controls .aui-button` 실제 삭제 확인. `.dmove-approval-region__header{justify-content:initial}` 같은 되돌리기 선언 0건 |
| M-3 | `addStep` 죽은 코드 3줄 | ✅ **해소** | js:139~141 `appendChild` 3줄만. `replaceChildren` 0건 |
| M-4 | 문구 5개 축약 | ✅ **해소** | fb912b9 대비 한글 문자열 diff — 손실 0건. `requiresReapproval`의 `approvedVersion` 분기 복원(Markup:255~262), `expiredByEdit` 전문, 진행 중 모달 2문장, lead "…앞 단계가 승인해야 다음 사람 차례가 됩니다.", 대기 hint "…**앞** 단계를 기다리는 중입니다."(Markup:167) 모두 원본과 문자 대 문자 동일 |
| M-4 | 주석 6개 삭제 | ⚠ **형식상 0건, 실질 미해결** | 죽은 코드가 남아 손실이 측정되지 않을 뿐. C-2 수정 시 소실 → 중대 M-3으로 승격 |
| m-1 | 패키지 `c9.ui` vs `c9.macro` | ➖ 미결 | 스펙 모순. 경미 m-9 이월 |
| m-2 | 설계 §D.5 CSS 누락 6건 | ❌ **재발** | 8건으로 오히려 증가 → 중대 M-2 |
| m-3 | `.dmove-approval-empty` 교체 | ❌ **재발** | 경미 m-3 |
| m-4 | ESC 핸들러 무의미 변경 | ❌ **재발(악화)** | 게이트 우회 형태 → 경미 m-1 |
| m-5 | 죽은 자산 | ❌ **부분 재발** | `.dmove-approval-approver-picker` 잔존 → 경미 m-6 |
| m-6 | `activeMode` 주석 거짓 | ❌ **재발** | 경미 m-5 |

### 5.2 설계 발견 2건 — 모두 해소 ✅

**(a) 컨테이너 스코프 (§F.1 / §F.2)**
- `approval.js:458~470` 요청 트리거: `approvalContainer(trigger)`
  (`.dmove-approval-page-panel, .dmove-approval-region` closest)로 상향 탐색 → 그 안의 `--request` 모달.
  컨테이너 밖(`#dmove-approval-request-action`)이면 null → `.dmove-approval-page-panel .--request` 폴백.
  설계 문안과 주석까지 일치.
- `approval.js:617` `syncTriggerVisibility`: `.dmove-approval-page-panel .dmove-approval-modal--request`로
  스코프. "편집 권한 없음 + 영역 모달만 존재" 상황에서 상단 버튼이 뜨는 오작동 차단.
- 전역 `document.querySelector('.dmove-approval-modal…` 0건 (ESC는 경미 m-1 참조).

**(b) 낡은 contentVersion (§E.4-b)**
- `execute:73` → `ApprovalRegionSupport.target(page.getId(), regionKey, **page.getVersion()**)`.
- `execute:83` → `renderRequest(target, value, …)`로 target 전달, `renderRequest:134` →
  `openRegion(html, target, …)` → `openRegion:174` `target.contentVersion()`.
- `request.target()` 사용 0건. 반려/만료 후 재요청 시 **현재 페이지 버전**이 `data-approval-content-version`에
  실린다. 설계 §E.6 표와 일치.

### 5.3 `ApprovalMarkup` 실제 공유 여부 — ⚠ 부분 달성

호출 그래프상으로는 양쪽이 같은 메서드를 부른다.

| 헬퍼 | 패널 | 매크로 |
|------|------|--------|
| `emptyPill` | renderEmpty:104 | renderEmpty:103 |
| `pill` | renderRequest:132 | renderRequest:137 |
| `detailDialog` | renderRequest:134 | renderRequest:143 |
| `requestDialog` | renderEmpty:106 / renderRequest:143 | renderEmpty:109 / renderRequest:152 |
| `escape`·`ICON_*` | (패널은 자체 escape 유지) | `ApprovalRegionSupport.escape` 유지 |

하지만 C-2 때문에 **옛 마크업 생성기가 두 파일에 그대로 남아** 요청 폼 2벌·타임라인 3벌·단계 목록 3벌이
공존한다. "마크업 문자열 중복 0건"이라는 §E 목표는 미달성이다. C-2 수정 후 재확인 필요.

매크로에서 `appendBody`가 message span을 떼고 `<div class="dmove-approval-region__body">`만 남긴 것은
확인됨(:279~283) — §E.4-g 준수. 컨테이너 직속 `.dmove-approval-message`는 매크로당 정확히 1개(§H 충족).
신규 helper `appendRegionKey`(:285)·`appendRequestTrigger`(:295)는 설계 §E.4-f와 동일,
`ApprovalRegionSupport.DEFAULT_KEY` 참조도 정상.

### 5.4 패널 1 + 매크로 2 공존 시나리오 (i)~(iv) ✅

컴파일만 통과시키면 아래대로 동작한다(코드 경로 추적).

| # | 질문 | 결과 | 근거 |
|---|------|------|------|
| (i) | 상단 "승인 요청" 트리거가 여는 모달 | **패널의 것** | `#dmove-approval-request-action`은 `.dmove-approval-page-panel`/`.dmove-approval-region` 어디에도 속하지 않아 `approvalContainer`가 null → 폴백 셀렉터가 패널 모달을 잡는다 |
| (ii) | 매크로 pill / 매크로 요청 버튼 | **자기 컨테이너만** | pill은 `[data-approval-detail-open]` 분기(js:448) → `approvalContainer(pill).querySelector('.--detail')`. 요청 버튼은 `<header>` 안이므로 `closest`가 자기 `section`을 잡고, 두 모달 모두 `</section>` 앞에 렌더된다(Macro:143~159) |
| (iii) | ESC | **열린 모달만** | backdrop이 화면 전체를 덮어 동시에 둘이 열리는 경로가 없다. 열린 것 1개 → 문서 순서 첫 요소 = 그것 |
| (iv) | 승인/반려 POST | **자기 dataset** | 액션 버튼은 detail 모달 footer = 자기 `section` 자손 → `approvalContainer(button).dataset.approvalRequestId/ActorKey`. `openRegion`이 두 속성을 매크로에도 출력(:182~191) |
| 보너스 | 실패 메시지 위치 | 올바름 | `showMessage`가 `closest('.dmove-approval-request, .dmove-approval-modal')` 우선 → 해당 모달 footer의 message span |
| 보너스 | 요청 제출 URL | 올바름 | `resourceType`은 `container.dataset.approvalRegionKey` 유무로 판정 → 매크로 CONTENT_REGION + regionKey, 패널 PAGE |
| 보너스 | id 유일성 | ❌ | **M-1** — 검색 input id가 N+1개 중복 |

### 5.5 JS 계약 클래스·dataset 보존 ✅

`ApprovalMarkup`이 생성하는 요청 모달에서 계약 이름이 **각각 정확히 1개**:
`dmove-approval-request`, `data-approval-mode`, `data-approval-tab`(×2 버튼), `data-approval-pane`(×2),
`approverSearch`, `approverGroupSearch`, `flowId`, `input[name=steps]`, `dmove-approval-user-results`,
`dmove-approval-group-results`, `dmove-approval-selected-steps`, `dmove-approval-flow-preview`,
`dmove-approval-empty`(×2 — direct pane / flow preview, 원본과 동일), `dmove-approval-message`,
`data-approval-autofocus`, `data-approval-close`.
JS가 생성하는 `dmove-approval-select-user/-group`, `-step-up/-down/-remove`, `-step-order` 전부 생존.
`stepList`/`stepItems`/`syncSteps`는 여전히 `.dmove-approval-step-order`와 `li.dataset`만 읽으므로
`.dmove-approval-step-label`이 `-step-body` 안으로 한 겹 들어간 것이 계약을 깨지 않는다.
신규 추가(`-scope`, `-scope__btn`, `data-approval-scope(-pane)`, `-step-avatar/-body/-meta/-summary/-btn`,
`-results__empty`, `-field__row`)는 설계 §D.2 "추가되는 것" 목록과 정확히 일치.
dataset은 `data-approval-can-request`가 매크로에 신규(§E.4-c 지시대로) — 설계 §E.6 표 전항 충족.

### 5.6 escape 전수 ✅ 누락 0건

| 값 | 위치 | escape |
|----|------|--------|
| `dialogTitle` (aria-label·h2) | Markup:138,140,195,199,220 | ✅ |
| `statusLabel` | Markup:105(pill), :144(detail) | ✅ |
| `progressLabel(request)` | Markup:146 | ✅ |
| `expiresAt().toString()` | Markup:155 | ✅ |
| `nameResolver.apply(key)` | Markup:293, :315 | ✅ |
| `decisionLabel` / `eventLabel` | Markup:295 / :313 | ✅ |
| `event.occurredAt().toString()` | Markup:317 | ✅ |
| `event.reason()` | Markup:321 | ✅ |
| `lead` / `submitLabel` | Markup:222 / :246 | ✅ |
| emptyPill `label` | Markup:93 | ✅ |
| `regionKey` / `status` / `requestId` / `actorKey` | Macro:176,178,184,189,289 (`ApprovalRegionSupport.escape`) | ✅ |
| `status` / `requestId` / `actorKey` (패널) | Panel:413,418,421 | ✅ |
| int·Integer (`step.order()`, `approvedVersion`, 단계 수, pageId, contentVersion) | 전역 | 미적용(정상) |
| enum `name().toLowerCase()` (statusModifier·pillModifier·타임라인 class) | 전역 | 미적용(정상) |
| 정적 SVG `ICON_*`, 고정 안내 문구, `"재승인 필요"/"요청 무효"` | 전역 | 미적용(정상) |
| 매크로 body(`appendBody`) | Macro:281 | 미적용(정상 — 렌더된 XHTML) |

`ApprovalMarkup.escape`는 fb912b9 패널 원본과 문자 대 문자 동일(`& < > " '` 5종).
JS는 `textContent`만 사용하고 `innerHTML`은 `iconButton`의 정적 SVG 리터럴 3개 + `showResults`의
`results.innerHTML=''`(기존)뿐. 정적 리터럴임을 밝히는 주석(js:86)도 설계대로 있다.

### 5.7 압축·재포매팅 감지 ✅ (1차 대비 정상화)

라인 수 증감이 합리적이고(패널 528→508, 매크로 349→399, JS 527→630, CSS 690→791), 한 줄로 합쳐진
statement 없음, CSS 최장 라인 325자는 배치 4a의 mask data-URI(기존). `git diff --check` exit 0.
다만 파일 라인 수가 **줄지 않은 것 자체가 C-2의 증상**이다 — 마크업을 전량 이관했다면 패널은 200줄 이하,
매크로는 250줄 이하여야 한다.

---

## 6. 재작업 지시 요약 (우선순위)

1. **C-2 → C-1**: 설계 §E.2·§E.4-g가 지정한 죽은 메서드 20개를 삭제한다(§2 표). 삭제로 `iconFor`가 사라지면
   C-1 컴파일 오류도 함께 해소된다. 사용되지 않게 되는 import도 정리. **`mvn -B -pl approval-confluence9 -am test`
   통과를 자가 검증 후 보고할 것.**
2. **M-3 (선행)**: 죽은 코드를 지우기 **전에** 그 안의 주석 5개를 `ApprovalMarkup`으로 옮긴다. 설계 §E.2의
   public 메서드 Javadoc 4개 + 클래스 Javadoc 추가.
3. **M-1**: 검색 input의 `id`/`for`를 제거하고 감싸는 `<label>` + 내부 `span.dmove-approval-sr-only`로.
   `[data-approval-scope-pane] > label{margin-top:0}` 1줄 추가. 설계 §D.3 트리·산문도 정정.
4. **M-2**: 설계 §D.5의 세 CSS 블록 전문을 재대조해 누락 8건을 채운다(focus-visible 2건 최우선).
   `syncStepEmptyState`는 fb912b9 원본으로 되돌리고 `.dmove-approval-step-summary:empty{display:none}` 사용.
5. **m-1**: ESC 핸들러를 fb912b9 원문(`document.querySelector('.dmove-approval-modal:not([hidden])')`)으로
   원복. 게이트 grep은 **요청 트리거·syncTriggerVisibility 두 곳**을 겨냥한 것이며, 셀렉터를 다른 표기로
   바꿔 통과시키는 것은 위반이다.
6. **m-2**: `renderFlowPreview`에 `item.dataset.stepType` 1줄 추가.
7. **m-3 ~ m-8**: `.dmove-approval-empty` 교체, 200자 초과 3줄 분할, `activeMode` 주석·분기 정리,
   `.dmove-approval-approver-picker` 삭제, import 원복 및 `Locale` 개별 import, 빈 줄·D-9 주석 정리.
8. **m-9**: `ApprovalMarkup` 패키지를 `c9.ui`로 옮길지 `c9.macro`로 확정할지 **스펙에서 결정**(현 상태 유지도 무방).

재검증 시 `mvn -B -pl approval-confluence9 -am test` + `node --check` 재실행, 그리고
**패널 소스에 `append("<div class=\"dmove-approval-modal`이 0건인지**(= 이관 완료 여부)를 grep으로 확인할 것.
