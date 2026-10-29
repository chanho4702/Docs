---
name: dashboard-enhance
description: "프로젝트 대시보드 강화(RFC-189) M1~M6 전 모듈 완료·커밋(2026-08-13). insight 1패스·metrics 키부재 게이팅·force 토폴로지·filter_json v018. E2E·배포 미수행"
metadata: 
  node_type: memory
  type: project
  originSessionId: caaab510-0d17-4c17-9fdb-ea3ab946dde4
  modified: 2026-08-14T00:48:21.357Z
---

**RFC-189** 1차 커밋 `fabfcc0`(2026-08-13): 요구 7건+토폴로지 2건을 M1~M6로 분할, **M1+히트맵+M6 완료·커밋**. 설계·리포트는 `_workspace/dashboard-enhance/`. E2E 미수행.

완료분:
- **M1**: `getDashboardIssueInsight` resolver(전용 페처, 60s Promise 캐시, 2000캡+truncated) + KPI 3타일(진척률·D-day·지연수) + progressStatus/plannedVsActual 위젯. **metrics는 REPORT read 없으면 키 자체 부재**(fail-close, `'metrics' in data`로 판정 — `?? 0` 금지). insight는 위젯 수와 무관 invoke 1회(쿼리키에 위젯 id 없음)
- **히트맵**: worklog heatmap 분기에 `capacity{memberCount,hourRate,dailyCapacityHours}` — 요약 타일과 같은 `getSummaryDataService` 재사용. 비율 pieces(0/25/50/75/100%+), 키 부재=절대 구간 폴백. **data는 초, capacity는 시간** 단위 주의
- **M6**: 포트폴리오 자원 탭 아래 워크포스·프로젝트·작업 토폴로지 — 백엔드 0(기존 getPortfolioDashboard 재집계), 급여 필드 미소비를 **getter 트랩 테스트**로 고정. 공용 `components/chart/echart/graph/` 4종(forceGraphOption·capGraphScale·graphColors·graphTooltip)

**사용자 확정 비주얼(M5에도 적용)**: `layout:'force'`, **graph-webkit-dep 룩**(곡선 엣지, categories+범례, 라벨은 호버+큰 노드만), **노드 크기=MM 비례(sqrt+클램프), 미산정=디폴트 고정**, T1 링크는 타입별 스타일 구분.

- **M5 완료** (커밋 `d4c5100`, RFC-189 2차): `getProjectRelationGraph`(`R('PROJECT','detail')`, 입력 키 **projectId** — 다른 대시보드 resolver의 project_id와 다름) + `TopologyIssueFetcher`(issuelinks 전 타입 1패스, 상한 800). 계층 = RMS 프로젝트→스페이스→이슈, 엣지 = ROOT_SPACE/SPACE_ISSUE + 관계 3분류(SUBTASK/ISSUE_LINK(typeName)/WORKFORCE_PARENT — wbs==jira면 하나만). **노드 크기 = actualMd(투입)**, 상한 랭킹도 actualMd(비싼 노드가 남음), rollup은 상한 이전 전체 합. **노드 색 = 스페이스별**(assignDeterministicColors — 충돌 없는 결정 배정, 기존 deterministicColor는 M6용 유지), 관계 구분은 선 종류(실선/파선/점선). 폴더 노드 제외 확정(두 부모 문제)

- **M2 완료** (`cdf40e0`): riskIssues 목록(서버 flags만 판정·재정렬 금지) + issueSize 트리맵(기본 actualMd·제외 건수 캡션·표 전환 지원). 포트폴리오 토폴로지는 자원 탭 **최상단** 고정(`ce32208`)
- **M3 완료** (`016025c`): progressTrend(S-curve)·costBurnUp — 진척도/비용 탭과 **쿼리키·훅·컴포넌트 공유**(산식 한 벌), heavy 배지. ProgressPage 조회는 `useProjectProgressSummary` 훅으로 이동(호출부 1곳 강제). LEVEL_BAND 게이팅은 위젯 단위 `hiddenOnLevelBand`(salary만 — costBurnUp 월별 집계는 비용 탭과 동일 노출)
- **M4 완료** (`2d6c3f0`): 커스텀 필터 위젯(6축 빌더+`__ME__` fail-close+매칭 미리보기, 클라 필터라 왕복 0) + 템플릿 5종 개편(`placeTemplateCharts` 순수 배치) + **DDL v018 `filter_json`**(기존 9컬럼 INSERT 보존 — 마이그레이션 전 배포 창 안전). **계약: `updateChartFilter({project_id, dashboard_id, filter})` — 스코프 3중 방어(fail-close), 에러 판별은 `error.cause`**(code는 항상 500). `addChart`는 이제 저장 실패 시 `success:false`(과거 예외 삼킴 제거)

