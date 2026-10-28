# 이슈 연결 Gantt v2 — 관계 모델 Jira 네이티브 전환 설계서

> 작성: feature-architect / 2026-07-01 / 슬러그 `issue-link-gantt`
> 대상 요구: `00_input/requirement_v2_native.md` (R1~R4 + 검토 산출물)
> 기준 현황: M1(읽기)+M2(일정 write-back)+M3(관계 편집, **앱 커스텀필드 방식**) 구현·커밋 완료.
>   배포 후 M3가 readOnly 앱필드 write 제약(400 "Field does not support update")으로 실패 → asApp 앱전용 엔드포인트로 우회했으나 사용자 "여전히 연결 안됨" 보고(`03_verify_report.md:380-405`).
> 본 문서는 **관계 데이터를 Jira 네이티브 구조로 옮기는 전환 설계**다. 기존 `01_architect_design.md`(§370 M3 명세)를 **대체하지 않고 병기**한다(단일 진실은 본 문서로 승격, 단 §아래 "결정 필요" 확정 전까지 리뷰 상태).

---

## 0. 결론 먼저 (실현 가능성 요약)

| 요구 | 네이티브 전환 | 판정 | 근거 |
|------|--------------|------|------|
| **R1 선후행 의존** | Jira **네이티브 이슈 링크**("Blocks") | ✅ **완전 실현** | `POST/DELETE /rest/api/3/issueLink`, 읽기 `fields=issuelinks`. **asUser 가능**(`write:jira-work` 기보유). Jira 이슈 화면 자동 연동. 앱필드/asApp 완전 제거. |
| **R2/R3 계층 3단계+** | Jira **네이티브 parent** | ⚠️ **부분 실현 (핵심 리스크)** | 표준(company-managed) 네이티브 계층은 **Epic(L1)>Story(L0)>Subtask(L-1) 고정 3레벨**이고 **"인접 레벨끼리만" 부모-자식 허용**. 즉 Story→Story→Story 같은 **임의 깊이 중첩 불가**. 3레벨 초과는 **Premium/Enterprise + Plans**(전역 관리자, Epic 위 레벨만 추가) 필요. |
| **R3 아코디언** | SVAR open 다단 | ✅ 실현 | 네이티브 3레벨 트리는 SVAR open으로 펼침/접힘 그대로. 현재 어댑터(summary만 open) 정합. |
| **R4 미일정 편집** | 편집 진입 경로 신설(프론트) | ✅ 실현 | M2 `updateGanttSchedule` **그대로 재사용**. 미일정 이슈에 "일정 설정" 진입점만 추가. |

**요지:** R1·R4는 깨끗하게 네이티브로 이관 가능하며 asApp/앱필드 제약을 제거한다. **R2/R3의 "3단계 이상 임의 계층"이 표준 Jira 네이티브 parent로는 구조적으로 불가능**(3레벨 고정·인접 전용)하다. → **하이브리드**(네이티브 parent 우선 + `wbsParentField` 유지로 깊이 초과분 커버)를 기본 권고하되, 사용자 결정 필요(§9 D-2).

---

## 1. 개요 / 영향 범위

관계 데이터를 **앱 사설 커스텀필드(readOnly, asApp write)** → **Jira 네이티브 구조**로 전환한다.
- **R1**: `predecessorsField`(object) → 네이티브 이슈 링크(issueLink, "Blocks").
- **R2/R3**: `wbsParentField`(string) → 네이티브 parent(우선) + wbsParent(깊이 초과 폴백, 하이브리드).

