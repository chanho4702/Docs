# RFC-202 통합 정합성 검증 리포트 — 이슈 워크로그 패널

검증: 2026-09-22 (integration-verifier). worktree `.claude/worktrees/RFC-202` (모든 경로는 이 루트 기준, 코드 수정 없음)
기준: `01_architect_design.md` (§0/§2/§4/§10-C/§12) ↔ `02_backend_report.md` ↔ `02_frontend_report.md` ↔ 실제 소스

**요약: 통과 24 / 실패 2 / 관찰(저위험) 4 / 미검증 11**

---

## 0. 실행 결과 (실측)

| 대상 | 명령 | 결과 |
|---|---|---|
| 백엔드 jest | `npx jest --testPathIgnorePatterns static` | ✅ **123 suites / 1649 tests 통과** (39.3s) |
| 프론트 jest | `cd static/ui && npx jest` | ✅ **122 suites / 1975 tests 통과**, snapshot 1 (39.8s) |
| CI 동일 빌드 | `cd static/ui && CI=true npm run build` | ✅ exit 0 — `build:app` → `build:panel` → `bundle:check` → `bundle:check:panel` |
| main 번들 | — | `main.e16fc227.js` raw 1,776,732 / **gzip 481,157** (예산 950,000) |
| panel 번들 | — | `main.aada683b.js` raw 1,256,224 / **gzip 329,108** (예산 350,000) |
| `forge lint` | `npx forge lint` (CLI 13.4.0) | ✅ **No issues found** — 단 `Warning: Could not perform some linting actions for PermissionLinter due to unhandled error "Unknown product"` (환경 기인, 이번 변경과 무관) |

리포트의 수치(481,157 / 329,108 / 1649 / 1975)는 **전부 재현됐다.**

---

## 1. 🔴 실패 (2건) — 수정 필요

### F-1. CI 파이프라인에 패널 산출물 artifact 누락 → **배포가 깨진다**

- 위치: `bitbucket-pipelines.yml:30-31` (develop) · `bitbucket-pipelines.yml:63-64` (master)
- 현재 값 (두 곳 동일):
  ```yaml
          artifacts:
            - static/ui/build/**
  ```
- 불일치: `manifest.yml:204-205` 가 `resources.issue-panel: static/ui/build-panel` 를 선언했고,
  `static/ui/.gitignore` 에 `/build-panel` 이 추가돼 **산출물이 리포에 없다.** Build step 은
  `npm run build`(=`build:app && build:panel`)로 만들지만 **artifacts 에 없으므로 Deploy step(별도 컨테이너,
  빌드 재실행 없음)에는 전달되지 않는다** → `forge deploy` 가 없는 경로를 참조한다.
- 담당: 리더/frontend (프론트 리포트 §9 에 이미 기록됨 — 지시대로 미적용). **필요한 정확한 diff:**
  ```diff
  @@ bitbucket-pipelines.yml:30 (develop 브랜치 Build step)
             artifacts:
               - static/ui/build/**
  +            - static/ui/build-panel/**
  @@ bitbucket-pipelines.yml:63 (master 브랜치 Build step)
             artifacts:
               - static/ui/build/**
  +            - static/ui/build-panel/**
  ```
  `script` 블록은 변경 불필요(`npm run build` 가 이미 `build:panel` 포함).

### F-2. 공용 컴포넌트가 `issuePanel` 네임스페이스 키를 써서 **마이워크 모달에 엉뚱한 문구가 뜬다**

- 위치: `static/ui/src/components/worklog/WorklogCommentField.jsx:89`
  ```jsx
  {preview || t('issuePanel.recent.empty')}
  ```
- 불일치: 이 분기는 **잠긴(LOCKED) 코멘트 본문 미리보기가 빈 경우**의 대체 문구인데,
  `issuePanel.recent.empty` 의 값은 `"기록된 워크로그가 없습니다."` / `"No worklogs yet."` 다
  (`locales/ko-KR.json` · `en-US.json` 의 `issuePanel.recent.empty` 실측). 즉 **워크로그 코멘트 미리보기
  칸에 "워크로그가 없습니다"가 렌더된다.** `WorklogCommentField` 는 `pages/myWork/modal/WorklogModal.jsx:744`
  에서도 쓰이므로 **이슈 패널과 무관한 마이워크 모달**에서도 같은 문구가 나온다.
- 부수 증거(경계 오염): 이 한 줄이 **main 앱 번들에 `issuePanel.` 문자열이 들어간 유일한 원인**이다 —
  `build/static/js/main.e16fc227.js` 에서 `issuePanel.` 1건, 그 문맥이 정확히 `y("issuePanel.recent.empty")` 다
  (`issuePanel.state.loadError` · `movesRmsLink` 는 main 에 0건 = 패널 코드 자체는 main 에 없다).
