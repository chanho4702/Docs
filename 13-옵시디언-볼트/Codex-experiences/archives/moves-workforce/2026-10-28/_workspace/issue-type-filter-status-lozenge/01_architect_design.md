# 작업관리 이슈 타입 필터 + 상태 표시 컴포넌트 통일 — 설계서 (RFC-199)

작성: 2026-09-07 · 브랜치 `RFC-199`(develop 기준)
입력: `_workspace/issue-type-filter-status-lozenge/00_input/requirement.md`
성격: **프론트 전용** — 백엔드 0줄(§3에서 근거 제시)

---

## 0. 가정 (사용자 확인 불가 → 보수적 해석. 구현 중 이견이 생기면 여기부터 본다)

| # | 가정 | 근거 / 대안 |
|---|------|------------|
| A1 | 이슈 타입 필터의 **매칭 단위는 이슈 타입 "이름"**(id 아님) | 간트 `Task` 계약에 issue type **id 가 없다**(`GanttMapper.js:127-128` — `name`/`iconUrl`만). 목록 뷰도 JQL `issuetype IN ("Task","Story")` 가 이름으로 매칭된다. 팀 관리형 프로젝트는 같은 이름의 타입이 프로젝트마다 별도 id 로 생기므로, **id 로 필터하면 멀티 스페이스 프로젝트에서 같은 "Task"가 갈라진다** — 이름 매칭이 오히려 정확하다. |
| A2 | 상태 배지의 **라벨 의미는 바꾸지 않는다**. 현재 앱은 대부분 `statusCategory.name`("진행 중")을 그리고 실제 상태명("코드 리뷰")은 안 그린다 → 그대로 둔다 | 실제 상태명을 그리려면 간트 `Task` 계약에 `status:{name}` 추가(백엔드) + 10개 호출부 수정이 필요하다. RFC-199 범위는 **외형 통일**이다. 후속 RFC 후보로 §9에 남긴다. |
| A3 | 프로젝트 상태 커스텀 색은 **10개 accent 계열로 수렴**하고 Light 변형은 base 와 같게 렌더한다 | 현행 `StatusBadge.jsx`의 `ACCENT_NAME` 이 **이미 그렇게 동작한다**(21색 → 10계열). 무회귀. |
| A4 | 목록 뷰 이슈 타입 옵션은 **현재 프로젝트에 실제로 존재하는 타입**만 보여준다 | §2-2에서 4개 후보를 비교해 결정. 별도 네트워크 호출 0회. |
| A5 | 셸(트리·간트·맵) 필터 UI는 기존 3개 툴바에 각각 추가한다(공용 필터바로 추출하지 않음) | 담당자/상태 `Select` 가 이미 3곳에 복제돼 있다. 이번 RFC 는 상태 표시 30여 파일을 동시에 건드리므로, 툴바 3개 통합 리팩토링까지 얹으면 회귀 표면이 두 배가 된다. §9 후속 제안. |
| A6 | `@atlaskit/lozenge` 를 **신규 설치**한다(`^15.4.1`) | §4-1에 호환성·리스크 검증 결과. 설치 자체는 frontend-engineer 몫. |

---

## 1. 개요 / 영향 범위

### 1-1. 두 갈래 작업

* **F1. 이슈 타입 필터** — 작업관리 탭 4개 뷰 전부(목록 | 트리 | 간트 | 맵)
* **F2. 상태 표시 통일** — Jira 이슈 상태 + 프로젝트 상태, 앱 전역

두 작업은 **파일이 겹치지 않는다**(F1=필터/툴바, F2=배지). 병렬 착수 가능하나, 한 지점만 겹친다: `pages/projectDetail/issue/ProjectFilter.jsx`(F1 추가) ↔ `ProjectIssueTable.jsx`(F2 교체) — 서로 다른 파일이므로 충돌 없음.

### 1-2. 영향 범위

| 축 | 내용 |
|----|------|
| **백엔드** | **0줄.** 간트 `Task` 계약에 `issueType`·`issueTypeIcon`이 이미 있고(`GanttMapper.js:127-128`, `GANTT.md` §3), 목록 뷰는 `IssueApi.js:329`의 `fields` 에 `issuetype` 이 이미 포함돼 있다. 포트폴리오 `statusColor` 도 이미 응답에 있다(`PortfolioDashboardService.js:221`). §3 참조 |
| **DB** | 변경 없음(MySQL/KVS 모두) |
| **프론트 신규 파일** | `components/filter/issueType.js`(순수) · `components/filter/__test__/issueType.test.js` · `components/lozenge/statusAppearance.js`(순수) · `components/lozenge/__test__/statusAppearance.test.js` · `components/lozenge/StatusLozenge.jsx`(신규 정의) |
| **프론트 삭제 파일** | `constants/statusColorMap.js` · `components/lozenge/StatusBadge.jsx` |
| **프론트 이름 변경** | `components/lozenge/StatusLozenge.jsx`(현행, 의미 배지) → `components/lozenge/SemanticLozenge.jsx` |
| **프론트 수정 파일** | F1: 6개 · F2: 24개 (§5·§6 표) |
| **의존성** | `@atlaskit/lozenge@^15.4.1` 신규 설치(§4-1) |
| **i18n** | `locales/kr\|en/gantt.json` +1키 · `locales/kr\|en/projectDetail.json` +3키 (§7) |
| **권한** | 변경 없음. 새 resolver 없음 → `PermissionMap.js` 무변경 |
| **쿼리키** | 신규 없음(§2-2에서 별도 네트워크 호출을 만들지 않기로 결정) |

---

## 2. F1 — 이슈 타입 필터

### 2-0. 왜 두 갈래인가

작업관리 탭은 데이터 소스가 둘이다(`WORK_VIEWS.md` §1-2).

```
목록(table)  ← executeRequest('searchIssueWithJQL')   서버 JQL       → 필터 축 = JQL 문자열
트리/간트/맵 ← invoke('getProjectGanttData')          클라이언트 필터 → 필터 축 = tasks[] 술어
```

셸(`ProjectWorkPanel`)은 후자 3개의 필터 **상태만** 소유하고 목록 뷰와는 공유하지 않는다. 이 규칙을 유지한다.

### 2-1. 셸 필터(트리·간트·맵)

#### (a) 순수 로직 — 신규 모듈 `components/filter/issueType.js`

`components/filter/projectSpace.js`(스페이스 필터)와 **완전히 같은 구조**로 만든다. 옵션 유도는 `components/filter/`, 매칭 술어도 `components/filter/`, 결합은 `workFilterOptions.js` — 스페이스 필터의 기존 3분할을 그대로 따른다.

```js
// static/ui/src/components/filter/issueType.js  (React/스토어 의존 0 — jest 대상)

/** Select 옵션 객체({value}) 든 원시값이든 값만 뽑는다. */
export const toTypeNameSet = (options) => Set<string>;

/**
 * 이슈 타입 옵션 — 로드된 아이템에서 유도(별도 API 없음).
 * accessor 를 받는 이유: 셸(간트 Task: issueType/issueTypeIcon)과
 * 목록 뷰(Jira 검색 응답: fields.issuetype.{name,iconUrl}) 의 shape 이 다르다.
 * @param {Array}  items
 * @param {(it)=>string|null} [getName]  기본값 (it)=>it?.issueType
 * @param {(it)=>string|null} [getIcon]  기본값 (it)=>it?.issueTypeIcon
 * @returns {[{ value:string, label:string, iconUrl:string|null }]}
 *          value=label=타입명. 중복 제거(첫 non-null 아이콘 채택), label 오름차순(localeCompare)
 */
export const deriveIssueTypeOptions = (items, getName, getIcon) => [...];

/** 타입명이 선택 집합을 통과하는지. 빈 집합 = 전체 통과. null 이름은 특정 선택 시 제외. */
export const matchesIssueTypes = (issueTypeName, names) => boolean;

/**
 * JQL 문자열 리터럴로 감싼다. generateJQL(jqlMaker.js)은 값을 **그대로 이어 붙이므로**
 * 따옴표는 생산자가 붙여야 한다(assignee 의 membersOf("x") 와 같은 규약).
 * @returns `"Story"` 형태. 내부 `"` 와 `\` 는 백슬래시 이스케이프
 */
export const quoteJqlValue = (raw) => string;
```

#### (b) `workFilterOptions.js` — `issueTypes` 축 추가

```js
import { matchesIssueTypes, toTypeNameSet } from '../../../components/filter/issueType';

