# RFC-202 프론트엔드 구현 리포트

작성: 2026-09-22 (frontend-engineer). 설계서: `_workspace/issue-worklog-panel/01_architect_design.md`
백엔드 리포트: `_workspace/issue-worklog-panel/02_backend_report.md` (**존재함 — 실제 shape 확인 후 소비**)
worktree: `.claude/worktrees/RFC-202` (모든 경로는 이 루트 기준)

---

## 0. 결과 요약

> **2026-09-22 2차 반영** — Codex 검토 지적 3건(F1~F3) + 백엔드 응답 변경 1건(F4)을 수정했다. §12 참조.

| 항목 | 결과 |
|---|---|
| 프론트 테스트 | ✅ `cd static/ui && npx jest` — **123 suites / 2001 tests 전부 통과** (신규 7 suites / +90 tests) |
| 빌드 (CI 동일 조건) | ✅ `CI=true npm run build` — `build:app` → `build:panel` → `bundle:check` → `bundle:check:panel` 전부 통과 |
| main 번들 (gzip) | 477,399 B → **481,151 B** (+3,752 B / +0.79%) — 원인·근거는 §5 |
| panel 번들 (gzip) | **329,317 B** (예산 참고선 350,000 B, 실측+6%) |
| i18n merge | ✅ `npm run merge` 실행 — `ko-KR.json`/`en-US.json` 생성 확인. **ko-KR/en-US 직접 수정 없음** |
| 쿼리키 계약 | ✅ `queryKeyContract.test.js` + `queryKeyFactories.test.js` 통과 (패널 인라인 키 0건) |
| 백필 UI | ✅ 백엔드 **실제 shape** 기준 구현 — `jobId: null` · **`alreadyRunning`** · `ENQUEUE_FAILED` 5분기 (§12 F4) |
| manifest | ✅ 백엔드 리포트 생성 이후 `resources.issue-panel` + `jira:issueActivity` + `jira:issueContext` **추가만** |
| CI 파이프라인 | ⚠ **변경하지 않음** — 필요한 변경을 §9 에 YAML 로 적어 둠(리더 판단) |

---

## 1. 소비하는 응답 shape (경계면 — 검증 1순위)

### 1-1. resolver (`invoke`) — 백엔드 리포트 §2 와 글자 단위로 대조

| 호출 | 소비 코드 | 접근 경로 | 백엔드 실제 shape |
|---|---|---|---|
| `backfillIssueLinkMarkers` | **판정은 `backoffice/page/setting/issueLinkBackfill.js` 의 `interpretBackfillStart`** (컴포넌트는 그 결과만 소비) | `result.success` → `result.content.{jobId, projectCount, alreadyRunning}` / 실패는 `result.error.code` | `{success:true, content:{jobId: string\|null, projectCount, alreadyRunning: boolean}}` ✅ (**§12 F4 로 `alreadyRunning` 반영 완료**) |
| `getIssueLinkBackfillStatus` | `IssueLinkBackfillCard.jsx` | `result.success` → `result.content` → `.status/.total/.processed/.failed` | `{success:true, content:{status:'RUNNING'\|'DONE'\|'FAILED', total, processed, failed}}` ✅ |
| `getSettingData` | `panel/useIssuePanelData.js` | `const {success, ...settings} = result` (루트 스프레드) | `{success:true, ...DEFAULT_SETTINGS}` ✅ (`useSalaryPolicy.js` 와 동일 형태) |
| `findProjectById` | `panel/useIssuePanelData.js` | `queryFn` 이 `{row: result.success ? rows?.[0] : null, denied: result.success !== true}` 로 **정규화** (쿼리키는 패널 전용 — §12 F3) | `{success:true, rows:[{project_id, project_name, …}]}` ✅ |
| `getPublicHolidayList` | 기존 공용 훅 `utils/usePublicHolidayList.js` 그대로 | 훅이 `res.data` 를 정규화 | (§8 설계 이탈 1 참조) |
| `userPermissionCheck` | `usePermissionStore.loadPermissions()` 내부 | 변경 없음 | ✅ |

**백엔드 리포트의 「프론트가 알아야 할 것」 전부 반영:**
0. **`alreadyRunning: true`** → 새로 시작된 것이 아니다. 같이 온 `jobId` 로 **폴링만 붙이고** 중복 실행이 아님을 안내한다 (§12 F4).
1. `content.jobId === null`(프로젝트 0건) → **폴링을 시작하지 않고** `noTarget` 안내로 끝낸다.
2. `status !== 'RUNNING'` 이면 `refetchInterval: false` → 폴링 종료. 존재하지 않는 jobId 가 `DONE` 으로 오는 계약에 맞다(영구 폴링 불가).
3. 표식 해제는 **키 삭제** → `properties.movesRmsLink` 가 `undefined` 일 수 있다. 판정은 `linkProperty?.linked === true` 이고, `resolvePanelState` 는 `linked !== true` 를 전부 `notLinked` 로 본다(`false`/`null`/`undefined`/문자열 `'true'` 까지 테스트로 고정).
4. `movesRmsLink.projectId` 는 항상 문자열이지만 **신뢰 입력이 아니다** — 딥링크는 UUID 형식 검증 + `encodeURIComponent` 를 통과한 값만 만든다 (§12 F2).
5. `error.code === 'ISSUE_LINK_BACKFILL_ENQUEUE_FAILED'` → 잡이 닫혔으므로 "다시 실행 가능" 문구로 구분 표시 (§12 F4).

### 1-2. Jira REST 직접 호출 (`executeRequest`, resolver 없음)

