# P1-f 프론트 구현 리포트 — 프로젝트별 팀 투입 · 상태 필터 · 가동률 배지

작성: frontend-engineer / 2026-08-03
대상: `/resource` > 팀 분석 탭 (`static/ui/src/pages/resource/teamAnalytics/`)

---

## 0. 기준선 (🔴 전달값을 믿지 않고 직접 실측했다)

| 항목 | 작업 **전** 실측 | 작업 **후** 실측 |
|---|---|---|
| `cd static/ui && npx jest` | **55 suites / 932 tests / snapshot 1 — 전부 통과** (12.9s) | **56 suites / 984 tests / snapshot 1 — 전부 통과** (12.7s) |
| `cd static/ui && npm run build` | 성공 · `main.c6932154.js` raw **1,004,022** / gzip **273,091** / budget 1,625,293 · withinBudget true | 성공 · `main.b6cfee1d.js` raw **1,004,022** / gzip **273,088** / budget 1,625,293 · withinBudget true |

- **회귀 0.** 기존 932 테스트가 1건도 깨지지 않았고, 신규 52건(어댑터 20 · 생애주기 16 · i18n 자동수집 16)이 추가됐다.
- 빌드 경고는 `@atlaskit/*`·`marklassian` **source map 미포함 경고 3건뿐**(node_modules 사유, 기존과 동일). 신규 코드에 대한 lint/hook 경고 0.
- 번들 main.js 크기 변화 없음 — 팀 분석 화면은 분리 청크로 나가고, gzip 3바이트 차이는 문자열 변화분이다.

### ⚠ 작업 트리 상태 고지 (리더 확인 필요)
세션 시작 시 전달된 git 스냅샷은 `.gitignore`/`.agents/`/`.codex/` 3건만 변경으로 표시했으나, **실제 트리에는 내가 건드리지 않은 미커밋 변경이 이미 있었다**:
`resource/allocation/AllocationGraph.jsx`, `allocation/allocationGraphOption.js`, `teamAnalytics/TeamChartBox.jsx`(height 300→380), `teamAnalytics/TeamScopeSelector.jsx`(단일→다중 선택), `teamAnalytics/charts/TeamCompositionStack.jsx`, 신규 `teamAnalytics/TeamAnalyticsTab.css`.
`TeamAnalyticsTab.jsx` 의 diff 중 **다중 선택·2열 그리드·`effectiveScope` 부분은 이 선행 변경분**이고, 내 변경은 `PROJECT_FILTER`/`TeamProjectFilter`/`TeamProjectStack`/`allProjectsBasis` 4가지다. 커밋 분리가 필요하면 리더가 판단할 것.

---

## 1. 요구 1 — 프로젝트별 팀 투입 차트 (#7)

### 산출물
| 파일 | 성격 |
|---|---|
| `static/ui/src/pages/resource/teamAnalytics/teamAnalyticsAdapter.js` | `projectTeamMatrix()` **순수 함수 신설** |
| `static/ui/src/pages/resource/teamAnalytics/charts/TeamProjectStack.jsx` | 전폭 카드(신규) |
| `__test__/teamAnalyticsAdapter.test.js` | `projectTeamMatrix` 케이스 14건 추가 |

### 데이터 원천
- `getPortfolioDashboard.projects[].members[].effortMd` (= 배치 스냅샷의 **실제 투입 공수**)
- 팀 매핑 `memberTeamMap` = `getResourceOverview.people[]` 파생(`buildMemberTeamMap`, 포트폴리오 `memberTeamMap` 에 의존하지 않는 기존 규약 유지)
- 팀 이름 사전 = `getTeamAnalyticsScope.content.teams[]` → **기존 `normalizeTeamMeta` 재사용**(3형태 흡수). 이름을 모르면 `team.form.unknownTeam`, **teamKey 를 라벨로 쓰지 않는다.**
- 추가 백엔드 호출 **0건**. 신규 resolver **0건**. 신규 옵션 빌더 파일 **0건**(`stackChartOption({orientation:'horizontal'})` 재사용).

### 집계 — 단일 출처 재사용 근거
`teamMetricsByTeam`(`teamMetrics.js:149-185`)의 **project × member 순회와 같은 자리에서 스코프를 걸고**, 접는 축만 팀 → (프로젝트 × 팀) 격자로 바꿨다. 셀 산식은 `Σ member.effortMd` 하나뿐이라 새 롤업 규칙을 만들지 않았다.
`aggregateByTeam`/`rollupTeamTree` 를 쓰지 않은 이유: 두 함수 모두 **출력 축이 팀 하나**라 프로젝트 축을 보존할 수 없다(그 축을 살리는 것이 이 차트의 목적). 대신 이름 사전(`normalizeTeamMeta`)·반올림 자리수(`round2`)·`기타` 묶음 방식은 기존 것을 그대로 따랐다.

