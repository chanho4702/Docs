# RFC-163 급여 정책 상세 코드 리뷰

## 1. 결론

**최종 판정: 실패 — 현재 상태로 배포 차단 권고.**

- 검토 대상: commit `1cfc9bf`와 이를 포함한 현재 `develop` HEAD `3f0e73a`
- 검토 기준: `_workspace/salary-policy/00_input/requirement.md`, `01_architect_design.md` r3, backend/frontend 구현 보고서, 기존 `03_verify_report.md`, 실제 생산자·소비자 코드
- 발견: **P0 2건, P1 6건, P2 2건, P3 1건**
- 핵심 배포 차단 사유:
  1. `DASHBOARD read`만으로 `INDIVIDUAL`의 `total_salary`를 조회할 수 있어 1인 프로젝트의 개인 투입급여가 노출된다.
  2. 정책 전환 뒤 다른 브라우저와 이미 열린 화면의 React Query cache가 이전 개인 금액을 계속 렌더한다.
  3. band 변경은 정책 enum을 바꾸지 않으므로 ProjectCost cache와 portfolio snapshot이 이전 대표값을 정상 데이터로 재사용한다.
  4. Custom Entity level query는 eventual consistency이고 100건으로 잘리는데, 두 특성이 모두 재무 계산의 입력에 직접 연결되어 있다.

현재 worktree에는 리뷰 시작 전부터 RFC-171 및 locale 변경과 함께 아래 RFC-163 후속 수정이 미커밋 상태로 존재했다.

- `static/ui/src/backoffice/page/level/LevelPage.jsx` 수정
- `static/ui/src/utils/queryKey/salaryBandInvalidation.js` 및 테스트 추가

이 후속 수정도 함께 검토했다. 관련 query key 무효화 범위는 일부 개선하지만, 서버 KVS cache·SQL snapshot·다른 사용자 세션·Custom Entity eventual consistency는 해결하지 못한다. 리뷰 과정에서는 제품 코드를 수정하지 않았다.

## 2. 심각도별 발견 사항

### P0-1. `DASHBOARD read`만 가진 사용자가 `total_salary`를 조회할 수 있다

**판정: 실패 / 민감정보 권한 우회**

생산자:

- `src/permission/PermissionMap.js:180-184` — `getSummaryData`는 `R('DASHBOARD', 'detail')`만 요구한다.
- `src/resolver/projectDashboard/ProjectDashboardController.js:27-31` — 정책이 `INDIVIDUAL`이면 principal의 `PROJECT_COST` 권한을 확인하지 않고 서비스 결과 전체를 반환한다.
- `src/resolver/projectDashboard/ProjectDashboardService.js:44-70` — `total_salary`를 항상 결과에 포함한다.
- `src/rdb/query/ProjectDashboard.js:9-10` — 값은 `SUM(projectusers.salary)`이다.

소비자:

- `static/ui/src/pages/projectDetail/dashboard/summary/SummaryPanel.jsx:15-20` — `DASHBOARD` 화면에서 resolver를 직접 호출한다.
- `static/ui/src/pages/projectDetail/dashboard/summary/SummaryPanel.jsx:39-52` — 키가 존재하면 그대로 금액 KPI를 렌더한다.

재현:

1. 사용자의 permission에 `DASHBOARD:read`를 부여하고 `PROJECT_COST:read`는 부여하지 않는다.
2. 정책을 `INDIVIDUAL`로 둔다.
3. 인원이 1명인 프로젝트 dashboard를 연다.
4. `getSummaryData` 응답의 `total_salary`가 그 한 사람의 `projectusers.salary`와 동일하게 노출된다.

영향:

- `PROJECT_COST` 권한 카탈로그가 보호해야 할 개인 투입급여를 별도의 더 약한 권한으로 조회할 수 있다.
- 1인 프로젝트에서는 합계가 곧 개인 금액이다. 소수 인원 프로젝트도 다른 정보와 결합해 역산 가능하다.
- Controller 주석 `ProjectDashboardController.js:24`가 이를 "기존 결함"으로 명시했지만, RFC-163이 해당 민감 필드의 정책 게이트를 직접 수정한 이상 릴리스에서 그대로 둘 수 없다.

근본 원인:

- 정책 게이트와 비용 권한 게이트를 서로 다른 문제로 취급했다. `LEVEL_BAND` 여부는 값의 산정 방식이고 `PROJECT_COST`는 값의 열람 권한이므로 두 조건을 모두 만족해야 한다.

수정 방법:

- `getSummaryData` handler에서 `principal`을 받고 `canReadCost(principal)`과 `canShowIndividualSalary(policy)`를 모두 만족할 때만 `total_salary`를 포함한다.
- 하나라도 실패하거나 policy가 unknown이면 키 자체를 제거하고 명시적인 `costMasked`/`costMaskedReason`을 내려 프론트가 숨김 상태를 표시하게 한다.
- 내부 소비자인 ProjectCost/ProjectUsers/ProjectProgress는 현재처럼 service를 직접 호출하되, resolver 응답 게이트와 내부 계산 API를 타입 또는 함수로 분리해 재노출 실수를 막는다.

