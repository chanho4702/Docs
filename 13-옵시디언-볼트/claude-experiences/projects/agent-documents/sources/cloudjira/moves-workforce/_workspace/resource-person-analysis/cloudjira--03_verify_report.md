# 개인 종합 분석 통합 검증

## 판정

- **구현 및 로컬 검증 통과.** 정적 권한·계약, 전체 테스트, CI 빌드, 최종 fixture 및 Forge lint 명령을 확인했다. 루트의 브라우저 검사에서 발견한 한국어 번역 손상은 원본/생성본 복구와 최종 브라우저 재검증으로 해소했다.
- 전체 테스트·CI 빌드·Forge lint는 루트의 최종 로그와 종료 코드를 확인하여 재사용했다. Forge PermissionLinter 일부 검사는 도구 오류로 수행되지 않았다.
- 실제 Jira 설치에서의 권한·데이터·지연 시간 검증은 미검증이다. mock/fixture와 실제 사이트 검증을 혼동하지 않는다.
- 기준 HEAD: `0e9074cb08c1703c1f8fb6e449c1865cdc9271c0`. 공유 작업의 `AGENTS.md`, `README.md` 변경은 이번 구현 밖의 기존 변경이며 보존했다. 본 검토자는 앱 소스를 수정하지 않았다.

## 요구사항과 실제 경계

| 항목 | 판정 | 코드 근거 |
|---|---|---|
| 인력 현황 드로어 → 상세보기 → 선택 인원 페이지 | 통과 | `ResourceProfileDrawer.jsx:73`에서 encoded accountId와 returnTo 전달, `App.jsx:120`의 lazy route. 전사 분석 탭은 추가하지 않음 |
| 별도 인원·기간 응답 혼입 방지 | 통과 | `useResourcePersonAnalysis.js:8`, `personAnalysisUtils.js:46`: 인원/기간/viewerScope key와 응답 인원·기간 일치 검사. keepPreviousData 없음 |
| 현재 정보와 기간 실적 구분 | 통과 | `ResourcePersonAnalysisPage.jsx`: 프로필·스킬·프로젝트 경험은 현재 정보 안내를 붙이고 기간 KPI/추이/근거와 분리. 기존 load/inProgressIssues를 신규 페이지에 표시하지 않음 |
| 시간 집계와 원본 근거 | 통과 | `personAnalysisUtils.js:15`: 하나의 worklog 배열로 KPI·날짜별 합·프로젝트별 합 생성, 기록 없는 날 0, 총 0초일 때 비율 0 |
| 범위와 날짜 안내 | 통과 | 현재 RMS 참여 관계와 Jira에서 조회 가능한 이슈만 포함한다는 안내. started 문자열 날짜를 사용하고 미래 여력·개인 배정 기간을 계산하지 않음 |
| 실패·빈 결과 분리 | 통과 | Service/Fetcher가 페이지 실패·불완전·상한 초과를 throw. `analysisContent`가 success/shape/complete 검사. page는 error와 정상 빈 배열 별도 렌더링 |

## 권한·저장소·생산자/소비자 검토

- `ResourceManagementController.js:26`에서 guardedDefine으로 신규 resolver를 등록하고 principal을 전달한다. 기존 Controller는 `src/index.js`의 CONTROLLER_REGISTRARS에 이미 들어 있으므로 중복 등록이 필요 없다.
- `PermissionMap.js:313`의 RESOURCE_MANAGEMENT read/teamLead accountTargets는 기존 profile과 동일하다. `TeamLeadFieldPolicy.js:46`에 accountId/startDate/endDate가 있어 팀장 경로에서 기간 payload가 탈락하지 않는다.
- `ResourceAccess.js:6`의 명부 판정은 TeamAnalyticsScope를 재사용한다. principal 누락·일반 사용자·팀 범위 밖 인원은 사용자 SQL/Jira 조회 전 거부한다. 관리자/조직 전체 범위 및 자기 팀 인원 경로는 공용 규칙을 따른다.
- `ResourcePersonAnalysisService.js:29`의 현재 참여 프로젝트와 `scopedProjectIds` 교집합을 Jira 조회 전에 적용한다. MEMBER_ONLY/TEAM_ONLY는 memberProjectIds로 제한되며 []이면 Jira를 호출하지 않는다. 응답 프로젝트 이름·시간·건수도 이 교집합에서 나온다.
- 대상 사용자 존재 확인은 findByAccountId 결과의 account_id 일치로 판정한다. 결과 DTO는 명시적 allowlist로 구성하여 salary/comment/다른 작성자를 내보내지 않는다. SELF mutation 및 비용 경로는 변경하지 않았다.
- `ResourcePersonAnalysisFetcher.js`는 asUser Jira 검색/워크로그 API만 사용한다. 검색 nextPageToken과 worklog startAt/total을 순회하고 중간 오류·반복 cursor·불완전 total을 정상 0건으로 바꾸지 않는다. author와 started 날짜를 마지막에 검사하며 issueId/worklogId로 중복을 제거한다.
- 요청은 p-limit(4)를 공유한다. 프로젝트 50, 이슈 1,000, 검사 worklog 20,000, 반환 worklog 5,000, API 요청 200 상한을 초과하면 전체 실패한다. 이 상한은 Forge 실행 시간 보장을 뜻하지 않으며 실제 대량 응답시간은 미검증이다.
- 신규 endpoint는 SQL 읽기 및 Jira 읽기만 수행한다. DML rowsAffected, KVS schema, scope, 라이선스 경계는 변경하지 않아 신규 쓰기 검증 대상이 아니다.

## 공용 경로 회귀