- 수정 방법:
  1. `locales/kr/worklog.json` · `locales/en/worklog.json` 의 `comment.locked` 아래에
     `emptyPreview` 추가 (예: `"본문이 비어 있습니다."` / `"The comment body is empty."`)
  2. `WorklogCommentField.jsx:89` → `{preview || t('worklog.comment.locked.emptyPreview')}`
  3. `cd static/ui && npm run merge`
- 담당: frontend. (설계 §8 의 i18n 키 목록에도 이 키가 없다 — 키 신설이 정답이고, `issuePanel.*` 재사용은 아니다.)

---

## 2. ✅ 통과 (경계면 교차 비교)

### 2-1. 백필 UI ↔ resolver 응답 shape (필수항목 1)

| 축 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| `backfillIssueLinkMarkers` | `IssueLinkBackfillService.js:93` `{content:{jobId:null, projectCount:0}}` / `:121` `{content:{jobId, projectCount}}` → `guardedDefine` 루트 스프레드 | `IssueLinkBackfillCard.jsx:60-69` `result.success` → `result.content?.jobId ?? null` → **null 이면 `setNoTarget(true)` 후 return(폴링 시작 안 함)** | ✅ `jobId: null` 분기 일치 |
| `getIssueLinkBackfillStatus` | `IssueLinkBackfillService.js:144-153` `{content:{status,total,processed,failed}}`, 잡 없음 → `DONE/0/0/0` | `IssueLinkBackfillCard.jsx:44-51` `return result.content` + `refetchInterval: data.status === 'RUNNING' ? 3000 : false` | ✅ 영구 폴링 불가. `failed>0` 은 `setting.issueLinkBackfill.done`(`"완료 (실패 {failed}건)"`)로 표시 |
| `PARTIAL` 매핑 | `toBackfillStatus` (`:160-164`) `COMPLETED|PARTIAL|DONE`→`DONE` | `isRunning=false` 분기 | ✅ 실제로 `consumer.js:506` 이 `totalFailed>0 ? 'PARTIAL' : 'COMPLETED'` 만 쓴다 — 매핑이 실제 값 집합을 덮는다 |
| 실패 분기 | `{success:false, error:{...}}` | `if (!result?.success) throw` → catch → `setting.issueLinkBackfill.failed` | ✅ |
| 표식 프로퍼티 형태 | `IssueLinkPropertyApi.js:49` `buildLinkValue = {linked:true, projectId:String(projectId)}` | `useIssuePanelData.js:116-118` `properties?.movesRmsLink` → `linkProperty?.linked === true`, `linkProperty?.projectId` | ✅ 해제=키 삭제 → `undefined` → `linked!==true` → `notLinked` |
| manifest 조건 ↔ 값 | 불리언 `true` 저장 | `manifest.yml` `value: "true"` + `objectName: linked` | ✅ 문서상 비문자열은 비교 전 문자열화 |
| `originalEstimate/timespent` 초 | Jira 원본 | `panelMetrics.js:48-49` `fields.timeoriginalestimate`/`timespent` → `secondsToMd(sec, hourRate)` (`/(rate*3600)`) | ✅ 초 단위 취급 |
| 워크로그 응답 | Jira `GET /issue/{k}/worklog` | `useIssuePanelData.js:94` `maxResults:1000` → `data.worklogs` / `data.total` | ✅ (`REQUEST_MAP.getIssueWorklogs` 존재, GET 이라 param→쿼리스트링: `requestJira.js:130-131`) |
| `getSettingData` 루트 스프레드 | `SettingService.js:52` `{...DEFAULT_SETTINGS, ...saved}` → `{success:true, ...}` | `useIssuePanelData.js:109` `const {success, ...settings} = result` | ✅ |
| `findProjectById` | `{success, rows:[...]}` | `useIssuePanelData.js:130-135` 응답 객체 **그대로 캐시** → 읽을 때 `data.success ? rows[0] : null` | ✅ 공용 키 `findProjectByIdQueryKeys` 를 공유하는 `ProjectDetailPage`·`ProjectIssueMapView` 와 shape 일치(설계 이탈 5는 타당) |

`executeRequest` 는 `JSON.stringify(param)` 으로 body 를 만들므로 `comment: undefined` 는 **키가 아예 빠진다**
(`requestJira.js:139-149`) — F-4 가드의 2중 안전망이 실제로 성립한다.

### 2-2. 동일 데이터 다중 경로 — 연결 6 / 해제 3 (필수항목 2)

`grep setAppFieldValueForIssues` 전수 결과 **직접 호출자는 정확히 3개 파일**이다:

