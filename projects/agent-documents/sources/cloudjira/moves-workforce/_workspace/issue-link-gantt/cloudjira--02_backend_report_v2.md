# 02 Backend Report v2 — 이슈 연결 Gantt: 선후행 링크 Jira 네이티브 전환

> 작성: backend-engineer / 2026-07-01 / 슬러그 `issue-link-gantt`
> 기준 설계: `01_architect_design_v2_native.md`, 결정: `00_input/decision_v2.md`
> 범위: **선후행(의존) 링크만** 네이티브 이슈 링크("Blocks")로 전환. 계층(부모-자식)은 현행 유지(변경 금지).

---

## 1. 핵심 결론

- 선후행 링크의 저장 매체를 **readOnly 앱 커스텀필드(`predecessorsField`) → Jira 네이티브 이슈 링크("Blocks")** 로 전환.
- **경계면 계약(함수명·입력 payload·응답 shape)은 100% 동일 유지** → **프론트 계약 무변경**.
- 계층(`setGanttParent` / `wbsParentField` write / `detectTreeCycle`)은 **손대지 않음**.
- `npm test`: **8 suites / 127 tests 전부 PASS**.

---

## 2. 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/api/jira/util/RequestJiaJson.js` | `postJiraJson`, `deleteJira` 헬퍼 신규 추가(이슈 링크 create/delete용). 기존 `requestJiraJson`/`putJiraJson` 무변경. |
| `src/api/jira/issue/IssueApi.js` | `createIssueLink`/`deleteIssueLink`/`getIssueLinkTypes` 신규. `getProjectGanttIssues`: fields에 `issuelinks` 추가, `predecessorsFieldId` 파라미터 제거(시그니처 축소). |
| `src/resolver/gantt/GanttMapper.js` | `parsePredecessors` 폐기 → `buildLinksFromIssueLinks`/`indexIssueLinkIds` 신규(+`BLOCKS_TYPE_NAME` export). `normalizeIssue` `_predecessors` → `_links`. `buildTasksAndLinks` links를 issuelinks 기반 조립(type='FS'/lag=0 고정). |
| `src/resolver/gantt/GanttService.js` | `serializePredecessors`/`PREDECESSORS_AS_STRING` 제거. `getProjectGanttData`/`fetchGanttGraph` issuelinks 기반으로 갱신(+`linkIdIndex`). `setGanttLink` 네이티브 create/delete로 재구현. `setGanttParent` **무변경**. |
| `src/resolver/gantt/__test__/GanttMapper.test.js` | predecessorsField 테스트 → issuelinks(Blocks) 기반 테스트로 갱신. |

**미변경(의도적):**
- `src/resolver/gantt/GanttController.js` — 등록 변경 없음(함수명 동일, `setGanttLink`/`setGanttParent` 이미 등록됨). `getGanttLinkTypes` resolver는 MVP 미등록(하드코딩 "Blocks").
- `src/api/jira/field/FieldApi.js` — `getAppFieldIds`는 여전히 `predecessorsFieldId`를 해석/반환하나 gantt read/write에서 미사용. manifest 필드가 존치되어 해석은 성공(에러 없음).
- `src/utils/errors/ErrorCodes.js` — 이번 범위(링크만)에선 신규 코드 불요(`GANTT_HIERARCHY_VIOLATION`은 계층 네이티브 전환용이며 계층 미변경이라 추가하지 않음).
- `manifest.yml` — `predecessorsField` 정의 **제거하지 않음**(배포 파괴 위험). 미사용 상태로 존치. **후속 검토 대상.**

---

## 3. 이슈 링크 방향 의미 (add/remove)

**"Blocks" 타입 규약**: 선행(source)이 후행(target)을 **blocks**.
- `outward = "blocks"`        → `outwardIssue` = **선행(source)**
- `inward  = "is blocked by"` → `inwardIssue`  = **후행(target)**

### create (op:'add')
```
POST /rest/api/3/issueLink   (asUser)
body: {
  type: { name: "Blocks" },
  outwardIssue: { key: <source 선행> },
  inwardIssue:  { key: <target 후행> }
}
```
`IssueApi.createIssueLink({ inwardKey, outwardKey, typeName='Blocks' })` — Service는 `outwardKey=source, inwardKey=target`로 호출.
성공 시 201 no content → 헬퍼가 `null` 반환.

### delete (op:'remove')
```
DELETE /rest/api/3/issueLink/{linkId}   (asUser)
```
프론트는 **linkId를 모름/노출 안 함**. 백엔드가 `source/target`으로 역조회:
`indexIssueLinkIds(issues)`가 만든 `Map("<source>-><target>" → linkId)`에서 `linkId` 조회 후 삭제.
매칭 없으면 **멱등 no-op 성공**(에러 아님).

---

## 4. read: issuelinks → Link 조립 규칙

`getProjectGanttIssues`가 `fields=...,issuelinks`로 1패스 페치(inline 포함, **N+1 없음**).
각 이슈의 `fields.issuelinks`에서 `type.name === "Blocks"`인 항목만:
- `lk.outwardIssue` 존재 → `{ source: 이슈.key, target: lk.outwardIssue.key }`
- `lk.inwardIssue`  존재 → `{ source: lk.inwardIssue.key, target: 이슈.key }`

동일 링크가 양쪽 이슈에 모두 나타나므로 `buildTasksAndLinks`에서 `id="src->tgt"` 기준 **dedup**.
방어: **self(source==target) 제외**, **dangling(source 또는 target이 페치집합 밖) 제외**.
`type`/`lag`은 네이티브가 저장 못 하므로 **표시용 고정값 `type:'FS'`, `lag:0`**.

