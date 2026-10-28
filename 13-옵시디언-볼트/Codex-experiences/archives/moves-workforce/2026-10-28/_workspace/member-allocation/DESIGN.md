# 프로젝트 인력 참여 기간 · 투입률 (계획 기반 모드) 설계서

| 항목 | 내용 |
|---|---|
| 버전 | **v1.1** (Codex 검토 반영, 2026-09-22) |
| 브랜치 후보 | `RFC-201` |
| 검토 기록 | `codex_review.md` (v1.0에 대한 Codex 검토 원문, 45KB) · §13 반영표 |
| 관련 | [[project-work-assignment]] · [[project-resource-management]] · [[project-salary-policy]] · [[project-portfolio-dashboard]] · 분석 지표 감사(2026-06-11) |

---

## 0. 배경과 목표

### 0.1 문제

- `projectusers`에는 **투입·철수 기간 컬럼이 없다**(`role_key`·`level_key`·`salary`·`salary_type`뿐). 문서의 "참여 기간"은 전원에게 **프로젝트 기간을 그대로 적용**한 값이다.
  - 급여 월할 `(연봉/12) × projectMonths`, 소진 추정 `Σ유효급여 × 프로젝트 일정 경과율`, 전사 가동률 분모 = 참여 **프로젝트 기간** 합집합, 프로젝트 인력 분석 분모 = **조회 기간** 근무일(전원 동일), 참여 프로젝트 수·참여 이력·관계도 = 프로젝트 `end_date` 기준.
- 그래서 (1) 중간 투입·중도 철수 인원의 가동률·인건비가 왜곡되고, (2) "다음 달에 누가 비나"를 답할 수 없고, (3) **워크로그가 없는 조직에서는 인력·공수 축이 통째로 0**이다.

### 0.2 목표

1. 인원별 **참여 기간**과 **투입률**을 기록한다.
2. 기존 지표가 **개인 기간을 분모로** 쓰도록 소비처를 전부 교체한다. 한 곳만 바꾸면 화면마다 값이 갈린다.
3. 워크로그 없이도 채워지는 **계획 지표**(계획 MD·계획 부하·미배정 가용)를 추가해, 관리자만 쓰는 조직에서도 **자원 계획** 앱으로 동작하게 한다. 실적이 있으면 계획 달성률로 확장된다.

### 0.3 비범위

- 다중 참여 구간(나갔다 다시 들어옴) — 단일 구간. 단, 내부 모델은 배열로 정규화해 둔다(§2.4, D15).
- 날짜별로 달라지는 투입률 — 구간 내 단일 %.
- 계획 워크로그 자동 생성, 상태 전이 기반 추정 공수, 수요(이슈 계획 공수) 대비 공급 비교(§5.4) — 후속.
- Jira 측 변경(필드·프로퍼티·manifest·scope) — 없음.
- 조회 범위(`MEMBER_ONLY`·`TEAM_ONLY`)에 기간 반영 — 명단 기준 유지(D4).
- 변경 감사 로그 — `updated_id/updated_at`으로 갈음(D20 후속).

---

## 1. 용어와 지표 사전

### 1.1 기간

| 용어 | 정의 |
|---|---|
| 원본 참여 기간 | `joined_at` ~ `left_at` (저장값, null 허용) |
| 유효 참여 기간 | `[max(joined_at ?? p.start, p.start), min(left_at ?? p.end, p.end)]`. `p.end`가 null이고 `left_at`도 null이면 **무기한(OPEN_ENDED)** |
| 경과 참여 기간 | 유효 참여 기간의 끝을 `asOfDate`로 클램프. 시작이 `asOfDate` 이후면 **EMPTY** |
| 기간 상태 | `VALID` / `EMPTY`(교집합 없음 또는 미래) / `OPEN_ENDED` |
| asOfDate | 요청 진입점에서 **한 번** 결정해 SQL·계산 전부에 전달하는 기준일(D13). `CURDATE()`·`toISOString()`·`today()` 혼용 금지 |

### 1.2 지표 사전 (같은 이름을 다른 분모로 쓰지 않는다 — D11)

