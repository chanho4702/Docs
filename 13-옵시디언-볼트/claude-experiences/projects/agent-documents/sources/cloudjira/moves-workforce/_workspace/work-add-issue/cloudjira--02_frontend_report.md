# 02 프론트엔드 보고 — 작업관리 이슈 생성 진입점 + 맵 커밋 연동 제거 (2026-09-30)

> 범위 변경 반영본. 처음 지시(기존 연결 모달 `IssueAddModal`을 뷰마다 열기)는 작업 도중 제품 소유자 정정으로 **폐기**했다.
> 그 과정에서 건드린 `IssueAddModal.jsx`·`ProjectFilter.jsx`·`ProjectIssuePanel.jsx`는 `git checkout`으로 **원상 복구**했고,
> 임시로 만든 `issueAddSearchJql.js`는 삭제했다. 목록 상단 「작업 추가」(연결)는 종전 그대로다.
> 백엔드·manifest 변경 없음. 협업 모드 판정·경로 코드 변경 없음.

## 1. 변경 파일

### 추가
| 파일 | 내용 |
|---|---|
| `static/ui/src/pages/projectDetail/issue/IssueCreateModal.jsx` | 이슈 생성 모달. props `project_id, lockedSpaceKey?, lockedSpaceName?, isOpen, onClose, onCreated, toast` |
| `static/ui/src/pages/projectDetail/issue/issueCreate.js` | 순수 로직 + 생성→연결 순서(`toAdfDescription`, `findUnsupportedRequiredFields`, `toCreatableIssueTypes`, `unwrapCreateMeta*`, `sortSubscribedFirst`, `buildCreateIssuePayload`, `describeCreateError`, `createAndLinkIssue`) |
| `static/ui/src/pages/projectDetail/issue/issueCreate.test.js` | 16건 |
| `static/ui/src/pages/projectDetail/work/__test__/workIssueCreate.test.jsx` | 14건(셸 버튼 4뷰·권한·무효화 / 그룹 하단 잠금·무효화 / 실제 모달 잠금·필수 필드 차단·메타 실패 / 맵 커밋 흔적 0) |

### 수정
| 파일 | 내용 |
|---|---|
| `work/ProjectWorkPanel.jsx` | 뷰 전환 줄에 「이슈 생성」 버튼 1개(`canWrite('PROJECT')`) + `IssueCreateModal`. 생성 뒤 `ganttKeys.data(pid)`·`workListKeys.scope(pid)` 무효화 |
| `issue/ProjectIssueTable.jsx` | 표 하단 「이 스페이스에 이슈 생성」(`canEdit`) → `lockedSpaceKey=groupKey`. 기존 refreshSignal 처리 본문을 `refreshGroup()`으로 뽑아 재사용(동작 불변). 생성 뒤 `refreshGroup()` + `invalidateSummary()` + 간트 키 무효화 |
| `issue/ProjectGroupCard.jsx` | `groupName`(스페이스 표시 이름) 전달 |
| `utils/jiraApi/requestJira.js` | `getCreateMetaIssueTypes`, `getCreateMetaFields`, `createIssue` 추가 / `getIssueDevStatus` 삭제 |
| `utils/queryKey/jiraKeys.js` | `creatableProjects(query)`, `createIssueTypes(key)`, `createFields(key, typeId)` 추가 |
| `utils/queryKey/projectKeys.js` | `issueDevStatus` 삭제 |
| `work/map/IssueMapDrawer.jsx` | 탭 UI 제거 → 제목 줄(「워크로그 이력 · 합계」) + 워크로그 목록. `tab`/`onTabChange` prop 삭제 |
| `work/map/IssueCardNode.jsx` | 커밋 아이콘·클릭 동작 삭제 |
| `work/map/IssueMapCanvas.jsx`, `work/map/issueMapActions.js`, `work/map/ProjectIssueMapView.jsx` | `onOpenCommits`·`drawerTab` 삭제 |
| `work/WORK_VIEWS.md` | §1-0 이슈 생성·추가 신설, §2 jest 대상 목록, §7 커밋 조회 행 삭제 + 제거 사유, §8 i18n 키 |
| `locales/kr|en/projectDetail.json` | `projectDetail.issue.create.*` 추가 |
| `locales/kr|en/issueMap.json` | `card.commits`·`drawer.tab.*`·`commit.*` 삭제, `drawer.worklog` 추가 |

