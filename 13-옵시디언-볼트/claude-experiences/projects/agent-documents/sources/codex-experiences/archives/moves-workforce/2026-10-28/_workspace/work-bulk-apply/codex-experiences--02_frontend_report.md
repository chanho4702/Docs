# 작업관리 목록 뷰 일괄 적용 — 프론트엔드 구현 보고서

> 작성 2026-08-13 / 설계서 `01_architect_design.md` 기준 / 백엔드 변경 0건

---

## 1. 소비한 응답 shape (경계면 계약 준수)

### 1-1. `invoke('updateGanttSchedule', …)` — 기존 resolver 재사용

```js
// useBulkApply.js:71-79
const result = await invoke('updateGanttSchedule', { projectId, issueKey, start, due });
if (!result || result.success !== true) {
    return { issueKey, applied, failure: classifyScheduleFailure(result?.error) };
}
const content = result.content ?? {};
applied.start = content.start !== undefined ? content.start : start;
applied.due   = content.due   !== undefined ? content.due   : due;
```

| 항목 | 계약(§2-1) | 구현 |
|------|-----------|------|
| 입력 | `{ projectId, issueKey, start, due }` | 동일 |
| 성공 | `{ success:true, content:{ issueKey, start, due } }` | `result.content.start` / `.due` 만 읽음 |
| 실패 | `{ success:false, error:{ name, code, message, cause } }` | `result.error.code` → 실패 코드 매핑 |
| throw 여부 | **throw 하지 않음** | `result.success !== true` 를 **명시 검사**(truthy 판정 아님) |

`content.start` 가 `null` 일 수 있어 `?? start` 가 아니라 `!== undefined` 로 갈랐다 —
`??` 를 쓰면 서버가 확정한 `null` 이 우리가 보낸 값으로 조용히 되돌아간다.

### 1-2. `executeRequest('updateIssue', …)` — 계획 MD (Jira 직접 호출)

```js
// useBulkApply.js:82-101
const result = await executeRequest('updateIssue',
    { fields: { timetracking: buildTimetrackingPayload(`${hours}h`, target?.remainingSeconds ?? null) } },
    { issueIdOrKey: issueKey });
if (result?.success === false) return { issueKey, applied, failure: classifyMdFailure(result.error) };
applied.mdSeconds = Math.round(hours * 3600);
```

- 실패 판정은 `result?.success === false` (throw 를 기대하는 코드 없음).
- `remainingEstimateSeconds` 는 **목록 캐시 행에서** 읽는다(`ProjectIssueTable.jsx:143`) — 이슈당 추가 GET 0회.
- `mdSeconds` 는 `plannedHours()` 가 실제로 write 하는 시간값에서 역산한다(0.1h 반올림 정합).

### 1-3. 왕복 수

50건 적용 시 **최대 100회**(일정 50 + MD 50). `searchByIssueId` / `getIssue(fields:timetracking)` 호출 없음.
Jira 권한 사전 판정도 추가 왕복 0회 — 테이블이 이미 갖고 있는 `useJiraProjectPermissions(groupKey)` 결과를 모달로 내린다.

---

## 2. 변경 파일 목록

### 신규 (4)

| 파일 | 내용 |
|------|------|
| `static/ui/src/pages/projectDetail/issue/bulkApply.js` | **순수 로직**(React·네트워크 의존 0) — 입력 정규화, 미입력 날짜 채움, 실패 분류, 결과 집계, 캐시 패치 계산 |
| `static/ui/src/pages/projectDetail/issue/bulkApply.test.js` | 위 모듈 jest 18케이스 |
| `static/ui/src/pages/projectDetail/issue/useBulkApply.js` | 명령형 실행 훅 — 동시성 3 실행 + 진행률 + 캐시 패치 + 재시도 |
| `static/ui/src/pages/projectDetail/issue/BulkApplyModal.jsx` | 입력 → 진행 → 결과 3단계 모달 |

### 수정 (5 + 로케일)

