# Phase 3 프론트 구현 결과

2026-09-08. 프론트 구현 및 지정 검증 완료. Jest 9 suites / 92 tests와 CI 빌드 1회 모두 통과했다. 커밋·배포·개발 서버 실행 없음.

## 변경 파일

신규 프론트:
- static/ui/src/utils/queryKey/periodReportKeys.js
- static/ui/src/pages/projectDetail/periodReport/PeriodReportPage.jsx
- static/ui/src/pages/projectDetail/periodReport/usePeriodReport.js
- static/ui/src/pages/projectDetail/periodReport/ActivitySection.jsx
- static/ui/src/pages/projectDetail/periodReport/MembersSection.jsx
- static/ui/src/pages/projectDetail/periodReport/FindingsSection.jsx
- static/ui/src/pages/projectDetail/periodReport/ProgressSection.jsx
- static/ui/src/pages/projectDetail/periodReport/ReportTable.jsx
- static/ui/src/pages/projectDetail/periodReport/reportPresentation.js
- static/ui/src/pages/projectDetail/periodReport/snapshotSeries.js
- static/ui/src/pages/projectDetail/periodReport/periodNav.js
- static/ui/src/pages/projectDetail/periodReport/toMarkdown.js
- static/ui/src/pages/projectDetail/periodReport/rules/index.js

신규 테스트:
- static/ui/src/pages/projectDetail/periodReport/rules/rules.test.js
- static/ui/src/pages/projectDetail/periodReport/periodNav.test.js
- static/ui/src/pages/projectDetail/periodReport/snapshotSeries.test.js
- static/ui/src/pages/projectDetail/periodReport/toMarkdown.test.js
- static/ui/src/pages/projectDetail/periodReport/usePeriodReport.test.js
- static/ui/src/pages/projectDetail/periodReport/PeriodReportPage.test.jsx

수정·번역:
- static/ui/src/constants/tabs.js: 분석 리포트 그룹 바로 앞에 lazy 기간 리포트 탭 추가.
- locales/kr/periodReport.json, locales/en/periodReport.json: 신규 87개 번역 키.
- locales/ko-KR.json, locales/en-US.json: merge 산출물만 갱신.
- _workspace/project-period-report/runs/phase3/RESULT.md: 이 보고서.
- 같은 실행 폴더의 baseline.json 및 *.baseline: 시작 시 보호 파일 해시와 공유 파일 원문.

## 구현 결과

- REPORT canRender 게이트와 페이지 조회 게이트를 적용했다. 기존 첫 Dashboard 탭과 CommonTab Suspense 경계는 유지했다.
- cur/prev/snapshots 쿼리를 동시에 등록한다. invoke 실패와 success:false는 오류로 전달하며 root DTO를 그대로 소비한다. 이전 기간 실패는 이전 캐시까지 배제하고 델타만 생략한다.
- 주간/월간 이전·다음·현재 이동은 KST·ISO 주 규칙을 사용한다. 현재 기간 이후 이동은 비활성화했다. 열린 기간은 진행 중(오늘까지) 배지를 표시한다.
- 기존 useProjectProgressSummary를 사용한 현재 전체 진척과 기간 스냅샷을 구분한다. 추이는 선택 기간까지 W26/M24 연속 축이며 미수집 구간은 null/connectNulls:false다. unavailable:true는 공용 EmptyState로 아직 수집 전을 표시하고 조회 오류는 별도로 표시한다.
- 판정 7개는 순수 함수 findings[]로 반환하고, 각 문장은 같은 카드 안의 근거 표를 펼치는 링크 버튼이다. 근거에는 숫자·기간·제외 조건을 표시한다.
- 활동·마감 초과·이슈 공수·인력별 공수 표를 제공한다. accountId:null 작성자 및 현재 명단에 없는 작성자도 별도 전체 작성자 표에서 공수를 유지한다.
- cost 키가 있는 응답만 비용 카드와 Markdown 비용 블록을 만든다. totalInPeriod:null은 산출 불가, 0은 정상 금액으로 표시한다.
- Markdown은 판정·핵심 숫자·계산 기간·생성 시각·근사 조건을 복사한다. clipboard 실패는 화면에 표시한다.
- 공용 PageContainer/PageHeader, Card/InfoTip, CommonTable, StatusLozenge, EmptyState, Skeleton, ThemedECharts/chartPalette를 사용했다.

## 설계서와 다르게 한 결정과 이유

