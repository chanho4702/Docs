# QA 배치 3 — 페이지 패널 pill + 상세 모달

- 대상 스펙: `_workspace/spec-3-panel.md` / 설계 `_workspace/design-ui-overhaul.md` §1.3~1.6, §3.1~3.7, §4, §5
- 기준 커밋: `05f536e` (미커밋 워킹트리 검증)
- 검증 일시: 2026-08-11

## 판정: **PASS (조건부)**

배치 3 스펙 항목·완료 기준은 **전부 충족**했다. 파일 범위 위반 0건, escape 규칙 위반 0건,
매크로 공유 CSS 손실 0건, 압축·재포매팅 0건, 빌드/테스트 그린.

다만 **설계 문서 자체에 있던 결함 2건이 코드 스니펫 그대로 이식**되어 실제 동작 결함으로 남았다
(구현자는 설계를 충실히 따랐으므로 구현 과실 아님). 아래 M-1, M-2는 후속 배치에서 **반드시** 고쳐야 한다.

---

## 1. 변경 범위

```
approval-confluence9/.../panel/ApprovalPagePanel.java   +154 / -?   (444 → 528 라인)
approval-confluence9/src/main/resources/css/approval.css +198       (538 → 662 라인)
approval-confluence9/src/main/resources/js/approval.js   +42        (505 → 527 라인)
```

`git status --porcelain` = 위 3개 파일만 `M`. **허용 외 파일 변경 0건.**
`ApprovalRegionMacro.java` 미수정 확인. ✅

## 2. 스펙 항목 대조

| # | 항목 | 결과 | 근거 |
|---|------|------|------|
| 1 | §1.3 renderEmpty — `<span>` pill + 메시지 span만 | ✅ | `ApprovalPagePanel.java:111-122`. pill이 `<span class="dmove-approval-pill dmove-approval-pill--none">`(버튼 아님) |
| 1 | §1.4 renderRequest — 배너에 pill+메시지만, 나머지 모달로 이동 | ✅ | `:136-144` = openPanel → appendPill → message → detail → request → `</div>`. 그 외 요소 없음 |
| 2 | §1.5 요청 모달 `--request` (두 갈래) | ✅ | `:310`(alreadyOpen), `:324`(폼) 둘 다 `dmove-approval-modal dmove-approval-modal--request` |
| 3 | §1.6 아이콘 6종 + `iconFor` | ✅ | `:44-54` ICON_PENDING/APPROVED/REJECTED/EXPIRED/NONE/CARET. path `d` 값 설계 표와 문자 단위 일치. 전부 `aria-hidden="true"` |
| 4 | §3.1 showMessage 셀렉터 | ✅ | `approval.js:15` `closest('.dmove-approval-request, .dmove-approval-modal')` |
| 4 | §3.2 modalOf 삭제 | ✅ | 저장소 전체 `modalOf` 0건, 잔존 호출부 없음 |
| 4 | §3.3 opener 기억 + aria-expanded + 포커스 복귀 | ⚠️ | 로직은 구현(§3.3 코드 그대로). 포커스 **대상 선정**에 결함 → M-1 |
| 4 | §3.4 detail pill 분기 + `--request` 분리 | ✅ | `approval.js:356-373`. tab 처리 직후·closer 앞, 공통 버튼 매칭보다 위 |
| 4 | §3.7 syncTriggerVisibility | ✅ | `approval.js:514` `.dmove-approval-modal--request` |
| 5 | §4.1 CSS 삭제 5블록 | ✅ | `page-panel__timeline/__approvers/__decision/__summary/__waiting` 전부 제거 |
| 5 | §4.2 변경 2블록 | ✅ | `.dmove-approval-page-panel`(css:103-112), `--detail .dmove-approval-steps/step`(css:375-385) 설계와 프로퍼티 일치 |
| 5 | §4.3 추가 전량 | ✅ | pill 12블록 / 상세 모달 4블록 / 타임라인 7블록 / sr-only 1블록 — 값까지 설계와 일치, 새 색 발명 0건 |
| 6 | §5.1~5.6 Java 렌더링 | ✅ | 아래 상세 |
| 6 | §5.7 escape 규칙 표 | ✅ | 전수 확인, 아래 §3 |

## 3. 핵심 위험 검사 결과

### (a) escape 규칙 — **PASS**

전수 확인 (`appendPill` / `appendDetailDialog` / `appendTimeline` / `appendSteps`):