| 지표 ID (응답 필드) | 분자 | 분모 | 범위 | 비고 |
|---|---|---|---|---|
| `utilization` **실제 가동률** (기존 이름 유지) | 기간 **내** 실적 MD | 실효 가용 MD = 경과 참여 근무일 − 연차·반차 | 화면별 범위(전사 as-of / 프로젝트 as-of / 조회 범위∩참여) | 투입률 **미적용**(D2) |
| `planAttainment` **계획 달성률** (신규) | 기간 내 실적 MD | 경과 계획 MD | 동일 | 계획 MD 0 → `null` |
| `plannedLoadPct` **계획 부하** (신규) | Σ 투입률(as-of 참여 중 프로젝트) | — | as-of | 100 초과 = 과할당 |
| `plannedMd` **계획 MD** (신규) | 구간 근무일 × 투입률/100 | — | 전체 / 경과 / 조회 범위 — **별도 필드**(D19) | 연차 미차감(배정 의도) |
| `outOfPeriodMd` **기간 외 실적** (신규) | 참여 기간 밖 워크로그 MD | — | 조회 범위 | 예외 표시 전용 |
| `effortRate` 이슈 계획 소진율 (기존) | 실투입 MD | 이슈 계획 공수 합 | 프로젝트 | **배정 계획 MD와 다른 개념**. 응답 설명 문구에 "이슈 추정 기준" 명시 |
| `burnRate` (기존, 정의 변경) | `actualCost` | `plannedBudget` | 프로젝트 | 인원별 안분 후에는 `scheduleRate`와 같지 않다(P3) |

불변식: `actualMdTotal = actualMdInPeriod + outOfPeriodMd`, `Σ member.plannedMd = project.plannedMd`.

---

## 2. 데이터 모델

### 2.1 DDL (v024, 멱등 ALTER)

```sql
ALTER TABLE projectusers
  ADD COLUMN IF NOT EXISTS joined_at DATE NULL,
  ADD COLUMN IF NOT EXISTS left_at   DATE NULL,
  ADD COLUMN IF NOT EXISTS allocation_pct TINYINT UNSIGNED NOT NULL DEFAULT 100;
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS assignment_revision INT NOT NULL DEFAULT 0;
```

- `salary_type` 추가 전례와 같은 방식. `migrate.js`에 `v024_alter_projectusers_period_allocation`, `v025_alter_project_assignment_revision` enqueue.
- **3컬럼 방식을 택한 이유(D15)**: 구간 테이블 분리는 roster·급여·권한과 구간의 소유 관계 재정의, 스냅샷·캐시·API 배열화가 따라와 이번 범위를 넘는다. 대신 §2.4처럼 내부 모델을 배열로 정규화해 어댑터만 바꾸면 되게 한다.
- 배포 공존: 구버전 코드는 새 컬럼을 읽지 않으므로 무해. 신버전 코드가 구 스키마를 만나는 순서(마이그레이션 실패)만 `isDBReady`로 방어.
- `(project_id, account_id)` 논리적 유일성은 서비스에서 이미 검사한다. FK 미강제라 부모 존재 확인은 쓰기 전 서비스가 한다(기존 관례).

### 2.2 assignmentRevision (D12)

- 인력 기간·투입률 저장, 인력 추가·삭제, **프로젝트 시작·종료일 변경** 시 `project.assignment_revision += 1`.
- 비용 캐시·인력 분석 캐시 키와 스냅샷 `members_json`에 revision을 넣는다. hit 시 현재 revision과 다르면 miss. prefix 삭제는 보조 수단.
- 스냅샷 응답에 `sourceRevision`·`computedAt`을 실어 프론트가 `STALE` 배지를 붙인다(§6.2).

### 2.3 단일 해석 지점 — `MemberPeriod.js`

`src/resolver/project/MemberPeriod.js` (순수 함수):

```js
resolveMemberPeriod(member, project)         → { start, end|null, state, clampedStart, clampedEnd }
resolveElapsedPeriod(period, asOfDate)       → { start, end, state }   // 미래 시작 → EMPTY
memberWorkdays(period, holidayMap)           → number (EMPTY → 0, OPEN_ENDED → 호출자가 범위를 잘라서 넘겨야 함, 아니면 throw)
plannedMd(period, allocationPct, holidayMap) → number (EMPTY → 0)
memberMonths(period)                         → number (computeProjectMonths 와 같은 산식; OPEN_ENDED → null)
intersect(period, range)                     → period (조회 범위 교집합)
```

**모든 소비처는 이 모듈만 쓴다.** `p.start_date/end_date`를 멤버 기간으로 직접 쓰는 코드는 전부 제거(§4).

### 2.4 내부 모델 정규화 (D15)