| 파일:라인 | 내용 |
|----------|------|
| `utils/useJiraUserInfos.js:33` | `mapWithConcurrency` **export 추가** (본문 무변경 — diff 확인) |
| `pages/projectDetail/gantt/useGanttMutations.js:23, 74, 85` | `patchTask` / `plannedHours` / `computeProgressLocal` **export 추가** (본문 무변경 — diff 확인) |
| `pages/projectDetail/issue/ProjectIssueTable.jsx:32, 84-93, 111-147, 205-216, 238, 254-261, 355-365, 635, 640-680` | 체크박스 컬럼 + 선택 상태 + 액션 바 + 모달 마운트 |
| `pages/projectDetail/issue/ProjectGroupCard.jsx:45, 141` | `canBulkApply` passthrough |
| `pages/projectDetail/issue/ProjectIssuePanel.jsx:59, 214` | `canBulkApply = canWrite('PROJECT')` 산출 + 전달 |
| `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` | `issue.bulk.*` 22키 |

**신규 쿼리키 없음**(조회 없는 기능) / **신규 Zustand 스토어 없음** / **신규 의존성 없음**.

---

## 3. 설계서 위험 지점 대응

### 3-1. ★ 미입력 날짜 채움 (§2-3 — 최대 데이터 파손 위험)

```js
// bulkApply.js:69-72
export const resolveScheduleArgs = (target, values) => ({
    start: values?.start != null ? values.start : (target?.currentStart ?? null),
    due:   values?.due   != null ? values.due   : (target?.currentDue   ?? null),
});
```

`currentStart`/`currentDue` 는 목록 캐시 행(`fields.customfield_10015` / `fields.duedate`)에서 채운다
(`ProjectIssueTable.jsx:140-141`). 테스트 4케이스로 고정 — 기한만 입력했을 때 start 가 각 이슈의 현재
시작일로 나가는지, 현재 값이 없는 이슈만 `null` 이 나가는지를 검사한다.

### 3-2. 캐시 규약 (§4-5) — invalidate 0회

성공 경로에 `invalidateQueries` 호출이 **하나도 없다**(목록·요약·간트 전부).

- **목록**: `patchGroupPage(queryKey, …)` + `applyIssuePatches` — 표가 읽는 4필드만 정합을 맞추고 나머지 필드는 참조 보존.
- **요약**(`workListKeys.summary`): 손대지 않음(이슈 수/상태 분포는 일정·MD 변경과 무관).
- **간트**(`ganttKeys.data`): `getQueryData(...) === undefined` 면 **아무것도 하지 않는다**. 캐시가 있으면
  `patchTask` + MD 변경 시 `computeProgressLocal` 로 **progress 재계산 포함**(`useBulkApply.js:111-124`).

### 3-3. 선택 범위 (§4-2)

- 소유자: `ProjectIssueTable`(한 그룹 카드의 현재 페이지 한정), `Set<issue.key>`.
- 해제 시점: 필터/페이지크기/프로젝트/그룹 변경(`resetSig` 블록 :93), 페이지 이동(`handlePrev`/`handleNext` :255·259), 상위 refreshSignal(:238), 모달 닫기(:670).
- `__deleted` 행은 `selectableIssues` 에서 제외 → 전체선택에 섞이지 않고 빈 행에 체크박스가 생기지 않는다.
- 체크박스 컬럼 렌더 조건은 head(:205)와 rows(:355) **모두 `showSelectColumn` 동일 변수** — 셀 수 불일치 불가.
- `rows` useMemo 의존성에 `showSelectColumn`·`selectedKeys` 추가(:635) — 빠뜨리면 체크가 화면에 반영되지 않는다.

### 3-4. 권한 (§4-6)

- 화면: `canEdit && canBulkApply`. `canBulkApply` 는 **`canWrite('PROJECT')` 고정**이라 칸반 컨텍스트
  (`canEdit = canWrite('KANBAN')`)에서 KANBAN write 만 가진 사용자에게 열리지 않는다.
- Jira 사전 판정: 모달 제출 시 1회. **확정 거부(`false`)만 차단**, `null`(미확인)은 시도 허용.
  일정 입력 시 `canEditIssues`+`canScheduleIssues`, MD 입력 시 `canEditIssues`.

### 3-5. 기타 규약