---

## 5. 실제 응답 shape (글자 그대로 — 프론트 소비 기준)

### getProjectGanttData → `{ success:true, content:{...} }`
```jsonc
{
  "tasks": [ /* Task[] — 변경점: 없음. jiraParent/wbsParent/effectiveParent 그대로 유지 */ ],
  "links": [
    { "id": "PROJ-9->PROJ-12", "source": "PROJ-9", "target": "PROJ-12", "type": "FS", "lag": 0 }
  ],
  "meta": { "total": 0, "fetchedAt": "2026-07-01T...Z", "projectStart": null, "projectEnd": null }
}
```
- `links`의 조립 출처만 predecessorsField → issuelinks(Blocks)로 교체. **shape 동일**.
- `source`=선행(blocks), `target`=후행(is blocked by).

### setGanttLink → `{ success:true, content:{...} }` (★ 프론트 무변경 목표)
입력: `{ projectId, op:'add'|'remove', source, target }` (기존 `type`/`lag` 입력은 무시해도 무해 — 시그니처에서 제거했으나 여분 키는 문제없음)
```jsonc
{
  "target": "PROJ-12",
  "predecessors": [
    { "id": "PROJ-9->PROJ-12", "source": "PROJ-9", "target": "PROJ-12", "type": "FS", "lag": 0 }
  ]
}
```
- `predecessors`는 write 후 target의 **전체 선행 목록**(로컬 계산; 프론트는 invalidate로 재동기화).
- `type:'FS'`/`lag:0` 고정. **v1과 100% 동일 Link shape.**

### setGanttParent → **무변경**
```jsonc
{ "issueKey": "...", "parentKey": "..."|null, "effectiveParent": "..."|null }
```

### updateGanttSchedule → **무변경**
```jsonc
{ "issueKey": "...", "start": "YYYY-MM-DD"|null, "due": "YYYY-MM-DD"|null }
```

---

## 6. 검증/에러

- `op:'add'`: `detectDagCycle`(그래프는 issuelinks 기반 links) 통과 후 create. 이미 존재하면 멱등 no-op.
- `op:'remove'`: self/멤버십 가드(GANTT_SELF_REFERENCE / GANTT_CROSS_PROJECT_REF) 후 linkId 역조회 삭제.
- `detectDagCycle`/`detectTreeCycle`(GanttValidationService)은 순수함수 — **무변경**, 테스트도 무변경.
- write 전 경로 **asUser** ([[feedback_no_asapp]] 정합). 단 무권한 사용자는 Jira "Link Issues" 권한 부재 시 403 → 프론트 saveFailed 토스트(기존 매핑).
- `updateAppCustomFieldValue`(asApp)는 이제 **계층(`setGanttParent` wbsParentField)에서만** 잔존. 링크 경로에선 완전 제거.

---

## 7. 성능 / 무회귀

- 공통 페처(`getProjectIssuesByFilter`) **미오염** — `getProjectGanttIssues` 전용 페처만 수정([[feedback_worklog_fetch_isolation]]).
- `issuelinks`는 search 응답 inline → **1패스, N+1 없음**.
- link add/remove 검증 그래프는 편집 1건당 경량 1패스(`fetchGanttGraph`) 유지.
- M2 일정 write / 계층 write / 마커 오버레이 무회귀.

---

## 8. 프론트 영향 여부

**프론트 계약 무변경.** 함수명(`setGanttLink`/`getProjectGanttData`)·입력 payload·응답 Link shape 모두 v1 동일.
- `useGanttMutations`(useSetLink)·add-link/delete-link intercept·`ganttAdapter` **수정 불요**.
- delete는 계속 source/target만 전달(linkId는 백엔드가 해결) → 프론트 배선 그대로.
- 유일한 실사용 차이: 이제 링크가 실제로 저장/조회되어 **화면에 선(화살표)이 그려진다**(기존 write 실패 → 선 미표시 문제 해소).
- (별도) R4 미일정 편집 진입점은 프론트 전용 작업 — 본 백엔드 범위 밖(`updateGanttSchedule` 그대로 재사용).

---

## 9. npm test 결과

```
Test Suites: 8 passed, 8 total
Tests:       127 passed, 127 total
Snapshots:   0 total
Time:        ~7.3 s
```
- `GanttMapper.test.js`: parsePredecessors 테스트 → buildLinksFromIssueLinks/indexIssueLinkIds/issuelinks 합성 테스트로 갱신(전부 PASS).
- `GanttValidationService.test.js`: 무변경, PASS.

---

## 10. 후속 검토(리더 판단용)

- **manifest `predecessorsField` 정의 제거**: 현재 미사용 존치. Forge 필드 제거는 파괴적일 수 있어 별도 배포 절차로 검토 필요.
- **기존 predecessorsField 잔존 데이터 이관**: 배포 환경 write 실패로 실데이터 없음 가정 → 무시(권고). 데이터 확인 시 일회성 마이그레이션 resolver로 `createIssueLink` 이관.
- **링크 타입 선택 UI**: `getIssueLinkTypes` 헬퍼는 추가했으나 resolver 미등록(MVP 하드코딩 "Blocks"). 필요 시 `getGanttLinkTypes` 등록.
- **라이브 게이트**: asUser 링크 create/delete는 사용자 프로젝트 권한(Link Issues) 필요 → `forge deploy` 후 실사용 확인 권장.
