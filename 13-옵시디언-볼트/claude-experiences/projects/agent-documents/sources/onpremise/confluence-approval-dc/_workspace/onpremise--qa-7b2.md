# QA 7b-2 — 재작업(3차) 검증 · R1~R8

- 검증일: 2026-08-12
- 기준 커밋: `51205b6`(7a) / 대상: 미커밋 워킹트리 9파일 (7b + 7b-2 누적)
- 입력: `_workspace/qa-7b.md`(2차 FAIL) · `_workspace/spec-7b2-rework.md`(R1~R8)
- 방법: `git diff 51205b6` 전량 정독 + 51205b6 원본 대조 + 게이트 직접 실행

## Verdict: **FAIL** — 치명 0 · 중대 1 · 경미 8

C-1(치명)과 M-1·M-2·M-3·M-5는 **모두 해소**됐다. M-4(배지 모집단)만 **절반 남았다** — `?view=notifications`는 고쳐졌으나 `?view=requested` 진입 경로에서 동일 증상(내 차례·진행 중·처리한 건 배지가 0)이 그대로다. 수정 규모는 3줄 수준이다.

---

## 게이트 실행 결과 (직접 실행)

| 게이트 | 결과 |
|--------|------|
| `mvn -pl approval-confluence9 -am test` | **BUILD SUCCESS** — Reactor: root / Approval Domain / C9 전부 SUCCESS. C9 `Tests run: 96, Failures: 0, Errors: 0, Skipped: 0` (7b 94 → +2, R8 신규분) |
| `mvn -pl approval-confluence10 compile` | **BUILD SUCCESS** (`Nothing to compile — all classes are up to date`, C10 소스 무변경) |

- `clean`/`package`/`install` 미사용 → 패키징(jar/obr) 미검증.
- `git log -1` = `51205b6` — **커밋 없음** ✅. `git diff --stat 51205b6 -- approval-confluence10` 공집합 → **C10 미수정** ✅.
- 원시 제어 문자 스캔(diff 전량 `[\x00-\x08\x0B\x0C\x0E-\x1F]`): **0건** ✅.
- text block 이스케이프: `f_from`/`f_to` 정규식 `\\d{4}-\\d{2}-\\d{2}` 온전 ✅.
- 테스트 의미 바꿔치기: 없음. 기존 단언 삭제·완화 0건, 추가만(아래 R8).

---

## R별 판정

### R1 (치명 C-1) — **PASS**

`ApprovalRestResource.mineResponse` 실코드 순서를 직접 확인(`:1079-1101`):

1. `candidates` = canView 통과분(`:1079-1084`)
2. `badges(candidates, …)` — **뷰 단계 이전**(`:1087`)
3. `view` = `matchesView(viewStatuses, myTurn, requireMyDecided, currentKey)`(`:1088-1089`)
4. `statusCounts(view, …)` · `facets(view, …)`(`:1090-1091`)
5. `filtered` = `matchesFilters(status/q/spaceKey/requesterKey/flowId/from/to/due)`(`:1092-1094`)
6. `total = filtered.size()` → 정렬 → 슬라이스(`:1095-1098`)

스펙 순서와 1:1 일치. `matchesFilters`에서 myTurn/myDecided 인자가 제거됐고(`:1150-1161`), `matchesView`가 신설돼 `"1"`→내 차례, `"0"`→내 차례 아님을 각각 별도 분기로 처리한다(`:1165-1170`).

