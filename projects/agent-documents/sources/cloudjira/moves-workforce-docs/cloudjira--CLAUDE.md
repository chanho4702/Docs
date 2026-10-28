# CLAUDE.md

이 저장소에서 작업할 때 지키는 규칙. 설계 정본은 `docs/DESIGN.md` 다 — 설계와 다르게 구현해야 하면
임의로 바꾸지 말고 먼저 설계서를 고치거나 보고한다.

> 코드 구조는 **Moves Workforce**(`moves-workforce`)를 따른다. 두 제품을 같은 사람들이 유지보수하므로
> Workforce 를 아는 사람이 이 저장소를 열었을 때 어디에 무엇이 있는지 바로 알 수 있어야 한다.
> 목차도 Workforce `CLAUDE.md` 와 같은 순서다. 일부러 다르게 둔 점은 맨 아래 「Workforce 와 다른 점」에 모았다.

## 프로젝트 개요

Atlassian Jira Cloud용 Forge 앱 **Moves Workforce Docs**. Moves Workforce 프로젝트의 Jira 이슈에 Confluence 문서를 연결·분류·관리한다.
두 앱은 직접 통신할 수 없어 **Jira 이슈 프로퍼티 `movesDocs`** 로 만난다. 이 값의 형태가 두 저장소의 계약이다.

## 기술 스택

- **런타임**: Forge (`nodejs22.x`, arm64, 256MB) — `manifest.yml` 의 `runtime.name` 이 단일 진실
- **프론트엔드**: React 18, React Router 7, Zustand 5, TanStack Query 5
- **UI**: Atlaskit + `@compiled/react`
- **유틸**: `dayjs`
- **저장소**: Forge KVS(단순 키-값)만 쓴다. Forge SQL·Custom Entity 는 쓰지 않는다
- **빌드**: CRA + **craco**(`craco build`, 설정은 `static/ui/craco.config.js`), 엔트리 1개 | **테스트**: jest(프론트도 `react-scripts test` 가 아니라 jest 직접) | **i18n**: `@forge/bridge`
- **백엔드 의존성**: `@forge/api`, `@forge/kvs`, `@forge/resolver`
- 패키지 버전은 `moves-approval` 과 맞춘다

## 주요 커맨드

```bash
# 백엔드 테스트 (루트) — jest
npm test

# 프론트엔드 테스트
cd static/ui && npm test

# 프론트엔드 빌드 (prebuild 에서 자동으로 번역 merge 실행)
# CI 와 같은 조건(경고를 오류로 취급)으로 확인한다
cd static/ui && CI=true npm run build

# 번역 파일 병합 — 실제 스크립트: locales/script/merge.js
cd static/ui && npm run merge

# 위 셋(백엔드 테스트 → 프론트 테스트 → 프론트 빌드)을 차례로
npm run verify
```

`forge register` / `forge deploy` / `forge install` 과 `git commit` 은 사용자가 직접 한다.

## 번역(i18n) 규칙

**`locales/en-US.json`, `locales/ko-KR.json` 직접 수정 금지.** 생성물이다.

번역 추가 시:
1. `locales/kr/{기능}.json` + `locales/en/{기능}.json` 에 번역 키/값 추가. 파일 이름이 키의 첫 마디가 된다(`kr/common.json` 의 `retry` → `common.retry`)
2. `cd static/ui && npm run merge` 실행 → `ko-KR.json` / `en-US.json` 생성. manifest `translations` 가 이 두 파일을 가리킨다

UI 에서 번역 사용: `useI18nStore` 의 `t()` (`static/ui/src/stores/useI18nStore.js`)
```js
const t = useI18nStore((s) => s.t);
t('common.save');
tFormat(t, 'result.allSucceeded', { count });   // 치환 변수는 utils/i18n.js 의 tFormat — t() 는 변수를 채우지 않는다
```

- 두 언어의 키·치환 변수는 항상 같아야 한다. 생성물이 원본과 어긋나도 테스트가 잡는다(`static/ui/src/__test__/locales.test.js`).
- 고객에게 보이는 문구에 내부 용어(프로퍼티, JQL, CQL, 스코프, 스냅샷 등)를 쓰지 않는다 — 테스트가 검사한다.
- 화면 문구를 코드에 직접 쓰지 않는다. 예외는 `App.jsx` 의 앱 시작 실패 안내 둘뿐이다(번역을 받기 전이라 영어 기본값을 함께 넘긴다).

