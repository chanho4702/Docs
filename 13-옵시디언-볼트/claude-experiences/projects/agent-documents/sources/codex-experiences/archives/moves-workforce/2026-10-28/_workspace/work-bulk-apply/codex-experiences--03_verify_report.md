# 작업관리 목록 뷰 일괄 적용 — 통합 정합성 검증 리포트

> 검증 2026-08-13 / 기준 설계서 `01_architect_design.md` §8(검증 포인트 9건) + 추가 교차 비교
> 대상 커밋 기준 `8dd1002`(develop) + 미커밋 워킹트리
> 백엔드 변경 0건(`02_backend_report.md` 없음) — resolver 계약은 **실코드를 직접 읽어** 대조했다.

---

## 0. 판정 요약

| 분류 | 건수 | 항목 |
|------|------|------|
| **통과** | 12 | §8-1~§8-9 전 항목 + F1 diff + 테스트/빌드 + 다중 shape |
| **실패** | 0 | 데이터 파손·경계면 shape 불일치·규약 위반 **없음** |
| **결함(회귀 아님)** | 2 | F-1 시간추적 오탐(기존 결함 상속) / F-2 권한 실패코드 미매핑 |
| **관찰·문서 불일치** | 4 | O-1 음수 MD 무안내 / O-2 설계서 §6 키 불일치 / O-3 재시도 후 집계 표시 / O-4 훅 시그니처 |
| **미검증** | 3 | E2E 3건(실 Jira 사이트) |

**결론: 배포 차단 사유 없음.** F-1/F-2 는 실패 **메시지 정확도**에만 영향하고 데이터 정합·캐시 규약·왕복 수에는 영향이 없다.

---

## 1. 경계면 교차 비교 (생산자 ↔ 소비자 동시 읽기)

### 1-1. `invoke('updateGanttSchedule', …)` — **통과**

| | 생산자 | 소비자 |
|---|--------|--------|
| 위치 | `src/resolver/gantt/GanttService.js:138-167` | `static/ui/src/pages/projectDetail/issue/useBulkApply.js:58-65` |
| 등록 | `src/resolver/gantt/GanttController.js:26` `guardedDefine(resolver,'updateGanttSchedule',…)` | fnName 일치 |
| 래핑 | `src/utils/ResponseWrapper.js:11-14` → `{ success:true, ...result }`, Service 반환이 `{ content:{ issueKey, start, due } }` → 최종 `{success:true, content:{…}}` | `result.content.start` / `.due` 접근 — **래핑 단계 일치** |
| 실패 | `{ success:false, error:{ name, code, message, cause } }` | `if (!result \|\| result.success !== true)` — **truthy 판정이 아닌 명시 비교** ✓ |
| throw | 없음(래퍼가 전부 흡수) | throw 를 기대하는 코드 없음 ✓ |

설계서 §2-1 표와 **실코드가 일치**한다. 추가로 확인:

- `GanttService.js:143-144` `normStart = start \|\| null` — 프론트가 `''` 를 보내도 `null` 로 정규화된다. 프론트는 `normalizeDateInput`(`bulkApply.js:17-21`)으로 이미 `''`→`null` 처리하므로 이중 안전.
- **`projectId` 미검증 전제 유효** (`GanttService.js:138-158`에 `projectId` 사용처 없음, 주석 `:132` 그대로). 설계서 §7 backend 검증 항목 통과 — 구독 스페이스 편입 이슈도 그대로 통과한다.
- `PermissionMap.js:253` `updateGanttSchedule: W('PROJECT','inherited')` ↔ 프론트 게이트 `ProjectIssuePanel.jsx:59` `canBulkApply = canWrite('PROJECT')` — **일치**. 칸반 컨텍스트(`canEdit = canWrite('KANBAN')`)로 열리지 않는다.

### 1-2. `executeRequest('updateIssue', {fields:{timetracking}})` — **통과**

| | 생산자 | 소비자 |
|---|--------|--------|
| 위치 | `static/ui/src/utils/jiraApi/requestJira.js:165-190` | `useBulkApply.js:70-86` |
| 성공 | 204 → `''`, 그 외 파싱된 JSON | 실패 아님으로 통과 (`''?.success === undefined`) ✓ |
| 실패 | `{ success:false, error:{ name, code, message, cause } }` (throw 안 함) | `if (result?.success === false)` ✓ |
| payload | `buildTimetrackingPayload(originalEstimate, remainingEstimateSeconds)` (`useJiraEditGuards.js:100-106`) | `target.remainingSeconds` 를 그대로 전달 — 단건 편집(`ProjectIssueTable.jsx:332`)과 **같은 헬퍼** ✓ |

### 1-3. 서비스 내부 소비자 — **해당 없음(통과)**

백엔드 변경 0건이므로 `updateGanttSchedule` 의 반환 계약이 바뀌지 않았다. `src/` 전역에서 `updateGanttSchedule` 호출부는 `GanttController.js:27` 1곳뿐이다 — 내부 재사용 회귀 위험 없음.

### 1-4. 다중 shape 재사용 컴포넌트 — **통과**

`BulkApplyModal` / `useBulkApply` 에 넘어가는 `target` 객체는 **생산자가 단 하나**다.

| 필드 | 생산(`ProjectIssueTable.jsx:139-146`) | 소비 |
|------|--------------------------------------|------|
| `issueKey` | `issue.key` | `useBulkApply.js:53,58,80,120` |
| `currentStart` | `issue.fields?.customfield_10015 ?? null` | `bulkApply.js:66` |
| `currentDue` | `issue.fields?.duedate ?? null` | `bulkApply.js:67` |
| `remainingSeconds` | `issue.fields?.timetracking?.remainingEstimateSeconds ?? null` | `useBulkApply.js:76` |
| `spentSeconds` | `issue.fields?.timetracking?.timeSpentSeconds ?? null` | `bulkApply.js:144` |
| `statusKey` | `issue.fields?.statusCategory?.key ?? null` | `bulkApply.js:144` |

6필드 전부 생산·소비 이름·의미 일치. **`?? 0` 로 결함을 삼키는 지점 없음**(모두 `?? null` + null 을 유의미하게 처리).
소스 필드가 실재하는지도 확인: 목록 조회가 `fields:['*all']`(`useWorkListQueries.js:88`)이라 `customfield_10015`·`duedate`·`timetracking`·`statusCategory` 가 모두 응답에 들어온다 — **추가 GET 불필요 전제 성립**.

### 1-5. 간트 캐시 필드명 대조 — **통과**

| 패치 필드 | 간트 자신의 mutation | 일괄 적용 |
|-----------|---------------------|-----------|
| 일정 | `useGanttMutations.js:147` `{ start, end }` | `bulkApply.js:139-140` `patch.start` / `patch.end` ✓ |
| MD | `useGanttMutations.js:646` `{ originalEstimateSeconds }` | `bulkApply.js:142` ✓ |
| progress | `useGanttMutations.js:641` 스냅샷 대상 + `computeProgressLocal` 재계산 | `bulkApply.js:143-145` **재계산 포함** ✓ |
| 쿼리키 | `ganttKeys.data(projectId)` (`projectKeys.js:99`) | `useBulkApply.js:103` 동일 ✓ |

