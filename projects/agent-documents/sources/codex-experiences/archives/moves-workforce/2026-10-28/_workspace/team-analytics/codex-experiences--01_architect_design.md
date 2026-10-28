# 팀별 분석 확충 (team-analytics) 설계서

작성: 2026-08-03 · 슬러그 `team-analytics` · 선행: RFC-147 팀 개념 도입(P0~P3 완료, 일부 미배포)
범위(**2026-08-03 배치 변경 후**): **A(`/resource` 팀 분석 탭) + C(프로젝트 상세 분석 팀 탭)**
~~B(통합 대시보드 팀 위젯)~~ → **폐기.** 통합 대시보드에서 팀 축을 **제거**하고 자원관리로 옮긴다(§0 D7, §16-5).

> 🔴 **구현자는 §A(규범 부록)부터 읽는다.** §1 이후는 근거·배경이며, 충돌 시 **§A 가 이긴다.**

> 이 문서가 backend / frontend / verifier 의 **단일 진실 원천**이다.
> §3 경계면 계약과 §4 데이터 원천 매핑이 심장이다. 계약을 바꾸려면 이 문서를 먼저 고친다.

---

## 0. 이 설계의 7가지 결정 (요약)

| # | 결정 | 근거 |
|---|---|---|
| **D1** | **신규 resolver 는 `getTeamAnalyticsScope` 단 1개.** 지표는 기존 `getPortfolioDashboard` / `getResourceAnalysisList` / `getProjectCostSummary` 를 그대로 쓴다 | 새 집계 경로를 만들면 `/dashboard`·`/resource`·`/my-page` 와 숫자가 갈린다. 이 리포에서 반복된 사고 |
| **D2** | **"볼 수 있는 팀"은 서버가 판정한다** — `resolveTeamAnalyticsScope(principal)` 단일 함수가 `userPermissionCheck` 와 새 resolver **둘 다**에 값을 공급 | 프론트가 재판정하면 서버와 갈린다. 두 소비처가 같은 함수를 보므로 드리프트 불가 |
| **D3** | **새 권한 키를 만들지 않는다.** `REPORT`(페이지) · `PROJECT_COST`(인건비) · `RESOURCE_MANAGEMENT`\|`USER_MANAGEMENT`\|`TEAM_MANAGEMENT`(전 팀 열람 신호) + `projectScope` 조합으로 판정 | `migrateFrom` 미지정 신설 키는 기존 커스텀 세트 보유자에게 안 보인다(RFC-147 `TEAM_MANAGEMENT` 전례). **단 프리셋은 운영값 보장이 안 되므로 배포 전 KVS 감사가 필수다**(§5-2) |
| **D4** | **기간별 공수 추이는 P1 에서 만들 수 없다.** 스냅샷 `monthly_effort_json` 은 **프로젝트 단위**라 팀으로 분해 불가 → P2 에서 배치에 `members[].monthlyEffort` 추가 | N3-2 가 "데이터가 없는데 스펙이 요구"해서 보류된 것과 같은 함정. 먼저 원천을 확인했다 |
| **D5** | **`/resource` 조직 현황 · `/my-page` 내 팀 분석을 삭제하지 않는다.** 축·권한·**산식**이 다르다. 대신 **컴포넌트와 롤업 함수를 공유**하고, **같은 이름의 다른 지표는 이름을 분리**한다(§2-4, §12-8) | 삭제는 회귀면이 크고, 세 화면은 답하는 질문이 다르다 |
| **D6** 🔴 | **스코프 필터는 집계 *전에* 건다.** `teamMetricsByTeam` / `rollupTeamTree` 가 `scope`(=`allowedTeamKeys`+`includeUnassigned`)를 **필수 인자**로 받고, 미전달 시 **throw** 한다 | 사후 필터는 안 된다 — `rollupTeamTree.js:148-150` 이 **메타에 없는 팀 키를 "알 수 없는 팀" 루트 노드로 복원**하므로, 행을 먼저 거르지 않으면 **비가시 팀이 실제 숫자를 달고 화면에 되살아난다**(외부 검토 #1). 상세 §8-3 |

| **D7** 🔴 | **팀 분석은 통합 대시보드가 아니라 `/resource` 에 둔다** (2026-08-03 사용자 결정). `/resource` 에 **`팀 분석` 탭을 신설**하고 `[인력현황 \| 조직현황 \| **팀 분석** \| 프로젝트배정]` 4탭 구성. 기존 `PortfolioTeamComparison`(B1)은 **제거** | ① **가동률이 프로젝트 필터에 반응하지 않는다(M-1)** — 대시보드의 핵심 조작이 "프로젝트 선택"인데 팀 가동률은 분모가 전 프로젝트 union 이라 재계산 불가다. 초안이 "이 축에서는 필터가 안 먹는다"는 **예외 안내**를 달아야 했던 것 자체가 **화면과 지표가 안 맞는다는 신호**였다 ② **축이 다르다** — 대시보드는 프로젝트가 주인공, 자원관리는 사람이 주인공이고 **팀은 사람 축**이다 ③ 자원관리는 이미 `getResourceOverview` 를 로드하므로 **네트워크 추가 0** |

> **이 설계의 스코프 3층 구조** — 어느 층이 무엇을 막는지 혼동하지 말 것.
> | 층 | 무엇을 막나 | 어디서 |
> |---|---|---|
> | ① `projectScope`(`TEAM_ONLY`) | **데이터 경계** — `projects[]` 자체가 응답에서 빠진다 | 서버 `scopedProjectIds` |
> | ② `costMasked` | **필드 경계** — `salary` 키가 제거된다 | 서버 `canReadCost` |
> | ③ `visibleTeamKeys` | **시야 경계** — 집계 입력 행을 거른다. raw 페이로드는 못 막는다 | 서버 판정 → 프론트가 **집계 전** 적용(D6) |
> ③ 이 데이터 경계가 아니라는 사실과 그 한계는 §12-9 에 그대로 남겨 둔다. **다만 ③ 이 없으면 화면 재출현이라는 실질 결함이 생기므로 D6 은 선택이 아니다.**

---

---

# 📌 §A. 규범 인덱스 (NORMATIVE INDEX)

> **선택: (i) 규범 인덱스** — §A 를 자족적 부록으로 만들지 않는다(3차 검토 묶음 3).
> **이유**: 누락된 계약(어댑터 API·characterization·산식·정적 검사 경로·i18n 키)을 §A 로 복사하면 **같은 규범이 두 곳에 존재**하게 되어, §A 가 애초에 막으려던 드리프트가 되돌아온다. 2차 검토에서 드리프트 4건이 난 원인이 바로 그것이었다.
>
> **규칙**
> 1. **아래 A-0 색인에 이름이 오른 절은 전부 규범(NORMATIVE)이다.** §A 뿐 아니라 그 본문 절도 규범이다.
> 2. 색인에 없는 서술은 **근거·배경**이며 구현을 구속하지 않는다.
> 3. 각 계약은 **정확히 한 절에만** 산다. 다른 곳에 같은 내용이 보이면 그것이 오래된 사본이다 — 색인이 가리키는 절이 맞다.
> 4. 구현자는 **A-0 색인을 체크리스트로 삼아** 해당 절을 모두 읽는다. §A 만 읽고 구현할 수 있다고 주장하지 않는다.

## A-0. 계약 색인 — 이 표의 절이 전부 규범이다

| # | 계약 | **규범 절** | 한 줄 요약 |
|---|---|---|---|
| 1 | `responseWrapper` 스프레드 | **§3-0** | `content` 는 서비스가 `{content:{...}}` 를 반환할 때만 생긴다 |
| 2 | `getTeamAnalyticsScope` 응답 + 불변식 5개 | **§3-1** | 신규 resolver 유일 |
| 3 | 기존 응답 확장 8필드 | **§3-2** | `team.teamAnalyticsScope` · `utilBand` · (P2) 추이 6필드 |
| 4 | grant 변경 없음 | **§3-3** | `getProjectTeams` 확장 철회. 신규 엔트리 1건뿐 |
| 5 | 화면 요소별 데이터 원천 | **§4-A/C** | 원천을 못 대는 요소는 만들지 않는다 |
| 5-a | **차트 × 원천 × 권한 × 신선도 표 · 축 매핑 · 빌더 확장** | **§4-D** | P1 = 5종(레이더 P2) · 축별 권한 열화 |
| 6 | 권한 게이트 표 | **§5-1** | 진입 = `RESOURCE_MANAGEMENT read`(기존 `ResourcePage` 게이트 재사용, 새 게이트 0) |
| 7 | 팀 범위 = UX 범위(책임자 결정) | **§5-1-a** | 타 팀 raw 도달 허용. 서버 집계 P1 미승격 |
| 8 | `resolveTeamAnalyticsScope` 조합표 #1~#10 | **§5-2** | 프리셋 이름 기준 테스트 금지 |
| 9 | 백엔드 처리 순서·캐시 선택 | **§6-2** | `NONE` 은 조회 0회 |
| 10 | P2 배치 월 축·판정 4단계 | **§6-4** | zero-fill 12개월 · `hasTrendSeries` 가 게이트 |
| 11 | **`/resource` 팀 분석 탭** 구성·파이프라인·게이트 | **§7-1** | 스코프는 집계 **전** · 차트 우선 |
| 12 | **통합 대시보드 팀 축 제거** | **§7-2** | B1 삭제 · prop 정리 · `TABS` 무변경 |
| 13 | C 권한 배선 3곳 + 탭 숨김 안 함 | **§7-3** | `ProjectDetailTabs` → `tabs.js` |
| 14 | **어댑터 API 전체 + characterization 10항목** | **§7-3** | 계약 필드명 `isTeamFilterUnavailable` · `isUserError`/`isAnalysisError` 분리 |
| 15 | 쿼리키 | **§7-4** | `teamAnalyticsKeys` 1개만. `resourceAnalysisKeys` 재사용 |
| 16 | `rollupTeamTree` 확장 + throw 범주 | **§8-1** | 기존 6필드 값 동일 + `missing` additive |
| 17 | `teamMetricsByTeam` **산식 + `flatGroups` 정본** | **§8-2** | `delayedEffortMd` 정상 행 `0` · `members: []` 고정 |
| 18 | **null vs 알려진 0 판단 기준** | **§8-2** | 분자만 null 로 만들면 분모까지 잃는다 |
| 19 | 집계 전 필터 강제 + **정적 검사 3경로** | **§8-3** | 기존 3곳은 검사 대상 아님 |
| 20 | **필드 분류 상수 — 유일 정본** | **§8-4** | 가산/비가산/가중. **다른 절의 목록은 설명일 뿐** |
| 21 | dedup 비대칭 표기 + **단일 소속 검증(backend 전용)** | **§8-5** | 인원 3종 분리 표기 · 프론트 헬퍼 금지 |
| 22 | i18n 키 전체 + 전역 치환 금지 | **§10** | `teamAnalytics.json` 신규 + 2파일 추가 |
| 23 | 단계 분할·배포 원자성 | **§11-1/11-2** | P1-a ↔ P1-c/d 원자 |
| 24 | **배포 전 KVS 권한 감사** | **§11-5** | 프리셋은 운영값을 보장하지 않는다 |
| 25 | 미해결·불가 16건 | **§12** | 만들 수 없는 것 |
| 26 | 작업 체크리스트 | **§13** | 단계별 |
| 27 | 검증 포인트 + 테스트 3분류 | **§14** | 무수정/수정허용/신규필수 |

## A-1. 절대 규칙 (요약 — 상세는 위 색인)

1. **스코프 필터는 집계 전에.** `teamMetricsByTeam`/`rollupTeamTree` 는 scope 인자 누락 시 **throw**. (§8-3)
2. **`null` ≠ `0`.** 모르는 값은 `null`, 알려진 0은 `0`. **분자만 `null` 로 만들지 말 것.** (§8-2)
3. **권한 판정은 서버.** `resolveTeamAnalyticsScope` 단일 정의, 소비처 2곳. 프론트 재판정 금지. (§5-2)
4. **`costMasked` 는 fail-close(`!== false`).** (§5-1)
5. **새로 만들지 않는다**: 롤업 함수 · 서버 집계 resolver(P1) · 권한 키 · `projectKeys` · 계층 실인원 헬퍼 · 프론트 밴드 분류기 · `rollupTeamTree` 밴드 옵션.
6. **건드리지 않는다**: 기존 3곳의 `aggregateByTeam` 호출 · `ProjectUserPanel` · `portfolio.json` 의 팀 축 밖 `completion*` 키 · `getResourceAnalysisList`/`getProjectCostSummary` 계약.
7. **차트 원칙**: `null` 을 막대 0 으로 그리지 않는다 · 비율은 Σ/Σ 재계산값을 그대로 받는다 · 팀 미소속을 숨기지 않는다 · **어떤 인원 수(3종 중)를 쓰는지 차트마다 표기** · `theme={isDark ? 'dark' : undefined}` · **`ChartTableToggle` 로 차트↔표 전환 기본 제공**. (§4-D)
8. **새 옵션 빌더 파일을 만들지 않는다** — 기존 9종을 쓰되 **부족하면 additive 확장**한다(`stackChartOption.orientation` · `barChartOption.valueFormatter`). **모든 신규 파라미터는 optional·기본값=현행 동작**이고 기존 호출부·테스트가 무수정 통과해야 한다(§4-D 3절).
9. **필드 분류의 정본은 §8-4 뿐이다.** §8-2 는 산식, §13 은 작업 지시 — 목록이 어긋나 보이면 §8-4 가 맞다.
10. **DoD 는 §A-2.** 못 보이면 다음 단계 금지.

## A-2. 단계별 DoD

| 단계 | **DoD** |
|---|---|
| **P1-a** BE 기반 | 조합표 #1~#10 통과 · `permissionMap.contract.test.js` 통과 · `NONE` 시 조회 0회 · `userPermissionCheck.team.teamAnalyticsScope` 와 `getTeamAnalyticsScope.content.scopeMode` 값 일치 · `memberTeamPairs` accountId 유일성 테스트(§8-5) |
| **P1-b** FE 기반 | characterization 10항목(§7-3) **추출 전/후 동일 통과** · 화면 변화 0 · `teamComparison.test.js` 무수정 통과 · `rollupTeamTree.test.js` 는 공통 helper 에 scope 옵션만 추가(케이스 본문 무변경, 무인자 2케이스만 throw 단언) · 스코프 누출 테스트 통과 · 정적 검사 3경로 |
| **P1-c** `/resource` 팀 분석 탭 | 탭 게이트에 **REPORT 없음**(RESOURCE + `scopeMode`) · REPORT 축만 개별 열화 · 스코프 집계 전 적용 · 인원 **3종 분리 표기** · `null`→**그리지 않음** · 모든 차트 `ChartTableToggle` · 다크모드 · **새 빌더 파일 0** + 확장은 기존 호출부 무수정 통과 · **차트 5종**(레이더 P2) |
| **P1-d** B1 제거 | `PortfolioTeamComparison.jsx` 삭제 · `ComparisonTabs`/`PortfolioDashboardPage` prop 정리 · **`TABS` 배열·기본 선택 무변경** · 포트폴리오 스위트 전수 통과 |
| **P1-e** C | `useProjectResourceMembers` 재사용(어댑터 1벌) · 비용 블록 전체기간 표기 · 비용 탭 무회귀 · 권한 배선 3곳 |
**배포**: 🔴 **P1-c ↔ P1-d 는 같은 배포**(기능 이동이므로 공백이 없어야 한다). P1-e 는 단독 가능. **배포 전 §11-5 KVS 감사 필수.**

---

## 1. 개요 / 영향 범위

### 1-1. 백엔드

| 구분 | 대상 | 내용 |
|---|---|---|
| **신규 도메인** | `src/resolver/teamAnalytics/` | `TeamAnalyticsController.js` + `TeamAnalyticsService.js` (Repository 없음 — 기존 Query/Cache 재사용) |
| **신규 resolver** | `getTeamAnalyticsScope` | 1개 |
| **신규 권한 유틸** | `src/permission/TeamAnalyticsScope.js` | `resolveTeamAnalyticsScope(principal)` — 단일 출처 |
| **기존 응답 확장(additive)** | `userPermissionCheck` | **루트 `team.teamAnalyticsScope`** 추가 (⚠ `content` 래핑 아님 — §3-0) |
| | `getPortfolioDashboard` | `utilization.people[].utilBand` 추가 (P1) / `projects[].members[].monthlyEffort` + 루트 `hasMemberMonthlyEffort`·`trendMonths` 추가 (P2) |
| **기존 grant 확장** | — | **없음.** 초안의 `getProjectTeams` 확장은 철회(§3-3) |
| **배치 확장 (P2)** | `PortfolioAggregator.aggregateOneProject` | 인원×월 공수 산출 + `members_json` 에 동봉 |
| **등록** | `src/index.js` | `CONTROLLER_REGISTRARS` 에 `registerTeamAnalyticsController` 추가 |
| **PermissionMap** | `src/permission/PermissionMap.js` | `getTeamAnalyticsScope` 엔트리 추가 (미등록 시 deny-by-default 로 죽는다) |

**DB 스키마 변경 없음.** MySQL 신규 테이블 0, KVS 신규 엔티티 0, `manifest.yml` storage 변경 0.
P2 는 기존 `portfolio_project_snapshot.members_json`(JSON 컬럼) **내용만** 확장한다 — DDL 무변경.

### 1-2. 프론트

| 구분 | 대상 |
|---|---|
| **신규 탭** | `/resource` → `pages/resource/teamAnalytics/TeamAnalyticsTab.jsx` (**A**). `ResourcePage.jsx` 탭 4개로 확장: `[인력현황 \| 조직현황 \| **팀 분석** \| 프로젝트배정]` |
| **신규 서브탭** | 프로젝트 상세 > 분석 → `constants/tabs.js` `analysisReport.children` 에 `projectTeamAnalysis` (**C**) |
| 🔴 **삭제** | `pages/portfolio/widgets/PortfolioTeamComparison.jsx` — 통합 대시보드에서 팀 축 제거(D7) |
| 🔴 **이동** | `pages/portfolio/utils/teamComparison.js` → **`utils/team/teamMetrics.js`**(테스트 동반). 모듈은 살리고 **소비처만 옮긴다** |
| **수정(정리)** | `pages/portfolio/sections/ComparisonTabs.jsx` · `PortfolioDashboardPage.jsx` — 팀 위젯 렌더·`teamMeta`/`memberTeamMap` prop 제거 |
| **단일 출처(P1-b 완료)** | `utils/team/rollupTeamTree.js` · `utils/team/teamAnalyticsFields.js` — **그대로 유효**, 새 탭이 소비 |
| **어댑터 추출(P1-b 완료)** | `analysisReport/resource/hooks/useProjectResourceMembers` + `resourceMembersAdapter` — C 가 소비 |
| **차트** | `components/chart/echart/options/` **기존 9종 재사용 + additive 확장 2건**(`stackChartOption.orientation`·`barChartOption.valueFormatter`). **새 빌더 파일 0**(§4-D 3절) |
| **쿼리키** | `utils/queryKey/teamAnalyticsKeys.js`(P1-b 완료) + `resourceKeys` 기존 재사용 |
| **스토어** | `stores/usePermissionStore.js` — `getTeamAnalyticsScope()` (P1-a 완료) |

**사이드바 변경 없음** — `/resource` 는 이미 등록돼 있다. 초안의 `/team-analytics` 신규 라우트·사이드바 항목은 **폐기**(D7).

### 1-3. i18n

`locales/kr/teamAnalytics.json` · `locales/en/teamAnalytics.json` **신규** + `portfolio.json` · `projectDetail.json` **추가**.
(`locales/script/*.json` 은 빈 스텁이라 거기 넣으면 merge 에 반영되지 않는다. merge 는 **파일명 = 네임스페이스** — `teamAnalytics.json` → `t('teamAnalytics.…')`)

---

## 2. 사전 조사 결론 — 중복 판정

### 2-1. "이미 구현된 것" 7곳 실코드 확인 결과

| # | 위치 | 실제로 무엇을 하는가 (코드 확인) | 이번 회차 처리 |
|---|---|---|---|
| 1 | `pages/portfolio/widgets/PortfolioTeamComparison.jsx` + `utils/teamComparison.js` | `projects[].members[]` × `memberTeamMap` 로 **평면** 팀 집계 → 4축(가동률/MD/완수율/인건비) TOP10 가로막대. `ComparisonTabs.jsx:66-93` 의 **Resource 탭**에 있어 `REPORT read` 사용자 전원이 본다. 계층 없음 | **하위 함수 `teamMetricsByTeam` 만 추출**(§8-2). 🔴 **위젯은 이동하지 않는다**(§4-B). 축 라벨 "완수율"→"진척률" 문구만 변경 |
| 2 | `pages/resource/organization/OrganizationTab.jsx` | `getResourceOverview.people` + `teamMeta` → `aggregateByTeam` → `rollupTeamTree` → 조직도 + 인원/가동률/밴드. **재무·공수·프로젝트 축 없음** | **유지** (§2-4). `rollupTeamTree` 확장은 **기본값이 현행 동작**이라 무회귀 |
| 3 | `pages/myPage/sections/MyTeamAnalysisPanel.jsx` + `teamAnalysisFields.js` | 팀장 전용. `getMyTeamWorkAnalysis` = **Jira 실시간** 이슈 부하(todo/inProgress/done) + `completionRate = spent/(spent+remaining)` + 가동률. 계층 없음, 재무 없음 | **유지** (§2-4). A 와 **신선도뿐 아니라 완수율 산식 자체가 다르다** → **이름을 분리**(§4-A, §12-8) |
| 4 | `analysisReport/resource/ResourceAnalysisTeamTable.jsx` + `resourceTeamFields.js` | 프로젝트 내 인별↔팀별 토글. `getResourceAnalysisList` + `findProjectusersByProjectId` 조인 행을 `aggregateByTeam` | **재사용** — C 가 **같은 컴포넌트를 import** 한다(재구현 금지) |
| 5 | `pages/projectDetail/cost/CostByRoleLevel.jsx` | role/level/**team** 3-way 축. `getProjectCostSummary.data.byTeam` = `[{key, planned, actual, memberCount}]`. `rawGroups == null` → "집계 전"(`isStale`) | **재사용** — C 가 `axis='team'` 고정으로 같은 컴포넌트를 렌더 |
| 6 | `constants/dashboardTypes.js` `DATA_TYPES.team` | 프로젝트 대시보드 위젯. `getChartDataById` → `getTeamChartData` → `groupByTeamRepository` (SQL `COUNT(*) GROUP BY team_key`). **인원 수만** | **무변경** — 완전히 다른 경로. C 와 겹치지 않는다(C 는 공수/비용 축) |
| 7 | `backoffice/page/team/` | 팀 마스터 CRUD·소속·권한·트리 DnD | **무변경** |

### 2-2. 🔴 만들면 안 되는 것 (중복)

| 만들지 말 것 | 이유 | 대신 쓸 것 |
|---|---|---|
| 새 팀 롤업 함수 | 화면마다 숫자가 갈린다 | `utils/team/aggregateByTeam.js` + `rollupTeamTree.js` |
| 서버 측 팀 집계 resolver (`getTeamMetrics` 류) | 프론트 `teamComparison` 과 이중 계산 → `/dashboard` 와 A 의 숫자가 갈린다 | `getPortfolioDashboard` 재사용 + 프론트 롤업 |
| 새 팀 트리 조회 (`getTeamList` 호출) | **T2** — grant 가 `OR[TEAM_MANAGEMENT r, USER_MANAGEMENT r]` 라 `REPORT` 만 가진 경영진/팀장에게 **항상 거부** | `getTeamAnalyticsScope`(신규) 또는 `getTeamOptions`(grant 에 `REPORT read` 포함) |
| 프론트에서 "볼 수 있는 팀" 재판정 | 서버와 갈린다 | `getTeamAnalyticsScope.visibleTeamKeys` 를 **그대로** 소비 |
| 새 인건비 게이트 판정 | `costMasked` 판정이 N중화된다 | 서버 `canReadCost` / 프론트 `costGating.isCostMasked`(fail-close `!== false`) |
| 프론트 가동률 밴드 분류기 | 서버 `classifyUtilBand` 와 임계값이 어긋나면 같은 값이 화면마다 다른 색 | 서버가 `utilBand` 를 실어 보낸다(§3-2 확장 #3) |
| 새 팀 필터 유틸 | | `utils/team/teamFilter.js` (`TEAM_FILTER_NONE='__NONE__'`) |
| 프론트 팀 수/깊이 리터럴 상수 | **M6** — 이중화하면 드리프트를 테스트가 못 잡는다 | `getTeamAnalyticsScope.content.limits` |

### 2-3. A 를 `/resource` 안에 두면 조직 현황과 겹치는가 — 판정

**같은 페이지의 형제 탭이 됐다(D7). 통합하지 않고 역할을 나눈다.**

| 축 | `조직 현황` 탭(기존) | `팀 분석` 탭(신규) |
|---|---|---|
| 성격 | **조직도** — 트리 + 인원 + 가동률 밴드 + 팀원 명단 | **지표·인사이트** — 차트 중심 |
| 주 표현 | 트리·표 | **차트**(§4-D) |
| 팀 범위 | **전사 고정** | **권한별**(`scopeMode` ALL/LEADING) |
| 답하는 질문 | "우리 조직이 어떻게 생겼나 / 누가 어디 소속인가" | "어느 팀이 문제인가 / 우리 팀이 어떻게 돌아가나" |
| 데이터 | `getResourceOverview` | **같은 `getResourceOverview`** + (REPORT 보유 시) `getPortfolioDashboard` |

🔴 **두 탭이 같은 쿼리를 공유한다** — `ResourcePage` 주석이 밝힌 대로 인력현황·조직현황이 `getResourceOverview` 를 공유하므로, 팀 분석 탭도 **탭 전환 시 네트워크가 발생하지 않는다.**
🔴 **가동률 값이 두 탭에서 반드시 일치한다** — 같은 응답의 같은 `people[].investedMd/availMd` 를 쓰고 롤업도 `rollupTeamTree` 하나다. 초안이 "다른 resolver 지만 같은 KVS rollup 파생이라 일치한다"고 간접 논증하던 것이 **직접 보장**으로 바뀌었다.

**중복 제거 판정**: 조직 현황의 `TeamTreePanel`·밴드 배지·팀원 표는 **그대로 둔다**. 팀 분석 탭은 **표를 복제하지 않고** 차트로 답하며, 드릴다운이 필요하면 조직 현황으로 링크한다(P3).

### 2-4. A 는 `/my-page` 내 팀 분석과 겹치는가 — 판정

**겹치지만 통합 불가.** `getMyTeamWorkAnalysis` 는 `PermissionMap` 상
`{ grants: [], project:'none', teamLead:{ teamTargets:['teamKey'] } }` — **grants 가 비어 있는 팀장 단독 축**이다.

| 호출자 | 가드 결과 | 데이터 결과 |
|---|---|---|
| 비-admin PMO(리더 아님) | `isSatisfied`=false(grants 없음) + `isTeamLeadOver`=false → **`PERMISSION_DENIED`** | — |
| Jira Admin(리더 아님) | `isSatisfied` 가 `principal.isAdmin` 으로 **통과**(`permissionGuard.js:27`) | 서비스가 `principal.leadingScopeTeamKeys`(=`[]`)로 스코프를 잡아 **빈 결과** |

즉 **비-admin 은 구조적으로 차단, admin 은 통과하되 빈 결과**다(초안의 "관리자도 구조적으로 통과 불가"는 부정확했다 — 정정).
어느 쪽도 PMO 에게 임의 팀 분석을 주지 못한다는 결론은 같다. `PermissionMap.js:322-324` 주석이 이미 그 결론을 적어 두었다:

> 관리자에게 임의 팀을 열려면 `grantedBy==='RESOURCE'` 분기가 필요한데, 그것은 "같은 응답이 grant 경로에 따라 다른 행 집합을 반환한다"는 이유로 설계가 스스로 기각한 구조다. → 조직 관리자용 임의 팀 분석이 실요구면 **별도 resolver**로 제공한다.

→ **A 는 배치 스냅샷 기반**(전 팀 대상 가능), **my-page 는 Jira 실시간**(팀장 자기 팀 한정)으로 **역할 분리**를 유지한다.
→ A 에는 이슈 건수(todo/inProgress/done) 축을 **넣지 않는다** — 스냅샷에 없다(§12-2). 넣으려면 P3 의 별도 resolver 가 필요하다.
→ my-page 패널 하단에 "팀 분석에서 더 보기" 링크(P3).

---

## 3. 경계면 계약 (🔴 단일 진실 원천)

### 3-0. 🔴 `responseWrapper` 는 **스프레드**다 — `content` 는 자동으로 생기지 않는다

```js
// src/utils/ResponseWrapper.js:9-14
const result = await fn(req);
return { success: true, ...result };     // ← 스프레드. content 래핑이 아니다
```

| 서비스 반환 | 프론트가 읽는 경로 |
|---|---|
| `{ content: {...} }` (TeamService·ProjectTeamService 관례) | `res.content.xxx` |
| `{ projects, teamMeta, ... }` (PortfolioDashboardService) | `res.projects` |
| `{ pages, team, projectScope, ... }` (PermissionService) | **`res.team`** — `res.content.team` 이 **아니다** |

→ 아래 계약에서 `content.*` 로 적힌 것은 **서비스가 명시적으로 `{content:{...}}` 를 반환하는 경우에 한한다.**
이 리포에서 같은 스프레드 오해로 이미 사고가 났다(프로젝트 목록 상태 간헐 미표시 — `{success,...rest}` 계약).

### 3-1. 신규 resolver

| resolver | 입력 | 응답 shape (success 시, 글자 그대로) | 대응 프론트 훅 / 쿼리키 |
|---|---|---|---|
| `getTeamAnalyticsScope` | `{}` (payload 없음) | 아래 리터럴 | `useTeamAnalyticsScope()` / `teamAnalyticsKeys.scope()` |

```js
// getTeamAnalyticsScope
//   서비스는 반드시 `{ content: {...} }` 를 반환한다(TeamService 관례) →
//   responseWrapper 스프레드 후 프론트는 `res.content.*` 로 읽는다. §3-0 참조.
{
  success: true,
  content: {
    // ── 스코프 판정(서버 소유) ──────────────────────────────────────────
    scopeMode: 'ALL' | 'LEADING' | 'NONE',
    visibleTeamKeys: ['team-uuid-1', 'team-uuid-2'],   // scopeMode==='NONE' → []
    includeUnassigned: true,                            // ALL → true, LEADING/NONE → false
    unassignedCount: 4,                                 // includeUnassigned===false → null (0 아님)

    // ── 팀 트리(가시 팀만, 전위 순회 순서) ─────────────────────────────
    teams: [
      {
        teamKey: 'team-uuid-1',
        id: 'team-uuid-1',              // rollupTeamTree/normalizeTeamMeta 호환 별칭(같은 값)
        name: '개발본부',
        parentTeamKey: null,            // effectiveParentKey — 강등 반영(F1). raw 를 싣지 않는다
        depth: 0,
        leaderAccountId: '5b10a...' ,   // 없으면 null
        leaderName: '홍길동',            // 없거나 조회 실패 시 null
        memberCount: 12,                // 직속 조직 인원 (users.team_key COUNT)
        descendantMemberCount: 30       // 자기 + 후손 조직 인원
      }
    ],

    // ── 표시/진단 메타 ────────────────────────────────────────────────
    myTeamKey: 'team-uuid-2',           // 없으면 null
    leadingTeamKeys: ['team-uuid-2'],   // 직속만 (principal.leadingTeamKeys)
    isTeamLead: true,
    hasCycle: false,
    truncated: false,                   // 팀 수 상한 초과로 잘렸는가
    limits: { maxDepth: 10, maxTeams: 500 },
    membershipBasis: 'CURRENT'          // 현재 소속 기준임을 계약으로 고정(§12-4)
  }
}
```

**계약 불변식 (verifier 검증 대상)**
1. `teams[].teamKey` 집합 ≡ `visibleTeamKeys` 집합 (교집합·차집합 0).
2. `scopeMode === 'NONE'` → `teams: []`, `visibleTeamKeys: []`, `unassignedCount: null`. **에러가 아니다.**
3. `parentTeamKey` 가 `visibleTeamKeys` 밖을 가리키면 **`null` 로 절단**한다(LEADING 스코프에서 상위 본부가 안 보이는데 부모 키만 남으면 프론트가 고아 노드를 루트로 올리며 depth 가 어긋난다). 절단 시 `depth` 도 **가시 트리 기준으로 재계산**한다.
4. `unassignedCount` 는 `includeUnassigned===false` 일 때 **`0` 이 아니라 `null`**(모름 ≠ 없음).
5. `truncated===true` 또는 `hasCycle===true` 이면 화면은 경고를 띄우되 **표를 지우지 않는다**.

### 3-2. 기존 응답 확장 (전부 additive — 기존 필드 1바이트도 바꾸지 않는다)

| # | resolver | 추가 필드 | 값 | 단계 | 소비처 |
|---|---|---|---|---|---|
| 1 | `userPermissionCheck` | **`team.teamAnalyticsScope`** (루트 `team` 아래 — `content` 없음) | `'ALL'\|'LEADING'\|'NONE'` | P1-a | `usePermissionStore` → Sidebar 노출, A 페이지 게이트 |
| 2 | `getPortfolioDashboard` | `utilization.people[].utilBand` | `'idle'\|'normal'\|'over'\|'red'\|'unknown'` | P1-a | B 밴드 분포 위젯, A 밴드 표 |
| 3 | `getPortfolioDashboard` | `projects[].members[].monthlyEffort` | `[{ month:'2026-07', md: 12.5 }]` — **키 부재 = 집계 전 또는 인원 상한 초과** | **P2** | A/B 추이 위젯 |
| 4 | `getPortfolioDashboard` | `projects[].trendReady` · `projects[].hasTrendSeries` · `projects[].trendExcludedReason` | `bool` / `bool` / `null\|'NO_MEMBERS'\|'MEMBER_LIMIT'\|'NOT_AGGREGATED'` — **위젯은 `hasTrendSeries` 만 본다** | **P2** | 기여 프로젝트 선별 |
| 5 | `getPortfolioDashboard` | 루트 `hasMemberMonthlyEffort` | `boolean` — **`hasTrendSeries` 프로젝트가 1개 이상**이면 true | **P2** | 추이 위젯 렌더 게이트(**프론트 재도출 금지**) |
| 6 | `getPortfolioDashboard` | 루트 `trendMonths` | `['2025-09', …, '2026-08']` — **정확히 12개, 오름차순, 현재월 포함**. 게이트가 false 면 `[]` | **P2** | 추이 위젯 X축 (§6-4) |
| 7 | `getPortfolioDashboard` | 루트 `trendCoverage` | `{ totalProjects, contributingProjects, excludedByMemberLimit, excludedByNotAggregated, emptyProjects }` — **`total` 은 0명 제외 모집단**, 앞 3개 합 = total (§6-4) | **P2** | 사유별 제외 안내 |
| 8 | `getPortfolioDashboard` | 루트 `trendUnavailableReason` | `null \| 'NO_MEMBERS' \| 'NOT_AGGREGATED' \| 'MEMBER_LIMIT'` | **P2** | 안내 문구 분기(§6-4) |

```js
// #1 — PermissionService.userPermissionCheckService
//   🔴 서비스가 { pages, team, projectScope, … } 를 반환하고 responseWrapper 가 스프레드한다.
//      프론트 소비 경로는 `res.team.teamAnalyticsScope` — `res.content.team` 이 아니다(§3-0).
team: {
  teamKey, teamName, isTeamLead, leadingTeamKeys, permissionSource,
  teamAnalyticsScope: 'ALL' | 'LEADING' | 'NONE'   // 신규. EMPTY_TEAM_BLOCK 기본값 = 'NONE'
}

// #2 — PortfolioDashboardService.getPortfolioDashboardService (루트 반환, content 없음)
utilization: {
  buckets, totalPeople, avgUtilization, hasWeightedMetrics,
  people: [{ accountId, displayName, util, investedMd, availMd, utilBand }]
  //                                                              ^^^^^^^^ 신규
  //  util === null → utilBand: 'unknown' (0% 로 분류하지 않는다)
}

// #3~#8 (P2) — 루트 직속 + 프로젝트별 플래그
hasMemberMonthlyEffort: true,
trendMonths: ['2025-09','2025-10', …, '2026-08'],   // 12개 고정 축 (게이트 false 면 [])
trendCoverage: { totalProjects:12, contributingProjects:11, excludedByMemberLimit:1, excludedByNotAggregated:0, emptyProjects:2 },
trendUnavailableReason: null,                        // 'NOT_AGGREGATED' | 'MEMBER_LIMIT'
projects: [{
  ...,
  trendReady: true,                                  // 신규: 배치 준비 여부(0명 → true)
  hasTrendSeries: true,                              // 신규: 실제 series 기여 여부 ← 위젯은 이것만 본다
  trendExcludedReason: null,                         // 신규: null|'NO_MEMBERS'|'MEMBER_LIMIT'|'NOT_AGGREGATED'
  members: [{ accountId, displayName, roleKey, levelKey, salary?, effortMd, utilization,
              monthlyEffort: [{ month:'2026-07', md: 12.5 }] }]   // 신규 · 키 부재 허용
}]
```

🔴 **#3 의 부재 규약**: 구 스냅샷에는 이 키가 **없다**. `?? []` 로 채우면 "이 팀은 그 달 공수 0" 이라는 거짓이 된다.
→ 서버가 판정하고 프론트는 **플래그만** 본다(`hasWeightedMetrics` 와 같은 규약). 프론트는 `monthlyEffort` 존재 여부를 스스로 검사하지 않는다.

🔴 **판정 단위는 프로젝트다 (2차 검토 N4).** 초안은 루트 플래그를 `projects.every(...)` 로 정의해 **인원 200명 초과 프로젝트 1개 때문에 전체 추이가 사라지는** 구조였다. 의도가 아니었다.
→ 판정을 프로젝트별로 두고, 추이는 **`hasTrendSeries` 프로젝트만으로** 그린다(§6-4). `contributingProjects < totalProjects` 면 **항상 제외 안내를 띄운다**(잘린 집계를 조용히 보여주지 않는다).

### 3-3. grant 변경 — **`getTeamAnalyticsScope` 축소 1건** (초안의 `getProjectTeams` 확장은 철회)

초안은 C 진입 경로를 위해 `getProjectTeams` grant 에 `['REPORT','read']` 를 더하려 했다. **철회한다.**

**철회 사유(외부 검토 #2 반영)**: C 의 다른 필수 원천 `findProjectusersByProjectId` 는 `R('PROJECT','detail')`(`PermissionMap.js:132`)이라 **REPORT 단독 사용자는 사람↔팀 축 자체를 받을 수 없다.** `getProjectTeams` 만 열어도 C1(담당↔기여 대조)·C4(팀별 인원)가 깨진 채 렌더된다 — "열린 것처럼 보이는데 빈 화면".
→ **C 의 진입 조건을 `REPORT read && PROJECT read` 로 한다**(§7-3). 그러면 `getProjectTeams` 의 현행 grant(`PROJECT read` 포함)로 이미 통과하므로 **grant 변경이 불필요**하다.
→ 부수 효과: §11 의 "구 서버에서 `getProjectTeams` 거부" 위험(외부 검토 #5)도 함께 사라진다.
→ 이 판단은 기존 동작과도 일관된다 — N3-1(인력 분석 팀 토글)이 이미 `findProjectusersByProjectId` 를 쓰므로 **REPORT 단독 사용자는 지금도 팀 축을 쓸 수 없다.** C 만 새 규칙을 만들 이유가 없다.

| resolver | grant | 비고 |
|---|---|---|
| `getTeamAnalyticsScope` | 🔴 **`R('RESOURCE_MANAGEMENT', 'none')` 으로 좁힌다**(P1-a 구현값 `OR[REPORT, RESOURCE_MANAGEMENT, TEAM_MANAGEMENT]` 에서 축소) | 아래 근거 |
| (그 외) | 무변경 | |

**grant 축소 근거 (D7 반영)**
1. **유일한 소비처가 `/resource` 팀 분석 탭**이고, 그 페이지 게이트가 정확히 `RESOURCE_MANAGEMENT read` 다(`ResourcePage.jsx:20`) → **게이트 미러링**(서버 grant = 프론트 진입 게이트).
2. **C 는 이 resolver 를 쓰지 않는다**(§4-C — `getProjectTeams` + 어댑터 + `getProjectCostSummary` 뿐). REPORT 축을 남길 이유가 없다.
3. `TEAM_MANAGEMENT read` 만 가진 백오피스 관리자는 **이 resolver 를 소비할 화면이 없다.**
4. **아직 배포 전이다**(P1-a 는 구현·미배포) → 축소가 breaking 이 아니다. 넓히는 것은 나중에도 안전하지만 좁히는 것은 그렇지 않으므로 **지금 좁힌다.**

⚠ **부수 효과 — 이중 게이트가 사라진다.** `RESOURCE_MANAGEMENT read` 보유자는 대부분 org 신호를 만족(§5-2 조합 #2)하거나 팀장(#4)이라 `scopeMode` 가 `ALL`/`LEADING` 이 된다. `NONE` 은 `MEMBER_ONLY` 스코프 + 비팀장이라는 드문 조합에서만 나온다. **탭 노출 조건은 그대로 `scopeMode !== 'NONE'` 를 쓴다**(fail-close 유지).

### 3-4. 기존 resolver 를 **그대로** 쓰는 것 (변경 0)

| resolver | 쓰는 화면 | 비고 |
|---|---|---|
| `getPortfolioDashboard` | A, B | A 는 `portfolioKeys.dashboard()` 를 **공유**한다 → `/dashboard` 와 캐시 1벌, staleTime 5분 |
| `getTeamOptions` | C (팀 라벨) | grant 에 `REPORT read` 이미 포함 |
| `getProjectTeams` | C | **grant 무변경** — C 가 `PROJECT read` 를 요구하므로(§3-3) |
| `findProjectusersByProjectId` | C | 팀 축(`teamKey`/`teamName`) 제공. `R('PROJECT','detail')` |
| `getResourceAnalysisList` | C | **변경 금지**(KVS 10분 캐시, 팀을 싣지 않는 것이 의도) |
| `getProjectCostSummary` | C | **변경 금지**. `byTeam` 부재 = "집계 전". ⚠ **기간 인자가 없다 — 항상 프로젝트 전체 기간**(§7-3 기간 불일치) |

---

## 4. 화면 요소별 데이터 원천 매핑 (🔴 요소마다 원천을 못 대면 만들지 않는다)

### 4-A. `/resource` > **팀 분석** 탭 (A)

🔴 **주 원천이 바뀌었다(D7)** — `/resource` 는 `getResourceOverview` 를 이미 로드한다.

| 원천 | 게이트 | 제공 | 비고 |
|---|---|---|---|
| **`getResourceOverview`** (인원·가동률 축) | `RESOURCE_MANAGEMENT read` = 페이지 게이트 | `people[]{accountId, teamKey, teamName, roleKey/Name, levelKey/Name, util, utilBand, investedMd, availMd, skills}` · `teamMeta[]` · `bands` · `lastAggregatedAt` | **형제 탭과 캐시 공유 → 이 쿼리만 추가 호출 없음.** 모집단 = **전 `users`** |
| **`getTeamAnalyticsScope`** | `RESOURCE_MANAGEMENT read` | `scopeMode` · `visibleTeamKeys` · `teams[]`(계층 + `memberCount`/`descendantMemberCount`/`leaderName`) · `limits` | **팀 트리·스코프의 정본** |
| `getPortfolioDashboard` (보조) | `REPORT read` — **없으면 조회하지 않는다** | `projects[]{members[], completionRate, diagnosisStatus, riskScore}` · `utilization.people[]` | 공수 MD·인건비·진척률·리스크 축 전용 |

- `memberTeamMap` 은 **`getResourceOverview.people[]` 에서 파생**한다(`accountId → teamKey`). 포트폴리오의 `memberTeamMap` 에 의존하지 않는다 — 같은 `users.team_key` 원천이고, 보조 쿼리 부재 시에도 동작해야 한다.
- 가동률 축의 `utilizationPeople` 입력도 **`getResourceOverview.people[]`** 를 쓴다(`utilBand` 포함, `teamMetricsByTeam` 이 요구하는 shape 과 그대로 호환).
- 🔴 **`getPortfolioDashboard` 부재 시 열화(degrade)**: 공수·인건비·진척률·리스크 차트는 **그리지 않고** `teamAnalytics.needReport` 안내를 띄운다. **0 으로 그리지 않는다.**

| # | 화면 요소 | 데이터 원천 (resolver.필드) | 계산 | 가능 |
|---|---|---|---|---|
| A1 | 팀 선택(좌 트리 또는 셀렉터) | `getTeamAnalyticsScope.content.teams[]` | 그대로 | ✅ P1 |
| A2 | 팀장 이름 | 〃 `teams[].leaderName` | 그대로 | ✅ P1 |
| A3 | **조직 인원** 직속/누적 | 〃 `teams[].memberCount` / `descendantMemberCount` | 서버값 그대로 (`users.team_key` 기준) | ✅ P1 |
| A4 | **프로젝트 참여 인원**(dedup) | `getPortfolioDashboard.projects[].members[].accountId` ∘ `memberTeamMap` | 팀별 `Set<accountId>.size`(=`teamMetricsByTeam.rows[].memberCount`). 계층 누적은 후손 dedup 수의 단순 합 | ⚠ REPORT 필요 |
| A5 | 투입 공수 MD | 〃 `projects[].members[].effortMd` | `Σ` (project×member 행, dedup 안 함) | ✅ P1 |
| A6 | 인건비 | 〃 `projects[].members[].salary` — **`costMasked` 면 키 부재** | `Σ`, `aggregateByTeam` 이 기여 0 → `null` | ✅ P1 (게이팅) |
| A7 | 가동률(가중) | 🔴 **`getResourceOverview.people[].investedMd / availMd`** | `Σinvested / Σavail`. 전사 기준 — **이 화면엔 프로젝트 필터가 없으므로 M-1 예외 안내가 불필요해졌다**(D7 근거 ①) | ✅ P1 |
| A8 | 가동률 밴드 분포 | 🔴 **`getResourceOverview.people[].utilBand`**(서버 `classifyUtilBand`) | 사람 수 카운트(`band*` 합산 필드) | ✅ P1 |
| A9 | **참여 프로젝트 진척률(MD 가중)** | 〃 `projects[].completionRate` × `members[].effortMd` | `Σ(rate×md) / Σmd` (teamComparison 방식) | ✅ P1 |
| A10 | 참여 프로젝트 표 | 〃 `projects[]` (name/status/diagnosisStatus/riskScore) + 팀 기여 MD/인건비/인원 | 팀 소속 멤버가 1명 이상인 프로젝트만 | ✅ P1 |
| A11 | 인원 구성(직무/등급) | 🔴 **`getResourceOverview.people[].roleName/levelName`** | 팀별 카운트(people 이 이미 1인 1행이라 dedup 불필요) | ✅ P1 |
| A12 | 하위 팀 롤업 표 | A3~A9 를 `rollupTeamTree`(확장) 로 계층화 | `direct`/`total` 분리 | ✅ P1 |
| A13 | 리스크 노출 | 〃 `projects[].diagnosisStatus==='delayed'`, `riskScore` | 팀 MD 가중 | ✅ P1 |
| A14 | 집계 시각/상태 | 〃 `lastAggregatedAt`, `aggregateStatus` | 그대로 | ✅ P1 |
| **A15** | **기간별 공수 추이** | ❌ **원천 없음** — `projects[].monthlyEffort` 는 **프로젝트 단위**(멤버 분해 불가) | — | 🚫 **P2** (§6-4) |
| A16 | 팀 스킬 분포 | `getResourceOverview.people[].skills` | 팀별 스킬 태그 빈도 | ✅ **P1 가능해졌다**(D7 — 권한 축이 일치한다). 범위 관리를 위해 **P2 로 둔다** |
| A17 | 팀별 이슈 건수/부하 | ❌ 스냅샷에 없음. `getMyTeamWorkAnalysis` 는 팀장 전용 | — | 🚫 P3 (§12-2) |

🔴 **A3 ≠ A4 다.** 조직 인원(users 기준)과 프로젝트 참여 인원(스냅샷 기준)은 **거의 항상 다르다**.
한 숫자로 합치면 `/resource` 조직 현황과 A 가 다른 인원을 보여준다. **두 값을 각각 라벨과 함께** 낸다:
`teamAnalytics.metric.orgMembers` / `teamAnalytics.metric.activeMembers`.

🔴 **A9 를 "완수율"이라 부르지 않는다 (외부 검토 #8).** `/my-page` 의 "완수율"과 **산식과 의미가 다르다**:

| 화면 | 산식 | 코드 | 의미 |
|---|---|---|---|
| **A9** | `Σ(프로젝트 진척률 × 팀 MD) / Σ팀 MD`<br>프로젝트 진척률 = `Σ(이슈진행률 × plannedSec)/Σ plannedSec` | `ProgressCalculator.computeCompletion` (`issueProgress`: done=1, inProgress=min(actual/planned,1), todo=0) | **계획 공수 기준 진척** |
| `/my-page` | `spent / (spent + remaining)` | `WorkAssignmentRules.computeCompletionRate` | **잔여 추정 기준 소진** |

같은 팀·같은 시점에도 **정상적으로 다른 값**이 나온다. 신선도 안내(`liveDiffers`)로는 덮이지 않는다.
→ **A = `teamAnalytics.metric.progressRate` "참여 프로젝트 진척률(MD 가중)"**, `/my-page` 는 현행 "완수율" 유지.
→ B 의 `PortfolioTeamComparison` 축 라벨(`portfolio.teamCompare.axis.completionRate` = "완수율")은 **A9 와 같은 산식**이므로 함께 "진척률"로 바꾼다(문구만 변경, 계산·키 불변).

### 4-B. ~~`/dashboard` 팀 서브탭~~ → **폐기. 통합 대시보드에서 팀 축을 제거한다** (D7)

| 구 위젯 | 처리 |
|---|---|
| B1 `PortfolioTeamComparison` | 🔴 **삭제**. 지표는 팀 분석 탭의 `TeamCompareBar`(§4-D #2)로 **이동** |
| B2 팀 계층 롤업 표 | 팀 분석 탭으로 이동(§4-D #5) |
| B3 밴드 분포 | 팀 분석 탭으로 이동(§4-D #1) |
| B4 리스크 노출 | 팀 분석 탭으로 이동(§4-D #4) |
| B5 팀 추이(P2) | 팀 분석 탭으로 이동(§4-D #7) |
| 서브탭 신설 | **취소.** `ComparisonTabs.TABS` 는 4개 그대로 → **인덱스·기본 선택 영향 0** |

**정리 작업**(§7-2): `PortfolioTeamComparison.jsx` 삭제 · `ComparisonTabs` 의 렌더 블록/`WidgetCard`/import/`teamMeta`·`memberTeamMap` prop 제거 · `PortfolioDashboardPage.jsx:175-176` prop 전달 제거.
**백엔드 `teamMeta`/`memberTeamMap` 응답 필드는 유지**한다 — 소비처가 사라져도 제거는 계약 축소이고 `emptyShape` 루트 키 1:1 규약을 흔든다. §12-12 에 **고아 필드**로 등재하고 P3 정리 후보로 남긴다.

---

### 4-D. 🔴 차트 목록 (사용자 요구: "인사이트를 **차트로**")

**표는 차트의 보조·드릴다운이다.** 모든 차트는 `ChartTableToggle` 로 표 전환을 기본 제공한다.

#### (1) 차트 × 원천 × 권한 × 신선도 × 호출 (🔴 정본)

| # | 차트 | 타입 | **resolver** | **요구 권한** | **신선도** | **추가 호출** |
|---|---|---|---|---|---|---|
| 1 | 팀별 가동률 분포 | 누적 막대(**가로**) | `getResourceOverview` | RESOURCE | `util`·`investedMd`·`availMd`·`utilBand` = **일 1회 배치**(KVS rollup 파생) / 인원·소속 = **실시간 SQL** | **없음**(형제 탭과 캐시 공유) |
| 2 | 팀 간 지표 비교 | 가로 막대 + 축 셀렉터 | 축에 따라 `getResourceOverview` **또는** `getPortfolioDashboard` | 축별 상이(아래 2절) | 축별 상이 | REPORT 축 선택 시 **portfolio 1회** |
| 3 | 팀별 인력 구성 | 누적 막대(세로) | `getResourceOverview` | RESOURCE | **실시간 SQL**(role/level 은 `users` 컬럼) | 없음 |
| 4 | 가동률 vs 규모 | 산점도 | `getResourceOverview` (+버블 크기만 `getPortfolioDashboard`) | x·y = RESOURCE / **버블 크기 = REPORT** | x·y = 일 배치 + 실시간 혼합 | 버블 크기 쓸 때만 |
| 5 | 팀 계층 롤업 | 표 + 가로 막대 | `getTeamAnalyticsScope` **⨝** `getResourceOverview` (+선택적 portfolio) | RESOURCE(+REPORT 열은 조건부) | 트리·조직인원 = **실시간 SQL**(`countUsersByTeam`) / 팀 마스터 = **60초 캐시** / 가동률 = 일 배치 | **scope 1회**(탭 전용) |
| ~~6~~ | ~~팀 프로필 레이더~~ | — | — | — | — | 🔴 **P1 제외**(2절) |
| 7 | 팀별 공수 추이 | 다중 선 | `getPortfolioDashboard` | **REPORT** | 일 1회 배치 | portfolio 1회 |

🔴 **초안의 3개 서술을 정정한다 (5차 검토 조건 3)**
| 초안 | 사실 |
|---|---|
| "탭 전환 네트워크 **0**" | ❌ `getResourceOverview` 만 공유다. **`getTeamAnalyticsScope` 는 이 탭 전용 추가 호출**이고, REPORT 축을 쓰면 `getPortfolioDashboard` 도 추가된다. → **"인원·가동률 축은 추가 호출 없음"** 이 정확한 표현 |
| "전체가 일 1회 배치 기준" | ❌ **혼합**이다. 가동률·공수·비용은 일 배치, **인원·소속·직무·등급·조직 계층은 실시간 SQL**, 팀 마스터는 60초 캐시. → 화면에 `note.aggregatedAt`(배치 시각)을 **가동률·공수 차트에만** 붙이고, 인원 차트에는 붙이지 않는다 |
| "주 원천을 `getResourceOverview` 로 **교체**" | ❌ **혼합 원천**이다. 교체가 아니라 **축별 분담**이다(위 표) |

#### (2) 범위 변경 — B4 소비처 확정 · 레이더 제외

🔴 **B4(리스크)의 실제 소비 차트를 확정한다.** 초안 §4-B 는 "B4 → #4" 라고 적었으나 **#4 는 가동률 vs 규모 산점도**라 리스크가 들어갈 자리가 없었다(5차 검토 조건 2).
→ **B4 는 #2 팀 간 비교의 축**으로 소비한다. `teamComparison()` 이 이미 축 셀렉터·TOP N·`기타` 묶음을 갖고 있어 새 차트가 필요 없다.

**#2 축 매핑 (정본)**

| 축 키 | 라벨 | 원천 | 요구 권한 | 종류 |
|---|---|---|---|---|
| `utilization` | 가동률 | `getResourceOverview.people[]` | RESOURCE | 비율(Σ/Σ) |
| `utilMemberCount` | 가동률 산출 인원 | 〃 | RESOURCE | 합계 |
| `effortMd` | 투입 공수(MD) | `getPortfolioDashboard` | **REPORT** | 합계 |
| `salary` | 인건비 | 〃 | **REPORT** + `PROJECT_COST`(`costMasked`) | 합계 |
| `completionRate` | 진척률 | 〃 | **REPORT** | 비율(Σ/Σ) |
| `delayedShare` | **지연 노출** (구 B4) | 〃 | **REPORT** | 비율(Σ/Σ) |
| `riskScoreWeighted` | **리스크 점수**(MD 가중, 구 A13) | 〃 | **REPORT** | 비율(Σ/Σ) |

- `REPORT` 미보유 → 위 표의 REPORT 축 **5개를 셀렉터에서 제거**. 남는 기본 축은 `utilization`.
- `costMasked` → `salary` 축 추가 제거(기존 `availableTeamAxes`/`resolveTeamAxis` 그대로).
- 🔴 **기본 축 폴백을 고친다**: 현행 `TEAM_AXIS_FALLBACK = 'effortMd'` 는 REPORT 축이라 resource-only 사용자에게 **빈 차트**가 된다. → `resolveTeamAxis(axis, { costMasked, hasReport })` 로 확장해 `hasReport === false` 면 **`utilization`** 으로 폴백한다.

🔴 **#6 팀 프로필 레이더 — P1 에서 제외한다.** 계약이 불완전했다: "완수 규모" 필드·산식 미정, **4축 정규화 기준**(단위가 서로 다른 축을 0~1로 어떻게 맞추는가) 미정, **리스크 역변환**(낮을수록 좋음) 미정, **`null` 축 처리**(레이더는 축 하나가 비면 도형이 왜곡된다) 미정.
→ **P2 로 이관**하고, 올릴 때 위 4가지를 먼저 채운다. `radarChartOption` 은 `indicators`+`seriesData` 만 받고 정규화·null 처리를 **하지 않으므로**(`radarChartOption.js:1`) 소비처가 전부 책임져야 한다.
→ **P1 차트는 #1·#2·#3·#4·#5 의 5종**이다.

#### (3) 🔴 옵션 빌더 — "신규 빌더 0" 은 유지하되 **additive 확장이 필요하다**

초안의 "기존 9종이 **현재 API 그대로** 커버한다"는 **거짓이었다**(5차 검토 조건 2). 실제 코드:

| 빌더 | 현재 한계 | 필요한 **additive** 확장 |
|---|---|---|
| `stackChartOption` | `xAxis:{type:'category'}` / `yAxis:{type:'value'}` **세로 고정**(`:31-40`). #1 은 팀명이 길어 **가로**여야 한다 | `orientation: 'vertical' \| 'horizontal'`(기본 `'vertical'`) — `horizontal` 이면 x/y 축 정의를 맞바꾼다. `normalize` 의 `max`/`axisLabel` 도 값축을 따라간다 |
| `barChartOption` | tooltip 이 `t('dashboard.barChart.count')` **단위 고정**(`:22`)이라 MD·원·% 를 "건수"로 표시한다. `series` 도 `stack:'total'` + 인덱스 팔레트 고정 | `valueFormatter?: (v) => string`(미전달 시 현행 `count` 문구 유지) + `orientation` |
| `radarChartOption` | 정규화·null 처리 없음 | (P1 미사용 — P2 에서 판단) |
| `scatterChartOption` | 그대로 사용 가능 | 없음 |
| `lineChartOption` | P2 에서 판단 | — |

**확장 조건 (필수)**
1. **모든 신규 파라미터는 optional 이고 기본값이 현행 동작**이다 → 기존 호출부 **1바이트도 바뀌지 않는다.**
2. 기존 소비처(대시보드 위젯·프로젝트 대시보드)의 스냅샷/렌더 테스트가 **무수정 통과**해야 확장이 끝난 것이다.
3. 그래도 **파일은 새로 만들지 않는다** — "신규 옵션 빌더 0" 원칙은 유효하다.

#### (4) 차트별 상세 계약

**#1 팀별 가동률 분포** — `stackChartOption({ orientation:'horizontal', normalize })`. series = `bandIdle/bandNormal/bandOver/bandRed/bandUnknown` 5개. 모집단 = **가동률 산출 인원**(`utilMemberCount`), 불변식 `Σband* === utilMemberCount`.

**#2 팀 간 지표 비교** — `barChartOption({ orientation:'horizontal', valueFormatter })`. 데이터는 `teamComparison(...)` 결과(`categories`/`values`) 그대로. `valueFormatter` 는 축 종류별로: 비율 → `%`, `effortMd` → `MD`, `salary` → `formatCurrency`, 카운트 → 명.

**#3 팀별 인력 구성** — `stackChartOption`(세로 유지). 직무/등급 토글. 모집단 = **조직 인원**(`getResourceOverview.people[]` 는 1인 1행이라 dedup 불필요).

**#4 가동률 vs 규모** — `scatterChartOption({ xType:'value' })`. x = `utilMemberCount`, y = `utilization`, **버블 크기 = `effortMd`**.
🔴 **REPORT 미보유 시 열화 방식 = 고정 크기**(차트를 숨기지 않는다). x·y 가 RESOURCE 원천이라 인사이트("인원 대비 가동률 이상치")가 그대로 성립하기 때문이다. 크기 범례를 숨기고 `teamAnalytics.needReport.bubble` 안내를 단다.

**#5 팀 계층 롤업** — 표(`CommonTable`) + 가로 막대.
🔴 **`rollupTeamTree` 만으로 인원 3종을 만들 수 없다.** 조직 인원은 `getTeamAnalyticsScope.content.teams[]` 의 `memberCount`/`descendantMemberCount` 에만 있고 `flatGroups` 에는 없다 → **`teamKey` 로 별도 조인**한다.

| 컬럼 | 값 | 출처 |
|---|---|---|
| 팀(들여쓰기) | `node.teamName`, `node.depth` | `rollupTeamTree` |
| 조직 인원 直/累 | `teams[].memberCount` / `descendantMemberCount` | 🔴 **scope 조인**(rollup 아님) |
| 참여 인원 直/累 | `direct.memberCount` / `total.memberCount` | `rollupTeamTree` |
| 가동률 산출 인원 | `direct/total.utilMemberCount` | 〃 |
| 가동률 | `direct/total.utilization` | 〃 (Σ/Σ) |
| 투입 MD · 인건비 · 진척률 | `direct/total.effortMd` · `salary` · `completionRate` | 〃 — **REPORT 미보유 시 컬럼 제거** |

⚠ 조직 인원(실시간 SQL)과 나머지(일 배치)는 **신선도가 다르다** → 헤더에 기준을 표기한다.

#### (5) 공통 규약

- `null`(집계 전) → **시리즈에서 제외**하고 하단에 `partialSeries` 안내. **0 막대로 그리지 않는다.**
- 비율 축은 이미 Σ/Σ 로 낸 값을 **그대로** 넘긴다(차트에서 평균 내지 않는다).
- 팀 미소속은 **마지막 항목**으로 표시(`team.unassigned.label`).
- `theme={isDark ? 'dark' : undefined}` — `useColorMode()`.
- 각 차트 헤더에 **인원 기준 배지**(조직/참여/가동률 산출)와, 배치 파생 축에는 **집계 시각**.
- 🔴 **트리맵/선버스트 미도입** — 신규 빌더가 필요하고 계층 표현은 조직 현황 탭 트리가 담당한다.

---

### 4-C. 프로젝트 상세 > 분석 > 팀 (C)

**진입 조건: `REPORT read` && `PROJECT read`** (§3-3 철회 사유 참조).

| # | 요소 | 데이터 원천 | 기간 기준 | 신규/재사용 |
|---|---|---|---|---|
| C1 | **담당 팀 ↔ 기여 팀 대조표** | `getProjectTeams.content.teams[]`(담당) ⨝ 공용 어댑터 결과(기여) | 선택 기간 | **신규 인사이트** (지금 어디에도 없다) |
| C2 | 팀별 공수 롤업 표 | `ResourceAnalysisTeamTable` + **공용 어댑터 `useProjectResourceMembers`**(§7-3) | 선택 기간 | 재사용 |
| C3 | 팀별 비용 | `CostByRoleLevel` + **신규 `fixedAxis='team'` prop**(`getProjectCostSummary.byTeam`) | 🔴 **프로젝트 전체 기간** | 재사용 · `PROJECT_COST` 게이팅 |
| C4 | 팀별 인원 | 공용 어댑터의 `members[].teamKey` dedup 카운트 | 선택 기간 | 재사용 |
| C5 | 담당인데 기여 0 / 기여했는데 미담당 | C1 파생 배지 | 선택 기간 | 신규 |
| C6 | 담당 팀 미준비 안내 | `getProjectTeams.content.assignmentReady === false` | — | 재사용(`team.project.notReady`) |

C1 의 값: **"배정과 실제가 어긋나는 지점"** — 담당 팀 배정(`project_team`)과 실제 워크로그 기여(팀 롤업)를 나란히 놓는 화면은 현재 없다. 이것이 C 를 만들 유일한 정당화다.

🔴 **C3 의 기간 기준이 나머지와 다르다 (외부 검토 #7).**
`getProjectCostSummaryService({ projectId, coworkerFieldId })` 는 **기간 인자를 받지 않고** `getResourceProjectWorklogs({ projectId })` 를 날짜 없이 호출한다(`ProjectCostService.js:67-109`) → **항상 프로젝트 전체 기간**.
반면 C1/C2/C4 는 사용자가 고른 기간이다. 같은 화면에 서로 다른 기간 기준 값이 나란히 놓인다.
**대응(P1)**: 비용 블록을 **시각적으로 분리**하고 헤더에 기간을 명시한다 — `projectDetail.analysis.team.cost.wholePeriod` = "프로젝트 전체 기간({start} ~ {end}) 기준". 기간 필터가 이 블록에 **적용되지 않음**을 함께 표기.
**기간형 비용 집계는 이번 범위 밖**이다(§12-13) — `getProjectCostSummary` 에 기간 인자를 넣으면 캐시 키·EVM·budget 계열 전체가 영향받아 회귀면이 C 를 넘는다.

---

## 5. 권한 게이트 표

### 5-1. 화면/필드 × 권한 키 × 서버 판정 위치

| 화면/필드 | 프론트 표시 게이트 | **서버 판정 위치(최종)** | 실패 시 |
|---|---|---|---|
| `/resource` 페이지 진입 | `canRead('RESOURCE_MANAGEMENT')` — **기존 `ResourcePage.jsx:20` 게이트 재사용. 새 게이트 0** | 각 resolver grant | `NoPermissionPage` |
| **팀 분석 탭 노출** | `teamAnalyticsScope !== 'NONE'` (`userPermissionCheck` 가 실어 보냄) | `resolveTeamAnalyticsScope(principal)` | 탭 미노출 |
| ~~A 사이드바 항목~~ | **폐기** — `/resource` 는 이미 사이드바에 있다(D7) | — | — |
| A 보이는 팀 집합 | `content.visibleTeamKeys` **그대로 사용(재판정 금지)** + **집계 전 필터(D6)** | `TeamAnalyticsService` | 빈 트리 + `teamAnalytics.empty.noScope` |
| 팀 분석 탭의 **REPORT 원천 차트/축** | `canRead('REPORT')` — 없으면 **조회 자체를 안 한다** | `getPortfolioDashboard` = `R('REPORT','list')` + `scopedProjectIds` | **해당 차트/축만** 미렌더 + `teamAnalytics.needReport` |

🔴 **REPORT 는 탭 게이트가 아니다 — 차트 단위 게이트다 (5차 검토 조건 1).**
`/resource` 는 `RESOURCE_MANAGEMENT read` 로 열린다. 여기에 REPORT 전면 게이트를 두면 **페이지 진입 권한과 충돌**한다.
**규약**:
1. **탭 진입** = `RESOURCE_MANAGEMENT read`(페이지 게이트) **&&** `scopeMode !== 'NONE'`. **REPORT 는 보지 않는다.**
2. `REPORT` 미보유자도 **가동률·밴드·인원·조직 계층 차트는 전부 정상**으로 본다(원천이 `getResourceOverview`·`getTeamAnalyticsScope`).
3. `REPORT` 원천 축(`effortMd`·`salary`·`completionRate`·`delayedShare`·`riskScoreWeighted`)은 **축 셀렉터에서 제거**하고, 그 축만 쓰는 차트는 렌더하지 않는다. 자리에 `teamAnalytics.needReport`.
4. **혼합 차트는 열화한다**(제거하지 않는다) — §4-D #4 산점도는 x·y 가 RESOURCE 원천이라 살아 있고 **버블 크기만 고정**된다.
5. 게이팅 판정은 `canRead('REPORT')` **한 곳**에서 하고 차트들은 그 결과를 prop 으로 받는다(지점마다 재판정 금지 — `costGating` 과 같은 원칙).
| A/B **인건비 축** | `costGating.isCostMasked(data) !== true` (**fail-close `!== false`**) | `canReadCost(principal)` → `costMasked` + `members[].salary` **키 제거** | 축 제거 + MD 폴백(`TEAM_AXIS_FALLBACK`) |
| A 전사 비교/순위/비중 | `scopeMode === 'ALL'` 일 때만 렌더 | 〃 (프론트 렌더 게이트) | 팀장에게 전사 총액 미노출 |
| ~~B 팀 서브탭~~ | **폐기**(D7) — 통합 대시보드에서 팀 축 제거 | — | — |
| C 팀 서브탭 | `canRender: () => canReadReport && canReadProject` (`tabs.js`) | `getResourceAnalysisList`=`R('REPORT','detail')`, `findProjectusersByProjectId`·`getProjectTeams`=`PROJECT read` | `NoPermissionPage` |
| C 비용 블록 | `canRead('PROJECT_COST')` | `getProjectCostSummary` = `R('PROJECT_COST','detail')` | 블록 미렌더 |

### 5-1-a. 🔴 책임자 결정 — `visibleTeamKeys` 는 UX 범위이지 보안 경계가 아니다 (2026-08-03 확정)

> **결정**: 팀 범위는 **화면 편의(UX)** 다. 다른 팀의 raw 데이터가 브라우저에 도달하는 것은 **허용된다.**
> **근거**: 그 데이터는 이미 `scopedProjectIds` 로 걸러진 **조회 권한이 있는 프로젝트**의 것이다. 새 노출면이 아니다.
> **결론**: **서버 집계형 resolver 를 P1 으로 승격하지 않는다.**
>
> ⚠ **전제가 바뀌면 재검토한다.** "팀장은 타 팀 raw 도 못 본다"가 실요구가 되면 → **P2-조건부 승격 + 프론트 롤업 제거**(두 벌 공존 금지). 이 조건은 §11 에 유지한다.

**이 결정을 여기 적어 두는 이유**: 다음 사람이 "왜 서버가 아니라 프론트에서 거르나"를 다시 묻지 않게 하기 위해서다. 재논의하려면 위 전제부터 뒤집어야 한다.

**정확한 노출 범위 (초안 문구 정정 — 2차 검토)**
초안은 "오늘도 `PortfolioTeamComparison` 이 `REPORT read` 사용자 전원에게 **전 팀** 집계를 보여준다"고 썼다. **부정확하다.**
정확히는 **"`scopedProjectIds` 가 적용된 `projects[]` 에 참여한 팀들"** 이다 — `teamComparison.js:102-131` 이 팀 집합을 `projects[].members[]` 에서만 파생하기 때문이다(§H-2 3층 규칙).
`TEAM_ONLY` 사용자는 자기 팀 프로젝트만 받으므로 거기 참여한 팀만 본다. **전사가 새는 것이 아니다.**

**다만 `teamMeta` · `memberTeamMap` · `utilization.people[]` · `problemIssues` 는 `scopedProjectIds` 를 타지 않는 전사 데이터**다(`PortfolioDashboardService.js:134-150`, `207-270`). 이것이 위 결정이 "허용한다"고 말하는 대상이다.

**서버 집계형을 올리지 않는 기술적 근거(결정과 별개로 유효)**: 올리면 `aggregateByTeam`/`rollupTeamTree`/`teamComparison` 로직이 서버에 **두 번째로** 존재하게 되어 D1 이 막으려는 바로 그 분기(같은 팀이 화면마다 다른 숫자)를 만든다.

**그러나 이 한계를 "인정"으로 덮지 않는다.** 필터를 집계 *후*에 걸면 raw 노출과 별개로 **화면 재출현**이라는 실질 결함이 생긴다(§8-3). 그래서 D6 은 결정과 무관하게 필수다.

### 5-2. `resolveTeamAnalyticsScope(principal)` — 판정 규칙 (신규 단일 함수)

```js
// src/permission/TeamAnalyticsScope.js  (신규)
// 반환: 'ALL' | 'LEADING' | 'NONE'
//
//  1) principal.isAdmin                                             → 'ALL'
//  2) (TEAM_MANAGEMENT.read || USER_MANAGEMENT.read || RESOURCE_MANAGEMENT.read)
//     && principal.projectScope === 'ALL'                           → 'ALL'
//  3) principal.isTeamLead === true                                 → 'LEADING'
//  4) 그 외                                                          → 'NONE'  (fail-close)
```

**왜 `REPORT read` 만으로 'ALL' 을 주지 않는가**: 시드 `Member` 세트가 `REPORT read=true` + `projectScope='ALL'` 이다. `REPORT` 기준으로 열면 **전 사용자가 전 팀의 공수·가동률·진척·리스크 등 운영 지표를 보게 된다.**
(⚠ 인건비는 이 경로로 새지 않는다 — 시드 `Member` 는 `PROJECT_COST read=false` 라 서버 `canReadCost` 가 `costMasked:true` 를 내고 `members[].salary` 키 자체를 제거한다. 초안의 "전 팀 인건비를 본다"는 근거는 **틀렸다** — 외부 검토 #10a 반영. **결론(REPORT 로 열지 않는다)은 유지**한다.)
**왜 org 신호에 `projectScope==='ALL'` 조건을 다는가**: 프리셋 `Team Lead` 가 `RESOURCE_MANAGEMENT read` 를 **갖고 있다**(WORKFORCE RO). 이 조건이 없으면 팀장이 전 팀으로 승격된다.

#### 판정 조합표 (🔴 프리셋 이름이 아니라 **입력 조합**이 계약이다)

`resolveTeamAnalyticsScope` 는 **`resourceMap` · `projectScope` · `isTeamLead` 세 입력만** 본다. 계약 테스트는 이 조합을 고정한다:

| # | orgSignal(`TEAM_MGMT`\|`USER_MGMT`\|`RESOURCE_MGMT` read) | `projectScope` | `isTeamLead` | `isAdmin` | **판정** |
|---|---|---|---|---|---|
| 1 | — | — | — | ✅ | **ALL** |
| 2 | ✅ | `ALL` | ❌ | ❌ | **ALL** |
| 3 | ✅ | `ALL` | ✅ | ❌ | **ALL** |
| 4 | ✅ | `TEAM_ONLY` | ✅ | ❌ | **LEADING** |
| 5 | ✅ | `TEAM_ONLY` | ❌ | ❌ | **NONE** |
| 6 | ✅ | `MEMBER_ONLY` | ❌ | ❌ | **NONE** |
| 7 | ❌ | `ALL` | ✅ | ❌ | **LEADING** |
| 8 | ❌ | `ALL` | ❌ | ❌ | **NONE** |
| 9 | ❌ | `TEAM_ONLY` | ❌ | ❌ | **NONE** |
| 10 | `principal` 자체가 `null`/누락 | — | — | — | **NONE** (fail-close) |

#### 초기 기본값 기준 프리셋 예시 — ⚠ **운영값 보장이 아니다**

| 세트 | orgSignal | projectScope | isTeamLead | 조합 # | 판정 |
|---|---|---|---|---|---|
| Jira Admin | — | ALL | — | 1 | ALL |
| 시드 `Admin` | ✅ | ALL | — | 2 | ALL |
| 프리셋 `PM` | ✅ | ALL | ❌ | 2 | ALL |
| 프리셋 `PMO` | ✅ | ALL | ❌ | 2 | ALL |
| 프리셋 `Team Lead` | ✅ | TEAM_ONLY | ✅ | 4 | LEADING |
| 프리셋 `Team Member` | ❌ | TEAM_ONLY | ❌ | 9 | NONE |
| 시드 `Member` | ❌ | ALL | ❌ | 8 | NONE |

🔴 **이 표를 "운영 설치의 보장"으로 읽지 말 것 (외부 검토 #3).** 코드 근거:
1. **프리셋 4종은 `edit: true` 이고 최초 1회만 생성된다** — `addPresetPermissionSeed` 가 원장(`PRESET_LEDGER_KEY`)에 기록된 세트를 **다시 만들지 않고**, 이미 존재하면 **덮어쓰지 않는다**(`SeedData.js` ①②③). 조직이 `Team Lead` 의 `projectScope` 를 `ALL` 로 바꿔 두었다면 그 팀장은 **`ALL` 이 된다.**
2. **시드 `Member` 의 `projectScope` 도 기존 저장값을 보존한다** — `normalizeScope(existingMember?.projectScope)`.
3. **`isTeamLead` 는 권한 세트가 아니라 `team.leaderAccountId` 관계에서 나온다**(`PrincipalResolver.js:102-129`). 어떤 세트를 쓰든 팀장이면 `LEADING` 이상이다.

→ **계약 테스트는 조합표(#1~#10)만 고정한다.** 프리셋 표는 문서용 예시이며 테스트로 만들지 않는다.
→ **배포 전 KVS 권한 세트 감사가 필수다**(§11-5). 실제 설치의 `pages × projectScope` 를 뽑아 누가 `ALL` 이 되는지 확인한 뒤 배포한다.

**조직이 더 넓히고 싶으면**: 해당 권한 세트에 `RESOURCE_MANAGEMENT read` 를 주고 `projectScope` 를 `ALL` 로 둔다. 배포 공지에 명시(§11-4).

### 5-3. 판정 소비 경로 (드리프트 불가 구조)

```
resolveTeamAnalyticsScope(principal)     ← src/permission/TeamAnalyticsScope.js (유일 정의)
        ├─→ userPermissionCheckService  → 루트 team.teamAnalyticsScope   → usePermissionStore → Sidebar/페이지 게이트
        └─→ TeamAnalyticsService        → content.scopeMode / visibleTeamKeys → A·B 화면 데이터
```
두 소비처가 같은 함수를 호출하므로 "메뉴는 보이는데 데이터는 비어 있다" / 그 반대가 **구조적으로 발생할 수 없다.**
계약 테스트로 두 응답의 `scopeMode` 일치를 고정한다.

---

## 6. 백엔드 설계

### 6-1. `src/permission/TeamAnalyticsScope.js` (신규 · 순수 함수 · I/O 없음)

```
export const TEAM_ANALYTICS_SCOPES = Object.freeze(['ALL', 'LEADING', 'NONE']);
export const resolveTeamAnalyticsScope = (principal) => 'ALL'|'LEADING'|'NONE'   // §5-2 규칙
export const ORG_WIDE_RESOURCES = Object.freeze(['TEAM_MANAGEMENT','USER_MANAGEMENT','RESOURCE_MANAGEMENT']);
```
- `principal` 이 `null`/`undefined` → `'NONE'` (fail-close, `canReadCost` 와 같은 원칙).
- **리터럴 삼항을 다른 파일에 복제 금지** — `ProjectScope.js` 의 C2 사고와 같은 계열. 정적 계약 테스트로 감시.

### 6-2. `src/resolver/teamAnalytics/` (신규 도메인)

**`TeamAnalyticsController.js`**
```
import { guardedDefine } from '../../permission/permissionGuard';
export function registerTeamAnalyticsController(resolver) {
    guardedDefine(resolver, 'getTeamAnalyticsScope', ({ principal }) =>
        getTeamAnalyticsScopeService(principal));
}
```
→ `src/index.js` 의 `CONTROLLER_REGISTRARS` 에 추가(§1-1). 계약 테스트가 이 배열을 순회하므로 **여기 한 곳만** 고친다.

**`TeamAnalyticsService.js`** — `getTeamAnalyticsScopeService(principal)`

처리 순서:
1. `scopeMode = resolveTeamAnalyticsScope(principal)`.
   `'NONE'` → **조회 없이** 빈 shape 반환(§3-1 불변식 2). KVS/SQL/Jira 호출 0.
2. `const index = await getTeamIndex()` — `TeamTreeCache`, **TTL 60초 캐시**를 쓴다.
   (팀 CRUD 화면이 아니라 **읽기 분석 화면**이므로 `loadTeamIndexFresh()` 를 쓰지 않는다 — `PrincipalResolver` 와 같은 판단.)
3. 가시 키 산출
   - `ALL` → `flattenTeamIndex(index)` 전체
   - `LEADING` → `principal.leadingScopeTeamKeys`(리딩 팀 + 후손). **`scopeTeamKeys` 를 쓰지 않는다** — 그건 자기 소속 팀까지 포함해 과대하다(`permissionGuard.js:77` 규칙과 동일 축).
   - 순서는 항상 `flattenTeamIndex` 순서로 정렬(결정적 전위 순회).
4. `countUsersByTeam()` 1회 → `memberCount` / `descendantMemberCount`(`descendantsOf(index, key, {includeSelf:true})` 합)
   - ⚠ `descendantMemberCount` 는 **가시 여부와 무관하게 실제 후손 전부**를 센다(조직 실제 규모). 가시 트리에 없는 후손이 있어도 숫자는 정직해야 한다. 프론트 표에 `descendantCount` 와 함께 표기.
5. **부모 절단** — `parentTeamKey` 가 가시 집합 밖이면 `null`, `depth` 는 가시 트리 기준 재계산(§3-1 불변식 3).
6. `leaderName` — `userMap(leaderAccountIds)` 1회 bulk. **실패해도 던지지 않는다**(`null` 폴백). `TeamService.leaderMap` 패턴 재사용.
7. `unassignedCount` — `ALL` 이면 `counts.get('NONE') ?? 0`, 그 외 `null`.

**성능**: 팀 인덱스(60초 캐시 hit 시 0회) + SQL 1회(`countUsersByTeam`) + Jira bulk 1회(리더). `getTeamList` 보다 가볍다(권한세트 조회 없음, fresh 로드 없음).

**신규 ErrorCodes 없음.** 권한 실패는 가드가 `PERMISSION_DENIED` 로 처리하고, `scopeMode:'NONE'` 은 **정상 응답**이다.

### 6-3. 기존 서비스 확장 (P1-a)

| 파일 | 변경 |
|---|---|
| `src/resolver/backoffice/permission/PermissionService.js` | `EMPTY_TEAM_BLOCK` 에 `teamAnalyticsScope: 'NONE'` 추가 / `userPermissionCheckService` 반환 `team` 에 `teamAnalyticsScope: resolveTeamAnalyticsScope(principal)` 추가 |
| `src/resolver/portfolioDashboard/PortfolioDashboardService.js` | `people` 매핑에 `utilBand: classifyUtilBand(util, resolveBands(settings))` 추가. `settings` 는 이미 `Promise.all` 로 조회 중이라 **추가 I/O 0**. `emptyShape` 는 `people: []` 이므로 변경 불필요 |
| `src/permission/PermissionMap.js` | `getTeamAnalyticsScope` 엔트리 **1건만** 추가 (grant 확장 철회 — §3-3) |
| `src/index.js` | `registerTeamAnalyticsController` import + 배열 추가 |

⚠ `classifyUtilBand` / `resolveBands` 는 `resourceManagement` 도메인에 있다. `portfolioDashboard` 가 import 하는 방향이 **순환이 되지 않는지** 확인할 것(현재 `ResourceManagementService` → `PortfolioSnapshotRepository` 단방향이므로 역방향 import 는 순환을 만든다). 순환이면 **분류기를 `src/utils/` 로 승격**해 양쪽이 참조한다 — **복제 금지**.

### 6-4. P2 — 배치 확장 (기간별 공수 추이)

**`PortfolioAggregator.aggregateOneProject`**

현재:
```js
const monthSecMap = {};
for (const log of worklogs) { monthSecMap[month] += log.timeSpentSeconds; }   // ← 프로젝트 단위
```
→ 팀 분해 불가. **인원 축을 하나 더 만든다:**
```js
const memberMonthSecMap = {};   // { [accountId]: { '2026-07': seconds } }
```
그리고 `members[]` 조립 시:
```js
monthlyEffort: buildMemberMonthly(memberMonthSecMap[u.account_id], denom, TREND_MONTHS)
```

**🔴 월 축 정의 (외부 검토 #11 — 초안에 없었다)**

| 항목 | 규칙 |
|---|---|
| 기준 시점 | **배치 실행 시점**(`aggregateAllProjects` 진입 시 1회 산출, 전 프로젝트가 공유). 프로젝트별로 다시 계산하지 않는다 |
| 범위 | **현재월 포함, 직전 11개월 = 총 12개.** 예: 2026-08 실행 → `['2025-09' … '2026-08']` |
| 정렬 | 오름차순(사전식). `'YYYY-MM'` 문자열 |
| **zero-fill** | **모든 멤버가 같은 12개 축을 갖는다.** 워크로그가 없는 달은 `md: 0` 으로 채운다 |
| 프로젝트 기간 밖 | **자르지 않는다** — 축을 프로젝트마다 다르게 하면 팀 롤업 시 달이 어긋난다. 기간 밖은 `md: 0` |
| 응답 | 루트 `trendMonths: [...12개]` 로 **축 자체를 내려보낸다**(§3-2 #5). 프론트가 월 목록을 재도출하지 않는다 |

🔴 **`md: 0` 과 "집계 전"을 혼동하지 않는 근거**: 여기서의 `0` 은 **정말로 그 달 공수가 0**이라는 뜻이다(축이 서버에서 확정되고 zero-fill 이 계약이므로). "집계 전"은 **`monthlyEffort` 키 부재**로만 표현되고, 그 판정은 루트 `hasMemberMonthlyEffort` 가 단독으로 담당한다. 두 상태가 절대 섞이지 않는다.

**상수/가드**
| 상수 | 값 | 이유 |
|---|---|---|
| `TREND_MONTHS` | `12` | 최근 12개월만. 전 기간이면 장수 프로젝트에서 행이 폭증 |
| `MEMBER_TREND_MAX` | `200` | 인원이 이보다 많으면 **프로젝트 전체에서 `monthlyEffort` 를 생략**(부분 산출 금지 — 잘린 소계가 더 나쁘다) |
| 크기 관측 | `console.info` 로 `members_json` 바이트 로깅 | `utilizationPeople` 관측 선례와 동일. **캡이 아니라 신호** |

**판정 4단계 (서버 단일 출처 — 5차 검토에서 contributor 판정을 분리했다)**

🔴 **`trendReady`(배치 준비)와 `hasTrendSeries`(실제 기여)는 다른 개념이다.**
`members: []` 의 `every()` 가 `true` 인 것은 JS 문법상 맞지만, 그것으로 **추이 게이트까지 여는 것은 별개의 제품 의미**다 — 0명 프로젝트만 있으면 **series 가 하나도 없는데 위젯이 열린다.** 두 판정을 나눈다.

```
① 프로젝트별 (2종 판정):
     p.trendReady     = p.members.every(m => Array.isArray(m.monthlyEffort))
                        // 0명 → true. 배치 대기가 아니므로 NOT_AGGREGATED 로 오분류하지 않는다
     p.hasTrendSeries = p.trendReady && p.members.length > 0
                        // 🔴 실제로 series 를 기여하는가 — 게이트·모집단은 이 값만 본다
     p.trendExcludedReason = p.hasTrendSeries ? null
                           : p.members.length === 0 ? 'NO_MEMBERS'
                           : (인원 > MEMBER_TREND_MAX ? 'MEMBER_LIMIT' : 'NOT_AGGREGATED')

② 커버리지 — 🔴 **0명 프로젝트는 모집단에서 제외**한다(분모에 넣으면 영구히 100% 미만이 된다):
     trendCoverage = {
       totalProjects,             // 🔴 members.length > 0 인 프로젝트만 (= 모집단)
       contributingProjects,      // hasTrendSeries === true
       excludedByMemberLimit,     // 영구 — 배치를 돌려도 안 나온다
       excludedByNotAggregated,   // 일시 — 다음 배치에 나온다 (구 스냅샷)
       emptyProjects,             // 참고용: 0명이라 모집단에서 뺀 수 (안내에 쓰지 않는다)
     }
     불변식: contributingProjects + excludedByMemberLimit + excludedByNotAggregated === totalProjects

③ 루트 게이트:
     hasMemberMonthlyEffort = contributingProjects > 0      // 🔴 readyProjects 가 아니다
     trendMonths            = hasMemberMonthlyEffort ? [12개월] : []

④ 사유:
     trendUnavailableReason =
         contributingProjects > 0      ? null
       : totalProjects === 0           ? 'NO_MEMBERS'       // 인원이 있는 프로젝트 자체가 없다
       : excludedByNotAggregated > 0   ? 'NOT_AGGREGATED'   // 하나라도 배치 대기면 기다리면 된다
       :                                 'MEMBER_LIMIT'     // 전부 인원 상한 — 영구
```

🔴 **"영구 제한"과 "배치 대기"를 구분하는 이유**: `MEMBER_TREND_MAX(200)` 초과 프로젝트는 **다음 배치에서도 영구히** `monthlyEffort` 가 없다. 초안 문구는 전부 "다음 배치 이후 표시"였다 — **오지 않을 것을 기다리게 하는 거짓 안내**다.

**프론트 소비 규칙**
- 추이는 **`projects.filter(p => p.hasTrendSeries)`** 로만 그린다(`trendReady` 가 아니다 — 0명 프로젝트는 series 가 없다).
- `contributingProjects < totalProjects` 면 **항상** 안내한다. 사유별 문구를 **각각** 낸다:
  `excludedByMemberLimit > 0` → `trend.partialCoverage.memberLimit` / `excludedByNotAggregated > 0` → `trend.partialCoverage.notAggregated` (둘 다면 둘 다).
- `hasMemberMonthlyEffort === false` → 위젯 미노출 + `trendUnavailableReason` 별 문구.
- `?? []` / `?? 0` 금지. `monthlyEffort` 존재 여부를 프론트가 직접 검사하지 않는다(`trendReady` 만 본다).

**배포 후 동작**: 서버 배포 → 다음 일 배치(또는 `triggerPortfolioAggregation` 수동) 전까지 `hasMemberMonthlyEffort === false` → 추이 위젯 미노출. **정상이다.**

🔴 **기각한 대안 — 배치에서 팀별 월 공수를 직접 저장(`team_monthly_effort_json`)**
크기는 훨씬 작지만 **소속 기준이 배치 시점으로 고정**된다. 같은 화면의 다른 지표는 `memberTeamMap`(조회 시점) 기준이므로 **한 화면에 두 개의 소속 기준**이 공존한다 — "팀을 옮겼는데 추이만 옛 팀에 남는" 신고가 반드시 나온다. 인원 축으로 저장하면 팀 매핑이 **읽기 시점**에 일어나 §12-4 규약과 일치한다.

---

## 7. 프론트엔드 설계

### 7-1. A — `pages/resource/teamAnalytics/` (`/resource` 팀 분석 탭)

```
pages/resource/teamAnalytics/
  TeamAnalyticsTab.jsx            탭 진입 · scopeMode 게이트 · 3쿼리 조립 · 차트 그리드
  TeamScopeSelector.jsx           팀 선택(가시 팀)
  TeamKpiRow.jsx                  인원 3종 · 가동률 · (REPORT 시) MD · 인건비 · 진척률
  charts/TeamUtilBandStack.jsx    #1 밴드 분포        (stackChartOption)
  charts/TeamCompareBar.jsx       #2 팀 간 비교       (barChartOption) ← 구 PortfolioTeamComparison 이식
  charts/TeamCompositionStack.jsx #3 인력 구성        (stackChartOption)
  charts/TeamUtilScatter.jsx      #4 가동률 vs 규모   (scatterChartOption)
  charts/TeamRollupTable.jsx      #5 계층 롤업        (CommonTable + barChartOption)
  # charts/TeamProfileRadar.jsx   #6 팀 프로필 — 🔴 P1 제외(계약 미완성, §4-D 2절) → P2
  charts/TeamEffortTrend.jsx      #7 P2 월별 추이     (lineChartOption)
  hooks/useTeamAnalyticsData.js   scope + resourceOverview + (조건부) portfolio 조립
  __test__/…

**모든 차트는 `ChartCard`(접기·전체화면) + `ChartTableToggle`(차트↔표) 껍데기 안에 놓는다** — 기존 위젯 관례.
```

**쿼리 3개 (2개는 형제 탭과 캐시 공유 → 실질 추가 조회 1건)**
```js
// ① 팀 트리·스코프 — teamAnalyticsKeys.scope()  (P1-a 구현 완료)
useQuery({ queryKey: teamAnalyticsKeys.scope(), queryFn: () => invoke('getTeamAnalyticsScope'), staleTime: 5*60*1000 })

// ② 인원·가동률·밴드 — 🔴 인력현황/조직현황 탭과 **같은 쿼리키**를 쓴다(이 쿼리는 추가 호출 없음)
useQuery({ queryKey: resourceKeys.overview(), ... })     // 기존 훅 그대로 재사용

// ③ 공수·인건비·진척률·리스크 — REPORT 보유자만
useQuery({ queryKey: portfolioKeys.dashboard(), ..., enabled: canRead('REPORT') })

// 🔴 세 queryFn 모두 `!res?.success` 면 명시적으로 throw (invoke 는 실패도 정상 resolve)
```

🔴 **집계 파이프라인은 반드시 이 순서다 (D6)**
```
getPortfolioDashboard 응답  +  getTeamAnalyticsScope.content
   │
   └─ teamMetricsByTeam(selected, memberTeamMap, teamMeta, utilizationPeople, { scope })
        ├─ ① 행 생성 시점에 scope 필터            ← 여기서만 거른다
        ├─ ② aggregateByTeam × 2 (effort 축 / util 축)   ← 함수 **내부**
        └─ 반환: { rows, flatGroups, memberIdsByTeam, … }
              │
              └─ ③ rollupTeamTree(flatGroups, scope.teams, { sumFields, ratioFields,
                                                             allowedTeamKeys, includeUnassigned })
```
- **A/B 신규 화면은 `aggregateByTeam` 을 직접 호출하지 않는다** — `teamMetricsByTeam` 안에 있다.
- ①을 건너뛰고 ③을 직접 호출하는 코드를 만들지 않는다. 두 함수 모두 scope 인자 미전달 시 **throw** 하므로(§8-2·§8-3) 실수로 우회할 수 없다.
- ⚠ 초안의 파이프라인 도식은 `teamMetricsByTeam → aggregateByTeam → rollupTeamTree` 를 **직렬 3단계**로 그려 `aggregateByTeam` 이 별도 호출인 것처럼 보였다. **정정** — `aggregateByTeam` 은 `teamMetricsByTeam` 내부 구현이다.

**게이트 순서 (렌더 가드 + 상태 복귀 둘 다 — N3-1 선례)**
1. `!canRead('REPORT')` → `NoPermissionPage`
2. `teamAnalyticsScope === 'NONE'` → `teamAnalytics.empty.noScope` (에러 아님)
3. 스코프 조회 실패 → 에러 배너(`team.error.load`), **표를 그리지 않는다**
4. 지표 조회 실패 → 에러 배너, **지표 표를 그리지 않는다**(0 으로 그리지 않는다 — 검수 #2)
5. `selectedTeamKey` 가 `visibleTeamKeys` 밖 → 첫 가시 팀으로 복귀(`useEffect` + 렌더 가드)

**로딩/부재 표기 규약(전 표 공통)**
- 값 `null` → `<Dash/>` (`-`). **`0%` 로 그리지 않는다.**
- `missing[field] > 0` → 값 옆 `*` + Tooltip `teamAnalytics.partial`
- `utilization` 은 `hasWeightedMetrics(utilization) === false` 면 **컬럼 자체를 렌더하지 않고** `teamAnalytics.notAggregated`
- `costMasked` → 인건비 컬럼/축 제거 + `TEAM_AXIS_FALLBACK`(=`effortMd`)

### 7-2. 통합 대시보드 팀 축 **제거** (구 B)

| # | 파일 | 작업 |
|---|---|---|
| 1 | `pages/portfolio/widgets/PortfolioTeamComparison.jsx` | 🔴 **삭제** |
| 2 | `pages/portfolio/sections/ComparisonTabs.jsx` | `import PortfolioTeamComparison` 제거 · `active === "resource"` 블록의 `<WidgetCard>…</WidgetCard>` 제거 → `<ResourceTab …/>` 단독으로 되돌린다(`<>…</>` 래퍼도 제거) · props `teamMeta`·`memberTeamMap` 제거 |
| 3 | `pages/portfolio/PortfolioDashboardPage.jsx` | `teamMeta={…}` · `memberTeamMap={…}` 전달 제거(`:175-176`) |
| 4 | `pages/portfolio/utils/teamComparison.js` | 🔴 **삭제하지 않는다.** `utils/team/teamMetrics.js` 로 **이동**(§8-2) |
| 5 | `locales/{kr,en}/portfolio.json` | `teamCompare.*` 12키 → `resource.json` 의 `teamAnalytics.*` 로 **이동**(§10-2) |

🔴 **`TABS` 배열은 손대지 않는다** — 팀 서브탭을 애초에 만들지 않으므로 배열은 4개 그대로다. `getFirstKey`/`selectedIndex`/기본 선택에 **영향 0**(2차 검토에서 우려했던 인덱스 시프트가 **발생하지 않는다**).
🔴 **`ResourceTab` 자체는 무변경** — 팀 위젯만 걷어낸다.

**무회귀 확인**: 포트폴리오 스위트 전수 통과 + `PortfolioTeamComparison` 참조가 `static/ui/src` 전역에서 0건.

### 7-3. C — 프로젝트 상세 > 분석 > 팀

#### 🔴 권한 배선 — 3곳을 함께 고쳐야 한다 (2차 검토 #2)

현재 `canReadProject` 는 **`projectDetailTabs` 에 전달되지 않는다.** 인자 목록에 없다:
```js
// components/tabs/ProjectDetailTabs.jsx:16 (현행)
projectDetailTabs(t, project_id, toast, canReadReport, canWriteProject, canReadCost, context)
```
| # | 파일 | 변경 |
|---|---|---|
| 1 | `components/tabs/ProjectDetailTabs.jsx` | `const canReadProject = usePermissionStore(s => s.canRead('PROJECT'));` 추가 |
| 2 | 〃 | `projectDetailTabs(...)` 호출 인자에 `canReadProject` 추가 + **`useMemo` 의존성 배열에도 추가**(빠뜨리면 권한 로드 후 갱신되지 않는다) |
| 3 | `constants/tabs.js` | `projectDetailTabs` 시그니처에 `canReadProject` 추가 + 새 서브탭 등록 |

```js
// constants/tabs.js — analysisReport.children 에 추가(순서: 인력 분석 다음)
{ key: 'projectTeamAnalysis',
  label: t('projectDetail.tabs.teamAnalysis'),
  component: <ProjectTeamAnalysisPage project_id={project_id} />,
  // 🔴 REPORT 만으로는 사람↔팀 축(findProjectusersByProjectId = PROJECT read)을 못 받는다(§3-3)
  canRender: () => canReadReport && canReadProject }
```

#### 🔴 결정 — **탭을 숨기지 않는다. `canRender` + `NoPermissionPage` 를 쓴다** (2차 검토 #2)

`canRender` 의 실제 동작을 확인했다 — **탭을 숨기지 않는다.** 렌더 컴포넌트만 바꾼다:
```js
// components/tabs/CommonTab.jsx:24, 55
const canRender = config?.canRender ? config.canRender() : true;
...
{ActivePage && (canRender ? <ActivePage /> : <NoPermissionPage />)}
```
**그럼에도 숨기지 않기로 한다. 근거 3가지:**
1. **리포 전체의 확립된 관례다.** `mainPageTabs`(`tabs.js:38,49`)와 `projectDetailTabs` 의 기존 서브탭 4개(`:94,174,185,198`)가 전부 같은 방식이다. C 만 다른 규칙을 만들지 않는다.
2. **같은 판단이 이미 문서화돼 있다.** `ComparisonTabs.jsx:94-99` — *"탭을 목록에서 지우지 않고 안내 문구로 대체한다. 탭이 사라지면 사용자는 '왜 없지?'를 알 수 없고(보이지 않는 변화)…"*
~~3. 숨기면 인덱스가 밀려 기본 탭이 바뀐다~~ → **철회(3차 검토).** C 는 `analysisReport.children` 하위 탭이라 최상위 `tabs` 배열 인덱스가 밀리지 않고, `getFirstKey` 는 `tabs[0]`(=`dashboard`, children 없음)을 보므로 영향이 없다. **근거 ①②만으로 결정을 유지한다.**

→ 권한 없는 사용자는 **드롭다운에 "팀" 항목이 보이고, 선택하면 `NoPermissionPage`** 를 본다. 이것이 의도된 동작이다.
→ ⚠ **B 의 팀 서브탭은 다르다** — 거기는 `ComparisonTabs` 의 `TABS` 배열을 내가 직접 조립하므로 **조건부 미노출**이 맞다(§7-2). 두 탭 시스템이 다른 컴포넌트라 규칙이 갈리는 것은 정상이며, §5-1 표에 각각 명시돼 있다.

#### 🔴 선행 작업 — 공용 어댑터 추출 (외부 검토 #6, P1-b 로 승격)

`ResourceAnalysisTeamTable` 은 **완성된 `members` 배열을 받아 집계할 뿐**이다. 실제 어려운 부분은 전부 `ResourceAnalysisPage.jsx` 에 있다:

| 부모가 갖고 있는 것 | 위치 |
|---|---|
| 전량 조회 전환 `isFullFetch` / `pagesize`(10↔500) / `effectivePage` | `ResourceAnalysisPage.jsx:167-169` |
| 500명 상한 `TEAM_FILTER_PAGE_SIZE` + 렌더 가드 + `useEffect` 상태 복귀 | `:41, :198-206` |
| `USER_MAP_MAX=100` 아바타 조회 상한 + 팀 뷰에서 조회 차단 | `:51, :246-267` |
| `analysisMap` 조인(`findProjectusersByProjectId` × `getResourceAnalysisList`) | `:277-305` |
| `baseMmDays`/`monthMm`/`effectiveMmDays` **폴백 3단** | `:307-353` |
| `invoke` `{success:false}` → 명시적 throw | `:172-196` |

C 가 표만 import 하면 **이 어댑터가 두 벌**이 되고, 한쪽만 고쳐지는 순간 인력 분석과 C 의 팀 소계가 갈린다.
→ **`hooks/useProjectResourceMembers.js` 로 먼저 추출한다**(순수 조립부는 `resourceMembersAdapter.js` 순수 함수로 분리해 테스트).

**🔴 실행 가능한 API (2차 검토 #6 — 초안 시그니처로는 기존 화면을 대체할 수 없었다)**
```js
const {
    members,                 // 조인·폴백 완료된 행 (teamKey/teamName/totalMd/effectiveMmDays 포함)
    userMap,                 // accountId → Jira user (팀 모드·상한 초과 시 {})
    totalMemberCount,
    isFullFetch,             // 팀 필터 or 팀 모드
    isTeamFilterUnavailable, // totalMemberCount > TEAM_FILTER_PAGE_SIZE  ← 🔴 계약 필드명(현행 코드 `:193` 과 동일). `isOverMemberLimit` 는 쓰지 않는다
    effectiveViewMode,       // 🔴 상한 초과 시 이미 'member' 로 내려온 값 — 렌더는 이것만 본다
    baseMmDays, monthMm,
    isLoading,
    isUserError, isAnalysisError,   // 🔴 **통합 isError 를 두지 않는다.** 현행이 둘을 구분해 쓴다:
                                    //   배너 = (isUserError || isAnalysisError)  (`:511`)
                                    //   표 차단 = isTeamView && isAnalysisError    (`:526`)
                                    //   합치면 characterization ⑦ 을 표현할 수 없다
} = useProjectResourceMembers({
    projectId, startDate, endDate,
    viewMode,                // 'member' | 'team'  (페이지가 소유한 state)
    page,                    // 인별 모드 페이지 번호
    teamKey,                 // 팀 필터 (TEAM_FILTER_NONE 포함, 없으면 undefined)
    includeDescendants,      // 팀 필터 하위 팀 포함 여부
});
```
**보존해야 할 동작 6가지** — 전부 훅 안으로 들어간다:

| 동작 | 현행 위치 |
|---|---|
| `isFullFetch` / `pagesize`(10↔500) / `effectivePage` | `ResourceAnalysisPage.jsx:167-169` |
| `TEAM_FILTER_PAGE_SIZE=500` 상한 판정 + **렌더 가드** | `:41, :193, :198-206` |
| `USER_MAP_MAX=100` + 팀 모드에서 `getUser` 비활성화 | `:51, :246-267` |
| `analysisMap` 조인 | `:277-305` |
| `baseMmDays`/`monthMm`/`effectiveMmDays` **명시적 `null` 보존 폴백** | `:307-353` |
| 두 `invoke` 의 `{success:false}` → **throw** | `:172-196, :277-299` |

🔴 **상태 소유권**: 훅은 `viewMode` state 를 **소유하지 않는다.** `effectiveViewMode`(강등 적용값)를 **반환**하고, 렌더 가드는 훅이 책임진다. 페이지는 그 값으로 렌더하고, `useEffect` 로 자기 state 를 동기화한다(한 프레임의 잘린 소계를 막는 이중 방어 — N3-1 선례를 그대로 유지).

**🔴 추출 전에 characterization test 를 먼저 쓴다 (P1-b 선행 · 2차 검토 #6)**
초안은 "`ResourceAnalysisPage` 관련 스위트 전수 통과"를 무회귀 근거로 삼았다. **그 근거는 공허하다** — 해당 디렉토리(`analysisReport/resource/__test__/`)에 있는 테스트는 **`resourceTeamFields.test.js` 하나뿐**이고, 그것은 필드 분류만 검증한다. 페이지 동작을 지키는 테스트가 **없다.**

⚠ 더 중요한 것: **이 파일은 오늘(2026-08-03) N3-1 이 막 들어갔다.** 아래 ③④⑤⑥ 은 전부 오늘 추가·수정된 동작이라 추출이 깨뜨리면 **즉시 회귀**다.

🔴 **characterization 은 "있어야 할 동작"이 아니라 "현행 동작"을 기록한다.** 다르게 적으면 **틀린 동작을 정답으로 고정**한다(3차 검토 #6-b).

| # | 항목 | **현행 동작 (코드 근거)** |
|---|---|---|
| ① | 인별 모드 페이지 조회 | `pagesize=10`, `effectivePage=page`, 키 `resourceAnalysisKeys.projectUsers({projectId, page, pageSize:10})` (`:167-169, :177-181`) |
| ② | 팀 모드 전량 조회 | `isFullFetch=true` → `pagesize=500`, `effectivePage=1`, 페이지네이션 `pages=[]` (`:167-169, :217-221`) |
| ③ | 팀 **필터**(`teamKey`) | 필터가 켜지면 뷰 모드와 무관하게 `isFullFetch=true` (`:161-167`) |
| ④ | `TEAM_FILTER_NONE`(팀 미소속) | `teamFilter` 가 `'__NONE__'` 센티넬을 3상태로 구분(전체/특정 팀/미소속) — `null` 로 보내지 않는다 (`:207-210`) |
| ⑤ | `includeDescendants` | 하위 팀 포함 시 필터 대상 팀 키 집합이 후손까지 확장된다 |
| ⑥ | 500명 초과 | `isTeamFilterUnavailable=true` → 팀 모드가 인별로 **되돌려진다**. 렌더 가드 + `useEffect` **둘 다** (`:193, :198-206`) |
| ⑦ | 🔴 **조회 실패 시 렌더** | `isUserError \|\| isAnalysisError` → **에러 배너**. 그러나 표를 막는 것은 **`isTeamView && isAnalysisError` 뿐**이다 — 인별 뷰이거나 `isUserError` 만이면 **표는 그대로 그려진다** (`:510-511, :526`) |
| ⑧ | `getUser` 조회 비활성 | `enabled: userIds.length > 0 && !isTeamView && userIds.length <= USER_MAP_MAX(100)` (`:267`) |
| ⑨ | `effectiveMmDays` 폴백 | `hasOwnProperty` 3단 분기로 **명시적 `null` 을 보존**한다. `??` 로 바꾸면 깨진다 (`:329-353`) |
| ⑩ | 두 `invoke` 의 실패 | `{success:false}` 를 **throw** 로 승격 (`:183-186, :281-286`) |

**변경 의도: 없다.** ⑦ 을 포함해 위 10항목을 **현행 그대로** 훅으로 옮긴다. 훅이 반환하는 `isUserError`/`isAnalysisError` 를 소비 페이지가 각각 읽어 **지금과 동일한 분기**를 유지한다.
⚠ 초안은 ⑦ 을 "두 resolver 중 하나라도 실패하면 표 미렌더"로 적었다 — **현행과 다르다. 정정했다.**
⚠ ③④⑤⑥⑦⑧ 은 **2026-08-03 N3-1 회차에 추가·수정된 동작**이다. 추출이 깨뜨리면 즉시 회귀다.

→ **순서: characterization test 작성 → 통과 확인 → 훅 추출 → 같은 테스트 재통과 → C 가 훅 사용.**

```
pages/projectDetail/analysisReport/team/
  ProjectTeamAnalysisPage.jsx     useProjectResourceMembers + getProjectTeams + getProjectCostSummary 조립
  TeamCoverageTable.jsx           C1 담당↔기여 대조 (신규)
  __test__/teamCoverage.test.js   담당만/기여만/양쪽/둘다없음 4상태 고정
```
- 팀 공수 표는 **`ResourceAnalysisTeamTable` 을 import** 한다(재구현 금지).
- 비용 블록: `CostByRoleLevel` 에 **`fixedAxis` prop 을 신설**한다 — 현재는 `useState('role')` 내부 상태뿐이고 축 고정 수단이 **없다**(`CostByRoleLevel.jsx:26-53`, 외부 검토 #7).
  ```js
  // 계약: fixedAxis 가 주어지면 초기값이자 유일한 축이 되고 토글 UI 를 렌더하지 않는다.
  //       미전달 시 현행 동작(useState('role') + 3-way 토글) — 비용 탭 무회귀.
  <CostByRoleLevel data={costData} fixedAxis="team" />
  ```
  `rawGroups == null` → "집계 전"(`cost.roleLevel.notReady`) 규약은 그대로 상속된다.
- 🔴 **기간 기준 표기**: 비용 블록 헤더에 `projectDetail.analysis.team.cost.wholePeriod` 로 "프로젝트 전체 기간 기준"을 명시하고, 기간 필터가 이 블록에 적용되지 않음을 밝힌다(§4-C).
- 🔴 **500명 초과 프로젝트**: `useProjectResourceMembers` 의 **`isTeamFilterUnavailable`** 로 팀 표를 **막는다**(잘린 소계 금지). 문구는 기존 `team.analysis.tooManyMembers` 재사용.
- 🔴 인력 탭(`ProjectUserPanel`)의 `Promise.all` 무제한 `getUser` 경로를 **건드리지 않는다**(N3-2 보류 사유). C 는 아바타를 쓰지 않는다.

### 7-4. 쿼리키 팩토리

```js
// utils/queryKey/teamAnalyticsKeys.js (신규) — 이번 회차에 만드는 유일한 신규 팩토리
export const teamAnalyticsKeys = {
    all: ['teamAnalytics'],
    scope: () => ['teamAnalytics', 'scope'],
};
```

🔴 **`projectKeys` 에 새 키를 만들지 않는다 (외부 검토 #6 반영 — 초안 정정).**
초안은 "현행 인라인 키"라고 적었으나 **틀렸다.** `utils/queryKey/logicalAuditKeys.js:32-40` 에 **`resourceAnalysisKeys` 가 이미 존재**하고 `ResourceAnalysisPage` 가 이를 쓰고 있다:
```js
resourceAnalysisKeys.projectUsers({ projectId, page, pageSize })
resourceAnalysisKeys.userMap(accountIds)
resourceAnalysisKeys.list({ projectId, startDate, endDate })
resourceAnalysisKeys.worklogDetail({ projectId, accountId, startDate, endDate })
```
새 키를 만들면 **같은 데이터를 두 번 조회**한다. C(및 공용 어댑터)는 **`resourceAnalysisKeys` 를 그대로 재사용**한다.
`getProjectTeams`/`getProjectCostSummary` 도 기존 호출부의 키를 재사용한다(신규 키 금지 — 캐시 분기 방지).

### 7-5. 스토어

```js
// stores/usePermissionStore.js
const EMPTY_TEAM = Object.freeze({ ..., teamAnalyticsScope: 'NONE' });   // 필드 추가
getTeamAnalyticsScope: () => get().team?.teamAnalyticsScope ?? 'NONE',   // getter 추가 (fail-close)
```
조회 실패 시 `team: EMPTY_TEAM` 로 초기화되는 현행 동작이 그대로 fail-close 로 작동한다.

### 7-6. 사이드바

```js
{ key: '/team-analytics', icon: <PeopleGroupIcon .../>, label: t('teamAnalytics.nav'),
  permission: 'REPORT', extraGate: () => getTeamAnalyticsScope() !== 'NONE' }
```
⚠ 현재 `mainItems.filter(item => item.permission === null || isReadable(item.permission))` 구조라 **`extraGate` 를 지원하지 않는다.** filter 조건을 확장할 것(다른 항목의 동작은 불변).

---

## 8. 단일 출처 확장 (🔴 새 함수를 만들지 않는 이유와 근거)

### 8-1. `utils/team/rollupTeamTree.js` — 필드 옵션화

**왜 기존 것으로 안 되나 (근거)**: 현행 `emptyStats()`/`addStats()`/`finalizeStats()` 가 **`investedMd`/`availMd`/`utilization` 3필드에 하드코딩**돼 있다. A/B 는 **MD·인건비·진척률**을 계층으로 접어야 하는데 지금 API 로는 불가능하다.
→ **새 함수를 만들면 롤업 출처가 2개가 된다.** 대신 **기존 함수를 옵션화**하고 기본값을 현행 동작으로 고정한다.

```js
rollupTeamTree(flatGroups, teamMeta, {
  unassignedLabel = '',
  unknownTeamLabel = '',
  // ── 신규 (기본값 = 현행 동작) ──
  sumFields   = ['investedMd', 'availMd'],
  ratioFields = [{ field: 'utilization', numerator: 'investedMd', denominator: 'availMd' }],
  // ⚠ 밴드 옵션은 **만들지 않는다**(§8-2 c) — 현행 하드코딩 동작을 그대로 둔다
  // ── 신규 · 🔴 필수 (D6) ──
  allowedTeamKeys,                 // Set<string> | null(=무제한). undefined 면 throw
  includeUnassigned,               // boolean.       undefined 면 throw
})
```
노드 `direct`/`total` stats shape:
```js
{ memberCount,
  ...sumFields,                    // number | null  (기여 0 → null)
  ...ratioFields,                  // number | null  (Σ분자/Σ분모, 분모 0 → null)
  missingUtilization: number,      // 🔴 기존 키 — 값 계산식까지 현행과 동일
  bands: { idle, normal, over, red, unknown },
  missing: { [field]: number } }   // ⬅ **신규 키(additive)**
```

**무회귀 계약 (외부 검토 #9 반영 — 초안의 "키·값 모두 동일"은 자기모순이었다)**
초안은 "반환 키까지 동일"이라 적으면서 동시에 신규 `missing` 키를 추가했다. 현행 `emptyStats()`(`rollupTeamTree.js:47-55`)에는 `missing` 이 **없다.** 계약을 낮춘다:

> **기존 필드(`memberCount`·`investedMd`·`availMd`·`utilization`·`missingUtilization`·`bands`)는 키·값이 현행과 완전히 동일하고, `missing` 만 additive 로 추가된다.**

테스트는 **기존 6필드를 개별 단언**하고(전체 객체 deep-equal 금지), `missing` 추가가 `OrganizationTab` 소비에 영향 없음을 확인한다.
`OrganizationTab` 호출부는 `allowedTeamKeys: null, includeUnassigned: true` **두 인자만 추가**된다(전사 조직도이므로 무제한). 그 외 코드는 바뀌지 않는다.

🔴 **throw 는 "데이터 결함"이 아니라 "API 오용"에만 적용한다 (2차 검토 N2 대응)**
이 파일의 기존 원칙은 *데이터* 결함(사이클·고아·이름 모름)에 **던지지 않는 것**이다(`rollupTeamTree.js:19-24`). 그 원칙은 유지한다.
scope 인자 누락은 **런타임 데이터가 아니라 호출 코드의 버그**다 — 조용히 "무제한"으로 처리하면 §8-3 의 재출현 결함이 그대로 살아난다. 두 범주를 구분해 명시한다:

| 상황 | 처리 |
|---|---|
| 사이클 · 고아 · 이름 모름 · 빈 입력 | **던지지 않는다**(현행 유지) |
| `allowedTeamKeys`/`includeUnassigned` 미전달 | **throw** (프로그래머 오류) |

⚠ **이 때문에 `rollupTeamTree.test.js:188-189` 의 2케이스(`rollupTeamTree()` · `rollupTeamTree(null, null)` → `[]`)가 새 계약과 충돌한다.** 그 2케이스는 **throw 단언으로 수정한다**(§14 의 "무수정 통과" 대상에서 제외 — N2).
같은 파일의 **나머지 케이스는 전부 무수정 통과해야 한다.**

**`memberCount` 의 계층 합산이 왜 옳은가**
`toDirectStats` 는 `group.memberCount` 를 그대로 direct 로 쓰고 `addStats` 가 이를 더한다. `teamMetricsByTeam.flatGroups` 가 이 자리에 **dedup 실인원**을 넣으므로(§8-2 ⓑ), `node.total.memberCount` 는 곧 **자기+후손 실인원**이 된다 — 단일 소속(`users.team_key` 단일 컬럼)이라 서브트리의 accountId 집합이 **배타적**이기 때문이다.
→ 초안이 제안했던 별도 헬퍼(`unionMemberCount`/`descendantMemberCount`)는 **불필요하다. 만들지 않는다.** 대신 단일 소속 불변식을 테스트로 고정한다(§8-4).

### 8-2. `utils/team/teamMetrics.js` — **모듈 이동 + 소비처 교체** (구 `pages/portfolio/utils/teamComparison.js`)

🔴 **P1-b 에서 이미 구현된 모듈이다. 버리지 않는다.** B1 이 사라지면 `teamComparison()` 의 유일한 소비처가 없어지지만, **새 팀 분석 탭이 같은 집계를 그대로 쓴다**(§4-D #2 가 TOP N + `기타` 묶음까지 필요로 한다).

| 대상 | 판정 |
|---|---|
| `teamMetricsByTeam` (scope·flatGroups·band·delayed/risk 전부 구현됨) | ✅ **그대로 유효**. 새 탭이 직접 소비 |
| `teamComparison` (TOP N + `기타` 묶음 + 축 게이팅) | ✅ **그대로 유효**. §4-D #2 차트가 소비 |
| 파일 위치 | 🔴 **`pages/portfolio/utils/` → `utils/team/teamMetrics.js` 로 이동** — 포트폴리오 전용이 아니게 됐고, 팀 집계 단일 출처들(`aggregateByTeam`·`rollupTeamTree`·`teamAnalyticsFields`)이 이미 `utils/team/` 에 산다 |
| 테스트 | `__test__/teamComparison.test.js` → `utils/team/__test__/teamMetrics.test.js` 로 동반 이동. **케이스 본문 무변경**(import 경로만) |

**입력 원천 변경(D7)** — 시그니처는 바꾸지 않는다:
```js
teamMetricsByTeam(
  selected,            // ← REPORT 없으면 []  (공수/인건비/진척률/리스크가 전부 null 이 된다)
  memberTeamMap,       // ← 🔴 getResourceOverview.people[] 에서 파생 (accountId → teamKey)
  teams,               // ← getTeamAnalyticsScope.content.teams  (id/name 규약 호환)
  utilizationPeople,   // ← 🔴 getResourceOverview.people[]  ({util, utilBand, investedMd, availMd} 보유)
  { scope, unassignedLabel, unknownTeamLabel },
)
```
`getResourceOverview.people[]` 는 `teamMetricsByTeam` 의 util 축이 요구하는 필드를 **전부 갖고 있다**(`OrganizationTab.jsx:106-113` 이 같은 필드로 `rollupTeamTree` 를 돌린다) → **어댑터 불필요.**

🔴 **"시그니처 완전 불변"은 정정한다 (5차 검토 조건 1).** 위치 인자 5개는 그대로지만 **options 가 하나 는다**:
```js
{ scope, unassignedLabel, unknownTeamLabel,
  includeUtilOnlyTeams = false }   // 🔴 신규 (기본값 = 현행 동작)
```
**왜 필요한가**: 현행은 팀 집합을 `selected`(프로젝트) 에서만 파생하고 util 행을 `scopedTeamKeys.has(...)` 로 거른다(`teamComparison.js:194`). `REPORT` 미보유자는 `selected = []` 이라 **`scopedTeamKeys` 가 비고 → 모든 팀이 사라진다.**
→ `includeUtilOnlyTeams: true` 면 **util 축에만 존재하는 팀도 행으로 생성**한다(effort 계열 필드는 `null`). 팀 분석 탭은 항상 `true` 로 호출하고, `teamComparison()`(구 B1 경로)은 기본값 `false` 라 **기존 동작 불변**이다.
⚠ 이 옵션이 §H-2 "스코프는 `projects[].members[]` 에서만 파생" 규약의 **예외**다. 허용 근거: 이 화면엔 프로젝트 필터가 없고, 팀 범위는 `scope.allowedTeamKeys`(서버 판정)가 **이미 강제**하므로 넓어지지 않는다.

⚠ **모집단 차이를 기록한다**: `getResourceOverview.people[]` 는 **전 `users`**, 포트폴리오 `utilization.people[]` 는 **프로젝트 참여자**다.

| 비교 | 결론 |
|---|---|
| **동일 인물의 가동률·밴드 값** | **같다** — 둘 다 같은 KVS rollup 파생이고 밴드 분류기도 서버 `classifyUtilBand` 하나다 |
| **밴드 분포(집계 결과)** | 🔴 **다르다** — Resource 응답은 **프로젝트에 없는 사람까지 포함**하므로 `unknown`/`idle` 이 더 많다 |
| `utilMemberCount` | Resource 쪽이 **더 크다** |

→ "밴드가 동치"라고 쓰지 않는다. **"인물별 값은 동치, 분포는 모집단이 달라 다르다"** 가 정확하다. 인원 3종 표기(§8-5)로 화면에서 구분된다.

#### (구) 하위 함수 추출 계약

```js
// 신규 export — teamComparison() 이 내부적으로 이 함수를 호출한다
export function teamMetricsByTeam(selected, memberTeamMap, teamMeta, utilizationPeople, {
    unassignedLabel = '', unknownTeamLabel = '',
    // 🔴 필수 (D6). 구조분해 후 undefined 면 즉시 throw — "조용히 무제한"이 되지 않게 한다.
    scope,      // { allowedTeamKeys: Set<string>|null, includeUnassigned: boolean }
}) {
    // if (!scope || scope.allowedTeamKeys === undefined || typeof scope.includeUnassigned !== 'boolean')
    //     throw new Error('[teamMetricsByTeam] scope is required');
    // ① 행 생성 시점에 거른다 — 그룹을 만든 뒤 지우면 안 된다(§8-3).
  return {
    // ── ⓐ 표시용 병합 행 (평면 표·막대 차트) ──
    rows: [{ teamKey, teamName, isUnassigned, hasName,
             memberCount,            // dedup accountId
             effortMd, salary, completionRate, utilization,
             delayedShare, riskScoreWeighted,          // B4·A13 (아래 표)
             bands: { idle, normal, over, red, unknown },  // B3 (사람 수)
             // ── 계층 재계산용 분자·분모 ──
             investedMd, availMd,
             completionWeighted, completionDenom,
             delayedEffortMd, riskWeighted, riskDenom,
             missing }],
    // ── ⓑ 🔴 `rollupTeamTree` 에 **그대로 넣을 수 있는** 평면 그룹 배열 ──
    //    두 축(effort 행 = project×member / util 행 = person)을 teamKey 로 병합해 만든다.
    //    · `members[]` 에는 **util 행**(= 사람 단위, `utilBand` 보유)을 담는다 → 밴드 카운트가 사람 수가 된다
    //    · `memberCount` 는 **dedup 실인원**으로 덮는다 → 계층 합산이 곧 실인원이 된다(§8-4)
    //    · `missing` 은 두 축의 합집합
    flatGroups: [...],
    memberIdsByTeam: Map<teamKey|null, Set<accountId>>,
    scopedTeamKeys: Set<teamKey|null>,
    hasUtilizationData: boolean,
  };
}
```

#### 🔴 B3·B4·A13 을 위한 필드 (N1 — 3차 검토에서 산식·모집단을 정정했다)

**선택: 계약을 추가한다(P1 제외가 아니라).** 지연·리스크 원천은 실제로 존재한다 — 프로젝트에 `diagnosisStatus`·`riskScore`, 멤버에 `effortMd`(`PortfolioDashboardService.js:183-201`). 데이터가 없는 위젯이 아니다.

##### (a) 🔴 `delayedShare` — 정상 프로젝트 행은 `null` 이 아니라 **알려진 `0`** 이다

2차 초안은 정상 프로젝트 행의 `delayedEffortMd` 를 `null` 로 두었다. **거짓 값을 만든다.**
`aggregateByTeam.js:160` 은 **분자·분모가 둘 다 숫자인 행만** 누적한다:
```js
if (isNum(num) && isNum(den)) { acc.num += num; acc.den += den; acc.contributed += 1; }
else { acc.missing += 1; }
```
→ 지연 5MD + 정상 5MD 인 팀에서 정상 행이 분모에서도 빠져 **`5/5 = 100%`** 가 나온다. 실제는 50%.

```js
// 행 생성 시점 (project × member)
const known = isNum(effortMd) && p.diagnosisStatus != null;
delayedEffortMd: known ? (p.diagnosisStatus === 'delayed' ? effortMd : 0) : null,
// 분모는 effortMd 를 그대로 쓴다 → { field:'delayedShare', numerator:'delayedEffortMd', denominator:'effortMd' }
```

##### 🔴 판단 기준 — "모르는 값(null)" vs "알려진 0" (이 절이 규범이다)

이 리포의 `?? 0` 금지 규약은 **모르는 값을 0으로 만들지 말라**는 뜻이다. 그 역도 똑같이 위험하다 — **알려진 0을 null 로 만들면 분모에서 빠져 비율이 부풀려진다.** 2차 초안이 정확히 그 실수를 했다.

| 상태 | 값 | 판정 기준 | 예 |
|---|---|---|---|
| **모름** | `null` | 원천 필드가 **없거나**(구 스냅샷·`costMasked` 키 제거) 판정 입력이 없다 | `salary`(마스킹), `investedMd`(배치 전), `diagnosisStatus == null` 인 행의 `delayedEffortMd` |
| **알려진 0** | `0` | 원천이 **있고**, 조건에 해당하지 않아 기여가 0이다 | 정상 프로젝트의 `delayedEffortMd`, 워크로그 없는 달의 `monthlyEffort[].md` |

**적용 규칙**: 비율 필드를 만들 때는 **분자와 분모가 같은 행 집합을 봐야 한다.** 분자만 `null` 이 되는 설계는 분모까지 함께 잃게 만든다 — 그럴 땐 분자를 `0` 으로 두거나 **전용 분모 필드**를 따로 만든다.

##### (b) `riskScoreWeighted` — 분자·분모가 같은 조건이라 비대칭이 없다

```js
const known = isNum(p.riskScore) && isNum(effortMd);
riskWeighted: known ? p.riskScore * effortMd : null,
riskDenom:    known ? effortMd : null,
```
`riskScore = 0`(건강한 프로젝트)은 그대로 `0` 으로 기여한다 — 분모도 함께 들어가므로 (a) 의 함정이 없다.

##### (c) 🔴 밴드 — `rollupTeamTree` 의 내장 메커니즘을 **쓰지 않는다** (초안 주장 철회)

**2차 초안의 "기존 `bandField` 메커니즘이 있어 추가 코드 0" 은 사실이 아니었다.** 실제 코드를 확인한 결과:
- `bandField` 라는 **옵션은 존재하지 않는다.** `toDirectStats`(`rollupTeamTree.js:92-101`)가 `group.members[].utilBand` 를 읽는 동작이 **하드코딩**돼 있다.
- `teamComparison.js:146-151` 의 util 행에 **`utilBand` 가 아예 복사되지 않는다**(`teamKey`/`investedMd`/`availMd` 3필드뿐).
- 더 근본적으로 **모집단이 어긋난다**: `flatGroups.memberCount` 는 선택 프로젝트의 **참여자 dedup** 인데, 밴드를 세는 `members[]` 는 **전사 `utilizationPeople`**(프로젝트 필터 무관, M-1)이다. `Σbands !== memberCount` 가 되어 기존 불변식 테스트(`rollupTeamTree.test.js:209` "밴드 합계는 인원 수와 일치한다")와 충돌한다.

→ **밴드를 카운트 필드로 명시한다.** `rollupTeamTree` 에 **새 옵션을 만들지 않고**, 5개 숫자 필드를 `sumFields` 로 합산한다.

```js
// teamMetricsByTeam 이 util 행을 팀별로 집계하며 직접 tally 한다(aggregateByTeam 은 범주값을 셀 수 없다)
bandIdle, bandNormal, bandOver, bandRed, bandUnknown,   // 각각 사람 수 (sumFields)
utilMemberCount,                                         // = Σ band* — 밴드/가동률의 모집단
memberCount,                                             // = 선택 프로젝트 참여자 dedup (별개 모집단)
```

| 필드 | 모집단 | 출처 |
|---|---|---|
| `memberCount` | **선택 프로젝트 참여 인원**(dedup) | `projects[].members[]` ∘ `memberTeamMap` |
| `utilMemberCount` · `band*` | **전사 가동률 산출 대상**(프로젝트 필터 무관) | `utilization.people[]` |

🔴 **두 값은 다르다. 같은 표에 나란히 놓을 때 각각 라벨을 단다**(§4-A A3/A4 와 같은 원칙). 불변식은 `Σband* === utilMemberCount` 이며 **`memberCount` 와는 무관**하다.
🔴 **A/B 는 `rollupTeamTree` 가 돌려주는 `stats.bands` 를 읽지 않는다.** `includeMembers:false` 로 집계하므로 그 값은 전부 0이다. 반드시 `band*` 합산 필드를 쓴다.
✅ 이 방식의 이점: `rollupTeamTree` 의 밴드 코드·기존 불변식 테스트·`OrganizationTab` 경로가 **전부 무변경**이다.

##### `flatGroups` 정본 (🔴 이 절이 산식, **필드 분류는 §8-4 가 유일 정본**)

```js
// teamMetricsByTeam 이 만드는 flatGroups[i] — rollupTeamTree 에 그대로 넣는다
{
  teamKey, teamName, isUnassigned, hasName,
  members: [],                 // 🔴 **항상 빈 배열.** 두 축 모두 includeMembers:false 로 집계한다
  memberCount,                 // dedup 참여 인원 — rollupTeamTree 전용 필드(generic sumFields 아님)
  utilMemberCount,             // 가동률/밴드 모집단 (= Σ band*)
  bandIdle, bandNormal, bandOver, bandRed, bandUnknown,
  effortMd, salary, investedMd, availMd,
  completionWeighted, completionDenom,
  delayedEffortMd, riskWeighted, riskDenom,
  missing,                     // 두 축의 합집합
}
```

🔴 **`members: []` 로 고정하는 이유**: `rollupTeamTree.toDirectStats` 의 밴드 카운트는 `group.members[].utilBand` 를 읽는 **하드코딩 경로**다(§8-2 c). A/B 는 `band*` 합산 필드를 쓰므로 `members` 가 필요 없고, 채워 넣으면 **모집단이 어긋난 두 번째 밴드 값**이 생긴다. `includeMembers: false` 로 못 박는다.
→ 따라서 A/B 경로에서 `stats.bands` 는 **항상 전부 0** 이다. **읽지 않는다.**

🔴 **`memberCount` 는 generic `sumFields` 에 넣지 않는다.** `toDirectStats` 가 `group.memberCount` 를 **전용으로 읽고** `addStats` 가 계층에서 더한다(`rollupTeamTree.js:104, 66`). `sumFields` 에도 넣으면 이중 처리된다.

🔴 **`teamComparison()` 반환은 여전히 1바이트도 바뀌지 않는다** — 내부에서 `rows` 의 **현행 키만** 골라 `merged` 를 만든다(신규 키는 새 소비처만 읽는다).
`teamComparison()` 이 내부 호출 시 넘기는 옵션도 현행 동작을 유지한다: `scope: { allowedTeamKeys: null, includeUnassigned: true }`.
🔴 **`teamComparison()` 의 반환은 1바이트도 바뀌지 않는다.** 내부에서 `teamMetricsByTeam().rows` 를 받은 뒤 **현행 키 집합만 명시적으로 골라** `merged` 를 만든다(추가 키가 새어 나가면 `teamComparison.test.js` 기대값이 깨진다).
`teamComparison()` 자신은 **B1(현행 동작 보존)** 이 쓰므로 `scope: { allowedTeamKeys: null, includeUnassigned: true }` 를 내부에서 전달한다 — 호출부(`PortfolioTeamComparison`) 시그니처 무변경.

### 8-3. 🔴 왜 필터가 집계 *전*이어야 하나 (외부 검토 #1 — 이 설계의 치명 결함이었다)

`rollupTeamTree.js:148-150`:
```js
for (const key of groupByKey.keys()) {
    if (!metaByKey.has(key)) metaByKey.set(key, { id: key, name: null, parentTeamKey: null });
}
```
이 3줄은 **"집계에는 있는데 메타에 없는 팀 키"를 루트 노드로 복원**한다. 원래 의도는 좋다 — 버리면 인원이 증발하기 때문이다(`rollupTeamTree.js:142-143` 주석). 그러나 **스코프 필터를 메타 쪽에만 걸면 이 방어가 정확히 반대로 작동한다**:

```
LEADING 사용자:
  teamMeta      = 가시 팀 3개                     ← 필터 적용
  flatGroups    = 전사 팀 40개 (portfolio members) ← 필터 미적용  ❌
  → 37개 팀이 "알 수 없는 팀" 루트 노드로 **실제 MD·인건비를 달고 재출현**
```
에러도 경고도 없다. 팀 **이름**만 가려지고 **숫자는 그대로 보인다.** 이것은 시야 경계의 한계(§12-9)가 아니라 **명백한 결함**이다.

**동일 계열이 `aggregateByTeam` 에도 있다** — `teamKey` 가 `teamMeta` 에 없으면 `unknownTeamLabel`("알 수 없는 팀") 그룹으로 남긴다(`aggregateByTeam.js:185-195`). 그래서 **두 함수 모두** 진입 전 필터가 필요하다.

**계약으로 강제하는 방식 (관례가 아니라 코드)**
| 지점 | 강제 수단 |
|---|---|
| `teamMetricsByTeam` | `scope` 미전달 시 **throw**. 행을 만들 때 `allowedTeamKeys` 로 거른다(그룹 생성 전) |
| `rollupTeamTree` | `allowedTeamKeys`/`includeUnassigned` 미전달 시 **throw**. 복원 루프(`:148-150`)에 `allowedTeamKeys` 검사 추가 — **이중 방어** |
| 테스트 | 비가시 팀 행을 섞어 넣고 **rows·nodes 어디에도 나타나지 않음**을 단언. `unknownTeamLabel` 노드가 0개인지도 확인 |
| 정적 검사 | **아래 좁힌 범위**로만 grep 테스트 |

🔴 **정적 검사 범위 (2차 검토 N3 — 초안 범위는 정상 소비처를 위반으로 만들었다)**
초안은 "`aggregateByTeam` 직접 호출을 `utils/team/`·`teamComparison.js` 밖에서 금지"라고 썼다. 그러면 **이미 정상적으로 동작 중인 3곳이 전부 위반**이 된다:

| 정상 소비처 | 성격 |
|---|---|
| `pages/myPage/sections/MyTeamAnalysisPanel.jsx:66` | 팀장 자기 팀 — 서버가 이미 스코프를 판정(`leadingScopeTeamKeys`). 스코프 필터 불필요 |
| `pages/projectDetail/analysisReport/resource/ResourceAnalysisTeamTable.jsx:70` | 단일 프로젝트 인원 — 팀 스코프 축이 없다 |
| `pages/resource/organization/OrganizationTab.jsx:111` | 전사 조직도 — 의도적으로 무제한 |

이들은 **팀 스코프 축이 없는 화면**이라 D6 의 대상이 아니다. 검사를 **신규 스코프 경로만** 겨냥해 좁힌다:

```
[검사 대상 경로]  static/ui/src/pages/resource/teamAnalytics/**      ← 🔴 실제 경로(D7)
   (구 `pages/teamAnalytics/**` · `portfolio/widgets/PortfolioTeam*` · `portfolio/tabs/TeamTab.jsx` 는
    폐기됐다 — 그 경로로 검사하면 **새 코드를 통째로 놓친다**)
[금지]            위 경로에서 `aggregateByTeam(` 직접 호출
[요구]            위 경로의 `rollupTeamTree(` 호출은 전부 allowedTeamKeys/includeUnassigned 를 넘긴다
```
→ 기존 3곳은 검사 대상이 아니므로 **수정 불필요**하고, 새 화면만 강제된다.
→ `OrganizationTab` 은 `rollupTeamTree` 호출부이므로 **인자 2개만 추가**하면 되고 검사에는 걸리지 않는다.

⚠ **`includeUnassigned:false` 인데 팀 미지정 행이 있으면** 그 행들은 집계에서 **완전히 빠진다**. 이때 화면 합계는 전사 합계가 아니므로 §12-10 의 배지를 **반드시** 띄운다(§R5 "팀 미지정을 숨기지 않는다"의 유일한 예외이며, 이유를 화면에 밝히는 조건으로만 허용한다).

### 8-4. `utils/team/teamAnalyticsFields.js` (신규 공용 모듈)

`teamAnalysisFields.js`·`resourceTeamFields.js` 선례를 따른다 — **합산 가능/불가를 상수로 고정하고 테스트로 감시**.

```js
// 🔴 **필드 분류의 유일 정본** (§A-0 #20). 다른 절의 목록은 이 상수를 설명할 뿐이다.
export const ADDITIVE_SUM_FIELDS = Object.freeze([
  'effortMd', 'salary', 'investedMd', 'availMd',
  'completionWeighted', 'completionDenom',
  'delayedEffortMd', 'riskWeighted', 'riskDenom',   // B4 · A13 (§8-2)
  'utilMemberCount',                                 // 가동률/밴드 모집단
  'bandIdle', 'bandNormal', 'bandOver', 'bandRed', 'bandUnknown',   // B3 (§8-2 c)
]);

/**
 * generic `sumFields` 에 **넣으면 안 되는** 필드.
 * ⚠ "계층 합산이 불가능하다"와 "generic 경로로 합산하면 안 된다"는 다르다 — 아래 주석 참조.
 */
export const NON_ADDITIVE_FIELDS = Object.freeze([
  // ▸ 계층 합산은 **되지만** rollupTeamTree 가 **전용 경로로 이미 처리**한다(이중 처리 금지).
  //   `toDirectStats` 가 group.memberCount 를 직접 읽고 addStats 가 더한다(`rollupTeamTree.js:104, 66`).
  //   flatGroups 에 **dedup 값**을 넣으므로 total.memberCount 가 곧 계층 실인원이다(§8-1).
  'memberCount',
  // ▸ 진짜 합산 불가
  'orgMemberCount',     // 서버 teams[].descendantMemberCount 를 쓴다 — 프론트 합산 금지
  'utilization', 'completionRate', 'delayedShare', 'riskScoreWeighted',   // 비율 — Σ/Σ 재계산
  'issueCount', 'projectCount',      // 사람 간 중복(T7)
]);

export const WEIGHTED_AVG_FIELDS = Object.freeze([
  { field: 'utilization',       numerator: 'investedMd',        denominator: 'availMd' },
  { field: 'completionRate',    numerator: 'completionWeighted', denominator: 'completionDenom' },
  { field: 'delayedShare',      numerator: 'delayedEffortMd',    denominator: 'effortMd' },
  { field: 'riskScoreWeighted', numerator: 'riskWeighted',       denominator: 'riskDenom' },
]);

/** 불변식(테스트): Σ(bandIdle…bandUnknown) === utilMemberCount — 모든 노드의 direct·total 양쪽에서. */

/* 🔴 계층 실인원 헬퍼는 만들지 않는다 (2차 검토 N1 부수 결론).
 *   `teamMetricsByTeam.flatGroups[].memberCount` 에 **dedup 실인원**을 넣으므로
 *   `rollupTeamTree` 의 `node.total.memberCount` 가 이미 자기+후손 실인원이다(§8-1).
 *
 *   이것이 성립하는 이유는 **단일 소속 불변식** 하나다 —
 *   `memberTeamMap` 은 `{ accountId: teamKey }` 로 accountId 당 팀이 정확히 하나이고
 *   (`users.team_key` 단일 컬럼 · `team.modal.member.hint` "사용자는 하나의 팀에만 속합니다"),
 *   따라서 서로 다른 팀의 accountId 집합은 **배타적**이다.
 *
 *   ⚠ 다중 소속(겸직)이 도입되면 이 전제가 깨져 상위 팀 인원이 부풀려진다.
 *      아래 불변식 테스트가 **먼저 깨지게** 두어 조용한 오답을 막는다. */
// ⚠ 프론트 `memberTeamMap` 을 검사하는 헬퍼는 **만들지 않는다** — 검출력이 없다(3차 검토).
//    중복은 `Object.fromEntries(memberTeamPairs.map(...))`(`PortfolioDashboardService.js:150`)에서
//    **이미 덮여 사라진 뒤**라, 맵을 아무리 검사해도 항상 통과한다.
//    → 불변식은 **백엔드에서** 지킨다(§8-5 하단).
```

🔴 **단일 소속 불변식은 백엔드가 지킨다 (3차 검토)**
프론트 `memberTeamMap` 검사는 무의미하다 — `Object.fromEntries` 가 중복 accountId 를 이미 덮었다.
→ **`findAllMemberTeamPairs()` 원본에 accountId 가 유일한지**를 백엔드 테스트로 단언한다(P1-a).
근거는 스키마다: `users.team_key` 는 **단일 컬럼**이므로 한 accountId 는 최대 1행이다. 다중 소속(겸직) 도입은 이 쿼리를 N행으로 바꾸므로 **그 테스트가 먼저 깨진다.**

🔴 **`memberCount` 를 `sumFields` 에 넣지 말 것.** 한 사람이 여러 프로젝트에 참여하면 **행이 여러 개**다(project × member). `sumFields` 에 넣으면 행 수를 세게 되어 실인원이 아니다.
→ `teamMetricsByTeam` 이 dedup 해 `flatGroups[].memberCount` 로 주고, `rollupTeamTree` 는 그 값을 계층에서 더하기만 한다.

### 8-5. dedup 비대칭 — 화면에 반드시 밝힌다

| 지표 | dedup | 이유 |
|---|---|---|
| 조직 인원 (`orgMemberCount`) | — | `users` 1행 = 1명 |
| 참여 인원 (`memberCount`) | **accountId dedup** | 프로젝트 참여자 실인원 |
| `effortMd` / `salary` | **dedup 안 함** | 프로젝트별 기여의 합 |
| `investedMd` / `availMd` | 사람당 1값(전사) | `utilizationPeople` 가 이미 인원 단위 |

→ `teamAnalytics.note.dedup` 로 표기(문구는 `portfolio.teamCompare.dedupNote` 와 같은 취지, 조직 인원 축을 추가).

---

## 9. DB 설계

**변경 없음.**

| 저장소 | 대상 | 변경 |
|---|---|---|
| MySQL | `portfolio_project_snapshot` | **DDL 무변경.** P2 는 기존 `members_json`(JSON) 의 **내용**만 확장 |
| MySQL | `users` / `projectusers` / `project_team` | 무변경 |
| KVS | `team` 엔티티 | 무변경 (`manifest.yml` `storage.entities` 도 무변경 — 새 attribute 없음) |
| KVS | `portfolioRollup:current` | 무변경 (`utilBand` 는 **read-time 파생**, 저장하지 않는다) |

⚠ P2 `members_json` 크기: 프로젝트당 `members × 12` 엔트리. 20명 기준 ≈ 6KB, 200명 상한 ≈ 60KB.
Forge SQL 은 1GiB 누적 한도가 정지 위험의 핵심이므로 **`console.info` 로 바이트를 관측**하고 `MEMBER_TREND_MAX` 로 상한을 건다(§6-4). 캡이 아니라 신호 — 초과 시 그 프로젝트만 추이를 생략한다.

---

## 10. i18n 키 목록

`locales/kr/{파일}.json` + `locales/en/{파일}.json` 양쪽에 **대칭**으로 추가 → `cd static/ui && npm run merge`.
⚠ `locales/script/*.json` 은 빈 스텁이라 거기 넣으면 반영되지 않는다.
⚠ **T10** — 생성 로케일(`ko-KR.json`/`en-US.json`)이 여러 작업의 키를 함께 담아 커밋 분리를 막는다. 소스 로케일 stash → 재병합 → 커밋 순서를 따를 것.

### 10-1. `teamAnalytics.json` (신규)

| 키 | kr | en |
|---|---|---|
| `nav` | 팀 분석 | Team Analytics |
| `page.title` | 팀 분석 | Team Analytics |
| `page.description` | 팀을 기준으로 인원·공수·비용·성과를 봅니다. | View headcount, effort, cost and delivery by team. |
| `scope.all` | 전 팀 | All teams |
| `scope.leading` | 내가 이끄는 팀 | Teams I lead |
| `scope.note.leading` | 팀장 권한으로 내가 이끄는 팀과 하위 팀만 표시합니다. | Showing only the teams you lead and their sub-teams. |
| `empty.noScope` | 표시할 팀이 없습니다. 팀 분석은 전사 인력 조회 권한이 있거나 팀장인 경우에 표시됩니다. | No teams to show. Team analytics requires org-wide resource access or team lead role. |
| `empty.noTeamSelected` | 좌측에서 팀을 선택하세요. | Select a team on the left. |
| `empty.noProjects` | 이 팀이 참여한 프로젝트가 없습니다. | This team has not participated in any project. |
| `metric.orgMembers` | 조직 인원 | Org headcount |
| `metric.orgMembers.tip` | 팀에 소속된 인원 수입니다. 프로젝트 참여 여부와 무관합니다. | Number of people assigned to the team, regardless of project participation. |
| `metric.activeMembers` | 참여 인원 | Active members |
| `metric.activeMembers.tip` | 집계 대상 프로젝트에 실제로 투입된 인원(중복 제거)입니다. | People actually staffed on the aggregated projects (deduplicated). |
| `metric.utilMembers` | 가동률 산출 인원 | People with utilization |
| `metric.utilMembers.tip` | 가동률·부하 분포를 낼 수 있는 인원입니다. 전사 기준이라 프로젝트 선택의 영향을 받지 않아 '참여 인원'과 다를 수 있습니다. | People for whom utilization could be computed. This is company-wide and does not respond to project selection, so it may differ from "active members". |
| `note.threeCounts` | 인원이 세 가지로 표시됩니다 — 조직 인원(팀 소속), 참여 인원(선택 프로젝트 투입, 중복 제거), 가동률 산출 인원(전사 기준). 모집단이 달라 값이 서로 다릅니다. | Headcount appears in three forms — org (team membership), active (staffed on the selected projects, deduplicated), and utilization (company-wide). They use different populations, so the numbers differ. |
| `metric.effortMd` | 투입 공수(MD) | Effort (MD) |
| `metric.salary` | 인건비 | Labor cost |
| `metric.utilization` | 가동률 | Utilization |
| `metric.progressRate` | 참여 프로젝트 진척률 | Project progress |
| `metric.progressRate.tip` | 팀이 참여한 프로젝트의 진척률을 팀 투입 MD 로 가중한 값입니다. 마이페이지의 '완수율'(잔여 추정 기준)과는 산식이 다릅니다. | Progress of the team's projects, weighted by the team's effort. This differs from My Page's "completion rate", which is based on remaining estimates. |
| `metric.riskExposure` | 리스크 노출 | Risk exposure |
| `col.team` | 팀 | Team |
| `col.direct` | 직속 | Direct |
| `col.total` | 누적(하위 포함) | Total (incl. sub-teams) |
| `col.project` | 프로젝트 | Project |
| `col.status` | 상태 | Status |
| `col.diagnosis` | 진척 진단 | Progress |
| `col.role` | 직무 | Role |
| `col.level` | 등급 | Level |
| `band.idle` | 여유 | Idle |
| `band.normal` | 적정 | Normal |
| `band.over` | 과부하 | Overloaded |
| `band.red` | 위험 | Critical |
| `band.unknown` | 집계 전 | Not aggregated |
| `section.hierarchy` | 하위 팀 롤업 | Sub-team rollup |
| `section.projects` | 참여 프로젝트 | Participating projects |
| `section.composition` | 인원 구성 | Composition |
| `section.utilBands` | 가동률 분포 | Utilization distribution |
| `section.risk` | 리스크 | Risk |
| `section.trend` | 기간별 공수 추이 | Effort trend |
| `note.dedup` | 조직 인원은 팀 소속 인원, 참여 인원은 중복을 제거한 실인원입니다. 투입 공수·인건비는 프로젝트별 기여를 더한 값이라 한 사람이 여러 프로젝트에 참여하면 각각 더해집니다. | Org headcount counts team members; active members are deduplicated. Effort and cost sum per-project contributions, so one person on multiple projects is counted for each. |
| `note.directTotal` | 직속은 이 팀 소속만, 누적은 하위 팀까지 포함합니다. 세로로 더하면 중복됩니다. | Direct counts this team only; total includes sub-teams. Summing rows vertically double-counts. |
| `note.globalUtil` | 가동률은 전사 기준이며 프로젝트 선택의 영향을 받지 않습니다. | Utilization is company-wide and does not respond to project selection. |
| `note.aggregatedAt` | {time} 기준 배치 집계 | Batch aggregated at {time} |
| `note.liveDiffers` | 마이페이지의 팀 분석은 실시간 조회이고 '완수율'은 산식도 다릅니다. 이 화면의 값과 다를 수 있습니다. | My Page team analysis queries live data and its "completion rate" uses a different formula, so values may differ from this view. |
| `note.leadingScope` | 내가 이끄는 팀만 집계했습니다. 전사 합계가 아니며 팀 미지정 인원은 포함되지 않습니다. | Aggregated over the teams you lead only. This is not a company-wide total and excludes unassigned people. |
| `notAggregated` | 가동률 집계가 아직 준비되지 않았습니다. 다음 배치 이후 표시됩니다. | Utilization is not aggregated yet. It will appear after the next batch. |
| `trend.notReady` | 기간별 공수 추이는 다음 배치 이후 표시됩니다. | The effort trend will appear after the next batch. |
| `trend.memberLimit` | 인원이 많은 프로젝트는 기간별 추이를 집계하지 않습니다. 배치를 기다려도 표시되지 않습니다. | Projects with many members are excluded from the effort trend. Waiting for the next batch will not change this. |
| `trend.noMembers` | 인력이 투입된 프로젝트가 없어 기간별 추이를 표시할 수 없습니다. | No project has staffed members, so the effort trend cannot be shown. |
| `trend.partialCoverage.memberLimit` | {total}개 프로젝트 중 {ready}개 기준입니다. 인원이 많은 {count}개 프로젝트는 제외되었습니다(배치를 기다려도 표시되지 않습니다). | Based on {ready} of {total} projects. {count} project(s) with many members are permanently excluded. |
| `trend.partialCoverage.notAggregated` | {count}개 프로젝트는 아직 집계 전이라 제외되었습니다. 다음 배치 이후 포함됩니다. | {count} project(s) are not aggregated yet and were excluded. They will be included after the next batch. |
| `partial` | {count}명은 아직 집계 전이라 합계에서 제외되었습니다. | {count} people are not aggregated yet and were excluded from the total. |
| `costMasked` | 인건비를 볼 권한이 없어 공수(MD) 기준으로 표시합니다. | You cannot view labor cost, so effort (MD) is shown instead. |
| `truncated` | 팀 수가 조회 한도({max})를 초과해 일부만 표시됩니다. | Team count exceeds the limit ({max}); only part is shown. |
| `error.load` | 팀 분석 데이터를 불러오지 못했습니다. | Failed to load team analytics. |

**재사용(신설 금지)**: `team.unassigned.label`(팀 미지정) · `team.form.unknownTeam`(알 수 없는 팀) · `team.analysis.currentMembershipNote` · `team.analysis.membershipBasis` · `team.tree.*`(트리 패널) · `common.*`.

### 10-2. `portfolio.json` — 🔴 **추가가 아니라 제거·이동** (D7)

| 키 | 처리 |
|---|---|
| `teamCompare.*` **12키** (`title`·`desc`·`other`·`globalUtilNote`·`notAggregated`·`dedupNote`·`axis.*` 4 · `info.calc`·`info.interp`) | 🔴 **`portfolio.json` 에서 제거하고 `teamAnalytics.json` 으로 이동.** 문구는 새 탭에서 그대로 재사용하되 `axis.completionRate` 는 **"진척률"**(§4-A), `globalUtilNote` 는 프로젝트 필터가 없어져 **불필요 → 삭제** |
| `subtab.team` · `teamRollup.*` · `teamBands.*` · `teamRisk.*` · `teamTrend.*` · `teamTab.scopeNote` · `teamScope.*` | 🔴 **신설하지 않는다**(초안 폐기). 전부 `teamAnalytics.json` 에서 정의 |
| 그 외 `completion*` 키 | **건드리지 않는다** — 프로젝트 축이지 팀 축이 아니다(전역 치환 금지) |

⚠ `portfolio.common.viewChart`/`viewTable` 은 **`ChartTableToggle` 이 쓰는 공용 키**다 — 팀 분석 탭도 같은 컴포넌트를 쓰므로 **`portfolio.json` 에 그대로 둔다**(이동 금지).

**`teamAnalytics.json` 에 추가되는 차트 키**(§10-1 표에 이어서)

| 키 | kr | en |
|---|---|---|
| `chart.utilBand.title` / `.desc` | 팀별 가동률 분포 / 팀별 여유·적정·과부하 인원 구성입니다. | Utilization by team / Idle · normal · overloaded headcount per team. |
| `chart.compare.title` / `.desc` | 팀 간 비교 / 선택한 축으로 팀을 비교합니다. | Team comparison / Compares teams on the selected axis. |
| `chart.composition.title` / `.desc` | 팀별 인력 구성 / 직무·등급 구성입니다. | Composition by team / Role and level makeup. |
| `chart.scatter.title` / `.desc` | 가동률 vs 규모 / 인원 대비 가동률의 이상치를 찾습니다. | Utilization vs size / Spots teams whose load does not match their size. |
| `chart.rollup.title` / `.desc` | 팀 계층 롤업 / 직속과 하위 포함 누적을 함께 봅니다. | Hierarchy rollup / Direct and cumulative side by side. |
| `chart.profile.title` / `.desc` | 팀 프로필 / 선택한 팀의 4개 축 강약입니다. | Team profile / Four-axis strengths of the selected team. |
| `chart.normalize` | 비율로 보기 | Show as % |
| `chart.axis.label` | 비교 축 | Axis |
| `needReport` | 공수·인건비·진척률·리스크 지표는 분석 권한(REPORT)이 필요합니다. | Effort, cost, progress and risk metrics require analytics (REPORT) permission. |
| `partialSeries` | {count}명은 아직 집계 전이라 차트에서 제외되었습니다. | {count} people are not aggregated yet and were excluded from the chart. |

### 10-3. `projectDetail.json` (추가)

| 키 | kr | en |
|---|---|---|
| `tabs.teamAnalysis` | 팀 | Team |
| `analysis.team.title` | 팀별 기여 | Contribution by team |
| `analysis.team.coverage.title` | 담당 팀 대비 실제 기여 | Assigned teams vs. actual contribution |
| `analysis.team.coverage.desc` | 담당 팀 배정과 실제 워크로그 기여를 나란히 봅니다. | Compares team assignment with actual worklog contribution. |
| `analysis.team.coverage.assignedOnly` | 담당이지만 기여 없음 | Assigned, no contribution |
| `analysis.team.coverage.contributedOnly` | 미담당 기여 | Contributed, not assigned |
| `analysis.team.coverage.both` | 담당·기여 | Assigned & contributing |
| `analysis.team.coverage.info.calc` | 담당 팀은 프로젝트 팀 배정, 기여는 기간 내 워크로그 기준입니다. | Assignment comes from project team assignment; contribution from worklogs in the period. |
| `analysis.team.coverage.info.interp` | 두 축은 자동 동기화되지 않습니다. 어긋남 자체가 신호입니다. | The two axes are not auto-synced; the gap itself is the signal. |
| `analysis.team.cost.title` | 팀별 비용 | Cost by team |
| `analysis.team.cost.wholePeriod` | 비용은 프로젝트 전체 기간({start} ~ {end}) 기준입니다. 위 기간 필터가 적용되지 않습니다. | Cost covers the whole project period ({start} – {end}). The period filter above does not apply. |
| `analysis.team.noCostPermission` | 인건비를 볼 권한이 없습니다. | You do not have permission to view labor cost. |

---

## 11. 단계 분할 + 독립 배포 가능성

| 단계 | 내용 | 상태 | 독립 배포 | 선행 |
|---|---|---|---|---|
| **P1-a** BE 기반 | `TeamAnalyticsScope.js` · `getTeamAnalyticsScope` · `userPermissionCheck.team.teamAnalyticsScope` · `utilization.people[].utilBand` · `src/index.js` 등록 | ✅ **구현 완료**(849 tests) — ⚠ **grant 축소 1건만 추가**(§3-3) | ✅ 무해 | — |
| **P1-b** FE 기반 | `resourceMembersAdapter` + `useProjectResourceMembers` 추출 · `rollupTeamTree`/`teamComparison` 스코프 필수화 + 소비처 마이그레이션 · `teamAnalyticsFields` · `teamAnalyticsKeys` | ✅ **구현 완료**(733 tests, 화면 무변경) | ✅ 무해 | — |
| **P1-c** `/resource` 팀 분석 탭 | `ResourcePage` 4탭 확장 + 차트 7종(§4-D, P2 제외 6종) + `teamMetrics.js` 이동 | 🔜 | ⚠ P1-d 와 동반 | P1-a, P1-b |
| **P1-d** 통합 대시보드 팀 축 제거 | `PortfolioTeamComparison` 삭제 + prop 정리 + i18n 이동(§7-2) | 🔜 | ⚠ P1-c 와 동반 | P1-c |
| **P1-e** C 프로젝트 분석 팀 탭 | 팀 서브탭 + 권한 배선 3곳 + `CostByRoleLevel.fixedAxis` | 🔜 | ✅ 단독 | P1-b |
| **P2** 확장 | 기간별 추이(§4-D #7, 배치 `monthlyEffort`) + 팀 스킬 분포(A16) | 🔜 | ✅ | P1-c |
| **P2-조건부** 하드 경계 | 서버 집계형 `getTeamAnalyticsSummary` — **하드 데이터 경계가 실요구일 때만.** 도입 시 프론트 롤업 제거 | — | ✅ | P1 |
| **P3** 선택 | 조직현황↔팀분석 상호 링크 · my-page 링크 · 관리자용 실시간 팀 부하 resolver · portfolio `teamMeta`/`memberTeamMap` 고아 필드 정리 | — | ✅ | P2 |

🔴 **초안 대비 변화**: 구 P1-c(A 신규 라우트) → `/resource` 탭으로 흡수, 구 P1-d(B 팀 서브탭 신설) → **P1-d 제거 작업으로 성격이 뒤집힘**, 구 P1-e(C) → P1-e 유지.

### 11-1. 배포 순서 규칙

| 조합 | 결과 | 판정 |
|---|---|---|
| P1-a / P1-b 만 | 화면 변화 0, 추가 필드 미소비 | ✅ 무해 (이미 구현·미배포) |
| **P1-c 없이 P1-d 만** | 통합 대시보드에서 팀 비교가 **사라지고 대체 화면이 없다** | 🔴 **금지** |
| **P1-c 만(P1-d 없이)** | 팀 비교가 **두 곳에 중복 노출** | ⚠ 허용되나 혼란 |
| P1-e 만 | 백엔드 의존 없음 | ✅ 무해 |

→ 🔴 **P1-c ↔ P1-d 는 같은 배포로 나간다.** 기능의 **이동**이므로 공백도 중복도 없어야 한다.
→ P1-a 는 P1-c 보다 먼저(또는 동시). 프론트만 앞서면 `teamAnalyticsScope` 부재 → `?? 'NONE'` → 탭 미노출(fail-close, 오작동 아님).

### 11-2. 롤백

- **P1-c+P1-d 를 함께 롤백**한다. 한쪽만 되돌리면 위 표의 금지/중복 조합이 된다.
- P1-a 롤백 → `'NONE'` → 탭이 사라진다. **권한이 열린 채 남는 경로가 없다.**
- P1-e 는 단독 롤백 가능.

### 11-3. P2 배포 후 관찰

배포 직후 ~24시간(다음 일 배치까지) `hasMemberMonthlyEffort === false` → 추이 위젯 미노출. **정상.**
즉시 확인하려면 `/dashboard` 의 수동 재집계(`triggerPortfolioAggregation`, `REPORT write` 필요)를 쓴다.

### 11-4. 배포 공지에 넣을 것

1. 🔴 **통합 대시보드(`/dashboard`)에서 "팀별 비교" 위젯이 제거됩니다.** 같은 분석은 **자원관리 > 팀 분석 탭**으로 옮겨졌고 차트가 더 많아집니다.
   → ⚠ **`분석(REPORT)` 은 있으나 `자원관리(RESOURCE_MANAGEMENT)` 가 없는 모든 권한 세트**의 사용자는 팀 비교를 더 이상 볼 수 없습니다(**의도된 접근 제한** — 전사 팀 가동률·인건비 비교는 관리자·PMO 성격). 초기 기본값 기준으로는 프리셋 `Team Member`·시드 `Member` 가 해당하지만, **실제 영향 세트·사용자 목록은 §11-5 감사로 배포 전 산출·승인**합니다.
   → Admin·PM·PMO·Team Lead 는 영향 없습니다(전부 `RESOURCE_MANAGEMENT read` 보유).
2. **팀 분석 탭은 다음 경우에 보입니다**: `/resource` 접근 권한(`RESOURCE_MANAGEMENT read`) + ① Jira 관리자 ② org 신호(`RESOURCE_MANAGEMENT`\|`USER_MANAGEMENT`\|`TEAM_MANAGEMENT` read) **&&** 프로젝트 범위 `전체` ③ 팀장(자기 팀+하위 팀만).
3. **공수·인건비·진척률·리스크 차트는 `REPORT read` 가 추가로 필요합니다.** 없으면 그 차트만 안내로 대체되고 가동률·인원 차트는 정상 표시됩니다.
3. **인건비 축은 `PROJECT_COST read` 없으면 MD 로 대체된다** (기존 `/dashboard` 와 동일 규약).
4. **A/B 는 일 1회 배치 기준**이다. 마이페이지 팀 분석(실시간)과 값이 다를 수 있고, **"진척률"과 "완수율"은 산식이 다른 별개 지표**다(§12-8).
5. **프로젝트 상세 > 분석 > 팀 탭은 `REPORT read` + `PROJECT read` 를 모두 가진 사용자에게만 보인다.**
6. **C 의 비용 블록만 프로젝트 전체 기간 기준**이다(기간 필터가 적용되지 않는다).
7. **P2 배포 후 첫 배치 전까지 기간별 추이는 표시되지 않는다.**
8. `forge deploy` 는 Node **22.22.0** (v24/22.23 은 "Premature close" 버그).

### 11-5. 🔴 배포 전 필수 — KVS 권한 세트 감사 (외부 검토 #3)

§5-2 의 프리셋 표는 **초기 기본값 예시일 뿐 운영 설치를 보장하지 않는다**(프리셋은 `edit:true` 최초 1회 생성, `Member.projectScope` 는 기존값 보존).
배포 전에 **실제 KVS `permission` 엔티티를 조회해** 다음을 산출하고 담당자 승인을 받는다:

| 확인 항목 | 산출 방법 |
|---|---|
| 각 세트의 `pages[RESOURCE_MANAGEMENT\|USER_MANAGEMENT\|TEAM_MANAGEMENT].read` | `getPermissionList` → 세트별 `pages` |
| 각 세트의 `projectScope` | 〃 |
| → **`ALL` 판정을 받게 될 세트 목록** | §5-2 조합표 #2/#3 적용 |
| 팀장 관계(`team.leaderAccountId`) 보유자 수 | `getTeamList` → `leaderAccountId` non-null 팀 수 |
| → **`LEADING` 판정을 받게 될 사용자 수** | 〃 |

예상 밖의 세트가 `ALL` 로 나오면 **배포 전에 그 세트의 `projectScope` 또는 org 신호를 조정**한다. 코드로 좁히지 않는다(§5-2 규칙은 단일 함수이며, 조직 정책은 데이터로 표현한다).

#### 🔴 추가 필수 단계 — **접근 상실 차집합 산출** (5차 검토 조건 3)

D7 로 팀 비교가 `RESOURCE_MANAGEMENT read` 뒤로 이동하므로, **다음 조건을 만족하는 모든 권한 세트의 보유자가 접근을 잃는다**:

```
REPORT.read === true  &&  RESOURCE_MANAGEMENT.read !== true
```

⚠ **"프리셋 `Team Member` 와 시드 `Member` 두 세트만 영향"이라고 단정하지 말 것.** 그 둘은 **초기 기본값 기준의 예시**일 뿐이다 — 프리셋은 `edit:true` 라 조직이 바꿨을 수 있고, **커스텀 세트**가 얼마든지 이 차집합에 들어간다(§5-2 의 같은 함정).

| 단계 | 산출물 |
|---|---|
| ① | 전 권한 세트에서 위 조건을 만족하는 **세트 목록**(id·name) |
| ② | `users.permission_key` 로 각 세트에 **직접 배정된 사용자 수** |
| ③ | 팀 권한 상속(`permission_key IS NULL`)으로 그 세트를 **간접 적용받는 사용자 수** — `team.permissionKey` + `nearestAncestorWith` |
| ④ | ①~③ 을 합친 **영향 사용자 목록을 담당자에게 제시하고 승인**받는다 |
| ⑤ | 승인 시 §11-4 공지에 세트명을 명시. 승인 불가 시 → 해당 세트에 `RESOURCE_MANAGEMENT read` 부여(권한 확대) 또는 D7 재검토 |

**④ 없이 배포하지 않는다.** 접근 상실은 조용히 일어나고(메뉴가 사라지는 게 아니라 위젯이 없어진다) 사용자가 원인을 알 수 없다.

---

## 12. 🚫 미해결 · 만들 수 없는 것 (정직하게 적는다)

> **재검증 이력 (2026-08-03)** — 외부 검토 #10(b) 지적을 받아 이 절 전체를 **코드로 재확인**했다.
> `requirement.md` 의 "알려진 제약"이 직전 회차 인계서에서 옮겨진 것이라 낡은 항목이 섞여 있었다.
> | 항목 | 재검증 결과 |
> |---|---|
> | 초안 §12-11 `getResourceOverview.people[].salary` 무게이트 | ❌ **거짓 — 이미 해소됨. 삭제했다.** `ResourceManagementService.buildPeopleContext` 가 `salary` 를 싣지 않고("이 공용 DTO는 RESOURCE_MANAGEMENT 권한으로 노출되므로 salary/단가 필드를 싣지 않는다"), `__test__/ResourceSalaryLeak.test.js` 가 회귀 테스트로 고정한다 |
> | §12-1 monthly_effort 프로젝트 단위 | ✅ 사실 (`PortfolioAggregator.js` `monthSecMap`, `worklog.js` DDL 전량 주석) |
> | §12-7 `'Unassigned'` 영문 리터럴 | ✅ 사실 (`UserService.js:745`, `ProjectDashboardService.js:145`) |
> | §12-2 `getMyTeamWorkAnalysis` 접근 | ⚠ **표현 정정** — 비-admin 은 차단, admin 은 통과 후 빈 결과(§2-4) |
> | 그 외 항목 | ✅ 사실 확인 |

| # | 항목 | 사실 | 조치 |
|---|---|---|---|
| **1** | **팀 기간별 공수 추이 (P1 불가)** | `portfolio_project_snapshot.monthly_effort_json` 은 `monthSecMap[month] += sec` — **프로젝트 단위**라 인원/팀으로 분해할 수 없다. 대체 원천도 없다(워크로그 테이블은 `src/rdb/schema/ddl/worklog.js` 에 **주석 처리된 채**로만 존재) | **P2 에서 배치 확장**(§6-4). P1 에서는 위젯 자체를 만들지 않는다 |
| **2** | **팀별 이슈 건수/할일·진행·완료** | 스냅샷에 없다. `getMyTeamWorkAnalysis` 만 갖고 있고 **비-admin 은 `PERMISSION_DENIED`, admin 은 통과하되 `leadingScopeTeamKeys=[]` 라 빈 결과**(§2-4) | P3 에서 관리자용 별도 resolver. 게이트는 `OR[RESOURCE_MANAGEMENT r, TEAM_MANAGEMENT r]` + teamLead 축(REPORT 로 열면 전 사용자에게 개인별 이슈 부하가 열린다) |
| **3** | **팀별 이슈 건수 합산 자체가 불가** | 사람마다 `+= 1` 이라 팀 합산 시 중복(T7). 중복 제거에는 이슈 동일성이 필요한데 프론트에 없다 | **컬럼을 만들지 않는다**(N3-1 선례). 필요하면 서버가 합집합으로 센다 |
| **4** | **과거 소속 기준 분석 불가** | 소속 이력 테이블이 없다. `users.team_key` 는 현재값만 | 전 화면에 `team.analysis.membershipBasis` + `currentMembershipNote` 표기 |
| **5** | **가동률이 프로젝트/기간 필터에 반응하지 않음 (M-1)** | 분모 `availMd` 가 전 프로젝트 참여 구간의 union(`computeGlobalUtilization` → `mergeIntervals`)이라 부분집합 재계산 불가 | `teamAnalytics.note.globalUtil` 안내 필수. 프로젝트 필터와 함께 쓰는 화면에서 반드시 노출 |
| **6** | **프로젝트별 팀 가동률 산출 불가** | 위와 같은 이유. C 에는 **가동률 축을 두지 않는다** | C 는 MD·인원·비용 축만 |
| **7** | **팀 미지정 라벨이 영문 리터럴 `'Unassigned'`** | `ProjectDashboardService.js:145` `UNASSIGNED_TEAM_LABEL` + `UserService.js:745` `name:"Unassigned"` 규약. 한국어 UI 에도 그대로 | **이번 범위 밖**(같은 규약을 쓰는 다른 화면과 함께 고쳐야 한다). 신규 화면(A/B/C)은 전부 `team.unassigned.label` 사용 |
| **8** | 🔴 **"진척률"(A/B)과 "완수율"(my-page)은 이름이 비슷한 다른 지표다** | **신선도 차이가 아니라 산식 차이다.** A/B = `Σ(이슈진행률×plannedSec)/Σ plannedSec` 의 MD 가중(`ProgressCalculator.computeCompletion`), my-page = `spent/(spent+remaining)`(`WorkAssignmentRules.computeCompletionRate`) | **이름을 분리한다**(§4-A). A/B → "진척률", my-page → "완수율" 유지. 안내 문구만으로 덮지 않는다 |
| **9** | **팀 범위는 시야 경계이지 데이터 경계가 아니다** | `getPortfolioDashboard` 페이로드에 스코프 안 전체가 들어 있고, `teamMeta`·`memberTeamMap`·`utilization.people[]`·`problemIssues` 는 **전사**다(`PortfolioDashboardService.js:134-150, 207-270`) | §5-1 에 명시. **집계 전 필터(D6/§8-3)로 화면 재출현은 막지만 raw 노출은 못 막는다.** 실제 경계는 `projectScope('TEAM_ONLY')`. 하드 경계가 실요구면 P2-조건부의 서버 집계형 resolver |
| **10** | **`LEADING` 스코프의 합계는 전사 합계가 아니다** | 팀 미지정 그룹(`includeUnassigned:false`)과 비가시 팀이 집계에서 빠진다 | 화면이 `includeUnassigned` 를 읽어 **"전사 합계 아님" 배지**를 띄운다(§8-3 — §R5 예외를 허용하는 유일 조건). 전사 비교/비중 위젯은 `scopeMode==='ALL'` 에서만 렌더 |
| **11** | **C 의 비용 블록만 기간 기준이 다르다** | `getProjectCostSummary` 는 기간 인자가 없어 **항상 프로젝트 전체 기간**(`ProjectCostService.js:67-109`) | 블록을 분리하고 헤더에 기간 명시(§4-C). 기간형 비용 집계는 캐시 키·EVM·budget 회귀면이 커서 범위 밖 |
| **12** | **`getPortfolioDashboard.teamMeta`·`memberTeamMap` 이 고아 필드가 된다** | B1 제거로 프론트 소비처가 0 이 된다(§7-2). 응답 제거는 계약 축소이고 `emptyShape` 루트 키 1:1 규약을 흔든다 | **유지**하고 P3 정리 후보로 등재. 팀 분석 탭은 `getResourceOverview.people[]` 에서 `memberTeamMap` 을 파생하므로 **의존하지 않는다**(§8-2) |
| **13** | **계층 실인원이 단일 소속 불변식에 의존한다** | `rollupTeamTree.total.memberCount` 가 실인원인 이유는 `users.team_key` 가 단일 컬럼이라 서브트리의 accountId 집합이 배타적이기 때문이다 | 다중 소속(겸직) 도입 시 상위 팀 인원이 부풀려진다. **백엔드 `findAllMemberTeamPairs()` accountId 유일성 테스트**(P1-a)가 먼저 깨지게 둔다. 프론트 검사는 검출력이 없어 만들지 않는다(§8-5) |
| **14** | **인원 200명 초과 프로젝트는 기간별 추이에서 영구 제외**(P2) | `MEMBER_TREND_MAX` 는 `members_json` 크기 가드다. 배치를 다시 돌려도 나오지 않는다 | `trendUnavailableReason:'MEMBER_LIMIT'` + `trend.partialCoverage.memberLimit` 로 **배치 대기와 구분해** 안내(§6-4). 상한을 올리려면 SQL 저장 크기부터 관측 |
| **15** | **C 는 `PROJECT read` 없이 열 수 없다** | 팀 축 원천 `findProjectusersByProjectId` 가 `R('PROJECT','detail')` | 탭은 보이고 `NoPermissionPage`. REPORT 단독 사용자에게 열려면 report-safe roster resolver 신설 필요(범위 밖, §15-5) |
| **17** | **팀 분석 탭의 신선도가 혼합이다** | 가동률·공수·비용 = 일 1회 배치 / 인원·소속·직무·등급·조직 계층 = 실시간 SQL / 팀 마스터 = 60초 캐시 | 차트별로 기준을 표기한다(§4-D 1절). "전체가 배치 기준"이라고 안내하지 않는다 |
| **18** | **`REPORT` 미보유 시 팀 분석 탭이 부분 화면이 된다** | 공수·인건비·진척률·지연·리스크 5축이 사라진다. 탭은 열리지만 절반이다 | 축 셀렉터에서 제거 + `needReport` 안내. 조직이 원하면 해당 세트에 `REPORT read` 부여(§15-5a) |
| **16** | **`PROJECT_GANTT` 카탈로그 잔존 키** | 무관 | 손대지 않는다 |

---

## 13. 구현 작업 분해

### 13-1. backend (P1-a)

- [ ] `src/permission/TeamAnalyticsScope.js` 신규 — `resolveTeamAnalyticsScope` (§5-2 규칙, `principal` null → `'NONE'`)
- [ ] `test/permission/teamAnalyticsScope.contract.test.js` — **§5-2 조합표 #1~#10** 을 고정(프리셋 이름 기준 테스트 금지 — 운영값을 보장하지 못한다). 리터럴 삼항 복제 정적 검사 포함
- [ ] `src/resolver/teamAnalytics/TeamAnalyticsController.js` — `guardedDefine(resolver,'getTeamAnalyticsScope', ({principal}) => …)`
- [ ] `src/resolver/teamAnalytics/TeamAnalyticsService.js` — §6-2 처리 순서. **반환은 `{ content: {...} }`**(§3-0). `scopeMode==='NONE'` 은 **조회 0회**로 빠져나갈 것
- [ ] `src/permission/PermissionMap.js` — `getTeamAnalyticsScope` 엔트리 **1건만** 추가 (⚠ `getProjectTeams` grant 확장은 **철회** — §3-3)
- [ ] `src/index.js` — `registerTeamAnalyticsController` import + `CONTROLLER_REGISTRARS` 추가
- [ ] `PermissionService.js` — `EMPTY_TEAM_BLOCK.teamAnalyticsScope='NONE'` + `userPermissionCheckService` 가 반환하는 **루트 `team` 객체**에 필드 추가(⚠ `content` 래핑 아님)
- [ ] `PortfolioDashboardService.js` — `people[].utilBand` 추가. **순환 import 확인**(§6-3). 순환이면 분류기를 `src/utils/` 로 승격
- [ ] 테스트: `TeamAnalyticsService.test.js` — ① NONE 시 조회 0회 ② LEADING 이 `leadingScopeTeamKeys` 를 쓰고 `scopeTeamKeys` 를 쓰지 않음 ③ 부모 절단 + depth 재계산 ④ `visibleTeamKeys` ≡ `teams[].teamKey` ⑤ `unassignedCount` 가 LEADING 에서 `null`
- [ ] 테스트: `permissionMap.contract.test.js` 자동 통과 확인(등록집합 ↔ 맵키집합)
- [ ] 테스트: `userPermissionCheck.test.js` — 응답의 **`res.team.teamAnalyticsScope`** 존재 + `resolveTeamAnalyticsScope` 와 동일 값

### 13-2. backend (P2)

- [ ] `PortfolioAggregator.aggregateAllProjects` — **배치 진입 시 1회** `trendMonths`(현재월 포함 12개) 산출해 전 프로젝트에 전달
- [ ] `PortfolioAggregator.aggregateOneProject` — `memberMonthSecMap` 산출 + `members[].monthlyEffort` **zero-fill 12개 고정 축**(`MEMBER_TREND_MAX=200` 초과 시 프로젝트 전체 생략)
- [ ] `PortfolioDashboardService` — 프로젝트별 `trendReady`·**`hasTrendSeries`**·`trendExcludedReason` + 루트 `hasMemberMonthlyEffort`·`trendMonths`·`trendCoverage`(5필드)·`trendUnavailableReason`(§6-4 판정 4단계). `emptyShape` 에도 네 루트 키 포함(루트 키 1:1 규약)
- [ ] 테스트: `trendCoverage` 합 불변식(`contributing + memberLimit + notAggregated === total`) · **0명 프로젝트가 `trendReady:true` && `hasTrendSeries:false`** · **0명만 있으면 게이트가 닫히고 `NO_MEMBERS`** · 혼합 상태에서 `NOT_AGGREGATED` 우선
- [ ] `members_json` 바이트 `console.info` 관측
- [ ] 테스트: ① `monthlyEffort` 부재 → `hasMemberMonthlyEffort===false` && `trendMonths===[]` ② 모든 멤버의 `monthlyEffort.length === 12` 이고 `month` 배열이 `trendMonths` 와 **동일 순서로 일치** ③ 워크로그 없는 달이 `md:0` 으로 채워짐 ④ 프로젝트 기간 밖 달도 축에 남음 ⑤ `MEMBER_TREND_MAX` 초과 시 프로젝트 전체 생략

### 13-3. frontend (P1-b — 화면 변화 0)

- [ ] `utils/team/rollupTeamTree.js` — ① 필드 옵션화 ② **`allowedTeamKeys`/`includeUnassigned` 필수화 + 미전달 시 throw** ③ 복원 루프(`:148-150`)에 `allowedTeamKeys` 검사(§8-3). **기존 6필드는 키·값 동일**을 개별 단언으로 고정(deep-equal 금지 — `missing` 이 additive 로 늘어난다)
- [ ] `OrganizationTab.jsx` 호출부에 `allowedTeamKeys: null, includeUnassigned: true` 2인자 추가 (그 외 무변경, 기존 테스트 통과가 합격 기준)
- [ ] `pages/portfolio/utils/teamComparison.js` — `teamMetricsByTeam` 추출 + **`scope` 필수 인자** + **`flatGroups` 반환** + B4/A13 필드(`delayedEffortMd` **정상 행 `0`** · `riskWeighted` · `riskDenom`) + 밴드 **카운트 필드 5종 + `utilMemberCount`**(§8-2 c). util 행에 `utilBand` 를 복사해 tally 한다. ⚠ **`rollupTeamTree` 에 밴드 옵션을 만들지 않는다** — `includeMembers:false` 유지. `teamComparison()` 은 내부에서 `{allowedTeamKeys:null, includeUnassigned:true}` 전달하고 **현행 키만** 골라 조립(`teamComparison.test.js` 무수정 통과가 합격 기준)
- [ ] `utils/team/teamAnalyticsFields.js` 신규 + `__test__` — `ADDITIVE_SUM_FIELDS`/`NON_ADDITIVE_FIELDS`/`WEIGHTED_AVG_FIELDS` **분류 불변식**(§8-4 가 유일 정본) + `Σband* === utilMemberCount` + "행 합산이 실인원과 다름" 증명 케이스.
      ⚠ **계층 실인원 헬퍼를 만들지 않는다.** ⚠ **프론트 `assertSingleMembership` 을 만들지 않는다** — 단일 소속 검증은 **백엔드 raw pairs 테스트로 일원화**(P1-a, §8-4)
- [ ] 🔴 **스코프 누출 테스트** — 비가시 팀 행을 섞은 입력에서 `teamMetricsByTeam().rows` 와 `rollupTeamTree()` 노드 어디에도 그 팀이 없고 `unknownTeamLabel` 노드가 0개임을 단언
- [ ] 🔴 **정적 검사 테스트(범위 한정)** — §8-3 의 3개 경로에서만 `aggregateByTeam(` 직접 호출 금지 + `rollupTeamTree(` 호출의 scope 인자 필수. ⚠ **기존 3곳(`MyTeamAnalysisPanel`·`ResourceAnalysisTeamTable`·`OrganizationTab`)은 검사 대상이 아니다 — 수정하지 않는다**
- [ ] 🔴 **characterization test 10항목 선행 작성**(§7-3 ①~⑩ **전부**) — 추출 *전에* `ResourceAnalysisPage` 현행 동작을 고정한다. 기존 테스트는 `resourceTeamFields.test.js` 하나뿐이라 전수 통과가 아무것도 보장하지 못한다
- [ ] 어댑터 반환에 **`isUserError`·`isAnalysisError` 를 분리**해 싣는다(통합 `isError` 금지 — 항목 ⑦ 을 표현할 수 없다)
- [ ] 🔴 **`hooks/useProjectResourceMembers.js` + `resourceMembersAdapter.js` 추출**(§7-3 API 그대로) — `ResourceAnalysisPage` 를 먼저 교체하고 **위 6종 재통과** 확인
- [ ] `rollupTeamTree.test.js` — **공통 helper `rollupFrom`(`:21`)에 scope 옵션만 추가**하고 기존 case 본문은 건드리지 않는다. 무인자/`null` **2케이스만** throw 단언으로 수정(§8-1)
- [ ] `stores/usePermissionStore.js` — `EMPTY_TEAM` 필드 + `getTeamAnalyticsScope()` getter (`res.team` 경로 그대로 — 스토어 로직 무변경)
- [ ] `utils/queryKey/teamAnalyticsKeys.js` 신규 **1개만**. ⚠ `projectKeys` 신규 키 **금지** — `logicalAuditKeys.resourceAnalysisKeys` 재사용(§7-4)

### 13-4. frontend (P1-c — `/resource` 팀 분석 탭)

- [ ] `pages/portfolio/utils/teamComparison.js` → **`utils/team/teamMetrics.js` 로 이동**(테스트 동반, import 경로만 수정)
- [ ] `ResourcePage.jsx` — 탭 4개로 확장(`resource.tab.teamAnalytics`). **탭 노출 조건 `getTeamAnalyticsScope() !== 'NONE'`**
- [ ] `pages/resource/teamAnalytics/` 트리(§7-1)
- [ ] `hooks/useTeamAnalyticsData.js` — 3쿼리 조립. ② 는 **인력현황/조직현황과 같은 쿼리키**(추가 호출 없음), ①은 탭 전용 1회, ③ 은 `enabled: canRead('REPORT')`. 세 queryFn 모두 `!res?.success` 면 throw
- [ ] `memberTeamMap` 을 `getResourceOverview.people[]` 에서 파생(포트폴리오 의존 금지)
- [ ] 🔴 **차트 5종**(§4-D #1~#5, **#6 레이더는 P2 로 제외**) — **새 빌더 파일 0**, 단 `stackChartOption`(`orientation`) · `barChartOption`(`valueFormatter`,`orientation`) **additive 확장**(기본값=현행, 기존 호출부 무변경)
- [ ] `teamMetricsByTeam` 에 **`includeUtilOnlyTeams: true`** 전달(§8-2) — 없으면 REPORT 미보유자 화면이 통째로 빈다
- [ ] #5 조직 인원은 **`scope.teams[]` 별도 조인**(rollup 에 없다)
- [ ] 🔴 모든 차트에 `ChartCard` + `ChartTableToggle`(차트↔표) + `theme={isDark ? 'dark' : undefined}`
- [ ] 🔴 `null` 은 **시리즈에서 제외**(0 막대 금지) + `partialSeries` 안내
- [ ] 🔴 각 차트 헤더에 **인원 기준 배지**(조직/참여/가동률 산출) — `metric.*` 라벨 재사용
- [ ] 팀 미소속을 차트 **마지막 항목**으로 표시(숨김 금지)
- [ ] `scopeMode==='ALL'` 일 때만 전사 비교/비중. `LEADING` 이면 `note.leadingScope`
- [ ] 🔴 `REPORT` 는 **탭 게이트가 아니다**(§5-1) — 축/차트 단위 열화만: REPORT 축 5개 셀렉터 제거 · `resolveTeamAxis` 폴백을 `utilization` 으로 · #4 는 **버블 고정 크기로 유지**(숨기지 않는다) · #5 는 REPORT 컬럼만 제거
- [ ] `truncated`/`hasCycle` 경고 배너(차트는 유지)
- [ ] `__test__`: 집계 전 스코프 필터 · `NONE` 탭 미노출 · `costMasked` 축 제거 · `null` 미렌더 · 비가시 팀 재출현 없음 · REPORT 부재 시 열화

### 13-5. frontend (P1-d — 통합 대시보드 팀 축 제거)

- [ ] `pages/portfolio/widgets/PortfolioTeamComparison.jsx` **삭제**
- [ ] `ComparisonTabs.jsx` — import·`WidgetCard` 블록·`<>` 래퍼·`teamMeta`/`memberTeamMap` prop 제거. 🔴 **`TABS` 배열 무변경**
- [ ] `PortfolioDashboardPage.jsx:175-176` — prop 전달 제거
- [ ] `locales/{kr,en}/portfolio.json` — `teamCompare.*` 12키 제거(§10-2). ⚠ `portfolio.common.viewChart/viewTable` 은 **남긴다**
- [ ] 🔴 `PortfolioTeamComparison` 참조가 `static/ui/src` 전역에서 **0건**인지 grep
- [ ] 포트폴리오 스위트 전수 통과(기본 탭·인덱스 무변경 확인)

### 13-6. frontend (P1-e — C)

- [ ] 🔴 **권한 배선 3곳**(§7-3): `ProjectDetailTabs.jsx` 에 `canReadProject` 취득 + `projectDetailTabs(...)` 인자 추가 + **`useMemo` 의존성 배열 추가**, `tabs.js` 시그니처 확장
- [ ] `constants/tabs.js` `analysisReport.children` 에 `projectTeamAnalysis` 추가 — `canRender: () => canReadReport && canReadProject`. ⚠ **탭을 숨기지 않는다**(권한 없으면 `NoPermissionPage` — 리포 관례, §7-3)
- [ ] `pages/projectDetail/analysisReport/team/ProjectTeamAnalysisPage.jsx` — **`useProjectResourceMembers` 사용**(어댑터 재구현 금지). `effectiveViewMode` 로 렌더
- [ ] `TeamCoverageTable.jsx` + 4상태 테스트(담당만/기여만/양쪽/없음)
- [ ] 팀 공수 표는 `ResourceAnalysisTeamTable` **import**(재구현 금지)
- [ ] `CostByRoleLevel` 에 **`fixedAxis` prop 신설** — 미전달 시 현행 동작(비용 탭 무회귀 테스트 필수)
- [ ] 비용 블록: `canRead('PROJECT_COST')` 게이트 + `rawGroups == null` → "집계 전" + **`cost.wholePeriod` 기간 표기**
- [ ] 500명 초과 시 팀 표 차단(**`isTeamFilterUnavailable`** + `effectiveViewMode`, `team.analysis.tooManyMembers`)
- [ ] `ProjectUserPanel` 은 **건드리지 않는다**
- [ ] 쿼리키는 `resourceAnalysisKeys` 재사용(신규 키 금지)

### 13-7. frontend (P2 — 추이)

- [ ] `TeamEffortTrend.jsx` / `PortfolioTeamTrend.jsx` — 렌더 게이트는 **루트 `hasMemberMonthlyEffort` 만**, X축은 **루트 `trendMonths` 그대로**(프론트 재도출 금지)
- [ ] 기여 프로젝트는 **`projects.filter(p => p.trendReady)`** 로만 고른다
- [ ] `hasMemberMonthlyEffort===false` → `trendUnavailableReason` 별 문구 분기(`NOT_AGGREGATED`→`trend.notReady` / `MEMBER_LIMIT`→`trend.memberLimit`). 0 선 그리지 않는다
- [ ] `trendCoverage.contributingProjects < totalProjects` → **항상** 사유별 안내(`partialCoverage.memberLimit` / `partialCoverage.notAggregated`, 둘 다면 둘 다)
- [ ] 팀 롤업은 멤버별 `monthlyEffort` 를 **스코프 필터 후** 월 인덱스로 합산

### 13-8. i18n

- [ ] `locales/kr/teamAnalytics.json` + `locales/en/teamAnalytics.json` 신규(§10-1)
- [ ] `locales/{kr,en}/portfolio.json` 추가(§10-2)
- [ ] `locales/{kr,en}/projectDetail.json` 추가(§10-3)
- [ ] `cd static/ui && npm run merge`
- [ ] kr/en **키 대칭** 확인
- [ ] T10 — 커밋 분리를 위해 소스 로케일 stash → 재병합 절차 준수

---

## 14. verifier 검증 포인트

1. 🔴 **`responseWrapper` 스프레드 계약** — 새/수정 소비 코드가 `res.content.*` 를 쓰는 곳과 `res.*` 를 쓰는 곳이 §3-0 표와 일치하는지. 특히 `userPermissionCheck` 는 **`res.team`**(`res.content.team` 아님).
2. 🔴 **스코프 누출 (D6)** — `teamMetricsByTeam`/`rollupTeamTree` 호출부가 전부 `scope`/`allowedTeamKeys` 를 넘기는지. 넘기지 않는 호출이 throw 하는지 실행으로 확인. 비가시 팀이 `unknownTeamLabel` 노드로 재출현하지 않는지.
3. **경계면 shape 교차 비교** — §3 표의 필드명·중첩을 서버 반환 리터럴과 프론트 소비 코드 양쪽에서 대조.
4. **다중 shape 재사용 컴포넌트** — `rollupTeamTree` 노드를 소비하는 지점이 `direct`/`total` 두 stats 객체를 모두 받는다. 한쪽에만 있는 필드를 참조하지 않는지 전수 확인(`ScopeSplitCell` 사건 계열).
5. **서비스 내부 소비자** — `teamComparison()` / `rollupTeamTree()` / `aggregateByTeam()` 함수명을 `static/ui/src` 전역 grep 해 호출 지점을 전수 확인. 특히 `OrganizationTab` 이 2인자 추가만으로 통과하는지.
6. **어댑터 단일화** — `isFullFetch`/`TEAM_FILTER_PAGE_SIZE`/`USER_MAP_MAX`/`effectiveMmDays` 폴백이 `useProjectResourceMembers` **한 곳에만** 존재하는지 grep(두 벌이면 실패).
7. **쿼리키 중복 조회 없음** — `getResourceAnalysisList`/`findProjectusersByProjectId` 를 가리키는 키가 `resourceAnalysisKeys` **하나뿐**인지. 신규 `projectKeys.*` 가 추가되지 않았는지.
8. **`?? 0` 스캔** — 새 코드에서 `investedMd`/`availMd`/`salary`/`effortMd`/`monthlyEffort`/`unassignedCount`/`trendMonths` 에 `?? 0` 또는 `?? []` 가 붙지 않았는지.
9. **`costMasked` fail-close** — 새 소비 지점이 `!== false` 규약(`costGating.isCostMasked`)을 쓰는지. `=== true` 는 위반.
10. **권한 판정 이중화 없음** — `resolveTeamAnalyticsScope` 외에 `'ALL'`/`'LEADING'`/`'NONE'` 을 만들어 내는 코드가 없는지 grep. 계약 테스트가 **조합표 기준**인지(프리셋 이름 기준이면 실패).
11. **지표 명칭 분리** — A/B 에 "완수율" 문자열이 남아 있지 않은지(`progressRate` 로 통일). my-page 는 그대로인지.
12. **기간 기준 표기** — C 비용 블록에 `cost.wholePeriod` 가 렌더되는지.
13. **팀 미지정 은닉** — `includeUnassigned:true` 경로에서 `teamKey == null` 행을 filter 로 버리지 않는지. `false` 경로에서는 **배지가 반드시 뜨는지**.
14. **리터럴 상한 없음** — `500`/`10` 이 프론트에 하드코딩되지 않고 `limits` 에서 오는지(M6).
15. 🔴 **B1 제거 완결성** — `PortfolioTeamComparison` 참조가 전역 0건인지. `ComparisonTabs.TABS` 배열·기본 선택이 **무변경**인지. `portfolio.json` 에서 `teamCompare.*` 가 제거되고 `common.viewChart/viewTable` 은 **남아 있는지**.
15-a. **위젯 내부 인라인 롤업 없음** — B2~B5 와 A 위젯이 `teamMetricsByTeam`/`rollupTeamTree` 결과만 읽고 자체 `reduce`/`groupBy` 를 갖지 않는지.
15-b. 🔴 **차트 규약** — **새 빌더 파일 0건**이고 확장이 optional·기본값=현행인지(기존 호출부·테스트 무수정 통과) · 모든 차트에 `ChartTableToggle` 이 있는지 · `null` 이 0 막대로 그려지지 않는지 · 인원 기준 배지가 차트마다 있는지 · 팀 미소속이 마지막 항목으로 있는지 · `theme` 다크모드 전달.
15-c. **C 권한 배선 3곳**(#2) — `ProjectDetailTabs` 가 `canReadProject` 를 취득·전달하고 **`useMemo` 의존성에도 포함**했는지. 탭이 숨겨지지 **않고** `NoPermissionPage` 가 뜨는지.
15-d. **추이 판정 단위·사유 분리** — 대형 프로젝트 1개가 제외돼도 나머지로 추이가 그려지는지. **사유별 문구가 각각** 뜨는지(`memberLimit` 에 "다음 배치" 문구가 붙지 **않는지**). 🔴 **0명 프로젝트만 있을 때 위젯이 열리지 않고 `NO_MEMBERS` 로 안내되는지**(게이트가 `hasTrendSeries` 기준인지). 0명이 `NOT_AGGREGATED` 로 오분류되지 않는지. `trendCoverage` 합 불변식.
15-e. **밴드 모집단** — `Σband* === utilMemberCount`(direct·total 양쪽)이고 `memberCount` 와 혼동되지 않는지. A/B 가 `stats.bands` 를 읽지 **않는지**. `flatGroups[].members` 가 **빈 배열**인지.
15-g. **필드 분류 단일 정본** — `ADDITIVE_SUM_FIELDS`/`NON_ADDITIVE_FIELDS`(§8-4)와 실제 `sumFields` 인자가 일치하는지. `memberCount` 가 `sumFields` 에 **없는지**(이중 처리 방지).
15-f. **`delayedShare` 분모**(N1-a) — 정상 프로젝트 행이 분모에 포함되는지(지연5+정상5 → 50%, 100% 아님).
16. **테스트 실행** — 백엔드 `npm test`, 프론트 **`cd static/ui && npm test`** (T1 — `npx react-scripts test` 는 오탐).
17. 🔴 **기존 테스트 — "무수정 통과" 대상과 "수정 허용" 대상을 구분한다 (2차 검토 N2)**

| 구분 | 파일 | 근거 |
|---|---|---|
| **무수정 통과 필수** | `teamComparison.test.js` · `aggregateByTeam.test.js` · `resourceTeamFields.test.js` · `teamAnalysisFields.test.js` · `permissionMap.contract.test.js` · `ResourceSalaryLeak.test.js` · `ProjectUsersSalaryLeak.test.js` · 비용 탭 스위트 · `OrganizationTab` 관련 스위트 | 계약이 바뀌지 않는다 |
| **수정 허용(2케이스 한정)** | `rollupTeamTree.test.js:188-189` — `rollupTeamTree()` / `rollupTeamTree(null,null)` → `[]` 단언 | scope 필수 + throw 계약과 **동시 만족 불가능**. throw 단언으로 바꾼다. **같은 파일의 나머지 케이스는 무수정 통과** |
| **신규 작성 필수(선행)** | `ResourceAnalysisPage` characterization test **10항목**(§7-3 ①~⑩) | 현재 이 화면을 지키는 테스트가 **없다**(`resourceTeamFields.test.js` 는 필드 분류만 본다) |

⚠ "`ResourceAnalysisPage` 관련 스위트 전수 통과"를 무회귀 근거로 삼지 말 것 — 그 디렉토리에는 테스트가 하나뿐이다.

---

## 15. 가정 (리더 확인 필요 시 이 목록을 본다)

1. ~~A 는 새 최상위 라우트(`/team-analytics`)다.~~ → 🔴 **2026-08-03 사용자 결정으로 뒤집혔다(D7).** `/resource` 4번째 탭이다. `REPORT` 만 가진 사용자가 못 보는 것은 **의도된 접근 제한**으로 승인됐다(§11-4).
2. A 의 주 데이터는 **일 1회 배치 스냅샷**이다(`getResourceOverview`·`getPortfolioDashboard` 둘 다 rollup 파생). 실시간이 요구사항이면 P3 의 별도 resolver 가 필요하다.
3. `scopeMode` 판정에서 **`RESOURCE_MANAGEMENT read` 를 "전사 인력 조회 권한"의 대표 신호로 본다**. 조직이 다른 기준을 원하면 §5-2 규칙만 고치면 된다(단일 함수). **단 실제 판정은 운영 KVS 값에 달렸으므로 §11-5 감사가 선행되어야 한다.**
4. ~~**팀 범위(③)는 시야 경계로 남긴다** — 리더 판단 필요.~~ → ✅ **2026-08-03 책임자 결정 완료**: UX 범위이며 타 팀 raw 도달 허용. 서버 집계형 P1 미승격 확정(§5-1-a). 재검토 조건만 §11 에 유지.
5. C 는 **`REPORT read` + `PROJECT read`** 를 모두 요구한다. REPORT 단독 사용자에게도 열어야 한다면 report-safe roster resolver 신설이 필요하다 — 범위가 커진다. **리더 판단 필요.**
5-a. **팀 분석 탭의 공수·인건비 축은 `REPORT read` 가 추가로 필요**하다(§4-A). `RESOURCE_MANAGEMENT` 만 있는 세트는 가동률·인원 차트만 본다. 이 열화가 허용되는지 **배포 전 확인**.
6. C 는 N3-1(인력 분석 팀 토글)·N3-3(비용 팀 축)을 **대체하지 않고** 컴포넌트를 재사용한다. 일원화(토글 제거)는 P3 사용자 결정 사항.
7. ~~`PortfolioTeamComparison`(B1)은 Resource 탭에 유지한다.~~ → 🔴 **D7 로 뒤집혔다.** B1 은 **삭제**되고 지표는 팀 분석 탭 #2 차트로 이동한다.
9. **차트 5종(P1)** 이 범위다(§4-D, 레이더는 P2). 더 줄여야 한다면 **#4 산점도 → #3 구성** 순으로 뺀다(#1 밴드·#2 비교·#5 롤업이 사용자 요구 3종에 직접 대응한다).
10. **`teamMetrics.js` 파일 이동**은 mechanical 하다고 가정한다. import 경로 외 변경이 필요하면 이동을 취소하고 현 위치를 유지해도 설계는 성립한다(§8-2).
8. C 의 **비용 블록만 프로젝트 전체 기간 기준**으로 남긴다. 기간형 비용 집계는 `getProjectCostSummary` 의 캐시 키·EVM·budget 회귀면이 커서 범위 밖(§12-11). **리더 판단 필요.**

---

## 16. 외부 검토 반영 이력 (2026-08-03, codex `gpt-5.6-sol`)

| 지적 | 판정 | 반영 |
|---|---|---|
| #1 `LEADING` 이 데이터/UI 경계가 아님 | ✅ 수용(치명) | **D6 신설** + §8-3 신설(집계 전 필터 필수화, 두 함수 throw, 이중 방어, 누출 테스트) + §5-1 에 서버 집계형 미승격 판단 근거 명시 |
| #2 `REPORT` 단독으로 C 완성 불가 | ✅ 수용 | **C 진입 조건을 `REPORT && PROJECT` 로 확정**하고, 그 결과 불필요해진 **`getProjectTeams` grant 확장을 철회**(§3-3) |
| #3 프리셋 판정표를 계약으로 쓸 수 없음 | ✅ 수용 | §5-2 를 **조합표 #1~#10** 으로 교체(계약 테스트 대상), 프리셋 표는 예시로 격하, **§11-5 배포 전 KVS 감사** 신설 |
| #4 응답 경로 오류 | ✅ 수용 | **§3-0 신설**(스프레드 계약 표), `content.team` → **`team`** 정정. §3-1 은 서비스가 `{content:{...}}` 를 반환하므로 유지(명시) |
| #5 B1 이동 회귀 + 배포 순서 | ✅ 수용 | **B1 이동 철회**(Resource 탭 유지), 팀 탭은 `NONE` 에 미노출, §11-1 배포 표를 조합별로 재작성하고 **P1-a↔P1-c/d 원자 배포** 명시 |
| #6 C 어댑터 두 벌 + 쿼리키 오인 | ✅ 수용 | **`useProjectResourceMembers` 추출을 P1-b 로 승격**, `resourceAnalysisKeys`(기존) 재사용으로 정정, 신규 `projectKeys` 제안 철회 |
| #7 `fixedAxis` 부재 + 기간 불일치 | ✅ 수용 | `CostByRoleLevel.fixedAxis` prop 계약 신설(미전달 시 현행), **비용=프로젝트 전체 기간**을 화면에 표기(`cost.wholePeriod`), §12-11 등재 |
| #8 같은 이름의 다른 지표 | ✅ 수용 | A/B → **"진척률"**(`metric.progressRate`), my-page "완수율" 유지. 산식 대조표를 §4-A·§12-8 에 명시. 기존 축 라벨 문구도 변경 |
| #9 무회귀 계약 자기모순 | ✅ 수용 | "키·값 모두 동일" → **"기존 6필드 키·값 동일 + `missing` additive"** 로 하향, deep-equal 금지 명시 |
| #10a `REPORT` 근거의 인건비 서술 | ✅ 수용 | "전 팀 인건비" → **"전 팀 공수·운영 지표"**. 인건비는 `costMasked` 가 막는다는 사실을 함께 기재. 결론 유지 |
| #10b `getResourceOverview.salary` 무게이트 | ✅ 수용 | **§12-11 삭제.** §12 전체를 코드로 재검증하고 **재검증 이력 표**를 §12 머리에 추가 |
| #11 추이 월 축 미정의 | ✅ 수용 | §6-4 에 **월 축 정의 표**(현재월 포함 12개·zero-fill·기간 밖 유지) + 루트 `trendMonths` 계약(§3-2 #5) |
| #12 `unionMemberCount` 과설계 | ✅ 수용 | **`descendantMemberCount` 단순 합**으로 교체, 단일 소속 불변식을 주석·테스트로 고정(§8-4, §12-13). *(3차에서 헬퍼 자체가 불필요해져 제거 — §16-2 부수 정리)* |
| — `getMyTeamWorkAnalysis` 관리자 접근 표현 | ✅ 수용 | "구조적으로 통과 불가" → **비-admin 차단 / admin 통과 후 빈 결과**로 정정(§2-4 표) |

**반박한 지적: 없음.** 12건 전부 코드로 확인한 결과 사실이었다.
**단, #2 는 검토자가 제시한 두 선택지 중 "C 를 `REPORT && PROJECT` 로 제한"을 택했고, 그 결과 초안의 grant 변경 1건이 오히려 제거됐다**(순 변경량 감소).

### 16-2. 2차 외부 검토 반영 (3차 수정 · 2026-08-03)

**책임자 결정 기록**: `visibleTeamKeys` 는 **UX 범위이지 보안 경계가 아니다**(사용자 결정). 서버 집계형 resolver **P1 미승격 확정** → §5-1-a 에 결정·근거·재검토 조건을 명문화.

| 지적 | 판정 | 반영 |
|---|---|---|
| **#2** C 권한 배선 누락 + `canRender` 오해 | ✅ 수용 | `ProjectDetailTabs.jsx` 가 `canReadProject` 를 취득·전달하지 않음을 확인(`:16` 인자 목록). **배선 3곳**을 §7-3 에 표로 명시(useMemo 의존성 포함). **결정: 탭을 숨기지 않고 `NoPermissionPage`** — 근거 3가지(리포 관례 5곳 · `ComparisonTabs.jsx:94-99` 의 동일 판단 문서화 · `CommonTab.getFirstKey`/`selectedIndex` 인덱스 시프트 회귀) |
| **#6** 어댑터 API 실행 불가 + 공허한 무회귀 | ✅ 수용 | API 를 `viewMode`·`page`·`teamKey`·`includeDescendants` 포함으로 확장하고 **`effectiveViewMode` 반환**(상태 소유권 분리). `analysisReport/resource/__test__/` 에 테스트가 `resourceTeamFields.test.js` **하나뿐**임을 확인 → **characterization test 를 P1-b 선행 작업으로 승격**, "관련 스위트 전수 통과" 문구 폐기 *(4차에서 10항목으로 확정 — §16-4)* |
| **#8** 도움말 문구 충돌 | ✅ 수용 | `teamCompare.info.calc`(`kr:368`/`en:368`)를 변경 대상에 추가. **다른 `completion*` 키는 건드리지 않음**을 명시(전역 치환 금지) |
| **N1** B3/B4 집계 계약 부재 | ✅ 수용 | **계약 추가를 택했다**(P1 제외 아님). `delayedEffortMd`/`riskWeighted`/`riskDenom` 을 `sumFields` 에, `delayedShare`/`riskScoreWeighted` 를 `ratioFields` 에 추가 — `completionWeighted` 선례와 동일 패턴. ~~B3 은 기존 `bandField` 메커니즘이 그대로 동작(추가 코드 0)~~ → **3차 검토에서 거짓으로 판명, §16-3 에서 철회**(밴드 카운트 필드 방식으로 교체). `teamMetricsByTeam` 에 **`flatGroups` 반환** 신설(→ `rollupTeamTree` 직결) |
| **N2** 검증 조건 충돌 | ✅ 수용 | `rollupTeamTree.test.js:188-189` 확인. §14-17 을 **"무수정 통과 / 수정 허용(2케이스) / 신규 작성 필수"** 3분류 표로 교체. §8-1 에 "데이터 결함=던지지 않음 / API 오용=throw" 범주 구분 명문화 |
| **N3** 정적 검사 범위 과대 | ✅ 수용 | 정상 소비처 3곳 확인(`MyTeamAnalysisPanel:66`·`ResourceAnalysisTeamTable:70`·`OrganizationTab:111`). 검사를 **`pages/teamAnalytics/**` · `PortfolioTeam*.jsx` · `TeamTab.jsx` 3경로로 한정** — 기존 3곳은 대상 아님(수정 불필요) |
| **N4** 200명 상한이 "다음 배치"로 오안내 | ✅ 수용 | `projects[].trendReady` + 루트 `trendCoverage`·`trendUnavailableReason` 신설. **판정 단위를 `every()` → 프로젝트별로 변경**(대형 프로젝트 1개가 전체 추이를 죽이지 않는다). `MEMBER_LIMIT` 전용 문구 + `partialCoverage` 안내. *(4차에서 사유 2종 분리 + 0명 프로젝트 오분류 수정 — §16-3)* |
| **N5** 범위 안내 한쪽만 | ✅ 수용 | **양쪽 배지 + 상호 안내** — B1 에 `badge.projectScoped`+`crossNote.fromB1`, 팀 탭에 `badge.all\|leading`+`crossNote.fromTeamTab`. i18n 6키 신설 |
| 문서 구조(드리프트) | ✅ 수용 | **§A 규범 부록**을 문서 앞에 신설(계약·권한·집계·단계별 DoD·금지 목록). "§A 가 이긴다"를 명시하고 뒤 절은 근거·배경으로 격하 |
| 노출 범위 문구 정정 | ✅ 수용 | "REPORT 전원에게 **전 팀**" → **"`scopedProjectIds` 가 적용된 `projects[]` 에 참여한 팀들"**(`teamComparison.js:102-131` 이 팀 집합을 `projects[].members[]` 에서만 파생) |

**3차에서도 반박한 지적: 없음.** 8건 전부 코드로 확인한 결과 사실이었다.
**부수 정리**: N1 의 `flatGroups` 도입으로 `rollupTeamTree.total.memberCount` 가 곧 계층 실인원이 되어 — 2차에서 `descendantMemberCount` 로 축소했던 헬퍼가 **아예 불필요**해졌다(§8-4). *(단일 소속 검증은 4차에서 프론트 헬퍼를 폐기하고 백엔드 raw pairs 테스트로 일원화 — §16-3/16-4)*

### 16-3. 3차 외부 검토 반영 (4차 수정 · 2026-08-03)

**판정: 해소 5 · 부분해소 3 · 미해소 0 · 악화 0 → "수정 후 착수 가능".** P1-a 는 승인되어 구현 착수됨.

#### 🔴 내 주장 중 사실이 아니었던 것 2건 (코드로 확인 후 철회)

| 주장 | 실제 | 조치 |
|---|---|---|
| "`rollupTeamTree` 에 기존 `bandField` 메커니즘이 있어 추가 코드 0" | **`bandField` 옵션은 존재하지 않는다.** `toDirectStats`(`rollupTeamTree.js:92-101`)가 `members[].utilBand` 를 읽는 동작이 **하드코딩**돼 있고, `teamComparison.js:146-151` 의 util 행에는 **`utilBand` 가 복사조차 되지 않는다** | §8-2 (c) 전면 재작성 — **밴드 옵션을 만들지 않고** 카운트 필드 5종 + `utilMemberCount` 로 간다. `rollupTeamTree` 밴드 코드·불변식 테스트·`OrganizationTab` 전부 무변경 |
| "숨기면 인덱스가 밀려 기본 탭이 바뀐다"(#2 근거 ③) | **적용되지 않는다.** C 는 `analysisReport.children` 하위이고 `getFirstKey` 는 `tabs[0]`(=`dashboard`, children 없음)을 본다 | 근거 ③ 삭제. **결정(숨기지 않는다)은 근거 ①②만으로 유지** |

→ 재발 방지: "기존 메커니즘이 있다 / 추가 코드 0" 류 주장은 **해당 파일을 열어 확인한 뒤에만** 쓴다.

#### 묶음별 반영

| 지적 | 반영 |
|---|---|
| **1-(a)** `delayedShare` 거짓 값 | `aggregateByTeam.js:160` 확인 — 분자·분모 **둘 다 숫자인 행만** 누적한다. 정상 행 `null` → 분모에서도 빠져 **지연5+정상5 = 100%**. → **정상 행을 `0` 으로** 고정. **§8-2 에 "모르는 값(null) vs 알려진 0" 판단 기준 표를 신설** — `?? 0` 금지 규약의 정반대 실수를 명문화 |
| **1-(b)** 밴드 모집단 어긋남 | `rollupTeamTree.test.js:209` 불변식 확인. **`memberCount`(참여자 dedup)와 `utilMemberCount`(가동률 모집단)를 분리**. 불변식은 `Σband* === utilMemberCount` 이며 `memberCount` 와 무관함을 명시. A/B 는 `stats.bands` 를 읽지 않는다 |
| **1-(c)** `bandField` 정정 | 위 표 참조. `utilBand` 복사 작업을 §13-3 체크리스트에 명시 |
| **2-(a)** 필드명 갈림 | **`isTeamFilterUnavailable` 로 통일**(현행 코드 `:193` 과 동일). `isOverMemberLimit` 전량 제거 |
| **2-(b)** characterization ④ 가 현행과 다름 | `ResourceAnalysisPage.jsx:510-511, 526` 확인 — **표를 막는 것은 `isTeamView && isAnalysisError` 뿐**이다. characterization 표를 **현행 동작 + 코드 라인** 형식으로 재작성하고 **"변경 의도 없음"** 을 명시 |
| **2-(c)** 보호 케이스 누락 | `teamKey` 필터 · `TEAM_FILTER_NONE` · `includeDescendants` · 500명 초과를 항목 ③④⑤⑥ 으로 추가 (총 10항목) |
| **3** §A 실효성 | **(i) 규범 인덱스로 격하**를 택했다 — 아래 별도 설명 |
| 참고 | `trendCoverage` 사유 분리 · B 탭 `ReferenceError` · `assertSingleMembership` 검출력 · N2 helper — **4건 전부 지금 반영**(구현 중 처리로 미루지 않았다) |

#### 묶음 3 — **(i) 규범 인덱스**를 택한 이유

(ii) 누락 계약을 §A 로 옮기면 어댑터 API·characterization 10항목·산식·정적 검사 3경로·i18n 키가 **두 곳에 존재**하게 된다. 그것이 2차 검토에서 드리프트 4건을 만든 원인이다.
→ **§A-0 계약 색인(27항목)** 을 만들고 **"색인에 이름이 오른 절은 전부 규범"** 이라고 선언했다. 각 계약은 정확히 한 절에만 살고, 색인이 그 절을 가리킨다.
→ "충돌하면 §A 가 이긴다"는 **삭제**했다(누락에는 작동하지 않는 규칙이다). 대신 "색인이 가리키는 절이 정본, 다른 곳의 같은 내용은 오래된 사본"으로 바꿨다.
→ 지적된 구체적 모호성(상한 필드명)은 **선언이 아니라 값 통일**로 해결했다.

**4차에서 반박한 지적: 없음.** 8건 전부 코드로 확인한 결과 사실이었고, 그중 2건은 **내 서술이 틀린 것**이었다.

### 16-4. 4차 외부 검토 반영 (5차 · 최종 수정 · 2026-08-03)

**최종 판정: B — 아래 2건 수정 후 전체 구현 착수 가능.** P1-a 는 코드 검증 통과(응답 래핑 · 권한 판정 단일화 · `leadingScopeTeamKeys` · `projectScope==='ALL'` 조건 · 부모 절단 · `utilBand` 두 경로 동치 · additive).

| # | 지적 | 반영 |
|---|---|---|
| **1** 🔴 | **집계 정본이 §8-2 와 §8-4 로 갈렸다** — 4차 수정에서 §8-2 만 고치고 §8-4 분류 상수를 함께 고치지 않았다. **내가 만든 새 결함이다** | 검토자 정본대로 통일: `flatGroups.members` **빈 배열 고정**(`includeMembers:false`) · `band*`·`utilMemberCount` **additive** · `memberCount` 는 `rollupTeamTree` **전용 필드**(generic `sumFields` 제외, `toDirectStats:104`/`addStats:66` 가 이미 처리). §8-2·§8-4·§13 을 같은 내용으로 정리하고 **§8-4 를 유일 정본으로 선언**(§A-0 #20, A-1 규칙 7) |
| **2** 🔴 | **0명 프로젝트가 추이 게이트를 연다** — `every()` 의 vacuous true 가 제품 의미까지 열어 **series 0개인데 위젯이 열린다** | **`trendReady`(배치 준비) ↔ `hasTrendSeries`(실제 기여) 분리.** 게이트·모집단은 `hasTrendSeries` 만 본다. `trendCoverage.totalProjects` 를 **0명 제외 모집단**으로 정의(`emptyProjects` 는 참고용). 사유에 **`NO_MEMBERS`** 추가 + i18n `trend.noMembers` |
| 3 | characterization API 가 ⑦ 을 표현 못 함 | 어댑터 반환에서 통합 `isError` 를 **폐기**하고 **`isUserError`·`isAnalysisError` 분리**(현행이 배너/표 차단에 각각 쓴다). §13 을 **10항목 전부**로 정정(6종 오기 수정) |
| 4 | 프론트 `assertSingleMembership` 잔재 | §13·§12-13·§16-2 에서 전량 제거. **백엔드 `findAllMemberTeamPairs()` accountId 유일성 테스트로 일원화**(P1-a DoD) |
| 5 | `utilMemberCount` 라벨 부재 | i18n `metric.utilMembers`(+tip) · `note.threeCounts` 신설. **인원 3종(조직/참여/가동률)을 각각 라벨+Tooltip 으로** 표기하도록 §13-4·A-2 DoD 에 명시 |
| 6 | §A-0 색인이 사본을 재승격 | 색인이 **정본 한 곳만** 가리키도록 #10·#14·#17·#20·#21 정정. A-1 에 "필드 분류 정본은 §8-4 뿐" 규칙 추가 |
| 7 | §13·§14 오기 | `readyProjects`→`contributingProjects` · 6종→10항목 · 검증 15-d/e 갱신, 15-g(분류 정본 일치) 추가 |

**설계 종료.** 이후 변경은 구현 중 발견 사항으로 처리한다.

### 16-5. 배치 변경 반영 (6차 · 2026-08-03) — **사용자 결정**

> "팀별 비교를 통합 대시보드에서 **제거**하고 자원관리 조직 현황 쪽에서 처리하는 게 어떠냐. **별도 메뉴로** 팀별 가동률·팀별 비교·팀별 인력현황 등 인사이트를 **차트로** 제공. 뭔가 통합 대시보드랑 안 맞는 것 같다."
> 추가: **"차트 적극 활용할 것."**

**확정**: `/resource` 에 **팀 분석 탭 신설**(4탭) · 통합 대시보드 **팀 축 제거** · **차트가 주인공**(§4-D). 지표·계산 규약은 전부 유지 — **바뀐 것은 배치다.**

#### P1-a / P1-b 산출물 판정

| 산출물 | 판정 | 근거 |
|---|---|---|
| `src/permission/TeamAnalyticsScope.js` + 조합표 테스트 | ✅ **그대로 유효** | 판정 규칙은 배치와 무관 |
| `getTeamAnalyticsScope` (Controller/Service/응답) | ✅ **유효** — ⚠ **grant 만 축소** `OR[REPORT,RESOURCE_MGMT,TEAM_MGMT]` → **`R('RESOURCE_MANAGEMENT')`** | 유일 소비처가 `/resource` 탭 · C 는 미사용 · 미배포라 안전(§3-3) |
| `userPermissionCheck.team.teamAnalyticsScope` | ✅ **유효** | 탭 노출 게이트로 그대로 사용 |
| `utilization.people[].utilBand` | ⚠ **고아 필드(호환 유지)** | 밴드 차트의 실제 원천은 `getResourceOverview.people[].utilBand` 다. 이 필드는 새 탭의 **fallback 이 아니다** — 소비처 0. 제거는 계약 축소라 유지하고 §12-12 와 함께 P3 정리 후보 |
| `MemberTeamPairs.test.js` · `PortfolioUtilBand.test.js` | ✅ 유효 | |
| `rollupTeamTree` 스코프 필수화 + `OrganizationTab` 마이그레이션 | ✅ **그대로 유효** | 새 탭이 같은 함수를 소비 |
| `teamAnalyticsFields.js`(분류 정본·`BAND_COUNT_FIELDS`) | ✅ **그대로 유효** | |
| `teamComparison.js`(`teamMetricsByTeam` + `teamComparison`) | ✅ **모듈 유효 · 소비처 변경 · 파일 이동** → `utils/team/teamMetrics.js` | B1 삭제로 소비처가 사라지지만 **새 탭 #2 차트가 그대로 쓴다**. 입력 원천만 `getResourceOverview` 로 교체(시그니처 불변, §8-2) |
| `useProjectResourceMembers` + `resourceMembersAdapter` + characterization 10항목 | ✅ **그대로 유효** | C(P1-e) 가 소비 |
| `teamAnalyticsKeys.js` | ✅ 유효 | |
| ~~`pages/teamAnalytics/` 신규 라우트 · 사이드바 항목~~ | 🔴 **폐기**(미착수) | `/resource` 탭으로 흡수 |
| ~~B 팀 서브탭 · `ComparisonTabs.TABS` 런타임 조립~~ | 🔴 **폐기**(미착수) | 팀 축 제거로 불필요 |

#### 삭제 대상 (P1-d)

| 대상 | 처리 |
|---|---|
| `pages/portfolio/widgets/PortfolioTeamComparison.jsx` | **파일 삭제** |
| `ComparisonTabs.jsx` 의 팀 위젯 블록·import·`teamMeta`/`memberTeamMap` prop | 코드 삭제 |
| `PortfolioDashboardPage.jsx:175-176` prop 전달 | 코드 삭제 |
| `locales/{kr,en}/portfolio.json` 의 `teamCompare.*` 12키 | **이동**(→ `teamAnalytics.json`). `globalUtilNote` 는 **삭제**(프로젝트 필터가 없어져 무의미) |
| `getPortfolioDashboard.teamMeta`·`memberTeamMap`(백엔드) | **유지**(고아 필드로 §12-12 등재, P3 정리) |

#### 이 변경으로 **소멸한** 기존 지적사항

| 소멸 | 원래 지적 |
|---|---|
| ✅ | **N1** B3/B4 집계 계약 부재 → 계약은 P1-b 에 이미 구현됨, 화면만 이동 |
| ✅ | **N5** B1↔B2~B5 범위 배지·상호 안내 — B1 이 사라져 **비교 대상 자체가 없다** |
| ✅ | **§12-12** B1/B2~B5 스코프 비일관 — 소멸(고아 필드 항목으로 대체) |
| ✅ | **B 탭 조립 `ReferenceError`**(module-level `TABS`) — 탭을 만들지 않으므로 소멸 |
| ✅ | **인덱스 시프트 우려** — `TABS` 무변경이라 소멸 |
| ✅ | **M-1 예외 안내**(가동률이 프로젝트 필터에 무반응) — 새 화면에 **프로젝트 필터가 없다**. 예외 처리 자체가 불필요해졌다(D7 근거 ①) |
| ✅ | **P1-a↔P1-d 원자 배포** — P1-c↔P1-d 동반 배포로 대체(더 단순) |
| ⚠ 잔존 | **B4 `delayedShare` 산식** — 배치와 무관. 4차 수정(정상 행 `0`)이 그대로 유효하며 P1-b 에 구현됨 |

#### 권한 영향 (사용자 승인됨)

`/resource` 는 `RESOURCE_MANAGEMENT read` 게이트다. **프리셋 `Team Member`·시드 `Member` 는 팀 비교 접근을 상실한다** — 전사 팀 가동률·인건비 비교는 관리자·PMO 성격이고, 이들은 어차피 `scopeMode: NONE` 이라 새 화면이 빈 상태였을 것이다. **§11-4 배포 공지 1번 항목에 명시.**
**게이트가 오히려 단순해졌다**: 진입 = 기존 `ResourcePage` 게이트 재사용(**새 게이트 0**), 팀 범위 = `scopeMode`.

#### 차트 설계 (신규 §4-D)

`echarts@6.1.0` + 기존 옵션 빌더 9종 재사용, **신규 빌더 0**. 차트 7종(P1 6 + P2 1) 각각에 **답하는 질문·타입·재사용 빌더·원천·인원 기준**을 표로 명시했다. 트리맵/선버스트는 **도입하지 않는다**(계층 표현은 조직 현황 탭 트리가 담당, §4-D 근거).

### 16-6. 5차 외부 검토 반영 (7차 · 최종 정리 · 2026-08-03)

**판정: B — 3개 조건.** 배치 변경 자체는 재고 불필요 판정. 구현(P1-c/d/e) 동시 진행 중이라 **설계서를 실제 계약에 맞춰 정리**했다.

| 조건 | 반영 |
|---|---|
| **1** `/resource` 실행 계약 통일 | 🔴 **REPORT 전면 게이트 제거.** 탭 진입 = `RESOURCE_MANAGEMENT` + `scopeMode!=='NONE'` 뿐. REPORT 는 **축/차트 단위 게이트**로 강등하고 5개 열화 규약을 §5-1 에 명시. `resolveTeamAxis` 폴백을 `effortMd`(REPORT 축) → **`utilization`** 으로 정정 |
| **1-a** util-only 팀 | **`includeUtilOnlyTeams` options 추가**(기본 `false`). REPORT 미보유자는 `selected=[]` 라 `scopedTeamKeys` 가 비어 **전 팀이 사라지는** 결함이 있었다. **"시그니처 완전 불변" 서술을 정정**(위치 인자 불변, options 증가) |
| **1-b** 정적 검사 경로 | `pages/teamAnalytics/**` → **`pages/resource/teamAnalytics/**`**. 옛 경로로는 새 코드를 통째로 놓친다 |
| **1-c** 잔재 삭제 | 사이드바·독립 라우트 체크리스트 폐기 표시, §3-3 제목("grant 변경 없음" → "축소 1건") 정정 |
| **2-a** B4 소비처 | 🔴 표는 "#4 로 이동"이라 했으나 **#4 는 산점도**라 자리가 없었다 → **B4 는 #2 팀 간 비교의 축**(`delayedShare`·`riskScoreWeighted`)으로 확정. **#2 축 매핑 7종 표**를 정본으로 신설 |
| **2-b** 레이더 | 🔴 **P1 제외 → P2 이관.** 완수 규모 산식·4축 정규화 기준·리스크 역변환·`null` 축 처리 4가지가 전부 미정이었다(`radarChartOption` 은 정규화·null 처리를 하지 않는다). **P1 차트 = 5종** |
| **2-c** 빌더 주장 거짓 | 🔴 코드 확인: `stackChartOption` 은 **세로 고정**(`:31-40`), `barChartOption` 은 tooltip 이 **`count` 문구 고정**(`:22`). "기존 API 그대로 커버"는 **거짓이었다** → **"새 빌더 파일 0 + additive 확장 2건"**(`orientation`·`valueFormatter`, 기본값=현행, 기존 호출부 무수정 통과 조건)으로 정정 |
| **2-d** #4 열화 | **고정 버블 크기로 유지**(숨기지 않는다) — x·y 가 RESOURCE 원천이라 인사이트가 성립한다 |
| **2-e** #5 조인 | **조직 인원은 `scope.teams[]` 별도 조인** — `rollupTeamTree` 만으로 인원 3종을 만들 수 없다는 사실 반영. 컬럼별 출처 표 신설 |
| **3-a** 원천 표 | **차트 × resolver × 요구 권한 × 신선도 × 추가 호출** 정본 표 신설. 초안의 과장 3건 정정: "네트워크 0"→**scope 는 탭 전용 추가 호출**, "전체 일 배치"→**혼합**(인원·소속·조직계층은 실시간 SQL), "주 원천 교체"→**축별 분담** |
| **3-b** 접근 상실 범위 | 🔴 "두 세트만 영향" 단정 삭제. **`REPORT.read && !RESOURCE_MANAGEMENT.read` 차집합 전체**가 대상이며 커스텀 세트도 포함된다. §11-5 에 **차집합 산출 5단계**(세트 목록 → 직접 배정자 → **팀 권한 상속자** → 담당자 승인 → 공지) 추가. **④ 승인 없이 배포 금지** |
| **3-c** `utilBand` | "보조 경로" → **"고아 필드(호환 유지, 소비처 0)"** 로 정정 |
| **3-d** 밴드 동치 | **"인물별 값은 동치, 분포는 모집단이 달라 다르다"** 로 정정(Resource 응답이 전 사용자 포함) |

**설계 정리 종료.** 이후는 구현 중 발견 사항으로 처리한다.
