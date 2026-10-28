# 전사 통합 대시보드 (Portfolio Dashboard) 설계서 — v3

> 슬러그 `portfolio-dashboard` · feature-architect · 2026-06-01 (v3)
> 단일 진실 원천: backend / frontend / verifier 는 본 문서(특히 §2 경계면 계약 + §4 데이터 모델)를 기준으로 작업한다.
> **v3 변경 요지 (정체성 전환)**: "전사 합산" → **"프로젝트별 비교"**. 상단 프로젝트 멀티셀렉트 필터(기본 전체) 신설 · 전사 고정 KPI 카드 제거(선택분 요약 라인으로 대체) · 스냅샷 단위를 **프로젝트별 raw(인원 배열 members[] 포함)** 로 전환 · 프론트가 필터로 즉시 재집계(분포/합산/라인) · 공수 추이=프로젝트별 라인 비교 · 급여/가동률 분포=선택 프로젝트 인원 재집계 · 작업 분포 위젯 정식 포함(보류 해제) · 섹션2 서브탭(개요/인력·비용/공수·작업) · KVS 롤업 축소(메타 + 필터 무관 데이터만). 문제이슈 버블만 필터 예외(항상 전 프로젝트). v2 대비 변경은 §0 요약.
> v1·v2 백업: `01_architect_design_v1.md`, `01_architect_design_v2.md`. 레이아웃 단일 진실: `mockup_v2.html`.
> **코드 정합성 검증 반영 (2026-06-02)**: 실제 코드 대조 후 재사용 함수 반환형/가시성 4건 정정 — ① `getActiveProjectsService` 반환 `{rows}` 언래핑·snake_case 매핑·end_date NULL 제외(§3.2·§5.4) ② `getBulkJiraUsersApi` 반환형 비일관(`[{values}]` vs `{values:[]}`) → `flattenBulkUsers` 가드(§3.2.1·§5.4·§12) ③ `computeLeaveDeductionMap` 미export → `workday.js` 직접 조합(b) 채택(§3.2.1·§5.4) ④ `portfolioRollup` = kvs 직접 키, storage entity 불필요(§4.1·§12). + monthMdMap MD 환산식·migrate 체인 끊김 주의 명시.
> **★ 가동률 분모 이중계상 교정 (2026-06-02, 사용자 확정 A안)**: v3의 "선택분 프론트 재집계(Σ실투입/Σ가용)" 는 **매트릭스 조직(동일 인원·기간중첩 다중 프로젝트)에서 분모 가용MD 이중계상 → 가동률 최대 절반 과소**. 게다가 per-project `effectiveMmDays` 스칼라 합산으로는 **기간 합집합 분모 복원이 원천 불가**(프론트 재집계로 정확화 불가능)임을 확인. v1 도 동일 Σ/Σ 결함을 갖고 있어 "v1 일관"은 결함의 상속이었음. → **가동률을 "필터 무관 글로벌 지표"로 재정의**: 배치가 accountId별 **참여 프로젝트 기간 합집합** 가용MD를 1회 계산(workday.js)·전역 투입MD 합산 → 1인 1값 `utilizationValues[]`(KVS rollup). 조회 service가 settings band 로 read-time 버킷팅(v1 패턴 부활). 프론트 `recomputeUtilization`·§4.4 dedup 합산 **삭제**, `members[].effectiveMmDays`/`utilization` **제거**(작업분포는 effortMd만 사용 → payload 절감). 위젯은 문제이슈 버블처럼 "필터 무관" 배지. 영향: §0-8·§2·§3.2·§4.4·§5.3·§6.6·§6.7·§9·§10·§13.
> **★ 2차 리뷰 반영 (2026-06-02)**: ① `computeLeaveDeductionMap` **복제→export 승격**으로 정정(순수함수라 격리 불요, 연차 로직 단일화로 드리프트 차단 — §3.2.1·§5.4·§7·§12) ② **PARTIAL 노후 데이터 표시**: 행별 `aggregatedAt`+`isStale` → 현황 테이블 "어제 값" 배지(§2.2·§3.3·§5.3·§6.7) ③ **aggregating stale-lock**: `aggregatingStartedAt` 타임스탬프+STALE_LOCK_MS 자동복구(§3.4·§5.5·§13) ④ **Forge 한도 구현시 재확인** 주의(§13) ⑤ **프론트 재집계 골든 픽스처** 1세트(조용한 회귀 차단 — §6.6·§12·§13) ⑥ **end_date 필수값 확정**(무기한 프로젝트 부재 → 누락 없음, 폴백은 방어용 — §2.2·§3.2).
> **★ 구현 후 단순화 (2026-06-02)**: `portfolio_problem_issue` SQL 테이블 **제거**. 문제이슈는 필터 무관 글로벌·고정 TOP50이고 배치가 이미 JS로 sort+slice를 마치며 조회 service가 KVS rollup을 매번 읽으므로, 별도 SQL 테이블은 이점 0(v2 잔재). → **KVS `portfolioRollup.problemIssues`** 로 이관(utilizationValues 와 동일 부류). 제거: DDL `CREATE_PORTFOLIO_PROBLEM_ISSUE_TABLE` · migration v007 · 쿼리 3개(PROBLEM_*) · repo `replaceProblemIssues`/`getProblemIssues` · 조회 SQL read 1회. summary는 255 캡으로 payload 상한. 전량 실패/활성0 시 직전 problemIssues 유지(§3.3). 응답 shape·프론트 소비 변화 없음. (영향: §2.4·§3.3·§4.1·§4.2.4·§5.3·§12)
> **★ UI 보완 (2026-06-02, 사용자 요청 5건)**: ① 위젯별 `InfoTip`(ⓘ 계산/해석) 추가 ② 임의 아이콘 제거 → 공식 `@atlaskit/icon`(헤더 기준시각 clock 등) ③ **"필터 반영/필터 무관" 배지 제거**(동작은 유지, UI 배지만) ④ 위젯별 **차트⇄표 토글**(`ChartTableToggle.jsx`, 로우데이터 DynamicTable) ⑤ **롤/레벨 분포 100% 정규화 폐기 → y축 실제 인원수**(`roleLevelDistribution` 카운트 반환, `stackChartOption normalize:false`). 영향: §2.3·§6.6·§6.7·§6.9·§11.
> **검증 결과: 골격·재사용 매핑 적합, 누적 11건 반영으로 backend 착수 가능. 구현 후 문제이슈 테이블 단순화 + UI 보완 5건.**

---

## 0. v2 → v3 변경/추가 요약 (★ 리뷰용 — 정체성 전환)

| # | 영역 | v2 | v3 변경/전환 | 결정 근거 |
|---|------|----|----|----|
| 1 | **정체성** | 전사 합산 중심(고정 KPI + 전사 분포) | **프로젝트별 비교 중심**. 모든 위젯이 상단 필터에 반응 | 요구 §6-B(목업 v2 확정) |
| 2 | **상단 필터** | 없음 | **프로젝트 멀티셀렉트 필터 신설**(기본=전체 선택). `@atlaskit/select` | 요구 §6-B-1, mockup filterbar |
| 3 | **KPI 카드** | 전사 고정 KPI 5장(`kpi{}` 응답 동봉) | **제거**. 대신 **선택분 요약 라인**(선택 N/총 N · 인원 · 투입MM · 인건비) — **프론트가 선택 projects[]로 계산** | 요구 §6-B-3, mockup `.summary` |
| 4 | **★ 데이터 모델** | 프로젝트행=집계값(완성/일정/MM/분포카운트/총인건비) + KVS 롤업(KPI/히스토그램/effortTrend/utilizationValues) | **프로젝트별 raw 중심**. `projects[].members[]`(인원별 salary/utilization/effortMd/role/level/displayName) + `projects[].monthlyEffort[]` 동봉. 프론트가 필터로 분포/합산/라인 **즉시 재집계** | 요구 §6-B-4. §4 정밀 설계 |
| 5 | **members 저장 위치** | 미보유(분포 카운트 JSON만) | **JSON 컬럼 `members_json`** 채택(별도 정규화 테이블 미채택 — §4.2.1 payload 평가) | §4.2.1 근거 + payload 추정 |
| 6 | **공수 추이** | 전사 합산 1라인(`effortTrend[]` KVS) | **프로젝트별 라인 비교**. `projects[].monthlyEffort[]`(프로젝트당 월별 MD). 프론트가 선택분 라인 렌더 | 요구 §6-B-5, mockup `c_trend` |
| 7 | **급여 히스토그램** | 전사 고정 버킷(`salaryHistogram[]` KVS) | **선택 프로젝트 인원 기준 프론트 재집계**. members[].salary 로 버킷 카운트 | 요구 §6-B-6 |
| 8 | **가동률 분포** | 전사 고정 버킷(`utilization.buckets[]` KVS, utilizationValues[]) | **★필터 무관 글로벌 지표로 환원**(2026-06-02 A안). 배치가 인원별 기간 합집합 가용MD 1회 계산 → `utilizationValues[]`(KVS rollup), read-time 버킷팅. 프론트 재집계·선택분 합산 **폐기**(분모 이중계상·합집합 복원불가) | 분모 이중계상 교정. 사실상 v1 utilization 처리 부활(분모만 합집합 1회로 교정) |
| 9 | **롤/레벨 분포** | `projects[].roleDistribution{key:count}` | **members[]에서 프론트가 카운트**(roleDistribution 사전계산 컬럼 제거 — §4.2.3) | 단일 raw 원천 일원화 |
| 10 | **작업 분포 위젯** | 보류(§10) | **정식 포함**. scatter-aggregate-bar. 점=members[].effortMd | 요구 §6-B(목업 `c_work`) |
| 11 | **레이아웃** | 3섹션 평면(섹션2에 위젯 6종 나열) | **섹션2 서브탭(개요 / 인력·비용 / 공수·작업)** + 섹션3(리스크/문제)은 서브탭 밖 | 요구 §6-B-7, mockup `.subtabs` |
| 12 | **KVS 롤업** | KPI/utilizationValues/effortTrend/salaryHistogram/totalSalary 동봉 | **축소**: 메타(lastAggregatedAt/aggregateStatus/aggregating)만. 전사 고정 합산 위젯 제거로 rollup.kpi/histogram/effortTrend 불요 | 요구 §6-B-4 |
| 13 | **문제이슈 버블** | 전사 TOP50(SQL) — 변경 없음 | **유지(필터 예외)**. "필터 무관 · 전 프로젝트" 배지 | 요구 §6-B-2 |
| 14 | **응답 구조** | `{kpi, projects[분포카운트], roleMeta, levelMeta, utilization, effortTrend, salaryHistogram, problemIssues}` | `{projects[ + members[], monthlyEffort[]], roleMeta, levelMeta, salaryBuckets(경계만), problemIssues}` — kpi/utilization/effortTrend/salaryHistogram **제거** | §2 전면 재작성 |

**v2에서 유지(변경 없음)**: 배치 구조(PortfolioAggregator/scheduledTrigger/fire-and-forget 수동트리거), 활성 프로젝트 정의(날짜기준), 권한 `REPORT` 게이트, 라우트 `/dashboard`, read-time diagnosis/status·role·level 이름 조인, 문제이슈 TOP50(2026-06-02 KVS rollup으로 이관 — §4.2.4), projectusers per-project 인력 조회 경로, ECharts 단일, 산식 전부 기존 재사용, coworkerFieldId 백엔드 조달.

---

## 1. 개요 / 영향 범위

PMO/경영진이 **선택한 프로젝트들을 가로질러 비교**(인력·공수·진척·인건비·리스크)하는 신규 최상위 화면. v3에서 정체성이 "전사 합산"에서 **"프로젝트별 비교"** 로 전환됨. 상단 멀티셀렉트로 비교 대상을 고르면 모든 위젯이 선택분에 반응(문제이슈 버블만 예외 — 항상 전 프로젝트).

데이터 전략: **사전 집계(Scheduled Trigger 배치) → 프로젝트별 raw 스냅샷 적재 → 대시보드는 스냅샷 배열만 조회 → 프론트가 필터·재집계**. 배치는 여전히 전 프로젝트 1회 집계(온디맨드 across 집계 금지 — 256MB/타임아웃). **달라진 핵심**: 스냅샷이 집계값이 아니라 **프로젝트별 raw(인원 배열 + 월별 공수)** 라 프론트가 어떤 부분집합이든 즉시 재집계 가능.