`hourRate` 출처도 간트와 동일하다 — 목록: `ProjectIssuePanel.jsx:52` `settingData?.hourRate \|\| 8`, 간트: `GanttPage.jsx:83` 동일 식. `plannedHours` 도 같은 함수를 import 한다(복제 없음).

---

## 2. 설계서 §8 검증 포인트 9건

### §8-1 미입력 날짜 보존 — **통과 (최우선 항목)**

체인 전체를 추적했다.

```
issue.fields.customfield_10015 / issue.fields.duedate      ← 목록 캐시 행 (fields:['*all'])
  → ProjectIssueTable.jsx:141-142  currentStart / currentDue
  → BulkApplyModal.jsx:74  run(targets, values)
  → useBulkApply.js:57  resolveScheduleArgs(target, values)
  → bulkApply.js:65-68
       start: values?.start != null ? values.start : (target?.currentStart ?? null)
       due:   values?.due   != null ? values.due   : (target?.currentDue   ?? null)
  → invoke('updateGanttSchedule', { projectId, issueKey, start, due })
  → GanttService.js:153-156  fields = { customfield_10015: normStart, duedate: normDue }
```

`values.start` 는 `normalizeDateInput` 이 `''`/공백을 `null` 로 만들므로 "미입력"이 확실히 `null` 이고, `!= null` 비교라 `''` 오판이 없다. **기한만 입력해도 기존 시작일이 `null` 로 PUT 되지 않는다.**
`bulkApply.test.js:49-72` 4케이스로 고정돼 있고 전량 통과.

부작용(기존 시작일 > 새 기한 → 서버 `GANTT_INVALID_DATE_RANGE`)은 설계서 §2-3 이 명시한 **정상 건별 실패**이며, `classifyScheduleFailure`(`bulkApply.js:73`)가 `gantt.error.dateRange` 로 정확히 매핑한다.

### §8-2 경계면 / §8-3 executeRequest 실패 판정 — **통과** (§1-1·§1-2 참조)

추가 확인: `useBulkApply.js:63-65` 가 `content.start !== undefined ? content.start : start` 로 갈랐다. `??` 였다면 서버가 확정한 `null` 이 우리가 보낸 값으로 되돌아간다 — **올바른 선택**이다.

### §8-4 캐시 규약 (invalidate 0회) — **통과**

`static/ui/src/pages/projectDetail/issue/` 전역 grep 결과 `useBulkApply.js` 에는 `invalidateQueries` 가 **0건**(주석 1줄만 존재, `:31`).
- 목록: `patchGroupPage`(= `setQueryData`, `useWorkListQueries.js:139`) 1회.
- 요약(`workListKeys.summary`): 손대지 않음 ✓.
- 간트: `getQueryData(ganttKey) === undefined` 면 즉시 return(`useBulkApply.js:104`) → 간트를 연 적 없으면 비용 0 ✓.

### §8-5 셀 수 정합 — **통과**

- `showSelectColumn`(`ProjectIssueTable.jsx:111`) **단일 변수**를 head(`:205`)와 rows(`:355`)에 동일 적용 → 셀 수 불일치 구조적으로 불가.
- `__deleted` 행은 `selectableIssues`(`:114-117`)에서 제외 → 전체선택·`bulkTargets` 에 섞이지 않고, 빈 행(`:633` `{keys:null, cells:[]}`)에는 체크박스가 생기지 않는다.
- `rows` useMemo 의존성에 `showSelectColumn`·`selectedKeys` 포함(`:635`) — 체크 상태가 화면에 반영된다.
- 공용 테이블 셸 부작용도 확인: `select` 컬럼은 `isSortable` 이 없어 `resolveSortableColumns`(`tableSort.js:78`)가 false 로 판정 → 죽은 화살표 없음. `isResizable:false` 는 `adaptHead`(`tableSort.js:121`)가 `<th>` 로 새기 전에 제거하고 `TableSurface.jsx:122` 의 `edges` 로만 쓰인다. `headSignature`(`useStableColumnWidths.js:24-28`)에 `select` 가 포함되므로 권한에 따라 컬럼이 생겼다 사라져도 **폭이 원자적으로 재계측**된다.

### §8-6 동시성 — **통과**

- `p-limit` import **0건**(신규 4파일 전수 확인).
- `mapWithConcurrency` 재사용(`useBulkApply.js:6,128`), 상한 `BULK_APPLY_CONCURRENCY = 3`(`:35`).
- worker 내부에서 `try/catch` 로 감싸 개별 예외가 `Promise.all` 을 중단시키지 않는다(`:129-137`) — `mapWithConcurrency`(`useJiraUserInfos.js:34-49`)는 rejection 을 전파하므로 이 catch 가 **필수**였다. 올바르다.

### §8-7 추가 왕복 — **통과**

`useBulkApply.js` 에 `searchByIssueId` / `getIssue` 호출 **0건**(grep 확인). 이슈당 `invoke` 1 + `updateIssue` PUT 1 = **50건 적용 시 최대 100회**. Jira 권한 사전 판정은 테이블이 이미 가진 `useJiraProjectPermissions(groupKey)`(`ProjectIssueTable.jsx:163`) 결과를 prop 으로 내려 추가 왕복 0회.

### §8-8 MD `0` 입력 — **통과**

`parseMdInput`(`bulkApply.js:28-35`)이 `''`→`null`, `'0'`→`0`. `parseFloat('') || 0` 관용구 없음.
end-to-end 도 성립: `plannedHours(0, rate)=0` → `'0h'` PUT → `applied.mdSeconds = 0` → `applyIssuePatches` 의 `!== undefined` 판정(`bulkApply.js:125`)을 통과해 `originalEstimateSeconds: 0` 으로 캐시 반영 → `computeProgressLocal(statusKey, 0, spent)` 가 `orig > 0` 실패로 `null`(done 이면 1) — **백엔드 `GanttMapper` 산식과 동일**.

### §8-9 i18n — **통과**

- `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` 의 `issue.bulk` 에 22키 존재(kr/en **양쪽**).
- `npm run merge` 산출물 반영 확인: `locales/ko-KR.json` · `locales/en-US.json` 의 `projectDetail.issue.bulk` 에 동일 22키.
- `ko-KR.json`/`en-US.json` 직접 수정 흔적 없음(merge 산출 형태 유지), `locales/script/*.json`(빈 스텁)에 넣지 않았다.
- 변경 파일 4개에서 `t('…')` 로 참조하는 **실키 53개 전량**이 ko/en 양쪽에 문자열로 존재(스크립트 검사). 재사용 키 `gantt.error.dateRange`, `projectDetail.issue.jiraPermission.edit|schedule`, `projectDetail.issue.timeTracking.disabled`, `common.toast.title.success`, `projectDetail.issue.toast.update.success` 전부 확인.
- **하드코딩 한글 0건** — 렌더 문자열 전수 스캔 결과 JSX 주석 1줄(`BulkApplyModal.jsx:192`)만 검출.

---

## 3. F1 export 무변경 검증 — **통과**

`git diff` 로 확인. 두 파일 모두 **로직 본문 변경 0**.

| 파일 | 변경 |
|------|------|
| `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` | 3 hunk, 전부 `function X(` → `export function X(` 한 글자 추가뿐. `patchTask`/`plannedHours`/`computeProgressLocal` 본문 **완전 동일** |
| `static/ui/src/utils/useJiraUserInfos.js` | `const mapWithConcurrency` → `export const mapWithConcurrency` + **JSDoc 주석 1줄 추가**. 함수 본문 완전 동일 |

