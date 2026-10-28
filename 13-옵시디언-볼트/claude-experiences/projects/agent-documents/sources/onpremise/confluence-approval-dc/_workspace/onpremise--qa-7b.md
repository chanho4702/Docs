# QA 7b — 업무함 서버 연동 · 스페이스 필터 · 행 회수 · 409 동선 · 반려 인라인 스텝

- 검증일: 2026-08-12
- 기준 커밋: `51205b6` (7a) / 대상: 미커밋 워킹트리 8파일
- 스펙: `_workspace/spec-7b-ui.md` · 설계: `design-batch7.md` D8·D9, `design-batch6.md` §B-6·§F
- REST 계약은 `rest/ApprovalRestResource.java`(7a 구현)를 직접 읽어 교차 비교

## Verdict: **FAIL** — 치명 1 · 중대 5 · 경미 8

게이트는 모두 통과했으나, 스펙 중점 항목인 "뷰 술어 1:1 대응"이 깨졌고 상태 칩 조작이 필터를 무력화한다.

---

## 게이트 실행 결과 (직접 실행)

| 게이트 | 결과 |
|--------|------|
| `mvn -pl approval-confluence9 -am test` | **BUILD SUCCESS** — C9 `Tests run: 94, Failures: 0, Errors: 0` (domain 포함 전 모듈 통과) |
| `mvn -pl approval-confluence10 compile` | **BUILD SUCCESS** |

`clean`/`package`/`install` 미사용(dev 인스턴스 보호). 패키징(jar/obr)은 미검증.
원시 제어 문자 스캔: 4개 변경 파일 모두 0건. C10 소스 미변경. 커밋 없음.

---

## 치명

### C-1. '진행 중' 탭이 '내 차례' 행을 포함한다 (뷰 술어 상실)

- 기준: `git show 51205b6:…/ApprovalInboxServlet.java` TABS
  - `waiting: rows: () => all.filter((r) => r.status === "PENDING" && r.myTurn !== true)`
- 현재: `ApprovalInboxServlet.java:764` `TABS.waiting.params = {status:"PENDING"};`
- REST는 **myTurn의 부정을 표현할 수단이 없다** — `ApprovalRestResource.java:1067` `requireMyTurn = "1".equals(myTurn)`, `:1155` `if (myTurn && !isMyTurn(...)) return false;`. `myTurn=0`은 "조건 없음"으로 해석된다.
- 결과: '진행 중' = PENDING 전체 → '내 차례' 탭과 행이 겹치고, 빈 상태 문구("앞 단계를 기다리는 결재가 없습니다")도 의미가 어긋난다. 스펙 중점검증 1의 "TABS 술어와 1:1 대조" 정면 위반.
- 재작업 지시(택1, 1번 권장):
  1. `ApprovalRestResource.mineResponse`에 `boolean excludeMyTurn = "0".equals(myTurn);`를 추가하고 `matchesFilters`에 `if (excludeMyTurn && isMyTurn(request, currentKey)) return false;`를 넣는다(기존 `myTurn=1` 의미 불변, 파라미터 미전달 시 동작 불변). 클라이언트는 `TABS.waiting.params = {status:"PENDING", myTurn:"0"}`. 7a 파일을 건드리므로 사용자 승인 필요.
  2. (대안) '진행 중' 탭을 서버 페이징에서 제외하고 클라이언트 후처리 — total/offset이 어긋나므로 **권장하지 않음**.

---

## 중대

### M-1. 상태 칩 교집합이 비면 상태 필터가 통째로 사라진다

- `ApprovalInboxServlet.java:797-799`
  ```js
  function serverStatus(tab) {
    const viewStatus = tab.params.status ? tab.params.status.split(",") : [];
    if (!state.status.length) return viewStatus.join(",");
    return (viewStatus.length ? state.status.filter((value) => viewStatus.includes(value)) : state.status).join(",");
  }
  ```
  교집합이 공집합이면 `""` → `:800` `if (status) query.set("status", status);`가 건너뛴다 → **상태 조건 없이 전건**이 온다.
- 예: '진행 중' 탭(`status=PENDING`)에서 APPROVED 칩 클릭 → 0건이 나와야 하는데 모든 상태의 행이 표시된다. 구 동작은 `tabRows.filter(matches)`로 0건이었다.
- 그 칩은 실제로 노출된다 — statusCounts가 후보 전체 기준이라(M-2) '진행 중' 탭에서도 APPROVED 건수가 >0으로 잡힌다.
- 재작업: 교집합이 공집합이면 fetch를 생략하고 `rows=[]; total=0; show(currentView)`로 단락시킬 것(빈 결과가 정답).

