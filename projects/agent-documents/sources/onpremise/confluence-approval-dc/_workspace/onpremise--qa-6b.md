# QA 배치 6b — UI (메모·회수·타임스탬프·레이아웃·칩 레일·필터)

검증자: approval-qa / 2026-08-12
기준 커밋: 28d25d7 + 미커밋 워킹트리 (8파일, +310/-37)
스펙: `_workspace/spec-6b-ui.md` / 설계 정본: `_workspace/design-batch6.md` §A·§B·§C·§E·§F

## 판정: **FAIL**

치명 6건 · 중대 9건 · 경미 14건. 빌드는 green이나 §E(레이아웃)·§F(필터/URL/칩)·§A-5(업무함 메모)가
설계 대비 대규모 미이행이고, §B 회수는 **요청자가 회수 버튼을 볼 수 없는 키 대조 결함**을 안고 있다.
게다가 설계 §B-7이 "하지 말라"고 명시적으로 결정한 5번째 metric 칸을 그대로 구현했다.

---

## 0. 빌드 / 정적 검사

| 항목 | 결과 |
|------|------|
| `mvn -B -pl approval-confluence9 -am test` (직접 실행) | **SUCCESS** — `Tests run: 72, Failures: 0, Errors: 0, Skipped: 0`, Total time 46.754 s |
| 패키징(`package`/`build.ps1`) | 미검증 (test 페이즈까지만 실행) |
| `node --check approval.js` | OK |
| `node --check` 서블릿 인라인 스크립트 (Inbox 2개 / Settings 2개 블록) | OK |
| 서블릿 CSS 콤마 조각 스코프 (프리픽스 없는 조각) | **0건** — 신규 `#dmove-approval-app .filters__f input,#dmove-approval-app .filters__f select` 포함 전부 프리픽스 有 |
| `prefers-color-scheme` | **0건** |
| `/confluence/` 하드코딩 | **0건** |
| 테스트 추가/수정 | **0건** (CANCELLED 렌더·칩·필터·`<time>`에 대한 회귀 가드 없음) |

---

## 1. 치명 (BLOCKER) — 6건

### B1. §B-3 requesterKey 이중 대조 누락 → 요청자가 회수 버튼을 못 본다
`ApprovalPagePanel.java:129-131`, `ApprovalRegionMacro.java:140-142`

```java
String currentUserKey = user.getKey() == null ? user.getName() : user.getKey().getStringValue();
boolean canCancel = request.status() == ApprovalStatus.PENDING
        && (currentUserKey.equals(request.requesterKey()) || permissionManager.isConfluenceAdministrator(user));
```

설계 §B-3은 **불변식 7**(requesterKey에 userKey/username이 섞인다)을 근거로 `isRequester()`가
userKey **와** username 두 형태를 모두 대조하도록 명시했다. 구현은 단일 비교만 한다.

- 서버는 두 형태를 모두 본다 — `ApprovalRestResource.java:955-957`
  `requesterKey.equals(userKey(user)) || requesterKey.equalsIgnoreCase(user.getName())`
- **같은 파일의 `resolveActorKey`(ApprovalRegionMacro.java:342-349)도 이미 이중 대조를 한다.** 회수만 안 한다.
- 결과: requesterKey가 username(`"hong"`)으로 저장된 요청 + 현재 사용자 key가 `"ff8081…"`
  → `canCancel=false` → **버튼이 렌더되지 않는다.** 서버는 허용하는데 진입 동선이 없어 기능이 통째로 죽는다.
- 부수: `currentUserKey`가 null이면 `.equals()` NPE (방어 없음).

### B2. §E-2 핵심 변경 미구현 — `header.app-head`를 `.wb-main` 안으로 옮기지 않음
`ApprovalInboxServlet.java:249` / `ApprovalSettingsServlet.java:148`

두 TEMPLATE 모두 `<header class="app-head">`가 여전히 `.workbench`(각각 254 / 153행) **바깥 위**에 있다.
설계 §E-2가 지목한 원인 두 가지 중 (1)이 그대로 남아, `align-items:stretch`를 넣어도 사이드바 기둥은
제목 아래에서 시작한다. "콘텐츠 영역 왼쪽 전체 기둥"이라는 §E-2의 목표가 달성되지 않는다.
추가로 `.workbench`에 `min-height:60vh`가 없어 짧은 목록에서 기둥이 여전히 짧다.