성능 감사 결과물(P1-14 / 2026-08-12 롤백 설계) 회귀 없음.
※ `useJiraUserInfos.js` 에 git 의 `LF→CRLF` 경고가 뜨지만 개행 정규화일 뿐 내용 변경 아님.

---

## 4. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 jest | `npm test` (루트) | **72 suites / 1128 tests 전부 통과** (exit 0) — 백엔드 무변경 확인 |
| 프론트 jest 전량 | `cd static/ui && npx jest` | **76 suites / 1269 tests 전부 통과** (exit 0), 회귀 0 |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공** (exit 0). `bundle:check` → `main.js gzip 432,929B / budget 950,000B, withinBudget: true` |

프론트 리포트 §5 의 수치와 **완전 일치**한다(재현됨).
`useBulkApply.js` 가 `../gantt/useGanttMutations` 를 import 하지만 번들 예산 초과 없음.

> ⚠️ 빌드 통과 ≠ 정상 동작. 위 §1~§3 의 교차 비교로 shape 정합을 별도 확인했다.

---

## 5. 결함 (회귀 아님 — 실패 메시지 정확도)

### F-1. [중] MD 실패가 **사실상 전부** `TIME_TRACKING_DISABLED` 로 분류된다 — 기존 결함 상속

**생산자** `static/ui/src/utils/jiraApi/requestJira.js:179`
```js
const e = new RequestJiraError(error?.code ?? 'Internal Error',
    `key: ${key}, param: ${JSON.stringify(param)}, urlParam: ${JSON.stringify(urlParam)}`, error)
```
`param` 이 `{ fields: { timetracking: {...} } }` 이므로 반환되는 `error.message` 에 **문자열 `timetracking` 이 항상 포함**된다. 실제 Jira 400 본문은 `error.cause` 안에 있다.

**소비자** `static/ui/src/utils/jiraApi/useJiraEditGuards.js:80-92`
```js
export const isTimeTrackingUnsupportedError = (errorLike) => {
    let cur = errorLike;
    for (let depth = 0; cur && depth < 5; depth++) {
        if (typeof cur.message === 'string' && cur.message.includes('timetracking')) {
            return !cur.message.includes('timetracking_');   // ← depth 0 에서 즉시 true
        }
        cur = cur.cause;
    }
    return false;
};
```
depth 0 의 message 가 이미 매칭되고 `timetracking_` 은 없으므로 **무조건 `true` 반환**. 설계된 `timetracking_*`(하위 값 검증 400) 구분 로직은 실행되지 않는다.

**영향** `bulkApply.js:79-80 classifyMdFailure(result.error)` → 403 권한 거부·404·네트워크 실패까지 전부 `FAILURE.TIME_TRACKING` → 실패 목록에 "이 Jira 프로젝트에서 시간 추적(예상 시간) 필드를 편집할 수 없어…"라는 **틀린 안내**가 나온다.

**회귀 아님** — 단건 편집(`ProjectIssueTable.jsx:338`)과 간트(`useUpdatePlannedMd`)가 이미 같은 함수·같은 인자로 같은 오탐을 낸다. 다만 일괄 화면은 실패를 N건 나열하므로 오탐이 눈에 크게 띈다.

**왜 테스트가 못 잡았나** `bulkApply.test.js:82-86` 은 `{ message: "Field 'timetracking' cannot be set..." }` 같은 **정제된 객체**를 직접 주입한다. 실제 소비 경로가 넘기는 `result.error`(파라미터 JSON 이 섞인 message)를 쓰지 않아 오탐이 통과했다.

**수정 방법(설계 판단 필요 — 공용 함수라 3경로가 함께 바뀐다)**
- (A) 호출부 국소 수정: `classifyMdFailure(result.error?.cause ?? result.error)` — 요청 파라미터가 섞인 최상위 message 를 건너뛴다. 일괄 경로만 정확해지고 단건/간트는 그대로.
- (B) 공용 수정(권장): `isTimeTrackingUnsupportedError` 가 `errorLike.cause` 부터 순회하도록 시작점을 바꾸거나, 검사 대상을 `message` 대신 Jira 응답 본문(`errors` 키)으로 좁힌다. **3경로가 동시에 바뀌므로 별도 이슈로 분리 권장** — 이번 기능의 책임 범위 밖이다.
- 어느 쪽이든 테스트는 `bulkApply.test.js` 가 아니라 **`executeRequest` 가 실제로 만드는 error 객체 모양**으로 고정해야 한다.

### F-2. [하] `classifyScheduleFailure` 의 `JIRA_PERMISSION_DENIED` 분기가 도달 불가

**생산자** — `updateGanttSchedule` 실패 코드는 두 경로뿐이다.
- 앱 권한 거부: `src/permission/permissionGuard.js:127` `PermissionError(ErrorCodes.PERMISSION_DENIED)` → `error.code = 'PERMISSION_DENIED'`
- Jira PUT 실패: `src/api/jira/util/RequestJiaJson.js:59` `throw new ForgeAPIError(res.status, …)` → `error.code = 403`(**숫자**)

**소비자** `static/ui/src/pages/projectDetail/issue/bulkApply.js:71-76`
```js
export const classifyScheduleFailure = (error) => {
    const code = error?.code;
    if (code === FAILURE.INVALID_RANGE) return FAILURE.INVALID_RANGE;
    if (code === FAILURE.PERMISSION) return FAILURE.PERMISSION;   // 'JIRA_PERMISSION_DENIED'
    return FAILURE.UNKNOWN;
};
```
`'JIRA_PERMISSION_DENIED'` 는 **프론트가 클라이언트에서 만들어 쓰는 상수**다(`useGanttMutations.js:15-19` 의 `jiraPermissionError()`). 서버 응답에는 존재하지 않는다.

**영향** — 사전 판정이 `null`(미확인)이라 통과한 뒤 특정 이슈에서 Jira 편집/일정 권한이 없어 403 이 나면 `UNKNOWN` → "저장에 실패했습니다."만 뜬다. 실제 원인(권한)과 조치 방법이 안내되지 않는다. 데이터 정합에는 영향 없다.

**수정 방법** — `bulkApply.js:71-76` 에 서버 실제 코드를 추가한다.
```js
if (code === 'PERMISSION_DENIED' || code === 403 || code === 401) return FAILURE.PERMISSION;
```
`bulkApply.test.js:74-79` 에 `{code:'PERMISSION_DENIED'}` / `{code:403}` 케이스를 함께 고정할 것.

---

## 6. 관찰 / 문서 불일치

### O-1. [하] 음수·비숫자 MD 가 조용히 "미입력"으로 강등된다
`bulkApply.js:33` `if (!Number.isFinite(parsed) || parsed < 0) return null;`
MD 칸에만 `-3` 을 넣으면 `hasBulkInput` 이 false 가 되어 제출 버튼이 disable 되는데, HelperMessage 는 `emptyInput`("적용할 값을 하나 이상 입력하세요")을 띄운다 — **값을 넣었는데 안 넣었다고 한다.** `type="number" min="0"` 이 대부분 막지만 붙여넣기·직접 타이핑은 통과한다.
설계서에 규정이 없어 결함으로 분류하지 않는다. 고친다면 음수는 `null` 대신 별도 `ErrorMessage`.