| 값 | 위치 | escape | 판정 |
|----|------|--------|------|
| `settings.statusLabel(...)` | pill label `:156`, 모달 lead `:192` | 적용 | ✅ |
| `progressLabel(request)` | `:195` | 적용 | ✅ |
| `displayName(...)` | 타임라인 `:286`, 단계 `:268` | 적용 | ✅ |
| `decisionLabel(...)` | `:270` | 적용 | ✅ |
| `eventLabel(...)` | `:284` | 적용 | ✅ |
| `event.occurredAt().toString()` | `:288` | 적용 | ✅ |
| `event.reason()` | `:292` | 적용 | ✅ |
| `Math.min(currentStepOrder, size)`, `steps().size()` | pill step `:160-162` | 미적용 | ✅ (int) |
| `approvedVersion` (Integer) | `:199`, `:211` | 미적용 | ✅ |
| `myStepOrder`, `step.order()` | `:225`, `:259` | 미적용 | ✅ (int) |
| `event.type().name().toLowerCase(ROOT)` | `:282` | 미적용 | ✅ (enum) |
| `pillModifier/statusModifier` | `:149`, `:191` | 미적용 | ✅ (enum 파생) |
| `ICON_*` | `:153`, `:171`, `:115` | 미적용 | ✅ (정적 리터럴) |
| sr-only "재승인 필요"/"요청 무효" | `:168` | 미적용 | ✅ (리터럴) |

**동적 문자열 중 escape 누락 0건.** `escape()` 구현(`:518-527`) 미변경.

### (b) 모달 클래스 분리 — **PASS**

- `--request`: `appendRequestDialog` 두 갈래 모두 부여 (`:310`, `:324`).
- `--detail`: `appendDetailDialog` 단일 지점 (`:184`).
- 요청 트리거: `document.querySelector('.dmove-approval-modal--request')` (`js:368`) — detail을 열 수 없음.
- pill 분기: `panel.querySelector('.dmove-approval-modal--detail')` (`js:360`) — request를 열 수 없음.
  게다가 `approvalContainer()`로 패널 스코프를 먼저 잡으므로 다른 패널의 모달을 잡을 수 없다.
- `syncTriggerVisibility`: `--request`만 관측 (`js:514`).
- **수식어 없는 단독 `querySelector('.dmove-approval-modal')` = 0건.**
  남은 두 곳은 의도된 것: `js:378` `closer.closest(...)`(어느 모달이든 닫아야 함),
  `js:451` ESC의 `:not([hidden])`(설계 §3.6 "변경 없음").

### (c) 매크로 공유 CSS 생존 — **PASS**

`ApprovalRegionMacro`가 실제로 사용하는 클래스를 매크로 소스에서 추출해 CSS와 교차 확인:

- 생존 확인: `.dmove-approval-status`(css:71) / `--pending/approved/rejected/expired/none`(81~101),
  `.dmove-approval-steps`(291), `.dmove-approval-step__order/__decision/__approvers`(322~339),
  `.dmove-approval-step--current/--passed`, `.dmove-approval-notice`(344) / `--warning`(351),
  `.dmove-approval-page-panel__count`(114), `.dmove-approval-page-panel__version`(357),
  `.dmove-approval-hint`(236), `.dmove-approval-region__*` 전량(1~67, 358).
- 매크로는 `.dmove-approval-region__timeline`을 쓰고 삭제된 것은 `.dmove-approval-page-panel__timeline` —
  **다른 클래스**임을 확인. 매크로 회귀 없음.
- `ApprovalRegionMacro.java` 미수정 (git status).

### (d) JS 동작 추론 — **1건 결함(M-1) 외 PASS**

- pill 클릭 → `[data-approval-detail-open]` 매칭 → `approvalContainer()`가 `.dmove-approval-page-panel`을
  잡고 그 안의 `--detail` 모달을 연다. opener 저장 + `aria-expanded=true`. ✅
  (pill 안 SVG `<path>`가 `event.target`이어도 `Element.closest`로 정상 상승)
- 승인/반려: `button.closest('.dmove-approval-request')`는 null이지만 역참조 없이 통과하고,
  `approvalContainer(button)` → detail 모달의 조상인 패널 div에서
  `data-approval-request-id` / `data-approval-actor-key`를 읽는다. **정상 동작.** ✅
