# QA 배치 6b 재작업분 (6br) — 재검증

검증자: approval-qa / 2026-08-12
기준 커밋: 28d25d7 + 미커밋 워킹트리 (9파일, +729/-109)
스펙: `_workspace/spec-6br-rework.md` / 1차 판정: `_workspace/qa-6b.md` (FAIL 29건) / 설계 정본: `_workspace/design-batch6.md` §B·§E·§F

## 판정: **FAIL (조건부 — 소규모 1사이클)**

**치명 6건은 전부 해소되었다.** 1차 29건 중 25건 해소, 4건 부분/미해소, 신규 4건(중대 2·경미 2).
남은 것은 모두 중대 이하이며 한 번의 작은 재작업(R8)으로 닫힌다. 회귀는 없다.

| 등급 | 1차 | 해소 | 잔여 | 신규 | 최종 |
|------|----:|-----:|-----:|-----:|-----:|
| 치명 | 6 | 6 | 0 | 0 | **0** |
| 중대 | 9 | 7 | 2 | 2 | **4** |
| 경미 | 14 | 12 | 2 | 2 | **4** |

---

## 0. 빌드 / 정적 검사 (직접 실행)

| 항목 | 결과 |
|------|------|
| `mvn -B -pl approval-confluence9 -am test` | **SUCCESS** — c9 `Tests run: 74, Failures: 0, Errors: 0, Skipped: 0` (domain 52 별도), Total time 29.218 s |
| ※ 실행 조건 | 기본 `JAVA_HOME`이 corretto-1.8.0_472라 enforcer가 즉시 실패한다. `JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`로 실행해야 green (build.ps1:9와 동일) |
| `node --check` approval.js | OK |
| `node --check` **렌더된** 인라인 스크립트 (Inbox 3블록 / Settings 3블록) | OK — 소스 text block이 아니라 컴파일된 `render()` 출력에서 추출해 검사 |
| **fmtCell 정규식 실측** | 렌더 결과 `/ \(UTC[^)]*\)$/` — 의도대로. `"… (UTC+5:30)"` → `"2026-08-12 14:03:22"` 동작 확인 |
| **날짜 검증 정규식 실측** | 렌더 결과 `/^\d{4}-\d{2}-\d{2}$/` — `"2026-08-12"` true / `"xxxx-yy-zz"`·`""` false 동작 확인 |
| 서블릿 CSS 콤마 조각 스코프 (렌더된 `<style>` 전수 파싱) | **비스코프 0건** (두 화면) |
| `prefers-color-scheme` | 0건 |
| `/confluence/` 하드코딩 | 0건 |
| `git diff --check` | 통과 (CRLF 경고만) |
| 200자 초과 신규 라인 | **8건** — SVG 문자열 상수 1, mask data URI 4, 단일 CSS 규칙 3. 다중 statement 압축은 0건 (M9 핵심 해소) |
| 테스트 | +2건 (`ApprovalInboxServletRenderTest` 6→8) |

> 검증 방법: 컴파일된 `target/classes`에 임시 하네스를 붙여 `ApprovalInboxServlet.render(...)` /
> `ApprovalSettingsServlet.render(...)`의 **실제 출력 HTML**을 얻고, 그 안의 `<script>`·`<style>`을 추출해
> 검사했다. text block 이스케이프 판독 오류 가능성을 제거하기 위함이다.

---

## 1. 치명 6건 — 전부 RESOLVED

### B1 — canCancel 이중 대조 · **RESOLVED**
`ApprovalPagePanel.java:264-270`, `ApprovalRegionMacro.java:354-360`에 동일한 `isRequester(request, user)`가
추가되고 `canCancel`이 교체됐다(패널 129-130 / 매크로 142-143).

```java
String key = user.getKey() == null ? null : user.getKey().getStringValue();
if (key != null && key.equals(request.requesterKey())) { return true; }
return user.getName() != null && user.getName().equals(request.requesterKey());
```
- 서버 판정(`ApprovalRestResource:955-957`)과 규칙 동일(userKey 또는 username).
  서버는 username 쪽을 `equalsIgnoreCase`로, 클라이언트는 `equals`로 본다 — 화면 노출이 서버보다 **좁은**
  방향이라 권한 확대 위험은 없다(정보성).