| 축 | 신규/수정 | 내용 |
|----|----------|------|
| **백엔드** | 수정 `src/api/jira/issue/IssueApi.js` | `createIssueLink`/`deleteIssueLink`/`getIssueLinks`(또는 read 확장)/`getIssueLinkTypes` 신규. `getProjectGanttIssues` fields에 `issuelinks` 추가, `predecessorsField` 제거. `updateIssueParent`(PUT parent, asUser) 신규. `updateAppCustomFieldValue`는 하이브리드 폴백 경로에서만 잔존. |
| **백엔드** | 수정 `src/resolver/gantt/GanttMapper.js` | links를 `issuelinks`에서 조립(`parsePredecessors` → `buildLinksFromIssueLinks`). effectiveParent 병합규칙 갱신(§6). |
| **백엔드** | 수정 `src/resolver/gantt/GanttService.js` | `setGanttLink`를 issueLink add/remove로 재구현. `setGanttParent`를 네이티브 parent PUT(asUser)으로 재구현(+하이브리드 폴백). `serializePredecessors`/`PREDECESSORS_AS_STRING` 폐기 or 폴백 전용 격리. |
| **백엔드** | 수정 `src/utils/errors/ErrorCodes.js` | `GANTT_HIERARCHY_VIOLATION`(네이티브 parent 인접 위반) 1종 추가. 기존 GANTT_* 유지. |
| **프론트** | 수정 `gantt/` | 경계면 shape 거의 불변 → `ganttAdapter`/`GanttChart`/`useGanttMutations` 최소 수정. **R4 미일정 편집 진입점(신규 UI)** 추가. |
| **manifest** | 수정 | `predecessorsField` 사용 중단(정의는 하위호환 위해 잔존 권장). `wbsParentField`는 하이브리드 시 유지. **스코프 추가 불요**(§3). |
| **i18n** | 수정 | `locales/kr·en/gantt.json`에 R4·오류 키 몇 개 추가(§8). |
| **DB** | 변경 없음 | 관계는 Jira 네이티브(MySQL/KVS 불사용). |
| **권한** | 변경 없음 | `PROJECT_GANTT` 폴백 유지(§4). |

---

## 2. 경계면 계약 (단일 진실 — backend→frontend) ★ 최우선

모든 함수는 `responseWrapper`로 감싸 Service가 `{ content:{...} }` 반환 → `{ success:true, content:{...} }` 직렬화. 실패 `{ success:false, error:{ name,code,message,cause } }`. **함수명·입력 payload는 v1과 동일 유지**(프론트 훅 무변경 목표), **내부 저장 매체만 네이티브로 교체**.

| resolver(invoke명) | 입력 payload | success 응답 (글자 그대로) | 프론트 훅 / invalidation |
|---|---|---|---|
| **getProjectGanttData** | `{ projectId, coworkerFieldId }` | `{ success:true, content:{ tasks:[Task], links:[Link], meta:{ total, fetchedAt, projectStart, projectEnd } } }` | `useGanttData` / `ganttKeys.data(projectId)` |
| **updateGanttSchedule** | `{ projectId, issueKey, start, due }` | `{ success:true, content:{ issueKey, start, due } }` | `useUpdateSchedule` (M2, **무변경**) — R4도 이 훅 재사용 |
| **setGanttParent** | `{ projectId, issueKey, parentKey }` (`null`→부모 해제) | `{ success:true, content:{ issueKey, parentKey, effectiveParent } }` | `useSetParent` → invalidate |
| **setGanttLink** | `{ projectId, op:'add'\|'remove', source, target, type:'FS', lag:0 }` | `{ success:true, content:{ target, predecessors:[Link] } }` | `useSetLink` → invalidate |
| **(신규, 선택)** **getGanttLinkTypes** | `{ }` | `{ success:true, content:{ types:[{ id, name, inward, outward }] } }` | 링크타입 선택 UI(§9 D-1 결정 시). MVP 미사용(하드코딩 "Blocks"). |

### Task 객체 shape (read) — v1 대비 변경점만
```jsonc
{
  "id": "PROJ-12", "key": "PROJ-12", "summary": "...",
  "start": "2026-07-01", "end": "2026-07-05",
  "type": "summary|task|milestone",
  "issueType": "Story", "issueTypeIcon": "...",
  "project": {...}, "assignee": {...}, "coworkers": [...],
  "statusKey": "...", "statusCategory": {...},
  "jiraParent": "PROJ-3",        // 네이티브 parent.key (R2/R3 1차 소스)
  "wbsParent": "PROJ-8",         // 하이브리드 시에만 유지(깊이 초과 override). 네이티브-only 채택 시 제거.
  "effectiveParent": "PROJ-8"    // §6 병합 결과 (SVAR 트리 구성용)
  // progress: 기존 유지
}
```
> **네이티브-only 결정 시** `wbsParent` 필드 제거(Task에서 삭제) → 어댑터·프론트는 `effectiveParent`만 보므로 무영향.

