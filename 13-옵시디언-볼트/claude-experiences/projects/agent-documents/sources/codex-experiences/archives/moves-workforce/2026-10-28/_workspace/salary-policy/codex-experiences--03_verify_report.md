# 급여 정책 (Salary Policy) — 통합 검증 리포트 · **RFC-163 Phase C**

작성: integration-verifier / 2026-08-03
검증 대상: `C:\CloudJira\moves-workforce-rfc-163` (worktree, 브랜치 `RFC-163`, base `ea5ef4a`)
기준: `01_architect_design.md` (r3) §6-4 계약 불변식 · §11 Phase C 10항
입력: `02_backend_report.md` §2/§3 · `02_frontend_report.md` §3/§6

> **코드는 한 줄도 수정하지 않았다.** 아래 실패 항목은 리더가 담당 에이전트에 재지시할 입력이다.

---

## 0. 결론 요약

| 분류 | 건수 | 비고 |
|---|---|---|
| **통과** | 계약 불변식 7항 전부 + 다중 shape 4지점 + 내부 소비자 + `?? 0` + i18n + 테스트/빌드 | 아래 §1 |
| **실패** | **3건** (미구현 1 · 성능/계약 불일치 1 · 잡음 1). **누출 결함 0건** | §2 |
| **주의(기록만)** | 3건 — 문서 불일치·과잉 마스킹·저빈도 추가 조회 | §3 |
| **미검증** | 배포 후 실기기 확인 6항 | §4 |

