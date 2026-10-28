# Moves Workforce Docs — 설계서 v1.0

> 작성 2026-09-29. Moves Workforce 프로젝트의 이슈에 Confluence 문서를 연결·분류·관리하는 **별도 Forge 앱**.
> 이 문서가 두 저장소(`moves-workforce-docs`, `moves-workforce`)가 공유하는 **계약의 정본**이다.

## 1. 확정 사항

| 항목 | 결정 |
|---|---|
| 제품명 | Moves Workforce Docs |
| 형태 | Workforce와 별개의 Forge 앱(별도 설치·별도 과금 단위) |
| 범위 | 문서↔이슈 연결, 분류, 현황 관리 |
| 범위 밖 | 이슈 없이 프로젝트에 직접 붙는 문서, 폴더/순서 관리, 문서 세트 생성, Confluence 쪽 화면 |
| Workforce 쪽 | 프로젝트 상세 「문서」 탭(읽기 전용) + 「문서 관리 열기」 버튼 |

## 2. 플랫폼 제약 (2026-09-29 공식 문서·커뮤니티 확인)

- Forge 앱 사이에는 직접 호출·저장소 공유·설치 여부 조회 수단이 없다. 두 앱이 만날 수 있는 곳은 Jira/Confluence의 엔티티 프로퍼티뿐이다.
- 한 앱이 다른 앱 화면에 탭을 넣을 수 없다. 탭 코드는 Workforce 본체에 있어야 한다.
- Workforce는 Jira 스코프만 가진다. Confluence를 읽지 못하므로 **문서 제목·URL은 Jira 쪽에 스냅샷으로 실려 있어야** 탭에 표시할 수 있다.
- 다중 제품 호환(`app.compatibility`)은 Preview 단계이고 유료 등록만 가능하며 켜면 되돌릴 수 없다. Workforce Docs(신제품)에만 적용한다.

## 3. 구조

```
┌─ Moves Workforce (Jira) ───────────────┐      ┌─ Moves Workforce Docs (Jira 필수 + Confluence 선택) ─┐
│ 프로젝트 상세 > 「문서」 탭 (읽기 전용) │      │ jira:globalPage                                │
│   · JQL + properties=movesDocs      │      │   /project/:id  문서 | 이슈 | 현황             │
│   · 「문서 관리 열기」 ─ router.navigate ─────▶ │   /settings     분류·기준일                    │
└───────────────▲────────────────────────┘      │ requestJira(asUser)  requestConfluence(asUser) │
                │ 읽기                           └──────────────┬─────────────────────────────────┘
                │                                               │ 쓰기(read-merge-write)
        ┌───────┴───────────────────────────────────────────────▼──────┐
        │ Jira 이슈 프로퍼티 `movesDocs`  ← 연결 정보의 단일 출처    │
        └──────────────────────────────────────────────────────────────┘
```

Confluence 콘텐츠 프로퍼티는 쓰지 않는다. 같은 연결을 두 곳에 쓰면 트랜잭션이 없어 어긋나고, Confluence 쓰기 스코프도 필요해진다.

## 4. 계약 ① — 이슈 프로퍼티 `movesDocs`

이슈 하나에 프로퍼티 하나. 이슈는 Workforce 프로젝트 하나에만 속하므로(`moves_RMS_projectId` 단일 값) 프로젝트별 분리는 필요 없다.

