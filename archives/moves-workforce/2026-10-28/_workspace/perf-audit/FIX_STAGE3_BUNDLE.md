# FIX — P1-1 번들 유출: MDXEditor·FullCalendar·moment 를 main 밖으로 (2026-08-12)

> **rev2 (2026-08-12)** — Codex 리뷰(`CODEX_REVIEW_STAGE3.md`) 지적 반영: 코멘트 변환기 동적 import 가 만든 **데이터 손실 경로** 차단. rev1 대비 main gzip +428 B(432,478 → 432,906). 상세는 문서 말미 「rev2」 절.

- **대상**: `_workspace/perf-audit/FRONTEND_2026-08-12.md` **P1-1 단독**
- **원인**: 기본 진입 라우트(`App.jsx:23`, 의도적 정적 import)가 `WorklogPage` → `components/calendar/FullCalendar` / `modal/WorklogModal` → `components/markdown/MarkdownEditor` 로 이어지는 **정적 체인**을 타고 두 무거운 스택을 main 에 고정시키고 있었다.
- **방침**: `WorklogPage` 는 **정적으로 유지**(첫 화면 왕복 추가 없음), 그 안의 **두 덩어리만** lazy 로 내린다.

---

## 결과 — main 번들

| | 파일 | 원본(raw) | **gzip** | 예산 |
|---|---|---|---|---|
| **전** | `main.bdfe475c.js` | 3,704,592 B | **899,163 B** | 950,000 B |
| **후** | `main.f75a3593.js` | 1,576,296 B | **432,478 B** | 950,000 B |
| **차이** | | **−2,128,296 B (−57.5%)** | **−466,685 B (−51.9%)** | 여유 50,837 → **517,522 B** |

`bundle:check` **통과**(`withinBudget: true`). CRA 의 "The bundle size is significantly larger than recommended" 경고도 사라졌다.

CSS 도 함께 빠졌다 — `main.css` **156,007 B → 107,062 B**(−48,945 B, gzip 22,351 B). mdxeditor 클래스·`fc-*` 규칙이 청크 CSS 로 이동.

### 새로 생긴 청크

| 청크 | 원본 | gzip | 내용 | 언제 받나 |
|---|---|---|---|---|
| `918.5bea010f.chunk.js` (+ `918.c77d9290.chunk.css` 46,511 B) | 1,072,321 B | 331,009 B | `@mdxeditor/editor`(65) + `lexical` + `prismjs`(16) + `@codemirror/*` + `@radix-ui/*` | **워크로그 모달을 여는 순간** |
| `7530.72170e3b.chunk.js` | 1,028,106 B | 127,498 B | `@fullcalendar/*`(7) + `moment-timezone`(2) + `moment`(1) | `/myWork` 캘린더 뷰 마운트 시 |
| `9241.2dce79d7.chunk.js` | 소형 | — | `adf-to-md` | 기존 코멘트가 있는 워크로그를 **열 때만** |
| (marklassian) | 소형 | — | `markdownToAdf` | 워크로그를 **저장할 때만** |

두 큰 청크의 gzip 합(458,507 B)이 main 감소분(466,685 B)의 **98%** 를 설명한다 — 감소가 이 변경에서 나온 것이 수치로 확인된다.

### 유출 재검증 (빌드 산출물 직접 검사)

`main.f75a3593.js` 안에서 **전부 0건**: `Antarctica/Vostok`·`Asia/Seoul`(tz 데이터), `fc-daygrid`, `mdxeditor`, `lexical`, `CodeMirror`, `marklassian`.
`main.3097e113.css` 안에서도 `mdxeditor`·`fc-` **0건**.
소스맵 `sources` 귀속으로도 `@fullcalendar`/`moment`/`moment-timezone`/`@mdxeditor`/`lexical`/`prismjs` 가 main 에 **한 모듈도 남아 있지 않다**.

