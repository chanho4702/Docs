# RFC-176 코드·설계 교차 리뷰

## 1. 결론

- 대상 commit: `ea5ef4acc9d0767deef95e35be03ec2c9fecd1e9`
- 현재 코드 기준 HEAD: `3f0e73...`
- 종합 판정: **실패**
- 심각도 집계: **P1 5건 / P2 6건 / P3 2건**
- 실행 검증: backend Jest **65 suites / 1,057 tests 통과**, frontend Jest **64 suites / 1,074 tests 통과**
- build: **미검증**. 현재 worktree의 `locales/en-US.json`, `locales/ko-KR.json` 등에 다른 RFC의 미커밋 변경이 있어, `prebuild` locale merge가 사용자 변경을 덮어쓸 수 있으므로 실행하지 않았다.

테스트 통과는 아래 운영 경계 결함을 반증하지 않는다. 현재 테스트는 순수 집계 함수와 정적 계약을 잘 고정하지만, React wiring, TanStack Query mutation invalidation, 동시 SQL 쓰기, Forge 응답 용량 경계를 실행하지 않는다.

## 2. 우선순위 요약

| ID | 판정 | 우선순위 | 경계면 | 요약 |
|---|---|---:|---|---|
| F-176-01 | 실패 | P1 | 팀 선택 → KPI/차트/롤업 | 선택 팀 집합을 집계 전 적용하는 컴포넌트와, 전 트리 누적값을 사후 필터하는 컴포넌트가 섞여 같은 화면의 숫자가 다르다. |
| F-176-02 | 실패 | P1 | 배정 mutation → 관계도 query | 인력 추가·삭제·팀 일괄 배정 후 `resourceKeys.allocation`을 invalidate하지 않아 관계도가 최대 5분 이상 낡은 상태로 남는다. |
| F-176-03 | 실패 | P1 | 팀 분석 → portfolio SQL/응답 | 팀 분석이 불필요한 추이 JSON까지 전 프로젝트에서 LIMIT 없이 읽는 전체 dashboard 응답을 재사용한다. |
| F-176-04 | 실패 | P1 | 관계도 SQL → client cap | 프로젝트 15개 cap은 전체 SQL/Forge 응답 이후에 적용되어 플랫폼 한도를 보호하지 못한다. |
| F-176-05 | 실패 | P1 | 일괄 배정 → SQL 무결성 | `NOT EXISTS`만 있고 `(project_id, account_id)` UNIQUE가 없어 동시 요청에서 중복 배정 행이 생길 수 있다. |
| F-176-06 | 실패 | P2 | 상태명 → ACTIVE 필터 | 부분 문자열 정규식이 `Not Done`, `Incomplete`, `Unfinished`도 종료로 판정한다. |
| F-176-07 | 실패 | P2 | resolver grant → 최종 설계 | `getTeamAnalyticsScope` grant가 최종 설계보다 넓어 `TEAM_MANAGEMENT` 사용자에게 직접 invoke 경로를 연다. |
| F-176-08 | 실패 | P2 | `missing` 생산 → KPI/표 소비 | 일부 집계 전 값을 알려주는 `missing[field]`가 KPI/롤업에서 무시되어 알려진 값의 부분합이 완전한 합계처럼 보인다. |
| F-176-09 | 실패 | P2 | 집계 필드 → 비교 축 | 최종 설계의 7축 중 4축만 노출한다. 이미 계산된 `delayedShare`/`riskScoreWeighted`와 `utilMemberCount`가 버려진다. |
| F-176-10 | 실패 | P2 | 팀 key/name → graph label | 이름을 찾지 못한 유효 teamKey를 “팀 미지정”으로 오표기하고 selector에서는 UUID를 노출한다. |
| F-176-11 | 실패 | P2 | 팀 일괄 배정 → invoke/SQL 크기 | 팀 인원 전체를 단일 `invoke`/단일 INSERT에 보내며 수량 상한·chunk가 없다. |
| F-176-12 | 실패 | P3 | control → 접근성 상태 | Select label 연결, preset `aria-pressed`, disclosure `aria-expanded`가 없다. |
| F-176-13 | 실패 | P3 | 설계/보고서 → 유지보수 | 규범 문서와 구현 보고서에 이미 폐기된 gate·trend 조건·동시성 보장이 남아 있다. |

## 3. 상세 발견 사항

### F-176-01 — 팀 선택의 집계 의미가 컴포넌트마다 다름

