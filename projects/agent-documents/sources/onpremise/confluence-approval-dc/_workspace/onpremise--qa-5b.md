# QA 배치 5b — 재승인 UI

- 검증일: 2026-08-12
- 기준 커밋: `b522c17` (미커밋 워킹트리 diff 대상)
- 검증자: approval-qa (독립 검증)

## 판정: **CONDITIONAL PASS** (재작업 1건 필요)

기능·스펙 대조는 전 항목 충족. 빌드/테스트 그린. **A11y 회귀 1건(F1)**만 고치면 PASS.

- 치명(Critical): 0
- 중대(Major): 1 — F1 (재승인 경로 opener 포커스 유실, 4b 규칙 위반)
- 경미(Minor): 5 — F2~F6
- 정보(Info): 2 — F7~F8

---

## 0. 변경 범위·위생

| 항목 | 결과 |
|---|---|
| 수정 파일 | 정확히 허용된 6개만 (`ApprovalMarkup`, `ApprovalPagePanel`, `ApprovalRegionMacro`, `ApprovalInboxServlet`, `approval.js`, `approval.css`) |
| 신규/삭제 파일 | 없음 (`git status -uall` 클린) |
| 압축·재포매팅 | 없음. 전 파일 라인 수 증가 (Markup 353→416, Region 298→336, Panel 250→284, js 624→680, css 826→836, Inbox 578→580) |
| `git diff --check` | PASS (exit 0) |
| 하드코딩 `/confluence` | **0건** (JS·Java 4개 파일 grep) |
| `node --check approval.js` | PASS |
| `mvn -B -pl approval-confluence9 -am test` | **BUILD SUCCESS**, Tests run: 53, F0 E0 S0 (28s). ※ 패키징(`package`)은 미검증 — 컴파일·테스트만 |
| 지시 외 변경 | 없음. `ApprovalPagePanel`에 `repository` 필드 추출은 신규 조회에 필요한 최소 리팩터로 판단, 기존 `workflowService` 생성 인자를 그대로 재사용하므로 동작 동일 |

---

## 1. stale 판정과 pill (스펙 §1)

| 요구 | 구현 | 판정 |
|---|---|---|
| 패널 stale = APPROVED && page.getVersion() > approvedContentVersion | `ApprovalPagePanel:130-133` 정확히 일치 | PASS |
| 매크로 stale = APPROVED && target.contentVersion() > approvedContentVersion | `ApprovalRegionMacro:133-135` 일치 | PASS |
| approvedVersion null → stale=false | 두 곳 모두 `approvedVersion != null &&` 단락 평가로 보장 | PASS |
| `--stale` 모디파이어 (신규) | `pill()`이 `stale ? "dmove-approval-pill--stale" : pillModifier(...)` 로 **대체** | PASS |
| 아이콘 ICON_PENDING(시계) | `stale ? ICON_PENDING : iconFor(status)` | PASS |
| 라벨 `v{a} 승인 · v{c} 미승인` | 문자 그대로 일치 (`ApprovalMarkup:119-124`) | PASS |
| stale=false + APPROVED → `<span class="pill__step">v{n}</span>` | `ApprovalMarkup:129-133`, `approvedVersion != null` 가드 있음 | PASS |
| 기존 `!` 뱃지는 requiresReapproval/expiredByEdit 전용 유지 | `flagged` 계산·렌더 로직 무변경. APPROVED에서는 둘 다 false이므로 stale pill과 겹치지 않음 | PASS |
| CSS `--stale { color:#a86400; background:#fdf3e0 }` | `approval.css:702`, 기존 pill 블록 바로 옆. 중복 정의 없음 | PASS |
| stale=false 화면 시각 회귀 | pill 마크업은 v{n} chip 추가 외 동일. `pill__step` 스타일은 기존 것 재사용 | PASS |

**동작 추론 검증**: APPROVED · approvedContentVersion=1 · page.getVersion()=3
→ `<button class="dmove-approval-pill dmove-approval-pill--stale" …><span …__icon>[시계]</span><span …__label>v1 승인 · v3 미승인</span><span …__caret>…` — v{n} chip 없음(stale 분기), `!` 뱃지 없음. 스펙대로.
APPROVED · approvedContentVersion=3 · version=3 → `--approved` + 라벨 "승인 완료" + chip `v3`. 스펙대로.