```jsonc
{
  "v": 1,
  "projectId": "42",                 // 연결 당시 Workforce 프로젝트 id (문자열)
  "pages": [
    {
      "id": "123456",                // Confluence 페이지 id (문자열)
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

규칙:

- `pageIds`·`categories`·`count`는 `pages`에서 **파생**한다. 조립은 `buildLinkProperty(projectId, pages)` 한 함수만 한다(`static/ui/src/utils/jiraApi/movesDocsProperty.js`).
- `pages`가 비면 프로퍼티를 **삭제**한다(빈 값 저장 금지). 그래야 `count > 0` 없이도 부재로 판정된다.
- 이슈당 최대 **30건**(`MAX_PAGES_PER_ISSUE`). 프로퍼티 값 상한 32,768은 **UTF-8 바이트**로 잰다(Jira 문서가 글자 수인지 바이트 수인지 밝히지 않아 엄격한 쪽을 택했다. 한글은 글자당 3바이트).
- 같은 페이지를 한 이슈에 두 번 넣지 않는다(`id` 기준 중복 제거, 나중 값이 이긴다).
- **문서 주소는 저장하지 않는다.** 링크는 양쪽 모두 id로 조립한다: `siteUrl + "/wiki/pages/viewpage.action?pageId=" + id`. 저장된 경로를 링크에 쓰면 이슈 편집 권한자가 `/../..` 같은 값으로 같은 사이트의 임의 주소를 열게 만들 수 있다(보안 감사 M-3).
- **읽을 때도 계약을 강제한다**(보안 감사 M-1). 저장된 값은 이슈 편집 권한자가 우리 앱 밖에서도 쓸 수 있는 신뢰할 수 없는 입력이다. 읽는 쪽(두 저장소 모두)은 앞에서부터 30건까지만 받고, `id`는 숫자 1~19자리만, 제목·스페이스 이름은 255자·분류는 30자까지만 받는다(넘는 글자는 잘라 낸다). `linkedAt`은 날짜로 읽히는 값만, `linkedBy`는 계정 id 형식만 받는다.
- 쓰기는 항상 read-merge-write. 읽은 뒤 다른 사용자가 바꿨을 수 있으므로 **병합은 페이지 단위**로 한다(추가는 upsert, 해제는 해당 id만 제거). 이것은 화면이 들고 있던 옛 목록으로 덮어쓰는 것을 막을 뿐, 동시 쓰기를 완전히 막지는 못한다(§9).
- 쓰기 권한은 Jira가 판정한다. 사용자 자격(`asUser`)으로 쓰므로 이슈 편집 권한이 없으면 403이고, 화면은 그 이슈를 실패로 표시한다.

### 색인 선언 (Workforce Docs manifest)

```yaml
jira:entityProperty:
  - key: moves-workforce-docs-entity-property
    entityType: issue
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

## 5. 계약 ② — Workforce → Workforce Docs 이동

```
router.navigate(`/jira/apps/${MOVES_DOCS_APP_ID}/${MOVES_DOCS_ENV_ID}/project/${projectId}?name=${encodeURIComponent(projectName)}`)
```

- Workforce Docs는 `view.createHistory()`의 `location`에서 경로와 `name`을 읽는다.
- `name`을 받으면 자기 저장소(KVS)에 `{projectId, name}`을 기억해 홈 목록에 쓴다.
- `MOVES_DOCS_APP_ID`·`MOVES_DOCS_ENV_ID`는 `forge register`·`forge deploy` 뒤에 정해진다. Workforce는 환경별 상수로 두고, **값이 없으면 버튼을 숨긴다**.

## 6. 계약 ③ — 설치 감지 (Workforce)

```
POST /rest/api/3/jql/parse?validation=strict   { "queries": ["movesDocsCount > 0"] }
```

- 응답의 해당 쿼리에 `errors`가 없으면 Workforce Docs가 설치된 것으로 본다(`movesDocsCount`는 Workforce Docs가 선언한 별칭).
- 설치되지 않았으면 탭을 숨긴다. 호출 자체가 실패하면(네트워크·5xx) **숨김**으로 둔다.
- 세션당 1회만 확인한다(react-query `staleTime: Infinity`).

## 7. Workforce Docs 앱

### 7.1 manifest 요점

```yaml
modules:
  jira:globalPage:
    - key: moves-workforce-docs
      resource: main
      resolver: { function: resolver }
      title: Moves Workforce Docs
      layout: blank
  jira:entityProperty: (§4)
  function:
    - key: resolver
      handler: index.handler
resources:
  - key: main
    path: static/ui/build
app:
  runtime: { name: nodejs22.x, memoryMB: 256, architecture: arm64 }
  id: <forge register 가 채운다>
  licensing: { enabled: true }        # 유료 앱. 화면 모듈에 displayConditions 로 라이선스를 걸지 않는다(§7.7)
  compatibility:
    jira: { required: true }
    confluence: { required: false }
permissions:
  scopes:
    - storage:app
    - read:jira-work
    - write:jira-work
    - search:confluence
  content:
    styles: [unsafe-inline]
translations:
  resources:
    - { key: en-US, path: locales/en-US.json }
    - { key: ko-KR, path: locales/ko-KR.json }
  fallback: { default: en-US }
```

Confluence 호출은 `/wiki/rest/api/search` 하나뿐이라 스코프도 `search:confluence` 하나다.

### 7.2 Jira·Confluence 호출 (전부 프론트, 사용자 자격)

요청 정의는 `static/ui/src/utils/jiraApi/requestJira.js`·`utils/confluenceApi/requestConfluence.js` 의 요청 맵에 둔다(Moves Workforce 와 같은 방식). 호출이 실패하면 값을 돌려주지 않고 **던진다** — 화면이 조회 실패와 0건을 구분한다.

