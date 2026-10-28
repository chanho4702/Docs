# QA 4b — 승인 요청 모달 재설계 + approval-region 매크로 pill/모달 통일

- 기준 커밋: `fb912b9` / 대상: 미커밋 워킹트리
- 스펙: `_workspace/spec-4b-modal-macro.md` / 설계: `_workspace/design-inbox-sidebar.md` §D §E §F §G §H
- 검증일: 2026-08-11

## 판정: **FAIL**

치명 1건 + 중대 4건 + 경미 6건. 설계 발견 2건(컨테이너 스코프, 낡은 contentVersion)은 **정확히 해소**됐고
공용 헬퍼 추출·escape·JS 계약·빌드도 통과했으나, **요청 모달의 승인자 검색 input이 화면에서 사라지는**
CSS/마크업 결합 버그로 배치 4b의 주 기능이 동작하지 않는다.

## 변경 파일 (허용 범위 준수 ✅)

| 파일 | 증감 |
|------|------|
| `c9/panel/ApprovalPagePanel.java` | 528 → 170 (마크업 전량 이관) |
| `c9/macro/ApprovalRegionMacro.java` | 349 → 207 |
| `c9/macro/ApprovalMarkup.java` | 신규 173 |
| `resources/js/approval.js` | 527 → 624 |
| `resources/css/approval.css` | 690 → 880 |

허용 목록 외 파일 수정 0건. 테스트 수정 0건(불필요).

---

## 1. 자동 게이트

| 게이트 | 결과 |
|--------|------|
| `node --check approval.js` | ✅ PASS |
| `git diff --check` | ✅ PASS (exit 0) |
| `mvn -B -pl approval-confluence9 -am test` | ✅ BUILD SUCCESS, Tests run 48 / F0 / E0 |
| `document.querySelector('.dmove-approval-modal` 전역 셀렉터 | ✅ 0건 |
| `request.target()` 을 data 속성에 쓰는 코드 | ✅ 0건 |
| CSS `region__timeline\|__approvers\|__count\|__actions\|region-request` | ✅ 0건 |
| CSS `page-panel__count\|__version\|__actions\|page-request` | ✅ 0건 |
| 요청 모달 `id=` / `for=` | ✅ 0건 |

> 패키징(`clean verify` + `Assert-AdapterArtifact`)은 미검증. 지시대로 `test` 페이즈까지만 돌렸다.

---

## 2. 치명 (배포 불가)

### C-1. 요청 모달의 승인자/그룹 검색 input이 화면에서 사라진다 — 직접 지정 탭 사용 불가

`ApprovalMarkup.requestDialog`(:142)가 input을 sr-only 라벨 **안에** 넣었다.

```html
<div data-approval-scope-pane="user" …>
  <label class="dmove-approval-sr-only"><span>이름 또는 계정으로 검색</span>
    <input type="search" name="approverSearch" class="text" …/></label>
  <ul class="dmove-approval-results dmove-approval-user-results" hidden></ul>
</div>
```

`approval.css:782`
```css
.dmove-approval-sr-only { position:absolute; width:1px; height:1px; padding:0;
    margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
```

라벨이 1×1 절대배치 + `overflow:hidden` + `clip` 이므로 **자손인 input까지 클리핑**된다. 정적 배치 자손은
`overflow:hidden`을 탈출하지 못한다. 그룹 검색 input(같은 구조)도 동일.

동작 추론: 요청 모달을 열면 "승인자 추가" 라벨과 사용자/그룹 세그먼트만 보이고 **입력창이 없다**.
`openModal`의 `modal.querySelector('input, select')`가 이 보이지 않는 input에 포커스를 주므로 커서도
사라진 것처럼 보인다. 패널·매크로 양쪽 모두. 직접 지정 = 요청 생성의 기본 경로이므로 4b 전체가 무의미.

설계 §D.3의 트리는 `label.dmove-approval-sr-only > span` 으로 **라벨이 span만 감싼다**고 그렸는데,
바로 아래 산문이 "…`<label class="dmove-approval-sr-only">`로 감싼다"라고 써서 오해를 유발했다.
접근성 관용구는 **span에 sr-only**를 거는 쪽이다.