---

## 2. 상세 모달 확장 (스펙 §2)

| 요구 | 구현 | 판정 |
|---|---|---|
| stale 안내문 body 최상단 | `detailDialog:193-206` — `modal__body` 여는 직후, `appendInvalidNotice` 앞 | PASS |
| 문구 `v{a} 승인 이후 페이지가 v{c}로 수정되었습니다. 현재 버전은 승인되지 않았습니다.` | 일치 | PASS |
| diff 링크가 `data-approval-diff="{a}:{c}"` 만 렌더, href는 JS가 채움 | `<a data-approval-diff="1:3" target="_blank" rel="noopener">v1과 차이 보기</a>` — **href 미렌더 확인** | PASS |
| JS가 `AJS.contextPath()` 기반으로 href 주입 | `syncDiffLinks()` (approval.js:655-667), `init()`에서 호출, DOMContentLoaded 가드 존재 | PASS |
| diff URL 형태 | `{ctx}/pages/diffpagesbyversion.action?pageId={container.pageId}&selectedPageVersions={a}&selectedPageVersions={c}` — 스펙과 파라미터·순서 일치. `pageId`는 컨테이너 dataset에서 (패널·영역 모두 `data-approval-page-id` 존재 확인) | PASS |
| 버전별 승인 이력 섹션, 호출측 조회 | 패널 `approvedHistory(pageId)` / 매크로 `approvedHistory(target)` | PASS |
| contentVersion 내림차순, 최대 5건 | `Comparator.comparingInt(...).reversed()` + `.limit(5)` | PASS |
| 0건이면 섹션 생략 | `appendHistory`가 `history.isEmpty()`에 early return | PASS |
| 패널은 renderRequest에서 페이지당 1회 조회 | `renderRequest` 내 1회. 단 `findLatestPageRequest`와 합쳐 페이지 렌더당 조회 2회 (스펙 허용) | PASS |
| scope 필터 | 패널: `resourceType == PAGE`. 매크로: `CONTENT_REGION && regionKey.equals(...)` | PASS |
| 재승인 CTA (stale && canRequest) | `detailDialog:221-224` footer, `data-approval-reapprove="1"`, `aui-button aui-button-primary`, 라벨 일치 | PASS |
| detailDialog 시그니처 변경 → 호출측 2곳 | `ApprovalPagePanel:140`, `ApprovalRegionMacro:152` — 둘 다 `(stale, currentContentVersion, history, canRequest)` 순서로 정합. 그 외 호출자 없음(전체 grep) | PASS |

---

## 3. 원클릭 재승인 JS 동선 (스펙 §3) — 단계별 추적

`[data-approval-reapprove]` 클릭 (approval.js:469-488):

1. `event.preventDefault()` → OK
2. `approvalContainer(reapprove)` = `closest('.dmove-approval-page-panel, .dmove-approval-region')`
   → CTA는 detail 모달 안에 있고 detail 모달은 컨테이너 내부에 렌더되므로 **자기 컨테이너**로 해석됨 (항목 4 PASS)
3. `closeModal(detail)` — detail `hidden=true`, pill `aria-expanded=false`, pill로 포커스 복귀, `modalOpener=null`
4. `openModal(requestModal, reapprove)` — 같은 컨테이너의 `--request` 모달만 연다 (컨테이너 스코프 유지)
5. `switchTab(form,'direct')` → `dataset.approvalMode='direct'` (flow 값 미전송 보장)
6. `stepList(form).replaceChildren()` + `syncSteps(form)` → `form.elements.steps.value = ''`
   → **필수 동작**: steps가 비어야 서버가 `fromRequestId` 복원 경로를 탄다 (`blank(steps)` 조건). 올바름
   → `syncSteps`가 `syncStepEmptyState`도 호출하므로 빈 상태 안내 동기화됨
7. `form.dataset.approvalFromRequestId = container.dataset.approvalRequestId`
8. `syncReapproveHint(form)` → `hint.hidden = false` → 재승인 힌트 노출

제출 (approval.js:591-643):
- `fromRequestId` 존재 → `mode==='direct' && !steps` 검증 **스킵** (606행) — 스펙대로
- `url += '&fromRequestId=' + encodeURIComponent(fromRequestId)` (625-627) — 스펙대로
- `&steps=` 는 빈 문자열로 항상 전송 → 서버 `blank(steps)` true → `restoreSteps(previousRequest)` 경로 진입. **REST 경계 정합 확인** (`ApprovalRestResource:156, 192, 195`)