| 파일 | 성격 | 판정 |
|---|---|---|
| `src/api/jira/field/ProjectLinkWriter.js:53,89` | 관문 자체 | ✅ |
| `src/resolver/projectIssue/ProjectUsersService.js:320` | **coworker 분기만**(`isProjectLink===false`) | ✅ 연결 아님 |
| `src/resolver/project/ProjectDeletionService.js:134` | 삭제 saga `field_cleared_at` 체크포인트 | ✅ 설계 U2 |

| # | 지점 | 실제 코드 | 판정 |
|---|---|---|---|
| L1 | `ProjectUsersService.js:315-325` | `isProjectIdFieldRef` 판정 후 `''`→`clearProjectLink` / 값→`writeProjectLink` / 배열(coworker)→기존 경로 | ✅ (D4 의 빈값 분기 실재) |
| L2 | `SubscriptionSweeper.js:132` | `writeProjectLink`, `budget.spend(1 + markerWritten + markerFailed.length)` | ✅ D6 계상 정확 |
| L3 | `SubscriptionBackfill.js` | `applyTagging` 경유, 직접 필드 write 0건 | ✅ 계약 테스트가 고정 |
| L4 | `queue/consumer.js:293` | `writeProjectLink` | ✅ |
| L5 | `trigger/onIssueCreated.js:59` | `writeProjectLink` | ✅ |
| L6 | `AppFieldValueApi.js` | 무변경(coworker 겸용 저수준) | ✅ 설계대로 |
| U1 | `ProjectUsersService.js:342` | `clearProjectLink` | ✅ |
| U2 | `ProjectDeletionService.js:118-122` | `deleteIssueProperty(id,'app')` → `deleteIssueLink(id,'app')` → `markIssuePropertyCleared` | ✅ |
| U3 | `ProjectSubscriptionService.js` | 무변경(의도된 정책 예외) | ✅ |

`moves_RMS_projectId` 를 쓰는 다른 지점은 전부 **JQL 술어 / fields 요청**(읽기)이고 write 가 아니다
(`IssueApi.js`, `*IssueFetcher.js`, `SubscriptionJqlBuilder.js`, 프론트 `getJqlIssue.js` 등) — 관문 우회 없음.

**구조적 보증 — `ProjectLinkPaths.contract.test.js` 는 실제로 잡는다:**
`listJsFiles(src/)` 재귀 스캔 + `/setAppFieldValueForIssues\s*\(/` 매칭 후 allowlist 3개와 `toEqual` 비교
(`:51-58`). 즉 **새 파일이 관문을 우회하면 즉시 실패**한다. L1·L2·L4·L5 의 `writeProjectLink` 호출,
L3 의 `applyTagging` 경유, U1 `clearProjectLink`, U2 `deleteIssueProperty`+`deleteIssueLink` 동시 삭제,
U3 표식 미삭제까지 각각 고정돼 있다.

### 2-3. 읽기↔쓰기 대칭 (필수항목 3)

`ProjectDeletionService.js:116-123` — `if (!row.property_cleared_at)` **한 체크포인트 안**에서
`deleteIssueProperty(id,'app')`(movesRms) 와 `deleteIssueLink(id,'app')`(movesRmsLink) 를 연달아 호출하고
그 뒤에 `markIssuePropertyCleared` 를 찍는다. 중간 중단 시 둘 다 재시도된다(DELETE 404 는 멱등 성공).
`safeErrorCode` 정규식에 `ISSUE_LINK_PROPERTY_DELETE_` prefix 가 추가돼 403/429 가 기존과 같은 방식으로
`PROJECT_DELETION_JIRA_HTTP_{status}` 로 축약된다. ✅

L1 의 "projectId 필드 + 빈 문자열 → `clearProjectLink`"(D4) 로 **읽기가 막는 상태를 쓰기가 만들 수 없다.** ✅

### 2-4. 손실 ADF 가드 3조각 (필수항목 4)

