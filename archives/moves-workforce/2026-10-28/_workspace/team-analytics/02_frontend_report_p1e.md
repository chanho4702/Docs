# team-analytics — 프론트엔드 구현 리포트 (P1-e)

작성: 2026-08-03 · 슬러그 `team-analytics` · 단계 **P1-e (C — 프로젝트 상세 > 분석 > 팀) 만**
설계서: `01_architect_design.md` (§A-0 색인 · **§4-C** · §7-3 · §7-4 · §13-6 · §16-5)
선행: `02_frontend_report.md` (P1-b 어댑터 실제 시그니처)

> 🔴 **`npm run merge` 를 실행하지 않았다.** 다른 에이전트가 동시에 P1-c/d 를 구현 중이라
> 생성 파일(`ko-KR.json`/`en-US.json`)을 각자 만들면 서로 덮어쓴다. `npm run build` 도
> `prebuild` 가 merge 를 부르므로 실행하지 않았다. 검증은 `npm test` 로만 했다. (§7)

---

## 0. 요약

| 항목 | 결과 |
|---|---|
| 신규 파일 | **9개** (소스 6 + 테스트 3) |
| 수정 파일 | 7개 (locales 2 포함) |
| 테스트 | **48 suites / 793 tests 전부 통과** · **회귀 0** |
| 기준선(작업 전 **실측**) | **45 suites / 733 tests** (§8) |
| i18n | `locales/{kr,en}/projectDetail.json` **소스만** 수정 · **merge 미실행** · kr↔en 키 대칭 확인 |
| 어댑터 | `useProjectResourceMembers` **그대로 import** · 복제 0 (정적 검사로 감시, §4) |
| 비용 탭 | `fixedAxis` **미전달 경로 무변경** (정적 검사 6건, §5) |

---

## 1. 신설 · 수정 파일

### 신설 (9)

| 파일 | 내용 |
|---|---|
| `pages/projectDetail/analysisReport/team/ProjectTeamAnalysisPage.jsx` | C 페이지 셸 — 기간 필터 + 3블록(C1/C5 · C2/C4 · C3) 조립 |
| `pages/projectDetail/analysisReport/team/TeamCoverageTable.jsx` | **C1/C5 신규 인사이트** — 담당↔기여 대조표 + 3상태 배지 |
| `pages/projectDetail/analysisReport/team/teamCoverage.js` | 순수 대조 판정 `buildTeamCoverage` (React 없음) |
| `pages/projectDetail/analysisReport/periodRange.js` | 기간 규약 공용화 — `getDefaultDateRange`/`getQuickRange`/`QUICK_FILTERS` (순수) |
| `pages/projectDetail/analysisReport/periodFilterStyles.js` | `datePickerSelectProps` (스타일만 분리 — 순수 모듈이 `@atlaskit/tokens` 를 끌지 않게) |
| `pages/projectDetail/cost/useProjectCostSummary.js` | `getProjectCostSummary` 조회 **단일 출처** (쿼리키 `projectKeys.cost` 그대로) |
| `.../team/__test__/teamCoverage.test.js` | **17 tests** — 4상태 + null 규약 + 미소속 + 정렬 |
| `.../team/__test__/projectTeamAnalysisWiring.test.js` | **23 tests** — 권한 배선·`fixedAxis`·어댑터 단일화·계산 규약·i18n 정적 검사 |
| `.../analysisReport/__test__/periodRange.test.js` | **10 tests** — 기간 규약 characterization |

*(소스 6 + 테스트 3 = 9. `useProjectCostSummary.js` 만 `team/` 이 아니라 `cost/` 에 둔다 — 비용 탭과 공유하는 조회이기 때문이다)*

### 수정 (7)

