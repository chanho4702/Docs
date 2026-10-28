# Moves Workforce Docs 흡수 설계서

> 작성 2026-09-30 · 입력 `00_input/requirement.md`
> 성격: **새로 짜는 설계가 아니라 이식 설계**다. 애드온(`C:\CloudJira\moves-workforce-docs`, 읽기 전용)의 코드를 Workforce 본체의 어느 자리에 어떤 모양으로 붙일지를 정한다.
> 애드온 코드는 `app.id` 가 자리표시자(`REPLACE_WITH_FORGE_REGISTER`)인 채로 한 번도 등록·배포되지 않았다 → **이관할 운영 데이터가 없고**, 이슈 프로퍼티 `movesDocs` 계약(v1)은 그대로 쓴다.

---

## 0. 조사 결과 — 설계를 좌우한 사실 10개

| # | 사실 | 근거 | 설계 영향 |
|---|---|---|---|
| F1 | Workforce 의 현재 문서 탭(읽기 전용)·설치 감지·`parseJql`·`constants/movesDocs.js`·`movesDocsKeys.js`·`locales/*/movesDocs.json` 은 **전부 커밋 전 작업 트리**다 (`git status`: M 3개, ?? 7개) | git status | 제거는 "되돌리기"이며 이력·호환 부담이 없다 |
| F2 | Workforce `executeRequest`(`utils/jiraApi/requestJira.js`)는 실패를 `{success:false,error:{code}}` 값으로 돌려주고, **본문 없는 2xx 는 204 만** 예외 처리한 뒤 `response.json()` 을 부른다 | requestJira.js L260~ | 이슈 프로퍼티 `PUT`(200/201, 빈 본문)이 **저장은 됐는데 실패로 보고**된다 → §4.3 결정 |
| F3 | Workforce 프론트는 지금까지 이슈 프로퍼티를 **프론트에서 쓴 적이 없다**(`coworkerProperty.js` 는 읽기 전용, 쓰기는 백엔드 `IssuePropertyApi`) | grep | 쓰기 실행기를 새로 들여와도 기존 경로와 충돌하지 않는다 |
| F4 | `@forge/bridge` 5.10.2(Workforce 고정)에 `requestConfluence` 가 있다 | `node_modules/@forge/bridge/out/fetch/index.d.ts` | 브리지 업그레이드 불필요 |
| F5 | Workforce `t()` 는 Forge `i18n.createTranslationFunction()` 그대로라 **인자 치환을 하지 않는다**. 치환은 `utils/i18n.js` 의 `tFormat(t, key, vars)` — 애드온 `tFormat` 과 **같은 함수**(애드온이 Workforce 에서 복사) | useI18nStore.js, utils/i18n.js | `tFormat` 호출부 그대로 유지, 경로만 Workforce 것 |
| F6 | `settings` KVS 엔티티에 `type: any`(`monthVals`)가 이미 있다. `getSettingData` 는 `PUBLIC` 이고 **`{...DEFAULT_SETTINGS, ...saved}` 병합**으로 누락 필드를 채운다. `updateSetting` 은 `W('SETTINGS')` 부분 갱신 | SettingService.js, PermissionMap.js L191-192 | 새 resolver·새 권한 없이 기존 두 함수를 확장 |
| F7 | `updateSettingService` 는 **저장할 때 `DEFAULT_SETTINGS` 전체를 펼쳐** 쓴다 | SettingService.js L100~ | 기본값에 새 키를 넣는 순간 **모든 설정 저장**(급여 정책 포함)이 새 속성을 KVS 에 쓴다 → manifest attributes 가 같은 배포에 없으면 **기존 설정 저장까지 422** |
| F8 | `settingKeys.detail()`(`logicalAuditKeys.js`)을 22개 파일이 공유하는데, queryFn 모양이 둘로 갈려 있다 — `{success, ...}` 원형을 넣는 곳(MonthMmSummary·WorklogPage 등)과 `success` 를 떼고 실패를 던지는 곳(SettingPage·useSalaryPolicy) | grep | 문서 탭 훅은 **두 모양 모두**를 받아야 한다(§4.5) |
| F9 | Workforce 프론트 jest 는 27.5 + jsdom 27(=jsdom 16), `@testing-library/*` 없음. 화면 테스트는 `react-dom/client` `createRoot`+`act` 에 Atlaskit 을 목으로 대체하는 방식(`ProjectModal.test.jsx`) | package.json, jest.config.js | RTL 도입 시 jest 27 호환 버전으로 고정(§8) |
| F10 | 프로젝트 상세 탭의 하위 탭(`children`)은 `DropdownTab` 으로 **각 자식이 독립 마운트**된다. 한 탭 안의 뷰 전환은 `ProjectWorkPanel` 이 `?view=` + `ViewModeToggle` 로 한다(WORK_VIEWS.md 전례) | CommonTab.jsx, ProjectWorkPanel.jsx | [문서|이슈|현황]은 `children` 이 아니라 `?view=` 뷰 전환으로(§4.4) |

---

## 1. 개요 / 영향 범위

| 축 | 신규 / 수정 |
|---|---|
| manifest | `app.compatibility`(Jira 필수·Confluence 선택), 스코프 `search:confluence`, `jira:entityProperty` 항목 1개(`movesDocs`), `settings` 엔티티 attributes 2개 |
| 백엔드 | **수정만**: `SettingDefaults.js`(기본값 2개), `SettingService.js`(`updateSettingService` 입력 2개 + 검증), `ErrorCodes.js`(코드 5개). **신규**: `DocSettingValidator.js`(애드온 `SettingsValidator.js` 의 규칙을 필드 단위로 분리). resolver·`PermissionMap`·`src/index.js` 변경 **없음** |
| 프론트 | 프로젝트 상세 「문서」 탭 전면 교체(애드온 `pages/project/*` 이식), Confluence 호출 유틸 이식, 이슈 프로퍼티 쓰기 이식, 백오피스 설정에 「문서」 카드 추가, `StatusLozenge` 에 문서 상태 진입점 추가 |
| DB | MySQL 없음. KVS `settings` 레코드에 속성 2개(마이그레이션 없음 — 읽기 병합으로 기본값 보충) |
| i18n | `locales/kr/movesDocs.json`·`locales/en/movesDocs.json` 전면 재작성(애드온 문구 흡수), merge 재생성 |
| 테스트 | 순수 로직 테스트 전부 이식, 화면 테스트는 `@testing-library/react` 도입 전제로 이식(권장) |
| 문서 | `static/ui/src/pages/projectDetail/documents/DOCUMENTS.md` 신설(정본), `CLAUDE.md` 보강 |

---

## 2. manifest 변경 전문

### 2.1 `app` 블록 (`licensing` 다음, `storage` 앞)

```yaml
app:
  runtime:
    name: nodejs22.x
    memoryMB: 256
    architecture: arm64
  id: ari:cloud:ecosystem::app/f8962f17-9f12-43d0-91f5-7f3a626c1bbf

  licensing:
    enabled: true

  # 다중 제품 호환 — Jira 필수, Confluence 선택(문서 탭의 문서 연결·검색·상태 확인에만 쓴다).
  # ⚠ Preview 기능이고 **한 번 켜면 되돌릴 수 없다**. 제품 소유자 결정(2026-09-30, requirement.md).
  #   Confluence 가 없는 사이트에서도 앱은 그대로 동작하고, 문서 탭만 읽기 폴백으로 내려간다.
  compatibility:
    jira:
      required: true
    confluence:
      required: false

  storage:
    entities:
      ...
```

### 2.2 `settings` 엔티티 attributes 추가 (`salaryPolicy` 다음)

```yaml
          # 문서 탭(Moves Workforce Docs 흡수) — 분류 목록 [{ name: string(1~30), required: boolean }], 최대 30개.
          # 미설정 설치는 DEFAULT_SETTINGS 병합으로 기본 5개(KVS 백필 불필요).
          # ⚠ updateSettingService 는 DEFAULT_SETTINGS 전체를 펼쳐 저장하므로, 이 선언이 빠진 채 배포되면
          #   **급여 정책 등 모든 설정 저장이 422** 로 깨진다. 코드와 같은 배포에 반드시 포함.
          docCategories:
            type: any
          # 오래된 문서 기준일(1~3650 정수, 기본 90)
          docStaleDays:
            type: integer
```

`indexes` 추가 없음(`settings` 는 `findById('settings')` 1건 조회).

### 2.3 `modules.jira:entityProperty` 에 항목 추가 (`moves-rms-entity-property` 다음)

```yaml
    # 문서 연결 정보 — 이슈 프로퍼티 `movesDocs`(계약: pages/projectDetail/documents/DOCUMENTS.md §2).
    # 별칭은 옛 애드온과 같은 이름을 그대로 쓴다(애드온은 등록·배포된 적이 없어 충돌할 설치가 없다).
    - key: moves-docs-entity-property
      entityType: "issue"
      propertyKey: movesDocs
      values:
        - path: pageIds
          type: string
          searchAlias: movesDocsPageId
        - path: categories
          type: string
          searchAlias: movesDocsCategory
        - path: count
          type: number
          searchAlias: movesDocsCount
```

> 화면은 현재 `movesDocsCount` 별칭을 **검색 조건으로 쓰지 않는다**(프로젝트 이슈 전부를 `moves_RMS_projectId` 로 가져온다). 색인은 JQL 사용자·후속 기능용이며, 설치 감지 용도(P1)는 사라진다.

### 2.4 `permissions.scopes` 에 추가

```yaml
    - write:jira-work
    - manage:jira-configuration
    # 문서 탭 — Confluence 호출은 `/wiki/rest/api/search` 하나뿐(문서 검색·id 조회·스페이스 목록·가용성 확인).
    #   다른 Confluence 주소를 쓰려면 이 목록부터 늘려야 한다(= 또 한 번의 메이저 버전).
    #   classic 스코프라 기존 classic 세트와 섞여도 배포 거부 위험(granular 혼용)이 없다.
    - search:confluence
```

이슈 프로퍼티 쓰기·삭제(`PUT`/`DELETE /issue/{key}/properties/movesDocs`)는 기존 `write:jira-work` 로 충분하다.