### Link 객체 shape (read & setGanttLink 응답) — **v1과 동일 유지**
```jsonc
{ "id": "PROJ-9->PROJ-12", "source": "PROJ-9", "target": "PROJ-12", "type": "FS", "lag": 0 }
```
- `source`=선행(predecessor, "blocks" 쪽), `target`=후행(successor, "is blocked by" 쪽).
- ⚠️ **네이티브 이슈 링크는 FS/SS/FF/SF·lag를 저장하지 못한다.** `type:'FS'`/`lag:0`은 **표시 고정값**(어댑터가 SVAR e2s로 렌더). 스키마는 유지하되 왕복 저장 안 됨(§9 D-3).
- ⚠️ **delete용 Jira linkId는 프론트에 노출하지 않는다.** `op:'remove'`는 백엔드가 source/target으로 issuelinks를 재조회해 매칭 linkId를 찾아 DELETE(§3). → **프론트 delete-link intercept(source/target 전달) 무변경**.

---

## 3. 백엔드 설계

도메인 `src/resolver/gantt/` 계층 유지. **전 경로 asUser**([[feedback_no_asapp]] 원칙 회복 — 네이티브 링크/parent는 asUser로 write 가능).

### 3-1. IssueApi 신규/수정 (`src/api/jira/issue/IssueApi.js`)

```
// 링크 타입 목록 (MVP 미사용, §9 D-1 결정 시)
getIssueLinkTypes(as='user')
  → GET /rest/api/3/issueLinkType  → result.issueLinkTypes: [{ id, name, inward, outward }]

// 링크 생성 — "source blocks target" (선행→후행)
createIssueLink({ typeName='Blocks', sourceKey, targetKey, as='user' })
  → POST /rest/api/3/issueLink
     body: { type:{ name: typeName }, outwardIssue:{ key: sourceKey }, inwardIssue:{ key: targetKey } }
  // "Blocks": outward="blocks"(=선행 source), inward="is blocked by"(=후행 target). 201, 응답 본문 없음.

// 링크 삭제
deleteIssueLink({ linkId, as='user' })
  → DELETE /rest/api/3/issueLink/{linkId}

// 네이티브 부모 set/해제 (R2/R3)
updateIssueParent(issueKey, parentKey|null, as='user')
  → PUT /rest/api/3/issue/{issueKey}  body:{ fields:{ parent: parentKey ? { key: parentKey } : null } }
  // 표준 필드라 asUser PUT 가능(readOnly 앱필드와 달리 400 안 남). 인접 위반 시 Jira가 400 → GANTT_HIERARCHY_VIOLATION.

// getProjectGanttIssues 수정: fieldList
//   추가: 'issuelinks'
//   제거: predecessorsFieldId (더는 안 읽음)
//   유지: 'parent' (네이티브 계층 1차 소스), wbsParentFieldId(하이브리드 시)
```
- `issuelinks`는 search 응답에 **inline** 포함 → **N+1 없음**(전용 페처 1패스 유지, `getProjectIssuesByFilter` 공통 경로 미오염).
- **linkId 조달(delete)**: `op:'remove'`에서 target 이슈의 issuelinks를 재조회(이미 fetchGanttGraph가 1패스 수집)해 `type.name===typeName && (inwardIssue.key===source || outwardIssue.key===source)`인 항목의 `id`(linkId)를 찾아 `deleteIssueLink`. 매칭 없으면 no-op 성공(멱등).

### 3-2. GanttMapper 수정 (`GanttMapper.js`)

```
// parsePredecessors 폐기(또는 하이브리드 폴백 전용 격리).
// 신규: 각 이슈 fields.issuelinks → Link 후보 배열.
buildLinksFromIssueLinks(issue, { typeName='Blocks' })
  for lk of (issue.fields.issuelinks||[]):
    if lk.type?.name !== typeName: continue
    if lk.outwardIssue:  // 이 이슈가 outward("blocks") = 선행 → source=이슈, target=outwardIssue
        push { source: issue.key, target: lk.outwardIssue.key }
    if lk.inwardIssue:   // 이 이슈가 inward("is blocked by") = 후행 → source=inwardIssue, target=이슈
        push { source: lk.inwardIssue.key, target: issue.key }
  // buildTasksAndLinks에서 양방향 중복(같은 링크가 양쪽 이슈에 나타남)을 seen 셋으로 dedup(기존 로직 재사용).

// effectiveParent (§6): 하이브리드 = wbsParent(집합내) ?? jiraParent(집합내) ?? null
//                        네이티브-only = jiraParent(집합내) ?? null
// type 판정(summary/task/milestone), links dedup·self·dangling 방어는 기존 buildTasksAndLinks 그대로.
```
- 링크 shape은 기존과 동일(`{id:'src->tgt', source, target, type:'FS', lag:0}`). type/lag은 고정값 부여.

