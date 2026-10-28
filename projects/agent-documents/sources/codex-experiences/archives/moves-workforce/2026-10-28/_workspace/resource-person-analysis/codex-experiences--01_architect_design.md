# 개인 종합 분석 설계

## 1. 목적·완료 조건·범위
- 인력 현황 → ResourceProfileDrawer → 상세보기 → 개인 종합 분석. 별도 전사 탭은 만들지 않는다.
- /resource/people/:accountId 독립 lazy 페이지. 선택 인력의 현재 프로필·진행 작업·스킬·프로젝트 경험과 기간별 기록 시간·추이·프로젝트 비중·원본 워크로그 근거 제공.
- 기본 최근 28일(사용자 로컬 오늘 포함), 기간 선택 최대 92일. 프론트는 로컬 오늘까지만 선택하고 서버는 timezone 차이로 정상 요청을 거부하지 않도록 UTC+14 오늘을 최종 날짜 상한으로 삼는다. 과거 실적만 다루며 capacity·계획 배정률·미래 여력·비용은 제외.
- 직접 URL 진입, 기간 변경, 데이터 없음, 권한 거부, 오류/재시도, 원래 목록 복귀 지원.
- 범위 안내: 현재 RMS 참여 프로젝트 중 조회 권한이 있는 프로젝트와 Jira에서 열람 가능한 이슈의 기록. 과거 배정이 삭제된 프로젝트는 포함되지 않을 수 있으므로 전 생애 실적이라 표현하지 않는다.

## 2. 조사 근거와 재사용
| 실제 위치 | 계약/이유 |
|---|---|
| static/ui/src/pages/resource/overview/profile/ResourceProfileDrawer.jsx:47 | props isOpen/accountId/fallbackPerson/canWrite/onClose. 헤더/푸터 상세보기 추가. 공용 SideDrawer 재사용 |
| src/resolver/resourceManagement/ResourceManagementService.js:274 | getResourceProfileService({accountId},principal) -> {content:{profile,load,inProgressIssues,experience}}. 현재 상태 재사용 |
| src/resolver/resourceManagement/ResourceManagementService.js:189 | visibleAccountIds(principal). TeamAnalyticsScope 단일 출처. export 승격 또는 동일 파일 공용 assert로 신규 서비스에 연결 |
| src/permission/PermissionMap.js:309 | getResourceProfile: RESOURCE_MANAGEMENT read 또는 대상 accountId 팀장 축 |
| src/permission/PrincipalResolver.js:460 | scopedProjectIds(principal) null=전체, []=없음, 배열=허용 RMS 프로젝트. 신규 조회와 프로필 이력에 공통 적용 |
| src/rdb/query/ProjectUsersQuery.js:167 | FIND_HISTORY_BY_ACCOUNT -> project_id/name/role/status/start/end. 급여 없음. 프로젝트 기간이며 개인 투입/철수 날짜 아님 |
| src/resolver/myWork/MyWorkController.jsx:18 | getMyCalendarWorklog는 SELF accountId 강제. 타인 조회로 확장하지 않음 |
| src/resolver/myWork/MyWorkService.jsx:143 | author+기간 필터 방식 참고. 기존 검색은 nextPageToken 미순회 |
| src/resolver/resourceAnalysis/ResourceWorklogFetcher.js:71 | getResourceProjectWorklogs -> [{issueKey,issueSummary,issueTypeIconUrl,accountId,date,timeSpentSeconds}]. id/started 없음, 이슈 검색 nextPageToken 없음. ProjectProgress/ProjectCost/PortfolioAggregator도 소비. 직접 변경 없이 신규 전용 페처에서 페이지 처리 패턴만 활용 |
| src/api/jira/worklog/WorklogApi.js:4 | getWorkLogByIssueKey({issueIdOrKey,startAt,maxResult,as:'user'}) -> Jira worklog page. 새 페처에서 재사용 |
| src/api/jira/util/RequestJiaJson.js:17 | requestJiraJson({as:'user',url}) 오류 throw. fallback 지정하지 않음 |
| static/ui/src/pages/myPage/hooks/useMyContribution.js:27 | 순수 집계 패턴 참고. 현재 MyPage 표현은 본인 전용·RMS projectId 누락이라 컴포넌트 통째 재사용하지 않음 |
| static/ui/src/App.jsx:118 | /resource 형제 lazy route + 기존 Suspense/ForgeHistoryRouter 유지 |
| static/ui/src/utils/queryKey/resourceKeys.js:1 | resource prefix를 유지한 personAnalysis 팩토리 |
| src/index.js:83 | registerResourceManagementController는 이미 CONTROLLER_REGISTRARS 등록됨. 같은 Controller에 추가하므로 배열 중복 추가 금지 |
| manifest.yml:156 | 실제 runtime nodejs22.x. 이번 변경 schema/scope/runtime 불변 |
| src/nosql/query/CustomEntityManager.js:102 | findAllPaged 지원. 새 KVS 저장/전량 사전 쿼리 없음 |