- **M7 완료** (`90aef33`, 2026-08-14): 포트폴리오 토폴로지를 자원 탭에서 제거하고 **스콥 탭 최상단**에 **워크포스—프로젝트—스페이스—이슈 4계층**으로 재구성. 스냅샷에 `spaces_json` 롤업 추가(**DDL v019**, 추가 Jira 호출 0 — 페치 이슈의 project 필드 계수). `classifyStatusKey` 단일 출처로 Σspaces=issueSummary 불변식. **구 스냅샷은 다음 일배치까지 spaces 빈 배열** → 프론트 3계층 폴백+안내, 혼합(프로젝트별 4/3계층) 허용. 마이그레이션 전 폴백 판정은 `e.cause` 기반(Unknown column 한정 — SqlError message는 SQL 전문 에코라 매칭 금지, F-1 계열 함정 재발 사례)
- **전부 추가** (`90aef33`): AddChartModal 3번째 모드 — 권한 통과 위젯 전부(customFilter 제외·중복 스킵) 일괄 생성, `defaultChartType ⊂ allowedCharts` 테스트 고정, `placeTemplateCharts` 배치

- **M8 후속** (2026-08-18, 커밋 `2ea8246`): 스콥 토폴로지 드릴다운을 **단일 확장 → 누적 확장**으로 교체(`selectedStatus` 하나라 다른 상태 노드를 누르면 직전 확장이 통째로 대체되던 문제) + **차트 상단 필터바**(계층 깊이 project/space/status · 상태 3종 · **이슈 전체 불러오기**(상한 24, count desc, `펼친 수/전체 수` 노출) · 모두 접기). 스페이스 멀티셀렉트는 1차에 넣었다가 **사용자 지시로 제거**(필터 축은 계층·상태만). `useQueries`로 확장별 병렬 조회, 이슈 노드 id에 부모 statusId를 섞어 키 충돌 방지, 옵션 메모 경계는 `issueSignature`(확장 id+이슈 수) — `issueQueries` 배열을 deps에 그대로 넣으면 notMerge 차트가 매 렌더 재배치됨. 뷰 필터는 순수함수 `filterTopologyView`/`topologySpaceOptions`(집계 1회·필터 N회, 프로젝트 생존 판정은 **필터 이전 원본** 기준). 프론트 전용, 백엔드/권한 변경 없음. E2E 미수행

- **자원 탭 확충** (2026-08-18, 커밋 `2ea8246`): 위젯 3종 추가, **배정 관계도가 탭 최상단 전폭**(사용자 지시) — ① 전사 배정 관계도 = `/resource`의 `AllocationGraphSection` **재사용**(invoke 2회 추가라 '불러오기' 버튼 클릭 시에만 마운트, RESOURCE_MANAGEMENT read 게이팅, 노드 클릭은 /resource 이동, 상단 프로젝트 필터 미반응은 캡션 명시) ② 인력 집중도 파레토(누적선은 **전체 인원 기준** 계산 후 상위 30만 표시 — 표시분 기준으로 내면 마지막 막대가 항상 100%) ③ 가동률×투입 산점(x=선택분 투입/y=**전사 글로벌** 가동률, `utilBand`는 서버값 그대로·util null은 점에서 제외하고 unknownCount로 노출). ②③은 스냅샷 재집계라 왕복 0. 집계 함수 `memberEffortPareto`/`memberUtilizationScatter` + 테스트(급여 getter 트랩 포함). **인력 겸직 히트맵(인원×프로젝트)은 만들었다가 사용자 지시로 제거** — "사람 많아지면 답 없다"(행이 인원 수만큼 늘어남). 겸사로 **기존 M8 키 누락 3건**(`topology.layer.jiraSpaces`·`topology.context.jiraSpace`·en `unassignedSpace`) 보강 — 범례·툴팁에 키 문자열이 그대로 나오던 상태였다
- **4탭 평가·위젯 추가** (2026-08-18, 커밋 `2ea8246`, Opus 5 frontend-engineer 위임 구현): 설계서 `_workspace/dashboard-enhance/07_portfolio_tab_evaluation.md`. 6종 구현 후 **Time 2종(일정 앞섬·뒤처짐 발산 막대, 곧 끝나야 하는 프로젝트 레이더)은 사용자가 "별로"라 삭제** → 최종 4종. Scope=이슈 완료율 vs 진척률(덤벨: scatter2+custom 연결선, 공식 예제 custom-error-scatter 방식)+지연 이슈가 몰린 담당자(problemIssues 글로벌 캡션) / Cost=완료 시 예상 비용(EAC=예산/CPI, projCpi 재사용)+MD 단가(평균은 Σsalary/Σmd 가중, markLine 정적 좌표). 전부 스냅샷 재집계·invoke 0, 테스트 1559. **용어: 신규 위젯은 "진척률", 기존 scopeProgress 등은 "완성률" — 같은 값이 화면마다 다른 이름(전면 통일 미결)**. 프로젝트×주 투입 히트맵(T3)은 미채택. Time 탭은 결국 원래 3종(간트·공수 추이·리스크 TOP) 그대로. **사고**: 에이전트가 `git checkout -- locales/kr|en/portfolio.json`으로 미커밋 44키를 날렸다가 재구성(allocationGraph·topology.filter·en 문구는 코드 기반 재작성본) → HEAD 대비 삭제 0·missing none 검증 완료. 사용자 문구 톤 지시: **AI 말투 금지**(대시·"즉시 조치 대상"·코드 식별자·명사 3개 합성어 금지, PM이 회의에서 말하듯)

