# 이슈 연결 Gantt — 백엔드 구현 리포트 (M1+M2)

> 작성: backend-engineer / 2026-06-29 / 슬러그 `issue-link-gantt`
> 범위: **1차 릴리스 = M1(읽기) + M2(일정 write-back)**. M3(setGanttParent/setGanttLink, 사이클 검증)은 **이번 범위 제외 — 미구현**.

---

## 1. 구현한 resolver 2개 — 실제 응답 shape (글자 그대로, 프론트가 읽음)

응답은 모두 `responseWrapper`로 감싸 `{ success:true, ...result }` 또는 `{ success:false, error:{name,code,message,cause} }` 로 직렬화된다. Service가 `{ content: {...} }`를 반환하므로 최종 success 응답은 아래와 같다.

### `getProjectGanttData`
- 입력 payload: `{ projectId, coworkerFieldId }` (coworkerFieldId 선택 — 없으면 백엔드가 `getCoworkerFieldIdApi()`로 조달, 그래도 null 가능. Gantt는 assignee만 사용)
- success 응답 (글자 그대로):
```jsonc
{
  "success": true,
  "content": {
    "tasks": [ /* Task[] (아래 shape) */ ],
    "links": [ /* Link[] (아래 shape) */ ],
    "meta": { "total": 0, "fetchedAt": "2026-06-29T00:00:00.000Z" }
  }
}
```

**Task 객체 shape (실제 구현값):**
```jsonc
{
  "id": "PROJ-12",            // = key (SVAR id)
  "key": "PROJ-12",
  "summary": "설계 문서 작성",
  "start": "2026-07-01",      // customfield_10015, 없으면 null
  "end": "2026-07-05",        // duedate, 없으면 null
  "type": "task",             // "summary"(자식 보유) | "milestone"(start==end 둘다 존재) | "task"
  "issueType": "Story",       // issuetype.name, 없으면 null
  "jiraParent": "PROJ-3",     // parent.key, 없으면 null
  "wbsParent": "PROJ-8",      // wbsParentField 값, 없으면 null
  "effectiveParent": "PROJ-8",// wbsParent ?? jiraParent ?? null (집합 멤버십 검증, §6)
  "progress": 0.4,            // timetracking 근사(done→1, original 기반) 또는 null
  "assignee": { "accountId": "a1", "displayName": "Tom" }, // 없으면 null
  "statusKey": "indeterminate"// statusCategory.key, 없으면 null
}
```
> 주의: 설계 §2 Task에는 `"statusKey"`만 있고 본 구현도 동일. 내부 계산용 `_predecessors`는 응답에서 **제거**(테스트로 비노출 보장).

**Link 객체 shape (실제 구현값):**
```jsonc
{
  "id": "PROJ-9->PROJ-12",   // 합성키 source->target
  "source": "PROJ-9",         // 선행(predecessor) key
  "target": "PROJ-12",        // 후행 key
  "type": "FS",               // 저장값 (없으면 "FS")
  "lag": 0                     // 정수 (없으면 0)
}
```
- dangling source(페치 집합에 없는 이슈), 자기참조(source==target), 중복은 **링크에서 제외**.

### `updateGanttSchedule`
- 입력 payload: `{ projectId, issueKey, start, due }` (start/due = `"YYYY-MM-DD"` 또는 null)
- success 응답 (글자 그대로):
```jsonc
{
  "success": true,
  "content": { "issueKey": "PROJ-12", "start": "2026-07-01", "due": "2026-07-05" }
}
```
- 검증: `start > due`(둘 다 존재 시)면 throw → `{ success:false, error:{ code:"GANTT_INVALID_DATE_RANGE", ... } }`
- `issueKey` 누락 시 throw → `error.code = "GANTT_ISSUE_NOT_FOUND"`
- write 필드맵: `{ customfield_10015: start||null, duedate: due||null }` 를 `PUT /rest/api/3/issue/{key}` (asUser).

> **M3 미구현**: `setGanttParent`, `setGanttLink`는 컨트롤러에 등록하지 않음.

---

## 2. 변경/신규 파일별 요지