### O-2. [문서] 설계서 §6 i18n 키 표가 실제 구현과 다르다
`t()` 가 보간을 지원하지 않아(`@forge/bridge` 의 `(key, defaultValue) => string`) 조각 키로 분리됐다: `selected`→`selectedPre`/`selectedPost`, `target`→`targetPre`/`targetPost`, `running`→`runningPre`, `resultSuccess`→`resultSuccessPost`, `resultFail`→`resultFailPost`.
설계서 §6 각주가 지시한 기존 관례(`plannedMdPre`/`Post`)를 정확히 따른 것이라 **구현이 옳고 설계서 표가 낡았다** — `01_architect_design.md` §6 갱신 권장.
부수 결과: en 의 `targetPre`/`selectedPre` 가 `""` 라 `PROJ · 12 issues` / `12 selected` 로 자연스럽게 렌더된다. 의도된 형태.

### O-3. [하] `retryFailed` 후 결과 화면의 성공 건수가 재시도분으로 대체된다
`useBulkApply.js:151` 이 `successKeys` 를 통째로 새로 쓴다. 10성공/2실패 후 재시도해 2건이 성공하면 화면은 "2건 성공"만 보여준다(누적 12 가 아니다).
캐시·서버 데이터는 정확하고 표시만 좁아진다. 설계서에 규정 없음 → 수용 가능. 신경 쓴다면 `run` 에 누적 플래그를 넘기면 몇 줄이다.

### O-4. [문서] `useBulkApply` 시그니처가 설계서 §2-4 와 다르다
설계서는 `{ projectId, groupKey, queryKey, hourRate, toast }`, 구현은 `groupKey` 없음(`useBulkApply.js:39`). `groupKey` 는 모달이 표시용으로만 쓰므로(`BulkApplyModal.jsx:128`) 기능 영향 없다. 설계서 갱신 권장.

---

## 7. 미검증 (추측으로 통과 처리하지 않음)

실 Jira 사이트 E2E 를 수행하지 않았다. 아래 3건은 **코드 정합은 확인했으나 런타임 동작은 미확인**이다.

1. **기한만 적용 후 기존 시작일 생존** — 로직·단위테스트는 통과(§2 §8-1). 실제 `customfield_10015` 가 해당 사이트의 "시작일" 필드인지, 팀 관리형 프로젝트에서 PUT 이 성공하는지는 배포 검증 필요.
2. **MD `0` 적용** — Jira 가 `originalEstimate: "0h"` 를 수용하는지(400 없이) 미확인.
3. **팀 관리형 프로젝트의 timetracking 400 안내** — F-1 오탐 때문에 **어떤 실패든 시간추적 안내가 뜨므로**, 이 케이스의 안내가 "맞아 보이는 것"이 검증 근거가 되지 못한다. F-1 수정 후 재검증할 것.

추가로, 다음은 자동 검증 수단이 없어 코드 리딩으로만 확인했다(런타임 미확인): 체크박스 컬럼 추가 후 `useStableColumnWidths` 재계측이 실제 브라우저에서 열 폭을 흐트러뜨리지 않는지(jsdom 은 레이아웃이 없어 `toPercentWidths` 가 null 을 반환하므로 jest 로는 검증 불가).

---

## 8. 재작업 지시 요약 (frontend 담당)

| 우선 | 파일:라인 | 내용 |
|------|----------|------|
| 선택(별도 이슈 권장) | `static/ui/src/utils/jiraApi/useJiraEditGuards.js:80-92` **또는** `static/ui/src/pages/projectDetail/issue/bulkApply.js:79-80` | F-1. `executeRequest` 의 `error.message` 에 요청 파라미터 JSON 이 들어가 `timetracking` 이 항상 매칭된다 → MD 실패 전건이 시간추적 오안내. 공용 함수 수정 시 단건·간트 3경로가 함께 바뀌므로 설계 판단 필요 |
| 권장 | `static/ui/src/pages/projectDetail/issue/bulkApply.js:71-76` | F-2. `code === 'PERMISSION_DENIED' \|\| code === 403 \|\| code === 401` → `FAILURE.PERMISSION` 추가 + `bulkApply.test.js:74-79` 케이스 보강 |
| 선택 | `static/ui/src/pages/projectDetail/issue/bulkApply.js:33` | O-1. 음수 MD 를 `null` 로 삼키지 말고 폼 단계 `ErrorMessage` 로 노출 |
| 문서 | `_workspace/work-bulk-apply/01_architect_design.md` §2-4, §6 | O-2/O-4. 실제 i18n 키(조각 분리)와 훅 시그니처(`groupKey` 없음)로 갱신 |

---
---

# § 재검증 (2차) — 2026-08-13

> 대상: 1차 검증 이후 쌓인 3덩어리
> ① 일괄 삭제 추가(§7) ② Codex 후속 수정(§6-B) ③ **백엔드 부분 업데이트**(`GanttService.js` 리더 직접 수정 + `GanttScheduleUpdate.test.js` 신규)
> 지시에 따라 `npm run build` 는 실행하지 않았다(다른 에이전트가 `static/ui` 병행 작업 중). 테스트만 전량 실행.

## R-0. 판정 요약

| 분류 | 건수 | 항목 |
|------|------|------|
| **통과** | 14 | 삼자 체인 / 간트 5경로 무회귀 / 일괄 삭제 4항목 / 재시도 누적 / MD 분류 순서 / i18n / 테스트 전량 |
| **실패** | 0 | 데이터 파손·shape 불일치·회귀 **없음** |
| **결함** | 2 | R-F1 MD 400 내부 구분 여전히 오탐(F-1 **부분** 해소) / R-F2 `runBulkDelete` 예외 무처리 |
| **관찰** | 4 | R-O1 역전 일정 생성 가능 / R-O2 삭제 표식 index 기반 / R-O3 죽은 분기 / R-O4 미사용 i18n 2키 |
| **문서 불일치** | 2 | R-D1 주석 3곳 옛 계약 서술 / R-D2 설계서 §2-1·§2-3 미갱신 |
| **미검증** | 4 | E2E(빌드 포함) |

**1차 지적 해소 확인**: F-2(권한 코드 미매핑) **해소** / O-3(재시도 집계) **해소** / F-1 **부분 해소**(아래 R-F1).

---

## R-1. 새 경계면 — 삼자 체인 (프론트 조립 → 백엔드 → 프론트 소비) — **통과**

### ① 프론트 조립 — 미입력 키가 payload 에서 실제로 탈락하는가

`static/ui/src/pages/projectDetail/issue/bulkApply.js:70-73`

```js
export const buildScheduleFields = (values) => ({
    ...(values?.start != null ? { start: values.start } : {}),
    ...(values?.due   != null ? { due:   values.due   } : {}),
});
```

`useBulkApply.js:59-60` — `invoke('updateGanttSchedule', { projectId, issueKey, ...fields })`.

