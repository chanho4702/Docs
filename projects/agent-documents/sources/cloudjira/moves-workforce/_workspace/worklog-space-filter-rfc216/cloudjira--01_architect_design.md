# RFC-216 워크로그 생성 스페이스 필터 설계

기준: 2026-09-30, HEAD `9f8aaf5`. 입력은 `00_input/requirement.md`와 리더의 후속 계약이다. 설계 담당자는 이 파일만 수정한다. 기존 협업 모드·간트/트리·번역 변경과 미추적 파일은 보존한다.

## 1. 목적·완료 조건·범위

워크로그 생성 모달에서 나에게 할당되거나 공동 작업자로 지정된 이슈를 Jira 스페이스로 좁혀 선택한다. 기본은 전체 스페이스이며, 기존 공용 다중 필터를 재사용해 여러 스페이스 선택은 OR로 처리한다. 필터를 해제하면 전체로 돌아간다.

- 필터는 Jira JQL에 적용한다. 이미 받은 이슈 100건을 클라이언트에서 걸러내지 않는다.
- 기존 RMS 프로젝트 연결 조건, 선택된 RMS 프로젝트 범위, 담당자·공동 작업자 조건과 사용자 자격을 보존한다.
- 필터 변경 시 이슈 선택·검색 캐시·늦은 응답을 정리하되 날짜·시간·코멘트는 유지한다.
- 신규 생성은 초기 이슈가 있어도 필터 사용이 가능하다. 실제 워크로그 수정(`worklog_id` 존재)은 필터를 숨기고 이슈 잠금을 유지한다.
- 범위는 frontend-only다. 시간 입력·ADF 코멘트·기간 일괄 생성/롤백·저장 API·backend·manifest·DB/schema를 바꾸지 않는다.
- 이슈 검색은 기존 요청당 최대 100건을 유지한다. 이번 필터 추가를 이유로 이슈 전량 수집이나 새 페이지 이동 UI를 도입하지 않는다. 스페이스 후보는 첫 페이지에서 누락되지 않도록 페이지 끝까지 수집한다.

완료 조건은 실제 컴포넌트의 필터·폼 상태·응답 경합 회귀, 기존 시간/저장 회귀, frontend/backend 전체 테스트, CI 빌드와 Forge lint다. 실제 Jira 브라우저 동작을 실행하지 못하면 별도 미검증으로 남긴다. 검증 후 RFC-216 변경만 별도 커밋하는 작업은 리더 소유이며 푸시·배포는 하지 않는다.

## 2. 근거와 재사용 대상

라인은 구현 전 조사 기준이다.

| 지점 | 실제 계약·사용처 | 결정 |
|---|---|---|
| `static/ui/src/pages/myWork/modal/WorklogModal.jsx:430` `promiseOptions` | 사용자 `executeRequest('searchIssueWithJQL')`, `fields:['*all']`, `properties:['movesRms']`, `fieldsByKeys:true`, `maxResults:100` → 이슈 옵션 | JQL 생성·응답 처리를 작은 지역 helper로 추출하고 스페이스 조건 추가 |
| 같은 파일 `:518` `Field(name=issueKey)` | Atlaskit Form 값과 `selectedIssue`가 별도로 유지됨. Select는 `cacheOptions/defaultOptions` 사용 | 필터 변경 시 두 값을 동시에 비움 |
| `static/ui/src/components/filter/ProjectFilterDropdown.jsx:30` | `{options:[{value,label,avatarUrl}],selectedKeys:Set,onToggle,onClear}`; 빈 Set=전체 | 공용 UI 재사용, `labelKeys`와 `isDisabled`만 선택 prop으로 확장 |
| `static/ui/src/components/filter/projectSpace.js:36` `deriveProjectOptions` | 입력 목록에서 프로젝트 키를 중복 제거하고 label 정렬 | 전량 조회한 Jira 프로젝트 목록의 옵션 변환에 재사용 가능. 이슈 첫 100건의 후보 유도에는 사용하지 않음 |
| `static/ui/src/components/filter/issueType.js:70` `quoteJqlValue` | 따옴표·백슬래시를 escape하는 JQL 문자열 리터럴 함수 | 스페이스 키·RMS 프로젝트 ID·검색 문자열에 재사용 |
| `static/ui/src/utils/jiraApi/requestJira.js:65,159,188` | 기존 `getProjects` GET `/project/search`, 배열 query 반복 직렬화, 실패는 `{success:false,error}` 값 | 새 endpoint·공통 실행기 변경 없이 재사용, 호출부에서 실패를 throw |
| `static/ui/src/pages/worklogExport/hooks/useJiraProjectOptions.js:16` | 첫 50건, `jiraKeys.projectSearch(query)`, 실패를 빈 배열로 변환 | 목적·shape·페이징이 달라 직접 재사용하지 않음 |
| `static/ui/src/utils/queryKey/jiraKeys.js:16` | Jira 자체 권한 데이터 키 팩토리 | 워크로그 스페이스 후보 전용 키 추가 |
| `static/ui/src/components/modal/CommonModal.jsx:32` | Form 내부에 children을 렌더하고 submitting은 footer에 전달 | 공용 모달 변경 없이 Form 하위 picker에서 `useFormState({submitting:true})` 구독 |
| `static/ui/node_modules/@atlaskit/form/dist/types/use-form-state.d.ts:10` | Form 하위에서 FormState 또는 최초 undefined 반환 | 저장 중 필터·이슈 변경 차단에 기존 제출 상태 재사용 |