## 백엔드 아키텍처

### 계층 구조
```
src/index.js  →  Controller  →  Service  →  Repository  →  src/nosql/query  →  KVS
```

도메인별로 `src/resolver/{도메인}/` 아래에 묶여 있다.

| 도메인 | resolver | 파일 |
|---|---|---|
| `settings` | `getSettings`, `saveSettings` | `SettingsController` · `SettingsService` · `SettingsRepository` · `SettingsValidator` |
| `project` | `listProjects`, `touchProject` | `ProjectController` · `ProjectService` · `ProjectRepository` |
| `viewer` | `getViewer` | `ViewerController` · `ViewerService` |

- `XxxController.js` — resolver 함수 등록 (`registerXxxController(resolver)` export)
- `XxxService.js` — 비즈니스 로직
- `XxxRepository.js` — 저장소 접근. `@forge/kvs` 를 직접 import 하지 않고 `src/nosql/query/KeyValueManager.js` 를 거친다

**새 컨트롤러 추가 시**: `src/index.js` 의 **`CONTROLLER_REGISTRARS` 배열에만** 추가한다. 권한 계약 테스트(`test/permission/permissionMap.contract.test.js`)가 이 배열을 import 해 등록 함수명을 수집한다.

### 권한 가드 + 응답 표준화 — `guardedDefine`

resolver 등록은 `guardedDefine` 을 쓴다. **`resolver.define` 을 직접 쓰지 않는다**(테스트가 검사한다).

```js
// src/permission/permissionGuard.js
import { guardedDefine } from '../../permission/permissionGuard';

export function registerProjectController(resolver) {
  // 가드 통과 후 req.principal 이 붙는다 — { accountId, isJiraAdmin }
  guardedDefine(resolver, 'listProjects', ({ principal }) => listProjectsService(principal));
}
```

- `src/permission/PermissionMap.js` — **미선언 함수는 원천 거부(deny-by-default)**. 신규 resolver 함수는 여기 등록이 필수이며, 빠뜨리면 런타임에서 `PERMISSION_UNMAPPED` 로 죽는다.
- 권한 수준은 **둘뿐**이다: `PUBLIC`(로그인 사용자 누구나) / `JIRA_ADMIN`(Jira 관리자).
- `src/permission/PrincipalResolver.js` — 신원 해석. `isJiraAdmin` 은 `JIRA_ADMIN` 경로에서만 Jira 에 묻는다. `PUBLIC` 경로에서는 `null`(묻지 않았다)이다. 관리자 판정은 `=== true` 로만 한다.

**⚠ 가드 통과 = 데이터 범위 확정이 아니다.** 가드는 "이 함수를 부를 수 있나"만 본다.
- 프로젝트 기억은 **사용자별**이다. 서비스가 `principal.accountId` 로 좁힌다. 사용자를 모르면 저장·조회하지 않는다(`VIEWER_UNKNOWN`).
- `principal` 누락은 **fail-close** 여야 한다 — 컨트롤러가 전달을 빠뜨려도 조용히 열리지 않게. `saveSettingsService` 는 가드 뒤에서 `assertJiraAdmin(principal)` 을 한 번 더 본다.
- 관리자 여부 **확인 실패**는 "관리자가 아님"과 다르다. 던진다(`ADMIN_CHECK_FAILED`) — 저장은 거부, `getViewer` 는 실패 응답.
- 응답 형태(Workforce 와 같다):
  - 성공 `{ success: true, ...result }`
  - 실패 `{ success: false, error: { name, code, message, cause } }`

### 에러 처리
- 커스텀 에러 클래스: `src/error/` (`LogicalError` 검증·업무 규칙, `PermissionError` 권한, `ForgeAPIError` Jira 호출)
- 에러 코드 정의: `src/utils/errors/ErrorCodes.js`. 문구는 프론트 번역(`errors.<code>`)이 가진다
- 이 에러들을 throw 하면 가드가 `{ success:false, error }` 형태로 직렬화한다

### 저장소 접근 패턴
- **KVS**: `src/nosql/query/KeyValueManager.js` 의 `keyValueManager`(`save` · `findByKey`). 접두사 조회는 쓰지 않는다 — 목록은 값 하나에 넣는다
- KVS 키: `settings`, `projects:<accountId>`(사용자당 키 하나, 값은 최대 100건 목록)
- KVS 는 **빈 문자열 저장을 거부**한다. 선택 필드는 `|| ''` 대신 속성 자체를 생략할 것
- 프로젝트마다 키를 두면 "사용자당 100건" 상한이 동시 호출로 뚫린다(보안 감사 M-2) — 그래서 목록을 값 하나로 둔다
- 조회 실패를 빈 값·기본값으로 바꾸지 않는다. 그대로 던진다

