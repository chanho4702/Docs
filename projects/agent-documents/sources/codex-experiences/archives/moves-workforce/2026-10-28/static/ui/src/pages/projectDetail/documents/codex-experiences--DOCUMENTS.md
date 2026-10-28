# 문서 관리 탭 — Confluence 문서 연결·분류·현황

> 정본. 2026-09-30 별도 앱 Moves Workforce Docs(`moves-workforce-docs`, 등록·배포된 적 없음)를 폐기하고 본체로 흡수했다.
> 흡수 설계서: `_workspace/workforce-docs-absorb/01_architect_design.md`. 애드온 원문: `moves-workforce-docs/docs/DESIGN.md`·`SECURITY_AUDIT.md`.

## 1. 개요·구조

프로젝트 상세 「문서 관리」 탭(탭 key·URL 은 `documents` 그대로)에서 프로젝트 작업(Jira 이슈)에 Confluence 문서를 연결·분류·해제하고, 현황(문서 없는 작업·오래된 문서·끊긴 링크·누락된 필수 분류)을 본다.
범위 밖: 이슈 없이 프로젝트에 직접 붙는 문서, 폴더/순서, 문서 세트 생성, Confluence 쪽 화면, 자동 갱신 끄기.

```
┌─ 프로젝트 상세 > 「문서 관리」 탭 (ProjectDocumentsPanel, ?view=documents|issues) ───┐
│  requestJira (asUser)                         requestConfluence (asUser)            │
└────────┬──────────────────────────────────────────────┬─────────────────────────────┘
         │ 검색·읽기·쓰기(read-merge-write)               │ /wiki/rest/api/search 만
┌────────▼───────────────────────────────┐      ┌────────▼──────────────┐
│ Jira 이슈 프로퍼티 `movesDocs`           │      │ Confluence 검색        │
│ ← 연결 정보의 단일 출처                  │      │ (문서·스페이스·최신 정보) │
└────────────────────────────────────────┘      └───────────────────────┘
설정(분류·기준일): getSettingData / updateSetting (KVS `settings`)
```

- `app.compatibility` = Jira 필수 + Confluence 선택(Preview, **되돌릴 수 없음**). Confluence 가 없는 사이트에서도 탭은 보이고 읽기 폴백으로 동작한다(§6).
- Confluence 콘텐츠 프로퍼티는 쓰지 않는다. 같은 연결을 두 곳에 쓰면 트랜잭션이 없어 어긋나고, Confluence 쓰기 스코프도 필요해진다.
- 백엔드 resolver 는 설정 두 개(`getSettingData`·`updateSetting`, 기존 확장)뿐이다. 조회·쓰기는 전부 프론트에서 사용자 자격으로 나간다.

## 2. 계약 — 이슈 프로퍼티 `movesDocs`

이슈 하나에 프로퍼티 하나. 이슈는 Workforce 프로젝트 하나에만 속한다(`moves_RMS_projectId` 단일 값).

```jsonc
{
  "v": 1,
  "projectId": "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b", // 연결 당시 Workforce 프로젝트 id (UUID 문자열)
  "pages": [
    {
      "id": "123456",                // Confluence 페이지 id (숫자 문자열)
      "title": "결제 모듈 설계서",    // 스냅샷
      "spaceName": "개발팀",          // 스냅샷
      "category": "설계",             // 분류 이름. 미분류면 속성 생략
      "linkedAt": "2026-09-29T02:10:00.000Z",
      "linkedBy": "5b10ac8d82e05b22cc7d4ef5"
    }
  ],
  "pageIds": ["123456"],             // 색인용 (pages[].id 와 항상 동일 집합)
  "categories": ["설계"],            // 색인용 (중복 제거, 미분류 제외)
  "count": 1                          // 색인용 (pages.length)
}
```

`utils/jiraApi/movesDocsProperty.js` 가 이 값의 형태를 아는 **유일한 출처**다(읽기·쓰기·병합).