| 용도 | 호출 |
|---|---|
| 프로젝트 이슈 목록 | `POST /rest/api/3/search/jql` — jql `moves_RMS_projectId = "<id>"`, `fields: [summary,status,issuetype,assignee]`, `properties: [movesDocs]`, `nextPageToken` 끝까지(상한 2,000건, 넘으면 화면에 잘렸다고 표시) |
| 프로퍼티 읽기 | `GET /rest/api/3/issue/{key}/properties/movesDocs` (404 = 없음) |
| 프로퍼티 쓰기 | `PUT` 같은 경로 / 비면 `DELETE` |
| 문서 검색 — 제목만(기본) | `GET /wiki/rest/api/search?cql=type = page AND title ~ "<검색어>*" ORDER BY lastmodified DESC&limit=20` |
| 문서 검색 — 본문 포함 | `GET /wiki/rest/api/search?cql=type = page AND (title ~ "<검색어>*" OR text ~ "<검색어>")&limit=20` — **정렬을 붙이지 않는다** |
| 스페이스 목록 | `GET /wiki/rest/api/search?cql=type = space&limit=25`, 입력하면 `type = space AND title ~ "<입력>*"` — 문서 검색과 **같은 API** |
| 문서 최신 정보 | `GET /wiki/rest/api/search?cql=id in (<id...>)&limit=50` — id 50개씩 끊어서 |

- 검색어에서 검색 문법 문자(`+ - & | ! ( ) { } [ ] ^ " ~ * ? : \ /`)는 공백으로 바꾼다. 제목에 흔한 `[회의록]`·`(초안)` 같은 표기가 조회를 깨뜨리지 않게 하기 위함이다. 페이지 주소를 붙여 넣으면 `/pages/(\d+)`에서 id를 뽑아 `id = <id>`로 찾는다.
- 검색 결과에서 쓰는 필드: `content.id`, `content.title`(없으면 `title`), `resultGlobalContainer.title`, `lastModified`. 본문 포함일 때는 `excerpt` 도 쓴다. `url`은 쓰지 않는다(링크는 id로 만든다).
- **최신 정보 조회는 문서 500건까지만**(50개씩 10회, `MAX_LOOKUP_PAGES`). 넘는 문서는 조회하지 않고 "확인 불가"로 표시하며 화면 상단에 알린다. 이슈 편집 권한자가 우리 앱 밖에서 값을 부풀려도 열람자의 Confluence 호출이 이 이상 나가지 않게 하기 위함이다.
- **본문 포함**: 기본은 꺼짐(제목만). 켜면 본문까지 찾고 정렬을 붙이지 않는다 — 본문 검색은 관련도 순이 맞고, 최근 수정 순으로 정렬하면 제목이 정확히 일치하는 문서가 아래로 밀린다. 결과의 본문 발췌(`excerpt`)를 제목 아래에 보여 준다. 발췌에 섞여 오는 강조 표식(`@@@hl@@@`, `@@@endhl@@@`)은 걷어내고, 발췌가 없으면 그 줄을 그리지 않는다. 발췌는 **화면 표시용**이고 이슈 프로퍼티에는 저장하지 않는다(§4 불변).
- **스페이스 선택**: 고른 스페이스가 있으면 검색식에 `AND space in ("KEY1","KEY2")` 를 붙인다(정렬이 있으면 그 앞). 키는 검색식 문자열로 이스케이프한다 — 개인 스페이스 키는 `~` 로 시작한다. 비어 있으면 전체 스페이스.
- **스페이스 목록**은 문서 검색과 같은 검색 API 로 가져온다. 스코프가 `search:confluence` 하나이므로 스페이스 전용 API 는 쓰지 않는다. 선택 창을 열면 처음 25건, 입력하면 이름으로 다시 찾는다(입력에도 문법 문자 정리를 적용한다). 결과에서 쓰는 필드는 `space.key`, `space.name`(없으면 `title`)이고 키가 없는 결과는 버린다. 목록 조회가 실패해도 문서 검색은 막지 않는다 — 선택 영역에 실패를 표시하고 전체 스페이스로 검색되게 둔다.
- 페이지 주소를 붙여 넣은 경우는 본문 포함·스페이스 선택을 **무시**하고 `id = <id>` 로 찾는다.
- 검색식 조립은 `utils/confluenceApi/cql.js` 의 `buildSearchCql({ term, includeBody, spaceKeys })` 한 곳에서 한다. 검색 옵션은 쿼리 키에도 들어간다(빠지면 옵션을 바꿔도 옛 결과가 보인다).
- **최신 정보 조회에서 돌아오지 않은 id = 끊긴 링크**(삭제됐거나 이 사용자에게 권한이 없음). 둘을 구분할 수 없으므로 문구는 "문서를 찾을 수 없거나 볼 권한이 없습니다"로 한다.
- Confluence가 연결되지 않았거나 호출이 실패하면 화면 상단에 안내를 띄우고, 저장된 스냅샷만으로 목록을 그린다(연결 추가만 막는다).