- 스프레드가 **키 자체를 만들지 않는다**(`{start: undefined}` 가 아니라 키 부재). 직렬화 이전 단계에서 이미 없다.
- 설령 `undefined` 로 실렸더라도 `JSON.stringify` 가 떨어뜨린다 — **이중으로 안전**.
- 테스트가 실제 직렬화까지 고정: `bulkApply.test.js:77-80` `JSON.parse(JSON.stringify(payload))` 가 `{projectId, issueKey, due}` 와 정확히 일치.
- `'start' in fields === false` 단언(`:57`, `:63`)으로 키 부재를 **존재 여부**로 검사한다(값 비교가 아님) — 올바른 단언 형태.

### ② 백엔드 — 생략 키를 건드리지 않는가

`src/resolver/gantt/GanttService.js:141-174`

```js
const normStart = start === undefined ? undefined : (start || null);
const normDue   = due   === undefined ? undefined : (due   || null);
if (normStart && normDue && normStart > normDue) throw ...;   // 둘 다 있을 때만
const fields = {};
if (normStart !== undefined) fields.customfield_10015 = normStart;
if (normDue   !== undefined) fields.duedate           = normDue;
if (!Object.keys(fields).length) return { content: { issueKey } };   // write 없이 성공
await updateIssueFields(issueKey, fields);
```

- 구조분해로 키 부재 → `undefined` → `fields` 에 **키가 추가되지 않는다** → PUT body 에 그 필드가 없다 → Jira 는 미변경. ✓
- `start === undefined` 를 **`==` 가 아니라 `===`** 로 본다 → `null`(비우기)과 `undefined`(미변경)가 정확히 갈린다. ✓
- 빈 `fields` 는 write 없이 성공 반환 — 호출부 버그가 "두 날짜 통째 삭제"가 되지 않는다. ✓
- **`''`(빈 문자열) 처리**: `start || null` → `null` → 비우기. 프론트는 `normalizeDateInput` 으로 `''`→`null` 후 `!= null` 로 걸러 아예 보내지 않으므로 도달하지 않지만, 도달해도 파괴적이지 않다.

백엔드 단위 테스트 `src/resolver/gantt/__test__/GanttScheduleUpdate.test.js` 7케이스가 이 시맨틱을 전부 고정한다 — 둘 다 / 한쪽만 / 명시적 null / 둘 다 undefined / 범위검증 조건부 / issueKey 누락. **PUT payload 자체를 `toHaveBeenCalledWith` 로 단언**해 "생략됐다"를 직접 검사한다(반환값만 보는 약한 단언이 아님). ✓

### ③ 프론트 소비 — 부분 `content` 를 올바르게 읽는가

`useBulkApply.js:64-73`

```js
const content = result.content ?? {};
if (fields.start !== undefined) applied.start = content.start !== undefined ? content.start : fields.start;
if (fields.due   !== undefined) applied.due   = content.due   !== undefined ? content.due   : fields.due;
```

- **바깥 가드가 "우리가 보낸 필드"** 기준이다 — 안 보낸 필드는 `applied` 에 절대 들어가지 않는다. 이것이 핵심이다: `applied` 에 들어가면 `applyIssuePatches`/`buildGanttPatch` 가 캐시에 값을 쓰므로, 안 보낸 필드가 섞이면 **낡은 캐시 값을 캐시에 되쓰는** 원래 문제가 뒷문으로 돌아온다. 가드가 정확히 그 지점에 있다. ✓
- 안쪽은 `!== undefined` 로 서버 확정값과 폴백을 가른다 — 서버가 확정한 `null` 이 `??` 때문에 되돌아가지 않는다. ✓
- 응답 래핑: `ResponseWrapper.js:11-14` `{success:true, ...result}` → `{success:true, content:{issueKey, due}}`. 프론트 `result.content.due` 접근 — **래핑 단계 일치**. ✓

**체인 결론**: 조립(키 생략) → 전송(직렬화 탈락) → 서버(키 부재=미변경) → 응답(write 한 필드만) → 소비(보낸 필드만 반영). **5단계 전부 같은 규칙을 따른다.** 1차 검증이 최대 위험으로 지목한 "미입력 날짜 파손"은 이제 **채워 보내는 코드 자체가 존재하지 않아** 구조적으로 불가능하다 — `bulkTargets` 에서 `currentStart`/`currentDue` 가 제거된 것(`ProjectIssueTable.jsx:144-154`)까지 확인했다.

---

## R-2. 간트 기존 경로 무회귀 — **통과 (핵심 확인)**

부분 계약 도입으로 "한쪽을 안 보내면 미변경"이 됐다. 기존 경로가 어느 하나라도 `undefined` 를 흘리면 **"날짜 지우기"가 조용히 "미변경"으로 바뀌는** 회귀가 난다. `updateGanttSchedule` 로 흘러드는 **모든 생산자를 전수 추적**했다.

| # | 경로 | 생산 코드 | `start`/`due` 값 | 판정 |
|---|------|----------|-----------------|------|
| 1 | 막대 드래그/리사이즈 | `ganttAdapter.js:482-490` `extractScheduleChange` | `formatISODate(...)` — `ganttAdapter.js:60-66` 이 **비-Date 에 `null` 을 반환**(절대 `undefined` 아님) | **무회귀** — `null` 은 종전에도 `start \|\| null` → `null` 이라 동일하게 비우기 |
| 2 | 일정 편집 모달(간트) | `GanttChart.jsx:317-320` `handleEditorSubmit` ← `GanttScheduleModal.jsx:47-55` | 두 Field 가 `isRequired` + `requiredValidate`, `if (!start \|\| !due) return;` 이중 가드 → **항상 비어있지 않은 문자열** | **무회귀** |
| 3 | 그리드 시작일 셀 | `GanttGridEditCells.jsx:196-204` | `start: newStart`(truthy 가드 통과) / `due: row?.endText \|\| newStart` — **폴백이 있어 undefined 불가** | **무회귀** |
| 4 | 그리드 기간 셀 | `GanttGridEditCells.jsx:243` | `start: row.startText`(`canEdit` 이 `row?.startText` 를 요구) / `due: formatISODate(due)` (유효 Date) | **무회귀** |
| 5 | 트리 뷰 모달 | `ProjectTreeView.jsx:253-256` ← 같은 `GanttScheduleModal` | 경로 2와 동일 | **무회귀** |

최종 호출부 `useGanttMutations.js:119-124` 는 `{ projectId, issueKey, start, due }` **객체 리터럴**이라 두 키가 항상 존재하고, 위 5경로가 넣는 값은 전부 `string | null` 이다. → **`undefined` 가 도달하는 경로가 하나도 없다.**
백엔드 테스트 `GanttScheduleUpdate.test.js:32-39` 가 "둘 다 보내면 종전과 동일"을 명시적으로 고정한 것도 이 무회귀를 계약으로 못박는다. ✓

낙관적 패치(`useGanttMutations.js:138-152`)와 롤백은 손대지 않았다 — `git diff` 상 `useGanttMutations.js` 변경은 여전히 **`export` 3개 추가뿐**이다(1차 검증과 동일, 재확인).

---

## R-3. 일괄 삭제(프로젝트에서 제외) — **통과**

### R-3-a. 서버 계약 ↔ 프론트 실패 판정