### 삭제
`work/map/MapCommitTab.jsx`, `work/map/useIssueDevStatus.js`, `work/map/parseDevStatusCommits.js`, `work/map/parseDevStatusCommits.test.js`

`grep -rn -i "devStatus|dev-status|MapCommitTab|commit" static/ui/src/pages/projectDetail/work/map` → **0건**. `src/`(백엔드)에는 원래 해당 참조 없음.

## 2. Jira 호출 계약 (전부 사용자 자격 `requestJira`, 실패는 `{success:false}` 값)

| 단계 | 요청 | 소비 |
|---|---|---|
| 스페이스 목록 | `GET /rest/api/3/project/search?action=create&maxResults=50&query=<입력>` (기존 `getProjects` 키 재사용) | `res.values[]` → `{key,name}`. 구독 스페이스(`useSubscriptions`의 활성 `sourceKey`)를 위로 정렬. 입력하면 300ms 디바운스로 서버 검색 |
| 유형 | `GET /rest/api/3/issue/createmeta/{key}/issuetypes?maxResults=200` | `res.issueTypes ?? res.createMetaIssueType ?? res.values`. `subtask:true` 제외 |
| 필드 메타 | `GET /rest/api/3/issue/createmeta/{key}/issuetypes/{typeId}?maxResults=200` | `res.fields ?? res.results ?? res.values`. `required:true` 이고 `fieldId ?? key`가 `project·issuetype·summary·reporter·assignee·description` 밖이면 차단 + `name` 목록 표시 |
| 생성 | `POST /rest/api/3/issue` `{fields:{project:{key}, issuetype:{id}, summary, assignee?:{accountId}, description?:ADF}}` | 성공 `{id,key}` |
| 연결 | `invoke('updateProjectIdField', {issueId:[id], value:project_id, project_id, customFieldId})` → `invoke('recordIssueAssignedDate', {issueIds:[id], project_id})` | `IssueAddModal`과 **글자 그대로 같은 인자**. 연결은 `success===false`/throw 시 linkFailed. 등록일 기록은 비차단 |

- 지시문에는 `updateProjectIdField`의 인자가 `{ issueIds:[id], project_id }`로 적혀 있었으나, "그 모달의 코드를 읽고 같은 인자"라는 조건에 따라 **실제 `IssueAddModal` 인자**(`issueId` 배열 + `value` + `customFieldId`)를 따랐다.
- 생성 오류 문구: 401/403 → 고정 권한 안내, 그 외 → Jira 응답 본문의 `errorMessages` + `errors` 값(Jira가 사용자 언어로 준다), 본문을 못 읽으면 일반 안내.
- ADF: 줄마다 `paragraph`, 빈 줄은 `content:[]` 문단(ADF는 빈 text 노드를 거부), 공백뿐이면 `description` 생략.

## 3. 화면 동작

- **셸 「이슈 생성」**: 목록·트리·간트·맵 네 뷰 공통, `PROJECT write`. 스페이스는 모달에서 고른다.
- **그룹 하단 「이 스페이스에 이슈 생성」**: 스페이스 선택 대신 이름을 표시(잠금), 스페이스 목록 조회도 하지 않는다. 칸반 카드 모달의 목록에서도 보인다(그 컨텍스트의 `canEdit`=`KANBAN write` — 기존 「작업 추가」와 같은 기준).
- 생성 버튼 활성 조건: 스페이스 + 유형 + 필드 메타 조회 성공 + 지원 외 필수 필드 0 + 요약 입력.
- 결과별 처리
  - 생성 실패 → 오류 토스트, **모달 유지**(입력 보존)
  - 연결 실패 → "이슈는 만들어졌지만 프로젝트 연결에 실패했습니다(키 XXX-1). 목록의 「작업 추가」로 연결하세요." 토스트, 모달 닫음(재시도 = 중복 생성이므로)
  - 성공 → 성공 토스트에 이슈 키 링크(`IssueComponent` — Jira 새 창), 작업 이력 캐시 무효화(「작업 추가」와 동일), 모달 닫음
  - 연결 실패여도 `onCreated`를 부른다(이슈는 생겼고, 화면 새로 고침은 무해)