**재작업 지시**
```java
// requestDialog — 사용자/그룹 검색 두 곳 모두
<label><span class="dmove-approval-sr-only">이름 또는 계정으로 검색</span>
  <input type="search" name="approverSearch" class="text" placeholder="…" autocomplete="off"/></label>
```
그리고 `.dmove-approval-modal__body label{display:block;margin-top:12px;font-weight:600}`(:154)이
이 라벨에도 걸리므로 CSS 보정 1줄을 추가한다.
```css
[data-approval-scope-pane] > label { margin-top: 0; }
```
설계 §D.3 트리/산문도 같은 형태로 정정할 것.

---

## 3. 중대

### M-1. `ApprovalMarkup.java` 압축 — 2,702자짜리 한 줄

라인 길이 상위: **2702**(:142 requestDialog), 489(:137), 420(:140), 382(:141), 381(:166), 363(:151).
이관 원본인 `ApprovalPagePanel`은 `.append()` 한 줄 = 최대 117자였다(diff의 `-` 라인 참조).
스펙 "코드 스타일: statement 한 줄, 재포매타·압축 금지" 정면 위반이며, 하네스가 과거에 잡았던
"파일 3개를 한 줄로 압축" 사건의 재발이다. 리뷰·후속 diff가 전부 불가능해진다.

**재작업 지시**: 이관 전 `ApprovalPagePanel`의 포매팅 규칙(태그 단위 `.append()` 개행, 100자 내외)을
그대로 복원한다. 새 마크업(scope 세그먼트, field__row 등)도 같은 규칙으로 쓴다.
`appendSteps`의 `if (!first) { html.append(", "); }`(:154)도 3줄로 편다.

### M-2. CSS를 "교체"하지 않고 파일 끝에 오버라이드로 덧붙였다 — 중복 정의 10쌍

스펙 "중복 정의를 남기지 말 것", 설계 D-10(헤더 2중 선언 제거)이 지시였는데 오히려 늘었다.

| 셀렉터 | 선언 위치 |
|--------|-----------|
| `.dmove-approval-modal__header` | 132, 305, **480** (3회) |
| `.dmove-approval-modal__header h2` | 139, 486 |
| `.dmove-approval-modal__body` | 149, 492 |
| `.dmove-approval-modal__footer` (+ `.message`) | 166/175, 496/501 |
| `.dmove-approval-tabs` | 327, 510 |
| `.dmove-approval-tab` / `[aria-selected="true"]` | 334/345, 520/528 |
| `.dmove-approval-results` | 390, 572 |
| `.dmove-approval-selected-step` | 196, 585 |
| `.dmove-approval-step-order` | 207, 604 |
| `.dmove-approval-region__header` | 8, 660 |

최종 계산값은 대체로 설계와 일치하지만(뒤 규칙이 이김), **실제 충돌 1건**이 있다:
`.dmove-approval-step-controls .aui-button{min-width:20px;padding:0 4px;line-height:1}`(:230)은
설계 §D.5가 "삭제"라고 못박은 규칙인데 살아 있고, 특이도 (0,2,0) > `.dmove-approval-step-btn`(0,1,0)이라
새 규칙의 `padding:0`을 **이긴다**. 24×24 아이콘 버튼에 좌우 4px 패딩이 그대로 붙는다.

**재작업 지시**: 앞쪽 원본 규칙을 설계 §D.5/§E.5의 전문으로 직접 교체하고 말미 오버라이드 블록을 제거.
`.dmove-approval-step-controls .aui-button` 규칙은 삭제. `.dmove-approval-region__header{justify-content:initial}`
같은 "되돌리기용" 선언도 원본 교체로 없앤다.

### M-3. `approval.js addStep` 죽은 코드 3줄 — 편집 미완 흔적

```js
134  controls.appendChild(iconButton('dmove-approval-step-up',   label + ' 순서 올리기', '↑'));
135  controls.appendChild(iconButton('dmove-approval-step-down', label + ' 순서 내리기', '↓'));
136  controls.appendChild(iconButton('dmove-approval-step-remove', label + ' 제거', '×'));
137  controls.replaceChildren(
138      iconButton('dmove-approval-step-up',   label + ' 순서 올리기', ICON_UP), …);
```
옛 글리프 버튼 3개를 만들고 바로 버린다. 결과 DOM은 옳지만 승인자 추가 1회당 버튼 6개를 생성한다.
설계 §D.4-b에는 `appendChild` 3줄만 있고 `replaceChildren`는 없다.

**재작업 지시**: 134~136행 삭제. 137~141의 `replaceChildren`를 설계대로 `appendChild` 3줄로 되돌린다.

### M-4. 지시 외 문구·주석 삭제 (패널 detail 모달 안내 품질 저하)

