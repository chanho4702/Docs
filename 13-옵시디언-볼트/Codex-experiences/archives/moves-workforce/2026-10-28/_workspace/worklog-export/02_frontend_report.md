# 워크로그 추출 (worklog-export) — 프론트엔드 구현 리포트

구현: frontend-engineer / 2026-08-26
설계서: `_workspace/worklog-export/01_architect_design.md` (§2-A, §2-C, §4~§8, §9-B, §11-B)
기준 브랜치: `develop`

---

## 1. 신규 파일

### 페이지 (`static/ui/src/pages/worklogExport/`)

| 경로 | 역할 |
|------|------|
| `WorklogExportPage.jsx` | 라우트 진입점. 권한 게이트 + PageContainer + ToastFlags + 카드 2장 |
| `components/WorklogExportFilterCard.jsx` | 프로젝트/작성자/기간/추가 JQL + 검색·취소·초기화 |
| `components/WorklogExportProgress.jsx` | 진행률 바 + truncated/partialFailure/cancelled/error 배너 |
| `components/WorklogExportSummary.jsx` | KpiTile 3장 (이슈 수 / 워크로그 건수 / 총 시간) |
| `components/WorklogExportTable.jsx` | CommonTable, 전 셀 sortValue, `PREVIEW_LIMIT = 500` |
| `hooks/useWorklogExportFilters.js` | FilterState + 유효성(`isValid`/`errorKey`/`warnKey`) |
| `hooks/useJiraProjectOptions.js` | `useQuery(jiraKeys.projectSearch)` + 250ms 디바운스 |
| `hooks/useJiraUserOptions.js` | `useQuery(jiraKeys.userSearch)` + 디바운스 + `accountType==='atlassian'` 필터 |
| `hooks/useWorklogCollector.js` | 수집 오케스트레이터 (§2-C 계약) |
| `utils/buildWorklogJql.js` | FilterState → JQL |
| `utils/searchIssues.js` | `nextPageToken` 페이징 + `MAX_ISSUES=5000` 절단 + cancel 검사 |
| `utils/fetchIssueWorklogs.js` | `startAt` 페이징 + `withRetry`(429/5xx) — `withRetry` 를 export 해 search 가 공유 |
| `utils/worklogFilter.js` | `startedLocalDate`/`isInPeriod`/`isSelectedAuthor`/`toWorklogRows` |
| `utils/adfToPlainText.js` | ADF → 플레인 텍스트 (로컬 20줄, `adf-to-md` 미사용) |
| `utils/worklogCsv.js` | `COLUMNS`(단일 출처)/`escapeCell`/`toCsv`/`buildCsvFileName`/`buildWorklogCsv`/`downloadCsv` |
| `utils/__test__/buildWorklogJql.test.js` | 9 케이스 |
| `utils/__test__/worklogFilter.test.js` | 17 케이스 (타임존 경계 포함) |
| `utils/__test__/adfToPlainText.test.js` | 8 케이스 |
| `utils/__test__/worklogCsv.test.js` | 14 케이스 |

설계서 파일 트리(13파일)와 동일. 테스트 4개 포함 총 19파일.

### i18n (신규)
- `locales/kr/worklogExport.json` — §9-B 키 전부
- `locales/en/worklogExport.json` — §9-B 키 전부

## 2. 수정 파일

| 경로 | 변경 |
|------|------|
| `static/ui/src/App.jsx` | `WorklogExportPage` lazy 선언(L49) + `/worklog-export` Route. **Suspense 경계 추가 없음** — `<Routes>` 가 이미 `ChunkErrorBoundary > Suspense fallback={<PageSkeleton/>}` 안이라 최상위 라우트는 그 경계가 그대로 덮는다(L97~99 확인) |
| `static/ui/src/layout/Sidebar.jsx` | `DownloadIcon` import + `mainItems` 마지막 항목(`permission: 'WORKLOG_EXPORT'`). 게이팅 코드는 추가하지 않았다 — 기존 `.filter(item => item.permission === null || isReadable(item.permission))` 가 그대로 처리한다 |
| `static/ui/src/utils/jiraApi/requestJira.js` | `REQUEST_MAP.searchUsers` (GET `/rest/api/3/user/search`) **1키만** 추가 |
| `static/ui/src/utils/queryKey/jiraKeys.js` | `projectSearch(query)`, `userSearch(query)` 팩토리 2개 |
| `locales/ko-KR.json`, `locales/en-US.json` | `npm run merge` 산출물(직접 수정 아님) |

