# 02 프론트엔드 보고서 — Moves Workforce Docs 연동 「문서」 탭 (2026-09-29)

설계 정본: `C:\CloudJira\moves-workforce-docs\docs\DESIGN.md` §4·§5·§6·§8. 백엔드·manifest·PermissionMap 변경 없음. 커밋 안 함.

## 1. 변경·추가 파일

| 구분 | 파일 | 내용 |
|---|---|---|
| 신규 | `static/ui/src/utils/jiraApi/movesDocsProperty.js` | `movesDocs` 해석의 유일한 지점. 정규화(`getIssueMovesDocsPages`), 문서 기준 묶기(`groupMovesDocsByDocument`), 문서 주소(`buildDocumentUrl`), 상수 `MOVES_DOCS_PROPERTY_KEY`·`MOVES_DOCS_COUNT_ALIAS` |
| 신규 | `static/ui/src/utils/jiraApi/movesDocsSearch.js` | 설치 감지(`detectMovesDocsInstalled`/`interpretMovesDocsDetection`), 연결 이슈 검색(`fetchMovesDocsIssues`, 100건×20쪽=2,000건 상한, 실패 시 throw) |
| 신규 | `static/ui/src/constants/movesDocs.js` | `MOVES_DOCS_APP_ID = ''`, `MOVES_DOCS_ENV_IDS = {DEVELOPMENT:'', STAGING:'', PRODUCTION:''}`(forge register·deploy 뒤 채움 설명 포함), `buildMovesDocsManagePath` |
| 신규 | `static/ui/src/utils/queryKey/movesDocsKeys.js` | `movesDocsKeys.all`/`installed()`/`documents(projectId)` |
| 신규 | `static/ui/src/pages/projectDetail/documents/useMovesDocsInstalled.js` | 설치 감지 훅(`staleTime/gcTime: Infinity`, `retry:false`, 판정 전·실패 = false) |
| 신규 | `static/ui/src/pages/projectDetail/documents/DocumentsPage.jsx` | 문서 탭 화면(lazy) |
| 신규 | `static/ui/src/pages/projectDetail/documents/__test__/movesDocs.test.js` | 24개 테스트 |
| 신규 | `locales/kr/movesDocs.json`, `locales/en/movesDocs.json` | `movesDocs.*` 키 |
| 수정 | `static/ui/src/constants/tabs.js` | `DocumentsPage` lazy import, `projectDetailTabs` 시그니처 **맨 끝**에 `movesDocsInstalled` 추가, 최상위 탭 `documents`(마지막 위치) 조건부 전개 |
| 수정 | `static/ui/src/components/tabs/ProjectDetailTabs.jsx` | `useMovesDocsInstalled()` 취득 → 호출 인자·`useMemo` 의존성 양쪽에 `movesDocsInstalled` 추가(순서 일치, 기존 계약 테스트 2-c 통과) |
| 수정 | `static/ui/src/utils/jiraApi/requestJira.js` | `REQUEST_MAP.parseJql`(POST `/rest/api/3/jql/parse`) 항목 추가만. 기존 항목·동작 변경 없음 |
| 생성물 | `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge`로 재생성(직접 수정 안 함) |

## 2. 소비하는 프로퍼티 shape (필드 접근 경로)

검색: `POST /rest/api/3/search/jql` `{ jql: 'moves_RMS_projectId = "<id>" AND movesDocsCount > 0', fields: ['summary','issuetype'], properties: ['movesDocs'], maxResults: 100, nextPageToken }`

| 경로 | 사용 | 깨진 값 처리 |
|---|---|---|
| `issue.key` | 연결 이슈 키 | 없으면 이슈 건너뜀 |
| `issue.fields.summary`, `issue.fields.issuetype.iconUrl` | 연결 이슈 표시 | 없으면 null |
| `issue.properties.movesDocs.pages[]` | 문서 목록 | 프로퍼티가 객체 아님·`pages` 배열 아님 → 그 이슈는 0건 |
| `pages[].id` | 문서 묶기 키 | 비어 있지 않은 문자열 또는 유한 숫자(→문자열)만. 아니면 그 항목만 버림 |
| `pages[].title` | 제목 | 없으면 "(제목 없음)" 표시 |
| `pages[].url` | `siteUrl + '/wiki' + url` 로 새 창(`router.open`) | `/`로 시작하고 `//`가 아닐 때만. 아니면 링크 없이 제목만 |
| `pages[].spaceName` | 스페이스 | 없으면 `-` |
| `pages[].category` | 분류(연결마다 붙음 → 문서 행에서 중복 제거해 `, ` 연결) | 없으면 미분류 |
| `pages[].linkedAt` | 여러 이슈 스냅샷이 다를 때 최신 것 선택 | 없으면 가장 오래된 것으로 취급 |

`pageIds`·`categories`·`count`·`v`·`projectId`·`linkedBy`는 읽지 않는다(`count`는 JQL 별칭 `movesDocsCount`로만 사용). 한 이슈 안의 같은 id는 나중 값이 이긴다(§4 규칙과 같은 방향).

설치 감지: `POST /rest/api/3/jql/parse?validation=strict` `{ queries: ['movesDocsCount > 0'] }` → `response.queries[0].errors`가 비어 있거나 없으면 설치됨. `success:false`(4xx/5xx/네트워크), `queries` 없음·빈 배열은 숨김.

## 3. 화면 동작