| 용도 | REQUEST_MAP 키 | 파라미터 | 소비하는 필드 | 위치 |
|---|---|---|---|---|
| 이슈 골격 + 표식 | `getIssue` | param `{fields:'summary,status,issuetype,timespent,timeoriginalestimate,aggregatetimespent,aggregatetimeoriginalestimate,project', properties:'movesRmsLink'}`, urlParam `{issueIdOrKey}` | `fields.summary`·`fields.status.name`·`fields.status.statusCategory`·`fields.timeoriginalestimate`·`fields.timespent`·`properties.movesRmsLink.{linked,projectId}` | `useIssuePanelData.js` |
| 워크로그 목록 | `getIssueWorklogs` | param `{maxResults:1000}` | `total`, `worklogs[].{id,author.accountId,author.displayName,author.avatarUrls,started,timeSpentSeconds,comment}` | 같은 파일 |
| Jira 권한 | `getMyPermissions` (기존 `fetchJiraProjectPermissions`) | `projectKey` | `canWorkOnIssues`·`canEditOwnWorklogs`·`canDeleteOwnWorklogs` (삼값) | `components/worklog/useWorklogWrite.js` |
| 생성 | `addWorklog` | `{comment, started, timeSpentSeconds}` / `{issueIdOrKey}` | `id` | `components/worklog/worklogWrite.js` |
| 수정 | `updateWorklog` | `{started, timeSpentSeconds[, comment]}` / `{issueIdOrKey, id}` | `id` | 같은 파일 |
| 삭제 | `deleteWorklog` | `{}` / `{issueIdOrKey, id}` | 204 → `''` (자체 성공 판정) | 같은 파일 |

**`REQUEST_MAP` 을 추가하지 않았다** — 세 키 모두 `requestJira.js` 에 이미 있었다.
**`adjustEstimate` 를 넘기지 않는다**(Jira 기본값 `auto` 유지) — 테스트로 `body`·`urlParam` 양쪽에 그 키가 없음을 고정.
**`fieldsByKeys` 를 쓰지 않는다** — 프로젝트 id 를 앱 커스텀 필드가 아니라 이슈 프로퍼티에서 얻으므로 팀 관리형 함정이 구조적으로 없다.

---

## 2. 신규/수정 파일

### 2-1. 공용 유틸 (신규)

| 파일 | 내용 |
|---|---|
| `static/ui/src/utils/effort.js` | `resolveHourRate`·`secondsToMd`·`mdToMm`·`secondsToMm`·`effortProgressRatio`. **`workday.js` 에 넣지 않았다**(parity 테스트 보호) |
| `static/ui/src/utils/forgeAppUrl.js` | `parseForgeIds`·`buildAppUrl`·`buildPageUrl`(기존 계약)·`buildProjectWorkUrl`(딥링크) |

`components/layout/CopyPageLinkButton.jsx` 는 `buildPageUrl` 을 **import 만** 하게 바꿨다(순수부 이동, 동작 불변).
`buildPageUrl` 의 외부 소비자는 없었으므로(grep 0건) 재export 는 두지 않았다.

### 2-2. 워크로그 공용화 (`static/ui/src/components/worklog/` — 신규 6 + 수정 1)

| 파일 | 성격 |
|---|---|
| `worklogAdf.js` | `loadMarkdownToAdf`/`loadAdfToMd` 동적 import + 모듈 promise 캐시 — `WorklogModal` 에서 **순수 이동** |
| `worklogWrite.js` | `ensureWorklogResult`·`buildWorklogComment`·**`resolveWorklogComment`**·**`buildWorklogUpdateBody`**·`createWorklog`·`updateWorklog`·`deleteWorklog` |
| `useWorklogWrite.js` | `{create, update, remove, assertJiraPermission, toStarted, canLogWork, canEditWorklog, canDeleteWorklog, permissions}` |
| `adfLossy.js` | `ADF_MD_SUPPORTED_NODES/MARKS`·`ADF_MD_DEGRADING_NODES`·`collectAdfLossyNodes`·`hasLossyAdfNodes`·`summarizeLossyCounts`·`hasNodeTypeWarning` |
| `useWorklogComment.js` | ADF→MD 상태기계(`COMMENT_LOAD`) + **LOCKED 선판정** + **warnings 강등** |
| `WorklogCommentField.jsx` | 코멘트 4분기 JSX(스켈레톤 / 실패+재시도 / **잠금 미리보기** / 에디터 + SOFT 경고) |
| `pages/myWork/modal/commentLoadState.js` **(수정)** | `COMMENT_LOAD.LOCKED` 추가 + `canSubmitWorklog` 화이트리스트 확장 + **`canWriteWorklogComment` 신설** |

### 2-3. 🔴 손실 ADF 가드 — 세 변경이 **같은 작업 단위**에 들어갔는지 (설계 §10-C V5b)

| 조각 | 위치 | 확인 |
|---|---|---|
| `COMMENT_LOAD.LOCKED` 추가 | `commentLoadState.js:22-31` | ✅ |
| `canSubmitWorklog` 화이트리스트에 `LOCKED` | `commentLoadState.js:50-54` | ✅ |
| **PUT 본문에서 `comment` 생략** | `worklogWrite.js` `buildWorklogUpdateBody` | ✅ |

세 조각이 전부 이번 변경에 함께 있다. 화이트리스트만 넓히면 잠긴 원본이 빈 본문으로 덮어써지므로, 그 관계를
**주석 3곳 + 테스트 3개**(`worklogWrite.test.js` F8g / `commentLoadState.test.js` F8h / `canWriteWorklogComment` 비대칭)로 못 박았다.

`comment` 를 보내는 **수정 경로는 2개뿐**이고 둘 다 같은 분기를 통과한다:
- 패널: `panel/PanelWorklogRowActions.jsx` → `resolveWorklogComment` → `write.update(..., commentLoad)` → `buildWorklogUpdateBody`
- 마이워크: `pages/myWork/modal/WorklogModal.jsx` `updateWorklog(value)` → 같은 함수 (`grep "'updateWorklog'"` 결과는 `worklogWrite.js` 1곳뿐 — 호출 지점이 관문 하나로 수렴)