DB 어댑터가 `projectusers` 한 행을 `{ member: {…}, assignments: [ { joinedAt, leftAt, allocationPct } ] }`로 변환한다. 계산 함수는 `assignments` 배열을 받는다(v1은 길이 1 강제). 다중 구간 전환 시 어댑터와 검증만 바뀐다.

### 2.5 검증 규칙 (쓰기 경로 공통)

| 규칙 | 처리 |
|---|---|
| `joined_at > left_at` | 거부 `PROJECT_MEMBER_PERIOD_INVALID` |
| `allocation_pct` 정수 0~100 아님 | 거부 |
| 직접 입력한 기간이 프로젝트 기간과 **전혀 겹치지 않음** | 거부 (D3 보강) |
| 일부만 벗어남 | 허용 + 계산 클램프 + 응답 `periodClamped` (D3) |
| 프로젝트 기간 변경으로 기존 인원이 비겹침이 됨 | 자동 삭제 금지. `state: EMPTY`로 유지, 응답에 `newlyEmptyAssignments` 반환, 인력 목록에 경고 (D10) |
| 프로젝트 `start_date` 없음 + `joined_at` null | 거부 |

---

## 3. 계산 원칙

1. **참여 기간은 분모, 기간 내 워크로그는 분자.** 비율 지표(실제 가동률·계획 달성률·이슈 비용 안분)에는 **기간 내 실적만** 쓴다. 기간 외 실적은 `outOfPeriodMd`로 따로 보여 주고 총 실적(`actualMdTotal`)에는 포함한다(**D6 → D7로 수정**: v1.0의 "분자 전부 포함"은 기간을 줄이는 것만으로 가동률이 치솟는 결함).
2. **투입률은 계획에만 곱한다.** 실제 가동률 분모에는 곱하지 않는다(D2). 화면은 "실제 가동률"과 "계획 달성률"을 **다른 이름**으로 나란히 둔다.
3. **급여 원천별 적용(D1 → D14로 보강)**
   - `ANNUAL`·`LEVEL_BAND`(월 단위 원천): `(월급여) × memberMonths × pct/100`.
   - `PROJECT`(투입급여): 협의된 **고정 총액** — 기간·투입률 미적용. 응답에 `costBasis: 'PROJECT_FIXED' | 'ANNUAL_PRORATED' | 'LEVEL_BAND_PRORATED'`를 실어 UI가 "기간·투입률을 바꿔도 이 금액은 변하지 않습니다"를 표시한다. 고정 총액을 기간 안분하는 모드는 후속.
4. **소진 추정(AC)은 인원별 경과율로.** `Σ member.effectiveSalary × memberElapsedRate`. 인원별 raw 값을 합산한 뒤 총액을 한 번 반올림하고, 그룹·이슈 배분은 잔차 보정으로 합계를 맞춘다(D17). 불변식: `Σ byRole = Σ byLevel = Σ byTeam = actualCost`. `byIssue`는 워크로그 없는 인원분이 빠지므로 `unallocatedActualCost`를 별도 반환.
5. **무기한 구간(D8)**: 프로젝트 `end_date` null이면 전체 계획 MD·계획 인건비는 `null`. 조회 범위 계획 MD와 as-of 경과 값만 계산한다.
6. **하위호환 범위(정정)**: 기존 행(null·100)은 급여·비용·전사 가동률이 **변경 전과 동일**. 단 프로젝트 인력 분석은 조회 범위가 프로젝트 기간 밖으로 나갈 때 분모가 프로젝트 기간으로 **교정된다** — 의도된 변경이며 테스트로 그렇게 고정한다.

---

## 4. 소비처 매트릭스 (전수)

### 4.1 생산자 쿼리 (필드 lineage)