### B3. §E-2 반응형 파손 — ≤1024 미디어쿼리를 `__inner`로 옮기지 않음
`NavMarkup.java:126-138`

```css
@media (max-width:1024px){
  #dmove-approval-app .wb-nav{position:static;display:flex;align-items:center;gap:12px;
    padding:0 0 2px;border-right:0;border-bottom:1px solid var(--rule);
    overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
```
`nav()`에 `.wb-nav__inner` 래퍼가 새로 생겼으므로 `.wb-nav`의 flex 아이템은 이제 **1개**뿐이다.
- 가로 스트립이 성립하지 않는다 — `__bar`/`__title`/`__group`은 `__inner`(블록) 안에서 세로로 쌓인다.
- `overflow-x:auto`가 걸린 박스에 스크롤할 가로 콘텐츠가 없다.
- `.wb-nav__inner{position:sticky;top:56px}`가 이 MQ에서 해제되지 않아 모바일/좁은 화면에서 nav가 떠붙는다.

설계 §E-2는 이 블록의 flex/overflow 선언을 `__inner`로 이동하고 `__inner{position:static}`,
`.workbench{min-height:0}`을 되돌리라고 명시했다. **4c 반응형 회귀.**

### B4. §F URL 왕복(`?f_*`) 전부 미구현
`writeUrl()` 없음, `f_q`/`f_status`/`f_space`/`f_requester`/`f_flow`/`f_from`/`f_to`/`f_due`/`f_myturn`
파싱 없음(기존 `?view=` IIFE 미확장). 스펙 완료 기준 및 검증 중점 6에 명시된 항목이다.
설계 §B-6이 `location.reload()`를 정당화한 근거("필터 상태는 URL에 있으므로 복원된다")도 함께 무너진다.

### B5. §F 필터 바 필수 요소 다수 누락 — `ApprovalInboxServlet.java:272`
필터 바가 **한 줄(818자) `<div>` 마크업**으로 들어갔고 다음이 빠졌다.

| 설계 요소 | 상태 |
|-----------|------|
| `#filter-toggle` (`aria-expanded`/`aria-controls`), 기본 접힘 | **없음** — 필터 바가 항상 펼쳐진 채 상시 노출 |
| **`전체 해제`** (`#filter-reset` + 활성 칩 말미 버튼) | **없음** (검증 중점 6 명시) |
| 요청일 프리셋 `f-range`(오늘/최근 7일/30일/직접 지정) + `data-custom` 토글 | **없음** — 날짜 input 2개만 |
| 상태 **다중** 선택 | **깨짐** — `<select id="f-status" multiple size="1">`인데 JS는 `select.value` 단일값으로 `state.status=[v]`를 **덮어쓴다**(621행). 칩으로 고른 다중 선택이 select 조작 한 번에 소멸. `multiple`은 죽은 마크업 |
| 검색 200ms 디바운스 | **없음** — 타건마다 전체 목록 재렌더 |
| `<form>` 요소 | `<div>`로 대체 |
| 스페이스 필터 | 백엔드 `spaceKey` 미제공(§G-3 미이행)이라 누락은 타당 — m13 참조 |

### B6. §A-5 업무함 메모 표시 전무
`ApprovalInboxServlet.java` 전체에 `requestMessage` 문자열 **0건**.
- (a) 행 대상 셀 보조줄 `td small.memo` — 없음
- (b) 상세 확장 `memo-block` — 없음
- (c) 타임라인 `reasonText`의 `REQUESTED → "메모: "` 분기 — 없음

REST는 이미 내려주고 있다(`ApprovalRestResource.java:1148 o.put("requestMessage", …)`).
스펙 1번 "업무함 표시"·검증 중점 1 미이행.

---

## 2. 중대 (MAJOR) — 9건

### M1. §B-7 정면 위반 — summary 4칸 그리드에 5번째 metric을 추가
`ApprovalInboxServlet.java:263`
```html
<div class="metric" data-k="CANCELLED" hidden><b id="cancelled-count">0</b>…</div>
```
설계 §B-7은 **"기존 4칸 고정 그리드에 5번째 칸을 넣지 않는다"**를 근거 4개와 함께 결정했고,
§F-1·§I는 `<section class="summary">`·`.summary`/`.metric` CSS·`metrics()`·`#*-count` 4개 id·
`[data-status-label]` 루프·모션 `nth-child` 지연을 **제거** 대상으로 못 박았다. 구현은 정반대다.

