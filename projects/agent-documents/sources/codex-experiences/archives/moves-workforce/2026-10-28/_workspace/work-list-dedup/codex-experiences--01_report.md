# 작업 관리 > 목록 뷰 — 중복 조회 제거 리포트

- 대상: 프로젝트 상세 > 작업 관리 > **목록(table) 뷰**
- 범위 밖(무수정): `useGanttData`, `gantt/*`, `work/ProjectTreeView`, `work/ProjectWorkPanel`
- 프론트 직접 Jira 호출(`executeRequest('searchIssueWithJQL')`) 경로 유지 — 백엔드 resolver 이전 없음

---

## 1. 변경 파일

| 파일 | 구분 | 내용 |
|---|---|---|
| `static/ui/src/pages/projectDetail/issue/workListQuery.js` | 신규 | 순수 로직 — `normalizeJqlMap`, `buildSummaryJql`, `buildGroupJql`, `buildGroups`, `advanceCursorHistory`, 상한 상수 |
| `static/ui/src/pages/projectDetail/issue/useWorkListQueries.js` | 신규 | 페처 + React Query 훅 — `fetchWorkListSummary`, `fetchWorkListGroupPage`, `useWorkListSummary`, `useWorkListGroupPage`, `useWorkListInvalidator`, `resolveCoworkerUserMap` |
| `static/ui/src/pages/projectDetail/issue/workListQuery.test.js` | 신규 | 유닛테스트 19케이스 (조회 횟수 근거 포함) |
| `static/ui/src/utils/queryKey/projectKeys.js` | 수정 | `workListKeys` 팩토리 추가 |
| `static/ui/src/pages/projectDetail/issue/ProjectIssuePanel.jsx` | 수정 | 수동 페치 → `useWorkListSummary`, project_id ref 비교 리셋 |
| `static/ui/src/pages/projectDetail/issue/ProjectIssueTable.jsx` | 수정 | 수동 페치 → `useWorkListGroupPage`(커서 키), 단건 갱신은 `setQueryData` 패치 |
| `static/ui/src/pages/projectDetail/issue/ProjectGroupCard.jsx` | 수정 | prop 이름 `sharedJqlMap` → `filter` 중계만 |

i18n: **신규 번역 키 없음**(문구 변경 없음). `npm run build`의 prebuild가 `npm run merge`를 자동 실행했고, `locales/kr`·`locales/en` 소스는 손대지 않았다.

---

## 2. 문제 1 — 마운트 2회 조회

### 실제 원인 (지적된 것보다 발생원이 하나 더 있었음)

`setJqlMap({})`(매번 새 객체 리터럴)만이 아니라, **`ProjectFilter` 안의 `DropdownJql`이 마운트 effect에서 스스로 필터를 등록**한다:

`components/project/DropdownJql.jsx:66-68`
```js
useEffect(() => { setJQLFilter(); }, [selectDropdownList]);   // 마운트 시 1회 실행
// → addJqlMap('project',  {state:'=', value:[]})
// → addJqlMap('assignee', {state:'=', value:[]})
```

즉 마운트 직후 `jqlMap`은 `{}` → `{project:{value:[]}}` → `{project,assignee}` → `{}`(리셋)로 **4번 참조가 바뀐다**. 값은 전부 "JQL에 아무 영향 없음"인데도 `useEffect([jqlMapDebounce])`는 참조 비교(`Object.is`)라 전부 변경으로 읽혔다. 300ms 디바운스가 4번을 1번으로 묶어줘서 결과적으로 **1(초기) + 1(디바운스) = 2회**가 된 것이다.

### 수정 방식

조회 트리거를 "useEffect + 참조 비교"에서 **"React Query 쿼리키 + 구조 해시 비교"**로 옮겼다.

