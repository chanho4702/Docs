# QA 4b-3 — 승인 요청 모달 재설계 + approval-region 매크로 pill/모달 통일 (3차)

- 기준 커밋: `fb912b9` / 대상: 미커밋 워킹트리
- 스펙: `_workspace/spec-4b-modal-macro.md` (v2) / 설계: `_workspace/design-inbox-sidebar.md` §D §E §F §G §H
- 1차: `_workspace/qa-4b.md` (FAIL 11건) / 2차: `_workspace/qa-4b2.md` (FAIL 14건)
- 이번 라운드 구현자: **메인 Claude**(Codex 아님). 검증 기준은 동일 적용.
- 검증일: 2026-08-12

## 판정: **PASS** (이월 3건)

2차 FAIL 14건 중 **11건 완전 해소, 3건 부분 해소, 1건은 스펙 결정으로 종결**.
치명 2건(C-1 컴파일 실패, C-2 죽은 코드 337줄)이 모두 사라졌고 빌드·테스트가 통과한다.
배치 목적인 "마크업 1벌화"가 이번에 실제로 달성됐다 — 패널 528→250, 매크로 349→298줄로 줄었고
두 파일 모두 `dmove-approval-modal` 문자열이 **0건**이다(전량 `ApprovalMarkup` 이관).

남은 3건은 전부 **런타임 영향 없는 cosmetic·문서 문제**라 배포를 막지 않는다. 다만 그중
**설계 문서 미정정(M-1 잔여)은 §I C10 이식 때 1차 C-1 버그를 그대로 재현시킬 함정**이므로
커밋 전에 문서 3줄만 고칠 것을 권한다.

## 변경 파일

| 파일 | fb912b9 | 2차 | 3차 | 비고 |
|------|--------|-----|-----|------|
| `c9/panel/ApprovalPagePanel.java` | 528 | 508 | **250** | 이관 완료 |
| `c9/macro/ApprovalRegionMacro.java` | 349 | 399 | **298** | 이관 완료 |
| `c9/macro/ApprovalMarkup.java` | — | 328 | 353 | 신규(주석·Javadoc 추가분) |
| `resources/js/approval.js` | 527 | 630 | 628 | |
| `resources/css/approval.css` | 690 | 791 | 826 | 인플레이스 교체 |

허용 목록 외 파일 수정 0건. 테스트 수정 0건. 설계 문서 수정 0건(← M-1 잔여).

---

## 1. 자동 게이트

| 게이트 | 결과 |
|--------|------|
| `mvn -B -pl approval-confluence9 -am test` | ✅ **BUILD SUCCESS** / Tests run **48**, Failures 0, Errors 0 (55.5s) |
| `node --check approval.js` | ✅ PASS |
| `git diff --check` | ✅ exit 0 (CRLF 경고만) |
| 패널·매크로에 `dmove-approval-modal` 문자열 | ✅ **0건 / 0건** (이관 완료 증명) |
| `document.querySelector('.dmove-approval-modal--request')` 스코프 없는 형태 (§H 회귀 grep) | ✅ 0건 |
| `request.target()`을 data 속성에 쓰는 코드 | ✅ 0건 (남은 2건은 `EmailNotificationChannel`의 pageId 조회 — 정상) |
| CSS `region__timeline\|__approvers\|__count\|__actions\|region-request` | ✅ 0건 |
| CSS `page-panel__count\|__version\|__actions\|page-request` | ✅ 0건 |
| CSS `minimumApprovals` (§D.5 삭제 지시) | ✅ 0건 |
| CSS 셀렉터 중복 정의 | ✅ 신규 0건 (`.dmove-approval-pill__caret` 1쌍은 fb912b9에 이미 2회 — 기존) |
| CSS 빈 줄 2연속 | ✅ 0건 (2차 2곳 해소) |
| Java 200자 초과 | ✅ `ApprovalMarkup` 5줄 = ICON_* SVG 리터럴만(원본보다 짧음). 마크업 append 3줄 분할 완료 |
| Java 빈 줄 2연속 | ⚠ 2곳 잔존 — `ApprovalRegionMacro:197`, `ApprovalPagePanel:239` (m-8 잔여) |

