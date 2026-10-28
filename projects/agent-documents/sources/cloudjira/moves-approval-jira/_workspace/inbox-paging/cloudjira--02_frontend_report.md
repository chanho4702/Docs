# 02 프론트 보고서 — 업무함 페이징 (inbox-paging)

> 회차: 1차 (2026-10-22) · 범위: requirement.md 요구 1(페이지 바) + 종류 칩 서버 필터 전환. `features/inbox/*`·그 테스트·`locales/{kr,en}/inbox.json` 만 변경. 공용 컴포넌트(`components/table/*`) 무변경.

## 1. 소비하는 resolver · 접근 경로 (백엔드 보고서 기준)

| resolver | 보내는 값 | 읽는 값 |
|---|---|---|
| `listInbox` | `{ tab, filters, cursor, limit }` — `limit` ∈ {20,50,100}(URL `size`), `cursor` = 페이지 시작 커서(1페이지 null) | `items`, `hasMore`, `nextCursor` (`normalizePage`). `limit` 응답값·`total` 은 읽지 않음 |
| `getInboxCounts` | `{ tab, filters }` — 목록과 **같은 filters**(targetKinds 포함) | `statusCounts`, `myTurnCount`(필터 무관 전역 배지), `incomplete` |
| `listInbox`(엑셀) | `{ tab, filters, cursor, limit: 100 }` 를 `hasMore` 동안 반복(5,000행 상한) | `items`, `hasMore`, `nextCursor` |

- "다음" 활성 = `hasMore === true && nextCursor` 만. 페이지가 limit 보다 적게 차도(백엔드 §5) 그대로 표시.
- 쿼리키: `inboxKeys.list({ tab, filters, limit, cursor })` — 팩토리 그대로, 페이지마다 다른 키. 무효화(`inboxKeys.all`)는 기존대로 전 페이지에 걸린다.

## 2. 화면 동작

- **페이지 단위 보기**: `useInfiniteQuery`+"더 보기" → `useQuery` 한 페이지(교체). 상태 = `{ scopeKey, cursors: [null, c1, …], index }` (`inboxPaging.js`, 순수 함수).
  - 다음: 현재 응답 `nextCursor` 를 스택에 쌓는다. 스택의 다음 커서와 다르면(그 사이 행이 바뀜) 뒤쪽 알던 페이지를 버린다.
  - 이전·번호: 가 본 페이지(스택 길이)까지만 번호 버튼. 총 페이지 수는 표시하지 않는다.
  - `scopeKey = JSON.stringify([tab, serverFilters, pageSize])` 가 바뀌면 렌더 시점에 1페이지로(effect 없이 `pagingFor`).
  - 다음 페이지 미리 받기는 **하지 않았다** — 페이지를 볼 때마다 SQL·권한 판정이 두 배가 된다(유휴 예산과 별개로 사용 중 비용). 필요하면 후속.
- **URL**: `size` 만 URL 에(기본 20 은 생략, 20·50·100 밖은 20). 페이지 번호·커서는 URL 금지 — 커서 없이 번호만 두면 새로고침 시 거짓이 되므로 둘 다 뺐다(새로고침 = 1페이지). 필터 초기화는 `size` 를 남긴다.
- **페이지 바**(`InboxPageBar.jsx`, 신규): 표 아래 한 줄 `nav` — 왼쪽 "이 페이지 N건 · 페이지당 [20][50][100]", 오른쪽 "이전 1 2 3 다음". 크기 선택은 드롭다운 대신 버튼 셋(표 아래 iframe 끝에서 메뉴 잘림 회피). 현재 번호 `aria-current="page"`, 크기 `aria-pressed`. 조회 중엔 버튼 비활성. 토큰·Atlaskit Button/Inline·`MetaText` 만, 글자 크기 리터럴 없음. 첫 로딩 중·빈 1페이지(다음 없음)에서는 숨김.
  - `@atlaskit/pagination` 은 총 페이지 수 전제라 쓰지 않았다.