### 신규
- `src/resolver/gantt/GanttMapper.js` — 순수함수. `parsePredecessors`(object `{links:[]}` 파싱, JSON문자열/배열 폴백 허용), `computeProgress`(timetracking 근사), `normalizeIssue`(raw→Task 기본), `buildTasksAndLinks`(effectiveParent §6 병합 + type 판정 + links 합성/중복·dangling·자기참조 제외).
- `src/resolver/gantt/GanttService.js` — `getProjectGanttData`(getAppFieldIds→전용 페처→buildTasksAndLinks→{tasks,links,meta}), `updateGanttSchedule`(날짜검증→updateIssueFields PUT).
- `src/resolver/gantt/GanttController.js` — `registerGanttController(resolver)`. **read + updateGanttSchedule 2개만** responseWrapper 등록.
- `src/resolver/gantt/__test__/GanttMapper.test.js` — 27 케이스(파싱/진행률/정규화/병합/type/링크/내부필드 비노출).

### 수정
- `src/api/jira/field/FieldApi.js` — `getAppFieldIds({as='user'})` 추가. `/rest/api/3/field`에서 name(`moves_RMS_wbsParent`/`moves_RMS_predecessors`)→`customfield_xxxxx` 해석, **모듈 메모리 1회 캐시**(설치 단위 불변, §7). 해석 실패 시 `LogicalError(GANTT_FIELD_NOT_RESOLVED)`. 기존 `getCoworkerFieldIdApi`의 name 매칭 패턴을 그대로 따름.
- `src/api/jira/issue/IssueApi.js` — `getProjectGanttIssues(projectId, coworkerFieldId, wbsParentFieldId, predecessorsFieldId, as='user')` 전용 병렬 페처(공통 경로 미수정, JQL `moves_RMS_projectId="..."`, fields에 summary·duedate·customfield_10015·issuetype·status·statusCategory·assignee·parent·timetracking + 필드ID들, maxResults=100 + nextPageToken 1패스). `updateIssueFields(issueKey, fields, as='user')` — 기존 `putJiraJson` 재사용한 `PUT /rest/api/3/issue/{key}` 헬퍼.
- `src/utils/errors/ErrorCodes.js` — `GANTT_INVALID_DATE_RANGE`, `GANTT_FIELD_NOT_RESOLVED`, `GANTT_ISSUE_NOT_FOUND` 3종 추가. M3용(CYCLE/SELF_REF/CROSS_PROJECT)은 미추가(주석으로 보류 명시).
- `src/index.js` — `registerGanttController` import + 호출 추가.

### 미변경(전제대로)
- `manifest.yml` — 커스텀필드 2종(`wbsParentField` string, `predecessorsField` object)이 **이미 추가되어 있음**을 확인(line 32~48). 중복 추가 안 함.

---

## 3. `npm test` 결과 (루트, jest)

```
Test Suites: 7 passed, 7 total
Tests:       112 passed, 112 total
Time:        ~5.1s
PASS src/resolver/gantt/__test__/GanttMapper.test.js  ← 신규 27케이스 전부 통과
```

---

## 4. object 필드 roundtrip — **미검증(deploy 필요)**

`predecessorsField`(`type: object`)에 대한 라이브 set→get 왕복은 **deploy + Forge 런타임(Node 버전) 의존**이라 이번 코드 단계에서 검증하지 않았다. 코드만 구현.

**다음 검증 스텝(별도 단계):**
1. `forge deploy` 후 임의 이슈에 `updateIssueFields(key, { [predecessorsFieldId]: { links:[{key:'X',type:'FS',lag:0}] } })`로 set.
2. `getProjectGanttIssues`(search) 응답에 동일 object가 inline으로 되돌아오는지(get) 확인.
3. 통과 시 §5 object 타입 확정. 실패(Forge object set 거부/직렬화 깨짐) 시 설계 폴백대로 `type: string` + JSON 직렬화 + 선행 상한으로 전환 → `parsePredecessors`는 이미 JSON 문자열 폴백을 허용하므로 mapper 변경 최소.
   - (참고) read 시 `updateGanttSchedule`은 object 필드를 건드리지 않으므로 M2 일정 write-back은 object roundtrip과 독립적으로 동작 가능.

---

## 5. 설계 대비 벗어난 점 / 판단 기록

