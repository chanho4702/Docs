# RFC-202 — Jira 이슈 화면 워크로그 패널 설계서

작성: 2026-09-22 (feature-architect). 요구사항: `_workspace/issue-worklog-panel/00_input/requirement.md`
worktree: `.claude/worktrees/RFC-202` (모든 경로는 이 루트 기준)

---

## 0. 사실 확인 (Forge/Jira 공식 문서)

요구사항의 ⚠ 두 항목을 공식 문서로 확인했다. **한 건은 요구사항의 전제를 뒤집는다.**

### 0-1. 모듈 선택 — `jira:issuePanel` 제외, `jira:issueActivity` + `jira:issueContext` 채택

#### (1) `jira:issuePanel` 을 쓰지 않는 이유 🔴

출처: <https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-panel/>

> "The `jira:issuePanel` module adds an issue panel to a Jira issue **when a configured button is clicked**."

즉 사용자가 이슈마다 이슈 화면의 앱 버튼(Apps)을 눌러 패널을 **추가해야** 내용이 보인다. 커뮤니티에서도
같은 제약이 반복 확인된다(«Make jira:issuePanel added always», «Display forge app automatically when
opening issue panel»). 관리자용 우회는 존재하지만 **공식 설정이 아니라 브라우저 콘솔/Node 스크립트로
JQL 대상 이슈(최대 1,000건)에 "패널 표시" 상태를 REST 로 찍어 주는 workaround** 다
(<https://community.developer.atlassian.com/t/enabling-jira-issue-panels-by-default-a-guide-for-jira-administrators/91322> —
"not a perfect solution", "Atlassian is working on an official solution").
→ **리더 결정(2026-09-22): 제외.** 발견성을 사용자 수작업에 의존하는 진입점은 쓰지 않는다.

#### (2) `jira:issueActivity` — 주 화면 (본문 전체 폭)

출처: <https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-activity/>

> "The `jira:issueActivity` module adds a item to the **Activity** panel of Jira issues."
> "It works in the [new issue view] but **not the old issue view**."

프로퍼티 표(문서 그대로): `key`(string, required), `resource`(string, conditional),
`render`('native', conditional), `resolver`(object, required), `viewportSize`('small'|'medium'|'large'|'xlarge', optional),
`title`(string 또는 i18n object, required), `displayConditions`(object, optional).
→ `label`·`icon`·`unlicensedAccess`·`allowMultiple` 은 **이 모듈에 없다**(issuePanel 과 다름).

`displayConditions` 지원 — 문서 표 행 인용:

> "`displayConditions` | `object` | The object that defines whether or not a module is displayed in the UI of the app."

확장 컨텍스트 — 문서 인용:

> "Property: `issue.id`, `issue.key`, `issue.type`, `issue.typeId`, `project.id`, `project.key`, `project.type`, `location`"
> "These fields are available via the `useProductContext` hook (UI Kit) or `getContext` bridge method (Custom UI)."

#### (3) `jira:issueContext` — 요약 화면 (우측 사이드바)

출처: <https://developer.atlassian.com/platform/forge/manifest-reference/modules/jira-issue-context/>

> "adds a **collapsible panel under the other fields on the right side** of the issue view."
> "Users can expand these panels to view app information or collapse them if they don't need it."

프로퍼티: `key`, `resource`, `render`, `resolver`, `title`(required), `label`(required), `icon`,
`status`(badge/lozenge/icon), `displayConditions`, `dynamicProperties`.
컨텍스트: `issue.id/key/type/typeId`, `project.id/key/type`.

#### (4) 채택 구성 (리더 결정)

| 축 | `jira:issueActivity` (주 화면) | `jira:issueContext` (요약) |
|---|---|---|
| 위치 | 이슈 본문 **활동(Activity) 패널의 탭** | 이슈 **우측 컬럼** 필드 아래 |
| 폭 | 본문 전체 폭 (`viewportSize`) | 약 300px 내외 |
| 노출 | 활동 패널 탭으로 자동 등재 (사용자 추가 불필요) | 설치만 하면 자동 노출 |
| 초기 렌더 | **탭이 선택될 때 렌더** (아래 ⚠ 주의) | 접힘/펼침 토글 |
| 내용 | KPI 2타일 + 진행률 바 + **입력 폼** + 최근 워크로그 목록(수정·삭제) + 링크 | KPI + 진행률 바 + **빠른 입력**(간이 폼) + 링크 |
| `displayConditions` | ✅ | ✅ |
| `view.createHistory()` | ❌ 미지원(globalPage 계열 전용) | ❌ 미지원 |
| 구 이슈 화면 | ❌ 미지원(신 이슈 화면 전용) | — |

두 모듈은 **같은 `resource: issue-panel`**(같은 번들·같은 진입점)을 가리킨다. 화면 분기는
`view.getContext().moduleKey` 와 컨테이너 폭으로 한다(§6-2). 구현 비용 증가는 ≈ 0 이다.

> ⚠ **초기화 주의 (활동 탭)**
> 1. 활동 탭은 **선택될 때 iframe 이 마운트**되므로, 사용자가 탭을 누르기 전까지 우리 코드는 실행되지
>    않는다. 즉 "패널이 늦게 뜬다"는 체감이 있을 수 있다 → 로딩은 스켈레톤으로 표현하고
>    `settingKeys.detail()`·`backofficeKeys.publicHolidays()` 는 staleTime 이 길어 대개 즉시 채워진다.
> 2. `view.getContext()` 는 **마운트 이후에 await** 한다. 모듈 top-level await 로 컨텍스트를 잡는
>    기존 패턴(`WorklogModal.jsx:42`, `components/issue/IssueComponent.js:8`)을 **패널 진입점에서
>    복제하지 않는다** — 탭이 접혀 있는 동안 모듈 평가가 블로킹되면 첫 페인트가 늦어지고, async 모듈
>    그래프가 번들 분리와 섞여 진단이 어려워진다. `PanelApp` 의 `useEffect` + React Query
>    (`forgeContextKeys.current()`) 로 가져온다.
> 3. `issueContext` 는 **접혀 있어도 마운트될 수 있다**(collapsed 상태 렌더). 따라서 요약 화면은
>    **네트워크를 최소로** — 이슈 1건 + 워크로그 1건 조회까지만. 마크다운 에디터 청크는 사용자가
>    빠른 입력을 열 때만 로드한다(lazy 유지).
> 4. `view.createHistory()` 미지원은 문제가 아니다 — 패널은 라우터 없는 단일 화면이고, Workforce
>    이동은 `router.open(절대 URL)` 로 한다(§6-5).
> 5. `jira:issueActivity` 에는 `unlicensedAccess` 가 없다 — 라이선스 판정은 우리 코드(`useLicenseStore`)가
>    앱과 **같은 경계**(INACTIVE 만 차단)로 한다(§6-2).

### 0-2. `displayConditions.entityPropertyEqualTo` 는 프로퍼티 **내부 키 비교를 지원한다** ✅

출처: <https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/entity-property-conditions/>

조건 목록: `entityPropertyExists`, `entityPropertyEqualTo`, `entityPropertyContainsAny`,
`entityPropertyContainsAll`, `entityPropertyContainsAnyUserGroup`(Confluence 전용).

`entityPropertyEqualTo` 파라미터:

| 파라미터 | 필수 | 문서 인용 |
|---|---|---|
| `entity` | O | "The type of an entity to read the property from" (`app`/`issue`/`issueType`/`project`/`user`/`content`/`space`) |
| `propertyKey` | O | "The key of the property that's being checked" |
| `value` | O | "The value to match the actual property value with" (string 또는 string[]) |
| `objectName` | X | "**If the property value is a JSON object, this parameter allows you to specify a path inside the object to match a value from.**" (예: `myField.mySubField`) |

문서 예시(그대로):

```yaml
displayConditions:
  entityPropertyEqualTo:
    entity: content
    propertyKey: myPropertyKey
    value: myValue
    objectName: myNestedField.subField
```