**moment 경로 확인**: 앱 전역에서 `moment` 를 import 하는 곳은 `components/calendar/FullCalendar.jsx:5` 의 `@fullcalendar/moment-timezone` **하나뿐**이다(`src` 전체 grep). 다른 정적 경로가 없으므로 캘린더 경계가 moment 를 통째로 데려간다.

---

## 변경 파일

### 신규

**`static/ui/src/components/calendar/FullCalendarLazy.jsx`** (신규 99줄)
- `React.lazy(() => import('./FullCalendar'))` + **자체 Suspense 경계** + `ChunkErrorBoundary`
- `CalendarSkeleton` — 툴바 한 줄 + 요일 머리글 + **6×7 격자**를 `height:100%` 로 그려 캘린더 영역을 그대로 차지한다(레이아웃 점프 방지)
- `CustomFullCalendar` 와 **동일한 props** 를 전달 → 래퍼(`FullCalendar.jsx:28-40`)의 `ResizeObserver` → `getApi().updateSize()` 동작은 그대로 보존된다. `calendarRef` 는 `ref` 가 아니라 일반 prop 이라 Suspense 를 그대로 통과하고, 청크 도착 시점에 `.current` 가 채워진다.

**`static/ui/src/components/markdown/MarkdownEditorLazy.jsx`** (신규 67줄)
- `React.lazy(() => import('./MarkdownEditor'))` + **자체 Suspense 경계** + `ChunkErrorBoundary`
- `MarkdownEditorSkeleton` — 툴바 + 본문 200px(= `MarkdownEditor.css` 의 `.my-custom-editor-scroll` 고정 높이와 동일 값)이라 모달 높이가 튀지 않는다

두 파일 모두 대상 모듈을 **정적 import 하지 않는다**(한 줄이라도 정적 참조가 생기면 청크가 도로 main 에 합쳐진다 — 파일 주석에 명시).

### 수정

**`static/ui/src/pages/myWork/WorklogPage.jsx`**
| 라인 | 내용 |
|---|---|
| `:2-5` | `CustomFullCalendar` 정적 import → `LazyFullCalendar` (회귀 경고 주석 포함) |
| `:495` | `<CustomFullCalendar>` → `<LazyFullCalendar>` (props 동일) |

그 외 로직은 손대지 않았다(임무 제약: import 지점 한정).

**`static/ui/src/pages/myWork/modal/WorklogModal.jsx`**
| 라인 | 내용 |
|---|---|
| `:22` | `MarkdownEditor` + `marklassian` + `adf-to-md` 정적 import 3줄 → `LazyMarkdownEditor` 1줄 |
| `:34-57` | `loadMarkdownToAdf()` / `loadAdfToMd()` — 모듈 promise 캐시형 동적 로더 |
| `:127-148` | ADF→마크다운 변환 effect 를 비동기화. **기존 코멘트가 없으면 변환기를 아예 받지 않는다**(신규 등록 경로). 늦게 도착한 결과가 다른 워크로그를 덮지 않도록 `cancelled` 가드 추가 |
| `:331-332`, `:344`, `:356` | `addWorklog`/`updateWorklog`/`addWorklogRange` 진입부에서 `await loadMarkdownToAdf()`. `addWorklogRange` 는 루프 **앞에서** 한 번 await |
| `:656` | `<MarkdownEditor>` → `<LazyMarkdownEditor>` |

`addWorklog` 는 `value => {}` → `async value => {}` 로 바뀌었다(호출부 `onSubmit` 이 이미 await 한다).

> ⚠ 위 `WorklogModal.jsx` 라인 번호는 **rev1 시점**이다. 현재 파일 기준 위치는 rev2 절의 표를 볼 것.

---

## #426 안전성 (요구사항 1)

두 lazy 지점 **각각**이 자기 Suspense 경계를 갖는다 — 상위 경계에 의존하지 않는다.

