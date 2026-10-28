# 성능 감사 2단계 — 프론트엔드 수정 리포트

- 기준 감사서: `_workspace/perf-audit/FRONTEND_2026-08-12.md`
- 대상: **P1-14 → P1-4 → P1-3 → P1-8 → P1-13** (4건, 지시 순서대로)
- 날짜: 2026-08-12 / 범위: `static/ui/` 안쪽만 (1단계 수정 파일·`src/` 백엔드 미접촉)
- 결과: `npm test` **73 suites / 1235 tests 통과**(기준선 71/1218 → +2 suites/+17 tests), `CI=true npm run build` 성공, 번들 예산 통과(gzip 899,163 / 950,000)

---

## P1-14. 사용자 정보 캐시 키 재설계 — 사람 단위

### 무엇을 바꿨나

| 파일 | 지점 | 내용 |
|---|---|---|
| `static/ui/src/utils/queryKey/jiraKeys.js` | `:9` | `userInfo: (accountId) => ['jiraUserInfo', accountId]` **신설**. `userInfos`(집합)는 `:10` 에 남긴다 |
| `static/ui/src/utils/useJiraUserInfos.js` | `:111` `loadUserInfo` | accountId **1명** 단위 로더 — 같은 틱의 요청을 모아 `/user/bulk` 1회로 발사(마이크로 배치) |
| 〃 | `:33` `mapWithConcurrency`, `:66` `fetchBulkUsers` | 50개 청크 **직렬 for-await → 동시 3개 병렬**. 200명 = 4회 순차 왕복 → 2라운드 |
| `static/ui/src/utils/jiraApi/users/getUserInfos.js` | `:19` `resolveUserInfos` | 집합 쿼리의 queryFn 이 id 마다 `queryClient.fetchQuery(jiraKeys.userInfo(id))` — **신선하면 왕복 0** |
| 〃 | `:39` | 정규화 메모가 `accountIds` **참조**가 아니라 값 시그니처를 본다(인라인 배열 호출부에서 Set+sort 재실행 제거) |
| 〃 | `:65` `useUserInfoMap` | 같은 조회의 맵 형태(`{data: {accountId: user}, isLoading}`) — P1-4 의 4개 화면이 쓴다 |

### 설계 근거 (왜 `useQueries` 가 아니라 이 형태인가)

- **반환 shape 불변이 요구사항**이었다. `useUserInfos` 는 여전히 `{data: user[], isLoading}` 다.
  `useQueries` 로 바꾸면 결과 배열이 렌더마다 새 참조라 소비처 6곳의 `useMemo`(맵 조립)가 전부 깨진다.
  그래서 **집합 키는 "참조 안정성 전용 얇은 래퍼"로 남기고**, 실제 왕복 여부는 사람 단위 엔트리의 신선도가 정한다.
- 개인 엔트리: `staleTime 10분`(종전과 동일) + `gcTime 30분`. 관찰자가 없는 엔트리라 gc 를 명시하지 않으면
  기본 5분에 사라져 "화면 간 재사용"이라는 목적 자체가 반쯤 무산된다.
- 배치 창은 `setTimeout(0)`(`useJiraUserInfos.js:122`). microtask 로 모으면 react-query 가 queryFn 을
  한 틱 미뤄 시작하는 경로에서 배치가 쪼개진다.
- 실패한 청크는 **reject** 한다. `resolve(null)` 로 넘기면 "없는 사용자"가 개인 캐시에 굳는다.
  개별 실패는 상위에서 `.catch(() => null)` 로 흡수 → 그 사람만 빠진다(종전 동작 유지, `retry:false`).

### 효과

- `TaskHistoryTable` 20행 × 10페이지: 캐시 엔트리 10개 × bulk 10회 → **등장 인원(예: 30명) 1회분**. 이후 페이지는 왕복 0.
- 화면 이동(작업이력 → 프로젝트 드로어 → 캘린더)에서 겹치는 인원 재조회 없음.