### 인원 기준
**참여 인원(activeMembers)** — 배지도 그것으로 표기한다. 🔴 다만 **막대 값은 인원이 아니라 투입 공수(MD)** 이므로 툴바에 `chart.projectTeam.basisLabel`("투입 공수(MD) 기준")을 함께 낸다.

### 절단 규칙 (🔴 전부 화면에 밝힌다 — 조용한 절단 없음)
| 절단 | 규칙 | 반환 필드 | 화면 표기 |
|---|---|---|---|
| 프로젝트 | 총 MD 상위 **12개** | `hiddenProjects`, `hiddenProjectMd` | `chart.projectTeam.truncated` — "상위 {shown}개만 표시. {count}개(합계 {md} MD)가 빠졌습니다" |
| 팀 | 총 MD 상위 **8개 + `기타`** | `otherTeamCount` | `chart.projectTeam.otherTeams` (+ `기타(N개 팀)` 라벨은 기존 `compare.other` 키 재사용) |
| 팀 미소속 | **묶지도 숨기지도 않는다 — 항상 마지막 스택** | `teamColumns[last].isUnassigned` | 스택 라벨 `team.unassigned.label` |
`기타` 는 자르기가 아니라 **합계 보존**이다(`teamComparison` 과 같은 방식). `effortMd` 는 가산 필드라 묶어 더해도 정의가 유지된다 — 비율 축이 아니므로 `null` 처리가 필요 없다. 테스트로 "각 프로젝트의 스택 합 === 그 프로젝트 총 MD" 불변식을 고정했다.

### `null` 처리 (🔴 0 으로 그리지 않는다)
| 상황 | 값 | 근거 |
|---|---|---|
| 팀이 그 프로젝트에 투입 기록 없음 | **`null`**(막대 없음 / 표 `-`) | `0` 은 "0 MD 로 투입됐다"는 주장이 된다 |
| `member.effortMd` 가 `null` | **합에 더하지 않고** `unknownEffortMembers` 로 카운트 | 모르는 값에 0 을 더하지 않는다 |
| 프로젝트에 알려진 공수 전무 | 막대를 그리지 않고 `excludedProjects` 로 카운트 | 높이 0 막대 금지 |
| `REPORT` 미보유 | **차트 자체를 그리지 않고** `blockedMessage={t('teamAnalytics.needReport')}` | `selectedProjects` 가 `[]`(`useTeamAnalyticsData:95`)라 0 으로 보일 위험이 있다 |
표 모드 값은 **차트와 같은 `cellValue()` 결과**를 그대로 쓴다(값이 두 벌 생기지 않게, 테스트로 고정).

### 🔴 "배정 ≠ 투입" 한계를 화면 어디에 밝혔는가
`project_team`(배정)을 전사로 읽는 resolver 가 없어 **백엔드를 만들지 않고 투입(공수)만** 구현했다. 한계는 **3곳**에 명시했다.
1. **툴바 InfoTip**(기존 `pages/projectDetail/progress/InfoTip` 재사용) — `info.interp`:
   "실제 투입(공수) 기준이라 배정만 되고 아직 투입 기록이 없는 팀은 나타나지 않습니다. '배정 현황'과 다를 수 있습니다."
2. **카드 하단 고정 안내**(`chart.projectTeam.assignedGap`) — **조건 없이 항상 노출**한다. 데이터가 있어 보일 때가 가장 오해하기 쉽기 때문에 조건부로 두지 않았다.
3. 소스 주석 — `teamAnalyticsAdapter.projectTeamMatrix` JSDoc, `TeamProjectStack` 헤더 주석.

---

## 2. 요구 2 — 프로젝트 상태 필터 (진행중 / 전체, 기본 진행중)

### 산출물
| 파일 | 성격 |
|---|---|
| `static/ui/src/utils/projectLifecycle.js` | **신규 순수 모듈** — `isTerminalStatus` · `isProjectClosed` · `filterProjectsByStatus` · `PROJECT_FILTER` |
| `static/ui/src/utils/__test__/projectLifecycle.test.js` | **신규 16건** |
| `teamAnalytics/TeamProjectFilter.jsx` | 토글 2개 + 제외 건수 표기(신규) |
| `teamAnalytics/hooks/useTeamAnalyticsData.js` | `{ projectFilter }` 옵션 수용, 집계 **전** 필터 |
| `teamAnalytics/TeamAnalyticsTab.jsx` | 상태 보유 + 배선 |