- **모달(MDXEditor)**: `CommonModal.jsx:26` 이 `isOpen` 일 때만 children 을 마운트하므로 **모달을 여는 클릭**이 곧 suspend 시점이다. 이것이 정확히 #426 이 나는 "동기 입력 중 suspend" 상황이고, 경계가 바로 위(`MarkdownEditorLazy` 내부)에 있어 에러 대신 스켈레톤이 뜬다.
- **캘린더**: `/myWork` 최초 마운트에서 suspend 한다(초기 `viewMode === "calendar"`). 표↔캘린더 토글 시에는 이미 청크가 로드돼 있어 재-suspend 하지 않지만, 그 경로에도 같은 경계가 있다.
- fallback 은 전부 **스켈레톤**이다(스피너 없음, RFC-178 규약).
- 청크 로드 **실패**(배포 직후 404 등)는 Suspense 가 처리하지 못하므로 각 지점에 `ChunkErrorBoundary` 를 함께 뒀다 — 실패해도 페이지 전체가 아니라 해당 영역만 재시도 안내로 바뀐다.

## 건드리지 않은 것 (요구사항 5)

- `App.jsx` — `WorklogPage` 는 **정적 import 그대로**. 라우트 lazy 목록·Suspense 구조 무변경
- `components/tabs/CommonTab.jsx` 의 Suspense 경계, 첫 탭 정적 원칙 — 무변경
- `components/calendar/FullCalendar.jsx` 본문 — 무변경(ResizeObserver·`updateSize`·`renderEventContent` 그대로)
- `components/markdown/MarkdownEditor.jsx` 본문 — 무변경
- `pages/projectDetail/calender/ProjectCalender.jsx` — `FullCalendar` 를 계속 정적 import 한다. 이 화면은 이미 lazy 라우트(`ProjectDetailPage`) 아래라 main 에 영향이 없고, 이제 캘린더 스택은 두 async 경로가 공유하는 청크(`7530`)로 모인다
- 병렬 작업 중이던 `pages/resource/ResourcePage.jsx`, `pages/projectDetail/gantt/useGanttMutations.js` — **접근하지 않음**

## 검증

- `cd static/ui && CI=true npm test` → **75 suites / 1,237 tests 전부 통과**(스냅샷 1 포함)
- `cd static/ui && CI=true npm run build` → 성공, `bundle:check` `{"gzipBytes":432478,"budgetBytes":950000,"withinBudget":true}`
- i18n: 새 키 없음. 스켈레톤 aria 라벨은 **기존** `common.loading` 재사용 → `locales/kr`·`locales/en` 변경 없음(빌드 prebuild 의 `merge` 는 정상 실행됨)

### 측정 주의

측정 두 번 사이에 **다른 에이전트가 `ResourcePage.jsx`·`useGanttMutations.js` 를 동시 수정** 중이었다. 다만 두 파일 모두 이미 lazy 라우트 아래라 main 에 실리지 않으며, 위 "유출 재검증"(main 내 심볼 0건)과 청크 회계(새 청크 gzip 합이 감소분의 98%)가 이 감소를 본 변경에 귀속시킨다.

## 참고 — P1-1 이 예측한 값과의 대조

감사는 gzip 기준 **250~300KB** 감소를 예상했다. 실측은 **466,685 B** 로 예상을 크게 웃돈다. 차이는 (a) 두 스택이 끌고 오던 `@radix-ui/*`·`micromark`/`mdast` 계열 공용 의존까지 함께 빠졌고, (b) `marklassian`/`adf-to-md` 를 동적 import 로 함께 내렸기 때문이다.

---

# rev2 — 코멘트 변환기 동적 import 가 만든 데이터 손실 경로 차단

## 무엇이 문제였나 (Codex 리뷰 지적, 타당)

rev1 은 `adf-to-md`(ADF→마크다운)를 동적 import 로 내리면서 **실패를 빈 문자열로 삼켰다**.

