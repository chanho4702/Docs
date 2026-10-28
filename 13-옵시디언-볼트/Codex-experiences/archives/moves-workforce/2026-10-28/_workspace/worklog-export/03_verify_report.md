# 03 — 통합 정합성 검증 리포트 (worklog-export)

> 검증일 2026-08-26 (1차) · **재검증 2026-08-26 2차 — F-1·F-2 해소 확인** · 기준 브랜치 `develop` (커밋 전 워킹트리) · 기준 문서 `01_architect_design.md`
> 방법: **경계면 양쪽 동시 읽기** (생산자 ↔ 소비자) + 루트/프론트 jest + `CI=true npm run build`
> 이 기능은 **백엔드 resolver 가 0개**다. 경계면은 (a) 권한 카탈로그 키 파생 경로, (b) Jira REST 응답 ↔ 소비 코드,
> (c) `useWorklogCollector` 반환 shape ↔ 컴포넌트 3종이다.

## 요약

| 분류 | 건수 | 내용 |
|------|-----|------|
| ✅ 통과 | 24 + **2(해소)** | 아래 §1 · 1차 실패 F-1·F-2 는 **재검증에서 모두 해소**(§2) |
| ❌ 실패 | **0** | 미해결 실패 없음 |
| ⚠️ 미검증 | 6 | 아래 §3 (전부 배포 후 E2E 또는 라이브 Jira 필요 — 1차와 동일, 재검증 범위 밖) |

**최종: 코드 레벨 미해결 실패 0건. 배포 차단 없음.**
1차에서 낸 F-1(중, 검색 실패 메시지가 Jira 원문 대신 내부 디버그 덤프) · F-2(경, 셀렉터 아바타 이중 렌더)를
frontend-engineer 가 수정했고, **양쪽 다 근본 원인을 제거하는 방식으로** 고쳐졌음을 확인했다 —
F-1 은 언랩을 공용 함수(`jiraError.js`) 하나로 뽑았고, F-2 는 `withRenderedLabel` 을 **구조적으로 멱등**하게 만들었다.
남은 것은 §3 미검증 6건(배포 후 E2E)과 §4 관찰 6건뿐이다.

---

## 1. 통과 (경계면 교차 비교)

### 1-A. 권한 키 `WORKLOG_EXPORT` — 카탈로그 → resolver 응답 → 스토어 → 사이드바 → 백오피스 화면

| # | 경계면 | 생산자 | 소비자 | 판정 |
|---|--------|--------|--------|------|
| P-1 | 카탈로그 엔트리 | `src/permission/ResourceCatalog.js:56-57` — `section:'WORKFORCE'`, `admin:t`, `member:ff`, `defaultForNew:ff`, `migrateFrom` **없음** | 설계 §3-1 표 | ✅ 6개 필드 전부 일치 |
| P-2 | 노출 순서 | `RESOURCE_MANAGEMENT` **바로 다음**, WORKFORCE 마지막 | 설계 §3-1 "정의 순서 = 프론트 노출 순서" | ✅ |
| P-3 | `userPermissionCheck` 파생 | `RESOURCE_KEYS`/`mergeSetPages` (코드 무변경) | `usePermissionStore.canRead('WORKLOG_EXPORT')` | ✅ `test/permission/userPermissionCheck.test.js` (`toHaveLength(RESOURCE_KEYS.length)`) 포함 1372 케이스 전량 통과 |
| P-4 | `getPermissionCatalog` 파생 | `getCatalogSections()` (코드 무변경) | `static/ui/src/hooks/usePermissionCatalog.js:27` `HIDDEN_CATALOG_KEYS = new Set(['PROJECT_GANTT'])` | ✅ `WORKLOG_EXPORT` 는 필터 대상이 **아니므로** 백오피스 권한 화면에 read/write 토글이 **코드 수정 없이** 자동 노출. `:45-55` 가 서버 sections 를 그대로 매핑 |
| P-5 | 사이드바 게이팅 | `layout/Sidebar.jsx:83-88` `permission:'WORKLOG_EXPORT'` | `:89` 기존 `.filter(item => item.permission === null \|\| isReadable(item.permission))` | ✅ 게이팅 코드 추가 없음. 항목 위치도 `/resource`(`:78-82`) **다음** = mainItems 마지막 |
| P-6 | 프론트 하드코딩 키 목록 | — | `static/ui/src` 전역 grep(`RESOURCE_MANAGEMENT`) | ✅ 프론트에 권한 키를 **열거하는 상수 배열이 없다**(전부 서버 sections 파생). 새 키 때문에 고쳐야 할 두 번째 목록이 존재하지 않음 |
| P-7 | 시드/마이그레이션 | `SeedData.js` **무변경**, `onInstall.js:5-9` SEED_VERSION 9→10 | `PresetPermissionSeed.test.js` "Team Lead ↔ Team Member 차이는 `RESOURCE_MANAGEMENT` 하나" | ✅ 프리셋 개별 분기 없음 → diff 불변, 통과 |
| P-8 | 신규 계약 테스트 | `src/permission/__test__/WorklogExportCatalog.test.js` | 설계 §3-7 4항목 + 번역 소스 존재 | ✅ 설계 요구 4개를 전부 못박고 kr/en 번역 소스까지 검사(5번째 케이스) |