- 판정/우선순위: **실패 / P1**
- 생산자:
  - `static/ui/src/pages/resource/teamAnalytics/hooks/useTeamAnalyticsData.js:153-183` — 서버 가시 scope 전체로 `teamMetricsByTeam`과 `rollupTeamTree`를 한 번 계산한다.
  - `src/resolver/teamAnalytics/TeamAnalyticsService.js:145-147` — `descendantMemberCount`는 선택 상태와 무관하게 실제 모든 후손을 포함한다.
- 소비자:
  - `static/ui/src/pages/resource/teamAnalytics/TeamAnalyticsTab.jsx:130-147` — 선택 팀은 이미 계산된 `rows`/`nodes`를 사후 필터한다.
  - 같은 파일 `:246-250`, `:284-297` — 프로젝트 스택·비교·구성은 `effectiveScope`를 받아 선택 집합으로 집계 전 필터한다.
  - `static/ui/src/pages/resource/teamAnalytics/TeamKpiRow.jsx:61-73` — 단일 선택에서는 선택 node의 `total`과 서버 `descendantMemberCount`를 사용한다.
  - `static/ui/src/pages/resource/teamAnalytics/charts/TeamRollupTable.jsx:101-143` — 선택된 node의 기존 direct/total을 그대로 표시한다.
- 재현/영향: 부모 A 직속 공수 10, 자식 B 공수 20인 트리에서 A만 선택한다. 비교·구성·프로젝트 스택은 A 직속 10만 대상으로 삼지만 KPI와 롤업은 A의 `total` 30 및 후손 조직 인원을 표시한다. 같은 선택 상태에서 “공수”, “참여 인원”, “조직 인원”의 모집단이 갈린다. 다중 선택 UI의 설명(`TeamScopeSelector.jsx:16-25`)인 “선택한 팀만”과도 모순된다.
- 근본 원인: RFC-176에서 단일 선택을 다중 선택으로 바꾸면서 일부 소비처만 `effectiveScope`로 재집계했고, KPI/롤업은 P1-b에서 만든 전체 트리 누적값을 사후 필터했다.
- 수정 방법: 선택 의미를 정본 하나로 확정한다. 현재 UI 문구대로라면 `selectedTeamKeys`를 data hook의 scope에 포함해 `teamMetricsByTeam`과 `rollupTeamTree`를 재계산하고, 모든 차트/KPI/표가 동일한 `selectedMetrics`/`selectedNodes`만 소비하게 한다. “하위 팀 포함”이 제품 의도라면 별도 `includeDescendants` 모드를 UI에 명시하고 모든 소비처의 scope를 같은 후손 집합으로 확장한다.
- 필요한 테스트: 부모+자식 fixture에서 부모만/자식만/부모+자식/전체 선택을 render-level로 실행하고 KPI, 비교, 구성, 프로젝트 스택, 산점도, 롤업의 모집단과 합계가 일치하는지 단언한다. 현재 순수 함수 테스트만으로는 JSX wiring 불일치를 잡지 못한다.

### F-176-02 — 배정 변경 후 관계도 cache가 무효화되지 않음

- 판정/우선순위: **실패 / P1**
- 생산자: `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:174-187`, `:204-216`, `:255-272` — 단건 추가, 삭제, 팀 일괄 추가 성공 후 `assignmentKeys.board/pool`만 invalidate한다.
- 소비자:
  - `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:321-339` — 같은 화면에 관계도를 mount한다.
  - `static/ui/src/pages/resource/allocation/useResourceAllocation.js:18-28` — 관계도는 `resourceKeys.allocation({ includeClosed })`, `staleTime: 5분`을 사용한다.
  - `static/ui/src/utils/queryKey/resourceKeys.js:10` — exact params key만 있고 allocation prefix factory가 없다.
- 재현/영향: 관계도를 연 뒤 사용자를 추가·삭제하거나 팀 전체를 배정한다. board/pool은 갱신되지만 관계도 node/link는 이전 `projectusers` 상태를 유지한다. 관계도를 접었다 다시 열어도 5분 staleTime 안이면 같은 cache가 재사용된다. 열린 active query도 invalidate되지 않았으므로 background refetch가 없다.
- 근본 원인: 같은 SQL 정본(`projectusers`)을 읽는 두 query domain의 의존성을 mutation 성공 경로가 알지 못한다.
- 수정 방법: `resourceKeys.allocationAll = () => ['resource', 'allocation']` 같은 prefix factory를 만들고 세 mutation 성공 경로에서 board/pool과 함께 invalidate한다. 관련 invalidation Promise를 `Promise.all`로 await하거나, mutation 응답에 변경 행을 실어 allocation cache를 원자적으로 갱신한다. TanStack Query 공식 문서상 `invalidateQueries`는 staleTime을 덮어써 stale로 만들고 active query를 background refetch하므로 이 용도에 맞다: [Query Invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).
- 필요한 테스트: mocked `QueryClient`를 쓰는 component/integration test로 세 성공 경로가 board, pool, allocation prefix를 모두 invalidate하고 실패 경로는 invalidate하지 않는지 검증한다. `includeClosed=false/true` 두 cache가 prefix로 함께 무효화되는지도 단언한다.

