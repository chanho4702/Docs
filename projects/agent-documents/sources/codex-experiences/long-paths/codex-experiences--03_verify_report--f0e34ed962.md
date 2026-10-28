# 협업 모드 보완 통합 검수

검수 날짜: 2026-09-30. 시작 HEAD는 `bad31d94a6b137c6baaf8bcb2433884978c4fad2`다. 검증 도중 다른 세션이 기존 이슈 생성/Bitbucket 연동 제거 작업을 커밋하여 최종 HEAD가 `2932ecbb4cc1502e57b5b50c48aca89119f2a0df`로 이동했다. 이번 협업 모드 변경은 그 위의 미커밋 작업 트리이며 해당 사용자 UI/locales 변경이 커밋된 것이지 검수자가 되돌린 것이 아니다. 저장소는 `C:\CloudJira\moves-workforce`다. `integration-verify`와 `feature-harness`의 계약 교차 검증을 적용했다.

읽기 전용으로 요구사항·설계·구현 보고서와 실제 생산자/소비자 코드를 비교했다. 검수자 소유 범위는 이 보고서뿐이며 앱 소스, 사용자 기존 dirty changes, 배포·설치·DB를 변경하지 않았다. 전체 테스트/빌드는 리더가 담당하고, 동일한 최종 소스에 대한 유효한 실행 증거를 재사용한다.

## 판정

- 통과: 이번 변경의 오류·권한·캐시·절단·소비 계약. 독립 검토에서 추가 수정이 필요한 결함은 확인하지 못했다.
- 통과: 전체 backend/frontend, frontend 변경 관련 테스트, CI 빌드의 app/panel 및 번들 예산, 변경 파일 공백 검사.
- 통과(제한 있음): 빌드 이후 Forge lint exit 0, `No issues found`. 필수 검증 명령 실행은 완료했다. 다만 `PermissionLinter: Unknown product`가 남아 해당 일부 권한 검사는 미검증이다.
- 미검증: 실제 Jira 사이트의 v025 적용 상태, 중복 환경/동명 필드 문제 해소, 배포 후 브라우저 동작, 운영 지연 시간.

## 실제 계약 교차 확인

| 경계 | 판정 및 근거 |
|---|---|
| SQL 실패와 정상 OFF | `src/permission/CollabAccess.js:79`의 SQL catch는 `UNAVAILABLE/user`이며 `ProjectCollabService.js:17`이 안전한 `COLLAB_ACCESS_UNAVAILABLE`로 변환한다. 원문 오류를 cause에 넣지 않고 SQL 예외 로그도 제거했다. `responseWrapper.js`가 이를 `{success:false,error}`로 직렬화한다. |
| 협업 전용 읽기와 coverage | 목록 4개 서비스, 캘린더, 이슈 워크로그가 모두 Jira 호출 전 `assertCollabReadAccess`를 실행한다. coverage는 `CollabCoverageService.js:97`에서 fresh 판정 후 캐시를 읽으며 `OFF + writer`만 예외다. SQL 실패는 writer도 거부한다. |
| 서버 판정형 읽기·쓰기 | `resolveCollabReadAuthority`의 모든 호출부를 검색하여 간트·ProjectDashboard·DashboardInsight·RelationGraph의 `app\|user` 소비를 확인했다. 실패 시 user가 유지되고 기존 쓰기 검증의 자격/범위에는 변경이 없다. |
| 등록·인가 | `ProjectCollabController`의 공통 define은 `guardedDefine`과 `assertSingleProjectKey`를 거치며 principal을 모든 서비스에 전달한다. `src/index.js` 등록과 `PermissionMap.js:399`의 기존 PROJECT read/detail 및 설정 write/detail을 유지한다. 새 resolver·scope·schema가 없다. |
| backend coverage 캐시 | `CollabCoverageService.js:43`의 `Collab:coverage:v2:<projectId>:<accountId>:reader\|writer` 키는 현재 서버 write 판정을 포함한다. 권한 회수/승격에서 반대 역할과 구버전 키를 읽지 않는다. TTL 2분과 앱 공유 캐시 TTL 5분을 유지한다. |
| frontend coverage 캐시 | `useProjectCollabCoverage.js:56`이 현재 write boolean을 구독한다. `collabKeys.js:13`의 project prefix로 양쪽 역할 키에 갱신이 도달한다. writer→reader 시 이전 writer 결과를 새 키에 placeholder로 전달하지 않는다. |
| 요청 효율성 | `CollabCoverageService.js:68`은 현재 앱 검색에서 확인된 프로젝트에 `mypermissions`를 재요청하지 않는다. 검색에 없던 구독/본인 전용 프로젝트는 확인하고, 미확인 키를 false로 단정하지 않는다. null도 확인 결과로 기억하여 같은 요청에서 반복 확인하지 않는다. 공유 200요청·권한 동시성 4를 유지하고 사용자 Promise 전역 공유는 추가하지 않았다. |
| access 재조회 실패 | `useProjectReadAuthority.js:52`와 `collabErrors.js:35`는 query 성공 상태에서만 app을 인정한다. 실패 시 user/UNAVAILABLE, 과거 설정/감사 필드 제거, 배지 숨김·기존 오류 UI/설정 차단이 연결된다. |
| 권한 하향과 동시 요청 | `collabKeys.js:32`의 scoped reset은 같은 키를 쓰는 간트·대시보드·인사이트·관계 그래프까지 초기화한다. 설치된 TanStack 소스의 `queryClient.resetQueries → query.reset → destroy → cancel({silent:true})` 경로와 실제 QueryObserver 테스트를 함께 확인했다. 늦은 앱 응답 복원 방지, 다른 프로젝트 cache 보존, WeakMap의 client별 분리가 검증된다. |
| 목록 placeholder·cursor | `useWorkListQueries.js:316`/`:349`는 프로젝트와 authority 구분이 같은 key 길이일 때만 이전 행을 유지한다. key factory는 app에만 세그먼트를 하나 추가한다. `useWorkListFlatPage.js:24`와 `useWorkListHierarchy.js:54`는 authority 변경 시 cursor/page/expand를 재설정해 app cursor가 user 조회에 전달되지 않는다. |
| 워크로그 절단·집계 | `CollabWorklogFetcher.js:140`부터 검색 잔여 상한을 적용한다. 정확히 1,000개 완결과 다음 커서 잔존을 구분하고 한 페이지 초과도 절단 처리한다. 최종 flag는 집계 `{rows,truncated}`를 거쳐 `ProjectDashboardService`의 heatmap/lineStack 및 `ChartTemplate.js:543`의 기존 경고로 전달된다. |
| 오래된 집계 캐시 | `CollabWorklogFetcher.js:217`/`:225`는 `Collab:v2:Date`/`Collab:v2:UserDate`로 잘못된 구 캐시를 피한다. user 캐시와 분리, 작성자 hash, TTL 10분, 300요청·5워커·20,000워크로그 상한과 visibility/기간/작성자 필터는 유지한다. |
| 번역·UI 계약 | 신규 번역·라우트·UI Kit 사용은 없다. 기존 `collab.toggle.loadFailed`, coverage 실패/절단 문구와 dashboard 절단 경고를 사용한다. 생성 번역의 사용자 변경은 검수자가 수정하지 않았다. |