`adfLossy.js` 는 **지원 집합의 보집합**으로 HARD 를 정의한다(열거하지 않는다). 2중 안전망으로 `convert()` 의
`warnings` 에 노드 타입이 있으면 `READY` 를 `LOCKED` 로 강등한다(mark 만의 warning 은 강등하지 않는다).

### 2-4. 패널 (`static/ui/src/panel/` — 신규 12)

`index.js` · `PanelApp.jsx` · `useIssuePanelData.js` · **`panelMetrics.js`** · `panelStates.js` ·
`IssueActivityPanel.jsx` · `IssueContextSummary.jsx` · `PanelKpi.jsx` · `PanelWorklogForm.jsx` ·
`PanelRecentWorklogs.jsx` · `PanelWorklogRowActions.jsx` · `PanelOpenInAppLink.jsx`

- `index.js`: **top-level await 없음 / Sentry 없음 / `App.jsx` import 없음**. 루트는 앱과 동일한 legacy `ReactDOM.render`.
- `PanelApp.jsx`: i18n `init()` · `view.theme.enable()` · `loadPermissions()` · `loadLicense()` — 앱 `App.jsx` 와 같은 함수·같은 순서. 라이선스 경계도 동일(**INACTIVE 하나만 차단**).
- `PanelApp` 은 초기화가 끝난 **뒤에** 데이터 훅을 마운트한다(`PanelBody` 분리) — 권한 로딩 중 `canRead('PROJECT')` 가 `false` 로 읽혀 딥링크가 깜빡이는 것을 막는다.
- `resolvePanelSurface`: `moduleKey` 1순위(`moves-rms-issue-context`→summary / `-activity`→full), 컨텍스트 실패 시 `window.innerWidth <= 560` 폴백.
- `pages/myWork/**` 를 **어떤 형태로도 import 하지 않는다.** 공유는 `components/worklog/` 와 `pages/myWork/modal/{commentLoadState,worklogTimeRange}.js`(순수 모듈)로만 한다 — 패널 번들 grep 으로 `scheduleTypeOptions`·FullCalendar·ECharts·react-grid-layout·Sentry·AppLayout 전부 **0건** 확인(§5).

### 2-5. 쿼리키 (신규)

`static/ui/src/utils/queryKey/issuePanelKeys.js`
```js
issuePanelKeys.all              // ['issuePanel']
issuePanelKeys.issue(issueKey)  // ['issuePanel','issue',issueKey]
issuePanelKeys.worklogs(issueKey) // ['issuePanel','worklogs',issueKey]
issueLinkBackfillKeys.status(jobId) // ['issueLinkBackfill','status',jobId]
```
재사용: `settingKeys.detail()` · `backofficeKeys.publicHolidays()` · `jiraKeys.myPermissions()` ·
`findProjectByIdQueryKeys()` · `forgeContextKeys.current()` → **추가 네트워크 0**.

**저장 후 무효화**는 생성·수정·삭제 **모두** `issuePanelKeys.issue` + `issuePanelKeys.worklogs` **둘 다**
(`useIssuePanelData.invalidateIssue`). 한쪽만 하면 "목록은 줄었는데 투입 공수는 그대로"가 된다.
`myWorkKeys.*`·`calendarKeys.all` 은 건드리지 않았다(별 iframe = 별 캐시).

### 2-6. 빌드 배관 / manifest / 백오피스

| 파일 | 변경 |
|---|---|
| `static/ui/craco.config.js` | `paths` 훅 추가 (`PANEL_BUILD=true` 일 때만 `appIndexJs`/`appBuild` 교체) |
| `static/ui/scripts/build-panel.js` | 신규 — `PANEL_BUILD=true` 로 `npx craco build` spawn (Windows/CI 공통) |
| `static/ui/scripts/check-bundle-budget.js` | `parseArgs()` 추가 (`--dir`/`--budget`). **env·기본값 동작 불변** |
| `static/ui/package.json` | `build` = `build:app && build:panel && bundle:check && bundle:check:panel`, `build:panel`, `bundle:check:panel`(예산 350,000) |
| `static/ui/.gitignore` | `/build-panel` 추가 |
| `manifest.yml` | `resources.issue-panel` + `jira:issueActivity` + `jira:issueContext` (**추가만**, 기존 블록 무수정) |
| `static/ui/src/backoffice/page/setting/IssueLinkBackfillCard.jsx` | 신규 — 백필 버튼 + 진행률 |
| `static/ui/src/backoffice/page/setting/EtcSetting.jsx` | 카드 하단에 위 컴포넌트 1줄 추가 |

---

## 3. 🔴 설계와 다르게 구현한 것 (빌드 배관) — 실측으로 뒤집힌 부분

설계 §6-1 은 `craco.config.js` 최상단에서 `require('react-scripts/config/paths')` 를 **직접 mutate** 하라고 했다.
**실측 결과 동작하지 않는다.**

```
npm run build:panel  →  build/static/js/main.e16fc227.js   (❌ build-panel/ 이 아니고, 진입점도 src/index.js)
```

원인(`node_modules/@craco/craco/dist/scripts/build.js` 실소스 확인):
craco 는 `getCraPaths()` 로 얻은 객체를 **자기 컨텍스트에 따로 들고** webpack 설정을 만들고,
`overridePaths()` → `overrideCraPaths()` 가 `require.cache[pathsModule].exports` 를 **교체**해야 반영된다.
또 craco 는 paths 모듈보다 `env.js` 를 먼저 로드하는데, 직접 require 하면 그 순서를 깨뜨린다.

→ **craco 의 공식 `paths` 훅으로 교체**했다. 산출물은 설계 의도 그대로다(`build-panel/`, 진입점 `src/panel/index.js`,
`asset-manifest.json` 의 `entrypoints` 가 `main.*` 이므로 기존 `findMainEntrypoint` 정규식이 그대로 맞는다).