- 연속 생성 옵션 없음. 스피너 없음(버튼 `isLoading`·Select 로딩 표시는 기존 모달과 같은 수준).

## 4. 설계 결정과 이유

1. **무효화를 뷰별로 나누지 않고 목록·간트 둘 다 무효화** — React Query는 비활성 쿼리를 stale 표시만 하고 재조회하지 않으므로, 지금 보이는 뷰만 즉시 재조회되고 나머지는 다음 진입 때 읽는다. 뷰 분기가 없어 경로가 하나이고, 뷰 전환 직후에도 낡은 목록이 남지 않는다.
2. **협업 모드 키 포함** — `workListKeys.scope(pid)`는 prefix라 끝에 `'app'`이 붙은 요약·그룹·골격·상세 키가 전부 걸린다(테스트에서 `'app'` 요약 키·`'user'` 그룹 키의 `isInvalidated` 확인). 간트 키는 협업 모드여도 같은 키다(서버가 경로 판정). `collabKeys.access`는 건드리지 않는다.
3. **그룹 하단은 기존 refresh 로직 재사용** — refreshSignal 효과 본문을 `refreshGroup()`으로 추출해 그대로 불렀다(0페이지 복귀·펼침 초기화·계층 모드 재조회 규칙 동일).
4. **담당자 선택은 `ProjectIssueAssignSelect` 재사용**(프로젝트 인력 스크롤 + 검색, 간트 담당자 모달과 같은 컴포넌트). `ProjectUserSelect`는 다중 필터용 팝업이라 부적합.
5. **스페이스 목록은 `AsyncSelect` 대신 `useQuery` + `Select`** — 구독 목록이 늦게 와도 렌더 시점에 정렬되게(AsyncSelect는 기본 옵션을 마운트 때 한 번만 읽어 순서가 고정된다).
6. **모달 내부를 `isOpen`일 때만 마운트** — 열 때마다 입력이 초기화된다.
7. **BaseModal이 Enter를 막는 문제** — 설명 TextArea에서만 `onKeyDown` 전파를 끊어 여러 줄 입력이 되게 했다(BaseModal은 수정하지 않음).

## 5. i18n

- 추가: `projectDetail.issue.create.{button, groupButton, title, submit, space, spacePlaceholder, issueType, issueTypePlaceholder, summary, assignee, description, unsupported, success, error.{title, permission, generic, link, typesLoad, fieldsLoad}}` (kr/en)
- 삭제: `issueMap.card.commits`, `issueMap.drawer.tab.{worklog,commit}`, `issueMap.commit.*` / 추가: `issueMap.drawer.worklog`
- 안내 문구의 버튼 이름은 실제 라벨에 맞춰 「작업 추가」(en "Add Work")로 적었다(지시문의 「추가」보다 정확).
- `npm run merge` 실행 완료. ko-KR/en-US에 `projectDetail.issue.create` 존재, `issueMap.commit`·`issueMap.card.commits` 부재 확인.
- 참고: 작업 시작 전부터 `locales/ko-KR.json`·`en-US.json`이 수정 상태였다(다른 작업의 merge 산출물로 보임). merge가 kr/en 전체로 재생성하므로 그 변경도 함께 반영된 상태다.

## 6. 테스트·빌드

