# Moves Workforce Docs — 구현 보고서

> 작성 2026-09-29. 기준 설계서: `docs/DESIGN.md` v1.0. 범위: §4·§5(수신 측)·§7·§9·§10.
> 실행 환경: Windows 11, Git Bash, Node v22.22.0, npm 10.9.4, Forge CLI 13.4.0.

## 1. 요약

| 항목 | 결과 |
|---|---|
| 백엔드 테스트 (`npm test`) | 통과 — 3 스위트, 53건 |
| 프론트 테스트 (`static/ui`, `npm test`) | 통과 — 14 스위트, 196건 |
| 프론트 빌드 (`CI=true npm run build`) | 성공(exit 0). 단, **경고 필터를 하나 추가한 뒤**에 성공 — §3-1 |
| `forge lint` | **실행 불가** — `app.id` 자리표시자 때문. manifest 는 CLI 내장 스키마로 따로 검증해 통과 — §4-4 |
| 실제 Jira 화면 확인 | **하지 않음** — 앱을 등록·배포할 수 없어 브라우저에서 한 번도 띄우지 못했다 |
| git | `git init` 만 했고 커밋하지 않음 |

## 2. 만든 파일

### 루트

| 파일 | 내용 |
|---|---|
| `.gitignore` | node_modules, static/ui/build, .forge, .env 등 |
| `package.json`, `package-lock.json` | 백엔드 의존성(버전은 moves-approval 과 동일 범위) |
| `jest.config.js` | 백엔드 jest 설정 |
| `manifest.yml` | 전역 페이지 1개, 이슈 프로퍼티 색인 선언, 스코프 4개. `app.id` 는 자리표시자 |
| `README.md` | 설치·빌드·배포 절차, `forge register` 이후 단계 |
| `CLAUDE.md` | 저장소 작업 규칙 |
| `docs/BUILD_REPORT.md` | 이 문서 |

### 백엔드 `src/`

| 파일 | 내용 |
|---|---|
| `index.js` | resolver 조립, `CONTROLLER_REGISTRARS` |
| `error/AppError.js` | 오류 클래스와 오류 코드 |
| `utils/defineResolver.js` | resolver 등록 + 응답 표준화 |
| `permission/JiraAdmin.js` | 관리자 판정(사용자 자격, 확인 실패는 거부) |
| `resolver/settings/SettingsValidator.js` | 설정 검증·정규화, 기본값 |
| `resolver/settings/SettingsService.js`, `SettingsController.js` | `getSettings`, `saveSettings` |
| `resolver/project/ProjectService.js`, `ProjectController.js` | `listProjects`, `touchProject` |
| `resolver/viewer/ViewerController.js` | `getViewer` |
| `resolver/**/__test__/*.test.js` | 테스트 3개 |

### 프론트 `static/ui/`

| 파일 | 내용 |
|---|---|
| `package.json`, `package-lock.json` | 의존성. 설치된 버전이 moves-approval 과 같음을 확인(§4-1) |
| `craco.config.js` | Atlaskit CSS 경고 필터 2종(엔트리 교체 없음) |
| `jest.config.js`, `jest.setup.js`, `__mocks__/` | 프론트 jest 설정과 `@forge/bridge` 목 |
| `public/index.html` | HTML 템플릿 |
| `src/index.js`, `src/App.jsx`, `src/app.css` | 시작점, 시작 순서(테마→사용자 정보→경로 기록), 스타일 |
| `src/router/ForgeHistoryRouter.jsx` | Forge history → React Router 어댑터 |
| `src/domain/linkProperty.js` | **계약** — `buildLinkProperty`, `readPages`, `mergePages` |
| `src/domain/documents.js` | 문서 기준 묶기, 상태 판정, 누락된 필수 분류, 현황 집계, 저장값 갱신 대상 찾기 |
| `src/domain/cql.js` | 검색식 이스케이프·조립, 주소에서 id 추출, 50개 분할 |
| `src/domain/filters.js` | 문서·이슈 목록 필터 |
| `src/api/http.js` | 호출 공통부(실패는 던진다) |
| `src/api/jira.js` | 이슈 검색(`search/jql` + `nextPageToken`), 프로퍼티 읽기·쓰기·삭제 |
| `src/api/confluence.js` | 문서 검색, 최신 정보 조회 |
| `src/api/linkWriter.js` | read-merge-write, 이슈별 결과 |
| `src/api/backend.js` | resolver 호출 |
| `src/stores/useI18nStore.js`, `useAppContextStore.js` | 번역, 사이트 주소·사용자 id |
| `src/i18n/ko.json`, `en.json` | 화면 문구 |
| `src/utils/queryKeys.js`, `links.js` | 쿼리 키, 링크 조립 |
| `src/components/` | `AppShell`, `DataTable`, `Skeleton`, `LoadError`, `StatusLozenge`, `IssueResultList` |
| `src/pages/home/HomePage.jsx` | 홈 |
| `src/pages/project/` | `ProjectPage`, `useProjectData`, `DocumentsTab`, `IssuesTab`, `OverviewTab`, `LinkModal`, `DocActionModal` |
| `src/pages/settings/SettingsPage.jsx` | 설정 |
| `src/testUtils.jsx` | 테스트 전용 도우미(번들에 포함되지 않음 — 빌드 산출물에서 확인) |
| `src/**/__test__/` | 테스트 14개 |

## 3. 설계와 다른 점

### 3-1. 설계에 없는데 넣은 것

| # | 내용 | 이유 |
|---|---|---|
| D1 | 문서 상태에 **`확인 불가`** 를 추가(설계는 끊김·오래됨·정상 3개) | 설계 §7.2 는 Confluence 호출이 실패해도 목록을 그리라고 한다. 그때 최신 정보가 없는 것을 "끊김"으로 판정하면 모든 문서가 끊긴 것으로 보인다. 현황 카드의 오래된 문서·끊긴 링크도 이때는 0 이 아니라 "확인 불가"로 표시한다 |
| D2 | 문서 탭에 **상태 필터**를 추가(설계는 분류·검색어) | 현황 카드(오래된 문서·끊긴 링크)를 누르면 "해당 필터가 걸린 목록"으로 가야 하는데, 걸린 필터가 화면에 보이고 풀 수 있어야 한다 |
| D3 | 문서 행 동작(분류 변경·연결 해제)에 **적용할 이슈를 고르는 창**을 둠 | 분류와 연결은 문서가 아니라 이슈마다 저장된다. 한 문서가 여러 이슈에 연결돼 있으면 어느 이슈에 적용할지 정해야 한다. 기본은 전부 선택 |
| D4 | 프로퍼티 **값 크기 검사**(32,768자 초과면 저장 거부, 사유 표시) | 설계 §4 가 상한을 언급한다. 한글 제목은 주소에서 글자당 9자로 늘어나 30건 안에서도 넘을 수 있다 |
| D5 | `craco.config.js` 에 **경고 필터 하나 더**(CSS 최소화 단계의 calc 해석 경고) | moves-approval 설정만으로는 `CI=true` 빌드가 실패했다. 아래 설명 참조 |
| D6 | 검색 결과의 `title` 을 쓸 때 강조 표식(`@@@hl@@@`)을 걷어냄 | `content.title` 이 없을 때의 폴백인데, 그대로 저장하면 표식이 제목에 남는다 |

**D5 상세.** 처음 빌드는 이렇게 실패했다.

```
Treating warnings as errors because process.env.CI = true.
Failed to compile.
static/css/main.2cfa4ff5.css from Css Minimizer plugin
postcss-calc:: Lexical error on line 1: Unrecognized text.
  Erroneous area:
1: l * var(--border-l-factor)
^..^ webpack://./node_modules/@atlaskit/react-select/dist/esm/components/multi-value.compiled.css:56:53
```

`@atlaskit/react-select` 의 CSS 가 쓰는 상대 색상 구문을 CRA 5 의 CSS 최소화 도구가 해석하지 못해 내는 경고다.
출처가 Atlaskit compiled CSS 인 경우만 무시하도록 필터를 추가했고, 빌드 산출물에 해당 규칙이 원문 그대로
남아 있는 것을 확인했다. moves-approval 도 같은 버전의 패키지를 쓰므로 `CI=true` 로 빌드하면 같은 오류가 날 것으로
보인다(그 저장소는 건드리지 않았고 직접 빌드해 보지도 않았다 — 추정이다).

### 3-2. 설계가 정하지 않아 정한 것