### 7.3 스냅샷 갱신

프로젝트 화면을 열 때 최신 정보를 조회해 제목·주소·스페이스가 스냅샷과 다르면 해당 이슈 프로퍼티를 고쳐 쓴다.
- 편집 권한이 없어 실패하면 **조용히 넘어간다**(화면은 최신 값으로 표시).
- 한 번 열 때 고쳐 쓰는 이슈는 최대 20건.

### 7.4 백엔드 resolver (KVS만 사용)

| resolver | 입력 | 응답 | 권한 |
|---|---|---|---|
| `getSettings` | - | `{ success, settings: { categories: [{name, required}], staleDays } }` | 누구나 |
| `saveSettings` | `{ settings }` | `{ success, settings }` | Jira 관리자 |
| `listProjects` | - | `{ success, projects: [{projectId, name, seenAt}] }` | 본인 기록만 |
| `touchProject` | `{ projectId, name }` | `{ success }` | 본인 기록만 |
| `getViewer` | - | `{ success, isAdmin }` | 누구나 |

- 실패 응답은 Moves Workforce 와 같은 `{ success:false, error:{ name, code, message, cause } }`. 화면은 `error.code` 로 문구를 고른다.
- resolver 등록은 `src/permission/permissionGuard.js` 의 `guardedDefine`, 권한 선언은 `src/permission/PermissionMap.js`. 선언하지 않은 함수는 거부한다(`PERMISSION_UNMAPPED`). 권한 수준은 둘이다 — 누구나(`PUBLIC`) / Jira 관리자(`JIRA_ADMIN`). 「본인 기록만」은 가드가 아니라 서비스가 `principal.accountId` 로 좁힌다.
- 관리자 판정: `asUser` `GET /rest/api/3/mypermissions?permissions=ADMINISTER` (`src/api/jira/user/UserApi.js`). 확인이 실패하면 거부다.
- KVS 키: `settings`, `projects:<accountId>`(사용자당 키 **하나**, 값은 목록). 접근은 `XxxRepository.js` → `src/nosql/query/KeyValueManager.js` 를 거친다(단순 키-값, 엔티티 선언 없음, 접두사 조회 없음). 프로젝트 기억은 **사용자별**이다 — Workforce가 소속 프로젝트만 보이게 제한할 수 있으므로 사이트 전체가 공유하면 남의 프로젝트 이름이 보인다. 사용자를 모르면 저장·조회하지 않는다(가드가 `accountId` 없는 호출을 거부한다). 사용자당 최대 **100건**까지 기억하고, 넘으면 가장 오래전에 연 것부터 빠진다. 목록이 값 하나라 동시에 여러 번 불러도 이 수를 넘지 못한다(프로젝트마다 키를 두던 처음 설계는 동시 호출로 상한이 뚫려 바꿨다 — 보안 감사 M-2). **빈 문자열은 저장하지 않는다**(KVS가 거부).
- 기억은 주소로 받은 이름을 **그 프로젝트의 이슈가 실제로 조회된 뒤에만** 저장한다. 주소를 열기만 해도 저장하면 링크 하나로 남의 홈 목록에 아무 이름이나 심을 수 있다(보안 감사 L-5).
- 실패 응답의 `message`에는 우리가 던진 오류(`LogicalError`·`PermissionError`·`ForgeAPIError`)의 코드만 실린다. 예상 못 한 오류(저장소 내부 오류 등)는 `UNKNOWN_ERROR`로 바꾸고 원문을 내보내지 않는다. `cause`는 항상 빈 값이다. 화면은 `error.code`로만 문구를 고른다.
- 설정 기본값: 분류 `기획`·`설계`·`회의록`·`산출물`·`기타`(필수 없음), `staleDays` 90.
- 검증: 분류 이름 1~30자·중복 불가·최대 30개, `staleDays` 1~3650 정수.

### 7.5 화면

`/` 홈 — 내가 열어 본 프로젝트 목록. 비어 있으면 "Moves Workforce 프로젝트 상세의 문서 탭에서 들어오세요" 안내.