### 🔴 백엔드와 같은 규칙임을 어떻게 보장했는가
프론트에 같은 판정이 **없었다**(`projectCardFilter.js` 의 `isClosed` 는 백엔드가 계산해 실어준 플래그라 팀 분석 경로에는 오지 않는다 — `getPortfolioDashboard.projects[]` 는 `statusKey`/`statusName`/`endDate` 원값만 싣는다). 그래서 순수 함수를 만들되 **규칙을 발명하지 않고 백엔드 상수·정규식·판정 순서를 글자 그대로 이식**했다.

보장 수단은 주석이 아니라 **테스트다.** `projectLifecycle.test.js` 는 `fs` 로
`src/resolver/resourceManagement/ResourceManagementService.js` 를 **실제로 읽어** 대조한다:
- `TERMINAL_STATUS_KEYS` 집합 일치
- `TERMINAL_NAME_RE` **정규식 문자열 완전 일치**(`` `${RE}` === 백엔드 리터럴 ``)
- `isTerminalStatus` 의 판정 순서(키 → 이름) 일치
- `isProjectClosed` 가 상태 판정 + `endYmd < todayYmd` 의 OR 임을 확인
→ 백엔드에서 한쪽만 바뀌면 **프론트 테스트가 먼저 깨진다.**

### 🔴 왜 `isTerminalStatus`(상태만)이고 `isProjectClosed`(상태+종료일)가 아닌가
`isProjectClosed` 는 **종료일이 지난 프로젝트를 닫힌 것으로 본다.** 그 규칙을 쓰면 **지연 프로젝트가 통째로 사라져** 지연 축(`delayedShare`)이 항상 0 에 수렴한다 — 요구 3의 반응 여부 표가 "지연 ✅ 반응"이라고 규정한 것과 정면으로 충돌한다.
선례도 같다: `projectCardFilter.js` 는 `isClosed`(상태만)와 `isOverdue`(종료일 경과)를 **독립 조건**으로 다룬다(사용자 요구로 분리된 것).
→ 두 함수를 모두 이식(백엔드 대조용)하되 **필터가 쓰는 것은 `isTerminalStatus` 하나**다. 이 판단은 테스트 `🔴 종료일이 지났어도 상태가 진행중이면 종료가 아니다 (지연 ≠ 종료)` 로 고정했다.

### 🔴 필터는 집계 **이전**
적용 지점은 `useTeamAnalyticsData` 안, `teamMetricsByTeam(selectedProjects, …)` 을 부르기 **전**이다.
```
portfolioQuery.data.projects   →  filterProjectsByStatus(…, projectFilter)  →  selectedProjects
                                                                                 ├─ teamMetricsByTeam(scope 필수)
                                                                                 ├─ rollupTeamTree
                                                                                 ├─ teamComparison (#2)
                                                                                 └─ projectTeamMatrix (#7)
```
결과 행을 나중에 거르면 진척률·지연율의 분모가 전체 프로젝트로 남는다(팀 선택에서 `effectiveScope` 로 스코프를 좁힌 것과 같은 이유). 훅이 반환하는 `selectedProjects` 는 **이미 걸러진 배열**이며 소비처가 다시 거르지 않는다.
`filterProjectsByStatus` 는 **원소를 복사하지 않는다**(참조 동일성 테스트로 고정) — 집계가 같은 객체를 본다.

### 표기
`teamAnalytics.filter.project.activeNote` = "전체 {total}개 중 진행중 {shown}개 기준 (종료 {hidden}개 제외)."
→ 무엇이 몇 개 빠졌는지 **항상 숫자로** 밝힌다.
`REPORT` 미보유 시에는 프로젝트가 0건이라 토글이 아무것도 바꾸지 못하므로 **컨트롤을 렌더하지 않는다**(기존 `needReport` 배너가 그 사실을 이미 말한다).

---

## 3. 요구 3 — "전체 프로젝트 기준" 배지

### 재사용 판정
기존 `BasisBadge`(`TeamChartFrame.jsx`)를 **그대로 재사용**했다. `BASIS` 맵에 `allProjects` 항목 1줄을 추가하고(`metric.allProjects` / `metric.tip.allProjects`), `TeamChartFrame` 에 optional prop `allProjectsBasis` 를 더해 인원 기준 배지 **옆에** 하나 더 렌더한다. 별도 배지 컴포넌트를 만들지 않았다.

