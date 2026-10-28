# Jira 전체 워크로그 CSV 추출 (worklog-export) 설계서

작성: feature-architect / 2026-08-26
기준 소스: `develop` @ `dbe669f`
입력: `_workspace/worklog-export/00_input/requirement.md`

---

## 0. 이 설계서를 읽는 법 (담당 분리)

| 담당 | 작업 범위 | 관련 섹션 |
|------|----------|----------|
| **backend-engineer** | `src/permission/ResourceCatalog.js` 엔트리 1개 + `src/trigger/onInstall.js` SEED_VERSION + `locales/kr·en/permission.json`·`common.json` 2키 | §3, §7, §9-A |
| **frontend-engineer** | `static/ui/src/pages/worklogExport/` 전체 + `App.jsx` + `Sidebar.jsx` + `utils/jiraApi/requestJira.js` REQUEST_MAP 2키 + `utils/queryKey/jiraKeys.js` + `locales/kr·en/worklogExport.json` | §4~§6, §8, §9-B |

두 파트는 **서로 코드 의존이 없다**(백엔드는 카탈로그 키만 추가, 프론트는 그 키를 `usePermissionStore`에서 읽기만). 병렬 구현 가능하며, 유일한 접점은 문자열 `'WORKLOG_EXPORT'` 하나다.

---

## 1. 개요 / 영향 범위

### 성격
앱(Moves RMS) 명부와 무관한 **Jira 유틸리티**다. 데이터 경계는 Jira 자체 권한(프론트 `requestJira` = asUser)이고, 앱이 정하는 것은 "이 메뉴를 누구에게 보여줄지"뿐이다. RMS 도메인 스코프(`TeamAnalyticsScope`, `ProjectScope`, `project_users` 명부)를 **일절 적용하지 않는다.**

### 축별 영향

| 축 | 신규 | 수정 | 없음 |
|----|------|------|------|
| **백엔드 resolver** | — | — | ✅ **resolver 0개.** Forge 함수 25초 제한을 피하려 수집을 전부 프론트에서 한다 |
| **권한 카탈로그** | `WORKLOG_EXPORT` 1키 | `ResourceCatalog.js`, `onInstall.js`(SEED_VERSION 9→10) | `PermissionMap.js`(resolver 없음 → 등록 불필요), `SeedData.js`(코드 무변경, §3-3 참조) |
| **프론트 페이지** | `pages/worklogExport/` 13파일 | `App.jsx`(lazy 라우트), `layout/Sidebar.jsx`(mainItems 1항목) | — |
| **프론트 공용** | — | `utils/jiraApi/requestJira.js`(REQUEST_MAP 2키), `utils/queryKey/jiraKeys.js`(팩토리 2개) | — |
| **DB** | — | — | ✅ MySQL·KVS 스키마 변경 없음. 저장하는 데이터가 없다 |
| **manifest.yml** | — | — | ✅ 무변경. 필요한 scope(`read:jira-work`, `read:jira-user`)는 **이미 선언돼 있다**(manifest.yml `permissions.scopes` 확인 완료). KVS 엔티티·resolver 추가가 없어 attributes 선언도 불필요 |
| **i18n** | `locales/kr/worklogExport.json`, `locales/en/worklogExport.json` | `locales/kr·en/permission.json`(desc 1키), `locales/kr·en/common.json`(pages 1키) | — |

### 비범위 (요구사항 확정)
- 백엔드 resolver / DB / KVS 저장 없음
- xlsx 출력 없음 (CSV만)
- 스케줄 추출·이메일 발송 없음
- 앱 명부 기반 프로젝트/인력 셀렉터 재사용 **금지** (Jira API 직접 조회만)

---

## 2. 경계면 계약

이 기능의 경계면은 **백엔드 resolver가 아니라 Jira REST**다. 아래 3개 표가 계약 전체다.

### 2-A. Jira REST 계약 (프론트 ↔ Jira) — 이 기능의 핵심 계약

모든 호출은 `static/ui/src/utils/jiraApi/requestJira.js` 의 `executeRequest(key, param, urlParam, queryParam)` 를 통한다.

> 🔴 **`executeRequest` 의 성공/실패 판정 규칙 (실제 코드 확인)**
> - 성공: **Jira 응답 JSON을 그대로 반환한다.** `{success:true}` 래핑이 **없다.**
> - 실패: **throw 하지 않고** `{ success:false, error:{ name:'RequestJiraError', code, message, cause } }` 를 반환한다.
> - `error.code` 에는 **HTTP status 숫자**가 들어간다(`response.status`). → 429/5xx 재시도 판정에 쓴다.
> - ⚠ 응답 헤더는 버려지므로 **`Retry-After` 를 읽을 수 없다** → 고정 백오프만 가능(§6-4).
> - 따라서 모든 호출부는 `res?.success === false` 를 **명시 검사**한다. (`useBulkApply.js` 의 `ensureWorklogResult` 와 동일 원칙)

| # | REQUEST_MAP 키 | HTTP | URL | 파라미터 | 응답 shape (성공) |
|---|---------------|------|-----|---------|------------------|
| 1 | `searchIssueWithJQL` **(기존)** | POST | `/rest/api/3/search/jql` | body: `{ jql, fields:['summary','project'], maxResults:100, nextPageToken }` | `{ issues:[{ id, key, fields:{ summary, project:{ id, key, name } } }], nextPageToken, isLast }` |
| 2 | `getIssueWorklogs` **(기존)** | GET | `/rest/api/3/issue/{issueIdOrKey}/worklog` | query: `{ startAt, maxResults:100 }` · urlParam: `{ issueIdOrKey }` | `{ startAt, maxResults, total, worklogs:[…] }` |
| 3 | `getProjects` **(기존)** | GET | `/rest/api/3/project/search` | query: `{ maxResults:50, query, orderBy:'name' }` | `{ values:[{ id, key, name, avatarUrls }], total, isLast }` |
| 4 | `searchUsers` **🆕 추가** | GET | `/rest/api/3/user/search` | query: `{ query, maxResults:50 }` | `[{ accountId, displayName, emailAddress?, avatarUrls, accountType, active }]` (**배열 최상위**) |
| 5 | `searchApproximateCount` **🆕 추가(선택)** | POST | `/rest/api/3/search/approximate-count` | body: `{ jql }` | `{ count }` — §10-1 참조. **API 문서 실확인 후 채택**, 실패 시 조용히 건너뛴다 |

**#2 워크로그 아이템 shape (CSV·재필터가 의존하는 필드만):**
```js
{
  id: "10101",                                  // 워크로그ID (문자열)
  issueId: "10023",
  author: { accountId: "712020:xxxx", displayName: "홍길동", avatarUrls: {…} },
  updateAuthor: {…},
  comment: <ADF 객체> | undefined,              // v3 API 는 ADF. 없을 수 있다
  created:  "2026-08-20T09:10:00.000+0900",
  updated:  "2026-08-20T09:10:00.000+0900",
  started:  "2026-08-20T09:00:00.000+0900",     // ★ 타임존 오프셋 포함 (§5)
  timeSpent: "2h",
  timeSpentSeconds: 7200
}
```

**#4 `searchUsers` REQUEST_MAP 추가 코드 (그대로 붙여넣기):**
```js
    //reference : https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-search-get
    searchUsers: {
        type: TYPE_MAP.GET,
        url: '/rest/api/3/user/search'
    },
```
> `/user/picker` 대신 `/user/search` 를 쓰는 이유: `/user/picker` 응답은 `html` 하이라이트 마크업이 섞인 `users[]` 이고 `accountId` 외 필드가 빈약하다. `/user/search` 는 `accountId`·`displayName`·`avatarUrls`·`accountType`·`active` 를 평문으로 준다. `ProjectFilter.jsx` 가 `getUsersGroups`(groupuserpicker)를 쓰는 것은 **그룹까지 필요해서**이고, 여기는 사람만 필요하다.
> ⚠ `accountType === 'atlassian'` 이 아닌 계정(app/customer)은 옵션에서 제외한다(`ProjectFilter.jsx:105` 선례).

### 2-B. 앱 내부 계약 (변경되는 부분만)

| resolver 함수 | 변경 | 응답 shape 영향 | 대응 프론트 |
|--------------|------|----------------|------------|
| `userPermissionCheck` (기존, PUBLIC) | **코드 무변경** | `pages[]` 에 `{ pageId:'WORKLOG_EXPORT', value:{read,write} }` 항목이 **자동으로 1개 늘어난다** — `PrincipalResolver` 가 `RESOURCE_KEYS`/`mergeSetPages` 로 카탈로그에서 파생하기 때문 | `usePermissionStore.permissions['WORKLOG_EXPORT'].read` → `Sidebar` 게이팅 |
| `getPermissionCatalog` (기존, PUBLIC) | **코드 무변경** | `sections[0].resources[]` 에 `{ key:'WORKLOG_EXPORT', labelKey:'common.pages.worklogExport', descriptionKey:'permission.desc.WORKLOG_EXPORT' }` **자동 추가** (`getCatalogSections()` 파생) | `hooks/usePermissionCatalog.js` → 백오피스 권한 화면 토글 **자동 노출** |

> ✅ **검증 완료**: `static/ui/src/hooks/usePermissionCatalog.js` 는 서버 `sections` 를 그대로 매핑하고 `HIDDEN_CATALOG_KEYS`(현재 `PROJECT_GANTT` 만) 로만 필터한다. `WORKLOG_EXPORT` 는 필터 대상이 아니므로 **백오피스 권한 화면 코드 수정 없이 read/write 토글이 나타난다.**