---

## 3. 소비하는 Jira 응답 필드 경로 (경계면 실체)

모든 호출은 `executeRequest(key, param, urlParam, queryParam)` 를 통한다.
🔴 `executeRequest` 는 실패 시 **throw 하지 않고** `{success:false, error:{code,message,...}}` 를 반환하므로 **4개 호출부 전부 `res?.success === false` 를 명시 검사**한다(grep 확인 완료).

| 호출부 | REQUEST_MAP 키 | 요청 | 읽는 필드 |
|--------|---------------|------|----------|
| `utils/searchIssues.js` | `searchIssueWithJQL` (기존) | POST body `{jql, fields:['summary','project'], maxResults:100, nextPageToken?}` | `issues[]`, `issues[].key`, `issues[].fields.summary`, `issues[].fields.project.key`, `nextPageToken`, `isLast` |
| `utils/fetchIssueWorklogs.js` | `getIssueWorklogs` (기존) | GET query `{startAt, maxResults:100}` / urlParam `{issueIdOrKey}` | `worklogs[]`, `total`, 그리고 워크로그 아이템의 `id`·`author.accountId`·`author.displayName`·`started`·`timeSpentSeconds`·`comment`(ADF) |
| `hooks/useJiraProjectOptions.js` | `getProjects` (기존) | GET query `{maxResults:50, query, orderBy:'name'}` | `values[]`, `values[].key`, `values[].name`, `values[].avatarUrls['24x24']` |
| `hooks/useJiraUserOptions.js` | `searchUsers` (**신규**) | GET query `{query, maxResults:50}` | ⚠ **배열 최상위** — `[].accountId`, `[].displayName`, `[].emailAddress?`, `[].avatarUrls['24x24']`, `[].accountType` |

`searchUsers` 성공 응답은 배열이라 `res.success` 가 애초에 `undefined` 다. 그래서 `res?.success === false` 검사 **뒤에** `Array.isArray(res)` 로 한 번 더 좁힌다.

**읽지 않는 것:** Forge 커스텀 필드·`movesRms` 이슈 프로퍼티를 하나도 읽지 않는다 → 팀 관리형 프로젝트 필드 누락 이슈·`fieldsByKeys` 함정 모두 무관(§10-3).

**백엔드 resolver:** 이 기능은 `invoke()` 를 **한 번도 호출하지 않는다.** 앱 내부 접점은 `usePermissionStore.permissions['WORKLOG_EXPORT'].read` 하나이며, 그 값은 backend 가 `ResourceCatalog` 에 키를 추가하면 `userPermissionCheck` 응답 `pages[]` 에서 자동 파생된다(§2-B). 프론트는 읽기만 한다.

---

## 4. `useWorklogCollector` 실제 반환 shape

설계서 §2-C와 **글자 그대로 일치**한다.

```js
// useWorklogCollector({ toast }) 반환
{
  state: {
    phase: 'idle' | 'searching' | 'fetching' | 'done' | 'cancelled' | 'error',
    issueTotal: 0,        // searching 중에는 누적치, fetching 이후엔 확정 이슈 수
    issueDone: 0,
    truncated: false,     // MAX_ISSUES(5000) 절단 여부
    failures: [],         // [{ issueKey, code, message }]
    errorMessage: null,   // phase==='error' 일 때 번역 완료 문자열
  },
  rows: [],               // WorklogRow[]
  run: (filters) => Promise<void>,
  cancel: () => void,
  reset: () => void,
}
```

`WorklogRow` 도 §2-C 그대로 11필드(`worklogId, issueKey, issueSummary, projectKey, authorName, authorAccountId, started, startedDate, startedMs, timeSpentSeconds, timeSpentHours, comment`). **생산부는 `toWorklogRows` 한 곳뿐**이고, 소비부 3곳(표·CSV·요약)이 참조하는 필드가 전부 그 생산부에 있다(§11-C-9):
- 표 → `worklogId(key), issueKey, issueSummary, projectKey, authorName, startedDate, startedMs, timeSpentHours, timeSpentSeconds, comment`
- CSV → `COLUMNS` 11키 전부
- 요약 → `issueKey, timeSpentSeconds`

---

## 5. 설계서 확정 사항 준수 확인