공용 UI: PageContainer, Card/Summary, SkeletonCards/SkeletonTable, CommonTable/PagingTable, SkillTags, InProgressIssueList, ProjectHistoryList. React 18·Atlaskit·TanStack Query 5·ECharts 기존 의존성 사용.

## 3. resolver 경계면 계약
### getResourcePersonAnalysis
| 항목 | 확정 계약 |
|---|---|
| 입력 | {accountId:string,startDate:'YYYY-MM-DD',endDate:'YYYY-MM-DD'}. 모두 필수. accountId 1~128자, 제어문자 거부 및 JQL quote escape. 실제 유효 날짜, start<=end, inclusive 최대 92일, 미래 종료 거부 |
| 성공 | {success:true,content:{accountId,period:{startDate,endDate},projects:[{projectId,projectName}],worklogs:[WorklogRow],meta:{fetchedAt,scope:'CURRENT_MEMBERSHIPS',complete:true}}} |
| WorklogRow | {id:string,issueId:string,issueKey:string,issueSummary:string,projectId:string,projectName:string,started:string,date:'YYYY-MM-DD',timeSpentSeconds:number}. id는 worklog id. author는 서버 검증 후 반환 불필요. comment·급여·다른 작성자 데이터 미포함 |
| 빈 결과 | projects:[],worklogs:[] 또는 projects는 있고 worklogs:[]; 정상 성공. 0시간과 조회 실패 구분 |
| 오류 | USER_ID_REQUIRED, USER_NOT_FOUND(없는/범위 밖 인원 동일), RESOURCE_ANALYSIS_INVALID_RANGE, RESOURCE_ANALYSIS_LIMIT_EXCEEDED, Jira 오류. {success:false,error:{name,code,message,cause}}. 외부 오류의 민감한 cause는 UI 직접 노출 금지 |
| 가드 | getResourceProfile과 동일 {...R('RESOURCE_MANAGEMENT'),teamLead:{accountTargets:['accountId']}}. project:'none' 상태에서 서비스가 리스트 범위 필터 |
| 데이터 범위 | principal 누락 fail-close; TeamAnalyticsScope로 대상 계정 검증; SQL 참여 project 목록 ∩ scopedProjectIds(principal). asUser Jira issue/worklog visibility 추가 적용 |
| 소비자 | 신규 useResourcePersonAnalysis 훅만. 기존 backend 소비자 없음 |
| 서버 캐시 | 없음. 인가마다 재검증. SQL 적재/KVS 캐시 도입 없음 |
| 상한 | 92일, 최대 참여 프로젝트 50개, 검색 이슈 1000개, 검사 worklog 20000개, 반환 대상 worklog 5000개, 요청 총 200회. 임계 초과 시 전체 실패 LIMIT_EXCEEDED. 잘린 값으로 차트/총량 출력 금지. 기간 축소 안내 |
| 페치 | 프로젝트별 worklogAuthor+날짜+RMS id JQL, 검색 nextPageToken 끝까지. worklog inline+추가 page 끝까지, 최종 author===accountId 및 started.slice(0,10) inclusive 필터. issueId+worklogId 중복 제거. 프로젝트 id는 검색한 RMS 프로젝트에서 부착. 전체 요청 p-limit(3~5) 공유, 무제한 fanout 금지 |
| 날짜 | 워크로그 started에 보존된 날짜(문자열 첫 10자리) 기준. 브라우저 UTC 변환으로 날짜 바꾸지 않음. JQL 후보 날짜만 양끝 2일 확대하여 timezone 차이를 흡수하고 최종 필터는 요청 기간 그대로 적용 |
| 실패 정책 | 임의 page 실패, 응답 구조 불완전/반복 cursor/total 대비 미완료는 오류. 완전 조회 0건과 구분 |

