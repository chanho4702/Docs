# RFC-216 후속 통합 검수 — 내 이슈 스페이스·선택 해제

기준: 2026-10-01, HEAD `354023af1895d9812d87ae23dbcb054c8eb6740d` 위의 후속 diff. 입력은 `00_input/requirement.md`다. 검수자는 앱 소스와 테스트를 수정하지 않았고 이 보고서만 작성했다. 기존 미추적 PPT 3개, `custom-scopes.yaml`, `LeaderTeamBackfill.test.js`는 보존했다.

리더는 이전 협업 커밋 `36a5266`이 외부 amend로 `354023a`가 되었으나 두 커밋의 소스 diff가 없음을 확인했고 그대로 보존했다.

검증 후 리더가 대상 12개 파일만 `3be2de3`(`#RFC-216 [FIX] 워크로그 스페이스 후보를 내 이슈로 제한`)으로 커밋했다. 커밋 후 tracked/staged 변경은 없고 기존 미추적 5개 파일만 남았다. 푸시·배포는 하지 않았다.

## 판정

**통과.** 현재 요구사항을 위반하는 차단 결함은 확인되지 않았다. 이전의 전체 접근 가능 스페이스 목록 대신 기존 워크로그 대상 이슈에서 후보를 모으며, 명시적인 선택 해제와 오류/로딩 중 해제 가능 조건이 적용됐다. 전체 backend/frontend 테스트, CI 빌드 및 Forge lint 명령은 exit 0이다. 실제 Jira E2E와 일부 권한 lint는 아래와 같이 미검증으로 구분한다.

## 실제 경계 검수

| 경계 | 확인 위치 | 판정·근거 |
|---|---|---|
| 후보 범위 | `useWorklogSpaceOptions.js:14`, `worklogIssueSearch.js:10` | 동일 `buildWorklogIssueJql({selectedProjectIds})`를 재사용한다. RMS 연결, 선택된 RMS 프로젝트, `(공동작업자=currentUser OR assignee=currentUser)`를 유지한다. 후보에는 검색어와 선택 스페이스 조건을 넣지 않아 현재 선택으로 다른 후보가 사라지지 않는다. |
| 요청·응답 | `useWorklogSpaceOptions.js:21`, `utils/jiraApi/requestJira.js:51,215` | 기존 사용자 bridge `POST /rest/api/3/search/jql`로 `fields=['project']`, `fieldsByKeys=true`, `maxResults=100`을 요청한다. `issues[].fields.project`에서 `{value:key,label:name(key),avatarUrl}`를 생성한다. 전체 접근 가능 목록을 가져오던 getProjects 호출은 이번 훅에서 제거됐다. |
| 전량 cursor | `useWorklogSpaceOptions.js:17,38` | 모든 nextPageToken을 순차 소비하고 마지막에만 후보를 반환한다. 같은 스페이스가 여러 페이지를 차지해도 중단하지 않는다. 진행 여부는 후보 증가량이 아니라 cursor로 판정하며, 반복 token·타입 오류·모순된 isLast·누락된 project key·실패 envelope는 오류다. 빈 중간 페이지도 유효한 새 token이 있으면 이어 읽는다. |
| 캐시·늦은 응답 | `useWorklogSpaceOptions.js:51`, `utils/queryKey/jiraKeys.js:16`, `WorklogIssuePicker.jsx:22` | 신규 prefix `jiraWorklogIssueSpaces` + accountId + 정규화한 RMS ID 집합이다. 이전 `jiraWorklogSpaces` 및 추출 화면 `jiraProjectSearch` 캐시를 재사용하지 않는다. 단일 ID·배열·중복·순서 차이를 JQL과 같은 기준으로 정규화한다. AbortSignal을 응답 전후에 확인하며, 기존 Picker의 전환 token/실패 기록/AsyncSelect 경합 차단은 유지한다. |
| 명시적 해제 | `WorklogIssuePicker.jsx:11,55,101`, `ProjectFilterDropdown.jsx:99` | 빈 선택 트리거는 스페이스, 해제 항목은 선택 해제다. clear는 `changeSpaces(new Set())`로 Field 값·selectedIssue·이슈 검색 상태를 함께 초기화한다. 이미 빈 Set이면 no-op다. 후보 오류/로딩은 더 이상 dropdown 전체를 잠그지 않아 사용자가 해제할 수 있고, 후보 실패만으로 자동 해제하지는 않는다. |
| 제출·편집 | `WorklogIssuePicker.jsx:20`, `WorklogModal.jsx:266,307,512` | Form submitting 및 기존 편집/쓰기 불가일 때 선택·해제를 잠근다. 실제 worklog_id를 기준으로 편집의 후보 조회와 이슈 변경을 막는다. Form issue ID와 selectedIssue 일치 가드, 사용자 Jira 권한 사전 확인, create/update/delete 본문을 변경하지 않았다. |
| 공용 소비자 | `WorkQueuePanel.jsx:93`, `TreeStructurePanel.jsx:203`, `GanttToolbar.jsx:130`, `IssueMapToolbar.jsx:123` | 새 `labelKeys.clear`는 선택 prop이며 생략 시 `labels.all`로 fallback한다. 기존 네 사용처는 기본 props를 유지하므로 이전 문구·선택 동작을 보존한다. |
| 모달·저장 소비자 | `WorklogPage.jsx:575`, `ProjectCalender.jsx:413` | 배열 RMS scope와 단일 RMS scope를 모두 지원한다. 선택 해제로 모달 전체를 재마운트하지 않으므로 날짜·시간·코멘트·ADF 입력을 보존한다. 두 호출 화면의 저장 후 무효화와 기간 생성/롤백 경계도 변경하지 않았다. |
| 번역 | `locales/{kr,en}/worklog.json`, merge 생성 두 파일 | 사용하지 않는 worklog 전용 all 키를 clear 키로 교체했고 실제 Picker는 label/clear/selected를 참조한다. 생성 JSON의 diff도 해당 1개 키 교체뿐이다. 다른 공용 필터의 assignment 문구는 변경하지 않았다. |