`/project/:id` — 헤더(프로젝트 이름, 「문서 연결」 버튼) + 탭 3개

| 탭 | 내용 |
|---|---|
| 문서 | 페이지 기준 목록. 열: 제목(새 창), 스페이스, 분류, 연결 이슈, 최종 수정일, 상태. 필터: 분류·검색어. 행 동작: 분류 변경, 연결 해제 |
| 이슈 | 이슈 기준 목록. 열: 키, 요약, 상태, 문서 수. 필터: 문서 없는 이슈만. 행 동작: 이 이슈에 문서 연결 |
| 현황 | 카드: 연결 문서 수, 문서 없는 이슈, 오래된 문서, 끊긴 링크, 누락된 필수 분류. 카드를 누르면 해당 필터가 걸린 목록으로 이동 |

「문서 연결」 모달 — ① 문서 검색·선택(여러 개) ② 이슈 선택(여러 개, 프로젝트 이슈 중) ③ 분류 선택 → 저장. 이슈별 성공·실패를 결과로 보여 준다.

① 문서 검색에는 옵션이 둘 있다(§7.2).
- **스페이스**(여러 개 선택, 검색 입력 위): 비워 두면 전체 스페이스.
- **본문 포함**(검색 입력 옆, 기본 꺼짐): 켜면 검색 결과의 제목 아래에 본문 발췌를 두 줄까지 보여 준다.

옵션은 창을 여는 동안만 유지한다 — 최근 검색어·선택 기억·결과 더 보기는 없다.

`/settings` — 분류 목록(이름, 필수 여부)과 오래된 문서 기준일. 관리자가 아니면 읽기 전용.

상태 판정(한 문서에 하나, 위가 우선):
1. `끊김` — 최신 정보 조회에서 돌아오지 않음
2. `오래됨` — 최종 수정일이 `staleDays`일보다 이전
3. `정상`

누락된 필수 분류 = 설정에서 `required: true`인 분류 중 이 프로젝트에 연결 문서가 0건인 것.

### 7.6 i18n

문구 원본은 루트 `locales/kr/*.json`·`locales/en/*.json`(기능 단위 파일)이다. `locales/script/merge.js` 가 이를 합쳐 `locales/ko-KR.json`·`en-US.json` 을 만들고, manifest `translations` 가 그 두 파일을 가리킨다(Moves Workforce 와 같은 방식). 화면은 `stores/useI18nStore` 의 `t()` 로 읽고 치환 변수는 `utils/i18n.js` 의 `tFormat` 으로 채운다.

언어는 `view.getContext().locale`(ko로 시작하면 한국어, 아니면 영어). 화면 문구를 코드에 직접 쓰지 않는다 — 예외는 번역을 받기 전에 앱 시작이 실패했을 때 쓰는 영어 기본 문구 둘뿐이다.

### 7.7 라이선스

이 앱은 Jira 와 Confluence 에 함께 설치되는 형태라 마켓에 유료로만 등록할 수 있다. 유료 앱의 라이선스 검사는 앱이 직접 한다 — 없으면 결제하지 않은 설치도 전부 쓸 수 있다. 방식은 Moves Workforce 와 같다.

**판정.** `context.license` 하나만 본다. 화면은 `view.getContext()`, 백엔드는 resolver 의 `req.context` 에서 읽는다.

| 상황 | 상태 | 동작 |
|---|---|---|
| `license.active === true` | `ACTIVE` | 통과 |
| `license.active === false` | `INACTIVE` | **차단** |
| 라이선스 정보 없음 + 환경이 development·staging | `NOT_APPLICABLE` | 통과 |
| 그 밖(운영 환경인데 정보 없음, 모르는 환경, 형태가 이상한 값, 컨텍스트 조회 실패) | `UNAVAILABLE` | 통과 |

- **차단은 명시적으로 비활성일 때뿐이다.** 라이선스 정보가 없는 경우(개발 환경, 터널, 마켓 미등록, 활성화 전)를 차단하면 개발 환경이 전부 잠기고, 정보가 비어 온 한 번이 앱 전면 정지가 된다.
- 환경보다 명시값이 우선한다. 개발 환경이어도 `active: false` 면 차단한다(라이선스 상태를 지정해 설치한 경우).
- **화면과 백엔드는 같은 경계를 쓴다.** 다르면 "서버는 응답하는데 화면만 안내 페이지"가 되거나 그 반대가 된다. 두 쪽은 별도 패키지라 코드를 공유하지 못하므로 **같은 입력표**(`test/license/licenseDecisionTable.json`)를 양쪽 테스트가 통과한다. 규칙을 바꾸면 표부터 고친다.
- manifest 의 화면 모듈에 `displayConditions` 로 라이선스를 걸지 않는다. 걸면 미결제 시 화면 자체가 사라져 구매 안내를 띄울 수 없다.