결과:
- summary(최대 5칸) **와** 칩 레일이 같은 화면에 중복 공존한다.
- `.summary{grid-template-columns:repeat(4,1fr)}` — 회수 건이 1건이라도 생기면 5번째 칸이 두 번째 행에 혼자 떨어진다.
- `@media(max-width:900px)`의 `repeat(2,1fr)`에서 5칸은 홀수라 마지막 칸이 홀로 남는다.
  설계가 "이래서 안 된다"고 예측한 파손이 그대로 발생한다.
- `metrics()`가 `node.parentElement.hidden`을 조작하는데, `.metric`은 grid item이라
  hidden 해제 시 레이아웃이 튄다(§F-1이 칩 레일로 대체하려던 이유).

### M2. 회수 확인 스텝을 `modal__body`가 아니라 `modal__footer` 안에 삽입
`ApprovalMarkup.java` `detailDialog` — `if (canCancel) { 버튼 + <section> }` 블록이 footer div 내부에 있다.

`approval.css:197-205`의 footer는 `display:flex; flex-wrap:wrap; justify-content:flex-end`다.
→ 확인 `<section>`이 flex 아이템이 되어 버튼 옆에 찌그러지거나 오른쪽 정렬로 감긴다.
`flex-basis:100%`도 없다. 설계는 **body의 마지막 자식**(감사 타임라인 다음)이었다.
부수 효과: body 스코프 규칙 `.dmove-approval-modal__body label{margin-top:12px}`가 적용되지 않는다.

버튼 순서도 어긋난다 — 설계는 `닫기 → 요청 회수 → 재승인 → 반려/승인`인데
구현은 **승인 버튼 뒤**에 붙여 파괴적 동작이 주 CTA 다음에 온다.

### M3. `closeModal`이 확인 스텝을 초기화하지 않음 (설계 §B-5 명시 항목)
`approval.js:388-407` 무수정.

확인 스텝을 연 뒤 **닫기 버튼/오버레이**로 모달을 닫으면 `요청 회수` 버튼은 `hidden=true`,
확인 섹션은 펼쳐진 상태로 남는다 → 다음에 상세를 열면 회수 폼이 펼쳐진 채 나오고
그 상태를 되돌릴 버튼이 화면에 없다. (ESC 경로만 복구된다.)
설계는 `closeModal`에 리셋 블록을 넣되 `opener.focus()`는 부르지 말라고 명시했다.

### M4. §E-1 아이콘 간격 교정 3건 전부 미구현 + 반대 방향 변경
- (a) `approval.css` 스페이스 사이드바 마스크 data URI의 `viewBox='0 0 20 20'` → `'2 3 16 15'`,
  액션 도장 아이콘 `'4 2.5 12 15'` — **미적용**
- (b) `margin-right:8px` → `6px` — **미적용**
- (c) 앵커 6종 `gap:0` 가드 규칙 — **미추가**
- 앱 내부 사이드바 `.wb-nav__item{gap:9px}` → 설계는 **8px**, 구현은 **10px**.
  간격을 좁히라는 지시에 넓혔다(`NavMarkup.java:87`).

`atlassian-plugin.xml`은 미수정(마스크가 CSS 안에 있으므로 타당).

### M5. §C `<time>` 마크업 누락 — 상세 모달 마감
`ApprovalMarkup.java:193-195`
```java
if (request.expiresAt() != null) {
    …
    html.append(escape(request.expiresAt().toString()));
```
설계 C-2가 지정한 치환 3곳(마감 / `appendHistory` / `appendTimeline`) 중 **마감만 미치환**.
마감 시각만 ISO 원문으로 남아 같은 모달 안에서 표기가 불일치한다.

또한 `appendTime(StringBuilder, String)`에 null/blank 가드가 없다 →
`HistoryEntry.approvedAtIso()`가 `""`인 경우 `<time datetime=""></time>` 빈 태그가 나가고,
설계가 요구한 `"시각 미상"` 폴백이 없다.