### M-2. 칩 건수가 탭·필터와 무관한 전역 수치

- `ApprovalRestResource.java:1084` `statusCounts(candidates, …)` — `candidates`는 **권한 필터만** 거친 전체 집합(`:1076-1081`). 뷰 파라미터도 다른 필터도 반영되지 않는다.
- 구 동작(`51205b6` `renderChips(base)`)은 `tabRows.filter((row) => matches(row, "status"))` — 현재 탭 + 상태 외 필터를 적용한 기준이었다.
- 결과: '내 차례' 탭에 `APPROVED 500` 같은 칩이 뜨고, 칩을 눌러도 M-1 때문에 엉뚱한 목록이 나온다. '처리한 건' 탭에서도 statusCounts는 내가 결정하지 않은 건까지 센다.
- 스펙 §변경1-4가 "건수를 statusCounts로"를 지시했으므로 구현 이탈은 아니나, 사용자가 보는 숫자와 목록이 어긋나므로 이 상태로는 릴리스 불가.
- 재작업: 서버에서 statusCounts를 **status를 제외한 나머지 필터(뷰 파라미터 포함) 적용 후** 집계하도록 `mineResponse`를 고치거나(권장), 최소한 칩 레일을 현재 탭 범위로 좁힐 것.

### M-3. 첫 로드가 실패하면 필터 UI 전체가 무반응이 된다

- `ApprovalInboxServlet.java:812-813` 응답이 `ok`가 아니면 `Promise.reject` → `:838` catch에서 `rows=[]; total=0; show(...)`만 한다. `setupFilters()`는 성공 경로(`:817`)에서만 호출된다.
- `setupFilters()`가 이벤트 핸들러 등록의 유일한 지점이므로(`:848-864`: f-q/f-space/f-requester/f-flow/f-from/f-to/f-due/f-myturn/f-range/filter-toggle/filter-reset/more) 첫 요청이 실패하면 **필터 토글·초기화·더 보기가 전부 죽는다** — URL을 손으로 고치지 않으면 복구 불가.
- 400은 실제로 도달 가능하다: `ApprovalRestResource.java:356-359`(mine) / `:380-383`(requested)가 `IllegalArgumentException`을 400으로 매핑하고, `:1063` `createdFrom > createdTo`가 그 경로다. `f_from`/`f_to`는 정규식 통과만 하면 대소 비교를 하지 않으므로(`:761-762`) 사용자가 커스텀 기간을 거꾸로 넣으면 그대로 재현된다.
- 구 동작은 `r.ok ? r.json() : []`이라 실패해도 `setupFilters()`가 돌았다 — **회귀**.
- 재작업: `activate()` 이전(부트스트랩)에 `setupFilters()`를 1회 호출하도록 분리하고, 옵션 채우기만 응답 후 갱신할 것. 아울러 실패 시 빈 상태 문구 대신 오류 문구를 노출할 것(현재는 "지금 내 차례인 결재가 없습니다"로 표시돼 실패를 감춘다).

### M-4. 사이드바 배지의 모집단이 탭마다 달라진다

- `ApprovalInboxServlet.java:825-833` `syncNavBadges()`
  - `'내 요청'` 탭에서는 statusCounts가 `/mine/requested`(내가 올린 요청) 집계이므로 `myturn`·`waiting` 배지가 "내 요청 중 내 차례" 수로 바뀐다.
  - `if (button.dataset.tab === currentView) count = total;` — 현재 탭 배지만 **필터가 적용된** total을 쓰고, 나머지는 필터 무관 statusCounts를 쓴다. 기준이 섞인다.
  - `requested`/`done` 배지는 현재 탭이 아니면 `count === null`로 return → 이전 값이 그대로 남는다(스테일).
- `?view=notifications`로 진입하면 `activate()`가 `loadRows()`를 호출하지 않으므로(`:844`) statusCounts가 비어 **모든 배지가 0**으로 표시된다. 구 동작은 부트스트랩 `/mine` fetch로 실제 건수를 채웠다 — 회귀.
- 재작업: 배지는 `/mine`의 statusCounts만 원천으로 삼고(내 요청 탭에서는 갱신 생략), 현재 탭 total 덮어쓰기를 제거. notifications 뷰 진입 시에도 배지용 `/mine` 1회 호출(또는 `limit=1`) 유지.

### M-5. 재포매팅·압축 (스펙 "반복 실수 금지 #1" 위반)