### 2.5 메이저 버전이 되는 이유 (한 줄)

**스코프 추가(`search:confluence`)와 제품 호환 추가(`compatibility.confluence`)는 둘 다 설치 사이트 관리자의 재승인이 필요한 권한 변경이라 Forge 가 메이저 버전으로 올리고, 승인 전 사이트는 이전 버전에 머문다.**

---

## 3. 경계면 계약 (가장 중요)

### 3.1 설정 resolver — 기존 함수 확장 (새 resolver 없음)

| resolver | 권한(`PermissionMap`, 변경 없음) | 입력 | success 응답 shape (글자 그대로) | 프론트 소비 |
|---|---|---|---|---|
| `getSettingData` | `'PUBLIC'` | 없음 | `{ success: true, currency, hourRate, utilizationUnderBand, utilizationOverBand, utilizationRedBand, scopeTodoAmberRatio, scopeTodoRedRatio, progressThreshold, salaryPolicy, docCategories: [{ name: string, required: boolean }], docStaleDays: number, ...(저장된 그 밖의 속성) }` | 문서 탭 `useDocsSettings()` / 설정 화면 `SettingPage` → `DocumentSetting` · 쿼리키 `settingKeys.detail()` |
| `updateSetting` | `W('SETTINGS')` | 부분 갱신. 기존 필드 + `docCategories?: [{ name, required }]`, `docStaleDays?: number` (`undefined`/`null` 이면 그 필드는 건드리지 않음) | `{ success: true, content: { settings: { ...위 getSettingData 의 필드 전부(success 제외) } } }` | `DocumentSetting` 저장 → `queryClient.setQueryData(settingKeys.detail(), res.content.settings)` |

- 실패는 기존 가드 직렬화 그대로: `{ success: false, error: { name, code, message, cause } }`.
- 저장되는 `docCategories` 는 **검증기가 돌려준 정규화 값**이다(이름 trim, `required` 는 `=== true` 만 true, 모르는 속성 버림).
- 기본값: `docCategories = [{기획,false},{설계,false},{회의록,false},{산출물,false},{기타,false}]`, `docStaleDays = 90`. 프론트는 기본값을 **복제하지 않는다**(서버 병합이 단일 출처).

### 3.2 설정 검증 규칙과 오류 코드 (애드온 `SettingsValidator.js` 규칙 그대로)

| 입력 | 규칙 | 오류 코드(`ErrorCodes`, 신규) | 애드온 코드 |
|---|---|---|---|
| `docCategories` | 배열이어야 함 | `SETTING_DOC_CATEGORY_LIST_INVALID` | `CATEGORY_LIST_INVALID` |
| `docCategories` | 길이 ≤ 30 | `SETTING_DOC_CATEGORY_TOO_MANY` | `CATEGORY_TOO_MANY` |
| `docCategories[i]` | 객체이고 `name` 이 문자열, trim 뒤 1~30자 | `SETTING_DOC_CATEGORY_NAME_INVALID` | `CATEGORY_NAME_LENGTH` |
| `docCategories[i].name` | **대소문자 무시** 중복 금지(`toLowerCase()` 로 비교, 저장은 입력 대소문자 유지) | `SETTING_DOC_CATEGORY_DUPLICATED` | `CATEGORY_DUPLICATED` |
| `docStaleDays` | `Number.isInteger` 이고 1~3650 (문자열 숫자 거부) | `SETTING_DOC_STALE_DAYS_INVALID` | `STALE_DAYS_RANGE` |

- 애드온의 `SETTINGS_INVALID`(payload 자체가 객체 아님)는 Workforce 부분 갱신 구조에 해당 경우가 없어 가져오지 않는다. `FORBIDDEN`·`ADMIN_CHECK_FAILED` 는 가드(`W('SETTINGS')`)가 대신한다.
- 검증은 **`findById` 전에** 한다(기존 `progressThreshold` 테스트가 "저장 전 거부 + findById 미호출"을 확인하는 관례).
- `LogicalError(code, message)` — `message` 는 기존 설정 오류처럼 영어 설명문.

### 3.3 이슈 프로퍼티 `movesDocs` — **변경 없음**

```jsonc
{
  "v": 1,
  "projectId": "42",
  "pages": [{ "id": "123456", "title": "…", "spaceName": "…", "category": "설계",   // category 는 미분류면 생략
              "linkedAt": "2026-09-29T02:10:00.000Z", "linkedBy": "5b10ac8d…" }],
  "pageIds": ["123456"], "categories": ["설계"], "count": 1
}
```

- **`url` 필드 없음.** 옛 값에 있어도 읽을 때 버린다. 링크는 `siteUrl + "/wiki/pages/viewpage.action?pageId=" + id` 로만 조립(`buildDocumentUrl`).
- 조립은 `buildLinkProperty` 한 곳, 읽기는 `readPages` 한 곳(30건·id `^\d{1,19}$`·제목/스페이스 255·분류 30·`linkedAt` 날짜·`linkedBy` 계정 형식), 병합은 `mergePages` 한 곳. 빈 `pages` → 프로퍼티 삭제. 값 상한 32,768 **UTF-8 바이트**.
- 이제 읽는 쪽과 쓰는 쪽이 **한 저장소의 한 파일**(`utils/jiraApi/movesDocsProperty.js`)이다. "두 파일을 함께 고친다" 주석은 삭제한다.

### 3.4 Jira 호출 (프론트 직접, 사용자 자격) — 실행기 `utils/jiraApi/movesDocsRequest.js`

| 요청 키 | 호출 | 쓰는 응답 필드 | 실패 처리 |
|---|---|---|---|
| `searchIssueWithJQL` | `POST /rest/api/3/search/jql` body `{ jql: 'moves_RMS_projectId = "<id>"', fields: ['summary','status','issuetype','assignee'], properties: ['movesDocs'], maxResults: 100, nextPageToken? }` — 상한 2,000건 | `issues[].id/key/fields.summary/status.name/status.statusCategory.key/issuetype.name/assignee.displayName/properties.movesDocs`, `isLast`, `nextPageToken` | 던짐 → `issuesQuery.isError` → 탭 전체 오류 |
| `getIssueProperty` | `GET /rest/api/3/issue/{key}/properties/movesDocs` (`allow: [404]`) | `value` | 404 → `null`(없음). 그 밖은 던짐 |
| `setIssueProperty` | `PUT` 같은 경로, 본문 = `buildLinkProperty` 결과 | 없음(빈 본문 허용) | 던짐(`status`) → 이슈별 사유 |
| `deleteIssueProperty` | `DELETE` 같은 경로 (`allow: [404]`) | 없음 | 404 = 삭제 성공으로 간주 |

### 3.5 Confluence 호출 4종 — 전부 `GET /wiki/rest/api/search` (실행기 `utils/confluenceApi/requestConfluence.js`)

| 용도 | 요청 쿼리 | 쓰는 응답 필드 | 함수 → 반환 | 쿼리키 |
|---|---|---|---|---|
| ① 문서 검색 | `cql=buildSearchCql({term, includeBody, spaceKeys})`, `limit=20`. 제목만: `type = page AND title ~ "<t>*" [AND space in ("K1","K2")] ORDER BY lastmodified DESC` / 본문 포함: `type = page AND (title ~ "<t>*" OR text ~ "<t>") [AND space in (…)]`(정렬 없음) / 주소 붙여넣기: `id = <숫자>` | `results[].content.id`, `content.title`(없으면 최상위 `title` 에서 `@@@hl@@@` 제거), `resultGlobalContainer.title`, `lastModified`, 본문 포함일 때 `excerpt` | `searchPages(opts)` → `[{ id, title, spaceName, lastModified, excerpt? }]` | `confluenceKeys.pageSearch({term, includeBody, spaceKeys})` |
| ② id 조회(최신 정보) | `cql=id in (<id,…>)`, `limit=50`, 50개씩 최대 10회(500건 `MAX_LOOKUP_PAGES`) | ①과 같음(`excerpt` 제외) | `fetchLatestPages(ids)` → `{ [id]: { id, title, spaceName, lastModified } }` (없는 id = 끊김) | `confluenceKeys.latestPages(lookupIds)` |
| ③ 스페이스 목록 | `cql=type = space` 또는 `type = space AND title ~ "<입력>*"`, `limit=25` | `results[].space.key`, `space.name`(없으면 `title`) — 키 없는 결과 버림, 키 중복 제거 | `searchSpaces(input)` → `[{ key, name }]` | `confluenceKeys.spaceSearch(term)` |
| ④ 가용성 확인 | `cql=type = page`, `limit=1` (연결 문서가 **0건**인 프로젝트에서만) | `results` 가 배열인지만 | `checkConfluenceAvailable()` → `true` / 던짐 | `confluenceKeys.availability()` |

공통: 검색어의 문법 문자(`+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /`)는 공백으로, CQL 문자열 값은 `\`·`"` 이스케이프, id 는 숫자만. 실패는 **던진다**(0건과 구분).

### 3.6 프론트 내부 계약 (훅 ↔ 화면)

`useProjectDocuments(projectId, { enabled, canWrite })` 반환 — 애드온 `useProjectData` 반환과 **필드 동일**:

```js
{ isLoading, isError, isReady, refetch,
  issues: [{ id, key, summary, statusName, statusCategory, issueTypeName, assigneeName, pages: [...] }],
  truncated: boolean, lookupTruncated: boolean,
  categories: [{ name, required }],            // useDocsSettings 에서
  documents: [{ id, title, spaceName, lastModified, categories: [], issues: [{ key, summary, category }], status: 'broken'|'stale'|'ok'|'unknown' }],
  summary: { linkedDocuments, issuesWithoutDocuments, staleDocuments: number|null, brokenDocuments: number|null, missingRequiredCategories: string[] } | null,
  latestAvailable: boolean,                    // Confluence 로 문서를 찾을 수 있는가
  patchIssues: (results) => void }
```

`useDocsSettings()` 반환: `{ data: { categories: [{name, required}], staleDays: number } | undefined, isPending, isError, refetch }`.

---

## 4. 프론트엔드 설계

