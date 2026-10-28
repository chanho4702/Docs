# QA 배치 6b — 3차(최종) 검증

검증자: approval-qa / 2026-08-12
기준 커밋: 28d25d7 + 미커밋 워킹트리 (추적 9파일 +762/-110, 신규 `ApprovalPagePanelCancelTest.java`)
선행: `_workspace/qa-6br.md` §5 R8-1~R8-6 / 설계 정본 `_workspace/design-batch6.md`

## 판정: **PASS (조건부 — R8-5.3만 부분 이행)**

R8 6개 지시 중 5개 완전 이행, 1개(R8-5.3 회수 노출 회귀 테스트) 부분 이행.
**치명 0 / 중대 0 / 경미 3.** 2차의 치명 6건·중대 4건은 전부 유지 또는 해소되었고 회귀는 없다.
남은 3건은 전부 테스트 커버리지·폴백 품질 문제로, 릴리스를 막지 않는다.

| 등급 | 2차 잔여 | 해소 | 잔여 | 신규 | 최종 |
|------|--------:|-----:|-----:|-----:|-----:|
| 치명 | 0 | — | 0 | 0 | **0** |
| 중대 | 4 (M10·M11·M12·M13) | 4 | 0 | 0 | **0** |
| 경미 | 4 (m15·m16·m17·m18) | 3 | 1 | 2 | **3** |

---

## 0. 빌드 / 실측 (직접 실행)

| 항목 | 결과 |
|------|------|
| `mvn -B -pl approval-confluence9 -am test` | **BUILD SUCCESS** — c9 `Tests run: 78, Failures: 0, Errors: 0, Skipped: 0`, Total time 28.576 s |
| `mvn -B -pl approval-domain test` | **BUILD SUCCESS** — `Tests run: 52, Failures: 0, Errors: 0, Skipped: 0` |
| 실행 조건 | `JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`, mvn은 `C:\Onpremise\.toolchains\apache-maven-3.9.16\bin\mvn.cmd`. 기본 PATH에 mvn 없음, 기본 JDK는 corretto 1.8로 enforcer 즉시 실패 |
| 신규 테스트 클래스 | `ApprovalPagePanelCancelTest` **4/4 green** / `ApprovalInboxServletRenderTest` 6→**8** |
| **렌더 실측** | `target/classes` + Dump 하네스로 `ApprovalInboxServlet.render(...)`(51,792자)·`ApprovalSettingsServlet.render(...)`(37,118자) 실출력 확보 |
| `node --check` — 렌더된 인라인 스크립트 | **6/6 OK** (Inbox 3블록 / Settings 3블록) |
| 렌더 `<style>` 콤마 조각 스코프 전수 파싱 | Inbox 141규칙 / Settings 91규칙 — **비스코프 0건** |
| `prefers-color-scheme` / `/confluence/` 하드코딩 / `summary`·`metric` 잔존 | 각 **0건** |
| `git diff --check` | 통과 |
| 200자 초과 신규 라인 | **8건** — 2차와 동일(SVG 리터럴 1, mask data URI 4, 단일 CSS 규칙 3). 신규 증가 0 |

---

## 1. R8 항목별 판정

### R8-1 (M11) 표의 시간대 표기 — **PASS**

| 요구 | 결과 |
|------|------|
| `syncTzSuffix()` 함수 | `ApprovalInboxServlet.java:368-371` — 지시문과 동일 |
| 초기화 호출 | `:888` (`fetch(.../mine).then` 안, `setupFilters()` 직후) |
| 요청 시각 + **마감** 두 `<th>` 모두 span | `:300` — 렌더 HTML에서 `data-tz-suffix` 3회(마크업 2 + querySelectorAll 1) |
| `.tz` CSS | `:183` `#dmove-approval-app .tz{font:400 10.5px/1 var(--mono);color:var(--muted);letter-spacing:0;text-transform:none}` — 렌더 CSS에 1건 |
| 테스트 단언 보강 | `assertTrue(html.contains("function syncTzSuffix"))` + `assertTrue(html.contains(".tz{font:400 10.5px"))` 추가 — 2차가 지적한 위양성 해소 |

특이성 확인: `.tz`는 `th` 자손 span이므로 `#dmove-approval-app thead th`(`letter-spacing:.14em`)는 상속으로만 닿는다.
직접 매치 규칙이 항상 이긴다 — 순서·특이성 어느 쪽으로도 안전. `font` 단축이 크기/굵기를,
`letter-spacing:0`·`text-transform:none`이 단축에 없는 두 속성을 각각 덮는다. 설계 C-5 충족.

