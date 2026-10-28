# 03 Verify Report — Moves Workforce Docs 흡수

> 검증 2026-09-30 · 기준: `01_architect_design.md`(경계면 계약), `02_backend_report.md`, `02_frontend_report.md`, 작업 트리의 커밋 전 변경 전부
> 제외: `custom-scopes.yaml`, `src/resolver/backoffice/team/__test__/LeaderTeamBackfill.test.js`(이전 작업 잔여), `src/resolver/projectSubscription/*`, 루트 `*.pptx`
> 코드 수정 없음. 애드온 저장소는 읽기만 함.

## 요약

| 분류 | 건수 (아래 표의 행 단위) |
|---|---|
| 통과 | 59 (실행 5 · 설정 경계 9 · manifest 5 · 프로퍼티 6 · 보안 S1~S13 13 · 권한 9 · 제거 5 · i18n 1 · 재사용/다중경로 4 · 테스트 이식 1 · 성능 1) |
| **실패** | **2** |
| 미검증 | 6 |

| # | 실패 | 위치 | 심각도 |
|---|---|---|---|
| X1 | 보안 규칙 S14(운영 빌드 소스맵 제외)가 지켜지지 않음 — 설계 §10 표의 규칙이 완화됨 | `static/ui/craco.config.js`(devtool 설정 없음), 빌드 결과 `static/ui/build/static/js/*.map` 199개 | 중(규칙 위반, 리더 결정 필요) |
| X2 | `findProjectByIdQueryKeys` 캐시의 모양이 둘 → 문서 탭이 정상 프로젝트를 "문서 정보를 불러오지 못했습니다"로 표시 | `ProjectDocumentsPanel.jsx:52,55` ↔ `pages/project/modal/ProjectModal.jsx:128-137` | 낮음(재시도로 복구) |

---

## 1. 실행 검증 (실제 실행 결과 그대로)

| 명령 | 결과 |
|---|---|
| 루트 `npm test` | **Test Suites 132 passed / 132, Tests 1842 passed / 1842**, 18.0 s, exit 0 (백엔드 보고서 1840 과 2건 차이 — 제외 대상 잔여물 `LeaderTeamBackfill.test.js` 가 작업 트리에 있어 함께 돈 것으로 보임, 실패 없음) |
| `cd static/ui && npm run merge` | exit 0. 실행 전후 `ko-KR.json`·`en-US.json` md5 동일(`b0179061…`, `d9076775…`) → **이미 merge 결과가 반영돼 있었음** |
| `cd static/ui && npx jest` | **Test Suites 143 passed / 143, Tests 2333 passed / 2333, Snapshots 1 passed**, 26.6 s, exit 0. `console.error` 3건은 의도된 실패 경로 로그(`DocumentSetting` 저장 실패 테스트)와 Atlaskit `LockToggle defaultProps` 경고 — 실패 아님 |
| `cd static/ui && CI=true npm run build` | exit 0. "Compiled with warnings" 는 기존 `node_modules` 소스맵 파싱 경고 3건뿐(신규 코드 무관). `bundle:check` main gzip **481,763 / 950,000** withinBudget, panel **329,314 / 350,000** withinBudget. `wiki/rest/api/search` 문자열은 lazy 청크 `build/static/js/5672.7e9ec525.chunk.js` 에만 존재 |
| `forge lint`(현재 작업 트리) | **0 errors, 0 warnings, 1 approval**: `MAJOR_VERSION_RULE — Change due to scope modification`(설계 §2.5 예상과 일치). `PermissionLinter ... "Unknown product"` 경고는 HEAD 를 `git archive` 로 풀어 돌려도 똑같이 나옴 → **기존 경고, 이번 변경 무관** |

---

## 2. 경계면 교차 검증

### 2.1 설정 resolver ↔ 프론트 — 통과