- 기능이 늘었는데 서블릿은 907줄 → 884줄. 의미 변경이 없는 블록까지 한 줄로 눌렀다.
  - `filter-toggle` onclick: 원본 5줄(`51205b6` 기준) → `:862` 1줄. 내용 동일.
  - `f-range` onchange: `:855-860` 1~2줄로 압축 — 그 과정에서 원본 주석 **"matches()가 state.from을 로컬로 해석하므로 생성도 로컬이어야 한다. toISOString은 UTC라 하루 어긋난다"가 삭제**됐다. 지금은 `localDayInstant()`가 `toISOString()`을 직접 쓰므로 그 지식이 오히려 더 필요하다.
  - `options()`, `activate()`, `syncNavBadges()`, `openCancelForm()`도 다중 statement 한 줄 결합(`a; b; c;`) 스타일. 리뷰·diff 추적성이 떨어진다.
- 재작업: 최소한 (a) 삭제된 로컬/UTC 주석을 `localDayInstant()` 위에 복원, (b) 손대지 않아도 됐던 `filter-toggle`/`options` 블록을 원본 포매팅으로 되돌릴 것.

---

## 경미

- **m-1** 새 hex 추가 — `approval.css:801` `.dmove-approval-confirm--reject { … background: #fff7f7 … }`. `#ae2e24`/`#172b4d`는 기존 재사용이지만 `#fff7f7`은 파일에 없던 값이다(기존 반려 계열 배경은 `:703` `#ffecea`). UI 규칙 "새 색 금지" 위반.
- **m-2** 죽은 주석 — `ApprovalInboxServlet.java:754-755` "스페이스 필터는 REST가 spaceKey를 내려줄 때 컨트롤과 함께 살린다. URL 값만 받으면 화면에 보이지 않는 필터가 모든 행을 걸러버린다." 이번에 되살렸으므로 사실과 반대. 삭제 필요.
- **m-3** 보이지 않는 필터 잔존 — `f_space`(또는 f_requester/f_flow) 값이 현재 `facets`에 없으면 `syncFilterInputs()`의 `select.value = state.space`가 무시되어 셀렉트는 "전체 스페이스"로, 상태는 필터가 걸린 채로 남는다. m-2가 경고하던 바로 그 케이스. active-filters 칩으로 노출되긴 하나 컨트롤 표시와 불일치.
- **m-4** 실패 시 행 소실 — `:838` catch가 `rows=[]`로 초기화하므로 '더 보기' 요청이 실패하면 이미 보던 행까지 사라진다. 또 실패 경로에서 `state.offset`은 증가한 채 남고 `focusAfterAppend`도 -1로 복구되지 않는다.
- **m-5** '처리한 건' 술어 미세 차 — 구 `myDecision`은 `eligible.contains(actorKey)`를 요구(`ApprovalJson.java:23`), 서버 `myDecided`는 `decisions().containsKey(currentKey)`만 본다(`ApprovalRestResource.java:1164`). 결재선에서 제외된 뒤에도 목록에 남는다. 실무 영향은 작다.
- **m-6** 잠재 위험 — 반려 버튼(`ApprovalMarkup.java:247`)이 `class="… dmove-approval-action"`을 유지하는데 그 클래스는 CSS에 없고 `approval.js:685-687` 결정 핸들러의 선택자 전용 훅이다. 현재는 `[data-approval-reject-open]` 분기가 같은 리스너 앞쪽에서 `return`하므로 무해하지만(**오진 방지를 위해 리스너가 1개임을 확인함 — `approval.js:525`가 유일한 click 리스너**), `decision`이 `'approve'`로 하드코딩된 상태(`:738`)라 분기 순서가 바뀌면 "반려" 클릭이 곧바로 승인 POST가 된다. 클래스를 제거하거나 `if (button.dataset.approvalAction !== 'approve') return;` 가드를 둘 것.
- **m-7** 표기 축소 — `requestCount`가 `spec.label + " " + total + "건"`으로만 표시(`:822`). 구 동작의 "(전체 N건 중)"이 사라졌다. 스펙이 total 기반을 지시했으므로 이탈은 아니나 사용자 정보량이 줄었다.
- **m-8** 테스트 커버리지 — 반려 스텝 마크업(`data-approval-reject-required`, `data-approval-reject-confirm`)과 `rejectionReasonRequired` 전달에 대한 신규 케이스가 없다. 기존 테스트 변경은 정당(아래 참조)하나 새 동작은 무커버리지.

---

## 통과 확인 (의미 기반)