- **동시성 3** — `mapWithConcurrency` 재사용. `p-limit` 을 import 하지 않는다.
- **MD 0 과 빈값 구분** — `parseMdInput` 이 `''`→`null`, `'0'`→`0`. `parseFloat('') || 0` 관용구 없음. 테스트로 고정.
- `onWheel={(e) => e.target.blur()}` 적용(`BulkApplyModal.jsx`).
- 실행 중 닫기·제출 disable, 중단 기능 없음.
- 실패는 코드별 메시지 매핑(기존 키 3개 재사용 + `bulk.error.unknown`), `SectionMessage appearance="warning"` + 재시도 버튼.
- 진행 바는 plain div(신규 의존성 없음), 스피너 없음.

---

## 4. i18n

- 추가 위치: `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` 의 **`issue` 오브젝트 안 `bulk`** (22키).
  `ko-KR.json` / `en-US.json` 직접 수정 없음.
- **`npm run merge` 실행 완료** — `locales/ko-KR.json:projectDetail.issue.bulk`,
  `locales/en-US.json:projectDetail.issue.bulk` 에 반영된 것을 확인했다.
- **설계서 §6 대비 키 이름 변경(보간 미지원)**: `@forge/bridge` 의 번역 함수 타입은
  `(i18nKey: string, defaultValue?: string) => string` 로 **치환자를 지원하지 않는다**
  (`node_modules/@forge/bridge/out/i18n/index.d.ts` 확인, 코드베이스 전역에도 2인자 보간 호출 0건).
  설계서 §6 각주가 지시한 대로 기존 `plannedMdPre`/`Post` 관례를 따라 조각 키로 나눴다.

  | 설계서 키 | 실제 키 | 렌더 |
  |----------|--------|------|
  | `selected` `{n}건 선택` | `selectedPre` + `selectedPost` | `{pre}{n}{post}` |
  | `target` `대상 {n}건` | `targetPre` + `targetPost` | `{pre}{n}{post}` |
  | `running` `적용 중… {done}/{total}` | `runningPre` | `{pre}{done} / {total}` |
  | `resultSuccess` `{n}건 성공` | `resultSuccessPost` | `{n}{post}` |
  | `resultFail` `{n}건 실패` | `resultFailPost` | `{n}{post}` |

  그 외 키(`action`/`clear`/`title`/`start`/`due`/`plannedMd`/`hint`/`invalidRange`/`emptyInput`/`apply`/`cancel`/`close`/`failTitle`/`retryFailed`/`error.unknown`)는 설계서 이름 그대로.
- 하드코딩 한글 없음(모든 문구가 `t()` 경유).
- 재사용한 기존 키: `gantt.error.dateRange`, `projectDetail.issue.jiraPermission.edit|schedule`,
  `projectDetail.issue.timeTracking.disabled`, `common.toast.title.success`, `projectDetail.issue.toast.update.success`.

---

## 5. 테스트 / 빌드 결과

| 항목 | 명령 | 결과 |
|------|------|------|
| 신규 단위 테스트 | `npx jest src/pages/projectDetail/issue/bulkApply.test.js` | **18 passed** |
| 프론트 전량 | `cd static/ui && npx jest` | **76 suites / 1269 tests 전부 passed** (회귀 0) |
| CI 동일 조건 빌드 | `cd static/ui && CI=true npm run build` | **성공**. `bundle:check` → `main.js gzip 432,929B / budget 950,000B, withinBudget: true` |
| 번역 merge | `cd static/ui && npm run merge` | **실행 완료 + 산출물에 키 반영 확인** |

신규 테스트 커버리지(6 describe / 18 case): 입력 정규화(빈값·0·음수·비숫자), 일정 필요 판정, 범위 검증,
**미입력 날짜 채움 4케이스**, 실패 분류(일정 code / timetracking 400 대 `timetracking_*` 검증 오류),
결과 집계(부분 성공 = 실패 집계 + 일정만 캐시 반영), 목록 캐시 패치(미적용 필드·remaining 보존·무변경 시 참조 동일),
간트 패치값(start/end 매핑, MD 변경 시 progress 동반 재계산).

---

## 6. 백엔드에 확인이 필요한 사항

**없다.** 백엔드 변경 0건이며, 설계서 §2-1/§2-2 의 계약을 실코드(`GanttService.js:138`,
`useGanttMutations.js:119-131` 의 기존 소비 코드)와 대조해 그대로 소비했다. shape 불일치·모호함 없음.