### 2-C. 프론트 내부 모듈 계약

수집기(`useWorklogCollector`)가 페이지에 노출하는 상태·핸들 — 컴포넌트들은 이것만 본다.

```js
// useWorklogCollector({ toast }) 반환
{
  // ── 상태 ──
  state: {
    phase: 'idle' | 'searching' | 'fetching' | 'done' | 'cancelled' | 'error',
    issueTotal: 0,        // 검색으로 확정된 이슈 수 (searching 중에는 누적치)
    issueDone: 0,         // 워크로그 페치 완료 이슈 수 (진행률 = issueDone/issueTotal)
    truncated: false,     // MAX_ISSUES(5000) 상한에 걸려 일부만 수집했는가
    failures: [],         // [{ issueKey, code, message }] — 이슈 단위 실패
    errorMessage: null,   // phase==='error' 일 때의 사용자 표시 메시지(번역 완료 문자열)
  },
  rows: [],               // WorklogRow[] — §7-1 shape. 성공 시에만 채워진다
  run: (filters) => Promise<void>,   // filters = §4-3 FilterState
  cancel: () => void,     // 플래그 방식 취소 (§6-3)
  reset: () => void,
}
```

```js
// WorklogRow — 표·CSV·요약이 공유하는 단일 shape (글자 그대로)
{
  worklogId: "10101",
  issueKey: "ABC-123",
  issueSummary: "로그인 화면 개선",
  projectKey: "ABC",
  authorName: "홍길동",
  authorAccountId: "712020:xxxx",
  started: "2026-08-20T09:00:00.000+0900",   // 원본 문자열 그대로 (가공 금지)
  startedDate: "2026-08-20",                 // started.slice(0,10) — 표시·정렬·재필터 공용 (§5)
  startedMs: 1755648000000,                  // Date.parse(started) — 표 정렬용 sortValue
  timeSpentSeconds: 7200,
  timeSpentHours: 2,                         // Math.round(sec/3600*100)/100
  comment: "리뷰 반영"                        // ADF→플레인 텍스트, 없으면 ''
}
```

---

## 3. 백엔드 설계 — 권한 카탈로그만

### 3-1. `src/permission/ResourceCatalog.js` — 엔트리 추가

**위치: `RESOURCE_MANAGEMENT` 바로 다음, WORKFORCE 섹션 마지막.** (파일 주석 "정의 순서 = 프론트 노출 순서")

```js
    { key: 'WORKLOG_EXPORT', section: 'WORKFORCE', labelKey: 'common.pages.worklogExport', descriptionKey: 'permission.desc.WORKLOG_EXPORT',
        covers: ['워크로그 추출(/worklog-export) — Jira 전체 워크로그 CSV 다운로드'], admin: t, member: ff, defaultForNew: ff },
```

**각 값의 근거:**

| 필드 | 값 | 근거 |
|------|-----|------|
| `section` | `'WORKFORCE'` | 백오피스 설정이 아니라 실무 조회 도구. 새 섹션을 만들면 `SECTIONS` + `getCatalogSections()` 의 `order` 배열까지 건드려야 하고, 항목 1개짜리 섹션은 UI 노이즈다 |
| `labelKey` | `'common.pages.worklogExport'` | 기존 카탈로그 전 엔트리가 `common.pages.*` 를 쓴다(예외 없음) |
| `descriptionKey` | `'permission.desc.WORKLOG_EXPORT'` | 기존 전 엔트리가 `permission.desc.{KEY}` 규칙 |
| `admin` | `t` (`{read:true,write:true}`) | 요구사항 확정 |
| `member` | `ff` (`{read:false,write:false}`) | **닫는다.** Jira 권한 안이라 데이터 유출은 아니지만 "대량 반출" 성격의 기능이다. `RESOURCE_MANAGEMENT`·`PROJECT_COST` 와 같은 보수적 기본값 |
| `defaultForNew` | `ff` | 신규 커스텀 세트·마이그레이션 시 기본 닫힘(fail-close) |
| `migrateFrom` | **지정하지 않음** | `TEAM_MANAGEMENT` 선례의 이유 그대로: 기존 어떤 권한 보유자에게도 새 능력이 **자동으로** 생기면 안 된다. 권한 확대는 관리자가 명시적으로 |

> **`write` 의 의미**: 이 기능은 읽기 전용이라 `write` 는 아무것도 게이팅하지 않는다. 그래도 카탈로그 스키마가 `{read,write}` 쌍을 강제하므로 값은 존재해야 하며, `Sidebar` 와 페이지는 **`read` 만** 본다. (`PROJECT_GANTT` 처럼 "저장은 되지만 아무 가드도 안 읽는" 필드가 무해한 것과 같다)

### 3-2. `src/trigger/onInstall.js` — SEED_VERSION 9 → 10

```js
// 10 — 워크로그 추출: 카탈로그에 WORKLOG_EXPORT 추가(시드 Admin/Member 재생성 + 커스텀 세트 키 보충)
export const SEED_VERSION = 10;
```
기존 8·9 주석 아래에 한 줄 추가하고 값만 올린다. 이 파일에서 다른 변경은 없다.

### 3-3. `src/seed/SeedData.js` — **코드 변경 없음** (읽고 확인 완료)

새 키를 넣어도 시드 코드는 손대지 않는다. 이유를 경로별로:

| 대상 | 처리 함수 | 새 키가 받는 값 | 근거 |
|------|----------|----------------|------|
| **Admin** (`permission-Admin`, edit:false) | `addPermissionSeed()` — 매 시드마다 **재생성** | `{read:true, write:true}` | `getSeedPages('admin')` 이 `CATALOG` 에서 파생 |
| **Member** (`permission-Member`, edit:false) | `addPermissionSeed()` — 매 시드마다 **재생성**(projectScope만 보존) | `{read:false, write:false}` | `getSeedPages('member')` = `entry.member` = `ff` |
| **프리셋 4종 — 신규 설치** | `addPresetPermissionSeed()` | PM `{r:t,w:t}` / PMO `{r:t,w:f}` / Team Lead `{r:t,w:f}` / Team Member `{r:t,w:f}` | `grant(entry)` 가 `entry.section==='WORKFORCE'` 만 보므로 **자동 판정**. `WORKLOG_EXPORT` 를 특별 취급하지 않는다 |
| **프리셋 4종 — 기존 설치** | `migratePermissionSets()` | `{read:false, write:false}` | ⚠ **아래 3-4 참조** |
| **커스텀 세트** | `migratePermissionSets()` | `{read:false, write:false}` | `migrateFrom` 없음 → `getDefaultForNew('WORKLOG_EXPORT')` = `ff` |

### 3-4. ⚠ 기존 설치 마이그레이션의 알려진 비대칭 (설계 확정 사항, 코드로 고치지 않는다)

`migratePermissionSets()` 는 `name === 'Admin' || 'Member'` 만 건너뛰고 **나머지 전부**(= 프리셋 PM/PMO/TeamLead/TeamMember 포함)에 `defaultForNew` 를 적용한다. `addPresetPermissionSeed()` 는 원장(`permission_preset_provisioned`)에 기록된 프리셋을 **다시 만들지 않으므로**, 결과는:

- **신규 설치**: PM/PMO/TeamLead/TeamMember 가 `WORKLOG_EXPORT` **read=true** 를 갖는다
- **기존 설치**: 같은 이름의 프리셋이 `WORKLOG_EXPORT` **read=false** 로 남는다

**이것은 버그가 아니라 기존 설계의 의도**다("조직이 조정한 값이 SEED_VERSION bump 때마다 날아가면 안 된다", `SeedData.js` L143~153). 배포 후 기존 사이트에서 **관리자(Admin 세트)만 메뉴를 보게 되며**, PM 등에게 열려면 관리자가 백오피스 권한 화면에서 토글해야 한다. **릴리스 노트에 이 문장을 반드시 적을 것.**

### 3-5. `src/permission/PermissionMap.js` — **등록 불필요**

이 기능은 **resolver 함수를 하나도 추가하지 않는다.** `PERMISSION_MAP` 은 "resolver 함수명 → grants" 맵이므로 등록할 대상이 없다.

계약 테스트 영향도 확인 완료 (`test/permission/permissionMap.contract.test.js`):
- 테스트 (1)(2)는 `CONTROLLER_REGISTRARS` 등록 함수명 ↔ `PERMISSION_MAP` 키를 대조한다 → **무관**
- "PermissionMap 구조 유효성" 테스트는 `catalogKeys.has(g.resource)` 로 **PermissionMap 쪽에서 카탈로그를 참조**할 뿐, 카탈로그 키가 전부 매핑에 쓰였는지는 검사하지 않는다 → `WORKLOG_EXPORT` 가 어떤 grant 에도 안 쓰여도 **통과**

### 3-6. 기존 테스트 영향 (전부 통과 확인 필요, 수정 불필요)

| 테스트 | 영향 | 결과 |
|--------|------|------|
| `src/seed/__test__/PresetPermissionSeed.test.js` "PM = WORKFORCE 전부 rw" | 새 키 포함 | ✅ `grant()` 가 rw 부여 |
| 〃 "PMO = write 하나도 없다 / WORKFORCE read=true" | 〃 | ✅ RO |
| 〃 "Team Lead / Team Member 는 write 가 하나도 없다" | 〃 | ✅ RO |
| 〃 **"Team Lead 와 Team Member 의 차이는 RESOURCE_MANAGEMENT 하나다"** | 🔴 **주의** | ✅ 통과하려면 **두 프리셋에 `WORKLOG_EXPORT` 를 다르게 주면 안 된다.** 위 설계대로 `grant()` 를 특별 취급하지 않으면 둘 다 RO → `diff === ['RESOURCE_MANAGEMENT']` 유지 |
| 〃 "pages 는 카탈로그 전 키를 포함한다" | `RESOURCE_KEYS` 파생 | ✅ |
| `test/permission/userPermissionCheck.test.js:163` `toHaveLength(RESOURCE_KEYS.length)` | 파생 | ✅ |