### 3-3. GanttService 재구현 (`GanttService.js`)

- `getProjectGanttData`: predecessorsFieldId 파라미터 제거, mapper가 issuelinks로 links 조립. 나머지 동일.
- **`setGanttLink`**:
  - 공통: `fetchGanttGraph(projectId)`(그래프 1패스) — self/교차프로젝트/DAG 사이클 검증(`GanttValidationService` **그대로 재사용** — 네이티브 링크도 순환 형성 가능하므로 검증 유지).
  - `op:'add'`: 검증 통과 → `createIssueLink({ sourceKey:source, targetKey:target })`(asUser).
  - `op:'remove'`: target(또는 source) issuelinks에서 matching linkId 조회 → `deleteIssueLink({ linkId })`.
  - 응답 `predecessors`: write 후 재조회 or 로컬 계산으로 target의 선행 목록을 read Link shape으로 반환(기존과 동일 형태). 프론트는 invalidate로 재동기화하므로 정확 재조회 부담 없으면 로컬 계산 유지 가능.
  - `serializePredecessors`/`updateAppCustomFieldValue` 호출 **제거**.
- **`setGanttParent`**:
  - 검증: self/교차프로젝트/트리 사이클(`detectTreeCycle` 재사용).
  - **네이티브 우선 시도**: `updateIssueParent(issueKey, parentKey, 'user')`.
    - 성공 → effectiveParent=parentKey.
    - **400(인접 위반)** → 하이브리드면 `wbsParentField`로 폴백 write(`updateAppCustomFieldValue`, asApp) 후 effectiveParent=parentKey; 네이티브-only면 `GANTT_HIERARCHY_VIOLATION` throw.
  - 해제(parentKey=null): 네이티브 parent를 null로 PUT(+하이브리드면 wbsParent도 클리어). effectiveParent는 §6 재적용.
  - ⚠️ **subtask 재부모 제약**: subtask의 parent 변경은 REST PUT로 제한될 수 있음(이동 API 필요). 리스크로 표기(§9 D-2).

### 3-4. 에러 케이스 (`ErrorCodes.js`)
| 코드 | 상황 |
|------|------|
| `GANTT_HIERARCHY_VIOLATION`(신규) | 네이티브 parent set이 계층 인접 규칙 위반(400). 네이티브-only일 때 사용자에게 노출. |
| `GANTT_CYCLE_DETECTED`/`GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF` | 기존 유지(링크·부모 검증). |
| `GANTT_ISSUE_NOT_FOUND`/`GANTT_INVALID_DATE_RANGE`/`GANTT_FIELD_NOT_RESOLVED` | 기존 유지(단 FIELD_NOT_RESOLVED는 하이브리드/coworker 해석 시에만). |

### 3-5. 스코프 (manifest `permissions.scopes`) — **추가 불요**
- 이슈 링크 생성/삭제·parent write: 기보유 **`write:jira-work`**(classic)로 커버. 읽기(`issuelinks`)는 `read:jira-work`.
- ⚠️ asUser 링크/parent write는 사용자가 대상 프로젝트에 **"Link Issues"/"Edit Issues" 권한** 보유해야 성공. 무권한 사용자는 403 → `gantt.error.saveFailed` 토스트. (앱 권한이 아니라 Jira 프로젝트 권한 문제이므로 안내만.)
- `updateAppCustomFieldValue`(asApp)는 **하이브리드 폴백에서만** 잔존(`write:app-data:jira` 기보유).

### 3-6. `src/index.js`
- `getGanttLinkTypes` 추가 시 `GanttController`에 `resolver.define` 1줄. 그 외 등록 변경 없음(setGanttLink/setGanttParent 이미 등록됨).

---

## 4. 프론트엔드 설계

### 4-1. 경계면 최소 변경 (핵심 이득)
함수명·입력·응답 shape을 v1과 동일 유지했으므로 **`useGanttMutations.js`(useSetParent/useSetLink)·intercept 배선(add-link/delete-link/move-task)은 원칙적으로 무변경**. 변경은:
- `ganttAdapter.build/toSvarLinks`: 무변경(Link shape 동일).
- 오류 토스트: `mapRelationError`에 `GANTT_HIERARCHY_VIOLATION → gantt.error.hierarchy` 케이스 추가(네이티브-only 채택 시).