지역 파일의 기준 경로는 `static/ui/src/pages/myWork/modal/`, 공용 필터는 `static/ui/src/components/filter/`다.

## API·권한 판정

공식 Jira enhanced search는 `fields`와 `nextPageToken`을 요청 본문으로 받으며, 사용자에게 Browse Projects와 필요한 이슈 보안 권한이 있는 이슈만 응답한다. 최근 변경은 인덱스 반영 전에 검색에서 보이지 않을 수 있다. 로컬 `executeRequest`의 bridge 사용자 호출과 대조했다. [Atlassian enhanced search POST 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post)

공식 OpenAPI의 `SearchAndReconcileResults.nextPageToken` 설명은 마지막/유일 페이지의 token이 null임을 명시하고, 응답의 isLast는 required가 아니다. 구현의 token 종료와 선택적 isLast 검증이 일치한다. [Atlassian OpenAPI](https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json?_v=1.8516.127) 원본을 메모리에서 읽어 관련 schema를 확인했으며, 파일 생성이나 앱 변경 없이 exit 0, chunk `a8f12e`로 확인했다.

- 신규 resolver·PermissionMap·principal·SQL/KVS·scope·manifest·의존성 변경 없음. SELF row owner·급여/비용·팀 명부의 신규 경로는 이번 변경에 해당하지 않는다.
- 실제 후보는 기존 워크로그 검색 조건을 만족하는 본인 담당자/공동작업자 이슈의 스페이스다. 프로젝트에 단순히 접근 가능하다는 이유만으로 후보에 들어오지 않는다.
- 필터는 검색 범위를 조정할 뿐 Jira 저장 인가를 대체하지 않는다. 기존 WORK_ON_ISSUES/EDIT_OWN_WORKLOGS/DELETE_OWN_WORKLOGS 사전 확인 및 최종 사용자 REST 인가는 유지한다.

## 회귀 검증 확인

테스트의 기대값만 보지 않고 실제 훅·Picker·Form·공용 필터의 변경 코드를 함께 읽었다.