- 서블릿 `TABS.waiting.params = {viewStatus:"PENDING", myTurn:"0"}` ✅ (`ApprovalInboxServlet.java:701`), `myturn`=`{viewStatus:"PENDING", myTurn:"1"}`, `done`=`{myDecided:"1"}`, `requested`={} — 51205b6 TABS 술어와 4개 모두 의미 동등.
- 클라이언트 전달부: `if (tab.params.myTurn) query.set("myTurn", tab.params.myTurn)` — 문자열 `"0"`은 truthy이므로 실제로 전송된다(실측 확인).
- 화이트리스트 400: `viewStatus`는 `status`와 같은 `parseStatuses()`(`:1123-1134`, `ApprovalStatus.valueOf` 실패 시 `IllegalArgumentException`)를 타고, `mine`(`:356-359`)·`requested`(`:380-383`) 양쪽에서 400 JSON으로 매핑된다 ✅.
- `myTurn` 값 검증 신설: `blank/0/1` 외 값은 400(`:1068-1070`) ✅ — 기존 `myTurn` 미전달 시 동작은 불변.

### R2 (M-1) — **PASS**

`serverStatus()`가 교집합 공집합에 **`null`**을 반환하고(`:816-821`), `loadRows()`가 `if (status === null) { rows = []; total = 0; show(currentView); return; }`로 fetch 없이 단락한다(`:825-828`). 2차의 "빈 문자열 → status 조건 누락 → 전건 조회" 경로는 사라졌다.
`state.status`가 비었거나 탭에 `viewStatus`가 없으면 `state.status.join(",")`(빈 문자열 또는 사용자 선택)을 그대로 쓰므로 기존 경로도 보존.

### R3 (M-2) — **PASS**

`statusCounts`가 `view`(탭 모집단) 기준으로 계산되고(`:1090`), 서블릿 `renderChips()`는 `Number(statusCounts[status] || 0)`·`statusCounts.dueSoon`/`dueOver`만 사용(`:548-570`). 조건부 노출(`count===0 && !on` → skip) 유지 ✅. 이제 '진행 중' 탭에서 APPROVED 칩은 건수 0이라 노출되지 않는다 — M-1·M-2의 연쇄가 양쪽에서 끊겼다.

### R4 (M-3) — **PASS**

- 부트스트랩이 `setupFilters(); activate(currentView);`로 바뀌어(`:912-913`) **첫 fetch와 무관하게** 핸들러가 등록된다. `filtersSetup` 플래그로 재등록을 막고, 응답 후 호출은 옵션 갱신 + `syncFilterInputs()`만 수행(`:870-871`) ✅.
- 실패 경로(`:837`): `rows`를 건드리지 않아 **기존 행 유지**, `append`면 `state.offset = Math.max(0, state.offset - PAGE)`로 **offset 원복**, `focusAfterAppend = -1` 복구, `list-error`에 "목록을 불러오지 못했습니다." 표시 후 `show()` 재렌더 ✅ (m-4 동반 해소).
- 오류 표시 요소는 신규 `<span class="dmove-approval-message" id="list-error" role="alert">`(`:284`). 서블릿은 `atl.general` 데코레이터를 쓰고 `approval.css`가 `atl.general` 컨텍스트에 등록돼 있어(`atlassian-plugin.xml:72-77`) `.dmove-approval-message:not(:empty){color:#ae2e24}`(`approval.css:114`)가 실제로 적용된다 — 무스타일 아님 ✅.
- 성공 시 `list-error`를 비운다(`:829`).

### R5 (M-4) — **부분 PASS (중대 1건 잔존, 아래 M-A)**

- 배지 원천이 응답 `badges`로 통일됐다(`:846-855`). 현재 탭 `total` 덮어쓰기 제거 ✅.
- 서버 `badges()`(`:1211-1223`)는 후보 전체(뷰 단계 이전) 기준 `{myTurn, waiting(=PENDING && !myTurn), decided(=hasMyDecision)}`, `/mine/requested`는 `{requested}`(PENDING 건수) — 스펙과 일치 ✅.
- `badges = Object.assign(badges, payload.badges || {})`(`:832`)로 병합 → 내 요청 탭 방문 후에도 mine 배지가 유지되고, requested 배지는 방문 시점부터 lazy로 채워진다 ✅.
- `?view=notifications` 진입: `activate()`가 `if (!Object.keys(badges).length) loadBadges()`로 `/mine?actorKey=…&limit=1` 1회 호출(`:906-910`) ✅ — 2차 지적 해소.

