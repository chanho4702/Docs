# 02 Frontend Report — Moves Workforce Docs 흡수 (프론트)

> 작성 2026-09-30 · 범위: 설계서 §3.3~§3.6, §4, §7, §8, §9, §10, §12, §13 Frontend(F-1~F-15).
> 애드온 저장소(`moves-workforce-docs`)는 읽기만 했다. 백엔드(`src/`)·`manifest.yml`·`src/resolver/projectSubscription/*` 는 건드리지 않았다. git commit 하지 않음.

## 1. 실행 결과 (실제 실행)

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm run merge` | 성공. `ko-KR.json`·`en-US.json` 의 `movesDocs` 아래에 `tab, common, project, documents, issues, overview, docStatus, docAction, linkModal, result, settings, errors` 생성 확인 |
| `cd static/ui && npx jest` (전체) | **Test Suites 143 passed / 143, Tests 2333 passed / 2333** |
| `cd static/ui && CI=true npm run build` | 성공. `bundle:check` main `gzip 481,763 B / 예산 950,000` withinBudget, panel `329,314 / 350,000` withinBudget. Confluence 호출 코드(`wiki/rest/api/search`)는 lazy 청크(`5672.*.chunk.js`)에만 있고 main 에 없음 |

## 2. 파일 목록

### 삭제 (§9.1)
- `static/ui/src/pages/projectDetail/documents/DocumentsPage.jsx`
- `static/ui/src/pages/projectDetail/documents/useMovesDocsInstalled.js`
- `static/ui/src/pages/projectDetail/documents/__test__/movesDocs.test.js`
- `static/ui/src/constants/movesDocs.js`
- 되돌림(작업 트리 diff 원복): `static/ui/src/components/tabs/ProjectDetailTabs.jsx`(훅 호출·인자 제거 → HEAD 와 동일), `static/ui/src/utils/jiraApi/requestJira.js`(`parseJql` 제거 → HEAD 와 동일)

### 교체 (애드온판으로)
- `static/ui/src/utils/jiraApi/movesDocsProperty.js` — 애드온 쓰기·읽기 통합본. "두 저장소" 주석 → "이 파일이 유일한 출처"
- `static/ui/src/utils/jiraApi/movesDocsSearch.js` — import 만 `./movesDocsRequest`
- `static/ui/src/utils/queryKey/movesDocsKeys.js` — `all`, `projectIssues` 만
- `locales/kr/movesDocs.json`, `locales/en/movesDocs.json` — §7.2 키 트리로 전면 재작성

### 신규
- 실행기·유틸: `static/ui/src/utils/requestCore.js`, `utils/jiraApi/movesDocsRequest.js`(`executeMovesDocsRequest`, `MovesDocsRequestError`), `utils/jiraApi/movesDocsWriter.js`, `utils/confluenceApi/{requestConfluence,cql,pageSearch,spaceSearch}.js`, `utils/queryKey/confluenceKeys.js`
- 문서 탭(`static/ui/src/pages/projectDetail/documents/`): `ProjectDocumentsPanel.jsx`(셸), `useProjectDocuments.js`, `useDocsSettings.js`, `documents.js`, `filters.js`, `links.js`, `LoadError.jsx`, `documents.css`, `DocumentsTab.jsx`, `IssuesTab.jsx`, `OverviewTab.jsx`, `LinkModal.jsx`, `DocActionModal.jsx`, `IssueResultList.jsx`, `DOCUMENTS.md`
- 백오피스: `static/ui/src/backoffice/page/setting/DocumentSetting.jsx`
- 테스트 환경: `static/ui/jest.setup.js`
- 테스트: `pages/projectDetail/documents/__test__/{documents,filters}.test.js`, `{ProjectDocumentsPanel,useProjectDocuments,useDocsSettings,linkModalSearch,modals,OverviewTab}.test.jsx`, `testUtils.jsx`, `testTranslator.js`; `utils/jiraApi/__test__/{movesDocsProperty,movesDocsSearch,movesDocsWriter}.test.js`; `utils/confluenceApi/__test__/{cql,pageSearch,pageSearchOptions,searchOptions,spaceSearch}.test.js`; `backoffice/page/setting/__test__/DocumentSetting.test.jsx`

### 수정
- `static/ui/src/constants/tabs.js` — `PagesIcon` import, `ProjectDocumentsPanel` lazy, 배열 끝에 `documents` 탭(`canRender: () => canReadProject`). 시그니처는 원래 8인자 그대로
- `static/ui/src/components/lozenge/StatusLozenge.jsx` — 세 번째 진입점 `DocStatusLozenge`(`isBold`, `movesDocs.docStatus.<status>`)
- `static/ui/src/components/lozenge/statusAppearance.js` — `DOC_STATUS_APPEARANCE`, `getDocStatusAppearance`(레거시 유효값만)
- `static/ui/src/backoffice/page/setting/SettingPage.jsx` — `SalaryPolicySetting` 다음에 `DocumentSetting` 카드
- `static/ui/src/utils/queryKey/queryKeyFactories.test.js` — 애드온 `movesDocsKeys`·`confluenceKeys` 케이스 7건 합침
- `static/ui/jest.config.js` — `setupFilesAfterEnv`, `react-router-dom`·`react-router/dom` CJS 진입점 매핑(§4 참고)
- `static/ui/__mocks__/@forge/bridge.js` — `requestJira` 기본 응답에 `text()` 추가(기존 `json()` 유지), `requestConfluence` 추가
- `static/ui/package.json`/`package-lock.json` — devDependencies `@testing-library/react 14.3.1`, `@testing-library/jest-dom 5.17.0`(정확 버전 고정, `npm install` 로 잠금 파일 갱신)
- `CLAUDE.md` — §12.2 반영(기술 스택 테스트, 쿼리키 팩토리 목록, `projectDetail/documents/` 한 줄, Forge 특이사항 3항목, 도메인 문서 목록). ⚠ `CLAUDE.md` 는 `.gitignore` 대상이라 git 변경으로 잡히지 않는다(로컬 파일만 갱신됨)

## 3. 소비하는 응답 shape (백엔드 `02_backend_report.md` 기준)

| 호출 | 소비 경로 | 위치 |
|---|---|---|
| `invoke('getSettingData')` → `{ success: true, ..., docCategories: [{name, required}], docStaleDays }` | queryFn 이 `success` 확인 후 떼고 반환. 훅은 `raw.docCategories`(배열)·`raw.docStaleDays`(정수)를 `{ categories, staleDays }` 로 매핑. 캐시에 `{success:true,...}` 원형이 먼저 들어와도 같은 필드로 읽고, `{success:false}` 원형·필드 누락은 `isError` | `useDocsSettings.js` |
| 같은 응답 (백오피스) | `SettingPage` 의 기존 queryFn 결과(`success` 뗀 값)를 `settings` prop 으로 받아 `settings.docCategories`·`settings.docStaleDays` 로 초기값 | `DocumentSetting.jsx` |
| `invoke('updateSetting', { docCategories, docStaleDays })` → `{ success: true, content: { settings } }` | `res.content.settings` → `onSettingsUpdated`(= `setQueryData(settingKeys.detail(), …)`). **두 필드만** 보낸다 | `DocumentSetting.jsx` |
| `updateSetting` 실패 `{ success:false, error:{ code } }` | `code` 가 5개(`SETTING_DOC_*`) 중 하나면 카드 안 오류 `SectionMessage`(`movesDocs.errors.<code>`), 그 밖은 공통 실패 토스트(`common.toast.*`) | 同 |
| `invoke('findProjectById', { project_id })` → `{ success, rows }` | `data.success === true` 일 때만 문서 조회 시작(`enabled`). 쿼리키 `findProjectByIdQueryKeys(id)` · queryFn 이 상세 페이지와 동일(원형 저장) | `ProjectDocumentsPanel.jsx` |

Jira·Confluence 직접 호출 shape 은 설계서 §3.4·§3.5 그대로(애드온 코드 무변경 이식).

## 4. 설계와 다른 점 / 보충

1. **범위 판정 실패 표시(보충).** 설계는 `enabled=false` 동안 스켈레톤만 적었는데, `findProjectById` 가 네트워크 오류·`success:false` 로 끝나면 스켈레톤에 영원히 머문다. 셸이 이 경우 `LoadError`(재시도 = 범위 판정 재조회)를 그린다. 범위 거부(`PERMISSION_PROJECT_SCOPE_DENIED`)는 상세 페이지가 이미 페이지 전체를 막는다.
2. **`LinkModal` 은 `accountId` prop**, `DocumentsTab`·`IssuesTab` 은 `siteUrl`·`canWrite` prop 을 받는다(설계 §4.1 대로 `useAppContextStore` 대체). `canWrite=false` 면 동작 **열 자체**(헤더 셀 포함)를 뺀다.
3. **`CommonTable` 의 `label` prop 은 넘기지 않는다** — Workforce 원본에 해당 prop 이 없다.
4. **jest 설정 추가 2줄**: `react-router-dom` 7 은 `package.json main`(`dist/main.js`)이 실재하지 않고 `exports` 로만 진입하는데 jest 27 은 `exports` 를 읽지 않는다. 셸이 `useUrlParam`(→ `useSearchParams`)을 쓰므로 `moduleNameMapper` 에 CJS 진입점 두 개를 매핑했다. 기존 스위트 영향 없음(전체 통과). `transformIgnorePatterns` 는 넓히지 않았다 — Atlaskit 목도 필요 없었다(설계 폴백 미사용).
5. **en 문구 한 줄 정정**: 애드온 en `lookupTruncated.description` 이 `"Unknown"` 으로 표시한다고 했지만 실제 상태 라벨은 `Unavailable` 이라 맞췄다.
6. **`DocumentSetting` 저장 버튼은 설정을 받은 뒤에만** 보인다(로딩 중 빈 저장 방지 — 테스트가 잡아 수정).
7. **추가 테스트(설계 목록 밖)**: `useDocsSettings.test.jsx` 4건(두 캐시 모양 수용, 실패 원형·필드 누락·조회 실패 = 오류). 새 계약인데 이식 테스트가 덮지 않아 넣었다.
8. `DocStatusLozenge` 는 Workforce 관례대로 `isBold`(애드온은 subtle).

## 5. 테스트 이식 결과 — 잃은 테스트

| 애드온 | Workforce | 건수(애드온 → Workforce) | 비고 |
|---|---|---|---|
| `documents`·`filters` | 같은 이름 | 25→25, 6→6 | 파일 동일 |
| `confluenceApi/__test__/*` 5개 | 같은 경로 | 동일 | 파일 바이트 동일 |
| `jiraApi/__test__/movesDocs*` 3개 | 같은 경로 | 동일 | 파일 바이트 동일(브리지 목 기반이라 실행기 이름 변경 무영향) |
| `queryKeyFactories`(movesDocs·confluence 부분) | Workforce 파일에 합침 | 7 | 애드온의 `settingKeys`/`viewerKeys`/`projectKeys.remembered` 케이스는 대상 없음(버린 팩토리) |
| `ProjectPage.test.jsx` | `ProjectDocumentsPanel.test.jsx` | 10 → 7 + 신규 4 = 11 | **삭제 3건 = 프로젝트 이름 기억(touchProject)** — 기능 자체를 버림(설계 §8.2). 신규: 쓰기 권한 없음 → 연결·분류·해제 버튼 없음 + PUT/DELETE 0건, 작업 뷰 행 버튼 없음, `?view=issues` 딥링크 행 버튼, 범위 판정 실패 → Jira·Confluence 호출 0 |
| `useProjectData.test.jsx` | `useProjectDocuments.test.jsx` | 1→1 | **재조회 실패 `isError` 보안 규칙** 유지 |
| `linkModalSearch.test.jsx` | 같은 이름 | 동일 | 발췌 비저장·옵션 키·스페이스 실패 격리 유지 |
| `modals.test.jsx` | 같은 이름 | 동일 | **섞인 분류 저장 불가·저장 중 닫기 금지** 유지. 문구만 "이슈→작업" |
| `OverviewTab.test.jsx` | 같은 이름 | 동일 | 문구만 |
| `SettingsPage.test.jsx`(7) | `DocumentSetting.test.jsx`(11) | 재작성 | 관리자 판정 2건(`isAdmin=false`, `viewerFailed`) → `canWrite('SETTINGS')` 읽기 전용 1건으로. 조회 실패 1건 → SettingPage 소유라 "설정 미수신이면 입력·저장 없음"으로. `errorMessageKey` 1건 → 오류 코드 5개 전부 문구 존재 확인. 오류 문구는 코드 5개 전부 `it.each` 로 확인, 저장 payload 두 필드만·응답으로 캐시 패치 확인 추가 |

**보안 규칙 테스트 손실 없음**: 재조회 실패 판정(S5), 섞인 분류 저장 차단(S6), 저장 중 모달 닫기 금지(S7), 읽기 상한·id 형식(S1), 링크 조립(S2), 검색어 정리·이스케이프(S4), 조회 상한(S3) 모두 이식 파일에 그대로 있다.

## 6. 보안 규칙(§10) 확인

S1~S13 은 이식 코드 무변경(경로·import·번역 키만 조정)으로 유지. S10 은 셸의 `enabled` + `tabs.js canRender` 로 구현. 쓰기 게이트(`canWrite('PROJECT')`)는 헤더 버튼·문서 뷰 동작 열·작업 뷰 행 버튼·스냅샷 자동 갱신 4곳 모두에 걸었다(형제 경로 포함).

문서 탭 모듈이 기존 `utils/jiraApi/requestJira.js` 의 `executeRequest` 를 import 하지 않음을 grep 으로 확인(0건).

**S14(운영 빌드 소스맵) — 미해결, 결정 필요.** Workforce 는 `GENERATE_SOURCEMAP`/`devtool` 설정이 없어 production 빌드에 `.map` 이 생성된다(`build/static/js/*.map` 확인). 애드온은 `craco.config.js` 에서 production `devtool=false` 로 막았다. 앱 전역 빌드 설정이고 Sentry 스택 가독성과 맞바꾸는 문제라 이번 범위에서 바꾸지 않았다 — 리더 판단 필요(바꾸려면 `static/ui/craco.config.js` 한 줄).

## 7. 확인하지 못한 것

- 실제 Forge 화면(E2E): 탭 렌더·`?view=` 딥링크·Confluence 검색·이슈 프로퍼티 쓰기·폴백 — jsdom 테스트로만 확인. 배포 후 실측 항목은 `DOCUMENTS.md §8`(P2·P3·P5~P8·P10·P11·P14·W1·W2).
- `ViewModeToggle`·「문서 연결」 버튼 배치의 실제 시각 확인(스크린샷 없음).
- `findProjectByIdQueryKeys` 캐시를 `ProjectModal` 이 **다른 모양**(`rows[0]` 객체)으로 채우는 기존 불일치가 있다. 모달을 연 직후 같은 프로젝트 상세로 들어오면(staleTime 안) 셸의 `success===true` 판정이 실패해 "문서 정보를 불러오지 못했습니다"가 뜰 수 있다(상세 페이지 제목도 같은 영향). 기존 결함이며 이번에 고치지 않았다 — 재시도 버튼으로 복구된다.
- 번들 크기 전후 비교: 기준선 빌드를 따로 하지 않아 증가량은 모른다(예산 안).