| 축 | 신규/수정 | 내용 |
|----|----------|------|
| 백엔드 (조회) | 신규 도메인 | `src/resolver/portfolioDashboard/` (Controller/Service/Repository) — 스냅샷 배열 + 문제이슈 + 메타만 읽음. **KPI/분포 사전계산 제거** |
| 백엔드 (배치) | 신규 핸들러 | `PortfolioAggregator.js` + `src/trigger/portfolioSnapshot.js`. **프로젝트별 members[] + monthlyEffort[] raw 적재로 확장** |
| DB | SQL 테이블 ×1 | `portfolio_project_snapshot`(프로젝트별 1행 + **`members_json`·`monthly_effort_json`** JSON 컬럼) + KVS `portfolioRollup`(메타 + utilizationValues + **problemIssues TOP50**). migrate v006. ※문제이슈 테이블 제거(2026-06-02, §4.2.4) |
| 프론트 | 신규 최상위 라우트 | `/dashboard` → `static/ui/src/pages/portfolio/`. **상단 필터바 + 섹션2 서브탭 + 위젯 10종 + 프론트 재집계 유틸** |
| 차트 | 옵션 1수정 + 1신규 | `stackChartOption` 정규화 옵션 + `scatterChartOption.js` 신규(버블·작업분포 공용) |
| i18n | 신규 파일 | `locales/kr/portfolio.json` · `locales/en/portfolio.json` (merge) |
| 권한 | 재사용 | `canRead('REPORT')` 게이트 |

**산식은 전부 기존 재사용**(진척 3층·MM·가동률·진단·확정지연·급여). v3 신규는 **프론트 재집계 유틸**(필터·분포·합산·라인) + 배치의 **per-member 조립**(projectusers + 워크로그 totalMd + Jira displayName 병합)뿐.

---

## 2. 경계면 계약 (★ 이 설계의 단일 진실)

`responseWrapper` 는 서비스 반환 객체를 **루트로 펼친다**(`{ success:true, ...result }`). content 래핑 없음 — 진척도 페이지와 동일. 프론트는 `res.success`, `res.projects` 등을 루트에서 직접 읽는다.

### 2.1 조회 / 트리거 resolver

| resolver 함수 | 입력 | 응답 shape (success 시, 루트 펼침) | 대응 프론트 훅/쿼리키 |
|--------------|------|-----------------------------------|---------------------|
| `getPortfolioDashboard` | `{}` | `{ success, lastAggregatedAt, aggregateStatus, projects:[…(members[],monthlyEffort[] 포함)], roleMeta, levelMeta, salaryBuckets:[…], utilization:{buckets,totalPeople,avgUtilization}, problemIssues:[…] }` | `useQuery` / `portfolioKeys.dashboard()` |
| `triggerPortfolioAggregation` | `{}` | `{ success, started:true, lastAggregatedAt }` | `useMutation` (수동 재집계) |

> `getPortfolioDashboard` 는 **단일 호출로 전 프로젝트 raw 스냅샷을 한 번에** 반환한다. 프론트가 받은 배열을 메모리에서 필터·재집계한다(추가 호출 없음). 스냅샷 없으면 `aggregateStatus:'EMPTY'` + 빈 배열들(에러 아님).
> **★ v3 제거 필드**: `kpi`(전사 고정 KPI), `effortTrend`(전사 1라인), `salaryHistogram`(전사 카운트). 이 3개는 **프론트가 projects[].members[] / monthlyEffort[] 로 선택분 재집계**한다. `salaryBuckets`(버킷 경계 정의)만 응답에 남김(프론트 카운트의 빈 경계 공유용 — §2.3).
> **★ utilization 은 (2026-06-02 A안으로) 필터 무관 글로벌 지표라 응답에 부활**: `utilization.buckets[]`(read-time 버킷팅 결과) + `totalPeople`(고유 인원) + `avgUtilization`. 분모 이중계상·합집합 복원불가 때문에 **프론트 선택분 재집계를 폐기**하고 배치 글로벌 1회 산출값을 그대로 표시한다(§4.4·§5.3). 문제이슈 버블과 동일한 "필터 무관" 위젯.

### 2.2 응답 필드 상세 (★ 글자 그대로 — 구현·검증·재집계 기준)

```jsonc
{
  "success": true,
  "lastAggregatedAt": "2026-06-01T06:00:00.000Z",  // ISO. KVS rollup.lastAggregatedAt. null 가능(최초 미집계)
  "aggregateStatus": "OK",      // "OK" | "EMPTY" | "PARTIAL"

  // ── 프로젝트별 raw 스냅샷 배열 (portfolio_project_snapshot 매핑). 정렬: risk_score desc ──
  // 모든 위젯(문제이슈 제외)이 이 배열을 필터링해서 재집계한다.
  "projects": [
    {
      "projectId": "uuid-string",
      "projectName": "결제 플랫폼",
      "statusKey": "status-xxxx",
      "statusName": "진행중",       // read-time status KVS 조인
      "statusColor": "blue",
      "startDate": "2026-01-01",   // 필수값(실데이터 NULL 미발생)
      "endDate": "2026-06-30",     // 필수값 — 무기한 프로젝트 부재(사용자 확정 2026-06-02)

      // 진척/공수/리스크 (프로젝트 단위 집계값 — 현황 테이블·리스크가 직접 소비)
      "completionRate": 0.58,      // 0~1
      "scheduleRate": 0.71,        // 0~1
      "diffPercentPoint": -13.0,   // (완성-일정)*100 %p
      "diagnosisStatus": "delayed",// read-time threshold 적용 (delayed|caution|normal)
      "plannedTotalMd": 320.0,
      "actualTotalMd": 290.5,
      "actualMm": 14.5,
      "riskScore": 13.0,           // = max(0, -diffPercentPoint)
      "riskProjectFlag": true,     // read-time (diagnosisStatus==='delayed')
      "issueSummary": { "done": 40, "inProgress": 12, "todo": 18 },

      // 인력 단위 집계값(테이블 컬럼 즉답용. members[]에서 도출 가능하나 편의 동봉)
      "memberCount": 8,            // = members.length
      "totalSalary": 38000000,     // = Σ members[].salary (이 프로젝트 월 인건비)
      "avgUtilization": 0.83,      // = mean(프로젝트 내 인원 가동률). 프로젝트 단위라 이중계상 무관

      // ★ 행별 집계 시각 (portfolio_project_snapshot.aggregated_at). PARTIAL 시 노후 행 식별용 — §3.3
      "aggregatedAt": "2026-06-01T06:00:00.000Z",  // 이 프로젝트 스냅샷이 마지막으로 갱신된 시각
      "isStale": false,            // read-time 산출: aggregatedAt < lastAggregatedAt(이번 배치) → true (직전 값 유지된 실패 프로젝트)

      // ── ★v3 핵심: 인원별 raw 배열 (members_json) ──
      // 프론트가 이 배열로 급여 히스토그램·작업 분포·롤/레벨 분포를 재집계
      // ※가동률은 더 이상 members[]로 재집계하지 않음(글로벌 utilization 블록 사용 — 분모 이중계상 교정, 2026-06-02)
      "members": [
        {
          "accountId": "5f1a…",      // Jira accountId (급여 히스토그램 dedup 키)
          "displayName": "홍길동",    // 배치가 getBulkJiraUsersApi로 조달. null/미상 시 accountId 폴백
          "roleKey": "role-bbbb",     // projectusers.role_key. null 가능
          "levelKey": "level-2",      // projectusers.level_key. null 가능
          "salary": 5200000,          // projectusers.salary (월). null/0 가능. ※민감 — §13
          "effortMd": 18.5            // 이 프로젝트에서 그 인원의 작업 공수(MD). 워크로그 totalMd. 없으면 0
          // ★제거(2026-06-02): effectiveMmDays/utilization — 프로젝트별 분모는 합산 시 이중계상 → 글로벌 utilization 블록으로 이관
        }
      ],

      // ── ★v3 핵심: 월별 공수 배열 (monthly_effort_json) — 공수 추이 라인 비교용 ──
      "monthlyEffort": [
        { "month": "2026-01", "md": 42.0 },   // 이 프로젝트의 해당 월 투입 MD
        { "month": "2026-02", "md": 51.5 }
      ]
    }
  ],

  // 롤/레벨 이름 매핑 사전 (read-time KVS role/level 조인 — 키→이름). 차트 범례/축 라벨용
  "roleMeta":  { "role-aaaa": "PL", "role-bbbb": "Developer", "role-cccc": "QA" },
  "levelMeta": { "level-1": "주니어", "level-2": "미들", "level-3": "시니어" },

  // 급여 히스토그램 "버킷 경계 정의"만 (카운트 아님). 프론트가 선택분 members[].salary 로 카운트.
  // 빈 경계를 응답이 제공 → 프론트는 라벨/경계 일관 유지. 통화·경계는 settings/코드상수 기준(§7-6)
  "salaryBuckets": [
    { "bucket": "0-3M",  "min": 0,       "max": 3000000 },
    { "bucket": "3M-5M", "min": 3000000, "max": 5000000 },
    { "bucket": "5M-7M", "min": 5000000, "max": 7000000 },
    { "bucket": "7M+",   "min": 7000000, "max": null }
  ],

  // ── ★가동률 분포 (필터 무관 글로벌. 2026-06-02 A안). KVS rollup.utilizationValues[] 를 settings band로 read-time 버킷팅 ──
  // 배치가 accountId별 [참여 활성 프로젝트 기간 합집합] 가용MD를 1회 계산(이중계상 없음) + 전역 투입MD 합산 → 1인 1값
  "utilization": {
    "buckets": [
      { "band": "under",  "label": "과소",   "count": 8 },   // < utilizationUnderBand(0.7)
      { "band": "normal", "label": "적정",   "count": 17 },  // under ~ over
      { "band": "over",   "label": "과부하", "count": 6 }    // ≥ utilizationOverBand(1.1)
    ],
    "totalPeople": 31,        // 고유 인원 수(전 활성 프로젝트 dedup)
    "avgUtilization": 0.79    // 고유 인원 평균 가동률
  },

  // ── 섹션3: 문제 이슈 버블 (★필터 예외 — 항상 전 프로젝트 TOP50). KVS rollup.problemIssues 그대로 ──
  "problemIssues": [
    {
      "projectId": "uuid-string",
      "projectName": "프로젝트 A",
      "issueKey": "PROJ-123",
      "summary": "결제 모듈 리팩터링",
      "assignee": "홍길동",        // displayName, null 가능
      "delayDays": 12,            // x축. dueDate 초과 일수. >0 = 지연
      "effortDiff": 4.5,          // y축. 공수편차 MD (actual - planned). >0 = 초과
      "statusKey": "indeterminate",
      "severity": 16.5            // 정렬·버블 크기용 점수(§7-7)
    }
  ]
}
```

> **실패 시(공통)**: `responseWrapper` 가 `{ success:false, error:{ name, code, message, cause } }` 반환. 프론트는 `data?.success !== true` 분기.
> **빈 상태**: `aggregateStatus:'EMPTY'` + `projects:[], roleMeta:{}, levelMeta:{}, salaryBuckets:[기본경계], utilization:{buckets:[],totalPeople:0,avgUtilization:0}, problemIssues:[]`.

### 2.3 위젯 ↔ 응답 필드 + 필터 반응 매핑 (★ 재집계 흐름의 핵심)

> "필터링" = `projects.filter(p => selected.has(p.projectId))` 후 위젯별 재집계. "필터 무관" = 원본 전체 사용.