| # | 내용 |
|---|---|
| E1 | 제목·주소·스페이스·연결한 사람 값이 없으면 빈 문자열을 넣지 않고 **속성을 생략**한다. 주소는 `/` 로 시작하는 경로만 저장한다(Workforce 의 `movesDocsProperty.js` 가 같은 조건으로 읽는다) |
| E2 | 이미 연결된 문서를 다시 연결하면 항목 전체가 새 값으로 바뀐다(분류·연결 시각·연결한 사람 포함). 설계의 "나중 값이 이긴다"를 그대로 적용. 분류 없이 다시 연결하면 미분류가 된다 |
| E3 | 분류 이름 중복은 **대소문자를 무시**하고 판정한다 |
| E4 | `touchProject` 입력 검증: 프로젝트 id 는 영문·숫자·`_`·`-` 1~64자, 이름은 1~255자. 어긋나면 저장하지 않는다 |
| E5 | 설정 검증 실패는 오류 코드로 돌려주고(`CATEGORY_NAME_LENGTH` 등 8종) 문구는 프론트 i18n 이 가진다. 프론트는 따로 검증하지 않는다 |
| E6 | 「문서 연결」 창은 단계 이동 없이 한 화면에 ①②③을 세로로 배치했다 |
| E7 | 「누락된 필수 분류」 카드를 누르면 문서 탭에 그 분류들이 필터로 걸린다(결과는 0건). |
| E8 | 탭·필터 상태는 주소에 싣지 않는다. 새로 고치면 문서 탭으로 돌아간다 |
| E9 | 최신 정보 조회가 끝날 때까지 목록 전체를 스켈레톤으로 둔다. 연결을 추가해 문서 목록이 바뀌면 다시 조회하므로 잠깐 스켈레톤이 보인다 |
| E10 | 이슈 유형·담당자는 설계대로 조회하지만 화면 열(키·요약·상태·문서 수)에는 없어 표시하지 않는다 |

### 3-3. 설계대로 했지만 알아 둘 것

- **연결된 문서가 하나도 없는 프로젝트**에서는 Confluence 를 호출할 일이 없어 연결 여부를 미리 알 수 없다.
  이때 「문서 연결」 버튼은 켜져 있고, 검색이 실패하면 창 안에서 오류를 보여 준다.
- read-merge-write 는 읽기와 쓰기 사이의 짧은 틈까지 막지는 못한다(Jira 프로퍼티에 조건부 쓰기가 없다).
  병합을 페이지 단위로 해서 틈을 최소화했을 뿐이다.
- 저장된 프로퍼티에 형태가 깨진 항목(id 없음 등)이 있으면 읽을 때 버리고, 그 이슈를 다시 쓸 때 사라진다.

## 4. 테스트·빌드 실행 결과

### 4-1. 설치

```
(루트) npm install
  added 522 packages, and audited 523 packages in 41s
  found 0 vulnerabilities

(static/ui) npm install        ← moves-approval 의 package-lock.json 을 복사해 기준으로 삼음
  added 1867 packages, and audited 1868 packages in 2m. exit 0.
  38 vulnerabilities (9 low, 10 moderate, 19 high)   ← 내용은 분석하지 않았고 조치하지도 않았다
```

설치된 버전 대조(moves-approval / moves-workforce-docs 동일):
`@atlaskit/button 23.11.8`, `dynamic-table 18.4.2`, `tokens 10.1.0`, `modal-dialog 14.18.3`, `select 21.12.15`,
`tabs 18.3.5`, `@forge/bridge 5.17.0`, `@tanstack/react-query 5.102.4`, `react-router-dom 7.18.2`, `zustand 5.0.15`, `react 18.3.1`

### 4-2. 테스트

```
(루트) npm test
  Test Suites: 3 passed, 3 total
  Tests:       53 passed, 53 total

(static/ui) npm test
  Test Suites: 14 passed, 14 total
  Tests:       196 passed, 196 total
```

요청받은 항목과 테스트 위치:

| 항목 | 파일 |
|---|---|
| `buildLinkProperty`·병합(추가/해제/분류 변경)·중복 제거·30건 상한·빈 값이면 삭제 | `domain/__test__/linkProperty.test.js`, `api/__test__/linkWriter.test.js` |
| 상태 판정(끊김 > 오래됨 > 정상), 누락된 필수 분류 | `domain/__test__/documents.test.js` |
| 검색식 이스케이프, 주소에서 id 추출, 50개 분할 | `domain/__test__/cql.test.js`, `api/__test__/confluence.test.js` |
| 설정 검증, 관리자 아닌 사용자의 `saveSettings` 거부 | `src/resolver/settings/__test__/` |
| 문서 기준 묶기 | `domain/__test__/documents.test.js`, `pages/project/__test__/ProjectPage.test.jsx` |
| 조회 실패와 0건의 구분 | `HomePage.test.jsx`, `ProjectPage.test.jsx`, `OverviewTab.test.jsx`, `modals.test.jsx` |
| 번역 키 일치·누락·내부 용어 | `i18n/__test__/i18n.test.js` |

테스트가 결함을 실제로 잡는지 확인하려고 코드 세 곳을 일부러 틀리게 바꿔 돌려 보았다
(병합 없이 전체 교체 / 빈 값일 때 빈 프로퍼티 반환 / 기준일 경계 `<` → `<=`). 13건이 실패했고, 확인 뒤 원복했다.

### 4-3. 빌드

```
(static/ui) CI=true npm run build
  Compiled with warnings.
  Failed to parse source map from '...\@atlaskit\analytics-next-stable-react-context\src\context.ts' ...
  Failed to parse source map from '...\@atlaskit\analytics-next-stable-react-context\src\index.ts' ...
  File sizes after gzip:
    310.4 kB  build\static\js\main.ed59d423.js
    22.71 kB  build\static\css\main.354c0acf.css
    ...
  The build folder is ready to be deployed.
  exit=0
```

- 남은 경고 2건은 Atlaskit 패키지의 소스맵이 없는 파일을 가리켜서 나는 것이다. CRA 가 CI 빌드에서 이 종류는
  오류로 세지 않아 빌드는 성공한다. 따로 숨기지 않았다.
- 우리 코드에서 난 lint 경고는 없다.

### 4-4. forge lint

```
forge lint
  Error: Invalid ari string: ari:cloud:ecosystem::app/REPLACE_WITH_FORGE_REGISTER.
  'REPLACE_WITH_FORGE_REGISTER' is not a valid value for appId ...
```

**자리표시자 때문에 난 오류**이고 lint 는 그 뒤 단계로 가지 못했다.
임시 폴더의 사본에 형식만 맞는 가짜 id 를 넣어 다시 시도했지만 `Your app could not be found` 로 멈췄다
— lint 는 등록된 앱이 있어야 돈다. 실제 `manifest.yml` 은 바꾸지 않았다.

대신 Forge CLI 13.4.0 에 들어 있는 manifest 스키마(`@forge/manifest` 13.3.1)로 오프라인 검증을 했다.

```
schema valid: true
(일부러 틀린 값을 넣은 사본) broken copy valid: false  ← 검증이 실제로 걸러 내는 것 확인
```

이 검증은 **형식**만 본다. 스코프가 실제 호출에 충분한지, 모듈 조합이 허용되는지는 `forge register` 뒤
`forge lint`·`forge deploy` 에서 확인해야 한다.

## 5. 확인하지 못한 것

| # | 내용 |
|---|---|
| U1 | **실제 화면** — Jira 안에서 한 번도 띄우지 못했다. 배치·여백·다크 모드·모달 크기는 눈으로 확인한 적이 없다. 화면 테스트는 jsdom 에서 문구와 동작만 본다 |
| U2 | 설계 §10 의 **P1~P6 전부** — 별칭 색인, Jira 페이지 안의 Confluence 호출, 다른 앱에서의 경로 이동, 스코프 충분 여부, 팀 관리형 프로젝트의 프로퍼티 동봉 |
| U3 | `forge lint`·`forge deploy` — 앱 등록 뒤에만 가능 |
| U4 | `app.compatibility` 가 있는 앱의 **설치 절차**(README 4단계) — 문서 기준으로 적었고 실행해 보지 않았다 |
| U5 | Forge history 의 실제 동작 — 어댑터는 Workforce 의 것을 따랐고 목으로만 검증했다 |
| U6 | 이슈가 많은 프로젝트(수백~2,000건)에서 「문서 연결」 창의 이슈 선택 목록이 충분히 빠른지 |
| U7 | 검색 응답의 실제 필드 형태(`resultGlobalContainer.title`, `lastModified`, `url`) — 설계서의 필드 이름을 그대로 썼고 실제 응답으로 확인하지 않았다 |
| U8 | Forge CLI 13.4.0 은 최신(14.1.0)이 아니다. 최신 CLI 에서 manifest 스키마가 달라졌는지 확인하지 않았다 |


## 검수 후 변경 (2026-09-29)

구현 보고 이후 검수에서 한 가지를 고쳤다.

- **프로젝트 기억을 사용자별로 변경.** KVS 키를 `project:<projectId>` 에서 `project:<accountId>:<projectId>` 로 바꿨다.
  Workforce 는 소속 프로젝트만 보이게 제한할 수 있는데, 기억을 사이트 전체가 공유하면 홈 목록으로 남의 프로젝트 이름이 보이고
  누구든 다른 사람 목록의 이름을 바꿀 수 있었다. 사용자를 모르면 저장·조회하지 않는다(`VIEWER_UNKNOWN`).
  - 변경 파일: `src/resolver/project/ProjectService.js`, `ProjectController.js`, `src/error/AppError.js`, 테스트, `docs/DESIGN.md` §7.4·§7.5
