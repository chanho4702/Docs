# RFC-200 요약 리포트 재설계 결과

2026-09-08. 프론트 재설계 완료. 지정 Jest **13 suites / 150 tests 통과**. 빌드·커밋·배포는 실행하지 않았다.

## 변경 파일

`static/ui/src/pages/projectDetail/periodReport/`:

- 수정: `PeriodReportPage.jsx`, `ActivitySection.jsx`, `MembersSection.jsx`, `FindingsSection.jsx`, `ProgressSection.jsx`, `reportPresentation.js`.
- 추가: `PeriodReportPage.css`, `ReportKpiHeader.jsx`, `ReportMetaSection.jsx`, `ReportCharts.jsx`, `chartPresentation.js`.
- 테스트 수정: `PeriodReportPage.test.jsx`, `openTotal.test.jsx`.
- 테스트 추가: `chartPresentation.test.js`.
- 삭제: `ReportTable.jsx`. 상세·판정 근거는 `CommonTable`을 직접 사용하며 순수 `reportTableProps`가 숫자와 셀을 구성한다.

그 외:

- `static/ui/src/constants/tabs.js`: 기존 lazy 선언을 유지하고 `periodReport`를 `analysisReport.children` 첫 자식으로 이동. 설치된 `@atlaskit/icon/core/file` 사용, gap 6, `props: { project_id, context }`, `canRender: () => canReadReport` 유지.
- `static/ui/src/constants/__test__/periodReportTabs.test.js`: 자식 순서, REPORT 권한, context 전달과 딥링크 trail 검증.
- `locales/kr/periodReport.json`, `locales/en/periodReport.json`: 제목을 요약 리포트 / Summary Report로 변경하고 새 카드·캡션·산식 문구 추가.
- `locales/ko-KR.json`, `locales/en-US.json`: merge로 생성. 다른 namespace 값 보존 확인.
- 이 실행 폴더: `00_status.md`, `RESULT.md`, `baseline.json`, `tabs.before.js`, `ko-KR.before.json`, `en-US.before.json`.

## 레이아웃 결정

- `PageContainer`의 공용 `PageHeader`에 제목·프로젝트명을 표시하고, 우측에 주간/월간 버튼·기간 이동·현재·진행 중 안내·Markdown 복사를 모았다.
- 공용 6열 `BentoGrid`에 KPI 6 → 판정/추이 3+3 → 전기 비교/이슈별 공수/인력별 공수 2+2+2 → 마감 초과/인력 상세 3+3 → 비용/근거·메타 2+4를 배치했다.
- 비용 키가 없으면 비용 카드를 숨기고 메타를 6열로 확장한다. 조회 전에는 비용 키 유무를 모르므로 비용 카드를 예측해 표시하지 않는다.
- KPI는 `KpiTile` 5개를 사용하고 화면에 한정한 CSS로 카드 테두리를 제거했다. 기록 공수·전기 증감, 완료/신규, 마감 초과, 미기록/투입, 현재 완성률·계획 대비 차이를 표시한다.
- `useProjectProgressSummary`는 `ReportKpiHeader`에서만 호출한다. 현재 수치의 기준 시점은 ⓘ로 설명한다. 기간 추이와 판정은 저장된 스냅샷만 사용한다.
- 초기 로딩도 같은 벤토 타일과 카드 제목을 유지하고 KPI 값·카드 본문에 공용 Skeleton을 표시한다.
- 판정 문장은 severity `StatusLozenge`와 함께 표시하며, 클릭하면 같은 카드 안에서 근거 `CommonTable`을 열고 닫는다. 기간 이동 시 펼침 상태를 초기화한다.
- 추이는 W26/M24 line 차트, 계획선은 점선, 선택 기간은 세로 markLine이다. 미수집 구간은 null로 두며 unavailable은 ‘아직 수집 전’, 조회 실패는 오류로 구분한다. 스냅샷 근거 표는 추이의 `ChartTableToggle`에 통합했다.
- 비교 차트는 MD·완료·신규의 grouped bar이며 전기가 없으면 현재 단일 시리즈다. MD와 건수의 단위 차이는 축·ⓘ에 표시한다.
- 이슈 차트는 share 내림차순 상위 8개+기타, 표는 전체 원본이다. 인력 차트는 byMember에 미기록 인원을 중복 없이 합치며 0값·경고색 라벨을 표시한다. 미상 작성자도 번역해서 유지한다.
- 차트 색은 `categoricalPalette(isDark)`, 미기록 경고는 기존 `semanticChartColor('warning', isDark)`를 사용한다. 새 라이브러리·분산 hex 상수·스피너는 추가하지 않았다.
- 마감 초과·인력 상세는 `CommonTable`이며 빈 목록은 `EmptyState`다. 인력 근사 조건은 Card info에 둔다.
- 비용은 큰 금액과 안분 산식 ⓘ로 표시한다. `null`은 ‘산출 불가’, 0은 0으로 구분한다.
- 메타는 계산 기간·계산 종료일·생성 시각·근사 조건을 줄바꿈 가능한 캡션으로 묶었다. `openTotal`은 null일 때만 생략하고 0은 표시한다.