- null 방어: `user.getKey()` null → `key=null`로 단락, `user.getName()` null → 두 번째 조건 단락. NPE 경로 없음.
- `currentUserKey = getKey()==null ? getName() : …`이 null이어도 `openPanel`/`openRegion`이
  `if (userKey != null)`로 감싸 속성을 생략한다. 속성 값은 양쪽 모두 escape 통과.

### B2 — app-head를 `.wb-main` 안으로 · **RESOLVED**
두 TEMPLATE 모두 마크업 자체가 이동했다(Inbox 255-259 / Settings 151-155). **렌더된 HTML에서
오프셋으로 재확인**: `.workbench` < `.wb-main` < `.app-head` 순서 성립(두 화면 모두).
`NavMarkup.css():68` `.workbench{align-items:stretch;min-height:60vh}`,
`:74` `.wb-nav{align-self:stretch;padding:0 20px 24px 0;border-right:…}`,
`:71` `.wb-main .app-head{margin:0 0 24px}` — 설계 §E-2 그대로.

### B3 — ≤1024 반응형 · **RESOLVED**
`NavMarkup.css():127-139`. flex/overflow/scrollbar 선언이 `.wb-nav__inner`로 이동했고
`__inner{position:static}`으로 sticky를 해제, `.workbench{min-height:0}` 복귀, `.wb-nav`는
`position:static;padding:0 0 2px;border-right:0;border-bottom:…`. 가로 스트립이 다시 성립한다.
4c 접힘 rail(`@media(min-width:1025px)` 109-126)은 후손 셀렉터 유지 + `.wb-nav{padding:0 8px 24px 0}`(111)로
설계값과 일치. `script()`의 `nav.querySelector(".wb-nav__toggle")`·`.wb-nav__item` 후손 검색도 그대로 유효.

### B4 — `?f_*` URL 왕복 · **RESOLVED**
`writeUrl()`(689-704) + 읽기 IIFE 확장(706-722). `spaceKey` 보존 → `view` → `f_q`/`f_status`/`f_space`/
`f_requester`/`f_flow`/`f_from`/`f_to`/`f_due`/`f_myturn`, `history.replaceState`. 읽기 측 화이트리스트:
`f_q` 100자 절단, `f_status`는 `STATUS_ORDER` 필터, `f_due`는 3값, `f_from`/`f_to`는 정규식 검증(실측 동작 확인),
`f_myturn === "1"`. `show()` 말미에서 항상 `writeUrl()` 호출 → `location.reload()` 복원 근거 성립.

### B5 — 필터 바 필수 요소 · **RESOLVED** (단, 신규 결함 N1 동반)
- `#filter-toggle` `aria-expanded`/`aria-controls` + 기본 접힘(`<form … hidden>`), URL에 필터가 있으면 열고 시작(843-848) ✔
- `#filter-reset` + 활성 칩 말미 `전체 해제`(612-615) ✔
- 요청일 프리셋 `f-range`(전체/오늘/7일/30일/직접 지정) + `[data-custom]` 토글 ✔ → **다만 N1 참조**
- 상태 다중 선택: `f-status` select를 **넣지 않고** 칩 토글(`toggleStatus`, 533-539)로 일원화 ✔ (설계 §F-1 방식)
- 검색 200ms 디바운스(`debounce`, 801/850-856) ✔
- `<form class="filters" id="filter-bar">` ✔ (submit 버튼이 없고 blocking field가 3개라 Enter 암묵 제출 없음 — 확인)

### B6 — 업무함 requestMessage 표시 · **RESOLVED (부분)**
(a) 행 대상 셀 보조줄 `subject.append(el("small", r.requestMessage, "memo"))`(656) ✔
(c) 타임라인 `reasonText`의 `REQUESTED → "요청 메모: "`(501) ✔
**(b) 상세 확장 `memo-block` 미구현, `td small.memo` CSS 미추가** → 아래 M10으로 강등해 계상.
치명(=메모가 아예 안 보임)은 해소.

---

## 2. 중대 — 잔여 2 + 신규 2