- **표**(`InboxTable.jsx`): `CursorPagingTable` 에 `showCount={false}`·`hasMore` 미전달 → 누적 "더 보기"·불러온 건수 푸터 끔. `hasMore/isLoadingMore/onLoadMore` prop 삭제, `pageIndex` 추가 — 2페이지 이후가 비면(그 사이 처리됨) `inbox.empty.page` 문구.
- **오류**: 2페이지 이후 조회 실패 시 "새로 고침" 옆에 "첫 페이지로"(낡은 커서 대비).
- **종류 칩 → 서버 필터**: `toInboxFilters` 가 `targetKinds = kind ? [kind] : SURFACE_KINDS`(`targetKindsOf`, 이력 탭과 같은 함수). 클라이언트 `filterByKind` 삭제. 카운트도 같은 filters 라 상태 칩 숫자가 종류 기준이 된다.
- **일괄 선택**: `useEffect([pagingScope, paging.index])` 로 페이지·탭·필터·크기가 바뀌면 선택을 비운다. 전체 선택은 기존처럼 지금 보이는 행만.
- **엑셀**: 종류를 클라이언트에서 다시 거르던 코드·`kind` 인자 삭제. 화면과 같은 `serverFilters`(targetKinds 포함)로 커서 끝까지(100건씩).

## 3. 백엔드 계약과 다르게 한 것

- **"전체" 칩은 `targetKinds` 를 생략하지 않고 `SURFACE_KINDS`(['WORKLOG_CERTIFICATION','ISSUE_TRANSITION']) 를 보낸다.** 생략하면 서버가 제품에서 숨긴 종류(이슈 결재·필드 변경·타임시트·워크로그 사전 승인)까지 돌려준다. 기존 화면도 이미 이 값을 보냈고(이력 탭 포함) 테스트로 고정돼 있어 유지. 빈 배열은 만들지 않는다.

## 4. 추가·변경 i18n 키 (`locales/{kr,en}/inbox.json`)

- 추가: `inbox.paging.{label,size,count,prev,next,page,first}`, `inbox.empty.page`
- 삭제: `inbox.empty.kindMore`(클라이언트 필터 전제)
- 남겨 둠(미사용): `inbox.list.more`·`inbox.list.moreRemaining`·`inbox.list.shown` — 다른 화면 사용 여부와 무관하게 정리는 후속.
- `npm run merge` 통과(ko-KR.json·en-US.json 생성).

## 5. 바꾼 파일

| 파일 | 변경 |
|---|---|
| `static/ui/src/features/inbox/inboxPaging.js` | 신규 — 크기 정규화·커서 스택 순수 함수 |
| `static/ui/src/features/inbox/inboxPaging.test.js` | 신규 — 4케이스 |
| `static/ui/src/features/inbox/InboxPageBar.jsx` | 신규 — 페이지 바 |
| `static/ui/src/features/inbox/InboxPage.jsx` | useInfiniteQuery → 페이지 useQuery, 페이지 상태·URL size·선택 해제·오류 시 첫 페이지로, filterByKind 제거 |
| `static/ui/src/features/inbox/InboxPage.test.jsx` | 페이지 보기 describe 6케이스(다음·번호·이전·크기·URL size·필터 리셋·빈 결과·실패), 종류 서버 필터 케이스, limit 20 |
| `static/ui/src/features/inbox/InboxTable.jsx` | 더 보기·건수 푸터 끔, `pageIndex` 빈 문구 |
| `static/ui/src/features/inbox/InboxTable.test.jsx` | 더 보기·kindMore 케이스 → 푸터 없음·`inbox.empty.page` |
| `static/ui/src/features/inbox/inboxUrl.js` | `targetKindsOf` 신설, `toInboxFilters` 종류 반영, `filterByKind` 삭제 |
| `static/ui/src/features/inbox/exportInboxExcel.js` | 클라이언트 종류 필터·`kind` 인자 삭제 |
| `static/ui/src/features/inbox/exportInboxExcel.test.js` | 서버 filters 전달·커서 순회 케이스 추가 |
| `static/ui/src/features/inbox/InboxKindFilter.jsx` | 주석만(서버 필터) |
| `locales/kr/inbox.json`, `locales/en/inbox.json` | §4 |

## 6. 검증 결과

