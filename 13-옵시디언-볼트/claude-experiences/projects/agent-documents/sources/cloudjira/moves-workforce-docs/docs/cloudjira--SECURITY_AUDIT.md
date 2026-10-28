# Moves Workforce Docs — 독립 보안 감사 보고서

> 감사일 2026-09-30 · 읽기 전용 감사(코드·설정·패키지 변경 없음)
> 대상 ① `moves-workforce-docs` 전체(커밋 전 작업 트리) ② `moves-workforce` 의 문서 탭 추가분(`develop`, 작업 트리)
> 기준 문서: `docs/DESIGN.md` v1.0 — §9(알려진 한계)에 적힌 항목은 발견으로 다시 올리지 않았다. 설명이 코드와 다르거나 범위를 좁게 적은 부분만 지적했다.
> 전제: 로그인한 일반 사용자는 브라우저 개발자 도구로 `invoke`·`requestJira`·`requestConfluence` 를 직접 부를 수 있다. 이슈 프로퍼티 `movesDocs` 는 이슈 편집 권한이 있는 누구나(다른 앱·REST 직접 호출 포함) 임의 값으로 쓸 수 있다.

## 0. 조치 결과 (2026-09-30, 감사 뒤 반영)

| 발견 | 조치 | 내용 |
|---|---|---|
| M-1 | **수정** | 읽는 쪽(두 저장소)이 30건·글자 수·id 형식(숫자 1~19자리)을 강제. 최신 정보 조회는 500건까지(`MAX_LOOKUP_PAGES`), 넘는 문서는 "확인 불가"로 표시하고 상단에 알림. `canLink` 는 "Confluence 검색 가능"(연결 문서가 없으면 가벼운 검색 1회)에 묶음 |
| M-2 | **수정** | 사용자당 키 하나(`projects:<accountId>`)에 목록을 값으로 저장. 호출당 읽기 1·쓰기 1, 동시 호출로도 100건을 넘지 못함(테스트로 확인). 접두사 조회·삭제 코드 제거 |
| M-3 | **수정** | 계약에서 `url` 필드 제거. 링크는 양쪽 모두 `/wiki/pages/viewpage.action?pageId=<id>` 로 id 에서만 조립. 옛 값에 `url` 이 있어도 읽을 때 버림 |
| L-1 | **수정** | `craco.config.js` 가 production 빌드에서 `devtool=false`. 빌드 산출물에 `.map` 0건 확인 |
| L-2 | **수정** | `ResponseWrapper` 가 우리 오류 클래스(`LogicalError`·`PermissionError`·`ForgeAPIError`)의 코드만 내보내고, 그 밖은 `UNKNOWN_ERROR` 고정 문구. `ForgeAPIError` 는 상태 코드만. `cause` 는 항상 빈 값 |
| L-3 | **수정** | id 가 숫자만 허용되므로 `constructor` 같은 값은 항목 자체가 버려짐. 조회 결과 접근도 `Object.hasOwn` 으로 바꿈 |
| L-4 | **수정** | Workforce 문서 탭에 `canRender: canReadProject`, 이슈 조회는 프로젝트 범위 판정(`findProjectById` 성공) 뒤에만 시작. DESIGN §9 에 Workforce 탭도 같은 성격임을 명시 |
| L-5 | **수정** | 주소로 받은 이름은 그 프로젝트의 이슈가 1건 이상 조회된 뒤에만 기억 |
| L-6 | 보류 | 빌드 도구(react-scripts) 취약점. 배포물에 들어가지 않음. 도구 교체는 제품군 공통 과제로 기록 |
| L-7 | 문서화 | DESIGN §9 에 "화면을 열면 최신 제목이 사용자 동작 없이 Jira 에 복사된다" 추가 |
| I-1 | 해소 | M-2 의 단일 키 구조로 접두사 조회 자체가 없어짐 |
| I-2 | 보류 | 값의 출처가 Forge 컨텍스트라 도달 어려움 |
| I-3 | **수정** | 가드가 `accountId` 없는 호출을 PUBLIC 이어도 거부(`VIEWER_UNKNOWN`) |
| I-4 | **수정** | `{ ...result, success: true }` 순서 |
| I-5 | 유지 | Atlaskit 인라인 스타일 때문. 심사 답변에 사유 기재 |
| I-6 | 보류 | `@compiled/react` 는 Atlaskit 동반 의존성. 설치 스크립트 1건은 `@forge/bridge` 하위 |
| I-7 | 문서화 | DESIGN §9 에 "연결 정보는 감사 기록이 아니다" 추가 |
| I-8 | **수정** | 계약 테스트가 `src/` 전체에서 `resolver.define` 직접 호출을 검사(가드 파일 하나만 허용) |
| I-9 | 대기 | 앱 등록 뒤 값 확인 |
| W-DEP | 보고 | Workforce 기존 의존성 취약점은 이번 범위 밖. 제품 소유자에게 보고 |

반영 뒤 재실행: 백엔드 285건, 프론트 446건 통과, `CI=true` 빌드 성공(소스맵 0건). Workforce 프론트 2,058건 통과.

## 1. 요약