다만 설계서 §7 backend 항목의 검증 전제 1건은 여전히 유효하다 —
`updateGanttSchedule` 이 `projectId` 를 검증하지 않는다는 전제가 깨지면 **구독 스페이스에서 편입된 이슈가
전건 실패**한다(프론트는 이 경우 `UNKNOWN` 실패로 표시한다).

---

## 6-A. 검증 피드백 반영 (2026-08-13 추기)

`03_verify_report.md` 지적 2건 중 **F-2만 수정**했다(F-1 은 코디네이터 판단으로 보류).

### F-2 [하] 해소 — 권한 실패 코드 매핑 (`bulkApply.js`)

**문제**: 실패 분류가 `'JIRA_PERMISSION_DENIED'` 만 보고 있었다. 이 값은 **프론트 클라이언트 상수**
(`useGanttMutations.js:15-19` 의 사전 가드 전용)라 서버 응답에는 존재하지 않는다 →
권한 실패가 전부 `UNKNOWN`("저장에 실패했습니다.")으로 새어 사용자가 원인을 알 수 없었다.

**서버가 실제로 주는 형태 2종** (실코드 확인):

| 경로 | `error.code` | 출처 |
|------|-------------|------|
| 앱 권한 가드 거부 | `'PERMISSION_DENIED'` (문자열) | `PermissionError(ErrorCodes.PERMISSION_DENIED, …)` — `src/permission/permissionGuard.js:127-130` |
| Jira 403 (일정) | `403` (**숫자**) | `ForgeAPIError(res.status, …)` — `src/api/jira/util/RequestJiaJson.js:59` |
| Jira 403 (MD) | `403` (**숫자**) | `RequestJiraError(response.status, …)` — `static/ui/src/utils/jiraApi/requestJira.js:175` |

숫자가 그대로 도착하는 근거: `ResponseWrapper.js:20` 이 `code: e.code || 'UNKNOWN_ERROR'` 로
**값을 변환하지 않고** 실어 보낸다(`403` 은 truthy).

**수정**: 공용 판정 `isPermissionCode(code)` 를 추가해 `String(code)` 기준으로 `'PERMISSION_DENIED'` /
`'403'` / `'JIRA_PERMISSION_DENIED'` 를 받는다. `classifyScheduleFailure` 와 `classifyMdFailure` **양쪽**에
적용했다 — MD 경로(`executeRequest`)도 같은 규칙으로 403 을 싣기 때문이다.
`classifyMdFailure` 는 **시간 추적 미지원(400) 판정을 먼저** 하고 그 다음 권한(403)을 본다(상호 배타).
프론트 상수도 같은 분류에 남겼다(도달하지 않지만 호출 경로가 늘어도 분기가 갈리지 않게).

다른 HTTP 상태(400·500)를 권한으로 뭉뚱그리지 않는 것을 테스트로 고정했다.

**추가 테스트 4케이스** (`bulkApply.test.js`, 18 → 22):
- 앱 권한 가드 거부(`'PERMISSION_DENIED'`) → 권한 실패
- Jira 403 숫자/문자열 양쪽 → 권한 실패 / `400`·`500` → UNKNOWN
- 프론트 클라이언트 상수 분류 유지
- MD 경로 403·`'PERMISSION_DENIED'` → 권한 실패, 단 timetracking 400 은 TIME_TRACKING 우선

**재검증**: `npx jest src/pages/projectDetail/issue` → 3 suites / **52 passed**.
`npx jest` 전량 → 76 suites / **1273 passed**(회귀 0).
merge/build 재실행 없음 — 코드 로직만 변경했고 i18n 키·번들 구성은 그대로다.
(실패 코드 `PERMISSION` 의 표시 문구는 기존 키 `projectDetail.issue.jiraPermission.edit` 재사용 — 신규 키 없음)

### F-1 보류

`useJiraEditGuards.js` 의 `isTimeTrackingUnsupportedError` 오분류는 **기존 공용 함수 결함**이며
단건 인라인 편집·간트 MD 편집도 같은 함수를 쓴다. 이번 변경 범위에서 고치면 3경로가 함께 바뀌므로
코디네이터 판단에 따라 별건으로 남긴다.

---

## 6-B. Codex xhigh 리뷰 후속 수정 (2026-08-13 추기)

### 6-B-0. ★ 백엔드 계약 변경 — `updateGanttSchedule` 이 **부분 업데이트**가 됐다