| 항목 | 준수 | 근거 |
|------|------|------|
| `p-limit` 금지 → `mapWithConcurrency` 재사용 | ✅ | `useWorklogCollector.js` 가 `utils/useJiraUserInfos` 에서 import. 상한 `WORKLOG_FETCH_CONCURRENCY = 4` |
| worker try/catch (한 이슈 실패로 전체가 날아가지 않게) | ✅ | worker 안 try/catch/finally, 실패는 `failures[]` 적립 후 `[]` 반환 |
| `AbortController` 금지 → `cancelRef` 플래그 | ✅ | 검사 지점 3곳: search 페이징 각 회차, worker 진입, 워크로그 startAt 페이징 각 회차. `run()` 시작 시 리셋 |
| 취소해도 rows 유지 | ✅ | `cancel()` 은 phase 만 바꾼다. 수집 완료분은 그대로 `setRows` |
| 기간 비교 = `started.slice(0,10)` 문자열, `toISOString()` 금지 | ✅ | `startedLocalDate`. `pages/worklogExport/` 전체에 `toISOString`/`dayjs.utc`/하드코딩 타임존 **0건**(테스트 파일의 반증 케이스 1건 제외 — 의도적) |
| 전 `executeRequest` 호출부 `res?.success === false` 명시 검사 | ✅ | 4/4 |
| 429/5xx 고정 백오프 (Retry-After 못 읽음) | ✅ | `RETRY_STATUS = {429,500,502,503,504}`, `BACKOFF_MS = [1000,2000,4000]` + jitter |
| search 실패는 치명적 → `phase:'error'` 중단 | ✅ | `searchIssues` 가 `{error}` 반환 시 즉시 중단 |
| 이슈 5,000 상한 절단 + `truncated` (중단 아님) | ✅ | `MAX_ISSUES = 5000`, 절단 후 진행 |
| 워크로그 `maxResults:100` 명시 | ✅ | 기본값 1048576 회피. `WORKLOG_PAGE_MAX = 50` 안전 상한 |
| 표 전 셀 `sortValue` (RFC-184) | ✅ | 7/7 셀. `startedDate → startedMs`(숫자), `timeSpentHours → timeSpentSeconds`(초) |
| 표는 미리보기 500, CSV 는 전량 | ✅ | `PREVIEW_LIMIT = 500`, `buildWorklogCsv(rows)` 는 무제한 |
| 진행 중에는 표를 렌더하지 않는다 | ✅ | 페이지가 `rows={isRunning ? [] : rows}` + `isLoading` → 헤더 + 스켈레톤 행만 |
| 스피너 금지 | ✅ | 진행률 막대 + CommonTable 스켈레톤 |
| CSV: BOM / `\r\n` / 전 셀 인용 / `""` / 개행→공백 | ✅ | `worklogCsv.js` + 테스트 |
| 쿼리키 팩토리 (인라인 배열 금지) | ✅ | `jiraKeys.projectSearch`/`userSearch`. 수집 결과는 쿼리키 없음(로컬 `useState`) — `queryKeyContract.test.js` 통과 |
| `{token}` 치환은 `tFormat` | ✅ | progress/preview/warn/toast 전부 `tFormat` |
| 앱 명부 셀렉터 재사용 금지 | ✅ | `pages/project/**`·`resourceKeys` 미사용. Jira `project/search`·`user/search` 기반 신규 셀렉터 |

---

## 6. 설계서에서 벗어난 점