### 4.1 파일 배치표 (애드온 → Workforce)

원칙: 같은 역할의 Workforce 공용 지점이 있으면 그것을 쓰고 애드온 사본은 버린다. 계약·순수 로직은 **내용을 바꾸지 않고** 옮긴다(경로·import·번역 키만 조정).

| 애드온 파일 | Workforce 경로 | 처리 |
|---|---|---|
| `utils/jiraApi/movesDocsProperty.js` | `utils/jiraApi/movesDocsProperty.js` | **교체**(현 읽기 전용판 폐기). "두 저장소" 주석을 "이 파일이 유일한 출처"로 수정 |
| `utils/jiraApi/movesDocsSearch.js` | `utils/jiraApi/movesDocsSearch.js` | **교체**(설치 감지·문서 있는 이슈만 검색하던 함수 폐기). import 를 `./movesDocsRequest` 로 |
| `utils/jiraApi/movesDocsWriter.js` | `utils/jiraApi/movesDocsWriter.js` | 신규 이식. import 를 `./movesDocsRequest` 로 |
| `utils/jiraApi/requestJira.js` | `utils/jiraApi/movesDocsRequest.js` | **이름 바꿔** 이식(Workforce `requestJira.js` 와 충돌 방지). 요청 맵 4개(§3.4) 그대로, export 는 `executeMovesDocsRequest`, 오류 클래스 `MovesDocsRequestError` |
| `utils/requestCore.js` | `utils/requestCore.js` | 신규 이식(그대로). 사용처는 `movesDocsRequest.js`·`requestConfluence.js` 둘뿐 — 파일 머리 주석에 명시 |
| `utils/confluenceApi/{requestConfluence,cql,pageSearch,spaceSearch}.js` | `utils/confluenceApi/` 같은 이름 | 신규 이식(그대로) |
| `utils/queryKey/movesDocsKeys.js` | `utils/queryKey/movesDocsKeys.js` | **교체** — `all`, `projectIssues(projectId)` 만(현 `installed`·`documents` 삭제) |
| `utils/queryKey/confluenceKeys.js` | `utils/queryKey/confluenceKeys.js` | 신규 이식(그대로) |
| `utils/queryKey/settingKeys.js`·`projectKeys.js`·`viewerKeys.js` | — | 버림. 설정은 Workforce `logicalAuditKeys.settingKeys` 사용 |
| `hooks/useSettings.js` | `pages/projectDetail/documents/useDocsSettings.js` | 재작성(§4.5) — `getSettingData` + `settingKeys.detail()` |
| `pages/project/ProjectPage.jsx` | `pages/projectDetail/documents/ProjectDocumentsPanel.jsx` | 재작성(셸 교체, §4.4). 모달·필터·뷰 전환 상태 로직은 그대로 |
| `pages/project/useProjectData.js` | `pages/projectDetail/documents/useProjectDocuments.js` | 이름 변경 이식 + 인자 `{ enabled, canWrite }` 추가(§4.6). 나머지 로직 불변 |
| `pages/project/documents.js`·`filters.js` | `pages/projectDetail/documents/` 같은 이름 | 그대로 |
| `pages/project/DocumentsTab.jsx`·`IssuesTab.jsx`·`OverviewTab.jsx` | `pages/projectDetail/documents/` 같은 이름 | 이식 + `canWrite` prop(동작 열·버튼 숨김) + 번역 키 접두사 |
| `pages/project/LinkModal.jsx`·`DocActionModal.jsx`·`IssueResultList.jsx` | `pages/projectDetail/documents/` 같은 이름 | 이식. `accountId` 는 `useAppContextStore` 대신 `context.accountId` prop |
| `utils/links.js` | `pages/projectDetail/documents/links.js` | 이식(문서 탭 전용) |
| `app.css` 의 `.docs-*` | `pages/projectDetail/documents/documents.css` | 쓰는 클래스만 옮김(`docs-stack`·`docs-row`·`docs-tab`·`docs-tags`·`docs-subtle`·`docs-filter*`·`docs-cards`·`docs-card*`·`docs-field*`·`docs-search-*`·`docs-choice-list`·`docs-excerpt`·`docs-result-*`·`docs-error-text`·`docs-settings-row`). 전역 레이아웃 클래스는 버림 |
| `components/lozenge/StatusLozenge.jsx` 의 `DocStatusLozenge` + `statusAppearance.js` 의 `DOC_STATUS_APPEARANCE` | Workforce `components/lozenge/StatusLozenge.jsx`·`statusAppearance.js` 에 **추가** | 입력 shape 별 세 번째 진입점. Workforce 관례대로 `isBold`, 라벨 키 `movesDocs.docStatus.<status>`. appearance 는 레거시 유효값(`removed/moved/success/default`)만 — RFC-199 회색 강등 함정 없음 |
| `components/table/*`·`components/skeleton/*`·`components/chart/EmptyState.jsx`·`components/layout/*` | — | 버림. Workforce 원본(`CommonTable`·`SkeletonText`·`SkeletonCards`·`EmptyState`) 사용. `CommonTable` props(`head, rows, rowsPerPage, isLoading, emptyMessage, label`, `sortValue` 계약) 동일 확인 |
| `components/error/LoadError.jsx` | `pages/projectDetail/documents/LoadError.jsx` | 문서 탭 로컬로 이식(공용 컴포넌트로 올리지 않는다). 재시도 문구는 `common.button.retry` |
| `pages/settings/SettingsPage.jsx` | `backoffice/page/setting/DocumentSetting.jsx` | 재작성(카드, §4.7) |
| `stores/useI18nStore.js`·`utils/i18n.js` | — | 버림. Workforce 것 사용(`tFormat` 동일) |
| `stores/useAppContextStore.js` | — | 버림. 탭 `props.context`(`view.getContext()` 결과: `siteUrl`, `accountId`) 사용 |
| `utils/invokeResolver.js`·`hooks/useViewer.js`·`hooks/useRememberedProjects.js` | — | 버림 |
| `App.jsx`·`index.js`·`router/*`·`layout/*`·`pages/home/*`·`pages/license/*`·`stores/useLicenseStore.js`·`licenseDecision.js` | — | 버림 |
| 백엔드 `src/resolver/settings/SettingsValidator.js` | `src/resolver/backoffice/setting/DocSettingValidator.js` | 규칙 이식, 필드 단위 함수 2개로 분리(§5) |
| 백엔드 그 밖(`settings` Controller/Service/Repository, `project/*`, `viewer/*`, `permission/*`, `KeyValueManager`, `LicenseGuard`, `ResponseWrapper`, `UserApi`) | — | 버림 |

### 4.2 버리는 것 (애드온에서 가져오지 않음)

설치 감지(`useMovesDocsInstalled`, `jql/parse`), 앱 간 이동(`constants/movesDocs.js`, `?name=`), 별도 라이선스 판정·안내·평가판 배너, 사용자별 프로젝트 기억(KVS `projects:*`, `listProjects`/`touchProject`)과 홈 화면, 관리자 판정(`getViewer`, `mypermissions?permissions=ADMINISTER`), 애드온 manifest·라우터·레이아웃·부팅 실패 문구.

### 4.3 요청 실행기 결정 — **애드온 `requestCore.js`(실패를 던짐)를 들여온다**

결정: 문서 탭의 Jira·Confluence 호출은 전부 `utils/requestCore.js` 의 `createExecuteRequest` 로 만든 실행기(`movesDocsRequest.js`, `requestConfluence.js`)를 쓴다. Workforce `executeRequest` 는 **고치지 않고**, 문서 모듈은 **섞어 쓰지 않는다**.

이유(판단 기준 `movesDocsWriter.js` 의 `failureReason`: `status` 401/403 → 권한 없음, 404 → 이슈 없음):

1. **저장 성공이 실패로 보고된다.** Workforce 실행기는 204 만 빈 본문으로 보고 그 밖의 2xx 는 `response.json()` 을 부른다. 이슈 프로퍼티 `PUT` 은 200/201 에 빈 본문이라 JSON 파싱 예외 → `{success:false, code:'Internal Error'}` 가 된다. 저장은 됐는데 결과 목록에 "실패"가 찍히고 캐시 패치(`patchIssues`)도 빠진다.
2. **404 를 "없음"으로 볼 수단이 없다.** `GET` 프로퍼티 404(연결 없음)·`DELETE` 404(이미 없음)는 정상 경로인데, Workforce 실행기는 전부 실패 값으로 만든다. 호출부마다 `code === 404` 분기를 박아야 한다. 애드온은 요청 정의의 `allow: [404]` 한 곳이다.
3. **상태 코드와 네트워크 오류가 한 자리에 섞인다.** Workforce 는 `error.code` 에 HTTP 상태(숫자)도, `'Internal Error'`(네트워크·파싱)도 넣는다. `failureReason` 의 403/404 판정이 문자열 비교 방어를 떠안게 된다.
4. **react-query `isError` 가 보안 규칙이다.** "재조회 실패는 `isError` 로 판정(옛 값에 가려지지 않게)"은 queryFn 이 **던져야** 성립한다. 실패 값을 돌려주면 `isError` 는 false 이고 `data` 에 실패 객체가 들어가, 호출부마다 `data.success === false` 를 다시 봐야 한다 — 성공 응답 본문과 실패 객체를 모양으로 구분하는 것도 모호하다.
5. **Workforce 실행기를 고치는 선택지는 범위 밖이다.** 호출부 수십 곳이 "실패 = 값" 계약에 기대고 있어(예: `res?.success` 분기), 그 계약을 바꾸는 것은 앱 전역 회귀 검증이 필요한 별건이다.
6. 부수 이점: `requestCore` 는 URL 자리 값을 `encodeURIComponent` 하고(Workforce `replaceUrl` 은 하지 않는다), 이슈 키는 우리가 받은 값이지만 경로 주입 여지를 없앤다.

규칙(DOCUMENTS.md·CLAUDE.md 에 기록): **`utils/requestCore.js` 기반 실행기는 문서 탭 전용이다.** 다른 화면이 쓰기 시작하면 "실패 = 던짐" 계약도 함께 가져가야 하므로 사용처를 늘릴 때는 호출부의 오류 처리를 같이 본다.

