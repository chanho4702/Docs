# QA 배치 4a — 업무함 사이드 메뉴 · 진입 링크 · 요청 버튼 아이콘

**판정: PASS**

- 기준 커밋: `ade5070` / 대상: 미커밋 워킹트리
- 검증 일시: 2026-08-11
- 변경 파일 3개 (`--numstat`): 서블릿 `+160/-63`, `atlassian-plugin.xml` `+3/-3`, `approval.css` `+38/-0`
- 허용 파일 외 수정 0건. `ApprovalInboxServletRenderTest.java`는 **수정 불필요**(무수정으로 6/6 통과).

---

## 1. 설계 1:1 대조 — 전부 축자 일치

프로그램적 축자 비교(설계 문서의 코드 블록을 그대로 substring 매칭)로 확인했다.

| 설계 절 | 항목 | 결과 |
|---|---|---|
| §A.3 | `ICON_SETTINGS` 상수 + `ADMIN_LINK` 값 교체(`<li><a class='wb-nav__item wb-nav__item--link'>`) | 축자 일치 |
| §A.4 | TEMPLATE 마크업 60줄 전량 | 서블릿에 없는 줄 **0개** |
| §A.5 | `교체` 지정 JS 블록 7개 ((a)~(h)) | 누락 줄 **0개** |
| §A.6 | 추가/변경 CSS 블록 6개 (workbench·wb-nav 29줄, summary/metric 12줄, focus 1줄, 애니메이션 5줄, 1024px 13줄, 600px 1줄) | 6/6 축자 일치 |
| §A.6 삭제 | `.app-head__actions` / `.tabs` / `.tab` / `.tab:hover` / `.tab[aria-selected=true]` / `.tab__badge` / `.panel:nth-of-type(2)` | 전부 제거 확인 (grep 0건) |
| §B.1 | web-item `weight="1000"`, `✓` 제거 (2곳) | 일치. xml 내 `✓` 0건 |
| §B.2 | 사이드바 링크 `::before` mask 블록 | **블록 전체 축자 일치** |
| §C | 요청 버튼 `::before` mask 블록 | **블록 전체 축자 일치** |
| §G.1 | data-URI 2종(트레이·도장) | 각각 `mask`/`-webkit-mask` 2회씩 정확히 등장, 인코딩 문자열 완전 일치 |
| §G.2 | 메뉴 인라인 SVG 6종(도장/시계/문서/체크원/종/슬라이더) | path 데이터 전부 일치 |

### 보존 확인 (회귀 가드)
- `TABS` 필터식 4개 — `label:` 추가 외 **한 글자도 변경 없음** (diff 확인).
- `render`·`detail`·`statusCell`·`deadlineCell`·`renderNotifications`·`metrics`·`loadNotifications` 본문 로직 무변경.
  `render`는 마지막 `request-count` 갱신 1줄만 제거(§A.5-c 지시대로).
- `requestedLoaded` 중복 선언 제거 확인 — `let` 선언 1곳뿐(SyntaxError 회피).
- TOKEN 정규식 / `render(...)` 시그니처 / `escape()` 무변경.

---

## 2. 동작 검증 (존재 확인이 아닌 실행)

인라인 JS의 `TABS`/`syncNavBadges`/`show`/`activate`를 최소 DOM shim에 이식해 **실제 실행**했다.