> 「동일 데이터 다중 경로」 점검: 이 기능은 데이터를 내주는 **서버 경로가 0개**다(`PermissionMap` 등록 대상 없음 — 설계 §3-5 확인).
> 우회 가능한 형제 resolver가 존재하지 않으며, 실제 데이터 경계는 `requestJira`(=asUser)의 Jira 자체 권한이다.
> 「읽기↔쓰기 대칭」 점검: 쓰기 경로 없음(순수 읽기).

### 1-B. Jira REST 응답(§2-A) ↔ `pages/worklogExport/` 소비 코드

| # | 경계면 | 생산자 | 소비자 | 판정 |
|---|--------|--------|--------|------|
| P-9 | `executeRequest` 실패 판정 — **4곳 전부** | `utils/jiraApi/requestJira.js:185-196` (throw 하지 않고 `{success:false, error:{code,...}}` 반환) | `searchIssues.js:40`, `fetchIssueWorklogs.js:59`, `useJiraProjectOptions.js:29`, `useJiraUserOptions.js:29` | ✅ **4곳 전부** `res?.success === false` 명시 검사. 누락 0건 |
| P-10 | GET 파라미터 위치 | `requestJira.js:120-129` — GET 은 **2번째 인자(`param`)** 를 쿼리스트링으로, `urlParam`(3번째)으로 `{key}` 치환. 4번째 `queryParam` 은 non-GET 전용 | `fetchIssueWorklogs.js:51-57` `executeRequest('getIssueWorklogs', {startAt,maxResults}, {issueIdOrKey})` | ✅ 위치 정확. `{issueIdOrKey}` URL 치환도 일치 |
| P-11 | `searchIssueWithJQL` 응답 | POST body `{jql, fields:['summary','project'], maxResults:100, nextPageToken?}` | `searchIssues.js:49` `res.issues`, `:61` `res.nextPageToken`, `:62` `res.isLast === true` | ✅ `total` 이 없는 커서 페이징 전제 준수. `Array.isArray` 방어 있음 |
| P-12 | 이슈 필드 경로 | `issues[].key` / `fields.summary` / `fields.project.key` | `worklogFilter.js:44-46` `issue?.key`, `issue?.fields?.summary`, `issue?.fields?.project?.key` | ✅ 설계 §2-A·§5-3 과 글자 그대로 일치 |
| P-13 | `getIssueWorklogs` 페이징 | `{startAt, maxResults, total, worklogs[]}` | `fetchIssueWorklogs.js:63-68` — `res.worklogs`, `Number(res?.total ?? worklogs.length)`, `startAt += pageItems.length`, `pageItems.length===0 \|\| startAt>=total` 종료 | ✅ `total` 누락 시에도 1페이지 뒤 안전 종료. `maxResults:100` **명시**(기본값 1048576 함정 회피, `:53-55` 주석) |
| P-14 | `getProjects` 응답 | `{values[], total, isLast}` | `useJiraProjectOptions.js:30` `res?.values ?? []` | ✅ (`isLast` 는 소비하지 않음 — 셀렉터가 상위 50건만 쓰는 설계라 페이징 불필요. 계약 위반 아님) |
| P-15 | `searchUsers` **배열 최상위** | `requestJira.js:97-100` 신규 키 `GET /rest/api/3/user/search` | `useJiraUserOptions.js:30` `Array.isArray(res) ? res : []` | ✅ `{values}` 래핑을 가정하지 않는다. `:32` `accountType === 'atlassian'` 필터도 설계 §2-A 주석대로 |
| P-16 | 워크로그 아이템 필드 | `id/author.accountId/author.displayName/started/timeSpentSeconds/comment(ADF)` | `worklogFilter.js:43-54` | ✅ 전 필드 경로 일치, 전부 `?? ` 기본값 방어 |