성공 예:
```json
{"success":true,"content":{"accountId":"abc","period":{"startDate":"2026-08-11","endDate":"2026-09-07"},"projects":[{"projectId":"uuid","projectName":"프로젝트 A"}],"worklogs":[{"id":"100","issueId":"101","issueKey":"ABC-1","issueSummary":"화면 개발","projectId":"uuid","projectName":"프로젝트 A","started":"2026-09-01T09:00:00.000+0900","date":"2026-09-01","timeSpentSeconds":7200}],"meta":{"fetchedAt":"2026-09-07T00:00:00.000Z","scope":"CURRENT_MEMBERSHIPS","complete":true}}}
```

### getResourceProfile (기존 계약 유지 + 범위 보완)
- 입력·응답의 모든 기존 필드 유지. 조회 대상 계정 인가 공용 함수 재사용.
- experience.projectHistory는 scopedProjectIds 교집합 적용. 원래 모든 프로젝트 이력이 노출되던 결함을 보완한다.
- 신규 페이지는 기존 profile.load/inProgressIssues를 종합 분석의 현재 작업 지표로 표시하지 않는다. 기존 드로어의 광범위 부하 계산은 이번 변경에서 재설계하지 않는다. 신규 페이지 현재 정보는 profile 기본정보·스킬·범위가 필터된 프로젝트 경험으로 한정한다. 기간 분석의 이슈/워크로그 근거는 신규 endpoint가 제공한다.
- 기존 load.projectCount 등은 이번 분석 페이지가 소비하지 않는다. 프로젝트 경험의 필터와 기존 드로어 load의 계산 기준이 다른 점을 유지하여 신규 분석에서 혼합하지 않는다.
- 기존 형제 소비자: ResourceProfileDrawer(인력현황·프로젝트 배정·프로젝트 상세·MyPage 팀 섹션), useResourceProfile. 신규 page도 같은 응답 소비.
- 현재 작업 기존 페처의 실패 fallback이 유지된다면 현재 상태는 참고 정보임을 표시하고 기간 분석 결과와 분리. 새 분석 조회에서 fallback을 도입하지 않는다.

## 4. 권한 행렬
| 사용자 | 대상 인원 | 프로젝트 |
|---|---|---|
| 관리자/전사 자원 조회 | ALL | scopedProjectIds=null 전체 참여 프로젝트, Jira asUser에서 보이는 이슈 |
| 팀장 | leadingScopeAccountIds만 | principal 프로젝트 범위 교집합 |
| 일반 멤버/조직 범위 NONE | 거부 | 조회하지 않음 |
| principal 없음 | 거부 | SQL/Jira 상세 조회 이전 차단 |
| 임의 URL accountId 조작 | 동일 인가 | 프론트 게이트와 무관하게 거부 |

SELF API를 확장하거나 급여 경로를 재사용하지 않는다. 프로젝트 이력은 RMS 메타데이터 권한, 이슈/워크로그는 Jira asUser 권한으로 추가 제한된다. 대상 인원이 작성했어도 현재 프로젝트 참여 이력이 없으면 이번 범위에서 제외.

