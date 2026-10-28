# 04 — 제품 소유자 피드백 반영 (2026-10-01, RFC-208)

대상: 프로젝트 상세 「문서 관리」 탭(구 「문서」). 프론트 전용 — 백엔드·manifest·스코프 변경 없음. 커밋 안 함(`OverviewTab` → `DocumentsSummary` 이름 변경은 `git mv` 로 인덱스에만 올라가 있음).

## 1. 「문서 연결이 안 된다」 — 진단

### 근본 원인 (확정)

| # | 원인 | 근거 | 수정 |
|---|---|---|---|
| **R1** | `buildLinkProperty` 가 **프로젝트 id 를 Confluence 페이지 id 규칙(`^\d{1,19}$`)으로 검사**했다. Workforce 프로젝트 id 는 **UUID 문자열**(`BIN_TO_UUID(project_id)`)이라 실제 프로젝트에서는 **모든 저장이 `LINK_PROJECT_ID` 로 던져졌고**, `failureReason` 이 이를 `unknown` 으로 바꿔 "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요"로만 보였다. Jira 호출(PUT)은 아예 나가지 않았다. 애드온 시절 테스트·계약 예시가 `projectId: '42'` 라 테스트로는 안 잡혔다 | 수정 전 `utils/jiraApi/movesDocsProperty.js:141` `const project = pageId(projectId);`, `src/rdb/schema/ddl/project.sql.js:3` `project_id BINARY(16)`, `src/rdb/query/ProjectQuery.js:29` `BIN_TO_UUID(project_id) AS project_id`, `utils/forgeAppUrl.js:43` UUID 패턴 | 프로젝트 id 전용 검사 `PROJECT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/`·`projectIdOf` 신설(`movesDocsProperty.js:28,75`). 같은 함수를 쓰던 **분류 변경**(DocActionModal)과 **스냅샷 자동 갱신**(useProjectDocuments)도 같은 이유로 조용히 실패하고 있었고 함께 풀린다. 연결 해제로 목록이 비는 경우는 삭제 경로라 원래 동작했다 |
| R2 | 검색어가 비어 있으면 문서 목록이 아예 안 떴다 — 스페이스만 고르고 기다리면 "안 된다"로 보인다 | 수정 전 `utils/confluenceApi/cql.js:55` `if (!raw) return null;`, `LinkModal.jsx:112` `enabled: term !== ''` | §2-③ 스페이스 둘러보기 |
| R3 | 고른 문서가 결과 목록에서 **빠졌다** — 체크가 안 되는 것처럼 보인다 | 수정 전 `LinkModal.jsx:126` `filter((page) => !selectedIds.has(page.id))` | §2-④ 체크된 채 유지 |

### 점검 항목별 결과

| 항목 | 결과 |
|---|---|
| 작업(이슈) 선택 목록 | 코드상 문제 없음. `fetchProjectIssues` 의 JQL `moves_RMS_projectId = "<uuid>"`(`movesDocsSearch.js:14`)는 다른 화면(`utils/jiraApi/issue/getJqlIssue.js:77`)과 같은 조건이다. 사용자 자격이라 Jira 에서 볼 수 없는 이슈는 빠진다(정상). 목록이 비면 "선택할 작업이 없습니다" |
| 저장 버튼 활성(`canSave`) | 코드상 문제 없음 — 문서 ≥1 · 작업 ≥1 · 30건 이하 · 저장 중 아님(`LinkModal.jsx:300`). 단 R1 때문에 눌러도 전부 실패했다 |
| `canWrite('PROJECT')` 게이트 | 코드상 문제 없음 — 버튼은 `canWrite` 일 때만 그리고, `canLink = canWrite && isReady && latestAvailable`(`ProjectDocumentsPanel.jsx:84`). Confluence 가용성 확인이 실패하면 상단 경고와 함께 비활성 |
| `requestCore` PUT 응답 | 수정 전에도 빈 본문(`''`)은 `null` 로 처리됐다(`requestCore.js` 구 511행). 보강: 2xx 의 **공백 본문·JSON 이 아닌 본문·본문 읽기 실패**도 성공(`null`)으로 본다 — 이미 끝난 쓰기를 실패로 보고하지 않는다. 비 2xx 는 여전히 상태 코드를 실어 던진다. 201·200·204 테스트 추가 |
| 값 크기·형태(32KB, 객체) | 코드상 문제 없음 — 객체로 조립, UTF-8 바이트로 32,768 검사(`buildLinkProperty`). 30건 × 제목 255자 한글 같은 극단값만 `size` 실패로 안내된다 |
| `Content-Type` 헤더 | 코드상 문제 없음 — 본문이 있으면 `application/json`(`requestCore.js`) |
| `requestJira` PUT 본문 | 코드상 문제 없음 — `JSON.stringify` 문자열을 `body` 로 넘긴다(브리지 RequestInit 규약). 테스트로 문자열 본문 확인 |
| 저장 뒤 캐시 패치(`patchIssues`) | 코드상 문제 없음 — 성공한 이슈만 `movesDocsKeys.projectIssues` 캐시에 저장된 `pages` 로 교체(`useProjectDocuments.js:98`), `documents`·`summary` 는 그 캐시에서 다시 계산된다 |