### 1-C. `useWorklogCollector` 반환 shape(§2-C) ↔ 페이지/진행률/요약/표/CSV

| # | 필드 | 생산자 | 소비자 | 판정 |
|---|------|--------|--------|------|
| P-17 | `state.{phase,issueTotal,issueDone,truncated,failures,errorMessage}` | `useWorklogCollector.js:29-36, 78-139` | `WorklogExportPage.jsx:33`(phase), `WorklogExportProgress.jsx:34` (6개 전부 구조분해) | ✅ 6개 필드 **전부** 생산·소비 일치. 유령 필드 0건 |
| P-18 | `rows`(WorklogRow) 11필드 | `worklogFilter.js:42-54` | `worklogCsv.js:12-24` COLUMNS 11개 / `WorklogExportTable.jsx:57-63` 7개(부분집합) / `WorklogExportSummary.jsx:14-18` (`issueKey`,`timeSpentSeconds`) | ✅ **소비 필드 전부 생산 코드에 실재**. 표 컬럼 라벨을 `COLUMNS` 에서 파생(`WorklogExportTable.jsx:27`)해 "표엔 있는데 CSV엔 없는 컬럼" 구조적으로 불가 |
| P-19 | 다중 shape 재사용 컴포넌트 | — | 이 기능의 모든 컴포넌트는 **WorklogRow 단일 shape** 만 받는다 | ✅ 2026-07-22 `ScopeSplitCell` 류 결함 성립 불가 |
| P-20 | 공용 컴포넌트 prop 계약 | `PageContainer.jsx:22-29`, `Card.jsx:65`, `CommonTable.jsx:33-47`, `Summary.jsx:35` `KpiTile({icon,label,value,valueColor})`, `ToastFlags.jsx:65` | 페이지·컴포넌트 4종 호출부 | ✅ 넘기는 prop 이 전부 시그니처에 실재(`title/description`, `title/headerRight`, `head/rows/rowsPerPage/maxHeight/isLoading/emptyMessage`, `icon/label/value`). `toast` 는 `useMemo` 로 아이덴티티 고정(`ToastFlags.jsx:86`)이라 `run` 의 `useCallback` 의존성이 매 렌더 깨지지 않음 |

### 1-D. 지시받은 특정 점검 항목

