# 작업 상태

시작 HEAD: `2932ecbb4cc1502e57b5b50c48aca89119f2a0df`. 기존 협업 모드 수정, 이슈 생성 화면·locales·jiraKeys 변경과 PPT/custom-scopes/LeaderTeamBackfill 미추적 파일을 보존한다. 시작 시 staged 파일은 없다.

- root: RFC-213 ProjectModal과 관련 테스트, RFC-214 ProjectList와 관련 테스트, 요구사항·검증·RFC별 커밋.
- collab_frontend: RFC-215 ProjectKanbanBoard·전용 조회 helper·관련 board 테스트. 공용 키 변경은 사전 조율한다.
- 번역 merge·전체 tests·CI build·Forge lint는 root가 단독 실행한다.

구현·전체 검증·RFC별 커밋 완료. 이번 소유 파일 7개만 명시적으로 staging했으며 기존 협업 모드 변경은 제외했다. 푸시·배포는 하지 않았다.

- RFC-213: 공용 상세 캐시의 원본 응답 shape를 유지하고 select로 row를 소비한다. 수정창 첫 fresh 조회 완료 후 한 번만 hydrate하며 조회 실패와 진행 중에는 저장을 막는다. 이후 사용자가 입력한 내용은 refetch로 덮지 않는다. 대상 14 tests 통과.
- RFC-214: 상태 메타데이터와 목록을 함께 의존하는 useMemo로 행을 계산한다. pagination도 pageSize 변경을 반영한다. 대상 2 suites/5 tests 통과.
- RFC-215: 완성 보드의 root.oldProjects에 loadedPages/hasMore를 저장한다. 같은 query가 최근 프로젝트와 이미 연 과거 페이지를 재조회하며 카드와 메타데이터를 원자적으로 갱신한다. 실패·취소·중복 클릭·invalidate 경합에서 이전 snapshot과 다음 페이지 경계를 보존한다. 대상 5 suites/35 tests 통과.
- backend 전체: `npm test -- --runInBand`, exit 0, 144 suites/1965 tests, 85.728초.
- backend 최초 실행은 앱 144 suites가 통과했으나 `_workspace`의 진단용 4개 test 파일까지 수집해 exit 1이었다. 진단 원본을 `.repro.js`로 이름 변경하고 전용 config만 조정한 뒤 전체 재실행을 통과했다.
- frontend 전체: exit 0, 134 suites/2,149 tests + snapshot 1, 80.018초.
- CI build: exit 0. app gzip 481,804/950,000 bytes, panel 329,459/350,000 bytes. 기존 의존패키지 source-map/Browserslist 경고만 존재한다.
- Forge lint: 빌드 생성물 재생성과 병렬 실행한 최초 시도는 build-panel/index.html 누락으로 exit 1. 빌드 완료 후 root 경로 확인·재실행은 exit 0, No issues found. PermissionLinter Unknown product 때문에 일부 권한 검사는 미검증이다.
- 실제 Jira 사이트 E2E·배포는 수행하지 않았다.
- 작업 중 다른 세션이 RFC-210을 `624a819`로 커밋했다. 이번 소유 파일과 충돌이 없으며 해당 변경은 보존한다.
- 최종 외부 기준 HEAD `470bfdf` 위에 RFC-213 `2019a7e`, RFC-214 `e0e20bc`, RFC-215 `9f8aaf5`를 순차 커밋했다.