**백엔드.** 공통 래퍼(`src/utils/ResponseWrapper.js`) 한 곳에서 확인한다. 모든 resolver 가 `guardedDefine` → 이 래퍼를 지나므로 빠지는 함수가 없다. 비활성이면 권한 확인·저장소 조회보다 먼저 거부하고 실패 응답의 코드는 `LICENSE_INACTIVE` 다(Workforce 와 같다).

**화면.** 앱 시작 때 판정한다(테마 → 사용자 정보 → 번역 → **라이선스** → 경로 기록). 비활성이면 앱 화면 대신 안내 페이지만 그린다 — 앱 화면을 그리지 않으므로 어떤 조회도 시작되지 않는다. 구매 버튼은 마켓 주소(`pages/license/licenseConstants.js` 의 `MARKETPLACE_URL`)가 있을 때만 그린다. 마켓 등록 전이라 지금은 비어 있다.

**평가판 만료 임박 안내.** 조건은 Workforce 와 같다: `license.active === true` 이고 `license.isEvaluation === true` 이며 만료일까지 0~7일. 만료일은 `evaluationEndDate` → `subscriptionEndDate` → `trialEndDate` 순으로 처음 있는 값을 쓴다. 닫으면 브라우저에 기억하고(만료일이 키에 들어간다), 만료일이 바뀌면 다시 보인다. 앱 화면의 내용 위에 놓는다.

**가져오지 않은 것.** Workforce 는 예약 작업·큐를 위해 라이선스를 직접 조회하는 기능(License API + 캐시)이 있고, 운영 환경에서 `context.license` 가 없을 때도 그것으로 확정한다. 이 앱에는 예약 작업·큐가 없어 가져오지 않았다. 그래서 **운영 환경에서 라이선스 정보가 오지 않으면 통과**한다(§9, §10 P12).

## 8. Workforce 「문서」 탭

프론트 전용(resolver 없음 — `PermissionMap` 변경 없음).

- 위치: 프로젝트 상세 최상위 탭, 키 `documents`, lazy 로드(`CommonTab`의 Suspense 경계 아래).
- 노출: 설치 감지(§6) 통과 시에만.
- 내용: `moves_RMS_projectId = "<id>" AND movesDocsCount > 0` 검색 + `properties: [movesDocs]` → 문서 기준으로 묶은 읽기 전용 표(제목, 분류, 스페이스, 연결 이슈).
- 제목은 새 창으로 연다: `router.open(siteUrl + "/wiki/pages/viewpage.action?pageId=" + id)` — 저장된 값의 경로는 쓰지 않는다.
- 탭은 다른 탭과 같은 프로젝트 읽기 권한(`canReadProject`)이 있어야 보이고, 이슈 조회는 상세 페이지의 프로젝트 범위 판정(`findProjectById`)이 통과한 뒤에만 시작한다(이 탭은 Jira를 직접 부르므로 서버 가드를 거치지 않는다).
- 「문서 관리 열기」: §5. 상수가 비어 있으면 버튼을 숨긴다.
- 프로퍼티 읽기는 전용 유틸 `utils/jiraApi/movesDocsProperty.js` 하나만 거친다. Workforce Docs 에도 **같은 경로·같은 이름**의 파일이 있고 그쪽이 쓰는 쪽이다 — 형태를 바꾸면 두 파일을 함께 고친다.
- 쿼리 키는 `utils/queryKey/` 아래 팩토리로 정의한다.

## 9. 알려진 한계