### 해소된 중대 7건
| # | 판정 | 근거 |
|---|------|------|
| M1 | **RESOLVED** | `summary`/`metric`/`metrics()`/`#*-count` 4종/`[data-status-label]` 루프/900·600px `.summary` 규칙/모션 `nth-child` 지연 **전량 삭제**(렌더 HTML에 `summary`·`metric` 문자열 0건). 지표는 `.facets > #status-chips` 칩 레일 단일 출처 |
| M2 | **RESOLVED** | `appendCancelConfirmation`이 감사 타임라인 `</section>` 다음, body `</div>` **앞**에 삽입(ApprovalMarkup 228-231). footer 버튼 순서 `닫기 → 요청 회수 → 재승인 → 반려/승인` |
| M3 | **RESOLVED** | `closeModal`에 확인 스텝 리셋 블록 추가(approval.js 401-409). `opener.focus()` 미호출 — 설계 준수 |
| M5 | **RESOLVED** | 마감 시각이 `appendTime(...)`으로 치환(ApprovalMarkup 195). `appendTime`에 null/blank 가드 → `"시각 미상"` 폴백(485-489). `appendHistory`·`appendTimeline`도 동일 경로 |
| M6 | **RESOLVED** | approval.js `localTime`·서블릿 `offsetLabel` 양쪽 동일 규칙 + 상호 참조 주석. 0→`UTC`, 분 0→`UTC+9`, 분 有→`UTC+5:30`, 음수→`UTC-3:30` (코드 검증) |
| M8 | **RESOLVED** | `"v" + r.approvedContentVersion + " 기준 · 현재 버전 미승인"` 원복(Inbox 435). `stale` 축약어 0건 |
| M9 | **RESOLVED(핵심)** | 818/607/567/456자 한 줄 전부 분해. `renderChips`·`renderActiveFilters`·`syncFilterInputs`·`syncMore`·`options`·`setupFilters` 모두 statement 한 줄. `init()` 들여쓰기 8칸 복구. 잔여는 m17 참조 |

### M10 (잔여, B6 강등) — 업무함 메모의 (b)·CSS 누락
- `detail(row)`(463-499)에 `memo-block` 없음 → 상세를 펼쳐도 전체 메모를 볼 수 없다.
- `#dmove-approval-app td small.memo{…white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` 미추가.
  현재 `td small`은 `display:block`만 있어 **500자 메모가 대상 셀에서 그대로 줄바꿈**된다.
  행 높이가 폭발하고 표 스캔이 불가능해진다(maxlength가 500이므로 실제로 발생 가능).

### M11 (잔여, M7 후속) — 표에서 UTC 오프셋이 **완전히 사라졌다**
`fmtTime`/`fmtCell` 분리(350-361)와 `<th>요청 시각 <span class="tz" data-tz-suffix></span></th>`(295)까지는 됐으나,

- **`[data-tz-suffix]`를 채우는 JS가 없다** — 렌더 HTML 전수 검색 결과 `data-tz-suffix` 등장 1회(마크업뿐).
  설계 C-5의 `const tz = "(" + offsetLabel(new Date()) + ")"; …forEach(n => n.textContent = tz)`가 미구현.
- **`.tz` CSS가 없다** — `#dmove-approval-app .tz{font:400 10.5px/1 var(--mono);color:var(--muted);…}` 미추가.
  현재 `.tz`는 `thead th` 규칙(10.5px 대문자 letter-spacing .14em)을 그대로 받는다.
- 결과: `fmtCell`이 셀에서 오프셋을 제거하는데 헤더가 그것을 대신 표시하지 않으므로,
  **업무함 표 어디에도 시간대 정보가 없다.** §C의 "감사 목적 시각 통일" 요구가 표에서 미충족이다.
- 마감 `<th>`에는 `data-tz-suffix` span 자체가 없다(설계 C-5는 두 열 모두).
- 신규 테스트 `업무함_시각은_time_마크업과_열_오프셋을_사용한다`는 `html.contains("data-tz-suffix")`만
  보므로 이 결함을 통과시킨다 — **가드가 아니라 위양성**이다.

### M12 (신규, 중대) — 요청일 프리셋이 하루 어긋난다
`ApprovalInboxServlet.java:817-820`
```js
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - Number(value) + 1);
state.from = start.toISOString().slice(0, 10);
state.to = today.toISOString().slice(0, 10);
```
`start`는 **로컬 자정**인데 `toISOString()`은 **UTC**로 변환한다. UTC+ 지역에서 하루 앞으로 밀린다.
node 실측(로컬 KST, 2026-08-12):