| 심각도 | 건수 | 항목 |
|---|---|---|
| 치명 | 0 | - |
| 높음 | 0 (신규 앱) | 별도: Workforce 기존 운영 의존성에 높음 등급 권고 다수(W-DEP, 이번 변경과 무관) |
| 중간 | 3 | M-1, M-2, M-3 |
| 낮음 | 7 | L-1 ~ L-7 |
| 참고 | 9 | I-1 ~ I-9 |

인증·권한 우회, 다른 사용자 데이터 접근, 스크립트 주입(XSS), 검색식 주입, 비밀 값 노출은 **발견되지 않았다**. 발견은 전부 "신뢰할 수 없는 입력에 상한이 없다"와 "상한·제한이 있다고 적었지만 우회된다"에 몰려 있다.

### 배포 전 반드시 고칠 것

1. **M-1** 이슈 프로퍼티 읽기 경로에 개수·길이 상한 추가(두 저장소의 `movesDocsProperty.js` 모두), 최신 정보 조회 대상 id 수 상한, 조회 일부 실패가 「문서 연결」 전체를 막지 않게 분리.
2. **M-2** `touchProject` 의 상한을 경합에 견디게 바꾸고(사용자당 1건짜리 목록 값으로 저장), 호출당 삭제 수에 상한을 둔다.
3. **M-3** 문서 주소를 저장된 경로로 조립하지 말고 페이지 id 로 조립하거나, 경로에서 `..`·`%2e`·`\`·제어 문자를 거부한다(두 저장소 모두).
4. **L-1** 운영 빌드에서 소스맵을 빼고(`GENERATE_SOURCEMAP=false`) 배포한다.
5. **W-DEP** (Workforce, 이번 변경 밖) 운영 의존성의 높음 등급 권고를 해소한다 — 마켓 요구사항 9번은 앱 단위로 적용된다.

L-2 ~ L-7 은 심사 통과를 막는 수준은 아니지만 L-2(오류 메시지)와 L-4(문서 탭 권한 게이트)는 수정량이 작아 같이 처리하기를 권한다.

---

## 2. 발견 목록

### M-1 (중간) 읽기 경로에 상한이 없어, 이슈 편집 권한자가 프로젝트 화면을 마비시키고 열람자의 Confluence 호출 한도를 소모시킬 수 있다

- **위치**
  - `moves-workforce-docs/static/ui/src/utils/jiraApi/movesDocsProperty.js:72-105` (`normalizePage`·`normalizePages`·`readPages` — 개수·문자열 길이 상한 없음)
  - `moves-workforce-docs/static/ui/src/pages/project/useProjectData.js:32-41` (모든 이슈의 고유 id 전부를 조회 대상으로 삼음)
  - `moves-workforce-docs/static/ui/src/utils/confluenceApi/pageSearch.js:40-47`, `cql.js:87` (`/^\d+$/` — 자릿수 상한 없음, 묶음 하나가 실패하면 전체가 실패)
  - `moves-workforce-docs/static/ui/src/pages/project/ProjectPage.jsx:69` (`canLink = data.isReady && data.latestAvailable`)
  - `moves-workforce/static/ui/src/utils/jiraApi/movesDocsProperty.js:55-67` (Workforce 읽기 쪽도 상한 없음)
- **공격 시나리오**
  1. 프로젝트 이슈를 편집할 수 있는 사용자(또는 그 권한을 가진 다른 앱)가 `PUT /rest/api/3/issue/{key}/properties/movesDocs` 로 `pages` 에 서로 다른 숫자 id 를 수천 건 넣는다. 30건 상한(`MAX_PAGES_PER_ISSUE`)은 **우리 앱이 쓸 때만** 적용된다.
  2. 이후 그 프로젝트 화면을 여는 **모든 사용자**의 브라우저가 id 50개마다 Confluence 검색을 1회씩 **순차로** 보낸다. 조회가 끝날 때까지 화면은 로딩 상태다(`isLoading` 에 `latestPending` 포함). 열람자 본인의 Confluence 호출 한도가 소모된다.
  3. 더 싸게는, 자릿수가 매우 긴 숫자 id 하나만 넣어도 된다. 조회 주소가 3만 자를 넘어 그 묶음이 실패하고 → `fetchLatestPages` 전체가 던지고 → `latestAvailable` 이 false 가 되어 그 프로젝트에서 **누구도 「문서 연결」을 누를 수 없고** 모든 문서 상태가 "확인 불가"가 된다.
  4. Workforce 문서 탭은 같은 값을 받아 문서 행을 전부 만든다(이슈당 수천 행). 제목 길이에도 상한이 없다.
- **근거(재현)** — 스크래치 `security/repro1.mjs`, `repro3.mjs`
  ```
  32,768바이트 안에 들어가는 최소 항목 수: 2418 → readPages: 2418 → 조회 묶음: 49
  이슈 2,000건(화면 상한) 전부 오염 시 고유 id 최대: 4836000 조회 수: 96720
  docs readPages count: 2900  wf count: 2900
  거대 숫자 id 통과: [ 30000, 26 ]  CQL 길이: 30035
  제목 길이 상한 없음: 10000
  쓰기 경로는 상한 적용: LINK_LIMIT
  ```
  기존 테스트에는 이 경우가 없다(`movesDocsProperty.test.js` 의 `readPages` 는 "없음·깨진 항목"만 다룬다).
- **확인하지 못한 것**: 긴 id·범위를 넘는 id 에 Confluence 가 실제로 어떤 상태 코드를 주는지, 열람자 한도가 몇 회에서 걸리는지는 설치 환경에서 실측하지 못했다. 코드상 "묶음 하나의 실패 = 전체 실패"는 확인했다.
- **권장 수정**
  - 읽을 때도 계약을 강제한다: `readPages` 가 앞에서 30건까지만 받고, `id` 는 `/^\d{1,19}$/`, `title`·`spaceName`·`category` 는 길이 상한(예: 255·255·30), `url` 은 2,000자 이하. 두 저장소의 같은 이름 파일에 똑같이 넣는다.
  - `useProjectData` 의 조회 대상 id 수에 상한(예: 2,000)을 두고 넘으면 화면에 잘렸다고 표시한다.
  - `fetchLatestPages` 는 묶음 단위로 실패를 격리한다(실패한 묶음의 문서만 "확인 불가").
  - `canLink` 를 "최신 정보 조회 성공"이 아니라 "Confluence 검색 가능"에 묶는다. 저장된 값 한 건이 연결 기능 전체를 끄지 못하게 한다.

### M-2 (중간) `touchProject` 의 100건 상한은 동시 호출에 뚫리고, 넘친 뒤에는 호출마다 삭제가 증폭된다

- **위치**: `moves-workforce-docs/src/resolver/project/ProjectService.js:56-76`
- **공격 시나리오**: 로그인한 일반 사용자가 개발자 도구에서 `Promise.all` 로 `invoke('touchProject', {projectId: 'x'+i, name: ...})` 를 한꺼번에 보낸다.
  - 각 호출이 **같은 시점의 목록**을 읽고 각자 1건씩 쓰므로 상한은 "99 + 동시 호출 수"가 된다.
  - 목록이 상한을 넘은 상태에서는 **모든 호출이 넘친 만큼을 각자 지운다**(같은 키를 중복 삭제). 목록 M건·호출 N건이면 삭제 시도는 N × (M − 99)건, 조회는 N × ⌈M/100⌉ 쪽이다.
  - KVS 한도는 **설치 단위**다(공식 문서: 읽기·쓰기 각 분당 4,000건 상당, 사용자 호출 한도는 사용자당 분당 1,200회). 한 사용자가 그 사이트의 한도를 소진하면 다른 사용자의 `getSettings` 가 실패하고, 프로젝트 화면은 설정 조회 실패를 화면 전체 오류로 처리한다(`useProjectData.js:47`).
- **근거(재현)** — `security/repro2.mjs` (원본 서비스 코드를 그대로 읽어 저장소만 메모리 대역으로 바꿈)
  ```
  순차 150회 뒤 저장 건수: 100
  동시 300건 x 1회차 뒤 저장 건수: 300
  동시 1000건 x 1회차 뒤 저장 건수: 1000
  동시 1000건 x 3회차 뒤 저장 건수: 1099
  대역 저장소 호출 누계: { read: 4200, write: 4200, del: 2051400 }
  ```
  호출 4,200회에 삭제 시도 205만 회다. 기존 테스트(`ProjectService.test.js:100-143`)는 순차 호출만 다룬다.
- **DESIGN 과의 차이**: §7.4 는 "상한이 없으면 저장소를 채울 수 있다 → 100건 상한"이라고 적었다. 상한은 순차 호출에서만 성립한다.
- **확인하지 못한 것**: 실제 플랫폼에서 한도에 닿는 시점과 그때 다른 사용자가 받는 오류는 실측하지 못했다(앱 미등록).
- **권장 수정**
  - 사용자당 키 하나(`projects:<accountId>`)에 목록을 값으로 저장한다. 100건 × 최대 1KB 수준이라 값 상한(240KiB) 안이다. 경합이 나도 마지막 쓰기가 이길 뿐 건수가 늘지 않고, 호출당 읽기 1·쓰기 1로 고정된다.
  - 지금 구조를 유지한다면 호출당 삭제 수에 상한(예: 5건)을 두고, 이름이 같고 최근에 기록된 항목은 다시 쓰지 않는다(무변경 호출은 읽기 1회로 끝).

### M-3 (중간) 저장된 문서 주소에 `..` 을 넣으면 Confluence 밖의 같은 사이트 임의 주소로 링크가 걸린다

- **위치**
  - `moves-workforce-docs/static/ui/src/utils/jiraApi/movesDocsProperty.js:64-66, 183-186`
  - `moves-workforce/static/ui/src/utils/jiraApi/movesDocsProperty.js:33-34, 113-116`
  - 소비처: `moves-workforce/.../documents/DocumentsPage.jsx:64-78`(`router.open`), `moves-workforce-docs/.../project/DocumentsTab.jsx:24-29`
- **공격 시나리오**: 이슈 편집 권한자가 `pages[].title` 을 "결제 모듈 설계서", `url` 을 `/../../<임의 경로>` 로 저장한다. Workforce 문서 탭은 저장값을 그대로 쓰므로 모든 열람자에게 그 제목의 링크가 보이고, 누르면 `https://<사이트>/<임의 경로>` 가 새 창으로 열린다. 다른 출처로는 나가지 못하지만, 같은 사이트의 관리 화면·다른 앱 화면·주소만으로 동작하는 기능으로 보낼 수 있다. Workforce Docs 쪽은 Confluence 에서 찾은 문서는 최신 주소로 덮지만, 끊긴 문서·Confluence 조회 실패 때는 저장값을 쓴다.
- **근거(재현)** — `security/repro1.mjs`, `repro5.mjs`(역슬래시)
  ```
  "/../../secure/admin/ViewApplicationProperties.jspa"  docs= ACCEPT wf= ACCEPT -> https://acme.atlassian.net/secure/admin/ViewApplicationProperties.jspa
  "/%2e%2e/%2e%2e/jira/settings"                        docs= ACCEPT wf= ACCEPT -> https://acme.atlassian.net/jira/settings
  "/x/../../login?dest-url=https%3A%2F%2Fevil.example"  docs= ACCEPT wf= ACCEPT -> https://acme.atlassian.net/login?dest-url=...
  "/..\\..\\secure/admin"                               docs= ACCEPT wf= ACCEPT -> https://acme.atlassian.net/secure/admin
  "/\\evil.example"                                     docs= ACCEPT wf= ACCEPT -> https://acme.atlassian.net/wiki//evil.example   (같은 출처)
  "//evil.example"                                      docs= reject wf= reject
  "javascript:alert(1)"                                 docs= reject wf= reject
  ```
  주소 해석은 노드의 `URL` 로 했다(브라우저와 같은 표준 규칙).
  기존 테스트(`movesDocsProperty.test.js:137`, Workforce `movesDocs.test.js:50`)는 `//`·절대 주소만 확인한다.