| 한계 | 이유 | 대응 |
|---|---|---|
| 문서의 제목·주소·스페이스 이름·분류·연결한 사람이 이슈를 볼 수 있는 모든 사람에게 보인다 | 이 값들이 Jira 이슈 프로퍼티에 있고, Workforce는 Confluence 권한을 물을 수 없다. 화면에 안 보이는 값도 Jira API로 읽을 수 있다 | 도입 안내에 명시. 본문은 Confluence 권한을 따른다 |
| **접근 범위는 Jira 권한이 정한다.** Workforce에서 소속 프로젝트만 보도록 제한된 사용자도, Jira에서 그 이슈를 볼 수 있으면 Workforce Docs 주소를 직접 열어 이슈와 연결 문서를 본다. Workforce 안의 「문서」 탭도 화면에서만 권한·범위를 거르므로(§8) 개발자 도구로 같은 Jira 검색을 직접 부르면 같은 값을 얻는다 | 두 앱은 서로의 권한 판정을 호출할 수 없다. Workforce Docs가 볼 수 있는 것은 Jira 이슈 검색이 보여 주는 것과 같다 | Workforce의 프로젝트 제한을 보안 경계로 쓰는 고객에게는 Jira 권한(프로젝트 역할·이슈 보안)을 함께 맞추도록 안내 |
| 두 사람이 같은 이슈의 연결을 거의 동시에 바꾸면 한쪽 변경이 사라질 수 있다 | Jira 이슈 프로퍼티에는 조건부 쓰기가 없다. 다시 읽고 쓰는 사이의 짧은 틈은 막을 수 없다 | 틈을 줄이는 것까지만 한다(쓰기 직전 재조회). 저장 뒤 화면은 실제 저장된 값으로 갱신된다 |
| 제목·주소 자동 갱신은 한 번에 20건, 편집 권한이 없는 이슈는 건너뛴다 | 사용자 자격으로만 쓴다 | Workforce Docs 화면은 항상 최신 값을 보여 준다. 옛 값이 남는 곳은 Workforce 탭뿐 |
| Workforce 탭의 제목이 옛 값일 수 있다 | 스냅샷은 Workforce Docs 화면을 열 때만 갱신 | 필요해지면 Confluence 페이지 수정 이벤트로 갱신(후속) |
| **연결 정보는 감사 기록이 아니다.** 제목·분류·연결한 사람·연결 시각은 이슈 편집 권한자가 우리 앱 밖에서 위조할 수 있고, 위조한 분류로 "누락된 필수 분류"를 0으로 만들 수 있다 | 이슈 프로퍼티는 편집 권한만 있으면 누구나 쓸 수 있다 | 화면은 값을 그대로 믿지 않고(상한·형식 강제) 그리지만, 진위는 보증하지 않는다. 도입 안내에 명시 |
| 문서 제목·스페이스 이름은 Workforce Docs 화면을 여는 사람의 Confluence 권한으로 읽어 **사용자 동작 없이** Jira에 복사된다 | 자동 갱신(§7.3)이 화면을 열 때 도는 것이라, 열람이 제한된 문서의 새 제목도 그 문서를 볼 수 있는 사람이 화면을 열면 이슈에 기록된다 | 도입 안내에 명시. 필요하면 설정에 자동 갱신 끄기를 둔다(후속) |
| 삭제와 권한 없음을 구분 못 한다 | CQL은 볼 수 없는 문서를 그냥 빼고 돌려준다 | 문구로 안내 |
| Workforce Docs를 지워도 연결 정보는 이슈에 남는다 | 프로퍼티는 Jira 소유 | 탭은 숨겨지고, 재설치하면 그대로 복원 |
| **라이선스가 비활성일 때 백엔드가 막는 것은 resolver 5개뿐이다** — 설정 조회·저장(`getSettings`·`saveSettings`), 열어 본 프로젝트 조회·기억(`listProjects`·`touchProject`), 관리자 여부(`getViewer`). **이슈 검색, 연결 정보 읽기·쓰기·삭제, 문서 검색, 스페이스 검색은 화면에서만 막힌다**(안내 페이지가 앱 화면을 대신 그려서 호출이 시작되지 않을 뿐이다) | 이 호출들은 화면이 Jira·Confluence 를 사용자 자격으로 직접 부른다(§7.2). 백엔드를 거치지 않으므로 백엔드 가드가 닿지 않고, 플랫폼도 라이선스로 이 호출을 막아 주지 않는다. 화면 코드를 우회하면 비활성 상태에서도 부를 수 있다 | 받아들인다. 그렇게 해서 할 수 있는 일은 그 사용자가 Jira·Confluence 에서 원래 할 수 있는 일(자기가 편집할 수 있는 이슈의 값 쓰기, 볼 수 있는 문서 검색)이고 앱이 권한을 더 주지는 않는다. 막아야 한다면 연결 쓰기를 백엔드 resolver 로 옮긴다(설계 변경 — 후속) |
| Workforce Docs 의 라이선스가 비활성이어도 Workforce 의 「문서」 탭은 그대로 보인다 | 두 앱은 서로의 상태를 조회할 수 없다(§2). 탭은 이슈에 저장된 값을 읽을 뿐이고 설치 감지(§6)는 설치 여부만 본다 | 받아들인다. 이미 연결해 둔 문서는 읽을 수 있고, 연결을 바꾸는 것만 Workforce Docs 에서 막힌다 |
| 운영 환경에서 라이선스 정보가 오지 않으면 통과한다 | 판정을 `context.license` 하나로 한다. 없을 때 직접 조회해 확정하는 기능은 가져오지 않았다(§7.7) | 배포 뒤 실측(§10 P12). 정보가 오지 않는 경우가 있으면 Workforce 의 직접 조회를 가져온다 |
| 사용 중에 라이선스가 비활성으로 바뀌면 화면은 새로 고칠 때까지 앱 화면을 그대로 보여 준다 | 화면은 시작할 때 한 번 판정한다 | 그 사이 백엔드는 요청마다 판정하므로 설정 저장 등은 거부된다(화면은 오류로 표시). 새로 고치면 안내 페이지가 나온다 |