이 분기가 **main 빌드를 건드리지 않는다**는 사실은 추측이 아니라 테스트로 고정했다 —
`src/__test__/cracoPanelPaths.test.js`: `PANEL_BUILD` 가 없거나 `'true'` 가 아니면 훅이 **입력 객체를 그대로**
(`toBe`, 동일 참조) 돌려준다.

---

## 4. 테스트 (설계 §9-2 대응)

신규 6 suites / +64 tests. 전체 `npx jest` → **122 suites / 1975 tests 통과.**

| 설계 # | 대상 | 파일 |
|---|---|---|
| F1·F2 | `utils/effort.js` + **기존 인라인 식과 동일 출력**(`WorkloadCell.toMd`·`ResourceAnalysisTable` 식 복제본과 자리수까지 대조) | `src/utils/__test__/effort.test.js` |
| F3·F4·F7 | `forgeAppUrl` 파싱·조립·기존 `buildPageUrl` 계약·딥링크 문자열(`?tab=projectIssue&view=table`) | `src/utils/__test__/forgeAppUrl.test.js` |
| F5·F6·F8c·F8d | `panelStates` 상태 우선순위 / fail-open 경계(라이선스·Jira 권한 `null`) / 행 액션 소유권 / `resolvePanelSurface` | `src/panel/__test__/panelStates.test.js` |
| F8·F8a·F8b·F8g | `worklogWrite` 호출 인자 정확도 · `adjustEstimate` 미전달 · 204→`''` 성공 판정 · **LOCKED 시 `comment` 키 부재** | `src/components/worklog/__test__/worklogWrite.test.js` |
| F8e·F8f | 손실 노드 판정 표 10케이스 + **`node_modules/adf-to-md/index.js` 실소스의 case 집합과 상수 대조** | `src/components/worklog/__test__/adfLossy.test.js` |
| F8h | `canSubmitWorklog` 화이트리스트 = 정확히 NONE/READY/LOCKED 3개 + `canWriteWorklogComment` 비대칭 | `src/pages/myWork/modal/__test__/commentLoadState.test.js` (기존 파일에 추가) |
| F8i·F9 | `useWorklogComment` 상태 전이(LOADING→READY/FAILED/LOCKED) · **LOCKED 이면 동적 import 호출 0회** · warnings 강등 | `src/components/worklog/__test__/useWorklogComment.test.js` (react-dom/client + act, 리포 관례) |
| F11 | 인라인 쿼리키 0건 | 기존 `queryKeyContract.test.js` ✅ |
| F12 | `issuePanelKeys` 팩토리 형태 + `all` prefix 포함(함께 무효화 보장) | `queryKeyFactories.test.js` (기존 파일에 추가) |
| F13 | "내 몫" = `author.accountId === me` 만 합산, `accountId` 미상이면 `null`, `total > 조회건수` 면 근사 플래그 | `src/panel/__test__/panelMetrics.test.js` |
| F14 | `build-panel/asset-manifest.json` 존재 + 두 예산 측정 출력 | 빌드 산출물로 확인(§5) |
| **추가** | craco `paths` 분기가 main 빌드에 no-op | `src/__test__/cracoPanelPaths.test.js` |

### 마이워크 회귀 — 무엇이 기존 동작을 고정하는가

| 고정 장치 | 고정하는 것 |
|---|---|
| `pages/myWork/modal/__test__/commentLoadState.test.js` (기존 12 케이스 **무수정 통과**) | `initialCommentLoad`·`canSubmitWorklog(NONE/READY/LOADING/FAILED/미지값)`·`convertAdfComment` 의 throw 계약 |
| `pages/myWork/modal/__test__/worklogTimeRange.test.js` (무수정 통과) | 시간 범위 파싱·`formatWorklogDuration`·legacy 판정 — 패널이 같은 모듈을 쓰므로 양쪽이 같은 값을 본다 |
| `pages/myWork/modal/__test__/scheduleMutation.test.js` (무수정 통과) | 일정 mutation 경로(모달 추출과 무관함을 확인) |
| `components/worklog/__test__/worklogWrite.test.js` | 추출된 생성/수정/삭제가 **추출 전과 같은 `executeRequest` 인자**를 만든다(회귀의 실질 판정) |
| `components/worklog/__test__/useWorklogComment.test.js` | 추출된 상태기계가 추출 전 effect 와 같은 전이를 한다(+ LOCKED 신규) |

**의도된 동작 변화(회귀가 아니라 목표, 설계 §6-4):** 마이워크 모달도 같은 훅을 쓰므로 손실 ADF 가드가
**함께 적용**된다. 이미지·멘션이 든 코멘트는 본문 편집이 잠기고(평문 미리보기 + 안내), 날짜·시간만 수정되며
저장 시 `comment` 를 보내지 않아 원본이 보존된다. 같은 손실이 마이워크에도 있었다.

**추출 시 동작 보존을 위해 추가한 것:** `useWorklogComment(comment, resetToken)` 의 2번째 인자.
기존 effect 의존성은 `[worklogInfo, commentReloadKey]` 였고 `comment` 객체 하나로는 그 트리거를 재현할 수 없어,
모달이 `worklogInfo` 를 `resetToken` 으로 넘긴다.

---

## 5. 번들 (main 불변 여부 증빙)

| 번들 | 파일 | raw | gzip |
|---|---|---|---|
| main (변경 전 기준선) | `main.a1d07960.js` | 1,763,766 | **477,399** |
| main (변경 후) | `main.e16fc227.js` | 1,776,732 | **481,157** (+3,758 / +0.79%) |
| panel | `main.aada683b.js` | 1,256,224 | **329,108** (예산 350,000) |

### 🔴 main 이 비트 단위로 동일하지 **않다** — 원인과 근거