### 알아둘 동작 변화 1건

반환 배열의 순서가 **Jira 응답 순서 → accountId 오름차순**으로 바뀐다(키가 정규화 정렬 목록이므로 결정적).
소비처 6곳 중 5곳은 accountId 로 맵을 만들어 쓰므로 무영향, `myWork/modal/WorklogModal.jsx:97`(협업자 아바타 나열)만
표시 순서가 달라질 수 있다. 값 자체는 동일.

### 테스트

`static/ui/src/utils/__test__/jiraUserInfoLoader.test.js` **신규 8건** — 같은 틱 요청의 bulk 합치기, 중복 id 1회,
없는 사용자 `null`, 청크 실패 reject, 형식 위반 무왕복, 청크 병렬성, 실패 청크 무시, id 필터링.
`queryKeyFactories.test.js:29~` 에 `userInfo`/`userInfos` 계약 단언 추가. `queryKeyContract.test.js` 통과(인라인 키 배열 없음).

---

## P1-4. `getUser` N+1 4곳 → 벌크 훅

| 파일 | 지점 | 전 | 후 |
|---|---|---|---|
| `pages/projectDetail/cost/CostByIssueTable.jsx` | `:62-67` | 탭 **진입 즉시** 표 전량 멤버를 5명씩 순차(40명 = 40왕복/8라운드) | `useUserInfoMap(drawerAccountIds)` — **드로어를 연 이슈의 멤버만**. 진입 시 0왕복 |
| `pages/projectDetail/salary/SalaryManagementPage.jsx` | `:109` | 페이지당 10 개별 호출, staleTime 없음 | `useUserInfoMap(userIds)` — bulk 1회 + 10분 캐시 |
| `pages/projectDetail/user/ProjectUserPanel.jsx` | `:88` | 동일 | 동일 |
| `analysisReport/resource/hooks/useProjectResourceMembers.js` | `:134-140` | 5명씩 **순차** 배치(100명 = 100왕복/20라운드) | `useUserInfoMap(userMapIds)` — bulk 2회 |

- 조회 게이트(`shouldFetchUserMap`, 어댑터의 단일 출처)는 **그대로 두고** 판정이 false 면 빈 배열을 넘긴다.
  `enabled:false` 와 결과가 같다(왕복 0, `isLoading` false) — `isUserMapLoading` 소비처 무회귀.
- 표시 값 불변: 네 화면 모두 `UserAvatar`(=`avatarUrls['24x24']`, `displayName`) 와 `displayName` 만 읽는다.
  `/user/bulk` 가 둘 다 준다(`TaskHistoryTable` 이 이미 같은 경로를 쓴다).
- **동작 변화 1건**: 비용 탭 드로어를 **처음 열 때** 멤버 이름이 bulk 1왕복만큼 늦게 채워진다(그동안 accountId 폴백).
  진입 즉시 40왕복을 없애는 대가이고, 두 번째부터는 사람 단위 캐시라 즉시 뜬다. 감사서의 수정 방향 그대로다.
- **테스트 1건 수정**: `resource/__test__/resourceAdapterSingleSource.test.js:63~` — 아바타 조회가
  `resourceAnalysisKeys.userMap` → 공용 `useUserInfoMap` 으로 옮겨져, "한 곳에서만 조회한다"는 **규약은 유지한 채**
  단언 대상을 `useUserInfoMap(` 으로 바꾸고 옛 키가 0곳임을 함께 못박았다.

---

## P1-3. 프로젝트 상세 탭 3중 마운트

### 연쇄 3고리를 모두 끊었다