| | 생산자 | 소비자 |
|---|--------|--------|
| 등록 | `src/resolver/projectIssue/ProjectUsersController.js:33` `guardedDefine(resolver,'deleteProjectIssue',...)` | `ProjectIssueTable.jsx:329` `invoke('deleteProjectIssue', {issueId, customFieldId})` — fnName·인자명 일치 ✓ |
| 권한 | `PermissionMap.js:139` `W('PROJECT','inherited')` | 화면 게이트 `showSelectColumn = canEdit && canBulkApply(=canWrite('PROJECT'))` — `updateGanttSchedule`(`:253`)과 **동일 권한** ✓ |
| 성공 | `deleteProjectIssueService`(`ProjectUsersService.js:296-305`)는 반환값이 없다 → `{success:true}` (content 없음) | `if (!result \|\| result.success !== true)` — **content 를 읽지 않는다** ✓ (읽었다면 undefined 참조였다) |
| 실패 | `{success:false, error:{name,code,message,cause}}` | `classifyDeleteFailure`(`bulkDelete.js:13-14`)가 `isPermissionCode` 공유 ✓ |

**§7-3 이 주장한 "기존 단건 삭제 결함 미승계"도 실코드로 확인**: 구 코드는 `invoke(...).then(() => 성공토스트)` 였고 `invoke` 는 실패해도 throw 하지 않아 서버 거부를 성공으로 표시했다. 신규 경로는 `result.success !== true` 를 명시 검사하고 실패 건은 `successIndexes` 에 들어가지 않아 **표식도 달리지 않는다**. ✓

### R-3-b. `__deleted` index 기준 + `0` falsy 함정 — **통과**

- `bulkDeleteTargets`(`ProjectIssueTable.jsx:158-164`)는 **원본 `issues` 배열**을 `.map((issue,index)=>...)` 한 뒤 필터한다 — 필터 **이전**에 index 를 확정하므로 `selectableIssues`(`__deleted` 제거본)의 밀린 index 가 섞이지 않는다. ✓ 이 순서가 뒤바뀌면 조용히 엉뚱한 행이 지워진다.
- 패치도 같은 원본 배열에 적용된다: `patchGroupPage(queryKey, old => markIssuesDeleted(old.issues, successIndexes))`. ✓
- **`0` falsy 함정 3중 회피 확인**:
  - `summarizeDeleteOutcomes:29` `Number.isInteger(outcome.index)` (`if (outcome.index)` 아님) ✓
  - `markIssuesDeleted:42-43` `Set.has(index)` ✓
  - `ProjectIssueTable.jsx:341` `if (successIndexes.length > 0)` (`if (successIndexes)` 아님) ✓
  - `bulkDelete.test.js:24-27` 이 index 0 케이스를 단독으로 고정 ✓

### R-3-c. 권한 조건 head/rows/버튼 일관성 — **통과**

`showSelectColumn` **단일 변수**가 4곳 전부를 지배한다: head(`:221`) / rows(`:410`) / 액션 바(`:691`) / ConfirmModal `isOpen`(`:745`). 셀 수 불일치·"버튼은 보이는데 체크박스는 없음" 조합이 구조적으로 불가능하다. ✓

`extra`(행별 삭제) 컬럼은 head(`:242` 주석만 남음)와 `createRow`(`:670-676`, `progress` 로 끝남) **양쪽에서 제거**돼 열 수가 계속 정합한다(선택 컬럼 포함 10 / 미포함 9). `DeleteIcon` import 는 일괄 제외 버튼(`:714`)이 계속 쓰고, `isTimeTrackingUnsupportedError` import 도 단건 `updatePlannedMD` 가 계속 쓴다 — **미사용 import 0건**. ✓

### R-3-d. 캐시 규약 — **통과**

`runBulkDelete` 에 `invalidateQueries` 직접 호출 0건. `onAfterDelete?.()`(=`invalidateSummary`)만 부르는데 이는 **기존 단건 삭제와 완전히 동일**하고, 대상이 카드 헤더 요약(개수/상태분포)이라 목록·간트의 write-후-재조회 금지 규약과 무관하다. 성공 0건이면 캐시도 요약도 건드리지 않는다(`:341`). ✓

---

## R-4. 재시도 결과 누적 — **통과**

`useBulkApply.js:134-179` + `bulkApply.js:158-162`.

| 항목 | 확인 |
|------|------|
| `total` 불변 | `baseTotal = retryOf ? retryOf.total : list.length`(`:141`), `mergeRunResult` 가 `base.total` 을 그대로 반환(`:159`) ✓ |
| `successKeys` 합산 | `[...new Set([...base, ...result])]`(`:160`) — **중복 제거 포함**. `bulkApply.test.js:177-180` 이 중복 재성공 케이스를 고정 ✓ |
| `failures` 교체 | `result.failures`(`:161`) — 재시도에 성공한 건이 실패 목록에 남지 않는다 ✓ |
| 진행 바 시작점 | `baseDoneCount = Math.max(0, baseTotal - list.length)`(`:144`) → 12건 중 2건 재시도 시 10/12 에서 출발 ✓. `Math.max(0,...)` 가드로 음수 불가 |
| 완료 시 표시 | `setState({phase:'done', doneCount: merged.total, ...merged})`(`:178`) → 바가 정확히 100% ✓ |
| `retryOf` 전달 | `retryFailed`(`:189-191`)가 `{total: state.total, successKeys: state.successKeys}` 전달 — 클릭 시점의 최신 렌더 state ✓ |

산술 정합도 확인: 12건 → 10성공/2실패 → 재시도 1성공/1실패 → `successKeys` 11, `failures` 1, `total` 12 → **11+1=12**. ✓

---

## R-5. MD 실패 분류 — **부분 통과** (F-1 은 400 내부에서 잔존, R-F1 참조)

`bulkApply.js:121-125`

```js
if (isPermissionCode(error?.code)) return FAILURE.PERMISSION;                     // 1
if (isBadRequestCode(error?.code) && isTimeTrackingUnsupportedError(error)) ...;  // 2
return FAILURE.UNKNOWN;                                                          // 3
```

**"400 한정이 진짜 timetracking 400 을 놓치지 않는가"** — 놓치지 않는다. 코드 경로를 실제로 따라갔다:
`requestJira.js:173-175` 가 `throw new RequestJiraError(response.status, text, response)` → catch(`:179`)가 `error?.code ?? 'Internal Error'` 로 **status 를 그대로 승계**한다. 즉 Jira 400 → `result.error.code === 400` → `isBadRequestCode` 통과 → 종전 판정 그대로. ✓
403/5xx 만 2에서 빠져나가 1/3으로 간다 — 1차 리포트 F-1 이 지적한 **"403·5xx 가 시간추적 안내로 오안내"는 해소**됐다.

기존 단건 경로(`ProjectIssueTable.jsx:338`)와의 안내 일관성: 단건은 여전히 `isTimeTrackingUnsupportedError(result.error)` 만 본다 → **403 에서 두 화면의 안내가 갈린다**(일괄=권한 안내 / 단건=시간추적 안내). 일괄 쪽이 옳고 단건이 틀린 방향이라 **사용자 피해는 없다**(정확한 쪽으로만 갈림). F-1 백로그 처리 시 함께 정리하면 일관해진다.

---

## R-6. 설계서 §2-3 무효화 반영 / 죽은 코드 — **통과(1건 관찰)**