> 2차에서 컴파일 단계에 막혔던 자가 검증이 이번엔 실제로 통과한다. 위 `mvn`은 QA가 직접 재실행한
> 결과다(`mvn`이 PATH에 없어 `scripts/build.ps1`이 쓰는 `C:\Onpremise\.toolchains\apache-maven-3.9.16`
> + JDK 21로 실행). 패키징(`clean verify` + `Assert-AdapterArtifact`)은 이번에도 미검증 — 커밋 직전에
> `scripts/build.ps1 -Target confluence9`를 한 번 돌릴 것.

---

## 2. 14건 판정표

| # | 등급 | 항목 | 판정 | 근거 |
|---|------|------|------|------|
| C-1 | 치명 | 컴파일 실패 (`iconFor` → 삭제된 `ICON_*`) | ✅ **RESOLVED** | `ICON_*` 6개·`iconFor`가 모두 `ApprovalMarkup`(:17~33, :57~64)에 있고 패널에는 없다. BUILD SUCCESS |
| C-2 | 치명 | 죽은 메서드 20개 생존 (≈337줄) | ✅ **RESOLVED** | 아래 §2.1 상세 |
| M-1 | 중대 | 검색 input `id` 하드코딩 | ⚠ **부분** (코드 ✅ / 문서 ❌) | 아래 §2.2 |
| M-2 | 중대 | 설계 §D.5 CSS 8건 누락 + `:empty` | ⚠ **부분** (8/8 ✅ / 잔여 6건) | 아래 §2.3 |
| M-3 | 중대 | `ApprovalMarkup` 주석 0건 | ✅ **RESOLVED** | 아래 §2.4 |
| m-1 | 경미 | ESC 핸들러 게이트 우회 | ✅ **RESOLVED** | js:552 `document.querySelector('.dmove-approval-modal:not([hidden])')` — fb912b9 원문과 축자 동일. `[class~=]` 0건. §H 회귀 grep은 `--request` 형태를 겨냥하므로 충돌 없음 |
| m-2 | 경미 | `renderFlowPreview` `dataset.stepType` 누락 | ✅ **RESOLVED** | js:259 `item.dataset.stepType = approver.type === 'GROUP' ? 'group' : 'user';`. CSS `[data-step-type="group"] .dmove-approval-step-avatar`(css:280) 연결됨 |
| m-3 | 경미 | `.dmove-approval-empty` 교체 미반영 | ✅ **RESOLVED** | css:543 `padding:16px 12px; border-radius:6px; background:#fafbfc` — 설계와 일치 |
| m-4 | 경미 | 200자 초과 8줄 | ✅ **RESOLVED** | 5줄만 잔존 = ICON_* 리터럴(불가피, 원본 220~309자보다 짧다). 지적된 :236/:241/:242 append 3줄은 분할됨. 120자 초과 32→26줄 |
| m-5 | 경미 | `activeMode` 주석 거짓 + 도달 불가 분기 | ✅ **RESOLVED** | js:290 주석 "모든 요청 form(패널·매크로 공통)이 탭을 가지므로…"로 갱신, `!form.querySelector('.dmove-approval-tab')` 분기 삭제 |
| m-6 | 경미 | 죽은 CSS `.dmove-approval-approver-picker` | ✅ **RESOLVED** | 0건 |
| m-7 | 경미 | 지시 외 import 재정렬 + `Locale` FQN | ✅ **RESOLVED** | 패널·매크로 import diff가 **삭제분 + `ApprovalMarkup` 1줄**뿐(재정렬 노이즈 0). `ApprovalMarkup`은 `import java.util.Locale;`(:11) 개별 import 후 `Locale.ROOT` 사용 |
| m-8 | 경미 | CSS 빈 줄 2연속 + D-9 주석 누락 | ⚠ **부분** | CSS 빈 줄 0건 ✅, D-9 주석 css:210에 축자 존재 ✅. 그러나 **Java 빈 줄 2연속 2곳 신규**(Macro:197, Panel:239) |
| m-9 | 경미 | `ApprovalMarkup` 패키지 `c9.macro` vs 설계 `c9.ui` | ➖ **스펙 결정으로 종결** | 아래 §2.5 |

**집계: RESOLVED 11 · 부분 3 · 결정 종결 1 · NOT RESOLVED 0**

### 2.1 C-2 — 죽은 코드 삭제 + 생존 목록 대조

`ApprovalPagePanel` 최종 메서드 **11개**, qa-4b2 §2 재작업 지시 1의 생존 목록과 **정확히 일치**:

| 요구 | 실제 | |
|---|---|---|
| `getHtml` | :71 | ✅ |
| `writeHtml` | :91 | ✅ |
| `renderEmpty` | :95 | ✅ |
| `renderRequest` | :112 | ✅ |
| `displayName` | :153 | ✅ |
| `openPanel` | :174 | ✅ |
| `resolveActorKey` | :204 | ✅ |
| `resolvePage` | :216 | ✅ |
| `asPage` | :235 | ✅ |
| `escape` | :240 | ✅ |
| `requireComponent` | :62 | ✅ |

초과·누락 0건. 삭제 지시 13개(`appendDetailDialog`, `appendSteps`, `appendTimeline`,
`appendRequestDialog`, `progressLabel`, `statusModifier`, `pillModifier`, `iconFor`,
`decisionLabel`, `eventLabel`, `appendPill`, `ICON_*`, `appendInvalidNotice`) 전부 소멸.

`ApprovalRegionMacro` 최종 메서드 **17개**, 생존 목록과 **정확히 일치**:
`execute`(:49) · `renderBodyOnly`(:81) · `renderEmpty`(:87) · `renderRequest`(:114) · `openRegion`(:157) ·
`appendDuplicateWarning`(:189) · `appendBody`(:198) · `appendRegionKey`(:204) · `appendRequestTrigger`(:214) ·
`displayName`(:222) · `page`(:243) · `hasDuplicateKey`(:251) · `settingsFor`(:258) · `requireComponent`(:272) ·
`resolveActorKey`(:280) · `getBodyType`(:290) · `getOutputType`(:295).
삭제 지시 7개(`appendHeader`·`appendApprovers`·`appendTimeline`·`appendRequestForm`·`statusModifier`·
`decisionLabel`·`eventLabel`) 전부 소멸.

**import 정리** — 양쪽에서 `ApprovalDecision`·`ApprovalDecisionType`·`ApprovalEvent`·`ApprovalEventType`·
`ApprovalStep`·`java.util.Locale` 6개가 삭제됐다. 잔존 import 전수 사용 확인(패널 `ApprovalStatus`:140,
매크로 `ApprovalStatus`:149·`ApprovalTarget`:67·`HashMap`:127·`UserKey`:228). 미사용 import 0건.

**마크업 중복 소멸** — 요청 폼 2벌 → 1벌, 타임라인 3벌 → 1벌, 단계 목록 3벌 → 1벌.
`grep -c 'dmove-approval-modal'` 패널 0 / 매크로 0. §E "마크업 문자열 중복 0건" **달성**.

### 2.2 M-1 — id/for 제거

**코드 ✅ 완전 해소.** `ApprovalMarkup`에 `id="` / `for="` **0건**. 형제 구조가 아니라 지시대로 감싸는 라벨이다:

```java
// :245  id/for 연결 대신 감싸는 label을 쓴다. 매크로가 한 페이지에 여러 번 렌더링되면 id가 중복되기 때문이다.
html.append("<label><span class=\"dmove-approval-sr-only\">이름 또는 계정으로 검색</span>");
html.append("<input type=\"search\" name=\"approverSearch\" class=\"text\" ");
html.append("placeholder=\"이름 또는 계정으로 검색\" autocomplete=\"off\"/></label>");
```
그룹 검색(:252~254)도 동일 형태. `sr-only`가 **span에만** 걸리므로 1차 C-1(clip 상자 안에 input)이
재발하지 않는다 — `.dmove-approval-sr-only{position:absolute;width:1px;…}`(css:778)는 span만 잡는다.

CSS 1줄도 지시대로:
```css
/* css:186 */
[data-approval-scope-pane] > label { margin-top: 0; }
```
특이성 검증: `.dmove-approval-modal__body label`(0,1,1, css:180)과 **동일 특이성**이고
`[data-approval-scope-pane] > label`(0,1,1)이 **뒤(css:187)** 에 오므로 `margin-top:0`이 이긴다. 정상.

JS 계약 무영향: `form.elements.approverSearch` / `input[name="approverSearch"]`만 쓴다(js:487, 493).

**문서 ❌ 미정정 (이월).** qa-4b2 M-1 재작업 지시 마지막 줄("설계 §D.3 트리·산문도 같은 형태로 정정")이
이행되지 않았다. 설계 3곳이 여전히 **1차 C-1 버그 형태**를 지시한다:

| 위치 | 현재 내용 | 문제 |
|---|---|---|
| `design:689~690` | `label.dmove-approval-sr-only > span` 다음 줄에 `input[...]` **같은 들여쓰기(형제)** | sr-only가 label에 걸린 형태 + input이 label 밖 |
| `design:693` | 그룹 검색 input에 **label 자체가 없음** | 접근 이름 0 |
| `design:722` (§D.3 산문 1) | "`<label class="dmove-approval-sr-only">`로 **감싼다**" | 감싸면 input이 clip 상자 안 → **1차 C-1 그대로** |
| `design:1810` (§H 체크리스트) | 동일 문장 | 동일 |

§I C10 이식 백로그가 이 설계를 참조하므로, 문서를 안 고치면 C10에서 같은 버그가 재발한다.
**커밋 전 위 4줄을 `<label><span class="dmove-approval-sr-only">…</span><input …></label>` 형태로
정정할 것.** (코드 변경 불필요)

### 2.3 M-2 — §D.5 CSS

**지적된 8건 전부 ✅**

| 규칙 | 위치 | 값 확인 |
|---|---|---|
| `.dmove-approval-tab:focus-visible` | css:463 | `outline:2px solid #0052cc; outline-offset:1px` ✅ |
| `.dmove-approval-scope__btn:focus-visible` | css:515 | 동일 ✅ |
| `.dmove-approval-tab:hover` | css:459 | `background:rgba(9,30,66,0.06)` ✅ |
| `.dmove-approval-tab`의 `transition` | css:456 | `background 0.15s, color 0.15s` ✅ |
| `.dmove-approval-step-btn:hover:not([disabled])` | css:325 | `background:#ebecf0; color:#172b4d` ✅ |
| `.dmove-approval-step-btn.dmove-approval-step-remove:hover` | css:330 | `background:#ffecea; color:#ae2e24` ✅ |
| `.dmove-approval-flow-preview .dmove-approval-selected-step`의 `box-shadow:none` | css:629 | ✅ |
| `.dmove-approval-flow-preview … + …::before{display:none}` | css:635 | 주석까지 포함 ✅ |

§H 접근성 체크리스트의 focus-visible 항목이 이로써 충족된다.

**`:empty`는 ✅ 추가됐고 유효하다.** `.dmove-approval-step-summary:empty{display:none}`(css:346).
`syncSteps`(js:70~75)가 `summary.textContent = items.length ? '총 N단계 …' : ''`로 쓴다.
`textContent=''`는 자식 노드를 전부 제거하므로 `:empty`가 매칭된다(공백 텍스트 노드가 남지 않음).
서버 렌더 초기 마크업도 `<p class="dmove-approval-step-summary" aria-live="polite"></p>`로
내부 공백이 없어(Markup:260) 첫 페인트부터 `:empty`가 걸린다. **`:empty` 판단은 옳다.**

**❌ 이월 6건**

1. **`syncStepEmptyState` 미원복** — qa-4b2가 "fb912b9 원본으로 되돌리고 `:empty`를 쓴다"고 지시했으나
   `summary.hidden = stepItems(form).length === 0;` 3줄(js:324~327)이 그대로 있다.
   설계 §D.4-h는 이 함수를 명시적으로 **"변경 없음(요약은 `syncSteps`가 빈 문자열로 만들고 CSS `:empty`가
   숨긴다)"** 으로 못박았다(design:1029). 지금은 `:empty`와 `hidden`이 **같은 상태를 이중 관리**한다.
   두 조건(`textContent===''` ↔ `stepItems.length===0`)이 항상 동시에 참이라 **동작은 동일**하고
   `[hidden]`(UA `display:none`)과 `:empty`(`display:none`)가 충돌하지도 않는다 → 런타임 영향 0.
   순수 코드 위생 문제.

2. **§D.5 전문 대조 잔여 5건** (프로퍼티 단위 자동 대조로 신규 검출):

