# 작업관리 목록 뷰 일괄 적용 설계서

> 작성 2026-08-13 / 소스 기준 `8dd1002` (develop)
> 요구사항: `_workspace/work-bulk-apply/00_input/requirement.md`

---

## 0. 코드 조사로 확인된 사실 (설계 전제 정정)

요구사항의 전제 중 **2건이 실제 코드와 다르다.** 설계는 정정된 사실을 따른다.

| # | 요구사항 전제 | 실제 코드 | 설계 반영 |
|---|--------------|----------|----------|
| A | "목록 뷰에 행 체크박스가 이미 존재한다(`checkItems` — 삭제/등록에 사용 중)" | **존재하지 않는다.** `static/ui/src/` 전역에 `checkItems` 심볼이 없고, `ProjectIssueTable.jsx`의 삭제는 **행별 삭제 버튼**(`cells[9] extra` → `deleteProjectIssue(issue.id, index)`)이다. 목록 뷰에 선택 개념 자체가 없다. | **체크박스 컬럼을 신규 추가**한다(§4-2). 이번 작업의 최대 미지 공수. |
| B | "시작일/기한 → 목록 뷰도 `updateGanttSchedule` 을 쓴다" | 목록 뷰의 단건 날짜 인라인 편집은 `updateGanttSchedule` 을 **쓰지 않는다.** `ProjectIssueTable.mutateDate` 가 `executeRequest('updateIssue', {fields:{[field]: value}})` 로 **필드당 1회 직접 호출**한다. `updateGanttSchedule` 은 간트/트리 전용 경로다. | 일괄 적용은 **`updateGanttSchedule` 을 쓴다**(요구사항대로). 근거는 §2-3 — 목록 뷰 경로보다 호출이 적고 서버 가드가 붙는다. |

그 외 확인 사항:

- **`p-limit` 은 프론트에서 쓸 수 없다.** `static/ui/package.json` 에 `p-limit@^7.3.0` 이 있으나 ESM-only 라 jest 변환 대상 밖이며, 프론트는 `useJiraUserInfos.js` 의 자체 `mapWithConcurrency`(BULK_CONCURRENCY=3)를 쓴다는 주석이 명시돼 있다. → §4-4.
- **`@atlaskit/progress-bar` 는 의존성에 없다.** 진행 표시는 plain div 바로 만든다(신규 의존성 추가 금지). `@atlaskit/checkbox@17.3.3`, `@atlaskit/section-message@8.12.7` 은 있다.
- **`updateGanttSchedule` 은 `projectId` 를 검증하지 않는다.** `GanttService.js:136` 주석 그대로 — `@param projectId (계약 유지용, 현재 검증엔 미사용)`. 검증은 `issueKey` 존재 + `start > due` 뿐. → **구독 스페이스 소속 이슈에도 그대로 통과한다. 신규 resolver 불필요.**

---

## 1. 개요 / 영향 범위

프로젝트 상세 > 작업관리 > **목록 뷰**의 그룹(Jira 프로젝트) 카드 테이블에서 행을 체크박스로 선택하고,
시작일 / 기한 / 계획 작업량(MD)을 같은 값으로 일괄 설정한다. 입력한 필드만 적용한다.

### 백엔드
**신규 0 / 수정 0.** 기존 `updateGanttSchedule` resolver 를 계약 그대로 재사용한다.
`src/index.js`·`PermissionMap.js`·`manifest.yml` 모두 변경 없다 (`updateGanttSchedule: W('PROJECT','inherited')` 이미 등록됨 — `PermissionMap.js:253`).

### 프론트
| 파일 | 구분 | 내용 |
|------|------|------|
| `pages/projectDetail/issue/BulkApplyModal.jsx` | **신규** | 입력 3필드 + 진행 + 결과 집계 모달 |
| `pages/projectDetail/issue/useBulkApply.js` | **신규** | 동시성 제한 실행 + 결과 수집 + 캐시 패치 훅 |
| `pages/projectDetail/issue/ProjectIssueTable.jsx` | 수정 | 체크박스 컬럼 + 선택 액션 바 + 모달 마운트 |
| `pages/projectDetail/issue/ProjectGroupCard.jsx` | 수정 | `canBulkApply` prop 통과(1줄) |
| `pages/projectDetail/issue/ProjectIssuePanel.jsx` | 수정 | `canBulkApply` 산출 + 전달(2줄) |
| `pages/projectDetail/gantt/useGanttMutations.js` | 수정 | `patchTask`·`plannedHours`·`computeProgressLocal` **export 추가**(로직 변경 0) |
| `utils/useJiraUserInfos.js` | 수정 | `mapWithConcurrency` **export 추가**(로직 변경 0) |