### R6 (M-5) — **PASS (경미 잔여)**

- 서블릿 라인 수 **907(base) → 884(7b) → 923(현재)**. 압축분이 실제로 되돌아왔다.
- `filter-toggle` onclick 블록: diff hunk 자체가 사라짐 = 원본 5줄 포매팅 복원 ✅.
- `options()`: 기능 추가분(f-space 라벨·fallback)만 남고 base 포매팅 유지 ✅.
- 로컬/UTC 주석 복원 ✅ — `localDayInstant()` 내부에 "from/to는 로컬 자정 기준이다. toISOString은 UTC로 변환하므로 날짜만 직접 조정하면 하루가 어긋난다."(`:812`), `f-range` 쪽 주석도 새 구조에 맞게 갱신(`:887`).
- 잔여는 경미 m-2 참조(순수 포매팅 hunk 2건 + 신규 코드의 1줄 다중 statement).

### R7 (경미 6건) — **5.5 / 6**

| # | 항목 | 판정 |
|---|------|------|
| 1 | `#fff7f7` 제거 | ✅ `approval.css:801` `background:#ffecea`(기존 반려 계열 재사용), 신규 hex 0건 |
| 2 | 죽은 주석 삭제 | ✅ `state.space` 위 2줄, `setupFilters` 위 1줄 모두 제거 |
| 3 | `f_space` fallback 옵션 | ✅ `options()`(`:773-777`)가 `facets.spaces`에 없는 `state.space`를 key 라벨로 주입. 부트스트랩(facets 비었을 때)에도 동작 → 컨트롤/상태 불일치 해소 |
| 4 | `myDecided` eligible 검사 | ✅ `hasMyDecision`이 `eligibleApproverKeys().contains(currentKey) && decisions().containsKey(currentKey)`(`:1176-1178`). 51205b6 `ApprovalJson.myDecision`(eligible 미포함 시 null → 구 클라이언트 `done` 술어 false)과 **의미 일치**. 기존 `ApprovalRestResourceFilteringTest:70-71`이 무수정으로 통과 = 기존 의미 보존 확인 |
| 5 | 반려 버튼 훅 정리 | ⚠️ 절반 — `dmove-approval-action` 클래스는 제거(`ApprovalMarkup.java:247` → `data-approval-reject-open`)돼 결정 핸들러 선택자(`approval.js:687`)에 더 이상 걸리지 않는다. 다만 `var decision = 'approve';` 하드코딩은 그대로(`approval.js:738`)이고 `data-approval-action` 검사 가드도 없다 → 경미 m-3 |
| 6 | "(전체 N건 중)" 복원 | ✅ `:842` `rows.length !== total`일 때 `" (전체 " + total + "건 중)"` |

### R8 — **PASS (실질적)**

`ApprovalMarkupCancelTest` +2케이스, C9 테스트 94 → 96.

- `내_차례일_때만_반려_단계가_렌더된다`: `myTurn=true`에서 `data-approval-reject-open`·`data-approval-reject-confirm` 존재, `myTurn=false`에서 부재 — `ApprovalMarkup.java:233-235`의 `if (myTurn)` 게이트를 양방향으로 검증한다(존재 확인이 아니라 조건 검증) ✅.
- `반려_사유_필수_설정은_data_속성과_필수_라벨에_반영된다`: `data-approval-reject-required="1"` + `반려 사유 <span class="dmove-approval-field__optional">필수` 문자열 — 마크업 생성부(`:490-497`)의 삼항 분기를 실제로 통과해야만 참 ✅.
- 헬퍼 오버로드 추가 방식이라 기존 2케이스는 인자 `false, false`로 무변경 ✅.

---

## 중대

### M-A. `?view=requested` 진입 시 나머지 배지가 전부 0 (M-4 잔여)

