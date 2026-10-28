# 이슈 연결 Gantt (WBS 확장 + 선후행 의존성) 설계서

> 작성: feature-architect / 2026-06-29 / 슬러그 `issue-link-gantt`
> 상태: **설계 확정(사용자 승인 완료, 2026-06-29 "콜")**.
> 확정 사항: ① 라이브러리 **SVAR `wx-react-gantt` (MIT core)** ② 의존성 필드 **`type: object`** (M1에서 set/get PoC 검증 후 확정, 실패 시 string+선행 상한 폴백) ③ 1차 릴리스 **M1+M2(읽기+일정 드래그 write-back)**, 관계 편집(M3)은 2차 ④ 병합 `wbsParent` 우선 ⑤ MVP는 FS·lag0 고정(스키마는 확장 수용).

---

## 1. 개요 / 영향 범위

Jira 3단계 계층(Epic→Story→Sub-task)을 넘는 **확장 WBS 트리** + **선후행 의존성**을, 앱 정의 커스텀 필드에 저장하고, 프로젝트 상세(`/project/:id`)의 **신규 Gantt 탭**에서 시각화·편집(드래그 일정변경 + 관계 생성/삭제)하여 Jira에 write-back 한다.

| 축 | 신규/수정 | 내용 |
|----|----------|------|
| **manifest** | 수정 | `jira:customField` 2종 추가(`wbsParentField`, `predecessorsField`). 기존 `projectIdField`(string, readOnly) 패턴 그대로 복제 |
| **백엔드** | 신규 도메인 `src/resolver/gantt/` | read 1 + write 3 resolver. 이슈 페치 전용 메서드(IssueApi 확장) + 이슈 필드 PUT 메서드(신규) + 순환검증 서비스 |
| **프론트** | 신규 탭 | `projectDetailTabs`에 `projectGantt` 추가, `pages/projectDetail/gantt/` 신규, 신규 라이브러리(SVAR) 도입 |
| **DB** | 변경 없음 | 관계 데이터는 Jira 커스텀필드에 저장(MySQL/KVS 불사용). 권한 pageId만 추가 |
| **i18n** | 신규 | `locales/kr/gantt.json` · `locales/en/gantt.json` |
| **권한** | 수정 | `PAGE_IDS`에 `"PROJECT_GANTT"` 추가(프론트 `constants/pages.jsx` + 백엔드 seed) |

### 백엔드 resolver 함수 목록(신규)
- `getProjectGanttData` (read)
- `updateGanttSchedule` (write: start/due)
- `setGanttParent` (write: WBS 부모 set/clear, 트리 사이클 검증)
- `setGanttLink` (write: 의존성 add/remove, DAG 사이클 검증)

---

## 2. 경계면 계약 (단일 진실 원천)

모든 함수는 `responseWrapper`로 감싸 `{ success, ...result }` 또는 `{ success:false, error:{name,code,message,cause} }` 반환. 아래 "응답 shape"는 success 시 본문이다.

| resolver 함수 | 입력 파라미터 | 응답 shape (success) | 대응 프론트 훅 / 쿼리키 |
|--------------|-------------|---------------------|----------------------|
| **getProjectGanttData** | `{ projectId, coworkerFieldId }` | `{ success:true, content: { tasks:[Task], links:[Link], meta:{ total, fetchedAt } } }` | `useGanttData(projectId)` / `ganttKeys.data(projectId)` |
| **updateGanttSchedule** | `{ projectId, issueKey, start, due }` (ISO date `YYYY-MM-DD`, null 허용) | `{ success:true, content: { issueKey, start, due } }` | `useUpdateSchedule()` (useMutation) |
| **setGanttParent** | `{ projectId, issueKey, parentKey }` (parentKey=null이면 해제) | `{ success:true, content: { issueKey, parentKey, effectiveParent } }` | `useSetParent()` (useMutation) |
| **setGanttLink** | `{ projectId, op:'add'\|'remove', source, target, type:'FS', lag:0 }` | `{ success:true, content: { target, predecessors:[Link] } }` | `useSetLink()` (useMutation) |

### Task 객체 shape (read)
```jsonc
{
  "id": "PROJ-12",            // = issue key (SVAR id로 사용)
  "key": "PROJ-12",
  "summary": "설계 문서 작성",
  "start": "2026-07-01",      // customfield_10015 (없으면 null)
  "end":   "2026-07-05",      // duedate (없으면 null)
  "type": "task",             // 'summary'(자식 있음) | 'task' | 'milestone'(start==end)
  "issueType": "Story",       // Jira issuetype name (아이콘/색)
  "jiraParent": "PROJ-3",     // Jira 표준 parent key (없으면 null)
  "wbsParent": "PROJ-8",      // 커스텀 wbsParentField 값 (없으면 null)
  "effectiveParent": "PROJ-8",// 병합규칙 결과 (§6) — SVAR 트리 구성에 사용
  "progress": 0.4,            // 0~1, MVP M4 전엔 timetracking 근사 or 생략(null)
  "assignee": { "accountId": "...", "displayName": "..." },
  "statusKey": "indeterminate"// statusCategory key
}
```

### Link 객체 shape (read & setGanttLink 응답)
```jsonc
{
  "id": "PROJ-9->PROJ-12",  // 합성키 source->target
  "source": "PROJ-9",        // 선행(predecessor) issue key
  "target": "PROJ-12",       // 후행(successor) issue key
  "type": "FS",              // MVP: 'FS' 고정. 스키마는 SS/FF/SF 수용
  "lag": 0                    // 일 단위 정수. MVP: 0 고정
}
```

> SVAR Gantt의 `links` 모델(`{ source, target, type }`)과 1:1 매핑된다. SVAR type 코드(`e2s`/`s2s`/`e2e`/`s2e`)로의 변환은 프론트 어댑터에서 수행(§4).

---

## 3. 백엔드 설계

도메인: `src/resolver/gantt/` (계층: Controller → Service → (IssueApi/FieldApi) )

### 파일 구성
- `GanttController.js` — `registerGanttController(resolver)` export. 4개 resolver 정의, 각 `responseWrapper`.
- `GanttService.js` — read 조립(페치→정규화→트리/그래프 빌드), write 오케스트레이션(검증→PUT).
- `GanttValidationService.js` — 순수 함수(사이클/자기참조/교차프로젝트 검증). jest 대상.
- `GanttMapper.js` — Jira raw issue → Task/Link 정규화(순수 함수).

### read: `getProjectGanttData`
1. `coworkerFieldId` 확보(프론트 전달 or `FieldApi.getCoworkerFieldIdApi()`).
2. **전용 병렬 페처**(공통 경로 미수정): `IssueApi.getProjectGanttIssues(projectId, coworkerFieldId)` 신규 추가 —
   - JQL: `moves_RMS_projectId="${projectId}"`
   - fields: `summary,duedate,customfield_10015,issuetype,status,statusCategory,assignee,parent,timetracking,<wbsParentFieldId>,<predecessorsFieldId>`
   - `maxResults=100` + `nextPageToken` 루프 1패스(§7). 커스텀필드는 search 응답에 inline → **N+1 없음**.
   - `as='user'` (asUser 유지).
