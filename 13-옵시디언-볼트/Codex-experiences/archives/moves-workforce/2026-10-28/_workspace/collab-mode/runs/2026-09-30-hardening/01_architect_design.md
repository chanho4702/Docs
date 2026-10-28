# 협업 모드 오류·캐시·집계 보강 설계

기준일: 2026-09-30. 입력: `00_input/requirement.md`, 리더의 범위 지정, 기존 `_workspace/collab-mode/03_verify_report.md` 마지막 두 검수 절과 현재 소스. 설계 담당자는 이 문서만 수정한다. 앱 코드·기존 작업 변경은 보존한다.

## 1. 목적·완료 조건·범위

1. SQL 판정 실패를 정상 OFF와 구분하면서 앱 자격 승격은 차단한다.
2. 프론트에서 app 성공 후 재조회 실패가 발생하면 user 경로로 전환하고, 이전 app 데이터가 캐시·placeholder를 통해 계속 보이지 않게 한다.
3. coverage 응답을 현재 PROJECT write 여부별로 분리한다.
4. 대시보드 워크로그 검색의 1,000이슈 절단을 `truncated:true`로 전달한다.
5. 요청 안에서 이미 확보한 권한 증거와 조회 결과를 재사용해 중복 요청을 줄인다. 전역 사용자 컨텍스트 Promise 공유는 도입하지 않는다.

완료 조건은 경계 회귀 테스트, backend/frontend 전체 테스트, `CI=true` 빌드, Forge lint, 독립 계약 검증이다. 운영 지연 시간, 실제 DB v025 적용 여부, 중복 환경 설치와 커스텀 필드 문제는 이 코드 수정의 완료와 분리해 미검증으로 남긴다. 배포·설치·마이그레이션 실행·앱 제거·커밋·푸시는 범위 밖이다.

## 2. 조사 근거와 재사용 지점

아래 라인은 구현 전 조사 기준이다.

| 실제 위치·export | 계약·사용처 | 결정 |
|---|---|---|
| `src/permission/CollabAccess.js:67` `describeCollabAccess` | `{projectId,principal}` → `{collabMode,readAuthority,reason,changedBy,changedAt}`; 설정 조회·coverage·assert·resolve에서 사용 | 기존 단일 판정 유지, SQL 실패 사유만 추가 |
| `src/permission/CollabAccess.js:108` `resolveCollabReadAuthority` | 간트, `ProjectDashboardService`, `DashboardInsightService`, `RelationGraphService` → `app\|user` | 모든 실패의 user 폴백 유지 |
| `src/permission/CollabAccess.js:134` `collabAccessError` | 전용 조회 6종과 coverage의 거부 매핑 | 신규 오류 코드를 공통 매핑 |
| `src/resolver/projectCollab/ProjectCollabService.js:15` `getProjectCollabAccessService` | 유일한 외부 성공 응답 생산자, `content` 래핑 | UNAVAILABLE일 때만 표준 실패 envelope로 변경 |
| `src/resolver/projectCollab/CollabCoverageService.js:86` `getProjectCollabCoverageService` | 현재 isWriter와 접근 판정 후 KVS 완성 응답 조회 | 캐시 키에 현재 권한 축 추가 |
| `src/api/jira/issue/CollabCoverageFetcher.js:31` `searchCoverageIssues` | `{projectId,as,maxIssues,budget}` → 키 Set·프로젝트 Map·truncated | 해당 자격으로 검색된 프로젝트의 BROWSE 증거 재사용 |
| `src/api/jira/worklog/CollabWorklogFetcher.js:127` `getProjectWorklogsAsApp` | `{projectId,startDate,endDate,accountId}` → `{worklogs,truncated}` | 이슈 상한 절단 판정 추가 |
| `static/ui/src/hooks/useProjectReadAuthority.js:40` `useProjectReadAuthority` | 프론트 조회 경로의 단일 출처 | query 성공 상태와 데이터 둘 다 확인 |
| `static/ui/src/utils/collab/collabErrors.js:35` `readAuthorityOf` | 간트·폴더 mutation 오류 문구 | query 상태를 포함해 훅과 같은 보수적 판정 |
| `static/ui/src/utils/queryKey/collabKeys.js:26` `invalidateCollabScopedViews` | 설정 mutation·authority 전환 | 기존 prefix 목록 재사용, 하향 전환용 데이터 제거 추가 |
| `static/ui/src/pages/projectDetail/issue/useWorkListQueries.js:315,345` | 페이지·계층 상세의 `placeholderData` | 권한이 바뀌면 이전 데이터 재사용 금지 |
| `static/ui/src/components/collab/CollabModeSetting.jsx:65,100` | 오류 시 토글 비활성화·loadFailed 문구 | 기존 UI 재사용 |
| `src/rdb/query/CommonQuery.js:41`, `src/utils/ResponseWrapper.js:16` | SqlError.message에 SQL·params, wrapper는 cause 직렬화 | 신규 실패에 원본 SQL 예외·cause 전달 금지 |