- `writeUrl()`(`:735`)이 항상 `view=currentView`를 URL에 쓴다 → 내 요청 탭에서 새로고침/북마크하면 `?view=requested`로 부팅한다.
- 부팅 시 `badges = {}` → `activate("requested")` → `loadRows(false)` → `/mine/requested` 응답의 `badges`는 `{requested:n}`뿐.
- `syncNavBadges()`(`:846-855`)는 `myturn`/`waiting`/`done`을 **무조건** `Number(badges.myTurn || 0)` 식으로 채운다 → 누락 키가 `null`이 아니라 **0**이 되어, 실제로 결재 대기 5건이 있어도 `내 차례 0`이 표시된다. `is-zero`(opacity .45)로 흐려질 뿐 숨겨지지 않는다(`NavMarkup.java:105-106`, `:empty`가 아니므로 display:none 미적용).
- **재현 빈도가 낮지 않다**: 행 회수 확정이 `location.reload()`(`:717`)이므로 **회수 직후 항상 이 상태로 착지**한다.
- 2차 M-4가 지적한 "notifications 진입 시 모든 배지 0"과 동일 결함이며, 구 동작(부트스트랩 `/mine` 무조건 fetch)에 대한 회귀다.
- 재작업(3줄):
  ```js
  // syncNavBadges: 없는 키는 건드리지 않는다 (탭별 응답이 부분 집합이므로)
  const has = (k) => Object.prototype.hasOwnProperty.call(badges, k);
  if (button.dataset.tab === "myturn" && has("myTurn")) count = Number(badges.myTurn || 0);
  … waiting / decided 동일 …
  ```
  + `activate()`에서 `view === "requested"`이고 `!has("myTurn")`이면 `loadBadges()`도 함께 호출(이미 있는 함수 재사용).

---

## 경미

- **m-1** 죽은 인자 — `matchesFilters(…, String currentKey, …)`(`:1150-1152`)에서 myTurn/myDecided가 빠진 뒤 `currentKey`를 본문에서 전혀 쓰지 않는다. 시그니처 정리 권장.
- **m-2** 잔여 압축(R6 미완) — (a) `setupFilters` 말미 `hasFilter` 블록이 base 4줄 → `:883` 1줄로 **순수 압축**(기능 무변경, 원복 대상이었음). (b) `debounce()`가 파일 뒤쪽에서 앞쪽(`:805`)으로 **내용 무변경 이동**(호이스팅상 불필요한 이동). (c) 신규 코드가 1줄 다중 statement 스타일 — 180자 초과 3줄(`:837` 238자 catch 절, `:859` 220자 `activate`, `:873` 231자 셀렉트 바인딩). 신규분이라 R6 위반은 아니나 추적성이 나쁘다.
- **m-3** `var decision = 'approve';`(`approval.js:738`) 하드코딩 잔존 — 현재는 반려 버튼이 선택자에서 빠져 안전하지만, `.dmove-approval-action`을 다는 버튼이 하나라도 늘면 다시 "다른 액션 → 승인 POST"가 된다. `if (button.dataset.approvalAction !== 'approve') return;` 가드 또는 `dataset.approvalAction` 사용 권장.
- **m-4** '진행 중' 탭에서 `f-myturn` 체크박스가 **무시**된다 — `if (tab.params.myTurn) … else if (state.myturn) …`(`:834-835`)이라 탭 파라미터 `"0"`이 우선한다. 활성 필터 칩("내 차례만")은 그대로 노출되므로 표시/동작 불일치. 구 동작은 0건(모순 조합)이었다. 해당 탭에서 체크박스를 비활성화하거나 칩을 숨기는 편이 정직하다.
- **m-5** R2 단락 경로의 부수 상태 — fetch를 건너뛰므로 `statusCounts`/`facets`가 직전 응답값으로 남고(칩 건수 stale), 직전 오류가 있었다면 `list-error` 문구도 지워지지 않는다. `show()` 호출 전에 `list-error`를 비우고 칩은 선택 항목만 남기는 처리 권장.
- **m-6** 신규 서버 로직 무테스트 — `matchesView`(myTurn `"0"` 분기 포함), `viewStatus` 400, `badges()` 3키 집계에 단위 테스트가 없다. 이번 치명 수정의 본체인데 커버리지가 0이다(기존 `ApprovalRestResourceFilteringTest`에 3~4줄이면 충분).
- **m-7** 오류 메시지 혼동 — `viewStatus`가 잘못돼도 `"유효하지 않은 status입니다."`(`:1130`)로 나와 어느 파라미터가 문제인지 알 수 없다.
- **m-8** 사소한 계약 잡음 — `/mine/requested` 호출에 `actorKey`를 실어 보내지만(`:823`) 그 엔드포인트는 해당 파라미터를 선언하지도, `denyCurrent`를 부르지도 않는다(무해). 반려 확정은 `dataset.approvalActorKey || ''`로 빈 actorKey도 POST하지만 승인 경로는 비어 있으면 return — 두 경로의 방어 수준이 다르다.