3. `GanttMapper.normalizeIssue()`로 Task 배열 생성, `effectiveParent` 계산(§6).
4. 각 이슈의 `predecessorsField`(JSON)를 펼쳐 Link 배열 합성(target=해당 이슈, source=predecessor).
5. 응답 `{ tasks, links, meta }`.

> 커스텀 필드 ID는 런타임에 fieldname→`customfield_xxxxx` 해석 필요. `FieldApi`에 `getAppFieldIds()` 추가하여 `{ wbsParentFieldId, predecessorsFieldId }`를 1회 조회 후 KVS(`settings`류) 또는 메모리 캐시. (projectId/coworker도 name 기반 해석 중인 기존 패턴과 동일.)

### write 공통
- 입력 검증 → `GanttValidationService` → `IssueApi.updateIssueFields(issueKey, fields, as='user')`(신규, 아래) → 성공 응답.
- `updateIssueFields`는 `putJiraJson({ as, url:`/rest/api/3/issue/${key}`, body:{ fields } })` 래퍼(기존 `RequestJiaJson.putJiraJson` 재사용). **신규 write 헬퍼는 IssueApi에 추가**(현재 이슈 필드 PUT 메서드 부재 — TimeTrackingApi.putTimeTracking만 존재).

### write: `updateGanttSchedule`
- `fields: { customfield_10015: start || null, duedate: due || null }` PUT. 검증: start≤due(있을 때).

### write: `setGanttParent`
- 검증: ① self(parentKey==issueKey) 거부 ② parentKey 이슈가 같은 projectId 소속인지 확인(교차프로젝트 거부) ③ **트리 사이클**: parentKey의 effectiveParent 체인을 위로 추적, issueKey 등장 시 거부.
- 통과 시 `fields: { <wbsParentFieldId>: parentKey || null }` PUT.

### setGanttLink
- 검증: ① source==target 거부 ② 둘 다 같은 projectId 소속 ③ **DAG 사이클**: 기존 링크 그래프 + 신규 edge(source→target) 추가 후 DFS, 사이클이면 거부.
- `op='add'`: target의 predecessors 배열에 `{key:source,type,lag}` upsert. `op='remove'`: 해당 항목 제거. → `fields: { <predecessorsFieldId>: JSON or object }` PUT. 응답에 갱신된 predecessors 반환.
- 사이클 검증을 위해 프로젝트 전체 링크 그래프가 필요 → write 시 `getProjectGanttIssues` 가벼운 변형(links만)으로 1회 페치 후 검증.

### 에러 케이스 (`src/utils/errors/ErrorCodes.js`에 추가)
| 코드 | 상황 |
|------|------|
| `GANTT_CYCLE_DETECTED` | 트리/DAG 사이클 |
| `GANTT_SELF_REFERENCE` | 자기 자신을 부모/선행으로 |
| `GANTT_CROSS_PROJECT_REF` | 다른 프로젝트 이슈 참조 |
| `GANTT_INVALID_DATE_RANGE` | start > due |
| `GANTT_FIELD_NOT_RESOLVED` | 앱 커스텀필드 ID 해석 실패 |
| `GANTT_ISSUE_NOT_FOUND` | 대상 이슈 없음/권한 없음 |

### `src/index.js` 등록
```js
import { registerGanttController } from './resolver/gantt/GanttController';
// ...
registerGanttController(resolver);
```

---

## 4. 프론트엔드 설계

### 라이브러리: SVAR React Gantt (`wx-react-gantt`, MIT core) — §2 결정, 사용자 승인 대기
- 단일 컴포넌트 `<Gantt tasks links onChange/이벤트>`. 임의 깊이 summary 트리 + FS/SS/FF/SF 링크 화살표 + 드래그/리사이즈 + 차트 내 링크 편집 기본 지원. React 18 호환.

### 페이지/컴포넌트 트리 (`static/ui/src/pages/projectDetail/gantt/`)
```
GanttPage.jsx                 // 진입 (project_id prop). 권한·로딩·에러 게이트
├─ useGanttData.js            // useQuery(ganttKeys.data) → invoke('getProjectGanttData')
├─ ganttAdapter.js            // Task/Link(계약) ↔ SVAR 모델 변환 (effectiveParent→parent, FS→e2s 등)
├─ GanttToolbar.jsx           // 줌(일/주/월), 필터(담당자/상태), 범례
├─ GanttChart.jsx             // <SVAR Gantt> 래퍼. 드래그/링크 이벤트 핸들러
└─ useGanttMutations.js       // useUpdateSchedule / useSetParent / useSetLink (useMutation)
```

### 편집 이벤트 → write-back (ProjectCalender `onEventDrop` 패턴 차용)
- 막대 드래그/리사이즈 → `useUpdateSchedule.mutate({ issueKey, start, due })` → onSuccess `invalidateQueries(ganttKeys.data)` / onError revert + toast.
- 링크 화살표 생성·삭제 → `useSetLink.mutate({ op, source, target })`.
- 트리 부모 재지정(들여쓰기 변경/드래그) → `useSetParent.mutate({ issueKey, parentKey })`.
- 낙관적 업데이트는 M3에서 선택 적용(ProjectUserPanel onMutate 패턴). MVP는 invalidate 재조회로 단순화.

### Zustand
- 신규 스토어 불필요. 기존 `usePermissionStore`, `useI18nStore` 사용. 로컬 UI 상태(줌/필터)는 컴포넌트 useState.

### 쿼리키 팩토리 (`static/ui/src/utils/queryKey/projectKeys.js`에 추가)
```js
export const ganttKeys = {
  all: ['projectGantt'],
  data: (projectId) => ['projectGantt', projectId],
};
```
(또는 projectKeys.gantt(id). 신규 export 한 곳에 모으는 기존 컨벤션 따름.)

### 권한
- `constants/pages.jsx`의 `PAGE_IDS`에 `"PROJECT_GANTT"` 추가. 탭 `canRender: () => canRead('PROJECT_GANTT')`, 편집 UI 노출 `canWrite('PROJECT_GANTT')`.
- 백엔드 seed(권한 기본값)에도 `PROJECT_GANTT` 페이지 추가 필요(`src/seed/SeedData.js` 권한 시드 — backend-engineer 확인).

### 탭 등록 (`static/ui/src/constants/tabs.js`, `projectDetailTabs`)
- `analysisReport` 형제로 최상위 탭 `projectGantt` 추가(달력/이슈와 같은 레벨). 예:
```jsx
{ key:'projectGantt', label:(<span...><ChartTimelineIcon/>{t('gantt.tab.label')}</span>),
  component: () => <GanttPage project_id={project_id} toast={toast} />,
  canRender: () => canRead('PROJECT_GANTT') }
```
(`projectDetailTabs` 시그니처에 `canReadGantt`/`canWriteGantt` 인자 추가 또는 내부에서 usePermissionStore 호출 — 기존 `canWriteProject` 전달 방식 따름.)

---

## 5. 커스텀 필드 스키마 설계 (1안 확정 + 근거)

### 결정: **2개 필드 분리** (부모 ≠ 의존성)