export const filterGanttTasks = (tasks = [], filters = {}) => {
    const assigneeIds  = toValueSet(filters.assignees);
    const statusKeys   = toValueSet(filters.statuses);
    const issueTypes   = toTypeNameSet(filters.issueTypes);   // ← 신규
    ...
    return (tasks ?? []).filter((task) => {
        if (assigneeIds.size && !assigneeIds.has(task?.assignee?.accountId)) return false;
        if (statusKeys.size  && !statusKeys.has(task?.statusKey)) return false;
        if (!matchesIssueTypes(task?.issueType, issueTypes)) return false;   // ← 신규
        if (!matchesProjectKeys(task?.project?.key, filters.projectKeys)) return false;
        if (keyword) { ... }
        return true;
    });
};
```

`deriveStatusOptions` 에 **선택 2번째 인자**를 추가한다(아래 (d)의 GanttPage 흡수 때문. 기본 동작 무변경):

```js
/** @param {(key:string)=>string} [translateKey] statusCategory.name 이 없을 때의 라벨 폴백 */
export const deriveStatusOptions = (tasks = [], translateKey) => ...
//   label = task.statusCategory?.name || translateKey?.(key) || key
```

#### (c) 셸 state·prop 계약 (`ProjectWorkPanel.jsx`)

기존 `selectedAssignees`/`selectedStatuses` 와 **완전히 대칭**으로 추가한다.

```js
const [selectedIssueTypes, setSelectedIssueTypes] = useState([]);   // Select 옵션 배열 [{value,label,iconUrl}]
```

| 뷰 | 내려주는 prop |
|----|--------------|
| `ProjectTreeView` | `selectedIssueTypes={selectedIssueTypes}` · `onIssueTypeChange={setSelectedIssueTypes}` |
| `ProjectIssueMapView` | 위와 동일 |
| `GanttPage` | `filter={{ ..., issueTypes: selectedIssueTypes, setIssueTypes: setSelectedIssueTypes }}` |

`GanttPage` 는 `filter` prop 미주입 시 로컬 state 폴백을 유지한다(`WORK_VIEWS.md` §1 하위호환 계약) → `issueTypes` 도 동일하게 로컬 폴백을 둔다.

#### (d) 뷰별 수정

| 파일 | 수정 |
|------|------|
| `pages/projectDetail/work/ProjectTreeView.jsx` | `deriveIssueTypeOptions(tasks)` 유도 → `TreeStructurePanel` 로 전달, `filterGanttTasks(tasks, { ..., issueTypes })` |
| `pages/projectDetail/work/TreeStructurePanel.jsx` | 상태 `Select` 옆에 이슈 타입 `Select` 추가(아래 (e)) |
| `pages/projectDetail/work/map/ProjectIssueMapView.jsx` | 트리와 동일 |
| `pages/projectDetail/work/map/IssueMapToolbar.jsx` | 트리와 동일 |
| `pages/projectDetail/gantt/GanttPage.jsx` | **인라인 필터 로직을 `workFilterOptions.js` 로 흡수한다**(아래 주의) |
| `pages/projectDetail/gantt/GanttToolbar.jsx` | 트리와 동일 |

> **주의 — GanttPage 는 "3번째 복사본"이다.**
> `workFilterOptions.js` 의 docblock 은 자신이 단일 출처라고 적혀 있으나 **실제로는 트리·맵만** 쓴다.
> `GanttPage.jsx:146-176` 이 `assigneeOptions`/`statusOptions` 를 인라인으로 다시 만들고,
> `GanttPage.jsx:193-200` 이 `tasks.filter(...)` 술어를 다시 쓴다.
> 여기에 이슈 타입 축을 그냥 얹으면 **4번째 축이 2벌**이 된다.
> → GanttPage 를 `deriveAssigneeOptions` / `deriveStatusOptions(tasks, k => t('gantt.status.'+k))` /
>   `deriveIssueTypeOptions` / `filterGanttTasks` 로 교체한다.
> 동작 동일성 근거: 인라인 담당자 유도는 `deriveAssigneeOptions` 와 문자 단위로 동일하고, 상태 유도는
> `t('gantt.status.'+key)` 폴백만 다르며 (b)의 `translateKey` 인자로 보존된다. 필터 술어도 동일
> (간트 툴바에는 검색어가 없어 `search` 는 undefined → 전체 통과).

#### (e) Select 컨트롤 (3개 툴바 공통 형태)

기존 담당자 `Select` 와 **같은 컴포넌트·같은 옵션 shape** 를 쓴다. 아이콘은 담당자 아바타와 같은 방식(`@atlaskit/avatar`, `appearance="square"`).

```jsx
<Select
    inputId="work-tree-issuetype"          // 맵: work-map-issuetype / 간트: gantt-filter-issuetype
    isMulti
    spacing="compact"
    options={issueTypeOptions}
    value={selectedIssueTypes}
    onChange={(v) => onIssueTypeChange?.(v ?? [])}
    placeholder={t('gantt.filter.issueType')}
    formatOptionLabel={(opt) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Avatar appearance="square" size="xsmall" src={opt?.iconUrl || undefined} name={opt?.label} />
            <span style={{ fontSize: 12 }}>{opt?.label}</span>
        </span>
    )}
/>
```

* `GanttToolbar` 만 `isClearable` 를 쓰고 아바타가 `size="small"` 이다 → 그 파일에서는 기존 관례를 따른다.
* 배치: 담당자 → 상태 → **이슈 타입** → 스페이스(`ProjectFilterDropdown`) 순.
* 아이콘 URL 은 Jira 사이트의 절대 URL 이다. 같은 드롭다운의 담당자 아바타(`assignee.avatarUrl`)·스페이스 아바타가 이미 같은 방식으로 로드되므로 CSP 리스크는 신규가 아니다 — 다만 배포 검증 항목에 남긴다(§8).

### 2-2. 목록 뷰(JQL)

#### (a) 옵션 출처 결정 — 4개 후보 비교

| # | 후보 | 판정 |
|---|------|------|
| C1 | `GET /rest/api/3/issuetype` (사이트 전체) 후 이름 중복 제거 | **기각.** 팀 관리형 프로젝트마다 자체 타입이 생기므로 사이트 전체 목록은 이 프로젝트에 없는 타입까지 노출한다. 고르면 결과 0건 — 필터가 거짓말을 한다 |
| C2 | 스페이스별 `GET /rest/api/3/project/{key}` 의 `issueTypes` 합집합 (`SubscriptionSourceApi.js:74-87` 전례) | **기각.** RMS 프로젝트는 여러 Jira 스페이스에 걸친다(RFC-171 구독). 스페이스 목록을 알아야 하는데 `ProjectFilter` 의 스페이스 드롭다운은 *검색*이지 이 프로젝트의 스페이스 목록이 아니다. 스페이스 수만큼 요청 N회 |
| C3 | 기존 resolver `getSourceIssueTypes` 재사용 | **기각.** `sourceType`/`sourceId`(단일 스페이스) 필수. 구독으로 들어온 이슈만 커버하고 수동 추가 이슈를 놓친다 |
| **C4** | **목록 뷰의 요약(summary) 질의 결과에서 유도** | **채택** |

**C4 근거**

1. **네트워크 0회 추가.** `useWorkListSummary` 가 이미 프로젝트 전체 이슈를 페이징으로 훑는다(`workListQuery.js`: `SUMMARY_PAGE_SIZE=100`, `MAX_PAGES=20`, `MAX_ISSUES=2000`). `SUMMARY_FIELDS` 에 `'issuetype'` **한 단어를 더하면** 같은 요청에서 타입이 따라온다.
2. **정확하다.** 이 프로젝트에 실제로 존재하는 타입만 나온다. 멀티 스페이스·팀 관리형 모두 자동으로 커버된다(이슈가 있는 곳이 곧 소스).
3. **4개 뷰가 같은 철학이 된다.** 셸 3뷰도 "로드된 데이터에서 유도"다 → `deriveIssueTypeOptions` **단일 함수를 4개 뷰가 공유**한다. 담당자·스페이스 필터가 이미 쓰는 규약이다.

**C4 의 함정 2개와 대응**

| 함정 | 대응 |
|------|------|
| **자기 필터링** — 이슈 타입으로 필터하면 요약 결과가 줄고 → 옵션이 사라져 → 선택을 되돌릴 수 없다 | 옵션 = `deriveIssueTypeOptions(summaryIssues)` **∪ 현재 선택값**. `ProjectIssuePanel` 에서 union 한다. 3줄 |
| 2000건 상한 초과 시 뒷부분 타입 누락 | 기존 그룹 카운트도 같은 상한을 쓴다(무회귀). 상한 상수는 `workListQuery.js` 의 `MAX_ISSUES` 하나를 공유 |

#### (b) `SUMMARY_FIELDS` 변경

```js
// pages/projectDetail/issue/workListQuery.js
export const SUMMARY_FIELDS = ['project', 'status', 'issuetype'];   // ← issuetype 추가
```
쿼리키(`workListKeys.summary(projectId, filter)`)에 fields 가 들어가지 않으므로 키 변경 없음(배포 직후 1회 재조회만 발생).

#### (c) JQL 조립 계약 — **따옴표는 생산자가 붙인다**

`generateJQL`(`utils/jiraApi/jqlMaker.js`)은 값을 **가공 없이 이어 붙인다**:

```js
part = `${key} IN (${value.map(v => `${v}`).join(', ')})`;   // 따옴표 없음
```

그래서 `assignee` 는 `membersOf("group")` 를 미리 조립해 넣고 `statusCategory` 는 `new`/`done` 같은 bare 토큰만 쓴다.
이슈 타입 이름은 공백·한글·괄호를 포함하므로 **반드시 `quoteJqlValue()` 로 감싼 값을 `addJqlMap` 에 넣는다.**

```js
addJqlMap('issuetype', { state: '=', value: selectedNames.map(quoteJqlValue) });
// → generateJQL 결과: issuetype IN ("Story", "버그")           (2개 이상)
//                     issuetype = "Story"                      (1개)
```

`normalizeJqlMap` 이 value 배열을 정렬하므로(따옴표 포함 문자열 정렬) 쿼리키 서명도 안정적이다.

#### (d) 컨트롤 — `ProjectFilter.jsx` 내부 로컬 컴포넌트

`StatusCategoryFilter`(같은 파일, `DropdownMenu` + `DropdownItemCheckbox`)를 **그대로 본뜬다**. 차이는 옵션이 고정 3개가 아니라 prop 으로 들어오고 아이콘이 붙는 것뿐이다. 이름은 `IssueTypeJqlFilter`(export 하지 않음 — 구독 기능의 `subscription/IssueTypeFilter.jsx` 와 혼동 방지).

```jsx
// components/project/ProjectFilter.jsx
export const ProjectFilter = ({
    addJqlMap,
    subscribedSpaces = [],
    selectedSpaceKeys = null,
    issueTypeOptions = [],          // ← 신규. [{value,label,iconUrl}]
}) => { ... }
```

* 옵션 0개면 컨트롤을 **렌더하지 않는다**(요약 로딩 전 빈 드롭다운 방지).
* 트리거 라벨: 선택 0 → `t('projectDetail.filter.issueType.trigger')`, 1 → 그 타입명, 2+ → `projectDetail.filter.issueType.selected`({n} 치환). `ProjectFilterDropdown` 의 기존 관례와 동일.
* 배치: 스페이스 → 담당자 → 상태 → **이슈 타입** (셸 3뷰와 동일 순서).

#### (e) `ProjectIssuePanel.jsx`

```js
const summary = useWorkListSummary({ projectId: project_id, filter });