| 조각 | 위치 | 판정 |
|---|---|---|
| `COMMENT_LOAD.LOCKED` 정의 | `commentLoadState.js:30` | ✅ |
| `canSubmitWorklog` 화이트리스트 = NONE/READY/**LOCKED** | `commentLoadState.js:48-52` | ✅ |
| `buildWorklogUpdateBody` 가 LOCKED 면 `comment` **키 자체를 만들지 않음** | `worklogWrite.js:76-81` (`if (LOCKED) return {started, timeSpentSeconds}`) | ✅ |
| 2중 안전망 | `resolveWorklogComment` (`:57-60`) LOCKED → `undefined` / `buildWorklogComment` (`:44-47`) LOCKED 직접 호출 시 **throw** | ✅ |

세 조각이 **같은 작업 단위(전부 uncommitted working tree)** 에 있다. 주석이 서로를 명시적으로 참조한다
(`commentLoadState.js:44-46` ↔ `worklogWrite.js:70-71`).

**"LOCKED 에서 빈 문자열이 절대 전송되지 않는다"는 테스트 3개로 고정돼 있다**
(`components/worklog/__test__/worklogWrite.test.js`):
- `:97` `LOCKED: body 에 comment 키가 **없다**`
- `:108` `updateWorklog 경로에서도 LOCKED 면 comment 가 실리지 않는다 (경계면 전체 확인)`
- `:120` `LOCKED 면 undefined — 변환기를 로드하지 않는다` / `:138` 직접 호출 시 throw

**F8f(지원 집합 ↔ `node_modules/adf-to-md`) 실측 대조 — 일치:**
`static/ui/node_modules/adf-to-md` v**1.2.1**, `index.js` 의 `case` 라벨을 추출해 대조했다.
- 노드 19개: `doc text paragraph heading hardBreak inlineCard blockCard embedCard blockquote bulletList orderedList listItem codeBlock rule emoji table tableRow tableHeader tableCell` = `ADF_MD_SUPPORTED_NODES` 와 **완전 일치**
- mark 5개: `code em link strike strong` = `ADF_MD_SUPPORTED_MARKS` 와 **완전 일치**
HARD 는 보집합으로 정의(`adfLossy.js:89`), `type` 없는 노드는 hard 로 센다(fail-close, `:85-88`),
`warnings` 에 노드 타입이 있으면 READY→LOCKED 강등(`hasNodeTypeWarning`). ✅ 설계 §10-C V5b 충족.

**V5a — `comment` 를 보내는 수정 경로가 관문 1개로 수렴:**
`grep "'updateWorklog'"` → `components/worklog/worklogWrite.js:102` **1곳**.
호출부는 패널(`PanelWorklogRowActions.jsx:59-67`, `commentLoad` 전달)과 마이워크
(`WorklogModal.jsx` `updateWorklog` → `updateWorklogRequest({... commentLoad})`) **둘 다** `commentLoad` 를 넘긴다.
`useWorklogWrite.update` (`:51-61`) 도 `commentLoad` 를 그대로 포워딩한다. ✅

### 2-5. 마이워크 회귀 (필수항목 5) — `git diff` 대조

`WorklogModal.jsx` (+59/−122) 를 변경 전과 대조한 결과, **요청 body 는 동일하다**:

| 경로 | 변경 전 | 변경 후 | 판정 |
|---|---|---|---|
| 생성 | `executeRequest('addWorklog', {comment, started, timeSpentSeconds}, {issueIdOrKey})` → `.id` | `createWorklog({issueIdOrKey, started, timeSpentSeconds, comment})` = `executeRequest('addWorklog', {comment, started, timeSpentSeconds}, {issueIdOrKey})` → `ensureWorklogResult(result).id` | ✅ 동일 |
| 수정 | `{comment, started, timeSpentSeconds}` | `buildWorklogUpdateBody` → NONE/READY 는 `{started, timeSpentSeconds, comment}` (키 순서만 다름, JSON 동일 집합) | ✅ 동일 (LOCKED 만 의도된 변화) |
| 삭제 | `executeRequest('deleteWorklog', {}, {issueIdOrKey, id})` + `r?.success !== false` | `deleteWorklog({issueIdOrKey, worklogId})` — 동일 호출 + 동일 판정(`success===false` 만 실패, 204→`''` 통과) | ✅ 동일 |
| 기간 롤백 | `.then(r => r?.success !== false).catch(()=>false)` | `deleteWorklogRequest(...).then(()=>true).catch(()=>false)` (실패는 throw 로 승격) | ✅ 등가 |
| `adjustEstimate` | 미전달 | 미전달 (`worklogWrite.js:11-13` 주석 + 테스트 고정) | ✅ |
| 코멘트 상태기계 | `useState(COMMENT_LOAD)` + effect 의존성 `[worklogInfo, commentReloadKey]` | `useWorklogComment(worklog?.comment, worklogInfo)` — 2번째 인자로 **같은 트리거 재현** | ✅ |
| `buildComment` 가드 | `!canSubmitWorklog → throw` | `resolveWorklogComment` → `buildWorklogComment` 안의 동일 가드 | ✅ |

**마이워크 관련 기존 테스트 — 전부 무수정 통과** (프론트 전체 122/122 통과 안에 포함):
`pages/myWork/modal/__test__/commentLoadState.test.js`(기존 12케이스 + 신규 F8h),
`worklogTimeRange.test.js`, `scheduleMutation.test.js`, `components/worklog/__test__/worklogWrite.test.js`,
`useWorklogComment.test.js`.

유일한 실질 회귀는 **F-2**(문구)다. 동작 회귀는 확인되지 않았다.
`CopyPageLinkButton.jsx` 는 `buildPageUrl` 을 `utils/forgeAppUrl` 에서 import 만 하게 바뀌었고
소비자는 자기 자신 1곳뿐(grep 확인) — 재export 제거는 안전하다. `buildPageUrl(context, null)` 이 이제
throw 대신 `null` 을 주는 것은 방어 강화이며 실사용 경로의 동작은 불변.

### 2-6. manifest.yml (필수항목 6)

`git diff manifest.yml` 실측(RFC-202 추가분만):

| 항목 | 값 | 판정 |
|---|---|---|
| `jira:issueActivity` 프로퍼티 | `key, resource, resolver.function, title, viewportSize: large, displayConditions` | ✅ 설계 §0-1(2) 프로퍼티 표 안 |
| `icon`/`label`/`allowMultiple`/`unlicensedAccess` | **없음** | ✅ §0-1 경고 준수 |
| `jira:issueContext` 프로퍼티 | `key, resource, resolver.function, title, label, icon, displayConditions` | ✅ §0-1(3) 표 안 |
| `displayConditions` (양쪽 동일) | `entityPropertyEqualTo: {entity: issue, propertyKey: movesRmsLink, objectName: linked, value: "true"}` | ✅ 설계 §0-2 인용과 파라미터·순서·형식 일치 |
| 모듈 key ↔ 코드 상수 | `moves-rms-issue-activity` / `moves-rms-issue-context` = `panelStates.js:10-11` `PANEL_MODULE` | ✅ |
| `resources.issue-panel` | `path: static/ui/build-panel` | ✅ 산출물 실재(`build-panel/index.html` 에 `<div id="root">`, 진입 `main.aada683b.js`) |
| `consumer` + `function` | `issue-link-backfill-consumer` → `backfillIssueLinks`, `handler: queue/consumer.backfillIssueLinks`, `timeoutSeconds: 600` | ✅ |
| `jira:entityProperty` 에 `movesRmsLink` | **미선언**(D10, 설계 §3-3 기본 방침) | ⚠ 미검증 V1 |

`forge lint` → **No issues found**. 단 `forge lint` 는 모듈 프로퍼티명 유효성을 전수 검증하지 않으며
PermissionLinter 가 이 환경에서 부분 스킵됐다 → 최종 확정은 `forge deploy` 시점(미검증 항목으로 분류).

### 2-7. 번들 (필수항목 7)

`build-panel/static/js/main.aada683b.js` (초기 로드, gzip 329,108) 내부 마커 grep — **전부 0건**:
`mdxeditor` · `MDXEditor` · `lexical` · `echarts` · `fullcalendar` · `react-grid-layout` · `xyflow` ·
`svar-ui` · `react-kanban` · `marklassian` · `exceljs` · `moment-timezone` · `sentry`.
(`adf-to-md` 1건은 모듈이 아니라 `convertAdfComment` 의 **에러 메시지 문자열**임을 문맥으로 확인했다.)

패널 최대 청크 = `6544.d666f322.chunk.js` raw 1,073,704 / **gzip 331,441**, `mdxeditor`·`lexical` 포함
→ **lazy 청크**다(초기 로드에 없다). 즉 마크다운 편집기·ECharts·간트는 패널 초기 로드에 **없음**. ✅
그 외 상위 청크는 32KB 내외(Atlaskit 테마/컴포넌트)로 문제 없음.

**main +3,758 B(gzip) 의 원인은 리포트 설명과 일치한다:**
- `build/static/js/main.*.js` 에 `worklog.comment.locked.title` **1건**(새로 유입 — `WorklogCommentField` 가
  `WorklogModal` 정적 그래프에 들어왔다)
- `issuePanel.state.loadError` **0건**, `movesRmsLink` **0건** → 패널 코드 자체는 main 에 없다
- `issuePanel.` **1건** = F-2 의 그 한 줄(리포트가 "0건"이라 쓴 부분은 부정확하며, 그 원인이 곧 F-2 다)

### 2-8. 권한 (필수항목 8)

| 항목 | 실제 | 판정 |
|---|---|---|
| `PermissionMap.js:195-196` | `backfillIssueLinkMarkers: W('SETTINGS')`, `getIssueLinkBackfillStatus: R('SETTINGS')` | ✅ |
| `project` 축 | `W`/`R` 헬퍼 기본값 `project='none'` (`:30-31`) | ✅ 프로젝트 컨텍스트 없는 resolver를 `detail` 로 두는 함정 회피(RFC-198) |
| 등록 | `SettingController.js:20,22` `guardedDefine` 2건, `src/index.js` 무변경 | ✅ |
| 계약 테스트 | `test/permission/permissionMap.contract.test.js` — `CONTROLLER_REGISTRARS` 를 import 해 양방향 검사(미매핑/고아) | ✅ 통과 |
| `SYSTEM_PRINCIPAL` 명시 | `IssueLinkBackfillService.js:90` `getAllProjectsRepository(scopedProjectIds(SYSTEM_PRINCIPAL))` | ✅ `scopedProjectIds(undefined)`=0건 fail-close 함정 회피 |
| 프론트 게이트 | `IssueLinkBackfillCard.jsx:42` 조회 `canRead('SETTINGS')`, `:77` `if (!canWrite('SETTINGS')) return null` | ✅ 백엔드 축과 일치 |

### 2-9. 큐 consumer (필수항목 9)

| 항목 | 실제 | 판정 |
|---|---|---|
| `timeoutSeconds: 600` 한도 | Forge 공식 문서(manifest-reference/modules/function) — `timeoutSeconds` **"Valid range: 1 and 900 seconds"**, 스케줄 트리거·비동기 이벤트 컨슈머에 적용 | ✅ 600 < 900. 리포 내 선례(`backfillSubscription`·`projectWorklogBatch` 도 600)와 동일 |
| JQL 페이징 | `IssueLinkBackfillService.js:56-74` `while (first \|\| nextPageToken)` → `nextPageToken = data?.nextPageToken ?? null` — **끝까지 따라간다** | ✅ |
| bulk 10,000 상한 | `IssueLinkPropertyApi.js:153-168` `for (i += BULK_ENTITY_LIMIT)` **순차 분할**(동시 대량 PUT 회피) | ✅ 10,000건 초과 프로젝트 처리됨 |
| 프로젝트당 상한 | `MAX_ISSUES_PER_PROJECT = 30000`, 초과 시 `capped: true`(조용히 자르지 않음), 재실행 멱등 | ✅ (컨슈머는 `capped` 를 무시하고 30,000건만 쓴다 — 30,000 초과 프로젝트는 재실행 필요. 설계 D8 과 일치) |
| entityIds 타입 | `normalizeEntityIds` = 양의 정수만. `collectLinkedIssueIds` 는 `fields=id` 로 숫자 id 수집 | ✅ |
| 실패 정책 | 재시도 3회 후 `job_fail` 기록 + 배치 `done:true, failCount:1` → job 이 RUNNING 에 영구 잔류하지 않음 | ✅ D9 |
| 라이선스 | `isLicenseBlocked()` 면 배치를 0/0 으로 닫고 완료 판정 진행 | ✅ |
| 멱등 | `existingBatch?.done` 조기 반환 + 같은 값 재write | ✅ |

### 2-10. 쿼리키 (필수항목 10)

`utils/queryKey/issuePanelKeys.js` 에 `issuePanelKeys.{all,issue,worklogs}` · `issueLinkBackfillKeys.{all,status}`
팩토리로 정의. 인라인 배열 0건 — `queryKeyContract.test.js` 가 `static/ui/src` **전체를 재귀 스캔**하고
(`sourceRoot = src`, `collectRuntimeFiles` 재귀) `queryKey: [` / `.invalidateQueries([` 류를 금지하므로
`src/panel/**` 도 계약 범위 안이다. `queryKeyFactories.test.js`(F12)까지 통과. ✅
무효화는 생성·수정·삭제 모두 `invalidateIssue()` 하나로 `issue`+`worklogs` **둘 다** 무효화
(`useIssuePanelData.js:166-169`). ✅

### 2-11. 다중 shape 재사용 컴포넌트 (설계 §10-C V5)

| 컴포넌트 | 넘기는 값 | `null` 취급 | 판정 |
|---|---|---|---|
| `KpiTile`(`components/card/Summary.jsx:35`) | `{icon,label,value,valueColor}` — `value` 는 `?? 0` 없이 `{value}` 그대로 렌더 | `PanelKpi` 가 `fmtMm(null) ?? none` 으로 **`-`**(`issuePanel.kpi.none`)를 만들어 넘긴다 | ✅ `?? 0` 로 결함을 삼키지 않음 |
| `CardProgressBar`(`:10-11,45`) | `{percent, accent}` | `percent==null` → 빈 바 + `'-'` (기존 정책과 동일) | ✅ `PanelKpi:46` `progress==null ? null : progress*100` |
| `effortProgressRatio` | 0~1 ratio, 계획 없으면 `null` | `×100` → percent | ✅ 단위 일치 |
| `PanelKpi` compact/full | **같은 `metrics` 객체**(계산은 `panelMetrics.js` 순수 함수 하나) | — | ✅ 두 모듈 숫자 불일치 구조적 불가 |
| `panelMetrics` null 정책 | `plannedSeconds/spentSeconds` null → MD/MM/progress 전부 null, `accountId` 미상 → `mineSeconds=null` | — | ✅ 0 으로 접지 않음 |

### 2-12. i18n (설계 §10-C V6)

- `locales/kr/issuePanel.json`·`locales/en/issuePanel.json` **신규**, `worklog.json`·`setting.json` 에 키 추가.
  `locales/script/*.json`(빈 스텁)에는 넣지 않았다. ✅
- `ko-KR.json`/`en-US.json` 은 merge 산출물로만 변경됐다(직접 편집 흔적 없음, `prebuild` 가 재실행). ✅
- **전수 대조 실측**: `src/panel/**` + `src/components/worklog/**` + `IssueLinkBackfillCard.jsx` 의
  `t()`/`tFormat(t, …)` 키 **60개 추출 → ko 누락 0, en 누락 0.** ✅
- 패널·워크로그 소스에 **한글 리터럴 0건**(주석 제외 후 스캔). ✅
- 단, 그 60개 중 1개가 잘못된 네임스페이스다 → **F-2**.

### 2-13. 성능 (설계 §10-C V7)

- 공통 워크로그 페치 경로 **미수정**: `git status` 에 `src/api/jira/WorklogApi*`·`ProjectWorklogFetcher`·
  `static/ui/src/utils/jiraApi/**` 변경 없음. ✅ (`feedback_worklog_fetch_isolation` 규칙 준수)
- 패널은 **자기 이슈 1건**만 조회(`getIssue` 1 + `getIssueWorklogs` 1). 프로젝트 단위 대량 조회 없음. ✅
- 설정·공휴일·Jira 권한·프로젝트·Forge 컨텍스트는 **기존 쿼리키 재사용** → 추가 네트워크 0. ✅
- 표식 write 동시성 `p-limit(5)` (`ProjectLinkWriter.js:29,63,98`). ✅
- 스윕 budget 이 표식 요청을 계상(D6) → 시간별 리컨실이 요청 예산을 조용히 초과하지 않는다. ✅

### 2-14. 빌드 배관 격리

`craco.config.js` `paths: overridePanelPaths` — `PANEL_BUILD !== 'true'` 면 **입력 객체를 그대로 반환**
(`return paths`). `src/__test__/cracoPanelPaths.test.js` 가 동일 참조(`toBe`)로 고정. ✅
`check-bundle-budget.js` 의 `parseArgs` 추가는 env·기본값 동작 불변(`bundle:check` 가 종전대로 통과). ✅

---

## 3. ⚠ 관찰 — 저위험 (수정 선택)

| # | 위치 | 내용 |
|---|---|---|
| O-1 | `IssueLinkBackfillCard.jsx:99-108` | 분기가 `isRunning ? running : done` 뿐이라 `status === 'FAILED'` 도 **"완료 (실패 0건)"** 로 렌더된다. `setting.issueLinkBackfill.failed` 는 invoke 실패에만 쓰인다. **다만 현재 도달 불가**다 — `consumer.js:506` 이 `PARTIAL`/`COMPLETED` 만 쓰고 `'FAILED'` 를 쓰는 코드가 없다. `toBackfillStatus` 의 FAILED 분기가 살아 있는 한 방어적 분기를 두는 편이 안전 |
| O-2 | `src/utils/errors/ErrorCodes.js` | 신규 `ISSUE_LINK_BACKFILL_NO_PROJECT` 가 **어디에서도 쓰이지 않는다**(서비스는 throw 대신 `jobId:null` 반환). 죽은 코드 |
| O-3 | `ProjectLinkPaths.contract.test.js:53` | allowlist 계약이 `setAppFieldValueForIssues\s*\(` 만 본다. 저수준 `setAppFieldValues(`(`AppFieldValueApi.js:48`)를 직접 부르는 새 경로가 생기면 **관문과 계약 테스트를 동시에 우회**한다. 현재 외부 호출자 0건(확인함). 패턴에 `setAppFieldValues\s*\(` 를 추가하면 닫힌다 |
| O-4 | `useIssuePanelData.js:36` | `aggregatetimespent`·`aggregatetimeoriginalestimate` 를 요청하지만 소비 코드가 없다(`panelMetrics` 는 `timespent`/`timeoriginalestimate` 만). 무해하지만 계약상 잉여 |

부수 관찰: `useWorklogWrite({issueKey})` → `projectKeyOfIssue(issueKey)` 이므로 Forge 컨텍스트가
`extension.issue.key` 없이 `id` 만 줄 경우 Jira 권한 조회의 `projectKey` 가 `null` 이 된다. 정책상
**확정 false 만 차단**이라 fail-open(시도 허용)으로 안전하게 떨어지고 최종 거부는 서버가 하지만,
필요하면 `issueQuery.data.fields.project.key` 를 폴백으로 쓸 수 있다.

---

## 4. 미검증 (배포·실브라우저 필요 — 추측으로 통과 처리하지 않음)

| # | 항목 | 이유 / 실패 시 폴백 |
|---|---|---|
| U-1 | **V1** `displayConditions.entityPropertyEqualTo` + `objectName` 이 **미선언** 프로퍼티(`movesRmsLink`)에서 평가되는가 | 공식 문서에 명시 없음. `manifest.yml` 에 `jira:entityProperty` 로 `movesRmsLink` 미선언(D10). 실패 시 블록 추가 + `forge deploy`(≈5줄) |
| U-2 | **V2** `PUT /rest/api/3/issue/properties/movesRmsLink` (asApp, `filter.entityIds`) 가 303 을 주는가 | 구현은 `status < 400` 을 성공으로 본다(303 포함). mock 으로는 플랫폼 거동을 확인할 수 없다 |
| U-3 | 🔴 **V3** `PUT .../worklog/{id}` 에서 `comment` **생략** 시 원본 ADF 보존 | 손실 ADF 가드 전체의 전제. 실패 시 `buildWorklogUpdateBody` 한 줄에서 원본 ADF 를 되돌려 보내면 된다(구현 지점 1곳으로 수렴돼 있음) |
| U-4 | **V4** `jira:issueActivity` 가 구 이슈 화면에 탭이 없다는 문서 기술의 실제 영향 | `issueContext` 가 폴백 진입점 |
| U-5 | `view.getContext()` 가 두 모듈에서 `extension.issue.key`·`moduleKey` 를 실제로 주는가 | 문서 기준 구현. `issueKey`/`issueId` 폴백 + 폭 폴백이 있어 빈 화면은 되지 않으나 실제 키 존재는 미확인 |
| U-6 | `context.localId` 가 issueActivity/issueContext 에서 `extension/{appId}/{envId}` 형태인가 | `parseForgeIds` 정규식이 이 형태를 가정. 빗나가면 딥링크가 조용히 숨는다(`resolveLinkVisibility` 가 `appUrl==null` 을 처리하므로 오류는 아님) |
| U-7 | E8 백필 잡 1회 실행 후 기존 연결 이슈에 패널 노출 | 실잡 실행 필요 |
| U-8 | E6/E9/E10 다크 모드 · 300px 요약 레이아웃 · 두 모듈 숫자 일치(렌더) | 브라우저 필요. 숫자 동일성은 `panelMetrics` 단일 원천 + 테스트로 구조적 보증됨 |
| U-9 | E11/E12 수정·삭제 후 KPI 갱신(Jira `timespent` 재계산 반영) | 브라우저 필요. 무효화 2키 동시는 코드로 확인됨 |
| U-10 | E7 마이워크 모달 수동 회귀(단일/기간 입력·코멘트 로드·삭제·롤백) | 요청 body 등가성은 `git diff` 대조 + 테스트로 확인했으나 실화면 미확인 |
| U-11 | manifest 모듈 프로퍼티 유효성 최종 확정 | `forge lint` 는 프로퍼티명 전수 검증을 하지 않고 이 환경에서 PermissionLinter 가 부분 스킵됐다 → `forge deploy` 시점 확정 |

---

## 5. 재작업 지시 (담당별)

**frontend-engineer**
1. **F-2** `static/ui/src/components/worklog/WorklogCommentField.jsx:89` — `t('issuePanel.recent.empty')` 를
   신규 키 `worklog.comment.locked.emptyPreview` 로 교체. `locales/kr/worklog.json`·`locales/en/worklog.json`
   의 `comment.locked` 아래 추가 후 `cd static/ui && npm run merge`.
2. (선택) **O-1** `IssueLinkBackfillCard.jsx` 에 `status === 'FAILED'` 분기 추가
   (`setting.issueLinkBackfill.failed` 재사용).
3. (선택) **O-4** `useIssuePanelData.js:36` 에서 미사용 `aggregate*` 필드 제거.

**backend-engineer**
1. (선택) **O-2** 미사용 `ErrorCodes.ISSUE_LINK_BACKFILL_NO_PROJECT` 제거 또는 사용.
2. (선택) **O-3** `ProjectLinkPaths.contract.test.js` 의 금지 패턴에 `setAppFieldValues\s*\(` 추가.
3. **U-1** 배포 실측에서 `displayConditions` 미평가면 `jira:entityProperty` 에 `movesRmsLink` 선언 추가.

**리더**
1. **F-1** `bitbucket-pipelines.yml` 두 곳에 `- static/ui/build-panel/**` 추가 (§1 F-1 의 diff 그대로).
   **이것 없이 배포하면 패널 리소스가 비어 `forge deploy` 가 깨진다.**
2. 배포 후 U-1~U-4(V1~V4) 실측 → 결과에 따라 위 폴백 적용.