### 4.4 탭 구조 — 최상위 「문서」 탭 1개 + 탭 안 `?view=` 뷰 전환

**`children`(DropdownTab)을 쓰지 않는다.** 이유: [문서|이슈|현황]은 ① 헤더의 「문서 연결」 버튼 하나를 공유하고 ② 현황 카드를 누르면 **필터가 걸린 채** 문서/이슈 뷰로 옮겨 가며 ③ 연결·분류·해제 모달과 필터 상태를 한 셸이 소유해야 한다. `children` 은 자식마다 독립 마운트라 이 셋이 전부 끊긴다. 같은 데이터(`useProjectDocuments`)의 다른 표현이므로 `ProjectWorkPanel`(목록|트리|간트|맵) 전례와 같은 **뷰 전환 셸**이 맞다.

`constants/tabs.js`:

```js
const ProjectDocumentsPanel = React.lazy(() => import('../pages/projectDetail/documents/ProjectDocumentsPanel'));

// projectDetailTabs(...) 인자 목록에서 movesDocsInstalled 제거 — 원래 시그니처로 복귀:
// (t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context)
// 배열 **끝**(analysisReport 다음)에 무조건 추가:
{
    // 문서 — 이슈에 연결한 Confluence 문서의 연결·분류·해제·현황 (pages/projectDetail/documents/DOCUMENTS.md)
    // 이 탭은 Jira·Confluence 를 프론트에서 직접 부르므로 서버 가드를 거치지 않는다 —
    // 다른 탭과 같은 프로젝트 읽기 권한을 여기서 건다(권한이 없으면 NoPermissionPage, 리포 관례).
    key: 'documents',
    title: t('movesDocs.tab.label'),
    label: (<span style={{ display: "flex", alignItems: "center", gap: 4 }}><PagesIcon label="" />{t('movesDocs.tab.label')}</span>),
    component: ProjectDocumentsPanel,
    props: {project_id, context},
    canRender: () => canReadProject,
},
```

- 딥링크: `?tab=documents&view=documents|issues|overview`. `CommonTab` 이 탭 전환 시 `setTabParam(key, {only:true})` 로 `view` 를 버리므로 다른 탭과 충돌 없음.
- Suspense: 탭 컴포넌트가 lazy 이고 `CommonTab` 경계 아래에 있다(첫 탭이 아니므로 lazy 가능). 셸 안의 세 뷰는 **정적 import**(작고, 뷰 전환마다 청크 왕복을 만들 이유가 없다) → 셸 내부 Suspense 불필요.
- `components/tabs/ProjectDetailTabs.jsx`: `useMovesDocsInstalled` import·호출·인자 전달을 되돌린다(작업 트리 diff 원복).

`ProjectDocumentsPanel` 구성(애드온 `ProjectPage` 에서 `PageContainer`·프로젝트 이름·기억 로직을 걷어낸 것):

```
ProjectDocumentsPanel({ project_id, context })
├─ 범위 판정: useQuery(findProjectByIdQueryKeys(project_id) → invoke('findProjectById',{project_id}))  ← 상세 페이지와 같은 키·같은 호출(캐시 공유)
│     projectAllowed = result?.success === true   (L-4: 통과 전에는 Jira·Confluence 조회를 시작하지 않는다)
├─ canWrite = usePermissionStore(s => s.canWrite('PROJECT'))
├─ data = useProjectDocuments(project_id, { enabled: projectAllowed, canWrite })
├─ [view, setView] = useUrlParam('view')  → 'documents'(기본) | 'issues' | 'overview', 모르는 값은 'documents'
├─ 툴바(Inline, space-between): ViewModeToggle(items 3개) | 「문서 연결」 Button (canWrite 일 때만 렌더, isDisabled={!canLink})
│     canLink = canWrite && data.isReady && data.latestAvailable
├─ SectionMessage ×3 (confluenceUnavailable / lookupTruncated / truncated) — 애드온 조건 그대로
├─ data.isError ? <LoadError onRetry={data.refetch}/> : 뷰 하나
│     documents → <DocumentsTab ... canWrite onChangeCategory onUnlink/>
│     issues    → <IssuesTab ... canLink onLink/>
│     overview  → <OverviewTab ... onShowDocuments onShowIssues/>   (showDocuments/showIssues 는 필터 세팅 + setView)
├─ {linkModal && <LinkModal projectId issues categories initialIssueKeys accountId={context?.accountId} onSaved={data.patchIssues} onClose/>}
└─ {docAction && <DocActionModal projectId mode doc categories onSaved onClose/>}
```

- 필터 상태(`documentFilter`, `issueFilter`)는 셸 `useState` — URL 에 싣지 않는다(애드온과 같음, 과설계 방지).
- `siteUrl` 은 `context?.siteUrl`. `context` 가 늦게 오면 링크를 그리지 않을 뿐(애드온 `buildDocumentUrl` 이 null 반환).

### 4.5 `useDocsSettings` — 설정 캐시 공유

```js
// pages/projectDetail/documents/useDocsSettings.js
export const useDocsSettings = () => {
  const query = useQuery({
    queryKey: settingKeys.detail(),               // logicalAuditKeys — 22개 파일과 같은 캐시
    queryFn: async () => {                        // SettingPage·useSalaryPolicy 와 같은 모양(실패는 던짐, success 제거)
      const result = await invoke('getSettingData');
      if (!result?.success) throw new Error(result?.error?.message ?? 'getSettingData failed');
      const { success, ...setting } = result;
      return setting;
    },
    staleTime: 1000 * 60 * 10,
  });
  // F8: 다른 화면이 {success:false,...} 원형을 먼저 캐시했을 수 있다 → 그 경우도 오류로 본다.
  const raw = query.data;
  const cachedFailure = raw?.success === false;
  const valid = raw && !cachedFailure && Array.isArray(raw.docCategories) && Number.isInteger(raw.docStaleDays);
  return {
    data: valid ? { categories: raw.docCategories, staleDays: raw.docStaleDays } : undefined,
    isPending: query.isPending,
    isError: query.isError || cachedFailure || (query.isSuccess && !valid),
    refetch: query.refetch,
  };
};
```

- 설정 조회 실패 = 탭 전체 오류(애드온과 같음). 기본값으로 대체하지 않는다 — "누락된 필수 분류"를 조용히 틀리게 만든다.
- `(query.isSuccess && !valid)` 는 **배포 순서 역전**(프론트가 새 번들인데 백엔드가 옛 코드라 필드가 없음)을 오류로 드러낸다.

### 4.6 `useProjectDocuments` — 애드온 `useProjectData` 대비 변경점 3개만

1. 설정 출처: `useSettings()` → `useDocsSettings()` (반환 필드 `categories`·`staleDays` 동일).
2. `enabled` 인자: `issuesQuery` 에 `enabled: enabled && !!projectId`. `availabilityQuery`·`latestQuery` 는 원래 조건(`issuesQuery.isSuccess`·`hasPages`)이 이미 이슈 조회 성공에 묶여 있어 추가 불필요. `enabled` 가 false 인 동안은 `isLoading`(스켈레톤) — `issuesQuery.isPending` 이 그대로 true 이므로 코드 변경 없이 성립.
3. **스냅샷 자동 갱신(애드온 §7.3)은 `canWrite` 일 때만** 돈다: `if (!canWrite || !isReady || …) return;`. 이유: 쓰기 권한(PROJECT write)이 없는 열람자가 탭을 여는 것만으로 Jira 에 쓰기가 나가지 않게 한다(쓰기 동작 전부를 PROJECT write 에 묶는 요구의 일관 적용). 갱신 상한 20건·권한 실패 무시는 그대로.

그 밖(`isError` 우선 판정, `latest === null` → 확인 불가, `MAX_LOOKUP_PAGES` 500, `checkConfluenceAvailable` 는 연결 문서 0건일 때만, `patchIssues` 캐시 패치)은 **한 줄도 바꾸지 않는다**.

### 4.7 백오피스 설정 — `DocumentSetting.jsx` 카드

- 위치: `backoffice/page/setting/SettingPage.jsx` 의 `<Stack>` 에서 `SalaryPolicySetting` 다음. prop 계약은 형제 카드와 같다: `{ settings, onSettingsUpdated }`.
- 모양: Workforce `components/card/Card` 안에 애드온 SettingsPage 본문(분류 행: 이름 `Textfield maxLength=30` + 「필수」 `Checkbox` + 삭제, 「분류 추가」, 기준일 `Textfield type=number`) + 저장 버튼.
- 권한: `canWrite('SETTINGS')` 가 false 면 입력 비활성·추가/삭제/저장 버튼 숨김 + 정보 `SectionMessage`(읽기 전용 안내). 애드온의 관리자 판정(`getViewer`)과 `viewerFailed` 안내는 버린다.
- 저장: `invoke('updateSetting', { docCategories: [{name, required}], docStaleDays: Number(draft.staleDays) })` — **이 두 필드만** 보낸다(다른 카드 값 보존). 클라이언트 검증 없음(서버가 한다, 애드온과 같음).
  - 성공: `onSettingsUpdated(res.content.settings)` → `SettingPage` 가 `setQueryData(settingKeys.detail(), …)` → 문서 탭 즉시 반영. 성공 토스트(`ToastFlags`, `setting.toast.success`).
  - 실패: `res.error.code` 가 §3.2 의 5개면 `movesDocs.errors.<code>` 문구를 카드 안 오류 `SectionMessage` 로, 그 밖은 공통 실패 토스트(`common.toast.*`).
- 초기값: `settings?.docCategories`·`settings?.docStaleDays`(서버 병합 기본값이 이미 들어 있음). `settings` 가 null(로딩) 이면 `SkeletonText`.

### 4.8 권한 게이트 (프론트) 와 한계