| 설계 위치 | 누락 | 실제 | 영향 |
|---|---|---|---|
| `design:1088` | `.dmove-approval-modal--request .dmove-approval-modal__box{width:min(600px,calc(100vw - 32px))}` **규칙 통째로** | 없음 → 기본 `__box` 560px 적용 | 요청 모달 폭이 설계보다 40px 좁다. detail은 640px(css:707) 있음 |
| `design:1064` | `.dmove-approval-modal__lead`의 `line-height:1.5` | css:418에 없음 | lead 2줄 이상일 때 행간 |
| `design:1108` | `.dmove-approval-tab[aria-selected="true"]`의 `border-bottom-color:transparent` | css:481은 `#0052cc` (구 밑줄 탭 잔재) | `.dmove-approval-tab{border:0}`이라 **시각 효과 없음**(inert) |
| `design:1263` | `.dmove-approval-step-order`의 `font-variant-numeric:tabular-nums` | css:252 블록에 없음 | 두 자릿수 순번 정렬 흔들림 |
| `design:1290` | `.dmove-approval-step-controls`의 `flex:none` | css:308에 없음 | `.dmove-approval-step-body{flex:1;min-width:0}`(css:286)가 먼저 수축하므로 실제 발생 확률은 낮으나, 매우 긴 이름에서 24px 버튼이 압축될 수 있다 |

   앞 2건은 qa-4b2가 짚지 않은 "교체 — 모달 셸" 블록 소속이고, 뒤 3건은 qa-4b2가 **"전문 그대로 다시 대조"**
   하라고 지목한 세 블록(탭 세그먼트 / 선택된 승인자 카드) 안에 있다. 즉 전문 대조가 완전히는 안 됐다.
   다만 전부 cosmetic이고 접근성·동작에 영향이 없어 **부분 해소**로 판정한다.

   §D.5 셀렉터 41개 중 위 1건 외 40개 존재, 프로퍼티 불일치 위 4건 외 0건.

### 2.4 M-3 — 주석 이관 + Javadoc

**이관 주석 5개 → 4개 축자 이관 + 1개 통합(qa-4b2가 허용한 판단)**

| 주석 | 2차 위치 | 3차 위치 | 판정 |
|---|---|---|---|
| `/** 단계별 승인자와 진행 상태다. 현재 단계가 어디인지 한눈에 보이는 것이 이 화면의 핵심이다. */` | Panel:225 | **Markup:292** | ✅ 축자 |
| `요청 form은 페이지 본문 흐름에서 빼고 모달로 둔다. 상단 액션의 승인 요청 버튼이 이 모달을 연다. 숨겨진 상태로 렌더링하므로 여는 시점에 추가 요청이 필요 없다.` | Panel:280 | **Markup:189~190** (`requestDialog` Javadoc 본문에 통합) | ✅ 축자 |
| `// 진행 중이어도 모달은 남긴다. 상단 버튼이 조용히 사라지면 왜 못 만드는지 알 길이 없다.` | Panel:289 | **Markup:209** (`alreadyOpen` 분기 안) | ✅ 축자·위치 정확 |
| `// 편집으로 무효가 된 경우에는 왜 만료됐고 다음에 뭘 해야 하는지까지 알려준다.` | Panel:186 | **Markup:273** (`appendInvalidNotice` 위) | ✅ 축자 |
| `/** 승인자를 단계 순서대로 보여준다. 지금 차례인 단계를 표시해야 누가 막고 있는지 알 수 있다. */` | Macro:212 | 없음 (Markup:292 주석으로 통합) | ⚠ 허용 — qa-4b2가 "(appendSteps 주석과 통합 판단)"으로 위임. 남은 주석이 "현재 단계가 어디인지 한눈에" 로 같은 취지를 담는다 |

**Javadoc 4+1 전부 ✅**
- 클래스: `/** 패널과 영역 매크로가 공유하는 승인 UI 마크업 생성기. */`(Markup:15) — 설계 §E.2 문안 그대로
- `emptyPill`(:90) "요청 없음 pill — 열 상세가 없으므로 버튼이 아니다."
- `pill`(:100) "상태 pill. `statusLabel`은 raw 값을 넘기면 내부에서 escape한다."
- `detailDialog`(:129) "상태 상세 모달. `nameResolver`는 actorKey → 표시 이름이며, 캐시는 호출측 책임이다."
- `requestDialog`(:186) "요청 생성 모달. `canRequest=false`면 아무것도 쓰지 않는다." + 이관 주석

**한글 문구·주석 손실 전수 조사** (fb912b9 패널+매크로 vs 3차 패널+매크로+Markup, 5자 이상 한글 조각 58개):
소실 9개, 전부 **삭제된 매크로 인라인 폼의 중복 문구**로 의도된 결과다.