### F-176-03 — 팀 분석이 전 프로젝트의 대형 dashboard payload를 overfetch

- 판정/우선순위: **실패 / P1**
- 생산자:
  - `src/rdb/query/PortfolioSnapshotQuery.js:58-86` — `SELECT_ALL`이 LIMIT 없이 모든 프로젝트의 `members_json`, `monthly_effort_json`, `weekly_effort_json`을 읽는다.
  - `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js:44-47` — 전량 조회한다.
  - `src/resolver/portfolioDashboard/PortfolioDashboardService.js:162-170`, `:205-250` — 전량을 읽고 세 JSON을 parse한 뒤에 principal project scope를 적용한다.
- 소비자: `static/ui/src/pages/resource/teamAnalytics/hooks/useTeamAnalyticsData.js:82-90`, `:116-170` — `/dashboard` cache 공유를 위해 `getPortfolioDashboard` 전체 응답을 받고, 팀 분석에서는 주로 project 상태/진척/위험과 `members[]`의 account/공수만 쓴다. 월·주 추이 JSON과 다수 dashboard meta는 이 탭에 불필요하다.
- 재현/영향: snapshot 프로젝트 수와 멤버 JSON이 증가한 site에서 `/resource` 팀 분석 탭을 직접 연다. `/dashboard`를 먼저 보지 않았다면 cache 재사용 효과가 없고 전량 SQL/parse/serialize 비용을 그대로 낸다. 설계서 자체 추정은 `members_json`이 프로젝트당 최대 약 60KB(`01_architect_design.md:1449`)다. 실제 실패 임계 프로젝트 수는 JSON 크기에 따라 달라 **미검증**이지만, 현재 경로에는 응답/페이지 상한이 없어 SQL 4MiB 응답 또는 5초 SELECT 한도 전에 안전하게 절단할 보장이 없다.
- 근본 원인: “새 resolver 0”과 dashboard cache 재사용을 요청량 감소와 동일시했다. cache miss 경로와 SQL projection/response volume을 분리해 평가하지 않았다.
- 수정 방법: 팀 분석 전용 bounded projection을 만든다. 최소한 서버에서 principal scope를 SQL WHERE에 먼저 적용하고, 팀 분석에 필요한 project/member 필드만 반환하며 월·주 추이는 제외한다. 전체 팀 합계가 필요하다면 raw project JSON을 page별로 브라우저에 보내기보다 서버에서 팀 단위로 집계한 작은 DTO를 반환한다. 기존 dashboard와 다른 shape를 같은 `portfolioKeys.dashboard()`에 넣어서는 안 되므로 전용 resolver/query key 또는 명시적 mode별 key가 필요하다.
- 필요한 테스트: ① SQL projection에 monthly/weekly JSON이 없는지, ② MEMBER_ONLY principal이 SQL 단계에서 scope 밖 project를 읽지 않는지, ③ Forge 한도에 근접한 fixture에서도 payload와 실행 시간이 상한 내인지 검증한다. 공식 한도: SQL response 4MiB, query memory 16MiB, SELECT 5초([Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/)); front-end invocation response 5MiB([Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/)).

### F-176-04 — 관계도 15개 cap이 SQL/응답 용량을 줄이지 못함

- 판정/우선순위: **실패 / P1**
- 생산자:
  - `src/rdb/query/ProjectUsersQuery.js:191-215` — 활성/종료 포함 모두 전 프로젝트×인력 행을 LIMIT 없이 조회한다.
  - `src/resolver/resourceManagement/ResourceManagementService.js:368-403` — 모든 행을 받은 뒤 전체 account user map과 node/link DTO를 만든다.