- 조립은 `buildLinkProperty(projectId, pages)` 한 곳. `pageIds`·`categories`·`count` 는 `pages` 에서 파생한다.
- `projectId` 는 Workforce 프로젝트 id — **UUID 문자열**(`BIN_TO_UUID(project_id)`)이다. 영문·숫자·`-` 64자까지 받는다(`PROJECT_ID_PATTERN`). ⚠ 페이지 id 규칙(숫자)으로 검사하면 실제 프로젝트에서 모든 저장이 `LINK_PROJECT_ID` 로 거부된다(2026-10-01 「연결이 안 된다」 원인).
- `pages` 가 비면 프로퍼티를 **삭제**한다(빈 값 저장 금지).
- 이슈당 최대 **30건**(`MAX_PAGES_PER_ISSUE`). 값 상한 32,768 은 **UTF-8 바이트**로 잰다(한글 글자당 3바이트 — 엄격한 쪽).
- 같은 페이지를 한 이슈에 두 번 넣지 않는다(`id` 기준, 나중 값이 이긴다).
- **`url` 필드 없음.** 링크는 id 로만 조립한다: `buildDocumentUrl(siteUrl, id)` = `siteUrl + "/wiki/pages/viewpage.action?pageId=" + id`. 옛 값에 `url` 이 있어도 읽을 때 버린다 — 저장된 경로를 링크에 쓰면 이슈 편집 권한자가 같은 사이트의 임의 주소를 열게 만들 수 있다.
- **읽을 때도 계약을 강제한다**(`readPages`). 저장된 값은 이슈 편집 권한자가 우리 앱 밖에서도 쓸 수 있는 신뢰할 수 없는 입력이다: 앞에서부터 30건, `id` 는 `^\d{1,19}$`, 제목·스페이스 255자·분류 30자(넘으면 자름), `linkedAt` 은 날짜로 읽히는 값만, `linkedBy` 는 계정 id 형식만.
- 쓰기는 항상 read-merge-write(`movesDocsWriter.applyLinkChange`). 병합은 **페이지 단위**(`mergePages` — 추가는 upsert, 해제는 해당 id 만 제거). 화면이 들고 있던 옛 목록으로 덮어쓰는 것을 막을 뿐, 동시 쓰기를 완전히 막지는 못한다(§7).
- 쓰기 권한은 Jira 가 판정한다. 이슈 편집 권한이 없으면 403 이고 화면은 그 이슈를 실패로 표시한다.
- 인라인 `issue.properties.movesDocs` 접근 금지 — 검색 응답도 `movesDocsSearch.toIssue` → `readPages` 를 거친다.

색인 선언(manifest `jira:entityProperty` `moves-docs-entity-property`): `pageIds`→`movesDocsPageId`(string), `categories`→`movesDocsCategory`(string), `count`→`movesDocsCount`(number). 화면은 이 별칭을 검색 조건으로 쓰지 않는다(JQL 사용자·후속 기능용).

### 2.1 프로젝트 문서 — 작업 없이 연결(2026-10-01)

문서 연결 창에서 작업을 고르지 않으면 **프로젝트 자체**에 연결한다. 이슈가 없어 이슈 프로퍼티에 둘 곳이 없으므로 이것만 서버에 둔다.
- 저장: KVS 키 `ProjectDocs:{projectId}` 하나, 값 `{ projectId, pages }`(페이지 모양·상한은 이슈 프로퍼티와 같다). 프로젝트 삭제 cascade 의 CACHE 단계(`projectDocs`)가 지운다.
- resolver: `getProjectDocLinks`(PROJECT read·detail) / `setProjectDocLinks`(PROJECT write·detail) — `src/resolver/projectDocs/`. 서버는 모양·크기만 다시 확인하고, 병합은 프론트가 이슈와 같은 read-merge-write 로 한다.
- 프론트는 이슈 키 자리에 `PROJECT_TARGET`(`movesDocsWriter.js`)을 넣어 같은 경로(`applyToIssues`·해제·분류·고쳐 쓰기)를 탄다. 데이터 훅은 프로젝트를 "작업 하나"처럼 출처에 섞되(`sources`), 「문서 없는 작업」 같은 작업 수치에는 넣지 않는다. 화면에는 「프로젝트 문서」 배지로 보인다.
- 이 경로만은 서버 가드를 거친다(이슈 연결은 Jira 이슈 편집 권한이 판정).