| 항목 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| `getSettingData` 응답 | `SettingService.js:52-57` `{...DEFAULT_SETTINGS, ...saved}` → 가드 `responseWrapper.js:11-14` `{success:true, ...result}` (루트 평면, `content` 래핑 없음). `SettingDefaults.js:19-21` 에 `docCategories`·`docStaleDays` | `useDocsSettings.js:24-27` `success` 확인 후 떼고 반환, `:32-41` 두 모양(원형/`success` 제거) 모두 수용, `docCategories` 배열·`docStaleDays` 정수 확인 → `{categories, staleDays}` | 통과 |
| 같은 응답(백오피스) | 위와 동일 | `SettingPage.jsx:17-28`(success 제거) → `DocumentSetting.jsx:36-39` `settings.docCategories`·`settings.docStaleDays` | 통과 |
| `updateSetting` 응답 | `SettingService.js:129` `return {content:{settings: next}}` → `{success:true, content:{settings}}` | `DocumentSetting.jsx:93-94` `res?.content?.settings` → `onSettingsUpdated` → `SettingPage.jsx:31` `setQueryData(settingKeys.detail(), …)` | 통과(래핑 단계 일치) |
| `updateSetting` 요청 | `SettingService.js:67-68` 구조 분해 `docCategories`·`docStaleDays`, `:102-105` 검증은 `findById`(`:107`) 전, `:121-122` 부분 병합 | `DocumentSetting.jsx:81-84` 두 필드만 전송(`{name, required}` 로 `rowId` 제거) | 통과 |
| 실패 분기 | 가드 직렬화 `{success:false, error:{name, code, message, cause}}`(`responseWrapper.js:15-25`, `LogicalError.code`) | `DocumentSetting.jsx:85-91` `res.success` 거짓 → `error.code` 판정 | 통과 |
| 오류 코드 5개 | `ErrorCodes.js` `SETTING_DOC_*` 5개 = `DocSettingValidator.js` 가 던지는 5개 | `DocumentSetting.jsx:22-28` 목록 5개 동일 문자열, `:129` `movesDocs.errors.${code}` → kr/en 양쪽 5키 존재(§2.7) | 통과 |
| 권한 | `PermissionMap.js:191` `getSettingData:'PUBLIC'`, `:192` `updateSetting: W('SETTINGS')` 변경 없음 | `DocumentSetting.jsx:51` `canWrite('SETTINGS')` | 통과 |
| 서비스 내부 소비자 | `getSettingDataService`·`updateSettingService` 는 계약이 **필드 추가만** 있음(shape 불변) | `src/` 내 다른 import 없음(컨트롤러만) | 통과 |

**`settingKeys.detail()` 공유 소비처 (22 파일, 비테스트 21 + 테스트 1)** — 전부 열어 대조:

| 모양 | 파일 | 읽는 필드 | 새 필드 영향 |
|---|---|---|---|
| 원형 `{success, …}` 저장 | MonthMmSummary, MyPage, WorklogPage, IssueAnalysisPage, AssignmentPage, GanttPage, ProjectIssuePanel, TaskHistoryPage, ProjectIssueMapView, ProjectTreeView, ProjectAssignmentBoard, InProgressIssueList, LoadSummaryCards, ResourceOverviewTable, WorklogExportPage | `settingData?.hourRate` 만 | 없음 |
| `success` 제거·실패 던짐 | SettingPage, useSalaryPolicy, useProjectResourceMembers, ProjectCalender, useIssuePanelData(패널 전용 앱이라 캐시 공유 없음), useDocsSettings | `hourRate`·`salaryPolicy`·각 카드 필드 | 없음 |
| 파생 | useProjectDocuments(→ useDocsSettings) | `categories`·`staleDays` | — |

→ 어느 소비처도 `success` 유무에 기대 분기하지 않고(`hourRate` 만 읽음) 새 필드와 이름이 겹치지 않는다. **통과.** `useDocsSettings` 가 두 모양을 모두 받는 것은 `useDocsSettings.test.jsx` 4건으로 확인됨.

### 2.2 manifest ↔ 코드 — 통과

| 항목 | 판정 | 근거 |
|---|---|---|
| `settings` attributes ↔ 저장 키 | 통과 | `manifest.yml` settings 블록 attributes 14개 = `DEFAULT_SETTINGS` 10키 + `monthRate/monthMode/monthVals`(prev 에서 넘어오는 기존 키) — `updateSettingService` 가 쓸 수 있는 키 전부 선언. `docCategories: any`, `docStaleDays: integer`. 계약 테스트 `test/settings/docSettingsManifest.contract.test.js` 가 "DEFAULT_SETTINGS 전 키 선언"을 강제(통과) |
| F7(같은 배포) | 통과(코드상) | manifest·기본값·서비스가 같은 작업 트리에 함께 있음. 실제 422 여부는 배포 후(§4 미검증) |
| `jira:entityProperty` `movesDocs` | 통과 | `manifest.yml:123-137` `pageIds/categories/count` → `movesDocsPageId/Category/Count`. 쓰는 값은 `movesDocsProperty.js:144-151` 에서 같은 경로로 파생. 프론트 JQL 은 별칭을 쓰지 않음(grep 0건) — 설계 §2.3 주석대로. 이슈 검색 JQL `movesDocsSearch.js:14` `moves_RMS_projectId = "<id>"` 는 기존 `getJqlIssue.js:77` 등과 같은 형식 |
| 스코프 `search:confluence` ↔ Confluence 호출 | 통과 | Confluence 요청 정의는 `confluenceApi/requestConfluence.js:12-18` **`searchContent: GET /wiki/rest/api/search` 1개뿐**. `requestConfluence` import 는 이 파일 하나(grep). `pageSearch.js`·`spaceSearch.js` 는 이 키만 호출. 나머지 `/wiki/…` 문자열은 `movesDocsProperty.js:213` 의 **링크 조립**(`buildDocumentUrl`)으로 API 호출 아님 |
| `app.compatibility` | 통과(lint) | `forge lint` 오류 없음. 실제 비가역 효과는 미검증(§4) |