```js
// rev1 — WorklogModal.jsx:137
loadAdfToMd()
    .then(adf2md => { if (!cancelled) setMarkdown(adf2md.convert(comment)?.result || ''); })
    .catch(() => { if (!cancelled) setMarkdown(''); });   // ← 여기
```

그 사이에도 **저장 버튼은 살아 있었다**. 저장 요청은 `comment` 를 항상 함께 보내므로 서버에서
"아직 못 읽었다"와 "사용자가 본문을 지웠다"가 구분되지 않는다. 결과적으로 두 경로가 열려 있었다:

1. **느린 청크** — 변환이 끝나기 전에 저장 → 빈 코멘트로 **원본 덮어쓰기**
2. **import 실패**(배포 직후 404·네트워크 단절) — `.catch` 가 `''` 로 확정 → 이후 저장은 **반드시** 원본을 지운다

`MarkdownEditorLazy` 의 `ChunkErrorBoundary` 는 **에디터 청크**만 보호한다 — 변환기는 React 트리 밖의
동적 import 라 그 경계가 닿지 않는다. 지적대로다.

## 수정

### 1. 순수 상태 모듈 신설 — `static/ui/src/pages/myWork/modal/commentLoadState.js` (신규 53줄)

| export | 역할 |
|---|---|
| `COMMENT_LOAD` | `NONE`(기존 코멘트 없음) / `LOADING` / `READY` / `FAILED` |
| `initialCommentLoad(comment)` | 코멘트가 없으면 `NONE`, 있으면 `LOADING` |
| `canSubmitWorklog(state)` | **화이트리스트**(`NONE`·`READY` 만 `true`) — 새 상태가 생겨도 기본이 "차단"이 되게 |
| `convertAdfComment(convert, comment)` | 결과가 **문자열이 아니면 throw**. 빈 코멘트(`{result:''}`)는 정상으로 통과 |

`|| ''` 를 없앤 것이 핵심이다 — 변환 실패가 조용히 "빈 본문"으로 둔갑하지 못한다.

### 2. `WorklogModal.jsx` — 3중 가드

| 라인 | 내용 |
|---|---|
| `:22-23` | `MarkdownEditorSkeleton` 추가 import + `commentLoadState` import |
| `:84-86` | `commentLoad` / `commentReloadKey`(재시도 트리거) state 신설 |
| `:136-162` | effect: 상태를 `initialCommentLoad` 로 세우고, 성공 시 `READY`, **실패 시 `FAILED`**(빈 문자열로 진행하지 않음). deps 에 `commentReloadKey` 추가 |
| `:279-292` | **가드 ①** `onSubmit` 진입부 — `canSubmitWorklog` 불통과면 에러 메시지 후 `return`(폼 Enter 등 버튼 외 제출 경로 차단) |
| `:355-367` | **가드 ②(구조적)** `buildComment()` 신설 — 저장용 `comment` 를 만드는 **유일한 경로**. 상태 불통과면 throw. `addWorklog`·`updateWorklog`·`addWorklogRange` 셋 다 이 함수만 쓴다 |
| `:467-476` | **가드 ③** 저장 버튼 `isDisabled={!canSubmitWorklog(commentLoad)}` |
| `:697-723` | 에디터 자리를 상태별로 분기 — `LOADING`→ `MarkdownEditorSkeleton`, `FAILED`→ 빨간 안내 + **재시도 버튼**(`common.button.retry`), 그 외 → `LazyMarkdownEditor` |

가드 ②가 "구조적으로 불가능"을 담당한다. UI 를 우회해도 코멘트를 만들 방법이 없다.
`addWorklogRange` 는 이제 변환을 **루프 앞에서 한 번**만 한다(날짜마다 같은 본문을 재파싱하던 것 제거).