이관 과정에서 문자열이 조용히 짧아졌다. 설계 §E.2는 "ICON_* 문자열 리터럴 변경 금지"만 적었지만
스펙은 "지시 외 변경 금지"다.

| 항목 | 이전 | 현재 |
|------|------|------|
| `requiresReapproval` 안내 | "승인이 끝난 뒤 페이지가 수정되어 **v3 승인분이** 무효가 되었습니다. **다시 승인을 받으려면 승인 요청을 새로 올려야 합니다.**" | "승인 뒤 페이지가 수정되어 재승인이 필요합니다." |
| `expiredByEdit` 안내 | "…요청이 무효가 되었습니다. **지금까지 받은 승인은 초기화되었습니다.**" | "승인 진행 중 페이지가 수정되어 요청이 무효가 되었습니다." |
| 진행 중 요청 모달 본문 | "…있습니다. **승인이 끝나거나 반려·만료된 뒤에 새 요청을 만들 수 있습니다.**" | 앞 문장만 |
| 페이지 요청 모달 lead | "승인자를 순서대로 지정하면 앞 단계가 승인해야 다음 사람 차례가 됩니다." | "승인자를 순서대로 지정합니다." |
| 대기 hint | "…**앞** 단계를 기다리는 중입니다." | "…**이전** 단계를 기다리는 중입니다." |

승인 버전(`approvedVersion`)을 안내에 끼워 넣던 분기가 통째로 사라져 "어느 버전 승인이 무효가 됐는지"를
알 수 없게 됐다. 함께 삭제된 설명 주석: 패널 클래스 Javadoc(REST 재검증 근거), `displayName` 캐시 주석,
`resolveActorKey` 주석, `appendSteps` 주석, 매크로의 region key 기본값 주석·AO 읽기 횟수 주석.

**재작업 지시**: 위 5개 문자열을 이전 내용으로 복원(`requiresReapproval`은 `approvedVersion` 분기 포함).
삭제된 주석 6개 복원. 이관은 위치 이동이지 재작성이 아니다.

---

## 4. 경미