### 2.3 이슈 프로퍼티 계약 — 통과

| 항목 | 판정 | 근거 |
|---|---|---|
| 쓰기↔읽기 같은 필드·상한 | 통과 | 둘 다 `normalizePages`→`normalizePage`(`movesDocsProperty.js:92-119`) 경유. 읽기 `readPages`(`:125-129`) 30건 slice, 쓰기 `buildLinkProperty`(`:136-156`) 30건 초과 거부·32,768 UTF-8 바이트. id `^\d{1,19}$`(`:22`), 제목·스페이스 255, 분류 30(`:18-20`) 공통 |
| 쓰기 경로 read-merge-write | 통과 | `movesDocsWriter.js:40-50` `readPages(stored)` → `mergePages` → `buildLinkProperty`, null 이면 삭제 |
| `url` 부재 | 통과 | 문서 탭·유틸 전체 grep: `url` 필드 저장·표시 0건. `normalizePage` 가 계약 밖 속성(옛 `url`) 버림(`:88-91`, 테스트 `movesDocsProperty.test.js:135`). `LinkModal.jsx:199-207` 저장 필드는 `id,title,spaceName,category,linkedAt,linkedBy` 만 |
| `buildDocumentUrl` id 만 | 통과 | `movesDocsProperty.js:210-214` `pageId(id)` 검증 후 `${siteUrl}/wiki/pages/viewpage.action?pageId=` 조립. 소비처는 `DocumentsTab.jsx:23` 하나 |
| 인라인 접근 금지 | 통과 | `properties.movesDocs` / `properties?.[…]` grep: 소스는 `movesDocsSearch.js:25` `readPages(raw.properties?.[MOVES_DOCS_PROPERTY_KEY])` 뿐(유틸 내부). 나머지 1건은 테스트 목(`ProjectDocumentsPanel.test.jsx:61`) |
| 실행기 분리 | 통과 | 문서 모듈·`movesDocs*`·`confluenceApi` 에서 `requestJira.js` import 0건. `requestJira.js`·`ProjectDetailTabs.jsx` 는 `git status` 상 변경 없음(HEAD 와 동일) |

### 2.4 보안 규칙 (설계 §10) — S14 실패, 나머지 통과

