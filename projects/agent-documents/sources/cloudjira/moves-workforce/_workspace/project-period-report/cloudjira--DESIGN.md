# RFC-200 프로젝트 주간/월간 리포트 — 설계서

> 작성 2026-09-07. 구현자는 이 문서와 `CLAUDE.md`를 **둘 다** 따른다. 충돌 시 CLAUDE.md 우선.
> 사용자 확정 제약: **워크로그 원문은 절대 저장하지 않는다. 저장은 프로젝트·기간별 스칼라 한 줄만.**

## 0. 목적과 범위

기존 분석 화면(진척도·이슈/인력/팀 분석·비용)은 전부 **현재 시점의 상태**만 보여 준다. 이 기능은 **기간 동안 무엇이 변했나**를 문장으로 요약해 주는 프로젝트 상세 탭이다.

| 묶음 | 내용 | 저장 |
|---|---|---|
| A. 변화량 | 기간 내 공수·완료/신규/이월 건수·마감 초과·기간 한정 이슈별/인력별 공수·직전 기간 대비 | 없음 (Jira 실시간) |
| B. 판정 문장 | "유입이 완료를 앞섬", "공수 집중", "미기록 인원(연차 차감)" 등 규칙 기반 문장 + 근거 테이블 | 없음 |
| C. 시간축 | 완성률·공수 추이, 보고서 재현 | `project_period_snapshot` 스칼라 행 |

LLM 요약은 범위 밖. 자동 발송은 범위 밖(Forge 스케줄은 실행 시각 지정 불가).

## 1. 단계

구현은 3단계로 나누고 **단계마다 별도 실행·검토**한다. 한 실행에서 다음 단계로 넘어가지 않는다.

- **Phase 1 — 스냅샷 백엔드 (C)**: DDL·마이그레이션·일 배치 후속 캡처·보존 정리·삭제 경로·읽기 resolver·테스트
- **Phase 2 — 리포트 백엔드 (A)**: 기간 지표 resolver·페처·캐시·권한·테스트
- **Phase 3 — 프론트 (A+B+C)**: 리포트 탭·판정 규칙(순수 함수)·근거 테이블·추이 차트·복사·i18n

---

## 2. Phase 1 — `project_period_snapshot`

### 2.1 DDL (`src/rdb/schema/ddl/projectPeriodSnapshot.sql.js`, `ddl/index.js`에 export, `migrate.js`에 신규 단계 추가)

```sql
CREATE TABLE IF NOT EXISTS project_period_snapshot (
    project_id           BINARY(16)  NOT NULL,
    period_type          CHAR(1)     NOT NULL,   -- 'W' | 'M'
    period_key           VARCHAR(8)  NOT NULL,   -- 'W': ISO 주 '2026-W36' / 'M': '2026-09'
    completion_rate      DOUBLE      DEFAULT 0,
    schedule_rate        DOUBLE      DEFAULT 0,
    diff_percent_point   DOUBLE      DEFAULT 0,
    risk_score           DOUBLE      DEFAULT 0,
    planned_total_md     DOUBLE      DEFAULT 0,  -- 관측 시점 누적
    actual_total_md      DOUBLE      DEFAULT 0,  -- 관측 시점 누적
    actual_md_in_period  DOUBLE      DEFAULT 0,  -- 해당 기간에 속한 공수 1개 스칼라
    issue_done           INT         DEFAULT 0,
    issue_in_progress    INT         DEFAULT 0,
    issue_todo           INT         DEFAULT 0,
    member_count         INT         DEFAULT 0,
    source_aggregated_at TIMESTAMP   NOT NULL,   -- 복사 원본(live 집계)의 시각
    captured_at          TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, period_type, period_key)
);
```

- 보조 인덱스 **없음** (저장 최소). 프로젝트별 이력 조회는 PK 선두로 충분.
- 기존 `CREATE TABLE` 본문 무변경 관례 준수. 신규 테이블이므로 `TableReadiness` 존재 프로브만으로 안전. 테이블이 아직 없으면 캡처·읽기 모두 **조용히 skip**(throw 금지, 배치를 죽이지 않는다).
- `actual_mm`·`avg_utilization`·JSON 컬럼·급여는 **넣지 않는다**(사용자 결정).

### 2.2 캡처 — 기존 일 배치의 **성공 후 단계**