| 동작 | 게이트 | 위치 |
|---|---|---|
| 탭 보기 | `PROJECT read` | `tabs.js` `canRender: () => canReadProject` (없으면 `NoPermissionPage`) |
| 조회 시작 | 프로젝트 범위 판정 통과(`findProjectById` 성공 — 서버 `R('PROJECT','detail')`, `ProjectScope`) | `ProjectDocumentsPanel` → `useProjectDocuments({enabled})` |
| 「문서 연결」(헤더·이슈 행), 분류 변경, 연결 해제 | `usePermissionStore.canWrite('PROJECT')` — false 면 **렌더하지 않음**(문서 뷰의 동작 열 자체를 뺀다) | 셸·`DocumentsTab`·`IssuesTab` |
| 스냅샷 자동 갱신 | `canWrite('PROJECT')` | `useProjectDocuments` |
| 실제 쓰기 허용 | Jira 이슈 편집 권한(사용자 자격 `PUT`) — 403 이면 이슈별 "권한 없음" | Jira |
| 설정 저장 | 서버 `W('SETTINGS')` + 검증 | `updateSetting` |

**서버 가드가 없는 이유와 한계(명시):** 문서 탭의 조회·쓰기는 전부 `@forge/bridge` 의 `requestJira`/`requestConfluence` 로 브라우저에서 **사용자 자격**으로 직접 나간다. 우리 resolver 를 지나지 않으므로 `guardedDefine`·`PermissionMap`·`ProjectScope`·백엔드 라이선스 판정(`assertLicenseAllowed`)이 닿지 않는다. 따라서 위 게이트는 **화면의 게이트**이며, 개발자 도구로 같은 호출을 직접 부르면 그 사용자가 Jira·Confluence 에서 원래 할 수 있는 일(볼 수 있는 이슈 검색, 편집할 수 있는 이슈의 프로퍼티 쓰기, 볼 수 있는 문서 검색)은 할 수 있다. 앱이 권한을 **더 주지는 않는다**. Workforce 의 프로젝트 제한(`MEMBER_ONLY`/`TEAM_ONLY`)이나 `PROJECT write` 를 보안 경계로 쓰는 고객은 Jira 권한(프로젝트 역할·이슈 보안)을 함께 맞춰야 한다 — 도입 안내에 명시. 막아야 한다면 쓰기를 resolver 로 옮기는 설계 변경(후속, 이번 범위 아님).

### 4.9 Confluence 미연결·라이선스

- **Confluence 미연결 폴백 = 애드온 로직 그대로.** 연결 문서가 있으면 최신 정보 조회(②) 실패, 없으면 가용성 확인(④) 실패 → `latestAvailable: false` → 상단 경고 + 「문서 연결」 비활성, 목록은 저장된 스냅샷으로 그리고 상태는 "확인 불가", 현황의 오래됨·끊김은 `null`("확인 불가"). 분류 변경·연결 해제는 Jira 쓰기라 **막지 않는다**(애드온 동작. requirement 의 "읽기 전용 표시"는 이 동작을 가리키는 것으로 해석 — §11 미확정 1).
- **라이선스: 탭에 별도 처리 없음.** Workforce `App.jsx` 가 `useLicenseStore.loadLicense()` 뒤 `!isLicensed` 면 `LicenseGuidePage` 만 그리므로 문서 탭을 포함한 앱 화면 전체가 렌더되지 않고, 어떤 조회도 시작되지 않는다. 판정 경계(INACTIVE 만 차단)는 Workforce 것을 그대로 따른다. 애드온의 라이선스 판정·안내·배너·결정표 테스트는 가져오지 않는다. 한계: 위 §4.8 과 같은 이유로 직접 호출은 백엔드 라이선스 판정 밖이다(애드온 DESIGN §9 와 동일, 받아들임).

### 4.10 쿼리키

| 팩토리 | 키 | 용도 |
|---|---|---|
| `movesDocsKeys.projectIssues(projectId)` | `['movesDocs','projectIssues', String(projectId)]` | 프로젝트 이슈 + 연결 정보 |
| `confluenceKeys.availability()` | `['confluence','availability']` | 가용성 확인 |
| `confluenceKeys.latestPages(ids)` | `['confluence','latestPages', ids]` | 최신 정보 |
| `confluenceKeys.pageSearch({term, includeBody, spaceKeys})` | `['confluence','pageSearch',{term, includeBody, spaceKeys(정렬)}]` | 문서 검색(옵션 전부 키에 포함) |
| `confluenceKeys.spaceSearch(term)` | `['confluence','spaceSearch', term]` | 스페이스 목록 |
| `settingKeys.detail()`(기존) | `['settings','detail']` | 문서 설정 |
| `findProjectByIdQueryKeys(id)`(기존) | — | 범위 판정 |

`queryKeyContract.test.js`(인라인 배열 금지)를 통과해야 한다 — 이식 코드는 이미 팩토리만 쓴다.

---

## 5. 백엔드 설계

### 5.1 `src/resolver/backoffice/setting/SettingDefaults.js`

```js
    salaryPolicy: 'INDIVIDUAL',
    // 문서 탭(Moves Workforce Docs 흡수) — 분류와 오래된 문서 기준일. 읽기 병합이 하위호환의 전부다.
    docCategories: Object.freeze(['기획', '설계', '회의록', '산출물', '기타']
        .map((name) => Object.freeze({ name, required: false }))),
    docStaleDays: 90,
```

`SeedData.addSettingSeed` 는 `{...DEFAULT_SETTINGS, ...exists}` 라 신규 설치·다음 시드 모두 자동 반영. `SEED_VERSION` 올릴 필요 없음.

### 5.2 `src/resolver/backoffice/setting/DocSettingValidator.js` (신규, 순수 함수)

```js
export const MAX_DOC_CATEGORIES = 30;
export const DOC_CATEGORY_NAME_MAX = 30;
export const DOC_STALE_DAYS_MIN = 1;
export const DOC_STALE_DAYS_MAX = 3650;

/** @returns 저장할 형태 [{name(trim), required(boolean)}] — 모르는 속성은 버린다 @throws LogicalError */
export const validateDocCategories = (value) => { … 애드온 validateSettings 의 categories 부분 그대로 … };
/** @returns value @throws LogicalError(SETTING_DOC_STALE_DAYS_INVALID) */
export const validateDocStaleDays = (value) => { … Number.isInteger && 1..3650 … };
```

### 5.3 `SettingService.updateSettingService`

- 구조 분해에 `docCategories`, `docStaleDays` 추가.
- 기존 검증들과 같은 자리(= `findById` 전)에서: `const nextDocCategories = docCategories != null ? validateDocCategories(docCategories) : undefined;` `if (docStaleDays != null) validateDocStaleDays(docStaleDays);`
- 병합: `...(nextDocCategories !== undefined && { docCategories: nextDocCategories })`, `...(docStaleDays != null && { docStaleDays })`.
- `getSettingDataService` 는 변경 없음(기본값 병합이 이미 처리).

### 5.4 `src/utils/errors/ErrorCodes.js`

`SETTING_DOC_CATEGORY_LIST_INVALID`, `SETTING_DOC_CATEGORY_TOO_MANY`, `SETTING_DOC_CATEGORY_NAME_INVALID`, `SETTING_DOC_CATEGORY_DUPLICATED`, `SETTING_DOC_STALE_DAYS_INVALID` — 기존 `SETTING_*` 블록 아래.

### 5.5 변경 없음 (확인)

`SettingController.js`, `PermissionMap.js`(`getSettingData: 'PUBLIC'`, `updateSetting: W('SETTINGS')` 그대로), `src/index.js` `CONTROLLER_REGISTRARS`, `test/permission/permissionMap.contract.test.js`. `ResourceCatalog.js` 는 `PROJECT` 의 `covers`(문서용 설명, 응답 미포함)에 `'프로젝트 문서 탭'` 한 줄만 추가(선택).

---

## 6. DB 설계

- MySQL: 변경 없음.
- KVS `settings`(단일 레코드 `settings`): 속성 `docCategories`(any = 객체 배열), `docStaleDays`(integer). 마이그레이션 없음 — 기존 설치는 읽을 때 기본값, 처음 설정을 저장할 때 실제로 기록된다.
- 선택 필드 규칙: 분류 이름은 1자 이상이라 빈 문자열이 저장되지 않는다. 분류 0개(`[]`)는 허용(애드온과 같음) — KVS `any` 에 빈 배열 저장 가능 여부는 실측(W2).
- 이슈 프로퍼티 `movesDocs`: Jira 소유. 데이터 이관 없음.

---

## 7. i18n — `locales/kr/movesDocs.json`·`locales/en/movesDocs.json` 전면 재작성

### 7.1 키 이동 규칙

1. 애드온 `locales/<lang>/<파일>.json` 의 키 `<k>` → Workforce `movesDocs.<파일>.<k>` (파일 = JSON 최상위 객체).
2. **예외 1 — 버리는 파일:** `app`, `home`, `license`, `nav`.
3. **예외 2 — Workforce 공용 키로 대체:** 애드온 `common.close/cancel/save/delete/retry` → Workforce `common.button.close/cancel/save/delete/retry`. 남는 `common.loading`·`common.none`·`common.loadFailedHint` 만 `movesDocs.common.*`. `common.table.*` 는 Workforce `CommonTable` 이 자체 키를 쓰므로 버림.
4. **예외 3 — 오류 코드:** `errors.*` 는 새 코드 5개로 이름을 바꿔 `movesDocs.errors.<신규코드>`(§3.2 매핑). `FORBIDDEN`·`ADMIN_CHECK_FAILED`·`SETTINGS_INVALID`·`LICENSE_INACTIVE`·`UNKNOWN_ERROR` 버림.
5. **예외 4 — 최상위 탭 이름:** 기존 `movesDocs.tab.label`("문서") 유지(`tabs.js` 가 씀).
6. **용어:** Workforce 는 Jira 이슈를 kr "작업" / en "work item" 으로 부른다(`projectDetail.tabs`, 기존 `movesDocs.json`). 옮기는 **모든 문구의 "이슈"를 "작업"으로, en 의 "issue(s)"를 "work item(s)"로** 바꾼다. 키 이름(`issues.*`)은 바꾸지 않는다.
7. 치환 변수(`{count}`·`{max}`·`{success}`·`{failed}`)가 있는 키는 **반드시 `tFormat(t, key, vars)`** 로 부른다(Workforce `t()` 는 치환하지 않는다 — F5). 대상: `documents.moreIssues`, `linkModal.selectedDocuments`, `linkModal.tooManyDocuments`, `project.truncated.description`, `project.lookupTruncated.description`, `result.allSucceeded`, `result.someFailed`, `result.reason.limit`(나머지 `result.reason.*` 는 변수가 없지만 같은 호출로 부름 — 애드온 그대로).
8. 기존 Workforce `movesDocs.json` 의 `description`·`openManage`·`col.*`·`untitled`·`empty`·`truncated`·`error.*` 는 **삭제**.