| # | 규칙 | 구현 위치 | 테스트 위치 | 판정 |
|---|---|---|---|---|
| S1 | 읽을 때 30건·id·255·30·날짜·계정 | `movesDocsProperty.js:22,63-84,92-109,125-129` | `movesDocsProperty.test.js:140,151,158,164,170` | 통과 |
| S2 | `url` 없음, id 로만 링크 | `movesDocsProperty.js:88-91,210-214` | `movesDocsProperty.test.js:135,284~` | 통과 |
| S3 | 최신 정보 500건 상한 → 확인 불가 + 알림 | `documents.js:12,65`, `useProjectDocuments.js:47-49`, `ProjectDocumentsPanel.jsx:145-149` | `documents.test.js:77`(미조회=확인 불가). 훅의 500 slice 자체 테스트는 없음(애드온도 없음) | 통과(구현), 테스트는 순수 로직 수준 |
| S4 | 문법 문자 제거·CQL 이스케이프·id 숫자만 | `cql.js:11,14,24,87` | `cql.test.js:44,51,58,62,91`, `searchOptions.test.js` | 통과 |
| S5 | 재조회 실패 `isError` 우선 | `useProjectDocuments.js:68-69`(latestFailed), `:77`; 실행기가 던짐 `requestCore.js:80` | `useProjectDocuments.test.jsx:33` | 통과 |
| S6 | 섞인 분류는 고르기 전 저장 불가 | `DocActionModal.jsx:25-28,121` | `modals.test.jsx:241-251`(it.each 2건) | 통과 |
| S7 | 저장 중 모달 닫기 금지 | `LinkModal.jsx:221,267`, `DocActionModal.jsx:70,117` | **없음** — 애드온·Workforce 모두 해당 테스트 없음 | 구현 통과 / 테스트 미검증(§4) |
| S8 | 설정 저장 서버 권한 + 검증 | `PermissionMap.js:192` `W('SETTINGS')`, `SettingService.js:102-105`, `DocSettingValidator.js` | `DocSettingValidator.test.js`, `SettingService.test.js:156-168`(findById 전 거부 7종), `permissionMap.contract.test.js` | 통과 |
| S9 | read-merge-write·페이지 단위·빈 목록 삭제·32,768 바이트 | `movesDocsWriter.js:40-50`, `movesDocsProperty.js:152` | `movesDocsWriter.test.js:75,92,105,118,143`, `movesDocsProperty.test.js:115` | 통과 |
| S10 | 조회는 범위 판정 뒤, 탭은 PROJECT read | `ProjectDocumentsPanel.jsx:45-57`, `useProjectDocuments.js:36`, `tabs.js`(documents 항목 `canRender: () => canReadProject`) | `ProjectDocumentsPanel.test.jsx:225` | 통과 |
| S11 | `Object.hasOwn` | `documents.js:39,65` | `documents.test.js:86-87`(`constructor`·`__proto__`) | 통과 |
| S12 | 연결은 Confluence 검색 가능에 묶음 | `useProjectDocuments.js:73-75,141`, `ProjectDocumentsPanel.jsx:84` | `ProjectDocumentsPanel.test.jsx:115,134` | 통과 |
| S13 | 발췌 비저장 | `LinkModal.jsx:199-207` | `linkModalSearch.test.jsx:129` | 통과 |
| **S14** | **운영 빌드 소스맵 제외** | **없음** — `static/ui/craco.config.js` 에 production `devtool` 설정이 없고 `.env` 에 `GENERATE_SOURCEMAP` 도 없음. 이번 빌드 산출물 `static/ui/build/static/js/*.map` **199개**, 이 폴더가 그대로 `manifest.yml:214` 리소스로 배포됨. 애드온은 `craco.config.js:41` 에서 막고 있었음 | — | **실패 (X1)** |

### 2.5 권한 게이트 — 통과

| 게이트 | 위치 | 판정 |
|---|---|---|
| 탭 보기 PROJECT read | `constants/tabs.js` documents 항목 `canRender: () => canReadProject`, `canReadProject` 는 `ProjectDetailTabs.jsx:19` `canRead('PROJECT')` | 통과 |
| 조회 시작 = `findProjectById` 성공 뒤 | `ProjectDocumentsPanel.jsx:52` `projectAllowed = data?.success === true` → `:57` `enabled` → `useProjectDocuments.js:36`. 가용성·최신 조회는 `issuesQuery.isSuccess`·`hasPages` 에 묶임(`:54,62`) | 통과(단 X2 참조) |
| 쓰기 ① 헤더 「문서 연결」 | `ProjectDocumentsPanel.jsx:133` `canWrite &&` (렌더 안 함), `:84` `canLink` | 통과 |
| 쓰기 ② 문서 뷰 동작 열(분류 변경·해제) | `DocumentsTab.jsx:85,124` 헤더 셀·행 셀 모두 `canWrite` 조건 — 열 수 일치 | 통과 |
| 쓰기 ③ 작업 뷰 행 버튼 | `IssuesTab.jsx:25,57` 헤더·행 모두 `canWrite`, `:63` `canLink` | 통과 |
| 쓰기 ④ 스냅샷 자동 갱신 | `useProjectDocuments.js:108` `if (!canWrite …) return` | 통과 |
| `canWrite` 출처 | `ProjectDocumentsPanel.jsx:42` `canWrite('PROJECT')` 한 곳에서 4곳으로 전달 | 통과 |
| 설정 카드 읽기 전용 | `DocumentSetting.jsx:51` `canWrite('SETTINGS')` → `:61` 입력 잠금, `:110` 저장 버튼 숨김, `:122-126` 안내, `:155,162` 삭제·추가 숨김, `:77` 저장 함수 자체도 가드 | 통과 |
| 테스트 | `ProjectDocumentsPanel.test.jsx:188`(버튼 없음 + PUT/DELETE 0건), `:208`(작업 뷰 행 버튼 없음), `DocumentSetting.test.jsx`("설정 쓰기 권한이 없으면 읽기 전용이다") | 통과 |