| # | 섹션/탭 | 위젯 | 소비 필드 | 필터 | 프론트 재집계 |
|---|---------|------|----------|------|--------------|
| 0 | 필터바 | 선택분 요약 라인 | 선택 `projects[]` | 반영 | 선택 N / 총 N · 고유인원수 · Σ actualMm · Σ totalSalary |
| 1 | 개요 | 프로젝트별 현황 테이블 | 선택 `projects[]`(name/status/memberCount/actualMm/totalSalary/completion/schedule/avgUtilization/diagnosisStatus) | 반영 | 행클릭 `navigate('/project/'+projectId)` |
| 2 | 인력·비용 | 롤/레벨 분포 비교 | 선택 `projects[].members[].roleKey│levelKey` + `roleMeta`/`levelMeta` (토글) | 반영 | 프로젝트별 members 카운트(★실제 인원수, 정규화 폐기) |
| 3 | 인력·비용 | 프로젝트별 총 인건비 | 선택 `projects[].totalSalary` | 반영 | 프로젝트별 막대(이미 합산값) |
| 4 | 인력·비용 | 급여 구간 분포 | 선택 `projects[].members[].salary` + `salaryBuckets` | 반영 | 선택분 인원(dedup) salary → 버킷 카운트 |
| 5 | 인력·비용 | 가동률 분포 | `utilization.buckets[]` 전체 | **무관** | 없음(배치 글로벌 산출값 직접 표시). "필터 무관" 배지 — §4.4 |
| 6 | 공수·작업 | 공수 추이 비교 | 선택 `projects[].monthlyEffort[]` | 반영 | 프로젝트당 1라인(월 합집합 x축) |
| 7 | 공수·작업 | 작업 분포(scatter-aggregate-bar) | 선택 `projects[].members[].effortMd` | 반영 | 점=인원 effortMd(x=프로젝트), 막대=프로젝트별 평균/합 |
| 8 | 리스크 | 리스크 TOP 프로젝트 | 선택 `projects[]`(riskScore/diffPercentPoint) | 반영 | riskScore desc 정렬·상위 N |
| 9 | 리스크 | 문제 이슈 버블 | `problemIssues[]` 전체 | **무관** | 원본 그대로. "필터 무관" 배지 |

> **요약 라인의 인원은 dedup 합산**: 한 인원이 여러 선택 프로젝트에 참여하면 인원 수는 고유 accountId 집합 크기. 인건비(totalSalary)·투입MM(actualMm)은 프로젝트 단위 합이 자연스러워 단순 Σ(인원 dedup과 별개). 위젯별로 명시(§4.4·§6.6).

### 2.4 배치 핸들러 (resolver 아님)

| 함수 | 트리거 | 동작 |
|------|--------|------|
| `runPortfolioSnapshot(event, context)` | manifest scheduledTrigger (`portfolio-snapshot`, interval: day) | 활성 프로젝트 순회 집계 → `portfolio_project_snapshot` upsert(**members_json·monthly_effort_json 포함**) + KVS `portfolioRollup`(메타 + utilizationValues + **problemIssues TOP50**) set |
| `triggerPortfolioAggregation` (resolver) | 프론트 수동 버튼 | `runPortfolioSnapshot` 로직 fire-and-forget 호출 후 즉시 응답(§3.4) |

---

## 3. 배치 설계

### 3.1 위치 / 이름 (v2 유지)

```
src/trigger/portfolioSnapshot.js          # runPortfolioSnapshot (얇은 어댑터)
src/resolver/portfolioDashboard/
  ├─ PortfolioDashboardController.js       # registerPortfolioDashboardController(resolver)
  ├─ PortfolioDashboardService.js          # getPortfolioDashboardService, triggerAggregationService
  ├─ PortfolioAggregator.js                # aggregateAllProjects/aggregateOneProject/순수함수
  └─ PortfolioSnapshotRepository.js        # SQL upsert/select(2테이블) + KVS rollup get/set
src/rdb/query/PortfolioSnapshotQuery.js
src/rdb/schema/ddl/portfolioSnapshot.sql.js
```

### 3.2 집계 로직 (★ v3: per-member 조립 추가)

```
aggregateAllProjects():
  1. { rows: projects } = await getActiveProjectsService()   # ★반환은 {rows} 래핑(언래핑 필수). 날짜기준(start<=오늘<=end) — 기존 재사용
     # ★ 행은 SELECT * 라 snake_case(project_id(BIN_TO_UUID됨)/project_name/project_status_key/start_date/end_date) → 조립 전 camel 매핑
     # ★ end_date 는 프로젝트 필수 입력값(사용자 확정 2026-06-02) → 실데이터상 NULL 미발생. 활성 정의 `end_date >= CURDATE()` 가 프로젝트를 누락시키지 않음(무기한 프로젝트 부재)
     #   → §3.2.1의 "end null이면 오늘" 폴백은 방어용으로만 유지(도달 기대 안 함). start/end 모두 값 존재 전제
  2. settings   = getSettingDataService()         # hourRate, currency, progressThreshold, band값
     holidays   = getPublicHolidayListService()   # 1회 조회 후 공유
  3. limit = pLimit(2)
     results = await Promise.allSettled(
        projects.map(p => limit(() => aggregateOneProject(p, settings, holidays)))
     )
  4. perProject = 성공분 → portfolio_project_snapshot upsert
       (행: 진척/공수/리스크 + members_json + monthly_effort_json + total_salary/member_count/avg_utilization)
     allProblemIssues = 성공분 perProject[].problemIssueCandidates 평탄화
       → severity desc → TOP50 → KVS `portfolioRollup.problemIssues` 에 저장(§3.3·§4.2.4)
     failedCount = 실패분 → Sentry
  4.5 ★ 글로벌 가동률 패스(필터 무관, 2026-06-02 A안) — 프로젝트 경계를 넘는 인원 단위 1회 집계:
     utilizationValues = computeGlobalUtilization(성공분 perProject[], holidays)   # §4.4
       # accountId별: 투입MD = Σ(프로젝트별 effortMd), 가용MD = [참여 프로젝트 기간 합집합]의 근무일 − 그 인원 연차(합집합 1회)
       # → 1인 1값 가동률 배열. 분모 합집합 1회라 이중계상 없음
  5. KVS portfolioRollup.set('current', {
        lastAggregatedAt:nowISO, aggregateStatus, aggregating:false,
        utilizationValues, utilizationTotalPeople: utilizationValues.length    # ★A안: 글로벌 가동률만 rollup에 부활
     })
     # ★ rollup = 메타 + utilizationValues(필터 무관 글로벌). kpi/histogram/effortTrend 는 여전히 저장 안 함(프론트 재집계)
     # ★ utilization 버킷팅은 조회 service가 read-time(settings band) 수행 — v1 패턴(§5.3)
```

`aggregateOneProject(project, settings, holidays)` — 진척도 캐시미스 경로 + **v3 per-member 조립**:

| 단계 | 모듈 | 산출 |
|------|------|------|
| 인력 raw | `getProjectMemberRows(projectId)` (projectusers: account_id/role_key/level_key/salary) | members 기초 |
| 워크로그 | `getResourceProjectWorklogs({projectId, startDate, endDate})` (전용 병렬 페처 p-limit 5) | 인원별 totalMd·월별 합산 원천 |
| 이슈 전체 | `fetchAllIssues(projectId, coworkerFieldId)` (nextPageToken 루프) | 진척/문제이슈 |
| 진척 계산 | `ProgressCalculator` (normalize/completion/schedule/effortTotals/diagnosis/statusDist/delayConfirmed) | completion/schedule/diff/issueSummary/plannedMd/actualMd |
| 가용 MD | **`workday.js` 직접 조합**(`buildHolidayMap`/`getWorkdaysInRange`/`workdayValue` — 모두 export 확인) (baseMmDays − leaveDeduction). ※`ResourceAnalysisService.computeLeaveDeductionMap` 은 **미export(모듈 내부 const)** 라 직접 import 불가 → §3.2.1 주석의 (b) 경로 채택 | 인원별 effectiveMmDays |
| 인원 스케줄(연차) | `getProjectWorkersScheduleRepository` | leaveDeduction 원천 |
| **displayName** | **`getBulkJiraUsersApi(accountIds)`** (Jira `/user/bulk` 100단위 chunk) | members[].displayName |
| **문제이슈 추출** | `computeProblemIssues(normalizedIssues, …, hourRate)` 순수함수(§7-7) | problemIssueCandidates |

#### 3.2.1 per-member 조립 — 재사용 경로 확정 (★ v3 핵심, 실제 코드 확인됨)

> **확인 결과(중요)**: `ResourceAnalysisService.getResourceAnalysisListService` 의 `members[]` 는 `{accountId, totalMd, totalHours, issueCount, effectiveMmDays, leave…}` 만 보유하고 **roleKey/levelKey/salary/displayName 은 없다**. 또한 그 `members[]` 는 **워크로그가 있는 인원만** 포함한다(`userMap` 이 워크로그에서 구성 — L108~120). 그래서 프론트 `ResourceAnalysisPage.jsx`(L184~201)는 `userList`(projectusers) + `analysisMap`(worklog) + Jira `userMap`(displayName) **3원 병합**으로 행을 만든다. 가동률은 프론트에서 `totalMd/effectiveMmDays` 로 계산.
> → **배치는 프론트 컨텍스트가 없으므로 이 3원 병합을 서버에서 직접 수행**해야 한다. members[]의 권위 모수는 **projectusers**(참여 인원 전원, 워크로그 0인 인원 포함)로 잡고, 워크로그 totalMd·effectiveMmDays 를 accountId로 좌조인한다.

조립 절차(aggregateOneProject 내부):
```
projectUserRows = getProjectMemberRows(projectId)          # projectusers 전원: accountId/roleKey/levelKey/salary
worklogs        = getResourceProjectWorklogs({projectId, startDate, endDate})
  → totalMdMap[accountId]   = Σ timeSpentSeconds / (hourRate*3600)            # ResourceAnalysisService 동일식(L129)
  → monthMdMap[YYYY-MM]     = Σ (log.timeSpentSeconds) / (hourRate*3600)      # ★MD 환산식 동일. month = log.date.substring(0,7) 그룹. monthlyEffort 원천

# ★ effectiveMmDays 경로: ResourceAnalysisService.computeLeaveDeductionMap 을 export 승격해 직접 재사용
#   (복제 금지 — 연차 차감 로직 두 벌화 시 ResourceAnalysis 화면 ↔ 대시보드 가동률 드리프트 사고. 순수함수라 공유에 성능/격리 문제 없음)
holidayMap     = buildHolidayMap(publicHolidays)                             # workday.js (settings/holiday는 aggregateAllProjects에서 1회 조회 공유)
baseMmDays     = getWorkdaysInRange(startDate, endDate, holidayMap)          # 기간 내 근무일(평일−공휴일)
scheduleRows   = getProjectWorkersScheduleRepository({projectId, startDate, endDate})   # 연차/반차 원천
leaveDeductionMap = computeLeaveDeductionMap(scheduleRows, startDate, endDate, holidayMap)  # ★ResourceAnalysisService에서 import(승격). 반환 Map<accountId,{days,deduction}>
effectiveMap[accountId] = max(0.1, round1(baseMmDays − (leaveDeductionMap.get(accountId)?.deduction ?? 0)))   # Map이라 .get()

displayNameMap  = flattenBulkUsers(getBulkJiraUsersApi(projectUserRows.map(accountId)))  # ★평탄화 §3.2.1 주석 참조 → {accountId: displayName}

members = projectUserRows.map(u => {
  const effortMd = round1(totalMdMap[u.accountId] ?? 0)
  return {
    accountId: u.accountId, displayName: displayNameMap[u.accountId] ?? u.accountId,
    roleKey: u.roleKey ?? null, levelKey: u.levelKey ?? null, salary: u.salary ?? 0,
    effortMd,   // ★ members_json 에는 effortMd 까지만 저장(effectiveMmDays/utilization 제거 — §2.2)
  }
})
monthlyEffort = Object.entries(monthMdMap).sort().map(([month, md]) => ({ month, md: round1(md) }))

// 프로젝트 단위 즉답값
memberCount    = members.length
totalSalary    = Σ members.salary
// ★ avgUtilization(테이블 컬럼)은 "프로젝트 내" 평균이라 이중계상 무관 → 프로젝트 기간 effectiveMmDays 로 로컬 계산(members_json엔 미저장)
projUtil       = projectUserRows.map(u => {
  const eff = effectiveMap[u.accountId] ?? baseMmDays
  return eff > 0 ? (totalMdMap[u.accountId] ?? 0) / eff : 0
})
avgUtilization = projUtil.length ? round2(mean(projUtil)) : 0

// ★ 글로벌 가동률 패스(§4.4) 입력으로 aggregateOneProject 반환에 동봉:
//   { projectId, startDate, endDate, memberAccountIds: projectUserRows.map(accountId),
//     effortByAccount: totalMdMap, scheduleRows }   ← 합집합 분모·연차 계산용(members_json엔 미포함)
```
> `startDate/endDate`(워크로그·effectiveMmDays 기간): 프로젝트 기간(start~end). end null이면 오늘. 진척도 배치의 기간 산정 규칙과 동일하게 맞춘다(구현자: 진척도 캐시미스 경로 확인).
> **신규 쿼리 `MEMBER_ROWS`** = `SELECT account_id, role_key, level_key, salary FROM projectusers WHERE project_id = UUID_TO_BIN(?)` (`PortfolioSnapshotQuery.MEMBER_ROWS`). 기존 `groupByRole/Level/getSalary`(단일프로젝트 화면 전용, `ProjectUsersRepository.js`)는 미수정(공통 경로 보존). 이 쿼리는 워크로그와 **완전 무관**(가벼운 단일 조회).
> **displayName 비용**: `getBulkJiraUsersApi` 는 100단위 chunk(`/rest/api/3/user/bulk`). 프로젝트당 인원 수십 명 → chunk 1회. p-limit(2) 프로젝트 병렬과 합쳐도 부담 낮음. **실패/미상 시 accountId 폴백**(차트·테이블 깨지지 않게).
> **★ 반환형 비일관 주의(실제 코드 확인 — `UserApi.js` L17~42)**: 정상 입력 시 **chunk별 페이지 객체 배열** `[{values:[{accountId,displayName,…}]}, …]` 를 반환하지만, **빈 입력(`accountIdList` 비었음) 시 배열이 아닌 객체 `{values:[]}`** 를 반환한다. 각 chunk 의 인원 목록은 `.values` 안에 있다. 따라서 평탄화는 **배열 가드 + `.values` 추출**:
> ```js
> const flattenBulkUsers = (res) => {
>   const chunks = Array.isArray(res) ? res : [];          // 빈입력 {values:[]} → []
>   const map = {};
>   for (const c of chunks) for (const u of (c?.values ?? [])) {
>     if (u?.accountId) map[u.accountId] = u.displayName ?? u.accountId;
>   }
>   return map;                                            // {accountId: displayName}, 미상은 멤버 조립 시 accountId 폴백
> };
> ```