| # | 점검 | 결과 |
|---|------|------|
| P-21 | **재필터 §5** | ✅ `worklogFilter.js:19` `String(started ?? '').slice(0,10)` / `:33` `author?.accountId` 비교(`updateAuthor` 아님) / 프로덕션 코드에 `toISOString`·`dayjs.utc`·`dayjs.tz` **0건**(grep 확인 — 히트는 주석 2건과 "이렇게 하면 틀린다"를 대조하는 테스트 `worklogFilter.test.js:26` 뿐) |
| P-22 | **`p-limit`·`AbortController` 미사용** | ✅ grep 히트는 "쓰지 않는다" 주석뿐(`useWorklogCollector.js:20,44,47`). `mapWithConcurrency`(`utils/useJiraUserInfos.js:34`) **세 번째 사용자로 합류**, 새 동시성 유틸 없음. 상한 4(`WORKLOG_FETCH_CONCURRENCY`) — 설계 상한 8 이내. worker 를 try/catch 로 감싸 `Promise.all` 전체 거부 방지(`:120-130`, 설계 §6-2 경고 준수) |
| P-23 | **JQL 조립 §5-4** | ✅ `buildWorklogJql.js:16` 이스케이프 **순서**(`\`→`\\` 먼저, 그다음 `"`→`\"`) / `:24,26` 빈 배열이면 절 생략 / `:29-30` `worklogDate >= … AND worklogDate <= …`(양끝 inclusive, `<` 아님) / `:37` 추가 JQL 은 **이스케이프 없이** `AND (원문)` 괄호 결합 / `ORDER BY` 없음. 단위 테스트 9케이스가 전부 못박음 |
| P-24 | **CSV §7** | ✅ BOM = U+FEFF **실측 확인**(`worklogCsv.js:27`) / `escapeCell:35-41` 전 셀 항상 인용 + `"`→`""` + 개행 3종(`\r\n\|\r\n`)→공백 / `toCsv:44-45` 줄바꿈 `\r\n` / `COLUMNS:12-24` **11개 컬럼이 §7-1 표 순서 그대로** / `buildCsvFileName:53-57` ASCII 고정 + zero-pad / `downloadCsv:69-77` Blob→createObjectURL→click→**revokeObjectURL**. 수식 인젝션 미적용을 코드 주석(`:32-33`)에 명시 — 설계 §7-2 "적용 여부를 주석에 남길 것" 충족 |
| P-25 | **다운로드 패턴 일치** | ✅ `utils/downloadExcelUtil.js:15-20`(프로덕션 검증된 선례)과 **동일 패턴**(anchor 미append + 동기 revoke). 새 위험을 도입하지 않았다 |
| P-26 | **라우트·Suspense** | ✅ `App.jsx:49` `React.lazy`, `:118` `<Route path="/worklog-export">` 가 `:98-99` `<ChunkErrorBoundary><Suspense fallback={<PageSkeleton/>}>` **안**. 최상위 라우트라 추가 경계 불필요(CLAUDE.md 코드 스플리팅 주의 충족, React #426 방어 성립). 번들: main `rawBytes` 1,579,707 / gzip 433KB, 예산 950KB 통과 |
| P-27 | **i18n** | ✅ `pages/worklogExport/**` + `Sidebar` 가 참조하는 **worklogExport 키 52개 전부** `locales/ko-KR.json`·`en-US.json` 에 존재(스크립트 대조). kr/en **키 집합 완전 동일**(52 vs 52, 편차 0). 카탈로그 2키 `common.pages.worklogExport`·`permission.desc.WORKLOG_EXPORT` 도 양쪽 병합 확인. `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음(merge 산출물), `locales/script/*.json` 미사용. `{token}` 치환 키는 **전부 `tFormat(t,…)`** 사용(진행률·경고·미리보기·토스트 6곳) |
| P-28 | **쿼리키** | ✅ `queryKeyContract.test.js` 단독 실행 통과(인라인 배열 0건). 신규 `jiraKeys.projectSearch/userSearch`(`jiraKeys.js:15,17`)가 기존 파일 형식(plain object of arrow fn)·기존 prefix 관례(`jiraUserInfo`,`jiraMyPermissions` → `jiraProjectSearch`,`jiraUserSearch`)와 일치. 수집 결과에 쿼리키를 만들지 않은 것은 설계 §4-6 확정 사항 |
| P-29 | **권한 직접 진입 게이팅** | ✅ `WorklogExportPage.jsx:51` `if (!canRead('WORKLOG_EXPORT')) return <NoPermissionPage/>;` — 사이드바 숨김에 더한 **페이지 자체 게이트** 존재. 기존 `pages/resource/ResourcePage.jsx:39-43`, `pages/portfolio/PortfolioDashboardPage.jsx:146`, `backoffice/page/storage/StoragePage.jsx:14-17` 과 **동일 수준·동일 패턴**. 훅 호출 뒤 early-return 이라 조건부 훅 위반도 없음 |
| P-30 | **실행 검증** | ✅ 루트 `npm test`: **86 suites / 1372 tests 전량 통과**(exit 0) · `cd static/ui && npm test`: **93 suites / 1630 tests 전량 통과**(exit 0, 신규 4스위트 포함) · `cd static/ui && CI=true npm run build`: **성공**(exit 0), `bundle:check` `withinBudget:true`. `pages/worklogExport/` 발 경고 0건 |

---

## 2. 실패 → **재검증 결과: 2건 모두 해소** (2026-08-26 2차)

> 1차 검증에서 실패 2건(F-1 중 / F-2 경)을 냈고, frontend-engineer 가 수정했다(`02_frontend_report.md` §10).
> 아래는 **수정 후 재검증** 결과다. 재검증 범위는 F-1·F-2 경계면과 그 파급뿐이며, §1 통과 24건·§3 미검증 6건은 재확인하지 않았다(빌드는 리더 담당).

### ✅ F-1 (해소) 검색 실패 메시지에 Jira 원문이 실린다

- **수정 확인**
  | 파일:라인 | 확인 내용 |
  |-----------|----------|
  | `static/ui/src/pages/worklogExport/utils/jiraError.js` (신규 53줄) | `unwrapJiraError(res)` → `{code, message}`. `:44` `error?.cause?.message ?? error?.message ?? ''` — **두 겹 래핑의 안쪽(Jira 원문)을 먼저 집는다**. `:22-36` `unwrapJiraBody` 가 `{`로 시작할 때만 `JSON.parse` 하고 `errorMessages` + `Object.values(errors ?? {})` 를 합쳐 한 겹 벗긴다. 파싱 실패·비-JSON 은 원문 그대로(`try/catch`). `:49-51` 300자 초과 시 `…` 절단 |
  | `utils/searchIssues.js:3, :44` | 수동 조립 `{code: res.error?.code, message: res.error?.message}` → `unwrapJiraError(res)` 로 교체 |
  | `utils/fetchIssueWorklogs.js:2, :62` | 동일 교체 — `failures[].message` 도 같은 원문을 본다 |
  | `hooks/useWorklogCollector.js:71-79` | `const detail = error?.message ? \` ${error.message}\` : ''` 를 400 **과 그 외 코드 양쪽**에 붙인다. 1차 코드는 403/500 에서 메시지를 통째로 버렸는데 그것도 함께 고쳐졌다 |

- **경계면 재대조 (생산자 ↔ 소비자)**
  - 생산: `utils/jiraApi/requestJira.js:182` 안쪽 `new RequestJiraError(response.status, text, response)` → `.message` = `response.text()` 원문 / `:186` 바깥이 그것을 `.cause` 로 품는다 / `:193` `cause: e?.cause || ''`.
  - 소비: `jiraError.js:44` 가 정확히 그 `cause.message` 를 집는다. `cause` 가 `''`(폴백된 경우)면 `''.message === undefined` → `??` 가 바깥 `message` 로 폴백 — **네트워크 오류 등 cause 가 없는 경로에서도 죽지 않는다**(테스트 4번째 케이스가 이 경로를 못박음).
  - 반환 shape `{code, message}` 는 **1차와 동일**하므로 하류 소비자 무영향: `useWorklogCollector.js:127` `failures.push({issueKey, code, message})`, `WorklogExportProgress.jsx:75`(`issueKey` 만 사용) 모두 그대로 유효. 파급 회귀 0건.
  - 실제 표시 문자열: `JQL이 올바르지 않습니다. Field 'issuetyp' does not exist.` — 요청 파라미터 JSON 노출도 함께 사라졌다. **설계 §5-4(L429) 요구 충족.**

- **적용 범위를 4곳 → 2곳으로 한 판단: 타당하다 ✅**
  `useJiraProjectOptions.js:29` · `useJiraUserOptions.js:29` 를 재확인한 결과, 두 훅은 실패를 `return []` **하나로만** 표현하고 반환 계약이 `{options, isLoading, setQuery}` 라 **에러 메시지를 담을 채널 자체가 없다**. 소비자 `WorklogExportFilterCard` 에도 셀렉터용 에러 표시 자리가 없다. 여기에 `unwrapJiraError` 를 넣으면 반환값을 버리는 죽은 호출이 되고, 살리려면 새 에러 배너 UI 가 필요해 F-1 범위를 벗어난다. 이는 1차 리포트가 이미 **실패가 아니라 관찰(O-2)** 로 분류한 사안과 같은 지점이며, 판단 근거를 `jiraError.js:14-16` 주석에 남겨 나중에 같은 함수를 재사용할 수 있게 했다.

- **테스트** `utils/__test__/jiraError.test.js` 5케이스 신규 — `errorMessages` 언랩 / `errors` 맵 언랩 / 비-JSON 통과 / `cause` 부재 폴백 / 300자 절단. `requestJira.js` 의 **실제 실패 응답 모양을 그대로 픽스처로** 재현한다(`:4-12`).

### ✅ F-2 (해소) 셀렉터 선택 칩의 아바타가 1개만 그려진다

- **수정 확인 — 리포트 권장안 (b) 채택**
  | 파일:라인 | 확인 내용 |
  |-----------|----------|
  | `hooks/useJiraProjectOptions.js:35-39` | 옵션 생산부가 `label`(JSX)을 **만들지 않는다**. `{value, labelText, avatarUrl}` 3필드만 |
  | `hooks/useJiraUserOptions.js:35-39` | 동일 |
  | `hooks/useWorklogExportFilters.js:29-30, :48-58` | `toRawOption` 신설. `setProjects`/`setUsers` 가 `onChange` 객체에서 **원본 3필드만** 뽑아 저장 |
  | `components/WorklogExportFilterCard.jsx:41-51, :62-67` | `optionLabel({avatarUrl, labelText})` 로 시그니처 변경(더 이상 `o.label` 을 읽지 않는다). `withRenderedLabel` 이 **`...o` 스프레드를 버리고** 4필드를 명시 조립 |

- **재래핑 경로 추적 (요청받은 확인)**
  1. 생산 `useJiraProjectOptions` → `{value, labelText:'이름 (KEY)', avatarUrl}` — `label` 없음
  2. `options={withRenderedLabel(projects.options)}`(`:101`) → `{value, labelText, avatarUrl, label:<span><img/>{labelText}</span>}`
  3. react-select `onChange` → 위 4필드 객체 그대로 → `setProjects` → `toRawOption` 이 **`label` 을 떨어뜨리고** 3필드만 state 저장
  4. `value={withRenderedLabel(projectOptions)}`(`:103`) → 3필드로 `label` 을 **새로** 생성
  → `optionLabel` 이 `avatarUrl` 로 `<img>` 를 **1회**만 그리고 그 뒤에 **문자열** `labelText` 를 넣는다. **아바타 1개** ✅
- **`labelText` 가 엘리먼트로 덮이는 경로: 소멸 ✅** `withRenderedLabel:64` 는 `labelText: o.labelText`(문자열 그대로), `toRawOption` 도 `o.labelText` 만 취한다. 1차의 `labelText: o.label`(엘리먼트 대입)은 코드에서 사라졌다. **React 엘리먼트가 Zustand/useState 상태에 들어가는 경로도 함께 제거**됐다.
- **구조적 멱등성 검증** `withRenderedLabel` 은 이제 입력의 `label` 을 **읽지 않는다**(스프레드 없음 + `optionLabel` 이 `avatarUrl`/`labelText` 만 구조분해). 따라서 `withRenderedLabel(withRenderedLabel(x))` 의 결과 구조가 `withRenderedLabel(x)` 와 동일 — 앞으로 누가 어디서 다시 통과시켜도 같은 결함이 재발하지 않는다. 1차 지적의 근본 원인(비멱등)이 **회피가 아니라 제거**됐다.
- **파급 확인** `useJiraProjectOptions`/`useJiraUserOptions` 는 옵션 shape 이 바뀌었으므로 다른 소비자가 있으면 깨진다 → `static/ui/src` 전역 grep 결과 **소비자는 `WorklogExportFilterCard.jsx:85-86` 단 한 곳**. `withRenderedLabel`/`optionLabel` 도 해당 파일 모듈 로컬. 외부 파급 0건 ✅

### 재검증 실행 결과

```
cd static/ui && npx jest src/pages/worklogExport
Test Suites: 5 passed, 5 total     (기존 4 + 신규 jiraError.test.js)
Tests:       54 passed, 54 total    (기존 49 + 신규 5)
```
전량 통과. (전체 `npm test` 는 frontend 리포트 §10 기준 94 suites / 1635 tests 통과. **빌드는 리더가 실행**한다.)

---

## 3. 미검증 (추측으로 통과 처리하지 않음)

| # | 항목 | 이유 / 필요한 확인 |
|---|------|------------------|
| U-1 | Jira REST **실응답** shape | 본 검증은 설계 §2-A 표 · 기존 `REQUEST_MAP` 사용 선례 · 코드 대조까지다. `/search/jql` 의 `nextPageToken`/`isLast`, worklog 의 `total`, `/user/search` 의 배열 최상위, `/project/search` 의 `values`를 **라이브 Jira 로는 확인하지 않았다**(로컬에 Jira 인스턴스 없음). 특히 **신규 키 `searchUsers` 는 이 앱에서 한 번도 호출된 적 없다** — 배포 후 첫 확인 대상 |
| U-2 | 수집 파이프라인 런타임 경로 | `searchIssues` / `fetchIssueWorklogs` / `useWorklogCollector` 에 **자동 테스트가 없다**(신규 테스트 4개는 순수 함수 4종만 커버). 429 재시도·부분 실패 적립·취소 플래그 3지점·`MAX_ISSUES` 절단은 **코드 읽기로만** 검증했다. 회귀 방지를 원하면 `withRetry`(mock fn 3회 429 → 4회차 성공)와 `searchIssues`(mock executeRequest 로 2페이지 + isLast) 테스트를 권한다 |
| U-3 | iframe 안 `<a download>` 동작 | Forge Custom UI iframe 에서의 CSV 다운로드. `downloadExcelUtil` 선례가 있어 동작 가능성이 높지만 **CSV/Blob 조합은 첫 사례**다. 설계 §7-4 도 E2E 항목으로 못박았다 |
| U-4 | Excel BOM 렌더링 | U+FEFF 존재는 실측 확인했으나, 실제 Excel(ko-KR 로케일)에서 한글 헤더가 안 깨지는지는 파일을 열어봐야 안다 |
| U-5 | `worklogDate` 로컬 경계 실측 | §5-1 로직·단위 테스트는 통과. 그러나 "JQL `worklogDate` 판정 타임존 == `started` 문자열 오프셋"이라는 **전제 자체**는 라이브 Jira 에서 월초 00:30 / 월말 23:30 워크로그로 확인해야 한다 |
| U-6 | 기존 설치 마이그레이션 비대칭 | 설계 §3-4 확정 사항(신규 설치 = PM/PMO/TeamLead/TeamMember `read=true`, **기존 설치 = `read=false`**). 코드상 의도대로이나 실제 업그레이드 결과는 배포 후에만 확인된다. **릴리스 노트에 "기존 사이트는 Admin 세트만 메뉴가 보이며, PM 등에게 열려면 관리자가 백오피스 권한 화면에서 토글해야 한다"를 반드시 기재할 것** |

---

## 4. 실패는 아니지만 남기는 관찰 (수정 판단은 리더/담당자에게)

| # | 위치 | 내용 |
|---|------|------|
| O-1 | `WorklogExportPage.jsx:36-38` vs `useWorklogCollector.js:61-65` | 필터 카드의 "조건 초기화"는 `filterState.reset` 만 부르고 collector 의 `reset` 은 **아무도 호출하지 않는다**. 조건을 초기화해도 이전 결과 표·다운로드 버튼이 그대로 남는다. `reset` 은 §2-C 계약에 있는 공개 API 인데 소비자가 없다 — 초기화 버튼에 함께 걸거나, 계약에서 빼는 편이 낫다 |
| O-2 | `useJiraProjectOptions.js:29`, `useJiraUserOptions.js:29` | 실패 시 조용히 `[]` 를 반환한다. 사용자에게는 "검색 결과 없음"과 구분되지 않는다(Jira 권한 문제일 때 특히 혼란). 설계가 요구하지 않았으므로 실패로 잡지 않으나, 셀렉터 하단에 1줄 안내를 두면 좋다 |
| O-3 | `WorklogExportPage.jsx:71-83` | 설계 §8-1 골격의 `Card isLoading={phase==='fetching'} skeleton="table"` 대신 `WorklogExportTable` 에 `isLoading` 을 내렸다. 요약 타일이 진행 중에도 살아 있어 **오히려 낫다**고 판단 — 계약 위반 아님 |
| O-4 | `WorklogExportProgress.jsx:53` + `WorklogExportFilterCard.jsx:178-182` | 실행 중 "취소" 버튼이 **두 곳**에 동시에 뜬다. 설계서 §8-1·§8-2 양쪽에 적혀 있어 설계대로이나, 실사용 시 중복으로 보일 수 있다 |
| O-5 | `locales/{kr,en}/worklogExport.json` | `filter.period.label` 키가 정의됐으나 어디서도 쓰이지 않는다(기간 라벨을 `period.start`/`period.end` 로 각각 표기). 무해 |
| O-6 | `searchApproximateCount` / `startedAfter`·`startedBefore` | 둘 다 **미도입**. 설계서가 각각 "선택 / 실확인 후 채택"(§10-1), "1차 생략 허용"(§6-5)으로 명시 허용한 범위 — 이탈 아님 |

---

## 5. 재작업 지시 요약

| 대상 | 항목 | 우선순위 |
|------|------|---------|
| ~~frontend-engineer~~ | ~~**F-1** Jira 원문 언랩~~ → ✅ **완료·재검증 통과**(`jiraError.js` 신규 + 2곳 적용 + collector 조립 확장) | 해소 |
| ~~frontend-engineer~~ | ~~**F-2** `withRenderedLabel` 멱등화~~ → ✅ **완료·재검증 통과**(권장안 (b) 원본 3필드 저장, 재래핑 경로 추적 확인) | 해소 |
| **frontend-engineer** | (선택) O-1 초기화 버튼에 collector `reset` 연결 / U-2 `withRetry`·`searchIssues` 런타임 테스트 추가 — 이번 수정 범위에서 의도적으로 제외됨(범위 부풀리기 방지) | 낮음 |
| **backend-engineer** | 재작업 **없음**. 카탈로그·시드·i18n·신규 테스트 전부 설계 준수, 계약 이탈 0건 | — |
| **리더** | U-6 릴리스 노트 문구 기재 / §11-D E2E 항목(U-1·U-3·U-4·U-5) 배포 후 수행 | 배포 시 |