| 소실 문구 | 대체 |
|---|---|
| "승인자 이름 또는 계정 검색" / "승인 그룹 검색" | 공용 "이름 또는 계정으로 검색" / "그룹 이름으로 검색" |
| "그룹 추가" | 인라인 폼 폐지(모달 통일) |
| "그룹은 한 단계로 묶이고, 구성원 중 한 명이 승인하면 통과합니다." | 공용 "그룹은 한 단계로 묶입니다. 전원 승인 여부는 그룹 설정을 따릅니다." |
| "추가한 순서가 승인 순서입니다." | `step-summary` "총 N단계 · 위에서 아래 순서로 승인합니다." |
| "승인 후 페이지가 수정되어 …" / "무효가 되었습니다. 재승인이 필요합니다." | 패널판 전문(더 김) 채택 — Markup:280~286 |
| "승인 진행 중 페이지가 수정되어 요청이 무효가 되었습니다." | 패널판 전문 채택 — Markup:288 |
| "승인자를 단계 순서대로 보여준다…" (주석) | 위 표 5번 |

**정보 손실 없음** — 매크로판이 전부 패널판의 축약본이었고 긴 쪽이 살아남았다.

### 2.5 m-9 — 패키지 위치: **`c9.macro` 유지로 확정** (스펙 결정)

이번 라운드 지시대로 결정 사항으로 기록한다.

- 확정: `kr.dmove.confluence.approval.c9.macro.ApprovalMarkup` **유지**. `c9.ui`로 옮기지 않는다.
- 근거: 스펙 파일 목록이 `c9/macro/`로 적혀 있고(설계 §E.2 헤더의 `c9/ui/`가 스펙과 모순),
  현재 컴파일·가시성·OSGi 노출 문제가 없다. 이동은 순수 리네임 diff만 만든다.
- 감수: `ApprovalPagePanel`이 `c9.macro`를 import하는 구조(Panel:16)가 남는다. 패널이 매크로 패키지에
  의존하는 방향성은 부자연스럽지만 클래스는 공용 유틸이고 순환 참조가 아니다.
- 후속: 설계 §E.2 헤더의 경로 `c9/ui/ApprovalMarkup.java`를 `c9/macro/`로 정정해 문서 모순을 없앨 것
  (선택, 문서 전용).

---

## 3. 회귀 스팟 체크 (2차 PASS 항목)

### 3.1 컨테이너 스코프 모달 셀렉터 (§F.1 / §F.2) ✅ 유지

```js
// js:10
function approvalContainer(element) {
    return element.closest('.dmove-approval-page-panel, .dmove-approval-region');
}
// js:456~464  요청 트리거
var trigger = event.target.closest('.dmove-approval-request-trigger, #dmove-approval-request-action');
// 영역 안 트리거는 그 영역의 모달을, 상단 페이지 액션은 페이지 패널의 모달을 연다.
var scope = approvalContainer(trigger);
var modal = scope ? scope.querySelector('.dmove-approval-modal--request')
                  : document.querySelector('.dmove-approval-page-panel .dmove-approval-modal--request');
// js:613  syncTriggerVisibility
item.hidden = document.querySelector('.dmove-approval-page-panel .dmove-approval-modal--request') === null;
// js:449  pill → 상세
var panel = approvalContainer(detailOpener);
var detailModal = panel && panel.querySelector('.dmove-approval-modal--detail');
// js:525 액션, js:564 제출 — 모두 approvalContainer(...)
```
스코프 없는 `--request` 전역 셀렉터 0건. 주석 문안도 설계와 일치.

### 3.2 낡은 contentVersion (§E.4-b) ✅ 유지

`execute:67` → `ApprovalRegionSupport.target(page.getId(), regionKey, **page.getVersion()**)` →
`renderRequest:77` → `openRegion:157` → `:168 target.contentVersion()`.
`request.target()`을 data 속성에 쓰는 코드 0건. 반려/만료 후 재요청 시 현재 페이지 버전이 실린다.

### 3.3 escape 전수 ✅ 누락 0건

`ApprovalMarkup`의 모든 외부 유입 값이 escape를 통과한다: `dialogTitle`(:143,145,206,211,232),
`statusLabel`(:109,149), `progressLabel`(:151), `expiresAt()`(:160), `nameResolver.apply()`(:318,340),
`decisionLabel`(:320), `eventLabel`(:338), `occurredAt()`(:342), `reason()`(:346), `lead`(:234),
`submitLabel`(:269), emptyPill `label`(:96). 매크로 측은 `ApprovalRegionSupport.escape`
(`openRegion` 170/172/178/183, `appendRegionKey` 208), 패널 측은 자체 `escape`(187/192/195).
int·enum·정적 SVG·고정 안내문·렌더된 XHTML body는 미적용(정상).
`ApprovalMarkup.escape`(:38~47)는 fb912b9 패널 원본과 축자 동일(`& < > " '` 5종).