필수 테스트:

- `DASHBOARD r / PROJECT_COST 없음 / INDIVIDUAL / 1인 프로젝트`에서 `total_salary` 키 부재.
- `DASHBOARD r / PROJECT_COST r / INDIVIDUAL`에서만 키 존재.
- `PROJECT_COST r / LEVEL_BAND`, policy 조회 실패, policy 불명값에서 키 부재.
- permission contract test가 `getSummaryData`의 보조 `PROJECT_COST` service gate까지 검증하도록 추가.

### P0-2. 정책 전환 뒤 이전 개인 금액이 클라이언트 cache에서 계속 렌더된다

**판정: 실패 / D3·D8 즉시 은닉 위반**

생산자:

- backend의 새 응답은 `LEVEL_BAND`에서 개인 금액을 제거하지만, 이미 받아 둔 `INDIVIDUAL` 응답을 서버가 회수할 방법은 없다.
- `static/ui/src/backoffice/page/setting/SalaryPolicySetting.jsx:115-120` — 정책 저장 후 현재 브라우저의 settings/cost/salary/summary/user/level만 invalidate한다. `portfolioKeys.dashboard()`와 dashboard salary chart cache는 빠져 있고 다른 브라우저에는 영향이 없다.

소비자:

- `static/ui/src/hooks/useSalaryPolicy.js:63-73` — settings를 10분 fresh로 유지하고, cached response의 policy를 현재 settings보다 우선한다.
- `static/ui/src/hooks/useSalaryPolicy.js:66-70` — settings의 불명값도 `INDIVIDUAL`로 접는다.
- `static/ui/src/backoffice/page/user/UserListPaging.jsx:30-45,51-55,91-96` — 개인 급여가 든 목록을 3분 cache하고 이전 응답 policy로 `SalaryCell`을 렌더한다.
- `static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx:74-88` — 급여 rows도 응답 policy를 우선한다.
- `static/ui/src/pages/projectDetail/dashboard/ChartTemplate.js:59-81` — salary chart 결과를 5분 cache한다.
- `static/ui/src/pages/portfolio/PortfolioDashboardPage.jsx:39-43` — `members[].salary`와 `totalSalary`를 포함할 수 있는 portfolio 응답을 5분 cache한다.
- `static/ui/src/pages/resource/teamAnalytics/hooks/useTeamAnalyticsData.js:82-90` — 같은 portfolio cache를 팀 분석에서도 소비한다.

재현 A — 다른 브라우저:

1. 브라우저 A에서 `INDIVIDUAL` 상태의 사용자 목록 또는 portfolio를 열어 개인 급여를 cache한다.
2. 브라우저 B에서 정책을 `LEVEL_BAND`로 변경한다.
3. 브라우저 A를 focus 변화 없이 계속 사용한다.
4. A에는 invalidate/push/polling이 없고 cached response가 스스로 `INDIVIDUAL`이라고 말하므로 이전 금액이 계속 렌더된다.

재현 B — 같은 브라우저:

1. 개인 급여 화면을 연 뒤 설정 화면에서 정책을 변경한다.
2. 다시 급여 화면으로 돌아간다.
3. invalidated query가 refetch되는 동안 기존 cache가 먼저 렌더되고, response policy 우선 규칙 때문에 이전 개인 금액이 잠깐 다시 보인다. portfolio와 chart는 invalidate 대상에서도 빠져 더 오래 남는다.

영향:

- 정책 변경의 보안 의미가 서버의 새 호출에만 적용되고, 이미 열린 화면에는 적용되지 않는다.
- TanStack Query의 stale 상태는 자동 삭제나 즉시 refetch가 아니다. 기본적으로 stale query는 새 mount, window focus, reconnect 같은 시점에 background refetch된다. active 화면은 시간이 흘렀다는 이유만으로 자동 갱신되지 않는다. 공식 근거: [TanStack Query Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

근본 원인:

- "그 응답이 어떤 정책으로 생성됐는가"만 신뢰하고 "현재 정책이 여전히 같은가"를 독립적으로 확인하지 않는다.
- 보안 상태 변경을 로컬 query invalidation으로 전파할 수 있다고 가정했다.

수정 방법:

- 개인 금액 표시는 **현재 정책이 확인된 `INDIVIDUAL` AND 응답 policy도 `INDIVIDUAL`**일 때만 허용한다. 두 값이 다르거나 하나가 unknown이면 즉시 숨기고 해당 data query를 제거/refetch한다. 응답 policy가 현재 policy보다 우선해서는 안 된다.
- 정책 query는 민감 화면에서 `staleTime: 0`, `refetchOnMount: 'always'`, `refetchOnWindowFocus: 'always'`로 운용하고, 정책 version을 짧은 주기로 polling하거나 서버 push에 준하는 전파 수단을 둔다. 요구사항의 "즉시"가 허용하는 최대 지연 SLA를 명시한다.
- 정책 변경 시 `portfolioKeys.all`, `projectKeys.dashboardItem...` 전체 prefix를 포함한다. 미커밋 `invalidateSalaryBandViews`에도 portfolio/dashboard가 없다.
- 정책 확인 중에는 cached sensitive payload 자체를 화면에서 사용하지 않고 skeleton/숨김 상태로 둔다. `keepPreviousData`/기존 cache는 정책 검증 완료 후에만 사용한다.

필수 테스트:

- cached response policy=`INDIVIDUAL`, current settings=`LEVEL_BAND`이면 UserList/SalaryManagement/SalaryCell/portfolio/chart 어디에서도 금액이 렌더되지 않는다.
- cached response=`INDIVIDUAL`, current settings loading/error/unknown에서도 숨긴다.
- 정책 mutation invalidation 목록에 `portfolioKeys.all`과 dashboard salary item prefix가 포함된다.
- 두 QueryClient를 사용한 다중 세션 모의 테스트와 polling/version 변경 테스트.

### P1-1. 저장된 policy가 손상되거나 미래 enum이 추가되면 모든 게이트가 `INDIVIDUAL`로 fail-open한다

**판정: 실패 / fail-close 계약 위반**

생산자:

- `src/resolver/backoffice/setting/SettingService.js:9-13` — 저장값을 읽을 때 도메인 검증 없이 defaults와 병합한다.
- `src/resolver/projectCost/SalaryPolicy.js:16-23` — 정확한 `LEVEL_BAND` 외의 모든 값, 객체, 오타, 미래 enum을 `INDIVIDUAL`로 정규화한다.
- `src/permission/SalaryVisibility.js:25,33-39` — read 예외는 숨기지만 정상 read로 받은 잘못된 값은 개인 급여 공개로 판단한다.
- `src/resolver/projectCost/SalaryPolicyContext.js:23-30` — 계산 경로도 잘못된 값을 개인급여 모드로 처리한다.
- `src/resolver/portfolioDashboard/PortfolioDashboardService.js:148,183-185` — 현재/스냅샷의 잘못된 값도 `INDIVIDUAL`로 접어 서로 일치한 것으로 볼 수 있다.
- `src/resolver/projectCost/__test__/SalaryPolicy.test.js:21-29` — `FOO`, 객체, 빈 문자열까지 `INDIVIDUAL`로 만드는 동작을 테스트가 고정한다.

소비자:

- user 목록/상세/Excel, project salary rows, summary, salary chart는 `canShowIndividualSalary`가 true가 되어 raw salary를 반환한다.
- `static/ui/src/hooks/useSalaryPolicy.js:66-73`도 settings의 unknown을 `INDIVIDUAL`로 표시한다.

재현:

1. KVS settings의 `salaryPolicy`를 `LEVEL-BAND`, `MIXED`, `{}`처럼 domain 밖 값으로 만든다. 이는 데이터 손상, 수동 운영, 단계적 배포, 향후 enum 추가에서 발생할 수 있다.
2. user 목록 또는 `getSummaryData`를 호출한다.
3. 저장소 read는 성공하므로 catch가 동작하지 않고 raw 개인 금액이 응답된다.

영향:

- "정책을 모르면 숨김"이라는 민감정보 기본 원칙이 예외 상황이 아니라 정상 read path에서 깨진다.
- 미래 정책 추가 시 구버전 함수가 자동으로 가장 공개적인 모드로 동작한다.

근본 원인:

- legacy의 **속성 부재**와 **잘못된 속성 값**을 하나의 normalize 함수로 합쳤다.

수정 방법:

- strict parser를 도입해 `undefined/null`인 legacy 부재만 migration boundary에서 `INDIVIDUAL`로 보충한다.
- 정확한 두 enum만 허용하고 그 외 값은 표시 경로에서 hidden, 계산/write 경로에서 명시 오류로 처리한다.
- snapshot의 unknown은 legacy `NULL`과 구분해 stale/masked 처리한다.
- 프론트도 settings에 `coerceSalaryPolicy`를 사용하고 null이면 숨긴다.

필수 테스트:

- `undefined/null` legacy case와 `''/FOO/MIXED/{}` corrupt case를 분리한다.
- corrupt 값에서 user list/detail/Excel/chart/summary/project salary에 금액 키가 없고, cost 계산은 실패하며, write도 거부되는지 검증한다.
- unknown snapshot이 current policy와 우연히 같다고 판단되지 않는지 검증한다.

### P1-2. band 변경은 cache/snapshot version에 포함되지 않고 eventual query가 이전 값을 다시 cache한다

**판정: 실패 / cache parity 및 재무 정합성 위반**

생산자:

- `src/resolver/backoffice/level/LevelService.js:139-162` — level band를 Custom Entity에 저장하지만 salary basis revision을 갱신하지 않는다.
- `src/resolver/backoffice/level/LevelService.js:81-97`과 `src/nosql/query/CustomEntityManager.js:75-81` — 저장 후 재조회는 `entity().query()`이다.
- `src/resolver/projectCost/ProjectCostService.js:75-100` — cache hit 유효성은 `cached.salaryPolicy` enum만 현재 policy와 비교한다.
- `src/resolver/projectCost/ProjectCostService.js:171-205` — 대표값 hash/revision 없이 10분 cache한다.
- `src/resolver/portfolioDashboard/PortfolioAggregator.js:399-428` — snapshot에도 `salaryPolicy`만 저장한다.
- `src/resolver/portfolioDashboard/PortfolioDashboardService.js:172-188` — read-time stale 판정도 policy enum만 비교한다.

소비자:

- ProjectCost 응답의 `budget`, `evm`, `monthlyCost`, `byRole`, `byLevel`, `byTeam`은 cached payload를 재사용한다.
- 같은 cache hit에서 `byIssue`만 `ProjectCostService.js:216-229`가 현재 band로 다시 계산한다.
- portfolio/team analytics는 같은 policy라는 이유로 이전 snapshot의 금액을 그대로 표시한다.

재현:

1. `LEVEL_BAND`, L1 representative=34,000,000으로 ProjectCost cache와 portfolio snapshot을 만든다.
2. L1 representative를 40,000,000으로 변경한다. policy enum은 계속 `LEVEL_BAND`다.
3. ProjectCost를 다시 열면 기존 cache가 hit한다. 상단 total/byRole/byLevel/monthly 값은 34,000,000 기준인데 `byIssue`만 40,000,000 기준으로 재계산될 수 있다.
4. portfolio snapshot도 policy가 일치하므로 다음 aggregation 전까지 34,000,000을 정상값처럼 보여준다.
5. 더 나쁘게는 변경 직후 `entity().query()`가 이전 band를 반환할 수 있어, invalidate/refetch가 오히려 옛 값을 새로운 5분/10분 cache에 다시 넣을 수 있다.

공식 근거:

- Atlassian은 Custom Entity의 `entity().query`가 **eventually consistent**이며 `entity().get`은 **strictly consistent**라고 명시한다: [Custom Entity Store — Data consistency](https://developer.atlassian.com/platform/forge/storage-reference/entities/).
- 따라서 미커밋 `salaryBandInvalidation.js:12-18`의 프론트 invalidate만으로 저장 직후 최신값을 보장할 수 없다.

영향:

- 한 API 응답 안에서 집계 축별 금액이 서로 달라진다.
- 정책 전환 stale-mask는 동작해도 동일 정책 안의 대표값 변경은 전혀 감지하지 못한다.
- 관리자가 값 변경 성공 토스트를 본 직후에도 이전 비용이 새로운 cache TTL 동안 고착될 수 있다.

근본 원인:

- cache identity를 policy enum으로만 정의했다. 실제 계산 basis는 `(policy + 모든 사용 level의 band 값)`이다.
- write-after-read 정합성이 필요한 재무 경로에 eventual list query를 사용했다.

수정 방법:

- `salaryBasisVersion` 또는 canonical band fingerprint를 policy context, ProjectCost cache, SQL snapshot에 저장하고 current 값과 대조한다. 불일치하면 cache miss, snapshot mask 처리한다.
- 재무 계산에 필요한 level key를 SQL member rows에서 먼저 모은 뒤 `entity().get(levelKey)`로 strict-consistent 조회하거나, regular KVS의 strongly-consistent 단일 salary-band catalog/version을 원천으로 사용한다.
- add/update/delete/bulk 모든 mutation이 같은 revision 규약을 따라야 한다. write와 revision 갱신의 원자성/실패 복구 규칙도 설계한다.
- cache hit에서 일부 축만 현재 band로 재계산하지 않는다. basis mismatch면 전체를 재계산한다.

필수 테스트:

- 같은 policy에서 representative 변경 후 기존 ProjectCost cache가 전체 miss되는지 검증한다.
- `byIssue`와 `budget/byRole/byLevel/byTeam`이 동일 basisVersion인지 assertion한다.
- snapshot policy는 같고 basisVersion만 다를 때 cost가 masked되는지 검증한다.
- Custom Entity query가 이전 값을 한 번 반환하는 모의 시나리오에서 새 cache가 오염되지 않는지 검증한다.
- add/update/delete/bulk 모두 revision을 갱신하는 contract test.

### P1-3. level이 100개를 넘으면 나머지 band가 조용히 누락되어 급여가 0이 된다

**판정: 실패 / silent truncation**

생산자:

- `src/nosql/query/CustomEntityManager.js:75-81` — `.limit(100).getMany()` 한 페이지만 반환하고 `nextCursor`를 버린다.
- 같은 파일 `88-138`에는 이미 `findAllPaged`가 있지만 level 경로는 사용하지 않는다.
- `src/resolver/backoffice/level/LevelService.js:81-97` — `findAll()` 결과만 DTO로 만든다.
- `src/resolver/projectCost/SalaryPolicyContext.js:29-30` — 잘린 목록으로 전체 band map을 만든다.
- `src/resolver/portfolioDashboard/PortfolioAggregator.js:511-523` — 이 불완전한 map을 전체 프로젝트에 공유한다.

소비자:

- ProjectCost, project salary, user list, portfolio aggregation, Settings의 missing band count가 모두 같은 잘린 목록을 사용한다.

재현:

1. name index 정렬 기준 level을 101개 이상 만든다.
2. 101번째 이후 level을 가진 구성원을 프로젝트에 배정한다.
3. `LEVEL_BAND` 비용 계산을 실행한다.
4. 해당 level은 band map에 없으므로 effective salary가 0, unpriced로 계산된다. 실제 저장된 band는 조회되지 않는다.

공식 근거:

- Custom Entity query의 `limit` 최대값은 100이고 추가 데이터는 `nextCursor`/`cursor()`로 순회해야 한다: [Querying the Custom Entity Store](https://developer.atlassian.com/platform/forge/storage-reference/entities-api-query/).

영향:

- level 수 증가가 곧 비용 과소계상으로 이어지고 API는 성공으로 응답한다.
- Settings의 `missingBandCount`도 첫 100개만 검사해 운영자 경고가 정확하지 않다.

수정 방법:

- 목록 UI에는 `findAllPaged`를 사용하고 `truncated:true`이면 성공 데이터로 계산하지 않는다.
- 재무 계산은 P1-2의 strict `entity().get(levelKey)` 방식으로 실제 사용 level만 읽는 편이 pagination과 eventual consistency를 함께 피한다.
- catalog 최대 개수를 둘 경우 서버가 create/bulk 단계에서 명시적으로 제한하고 UI에도 알려야 한다.

필수 테스트:

- 101개, 201개 level과 다중 cursor를 mock해 전량 수집을 검증한다.
- 마지막 page의 level을 가진 구성원의 salary가 0으로 떨어지지 않는지 검증한다.
- cursor 잔존 상태에서 상한에 걸리면 계산이 실패/마스킹되고 성공으로 반환되지 않는지 검증한다.

### P1-4. 급여 관리의 `unpricedMemberCount`가 프로젝트 전체가 아니라 현재 10개 page만 센다

**판정: 실패 / 응답 의미와 소비자 표시 불일치**

생산자:

- `src/resolver/projectIssue/ProjectUsersRepository.js:27-30` — 급여 rows에 pagination을 적용한다.
- `src/rdb/query/ProjectUsersQuery.js:97-109` — 전체 수는 window count로 주지만 unpriced 여부의 전체 집계는 없다.
- `src/resolver/projectIssue/ProjectUsersService.js:167-195` — paged rows를 map하는 동안에만 `unpricedMemberCount`를 증가시킨다.
- `src/resolver/projectIssue/ProjectUsersService.js:220` — page-local count를 project meta처럼 반환한다.

소비자:

- `static/ui/src/pages/projectDetail/salary/SalaryManagementPage.jsx:90-101` — 이를 화면 상단의 가격 미산정 인원 경고로 사용하고, pagination은 별도로 `total_count`로 만든다.

재현:

1. 프로젝트 멤버 15명 중 11~15번째 5명만 band가 없게 한다.
2. 급여 관리 1 page를 연다. `unpricedMemberCount=0`이라 경고가 없다.
3. 2 page로 이동하면 동일 프로젝트의 count가 갑자기 5로 변한다.

영향:

- 운영자가 첫 page만 보고 모든 구성원 가격이 설정됐다고 오판한다.
- API 필드명이 page-local 의미를 드러내지 않아 다른 소비자도 전체 count로 사용할 가능성이 높다.

근본 원인:

- 금액 rows의 pagination과 프로젝트 품질 지표의 집계 범위를 분리하지 않았다.

수정 방법:

- project 전체 member의 level/salary_type에 대해 별도의 lightweight count를 계산하거나, 전체 effective salary 판정 후 rows만 page로 자른다.
- page-local 값이 필요하면 `unpricedOnPage`로 별도 명명하고 `meta.unpricedMemberCount`는 전체 프로젝트 수만 반환한다.

필수 테스트:

- 15명/2 page에서 unpriced 구성원을 page 1, page 2, 혼합 배치한 각 경우에도 meta count가 동일한지 검증한다.
- `total_count`, rows 길이, `unpricedMemberCount`의 의미를 response contract test에 고정한다.

### P1-5. 불완전하거나 의미가 모순된 band를 저장할 수 있다

**판정: 실패 / 설계 오류 및 silent zero**

생산자:

- `src/resolver/projectCost/SalaryPolicy.js:123-135` — 음수와 `min > max`만 막고 partial band와 representative 범위 이탈을 허용한다.
- `src/resolver/backoffice/level/LevelService.js:20-42` — 대표값만, min만, max만 있는 조합을 그대로 저장한다.
- `src/resolver/projectCost/SalaryPolicy.js:56-65,78-84` — 세 필드 중 하나만 있어도 map에 넣고, representative만 있으면 비용 계산에 사용한다.
- `src/resolver/projectCost/__test__/SalaryPolicy.test.js:50-69,95-118` — partial과 범위 밖 representative 허용을 의도된 동작으로 고정한다.

소비자:

- `static/ui/src/backoffice/page/level/salaryBand.js:40-68` — representative 범위 이탈은 경고만 하고 저장을 막지 않는다.
- `static/ui/src/backoffice/page/setting/SalaryPolicySetting.jsx:67-75` — 세 필드가 모두 null일 때만 미설정으로 센다.
- SalaryCell은 partial range를 화면에 표시할 수 있지만 비용은 대표값 유무에 따라 0 또는 non-zero가 된다.

재현:

- `{representative: 34,000,000, min: null, max: null}`: 비용은 34,000,000으로 계산되지만 범위 UI는 `-`, missing count는 0이다.
- `{min: 30,000,000, max: null, representative: null}`: 설정 완료로 간주되지만 비용은 0이다.
- `{min: 30,000,000, max: 38,000,000, representative: 999,000,000}`: 화면의 band와 실제 비용이 서로 모순된다.

영향:

- "급여 범위 + 비용 대표값"이라는 정책 설명과 계산이 갈라진다.
- 미설정 경고와 unpriced 경고가 일부 손상 상태를 놓친다.

수정 방법:

- 저장 가능한 상태를 `세 필드 모두 없음` 또는 `min/max 모두 존재 + representative는 자동 중앙값/범위 내 명시값`으로 제한한다.
- 범위 밖 representative를 실제 요구로 허용해야 한다면 UI 용어를 "급여 범위"가 아니라 별도 참고 범위로 바꾸고, Settings missing/invalid count와 portfolio completeness에 모순 상태를 노출한다.
- 기존 partial 데이터는 가격 있음으로 간주하지 말고 invalid/unpriced로 다뤄 운영자가 교정하게 한다.

필수 테스트:

- 8가지 empty/partial/complete 조합과 representative 경계값을 backend/frontend 공통 contract로 검증한다.
- invalid 기존 데이터가 비용 0 또는 대표값으로 조용히 통과하지 않고 경고/오류 상태가 되는지 검증한다.

### P1-6. code와 `salary_policy` schema 사이에 upgrade compatibility window가 있다

**판정: 실패 / 배포 직후 portfolio 전면 오류 가능**

생산자:

- `src/rdb/schema/migrate.js:45-46` — v015에서 `salary_policy` column을 추가한다.
- `manifest.yml:112-118` — migration의 정기 복구 경로는 hourly trigger다.
- `manifest.yml:131-136`, `src/trigger/onInstall.js:9-14` — upgrade event에서도 migration을 실행하지만 이는 새 app version 사용을 선행 차단하는 readiness gate가 아니다.
- `src/rdb/query/PortfolioSnapshotQuery.js:7-33,58-85` — 새 code는 column을 무조건 INSERT/SELECT한다.
- `src/rdb/schema/ddl/portfolioSnapshot.sql.js:50-53` — DDL 자체는 멱등이지만 실행 전 query 호환 fallback이 없다.

재현:

1. v014까지만 적용된 기존 installation에 새 code를 배포/upgrade한다.
2. `avi:forge:upgraded:app` handler가 v015를 완료하기 전에 `getPortfolioDashboard` 또는 aggregation을 호출한다. 또는 event migration이 일시 실패한다.
3. SQL이 존재하지 않는 `salary_policy` column을 참조해 전체 요청이 실패한다. 실패 복구는 다음 hourly trigger까지 지연될 수 있다.

공식 근거:

- Atlassian은 migration runner와 scheduled trigger 사용 시 app이 schema 적용 전에 설치/업데이트될 수 있음을 명시한다: [Manage database schemas](https://developer.atlassian.com/platform/forge/storage-reference/sql-api-schema/).

영향:

- 배포 직후 portfolio/report가 부분 마스킹이 아니라 SQL 오류로 전면 중단된다.
- 기존 `03_verify_report.md`도 실제 upgrade migration E2E는 미검증으로 남겼다.

수정 방법:

- 2단계 배포를 사용한다: 먼저 기존 code와 호환되는 v015 DDL만 배포·실행·installation별 확인한 후 column을 읽는 code를 배포한다.
- 또는 migration readiness를 확인해 column 준비 전에는 portfolio cost를 명시적으로 `SCHEMA_NOT_READY`/masked 처리하는 호환 query path를 둔다.
- migration event 실패를 관측하고 alert/재시도하는 운영 절차를 문서화한다.

필수 테스트:

- v014 schema 상태에서 새 resolver를 먼저 호출하는 upgrade E2E.
- migration 전에는 graceful masked/error contract, migration 후에는 정상 SELECT/UPSERT를 검증한다.
- 신규 설치, 기존 설치 upgrade, event 실패 후 hourly recovery 세 경로를 검증한다.

### P2-1. portfolio/team analytics는 band 누락으로 생긴 0원을 정상 비용처럼 보여준다

**판정: 실패 / 재무 completeness 정보 누락**

생산자:

- `src/resolver/portfolioDashboard/PortfolioAggregator.js:399-428` — snapshot에 `totalSalary`와 members는 저장하지만 `unpricedMemberCount`/salary source/completeness는 저장하지 않는다.
- `src/resolver/portfolioDashboard/PortfolioSnapshotRepository.js:15-40` — SQL bind에도 completeness 필드가 없다.
- `src/resolver/portfolioDashboard/PortfolioDashboardService.js:236-243` — policy가 같고 권한이 있으면 `total_salary ?? 0`을 정상값으로 반환한다.

소비자:

- portfolio와 team analytics는 `costMasked=false`인 한 0을 실제 비용으로 집계하며, 누락 band 경고를 표시할 데이터가 없다.

재현:

1. `LEVEL_BAND`에서 일부 또는 전 구성원의 band를 비운다.
2. portfolio aggregation을 실행한다.
3. 해당 구성원 salary가 0으로 합산되지만 snapshot policy는 `LEVEL_BAND`로 일치한다.
4. portfolio/team dashboard는 과소계상 비용을 경고 없이 표시한다.

영향:

- ProjectCost 화면의 warning을 보지 못하는 REPORT 사용자에게 불완전 비용이 완전한 재무 숫자로 제시된다.
- P1-3 truncation이나 P1-5 partial 데이터도 같은 경로로 은폐된다.

수정 방법:

- snapshot에 `salaryBasisVersion`, `unpricedMemberCount`, `costCompleteness`를 저장한다.
- unpriced가 있으면 프로젝트별 경고와 전사 합계의 incomplete 상태를 표시한다. 정책에 따라 전체 cost masking 또는 "최소 금액/부분 집계" 표기를 선택하되 0을 완전한 값으로 제시하지 않는다.

필수 테스트:

- band 없는 구성원 1명 포함 snapshot에서 completeness가 false이고 portfolio/team 양쪽에 warning이 나타나는지 검증한다.
- 실제 0 band와 missing/invalid band를 구분하는 contract test.

### P2-2. Custom Entity `integer` 범위를 넘는 금액의 제품 계약이 없다

**판정: 실패 / 입력 경계 및 i18n 오류 처리 누락**

생산자:

- `manifest.yml:194-209` — `salaryMin`, `salaryMax`, `salaryRepresentative`를 `integer`로 선언한다.
- `src/resolver/projectCost/SalaryPolicy.js:45-48` — finite number를 반올림할 뿐 저장소 정수 범위를 검증하지 않는다.
- `src/resolver/backoffice/level/LevelService.js:20-42` — 상한 오류를 domain error로 변환하지 않는다.

공식 근거:

- Forge Custom Entity의 `integer`는 32-bit signed integer다: [Custom Entity manifest reference](https://developer.atlassian.com/platform/forge/storage-reference/entities-manifest/).

재현:

1. 대표값에 `2147483648`을 입력한다.
2. client/server validation은 통과한다.
3. Custom Entity 저장이 semantic error로 실패하며 사용자에게 급여 band domain 오류 대신 일반 실패 toast가 표시된다.

영향:

- 통화 단위가 작거나 고액 보상인 installation에서 유효한 업무 값이 저장되지 않는다.
- 제품이 지원하는 금액 범위를 문서·검증·번역 어디에서도 알 수 없다.

수정 방법:

- 요구 범위가 32-bit를 넘을 수 있으면 string 기반 정수/decimal 표현 또는 SQL `DECIMAL` 원천을 사용한다. 금액에 `float`를 쓰는 것은 반올림 오차 때문에 피한다.
- 32-bit로 제한할 결정이면 backend와 frontend에 동일한 min/max 검증, 구체적 i18n 오류, 제품 문서를 추가한다.

필수 테스트:

- `2147483647` 성공, `2147483648`과 `-1` domain error.
- 경계 오류가 일반 toast가 아니라 전용 번역 메시지로 표시되는지 검증한다.

### P3-1. SETTINGS read-only 사용자에게 정책 변경 UI가 활성화된다

**판정: 실패 / 권한 UI mirror 누락**

생산자:

- `src/permission/PermissionMap.js:173-175` — 조회는 `PUBLIC`, 저장은 `SETTINGS write`가 필요하다.

소비자:

- `static/ui/src/components/dropdown/BackofficeDropdown.jsx:34-46` — `SETTINGS read` 사용자가 설정 화면에 진입할 수 있다.
- `static/ui/src/backoffice/page/setting/SettingPage.jsx:39-43` — SalaryPolicySetting을 항상 렌더한다.
- `static/ui/src/backoffice/page/setting/SalaryPolicySetting.jsx:145-177,236-257` — `canWrite('SETTINGS')` 확인 없이 option과 Save/Confirm을 활성화한다.

재현:

1. `SETTINGS read`만 가진 사용자로 설정 화면을 연다.
2. 정책을 선택하고 저장한다.
3. UI는 변경 가능한 것처럼 동작하다가 backend에서 permission error를 일반 실패 toast로 표시한다.

영향:

- 보안 우회는 아니지만 permission store와 UI 동작이 어긋나고, 정책 변경 실패 원인을 잘못 안내한다.

수정 방법 및 테스트:

- `usePermissionStore.canWrite('SETTINGS')`로 option/Save를 disable 또는 read-only 표시하고, backend 거부는 permission-specific 안내로 처리한다.
- read-only/write 사용자 각각의 렌더·click contract test를 추가한다.

## 3. 통과한 경계

아래 항목은 양쪽 코드를 교차 비교하고 통과로 판정했다. 위 실패를 상쇄하지는 않는다.

- **resolver 등록/이름:** RFC-163이 확장한 `getSettingData`, `updateSetting`, user/project salary/summary/chart/portfolio 호출 이름과 `PermissionMap` 등록 집합은 일치한다. permission contract test도 통과했다.
- **응답 unwrap:** `updateSetting`의 `{content:{settings}}`를 `SalaryPolicySetting.jsx:102-103`에서 정확히 소비하고, `getSettingData`의 root 병합 응답도 `SettingPage.jsx:16-25`와 `useSalaryPolicy.js:53-62`가 맞게 소비한다.
- **LEVEL_BAND 새 응답의 서버-side raw field 제거:** 새 호출에 대해서 user 목록/상세/Excel, project salary rows, salary chart, portfolio cost fields를 제거하는 whitelist/gate가 구현되어 있고 `SalaryPolicyLeak.test.js` 등은 통과했다. P0-2는 새 호출이 아니라 이미 cache된 응답의 revocation 결함이다.
- **SQL bind shape:** `PortfolioSnapshotQuery.UPSERT`의 22 columns/22 placeholders와 `PortfolioSnapshotRepository`의 22 params가 정합하다. `salary_policy`는 `SELECT_ALL`에도 포함된다.
- **snapshot index:** read가 전 행 scan 후 `risk_score` 정렬이며 policy로 filter하지 않으므로 `salary_policy` 신규 index를 추가하지 않은 결정은 적절하다.
- **성능 기본 패턴:** portfolio aggregation은 `loadSalaryPolicyContext`를 배치당 1회만 호출하고 `p-limit`으로 프로젝트 동시성을 제한한다. 공통 worklog fetch 경로를 policy 전용 다건 조회로 오염시키지 않았다.
- **query key factory:** 추가된 frontend cache key는 factory를 사용하며 inline invalidation array 계약 테스트가 통과했다.
- **i18n 정적 계약:** RFC-163 UI의 `t()` key는 kr/en source locale에 존재하고 locale 관련 frontend tests가 통과했다. ko-KR/en-US 직접 수정 여부는 현재 다른 dirty locale 변경과 겹쳐 commit diff 기준으로 확인했다.

## 4. 실행 검증

### 통과

- backend: root `npm test -- --runInBand`
  - **65 suites, 1057 tests 모두 통과**
  - 약 58.6초
- frontend: `static/ui`에서 `npm test -- --runInBand`
  - **64 suites, 1074 tests, snapshot 1개 모두 통과**
  - 약 52.8초
  - 현재 미커밋 `salaryBandInvalidation.test.js`도 포함된 결과다.

### 미검증

- frontend `npm run build`
  - 124초 실행 제한에서 timeout되어 성공/실패 어느 쪽으로도 판정하지 않았다.
- 실제 Forge installation의 migration v014→v015 순서, upgrade event 지연/실패 복구.
- 실제 Custom Entity write 직후 query의 stale 지속 시간과 101개 이상 cursor E2E.
- 다중 사용자/다중 브라우저 정책 전환 전파.
- `forge lint` 및 development tenant deploy E2E는 이번 read-only 리뷰에서 실행하지 않았다.

테스트 전체 통과가 운영 결함을 부정하지 않는 이유는 현재 test doubles가 Custom Entity query를 즉시 consistent하게 반환하고, 한 QueryClient/한 policy 상태만 검사하며, 100개 초과·migration 선후관계·active cache revocation을 모델링하지 않기 때문이다.

## 5. 수정 우선순위

1. **즉시 배포 차단:** P0-1 `getSummaryData`에 `PROJECT_COST` 보조 gate 추가, P0-2 client 표시 조건을 current policy와 response policy의 fail-closed 교집합으로 변경한다.
2. **재무 basis 단일화:** strict-consistent band 조회 + `salaryBasisVersion`을 ProjectCost cache와 portfolio snapshot에 관통시킨다.
3. **catalog/입력 무결성:** 100건 pagination, partial band 거부, project-wide unpriced count를 구현한다.
4. **배포 호환성:** v015 two-phase migration/readiness path를 정하고 upgrade E2E를 통과시킨다.
5. **관측/UX:** portfolio completeness, integer 상한, SETTINGS read-only UI를 보완한다.

P0와 P1 수정 후에는 기존 `03_verify_report.md`를 덮어 믿지 말고 위 재현 시나리오를 포함해 통합 검증을 다시 수행해야 한다.