**신규 쿼리키 없음** — 조회가 없는 기능이다. 기존 `workListKeys.groupPage` / `ganttKeys.data` 캐시를 패치만 한다.
**신규 Zustand 스토어 없음** — 선택 상태는 테이블 로컬 state.

### DB
**변경 없음.** MySQL 테이블·KVS 엔티티 신규/수정 모두 없다. 마이그레이션 불요.

### i18n
`locales/kr/projectDetail.json` + `locales/en/projectDetail.json` 의 `issue` 서브트리에 `issue.bulk.*` 추가 → `npm run merge`. 신규 파일 없음.

---

## 2. 경계면 계약 (가장 중요)

### 2-1. resolver 계약 (신규 0 — 기존 재사용)

| resolver 함수 | 입력 파라미터 | 응답 shape (success 시) | 대응 프론트 훅/쿼리키 |
|--------------|-------------|------------------------|---------------------|
| `updateGanttSchedule` (기존, 무변경) | `{ projectId, issueKey, ...scheduleFields }`<br>`scheduleFields`의 `start`/`due`는 `'YYYY-MM-DD'` \| `null`이며, 미변경 필드는 **속성 자체를 생략** | `{ success: true, content: { issueKey, ...appliedFields } }` — `content`에는 실제로 쓴 일정 필드만 부분 반환 | `useBulkApply` (신규, mutation 아님 — 명령형 실행 훅). 캐시키 없음. 성공 시 `workListKeys.groupPage(...)` + `ganttKeys.data(projectId)` 를 **직접 패치** |

실패 시: `{ success: false, error: { name, code, message, cause } }`
발생 가능 `error.code`: `GANTT_INVALID_DATE_RANGE`(start > due), `GANTT_ISSUE_NOT_FOUND`(issueKey 누락), Jira PUT 실패 시 `ForgeAPIError` 계열.

### 2-2. Jira 직접 호출 계약 (계획 MD)

| 호출 | 입력 | 응답 | 실패 판정 |
|------|------|------|----------|
| `executeRequest('updateIssue', { fields: { timetracking } }, { issueIdOrKey: issueKey })` | `timetracking = buildTimetrackingPayload(`${plannedHours(md, hourRate)}h`, remainingEstimateSeconds)` | 성공 시 `''` 또는 JSON | `result?.success === false` → 실패. `executeRequest` 는 **throw 하지 않는다.** `isTimeTrackingUnsupportedError(result.error)` 로 시간추적 미지원 400 을 분리 |

`remainingEstimateSeconds` 는 **추가 GET 없이** 목록 캐시 행에서 읽는다: `issue.fields.timetracking?.remainingEstimateSeconds ?? null`
(목록 뷰는 `fields:['*all']` 로 조회하므로 이미 들고 있다. 간트의 `useUpdatePlannedMd` 가 단건 GET 을 하는 이유는 간트 Task shape 에 remaining 이 없어서다 — 목록 뷰엔 해당 없음.)

### 2-3. ★ `updateGanttSchedule` 재사용 근거 + **필수 주의 1건**

**재사용 판단 근거 (신규 resolver 불필요)**
1. `projectId` 를 검증하지 않는다(`GanttService.js:138-167`). 구독 스페이스에서 편입된 이슈, 목록 뷰에 섞인 복수 Jira 프로젝트 이슈 모두 그대로 통과한다. — 요구사항이 지목한 "목록 뷰 이슈 집합과 안 맞을 가능성"은 **실재하지 않는다.**
2. `customfield_10015`(시작일) + `duedate`(기한)를 **PUT 1회**로 함께 쓴다. 목록 뷰의 기존 `mutateDate` 경로를 쓰면 필드당 1회 = 2회다. 일괄 N건에서 왕복 수가 2배가 된다.
3. 서버 `guardedDefine` + `W('PROJECT','inherited')` 앱 권한 가드가 붙는다. 직접 Jira 호출 경로엔 없다.
4. `start > due` 를 서버가 한 번 더 검증한다(클라 가드의 2차 방어).