닫기/취소 초기화:
- `closeModal()`이 모달 내 `.dmove-approval-request` 폼에 `resetReapproval()` 호출 → `delete dataset.approvalFromRequestId` + 힌트 재숨김 (approval.js:379-382)
- `[data-approval-close]`, backdrop, **Escape**(581-589) 모두 `closeModal` 경유 → 세 경로 전부 초기화됨

**비재승인 경로 회귀 없음**: `fromRequestId`는 `delete` 후 `undefined` → falsy → `'승인자를 한 명 이상 추가하세요.'` 검증 그대로 동작. flow 모드 검증도 무변경.

**요청 모달 힌트 마크업**: `requestDialog` direct 페인 최상단에 `<p class="dmove-approval-hint dmove-approval-reapprove-hint" hidden>…</p>` 항상 렌더. `openModal`도 `syncReapproveHint` 호출 → 일반 열기 시 항상 숨김. PASS.

---

## 4. 패널 + 매크로 공존

`approvalContainer()`가 `closest()` 기반이므로 CTA는 가장 가까운 조상(자기 패널/영역)만 잡는다.
`querySelector('.dmove-approval-modal--request')`도 그 컨테이너 서브트리로 한정.
→ 페이지 패널 + 영역 매크로 N개가 공존해도 **자기 컨테이너의 request 모달만** 열린다. PASS.
(영역 매크로가 패널 내부에 중첩되는 구조는 없음 — 패널은 `web-panel`, 매크로는 본문.)

---

## 5. 업무함 statusCell

```js
if (r.status === "APPROVED" && r.stale === true) { … "v"+r.approvedContentVersion+" 기준 · 현재 버전 미승인", "warn" }
else if (r.status === "APPROVED" && r.approvedContentVersion) { … "v"+…+" 기준" }
else if (r.requiresReapproval) { … }
```
- `stale` 필드는 5a에서 `requestObject`(`ApprovalRestResource:1034-1035`)가 내려주고, `/mine`·`/mine/requested` 모두 `requestsJson` → `requestObject` 경유이므로 목록 응답에 존재. **경계 정합 PASS**
- `stale=true`면 서버 계산상 `approvedContentVersion != null`이 보장되므로 `"vnull"` 불가
- stale 아닌 APPROVED, `requiresReapproval`, 그 외 분기 모두 기존 그대로 → **회귀 없음** PASS
- 변경 라인 2줄뿐, statusCell 외 서블릿 수정 없음 (허용 범위 준수) PASS

---

## 6. escape 규칙

| 대상 | 처리 | 판정 |
|---|---|---|
| 이력 문자열 `approvedAtIso` | `escape(entry.approvedAtIso())` | PASS |
| 버전 숫자 | `int`/`Integer` 직접 append, escape 미적용 | PASS (스펙대로) |
| stale 안내문 | 전량 정적 리터럴, 사용자 입력 없음 | PASS |
| `data-approval-diff` 값 | `int:int` 정적 조합 | PASS |
| statusLabel | 기존 `escape(statusLabel)` 유지 (stale 분기에서는 라벨 미사용) | PASS |
| sr-only | 신규 추가분 없음 (기존 span만) | PASS |

---

## 7. 4b 회귀 가드

| 항목 | 결과 |
|---|---|
| 컨테이너 스코프 셀렉터 | 신규 코드 전부 `approvalContainer()` 경유. 전역 `document.querySelector` 신규 사용은 `syncDiffLinks`의 `querySelectorAll('[data-approval-diff]')`뿐이며 각 링크별로 다시 컨테이너를 잡아 pageId를 읽으므로 스코프 안전 | PASS |
| 모달 열기 시 opener `aria-expanded` | 무변경 | PASS |
| 모달 닫기 시 opener 포커스 복원 | **F1 — 재승인 경로에서 깨짐** | **FAIL** |
| Escape / backdrop 닫기 | 무변경 + reset 추가 | PASS |
| `dmove-approval-modal-open` body 클래스 | close→open 순서라 최종 상태 정상 | PASS |

---

## 발견 항목