## 5. 백엔드 구조
- ResourceManagementController -> ResourcePersonAnalysisService -> SQL ProjectUsersQuery + ResourcePersonAnalysisFetcher -> Jira.
- 기존 ResourceManagementService의 대상 계정/프로젝트 스코프 공용 검증을 추출/재사용. duplicate TeamAnalyticsScope 판정 금지.
- 새 Service/Fetcher/테스트, PermissionMap, ErrorCodes, 기존 프로필 보완만 담당.
- 기존 getResourceProjectWorklogs/global IssueApi의 응답 계약 변경 없음.
- 실제 추가 오류: RESOURCE_ANALYSIS_INCOMPLETE(불완전 Jira 응답), RESOURCE_ANALYSIS_PROJECT_LIMIT_EXCEEDED(참여 프로젝트 상한, 기간 축소로 해결되지 않음). 기존 LIMIT_EXCEEDED와 구분한다.
- 실제 TeamLeadFieldPolicy의 읽기 payload allowlist에도 accountId/startDate/endDate를 등록한다.
- DDL/KVS entity/scope 변경 없음. deploy/install 이번 작업 범위 아님.

## 6. 프론트 구조·상태·캐시
- 신규 pages/resource/personAnalysis/ResourcePersonAnalysisPage.jsx 및 hook/순수 집계 utils.
- 드로어 상세보기 버튼은 accountId 있을 때 노출, 로딩/오류 중 동작 정책은 권한 확인 후 진입. navigate('/resource/people/'+encodeURIComponent(accountId), {state:{returnTo:pathname+search}}), onClose 실행.
- 복귀는 안전한 내부 returnTo 또는 /resource?tab=overview. 전체 전사 탭 추가 없음.
- 페이지 인가: RESOURCE_MANAGEMENT read 또는 isTeamLead, 최종 서버가 대상 검증. UI에 계정 fallback은 오류 시 개인정보처럼 노출하지 않는다.
- 상단 프로필·스킬·프로젝트 경험과 기간 분석을 분리. 현재 부하 카드·진행 작업 목록은 이번 신규 페이지에 복제하지 않는다. 필터 기간이 프로젝트 경험까지 바꾸는 것처럼 표현 금지.
- 기간 filter URL startDate/endDate 복원. 적용 버튼 또는 검증된 변경으로 조회. 28일/이번 달/지난달 빠른 선택 가능.
- 요약: 기록 시간, 기록 일수, 작업한 이슈 수, 투입 프로젝트 수. 기록 시간이 성과/유휴 판단이라는 표현 금지.
- 일별 추이(빈 날 0), RMS 프로젝트별 시간/비중(0 분모 안전), 근거 table(날짜/프로젝트/이슈/시간), 프로젝트 선택으로 근거 table 필터.
- Jira 이슈 열기는 @forge/bridge router.open/viewIssue 기존 패턴 사용. 데이터 행의 자유 URL을 직접 실행하지 않음.
- 데이터 훅은 success/shape 검사 실패 throw; keepPreviousData로 다른 인력·권한 응답을 표시하지 않음.
- 새로운 쿼리 key: resourceKeys.personAnalysis(accountId,startDate,endDate,viewerScope) -> ['resource','personAnalysis',accountId,startDate,endDate,viewerScope].
- viewerScope에는 호출자 accountId, RESOURCE read, team scope, projectScope, leadingTeamKeys(정렬), 권한 조회 상태 포함. 계정·권한 전환 시 이전 데이터 표시 금지.
- 프로필 역시 profile(accountId) prefix는 무효화 호환 유지하고 뒤에 viewerScope를 붙이는 확장 가능. 기존 profile prefix invalidation 모든 scoped variant에 적용.
- staleTime 60초, 활성 mount 재검증; 새로고침 버튼은 해당 인원 분석/프로필 refetch.

| mutation | 영향 |
|---|---|
| 스킬 편집 | 기존 resource profile(accountId)/overview invalidation 유지, 분석 worklog 재조회 불필요 |
| 프로젝트 인력 배정/해제 | resource prefix 기존 invalidation 확인, 빠져 있으면 personAnalysis prefix 추가 |
| 워크로그 추가/수정/삭제 | personAnalysis prefix invalidation을 기존 worklog invalidation 공용 지점에 추가(여러 화면 공용 확인) |
| 권한 변경 | viewerScope key 변경 및 permission reload 시 이전 데이터 제거 정책 유지 |