### Jira API
- `src/api/jira/` 아래 `user/UserApi.js`(관리자 권한 확인)
- `@forge/api` 의 `requestJira()` 사용, `src/api/jira/util/RequestJiaJson.js` 로 표준화
- **`asUser()` 만 쓴다.** `asApp()` 은 쓰지 않는다
- 백엔드가 부르는 Jira API 는 관리자 확인 하나뿐이다. 이슈 검색·프로퍼티 읽기/쓰기·Confluence 검색은 전부 프론트가 한다

## 프론트엔드 아키텍처

### 라우팅 (`static/ui/src/App.jsx`)
Forge `view.createHistory()` 를 `router/ForgeHistoryRouter.jsx` 로 React Router 에 꽂는다. Forge 밖(테스트·로컬)에서는 `MemoryRouter` 폴백.
앱 시작 순서: 테마 → 사용자 정보(`view.getContext()`) → 번역 → 라이선스 → 경로 기록. 라이선스가 비활성이면 아래 화면 대신 안내 페이지만 그린다.
```
/             → HomePage      (내가 열어 본 프로젝트)
/project/:id  → ProjectPage   (탭: 문서 | 이슈 | 현황) — Workforce 가 ?name= 을 실어 들어온다
/settings     → SettingsPage  (분류·오래된 문서 기준일)
```
앱 틀(머리글·메뉴)은 `layout/AppLayout.jsx`.

### 상태 관리 (Zustand Stores)
`static/ui/src/stores/`
- `useI18nStore`: `t(key)` 번역 함수, `init(locale)` 초기화
- `useAppContextStore`: 앱 시작 때 받은 사이트 주소·사용자 id
- `useLicenseStore` + `licenseDecision.js`: 라이선스 상태. 차단은 명시적 비활성 하나뿐이다(「라이선스」 절)

### 서버 상태 (React Query)
쿼리 키는 팩토리 함수로 관리: `static/ui/src/utils/queryKey/`
`settingKeys`, `viewerKeys`, `projectKeys`, `movesDocsKeys`, `confluenceKeys`
```js
settingKeys.all                    // ["settings"]
settingKeys.detail()               // ["settings", "detail"]
movesDocsKeys.projectIssues(id)    // ["movesDocs", "projectIssues", "42"]
```
**새 쿼리 키는 반드시 `queryKey/` 아래 팩토리 함수로 정의.** `queryKeyContract.test.js` 가 계약을 검사한다.

resolver 조회는 `hooks/` 의 훅으로 쓴다: `useSettings`, `useViewer`, `useRememberedProjects`.

### 공용 UI 지점
새 화면은 아래를 먼저 확인하고 재사용한다. 스피너는 쓰지 않고 로딩은 스켈레톤으로 표현한다.

| 용도 | 위치 |
|------|------|
| 앱 틀(머리글·메뉴) | `layout/AppLayout.jsx` |
| 페이지 셸/헤더 | `components/layout/PageContainer.jsx`, `PageHeader.jsx` |
| 로딩 표현 | `components/skeleton/Skeleton.jsx`, `components/table/skeletonRows.js` |
| 테이블 | `components/table/CommonTable.jsx` (정렬 값은 `rows[].cells[].sortValue`) |
| 상태 표시 | `components/lozenge/StatusLozenge.jsx` (`IssueStatusLozenge`, `DocStatusLozenge`) |
| 빈 상태(0건) | `components/chart/EmptyState.jsx` (표는 `CommonTable` 의 `emptyMessage`) |
| 조회 실패 | `components/error/LoadError.jsx` |

- 조회 실패와 0건은 다르게 그린다. 표의 빈 안내가 보인다는 것은 "조회는 성공했고 0건"이라는 뜻이다.
- 색은 Atlaskit 토큰을 쓴다. 브랜드 강조색은 틸 `#21ADAD` 하나(`app.css` 의 `--docs-brand`)이고 장식에만 쓴다.

### 프론트엔드 Jira·Confluence 직접 호출
Jira·Confluence 호출은 백엔드 resolver 를 거치지 않고 `@forge/bridge` 로 직접 한다(전부 **사용자 자격**).