| 필드 key | manifest name | type | readOnly | 저장값 | 카디널리티 |
|----------|--------------|------|----------|--------|-----------|
| `wbsParentField` | `moves_RMS_wbsParent` | `string` | true | 부모 이슈 key 문자열 `"PROJ-8"` (없으면 빈값) | 1 |
| `predecessorsField` | `moves_RMS_predecessors` | **`object`**(확정) | true | `{"links":[{"key":"PROJ-9","type":"FS","lag":0}]}` | N |

> **확정**: `predecessorsField`는 `type: object`. 사유: predecessors는 N개라 `string`(short-text ~255자)은 선행 5~6개만 넘어도 깨지는 구조적 리스크 → 길이 제약 없는 `object` 채택. **코드베이스에 `object` 타입 전례가 없으므로 M1에서 빈 object 필드 set/get PoC를 먼저 통과시키고 확정**한다. PoC 실패(Forge 미지원/API 거부) 시 폴백: `type: string` + 선행 개수 상한(예: 10개) + 길이 가드.

### manifest 모듈 정의 샘플 (`projectIdField` 패턴 복제)
```yaml
  jira:customField:
    # ... 기존 projectIdField / coworkerIdField ...
    - key: wbsParentField
      name: moves_RMS_wbsParent
      description: Moves Workforce WBS parent issue key
      type: string
      readOnly: true
    - key: predecessorsField
      name: moves_RMS_predecessors
      description: Moves Workforce schedule predecessors
      type: object          # 확정: object (길이 제약 없음). M1 PoC 통과 후 확정, 실패 시 string 폴백
      readOnly: true
```

### 근거
- **분리 이유**: 부모(계층/그룹핑, 트리-비순환)와 선후행(스케줄/DAG-비순환)은 의미·카디널리티(1 vs N)·검증규칙이 다르다. 한 필드에 합치면 파싱·검증이 복잡해지고 부분 갱신 충돌 위험. 분리하면 각 write가 독립 PUT.
- **readOnly:true**: 기존 `projectIdField`가 readOnly:true이면서 앱이 API로 값을 set하는 패턴 검증됨(이슈에 projectId 부여). 사용자가 Jira UI에서 임의 편집 못 하게 막고 앱 Gantt만 통제 → 스키마 무결성 유지. **앱은 `PUT /issue` + `write:jira-work` 스코프로 readOnly 필드 값을 set 가능**(projectId가 그 증거).
- **저장 방향 = predecessors(선행)**: 화살표 A→B(“A 끝나야 B 시작”)는 “B가 A에 의존”. 자연스럽게 **후행 이슈 B의 필드에 선행 A를 기록**. 읽을 때 각 이슈의 predecessors를 펼쳐 그래프 도출 → 단일 소스, 양방향 중복 없음.
- **타입 선택(string-JSON vs object)**: 1안은 `type: string`에 JSON 직렬화 — 기존 코드베이스가 string/user/datetime만 써왔고 `object` 타입 실사용 전례가 없어 **불확실성 0**인 string 채택. ⚠️ **리스크: Jira short-text(string) 필드 길이 한계(~255자)**. 선행 다수 시 초과 가능 → 대안 `type: object`(임의 JSON, 길이 자유) 검토 항목으로 사용자 승인 대상(§9). 부모필드는 key 1개라 string 충분.
- **lag/관계타입**: **스키마에는 처음부터 `type`/`lag` 필드 포함**(추후 마이그레이션 회피). **MVP 동작은 FS·lag0 고정**(UI에서 타입/lag 편집은 M4). 읽기/렌더는 type 분기 지원.

---

## 6. 3단계 Jira 계층 ↔ 커스텀 WBS 부모 병합 규칙

```
effectiveParent(issue) = wbsParent ?? jiraParent ?? null(root)
```
- **커스텀 `wbsParent` 우선**. 이 앱에서 사용자가 명시적으로 지정한 WBS 의도가 Jira 자동 계층보다 우선.
- `wbsParent` 비었으면 Jira `parent`(Epic/Story/Sub-task) 사용 → 기존 Jira 계층을 기본 트리로 무료 활용.
- 둘 다 없으면 루트.
- **사이클/유효성**: 트리 사이클 검증은 `effectiveParent` 체인 기준. `wbsParent`가 가리키는 이슈가 페치 집합(같은 프로젝트)에 없으면 무시하고 루트 처리(교차/유실 참조 방어). UI에 “Jira 계층 / WBS 재정의” 시각 구분(InfoTip)은 M4 선택.

---

## 7. 성능 설계 (Forge 256MB)

- **전용 병렬 페처 격리**: `IssueApi.getProjectGanttIssues` 신규 추가, 공통 `getProjectIssuesByFilter` 미수정(워크로그 페처 격리 교훈 준수). 회귀 차단.
- **1패스 페치, N+1 없음**: Jira search는 요청한 customfield를 응답에 inline 포함 → 이슈 N개를 `maxResults=100` + `nextPageToken` 루프로 1회 수집하며 부모·WBS·predecessors·일정·timetracking을 함께 획득. 추가 per-issue 호출 없음.
- **워크로그 비페치(MVP)**: 진행률 오버레이는 M4. M1~M3은 `timetracking`(inline) 근사 또는 progress=null. 다건 워크로그 페치 회피로 메모리/시간 절약.
- **캐시 전략**: read는 **React Query staleTime(5분)** 로 충분(write 후 invalidate). 서버측 KVS 캐시는 두지 않음 — 편집이 잦아 캐시 무효화 비용이 이득보다 큼. (Resource 분석류의 KVS 캐시 패턴은 read-heavy 전용, 여기엔 부적합.)
- **커스텀필드 ID 해석 캐시**: `getAppFieldIds()` 결과는 설치 단위 불변 → 메모리/KVS 1회 캐시.
- **write**: 편집 1건 = PUT 1회. 사이클 검증용 그래프 페치는 links 전용 경량 1패스.

---

## 8. 라이브러리 적합성 재검증 (가장 중요한 의사결정)

요구: **임의 깊이 WBS 트리 + 의존성 화살표 + 드래그(일정·관계) 편집** 전부.

### gantt-task-react 판정: ❌ (임의 깊이 트리 미지원)
- 근거: 공식 문서/타입상 `children` 파라미터가 **one level deep records**만 반환(웹 검증). project→task 1단 그룹 위주이며, summary 안의 summary(다단 트리)를 정식 지원하지 않음. 의존성/드래그는 되나 **임의 깊이 WBS라는 핵심 요구 미충족** → 풀요구 부적격(M1 평면 트리 한정이면 가능).

### 후보 비교

| 후보 | 라이선스 | 임의깊이 트리 | 의존성(FS/SS/FF/SF)+화살표 | 드래그·링크 편집 | 번들 | 예상 공수 | 비고 |
|------|---------|:---:|:---:|:---:|------|------|------|
| **SVAR React Gantt (`wx-react-gantt`)** | **MIT (core)** ✅ / PRO $749(옵션) | ✅ summary 다단 | ✅ 4종 | ✅ 차트내 편집 | 중 | 중 | **추천**. core 무료·상업 가능. PRO는 auto-schedule/critical-path/resource만(MVP 불요) |
| gantt-task-react | MIT | ❌ 1단 | ✅ | ✅ | 소 | 소 | 트리 깊이 한계로 탈락 |
| DHTMLX Gantt | GPLv2 **또는** 상업 유료 | ✅ | ✅ | ✅ | 중 | 중 | GPL copyleft→상업앱은 유료 라이선스 필요(비용/심사 부담) |
| Bryntum Gantt | 상업 전용(고가) | ✅ | ✅ | ✅(최강) | 대 | 중 | 기능 최강·고비용. 오버스펙 |
| 자체 SVG/ECharts | 라이선스 무 | ✅(직접) | △(직접 구현) | △(직접) | 소 | **대(높음)** | 통제 100%·유지보수 부담 큼. 일정 압박 시 비권장 |