| 시나리오 | 결과 |
|---|---|
| 초기 로드 | `aria-current=["myturn"]` 정확히 1개, title="내 차례", count="내 차례 3건", listPanel 표시/notice 숨김 |
| `activate("waiting")` | `aria-current`가 waiting **단독**(myturn에서 속성 자체 제거됨, `"false"` 잔존 없음), count="진행 중 1건" |
| `activate("notifications")` | listPanel.hidden=true / noticePanel.hidden=false, `show()` 미호출, `syncNavBadges()`만 실행 |
| 미로드 상태의 requested 배지 | `textContent=""` + `is-zero` → CSS `.is-zero:empty{display:none}`로 비표시 |
| 로드 후 requested | 배지 `"2"`, count="내 요청 2건" |
| 0건 배지 | `"0"` + `is-zero` → `opacity:.45` (설계 의도대로 표시는 유지) |
| `render` 호출 횟수 | 뷰 전환당 정확히 1회 (`[3,1,2,2]`) — `role="status"` 중복 낭독 없음 |
| 관리자 링크 | `data-view` 없음 → `navItems`에서 **제외됨**. 클릭 시 `onclick` 가로채기 없이 정상 이동 |
| `syncNavBadges` 대상 | `.wb-nav__item[data-tab]` → 알림 버튼(`data-tab` 없음) 제외. `TABS[undefined]` 참조 사고 없음 |

- 인라인 script `node --check`: **PASS** (286줄 추출).
- TEMPLATE `<body>` 태그 밸런스 파싱: unclosed 0, mismatch 0. `wb-main`/`workbench` 래퍼 정상 닫힘.

---

## 3. 배치 2 원칙 회귀 감시

| 검사 | 방법 | 결과 |
|---|---|---|
| 서블릿 `<style>` 스코프 | 콤마 조각 단위 파서(qa-2r 방식) 재사용, 중첩 `@media` 인식 | 총 **103 조각 / 위반 0** |
| 다크 팔레트 hex 재유입 | diff에서 hex 리터럴 추가·제거 grep | **0건** — `:root` 토큰 블록(94~107행) 완전 무변경 |
| `prefers-color-scheme` / `no-preference` | grep | **0건** |
| 하드코딩 `/confluence/` | c9·c10·domain `src` 전체 grep | **0건** (테스트 인자 제외) |
| 탭 잔재 | `role="tab"` / `aria-selected` / `.tabs` / `tab__badge` / `tab-myturn` / `notification-panel` / `app-head__actions` | 서블릿 내 **전부 0건** |
| 압축·재포매팅 | 라인 수·numstat | 서블릿 523→620줄(순증), CSS 순수 append(`-0`), xml 3줄 치환. **압축·한 줄 병합 없음** |

---

## 4. a11y (§H 해당분)

- [x] `nav[aria-label="승인 업무함 메뉴"]` 존재
- [x] 활성 항목만 `aria-current="page"`, 비활성은 `removeAttribute` — 실행으로 확인
- [x] `role="tablist"/"tab"/"tabpanel"`·`aria-selected` 전부 제거 (`<table role="table">`의 중복 role도 함께 제거)
- [x] roving tabindex 없음 — `tabindex` 속성 0건, 모든 메뉴 항목 tab 순서 유지
- [x] 배지는 실제 텍스트 노드 → 접근 이름 "내 차례 3" 성립
- [x] `#view-list[aria-labelledby=view-list-title]` / `#view-notifications[aria-labelledby=view-notifications-title]` region, 뷰 전환 시 `listTitle.textContent` 갱신
- [x] `#request-count[role="status"]`, `render`에서 중복 갱신 제거됨
- [x] 뷰 전환 시 포커스 이동 코드 없음 (메뉴 버튼에 유지)
- [x] `.wb-nav__item:focus-visible{outline:2px solid var(--accent)}`
- [x] 아이콘 `<svg aria-hidden="true">` ×6, 라벨은 별도 `<span class="wb-nav__label">`
- [x] `#notification-list[aria-live="polite"]` 유지, 초기 `hidden`
- [x] `<h1>` 1개, `<main>` 신규 생성 0건

---

## 5. `atlassian-plugin.xml` 무결성

전문 대조 결과 **다른 모듈 선언 전부 그대로**:
`resource(i18n)` · `ao`(엔티티 7개) · `rest` · `servlet`×2 · `web-item[approval-request-action]`(condition 3개 포함) ·
`web-resource[approval-region-resources]`(css/js/context 2개) · `web-panel[approval-page-panel]` · `xhtml-macro[approval-region]`.