### 2.6 제거 확인 — 통과

| 대상 | 판정 |
|---|---|
| `useMovesDocsInstalled.js`, `constants/movesDocs.js`, `DocumentsPage.jsx` | 파일 없음 |
| 참조 잔존 | `useMovesDocsInstalled`·`constants/movesDocs`·`parseJql`·`DocumentsPage`·`detectMovesDocsInstalled`·`MOVES_DOCS_DETECT`·`getIssueMovesDocsPages`·`groupMovesDocsByDocument`·`normalizeMovesDocsPage`·`MOVES_DOCS_COUNT_ALIAS`·`fetchMovesDocsIssues`·`movesDocsKeys.installed/documents` — `static/ui/src`·`src` grep **0건** |
| `requestJira.js`·`ProjectDetailTabs.jsx` | 작업 트리 변경 없음(HEAD 원복 확인) |
| `tabs.js` 인자 순서 | 정의 `tabs.js:95` `(t,project_id,toast,canReadReport,canWriteProject,canReadCost,canReadProject,context)` = 호출 `ProjectDetailTabs.jsx:24` 동일 순서·동일 8개, 의존성 배열(`:25`)도 동일 |
| `movesDocsKeys` | `all`, `projectIssues` 만 |

### 2.7 i18n — 통과

- 코드(문서 탭 전 파일 + `DocumentSetting.jsx` + `StatusLozenge.jsx` + `tabs.js`)에서 `t('…')`·`tFormat(t,'…')` 로 쓰는 정적 키 + 동적 키(`docStatus.{broken,stale,ok,unknown}`, `result.reason.{forbidden,notFound,limit,size,unknown}` — `movesDocsWriter.js` FAILURE 값과 대조, `errors.<5개 코드>`) **130개를 스크립트로 전수 대조: 누락 0**.
  - `movesDocs.*` 는 `locales/kr/movesDocs.json`·`locales/en/movesDocs.json` 양쪽에 존재, kr/en 키 집합 동일(한쪽 전용 0), 코드에서 안 쓰는 키 0.
  - 공용 키(`common.button.{save,cancel,close,delete,retry}`, `common.toast.*`, `setting.toast.success`)도 `ko-KR.json`·`en-US.json` 에 존재.
- merge 반영: 소스 값과 `ko-KR.json`/`en-US.json` 값 불일치 0. HEAD 대비 두 생성물의 변경 최상위 키는 `movesDocs` 하나뿐(직접 수정 흔적 없음). `locales/script/*.json` 사용 없음.
- 치환 변수 키는 전부 `tFormat` 호출(`moreIssues`, `selectedDocuments`, `tooManyDocuments`, `truncated/lookupTruncated.description`, `allSucceeded`, `someFailed`, `result.reason.*`).
- 고객 문구 내부 용어: JQL·CQL·프로퍼티·resolver·KVS·Forge·API·권한 키명 grep 0건. 이슈→작업/work item 치환 확인(en 의 `issue` 는 키 이름에만 있음).

### 2.8 다중 shape 재사용 · 동일 데이터 다중 경로

| 대상 | 판정 | 근거 |
|---|---|---|
| 문서 목록을 그리는 곳 | 통과 | 문서 목록·작업 목록·현황 3뷰 모두 `useProjectDocuments` 한 훅 → `fetchProjectIssues` → `toIssue` → `readPages`. 쓰기 쪽 재읽기도 `movesDocsWriter.js:42` `readPages`. Workforce 안에 `movesDocs` 를 읽는 다른 경로 없음(옛 읽기 전용판 제거) |
| `IssueStatusLozenge` 재사용 | 통과 | `IssuesTab.jsx:54` `{name, key: statusCategory}` ↔ `statusAppearance.js getStatusAppearance` 가 `status.key` 우선 — 필드 실재 |
| `DocStatusLozenge` | 통과 | 입력 1종(`doc.status`), appearance 레거시 유효값만(`statusAppearance.js` `DOC_STATUS_APPEARANCE`) |
| `settingKeys.detail()` 2모양 | 통과 | §2.1 |
| **`findProjectByIdQueryKeys` 2모양** | **실패 (X2)** | 아래 |