coverage 단독 실패는 기존 범위 확인 실패 UI로 처리하며 `COLLAB_MODE_OFF`만 조용히 생략한다. 목록 4개/워크로그 2개의 `invokeCollab` 경로는 `COLLAB_ACCESS_UNAVAILABLE`에서 access를 재조회한다. access query 자체가 실패할 때 user 전환과 배지 숨김이 실행되는 것으로 frontend 담당과 계약을 확인했다.

## 권한 행렬

| 조건 | 기대/확인 결과 |
|---|---|
| ON + ACTIVE + 참여 + 범위 허용 | app 읽기; coverage는 현재 reader/writer별 DTO |
| ON + 비참여(관리자 포함) | 전용 읽기와 coverage 거부; 서버 판정형은 user |
| 정상 OFF + PROJECT write | 전용 읽기 거부; coverage만 켜기 전 확인용 허용 |
| 정상 OFF + reader | 전용 읽기·coverage 거부 |
| SQL unknown-column/timeout | 전용 읽기·coverage는 안전한 UNAVAILABLE 오류, 서버 판정형 user |
| principal 누락·프로젝트 범위 밖 | fail-close; 캐시로 우회하지 않음 |
| payload의 서로 다른 projectId/project_id | Controller에서 거부 |

ALL/MEMBER_ONLY/TEAM_ONLY·관리자·참여 여부의 기존 `CollabAccess` 회귀, visibility 제한 워크로그·작성자 필터 및 간트 user 쓰기 자격 회귀를 전체 backend 테스트와 실제 공통 판정 경로로 확인했다. 급여/원가/명부/SELF mutation/권한 세트 배정은 이번 변경이 없고 응답 확장도 없어 추가 기능 검증 대상이 아니다.

## 실행 증거