- `showMessage(button, …)`: `closest('.dmove-approval-modal')` → detail 모달 →
  그 안의 유일한 `.dmove-approval-message`(footer)에 기록. 배너의 숨은 span으로 새지 않음. ✅
  요청 폼 submit은 `.dmove-approval-request`(form)가 더 가까워 기존 동작 유지. ✅
  매크로(`.dmove-approval-region`)에는 모달이 없어 폴백 경로 그대로. ✅
- backdrop / 닫기 버튼 / footer 닫기: 전부 `data-approval-close="1"` → `closer.closest('.dmove-approval-modal')`. ✅
- ESC: `.dmove-approval-modal:not([hidden])` → `closeModal` → opener 포커스 복귀 + `aria-expanded=false`. ✅
- `document.body.contains(modalOpener)` 가드로 DOM에서 사라진 opener 포커스 시도 방지. ✅
- **결함 M-1**: 포커스 대상 선정 (아래).

### (e) SVG 아이콘 — **PASS**

- 6종 상수 존재, `viewBox="0 0 20 20" width/height=20 fill="currentColor" aria-hidden="true"` 통일.
- `iconFor` switch가 `PENDING/APPROVED/REJECTED/EXPIRED` 4개 전부 커버.
  `ApprovalStatus`는 정확히 이 4개(`ApprovalStatus.java`)이며 **default 없는 arrow switch expression이
  컴파일에 성공했다는 사실이 exhaustive를 증명**한다(값 추가 시 컴파일 실패 → 안전).
- `ICON_NONE`은 `renderEmpty`가 직접 사용, `ICON_CARET`은 `appendPill` 말미.
- 타임라인 `is-{eventType}`: `ApprovalEventType`는 REQUESTED/APPROVED/REJECTED/EXPIRED 4개,
  CSS는 approved/rejected/expired 3개만 색 지정 → requested는 기본 `#5e6c84` 점. 설계 §4.3과 일치. ✅

### (f) 배너 잔여물 — **PASS**

- `page-panel__summary|__waiting|__timeline|__actions|__title|__approvers|__decision`
  마크업 생성 코드 **Java 0건** (grep 전수).
- 모달 밖 요소: pill 1개 + `.dmove-approval-message` 1개. 그 외 0개.
- `renderEmpty`의 pill은 `<span>` (조작 불가 요소를 버튼으로 만들지 않음). ✅

### 압축·재포매팅 — **PASS**

3파일 모두 라인 수 증가(444→528, 538→662, 505→527). 140자 초과 라인은 설계가 명시적으로
"상수로 뽑아라"라고 지시한 `ICON_*` SVG 리터럴 6줄뿐. 한 줄 압축된 statement 없음.
기존 주석·구조 보존(예: `:206` "편집으로 무효가 된 경우…" 주석이 모달로 함께 이동).

### 빌드

```
mvn -B -pl approval-confluence9 -am test   → BUILD SUCCESS (29.3s)
  approval-domain      : Tests run 44, Failures 0, Errors 0
  approval-confluence9 : Tests run 48, Failures 0, Errors 0
node --check approval.js → OK (node v22.22.0)
```
※ `clean verify`(패키징 + `Assert-AdapterArtifact`)는 미수행 — 이 배치는 리소스/렌더링만 바꾸므로
descriptor·bytecode 검증 대상 변화 없음. 커밋 전 `scripts/build.ps1 -Target confluence9` 1회 권장.

---

## 4. 발견 항목

### M-1 (Major, 필수 후속) — 모달 열 때 포커스가 항상 `×` 닫기 버튼으로 간다

`approval.js:265-266`
```js
var focusable = modal.querySelector(
    '[data-approval-autofocus], input, select, .dmove-approval-modal__close');
```
`querySelector`는 **선택자 나열 순서가 아니라 문서 순서**로 첫 매치를 돌려준다.
두 모달 모두 `.dmove-approval-modal__close`가 헤더에 있어 body/footer의 어떤 요소보다 앞선다.

- **detail 모달**: footer의 `[data-approval-autofocus]`(승인 버튼) 대신 헤더 `×`에 포커스.
  설계 §6 체크리스트 "포커스 이동: `[data-approval-autofocus]` → `input,select` → `close`" 위반.
- **요청 모달**: 배치 3 이전에는 `querySelector('input, select')`라 `#dmove-approval-user-search`에
  포커스가 갔다. 이제 `×`로 간다 — **기존 동작 회귀**. 승인자 검색창에 바로 타이핑하던 흐름이 깨진다.