1. `normalizeJqlMap(jqlMap)` — JQL에 실제로 반영되는 항목만 남기고(빈 배열/빈 문자열/미지원 state 제거) 키와 value 배열을 정렬한 **정규 서명**을 만든다.
2. 이 서명을 쿼리키에 넣는다. React Query의 `hashKey`는 plain object의 키를 정렬해 직렬화하므로 **참조가 몇 번 새로 생기든 내용이 같으면 같은 캐시 엔트리**다 → 재조회 없음.
3. 서명은 쿼리키와 `generateJQL` 입력에 **동시에** 쓴다 → "같은 키 = 같은 JQL"이 구조적으로 보장된다.
4. `project_id` 리셋은 `useRef`로 이전 값과 비교해 **실제로 바뀔 때만** 실행 (초기 마운트에서는 실행되지 않음). 아울러 `<ProjectFilter key={project_id}>`를 붙여 필터 UI 자체도 함께 초기화되도록 했다(기존엔 `jqlMap`만 비워 필터 UI와 상태가 어긋났다).
5. `ProjectIssueTable`에 있던 **이중 디바운스**(이미 디바운스된 `sharedJqlMap`을 또 300ms 디바운스)를 제거했다.

리셋은 이제 2중으로 안전하다 — ref 비교로 애초에 실행되지 않고, 설령 실행되어도 `normalizeJqlMap({})`이 같은 서명이라 재조회가 없다.

### 조회 횟수 (근거)

`loadSummary`/`fetchPage` 호출 = HTTP 조회 1건(요약은 `do...while` 페이지네이션 루프 통째로 1회).
펼쳐진 그룹 수를 G라 할 때:

| 시나리오 | 수정 전 | 수정 후 |
|---|---|---|
| 목록 뷰 마운트, 그룹 0개 펼침 | 요약 2 | 요약 1 |
| 목록 뷰 마운트, 그룹 3개 펼침 | (1+3)×2 = **8** | 1+3 = **4** |
| 일반화 | 2 + 2G | 1 + G |
| table → gantt → table 왕복(60초 내) | 1+G (전량 재조회) | **0** (캐시 히트) |
| 페이지 next → prev 복귀 | 2 (앞뒤 각 1) | 1 (복귀는 캐시) |
| 필터 변경(디바운스 후) | 1+G | 1+G (동일 — 회귀 없음) |

유닛테스트로 검증한 항목 (`workListQuery.test.js`):
- 마운트 시퀀스 4단계(`{}` → project 등록 → assignee 등록 → 리셋 `{}`)가 **단 하나의 쿼리키 해시로 수렴**한다 → 조회 1회.
- 참조가 다른 두 빈 객체가 `toBe`는 실패하지만 `hashKey`는 동일 → 캐시 엔트리 동일.
- 사용자가 실제로 필터를 바꾸면 해시가 갈린다(디바운스 후 재조회 보존 = 회귀 방지).
- 키/값 순서만 다른 동일 필터가 같은 JQL을 만든다(쿼리키 ↔ JQL 1:1).

---

## 3. 문제 2 — React Query 전환

### 쿼리키 설계 (`utils/queryKey/projectKeys.js`)

```js
export const workListKeys = {
    all:        ['projectWorkList'],
    scope:      (projectId) => ['projectWorkList', projectId],
    summaryAll: (projectId) => ['projectWorkList', projectId, 'summary'],
    summary:    (projectId, filter) => ['projectWorkList', projectId, 'summary', filter],
    groupAll:   (projectId, groupKey) => ['projectWorkList', projectId, 'group', groupKey],
    groupPage:  (projectId, groupKey, filter, pageSize, cursor) =>
        ['projectWorkList', projectId, 'group', groupKey, filter, pageSize, cursor ?? null],
};
```

- 계층: `projectWorkList > {projectId} > summary|group > {groupKey} > {filter} > {pageSize} > {cursor}`
- **필터가 키에 포함**된다(`filter` = `normalizeJqlMap` 결과). 필터별로 캐시가 갈리고, 같은 필터로 돌아오면 히트.
- 상위 키가 그대로 prefix라 `summaryAll`/`groupAll`/`scope`로 부분 무효화 가능(테스트로 prefix 성질 검증).
- 인라인 키 배열 없음 — 팬텀 키 방지.

### `useInfiniteQuery` 대신 "커서를 키에 넣은 `useQuery`"를 택한 이유