- 탭: 설치 감지 true일 때만 목록에 들어간다(`...(movesDocsInstalled ? [...] : [])`). 권한 게이트가 아니라서 `canRender`(NoPermissionPage)는 쓰지 않았다. `tabs.js`에 `.filter(`를 쓰지 않는 기존 계약 테스트도 유지.
- 딥링크 `?tab=documents`로 들어오면 감지 전에는 첫 탭이 보이다가 감지가 끝나면 문서 탭으로 전환된다(CommonTab이 URL을 다시 쓰지 않으므로).
- 표: `CommonTable`(20행/쪽), 열 제목·분류·스페이스·연결 작업, 모두 `sortValue` 제공(기본 정렬: 제목). 이슈 키는 기존 `IssueComponent`(`router.open(siteUrl/browse/KEY)`).
- 로딩: CommonTable 스켈레톤 행. 오류: `SectionMessage(error)` — 빈 표 문구("연결된 문서가 없습니다.")와 구분. 2,000건 상한 도달 시 경고 `SectionMessage`.
- 「문서 관리 열기」: `buildMovesDocsManagePath(context, project_id, projectName)`가 null이 아닐 때만 표시. 현재 상수가 비어 있어 **숨김 상태**. 경로 `/jira/apps/{APP}/{ENV}/project/{encodeURIComponent(id)}?name={encodeURIComponent(name)}` → `router.navigate`. 환경은 `context.environmentType`(ProjectDetailPage가 조회한 `forgeContext`를 `props.context`로 받음). 프로젝트 이름은 상세 페이지와 같은 `findProjectByIdQueryKeys(project_id)` 캐시를 공유해 읽는다(추가 왕복 없음).

## 4. 설계와 다른 점 / 판단한 것

1. **`getJqlIssue.js` 재사용 안 함** — 그 파일의 검색 함수들은 `fields`만 받고 `properties`를 넘기지 않으며 실패 시 `?? []`로 삼키는 것도 있다. 공용 함수 동작을 바꾸지 않기 위해 같은 하위 계층인 `executeRequest('searchIssueWithJQL', …)`를 직접 쓰는 `movesDocsSearch.js`를 새로 만들었다.
2. **2,000건 상한 + 잘림 안내** — §8에 상한 언급은 없지만 무한 페이징을 막으려고 Workforce Docs(§7.2)와 같은 상한을 두고, 잘리면 화면에 알린다.
3. **분류 열** — 분류는 연결(이슈)마다 붙으므로 같은 문서가 여러 분류를 가질 수 있다. 중복 제거 후 쉼표로 이어 표시.
4. **스냅샷 불일치** — 같은 문서가 이슈마다 다른 제목·주소를 가지면 `linkedAt`이 가장 최근인 값을 쓴다(설계서에 규칙 없음).
5. **설계 예시의 `projectId: "42"`** — Workforce `project_id`는 실제로 UUID 문자열이다. 형식을 가정하지 않고 JQL에선 `\`·`"`를 이스케이프, 경로에선 `encodeURIComponent`만 한다.
6. 탭 위치는 최상위 탭 맨 끝(분석 및 리포트 다음).
7. 고객 문구에서 "이슈"는 기존 화면 관례대로 "작업"으로 썼다. 내부 용어(프로퍼티·JQL·스냅샷) 없음 — 스냅샷은 "연결할 때 기록된 값"으로 풀어 썼다.

## 5. 테스트·빌드 (실제 실행)

- `npx jest src/pages/projectDetail/documents` — 24/24 통과
- `cd static/ui && npm test` — **Test Suites 127 passed / 127, Tests 2055 passed / 2055**
- `cd static/ui && CI=true npm run build` — exit 0. "Compiled with warnings"는 기존 `node_modules` source map 누락 경고(@atlaskit/analytics-next-stable-react-context, marklassian)뿐. `bundle:check` main 481,134 B gzip / 예산 950,000 (withinBudget true), panel 329,331 / 350,000 (true)
- `npm run merge` 실행 완료, `ko-KR.json`·`en-US.json`에 `movesDocs` 네임스페이스 반영 확인

테스트가 다루는 것: 프로퍼티 정규화(부재·배열 아님·id 없음·빈 id·숫자 id·외부 url·중복 id), 문서 기준 묶기(한 문서 여러 이슈·최신 스냅샷·분류 중복 제거·깨진 이슈), 설치 감지 해석(errors 있음/없음/빈 배열/`success:false`/형태 불명, 요청 URL·본문, 5xx·네트워크 실패), 검색(JQL 이스케이프, `properties` 동봉, 페이징, 실패 시 throw, 상한 잘림), 이동 경로(상수 비었을 때 null, 환경별 조립·인코딩, 환경 id 없음·context 없음), 쿼리키.

## 6. 확인하지 못한 것 (배포 뒤 실측 필요)

- 설계 §10 P1: `jql/parse` strict가 선언 안 된 별칭을 `errors`로 돌려주는지 — 다르면 탭이 항상 보이거나 항상 숨는다.
- P2: `movesDocsCount` 별칭 색인 동작, P6: 팀 관리형 프로젝트에서 `properties` 동봉 응답.
- `search/jql`에 `properties`를 넣었을 때 `maxResults: 100`이 그대로 적용되는지(더 작게 잘려도 페이징은 동작).
- P4: `router.navigate`로 다른 앱 전역 페이지 하위 경로·쿼리 이동 — 상수가 비어 있어 버튼이 숨겨진 상태라 실화면 확인 불가.
- 실제 Forge 화면 렌더(탭 노출·표 레이아웃·새 창 열기)는 확인하지 않았다. 이 저장소엔 `@testing-library/react`가 없어 컴포넌트 렌더 테스트는 작성하지 않았다.
- Workforce Docs 설치 전 사이트에서 `jql/parse` 호출이 한 번 나간다(세션당 1회, 실패해도 무해).