## 계약·기존 변경 보존

- phase2/RESULT.md와 fix1/RESULT.md의 root DTO 및 nullable·optional 계약을 유지했다.
- `src/` 전체, 다른 세션의 resourceManagement/personAnalysis, App.jsx, resourceKeys.js, resource 번역, AGENTS.md, README.md 등은 작업 전 SHA-256과 동일했다.
- `usePeriodReport.js`, 쿼리키, 규칙, `toMarkdown.js`는 수정하지 않았다. 기존 Markdown 내용과 숫자 표현을 유지한다(제목 번역은 새 이름을 사용).
- `tabs.js`는 기존 diff 위에 자식 이동과 아이콘 import만 적용했다. CommonTab의 기존 Suspense·URL tab 선택 경계는 유지한다.
- merge 전후 `ko-KR`/`en-US`의 periodReport 이외 namespace 변경은 각각 0건이다.

## 테스트 결과

검증은 순서대로 실행했으며 명령 간 병렬 실행은 하지 않았다. Windows에서는 PowerShell 실행 정책 영향을 피하도록 동일한 npm/npx의 `.cmd`를 사용했다.

1. `static/ui`에서 `npm.cmd run merge`: **통과**, exit 0. 기존 merge 스크립트의 MODULE_TYPELESS_PACKAGE_JSON 경고만 출력됐다.
2. `npx.cmd jest --maxWorkers=2 src/pages/projectDetail/periodReport src/utils/queryKey src/constants`: 첫 실행 149 통과 / 1 실패. 미상 작성자 표시가 번역되었는데 테스트가 원본 문자열 `Unknown`을 기대하던 부분을 보정했다. 수정한 두 React 테스트는 `React.act`를 사용하도록 갱신했다.
3. 같은 지정 Jest 재실행: **13 suites / 150 tests 통과**, exit 0, 6.648초.
4. `git diff --check`: **통과**, exit 0. 보호 파일 SHA-256 및 번역 namespace 보존 확인 완료.

회귀 검증은 비용 키 없음/null/0, 현재 조회 오류·로딩 격자, 전기 오류의 단일 비교, 스냅샷 미수집·오류·markLine·26주 축, 판정 근거 펼침, 차트↔전체 표 전환, 주월·이전·현재 이동, Markdown 복사, 상위8+기타 합계 보존, 미기록 병합, 메뉴 딥링크·권한과 기존 query key 계약을 포함한다.

## 남은 우려

- 사용자 요청에 따라 빌드는 실행하지 않았다. 실제 Forge 화면의 차트 canvas, 좁은 화면·다크 모드의 시각 검수와 빌드 검증은 남아 있다. Jest는 실제 ECharts canvas와 Atlaskit 전체 렌더링을 검증하지 않는다.
- 기존 계약의 현재 배정·현재 이슈 상태 근사와 비용 안분 추정은 그대로다. 선택 기간의 과거 조직·이슈 상태를 복원하는 화면으로 해석하면 안 된다.
- 조회 전에는 비용 응답 키 존재 여부를 알 수 없어 비용 카드가 응답 후 추가될 수 있다. 나머지 로딩 타일 순서·span은 성공 화면과 동일하다.