| 명령 | 결과 |
|---|---|
| `cd static/ui && npm run merge` | 성공 |
| `npx jest` (전체) | **131 suites / 2085 tests 전부 통과** (신규 30건 포함, 삭제된 `parseDevStatusCommits.test.js` 제외) |
| `CI=true npm run build` | **성공**. 번들 예산 내(main gzip 481,708 / 950,000, panel 329,338 / 350,000) |

## 7. 확인 못 한 것 / 주의

- **실 Jira 미검증(E2E 없음)**: createmeta 응답 키(`issueTypes`/`fields`)는 문서 스키마 이름과 실측 키가 달라 알려진 키를 모두 받게 했지만 실제 사이트 응답으로 확인하지 않았다. **팀 관리형 프로젝트**도 같은 createmeta 경로가 동작한다고 문서상 알려져 있으나 미확인.
- **필수 필드 판정의 오탐 가능성**: 지시대로 `required:true`면 전부 차단한다. Jira가 기본값을 채워 주는 필수 필드(`hasDefaultValue:true`, 예: 일부 사이트의 우선순위)도 차단될 수 있다 — 안전한 쪽(Jira에서 만들라는 안내)이라 그대로 두었다. 실사용에서 과차단이 보이면 `hasDefaultValue`를 제외하는 한 줄 변경으로 푼다.
- 필드 메타는 1페이지(maxResults 200)만 읽는다. 그 밖의 필수 필드가 있으면 Jira가 생성 시 400으로 거부하고, 그 문장이 토스트로 나온다.
- 스페이스 목록은 검색어별 상위 50건. 50건을 넘는 사이트는 검색으로 찾는다.
- **담당자 후보는 이 RMS 프로젝트 인력**이다. 고른 사람이 해당 Jira 스페이스에 배정 불가하면 Jira가 400으로 거부 → 문장 그대로 안내.
- `ProjectIssueAssignSelect`가 `autoFocus`라 모달을 열면 담당자 칸에 포커스가 간다(기존 컴포넌트 수정은 범위 밖이라 둠).
- **검색 인덱스 지연**: 목록은 JQL로 읽으므로 생성·연결 직후 새 이슈가 한 박자 늦게 보일 수 있다(「작업 추가」와 같은 한계). 간트 데이터도 백엔드가 JQL을 쓰면 같다.
- 작업 중 같은 작업 트리에서 협업 모드 관련 파일(`useWorkListQueries.js`, `collabKeys.js`, `useProjectReadAuthority.js`, 백엔드 `src/permission`·`projectCollab` 등)이 **다른 작업으로 수정되고 있었다**. 이번 작업은 그 파일들을 건드리지 않았고, 사용하는 `workListKeys.scope`/`ganttKeys.data` 구조는 그 변경과 무관함을 확인했다.

---

## 8. 보강 (2026-09-30, 커밋 `2932ecb` 위)

협업 모드 파일(`CollabAccess.js`·`collabKeys.js`·`useWorkListQueries.js` 등)은 건드리지 않았다.

### 8-1. 아이콘 (스페이스 · 이슈 유형)
- `IssueCreateModal.jsx`에 공용 `IconLabel`(export) — 16px 아이콘 + 이름. `@atlaskit/image` + `onError`로 실패 시 아이콘 없이 이름만(`IssueComponent`의 `issueImage` 처리와 같은 방식).
- 스페이스: `project/search` 응답 `avatarUrls['16x16'] ?? ['24x24']`. 유형: createmeta `iconUrl`. 두 `Select` 모두 `formatOptionLabel`이라 목록·선택값 양쪽에 그려진다.
- 잠긴 스페이스(목록 그룹에서 열 때)도 아이콘 표시 — `ProjectGroupCard` → `ProjectIssueTable(groupIconUrl)` → 모달 `lockedSpaceIconUrl`(새 선택 prop). 값은 그룹 카드의 `project.avatarUrls['16x16']`(없으면 카드 아이콘과 같은 24x24).