**X2 상세 — 같은 캐시 키에 두 모양**

| 생산자 | 저장 모양 | 위치 |
|---|---|---|
| `ProjectDetailPage` | 원형 `{success, rows}` | `ProjectDetailPage.jsx:39-45` |
| `ProjectIssueMapView` | 원형 | `ProjectIssueMapView.jsx:82-88` |
| `ProjectDocumentsPanel` | 원형 | `ProjectDocumentsPanel.jsx:45-51` |
| **`ProjectModal`** | **`rows[0]` 객체(`success` 없음)** | `pages/project/modal/ProjectModal.jsx:128-137` (`staleTime: 0`) |

재현: 프로젝트 목록(또는 칸반)에서 프로젝트 편집 모달을 열었다 닫고(저장 안 함 → 무효화 없음) 60초 안에 그 프로젝트 상세 → 「문서」 탭. 상세·문서 탭 관찰자의 `staleTime` 60초 안이라 재조회가 없고, 캐시는 `rows[0]` 객체 → `ProjectDocumentsPanel.jsx:52` `data?.success === true` 거짓 → `:55` `scopeFailed` → `:88` "문서 정보를 불러오지 못했습니다". 재시도(`scopeQuery.refetch`)로 복구. 프론트 보고서 §7 이 기존 결함으로 적었으나, **새 탭이 이 캐시를 게이트로 쓰면서 사용자에게 거짓 오류로 드러나는 경로가 새로 생겼다.**
수정 방법(택1):
1. (권장) `ProjectModal.jsx:128-137` 의 queryFn 이 원형을 그대로 반환하고 `select: (r) => r.rows[0]` 로 모양을 바꾼다 — 캐시는 원형 하나로 통일(실패는 계속 던지게 유지). 상세 페이지 제목 누락도 함께 해결.
2. 또는 모달 전용 키(`projectKeys` 에 팩토리 추가)로 분리.
3. 최소 대응: 문서 탭에서 `scopeQuery.data` 에 `success` 가 없으면 성공으로 보지 않고 `refetch` 를 한 번 부르게 한다(권장하지 않음 — 원인은 모달 쪽).

### 2.9 테스트 이식 대조 (애드온 `moves-workforce-docs/static/ui/src` ↔ Workforce)

| 애드온 테스트 | Workforce | 결과 |
|---|---|---|
| `confluenceApi/__test__/{cql,pageSearch,pageSearchOptions,searchOptions,spaceSearch}` | 같은 경로 | **바이트 동일**(`cmp`) |
| `jiraApi/__test__/{movesDocsProperty,movesDocsSearch,movesDocsWriter}` | 같은 경로 | **바이트 동일** |
| `pages/project/__test__/{documents,filters}.test.js` | `pages/projectDetail/documents/__test__/` | **바이트 동일** |
| `useProjectData.test.jsx`(1) | `useProjectDocuments.test.jsx`(1) | 이름 동일, 누락 0 |
| `linkModalSearch`(9)·`modals`(11)·`OverviewTab`(5) | 같은 이름 | 테스트 이름 전부 일치, 누락 0 |
| `queryKeyFactories`(7) | Workforce 파일(12) | 애드온 7건 전부 존재, 누락 0 |
| `ProjectPage.test.jsx`(10) | `ProjectDocumentsPanel.test.jsx`(11) | 누락 3 = **의도된 제거(기억 기능)**: "들어올 때 받은 프로젝트 이름은 … 기억해 둔다", "이슈가 하나도 조회되지 않으면 이름을 기억하지 않는다 …", "이름 없이 들어오면 기억하지 않고 번호로 표시한다". 신규 4 |
| `SettingsPage.test.jsx`(7) | `DocumentSetting.test.jsx`(7 정의, it.each 포함 실행 11) | 이름이 바뀐 대응: 관리자 저장→쓰기 권한 저장, 관리자 아님→쓰기 권한 없음, 서버 거부 사유→5개 코드 it.each, 아는/모르는 코드 문구→코드 5개 문구 존재 + 모르는 오류는 공통 토스트. **대응 없이 빠진 것 2건**: ① "관리자 여부를 확인하지 못하면 읽기 전용으로 두고 알린다" — 관리자 판정 자체를 버렸으므로 의도된 제거(설계 §4.7). ② "설정 조회 실패는 빈 화면이 아니라 오류로 보여 준다" — 조회를 `SettingPage` 가 소유하게 되며 "설정 미수신이면 입력을 그리지 않는다"로 바뀜. `SettingPage` 에는 조회 실패 표시가 없어(다른 카드와 같은 기존 동작) **조회 실패 시 카드는 스켈레톤에 머문다** — 검증 내용이 줄어든 항목으로 기록 |
| 백엔드 `SettingsValidator.test.js`(12) | `DocSettingValidator.test.js`(12) | 케이스 상위 집합(비배열 5종, 기준일 위반 9종 + `Infinity`, 항목 형식 4종, 대소문자 유지 추가). 빠진 것 "설정 자체가 객체가 아니면 거부"는 `SETTINGS_INVALID` 폐기에 따른 의도된 제거(설계 §3.2) |
| 가져오지 않은 것 | App.license, license, licenseDecision, useLicenseStore, LicenseGuard, HomePage, ForgeHistoryRouter, tableSort, locales, useI18nStore, SettingsController/Service, ProjectService, 애드온 `queryKeyContract` | 설계 §8.2 "가져오지 않는 테스트"와 일치 |