| # | 내용 |
|---|------|
| m-1 | `ApprovalMarkup` 패키지가 설계 §E.2의 `c9.ui`가 아닌 `c9.macro`. 다만 스펙의 파일 목록이 `c9/macro/ApprovalMarkup.java`로 적혀 있어 **스펙 자체가 모순**이다. 컴파일·가시성 문제 없음. 다음 배치 전에 어느 쪽인지 확정할 것 |
| m-2 | 설계 §D.5 CSS 누락 6건: `.dmove-approval-tab:hover`, `.dmove-approval-tab:focus-visible`, `.dmove-approval-scope__btn:focus-visible`, `.dmove-approval-step-btn:hover:not([disabled])`, `.dmove-approval-step-remove:hover`, `.dmove-approval-flow-preview .dmove-approval-selected-step{box-shadow:none}` + 연결선 `::before{display:none}`. 앞 3건은 §H 접근성 체크리스트("`:focus-visible` 아웃라인 2px") 미충족. Flow 미리보기 카드에 그림자·점선 연결선이 그대로 뜬다 |
| m-3 | `.dmove-approval-empty` 교체(padding 16px 12px / background #fafbfc / radius 6px) 미반영 — 기존 규칙 유지 |
| m-4 | ESC 핸들러를 `document.querySelector(...)` → `Array.from(document.querySelectorAll(...))[0]` 으로 변경. 결과 동일(문서 순서 첫 요소)하고 설계 §F.3은 "변경 불필요"로 분류한 코드다. 무의미한 diff |
| m-5 | 죽은 자산 잔존: CSS `.dmove-approval-flow-label`, `.dmove-approval-approver-picker`(매크로 인라인 폼 제거로 미사용), `ApprovalRegionSupport.escape`(프로덕션 호출 0건, 테스트만) — escape 구현이 2벌이라 "공용 헬퍼" 취지와 어긋난다 |
| m-6 | `activeMode()` 주석 "탭이 없는 영역 매크로 form은…"이 이제 거짓(매크로도 탭을 가진다). 동작 무해. CSS 삭제 자리에 빈 줄 2연속 3곳(:30-31, :46-47 등) |

---

## 5. 통과 항목 (동작 추론 포함)

### 5.1 설계 발견 2건 — 모두 해소 ✅

**(a) 컨테이너 스코프**
- `approval.js:454-466` 요청 트리거: `approvalContainer(trigger)`(`.dmove-approval-page-panel, .dmove-approval-region`)로 상향 탐색 후 그 안의 `--request` 모달을 연다. 컨테이너 밖(`#dmove-approval-request-action`, 페이지 상단 액션)이면 `null` → `.dmove-approval-page-panel .dmove-approval-modal--request` 폴백. 설계 §F.1 문안과 동일.
- `approval.js:610` `syncTriggerVisibility`: `.dmove-approval-page-panel .dmove-approval-modal--request` 로 스코프. "편집 권한 없음 + 영역 모달만 존재" 상황에서 상단 버튼이 뜨는 오작동 차단. 설계 §F.2 동일.

**(b) 낡은 contentVersion**
- `execute`가 `ApprovalRegionSupport.target(page.getId(), regionKey, page.getVersion())`으로 만든 `target`을 `renderRequest(target, …)` → `openRegion(html, target, …)`으로 전달. `request.target()` 사용 0건. 반려/만료 후 재요청 시 현재 페이지 버전이 `data-approval-content-version`에 실린다.

### 5.2 ApprovalMarkup 실제 공유 ✅ (복붙 아님)

패널과 매크로 양쪽이 동일 메서드를 호출한다. 마크업 문자열 중복 0건.

| 헬퍼 | 패널 | 매크로 |
|------|------|--------|
| `emptyPill` | renderEmpty | renderEmpty |
| `pill` | renderRequest | renderRequest |
| `detailDialog` | renderRequest | renderRequest |
| `requestDialog` | 양쪽 | 양쪽 |
| `escape` / `ICON_*` | openPanel | openRegion·appendRegionKey |

패널에 남은 것은 `displayName`/`resolvePage`/`resolveActorKey`/`openPanel`뿐 — 설계 §E.2 그대로.
매크로에서 `appendHeader`·`appendApprovers`·`appendTimeline`·`appendRequestForm`·`statusModifier`·
`decisionLabel`·`eventLabel` 7개 삭제 확인(§E.4-g), `appendBody`에서 message span 분리 확인.

### 5.3 패널 1 + 매크로 2 공존 시나리오 ✅

| 질문 | 결과 | 근거 |
|------|------|------|
| (i) 상단 "승인 요청" 트리거가 여는 모달 | **패널의 것** | `#dmove-approval-request-action`은 어느 컨테이너에도 속하지 않아 `approvalContainer`가 null → `.dmove-approval-page-panel .--request` 폴백 |
| (ii) 매크로 pill / 요청 버튼 | **자기 컨테이너만** | pill은 `[data-approval-detail-open]` 분기 → `approvalContainer(pill).querySelector('.--detail')`. 요청 버튼은 헤더 안에 있어 `closest`가 자기 `section`을 잡는다. 두 모달 모두 `</section>` 앞에 렌더 |
| (iii) ESC | **열린 모달만** | backdrop이 화면 전체를 덮어 동시에 둘이 열리는 경로가 없다(설계 §F.3 전제 유지). 열린 것 1개 → 그것만 닫힘 |
| (iv) 승인/반려 POST | **자기 dataset** | 액션 버튼은 detail 모달 footer = 자기 `section` 자손 → `approvalContainer(button).dataset.approvalRequestId/ActorKey`. `openRegion`이 두 속성을 매크로에도 출력 |
| 보너스: 실패 메시지 | 올바른 곳 | `showMessage`가 `closest('.dmove-approval-request, .dmove-approval-modal')` 우선 → 해당 모달 footer의 `.dmove-approval-message`. 컨테이너 직속 message span은 매크로당 정확히 1개(§H 충족) |
| 보너스: 요청 제출 | 올바른 URL | `resourceType`은 `container.dataset.approvalRegionKey` 유무로 판정 → 매크로는 CONTENT_REGION + regionKey, 패널은 PAGE |
| 보너스: 중복 id | 없음 | 요청 모달 `id=`/`for=` 0건, 감싸는 `<label>` 방식 |

### 5.4 JS 계약 보존 ✅

`dmove-approval-select-user/-group`(JS 생성), `-step-up/-down/-remove`, `-selected-steps`,
`input[name=steps]`, `approverSearch`, `approverGroupSearch`, `flowId`, `data-approval-tab/-pane/-mode/
-close/-autofocus`, `li[data-step-type][data-step-key]` 전부 생존. 각 이름 요청 모달당 정확히 1개.
`stepList`/`stepItems`/`syncSteps`는 여전히 `.dmove-approval-step-order`와 `li.dataset`만 읽으므로
`.dmove-approval-step-label`이 `-step-body` 안으로 한 겹 들어간 것이 계약을 깨지 않는다(설계 주석대로).
`renderFlowPreview`가 만드는 `ol.dmove-approval-selected-steps`는 direct pane 뒤에 오므로
`form.querySelector`가 잡는 첫 목록은 여전히 direct 쪽이다.
신규 추가는 설계 §D.2 "추가되는 것" 목록과 일치(`-scope`, `-scope__btn`, `data-approval-scope(-pane)`,
`-step-avatar/-body/-meta/-summary/-btn`, `-results__empty`, `-field__row`).
dataset은 `data-approval-can-request`가 매크로에 신규 추가 — 설계 §E.4-c 지시대로.

### 5.5 escape 전수 (§5.7 표) ✅ 누락 0건

| 값 | 위치 | escape |
|----|------|--------|
| `statusLabel` | Markup:83(pill), :102(detail) | ✅ |
| `progressLabel` | Markup:103 | ✅ |
| `nameResolver.apply(key)` | Markup:156, :166 | ✅ |
| `decisionLabel` / `eventLabel` | Markup:156 / :166 | ✅ |
| `event.reason()` | Markup:167 | ✅ |
| `occurredAt().toString()` / `expiresAt().toString()` | Markup:166 / :108 | ✅ |
| `dialogTitle` / `lead` / `submitLabel` / emptyPill `label` | Markup:100,101,135,137,140,142,75 | ✅ |
| `regionKey` / `status` / `requestId` / `actorKey` | Macro openRegion·appendRegionKey | ✅ |
| int·Integer (`step.order()`, `approvedVersion`, 단계 수, pageId, contentVersion) | 전역 | 미적용(정상) |
| enum `name().toLowerCase()` | statusModifier·pillModifier·타임라인 class | 미적용(정상) |
| 정적 SVG `ICON_*`, 고정 안내 문구 | 전역 | 미적용(정상) |

`ApprovalMarkup.escape`는 이관 원본과 문자 대 문자 동일(`& < > " '` 5종).
JS 쪽도 `textContent`만 사용, `innerHTML`은 파일 내 정적 SVG 리터럴 3개뿐(주석으로 근거 명시).

### 5.6 매크로 공유 CSS ✅ (삭제 금지 목록 생존)

`.dmove-approval-region`(:1), `__body`(:18), `__notice`(:22) 유지. 설계 §E.3 개명
(`__progress`/`__version`/`__deadline`) 완료, 구 클래스 잔존 0건. `.dmove-approval-steps`·
`.dmove-approval-timeline`·`.dmove-approval-modal--detail .dmove-approval-steps{flex-direction:column}`
가 살아 있어 매크로 detail 모달의 단계/타임라인도 패널과 같은 세로 레이아웃으로 렌더된다.
삭제로 패널이 깨지는 규칙은 없다(중복 문제는 M-2 참조).

---

## 6. 재작업 지시 요약 (우선순위)

1. **C-1** sr-only를 label → 내부 span으로 옮기고 `[data-approval-scope-pane] > label{margin-top:0}` 보정. 설계 §D.3 문안도 정정.
2. **M-1** `ApprovalMarkup.java` 전체를 이관 원본 포매팅(태그 단위 개행, 100자 내외)으로 재작성.
3. **M-2** `approval.css` 앞쪽 원본 규칙을 설계 §D.5/§E.5 전문으로 **교체**하고 말미 오버라이드 블록 삭제. `.dmove-approval-step-controls .aui-button` 삭제. m-2/m-3의 누락 규칙 6건 포함.
4. **M-3** `addStep` 134~136행 삭제, `replaceChildren` → `appendChild` 3줄.
5. **M-4** 문구 5개·주석 6개 복원(`approvedVersion` 분기 포함).
6. **m-4** ESC 핸들러 원복. **m-5** 죽은 CSS 2개·`ApprovalRegionSupport.escape` 정리. **m-6** `activeMode` 주석 갱신, 빈 줄 정리.
7. **m-1** `ApprovalMarkup` 패키지를 `c9.ui`로 옮길지 `c9.macro`로 확정할지 스펙에서 결정(현 상태 유지도 무방).

재검증 시 `mvn -B -pl approval-confluence9 -am test` + `node --check` 재실행, 그리고 요청 모달을
실제로 열어 **검색 input이 보이는지**를 반드시 확인할 것.