`src/index.js:89`에 `registerProjectCollabController`, `PermissionMap.js:402` 이하에 기존 9개 resolver가 등록되어 있다. `manifest.yml:210`의 실제 runtime은 `nodejs22.x`다. 신규 resolver·권한·DB/KVS entity schema·runtime 변경은 없다.

## 3. 경계면 계약

### 3.1 오류 판정

`COLLAB_REASON.UNAVAILABLE = 'UNAVAILABLE'`, `ErrorCodes.COLLAB_ACCESS_UNAVAILABLE = 'COLLAB_ACCESS_UNAVAILABLE'`를 추가한다.

- `describeCollabAccess`: SQL 예외에 `readAuthority:'user', reason:'UNAVAILABLE'`를 반환한다. 내부의 `collabMode:false`는 승격 방지를 위한 기본값일 뿐 실제 OFF를 뜻하지 않는다. 이 상태는 설정의 성공 응답으로 내보내지 않는다.
- `getProjectCollabAccessService`: UNAVAILABLE이면 `collabAccessError`의 `LogicalError(COLLAB_ACCESS_UNAVAILABLE)`를 throw한다. 나머지 기존 성공 계약은 유지한다.
- `collabAccessError`: UNAVAILABLE은 위 LogicalError로 매핑한다. OFF·비참여·스코프 밖·principal 누락·잘못된 입력 매핑은 그대로 유지한다.
- `resolveCollabReadAuthority`: UNAVAILABLE을 포함한 모든 실패에 `user`를 반환한다. 서버 판정형 읽기의 기존 동작을 유지한다.
- 원본 SqlError, 쿼리, SQL params, accountId 또는 자유 형식 예외 메시지를 신규 오류 응답의 cause에 넣지 않는다. 이 경계의 원본 예외 console 출력은 제거하거나 고정 안전 코드로 제한한다. 공용 오류 직렬화 계층 전체의 변경은 범위 밖이다.

정상 OFF는 계속 다음과 같다.

```json
{
  "success": true,
  "content": {
    "projectId": "프로젝트 UUID",
    "collabMode": false,
    "readAuthority": "user",
    "reason": "OFF",
    "changedBy": null,
    "changedAt": null
  }
}
```

SQL 판정 실패는 다음과 같다. 공용 wrapper가 cause 기본값을 빈 문자열로 직렬화한다.

```json
{
  "success": false,
  "error": {
    "name": "LogicalError",
    "code": "COLLAB_ACCESS_UNAVAILABLE",
    "message": "Collaboration mode access could not be determined",
    "cause": ""
  }
}
```

### 3.2 resolver·내부 서비스 계약