| 위치 | 내용 |
|---|---|
| `utils/jiraApi/requestJira.js` | Jira 요청 맵(REQUEST_MAP) + `executeRequest` |
| `utils/jiraApi/movesDocsProperty.js` | **계약** — 프로퍼티 값의 조립·읽기·병합 |
| `utils/jiraApi/movesDocsSearch.js` | 프로젝트 이슈 검색 |
| `utils/jiraApi/movesDocsWriter.js` | 프로퍼티 읽기·쓰기·삭제, read-merge-write |
| `utils/confluenceApi/requestConfluence.js` | Confluence 요청 맵 + `executeRequest` |
| `utils/confluenceApi/cql.js` | 검색식 조립, 검색 결과 해석(순수 함수) — 문서 검색식은 `buildSearchCql({ term, includeBody, spaceKeys })` 만 조립한다 |
| `utils/confluenceApi/pageSearch.js` | 문서 검색, 최신 정보 조회 |
| `utils/confluenceApi/spaceSearch.js` | 스페이스 목록(문서 검색과 같은 검색 API) |
| `utils/requestCore.js` | 두 요청 맵이 같이 쓰는 실행기 |

- 새 호출은 요청 맵에 key·type·url 을 적고 `executeRequest(key, param, urlParam, queryParam)` 로 부른다.
- Jira 검색은 `POST /rest/api/3/search/jql` + `nextPageToken`. 옛 `/search` 는 쓰지 않는다.
- Confluence 호출은 **검색 하나뿐**이다(스코프가 `search:confluence` 하나). 다른 주소를 추가하면 manifest 스코프도 늘려야 한다. 스페이스 목록도 같은 검색 API 로 가져온다.
- 검색 옵션을 늘리면 쿼리 키(`confluenceKeys.pageSearch`)에도 넣는다. 빠지면 옵션을 바꿔도 옛 결과가 보인다.
- 검색 결과에 실려 오는 화면 표시용 값(본문 발췌 등)은 이슈에 저장하지 않는다. `normalizePage` 가 계약의 속성만 남긴다.
- 커스텀 필드 등을 쓴 직후 다시 검색하면 옛 값이 올 수 있다. 저장 뒤에는 다시 조회하지 말고 저장 결과로 화면 캐시를 고친다(`useProjectData` 의 `patchIssues`).

### Forge Bridge 호출
```js
import { invokeResolver } from '../utils/invokeResolver';
const result = await invokeResolver('getSettings');   // 실패 응답이면 던진다(ResolverError, code 로 문구를 고른다)
```

## 주요 페이지 구조 (`static/ui/src/pages/`)

- `home/` — 홈 (`/`)
- `project/` — 프로젝트 (`/project/:id`)
  - `ProjectPage.jsx`, `useProjectData.js` — 화면과 데이터
  - `DocumentsTab.jsx` · `IssuesTab.jsx` · `OverviewTab.jsx` — 탭 3개
  - `LinkModal.jsx` · `DocActionModal.jsx` · `IssueResultList.jsx` — 「문서 연결」, 분류 변경·연결 해제, 이슈별 결과
  - `documents.js` · `filters.js` — **순수 로직**(문서 기준 묶기, 상태 판정, 현황 집계, 필터). 컴포넌트 안에 판정 로직을 쓰지 않는다
- `settings/` — 설정 (`/settings`)
- `license/` — 라이선스 안내 페이지, 평가판 만료 임박 안내(경로 없음 — `App.jsx` 가 분기한다)

## 라이선스

유료 앱이다(`manifest.yml` 의 `app.licensing.enabled: true`). 라이선스 검사는 앱이 직접 하고, 방식은 Workforce 와 같다(DESIGN §7.7).

- **차단은 `context.license.active === false` 로 확정된 경우뿐이다.** 라이선스 정보가 없거나(개발 환경·터널·미등록) 판정하지 못한 경우는 통과시킨다. 이것을 차단으로 바꾸면 개발 환경이 전부 잠긴다.
- **화면과 백엔드는 같은 경계를 쓴다.** 규칙을 바꿀 때는 입력표 `test/license/licenseDecisionTable.json` 부터 고친다. 양쪽 테스트가 이 표 하나를 통과한다.
  - 백엔드: `src/utils/license/LicenseGuard.js` (`getLicenseDecision`, `assertLicenseAllowed`)
  - 화면: `static/ui/src/stores/licenseDecision.js` (`decideClientLicense`), `stores/useLicenseStore.js`