프론트 보고서 §5 의 "보안 규칙 테스트 손실 없음 … 저장 중 모달 닫기 금지(S7) … 이식 파일에 그대로 있다"는 **사실과 다름** — S7 을 확인하는 테스트는 애드온에도 Workforce 에도 없다(`modals.test.jsx`·`linkModalSearch.test.jsx` 에 닫기 관련 단언 0건). 손실은 아니지만 "유지"도 아니다(§4 미검증).

### 2.10 성능 패턴 — 통과

| 상한 | 위치 | 테스트 |
|---|---|---|
| 프로젝트 이슈 검색 2,000건(100건씩 최대 20회, `nextPageToken`) | `movesDocsSearch.js:9-10,33-57` | `movesDocsSearch.test.js:106-117` |
| 최신 정보 조회 500건(50개씩) | `documents.js:12`, `useProjectDocuments.js:47-48`, `cql.js:8` `ID_CHUNK_SIZE=50`, `pageSearch.js:49-55` | `documents.test.js:77`(미조회=확인 불가) |
| 자동 갱신 20건 | `documents.js:106,116-130` `REFRESH_LIMIT` 기본값, 호출 `useProjectDocuments.js:111` | `documents.test.js:241` |
| 쓰기 동시성 4 | `movesDocsWriter.js:71,96` | `movesDocsWriter.test.js:154` |
| 공통 페치 경로 오염 | 없음 — 문서 탭 전용 실행기(`requestCore.js`), 기존 `requestJira.js` 무변경 | — |
| 번들 | Confluence·문서 탭 코드는 lazy 청크에만(main 미포함) | 빌드 확인 |

---

## 3. 실패 상세

### X1 — S14 운영 빌드 소스맵 (설계 §10 규칙 미충족)

- 위치: `static/ui/craco.config.js`(production `devtool` 미설정), 산출물 `static/ui/build/static/js/*.map` 199개 → `manifest.yml:214` `resources.main` 으로 배포.
- 불일치: 설계 §10 S14 "운영 빌드 소스맵 제외 — 전부 유지" ↔ 구현 없음. 애드온은 `moves-workforce-docs/static/ui/craco.config.js:41` `if (NODE_ENV==='production') webpackConfig.devtool = false`. 프론트 보고서 §6 이 "미해결, 결정 필요"로 넘김.
- 수정 방법: (a) `static/ui/craco.config.js` 의 webpack 설정에 애드온과 같은 한 줄 추가(`build:panel` 에도 적용되는지 확인), 또는 (b) Sentry 스택 가독성 때문에 유지한다면 리더가 **설계 §10 S14 를 "Workforce 는 예외"로 명시 개정**하고 DOCUMENTS.md §9 에 기록. 어느 쪽이든 결정이 문서에 남아야 통과로 바꿀 수 있다. (앱 전역 설정이라 이번 흡수 전에도 같은 상태였음 — 새 결함은 아니나, 흡수 설계가 "유지"를 약속한 규칙이다.)

### X2 — `findProjectByIdQueryKeys` 캐시 모양 충돌

§2.8 참조. 수정 담당: frontend(`ProjectModal.jsx`).

---

## 4. 미검증