| 경로·입력 | 성공 | SQL 판정 실패·소비자 |
|---|---|---|
| `getProjectCollabAccess({projectId})` | 기존 `{success:true,content:{projectId,collabMode,readAuthority,reason,changedBy,changedAt}}` | 신규 표준 실패. `useProjectReadAuthority`가 user로 전환하고 설정은 오류 표시 |
| `setProjectCollabMode({project_id,enabled})` | 기존 `{success:true,content:{projectId,collabMode,changed,changedBy,changedAt}}` | mutation 계약 변경 없음. 설정 조회 실패 동안 UI가 토글을 막음 |
| `getProjectCollabCoverage({project_id})` | 기존 루트 `{success:true,spaces:[{key,name,appCanBrowse}],hiddenSpaceCount,userOnlyIssueCount,truncated}` | UNAVAILABLE은 write 보유자도 거부. KVS/Jira 조회 전 차단 |
| `getCollabWorkListSummary({projectId,filter})` | 기존 `{success:true,content:summaryDTO}` | 공통 assert가 신규 오류로 거부 |
| `getCollabWorkListPage({projectId,groupKey,filter,pageSize,cursor})` | 기존 `content:{issues,nextPageToken}` | 공통 assert가 신규 오류로 거부 |
| `getCollabWorkListSkeleton({projectId,groupKey,filter})` | 기존 `content:{rows,truncated}` | 공통 assert가 신규 오류로 거부 |
| `getCollabWorkListDetail({projectId,keys})` | 기존 `content:{issues}` | 공통 assert가 신규 오류로 거부 |
| `getCollabCalendarWorklog({projectId,startDate,endDate})` | 기존 루트 items·truncated 등 그대로 | 공통 assert가 신규 오류로 거부; 캘린더 훅은 access 재조회 |
| `getCollabIssueWorklogs({projectId,issueKey})` | 기존 `content:{worklogs,total}`; 첫 페이지 100건 상한 유지 | 공통 assert가 신규 오류로 거부; 워크로그 패널은 access 재조회 |
| `resolveCollabReadAuthority` 내부 소비자 | `app\|user` | 간트·대시보드·인사이트·관계 그래프는 user 조회; 쓰기 검증에는 app 자격을 쓰지 않음 |
| `aggregateCollabWorklogsByDate/ByUserDate` | 기존 `{rows,truncated}` | 이슈 상한 절단을 true로 전달; 대시보드 `ChartTemplate`의 기존 경고 소비 |

기존 입력 검증·기본값·페이지/기간 상한은 바꾸지 않는다. coverage의 빈 성공은 `spaces:[], hiddenSpaceCount:0, userOnlyIssueCount:0, truncated:false`다. `name:null`은 writer에게만 노출하는 앱 전용 스페이스의 키이며, `appCanBrowse:null`은 확인 불가다. 실패를 빈 성공으로 변환하지 않는다.

## 4. 권한·데이터 범위

| 호출자/상태 | 협업 전용 읽기 | coverage |
|---|---|---|
| ON + ACTIVE + 참여 + 프로젝트 범위 허용 | app | reader 또는 writer용 결과 |
| ON + 비참여 | 거부 | writer라도 거부 |
| 정상 OFF + PROJECT write | 거부 | 켜기 전 확인용 허용 |
| 정상 OFF + PROJECT read만 | 거부 | 거부 |
| SQL UNAVAILABLE | 거부 | writer라도 거부 |
| principal 누락·프로젝트 범위 밖 | 거부 | 거부 |

가드의 `PROJECT read/detail`, 설정 mutation의 `PROJECT write/detail`, `assertSingleProjectKey`, 서비스 principal·참여 재검증은 그대로 유지한다. 본인 권한의 스페이스 이름만 응답하며, writer 전용 키를 reader에게 반환하지 않는다. 일반 DTO의 급여·원가, 팀 명부 범위, SELF 쓰기와 Jira 쓰기 자격은 이번 변경 대상이 아니다.

## 5. 백엔드·캐시·성능

### 5.1 coverage

- 권한과 참여 여부를 매 호출 먼저 판정한 뒤 완성 응답 캐시를 읽는다.
- 사용자 캐시 키는 `Collab:coverage:v2:<projectId>:<accountId>:writer|reader`처럼 버전과 현재 PROJECT write 축을 포함한다. 함수 인자는 `(projectId, accountId, isWriter)`를 권장한다. 정확한 세그먼트 순서는 구현이 정하되 `Collab:` 접두어와 권한 격리는 필수다.
- 기존 버전의 완성 응답은 읽지 않는다. 권한 철회 직후 writer 캐시가 있어도 reader 키를 선택한다. 반대 전환도 같으며 TTL 2분은 유지한다.
- 앱 쪽 공유 캐시는 사용자 응답을 포함하지 않는 기존 키 집합·프로젝트 키·앱 권한 구조와 TTL 5분을 유지할 수 있다. 응답 의미나 구조가 바뀌면 별도 버전을 올린다.
- 현재 app 검색에서 이슈가 반환된 프로젝트는 해당 자격으로 BROWSE가 허용됐다는 증거를 재사용해 `true`로 처리하고 중복 `mypermissions`를 생략한다. 구독 프로젝트·사용자에게만 보이는 프로젝트 등 증거가 없는 키만 확인한다. 앱 검색에 없는 프로젝트를 `false`로 추정하지 않는다. 리더가 [Jira POST /search/jql 공식 문서](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-search-jql-post)의 결과 포함 조건인 Browse projects 및 issue security를 확인하여 이 재사용 계약을 승인했다.
- 동일 요청 안에서 확인할 키는 Set으로 중복 제거하고, 확인한 boolean/null 결과를 Map/객체로 공유한다. null인 실패를 같은 요청 안에서 반복 확인하지 않는다. 기존 동시성·공유 요청 예산·절단 표시를 보존한다.
- 전역/모듈 Map에 사용자 자격 Promise 또는 사용자 결과를 저장해 다른 invocation과 공유하지 않는다. KVS 캐시 적중 시에도 서버 인가를 생략하지 않는다.