### 배지를 붙인 차트와 근거
| 차트 | 배지 | 근거 |
|---|---|---|
| **#1 가동률 밴드 분포** | ✅ | 전 시리즈가 `utilMemberCount`/`band*` = 전사 가동률 산출값 |
| **#4 가동률 vs 규모** | ✅ | x·y 축이 전사 가동률. ⚠ **점 크기(투입 공수)는 필터에 반응**하므로 축과 크기의 기준이 다르다 — 더욱 밝혀야 한다 |
| **#5 계층 롤업** | ✅ + **컬럼 마커** | 컬럼마다 반응이 달라 카드 배지만으로는 부족하다. `가동률`·`가동률 산출 인원` 헤더에만 `*` 를 붙이고 `note.utilColumnAllProjects` 로 "나머지 컬럼은 필터가 적용된다"까지 밝힌다 |
| **#2 팀 간 비교** | ✅ **가동률 축일 때만** | 같은 카드가 축에 따라 반응/무반응이 갈린다. 공수·인건비·진척률 축에 배지를 붙이면 **반대 방향의 거짓 안내**가 된다 (⚠ 지시받은 3개 외 추가분 — 근거는 동일 원리) |
| #3 인력 구성 | ❌ | 조직 인원 = 프로젝트와 무관. 배지를 붙이면 "프로젝트 필터와 관계있는 값"이라는 오해를 만든다 |
| #7 프로젝트별 팀 투입 | ❌ | 투입 공수 축 = 필터에 정상 반응 |

**표시 조건**: `canReadReport && projectFilter === ACTIVE` — 즉 **필터가 실제로 좁히고 있을 때만**. `전체` 를 고르면 무반응 자체가 없어지므로 배지도 사라진다.
**숫자는 그대로 보여준다.** 숨기거나 대시로 바꾸지 않았다(사용자 지시).

---

## 4. 공통 규약 준수 확인

| 규약 | 준수 방식 |
|---|---|
| `null`(집계 전)을 `0` 으로 그리지 않음 | `projectTeamMatrix` 셀·프로젝트·행 3단계 전부 `null` 유지 + 제외 건수 반환. 테스트 5건 |
| 팀 미소속을 숨기지 않음 | `teamColumns` 마지막 스택 고정. 테스트 1건 |
| 집계 단일 출처 재사용 | `normalizeTeamMeta`·`compare.other` 라벨·`round2`·순회 위치 모두 기존 것. 새 롤업 함수 0 (근거 §1) |
| `scope` 필수 전달 | `projectTeamMatrix` 도 **미전달 시 throw**(기존 `compositionByTeam`/`teamMetricsByTeam` 과 동일 계약). 테스트 2건 |
| 인원 기준 3종 표기 | #7 = 참여 인원 배지 + "투입 공수(MD) 기준" 라벨 병기 |
| 신규 옵션 빌더 파일 0 | `stackChartOption({orientation:'horizontal'})` 재사용 |
| i18n | `locales/kr|en/teamAnalytics.json` **소스만** 수정 → `cd static/ui && npm run merge` **실행 완료**. `ko-KR.json`/`en-US.json` 에 신규 키 반영 확인(직접 수정 0) |

### i18n 신규 키 (kr/en 동일 집합, 자동 커버리지 테스트 통과)
`metric.allProjects` · `metric.tip.allProjects` · `note.utilColumnAllProjects` ·
`filter.project.{label,active,all,activeNote,allNote}` ·
`chart.projectTeam.{title,desc,basisLabel,info.calc,info.interp,assignedGap,filteredNote,truncated,excludedProjects,unknownEffort,otherTeams,unknownProject,empty}`
→ 기존 `teamAnalyticsI18n.test.js` 가 소스 파일을 스캔해 kr·en 양쪽 존재를 **자동으로** 검증한다(신규 키 20개 전부 통과 확인).

---

## 5. 남은 한계 (정직하게)

1. **배정만 되고 투입이 없는 팀은 #7 에 나오지 않는다.** 전사 `project_team` resolver 가 필요하다(P2 후보). 화면 3곳에 명시했다.
2. **가동률은 여전히 프로젝트 필터에 무반응**(설계 §12 M-1). 배지·마커·안내로 밝혔을 뿐 값을 고치지 못한다 — 분모 `availMd` 재계산은 백엔드 작업이다.
3. **상태 필터는 `statusName` 정규식에 의존**한다. 운영에서 "종결", "Cancelled" 같은 이름을 쓰면 백엔드도 같이 놓친다(프론트만의 결함이 아니며, 대조 테스트가 두 쪽을 함께 묶어 둔다).
4. **렌더 테스트는 없다**(리포에 `@testing-library/react` 부재). 순수 함수 단계에서만 고정했다 — 기존 팀 분석 탭과 같은 한계다.