## 7. i18n
locales/kr/resource.json·locales/en/resource.json에 resource.personAnalysis.* 추가(실제 기존 파일 확인 후 동일 도메인 파일 사용).
| suffix | kr | en |
|---|---|---|
| viewDetails | 상세보기 | View details |
| title | 개인 종합 분석 | Person analysis |
| back | 목록으로 돌아가기 | Back to list |
| period | 분석 기간 | Analysis period |
| recordedHours | 기록 시간 | Logged hours |
| loggedDays | 기록 일수 | Days with worklogs |
| issueCount | 작업 이슈 수 | Issues with worklogs |
| projectCount | 투입 프로젝트 수 | Projects with worklogs |
| trend | 기간별 투입 추이 | Logged time over time |
| composition | 프로젝트별 투입 구성 | Logged time by project |
| evidence | 워크로그 상세 | Worklog details |
| currentState | 현재 작업 현황 | Current workload |
| experience | 스킬 및 프로젝트 경험 | Skills and project experience |
| empty | 선택한 기간에 기록된 워크로그가 없습니다. | No worklogs in the selected period. |
| loadError | 분석을 불러오지 못했습니다. 다시 시도해 주세요. | Could not load analysis. Please try again. |
| invalidRange | 오늘까지 최대 92일의 기간을 선택해 주세요. | Select a range of up to 92 days ending today or earlier. |
| limitExceeded | 조회량이 많습니다. 분석 기간을 줄여 주세요. | Too much data. Please select a shorter period. |
| scopeNote | 현재 참여 중인 RMS 프로젝트 중 조회 가능한 이슈의 기록입니다. 기록이 없다는 이유만으로 유휴 상태를 의미하지 않습니다. | Worklogs from accessible issues in current RMS project memberships. No worklogs does not imply availability. |
| currentNote | 현재 상태이며 선택한 분석 기간과 별개입니다. | Current status, independent of the analysis period. |
| dateBasis | 워크로그에 기록된 날짜 기준 | Dates as recorded in worklogs |

table 열/기간/재시도/새로고침은 공용 키 재사용. npm run merge 생성본 직접 편집 금지.

## 8. 소유권·의존성·검증
- architect: 이 파일만. 구현 코드 수정 없음.
- backend: src/resolver/resourceManagement 관련 Service/Fetcher/Controller, PermissionMap, ErrorCodes, 테스트, 필요한 공용 query(기존 shape 유지).
- frontend: App.jsx, profile 드로어·훅, 신규 page/hook/utils, resourceKeys, mutation invalidation 공용 지점, kr/en 번역, frontend 테스트.
- verifier/root: 최종 계약 대조, 전체 backend/frontend 테스트, CI=true build, root pwd 후 forge lint. 설계 단계에서는 실행 검증 미수행.
- 필수 테스트: 권한 없는 인원 direct invoke, principal 누락, 팀장 자기 팀/타 팀, 프로젝트 범위 밖 이력/워크로그 제외, SELF resolver 무회귀, Jira search 2페이지·worklog 3페이지, 혼합 작성자 author 필터, 날짜 경계, 중복 ID, 0초/빈 결과, 페이지 실패/상한 초과시 오류, RMS 프로젝트별 정확한 합산.
- 프론트: 드로어 버튼→정확한 encoded id route, 새로고침 직접 진입, 복귀, 기간 변경시 query 변화, account/viewer 변경시 기존 데이터 미표시, 요약=trend=project=sum(rows), 0 분모, 실패/empty 분리, 기존 프로필 소비자 회귀.
- 앱 소스가 변경된 이후 구현 담당자는 의도한 계약 변경을 architect/root와 조율하고 최종 보고서에 실제 필드/상한/검증을 기록한다.