### 8-2. 시작일 · 기한 · 계획 작업량
| 입력 | 필드 | 값 |
|---|---|---|
| 시작일 | `customfield_10015` (`START_DATE_FIELD`) | `YYYY-MM-DD` 문자열 그대로 |
| 기한 | `duedate` | `YYYY-MM-DD` 문자열 그대로 |
| 계획 작업량(MD) | `timetracking.originalEstimate` | `${plannedHours(md, hourRate)}h` — `gantt/useGanttMutations.js`의 `plannedHours`를 import. `hourRate`는 `settingKeys.detail()` + `invoke('getSettingData')`(간트·트리와 같은 쿼리), 0/미설정이면 8 |

- 세 입력 모두 선택. 비우면 요청에 넣지 않는다.
- 필드 존재 판정 `availableScheduleFields(fields)`: 유형의 createmeta 필드 목록(`fieldId ?? key`)에 없으면 그 입력을 비활성 + "이 스페이스는 이 항목을 쓰지 않습니다". 요청 조립 시에도 `available`이 false면 넣지 않는다(기본값 fail-close). 유형을 고르기 전(필드 정보 전)에는 세 입력 모두 비활성.
- `SUPPORTED_CREATE_FIELDS`에 `customfield_10015`·`duedate`·`timetracking` 추가 → 필수여도 차단 목록에서 빠진다.
- 검증 `validateSchedule`: 시작일 > 기한이면(같은 날 허용 — 간트 `normStart > normDue`와 같은 방향) 오류 문구 + 생성 비활성. MD는 `parsePlannedMd` — 빈 값 null, 0 이상 숫자(소수 허용), 그 외 NaN → 오류 문구 + 생성 비활성. 기한 달력에는 `minDate=시작일`.
- 날짜 입력은 간트 일정 모달·그리드와 같은 `@atlaskit/datetime-picker`의 `DatePicker`(값이 `YYYY-MM-DD` 문자열). MD 입력은 `Textfield type=number` + `onWheel` blur(앱 관행).
- 생성 뒤 무효화는 기존대로(간트 데이터·목록) — 새 필드가 트리·간트·목록에 바로 반영된다(인덱스 지연 한계는 §7과 같다).

### 8-3. 목록 그룹 버튼 위치 · 도구 줄 여백
- 「이 스페이스에 이슈 생성」을 표 **하단에서 표 위 도구 줄 오른쪽 끝**으로 옮겼다(하단 버튼 제거). 그룹을 펼쳤을 때만 보이는 것·`canEdit` 조건은 그대로.
- 도구 줄: `Box paddingInline="space.200"` + `Inline spread="space-between"` — 왼쪽 계층/평면 토글·펼치기 묶음, 오른쪽 끝 생성 버튼. 카드 본문이 테두리에 붙어 있어(`card-flush-body`) 좌우에 같은 여백을 둬 양 끝이 맞는다. `ProjectIssueTable` 내부 변경이라 다른 뷰(트리·간트·맵)에는 영향 없음(칸반 카드 모달의 목록도 같은 컴포넌트라 같이 바뀐다).

### 8-4. i18n
- 추가: `projectDetail.issue.create.{startDate, dueDate, plannedMd, fieldUnavailable, error.dateRange, error.plannedMd}` (kr/en). `npm run merge` 실행·반영 확인.

### 8-5. 테스트 · 빌드
| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공 |
| `npx jest src/pages/projectDetail/issue src/pages/projectDetail/work` | **15 suites / 246 tests 통과** |
| `npx jest src/utils/queryKey` (쿼리키 계약) | 8 통과 |
| `CI=true npm run build` | **성공**(exit 0). 경고는 서드파티 소스맵 누락뿐(기존과 동일). 번들 예산 내 |

추가 테스트: `issueCreate.test.js` +6(필드 존재 판정·세 필드 필수 비차단·MD 파싱·범위/MD 검증·payload 환산(1.5MD×8=12h, 기본 hourRate 8)·비운 값/없는 필드 제외), `workIssueCreate.test.jsx` +4(유형 아이콘 목록·선택값 16px + 로드 실패 시 이름만 / 스페이스 아이콘 목록·잠금 / 일정 필드 없는 유형의 입력 비활성·안내 / 그룹 버튼이 표 위 도구 줄에 1개).