> **변경됨 (2026-08-13)** — 위의 “양쪽 필드를 항상 PUT하고, 미입력 값을 캐시에서 채운다”는 초기 설계는 폐기되었다.
> 현재 `buildScheduleFields`는 사용자가 입력한 필드만 전송하고, 서버도 전송된 필드만 PUT 및 부분 `content`로 반환한다. 따라서 캐시 채움은 하지 않으며, 목록 캐시는 실제 적용된 필드만 부분 업데이트한다.
>
> 한쪽 날짜만 적용하면 기존 반대쪽 날짜와 역전된 일정이 남을 수 있다. 이는 현재 서버가 양쪽 값이 함께 전송된 경우에만 범위를 검증하는 계약의 트레이드오프이며, 표시는 `diffDays`를 최소 1일로 클램프한다.

### 2-4. 프론트 내부 계약 — `useBulkApply` 반환 shape

```js
const { run, retryFailed, reset, state } = useBulkApply({
    projectId,        // 앱 projectId (updateGanttSchedule 인자)
    groupKey,         // Jira 프로젝트 key (권한 판정 대상)
    queryKey,         // workListKeys.groupPage(...) — 현재 페이지 캐시 키
    hourRate,         // MD → h 환산율
    toast,
});

// run(targets, values)
//   targets: [{ issueKey, index, currentStart, currentDue, remainingSeconds, spentSeconds, statusKey }]
//   values : { start: 'YYYY-MM-DD'|null, due: 'YYYY-MM-DD'|null, md: number|null }

// state (렌더 대상)
state = {
    phase: 'idle' | 'running' | 'done',
    total: number,        // 대상 건수
    doneCount: number,    // 완료(성공+실패) 건수 — 진행 바 분자
    successKeys: string[],
    failures: [ { issueKey: string, code: FailureCode } ],
}

// FailureCode = 'GANTT_INVALID_DATE_RANGE' | 'JIRA_PERMISSION_DENIED'
//             | 'TIME_TRACKING_DISABLED' | 'UNKNOWN'
```

---

## 3. 백엔드 설계

**작업 없음.** 아래는 재사용 대상의 확인 결과이며 구현자는 이 파일들을 **수정하지 않는다.**

| 항목 | 위치 | 상태 |
|------|------|------|
| Controller 등록 | `src/resolver/gantt/GanttController.js:26` `guardedDefine(resolver,'updateGanttSchedule',…)` | 기존 — 변경 없음 |
| Service | `src/resolver/gantt/GanttService.js:138` `updateGanttSchedule` | 기존 — 변경 없음 |
| Repository | 없음(Jira PUT 직행 `updateIssueFields`) | — |
| 권한 매핑 | `src/permission/PermissionMap.js:253` `W('PROJECT','inherited')` | 기존 — 변경 없음 |
| `src/index.js` 등록 | `registerGanttController` (`CONTROLLER_REGISTRARS`) | 기존 — 변경 없음 |

에러 케이스(`src/utils/errors/ErrorCodes.js`, 신규 추가 없음):
- `GANTT_INVALID_DATE_RANGE` — start > due
- `GANTT_ISSUE_NOT_FOUND` — issueKey 누락

> **일괄 전용 resolver(`bulkUpdateSchedule` 등)를 만들지 않는 이유:**
> Forge resolver 1회 = 함수 1회 기동이므로 N건을 서버에서 돌리면 256MB 런타임 안에서 Jira PUT N회를 직렬/병렬로 떠안게 되고, 실패 건별 부분 성공 보고를 위한 응답 계약을 새로 만들어야 한다. 클라이언트가 N회 호출하면 진행률·부분 실패·재시도가 전부 자연스럽게 풀리고 서버 코드는 0줄이다. 요구사항의 "신규 백엔드 최소화" 와도 일치한다.

---

## 4. 프론트엔드 설계

### 4-1. 컴포넌트 트리 (변경분만)

```
ProjectIssuePanel                      (canBulkApply 산출: usePermissionStore.canWrite('PROJECT'))
└ ProjectGroupCard                     (canBulkApply passthrough)
  └ ProjectIssueTable                  ★ 선택 상태 소유자
    ├ [선택 액션 바]                    selectedKeys.size > 0 일 때만 렌더
    ├ CursorPagingTable                head.cells[0] / rows[].cells[0] 에 체크박스 추가
    └ BulkApplyModal                   ★ 신규
      └ useBulkApply                   ★ 신규 (실행 + 캐시 패치)
```

### 4-2. 선택 상태 — 소유자와 범위 (★ 핵심 결정)

**선택은 `ProjectIssueTable` 이 소유하고, 범위는 "한 그룹 카드의 현재 페이지"로 한정한다.**

```js
const [selectedKeys, setSelectedKeys] = useState(() => new Set()); // issue.key 저장
```