JS: `innerHTML`은 `iconButton`의 정적 SVG 리터럴(js:92, 주석 js:86)과 `showResults`의 `results.innerHTML=''`
(js:153)뿐. 그 외 전부 `textContent`. 신규 `showEmptyResult`(js:171)는 `replaceChildren()` + `textContent`
— fb912b9의 `renderFlowPreview`(js:238)가 이미 쓰던 API라 신규 호환성 리스크 아님.

### 3.4 JS 계약 클래스·dataset ✅ 보존

`ApprovalMarkup` 산출 요청 모달에서 계약 이름 개수:
`dmove-approval-request`×1, `data-approval-mode`×1, `data-approval-tab`×2, `data-approval-pane`×2,
`approverSearch`×1, `approverGroupSearch`×1, `flowId`×1, `name="steps"`×1,
`dmove-approval-user-results`×1, `dmove-approval-group-results`×1, `dmove-approval-selected-steps`×1,
`dmove-approval-flow-preview`×1, `dmove-approval-empty`×2(direct pane + flow preview, 원본과 동일),
`data-approval-autofocus`×1, `data-approval-scope`×2, `data-approval-close`×8.
`dmove-approval-message`×2는 detail 모달 footer 1 + 요청 모달 footer 1(서로 다른 모달) — 정상.
JS가 생성하는 `-select-user/-group`, `-step-up/-down/-remove`, `-step-order`, `-step-avatar/-body/-meta`
전부 생존. 신규 CSS 훅 `data-step-type`(css:280), `.dmove-approval-results__empty`(css:576),
`.dmove-approval-step-avatar`(css:266) 모두 JS 생성물과 연결됨.

### 3.5 패널 1 + 매크로 2 공존 시나리오 ✅ (i)~(iv) 전부 정상

| # | 질문 | 결과 | 근거 |
|---|------|------|------|
| (i) | 상단 "승인 요청" 트리거 | **패널 모달** | `#dmove-approval-request-action`은 두 컨테이너 밖 → `approvalContainer` null → `.dmove-approval-page-panel .--request` 폴백 |
| (ii) | 매크로 pill / 매크로 요청 버튼 | **자기 컨테이너만** | pill은 `approvalContainer(pill).querySelector('.--detail')`, 요청 버튼은 `<header>` 안이라 `closest`가 자기 `section`을 잡고 두 모달 모두 `</section>` 앞에 렌더(Macro:137~154) |
| (iii) | ESC | **열린 모달만** | backdrop이 화면을 덮어 동시 오픈 경로 없음 → 문서 순서 첫 요소 = 그 모달 |
| (iv) | 승인/반려 POST | **자기 dataset** | 액션 버튼은 detail 모달 footer = 자기 `section` 자손 → `approvalContainer(button).dataset`. `openRegion`이 `data-approval-request-id`/`-actor-key`를 매크로에도 출력(:176~185) |
| 보너스 | 실패 메시지 위치 | 올바름 | `showMessage`가 `closest('.dmove-approval-request, .dmove-approval-modal')` 우선(js:14) |
| 보너스 | 요청 제출 URL | 올바름 | `container.dataset.approvalRegionKey` 유무로 CONTENT_REGION/PAGE 판정 |
| 보너스 | **id 유일성** | ✅ **해소** | M-1 수정으로 `id` 0건 — 매크로 N개여도 중복 없음 |
| 보너스 | 컨테이너 직속 `.dmove-approval-message` | 매크로당 1개 | Macro:101/135. 모달 안의 것은 modal box 자손 |

### 3.6 §H 접근성 체크리스트 (요청 모달 · 영역 매크로) ✅ 전항 충족

`role="dialog" aria-modal aria-label` ✅ / **id·for 0건** ✅ / `.dmove-approval-scope[aria-label="승인자 검색 대상"]` ✅
/ 순서 버튼 `aria-label` + `<svg aria-hidden>` ✅ / 첫·끝 `disabled` + disabled 시 포커스 이동(js:505~520) ✅
/ `selected-steps[aria-live]`·`step-summary[aria-live]` ✅ / 그룹·사용자 아바타 형태(css:280) + 메타 텍스트
("그룹 · 전원 승인" / "그룹 · 한 명 승인", js:492) 이중 표현 ✅ / `.dmove-approval-results__empty` ✅
/ 푸터 `flex-wrap` + `flex:1 1 200px`(css:210) ✅ / pill button vs span ✅ / 컨테이너당 message 1개 ✅
/ 중복 key 경고는 영역 안(Macro:189) ✅ / focus-visible 2px ✅(M-2 해소분).