### 4-2. R3 아코디언 (좌측 트리 펼침/접힘)
- 네이티브 3레벨 트리(Epic>Story>Subtask)를 `effectiveParent`로 SVAR parent 구성 → 현재 어댑터 그대로 작동.
- `toSvarTasks`가 **자식 보유(summary) 노드에만 open:true** 부여(현행) — leaf `open:true` 시 SVAR `null.forEach` 크래시 회피 제약 유지([[project_svar_gantt]]). 다단(3레벨)도 각 summary가 open이면 전개됨.
- 기본 펼침 상태 정책(전부 펼침 vs 접힘)은 현행(summary open:true=전부 펼침) 유지. 접힘 토글은 SVAR 기본 UI 사용.

### 4-3. ⭐ R4 미일정 이슈 일정 편집 (신규 — 프론트 전용)
현재 미일정 이슈는 `svar.unscheduled=true`로 SVAR unscheduled 영역에 빠져 드래그 편집이 어렵다. **M2 `updateGanttSchedule`를 그대로 재사용**하는 편집 진입점을 추가한다.

- **진입 경로(권고안)**: 좌측 그리드 행에 **"일정 설정" 액션**(미일정 이슈일 때만 노출). 클릭 → Atlaskit **date range 팝업/인라인 DatePicker**(시작일·종료일) → 확정 시 `handleScheduleChange({ issueKey, start, due })` → `useUpdateSchedule.mutate`(M2 경로 100% 재사용).
  - 컴포넌트: `gantt/UnscheduledEditPopup.jsx`(신규) 또는 기존 그리드 컬럼에 편집 셀 추가.
  - 낙관적 업데이트(M2 onMutate)가 캐시 task.start/end를 채우면 → 재조회 시 unscheduled=false로 전환되어 막대가 타임라인에 등장.
- **대안(SVAR 네이티브 드래그)**: SVAR `unscheduledTasks` 패널에서 타임라인으로 드래그 배치 시 `add-task`/`update-task` 이벤트 발생 여부는 무료빌드 미검증 → **E2E 게이트**. 확실성 위해 **명시 편집 팝업(권고안)을 1차**로, 드래그 배치는 2차.
- **scheduled 이슈에도 동일 팝업 제공** 시 드래그 없이 정밀 입력 가능(부가 이점, 선택).

### 4-4. 쿼리키·스토어·권한
- 신규 쿼리키 불요(`ganttKeys.data` 재사용). Zustand 스토어 변경 없음.
- 권한: `PROJECT_GANTT` 폴백 유지(seed 미등록 현행 — §E-3 v1 결정 계승). 차등 권한은 별도 작업.

---

## 5. DB 설계
변경 없음. 관계는 전부 Jira 네이티브(이슈 링크 + parent)에 저장. MySQL/KVS 미사용.

---

## 6. 계층 병합 규칙 (effectiveParent) — 갱신

**옵션 A · 네이티브-only (단순, 3레벨 한정):**
```
effectiveParent = jiraParent(집합내) ?? null
```
- `wbsParent` 필드/개념 제거. 3레벨 초과 표현 불가(요구 R2 "3단계 이상"을 3레벨로 해석 시 충족, "초과"가 필수면 미충족).

**옵션 B · 하이브리드 (권고, 깊이 초과 커버):**
```
effectiveParent = wbsParent(집합내) ?? jiraParent(집합내) ?? null
```
- 네이티브 3레벨은 jiraParent로 무료, **그 이상 깊이는 wbsParent override**로 표현.
- wbsParent write는 여전히 asApp 앱필드 엔드포인트(readOnly 제약) — 단 **네이티브 parent가 우선 시도되고 인접 위반 시에만 폴백**하므로 asApp 노출 최소화.
- 트리 사이클/멤버십 검증은 effectiveParent 체인 기준(현행 `detectTreeCycle` 재사용).

> **결정 필요(§9 D-2).** 요구 문언 "3단계 이상"의 실제 필요 깊이(정확히 3 vs 4+)에 따라 A/B 선택.

---

## 7. 성능 / 무회귀