### 추천 1안: **SVAR React Gantt (MIT core)** — ⚠️ 사용자 승인 필요
- 핵심 근거: ① **요구사항이 가정한 ‘SVAR=GPL’은 현재 사실과 다름** — v2.4부터 **core가 MIT**(상업 클로즈드소스 사용 가능, 공식 licenses 페이지 확인). ② 임의 깊이 summary 트리·4종 의존성·드래그·차트 내 링크 편집을 기본 제공. ③ React 18 호환.
- 승인 필요 사유(리더→사용자 재확인): (a) 도입 라이브러리 확정, (b) MIT core 범위에서 요구 기능 전부 충족되는지(auto-scheduling 등 PRO 기능은 MVP 비포함이라 core로 충분하다는 판단 동의), (c) 번들 사이즈/256MB 영향 수용, (d) `react-grid-layout`/Atlaskit과의 스타일 충돌 점검.

---

## 9. 순환/검증 설계 (백엔드 위치·방법)

`GanttValidationService.js` 순수 함수(jest 검증). write resolver가 PUT **이전** 호출.

| 검증 | 위치 | 방법 |
|------|------|------|
| 트리 사이클 | `setGanttParent` | 프로젝트 이슈의 effectiveParent 맵 구성 → parentKey에서 위로 추적, issueKey 만나면 `GANTT_CYCLE_DETECTED` |
| DAG 사이클 | `setGanttLink(add)` | 기존 predecessors 그래프 + 신규 edge → DFS/topo, 사이클이면 거부 |
| 자기참조 | parent/link | issueKey==parentKey 또는 source==target → `GANTT_SELF_REFERENCE` |
| 교차 프로젝트 | parent/link | 참조 대상 이슈의 `moves_RMS_projectId`가 현재 projectId와 다르면 `GANTT_CROSS_PROJECT_REF`. 페치 집합(같은 프로젝트) 멤버십으로 1차 판정 |
| 날짜 범위 | `updateGanttSchedule` | start>due → `GANTT_INVALID_DATE_RANGE` |

---

## 10. i18n 키 목록 (`locales/kr/gantt.json` · `locales/en/gantt.json`)

| 키 | kr | en |
|----|----|----|
| `gantt.tab.label` | 간트 | Gantt |
| `gantt.title` | 일정 간트 | Schedule Gantt |
| `gantt.guide` | 막대를 드래그해 일정을, 화살표로 선후행을, 들여쓰기로 WBS 부모를 편집합니다. | Drag bars for schedule, arrows for dependencies, indent for WBS parent. |
| `gantt.zoom.day` / `.week` / `.month` | 일 / 주 / 월 | Day / Week / Month |
| `gantt.filter.assignee` | 담당자 | Assignee |
| `gantt.filter.status` | 상태 | Status |
| `gantt.legend.summary` | 요약(상위) | Summary |
| `gantt.legend.task` | 작업 | Task |
| `gantt.legend.milestone` | 마일스톤 | Milestone |
| `gantt.empty` | 표시할 이슈가 없습니다. | No issues to display. |
| `gantt.toast.scheduleSaved` | 일정이 저장되었습니다. | Schedule saved. |
| `gantt.toast.linkSaved` | 선후행이 저장되었습니다. | Dependency saved. |
| `gantt.toast.parentSaved` | WBS 부모가 저장되었습니다. | WBS parent saved. |
| `gantt.error.cycle` | 순환 관계는 만들 수 없습니다. | Cannot create a circular relation. |
| `gantt.error.selfRef` | 자기 자신을 지정할 수 없습니다. | Cannot reference itself. |
| `gantt.error.crossProject` | 다른 프로젝트 이슈는 연결할 수 없습니다. | Cannot link issues from another project. |
| `gantt.error.dateRange` | 시작일이 종료일보다 늦습니다. | Start date is after due date. |
| `gantt.error.saveFailed` | 저장에 실패했습니다. | Failed to save. |
| `gantt.readOnlyHint` | 편집 권한이 없습니다. | You do not have edit permission. |

> 추가 후 `cd static/ui && npm run merge` 실행하여 `ko-KR.json`/`en-US.json` 생성. `locales/script/*.json`은 스텁이므로 건드리지 않음.

---

## 11. 단계적 구현 분해 (MVP → 확장)

> **1차 릴리스 = M1 + M2** (읽기 + 일정 드래그 write-back). **관계 편집(M3)은 커스텀필드 PoC/도입 확정 후 2차 릴리스.**

### M1 — 읽기전용 트리 + 화살표 + 커스텀필드 PoC (먼저 가치 검증)
- **PoC(선행)**: manifest에 `wbsParentField`/`predecessorsField`(object) 추가 후, 임의 이슈에 빈/샘플 object 값을 `PUT /issue`로 set→search로 get 왕복 검증. 통과해야 object 타입 확정(실패 시 string 폴백으로 §5 갱신).
- **backend**: `IssueApi.getProjectGanttIssues`, `FieldApi.getAppFieldIds`, `GanttMapper`, `GanttService.getProjectGanttData`, `GanttController`(read만), `src/index.js` 등록.
- **frontend**: SVAR 설치, `ganttKeys`, `useGanttData`, `ganttAdapter`, `GanttPage`/`GanttChart`(읽기), 탭 등록, 권한 `PROJECT_GANTT`(read), `gantt.json` 일부.
- 산출물: 임의 깊이 트리 + 의존성 화살표 표시(편집 없음).

### M2 — 일정 드래그 write-back (1차 릴리스 마감)
- **backend**: `IssueApi.updateIssueFields`(PUT 헬퍼), `updateGanttSchedule` resolver + 날짜검증.
- **frontend**: 드래그/리사이즈 핸들러 → `useUpdateSchedule` → invalidate/revert.

### M3 — 관계 편집(부모·선후행) + 사이클 검증 (2차 릴리스)
- **backend**: `GanttValidationService`, `setGanttParent`, `setGanttLink`, ErrorCodes 추가, manifest 커스텀필드 2종, seed 권한 추가.
- **frontend**: 링크 생성/삭제·부모 재지정 핸들러 → `useSetParent`/`useSetLink`, 에러 토스트, 쓰기 권한 게이트.

### M4 — 확장(선택)
- 진행률 오버레이(`ProgressCalculator` 재사용), lag·SS/FF/SF 편집 UI, Jira계층/WBS 시각 구분 InfoTip, 낙관적 업데이트.

---

## 12. 변경 파일 목록 (요지)