- 설계서 §10 에 실측 항목 P7(검색 품질)·P8(검색 응답 필드)을 추가했다.

검수 시 재실행 결과: 루트 `npm test` 3 스위트 59건 통과, `static/ui` jest 14 스위트 196건 통과, `CI=true npm run build` 성공.

## 외부 검토(Codex) 반영 (2026-09-29)

지적 9건 중 2건을 고치고 3건은 설계서에 한계로 명시했다. 나머지는 보류했다.

| # | 지적 | 처리 | 이유 |
|---|---|---|---|
| 4 | 저장 크기를 글자 수로 잰다 | **수정** — UTF-8 바이트로 잰다 | 한글 제목은 글자 수로 통과해도 저장에서 거부될 수 있다 |
| 9 | 검색어의 검색 문법 문자 | **수정** — 공백으로 바꾼다 | `[회의록]`·`(초안)` 같은 제목 표기는 흔하다 |
| 1 | 동시 쓰기에서 변경 유실 | 설계서 §9에 한계로 명시 | Jira 프로퍼티에 조건부 쓰기가 없어 코드로 막을 수 없다. §4의 과장된 문구를 고쳤다 |
| 2 | Workforce 프로젝트 제한 우회 | 설계서 §9에 한계로 명시 | Workforce Docs가 보여 주는 것은 Jira 이슈 검색이 보여 주는 것과 같다. 두 앱은 서로의 권한 판정을 부를 수 없다 |
| 3 | 노출 범위가 제목보다 넓다 | 설계서 §9 문구 수정 | 사실과 다르게 적혀 있었다 |
| 3 | `linkedBy` 제거 | 보류 | 계정 id는 이슈의 담당자·변경 이력에서 이미 보이는 값이고, 누가 연결했는지는 추적에 쓸모가 있다 |
| 5 | 자동 갱신이 앞의 20건만 반복 | 보류, §9에 명시 | Workforce Docs 화면은 항상 최신 값을 그린다. 영향은 Workforce 탭의 옛 제목뿐 |
| 6 | 2,000건 초과 시 현황 수치 | 보류 | 경고가 페이지 상단에 있어 모든 탭에서 보인다 |
| 7 | `v`·`projectId`를 읽는 쪽이 무시 | 보류 | 버전은 아직 하나뿐이다. 이슈가 다른 프로젝트로 옮겨지면 문서도 따라가는 것이 맞다 |
| 8 | 쓰는 쪽이 필수 필드를 강제하지 않음 | 보류 | 검색 응답 형태가 다르면 배포 후 실측(§10 P8)에서 바로 드러난다 |

수정 후 재실행: `static/ui` jest 14 스위트 201건 통과, `CI=true npm run build` 성공.

## 구조 재편 (2026-09-30)

코드 구조를 Moves Workforce 의 관례에 맞췄다. 목적은 구조·이름·공용 지점의 일치이고 **동작과 계약은 바꾸지 않았다.**
이슈 프로퍼티 키 `movesDocs`·필드 형태·검색 별칭 3개·이동 경로·resolver 이름과 성공 응답 필드는 그대로다.
manifest 에서 바뀐 것은 `translations` 추가 하나다(모듈·스코프 변경 없음).

실행 환경: Windows 11, Git Bash, Node v22.22.0, npm 10.9.4.

### 1. 옮긴 파일 대응표

#### 백엔드

| 옛 경로 | 새 경로 |
|---|---|
| `src/utils/defineResolver.js` | `src/permission/permissionGuard.js`(`guardedDefine`) + `src/permission/PermissionMap.js` + `src/utils/ResponseWrapper.js` |
| `src/error/AppError.js` (오류 클래스) | `src/error/LogicalError.js` · `PermissionError.js` · `ForgeAPIError.js` |
| `src/error/AppError.js` (오류 코드) | `src/utils/errors/ErrorCodes.js` |
| `src/permission/JiraAdmin.js` (Jira 호출) | `src/api/jira/user/UserApi.js`(`checkAdministerPermission`) + `src/api/jira/util/RequestJiaJson.js` |
| `src/permission/JiraAdmin.js` (판정) | `src/permission/PrincipalResolver.js`(`isJiraAdministrator`, `resolvePrincipal`) · `permissionGuard.js`(`assertJiraAdmin`) |
| `SettingsService.js` 안의 `kvs` 호출 | `src/resolver/settings/SettingsRepository.js` → `src/nosql/query/KeyValueManager.js` |
| `ProjectService.js` 안의 `kvs` 호출 | `src/resolver/project/ProjectRepository.js` → `src/nosql/query/KeyValueManager.js` |
| `ViewerController.js` 안의 로직 | `src/resolver/viewer/ViewerService.js` |
| (없음) | `test/permission/permissionMap.contract.test.js`, `test/permission/permissionGuard.test.js`, `src/resolver/settings/__test__/SettingsService.test.js` |

#### 프론트 (`static/ui/src/` 기준)

| 옛 경로 | 새 경로 |
|---|---|
| `api/http.js` | `utils/requestCore.js`(실행기) + `utils/jiraApi/requestJira.js` · `utils/confluenceApi/requestConfluence.js`(요청 맵) |
| `api/jira.js` (이슈 검색) | `utils/jiraApi/movesDocsSearch.js` |
| `api/jira.js` (프로퍼티 읽기·쓰기·삭제) | `utils/jiraApi/movesDocsWriter.js` |
| `api/linkWriter.js` | `utils/jiraApi/movesDocsWriter.js` |
| `api/confluence.js` | `utils/confluenceApi/pageSearch.js` |
| `api/backend.js` | `utils/invokeResolver.js` + `hooks/useSettings.js` · `useViewer.js` · `useRememberedProjects.js` |
| `domain/linkProperty.js` | `utils/jiraApi/movesDocsProperty.js` (Workforce 의 읽기 유틸과 같은 경로·같은 이름) |
| `domain/cql.js` | `utils/confluenceApi/cql.js` |
| `domain/documents.js`, `domain/filters.js` | `pages/project/documents.js`, `pages/project/filters.js` |
| `utils/queryKeys.js` | `utils/queryKey/settingKeys.js` · `viewerKeys.js` · `projectKeys.js` · `movesDocsKeys.js` · `confluenceKeys.js` + `queryKeyContract.test.js` · `queryKeyFactories.test.js` |
| `utils/links.js` 의 `buildDocumentUrl` | `utils/jiraApi/movesDocsProperty.js` (Workforce 와 같은 자리). 나머지는 `utils/links.js` 그대로 |
| `components/DataTable.jsx` | `components/table/CommonTable.jsx` · `TableSurface.jsx` · `tableSort.js` · `skeletonRows.js` · `table.css` |
| `components/Skeleton.jsx` | `components/skeleton/Skeleton.jsx` (`SkeletonLines` → `SkeletonText`) |
| `components/StatusLozenge.jsx` | `components/lozenge/StatusLozenge.jsx` · `statusAppearance.js` |
| `components/AppShell.jsx` | `layout/AppLayout.jsx` · `layout/appLayout.css` |
| 각 화면 상단의 제목 | `components/layout/PageContainer.jsx` · `PageHeader.jsx` |
| `components/LoadError.jsx` | `components/error/LoadError.jsx` |
| 표의 빈 안내(`<p>`) | `components/chart/EmptyState.jsx` |
| `components/IssueResultList.jsx` | `pages/project/IssueResultList.jsx` (프로젝트 화면만 쓴다) |
| `i18n/ko.json`, `i18n/en.json` | 루트 `locales/kr/*.json`, `locales/en/*.json` (14개씩) → `locales/script/merge.js` → `locales/ko-KR.json`, `en-US.json` |
| `stores/useI18nStore.js` (자체 사전) | `stores/useI18nStore.js` (`@forge/bridge` 의 `i18n`) + `utils/i18n.js`(`tFormat`) |
| `app.css` | `app.css`(화면 공통) + `layout/appLayout.css`(앱 틀) + `components/table/table.css`(표) |

테스트 파일은 대상 파일을 따라 옮겼다.

| 옛 테스트 | 새 테스트 |
|---|---|
| `api/__test__/jira.test.js` | `utils/jiraApi/__test__/movesDocsSearch.test.js` (+ `readIssueLink` 3건은 `movesDocsWriter.test.js` 로) |
| `api/__test__/linkWriter.test.js` | `utils/jiraApi/__test__/movesDocsWriter.test.js` |
| `api/__test__/confluence.test.js` | `utils/confluenceApi/__test__/pageSearch.test.js` |
| `domain/__test__/linkProperty.test.js` | `utils/jiraApi/__test__/movesDocsProperty.test.js` |
| `domain/__test__/cql.test.js` | `utils/confluenceApi/__test__/cql.test.js` |
| `domain/__test__/documents.test.js`, `filters.test.js` | `pages/project/__test__/documents.test.js`, `filters.test.js` |
| `i18n/__test__/i18n.test.js` | `__test__/locales.test.js` + `stores/__test__/useI18nStore.test.js` |