### M6. 오프셋 표기 규칙 미준수 (approval.js·업무함 양쪽 동일)
`approval.js:37-48 localTime` / `ApprovalInboxServlet.java:320-324 fmt`
```js
var hours = Math.floor(Math.abs(offset) / 60);
… + ' (UTC' + sign + hours + ')';
```
- **분을 버린다** → 인도(UTC+5:30)·이란(+3:30)·네팔(+5:45)·뉴펀들랜드(−3:30)에서 **UTC+5**로 잘못 표시.
- 0 오프셋이 `UTC+0` (설계 C-1: `UTC`).

설계 C-1의 3규칙(0→`UTC`, 분 0→`UTC+9`, 분 有→`UTC+5:30`)이 모두 미구현이다.
ISO 폴백(`isNaN` → 원문 유지)과 `title` 보존은 정상.

### M7. §C-5 업무함 표 열 대책 미적용
설계는 `fmtTime`(단독 표기용, 오프셋 포함)과 `fmtCell`(표 셀용, 오프셋 제거) 분리 +
`<th>요청 시각 <span class="tz" data-tz-suffix></span></th>`로 오프셋을 열 머리에 1회 표기하도록 했다.
구현은 `fmt` 하나를 27자 풀 포맷으로 바꿔 요청 시각·마감 셀에 그대로 넣었다.
설계가 "좁은 셀에서 줄바꿈된다"고 명시적으로 경고한 결과가 발생한다. `.tz` CSS·`[data-tz-suffix]` 없음.

### M8. 지시 외 문구 변경 (배치 5b 회귀) — `ApprovalInboxServlet.java:406`
```diff
-      td.append(el("small", "v" + r.approvedContentVersion + " 기준 · 현재 버전 미승인", "warn"));
+      td.append(el("small", "v" + r.approvedContentVersion + " stale", "warn"));
```
배치 5b에서 확정한 한국어 설명 문구를 영어 축약어로 되돌렸다. **스펙 어디에도 없는 변경**이며
"지시 외 문구·주석 변경 금지" 규칙 위반이다.

### M9. 파일 압축 / statement 한 줄 규칙 위반
추가된 줄 길이(상위): **818**(필터 바 HTML 1줄), **607**(회수 확인 섹션 append 1줄),
**567**(`renderChips` 본문 1줄), **456**(`renderActiveFilters` 1줄), **454**, **368**(`syncFilterInputs`),
**352**, **321**(`setupFilters` 리스너 배열), **246**(`options`), **236**(`metrics`).

`renderChips` / `renderActiveFilters` / `syncFilterInputs` / `syncMore` / `options` / `setupFilters` /
`metrics` / `fmt`가 전부 다중 statement 한 줄이다. 스펙 "반복 실수 금지 규칙 — 파일 압축 금지" 및
"코드 스타일 — 개별 import, statement 한 줄" 위반. 리뷰·디버깅·후속 수정을 모두 막는다.

부수: `approval.js:775-778` `init()` 들여쓰기 파손 (8칸 → 4칸).
```js
        loadAvailableFlows();
    syncTriggerVisibility();
    localizeTimes(document);
        syncDiffLinks();
```

---

## 3. 경미 (MINOR) — 14건