// 옵션 = 요약 결과에서 유도 ∪ 현재 선택 (자기 필터링 방지 — §2-2(a))
const issueTypeOptions = useMemo(() => {
    const derived = deriveIssueTypeOptions(
        summary.data?.issues ?? [],
        (i) => i?.fields?.issuetype?.name,
        (i) => i?.fields?.issuetype?.iconUrl,
    );
    const seen = new Set(derived.map(o => o.value));
    const pinned = selectedIssueTypeNames.filter(n => !seen.has(n)).map(n => ({ value:n, label:n, iconUrl:null }));
    return [...derived, ...pinned].sort((a,b) => a.label.localeCompare(b.label));
}, [summary.data, selectedIssueTypeNames]);
```
> `summary.data` 에서 원본 issues 배열에 접근 가능한지 구현 시 확인할 것. `buildGroups` 가 집계만 반환하고 원본을 버린다면 `fetchWorkListSummary` 가 이슈 타입 옵션을 **함께 반환**하도록 확장한다(`{ groups, issueTypeOptions }`) — 원본 2000건을 캐시에 들고 있는 것보다 낫다. 이 경우 `deriveIssueTypeOptions` 호출 위치만 `useWorkListQueries.js` 로 옮기고 계약은 동일하다.

---

## 3. 백엔드 설계 — 변경 없음 (근거)

| 요구 | 이미 존재하는가 | 확인 지점 |
|------|----------------|-----------|
| 셸 3뷰 이슈 타입 | **예** — `Task.issueType`(name), `Task.issueTypeIcon`(iconUrl) | `src/resolver/gantt/GanttMapper.js:127-128`, `GANTT.md` §3 Task, 페치 필드에 `issuetype` 포함(`src/api/jira/issue/IssueApi.js:364`) |
| 목록 뷰 이슈 타입 | **예** — 목록 뷰는 프론트가 `executeRequest('searchIssueWithJQL')` 로 Jira 를 직접 호출한다. `fields` 는 프론트(`SUMMARY_FIELDS`)가 정한다 | `pages/projectDetail/issue/useWorkListQueries.js`, `workListQuery.js` |
| 포트폴리오 프로젝트 상태 색 | **예** — `statusColor` 가 이미 응답에 있다. 프론트가 전달을 빠뜨린 것 | `src/resolver/portfolioDashboard/PortfolioDashboardService.js:221` |

**하지 않기로 한 백엔드 변경 2건**(§9에 후속 후보로 기록)

1. `Task` 에 `status:{ name }` 추가 — 실제 상태명 표시용. 가정 A2 로 이번 범위에서 제외.
2. `ResourceLoadFetcher.js` 응답에 `statusCategoryKey` 추가 — `fetchInProgressIssuesForAccount` 의 JQL 이 **진행 중 이슈만** 뽑으므로 카테고리는 항상 `indeterminate` 로 확정된다. 프론트에서 상수로 처리하면 충분(§6-D 참조).

---

## 4. F2 — 상태 표시 통일

### 4-1. `@atlaskit/lozenge` 설치 판단 — 검증 결과

**결론: 설치한다(`^15.4.1`). 단, `appearance` 로 커스텀 색을 내지 말고 `style` 로 낸다.**

| 검증 항목 | 결과 |
|-----------|------|
| 최신 버전 | `15.4.1` (`npm view @atlaskit/lozenge version`) |
| peerDependencies | `react: ^18.2.0 \|\| ^19.0.0` → 앱 `react@^18.3.1` 호환 |
| 세대 정합 | `@atlaskit/tokens@^10`, `primitives@^17`, `icon@^30` 과 같은 현세대(Compiled 기반). 충돌 없음 |
| 외형 | 컴파일된 CSS 확인: `text-transform:uppercase` / `font-size:11px` / `font-weight:bold` / `border-radius: var(--ds-radius-small,3px)` — **Jira 상태 lozenge 그 자체** |
| `appearance` 유효값 | `default \| inprogress \| moved \| new \| removed \| success` (레거시 `ThemeAppearance`) |
| **accent 색 (`accent-blue` 등 10종)** | 타입에는 있으나 **쓸 수 없다**(아래) |
| `style={{backgroundColor,color}}` | deprecated 표기이나 **레거시·신규 두 경로 모두에서 실제로 적용된다**(published 소스 확인: 레거시 `lozenge.js`, 신규 `new/lozenge-base.js:194,233`) |

> **⚠ accent appearance 를 쓰면 안 되는 이유 (직접 확인함)**
> 패키지의 default export 는 **플랫폼 피처 플래그로 갈리는 래퍼**다:
> ```js
> // dist/cjs/lozenge.js
> var LozengeWrapper = memo(function (props) {
>   if (fg('platform-dst-lozenge-tag-badge-visual-uplifts')) return <NewLozenge {...props} />;
>   return <LegacyLozenge {...props} />;
> });
> ```
> Forge Custom UI(CRA 번들, iframe)에는 Atlassian 플랫폼 플래그 클라이언트가 부트스트랩되지 않는다 → `fg()` 는 **false** → 항상 `LegacyLozenge` 가 그려진다.
> 그리고 `LegacyLozenge` 는 유효값 밖의 appearance 를 **조용히 `default`(회색)로 떨어뜨린다**:
> ```js
> appearanceTypes.includes(appearance) || newSemanticColors.includes(appearance)
>     ? appearanceMapping[appearance] : 'default'
> ```
> → `appearance="accent-blue"` 로 프로젝트 상태를 그리면 **21색이 전부 회색으로 죽는다.** 에러도 경고도 없이.
> `style` 은 두 경로 모두 인라인으로 적용되므로 플래그가 언제 켜지든 결과가 같다. **커스텀 색은 `style` 로 낸다.**
>
> 잔여 리스크: `style` 은 v16 에서 제거 예고다. 캐럿 `^15` 안에서는 안전하며, 메이저 업그레이드 시 §4-3 의 매핑 표 한 곳만 고치면 된다(호출부 0곳).

> **부작용 1건**: `text-transform: uppercase` 는 프로젝트 상태명에도 적용된다. 한글은 무영향, 영문 상태명("Planning")은 "PLANNING" 으로 보인다. Jira 와 같은 규칙이므로 **의도된 것으로 수용**한다.

### 4-2. 모듈 구성

```
components/lozenge/
├── statusAppearance.js      ★신규  순수 매핑(React 의존 0, jest 대상)
├── StatusLozenge.jsx        ★신규 정의  ← 상태 표시 단일 진입점
├── SemanticLozenge.jsx      ←rename  (기존 StatusLozenge.jsx: success/info/error/warn 아이콘 배지)
├── SemanticBadge.jsx        무변경 (앱 판정 배지)
├── StatusTag.jsx            무변경 (테두리 태그 = 부수정보)
├── DateTag.jsx              무변경
└── StatusBadge.jsx          ✖삭제  → ProjectStatusLozenge 로 흡수
constants/statusColorMap.js  ✖삭제  → statusAppearance.js 로 흡수
```

> **이름 재사용에 대해**: 현행 `StatusLozenge.jsx` 는 이름과 달리 "상태"가 아니라 앱 판정(success/info/error/warn)을 그린다. 사용처가 2곳뿐이므로 `SemanticLozenge.jsx` 로 **기계적 rename**(내용 무변경)하고, 이름은 진짜 상태 컴포넌트에 돌려준다. 최종 네이밍이 의미와 일치하는 편이 이후 유지보수 비용이 낮다.

### 4-3. 매핑 표 두 개 — `components/lozenge/statusAppearance.js`

**(i) Jira 이슈 상태 → Lozenge appearance**

판정 우선순위: `statusCategory.key` → 없으면 `colorName` → 없으면 `default`.

| 입력 `key` | 입력 `colorName` | appearance | 색 | 비고 |
|---|---|---|---|---|
| `new` | `blue-gray` | `default` | 회색 | 할 일 |
| `indeterminate` | `yellow` | `inprogress` | 파랑 | 진행 중 — Jira 는 노랑 카테고리를 **파란 lozenge** 로 그린다 |
| `done` | `green` | `success` | 초록 | 완료 |
| — | `medium-gray` | `default` | 회색 | 카테고리 미지정 |
| — | `brown` | `moved` | 노랑 | 현행 `statusColorMap.js` 는 `brown` 과 `yellow` 를 **같은 색**으로 정의해 구분이 안 됐다 — 여기서 갈라 고친다 |
| null/미상 | null/미상 | `default` | 회색 | fail-safe |

```js
export const STATUS_APPEARANCE_BY_KEY        = { new:'default', indeterminate:'inprogress', done:'success' };
export const STATUS_APPEARANCE_BY_COLOR_NAME = { 'blue-gray':'default', 'medium-gray':'default',
                                                 yellow:'inprogress', green:'success', brown:'moved' };