### 3.3 부분 실패 처리 (v2 유지)

`allSettled` 프로젝트 단위 격리. 성공분만 upsert, 실패분은 직전 스냅샷 행 유지 → `aggregateStatus:'PARTIAL'`. 실패 0 → `'OK'`, 활성 0건 → `'EMPTY'`. 개별 실패는 `console.error` + Sentry. 문제이슈는 성공분 기준 TOP50을 KVS `portfolioRollup.problemIssues` 에 갱신, 활성 0/전량 실패면 직전 `problemIssues` 유지(rollup 비갱신).

> **★ 노후 데이터 식별(비교 대시보드 정직성, 2026-06-02)**: PARTIAL 시 성공 프로젝트(방금 값)와 실패 프로젝트(직전 값)가 한 화면에서 비교된다. 실패 행은 upsert 안 되므로 `aggregated_at`(`ON UPDATE CURRENT_TIMESTAMP`)이 갱신되지 않아 **이번 배치 `lastAggregatedAt` 보다 과거** → 조회 service 가 `isStale:true` 산출(§5.3). 현황 테이블이 노후 행에 "어제 값" 배지/툴팁 노출(§6.7). 사용자가 신/구 혼재를 모른 채 비교하는 함정 방지.

### 3.4 수동 재집계 트리거 (v2 유지)

fire-and-forget. `triggerPortfolioAggregation` 는 `aggregateAllProjects()` 를 await하지 않고 호출 후 즉시 `{started:true, lastAggregatedAt(직전값)}` 반환. KVS `aggregating` 플래그 동시 실행 가드. 프론트는 `lastAggregatedAt` 변화로 완료 감지.

> **★ stale-lock 복구(플래그 stuck 방지, 2026-06-02)**: 배치가 `aggregating:true` 설정 후 예외/타임아웃으로 죽으면 플래그가 영구 `true` 로 남아 **수동 재집계가 영구 차단**된다. → 플래그를 불리언이 아니라 **`aggregatingStartedAt`(ISO 타임스탬프)** 로 둔다. 가드 판정: `aggregatingStartedAt` 이 없거나 `now − aggregatingStartedAt > STALE_LOCK_MS`(= timeoutSeconds 600s + 여유, 예 900s)면 **stale 로 간주하고 재진입 허용**(이전 실행이 죽었다고 판단). 정상 시작 시 `aggregatingStartedAt = nowISO` set, 완료/실패(`finally`)에 `aggregatingStartedAt = null` clear. 이로써 죽은 락이 최대 STALE_LOCK_MS 후 자동 해제. scheduledTrigger(매일) 도 동일 가드 공유.

### 3.5 manifest.yml 등록 (v2 유지)

```yaml
function:
  - key: portfolioSnapshot
    handler: trigger/portfolioSnapshot.runPortfolioSnapshot
    timeoutSeconds: 600
scheduledTrigger:
  - key: portfolio-snapshot
    function: portfolioSnapshot
    interval: day
```
`index.js` named export: `export { runPortfolioSnapshot } from './trigger/portfolioSnapshot'`.

---

## 4. DB / 스냅샷 스키마 설계 (★ v3 전환의 정밀 설계)

### 4.1 저장소 경계 (v3 갱신)

| 데이터 | 저장소 | 근거 |
|--------|--------|------|
| 프로젝트별 스냅샷 행 (가변 N행, 정렬·필터) **+ members_json + monthly_effort_json** | **SQL** `portfolio_project_snapshot` | 가변 N행·정렬·조인. raw 배열은 JSON 컬럼 동봉(§4.2.1 payload 평가) |
| 문제 이슈 TOP N(≤50) | **KVS** `portfolioRollup.problemIssues` | ★2026-06-02: 필터 무관 글로벌·고정 TOP50·배치 사전정렬 → SQL 불필요(§4.2.4). summary 255 캡 |
| 전사 메타 (lastAggregatedAt/aggregateStatus/aggregating) | **KVS** `portfolioRollup`('current') | ★v3 **축소**. KPI/히스토그램/effortTrend/utilizationValues 제거(프론트 재집계로 불요) |

> **KVS 접근 방식 확정**: `ResourceAnalysisService` 와 동일하게 **`kvs.get('portfolioRollup:current')` / `kvs.set(...)` 직접 호출**(단일 고정 키, 스키마 불필요)을 채택. `CustomEntityManager`(role/level/status 등 엔티티형) 는 미사용. 따라서 manifest 에 별도 storage **entity** 정의는 불필요(kvs 직접 키 사용). `PortfolioSnapshotRepository.getRollupMeta/setRollupMeta` 가 이 kvs 직접 호출을 감싼다.

### 4.2 SQL DDL — `src/rdb/schema/ddl/portfolioSnapshot.sql.js`

```sql
CREATE TABLE IF NOT EXISTS portfolio_project_snapshot (
    project_id          BINARY(16),
    project_name        VARCHAR(100),
    project_status_key  VARCHAR(50)  NULL,
    start_date          DATE         NULL,
    end_date            DATE         NULL,

    completion_rate     DOUBLE       DEFAULT 0,
    schedule_rate       DOUBLE       DEFAULT 0,
    diff_percent_point  DOUBLE       DEFAULT 0,
    planned_total_md    DOUBLE       DEFAULT 0,
    actual_total_md     DOUBLE       DEFAULT 0,
    actual_mm           DOUBLE       DEFAULT 0,
    risk_score          DOUBLE       DEFAULT 0,

    issue_done          INT          DEFAULT 0,
    issue_in_progress   INT          DEFAULT 0,
    issue_todo          INT          DEFAULT 0,

    member_count        INT          DEFAULT 0,
    total_salary        DECIMAL(18,2) DEFAULT 0,   -- = Σ members[].salary
    avg_utilization     DOUBLE       DEFAULT 0,

    members_json        JSON         NULL,         -- ★v3 [{accountId,displayName,roleKey,levelKey,salary,effortMd}] (effectiveMmDays/utilization 미저장 — 가동률 글로벌화 2026-06-02)
    monthly_effort_json JSON         NULL,         -- ★v3 [{month,md}]

    aggregated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (project_id),
    INDEX (risk_score)
);
```
> `diagnosis_status`/`status_name`/`color`/role·level 이름 은 저장 안 함 — 조회 시 read-time 산출·조인(이름 변경이 스냅샷에 박히지 않게, status 패턴과 동일).
> **v2의 `role_dist`/`level_dist` JSON 컬럼 제거**: 롤/레벨 분포를 `members_json` 에서 프론트가 카운트하므로 사전계산 분포 컬럼 불필요(단일 raw 원천 일원화). 호환 노트는 §4.2.3.

#### 4.2.1 members 저장 위치: JSON 컬럼 vs 정규화 테이블 — **JSON 컬럼 `members_json` 채택 (★ payload 평가 포함)**

| 후보 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **JSON 컬럼** `members_json`(프로젝트 행에 인원 배열 동봉) | 조회 1쿼리(`SELECT *`)로 projects[].members[] 완성. 프로젝트 행과 **1:1 종속**. upsert 단순(행 1개). 프론트 재집계가 곧장 배열 순회 | 인원 across SQL 집계는 앱단(프론트) 처리. row 폭 증가 | **채택** |
| 별도 테이블 `portfolio_project_member`(project_id, account_id, role_key, level_key, salary, effort_md, effective_mm, util) | 인원 across SQL 집계 용이·정규화 정석 | 조회 시 조인+그룹 또는 N행 재조립, 행 폭증(프로젝트×인원), upsert delete-insert 복잡. **그러나 본 설계는 across 집계를 프론트가 함** → SQL 집계 이점 미사용 | 미채택 |

**payload 크기 평가 (★ 핵심 결정 근거)**:
- 인원 1명 ≈ `{accountId(36) + displayName(~20) + roleKey(~12) + levelKey(~10) + salary(8) + effortMd(6)}` + JSON 구조문자 → **약 220~320 byte/인원**(effectiveMmDays/utilization 제거로 v3 대비 소폭 감소, 보수적 320 가정).
- 프로젝트당 인원: **진척도 issues[] 교훈상 인원은 이슈보다 훨씬 적음**. 통상 5~20명, 큰 프로젝트도 ~50명 가정.
- `members_json` 크기 = 50명 × 350B ≈ **17.5 KB / 프로젝트**(상한). 통상(10명) ≈ 3.5 KB.
- `monthly_effort_json` = 12개월 × ~30B ≈ 0.4 KB(미미).
- **단일 응답 payload(projects[] 전체)**: 활성 프로젝트 N개. N=20·평균 15명이면 20 × (15×350 + 행메타~0.5KB) ≈ 20 × 5.75KB ≈ **약 115 KB**. N=50·평균 20명이면 ≈ **약 360 KB**. 활성 프로젝트 수백·인원 수십이면 MB대 위험.
- **판정**: 통상 규모(N≤~30, 인원≤~30)에서 **단일 호출 + members_json 동봉이 안전**(수백 KB 이내, Forge invoke 응답·256MB 메모리 여유). JSON 컬럼이 정규화 테이블보다 조회·재집계 단순. **across SQL 집계 이점은 본 설계에서 미사용**(프론트 재집계)이라 정규화 테이블의 유일한 장점이 무의미.
- **위험 대안(payload 비대 시)**: §4.2.2 요약+상세 분리.

> **MySQL 8 / Forge SQL JSON 컬럼 지원**. 적재 `JSON.stringify(members)`, 조회 시 **드라이버 반환형(객체 vs 문자열) 확인 후 안전 파싱**(`typeof === 'string' ? JSON.parse : 그대로`). v2 role_dist 파싱 주의와 동일.

#### 4.2.2 payload 위험 시 대안 (활성 프로젝트·인원 대규모) — **분리 호출 폴백(후속 안전판)**

응답이 위험 크기(예 >1MB)면:
- **요약 호출** `getPortfolioDashboard` = projects[] 에서 **members 제외**(테이블·총인건비·리스크·요약 라인은 프로젝트 단위 집계값만으로 충족: memberCount/totalSalary/avgUtilization/monthlyEffort).
- **상세 호출** `getPortfolioMembers({ projectIds })` = 선택 프로젝트의 members[]만 반환(필터 적용 시 lazy 로드). 급여 히스토그램·가동률 분포·작업 분포·롤레벨 분포는 members 필요 → 선택 시 로드.
- **MVP 판단**: 통상 규모는 **단일 호출(members 동봉)** 로 출발. 분리 호출은 규모 징후 발생 시 도입(후속). 설계상 경계면만 예약(getPortfolioMembers).