위치: `src/resolver/portfolioDashboard/` 의 일 배치(`runPortfolioSnapshot` → `PortfolioAggregator`). 별도 `week` 트리거를 만들지 않는다(Forge는 실행 시각 지정 불가·배포마다 시작점 리셋).

규칙:
1. 집계 루프(`Promise.allSettled`)에서 **이번 실행에 성공한 프로젝트만** 대상. live 행을 SELECT해서 복사하지 않고 **메모리의 집계 결과**에서 스칼라를 뽑는다. 실패 프로젝트는 건너뛴다.
2. 기간 키는 **`Asia/Seoul` 고정**으로 계산한다(현재 코드의 `today()`는 UTC, SQL은 `CURDATE()`라 섞여 있음 — 기간 키만큼은 명시적 KST). 순수 함수 `periodKeys.js`(Forge 의존성 없음)로 분리: `weekKeyOf(dateKst)`, `monthKeyOf(dateKst)`, `lastClosedWeekKey(nowKst)`, `lastClosedMonthKey(nowKst)`. ISO 주(월요일 시작).
3. 실행 시점 기준 **직전에 닫힌 주·월**에 대해, 해당 `(project_id, type, key)` 행이 없으면 INSERT. 이미 있으면 정상 no-op(PK 중복은 삼키되 `INSERT IGNORE`로 다른 오류까지 숨기지 않는다 — 존재 확인 SELECT 후 INSERT, 경합 시 duplicate-key 에러 코드만 무시).
   - 실제로는 "주가 닫힌 뒤 첫 성공 실행"에서 채워진다. 어느 요일에 도는지는 보장 안 되므로 `captured_at`을 화면에 표시한다.
4. `actual_md_in_period`: 집계가 이미 만드는 `weeklyEffort[]`(week = 해당 주 월요일 'YYYY-MM-DD') / `monthlyEffort[]`에서 해당 기간 값 하나만 취한다. 없으면 0. 워크로그 재조회 금지.
5. **종료 프로젝트 유예**: 일 배치 대상은 `getActiveProjectsRepository`(`start_date <= 오늘 <= end_date`)라 종료 후 월말이 오면 그 달 행이 안 남는다. 캡처 대상 선정 시 **`end_date`가 속한 주·월이 아직 캡처되지 않은 프로젝트**는 종료 후에도 대상에 포함한다(종료일 + 최대 40일 이내, 그 기간이 닫힌 뒤 1회). 이 유예 프로젝트는 집계도 돌려야 값이 나오므로 대상 목록 조회 쿼리를 확장하되, **기존 `getActiveProjectsRepository` 계약은 바꾸지 말고** 배치 전용 조회를 추가한다(다른 화면이 같은 함수를 쓴다).
6. **보존 정리**는 캡처 INSERT가 끝난 **뒤에만** 실행: 프로젝트별 `W` 최신 26개, `M` 최신 24개 초과분 DELETE. 캡처 단계가 실패하면 purge를 돌리지 않는다. 상수 `RETENTION = { W: 26, M: 24 }` 한 곳.
7. 캡처·purge 실패는 로그 후 삼킨다 — 기존 배치의 live upsert·rollup을 깨지 않는다.

### 2.3 삭제 경로

프로젝트 삭제 **2곳** 모두에 멱등 DELETE 추가(트랜잭션·cascade 없음):
- `src/resolver/project/ProjectService.js` 직접 삭제 순서 안
- `src/resolver/project/ProjectDeletionService.js` deletion saga 안

### 2.4 읽기 resolver

- `getProjectPeriodSnapshots({ projectId, periodType, limit })` → `{ success, rows: [{ periodKey, completionRate, scheduleRate, diffPercentPoint, riskScore, plannedTotalMd, actualTotalMd, actualMdInPeriod, issueDone, issueInProgress, issueTodo, memberCount, sourceAggregatedAt, capturedAt }] }` — `periodKey` 오름차순, `limit` 기본 26/24, 상한 RETENTION.
- Controller: `src/resolver/projectPeriodReport/ProjectPeriodReportController.js` (`registerProjectPeriodReportController`) — `src/index.js`의 `CONTROLLER_REGISTRARS` 에만 추가.
- `PermissionMap`: `getProjectPeriodSnapshots: R('REPORT', 'detail')` — `projectId` 필수(RFC-198).
- 테이블 미존재 시 `{ success: true, rows: [], unavailable: true }`.