- `02_frontend_report.md` §6-B-1 이 "한쪽만 적용 시 서버의 건별 범위 거부가 사라진다"를 **명시**했고, 백엔드 테스트(`GanttScheduleUpdate.test.js:73-75`)도 "한쪽만 보내면 통과"를 주석과 함께 고정했다. 반영 확인. ✓
- **죽은 i18n 키는 없다** — 실패 매핑이 쓰는 `gantt.error.dateRange` 는 **기존 키 재사용**이고 간트 경로가 계속 쓴다. `issue.bulk.invalidRange`(폼 단계 차단 문구)는 `BulkApplyModal.jsx:165` 가 현역으로 쓴다. ✓
- 신규 6키(`delete`/`deleteTitle`/`deleteMessagePre`/`deleteMessagePost`/`deleteConfirm`/`deleteSuccessPost`)는 `locales/kr|en/projectDetail.json` **양쪽 + merge 산출물 4곳 전부** 존재(스크립트 검사, 누락 0). `issue.bulk` 키 수 kr 28 / en 28 **동수**. ✓ 다른 트랙이 `locales/` 를 병행 수정 중이나 이 키들은 온전하다.
- 하드코딩 한글: 신규 `bulkDelete.js` 및 `ProjectIssueTable.jsx` 변경분에서 렌더 문자열 0건(주석만). ✓

---

## R-7. 실행 검증

| 항목 | 명령 | 결과 |
|------|------|------|
| 백엔드 전량 | `npm test` (루트) | **76 suites / 1177 tests 전부 통과** (exit 0) — 1차 72/1128 대비 +4 suites(`GanttScheduleUpdate.test.js` 포함, 나머지는 병행 대시보드 트랙) |
| 프론트 전량 | `cd static/ui && npx jest` | **77 suites / 1285 tests 전부 통과** (exit 0), 회귀 0 |
| 프론트 빌드 | — | **지시에 따라 실행하지 않음**(병행 작업 충돌 회피). 아래 R-9 "미검증" 참조 |

프론트 리포트 §6-B-5 의 수치(77/1285)와 **일치**한다(재현됨).

---

## R-8. 신규 발견

### R-F1. [중] MD 400 **내부** 구분은 여전히 오탐 — F-1 부분 잔존

`classifyMdFailure` 가 400 으로 좁힌 덕에 403/5xx 오탐은 사라졌지만, **400 안에서** "진짜 시간추적 미지원" 과 "`timetracking_*` 하위 값 검증 오류"를 가르는 원래 목적은 여전히 달성되지 않는다.

- `requestJira.js:179` 가 `error.message` 에 요청 param 을 에코한다 → `key: updateIssue, param: {"fields":{"timetracking":...}}`.
- `useJiraEditGuards.js:80-92` 는 **depth 0 의 이 message** 에서 `'timetracking'` 을 발견하고, `'timetracking_'` 은 없으므로 즉시 `true` 를 반환한다. 실제 Jira 응답 본문은 검사되지 않는다.
- **실제로 밟히는 경로**: 일괄 적용의 `remainingSeconds` 는 목록 캐시에서 온다(`ProjectIssueTable.jsx:149`). 캐시에 없거나 낡으면 remaining 미동봉 → Jira 가 `timetracking_remainingestimate` 검증 **400** → `isBadRequestCode` 통과 → `isTimeTrackingUnsupportedError` 오탐 → **"시간 추적 필드를 켜세요"** 로 오안내(실제로는 페이로드 문제). 이는 `useJiraEditGuards.js:84-87` 주석이 명시적으로 막으려던 바로 그 케이스다.

**수정 방법 (공용 함수를 건드리지 않고 `bulkApply.js` 안에서 해결 가능)**
`executeRequest` 의 `result.error.cause` 는 **내부 `RequestJiraError`(message = Jira 응답 본문)** 다(`requestJira.js:104-111, 175, 179-188`). 400 분기에서 그쪽부터 보면 param 에코를 건너뛰어 `timetracking_` 판별이 되살아난다.

```js
// bulkApply.js:123
if (isBadRequestCode(error?.code) && isTimeTrackingUnsupportedError(error?.cause ?? error))
    return FAILURE.TIME_TRACKING;
```

테스트는 `bulkApply.test.js` 에 **`executeRequest` 가 실제로 만드는 2단 error 객체 모양**(`{code:400, message:'key: updateIssue, param:{...timetracking...}', cause:{code:400, message:'...timetracking_remainingestimate...'}}`)으로 고정할 것 — 현재 테스트(`:81-87` 계열)는 정제된 1단 객체를 주입해 이 오탐을 통과시킨다.

### R-F2. [하] `runBulkDelete` 에 `catch` 가 없다 — 예외 시 무음 실패

`ProjectIssueTable.jsx:319-368` 은 `try { ... } finally { ... }` 로 `catch` 가 없다.
`getCustomFieldId(...)`(`:325`, `view.getContext()` 왕복)가 실패하면 예외가 `runBulkDelete` 밖으로 전파된다. `onConfirm={runBulkDelete}`(`:747`)는 반환 Promise 를 받지 않으므로 **unhandled rejection** 이 되고, `finally` 만 돌아 **모달이 닫히고 선택이 해제된 채 토스트가 하나도 뜨지 않는다.** 사용자는 "제외가 됐는지 안 됐는지" 알 수 없다.
(건별 `invoke` 는 worker 안에서 이미 `try/catch` 되어 있어 이 구멍은 **루프 밖 준비 단계 한정**이다.)

**수정**: `finally` 앞에 `catch` 를 추가해 `toast.showError(t('common.toast.title.Fail'), t('common.toast.description.error'))` 를 낸다(신규 i18n 불요 — 같은 파일이 이미 쓰는 키).

### R-O1. [관찰·설계 판단] 역전 일정(`start > due`)을 **만들 수 있게 됐다**

부분 write 도입으로 한쪽만 보낼 때 서버 범위 검증이 성립하지 않는다(설계 의도, `GanttScheduleUpdate.test.js:73-75` 가 명시적으로 고정). 그 **귀결**이 리포트에 적혀 있지 않아 남긴다.

- 클라 `isBulkRangeInvalid`(`bulkApply.js:55-56`)는 **둘 다 입력된 경우만** 본다 → 한쪽만 입력하면 통과.
- 목록 뷰 단건 인라인 편집은 `maxDate`/`minDate`(`ProjectIssueTable.jsx:449`·`514`)로 역전을 막는데, **일괄 적용은 이 가드를 우회**한다.
- 결과: "기한만 앞당김"으로 기존 시작일보다 이른 기한이 저장돼 `start > due` 이슈가 생긴다. 예전에는 그 이슈만 `GANTT_INVALID_DATE_RANGE` 로 실패했다.
- **크래시는 없다** — `ganttAdapter.js:34-36` `diffDays` 가 `Math.max(1, ...)` 로 클램프해 1일 막대로 그려진다. 단 간트/트리의 기간 표시가 실제와 다르게 보인다.
- 선택지: (a) 수용(현 상태 — 일괄은 "빠른 편집" 도구이고 사용자가 의도한 값을 그대로 쓴다) / (b) 모달에 안내 문구 1줄 / (c) 서버가 한쪽만 올 때 이슈 GET 1회로 비교 — **(c)는 왕복 절감이라는 partial write 의 목적을 깨므로 비권장**.
  판단은 설계 소관이라 결함으로 분류하지 않는다.