1. **`getProjectGanttIssues` 시그니처 확장**: 설계 §3 표기는 `getProjectGanttIssues(projectId, coworkerFieldId)`이나, fields 목록에 `wbsParentFieldId`/`predecessorsFieldId`를 inline 포함해야 해서 두 인자를 **positional로 추가**(`(projectId, coworkerFieldId, wbsParentFieldId, predecessorsFieldId, as)`). 필드ID는 Service가 `getAppFieldIds()`로 해석해 주입. IssueApi↔FieldApi 결합을 피하기 위한 선택. 계약(응답 shape)에는 영향 없음.
2. **필드 해석 호출 권한 `as='user'`**: 기존 `getCoworkerFieldIdApi`는 배치 컨텍스트라 `as='app'`이지만, Gantt 경로는 사용자 resolver 내부 호출이므로 메모리(asApp 지양)에 맞춰 `as='user'`로 통일. 모든 페치·write도 `as='user'`.
3. **`GANTT_ISSUE_NOT_FOUND` 용도**: 설계는 "대상 이슈 없음/권한 없음"이나, 본 구현에서는 **필수 파라미터(projectId/issueKey) 누락**의 가드 코드로도 사용. PUT 404는 별도 매핑 없이 `ForgeAPIError`로 전파(프론트는 `error.code`로 분기 가능). 라이브 404→GANTT_ISSUE_NOT_FOUND 매핑은 필요 시 M2 후속에서 보강.
4. **`coworkerFieldId`**: Gantt Task는 assignee만 사용(coworker 미사용). 따라서 페처에 전달은 하되 mapper에서 소비하지 않음 — 향후 협업자 표시 확장 대비 통로만 유지.
5. **progress 근사**: M4 진행률 오버레이 전이라 `computeProgress`(done→1 / originalEstimate 기반 / 없으면 null)로 timetracking 근사. 설계 §2(`timetracking 근사 or null`) 준수.

---

## 6. 프론트(frontend-engineer) 인계 메모

- invoke 함수명: `getProjectGanttData`, `updateGanttSchedule`.
- 결과 접근: `result.content.tasks` / `result.content.links` / `result.content.meta`, `result.content.{issueKey,start,due}`.
- 에러: `result.success===false`면 `result.error.code` 분기(`GANTT_INVALID_DATE_RANGE` → `gantt.error.dateRange` 토스트).
- SVAR 어댑터: `effectiveParent`→parent, `links[].type`(FS) → SVAR 코드(e2s) 변환은 프론트 `ganttAdapter`에서 수행(설계 §4).
- M3(부모/링크 편집) resolver는 아직 없음 — `useSetParent`/`useSetLink`는 2차 릴리스까지 호출 대상 없음.

---

## M3 백엔드 구현 (2026-06-30)

> 작성: backend-engineer / 슬러그 `issue-link-gantt`
> 범위: **M3(관계 편집) = WBS 부모 재지정 + 선후행 링크 add/remove + 사이클 검증**. M1/M2/R1~R3/오버레이는 무변경.

### 1. 구현한 resolver 2개 — 실제 응답 shape (글자 그대로, 프론트가 읽음)

둘 다 `responseWrapper`로 감싸 성공 `{ success:true, content:{...} }` / 실패 `{ success:false, error:{ name, code, message, cause } }`로 직렬화.

#### `setGanttParent`
- invoke payload: `{ projectId, issueKey, parentKey }` (`parentKey=null` → WBS override **해제**)
- success 응답 (글자 그대로):
```jsonc
{
  "success": true,
  "content": {
    "issueKey": "PROJ-12",
    "parentKey": "PROJ-8",       // 입력 정규화값 (해제 시 null)
    "effectiveParent": "PROJ-8"  // write 직후 §6 병합 재적용 결과
  }
}
```
- **effectiveParent 산출(§6/§D-4)**: `parentKey != null` → `effectiveParent === parentKey`(검증으로 keySet 멤버 보장). `parentKey === null`(해제) → 대상 이슈의 `jiraParent`로 폴백(jiraParent가 페치집합 멤버일 때), 아니면 `null`. **루트 강제 아님** — 해제해도 jiraParent 있으면 그 밑으로 폴백.
- 검증 순서: `projectId/issueKey` 가드 → 그래프 1패스 페치 → 대상 issueKey 페치집합 멤버십(아니면 `GANTT_ISSUE_NOT_FOUND`) → `detectTreeCycle`(self/cross/cycle) → 통과 시 `{ [wbsParentFieldId]: parentKey||null }` PUT(`updateIssueFields`, as='user').
- 에러코드: self=`GANTT_SELF_REFERENCE`, 교차프로젝트=`GANTT_CROSS_PROJECT_REF`, 트리사이클=`GANTT_CYCLE_DETECTED`, 파라미터/소속=`GANTT_ISSUE_NOT_FOUND`.