**서버 연동 정합**
- 파라미터 형식이 7a 계약과 일치: `status` CSV(`parseStatuses` `:1117`), `limit=50`/`offset`, `q`(서버도 pageTitle contains·소문자·100자 절단 `:1069,1148`), `spaceKey`/`requesterKey`/`flowId`, `due` ∈ {soon,over,none}(`:1139`), `myTurn`/`myDecided`는 `"1"` 문자열 비교(`:1067-1068`)에 정확히 `"1"` 전달.
- 날짜: `localDayInstant()`(`:790-794`)가 `new Date(y, m-1, d(+1)).toISOString()`으로 **뷰어 로컬 자정 → ISO Instant**를 만들고, 서버는 `createdAt >= from`, `createdAt < to`(`:1152-1153`)로 to를 exclusive 처리 — 다음날 자정 전달과 정확히 맞물린다.
- 뷰 매핑: `myturn`(PENDING+myTurn=1), `requested`(`/mine/requested`), `done`(`myDecided=1` — 구 술어가 `myDecision === APPROVED|REJECTED`였으므로 설계 D8의 "status 4종" 문구보다 **이쪽이 옳다**. 스펙 §변경1-1의 "1:1 대응" 지시를 따른 판단으로 인정) 3건은 의미 보존. `waiting`만 C-1.

**응답 처리**
- `{items,total,statusCounts,facets}` 파싱 정상(`:815-816`), 누락 시 기본값 방어.
- 경쟁 응답 가드 실동작 확인: `const sequence = ++requestSequence`(`:797`) → 성공 `if (sequence !== requestSequence) return;`(`:814`), 실패 `if (sequence === requestSequence)`(`:838`). 낡은 응답이 새 응답을 덮지 않는다.
- 더 보기: `focusAfterAppend = rows.length; state.offset += PAGE; loadRows(true)`(`:863`) → `rows.concat(items)` append → `syncMore(rows.length, total)`(`:692`)로 잔여 건수·버튼 노출을 total 기준 산정. 포커스 이동 규칙(더 이상 남은 게 없을 때 새 첫 행의 링크)도 원본과 동일 조건 유지.
- offset 리셋: `setFilter`/`toggleStatus`/`removeFilter`/`resetFilters`/`f-range`/`activate` 전부 `state.offset = 0` — 누락 없음. `state.limit` 잔존 참조 0건.

**칩 레일** — 조건부 노출 규칙(`count`가 0이고 선택도 아니면 skip) 유지, CANCELLED(회수)도 STATUS_ORDER에 포함, `dueSoon`/`dueOver` 키가 서버 `statusCounts`(`:1193`)와 일치. (건수 모집단 문제는 M-2)

**스페이스 필터** — `f-space` 컨트롤 추가(`:290`, label로 감싸 id/for 불필요), `facets.spaces` 옵션(`:847`), `state.space` 강제 `""` 제거(`:756`), URL `f_space` 왕복(읽기 `:756` / 쓰기 `:737`), REST `spaceKey` 전달(`:802`), 활성 필터 칩은 `spaceName()`으로 표시. 복귀 링크용 패스스루 `spaceKey`는 `writeUrl` `:732-733`에서 `location.search`에서 읽어 별도 키로 보존 — 필터용 `f_space`와 충돌하지 않는다. 열 추가 없음(`colSpan 7` 유지), `r.spaceName`은 `subject.title` 속성으로만.

**행 회수** — `design-batch6.md` §B-6 시안과 의미 동등(포매팅만 압축). '내 요청' 뷰 + PENDING 행에만 노출(`:685`), `openCancelForm`이 상세 행을 열고 셀 최상단에 폼 prepend 후 textarea 포커스, 중복 호출 시 기존 폼에 포커스만. POST는 `{base}/{id}/cancel?actorKey=…&reason=…`(사유 공백이면 파라미터 생략), 실패 시 `message.textContent`에 서버 본문. `IS_ADMIN` 토큰은 TOKEN 정규식(`:32`)·`values.put`(`:63`)·마크업(`:266`) 3점 모두 등록되고 렌더 테스트가 미치환·치환값을 검증한다. §B-6이 "업무함에 관리자 분기를 넣으면 죽은 코드"라며 `data-admin`을 향후용으로 남기라 했으므로 JS 미사용은 설계대로다. **XSS**: 신규 DOM 조립이 전부 `el()`+`textContent`/속성 대입, `innerHTML` 사용 0건.