공용 모달의 실제 화면 소비자는 `pages/myWork/WorklogPage.jsx:575`와 `pages/projectDetail/calender/ProjectCalender.jsx:413` 두 곳이다. 전자는 `selectedProjectIds` 배열, 후자는 단일 RMS `project_id`를 전달한다. 이슈 패널은 공용 `components/worklog/worklogWrite.js`를 사용하지만 이 모달 자체는 import하지 않으므로 UI 적용 대상이 아니다.

## 3. 경계면 계약

### 3.1 스페이스 후보 조회

새 resolver는 없다. 기존 bridge 요청은 사용자의 Jira 권한으로 실행한다.

```js
executeRequest('getProjects', {
  action: 'browse',
  status: ['live'],
  startAt,
  maxResults: 100,
  orderBy: 'name',
})
```

Jira `action=browse`는 Browse Projects 권한을 기준으로 후보를 반환한다. `create`는 이슈 생성 권한이므로 워크로그 후보에 사용하지 않는다. `maxResults` 최대 100 및 offset 페이징을 공식 OpenAPI에서 확인했다. [Atlassian 프로젝트 조회 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-projects/#api-rest-api-3-project-search-get)

| 항목 | 계약 |
|---|---|
| 실행 조건 | `isOpen && !worklog_id`; 닫힌 모달·편집 모드에서 새 후보 요청 없음 |
| 원본 성공 | `{values:[{id,key,name,avatarUrls}],startAt,maxResults,isLast,total?,nextPage?}` |
| 훅 성공 | `{options:[{value:key,label:name 또는 name(key),avatarUrl}],isLoading,isError,error,refetch}`; 성공 빈 목록은 options=[] |
| 페이징 | `isLast`/total 등 서버 종료 정보까지 순차 수집, key 중복 제거. 요청 offset은 반드시 앞으로 진행 |
| 비정상 응답 | 실패 envelope, values 누락/비배열, 계속된다고 했는데 빈 페이지, 동일 페이지 반복·offset 정체는 오류로 처리. 부분 목록을 전체 성공으로 내보내지 않음 |
| 오류 UI | `worklog.error.spaceLoadFailed`와 다시 시도 버튼. 오류를 옵션 0건으로 숨기지 않음 |
| 후보 의미 | 사용자가 조회 가능한 Jira 스페이스. RMS 범위 내 할당 이슈가 없는 스페이스도 후보가 될 수 있으며 선택하면 이슈 0건인 정상 결과 |
| 캐시 | `jiraKeys.worklogSpaces()` 같은 독립 키, 기존 `projectSearch(query)`와 혼용하지 않음. 60초 staleTime 권장 |

전체 스페이스 목록을 매 이슈 검색어마다 다시 조회하지 않는다. 후보 캐시는 사용자 세션의 QueryClient 범위이며, 서버/사용자 간 공유 캐시를 추가하지 않는다.

### 3.2 이슈 검색

기존 기본 조건은 다음과 같이 보존한다.

```jql
moves_RMS_projectId IS NOT EMPTY
AND (movesRmsCoworkers = currentUser() OR assignee = currentUser())
AND (moves_RMS_projectId = "선택된 RMS 프로젝트 ID" OR ...)
AND project IN ("선택된 Jira 스페이스 키", ...)
AND (textfields ~ "검색 문자열" OR workItemKey ~ "*검색 문자열*")
```

- RMS 프로젝트 배열이 없으면 기존과 같이 그 조건만 생략한다. 단일 ID/배열 입력을 둘 다 지원한다.
- 스페이스 Set이 비어 있으면 `project IN`만 생략한다. RMS 프로젝트 조건이나 담당자 OR 괄호를 제거하지 않는다.
- 검색어가 비어 있으면 검색어 조건만 생략한다. 기존 검색 의미를 유지하면서 문자열 리터럴을 escape한다.
- 스페이스 키는 정렬·중복 제거하여 같은 선택이 같은 scope signature를 갖게 한다. 이름이나 표시 라벨을 JQL 식별자로 사용하지 않는다.
- 기존 `fields`, `properties`, `fieldsByKeys`, `maxResults:100`을 유지한다. 이슈 검색의 nextPageToken은 기존과 같이 사용하지 않는다.
- 성공 옵션은 기존 `{label:<IssueComponent>,value:issue.id,issue}`를 유지한다. 실패 envelope나 잘못된 issues shape를 빈 정상 목록으로 처리하지 않는다.
- 최신 요청 실패에 `worklog.error.issueLoadFailed`와 다시 시도를 표시한다. 이전 세대 요청의 성공·실패는 현재 options나 오류 표시를 바꾸지 못한다.
- 재시도는 선택한 스페이스를 유지하되 검색어를 비워 해당 범위의 기본 목록부터 다시 읽는다. 검색어를 보존한 채 AsyncSelect를 재마운트하면 검색된 결과가 defaultOptions에 고정되어 이후 검색어 해제와 어긋날 수 있어 이 계약으로 확정했다.

### 3.3 저장

create/update/delete의 요청 본문과 Jira 권한 사전 확인을 유지한다. 새 스페이스 키는 워크로그 저장 payload에 추가하지 않는다.

생성 제출은 `value.issueKey.value`와 현재 선택 이슈가 유효하게 대응하는지 먼저 확인한다. 필터를 바꾼 직후 이전 Form 값만 남아 있거나 선택이 비어 있으면 기존 필수 입력 오류로 중단하고 권한 조회·저장 요청을 보내지 않는다. 프론트 범위 제한은 사용자 검색 편의를 위한 것이며 Jira의 저장 인가를 대체하지 않는다.

## 4. 권한·데이터 범위

| 경계 | 유지 사항 |
|---|---|
| 후보 스페이스 | 사용자 자격 `project/search?action=browse`; app 자격·create 권한 목록 사용 없음 |
| 검색 이슈 | 사용자 자격 + 기존 담당자/공동 작업자 + RMS 연결/선택 범위 + 선택 스페이스의 교집합 |
| 저장 | `fetchJiraProjectPermissions`의 WORK_ON_ISSUES/EDIT_OWN_WORKLOGS/DELETE_OWN_WORKLOGS 확인과 Jira 최종 인가 |
| 기존 워크로그 편집 | 작성자 본인 여부·issue 잠금·ADF 손실 방지·legacy 시간 복원 유지 |

PermissionMap, principal 전달, SELF SQL owner predicate, 급여/원가/팀 범위는 이번 frontend 변경으로 새 경로가 생기지 않는다. `getMyIssueList` resolver는 다른 화면용이며 이번 구현에서 사용하지 않는다.

## 5. 계층·등록·schema·배포

새 backend 계층·resolver 등록·scope·KVS schema·SQL migration이 없다. `manifest.yml:210` runtime과 `:415`의 기존 `read:jira-work`를 유지한다. 앱 공용 Jira 실행기를 수정할 필요가 없다. 기존 앱 빌드만 필요하며 이 작업에서는 배포하지 않는다.

## 6. 프론트 상태·컴포넌트·캐시

`WorklogModal` 안의 기존 issueKey Field를 유지하고 그 render callback의 하위 picker 컴포넌트에 스페이스 필터와 AsyncSelect를 둔다. callback 안에서 hook을 직접 호출하지 않는다. 작은 하위 컴포넌트는 Form 내부에서 `useFormState({submitting:true})`를 사용할 수 있다.

| 이벤트 | 필요한 전이 |
|---|---|
| 신규 생성 최초 열기 | 전체 스페이스. 전달된 초기 issue가 있으면 기존 선택으로 표시; 없으면 미선택 |
| 스페이스 선택/해제 | `fieldProps.onChange(null)`와 `setSelectedIssue(null)`를 함께 수행. 이슈 검색어·오류·옵션 캐시·defaultOptions를 초기화하고 새 scope 검색 |
| 동일 필터 Set 재적용 | 실제 값 변화가 없으면 불필요하게 선택을 지우거나 재요청하지 않음 |
| RMS 프로젝트 범위 변경 | 새 scope signature 및 요청 세대로 전환, 이전 이슈 선택·검색 응답을 재사용하지 않음 |
| 검색어 변경 | AsyncSelect의 최신 검색 요청만 표시. filter/scope 세대가 다르면 성공·실패 모두 무시 |
| 닫기/다시 열기 | 새 세션의 전체 필터로 시작. 이전 세션의 선택·응답·오류가 재등장하지 않음 |
| 실제 편집 | 필터 숨김, 후보 조회 비활성, 기존 defaultIssueOption과 잠금 유지 |
| 생성에 초기 issue만 존재 | 편집으로 분류하지 않음. 최초 issue 유지, 필터 변경 시 해제하고 다른 이슈 선택 가능 |
| 제출 진행 중 | Form submitting을 이용해 필터 및 issueSelect 비활성화, toggle/clear handler도 변경을 무시 |

권장 구현은 정규화한 RMS 범위·스페이스 Set·모달 세대에서 scope key를 만들고, 이슈 AsyncSelect를 key로 재마운트하여 내부 `cacheOptions/defaultOptions`를 분리하는 방식이다. 별도 요청세대 ref/cleanup으로 늦은 응답의 오류 state 갱신까지 막는다. Select만 재마운트해서는 Form 값이 사라지지 않으므로 Field onChange(null)가 반드시 함께 실행되어야 한다.

설치된 useAsync는 cache hit 때 진행 중인 lastRequest를 무효화하지 않는다. loader는 Promise를 반환하지 않는 공식 callback 방식으로 구현하며, 오래된 성공·실패의 callback 자체를 실행하지 않는다. 오래된 결과에 []를 반환하는 방식도 현재 캐시 목록을 지울 수 있어 사용하지 않는다. 이 경계는 실제 설치 useAsync hook으로 검증한다.

BaseModal 전체를 key로 재마운트하거나 worklogInfo를 바꾸는 방식은 쓰지 않는다. 날짜·시간·기간 옵션·코멘트·ADF 상태를 필터 초기화에 묶지 않는다. 필터 후보 조회 실패·빈 결과만으로 사용자가 명시한 스페이스 선택을 자동 해제해 검색 범위를 넓히지 않는다.

공용 `ProjectFilterDropdown` 확장:

```js
// 생략 시 기존 assignment.queue.project.* 문구와 활성 동작 그대로
labelKeys = { all, label, selected }
isDisabled = false
```

이번 소비자만 worklog의 스페이스 문구를 전달한다. 기존 사용처는 기본 props로 동작하며 선택 수 라벨은 기존 `tFormat(...,{n})`를 유지한다. disabled는 trigger와 내부 toggle/clear에 모두 적용한다.

새 queryKey는 스페이스 후보 조회에만 필요하다. 이슈 AsyncSelect에는 TanStack Query를 새로 도입할 필요가 없다. 저장 성공 시 호출 화면의 기존 워크로그 무효화와 기간 롤백 실패 무효화를 그대로 사용한다. 스페이스 후보는 워크로그 저장으로 바뀌지 않으므로 새 mutation 무효화 대상이 없다.

## 7. i18n

리더가 `locales/kr/worklog.json`, `locales/en/worklog.json` 및 merge 생성물을 소유한다.

| 키 | 한국어 | 영어 |
|---|---|---|
| `worklog.modal.spaceFilter.label` | 스페이스 | Space |
| `worklog.modal.spaceFilter.all` | 전체 스페이스 | All spaces |
| `worklog.modal.spaceFilter.selected` | 스페이스 {n}개 | {n} spaces |
| `worklog.error.spaceLoadFailed` | 스페이스 목록을 불러오지 못했습니다. 다시 시도해 주세요. | Could not load spaces. Please try again. |
| `worklog.error.issueLoadFailed` | 이슈 목록을 불러오지 못했습니다. 다시 시도해 주세요. | Could not load issues. Please try again. |

다시 시도는 `common.button.retry`, 빈 후보 검색은 `assignment.search.empty`, 선택 필수 오류는 기존 `worklog.modal.field.error.required`를 재사용한다. 타 세션이 수정 중인 gantt/projectDetail 번역은 건드리지 않는다.

## 8. 작업 소유권·검증·인계

| 담당 | 파일·책임 |
|---|---|
| 설계 agent | 이 설계서만 |
| frontend agent | `pages/myWork/modal/WorklogModal.jsx`; 필요 지역 `WorklogIssuePicker.jsx`, `worklogIssueSearch.js`, `useWorklogSpaceOptions.js`와 테스트; `components/filter/ProjectFilterDropdown.jsx` 및 테스트; `utils/queryKey/jiraKeys.js` |
| 리더 | `locales/kr/worklog.json`, `locales/en/worklog.json`, 번역 merge·생성물, 전체 검증 조율, RFC-216 파일만 별도 커밋 |
| 독립 검증 | 기존 모달 소비자·Form 필드·검색 범위·비동기 경합 및 기존 공용 필터 소비자 교차 확인 |

지역 helper/컴포넌트 파일 수는 구현자가 최소화할 수 있다. 공용 구조를 확대하거나 시간/저장 코드를 옮기지 않는다. 리더와 frontend agent에게 위 API·i18n·소유 범위를 전달했다.

필수 테스트:

1. 기본 전체/1개/복수 스페이스/해제의 JQL, 단일/배열 RMS 범위, 담당자 OR 괄호 보존, 따옴표·백슬래시 검색어 escape.
2. 스페이스 두 페이지 이상 및 마지막 페이지 후보 노출, key 중복 제거, 종료 신호, 동일 페이지·진행 없음 오류, 실패와 빈 성공 구분, 재시도.
3. 실제 Form으로 issue 선택 후 스페이스 변경 → Form 값과 selectedIssue 모두 초기화, 미선택 제출은 요청 없음. 새 스페이스 이슈 선택 후 올바른 issue ID로 저장.
4. 필터 A 요청 지연 중 B 전환 → A가 늦게 성공/실패해도 B 화면·오류·옵션 유지. 닫기/재개와 RMS 범위 변경도 같은 경계.
5. 날짜·시간·코멘트 입력 후 필터 변경 시 값 유지. 생성 초기 issue, 편집 issue 잠금과 후보 미요청, 저장 중 필터/선택 차단.
6. 공용 ProjectFilterDropdown의 기존 기본 라벨·선택/해제 동작 유지, 새 labelKeys override와 disabled 확인.
7. 이슈 검색에 스페이스 predicate가 요청 전에 포함되고 이슈 100건 후필터가 없음을 확인. 후보 캐시는 기존 projectSearch shape와 충돌하지 않음.
8. 기존 worklogTimeRange·worklogWrite·ADF 및 두 소비 화면의 저장 후 무효화 회귀.

설계 단계에서는 앱 테스트를 실행하지 않았다. 구현 후 루트/backend 테스트, static/ui 테스트와 CI 빌드, 앱 루트 `pwd` 확인 후 Forge lint를 실행한다. 성공·실패·미검증을 구분해 최종 보고한다.