- **전용 페처 격리 유지**: `getProjectGanttIssues`만 수정(`issuelinks` 추가), 공통 `getProjectIssuesByFilter` 미오염([[feedback_worklog_fetch_isolation]]).
- **1패스·N+1 없음**: issuelinks·parent 모두 search 응답 inline. link add/remove·parent 검증 그래프는 편집 1건당 경량 1패스(현행 `fetchGanttGraph`).
- **asUser 전환으로 asApp 제거**(링크/parent) → [[feedback_no_asapp]] 정합 회복. 하이브리드 폴백 asApp만 예외.
- **무회귀 대상**: M2 `updateGanttSchedule`(일정 write, 표준필드 — 무변경), R1 마커 오버레이, R2 progress 가드, R3 토스트 제거, `ganttAdapter` 출력 계약, 쿼리키 팩토리. link/parent read 조립만 교체.
- **마이그레이션**(§아래) 후 `predecessorsField`/`wbsParentField` 잔존 데이터는 read에서 무시(네이티브-only) 또는 폴백 소스(하이브리드).

### 마이그레이션 / 하위호환
- **predecessorsField**: M3가 배포 환경에서 사실상 write 실패("연결 안됨") → **실데이터 거의 없음** 가정. **일회성 이관 불요**, read 경로만 issuelinks로 교체. manifest 필드 정의는 **잔존 권장**(제거는 Forge에서 파괴적일 수 있음, 값 있으면 방치).
- **wbsParentField**: 네이티브-only면 read 중단(정의 잔존). 하이브리드면 폴백 소스로 계속 사용.
- (선택) 기존 predecessorsField에 유효 데이터가 있으면 **일회성 마이그레이션 resolver**로 읽어 `createIssueLink` 생성 후 필드 클리어 — 데이터 존재 확인 시에만 별도 작업.

---

## 8. i18n 키 (`locales/kr/gantt.json` · `locales/en/gantt.json`)

기존 키 대부분 재사용. 추가:
| 키 | kr | en |
|----|----|----|
| `gantt.error.hierarchy` | Jira 계층상 이 부모로 지정할 수 없습니다(인접 레벨만 가능). | Cannot set this parent due to Jira hierarchy (adjacent levels only). |
| `gantt.error.linkPermission` | 이슈를 연결할 권한이 없습니다. | You do not have permission to link issues. |
| `gantt.unscheduled.setSchedule` | 일정 설정 | Set schedule |
| `gantt.unscheduled.title` | 미일정 이슈 일정 설정 | Schedule unscheduled issue |
| `gantt.unscheduled.start` / `.due` | 시작일 / 종료일 | Start / Due |

> 추가 후 `cd static/ui && npm run merge`. `locales/script/*.json`은 빈 스텁이라 건드리지 않음.

---

## 9. ★ 사용자 결정 필요 항목 (확정 전 구현 착수 보류)

| # | 결정 항목 | 선택지 | 권고 |
|---|----------|--------|------|
| **D-1** | **링크 타입 선택** | (a) "Blocks/is blocked by" 하드코딩 (b) `getGanttLinkTypes`로 관리자 선택 UI | **(a) "Blocks"** — 선후행 의미에 가장 적합, 사이트 기본 존재. 선택 UI는 2차. |
| **D-2** | **계층 깊이 대응** (핵심) | (A) 네이티브-only(3레벨 고정, wbsParent 폐기) (B) 하이브리드(네이티브 우선 + wbsParent로 3레벨 초과 커버) | **필요 깊이 확인 후 결정.** 정확히 3레벨이면 A(단순·asApp 제거). 4+ 필요하면 B(단, 초과분 write는 asApp 앱필드 유지). |
| **D-3** | **FS/SS/FF/SF·lag 저장** | 네이티브 링크는 관계 타입/lag를 **저장 못 함**. (a) 전부 FS/lag0 고정(표시만) (b) lag/type이 제품 필수면 커스텀 저장 병행 | **(a) FS 고정.** MVP 요구에 lag/타입 편집 없음. 필요 시 D-2 하이브리드처럼 별도 저장 재도입(재설계). |
| **D-4** | **subtask 재부모 허용** | REST PUT parent가 subtask에 제한적일 수 있음 | subtask 재부모는 **읽기만/드래그 비활성** 검토. Story↔Epic 재부모 위주로 우선 지원. E2E로 실제 제약 확인. |
| **D-5** | **부모 write 권한 모델** | asUser(사용자 Jira 권한 필요) vs 하이브리드 폴백 asApp | asUser 우선([[feedback_no_asapp]]). 무권한은 토스트 안내. |
| **D-6** | **기존 predecessorsField 데이터 이관** | (a) 무시(권고) (b) 일회성 마이그레이션 | 실데이터 없음 가정 → **(a) 무시**. 데이터 확인되면 (b). |