> 🔴 **backend-engineer 에게**: 프리셋에 `WORKLOG_EXPORT` 를 개별 분기(`if (entry.key === 'WORKLOG_EXPORT') …`)로 넣고 싶어지면 **하지 마라.** 위 테스트가 깨지고, 그 테스트가 지키는 설계 원칙(팀장/팀원 차이는 딱 하나)이 무너진다.

### 3-7. 신규 백엔드 테스트 (선택, 권장)

`src/permission/__test__/` 에 `WorklogExportCatalog.test.js` 1개 — 이 기능의 계약을 못박는 최소 테스트:
```
- CATALOG 에 WORKLOG_EXPORT 가 존재하고 section === 'WORKFORCE'
- getSeedPages('admin') 에 {read:true,write:true}, getSeedPages('member') 에 {read:false,write:false}
- getMigrateSource('WORKLOG_EXPORT') === null   // 자동 권한 확대 금지의 회귀 방지
- getCatalogSections() WORKFORCE resources 에 labelKey/descriptionKey 가 실린다
```

---

## 4. 프론트엔드 설계

### 4-1. 파일 트리 (신규)

```
static/ui/src/pages/worklogExport/
├── WorklogExportPage.jsx              # 라우트 진입점. PageContainer + 필터카드 + 결과카드 + ToastFlags
├── components/
│   ├── WorklogExportFilterCard.jsx    # 프로젝트/작성자/기간/추가JQL + 검색·취소 버튼
│   ├── WorklogExportProgress.jsx      # 진행률 바 + n/N + 취소 버튼 + truncated/failures 경고
│   ├── WorklogExportSummary.jsx       # KpiTile 3장 (이슈 수 / 워크로그 건수 / 총 시간)
│   └── WorklogExportTable.jsx         # CommonTable head/rows 조립 (미리보기 상한 적용)
├── hooks/
│   ├── useWorklogExportFilters.js     # FilterState + 유효성 검사 + 초기값
│   ├── useJiraProjectOptions.js       # useQuery(jiraKeys.projectSearch) + 디바운스
│   ├── useJiraUserOptions.js          # useQuery(jiraKeys.userSearch) + 디바운스
│   └── useWorklogCollector.js         # ★ 수집 오케스트레이터 (§2-C 계약)
└── utils/
    ├── buildWorklogJql.js             # FilterState → JQL 문자열
    ├── searchIssues.js                # search/jql nextPageToken 페이징
    ├── fetchIssueWorklogs.js          # issue worklog startAt 페이징 + 429 재시도
    ├── worklogFilter.js               # 워크로그 단위 재필터 + WorklogRow 매핑
    ├── adfToPlainText.js              # ADF → 플레인 텍스트
    ├── worklogCsv.js                  # WorklogRow[] → CSV 문자열 + Blob 다운로드
    └── __test__/
        ├── buildWorklogJql.test.js
        ├── worklogFilter.test.js
        ├── adfToPlainText.test.js
        └── worklogCsv.test.js
```

### 4-2. `App.jsx` 수정 — lazy 라우트

```js
const WorklogExportPage = React.lazy(() => import('./pages/worklogExport/WorklogExportPage'));
```
lazy 선언부(`StoragePage` 다음 줄)에 추가하고, `<Routes>` 안 `/backoffice/storage` 다음에:
```jsx
<Route path="/worklog-export" element={<WorklogExportPage />} />
```

> ✅ **Suspense 경계 규약 확인 완료**: `App.jsx` 의 `<Routes>` 는 이미 `<ChunkErrorBoundary><Suspense fallback={<PageSkeleton />}>` 안에 있다(L97~99). 최상위 라우트라 **추가 경계가 필요 없다.** (경계가 필요한 것은 탭 내부 lazy — `CommonTab.jsx`/`ProjectWorkPanel.jsx` 케이스)
> ⚠ 루트 `index.js` 가 `ReactDOM.render`(legacy)라 `startTransition` 은 무효다. lazy 의 React #426 방어는 **위 Suspense 경계가 전부**이며, 이미 만족한다.

### 4-3. `layout/Sidebar.jsx` 수정 — mainItems 항목

`/resource` 항목 **다음**(mainItems 마지막)에 추가:
```jsx
        {
            key: '/worklog-export',
            icon: <DownloadIcon label="Worklog Export"/>,
            label: t('worklogExport.nav'),
            permission: 'WORKLOG_EXPORT',
        },
```
아이콘 import (파일 상단 import 블록에 추가):
```js
import DownloadIcon from "@atlaskit/icon/core/download";
```
> 게이팅은 기존 `.filter(item => item.permission === null || isReadable(item.permission))` 가 그대로 처리한다(`Sidebar.jsx:82`). `isReadable` → `permissions[key].read`. 코드 추가 불필요.
> 아이콘 대안: `@atlaskit/icon/core/export` 또는 `.../table`. `download` 가 기능(파일 받기)을 가장 직접적으로 말한다. 사이드바 기존 아이콘과 중복되지 않는지 확인 완료.

### 4-4. FilterState (필터 상태 계약)

```js
// useWorklogExportFilters() 가 소유하는 상태
{
  projectKeys: ['ABC', 'DEF'],   // string[] — Jira 프로젝트 key. 선택 (빈 배열이면 전체 프로젝트)
  accountIds:  ['712020:xxxx'],  // string[] — 선택 (빈 배열이면 전체 작성자)
  startDate:   '2026-08-01',     // 'YYYY-MM-DD' — 필수
  endDate:     '2026-08-31',     // 'YYYY-MM-DD' — 필수, startDate 이상
  extraJql:    '',               // 원문 JQL 조각. 선택
}
```

**유효성 규칙 (검색 버튼 disabled 조건):**
| 조건 | 처리 |
|------|------|
| `startDate`/`endDate` 미입력 | 버튼 disabled + `worklogExport.filter.period.required` 헬프텍스트 |
| `endDate < startDate` | 버튼 disabled + `worklogExport.filter.period.invalid` |
| 기간 > 366일 | 버튼은 활성, `worklogExport.warn.longPeriod` 경고 SectionMessage (막지는 않는다) |
| 프로젝트·작성자 모두 미선택 | 허용. Jira 전체가 대상이므로 이것이 정상 유스케이스 |

> **기간은 필수**(요구사항 확정). 이유: 무제한 조회는 이슈 수가 발산해 브라우저를 죽인다.

### 4-5. Zustand 스토어 / 권한 체크

- **새 스토어 없음.** 수집 상태는 페이지 로컬(`useWorklogCollector` 내부 `useState`)이다 — 페이지를 벗어나면 버려도 되는 일회성 결과다.
- `usePermissionStore` 는 **읽기만** 한다. 페이지 진입 시 방어:
```js
const canRead = usePermissionStore(s => s.canRead);
if (!canRead('WORKLOG_EXPORT')) return <NonPermissionPage />;  // pages/nonPermission/ 재사용
```
  사이드바가 이미 숨기지만, `/worklog-export` 직접 진입(MemoryRouter 특성상 드물지만)과 권한 변경 직후를 위한 이중 방어. 백엔드 가드가 없는 기능이므로 **프론트 게이트가 유일한 앱 레벨 게이트**다 — 단, 실제 데이터 경계는 Jira 자체 권한이 지키므로 이 게이트가 뚫려도 볼 수 없는 데이터가 새지 않는다(설계상 안전).

### 4-6. 쿼리키 — `utils/queryKey/jiraKeys.js` 추가

**기존 파일 형식**(plain object of arrow functions)을 그대로 따라 2개 추가:
```js
    // 워크로그 추출 필터 — Jira 프로젝트 검색(/rest/api/3/project/search). query='' 는 기본 목록.
    projectSearch: (query) => ['jiraProjectSearch', query],
    // 워크로그 추출 필터 — Jira 사용자 검색(/rest/api/3/user/search)
    userSearch: (query) => ['jiraUserSearch', query],
```

**수집 결과는 쿼리키를 만들지 않는다.** 근거:
1. **선례가 있다.** `pages/projectDetail/issue/useBulkApply.js` 의 파일 주석 — *"mutation 이 아니라 **명령형 실행기**다(조회 없음 → 신규 쿼리키 없음)"*. 동일 성격(버튼 클릭 → 다건 Jira 왕복 → 진행률 → 로컬 결과)이므로 같은 패턴을 따른다.
2. `useQuery` 부적합: 결과가 캐시·재검증 대상이 아니고(사용자가 명시적으로 다시 누르길 원한다), 진행률 n/N 을 노출해야 하며, 중간 취소가 필요하다 — `useQuery` 는 셋 다 표현하지 못한다.
3. `useMutation` 부적합: mutation 은 서버 상태를 **바꾸는** 호출이고 성공 시 invalidate 가 뒤따르는 모델이다. 여기는 순수 읽기이고 무효화할 캐시가 없다. `onProgress` 같은 중간 상태 채널도 없다.
4. **결론: `useWorklogCollector` 내부 `useState` + `useRef`.** `queryKeyContract.test.js` 는 인라인 배열 리터럴만 금지하므로(쿼리키를 아예 안 만드는 것은 무관) 계약 위반이 아니다.