**반려 인라인 스텝** — `window.prompt` 전역 제거 확인(`approval.js`·서블릿 grep 0건, 업무함은 원래 prompt를 쓰지 않아 대상 아님). 마크업은 `myTurn`일 때만 렌더(`ApprovalMarkup.java:233-235`), `data-approval-reject-open`/`-abort`/`-confirm` 3분기 구현(`approval.js:526-568`), 회수 스텝과 상호 배타(양방향 — 반려 열 때 `:532` 회수 숨김, 회수 열 때 `:576-579` 반려 숨김), ESC 우선순위에 반려 스텝 분기 추가(`:757-761`), `closeModal`이 반려 박스 hidden·aria-expanded·메시지를 초기화(`:427-436`). `rejectReasonRequired`는 패널(`ApprovalPagePanel.java:158`)·매크로(`ApprovalRegionMacro.java:183`)에서 `settings.rejectionReasonRequired()`로 전달돼 `data-approval-reject-required`로 노출되고, 클라이언트는 필수+공백이면 POST 없이 스텝 내 메시지 표시(`:551-554`), 서버 400 본문도 같은 위치에 표시(`:562-564`). 승인은 즉시 POST 유지.

**409 동선** — 자동 `location.reload()` 두 곳 모두 제거, `showRefreshMessage()`(`:23-37`)가 메시지 노출 + `.dmove-approval-message` 뒤에 `aui-button` "새로고침" 삽입. 중복 추가 가드(`target.parentNode.querySelector('[data-approval-refresh]')`) 있음. 모달을 닫지 않으므로 승인자·메모 입력 보존. 영역 해시 409는 서버 문구 부분일치를 유지하고 결합을 주석으로 명시(`:831`), 중복 요청 409는 서버 본문 우선 표시.

**UI 스타일 규칙** — 서블릿 신규 CSS 8줄 전부 `#dmove-approval-app` 스코프(`:157-164`)이고 `var(--rejected)`/`--rejected-bg`/`--pending`/`--pending-bg`/`--rule` 토큰만 사용. `.cancel-form`/`.ghost--danger` 중복 규칙 없음(각 1회). `sr-only`는 span에만 부여(`:288`, `:614`). 새 마크업에 `id`/`for` 쌍 없음(label 감싸기). text block 내 신규 JS에 백슬래시 시퀀스 없음(기존 `\\d` 이스케이프 온전, `:761-762`). `String.format` 미사용, 하드코딩 컨텍스트 패스 없음.

**테스트 갱신의 정당성** — `ApprovalMarkupCancelTest`는 `detailDialog` 시그니처에 `false`(반려 사유 선택) 인자만 추가, 기존 단언 무변경 → 게이트 우회 아님. `ApprovalInboxServletRenderTest`는 단언 3개 **추가만**(`__IS_ADMIN__` 미치환, `data-admin="1"`, `id="f-space"`), 삭제·완화 없음 → 의미 보존. `detailDialog` 호출부는 패널·매크로·테스트 3곳뿐이며 전부 갱신됨(C10에는 해당 API 없음, compile PASS로 확인).

**Codex 결함 패턴** — 제어 문자 0건, 검증 문자열 우회 없음, C10 미수정, 커밋 없음. 다만 압축/재포매팅은 M-5로 적발. (참고: "경험 Vault 기록" 보고는 실측상 허위 — `C:\Users\DMOVE\claude-experiences\projects\confluence-approval-dc`는 8/11 이후 미변경.)

---

## 재작업 지시 요약 (우선순위 순)

1. **C-1**: REST에 `myTurn=0`(내 차례 제외) 분기 추가 + `TABS.waiting.params = {status:"PENDING", myTurn:"0"}`. 7a 파일(`ApprovalRestResource.java`) 수정이 필요하므로 사용자 승인 후 진행.
2. **M-1**: `serverStatus()` 교집합이 공집합이면 fetch 생략하고 빈 목록 렌더로 단락.
3. **M-3**: `setupFilters()`를 부트스트랩에서 1회 호출하도록 분리(응답 후에는 옵션 갱신만). 실패 시 오류 문구 노출.
4. **M-2**: `statusCounts`를 status 외 필터·뷰 파라미터 적용 후 집계로 좁힌다(또는 칩을 탭 스코프로 제한).
5. **M-4**: 배지는 `/mine` statusCounts 단일 원천, 현재 탭 total 덮어쓰기 제거, notifications 진입 시에도 배지용 호출 유지.
6. **M-5**: 삭제된 로컬/UTC 주석을 `localDayInstant()` 위에 복원하고, 의미 변경이 없던 `filter-toggle`/`options` 블록을 원본 포매팅으로 되돌린다.
7. **m-1/m-2**: `#fff7f7` → 기존 `#ffecea` 재사용, 754-755줄 죽은 주석 삭제.
8. **m-6**: 반려 버튼에서 `dmove-approval-action` 클래스 제거(또는 결정 핸들러에 `data-approval-action` 존재 가드 추가).