| 프리셋 | 의도 | 실제 `state.from` |
|--------|------|-------------------|
| 오늘 | 2026-08-12 | **2026-08-11** |
| 최근 7일 | 2026-08-06 | **2026-08-05** |
| 최근 30일 | 2026-07-14 | **2026-07-13** |

`matches()`는 `new Date(state.from + "T00:00:00")`으로 **로컬 해석**하므로 어긋남이 그대로 필터에 반영된다.
→ "오늘"이 어제분까지 포함한다. B5로 새로 넣은 기능이 오작동하는 상태이며, 배포 대상이 KST라 항상 발현한다.
수정: `toISOString()` 대신 로컬 포맷(`y-m-d` 직접 조립)을 쓴다. `state.to`도 동일.

### M13 (신규, 중대) — §E-1(c) 앵커 `gap:0` 가드 미추가
`approval.css` 852줄 전수 검색 결과 `gap: 0` / `gap:0` **0건**. 설계 §E-1이 지목한 세 원인 중
(a) viewBox 축소(`'2 3 16 15'`·`'4 2.5 12 15'`)와 (b) `margin-right:6px`는 적용됐으나
**(c) 부모 flex의 `gap`이 마진에 더해지는 경로가 열려 있다.** Confluence 버전에 따라 사이드바 앵커가
flex면 `::before`가 flex 아이템이 되어 (a)(b)로 줄인 ~3.7px이 그대로 상쇄된다.
설계가 "셋 다 고친다"고 명시한 항목이고 6줄짜리 규칙이라 누락 사유가 없다.
(앱 내부 `.wb-nav__item{gap:8px}`는 적용됨 — `NavMarkup.java:88`.)

---

## 3. 경미 — 잔여 2 + 신규 2

### 해소 (12건)
| # | 판정 | 근거 |
|---|------|------|
| m1 | ✔ | `matches(r, skip)` 시그니처 복원 + `renderChips(tabRows.filter(r => matches(r, "status")))`(740) |
| m2 | ✔ | `if (!count && !on) return;`(546, 560) |
| m3 | ✔ | `.chip__n`/`.chip__t` 분리(551) + `.chip::before` 상태색 점 CSS 전량(129-141) |
| m4 | ✔ | `<span class="sr-only"> 필터 제거</span>`(608, span에만 사용), 마감 라벨 한국어화(602), 요청자·Flow 표시명(`requesterName`/`flowName`) |
| m5 | ✔ | 더 보기 포커스 이동(832-841), `activate()`의 `state.limit = PAGE`(751) |
| m6 | 부분 | statusCell CANCELLED `"회수됨"`(442-443) ✔ / **업무함 `.timeline li.is-cancelled::before` CSS 없음** → m15 |
| m9 | ✔ | `regionHashFor` + `ConversionContext` 캐시(`REGION_HASH_CACHE_KEY`, ApprovalRegionMacro 363-377) — `hasDuplicateKey`와 동일 패턴 |
| m10 | ✔ | `maxlength="200"`, 문구 `"…지금까지 받은 승인은 무효가 되며 되돌릴 수 없습니다."` |
| m11 | ✔ | `time.dataset.localized === '1'` 멱등 가드(approval.js) |
| m12 | — | `&reason=` 상시 전송 유지. 도메인 `normalizeOptional`이 blank→null 처리 — 실해 없음(변화 없음) |
| m13 | — | 백엔드 `spaceKey` 여전히 없음(`ApprovalRestResource`에 `spaceKey`/`spaceName` 0건). 6b 범위 밖 — 단 m16 참조 |
| m14 | 부분 | 테스트 2건 추가(칩·필터 바 / `<time>`·`data-tz-suffix`). **R1이 필수라 한 canCancel 렌더 테스트는 없음** → m18 |

### m15 (잔여) — 업무함 CANCELLED 타임라인 점 색
렌더 CSS에 `#dmove-approval-app .timeline li.is-cancelled::before` **0건**(is-approved/rejected/expired만 존재).
회수 이벤트 점이 기본 `var(--muted)`로 나와 만료와 구분되지 않는다.
패널 쪽(`approval.css:774`)에는 있으므로 두 화면의 표현이 어긋난다.