리더가 `src/resolver/gantt/GanttService.js:141-174` 를 직접 수정했다. 프론트는 새 계약에 맞췄다.

| | 종전 | 신규 |
|---|---|---|
| payload | `start`/`due` **항상 둘 다** 필요 | 키 미포함(`undefined`) = **미변경** / `null` = 비움 / `'YYYY-MM-DD'` = 설정 |
| `content` | `{ issueKey, start, due }` 고정 | `{ issueKey, start?, due? }` — **실제로 write 한 필드만** |
| `start > due` 서버 검증 | 항상 | **둘 다 보낸 경우만** |

### 6-B-1. [치명 해소] 캐시 채움 제거 — 입력한 필드만 전송

**문제(Codex)**: 미입력 필드를 목록 캐시의 `currentStart`/`currentDue` 로 채워 보내던 §3-1 방식은,
캐시가 낡았을 때(다른 사용자가 그 사이 일정을 바꿨을 때) **타인의 변경을 우리 옛 값으로 되돌린다.**
설계 §2-3 의 "미입력 날짜 채움"은 서버가 둘 다 PUT 하던 제약에 대한 대응이었고, 그 제약이 사라지면서
대응 자체가 위험 요인이 됐다.

**수정**: `resolveScheduleArgs(target, values)` → **`buildScheduleFields(values)`** 로 교체.

```js
// bulkApply.js — 입력한 필드만. 미입력 키는 객체에 아예 없다(JSON 직렬화에서 탈락).
export const buildScheduleFields = (values) => ({
    ...(values?.start != null ? { start: values.start } : {}),
    ...(values?.due   != null ? { due:   values.due   } : {}),
});
// useBulkApply.js
const fields = buildScheduleFields(values);
const result = await invoke('updateGanttSchedule', { projectId, issueKey, ...fields });
```

이제 보존은 **"생략에 의한 보존"** 이다 — 프론트가 기존 값을 읽지 않으므로 낡은 값을 되돌릴 경로 자체가 없다.

**연쇄 수정 2건**:
- `applied` 는 **우리가 보낸 필드에 한해서만** 채운다(`fields.start !== undefined` 가드).
  안 보낸 필드를 `applied` 에 넣으면 목록·간트 캐시에 낡은 값을 덮어쓰게 된다.
- `bulkTargets` 에서 `currentStart`/`currentDue` 를 **제거**했다(`ProjectIssueTable.jsx`).
  다른 용도가 없어 완전히 뺐다 — 남겨 두면 다시 채워 보내고 싶은 유혹이 생긴다.
  `remainingSeconds`(MD payload)·`spentSeconds`/`statusKey`(간트 progress)는 그대로 필요하다.

**⚠ 동작 변화(의도된 것)**: 한쪽 날짜만 적용할 때 **서버의 건별 범위 거부가 사라진다**
(한쪽만 보내면 서버가 비교할 짝이 없다). 예전에는 "기한만 앞당김" 이 기존 시작일보다 이르면
`GANTT_INVALID_DATE_RANGE` 로 그 이슈만 실패했는데, 이제는 그대로 저장된다.
**양쪽 다 입력했을 때의 클라 검증(`isBulkRangeInvalid`)과 서버 검증은 그대로 유지된다.**
설계서 §2-3 후반의 "정상적인 건별 실패" 문단은 이 변경으로 무효다.

### 6-B-2. [중요] MD 실패 분류 순서 — 권한 판정을 먼저

**문제(Codex)**: `isTimeTrackingUnsupportedError` 는 message 체인에 `'timetracking'` 이 있는지만 본다.
그런데 `executeRequest` 의 실패 message 는 **요청 param 을 통째로 에코한다**
(`key: updateIssue, param: {"fields":{"timetracking":…}}`) — 즉 **MD write 의 모든 실패가 매칭된다.**
이 판정을 먼저 두면 403·5xx 가 "시간 추적 필드를 켜세요"로 오안내된다.

**수정**: ①권한(`isPermissionCode`) → ②**HTTP 400 인 경우에만** 시간 추적 → ③UNKNOWN 순으로 좁혔다.

```js
export const classifyMdFailure = (error) => {
    if (isPermissionCode(error?.code)) return FAILURE.PERMISSION;
    if (isBadRequestCode(error?.code) && isTimeTrackingUnsupportedError(error)) return FAILURE.TIME_TRACKING;
    return FAILURE.UNKNOWN;
};
```