1. Phase 2 최종 계약을 우선해 meta.effectiveEndDate, meta.membersApprox, issues.approx와 nullable 비용·작성자를 반영했다. 요청 종료일과 실제 계산 종료일을 함께 표시한다.
2. openTotal은 과거 이월 건수가 아니라 현재 미완료 상태 집계이므로 현재 미완료(이월 참고)로 명명했다. 실제 과거 이월을 복원한다고 표현하지 않는다.
3. 과거 기간의 PROGRESS_BEHIND는 선택 기간 이하 최신 스냅샷만 사용한다. 선택 이후 스냅샷으로 과거를 판정하는 혼동을 피한다.
4. 기존 analysisReport/periodRange.js는 사용자 로컬 달력 규칙이므로 재사용하지 않았다. 이 기능은 백엔드 계약과 같은 KST·ISO 주 계산을 프론트에 복제하고 테스트에서 백엔드 실물과 대조했다. Select 스타일은 periodFilterStyles.js를 재사용했다.
5. 쿼리 팩토리의 필수 report(projectId,type,key), snapshots(projectId,type)에 선택적 scope 인자를 추가했다. viewer accountId·권한·프로젝트 범위·팀 컨텍스트로 캐시를 분리하고 staleTime:0/gcTime:0/refetchOnMount:always로 재진입 시 서버 판정을 다시 받는다.
6. 현재 이후의 기간은 선택하지 못하게 했다. 미래 활동 0을 확정된 결과로 읽는 혼동을 줄이면서 이전·다음·현재 기능을 제공한다.
7. 현재 전체 진척은 선택 기간의 과거 값과 분리한 카드로 표시한다. 현재 명단/현재 상태/현재 급여 정책의 한계는 화면과 복사문에도 포함했다.

## 계약 불일치 발견 사항

- Phase 2 최종 응답 계약과 실제 리포트 서비스·컨트롤러 사이에서 추가 불일치는 발견하지 못했다.
- 스냅샷은 getProjectPeriodSnapshots의 root {success:true,rows,unavailable?}와 camelCase 행 필드를 소비한다.
- 기존 useProjectProgressSummary는 선행 coworker field 조회 실패를 isError에 합치지 않고 isCoworkerReady:false만 반환한다. 이 경우 현재 전체 진척 카드가 스켈레톤에 머물 수 있다. 기존 훅을 변경하지 않고 우려로 기록했다.
- 백엔드 및 루트 src/는 수정하지 않았다.

## 테스트·빌드 결과

요청한 순서로 실행했으며 테스트와 빌드를 병렬로 실행하지 않았다. Windows 실행 정책을 피하기 위해 npm.cmd/npx.cmd를 사용했다.

1. static/ui에서 npm.cmd run merge: 통과(exit 0). 기존 MODULE_TYPELESS_PACKAGE_JSON 경고.
2. static/ui에서 npx.cmd jest --maxWorkers=2 src/pages/projectDetail/periodReport src/utils/queryKey: **9 suites / 92 tests 통과**, exit 0, Jest 보고 시간 22.552초.
   - queryKeyContract 포함.
   - 모든 판정 규칙·경계, 백엔드 periodKeys와 2019~2030년 날짜 대조, KST 자정, ISO 53주·연도·윤년.
   - root DTO/실패 전파/병렬 쿼리 등록/이전 기간 실패 독립성.
   - 비용 없음/null/0, null 작성자, Markdown과 실제 페이지 회귀.
   - ReactDOMTestUtils.act deprecation 경고 1건(테스트 통과).
3. static/ui에서 CI=true npm.cmd run build: **통과(exit 0)**. 첫 시도 성공, 재시도 없음. prebuild의 merge도 정상 실행됐다. Atlaskit/marklassian 외부 패키지 source map 누락 및 오래된 Browserslist 데이터 경고가 있었다. bundle:check는 main gzip 450,273 bytes / budget 950,000 bytes로 통과했다.
4. git diff --check: 통과(exit 0), 기존 파일 CRLF 변환 안내만 있음.
5. 보호 파일 비교: 시작 시 다른 세션의 모든 수정·미추적 파일 해시 불변. merge 산출물은 기존 모든 namespace의 JSON 값 불변이며 periodReport만 추가. kr/en 신규 번역 87개 키 일치.

## 남은 우려

- 실제 Forge/Jira 설치 환경의 호출, 브라우저 시각 검증과 clipboard 권한은 미검증이다. 개발 서버는 실행하지 않았다.
- Phase 2 RESULT에 기록된 백엔드 최종 전체 테스트 미완료 상태는 이번 프론트 검증으로 해소되지 않는다.
- 기존 현재 진척 훅의 선행 필드 조회 실패 처리 한계는 위와 같다.
- 서버가 보존하는 최근 W26/M24 행보다 오래된 기간은 근거 스냅샷이 없어 미수집으로 표시된다. 기간 리포트의 과거 명단·상태·비용은 Phase 2의 근사 계약을 그대로 따른다.
- 서버에서 권한·급여 정책을 바꿔도 이미 열린 화면의 결과는 다음 refetch 전까지 남을 수 있다. 다른 viewer/권한 store 상태는 키로 분리하며 재진입·포커스 시 서버를 재조회한다.

경험 기록: AGENTS.md 지침에 따라 C:/Users/DMOVE/Codex-experiences/projects/moves-workforce-period-report-phase3-2026-09-08.md와 INDEX에 계약·KST·보존 검증 교훈을 기록했다.