현재 UX는 **한 번에 한 페이지만 보여주는 prev/next 커서 페이징**이지 무한 스크롤 누적이 아니다.
`useInfiniteQuery`는 `data.pages` 누적이 전제라 (a) 렌더에서 현재 페이지만 골라내야 하고, (b) 무효화 시 **모든 페이지를 재조회**하며, (c) 페이지 크기 변경/필터 변경 시 리셋 처리가 번거롭다.
커서를 쿼리키에 포함하면 페이지 1장 = 캐시 엔트리 1개가 되어 UX 그대로 유지되면서 뒤로가기가 캐시 히트가 된다. 페이징/펼침 UX는 변경 없음:

| 항목 | 유지 방법 |
|---|---|
| prev/next 커서 이동 | `cursorHistory` 로컬 상태 유지, 커서를 쿼리키에 반영 |
| 페이지 전환 중 이전 행 유지 | `placeholderData: (prev) => prev` |
| 0페이지=스켈레톤 / 그 외=버튼 스피너 | 원본 규칙 그대로 `isFetching && pageIndex===0` 여부로 분기 |
| 페이지 크기 변경 시 0페이지 복귀 | 렌더 중 `resetSig` 비교로 즉시 리셋(effect로 미루면 "새 필터 + 옛 커서"의 잘못된 키로 1회 조회가 새어나감) |
| 그룹 카드 lazy mount 후 display 토글 | `ProjectGroupCard` 그대로 |

> 커서 히스토리 갱신 시 **placeholder 데이터로는 절대 갱신하지 않는다**(`isPlaceholderData` 가드). 갱신하면 직전 페이지의 `nextPageToken`을 현재 페이지의 다음 커서로 오인해 커서가 어긋난다.

### staleTime = 60초 (간트는 5분)

- 간트/트리는 resolver 1회 조회 + 읽기 전용이라 5분이 안전하다. 목록은 인라인 편집(담당자/시작일/기한/MD)·추가·삭제가 잦다.
- 다만 **내가 한 변경은 staleTime과 무관하게 즉시 반영**된다. 단건 편집은 `setQueryData` 캐시 패치, 추가/삭제는 `invalidateQueries`로 처리하기 때문이다. 따라서 staleTime이 가릴 수 있는 건 **다른 사용자의 Jira 변경**뿐이고, 이건 짧을수록 좋다.
- 반대로 이번에 없애려는 중복 조회(뷰 전환 왕복, 그룹 접기/펼치기, 페이지 앞뒤 이동)는 전부 **초 단위** 왕복이라 60초면 100% 흡수된다.
- 즉 60초는 "중복 제거 효과는 전부 얻으면서, 협업 중 낡은 목록 위험은 간트의 1/5"인 지점이다. 5분으로 늘려도 중복 제거 이득은 늘지 않고 낡은 데이터 위험만 커진다.
- `gcTime`은 기본 5분 → 뷰를 옮겼다 돌아와도 캐시가 살아 있다.

### 갱신 경로 (동작 보존)

| 사건 | 수정 전 | 수정 후 | 동작 차이 |
|---|---|---|---|
| 이슈 추가(모달) | `loadSummary()` + `tableRefresh++` | `invalidateSummary()` + `tableRefresh++` | 없음 |
| `tableRefresh` 수신(그룹 테이블) | `fetchPage(0, null, pageSize)` | 0페이지 복귀 + `invalidateGroup(groupKey)` | 없음. 단, **이미 0페이지면 무효화만**(즉시 재조회), **0페이지가 아니면 stale 표시만 하고 키 전환이 조회를 유발** → 어떤 경우든 정확히 1회 |
| 인라인 편집(담당자/coworker/일정/MD) | `getIssue` 단건 조회 → `rows[index]` 교체 | `getIssue` 단건 조회 → 현재 페이지 캐시의 `issues[index]` 교체(`setQueryData`) | 없음. 전체 재조회 없음은 동일하고, 검색 인덱스 지연 회피 목적도 그대로 |
| 삭제 | `rows.splice(index,1,{keys:null,cells:[]})` + 상위 요약 재로드 | 캐시 이슈에 `__deleted` 표식 → 렌더에서 `{keys:null, cells:[]}` 빈 행 + `invalidateSummary()` | 없음(빈 행 유지 동작까지 동일) |