- **백엔드 확인은 공통 래퍼 한 곳**(`src/utils/ResponseWrapper.js`)에서 한다. resolver 마다 넣지 않는다. 등록을 `guardedDefine` 으로만 하면 새 resolver 도 자동으로 걸린다(`test/license/licenseGuard.allResolvers.test.js` 가 등록 목록을 돌며 확인한다).
- 화면은 앱 시작 때 판정해 비활성이면 `pages/license/LicenseGuidePage.jsx` **만** 그린다(`App.jsx`). 평가판 만료 임박 안내는 `pages/license/TrialExpiryBanner.jsx`.
- 마켓 주소는 `pages/license/licenseConstants.js` 의 `MARKETPLACE_URL`. 비어 있으면 구매 버튼을 그리지 않는다. **마켓에 등록한 뒤 채운다.**
- manifest 의 화면 모듈에 `displayConditions` 로 라이선스를 걸지 않는다. 걸면 미결제 시 화면이 사라져 구매 안내를 띄울 수 없다.
- ⚠ **화면의 검사는 안내용이고 실제 차단은 백엔드다. 그런데 이 앱의 Jira·Confluence 호출은 백엔드를 거치지 않는다.** 백엔드가 막는 것은 resolver 5개뿐이고 연결 기능은 화면에서만 막힌다. 구조상 한계이므로 코드로 억지로 막지 않는다(DESIGN §9).

## 계약 — 이슈 프로퍼티 `movesDocs`

- 값의 형태를 아는 곳은 `static/ui/src/utils/jiraApi/movesDocsProperty.js` **하나**다.
  Workforce 에도 **같은 경로·같은 이름**의 파일이 있다(읽는 쪽). 형태를 바꾸면 두 파일을 함께 고친다.
  - 조립: `buildLinkProperty(projectId, pages)` 만. `pageIds`·`categories`·`count` 는 `pages` 에서 파생한다
  - 읽기: `readPages(property)` 만. 저장된 값은 앱 밖에서도 쓸 수 있으므로 신뢰하지 않는다
  - 변경: `mergePages(existing, change)` — 페이지 단위(추가는 upsert, 해제는 해당 id 만)
- 비면 저장하지 않고 **삭제**한다(`buildLinkProperty` 가 `null` 을 돌려준다).
- 이슈당 30건(`MAX_PAGES_PER_ISSUE`), 같은 페이지는 한 번(나중 값이 이긴다).
- 쓰기는 `utils/jiraApi/movesDocsWriter.js` 의 `applyLinkChange` 만 거친다 — 쓰기 직전에 다시 읽고 병합한다.
  화면이 들고 있던 목록으로 덮어쓰면 다른 사용자의 연결이 사라진다.
- `manifest.yml` 의 `searchAlias`(`movesDocsPageId`·`movesDocsCategory`·`movesDocsCount`) 이름은 Workforce 가 쓴다. 바꾸지 않는다.

## Forge 앱 특이사항

- **manifest.yml**: 전역 페이지 1개, 이슈 프로퍼티 색인 선언(`jira:entityProperty`), 번역(`translations`), 라이선스(`app.licensing`), 스코프 4개
- **다중 제품 호환**(`app.compatibility`): Jira 필수, Confluence 선택. Preview 기능이고 한 번 배포하면 되돌릴 수 없다
- **환경 분리**: 한 사이트에 development 와 production 앱을 함께 설치하지 않는다. 같은 별칭이 두 벌 생겨 검색이 모호해진다
- 설계서에 없는 기능·설정·추상화를 추가하지 않는다

## 테스트

플랫폼 동작(색인, 별칭, Confluence 호출 가능 여부, 번역 파일 전달)은 목으로 검증할 수 없다 — 배포 뒤 실측 목록은 DESIGN §10.
테스트는 우리 로직을 본다: 프로퍼티 조립·병합, 상태 판정, 검색식, 설정 검증, 권한 거부, 조회 실패와 0건의 구분.

- `static/ui/__mocks__/@forge/bridge.js` 는 지우지 않는다(jest 설정이 가리킨다). 번역은 키가 아니라 **실제 번역 파일**에서 찾아 돌려준다.
- 화면 테스트는 `static/ui/src/testUtils.jsx` 의 `renderPage` 로 그린다(한국어).
- 번역 원본을 고쳤으면 `npm run merge` 뒤에 테스트한다.