#### 4.2.3 v2 → v3 스키마 호환 노트

- 신규 컬럼 `members_json`/`monthly_effort_json` 추가, v2 `role_dist`/`level_dist` 컬럼은 **불사용(미생성)**. 신규 테이블이므로 `IF NOT EXISTS` DDL을 v3 스펙으로 작성하면 됨(기존 미배포 가정). 이미 v2 테이블이 배포된 환경이면 `ALTER TABLE ... ADD COLUMN members_json JSON, ADD COLUMN monthly_effort_json JSON` 마이그레이션 1건 추가(구현자 환경 확인).

#### 4.2.4 문제이슈 TOP50 — KVS `portfolioRollup.problemIssues` (★2026-06-02 SQL 테이블 제거)

별도 SQL 테이블(`portfolio_problem_issue`)을 **두지 않는다**. 문제이슈는 필터 무관 글로벌·고정 TOP50이고, 배치가 이미 JS로 `flatMap→sort(severity desc)→slice(50)` 를 마치며, 조회 service가 `portfolioRollup` 을 매번 읽으므로 SQL 테이블은 이점이 없다(v2 잔재).
- 배치: `setRollupMeta({ ..., utilizationValues, problemIssues })` 로 KVS rollup에 **응답 shape(camelCase) 그대로** 저장. `summary` 는 255자 캡(payload 상한). 성공분 0(전량 실패/활성0)이면 직전 `problemIssues` 유지(§3.3).
- 조회: `meta.problemIssues ?? []` 직접 사용(추가 SQL read 없음).
- payload: TOP50 × {issueKey/projectName/summary(≤255)/assignee/숫자4} ≈ ~20KB → KVS 값 한도 내(현재 기준 재확인 권장).

### 4.3 마이그레이션 등록 — `src/rdb/schema/migrate.js`

`ddl/index.js` 에 DDL export 후 (스냅샷 테이블 1개만):
```js
.enqueue('v006_create_portfolio_snapshot_table', CREATE_PORTFOLIO_SNAPSHOT_TABLE)
```
(migrationRunner 멱등 — `IF NOT EXISTS` + 이력.)
> **★ 마이그레이션 실행 경로(2026-06-02 보강)**: 스키마는 `runMigration` 이 돌아야 생성되는데, 경로가 **`init-db` scheduledTrigger(interval: hour) 1개뿐**이라 `forge deploy` 직후엔 테이블이 없다(다음 정시까지 ≤1h 지연). → **`onInstall` 에서 `runMigration()` 을 선행 호출**(멱등)하고 manifest trigger 에 **`avi:forge:upgraded:app`** 도 구독해 install/upgrade 시 즉시 생성한다. + `SEED_VERSION` 4 로 올리고 `addSettingSeed` 가 기존 설정 보존하며 가동률 band 누락 키만 병합(§7-가동률 band).
> **★ 구현 주의(`migrate.js` 실태)**: `createInitialSchema` 체인은 `v005` 다음 세미콜론 없이 주석으로 끝나 있으니 v006 `.enqueue` 를 그 자리에 이어 붙이고 ddl import 에 `CREATE_PORTFOLIO_SNAPSHOT_TABLE` 추가.

### 4.4 ★ 가동률 분포 — 필터 무관 글로벌 지표 (2026-06-02 A안 확정. 분모 이중계상 교정)

> **정의(교정)**: 인원 가동률 = "그 인원의 **전(全) 활성 프로젝트** 실투입MD 합 ÷ **참여 프로젝트 기간 합집합**의 가용MD". 고유 인원 1인 1값. **필터 무관**(문제이슈 버블과 동일 예외) — 사람의 가용은 사용자의 프로젝트 선택과 무관한 물리량이므로 선택분으로 쪼개지 않는다.
>
> **왜 프론트 선택분 재집계를 폐기했나(중요)**: per-project `effectiveMmDays` 는 `getWorkdaysInRange(프로젝트 기간) − 연차` 스칼라다. 동일 인원이 기간 중첩된 2개 프로젝트에 있을 때 `effA + effB` 는 겹친 구간을 **이중계상**(가동률 최대 절반 과소)하고, 프론트는 두 스칼라만으로 **합집합 분모를 복원할 수 없다**(겹침 정보 손실). 따라서 정확한 분모는 **배치가 사람 단위로 합집합을 1회 계산**해야만 얻어진다. v1 도 `Σ실투입/Σ가용` 로 같은 결함을 안고 있었고("v1 일관"은 결함 상속), A안은 분모를 **합집합 1회**로 바로잡는다.

**배치 글로벌 산출 — `computeGlobalUtilization(perProjectResults, holidays)`** (§3.2 step 4.5):
```
holidayMap = buildHolidayMap(holidays)
byPerson = Map<accountId, { investedMd:0, intervals:[], scheduleRows:[] }>
for proj of perProjectResults:                       # 성공분 전체(필터 아님)
  for accId of proj.memberAccountIds:
    acc = byPerson.get(accId) ?? { investedMd:0, intervals:[], scheduleRows:[] }
    acc.investedMd += (proj.effortByAccount[accId] ?? 0)         # Σ 프로젝트별 effortMd
    acc.intervals.push([proj.startDate, proj.endDate ?? today])  # 참여 프로젝트 기간
    byPerson.set(accId, acc)
  // 그 프로젝트 scheduleRows(연차)를 참여 인원별로 분배 적재(account_id 매칭)
  distributeSchedules(proj.scheduleRows, byPerson)

utilizationValues = []
for [accId, p] of byPerson:
  union   = mergeIntervals(p.intervals)              # 겹친 구간 1회로 병합
  availMd = Σ_seg [ getWorkdaysInRange(seg.start, seg.end, holidayMap)          # 합집합 근무일(공휴일 반영)
                    − (computeLeaveDeductionMap(dedup(p.scheduleRows), seg.start, seg.end, holidayMap).get(accId)?.deduction ?? 0) ]
          # ★공유 computeLeaveDeductionMap(승격본) 을 union 세그먼트별 호출·합산. schedule row dedup으로 중복 차감 방지
  util    = availMd > 0 ? round2(p.investedMd / availMd) : 0
  utilizationValues.push(util)
return utilizationValues                              # 고유 인원 1인 1값 배열
```
- **분모 합집합 1회**: `mergeIntervals` 로 기간 중첩 제거 → 이중계상 원천 차단. 연차도 합집합 내에서 1회만 차감(동일 schedule row 가 여러 프로젝트에 실려와도 dedup).
- **read-time 버킷팅(v1 패턴)**: 배치는 값 배열만 rollup에 저장, 조회 service 가 `settings.utilizationUnderBand`(0.7)/`utilizationOverBand`(1.1) 로 under/normal/over 카운트 생성(§5.3) → band 변경이 다음 배치까지 안 막힘.
- **프론트**: 재집계 없음. `utilization.buckets[]` 를 그대로 도넛 렌더 + "필터 무관" 배지. `recomputeUtilization`·members[].effectiveMmDays/utilization **삭제됨**.
- **트레이드오프(수용)**: "선택 2개 프로젝트만의 가동률"은 제공하지 않는다(정의상 정확 산출 불가 + 사람 가용은 선택 무관). 전 활성 기준 글로벌 1값이 정직하다.

---

## 5. 백엔드 구조

### 5.1 디렉토리 / 등록 (v2 유지)

```
src/resolver/portfolioDashboard/
  PortfolioDashboardController.js
  PortfolioDashboardService.js
  PortfolioAggregator.js
  PortfolioSnapshotRepository.js
src/trigger/portfolioSnapshot.js
src/rdb/query/PortfolioSnapshotQuery.js
src/rdb/schema/ddl/portfolioSnapshot.sql.js
```
`src/index.js`:
```js
import { registerPortfolioDashboardController } from "./resolver/portfolioDashboard/PortfolioDashboardController";
export { runPortfolioSnapshot } from "./trigger/portfolioSnapshot";
registerPortfolioDashboardController(resolver);
```

### 5.2 Controller

```js
resolver.define('getPortfolioDashboard', responseWrapper(async () => getPortfolioDashboardService()));
resolver.define('triggerPortfolioAggregation', responseWrapper(async () => triggerAggregationService()));
```

### 5.3 조회 Service (`getPortfolioDashboardService`) — ★ v3 단순화

```
1. meta = repo.getRollupMeta()                      # KVS 'current' (lastAggregatedAt/aggregateStatus/utilizationValues/problemIssues)
   if (!meta) return EMPTY shape
     (projects:[], roleMeta:{}, levelMeta:{}, salaryBuckets:[기본경계], utilization:{buckets:[],totalPeople:0,avgUtilization:0}, problemIssues:[])
2. rows        = repo.getAllSnapshots()             # SQL, risk_score desc (members_json/monthly_effort_json 포함)
   problemIssues = meta.problemIssues ?? []         # ★KVS rollup 직접(camelCase 그대로, SQL read 없음)
3. settings   = getSettingDataService()             # progressThreshold(diagnosis) + utilizationUnderBand/OverBand(read-time 버킷팅)
   statusList = getProjectStatusListService()       # status 조인
   roleList   = getRoleListService()                # key→name (roleMeta)
   levelList  = getLevelListService()               # key→name (levelMeta)
4. projects = rows.map(r => ({
     projectId, projectName,
     statusKey, statusName/Color(조인),
     startDate, endDate,
     completionRate, scheduleRate, diffPercentPoint,
     diagnosisStatus: diagnose(diffPP, threshold), riskProjectFlag: ===delayed,
     plannedTotalMd, actualTotalMd, actualMm, riskScore, issueSummary,
     memberCount: r.member_count, totalSalary: r.total_salary, avgUtilization: r.avg_utilization,
     members: parseJson(r.members_json) ?? [],            # ★v3
     monthlyEffort: parseJson(r.monthly_effort_json) ?? [], # ★v3
     aggregatedAt: r.aggregated_at,                       # ★행별 집계 시각
     isStale: meta.lastAggregatedAt && new Date(r.aggregated_at) < new Date(meta.lastAggregatedAt),  # ★노후 행(PARTIAL 시 직전 값 유지분)
   }))
5. roleMeta  = Object.fromEntries(roleList.data.map(x => [x.id, x.name]))
   levelMeta = Object.fromEntries(levelList.data.map(x => [x.id, x.name]))
6. salaryBuckets = SALARY_BUCKET_BOUNDS (코드상수, settings.currency 기준 — §7-6) # 경계만, 카운트 없음
6.5 ★ utilization = read-time 버킷팅(필터 무관 글로벌, §4.4):
      vals = meta.utilizationValues ?? []
      under = settings.utilizationUnderBand ?? 0.7;  over = settings.utilizationOverBand ?? 1.1
      buckets = bucketize(vals, under, over)          # under(<0.7)/normal/over(≥1.1) 카운트
      utilization = { buckets, totalPeople: vals.length, avgUtilization: vals.length ? mean(vals) : 0 }
7. problemIssues = problemRows.map(매핑)
8. return { lastAggregatedAt: meta.lastAggregatedAt, aggregateStatus: meta.aggregateStatus,
            projects, roleMeta, levelMeta, salaryBuckets, utilization, problemIssues }
   # ★v3 제거(유지): kpi / effortTrend / salaryHistogram (프론트 재집계)
   # ★A안 부활: utilization (필터 무관 글로벌, read-time 버킷팅)
```
> read-time 비캐시 원칙: diagnosisStatus·statusName/Color·roleMeta/levelMeta 이름은 조회 시 산출·조인. 스냅샷엔 key/diff/raw 만.

### 5.4 재사용 모듈 경로 (구현자 참조 — ✅ 실제 코드 확인됨)