1. **toast 아이덴티티** — `components/feedback/ToastFlags.js:86`: 반환 객체를 `useMemo(..., [show, register])` 로 고정.
   `show`/`register` 는 이미 ref 기반 `useCallback([])` 이라 **1회만** 만들어진다.
   > 감사서가 제안한 `const toast = useMemo(() => ToastFlags(), [])` 는 **채택하지 않았다** — 훅 규칙 위반이다.
   > `ToastFlags` 내부가 `useRef`/`useCallback` 을 쓰므로 2회차 렌더에서 팩토리가 실행되지 않으면
   > 훅 호출 수가 줄어 React 가 죽는다. 고칠 수 있는 자리는 `ToastFlags` 내부뿐이고, 이 한 줄로 호출부 30여 곳이 함께 낫는다.
2. **탭 컴포넌트 아이덴티티** — `constants/tabs.js`: `component: () => <X .../>` 인라인 화살표 12개를
   **컴포넌트 참조 + `props`** 로 교체(`:80,100,111,125,140,151,171,182,196,208,220,234`).
3. **props 전달** — `components/tabs/CommonTab.jsx:31,83`: `const pageProps = config?.props` → `<ActivePage {...pageProps} />`.
   `mainPageTabs`(props 없음)는 `{...undefined}` 로 무영향.

### 남는 렌더/마운트

`ProjectDetailPage` 는 여전히 3번 렌더된다(초기 / `view.getContext()` 해소 / `findProjectById` 해소).
바뀐 것은 **그 렌더가 탭을 재마운트하지 않는다**는 것이다:
- toast 안정화로 `ProjectDetailTabs` 의 `useMemo` 가 3번째 렌더에서 히트한다.
- 2번째 렌더(context 해소)는 tabs 배열이 다시 만들어지지만 element **type 이 같아** 리렌더로 끝난다
  (`ProjectCalender` 만 새 `context` prop 을 받는다).
- 즉 **마운트 3회/폐기 2회 → 마운트 1회**. ECharts 재생성·grid 재측정·필터 초기화가 사라진다.

### 1회 마운트 확인 방법 (요청 항목)

1. **정적 회귀 테스트(추가함)** — `components/tabs/__test__/tabMountIdentity.test.js` 6건:
   ① `ToastFlags` 반환이 `useMemo([show, register])` 인가 ② 호출부가 `useMemo(() => ToastFlags(), [])` 로 감싸지 않았는가
   ③ `tabs.js` 에 인라인 화살표 컴포넌트가 없고 모든 `component` 값이 식별자인가 ④ 인자가 `props` 로 내려가는가
   ⑤ `CommonTab` 이 스프레드하는가. 셋 중 하나만 풀려도 화면은 멀쩡하고 **필터만 조용히 초기화**되므로 소스로 못박았다.
   (이 리포에는 `@testing-library/react` 가 없어 마운트 횟수를 직접 셀 수 없다 — 리포 관례대로 정적 단언.)
2. **실행 확인** — 개발 빌드에서 `pages/projectDetail/dashboard/DashboardPage.jsx` 최상단에
   `useEffect(() => console.log('[mount] DashboardPage'), [])` 를 임시로 넣고 `/project/:id` 진입:
   수정 전 3줄 → 수정 후 **1줄**. 또는 React DevTools Profiler 로 진입 커밋 3개 중 `DashboardPage` 가
   "Mount" 로 잡히는 커밋이 1개인지 본다. 네트워크 탭에서는 `getChartInfo`/`getSummaryData` 가
   진입당 3회 → 1회로 준다(staleTime 없는 두 쿼리라 마운트마다 재요청했다).

---

## P1-8. `UserSearchSelect` 무디바운스 + 인플라이트 입력 유실

`components/select/UserSearchSelect.jsx`