**신규 등록 경로는 영향 없다** — 기존 코멘트가 없으면 `NONE` 이라 즉시 저장 가능하고, 변환기를 아예 받지도 않는다.
**삭제(`onDelete`)도 막지 않는다** — 코멘트를 보내지 않으므로 손실 위험이 없다.

로딩 중에는 빈 에디터 대신 스켈레톤을 띄운다. 빈 에디터는 "코멘트가 없다"로 읽히고, 그 오해가 곧 손실이다.

### 3. i18n (2키 추가 후 `npm run merge` 실행 완료)

| 키 | kr | en |
|---|---|---|
| `worklog.error.commentLoading` | 코멘트 본문을 불러오는 중입니다… | The comment body is still loading… |
| `worklog.error.commentLoadFailed` | 기존 코멘트 본문을 불러오지 못했습니다. 이대로 저장하면 원본 코멘트가 지워지므로 저장이 막혀 있습니다. | Could not load the existing comment body. Saving is blocked because it would erase the original comment. |

`locales/kr/worklog.json`·`locales/en/worklog.json` 에 추가 → `cd static/ui && npm run merge` → `ko-KR.json`/`en-US.json` 반영 확인. 재시도 버튼은 기존 `common.button.retry` 재사용.

### 4. 신규 테스트 — `static/ui/src/pages/myWork/modal/__test__/commentLoadState.test.js` (14 케이스)

고정한 것:
- **변환 미완료 중 저장 불가** — `canSubmitWorklog(LOADING) === false`, `canSubmitWorklog(FAILED) === false`
- **신규 작성은 즉시 저장 가능** — `canSubmitWorklog(NONE) === true` (이 수정으로 막히면 회귀)
- **변환 실패 시 빈 markdown 미전송** — `convertAdfComment` 가 `undefined`/`{}`/`{result:null}`/`{result:0}`/`{result:{}}` 와 변환기 throw 를 **전부 throw 로** 처리(어떤 실패 경로에서도 `''` 가 반환되지 않음을 루프로 확인)
- **빈 코멘트는 정상** — `{result:''}` → `''` 통과(과잉 차단 방지)
- **알 수 없는 상태는 차단** — 허용이 화이트리스트임을 고정

## rev2 검증

- `cd static/ui && CI=true npm test` → **75 suites / 1,251 tests 전부 통과**(rev1 1,237 + 신규 14)
- `cd static/ui && CI=true npm run build` → 성공, `{"file":"static/js/main.69dc0010.js","rawBytes":1577446,"gzipBytes":432906,"budgetBytes":950000,"withinBudget":true}`
- 유출 재검증 유지 — main.js 에서 `Antarctica/Vostok`·`fc-daygrid`·`mdxeditor`·`lexical`·`CodeMirror` **0건**, main.css 에서 `mdxeditor`·`fc-` **0건**, `main.css` 107,062 B 그대로

### 번들 수치 (rev1 → rev2)

| | main gzip | main raw |
|---|---|---|
| 수정 전(원본) | 899,163 B | 3,704,592 B |
| rev1 | 432,478 B | 1,576,296 B |
| **rev2** | **432,906 B** | 1,577,446 B |

rev2 의 +428 B 는 상태 분기·에러 UI·가드 코드다. 원본 대비 **−466,257 B (−51.8%)** 로 P1-1 의 성과는 그대로 유지된다.

## 남은 것

이 문서는 **P1-1 단독** 수정이다. P1-2·P1-3·P1-4 등 나머지 항목은 미착수.
E2E 미수행 — 배포 후 확인할 것:
1. `/myWork` 초기 진입(캘린더 스켈레톤 → 캘린더)
2. **기존 코멘트가 있는 워크로그** 열기 → 스켈레톤 → 본문 표시 → 저장 시 코멘트 보존
3. 네트워크를 끊고 같은 워크로그 열기 → 실패 안내 + 저장 버튼 비활성 → 재시도로 복구
4. 신규 워크로그 등록(코멘트 없음)이 지연 없이 즉시 저장되는지