### R8-2 (M12) 프리셋 로컬 ymd — **PASS (렌더된 코드 node 실측)**

`ApprovalInboxServlet.java:834-838`. `toISOString()` 제거, 로컬 게터 조립. **소스가 아니라 렌더 출력에서
프리셋 `else` 블록을 그대로 잘라 node에서 실행**하고, 기대값을 독립 계산해 대조했다(TZ=Asia/Seoul, 2026-08-12).

| 프리셋 | `state.from` | `state.to` | 판정 |
|--------|--------------|------------|------|
| 오늘 | 2026-08-12 | 2026-08-12 | PASS |
| 최근 7일 | 2026-08-06 | 2026-08-12 | PASS |
| 최근 30일 | 2026-07-14 | 2026-08-12 | PASS |

`matches()` 왕복까지 실측: "오늘" 프리셋에서 **오늘 00:05 로컬 생성 행 = 포함**, **어제 23:55 = 제외**.
2차 M12의 증상(오늘이 어제분을 삼킴)이 정확히 사라졌다. TZ=UTC에서도 동일 통과.
`ymd`가 로컬 게터만 쓰므로 오프셋에 대해 구조적으로 무관하다.

### R8-3 (M13) 앵커 `gap:0` 가드 — **PASS (설계 원문 축자 일치)**

`approval.css:854-862`. 주석 1줄 + 셀렉터 6개(`a#…inbox-sidebar-link`, `a.…inbox-sidebar-link`,
`li.…inbox-sidebar-link > a`, `a#dmove-approval-request-action`, `a.…request-trigger`,
`li.…request-trigger > a`) + `gap: 0`. R8-3 코드 블록과 셀렉터 집합·순서가 완전히 같다.
파일 말미 배치라 후속 규칙에 밀리지 않는다.

### R8-4 (M10) 업무함 메모 (b)·CSS — **PASS**

- `detail(row)` `:473-482` — `if (row.requestMessage)` 가드 하에 `memo-block`을 만들고
  `td.append(memo)` → **그 다음** `const grid = …` / `td.append(grid)`. **grid 앞 배치 확정.**
  `el("p", row.requestMessage)`가 `textContent`이므로 XSS 경로 없음.
- `:182` `#dmove-approval-app td small.memo{max-width:44ch;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`
  → 기존 `:158` `td small{display:block…}` 뒤에 오고 클래스 1개 더 높아 확실히 이긴다.
  500자 메모의 행 높이 폭발 해소.
- `:198-201` `.detail-grid h3, .memo-block h3` 병기 + `.memo-block`(좌측 accent 보더·`--sunk` 배경) +
  `.memo-block p`(`pre-wrap`·`break-word`). 전 조각 `#dmove-approval-app` 스코프.

### R8-5 (m15·m17·m18) — **부분 PASS**

1. **m15 PASS** — `:216` `#dmove-approval-app .timeline li.is-cancelled::before{border-color:var(--expired);border-style:dashed}`.
   `--expired`는 `:110`에 정의됨. 패널 `approval.css:774`와 표현(점선·회색) 일치.
2. **m17 PASS** — `setupFilters();` 호출부 들여쓰기 **6칸**으로 교정(현 `:887`). 파일 내 7칸 잔존 0.
3. **m18 부분** → 아래 N1 참조.

`isRequester` package-private 전환 부작용: `ApprovalPagePanel`은 `public final class`지만 메서드는
패키지 전용이라 노출 확대가 패키지 경계를 넘지 않는다. 테스트가 같은 패키지에 있어 접근 성립.
호출부는 `:130` 한 곳뿐이고 구현·시그니처 무변경. 매크로 쪽 쌍둥이는 `private static` 유지(대칭 깨짐 없음 —
매크로엔 테스트가 없을 뿐 로직은 동일 3줄).

`ApprovalPagePanelCancelTest` 4케이스의 불변식 고정력:
- `requesterKey=username` + userKey 보유 사용자 → true (**B1이 무너졌던 정확한 시나리오**)
- `requesterKey=userKey` → true / 제3자 → false / `getKey()==null` 사용자 → username으로 true
동적 프록시로 `getKey`/`getName`만 흉내 내고 `equals`/`hashCode`/`toString`을 명시 처리해 프록시 함정도 피했다.
**키 이중 대조 규칙 자체는 확실히 고정된다.**

### R8-6 (m16) 스페이스 필터 — **PASS ((b) 채택, 무해화 실측)**