/** @param {{key?:string, colorName?:string}} status @returns ThemeAppearance */
export const getStatusAppearance = (status) => ...;
```

**(ii) 프로젝트 상태 색(`COLOR_OPTIONS` value) → 인라인 색 쌍**

현행 `StatusBadge.jsx` 의 `ACCENT_NAME` + `ACCENT_STYLES` 를 **그대로 이곳으로 옮긴다**(무회귀). 21색 → 10 accent 계열, Light 변형은 base 로 수렴.

| COLOR_OPTIONS value | accent 계열 | backgroundColor | color |
|---|---|---|---|
| `standard`, `grey`, `greyLight` | gray | `color.background.accent.gray.subtlest` | `color.text.accent.gray` |
| `blue`, `blueLight` | blue | `…accent.blue.subtlest` | `color.text.accent.blue` |
| `green`, `greenLight` | green | `…accent.green.subtlest` | `color.text.accent.green` |
| `teal`, `tealLight` | teal | `…accent.teal.subtlest` | `color.text.accent.teal` |
| `purple`, `purpleLight` | purple | `…accent.purple.subtlest` | `color.text.accent.purple` |
| `red`, `redLight` | red | `…accent.red.subtlest` | `color.text.accent.red` |
| `yellow`, `yellowLight` | yellow | `…accent.yellow.subtlest` | `color.text.accent.yellow` |
| `orange`, `orangeLight` | orange | `…accent.orange.subtlest` | `color.text.accent.orange` |
| `magenta`, `magentaLight` | magenta | `…accent.magenta.subtlest` | `color.text.accent.magenta` |
| `lime`, `limeLight` | lime | `…accent.lime.subtlest` | `color.text.accent.lime` |
| 미지정/미매핑 | — | `color.background.neutral` | `color.text.subtle` |

> 폴백이 바뀐다: 현행 `DEFAULT_STYLE` 은 information(파랑)이라 **색 없는 프로젝트 상태가 "진행 중"처럼 보였다**. 중립 회색으로 바꾼다. 이 폴백에 의존하던 유일한 지점(`PortfolioProjectTable`)은 §6에서 `statusColor` 를 넘기도록 고치므로 실제로 폴백을 타지 않는다.
>
> **왜 Lozenge appearance 6종으로 접지 않았나**: 프로젝트 상태 색은 관리자가 백오피스에서 **직접 고른 값**이고 등록/편집 모달이 그 색을 미리보기로 보여준다. 6종으로 접으면 teal/magenta/lime/orange/purple 이 서로 구분되지 않아 "고른 색과 다른 색이 나오는" 화면이 된다. `style` 경로는 §4-1에서 플래그 무관하게 동작함을 확인했으므로 정보 손실 없이 Lozenge 외형(높이·굵기·대문자·radius)을 그대로 얻는다.

**(iii) 부산물 — 파생 상수 2개** (지금 흩어진 팔레트를 이 파일 하나로 모은다)

```js
/** DOM 용 카테고리 계열 토큰 — 캘린더 색 바, 그룹 카드 점, 맵 카드 스트립이 공유 */
export const STATUS_FAMILY = { default:'neutral', inprogress:'information', success:'success' };

/** ECharts(canvas) 전용 raw hex — token() 은 CSS var 문자열이라 canvas 가 해석하지 못한다 */
export const STATUS_CHART_HEX = { new:'#8590A2', indeterminate:'#0C66E4', done:'#22A06B' };
```

### 4-4. 공용 컴포넌트 계약 — `components/lozenge/StatusLozenge.jsx`

**한 파일 / 한 렌더러 / 입력 shape 별 진입점 2개.**

```jsx
import Lozenge from '@atlaskit/lozenge';