### 5.2 워크로그

- 다음 커서가 있는 상태로 1,000개에 도달하거나 응답 한 페이지가 남은 수용량을 초과하면 검색 절단이다.
- 정확히 1,000개이고 다음 커서가 없으며 페이지 내부를 자르지 않았다면 검색 절단이 아니다.
- 최종 `truncated = searchTruncated || collectionTruncated`를 집계 캐시와 응답까지 유지한다. 기존 1,000이슈·300요청·20,000워크로그 상한, 동시성, visibility 제외와 작성자별 필터는 유지한다.
- 기존 10분 캐시의 잘못된 `truncated:false` 재생을 방지하기 위해 `Collab:Date`/`Collab:UserDate` 집계 키를 `Collab:v2:Date`/`Collab:v2:UserDate`로 변경한다. `Collab:` 접두어를 유지하여 user 집계 캐시와 섞지 않는다.
- 같은 대시보드 요청 안에서 동일 프로젝트·기간·작성자 범위를 반복 수집한다면 그 요청에만 속한 Map/Promise를 공유할 수 있다. 다른 날짜·작성자·자격의 데이터를 같은 키로 공유하지 않는다.

새 schema나 migration 의존성은 없다. 기존 v025가 실제 DB에 적용됐는지는 별도 운영 확인 사항이다.

## 6. 프론트 상태·키·무효화

- `useProjectReadAuthority`는 query가 현재 성공일 때만 캐시의 app 값을 사용한다. 최초 실패와 성공 후 재조회 실패 모두 user이며 `isReady:true`, `isError:true`를 노출한다.
- 재조회 실패 시 과거 `collabMode`·감사 필드가 현재 사실처럼 표시되지 않게 하고, 설정은 기존 `loadFailed` 문구와 disabled 상태를 사용한다. 배지는 즉시 숨긴다.
- `readAuthorityOf`도 `getQueryState`를 확인해 오류 상태의 data.app을 인정하지 않는다.
- `COLLAB_ACCESS_LOST_CODES`에 `COLLAB_ACCESS_UNAVAILABLE`을 추가한다. 전용 resolver의 거부 후 access를 다시 조회하여 user 전환을 유도한다. `COLLAB_MODE_OFF`만 조용히 숨기는 coverage UI의 기존 규칙은 유지한다.
- 권한 전환 감지의 메모는 QueryClient 단위로 격리하는 것이 안전하다. 여러 훅이 같은 전환에서 중복 초기화를 일으키지 않아야 한다.
- 하향 전환은 invalidate만으로 완료되지 않는다. 진행 중인 종속 쿼리를 취소하고, 이전 app 데이터·동일 키 서버 판정 데이터를 reset/remove 등으로 제거한 뒤 활성 화면을 다시 조회한다. 늦게 완료된 app 요청이 지운 데이터를 복원하지 않는지 테스트한다.
- `useWorkListGroupPage`·`useWorkListDetail`의 placeholder는 이전과 현재 권한이 같은 경우에만 허용한다. authority가 달라지면 이전 행을 반환하지 않는다. 커서·페이지 상태도 권한 전환 시 기존 app cursor를 새 user 조회에 넘기지 않는지 확인한다.

| 대상 | 키/처리 |
|---|---|
| coverage reader·writer | `collabKeys.coverage(projectId, canWrite)`에 권한 축 추가. 무효화용 `coverageOf(projectId)` prefix 또는 동일 의미 기존 prefix를 유지 |
| coverage 훅 | `usePermissionStore`의 현재 `canWrite('PROJECT')` boolean 변화를 구독하여 키 변경. 클라이언트 권한값은 서버 인가를 대신하지 않음 |
| 목록·캘린더·워크로그 패널 | 기존 app/user 구분 키 유지. app→user 시 이전 데이터·placeholder 제거 |
| 간트·트리·맵·대시보드·인사이트·관계 그래프 | 기존 서버 판정형 키를 하향 전환 시 reset하고 재조회 |
| 설정 mutation 성공 | 기존 access 값 패치 후 access와 종속 뷰 무효화. coverage reader·writer 하위 키 전체 포함 |
| 조회 실패 후 성공 복구 | user→app 전환을 정상 감지하고 관련 화면 재조회. 오류 상태의 app 데이터를 먼저 표시하지 않음 |