설계 §6-1 은 "기존 `build:app` 산출물이 비트 단위로 그대로"를 기대했다. **빌드 배관 자체는 그렇다**
(§3 의 `cracoPanelPaths.test.js` 가 `PANEL_BUILD` 없이 훅이 입력 객체를 그대로 돌려줌을 고정).
증가분은 **소스 변경** 때문이고, 의도된 것이다:

- `WorklogModal` 이 이제 `WorklogCommentField` 를 쓴다 → `@atlaskit/section-message`·`@atlaskit/badge`·
  `pages/worklogExport/utils/adfToPlainText.js`·`components/worklog/*` 가 **main 정적 그래프**에 들어왔다
  (`WorklogPage` 가 기본 진입 라우트라 정적 import).
- 증빙(빌드 산출물 grep):
  - `worklog.comment.locked.title` → `build/static/js/main.*.js` **1건** (새로 들어옴)
  - `issuePanel.state.loadError` → main **0건** / `build-panel/.../main.*.js` **1건** (패널 코드는 main 에 없다)

즉 +3.7KB gzip 은 "손실 ADF 가드를 마이워크에도 적용한 값"이다. 예산 참고선(950,000) 대비 여유는 그대로다.

### 패널 번들이 앱 셸을 끌고 오지 않는다 (grep 증빙 — `.map` 제외)

| 마커 | `build-panel/static/js/*.js` |
|---|---|
| `scheduleTypeOptions`(myWork) · `fullcalendar` · `echarts` · `react-grid-layout` | **0건** |
| `@sentry/react` · `AppLayout` | **0건** (`.map` 파일에만 등장 — 공용 node_modules 소스맵) |
| `searchIssueWithJQL` · `createHistory` | main 1건 — `requestJira.js` 의 `REQUEST_MAP` 과 `@forge/bridge` view API. 모듈 단위라 불가피하고 문자열 수준이다 |

패널 최대 청크는 마크다운 에디터(331KB gzip)이며 **lazy 유지**다 — 요약 화면은 빠른 입력을 열 때만 받는다.

---

## 6. UI/UX (설계 §6-6 대응)

Atlaskit 네이티브 + RFC-178 공용 지점만 썼다. 신규 시각 요소를 발명하지 않았다.

| 요소 | 재사용 |
|---|---|
| KPI 타일 | `components/card/Summary.jsx` `KpiTile` |
| 진행률 바 | `pages/projectDetail/work/map/CardProgressBar.jsx` (`percent==null` → 빈 바 + `-`) |
| 로딩 | `components/skeleton/Skeleton.jsx` `SkeletonCards(2,72)` + `SkeletonText(3)` — **패널 형상 그대로**. `PageSkeleton` 미사용. **스피너 0개** |
| 마크다운 | `components/markdown/MarkdownEditorLazy.jsx` `LazyMarkdownEditor`/`MarkdownEditorSkeleton` |
| 날짜/시간 | `@atlaskit/datetime-picker` + `worklogTimeRange.TIME_PRESET_OPTIONS` |
| 안내 | `@atlaskit/section-message` |
| 툴팁/ⓘ | `@atlaskit/tooltip` (KPI 2타일에 "MM은 이번 달 근무일 기준입니다") + `pages/projectDetail/progress/InfoTip.jsx` |
| 행 액션 | `@atlaskit/button/new` `IconButton` + `icon/core/edit`·`delete`. **모달 없음** — 인라인 확장/확인 |
| 잠긴 코멘트 | `pages/worklogExport/utils/adfToPlainText.js` + `@atlaskit/badge`(손실 개수) |
| 상태 배지 | `components/lozenge/StatusLozenge.jsx` `IssueStatusLozenge` |
| 사용자 | `components/avatar/UserAvatar` |
| 색 | 브랜드 틸 `#21ADAD` — 진행률 바 `accent` + 투입 공수 `valueColor` **에만**. 커스텀 색은 `style` 로만(RFC-199) |

**표기 규칙:** MM 소수 2자리 / MD 소수 1자리 / 시간 `formatWorklogDuration`.
**`null` 을 `0` 으로 표시하지 않는다** — 계획 미입력은 `-`, 진행률은 빈 바 + `-`. `panelMetrics.test.js` 가 고정.

**구현한 상태 전부:** `booting`(스켈레톤) · `licenseBlocked` · `loadingData` · `loadError` · `notLinked` ·
`denied`(KPI·입력 유지, 이름·딥링크만 숨김) · `timeTrackingOff`(시도 기반 판별) · `noJiraPermission`(확정 false 만, Tooltip) ·
`saving` · `saved` · `saveError` · `rowActionable`/`rowEditDisabled`/`rowDeleteDisabled`/`rowEditing`/
`rowCommentLoading`/`rowCommentFailed`/**`rowCommentLocked`**/`rowCommentDegrading`/`rowSaving`/
`rowConfirmDelete`/`rowDeleting`/`rowActionError`.

---

## 7. i18n

| 파일 | 변경 |
|---|---|
| `locales/kr/issuePanel.json` · `locales/en/issuePanel.json` | **신규** (title/kpi/form/recent/row/summary/link/state) |
| `locales/kr/worklog.json` · `locales/en/worklog.json` | `comment.locked.{title,description,counts,preview}` · `comment.degrading` 추가 |
| `locales/kr/setting.json` · `locales/en/setting.json` | `issueLinkBackfill.{title,description,start,running,done,failed}` 추가 |