| 용도 | 모듈 | 확인 |
|------|------|------|
| 활성 프로젝트 | `src/resolver/project/ProjectService.js` → `getActiveProjectsService` | ✅ 확인 — **반환 `{rows:[…]}` 래핑**(언래핑 필수). 행은 snake_case `SELECT *`. `end_date >= CURDATE()` 라 end_date NULL 제외(§3.2 L1 주석) |
| 워크로그 병렬 페처 | `src/resolver/resourceAnalysis/ResourceWorklogFetcher.js` → `getResourceProjectWorklogs({projectId,startDate,endDate})` | ✅ 확인(인원별 totalMd·월별 합산 원천. log.date/accountId/timeSpentSeconds 제공) |
| 이슈 전체 | `src/api/jira/issue/IssueApi.js` → `getProjectIssuesByFilter`/`getBulkIssuesByProject` | v1 |
| 진척 계산(순수) | `src/resolver/projectProgress/ProgressCalculator.js` | v1 |
| **가용MD·연차 차감·인원MM 산식** | `src/utils/workday.js`(`getWorkdaysInRange`/`getMonthMmMap`/`buildHolidayMap`/`workdayValue` — 모두 export) + **`ResourceAnalysisService.computeLeaveDeductionMap` 을 `export const` 로 승격해 직접 재사용**. `totalMd=Σsec/(hourRate*3600)` | ✅ 확인(L35~142). ⚠️ 현재 `computeLeaveDeductionMap` 은 내부 const → **export 1줄 추가 필요(호출부 무변경)**. 복제 대신 승격: 연차 로직 단일화로 화면↔대시보드 드리프트 방지 |
| **인원 raw(role/level/salary)** ★v3 | **신규 `MEMBER_ROWS`** (`PortfolioSnapshotQuery`). 참조: `src/rdb/query/ProjectUsersQuery.js`(role_key/level_key/salary 컬럼 확인 — L26~41) | ✅ 확인 |
| **displayName** ★v3 | `src/api/jira/user/UserApi.js` → `getBulkJiraUsersApi(accountIdList)`(100단위 chunk, `/user/bulk`) | ✅ 확인(L17~42). ⚠️ **반환형 비일관**: 정상=`[{values:[…]}]`(배열), 빈입력=`{values:[]}`(객체). `flattenBulkUsers`(§3.2.1)로 배열가드+`.values` 평탄화 |
| 인원 스케줄(연차) | `src/resolver/mySchedule/MyScheduleRepository.js` → `getProjectWorkersScheduleRepository` | v1 |
| 롤/레벨 이름 | `…/backoffice/role/RoleService.js`→`getRoleListService`, `…/level/LevelService.js`→`getLevelListService`(`{data:[{id,name}]}`) | v2 |
| 설정/공휴일/상태 | `getSettingDataService` / `getPublicHolidayListService` / `getProjectStatusListService` | v1 |
| 동시성 | `p-limit` | v1 |

### 5.5 에러 케이스

| 상황 | 처리 |
|------|------|
| 스냅샷/메타 없음 | 에러 아님 — `aggregateStatus:'EMPTY'` + 빈 배열들 |
| 개별 프로젝트 실패 (배치) | `allSettled` 격리, Sentry, 직전 행 유지, `'PARTIAL'` |
| displayName 조회 실패 (배치) | accountId 폴백(차트·테이블 유지). 프로젝트 집계 실패로 처리하지 않음 |
| projectusers/문제이슈 조회 실패 (배치) | 해당 프로젝트 집계 실패로 격리 |
| SQL 조회 실패 (조회) | `SqlError` throw → responseWrapper 직렬화 |
| members_json/monthly_effort_json 파싱 실패 (조회) | 빈 배열 폴백 + Sentry warn(위젯 빈 상태) |
| role/level 메타 조회 실패 (조회) | roleMeta/levelMeta 빈 객체(차트는 key 노출) |
| 동시 집계 충돌 | KVS `aggregatingStartedAt` 타임스탬프 가드 + **stale-lock 자동 복구**(STALE_LOCK_MS 경과 시 재진입 허용, §3.4). `finally` 에서 clear |

---

## 6. 프론트엔드 구조 (★ v3: 필터 + 재집계 + 서브탭)

### 6.1 라우트 / 네비게이션 (v2 유지)

`App.jsx`: `<Route path="/dashboard" element={<PortfolioDashboardPage />} />`
`Sidebar.jsx` mainItems 진입점 + `canRead('REPORT')` 없으면 메뉴 숨김.

### 6.2 페이지/위젯 구조 — 필터바 + 서브탭 (★v3, mockup_v2 일치)

```
static/ui/src/pages/portfolio/
  PortfolioDashboardPage.jsx          # 권한 게이트 + 단일 useQuery + 필터상태 + 레이아웃
  PortfolioHeader.jsx                 # 기준시각 + 재집계 버튼 + status 배너
  PortfolioFilterBar.jsx              # ★v3 프로젝트 멀티셀렉트(기본 전체) + 선택분 요약 라인
  hooks/
    usePortfolioFilter.js             # ★v3 선택 projectId Set 상태 + 토글/전체
  utils/
    portfolioAggregate.js             # ★v3 재집계 유틸 (filter·분포·합산·라인·가동률·요약)
  sections/
    ComparisonTabs.jsx                # ★v3 섹션2 서브탭 컨테이너(개요/인력·비용/공수·작업)
    RiskSection.jsx                   # 섹션3 (서브탭 밖)
  tabs/
    OverviewTab.jsx                   # [서브탭1] 현황 테이블
    PeopleCostTab.jsx                 # [서브탭2] 롤레벨/총인건비/급여히스토/가동률
    EffortWorkTab.jsx                 # [서브탭3] 공수추이/작업분포
  widgets/
    PortfolioProjectTable.jsx         # 현황 테이블(드릴다운)
    PortfolioRoleLevelDist.jsx        # 롤/레벨 누적막대(y=실제 인원수) + 롤/레벨 토글
    PortfolioSalaryByProject.jsx      # 프로젝트별 총인건비 막대
    PortfolioSalaryHistogram.jsx      # 급여 구간 분포(선택분 재집계)
    PortfolioUtilization.jsx          # 가동률 분포(선택분 재집계, 도넛)
    PortfolioEffortTrend.jsx          # 공수 추이 — 프로젝트별 라인 비교 + 월별/누적 토글(누적=미니 S-curve)
    PortfolioWorkDist.jsx             # ★v3 작업 분포 scatter-aggregate-bar
    PortfolioRiskTop.jsx              # 리스크 TOP(막대)
    PortfolioProblemBubble.jsx        # 문제이슈 버블(필터 무관 배지)
  PortfolioDashboard.css
```

### 6.3 권한 게이트 (v2 유지)

`PortfolioDashboardPage.jsx` 진입부: `if (!canRead('REPORT')) return <SectionMessage warning>…</SectionMessage>`. 사이드바 숨김 + 페이지 가드 이중 방어.

### 6.4 데이터 조회 (단일 호출, v2 유지)

```jsx
const { data, isLoading, isError, refetch } = useQuery({
  queryKey: portfolioKeys.dashboard(),
  queryFn: () => invoke('getPortfolioDashboard', {}),
  staleTime: 1000 * 60 * 5,
});
const isSuccess = data?.success === true;
const allProjects = data?.projects ?? [];   // raw 배열. 메모리에서 필터/재집계
```
수동 재집계: `useMutation({ mutationFn: () => invoke('triggerPortfolioAggregation', {}) })`.

### 6.5 ★ 필터 상태 (`usePortfolioFilter.js`)

- **로컬 컴포넌트 상태**(Zustand 불필요 — 단일 페이지 내 소비, 라우트 이동 시 초기화 무방). `useState(Set<projectId>)`.
- 초기값 = **전체 선택**(`new Set(allProjects.map(p=>p.projectId))`). data 로드 후 useEffect로 채움(프로젝트 추가/삭제 동기화).
- API: `selectedIds`, `toggle(id)`, `selectAll()`, `clear()`, `isAll`(전체 여부), `selectedProjects`(파생: allProjects.filter).
- > Zustand 미사용 근거: i18n/permission 처럼 앱 전역 공유가 아니라 한 페이지의 뷰 상태. 단순 useState/useMemo가 적절.

### 6.6 ★ 재집계 유틸 (`utils/portfolioAggregate.js`) — 순수 함수 (frontend jest 대상)

| 함수 | 입력 | 출력 | 소비 위젯 |
|------|------|------|----------|
| `filterProjects(all, selectedIds)` | all[], Set | 선택 projects[] | 공통 |
| `summarizeSelection(selected)` | projects[] | `{projectCount, totalCount, uniqueMemberCount, totalActualMm, totalSalary}` | 요약 라인 |
| `roleLevelDistribution(selected, axis, meta)` | projects[], 'role'│'level', roleMeta/levelMeta | `{categories:[projectName], series:[{name:roleName, data:[count…]}]}` (★실제 인원수, 정규화 폐기 2026-06-02) | RoleLevelDist |
| `salaryByProject(selected)` | projects[] | `[{name, totalSalary}]` | SalaryByProject |
| `salaryHistogram(selected, buckets)` | projects[], salaryBuckets | `[{bucket, count}]` (dedup 인원 salary 카운트) | SalaryHistogram |
| ~~`recomputeUtilization`~~ | — | **삭제(2026-06-02 A안)**. 가동률은 필터 무관 글로벌이라 프론트 재집계 없음 — `utilization.buckets[]` 직접 사용(§4.4·§5.3) | Utilization |
| `effortTrendByProject(selected, mode)` | projects[], mode `'monthly'│'cumulative'` | `{months:[합집합], series:[{name, data:[md…]}]}`. ★누적 모드 시 각 series.data를 cumsum(추가 페치 없음, 프론트 누적합) + 누적 MM 환산 병기 | EffortTrend |
| `workDistribution(selected)` | projects[] | `{categories:[projectName], points:[[xi, effortMd]…], avg:[…]}` | WorkDist |
| `riskTop(selected, n)` | projects[], n | riskScore desc 상위 n `[{name, riskScore}]` | RiskTop |

> 모든 위젯은 `useMemo(() => fn(selectedProjects, …), [selectedProjects, …])` 로 재집계. data가 raw라 추가 invoke 없음. dedup(고유 accountId)은 salaryHistogram·summarizeSelection.uniqueMemberCount 에 적용. **가동률 분포는 예외** — 필터 무관 글로벌이라 `utilization.buckets[]` 를 selectedIds 무시하고 직접 렌더(§4.4).

### 6.7 위젯 ↔ 데이터 + 차트 (★ 10위젯, mockup_v2 일치)

| # | 탭/섹션 | 위젯 | 재집계 함수 | 차트/표 |
|---|---------|------|------------|--------|
| 0 | 필터바 | 선택분 요약 라인 | `summarizeSelection` | 텍스트(선택N/총N·인원·MM·인건비) |
| 1 | 개요 | 현황 테이블 | `filterProjects` | Atlaskit `DynamicTable`, 행클릭 `navigate('/project/'+id)`. ★`isStale` 행에 "어제 값" Lozenge + `aggregatedAt` 툴팁(PARTIAL 노후 표시) |
| 2 | 인력·비용 | 롤/레벨 분포 | `roleLevelDistribution(axis)` | `stackChartOption(normalize:false)` — x=프로젝트, 스택=롤/레벨, **y=실제 인원수**, 롤/레벨 토글 |
| 3 | 인력·비용 | 프로젝트별 총인건비 | `salaryByProject` | `barChartOption` |
| 4 | 인력·비용 | 급여 구간 분포 | `salaryHistogram` | `barChartOption`(구간 막대) |
| 5 | 인력·비용 | 가동률 분포 | (없음 — `utilization.buckets[]` 직접, 필터 무관) | `pieChartOption`(도넛, mockup `c_util`) + "필터 무관" 배지 |
| 6 | 공수·작업 | 공수 추이 비교 | `effortTrendByProject(mode)` | `lineChartOption`(프로젝트별 멀티라인, mockup `c_trend`) + **월별 ⇄ 누적 토글**(누적 시 미니 S-curve 비교) |
| 7 | 공수·작업 | 작업 분포 | `workDistribution` | **`scatterChartOption`(scatter + 집계 bar, 토글, mockup `c_work`)** |
| 8 | 리스크 | 리스크 TOP | `riskTop` | `barChartOption`(가로 막대, mockup `c_risk`) |
| 9 | 리스크 | 문제이슈 버블 | (없음, `problemIssues` 직접) | **`scatterChartOption`(버블, mockup `c_problem`)** + "필터 무관" 배지 |

### 6.8 쿼리키 팩토리 (신규) — `static/ui/src/utils/queryKey/portfolioKeys.js`

```js
export const portfolioKeys = {
  all: ['portfolio'],
  dashboard: () => ['portfolio', 'dashboard'],
  // members 분리 호출(후속 §4.2.2): members: (ids) => ['portfolio','members', ids]
};
```