| 지점 | 내용 |
|---|---|
| `:53` | `const debouncedKeyword = useDebounce(keyword, 300)` (리포 관례 `utils/useDebounce.js`, 형제 `ProjectHeader.jsx:30` 과 동일) |
| `:119-131` | `handleInputChange` 는 상태만 갱신하고 **조회를 걸지 않는다** |
| `:133-136` | effect 가 디바운스된 값으로 **1회만** 조회. `hasTypedRef` 로 마운트 직후 자동 조회를 막는다(최초 목록은 종전대로 메뉴 오픈이 담당) |
| `:57-58` | 조기 return 가드를 **페이징(nextPage>0)에만** 남겼다 — 새 검색은 진행 중 요청이 있어도 반드시 발사된다(입력 유실 원인 제거) |
| `:61-78` | 기본목록 캐시 경로에서 `reqSeqRef` 를 **올리고**(옛 검색 응답이 뒤늦게 덮어쓰는 레이스 차단) **로딩 플래그도 함께 내린다**(아래 F-1 참조) |
| `:110-116` | `finally` 의 로딩 해제를 최신 seq 일 때만 — 뒤늦게 끝난 옛 요청이 진행 중 요청의 로딩 표시를 끄지 않는다 |
| `:139-143` | 무한스크롤도 **디바운스된** 검색어 기준(화면에 떠 있는 목록의 기준과 일치) |

효과: "홍길동" 입력 = `invoke('searchUser')` 최대 6회(일부는 드롭돼 결과 어긋남) → **1회**, 그리고 마지막 글자의 검색이 반드시 반영된다.
선택·표시·페이징 동작은 그대로다.

### 수정 이력 — F-1 (통합 검증 `03_verify_stage12.md`, 2026-08-12)

- **지적**: 캐시 히트 분기가 `reqSeqRef` 만 올리고 return 해서, 무효화된 진행 중 요청의 `finally` 가
  seq 불일치로 아무것도 정리하지 못한다 → `loadingRef.current` 가 **영구 true** 로 굳어
  `:58` 가드에 걸린 무한스크롤 페이징이 죽고 로딩 표시가 고착. 재현: 메뉴 오픈 → 검색어 입력 → 지움.
- **원인**: seq 무효화(레이스 차단)와 로딩 플래그 해제(리소스 정리)의 **소유권이 갈라진 것**을 놓쳤다.
  `finally` 를 "최신 seq 일 때만 정리"로 좁힌 순간, 무효화한 쪽이 정리 책임을 넘겨받아야 했다.
- **수정**: `components/select/UserSearchSelect.jsx:71-72` — 캐시 히트 분기에서 `reqSeqRef` 를 올린 직후
  `loadingRef.current = false; setLoading(false);` 를 함께 수행. 무효화된 요청의 응답은 어차피 폐기되므로
  이 시점에 "진행 중 요청 없음"으로 보는 것이 정확하다(권고안 그대로).
- **재검증**: `npx jest src/components/select` → 이 컴포넌트 전용 테스트는 없음(0 matches, 리포에 RTL 부재).
  `npm test` 전체 **73 suites / 1235 tests 통과**(무회귀).

---

## P1-13. `TableSurface` 어댑터 — 호출부 17곳을 고치지 않고

### 결론부터: "시그니처로 어댑터를 건너뛰기"는 성립하지 않는다 (비용 논증)

- 어댑터 산출물(`adaptedRows`)은 셀의 `content` — **그 렌더에서 새로 만들어진 JSX** — 를 그대로 실어 나른다.
  정렬값 시그니처가 같다고 옛 산출물을 재사용하면 내용이 바뀐 표가 **에러 없이 옛 화면으로 굳는다**
  (인라인 편집·상태 변경처럼 row key 는 그대로인데 content 만 바뀌는 경로가 실제로 있다).
- 그렇다고 content 까지 비교하려면 어댑터와 같은 O(행×열) 순회 + JSX 비교가 필요하다 → **아낄 것이 없다**.
- 감사서가 제안한 `React.memo(DynamicTable)` 도 이 리포에서는 거의 히트하지 않는다:
  `frozenHead` 는 폭 동결이 켜지면 **항상 새 참조**이고(`TableSurface.jsx:82` 주석의 의도), `emptyView` 를
  인라인 JSX 로 넘기는 호출부가 많다. 히트하는 경우는 이미 rows 를 메모한 호출부뿐이라 이득이 겹친다 → **넣지 않았다**.

