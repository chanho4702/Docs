# RFC-200 요약 리포트 재설계

- 범위: 프론트 전용. phase2/RESULT.md·fix1/RESULT.md의 응답 계약, 백엔드, 조회 훅·쿼리키, Markdown 내용 불변.
- 요구: 분석 및 리포트 첫 하위 메뉴, 6열 BentoGrid, KPI 5개, 판정·추이·비교·공수 차트·상세 표·비용·메타.
- 기준: baseline.json SHA-256, tabs.before.js, ko-KR/en-US.before.json에 작업 전 상태 보존. Git 읽기는 세션 명령의 safe.directory 옵션 사용.
- 설계·백엔드 단계: 사용자 지정 레이아웃과 기존 계약 유지이므로 별도 구현 생략.
- 리더: 페이지 셸, KPI·메타·상세 표, tabs, 번역, 순차 검증, 최종 보고.
- frontend-engineer `/root/charts`: ProgressSection, ReportCharts, chartPresentation 및 차트·페이지 테스트. 공유 파일 merge·검증은 리더만 수행.
- 검증 계획: 모든 변경 후 static/ui에서 npm.cmd run merge → npx.cmd jest --maxWorkers=2 src/pages/projectDetail/periodReport src/utils/queryKey src/constants. 병렬 실행·빌드·커밋 없음.
- 현재 상태: 구현·지정 검증 완료. merge 성공, 지정 Jest 13 suites / 150 tests 통과, git diff --check 성공. 보호 파일 해시·기존 번역 namespace 보존 확인. 상세 결과와 남은 시각·빌드 검증은 RESULT.md 참조.