이름만 바뀐 것: CSS 클래스 접두사가 `docs-` 로(앱 틀은 Workforce 처럼 `app-`), 브랜드 색 변수가 `--docs-brand` 로,
상수 `PROPERTY_KEY` 가 `MOVES_DOCS_PROPERTY_KEY` 로(Workforce 와 같은 이름) 바뀌었다.
옛 접두사는 옛 제품 이름의 머리글자였다.

### 2. Workforce 에서 가져온 파일

첫머리에 출처를 주석으로 남겼다. "그대로"는 내용을 바꾸지 않은 것, "일부"는 쓰는 것만 가져온 것이다.

| 이 저장소의 파일 | Workforce 의 파일 | 가져온 범위 |
|---|---|---|
| `src/error/LogicalError.js` | `src/error/LogicalError.js` | 그대로 |
| `src/error/PermissionError.js` | `src/error/PermissionError.js` | 그대로 |
| `src/error/ForgeAPIError.js` | `src/error/ForgeAPIError.js` | `static init` 제외 |
| `src/utils/ResponseWrapper.js` | `src/utils/ResponseWrapper.js` | 라이선스 판정 제외 |
| `src/permission/permissionGuard.js` | `src/permission/permissionGuard.js` | 일부 — `guardedDefine` 의 뼈대. 리소스 grant·프로젝트 범위·팀장 축 제외 |
| `src/api/jira/util/RequestJiaJson.js` | `src/api/jira/util/RequestJiaJson.js` | 일부 — `requestJiraJson`. `as`·`fallback`·`logPrefix`·PUT/POST/DELETE 제외 |
| `src/api/jira/user/UserApi.js` | `src/api/jira/user/UserApi.js` | 일부 — `checkAdministerPermission` |
| `test/permission/permissionMap.contract.test.js` | `test/permission/permissionMap.contract.test.js` | 일부 — 등록집합 ↔ 매핑집합 대조 |
| `locales/script/merge.js` | `locales/script/merge.js` | 그대로 |
| `static/ui/src/utils/i18n.js` | `static/ui/src/utils/i18n.js` | 그대로 |
| `static/ui/src/utils/requestCore.js` | `static/ui/src/utils/jiraApi/requestJira.js` | 일부 — TYPE_MAP·주소 조립·`executeRequest`. 실패 처리는 다르다(§3) |
| `static/ui/src/utils/queryKey/queryKeyContract.test.js` | 같은 경로 | 그대로 + 검사 대상 파일 수 확인 1줄 |
| `static/ui/src/components/table/tableSort.js` | 같은 경로 | 그대로 |
| `static/ui/src/components/table/__test__/tableSort.test.js` | 같은 경로 | 그대로 |
| `static/ui/src/components/table/skeletonRows.js` | 같은 경로 | 그대로 |
| `static/ui/src/components/table/CommonTable.jsx` | 같은 경로 | 일부 — `maxHeight`·`wrapperStyle`·`isFixedSize`·`isResizable`·`stableWidths` 제외, `label` 추가 |
| `static/ui/src/components/table/TableSurface.jsx` | 같은 경로 | 일부 — 폭 동결·리사이즈·footer 제외, 로딩 중 `role="status"`·`label` 추가 |
| `static/ui/src/components/table/table.css` | 같은 경로 | 일부 — 기본 표 모양만 |
| `static/ui/src/components/skeleton/Skeleton.jsx` | 같은 경로 | 일부 — `SkeletonText`·`SkeletonCards`·`SkeletonCell`·`PageSkeleton` |
| `static/ui/src/components/lozenge/StatusLozenge.jsx` | 같은 경로 | 일부 — `IssueStatusLozenge`. `DocStatusLozenge` 는 이 앱의 것 |
| `static/ui/src/components/lozenge/statusAppearance.js` | 같은 경로 | 일부 — 이슈 상태 범주 → 모양 |
| `static/ui/src/components/layout/PageContainer.jsx`, `PageHeader.jsx` | 같은 경로 | 일부 — 제목·우측 동작. 설명·경로 표시 제외 |
| `static/ui/src/components/chart/EmptyState.jsx` | 같은 경로 | 그대로 |

가져오지 않은 것: `ColumnResizeOverlay.jsx`·`columnWidths.js`·`useStableColumnWidths.js`(표의 폭 동결·리사이즈),
`PagingTable`·`CursorPagingTable`·`TreeTable`, `ChunkErrorBoundary`(이 앱은 코드를 나눠 받지 않는다),
`CustomEntityError`·`SqlError`·`ProjectScopeError`, Workforce 의 세부 권한 모듈 전부.

`tableSort.js` 는 그대로 가져왔기 때문에 주석에 Workforce 의 사정(화면 수 등)이 남아 있고,
이 앱이 쓰지 않는 `sortKey`(옛 별칭) 처리도 들어 있다. 테스트와 함께 통째로 두는 편이 나중에 Workforce 쪽 수정을
그대로 받아 오기 쉽다고 판단했다.

### 3. Workforce 와 일부러 다르게 둔 점

| # | 다른 점 | 이유 |
|---|---|---|
| W1 | 프론트 `executeRequest` 가 실패를 `{ success:false }` 로 돌려주지 않고 **던진다** | 지시 사항. 조회 실패와 0건을 구분해 그려야 한다 |
| W2 | 백엔드 `requestJiraJson` 에 `fallback` 이 없다 | 같은 이유. 관리자 확인 실패를 "권한 없음"으로 뭉개지 않는다 |
| W3 | 권한 수준이 `PUBLIC`·`JIRA_ADMIN` 둘이고 `SELF` 가 없다 | 지시 사항(두 가지면 충분). 본인 기록 한정은 서비스가 `principal.accountId` 로 좁힌다 |
| W4 | `PUBLIC` 경로에서는 관리자 여부를 Jira 에 묻지 않는다(`principal.isJiraAdmin` 이 `null`) | 재편 전에도 `getSettings` 는 Jira 를 부르지 않았다. 매번 물으면 설정 조회가 관리자 확인 실패에 끌려 죽는다 |
| W5 | 오류 코드 `FORBIDDEN`·`ADMIN_CHECK_FAILED`·`VIEWER_UNKNOWN` 을 그대로 뒀다(Workforce 는 `PERMISSION_DENIED`·`PERMISSION_PRINCIPAL_UNRESOLVED`). 새로 생긴 `PERMISSION_UNMAPPED` 만 Workforce 이름이다 | 동작 불변 원칙. 코드 값은 응답으로 나가고 화면 문구 키(`errors.<code>`)가 이 값에 묶여 있다. **Workforce 이름으로 맞출지는 결정이 필요하다** — 맞춘다면 오류 코드·번역 키·테스트를 함께 바꾸면 된다 |
| W6 | KVS 접근 계층이 `CustomEntityManager` 가 아니라 `KeyValueManager`(단순 키-값)이고, 오류를 감싸지 않으며 로그를 남기지 않는다 | 지시 사항(Custom Entity 미도입). 감싸는 클래스(`CustomEntityError`)는 이름이 맞지 않아 가져오지 않았다. 원래 오류가 그대로 실패 응답이 된다 |
| W7 | 번역 언어를 앱이 정해 `init(locale)` 로 넘긴다 | DESIGN §7.6 의 규칙(`ko` 로 시작하면 한국어)을 지킨다. Forge 에 맡기면 `ko`·`ko_KR` 같은 표기가 영어로 떨어진다(`@forge/i18n` 의 조회 순서를 읽어 확인) |
| W8 | 번역을 받기 전의 `t` 가 `null` 이 아니라 기본값을 돌려주는 함수다 | 앱 시작 실패 안내를 그려야 한다. Workforce 는 번역을 못 받으면 로딩 화면에 머문다 |
| W9 | 공용 표에 컬럼 폭 동결·리사이즈가 없다 | 재편 전 표에 없던 기능이고, 가져오면 파일 셋이 더 따라온다 |
| W10 | 공용 표가 로딩 중 `role="status"` 와 `label` 을 가진다 | 재편 전 표가 하던 보조기술 안내를 잃지 않으려고 남겼다. 기존 테스트(`불러오는 동안은 스켈레톤이다`)가 이것을 본다 |
| W11 | 페이지 제목 태그가 `h1` 이다(크기는 Workforce 와 같은 medium) | 재편 전 문서 구조를 유지했다 |
| W12 | 요청 실행기를 `utils/requestCore.js` 로 뽑았다(Workforce 는 `requestJira.js` 한 파일) | Jira 와 Confluence 가 같은 실행기를 쓴다. 파일을 둘로 복사하면 실패 처리가 어긋날 수 있다 |
| W13 | resolver 호출을 `utils/invokeResolver.js` 로 모았다(Workforce 는 호출부마다 `success` 확인) | 실패 응답을 던지는 한 줄이 호출부마다 되풀이된다 |
| W14 | 루트가 `createRoot` 다(Workforce 는 `ReactDOM.render`) | 재편 전 그대로 |
| W15 | 들여쓰기가 섞여 있다 — 이 저장소의 코드는 2칸, Workforce 에서 그대로 가져온 파일은 4칸 | Workforce 와 나란히 놓고 비교하기 쉽게 가져온 파일의 모양을 바꾸지 않았다 |
| W16 | 백엔드 Jira 응답을 `json()` 이 아니라 `text()` 로 읽는다(재편 전에는 `json()`) | Workforce 의 요청 표준화 방식이다. 본문이 비었거나 JSON 이 아닐 때를 구분해 오류로 만든다 |