### 6.9 차트 옵션 — 수정 1 + 신규 1 (v2 유지)

확인된 옵션 디렉토리 `static/ui/src/components/chart/echart/options/`: barChart/barLine/calendarHeatmap/line/pie/radar/**stack**/stackedLine. scatter 없음, stack 정규화 없음.

1. **`stackChartOption.js` 확장** — 100% 정규화 옵션(`normalize` 기본 false, 하위호환). 위젯이 비율(0~1) 전달.
2. **`scatterChartOption.js` 신규** — `type:'scatter'`, `symbolSize=f(value)`. **두 위젯 공용**: (a) 문제이슈 버블(x=delayDays, y=effortDiff, size=severity, 우상단 위험), (b) 작업 분포(x=프로젝트 카테고리, y=effortMd + 집계 bar series 동반). 작업 분포는 scatter+bar 혼합이라 옵션이 series 배열을 그대로 받게 설계(위젯이 점·막대 series 구성).

### 6.10 작업 분포 위젯 정식 설계 (★v3 보류 해제, mockup `c_work`)

- 점 = 인원 1명, y = 그 인원의 `effortMd`, x = 프로젝트(카테고리), 집계 막대 = 프로젝트별 공수 평균(또는 합) 반투명 배경.
- 토글: 집계(막대만) ⇄ 산점(점 표시). mockup 의 "집계 ⇄ 산점" 칩.
- 재집계 `workDistribution(selected)`: 선택 프로젝트별 members[].effortMd 점화 + 프로젝트별 avg/sum. 추가 페치 없음(members raw 재사용).
- 효과: 인력 간 공수 편중 + 프로젝트 간 공수 차이 동시 파악.

---

## 7. 재사용 vs 신규 계산식

### 재사용 (그대로 — 신규 정의 금지)
- 완성률/일정률/진단/공수 totals/상태분포/확정지연 — `ProgressCalculator.js`
- MM/가동률: `effectiveMmDays = baseMmDays − leaveDeduction`, 인당 가동률 `totalMd/effectiveMmDays` — `ResourceAnalysisService.js` + `workday.js` (✅ 코드 확인)
- 1MD = `settings.hourRate` 시간; 월별 합산은 워크로그 `date.substring(0,7)` 그룹(ResourceAnalysisService monthlyData 패턴, L194~204)

### 신규 계산 (v3)
1. **배치 per-member 조립**(§3.2.1): projectusers + 워크로그 totalMd + displayName 병합 → members[](effortMd까지). ※effectiveMmDays/utilization 은 members_json 미저장(프로젝트 avgUtilization 로컬 계산 + 글로벌 가동률 패스에서만 사용).
2. **배치 monthlyEffort**: 프로젝트 워크로그를 `YYYY-MM` 합산 → `[{month, md}]`.
3. **리스크 `riskScore`** = `max(0, -diffPercentPoint)`. (v2 유지)
4. **문제이슈 추출 `computeProblemIssues`**(v2 동일): (a) 기한초과 미완료 `dueDate<오늘 && statusKey!=='done'` → delayDays=오늘−dueDate; (b) 지연완료 `computeDelayConfirmed` 완료일−dueDate>0. effortDiff=`(actualSec−plannedSec)/(hourRate*3600)`. **severity=`delayDays*1.0 + max(effortDiff,0)*2.0`**. 배치가 전사 평탄화 → severity desc TOP50.
5. **★v3 프론트 재집계 유틸**(§6.6): filter/분포정규화/합산/히스토그램/라인/작업분포/리스크정렬 — **전부 프론트 순수함수**(frontend jest 대상). ~~가동률 dedup~~ 은 A안으로 **프론트에서 제거**(글로벌 배치 산출).
7. **★A안 배치 글로벌 가동률 `computeGlobalUtilization`**(§4.4, jest 대상): accountId별 투입MD 합 / 참여 기간 **합집합** 가용MD(1회) → `utilizationValues[]`. `mergeIntervals`+`getWorkdaysInRange`+**`computeLeaveDeductionMap`(승격 공유본)** 조합. 분모 이중계상 제거. read-time 버킷팅은 조회 service.
6. **급여 버킷 경계 `SALARY_BUCKET_BOUNDS`**: 통화별 코드 상수(KRW: 0/3M/5M/7M+). 응답 `salaryBuckets` 로 내려주고 **카운트는 프론트**. 개별 급여 값은 members[].salary 로 내려가나 차트는 카운트만 표시(§13 민감성).

> 백엔드 신규 순수함수(riskScore/computeProblemIssues/per-member 조립 헬퍼)는 jest. 프론트 재집계 유틸도 jest(순수함수라 결정적).

---

## 8. 열린 질문 — 설계 결정 (v2 유지 + v3 갱신)

| # | 질문 | 결정 |
|---|------|------|
| Q1 | 라우트/네비 | `/dashboard` 신규 + 사이드바 mainItems(permission REPORT) |
| Q2 | 저장소 경계 | 프로젝트행+members_json+monthly_effort_json=SQL, 문제이슈=SQL(≤50), **메타만=KVS** |
| Q3 | 배치 주기 | scheduledTrigger day + 수동 재집계(fire-and-forget) |
| Q4 | 활성 프로젝트 | 날짜기준(`start≤오늘≤end`), status 필터 없음 |
| **Q5 ★v3→A안(2026-06-02)** | 가동률 모수 + 필터 정합 | **필터 무관 글로벌**(문제이슈 버블과 동일 예외). 고유 인원 1인 1값 = 전 활성 투입MD 합 / 참여 기간 **합집합** 가용MD(배치 1회). 프론트 선택분 재집계·dedup 합산 폐기 — 분모 이중계상·합집합 복원불가 때문(§4.4). 사용자 확정 |
| **Q6 ★v3** | members 저장 위치 | **JSON 컬럼 `members_json`**(payload 평가: 통상 수백KB 이내 안전 — §4.2.1). 정규화 테이블 미채택(across SQL집계 본 설계 미사용) |
| **Q7 ★v3** | 필터 상태 위치 | **로컬 useState(Set)** + usePortfolioFilter 훅. 기본 전체 선택. Zustand 불필요 |
| **Q8 ★v3** | 전사 KPI 카드 | **제거**. 선택분 요약 라인(프론트 계산)으로 대체 |
| Q9 | 문제이슈 TOP N / 필터 | SQL N=50, **필터 무관**(항상 전 프로젝트) — "필터 무관" 배지 |
| Q10 | 급여 버킷/노출 | 경계=코드상수(통화별), settings화 후속. 차트는 카운트만(개별 급여 값은 members[]에 존재 — 권한 분리 후속 §13) |

### 사용자 확정 (2026-06-01)
- 정체성 = 프로젝트별 비교. 기본 전체 선택. 문제이슈만 필터 예외. 섹션2 서브탭. 활성=날짜기준. 가동률 band=settings(`utilizationUnderBand`0.7/`utilizationOverBand`1.1). 차트=ECharts 단일.

---

## 9. MVP 범위 — 10위젯 우선순위 (★v3 재조정)

| 우선 | 탭/섹션 | 위젯 | 포함 | 근거 |
|------|---------|------|------|------|
| P0 | 필터바 | 프로젝트 멀티셀렉트 + 선택분 요약 라인 | ✅ | **v3 정체성 핵심**. 모든 위젯 반응의 전제 |
| P0 | 개요 | 프로젝트별 현황 테이블(드릴다운) | ✅ | 핵심 가치(비교+상세) |
| P0 | — | 기준시각 헤더 + 수동 재집계 | ✅ | 스냅샷 신선도 |
| P1 | 인력·비용 | 롤/레벨 분포(정규화 누적막대, 필터 재집계) | ✅ | 2차 핵심. members 재집계 |
| P1 | 인력·비용 | 프로젝트별 총인건비(막대) | ✅ | 2차 핵심. totalSalary 직접 |
| P1 | 공수·작업 | **작업 분포(scatter-aggregate-bar)** ★v3 | ✅ | 3차 정식 포함. members.effortMd |
| P1 | 공수·작업 | 공수 추이 비교(프로젝트별 라인) ★v3 | ✅ | 3차 핵심 전환. monthlyEffort |
| P1 | 리스크 | 문제이슈 버블(필터 무관) | ✅ | 2차 핵심. severity TOP50 |
| P1 | 리스크 | 리스크 TOP | ✅ | projects 정렬 재사용 |
| P2 | 인력·비용 | 급여 구간 분포 히스토그램(필터 재집계) | ⚠️ 후순위 | 인건비 막대보다 부가 |
| P2 | 인력·비용 | 가동률 분포(★필터 무관 글로벌, A안) | ⚠️ 후순위 | A안으로 프론트 복잡도 해소(배치 글로벌 1회·read-time 버킷). 단 배치 합집합 패스 구현·검증 필요라 P2 유지. 인력관점 부가 |

**1차 릴리스 = 필터바 + 현황테이블 + (롤레벨/총인건비) + (작업분포/공수추이) + (문제버블/리스크TOP).** P2(급여히스토그램·가동률분포)는 여유 시.
> ★v3 변경: 작업분포·공수추이가 **P1로 승격**(정체성 전환의 비교 위젯 핵심). 가동률분포는 P2(§4.4 분모 정합 복잡도). v2의 전사 KPI 카드 P0는 제거되고 필터바+요약라인으로 대체.
> **서브탭 배치**(mockup): 개요(테이블) / 인력·비용(롤레벨·총인건비·급여히스토·가동률) / 공수·작업(공수추이·작업분포). 리스크/문제는 서브탭 밖 항상 노출.

---

## 10. 보류 / 미정 항목

| 항목 | 상태 | 메모 |
|------|------|------|
| members 분리 호출(getPortfolioMembers) | 후속 안전판 | payload 비대(>1MB·수백 프로젝트) 시 요약+상세 분리(§4.2.2). MVP는 단일 호출 |
| 급여 노출 권한 분리 | **사용자 확정(2026-06-01): 현행 진행** | REPORT 게이트로 충분 결정. members[].salary 가 응답에 raw 포함되나 REPORT 권한자만 접근, 화면엔 합계·구간만. 서버 마스킹/별도 권한 분리는 후속 과제로만 보존 |
| 가동률 분모 이중계상 정책 | **사용자 확정(2026-06-02): A안 — 글로벌 합집합 1회** | §4.4. 필터 무관 글로벌 지표로 재정의. 배치가 인원별 기간 합집합 가용MD 1회 계산(이중계상 제거). 프론트 선택분 재집계 폐기 |
| 공수 추이 월별/누적 토글 | **사용자 확정(2026-06-01): 포함** | `monthlyEffort[]` 프론트 cumsum → 프로젝트별 누적 공수 곡선(미니 S-curve) 비교 + 누적 MM 환산. 추가 페치 없음 |
| 급여 버킷 settings화 | 후속 | MVP 코드 상수 |
| 전사 롤 총합 위젯(across role 합계) | 후속 | members[] 로 프론트 전체 카운트 가능(필터 전체 선택 시 자연 충족) |
| 큐 fan-out 배치 | 후속 안전판 | 활성 프로젝트 수백 규모 시 |

---

## 11. i18n 키 — `locales/kr/portfolio.json` (en 동형, ko-KR/en-US 직접수정 금지 → merge)