### F1 — [Major] 재승인 경로에서 모달 닫을 때 포커스 유실 (4b 규칙 위반)

`approval.js:476-477`
```js
closeModal(reapprove.closest('.dmove-approval-modal'));   // detail 모달 hidden=true
openModal(requestModal, reapprove);                        // opener = 방금 숨긴 모달 안의 버튼
```
`.dmove-approval-modal[hidden] { display: none; }` (approval.css:128-130) 이므로 `reapprove` 버튼은
`display:none` 서브트리 안에 있다. 이후 요청 모달을 닫으면 `closeModal`이
`document.body.contains(modalOpener)` → **true**(DOM에는 있음)로 통과한 뒤 `modalOpener.focus()`를 호출하는데,
숨겨진 요소의 `focus()`는 no-op이라 **포커스가 `<body>`로 떨어진다**. 키보드 사용자는 문서 처음부터 다시 탐색해야 한다.
4b가 세운 "모달을 닫으면 opener로 포커스가 돌아온다" 규칙의 유일한 예외 경로가 된다.

**재작업 지시**: opener를 화면에 남아 있는 요소(그 컨테이너의 pill)로 넘긴다.
```js
var reapproveOpener = reapproveContainer.querySelector('[data-approval-detail-open]');
closeModal(reapprove.closest('.dmove-approval-modal'));
openModal(requestModal, reapproveOpener || null);
```
(`openModal`은 `opener || null`을 이미 허용하고, `closeModal`은 `modalOpener` null이면 포커스 복원을 건너뛴다.)
주의: `closeModal(detail)`이 먼저 pill에 `aria-expanded=false`를 세팅하고 포커스를 옮긴 뒤
`openModal`이 같은 pill에 `aria-expanded=true`를 다시 세팅하게 되는데, 이는 pill이 **detail** 모달의
opener라는 의미와 어긋난다. `aria-expanded`가 정확하길 원하면 opener를 `null`로 넘기고
`closeModal(requestModal)` 이후 포커스만 pill로 보내는 쪽이 더 정확하다. 둘 중 하나를 택할 것.

### F2 — [Minor] 이력 버전과 pill 버전의 산출 기준 불일치

`approvedHistory`는 `request.target().contentVersion()`(요청 **생성** 시점 버전)을 `HistoryEntry.version`으로 쓰고
정렬 키로도 쓴다. 반면 pill·안내문은 `request.approvedContentVersion()`(APPROVED **이벤트**의 버전)을 쓴다.
일반 흐름에서는 PENDING이 편집으로 만료되므로 두 값이 같지만, 만료 리스너가 건너뛴 경우
(영역 승인·리스너 예외·이벤트 유실) 같은 요청이 pill에서는 "v1 승인", 이력에서는 "v2 승인"으로 서로 다르게 보인다.

**재작업 지시(권장)**: 이력도 `approvedContentVersion()`을 1차 기준으로 삼고 null이면 그 항목을 제외한다.
```java
.filter(r -> r.approvedContentVersion() != null)
.sorted(Comparator.comparingInt((ApprovalRequest r) -> r.approvedContentVersion()).reversed())
.limit(5)
.map(r -> new ApprovalMarkup.HistoryEntry(r.approvedContentVersion(), …))
```
(패널·매크로 두 곳 동일하게. 두 메서드가 필터 조건만 다른 사실상 동일 코드이므로
`ApprovalMarkup`에 static helper로 뽑는 것도 검토 — 단 지시 외 변경이 되지 않게 스펙에 명시할 것.)

### F3 — [Minor] `appendHistory` / `detailDialog`의 `history` null 미가드

`history.isEmpty()`를 바로 호출한다. 현재 호출자 2곳은 모두 `.toList()` 결과(non-null)를 넘기므로
실동작 위험은 없으나, `detailDialog`는 두 모듈이 공유하는 public API다. C10 어댑터가 같은 마크업을
재사용하게 되면 즉시 NPE가 된다. `history == null || history.isEmpty()` 로 방어할 것.

### F4 — [Minor] APPROVED 이벤트가 없는 항목의 이력 문구가 잘림

`.orElse("")` 때문에 `<li>v3 승인 — </li>`(트레일링 대시)로 렌더된다.
상태만 APPROVED이고 이벤트가 유실된 레거시 행에서 발생 가능. 빈 문자열이면 `" 승인"`까지만 출력하도록 분기 권장.