### 4. 화면에서 달라지는 것

구조를 맞추면서 **보이는 모양**이 달라진 곳이 있다. 문구와 동작은 그대로다.

| 곳 | 달라진 점 |
|---|---|
| 표 | Workforce 의 표 모양(테두리·머리글 배경·둥근 모서리). 빈 안내가 Workforce 의 빈 상태 모양(옅은 기울임 글씨) |
| 표 정렬 | 값이 전부 같거나 행이 2개 미만인 열은 정렬 화살표가 사라진다. 정렬 안내(오름차순·내림차순)가 번역된다 — 문구 3개를 `common.table.*` 로 추가했다(Workforce 의 문구와 같다) |
| 이슈 상태 표시 | 채워진 모양(Jira 의 상태 표시와 같다). 문서 상태 표시는 그대로 |
| 페이지 제목 | 크기가 large → medium. 설정 화면의 구역 제목은 medium → small |
| 현황 카드 로딩 | 스켈레톤 배치가 격자에서 Workforce 의 가로 나열로 |
| 치환 변수 | 값이 없는 변수는 빈 문자열이 된다(재편 전에는 `{count}` 가 그대로 보였다). 지금 코드에는 값을 빼고 부르는 곳이 없다 |

### 5. 테스트·빌드 실행 결과

재편을 마친 시점(검색 기능 추가 전)에 실행한 결과다.

```
(루트) npm test
  Test Suites: 6 passed, 6 total
  Tests:       95 passed, 95 total

(static/ui) npm run merge
  exit 0
  경고: [MODULE_TYPELESS_PACKAGE_JSON] … merge.js is not specified and it doesn't parse as CommonJS.
        (Workforce 의 스크립트를 그대로 가져온 것이라 같은 경고가 난다. 결과 파일은 정상)

(static/ui) npx jest
  Test Suites: 18 passed, 18 total
  Tests:       244 passed, 244 total

(static/ui) CI=true npm run build
  Compiled with warnings.
  Failed to parse source map from '…\@atlaskit\analytics-next-stable-react-context\src\context.ts' …
  Failed to parse source map from '…\@atlaskit\analytics-next-stable-react-context\src\index.ts' …
  File sizes after gzip:
    319.36 kB  build\static\js\main.feeab7eb.js
    22.78 kB   build\static\css\main.5b550714.css
  The build folder is ready to be deployed.
  exit 0

옛 이름 잔존 검사 (node_modules·build·.git 제외, 대소문자 무시)
  옛 제품 이름 문자열 → 0건
```

- 빌드 경고 2건은 재편 전과 같은 것이다(Atlaskit 패키지의 소스맵). 우리 코드에서 난 경고는 없다.
- 번들이 310.4 kB → 319.36 kB 로 늘었다. `@forge/bridge` 의 번역 기능이 들어왔기 때문으로 보인다(추정 — 번들을 분석하지는 않았다. 문구 파일 자체는 번들에 없다).
- manifest 는 Forge CLI 13.4.0 의 스키마로 다시 검증했다: `schema valid: true`. `translations` 의 key 를 틀리게 바꾼 사본은 `false`.

**테스트가 줄지 않았는지 확인한 방법.** 재편 전후로 jest 결과(JSON)에서 테스트 이름을 뽑아 대조했다.

| | 재편 전 | 재편 후 | 재편 전 이름 중 사라진 것 |
|---|---|---|---|
| 백엔드 | 59건 | 95건 | 0건 |
| 프론트 | 201건 | 244건 | 11건 — 전부 이름이 바뀐 것(아래) |

이름이 바뀐 11건:
- `언어 선택 … → "ko"/"en"` 8건 → `언어 선택 … → "ko-KR"/"en-US"` 8건. 입력은 같고 돌려주는 값이 Forge 의 언어 코드가 됐다.
- `createTranslator` 3건 → `번역 함수(Forge 의 t 와 같은 조회)` 3건 + `tFormat` 3건. 같은 단언(언어별 문구, 0 도 채운다, 없는 키는 키 그대로)을 새 함수로 옮겼다.

기존 테스트에서 고친 것은 입력 모양뿐이다:
- 서비스가 `accountId` 대신 `principal` 을 받는다(`ProjectService.test.js`).
- Jira 응답 목이 `json()` 대신 `text()` 를 준다(`SettingsController.test.js`) — 요청 표준화가 본문을 `text()` 로 읽는다.
- 실패 응답 비교가 `{ code, message }` 에서 `{ name, code, message, cause }` 로.

늘어난 테스트: 권한 계약·가드, 서비스 단독 호출, `principal` 누락, 관리자 확인 응답 해석 불가, 쿼리 키,
표 정렬(Workforce 의 테스트), 번역 파일·스토어, 문서 주소.

**새 계약 테스트가 결함을 실제로 잡는지** 네 곳을 일부러 틀리게 바꿔 확인하고 원복했다.

| 바꾼 것 | 결과 |
|---|---|
| `PermissionMap` 에서 `getViewer` 를 지움 | `permissionMap.contract.test.js` 2건 실패 |
| 컨트롤러가 `resolver.define` 을 직접 부름 | `permissionMap.contract.test.js` 1건 실패 |
| 화면 코드에 쿼리 키 배열을 직접 씀 | `queryKeyContract.test.js` 1건 실패(파일·줄 표시) |
| 문구 원본만 고치고 merge 를 하지 않음 | `locales.test.js` 1건 실패 |

### 6. 확인하지 못한 것

| # | 내용 |
|---|---|
| R1 | **화면 문구가 실제로 나오는지.** 문구를 번들에 넣던 방식에서 Forge 가 실어 주는 방식(manifest `translations`)으로 바꿨다. 배포해야 확인할 수 있다. 테스트는 같은 문구 파일을 같은 조회 함수(`@forge/i18n`)로 읽을 뿐, 파일이 화면까지 전달되는지는 보지 못한다. 전달되지 않으면 화면에 문구 대신 키(`common.save`)가 보이거나 앱 시작 실패 안내가 뜬다 → DESIGN §10 P9 |
| R2 | **실제 화면 모양.** §4 의 변화는 코드로만 확인했다. 표·상태 표시·제목이 Workforce 와 나란히 놓았을 때 같아 보이는지, 다크 모드에서 어떤지 눈으로 본 적이 없다 |
| R3 | `forge lint`·`forge deploy` — 앱 등록 전이라 실행하지 못했다. manifest 는 형식만 검증했다 |
| R4 | 실패 응답의 `cause` 에 오류 객체가 실린다(Workforce 와 같은 방식). Forge 가 응답을 실어 나를 때 이 값이 어떻게 보이는지 확인하지 못했다. 화면은 `code` 만 쓴다 |
| R5 | 가져온 파일들이 **Atlaskit 버전 차이**에서 같은 결과를 내는지. 예: `@atlaskit/lozenge` 는 Workforce 15.4.1, 이 앱 12.2.5. `isBold`·`maxWidth` 속성이 12.2.5 에 있는 것은 타입 선언으로 확인했다 |
| R6 | Workforce 저장소의 테스트·빌드는 실행하지 않았다(읽기만 했다). 그쪽 파일은 하나도 바꾸지 않았다 |
| R7 | 이전 보고서의 U1~U8 은 그대로 남아 있다 |

## 검색 기능 추가 (2026-09-30)

구조 재편을 끝내고 그 결과(위 절 §5)를 기록한 **뒤에** 시작했다. 재편과 섞지 않았다.
「문서 연결」 창의 문서 검색에 두 가지를 더했다: **본문 포함**, **스페이스 선택**.

계약은 바뀌지 않았다. 이슈 프로퍼티의 형태·키·검색 별칭 그대로이고, manifest 의 모듈·스코프도 그대로다
(Confluence 스코프는 여전히 `search:confluence` 하나). 백엔드는 손대지 않았다.

### 1. 한 일