#### `setGanttLink`
- invoke payload: `{ projectId, op:'add'|'remove', source, target, type:'FS', lag:0 }`
- success 응답 (글자 그대로):
```jsonc
{
  "success": true,
  "content": {
    "target": "PROJ-12",
    "predecessors": [
      { "id": "PROJ-9->PROJ-12", "source": "PROJ-9", "target": "PROJ-12", "type": "FS", "lag": 0 }
      // ... target 의 갱신된 전체 선행 목록
    ]
  }
}
```
- **predecessors Link shape은 read(`getProjectGanttData.content.links`)와 1:1 동일**(`id:'source->target', source, target, type, lag`). target 기준 현재 선행 목록(read와 동일하게 dangling/self/중복 제거된 `buildTasksAndLinks` links에서 추출)에 op 적용:
  - `op='add'`: `{key:source,type,lag}` upsert(동일 source면 type/lag 갱신, 없으면 추가).
  - `op='remove'`: `key===source` 제거.
- 검증: `op='add'`는 `detectDagCycle`(self/cross/DAG사이클). `op='remove'`는 사이클 검증 생략, self/멤버십 가드만 유지. → 통과 시 `{ [predecessorsFieldId]: serializePredecessors(next) }` PUT(target에, as='user').
- 사이클 검증 그래프는 `getProjectGanttIssues`(전용 페처) 1패스 → `buildTasksAndLinks` 재사용으로 조달(공통 경로 미오염, §C). 신규 IssueApi/FieldApi 메서드 없음.

### 2. object write 게이트 방어 — `serializePredecessors` + 토글

- 위치: **`src/resolver/gantt/GanttService.js`** 상단.
  - 상수 `const PREDECESSORS_AS_STRING = false;`(기본 object).
  - `export const serializePredecessors = (linksArr) => PREDECESSORS_AS_STRING ? JSON.stringify({links:linksArr||[]}) : { links: linksArr||[] };`
- write는 항상 이 함수 단일 경유. read의 `parsePredecessors`(object/{links}/JSON문자열/배열 전부 수용)와 대칭.
- **deploy PoC(§B-2)가 게이트로 남음**: `forge deploy` 후 임의 이슈에 object set→`getProjectGanttIssues` get으로 inline roundtrip 확인. 실패 시 **`PREDECESSORS_AS_STRING=true` 한 줄 + manifest `predecessorsField type: string`만** 바꿔 절체(mapper/검증/프론트/shape 무변경). 본 코드 단계에서는 미검증.

### 3. 검증 순수함수 시그니처 (`src/resolver/gantt/GanttValidationService.js`, 신규·jest 대상)

```
detectTreeCycle({ parentByKey: Map<key,effectiveParent|null>, keySet: Set<key>, issueKey, parentKey })
   // parentKey=null → 통과(해제는 항상 안전)
   // issueKey===parentKey → throw GANTT_SELF_REFERENCE
   // parentKey ∉ keySet → throw GANTT_CROSS_PROJECT_REF
   // parentKey 의 effectiveParent 체인 위로 추적, issueKey 재등장 → throw GANTT_CYCLE_DETECTED
   // 통과 시 반환값 없음(undefined)

detectDagCycle({ links: Link[], keySet: Set<key>, source, target })
   // source===target → throw GANTT_SELF_REFERENCE
   // source∉keySet || target∉keySet → throw GANTT_CROSS_PROJECT_REF
   // 간선=source(predecessor)→target(successor). 기존 그래프에서 target→…→source 도달가능하면
   //   신규 source→target 추가 시 순환 → throw GANTT_CYCLE_DETECTED (반복 DFS, visited 가드)
   // 통과 시 반환값 없음. add 에만 적용(remove 는 Service에서 호출 안 함)
```
- 위반 시 `LogicalError(코드, message)` throw. Service는 통과 시에만 PUT.