### 백엔드 (신규/수정)
- `src/resolver/gantt/GanttController.js` (신규) — resolver 4종 등록.
- `src/resolver/gantt/GanttService.js` (신규) — read 조립 + write 오케스트레이션.
- `src/resolver/gantt/GanttValidationService.js` (신규) — 사이클/참조 검증 순수함수.
- `src/resolver/gantt/GanttMapper.js` (신규) — issue→Task/Link 정규화.
- `src/api/jira/issue/IssueApi.js` (수정) — `getProjectGanttIssues`, `updateIssueFields` 추가.
- `src/api/jira/field/FieldApi.js` (수정) — `getAppFieldIds`(wbs/predecessors fieldId 해석) 추가.
- `src/utils/errors/ErrorCodes.js` (수정) — GANTT_* 코드 6종.
- `src/index.js` (수정) — `registerGanttController` import/호출.
- `src/seed/SeedData.js` (수정) — 권한 시드에 `PROJECT_GANTT` 추가.

### manifest
- `manifest.yml` (수정) — `jira:customField`에 `wbsParentField`/`predecessorsField` 2종 추가.

### 프론트
- `static/ui/package.json` (수정) — `wx-react-gantt` 추가.
- `static/ui/src/pages/projectDetail/gantt/` (신규) — GanttPage/GanttChart/GanttToolbar + useGanttData/useGanttMutations/ganttAdapter.
- `static/ui/src/constants/tabs.js` (수정) — `projectGantt` 탭.
- `static/ui/src/constants/pages.jsx` (수정) — `PAGE_IDS`에 `PROJECT_GANTT`.
- `static/ui/src/utils/queryKey/projectKeys.js` (수정) — `ganttKeys`.

### i18n
- `locales/kr/gantt.json` · `locales/en/gantt.json` (신규) → `npm run merge`.

---

## 13. 확정 사항 (2026-06-29 사용자 승인 "콜")

1. **라이브러리/라이선스**: ✅ SVAR `wx-react-gantt` **MIT core** 채택. (요구가 가정한 ‘SVAR=GPL’은 사실 아님 — v2.4+ MIT 확인.)
2. **커스텀필드 타입**: ✅ `predecessorsField` = **`type: object`**. 단 M1에서 set/get PoC 통과를 게이트로 둠. 실패 시 `string`+선행 상한 폴백.
3. **릴리스 범위**: ✅ **1차 = M1+M2**(읽기+일정 드래그 write-back). 관계 편집(M3)은 2차.
4. **병합 규칙**: ✅ `wbsParent` 우선, 비었을 때 Jira `parent` 폴백.
5. **관계타입/lag**: ✅ MVP는 FS·lag0 고정. 스키마는 `type`/`lag` 포함해 마이그레이션 없이 확장 수용.

### 잔여 점검(구현 중 확인, 승인 불요)
- M1 PoC 결과에 따른 §5 필드 타입 최종 확정.
- SVAR 번들 사이즈 + Atlaskit/`react-grid-layout` 스타일 충돌 점검(M1).

---

## M3 구현 명세 (확정, 2026-06-30)

> 작성: feature-architect / 2026-06-30. M1+M2+R1/R2/R3+오버레이는 **구현·검증 완료(FAIL 0)**. 본 섹션은 **M3(관계 편집: WBS 부모 + 선후행 의존성) 구현 단계 승격을 위한 단일 진실**이다.
> 실제 소스(`src/resolver/gantt/*`, `src/api/jira/*`, `static/ui/.../gantt/*`)·M1/M2 리포트(`02_*`)·검증 리포트(`03_*`)와 정합하도록 확정했다. **기존 §2~§13과 충돌하는 지점은 본 섹션 값이 우선**(아래에 명시).
> 라이브러리 정정: 설계 전반의 `wx-react-gantt`(GPL)는 검증 단계에서 **`@svar-ui/react-gantt@^2.7.1`(MIT 무료빌드)** 로 전환됨. 본 M3 명세의 SVAR 이벤트/payload는 이 **무료빌드 dist를 소스 레벨로 확인**한 값이다.

### M3-0. 현재 "3중 차단" 상태 — M3가 정확히 풀 대상

검증 리포트(`03`)가 확인한 M3 비활성은 다음 3중이며, M3 구현은 이를 **정확히 푸는** 작업이다(그 외 무회귀).
1. **컨트롤러 미등록**: `GanttController.js:8-17` 에 `getProjectGanttData`+`updateGanttSchedule` 2개만 `resolver.define`. → setGanttParent/setGanttLink 추가 등록.
2. **프론트 훅 미작성**: `useGanttMutations.js` 에 `useUpdateSchedule` 만 존재. → `useSetParent`/`useSetLink` 추가.
3. **SVAR intercept 차단**: `GanttChart.jsx:185-193` 에서 `add-link`/`delete-link`/`move-task` 를 `block=()=>false` 로 능동 차단. → editable일 때 핸들러 배선으로 대체.
- ErrorCodes 3종(`ErrorCodes.js:48-49`)은 주석 보류 상태 → 활성화.
- `parsePredecessors`(`GanttMapper.js:11-34`)는 **이미 object·JSON문자열·배열을 모두 수용**(read 폴백 대칭 확보됨). M3 write는 이 대칭을 깨지 않는다.

---

### A. 경계면 계약 (단일 진실 — backend→frontend)

모든 함수는 `responseWrapper`로 감싼다. **실제 백엔드 패턴(`02_backend_report.md`)과 동일하게 Service가 `{ content: {...} }`를 반환**하고 responseWrapper가 `{ success:true, content:{...} }`로 직렬화한다(M1/M2 `getProjectGanttData`/`updateGanttSchedule`와 정합). 실패 시 `{ success:false, error:{ name, code, message, cause } }`.

| resolver(invoke명) | 입력 payload | success 응답 (글자 그대로) | 프론트 훅 / invalidation |
|---|---|---|---|
| **setGanttParent** | `{ projectId, issueKey, parentKey }` (`parentKey=null` → WBS 부모 해제) | `{ "success": true, "content": { "issueKey": "PROJ-12", "parentKey": "PROJ-8", "effectiveParent": "PROJ-8" } }` | `useSetParent({projectId,toast})` → `invalidateQueries(ganttKeys.data(projectId))` |
| **setGanttLink** | `{ projectId, op:'add'\|'remove', source, target, type:'FS', lag:0 }` | `{ "success": true, "content": { "target": "PROJ-12", "predecessors": [ Link, ... ] } }` | `useSetLink({projectId,toast})` → `invalidateQueries(ganttKeys.data(projectId))` |

- **`setGanttParent.content.effectiveParent`**: write 직후 §6 병합규칙 재적용 결과. `parentKey`를 set하면 통상 `effectiveParent===parentKey`. `parentKey=null`이면 effectiveParent는 **jiraParent로 폴백**(루트 아님 — §6, ⚠️ D-4 주의 참조).
- **`setGanttLink.content.predecessors`**: target 이슈의 **갱신된 전체 선행 목록**을 **read와 동일한 Link shape**으로 반환:
  ```jsonc
  { "id": "PROJ-9->PROJ-12", "source": "PROJ-9", "target": "PROJ-12", "type": "FS", "lag": 0 }
  ```
  (= `GanttMapper.buildTasksAndLinks` links 원소와 동일 필드. §2/§60-64 및 `02_backend_report.md:46-55`와 1:1.)