---

## 5. 워크로그 단위 재필터 규칙 (⚠ 이 기능에서 가장 틀리기 쉬운 부분)

JQL 은 **이슈**를 거른다. `worklogDate >= X AND worklogDate <= Y` 를 만족하는 이슈에는 **범위 밖 워크로그도 섞여 있다.** `worklogAuthor` 도 마찬가지다. 그래서 이슈별 워크로그를 받은 뒤 **워크로그 단위로 다시 거른다.**

### 5-1. 기간 비교 — **로컬 날짜 문자열 비교로 확정**

```js
// utils/worklogFilter.js
export const startedLocalDate = (started) => String(started).slice(0, 10);   // 'YYYY-MM-DD'

export const isInPeriod = (worklog, startDate, endDate) => {
    const d = startedLocalDate(worklog.started);
    return d >= startDate && d <= endDate;   // 'YYYY-MM-DD' 문자열 사전순 = 날짜순
};
```

**왜 UTC 가 아니라 로컬(문자열 슬라이스)인가 — 반드시 이대로 구현할 것:**
- Jira 가 돌려주는 `started` 는 `"2026-08-20T09:00:00.000+0900"` 처럼 **호출 사용자의 타임존 오프셋으로 렌더된 문자열**이다. 앞 10글자는 그 사용자가 화면에서 보는 **벽시계 날짜** 그대로다.
- JQL 의 `worklogDate` 도 **사용자 타임존 기준**으로 판정한다. 즉 문자열 슬라이스가 JQL 과 **같은 기준**이라, 1차 필터(JQL)와 2차 필터(로컬)가 어긋나지 않는다.
- 🔴 **금지: `new Date(started).toISOString().slice(0,10)`.** 이건 UTC 로 옮긴 날짜다. KST 기준 08-20 09:00 은 UTC 08-20 00:00 이라 우연히 맞지만, **08-20 08:00(KST) 은 UTC 08-19** 가 되어 월초/월말 경계의 워크로그가 조용히 사라진다. `dayjs.utc()` 도 같은 이유로 금지.
- 🔴 **금지: `dayjs.tz(started, 'Asia/Seoul')` 같은 하드코딩 타임존.** 사용자 타임존을 앱이 정하면 안 된다 — 이미 응답 문자열이 정답을 들고 있다.
- 참고 선례: `project_fullcalendar_exclusive_end` 사건(연차 -6MD)이 같은 계열의 날짜 경계 실수였다.

### 5-2. 작성자 비교

```js
export const isSelectedAuthor = (worklog, accountIds) =>
    accountIds.length === 0 || accountIds.includes(worklog.author?.accountId);
```
- 비교 대상은 **`author.accountId`** 다. `updateAuthor` 가 아니다(수정자는 작성자가 아니다).
- `accountIds` 가 빈 배열이면 전원 통과(필터 미적용).
- `displayName` 으로 비교하지 않는다 — 동명이인·표시명 변경에 깨진다.

### 5-3. 재필터 → 행 매핑 (단일 함수)

```js
// utils/worklogFilter.js
export const toWorklogRows = (issue, worklogs, filters) => worklogs
    .filter(w => isInPeriod(w, filters.startDate, filters.endDate)
              && isSelectedAuthor(w, filters.accountIds))
    .map(w => ({
        worklogId: String(w.id),
        issueKey: issue.key,
        issueSummary: issue.fields?.summary ?? '',
        projectKey: issue.fields?.project?.key ?? '',
        authorName: w.author?.displayName ?? '',
        authorAccountId: w.author?.accountId ?? '',
        started: w.started ?? '',
        startedDate: startedLocalDate(w.started ?? ''),
        startedMs: Date.parse(w.started ?? '') || 0,
        timeSpentSeconds: w.timeSpentSeconds ?? 0,
        timeSpentHours: Math.round(((w.timeSpentSeconds ?? 0) / 3600) * 100) / 100,
        comment: adfToPlainText(w.comment),
    }));
```

### 5-4. JQL 조립 — `utils/buildWorklogJql.js`

```js
const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const quoted = (list) => list.map(v => `"${esc(v)}"`).join(', ');

export const buildWorklogJql = ({ projectKeys, accountIds, startDate, endDate, extraJql }) => {
    const parts = [];
    if (projectKeys?.length) parts.push(`project in (${quoted(projectKeys)})`);
    if (accountIds?.length)  parts.push(`worklogAuthor in (${quoted(accountIds)})`);
    parts.push(`worklogDate >= "${esc(startDate)}"`);
    parts.push(`worklogDate <= "${esc(endDate)}"`);
    const base = parts.join(' AND ');
    const extra = extraJql?.trim();
    return extra ? `${base} AND (${extra})` : base;
};
```

**규칙:**
| 항목 | 규칙 | 근거 |
|------|------|------|
| 값 이스케이프 | `\` → `\\`, 그 다음 `"` → `\"` (**순서 중요**) | JQL 문자열 리터럴 규격. `getJqlIssue.js:47` 이 `"` 만 이스케이프하는데, 그건 검색어 한정이라 통과했을 뿐이다 |
| 프로젝트 | `project in ("ABC", "DEF")` — **key** 사용, 항상 따옴표 | 따옴표 없는 key 는 `AND`·`OR` 같은 예약어와 충돌한다 |
| 작성자 | `worklogAuthor in ("accountId", …)` | accountId 는 `712020:uuid` 형태라 콜론 때문에 반드시 인용 |
| 기간 | `worklogDate >= "YYYY-MM-DD" AND worklogDate <= "YYYY-MM-DD"` (양끝 **포함**) | Jira `worklogDate` 는 날짜 단위 inclusive |
| 추가 JQL | **이스케이프하지 않는다.** `AND (원문)` 으로 괄호에 싸서 결합 | 사용자가 넣는 것은 값이 아니라 **JQL 표현식**이다. 괄호가 `OR` 연산자 우선순위 사고를 막는다 |
| 추가 JQL 오류 | Jira 가 400 을 반환 → `error.code === 400` → `worklogExport.error.jqlInvalid` + Jira 원문 메시지 함께 표시 | 사용자가 자기 오타를 고칠 수 있어야 한다 |
| `ORDER BY` | **붙이지 않는다** | 정렬은 표에서 `sortValue` 로, CSV 는 수집 순서대로. 서버 정렬은 페이징 비용만 늘린다 |

---

## 6. 수집 파이프라인 — 동시성 · 진행률 · 취소 · 재시도

### 6-1. 전체 흐름 (`useWorklogCollector.run`)

```
[idle]
  ↓ run(filters)
[searching]  buildWorklogJql → searchIssues() : nextPageToken 페이징
             · maxResults 100, fields ['summary','project']
             · 누적 issues[] , issueTotal 갱신(실시간 표시)
             · issues.length >= MAX_ISSUES(5000) → 페이징 중단, truncated=true
  ↓
[fetching]   mapWithConcurrency(issues, 4, async issue => {
                 if (cancelRef.current) return [];
                 const worklogs = await fetchIssueWorklogs(issue.key);   // startAt 페이징 + 재시도
                 setState(s => ({...s, issueDone: s.issueDone + 1}));    // 진행률
                 return toWorklogRows(issue, worklogs, filters);         // 즉시 재필터 (메모리 절약)
             }).flat()
  ↓
[done]  rows 확정 → 요약 계산 → 표 렌더 → CSV 버튼 활성
```

`cancel()` 호출 시 → `[cancelled]` (지금까지 수집한 rows 는 **버리지 않고 유지**한다 — 5분 기다린 결과를 취소 한 번으로 날리면 안 된다. 다만 `truncated`-유사 경고를 띄운다).

### 6-2. 동시성 — **`p-limit` 을 쓰지 않는다** (🔴 중요)

```js
import { mapWithConcurrency } from '../../../utils/useJiraUserInfos';
export const WORKLOG_FETCH_CONCURRENCY = 4;
```

- 프론트 `package.json` 에 `p-limit ^7.3.0` 이 있지만 **프론트에서 쓸 수 없다.** `utils/useJiraUserInfos.js:14-15` 주석 그대로: *"백엔드는 `p-limit` 을 쓰지만 프론트는 그 패키지가 ESM-only 라 jest 변환 대상 밖이다 — 쓰는 기능이 '동시 N개'뿐이라 아래 `mapWithConcurrency` 로 대신한다."*
- 이미 두 곳이 이 유틸을 공유한다(`fetchBulkUsers`, `useBulkApply`). **세 번째 사용자로 합류하고, 새 동시성 유틸을 만들지 않는다.**
- 상한 `4`: 기존 읽기 상한 3(`BULK_CONCURRENCY`)·쓰기 상한 3(`BULK_APPLY_CONCURRENCY`)과 같은 계열. 읽기 전용이라 4로 약간 올리되 429 를 부르지 않는 선. **8 이상으로 올리지 말 것.**
- ⚠ `mapWithConcurrency` 는 worker 가 throw 하면 `Promise.all` 이 전체를 거부한다 → **worker 안에서 try/catch 하고 실패를 `failures[]` 에 적립**한 뒤 빈 배열을 반환한다. 한 이슈 실패로 전체 수집이 날아가면 안 된다.

### 6-3. 취소 — **`AbortController` 가 아니라 플래그** (🔴 결정 근거 명시)

```js
const cancelRef = useRef(false);
const cancel = () => { cancelRef.current = true; setState(s => ({...s, phase:'cancelled'})); };
```
- **`AbortController` 를 쓸 수 없다.** `executeRequest` 는 `requestOption()` 이 `{method, headers, body}` 만 만들어 `requestJira()` 에 넘긴다(`requestJira.js:124-134`) — `signal` 을 통과시킬 경로가 없다. 공용 유틸을 이 기능 때문에 고치는 것은 회귀 위험이 크다(다른 화면 전부가 이 함수를 쓴다).
- 저장소 전역 검색 결과 **`AbortController` 선례가 0건**임을 확인했다 → 새 패턴을 발명하지 않는다.
- 플래그는 **왕복 사이**에서 검사한다: ① search 페이징 루프 각 회차 시작, ② `mapWithConcurrency` worker 진입, ③ 워크로그 startAt 페이징 각 회차. 진행 중인 단일 왕복은 끝까지 간다(최대 1~2초) — 허용 가능한 지연이다.
- `run()` 시작 시 `cancelRef.current = false` 로 리셋.

### 6-4. 429 / 5xx 재시도 — `utils/fetchIssueWorklogs.js`

```js
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1000, 2000, 4000];   // 최대 3회 재시도