단, §H 체크리스트 문장 자체(design:1810)는 §2.2의 문서 정정 대상.

### 3.7 압축·재포매팅 감지 ✅

`git diff --check` exit 0. statement 한 줄 합침 0건, `append` 체이닝 0건(다중 라인 `.append()` 체인은
`openPanel`/`openRegion`의 fb912b9 원본 스타일 유지). 200자 초과는 ICON_* 리터럴 5줄뿐.
CSS 300자 초과 4줄(805,806,824,825)은 배치 4a의 mask data-URI — 기존.
라인 수 감소(패널 −278, 매크로 −51)가 C-2 이관을 정량적으로 확인해 준다. 2차 QA가 예측한
"패널 200줄 이하 / 매크로 250줄 이하"에는 각각 250 / 298로 못 미치지만, 남은 것은 전부 생존 지시
메서드(권한·컴포넌트 조회·displayName 캐시·resolvePage 등)라 추가 삭감 여지가 없다.

---

## 4. 신규 발견 (이번 라운드 최초 검출)

| # | 등급 | 내용 |
|---|---|---|
| N-1 | 경미 | **설계 §D.5 잔여 누락 5건** — §2.3 표. `modal--request .modal__box{width:600px}` 규칙 1개 + `line-height:1.5` / `border-bottom-color:transparent` / `font-variant-numeric:tabular-nums` / `flex:none` 4개 프로퍼티. 전부 cosmetic |
| N-2 | 중대(문서) | **설계 §D.3 트리(689·693)·산문(722)·§H(1810) 미정정** — 여전히 1차 C-1 버그 형태(`<label class="sr-only">`로 input을 감싸기)를 지시. 코드는 옳으므로 배포 영향 0이나 §I C10 이식 시 재발 확실. **커밋 전 수정 권고** |
| N-3 | 경미 | **`syncStepEmptyState`의 `summary.hidden` 3줄 미원복** — 설계 §D.4-h "변경 없음" 위반. `:empty`와 이중 관리. 동작 동일, 위생 문제 |
| N-4 | 경미 | **`ApprovalPagePanel.escape`(:240~249)가 `ApprovalMarkup.escape`와 축자 중복.** 설계 §E.2는 패널 `escape` **삭제** 지시, qa-4b2 §2 생존 목록은 **존치** 지시 — 두 문서가 모순이다. 현재 `openPanel`(:187,192,195)에서 실사용 중이라 죽은 코드는 아니다. `ApprovalMarkup.escape` 호출로 바꾸면 10줄이 사라진다. **다음 배치에서 어느 쪽인지 확정할 것** |
| N-5 | 경미 | **Java 빈 줄 2연속 2곳** — `ApprovalRegionMacro:197`(`appendDuplicateWarning` 뒤), `ApprovalPagePanel:239`(`asPage` 뒤). 삭제 흔적. m-8 잔여 |
| N-6 | ➖ | 매크로 고유 한글 문구 8개 소실 — §2.4 표. 전부 패널판 축약본이라 **의도된 통합 결과**, 문제 없음. 기록만 |

---

## 5. 커밋 전 권고 (전부 선택 — 배포 차단 아님)

1. **N-2 (권고 강함)** — 설계 `design-inbox-sidebar.md` 4줄 정정. 코드 변경 없음.
   `689~690`, `693`, `722`, `1810`을 `<label><span class="dmove-approval-sr-only">…</span><input …/></label>`로.
   `§E.2` 헤더 경로 `c9/ui/` → `c9/macro/`도 함께(m-9 결정 반영).
2. **N-1** — CSS 5건 보충(1 규칙 + 4 프로퍼티).
3. **N-3** — `syncStepEmptyState`에서 `summary.hidden` 3줄 제거(js:324~327).
4. **N-5** — 빈 줄 2곳 정리.
5. **N-4** — 패널 `escape` 존치/삭제를 다음 배치 스펙에서 확정.
6. 커밋 직전 `scripts/build.ps1 -Target confluence9` 1회(패키징 + `Assert-AdapterArtifact` 미검증분).

1·2·3·4는 합쳐 15줄 미만이며 다음 배치에 이월해도 무방하다.