그래서 방향을 **상수 절감 + 확정적 헛돎 제거**로 잡았다.

### 수정

| 파일 | 지점 | 내용 | 비용 |
|---|---|---|---|
| `components/table/TableSurface.jsx` | `:33,47` | `rows` 미전달 시 공유 `EMPTY_ROWS` | 매 렌더 새 `[]` 로 메모가 통째로 깨지던 경로 제거 |
| 〃 | `:72-76` | `effectiveRows`(스켈레톤) **메모** | 로딩 중 `buildSkeletonRows` 가 매 렌더 새 배열 → 어댑터 메모 **확정 무효화**였다. 유일하게 100% 헛돌던 경로 |
| `components/table/tableSort.js` | `:146` `adaptRows` | 컬럼당 `map`+`filter`+`every`+`map`+판정루프 → **배열 1개 · 순회 2회** | 200행×정렬4컬럼: 배열 슬롯 **2,400 → 800**, 요소 접근 ~3,200 → ~1,600. `isNumericLike` 는 비숫자를 만나면 이후 호출 생략 |
| 〃 | `:72` `resolveSortableColumns` | 서로 다른 key 를 본 순간 **조기 종료** | 실데이터 key 컬럼(대부분 첫 두 행에서 갈린다)에서 전 행 스캔 → 2행 스캔 |

- 산출물 계약(RFC-184 §2)은 글자 그대로 유지: `sortValue > sortKey > key` 우선순위, `sortValue:null` = 결측(키 폴백 금지),
  컬럼 단위 타입 통일(숫자 `-Infinity` / 문자 `''`), `sortValue`/`sortKey` 제거, **무변경 시 원본 참조 반환**.
- 호출부 17곳 및 `CommonTable`/`PagingTable`/`CursorPagingTable` 공개 props: **무수정**.
- 기존 테스트 54건 전부 통과 + 3건 추가(`tableSort.test.js` 조기종료 무회귀 1, `tableContract.test.js` 메모·EMPTY_ROWS 2) = **57건**.

---

## 검증

```
cd static/ui && npx jest --silent
  → Test Suites: 73 passed, 73 total   Tests: 1235 passed, 1235 total   (기준선 71/1218)

cd static/ui && CI=true npm run build
  → Compiled successfully (eslint 경고 0)
  → bundle:check {"file":"static/js/main.77946a6d.js","gzipBytes":899163,"budgetBytes":950000,"withinBudget":true}
```

- i18n: **신규 키 없음**. 빌드 prebuild 가 `npm run merge` 를 실행했고 `locales/` 산출물에 diff 없음(소스와 이미 동기).
- `p-limit` 은 프론트에서 쓰지 않았다 — v7 은 ESM-only 라 jest `transformIgnorePatterns`(현재 `@forge` 만 허용) 밖이라
  테스트가 죽는다. 필요한 기능이 "동시 N개"뿐이라 `useJiraUserInfos.js:33` 의 `mapWithConcurrency` 로 대신했다(동시성 3).
- 변경 파일은 전부 `static/ui/` 안쪽이다. 1단계 파일(`WorklogPage.jsx`, `useMyWorklogList/Summary`, `polling/*`)과
  `src/` 백엔드는 건드리지 않았다.

## 후속 확인이 필요한 것 (E2E 미수행)

1. 비용 탭 드로어 **첫 오픈** 시 멤버 이름이 한 왕복 늦게 채워지는 것이 수용 가능한지(실사용 체감).
2. `WorklogModal` 협업자 아바타 나열 순서(accountId 오름차순으로 바뀜).
3. 프로젝트 상세 진입 시 `DashboardPage` 마운트 1회 — 위 "확인 방법"의 임시 로그 또는 Profiler 로 실환경 확인.