| 명령/디렉토리 | 결과 | 근거 |
|---|---|---|
| `npm test -- --runInBand` / app root | 통과, exit 0, 144 suites / 1,965 tests | 리더 최종 backend 실행, 세션 `7073`. 이후 backend 소스 변경 없음. |
| `npm test -- --runInBand --testPathPatterns='CollabAccess\|ProjectCollabService\|CollabCoverageService'` / app root | 통과, exit 0, 3 suites / 43 tests | 리더 backend 보고서 및 실행 결과. |
| `npm test -- --runInBand src/api/jira/worklog/__test__/CollabWorklogFetcher.test.js src/resolver/projectCollab/__test__/CollabWorklogServices.test.js src/resolver/projectDashboard/__test__/DashboardCollabCacheKeys.test.js` / app root | 통과, exit 0, 3 suites / 41 tests | worklog 담당 세션 `53480`, 최종 chunk `6f905e`; 실제 테스트 소스 대조. |
| `npm test -- --runInBand src/hooks/__test__/collabReadAuthority.test.js src/components/collab/__test__/collabUi.test.jsx src/components/collab/__test__/collabFollowup.test.jsx src/pages/projectDetail/issue/__test__/workListCollab.test.js src/pages/projectDetail/issue/workListQuery.test.js src/pages/projectDetail/issue/workListTree.test.js` / `static/ui` | 통과, exit 0, 6 suites / 104 tests | frontend 담당 최종 세션 `30419`; 경합·placeholder·cursor·role 테스트의 실제 코드를 확인. |
| `git diff --check -- <이번 변경 파일>` / app root | 통과, exit 0 | 검수자 직접 실행 chunk `4ea82c`. 별도 로그 파일 없음. LF→CRLF 안내만 존재. |
| `npm test -- --runInBand` / `static/ui` | 통과, exit 0, 131 suites / 2,099 tests / 1 snapshot | 리더 최종 frontend 실행 세션 `80180`, 78.097초. 대상 최종 소스 확인 후 실행했으며 중복 전체 실행하지 않음. |
| `CI=true npm run build` / `static/ui` | 통과, exit 0 | 리더 세션 `2170`, 최종 chunk `133775`. prebuild merge, app, panel, 양쪽 bundle 검사가 모두 통과했다. main gzip 481,710/950,000 bytes, panel 329,338/350,000 bytes. |
| `pwd` 후 `forge lint` / app root | 통과(제한 있음), exit 0, `No issues found` | 리더 최종 세션 `50632`, chunk `f41837`. build 후 `valid-resource-required` 오류는 해소됐다. 직전 chunk `45e5f0`의 `PermissionLinter: Unknown product` 때문에 일부 권한 검사는 미검증이며 CLI 13.4.0 갱신 안내도 남는다. |

동일 최종 소스에 대한 유효한 결과를 재사용하며, 검수자가 전체 테스트·빌드를 중복 실행하지 않았다. 별도 로그 파일이 없는 결과는 세션 출력과 구현 보고서/리더 전달 근거를 명시했다.

CI 빌드 경고: 외부 패키지 `@atlaskit`/`marklassian`의 source-map 원본 누락, Browserslist 데이터 갱신 안내, 번역 merge 스크립트의 `MODULE_TYPELESS_PACKAGE_JSON`. 빌드는 exit 0이며 이 경고를 이유로 의존성·package·manifest를 변경하지 않았다.

검증 이후 타 세션이 `IssueCreateModal.jsx`와 `issueCreate.js`를 다시 수정 중이다. 위 전체 테스트·빌드 결과는 실행 시점 소스 기준이며 이 두 파일의 이후 변경까지 검증했다는 뜻은 아니다. 이번 협업 수정 소스는 변경 없이 유지되며 타 세션의 추가 변경은 보존했다.

## 실패·미검증의 구분

확인된 신규 코드 결함: 없음. 첫 Forge lint는 산출물 부재로 exit 1이었으며 최종 build 후 재실행에서 exit 0으로 해소됐다. `Unknown product`로 실행되지 못한 일부 권한 검사는 최종 exit 0으로 덮지 않는다. 앱 자체 PermissionMap/가드 계약과 범위 회귀는 backend 테스트 및 실제 코드에서 별도로 확인했다.

운영 원인의 해결 여부는 이번 코드 테스트로 증명되지 않는다. 원격 SQL v025, 동일 사이트의 다중 환경/동명 projectId 필드, 해당 사이트에 어떤 소스가 배포됐는지, 실제 브라우저 2계정 권한 전환은 별도 운영 검증이다. 본 작업은 배포·설치·migration·앱 제거를 수행하지 않았다. 실제 최초 조회 지연과 동시 cache miss 부하는 측정하지 않았으므로 요청 수 감소를 운영 성능 보장으로 표현하지 않는다.

최종 검증 이후 다른 세션이 `IssueCreateModal.jsx`와 `issueCreate.js`를 다시 수정하기 시작했다. 이 두 파일의 새 dirty 변경은 이번 협업 범위 밖으로 보존했으며 최종 내용은 미검증이다. 위 테스트·빌드 통과는 각 명령 실행 당시 소스에 대한 증거이고 이후 무관한 변경까지 포괄하지 않는다. 협업 대상 소스에는 이후 변경이 없다.