## CI 빌드 주의

`CI=true` 는 경고를 오류로 다룬다. `craco.config.js` 가 Atlaskit compiled CSS 에서 나는 두 가지 경고
(CSS 순서, CSS 최소화 단계의 calc 해석)만 출처를 확인해 무시한다. 우리 코드에서 난 경고는 그대로 빌드를 깬다.

## Workforce 와 다른 점

구조는 같고, 아래는 일부러 다르게 뒀다. 고칠 때 Workforce 쪽 습관대로 되돌리지 않는다.

| 다른 점 | 이유 |
|---|---|
| **프론트 `executeRequest` 는 실패를 던진다** (Workforce 는 `{ success:false }` 를 돌려준다) | 조회 실패와 0건을 구분해 그려야 한다. 실패를 값으로 돌려주면 호출부가 확인을 빠뜨렸을 때 0건으로 보인다 |
| 백엔드 `requestJiraJson` 에 `fallback` 이 없다 | 같은 이유 — 관리자 확인 실패를 "권한 없음"으로 뭉개지 않는다 |
| 권한 수준이 둘(`PUBLIC`·`JIRA_ADMIN`)이고 세부 권한 모듈이 없다 | 이 앱의 권한은 Jira 가 판정한다(이슈 편집 권한, 관리자 여부) |
| KVS 를 Custom Entity 가 아니라 단순 키-값으로 쓴다 | 저장하는 것이 설정 1건과 사용자별 프로젝트 기억뿐이다 |
| 번역 언어를 앱이 정해 `init(locale)` 로 넘긴다 | `ko`·`ko_KR` 처럼 표기가 다른 값이 영어로 떨어지지 않게 한다(DESIGN §7.6) |
| 공용 표에 컬럼 폭 동결·리사이즈가 없다 | 재편 전에도 없던 기능이다. 필요해지면 Workforce 의 세 파일을 함께 가져온다 |
| 라이선스 판정이 `context.license` 만 본다(Workforce 는 없으면 License API 로 직접 조회해 확정한다) | 예약 작업·큐가 없어 직접 조회를 가져오지 않았다. 운영 환경에서 정보가 오지 않으면 통과한다 |
| 평가판 만료 안내를 `@atlaskit/section-message` 로 그린다(Workforce 는 `@atlaskit/banner`) | 그 패키지가 이 앱에 없다. 노출 조건은 같다 |
| 루트가 `createRoot` 다 (Workforce 는 legacy `ReactDOM.render`) | 새 앱이라 legacy 로 시작할 이유가 없다 |
| 오류 코드 `FORBIDDEN`·`VIEWER_UNKNOWN` (Workforce 는 `PERMISSION_DENIED`·`PERMISSION_PRINCIPAL_UNRESOLVED`) | 재편 전 코드 값을 그대로 뒀다. 화면 문구 키가 이 값에 묶여 있다 |

## 보안 규칙 (2026-09-30 감사 반영)

- **저장된 이슈 프로퍼티는 신뢰하지 않는다.** 이슈 편집 권한자가 우리 앱 밖에서도 쓸 수 있다. 읽을 때도 30건·글자 수·id 형식(숫자 1~19자리)을 강제한다(`utils/jiraApi/movesDocsProperty.js`). Workforce 쪽 같은 이름 파일과 상한이 같아야 한다.
- **문서 링크는 id 로만 만든다**(`buildDocumentUrl(siteUrl, id)`). 저장된 경로를 링크에 쓰지 않는다. 계약에 `url` 필드는 없다.
- **최신 정보 조회는 500건까지**(`MAX_LOOKUP_PAGES`). 넘는 문서는 "확인 불가".
- **실패 응답에 원문 오류를 싣지 않는다.** `ResponseWrapper` 가 우리 오류 클래스의 코드만 내보내고 나머지는 `UNKNOWN_ERROR` 로 바꾼다. 화면은 `error.code` 만 본다.
- **가드는 호출자를 모르면 PUBLIC 이어도 거부한다**(`VIEWER_UNKNOWN`).
- **운영 빌드에 소스맵을 넣지 않는다**(`craco.config.js` 가 production 에서 `devtool=false`).
- 프로젝트 기억은 주소로 받은 이름을 **이슈가 조회된 뒤에만** 저장한다.
- 감사 보고서: `docs/SECURITY_AUDIT.md`, 심사 점검표: `docs/MARKETPLACE_CHECKLIST.md`.