- `static/ui` `npx jest` 전체 → **Test Suites 104 passed, Tests 993 passed** (`typographyRules.contract.test` 포함)
- `static/ui` `npm run build` → 성공(Compiled with warnings — 기존 `@atlaskit/react-select` CSS 경고뿐, 이번 변경 무관)
- 루트 `npm run check:bundle` → `[bundle-check] OK`
- 루트 `npm run merge` → 성공

## 7. 미검증 · 후속

- 실제 화면(Forge iframe)에서 페이지 바 줄바꿈·높이 미확인(배포 전). 좁은 폭에서는 `shouldWrap` 으로 두 줄.
- `myTurnCount` 배지는 필터 무관(백엔드 §8-2) — 사이드바 배지에만 쓰므로 혼동 없음.
- history 탭 페이지 경계 중복(백엔드 §8-1)은 프론트에서 보정하지 않았다.

## 8. 2차 (Codex 검토 P2 두 건, 2026-10-22)

1. **범위 왕복 시 옛 페이지 복귀** — `pagingFor()` 가 표시값만 1페이지로 맞추고 저장 상태를 남겨, 20→50→20 크기·탭 왕복 때 옛 2페이지로 돌아갔다. `InboxPage.jsx` 렌더 중 `pagingState.scopeKey !== pagingScope` 이면 `setPagingState(initialPaging(pagingScope))` 로 저장 상태 자체를 초기화.
2. **번호 이동이 옛 커서 사용** — 커서 보정이 '다음'에만 있었다. `inboxPaging.js` 에 `pagingObserve(state, nextCursor)` 추가: 현재 페이지 성공 응답의 nextCursor 가 저장된 다음 시작 커서와 다르면 뒤 스택을 버리고 새 커서로 바꾼다(끝이면 뒤 번호 전부 제거, 모르는 다음 페이지는 추가하지 않음). `InboxPage.jsx` 에서 `listQuery.data` 가 바뀔 때마다 적용.
- 재현 테스트: `inboxPaging.test.js` 1케이스, `InboxPage.test.jsx` 2케이스(크기·탭 왕복 → 1페이지 / 1페이지 새로고침으로 nextCursor 변경 → '3' 번호 사라지고 '2' 는 새 커서). 수정을 끄면 두 화면 테스트가 실패함을 확인.
- `static/ui` `npx jest` 전체 → **104 suites, 996 tests passed**, `npm run build` 성공(기존 node_modules source map·CSS 경고만).

## 9. 3차 — 좁은 폭 표 찌그러짐 (dev 실측 뷰포트 약 955px, 2026-10-22)

- 표 최소 폭: `features/inbox/inboxTable.css`(신규) `.table-wrapper.inbox-table-surface table { min-width: 1180px }` — 그보다 좁으면 공용 `.table-wrapper`(overflow-x:auto) 안에서만 가로 스크롤. `.app-main` 이 `min-width:0` 이라 페이지 전체는 밀리지 않는다. 공용 table.css·TableSurface 무변경.
- 열 비율 재조정(대상 20·프로젝트 12·종류 12·상태 9·단계 8·요청자 11·요청일/기한/갱신 10) — 최소 폭 기준 날짜 열 약 112px, 종류·상태 배지가 잘리지 않는 폭. 종류 짧은 라벨은 불필요해 두지 않음.
- 날짜 열: `displayDate.js` 에 `shortDisplayDate`(같은 해면 연도 생략, 다른 해면 두 자리 연도, 24시간제 `hourCycle:'h23'`) — 한 줄 nowrap, 전체 일시는 `title`. `displayDate` 는 그대로(WorklogTargetFacts 공용).
- 프로젝트 열: 아바타 + 한 줄 말줄임(`inbox-cell-project`, title 에 전체 이름). 요청자 열 nowrap 말줄임 + title.
- 토큰만(간격 `--ds-space-100`), 글자 크기 리터럴 없음 — `typographyRules.contract.test` 통과.
- 테스트: `displayDate.test.js`(신규 3), `InboxTable.test.jsx` 1케이스. `static/ui` `npx jest` 전체 **105 suites, 1000 tests passed**, `npm run build` 성공.
- 미검증: 실제 Forge iframe 에서의 열 폭·가로 스크롤 모양(배포 후 확인 필요). 열 폭 동결(useStableColumnWidths)이 최소 폭 상태에서 계측되는지는 실측 대상.