### 4. 변경/신규 파일

| 파일 | 종류 | 요지 |
|---|---|---|
| `src/utils/errors/ErrorCodes.js` | 수정 | 주석 보류 3종 활성화: `GANTT_CYCLE_DETECTED`/`GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF`. M1/M2 3종은 그대로(직전 `GANTT_ISSUE_NOT_FOUND` 라인에 콤마 추가). |
| `src/resolver/gantt/GanttValidationService.js` | 신규 | `detectTreeCycle`/`detectDagCycle` 순수함수. |
| `src/resolver/gantt/GanttService.js` | 수정 | `PREDECESSORS_AS_STRING`/`serializePredecessors`, `fetchGanttGraph`(private 1패스 그래프), `setGanttParent`/`setGanttLink` 추가. M1/M2 함수 무변경. |
| `src/resolver/gantt/GanttController.js` | 수정 | `setGanttParent`/`setGanttLink` 2개 `resolver.define` 추가(기존 2 → 4개). |
| `src/resolver/gantt/__test__/GanttValidationService.test.js` | 신규 | tree 6케이스 + dag 7케이스(self/cross/직접·간접 사이클/정상/해제/빈그래프). |
| `src/index.js` | 무변경 | `registerGanttController` 이미 등록됨 → 추가 배선 불요(컨트롤러 내부 함수만 추가). |
| `manifest.yml` | 무변경 | `predecessorsField type:object` 유지(PoC 게이트). |

### 5. `npm test` 결과 (루트, jest — 글자 그대로)

```
Test Suites: 8 passed, 8 total
Tests:       125 passed, 125 total
Snapshots:   0 total
Time:        3.703 s, estimated 4 s
PASS src/resolver/gantt/__test__/GanttValidationService.test.js   ← 신규 13케이스 전부 통과
PASS src/resolver/gantt/__test__/GanttMapper.test.js              ← 기존 27케이스 회귀 가드(무변경)
```
(직전 112 → 125, 신규 13케이스 추가.)

### 6. 프론트(frontend-engineer) 인계 메모

- invoke 함수명: `setGanttParent`, `setGanttLink`.
- 결과 접근: `result.content.{issueKey,parentKey,effectiveParent}` / `result.content.{target,predecessors}`. `predecessors[]`는 read links와 동일 Link shape.
- 에러: `result.success===false`면 `result.error.code` 분기 — `GANTT_CYCLE_DETECTED`→`gantt.error.cycle`, `GANTT_SELF_REFERENCE`→`gantt.error.selfRef`, `GANTT_CROSS_PROJECT_REF`→`gantt.error.crossProject`, 그 외→`gantt.error.saveFailed`(C-3). M2와 동일하게 `err.cause=result.error` throw → onError 분기.
- `setGanttLink` 입력 `type`/`lag`는 MVP `'FS'`/`0` 고정(프론트가 채워 전송). `op` 누락/오타·source/target 누락은 `GANTT_ISSUE_NOT_FOUND` 가드.
- 부모 해제(`parentKey=null`) 시 effectiveParent가 jiraParent로 폴백될 수 있음(§D-4 — 버그 아님).

### 7. 설계 대비 판단 기록

1. **그래프 조달 위치**: 설계 §C대로 `getAppFieldIds→getProjectGanttIssues→buildTasksAndLinks` 1패스를 Service 내부 private `fetchGanttGraph(projectId)`로 묶음. `coworkerFieldId`는 검증에 불필요해 `null` 전달.
2. **`setGanttLink` 반환 predecessors 일관성**: 별도 raw 파싱 대신 `buildTasksAndLinks`의 **이미 필터/중복제거된 links**에서 target 선행을 추출해 op 적용 → read와 1:1 보장(dangling 선행은 write 시 자연 정리됨). 의도된 read-대칭.
3. **`detectDagCycle` 알고리즘**: 설계 "3-color DFS" 대신 동등한 **반복 DFS + visited Set**(도달가능성 = target→source) 구현. 결과 동일, 스택 안전.
4. **파라미터 가드 코드**: M1/M2 관례대로 누락/잘못된 op·소속 외 이슈는 `GANTT_ISSUE_NOT_FOUND` 재사용(신규 코드 미신설).