- **확인한 것**: `javascript:` 등 다른 스킴과 다른 출처로의 이동은 막혀 있다(주소가 항상 `siteUrl` 로 시작).
- **확인하지 못한 것**: 사이트 안에 외부로 다시 넘겨 주는 주소가 있는지(있다면 외부 이동으로 이어짐)는 확인하지 못했다.
- **권장 수정**: 가장 단단한 방법은 저장된 경로를 쓰지 않고 id 로 조립하는 것이다 — `siteUrl + '/wiki/pages/viewpage.action?pageId=' + <숫자 id>`. 저장된 경로를 계속 쓴다면 `new URL(url, siteUrl + '/wiki/')` 로 해석한 뒤 경로가 `/wiki/` 로 시작하는지 확인하고, `\`·제어 문자·`%2e`·`%2f`·`%5c` 가 든 값은 버린다.

---

### L-1 (낮음) 운영 빌드에 소스맵이 들어 있다

- **위치**: `static/ui/build/static/js/main.639ffc0f.js.map` (5.0MB, `sourcesContent` 포함, 자체 소스 72개) 외 `.map` 다수. `manifest.yml:34-36` 이 `static/ui/build` 를 그대로 배포한다.
- **영향**: 앱을 쓰는 누구나 주석을 포함한 전체 화면 소스를 받는다(설계 의도·우회 지점 설명 포함). 유료 앱의 소스 공개이기도 하다.
- **확인한 것**: 소스맵·번들에 로컬 절대 경로·계정 이름·키 형식 문자열은 없다.
- **권장 수정**: `static/ui/package.json` 의 build 를 `GENERATE_SOURCEMAP=false` 로 실행(예: `.env.production`). Moves Workforce 도 같은 설정인지 확인.

### L-2 (낮음) 예상하지 못한 오류의 원문 메시지가 화면으로 나간다

- **위치**: `src/utils/ResponseWrapper.js:26-35`, `src/api/jira/util/RequestJiaJson.js:28,36`(메시지에 Jira 응답 본문을 넣음)
- **근거(재현)** — `repro2.mjs`
  ```
  KVS 내부 오류 => {"success":false,"error":{"name":"Error","code":"UNKNOWN_ERROR","message":"KVS request failed: key=project:557058:... traceId=... host=...","cause":""}}
  ADMIN_CHECK_FAILED => {... "cause":{"code":401,"name":"ForgeAPIError"}}
  ```
  `ForgeAPIError` 의 메시지(응답 본문)는 직렬화에서 빠져 지금은 나가지 않는다. 다만 이는 `Error.message` 가 열거되지 않는 성질에 기대고 있어, 누군가 `cause` 를 문자열로 바꾸면 바로 노출된다.
- **권장 수정**: 코드가 있는 오류(`LogicalError`·`PermissionError`)만 `code`·`message` 를 내보내고, 그 밖은 `UNKNOWN_ERROR` 고정 문구로 바꾼다. `cause` 는 내보내지 않는다(화면은 `error.code` 만 쓴다).

### L-3 (낮음) 페이지 id 가 `constructor`·`__proto__` 같은 이름이면 "끊김"이 "정상"으로 표시된다

- **위치**: `static/ui/src/pages/project/documents.js:29, 55, 113` (`latest[pageId]` — 일반 객체 조회), `pageSearch.js:41`
- **근거(재현)**
  ```
  999 => broken / constructor => ok / __proto__ => ok / toString => ok
  Object.prototype polluted? undefined undefined
  ```
- **영향**: 위조된 항목이 정상 문서처럼 보이고 끊긴 링크 수에서 빠진다. 전역 객체 오염은 **일어나지 않는다**(쓰기는 Confluence 응답의 id 로만 하고, 병합은 `hasOwnProperty` 로 확인).
- **권장 수정**: `latest` 를 `Map` 으로 바꾸거나 `Object.create(null)` + `Object.hasOwn`. M-1 의 id 숫자 제한을 읽기에 넣으면 함께 해소된다.

### L-4 (낮음) Workforce 문서 탭이 Workforce 권한과 무관하게 열린다 — §9 에는 Workforce Docs 쪽만 적혀 있다

- **위치**: `moves-workforce/static/ui/src/constants/tabs.js:279-293`(`canRender` 없음), `.../documents/DocumentsPage.jsx:28-33`(`enabled: !!project_id`), `ProjectDetailPage.jsx:39-80`(범위 거부는 응답이 온 **뒤에** 화면을 바꿈)
- **공격 시나리오**: Workforce 에서 프로젝트 읽기 권한이 없거나 소속 프로젝트만 보도록 제한된 사용자가 `/project/<id>?tab=documents` 로 들어간다. 다른 탭은 서버 가드가 막지만 문서 탭은 Jira 를 직접 부르므로 문서 제목·스페이스·분류·연결 이슈 요약이 조회된다. 범위 제한 사용자도 범위 확인 응답이 오기 전에 조회가 시작된다.
- **평가**: 얻는 것은 그 사용자가 Jira 에서 볼 수 있는 이슈의 값이다(§9 2행과 같은 성격). 다만 §9 는 "Workforce Docs 주소를 직접 열어"라고만 적어 **Workforce 안에서도 같다는 점이 빠져 있다.**
- **권장 수정**: 문서 탭에 `canRender: () => canReadProject` 를 주고, `DocumentsPage` 의 조회를 범위 확인 성공 뒤로 미룬다(`enabled`). §9 2행에 Workforce 탭을 추가한다.

### L-5 (낮음) 링크를 여는 것만으로 피해자의 저장소에 임의 이름이 기록된다

- **위치**: `static/ui/src/pages/project/ProjectPage.jsx:30-36, 47`
- **공격 시나리오**: 공격자가 `…/project/42?name=<임의 문구>` 링크를 보낸다. 피해자가 열면 화면 제목이 그 문구가 되고, `touchProject` 가 자동으로 불려 피해자의 홈 목록에 그 이름이 남는다(255자까지). 다른 프로젝트 번호에 익숙한 프로젝트 이름을 붙여 혼동시킬 수 있다.
- **확인한 것**: 문구는 글자로만 그려져 스크립트는 실행되지 않는다. 다른 사용자의 기록에는 닿지 못한다.
- **권장 수정**: 주소에서 받은 이름은 화면 제목에만 쓰고, 기억은 사용자가 그 화면에서 실제 동작(문서 연결 등)을 했을 때 또는 이슈가 1건 이상 조회됐을 때만 한다.

### L-6 (낮음) 개발 도구 의존성에 높음 등급 권고 11건

- **근거**: `static/ui` 에서 `npm audit` → 낮음 9·중간 5·높음 11(전부 `react-scripts 5.0.1` 아래 빌드·개발 서버 도구: `postcss`, `svgo`, `serialize-javascript`, `webpack-dev-server` 등). `npm audit --omit=dev` 는 루트·`static/ui` 모두 **0건**.
- **평가**: 배포물에는 들어가지 않는다. 다만 빌드 도구의 취약점은 빌드하는 기기에 영향을 주고, `react-scripts` 는 더 이상 관리되지 않는다.
- **권장 수정**: 심사 자료에는 `--omit=dev` 결과를 첨부하고, 빌드 도구 교체를 후속 과제로 잡는다.

### L-7 (낮음) 자동 갱신이 열람 제한 문서의 새 제목을 사용자 동작 없이 Jira 로 옮긴다 — §9 설명 보완 필요

- **위치**: `static/ui/src/pages/project/useProjectData.js:74-90`
- **내용**: Confluence 에서 그 문서를 볼 수 있는 사용자가 프로젝트 화면을 **열기만 해도** 바뀐 제목·주소·스페이스 이름이 이슈 프로퍼티에 기록되고, 이슈를 볼 수 있는 모든 사람에게 보인다. §9 1행은 노출 자체는 적었지만 "연결한 뒤에도, 누군가 화면을 열 때마다 자동으로 최신 제목이 복사된다"는 점은 적지 않았다.
- **권장 수정**: 도입 안내와 §9 에 자동 복사를 명시한다. 필요하면 설정에 자동 갱신 끄기를 둔다.

---

### 참고(I)

| # | 위치 | 내용 | 권장 |
|---|---|---|---|
| I-1 | `src/resolver/project/ProjectRepository.js:9`, `ProjectService.js:26` | 키가 `project:<accountId>:<projectId>` 이고 accountId 에 `:` 을 허용한다. 어떤 accountId 가 다른 accountId + `:` 의 앞부분이면 접두사 조회에 남의 기록이 섞인다(대역으로 재현). 실제 Atlassian 계정 id 형식에서는 그런 쌍이 생기지 않아 **이론상**이다 | 구분자를 accountId 에 나올 수 없는 `#` 로 바꾸거나 M-2 의 단일 키 방식으로 해소 |
| I-2 | `moves-workforce/static/ui/src/constants/movesDocs.js:35` | `envIds[context.environmentType]` 이 `constructor` 같은 이름에 함수·객체를 돌려준다(재현: `/jira/apps/APP/function Object()…`). 값의 출처가 Forge 라 도달하기 어렵다 | `Object.hasOwn` 확인 + 문자열 여부 확인 |
| I-3 | `src/permission/permissionGuard.js:28-36` | `PUBLIC` 은 accountId 를 확인하지 않는다(`getSettings`·`getViewer` 는 없어도 동작). 지금은 manifest 에 비로그인 접근 허용이 없어 도달하지 않는다 | 가드에서 accountId 없으면 거부. 주석의 "로그인 사용자 누구나"와 코드가 같아진다 |
| I-4 | `src/utils/ResponseWrapper.js:22-25` | `{success:true, ...result}` 순서라 결과에 `success` 가 있으면 덮인다(재현). 현재 서비스는 그런 값을 돌려주지 않는다 | `{...result, success:true}` |
| I-5 | `manifest.yml:72-74` | `styles: unsafe-inline` — Atlaskit 가 인라인 스타일을 쓰기 때문. 스크립트 쪽 완화와 외부 통신 허용은 없다 | 유지. 심사 질문에 사유를 적는다 |
| I-6 | `static/ui/package-lock.json` | 설치 스크립트가 있는 운영 의존성 1건(`iframe-resizer@4.4.5`, `@forge/bridge` 하위). `@compiled/react` 는 직접 import 가 없다(Atlaskit 동반 의존성으로 보임) | 설치 시 `--ignore-scripts` 검토, `@compiled/react` 필요 여부 확인 |
| I-7 | `DESIGN.md §9` | **무결성 한계가 빠져 있다.** 제목·분류·연결한 사람·연결 시각은 이슈 편집 권한자가 위조할 수 있고, 위조한 분류로 "누락된 필수 분류"를 0 으로 만들 수 있다. 화면은 `linkedBy` 를 표시하지 않는다(확인) | §9 에 "연결 정보는 감사 기록이 아니다"를 추가 |
| I-8 | `test/permission/permissionMap.contract.test.js:81-94` | `resolver.define` 직접 호출 검사가 `src/resolver/` 만 본다. `src/index.js` 나 다른 폴더에 직접 등록하면 놓친다. 현재 직접 호출은 `permissionGuard.js` 두 곳뿐(grep 확인) | 검사 범위를 `src/` 전체(가드 파일 제외)로 |
| I-9 | `manifest.yml:44`, `licenseConstants.js:6`, Workforce `constants/movesDocs.js:13-19` | 앱 id·마켓 주소·이동 대상 id 가 비어 있다. 등록 전 상태로 정상이나, 채운 뒤 값 확인이 필요하다 | 등록 뒤 재확인 |