| 항목 | 내용 |
|---|---|
| 본문 포함 | 검색 입력 옆 체크박스, 기본 꺼짐. 꺼짐이면 재편 전과 같은 검색식. 켜짐이면 `type = page AND (title ~ "<검색어>*" OR text ~ "<검색어>")` — 정렬을 붙이지 않는다 |
| 본문 발췌 | 켜짐일 때 검색 결과의 제목 아래에 두 줄까지. 강조 표식을 걷어내고 공백을 정리한다. 발췌가 없으면 그 줄을 그리지 않는다. 체크박스의 이름(라벨)에는 넣지 않았다 |
| 스페이스 선택 | 검색 입력 위, 여러 개 선택. 비어 있으면 전체. 고르면 `AND space in ("KEY1","KEY2")`(정렬이 있으면 그 앞). 키는 검색식 문자열로 이스케이프 |
| 스페이스 목록 | 문서 검색과 같은 검색 API. 선택 창을 처음 열 때 25건, 입력하면 이름으로 다시 찾는다(300ms 뒤). 키가 없는 결과는 버린다 |
| 목록 조회 실패 | 선택 상자 아래에 안내를 띄우고, 문서 검색은 전체 스페이스로 계속된다 |
| 주소 붙여넣기 | 두 옵션을 무시하고 `id = <id>` |
| 쿼리 키 | `confluenceKeys.pageSearch({ term, includeBody, spaceKeys })`. 스페이스는 고른 순서가 달라도 같은 키 |
| 문구 | `locales/kr·en/linkModal.json` 에 5개(`includeBody`, `space.label`·`placeholder`·`empty`·`loadFailed`) |

하지 않은 것(요청에 없음): 최근 검색어 저장, 선택 기억, 결과 더 보기, 스페이스 목록 정렬 지정.

### 2. 바뀐 파일 (`static/ui/src/` 기준)

| 파일 | 내용 |
|---|---|
| `utils/confluenceApi/cql.js` | `buildSearchCql` 의 인자가 문자열에서 `{ term, includeBody, spaceKeys }` 로. 추가: `normalizeSpaceKeys`, `isBodySearch`, `buildSpaceCql`, `cleanExcerpt`, `toPageInfoWithExcerpt`, `toSpaceInfo`, `SPACE_LIMIT` |
| `utils/confluenceApi/pageSearch.js` | `searchPages` 의 인자가 같은 객체로. 본문까지 찾을 때만 결과에 발췌를 싣는다 |
| `utils/confluenceApi/spaceSearch.js` | 신규 — `searchSpaces` |
| `utils/queryKey/confluenceKeys.js` | `pageSearch` 가 옵션을 받는다. `spaceSearch` 추가 |
| `pages/project/LinkModal.jsx` | 스페이스 선택, 본문 포함, 발췌 표시 |
| `app.css` | 검색 줄·발췌·실패 안내 모양 4개 |
| `locales/kr/linkModal.json`, `locales/en/linkModal.json` (루트) | 문구 5개 |
| `docs/DESIGN.md` | §7.2(호출 표·규칙), §7.5(창 설명), §10(P10·P11) |

스페이스 응답의 해석은 `toSpaceInfo`, 발췌의 해석은 `cleanExcerpt` **한 곳씩**에 모았다. 실제 응답이 다르면 거기만 고치면 된다.

### 3. 설계와 다르게 하거나 정한 것

| # | 내용 | 이유 |
|---|---|---|
| S1 | 발췌를 싣는 함수를 `toPageInfo` 와 따로 뒀다(`toPageInfoWithExcerpt`) | `toPageInfo` 는 저장값 갱신에 쓰는 최신 정보 조회도 같이 쓴다. 화면 표시용 값이 그쪽으로 흘러가지 않게 했다 |
| S2 | 제목만 찾을 때는 응답에 발췌가 있어도 싣지 않는다 | 요청이 "켜짐일 때" 보여 주라는 것이었다 |
| S3 | 발췌가 이슈에 저장되지 않는 것은 **두 겹**으로 막힌다 — 화면이 저장할 값만 골라 담고, 계약 계층(`normalizePage`)이 계약의 속성만 남긴다 | 테스트를 만들다 확인했다. 화면이 검색 결과를 통째로 넘기도록 바꿔도 저장값에는 발췌가 없었다. 그래서 계약 계층에도 테스트를 추가했다 |
| S4 | 스페이스 입력이 문법 문자뿐이면(`***`) 입력이 없는 것으로 보고 처음 25건을 보여 준다 | 정리하고 남는 것이 없는 입력으로 `title ~ "*"` 를 보내지 않는다 |
| S5 | 스페이스 선택 목록에는 이름만 보인다(키는 보이지 않는다) | 개인 스페이스의 키는 사람이 읽을 수 없는 값이다. 이름이 같은 스페이스가 둘이면 구분이 안 된다 — 필요하면 키를 함께 보여 주도록 바꾼다 |
| S6 | 스페이스 목록을 받는 동안 선택 창 안에 스켈레톤을 그린다 | Atlaskit 선택 상자의 로딩 표시는 돌아가는 점이다. 스피너를 쓰지 않는 규칙에 맞췄다 |
| S7 | 받은 스페이스 목록을 화면에서 다시 거르지 않는다 | 찾기는 서버가 한다. 화면이 입력 글자로 한 번 더 거르면 서버가 찾아 준 결과가 사라질 수 있다 |
| S8 | 영어 문구 — 본문 포함: "Include page content", 스페이스: "Spaces" / "All spaces" | 요청에 한국어 문구만 있었다. **검토가 필요하다** |

### 4. 테스트·빌드 실행 결과

```
(루트) npm test
  Test Suites: 6 passed, 6 total
  Tests:       95 passed, 95 total          ← 재편 직후와 같다(백엔드는 바꾸지 않았다)

(static/ui) npm run merge
  exit 0   (경고는 재편 절과 같은 것)

(static/ui) npx jest
  Test Suites: 22 passed, 22 total
  Tests:       337 passed, 337 total        ← 재편 직후 244건

(static/ui) CI=true npm run build
  Compiled with warnings.                   ← 재편 절과 같은 소스맵 경고 2건
  File sizes after gzip:
    320.09 kB (+739 B)  build\static\js\main.6b92b70f.js
    22.88 kB (+102 B)   build\static\css\main.30f97d48.css
  The build folder is ready to be deployed.
  exit 0

옛 이름 잔존 검사 → 0건
```

재편 직후의 테스트 이름 중 사라진 것은 0건이다(같은 방법으로 대조). 기존 테스트에서 고친 것은 호출 모양뿐이다 —
`buildSearchCql('결제')` → `buildSearchCql({ term: '결제' })`, `searchPages`·`confluenceKeys.pageSearch` 도 같다.
기대하는 검색식은 한 글자도 바꾸지 않았다.

요청받은 테스트와 위치:

| 항목 | 파일 |
|---|---|
| 검색식 조립 — 옵션 조합 4가지 | `utils/confluenceApi/__test__/searchOptions.test.js` |
| 스페이스 키 이스케이프(따옴표·역슬래시·개인 스페이스 `~`) | 같은 파일 |
| 주소 붙여넣기 우선(옵션 조합 4가지 모두에서) | 같은 파일, `pageSearchOptions.test.js`, `linkModalSearch.test.jsx` |
| 발췌 표식 제거 | `searchOptions.test.js`(`cleanExcerpt`), `linkModalSearch.test.jsx`(화면에 표식이 없다) |
| 스페이스 결과 해석 — 키 없는 결과 버림 | `searchOptions.test.js`(`toSpaceInfo`), `spaceSearch.test.js`, `linkModalSearch.test.jsx` |
| 스페이스 조회 실패 시 문서 검색이 계속 되는지 | `linkModalSearch.test.jsx` — 실패 안내가 뜨고, 검색식에 스페이스 조건이 없고, 문서를 골라 저장할 수 있다 |
| 옵션을 바꾸면 새 결과가 보이는지(쿼리 키) | `linkModalSearch.test.jsx`, `utils/queryKey/queryKeyFactories.test.js` |
| 발췌를 저장하지 않는지 | `linkModalSearch.test.jsx`, `utils/jiraApi/__test__/movesDocsProperty.test.js` |
| Confluence 주소가 검색 하나뿐인지 | `spaceSearch.test.js` |

테스트가 결함을 실제로 잡는지 다섯 곳을 일부러 틀리게 바꿔 확인하고 원복했다.

| 바꾼 것 | 결과 |
|---|---|
| 쿼리 키에서 본문 포함을 뺌 | 2건 실패(키 테스트, 화면 테스트 — 옵션을 켜도 옛 결과가 보임) |
| 쿼리 키에서 스페이스를 뺌 | 1건 실패 |
| 본문 검색에 정렬을 붙임 | 5건 실패 |
| 화면이 검색 결과를 통째로 저장 | **실패 0건** — 계약 계층이 걸러 내서 저장값이 같았다(S3). 이 변이만으로는 잡히지 않는다 |
| 위에 더해 계약 계층이 모르는 속성을 통과시킴 | 9건 실패 |

### 5. 확인하지 못한 것

전부 실제 Confluence 가 있어야 확인할 수 있는 것이다. 테스트는 우리가 보내는 검색식과 받은 값의 해석만 본다.