### F5 — [Minor] `pill()`의 stale 분기에 `approvedVersion` null 가드 부재

`detailDialog`는 `stale && approvedVersion != null`로 방어하는데 `pill`은 `stale`만 보고 `append(approvedVersion)` 한다.
`Integer` null이면 `"vnull 승인 · v3 미승인"`이 렌더된다. 현재 호출자 2곳이 stale 계산 시 null을 배제하므로 도달 불가지만,
같은 파일 안에서 방어 수준이 엇갈리는 것은 다음 호출자를 오도한다. `pill`도 동일하게 가드하거나
`detailDialog`의 중복 가드를 제거해 한쪽으로 통일할 것.

### F6 — [Minor/관찰] 영역 매크로의 `findByPageId` 호출이 매크로 인스턴스마다 발생

`ApprovalRegionMacro.approvedHistory`가 렌더 호출마다 `repository.findByPageId(pageId)`로 **페이지 전체** 요청을
읽어 스트림 필터한다. 영역 매크로 N개가 있는 페이지는 이미 있던 `findLatestContentRegionRequest` N회에 더해
전체 조회 N회가 추가된다(총 2N). 패널도 `findLatestPageRequest` + `findByPageId`로 2회.
스펙이 "페이지당 1회"라고 못박은 것은 패널 한정이라 위반은 아니지만, 영역이 많은 페이지의 렌더 비용이 눈에 띄게 늘 수 있다.
후속 배치에서 페이지 단위 캐시(요청 스코프)나 `findApprovedByPageId` 전용 쿼리를 검토할 것.

### F7 — [Info] diff 링크는 JS 실행 전/실패 시 죽은 텍스트

`<a>`에 `href`가 없으면 포커스 불가·클릭 불가다. 스펙이 명시적으로 요구한 설계(하드코딩 컨텍스트 패스 금지)이므로
현 구현이 맞다. 다만 JS가 실패한 환경에서는 안내문 안의 "v1과 차이 보기"가 링크처럼 보이지 않는 평문이 된다.
`syncDiffLinks`가 href를 채운 뒤에만 링크로 보이게 클래스를 붙이는 방식은 후속 개선 사항.

### F8 — [Info] 설계 §3.2의 미구현 항목 (5b 스펙 범위 밖)

- 이력 각 항목의 "해당 버전 보기" 링크(`/pages/viewpage.action?pageId=..&pageVersion=n`)
- 이력 항목의 결재선 요약(`결재선 A→B`)
- 재승인으로 생성된 요청의 `이전 승인: v1 (날짜)` 연결 표시 (`previousRequestId` 소비처 없음)

배치 5b 스펙에는 없으므로 FAIL 사유가 아니다. `previousRequestId`는 5a가 REST로 내려주지만
현재 **어떤 화면도 소비하지 않는다** — 백로그에 남길 것.

---

## 재작업 지시 요약 (우선순위 순)

1. **[필수] F1** — `openModal(requestModal, …)`의 opener를 숨겨진 detail 모달 내부 버튼이 아닌
   컨테이너의 pill(`[data-approval-detail-open]`) 또는 `null`로 교체. `aria-expanded` 정합까지 함께 결정.
2. **[권장] F2** — 이력의 버전 산출/정렬 기준을 `approvedContentVersion()`으로 통일 (패널·매크로 2곳).
3. **[권장] F3** — `detailDialog`/`appendHistory`에 `history` null 가드 추가.
4. **[선택] F4, F5** — 빈 `approvedAtIso` 분기, `pill()` null 가드 통일.
5. **[백로그] F6, F7, F8** — 조회 비용, diff 링크 폴백, `previousRequestId` 표시.

재작업 후 재검증 대상: `node --check`, F1 수정 경로의 포커스 동선, `mvn -B -pl approval-confluence9 -am test`.

## 미검증 항목

- `package`/plugin descriptor 검증 미실행 (`scripts/build.ps1` 전체 대신 `mvn test`만 실행 — C9 인스턴스 jar 잠금 회피).
  마크업·JS·CSS 변경만이라 descriptor 영향은 없으나, 최종 배포 전 `-Target confluence9` 1회 필요.
- 브라우저 실런타임 확인 미실시 (정적 추론 검증).