- **에러 코드 → 프론트 분기**: `result.error.code` 로 토스트 매핑(C-3). 프론트는 M2와 동일하게 `err.cause = result.error` 세팅 후 throw → `onError`에서 `err.cause.code` 분기.
- **§2 표 대비 변경 없음**: 기존 §38/§39 계약을 **그대로 확정**(shape 동일). 단 `setGanttLink` 입력에 `type`/`lag`는 MVP에서 `'FS'`/`0` 고정값을 프론트가 채워 보낸다(D-2).

#### 프론트 훅 사양 (`useGanttMutations.js`에 추가)
```
useSetParent({ projectId, toast })
  mutationFn: invoke('setGanttParent', { projectId, issueKey, parentKey })
             → result.success!==true 면 err.cause=result.error throw, else result.content
  onMutate:  (낙관적 미적용 — D-3) 없음
  onSettled: invalidateQueries(ganttKeys.data(projectId))   // 성공=재동기화, 실패=스냅백
  onError:   code별 토스트(C-3 표) / 그 외 gantt.error.saveFailed

useSetLink({ projectId, toast })
  mutationFn: invoke('setGanttLink', { projectId, op, source, target, type:'FS', lag:0 })
  onSettled: invalidateQueries(ganttKeys.data(projectId))
  onError:   code별 토스트
```
- 성공 토스트는 **달지 않는다**(R3 교훈 — 노이즈 방지). invalidate 재조회로 트리/화살표가 서버 권위 상태로 갱신되는 것이 확인 피드백.
- 쿼리키: 신규 추가 없음. 기존 `ganttKeys.data(projectId)`(`projectKeys.js`) 재사용.

---

### B. ⚠️ predecessorsField(object) write 게이트 — 방어 설계 (게이트)

`manifest.yml:37-40` 의 `predecessorsField`는 `type: object`로 **이미 정의**됨(M1에서 추가, `02_backend_report.md:90` 확인). 그러나 **object 필드의 라이브 set→get roundtrip은 `forge deploy` 미수행으로 U1 미검증**(`03_verify_report.md:83-84`). M3의 `setGanttLink`가 이 필드에 write하므로 **코드 변경 없이 string(JSON) 폴백으로 절체 가능**하게 설계한다.

#### B-1. 직렬화 단일 추상화 지점 (핵심)
`GanttService.js`(또는 신규 `GanttRelationService.js`)에 **직렬화/역직렬화를 한 곳으로** 모은다:
```
// 단일 토글 — 배포 PoC 실패 시 이 상수만 true 로 (그 외 코드 무변경)
const PREDECESSORS_AS_STRING = false;

serializePredecessors(linksArr)  // [{key,type,lag}] → object {links:[...]}  | (toggle) JSON.stringify
   → PREDECESSORS_AS_STRING ? JSON.stringify({ links: linksArr }) : { links: linksArr };
```
- write는 항상 `updateIssueFields(target, { [predecessorsFieldId]: serializePredecessors(next) })`(`IssueApi.js:385` 재사용).
- **read 측은 무변경**: `parsePredecessors`(`GanttMapper.js:11-34`)가 이미 object/`{links:[]}`/JSON문자열/배열을 전부 수용 → 어느 표현이든 round-trip 성립(대칭 확보됨).
- 따라서 object가 깨지면 `PREDECESSORS_AS_STRING=true` 한 줄 + (필요시) manifest `type: string`만 바꾸면 끝. mapper/검증/프론트 무변경.

#### B-2. PoC 게이트 절차 (deploy 후, setGanttLink 실배선 전 1회)
1. `forge deploy`.
2. 임의 이슈에 `updateIssueFields(key, { [predecessorsFieldId]: { links:[{key:'X',type:'FS',lag:0}] } })` set.
3. `getProjectGanttIssues`(search) 응답의 해당 이슈 `fields[predecessorsFieldId]`에 **동일 object가 inline으로 되돌아오는지** 확인.
4. 통과 → object 확정(`PREDECESSORS_AS_STRING=false` 유지). 실패(set 거부/직렬화 깨짐) → `true`로 절체 + manifest `type: string` 재배포. (선행 상한 가드는 string 폴백 시에만 의미 → 그때 추가.)
- **게이트 라벨**: 이 PoC 통과 전까지 `setGanttLink`는 **deploy 환경에서만** 최종 검증 가능. 코드/jest는 PoC와 독립으로 선행 가능(검증 함수·shape은 deploy 무관).

---

### C. 사이클/유효성 검증 — `GanttValidationService.js` (신규, 순수함수·jest 대상)

write resolver가 **PUT 이전** 호출. 검증에 필요한 프로젝트 그래프는 **기존 페치 1패스 재사용**으로 조달:
`getAppFieldIds()` → `getProjectGanttIssues(projectId, …)` → `buildTasksAndLinks(issues,…)`(`GanttMapper.js:129`)로 `{ tasks, links }` 획득. tasks의 `effectiveParent`/`key`와 links로 맵 구성. (편집 1건당 경량 1패스 — §7/§236 준수, 공통 경로 미오염.)

#### C-1. 순수함수 시그니처 (입력 그래프 → throw | ok)
```
detectTreeCycle({ parentByKey, keySet, issueKey, parentKey })
  // parentByKey: Map<key, effectiveParent|null>
  // self(issueKey===parentKey) → GANTT_SELF_REFERENCE
  // parentKey ∉ keySet → GANTT_CROSS_PROJECT_REF (페치집합=동일 프로젝트 멤버십)
  // parentKey 에서 effectiveParent 체인을 위로 추적, issueKey 재등장 시 → GANTT_CYCLE_DETECTED
  // (parentKey===null 이면 검증 통과 — 해제는 항상 안전)

detectDagCycle({ links, keySet, source, target })
  // source===target → GANTT_SELF_REFERENCE
  // source ∉ keySet || target ∉ keySet → GANTT_CROSS_PROJECT_REF
  // 그래프 간선 = (predecessor)source → (successor)target. 기존 links + 후보(source→target)
  //   에서 target 으로부터 source 가 도달가능하면(=이미 target 이 source 를 선행) → GANTT_CYCLE_DETECTED
  // 3-color DFS. add 에만 적용(remove 는 검증 불요).
```
- 자기참조/교차프로젝트/사이클은 **검증함수 내부에서 throw**(LogicalError + 코드). Service는 통과 시에만 PUT.
- `op:'remove'`는 사이클 검증 생략(항상 안전), 단 source/target 멤버십·self 가드는 유지.

#### C-2. ErrorCodes 활성화 (`ErrorCodes.js:48-49` 주석 → 실코드)
```
GANTT_CYCLE_DETECTED:    'GANTT_CYCLE_DETECTED',
GANTT_SELF_REFERENCE:    'GANTT_SELF_REFERENCE',
GANTT_CROSS_PROJECT_REF: 'GANTT_CROSS_PROJECT_REF',
```
(M1/M2의 `GANTT_INVALID_DATE_RANGE`/`GANTT_FIELD_NOT_RESOLVED`/`GANTT_ISSUE_NOT_FOUND` 3종은 그대로.)