| 쿼리 | 추가 필드 | 소비 |
|---|---|---|
| `FIND_BY_PROJECT_ID` | `joined_at, left_at, allocation_pct` | 인력 목록·비용·진척 |
| `FIND_SALARY_BY_PROJECT_ID` | 동일 | 급여 관리·비용 |
| `FIND_HISTORY_BY_ACCOUNT` | `COALESCE(pu.joined_at, p.start_date) AS effective_start`, `COALESCE(pu.left_at, p.end_date) AS effective_end`, raw 2개, `allocation_pct` | 인력 상세 이력 |
| `FIND_ACTIVE_PROJECT_COUNT_BY_ACCOUNTS` | 조건 교체: `COALESCE(pu.joined_at, p.start_date) <= ? AND (COALESCE(pu.left_at, p.end_date) IS NULL OR COALESCE(pu.left_at, p.end_date) >= ?)` — `?` = asOfDate | 인력 현황·인력 상세 참여 수 |
| `FIND_ALL_ALLOCATIONS`(활성) | 동일 조건 + `p.start_date, joined_at, left_at, allocation_pct` | 관계도·계획 부하 |
| `FIND_ALL_ALLOCATIONS_WITH_CLOSED` | 필드만 추가 | 관계도(종료 포함) |
| `FIND_MEMBER_TEAMS_BY_PROJECTS` | 무변경(명단 기준) | 캘린더·팀 |
| 프로젝트 인력 분석용 명단 | 신규: 프로젝트 명단 + 기간·투입률 (워크로그 없는 인원 포함) | B3 |

### 4.2 소비처

| # | 위치 | 변경 | 단계 |
|---|---|---|---|
| F1 | `insertProjectusers` / `updateProjectUsersByKey` / `addTeamMembersToProject` | payload에 `joinedAt?`, `leftAt?`, `allocationPct?`. **JSON 필드 부재 = 미변경, 명시 `null` = 상속으로 되돌림**. SQL은 presence flag `CASE WHEN ? THEN ? ELSE col END`(빈 문자열 sentinel 금지 — 날짜 null이 실제 값) | P0 |
| F2 | 프로젝트 시작·종료일 변경 경로 | revision 증가, `newlyEmptyAssignments` 계산·반환 | P0 |
| G1 | `ProjectUserPanel` 인력 목록 | 컬럼 "참여 기간"(raw + effective, 상속 여부 표시)·"투입률" 인라인 편집, `EMPTY`/클램프 경고. **P0에 포함** — 지표가 바뀌기 전에 값을 볼 수 있어야 원인 추적이 된다 | P0 |
| G2 | `UserAddModal`·`TeamMemberPickModal` | "프로젝트 기간 사용" 체크(기본 on → null 저장). 해제 시 날짜 입력. 투입률 기본 100 (D22) | P0 |
| E2 | 프로젝트 인력 분석(`ResourceAnalysisService`) | 결과 집합 = **명단 ∪ 워크로그 작성자**. 행마다 `assignmentState: ACTIVE|FUTURE|ENDED|EMPTY|NON_MEMBER`, `plannedMd`(조회 범위), `planAttainment`, `outOfPeriodMd`, `periodStart/End`. 워크로그 0 조직에서도 행이 생긴다(D18) | P1 |
| D1 | `WorkAssignmentService` 전사 열 | `plannedLoadPct`(asOf) 추가. `WorkAssignmentRules`: `plannedLoadPct > 100`을 별도 신호 `PLAN_OVERLOAD`로 두고 기존 `utilBand`와 **혼합하지 않음**(D21, 우선순위는 P4에서 결정) | P1 |
| D2 | 프로젝트 배정 후보·"투입 가능만" | `plannedLoadPct < 100 && 기간 내` | P1 |
| C4 | 인력 현황 "참여 프로젝트"·인력 상세 `projectCount` | 4.1 쿼리 값 소비 | P1 |
| B3 | 프로젝트 인력 분석 분모 | 조회 범위 ∩ 경과 참여 기간 근무일. 교집합 없음 → `effectiveMmDays: null`, 행은 유지 | P2 |
| B1 | `PortfolioAggregator.computeGlobalUtilization` | `intervals.push([proj.startDate, projEnd])` → 개인 경과 참여 기간 | P2 |
| B2 | `PortfolioAggregator` 프로젝트 인원 가동률·`avgUtilization` | 인원별 경과 참여 근무일 | P2 |
| B4/B5 | 팀 분석·인력 현황(스냅샷 소비) | 값만 따라옴. **검증 대상** | P2 |
| A1 | `EffectiveSalary.resolveMemberSalaries` | ctx에 `memberMonthsByAccount`·`allocationByAccount`. 없으면 `projectMonths`·100 폴백(무회귀). `costBasis` 반환 | P3 |
| A2a~i | `ProjectCostService`·`CostCalculator` | a `plannedBudget` b `actualCost`(인원별 경과율) c `byRole/byLevel/byTeam`(잔차 보정) d `allocateMonthlyCost` e `allocateIssueCost`(시그니처: `memberCostContext[accountId] = {effectiveSalary, elapsedRate, actualCost, inPeriodSeconds}`; 기간 내 워크로그 비중으로 각 인원의 확정 `actualCost`를 배분) f `burnRate = actualCost/plannedBudget` g EVM 입력값만 교체(정의 불변) h `unallocatedActualCost` i **캐시 hit 경로**: revision 불일치 시 전체 miss, hit에서는 캐시된 `memberCostContext`로만 `byIssue` 재구성 | P3 |
| A3 | `PortfolioAggregator` 프로젝트 비용 | A1·A2 헬퍼 호출 | P3 |
| E1 | `portfolio_project_snapshot.members_json[]` | `joinedAt, leftAt, allocationPct, plannedMd, assignmentState` + 행 레벨 `assignmentRevision`. 구 스냅샷은 프로젝트 기간·100·revision 0으로 읽고 `STALE` 표시 | P4 |
| E3 | 팀 분석 "월별 계획 부하" 위젯 · 프로젝트 대시보드 "계획 대비 실적 공수" | 일별 부하를 원자로 두고 월 평균(근무일 가중)·월 최대·과할당 일수 파생(D16) | P4 |
| F3 | 엑셀 내보내기·데모 시더·프로젝트 삭제 cascade(행 단위라 무영향) | 컬럼 반영 | P4 |
| — | `ProgressCalculator`·`effortRate`·`actualMm`·이슈 페처·권한 맵·manifest | **변경 없음**. `effortRate`는 이슈 추정 기준임을 응답 설명에 명시 | — |