/** (a) Jira 이슈 상태 */
export const IssueStatusLozenge = ({ status, maxWidth = 160 }) => { ... }
/** (b) 프로젝트 상태 */
export const ProjectStatusLozenge = ({ name, color, maxWidth = 160 }) => { ... }
```

| 진입점 | props | 렌더 | 빈 값 |
|--------|-------|------|------|
| `IssueStatusLozenge` | `status: { name, key?, colorName? }` · `maxWidth?: number` | `<Lozenge isBold appearance={getStatusAppearance(status)} maxWidth={maxWidth}>{status.name}</Lozenge>` | `status` 또는 `status.name` 없으면 `null` |
| `ProjectStatusLozenge` | `name: string` · `color?: COLOR_OPTIONS value` · `maxWidth?: number` | `<Lozenge isBold style={getProjectStatusStyle(color)} maxWidth={maxWidth}>{name}</Lozenge>` | `name` 빈 값이면 `<>-</>` (현행 `StatusBadge` 동작 승계) |

> **왜 props 하나로 합치지 않았나**
> 한 컴포넌트에 두 종류 객체를 넘기는 구조는 이 리포에서 이미 사고를 냈다 — `ScopeSplitCell` 이 `candidate.project` 와 `candidate.company` 양쪽에 재사용되면서 한쪽에만 있는 필드가 `?? 0` 에 먹혀 **에러 없이** 오표기됐다(CLAUDE.md 변경 이력 2026-07-22). 진입점을 나누면 잘못된 shape 이 호출 지점에서 드러난다. 렌더러·매핑·외형은 한 파일에 있으므로 "상태 표시 컴포넌트 1개" 요구는 충족된다.

`isBold` 는 두 경로 모두에 넘긴다: 레거시 경로는 기본이 subtle(테두리형)이라 명시해야 Jira 룩이 되고, 신규 경로는 이미 bold 라 무해하다.

### 4-5. 캘린더 (`components/calendar/statusAccent.js`)

캘린더는 이벤트 칩이라 Lozenge 를 못 쓴다. 현행 색은 **이미** `neutral`/`information`/`success` 계열이라 §4-3(i)의 appearance 3종과 정확히 대응한다 → **색 자체는 무변경**, 두 가지만 고친다.

1. **키를 `statusCategory.key` 로도 받는다.** 현재는 `colorName` 전용이라 `key` 만 있는 호출부가 폴백(회색)으로 떨어진다.
   → `getCalendarStatusAccent(status)` 가 `getStatusAppearance(status)` 로 appearance 를 구하고 `STATUS_FAMILY[appearance]` 로 색 묶음을 고르게 바꾼다(매핑 단일 출처화). 하위호환을 위해 문자열 인자(colorName)도 계속 받는다.
2. **`FALLBACK_ACCENT` 를 `default`(neutral) 와 같게 맞춘다** — 현재 폴백만 `neutral.subtle` 이라 미묘하게 다르다.

**lazy 경계 준수**: `statusAccent.js` 는 지금처럼 `FullCalendar.jsx` 를 import 하지 않는다. 새로 import 하는 `statusAppearance.js` 도 **순수 상수 모듈**(React·Atlaskit 컴포넌트 의존 0, `@atlaskit/tokens` 만)이므로 캘린더 스택이 main 번들로 끌려오지 않는다. 역방향도 금지: `StatusLozenge.jsx` 는 `components/calendar/*` 를 절대 import 하지 않는다.

---

## 5. 경계면 계약 (백엔드 resolver 없음 → 컴포넌트 props + 순수 함수 계약이 대신한다)

### 5-1. 컴포넌트 props 계약

| 컴포넌트 | 파일 | props | 렌더 결과 | 소비처 수 |
|---|---|---|---|---|
| `IssueStatusLozenge` | `components/lozenge/StatusLozenge.jsx` | `{ status: { name:string, key?:'new'\|'indeterminate'\|'done', colorName?:string }, maxWidth?:number }` | `<Lozenge isBold appearance={default\|inprogress\|success\|moved}>` · status/name 없으면 `null` | 12 |
| `ProjectStatusLozenge` | 〃 | `{ name:string, color?:COLOR_OPTIONS.value, maxWidth?:number }` | `<Lozenge isBold style={{backgroundColor,color}}>` · name 빈값이면 `-` | 11 |
| `ProjectFilter` | `components/project/ProjectFilter.jsx` | 기존 + `issueTypeOptions?: [{value,label,iconUrl}]` (기본 `[]`) | 옵션 0개면 이슈 타입 컨트롤 미렌더 | 1 |
| `TreeStructurePanel` / `IssueMapToolbar` / `GanttToolbar` | 각 파일 | 기존 + `issueTypeOptions: [{value,label,iconUrl}]` · `selectedIssueTypes: Option[]` · `onIssueTypeChange: (Option[])=>void` | 멀티 `Select` | 3 |
| `GanttPage` | `pages/projectDetail/gantt/GanttPage.jsx` | `filter.issueTypes: Option[]` · `filter.setIssueTypes: fn` (미주입 시 로컬 state 폴백) | — | 1 |

### 5-2. 순수 함수 계약

| 함수 | 파일 | 입력 | 출력 |
|---|---|---|---|
| `deriveIssueTypeOptions(items, getName?, getIcon?)` | `components/filter/issueType.js` | 임의 배열 + accessor 2개(기본: `it.issueType` / `it.issueTypeIcon`) | `[{ value:string, label:string, iconUrl:string\|null }]` — 이름 중복 제거(첫 non-null 아이콘), label 오름차순 |
| `matchesIssueTypes(name, names)` | 〃 | `string\|null`, `Set\|Array\|falsy` | `boolean`. 빈 집합 = `true`. `name==null` 이고 집합이 비지 않으면 `false` |
| `toTypeNameSet(options)` | 〃 | `[{value}]` 또는 `[string]` 또는 falsy | `Set<string>` |
| `quoteJqlValue(raw)` | 〃 | `string` | `"…"` — `\` → `\\`, `"` → `\"` 이스케이프 후 큰따옴표로 감쌈 |
| `getStatusAppearance(status)` | `components/lozenge/statusAppearance.js` | `{key?, colorName?}` 또는 `null` | `'default'\|'inprogress'\|'success'\|'moved'` |
| `getProjectStatusStyle(color)` | 〃 | `COLOR_OPTIONS.value` 또는 falsy | `{ backgroundColor:string, color:string }` |
| `deriveStatusOptions(tasks, translateKey?)` | `work/workFilterOptions.js` | 기존 + 라벨 폴백 함수(선택) | 기존과 동일 shape. `translateKey` 미전달 시 **현행과 동일 동작** |
| `filterGanttTasks(tasks, filters)` | 〃 | `filters.issueTypes` 축 추가 | 기존과 동일. 빈 축은 전체 통과 |

### 5-3. JQL 계약 (목록 뷰)

| jqlMap 키 | 값 shape | `generateJQL` 출력 |
|---|---|---|
| `issuetype` | `{ state:'=', value:['"Story"','"버그"'] }` — **따옴표 포함 문자열** | `issuetype IN ("Story", "버그")` |
| `issuetype` (1개) | `{ state:'=', value:['"Story"'] }` | `issuetype = "Story"` |
| `issuetype` (0개) | 키 자체를 넣지 않음(또는 `value:[]`) | 조건 생략(`normalizeJqlMap` 이 제거) |

---

## 6. 상태 표시 지점 전수 인벤토리 — 교체 체크리스트

경로는 `static/ui/src/` 기준. **이 표가 frontend-engineer 의 작업 목록이자 verifier 의 검증 기준이다.**

### [A] Jira 이슈 상태 표시 → `IssueStatusLozenge`

| # | 파일:라인 | 현재 | 교체 후 |
|---|---|---|---|
| A1 | `components/issue/IssueComponent.js:87-118` (`StatusComponent`) | `<Box style={{bg,color}}>` + `STATUS_COLOR_MAP[colorName]` | **`StatusComponent` 삭제.** 아래 A2~A10 이 `IssueStatusLozenge` 를 직접 import |
| A2 | `pages/myPage/sections/MyIssuesPanel.jsx:136-144` | `<StatusComponent status={{name,colorName}}/>` | `<IssueStatusLozenge status={{name,colorName}}/>` |
| A3 | `pages/myWork/table/MyIssueTable.jsx:75-78,145` | `<StatusComponent status={statusCategory}/>` | `<IssueStatusLozenge status={statusCategory}/>` |
| A4 | `pages/projectDetail/dashboard/widgets/IssueListWidget.jsx:105-110` | `<StatusComponent status={{name:statusName,colorName:statusColorName}}/>` | `<IssueStatusLozenge status={{name,colorName}}/>` |
| A5 | `pages/projectDetail/gantt/GanttChart.jsx:82-83` (`StatusCell`) | `<StatusComponent status={row.statusCategory}/>` | `<IssueStatusLozenge .../>`. `maxWidth` 를 그리드 컬럼 폭에 맞춰 넘길 것 |
| A6 | `pages/projectDetail/issue/ProjectIssueTable.jsx:423` | `<StatusComponent status={issue.fields.statusCategory}/>` | `<IssueStatusLozenge .../>` |
| A7 | `pages/projectDetail/taskHistory/TaskHistoryTable.jsx:142-143` | `<StatusComponent status={it.statusCategory}/>` | `<IssueStatusLozenge .../>` |
| A8 | `pages/projectDetail/work/map/IssueCardNode.jsx:121-125` | `<StatusComponent status={card.status}/>` | `<IssueStatusLozenge .../>` |
| A9 | `pages/projectDetail/work/map/IssueMapDrawer.jsx:74` | `<StatusComponent status={card.status}/>` | `<IssueStatusLozenge .../>` |
| A10 | `pages/projectDetail/work/TreeDetailPanel.jsx:162,925` | `<StatusComponent status={...}/>` ×2 | `<IssueStatusLozenge .../>` ×2 |
| A11 | `pages/resource/overview/profile/InProgressIssueList.jsx:96-97` | `<SemanticBadge appearance="info">{it.statusName}</SemanticBadge>` — **실제 Jira 상태명을 고정 파란 배지로** 그린다(A/D 오용) | `<IssueStatusLozenge status={{ name: it.statusName, key: 'indeterminate' }}/>` + 주석: 이 목록의 JQL(`buildInProgressIssuesJql`)이 진행 중 이슈만 뽑으므로 카테고리는 확정이다. (서버가 `statusCategoryKey` 를 주게 하는 대안은 §3에서 보류) |

### [A-2] Jira 이슈 상태 색 — Lozenge 가 아닌 표현(색만 통일)

| # | 파일:라인 | 현재 | 교체 후 |
|---|---|---|---|
| A12 | `components/calendar/statusAccent.js` | colorName 전용 3키 맵 + 별도 폴백 | `getStatusAppearance` + `STATUS_FAMILY` 기반으로 재작성(§4-5). **색 값 자체는 무변경** |
| A13 | `components/calendar/FullCalendar.jsx:236-238,317-320` | `getCalendarStatusAccent(colorName)` | 인자를 status 객체로 전달(`{key,colorName}`) — 그 외 무변경 |
| A14 | `components/calendar/UnscheduledIssuesPopup.jsx:58-72` | 〃 | 〃 |
| A15 | `pages/projectDetail/calender/ProjectCalender.jsx:231-232,240-243` | 다일 이벤트 색을 **`STATUS_COLOR_MAP` 직접 참조** | `getCalendarStatusAccent(...)` 로 이관(캘린더 색은 캘린더 모듈이 단일 출처) |
| A16 | `pages/projectDetail/calender/ProjectCalender.jsx:449-451` (`CalendarLegend`) | `getCalendarStatusAccent('blue-gray'\|'yellow'\|'green').bar` | 키를 `{key:'new'}`/`{key:'indeterminate'}`/`{key:'done'}` 로 |
| A17 | `pages/myWork/WorklogPage.jsx:223-224,233-235` | `STATUS_COLOR_MAP` 직접 참조 | A15 와 동일하게 `getCalendarStatusAccent` 로 이관 |
| A18 | `pages/projectDetail/work/map/mapNodeCard.js:27-38` (로컬 `statusAccent`) | 자체 switch(3번째 팔레트) | `STATUS_FAMILY` 기반 토큰으로 교체. export 이름·시그니처는 유지(호출부 3곳 무변경) |
| A19 | `pages/projectDetail/issue/ProjectGroupCard.jsx:10-29` (`STATUS_DOT`) | 하드코딩 hex 3색(4번째 팔레트) | `STATUS_FAMILY` 기반 토큰 |
| A20 | `pages/myPage/sections/MyContributionCharts.jsx:11-12,64-68` (`STATUS_COLORS`) | 하드코딩 hex(5번째 팔레트, ECharts) | `STATUS_CHART_HEX` import. **canvas 라 token() 을 쓸 수 없으므로 hex 유지가 맞다** — 값의 출처만 단일화 |

> A18~A20 은 "5개 팔레트가 미묘하게 다른 회색/파랑/초록을 쓰던" 문제를 하나로 접는 작업이다. `IssueCardNode`/`CardProgressBar`/`IssueMapCanvas`(미니맵)는 A18 의 `statusAccent` 를 prop 으로 받아 쓰므로 **호출부 수정 불필요**.

### [B] 프로젝트 상태 표시 → `ProjectStatusLozenge`

| # | 파일:라인 | 현재 | 교체 후 |
|---|---|---|---|
| B1 | `components/lozenge/StatusBadge.jsx` | 공용 pill | **삭제.** 매핑은 `statusAppearance.js` 로 이관 |
| B2 | `backoffice/page/projectStatus/modal/edit/ProjectStatusEditModal.jsx:96` | `formatOptionLabel` → `<StatusBadge label color={option.value}/>` | `<ProjectStatusLozenge name={option.label} color={option.value}/>` — **색 선택 미리보기** |
| B3 | `backoffice/page/projectStatus/modal/regist/ProjectStatusRegistrationModal.jsx:80` | 〃 | 〃 |
| B4 | `backoffice/page/projectStatus/useProjectStatusList.js:73` | `<StatusTag label={row.name} color={row.color}/>` — **정작 상태 관리 화면만 다른 컴포넌트** | `<ProjectStatusLozenge name={row.name} color={row.color}/>` |
| B5 | `pages/myPage/sections/MyProjectsPanel.jsx:179-183` | `<StatusBadge label color/>` | `<ProjectStatusLozenge name color/>` |
| B6 | `pages/myWork/myProject/MyProjectList.jsx:175-179` | 〃 | 〃 |
| B7 | `pages/portfolio/widgets/PortfolioProjectTable.jsx:101-105` | `<StatusBadge label={p.statusName}/>` — **`color` 미전달 → 전부 파랑** | `<ProjectStatusLozenge name={p.statusName} color={p.statusColor}/>`. 서버는 이미 `statusColor` 를 준다(§3) — **버그 수정** |
| B8 | `pages/project/modal/ProjectModal.jsx:307-309` | `formatOptionLabel` → `<StatusBadge label color={option.color}/>` | `<ProjectStatusLozenge name={option.label} color={option.color}/>` |
| B9 | `pages/project/ProjectDetailDrawer.jsx:187` | `<StatusBadge label={status.name} color={status.color}/>` | `<ProjectStatusLozenge .../>` |
| B10 | `pages/project/ProjectList.jsx:65-69` | 〃 | 〃 |
| B11 | `pages/resource/assignment/projects/ProjectCard.jsx:108-112` | `<StatusBadge label={card.statusName} color={card.statusColor}/>` | `<ProjectStatusLozenge .../>` |
| B12 | `pages/resource/overview/profile/ProjectHistoryList.jsx` (52행 부근) | `projectStatusName` 을 **평문 `<span>`** 으로 표기 | `<ProjectStatusLozenge name={h.projectStatusName}/>` (색 정보 없음 → 중립 폴백). 같은 화면의 종료/진행 `SemanticBadge`(D)는 그대로 둔다 |

### [C] 집계·필터·정렬 로직 — **교체 대상 아님(손대지 말 것)**

`statusCategory` 를 조건 분기·카운트·정렬·JQL 조립에만 쓰는 지점. 표시가 아니므로 전부 무변경.

`components/project/ProjectFilter.jsx`(StatusCategoryFilter) · `components/calendar/issueEvents.js` · `pages/myPage/hooks/{useMyContribution,useMyPageIssues,useMyPageStats}.js` · `pages/myPage/sections/MyIssuesPanel.jsx:74,86` · `pages/myWork/table/MyIssueTable.jsx:102` · `pages/projectDetail/assignment/{workloadState.js,patchAssignmentCache.js}` · `pages/projectDetail/dashboard/modal/FilterBuilder.jsx` · `pages/projectDetail/gantt/ganttAdapter.js:191,374` · `pages/projectDetail/issue/{ProjectIssueTable.jsx:151,workListQuery.js}` · `pages/projectDetail/taskHistory/taskHistory.transform.js` · `pages/projectDetail/work/{buildWorkTree.js,useIssueRelations.js,workFilterOptions.js}` · `pages/projectDetail/work/map/mapNodeCard.js:56`(`toIssueCardProps`) · `utils/dashboardFilter.js` + 각 테스트

> 단 하나 예외: `pages/projectDetail/gantt/GanttPage.jsx:162-176` 의 `statusOptions` 는 [C]지만 §2-1(d)에 따라 `deriveStatusOptions` 로 흡수한다(F1 작업).

### [D] 의미 배지/태그 — **교체 대상 아님**

앱이 판정한 뜻(좋음/주의/나쁨), 마감 임박도, 커버리지, 가동률 밴드 등. `SemanticBadge`(11곳) · `SemanticLozenge`(2곳) · `StatusTag` · `DateTag` 그대로.

| 파일 | 유지 이유 |
|---|---|
| `backoffice/page/storage/StorageUsageGauge.jsx:41` | 스토리지 사용률 판정 — 상태 아님. `SemanticLozenge` 로 import 경로만 변경(rename 후속) |
| `pages/projectKanban/KanbanCard.jsx:150-158` | 마감일 임박도 — 상태 아님. 〃 |
| `analysisReport/team/TeamCoverageTable.jsx` · `assignment/candidate/*` · `assignment/queue/WorkQueueItem.jsx` · `taskHistory/TaskHistoryTable.jsx:151` · `resource/assignment/people/CompanyResourceTable.jsx` · `resource/organization/OrganizationTab.jsx` · `resource/overview/{UtilBadge.jsx,profile/InProgressIssueList.jsx:107-109,profile/ProjectHistoryList.jsx:41-43}` | 전부 앱 판정 배지 — 무변경 |

> **제안(D→통일 후보, 이번 범위 밖)**: `SemanticLozenge` 와 `SemanticBadge` 는 "아이콘 유무"만 다르다. 합칠 수 있으나 이번 RFC 의 회귀 표면을 넓히지 않기 위해 보류한다(§9).

---

## 7. i18n 키

`locales/kr/*.json` + `locales/en/*.json` 에 추가 후 `cd static/ui && npm run merge`.
`ko-KR.json`/`en-US.json` 직접 수정 금지. `locales/script/*.json` 은 빈 스텁이라 merge 소스가 아니다.

### `locales/kr/gantt.json` — `gantt.filter` (기존 `assignee`/`status` 옆)

```json
"filter": {
  "assignee": "담당자",
  "status": "상태",
  "issueType": "이슈 타입"
}
```

### `locales/en/gantt.json`

```json
"filter": {
  "assignee": "Assignee",
  "status": "Status",
  "issueType": "Issue type"
}
```

### `locales/kr/projectDetail.json` — `filter` (기존 `dropdownJql`/`statusCategory` 옆)

```json
"issueType": {
  "trigger": "이슈 타입",
  "selected": "이슈 타입 {n}개",
  "empty": "이슈 타입 없음"
}
```

### `locales/en/projectDetail.json`

```json
"issueType": {
  "trigger": "Issue type",
  "selected": "{n} issue types",
  "empty": "No issue types"
}
```

**상태 통일(F2)은 i18n 추가 0건** — 라벨이 전부 데이터(Jira status name / 프로젝트 상태 name)에서 온다.

---

## 8. 검증 기준

### 8-1. 자동

```bash
# 프론트 유닛
cd static/ui && npm test

# CI 동일 조건 빌드 + 번들 예산 게이트 (@atlaskit/lozenge 신규 설치분 영향 확인)
cd static/ui && CI=true npm run build

# 백엔드 — 이번 RFC 는 백엔드 0줄이므로 "변화 없음"이 통과 기준
npm test
```

### 8-2. 신규 jest 케이스

**`components/filter/__test__/issueType.test.js` (신규)**

| # | 케이스 |
|---|---|
| 1 | `deriveIssueTypeOptions` — 이름 중복 제거, 첫 non-null 아이콘 채택, label 오름차순 |
| 2 | 〃 — 이름이 null/빈 문자열인 항목은 제외 |
| 3 | 〃 — accessor 미전달 시 기본값(`issueType`/`issueTypeIcon`)이 간트 Task 를 처리 |
| 4 | 〃 — accessor 전달 시 목록 뷰 shape(`fields.issuetype.{name,iconUrl}`)을 처리 |
| 5 | 〃 — 빈 입력/undefined 에 크래시하지 않음 |
| 6 | `matchesIssueTypes` — 빈 집합은 전체 통과 |
| 7 | 〃 — `name===null` 이고 집합이 비지 않으면 false |
| 8 | `toTypeNameSet` — Select 옵션 배열/원시값 배열/falsy 3형태 |
| 9 | `quoteJqlValue` — `Story` → `"Story"`, 공백/한글 포함, `"` 와 `\` 이스케이프 |
| 10 | `quoteJqlValue` 결과를 `generateJQL` 에 넣으면 `issuetype IN ("A", "B")` 가 나온다(통합 1건) |

**`pages/projectDetail/work/workFilterOptions.test.js` (추가)**

| # | 케이스 |
|---|---|
| 11 | `filterGanttTasks` — `issueTypes` 단독 필터(Select 옵션 배열 `[{value:'Story'}]`) |
| 12 | 〃 — `issueTypes` 원시값 배열(`['Story']`)도 받는다 |
| 13 | 〃 — 빈 `issueTypes` 는 전체 통과 |
| 14 | 〃 — `task.issueType === null` 인 이슈는 타입 선택 시 제외된다 |
| 15 | 〃 — 담당자 × 상태 × 이슈 타입 × 스페이스 × 검색어 5축 AND 조합 |
| 16 | `deriveStatusOptions(tasks)` — 2번째 인자 미전달 시 **기존 케이스 2·"statusCategory 없으면 statusKey"가 그대로 통과**(무회귀 고정) |
| 17 | `deriveStatusOptions(tasks, translateKey)` — `statusCategory.name` 이 없을 때만 `translateKey(key)` 라벨을 쓴다 |

**`components/lozenge/__test__/statusAppearance.test.js` (신규)**

| # | 케이스 |
|---|---|
| 18 | `getStatusAppearance` — key 3종 → `default`/`inprogress`/`success` |
| 19 | 〃 — key 없고 colorName 만 있을 때 5종 매핑(`brown` → `moved` 포함) |
| 20 | 〃 — key 와 colorName 이 모두 있으면 **key 가 이긴다** |
| 21 | 〃 — null/`{}`/미상 값 → `default` (fail-safe) |
| 22 | `getProjectStatusStyle` — `COLOR_OPTIONS` 21개 value 전부가 `{backgroundColor,color}` 를 반환한다(스냅샷 아님, 존재·비어있지 않음 검사) |
| 23 | 〃 — Light 변형이 base 와 같은 결과를 준다(`blue` === `blueLight`) |
| 24 | 〃 — 미지정/미매핑 → 중립 폴백 |

### 8-3. verifier 용 "전수 교체" 확인 grep (그대로 실행)

```bash
cd C:/CloudJira/moves-workforce/static/ui/src

# 1) 삭제된 모듈의 잔존 import 는 0 이어야 한다
grep -rn "statusColorMap\|STATUS_COLOR_MAP" .            # → 0 hits
grep -rn "lozenge/StatusBadge\|from './StatusBadge'" .   # → 0 hits
grep -rn "StatusComponent" .                             # → 0 hits (IssueComponent.js 정의 포함)

# 2) 파일 자체가 지워졌는지
ls constants/statusColorMap.js components/lozenge/StatusBadge.jsx   # → No such file ×2

# 3) rename 이 완결됐는지 (구 경로 잔존 0, 신 경로 2 hits)
grep -rn "lozenge/StatusLozenge'" .                      # → StatusLozenge = 신규 상태 컴포넌트만
grep -rn "SemanticLozenge" .                             # → 정의 1 + 소비 2 = 3 hits

# 4) 상태 표시가 전부 새 컴포넌트를 지나는지 (A 12곳 + B 11곳)
grep -rn "IssueStatusLozenge" . | wc -l                  # → 정의 1 + 소비 12
grep -rn "ProjectStatusLozenge" . | wc -l                # → 정의 1 + 소비 11

# 5) 팔레트가 하나로 접혔는지 — 하드코딩 상태 hex 가 남아있지 않아야 한다
grep -rn "#8590A2\|#0C66E4\|#22A06B\|#4C9AFF\|#36B37E\|#8993A4" .
#   → statusAppearance.js 의 STATUS_CHART_HEX 3줄만 남아야 한다

# 6) lazy 경계 위반 확인 — 상태 모듈이 캘린더/차트 스택을 끌어오면 안 된다
grep -rn "fullcalendar\|@svar-ui\|@xyflow\|echarts" components/lozenge/   # → 0 hits

# 7) 이슈 타입 필터가 4개 뷰 전부에 있는지
grep -rln "issueType" pages/projectDetail/work/TreeStructurePanel.jsx \
                      pages/projectDetail/work/map/IssueMapToolbar.jsx \
                      pages/projectDetail/gantt/GanttToolbar.jsx \
                      components/project/ProjectFilter.jsx            # → 4 files

# 8) GanttPage 의 인라인 필터 복사본이 제거됐는지
grep -n "deriveAssigneeOptions\|filterGanttTasks" pages/projectDetail/gantt/GanttPage.jsx  # → 2+ hits
```

### 8-4. 수동/배포 확인 (E2E — 이번 단계에서 수행하지 않음, 인수인계 항목)

1. 작업관리 4개 뷰에서 이슈 타입 필터 선택 → 트리/간트/맵은 즉시 반영, 목록은 JQL 재조회. **뷰를 바꿔도 선택이 유지**되는지(셸 공유, 목록은 별개).
2. 목록 뷰에서 이슈 타입 1개만 선택 후 **드롭다운을 다시 열었을 때 다른 타입이 사라지지 않는지**(§2-2 자기 필터링 방지).
3. 이름에 공백·한글이 있는 이슈 타입("서비스 요청")으로 필터 시 JQL 파싱 에러가 없는지.
4. 이슈 타입 아이콘(Jira 절대 URL)이 드롭다운에 렌더되는지 — CSP 확인.
5. **팀 관리형 프로젝트**에서 4개 뷰 전부 동작하는지.
6. 프로젝트 상태 lozenge 가 백오피스에서 고른 색 그대로 나오는지(teal/magenta/lime 포함) — Lozenge 피처 플래그와 무관하게(§4-1).
7. 다크 모드에서 이슈/프로젝트 상태 lozenge 대비.
8. 포트폴리오 테이블 상태 칸이 더 이상 전부 파랑이 아닌지(B7).

---

## 9. 이번 범위에서 **하지 않기로** 한 것 (판단 근거 포함)

| 항목 | 이유 |
|---|---|
| 간트 `Task` 에 `status:{name}` 추가 → 실제 상태명 표시 | 백엔드 + 10개 호출부. RFC-199 는 외형 통일이다. 별도 RFC 후보(가정 A2) |
| `ResourceLoadFetcher` 에 `statusCategoryKey` 추가 | 해당 목록은 JQL 상 진행 중만 나오므로 현재 색이 결과적으로 맞다(§3-2) |
| 3개 툴바(`TreeStructurePanel`/`IssueMapToolbar`/`GanttToolbar`)를 공용 `WorkFilterBar` 로 추출 | 이번 RFC 가 이미 상태 표시 24파일을 건드린다. 툴바 통합까지 얹으면 회귀 표면이 두 배(가정 A5). 단, **옵션 유도·필터 술어는 이번에 단일화된다**(GanttPage 흡수 포함) — 다음에 추출할 때 훨씬 싸진다 |
| `SemanticLozenge` 를 `SemanticBadge` 로 흡수 | 아이콘 유무만 다르나 2개 화면의 시각이 바뀐다. 상태 통일과 무관한 변경을 섞지 않는다 |
| `StatusTag`/`DateTag` 통일 | "상태"가 아니라 부수정보(요구사항 §2-4가 명시적으로 제외) |
| 이슈 타입 필터를 셸↔목록 뷰 간 공유 | `WORK_VIEWS.md` §1-2 가 금지한다(필터 축이 다르다: 클라이언트 술어 vs 서버 JQL). 사용자가 목록에서 건 필터가 트리에서 다르게 동작하면 더 혼란스럽다 |

---

## 10. 구현 작업 분해

### backend-engineer

**작업 없음.** §3 의 3개 항목이 이미 백엔드에 존재함을 재확인만 한다.
만약 구현 중 서버 shape 변경이 필요해지면 **먼저 이 설계서를 갱신하고 frontend 에 통지**한다(§9의 보류 2건이 그 후보).

### frontend-engineer — F1: 이슈 타입 필터

- [ ] 1. `components/filter/issueType.js` 신규 — `deriveIssueTypeOptions` / `matchesIssueTypes` / `toTypeNameSet` / `quoteJqlValue` (§5-2)
- [ ] 2. `components/filter/__test__/issueType.test.js` 신규 — 케이스 1~10 (§8-2)
- [ ] 3. `work/workFilterOptions.js` — `filterGanttTasks` 에 `issueTypes` 축, `deriveStatusOptions` 2번째 인자 (§2-1(b))
- [ ] 4. `work/workFilterOptions.test.js` — 케이스 11~17 추가
- [ ] 5. `work/ProjectWorkPanel.jsx` — `selectedIssueTypes` state + 3개 뷰 prop 전달 (§2-1(c))
- [ ] 6. `work/ProjectTreeView.jsx` + `work/TreeStructurePanel.jsx` — 옵션 유도 + Select
- [ ] 7. `work/map/ProjectIssueMapView.jsx` + `work/map/IssueMapToolbar.jsx` — 동일
- [ ] 8. `gantt/GanttPage.jsx` — **인라인 옵션 유도·필터 술어를 `workFilterOptions` 로 교체** + 이슈 타입 축 (§2-1(d) 주의 참조)
- [ ] 9. `gantt/GanttToolbar.jsx` — Select 추가(`isClearable`, 아바타 `size="small"`)
- [ ] 10. `issue/workListQuery.js` — `SUMMARY_FIELDS` 에 `'issuetype'` 추가
- [ ] 11. `issue/ProjectIssuePanel.jsx` — `issueTypeOptions` 유도(선택값 union) + `ProjectFilter` 로 전달 (§2-2(e))
- [ ] 12. `components/project/ProjectFilter.jsx` — `issueTypeOptions` prop + 로컬 `IssueTypeJqlFilter`(따옴표는 `quoteJqlValue`) (§2-2(c)(d))
- [ ] 13. i18n — `gantt.filter.issueType`, `projectDetail.filter.issueType.*` (kr/en) → `npm run merge`

### frontend-engineer — F2: 상태 표시 통일

- [ ] 14. `npm i @atlaskit/lozenge@^15.4.1` (static/ui)
- [ ] 15. `components/lozenge/statusAppearance.js` 신규 — 매핑 2표 + `STATUS_FAMILY` + `STATUS_CHART_HEX` (§4-3)
- [ ] 16. `components/lozenge/__test__/statusAppearance.test.js` 신규 — 케이스 18~24
- [ ] 17. `components/lozenge/StatusLozenge.jsx` → `SemanticLozenge.jsx` 로 **rename**(내용 무변경) + 소비 2곳(`StorageUsageGauge`, `KanbanCard`) import 경로 수정
- [ ] 18. `components/lozenge/StatusLozenge.jsx` **신규 작성** — `IssueStatusLozenge` / `ProjectStatusLozenge` (§4-4)
- [ ] 19. A2~A11 교체(10파일, 12지점) + `components/issue/IssueComponent.js` 에서 `StatusComponent` 삭제 (§6-A)
- [ ] 20. A12~A17 캘린더 계열 — `statusAccent.js` 재작성 + `STATUS_COLOR_MAP` 직접 참조 3곳 이관 (§4-5, §6-A2)
- [ ] 21. A18~A20 팔레트 단일화 — `mapNodeCard.js` / `ProjectGroupCard.jsx` / `MyContributionCharts.jsx`
- [ ] 22. B2~B12 교체(11파일) (§6-B). **B7 은 `statusColor` 전달 누락 버그 수정 포함**
- [ ] 23. `constants/statusColorMap.js` 삭제 · `components/lozenge/StatusBadge.jsx` 삭제
- [ ] 24. §8-3 grep 8종 자체 확인 → 전부 기대치와 일치

### integration-verifier

- [ ] 25. §8-1 3종 실행(프론트 jest / `CI=true npm run build` / 루트 `npm test`)
- [ ] 26. §8-3 grep 8종 실행 — 특히 (1) 잔존 import 0, (5) 하드코딩 hex 3줄만
- [ ] 27. **다중 shape 재사용 점검** — `IssueStatusLozenge` 12개 호출부 각각이 넘기는 객체에 `name` 이 실제로 있는지 생산 코드와 대조(`statusCategory` vs `status` vs 서버 `{statusName,statusColorName}` 3종 shape 이 섞인다). `?? null` 이 결함을 삼키는 형태가 없는지
- [ ] 28. **동일 데이터 다중 경로** — 프로젝트 상태를 그리는 지점이 §6-B 11개로 전부인지 재확인(`statusName`/`statusColor`/`project.status` 로 재검색)
- [ ] 29. 번들 예산 — `@atlaskit/lozenge` 추가 후 main 증가분과 게이트 경고 확인. `components/lozenge/` 가 캘린더/차트 스택을 끌어오지 않았는지(§8-3 (6))
- [ ] 30. i18n 누락 — `t('gantt.filter.issueType')`·`t('projectDetail.filter.issueType.*')` 가 kr/en 양쪽 merge 결과(`ko-KR.json`/`en-US.json`)에 실제로 들어갔는지