- 소비자: `static/ui/src/pages/resource/allocation/AllocationGraphSection.jsx:61-75` — filter와 `MAX_GRAPH_PROJECTS=15` cap을 resolver 응답 이후 브라우저에서 적용한다. `:114-125`의 “전체 표시”는 다시 전체 client payload를 렌더한다.
- 재현/영향: `projectusers` 행이 SQL 4MiB 응답이나 5초 SELECT를 넘는 규모에서 관계도를 펼친다. client가 15개로 줄일 기회를 얻기 전에 resolver가 실패하여 섹션 전체가 error가 된다. 정확한 행 수 임계값은 이름/ID 길이에 따라 달라 **미검증**이다.
- 근본 원인: 렌더 성능 cap과 backend query/transport cap을 같은 보호 장치로 취급했다.
- 수정 방법: default 15개 제한을 resolver 입력과 SQL에 내린다. 먼저 project별 인원 수/정렬 기준과 `totalCount`를 작은 query로 얻고, 선택된 최대 15개 project ID에 대해서만 allocation rows를 조회한다. 상태/프로젝트 filter도 서버 입력으로 보낸다. “전체 표시”는 무제한 한 번이 아니라 page/cursor 확장이어야 한다.
- 필요한 테스트: SQL query에 bounded project selection이 적용되는 정적 계약, `totalCount/hiddenCount` 응답 shape 교차 테스트, 수만 allocation fixture의 query 시간·payload 크기 테스트가 필요하다. 적용되는 공식 한도는 F-176-03과 같다.

### F-176-05 — `NOT EXISTS`는 동시 배정 중복을 막지 못함

- 판정/우선순위: **실패 / P1**
- 생산자:
  - `src/resolver/projectIssue/ProjectUsersService.js:36-48` — 사용자 존재 확인 후 INSERT를 수행한다.
  - `src/rdb/query/ProjectUsersQuery.js:4-27` — 중복 방어가 `NOT EXISTS(project_id, account_id)`뿐이다.
  - `src/rdb/schema/ddl/projectusers.sql.js:16-21` — PK는 임의 `project_member_id`이고 `(project_id, account_id)`는 일반 INDEX다.
- 소비자: `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:225-272` — RFC-176의 팀 일괄 배정이 같은 endpoint를 사용하며 요청 인원 수를 성공 건수로 표시한다.
- 재현/영향: 두 브라우저/탭에서 같은 project/account를 거의 동시에 추가한다. UNIQUE 제약이 없으므로 두 statement가 모두 absence를 관측하면 서로 다른 UUID PK로 같은 membership을 삽입할 수 있다. 이후 관계도 link, roster, snapshot 공수/급여 집계가 중복 행만큼 부풀 수 있다. 실제 Forge SQL 격리 수준에서의 race 실행은 **미검증**이지만, schema가 중복 상태를 금지하지 않는 사실은 확정이다.
- 근본 원인: application-level 선행 확인을 database invariant로 오인했다. `_workspace/team-analytics/02_frontend_report_allocation.md:145-147`의 “중복 행도 생기지 않는다”는 순차 요청에만 성립한다.
- 수정 방법: 기존 중복을 deterministic하게 정리하는 migration 후 `UNIQUE(project_id, account_id)`를 추가하고, INSERT는 지원되는 conflict-safe 방식으로 바꾼다. 응답에 `requestedCount`, `insertedCount`, `skippedCount`를 반환해 toast도 실제 삽입 수를 표시한다.
- 필요한 테스트: real/test SQL에서 동시 insert 두 개를 실행해 최종 행 수 1을 단언하고, schema contract로 UNIQUE index를 고정한다. 순차 중복, 요청 내 중복, 동시 중복 및 실제 count 응답을 각각 검증한다.

### F-176-06 — ACTIVE 상태 정규식의 부정어/부분 문자열 거짓 양성