## 10. 배포 뒤 실측해야 하는 것

테스트로는 확인할 수 없는 플랫폼 동작이다. 하나라도 다르면 해당 절을 고친다.

| # | 가정 | 다르면 |
|---|---|---|
| P1 | `jql/parse` strict가 선언 안 된 별칭을 오류로 돌려준다 | §6 감지를 `search/jql` 400 판정으로 바꾼다 |
| P2 | 문자열 배열(`pageIds`)과 숫자(`count`)가 별칭으로 색인된다 | 색인 경로를 단일 문자열로 바꾼다 |
| P3 | Jira 페이지 안에서 `requestConfluence`가 동작한다(Confluence 선택 설치) | 백엔드 `asUser().requestConfluence`로 옮긴다 |
| P4 | 다른 앱의 전역 페이지로 하위 경로·쿼리를 실어 이동할 수 있다 | `name`을 빼고 id만 넘기거나 홈으로 이동 |
| P5 | `search:confluence` 하나로 `/wiki/rest/api/search`가 열린다 | `read:confluence-content.summary` 추가 |
| P6 | 팀 관리형 프로젝트에서도 `properties` 동봉이 된다 | 이슈별 개별 조회로 폴백 |
| P7 | 제목 검색(`title ~ "검색어*"`)이 한글·여러 단어에서도 쓸 만한 결과를 낸다 | 검색식을 `title ~` 와 `text ~` 조합으로 바꾼다 |
| P8 | Confluence 검색 응답의 필드(`content.id`, `resultGlobalContainer.title`, `lastModified`)가 설계와 같다 | `utils/confluenceApi/cql.js`의 `toPageInfo` 한 곳을 고친다 |
| P14 | `/wiki/pages/viewpage.action?pageId=<id>` 주소가 Confluence Cloud에서 해당 문서로 열린다 | 두 저장소의 `buildDocumentUrl`을 v2 주소 형식으로 고친다(한 곳씩) |
| P9 | manifest `translations` 로 선언한 문구 파일이 화면까지 전달되고, 언어를 `ko-KR`·`en-US` 로 지정해 읽을 수 있다 | 문구 파일을 프론트 번들에 넣는 방식으로 되돌린다(`stores/useI18nStore.js` 한 곳) |
| P10 | 스페이스 목록을 검색 API(`type = space`)로 가져올 수 있고, 응답에 `space.key`·`space.name` 이 있다 | 응답 형태가 다르면 `utils/confluenceApi/cql.js` 의 `toSpaceInfo` 한 곳을 고친다. 검색 API 로 스페이스를 가져올 수 없으면 스페이스 선택을 빼거나 스코프 추가를 결정한다 |
| P11 | 본문 검색(`text ~ "<검색어>"`)이 한글에서 동작하고, 정렬 없이 관련도 순으로 온다. 결과에 `excerpt` 가 실린다 | 검색식은 `buildSearchCql` 한 곳, 발췌 해석은 `cleanExcerpt` 한 곳을 고친다 |
| P12 | 유료로 등록한 뒤 운영 환경에서 `context.license` 가 화면(`view.getContext()`)과 resolver(`req.context`) **양쪽**에 실려 오고, 미결제·만료 설치는 `active: false` 로 온다 | 오지 않는 경우가 있으면 그 설치는 통과한다 → Workforce 의 직접 조회(License API + 캐시)를 가져와 확정한다 |
| P13 | 평가판의 만료일이 `trialEndDate`(또는 `subscriptionEndDate`)로 오고 `isEvaluation` 이 `true` 다 | `stores/useLicenseStore.js` 의 `pickEndDate`·`isEvaluation` 을 고친다. 다르면 만료 임박 안내가 뜨지 않을 뿐 차단 판정에는 영향이 없다 |