### 7.2 최종 키 트리 (kr 값. en 은 애드온 `locales/en` 같은 키의 값에 규칙 6 적용)

```jsonc
{
  "tab": { "label": "문서" },
  "common": { "loading": "불러오는 중", "none": "-", "loadFailedHint": "잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 문의하세요." },
  "project": {
    "linkButton": "문서 연결",
    "loadFailed": "문서 정보를 불러오지 못했습니다",                       // 애드온 "프로젝트 정보를…" → 탭 맥락에 맞게
    "confluenceUnavailable": { "title": "Confluence 문서 정보를 확인하지 못했습니다", "description": "(애드온 그대로)" },
    "truncated": { "title": "작업이 많아 일부만 표시합니다", "description": "이 프로젝트의 작업 중 {max}건까지만 … (이슈→작업)" },
    "lookupTruncated": { "title": "(그대로)", "description": "… {max}건까지만 … (그대로)" },
    "view": { "documents": "문서", "issues": "작업", "overview": "현황" }   // 애드온 project.tab.* → view.* (Workforce 에서 '탭'은 최상위 탭을 뜻함)
  },
  "documents": { "untitled", "uncategorized", "moreIssues": "외 {count}건", "brokenHint", "empty", "emptyFiltered",
                 "column": { "title","space","category","issues": "연결 작업","lastModified","status","actions" },
                 "filter": { "text": "제목·스페이스·작업 키 검색", "category", "status" },
                 "action": { "changeCategory", "unlink" } },
  "issues": { "empty": "이 프로젝트에 작업이 없습니다", "emptyFiltered": "문서가 없는 작업이 없습니다",
              "column": { "key","summary","status","count","actions" }, "filter": { "withoutDocuments": "문서 없는 작업만" },
              "action": { "link": "문서 연결" } },
  "overview": { "unknown","linkedDocuments","issuesWithoutDocuments": "문서 없는 작업","staleDocuments","brokenDocuments","missingRequiredCategories" },
  "docStatus": { "broken","stale","ok","unknown" },
  "docAction": { "categoryTitle","unlinkTitle","resultTitle","category","categoryIssues": "분류를 바꿀 작업","unlinkIssues": "연결을 해제할 작업","categoryMixed": "작업마다 분류가 다릅니다. 바꿀 분류를 고르세요" },
  "linkModal": { "title","resultTitle","searchPlaceholder","includeBody",
                 "space": { "label","placeholder","empty","loadFailed" },
                 "searchEmpty","searchAllSelected","searchFailed": { "title","description" },
                 "selectedDocuments": "선택한 문서 {count}건","tooManyDocuments": "한 번에 연결할 수 있는 문서는 {max}건까지입니다.",
                 "issuePlaceholder": "작업을 선택하세요","noIssues": "선택할 작업이 없습니다",
                 "step": { "documents": "① 문서","issues": "② 작업","category": "③ 분류" } },
  "result": { "allSucceeded": "작업 {count}건에 모두 적용했습니다.","someFailed": "{success}건 성공, {failed}건 실패했습니다.","success","failure",
              "reason": { "forbidden": "이 작업을 편집할 권한이 없습니다","notFound": "작업을 찾을 수 없습니다",
                          "limit": "한 작업에 연결할 수 있는 문서는 {max}건까지입니다","size": "(그대로)","unknown": "(그대로)" } },
  "settings": { "title": "문서", "description": "프로젝트 상세 「문서」 탭의 분류와 오래된 문서 기준을 정합니다.",
                "saveFailed": "설정을 저장하지 못했습니다",
                "readOnly": { "title": "읽기 전용", "description": "설정 쓰기 권한이 있는 사용자만 바꿀 수 있습니다." },
                "categories": { "title","description","empty","name","required","add" },
                "staleDays": { "title","description" } },
  "errors": {
    "SETTING_DOC_CATEGORY_LIST_INVALID": "분류 목록이 올바르지 않습니다.",
    "SETTING_DOC_CATEGORY_TOO_MANY": "분류는 30개까지 만들 수 있습니다.",
    "SETTING_DOC_CATEGORY_NAME_INVALID": "분류 이름은 1~30자로 입력해 주세요.",
    "SETTING_DOC_CATEGORY_DUPLICATED": "같은 이름의 분류가 있습니다.",
    "SETTING_DOC_STALE_DAYS_INVALID": "기준일은 1~3650 사이의 정수로 입력해 주세요."
  }
}
```

"(그대로)"는 애드온 `locales/kr/<파일>.json` 값을 글자 그대로 옮긴다는 뜻이다(구현자는 이 표기를 파일에 쓰지 않는다). 애드온 `settings.title/loadFailed/saved/viewerFailed` 는 버린다(카드 제목은 `settings.title`, 성공은 `setting.toast.success`).

작업 뒤 `cd static/ui && npm run merge` → `locales/ko-KR.json`·`en-US.json` 재생성(직접 수정 금지).

---

## 8. 테스트

### 8.1 권장: `@testing-library/react` 도입

| 항목 | 값 | 이유 |
|---|---|---|
| `@testing-library/react` | `14.3.1` (devDependencies, 고정) | React 18 지원 + `@testing-library/dom` 을 **의존성으로 동봉**(v16 은 peer 로 따로 설치해야 함). jest 27/jsdom 16 에서 동작 |
| `@testing-library/jest-dom` | `5.17.0` | v6 은 jest ≥ 28 기준(`@jest/globals`)이라 jest 27 에서 위험. v5 마지막 판 |
| `@testing-library/user-event` | 도입 안 함 | 애드온 테스트는 `fireEvent` 만 쓴다 |
| jest 업그레이드 | 하지 않음 | 애드온은 jest 30 이지만 Workforce 전체 러너 교체는 범위 밖 |

설정 변경:

- `static/ui/jest.config.js`: `setupFilesAfterEnv: ['<rootDir>/jest.setup.js']` 추가. `transformIgnorePatterns` 는 **그대로 두고**, 이식한 화면 테스트가 Atlaskit/Compiled 의 ESM 구문으로 죽을 때만 `node_modules/(?!(@forge|@atlaskit|@compiled)/)` 로 넓힌다(전 스위트 변환 비용 증가).
- `static/ui/jest.setup.js`(신규): `require('@testing-library/jest-dom');` + `TextEncoder`/`TextDecoder` 폴리필(애드온 파일 그대로 — react-router 가 로드 시 참조).
- `static/ui/__mocks__/@forge/bridge.js`: `requestConfluence: jest.fn(async () => ({ ok: true, status: 200, text: async () => '{}' }))` 추가, 기본 `requestJira` 응답에 `text: async () => '{}'` 추가(`requestCore` 는 `text()` 로 읽는다; 기존 `json` 은 유지 — 기존 테스트 무영향).
- 테스트 도우미: 애드온 `testUtils.jsx`·`testTranslator.js` 를 `pages/projectDetail/documents/__test__/testUtils.jsx`·`testTranslator.js` 로 이식(테스트 전용, 번들 제외). `renderPage` 는 `useAppContextStore` 대신 **`context` prop**(`{siteUrl:'https://example.atlassian.net', accountId:'me'}`)을 넘기도록, `usePermissionStore` 에 `canRead/canWrite` 목 상태를 넣도록 고친다. `testTranslator` 는 `@forge/i18n`(Workforce `node_modules` 에 존재)과 생성물 `locales/ko-KR.json` 을 읽으므로 **테스트 전에 merge** 가 필요하다.
- jsdom 16 에 없는 API 로 Atlaskit 컴포넌트가 실패하면 해당 컴포넌트만 목으로 바꾼다(`ProjectModal.test.jsx` 전례).

### 8.2 이식 목록

| 테스트 (애드온 → Workforce) | 건수 | RTL 필요 |
|---|---|---|
| `pages/project/__test__/documents.test.js` → `pages/projectDetail/documents/__test__/` | 25 | 아니오 |
| `filters.test.js` | 6 | 아니오 |
| `utils/confluenceApi/__test__/{cql,pageSearch,pageSearchOptions,searchOptions,spaceSearch}.test.js` → 같은 경로 | 9+10+9+23+8 | 아니오(bridge 목만) |
| `utils/jiraApi/__test__/{movesDocsProperty,movesDocsSearch,movesDocsWriter}.test.js` → 같은 경로 | 36+12+13 | 아니오 |
| `utils/queryKey/queryKeyFactories.test.js` 의 `movesDocsKeys`·`confluenceKeys` 부분 → Workforce `queryKeyFactories.test.js` 에 합침 | ~4 | 아니오 |
| 백엔드 `SettingsValidator.test.js` → `src/resolver/backoffice/setting/__test__/DocSettingValidator.test.js` | 전부 | — |
| `SettingService.test.js` 에 추가: 부분 갱신으로 `docCategories`·`docStaleDays` 저장/정규화, 잘못된 값 5종이 `findById` 전에 거부, 다른 필드만 보낼 때 문서 설정 보존, `getSettingData` 기본값 병합 | 신규 ~6 | — |
| `pages/project/__test__/ProjectPage.test.jsx` → `ProjectDocumentsPanel.test.jsx` | 11 → **8** (프로젝트 이름 기억 3건 삭제) + 신규 2(`canWrite=false` 면 연결/분류/해제 버튼 없음·자동 갱신 호출 없음, 범위 판정 실패면 Jira 호출 0) | 예 |
| `useProjectData.test.jsx` → `useProjectDocuments.test.jsx` | 1 | 예 |
| `linkModalSearch.test.jsx` | 10 | 예 |
| `modals.test.jsx` | 10 | 예 |
| `OverviewTab.test.jsx` | 5 | 예 |
| `pages/settings/__test__/SettingsPage.test.jsx` → `backoffice/page/setting/__test__/DocumentSetting.test.jsx` | 7 → 관리자 판정 관련 삭제, `canWrite('SETTINGS')` 읽기 전용·오류 코드 문구·저장 payload(두 필드만) 확인으로 재작성 | 예 |
| Workforce 기존 `pages/projectDetail/documents/__test__/movesDocs.test.js` | 삭제(대상 코드 제거) | — |