- 판정/우선순위: **실패 / P2**
- 생산자: `src/resolver/resourceManagement/ResourceManagementService.js:193-206`의 기존 정규식을 RFC-176이 frontend에 복제했다.
- 소비자: `static/ui/src/utils/projectLifecycle.js:27-55`, `:78-81`; `static/ui/src/pages/resource/teamAnalytics/hooks/useTeamAnalyticsData.js:133-143`.
- 재현/영향: statusName이 `Not Done`, `Incomplete`, `Unfinished`이면 현재 정규식은 각각 `Done`, `complete`, `finished` 부분 문자열에 match하여 종료로 판정한다. 직접 실행 결과 세 값 모두 `true`였다. 기본 ACTIVE preset에서 실제 진행 project가 빠지고 공수/진척/리스크 분모가 축소된다.
- 근본 원인: word boundary와 부정어 처리가 없는 이름 휴리스틱을 key가 없는 모든 status에 적용했다. frontend parity test(`projectLifecycle.test.js:35-64`)는 backend와 동일한지만 검증하고 의미 정확성을 검증하지 않는다.
- 수정 방법: 가능한 경우 stable terminal status key 집합을 정본으로 사용한다. name fallback이 필요하면 trim/normalize 후 정확 일치 목록을 쓰고, 조직이 custom final status를 설정으로 매핑하게 한다. 최소한 영문 token boundary와 명시적 부정 케이스를 둔다. backend/frontend 사본 대신 resolver가 canonical `isTerminal`을 내려 중복 구현을 없애는 편이 안전하다.
- 필요한 테스트: `Not Done`, `Incomplete`, `Unfinished`, `Reopened`, `Done`, `Closed`, `Completed`, 한국어 완료 상태 및 custom key를 양쪽에 추가한다. “양쪽이 같은 잘못을 한다”는 parity test와 의미 test를 분리한다.

### F-176-07 — `getTeamAnalyticsScope` grant가 최종 설계보다 넓음

- 판정/우선순위: **실패 / P2**
- 설계 생산자: `_workspace/team-analytics/01_architect_design.md:340-360`은 유일 소비처 `/resource`의 page gate를 mirror하도록 `R('RESOURCE_MANAGEMENT','none')`으로 축소한다고 확정한다.
- 코드 생산자: `src/permission/PermissionMap.js:329-336`은 여전히 `OR(REPORT, RESOURCE_MANAGEMENT, TEAM_MANAGEMENT)`이다.
- 소비자: `src/resolver/teamAnalytics/TeamAnalyticsController.js:14-15`; 정상 UI는 `ResourcePage` gate로 제한되지만 resolver 자체는 넓은 grant를 신뢰한다.
- 재현/영향: `TEAM_MANAGEMENT read=true`, `RESOURCE_MANAGEMENT read=false` principal이 앱의 다른 접근 가능한 화면에서 resolver를 직접 invoke하면 guard를 통과하고 scope service의 org-wide 판정에 따라 팀 계층, 인원 수, leader 이름을 받을 수 있다. REPORT-only는 현재 service에서 보통 `NONE`이지만 넓은 grant를 유지할 설계 근거는 아니다.
- 근본 원인: P1-a 초안 grant가 D7 최종 결정 뒤 갱신되지 않았다. 코드 주석도 폐기된 초안 근거를 유지한다.
- 수정 방법: 최종 설계대로 `R('RESOURCE_MANAGEMENT', 'none')`로 좁히고, permission contract test에 REPORT-only/TEAM-only deny, RESOURCE allow를 명시한다. 조직이 TEAM 관리자가 이 데이터를 직접 보아야 한다고 결정한다면 설계와 page navigation을 함께 수정해야 하며, 현재처럼 backend만 넓혀 두면 안 된다.
- 필요한 테스트: permission guard 수준에서 세 principal 조합을 실행하고, frontend tab gate와 backend grant의 등가성을 단언한다.

### F-176-08 — 부분 집계 신호가 KPI/롤업에서 소실됨

- 판정/우선순위: **실패 / P2**
- 생산자: `static/ui/src/utils/team/teamMetrics.js:244-266`, `:314-350`은 row/flatGroup에 `missing`을 보존하고 rollup도 field별 missing을 누적한다.
- 소비자:
  - `static/ui/src/pages/resource/teamAnalytics/TeamKpiRow.jsx:77-101` — null을 제외한 숫자만 합산하여 부분합을 완전한 값처럼 표시한다.
  - `static/ui/src/pages/resource/teamAnalytics/charts/TeamRollupTable.jsx:93-146` — `direct.missing`/`total.missing`을 전혀 읽지 않는다.
- 재현/영향: 선택 팀 A의 effort=10, 팀 B의 effort=null/missing=1이면 KPI는 10을 표시하고 “일부 집계 전” 표지가 없다. salary, completion, utilization과 롤업 direct/total에도 같은 오해가 생긴다. 설계의 `missing[field] > 0 → * + Tooltip` 계약(`01_architect_design.md:889`)을 위반한다.
- 근본 원인: 집계 모델의 availability metadata와 표시 모델을 연결하지 않았다. 현재 `partialSeries`는 null team을 차트에서 제거한 수만 알리며 KPI/표 cell의 부분합을 설명하지 못한다.
- 수정 방법: KPI aggregate를 `{ value, missingCount }`로 만들고, 각 cell도 direct/total missing을 별도로 표시한다. 일부만 알려졌다면 값 옆 `*`와 tooltip을, 전부 미집계면 dash를 표시한다.
- 필요한 테스트: 각 metric에 known+null 혼합 fixture를 넣어 KPI와 direct/total cell marker를 검증하고, missing=0일 때 marker가 없는지 확인한다.