| # | 항목 | 위치 |
|---|------|------|
| m1 | §F-1 패싯 카운트 규칙 미준수 — `renderChips(tabRows)`(설계: `tabRows.filter(r=>matches(r,"status"))`). `matches`에 `skip` 인자 자체가 없어 다른 필터를 걸어도 칩 숫자가 안 변한다 | Inbox 493, 578 |
| m2 | §F-1 "켜져 있는 칩은 0이어도 남긴다" 미구현(`.filter(item=>item[1]>0)`) → 활성 상태 칩이 사라져 레일에서 해제 불가 | Inbox 492 |
| m3 | 칩 시각 신호 축소 — `.chip__n`/`.chip__t`/`.chip::before` 상태색 점 CSS 전무. 칩이 `"승인 대기 5"` 단일 텍스트라 §H "점 색 + 숫자 + 텍스트 병행" 미충족 | Inbox 211-212, 495 |
| m4 | 활성 필터 칩 — `×`가 텍스트에 붙어 있고 `<span class="sr-only"> 필터 제거</span>` 없음(§H 명시). 마감 라벨이 `soon`/`over`/`none` 원문, 요청자·Flow가 표시명 아닌 **키 원문** | Inbox 499-503 |
| m5 | §F-3 "더 보기" 포커스 이동(버튼 소멸 시 새로 추가된 첫 행) 미구현. `activate()`가 탭 전환 시 `state.limit` 리셋 안 함 | Inbox 587-600, 623 |
| m6 | §B-9 업무함 `statusCell`의 CANCELLED `"회수됨"` 보조줄 없음. `#dmove-approval-app .timeline li.is-cancelled::before` CSS 없음 → 회수 이벤트 점이 기본색 | Inbox 402-410, 198-204 |
| m7 | §B-6 업무함 '내 요청' 행 회수 액션(`openCancelForm`)·`data-admin`/`IS_ADMIN` 토큰·`.cancel-form`/`.ghost--danger` CSS 미구현. (6b 스펙 본문은 "업무함 칩"까지만 명시 — 설계 대비 미이행으로만 기록) | Inbox |
| m8 | §1-b 409 동선 — `showMessage(form, '영역이 변경되었습니다…')` 직후 동기 `window.location.reload()` → 메시지가 사실상 표시되지 않는다. 스펙 "메시지 표시 후 reload" 미충족. 서버 문구(`"승인 영역이 변경되었습니다. 페이지를 새로고침해 주세요."`, RestResource:188)와 `indexOf('영역이 변경')` 매칭 자체는 정상 | approval.js 739-743 |
| m9 | §D-8 캐시 미적용 — `execute`가 영역마다 `page.getBodyAsString()` 전량 스캔. `hasDuplicateKey`는 ConversionContext 캐시를 쓰는데 `regionHash`는 안 쓴다 → 영역 N개 페이지에서 N회 재파싱 | ApprovalRegionMacro 81 |
| m10 | 회수 사유 `maxlength="500"` (설계 200). 확인 문구도 약화 — 설계의 "지금까지 받은 승인은 무효가 되며 **되돌릴 수 없습니다**"가 "회수하면 진행 중인 승인 요청이 종료됩니다"로 바뀌어 비가역성 경고가 사라짐 | ApprovalMarkup detailDialog |
| m11 | `localizeTimes` 멱등 가드(`data-approval-localized`) 없음. 현재 `init` 1회 호출이라 실해는 없음 | approval.js 51-59 |
| m12 | 회수 POST가 `&reason=`를 항상 전송(빈 값 포함). 도메인 `ApprovalRequest.cancel`의 `normalizeOptional(reason)`이 blank→null 처리함을 확인 — **실해 없음** | approval.js 508-511 |
| m13 | 스페이스 필터 부재 — `requestObject`에 `spaceKey`/`spaceName`이 아직 없다(설계 §G-3 "이번 배치에 반드시 필요" 미이행, 6a 범위). UI 누락 자체는 타당하나 §F 목록 대비 미충족으로 기록 | RestResource 1140-1170 |
| m14 | 테스트 추가/수정 0건 — CANCELLED 렌더·`<time>` 마크업·칩/필터에 회귀 가드 없음. `ApprovalInboxServletRenderTest`도 미갱신 | — |

---

## 4. PASS 확인 항목

- **§A 메모**: textarea 선택 입력 + `maxlength="500"` + 카운터(`aria-hidden`, `is-limit` 토글) ✔ /
  pane **바깥**·`modal__body` 마지막 자식 배치라 탭 전환에도 유지 ✔ /
  submit `&requestMessage=` + `encodeURIComponent` ✔ / 500자 방어가 `submit.disabled=true` **앞** ✔ /
  빈 메모 제출 허용(`if (requestMessage)` 가드) ✔ / `closeModal`이 메모를 지우지 않음 ✔ /
  상세 모달 `--message` 섹션 `escape()` + `white-space:pre-wrap`(`<br>` 주입 없음) ✔ /
  `fromRequestId` 재승인 동선과 공존(같은 폼, url 조립 순서 무충돌) ✔