### 8-6. 확인 못 한 것
- 실 Jira 미검증: 팀 관리형에서 `customfield_10015`가 생성 필드에 없는 경우를 비활성으로 처리하지만 실제 응답은 미확인. createmeta 필드 목록에 `timetracking`이 `fieldId:'timetracking'`으로 오는지도 문서 기준.
- 시간 추적이 켜져 있어도 생성 화면에 필드가 빠져 있으면 입력이 막힌다(Jira가 받지 않으므로 의도된 동작).
- 도구 줄 여백은 jsdom에서 수치를 볼 수 없어 실화면 확인 필요.

---

## 9. 진단 · 제한 (2026-09-30, 커밋 `2932ecb` + 미커밋 보강 위)

협업 모드 파일(`useWorkListQueries.js`·`useWorkListFlatPage.js`·`useWorkListHierarchy.js`·`collabKeys.js` 등)은 **수정하지 않았다**(`useWorkListSummary`를 import 해 재사용만 함).
제품 소유자 확인("생성 자체는 정상")에 따라 진단은 찾은 것만 고치고 마무리했고, 계획 작업량 입력 차단을 별도로 해소했다.

### 9-1. 진단 결과

| # | 점검 항목 | 결과 | 근거 | 조치 |
|---|---|---|---|---|
| D1 | 연결 직후 거부(검색 인덱스 지연) | **원인 후보** | 서버 `updateProjectIdFieldService`가 `areIssuesAccessible(issueId,'user')`로 접근을 확인(`src/resolver/projectIssue/ProjectUsersService.js:300`) — 이 함수는 JQL `id = N` **검색**이다(`src/api/jira/issue/IssueApi.js:531`). 막 만든 이슈는 인덱스에 늦게 올라와 `PROJECT_SCOPE_DENIED`가 날 수 있다 | 연결 실패 시 1초·2초 뒤 **두 번 더** 시도(`createAndLinkIssue`). 성공 경로엔 지연 없음. 백엔드 불변 |
| D2 | 스페이스 목록에 빈 `query=` 전송 | **수정** | `2932ecb` `IssueCreateModal.jsx:87` — 입력 전 `query:''`가 `?query=`로 나갔다 | 스페이스 조회를 `action=create&keys=…`(등록된 스페이스, 50개 단위)로 바꾸면서 `query` 파라미터 자체를 없앰. 검색은 클라이언트 필터 |
| D3 | 설정 캐시 모양 오염 | **수정** | 이 모달이 `settingKeys.detail()`을 원형 `{success,…}`로 채웠다(보강분). `SettingPage.jsx:17-24`·`useSalaryPolicy.js:53-62`는 `success` 제거 모양 | `SettingPage`와 같은 queryFn(실패 시 throw, `success` 제거, staleTime 10분). `hourRate`는 두 모양 모두 최상위라 읽기는 원래 문제 없었다 |
| D4 | createmeta 필드 목록이 비어 오면 조용히 통과 | **수정(fail-close)** | `unwrapCreateMetaFields`가 모르는 응답 모양이면 `[]` → 필수 필드 검사가 빈 목록으로 통과, 일정 입력은 전부 "없음" 판정 | 성공 응답인데 필드가 0개면 **메타 조회 실패로 간주**(안내 + 생성 차단). Jira 생성 화면엔 최소 `summary`가 있다 |
| D5 | 계획 작업량(생성 화면에 없는 timetracking) 입력 차단 | **수정(제품 소유자 지적)** | 보강분이 createmeta에 없는 필드를 비활성화했다 — timetracking은 편집 화면에만 있는 설정이 흔하다 | 입력은 막지 않고 생성 직후 `PUT issue`로 저장(§9-2) |
| D6 | 담당자·설명이 생성 화면에 없는 유형 | **수정** | 본문에 넣으면 Jira 400("not on the appropriate screen")으로 생성 자체가 실패 | 같은 규칙: 생성 화면에 없으면 생성 뒤 편집으로 |
| D7 | 모달 열림·닫힘·제출 | 코드상 문제 없음 | `IssueCreateModal`은 `isOpen`일 때만 `IssueCreateDialog`를 마운트하고 그 안에서 `BaseModal isOpen`(항상 true). `BaseModal`의 `<form onSubmit>`→Atlaskit `Form onSubmit`→`submit`, 생성 버튼 `type="submit"`, 제출 중 `submitting`(Promise 동안 true)으로 버튼 로딩·닫기 비활성 | — |
| D8 | createmeta 응답 키 | 코드상 문제 없음(다중 수용) | 공식 문서 페이지는 전문을 받지 못했다. 공개 자료상 issuetypes는 `issueTypes`, 필드는 문서 스키마 `results`/실측 보고 `fields`/`values`가 혼재 | 알려진 키를 모두 받는 현 구현 유지 + D4 fail-close로 오판 차단 |
| D9 | 필수 판정 식별자 | 코드상 문제 없음 | `fieldId ?? key`로 대조. `project`·`issuetype`·`summary`·`reporter`가 필수로 와도 지원 목록에 있어 통과(테스트 고정) | — |
| D10 | 생성 응답·실패 문구 | 코드상 문제 없음 | 201 본문 `{id,key,self}`를 `executeRequest`가 `json()`으로 반환. 실패 시 `error.code`=HTTP 상태, `error.cause.message`=응답 본문 텍스트(`requestJira.js:196-202`) → `describeCreateError`가 파싱 | — |
| D11 | 연결 인자 | 코드상 문제 없음 | `updateProjectIdField {issueId:[id], value, project_id, customFieldId}` · `recordIssueAssignedDate {issueIds:[id], project_id}` — `IssueAddModal.jsx`와 글자 그대로 동일(테스트 고정) | — |
| D12 | undefined 접근 | 코드상 문제 없음 | 응답 접근은 전부 `?.`·`??` 기본값. `space.label`은 잠금 모드에서만(항상 세팅) | — |