| # | 항목 | 처리 | 이유 |
|---|------|------|------|
| 1 | `searchApproximateCount` REQUEST_MAP 키 | **추가하지 않음** | §2-A #5·§10-1 이 "선택 / API 문서 실확인 후 채택 / 이 엔드포인트에 의존하는 코드 경로를 만들지 말 것"으로 못박았다. 문서를 실확인할 수 없었고, 이 값은 **사전 경고 문구**만 좌우하는 부가 기능이라 도입하지 않았다. 상한은 `MAX_ISSUES` 절단 + `truncated` 경고만으로 성립한다. 도입 시에도 `searchIssues.js` 에 파일 주석으로 근거를 남겨 뒀다 |
| 2 | `startedAfter`/`startedBefore` 워크로그 사전 필터 | **생략** | §6-5 가 "구현 난도 대비 이득이 크지 않으면 1차에서는 생략해도 좋다"고 허용. 전송량 최적화일 뿐이고, 잘못 쓰면 로컬 날짜 경계와 어긋날 위험(UTC 인스턴트)이 있어 1차에서 뺐다 |
| 3 | 필터 카드의 "조건 초기화" 버튼 | **추가함** | §8-2 컴포넌트 표에는 없지만 §9-B i18n 에 `action.reset` 키가, §4-1 훅 계약에 `reset` 이 있어 양쪽을 잇는 UI 가 빠져 있었다. `Button appearance="subtle"` 1개 추가 |
| 4 | `withRetry` 의 위치 | `fetchIssueWorklogs.js` 에서 export → `searchIssues.js` 가 import | §6-4 가 `fetchIssueWorklogs.js` 에 두라 했고 "search 페이징에도 같은 `withRetry` 를 적용한다"고 했다. 새 파일(`jiraRetry.js`)을 만들면 설계 파일 트리를 벗어나므로 export 로 공유했다 |
| 5 | `WorklogExportSummary` 의 `issueTotal` prop | **넘기지 않음** | §8-1 골격에는 `issueTotal` 을 넘기지만 §8-4 타일 3장의 값은 전부 `rows` 에서만 파생된다(이슈 수 = `new Set(rows.map(r=>r.issueKey)).size`). 쓰지 않는 prop 을 넘기지 않았다 |

**계약 모호/불일치는 없었다.** 백엔드 파트(`ResourceCatalog`/`onInstall`/`permission.json`/`common.json`)와 코드 의존이 없고, 접점 문자열 `'WORKLOG_EXPORT'` 는 설계서대로 사용했다.

---

## 7. i18n merge

**실행 완료** — `cd static/ui && npm run merge`.

merge 시점에 **backend-engineer 의 카탈로그 2키가 이미 소스에 들어와 있었고**, 산출물에서 함께 확인했다:

```
ko-KR.json  worklogExport 네임스페이스        → 존재
en-US.json  worklogExport 네임스페이스        → 존재
ko-KR.json  common.pages.worklogExport        → "워크로그 추출"
ko-KR.json  permission.desc.WORKLOG_EXPORT    → "워크로그 추출(Jira 전체)…"
```

즉 **리더가 merge 를 다시 돌릴 필요가 없다.** (단, backend 가 이후 카탈로그 문구를 더 손봤다면 그때는 다시 필요하다.)
`locales/ko-KR.json`·`en-US.json` 은 직접 수정하지 않았다.

---

## 8. 테스트 · 빌드 결과

### `cd static/ui && npm test`
```
Test Suites: 93 passed, 93 total
Tests:       1630 passed, 1630 total
Snapshots:   1 passed, 1 total
Time:        19.569 s
```
전량 통과. 신규 4스위트 48케이스 포함. 기존 계약 테스트(`queryKeyContract`, `tableContract`, `tableSort`)도 통과.

신규 테스트에서 특히 못박은 것:
- **타임존 경계** — `2026-08-20T08:00:00.000+0900` 의 로컬 날짜는 `2026-08-20` 이지만 `toISOString().slice(0,10)` 은 `2026-08-19` 임을 **테스트가 직접 대조**한다(§5-1 회귀 방지). 월초 `00:30`·월말 `23:30` 포함 판정도 커버.
- **JQL 이스케이프 순서** — `a"b\c` → `a\"b\\c`.
- **추가 JQL 은 이스케이프 없이 괄호 결합** — `A OR B` 우선순위 사고 방지.
- **CSV** — BOM 존재, `\r\n`, 전 셀 인용, `""` 이스케이프, 개행 3종(`\n`/`\r\n`/`\r`) → 공백, `0` 이 빈 셀로 죽지 않는지, 파일명 zero-padding.
- **`updateAuthor` 로 통과시키지 않는다** (작성자 필터).

### `cd static/ui && CI=true npm run build`
```
Compiled with warnings.
The build folder is ready to be deployed.

bundle:check → {"file":"static/js/main.20a36fd8.js","rawBytes":1579707,
                "gzipBytes":433567,"budgetBytes":950000,"withinBudget":true}
```
- 빌드 성공, 번들 예산 통과(gzip 433KB / 950KB).
- **경고는 전부 기존 것**이다 — `node_modules` 의 source map 누락 3건(`@atlaskit/analytics-next-stable-react-context` ×2, `marklassian`). `pages/worklogExport/` 에서 나온 경고는 0건.
- 신규 페이지가 lazy 라 **main 번들 크기가 변하지 않았다**(변경 전후 `rawBytes` 동일 1,579,707) — 코드 스플리팅이 의도대로 걸렸다는 증거.