### W-DEP (Workforce 기존, 이번 변경과 무관) 운영 의존성의 높음 등급 권고

- `moves-workforce` 의 `package.json`·잠금 파일은 이번 변경에 포함되지 않는다(`git diff` 확인). 참고로 돌린 `npm audit --omit=dev` 결과:
  - 루트: 중간 5·높음 7 (`undici`, `lodash`, `fast-uri`, `minimatch`, `brace-expansion`, `tmp` 등 — 전부 "fix 가능")
  - `static/ui`: 중간 11·높음 17 (`react-router`/`react-router-dom` 직접 의존, `@forge/bridge` 하위 `linkify-it`, `js-yaml`, `postcss`, `undici` 등)
- 문서 탭이 실리는 앱이므로 기록한다. 각 권고가 실제로 도달 가능한지는 **분석하지 않았다**.

---

## 3. 확인했고 문제없던 영역

| 영역 | 무엇을 어떻게 확인했나 | 결과 |
|---|---|---|
| resolver 가드 | `src/index.js` 등록 목록 → 컨트롤러 3개 → `guardedDefine` 5건 전부 추적. `.define(` grep 결과 `permissionGuard.js:43,55` 뿐 | 우회 등록 없음. 맵에 없는 이름은 거부 |
| 관리자 기능 강제 | `saveSettings`: 가드(`JIRA_ADMIN`) + 서비스(`assertJiraAdmin`) 이중. 관리자 확인은 사용자 자격 `mypermissions`, 실패·형태 불명은 거부. 테스트 `SettingsController.test.js:74-113` | 서버에서 강제됨 |
| `principal` 누락 | `undefined`·`null`·`{}`·빈 값·배열·공백 포함 값 주입(repro2 C) | 전부 `VIEWER_UNKNOWN` 으로 닫힘 |
| 다른 사용자 데이터 | accountId 는 `req.context` 에서만 온다(payload 무시). projectId 에 `:`·`/`·공백·객체·배열·65자 주입 | 전부 `PROJECT_ID_INVALID`. 키 조작 불가 |
| 설정 payload | 객체 아님·배열·이름 비문자열·중복·31개·범위 밖 기준일. 모르는 속성은 버림. 구조 분해만 쓰고 병합 없음 | 프로토타입 오염 경로 없음 |
| JQL 조립 | `"`·`\`·`\"`·`\\"`·줄바꿈을 넣은 projectId 8종을 **원본 조립 함수**에 넣고 따옴표 상태를 따라가 문자열 밖 글자를 확인(repro4). Docs·Workforce 양쪽 | 16건 전부 문자열 안에 갇힘 |
| CQL 조립 | 검색어 4종 × 스페이스 키 4종 × 본문 포함 여부에 `"`·`\`·`)`·`OR` 주입, 같은 방식으로 확인(repro5). id 는 숫자만 | 어긋남 0건 |
| URL 경로 조립 | `requestCore.js:42-48` 이 경로 값을 `encodeURIComponent`. Workforce 이동 주소도 id·이름 인코딩(repro1 §6) | 경로 이탈 없음 |
| 화면 출력 | `dangerouslySetInnerHTML`·`innerHTML`·`eval`·`new Function`·`document.write`·`window.open`·`location.*` grep — 0건. 제목·분류·스페이스·발췌·이슈 요약은 전부 React 글자 노드 | 스크립트 주입 경로 없음 |
| `href`·`router.open` | 들어가는 값은 `siteUrl + 고정 경로 + 값` 또는 `https://` 로 시작하는 상수뿐. `javascript:` 거부 확인 | 스킴 변경 불가(경로 문제는 M-3) |
| 발췌 | 강조 표식만 제거 후 글자로 표시, 이슈에 저장하지 않음(`LinkModal.jsx:202-210`) | 문제없음 |
| 정규식 | 자체 정규식 9개 전부 단순 문자 집합·고정 문자열. 1MB 입력 4종으로 측정 → 최대 57ms(선형) | 재앙적 역추적 없음 |
| 무한 반복 | 이슈 검색: 같은 표식 반복·빈 쪽이면 중단, 2,000건 상한(Docs), 20쪽 상한(Workforce). KVS 조회는 커서가 없으면 종료 | 상한 있음(id 조회는 M-1) |
| 라이선스 판정 | 화면(`licenseDecision.js`)·백엔드(`LicenseGuard.js`) 코드 대조 + 공용 입력표 테스트. 비활성 시 권한 확인·저장소 접근보다 먼저 거부. §7.7·§9 설명과 코드 일치 | 일치 |
| 로그 | `src/` 에 `console.*` 0건 | 개인정보 기록 없음 |
| 비밀 값 | 저장소 전체(`node_modules`·`build`·`.git` 제외)에서 키·토큰·비밀번호 대입, 알려진 키 형식, 내부 주소·이메일·앱 식별자 검색. 번들·소스맵도 검색 | 0건. 주소는 테스트용 예시뿐 |
| `.gitignore` | `node_modules`·`build`·`.forge`·`.env*`·`*.log`·`.idea` 무시 확인(`git check-ignore`), 추가될 파일 목록 확인(`git add -n`) | 막아야 할 것 막힘 |
| 번역 파일 | `ko-KR.json`·`en-US.json` 에 주소·계정·비밀 값 없음 | 문제없음 |
| 잠금 파일 | 두 파일 모두 출처가 공식 저장소, 무결성 값 누락 0건 | 문제없음 |
| 쓰지 않는 의존성 | 루트 3개·화면 22개 import 대조 | I-6 외 전부 사용 |
| manifest 모듈 | 전역 페이지 1·엔티티 프로퍼티 1·함수 1. 웹훅·예약 작업·외부 통신 없음 | 쓰지 않는 모듈 없음 |
| Workforce 설치 감지 | 실패·형태 불명·오류 있음은 전부 숨김, 세션당 1회 | 설계와 일치 |
| 기존 테스트 | 루트 286건·화면 439건 실행 | 전부 통과 |