const withRetry = async (fn) => {
    for (let attempt = 0; ; attempt++) {
        const res = await fn();
        if (res?.success !== false) return res;
        const code = Number(res.error?.code);
        if (!RETRY_STATUS.has(code) || attempt >= BACKOFF_MS.length) return res;
        await new Promise(r => setTimeout(r, BACKOFF_MS[attempt] + Math.random() * 300));
    }
};
```
- **`Retry-After` 를 읽을 수 없다**(§2-A 참조) → 고정 백오프 + jitter.
- 재시도 소진 후에도 실패면 그 이슈를 `failures[]` 에 적립하고 계속 진행한다(부분 성공 허용).
- search 페이징에도 같은 `withRetry` 를 적용한다. 단 search 실패는 **치명적**이라(이슈 목록 자체를 못 얻음) 재시도 소진 시 `phase:'error'` 로 중단한다.

### 6-5. 워크로그 페이징 — `fetchIssueWorklogs(issueKey)`

```js
// GET /rest/api/3/issue/{key}/worklog?startAt=N&maxResults=100
// 응답: { startAt, maxResults, total, worklogs:[…] }
// 반복 조건: startAt + worklogs.length < total  (안전 상한 WORKLOG_PAGE_MAX = 50회)
```
- `maxResults` 는 **100 을 명시**한다. 이 엔드포인트의 기본값은 비정상적으로 크므로(1048576) 명시하지 않으면 이슈 하나가 수만 건을 한 번에 끌어올 수 있다.
- **선택 최적화**: query 에 `startedAfter`/`startedBefore`(epoch **밀리초**)를 함께 보내면 서버가 미리 걸러 전송량이 준다. 단 이 값은 **UTC 인스턴트**라 로컬 날짜 경계와 정확히 일치하지 않으므로, **경계를 하루씩 넉넉히 잡고**(`startDate 00:00 - 1일`, `endDate 23:59 + 1일`) §5-1 의 로컬 재필터를 **그대로 유지**해야 한다. 재필터를 이걸로 대체하면 안 된다. (구현 난도 대비 이득이 크지 않으면 1차에서는 생략해도 좋다)

### 6-6. 진행률 상태 모델

| phase | 화면 | 취소 버튼 |
|-------|------|----------|
| `idle` | 필터만. 결과 카드는 `worklogExport.empty.initial` | — |
| `searching` | `worklogExport.progress.searching` + 누적 이슈 수 | ✅ |
| `fetching` | 진행률 바 + `progress.fetching`(`{done}/{total}`) | ✅ |
| `done` | 요약 + 표 + CSV 버튼. `failures.length>0` 이면 경고 배너 | — |
| `cancelled` | 지금까지의 결과 유지 + `progress.cancelled` 경고 배너 + CSV 버튼(활성) | — |
| `error` | `errorMessage` SectionMessage(appearance="error"). 결과 없음 | — |

진행률 갱신은 **이슈 1건 완료마다** `setState` 한다. 5,000건이면 5,000회 렌더가 되므로, 표는 `phase==='done'` 일 때만 렌더하고 진행 중에는 `WorklogExportProgress` 만 그린다(§7-3).

---

## 7. CSV 스펙 — `utils/worklogCsv.js`

### 7-1. 컬럼 순서·헤더

| # | 필드(WorklogRow) | 헤더 i18n 키 | 예시 |
|---|-----------------|-------------|------|
| 1 | `issueKey` | `worklogExport.column.issueKey` | `ABC-123` |
| 2 | `issueSummary` | `worklogExport.column.issueSummary` | `로그인 화면 개선` |
| 3 | `projectKey` | `worklogExport.column.projectKey` | `ABC` |
| 4 | `authorName` | `worklogExport.column.authorName` | `홍길동` |
| 5 | `authorAccountId` | `worklogExport.column.authorAccountId` | `712020:xxxx` |
| 6 | `started` | `worklogExport.column.started` | `2026-08-20T09:00:00.000+0900` |
| 7 | `startedDate` | `worklogExport.column.startedDate` | `2026-08-20` |
| 8 | `timeSpentSeconds` | `worklogExport.column.timeSpentSeconds` | `7200` |
| 9 | `timeSpentHours` | `worklogExport.column.timeSpentHours` | `2` |
| 10 | `comment` | `worklogExport.column.comment` | `리뷰 반영` |
| 11 | `worklogId` | `worklogExport.column.worklogId` | `10101` |

> 요구사항의 컬럼 목록에 `startedDate`(7)를 하나 더했다. `started` 원문은 기계 판독용, `startedDate` 는 엑셀 피벗용이다 — 사용자가 엑셀에서 오프셋 포함 ISO 를 날짜로 다루려면 반드시 잘라야 하는데, 그 작업을 우리가 대신 한다.
> **표와 CSV 의 컬럼 정의는 같은 배열에서 파생시킨다**(`COLUMNS` 상수 1개) — 표엔 있는데 CSV엔 없는 컬럼이 생기지 않게.

### 7-2. 인코딩·이스케이프 규칙

```js
const BOM = '﻿';
const escapeCell = (v) => {
    const s = v == null ? '' : String(v);
    // 셀 안의 개행은 공백으로 정규화한다 — 따옴표로 감싸도 다수 도구가 행을 쪼갠다
    const flat = s.replace(/\r\n|\r|\n/g, ' ');
    return `"${flat.replace(/"/g, '""')}"`;   // 항상 인용 + " 는 "" 로
};
const toCsv = (headers, rows) => BOM +
    [headers, ...rows].map(cells => cells.map(escapeCell).join(',')).join('\r\n');
```

| 항목 | 결정 | 근거 |
|------|------|------|
| BOM | `﻿` **필수** | 한글 헤더가 Excel 에서 깨지지 않게 |
| 구분자 | `,` | 요구사항 |
| 줄바꿈 | `\r\n` | RFC 4180 / Excel 호환 |
| 인용 | **모든 셀을 항상 인용** | 조건부 인용은 판정 실수가 잦다. 용량 증가는 무시 가능 |
| `"` 이스케이프 | `""` | RFC 4180 |
| 셀 내 개행 | **공백으로 치환** | 워크로그 코멘트에 개행이 흔하다 |
| 수식 인젝션 | `=`, `+`, `-`, `@` 로 시작하는 셀 앞에 `'` 를 붙이지 **않는다** | 데이터 원형 보존 우선. 사내 도구이고 요구사항에 없다. (보수적으로 가고 싶으면 `issueSummary`/`comment` 두 컬럼만 적용 — 판단은 구현자에게 위임하되 **적용 여부를 코드 주석에 남길 것**) |

### 7-3. 파일명

```js
// worklog_export_{startDate}_{endDate}_{YYYYMMDDHHmm}.csv
// 예: worklog_export_2026-08-01_2026-08-31_202608261530.csv
```
`worklogExport.csv.fileNamePrefix` 는 번역하지 않는다 — 파일명은 ASCII 로 고정한다(브라우저·OS 간 한글 파일명 인코딩 사고 방지).

### 7-4. 다운로드

```js
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = filename; a.click();
URL.revokeObjectURL(url);
```
- `utils/downloadExcelUtil.js` 는 **base64 → xlsx 전용**이라 재사용 불가(읽고 확인). 위 로직만 담은 `downloadCsv(csv, filename)` 를 `worklogCsv.js` 안에 둔다. 공용 유틸로 승격하지 않는다 — 지금 사용처가 하나뿐이다.
- ⚠ Forge Custom UI 는 iframe 안이다. `<a download>` 는 동작하는 것이 확인된 패턴이지만(`downloadExcelUtil` 이 이미 프로덕션에서 쓰인다), **E2E 검증 항목에 포함**할 것.

### 7-5. ADF → 플레인 텍스트 — `utils/adfToPlainText.js`

```js
/**
 * ADF 노드 트리에서 text 만 걷어 온다. 블록 경계는 공백 하나로.
 * @param {object|string|undefined} adf
 * @returns {string}
 */
export const adfToPlainText = (adf) => {
    if (!adf) return '';
    if (typeof adf === 'string') return adf;        // v2 API 잔재 / 이미 평문인 경우
    const out = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
        if (node.type === 'mention') out.push(node.attrs?.text ?? '');
        if (node.type === 'hardBreak') out.push(' ');
        (node.content ?? []).forEach(walk);
        if (node.type === 'paragraph') out.push(' ');
    };
    walk(adf);
    return out.join('').replace(/\s+/g, ' ').trim();
};
```