제약 인용: "If the property is not present, the condition evaluates to `false`" / 비문자열 값은 비교 전
문자열로 변환된다(객체는 JSON stringify).
`jira:issueActivity`·`jira:issueContext` 는 둘 다 displayConditions 지원 모듈 표에 포함돼 있고(각 모듈
문서의 프로퍼티 표에서도 재확인 — §0-1), 조건은
**클라이언트 사이드에서 매니페스트의 정적 컨텍스트로 평가**된다
(<https://developer.atlassian.com/platform/forge/manifest-reference/display-conditions/>).

⚠ **검증 항목 V1**: 조건 대상 프로퍼티가 `jira:entityProperty` 모듈로 **선언돼 있어야 하는지**는 문서에
명시가 없다. 기본 설계는 **미선언**으로 가고(선언은 JQL 인덱싱용), dev 환경 실측에서 조건이 평가되지
않으면 `jira:entityProperty` 블록을 추가한다(§5-3).

### 0-3. Jira Bulk issue property API (백필 근거)

출처: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-properties/>
`PUT /rest/api/3/issue/properties/{propertyKey}` — `filter.entityIds` 로 대상 이슈를 지정해 **한 번에
최대 10,000건**에 같은 값을 세팅한다. 성공 시 `303`(비동기 태스크 리다이렉트).
→ 기존 설치 백필을 "이슈당 1요청"이 아니라 "프로젝트당 ~1요청"으로 처리할 수 있다(§5-4).
⚠ **검증 항목 V2**: bulk delete(`DELETE /rest/api/3/issue/properties/{propertyKey}`)의 실제 동작·필터
스펙과 asApp 권한. 미확인이면 해제는 이슈 단건 DELETE 로 간다(현행 saga 와 동일 형태).

---

## 1. 개요 / 영향 범위

Jira 이슈 화면 안에서 (1) 계획 작업량·투입 공수를 MM 으로 보고 (2) 워크로그를 바로 입력하고
(3) Workforce 작업관리로 이동한다. Moves RMS 프로젝트에 **연결된 이슈에만** 노출한다.

### 1-1. 백엔드

| 구분 | 대상 |
|---|---|
| **신규 resolver** | `backfillIssueLinkMarkers` (연결 표식 백필 잡 시작), `getIssueLinkBackfillStatus` (진행률) — **둘 다 관리자 전용, 패널이 쓰지 않는다** |
| **신규 API 모듈** | `src/api/jira/issue/IssueLinkPropertyApi.js` (표식 프로퍼티 전용 read/write/delete/bulk) |
| **신규 쓰기 관문** | `src/api/jira/field/ProjectLinkWriter.js` — 앱 필드 write + 표식 write 를 **한 함수로 묶는다** |
| **수정** | 연결/해제 7개 지점을 `ProjectLinkWriter` 경유로 교체 (§4 전수표) |
| **수정** | `src/resolver/project/ProjectDeletionService.js` — 표식 프로퍼티 삭제 1줄 추가 |
| **신규 큐** | `issue-link-backfill-queue` + consumer (백필) |
| **패널이 호출하는 resolver** | **신규 0개.** 기존 `getSettingData`(PUBLIC) · `getPublicHolidayList`(PUBLIC) · `userPermissionCheck`(PUBLIC) · `findProjectById`(R PROJECT detail) 만 사용. 나머지는 프론트 `requestJira` 직접 호출 |

### 1-2. 프론트

| 구분 | 대상 |
|---|---|
| **신규 진입점** | `static/ui/src/panel/index.js`, `panel/PanelApp.jsx` (별도 번들 — App.jsx 를 import 하지 않는다) |
| **신규 페이지** | `static/ui/src/panel/IssueActivityPanel.jsx`(주 화면) + `panel/IssueContextSummary.jsx`(요약) + 공유 하위 컴포넌트 6개 |
| **신규 공용 추출** | `components/worklog/` (ADF 로더·워크로그 write·코멘트 필드) — myWork `WorklogModal` 과 공유 |
| **신규 공용 유틸** | `utils/effort.js` (초→MD→MM), `utils/forgeAppUrl.js` (`CopyPageLinkButton` 에서 순수부 추출) |
| **신규 쿼리키** | `utils/queryKey/issuePanelKeys.js` |
| **수정** | `pages/myWork/modal/WorklogModal.jsx` (추출한 공용 모듈 import 로 교체 — 동작 불변) |
| **수정** | `components/layout/CopyPageLinkButton.jsx` (`buildPageUrl` 을 유틸에서 import) |
| **빌드** | `craco.config.js`(paths 분기), `package.json`(build 스크립트), `scripts/build-panel.js`(신규), `scripts/check-bundle-budget.js`(argv 지원), `bitbucket-pipelines.yml`(artifacts) |
| **manifest** | `jira:issueActivity` + `jira:issueContext` 모듈(같은 `resource`), `resources` 에 `issue-panel` 추가 |

### 1-3. DB

**MySQL 변경 없음. KVS 엔티티 변경 없음.** (백필 진행률은 기존 `job`/`job_batch` 엔티티 재사용 — §7)

### 1-4. i18n

`locales/kr/issuePanel.json` + `locales/en/issuePanel.json` 신규 (§8).
추출 과정에서 발견된 `WorklogModal` 하드코딩 한글 10개는 **이번 범위 밖**(기간 입력 모드 전용, 패널이
쓰지 않는다) — 회귀 위험만 만들므로 건드리지 않는다.

---

## 2. 경계면 계약

### 2-A. resolver 계약 (신규 resolver — 관리자 백필 전용)

| resolver 함수 | 입력 payload | 응답 shape (success) | PermissionMap | 대응 훅 / 쿼리키 |
|---|---|---|---|---|
| `backfillIssueLinkMarkers` | `{}` | `{ success: true, content: { jobId: string, projectCount: number } }` | `W('SETTINGS')` — `startProjectWorklogBatch` 와 동일 축 | `useStartLinkBackfill()` / (mutation, 키 없음) |
| `getIssueLinkBackfillStatus` | `{ jobId }` | `{ success: true, content: { status: 'RUNNING'\|'DONE'\|'FAILED', total, processed, failed } }` | `R('SETTINGS')` | `backofficeKeys.linkBackfill(jobId)` |

> 실패는 전 리포 공통 — `{ success: false, error: { name, code, message, cause } }`.
> ⚠ 신규 resolver 2개는 `src/permission/PermissionMap.js` 에 **반드시** 등재한다(미등재 시 `PERMISSION_UNMAPPED`).
> 컨트롤러는 `SettingController.js` 에 합류시켜 `CONTROLLER_REGISTRARS` 변경 없이 끝낸다.

### 2-B. 패널이 재사용하는 기존 resolver 계약 (확인된 실제 shape)

| resolver | payload | 응답 shape | PermissionMap | 쿼리키 |
|---|---|---|---|---|
| `getSettingData` | `{}` | `{ success: true, ...DEFAULT_SETTINGS 병합 }` → 소비부는 `const {success, ...settings} = result` | `'PUBLIC'` | `settingKeys.detail()` = `['settings','detail']` (**기존 캐시 공유 — 추가 네트워크 0**) |
| `getPublicHolidayList` | `{}` | `{ success: true, rows: [{ holidayDate, workRatio, name }] }` (기존 `usePublicHolidayList` 훅이 정규화) | `'PUBLIC'` | `backofficeKeys.publicHolidays()` |
| `userPermissionCheck` | `{}` | `{ success, isUser, name, pages:[{pageId,value:{read,write}}], projectScope, team }` | `'PUBLIC'` | `usePermissionStore.loadPermissions()` 내부 |
| `findProjectById` | `{ project_id }` | `{ success: true, rows: [{ project_id, project_name, ... }] }` | `R('PROJECT','detail')` | `findProjectByIdQueryKeys(projectId)` |

🔴 `findProjectById` 는 `project: 'detail'` 이므로 `MEMBER_ONLY`/`TEAM_ONLY` 스코프 사용자가 비소속
프로젝트 이슈를 열면 `PERMISSION_PROJECT_SCOPE_DENIED` 가 온다. **이것은 정상이며 fail-close 로 다룬다**
— 프로젝트명 대신 KPI 만 보여주고 "Workforce에서 열기" 링크를 숨긴다(§6-5 상태표 `denied`).

### 2-C. 프론트 → Jira REST 직접 호출 계약 (resolver 없음)

모두 `static/ui/src/utils/jiraApi/requestJira.js` 의 `executeRequest(key, param, urlParam)` 를 쓴다.
`executeRequest` 는 실패 시 throw 하지 않고 `{success:false, error:{name,code,message,cause}}` 를 반환한다
— 소비부는 `WorklogModal` 의 `ensureWorklogResult` 와 같은 승격 함수를 통과시킨다.

| 용도 | REQUEST_MAP 키 | 파라미터 | 소비하는 응답 필드 | 쿼리키 |
|---|---|---|---|---|
| 이슈 골격 + 표식 | `getIssue` | param `{ fields: 'summary,status,issuetype,timespent,timeoriginalestimate,aggregatetimespent,aggregatetimeoriginalestimate,project', properties: 'movesRmsLink' }`, urlParam `{ issueIdOrKey }` | `fields.summary`, `fields.status.name`, `fields.status.statusCategory.key`, `fields.issuetype.iconUrl`, `fields.timeoriginalestimate`(초\|null), `fields.timespent`(초\|null), `fields.project.key`, `properties.movesRmsLink.projectId`, `properties.movesRmsLink.linked` | `issuePanelKeys.issue(issueKey)` |
| 워크로그 목록 | `getIssueWorklogs` | param `{ maxResults: 1048 }`, urlParam `{ issueIdOrKey }` | `total`, `worklogs[].id/author.accountId/author.displayName/author.avatarUrls/started/timeSpentSeconds/timeSpent` | `issuePanelKeys.worklogs(issueKey)` |
| Jira 권한 | (기존 `fetchJiraProjectPermissions`) | `projectKey` | `canWorkOnIssues`, `canEditOwnWorklogs` (`true`/`false`/`null`) | `jiraKeys.myPermissions(projectKey)` |
| 워크로그 생성 | `addWorklog` | param `{ started, timeSpentSeconds, comment }`, urlParam `{ issueIdOrKey }` | `id` | (mutation) |
| 워크로그 수정 | `updateWorklog` | param `{ started, timeSpentSeconds, comment }`, urlParam `{ issueIdOrKey, id }` → `PUT /rest/api/3/issue/{issueIdOrKey}/worklog/{id}` | `id` | (mutation) |
| 워크로그 삭제 | `deleteWorklog` | param `{}`, urlParam `{ issueIdOrKey, id }` → `DELETE /rest/api/3/issue/{issueIdOrKey}/worklog/{id}` | 204 → `executeRequest` 가 `''` 반환 | (mutation) |

**수정·삭제 계약 세부** (리더 결정 2026-09-22 — 생성 + **내 것** 수정·삭제)

- 세 키 모두 `REQUEST_MAP` 에 **이미 있다**(`requestJira.js` 의 `addWorklog`/`updateWorklog`/`deleteWorklog`)
  — REQUEST_MAP 을 추가하지 않는다.
- `adjustEstimate` 는 **넘기지 않는다** → Jira 기본값(`auto`) 유지. 잔여 추정치 재계산을 우리가
  바꾸지 않는다는 뜻이고, 이슈 화면 Jira 기본 워크로그 UI 와 동일하게 동작한다.
  (`buildTimetrackingPayload`(useJiraEditGuards.js) 는 **계획 공수 write 용**이라 여기선 쓰지 않는다.)
- 대상 한정: `author.accountId === view.getContext().accountId` 인 행만 ✎/🗑 를 노출한다
  (`WorklogModal.jsx:198` 의 `isEditable` 판정과 동일한 규칙).
- Jira 권한: 수정은 `canEditOwnWorklogs`, 삭제는 `canDeleteOwnWorklogs`
  (`useJiraEditGuards.js` 의 `PERMISSIONS_PARAM` 에 이미 포함). 정책은 동일 —
  **확정 `false` 만 차단, `null`(미확인)은 시도 허용.**
- `DELETE` 는 204 를 반환하며 `executeRequest` 가 이를 `''` 로 정규화한다
  (`requestJira.js` 의 `if(response.status === 204) return ''`) → `ensureWorklogResult` 가
  빈 문자열을 실패로 오판하지 않도록 **삭제는 별도 성공 판정**을 쓴다(§6-4 `deleteWorklog`).

#### 🔴 손실 ADF 가드 — 수정 시 `comment` 생략 (리더 결정 2026-09-22)

우리 편집기는 마크다운이다. 기존 워크로그 코멘트가 ADF 로 저장돼 있고 그중 마크다운으로 표현할 수
없는 노드(이미지·멘션 등)가 있으면, `ADF → 마크다운 → ADF` 왕복에서 **그 노드가 조용히 사라진다.**
신규 입력은 손실이 없다(편집기가 이미지·멘션 노드를 만들지 못한다) → **가드는 수정 경로에만** 둔다.

`adf-to-md@1.2.1` 실소스(`static/ui/node_modules/adf-to-md/index.js`)를 읽어 지원 집합을 확정했다.
`_convert` 의 `switch` 에 분기가 있는 타입만 출력이 나오고, `default` 는
`warnings.add(node.type); return '';` — 즉 **미지원 노드는 빈 문자열로 소실**된다(L87-90).

| 구분 | 타입 (소스에서 도출) |
|---|---|
| **지원 노드** (19) | `doc`, `text`, `paragraph`, `heading`, `hardBreak`, `inlineCard`, `blockCard`, `embedCard`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `codeBlock`, `rule`, `emoji`, `table`, `tableRow`, `tableHeader`, `tableCell` |
| **지원 mark** (5) | `code`, `em`, `link`, `strike`, `strong` (그 외는 `_convertMarks` L121-123 에서 warning + 서식만 소실) |
| **HARD 손실 = 위 집합의 보집합** | 실제로 자주 만나는 것: `mediaSingle`·`media`·`mediaInline`·`mediaGroup`(이미지/첨부), `mention`, `panel`, `expand`·`nestedExpand`, `status`, `date`, `taskList`·`taskItem`, `decisionList`·`decisionItem`, `extension`·`bodiedExtension`·`inlineExtension`·`multiBodiedExtension`, `layoutSection`·`layoutColumn`, `caption` |
| **SOFT(표현 변형)** | `inlineCard`/`blockCard`/`embedCard` → `[url](url)` 평문 링크, `emoji` → `:shortName:` 텍스트, `table` → 마크다운 표. **내용은 남지만 노드 타입이 바뀐다** |

🔴 HARD 집합을 **열거하지 않는다** — 지원 집합(19개)의 **보집합**으로 정의한다. ADF 스키마는
Atlassian 이 계속 추가하므로, 열거형은 새 노드가 나올 때마다 조용히 통과시키는 방향으로 틀린다.
fail-close 가 되려면 "아는 것만 안전"이어야 한다.

**수정 저장 계약**:

| 조건 | 요청 본문 |
|---|---|
| 기존 코멘트가 없음 (`COMMENT_LOAD.NONE`) | `{ started, timeSpentSeconds, comment }` — 새 코멘트 그대로 |
| 기존 코멘트에 HARD 손실 노드 **없음** (`READY`) | `{ started, timeSpentSeconds, comment }` — 편집 결과 반영 |
| 기존 코멘트에 HARD 손실 노드 **있음** (`LOCKED`) | `{ started, timeSpentSeconds }` — **`comment` 키를 본문에서 생략** → Jira 가 원본 ADF 보존. 날짜·시간만 수정된다 |

> ⚠ **검증 항목 V3**: `PUT /rest/api/3/issue/{key}/worklog/{id}` 에서 `comment` 를 **생략**했을 때
> 기존 코멘트가 보존되는지 dev 실측. 보존되지 않으면(코멘트가 지워지면) 폴백 =
> **`GET` 으로 받아 둔 원본 ADF 객체를 `comment` 에 그대로 되돌려 보낸다**
> (`issuePanelKeys.worklogs(key)` 캐시에 원본 ADF 가 이미 있으므로 추가 왕복 없음).
> 이 폴백은 설계상 항상 안전하므로, V3 결과에 따라 **한 줄 분기**만 바뀐다.

🔴 **`fieldsByKeys` 를 쓰지 않는다.** 이 설계는 앱 커스텀 필드(`moves_RMS_projectId`)를 **읽지 않고**
프로젝트 id 를 이슈 프로퍼티에서 얻는다(§3). 그래서 `fieldsByKeys:true` 함정과 **팀 관리형에서 앱 필드가
`fields` 응답에서 빠지는 문제가 구조적으로 사라진다.**

`properties` 쿼리 파라미터 사용은 백엔드 전례와 동일하다 — `src/api/jira/issue/IssueApi.js:501`
(`/rest/api/3/issue/${id}?fields=${fields}&properties=${MOVES_PROPERTY_KEY}`).

### 2-D. 값 계약 — MM 환산 (단일 원천)

```
hourRate  = settingData.hourRate > 0 ? settingData.hourRate : 8        // getSettingData, 기본 8 (SettingDefaults.js)
holidayMap= buildHolidayMap(holidays)                                   // utils/workday.js
monthMm   = getMonthMm(now.getFullYear(), now.getMonth(), holidayMap)   // utils/workday.js — 0-based month
plannedMd = secondsToMd(fields.timeoriginalestimate, hourRate)          // utils/effort.js (신규, 기존 식 추출)
spentMd   = secondsToMd(fields.timespent, hourRate)
myMd      = secondsToMd(Σ(내 worklog.timeSpentSeconds), hourRate)
plannedMm = mdToMm(plannedMd, monthMm)                                  // utils/effort.js
progress  = plannedMd > 0 ? spentMd / plannedMd : null                  // null = "모름"(0% 아님)
```

`utils/effort.js` (신규) — **새 산식이 아니라 기존 인라인 식의 추출**이다:

| 함수 | 본문 | 기존 동일 구현 |
|---|---|---|
| `secondsToMd(seconds, hourRate)` | `Math.round(((seconds ?? 0) / ((hourRate > 0 ? hourRate : 8) * 3600)) * 10) / 10` | `pages/resource/overview/WorkloadCell.jsx:36` `toMd`, `pages/projectDetail/taskHistory/taskHistory.transform.js:29`, `ScopeSplitCell.jsx:36`, `useMyContribution.js:89` … (프론트 20+ 지점 동일 식) |
| `mdToMm(md, monthMm)` | `monthMm > 0 ? Math.round((md / monthMm) * 100) / 100 : null` | `ResourceAnalysisTable.jsx:158`, `ResourceAnalysisTeamTable.jsx:120`, `ResourceAnalysisChart.jsx:291/307/309` (소수 2자리 일치) |
| `resolveHourRate(settingData)` | `settingData?.hourRate > 0 ? settingData.hourRate : 8` | 전 화면 `settingData?.hourRate \|\| 8` 패턴 |

🔴 **`utils/workday.js` 에 넣지 않는다.** 그 파일은 백엔드 `src/utils/workday.js` 와
`__test__/workdayParity.test.js` 로 **동일성이 강제**되는 순수 모듈이다. `hourRate` 의존 함수를 넣으면
parity 테스트가 깨진다. 분모(`getMonthMm`/`buildHolidayMap`)는 그대로 `workday.js` 를 쓴다.

기준 월은 **현재 월**이다. 이슈 단위 지표에는 기간 축이 없으므로, 기존 `pages/myWork/MyLogSummary.jsx:24`
가 쓰는 것과 같은 기준(`getMonthMm(now.getFullYear(), now.getMonth(), holidayMap)`)을 따르고, 화면에
`1MM = {monthMm}일 ({monthMm × hourRate}h)` 를 ⓘ 로 명시한다(`ResourceAnalysisPage.jsx:213` 전례).

---

## 3. 연결 표식 설계

### 3-1. 표식이 필요한 이유와 형태

`displayConditions` 는 매니페스트의 정적 조건이므로 "이 이슈가 어느 프로젝트에 연결됐나"(가변값)를
비교할 수 없다. 따라서 **고정값 불리언 표식**이 필요하다. 동시에 패널은 프로젝트 id 를 알아야 한다
(팀 관리형에서 앱 필드가 `fields` 에서 빠지므로). 둘을 한 프로퍼티에 담는다.

**결정: 신규 전용 프로퍼티 키 `movesRmsLink`**

```json
{ "linked": true, "projectId": "3" }
```

```yaml
displayConditions:
  entityPropertyEqualTo:
    entity: issue
    propertyKey: movesRmsLink
    objectName: linked
    value: "true"          # 비문자열은 비교 전 문자열 변환 — 불리언 true 는 "true"
```

### 3-2. 기존 `movesRms` 키 재사용 안과의 비교 (요구사항 지시 대비 결정 근거)

| 축 | (A) `movesRms.linked` 재사용 | (B) 신규 `movesRmsLink` ← **채택** |
|---|---|---|
| 프로젝트 삭제 saga | ✅ 이미 `deleteIssueProperty(id,'app')` 로 통째 삭제 → 추가 작업 0 | ⚠ `ProjectDeletionService.unlinkOneBatch` 에 삭제 1줄 추가 |
| 연결 시 쓰기 | `mergeIssueProperty` 필수 → 이슈당 **GET+PUT 2요청**, coworkers 와 read-merge-write 경합 | `writeIssueProperty`(전체 교체) → 이슈당 **PUT 1요청**, 경합 없음 |
| 해제 시 (`deleteProjectIssue`) | 현재 프로퍼티 호출 0회인 경로에 GET+PUT 추가 → 일괄 제외 N건이면 2N 요청 | DELETE 1요청/건 |
| **기존 설치 백필** | 🔴 bulk API 사용 불가(전체 교체라 coworkers 파괴) → **이슈당 2요청**. 5,000건 설치 = 10,000요청 | ✅ `PUT /issue/properties/movesRmsLink` + `filter.entityIds` 로 **최대 10,000건/요청** → 프로젝트당 ~1요청 |
| 데이터 수명 | `linked:false` 잔재가 남는다(빈 문자열 금지 규칙은 KVS 전용이라 저장은 되지만 의미 없는 값) | 해제 = 키 삭제 → 조건이 "부재 → false" 로 자연 처리 |

백필 비용 차이가 결정적이다. 요구사항은 "가능하면 기존 키"였고 §0-2 로 (A)도 **기술적으로 가능**함이
확인됐으나, (B)가 백필·해제·경합 세 축에서 모두 유리하고 비용은 saga 1줄이다. → **리더 질문 Q2** 로
올리되 결정 없이도 (B)로 진행한다.

### 3-3. `jira:entityProperty` 선언 여부

기본은 **미선언**이다. 선언은 JQL 인덱싱(`searchAlias`)을 위한 것이고 우리는 JQL 검색을 하지 않는다.
현행 매니페스트 블록(참고 — `keys/objectName/extractions` 가 아니라 `propertyKey`+`values[{path,type,searchAlias}]` 구 형식):

```yaml
  jira:entityProperty:
    - key: moves-rms-entity-property
      entityType: "issue"
      propertyKey: movesRms
      values:
        - path: coworkers
          type: user
          searchAlias: movesRmsCoworkers
        - path: assignedAt
          type: date
          searchAlias: movesRmsAssignedAt
        - path: assignedById
          type: string
          searchAlias: movesRmsAssignedBy
```

검증 항목 **V1** 에서 displayConditions 가 미선언 프로퍼티를 읽지 못하면 아래를 추가한다:

```yaml
    - key: moves-rms-link-property
      entityType: "issue"
      propertyKey: movesRmsLink
      values:
        - path: projectId
          type: string
          searchAlias: movesRmsLinkedProject
```

---

## 4. 연결 / 해제 경로 전수표 (같은 데이터 다중 경로)

`moves_RMS_projectId` 앱 필드 write 가 곧 "연결"이다. 저수준 관문은
`src/api/jira/field/AppFieldValueApi.js` 의 `setAppFieldValueForIssues`(asApp, 50건 배치) 하나뿐이지만,
**호출 지점은 7곳**이다. 표식을 빠뜨린 경로가 하나라도 있으면 그 경로로 연결된 이슈에는 패널이 뜨지 않는다.

### 4-1. 연결(LINK) — 6개 지점

| # | 파일 | 함수 | 현재 쓰는 것 | 진입점 | 표식 write |
|---|---|---|---|---|---|
| L1 | `src/resolver/projectIssue/ProjectUsersService.js` | `updateProjectIdFieldService` (L289, write L304) | `projectIdField = String(project_id)` ※ 같은 함수가 coworkerField 겸용 | resolver `updateProjectIdField` ← `pages/projectDetail/issue/IssueAddModal.jsx:104`, `pages/projectDetail/gantt/useGanttMutations.js:540`(coworker 용) | ✅ `fieldIdOrKey` 가 projectIdField 인 경우에만 |
| L2 | `src/resolver/projectSubscription/SubscriptionSweeper.js` | `applyTagging` (L104, write L128) / `sweepSubscription` (L153) | `projectIdField = String(sub.projectId)` | 트리거 `runSubscriptionReconcile`(`src/trigger/subscriptionReconcile.js:43`) + resolver `runSubscriptionSyncNow` | ✅ |
| L3 | `src/resolver/projectSubscription/SubscriptionBackfill.js` | `enqueueSubscriptionBackfill` (L75, `applyTagging` L98) | `projectIdField = sub.projectId` | resolver `createProjectSubscription` → `ProjectSubscriptionService.js:445` | ✅ |
| L4 | `src/queue/consumer.js` | `backfillSubscription` 컨슈머 (write L288) | `projectIdField = String(sub.projectId)` | queue `subscription-backfill-queue` | ✅ |
| L5 | `src/trigger/onIssueCreated.js` | `onIssueCreated` (L28, write L58) | `projectIdField = String(sub.projectId)` | product trigger `avi:jira:created:issue` | ✅ |
| L6 | (동일 저수준) `src/api/jira/field/AppFieldValueApi.js` | `setAppFieldValues`/`setAppFieldValueForIssues` (L48/L79) | `PUT /rest/api/3/app/field/{id}/value` (asApp) | 위 5개의 공통 관문 | — (관문 자체는 coworker write 에도 쓰이므로 여기서 분기하지 않는다) |

### 4-2. 해제(UNLINK) — 3개 지점

| # | 파일 | 함수 | 현재 쓰는 것 | 진입점 | 표식 제거 |
|---|---|---|---|---|---|
| U1 | `src/resolver/projectIssue/ProjectUsersService.js` | `deleteProjectIssueService` (L320, write L323) | `projectIdField = ''` (빈 문자열 = 해제). **`movesRms` 프로퍼티는 건드리지 않아 잔존** | resolver `deleteProjectIssue` ← `ProjectIssueTable.jsx:235` 단건 + `bulkDelete.js` 일괄 제외 | ✅ `movesRmsLink` DELETE |
| U2 | `src/resolver/project/ProjectDeletionService.js` | `unlinkOneBatch` (L85; 프로퍼티 삭제 L113, 필드 비움 L129) | ① `deleteIssueProperty(id,'app')` = `movesRms` **전체 DELETE** ② `setAppFieldValueForIssues(value:'')` | resolver `deleteProject` → `advanceProjectDeletion` | ✅ `movesRmsLink` DELETE 1줄 추가 (`property_cleared_at` 체크포인트 안에서 함께) |
| U3 | `src/resolver/projectSubscription/ProjectSubscriptionService.js` | `deleteProjectSubscriptionService` (L520) | **아무것도 되돌리지 않는다** — L537 주석 "이미 태깅된 이슈는 되돌리지 않는다(C7/§12-5)" | resolver `deleteProjectSubscription` | ❌ **변경 없음** — 필드가 남아 있으면 연결이 유지되는 것이 현행 정책. 표식도 남겨 정책과 일치시킨다 |

### 4-3. 연결 표식과 무관한 경로 (오인 방지)

- `updateGanttSchedule` (`GanttService.js:143`), 작업관리 목록 "일괄 적용"(`useBulkApply.js:62`)
  → Jira 기본 필드(start/due/timetracking)만 건드린다. **연결과 무관.** 일괄 "제외"만 U1 을 탄다.
- `movesRms` 프로퍼티 write 경로(`AssignedDateRecorder.recordAssignedDateOnce`,
  `updateIssueCoworkersService`, `WorkAssignmentWriter.assignWorkItem`, `GanttService.setGanttParent`,
  `GanttFolderService.moveGanttIssueToFolder`) → 연결 **메타데이터**이지 연결 자체가 아니다. 건드리지 않는다.
  (`recordAssignedDateOnce` 는 `prev.assignedAt` 이 있으면 **전체 skip** 하므로 표식 write 를 여기 얹으면
  재연결 이슈에서 조용히 누락된다 — 그래서 이 경로에 얹지 않는다.)
- 프론트엔드에는 프로퍼티/앱필드 직접 write 경로가 **전무**하다(`properties/`·`app/field/` grep 0건).

### 4-4. 구조적 보증 — 쓰기 관문 1개로 수렴

7개 지점에 표식 코드를 흩뿌리지 않는다. **신규 `src/api/jira/field/ProjectLinkWriter.js`** 가 필드와
표식을 항상 함께 쓴다:

```js
// 시그니처 계약
export const writeProjectLink  = async ({ issueIds, projectId, as = 'app' }) => {...}  // 필드=String(projectId) + 표식 write
export const clearProjectLink  = async ({ issueIds, as = 'app' }) => {...}             // 필드='' + 표식 DELETE
```

- L1~L5 는 `setAppFieldValueForIssues({fieldIdOrKey: projectIdField, ...})` 호출을 `writeProjectLink` 로 교체.
  L1 의 coworkerField 분기는 **기존 `setAppFieldValueForIssues` 를 그대로 유지**한다(연결이 아니다).
- U1 은 `clearProjectLink` 로 교체.
- U2 는 saga 체크포인트 구조를 유지해야 하므로 `IssueLinkPropertyApi.deleteIssueLink(id,'app')` 를 직접 1줄 추가.
- **순서**: 필드 write → 표식 write. 표식 write 실패는 `throw` 하지 않고 경고 반환값으로만 남긴다
  (필드가 곧 진실이고, 표식은 노출 힌트다. 표식 실패로 연결 자체를 실패시키면 회귀가 크다).
  누락분은 백필 잡이 흡수한다. → 호출부 계약: `writeProjectLink` 는
  `{ fieldWritten: number, markerWritten: number, markerFailed: string[] }` 를 반환.
- 동시성: 표식 write 는 이슈당 1요청이므로 `p-limit`(기존 의존성) 로 동시 5 제한. 필드 write 는 기존 50건 배치 유지.

### 4-5. `IssueLinkPropertyApi.js` 계약

`IssuePropertyApi.js` 는 `MOVES_PROPERTY_KEY` 를 하드코딩하고 10+ 소비처가 있으므로 **건드리지 않는다.**
같은 형태의 신규 파일을 만든다(4xx/5xx → `ForgeAPIError`, GET/DELETE 의 404 는 정상):

```js
export const MOVES_LINK_PROPERTY_KEY = 'movesRmsLink';
export const readIssueLink   = async (issueIdOrKey, as = 'user') => Promise<Object>;   // 200→value, 404→{}
export const writeIssueLink  = async (issueIdOrKey, projectId, as = 'app') => Promise<boolean>;  // PUT 전체교체 {linked:true, projectId:String(projectId)}
export const deleteIssueLink = async (issueIdOrKey, as = 'app') => Promise<boolean>;   // DELETE, 404→true(멱등)
export const bulkSetIssueLink = async ({ issueIds, projectId }) => Promise<boolean>;   // PUT /issue/properties/movesRmsLink, filter.entityIds (≤10,000), asApp
```

`as='app'` 기본값 근거: 대응하는 필드 write(`setAppFieldValueForIssues`)가 **asApp 전용 플랫폼 예외**이고,
트리거/큐 경로는 사용자 컨텍스트가 없다. 표식은 필드의 거울이므로 authority 를 필드에 맞춘다.
(`ProjectDeletionService` 가 이미 `deleteIssueProperty(id,'app')` 를 쓰는 전례와 동일.)

---

## 5. 백엔드 설계

### 5-1. 계층 분해

| 계층 | 파일 | 역할 |
|---|---|---|
| Controller | `src/resolver/backoffice/setting/SettingController.js` (수정) | `guardedDefine(resolver,'backfillIssueLinkMarkers', …)`, `guardedDefine(resolver,'getIssueLinkBackfillStatus', …)` |
| Service | `src/resolver/backoffice/setting/IssueLinkBackfillService.js` (신규) | 활성 프로젝트 목록 조회 → 프로젝트별 큐 push → `job` KVS 생성/진행률 조회 |
| Consumer | `src/queue/consumer.js` (수정) | `backfillIssueLinks` — 프로젝트 1건당 JQL 페이징으로 이슈 id 수집 → `bulkSetIssueLink` |
| API | `src/api/jira/issue/IssueLinkPropertyApi.js` (신규) | §4-5 |
| API | `src/api/jira/field/ProjectLinkWriter.js` (신규) | §4-4 |
| Repository | — | 신규 없음. 프로젝트 목록은 기존 `ProjectQuery`/`findProjectRepository` 재사용 |

### 5-2. 백필 잡 흐름

1. `backfillIssueLinkMarkers` → 활성+종료 전 프로젝트 id 목록(기존 `getActiveProjects` 서비스 재사용 불가 시
   `ProjectQuery` 직접) → `job` KVS 레코드 생성(`total = projectCount`) → 프로젝트당 1 이벤트를
   `issue-link-backfill-queue` 에 push → `{ jobId, projectCount }` 반환.
2. consumer(`timeoutSeconds: 600`): `jql = moves_RMS_projectId = "<id>"` 로 `/search/jql` 페이징
   (`nextPageToken`, `fields=id`, maxResults 100 — 기존 `IssueApi.js:376` 패턴) → id 배열 누적 →
   10,000건 단위로 `bulkSetIssueLink({issueIds, projectId})`.
3. 실패는 `job_fail` KVS 에 기록(기존 엔티티 재사용). 진행률은 `job_batch` 갱신.
4. 프론트는 `/backoffice/setting` 의 "기타 설정" 카드에 버튼 + 진행률(기존 `JobPollingManager` 패턴과
   같은 폴링). **UI 는 최소로** — 관리자 1회용이다.

⚠ Forge SQL 적재·KVS 신규 엔티티 **없음**. 표식 자체는 Jira 가 저장소다.

### 5-3. 에러 케이스

| 상황 | 코드 | 처리 |
|---|---|---|
| 표식 write 실패(권한/429/5xx) | `ForgeAPIError` `ISSUE_LINK_PROPERTY_WRITE_{status}` | **삼키고** `markerFailed[]` 에 누적 (연결 자체는 성공 유지) |
| 표식 DELETE 404 | — | 정상(멱등) |
| bulk set 비 303/2xx | `ForgeAPIError` `ISSUE_LINK_BULK_{status}` | consumer 가 `job_fail` 기록 후 다음 프로젝트 계속 |
| 백필 중 프로젝트 삭제 | — | JQL 결과 0건 → no-op |
| `ErrorCodes` 추가 | `src/utils/errors/ErrorCodes.js` | `ISSUE_LINK_PROPERTY_WRITE`, `ISSUE_LINK_BULK` 2건 |

### 5-4. `src/index.js` 등록

신규 컨트롤러를 만들지 않으므로 **`CONTROLLER_REGISTRARS` 배열 변경 없음.**
단, 신규 큐 함수는 `manifest.yml` 의 `consumer` + `function` 블록에 등록해야 한다:

```yaml
  consumer:
    - key: issue-link-backfill-consumer
      queue: issue-link-backfill-queue
      function: backfillIssueLinks
  function:
    - key: backfillIssueLinks
      handler: queue/consumer.backfillIssueLinks
      timeoutSeconds: 600
```

### 5-5. 성능

- 표식 write 는 **이슈당 1요청**이지만 연결은 보통 소량 배치다. 대량 경로(구독 백필 consumer,
  sweeper)는 이미 이슈당 프로퍼티 write(`recordAssignedDateOnce`)를 하고 있으므로 요청 수가 **2배**가
  된다. `p-limit` 5 로 묶고, consumer `timeoutSeconds: 600` 안에서 예산 초과 시 커서를 남기는 기존
  스윕 구조를 그대로 따른다(새 구조를 만들지 않는다).
- 공통 워크로그 페치 경로는 **건드리지 않는다.** 패널은 자기 이슈 1건만 프론트에서 조회한다
  (`feedback_worklog_fetch_isolation` 규칙 준수 — 전용 경로).

---

## 6. 프론트엔드 설계

### 6-1. 번들 분리

**결론: craco 단일 설정 + `react-scripts/config/paths` 환경변수 분기 → 2회 빌드, 출력 디렉토리 분리.**
별도 CRA 프로젝트를 만들지 않는다.

| 안 | 판정 |
|---|---|
| craco webpack **다중 entry** | ❌ CRA 의 `HtmlWebpackPlugin` 이 단일 entry 전제라 HTML 2장을 만들려면 플러그인 배열을 손봐야 하고, `asset-manifest.json` 의 `entrypoints` 가 섞여 `bundle:check` 의 main 탐색(`/^static\/js\/main\.[^/]+\.js$/`)이 깨진다 |
| 별도 CRA 프로젝트 | ❌ `package.json`/lockfile/Atlaskit 의존성 이중화. 공용 컴포넌트를 상대경로로 끌어오면 CRA 의 `ModuleScopePlugin` 이 막는다 |
| **paths 분기 + 2회 빌드** | ✅ **채택.** 기존 `build:app` 산출물·`asset-manifest.json`·`bundle:check` 가 **비트 단위로 그대로**. 패널은 완전히 독립된 `build-panel/` 에 나온다 |

구현:

```js
// static/ui/craco.config.js — 파일 최상단(module.exports 앞)
const path = require('path');
const paths = require('react-scripts/config/paths');
if (process.env.PANEL_BUILD === 'true') {
    paths.appIndexJs = path.resolve(__dirname, 'src/panel/index.js');
    paths.appBuild   = path.resolve(__dirname, 'build-panel');
}
// public/index.html 템플릿은 공용 그대로 사용 → 산출 파일명은 CRA 기본 index.html
```

```js
// static/ui/scripts/build-panel.js (신규) — Windows/CI 공통으로 env 를 안전하게 세팅
process.env.PANEL_BUILD = 'true';
require('child_process').spawnSync('npx', ['craco', 'build'], { stdio: 'inherit', shell: true });
```

```json
// static/ui/package.json scripts (변경분만)
"build":        "npm run build:app && npm run build:panel && npm run bundle:check && npm run bundle:check:panel",
"build:panel":  "node scripts/build-panel.js",
"bundle:check:panel": "node scripts/check-bundle-budget.js --dir build-panel --budget 300000"
```

`scripts/check-bundle-budget.js` 수정 — **argv 지원만 추가**(env·기본값 동작 불변, 초과는 계속 경고만):
`--dir` → `buildDir`, `--budget` → `budgetBytes`. 패널 참고선 300KB gzip 은 첫 측정 후 실측값+6% 로 조정.
패널도 `entry` 이름이 `main` 이므로 기존 `findMainEntrypoint` 정규식이 그대로 맞는다.

🔴 **CI 필수 변경** — `bitbucket-pipelines.yml` 의 Build step artifacts 에 패널 산출물을 추가하지 않으면
Deploy step(별도 컨테이너, 빌드 재실행 안 함)에서 `static/ui/build-panel` 이 없어 `forge deploy` 가 깨진다.
`develop`·`master` **두 브랜치 모두**:

```yaml
          artifacts:
            - static/ui/build/**
            - static/ui/build-panel/**      # 추가
```

`.gitignore` 에 `static/ui/build-panel` 추가. `manifest.yml`:

```yaml
resources:
  - key: main
    path: static/ui/build
  - key: issue-panel          # 신규
    path: static/ui/build-panel
  - key: images
    path: static/images
```

`package.json` 의 `"homepage": "."` 덕분에 에셋 경로가 상대라 새 resource 경로에서도 그대로 동작한다.

### 6-2. 패널 진입점과 초기화

```
static/ui/src/panel/
├── index.js                     진입점 (App.jsx 를 import 하지 않는다)
├── PanelApp.jsx                 초기화 게이트 + 라이선스 분기 + **모듈/폭 분기**
├── useIssuePanelData.js         데이터 조립 훅 (두 화면이 공유 — 쿼리·MM 환산·상태 판정)
├── IssueActivityPanel.jsx       주 화면 (활동 탭) — KPI + 진행률 + 입력 폼 + 최근 목록 + 링크
├── IssueContextSummary.jsx      요약 화면 (우측 사이드바) — KPI + 진행률 + 빠른 입력 + 링크
├── PanelKpi.jsx                 KPI 2타일 + 진행률 바 + ⓘ  (compact prop 으로 2모드)
├── PanelWorklogForm.jsx         입력 폼 (compact prop — 요약 화면은 코멘트 접힘 상태로 시작)
├── PanelRecentWorklogs.jsx      최근 워크로그 3~5건 + 내 것 ✎/🗑
├── PanelWorklogRowActions.jsx   행 인라인 수정/삭제 (확인 → mutation)
├── PanelOpenInAppLink.jsx       Workforce 딥링크
└── panelStates.js               상태 판정 순수 함수 (테스트 대상)
```

**모듈별 화면 분기** — `PanelApp.jsx` 가 `view.getContext().moduleKey` 로 고른다.
`moduleKey` 는 매니페스트의 모듈 `key` 이므로 상수로 고정한다(`panelStates.js`):

```js
export const PANEL_MODULE = { ACTIVITY: 'moves-rms-issue-activity', CONTEXT: 'moves-rms-issue-context' };
export const PANEL_NARROW_MAX = 560;
// moduleKey 를 못 읽었으면(컨텍스트 실패) 폭으로 판정 — 좁으면 요약, 넓으면 주 화면
export const resolvePanelSurface = ({ moduleKey, width }) =>
    moduleKey === PANEL_MODULE.CONTEXT ? 'summary'
  : moduleKey === PANEL_MODULE.ACTIVITY ? 'full'
  : (width ?? 0) <= PANEL_NARROW_MAX ? 'summary' : 'full';
```

`IssueActivityPanel` / `IssueContextSummary` 는 **같은 하위 컴포넌트를 다른 조합으로** 쓴다. 로직·쿼리·
환산·저장은 전부 `useIssuePanelData.js` 한 곳이므로 두 화면의 숫자가 갈릴 수 없다.

**`manifest.yml` 모듈 블록** (기존 `jira:globalPage` 아래에 추가):

```yaml
  # 이슈 화면 워크로그 패널 (RFC-202) — 활동 탭(주 화면) + 우측 컨텍스트(요약).
  # 두 모듈이 같은 resource 를 쓰고, 화면은 moduleKey 로 분기한다.
  # displayConditions: 우리 프로젝트에 연결된 이슈에만 노출(표식은 §3).
  jira:issueActivity:
    - key: moves-rms-issue-activity
      resource: issue-panel
      resolver:
        function: resolver
      title: Moves Workforce
      viewportSize: large
      displayConditions:
        entityPropertyEqualTo:
          entity: issue
          propertyKey: movesRmsLink
          objectName: linked
          value: "true"

  jira:issueContext:
    - key: moves-rms-issue-context
      resource: issue-panel
      resolver:
        function: resolver
      title: Moves Workforce
      label: Moves Workforce
      icon: resource:images;app.logo.png
      displayConditions:
        entityPropertyEqualTo:
          entity: issue
          propertyKey: movesRmsLink
          objectName: linked
          value: "true"
```

⚠ `jira:issueActivity` 에는 `label`·`icon` 프로퍼티가 **없다**(§0-1 (2) 문서 인용) — 넣으면 매니페스트
검증에서 걸린다. `resolver.function` 은 기존 `resolver`(index.handler)를 재사용한다 — 패널이 호출하는
resolver 가 전부 기존 함수이므로 신규 function 이 필요 없다.

`index.js` 계약 — **`src/index.js` 를 복사하지 않는다**:

```js
// ❌ top-level await 금지 (현행 src/index.js 는 Sentry 때문에 top-level await 를 쓴다 — 패널은 쓰지 않는다)
// ❌ Sentry 초기화 없음 — @sentry/react 를 패널 번들에 넣지 않는다(초기 페인트 비용 > 관측 이득)
import React from 'react';
import ReactDOM from 'react-dom';           // 루트는 앱과 동일한 legacy render 유지
import '@atlaskit/css-reset';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PanelApp from './PanelApp';
ReactDOM.render(
  <QueryClientProvider client={new QueryClient()}><PanelApp /></QueryClientProvider>,
  document.getElementById('root')
);
```

`PanelApp.jsx` 가 초기화하는 것 (앱 `App.jsx` 와 같은 함수·같은 경계):

| 대상 | 호출 | 위치 근거 | 패널에서 필요한가 |
|---|---|---|---|
| i18n | `useI18nStore(s=>s.init)` → `init()` | `App.jsx:53,59` | ✅ 필수 (모든 라벨) |
| 테마 | `view.theme.enable()` | `App.jsx:63` | ✅ 필수 (다크 모드) |
| 권한 | `usePermissionStore(s=>s.loadPermissions)` → `loadPermissions()` | `App.jsx:77,86` | ✅ — `canRead('PROJECT')` 로 딥링크 노출 판정 |
| 라이선스 | `useLicenseStore(s=>s.loadLicense)` → `loadLicense()` | `App.jsx:80,91` | ✅ — **INACTIVE 하나만 차단**(`licenseDecision.js` 경계 동일). UNAVAILABLE 은 통과 |
| Forge 컨텍스트 | `view.getContext()` → `useQuery(forgeContextKeys.current())`, `staleTime: Infinity` | `CopyPageLinkButton.jsx:34-39` | ✅ 필수 — `moduleKey`(화면 분기) · `extension.issue.key` · `accountId`(내 몫·내 워크로그) · `timezone`(started) · `siteUrl`+`localId`(딥링크). 🔴 **모듈 top-level await 금지**(§0-1 ⚠2) |
| 라우터 | `view.createHistory()` / `ForgeHistoryRouter` | `App.jsx:71` | ❌ `issueActivity`·`issueContext` 모두 미지원(§0-1) + 단일 화면 |
| `JobPollingManager`, `ToastFlags`, `AppLayout`, `TrialExpiryBanner` | — | — | ❌ 앱 셸 전용 |
| `ChunkErrorBoundary` | `components/error/ChunkErrorBoundary` | `App.jsx:112` | ✅ 재사용 (lazy 마크다운 에디터 청크 실패 대비) |

로딩 중에는 `components/skeleton/Skeleton.jsx` 의 `SkeletonText`/`SkeletonCards` 로 **패널 형상 그대로**
스켈레톤을 그린다(`PageSkeleton` 은 전체 페이지용이라 쓰지 않는다). 스피너는 쓰지 않는다(RFC-178).

🔴 `pages/myWork/**` 를 **어떤 형태로도 import 하지 않는다.** `WorklogModal.jsx:42` 는 모듈
top-level `await view.getContext()` 가 있어 import 하는 쪽이 async 모듈 그래프가 되고, JQL 이슈 검색·
`scheduleTypeOptions`·캘린더 의존성이 패널 번들로 끌려온다. 공유는 §6-4 의 추출 모듈로만 한다.

### 6-3. 데이터 조립 (쿼리키 팩토리)

신규 `static/ui/src/utils/queryKey/issuePanelKeys.js`:

```js
export const issuePanelKeys = {
    all: ['issuePanel'],
    issue:    (issueKey) => ['issuePanel', 'issue', issueKey],
    worklogs: (issueKey) => ['issuePanel', 'worklogs', issueKey],
};
```

🔴 `queryKeyContract.test.js` 가 런타임 소스의 인라인 `queryKey: [` 와
`invalidateQueries([` 를 금지한다 — 패널 코드도 **반드시** 팩토리를 쓴다.
기존 키는 그대로 재사용: `settingKeys.detail()`, `backofficeKeys.publicHolidays()`,
`jiraKeys.myPermissions(projectKey)`, `findProjectByIdQueryKeys(projectId)`.

| 훅 | 소스 | staleTime |
|---|---|---|
| `useQuery(issuePanelKeys.issue(key))` | `executeRequest('getIssue', …)` | 0 (패널 열 때마다 신선하게) |
| `useQuery(issuePanelKeys.worklogs(key))` | `executeRequest('getIssueWorklogs', …)` | 0 |
| `useQuery(settingKeys.detail())` | `invoke('getSettingData')` — **`{success:false}` 면 throw** (`useSalaryPolicy.js` 정석 형태를 따른다. 조용히 `undefined` 로 넘기는 절반의 관행은 따르지 않는다) | 10분 |
| `usePublicHolidayList()` | 기존 공용 훅 `utils/usePublicHolidayList.js` 그대로 | 30분 (훅 내부) |
| `useQuery(findProjectByIdQueryKeys(projectId))` | `invoke('findProjectById', {project_id})`, `enabled: !!projectId && canRead('PROJECT')`, `retry: false` | 60초 |

**저장 후 갱신** (생성·수정·삭제 **동일**): `issuePanelKeys.issue(key)` + `issuePanelKeys.worklogs(key)`
만 invalidate. 수정·삭제도 `fields.timespent` 를 바꾸므로 **두 키를 함께** 무효화해야 KPI 와 목록이
어긋나지 않는다(한쪽만 하면 "목록은 줄었는데 투입 공수는 그대로"가 된다).
`myWorkKeys.*`·`calendarKeys.all` 은 **건드리지 않는다** — 패널과 앱은 서로 다른 iframe 이라 캐시를
공유하지 않으므로 무효화해도 효과가 없고, 무효화 대상만 늘리면 오해를 만든다.
`fields.timespent` 는 Jira 가 워크로그 저장과 함께 갱신하므로 재조회로 즉시 반영된다
(JQL/search 인덱스 지연 함정은 여기 없다 — 단건 `GET /issue` 는 지연 대상이 아니다).

### 6-4. 워크로그 저장 로직 공용화

`WorklogModal.jsx`(826줄)에서 **패널이 필요한 부분만** 뽑는다. 기간 입력 모드·이슈 검색·휴가 제외는
myWork 전용이므로 **옮기지 않는다.**

신규 `static/ui/src/components/worklog/`:

| 파일 | 내용 (WorklogModal 원본 라인) | 성격 |
|---|---|---|
| `worklogAdf.js` | `loadMarkdownToAdf`, `loadAdfToMd` 동적 import + 모듈 promise 캐시 (L54-71) | 순수 이동 |
| `worklogWrite.js` | `ensureWorklogResult` (L74-81), `buildWorklogComment({commentLoad, markdown})` (L408-414), `createWorklog({issueKey, started, timeSpentSeconds, comment})` (L417-427), `updateWorklog({issueKey, worklogId, started, timeSpentSeconds, comment})` (L430-440), `deleteWorklog({issueKey, worklogId})` (L395) | 순수 함수 (React 무의존) |
| `useWorklogWrite.js` | `({ timezone })` → `{ create, update, remove, canEditWorklog, canDeleteWorklog, assertJiraPermission }`. 권한 체크는 기존 `fetchJiraProjectPermissions` + `projectKeyOfIssue` 재사용, 정책도 동일(**확정 `false` 만 차단, `null` 은 시도 허용**) (L350-354, L389-393) | 훅 |
| `adfLossy.js` | **신규 순수 모듈** — ADF 손실 노드 판정 (아래 계약) | 순수 함수 |
| `useWorklogComment.js` | `markdown`/`commentLoad`/`commentReloadKey` state + ADF→MD 로드 effect (L91-100, L174-195). `commentLoadState.js` 의 `COMMENT_LOAD`/`canSubmitWorklog`/`convertAdfComment` 재사용 + **`LOCKED` 판정**(`hasLossyAdfNodes`)을 변환 **이전에** 수행 | 훅 |
| `WorklogCommentField.jsx` | 코멘트 4분기 JSX — 스켈레톤 / 실패+재시도 / **잠금(평문 미리보기 + 안내)** / `LazyMarkdownEditor` (L790-815 확장) | 컴포넌트 |

**`components/worklog/adfLossy.js` 계약**

```js
// adf-to-md@1.2.1 index.js 의 _convert switch 분기에서 그대로 도출. 버전 올릴 때 이 상수를 함께 확인한다.
export const ADF_MD_SUPPORTED_NODES = new Set([
    'doc','text','paragraph','heading','hardBreak','inlineCard','blockCard','embedCard',
    'blockquote','bulletList','orderedList','listItem','codeBlock','rule','emoji',
    'table','tableRow','tableHeader','tableCell',
]);
export const ADF_MD_SUPPORTED_MARKS = new Set(['code','em','link','strike','strong']);
// 지원되지만 왕복에서 노드 타입이 바뀌는 것 — 잠그지 않고 경고만 한다
export const ADF_MD_DEGRADING_NODES = new Set(['inlineCard','blockCard','embedCard','emoji','table']);

/** @returns {{hard: string[], soft: string[], marks: string[], counts: Record<string, number>}} */
export const collectAdfLossyNodes = (adf) => {/* content 재귀 순회. 미지원 타입 → hard, DEGRADING → soft, 미지원 mark → marks */};

/** 편집을 잠글지 여부. HARD 손실이 하나라도 있으면 true. adf 가 없거나 객체가 아니면 false(잃을 게 없다). */
export const hasLossyAdfNodes = (adf) => collectAdfLossyNodes(adf).hard.length > 0;
```

- 순회는 `node.content` 재귀 + `node.marks` 검사. `type` 이 없는 노드는 **hard 로 센다**(fail-close).
- 🔴 판정은 **`adf-to-md` 를 로드하지 않고** 한다 — 순수 모듈이라 동적 import 실패와 무관하게 항상 동작하고,
  `LOCKED` 이면 애초에 변환을 시도하지 않으므로 청크를 내려받지 않는다(요약 화면 번들 이득).
- 교차 확인(선택): `convertAdfComment` 가 쓰는 `convert()` 는 `warnings: Set` 을 **이미 반환한다**
  (`adf-to-md` L131-140). 상수 집합과 실제 warnings 가 갈리면 라이브러리 버전이 바뀐 것이므로,
  `useWorklogComment` 는 `warnings` 에 노드 타입이 있으면(mark 만인 경우 제외) **`READY` 대신 `LOCKED`** 로
  강등한다 — 상수 갱신을 잊어도 데이터가 사라지지 않는 2중 안전망.
- 잠금 미리보기는 `pages/worklogExport/utils/adfToPlainText.js` 를 **그대로 재사용**한다(이미 `mention` 을
  `attrs.text` 로 살려낸다). 미디어는 텍스트가 없으므로 `counts` 를 이용해 "이미지 2 · 멘션 1" 배지를 덧붙인다.

**`commentLoadState.js`(`pages/myWork/modal/`) 수정** — 파일 위치는 그대로 두고 상태 하나를 추가한다:

```js
export const COMMENT_LOAD = {
    NONE: 'none', LOADING: 'loading', READY: 'ready', FAILED: 'failed',
    /** 기존 ADF 에 마크다운으로 표현 못 하는 노드(이미지·멘션 등)가 있다.
     *  본문 편집은 막고 **날짜·시간 수정은 허용**한다 — 저장 시 comment 를 보내지 않으므로 손실이 없다. */
    LOCKED: 'locked',
};
export function canSubmitWorklog(commentLoad) {
    return commentLoad === COMMENT_LOAD.NONE
        || commentLoad === COMMENT_LOAD.READY
        || commentLoad === COMMENT_LOAD.LOCKED;   // 화이트리스트에 포함 — 날짜/시간 수정을 막지 않는다
}
```

> `canSubmitWorklog` 는 **화이트리스트**라는 기존 설계 의도를 유지한다(새 상태의 기본값은 차단).
> `LOCKED` 를 명시적으로 추가하는 이유는 "본문을 못 읽었다"(`FAILED`)와 "본문을 일부러 안 건드린다"
> (`LOCKED`)가 **다른 사실**이기 때문이다. 전자는 저장하면 원본이 지워지고, 후자는 지워지지 않는다.
> 🔴 따라서 `worklogWrite.updateWorklog` 는 `commentLoad` 를 인자로 받아 `LOCKED` 일 때
> **`comment` 키를 본문에서 생략**해야 한다. 이 분기가 없으면 화이트리스트 추가가 곧 데이터 손실이 된다.

**마이워크 모달 동반 적용**: `WorklogModal` 도 같은 훅·같은 상태를 쓰므로 가드가 **자동으로 적용**된다.
이것은 부수효과가 아니라 목표다 — 같은 손실이 마이워크에도 있었다. 단, 마이워크의 저장 경로
(`updateWorklog` L430-440)가 `comment` 를 항상 보내므로 **같은 생략 분기를 통과시켜야** 한다.

- `commentLoadState.js`, `worklogTimeRange.js` 는 이미 순수 모듈이므로 **`pages/myWork/modal/` 에 그대로 두고 import** 한다(경로 이동은 무의미한 diff만 만든다). 패널은 `worklogTimeRange.js` 의
  `TIME_PRESET_OPTIONS`·`timeRangeSeconds`·`formatWorklogDuration`·`worklogStartInTimezone` 을 쓴다.
- `started` 포맷은 기존 `utils/TimeUtils.js` 의 `getTimeISOString(date, time, tz)` 를 그대로 쓴다
  (`ATLASSIAN_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSS+0000'`). 타임존은 `view.getContext().timezone`.
  **새 포맷 함수를 만들지 않는다.**
- `WorklogModal.jsx` 는 위 5개를 import 하도록만 바꾼다. **동작은 바이트 단위로 같아야 한다**
  — 회귀 검증: `__test__/commentLoadState.test.js`·`worklogTimeRange.test.js` 통과 + 수동 시나리오(§9).
- `coworkerFieldId` prop 은 destructure 만 되고 본문에서 쓰이지 않는 dead prop 이다. **이번엔 건드리지 않는다**(호출부 2곳 동시 수정은 범위 밖 회귀 위험).

- `deleteWorklog` 의 성공 판정은 `create`/`update` 와 **다르다**. `executeRequest` 는 204 를 `''` 로
  정규화하므로(`requestJira.js`) `ensureWorklogResult` 를 그대로 쓰면 빈 문자열이 실패로 오판된다.
  계약: `deleteWorklog` 는 결과가 `{success:false}` 인 경우에만 throw 하고, `''`/`undefined` 는 성공으로 본다.
  (`WorklogModal.jsx:395` 의 기존 삭제 경로도 같은 판정을 하도록 함께 정리 — **동작 변화 없음**, 판정의 근거만 한 곳으로.)
- `useWorklogWrite` 의 권한 노출: `canEditWorklog`/`canDeleteWorklog` 는
  `canEditOwnWorklogs`/`canDeleteOwnWorklogs` 의 **확정 `false` 만** `false` 로 내린다(`null` → `true` 취급).
  소유권(`author.accountId === me`)은 **별개 축**이며 컴포넌트가 판정한다 — 훅에 넣지 않는다
  (요약 화면은 목록이 없어 소유권 개념이 없다).

**패널이 쓰는 범위 (리더 결정 2026-09-22)**: 워크로그 **생성 + 내 것 수정·삭제**.
- 수정: 최근 워크로그 행의 ✎ → **행 인라인 편집**(날짜/시작/종료 + 코멘트). 모달을 띄우지 않는다
  (활동 탭 iframe 안에서 모달을 띄우면 Jira 본문 스크롤과 겹친다).
- 삭제: 🗑 → 같은 행에서 **인라인 확인**(`[삭제] [취소]`) 후 실행. `@atlaskit/modal-dialog` 를 쓰지 않는다
  (번들·중첩 iframe 비용 회피).
- 요약 화면(`issueContext`)에는 **목록이 없으므로 수정·삭제 UI 도 없다.** 빠른 입력(생성)만 제공하고,
  수정·삭제가 필요하면 활동 탭으로 안내한다.

**패널이 쓰지 않는 것**: 기간 입력 모드, `skipDates`/`getWorkingDateList`, `promiseOptions`(JQL 이슈 검색),
프로젝트/담당자/협업자 표시 Field, 기간 저장 롤백 로직, 타인 워크로그 수정·삭제.

### 6-5. 딥링크

부모 URL 은 iframe 에서 읽을 수 없으므로 Forge 컨텍스트로 조립한다. **기존 구현이 이미 있다** —
`components/layout/CopyPageLinkButton.jsx:20-29` 의 `parseIds`/`buildPageUrl`. 이 두 함수를
신규 `static/ui/src/utils/forgeAppUrl.js` 로 옮기고 `CopyPageLinkButton` 은 import 만 하게 바꾼다
(동작 불변, 테스트 추가).

```js
// static/ui/src/utils/forgeAppUrl.js
export const parseForgeIds = (localId) => {   // 'ari:cloud:ecosystem::extension/{appId}/{envId}/static/{key}'
    const m = /extension\/([0-9a-f-]{36})\/([0-9a-f-]{36})/i.exec(localId ?? '');
    return m ? { appId: m[1], envId: m[2] } : null;
};
export const buildAppUrl = (context, pathWithSearch) => {     // 신규 — 라우터 location 없이 문자열 경로로
    const ids = parseForgeIds(context?.localId);
    if (!context?.siteUrl || !ids || !pathWithSearch) return null;
    return `${context.siteUrl}/jira/apps/${ids.appId}/${ids.envId}${pathWithSearch}`;
};
export const buildPageUrl = (context, location) =>            // 기존 계약 유지 (CopyPageLinkButton)
    buildAppUrl(context, `${location.pathname}${location.search}`);
```

**확정 URL 형식** (실코드 확인: 탭 키는 `work` 가 아니라 `projectIssue`, 뷰 값은 `table`):

```
{siteUrl}/jira/apps/{appId}/{envId}/project/{projectId}?tab=projectIssue&view=table
```

| 근거 | 위치 |
|---|---|
| 앱 URL 형태 | `CopyPageLinkButton.jsx:28` |
| 경로 `/project/:id` | `App.jsx:133` |
| `?tab=` 이 활성 탭의 단일 진실 | `components/tabs/CommonTab.jsx:32` (`useUrlParam('tab')`) |
| 작업관리 탭 key = `projectIssue` | `constants/tabs.js:160` |
| `?view=` 이 뷰의 단일 진실, 값 `table\|tree\|gantt\|map` | `pages/projectDetail/work/ProjectWorkPanel.jsx:47,92` |

열기는 `import {router} from '@forge/bridge'; router.open(url)` (Custom UI iframe 은 `<a href>` 로 나갈 수 없다 —
`utils/useJiraSiteUrl.js:6` 주석, `components/issue/IssueComponent.js:25` 전례).

🔴 **이슈 강조 파라미터는 현재 라우터·작업관리 목록 뷰에 없다.** `useUrlParam` 은 `tab`/`view` 두 키만
쓰이고, `ProjectIssuePanel`(목록 뷰)의 필터는 자체 서버 JQL 상태라 URL 에 실리지 않는다.
→ 이번 설계는 **강조 없음**으로 확정하고, 이슈 키를 URL 에 싣는 것(`&issue=ABC-12`)은 **리더 질문 Q3**.

### 6-6. UI/UX 스펙

Atlaskit 네이티브 + RFC-178 공용 지점만 쓴다. 신규 시각 요소를 발명하지 않는다.

| 요소 | 재사용 대상 |
|---|---|
| KPI 타일 | `components/card/Summary.jsx` 의 `KpiTile({icon,label,value,valueColor})` |
| 진행률 바 | `pages/projectDetail/work/map/CardProgressBar.jsx` (`percent==null` → `-` 로 "모름" 표현, 색은 `accent` 주입) |
| 로딩 | `components/skeleton/Skeleton.jsx` — `SkeletonCards({count:2,height:72})` + `SkeletonText({lines:3})` |
| 마크다운 | `components/markdown/MarkdownEditorLazy.jsx` — `LazyMarkdownEditor`(자체 Suspense 내장), `MarkdownEditorSkeleton` |
| 날짜/시간 | `@atlaskit/datetime-picker` `DatePicker`/`TimePicker` + `worklogTimeRange.TIME_PRESET_OPTIONS` |
| 안내 | `@atlaskit/section-message` `SectionMessage` |
| 툴팁 | `@atlaskit/tooltip` — KPI 타일 2개에 **"MM은 이번 달 근무일 기준입니다"**(리더 결정 Q6). ⓘ 상세는 `pages/projectDetail/progress/InfoTip.jsx` 재사용 |
| 행 액션 | `@atlaskit/button/new` `IconButton` + `@atlaskit/icon/core/edit`·`delete`. **모달 없음** — 인라인 확장/확인 |
| 잠긴 코멘트 미리보기 | `pages/worklogExport/utils/adfToPlainText.js` 재사용 (mention 을 `attrs.text` 로 살린다) + `@atlaskit/badge` 로 손실 노드 개수 |
| 상태 배지 | `components/lozenge/StatusLozenge.jsx` (RFC-199 단일 진입점) |
| 사용자 | `@atlaskit/avatar` |
| 색 | 브랜드 틸 `#21ADAD` 스케일 — 진행률 바 `accent` 와 KPI `valueColor` 에만. ⚠ Atlaskit `Lozenge appearance="accent-*"` 는 Forge 에서 회색으로 조용히 강등되므로 커스텀 색은 `style` 로만 준다(RFC-199 교훈) |

**주 화면 — `jira:issueActivity` (활동 탭, 본문 전체 폭)**

```
┌───────────────────────────────────────────────────────────────────────┐
│  Moves Workforce            ┃ Alpha 구축 ┃          Workforce에서 열기 ↗│
├───────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────┐             │
│  │ ⏱ 계획 작업량            │  │ ▣ 투입 공수              │             │
│  │   0.45 MM               │  │   0.30 MM               │             │
│  │   9.0 MD · 72h          │  │   6.0 MD · 48h          │             │
│  └─────────────────────────┘  │   내 몫 0.10 MM (2.0 MD)│             │
│        ↑ 툴팁: MM은 이번 달   └─────────────────────────┘             │
│          근무일 기준입니다                                             │
│  진행률  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  67%                                    │
│  ⓘ 1MM = 20일(160h) · MD = 시간÷8h · MM = MD÷20 (이번 달 기준)        │
├───────────────────────────────────────────────────────────────────────┤
│  워크로그 기록                                                         │
│  날짜 [2026-09-22 ▾]   시작 [09:00 ▾]   종료 [18:00 ▾]      8h        │
│  코멘트                                                                │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │ (마크다운 에디터 — 클릭 시 lazy 로드)                             │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                              [ 되돌리기 ] [ 기록 ]     │
├───────────────────────────────────────────────────────────────────────┤
│  최근 워크로그                                          전체 12건       │
│  (아바타) 홍길동   09-22 09:00–18:00        8h          나    ✎  🗑   │
│  (아바타) 김철수   09-21 13:00–18:00        5h                        │
│  (아바타) 홍길동   09-20 09:00–12:00        3h          나    ✎  🗑   │
└───────────────────────────────────────────────────────────────────────┘
```

**행 인라인 편집 (✎) / 삭제 확인 (🗑)** — 모달 없이 같은 행이 펼쳐진다

```
│  (아바타) 홍길동  [2026-09-22 ▾] [09:00 ▾]~[18:00 ▾]  8h              │
│           코멘트 ┌──────────────────────────────────┐                 │
│                  └──────────────────────────────────┘                 │
│                                        [ 취소 ] [ 저장 ]               │
├───────────────────────────────────────────────────────────────────────┤
│  (아바타) 홍길동   09-20 09:00–12:00   3h                             │
│     이 워크로그를 삭제할까요?              [ 취소 ] [ 삭제 ]           │
```

**요약 화면 — `jira:issueContext` (우측 사이드바, 약 300px)** — 같은 하위 컴포넌트, `compact` 모드

```
┌─────────────────────────────┐
│ Alpha 구축        열기 ↗    │
├─────────────────────────────┤
│ 계획 0.45 MM   투입 0.30 MM │   ← KpiTile 2개를 한 줄에 압축(라벨 위/값 아래)
│ ▓▓▓▓▓▓▓▓▓░░░░░  67%         │
│ 내 몫 0.10 MM          ⓘ    │
├─────────────────────────────┤
│ [ + 워크로그 기록 ]          │   ← 누르면 아래 간이 폼이 펼쳐진다(기본 접힘)
│ ┌─────────────────────────┐ │
│ │ [2026-09-22 ▾]          │ │
│ │ [09:00 ▾] ~ [18:00 ▾] 8h│ │
│ │ 코멘트 ┌──────────────┐ │ │   ← 여기서만 마크다운 청크 lazy 로드
│ │        └──────────────┘ │ │
│ │              [ 기록 ]   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

요약 화면에는 **최근 워크로그 목록과 수정·삭제 UI 가 없다**(폭이 감당하지 못한다). 목록·수정·삭제는
활동 탭에서 한다 — 링크 아래 한 줄로 "자세히는 활동 탭에서" 안내(`issuePanel.summary.seeActivity`).

분기 기준은 `moduleKey` 가 1순위이고(§6-2 `resolvePanelSurface`), 컨텍스트를 못 읽었을 때만
**컨테이너 폭**으로 폴백한다(`window.innerWidth` — iframe 폭이 곧 컨테이너 폭이다).
`panelStates.js` 에 `PANEL_NARROW_MAX = 560` 상수로 둔다.

**상태 명세** (`panelStates.js` 의 순수 판정 함수 `resolvePanelState(input)` 이 단일 원천)

| 상태 | 판정 조건 | 화면 |
|---|---|---|
| `booting` | i18n/권한/라이선스 로드 중 | `SkeletonCards(2)` + `SkeletonText(3)` — 패널 형상 유지 |
| `licenseBlocked` | `useLicenseStore.isLicensed === false` (**INACTIVE 만**) | `SectionMessage appearance="warning"` + 라이선스 안내 1문장 (앱 `LicenseGuidePage` 를 끌어오지 않는다) |
| `loadingData` | 이슈/워크로그 쿼리 pending | KPI 영역만 스켈레톤, 폼은 비활성 렌더 |
| `notLinked` | `properties.movesRmsLink?.linked !== true` | "이 이슈는 Moves Workforce 프로젝트에 연결되지 않았습니다" + 안내 1줄. **displayConditions 가 정상 동작하면 도달하지 않는다**(백필 전 과도기·수동 추가 대비 안전망) |
| `denied` | `findProjectById` 가 `PERMISSION_PROJECT_SCOPE_DENIED` / `canRead('PROJECT') === false` | KPI·입력은 그대로, **프로젝트명과 딥링크만 숨김**. 권한 없음 전체 화면으로 덮지 않는다 |
| `timeTrackingOff` | 저장 시도가 `isTimeTrackingUnsupportedError(error)` → true | 입력 폼을 안내로 교체: "이 프로젝트는 시간 추적이 꺼져 있습니다" (`useJiraEditGuards.js` 의 **시도 기반** 판별만 쓴다 — editmeta 사전 판정은 폐기된 방식) |
| `noJiraPermission` | `fetchJiraProjectPermissions().canWorkOnIssues === false` (**확정 false 만**) | 기록 버튼 `isDisabled` + Tooltip "Jira 워크로그 권한이 없습니다". `null`(미확인)이면 **차단하지 않는다** |
| `saving` | 생성 mutation pending | 기록 버튼 `isLoading`, 입력 `isDisabled` |
| `saved` | 생성 mutation 성공 | 인라인 성공 메시지 2초 + KPI 즉시 갱신(§6-3), 폼은 날짜/시간 유지·코멘트만 초기화 |
| `saveError` | 생성 mutation 실패 (위 두 특수 케이스 제외) | `SectionMessage appearance="error"` + 원문 메시지 + [다시 시도] |

**수정·삭제 상태** (활동 탭 목록 전용 — 행 단위, 동시에 한 행만 열린다)

| 상태 | 판정 조건 | 화면 |
|---|---|---|
| `rowActionable` | `worklog.author.accountId === context.accountId` | 행 hover/focus 시 ✎ 🗑 노출. **타인 행에는 아이콘 자체가 없다** |
| `rowEditDisabled` | 내 행 && `canEditOwnWorklogs === false` (확정) | ✎ `isDisabled` + Tooltip `issuePanel.state.noEditPermission`. `null` 이면 활성 |
| `rowDeleteDisabled` | 내 행 && `canDeleteOwnWorklogs === false` (확정) | 🗑 `isDisabled` + Tooltip `issuePanel.state.noDeletePermission`. `null` 이면 활성 |
| `rowEditing` | ✎ 클릭 | 행이 인라인 편집 폼으로 펼쳐진다. 다른 행이 편집 중이면 **먼저 닫는다**(동시 편집 금지). 상단 생성 폼은 `isDisabled` |
| `rowCommentLoading` | `COMMENT_LOAD.LOADING` | 코멘트 자리에 `MarkdownEditorSkeleton`, [저장] `isDisabled` |
| `rowCommentFailed` | `COMMENT_LOAD.FAILED` | 코멘트 자리에 오류 + [다시 시도], **[저장] `isDisabled`** (본문을 못 읽은 채 저장하면 원본이 지워진다) |
| `rowCommentLocked` 🔴 | `COMMENT_LOAD.LOCKED` — `hasLossyAdfNodes(원본 ADF) === true` | 코멘트 자리를 **읽기 전용 평문 미리보기**(`adfToPlainText`)로 바꾸고 편집기를 띄우지 않는다. 미리보기 위에 `SectionMessage appearance="information"`: "이미지/멘션 등이 포함돼 본문은 Jira에서 수정하세요" + `이미지 2 · 멘션 1` 배지. **날짜·시간은 그대로 수정 가능**하고 [저장]도 활성 — 저장 시 `comment` 를 보내지 않는다(§2-C) |
| `rowCommentDegrading` | `soft`/`marks` 손실만 있음 (HARD 없음) | 편집 허용. 편집기 위에 `SectionMessage appearance="warning"` 1줄: "표·링크 카드·이모지 등의 표현이 단순해질 수 있습니다" |
| `rowSaving` | 수정 mutation pending | [저장] `isLoading`, 행 입력 `isDisabled` |
| `rowConfirmDelete` | 🗑 클릭 | 같은 행에 `[취소] [삭제]` 인라인 확인. `appearance="danger"` |
| `rowDeleting` | 삭제 mutation pending | [삭제] `isLoading` |
| `rowActionError` | 수정/삭제 실패 | 그 행 아래 인라인 오류 + [다시 시도]. **목록 전체를 오류로 덮지 않는다** |

성공 후: 편집/확인 상태를 닫고 §6-3 의 두 키를 invalidate → KPI·목록·내 몫이 함께 갱신된다.
낙관적 업데이트는 **하지 않는다** — `fields.timespent` 는 Jira 가 계산하므로 우리가 예측한 값과
어긋날 수 있다(재조회가 단일 진실).

숫자 표기 규칙: MM 소수 2자리, MD 소수 1자리, 시간 `formatWorklogDuration` 재사용.
**`null` 은 `0` 으로 표시하지 않는다** — 계획 미입력은 `-`, 진행률은 `-`(바 비움). `CardProgressBar` 의
기존 정책과 같다("0% 로 적으면 없는 사실을 만든다").

---

## 7. DB 설계

**변경 없음.**

| 저장소 | 판단 |
|---|---|
| MySQL (`src/rdb/`) | 신규 테이블·컬럼·마이그레이션 없음. 연결 표식은 Jira 이슈 프로퍼티가 저장소다 |
| KVS | 신규 엔티티 없음. 백필 진행률은 기존 `job` / `job_batch` / `job_fail` 엔티티 재사용 → `manifest.yml` 의 `storage.entities` **변경 없음** (KVS 속성 추가 시의 422 함정 회피) |

---

## 8. i18n 키 목록

`locales/kr/issuePanel.json` + `locales/en/issuePanel.json` 신규 → `cd static/ui && npm run merge`.
🔴 `locales/ko-KR.json`·`en-US.json` 직접 수정 금지. `locales/script/*.json` 은 빈 스텁이라 merge 소스가 아니다.

| 키 | kr | en |
|---|---|---|
| `issuePanel.title` | Moves Workforce | Moves Workforce |
| `issuePanel.kpi.planned` | 계획 작업량 | Planned effort |
| `issuePanel.kpi.spent` | 투입 공수 | Logged effort |
| `issuePanel.kpi.mine` | 내 몫 | My share |
| `issuePanel.kpi.progress` | 진행률 | Progress |
| `issuePanel.kpi.unit.mm` | MM | MM |
| `issuePanel.kpi.unit.md` | MD | MD |
| `issuePanel.kpi.none` | - | - |
| `issuePanel.kpi.info` | 1MM = {days}일({hours}h) · MD = 시간 ÷ {hourRate}h · MM = MD ÷ {days} (이번 달 기준) | 1MM = {days} days ({hours}h) · MD = hours ÷ {hourRate}h · MM = MD ÷ {days} (this month) |
| `issuePanel.kpi.monthTooltip` | MM은 이번 달 근무일 기준입니다. | MM is based on this month's working days. |
| `issuePanel.form.title` | 워크로그 기록 | Log work |
| `issuePanel.form.date` | 날짜 | Date |
| `issuePanel.form.startTime` | 시작 시간 | Start time |
| `issuePanel.form.endTime` | 종료 시간 | End time |
| `issuePanel.form.duration` | 소요 시간 | Duration |
| `issuePanel.form.comment` | 코멘트 | Comment |
| `issuePanel.form.submit` | 기록 | Log |
| `issuePanel.form.reset` | 되돌리기 | Reset |
| `issuePanel.form.retry` | 다시 시도 | Retry |
| `issuePanel.recent.title` | 최근 워크로그 | Recent worklogs |
| `issuePanel.recent.total` | 전체 {count}건 | {count} total |
| `issuePanel.recent.mine` | 나 | Me |
| `issuePanel.recent.empty` | 기록된 워크로그가 없습니다. | No worklogs yet. |
| `issuePanel.recent.approx` | 최근 {shown}건만 표시 — 내 몫은 근사치입니다. | Showing latest {shown} — my share is approximate. |
| `issuePanel.row.edit` | 수정 | Edit |
| `issuePanel.row.delete` | 삭제 | Delete |
| `issuePanel.row.save` | 저장 | Save |
| `issuePanel.row.cancel` | 취소 | Cancel |
| `issuePanel.row.confirmDelete` | 이 워크로그를 삭제할까요? | Delete this worklog? |
| `issuePanel.row.editError` | 워크로그를 수정하지 못했습니다. | Couldn't update the worklog. |
| `issuePanel.row.deleteError` | 워크로그를 삭제하지 못했습니다. | Couldn't delete the worklog. |

손실 ADF 가드 — **`worklog.*` 네임스페이스에 둔다**(마이워크 모달도 같은 키를 쓴다. 기존
`locales/kr|en/worklog.json` 에 추가):

| 키 | kr | en |
|---|---|---|
| `worklog.comment.locked.title` | 본문은 Jira에서 수정하세요 | Edit the text in Jira |
| `worklog.comment.locked.description` | 이미지·멘션 등 편집기가 다룰 수 없는 내용이 포함되어 있습니다. 날짜와 시간은 여기서 수정할 수 있고, 본문은 그대로 보존됩니다. | This comment contains images, mentions, or other content the editor can't handle. You can still change the date and time here — the text is kept as is. |
| `worklog.comment.locked.counts` | 이미지 {media} · 멘션 {mention} · 기타 {other} | Images {media} · Mentions {mention} · Other {other} |
| `worklog.comment.degrading` | 표·링크 카드·이모지 등의 표현이 단순해질 수 있습니다. | Tables, link cards, and emoji may be simplified. |
| `worklog.comment.locked.preview` | 본문 미리보기 | Text preview |
| `issuePanel.state.noEditPermission` | Jira 워크로그 수정 권한이 없습니다. | You don't have permission to edit worklogs in Jira. |
| `issuePanel.state.noDeletePermission` | Jira 워크로그 삭제 권한이 없습니다. | You don't have permission to delete worklogs in Jira. |
| `issuePanel.summary.logWork` | + 워크로그 기록 | + Log work |
| `issuePanel.summary.seeActivity` | 목록·수정은 활동 탭에서 | See and edit in the Activity tab |
| `issuePanel.link.open` | Workforce에서 열기 | Open in Workforce |
| `issuePanel.state.notLinked.title` | 연결된 프로젝트가 없습니다 | Not linked to a project |
| `issuePanel.state.notLinked.description` | 이 이슈는 Moves Workforce 프로젝트에 연결되지 않았습니다. 작업관리에서 프로젝트에 추가하면 여기에 공수가 표시됩니다. | This issue isn't linked to a Moves Workforce project. Add it to a project to see effort here. |
| `issuePanel.state.timeTrackingOff.title` | 시간 추적이 꺼져 있습니다 | Time tracking is off |
| `issuePanel.state.timeTrackingOff.description` | 이 Jira 프로젝트에서 시간 추적이 비활성화되어 워크로그를 기록할 수 없습니다. | Time tracking is disabled in this Jira project, so work can't be logged. |
| `issuePanel.state.noJiraPermission` | Jira 워크로그 기록 권한이 없습니다. | You don't have permission to log work in Jira. |
| `issuePanel.state.licenseBlocked` | Moves Workforce 라이선스가 활성 상태가 아닙니다. | The Moves Workforce license isn't active. |
| `issuePanel.state.saved` | 워크로그를 기록했습니다. | Work logged. |
| `issuePanel.state.saveError` | 워크로그를 기록하지 못했습니다. | Couldn't log work. |
| `issuePanel.state.loadError` | 이슈 정보를 불러오지 못했습니다. | Couldn't load issue data. |

백필 UI(백오피스 설정 카드):

| 키 | kr | en |
|---|---|---|
| `setting.issueLinkBackfill.title` | 이슈 패널 표식 백필 | Issue panel marker backfill |
| `setting.issueLinkBackfill.description` | 기존에 프로젝트에 연결된 이슈에 패널 노출 표식을 채웁니다. 1회만 실행하면 됩니다. | Fills the panel visibility marker on issues already linked to projects. Run once. |
| `setting.issueLinkBackfill.start` | 백필 실행 | Run backfill |
| `setting.issueLinkBackfill.running` | 진행 중 {processed}/{total} | In progress {processed}/{total} |
| `setting.issueLinkBackfill.done` | 완료 (실패 {failed}건) | Done ({failed} failed) |

---

## 9. 테스트 항목

### 9-1. 백엔드 (루트 `npm test`, jest)

| # | 대상 | 검증 |
|---|---|---|
| B1 | `ProjectLinkWriter.writeProjectLink` | 필드 write 1회 + 이슈 수만큼 표식 write. 반환 `{fieldWritten, markerWritten, markerFailed}` |
| B2 | `ProjectLinkWriter` — 표식 write 실패 | **throw 하지 않고** `markerFailed` 에 누적, `fieldWritten` 은 그대로 (연결이 표식 때문에 실패하지 않는다) |
| B3 | `ProjectLinkWriter.clearProjectLink` | 필드 `''` + 표식 DELETE. DELETE 404 는 성공 취급 |
| B4 | `IssueLinkPropertyApi.writeIssueLink` | 본문이 정확히 `{linked:true, projectId:'<string>'}` (숫자 id 도 문자열화) |
| B5 | `IssueLinkPropertyApi.bulkSetIssueLink` | `filter.entityIds` 에 id 배열, 10,000건 초과 시 분할, 303 을 성공으로 취급 |
| B6 | `IssueLinkPropertyApi` 권한 인자 | `as='app'` 기본, 잘못된 값은 `ForgeAPIError('Invalid Jira authority')` |
| B7 | **연결 경로 전수 회귀** (L1~L5) | 각 서비스/트리거/컨슈머가 `writeProjectLink` 를 호출한다 (mock spy). **경로 하나라도 빠지면 실패** |
| B8 | `deleteProjectIssueService` (U1) | `clearProjectLink` 호출 |
| B9 | `ProjectDeletionService.unlinkOneBatch` (U2) | `movesRms` 와 `movesRmsLink` **둘 다** 삭제, 체크포인트 멱등성 유지 |
| B10 | `deleteProjectSubscriptionService` (U3) | 표식을 **지우지 않는다**(현행 정책 유지 확인) |
| B11 | `updateProjectIdFieldService` coworker 분기 | coworkerField write 는 표식을 쓰지 않는다 |
| B12 | `IssueLinkBackfillService` | 프로젝트 수만큼 큐 push, `job` 레코드 생성, `{jobId, projectCount}` 반환 |
| B13 | `test/permission/permissionMap.contract.test.js` | 신규 resolver 2개가 `PERMISSION_MAP` 에 등재 (기존 계약 테스트가 자동 검출) |

### 9-2. 프론트엔드 (`cd static/ui && npm test`, jest)

| # | 대상 | 검증 |
|---|---|---|
| F1 | `utils/effort.js` | `secondsToMd(28800, 8) === 1`, `hourRate` 0/null → 8 폴백, `mdToMm(9, 20) === 0.45`, `monthMm<=0` → `null` |
| F2 | `utils/effort.js` ↔ 기존 인라인 식 | `WorkloadCell.jsx:36` 패턴과 같은 입력에 같은 출력(자리수 포함) — **새 산식이 아님을 고정** |
| F3 | `utils/forgeAppUrl.js` | `parseForgeIds` ARI 파싱, `siteUrl`/`localId` 결손 시 `null`, `buildAppUrl` 조립 결과 |
| F4 | `utils/forgeAppUrl.js` — 기존 계약 | `buildPageUrl(context, location)` 결과가 `CopyPageLinkButton` 기존 동작과 동일 (회귀 방지) |
| F5 | `panel/panelStates.js` | 상태 우선순위 — `licenseBlocked > notLinked > denied > noJiraPermission`. 조합 입력 테이블 |
| F6 | `panel/panelStates.js` — fail-open 경계 | `canWorkOnIssues`/`canEditOwnWorklogs`/`canDeleteOwnWorklogs` 가 `null` 이면 차단하지 않고 `false` 만 차단. 라이선스 `UNAVAILABLE` 은 통과 |
| F7 | 딥링크 URL | `/project/3?tab=projectIssue&view=table` 문자열 일치 (탭 키·뷰 값 오타 고정) |
| F8 | `components/worklog/worklogWrite.js` | `createWorklog` 가 `executeRequest('addWorklog', {started,timeSpentSeconds,comment}, {issueIdOrKey})` 를 정확히 호출. `{success:false}` → throw 승격 |
| F8a | `worklogWrite.updateWorklog` | `executeRequest('updateWorklog', {started,timeSpentSeconds,comment}, {issueIdOrKey, id})` 정확 호출. **`adjustEstimate` 를 넘기지 않는다**(기본값 유지) |
| F8b | `worklogWrite.deleteWorklog` | `executeRequest('deleteWorklog', …, {issueIdOrKey, id})` 호출 + **204→`''` 를 성공으로 판정**, `{success:false}` 만 throw |
| F8c | `panel/panelStates.js` — 행 액션 | 타인 워크로그(`author.accountId !== me`)에는 `rowActionable === false` → ✎/🗑 미노출. 권한 확정 `false` 면 `isDisabled`, `null` 이면 활성 |
| F8d | `resolvePanelSurface` | `moduleKey` 1순위(`…-issue-context`→summary, `…-issue-activity`→full), `moduleKey` 부재 시 폭 폴백(`<=560`→summary) |
| F8e | `components/worklog/adfLossy.js` — **손실 노드 판정 표** | 입력 ADF → 기대 `hard/soft/marks`. 케이스: ① `mediaSingle>media` → hard ② `mention` → hard ③ `panel`/`expand`/`status`/`date`/`taskList`/`decisionList`/`extension` 각각 → hard ④ `table>tableRow>tableCell>paragraph>text` → **hard 없음**, soft=`table` ⑤ `inlineCard`/`blockCard`/`embedCard` → soft ⑥ `emoji` → soft ⑦ `text` + `marks:[{type:'underline'}]` → marks 만 ⑧ 순수 문단/목록/코드블록/인용/heading/rule/hardBreak → 전부 빈 결과 ⑨ `type` 없는 노드 → **hard**(fail-close) ⑩ `null`/문자열/비객체 → `hasLossyAdfNodes === false` |
| F8f | `adfLossy.js` ↔ 라이브러리 동기 | `ADF_MD_SUPPORTED_NODES` 가 `node_modules/adf-to-md/index.js` 의 `_convert` 분기 집합과 일치. **소스를 읽어 대조**하는 테스트(버전 업 시 자동 실패 → 상수 갱신 강제). 같은 방식으로 `ADF_MD_SUPPORTED_MARKS` ↔ `_convertMarks` |
| F8g | `LOCKED` 저장 시 `comment` 생략 🔴 | `updateWorklog({..., commentLoad: COMMENT_LOAD.LOCKED})` 가 `executeRequest('updateWorklog', body, …)` 를 호출할 때 **`body` 에 `comment` 키가 없다**(`expect(body).not.toHaveProperty('comment')`). `READY`/`NONE` 이면 **있다** |
| F8h | `canSubmitWorklog` 화이트리스트 | `NONE`/`READY`/`LOCKED` → true, `LOADING`/`FAILED`/미지의 신규 값 → false (기본 차단 유지) |
| F8i | `useWorklogComment` — warnings 강등 | `convert()` 가 노드 타입 warning 을 주면 `READY` 대신 `LOCKED`. mark 만 있는 warning 은 `READY` 유지 |
| F9 | `components/worklog/useWorklogComment.js` | ADF→MD 로드 상태기계(`COMMENT_LOAD`) 전이 — `LOADING→READY`/`→FAILED`/`→LOCKED`, 실패 시 재시도. `LOCKED` 이면 **동적 import 를 시도하지 않는다**(mock 호출 0회) |
| F10 | `pages/myWork/modal/__test__/*` 기존 3종 | **전부 통과** (추출 후 회귀 없음) |
| F11 | `utils/queryKey/queryKeyContract.test.js` | 패널 신규 코드에 인라인 쿼리키 없음 (기존 계약 테스트가 자동 검출) |
| F12 | `utils/queryKey/queryKeyFactories.test.js` | `issuePanelKeys` 팩토리 형태 검사 |
| F13 | 워크로그 "내 몫" 집계 | `worklogs[]` 중 `author.accountId === me` 만 합산. `total > 조회건수` 면 근사 플래그 |
| F14 | 번들 예산 | `npm run build` 후 `build-panel/asset-manifest.json` 존재 + main gzip 측정치 출력 (경고만, 게이트 아님) |

### 9-3. 수동 / 배포 검증 (E2E — 자동화 불가)

| # | 항목 |
|---|---|
| E1 | **V1**: `displayConditions.entityPropertyEqualTo` + `objectName` 이 **미선언 프로퍼티**에서 동작하는가 (동작 안 하면 §3-3 블록 추가) |
| E2 | **V2**: bulk set 이 asApp 으로 303 을 주는가, bulk delete 스펙 |
| E2a | **V3** 🔴: `PUT /rest/api/3/issue/{key}/worklog/{id}` 에서 `comment` **생략** 시 기존 코멘트가 보존되는가. 절차: 이미지+멘션이 든 코멘트로 워크로그 생성(Jira 기본 UI) → 패널에서 시간만 수정 → Jira 에서 이미지·멘션이 그대로인지 확인. **지워지면** §2-C 폴백(원본 ADF 되돌려 보내기)으로 전환 |
| E3 | 연결된 이슈에만 패널이 보이는가 / 제외 후 사라지는가 / 프로젝트 삭제 후 사라지는가 |
| E4 | **팀 관리형 프로젝트** 이슈에서 projectId 를 프로퍼티로 읽어 딥링크가 정상인가 |
| E5 | 시간 추적이 꺼진 팀 관리형 프로젝트에서 안내가 뜨는가 (400 본문 `timetracking`) |
| E6 | 다크 모드 (`view.theme.enable()`), 요약 모드 레이아웃 |
| E7 | `myWork` 워크로그 모달 회귀 — 단일/기간 입력, 코멘트 로드/수정, 삭제, 롤백 |
| E8 | 백필 잡 실행 후 기존 이슈에 패널이 뜨는가 |
| E9 | **활동 탭**: 탭을 처음 누를 때 스켈레톤 → 데이터, `view.getContext()` 지연으로 빈 화면이 남지 않는가. **구 이슈 화면에서는 탭이 없다**(문서 명시)는 점 확인 |
| E10 | **우측 컨텍스트**: 접힘 상태에서 펼칠 때 동작, 300px 폭에서 KPI·진행률·빠른 입력이 깨지지 않는가, 두 모듈이 같은 숫자를 보여주는가 |
| E11 | 내 워크로그 **수정** — 시간 변경 후 KPI(투입 공수·내 몫·진행률)가 함께 갱신되는가. `adjustEstimate` 기본값으로 잔여 추정치가 Jira 기본 UI 와 같게 움직이는가 |
| E12 | 내 워크로그 **삭제** — 204 응답을 성공으로 처리하는가, 목록·KPI 동시 갱신, 타인 워크로그에는 아이콘이 없는가 |

---

## 10. 구현 작업 분해

### 10-A. backend-engineer

- [ ] A1. `src/api/jira/issue/IssueLinkPropertyApi.js` 신규 — §4-5 시그니처. `IssuePropertyApi.js` 는 건드리지 않는다
- [ ] A2. `src/utils/errors/ErrorCodes.js` — `ISSUE_LINK_PROPERTY_WRITE`, `ISSUE_LINK_BULK` 추가
- [ ] A3. `src/api/jira/field/ProjectLinkWriter.js` 신규 — §4-4. `p-limit` 동시 5
- [ ] A4. 연결 6경로 교체 — L1 `ProjectUsersService.updateProjectIdFieldService`(projectIdField 분기만), L2 `SubscriptionSweeper.applyTagging`, L3 `SubscriptionBackfill.enqueueSubscriptionBackfill`, L4 `queue/consumer.backfillSubscription`, L5 `trigger/onIssueCreated`
- [ ] A5. 해제 교체 — U1 `ProjectUsersService.deleteProjectIssueService` → `clearProjectLink`
- [ ] A6. U2 `ProjectDeletionService.unlinkOneBatch` — `deleteIssueLink(id,'app')` 를 `property_cleared_at` 체크포인트 안에 추가
- [ ] A7. U3 `deleteProjectSubscriptionService` — **변경하지 않는다**(정책 확인 주석만)
- [ ] A8. `src/resolver/backoffice/setting/IssueLinkBackfillService.js` 신규 + `SettingController.js` 에 `guardedDefine` 2건
- [ ] A9. `src/permission/PermissionMap.js` — `backfillIssueLinkMarkers: W('SETTINGS')`, `getIssueLinkBackfillStatus: R('SETTINGS')` (Setting 섹션에)
- [ ] A10. `src/queue/consumer.js` — `backfillIssueLinks` consumer (JQL 페이징 → `bulkSetIssueLink`)
- [ ] A11. `manifest.yml` — `consumer`/`function` 블록에 백필 큐 등록
- [ ] A12. 테스트 B1~B13
- [ ] A13. `npm test` (루트) 전체 통과 확인

### 10-B. frontend-engineer (backend 완료 후)

- [ ] F0. `static/ui/src/utils/effort.js` 신규 (§2-D). **`workday.js` 에 넣지 않는다**
- [ ] F1. `static/ui/src/utils/forgeAppUrl.js` 신규 + `CopyPageLinkButton.jsx` 를 import 로 교체(동작 불변)
- [ ] F2. `static/ui/src/components/worklog/` **6개 파일** 추출/신규 (§6-4: `worklogAdf.js`, `worklogWrite.js`, `useWorklogWrite.js`, `adfLossy.js`, `useWorklogComment.js`, `WorklogCommentField.jsx`) + `WorklogModal.jsx` import 교체
- [ ] F2a. `pages/myWork/modal/commentLoadState.js` — `COMMENT_LOAD.LOCKED` 추가 + `canSubmitWorklog` 화이트리스트 확장 (§6-4)
- [ ] F2b. `worklogWrite.updateWorklog` — `commentLoad === LOCKED` 이면 요청 본문에서 `comment` **생략** (§2-C). 🔴 F2a 와 **반드시 같은 커밋**에 — 화이트리스트만 넓히면 데이터 손실이 된다
- [ ] F3. `static/ui/src/utils/queryKey/issuePanelKeys.js` 신규
- [ ] F4. `static/ui/src/panel/` **11개 파일** (§6-2) — 진입점·초기화·데이터 훅·활동 탭 화면·요약 화면·KPI·폼·최근 목록·행 액션·링크·상태
- [ ] F5. 빌드 배관 — `craco.config.js` paths 분기, `scripts/build-panel.js`, `package.json` scripts, `scripts/check-bundle-budget.js` argv, `.gitignore`
- [ ] F6. `manifest.yml` — `resources.issue-panel` + `jira:issueActivity` + `jira:issueContext` 모듈(같은 resource) + 각각 `displayConditions`. ⚠ `issueActivity` 에 `label`/`icon` 을 넣지 않는다
- [ ] F7. `locales/kr|en/issuePanel.json` 신규 + `locales/kr|en/worklog.json` 에 손실 가드 키 추가 + 백오피스 백필 키 → `npm run merge`
- [ ] F8. `bitbucket-pipelines.yml` — develop·master 두 Build step artifacts 에 `static/ui/build-panel/**`
- [ ] F9. 백오피스 설정 카드에 백필 버튼 + 진행률 (`EtcSetting.jsx` 하단, 최소 UI)
- [ ] F10. 테스트 F1~F14
- [ ] F11. `CI=true npm run build` 로 CI 동일 조건 확인 (로컬만 통과하는 상황 방지)

### 10-C. integration-verifier

- [ ] V1. §2 경계면 계약 표 ↔ 실제 구현 교차 비교 (resolver 2건 + Jira 직접 호출 4건)
- [ ] V2. **같은 데이터 다중 경로** — §4 전수표의 9개 지점이 모두 `ProjectLinkWriter`/`deleteIssueLink` 를 통과하는지 `grep setAppFieldValueForIssues` 로 재확인
- [ ] V3. **읽기↔쓰기 대칭** — 표식 write 하는 모든 경로에 대응하는 clear 경로가 있는지 (U3 는 의도적 예외)
- [ ] V4. **서비스 내부 소비자** — `setAppFieldValueForIssues` 를 `src/` 전역 grep 해 교체 누락/오교체(coworker 경로) 확인
- [ ] V5. **다중 shape 재사용 컴포넌트** — `KpiTile`·`CardProgressBar` 에 넘기는 값의 `null` 의미가 기존 소비처와 같은지 (`?? 0` 로 결함을 삼키지 않는지). `PanelKpi`/`PanelWorklogForm` 이 `compact` 두 모드에서 같은 값을 받는지(활동 탭 ↔ 요약 화면 숫자 불일치 방지)
- [ ] V5a. **손실 ADF 가드 대칭** 🔴 — `comment` 를 보내는 **모든 수정 경로**가 `commentLoad` 분기를 통과하는지. `grep "'updateWorklog'"` 로 호출부 전수 확인(패널 + 마이워크 모달). 한 경로만 막으면 다른 경로로 이미지가 사라진다
- [ ] V5b. `canSubmitWorklog` 화이트리스트 확장과 `comment` 생략 분기가 **같은 커밋**에 들어갔는지
- [ ] V6. i18n 누락 — 패널 코드의 문자열 리터럴 전수 확인 + merge 산출물에 키 존재
- [ ] V7. 성능 — 공통 워크로그 페치 경로 미수정 확인, 패널이 프로젝트 단위 대량 조회를 하지 않음
- [ ] V8. `npm test`(루트) + `cd static/ui && npm test` + `CI=true npm run build`

---

## 11. 남은 가정 (결정 불필요 — 설계자 판단)

| # | 가정 | 근거 |
|---|---|---|
| G1 | Sentry 를 패널에 넣지 않는다 | 초기 페인트 비용 > 관측 이득. `console.error` 는 브라우저에 남는다 |
| G2 | 앱 권한(`usePermissionStore`)은 **딥링크 노출 판정에만** 쓴다. KPI·입력은 Jira 권한으로 게이팅 | 이슈를 볼 수 있는 사람은 그 이슈의 공수를 볼 수 있다(Jira 가 이미 `timespent` 를 보여준다) |
| G3 | 수정·삭제 UI 는 **모달 없이 행 인라인** | 활동 탭 iframe 안의 모달은 Jira 본문 스크롤과 겹친다. `@atlaskit/modal-dialog` 번들 회피 |
| G4 | 요약 화면(`issueContext`)에는 최근 워크로그 목록·수정·삭제가 **없다** | 300px 폭이 감당하지 못한다. 활동 탭으로 안내 |
| G5 | 잠금 판정은 **HARD 손실만** (SOFT 는 경고만) | 표·이모지·링크 카드로 잠그면 평범한 코멘트 상당수가 편집 불가가 된다. 내용은 남는다 |
| G6 | 낙관적 업데이트를 하지 않는다 | `fields.timespent` 는 Jira 가 계산한다 — 재조회가 단일 진실 |

---

## 12. 결정 기록 (리더 회신 2026-09-22)

| # | 질문 | **결정** | 설계 반영 절 |
|---|---|---|---|
| Q1 | 모듈 선택 (issuePanel 자동 노출 불가) | **`jira:issuePanel` 제외.** `jira:issueActivity`(활동 탭, 본문 전체 폭 = **주 화면**: KPI 2타일 + 진행률 바 + 입력 폼 + 최근 워크로그 목록 + 링크) + `jira:issueContext`(우측 사이드바 = **요약**: KPI + 진행률 바 + 빠른 입력 + 링크) **둘 다 선언**, 같은 `resource`. 폭 기준 2모드 레이아웃 유지 | §0-1, §1-2, §6-2, §6-6, §9-2 F8d, §9-3 E9·E10, §10-B F4·F6 |
| Q2 | 연결 표식 키 | **신규 키 `movesRmsLink` 승인** | §3(변경 없음 — 백엔드 구현 중) |
| Q3 | 이슈 강조 파라미터 | **없음** (현행 유지) | §6-5 (변경 없음) |
| Q4 | 워크로그 수정·삭제 | **생성 + 내 것 수정·삭제.** 최근 워크로그 목록에서 `author.accountId === 현재 사용자` 인 항목만 ✎/🗑 노출. `PUT`/`DELETE /rest/api/3/issue/{key}/worklog/{id}` 를 프론트 `requestJira`(`executeRequest`)로 호출. 공용 훅 `useWorklogWrite` 에 `update`/`remove` 추가. **삭제 `adjustEstimate` 는 기본값 유지**(넘기지 않는다) | §2-C, §6-3, §6-4, §6-6, §8, §9-2 F8a·F8b·F8c, §9-3 E11·E12 |
| Q5 | 기존 설치 백필 UI | **범위 포함** — 백오피스 설정 카드 + 큐 잡 | §5-2, §8, §10-A A8·A10, §10-B F9 (변경 없음) |
| Q6 | MM 기준 월 | **현재 월 고정.** KPI 타일 툴팁에 "MM은 이번 달 근무일 기준입니다" 표기 | §2-D, §6-6(툴팁 행·와이어프레임), §8 `issuePanel.kpi.monthTooltip` |
| **Q7** | 손실 ADF (추가 결정) | **손실 ADF 가드 도입.** 기존 코멘트에 마크다운으로 표현 못 하는 노드(이미지·멘션 등)가 있으면 코멘트 편집을 **잠그고**(`COMMENT_LOAD.LOCKED`) 평문 미리보기 + 안내를 보여준다. 날짜·시간 수정은 허용하고, 저장 시 `comment` 를 **요청 본문에서 생략**해 Jira 가 원본을 보존하게 한다. 가드는 공용 훅에 두어 **마이워크 모달에도 함께 적용**된다. 손실 노드 집합은 `adf-to-md@1.2.1` 실소스에서 도출한 지원 집합의 **보집합**으로 정의(열거 금지) | §2-C(손실 ADF 가드), §6-4(`adfLossy.js`·`LOCKED`), §6-6(`rowCommentLocked`·`rowCommentDegrading`), §8(`worklog.comment.*`), §9-2 F8e~F8i·F9, §9-3 E2a(V3), §10-B F2·F2a·F2b, §10-C V5a·V5b |

### 결정에 따라 폐기된 설계

- `jira:issuePanel` 블록, `allowMultiple`, "사용자가 패널을 추가한다" 전제의 안내 문구 — **전부 삭제.**
- "패널은 단일 워크로그 생성만 한다"(구 G4) — Q4 로 대체.
- "모듈 중립 / 어느 쪽으로 결정돼도 재작업 0" 서술 — 결정이 났으므로 **두 모듈 구성으로 확정**했다.
  다만 화면 분기(`resolvePanelSurface`)는 `moduleKey` 1순위 + 폭 폴백을 유지한다 — 폭 폴백이 있어야
  컨텍스트 조회가 실패해도 빈 화면이 되지 않는다.

### 배포 전에 반드시 실측할 것 (설계로 못 닫은 것)

| # | 항목 | 실패 시 폴백 | 절 |
|---|---|---|---|
| V1 | `displayConditions.entityPropertyEqualTo` + `objectName` 이 **미선언 프로퍼티**에서 평가되는가 | `jira:entityProperty` 에 `movesRmsLink` 선언 추가 | §3-3, §9-3 E1 |
| V2 | bulk set issue property 가 asApp 으로 303 을 주는가 / bulk delete 스펙 | 백필을 이슈 단건 PUT 으로 (느리지만 동작) | §0-3, §9-3 E2 |
| V3 🔴 | `PUT .../worklog/{id}` 에서 `comment` **생략** 시 기존 코멘트가 보존되는가 | 원본 ADF 를 `comment` 에 그대로 되돌려 보낸다(캐시에 이미 있어 추가 왕복 0) | §2-C, §9-3 E2a |
| V4 | `jira:issueActivity` 가 **구 이슈 화면**에서 탭이 없다는 문서 기술의 실제 영향 범위 | 요약(`issueContext`)이 폴백 진입점 역할을 한다 | §0-1 (2), §9-3 E9 |