| 결정 | 근거 |
|------|------|
| 그룹(Jira 프로젝트) **횡단 선택을 하지 않는다** | 목록 뷰는 Jira 프로젝트별 카드로 쪼개져 있고 각 카드가 **자기 페이징을 따로** 갖는다. 카드를 넘나드는 선택은 상태를 Panel 로 올리고 카드별 페이지 이동마다 동기화해야 하며, 무엇보다 **권한 판정이 프로젝트 수만큼 늘어난다**. 한 카드로 한정하면 판정 대상이 정확히 1개다(§4-6). |
| **페이지 넘어가면 선택 해제** | 커서 페이징이라 다른 페이지의 행은 캐시에도 없다. 안 보이는 행이 선택된 채 남으면 "N건 선택"과 화면이 어긋나고, 캐시 패치 대상(index)도 잡을 수 없다. 상한은 자연히 `pageSize`(최대 50)가 된다. |
| 필터/페이지크기/프로젝트/그룹 변경 시 해제 | 기존 `resetSig` 블록(`ProjectIssueTable.jsx:77-83`)에 `setSelectedKeys(new Set())` 한 줄 추가 |
| 적용 성공 후 해제 | 모달 닫을 때 초기화 |

체크박스 컬럼:
- `head.cells` 맨 앞에 `{ key:'select', content: <Checkbox isChecked={allSelected} isIndeterminate={some} onChange={toggleAll} label="" /> }` 추가.
- 각 행 `cells` 맨 앞에 `{ key:'select', content: <Checkbox isChecked={selectedKeys.has(issue.key)} onChange={()=>toggle(issue.key)} label="" /> }`.
- **삭제 표식 행 주의**: `rows` 는 `issue.__deleted` 인 행을 `{keys:null, cells:[]}` 로 렌더한다(`ProjectIssueTable.jsx:548-553`). 전체선택은 `__deleted` 행을 제외해야 하고, 빈 행에는 체크박스를 넣지 않는다.
- `canEdit && canBulkApply` 가 false 면 컬럼 자체를 만들지 않는다(head/rows 양쪽 동일 조건 — 셀 수가 어긋나면 표가 깨진다).

### 4-3. 선택 액션 바

`CursorPagingTable` **위**, 테이블과 같은 컨테이너에 렌더. 스켈레톤/스피너 없음.

```
┌────────────────────────────────────────────────┐
│ 12건 선택   [일괄 적용]        [선택 해제]      │
└────────────────────────────────────────────────┘
```

Atlaskit `Inline` + `Button`(primary / subtle). 배경은 `token("color.background.selected", …)` 수준으로 옅게.

### 4-4. 실행 — 동시성 / 순서 (`useBulkApply`)

- **동시성 3.** 상수 `const BULK_APPLY_CONCURRENCY = 3;` — `useJiraUserInfos.js` 의 `BULK_CONCURRENCY = 3` 선례와 같은 값. 최대 50건이므로 3이면 실사용 체감 지연이 없고 Jira rate limit 여유가 크다.
- **`p-limit` 을 쓰지 않는다.** ESM-only 라 jest 변환 대상 밖(`useJiraUserInfos.js:14` 주석). `useJiraUserInfos.js` 의 기존 `mapWithConcurrency` 를 **named export 로 노출해 그대로 재사용**한다(함수 본문 변경 금지 — 이 파일은 성능 감사 P1-14 결과물이다). 새 유틸 파일을 만들거나 12줄을 복사하지 않는다.
- **이슈 1건의 내부 순서: 일정 → MD (fail-fast).**
  ```
  applied = {}
  if (needSchedule) {
      invoke('updateGanttSchedule', …)   // 실패 → 실패 기록 후 이 이슈 종료
      applied.start = …; applied.due = …
  }
  if (needMd) {
      executeRequest('updateIssue', {fields:{timetracking}}, …)  // 실패 → 실패 기록
      applied.md = …
  }
  ```
- **성공 판정**: 요청한 필드가 **전부** 적용된 건만 성공으로 센다. 일정만 성공하고 MD 가 실패한 건은 **실패로 집계하되, 실제로 써진 일정은 캐시에도 반영한다**(`applied` 누적분만 패치). 캐시가 서버와 어긋나지 않게 하는 것이 우선이다.
- **`doneCount` 는 건별 완료 즉시 증가** → 진행 바가 실시간으로 찬다.
- 실행 중 모달은 닫히지 않는다(닫기·제출 버튼 disable). 중단(취소) 기능은 넣지 않는다 — 이미 나간 PUT 을 되돌릴 수 없어 "취소했는데 일부는 적용됨"이 되고, 최대 50건이라 실익이 없다.