| # | 내용 |
|---|---|
| F1 | **스페이스 목록을 검색 API 로 가져올 수 있는지**, 응답에 `space.key`·`space.name` 이 있는지 → DESIGN §10 P10. 응답 형태는 추정이다. 다르면 선택 목록이 비어 보인다(키가 없는 결과를 버리므로). 이때 화면은 "찾은 스페이스가 없습니다"라고 하므로 **실패처럼 보이지 않는다** — 실측할 때 이 점을 염두에 둔다 |
| F2 | **본문 검색이 한글에서 동작하는지**, 정렬 없이 관련도 순으로 오는지, 응답에 `excerpt` 가 실리는지 → P11 |
| F3 | `search:confluence` 스코프 하나로 `type = space` 검색이 허용되는지. 문서 검색(P5)과 같은 주소라 같을 것으로 보지만 확인하지 못했다 |
| F4 | 발췌에 강조 표식 말고 다른 것(HTML 태그, `&hellip;` 같은 문자 참조)이 섞여 오는지. 섞여 오면 글자 그대로 보인다(화면을 깨뜨리지는 않는다) |
| F5 | `space in (…)` 에 넣은 개인 스페이스 키(`~…`)가 실제로 통하는지 |
| F6 | 실제 화면 모양 — 선택 상자·체크박스·발췌의 배치와 줄임 표시. 눈으로 본 적이 없다 |
| F7 | 스페이스가 25개를 넘는 사이트에서 입력 없이 처음 보이는 25건이 어떤 순서인지(검색식에 정렬을 지정하지 않았다) |

## 라이선스 검사 추가 (2026-09-30)

이 앱은 마켓에 유료로만 등록할 수 있고, 유료 앱의 라이선스 검사는 앱이 직접 해야 한다.
Moves Workforce 의 방식을 따라 백엔드·화면 양쪽에 검사를 넣었다. 설계는 DESIGN §7.7, 한계는 §9, 실측 항목은 §10 P12·P13.

`package.json` 과 잠금 파일은 건드리지 않았다(루트·`static/ui` 모두). 새 패키지는 필요하지 않았다.
Workforce 저장소는 읽기만 했다.

### 1. 판정 표

화면과 백엔드가 **같은 입력표**(`test/license/licenseDecisionTable.json`, 28행)를 통과한다.
두 쪽은 별도 패키지라 코드를 공유하지 못하므로 표를 공유했다.

| 입력(`context`) | 상태 | 동작 |
|---|---|---|
| `license.active === true` (환경 무관, 평가판 포함) | `ACTIVE` | 통과 |
| `license.active === false` (환경 무관 — 개발·스테이징이어도) | `INACTIVE` | **차단** |
| 라이선스 정보 없음 + 환경 development·staging | `NOT_APPLICABLE` | 통과 |
| 라이선스 정보 없음 + 운영 환경 | `UNAVAILABLE` | 통과 |
| 라이선스 정보 없음 + 모르는 환경(터널 등)·환경 정보 없음 | `UNAVAILABLE` | 통과 |
| 컨텍스트 없음 / 화면에서 컨텍스트 조회 실패 | `UNAVAILABLE` | 통과 |
| 형태가 이상한 값 — `license` 가 `null`·문자열·`false`·배열·빈 객체, `active` 가 `"false"`·`"true"`·`0`·`null` | 환경에 따라 `UNAVAILABLE` 또는 `NOT_APPLICABLE` | 통과 |

차단은 `license.active` 가 **정확히 `false`** 일 때뿐이다.

### 2. 추가·변경한 파일

| 파일 | 내용 |
|---|---|
| `manifest.yml` | `app.licensing.enabled: true`. 모듈·스코프 변경 없음, `displayConditions` 없음 |
| `src/utils/license/LicenseGuard.js` (신규) | `getLicenseDecision`, `assertLicenseAllowed`, `readEnvironmentType` — `req.context` 만 보는 순수 함수 |
| `src/utils/ResponseWrapper.js` | 맨 앞에서 `assertLicenseAllowed(req.context)`. 모든 resolver 가 지나는 한 곳 |
| `src/utils/errors/ErrorCodes.js` | `LICENSE_INACTIVE` (Workforce 와 같은 코드) |
| `test/license/licenseDecisionTable.json` (신규) | 화면·백엔드 공용 입력표 |
| `test/license/licenseGuard.allResolvers.test.js` (신규) | 등록 목록을 돌며 모든 resolver 확인 |
| `test/license/manifest.license.test.js` (신규) | manifest 선언 확인 |
| `src/utils/license/__test__/LicenseGuard.test.js` (신규) | 백엔드 판정 표 |
| `static/ui/src/stores/licenseDecision.js` (신규) | Workforce 것 그대로 |
| `static/ui/src/stores/useLicenseStore.js` (신규) | Workforce 것 그대로(평가판 조건 포함). 머리 주석만 고쳤다 |
| `static/ui/src/pages/license/LicenseGuidePage.jsx` (신규) | 안내 페이지. 마켓 주소가 없으면 버튼 없음 |
| `static/ui/src/pages/license/TrialExpiryBanner.jsx` (신규) | 평가판 만료 임박 안내 |
| `static/ui/src/pages/license/licenseConstants.js` (신규) | `MARKETPLACE_URL`(지금은 빈 값), `hasMarketplaceUrl`, `trialDismissKey` |
| `static/ui/src/utils/image/LockClosedImage.png` (신규) | Workforce 의 그림 파일 그대로(같은 경로) |
| `static/ui/src/App.jsx` | 시작 순서에 라이선스 판정 추가, 비활성이면 안내 페이지만 렌더, 앱 화면 위에 평가판 안내 |
| `static/ui/src/pages/settings/SettingsPage.jsx` | 저장 실패 사유에 `LICENSE_INACTIVE` 추가 |
| `static/ui/src/app.css` | 안내 아래 여백 1개 |
| `locales/kr/license.json`, `locales/en/license.json` (신규) | 안내 페이지 3개, 평가판 안내 3개 |
| `locales/kr/errors.json`, `locales/en/errors.json` | `LICENSE_INACTIVE` 1개 |
| 화면 테스트 4개 (신규) | `stores/__test__/licenseDecision.test.js`·`useLicenseStore.test.js`, `pages/license/__test__/license.test.jsx`, `__test__/App.license.test.jsx` |

평가판 만료 임박 안내의 판단 근거(Workforce 의 `computeTrialBanner` 를 코드로 확인해 그대로 가져왔다):
`license.active === true` **이고** `license.isEvaluation === true` **이고** 만료일까지 0~7일.
만료일은 `evaluationEndDate` → `subscriptionEndDate` → `trialEndDate` 순으로 처음 있는 값.
닫으면 브라우저 저장소에 기억하고 키에 만료일이 들어간다(만료일이 바뀌면 다시 보인다).

### 3. Workforce 와 다르게 둔 점

| # | 다른 점 | 이유 |
|---|---|---|
| L1 | 백엔드 판정이 `req.context` 만 본다. Workforce 는 운영 환경에서 `context.license` 가 없으면 License API 로 직접 조회해 확정하고, 그때 "응답은 왔는데 라이선스가 없음"을 **차단**한다 | 지시 사항(예약 작업·큐가 없어 직접 조회를 가져오지 않는다). **결과: 운영 환경에서 라이선스 정보가 오지 않는 설치는 이 앱에서 통과한다.** Workforce 에서는 그 경우가 차단될 수 있다 → §5 의 N1 |
| L2 | 백엔드 판정이 환경변수·`getAppContext()` 를 보지 않는다 | Workforce 가 그것을 보는 이유는 컨텍스트가 없는 큐·예약 작업 때문이다. 이 앱에는 없다. 환경 값은 상태 이름(`NOT_APPLICABLE`/`UNAVAILABLE`)만 가르고 차단 여부에는 영향이 없다 |
| L3 | 백엔드 판정 함수가 동기 함수이고 `{ state }` 만 돌려준다(Workforce 는 비동기, `{ state, source, checkedAt }`) | 조회도 캐시도 없다 |
| L4 | 평가판 안내를 `@atlaskit/section-message` 로 그린다(Workforce 는 `@atlaskit/banner` + `@atlaskit/icon`) | 두 패키지가 이 앱에 설치돼 있지 않다. 패키지를 추가하지 않고 이미 쓰는 것으로 그렸다. **노출 조건과 닫기 기억은 같다.** 모양은 화면 폭 전체의 띠가 아니라 내용 위의 안내 상자다 |
| L5 | 마켓 주소가 비어 있으면(또는 `https://` 로 시작하지 않으면) 구매 버튼·링크를 그리지 않는다 | 지시 사항. Workforce 는 주소가 항상 있다 |
| L6 | 안내 문구에서 "아래 버튼에서"를 뺐다 | 버튼이 없을 수 있다 |
| L7 | 화면이 `view.getContext()` 를 시작할 때 두 번 부른다(앱 시작 1번, 라이선스 스토어 1번) | 스토어를 Workforce 것 그대로 두려고 했다. Workforce 도 여러 곳에서 따로 부른다 |
| L8 | Workforce 의 스토어·테스트에 남아 있는 "판정 불가는 차단(fail-closed)"이라는 설명을 옮기지 않았다 | 코드는 통과시키고, 정책 문서(2026-08-10)도 통과로 확정했다. 설명만 옛것이다 |
| L9 | 오류 코드는 `LICENSE_INACTIVE` 하나만 가져왔다(Workforce 에는 `LICENSE_STATUS_UNAVAILABLE` 도 있다) | 판정 불가는 통과이므로 던질 일이 없다 |