---

## 회귀 스캔 (7b 1차 PASS 항목 유지 확인)

diff 전량 대조 결과 아래는 **무변경 또는 의미 보존**:

- **경쟁 응답 가드** — `const sequence = ++requestSequence`(`:823`) → 성공 `:826`, 실패 `:837` 양쪽 비교 유지 ✅
- **더 보기** — `focusAfterAppend = rows.length; state.offset += PAGE; loadRows(true)`(`:902`) + `syncMore(rows.length, total)`(`:690`) + 포커스 이동 조건 유지 ✅
- **offset 리셋** — `setFilter`/`toggleStatus`/`removeFilter`/`resetFilters`/`f-range`/`activate` 6곳 전부 `state.offset = 0` ✅, `state.limit` 잔존 참조 0건
- **스페이스 필터 왕복** — `f_space` 읽기(`:755`)/쓰기(`:738`), REST `spaceKey` 전달(`:831`), 복귀용 패스스루 `spaceKey`(`:733-734`)와 키 분리 유지 ✅
- **행 회수** — `openCancelForm` 무변경(`:694-718`), '내 요청'+PENDING 조건, POST 파라미터·실패 메시지 동일 ✅
- **prompt 제거** — `window.prompt` grep 0건 ✅
- **반려 3분기 · ESC · closeModal** — `open`/`abort`/`confirm` 분기(`approval.js:526-568`), 회수 스텝과 상호 배타(양방향), ESC가 반려 스텝을 먼저 닫음(`:755-760`), `closeModal`이 hidden·aria-expanded·메시지 초기화(`:427-436`) — 전부 유지 ✅
- **409 새로고침 버튼** — `showRefreshMessage`(`:23-37`) 중복 삽입 가드 포함 유지, 자동 reload 부활 없음 ✅
- **XSS 무결** — 신규/변경 DOM 조립 전부 `el()` + `textContent`/속성 대입. 서블릿 `innerHTML` 0건, `approval.js`의 `innerHTML`은 기존 정적 svg(`:142`)와 클리어(`:203`) 2곳뿐 ✅
- **Codex 결함 패턴** — 제어 문자 0, 검증 문자열 우회 0, 테스트 단언 삭제 0, C10 미수정, 커밋 없음 ✅

---

## 재작업 지시 (1건)

1. **M-A**: `syncNavBadges()`가 응답에 없는 배지 키를 `0`으로 덮지 않도록 `hasOwnProperty` 검사로 바꾸고, `?view=requested` 부팅 시 mine 배지가 없으면 기존 `loadBadges()`를 1회 호출한다. (동일 함수 재사용, 3줄)
2. (선택) m-2(a) `hasFilter` 블록 원본 포매팅 복원, m-6 `matchesView`/`badges` 단위 테스트 3케이스, m-1 죽은 `currentKey` 인자 제거.