- **전부 추가 배치표** (2026-08-18, `3ff677e`→`dbdd29a`→**`06d9c8e` 최종**): `constants/dashboardWidgets.js`의 **`BULK_ADD_LAYOUT`은 (x,y,w,h) 좌표 고정형** — 사용자가 손으로 다듬어 확정한 배치(계획 대비 실적이 오른쪽 열 3×16으로 두 줄 관통, 도넛 3×8 두 줄, 지연임박 6×14|토폴로지 6×14, 이슈 규모 12×13, 진척추이·비용소진·워크로그 4×10). `placeFixedCharts`가 y만 평행이동(줄 단위 `placeTemplateCharts`는 템플릿/단건용으로 유지). 배치표 밖 위젯은 맨 아래 기본 크기. **새 위젯 추가 시 WIDGET_SPEC + BULK_ADD_LAYOUT 둘 다** 갱신(테스트가 누락 잡음). `ChartCard` 본문 overflowY:auto(넘침 스크롤, `dbdd29a`)

- **분석 리포트 조망 차트** (2026-08-18, `ca2f17d`): 프로젝트 상세 > 분석 > 작업 분석/인력 분석 상단에 각 2종. 작업=산정 정확도 5구간(완료+계획>0만, 제외 사유 카운트)·담당자별 계획vs실적(계획 null은 합에 안 넣고 셈) — 소스는 **`useDashboardInsight` 재사용**(표는 10건 페이징이라 표 데이터로 못 그림, DASHBOARD 권한 거부 시 차트만 안내). 인력=인원별 가동률 상위 20·팀별 투입(가중 가동률 색) — `useProjectResourceMembers`를 **전량 모드(VIEW_MODE_TEAM)로 1회 더** 호출(분석 목록 캐시 공유, 500명 초과 시 차트 안내), 이름은 상위 N만 `useUserInfoMap`(단일출처 가드 테스트에 예외 등록). `utilizationBand`는 `resource/utilizationBand.js` 순수 모듈로 분리(표 재노출). **파일명 대소문자 함정**: `IssueAnalysisCharts.jsx`와 `issueAnalysisCharts.js`가 Windows에서 충돌(webpack이 .js 먼저 해석) → 순수 모듈은 `*ChartData.js`

백로그: `updateChartTitle`만 스코프 검증 미적용 잔존(02_backend_report §12-10). [[work-bulk-apply]]의 F-1.

교훈: 진척률 "추이"는 과거 스냅샷 부재로 산출 불가(포트폴리오 스냅샷은 PK upsert라 덮어씀) — 공수 S-curve로 대체. 진척·비용 KVS 캐시는 Jira 왕복을 안 줄임(hit 경로가 재페치). `@forge/bridge` t()는 보간 미지원이지만 자체 `utils/i18n.js tFormat`이 존재(조각 결합 불필요).