- 후보 테스트: 앞 200개가 같은 스페이스이고 마지막 페이지에 다른 스페이스가 있는 경우, 동일 프로젝트 중복, 전체 cursor, 빈 중간 페이지, cursor 반복, 마지막 실패/재시도, 정상 빈 결과, 응답 shape 오류, 취소 후 후속 요청 중단.
- 캐시 테스트: 다른 사용자 및 RMS 범위 분리, 정렬·중복만 다른 동일 집합 재사용, 과거 전체 스페이스 캐시와 분리.
- 실제 Form 통합: B 선택 → 선택 해제 → 이슈 선택 비움/전체 대상 이슈 복귀, 날짜·시작/종료 시각·코멘트 보존, 올바른 이슈 ID로 저장. 편집과 닫힌 모달은 후보/이슈 검색 요청 없음.
- 실제 useAsync Picker 회귀: 후보 재조회 실패 중에도 선택 해제 가능, 기존 늦은 성공/실패·cache hit·defaultOptions·A→B→A 오류 재사용 방지 유지. 저장 중 필터와 이슈 선택 잠금도 유지한다.
- 공용 필터: 트리거와 해제 라벨을 독립 지정하며, 기본 props를 쓰는 기존 네 화면의 라벨·선택·해제·disabled 계약을 보존한다.

## 실행 증거

전체 검증은 리더가 실행했고 검수자가 중복 실행하지 않았다. 명령의 종료 코드와 실제 소스 검토를 별도로 구분한다.

| 검증 | 명령·디렉토리 | 결과 |
|---|---|---|
| Backend 전체 | app root, `npm test -- --runInBand` | 이번 후속에서 리더 재실행, exit 0, 144 suites / 1,965 tests, 85.391초, 세션 `52366`, chunk `c1e169`. |
| Frontend 전체 | `static/ui`, `npm test -- --runInBand` | 최종 소스 기준 리더 실행 exit 0, 140 suites / 2,215 tests / 1 snapshot, 101.203초, 세션 `33822`, chunk `47a45d`. |
| CI 빌드 | `static/ui`, `CI=true npm run build` | 리더 최종 exit 0, 세션 `90370`, chunk `d8d3a9`. app main.658009ad.js gzip 491,409/950,000 bytes, panel main.44dfb6ff.js gzip 329,459/350,000 bytes. 기존 vendor source-map/Browserslist/merge 경고만 존재한다. |
| Forge lint | app root, `pwd` 확인 후 `forge lint` | build 완료 뒤 리더 최종 실행 exit 0, `No issues found`, 세션 `75874`, chunk `369383`. 기존 `PermissionLinter: Unknown product`와 CLI 13.4.0 업데이트 경고는 남았다. |
| 공백 검사 | app root, `git diff --check` | 검수자 직접 실행 exit 0, chunk `c475f6`. LF/CRLF 안내만 출력. |

리더가 검증 중 및 명시적 stage 전 대상 12개 파일의 SHA256이 동일함을 확인했다. 대상만 stage한 뒤 staged diff 공백 검사도 exit 0(chunk `985f35`)이다.

## 실패·미검증·성능 한계

- 확인된 코드 결함 없음. 코드 요구사항과 필수 검증 명령 실행을 완료했다.
- 실제 Jira 설치 브라우저, 사용자별 권한 응답, 실제 cursor/data 분포와 워크로그 저장 E2E는 미검증이다.
- Forge lint는 exit 0이지만 기존 `PermissionLinter: Unknown product` 때문에 일부 권한 검사가 실행되지 않았다. 이를 실사이트 권한 검증의 통과로 간주하지 않는다. 이번 후속에는 권한·scope·schema 변경이 없다.
- 후보 조회는 페이지 수만큼 순차 요청한다. 이슈 전체 payload 대신 project만 받고 프로젝트 Map과 진행 cursor만 누적해 전송·보관량을 줄였으며, 60초 사용자/RMS 캐시를 재사용한다. 하지만 대상 이슈 수가 매우 많으면 초기 후보 로딩이 길어질 수 있다. 운영 지연이나 Jira의 서버 제한을 측정한 것은 아니다.
- Jira 검색 인덱스 지연과 60초 캐시 때문에 새 할당/재할당 직후 후보가 즉시 달라진다고 보장하지 않는다. 실시간 동기화·쓰기 후 강한 일관성은 이번 범위가 아니다.
- 이슈 선택 목록의 기존 요청당 100건 제한은 유지한다. 후보만 전체 cursor를 조회하며 첫 100건에서 후보를 유도하지 않는다.
- 검수자는 커밋·푸시·배포·설치를 수행하지 않았다. 소유 범위를 넓히지 않았으며, 후속 커밋 `3be2de3`은 리더가 수행했다.