---

## 5. 계획 기반 모드 (워크로그 0 조직)

### 5.1 원칙

워크로그가 없으면 "얼마나 했나"는 알 수 없다. 계획 기반 모드의 핵심 지표는 **소진율이 아니라 capacity**다. 계획 달성률은 실적이 있을 때만 켠다: `actualDataStatus: NONE | PARTIAL | AVAILABLE`(프로젝트 단위, 워크로그 존재 여부).

### 5.2 지표

| 지표 | 산식 | 위치 | 단계 |
|---|---|---|---|
| 인원 계획 MD (전체/경과/조회 범위) | 근무일 × pct/100 | 인력 목록·인력 분석·인력 상세 | P1 |
| 프로젝트 계획 MD | Σ 인원 | 프로젝트 대시보드 헤더 | P1 |
| 계획 부하(오늘) | Σ pct | 작업 배정·프로젝트 배정·인력 현황 | P1 |
| 미배정 가용 MD(조회 범위) | Σ 근무일 × max(0, 1 − 일별 부하/100) | 인력 현황·팀 분석 | P4 |
| 과할당 일수·월 최대 부하 | 일별 부하 파생 | 팀 분석 위젯 | P4 |
| 참여 시작·철수 예정(향후 30일) | 기간 필드 | 배정 화면 카드 | P1 |
| 계획 달성률 | 기간 내 실적 ÷ 경과 계획 MD | 인력 분석 (`AVAILABLE`일 때만) | P2 |

### 5.3 계획 인건비와 계획 MD의 관계 (§6.2 지적)

급여 월할은 달력일/30.4375, 계획 MD는 근무일 기준이라 MD당 단가가 달마다 다르다. 두 값을 나눠 단가처럼 표시하지 않는다. 필요하면 `plannedCostPerMd`를 명시 필드로만 제공하고 `PROJECT_FIXED`는 제외한다.

### 5.4 후속(비범위)

수요 축(이슈 계획 공수 또는 역할별 필요 MD) 대비 공급 비교 `demandGapMd`. 이슈 추정이 신뢰되는 조직에서만 의미가 있어 별도 RFC.

---

## 6. 경계면 계약

### 6.1 resolver (기존 함수 확장, 신규 함수 없음 → 권한 맵 무변경)

```
insertProjectusers / addTeamMembersToProject
  payload: { …, joinedAt?: 'YYYY-MM-DD'|null, leftAt?: 'YYYY-MM-DD'|null, allocationPct?: 0..100 }
updateProjectUsersByKey
  payload: 필드 부재 = 미변경 · null = 상속 · 값 = 변경
getProjectUsers…
  행: + { joinedAt, leftAt, allocationPct, effectivePeriod:{start,end,state}, inheritsStart, inheritsEnd, periodClamped, plannedMd, costBasis }
getResourceAnalysisList
  members[]: + { assignmentState, periodStart, periodEnd, plannedMdInRange, planAttainment, outOfPeriodMd }
  상위: + { actualDataStatus, assignmentRevision }
getWorkAssignmentBoard / Pool · 프로젝트 배정 후보
  company: + { plannedLoadPct, signals: [..., 'PLAN_OVERLOAD'] }
프로젝트 시작·종료일 변경 응답
  + { affectedAssignments, newlyEmptyAssignments }
전사 스냅샷 응답
  + { sourceRevision, currentRevision, computedAt, freshness: 'CURRENT'|'STALE' }
```