#### C-3. 에러코드 → i18n 토스트 키 (대부분 §10에 **이미 존재** — 추가 키 0)
| 에러코드 | 프론트 토스트 키 | §10 존재? |
|---|---|---|
| `GANTT_CYCLE_DETECTED` | `gantt.error.cycle` | ✅ (§294, 라인 294) |
| `GANTT_SELF_REFERENCE` | `gantt.error.selfRef` | ✅ (§295) |
| `GANTT_CROSS_PROJECT_REF` | `gantt.error.crossProject` | ✅ (§296) |
| (그 외/네트워크) | `gantt.error.saveFailed` | ✅ (§298) |
| 성공(부모) | `gantt.toast.parentSaved` | ✅ (§293, **미사용 유지** — R3대로 토스트 안 띄움) |
| 성공(링크) | `gantt.toast.linkSaved` | ✅ (§292, 동일 미사용) |
- **i18n 추가 작업 없음**: 위 키들은 `locales/kr/gantt.json`·`locales/en/gantt.json`에 **M1 단계에서 이미 생성**됨(`02_frontend_report.md:64` "M3 전용 키 포함"). 따라서 M3는 **merge 불필요**. (값 변경이 없으면 `npm run merge` 생략.)

#### C-4. jest
- 신규 `src/resolver/gantt/__test__/GanttValidationService.test.js`: tree(self/cross/cycle/정상해제/정상set), DAG(self/cross/직접사이클/간접사이클/정상add/remove) 케이스. 순수함수라 Forge 무의존.
- 기존 `GanttMapper.test.js`(27케이스) 무변경 — 회귀 가드.

---

### D. ⭐ SVAR 무료빌드 인터랙션 배선 (확정 — 소스 레벨 검증)

`@svar-ui/react-gantt@2.7.1`(무료) **dist를 직접 확인**: `add-link`/`delete-link`/`move-task`/`update-link`/`indent-task` 모두 **무료빌드에서 발생**(`react-gantt/dist/index.es.js` grep: add-link×1, delete-link×6, move-task×1, update-link×2). payload 계약은 `gantt-store/dist/types/DataStore.d.ts:112-122` 의 `IDataMethodsConfig`.

#### D-1. 이벤트 payload (소스에서 글자 그대로 확인)
- **add-link** (막대 끝 드래그→다른 막대 연결 시): `react-gantt/dist`가
  ```js
  exec("add-link", { link: { source: E.id, target: T, type: $e(...) } })
  ```
  발생. payload = `{ link: { source, target, type } }`. `type`은 **SVAR 코드**(`'e2s'|'s2s'|'e2e'|'s2e'`). `id` 미포함(SVAR가 자체 생성). 내부적으로 `E.id!==T && !이미존재` 가드 후 발생(self·중복 1차 차단).
- **delete-link** (선택된 화살표의 삭제 컨트롤 클릭, `.wx-delete-link` `data-link-id`): payload = `{ id }`. 이 `id`는 **우리가 read에서 부여한 합성키 `source->target`**(어댑터 `toSvarLinks`가 `id: link.id ?? source->target`, 백엔드 Link.id=`source->target` → 일치). 따라서 `id`를 `'->'.split`으로 source/target 복원 가능. (안전망: 복원 실패 시 `api.getState()._links` 또는 React `links` prop에서 `id→{source,target}` 조회.)
- **move-task** (그리드 행 드래그-재정렬/중첩): payload = `{ id, mode:'before'|'after'|'up'|'down'|'child', target, inProgress }`. `inProgress:true`=드래그 중, 미포함/false=확정.

#### D-2. 배선 모델 — **intercept-차단 → payload로 의도 산출 → mutate → invalidate** (3 이벤트 통일)
`GanttChart.jsx:185-193` 의 3중 `block` 을 **editable일 때만** 아래로 대체(무권한이면 종전 차단 유지). **핵심: 낙관적 로컬 적용을 허용하지 않고 intercept에서 의도만 추출해 mutate** → 사이클 등 **무효 상태가 화면에 절대 안 뜬다**(서버 권위). 성공 시 invalidate 재조회로 반영.

- **링크 추가**: `intercept('add-link', payload => { ... return false; })`
  - payload.link에서 `source`/`target`/`type`(SVAR코드) 추출. `type` → 계약타입 = `SVAR_TO_LINK_TYPE[svarType] || 'FS'`(어댑터 `ganttAdapter.js:26` 재사용). **MVP는 lag0**; type는 사용자가 연결한 끝점 그대로 보존(스키마 수용, read와 대칭). 사용자 단순화를 원하면 `'FS'` 강제도 가능 — **확정: 매핑된 type 전송**(read round-trip 일관).
  - `onSetLink.mutate({ op:'add', source, target, type, lag:0 })`. `return false`로 로컬 add 차단(서버 확정 후 invalidate로 그려짐).
- **링크 삭제**: `intercept('delete-link', ({id}) => { ... return false; })`
  - `id`(`source->target`) 복원 → `onSetLink.mutate({ op:'remove', source, target, type:'FS', lag:0 })`. `return false`.
- **부모 재지정(WBS)**: `intercept('move-task', payload => { ... return false; })`
  - `payload.inProgress===true` → **무시하고 `return false`**(드래그 중 미반영). 확정 이벤트만 처리.
  - 신규 부모 산출(**로컬 적용 없이 pre-move 상태로 계산** — target은 이동 안 하므로 그 parent 불변):
    - `mode==='child'` → `newParent = target`
    - `mode==='before'|'after'` → `newParent = api.getTask(target)?.parent ?? null` (대상의 형제 = 대상의 부모)
    - `mode==='up'|'down'` → 동일 부모 내 키보드 재정렬 → **부모 불변**, 산출 스킵
  - `newParent` 정규화: SVAR 루트 표기 `0`/`undefined` → `null`.
  - **변경 없음 스킵**: `current = api.getTask(id)?.parent` 와 같으면 mutate 안 함(무의미 write/토스트 차단 — R2/R3 교훈).
  - `onSetParent.mutate({ issueKey:id, parentKey:newParent })`. `return false`로 로컬 이동 차단.
  - (참고) `indent-task`(들여쓰기 핫키)도 무료빌드 존재하나 **MVP 미배선**(드래그 move-task로 충분, 핫키는 4차). 안전을 위해 editable여도 `intercept('indent-task', ()=>false)` 유지 권장.

#### D-3. 낙관적 업데이트 — **미적용 확정**(M2와 다름)
- M2(일정)는 낙관적+롤백을 썼지만, M3(관계)는 **invalidate 단순화**(설계 §152). 사유: ① 관계 편집은 사이클 검증이 서버에만 있어 낙관 반영 시 무효 트리가 잠깐 보일 수 있음(intercept-차단이 이를 원천 봉쇄) ② 부모/링크 변경은 트리 구조 재계산이라 부분 낙관 캐시 패치가 복잡·취약. → `onSettled: invalidate` 단일 경로. 편집 빈도 낮아 ~1패스 재조회 비용 수용.
- 트레이드오프: 드래그 후 화살표/중첩이 **서버 확정+재조회 후(~수백 ms~1s) 나타남**(intercept로 로컬 즉시반영 없음). 무효 상태 0 보장과 맞바꾼 의도된 선택.