---

## 9. 후속 확인 필요 (프론트가 검증할 수 없는 것)

- backend 의 `ResourceCatalog` 엔트리가 배포돼야 `usePermissionStore.permissions['WORKLOG_EXPORT']` 가 생긴다. 그 전까지 사이드바 항목은 `isReadable` 이 false 라 **보이지 않는다**(fail-close, 정상 동작).
- §11-D E2E: iframe 안 `<a download>` 동작, Excel BOM, `worklogDate` 경계, 500건 규모 진행률·취소.

---

## 10. 수정 이력 — verifier 리포트 F-1 · F-2 대응 (2026-08-26)

입력: `_workspace/worklog-export/03_verify_report.md` §2 (F-1 중 / F-2 경)

### F-1 (중) 검색 실패 메시지에 Jira 원문 대신 내부 디버그 덤프

**원인** `requestJira.js` 는 실패를 두 겹으로 감싼다 — 바깥 `error.message` 는 호출 메타 덤프
(`key: …, param: …`)이고, Jira 가 준 `response.text()` 원문은 안쪽 에러의 `.message`, 즉
`error.cause.message` 에만 남는다. 기존 코드는 바깥 `message` 를 그대로 올려보내 화면에 붙였다.

**수정 — 언랩을 공용 함수 하나로 뽑았다**

| 파일:라인 | 변경 |
|-----------|------|
| `static/ui/src/pages/worklogExport/utils/jiraError.js` | **신규.** `unwrapJiraError(res)` → `{code, message}`. `error.cause?.message ?? error.message` 로 원문을 집고, `{"errorMessages":[…],"errors":{…}}` JSON 이면 `errorMessages` + `Object.values(errors)` 를 합쳐 한 겹 벗긴다. JSON 이 아니면 원문 그대로. 300자 초과 시 절단(`…`) |
| `utils/searchIssues.js:3, :44` | import 추가 + `error: { code, message }` 수동 조립 → `error: unwrapJiraError(res)` |
| `utils/fetchIssueWorklogs.js:2, :62` | 동일 교체 (`failures[].message` 도 같은 것을 보게) |
| `hooks/useWorklogCollector.js:71-79` | `searchErrorMessage` 가 언랩된 `error.message` 를 그대로 쓴다. 400(JQL 오류)뿐 아니라 **그 외 코드에도 원문을 덧붙이도록** 확장 — 기존에는 403/500 에서 메시지가 통째로 버려졌다 |