### 4-5. 캐시 전략 (★ write 직후 search 재조회 금지 규약 준수)

**어떤 경우에도 `invalidateGroup` / `invalidateSummary` / `ganttKeys.data` invalidate 를 호출하지 않는다.**
목록 뷰·간트 데이터 모두 JQL `search` 기반이라 write 직후 재조회는 인덱스 지연으로 **옛 값을 캐시에 박제한다**(CLAUDE.md, `useGanttMutations.js:443-446`·`526-529`).

#### (a) 목록 캐시 — `workListKeys.groupPage(project_id, groupKey, filter, pageSize, cursor)`
성공 건의 값을 **우리가 쓴 값 그대로** 직접 패치한다(재조회·추가 GET 0회).
기존 `patchGroupPage(queryKey, updater)`(`useWorkListQueries.js:139`)를 그대로 쓴다. 단건 편집이 쓰는 `searchByIssueId`(이슈당 GET 1회)는 **쓰지 않는다** — 50건이면 GET 50회가 붙는다.

```js
patchGroupPage(queryKey, (old) => {
    if (!old?.issues) return old;
    const nextIssues = old.issues.map((iss) => {
        const p = appliedByKey.get(iss.key);          // 실제 성공한 필드만
        if (!p) return iss;
        const tt = iss.fields.timetracking ?? {};
        return { ...iss, fields: { ...iss.fields,
            ...(p.start !== undefined ? { customfield_10015: p.start } : {}),
            ...(p.due   !== undefined ? { duedate: p.due } : {}),
            ...(p.mdSeconds !== undefined
                ? { timetracking: { ...tt, originalEstimateSeconds: p.mdSeconds } } : {}),
        }};
    });
    return { ...old, issues: nextIssues };
});
```
- 표가 실제로 읽는 필드는 `customfield_10015`, `duedate`, `timetracking.originalEstimateSeconds`, `timetracking.remainingEstimateSeconds` 뿐이다(`ProjectIssueTable.jsx:274·356·421·522`). 그 4개만 정합을 맞추면 된다.
- `mdSeconds = Math.round(plannedHours(md, hourRate) * 3600)` — **실제 write 하는 시간값에서 역산**한다. `md * hourRate * 3600` 을 그대로 쓰면 0.1h 반올림 때문에 캐시가 서버 저장값과 미세하게 달라진다.
- **요약 캐시(`workListKeys.summary`)는 건드리지 않는다.** 카드 헤더는 이슈 수 + 상태 분포뿐이라 일정·MD 변경의 영향을 받지 않는다.

#### (b) 간트/트리 캐시 — `ganttKeys.data(projectId)` : **패치한다**

- `queryClient.getQueryData(ganttKeys.data(projectId))` 가 `undefined`(= 이번 세션에 간트/트리를 연 적 없음)면 **아무것도 하지 않는다.** 비용 0.
- 캐시가 있으면 패치한다. 근거: 간트/트리는 `staleTime` 5분이라(`useGanttData`) 방치하면 탭을 옮긴 사용자가 **N건이 통째로 옛 일정인 화면**을 보게 된다. 단건 편집 1개가 어긋나는 것과 체감이 다르다. `invalidate` 는 위 규약 위반이라 선택지가 아니다.
- 패치 필드는 간트 자신의 mutation 이 쓰는 것과 **동일하게** 맞춘다. `useGanttMutations.js` 의 기존 헬퍼를 export 해 재사용한다(공식 복제 금지):
  - 일정: `patchTask(old, issueKey, { start, end: due })`
  - MD: `patchTask(old, issueKey, { originalEstimateSeconds, progress: computeProgressLocal(statusKey, originalEstimateSeconds, spentSeconds) })`
- **`progress` 재계산을 빠뜨리지 말 것.** `progress` 는 `originalEstimateSeconds` 를 분모로 쓰는 파생값이라 계획 MD 만 패치하면 막대가 옛 %로 남는다 — `useUpdatePlannedMd` 가 주석(`:593-600`)으로 남긴 기왕의 사고다.
- 재료는 전부 목록 캐시 행에 이미 있다: `spentSeconds = issue.fields.timetracking?.timeSpentSeconds ?? null`, `statusKey = issue.fields.statusCategory?.key`. **추가 조회 0회.**

### 4-6. 권한