### m16 (잔여/신규 파생) — 스페이스 필터가 죽은 컨트롤로 노출
백엔드가 `spaceKey`를 안 주는데(§G-3 미이행) UI에는 `<select id="f-space">`가 상시 노출된다.
`setupFilters`의 `all.filter(row => row.spaceKey)`가 항상 빈 배열 → 옵션이 "전체" 하나뿐인
선택 불가 드롭다운이 필터 바 1행을 차지한다. 1차에서는 "누락이 타당"이었으나 이제는 반대 방향의 부채다.
`renderActiveFilters`도 `spaceName()` 없이 `state.space` 키 원문을 그대로 쓴다.

### m17 (신규) — 들여쓰기 1건 파손
`ApprovalInboxServlet.java:869` `       setupFilters();` — 7칸(주변 6칸). 1차 M9의 `init()` 8칸 파손과 같은 유형.

### m18 (신규) — 설계 §B-4의 `data-approval-can-cancel` 속성 미구현 + R1 테스트 누락
패널·매크로 어디에도 `data-approval-can-cancel` 없음. JS가 버튼 존재로 판단하므로 **기능 영향은 없으나**,
R1이 "테스트 추가 필수"로 지목한 *requesterKey가 username인 요청에서 key 보유 사용자가 회수 버튼을 받는가*
회귀 가드가 없다. B1은 정확히 이 시나리오에서 무너졌던 항목이므로 가드가 있어야 한다.

### 범위 밖 유지
- **m7** 업무함 '내 요청' 행 회수 액션(`openCancelForm`·`data-admin`/`IS_ADMIN`·`.cancel-form`/`.ghost--danger`) — 미구현.
  6b 스펙 본문·R7 모두 요구하지 않았다. 설계 §B-6 대비 미이행으로 백로그 유지.
- **m8** 409 동선 — `showMessage(form, '영역이 변경되었습니다…')` **직후 동기 `window.location.reload()`**
  (approval.js 757-761). 메시지가 사실상 표시되지 않는 구조 그대로다. R7 지시 미이행(경미 유지).

---

## 4. 회귀 확인 — 1차 PASS 항목 전부 유지

- **§A 메모**: 요청 폼 textarea(선택·maxlength 500·카운터 `aria-hidden`·`is-limit`), submit 500자 방어가
  `submit.disabled=true` 앞, 빈 메모 허용, `closeModal`이 메모를 지우지 않음, 상세 `--message` 섹션 `escape()` ✔
- **regionHash**: 매크로가 `renderEmpty`/`renderRequest` 양쪽에서 `data-approval-region-hash` 출력(null이면 생략),
  `ApprovalRegionSupport.escape()` 통과, JS가 `CONTENT_REGION` + dataset 존재 시에만 `&regionHash=` 전송 ✔
  (신규 `ConversionContext` 캐시가 값을 바꾸지 않음 — 키가 `regionKey`별로 분리됨)
- **회수 REST 파라미터**: `POST {base}/{id}/cancel?actorKey=&reason=` ↔ `ApprovalRestResource:936-940`
  (`@Path("/{requestId}/cancel")`, `@QueryParam("actorKey")`, `@QueryParam("reason")`) 일치 ✔
- **재승인 공존**: `fromRequestId` 4곳 유지, create URL 조립 순서에서 `requestMessage`와 무충돌 ✔ / `syncDiffLinks` 유지 ✔
- **컨테이너 스코프**: 신규 회수 코드가 전부 `closest('.dmove-approval-modal')` / `approvalContainer()` 사용.
  `document.querySelector`로 모달을 찾는 신규 코드 없음 ✔
- **ESC 우선순위**: 확인 스텝 → 모달 (`.dmove-approval-confirm:not([hidden])` 우선, `back.click()`으로 포커스 복귀) ✔
- **prompt/alert**: 회수 경로 0건. `window.prompt`는 반려(666행) 기존 부채 1건뿐 ✔
- **서블릿 인라인 JS `innerHTML`**: 3파일 모두 0건 ✔ / `sr-only`는 span에만 ✔
- **설정 §B-8**: `label-cancelled` 필드·읽기·`cancelledLabel` payload ✔ / app-head 이동 외 설정 화면 회귀 없음 ✔
- **CANCELLED 표시**: `ICON_CANCELLED` 신규 + `iconFor` 분기 교체 ✔ / pill·stamp 점선 ✔ / `eventLabel` ✔