**범위 밖 발견(수정 안 함, 보고만):** 간트 `useUpdatePlannedMd`의 시간 추적 꺼짐 판별이 **항상 참**이 된다. 던지는 오류 문구 자체가 `'updateIssue(timetracking) failed'`(`gantt/useGanttMutations.js:635`)이고, 바깥 오류 문구에도 요청 본문이 들어 있어(`requestJira.js:202`) `isTimeTrackingUnsupportedError`(`useJiraEditGuards.js:83`)가 첫 단계에서 `'timetracking'`을 찾는다 → 권한·검증 400도 "시간 추적 꺼짐" 안내로 나간다. 이번 모달은 **응답 본문(`error.cause`)만** 보고 400일 때만 판별하도록 피했다.

### 9-2. 생성 화면에 없는 입력 → 생성 뒤 편집
- `fieldsOnCreateScreen(fields)` → `{assignee, description, startDate, dueDate, plannedMd}` 존재 여부.
- `planCreateIssue(...)` → `{payload, postUpdates}`. 값이 있는 입력만, 생성 화면에 있으면 본문 / 없으면 `postUpdates`.
- `createAndLinkIssue({payload, postUpdates, projectId})`: **생성 → 편집(항목별 PUT, 비차단) → 연결(최대 3회) → 등록일 기록(비차단)**.
  - 계획 작업량 편집은 간트와 같은 헬퍼: `getIssue?fields=timetracking` → `buildTimetrackingPayload(originalEstimate, remaining)` → `updateIssue`.
  - 결과에 `postUpdateFailed: string[]`(실패한 입력 이름), `timeTrackingUnsupported: boolean`(400 + 응답 본문이 timetracking 편집 불가).
- 화면: 입력은 항상 가능, 생성 화면에 없으면 입력 아래 보조 문구 "만든 뒤 따로 저장됩니다". 편집 실패 시 성공/연결 토스트와 별개로
  "이슈는 만들었지만 {항목}은(는) 저장하지 못했습니다 — 간트에서 입력하세요"(+ 시간 추적 꺼짐이면 기존 `projectDetail.issue.timeTracking.disabled` 안내).