| 층 | 판정 | 구현 |
|----|------|------|
| 앱 권한(화면) | `canWrite('PROJECT')` | `ProjectIssuePanel` 에서 산출해 `canBulkApply` 로 내린다. 체크박스 컬럼·액션 바는 `canEdit && canBulkApply` 일 때만 렌더. **`canEdit` 만으로 게이트하지 말 것** — 칸반 모달 컨텍스트(`context==='kanban'`)에서 `canEdit` 은 `canWrite('KANBAN')` 이라, KANBAN write 만 가진 사용자가 버튼을 보고 눌러도 `updateGanttSchedule` 의 서버 가드(`W('PROJECT','inherited')`)가 전건 거부한다. |
| Jira 권한(사전 판정) | **프로젝트 1회** | `ProjectIssueTable` 이 **이미** `useJiraProjectPermissions(groupKey)` 를 호출하고 있다(`:110`). 선택 범위를 한 그룹으로 한정했으므로(§4-2) 이 값이 곧 유일한 판정이다. **추가 호출 0회** — `fetchJiraProjectPermissions` 는 모듈 TTL 5분 캐시라 재호출해도 왕복이 없지만, 그마저 필요 없다. |
| 앱 권한(서버) | `W('PROJECT','inherited')` | 기존 `guardedDefine` 가드 그대로. 변경 없음. |

사전 판정 규칙은 기존 관례를 따른다 — **확정 거부(`false`)만 차단하고 `null`(미확인)은 시도를 허용**한다(서버가 최종 거부).
- `values.start`/`values.due` 중 하나라도 있으면 → `canEditIssues !== false && canScheduleIssues !== false` 필요
- `values.md` 가 있으면 → `canEditIssues !== false` 필요
- 위반 시 모달 제출 시점에 `toast.showInfo(t('projectDetail.issue.jiraPermission.schedule'|'…edit'))` 후 **실행하지 않는다**(N건 전부 실패하는 낭비 방지).

### 4-7. 모달 (`BulkApplyModal`)

`components/modal/CommonModal.jsx`(=`BaseModal`) 를 쓴다 — `GanttScheduleModal` 과 동일 패턴(`Form` + `Field` + footer 함수형).

**입력 단계**
```
대상: PROJ 프로젝트 12건               ← 대상 요약 1줄
[ 시작일   (DatePicker, 비워두면 미변경) ]
[ 기한     (DatePicker, 비워두면 미변경) ]
[ 계획 작업량 (Textfield type=number, MD) ]
비워둔 항목은 변경하지 않습니다.        ← 안내 문구(항상 노출)
```
- 3필드 전부 비면 제출 버튼 `isDisabled`.
- 시작일·기한이 **둘 다** 입력됐고 `start > due` 면 `ErrorMessage` 로 차단.
  > **변경됨 (2026-08-13)** — 한쪽만 입력하면 해당 필드만 전송되어 서버 범위 검증도 하지 않는다. 기존 반대쪽 날짜와 역전될 수 있으며, 표시는 `diffDays`를 최소 1일로 클램프한다(§2-3).
- MD 입력에 **`onWheel={(e) => e.target.blur()}` 필수**(WORK_VIEWS.md §9). `type="number" min="0" step="0.5"`, `inputMode="decimal"`.
- MD 는 `parseFloat`. 빈 문자열 → `null`(미변경)이며 **`0` 과 구분해야 한다** — `0` 은 "계획을 0으로 지운다"는 유효한 입력이다. `parseFloat('') || 0` 같은 관용구를 쓰면 미입력이 0 적용으로 새어 나간다.

**진행 단계** (`phase === 'running'`)
```
적용 중… 7 / 12
[■■■■■■■□□□□□]                       ← plain div 바 (의존성 추가 금지)
```
바: 바깥 div `height:6, borderRadius:3, background: token("color.background.neutral")` + 안쪽 div `width: ${doneCount/total*100}%, background: token("color.background.brand.bold")`. 스피너 금지.

**결과 단계** (`phase === 'done'`)
```
10건 성공 / 2건 실패
┌ 실패 (2)                            ← SectionMessage appearance="warning"
│ PROJ-12  시작일이 기한보다 늦습니다
│ PROJ-31  시간 추적 필드를 편집할 수 없습니다
└ [실패 건만 재시도]
                              [닫기]
```
- 실패 0건이면 성공 문구만 보여주고 결과 단계를 짧게 유지한다.
- **재시도**: `retryFailed()` 는 직전 `values` 로 실패 목록만 다시 `run` 한다. 대상 배열을 실패분으로 갈아끼우고 같은 실행 경로를 타므로 추가 로직은 몇 줄이다.
- 성공 캐시 패치는 **결과 화면을 닫을 때가 아니라 건별 완료 시점 이후 일괄 1회**(실행 종료 시) 수행한다. 사용자가 모달을 닫지 않아도 뒤 테이블은 이미 갱신돼 있다.