### manifest 스코프 대조

| 스코프 | 실제 호출 | 판정 |
|---|---|---|
| `storage:app` | `KeyValueManager.js` 의 `kvs.get/set/delete/query` | 필요 |
| `read:jira-work` | 이슈 검색(`movesDocsSearch.js:40`), 프로퍼티 읽기(`movesDocsWriter.js:20`), 관리자 확인(`UserApi.js:10`) | 필요 |
| `write:jira-work` | 프로퍼티 쓰기·삭제(`movesDocsWriter.js:25,30`) | 필요 |
| `search:confluence` | `/wiki/rest/api/search` 한 곳(`requestConfluence.js:14-17`) — 공식 문서에서 이 스코프 하나로 충분함을 확인 | 필요 |

Workforce 추가분(`jql/parse`, 이슈 검색)은 기존 `read:jira-work` 안에서 동작하며 스코프 추가가 없다.

---

## 4. 미확인 영역과 그 이유

| 영역 | 이유 |
|---|---|
| 실제 설치 환경에서의 동작 전부 | 앱이 아직 등록되지 않아(`app.id` 자리표시자) 배포·호출을 할 수 없었다. 모든 재현은 원본 코드를 노드에서 실행한 것이다 |
| M-1·M-2 의 플랫폼 쪽 결과 | Confluence 가 긴 id 에 주는 응답, 한도에 닿는 시점, 그때 다른 사용자가 받는 오류 |
| 운영 환경의 `context.license` | 유료 등록 뒤에만 확인 가능(DESIGN §10 P12) |
| resolver `context` 의 필드별 신뢰성 | 공식 문서는 "resolver 의 context 는 권한 판정에 써도 된다"고만 적고 필드를 나열하지 않는다. `accountId`·`license` 가 포함된다고 **가정**했다 |
| Jira 호출별 필요 스코프의 공식 문서 대조 | 문서 페이지가 길어 조회가 잘렸다. Confluence 검색만 문서로 확인했다 |
| 사이트 안의 외부 이동 주소 존재 여부 | M-3 이 외부 이동으로 이어지는지 판단에 필요하나 확인하지 못했다 |
| 소스맵이 실제로 내려받아지는지 | 빌드 폴더에 있는 것만 확인. 배포 뒤 주소로 받아 보지 않았다 |
| Workforce 기존 코드 | 범위 밖. 추가분이 기대는 기존 부분(`findProjectById`, `IssueComponent`, 범위 거부 처리)만 읽었다 |
| Workforce 의 저장소 이력 | 비밀 값 검색은 작업 트리만 했다. Docs 저장소는 커밋이 없다 |
| W-DEP 각 권고의 도달 가능성 | 건수와 이름만 확인했다 |