변경은 `approval-inbox-link` 라벨 1줄, `approval-inbox-sidebar-link` 의 `weight`·라벨 2줄뿐이다.
`approval-confluence10` / `approval-domain` — `git status` 변경 0건.

---

## 6. 빌드

```
mvn -B -pl approval-confluence9 -am test   →  BUILD SUCCESS (31.9s)
```
- approval-domain: 44 tests, 0 failure
- approval-confluence9: **48 tests, 0 failure**
- `ApprovalInboxServletRenderTest`: **Tests run: 6, Failures: 0** — 실제 실행 확인 (surefire 로그 캡처)
  - `width:100%` assertion 유지됨(서블릿에 3회 잔존), 토큰 치환 6종 assertion 전부 통과.
- 컴파일: 35 소스 재컴파일, 신규 경고 없음. Spring Scanner 8 annotated classes 정상.
- **미검증**: 패키징(`verify`/`clean`)은 수행하지 않음 — 컴파일·단위 테스트까지만 검증.

---

## 발견 항목 (전부 Info, 재작업 불필요)

| # | 심각도 | 내용 |
|---|---|---|
| I-1 | Info | `@media (max-width:600px)`에 추가한 `.summary{grid-template-columns:repeat(2,1fr)}`는 900px 블록과 값이 동일해 실효가 없다(dead rule). 설계 §A.6이 명시적으로 요구한 줄이므로 준수가 맞다. 다음 배치에서 정리해도 무해. |
| I-2 | Info | JS가 토글하는 `.is-current` 클래스에 대응 CSS 규칙이 없다(스타일은 `[aria-current=page]`가 전담). 설계 §A.4/§A.5-f가 지정한 형태 그대로다. 향후 스타일 훅이 필요할 때만 쓰면 된다. |
| I-3 | Info | `.wb-nav__item--link`(관리자 링크)에도 대응 규칙이 없다. `.wb-nav__item` 기본 규칙의 `text-decoration:none`·`color:var(--ink-soft)`를 그대로 받으므로 렌더 결과는 정상. 설계대로. |
| I-4 | Info | 알림 뷰에 머무는 동안 `#view-list-title`/`#request-count`가 직전 목록 뷰 값을 유지한다. 해당 패널이 `hidden`이라 접근성 트리에서 빠지므로 낭독·표시 영향 없음. |
| I-5 | Info | `<table role="table">`의 `role` 제거는 §A.2 변경 목록에는 없고 §A.4 마크업에만 반영된 항목이다. 암묵 role과 동일해 무해하며, 설계 마크업을 따른 것이 맞다. |
| I-6 | Info (후속 필요) | §B.2 주석의 **검증 지시**(배포 후 DevTools로 3개 셀렉터 중 실제 적중분만 남기고 나머지 제거)와 §C의 `.aui-icon` 중복 아이콘 확인은 **런타임 확인 사항**이라 이번 정적 검증 범위 밖이다. 실기동 후 확인해 설계 문서에 "확인된 형태" 주석을 남길 것. |
| I-7 | Info | 1024px 미디어 블록 종료 `}` 다음 줄에 빈 줄 없이 `@media (max-width:900px){`가 이어진다. 순수 cosmetic. |

## 재작업 지시

**없음.** 배치 4a는 설계 §A·§B·§C·§G(해당분)·§H(해당분)를 축자 수준으로 구현했고,
배치 2 원칙 위반 0건, 빌드·테스트 통과, 다른 모듈 선언 손상 0건이다. 커밋 가능.

다음 배치(4b, §D·§E·§F) 착수 시 유의:
- 이번 배치에서 `approval.js`는 손대지 않았으므로 §H 회귀 grep 중
  `document.querySelector('.dmove-approval-modal--request')`(스코프 없는 형태)는 **아직 잔존**한다. §0.8/§D 배치에서 처리 대상.
- I-6의 런타임 확인 2건을 4b 완료 후 실기동 검증 항목으로 승계할 것.