### 2.5 테스트 (jest, 루트 `npm test`)

- `periodKeys.js` 순수 함수: 연말/연초 ISO 주 경계, KST 자정 전후, 월 경계.
- 캡처 대상 선정: 성공분만·중복 no-op·종료 유예·purge 순서(캡처 실패 시 purge 미실행).
- `permissionMap.contract.test.js` 통과.

---

## 3. Phase 2 — 기간 리포트 resolver

### 3.1 계약

`getProjectPeriodReport({ projectId, periodType: 'W'|'M', periodKey })` → **한 기간**의 지표. 직전 기간 비교는 프론트가 같은 resolver를 `periodKey`만 바꿔 두 번 호출해 만든다(25초 invoke 제한 회피, 캐시 적중률 상승).

```
{
  success: true,
  period: { type, key, startDate, endDate },        // KST 날짜 'YYYY-MM-DD', end inclusive
  effort: { totalMd, byMember: [{ accountId, displayName, md }], byIssue: [{ issueKey, summary, md, share }] },
  issues: {
    done:    { count, keys: [] },      // resolutiondate ∈ 기간 (statusCategory done)
    created: { count, keys: [] },      // created ∈ 기간
    overdue: [{ issueKey, summary, dueDate, assignee }],   // duedate < period.endDate(+1) AND not done, 기간 종료 시점 기준
    openTotal: n                       // 기간 종료 시점 미완료 수(현재 값으로 근사 — 응답에 approx: true)
  },
  members: {
    active: [{ accountId, displayName, expectedWorkdays, loggedDays, md }],   // 기간에 배정된 인원
    unlogged: [{ accountId, displayName, expectedWorkdays }]                  // expectedWorkdays > 0 && md === 0
  },
  cost: { totalInPeriod, currency } | undefined,   // CostAccess.canReadCost(principal) 일 때만
  meta: { computedAt, cached: bool, truncated: bool }
}
```

- `expectedWorkdays` = 기간 내 영업일(주말·공휴일 KVS 제외) − `user_schedule`의 휴가일(`work_ratio` 반영) − 프로젝트 배정 기간 밖 일수. 계산 재료는 `projectProgress`·`resourceAnalysis`에 이미 있다 — **복제하지 말고 import**.
- `byIssue[].share` = 해당 이슈 md / totalMd (0~1).
- 급여·원가는 `SalaryVisibility` 정책과 **별개로** `CostAccess.canReadCost(principal)`를 요구. 미허용이면 `cost` 키 자체를 생략.

### 3.2 페처

- 기존 `getBulkIssuesByProject`는 `maxResults=5000` 단발이라 **사용 금지**. `fetchAllProjectIssues`(100건 + `nextPageToken` 루프) 방식의 기간 전용 페처를 `src/resolver/projectPeriodReport/PeriodIssueFetcher.js`로 둔다. 기존 페처는 고치지 않는다(다른 화면 회귀 방지, 메모리 `feedback_worklog_fetch_isolation`).
- 워크로그는 `ResourceWorklogFetcher.getResourceProjectWorklogs`의 20건 절단 보완 로직을 재사용하거나 같은 규칙으로 구현. JQL은 `worklogDate >= start AND worklogDate <= end` + `moves_RMS_projectId`. 필드 조회 시 `fieldsByKeys: true`.
- 전부 `asUser()`. `asApp()` 금지.
- `p-limit` 동시성은 기존 값 따름.

### 3.3 캐시

KVS, TTL 10분. 키에 **viewer `accountId` 포함**: `PeriodReport:${accountId}:${projectId}:${type}:${key}` (기존 `ResourceList:` 캐시는 viewer가 없어 권한 다른 사용자에게 새어 나갈 수 있는 구조 — 답습 금지). 닫힌 기간(`endDate < 오늘`)은 TTL 60분.

### 3.4 권한

- `PermissionMap`: `getProjectPeriodReport: R('REPORT', 'detail')`, `projectId` 필수.
- 서비스에 `principal` 전달. `cost` 게이팅은 3.1.

### 3.5 테스트

- 순수 계산(기간 필터·share·unlogged 판정·expectedWorkdays)은 Forge 의존성 없는 모듈로 분리해 jest.
- 페처는 `nextPageToken` 루프·20건 절단 보완을 mock으로 검증.