| 파일 | 변경 | 회귀 위험 |
|---|---|---|
| `components/tabs/ProjectDetailTabs.jsx` | 권한 배선 ①② (§2) | 없음 — 인자 추가만 |
| `constants/tabs.js` | 권한 배선 ③ + 서브탭 등록 (§2) | 없음 — 기존 탭 정의 무변경 |
| `pages/projectDetail/cost/CostByRoleLevel.jsx` | **`fixedAxis` prop 신설** (§5) | 미전달 경로 동작 동일(정적 검사) |
| `pages/projectDetail/cost/CostPage.jsx` | 인라인 `useQuery` → `useProjectCostSummary` (키·옵션 동일) | §5-3 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisPage.jsx` | 기간 헬퍼 4종을 공용 모듈에서 import (로컬 정의 삭제, 사용부 무변경) | §6 |
| `locales/kr/projectDetail.json` | `tabs.teamAnalysis` + `analysis.team.*` 20키 추가 | 기존 키 무변경 |
| `locales/en/projectDetail.json` | 〃 | 〃 |

**건드리지 않은 것**(다른 에이전트 영역): `pages/resource/**` · `pages/portfolio/**` ·
`utils/team/teamComparison.js`(→`teamMetrics.js` 이동 중) · `locales/{kr,en}/{teamAnalytics,portfolio}.json`.
`ProjectUserPanel` 도 건드리지 않았다(§13-6).

---

## 2. 🔴 권한 배선 3곳 — 무엇을 어떻게 했나

설계서 §7-3 이 요구한 3곳을 **전부** 고쳤다. 하나라도 빠지면 권한 로드가 끝난 뒤 탭이 갱신되지 않는다.

| # | 파일 | 실제 변경 |
|---|---|---|
| **①** | `ProjectDetailTabs.jsx` | `const canReadProject = usePermissionStore(s => s.canRead('PROJECT'));` **취득** |
| **②-a** | 〃 | `projectDetailTabs(t,project_id,toast,canReadReport,canWriteProject,canReadCost,**canReadProject**,context)` — `context` **앞**에 삽입 |
| **②-b** | 〃 | `useMemo` 의존성 배열에 `canReadProject` 추가 |
| **③** | `constants/tabs.js` | 시그니처에 같은 위치로 `canReadProject` 추가 + `analysisReport.children` 에 `projectTeamAnalysis` 등록 |

```js
// constants/tabs.js — 인력 분석 다음, 진척률 앞
{ key: 'projectTeamAnalysis',
  label: <span…><PeopleGroupIcon/>{t('projectDetail.tabs.teamAnalysis')}</span>,
  component: () => <ProjectTeamAnalysisPage project_id={project_id} />,
  canRender: () => canReadReport && canReadProject }
```

**호출 순서 드리프트를 테스트로 막았다.** 위치 인자는 하나만 어긋나도 `canReadCost` 자리에
`canReadProject` 가 들어가는 조용한 사고가 된다 → 두 파일에서 인자 이름 목록을 각각 파싱해
**배열 동일성**을 단언한다(`projectTeamAnalysisWiring.test.js` §① 2-c).

**🔴 탭을 숨기지 않았다.** `canRender` 는 `CommonTab.jsx:55` 에서 `canRender ? <ActivePage/> : <NoPermissionPage/>`
로만 쓰인다 — 목록에서 지우지 않는다. 기존 서브탭 4개(`projectSalary`·`projectProgress`·`projectCost`·`taskHistory`)와
**같은 방식**이며, 테스트가 (a) `tabs.js` 에 `.filter(` 가 없고 (b) `CommonTab` 의 분기가 그대로임을 단언한다.
→ 권한 없는 사용자는 드롭다운에서 "팀"을 보고, 선택하면 `NoPermissionPage` 를 본다. **의도된 동작이다.**

**왜 `PROJECT read` 가 함께 필요한가**(코드로 확인): 사람↔팀 축은 `findProjectusersByProjectId` 의
`rows[].teamKey`/`teamName` 에서만 온다(`resourceMembersAdapter.buildMembers:171-174` — `getResourceAnalysisList`
는 KVS 캐시라 팀을 싣지 않는다). 이 resolver 가 `PROJECT read` 전용이므로 `REPORT` 만 있으면
**담당/기여 대조의 기여 축이 통째로 빈다.**

---

## 3. 담당 팀 ↔ 기여 팀 대조 — **어떤 데이터로 만들었나**

이 탭의 유일한 신규 가치다(현재 어디에도 없는 화면).

| 축 | 원천 | 경로 | 기간 |
|---|---|---|---|
| **담당** | `getProjectTeams` | `useProjectTeams(project_id)` → `res.content.teams[]` = `{teamKey, name, isPrimary, memberCount, assignedMemberCount}` · `content.assignmentReady` | — (배정은 시점 개념이 없다) |
| **기여** | `findProjectusersByProjectId` ⨝ `getResourceAnalysisList` | `useProjectResourceMembers(...)` → `members[]` → `aggregateByTeam(members, teamRollupOptions(t))` | **선택 기간** |

> **소비 shape 은 기존 훅 계약을 그대로 따랐다** — `getProjectTeams` 만 `res.content.*` 이고
> (`useProjectTeams.js:29` 가 이미 그렇게 읽는다), 인력·분석 2종은 `responseWrapper` **스프레드**라
> `res.rows` / `res.members` 다(설계서 §3-0). **나는 새 `invoke` 를 하나도 쓰지 않았다** — 세 조회 모두
> 기존 훅을 통과하므로 shape 접근 경로가 원천적으로 갈릴 수 없다.

### 판정 (`teamCoverage.js`, 순수 함수)

| 상태 | 조건 | 표기 |
|---|---|---|
| `both` | 담당 O · 기여 O | 담당·기여 |
| `assignedOnly` | 담당 O · 기여 X | **담당이지만 기여 없음** |
| `contributedOnly` | 담당 X · 기여 O (팀 미소속 포함) | **미담당 기여** |

컬럼: 팀(주 담당 배지) · 대조 상태 · 투입 인원 · 기여 인원 · 기여 MD · 기여 비중(막대+%).

### null vs 알려진 0 — 두 방향을 반대로 처리했다

| 값 | 판정 | 이유 |
|---|---|---|
| 담당 팀의 `contributedMd`/`contributedMemberCount` (기여 그룹 없음) | **알려진 `0`** | 기간 내 그 팀 소속으로 조회된 인원이 없다 = 사실이다. 조회 실패는 표 자체를 막으므로(§4) 여기에 섞이지 않는다 |
| 미담당 팀의 `assignedMemberCount`/`orgMemberCount` | **`null`(Dash)** | 서버가 값을 주지 않는다 = **모른다**. `0` 으로 찍으면 "그 팀에서 아무도 투입 안 됐다"는 거짓 |
| `totalMd === null` 인 기여 그룹 | **`null`** 유지 + 비중 분모에서도 제외 | 집계 전 |
| 전체 기여 MD 가 `0` | 비중 **`null`** | `0/0` 은 정의되지 않는다. 0% 막대로 그리면 거짓 |
| 담당인데 기여 0, 단 **다른 팀은 기여함** | 비중 **`0`** | 분모가 있으므로 진짜 0% 다 |

이 5가지를 전부 테스트로 고정했다(`teamCoverage.test.js` — "🔴 null(집계 전)을 0 으로 만들지 않는다" 5 cases).

### 규약 준수

- **팀 미소속을 숨기지 않는다** — `teamKey===null` 그룹은 담당 팀과 절대 매칭되지 않으므로 항상
  `contributedOnly` 이고 **마지막 행**이다. "기여 MD 총합 = 팀 표 합" 을 테스트가 단언한다.
- **삭제된 팀도 지우지 않는다** — `name:null` 이면 `team.project.deletedTeam` 라벨로 대체(행은 남는다).
- 팀 이름은 **기여 축 우선 → 담당 축 → 삭제 라벨**. 담당 축의 `name` 이 낡을 수 있다.
- **가동률 축 없음 · 이슈 건수 컬럼 없음** — §6.
- `team.analysis.currentMembershipNote` InfoTip 부착(기존 키 재사용, `membershipBasis` 라벨과 함께).

---

## 4. 어댑터 재사용 — **복제한 로직이 없다는 근거**

```js
// ProjectTeamAnalysisPage.jsx
const { members, isTeamFilterUnavailable, effectiveViewMode, baseMmDays, monthMm, hourRate,
        isUserLoading, isAnalysisLoading, isUserError, isAnalysisError }
  = useProjectResourceMembers({ projectId: project_id, startDate, endDate, viewMode: VIEW_MODE_TEAM });
```

- **P1-b 리포트의 실제 시그니처를 그대로 썼다** — `isTeamFilterUnavailable`(`isOverMemberLimit` 아님) ·
  `effectiveViewMode` · **분리된 `isUserError`/`isAnalysisError`**. 통합 `isError` 를 만들지 않았다.
- `viewMode: VIEW_MODE_TEAM` **고정** → 어댑터가 전량 조회(`pagesize=500`, `page=1`)로 전환한다.
  페이지 단위 롤업이 원천적으로 불가능하다.
- **쿼리키는 `resourceAnalysisKeys` 재사용**(훅 내부). 신규 팩토리 0 → 인력 분석 탭과 **캐시를 공유**한다.
  같은 기간을 고르면 네트워크 추가 0.
- `getProjectTeams` 는 기존 `projectKeys.projectTeams`, 비용은 기존 `projectKeys.cost` — **신규 키 0**.

**기계적 근거 (`projectTeamAnalysisWiring.test.js` §③, 8 cases)** — `team/` 디렉토리 전 파일에 대해:

| 단언 | 결과 |
|---|---|
| `invoke(` 호출 **0건** | ✅ |
| `TEAM_FILTER_PAGE_SIZE = 500` / `USER_MAP_MAX = 100` / `DEFAULT_PAGE_SIZE = 10` 재정의 **0건** | ✅ |
| `const isFullFetch =` / `const effectivePage =` / `const effectiveMmDays =` 재정의 **0건** | ✅ |
| `…Keys = {` (신규 쿼리키 팩토리) **0건** | ✅ |
| `sumFields`/`avgFields` 직접 조립 **0건** (공용 `teamRollupOptions(t)` 만) | ✅ |
| `ResourceAnalysisTeamTable`·`CostByRoleLevel` **import 재사용** | ✅ |
| 500명 초과 차단이 `isTeamFilterUnavailable` + `effectiveViewMode` 로 걸림 | ✅ |
| 에러 분기 2종(`(isUserError \|\| isAnalysisError)` / `isTeamView && isAnalysisError`) 유지 | ✅ |

기존 `resourceAdapterSingleSource.test.js` 도 무수정 통과한다(그 검사는 `resource/` 디렉토리 스캔이라
`team/` 을 보지 않는다 — 그래서 **같은 취지의 검사를 `team/` 용으로 새로 썼다**).

**팀 롤업의 단일 출처**: `aggregateByTeam(members, teamRollupOptions(t))` 를 페이지에서 한 번 호출해
`TeamCoverageTable` 에 넘긴다. `ResourceAnalysisTeamTable` 은 **같은 `members` 와 같은 옵션 팩토리**로
내부에서 롤업하므로 두 표의 인원·MD 는 정의상 일치한다.
⚠ `aggregateByTeam` 은 P1-b 가 **scope 를 필수화한 대상이 아니다**(필수화된 것은 `teamMetricsByTeam`·
`rollupTeamTree` 두 함수). C 는 프로젝트 단위 화면이라 팀 스코프 축 자체가 없고,
`teamScopeLeak.test.js` 의 정적 검사 경로(`pages/teamAnalytics`·`portfolio/widgets/PortfolioTeam*`·
`portfolio/tabs/TeamTab`)에도 포함되지 않는다 — 기존 3곳(`ResourceAnalysisTeamTable` 포함)과 같은 취급이다.

---

## 5. `fixedAxis` 계약 + 비용 탭 무회귀 근거

```js
// 계약 (CostByRoleLevel.jsx)
export default function CostByRoleLevel({ data, fixedAxis = null }) {
    const [selectedAxis, setSelectedAxis] = useState('role');   // ← 현행 그대로
    const axis = fixedAxis ?? selectedAxis;                     // 고정 축이 있으면 state 를 읽지 않는다
    …
    {!fixedAxis && (<div className="cost-toggle-group">…3-way 토글…</div>)}
```

- `fixedAxis` 가 주어지면 **초기값이자 유일한 축**이고 토글 UI 를 렌더하지 않는다.
- **미전달 시 현행 동작 100%**: `useState('role')` 유지 · 3-way 토글 유지 · 클릭 핸들러는
  `setAxis` → `setSelectedAxis` **리네임만**(동작 동일) · `metaMap`/`rawGroups`/`isStale`/`isEmpty`/
  `option`/`tableHead`/`tableRows` 모두 `axis` 를 그대로 읽는다(무변경).
- `rawGroups == null` → `cost.roleLevel.notReady`("집계 전") 규약을 **두 경로가 함께 상속**한다.
- 팀 축의 "현재 소속 기준" InfoTip 은 `axis === 'team'` 조건이라 **고정 축에서도 그대로 뜬다.**
- `useTeamOptions({ enabled: axis === 'team' })` 도 `axis` 파생값을 보므로 고정 축에서 정상 활성화된다.

**무회귀의 기계적 근거 (`projectTeamAnalysisWiring.test.js` §②, 7 cases)**

| 단언 | 결과 |
|---|---|
| `function CostByRoleLevel({ data, fixedAxis = null })` | ✅ |
| `useState('role')` 존재 · `const axis = fixedAxis ?? selectedAxis` | ✅ |
| `{!fixedAxis && (` 로만 토글을 감쌌고 `['role','level','team'].map` 은 살아 있다 | ✅ |
| **`CostPage.jsx` 호출부가 `<CostByRoleLevel data={data} />` 이고 파일 전체에 `fixedAxis` 문자열이 없다** | ✅ |
| 팀 탭 호출부가 `fixedAxis="team"` | ✅ |
| `isStale = rawGroups == null` + `cost.roleLevel.notReady` 유지 | ✅ |
| `invoke('getProjectCostSummary'` 가 **`useProjectCostSummary.js` 한 파일에만** 존재(전 `src/` 스캔) | ✅ |

### 5-3. `CostPage` 의 조회를 훅으로 옮긴 것에 대해

`getProjectCostSummary` 를 팀 탭에서 다시 호출하면 **같은 응답의 두 번째 조회 코드**가 생긴다
(`coworkerFieldId` 조달 순서·`enabled` 조건이 조금씩 달라지면 탭마다 다른 시점의 캐시를 본다).
그래서 `useProjectCostSummary` 로 뽑고 `CostPage` 가 그것을 쓰게 했다.

**동일성**: 쿼리키(`projectKeys.cost(projectId)` · `['coworkerFieldId']`) · `queryFn` · `staleTime` ·
`keepPreviousData` · `enabled` 조건이 **전부 축자 이전**이다. `CostPage` 의 상태 분기
(`isSuccess`/`hasPeriod`/`hasBudget`/`isLoading || !isCoworkerReady`)와 JSX 는 **한 줄도 바꾸지 않았다**.

### 🔴 기간 기준이 다르다는 표기

`getProjectCostSummary` 는 기간 인자를 받지 않아 **항상 프로젝트 전체 기간**이다(`ProjectCostService.js:67-109`).
같은 화면의 C1/C2/C4 는 사용자가 고른 기간이므로, 비용 카드 헤더에
`projectDetail.analysis.team.cost.wholePeriod` = *"비용은 프로젝트 전체 기간({start} ~ {end}) 기준입니다.
위 기간 필터가 적용되지 않습니다."* 를 **경고색(#974F0C)** 으로 명시했다.
날짜를 모를 때(권한 없음·오류·기간 미설정)는 문구를 만들지 않는다 — `"- ~ -"` 는 정보가 아니다.

---

## 6. 계산 규약 — 지시받은 6항목

| 규약 | 준수 방법 | 감시 |
|---|---|---|
| **가동률 축을 두지 않는다** | `team/` 어디에도 가동률을 만들지 않았다. (재사용한 `ResourceAnalysisTeamTable` 의 "비중" 컬럼은 그 컴포넌트가 원래 갖고 있던 `Σ totalMd / Σ effectiveMmDays` 로, 전 프로젝트 union 분모를 쓰는 A 의 가동률과 다른 지표다 — 그것을 새로 만들지 않았다는 뜻) | 정적: `team/` 에 `utilization` 문자열 0건 |
| **이슈 건수 컬럼을 두지 않는다** | 대조표에 없음 | 정적: `team/` 에 `issueCount` 0건 |
| **`null` 을 `0` 으로 그리지 않는다** | §3 표 5가지 | 정적: `team/` 에 `?? 0` 0건 + 단위 테스트 5 cases |
| **팀 미소속을 숨기지 않는다** | 항상 마지막 행 | 단위 테스트 3 cases |
| **인건비는 `PROJECT_COST` 게이트** | `canRead('PROJECT_COST')` — 없으면 **조회 자체를 막고**(`enabled: canReadCost`) `noCostPermission` 안내 | 정적 3 단언 |
| **팀 롤업은 `aggregateByTeam` 단일 출처** | 공용 옵션 팩토리 `teamRollupOptions(t)` 그대로 | 정적: `sumFields`/`avgFields` 조립 0건 |

**500명 초과**: `isTeamFilterUnavailable` 이면 `team.analysis.tooManyMembers`(기존 키) 안내 +
**두 표를 모두 그리지 않는다**. 잘린 500명으로 만든 "담당인데 기여 없음"은 거짓이기 때문이다.
**분석 조회 실패**(`isAnalysisError`)도 같은 이유로 두 표를 막고 배너로 사실을 말한다
— 인력 분석의 characterization ⑦ 과 **같은 규칙**이다.

---

## 7. i18n — 🔴 merge 미실행

- 수정: `locales/kr/projectDetail.json` · `locales/en/projectDetail.json` **소스 2개만**.
  `tabs.teamAnalysis` + `analysis.team.*` — **양쪽 20키씩, 키 대칭 확인 완료**(스크립트 검증).
- **`npm run merge` 를 실행하지 않았다.** 다른 에이전트가 `locales/kr/teamAnalytics.json` 등을 동시에
  만들고 있어(작업 중 `git status` 로 확인), 생성 파일을 각자 만들면 서로 덮어쓴다.
  → **리더가 P1-c/d/e 를 합친 뒤 한 번만 `cd static/ui && npm run merge` 를 실행해야 한다.**
- 같은 이유로 **`npm run build` 도 실행하지 않았다**(`prebuild` 가 merge 를 부른다).
- `ko-KR.json`/`en-US.json` 을 직접 수정하지 않았다. 테스트가 *"생성 파일에 아직 새 키가 없다"* 를
  단언한다 — merge 를 실행하면 **이 단언이 실패하므로 그때 지워야 한다**(§9 인계).

**설계서 §10-3 대비 추가한 키 7개** (컬럼 라벨·빈 상태·오류 — 설계서에 없어 화면을 만들 수 없었다):
`coverage.statusCol` · `coverage.assignedMembers` · `coverage.assignedMembersTooltip` ·
`coverage.contributedMembers` · `coverage.share` · `coverage.shareCalc` · `coverage.empty` · `coverage.loadError`.
§10-3 의 12키는 **문구까지 그대로** 넣었다.

**재사용한 기존 키**(신규로 만들지 않음): `team.analysis.tooManyMembers` · `team.analysis.currentMembershipNote` ·
`team.analysis.membershipBasis` · `team.project.notReady` · `team.project.primary` · `team.project.deletedTeam` ·
`resource.col.team` · `cost.error` · `cost.roleLevel.{calc,interp,notReady}` ·
`projectDetail.analysis.resource.{loadError, table.totalMd, filter.*}`.

---

## 8. 테스트 결과 — 기준선 **실측**

```
$ cd static/ui && npm test        # ⚠ 작업 시작 직후 실측 (전달받은 숫자를 쓰지 않았다)
Test Suites: 45 passed, 45 total
Tests:       733 passed, 733 total
Snapshots:   1 passed, 1 total
```

```
$ cd static/ui && npm test        # P1-e 완료 후
Test Suites: 48 passed, 48 total
Tests:       793 passed, 793 total
Snapshots:   1 passed, 1 total
Time:        22.3 s
```

**회귀 0건.** 순증 +3 suites / +60 tests.

⚠ **완료 시점 숫자에는 동시 진행 중인 P1-c/d 의 변경이 섞여 있다** — 실행 중
`pages/portfolio/utils/teamComparison.js` → `utils/team/teamMetrics.js` 이동과
`pages/resource/teamAnalytics/` 신설이 워킹트리에 나타났다(`git status` 로 확인).
내 3 suites 를 뺀 45 suites 는 전부 통과 상태를 유지했고, **내가 만든 파일과 그들의 파일은 겹치지 않는다.**

**빌드는 실행하지 않았다**(§7 merge 사유). 배포 전에 리더가 merge → build 를 한 번 돌려야 한다.

---

## 9. 발견한 결함 1건 (P1-e 범위 밖 — 고치지 않았다)

**`getQuickRange('lastMonth')` 가 UTC+ 지역에서 하루 앞당겨진다.**

`lastMonth` 만 `new Date(y, m, 1)`(= 로컬 **자정**)을 `fmt`(=`toISOString`, UTC)에 넘긴다.
KST(+9)에서는 자정이 전날 UTC 로 넘어가 **6/30 ~ 7/30** 이 된다(정답은 7/1 ~ 7/31).
다른 퀵 필터는 정오 기준 `Date` 라 영향이 없다.

- **원래 `ResourceAnalysisPage` 에 있던 동작이다**(P1-e 가 만든 것이 아니다). 고치면 인력 분석 화면의
  기존 동작이 바뀌므로 **현행 그대로 공용 모듈에 이전**하고, `periodRange.test.js` 에 🔴 주석과 함께
  characterization 으로 기록했다.
- 다만 이제 **팀 탭도 같은 값을 쓴다** — 두 화면이 **같이** 틀리므로 화면 간 불일치는 없다.
- 판단은 리더에게 넘긴다(고치려면 인력 분석 회귀 검증이 함께 필요하다).

---

## 10. 다음 단계로 넘기는 메모

1. 🔴 **merge 는 리더가 한 번만.** P1-c/d/e 를 합친 뒤 `cd static/ui && npm run merge` →
   `projectTeamAnalysisWiring.test.js` 의 마지막 케이스(*"생성 파일에 아직 새 키가 없다"*)를 **삭제**해야 한다.
   그 케이스는 "merge 미실행"을 증명하려고 일부러 넣은 것이다.
2. **P1-e 는 단독 배포 가능**(설계서 §11). P1-c↔P1-d 동반 배포와 무관하다.
3. **E2E 미수행.** 수동 확인 권장: ① 담당 팀 미배정 프로젝트에서 `contributedOnly` 만 뜨는지
   ② `assignmentReady:false`(v014 미실행) 환경에서 "담당 없음"이 아니라 **미준비 안내**가 뜨는지
   ③ `PROJECT_COST` 없는 계정에서 비용 카드가 안내만 뜨고 **조회가 안 나가는지**(네트워크 탭)
   ④ REPORT 만 있고 PROJECT 없는 계정에서 탭이 **보이되** `NoPermissionPage` 가 뜨는지
   ⑤ 비용 탭의 3-way 토글이 그대로 동작하는지(무회귀).
4. `useProjectResourceMembers` 는 내부에서 `useTeamOptions()` 를 호출한다(하위 팀 판정용).
   C 는 팀 필터를 쓰지 않아 결과를 소비하지 않지만 조회는 나간다 — 다른 화면과 캐시를 공유하므로
   실측 비용은 0에 가깝다. 줄이려면 훅에 `enabled` 옵션이 필요한데, **어댑터 시그니처 변경은
   P1-b 계약 변경**이라 이번 범위에서 하지 않았다.