### F-176-09 — 팀 비교 축 7종 계약 중 3종 누락

- 판정/우선순위: **실패 / P2**
- 설계 생산자: `_workspace/team-analytics/01_architect_design.md:475-484`은 RESOURCE 축 2개(`utilization`, `utilMemberCount`)와 REPORT 축 5개(`effortMd`, `salary`, `completionRate`, `delayedShare`, `riskScoreWeighted`)를 규범 계약으로 둔다.
- 코드 생산자: `static/ui/src/utils/team/teamMetrics.js:244-245`에서 delayed/risk 값을 이미 계산하지만 `:363-394`의 축 목록은 utilization/effort/completion/salary 4개뿐이고, `:438-454`의 merged DTO가 delayed/risk/분모를 버린다.
- 소비자: `static/ui/src/pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:64-85`는 이 축 목록을 그대로 selector와 `teamComparison`에 사용한다.
- 재현/영향: REPORT 사용자는 지연 노출과 MD 가중 risk 비교를 선택할 수 없고 RESOURCE-only 사용자도 가동률 산출 인원 비교를 할 수 없다. 데이터 계산 비용은 이미 지불하지만 제품 insight가 사라진다.
- 근본 원인: P1-b 당시 4축 API를 옮긴 뒤 최종 설계의 additive 3축을 consumer contract에 반영하지 않았다. 기존 테스트(`teamMetrics.test.js:168-181`, `teamAnalyticsI18n.test.js:107`)가 4축 자체를 기대해 누락을 회귀가 아닌 정답으로 고정한다.
- 수정 방법: 세 축을 axis registry/i18n에 추가하고 `teamComparison` merged row와 missing map에 필드를 보존한다. delayed/risk는 ratio axis로 등록하고 “기타” 묶음은 비율 평균이 아니라 numerator/denominator 합으로 재계산한다.
- 필요한 테스트: 권한/costMasked별 가용 축 정확 목록, delayed 5 + 정상 5 = 50%, risk weighted ratio, `utilMemberCount` 합계, 기타 묶음 ratio를 검증한다.

### F-176-10 — unknown team과 unassigned team을 구분하지 않음

- 판정/우선순위: **실패 / P2**
- 생산자: `static/ui/src/pages/resource/allocation/AllocationGraphSection.jsx:46-56`은 name map에 없는 non-null teamKey도 member map에 유지한다.
- 소비자:
  - `static/ui/src/pages/resource/allocation/allocationGraphOption.js:96-115` — 이름 조회 실패 시 `unassignedLabel`을 사용한다.
  - `static/ui/src/pages/resource/teamAnalytics/TeamScopeSelector.jsx:33-40` — 이름이 없으면 `teamKey` 자체를 label로 노출한다.
- 재현/영향: `memberTeamMap: {a:'ghost-team'}`, 빈 `teamNameMap`이면 graph node id는 `t:ghost-team`인데 화면 label은 “팀 미지정”이다. 실제 미소속 `__NONE__`과 서로 다른 두 node가 같은 이름으로 나타난다. selector에서는 UUID/teamKey가 사용자에게 노출된다. 요구사항 `requirement.md:59-60`의 unknown=`team.form.unknownTeam`, unassigned=`team.unassigned.label`, UUID label 금지를 위반한다.
- 근본 원인: label fallback이 key 존재 여부가 아니라 name 존재 여부만 본다.
- 수정 방법: `key===TEAM_NONE_KEY`만 unassigned, non-null key의 name 누락은 `unknownTeamLabel`로 분기한다. `buildAllocationOption`에 해당 label을 주입하고 selector도 같은 fallback을 쓴다.
- 필요한 테스트: unknown key와 true unassigned가 동시에 있을 때 서로 다른 label/node로 남고 UUID가 UI text에 없는지 검증한다. 현재 graph test는 정상 named team과 true unassigned만 다룬다.

### F-176-11 — 팀 일괄 배정 payload/statement에 상한과 chunk가 없음