**`adf-to-md` 를 쓰지 않는 이유** (기존 사용처 실확인 후 결정):
- 저장소 내 유일한 ADF 변환 경로는 `pages/myWork/modal/WorklogModal.jsx` 의 `import('adf-to-md')` **동적 import** 이고, 목적은 **MDXEditor 에 넣을 마크다운**이다(`commentLoadState.js` 참조).
- CSV 에 마크다운을 넣으면 `**굵게**`, `[링크](url)`, `- ` 같은 문법 기호가 셀에 그대로 들어가 오히려 읽기 나빠진다.
- 20줄짜리 로컬 워커는 번들 비용 0이고 동적 import 실패 경로(`FAILED` 상태 관리)도 없앤다.
- 단 `adf-to-md` 는 **이미 의존성에 있으므로**, 마크다운 충실도가 필요해지면 언제든 전환 가능하다는 점을 주석에 남긴다.

---

## 8. UI 설계

### 8-1. 페이지 골격 — `WorklogExportPage.jsx`

```jsx
<PageContainer
    title={t('worklogExport.title')}
    description={t('worklogExport.description')}
>
    {toast.FlagUI}
    <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
        <Card title={t('worklogExport.filter.title')}>
            <WorklogExportFilterCard … />
        </Card>

        {phase !== 'idle' && <WorklogExportProgress state={state} onCancel={cancel} />}

        <Card
            title={t('worklogExport.result.title')}
            headerRight={<Button appearance="primary" iconBefore={DownloadIcon}
                                 isDisabled={rows.length === 0} onClick={handleDownload}>
                             {t('worklogExport.action.download')}
                         </Button>}
            isLoading={phase === 'fetching'} skeleton="table"
        >
            <WorklogExportSummary rows={rows} issueTotal={state.issueTotal} />
            <WorklogExportTable rows={rows} isLoading={phase === 'fetching'} />
        </Card>
    </div>
</PageContainer>
```

- `PageContainer`/`PageHeader`: `components/layout/` 재사용(읽고 확인 — `title/description/actions/header` props).
- `Card`: `components/card/Card.jsx` — `{title, description, children, headerRight, isLoading, skeleton}` 사용. `cardId` 는 주지 않는다(접기 불필요).
- `ToastFlags`: 페이지가 직접 `const toast = ToastFlags();` 하고 `{toast.FlagUI}` 를 렌더한다 — `MyPage.jsx:60,134` 선례. (App 의 toast 는 props 로 내려오지 않는다)
- **스피너 금지**(RFC-178). 로딩은 `Card isLoading` + `skeleton="table"` → `CardBodySkeleton` → `SkeletonTable`.
- `BentoGrid` 는 쓰지 않는다 — 카드 2장 세로 배치라 그리드가 과하다.

### 8-2. 필터 카드 — `WorklogExportFilterCard.jsx`

| 필드 | 컴포넌트 | 상세 |
|------|---------|------|
| 프로젝트 | `@atlaskit/select` `Select` (`isMulti`, `isClearable`) | 옵션 = `useJiraProjectOptions(query)`. `onInputChange` → 250ms 디바운스 → `setQuery` → `useQuery(jiraKeys.projectSearch(query))`. `filterOption={null}`(서버가 이미 필터) + `isLoading` |
| 작성자 | `Select` (`isMulti`, `isClearable`) | `useJiraUserOptions(query)` 동일 패턴. 옵션 label 에 아바타 + displayName (`ProjectFilter.jsx:105` 스타일 참고), `value` = accountId |
| 기간 시작 | `@atlaskit/datetime-picker` `DatePicker` | `dateFormat="YYYY-MM-DD"`, `value=startDate`. 선례: `MyPageHeader.jsx`, `PublicHolidayEditModal.jsx` |
| 기간 종료 | `DatePicker` | `minDate={startDate}` 로 역전 입력 자체를 막는다 |
| 추가 JQL | `@atlaskit/textfield` `Textfield` | placeholder `worklogExport.filter.extraJql.placeholder` (예: `issuetype = Bug`), 아래 헬프텍스트로 "AND 로 결합됩니다" 안내 |
| 실행 | `@atlaskit/button` `Button appearance="primary"` | `isDisabled={!isValid || isRunning}`, `isLoading={isRunning}` |
| 취소 | `Button appearance="subtle"` | `isRunning` 일 때만 노출 |

레이아웃: `display:grid; gridTemplateColumns: repeat(auto-fit, minmax(220px,1fr)); gap:12px` — 좁은 화면에서 자동 줄바꿈.

> ⚠ **앱 명부 셀렉터 재사용 금지 확인**: `components/project/ProjectFilter.jsx` 는 Jira API 직접 호출이라 성격은 맞지만, 트리거 UI·상태 계약이 작업관리 화면 전용(`addJqlMap`, `subscribedSpaces`)이라 그대로는 못 쓴다. **패턴만 참고**하고 새로 만든다. `pages/project/**` 나 `resourceKeys` 기반 셀렉터는 절대 쓰지 않는다.

### 8-3. 결과 표 — `WorklogExportTable.jsx`

`components/table/CommonTable` 사용. **모든 셀에 `sortValue` 를 준다**(RFC-184 계약 — 안 주면 화살표가 죽는다).

```js
head = { cells: [
  { key:'issueKey',        content:t('worklogExport.column.issueKey'),         isSortable:true,  width:10 },
  { key:'issueSummary',    content:t('worklogExport.column.issueSummary'),     isSortable:true,  width:26 },
  { key:'projectKey',      content:t('worklogExport.column.projectKey'),       isSortable:true,  width:8  },
  { key:'authorName',      content:t('worklogExport.column.authorName'),       isSortable:true,  width:12 },
  { key:'startedDate',     content:t('worklogExport.column.startedDate'),      isSortable:true,  width:12 },
  { key:'timeSpentHours',  content:t('worklogExport.column.timeSpentHours'),   isSortable:true,  width:10 },
  { key:'comment',         content:t('worklogExport.column.comment'),          isSortable:false, width:22 },
]};

rows = preview.map(r => ({ key: r.worklogId, cells: [
  { key:'issueKey',       content:r.issueKey,                       sortValue:r.issueKey },
  { key:'issueSummary',   content:r.issueSummary,                   sortValue:r.issueSummary },
  { key:'projectKey',     content:r.projectKey,                     sortValue:r.projectKey },
  { key:'authorName',     content:r.authorName,                     sortValue:r.authorName },
  { key:'startedDate',    content:r.startedDate,                    sortValue:r.startedMs },      // ★ 숫자 정렬
  { key:'timeSpentHours', content:formatHours(r.timeSpentHours),    sortValue:r.timeSpentSeconds },// ★ 초 단위 정렬
  { key:'comment',        content:<Ellipsis text={r.comment}/>,     sortValue:r.comment },
]}));
```

- **표는 미리보기다.** `PREVIEW_LIMIT = 500`. `rows.length > 500` 이면 상위 500건만 렌더하고 표 위에 `worklogExport.preview.truncated`(`{shown}/{total}`) 안내. 근거: 10,000건 행 객체 + JSX 는 렌더가 수 초 걸린다. **CSV 는 항상 전량**이다.
- `rowsPerPage = 20`, `maxHeight = 520`.
- `accountId`·`started` 원문·`worklogId` 는 **표에 넣지 않는다**(CSV 에만). 화면 가독성 우선.
- 빈 상태: `emptyMessage = t('worklogExport.empty.noResult')` (phase==='done' 이고 rows 0). `idle` 이면 `worklogExport.empty.initial`.

### 8-4. 요약 — `WorklogExportSummary.jsx`

`components/card/Summary.jsx` 의 `KpiTile({icon,label,value,valueColor})` 3장을 `display:flex; gap:12px` 로:

| 타일 | 값 |
|------|-----|
| 이슈 수 | `new Set(rows.map(r=>r.issueKey)).size` |
| 워크로그 건수 | `rows.length` |
| 총 시간 | `(sum(timeSpentSeconds)/3600).toFixed(1)` + `h` |

### 8-5. 에러·경고 표시

| 상황 | 표현 |
|------|------|
| 검색 실패 / JQL 오류 | `@atlaskit/section-message` `SectionMessage appearance="error"` — 결과 카드 안. Jira 원문 메시지 함께 |
| 이슈 단위 부분 실패 | `SectionMessage appearance="warning"` — `worklogExport.warn.partialFailure`(`{count}`) + 실패 이슈키 상위 5개 |
| 상한 절단(5,000) | `SectionMessage appearance="warning"` — `worklogExport.warn.truncated`(`{limit}`) |
| 취소됨 | `SectionMessage appearance="information"` — `worklogExport.progress.cancelled` |
| CSV 다운로드 완료 | `toast.showSuccess(t('worklogExport.toast.downloaded'))` |
| 수집 완료 | `toast.showSuccess(tFormat(t,'worklogExport.toast.collected',{count:rows.length}))` |

> 치명적 실패는 **토스트가 아니라 SectionMessage** 로 낸다 — 토스트는 2.5초 뒤 사라지는데(`ToastFlags.js:AUTO_DISMISS_MS`), 사용자가 JQL 오타를 고치려면 메시지가 화면에 남아 있어야 한다.

---

## 9. i18n 키 목록

### 9-A. 권한 카탈로그용 — 기존 파일 2개 수정 (**backend-engineer 담당**)