**이 RFC 의 핵심 질문 2개에 대한 답:**
- **"안 새는가"** → **샌다는 증거 없음.** LEVEL_BAND 응답 11지점(#1~#11) 전부 키 제거/거부가 코드와 테스트 양쪽으로 확인됨. 신규 노출 경로 0건.
- **"기존 숫자가 안 바뀌었는가"** → **안 바뀐다.** `EffectiveSalary.test.js` 무수정(`git status` 클린) + INDIVIDUAL 5줄 물리적 무수정(`git diff` 확인) + 백엔드 994 tests 전부 통과.

---

## 1. 통과

### 1-1. §6-4 계약 불변식 7항 — 전부 통과

| # | 불변식 | 검증 방법 | 결과 |
|---|---|---|---|
| 1 | `getSettingData.salaryPolicy` 항상 존재 | `SettingDefaults.js` + `SettingService.js:13` `{...DEFAULT_SETTINGS, ...saved}` 병합 | ✅ |
| 2 | INDIVIDUAL 응답 무변경(순수 추가 필드 제외) | `SalaryPolicyLeak.test.js:391-458` 양방향 단언(9 케이스) + `npm test` 994 통과 | ✅ |
| 3 | LEVEL_BAND `JSON.stringify` 에 `salary` 없음 (#1~#11) | `SalaryPolicyLeak.test.js`(#1·#2·#3·#4·#6·#7·#8·#9·#10) + `SalaryChartGate.test.js:96-135`(#11) + `§5-4` 계약테스트(#5) → **11지점 전수 커버**. 백엔드 리포트는 "8지점"이라 적었으나 **실측 11지점**이다(더 많다) | ✅ |
| 4 | `computeEffectiveSalary({projectMonths})` 만으로 기존값 | `git diff` 로 INDIVIDUAL 5줄(`EffectiveSalary.js:66-71`) 물리적 무수정 확인. 기본 인자 `policy='INDIVIDUAL'` | ✅ |
| 5 | `getLevelList` 밴드 3필드 = `number\|null` | `LevelService.js:toBandDto` `?? null` 정규화, `getLevelListService`·`findLevelByIdService` 양쪽 적용 | ✅ |
| 6 | LEVEL_BAND write 가 DB 무변경 | `updateProjectMemberSalary` 는 `updateSalaryByKeyRepository` 미호출 단언(`:356`), `updateUser` 는 salary 를 **키째 제거** → `updateUserWithSalaryRepository` 인자가 `SALARY_VALUE`(기존값) 유지 단언(`:367`) | ✅ |
| 7-A | `costMaskedReason` 루트 키 parity | `PortfolioDashboardService.js:125-128`(emptyShape) + `:313-320`(정상) 양쪽. `PortfolioCostGate.test.js` 2 케이스 | ✅ |
| 7-B | 권한 축 ⟂ 정책 축 | `PortfolioDashboardService.js:181-187` — `permissionDenied` 먼저 판정. `COST_READER` principal 로 4 케이스 검증 | ✅ |
| 7-C | 정책 주입 4지점 전부 | `grep -rn "resolveMemberSalaries\|computeEffectiveSalary" src/` **한 번에** 실행 → `ProjectCostService.js:146`(miss)·`:226`(hit) · `ProjectUsersService.js:182` · `PortfolioAggregator.js:314` **4/4 주입 확인** | ✅ |

### 1-2. ⚠ 다중 shape 재사용 컴포넌트 (`SalaryCell`) — **결함 없음**

`SalaryCell.jsx:44-70` 은 `band?.min` / `band?.max` **2필드만** 읽는다(`renderBand`, `:128-139`). `representative` 를 읽는 코드가 **0줄**임을 파일 전체 grep 으로 확인했다 → 프론트 리포트 §9-1 의 주장이 실제 코드와 일치한다.

**호출부 전수 대조 (5지점 · 생산 코드와 필드명 1:1 확인):**

| # | 호출부:라인 | props | 생산 코드 | shape | 판정 |
|---|---|---|---|---|---|
| 1 | `UserListPaging.jsx:92-96` | `amount={row.salary}` `band={row.levelBand}` `policy={data?.salaryPolicy}` | `UserService.js:140-142` | `salary:number\|null` **XOR** `levelBand:{min,max}\|null` | ✅ |
| 2 | `useLevelList.js:74` | `mode="band"` `band={{min:row.salaryMin, max:row.salaryMax}}` | `LevelService.js:toBandDto` (평평한 숫자 3개) | 호출부가 `{min,max}` 로 **감싼다** | ✅ |
| 3 | `useLevelList.js:75` | `mode="plain"` `amount={row.salaryRepresentative}` | 동일 | 순수 숫자 | ✅ |
| 4 | `SalaryManagementPage.jsx:183-187` | `mode="band"` `band={row.level_band}` | `ProjectUsersService.js:207` `toLevelBandDto(...)` | `{min,max,representative}` (**snake_case**) — 남는 `representative` 는 **읽히지 않음** | ✅ |
| 5 | `SalaryManagementPage.jsx:174/234/265/284` | `mode="plain"` `amount={row.annual_salary\|row.salary\|row.effective_salary}` | 동일 (INDIVIDUAL 전용 컬럼) | 순수 숫자 | ✅ |

**공통 / 전용 필드 분리표 (2026-07-22 교훈 형식):**

| 필드 | `levelBand`(user) | `level_band`(급여탭) | `{salaryMin,salaryMax}`(등급) | `SalaryCell` 참조 |
|---|---|---|---|---|
| `min` | O | O | O(호출부 래핑) | **읽음** |
| `max` | O | O | O(호출부 래핑) | **읽음** |
| `representative` | **X** | O | X(별도 `mode="plain"`) | **안 읽음** ← 사고 회피 |

→ `ScopeSplitCell` 유형의 "한쪽에만 있는 필드를 `?? 0` 이 삼키는" 결함은 **없다.** `isNum()`(`:75`)이 `0` 을 유효값으로 취급하고, 값이 없으면 `?? 0` 이 아니라 `MissingMark`(`-` + 경고 툴팁)를 렌더한다.

`level_band` 가 `{min:null, max:null, representative:3400}` 인 반쪽 데이터에서는 밴드 셀이 `-` 로 나오지만 유효 인건비는 3400 파생이 된다 — 다만 서버 `buildLevelBandMap`(`SalaryPolicy.js:63`)이 3필드 전부 null 인 등급만 맵에서 빼므로, 이 조합은 API 직접 편집으로만 생긴다. **실해 없음, 기록만.**

### 1-3. `?? 0` 금지 규칙 실효성 — 통과

`git diff ea5ef4a --name-only` + 신규 파일 전체에 대해 `(salary|Salary|levelBand|level_band|unpricedMemberCount)\s*(\?\?|\|\|)\s*0` 정규식 스캔:

- **신규/수정 프론트 코드에 해당 패턴 0건.**
- 히트한 8건은 **전부 기존 백엔드 계산 라인이며 무수정**임을 `git diff` 로 확인:
  `EffectiveSalary.js:66,68`(INDIVIDUAL 5줄) · `:84` · `ProjectCostService.js:57,148` · `PortfolioAggregator.js:417` · `PortfolioDashboardService.js:238` · `PortfolioSnapshotRepository.js:33`
- 명시 검사 사용 확인: `SalaryManagementPage.jsx:97` `typeof unpricedCount === 'number' && > 0` / `SummaryPanel.jsx:36` `data.total_salary !== undefined` / `SalaryCell.jsx:75` `typeof v === 'number'` / `useLevelEditModal.js:53-55` `toBandInput`(null 검사).

**§7-6(c)·(d) 무수정 요구 — 전부 지켜짐 (이것이 정답이다):**
`git diff --stat` 에 다음이 **나타나지 않는다** → `pages/portfolio/utils/costGating.js` · `utils/portfolioAggregate.js` · `widgets/PortfolioProjectTable.jsx` · `widgets/PortfolioTsrSignalTable.jsx` · `widgets/PortfolioFilterBar.jsx` · `utils/team/teamMetrics.js` · `utils/team/teamAnalyticsFields.js` · `PortfolioSalaryHistogram.jsx` · `PortfolioSalaryByProject.jsx`. **불필요한 회귀 0건.**

### 1-4. 무회귀 (INDIVIDUAL)

- `git status --porcelain src/resolver/projectCost/__test__/EffectiveSalary.test.js` → **출력 없음(무수정)**, `npm test` 에서 **PASS**.
- `computeEffectiveSalary` INDIVIDUAL 5줄 = `git diff` 상 **컨텍스트 라인**(변경 표기 없음). LEVEL_BAND 분기는 그 **앞에 추가**만 됐다.
- `resolveMemberSalaries` 의 `salarySource` 를 **LEVEL_BAND 일 때만** 붙인 것(D-1)이 이 무회귀의 필수 조건이었음을 확인 — 무조건 추가였다면 `EffectiveSalary.test.js` 의 `toEqual` 이 깨진다.

### 1-5. 누출 검증 (LEVEL_BAND) — 독립 확인

§5-3 표의 **#1~#13 + N1~N3 전수**를 코드로 재확인했다. 백엔드 리포트가 "8지점"이라 한 것과 달리 **실제 커버는 11지점**이다(더 많다):

| # | 지점 | 조치 | 커버 테스트 |
|---|---|---|---|
| 1 | `getUserListWithPaging` | `UserService.js:140-142` 키 XOR | `SalaryPolicyLeak.test.js:235,250` |
| 2 | `findUserByAccountId` | `UserService.js:344` + TEAM_LEAD 마스킹이 **존재하는 키만** 건드림(`:356-358`) | `:260,271` |
| 3 | `getUserInfo` | **Controller** `UserController.js:66-70` (서비스 무변경) | `:279` |
| 4 | `downloadExcel` | 컬럼 자체 제외 (`UserService.js:692,711`) | `:290`(엑셀 헤더 되읽기) |
| 5 | 엑셀 업로드 | 무변경 | `:476-484`(소스 정적 계약) |
| 6 | `getProjectSalaryList` | **명시 화이트리스트** 조립(`ProjectUsersService.js:200-209`) — `...row` 아님 | `:299,315` |
| 7 | `updateProjectMemberSalary` | `ProjectUsersService.js:237-245` 거부 | `:351` |
| 8 | `updateUser` | Controller 에서 **키째 제거**(null 아님) | `:359,370` |
| 9 | `addUser` | `UserService.js:399` 미저장 | `:376` |
| 10 | `getSummaryData` | `ProjectDashboardService.js:55,67` 조건부 키 | `:331,341` |
| 11 | salary 차트 | `ProjectDashboardService.js:196` denied + repo **미호출** | `SalaryChartGate.test.js:96-135` |
| 12·13·N1 | 포트폴리오/비용/`salaryBuckets` | 의도적 제외(§5-3) — A안 마스킹으로만 사라짐 | `PortfolioCostGate.test.js:179-280` |
| N2 | 스냅샷 write `total_salary` | 정책 주입으로 자동 대표값 파생 | `PortfolioAggregatorSalaryPolicy.test.js:95` (`9600`·`5000` 문자열 미포함 단언) |
| N3 | `MEMBER_ROWS` 원시 조회 | 쿼리 무변경, LEVEL_BAND 가 읽지 않음 | 코드 |

**빠진 노출 경로 탐색 결과: 0건.** `src/` 전역에서 `total_salary` / `salary` 를 응답에 싣는 지점을 재grep 했고, RFC-172~176 이후 추가된 `teamAnalytics`·`ProjectTeamQuery` 계열은 여전히 salary 를 싣지 않는다(§0-5-A 재확인).

**fail-close 방향 확인:** 표시 경로 실패 → `LEVEL_BAND`(숨김) 폴백 (`SalaryPolicyLeak.test.js:464-473`), 계산 경로(`loadSalaryPolicyContext`)는 try/catch 없음 → 예외 전파. **설계 §5-1 대로.**

### 1-6. 서비스 내부 소비자 점검

| 함수 | 내부 호출 지점 (전역 grep) | 판정 |
|---|---|---|
| `getUserInfoService` | `PrincipalResolver.js:209, :235` | ✅ **서비스 무변경** — 게이팅은 `UserController.js:66-70`. 권한 판정 경로에 KVS 왕복 **추가 0**. 성능 사고 없음 |
| `resolveMemberSalaries` + `computeEffectiveSalary` | 4/4 (§1-1 7-C) | ✅ |
| `getSummaryDataService` | `ProjectCostService.js:114` · `ProjectUsersService.js:170` · **`ProjectProgressService.js:70`** | ⚠ **소비는 안전**(3곳 모두 `start_date`/`end_date`/`total_member_count` 만 읽음 — 코드 확인) 하지만 **호출자가 2곳이 아니라 3곳**이다 → §2 F2 |

### 1-7. 성능

| 항목 | 요구 | 실측 | 판정 |
|---|---|---|---|
| `PortfolioAggregator` KVS 조회가 프로젝트 수에 비례하지 않음 | 배치당 1회 | `aggregateAllProjects` `:517` 에서 1회 조립 → `aggregateOneProject(..., policyCtx)` 로 전달. `PortfolioAggregatorSalaryPolicy.test.js:116-126` 이 **프로젝트 5개 → `getLevelList` 1회 / `getSettingData` 1회** 를 단언 | ✅ |
| INDIVIDUAL 에서 `getLevelList` 미호출 | 필수 | `SalaryPolicyContext.js:26-28` early return. 테스트 `:128-136` `not.toHaveBeenCalled()` | ✅ |
| `getUserListWithPaging` 밴드 맵 | `roleLevelMap()` 의 `levelMap` 재사용 | `UserService.js:110` `buildLevelBandMap([...levelMap.values()])` — `levelMap` 은 `getLevelListService` 원본 객체 Map 이라 밴드 3필드가 실려 있음(확인) → **+0** | ✅ |
| `findUserByAccountId` `getLevelList` | LEVEL_BAND 일 때만 | `UserService.js:316-321` | ✅ |
| 대시보드 차트 | salary 위젯 있을 때만 루프 밖 1회 | `ProjectDashboardService.js:111-114` | ✅ |
| `ProjectCostService` 캐시 miss `getSettingData` **중복 없음** | 리포트 §4-4 "+0" | ❌ **중복 1회 있음** → §2 F2 |

### 1-8. 프론트가 내린 판단 3건 — **3건 모두 동의**

**① `salaryRenderGuard.test.js` 금지 패턴 축소 — 동의 (조건부)**
- *오탐이 실재하는가?* **그렇다, 실측 확인.** `UserEditModal.jsx:225` 가 `editValues.salary` 를 `<SalaryField>` 에 넘긴다(의도한 깔때기). `SalaryManagementPage.jsx:252,254` 가 `row.salary` 를 InlineEdit `defaultValue`/변경 비교로 읽는다(렌더 아님). 초안 패턴 `/\brow\.salary\b/`·`/\beditValues\.salary\b/` 였다면 **정상 경로 2곳이 위반**이 되어 `teamScopeLeak.test.js:211-215` 가 기록한 실패를 반복한다.
- *좁힌 뒤에도 실제 사고를 잡는가?* **잡는다.** 이번 변경 전 `UserListPaging` 의 `row.salary ? formatNumber(row.salary) : '-'` 는 패턴 ①(`formatNumber\(...salary...\)`)에 걸린다. `?? 0`/`|| 0` 도 9개 필드명으로 넓게 잡는다. 게다가 **양성 단언**("세 영역이 `components/salary` 를 실제로 import 한다", `:121-131`)과 **대상 0건 방어**(`:90-101`, 파일명 5종 명시)까지 있어 원본 관례보다 오히려 강하다. **무력화되지 않았다.**
- **잔여 갭(권고, 차단 아님):** `formatNumber` 없이 `{row.salary}` 로 JSX 보간하거나, `const rawValue = fieldProps.value; formatNumber(rawValue)` 처럼 변수명을 바꾸면 우회된다(실제로 `SalaryManagementPage.jsx:238-239` 가 그 형태 — 용도는 정당하다). 추후 `TARGET_DIRS` 파일에서 "`<SalaryCell`/`<SalaryField` 없이 `salary` 를 JSX 보간" 패턴을 추가하면 갭이 닫힌다.

**② LEVEL_BAND 에서 `updateUser` 에 `salary` 키 미전송 — 동의**
- *오발동이 실재하는가?* **그렇다.** `useUserEditModal.js:225` 가 `notifyDroppedFields(toast, t, res)` 를 무조건 호출한다. 서버는 `salary` 를 실제로 받았을 때만 `droppedFields:['salary']` 를 싣는데(`UserController.js:44-46`), 프론트가 보냈다면 **사용자가 입력한 적도 없는 필드로 에러 토스트**가 뜬다. 거짓 경보가 맞다.
- *서버 경로가 죽은 코드가 되는가?* **아니다.** (a) `SalaryPolicyLeak.test.js:359-368` 이 그 경로를 직접 커버하고, (b) 정책이 아직 미확정(`useSalaryPolicy` 로딩)일 때 프론트가 여전히 보낼 수 있으며, (c) 구버전 프론트/다른 클라이언트 방어가 남는다. 심층 방어로 유효하다.

**③ `PortfolioTsrSignalTable` 에 `costMaskedReason` 미전달 — 동의**
- *그 컴포넌트가 문구를 렌더하는가?* **안 한다, 실측.** `PortfolioTsrSignalTable.jsx` 전체에서 `portfolio.cost.masked` 참조 0건. `costMasked` 는 `signalTableColumnKeys(costMasked)`(`:96`)와 정렬 가중 `signalLevelsForSort(sig, costMasked)`(`:57-58`)에만 쓰인다 = **컬럼/정렬 제거 전용**. 소비처 없는 prop 을 넘기지 않은 판단이 맞다.

### 1-9. i18n

- **kr/en 파일 쌍 키 parity: 완전 일치** (스크립트 대조 — `cost/level/portfolio/salary/setting/teamAnalytics/user` 7파일, kr-only 0 / en-only 0).
- **merge 반영 확인:** 위 7파일의 전 키가 `locales/ko-KR.json`·`locales/en-US.json` 양쪽에 존재(미반영 0건). `locales/script/*.json` 미사용, `ko-KR.json`/`en-US.json` 직접 수정 없음(merge 산출물).
- **코드의 `t()` 키 실존:** 변경/신규 프론트 파일 31개에서 `t('...')`·`tFormat(t,'...')` 리터럴을 전수 추출해 merge 산출물과 대조 → **누락 0건**(테스트 픽스처의 `'a.b.c'`·`'...'` 더미 2건 제외).
- 설계서 §9 키 + B15 키(`portfolio.cost.staleSnapshot`, `teamAnalytics.costMaskedStale`) 전부 존재. 기존 `portfolio.cost.masked`·`teamAnalytics.costMasked` 는 무변경.

### 1-10. 테스트 · 빌드 (검증자 재실행)

| 커맨드 | 결과 | 리포트와 일치 |
|---|---|---|
| `npm test` (루트) | **62 suites / 994 tests 전부 통과, 실패 0** | ✅ |
| `cd static/ui && CI=true npm test` (`jest.config.js`) | **62 suites / 1061 tests 전부 통과, 실패 0** | ✅ |
| `cd static/ui && CI=true npx react-scripts test --watchAll=false` | **1 suite 실패 / 59 통과, 1036 tests 전부 통과** | ✅ |
| `cd static/ui && npm run build` | **성공**(exit 0, prebuild merge 포함, artifacts 재생성) | ✅ |

**⚠ 두 러너 차이 — 프론트 리포트의 지적이 정확하다. 재확인 결과:**

| | `npm test` | `npx react-scripts test` |
|---|---|---|
| 설정 | `static/ui/jest.config.js` (`moduleNameMapper: '^@forge/bridge$'`) | CRA 내장 jest (**매핑 없음**) |
| 수집 suites | 62 | 60 |
| 결과 | 62 pass / 1061 tests | **1 fail** (`src/pages/projectDetail/issue/workListQuery.test.js`) / 59 pass / 1036 tests |

실패한 1 suite 는 **import 시점에 `@forge/bridge` 가 없어 모듈 로드 자체가 throw** 하는 것으로, **baseline 과 동일**하며 이번 변경과 무관하다(테스트 케이스는 0건 실패 — 1036 tests 전부 통과). **baseline 대비 신규 실패 0건.**
→ 러너 선택으로 결과가 달라지는 것 자체가 별건 정리 대상이다(`react-scripts test` 쪽에 bridge mock 매핑 부재). 기록만.

---

## 2. 실패

### F1. `getProjectCostSummary` 의 `unpricedMemberCount`·`salaryPolicy` 소비처가 **0건** — 비용 탭 경고 미구현 · **[frontend]**

**증상:** 서버는 `getProjectCostSummary` 응답에 `unpricedMemberCount`(`ProjectCostService.js:197`, 캐시 hit 경로는 `:244`)와 `salaryPolicy`(`:196`, `:243`)를 항상 싣는다. i18n 키도 kr/en + merge 산출물까지 전부 들어가 있다(`locales/kr|en/cost.json` — `warn.unpriced`, `warn.unpricedIndividual`, `salaryPolicy.levelBand/individual/basis`). **그런데 프론트에서 이 필드도, 이 키도 참조하는 코드가 한 줄도 없다.**

```
$ grep -rn "cost\.warn\.unpriced\|cost\.salaryPolicy" static/ui/src   → (none)
$ grep -rn "unpricedMemberCount" static/ui/src
  → SalaryManagementPage.jsx (급여 관리 탭) 과 salaryRenderGuard 정규식뿐
```

**설계서 근거:** §4-5 "서버가 `unpricedMemberCount` 를 응답에 순수 추가한다 … `getProjectCostSummary` → root `unpricedMemberCount` … 프론트: 값 > 0 이면 상단 `SectionMessage(appearance="warning")` — **`cost.warn.unpriced`**". §9-6 이 그 키를 정의했고 B9 가 `cost` i18n 을 작업 대상에 넣었다.
**근본 원인:** §11 Phase B 표에 **비용 탭 경고 작업 항목이 없다**(설계서 자체의 누락). 프론트는 §11 을 따랐으므로 지시 위반은 아니다.

**영향(경미하지 않음):** LEVEL_BAND 에서 급여 밴드가 없는 등급의 인원은 인건비가 **0으로 계산**된다. 급여 관리 탭에는 경고가 뜨지만 **비용 분석 탭에는 아무 표시가 없어**, 총 인건비·CPI·예산 소진율이 조용히 낮게 나온다. 이 RFC 가 §4-5 에서 명시적으로 막으려던 실패 모드다.

**수정 방법 (frontend):**
`static/ui/src/pages/projectDetail/cost/CostPage.jsx` 상단(`hasNoPeriod` 계열 경고와 같은 자리)에 추가:
```jsx
// 🔴 `?? 0` 금지 — 레거시 캐시(배포 후 최대 10분)는 이 값이 null 이다(02_backend_report §3 D-3)
const unpriced = data?.unpricedMemberCount;
const showUnpriced = typeof unpriced === 'number' && unpriced > 0;
const isBand = data?.salaryPolicy === 'LEVEL_BAND';
...
{showUnpriced && (
    <SectionMessage appearance="warning">
        {tFormat(t, isBand ? 'cost.warn.unpriced' : 'cost.warn.unpricedIndividual', { count: unpriced })}
    </SectionMessage>
)}
```
`cost.salaryPolicy.basis`/`.levelBand`/`.individual` 은 (선택) 산식 InfoTip 에 "인건비 산정 기준: 등급 기반/인원별" 로 붙이거나, 쓰지 않는다면 **키를 제거**해 죽은 키를 남기지 않는다.

---

### F2. `getSummaryDataService` 가 매 호출 `getSettingData` 를 추가로 읽는다 — **"+0" 성능 계약 3곳 위반**, 내부 소비자 1곳 누락 · **[backend]**

**증상:** `ProjectDashboardService.js:43` 이 `getSummaryDataService` 안에서 `resolveSalaryPolicySafe()` → `getSettingDataService()` 를 호출한다. `getSettingDataService`(`SettingService.js:9-14`)는 **메모이즈가 없는 KVS 단건 read** 다. 그 결과 이 서비스를 내부 호출하는 3경로에서 **`getSettingData` 가 중복으로 읽힌다**:

| 경로 | 이미 읽는 지점 | `getSummaryDataService` 로 인한 추가 | 리포트 주장 | 실측 |
|---|---|---|---|---|
| `ProjectCostService` 캐시 miss | `:105` `getSettingDataService()` (→ `:110` 재사용) | `:114` 에서 **+1** | §4-4 "**+0**" | **+1** ❌ |
| `ProjectUsersService.getProjectSalaryList` | `:172` `loadSalaryPolicyContext()` | `:170` 에서 **+1** | "+1~2" | **+2~3** ❌ |
| **`ProjectProgressService`** (진척도) | `:53` `getSettingDataService()` | `:70` 에서 **+1** | **호출자 목록에 아예 없음** | **+1 (전량 낭비)** ❌ |

**왜 문제인가:**
1. 백엔드 리포트 §4-4 의 성능 계약 표가 **사실과 다르다.** "캐시 miss +0" 은 성립하지 않는다.
2. **`ProjectProgressService.js:70` 은 설계서 §11 Phase C 3항과 백엔드 리포트 양쪽이 놓친 3번째 내부 소비자**다(둘 다 "ProjectCostService·ProjectUsersService 2곳"이라고 적었다). 진척도 페이지는 `total_salary` 를 **전혀 쓰지 않는데** 정책 조회 KVS 왕복이 새로 생겼다 — 100% 낭비다. (CLAUDE.md 2026-07-13 교훈이 지목한 바로 그 사각지대.)

**기능 결함은 아니다:** 3경로 모두 `start_date`/`end_date`/`total_member_count` 만 읽는 것을 코드로 확인했고(`ProjectProgressService.js:80-82` 포함), 세 호출 모두 `Promise.all` 안이라 지연 증가는 사실상 0 이다. **정정 대상은 "계약과 낭비"이지 동작이 아니다.**

**수정 방법 (backend, 택1):**
- **(권장) 게이팅을 Controller 로 올린다** — `ProjectDashboardController.js:11` 의 `getSummaryData` 정의부에서 `canShowIndividualSalary(await resolveSalaryPolicySafe())` 를 판정해 `total_salary` 키를 제거하고, `getSummaryDataService` 는 **무변경**으로 되돌린다. `getUserInfo`(`UserController.js:66`)·`updateUser`(`:41`)에 이미 쓴 선례와 **일관**되고, 내부 소비자 3곳 전부가 자동으로 +0 이 된다.
- (대안) `getSummaryDataService({project_id, salaryPolicy})` 옵션 인자를 추가해 정책을 이미 가진 호출자가 주입 → 3곳 수정 필요.

어느 쪽이든 **백엔드 리포트 §4-4 표와 §2-3 `getSummaryData` 항목의 "내부 소비자 확인 완료" 문구를 3곳으로 정정**할 것.

---

### F3. `package-lock.json` 에 기능 무관한 변경 24+/24- · **[backend 또는 frontend]**

`git diff ea5ef4a --stat -- package-lock.json` → 24 insertions / 24 deletions. 내용은 전부 `"peer": true` 플래그의 위치 이동이며 **패키지 버전 변경은 0건**(`@babel/*`, `@testing-library/*` 등). npm install 부산물이다.
**수정:** 커밋 전에 `git checkout ea5ef4a -- package-lock.json` 으로 되돌려 RFC 커밋의 diff 를 깨끗하게 유지할 것. (동작 영향 없음)

---

## 3. 주의 (기록만 — 조치 불필요)

**N1. 누출 불변식 #3 의 예외가 설계서보다 1개 많다 (정당함, 미기록):**
`SalaryPolicyLeak.test.js:42` 의 `ALLOWED_POLICY_KEY_NAMES = ['salaryPolicy', 'effective_salary']`. 설계서 §6-4 #3 은 `salaryPolicy` **하나만** 예외로 적었으나, §6-3 계약이 LEVEL_BAND `rows[].effective_salary` 를 **요구**하므로 이 키 이름은 물리적으로 제외할 수밖에 없다(값은 등급 대표값 파생이라 개인 금액이 아니다). 예외를 넣고도 값 누출은 `findForbiddenKeys` + 원본 숫자 대조(`:304-305`)가 별도로 막는다. → **정당한 불가피 예외.** 다만 백엔드 리포트 §3 "설계와 다르게 구현한 5건"에 이 6번째가 기재되지 않았다. 리포트 보정 권고.

**N2. 스냅샷 정책 대조가 스코프 필터 전 전체 rows 로 계산된다:**
`PortfolioDashboardService.js:181` `(rows ?? []).some(...)` 는 `scopedSet`(MEMBER_ONLY 축소) 적용 **전**의 전체 스냅샷을 본다. 소속 외 프로젝트 하나만 stale 이어도 마스킹된다 = **과잉 마스킹**. fail-close 방향이므로 안전하고, A안이 이미 "과잉 차단"을 수용한 대가(§4-7-1)와 같은 성격이다. 기록만.

**N3. `emptyShape` 경로의 `getSettingData` 1회 추가:**
`PortfolioDashboardService.js:148` — 스냅샷이 아직 없는 설치에서만 타는 저빈도 경로. 문제 없음.

**N4. `AddChartModal` 의 `useSalaryPolicy()` 는 `settingKeys.detail()` 를 쓰는데, 프로젝트 대시보드의 다른 소비처들은 인라인 `['getSettingData']` 키를 쓴다**(설계서 §0-5 가 기록한 캐시 분열, B11=P2 범위 밖). 이 화면에서 `getSettingData` invoke 가 1회 더 나갈 수 있다. **범위 밖, 별건 백로그.**

---

## 4. 미검증 (배포 후 실기기 확인 필요)

정적 검증·단위 테스트로는 원리적으로 확인할 수 없는 항목이다. **추측으로 통과 처리하지 않는다.**

1. **`manifest.yml` attribute 반영** — `level.salaryMin/Max/Representative`, `settings.salaryPolicy`. `forge deploy` **1회 선행 없이는 밴드 저장이 KVS 422 semantic error** 다. `forge tunnel` 은 스키마를 갱신하지 않는다.
2. **마이그레이션 `v015_alter_portfolio_snapshot_add_salary_policy`** 실제 실행 — 멱등 `ADD COLUMN IF NOT EXISTS` 이고 실테이블명 `portfolio_project_snapshot` 임을 코드로는 확인했으나, TiDB 에서의 실행 성공은 배포 후 확인.
3. **Phase C 4항 — LEVEL_BAND 재집계 후 팀 분석 실물** (`TeamKpiRow`/`TeamRollupTable`/`TeamCompareBar` 의 인건비가 대표값 파생인가). 스냅샷 write 값이 대표값 파생임은 `PortfolioAggregatorSalaryPolicy.test.js:95-112` 로 검증했으나(개인 연봉 `9600`·투입급여 `5000` 문자열 미포함 단언 포함), **렌더 실물은 미검증**. 프론트 코드 변경이 0건인 영역이라 A10 이 잘못되면 여기서만 드러난다.
4. **Phase C 6항 — A안 마스킹 실물**: 정책 전환 후 **재집계 전** 포트폴리오/팀 분석에서 ① 비용축이 비고 ② `SNAPSHOT_STALE_POLICY` 문구 + 재집계 CTA 가 뜨고 ③ **₩0 이 어디에도 안 그려지는지**. (③ 은 `costGating.js` 실측 근거로 설계 §7-6(c) 가 지점별 증명을 남겼고 그 파일이 무수정임을 확인했으나, 실물 확인은 별개다.)
5. **`unpricedMemberCount === null` 레거시 캐시 구간**(배포 직후 최대 10분)에서 급여 관리 탭 경고가 **뜨지 않는지**. 코드상 `typeof === 'number' && > 0` 이라 안전하나 실측 미수행.
6. **정책 전환 다이얼로그 → 저장 → 6개 캐시 invalidate 후 화면 갱신.** 쿼리키 prefix 정합성은 정적으로 확인했다(`projectKeys.salaryAll()==['projectSalary']` ↔ `salary(id,page)==['projectSalary',id,page]`, `summaryAll()==['getSummaryData']` ↔ `summary(id)==['getSummaryData',id]` — **일치**). 실제 리렌더는 미검증.

---

## 5. 리더 조치 요약

| 항목 | 담당 | 우선 |
|---|---|---|
| **F1** 비용 탭 `unpricedMemberCount` 경고 구현(또는 죽은 i18n 키 제거) | **frontend** | **P1** — 조용한 저평가를 막는 항목 |
| **F2** `getSummaryData` 게이팅을 Controller 로 이동 + 리포트 §4-4 정정(내부 소비자 3곳) | **backend** | P2 — 동작 정상, 계약/낭비 정정 |
| **F3** `package-lock.json` 되돌리기 | 아무나 | P3 |
| N1 백엔드 리포트에 `effective_salary` 예외 1건 추가 기재 | backend | P3 |
| §4 미검증 6항 | 배포 후 E2E | — |

**누출·무회귀 관점에서 차단 사유는 없다.** F1 만 사용자 노출 영향이 있고, 나머지는 문서/위생 항목이다.

---
---

# 재검증 (F1·F2 수정 후) — 2026-08-03

범위: **수정분만.** §1 에서 이미 통과한 항목은 재검증하지 않았다(단 테스트·빌드는 전량 재실행).
검증 시점 델타: `ProjectDashboardController.js`(신규 수정) · `ProjectDashboardService.js` · `CostPage.jsx`(신규 수정) · `SalaryPolicyLeak.test.js` · `salaryRenderGuard.test.js`.

## R0. 결론

| | |
|---|---|
| **잔존 실패** | **없음** |
| **통과** | F2 수정 5항 · F1 수정 4항 · P2 가드 · 교차확인 · 테스트/빌드 |
| **미검증** | §4 기존 6항 유효 + CostPage 실물 렌더 1항 추가 |

---

## R1. F2 수정 (backend) — **통과**

### R1-1. `getSummaryDataService` 무변경 복원 ✅

`git diff ea5ef4a -- ProjectDashboardService.js` 상 **함수 본문에 `+`/`-` 라인이 0개**다. 추가된 것은 함수 **위의 주석 블록**(`:31-42`)뿐이고, r1 에 있던 `const includeTotalSalary = ...` 와 두 곳의 `...(includeTotalSalary && {total_salary: ...})` 는 **전부 사라졌다** → `total_salary` 는 두 return 경로(정상 `:67`, rows 0건 `:55`) 모두에서 **무조건 포함**된다.

**내부 소비자 3곳 KVS 왕복 소멸 확인** — `grep -rn "resolveSalaryPolicySafe" src/` 결과 `ProjectDashboardService.js` 내 호출은 `:91`·`:119`(**차트 경로 전용**)뿐이고 `getSummaryDataService`(`:44`) 안에는 **없다**:

| 소비자 | 이전(r1) | 현재 |
|---|---|---|
| `ProjectCostService.js:114` (캐시 miss) | +1 중복 (`:105` 가 이미 읽음) | **+0** ✅ |
| `ProjectUsersService.js:170` | +1 중복 (`:172` 가 이미 읽음) | **+0** ✅ |
| `ProjectProgressService.js:70` (진척도) | +1 전량 낭비 | **+0** ✅ |

→ F2 가 지적한 성능 계약 위반 3건 **전부 해소.** 이제 백엔드 리포트 §4-4 의 "캐시 miss +0" 이 **사실**이 됐다.
서비스 파일에 "**이 서비스는 정책을 읽지 않는다. 절대 넣지 마라**" + 소비자 3곳 파일:라인을 명시한 주석(`:31-42`)이 남아 있어 다음 사람이 같은 실수를 반복할 확률이 낮다.

### R1-2. LEVEL_BAND `total_salary` 키 제거 동작 유지 ✅ (정책 변화 없음)

`ProjectDashboardController.js:28-31`:
```js
const res = await getSummaryDataService(payload);
if (canShowIndividualSalary(await resolveSalaryPolicySafe())) return res;
const {total_salary, ...rest} = res ?? {};
return rest;
```
- LEVEL_BAND → 키 제거 ✅ / INDIVIDUAL → **원본 객체 그대로 반환**(변형 0) ✅
- **rows 0건 경로도 동일하게 제거된다** — 서비스가 `total_salary: 0` 을 실어도 Controller 가 뗀다(r1 과 동일한 결과). 테스트 `:345-350` 이 이를 단언.
- fail-close 유지: `resolveSalaryPolicySafe` 는 조회 실패 시 `LEVEL_BAND`(=숨김) 폴백.
- `res ?? {}` 방어로 null 입력에도 throw 하지 않음.
- **게이팅 위치만 이동했고 정책 판정 로직은 한 글자도 바뀌지 않았다.**

### R1-3. 기존 단언 강도 — **약화 없음** ✅

#10 3건이 `getSummaryDataService(...)` 직접 호출 → `registered.get('getSummaryData')` 핸들러 호출로 옮겨졌다. **단언은 글자 그대로 동일하다:**

| 테스트:라인 | 단언 | 이전 대비 |
|---|---|---|
| `:334-343` LEVEL_BAND | `not.toHaveProperty('total_salary')` + `findForbiddenKeys(res) === []` + `not.toContain(SALARY_VALUE)` + 과잉삭제 방어 `toMatchObject({start_date,end_date,total_member_count})` | **동일(4개 전부 유지)** |
| `:345-350` rows 0건 | `not.toHaveProperty('total_salary')` | 동일 |
| `:474-478` INDIVIDUAL 무회귀 | `res.total_salary === SALARY_VALUE` | 동일 |

핸들러 등록은 `registerProjectDashboardController(fakeResolver)`(`:212`)로 하고, `permissionGuard` 모듈 mock 이 이미 걸려 있어 권한 축과 무관하게 정의부가 실행된다. **경로가 오히려 실제 resolver 와 같아져 검증이 더 사실적이다.**

### R1-4. F2 회귀 가드 — **재발을 실제로 잡는다** ✅

`SalaryPolicyLeak.test.js:357-365` (LEVEL_BAND `describe` 안 = 정책이 켜진 상태에서 검사):
```js
mockGetSettingData.mockClear();
const res = await getSummaryDataService({ project_id: 'proj-1' });
expect(mockGetSettingData).not.toHaveBeenCalled();   // ← 서비스가 정책을 읽으면 실패
expect(res.total_salary).toBe(SALARY_VALUE);         // ← 서비스가 키를 떼면 실패
```
게이팅이 서비스로 되돌아가면 **두 단언이 동시에 깨진다.** 성능 회귀(KVS 왕복)와 계약 회귀(서비스 shape 변경)를 각각 한 줄씩 막는 구조로, 가드로서 유효하다. 주석에 소비자 3곳 파일:라인이 적혀 있어 실패 시 원인 추적도 즉시 된다.

### R1-5. `getChartDataByIdService`/`getChartDataService` 위치 판단 — **백엔드 판단이 맞다** ✅ (독립 grep 확인)

```
$ grep -rn "getChartDataByIdService|getChartDataService|getChartDataset" src/ --include=*.js | grep -v __test__
  ProjectDashboardController.js:38  guardedDefine(resolver,'getChartDataById', … getChartDataByIdService(…))
  ProjectDashboardController.js:40  guardedDefine(resolver,'getChartData',     … getChartDataService(…))
  ProjectDashboardService.js:88/109 (정의)   :93/:126 (getChartDataset 호출)   :176 (getChartDataset 정의)
```
- 두 함수의 **`src/` 전역 소비자는 Controller 2줄뿐**이다. 다른 도메인 Service 가 import 하는 지점 **0건** → `getSummaryDataService` 와 상황이 다르다.
- `getChartDataset` 은 `const`(비 export) 모듈 private 이라 외부 노출 경로도 없다.
- 게다가 이 경로의 최적화(**salary 위젯이 있을 때만 / 루프 밖 1회**, `:117-121`)는 `rows` 를 봐야 성립하므로 **Service 안에 있어야만 가능**하다. Controller 로 올리면 위젯 유무를 모른 채 항상 읽게 되어 오히려 나빠진다.
→ **현 위치(Service)가 맞다. 조치 불필요.**

---

## R2. F1 수정 (frontend) — **통과**

**변경 파일이 정말 1개인지:** `git diff --stat ea5ef4a` 상 프론트 델타는 `static/ui/src/pages/projectDetail/cost/CostPage.jsx`(+59/-2) **1개뿐**이다(+ 추적되지 않는 `salaryRenderGuard.test.js`는 P2 항목). 다른 58개 파일의 변경량은 1줄도 달라지지 않았다. ✅

| # | 확인 항목 | 결과 |
|---|---|---|
| 1 | 판정식 | `CostPage.jsx:53-54` `const unpriced = data?.unpricedMemberCount;` / `typeof unpriced === 'number' && unpriced > 0` → **`null`(레거시 캐시)·`0` 둘 다 미표시** ✅. 파일 내 `(salary\|Salary\|unpricedMemberCount)…(\?\?\|\|\|)\s*0` grep **0건** ✅ |
| 2 | 문구 분기 | `:55` `useSalaryPolicy(data?.salaryPolicy)` — **응답 우선** ✅. 훅이 조기 return(`isLoading` 분기) **앞** top-level 에 있어 hooks 규칙 위반 없음 ✅. `tFormat(t, isLevelBand ? 'cost.warn.unpriced' : 'cost.warn.unpricedIndividual', {count})` — §6-3 "카운트 하나, 문구만 분기" 준수 ✅ |
| 3 | `CostPolicyBasis` 정책 미확정 처리 | `:172-185` `const { policy: resolved, isLevelBand } = useSalaryPolicy(policy); if (resolved === null) return null;` → **로딩/실패 시 아무 주장도 하지 않는다** ✅ (낙관적 "인원별" 표기 없음) |
| 4 | `headerRight` 가 죽은 prop 이 아닌지 | `Card.jsx:55` 가 `headerRight` 를 받고 `:140-142` 가 실제로 렌더한다 ✅. `Text from '@atlaskit/primitives/compiled'` 는 저장소 기존 관례(10+ 파일) ✅ |
| 5 | 내가 "죽은 키"로 지적한 5종 | `cost.warn.unpriced` · `cost.warn.unpricedIndividual` · `cost.salaryPolicy.basis` · `.levelBand` · `.individual` — **5종 전부 소비처를 얻었고** kr/en + merge 산출물(`ko-KR.json`/`en-US.json`) 양쪽에 실존 확인 ✅. CostPage 의 나머지 t() 키 15종도 전부 실존 ✅ |

→ **F1 해소.** LEVEL_BAND 에서 밴드 미설정 인원이 있으면 비용 탭 상단에 경고가 뜨고, KPI 카드 헤더에 산정 기준이 표기된다.

### R2-1. `pages/projectDetail/cost` 를 정적 가드 `TARGET_DIRS` 에 넣지 않은 판단 — **동의** (근거는 프론트가 댄 것보다 강하다)

프론트 근거("정책 파생 집계라 §7-4 의 의도적 제외 영역")는 맞다. **실측으로 두 가지를 더 확인했다:**

1. **보호할 렌더 지점이 애초에 0개다.** `static/ui/src/pages/projectDetail/cost/` 9개 파일에서 `salary` 계열 **금액** 필드를 읽는 코드가 **0줄**이다(`unpricedMemberCount`·`salaryPolicy` 는 정책 메타이지 금액이 아니다). 이 화면이 그리는 값은 `budget`/`byRole`/`byLevel`/`byTeam`/`byIssue[].cost` — §5-3 **#13 "변경 없음"** 대상인 정책 파생 집계다.
2. **넣으면 오히려 테스트가 깨진다(구조적 이유).** 시뮬레이션 결과 금지 패턴 4종은 0건으로 통과하지만, 같은 파일의 **양성 단언** `'세 영역 모두 components/salary 를 실제로 쓴다'`(`salaryRenderGuard.test.js:121-131`)가 **실패한다** — CostPage 는 개인 급여를 그리지 않으므로 `SalaryCell`/`SalaryField` 를 import 하지 않는다(그게 정상이다). 넣으려면 양성 단언을 약화해야 하는데 그건 가드를 약하게 만드는 일이다.

**→ 넣지 않은 것이 옳다.**
**잔여 권고(실패 아님, 경미):** `CostPage.jsx` 가 이제 `unpricedMemberCount` 를 읽으므로, 나중에 누군가 `data?.unpricedMemberCount ?? 0` 을 쓰면 가드가 못 잡는다. 필요하면 **`?? 0` 규칙만 적용하는 별도 경량 대상 목록**(양성 단언 없이 `pages/projectDetail/cost` 포함)을 두면 이 갭이 닫힌다. 지금 당장은 코드가 명시 검사를 쓰고 있어 실해 없음.

---

## R3. P2 정적 가드 보완 — **통과, 오탐 0건** (독립 확인)

추가된 4번째 규칙(`salaryRenderGuard.test.js:81-96`):
```js
re: /(?<!=)\{\s*[A-Za-z_$][\w$]*\.\w*(?:salary|Salary)\w*\s*\}/
```

**① 합성 케이스 독립 재현 (프론트 검증과 별개로 직접 실행):**

| 입력 | 기대 | 실제 |
|---|---|---|
| `<span>{row.salary}</span>` | 히트 | **히트** ✅ |
| `<td>{data.total_salary}</td>` | 히트 | **히트** ✅ |
| `{row.effective_salary}` | 히트 | **히트** ✅ |
| `amount={row.salary}` (prop 전달) | 미히트 | **미히트** ✅ |
| `band={row.levelBand}` | 미히트 | **미히트** ✅ |
| `policy={data?.salaryPolicy}` | 미히트 | **미히트** ✅ |
| `const { salary, ...rest } = payload;` (구조분해) | 미히트 | **미히트** ✅ |
| `<X {...row.salary} />` (스프레드) | 미히트 | **미히트** ✅ |

**② 실코드 스캔 — 오탐 0건 (프론트 주장보다 강한 증거):**
- `TARGET_DIRS` 3개 디렉터리(주석 제거 후): **0건**
- **`static/ui/src` 저장소 전체: 0건** → 정상 코드 어디에도 히트하지 않는다. 회귀 위험 없이 규칙을 추가한 것이 맞다.

**③ 기록해 둘 미세 특성 2가지 (현재 히트 0건이라 무해, 조치 불필요):**
- 템플릿 리터럴 `` `${row.salary}` `` 도 히트한다(`(?<!=)` 가 `$` 를 막지 않으므로). 직접 렌더이니 의도에 부합하지만, 훗날 쿼리키 문자열 조립 같은 **비렌더 용도**로 쓰면 오탐이 될 수 있다.
- `amount = {row.salary}` 처럼 `=` 와 `{` 사이에 **공백**을 넣은 JSX prop 은 예외를 빠져나가 히트한다. 현재 그런 포맷 0건이고 저장소 관례상 발생 가능성이 낮다.

**④ 변수 별칭 우회를 "한계"로 기록한 결정 — 동의.**
`const v = row.salary; … {v}` 를 잡으려면 데이터 흐름 분석이 필요하고, 정규식으로는 원리적으로 불가능하다. 무리하게 넓히면 §1-8 ① 이 확인한 실패("초안의 넓은 패턴이 정상 소비처를 전부 위반으로 만들어 테스트가 무력화됨", `teamScopeLeak.test.js:211-215` 선례)를 그대로 반복한다. **주석(`:87-93`)에 한계를 명시하고 코드리뷰에 맡긴 것이 올바른 트레이드오프다.**

---

## R4. 교차 확인 — **충돌 없음**

**작업 영역 분리:** `git diff --stat ea5ef4a` 를 직전 검증 시점과 대조한 결과, 변경량이 달라진 파일은 **정확히 3개**다.

| 파일 | 이전 | 현재 | 귀속 |
|---|---|---|---|
| `src/resolver/projectDashboard/ProjectDashboardController.js` | (미변경) | +23/-1 | backend (F2) |
| `src/resolver/projectDashboard/ProjectDashboardService.js` | 47줄 | 45줄 | backend (F2) |
| `static/ui/src/pages/projectDetail/cost/CostPage.jsx` | (미변경) | +59/-2 | frontend (F1) |
| (추적 외) `src/resolver/__test__/SalaryPolicyLeak.test.js` | — | 수정 | backend (F2) |
| (추적 외) `static/ui/src/components/salary/__test__/salaryRenderGuard.test.js` | — | 수정 | frontend (P2) |

**나머지 58개 파일의 변경량이 1줄도 달라지지 않았다.** 백엔드 산출물은 `src/` 안에만, 프론트 산출물은 `static/ui/` 안에만 있다 — **양측 주장 사실 확인, 상호 침범 0건.**

**`package-lock.json`(F3):** `git diff --stat ea5ef4a -- package-lock.json` → **출력 없음(무변경).** 되돌리기 확인. ✅

---

## R5. 테스트 · 빌드 재실행 — **전부 통과**

| 커맨드 | 결과 | 이전 대비 |
|---|---|---|
| `npm test` (루트) | **62 suites / 995 tests 전부 통과, 실패 0** | 994 → **995** (+1 = F2 회귀 가드) |
| `cd static/ui && CI=true npm test` | **62 suites / 1061 tests 전부 통과, 실패 0** | 1061 → 1061 (가드 정규식 1종 추가는 기존 `it.each` 내부라 케이스 수 불변) |
| `cd static/ui && npm run build` | **성공** — `{"gzipBytes":271496,"budgetBytes":1625293,"withinBudget":true}` | 271,495 → 271,496 B (**+1 byte**) |

`react-scripts test` 는 이번 재검증 범위 밖이라 재실행하지 않았다(§1-10 의 러너 차이 결론은 유효하며, 이번 수정은 그 1 suite 와 무관하다).

---

## R6. 잔존 실패

**없음.**

(경미 권고 2건은 실패가 아니라 선택 사항으로만 기록한다 — R2-1 의 "`?? 0` 전용 경량 대상 목록", R3-③ 의 정규식 미세 특성 2가지.)

## R7. 미검증 (변동 사항)

§4 의 기존 6항은 **그대로 유효**하다. 이번 수정으로 다음 1항이 추가된다:

7. **`CostPage` 신규 UI 실물 렌더** — ① `unpricedMemberCount > 0` 일 때 경고 SectionMessage 가 뜨는지, ② **`null`(배포 직후 최대 10분 레거시 캐시) 구간에서 경고가 뜨지 않는지**, ③ 정책 미확정 순간 `CostPolicyBasis` 가 그려지지 않는지(빈 헤더로 남는지), ④ `Card` 헤더 우측에 문구가 레이아웃을 깨지 않고 들어가는지.

## R8. 리더 조치 요약 (갱신)

| 항목 | 상태 |
|---|---|
| **F1** 비용 탭 경고 + 산정 기준 표기 | ✅ **해소** (`CostPage.jsx` 1파일, i18n 죽은 키 5종 전부 소비처 확보) |
| **F2** `getSummaryData` Controller 게이팅 + 내부 소비자 3곳 +0 복귀 + 회귀 가드 | ✅ **해소** (백엔드 리포트 §4-4 표도 이제 사실과 일치) |
| **F3** `package-lock.json` | ✅ **해소** (코디네이터 되돌림 확인) |
| N1 백엔드 리포트에 `effective_salary` 예외 기재 | 미처리(문서 항목, P3) |
| §4 미검증 6항 + R7 의 1항 | 배포 후 E2E |

**재검증 결과 차단 사유 없음. 코드 관점에서 RFC-163 은 커밋 가능 상태다.**