- "이 스페이스는 이 항목을 쓰지 않습니다"(`fieldUnavailable`) 문구·키 삭제.

### 9-3. 스페이스 선택 제한
- 등록된 스페이스 `registeredSpaceKeys(subscriptions, groups)` = 활성 구독 `sourceKey` ∪ 목록 요약 그룹의 Jira 프로젝트 키(`unknown` 제외).
  - 요약은 **기존 `useWorkListSummary({projectId, filter:{}})` 재사용** — 목록 뷰 첫 화면(필터 없음)과 같은 키라 목록을 본 뒤면 추가 조회 0, 협업 모드 경로 분기도 훅이 한다. 잠금 모드에서는 `projectId:null`로 꺼 둔다.
- 만들 수 있는 스페이스: `project/search?action=create&keys=…&maxResults=50`(50개 단위 분할, 쿼리키 `jiraKeys.creatableProjects(keys)`).
- 표시 `selectableSpaces(registered, creatable, subscribed)` = 교집합, 구독 스페이스 위로. 검색은 Select 기본 클라이언트 필터.
- 등록 0개 → "이 프로젝트에 등록된 스페이스가 없습니다. 먼저 「작업 추가」나 구독으로 스페이스를 등록하세요." / 등록됐지만 만들 권한 0개(조회 실패 포함) → "등록된 스페이스에 이슈를 만들 권한이 없습니다." 두 경우 모두 선택 없음 → 생성 버튼 비활성.
- 목록 그룹 우측 상단 버튼(잠금)은 그대로.

### 9-4. i18n
- 추가: `projectDetail.issue.create.{savedAfterCreate, noRegisteredSpace, noCreatableSpace, error.postUpdate}` / 삭제: `fieldUnavailable`. `npm run merge` 실행·반영 확인.

### 9-5. 테스트 · 빌드
| 명령 | 결과 |
|---|---|
| `npm run merge` | 성공 |
| `npx jest src/pages/projectDetail/issue src/pages/projectDetail/work src/utils/queryKey` | **18 suites / 265 tests 통과** |
| `CI=true npm run build` | **성공**(exit 0, 경고는 서드파티 소스맵뿐, 번들 예산 내) |

추가·변경 테스트: `issueCreate.test.js`(28건) — 생성 화면 있음→본문·편집 없음 / 없음→본문 제외·편집 호출·remaining 동봉·순서(생성→편집→연결) / 편집 실패→연결 계속·실패 필드 보고 / 시간 추적 꺼짐 판별(응답 본문만, `timetracking_*` 검증 400은 false) / 연결 재시도 2회(1s·2s) / 등록 스페이스·교집합.
`workIssueCreate.test.jsx`(23건) — 생성 화면에 없는 입력은 활성 + 보조 문구 / 필드 목록 비면 차단 / `keys` 조회·빈 `query` 없음·교집합·구독 위 / 등록 0개 안내 / 권한 0개 안내 / 설정 캐시 `success` 제거 모양.

### 9-6. 확인 못 한 것
- 실 Jira 미검증: D1(인덱스 지연)이 실제로 나는지, 재시도 3초 안에 흡수되는지. 생성 뒤 편집 PUT이 생성 화면엔 없고 편집 화면엔 있는 사이트에서 저장되는지.
- 등록된 스페이스는 목록 요약 상한(2,000건) 안의 그룹 기준이다. 상한을 넘는 프로젝트에서 요약에 안 잡힌 스페이스는 구독으로 등록돼 있지 않으면 목록에 안 나온다.
- 다른 화면 다수(`ProjectIssuePanel`·`ProjectTreeView`·`GanttPage` 등)가 같은 설정 키를 여전히 원형 응답으로 채운다 — `hourRate` 등 최상위 값만 읽어 동작엔 문제 없지만, 캐시 모양 통일은 이번 범위 밖.