- **§A-4**: `reasonLabel`(REQUESTED→"메모", CANCELLED→"회수 사유", EXPIRED→"만료 사유") + `reasonText` 만료 코드 문장화 ✔
- **§1-b regionHash**: 매크로가 `renderEmpty`/`renderRequest` 양쪽에서 `data-approval-region-hash` 출력,
  `ApprovalRegionSupport.escape()` 통과 ✔ / null이면 속성 생략 ✔ /
  JS가 `resourceType === 'CONTENT_REGION'`일 때만, dataset 존재 시에만 `&regionHash=` 전송 ✔ /
  서버 409 경로(RestResource 182-190) 실동작 성립 ✔
- **§B 회수**: `window.prompt`/`window.alert` **0건** ✔ / 인라인 확인 스텝 + `aria-expanded` + `aria-label="요청 회수 확인"` ✔ /
  확인 스텝 열 때 사유 textarea 포커스 + `scrollIntoView({block:'nearest'})` ✔ /
  **ESC 순서 확인 스텝 → 모달** ✔ (`.dmove-approval-cancel-confirm:not([hidden])` 우선) /
  cancel REST 파라미터 `POST {base}/{id}/cancel?actorKey=&reason=` 백엔드 시그니처와 일치 ✔ /
  관리자 노출 조건(`permissionManager.isConfluenceAdministrator`) 존재 ✔ (요청자 조건은 B1) /
  성공 시 `location.reload()` ✔ / 실패 시 버튼 재활성 + `showMessage` ✔
- **CANCELLED 표시**: `ICON_CANCELLED` 신규 + `iconFor` 분기 교체(기존 `ICON_EXPIRED` 재사용 제거) ✔ /
  `.dmove-approval-pill--cancelled` 점선 ✔ / 패널 `.dmove-approval-timeline li.is-cancelled::before` 점선 ✔ /
  업무함 `.stamp.CANCELLED` 회색 + `border-style:dashed` ✔ / `eventLabel` CANCELLED ✔
- **§B-8 설정**: `label-cancelled` 필드 + 읽기 + `cancelledLabel` payload ✔,
  REST `@QueryParam("cancelledLabel")`(RestResource:685) 및 기본값 "회수"(724-726) 존재 확인 ✔
- **§C**: `appendHistory`·`appendTimeline` `<time class="dmove-approval-time" datetime>` 치환 ✔ /
  `datetime` 속성·본문 모두 `escape()` 통과 ✔ / JS 미동작 시 ISO 원문 폴백 ✔ / `title`에 원본 ISO 보존 ✔ /
  `.dmove-approval-time{font-variant-numeric:tabular-nums;white-space:nowrap}` — CSS 미추가(경미, §C-6)
- **§E-2 부분**: `.workbench{align-items:stretch}` ✔ / `.wb-nav__inner{position:sticky;top:56px}` ✔ /
  `nav()`에 `<div class='wb-nav__inner'>` 래퍼 추가 및 `</ul></div></nav>` 짝 맞음 ✔ /
  `script()`의 후손 검색(`nav.querySelector(".wb-nav__toggle")` 등) 래퍼 도입 후에도 유효 ✔ /
  `is-nav-collapsed` rail 규칙(≥1025px)은 후손 셀렉터라 그대로 동작 ✔ /
  `position:fixed`·`100vh` 미사용 ✔
- **§F 부분**: 기존 `TABS`/`render`/`detail` 구조 재사용 ✔ / 칩 클릭 = 필터 토글 ✔ /
  CANCELLED·마감 임박·기한 지남 칩이 건수 > 0일 때만 생성 ✔ / `aria-pressed` ✔ /
  `role="group" aria-label` ✔ / 더 보기 50건(`PAGE=50`, `state.limit`) + `more-bar[hidden]` ✔ /
  필터 변경·칩 토글 시 `state.limit=PAGE` 리셋 ✔ / `td.colSpan = 7` 유지 ✔
- **회귀 가드**: 모달·트리거 셀렉터 컨테이너 스코프 유지(`approvalContainer`, `closest('.dmove-approval-modal')`) —
  `document.querySelector`로 모달을 찾는 신규 코드 없음 ✔ / 신규 `sr-only` 사용 자체가 없어 span 규칙 위반 없음 ✔ /
  `escape()` 규칙 우회 없음, 서블릿 인라인 JS의 `innerHTML` 사용 0건 ✔ / 4b(diff 링크 `syncDiffLinks`)·5b(stale pill·`fromRequestId`) 동선 유지 ✔