- 응답 필드는 additive. 프론트 규칙: **필드 부재 = 집계 전(표시 안 함)**, `null` = 계산 불가(대시 표시). `?? 0` 금지(비용 `byTeam` 교훈).

### 6.2 캐시·스냅샷

| 대상 | 키·조치 |
|---|---|
| 비용 캐시(10분) | 키에 `assignmentRevision` 포함. hit 시 revision 확인, 불일치 → miss. 저장 경로의 prefix 삭제는 보조 |
| `ResourceList` 캐시 | `ResourceList:v2:{projectId}:{assignmentRevision}:{start}:{end}` |
| 전사 스냅샷 | `members_json`에 revision·`computedAt`. 프론트가 `STALE` 배지. 즉시 재집계는 기존 "지금 재집계" 버튼으로(프로젝트 단위 큐는 후속) |

---

## 7. UI

- 인력 목록(P0): 참여 기간(상속이면 회색으로 프로젝트 기간 표시 + "프로젝트 기간" 라벨, 명시값이면 진하게), 투입률(%), 상태 경고(`EMPTY`·클램프). 인라인 편집.
- 추가 모달(P0): "프로젝트 기간 사용" 체크 기본 on. 투입률 100.
- 급여 관리: `PROJECT_FIXED` 행에 "고정 총액 — 기간·투입률 무관" 안내.
- 인력 분석(P1~P2): 기준값 줄에 "분모 = 조회 기간 ∩ 참여 기간". 컬럼: 계획 MD · 실제 가동률 · 계획 달성률(실적 있을 때만) · 기간 외 실적. 상태 배지 `FUTURE`/`ENDED`/`NON_MEMBER`.
- 배정 화면(P1): 후보 행 "계획 부하 120%"(빨강). 카드에 "철수 예정 D-7".
- 인력 상세: 참여 이력 = 유효 기간 + 투입률.
- 통합 대시보드(P4): 스냅샷이 `STALE`이면 카드 위에 "인력 변경 후 재집계 전" 배지.

---

## 8. 테스트

| 대상 | 케이스 |
|---|---|
| `MemberPeriod` | null 상속 / 일부 클램프 / 완전 비겹침 → EMPTY / 미래 시작 → 경과 EMPTY / end null → OPEN_ENDED / `memberWorkdays(OPEN_ENDED)` throw / 계획 MD 공휴일 제외·연차 미차감 / 교집합 |
| 쿼리 계약 | 고정 `asOfDate`로: 프로젝트 미래 시작+멤버 null / 프로젝트 end null / 멤버 미래 시작 / 철수 = 오늘 / 완전 비겹침 / allocation 0 / raw 기간 밖 |
| 쓰기 경로 | 필드 부재·null·값 3분기 / 비겹침 거부 / revision 증가 / 프로젝트 날짜 변경 시 `newlyEmptyAssignments` |
| `ResourceAnalysisService` | 명단만 있고 워크로그 0 → 행 존재 / 비멤버 워크로그 → `NON_MEMBER` / `actualMdTotal = inPeriod + outOfPeriod` / 조회 범위가 프로젝트 밖일 때 분모 교정(의도된 변경) |
| `PortfolioAggregator` | null 행 결과 불변 / 개인 기간 합집합 / 미래 참여 availMd 0 |
| `EffectiveSalary` | ctx 없음 → 기존 값과 동일 / ANNUAL·LEVEL_BAND months·pct 적용 / PROJECT 미적용 + `costBasis` |
| 비용 | `Σ byRole = Σ byLevel = Σ byTeam = actualCost` / `byIssue + unallocated = actualCost` / cache hit = miss / revision 불일치 → miss |
| 권한 계약 | 신규 키 없음 → `permissionMap.contract.test` 무변경 |
| 프론트 | 인라인 편집 3분기 계약, 상속 체크, 배지, 쿼리키 팩토리 |