> 파일 = 네임스페이스다(`locales/script/merge.js` 확인: `namespace = file.replace('.json','')`). 즉 `common.pages.worklogExport` 는 `locales/kr/common.json` 안의 `pages.worklogExport` 다.

**`locales/kr/common.json` → `pages` 객체에 추가**
```json
"worklogExport": "워크로그 추출"
```
**`locales/en/common.json` → `pages` 객체에 추가**
```json
"worklogExport": "Worklog Export"
```

**`locales/kr/permission.json` → `desc` 객체에 추가**
```json
"WORKLOG_EXPORT": "워크로그 추출(Jira 전체). 기간·프로젝트·작성자로 워크로그를 검색해 CSV로 내려받습니다. 조회 범위는 Jira 자체 권한을 따릅니다."
```
**`locales/en/permission.json` → `desc` 객체에 추가**
```json
"WORKLOG_EXPORT": "Worklog export (all of Jira). Search worklogs by period, project, and author and download them as CSV. Visible data follows the user's own Jira permissions."
```

### 9-B. 페이지용 — 신규 파일 2개 (**frontend-engineer 담당**)

**`locales/kr/worklogExport.json`**
```json
{
  "nav": "워크로그 추출",
  "title": "워크로그 추출",
  "description": "Jira 전체에서 조건에 맞는 워크로그를 검색해 CSV로 내려받습니다. 조회 범위는 본인의 Jira 권한을 따릅니다.",

  "filter": {
    "title": "검색 조건",
    "project": { "label": "프로젝트", "placeholder": "전체 프로젝트", "help": "선택하지 않으면 접근 가능한 모든 프로젝트가 대상입니다." },
    "author": { "label": "작성자", "placeholder": "전체 작성자", "help": "선택하지 않으면 모든 작성자가 대상입니다." },
    "period": { "label": "기간", "start": "시작일", "end": "종료일", "required": "기간은 필수입니다.", "invalid": "종료일은 시작일 이후여야 합니다." },
    "extraJql": { "label": "추가 JQL", "placeholder": "예: issuetype = Bug", "help": "위 조건과 AND로 결합됩니다." }
  },

  "action": { "search": "검색", "cancel": "취소", "download": "CSV 다운로드", "reset": "조건 초기화" },

  "progress": {
    "searching": "이슈를 검색하는 중… ({count}건 확인)",
    "fetching": "워크로그를 가져오는 중… ({done}/{total})",
    "cancelled": "사용자가 취소했습니다. 지금까지 수집한 결과만 표시합니다."
  },

  "result": { "title": "검색 결과" },
  "summary": { "issueCount": "이슈 수", "worklogCount": "워크로그 건수", "totalHours": "총 시간" },

  "column": {
    "issueKey": "이슈키", "issueSummary": "요약", "projectKey": "프로젝트키",
    "authorName": "작성자", "authorAccountId": "작성자 accountId",
    "started": "시작일시", "startedDate": "시작일",
    "timeSpentSeconds": "소요시간(초)", "timeSpentHours": "소요시간(시간)",
    "comment": "코멘트", "worklogId": "워크로그ID"
  },

  "preview": { "truncated": "미리보기는 상위 {shown}건만 표시합니다. CSV에는 전체 {total}건이 포함됩니다." },

  "empty": { "initial": "조건을 선택하고 검색을 눌러 주세요.", "noResult": "조건에 맞는 워크로그가 없습니다." },

  "warn": {
    "truncated": "결과가 상한({limit}건)에 도달해 일부 이슈만 수집했습니다. 기간이나 프로젝트를 좁혀 주세요.",
    "partialFailure": "{count}개 이슈의 워크로그를 가져오지 못했습니다. 나머지 결과만 표시합니다.",
    "longPeriod": "기간이 1년을 넘습니다. 결과가 많으면 시간이 오래 걸릴 수 있습니다."
  },

  "error": {
    "searchFailed": "이슈 검색에 실패했습니다.",
    "jqlInvalid": "JQL이 올바르지 않습니다.",
    "rateLimited": "Jira 요청 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.",
    "unknown": "알 수 없는 오류가 발생했습니다."
  },

  "toast": { "collected": "워크로그 {count}건을 수집했습니다.", "downloaded": "CSV 파일을 내려받았습니다." }
}
```

**`locales/en/worklogExport.json`** — 동일 구조, 영문 값
```json
{
  "nav": "Worklog Export",
  "title": "Worklog Export",
  "description": "Search worklogs across all of Jira and download them as CSV. Results follow your own Jira permissions.",
  "filter": {
    "title": "Search conditions",
    "project": { "label": "Project", "placeholder": "All projects", "help": "If left empty, every project you can access is included." },
    "author": { "label": "Author", "placeholder": "All authors", "help": "If left empty, every author is included." },
    "period": { "label": "Period", "start": "From", "end": "To", "required": "Period is required.", "invalid": "The end date must be on or after the start date." },
    "extraJql": { "label": "Additional JQL", "placeholder": "e.g. issuetype = Bug", "help": "Combined with the conditions above using AND." }
  },
  "action": { "search": "Search", "cancel": "Cancel", "download": "Download CSV", "reset": "Reset" },
  "progress": {
    "searching": "Searching issues… ({count} found)",
    "fetching": "Fetching worklogs… ({done}/{total})",
    "cancelled": "Cancelled. Showing only the results collected so far."
  },
  "result": { "title": "Results" },
  "summary": { "issueCount": "Issues", "worklogCount": "Worklogs", "totalHours": "Total hours" },
  "column": {
    "issueKey": "Issue key", "issueSummary": "Summary", "projectKey": "Project key",
    "authorName": "Author", "authorAccountId": "Author account ID",
    "started": "Started", "startedDate": "Start date",
    "timeSpentSeconds": "Time spent (sec)", "timeSpentHours": "Time spent (hours)",
    "comment": "Comment", "worklogId": "Worklog ID"
  },
  "preview": { "truncated": "Showing the first {shown} rows. The CSV contains all {total} rows." },
  "empty": { "initial": "Choose your conditions and press Search.", "noResult": "No worklogs match these conditions." },
  "warn": {
    "truncated": "Reached the {limit}-issue limit; only part of the result was collected. Narrow the period or projects.",
    "partialFailure": "Could not fetch worklogs for {count} issue(s). Showing the remaining results.",
    "longPeriod": "The period is longer than a year. Large results may take a while."
  },
  "error": {
    "searchFailed": "Issue search failed.",
    "jqlInvalid": "The JQL is not valid.",
    "rateLimited": "Jira rate limit reached. Please try again shortly.",
    "unknown": "An unexpected error occurred."
  },
  "toast": { "collected": "Collected {count} worklog(s).", "downloaded": "CSV file downloaded." }
}
```

### 9-C. 번역 사용 규칙
- `{token}` 치환이 있는 키는 **반드시 `tFormat(t, key, vars)`** 를 쓴다(`utils/i18n.js`). Forge `t(key, defaultValue)` 는 치환 인자를 지원하지 않아 `{count}` 가 화면에 그대로 나온다.
- 추가 후 **`cd static/ui && npm run merge`** 실행. `locales/ko-KR.json`·`en-US.json` 직접 수정 금지.
- `locales/script/*.json` 은 빈 스텁이다 — 거기 넣으면 merge 에 **반영되지 않는다.**

---

## 10. 비범위 · 리스크 · 상한

### 10-1. 이슈 수 상한
- `MAX_ISSUES = 5000`. search 페이징 누적이 이 값에 도달하면 **페이징을 멈추고 `truncated=true`** 로 진행한다(중단하지 않는다). 근거: 3분 기다린 뒤 "너무 많습니다"만 보는 것보다, 일부라도 받고 경고를 보는 편이 낫다.
- ⚠ **`/rest/api/3/search/jql` 응답에는 `total` 이 없다**(`nextPageToken`/`isLast` 기반 커서 페이징). 따라서 **검색 전에는 건수를 알 수 없다.**
- 선택: `POST /rest/api/3/search/approximate-count` 로 사전 경고가 가능하나, **구현 전 API 문서로 존재·응답 shape 을 실확인할 것.** 실패(404/400)하면 조용히 건너뛰고 페이징 상한만으로 동작하게 한다 — 이 엔드포인트에 의존하는 코드 경로를 만들지 말 것.

### 10-2. Jira rate limit (429)
- §6-4 정책(최대 3회, 1s/2s/4s + jitter). `Retry-After` 는 읽을 수 없다.
- 동시성 4 는 이 한도를 고려한 값이다. **올리지 말 것.**
- 반복 429 로 실패가 누적되면 `worklogExport.error.rateLimited` 를 경고로 표시한다.

### 10-3. 팀 관리형 프로젝트 — **영향 없음** ✅
이 기능은 Forge 커스텀 필드·이슈 엔티티 프로퍼티(`movesRms`)를 **하나도 읽지 않는다.** 쓰는 필드는 `summary`, `project` 와 워크로그 엔티티뿐이며 전부 Jira 네이티브다. 따라서 `project_team_managed_field_gap` 이슈(팀 관리형에서 Forge 필드가 `fields` 응답에서 누락)와 무관하다. `fieldsByKeys` 함정도 해당 없다(커스텀 필드 미조회).