---

## 10. 커스텀필드(현행) vs 네이티브 비교표

| 관점 | 커스텀필드(현행 M3) | 네이티브(본 설계) |
|------|-------------------|------------------|
| **선후행 write** | readOnly 앱필드 → asApp 앱전용 엔드포인트(제약·"연결 안됨") | `POST/DELETE issueLink` **asUser** ✅ |
| **계층 write** | wbsParentField asApp | 네이티브 parent PUT **asUser**(3레벨 한정) / 초과분만 asApp(하이브리드) |
| **Jira 화면 연동** | ❌ 앱 사설 필드, Jira에 안 보임 | ✅ 이슈 링크·parent가 Jira 이슈/타임라인에 자연 노출 |
| **계층 깊이** | 임의 깊이 자유 | **3레벨 고정**(Epic>Story>Subtask, 인접 전용). 초과는 Premium+Plans(전역) 필요 |
| **관계 타입/lag** | object에 자유 저장 가능 | 저장 불가(FS 고정) |
| **asApp 의존** | 높음(readOnly 제약) | 낮음/없음(하이브리드 폴백만) |
| **마이그레이션** | - | predecessors→링크 이관(실데이터 없으면 불요), wbsParent 유지/폐기 |
| **정합성 리스크** | write 엔드포인트 제약 실패 이력 | asUser 권한(Link/Edit Issues) 필요, subtask 재부모 제약 |

---

## 11. 작업 분해 (backend / frontend)

### backend
- [ ] `IssueApi.js`: `getIssueLinkTypes`/`createIssueLink`/`deleteIssueLink`/`updateIssueParent`(asUser) 추가. `getProjectGanttIssues` fields에 `issuelinks` 추가·`predecessorsField` 제거.
- [ ] `GanttMapper.js`: `buildLinksFromIssueLinks` 신규(양방향 dedup), `parsePredecessors` 폐기/폴백격리, effectiveParent 규칙 §6(A/B) 반영.
- [ ] `GanttService.js`: `setGanttLink`(issueLink add/remove + linkId 조회), `setGanttParent`(네이티브 parent PUT + 하이브리드 폴백) 재구현. `serializePredecessors`/`updateAppCustomFieldValue` 호출 제거(하이브리드면 폴백만).
- [ ] `ErrorCodes.js`: `GANTT_HIERARCHY_VIOLATION` 추가.
- [ ] `GanttController.js`: (선택) `getGanttLinkTypes` 등록.
- [ ] jest: `GanttMapper.test.js`(issuelinks→links 케이스로 갱신), `GanttValidationService.test.js`(무변경 — DAG/tree 재사용).
- [ ] (게이트) `forge deploy` 후 asUser 링크/parent write 라이브 확인.

### frontend
- [ ] `useGanttMutations.js`: `mapRelationError`에 `GANTT_HIERARCHY_VIOLATION` 케이스 추가(A 채택 시). 나머지 무변경.
- [ ] `ganttAdapter.js`: 무변경(Link shape 동일). (하이브리드 미채택 시 wbsParent 참조 없음 확인.)
- [ ] `GanttChart.jsx`/`GanttPage.jsx`: R4 미일정 편집 진입점(`UnscheduledEditPopup`) 추가 + `handleScheduleChange` 재사용.
- [ ] `gantt/UnscheduledEditPopup.jsx`(신규): Atlaskit DatePicker → updateGanttSchedule.
- [ ] i18n 키 추가 + `npm run merge`.

---

## 12. 무회귀 / 검증 기준 (integration-verifier용)
- 경계면 표(§2) ↔ 프론트 소비(useSetParent/useSetLink/useUpdateSchedule) shape 일치.
- links가 `issuelinks`에서 조립되고 양방향 중복 dedup됨(mapper test).
- `op:'remove'`가 source/target로 linkId를 찾아 DELETE(프론트 미노출).
- 전 write 경로 **asUser**(하이브리드 폴백 asApp만 예외) — [[feedback_no_asapp]].
- 공통 페처 미오염, 1패스 N+1 없음.
- M2 일정 write·R1 오버레이·R2 progress·R3 토스트 무회귀.
- **네이티브 계층 3레벨 제약**이 문서·UI(InfoTip/토스트)로 사용자에게 명확히 노출되는지.