---

## 5. 재작업 지시 — R8 (단일 사이클, 소규모)

### R8-1 (M11) — 표의 시간대 표기를 완성한다
1. `ApprovalInboxServlet` 인라인 JS에 한 블록 추가하고 초기화 시점에 호출한다.
   ```js
   // 셀에서 뺀 오프셋을 열 머리에 한 번만 표기한다(§C-5).
   function syncTzSuffix() {
     const tz = "(" + offsetLabel(new Date()) + ")";
     document.querySelectorAll("[data-tz-suffix]").forEach((node) => { node.textContent = tz; });
   }
   ```
2. 마감 `<th>`에도 `<span class="tz" data-tz-suffix></span>`를 넣는다.
3. CSS 추가: `#dmove-approval-app .tz{font:400 10.5px/1 var(--mono);color:var(--muted);letter-spacing:0;text-transform:none}`
4. 테스트 `업무함_시각은_time_마크업과_열_오프셋을_사용한다`에 `assertTrue(html.contains("function syncTzSuffix"))`
   또는 `.tz{` CSS 존재 검증을 더한다 — 현재 단언은 마크업만 봐서 결함을 통과시킨다.

### R8-2 (M12) — 요청일 프리셋 off-by-one
`setupFilters`의 `f-range` 핸들러에서 `toISOString()` 사용을 없앤다.
```js
const ymd = (date) => date.getFullYear() + "-"
  + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
state.from = ymd(start);
state.to = ymd(today);
```
(`matches()`가 `state.from`을 로컬로 해석하므로 생성도 로컬이어야 한다.)

### R8-3 (M13) — §E-1(c) 앵커 gap 가드
`approval.css` 말미에 설계 원문 그대로 추가한다.
```css
/* 앵커가 flex면 컨테이너 gap이 ::before 마진에 더해진다. flex가 아니면 무시된다. */
a#dmove-approval-inbox-sidebar-link,
a.dmove-approval-inbox-sidebar-link,
li.dmove-approval-inbox-sidebar-link > a,
a#dmove-approval-request-action,
a.dmove-approval-request-trigger,
li.dmove-approval-request-trigger > a{gap:0}
```

### R8-4 (M10) — 업무함 메모 (b)와 CSS
1. `detail(row)`에서 `grid` **앞**에 `memo-block`을 넣는다(설계 A-5(b) 코드 그대로).
2. CSS 2종 추가: `td small.memo`(nowrap+ellipsis, max-width 44ch)와 `.memo-block`(+ 기존 `.detail-grid h3` 셀렉터에 `.memo-block h3` 병기).

### R8-5 (m15·m17·m18) — 마무리
1. `#dmove-approval-app .timeline li.is-cancelled::before{border-color:var(--expired);border-style:dashed}` 추가.
2. `ApprovalInboxServlet.java:869` 들여쓰기 6칸으로.
3. 회수 노출 회귀 테스트 1건: **requesterKey를 username으로 저장한 PENDING 요청**에서 userKey 보유 사용자가
   상세 모달에 `data-approval-cancel` 버튼을 받는지 검증(패널 또는 `ApprovalMarkup.detailDialog` 단위로 충분).
   설계 §B-4의 `data-approval-can-cancel` 속성을 함께 넣으면 단언이 단순해진다.

### R8-6 (m16) — 판단 필요 (오케스트레이터)
스페이스 필터를 (a) 백엔드 `spaceKey`/`spaceName`(§G-3, 두 줄)을 이번에 같이 넣어 살리거나,
(b) `f-space` 라벨을 이번 배치에서 빼고 백엔드와 함께 재투입한다. 죽은 컨트롤을 그대로 두지는 않는다.

### 손대지 말 것
- m7(업무함 행 회수 액션), m8(409 표시 동선), m13(스페이스 백엔드) — R8 범위 밖. 별도 배치로 관리.
- 200자 초과 8줄은 전부 단일 CSS 규칙 / 단일 문자열 리터럴이다. 분해하지 않는다(가독성 손해).