---

## 5. 재작업 지시 (우선순위 순)

### R1 (B1) — 회수 노출 조건을 서버와 동일하게
`ApprovalPagePanel`·`ApprovalRegionMacro` 양쪽에 설계 §B-3의 헬퍼를 그대로 추가하고 `canCancel`을 교체한다.
```java
/** 승인자 키와 마찬가지로 requesterKey에도 userKey/username이 섞일 수 있다(불변식 7). */
private static boolean isRequester(ApprovalRequest request, ConfluenceUser user) {
    String key = user.getKey() == null ? null : user.getKey().getStringValue();
    if (key != null && key.equals(request.requesterKey())) {
        return true;
    }
    return user.getName() != null && user.getName().equals(request.requesterKey());
}

boolean canCancel = request.status() == ApprovalStatus.PENDING
        && (isRequester(request, user) || permissionManager.isConfluenceAdministrator(user));
```
`data-approval-user-key`에 넣는 `currentUserKey` 계산은 그대로 두되 null 방어를 넣는다.
**테스트 추가 필수**: requesterKey를 username으로 저장한 요청에서 key 보유 사용자가
`data-approval-can-cancel`/회수 버튼을 받는지 검증하는 렌더 테스트 1건.

### R2 (M1 + B5 + B4) — §F를 설계대로 다시
1. **`<section class="summary">` 마크업, `.summary`/`.metric` CSS, `metrics()`, `#pending-count`·
   `#approved-count`·`#rejected-count`·`#expired-count`·`#cancelled-count`, `[data-status-label]` 루프,
   모션의 `.summary .metric:nth-child()` 지연, `@media(max-width:900px|600px)`의 `.summary` 규칙을 전부 삭제**한다
   (설계 §I 표). 지표는 칩 레일 단일 출처로 간다.
2. 필터 바를 설계 §F-2 마크업 그대로 넣는다 — `<form class="filters" id="filter-bar" hidden>`,
   `#filter-toggle`(`aria-expanded`/`aria-controls`), `f-range`+`data-custom`, `#filter-reset`,
   활성 칩 말미 `전체 해제`. 상태 다중은 **칩으로만** 처리하고 `f-status` select는 넣지 않거나
   진짜 다중(`selectedOptions` 수집)으로 구현한다 — 현재의 `multiple size="1"` + 단일값 덮어쓰기는 제거.
3. `writeUrl()` + 읽기 IIFE 확장(화이트리스트 검증, `replaceState`, `spaceKey` 보존)을 §F-2 코드대로 추가.
4. `matches(r, skip)` 시그니처 복원 → `renderChips(tabRows.filter((r) => matches(r, "status")))`.
5. 칩 표시 규칙: `if (!n && !on) return;` (켜진 칩은 0이어도 남긴다).
6. 칩 마크업을 `<b class="chip__n">` + `<span class="chip__t">`로 나누고 §F-1 CSS(상태색 점 `::before` 포함) 전량 추가.
7. 검색 200ms 디바운스, 더 보기 포커스 이동, `activate()`의 `state.limit=PAGE` 리셋.

### R3 (B2 + B3 + M4) — §E 레이아웃/간격
1. 두 서블릿 TEMPLATE에서 `<header class="app-head">…</header>` 블록을 **`.wb-main`의 첫 자식으로 이동**
   (내용 변경 없이 위치만). `#dmove-approval-app .wb-main .app-head{margin:0 0 24px}` 추가.
2. `.workbench`에 `min-height:60vh` 추가, `.wb-nav{padding:0 20px 24px 0}`.
3. `@media (max-width:1024px)` 블록 수정 — `.workbench{…;min-height:0}`,
   `.wb-nav{position:static;padding:0 0 2px;border-right:0;border-bottom:1px solid var(--rule)}`,
   flex/overflow/sticky 해제를 `.wb-nav__inner{position:static;display:flex;align-items:center;gap:12px;
   overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}`로 이동.
4. `is-nav-collapsed` rail의 `.wb-nav` padding을 `0 8px 24px 0`으로 맞춘다.
5. §E-1 세 교정 적용: 마스크 `viewBox` `'2 3 16 15'` / `'4 2.5 12 15'`, `margin-right:6px`,
   앵커 6종 `gap:0` 가드. `.wb-nav__item{gap:8px}` (현재 10px → 8px).