재작업 지시:
```js
var focusable = modal.querySelector('[data-approval-autofocus]')
    || modal.querySelector('input, select')
    || modal.querySelector('.dmove-approval-modal__close');
```
(설계 §3.3 코드 스니펫도 같이 수정할 것. 이 셀렉터 나열은 설계의 오류다.)

### M-2 (Major, 필수 후속) — pill의 `aria-label`이 상태·단계·경고 낭독을 전부 덮어쓴다

`ApprovalPagePanel.java:151` `aria-label="승인 상태 상세 보기"`.
`aria-label`은 요소 내용으로부터 계산되는 접근 가능한 이름을 **대체**한다. 따라서 스크린리더는
"승인 상태 상세 보기, 버튼"만 읽고 `__label`(상태), `__step`("2/3단계"), 그리고 `!` 뱃지를 보완하려고
넣은 `.dmove-approval-sr-only`("재승인 필요")를 **하나도 읽지 않는다.**
설계 §6의 "색 + 텍스트 + 도형 3중 표현", "`!`는 aria-hidden + 인접 sr-only로 낭독" 두 항목이 무력화된다.

재작업 지시(둘 중 하나):
1. `aria-label`을 제거하고, caret 뒤에 `<span class="dmove-approval-sr-only">상세 보기</span>`를 추가한다.
   → 접근 가능한 이름 = "대기 중 2/3단계 재승인 필요 상세 보기". (권장)
2. 유지하려면 `aria-label`을 동적으로 조립한다:
   `escape(statusLabel) + " " + step + " " + (flagged ? "재승인 필요 " : "") + "승인 상태 상세 보기"`.
   (동적 조립 시 `escape()` 필수 — 속성값이므로 `"` 이스케이프가 특히 중요)

### m-3 (Minor) — 안내 문구가 설계와 다르다

설계 §5.4: `"단계 · 앞 단계 승인을 기다리는 중입니다."`
구현 `ApprovalPagePanel.java:226`: `"단계 · 앞 단계를 기다리는 중입니다."`
의미는 통하지만 설계 문구와 불일치. 설계 쪽 문구로 맞추거나, 현행 유지 시 설계 문서를 갱신할 것.

### i-4 (Info) — 설계 §1.4 트리와 §5.3 코드가 서로 다른데, 구현이 옳은 쪽을 골랐다

§1.4 트리는 `.dmove-approval-sr-only`를 `.dmove-approval-pill__flag`의 **자식**으로 그렸다.
`__flag`는 `aria-hidden="true"`이므로 그대로 하면 sr-only 텍스트도 함께 숨겨진다.
구현은 §5.3 코드대로 **형제**로 배치했다 — 접근성상 올바르다. 설계 §1.4 트리를 정정할 것.
(단, M-2 때문에 현재는 어느 쪽이든 낭독되지 않는다. M-2 수정 시 이 배치가 효력을 갖는다.)

### i-5 (Info) — 죽은 CSS 잔존

`approval.css:118` `.dmove-approval-page-panel__actions`가 `.dmove-approval-page-request`와 함께
셀렉터 그룹으로 남아 있다. 패널이 더는 `__actions`를 렌더링하지 않으므로 dead.
설계 §4.1 삭제 목록에 없어 **스펙 위반은 아니다.** 정리 배치에서 셀렉터만 떼면 된다.

### i-6 (Info) — 도달 불가능한 상태 조합

detail 모달이 열린 상태에서 페이지 도구의 "승인 요청"을 클릭하면 두 모달이 동시에 열리고
ESC가 detail만 닫는다. 다만 backdrop(z-index 3000)이 페이지 도구 메뉴를 덮으므로 실제로는 도달 불가.
조치 불필요, 기록만 남긴다.

---

## 5. 결론

| 구분 | 개수 |
|------|------|
| Critical | 0 |
| Major (필수 후속) | 2 — M-1(포커스 회귀), M-2(pill aria-label) |
| Minor | 1 — m-3(문구) |
| Info | 3 |

배치 3의 스펙 준수·회귀 가드·빌드는 모두 통과했으므로 **커밋 가능**하다.
M-1은 사용자가 즉시 체감하는 회귀이므로 **배치 4에 묶지 말고 즉시 후속 수정**을 권한다.
M-1/M-2/i-4는 `design-ui-overhaul.md` 원문(§3.3, §1.4/§5.3, §6)도 함께 정정해야 재발하지 않는다.