- 판정/우선순위: **실패 / P2**
- 생산자: `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:237-258` — 현재 팀의 모든 row를 한 배열로 만든 뒤 단일 invoke한다.
- 소비자: `src/resolver/projectIssue/ProjectUsersService.js:36-48`, `src/rdb/query/ProjectUsersQuery.js:4-27` — 전체 account IDs를 존재 확인 및 단일 `IN` INSERT로 처리한다.
- 재현/영향: 매우 큰 팀을 선택하면 front-end invocation request 500KB, SQL request 1MiB 또는 DML 10초 한도에 걸려 전체 요청이 실패한다. 실제 accountId 길이와 최대 팀 인원에 따른 임계값은 **미검증**이며 현재 server/client에 명시적 최대 인원도 없다.
- 근본 원인: 기존 endpoint가 배열을 받는다는 사실을 무제한 bulk API 계약으로 확장했다.
- 수정 방법: server가 허용하는 `MAX_BULK_ASSIGN`을 계약으로 반환/검증하고, frontend는 bounded chunk로 나누어 진행률과 부분 실패를 표시한다. backend는 각 chunk의 inserted/skipped count를 반환하며 F-176-05의 UNIQUE 제약을 먼저 갖춰야 한다.
- 필요한 테스트: 경계값 N/N+1, 500KB 근접 payload, 여러 chunk 중 중간 실패, 재시도 idempotency를 검증한다. 공식 한도는 [Forge invocation limits](https://developer.atlassian.com/platform/forge/limits-invocation/)와 [Forge SQL limits](https://developer.atlassian.com/platform/forge/limits-sql/)를 기준으로 한다.

### F-176-12 — 새 필터/접이식 control의 접근성 상태 누락

- 판정/우선순위: **실패 / P3**
- 위치:
  - `static/ui/src/pages/resource/teamAnalytics/TeamScopeSelector.jsx:49-66` — `inputId`는 있지만 연결된 `<label htmlFor>` 또는 `aria-label`이 없다.
  - `static/ui/src/pages/resource/teamAnalytics/TeamProjectFilter.jsx:60-105` — plain text label이 Select와 programmatic하게 연결되지 않고 preset 버튼에 `aria-pressed`가 없다.
  - `static/ui/src/pages/resource/assignment/ProjectAssignmentBoard.jsx:321-339` — disclosure button에 `aria-expanded`/`aria-controls`가 없다.
- 재현/영향: screen reader 사용자는 두 Select의 이름과 현재 preset/disclosure 상태를 안정적으로 알기 어렵다.
- 근본 원인: visual text/color state만 구현하고 accessible state contract를 추가하지 않았다.
- 수정 방법: 실제 label을 `inputId`에 연결하고, toggle 성격 버튼에는 `aria-pressed`, disclosure에는 `aria-expanded`와 panel id/`aria-controls`를 추가한다.
- 필요한 테스트: Testing Library role/name 조회 및 pressed/expanded 상태 전환, axe 기반 smoke test를 추가한다.

### F-176-13 — 규범 문서와 구현 보고서의 폐기된 계약

- 판정/우선순위: **실패 / P3**
- 위치/불일치:
  - `_workspace/team-analytics/01_architect_design.md:881`은 REPORT 미보유 시 `NoPermissionPage`라고 쓰지만 최종 D7 규범(`:572-585`)과 현재 구현은 REPORT를 축 단위 gate로만 쓴다.
  - 같은 문서 `:815`는 추이 기여를 `hasTrendSeries`로 확정하지만 `:819`, `:1777`은 다시 `trendReady`만 보라고 적는다. 0명 project가 `trendReady:true`일 수 있어 향후 P2 구현 시 빈 trend widget 회귀를 만든다.
  - `static/ui/src/pages/resource/teamAnalytics/charts/TeamCompareBar.jsx:30-33`은 project filter가 사라졌다고 적지만 RFC-176은 같은 컴포넌트에 `isFilteredView`를 전달한다.
  - `_workspace/team-analytics/02_frontend_report_allocation.md:145-147`은 `NOT EXISTS`가 중복 행을 막는다고 단정해 동시성 한계를 숨긴다.
- 영향: 후속 구현/리뷰가 오래된 checklist를 따라 gate, trend, data integrity를 다시 깨뜨릴 수 있다.
- 수정 방법: 규범 인덱스가 가리키는 문장만 남기고 상충 문장을 삭제하거나 `폐기됨`으로 명시한다. 보고서에는 순차 중복 스킵과 동시 UNIQUE 보장을 분리해 쓴다.
- 필요한 테스트: 문서 자체는 자동 테스트가 어렵지만 `hasTrendSeries` gate와 permission map을 contract test로 고정하고, 설계 checklist 링크 검사를 review gate에 포함한다.

## 4. 통과한 핵심 경계

다음 항목은 현재 코드와 실행 결과 기준 **통과**다.

1. **resolver 이름/등록/unwrap**
   - `src/index.js:30,35,82,85`에서 resource/team analytics controller가 등록된다.
   - `TeamAnalyticsController.js:14-15` ↔ `useTeamAnalyticsData.js:68-72`의 `getTeamAnalyticsScope` 이름과 `{success, content}` unwrap이 일치한다.
   - `ResourceManagementController.js:24` ↔ `useResourceAllocation.js:21-25`의 `getResourceAllocationGraph` 이름과 unwrap이 일치한다.

2. **fail-close와 query key factory**
   - 새 query는 `teamAnalyticsKeys.scope()`, `portfolioKeys.dashboard()`, `resourceKeys.allocation()` factory를 사용하며 inline query key가 아니다.
   - queryFn은 `!res?.success`/`!content`를 error로 전환한다.
   - 현재 RFC-163 후속 코드의 cost gating은 응답 부재 시 masked로 닫힌다.

3. **서버 가시 scope의 집계 전 적용**
   - 최초 server scope는 `teamMetricsByTeam`과 `rollupTeamTree` 생성 전에 적용되어 비가시 팀이 unknown label로 재등장하는 경로를 막는다. F-176-01은 이 server scope가 아니라 이후 UI team selection의 일관성 문제다.

4. **N+1 회피와 graph 안정성**
   - 관계도 SQL은 단일 join이고 Jira user map은 distinct account bulk로 가져온다.
   - team/status/role/rollup/settings는 병렬로 읽는다.
   - client cap은 project를 줄일 때 연결되지 않은 link/member도 함께 제거하고, hash 기반 색은 filter 순서와 무관하다. 단, F-176-04처럼 backend volume cap 역할은 하지 못한다.

5. **i18n 및 문자열 안전성**
   - ko/en source key parity test와 frontend 전체 테스트가 통과했다.
   - graph tooltip은 untrusted text를 escape한 뒤 HTML을 구성한다.
   - RFC-176 commit에는 source locale과 merged locale이 함께 들어 있다. 현재 merged locale의 dirty 상태는 다른 RFC 작업 때문이므로 build/merge는 건드리지 않았다.

6. **테스트 실행**
   - root: `npm test -- --runInBand` → 65 suites, 1,057 tests 통과.
   - frontend: `cd static/ui; npm test -- --runInBand` → 64 suites, 1,074 tests, snapshot 1개 통과.
   - 실패 경로 test가 의도적으로 출력한 `console.error` 외 test 실패는 없었다.

## 5. 미검증·추론 항목

- Forge 실제 tenant에서 SQL 4MiB/5초 및 invoke 500KB/5MiB에 도달하는 정확한 행 수는 데이터 길이에 따라 달라 실행하지 않았다. F-176-03/04/11은 **무제한 경로가 존재한다는 코드 사실은 실패**, 실제 임계 규모는 미검증이다.
- F-176-05의 concurrent duplicate는 UNIQUE 부재와 check-then-insert 구조에서 가능한 race라는 추론이다. Forge SQL 실제 동시 transaction 재현은 하지 않았다.
- browser/E2E와 screen reader/axe는 실행하지 않았다. F-176-12는 DOM source의 accessible attribute 부재를 근거로 판정했다.
- `npm run build`는 다른 작업자의 dirty generated locale을 보호하기 위해 실행하지 않았다. 따라서 bundler 최종 산출물은 미검증이다.

## 6. 권장 수정 순서

1. F-176-05 UNIQUE invariant와 F-176-02 allocation cache invalidation을 먼저 고정한다.
2. F-176-03/04의 server-side projection·pagination/cap으로 운영 전체 실패를 막는다.
3. F-176-01의 선택 의미를 확정하고 모든 차트/KPI/표를 한 derived model로 통일한다.
4. F-176-06/07/08/09/10/11 계약을 수정하고 각 경계 test를 추가한다.
5. 접근성과 설계 문서 drift를 정리한 뒤 build 및 browser-level 회귀를 실행한다.

이 순서가 좋은 이유는 data integrity와 stale cache를 먼저 안정화해야 이후 analytics 숫자 검증의 정본이 흔들리지 않기 때문이다. 관계도를 제대로 다시 단조하려면, query도 cache도 함께 Forge해야 한다.