### R4 (M2 + M3) — 회수 확인 스텝 위치·수명
1. 확인 `<section class="dmove-approval-confirm">`을 **`modal__body`의 마지막 자식**(감사 타임라인 섹션 다음,
   body `</div>` 앞)으로 옮긴다. footer에는 `data-approval-cancel-open` 버튼만 남기고
   **닫기와 재승인/반려/승인 사이**에 배치한다.
2. 설계 §B-9 CSS(`.dmove-approval-confirm` 경고색 박스, `__lead`, `__actions`, `.dmove-approval-danger`)를 추가하고
   현재의 `.dmove-approval-cancel-confirm{border:1px solid #dfe1e6;background:#f7f8f9}` 중립 박스를 인플레이스 교체.
3. `closeModal`에 확인 스텝 리셋 블록 추가(설계 §B-5, `opener.focus()`는 호출하지 않는다).
   열기 시 `hidden=true` 대신 `disabled=true`를 쓰는 설계안으로 통일하면 리셋도 단순해진다.
4. 사유 `maxlength`를 200으로, 경고 문구를 설계 원문("지금까지 받은 승인은 무효가 되며 되돌릴 수 없습니다.")으로.

### R5 (B6 + M5 + M6 + M7 + m6) — 메모·시각
1. 업무함에 §A-5 (a)(b)(c) 전부 추가 + `td small.memo` / `.memo-block` CSS.
2. `ApprovalMarkup` 마감 시각을 `appendTime(html, request.expiresAt().toString())`으로 치환하고,
   `appendTime`에 null/blank 가드 + `appendHistory`의 `"시각 미상"` 폴백을 넣는다.
   `.dmove-approval-time` CSS(§C-6) 추가.
3. `offsetLabel()`을 설계 C-1 규칙대로 구현(0→`UTC`, 분 有→`UTC+5:30`)하고
   `approval.js`와 서블릿 양쪽에 동일 구현 + 상호 참조 주석("한쪽만 고치지 말 것").
4. 업무함은 `fmtTime`/`fmtCell` 분리 + `<th>`의 `[data-tz-suffix]` + `.tz` CSS로 §C-5를 이행.
5. 업무함 `statusCell`에 CANCELLED `"회수됨"` 보조줄, `.timeline li.is-cancelled::before` 점선 CSS.

### R6 (M8 + M9) — 회귀 되돌리기와 포매팅
1. `"v… stale"`을 **원래 문구 `"v" + r.approvedContentVersion + " 기준 · 현재 버전 미승인"`으로 복원**한다.
   스펙에 없는 문구 변경은 전부 되돌린다.
2. 압축된 한 줄 코드를 전부 풀어 statement 하나당 한 줄로 되돌린다
   (필터 바 HTML, `renderChips`, `renderActiveFilters`, `syncFilterInputs`, `syncMore`, `options`,
   `setupFilters`, `metrics`, `fmt`, `ApprovalMarkup`의 confirm/message-field append).
   Java 쪽 `html.append(...)`도 설계 코드처럼 논리 단위로 분할.
3. `approval.js` `init()` 들여쓰기 복구(8칸).

### R7 (경미 일괄)
m1~m11 중 R2~R6에 흡수되지 않은 것: 활성 칩 `sr-only` span·한국어 마감 라벨·표시명 사용(m4),
`localizeTimes` 멱등 가드(m11), 매크로 `regionHash` ConversionContext 캐시(m9, `hasDuplicateKey`와 동일 패턴),
409 메시지 표시 동선(m8 — 메시지를 남기려면 reload를 짧게 지연하거나 reload 없이 상태만 갱신).
`ApprovalInboxServletRenderTest`에 CANCELLED 칩·필터 바 마크업·`<time>` 출력 검증을 최소 3건 추가(m14).

### 참고 (범위 밖)
- `requestObject`의 `spaceKey`/`spaceName`(설계 §G-3)이 6a에서 누락됐다. §F 스페이스 필터를 채우려면
  백엔드 후속이 먼저 필요하다 — 6b 재작업 범위에는 넣지 말고 별도 항목으로 관리할 것.