---

## 4. Phase 3 — 프론트

### 4.1 위치

- 페이지: `static/ui/src/pages/projectDetail/periodReport/` (`PeriodReportPage.jsx` 외)
- 탭: `constants/tabs.js`의 `projectDetailTabs`에 **lazy** 탭 추가(`CommonTab` Suspense 아래, 첫 탭은 건드리지 않음). `canRender: canReadReport`. 위치는 분석 리포트 그룹 옆.
- 쿼리 키: `utils/queryKey/periodReportKeys.js` 신설 — `periodReportKeys.report(projectId, type, key)`, `periodReportKeys.snapshots(projectId, type)`. `queryKeyContract.test.js` 통과.
- 공용 UI: `PageContainer`/`PageHeader`, `Card`, `CommonTable`, `Skeleton`(스피너 금지), `chartPalette`, `EmptyState`, `InfoTip`.

### 4.2 화면

```
[헤더] 프로젝트명 · [주간|월간] · [◀ 2026-W36 ▶] · 생성 시각 · [마크다운 복사]
[진척]  완성률 X% (계획선 Y%, ±Z%p) · 추이 차트(스냅샷 W 26 / M 24) · 계획 vs 실투입 MD     ← Phase 1 데이터 + 현재 진척도
[이번 기간 사건] 기록 공수(전기 대비) · 완료/신규/이월 · 마감 초과 목록 · 공수 집중       ← report(cur) + report(prev)
[인력]  투입 N명 중 미기록 M명(연차 반영) · 개인별 공수 표
[비용]  cost 키가 있을 때만 렌더
```

- 각 판정 문장은 **근거 테이블로 펼쳐지는 링크**를 가진다(숫자·기간·제외 조건 명시).
- 현재 기간이 아직 안 닫혔으면 "진행 중(오늘까지)" 배지. 스냅샷 행이 없는 기간은 추이에서 결측 표시.
- 로딩은 스켈레톤. `cur`/`prev` 두 쿼리는 병렬.

### 4.3 판정 규칙 — `periodReport/rules/*.js` 순수 함수

입력 `(cur, prev, snapshots)` → `findings: [{ code, severity: 'info'|'warn'|'bad', params, evidence: 'effort.byIssue' | ... }]`. 문장은 `code`로 i18n. 첫 릴리스 규칙:

| code | 조건 | severity |
|---|---|---|
| `EFFORT_DELTA` | 항상. `Δ = cur.effort.totalMd − prev.effort.totalMd` | info |
| `INFLOW_EXCEEDS_DONE` | `created.count > done.count` | warn |
| `OVERDUE_PRESENT` | `overdue.length > 0` | bad |
| `EFFORT_CONCENTRATED` | 최대 `share ≥ 0.3` | warn |
| `UNLOGGED_MEMBERS` | `unlogged.length > 0` | warn |
| `PROGRESS_BEHIND` | 최신 스냅샷 `diffPercentPoint < −5` | bad |
| `NO_ACTIVITY` | `cur.effort.totalMd === 0 && created.count === 0` | info |

`prev`가 없으면 델타 규칙은 생략(문장에 "비교 없음"). 규칙은 jest로 전수 테스트.

### 4.4 복사

"마크다운 복사" — 판정 문장 + 핵심 숫자를 마크다운 텍스트로 만들어 `navigator.clipboard.writeText`. 파일 다운로드 아님. 비용 블록은 렌더된 경우에만 포함.

### 4.5 i18n

`locales/kr/periodReport.json` + `locales/en/periodReport.json` 신설 → `cd static/ui && npm run merge`. `ko-KR.json`/`en-US.json` 직접 수정 금지.

### 4.6 검증

`cd static/ui && npm test`, `CI=true npm run build`.

---

## 5. 하지 않는 것

- 워크로그·이슈·인력 단위 원장 저장
- LLM 서술, 자동 발송, PDF
- 과거 스냅샷 정정(덮어쓰기). 기존 키는 `ALREADY_CAPTURED`로 거절. 정정이 필요해지면 그때 `revision` 도입
- 기존 페처(`getBulkIssuesByProject`)·기존 캐시 키·`getActiveProjectsRepository` 계약 변경