```jsonc
{
  "nav": "전사 대시보드",
  "title": "전사 통합 대시보드",
  "subtitle": "프로젝트 비교",
  "noPermission": "이 페이지에 접근할 권한이 없습니다",
  "header": {
    "lastAggregated": "기준 시각", "refresh": "지금 재집계",
    "refreshStarted": "재집계를 시작했습니다. 잠시 후 새로고침하세요",
    "statusPartial": "일부 프로젝트 집계 실패 — 직전 값 표시",
    "statusEmpty": "아직 집계된 데이터가 없습니다"
  },
  "filter": {
    "label": "프로젝트", "all": "전체", "selectAll": "전체 선택", "clear": "선택 해제",
    "selected": "선택 {sel}/{total}", "members": "인원", "totalMm": "투입 MM", "totalSalary": "인건비",
    "empty": "프로젝트를 선택하세요"
  },
  "section": { "comparison": "프로젝트 비교", "risk": "리스크/문제" },
  "subtab": { "overview": "개요", "peopleCost": "인력 · 비용", "effortWork": "공수 · 작업" },
  "common": { "viewChart": "차트", "viewTable": "표" },
  "table": {
    "title": "프로젝트별 현황", "name": "프로젝트", "status": "상태",
    "members": "인원", "actualMm": "투입MM", "salary": "인건비",
    "completion": "완성%", "schedule": "일정%", "diff": "차이(%p)",
    "utilization": "가동률", "risk": "리스크", "empty": "표시할 프로젝트가 없습니다",
    "drilldownHint": "행 클릭 → 상세 드릴다운",
    "staleBadge": "어제 값", "staleTooltip": "이 프로젝트는 최신 집계에 실패해 {time} 기준 직전 값입니다"
  },
  "roleLevel": {
    "title": "롤 / 레벨 분포 비교", "desc": "선택 프로젝트별 인원 구성 (명)",
    "toggleRole": "롤별", "toggleLevel": "레벨별", "empty": "인력 데이터가 없습니다"
  },
  "salary": {
    "byProjectTitle": "프로젝트별 총 인건비", "byProjectDesc": "Σ 참여 인원 급여 (월)",
    "histogramTitle": "급여 구간 분포", "histogramDesc": "선택 프로젝트 참여 인원 급여 히스토그램",
    "amountUnit": "원", "countUnit": "{count}명", "empty": "급여 데이터가 없습니다"
  },
  "utilization": {
    "title": "인력 가동률 분포", "desc": "전 활성 프로젝트 인원 기준 과소/적정/과부하 (필터 무관)",
    "under": "과소", "normal": "적정", "over": "과부하",
    "peopleUnit": "{count}명", "avg": "평균 가동률", "noFilterBadge": "필터 무관 · 전 프로젝트"
  },
  "effortTrend": {
    "title": "공수 추이 비교", "desc": "선택 프로젝트별 월간 투입 MD 라인 비교",
    "mdUnit": "MD", "noData": "데이터가 없습니다",
    "modeMonthly": "월별", "modeCumulative": "누적", "cumulativeMm": "누적 MM"
  },
  "workDist": {
    "title": "작업 분포 — 투입 인력 대비 공수", "desc": "점=인원 1명 공수(MD) · 프로젝트별 분포+집계",
    "toggle": "집계 ⇄ 산점", "mdUnit": "공수MD", "empty": "작업 데이터가 없습니다"
  },
  "risk": {
    "title": "리스크 TOP 프로젝트", "desc": "완성-일정 차이(지연 %p) 큰 순",
    "empty": "리스크 프로젝트가 없습니다",
    "badge": { "normal": "정상", "caution": "주의", "delayed": "지연" }
  },
  "problem": {
    "title": "문제 이슈 한눈에 (TOP 50)", "desc": "x=지연일수, y=공수편차, 버블=심각도",
    "x": "지연일수", "y": "공수편차(MD)", "assignee": "담당자", "empty": "문제 이슈가 없습니다"
  }
}
```
> en 동형 작성 후 `cd static/ui && npm run merge`. 가동률 band 설정 UI 라벨은 기존 `setting` 네임스페이스.

---

## 12. 구현 작업 분해

### Backend
- [ ] `ddl/portfolioSnapshot.sql.js`: `CREATE_PORTFOLIO_SNAPSHOT_TABLE`(+member_count/total_salary/avg_utilization/**members_json**/**monthly_effort_json**) **1개만**(문제이슈 테이블 없음). `ddl/index.js` export. `migrate.js` v006 enqueue
- [ ] `PortfolioSnapshotQuery.js`: snapshot UPSERT/SELECT_ALL(members_json/monthly_effort_json 포함), **MEMBER_ROWS**(projectusers account_id/role_key/level_key/salary). (문제이슈 SQL 쿼리 없음)
- [ ] `PortfolioSnapshotRepository.js`: upsertSnapshot, getAllSnapshots, **getProjectMemberRows**, getRollupMeta/setRollupMeta(메타+utilizationValues+**problemIssues**). 문제이슈는 배치가 rollup set 시 동봉
- [ ] `onInstall.js`: `runMigration()` 선행 호출 + `SEED_VERSION` 4 / `manifest.yml` trigger 에 `avi:forge:upgraded:app` 추가 / `addSettingSeed` 누락 키 병합(가동률 band)
- [ ] `PortfolioAggregator.js`: aggregateOneProject(진척/가용MD/**per-member 조립**(§3.2.1, members_json엔 effortMd까지)/monthlyEffort/avgUtilization/computeProblemIssues + 글로벌 패스 입력 동봉(memberAccountIds/effortByAccount/scheduleRows/기간)), aggregateAllProjects(**`getActiveProjectsService()` → `{rows}` 언래핑 + snake_case→camel 매핑**/pLimit2/allSettled/TOP50 + **`computeGlobalUtilization`(§4.4)**), 순수함수 riskScore/severity/computeProblemIssues/**mergeIntervals+computeGlobalUtilization**. kpi/effortTrend/salaryHistogram 전사 롤업 계산은 제거(프론트), **utilizationValues 만 rollup에 저장**
- [ ] **`ResourceAnalysisService.computeLeaveDeductionMap` → `export const` 승격**(호출부 무변경) + 양쪽 동일 입출력 jest. ※복제 금지(드리프트 방지). 가용MD 산식은 이 공유본 + workday.js 재사용
- [ ] `PortfolioSnapshotRepository.setRollupMeta/getRollupMeta`: rollup에 `utilizationValues[]`/`utilizationTotalPeople` 포함(kvs 직접 키)
- [ ] per-member displayName: `getBulkJiraUsersApi` 호출 → **`flattenBulkUsers`(배열가드+`.values`, §3.2.1)** 로 accountId→displayName 맵 평탄화 + accountId 폴백
- [ ] settings 스키마 `utilizationUnderBand`(0.7)/`utilizationOverBand`(1.1) — 가동률 band. 조회 service가 응답에 band 포함 or 프론트가 settings 조회(구현자: 진척도 threshold 전달 패턴 따름). 백오피스 SettingPage UI
- [ ] coworkerFieldId 백엔드 조달 헬퍼(Jira `/field`)
- [ ] `trigger/portfolioSnapshot.js`(runPortfolioSnapshot)
- [ ] `PortfolioDashboardService.js`(getPortfolioDashboardService: 스냅샷 raw + 문제이슈 + 메타 + read-time diagnosis/roleMeta/levelMeta/salaryBuckets + **utilization read-time 버킷팅**(rollup.utilizationValues × settings band); triggerAggregationService: fire-and-forget)
- [ ] `PortfolioDashboardController.js` + `index.js` 등록
- [ ] `manifest.yml`: function `portfolioSnapshot`, scheduledTrigger `portfolio-snapshot`(day). ※`portfolioRollup` 은 **kvs 직접 키**(§4.1) 사용 → 별도 storage entity 정의 불필요(`init-db` 패턴처럼 function/scheduledTrigger만 등록)
- [ ] jest: riskScore/problemIssues severity/per-member 조립 헬퍼 + **mergeIntervals/computeGlobalUtilization(기간중첩 이중계상 미발생 케이스)** 단위테스트

### Frontend
- [ ] `utils/queryKey/portfolioKeys.js`
- [ ] `pages/portfolio/PortfolioDashboardPage.jsx`(canRead('REPORT') + 단일 useQuery + 필터/서브탭 레이아웃)
- [ ] `PortfolioFilterBar.jsx`(@atlaskit/select 멀티셀렉트, 기본 전체 + 선택분 요약 라인) + `hooks/usePortfolioFilter.js`
- [ ] `utils/portfolioAggregate.js` 재집계 순수함수 8종(§6.6, ~~recomputeUtilization~~ 제거 — 가동률 글로벌) + frontend jest + **골든 픽스처 1세트**(대표 projects[] → 위젯별 기대 출력 스냅샷, 조용한 재집계 회귀 차단)
- [ ] `sections/ComparisonTabs.jsx`(서브탭 3) + `RiskSection.jsx`
- [ ] `tabs/`(Overview/PeopleCost/EffortWork) + 위젯 10종 + Header
- [ ] 차트옵션: `stackChartOption` normalize 추가, **`scatterChartOption.js` 신규**(버블·작업분포 공용)
- [ ] `App.jsx` 라우트 `/dashboard`
- [ ] `Sidebar.jsx` mainItems 진입점 + permission 필터
- [ ] 백오피스 `SettingPage` 가동률 band(under/over) 입력 UI(가동률 분포 위젯 포함 시)
- [ ] `locales/kr/portfolio.json` + `locales/en/portfolio.json` 작성 후 `npm run merge`

---

## 13. 핵심 위험 / 구현 주의

- **★ payload 크기(members_json)**: 통상 규모(활성 ≤~30, 인원 ≤~30) 단일 호출 안전(§4.2.1, 수백KB). 활성 수백·인원 수십이면 MB대 → §4.2.2 분리 호출 폴백. **구현 시 실제 데이터로 응답 크기 측정 권장**.
- **★ Forge 응답/메모리 한도 재확인(2026-06-02)**: §4.2.1 payload 추정은 합리적이나 Forge resolver invoke 응답 상한·256MB 메모리·25s 타임아웃 등은 **플랫폼 정책이 바뀌었을 수 있으므로 구현 시점에 현재 공식 한도를 재확인**한다(추정치에만 의존 금지). 단일 호출 우선 전략 자체는 유지.
- **★ aggregating 락 stuck(§3.4)**: 배치 사망 시 플래그 영구 잔존 → 수동 재집계 차단. `aggregatingStartedAt` 타임스탬프 + STALE_LOCK_MS 경과 시 stale 판정 재진입 + `finally` clear 로 자동 복구.
- **★ 프론트 재집계 검증 공백(집계 책임 이동)**: 분포·합산·라인·히스토그램을 전부 프론트로 옮겨 backend 대조군이 없다 → 재집계 버그가 **조용히 틀린다**. §6.6 단위 jest 외에 **골든 픽스처 1세트**(대표 projects[] 입력 → 위젯별 기대 출력 스냅샷)를 고정해 회귀 차단(§6.6·§12).
- **★ 가동률 분모 이중계상(§4.4) — 해결(2026-06-02 A안)**: 프론트 선택분 Σ/Σ 는 동일 인원·기간중첩 시 분모 이중계상(최대 절반 과소)이고 per-project 스칼라로는 합집합 복원 불가. → **필터 무관 글로벌 지표**로 재정의(배치가 인원별 기간 합집합 가용MD 1회 계산). 잔여 구현 주의: `mergeIntervals`(기간 병합) + 동일 schedule row dedup(여러 프로젝트에 실려와도 연차 1회 차감) 정확성 — jest 케이스 필수.
- **★ 급여 민감성**: `members[].salary` 가 응답에 raw로 내려간다(히스토그램·인건비 재집계 위해 불가피). 차트는 카운트/합계만 표시하나 **네트워크 응답에 개별 급여 존재** → REPORT 권한 게이트로 1차 차단, 서버 마스킹/권한 분리는 후속(§10). **v2는 개별 급여 미노출이었으나 v3 프론트 재집계 전환으로 노출 불가피** — 사용자 인지 필요.
- **배치 타임아웃**: 워크로그 규모 + displayName bulk 조회 추가. pLimit(2) 유지, displayName은 프로젝트당 chunk 1~2회로 가벼움. 초과 징후 시 큐 fan-out(후속).
- **공통 페치 경로 미수정**: 워크로그는 `getResourceProjectWorklogs`만, 인원은 신규 `MEMBER_ROWS`(기존 groupBy*/getSalary 미수정).
- **members[] 모수**: projectusers 전원(워크로그 0인 인원 effortMd=0 포함). ResourceAnalysisService.members(워크로그 인원만)와 다름 — 배치는 projectusers 기준 좌조인(§3.2.1).
- **read-time 비캐시**: diagnosisStatus·statusName·roleMeta/levelMeta 이름·가동률 버킷(프론트) = 비캐시. 스냅샷엔 key/diff/raw.
- **JSON 컬럼 파싱**: members_json/monthly_effort_json 조회 시 드라이버 반환형 확인 후 안전 파싱(객체 vs 문자열).
- **필터 기본 전체**: data 로드 후 전체 선택 초기화. 프로젝트 추가/삭제 시 동기화(useEffect). 0개 선택 시 위젯 빈 상태 처리.
- **문제이슈 필터 예외**: problemIssues 는 필터 무관 — 위젯이 selectedIds 를 무시하고 원본 사용. "필터 무관" 배지 필수.