**실패 코드 → 메시지 매핑** (렌더 시점 1회 매핑 함수)
| code | i18n 키 |
|------|---------|
| `GANTT_INVALID_DATE_RANGE` | `gantt.error.dateRange` (기존 키 재사용) |
| `JIRA_PERMISSION_DENIED` | `projectDetail.issue.jiraPermission.edit` (기존) |
| `TIME_TRACKING_DISABLED` | `projectDetail.issue.timeTracking.disabled` (기존) |
| `UNKNOWN` | `projectDetail.issue.bulk.error.unknown` (신규) |

---

## 5. DB 설계

**해당 없음.** MySQL 테이블·KVS 엔티티 신규/변경 없음, 마이그레이션 없음, `manifest.yml` 변경 없음(신규 스코프 불요 — 사용하는 Jira 호출은 전부 기존 경로다).

---

## 6. i18n 키 목록

`locales/kr/projectDetail.json` / `locales/en/projectDetail.json` 의 **`issue` 오브젝트 안**에 `bulk` 를 추가한다.
(파일 최상위 키는 `tabs/description/user/issue/analysis/filter/work` — `projectDetail` 접두어는 merge 가 파일명으로 붙인다. 최종 t() 키는 `projectDetail.issue.bulk.*`)

| 키 (`issue.bulk.` 하위) | kr | en |
|------|-----|-----|
| `action` | `일괄 적용` | `Bulk apply` |
| `selected` | `{n}건 선택` | `{n} selected` |
| `clear` | `선택 해제` | `Clear` |
| `title` | `선택 작업 일괄 적용` | `Bulk apply to selected issues` |
| `target` | `대상 {n}건` | `{n} issues` |
| `start` | `시작일` | `Start date` |
| `due` | `기한` | `Due date` |
| `plannedMd` | `계획 작업량 (MD)` | `Planned effort (MD)` |
| `hint` | `비워둔 항목은 변경하지 않습니다.` | `Blank fields are left unchanged.` |
| `invalidRange` | `시작일이 기한보다 늦습니다.` | `Start date is after the due date.` |
| `emptyInput` | `적용할 값을 하나 이상 입력하세요.` | `Enter at least one value to apply.` |
| `apply` | `적용` | `Apply` |
| `cancel` | `취소` | `Cancel` |
| `close` | `닫기` | `Close` |
| `running` | `적용 중… {done} / {total}` | `Applying… {done} / {total}` |
| `resultSuccess` | `{n}건 성공` | `{n} succeeded` |
| `resultFail` | `{n}건 실패` | `{n} failed` |
| `failTitle` | `실패한 작업` | `Failed issues` |
| `retryFailed` | `실패 건만 재시도` | `Retry failed only` |
| `error.unknown` | `저장에 실패했습니다.` | `Failed to save.` |

> 치환자(`{n}` 등)는 기존 `t()` 사용 관례를 따른다. `useI18nStore.t` 가 보간을 지원하지 않으면 **문자열 결합**으로 처리한다 — `issue.table.tooltip.plannedMdPre` / `…Post` 처럼 앞뒤 조각을 나누는 기존 방식이 이 리포지토리의 관례다. 구현자는 `useI18nStore.js` 를 먼저 확인할 것.

**재사용하는 기존 키(추가 불요)**: `gantt.error.dateRange`, `projectDetail.issue.jiraPermission.edit`, `projectDetail.issue.jiraPermission.schedule`, `projectDetail.issue.timeTracking.disabled`, `common.toast.title.success`, `common.toast.title.Fail`.

작업 후 `cd static/ui && npm run merge` 필수. `ko-KR.json`·`en-US.json` 직접 수정 금지.

---

## 7. 구현 작업 분해

### backend
- [ ] **작업 없음.** `src/resolver/gantt/*`, `PermissionMap.js`, `src/index.js`, `manifest.yml` 을 수정하지 않는다.
- [ ] (검증만) `updateGanttSchedule` 이 `projectId` 를 검증하지 않는다는 전제가 유지되는지 확인 — 이 전제가 깨지면 구독 스페이스 이슈가 전건 실패한다.

### frontend

**F1. 헬퍼 노출 (로직 변경 0)**
- [ ] `utils/useJiraUserInfos.js` — `mapWithConcurrency` 에 `export` 추가. 함수 본문 변경 금지.
- [ ] `pages/projectDetail/gantt/useGanttMutations.js` — `patchTask`, `plannedHours`, `computeProgressLocal` 에 `export` 추가. 함수 본문 변경 금지.