공용 `useJiraEditGuards.isTimeTrackingUnsupportedError` 는 **건드리지 않았다**
(단건 인라인 편집·간트도 쓰는 함수 — F-1 백로그 유지). 해결은 `bulkApply.js` 안에서만 했다.

### 6-B-3. [사소] 재시도 결과 누적

**문제**: `retryFailed` 후 결과가 재시도분으로 **교체**돼 "10건 성공 / 2건 실패" → 재시도 성공 시
"2건 성공"만 남았다(앞의 10건이 사라진 것처럼 읽힘).

**수정**: 순수 함수 `mergeRunResult(base, result)` 신설 + `run(targets, values, { retryOf })`.
- `total` = **최초 대상 수 유지**
- `successKeys` = 합산(Set 경유 중복 제거)
- `failures` = **교체**(재시도에 성공한 건은 목록에서 사라져야 한다)
- 진행 바는 `baseDoneCount = total - 재시도 대상 수` 에서 출발해 이미 확정된 건을 완료로 친다.

### 6-B-4. [사소·수용] 간트 progress 크로스 캐시 시점 차

코드 변경 없이 `useBulkApply.js` 의 간트 패치 지점에 주석만 남겼다 — progress 재계산에 쓰는
`spentSeconds` 는 목록 캐시가 마지막으로 본 값이라 그 사이 워크로그가 들어왔으면 서버 계산과
미세하게 어긋날 수 있다. **표시 한정**이며 다음 자연 재조회에서 해소된다. 막겠다고 write 직후
재조회를 걸면 캐시 규약 위반이다.

### 6-B-5. 재검증

| 항목 | 결과 |
|------|------|
| `npx jest src/pages/projectDetail/issue` | 4 suites / **64 passed** |
| `npx jest` 전량 | 77 suites / **1285 passed** (회귀 0) |
| CI 빌드 | **성공** — `main.js gzip 432,929B / budget 950,000B, withinBudget: true` |
| `npm run merge` | **실행하지 않음**(지시대로 — 다른 트랙이 locales 작업 중). i18n 키 변경 0건 |

> 빌드는 `CI=true npm run build:app` + `npm run bundle:check` 로 나눠 돌렸다 —
> `npm run build` 는 `prebuild` 훅이 **merge 를 자동 실행**하므로 locales 를 건드리지 않으려면
> 이 경로여야 한다. 실행 후 `git status locales/` 로 신규 변경이 없음을 확인했다.

**테스트 변경**: 기존 "미입력 날짜 채움" 4케이스는 의미가 바뀌어 **payload 키 생략 단언 5케이스**로
교체했다(`'start' in fields === false`, JSON 직렬화 후 실제 탈락 확인 포함).
추가: MD param 에코 회귀 방지 3단언, 재시도 누적 4케이스. 순수 테스트 22 → 28.

---

## 7. 추가 요청 반영 — 행별 삭제 컬럼 제거 + 선택 기반 일괄 제외 (2026-08-13 추기)

### 7-1. ★ 용어 정정 — "삭제"가 아니라 "프로젝트에서 제외"다

서버 구현을 읽어 의미를 확인했다. `deleteProjectIssueService`
(`src/resolver/projectIssue/ProjectUsersService.js:296-305`)는

```js
await setAppFieldValueForIssues({ fieldIdOrKey: customFieldId, issueIds: issueId, value: '' });
```

즉 **앱 커스텀필드 `projectId` 를 빈 문자열로 비울 뿐이고 Jira 이슈 자체는 남는다.**
기존 UI 는 이것을 "삭제"(`common.button.delete`)로 표기해 실제보다 파괴적으로 읽혔다.
신규 문구는 의미를 그대로 말한다 — 버튼 `프로젝트에서 제외`, 확인 모달에 **"Jira 이슈 자체는
삭제되지 않습니다."** 를 명시.

### 7-2. 제거한 컬럼

| 대상 | 위치 | 처리 |
|------|------|------|
| `head.cells` 의 `{ key:'extra', content: t('projectDetail.issue.table.3') }` | `ProjectIssueTable.jsx` head | 제거 |
| `rows[].cells` 의 `{ key:'extra', content: canEdit ? <Button DeleteIcon …/> : null }` | `createRow` | 제거 |
| 단건 `deleteProjectIssue(issueId, index)` 함수 | `ProjectIssueTable.jsx` | `runBulkDelete()` 로 대체(단건 호출부 없음 — 전역 grep 확인) |