### 10-4. 그 외 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 이슈 5,000 × 워크로그 20건 = 100,000행 메모리 | 브라우저 탭 메모리 압박 | 이슈별로 **즉시 재필터**해서 통과분만 누적(§6-1). 원본 worklog 객체를 배열에 쌓지 않는다 |
| 표 렌더 부하 | 수 초 프리즈 | `PREVIEW_LIMIT = 500`(§8-3) |
| 진행률 setState 폭주 | 렌더 5,000회 | 진행 중에는 표를 렌더하지 않는다. 필요하면 100ms 스로틀 |
| iframe 내 `<a download>` | 다운로드 미동작 가능성 | 기존 `downloadExcelUtil` 이 프로덕션에서 동작 중 → 낮음. **E2E 필수 확인 항목** |
| `migratePermissionSets()` 의 `findAll()` 100건 하드캡 | 권한 세트가 100개 초과인 설치에서 일부 세트가 새 키를 못 받음 | **기존 결함이며 이 기능의 범위 밖.** 그런 설치에서는 초과분 세트가 `WORKLOG_EXPORT` 키 없이 남고, `mergeSetPages` 가 런타임에 `defaultForNew`(false)로 보충하므로 **동작은 안전**(fail-close). 별도 이슈로 기록 |
| 기존 설치에서 PM 프리셋에 권한이 안 붙음 | 관리자 문의 | §3-4 — **릴리스 노트 필수** |

---

## 11. 구현 작업 분해

### 11-A. backend-engineer 체크리스트

- [ ] `src/permission/ResourceCatalog.js` — `CATALOG` 의 `RESOURCE_MANAGEMENT` 다음 줄에 `WORKLOG_EXPORT` 엔트리 추가 (§3-1 코드 그대로)
- [ ] `src/trigger/onInstall.js` — `SEED_VERSION = 10` + 주석 1줄 (§3-2)
- [ ] `src/seed/SeedData.js` — **변경하지 않는다.** 프리셋 `grant()` 에 `WORKLOG_EXPORT` 개별 분기를 넣지 말 것 (§3-6 테스트가 깨진다)
- [ ] `src/permission/PermissionMap.js` — **변경하지 않는다** (resolver 없음, §3-5)
- [ ] `locales/kr/common.json` · `locales/en/common.json` — `pages.worklogExport` (§9-A)
- [ ] `locales/kr/permission.json` · `locales/en/permission.json` — `desc.WORKLOG_EXPORT` (§9-A)
- [ ] `cd static/ui && npm run merge` 실행
- [ ] (권장) `src/permission/__test__/WorklogExportCatalog.test.js` 신규 (§3-7)
- [ ] `npm test` (루트) — 특히 `PresetPermissionSeed.test.js`, `userPermissionCheck.test.js`, `permissionMap.contract.test.js` 통과 확인
- [ ] 릴리스 노트에 §3-4(기존 설치는 Admin 만 열림) 문장 기재

### 11-B. frontend-engineer 체크리스트

**공용 인프라**
- [ ] `utils/jiraApi/requestJira.js` — `REQUEST_MAP` 에 `searchUsers` 추가 (§2-A #4 코드 그대로). `searchApproximateCount` 는 §10-1 확인 후 선택
- [ ] `utils/queryKey/jiraKeys.js` — `projectSearch`, `userSearch` 팩토리 추가 (§4-6)

**라우팅·내비게이션**
- [ ] `App.jsx` — `WorklogExportPage` lazy 선언 + `/worklog-export` Route (§4-2). Suspense 경계 **추가 불필요**
- [ ] `layout/Sidebar.jsx` — `DownloadIcon` import + `mainItems` 마지막 항목 (§4-3)

**유틸 (테스트 먼저 쓰기 좋은 순수 함수들)**
- [ ] `pages/worklogExport/utils/buildWorklogJql.js` + 테스트 (§5-4)
- [ ] `.../utils/worklogFilter.js` + 테스트 — `startedLocalDate`/`isInPeriod`/`isSelectedAuthor`/`toWorklogRows` (§5). **타임존 경계 테스트 필수**: `+0900` 08:00 이 UTC 기준으로 전날이 되는 케이스가 통과해야 한다
- [ ] `.../utils/adfToPlainText.js` + 테스트 (§7-5)
- [ ] `.../utils/worklogCsv.js` + 테스트 — BOM/인용/`""`/개행 치환/파일명 (§7)
- [ ] `.../utils/searchIssues.js` — nextPageToken 페이징 + `MAX_ISSUES` 상한 + cancel 검사 (§6-1)
- [ ] `.../utils/fetchIssueWorklogs.js` — startAt 페이징 + `withRetry`(429/5xx) (§6-4, §6-5)

**훅**
- [ ] `.../hooks/useWorklogExportFilters.js` — FilterState + 유효성 (§4-4)
- [ ] `.../hooks/useJiraProjectOptions.js` — 디바운스 + `useQuery(jiraKeys.projectSearch)` (§8-2)
- [ ] `.../hooks/useJiraUserOptions.js` — 디바운스 + `useQuery(jiraKeys.userSearch)`, `accountType==='atlassian'` 필터
- [ ] `.../hooks/useWorklogCollector.js` — §2-C 계약 그대로. `mapWithConcurrency` 재사용(**p-limit 금지**), `cancelRef` 플래그(**AbortController 금지**)

**컴포넌트**
- [ ] `.../WorklogExportPage.jsx` — PageContainer + 권한 게이트 + ToastFlags (§8-1, §4-5)
- [ ] `.../components/WorklogExportFilterCard.jsx` (§8-2)
- [ ] `.../components/WorklogExportProgress.jsx` (§6-6)
- [ ] `.../components/WorklogExportSummary.jsx` — `KpiTile` 3장 (§8-4)
- [ ] `.../components/WorklogExportTable.jsx` — CommonTable, **전 셀 sortValue**, PREVIEW_LIMIT 500 (§8-3)

**i18n·빌드**
- [ ] `locales/kr/worklogExport.json` · `locales/en/worklogExport.json` 신규 (§9-B)
- [ ] `cd static/ui && npm run merge`
- [ ] `cd static/ui && npm test`
- [ ] `cd static/ui && CI=true npm run build` — CI 와 같은 조건으로 확인

### 11-C. integration-verifier 검증 포인트

1. **§2-A Jira 계약**: `executeRequest` 호출부가 전부 `res?.success === false` 를 **명시 검사**하는가. `res.values`/`res.issues`/`res.worklogs` 유무로만 판정하는 곳이 없는가
2. **§5-1 타임존**: `toISOString()`·`dayjs.utc()`·하드코딩 타임존이 `pages/worklogExport/` 어디에도 없는가 (grep)
3. **§6-2 동시성**: `p-limit` 을 프론트에서 import 하지 않았는가. `mapWithConcurrency` worker 가 try/catch 로 감싸져 있는가
4. **§2-B 권한 파생**: `userPermissionCheck` 응답 `pages` 길이 = `RESOURCE_KEYS.length`. 백오피스 권한 화면에 `WORKLOG_EXPORT` 토글이 나타나는가
5. **§3-6 시드 테스트**: "Team Lead ↔ Team Member 차이는 RESOURCE_MANAGEMENT 하나" 테스트가 통과하는가
6. **§8-3 sortValue**: 표 rows 의 모든 셀에 `sortValue` 가 있는가(RFC-184 계약)
7. **i18n 누락**: `pages/worklogExport/` 의 모든 `t('...')` 키가 `locales/kr`·`en` 양쪽에 존재하는가. merge 후 `ko-KR.json`/`en-US.json` 에 `worklogExport` 네임스페이스가 생겼는가
8. **쿼리키 계약**: `queryKeyContract.test.js` 통과 (인라인 배열 리터럴 0)
9. **다중 shape 재사용**: `WorklogRow` 를 표·CSV·요약 셋이 공유한다 — 세 소비부가 참조하는 필드가 전부 `toWorklogRows` 생산부에 있는가

### 11-D. E2E(배포 후) 필수 확인
- [ ] iframe 안에서 `<a download>` CSV 다운로드가 실제로 동작하는가
- [ ] 한글 헤더가 Excel 에서 깨지지 않는가(BOM 검증)
- [ ] 기존 설치 업그레이드 후 Admin 만 메뉴가 보이고, 백오피스에서 토글하면 즉시 반영되는가
- [ ] `worklogDate` 경계(월초 00:30 / 월말 23:30 워크로그)가 기대대로 포함/제외되는가
- [ ] 이슈 500건 규모에서 진행률·취소가 정상 동작하는가

---

## 12. 설계 가정 (요구사항에 없어 보수적으로 확정한 것)

| # | 가정 | 대안이 필요하면 |
|---|------|----------------|
| 1 | `member` 기본값 = **닫힘**(`ff`) | 전사 공개가 목표면 `member: rf` 로 바꾸고 §3-4 릴리스 노트를 함께 수정 |
| 2 | 기간 **필수**, 상한 없음(1년 초과는 경고만) | 하드 상한이 필요하면 `useWorklogExportFilters` 유효성에 추가 |
| 3 | 이슈 상한 5,000 = **절단 후 진행** | "초과 시 실행 거부"가 맞다면 `searchIssues` 에서 throw |
| 4 | 표 미리보기 500행 | 값만 상수로 조정 |
| 5 | ADF → **플레인 텍스트**(마크다운 아님) | 마크다운이 필요하면 `adf-to-md` 동적 import 로 교체(§7-5) |
| 6 | CSV 수식 인젝션 방어 **미적용** | 적용 시 `issueSummary`/`comment` 두 컬럼만 |
| 7 | 사용자 검색은 `/user/search`(그룹 미지원) | 그룹 단위 필터가 필요하면 `getUsersGroups` + `worklogAuthor in membersOf("…")` 로 확장 |