---

## 5. Atlassian 마켓플레이스 보안 요구사항 대조표 (Moves Workforce Docs)

| 요구사항 | 판정 | 근거 |
|---|---|---|
| 모든 요청의 인증·권한 | **충족** | resolver 5개 전부 `guardedDefine` 경유, 맵에 없으면 거부, 관리자 기능은 서버에서 이중 확인. Jira·Confluence 호출은 사용자 자격이라 제품 권한이 판정 |
| 최소 권한 스코프 | **충족** | 스코프 4개 각각 실제 호출에 대응(§3 표). 외부 통신·스크립트 완화 없음 |
| 비밀 값 저장 | **해당 없음** | 앱이 다루는 비밀 값이 없다(외부 서비스·토큰 없음). 저장소 검색 0건 |
| 로그에 개인정보 없음 | **충족** | 백엔드에 로그 출력이 없다. 단 오류 응답 메시지는 L-2 참고 |
| 테넌트 격리 | **충족** | 저장소는 설치 단위(플랫폼), 그 안에서 사용자별 키. 다른 사용자 범위 침범 시도 전부 거부(I-1 은 이론상) |
| 입력 검증 | **부분 충족** | resolver payload·검색식·경로는 검증됨. **이슈 프로퍼티 읽기 경로에 상한이 없고(M-1) 주소 경로 제한이 우회된다(M-3)** |
| 높음 이상 취약 의존성 없음 | **충족(운영 의존성)** | `npm audit --omit=dev` 루트·화면 0건. 개발 도구는 높음 11건(L-6) |
| 지원 종료 런타임 아님 | **충족** | `nodejs22.x`(`manifest.yml:40`), `.nvmrc` 22.22.0. `react-scripts` 는 관리 중단 상태(L-6) |
| 사용자 자격증명 수집 없음 | **충족** | 입력란은 검색어·분류 이름·기준일뿐. 비밀번호·토큰 입력 없음 |