가져오지 않는 테스트: `App.license`, `license`, `licenseDecision`, `useLicenseStore`, `LicenseGuard`, `HomePage`, `ForgeHistoryRouter`, `tableSort`(Workforce 원본에 자체 테스트), `locales.test.js`, `useI18nStore.test.js`, 백엔드 `SettingsController/Service`·`ProjectService`.

### 8.3 RTL 을 도입하지 않을 때 잃는 테스트

화면·훅 테스트 **6개 파일 약 42건**: `ProjectDocumentsPanel`(상태 판정 표시, Confluence 미연결 폴백·연결 추가 차단, 이슈 조회 실패=오류 표시, 최신 제목 표시와 자동 고쳐 쓰기, 권한 실패 무시), `useProjectDocuments`(**재조회 실패가 옛 값에 가려지지 않음** — 보안 규칙 테스트), `linkModalSearch`(검색 옵션·스페이스 실패 격리·발췌 비저장), `modals`(**분류가 섞인 문서는 고르기 전 저장 불가**, **저장 중 닫기 금지**, 이슈별 결과), `OverviewTab`(null=확인 불가 표시), `DocumentSetting`. 이 중 보안 규칙 3건(재조회 실패 `isError`, 섞인 분류 저장 불가, 저장 중 닫기 금지)은 순수 로직으로 대체할 수 없어 **회귀 방어가 사라진다**. 도입하지 않는다면 최소한 이 3건은 `createRoot`+`act`+Atlaskit 목 방식으로 다시 써야 한다.

---

## 9. 제거 목록

### 9.1 Workforce 에서 지우거나 되돌릴 것 (전부 커밋 전 작업 트리 — F1)

| 대상 | 처리 |
|---|---|
| `static/ui/src/pages/projectDetail/documents/DocumentsPage.jsx` | 삭제 |
| `static/ui/src/pages/projectDetail/documents/useMovesDocsInstalled.js` | 삭제 |
| `static/ui/src/pages/projectDetail/documents/__test__/movesDocs.test.js` | 삭제(이식 테스트로 대체) |
| `static/ui/src/constants/movesDocs.js` | 삭제 |
| `static/ui/src/utils/jiraApi/requestJira.js` 의 `parseJql` 요청 항목 | 되돌림(작업 트리 diff 원복) |
| `static/ui/src/components/tabs/ProjectDetailTabs.jsx` 의 `useMovesDocsInstalled` | 되돌림 |
| `static/ui/src/constants/tabs.js` 의 `movesDocsInstalled` 인자·조건부 스프레드·`DocumentsPage` lazy | §4.4 로 교체(`PagesIcon` import 는 유지) |
| `static/ui/src/utils/jiraApi/movesDocsProperty.js` 의 읽기 전용판(`MOVES_DOCS_COUNT_ALIAS`, `normalizeMovesDocsPage`, `getIssueMovesDocsPages`, `groupMovesDocsByDocument`) | 애드온판으로 교체 |
| `static/ui/src/utils/jiraApi/movesDocsSearch.js` 의 `MOVES_DOCS_DETECT_QUERY`, `interpretMovesDocsDetection`, `detectMovesDocsInstalled`, `buildMovesDocsIssuesJql`, `fetchMovesDocsIssues` | 애드온판으로 교체 |
| `static/ui/src/utils/queryKey/movesDocsKeys.js` 의 `installed`, `documents` | 교체 |
| `locales/{kr,en}/movesDocs.json` 옛 키 | §7 로 교체 후 merge |

### 9.2 애드온에서 가져오지 않는 것

§4.1 표의 "버림" 행 전부 + §4.2. 애드온 저장소 자체는 건드리지 않는다(삭제는 사용자 결정).

---

## 10. 유지되는 보안 규칙 (애드온 감사 반영분 — 전부 유지)

| # | 규칙 | 출처 | Workforce 에서 지키는 곳 |
|---|---|---|---|
| S1 | 이슈 프로퍼티를 신뢰하지 않는다 — 읽을 때 30건, id 숫자 1~19자리, 제목·스페이스 255자, 분류 30자, `linkedAt` 날짜, `linkedBy` 계정 형식 | M-1 | `movesDocsProperty.readPages`/`normalizePage` (그대로) |
| S2 | 계약에 `url` 없음. 링크는 `/wiki/pages/viewpage.action?pageId=<id>` 로 id 에서만 조립. 옛 `url` 은 읽을 때 버림 | M-3 | `buildDocumentUrl` (그대로) |
| S3 | 최신 정보 조회 500건 상한, 넘는 문서는 "확인 불가" + 상단 알림 | M-1 | `documents.MAX_LOOKUP_PAGES`, `useProjectDocuments` |
| S4 | 검색어 문법 문자 제거, CQL 문자열 이스케이프, 문서 번호는 숫자만 | 설계 §7.2 | `cql.cleanSearchTerm`/`escapeCqlText`/`lookupIds`/`extractPageId` |
| S5 | 재조회 실패는 `isError` 로 판정(옛 값에 가려지지 않게) | 설계 | `useProjectDocuments`(그대로), 실행기가 던지는 구조(§4.3) |
| S6 | 분류가 섞인 문서는 고르기 전 저장 불가 | 설계 | `DocActionModal.initialCategoryChoice` |
| S7 | 저장 중 모달 닫기 금지(늦은 결과가 다른 작업과 섞임 방지) | 설계 | `LinkModal`·`DocActionModal` |
| S8 | 설정 저장은 서버에서 권한 강제 + 검증 | L-2 계열 | `updateSetting` = `W('SETTINGS')`(가드) + `DocSettingValidator` |
| S9 | 쓰기는 read-merge-write, 페이지 단위 병합, 빈 목록은 삭제, 값 상한 32,768 UTF-8 바이트 | 설계 §4 | `movesDocsWriter.applyLinkChange`, `buildLinkProperty` |
| S10 | 문서 탭 조회는 프로젝트 범위 판정(`findProjectById`) 통과 뒤에만, 탭은 `PROJECT read` | L-4 | `ProjectDocumentsPanel` `enabled`, `tabs.js canRender` |
| S11 | 조회 결과 접근은 `Object.hasOwn`(프로토타입 키 방어) | L-3 | `documents.resolveDocStatus`/`groupByDocument` |
| S12 | 「문서 연결」은 "Confluence 검색 가능"에 묶는다(저장값 한 건이 연결 기능 전체를 끄지 못하게 — id 형식 강제와 짝) | M-1 | `useProjectDocuments.latestAvailable` |
| S13 | 검색 결과의 발췌(`excerpt`)는 표시용, 프로퍼티에 저장하지 않음 | 설계 §7.2 | `LinkModal.save` 의 필드 선택 |
| S14 | 운영 빌드 소스맵 제외 | L-1 | Workforce 빌드 설정 확인 항목(작업 분해 F-14) |

애드온 전용이라 흡수 뒤 해당이 없어지는 조치: M-2(사용자별 프로젝트 기억), L-5(주소 이름 기억), I-3(`accountId` 없는 호출 거부 — Workforce 가드가 이미 처리), I-8(가드 계약 테스트 — Workforce `permissionMap.contract.test.js` 가 대응), L-2(오류 메시지 — Workforce 가드 직렬화 규약을 따름).

---

## 11. 배포 뒤 실측 항목 (애드온 DESIGN §10 재분류)

**남는 것:**

| # | 가정 | 다르면 |
|---|---|---|
| P2 | 문자열 배열(`pageIds`·`categories`)과 숫자(`count`)가 별칭으로 색인된다 | 색인 경로 변경(화면 동작엔 영향 없음 — JQL 사용자 한정) |
| P3 | Jira 전역 페이지 안에서 `requestConfluence`(bridge 5.10.2)가 동작한다, Confluence 미설치 사이트에서는 **던지거나 4xx** 로 온다(→ 폴백) | 백엔드 `asUser().requestConfluence` resolver 로 이동(설계 변경) |
| P5 | `search:confluence` 하나로 `/wiki/rest/api/search` 가 열린다 | `read:confluence-content.summary` 추가(= 또 한 번의 메이저) |
| P6 | 팀 관리형 프로젝트에서도 `search/jql` 의 `properties` 동봉이 된다 | 이슈별 개별 조회 폴백 |
| P7 | 제목 검색(`title ~ "검색어*"`)이 한글·여러 단어에서 쓸 만하다 | `buildSearchCql` 조합 변경 |
| P8 | 검색 응답 필드(`content.id`, `resultGlobalContainer.title`, `lastModified`)가 설계와 같다 | `cql.toPageInfo` 한 곳 |
| P10 | `type = space` 검색으로 스페이스를 가져오고 `space.key`·`space.name` 이 있다 | `cql.toSpaceInfo` 한 곳, 안 되면 스페이스 선택 제거 |
| P11 | 본문 검색(`text ~`)이 한글에서 동작하고 관련도 순이며 `excerpt` 가 온다 | `buildSearchCql`·`cleanExcerpt` |
| P14 | `/wiki/pages/viewpage.action?pageId=<id>` 가 해당 문서로 열린다 | `buildDocumentUrl` 한 곳 |

**사라지는 것:** P1(`jql/parse` 설치 감지 — 감지 자체가 없음), P4(앱 간 이동), P9(번역 전달 — Workforce 는 manifest `translations` 로 이미 운영 중), P12·P13(라이선스 — Workforce 판정·평가판 배너를 그대로 씀).

**새로 생기는 것(흡수 때문에):**