### 4. 테스트·빌드 실행 결과

```
(루트) npm test
  Test Suites: 9 passed, 9 total
  Tests:       281 passed, 281 total        ← 라이선스 추가 전 95건

(static/ui) npm run merge
  exit 0

(static/ui) npx jest
  Test Suites: 26 passed, 26 total
  Tests:       431 passed, 431 total        ← 라이선스 추가 전 337건

(static/ui) CI=true npm run build
  Compiled with warnings.                   ← 이전과 같은 소스맵 경고 2건
  File sizes after gzip:
    330.55 kB (+956 B)  build\static\js\main.639ffc0f.js
    22.9 kB (+11 B)     build\static\css\main.75de9bd6.css
  The build folder is ready to be deployed.
  exit 0
  (안내 그림은 build\static\media\LockClosedImage.*.png 로 따로 나간다 — 176 kB)

옛 이름 잔존 검사 → 0건
manifest 형식 검증(Forge CLI 13.4.0 스키마) → schema valid: true
```

- 증가분 `+956 B` 는 빌드 폴더에 있던 직전 빌드 대비다. 검색 기능 절의 320.09 kB 와 차이가 큰 것은 그사이 `@forge/bridge` 가 5.x 에서 7.1.0 으로 올라갔기 때문으로 보인다(추정 — 직전 빌드는 내가 만든 것이 아니다).
- 라이선스 추가 전의 화면 테스트 이름 중 사라진 것은 0건이다(같은 방법으로 대조).
- 기존 테스트는 고치지 않았다. `locales.test.js` 의 오류 코드 목록에 `LICENSE_INACTIVE` 를 더한 것이 전부다.

요청받은 테스트와 위치:

| 항목 | 파일 |
|---|---|
| 판정 표 — 정보 없음 / 활성 / 비활성 / 형태가 이상한 값 | 백엔드 `src/utils/license/__test__/LicenseGuard.test.js`, 화면 `stores/__test__/licenseDecision.test.js` — 같은 표 28행 |
| 비활성이면 **모든** 등록 함수가 거부되는지 | `test/license/licenseGuard.allResolvers.test.js` — `CONTROLLER_REGISTRARS` 로 등록한 함수 전부 × 표의 차단 행 전부. 응답 형태까지 비교하고, 거부할 때 Jira·저장소를 한 번도 부르지 않았는지 본다 |
| 정보 없음이면 통과하는지 | 같은 파일 — 등록 함수 전부 × 표의 통과 행 전부 |
| 선언하지 않은 함수도 라이선스 확인을 지나는지 | 같은 파일 |
| 비활성이면 안내 페이지만 보이고 다른 조회가 시작되지 않는지 | `__test__/App.license.test.jsx` — 앱 틀·홈 화면이 없고 `invoke`·`requestJira`·`requestConfluence` 호출 0회 |
| 마켓 주소가 비면 버튼이 없는지 | `pages/license/__test__/license.test.jsx`, `App.license.test.jsx` |
| 평가판 안내 조건(경계 0일·7일·8일, 지난 날짜, 읽을 수 없는 날짜) | `stores/__test__/useLicenseStore.test.js` |
| 닫기 기억, 만료일이 바뀌면 다시 보임 | `pages/license/__test__/license.test.jsx` |
| manifest 선언, 표시 조건 없음, 스코프 불변 | `test/license/manifest.license.test.js` |

테스트가 결함을 실제로 잡는지 다섯 곳을 일부러 틀리게 바꿔 확인하고 원복했다.

| 바꾼 것 | 결과 |
|---|---|
| 화면의 라이선스 분기를 없앰 | `App.license.test.jsx` 4건 실패 |
| 공통 래퍼에서 라이선스 확인을 뺌 | `test/license` 26건 실패 |
| 화면이 판정 불가를 차단하게 함 | 20건 실패 |
| 백엔드가 활성이 아니면 전부 차단하게 함 | 116건 실패 |
| 백엔드만 문자열 `"false"` 도 차단하게 함(화면과 경계가 어긋남) | 2건 실패 |

### 5. 확인하지 못한 것

라이선스는 **유료로 등록된 앱의 운영 환경**에서만 실제 값이 온다. 아래는 전부 목으로만 확인했다.

| # | 내용 |
|---|---|
| N1 | **운영 환경에서 `context.license` 가 화면과 resolver 양쪽에 항상 실려 오는지**, 미결제·만료 설치가 `active: false` 로 오는지 → DESIGN §10 P12. **이것이 가장 중요하다.** 오지 않는 경우가 있으면 그 설치는 화면·백엔드 모두 통과한다(L1). Workforce 정책 문서는 라이선스 조회가 "라이선스 없음"을 `active:false` 가 아니라 빈 값으로 답할 수 있다고 적고 있다 — 컨텍스트도 그런지는 알지 못한다 |
| N2 | 평가판의 만료일이 어느 필드로 오는지 → P13. `@forge/bridge` 7.1.0 의 타입 선언에는 `isEvaluation`·`subscriptionEndDate`·`trialEndDate` 가 있고 `evaluationEndDate` 는 없다. Workforce 의 순서를 그대로 썼으므로 두 날짜가 다 오면 `subscriptionEndDate` 가 먼저 쓰인다 — 평가판에서 그 값이 무엇을 뜻하는지 확인하지 못했다. 틀려도 차단 판정에는 영향이 없고 안내가 뜨는 시점만 달라진다 |
| N3 | 라이선스 상태를 지정한 설치(`forge install --license inactive` 등)로 개발 환경에서 확인할 수 있는지. Forge CLI 13.4.0 의 도움말에 옵션이 있는 것만 확인했다. 실행하지 않았다 |
| N4 | `licensing.enabled: true` 인 앱을 마켓 등록 전에 배포·설치할 수 있는지. 형식 검증만 했다 |
| N5 | resolver 의 `req.context` 에 `environmentType` 이 어떤 값으로 오는지. 차단 여부에는 영향이 없다(상태 이름만 달라진다) |
| N6 | 실제 화면 모양 — 안내 페이지, 평가판 안내 상자의 위치와 크기. 눈으로 본 적이 없다 |
| N7 | 화면만 막히는 호출(이슈 검색, 연결 정보 읽기·쓰기, 문서·스페이스 검색)이 비활성 상태에서 실제로 부를 수 있는 상태인지 직접 시험하지 않았다. 구조로 판단한 것이다(DESIGN §9) |


## 검수 2차 반영 (2026-09-30) — 패키지·Codex 전체 검수·보안 감사

### 패키지 버전 정리
- 백엔드: `@forge/api` ^8.2.0, `@forge/resolver` ^2.0.0, `@forge/kvs` ^2.0.7 (주 버전 변경 내역 확인: storage 모듈 제거·TS5 지원뿐). `engines` 22.x, `.nvmrc` 22.22.0.
- 프론트: `@forge/bridge` ^7.1.0 (5.x 가 `linkify-it`·`undici` 취약점을 끌고 옴). `overrides`: typescript ^5(bridge 7 의 peer 요구와 react-scripts 의 peer 요구 충돌 해소), js-yaml·qs·underscore·nth-check(빌드 도구 취약점 축소).
- 결과: `npm audit --omit=dev` 루트·프론트 모두 **0건**. 개발 도구는 34건 → 25건(나머지는 react-scripts 5 자체).

### Codex 전체 검수 (9건)
수정 5: Confluence 재조회 실패가 옛 값에 가려짐(높음) · 연결 문서 0건일 때 Confluence 미연결 감지 불가 · 분류가 섞인 문서를 그대로 저장하면 분류 삭제 · 저장 중 모달 닫기 · 누락 분류 카드 클릭이 항상 빈 목록.
보류 4: 삭제된 이슈의 분류 변경이 성공으로 보임(드묾) · 초기 로딩 문구 영어 고정(번역 전 단계) · 상한 동시 호출(→ 보안 감사 M-2 로 구조 변경하며 해소) · Workforce 에서 가져온 표 정렬 코드의 호환 분기(같은 코드 유지가 목적).

### 독립 보안 감사
`docs/SECURITY_AUDIT.md` §0 조치 결과 참조. 계약 변경: **`url` 필드 제거, 링크는 id 로 조립, 읽기 상한 강제** — Workforce 쪽 같은 이름 파일도 함께 고쳤다.

### 재실행 결과
| | 결과 |
|---|---|
| 루트 `npm test` | 9 스위트 285건 통과 |
| `static/ui` jest | 27 스위트 446건 통과 |
| `CI=true npm run build` | 성공, 소스맵 0건, main 330.93 kB |
| Workforce `static/ui` jest | 127 스위트 2,058건 통과 |