**결과** JQL 오타 시 SectionMessage 표시가
`JQL이 올바르지 않습니다. key: searchIssueWithJQL, param: {"jql":…}` →
`JQL이 올바르지 않습니다. Field 'issuetyp' does not exist.` 로 바뀐다. 설계 §5-4 요구("사용자가
자기 오타를 고칠 수 있어야 한다") 충족. 요청 파라미터 JSON 노출도 함께 사라진다.

> **적용 범위를 4곳이 아니라 2곳으로 한 이유(의도적):** 리포트가 지목한 나머지 2곳
> (`useJiraProjectOptions.js:29`, `useJiraUserOptions.js:29`)에는 **메시지를 꺼내는 코드가 아예 없다** —
> 실패를 빈 옵션 목록(`return []`)으로만 표현하고, 셀렉터에는 메시지를 표시할 자리가 없다.
> 거기에 `unwrapJiraError` 를 넣으면 반환값을 버리는 죽은 호출이 되고, 메시지를 살리려면 에러 배너 UI를
> 새로 만들어야 해 F-1 수정 범위를 벗어난다. 그 판단 근거를 `jiraError.js` 파일 주석에 남겼다 —
> 나중에 셀렉터에 에러 표시를 붙일 때 같은 함수를 쓰면 된다.

**신규 테스트** `utils/__test__/jiraError.test.js` 5케이스 — errorMessages 언랩 / errors 맵 언랩 /
비-JSON 원문 통과 / `cause` 없을 때 폴백 / 300자 절단.

### F-2 (경) 셀렉터 선택 칩에 아바타 이중 렌더

**원인** `withRenderedLabel` 이 멱등이 아니었다. `{...o, label: optionLabel(o), labelText: o.label}` 이라
이미 래핑된 객체(react-select 의 `onChange` 가 돌려준 것)를 `value=` 로 다시 통과시키면
`o.avatarUrl` 로 `<img>` 를 또 그리고 그 뒤에 기존 `label`(이미 img 를 품은 span)을 넣었다.

**수정 — 리포트 권장안 (b): 원본만 저장하고 렌더 시 1회 래핑**

| 파일:라인 | 변경 |
|-----------|------|
| `hooks/useJiraProjectOptions.js:33-39` | 옵션 생산부가 `label`(JSX) 을 **만들지 않는다**. `{value, labelText, avatarUrl}` 3필드만 |
| `hooks/useJiraUserOptions.js:34-39` | 동일 |
| `hooks/useWorklogExportFilters.js:30, :44-58` | `toRawOption` 신설. `setProjects`/`setUsers` 가 `onChange` 객체에서 원본 3필드만 뽑아 저장 — React 엘리먼트를 상태에 넣지 않는다 |
| `components/WorklogExportFilterCard.jsx:44-68` | `optionLabel` 이 `labelText`/`avatarUrl` 만 읽도록 시그니처 변경. `withRenderedLabel` 은 원본 3필드로 `label` 을 **매번 새로** 만든다 → **구조적으로 멱등**(같은 입력에 몇 번을 돌려도 결과 동일) |

표시 라벨의 단일 출처가 `labelText`(문자열) 하나로 정리되어, `labelText` 가 React 엘리먼트로
덮어써지던 부수 결함도 함께 사라진다.

### 재실행 결과

```
cd static/ui && npm test
Test Suites: 94 passed, 94 total      (신규 jiraError.test.js 1스위트 추가)
Tests:       1635 passed, 1635 total   (신규 5케이스 추가)
Snapshots:   1 passed, 1 total
Time:        17.065 s
```

전량 통과. 빌드는 리더가 마지막에 실행한다(요청대로 미실행).

### F-1/F-2 외 미대응

리포트 §3 U-2 가 권한 `withRetry`·`searchIssues` 런타임 테스트는 **추가하지 않았다** — 이번 지시가
"관련 테스트 추가는 F-1 언랩 함수 한 케이스 정도만, 부풀리지 말 것"이었다. 필요하면 별건으로 요청 바람.

### Codex 리뷰 반영 — C-1 · C-2 · C-3 (2026-08-26)

입력: `codex_review2.txt`. 리더가 지정한 3건만 반영했고, 나머지 4건(CSV 수식 인젝션, 이슈당
워크로그 5,000건 초과, 백오프 중 취소, `/user/search` 빈 query)은 **보류 확정**이라 손대지 않았다.

#### C-1 (높음) 종료일 워크로그가 검색 단계에서 누락될 수 있음

`worklogDate` 가 datetime 으로 해석되면 `<= "2026-08-31"` 은 그날 자정 기준이라 **8/31 낮의 워크로그를
가진 이슈가 검색에서 빠지고**, 그러면 §5 로컬 재필터로도 복구할 수 없다(이미 없는 이슈다).
date 로 해석되면 두 식은 동치라 바꿔서 손해가 없다.

| 파일:라인 | 변경 |
|-----------|------|
| `utils/buildWorklogJql.js:10` | `import dayjs from 'dayjs'` (이미 의존성) |
| `utils/buildWorklogJql.js:29-36` | `worklogDate <= "END"` → **`worklogDate < "END+1일"`** (`dayjs(endDate).add(1,'day')`) |
| `utils/__test__/buildWorklogJql.test.js` | 기존 5개 기대값을 `< "2026-09-01"` 로 갱신 + 케이스명을 "종료 경계는 다음날 미만"으로 정정. **월·연 넘김 케이스 1개 추가**(`2026-12-31` → `2027-01-01`) |

#### C-2 (높음) 취소 직후 재검색 시 이전 실행과 상태가 섞임

`cancel()` 이 즉시 phase 를 'cancelled' 로 바꿔 `isRunning=false` 가 되지만 직전 `run()` 의 왕복·재시도·
동시 작업은 계속 돈다. 사용자가 바로 다시 검색하면 새 run 이 `cancelRef` 를 false 로 되돌려
**이전 실행이 되살아나** 새 실행의 rows·진행률·failures 를 덮어썼다.

| 파일:라인 | 변경 |
|-----------|------|
| `hooks/useWorklogCollector.js:61` | `runIdRef` (정수 세대) 신설 |
| 〃 `:73` | `reset()` 이 세대를 올린다 — 도는 실행이 초기화된 화면을 덮지 못하게 |
| 〃 `:93` | `run()` 진입 시 `const myRun = ++runIdRef.current` |
| 〃 `:96-98` | `isStale()` = `myRun !== runIdRef.current`, `shouldStop()` = `cancelRef.current \|\| isStale()` |
| 〃 `:106, :139, :147` | 취소 검사 3지점(search 페이징 / worker 진입 / 워크로그 페이징)을 전부 `shouldStop` 으로 통일. `fetchIssueWorklogs` 의 `{isCancelled}` 시그니처는 **유지** |
| 〃 `:107, :111, :155, :159` | setState 지점마다 `isStale()` 가드 — 지난 세대는 **아무것도 쓰지 않고 조용히 빠진다** |

`cancelRef` 를 없애고 세대만 쓰지 않은 이유: 사용자 취소는 "지금까지 모은 rows 를 **남긴다**"(설계 §6-1)
이고 세대 교체는 "아무것도 쓰지 않는다"라 두 종료 동작이 다르다. 하나로 합치면 취소 시 부분 결과가
사라진다. 근거를 코드 주석에 남겼다.

#### C-3 (중간) 정확히 5,000건인 완결 검색이 잘렸다고 표시됨

| 파일:라인 | 변경 |
|-----------|------|
| `utils/searchIssues.js:55-68` | `isLast`/`nextPageToken` 종료 검사를 `issues.length >= MAX_ISSUES` 절단 판정 **앞으로** 이동. 더 받을 것이 없으면 절단이 아니므로 `truncated:false` |

#### 재실행 결과

```
cd static/ui && npx jest src/pages/worklogExport
Test Suites: 5 passed, 5 total
Tests:       55 passed, 55 total
Time:        10.679 s
```

빌드는 리더가 실행한다(요청대로 미실행).

### 사용자 피드백 반영 — U-1 · U-2 (2026-08-26)

#### U-1 드롭다운이 카드 아래로 깔려 안 보임

**원인** `components/card/Card.jsx` 가 `cardStyle`에 `overflow:hidden`, 본문 `contentStyle`에
`overflow:auto` 를 준다. 카드 안에서 펼친 react-select 메뉴가 그 경계에서 잘렸다.

| 파일:라인 | 변경 |
|-----------|------|
| `components/WorklogExportFilterCard.jsx:54-65` | `menuPortalProps` 상수 신설 — `menuPortalTarget: document.body`, `menuPosition: 'fixed'`, `styles.menuPortal.zIndex = 1000` (`ProjectStatusEditModal.jsx:71-72` 전례) |
| 〃 `:124, :148` | 프로젝트·작성자 `Select` 두 개에 `{...menuPortalProps}` |
| 〃 `:163, :179` | **DatePicker 2개도 같은 카드 안이라 같은 증상** → `selectProps={menuPortalProps}` (Atlaskit DatePicker 는 내부가 react-select 라 `selectProps` 로 그대로 전달된다) |

#### U-2 CSV → 꾸민 .xlsx

**의존성** `cd static/ui && npm install exceljs@^4.4.0` (루트와 같은 버전). `package.json:63`.

**신규** `utils/worklogXlsx.js`
- `import('exceljs')` **동적 import** — `buildWorklogWorkbook` 안에서만 로드한다. 정적 참조가 한 줄이라도 생기면 청크가 main 으로 합쳐진다(`FullCalendarLazy` 와 같은 규약, 파일 주석에 명시).
- `COLUMNS` 를 여기로 이관(폭·numFmt·wrap 정보 추가). 표는 계속 부분집합으로 참조 → `WorklogExportTable.jsx:5` import 경로만 변경.
- 서식: 헤더 볼드 + `FFEFEFEF` 채움 + 전 셀 thin 테두리(`IssueAnalysisService.js:241-267` 표준), 컬럼 폭 지정, `views:[{state:'frozen', ySplit:1}]`, 헤더 범위 `autoFilter`, `timeSpentHours` `0.00` / `timeSpentSeconds` `#,##0` / `started` Date + `yyyy-mm-dd hh:mm`, 요약·코멘트 `wrapText`.
- **시트 2장** — ① `워크로그` 본문 ② `요약`(추출 조건: 기간·프로젝트·작성자 수·추가 JQL·추출 시각 / 합계: 이슈 수·워크로그 건수·총 시간·총 MD·1MD 기준 시간 / 작성자별 건수·시간 표, 시간 내림차순). 라벨은 전부 `t()`.
- `startedToDate` — `new Date(started)` 를 쓰지 않는다. 브라우저 타임존으로 다시 렌더되면 Jira 화면과 시각이 어긋나므로, 문자열 앞 16글자의 **벽시계 값**을 그대로 Date 로 만든다(§5-1 과 같은 원칙).

**삭제** `utils/worklogCsv.js`, `utils/__test__/worklogCsv.test.js` (죽은 코드 금지). 파일명 규칙은
`buildXlsxFileName` 이 `.xlsx` 로 이어받았다.

**수정**
| 파일:라인 | 변경 |
|-----------|------|
| `WorklogExportPage.jsx:1-13` | import 교체 + `useQuery`/`invoke`/`settingKeys` |
| 〃 `:37-44` | MD 환산 기준 시간을 앱 설정에서 읽는다 — `useQuery(settingKeys.detail())` + `invoke('getSettingData')`, 실패 시 `DEFAULT_HOUR_RATE`(8). `MyPage.jsx:112-117` 와 같은 쿼리이고 **기존 resolver**라 백엔드 추가는 없다 |
| 〃 `:52-70` | `handleDownload` 를 async 로. 동적 import 왕복 동안 버튼 `isLoading`/`isDisabled`, 실패 시 `error.downloadFailed` 토스트 |
| `components/WorklogExportTable.jsx:5, :16-17` | `COLUMNS` import 경로 + 주석의 "CSV" → "엑셀" |
| `locales/kr\|en/worklogExport.json` | `action.download` → Excel 다운로드/Download Excel, `toast.downloaded`, 신규 `error.downloadFailed`, 신규 `sheet.*`(2키), `summary.*` 10키 추가. `npm run merge` **실행 완료**(ko-KR/en-US 반영 확인) |

**신규 테스트** `utils/__test__/worklogXlsx.test.js` — `await import('exceljs')` 가 jest 에서 그대로 동작해
**실제 워크북을 만들어** 검사한다(mock 없음): 시트 2장 / 헤더 행 값 = `COLUMNS` 라벨 / 행 수 = rows+1 /
`numFmt` 3종 / frozen·autoFilter, 그리고 `summarizeRows`·`startedToDate`·`buildXlsxFileName`.

#### 결과

```
cd static/ui && npx jest src/pages/worklogExport
Test Suites: 5 passed, 5 total
Tests:       49 passed, 49 total
```

```
cd static/ui && CI=true npm run build   → Compiled with warnings (기존 source-map 경고만)
main gzip 431,875 B / 950,000 B  (직전 433,567 B)
```

**번들 영향: main 은 오히려 1.7KB 줄었다**(CSV 코드 제거분). `exceljs` 는 별도 청크로 완전히 분리됐다 —
`build/static/js/9223.*.chunk.js` raw 943KB / **gzip 257KB**, 다운로드 버튼을 누른 순간에만 로드된다.
`grep "xl/workbook.xml" build/static/js/main.*.js` → **0건**으로 main 미포함을 확인했다.

#### 설계서에서 벗어난 점

| 항목 | 처리 | 이유 |
|------|------|------|
| `buildWorklogWorkbook(rows, summary, filters, t)` 시그니처 | `buildWorklogWorkbook(rows, { filters, hourRate, now }, t)` 로 구현하고 요약은 내부 `summarizeRows(rows)` 로 **파생** | 요약 수치는 전부 rows 에서 나온다. 별도 `summary` 인자를 받으면 화면(`WorklogExportSummary`)과 파일이 각자 집계한 **두 번째 shape** 이 생겨 서로 다른 숫자를 말할 수 있다. `summarizeRows` 를 export 해 테스트로 못박았다 |
| 설계서 §7(CSV 스펙) 전체 | **폐기** | 사용자 요구가 CSV → xlsx 로 바뀌었다. BOM·RFC 4180 이스케이프·`downloadCsv` 는 모두 무의미해져 삭제했다. Codex 리뷰의 "CSV 수식 인젝션" 지적도 **자연 소멸**한다(xlsx 는 값을 문자열/숫자 타입으로 넣지 수식으로 해석하지 않는다) |