## 2. 스페이스 선택 개선

| # | 내용 | 구현 |
|---|---|---|
| ① 권한 | 스페이스 목록은 `requestConfluence`(@forge/bridge, 보는 사람 자격)로 `/wiki/rest/api/search?cql=type = space…` 를 부른다(`utils/confluenceApi/requestConfluence.js`·`spaceSearch.js`). CQL 검색은 볼 수 없는 콘텐츠를 결과에서 뺀다 → **본인이 볼 수 있는 스페이스만** 나온다. 변경 없음(주석·DOCUMENTS.md 에 명시) |
| ② 아이콘 | 공식 문서(v1 Search) 예시 응답의 `space.icon.{path,width,height,isDefault}` 를 사용. 해석은 `toSpaceInfo` 한 곳(`iconPath`), 주소는 `buildSpaceIconUrl(siteUrl, path)` = `siteUrl + '/wiki' + path`(이미 `/wiki/` 로 시작하면 그대로). 같은 사이트 상대 경로만 받는다(`//`·절대 주소·`\`·공백·`..` 거부). 목록·선택된 값 모두 `formatOptionLabel` 로 아이콘 + 이름, `onError` 면 이름만. **`expand` 는 추가하지 않았다** — 공식 예시에 기본 포함이고, 미지의 expand 로 스페이스 목록 자체가 깨질 위험을 피했다. 실측 P15(DOCUMENTS.md §8): 안 실리면 `expand=space.icon` 추가 |
| ③ 자동 로드 | `buildSearchCql`: 검색어가 비어도(문법 문자뿐 포함) 스페이스가 있으면 `type = page AND space in (…) ORDER BY lastmodified DESC`(본문 포함 무시). 검색어가 있으면 기존 조건 + 스페이스. 둘 다 없으면 `null` → 조회하지 않고 안내 문구. 25건씩(`SEARCH_LIMIT` 20→25). 다음 페이지는 응답 `_links.next` 의 `cursor` 만 뽑아(`nextCursorOf`) 같은 고정 경로에 붙인다(공식 응답이 커서 방식, `start` 미사용). `searchPages` 반환을 `{ pages, nextCursor }` 로 변경 |
| ④ 멀티 선택 | 스페이스는 기존부터 다중 선택(확인). 결과 목록에 「이 목록 모두 선택 / 모두 해제」(불러온 결과 전체 대상). 고른 문서는 목록에 체크된 채 남는다. 상한 30건: 「모두 선택」이 넘게 되면 버튼 비활성 + 안내, 30건에 닿으면 고르지 않은 체크박스 비활성 + 안내. 상태 갱신 함수도 상한을 한 번 더 막는다 |

**쿼리 키**: `useInfiniteQuery` 로 `confluenceKeys.pageSearch(검색 옵션)` 키 안에 커서별 페이지를 쌓는다. 페이지 커서를 키 배열에 직접 넣지 않은 이유 — 「더 보기」는 이전 페이지에 **이어 붙이는** 것이라 페이지별 키로 나누면 화면이 누적을 따로 관리해야 한다. 옵션(검색어·본문 포함·스페이스)이 바뀌면 키가 바뀌어 1페이지부터 다시 받으므로 "옛 결과" 문제는 없다. 커서 자체를 키에 넣어야 한다면 알려 달라.

## 3. 추가 지시 반영

| 지시 | 구현 |
|---|---|
| 최상위 탭 「문서」→「문서 관리」(en "Document Management") | `movesDocs.tab.label` 값만 변경. `constants/tabs.js:283` 의 `title`·`label` 이 같은 키, 브레드크럼은 `ProjectDetailPage.jsx:67` 이 `tab.title` 을 쓰므로 함께 바뀐다. 키·탭 key·URL 그대로. 백오피스 설정 카드 설명의 「문서」 탭 표기도 맞춤 |
| 「현황」을 문서 뷰 상단 요약 카드 줄로 | 뷰 전환 [문서 / 작업]. `OverviewTab.jsx` → `DocumentsSummary.jsx`(카드·`summarize` 재사용, 작게 `docs-cards--compact`, 좁으면 줄바꿈). `DocumentsTab` 의 `header` 슬롯으로 필터·목록 위에 둔다. 클릭: 연결 문서 수→필터 해제, 오래된·끊긴→같은 화면 상태 필터, 문서 없는 작업→작업 뷰+필터, 누락된 필수 분류→누를 수 없음. 경고 카드는 0 이면 흐리게(`--quiet`), >0 이면 경고 색(`--warning`), `null` 은 "확인 불가" 그대로. `?view=overview` 등 모르는 값은 문서 뷰. 번역 키 `movesDocs.project.view.overview` 삭제 |

## 4. 변경 파일

- `static/ui/src/utils/jiraApi/movesDocsProperty.js` — R1 프로젝트 id 검사
- `static/ui/src/utils/requestCore.js` — 2xx 본문 처리 보강
- `static/ui/src/utils/confluenceApi/cql.js` — 스페이스 둘러보기, `nextCursorOf`, `toSpaceInfo.iconPath`, `buildSpaceIconUrl`, `SEARCH_LIMIT` 25
- `static/ui/src/utils/confluenceApi/pageSearch.js` — `searchPages` → `{ pages, nextCursor }`, 커서
- `static/ui/src/pages/projectDetail/documents/LinkModal.jsx` — 무한 조회·모두 선택/해제·체크 유지·상한·스페이스 아이콘, `siteUrl` prop
- `ProjectDocumentsPanel.jsx`(뷰 2개·요약 카드·`siteUrl` 전달), `DocumentsTab.jsx`(`header`), `DocumentsSummary.jsx`(구 OverviewTab), `documents.css`, `DOCUMENTS.md`
- `locales/kr|en/movesDocs.json` — 탭 이름, `linkModal.searchHint·loadMore·selectAll·deselectAll·selectLimit` 추가, `searchAllSelected`·`project.view.overview` 삭제 → **`npm run merge` 실행함**
- 테스트: `utils/__test__/requestCore.test.js`(신규), `movesDocsProperty`·`movesDocsWriter`(UUID·201 재현), `confluenceApi/__test__/*`(CQL 조합·커서·아이콘), `linkModalSearch.test.jsx`(둘러보기·더 보기·체크 유지·모두 선택/해제·30건 상한·아이콘), `DocumentsSummary.test.jsx`, `ProjectDocumentsPanel.test.jsx`(overview 폴백·카드 필터)

## 5. 실행 결과

- `npm run merge` — 성공
- `npx jest src/pages/projectDetail/documents src/utils` — **45 suites / 812 tests 통과**
- `CI=true npm run build` — 성공(main gzip 491,527 / 예산 950,000, panel 329,459 / 350,000)

## 6. 배포 뒤 확인할 것

1. UUID 프로젝트에서 「문서 연결」 저장 → 결과 "성공", Jira 이슈 프로퍼티 `movesDocs.projectId` 가 UUID(R1)
2. P15 스페이스 아이콘이 오는지·이미지가 iframe 에서 열리는지(안 열리면 이름만 — 기능 영향 없음)
3. P16 「더 보기」가 다음 25건을 붙이는지