- ✅ `cd static/ui && npm run merge` **실행 완료** (빌드 `prebuild` 로도 한 번 더 실행됨).
- ✅ `ko-KR.json`/`en-US.json` **직접 수정 없음**. `locales/script/*.json`(빈 스텁)에는 넣지 않았다.
- ✅ 산출물 검증: 패널·워크로그·설정 코드에서 쓰는 **`t()`/`tFormat()` 키 104개 전부** ko/en 양쪽에 문자열로 존재(스크립트 전수 확인, 누락 0).
- 설계 §8 의 `issuePanel.form.retry` 는 **추가하지 않았다** — 기존 `common.button.retry` 와 중복이라 그것을 쓴다(죽은 키를 만들지 않기 위해).
- 치환은 `utils/i18n.tFormat` 사용(Forge `t()` 는 interpolation 미지원).

---

## 8. 설계 이탈 / 판단

| # | 이탈 | 이유 |
|---|---|---|
| 1 | 설계 §2-B 는 `getPublicHolidayList` 응답을 `{success, rows:[...]}` 로 적었지만 **실제 훅은 `res.data`** 를 읽는다(`utils/usePublicHolidayList.js:12`) | 기존 공용 훅을 그대로 재사용했으므로 우리 코드에 영향 없음. **설계서 표의 오기**로 기록해 둔다(백엔드 계약 변경 아님) |
| 2 | `craco.config.js` paths 직접 mutate → **craco `paths` 훅** | §3 — 직접 mutate 는 실측에서 동작하지 않았다(패널 빌드가 조용히 main 을 재생산) |
| 3 | `panel/` 파일 11개 → **12개** (`panelMetrics.js` 신설) | 지표 계산을 훅에서 떼어 순수 함수로. 두 화면의 숫자 동일성을 렌더가 아니라 테스트로 고정하기 위해(V5 검증 대상) |
| 4 | `commentLoadState.js` 에 **`canWriteWorklogComment` 신설**(설계에 없음) | "저장해도 되나"와 "본문을 써도 되나"는 `LOCKED` 에서 답이 갈린다. 한 함수로 묶으면 호출부가 어느 쪽을 물었는지 흐려진다 |
| 5 | `findProjectById` 를 **패널 전용 쿼리키**(`issuePanelKeys.project`)로 조회하고 `{row, denied}` 로 정규화 (설계는 공용 `findProjectByIdQueryKeys` 재사용) | **2차 수정(§12 F3).** 공용 키에는 이미 두 shape 이 섞여 있다 — `ProjectDetailPage`/`ProjectIssueMapView` 는 응답 객체, `ProjectModal` 은 `rows[0]`. 어느 쪽을 따라가도 계약을 어긴다. 패널은 별 iframe 이라 공유 이득도 없다 |
| 6 | 패널 예산 참고선 300,000 → **350,000** | 설계 지시대로 "첫 측정값 + 6%"(329,317 × 1.06 ≈ 349,076) |
| 7 | 최근 워크로그 표시 건수 = **5** | 설계 "3~5건" 범위의 상한 |
| 8 | `WorklogModal` 의 `coworkerFieldId` dead prop · 하드코딩 한글 10개 | 설계 지시대로 **건드리지 않았다**(범위 밖 회귀 위험) |
| 9 | `bitbucket-pipelines.yml` | 지시대로 **변경하지 않았다** → §9 |

---

## 9. 🔴 리더 판단이 필요한 것 — CI 파이프라인 (적용 대기)

패널 산출물이 Build step artifacts 에 없으면 Deploy step(별도 컨테이너, 빌드 재실행 안 함)에서
`static/ui/build-panel` 이 비어 **`forge deploy` 가 깨진다.** `develop`·`master` **두 브랜치 모두** 필요하다.

`bitbucket-pipelines.yml` — 현재 L30-31 과 L63-64, 두 곳 모두:

```yaml
          artifacts:
            - static/ui/build/**
            - static/ui/build-panel/**      # ← 추가 (RFC-202)
```

`npm run build` 가 이미 `build:panel` 을 포함하므로 **script 블록은 변경 불필요**하다.

---

## 10. 미구현 / 미검증

| # | 항목 | 비고 |
|---|---|---|
| 1 | `bitbucket-pipelines.yml` artifacts | §9 — 지시에 따라 리포트에만 기록 |
| 2 | **V1** `displayConditions.entityPropertyEqualTo` + `objectName` 이 미선언 프로퍼티에서 평가되는가 | 배포 실측 항목. 실패 시 `jira:entityProperty` 블록 추가(백엔드 ~5줄) |
| 3 | **V3** 🔴 `PUT .../worklog/{id}` 에서 `comment` **생략** 시 원본 코멘트 보존 여부 | 배포 실측. **폴백은 한 줄 분기다** — `buildWorklogUpdateBody` 에서 `body.comment = 원본 ADF` 로 되돌리면 된다(원본 ADF 는 `issuePanelKeys.worklogs` 캐시에 이미 있어 추가 왕복 0). 구현 지점이 한 곳으로 수렴돼 있다 |
| 4 | **V4** 구 이슈 화면에서 활동 탭이 없다는 문서 기술의 실제 영향 | 요약(`issueContext`)이 폴백 진입점 |
| 5 | E6·E9·E10·E11·E12 (다크 모드 / 300px 레이아웃 / 두 모듈 숫자 일치 / 수정·삭제 후 KPI 갱신) | 브라우저 필요 — 자동화 불가 |
| 6 | E7 마이워크 모달 수동 회귀(단일/기간 입력·코멘트 로드·삭제·롤백) | 테스트로 계약은 고정했으나 실화면 미확인 |
| 7 | `jira:issueActivity`/`jira:issueContext` 의 `view.getContext()` 에 `extension.issue.key`·`moduleKey` 가 실제로 오는가 | 문서 기준으로 구현(`context.extension.issue.key` / `context.moduleKey`). `issueKey`·`issueId` 둘 다 폴백으로 받고(`issueIdOrKey`), `moduleKey` 부재 시 폭 폴백이 있어 **어느 쪽이 비어도 빈 화면은 되지 않는다** |
| 8 | 백필 진행률의 실제 폴링 거동 | resolver 계약(백엔드 리포트 §2-2)대로 구현. 실잡 1회 실행은 E8 |