### R-O2. [하] 삭제 표식이 **index 기반**이라 백그라운드 재조회에 취약

`markIssuesDeleted(old.issues, successIndexes)` 는 인덱스로 대상을 지목한다. 인덱스는 ConfirmModal 을 여는 시점의 `issues` 배열 기준인데, 확인 대기 + N건 `invoke` 왕복 동안 `useWorkListGroupPage` 의 백그라운드 재조회(윈도우 포커스 등)가 끝나면 `old.issues` 가 **다른 배열**이 되어 엉뚱한 행에 표식이 달릴 수 있다.
단건 삭제도 같은 구조라 **새 결함은 아니지만**, 일괄은 확인 모달 + N건 왕복으로 창이 훨씬 넓다.

**수정**: `targets` 가 이미 `issueKey` 를 들고 있으므로 키 기반으로 바꾸면 위험이 **완전히 사라진다**. 행을 빼지 않고 표식만 다는 성질(=index 보존)은 그대로 유지된다 — §7-4 가 index 를 정당화한 근거("행을 빼면 index 가 밀린다")는 **키 기반에도 그대로 성립**하므로 index 를 쓸 이유가 없다.

```js
export const markIssuesDeleted = (issues, keys) => {
    if (!Array.isArray(issues) || !keys?.length) return issues;
    const targets = new Set(keys);
    return issues.map((issue) => (targets.has(issue?.key) ? { ...issue, __deleted: true } : issue));
};
```

`summarizeDeleteOutcomes` 도 `successIndexes` → `successKeys` 로 바뀌며 `Number.isInteger` 방어가 불필요해진다.

### R-O3. [정보] `FAILURE.INVALID_RANGE` 분기는 일괄 경로에서 도달 불가

양쪽 입력 시 클라(`isBulkRangeInvalid`)와 서버(`GanttService.js:146`)가 **같은 문자열 비교**를 하고 클라가 먼저 막는다. 한쪽만 입력하면 서버가 검증하지 않는다. 따라서 `classifyScheduleFailure` 의 INVALID_RANGE 분기와 `BulkApplyModal.jsx:79-80` 의 `gantt.error.dateRange` 매핑은 **2차 방어로만 남는다**. 기존 키 재사용이라 죽은 i18n 키는 생기지 않았고 제거 필요도 없다. 기록만 남긴다.

### R-O4. [정보] 미사용 i18n 2키 — 의도적 보존 확인

컬럼 제거로 `projectDetail.issue.table.3`("추가 작업")과 `projectDetail.issue.toast.delete.success`("업무 삭제 완료")가 미참조가 됐다. 로케일에 그대로 남아 있음을 확인했다(§7-6 의 서술과 일치). 동작 영향 0.

### R-D1. [문서] 주석 3곳이 **옛 계약**을 서술한다 — 되돌림 유혹

코드는 옳고 주석만 낡았다. 이 부류는 다음 수정자를 잘못된 전제로 유도하므로 정리 권장.

| 파일:라인 | 현재 서술 | 실제 |
|----------|----------|------|
| `bulkApply.js:53` | "한쪽만 입력된 경우의 충돌은 **서버가 건별로 판정한다**(§2-3)" | **판정하지 않는다** — 한쪽만 보내면 서버에 비교 대상이 없다(R-O1). 정반대 서술 |
| `useBulkApply.js:26-27` | `invoke(...{start, due}) → content:{issueKey, start, due}` | 부분 전송 / `content:{issueKey, start?, due?}`. 본문 주석(`:58`,`:64-66`)은 옳아 헤더만 낡음 |
| `BulkApplyModal.jsx:22` | `targets: [{ issueKey, currentStart, currentDue, ... }]` | `currentStart`/`currentDue` 는 **제거됐다**(`ProjectIssueTable.jsx:144-154`). 되살리라는 신호로 읽힌다 |

### R-D2. [문서] 설계서 `01_architect_design.md` §2-1·§2-3 미갱신

§2-1 표는 여전히 `content:{issueKey, start, due}` 고정 반환, §2-3 은 "항상 둘 다 PUT" + "미입력 날짜 채움" + "정상적인 건별 실패"를 규정한다 — **전부 무효**다. 프론트 리포트 §6-B-1 이 무효화를 밝혔으나 설계서 본문이 그대로라 두 문서가 충돌한다. 1차 리포트의 O-2/O-4(§6 i18n 키·훅 시그니처)와 함께 일괄 갱신 권장.

---

## R-9. 미검증 (추측으로 통과 처리하지 않음)

1. **프론트 빌드** — 지시에 따라 실행하지 않았다(병행 작업 산출물 충돌 회피). 신규 import(`ConfirmModal`, `bulkDelete`, `mapWithConcurrency`, `BULK_APPLY_CONCURRENCY`)의 해석은 jest 전량 통과로 간접 확인되나, **번들 예산(`bundle:check`)과 CRA 프로덕션 빌드는 확인되지 않았다.** 리더가 커밋 직전에 `CI=true npm run build` 로 확인할 것.
2. **부분 write E2E** — 실 Jira 에서 "기한만 적용" 후 시작일이 **살아 있는지**. 서버·클라·직렬화 3계층을 단위 테스트로 고정했으나 실제 PUT 은 미확인.
3. **일괄 제외 E2E** — N건 제외 후 카드 헤더 개수 정합, 권한 거부 건이 표식 없이 실패로 남는지.
4. **MD 0 적용 / 팀 관리형 timetracking 400 안내** — 후자는 R-F1 잔존으로 **안내가 맞아 보여도 검증 근거가 되지 못한다**(400 이면 내용과 무관하게 시간추적 안내가 뜬다).

---

## R-10. 재작업 지시 요약 (2차)

| 우선 | 파일:라인 | 내용 |
|------|----------|------|
| 권장 | `static/ui/src/pages/projectDetail/issue/bulkApply.js:123` | R-F1. 400 분기에서 `isTimeTrackingUnsupportedError(error?.cause ?? error)` 로 param 에코를 건너뛴다. 공용 함수 무변경. 테스트는 `executeRequest` 의 **2단 error 객체 실제 모양**으로 고정 |
| 권장 | `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx:319-368` | R-F2. `catch` 추가 → 실패 토스트. 현재는 준비 단계 예외 시 무음으로 모달만 닫힌다 |
| 선택 | `static/ui/src/pages/projectDetail/issue/bulkDelete.js:40-44` + `:22-33` | R-O2. 표식 대상을 index → `issueKey` 기반으로. 백그라운드 재조회 취약성이 사라지고 `Number.isInteger` 방어도 불필요해진다 |
| 문서 | `bulkApply.js:53`, `useBulkApply.js:26-27`, `BulkApplyModal.jsx:22` | R-D1. 옛 계약 서술 3곳 정정(특히 `bulkApply.js:53` 은 현재 동작과 **정반대**) |
| 문서 | `_workspace/work-bulk-apply/01_architect_design.md` §2-1, §2-3 (+1차 O-2/O-4 의 §2-4, §6) | R-D2. 부분 업데이트 계약으로 갱신 |
| 판단 | — | R-O1. 역전 일정 허용을 수용할지(현 상태) 모달 안내를 넣을지 설계 결정 |