`refreshSignal`/`tableRefresh` prop은 **그대로 남겼다**. 이 신호의 의미는 "재조회"만이 아니라 "**0페이지로 되돌리기**"까지 포함하는데, `invalidateQueries`만으로는 현재 페이지에서 재조회될 뿐 0페이지 복귀가 표현되지 않기 때문이다.

---

## 4. 칸반 회귀 확인

`ProjectIssuePanel`은 `projectKanban/modal/Issue/ProjectIssuePanelModal.jsx:22`에서 `context="kanban"`으로 재사용된다.

- **권한**: `context === 'kanban' ? canWrite('KANBAN') : canWrite('PROJECT')` 분기 **그대로 유지**. 손대지 않았다.
- **props 계약**: 모달이 넘기는 `context` / `project_id` / `toast` 3개 모두 시그니처 변경 없음. 내부 리팩토링만 했고 내보내는 이름(`ProjectIssuePanel`, named export)도 동일.
- **마운트 시점**: `CommonModal`이 `<ModalTransition>{isOpen && ...}`이라 패널은 **모달을 열 때만 마운트**된다. 모달 열림 = 마운트 → 조회 1회(기존 2회). 닫으면 언마운트되지만 캐시(gcTime 5분)가 남아 60초 내 재오픈은 조회 0회.
- **캐시 분리**: 쿼리키에 `project_id`가 들어가므로 칸반 카드별(=프로젝트별)로 캐시가 갈린다. 다른 카드를 열어도 이전 카드 데이터가 보일 수 없다(테스트 "프로젝트가 다르면 같은 필터라도 캐시가 갈린다"로 검증).
- **`ProjectFilter key={project_id}`**: 모달은 매번 새로 마운트되므로 칸반에서는 영향 없음.

결론: 칸반 경로는 **동작 변화 없이 조회만 2회 → 1회**로 줄었다.

---

## 5. 유지 확인 항목 (요구사항 대조)

- [x] `useGanttData`·간트·트리 무수정 (`git diff`에 gantt/ 변경 없음)
- [x] `executeRequest('searchIssueWithJQL')` 직접 호출 경로 유지
- [x] 권한 체크 `usePermissionStore`(PROJECT/KANBAN), `useJiraProjectPermissions`(EDIT/ASSIGN/SCHEDULE) 그대로
- [x] 필드셋 `SUMMARY_FIELDS = ['project','status']`, 테이블 `fields:['*all']` + `properties:['movesRms']` + `fieldsByKeys:true` 그대로
- [x] `MAX_ISSUES=2000` / `MAX_PAGES=20` 상한, `collected.slice(0, MAX_ISSUES)`, truncated 경고 배너 그대로
- [x] coworker bulk resolve(N+1 금지) 그대로 — 페이지 단위 1회, 이제 캐시에 함께 저장
- [x] 쿼리키는 전부 `utils/queryKey/` 팩토리 경유(인라인 배열 없음)

---

## 6. 검증 결과

```
cd static/ui && npm test
  Test Suites: 16 passed, 16 total
  Tests:       194 passed, 194 total   (신규 workListQuery.test.js 19케이스 포함)

cd static/ui && npm run build
  prebuild(npm run merge) 실행 → ko-KR.json / en-US.json 생성
  Compiled successfully. The build folder is ready to be deployed.
```

빌드 1차 실패는 `// eslint-disable-next-line react-hooks/exhaustive-deps` 주석 때문이었다(이 프로젝트 CRA eslint 설정에 `react-hooks` 플러그인이 없어 "rule not found" 에러). 규칙명을 뺀 `// eslint-disable-next-line`으로 수정 후 통과.

## 7. 남은 리스크 / 후속 제안

- **E2E 미수행**: 실제 Forge 환경에서의 조회 횟수는 브라우저 Network 탭으로 최종 확인이 필요하다(코드 흐름 + 유닛테스트 기반 근거만 제시).
- `DropdownJql`이 마운트 시점에 빈 필터를 등록하는 구조 자체는 그대로다. 지금은 정규화가 흡수하지만, 다른 화면에서 같은 컴포넌트를 참조 비교로 쓰면 같은 함정이 재현될 수 있다.
- 삭제 시 "빈 행이 남는" 기존 동작을 그대로 보존했다(요구사항: 동작 변경 금지). 개선하려면 별도 과제로 다루는 편이 낫다.
