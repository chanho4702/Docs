# 개인 종합 분석 프론트엔드 결과

## 구현

- ResourceProfileDrawer 하단 상세보기 → 인코딩한 `/resource/people/:accountId` lazy route. 기존 목록 URL은 location.state.returnTo에 보존하며 알려진 내부 경로만 복귀 대상으로 허용한다.
- 별도 전사 분석 탭 없이 기존 사이드 패널을 진입점으로 사용한다. 페이지 제목에 선택 인원 이름, 상단 compact 프로필(이름/팀/직무/등급/스킬), 기간 필터, 요약 4종, 일별 ECharts 추이, 프로젝트별 시간·비율, 프로젝트 필터와 워크로그 원본 table, 마지막 프로젝트 경험 table을 배치한다.
- PageContainer, Card, KpiTile, CommonTable, SkeletonCards, UserAvatar, SkillTags, ProjectHistoryList와 기존 ThemedECharts/색상 토큰을 재사용했다. 현재 부하/진행 작업 DTO는 신규 화면에 복제하지 않는다.
- 기본 최근 28일, 최대 포함 92일, 사용자 로컬 오늘까지. 실제 유효 날짜와 순서를 검증하며 URL startDate/endDate 복원, 최근 28일/이번 달 빠른 선택, 수동 새로고침을 지원한다.
- 현재 멤버십 기준 및 과거 연결 제거 제외 가능성, 기록 부재가 유휴 상태를 뜻하지 않음, stored worklog 날짜 기준을 안내한다. 프로젝트 경험은 분석 기간과 독립이며 개인 투입 기간이 아닌 프로젝트 일정이다.

## 실제 API 소비 계약

- `02_backend_report.md`와 실제 ResourcePersonAnalysisService/Fetcher/ResourceManagementService 소스를 대조했다.
- `getResourcePersonAnalysis({accountId,startDate,endDate})` 성공 `content.accountId/period/projects/worklogs/meta`를 검증한다. worklog의 id/issueId/issueKey/issueSummary/projectId/projectName/started/date/timeSpentSeconds를 소비한다. meta.complete=true, scope=CURRENT_MEMBERSHIPS 및 fetchedAt을 요구한다.
- 모든 집계는 동일한 worklogs 초 단위 원본에서 산출한다. 빈 날짜는 0이며 빈 배열/0초는 정상 성공이다. 날짜는 UTC 재해석하지 않는다. 프로젝트 식별은 RMS projectId를 사용한다.
- 실패 객체 및 Promise reject는 TanStack Query error로 전달하며 raw error/cause는 노출하지 않는다. 부분/shape 오류는 빈 성공으로 바꾸지 않는다. 일반 실패는 재시도, LIMIT_EXCEEDED는 기간 축소, PROJECT_LIMIT_EXCEEDED는 프로젝트 상한 별도 안내를 제공한다.
- `getResourceProfile`의 기존 profile 및 experience만 새 화면에서 소비한다. 기존 drawer는 기존 load/inProgressIssues 소비를 유지한다. 경험 범위 필터는 backend에서 적용한다.

## 캐시와 mutation

- personAnalysis key는 accountId/startDate/endDate/viewerScope 포함. viewerScope는 호출자 accountId, RESOURCE read, team, sorted leadingTeamKeys, projectScope, 권한 loading/loaded를 포함한다. 권한/인력 전환에 keepPreviousData를 사용하지 않는다.
- profile key를 기존 `[resource,profile,accountId]` prefix 뒤 viewerScope가 붙는 scopedProfile로 확장했다. 기존 스킬 수정의 profile prefix 무효화가 모든 scoped variant를 계속 갱신한다.
- 60초 staleTime, 분석 mount 시 재조회. refresh는 해당 인원 프로필/분석을 함께 갱신한다. context 또는 권한 미준비일 때 invoke하지 않는다.
- WorklogModal 추가/수정/삭제 및 범위 입력 rollback 일부 실패, 개인 캘린더 drag, 프로젝트 캘린더 drag 성공 시 personAnalysisAll prefix를 exact:false로 무효화한다.
- ProjectAssignmentBoard 멤버 추가/해제, ProjectUserPanel 수정/삭제, UserAddModal 추가는 resource 전체 prefix를 exact:false로 무효화하여 개인 경험·분석도 갱신한다. 기존 SQL/Jira 지연 대응 캐시 패치는 유지했다.

## 변경 파일

- 신규 `static/ui/src/pages/resource/personAnalysis/` page/hooks/utils 및 3개 test 파일.
- App.jsx, ResourceProfileDrawer.jsx, useResourceProfile.js, resourceKeys.js.
- pages/myWork/WorklogPage.jsx, modal/WorklogModal.jsx, pages/projectDetail/calender/worklogDrop.js, user/ProjectUserPanel.jsx, user/UserAddModal.jsx, pages/resource/assignment/ProjectAssignmentBoard.jsx.
- locales/kr/resource.json, locales/en/resource.json 및 merge 생성 ko-KR.json/en-US.json.

## 검증

- 집계/기간/응답/복귀/key 및 기존 worklogDrop/queryKeyContract/queryKeyFactories: 4 suites 12 tests 통과.
- 실제 TanStack Query hook: 계정/조회자 전환 중 기존 데이터 숨김, 권한/기간 invalid invoke 차단, 실패 후 수동 retry→빈 성공 3 tests 통과.
- drawer 상세보기 버튼의 encoded route/returnTo/onClose 계약 1 test 통과. Jest 27이 react-router-dom 7의 exports를 해석하지 못해 해당 단위 테스트에서 navigation 경계를 virtual mock으로 검증했다. 실제 라우팅은 루트 브라우저 fixture 검증 담당.
- 한국어 생성 중 PowerShell→Python stdin 인코딩으로 신규 문자열이 `?`가 된 문제를 apply_patch UTF-8 편집으로 복구했다. 모든 신규 한국어 값의 한글 포함/연속 물음표 부재와 영어 키 일치 회귀 검증을 추가했다. 최종 npm run merge 완료, 실제 UTF-8 내용 확인.
- git diff --check 통과. CI build/전체 frontend tests/Forge lint 및 브라우저 상호작용 최종 결과는 루트 검증 보고서 참조. 실 Jira API/설치는 이 작업자 범위에서 미검증.
- 공유 공간의 AGENTS.md/README.md/backend 변경 보존. 커밋/푸시/배포/설치 미실행.