---

## 11. 검증자(integration-verifier)가 먼저 볼 지점

1. **§1 의 `invoke().content` 접근 경로** ↔ `02_backend_report.md` §2 (특히 `content.jobId === null` 분기).
2. **§2-3 손실 ADF 가드 3조각**이 같은 변경에 함께 있는지 (V5b). `grep "'updateWorklog'" static/ui/src` → `components/worklog/worklogWrite.js` 1곳으로 수렴하는지 (V5a).
3. **다중 shape 재사용**(V5): `KpiTile`·`CardProgressBar` 에 넘기는 `null` 의 의미가 기존 소비처와 같은지 —
   `PanelKpi` 는 `null` 을 `?? 0` 으로 삼키지 않고 `issuePanel.kpi.none`(`-`)으로 낸다.
   `PanelKpi`/`PanelWorklogForm` 의 `compact` 두 모드는 **같은 `metrics` 객체**를 받는다(계산은 `panelMetrics.js` 하나).
4. **i18n**(V6): §7 의 전수 확인 스크립트 결과(104/104). 패널 코드의 한글 리터럴은 0이어야 한다.
5. **성능**(V7): 공통 워크로그 페치 경로 **미수정**. 패널은 자기 이슈 1건만 조회하고 프로젝트 단위 대량 조회를 하지 않는다.

---

## 12. 2차 반영 — Codex 검토 3건 + 백엔드 응답 변경 1건 (2026-09-22)

### F1 워크로그 조회 실패를 "0건"으로 오보 (보통) — 수정

**문제:** `hasLoadError` 가 `issueQuery.isError` 만 보고, 워크로그 실패는 `worklogs: []` 로 흘러
READY 화면에 **"기록된 워크로그가 없습니다 / 내 몫 0 MM"** 이 떴다. 실패를 "기록이 없다"로 바꿔 말하는
것이고, 그렇게 읽은 사용자는 **이미 있는 기록을 중복으로 다시** 남긴다.

**수정 — 전체 화면을 덮지 않고 영역만 오류로:**

| 지점 | 변경 |
|---|---|
| `panel/panelMetrics.js` | `worklogsUnavailable` 입력 추가 → `mineSeconds/mineMd/mineMm = null`(모름), `worklogTotal = null`, `isMineApproximate = false`(근사가 아니라 미상이다) |
| `panel/useIssuePanelData.js` | `worklogsUnavailable: worklogQuery.isError` 전달 + `isWorklogError`·`refetchWorklogs` 노출 |
| `panel/PanelRecentWorklogs.jsx` | `isError` 분기 — `SectionMessage appearance="error"` + **[다시 시도]**. 빈 목록으로 그리지 않는다 |
| `panel/IssueActivityPanel.jsx` | `isError`/`onRetry` 배선 |
| `panel/IssueContextSummary.jsx` | 목록이 없는 요약 화면에도 사유 1줄 — `-` 가 "0" 으로 읽히지 않게 |
| `PanelKpi` | 변경 없음 — `mineMm === null` 이면 이미 `issuePanel.kpi.none`(`-`)을 낸다 |

**`hasLoadError` 에 워크로그 실패를 합치지 않은 이유:** 이슈 조회가 실패하면 보여줄 것이 아무것도
없지만(연결 표식·계획·투입이 전부 그 응답에 있다), 워크로그만 실패한 경우 계획·투입은 **이슈 조회에서 온
유효한 값**이다. 전체를 오류로 덮으면 아는 사실까지 지우게 된다 — 없는 사실을 만드는 것과 같은 종류의 거짓이다.
그래서 계획·투입 MM 은 숫자로 남기고, **워크로그에서 파생되는 "내 몫"과 건수만** `-` 로 만들었다.
(코디네이터 지시의 "투입 MM 은 `-`" 는 투입 타일 **안의 내 몫 하위줄**로 해석했다 — `fields.timespent` 는
워크로그 조회와 무관하게 Jira 가 준 값이다. 다르게 원하면 `panelMetrics.js` 한 줄이다.)

**테스트:** `panel/__test__/panelMetrics.test.js` — "워크로그 조회 실패" 5 케이스
(내 몫 null / 건수 null / 근사 플래그 미설정 / 계획·투입 유지 / 성공 경로 회귀).
**i18n:** `issuePanel.recent.loadError` 추가 + merge.

### F2 `projectId` path/query 주입 (보통) — 수정

**문제:** 딥링크가 `movesRmsLink.projectId` 를 경로에 **그대로** 넣었다. 이 값은 우리 DB 가 아니라
**Jira 이슈 프로퍼티**에 있고, `PUT /issue/{key}/properties/movesRmsLink` 권한이 있으면 우리 앱 밖에서도
쓸 수 있다. `3?tab=dashboard&view=gantt` 나 `../../backoffice/permission` 이 오면 그대로 주입된다.

**수정 (`utils/forgeAppUrl.js`) — 2겹:**
1. `isValidProjectId()` — UUID 형식이 아니면 **URL 자체를 만들지 않는다**(`null` → `PanelOpenInAppLink` 가 렌더를 생략).
2. `encodeURIComponent(projectId)` — 검증을 통과한 값도 경로 세그먼트로 인코딩.

①만 두면 형식 판정이 언젠가 느슨해질 때 그대로 뚫리고, ②만 두면 "열리지만 엉뚱한 화면"이 된다.

**UUID 검증이 안전하다는 근거(추측이 아니라 확인):** `src/rdb/schema/ddl/project.sql.js` 가
`project_id BINARY(16)`, 조회가 `BIN_TO_UUID(project_id) AS project_id`(`src/rdb/query/ProjectQuery.js`).
즉 실제 id 는 UUID 다. 설계서 §6-5 의 `/project/3` 예시는 **예시일 뿐**이었고, 그에 맞춰 두었던
기존 테스트(F7)가 숫자 id 를 기대하고 있었으므로 **UUID 로 고쳤다**.