## 3. Jira·Confluence 호출 (전부 프론트, 사용자 자격)

### 3.1 실행기 — 실패를 **던진다**

`utils/requestCore.js` 의 `createExecuteRequest` 로 만든 두 실행기만 쓴다: `utils/jiraApi/movesDocsRequest.js`(`executeMovesDocsRequest`), `utils/confluenceApi/requestConfluence.js`(`executeRequest`).
기존 `utils/jiraApi/requestJira.js` 의 `executeRequest`(실패 = `{success:false}` 값)와 **섞지 않는다**. 이유:

1. 이슈 프로퍼티 `PUT` 은 200(갱신)/201(새로 만듦)에 빈 본문인데, 기존 실행기는 204 외 2xx 에 `response.json()` 을 불러 **저장 성공을 실패로 보고**한다. `requestCore` 는 2xx 의 빈 본문·공백·JSON 이 아닌 본문·본문 읽기 실패를 모두 성공(`null`)으로 본다 — 이미 끝난 쓰기를 실패로 보고하지 않는다(값이 필요한 조회는 호출부가 형태를 검사해 던진다). 본문은 `JSON.stringify` 문자열, `Content-Type: application/json`.
2. 프로퍼티 `GET`/`DELETE` 의 404(없음·이미 없음)는 정상 경로다 — 요청 정의의 `allow: [404]` 한 곳에서 `null` 로 처리한다.
3. `status` 가 항상 HTTP 상태라 `failureReason`(401/403 → 권한 없음, 404 → 없음)이 문자열 방어를 떠안지 않는다.
4. react-query `isError` 가 보안 규칙이다(§4·§9 S5) — queryFn 이 던져야 성립한다.

`requestCore` 는 URL 자리 값을 `encodeURIComponent` 한다. **사용처를 늘릴 때는 "실패 = 던짐" 계약을 호출부 오류 처리와 함께 가져간다.**

### 3.2 호출 목록

| 용도 | 호출 |
|---|---|
| 프로젝트 이슈 목록 | `POST /rest/api/3/search/jql` — jql `moves_RMS_projectId = "<id>"`, `fields: [summary,status,issuetype,assignee]`, `properties: [movesDocs]`, `nextPageToken` 끝까지(상한 2,000건, 넘으면 화면 상단에 잘렸다고 표시) |
| 프로퍼티 읽기 | `GET /rest/api/3/issue/{key}/properties/movesDocs` (404 = 없음) |
| 프로퍼티 쓰기 | `PUT` 같은 경로 / 비면 `DELETE`(404 = 이미 없음) |
| 문서 검색 — 제목만(기본) | `GET /wiki/rest/api/search?cql=type = page AND title ~ "<검색어>*" [AND space in (…)] ORDER BY lastmodified DESC&limit=25[&cursor=…]` |
| 문서 검색 — 본문 포함 | `…cql=type = page AND (title ~ "<검색어>*" OR text ~ "<검색어>") [AND space in (…)]&limit=25` — **정렬 없음**(관련도 순) |
| 스페이스 둘러보기 | 검색어가 비어(문법 문자뿐 포함) 있고 스페이스를 골랐으면 `…cql=type = page AND space in (…) ORDER BY lastmodified DESC&limit=25` — 본문 포함 무시. 검색어도 스페이스도 없으면 조회하지 않고 안내 |
| 다음 페이지(「더 보기」) | 응답 `_links.next` 에서 `cursor` 만 뽑아(`nextCursorOf`) 같은 고정 경로에 `cursor=` 로 붙인다. 주소 자체는 따라가지 않는다. `start` 는 쓰지 않는다 |
| 주소 붙여 넣기 | `/pages/(\d+)` 에서 id 를 뽑아 `id = <id>`(본문 포함·스페이스 선택 무시) |
| 스페이스 목록 | `…cql=type = space[ AND title ~ "<입력>*"]&limit=25` — 문서 검색과 같은 API. `requestConfluence`(보는 사람 자격)라 **그 사람이 볼 수 있는 스페이스만** 나온다 |
| 문서 최신 정보 | `…cql=id in (<id…>)&limit=50` — 50개씩 최대 10회 |
| Confluence 가용성 | `…cql=type = page&limit=1` — 연결 문서가 0건인 프로젝트에서만 |