- **`f-space` 참조 0건.** 소스·렌더 HTML 통틀어 `filterInput("f-space")` / `id="f-space"` 모두 없음
  → `syncFilterInputs`·`options`에서 null 역참조 TypeError 발생 경로 없음. 필터 바 컨트롤 목록
  (f-q/f-requester/f-flow/f-range/f-from/f-to/f-due/f-myturn)에서 완전히 빠졌다.
- **`state.space`는 항상 비활성.** 렌더 JS 전수 추적 결과 쓰기는 3곳뿐이고 전부 `""`:
  초기화(`:20`), URL 읽기 강제 초기화(`:414`, 주석 포함), `resetFilters`(`:281`).
  `setFilter`/`clearFilter`로 `space`에 값이 들어갈 경로 없음(해당 키를 넘기는 컨트롤·칩이 없다).
  읽기 3곳(`matches` `:211`, `renderActiveFilters` `:298`, `writeUrl` `:395`)은 모두 truthy 가드 뒤라 항상 단락.
- **URL 파싱 무해화 실측**: `?f_space=DEV`를 넣어 읽기 IIFE를 돌리면 `state.space === ""`,
  이어서 `writeUrl()`이 만든 URL에 `f_space` **미포함**. 보이지 않는 필터가 전 행을 거르는 사고가 봉쇄됐다.

---

## 2. 잔여 / 신규 (경미 3)

### N1 (m18 후속, 경미) — 회수 노출 테스트가 헬퍼 단위에 머문다
R8-5.3의 문구는 "**상세 모달에 `data-approval-cancel` 버튼을 받는지** 검증(패널 또는
`ApprovalMarkup.detailDialog` 단위로 충분)"이었다. 실제 테스트는 `ApprovalPagePanel.isRequester`만 호출한다.
따라서 다음이 여전히 무방비다.

- `canCancel = status()==PENDING && (isRequester || isConfluenceAdministrator)` 조합
  (`ApprovalPagePanel:129-130`) — 누가 `isRequester` 항을 다시 떨어뜨려도 4케이스는 전부 통과한다.
- `ApprovalMarkup.detailDialog(..., canCancel)` → `data-approval-cancel` 버튼 + `appendCancelConfirmation`
  출력(`ApprovalMarkup:229-236`).

`detailDialog`는 `public static`이고 도메인 객체·`UnaryOperator`만 받으므로 Confluence 인프라 없이
`canCancel=true/false` 두 번 호출해 `html.contains("data-approval-cancel=\"1\"")`를 대조하는 4줄 테스트가 가능하다.
설계 §B-4의 `data-approval-can-cancel` 속성도 여전히 미구현(패널은 `data-approval-user-key`만 추가) —
R8이 "함께 넣으면 단언이 단순해진다"고 선택지로 제시한 것이라 그 자체는 결함 아님.
**기능 영향 0, 회귀 가드 부족.**

### N2 (신규, 경미) — `syncTzSuffix()`가 fetch 성공 경로에만 있다
`ApprovalInboxServlet:888`은 `fetch(base + "/mine…").then(...)` 내부다. 같은 체인의
`.catch(() => activate(currentView))`에는 없다. REST 실패 시 열 머리 span이 빈 채로 남아
"요청 시각"만 표시된다(오작동 아닌 정보 누락, 레이아웃 파손 없음). 시간대 표기는 데이터와 무관한 상수라
IIFE 진입 직후 무조건 호출하는 편이 자연스럽다. `setupFilters()`가 같은 위치에 있는 기존 구조를 따른 결과다.

### N3 (신규, 경미) — 백로그 기록이 지시와 부분 불일치
R8은 m7·m8·m13을 "별도 배치로 관리"하라고 했다. `docs/backlog.md`에 **m13(`requestObject`
spaceKey/spaceName)만 배치 7 항목으로 기재**되어 있고, **m7(업무함 행 회수 액션)·m8(409 표시 동선)은
어느 문서에도 없다.** 코드는 손대지 않았으므로(아래 §4) 지시 위반은 아니나, 추적이 끊긴다.

### 범위 밖 유지 (변화 없음)
- **m12** `&reason=` 상시 전송 — 도메인 `normalizeOptional`이 흡수, 실해 없음.
- **m13** 백엔드 `spaceKey` — `ApprovalRestResource`에 `spaceKey`/`spaceName` 0건. 배치 7.
- 서버 `equalsIgnoreCase` vs 클라이언트 `equals` 비대칭 — 화면이 서버보다 **좁은** 방향(권한 확대 없음). 정보성.

---

## 3. 회귀 스팟 — 2차 PASS 항목 전부 유지

**치명 6건 재확인 (렌더 출력 기준)**