| # | 항목 | 이유 |
|---|---|---|
| U1 | 배포 후 실측 P2·P3·P5~P8·P10·P11·P14, W1(다중 제품 호환·비가역), W2(KVS `any` 에 빈 배열) | 실배포·실사이트 필요. `forge lint` 는 스코프 변경 메이저 버전만 알렸고, `PermissionLinter` 가 "Unknown product"로 일부 검사를 못 함(HEAD 에서도 동일) → `requestConfluence` ↔ `search:confluence` 충분성은 lint 로도 확인되지 않음 |
| U2 | 설정 저장 시 KVS 422 미발생 | manifest 배포 후에만 확인 가능(테스트는 선언 존재만 확인) |
| U3 | S7 저장 중 모달 닫기 금지의 **회귀 테스트** | 테스트 없음(구현은 `LinkModal.jsx:221,267`, `DocActionModal.jsx:70,117` 에서 확인). 필요하면 `modals.test.jsx` 에 "저장 중 취소 버튼 비활성·onClose 미호출" 1건 추가 |
| U4 | E2E(탭 렌더·`?view=` 딥링크·Confluence 검색·프로퍼티 쓰기·폴백·백오피스 카드) | jsdom 테스트만 있음 |
| U5 | `DocumentSetting` 의 설정 조회 실패 표시 | `SettingPage` 가 조회 실패를 그리지 않아 스켈레톤 유지(기존 카드와 동일 동작). 의도 여부 리더 판단 |
| U6 | 번들 크기 증가량 | 기준선 빌드 없음(예산 안은 확인) |

## 5. 참고 관찰 (실패로 분류하지 않음)

- `result.reason.size` 문구(kr "문서 제목이나 **주소**가 너무 길어…", en "…titles or **addresses**…")가 `url` 을 더는 저장하지 않는 계약과 어긋난다. 애드온 문구 그대로 옮긴 것. "문서 제목이나 스페이스 이름이 너무 길어"로 고치면 정확하다(`locales/kr|en/movesDocs.json` → merge).
- `DocumentSetting.jsx:57-59` 는 `settings` 가 바뀔 때마다 초안을 덮어쓴다 — 같은 페이지의 다른 카드(EtcSetting 등)를 저장하면 문서 카드의 저장 전 편집이 사라진다. 형제 카드 패턴과 같아 보류.
- 설정 캐시에 `{success:false}` 원형이 먼저 들어간 드문 경우 `DocumentSetting` 은 분류 0개·기준일 빈 칸으로 보인다. 그대로 저장하면 기준일 0 이 서버에서 거부되어 분류가 비워지지는 않는다(검증 순서상 `docCategories` 통과 뒤 `docStaleDays` 에서 throw, 저장 전).


## 반영 결과 (리더, 2026-09-30)

| 출처 | 항목 | 처리 |
|---|---|---|
| Codex 높음 | 범위 판정 거부 뒤에도 이슈 캐시로 Confluence 조회가 도는 경로 | **수정** — `useProjectDocuments` 의 최신 정보·가용성 조회가 상위 `enabled` 를 따름. 회귀 테스트 추가(수정을 되돌리면 실패하는 것 확인) |
| Codex 중간 | 스페이스 목록 조회 실패 시 "전체 스페이스로 검색" 안내와 실제 조건 불일치 | **수정** — 실패하면 골라 둔 스페이스를 비움 |
| Codex 중간 | `settingKeys.detail()` 캐시를 여러 화면이 다른 모양으로 채움 | 보류 — 기존 Workforce 구조. 문서 탭 훅은 두 모양을 모두 받는다. 공용 fetcher 로 모양을 고정하는 것은 별도 정리 과제 |
| Codex 낮음 | 크기 오류 문구에 "주소" 잔존 | **수정** (kr/en) |
| Codex 낮음 | CSS 중복 선언 | **수정** |
| 검증 X1 | 운영 빌드 소스맵(S14) | **예외로 명시**(DOCUMENTS.md §9) — 제품 전체 설정이라 결정 대기 |
| 검증 X2 | `ProjectModal` 이 같은 캐시 키에 다른 모양을 저장 → 문서 탭 오류 오표시 | **수정** — queryFn 은 원형 저장, 모달은 `select` 로 rows[0] |
| 검증 | S7(저장 중 닫기 금지) 회귀 테스트 부재 | **추가** — Escape 로 검증, 가드를 제거하면 실패하는 것 확인 |
| 검증 | 백오피스 설정 조회 실패 시 카드가 스켈레톤에 머묾 | 보류 — 형제 카드(EtcSetting·SalaryPolicySetting)와 같은 기존 관례 |

재실행: 프론트 143 스위트 2,335건 통과, `CI=true` 빌드 성공(main gzip 481,761 B / 950,000 · panel 329,314 / 350,000).