- `getResourceProfileService`의 내부 호출자는 기존 Controller뿐이며 신규 분석 Service는 이 함수를 호출하지 않는다. 신규 endpoint도 Controller/신규 훅 외의 생산자·소비자가 없다.
- 기존 프로필은 profile/load/inProgressIssues/experience shape를 유지한다. 프로젝트 이력만 공용 `filterResourceProjects`를 거친다. `ProjectHistoryList`가 요구하는 projectId/projectName/roleName/status/startDate/endDate/closed 필드가 유지된다.
- 기존 인력 현황, 자원 배정, 프로젝트 작업 배정의 ResourceProfileDrawer는 같은 useResourceProfile/DTO를 사용한다. 신규 상세 버튼에는 RESOURCE_MANAGEMENT read 또는 팀장 노출 조건이 있다.
- 프로필 query key에 viewerScope를 추가하되 `resourceKeys.profile(accountId)` prefix를 유지한다. 기존 UserSkillEditModal의 prefix invalidation이 모든 scoped profile에 적용된다.
- 신규 분석 query key에 호출자 accountId, 읽기 권한, 팀 정보·leadingTeamKeys, projectScope, 권한 로딩 상태가 들어간다. 권한 reload로 key가 바뀌면 이전 key의 데이터를 새 범위에 재사용하지 않는다. 실제 외부 계정 전환은 별도 검증 대상이다.
- 프로젝트 인력 배정·해제의 resource prefix 무효화와 워크로그 생성·수정·삭제·드래그의 personAnalysis prefix 무효화를 확인했다. WorklogModal의 부분 롤백 실패도 무효화한다.
- 기존 ResourceWorklogFetcher와 그 ProjectProgress/ProjectCost/Portfolio 계열 소비자는 변경하지 않았다.
- 기존 profile의 광범위 load/inProgressIssues 조회 및 실패 시 fallback은 기존 동작으로 남아 있다. 이번 설계에서 재설계를 제외했고 신규 분석 화면은 이 필드를 소비하지 않는다. 이 부분을 신규 기간 분석의 정확성·권한 검증 통과 범위에 포함하지 않는다.

## 실행 증거

| 검증 | 상태 | 명령·결과 |
|---|---|---|
| 정적 생산자/소비자·권한·캐시 대조 | 통과 | Get-Content -Encoding utf8, rg, git diff로 상기 소스/변경/직접 호출 확인 |
| backend 전체 Jest | 통과 | 루트 `npm test -- --runInBand`, exit 0, 113 suites / 1549 tests. `backend-final.log` |
| frontend 전체 Jest | 통과 | static/ui `npm test -- --runInBand`, exit 0, 최종 111 suites / 1753 tests / 1 snapshot. `frontend-final.log`. 번역 손상은 이전 키 존재 테스트에서 검출되지 않았음 |
| CI=true frontend build | 통과 | static/ui에서 `$env:CI='true'; npm run build`, 최종 exit 0. `frontend-build.log`. 외부 Atlaskit/marklassian 기존 소스맵 경고 3개. main gzip 450262 bytes / budget 950000, withinBudget=true. 최초 실행 중단(exit 1)은 번역 복구 후 재실행으로 해소 |
| 번역 복구 독립 검사 | 통과 | node로 personAnalysis 37개 키의 한글 포함/영어 키 존재 및 ko-KR 생성본 동일성 검사, exit 0 |
| app root pwd 후 forge lint | 명령 통과 / 일부 미검증 | 최종 exit 0, No issues found, `forge-lint.log`. PermissionLinter의 Unknown product 오류로 일부 권한 lint 검사는 미실행. 최초 build 중단으로 발생한 index.html 부재는 최종 build 후 해소 |
| diff 공백 검사 | 통과 | 루트 `git diff --check`, exit 0 |
| 브라우저 fixture | 통과 | `node browser/verify.cjs` exit 0, `browser/result.json` passed=true/errors=[]. 실제 컴포넌트 + mock Forge DTO로 상세보기 encoded 계정 이동, 24h/12일/12이슈/2프로젝트, 프로젝트 클릭 근거 12→6행, router.open 이슈 URL, 잘못된 기간/이번달 query 재호출/오류 시 기존 데이터 숨김/재시도/빈 결과/복귀. 최종 번역 복구 UI `browser/final.png` |

## 남은 미검증

- **발견 후 복구된 결함:** `locales/kr/resource.json`의 신규 personAnalysis 값이 `?`로 저장되어 한국어 레이블이 표시되지 않았다. 루트의 브라우저 검사에서 발견했고 frontend가 복구했다. 검토자가 37개 값에 한글이 들어 있고 영어 키가 존재하며 ko-KR 생성본이 원본과 동일함을 node 검사(exit 0)로 확인했다. 최종 브라우저 검증도 통과했다. 키 존재 테스트 통과만으로 번역 내용 정상성을 판단하면 안 된다.

- 실제 설치 Jira의 asUser 접근 권한과 JQL 커스텀 필드 이름, 검색/워크로그 pagination 응답, 제한된 worklog 가시성, 대량 데이터 지연 시간.
- Forge PermissionLinter가 `Unknown product` 도구 오류로 건너뛴 검사. 명령 exit 0과 별개이며 수동 소스 검토·권한 회귀 테스트를 해당 도구 검사 완료로 표현하지 않는다.
- 실제 iframe에서 URL 직접 진입·새로고침·복귀, 실제 계정/권한 변경 이후 캐시 전환. fixture 결과와 구분한다.
- 배포·설치·커밋·푸시는 사용자 요청 범위 밖이며 수행하지 않았다.