#### D-4. ⚠️ 부모 해제 의미론 주의 (구현·검증 공유)
`setGanttParent(parentKey=null)`은 **WBS override 해제**이지 "강제 루트"가 아니다. 해제 후 `effectiveParent`는 §6대로 **jiraParent로 폴백**(jiraParent 있으면 루트로 안 감). move-task로 task를 루트로 끌어도, 그 이슈에 jiraParent가 있으면 재조회 시 다시 jiraParent 밑으로 돌아간다. → **정상 동작**(MVP). "Jira 계층에서도 떼어내기"는 별도 sentinel 필요(M4). 검증자/프론트는 이 거동을 버그로 오판 말 것. (InfoTip 안내는 M4 선택.)

---

### E. 작업 분해 + seed 권한 + 무회귀

#### E-1. backend 체크리스트 (파일별)
- [ ] `src/utils/errors/ErrorCodes.js` — `:48-49` 주석 → `GANTT_CYCLE_DETECTED`/`GANTT_SELF_REFERENCE`/`GANTT_CROSS_PROJECT_REF` 3종 실코드 추가(C-2).
- [ ] `src/resolver/gantt/GanttValidationService.js` (신규) — `detectTreeCycle`/`detectDagCycle` 순수함수(C-1).
- [ ] `src/resolver/gantt/GanttService.js` (수정) — `setGanttParent`/`setGanttLink` 추가. 공통: getAppFieldIds→getProjectGanttIssues→buildTasksAndLinks로 그래프 조달→검증→PUT→`{content:{...}}` 반환(A). `serializePredecessors` 단일 추상화(B-1)·`PREDECESSORS_AS_STRING` 토글 배치. 부모 write=`{ [wbsParentFieldId]: parentKey||null }`; 링크 write=target의 predecessors upsert/remove 후 `{ [predecessorsFieldId]: serialize(next) }`.
- [ ] `src/resolver/gantt/GanttController.js` (수정) — `setGanttParent`/`setGanttLink` 2개 `resolver.define`(responseWrapper) 추가(M3-0 ①). import 갱신.
- [ ] `src/resolver/gantt/__test__/GanttValidationService.test.js` (신규) — C-4.
- [ ] (게이트) deploy 후 B-2 PoC → object 확정 또는 string 절체.
- **재사용(무변경)**: `IssueApi.updateIssueFields`(`:385`)·`getProjectGanttIssues`(`:342`), `FieldApi.getAppFieldIds`(`:42`), `GanttMapper.buildTasksAndLinks/parsePredecessors`. **신규 IssueApi/FieldApi 메서드 불필요** — M1/M2가 이미 깔아둠.
- **`src/index.js`**: 이미 `registerGanttController` 등록됨(`02_backend_report.md:87`) → **추가 등록 불요**(컨트롤러 내부에 함수만 추가).

#### E-2. frontend 체크리스트 (파일별)
- [ ] `static/ui/src/pages/projectDetail/gantt/useGanttMutations.js` (수정) — `useSetParent`/`useSetLink` 추가(A 훅 사양). onSettled invalidate, onError 코드별 토스트(C-3), 성공 토스트 없음.
- [ ] `static/ui/src/pages/projectDetail/gantt/GanttChart.jsx` (수정) — `init`의 `block` 3중(`:185-193`)을 **editable 분기**로: 무권한=종전 차단 유지, editable=`add-link`/`delete-link`/`move-task` intercept 핸들러(D-2)로 대체. 신규 props `onAddLink`/`onRemoveLink`/`onSetParent`(콜백 ref로 스테일 클로저 방지 — 기존 `onScheduleChangeRef` 패턴). `SVAR_TO_LINK_TYPE` import 추가.
- [ ] `static/ui/src/pages/projectDetail/gantt/GanttPage.jsx` (수정) — `useSetParent`/`useSetLink` 인스턴스화, `handleAddLink`/`handleRemoveLink`/`handleSetParent`(canWrite 가드) 정의해 `<GanttChart>`에 전달. M2 `handleScheduleChange`와 동형.
- **무변경**: `ganttAdapter.js`(SVAR_TO_LINK_TYPE/toSvarLinks 그대로 소비), `projectKeys.js`(ganttKeys 재사용), `useGanttData.js`, 탭/권한 배선(`tabs.js`/`pages.jsx`/`ProjectDetailTabs.jsx`).

#### E-3. seed 권한 (PROJECT_GANTT) — **결정 필요, 보수적 기본값 제시**
- 현황: `SeedData.js:32-62` 권한 시드는 **전역 페이지(DASHBOARD/REPORT/WORKLOG/KANBAN/PROJECT/…)만** 가지며, **프로젝트상세 하위탭(calendar/dashboard/gantt 등)은 시드에 아예 없음**. 프론트 `permissionStore`가 미반환 PAGE_ID를 `{read:true,write:true}` 기본허용(`02_frontend_report.md:58`) → M1/M2는 이 폴백으로 동작 중.
- **확정(보수적, 형제 탭과 동형)**: M3에서 **`PROJECT_GANTT`를 seed에 추가하지 않는다**(calendar/dashboard 형제도 미시드 → 일관성·무회귀). write 게이트는 기존 `canWrite('PROJECT_GANTT')` 폴백(현재 전원 true)으로 동작.
- **단서(리더 판단)**: 만약 "Member는 Gantt 읽기전용" 같은 **차등 권한이 제품 요구**라면, 그때 `SeedData.js`의 Admin(`read:true,write:true`)·Member(`read:true,write:false`)에 `PROJECT_GANTT` 추가 + 권한관리 UI 목록(getPages류) 등록을 **별도 작업**으로 분리. M3 범위에서는 **불요**(과설계 회피). → §4/§168의 "seed 추가 필요"는 본 결정으로 **M3 비범위로 갱신**.
- getPages 등록: 현재 코드베이스에 하위탭용 getPages 패턴 부재 확인 → M3 미등록 유지(위와 동일 사유).

#### E-4. M3에서 **건드리면 안 되는 것**(무회귀 — 검증 기준)
- M1 read 경계면(`getProjectGanttData` shape, Task/Link 필드), M2 `updateGanttSchedule`(낙관적+롤백 그대로).
- R1 커스텀 마커 오버레이(`GanttChart.jsx` computeOverlay/useEffect·`gantt.css` 오버레이 규칙) — **좌표/스크롤 로직 무수정**.
- R2 progress 차단(`.wx-progress-marker{display:none}` + `touchesSchedule` 가드), R3 성공토스트 제거.
- 공통 페치 경로(`getProjectIssuesByFilter` 등) 미오염, 전 호출 `as='user'`([[feedback_no_asapp]]), 전용 페처 격리.
- `ganttAdapter.toSvarTasks/toSvarLinks` 출력 계약, `unwrapGanttPayload` 폴백.
- **검증자(integration-verifier) 교차 기준**: 본 §A 표(2 함수 shape) ↔ `useSetParent`/`useSetLink` 소비 ↔ `GanttController` 등록 ↔ intercept 핸들러 payload(D-1) ↔ ErrorCodes(C-2)↔토스트키(C-3). jest(검증 순수함수)·build 무회귀.