| # | 가정 | 다르면 |
|---|---|---|
| W1 | 다중 제품 호환을 켠 메이저 버전으로 올려도 **Confluence 가 없는 기존 설치**가 재승인 뒤 정상 동작하고, `context.license` 판정이 이전과 같다 | 배포 보류·Atlassian 문의(비가역이라 dev 환경에서 먼저 확인) |
| W2 | KVS `settings.docCategories`(`type: any`)에 객체 배열과 **빈 배열**을 저장할 수 있다 | 빈 배열이면 속성 생략 후 읽기에서 `[]` 로 보충 |

---

## 12. 문서

### 12.1 정본: `static/ui/src/pages/projectDetail/documents/DOCUMENTS.md` (신설, `work/WORK_VIEWS.md` 전례)

애드온 `docs/DESIGN.md` 에서 옮길 절:

| DOCUMENTS.md 절 | 애드온 원문 | 손질 |
|---|---|---|
| §1 개요·구조 | §1 일부, §3 | 두 앱 구조도 → "Workforce 문서 탭 ↔ Jira 이슈 프로퍼티 ↔ Confluence 검색" 단일 구조로 다시 그림. 콘텐츠 프로퍼티를 쓰지 않는 이유 유지 |
| §2 계약 — 이슈 프로퍼티 `movesDocs` | §4 전체(색인 선언 포함) | "두 저장소" 표현 삭제, 색인 선언 위치를 Workforce manifest 로 |
| §3 Jira·Confluence 호출 | §7.1 마지막 줄, §7.2 전체 | 실행기 결정(§4.3 요약)과 "문서 모듈 전용" 규칙 추가 |
| §4 스냅샷 갱신 | §7.3 | "PROJECT write 일 때만" 추가 |
| §5 설정 | §7.4 의 기본값·검증 두 줄 | `getSettingData`/`updateSetting` 계약(본 설계서 §3.1·3.2)으로 교체 |
| §6 화면 | §7.5 | 경로를 탭+`?view=` 로, 홈·`/settings` 삭제, 권한 게이트 표(§4.8) 추가 |
| §7 알려진 한계 | §9 | 두 앱 관련 행(Docs 제거 시 탭 숨김, Docs 라이선스 비활성인데 탭 보임, 운영 라이선스 미수신) 삭제. "라이선스가 비활성일 때 백엔드가 막는 것" 행은 Workforce 기준으로 다시 씀(직접 호출은 백엔드 판정 밖). "Workforce 탭 제목이 옛 값" 행은 "쓰기 권한 없는 사람만 여는 프로젝트는 스냅샷이 갱신되지 않는다"로 교체 |
| §8 실측 | §10 | 본 설계서 §11 표로 교체 |
| §9 보안 규칙 | SECURITY_AUDIT §0 | 본 설계서 §10 표 |

옮기지 않는 절: §2(두 앱 플랫폼 제약 — 호환 결정 한 줄만 §1 로), §5·§6(이동·설치 감지), §7.1(애드온 manifest), §7.6(i18n — CLAUDE.md 규칙으로 충분), §7.7(라이선스), §8(옛 Workforce 탭).

### 12.2 `CLAUDE.md` 추가 초안

**「도메인 상세 문서」 목록에 추가**

```markdown
- `static/ui/src/pages/projectDetail/documents/DOCUMENTS.md` — 문서 탭(Confluence 문서 연결·분류·현황), 이슈 프로퍼티 `movesDocs` 계약, Confluence 호출 규칙
```

**「주요 페이지 구조」 `projectDetail/` 목록에 추가**

```markdown
  - `documents/` — 문서 (Confluence 문서 연결·분류·해제 + [문서 | 작업 | 현황] `?view=` 전환, 백엔드 없음)
```

**「Forge 앱 특이사항」에 추가**

```markdown
- **다중 제품 호환**: `app.compatibility` = Jira 필수 + Confluence 선택(2026-09-30, **되돌릴 수 없음**). Confluence 가 없는 사이트에서도 앱은 동작하고 문서 탭만 읽기 폴백.
- **Confluence 스코프는 `search:confluence` 하나**다. 문서 탭의 Confluence 호출은 `/wiki/rest/api/search` 뿐(검색·id 조회·스페이스 목록·가용성). 다른 Confluence 주소를 쓰면 스코프 추가 = 메이저 버전 + 관리자 재승인.
- **문서 탭 규칙** (`pages/projectDetail/documents/`):
  - 이슈 프로퍼티 `movesDocs` 는 읽기 `utils/jiraApi/movesDocsProperty.js`(`readPages`), 쓰기 `movesDocsWriter.js`(read-merge-write)만 거친다. 인라인 `issue.properties.movesDocs` 접근 금지. 계약에 `url` 없음 — 링크는 page id 로만 조립.
  - Jira·Confluence 를 **프론트에서 사용자 자격으로 직접** 부른다 → 서버 가드·`PermissionMap`·라이선스 판정이 닿지 않는다. 게이트는 화면에만 있다(읽기 `PROJECT read` + `findProjectById` 범위 판정 뒤 조회, 쓰기 `canWrite('PROJECT')`).
  - 호출 실행기는 `utils/requestCore.js` 기반(`movesDocsRequest.js`, `confluenceApi/requestConfluence.js`) — **실패를 던진다**. 기존 `requestJira.js` 의 `executeRequest`(실패 = 값)와 섞지 말 것(빈 본문 2xx 를 실패로 보고, 404 를 "없음"으로 못 본다).
  - 설정(분류·기준일)은 `settings` 엔티티 `docCategories`·`docStaleDays` — `getSettingData`/`updateSetting` 확장, 새 resolver 없음.
```

**「서버 상태 (React Query)」 팩토리 목록에 `movesDocsKeys`, `confluenceKeys` 추가.**

**「기술 스택」 테스트 항목(도입 시):** `@testing-library/react` 14 + `jest-dom` 5(jest 27 호환 고정).

---

## 13. 구현 작업 분해

### Backend

- [ ] B-1 `manifest.yml`: §2.1 `compatibility`, §2.2 `settings.docCategories(any)`·`docStaleDays(integer)`, §2.3 `jira:entityProperty` 항목, §2.4 `search:confluence` — **B-2~B-4 와 같은 커밋·같은 배포**(F7)
- [ ] B-2 `SettingDefaults.js` 기본값 2개
- [ ] B-3 `DocSettingValidator.js` 신규(애드온 규칙 이식) + `ErrorCodes` 5개
- [ ] B-4 `SettingService.updateSettingService` 입력 2개·검증(findById 전)·병합
- [ ] B-5 테스트: `DocSettingValidator.test.js`(애드온 테스트 이식), `SettingService.test.js` 보강(§8.2)
- [ ] B-6 (선택) `ResourceCatalog` `PROJECT.covers` 에 `'프로젝트 문서 탭'`
- [ ] B-7 루트 `npm test` 통과(권한 계약 테스트 무변화 확인)

### Frontend

- [ ] F-1 작업 트리 되돌림·삭제(§9.1)
- [ ] F-2 `utils/requestCore.js`, `utils/jiraApi/movesDocsRequest.js`(요청 맵 4개, export `executeMovesDocsRequest`), `utils/confluenceApi/*` 이식
- [ ] F-3 `utils/jiraApi/movesDocsProperty.js`·`movesDocsSearch.js` 교체, `movesDocsWriter.js` 이식(import 경로만 수정)
- [ ] F-4 `utils/queryKey/movesDocsKeys.js` 교체, `confluenceKeys.js` 이식
- [ ] F-5 `components/lozenge/StatusLozenge.jsx` `DocStatusLozenge` + `statusAppearance.js` `DOC_STATUS_APPEARANCE`
- [ ] F-6 `pages/projectDetail/documents/`: `documents.js`, `filters.js`, `links.js`, `LoadError.jsx`, `documents.css`, `IssueResultList.jsx`, `LinkModal.jsx`, `DocActionModal.jsx`, `DocumentsTab.jsx`, `IssuesTab.jsx`, `OverviewTab.jsx` 이식(번역 키 `movesDocs.*`, `common.button.*`, 용어 치환, `canWrite` prop)
- [ ] F-7 `useDocsSettings.js`(§4.5), `useProjectDocuments.js`(§4.6 변경점 3개)
- [ ] F-8 `ProjectDocumentsPanel.jsx`(§4.4)
- [ ] F-9 `constants/tabs.js`·`ProjectDetailTabs.jsx`(§4.4)
- [ ] F-10 `backoffice/page/setting/DocumentSetting.jsx` + `SettingPage.jsx` 에 카드 추가(§4.7)
- [ ] F-11 `locales/kr|en/movesDocs.json` 재작성(§7) → `npm run merge`
- [ ] F-12 테스트 환경: devDeps(`@testing-library/react@14.3.1`, `@testing-library/jest-dom@5.17.0`), `jest.setup.js`, `jest.config.js` `setupFilesAfterEnv`, bridge 목 보강(§8.1)
- [ ] F-13 테스트 이식(§8.2) — `cd static/ui && npm test`
- [ ] F-14 `CI=true npm run build` 통과, 번들 예산 경고 확인(문서 탭은 lazy 청크), 운영 빌드 소스맵 설정 확인(S14)
- [ ] F-15 `DOCUMENTS.md` 작성(§12.1), `CLAUDE.md` 보강(§12.2)

### 검증 포인트 (integration-verifier 용)

- `getSettingData` 응답의 `docCategories`/`docStaleDays` ↔ `useDocsSettings` 매핑(`categories`/`staleDays`), `updateSetting` 응답 `content.settings` ↔ `DocumentSetting` 반영.
- `settingKeys.detail()` 을 공유하는 22개 파일이 새 필드 추가로 깨지지 않는지(추가만 있으므로 무영향 예상).
- **급여 정책 저장이 새 attributes 선언 없이 422 가 나지 않도록** manifest 와 코드가 한 배포인지(F7).
- 문서 탭 모듈이 Workforce `requestJira.js` 의 `executeRequest` 를 import 하지 않는지(grep).
- `canWrite('PROJECT')=false` 에서 쓰기 버튼·자동 갱신이 모두 꺼지는지, 형제 경로(이슈 뷰 행 버튼) 포함.