| # | 재확인 방법 | 결과 |
|---|-------------|------|
| B1 canCancel | 패널 `:129-130` / 매크로 `:143` 모두 `isRequester(request, user)` 경유, 3줄 구현 동일 | 유지 |
| B2 app-head 위치 | `<style>` 제거 후 오프셋: Inbox `.workbench`(18572) < `wb-nav`(nav, 단일따옴표) < `.wb-main`(22091) < `.app-head`(22122). Settings 동일 순서 | 유지 |
| B3 ≤1024 반응형 | `NavMarkup.java` mtime 15:29 — R8 창(15:38~15:58) 이전. 미변경 | 유지 |
| B4 `?f_*` 왕복 | **node 실측**: 9개 필터 + `spaceKey` 왕복 후 `읽기→쓰기→재읽기` **멱등 일치**. 방어값 `f_from=xxxx-yy-zz`→`""`, `f_due=evil`→`""`, `f_status=DROP`→`[]`, `f_q` 300자→**100자 절단** | 유지 |
| B5 필터 바 | 렌더 HTML: `filter-toggle`·`filter-reset`·`filter-bar`·`f-range`·`f-q`·`f-myturn`·`f-from`·`f-to`·`f-due`·`f-requester`·`f-flow` 전부 존재, `f-space`만 부재(의도). `aria-expanded`/`aria-controls` 존재, `<form … hidden>` 기본 접힘, 검색 200ms 디바운스(`:500`) | 유지 |
| B6 메모 | (a) 행 보조줄 `:671` + (b) `memo-block` **신규** + (c) 타임라인 `요청 메모: ` | **완전 해소** |

**기타 회귀**
- **메모 §A**: `ApprovalMarkup:344-345` textarea `maxlength="500"` + `dmove-approval-textarea`, 상세 `--message` 섹션 유지.
- **회수 동선**: `closeModal`(approval.js `:397-409`)의 확인 스텝 리셋(`confirmBox.hidden=true` + `aria-expanded=false` + `disabled=false`) 유지. `data-approval-cancel` / `-back` / `-confirm` 위임 핸들러 5곳 유지.
- **`canCancel` 게이팅**: `appendCancelConfirmation`과 footer 버튼 모두 `if (canCancel)` 안 — false면 마크업 자체가 없다.
- **CSS 스코프**: R8이 추가한 `.tz` / `td small.memo` / `.memo-block`(3규칙) / `.timeline li.is-cancelled` 전부 `#dmove-approval-app` 접두. 전수 파싱 비스코프 0.

---

## 4. "손대지 말 것" 준수 확인

| 항목 | 검증 | 결과 |
|------|------|------|
| **m7** 업무함 행 회수 액션 | `ApprovalInboxServlet`에서 `openCancelForm`·`IS_ADMIN`·`cancel-form`·`ghost--danger` **0건** | 미착수 ✔ |
| **m8** 409 표시 동선 | approval.js `:757-760` — `showMessage(...)` 직후 `window.location.reload()` 구조 **그대로** | 미변경 ✔ |
| **m13** 스페이스 백엔드 | `ApprovalRestResource`에 `spaceKey`/`spaceName` **0건** | 미착수 ✔ |
| **200자 초과 8줄** | 신규 200자 초과 라인 **8건, 2차와 동일 구성**(SVG 상수 1·mask URI 4·단일 CSS 규칙 3). 분해 흔적 없음 | 미분해 ✔ |
| 변경 파일 격리 | mtime상 R8 창(15:38~15:58)에 닿은 파일은 `ApprovalInboxServlet`·`approval.css`·`ApprovalPagePanel`·`ApprovalInboxServletRenderTest`·신규 패널 테스트 5개뿐. `approval.js`(15:28)·`NavMarkup`(15:29)·`ApprovalSettingsServlet`(15:27)·`ApprovalMarkup`(15:31)·`ApprovalRegionMacro`(15:20)는 R8 이전 상태 | 범위 준수 ✔ |

---

## 5. 결론

**PASS.** R8 6개 지시 중 5개 완전 이행, R8-5.3만 요구 수준(모달 버튼 노출 단언)보다 한 단계 낮은
헬퍼 단위 테스트로 이행됐다. 치명·중대 잔여 0. 3차 재작업 사이클은 불필요하다.

배치 7 착수 전 정리 권장(선택, 각 5분):
1. `ApprovalMarkup.detailDialog`에 `canCancel=true/false` 2케이스 테스트를 붙여 N1을 닫는다.
2. `syncTzSuffix()`를 fetch 체인 밖(IIFE 본문)으로 올린다.
3. `docs/backlog.md`에 m7·m8을 한 줄씩 추가한다.