---

## 9. 결정 사항

| # | 결정 | 대안 | 이유 |
|---|---|---|---|
| D1 | ANNUAL·LEVEL_BAND 월할에만 기간·투입률 적용. PROJECT는 고정 총액 | PROJECT도 안분 | 투입급여는 협의된 총액. → **D14**: `costBasis`로 명시, UI 경고 |
| D2 | 실제 가동률 분모에 투입률 미적용. 투입률은 계획 지표에만 | capacity = 가용×투입률 | 가동률 의미 유지. → **D11**: 지표 이름을 분리해 나란히 표시 |
| D3 | 프로젝트 기간 밖은 **일부 벗어남 허용+클램프+경고, 완전 비겹침은 직접 입력 시 거부**, 프로젝트 기간 변경으로 생긴 비겹침은 EMPTY 유지 | 전부 허용 / 전부 거부 | v1.0의 "전부 허용"은 EMPTY 정의가 없었음 |
| D4 | 조회 범위는 명단 기준, 기간 무관 | 철수 후 차단 | 첫 버전 단순화 |
| D5 | 단일 구간 | 구간 테이블 | → **D15**: 3컬럼 + 내부 모델 배열 정규화 |
| D7 (D6 대체) | 기간 외 워크로그는 `actualMdTotal`에 포함, 비율 지표·이슈 비용 안분에서는 제외, `outOfPeriodMd`로 표시 | 분자 전부 포함(v1.0) | 기간을 줄이면 가동률이 치솟는 결함 |
| D8 | 무기한 구간의 전체 계획값은 null, 조회 범위·as-of 값만 | horizon 설정값 | 설정 하나 늘리지 않음 |
| D9 | allocation 0: 명단·이미 배정 판정 포함, 계획 부하 0, 계획 달성률 null, 실적 발생 시 경고, `PROJECT_FIXED` 비용은 전액(경고) | 0 금지 | 명목 배정 요구 존재 |
| D10 | 프로젝트 기간 변경 = 배정 변경과 같은 영향. raw 보존·effective 재계산·EMPTY 경고·revision 증가 | 자동 정리 | 데이터 자동 삭제 금지 |
| D12 | `project.assignment_revision`을 캐시 키·스냅샷에 포함 | prefix 삭제만 | 저장·삭제가 원자적이지 않음 |
| D13 | `asOfDate` 진입점 1회 결정, SQL 파라미터 전달 | `CURDATE()` 혼용 | 자정 경계 불일치 |
| D16 | 계획 부하는 일별이 원자, 월 값은 평균·최대·과할당 일수 | 월 Σpct | 월초·월말 배정이 200%로 보임 |
| D17 | 인원별 raw 합산 후 총액 1회 반올림, 그룹·이슈는 잔차 보정 | 각자 반올림 | 합계 불일치 |
| D18 | 인력 분석 결과 = 명단 ∪ 워크로그 작성자, `assignmentState` | 워크로그 기준 | 워크로그 0 조직 필수 |
| D19 | 계획 MD는 전체·경과·조회 범위를 별도 필드 | 단일 값 | 무기한·미래 참여 |
| D21 | `PLAN_OVERLOAD`는 별도 신호, 기존 `utilBand`와 혼합 안 함 | 밴드 승격 | 우선순위 정의는 P4 |
| D22 | 상속은 "프로젝트 기간 사용" 체크로 명시, null 저장 | 기본값을 날짜로 저장 | 프로젝트 기간 변경 시 따라가야 함 |

---

## 10. 단계 (재편)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P0** 모델·편집 | DDL v024/v025 · `MemberPeriod` · 어댑터 배열 정규화 · 쓰기 경로 3분기 계약·검증 · 프로젝트 날짜 변경 revision · 4.1 쿼리 · **인력 목록·모달 UI** | 저장·표시·경고 동작, 지표는 불변 |
| **P1** 계획 capacity | 계획 MD(3종)·계획 부하(오늘)·명단 기반 인력 분석(`assignmentState`, `outOfPeriodMd`)·배정 화면 신호·참여 프로젝트 수 | 워크로그 0 조직에서 계획 화면이 채워짐 |
| **P2** 실제 가동률 | B1·B2·B3 분모 교체, 계획 달성률, 캐시 v2 키 | 같은 이름 지표의 분모 일치 검증 패스 |
| **P3** 비용 | A1~A3, 잔차 보정, `burnRate` 재정의, `costBasis`, 캐시 hit/miss 동치 | 합계 불변식 통과 |
| **P4** 스냅샷·위젯 | E1·E3·F3, `STALE` 표시, 신호 우선순위 | — |