새 화면·라우트·대형 UI 구성요소를 추가하지 않는다. 기존 `CollabModeSetting`, `CollabModeNotice`, `CollabCoverageDetails`, `ChartTemplate`을 재사용한다.

## 7. i18n

새 번역 키는 필요하지 않다. 다음 기존 키를 재사용한다.

| 키 | 한국어 | 영어 |
|---|---|---|
| `collab.toggle.loadFailed` | 협업 모드 설정을 불러오지 못했습니다. | Couldn't load the collaboration mode setting. |
| `collab.coverage.truncated` | 관련 작업·스페이스가 많아 일부만 확인했습니다. | Only part was checked because there are many related work items or spaces. |
| `collab.truncated` | 작업이 많아 일부만 표시합니다. | Only part of the items are shown because there are too many. |

구현상 문구가 필요해지면 `locales/kr/collab.json`·`locales/en/collab.json`에 추가하고 merge한다. 시작부터 수정 상태인 생성 번역 파일의 기존 변경을 보존한다.

## 8. 작업 소유권·검증

| 담당 | 소유 범위·의존성 |
|---|---|
| 설계 agent | 이 `01_architect_design.md`만 작성 |
| 리더/backend | CollabAccess, ProjectCollabService, ErrorCodes, CollabCoverageService와 관련 테스트; 오류·KVS 키 계약 먼저 확정 |
| frontend agent | useProjectReadAuthority, useProjectCollabCoverage, collabErrors, collabKeys 및 영향 소비자·테스트; 위 오류 코드와 권한 축 적용 |
| worklog agent | CollabWorklogFetcher, 필요한 대시보드 요청 내 재사용과 관련 테스트; 기존 응답 shape 유지 |
| 통합 검증 | 생산자·모든 소비자·권한 실패·캐시·placeholder 계약을 실제 변경 코드와 대조 |

필수 회귀 시나리오:

1. SQL 예외: 내부 reason UNAVAILABLE/user, 외부 설정 조회는 success:false, 전용 6종과 coverage는 Jira 호출 없이 거부, 서버 판정형 읽기는 user.
2. 실패 응답 직렬화·로그에 쿼리·accountId를 넣은 원본 예외 문자열이 포함되지 않음.
3. 실제 QueryClient에서 app 성공 → 재조회 실패: 훅과 readAuthorityOf가 user, 배지가 숨겨지고 토글 disabled/loadFailed, 종속 데이터가 제거됨. 최초 실패와 성공 복구도 확인.
4. 앱 결과가 늦게 resolve되는 경합, 여러 훅·서로 다른 QueryClient, 목록 placeholder와 app cursor 재사용을 확인.
5. 동일 accountId의 write true→false 및 false→true: 이전 반대 권한 KVS 응답 미사용; frontend 키 변경; prefix 무효화가 양쪽에 도달.
6. coverage 인가 실패 시 캐시 적중도 허용하지 않음. app 검색에 나온 프로젝트는 추가 권한 호출 없음; 검색에 안 나온 구독/사용자전용 프로젝트는 실제 확인; null 확인 반복 없음; 예산/동시성 상한 준수.
7. 999개/정확히 1,000개 종료/1,000개+커서/한 페이지 초과/요청 예산 소진의 truncated 경계. 일별·사용자별 집계와 대시보드 UI 경고 전달 및 v2 캐시 확인.
8. 기존 OFF·비참여·스코프 밖·principal 누락, 공개 제한 워크로그·작성자 필터, 간트 쓰기의 user 자격 회귀.

설계 단계에서는 테스트를 실행하지 않았다. 구현 후 공통 검증 기준에 따라 루트 `npm test -- --runInBand`, `static/ui`의 동일 테스트와 `CI=true npm run build`, 앱 루트 `pwd` 확인 후 `forge lint`를 실행한다. 통과·실패·미검증을 구분하고 실제 환경 동작을 테스트 통과로 대체하지 않는다.