- 검색어의 문법 문자(`+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /`)는 공백으로 바꾸고(`cleanSearchTerm`), CQL 문자열 값은 `\`·`"` 를 이스케이프(`escapeCqlText`), id 는 숫자만(`lookupIds`·`extractPageId`). 스페이스 키도 이스케이프한다(개인 스페이스 키는 `~` 로 시작).
- 검색식 조립은 `utils/confluenceApi/cql.js` 의 `buildSearchCql({ term, includeBody, spaceKeys })` 한 곳. 검색 옵션은 쿼리 키(`confluenceKeys.pageSearch`)에도 전부 들어간다 — 빠지면 옵션을 바꿔도 옛 결과가 보인다. 페이지는 `useInfiniteQuery` 로 같은 키 안에 커서별로 쌓인다(옵션이 바뀌면 1페이지부터).
- 쓰는 응답 필드: `content.id`, `content.title`(없으면 `title` 에서 `@@@hl@@@` 제거), `resultGlobalContainer.title`, `lastModified`, 본문 포함일 때 `excerpt`, `_links.next`(커서). `url` 은 쓰지 않는다.
- 스페이스 결과: `space.key`·`space.name`·`space.icon.path`(`toSpaceInfo` 한 곳). 아이콘 경로는 같은 사이트 상대 경로만(`/` 로 시작, `//`·`\`·공백·`..` 거부), 주소는 `buildSpaceIconUrl(siteUrl, path)` = `siteUrl + '/wiki' + path`(이미 `/wiki/` 로 시작하면 그대로). 아이콘이 없거나 이미지가 깨지면 이름만 그린다. 추가 `expand` 없이 기본 응답의 `space.icon` 을 쓴다(공식 예시 응답에 포함, 실측 P15).
- **최신 정보 조회는 500건까지**(`MAX_LOOKUP_PAGES`). 넘는 문서는 조회하지 않고 "확인 불가" + 상단 알림. 이슈 편집 권한자가 값을 부풀려도 열람자의 Confluence 호출이 이 이상 나가지 않는다.
- **최신 정보에서 돌아오지 않은 id = 끊긴 링크**(삭제 또는 권한 없음 — 구분 불가, 문구로 안내).
- 본문 발췌(`excerpt`)는 **화면 표시용**이고 이슈 프로퍼티에 저장하지 않는다.
- 스페이스 목록 조회가 실패해도 문서 검색은 막지 않는다(실패 표시 + 전체 스페이스로 검색).

## 4. 스냅샷 갱신

탭을 열 때 최신 정보를 조회해 제목·스페이스가 스냅샷과 다르면 해당 이슈 프로퍼티를 고쳐 쓴다(`useProjectDocuments`).
- **`canWrite('PROJECT')` 일 때만** 돈다 — 쓰기 권한이 없는 열람자가 탭을 여는 것만으로 Jira 에 쓰기가 나가지 않게 한다.
- 한 번 열 때 최대 20건. 편집 권한이 없어 실패하면 **조용히 넘어간다**(화면은 최신 값으로 그린다).

## 5. 설정

`settings` KVS 엔티티의 `docCategories`·`docStaleDays`. 새 resolver 없이 기존 두 함수를 확장했다.

| resolver | 권한 | 응답 |
|---|---|---|
| `getSettingData` | `PUBLIC` | `{ success: true, …, docCategories: [{ name, required }], docStaleDays: number }` — `{...DEFAULT_SETTINGS, ...saved}` 병합이라 두 필드는 항상 실린다 |
| `updateSetting` | `W('SETTINGS')` | 입력 `docCategories?`·`docStaleDays?`(`null`/`undefined` 는 미변경) → `{ success: true, content: { settings } }` |

- 기본값: 분류 `기획`·`설계`·`회의록`·`산출물`·`기타`(필수 없음), 기준일 90. 기본값의 출처는 서버 병합 하나다 — 프론트는 복제하지 않는다.
- 검증(`src/resolver/backoffice/setting/DocSettingValidator.js`, `findById` 전): 분류 배열·최대 30개·이름 trim 뒤 1~30자·대소문자 무시 중복 금지, 기준일 1~3650 정수. 오류 코드 `SETTING_DOC_CATEGORY_LIST_INVALID`·`_TOO_MANY`·`_NAME_INVALID`·`_DUPLICATED`·`SETTING_DOC_STALE_DAYS_INVALID` — 문구는 `movesDocs.errors.<code>`.
- 탭은 `useDocsSettings()` 로 `settingKeys.detail()` 캐시를 다른 화면과 공유한다. 그 키에 `{success,…}` 원형과 `success` 를 뗀 값이 섞여 들어오므로 **두 모양 모두** 받고, 조회 실패·필드 누락은 기본값으로 대체하지 않고 **오류**로 돌려준다(누락은 배포 순서 역전의 신호).
- 백오피스 설정 화면 「문서」 카드(`backoffice/page/setting/DocumentSetting.jsx`)가 두 필드만 보내 저장하고, 응답 `content.settings` 로 캐시를 패치한다.

## 6. 화면

`/project/:id?tab=documents&view=documents|issues` — 최상위 탭 「문서 관리」 하나 + 뷰 전환(`ProjectWorkPanel` 전례). 하위 탭(children)을 쓰지 않는 이유: 두 뷰가 「문서 연결」 버튼·모달·필터 상태를 공유하고, 요약 카드를 누르면 **필터가 걸린 채** 작업 뷰로 옮겨 가야 한다. 옛 링크의 `?view=overview`(2026-10-01 제거)나 모르는 값은 문서 뷰로 연다.

| 뷰 | 내용 |
|---|---|
| 문서 | 맨 위 요약 카드 줄(아래) + 페이지 기준 목록. 열: 제목(새 창), 스페이스(아이콘 — 최신 정보 조회에 `expand=content.space.icon`, 없거나 깨지면 첫 글자), 분류, 연결 작업, 최종 수정일, 상태, 동작(쓰기 권한자만). 필터: 검색어(제목·스페이스·연결 작업 키·요약)·작업(프로젝트 캘린더와 같은 `ProjectIssueSelect` — 프로젝트 작업 전체에서 고름, 여러 개면 하나라도 연결된 문서)·분류·상태 |
| 작업 | 이슈 기준 목록. 열: 키(유형 아이콘), 요약, 상태, 문서(연결 문서 제목 링크 3개 + 「외 N건」, 정렬은 문서 수), 동작(쓰기 권한자만 — 이 작업에 문서 연결). 필터: 검색어(키·요약·문서 제목)·문서 없는 작업만 |

**요약 카드 줄**(`DocumentsSummary`, 예전 「현황」 뷰) — 문서 뷰 필터·목록 위에 작은 카드 5개를 한 줄로(좁으면 줄바꿈): 연결 문서 수 / 문서 없는 작업 / 오래된 문서 / 끊긴 링크 / 누락된 필수 분류. 수치는 `summarize` 그대로.
- 누르면: 연결 문서 수 → 문서 필터 해제, 오래된 문서·끊긴 링크 → 같은 화면 상태 필터, 문서 없는 작업 → 작업 뷰로 전환 + 필터. 누락된 필수 분류는 누를 수 없다(이름만 표시).
- 경고 카드(오래된·끊긴·누락)는 0 이면 흐리게(`docs-card--quiet`), 0 보다 크면 경고 색(`docs-card--warning`). `null` 은 0 이 아니라 "확인 불가"(색 없음).

「문서 연결」 모달 — ① 문서 검색·선택(여러 개, 스페이스·본문 포함 옵션) ② 작업 선택 ③ 분류 → 저장. 이슈별 성공·실패를 결과로 보여 준다. 분류 변경·연결 해제 모달도 이슈별로 적용·결과 표시.
- 스페이스는 다중 선택, 목록·선택된 값 모두 아이콘 + 이름. 스페이스를 고르면 검색어 없이도 그 스페이스 문서가 최근 수정 순으로 나온다(25건씩 「더 보기」).
- 이미 고른 문서는 결과 목록에 **체크된 채** 남는다(빠지면 "선택이 안 된다"로 보였다). 「이 목록 모두 선택 / 해제」는 지금까지 불러온 결과 전체가 대상.
- 고르기 상한은 이슈당 상한과 같은 30건(`MAX_PAGES_PER_ISSUE`). 「모두 선택」이 상한을 넘게 되면 버튼 비활성 + 안내, 30건에 닿으면 고르지 않은 체크박스가 비활성. 이슈에 이미 연결된 문서와 합쳐 30건을 넘으면 그 이슈만 "limit" 실패로 표시된다(저장 시점 판정).

상태 판정(위가 우선): `끊김`(최신 정보에 없음) → `오래됨`(최종 수정일이 기준일 이전) → `정상`. 최신 정보를 확인하지 못하면 `확인 불가`. 누락된 필수 분류 = `required: true` 중 이 프로젝트에 연결 문서가 0건인 것.

**Confluence 미연결 폴백**: 연결 문서가 있으면 최신 정보 조회, 없으면 가용성 확인이 실패하면 `latestAvailable: false` → 상단 경고 + 「문서 연결」 비활성. 목록은 저장된 스냅샷으로 그리고 상태는 "확인 불가", 요약 카드의 오래된 문서·끊긴 링크는 "확인 불가". 분류 변경·연결 해제는 Jira 쓰기라 막지 않는다.

**권한 게이트(화면)**

| 동작 | 게이트 | 위치 |
|---|---|---|
| 탭 보기 | `PROJECT read` | `constants/tabs.js` `canRender`(없으면 NoPermissionPage) |
| 조회 시작 | 프로젝트 범위 판정(`findProjectById` 성공) | `ProjectDocumentsPanel` → `useProjectDocuments({ enabled })` |
| 문서 연결(헤더·작업 행)·분류 변경·연결 해제 | `canWrite('PROJECT')` — false 면 **렌더하지 않음** | 셸·`DocumentsTab`·`IssuesTab` |
| 스냅샷 자동 갱신 | `canWrite('PROJECT')` | `useProjectDocuments` |
| 실제 쓰기 허용 | Jira 이슈 편집 권한(403 이면 이슈별 "권한 없음") | Jira |
| 설정 저장 | 서버 `W('SETTINGS')` + 검증 | `updateSetting` |

라이선스: `App.jsx` 가 비활성(INACTIVE)이면 안내 페이지만 그리므로 탭도 렌더되지 않는다. 탭에 별도 처리 없음.

## 7. 알려진 한계

| 한계 | 이유 | 대응 |
|---|---|---|
| **서버 가드가 닿지 않는다.** 조회·쓰기는 브라우저에서 사용자 자격으로 직접 나가므로 `guardedDefine`·`PermissionMap`·`ProjectScope`·백엔드 라이선스 판정 밖이다. 개발자 도구로 같은 호출을 부르면 그 사용자가 Jira·Confluence 에서 원래 할 수 있는 일(볼 수 있는 이슈 검색, 편집할 수 있는 이슈의 프로퍼티 쓰기, 볼 수 있는 문서 검색)은 할 수 있다 | 게이트가 화면에만 있다. 앱이 권한을 더 주지는 않는다 | 프로젝트 제한(`MEMBER_ONLY`/`TEAM_ONLY`)·`PROJECT write` 를 보안 경계로 쓰는 고객은 Jira 권한(프로젝트 역할·이슈 보안)을 함께 맞추도록 도입 안내에 명시. 막아야 하면 쓰기를 resolver 로 옮긴다(후속) |
| 문서 제목·스페이스 이름·분류·연결한 사람이 이슈를 볼 수 있는 모든 사람에게 보인다 | 값이 Jira 이슈 프로퍼티에 있다. 화면에 안 보이는 값도 Jira API 로 읽을 수 있다 | 도입 안내에 명시. 본문은 Confluence 권한을 따른다 |
| 두 사람이 같은 이슈의 연결을 거의 동시에 바꾸면 한쪽 변경이 사라질 수 있다 | 이슈 프로퍼티에는 조건부 쓰기가 없다 | 쓰기 직전 재조회로 틈만 줄인다. 저장 뒤 화면은 실제 저장된 값으로 갱신된다 |
| 자동 갱신은 한 번에 20건, 편집 권한이 없는 이슈는 건너뛴다 | 사용자 자격으로만 쓴다 | 화면은 항상 최신 값을 그린다 |
| 쓰기 권한 없는 사람만 여는 프로젝트는 스냅샷이 갱신되지 않는다 | 자동 갱신을 `PROJECT write` 에 묶었다(§4) | 쓰기 권한자가 한 번 열면 갱신된다. 필요하면 Confluence 수정 이벤트로 갱신(후속) |
| **연결 정보는 감사 기록이 아니다.** 편집 권한자가 앱 밖에서 값을 위조할 수 있고, 위조한 분류로 "누락된 필수 분류"를 0 으로 만들 수 있다 | 이슈 프로퍼티는 편집 권한만 있으면 쓸 수 있다 | 화면은 상한·형식을 강제해 그리지만 진위는 보증하지 않는다 |
| 문서 제목·스페이스 이름은 탭을 여는 사람의 Confluence 권한으로 읽어 **사용자 동작 없이** Jira 에 복사된다 | 자동 갱신이 탭을 열 때 돈다 | 도입 안내에 명시 |
| 삭제와 권한 없음을 구분 못 한다 | CQL 은 볼 수 없는 문서를 그냥 빼고 돌려준다 | 문구로 안내 |
| 사용 중에 라이선스가 비활성으로 바뀌면 새로 고칠 때까지 탭이 그대로 동작한다 | 화면은 시작할 때 한 번 판정하고, 이 탭의 호출은 백엔드 판정을 거치지 않는다 | 받아들인다(설정 저장은 백엔드가 요청마다 판정) |

## 8. 배포 뒤 실측

| # | 가정 | 다르면 |
|---|---|---|
| P2 | 문자열 배열(`pageIds`·`categories`)과 숫자(`count`)가 별칭으로 색인된다 | 색인 경로 변경(화면 동작엔 영향 없음) |
| P3 | Jira 전역 페이지 안에서 `requestConfluence`(bridge 5.10.2)가 동작하고, Confluence 미설치 사이트에서는 던지거나 4xx 로 온다(→ 폴백) | 백엔드 `asUser().requestConfluence` resolver 로 이동 |
| P5 | `search:confluence` 하나로 `/wiki/rest/api/search` 가 열린다 | `read:confluence-content.summary` 추가(= 또 한 번의 메이저) |
| P6 | 팀 관리형 프로젝트에서도 `search/jql` 의 `properties` 동봉이 된다 | 이슈별 개별 조회 폴백 |
| P7 | 제목 검색(`title ~ "검색어*"`)이 한글·여러 단어에서 쓸 만하다 | `buildSearchCql` 조합 변경 |
| P8 | 검색 응답 필드(`content.id`, `resultGlobalContainer.title`, `lastModified`)가 설계와 같다 | `cql.toPageInfo` 한 곳 |
| P10 | `type = space` 검색으로 스페이스를 가져오고 `space.key`·`space.name` 이 있다 | `cql.toSpaceInfo` 한 곳, 안 되면 스페이스 선택 제거 |
| P15 | 스페이스 검색 결과에 `space.icon.path` 가 기본으로 실리고(`expand` 불필요), `siteUrl/wiki + path` 이미지가 앱 iframe 에서 열린다 | 안 실리면 `searchSpaces` 요청에 `expand=space.icon` 추가, 이미지가 막히면 이름만(현재 폴백) |
| P16 | 검색 응답 `_links.next` 에 `cursor=` 가 실리고 그 커서로 다음 페이지가 온다 | `cql.nextCursorOf` 한 곳 |
| P11 | 본문 검색(`text ~`)이 한글에서 동작하고 관련도 순이며 `excerpt` 가 온다 | `buildSearchCql`·`cleanExcerpt` |
| P14 | `/wiki/pages/viewpage.action?pageId=<id>` 가 해당 문서로 열린다 | `buildDocumentUrl` 한 곳 |
| W1 | 다중 제품 호환을 켠 메이저 버전으로 올려도 Confluence 가 없는 기존 설치가 재승인 뒤 정상 동작하고, `context.license` 판정이 이전과 같다 | 배포 보류·Atlassian 문의(비가역이라 dev 에서 먼저) |
| W2 | KVS `settings.docCategories`(`type: any`)에 객체 배열과 **빈 배열**을 저장할 수 있다 | 빈 배열이면 속성 생략 후 읽기에서 `[]` 로 보충 |

## 9. 보안 규칙 (애드온 감사 반영분 — 전부 유지)

| # | 규칙 | 지키는 곳 |
|---|---|---|
| S1 | 이슈 프로퍼티를 신뢰하지 않는다 — 읽을 때 30건, id 숫자 1~19자리, 제목·스페이스 255자, 분류 30자, `linkedAt` 날짜, `linkedBy` 계정 형식 | `movesDocsProperty.readPages`/`normalizePage` |
| S2 | 계약에 `url` 없음. 링크는 id 로만 조립, 옛 `url` 은 버림 | `buildDocumentUrl` |
| S3 | 최신 정보 조회 500건 상한, 넘는 문서는 "확인 불가" + 상단 알림 | `documents.MAX_LOOKUP_PAGES`, `useProjectDocuments` |
| S4 | 검색어 문법 문자 제거, CQL 문자열 이스케이프, 문서 번호는 숫자만 | `cql.cleanSearchTerm`/`escapeCqlText`/`lookupIds`/`extractPageId` |
| S5 | 재조회 실패는 `isError` 로 판정(옛 값에 가려지지 않게) | `useProjectDocuments`, 던지는 실행기(§3.1) |
| S6 | 분류가 섞인 문서는 고르기 전 저장 불가 | `DocActionModal.initialCategoryChoice` |
| S7 | 저장 중 모달 닫기 금지(늦은 결과가 다른 작업과 섞임 방지) | `LinkModal`·`DocActionModal` |
| S8 | 설정 저장은 서버에서 권한 강제 + 검증 | `updateSetting` = `W('SETTINGS')` + `DocSettingValidator` |
| S9 | 쓰기는 read-merge-write, 페이지 단위 병합, 빈 목록은 삭제, 값 상한 32,768 UTF-8 바이트 | `movesDocsWriter.applyLinkChange`, `buildLinkProperty` |
| S10 | 조회는 프로젝트 범위 판정(`findProjectById`) 통과 뒤에만, 탭은 `PROJECT read` | `ProjectDocumentsPanel` `enabled`, `tabs.js canRender` |
| S11 | 조회 결과 접근은 own-property 확인(프로토타입 키 방어) | `documents.resolveDocStatus`/`groupByDocument` |
| S12 | 「문서 연결」은 "Confluence 검색 가능"에 묶는다(저장값 한 건이 연결 기능 전체를 끄지 못하게) | `useProjectDocuments.latestAvailable` |
| S13 | 검색 결과의 발췌는 표시용, 프로퍼티에 저장하지 않음 | `LinkModal` 저장 필드 선택 |
| S14 | 운영 빌드 소스맵 제외 | **예외(결정 대기)** — Workforce 운영 빌드는 지금도 소스맵을 배포한다(`static/ui/build/**/*.map`, 앱 전체 설정). 애드온과 달리 Sentry 스택 가독성과 맞물린 제품 전체 결정이라 이 기능에서 바꾸지 않았다. 끄려면 `static/ui/craco.config.js` 에 production `devtool=false` 한 줄 |
| S15 | 스페이스 아이콘은 같은 사이트 상대 경로만(`//`·절대 주소·`\`·공백·`..` 거부), 주소는 앱 컨텍스트 `siteUrl` 로 조립. 다음 페이지는 `_links.next` 의 `cursor` 값만 쓰고 주소는 따라가지 않는다 | `cql.toSpaceInfo`/`buildSpaceIconUrl`/`nextCursorOf` |

테스트: `__test__/`(순수 로직·화면·훅), `utils/jiraApi/__test__/movesDocs*`, `utils/confluenceApi/__test__/`, `backoffice/page/setting/__test__/DocumentSetting.test.jsx`. 화면 테스트는 `@testing-library/react` 14(jest 27 호환 고정)를 쓰고, 번역은 생성물(`locales/ko-KR.json`)을 읽으므로 **`npm run merge` 뒤에** 돌린다.