**F2. 실행 훅 `useBulkApply.js` (신규)**
- [ ] `run(targets, values)` — `mapWithConcurrency(targets, 3, worker)`
- [ ] worker: 일정(`invoke('updateGanttSchedule')`) → MD(`executeRequest('updateIssue')`), fail-fast, `applied` 누적
- [ ] **미입력 날짜는 각 이슈의 현재 값으로 채워 보낸다** (§2-3 — 빠뜨리면 기존 일정이 지워진다)
- [ ] `doneCount` 건별 증가, `successKeys`/`failures` 수집
- [ ] 종료 시 `patchGroupPage`(목록) + `ganttKeys.data` 조건부 패치(§4-5)
- [ ] `retryFailed()`, `reset()`

**F3. 모달 `BulkApplyModal.jsx` (신규)**
- [ ] `BaseModal` + `Field`×3 (DatePicker 2 + Textfield number 1, **`onWheel` blur 필수**)
- [ ] 3필드 전부 비면 제출 disable / 양쪽 날짜 입력 시 `start > due` 차단
- [ ] MD 빈값과 `0` 구분 (`parseFloat('') || 0` 금지)
- [ ] 진행 바(plain div) / 결과 집계 / 실패 목록(SectionMessage) / 재시도 버튼
- [ ] 실행 중 닫기·제출 disable

**F4. 테이블 통합 `ProjectIssueTable.jsx` (수정)**
- [ ] `selectedKeys` state + toggle / toggleAll(전체선택은 `__deleted` 행 제외)
- [ ] `head.cells[0]` / `rows[].cells[0]` 체크박스 — **`canEdit && canBulkApply` 조건을 head/rows 양쪽에 동일 적용**(셀 수 불일치 시 표가 깨진다)
- [ ] 기존 `resetSig` 블록(`:79-83`)에 선택 초기화 추가 + 페이지 이동(`handlePrev`/`handleNext`) 시 초기화
- [ ] 선택 액션 바 + 모달 마운트
- [ ] 제출 전 Jira 권한 사전 판정(기존 `jiraPermissions` 재사용, 확정 거부만 차단)

**F5. prop 배선 (수정)**
- [ ] `ProjectIssuePanel.jsx` — `const canBulkApply = usePermissionStore(s => s.canWrite("PROJECT"))` 산출 후 `ProjectGroupCard` 로 전달
- [ ] `ProjectGroupCard.jsx` — `canBulkApply` 를 `ProjectIssueTable` 로 passthrough

**F6. i18n**
- [ ] `locales/kr/projectDetail.json`·`locales/en/projectDetail.json` 에 `issue.bulk.*` 추가
- [ ] `cd static/ui && npm run merge`
- [ ] `CI=true npm run build` 로 CI 동일 조건 확인

---

## 8. 검증 포인트 (integration-verifier 용)

1. **미입력 날짜 보존** — 기한만 입력해 적용한 뒤, 원래 시작일이 있던 이슈의 시작일이 **살아 있는가**. (가장 큰 데이터 파손 위험)
2. **경계면** — `invoke('updateGanttSchedule', {projectId, issueKey, start, due})` 호출 인자와 `result.content = {issueKey, start, due}` 소비가 §2-1 표와 일치하는가. `result.success !== true` 를 명시적으로 검사하는가(`invoke` 는 실패해도 throw 하지 않는다).
3. **`executeRequest` 실패 판정** — `result?.success === false` 를 검사하는가. throw 를 기대하는 코드가 없는가.
4. **캐시 규약** — 성공 경로에 `invalidateQueries` 가 **하나도 없는가**(목록·요약·간트 전부).
5. **셀 수 정합** — 체크박스 컬럼 렌더 조건이 `head` 와 `rows` 에서 동일한가. `__deleted` 빈 행이 전체선택에 섞이지 않는가.
6. **동시성** — `p-limit` 을 import 하지 않았는가(프론트 번들/ jest 파손). `mapWithConcurrency` 재사용인가.
7. **추가 왕복** — 이슈당 GET 이 붙지 않았는가(`searchByIssueId` 호출 금지, `getIssue(fields:timetracking)` 호출 금지). 50건 적용 시 왕복은 **최대 100회**(일정 50 + MD 50)여야 한다.
8. **MD `0` 입력** — 미입력과 구분돼 실제로 `0h` 가 써지는가.
9. **i18n** — 신규 `issue.bulk.*` 키가 kr/en 양쪽에 있고 merge 결과에 반영됐는가. 하드코딩 한글이 없는가.