**테스트:** `utils/__test__/forgeAppUrl.test.js` — `isValidProjectId` 통과/거부 표 +
주입 시도 7종(query 주입 / 경로 탈출 / 세그먼트 추가 / 프래그먼트 / 절대 URL / `javascript:` / 숫자 id)
전부 `null` + "쿼리 구분자는 우리가 붙인 하나뿐" 검사.

### F3 공용 쿼리키 shape 계약 위반 (보통) — 수정

**문제:** 패널이 `findProjectByIdQueryKeys` 에 `{success, rows}` 를 통째로 넣었다.
**확인해 보니 그 공용 키에는 이미 두 shape 이 들어간다** —
`ProjectDetailPage.jsx:40`·`ProjectIssueMapView.jsx:83` 은 응답 객체를, `ProjectModal.jsx:99-104` 는
`rows[0]` 를 캐시한다. 즉 패널이 어느 쪽을 따라가도 나머지 한쪽과 어긋난다.

**수정:** 패널 전용 키 `issuePanelKeys.project(projectId)` 신설 + `queryFn` 이
`{row, denied}` 로 **정규화**해 소비부가 shape 을 다시 풀지 않게 했다. 패널은 별 iframe·별
QueryClient 라 공용 키를 쓸 이득도 없다.
`findProjectByIdQueryKeys` import 제거 → `useIssuePanelData.js` 는 이제 공용 프로젝트 키를 쓰지 않는다.

> 공용 키의 shape 통일(응답 객체 vs row)은 **이 RFC 범위 밖**이다. 기존 3개 소비처를 동시에 고치는
> 변경이라 회귀 범위가 크다. 사실만 `issuePanelKeys.js` 주석에 남겼다.

**테스트:** `queryKeyFactories.test.js` — `issuePanelKeys.project` 형태 + `all` prefix 포함 +
`findProjectByIdQueryKeys` 와 **절대 같아지지 않음**. `queryKeyContract.test.js` 통과 유지.

### F4 백필 시작 응답 변경 (백엔드 Codex 수정 반영) — 수정

백엔드가 단일 실행 보장을 넣으면서 응답에 **`alreadyRunning` 필드가 추가**됐다(리포트 §2-1/§7-0).

```js
{ success: true,  content: { jobId: string|null, projectCount, alreadyRunning: boolean } }
{ success: false, error: { code: 'ISSUE_LINK_BACKFILL_ENQUEUE_FAILED', … } }
```

**수정:** 5분기 판정을 컴포넌트에서 떼어 순수 모듈로 옮겼다 —
`backoffice/page/setting/issueLinkBackfill.js` 의 `interpretBackfillStart(result)`.
분기 중 **셋은 폴링을 붙이면 안 되는** 경우이고, 잘못 붙이면 서버가 매번 "DONE 전부 0" 을 돌려줘
**실행되지 않은 백필이 "완료(실패 0건)"로 보인다.** 그래서 렌더가 아니라 이 함수의 테스트로 고정했다.

| 응답 | outcome | 폴링 | 안내 |
|---|---|---|---|
| `jobId` 있음 · `alreadyRunning:false` | `STARTED` | ✅ | 없음(진행률이 그 자리를 대신한다) |
| `jobId` 있음 · **`alreadyRunning:true`** | `JOINED` | ✅ **그 jobId 로 붙인다** | `setting.issueLinkBackfill.alreadyRunning` (information) — "이미 진행 중인 백필이 있어 그 작업의 진행률을 표시합니다. 새로 시작하지 않았습니다." |
| `jobId: null` | `NO_TARGET` | ❌ | `…noTarget` (information) |
| `error.code === 'ISSUE_LINK_BACKFILL_ENQUEUE_FAILED'` | `ENQUEUE_FAILED` | ❌ | `…enqueueFailed` (error) — "…잠시 후 **다시 실행할 수 있습니다**" (잡이 FAILED 로 닫히므로) |
| 그 외 실패 · invoke throw | `FAILED` | ❌ | `…failed` (error) |

부수 결정:
- `jobId: null` 인데 `alreadyRunning: true` 인 모순 응답은 **`NO_TARGET`**(폴링 금지)으로 접는다 — 붙일 잡이 없다.
- `alreadyRunning` 은 **`=== true` 만** 인정한다. 필드가 없는 구버전 응답은 `STARTED`(안내만 없어지고 폴링은 같다).
- `getIssueLinkBackfillStatus` 는 변경 없음.

**테스트:** `backoffice/page/setting/__test__/issueLinkBackfill.test.js` — 11 케이스.
핵심은 **"jobId 가 있는 분기는 STARTED·JOINED 둘뿐"** 을 5분기 전수로 확인하는 폴링 계약 테스트다.
**i18n:** `setting.issueLinkBackfill.{alreadyRunning,noTarget,enqueueFailed}` 추가 + merge.

### 2차 반영 후 검증

```
npx jest            → 123 suites / 2001 tests 전부 통과 (신규 1 suite / +26 tests)
CI=true npm run build
  main  gzip 481,151 B (예산 950,000)   ← 1차 481,157 에서 -6 B
  panel gzip 329,317 B (예산 350,000)
i18n  → 사용 키 110개 ko/en 전수 존재(동적 키 `BACKFILL_START_MESSAGE_KEY` 포함), 누락 0
```

리더가 먼저 반영한 `WorklogCommentField.jsx:89` 의 `worklog.comment.locked.emptyPreview`(검증 F-2)는
**그대로 두었다** — merge 산출물에 키가 있음을 확인했다.

`manifest.yml`·`src/` 는 건드리지 않았다. 커밋·stash 없음.