P1→P2, P2→P3 사이에 지표 정합성 검증 패스(같은 이름 지표의 분모가 화면마다 같은가)를 둔다. 비용(P3)은 D7·D14·D12가 코드로 닫힌 뒤에만 시작한다.

---

## 11. 리스크

- 소급 변경: 기간·투입률·프로젝트 날짜 변경이 과거 값을 바꾼다. revision과 `STALE` 표시로 "고쳤는데 그대로" 문의를 막는다. 감사 로그는 후속.
- 분모 불일치 재발: §4 매트릭스 + `src/` 전역 grep(`start_date|end_date|projectMonths|baseMmDays`)으로 P2·P3 종료 시 재검증.
- `effortRate`(이슈 추정 기준)와 배정 계획 MD의 혼동: 응답·화면 설명 문구로 구분.
- PPT·소개서 문구: "워크로그가 원천" → "실적은 워크로그, 계획은 배정". 산식 표에 계획 MD·계획 부하 추가.

---

## 12. 검토 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v1.0 | 2026-09-22 | 초안 |
| v1.1 | 2026-09-22 | Codex 검토 반영(§13) |

## 13. Codex 검토 반영표

원문: `codex_review.md`. 상위 5개 지적 전부 채택.

| 지적 | 처리 | 근거 |
|---|---|---|
| D6(기간 외 워크로그 분자 포함)이 비율 지표를 오염 | **채택 → D7** | 기간을 줄이면 가동률 급등 |
| `assignmentRevision`·`asOfDate` 도입 | **채택 → D12·D13**, `project` 컬럼 1개 | 저장·캐시·스냅샷 시점 불일치 |
| null/EMPTY/무기한/프로젝트 날짜 변경 규칙 부재 | **채택 → §1.1 상태 계약, D3 보강, D8, D10** | v1.0 산식이 정의 안 됨 |
| 인력 분석을 명단 기준으로 | **채택 → D18** | 워크로그 0 조직 필수 |
| 비용을 후순위·소비처 세분화 | **채택 → §10 재편, A2a~i** | 회귀 범위 |
| 하위호환 문구 모순(B3) | 채택 → §3.6 정정 | 의도된 교정으로 명시 |
| `burnRate = scheduleRate` 불성립 | 채택 → §1.2 | |
| `allocateIssueCost` 시그니처 | 채택 → A2e `memberCostContext` | |
| C1 SQL 프로젝트 시작일 누락 | 채택 → §4.1 COALESCE | |
| undefined/null → JSON 필드 부재, presence flag | 채택 → F1 | |
| 상속 UI 체크박스 | 채택 → D22 | |
| allocation 0 의미 | 채택 → D9 | |
| 지표 사전·이름 분리 | 채택 → §1.2, `utilization` 이름은 유지(기존 소비자 무변경) | |
| 반올림 잔차 | 채택 → D17 | |
| 월 계획 부하 일별 원자 | 채택 → D16 (P4) | |
| P0에 편집 UI 포함 | 채택 → §10 | |
| 구간 테이블 분리 | **부분 채택**: 3컬럼 유지 + 내부 배열 정규화(D15) | 범위·리스크 |
| 구·신 산식 dual calculation·기능 플래그 | **보류**: null 행은 값이 동일하고 유일한 의도 변경(B3)은 테스트로 고정. 플래그는 과설계 | [[feedback-avoid-overbuilding]] |
| `schemaVersion`·필드별 status 객체 | **보류**: additive + "부재=집계 전, null=불가" 규칙으로 갈음 | 응답 shape 전면 변경 부담 |
| business timezone 설정 | **보류**: `asOfDate` 단일 결정으로 경계 문제는 해소. 시간대 설정은 별도 요구 시 | |
| 수요 대비 공급(`demandGapMd`) | **보류** → §5.4 후속 | 이슈 추정 신뢰 전제 |
| 감사 로그 | **보류** → `updated_id/updated_at` | 후속 |
| `PROJECT_PERIOD_PRORATED` 모드 | **보류** | 요구 없음 |
| 프로젝트 단위 즉시 재집계 큐 | **보류**: 기존 "지금 재집계" + `STALE` 배지 | |