head/rows **양쪽에서 같은 커밋으로** 빠져 셀 수는 계속 정합한다(10 → 9열, 체크박스 포함 시 10열).

### 7-3. 일괄 제외 흐름

```
액션 바 [프로젝트에서 제외]  →  ConfirmModal(danger, 대상 N건 + Jira 이슈 보존 안내)
                              →  확인 시 mapWithConcurrency(targets, 3, invoke('deleteProjectIssue'))
                              →  성공 건 __deleted 표식 + onAfterDelete()  →  결과 토스트
```

- **확인 UI**: 신규 컴포넌트를 만들지 않고 공용 `components/modal/ConfirmModal.jsx`
  (`appearance="danger"` + `isLoading`)를 그대로 썼다 — 칸반 컬럼 삭제가 쓰는 것과 같은 패턴이다.
  실행 중에는 `isLoading` 으로 버튼이 잠기고 `onClose` 가 무시된다.
- **동시성 3**: `mapWithConcurrency` + `BULK_APPLY_CONCURRENCY` 재사용(신규 상수·유틸 없음).
- **customFieldId 는 루프 밖에서 1회만 해석**한다 — `getCustomFieldId` 가 `view.getContext()` 를
  부르므로 건별로 두면 N번 왕복한다.
- **결과는 토스트 1회**로 끝낸다(입력 필드가 없어 진행 바·결과 화면이 필요 없다 — 과설계 회피).
  전건 성공이면 `N건을 프로젝트에서 제외했습니다.`, 실패가 섞이면 `N건 성공 / M건 실패`(적용 결과 키 재사용).

**실패 shape 확인**: `guardedDefine` + `ResponseWrapper` 계약 그대로
`{ success:false, error:{ name, code, message, cause } }`. 실패 분류는 §6-A 에서 만든 `isPermissionCode`
를 공유한다(`PERMISSION_DENIED` / 숫자 `403` → 권한 실패, 그 외 UNKNOWN).

**⚠ 기존 단건 삭제의 결함을 그대로 옮기지 않았다**: 옛 코드는
`invoke(...).then(() => 성공 토스트)` 라 `invoke` 가 throw 하지 않는 탓에 **서버가 거부해도 성공으로
표시하고 행에 삭제 표식까지 남겼다.** 일괄판은 `result.success !== true` 를 명시 검사해
실패 건은 표식을 달지 않는다.

### 7-4. 캐시 처리 (단건 삭제와 동일)

```js
patchGroupPage(queryKey, (old) => ({ ...old, issues: markIssuesDeleted(old.issues, successIndexes) }));
onAfterDelete?.();   // 카드 헤더 요약(개수/상태분포) 재로드
```

- 행을 **빼지 않고 `__deleted` 표식만** 단다 — 배열에서 제거하면 뒤 행의 index 가 밀려
  인라인 편집·`searchByIssueId` 가 엉뚱한 이슈를 건드린다(단건 삭제가 표식을 쓰던 이유와 동일).
- 그래서 제외 대상은 **원본 `issues` 배열의 index** 로 뽑는다(`bulkDeleteTargets`) —
  `selectableIssues` 는 `__deleted` 를 걸러낸 배열이라 index 가 어긋난다.
- 성공 0건이면 캐시도 요약도 건드리지 않는다.
- 목록 재조회(invalidate) 없음. `onAfterDelete`(=`invalidateSummary`)는 **기존 단건 삭제가 하던 그대로**다.

### 7-5. 권한 조건

`deleteProjectIssue` 의 서버 가드는 `W('PROJECT','inherited')`(`PermissionMap.js:139`)로
`updateGanttSchedule`(`:253`)과 **완전히 동일**하다. 따라서 일괄 적용과 일괄 제외의 요구 권한이 같아
버튼을 분리할 이유가 없고, 체크박스 노출 조건 `showSelectColumn = canEdit && canBulkApply`
(= canEdit && `canWrite('PROJECT')`)가 두 버튼 모두의 조건이 된다.