Moves Workforce 는 "높음 이상 취약 의존성 없음"이 **미충족**이다(W-DEP). 나머지 항목은 이번 감사 범위(추가분)에서 새로 어긋난 것이 없다.

---

## 6. 재현 자료

스크래치 폴더 `C:\Users\DMOVE\AppData\Local\Temp\claude\C--CloudJira-moves-workforce\09c47656-08b2-49ec-8804-446d6dba94d0\scratchpad\security\`

| 파일 | 내용 |
|---|---|
| `repro1.mjs` | 주소 경로 우회, 프로토타입 키, 읽기 상한, 검색식 주입, 정규식 시간, Workforce 이동 주소 |
| `repro2.mjs` | `touchProject` 경합·삭제 증폭, 범위 침범 시도, 오류 응답 직렬화 |
| `repro3.mjs` | 프로퍼티 상한(32,768바이트) 안에 들어가는 항목 수 |
| `repro4.mjs` | JQL 이스케이프(두 저장소의 원본 조립 함수) |
| `repro5.mjs` | 역슬래시가 든 주소·검색식 |

원본 파일을 복사하거나 읽어서 실행했고 원본은 고치지 않았다. 세션이 끝나면 폴더가 지워질 수 있으므로 보존하려면 옮겨 둔다.

주의: `repro1.mjs` 는 셸로 만들면서 입력 문자열의 역슬래시가 빠졌다. 그 파일의 역슬래시 관련 줄(주소 3번째·7번째 입력)은 근거로 쓰지 않았고, 같은 경우를 `repro4`·`repro5` 에서 다시 확인했다. 나머지 결과(`..`·`%2e`·프로토타입 키·상한)는 영향이 없다.