부수 효과로 **기존 단건 삭제 버튼의 잠재 결함이 해소됐다** — 옛 버튼은 `canEdit` 만 보고 렌더돼
칸반 컨텍스트에서 KANBAN write 만 가진 사용자에게 노출됐고, 눌러도 서버가 거부했다.

### 7-6. 신규 i18n (kr/en 각 6키, `issue.bulk.` 하위)

| 키 | kr | en |
|----|-----|-----|
| `delete` | 프로젝트에서 제외 | Remove from project |
| `deleteTitle` | 선택 작업 제외 | Remove selected issues |
| `deleteMessagePre` / `deleteMessagePost` | `선택한 ` / `건을 이 프로젝트에서 제외합니다. Jira 이슈 자체는 삭제되지 않습니다.` | `Remove ` / ` issues from this project. The Jira issues themselves are not deleted.` |
| `deleteConfirm` | 제외 | Remove |
| `deleteSuccessPost` | 건을 프로젝트에서 제외했습니다. | ` issues removed from this project.` |

`cd static/ui && npm run merge` **실행 완료** — `ko-KR.json`/`en-US.json` 반영 확인.

> 컬럼 제거로 `projectDetail.issue.table.3`("추가 작업")과 `projectDetail.issue.toast.delete.success`
> 두 키가 미사용이 됐다. 로케일에서 **삭제하지 않고 남겨 뒀다**(동작 영향 0, 되돌릴 여지 유지).

### 7-7. 신규/변경 파일

| 파일 | 구분 |
|------|------|
| `pages/projectDetail/issue/bulkDelete.js` | 신규 — 실패 분류 / 결과 집계 / `__deleted` 캐시 패치(순수) |
| `pages/projectDetail/issue/bulkDelete.test.js` | 신규 — 6케이스 |
| `pages/projectDetail/issue/bulkApply.js` | `isPermissionCode` export 추가(권한 판정 공유) |
| `pages/projectDetail/issue/ProjectIssueTable.jsx` | extra 컬럼 제거, `runBulkDelete`, 액션 바 제외 버튼, ConfirmModal 마운트 |
| `locales/kr|en/projectDetail.json` | `issue.bulk.delete*` 6키 |

### 7-8. 재검증

| 항목 | 결과 |
|------|------|
| `npx jest src/pages/projectDetail/issue` | 4 suites / **58 passed** |
| `npx jest` 전량 | 77 suites / **1279 passed** (회귀 0) |
| `CI=true npm run build` | **성공** — `main.js gzip 432,929B / budget 950,000B, withinBudget: true` |
| `npm run merge` | 실행 완료 + 산출물 확인 |

신규 테스트 6케이스: 권한 코드 분류 공유, 결과 집계(성공 인덱스/실패), **`index 0` 을 falsy 로
빠뜨리지 않는지**, 표식 패치(성공 건만·나머지 참조 보존·행 수 유지), 무변경 시 원본 참조, 범위 밖 인덱스 무시.

---

## 8. 남은 작업 / 알려진 한계

- **E2E 미수행** — 실제 Jira 사이트에서 N건 적용은 검증하지 않았다. 특히 ①기한만 적용 후 기존 시작일 생존
  (§6-B-1 이후로는 **payload 에 start 키가 없어서** 보존된다), ②MD 0 적용,
  ③팀 관리형 프로젝트의 timetracking 400 안내 3건은 배포 검증이 필요하다.
- **§3-1 은 §6-B-1 로 대체됐다** — 이 리포트를 읽을 때 "미입력 날짜 채움"은 현재 코드에 없다.
- 선택 상한은 페이지 크기(최대 50)로 자연히 묶인다 — 별도 상한 UI 없음(설계 결정).
- 중단(취소) 기능 없음(설계 결정 §4-4).
- **일괄 제외 E2E 미수행** — 실제 사이트에서 ①N건 제외 후 카드 헤더 개수 정합, ②권한 거부 건이
  표식 없이 실패로 남는지 확인이 필요하다.
- 일괄 제외는 실패 목록을 토스트 요약(성공 N/실패 M)으로만 알린다 — 어떤 이슈가 왜 실패했는지까지는
  보여주지 않는다(§7-3 과설계 회피 결정). 건별 사유가 필요해지면 `BulkApplyModal` 의 결과 단계를 재사용하면 된다.
