# Moves RMS 경쟁 분석

| 항목 | 내용 |
|---|---|
| 문서 버전 | v3 (근거·출처 전면 보강) |
| 기준일 | 2026-09-01 (조사 2026-08-31 ~ 09-01) |
| 조사 범위 | Atlassian Marketplace 인력·원가 관리 앱 10종, 글로벌 독립형 리소스관리 SaaS 4종, 국내 독립형 PMS 6종, 시장·제도·법령 |
| 조사 방법 | 마켓플레이스 리스팅·REST 가격 API·벤더 공식 문서·리뷰·법령·공시 직접 확인 (핸즈온 미실시). 우리 제품 사실은 **소스 코드로 확인** |
| 근거 표기 | 외부 출처 **[n]** → §16 근거 목록 / 우리 제품 코드 **[C-n]** → §17 코드 근거. 확인 못 한 항목은 **미확인** |

> **읽는 법** — ✅ 지원 확인 · 🟡 부분 지원·조건부·확인 불가 · ❌ 미지원 · — 개념 자체가 해당 없음. 가격은 별도 표기 없으면 Cloud 11~100 유저 구간 **$/user/월**, 마켓플레이스 REST 연간 티어 ÷10 환산 [42][54]. 모든 마켓플레이스 앱은 10유저 이하 무료.

---

## 1. 요약

1. **직접 경쟁자가 없는 조합** — "MD/MM 공수 산정 + 급여(연봉/월급) 환산 원가 + 급여 가시성 정책 + 순수 Forge"를 한 앱에 담은 제품은 조사 범위(마켓플레이스 10종) 안에 없다. 경쟁 앱의 원가는 전부 **시급(hourly rate)** 기반이며 [22][46][59][73][85], 급여 자체를 저장·환산하는 앱은 확인되지 않았다 (ActivityTimeline만 월 정액 단가 지원 [59]).
2. **가장 가까운 경쟁자 3곳** — ① **ActivityTimeline** (올인원·한국어 UI·휴가 승인·월 정액 단가, $2.50) [52][54][62][64], ② **TeamBoard TimePlanner** (단가 4계층·Cost Admin/Viewer 권한, $1.75) [69][73][74], ③ **Resource Management for Jira by Be On Time** (순수 Forge·Runs on Atlassian 배지, 설치 12건, 아르메니아 벤더) [77][78][79]. 세 곳 모두 MD/MM·급여 환산은 없다.
3. **Tempo·BigPicture는 상위 시장** — 설치 2.7만 [18] / 1.1만 [40] 건의 성숙 제품이지만, Tempo는 3개 유료 앱 조합(≈$9.20+) [15][19]·**Jira 전 유저 강제 과금** [16][17]·한국어 미지원 [18], BigPicture는 범용 PPM이라 인력·원가는 부수 기능. 둘 다 **데이터가 벤더 인프라에 저장**된다 (Tempo=Forge Remote [30], BigPicture=Appfire AWS [48]).
4. **국내 독립형 PMS는 경쟁재가 아니다** — E3PS·유시스·WATCH2·Smartbase·Link PMS 모두 구축형/온프레미스이고 제조 R&D 또는 공공 SI 산출물 관리 지향 [99]~[104]. **Jira 연동을 내세운 곳은 한 곳도 없다.**
5. **우리의 미흡점** — 급여 원가의 앞뒤 흐름(타임시트 승인 [C-12] → 사용자 예산 대비·워크로그 기반 실적 원가 [C-7][C-8][C-9] → 청구 단가 분리 [C-13])이 비어 있고, 마켓플레이스 실적·배지·가격이 없다. 보강 순서는 **타임시트 승인 → 마켓 등록·배지 → 예산·실적 정밀화** (§8).
6. **판단** — Tempo·BigPicture와 정면 경쟁하면 성숙도·기능 폭에서 진다. "Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 SI·공공·에이전시"로 좁히면 그들이 구조적으로 못 하는 것(급여 원가·한 앱 가격·데이터 무유출·한국어)이 결정 요인이 된다 (§10).
7. **확장** — RMS(Jira 안 리소스 관리)는 이길 수 있고, 국내 독립형 PMS는 Confluence 앱과 결합해 대체할 수 있으며, 글로벌 범용 PPM은 Atlassian Plans가 흡수 중이라 [5]~[8] 싸울 자리가 아니다. 글로벌은 "MM 정산 문화권"(일본 人月 [108][109] → DACH Tagessatz [110][111])으로 간다 (§12).

> **v1 → v3 정정 이력** — v1의 "휴가/가용성 관리 부재", "MD 단위 유일", "예산/EVM 없음"은 코드 확인 결과 **모두 오류**였다 [C-3][C-4][C-7]. BigPicture도 man-day 모드가 있다 [45]. 경쟁 비교에서 우리 기능은 반드시 코드로 먼저 확인한다.

---

## 2. 기준점 — Moves RMS 프로필

| 항목 | 내용 | 근거 |
|---|---|---|
| 아키텍처 | Atlassian Forge (nodejs22.x) — Forge SQL + Forge KVS + Jira REST. 외부 전송은 Sentry(`analytics` 카테고리, `inScopeEUD: false`)뿐 | [C-1] |
| Runs on Atlassian | 🟡 요건 충족 — "analytics 목적 egress는 in-scope End-User Data를 보내지 않으면 적격" [1], `inScopeEUD:true`면 부적격 [2]. 배지는 마켓플레이스 등록 시 심사 | [1][2][3][C-1] |
| 데이터 레지던시 | Forge 호스팅 스토리지(KVS·SQL)는 Atlassian 데이터 레지던시를 자동 상속 | [4] |
| 핵심 기능 | 프로젝트 인력·팀 관리, 워크로그 추적, **MD/MM 산정**, 가동률, 진척도, **급여 기반 원가 분석 + EVM 근사**, 간트, 전사 포트폴리오 대시보드, 작업 배정, 분석 리포트 | [C-6][C-7][C-14][C-15] |
| 원가 모델 | 백오피스 연봉 + 프로젝트별 투입급여(`salary_type`), ANNUAL은 월할 환산 `(annual/12) × projectMonths`. 급여 정책(등급 밴드 vs 인원별) + `CostAccess.canReadCost` 이중 게이팅 | [C-6][C-10] |
| EVM | BAC=투입급여 합, AC=BAC×일정경과율, EV=BAC×완성률, CPI/EAC/ETC/초과액, 월별 소진(워크로그 MD 비중 안분). UI: CostEvmCard·CostBurnUp·CostPlanActualBar | [C-7][C-8][C-15] |
| 가용성 | 연차(work_ratio 0 → 1 MD)·반차(0.5)·출장·기타(1) 스케줄이 근무일 기준 가동률 분모에서 차감. 공휴일 백오피스 관리 | [C-3][C-4][C-5][C-16] |
| 팀 관리형 프로젝트 | ✅ 커스텀 필드 누락을 이슈 엔티티 프로퍼티(`movesRms`, `searchAlias`)로 자동 우회 — 사용자 수동 설정 불필요 | [C-2] |
| 언어 | 한국어 · 영어 (`locales/kr`, `locales/en`) | [C-11] |
| 없는 것 (코드 확인) | 타임시트·휴가 **승인** 워크플로 [C-12], 청구(billing) 단가·인보이스 [C-13], 사용자 입력 예산(`total_budget`)의 원가 분석 연결 [C-9], 워크로그 기반 실적 원가(AC가 일정 안분) [C-8], 직접비, 국가별 휴일 스킴, 다통화, SAFe/what-if, AI 연동, Data Center 버전 | — |
| 가격 | 미정 | — |

---

## 3. 경쟁 지형 분류

| 구분 | 제품 | 성격 | 겹치는 정도 |
|---|---|---|---|
| **직접 경쟁** (Jira 앱, 배정+가동률+원가) | ActivityTimeline [52], TeamBoard TimePlanner(+ProScheduler) [68][69], Resource Management for Jira(Be On Time) [77] | 한 앱 안에서 인력 배정·가동률·원가 | 높음 |
| **상위 시장** (Jira 앱, 대형) | Tempo 제품군 [14][18][20][32], BigPicture [40] | 설치 1만 건 이상. 범용 PPM 또는 모듈 조합 | 중간 — 세그먼트가 다름 |
| **부분 경쟁** (한 축만) | Time & Cost Tracker(원가만) [80], Clockwork Pro(타임트래킹+원가) [84], Planyway(일정·워크로드만) [86], Capacity Planner by RVS(스프린트 용량만) [88] | 원가 또는 배정 중 한 축 | 낮음~중간 |
| **독립형 글로벌 SaaS** | Float [90], Runn [93], Resource Guru [95], Kantata [97] | Jira 외부 툴. 대부분 Jira→툴 단방향 | 낮음 |
| **국내 독립형 PMS** | E3PS [99], 유시스 [100], WATCH2 [101], Smartbase [102], Link PMS [104], 솔브리드플러스 [105] | 구축형, Jira 연동 없음 | 낮음 (구매 검토 시 비교 대상으로는 등장) |

---

## 4. 경쟁사 상세

### 4.1 Tempo 제품군 (Tempo Software)

| 항목 | 내용 | 근거 |
|---|---|---|
| 구성 | Capacity Planner(구 Planner) + Timesheets + Financial Manager(구 Cost Tracker) + Structure PPM/Gantt — 기능별 **별도 유료 앱** | [14][18][20][32][33] |
| 마켓 지표 | Capacity Planner 설치 9,721 · 평점 3.7 · 리뷰 200 / Timesheets 27,122 · 4.1 · 896 / Financial Manager 3,199 · 3.8 · 46 / Structure 13,081 · 4.6 · 408 | [14][18][20][32] |
| 가격 | Capacity Planner $3.99 · Timesheets $5.21 · Structure Std $3.52 / Adv $4.73 · Gantt $1.27 · Financial Manager **미확인**. Planner+Timesheets만 **$9.20** + FM | [15][19][34][35] |
| 과금 단위 | **"Your Tempo license size must match your Jira license size. A user is anyone who can log into Jira."** — 일부 유저만 구매 불가 | [16][17] |
| 가격 인상 | 2025-09-15 Cloud 1~250명 10~15%, 251~5,000명 20%, 5,001+ 25% | [31] |
| 아키텍처 | Connect → **Forge Remote** 전환 — "frontend moves to Forge (Atlassian-hosted), while backend services remain on the vendor's own infrastructure". **"cannot be undone"**(롤백 불가) | [30] |
| 자원/가동률 | 워크로드 스킴 − 휴일 스킴 = 용량·FTE. Utilization Rate 계산 옵션 2종. **Planned vs Actual은 Timesheets 동시 설치 필수** | [25][26][27][28] |
| 원가 모델 | Financial Manager — **시간당** cost rate·billing rate, 역할별 글로벌 또는 개인별, 날짜별 변동. **급여 저장 없음**. Timesheets 필수 의존. EVM·편차 리포트는 DC용 Budgets에만 있고 Cloud 미제공 | [22][24][21] |
| 원가 권한 | 글로벌 3단(Project Administrator / Manager / Viewer) + 프로젝트 역할 3단(Owner / Editor / Viewer). Viewer는 단가·비용·워크로그 열람 불가 | [23] |
| 팀 관리형 | Tempo Team/Account 필드를 팀 관리형 스페이스에 **수동 추가** 필요 | [29] |
| 한국어 | ❌ (EN/FR/ES/DE/PT/RU) | [18] |
| 약점 | 평점 3.7(제품군 최저) [14], "설치 후 아무것도 안 보임" 리뷰 [37], 워크로그 asApp 기록으로 작성자 JQL 깨짐·락인 우려(2026-06 리뷰) [38], 전체 워크플로에 3개 앱 필요 [39] | [14][37][38][39] |

### 4.2 BigPicture (Appfire)

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표 | 설치 10,952 · 평점 3.9 · 리뷰 504(Cloud 295) · Cloud Fortified | [40] |
| 가격 | Standard / Advanced 2에디션(2026-07-01 적용). 100유저 연간 $5,210 / $5,730 (≈ **$4.34 / $4.78**). REST 실측 100유저 월과금 $5.73. 갱신가 초기가의 50% | [41][42] |
| 아키텍처 | 앱 데이터가 **Appfire AWS 6개 리전**(버지니아·오하이오·더블린·프랑크푸르트·싱가포르·시드니)에 저장. 리전 선택은 Enterprise만 → Runs on Atlassian 아님 | [48] |
| 자원/가동률 | Resources 모듈, 개인·팀 뷰. 용량 = 워크로드 플랜 − 휴일 플랜 − 개인 부재. "Find the perfect match" 가용 담당자 제안 | [43][44] |
| 공수 단위 | 🟡 **"The effort mode can be expressed in the following units: Hours / Man-days / Percent / Story points"** — 다만 원가는 시급 | [45][46] |
| 원가 모델 | Financials 모듈(Cloud는 Advanced) — 팀/리소스별 **시간당 단가**, Box 레벨 USD만·팀 레벨 다통화, 예상 예산·실행 원가·Planned vs Actual. **급여 저장 없음** | [46] |
| 원가 권한 | 앱 레벨 2종 — App Financial Viewer / App Financial Admin + Box별 보안 역할 | [46][47] |
| 휴가 | 홀리데이 플랜 + 개인 부재로 용량 차감. 승인 워크플로 **미확인** | [43] |
| 팀 관리형 | Start/Due date 필드·베이스라인용 커스텀 필드 2개·프로젝트별 동기화를 **수동** 설정. "일부 기능 사용 불가" 문서화 | [49] |
| 한국어 | ❌ | — (마켓 리스팅 언어 목록에 없음 [40]) |
| 약점 | 대용량 로딩 지연, 설정 복잡·학습곡선("사내 Jira 전문가 필요"), 무료 구간 초과 시 전체 과금 | [50][51] |

### 4.3 ActivityTimeline (Reliex) — 가장 근접한 직접 경쟁자

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표 | 설치 3,759 · 평점 4.7 · 리뷰 121 · Cloud Fortified · ISO 27001·SOC2. 2.3.0(2026-06-09) Advanced 에디션(Finances) 도입 | [52][55] |
| 가격 | 11~100 **$2.50** · 101~250 $1.75 · 251~1,000 $1.25. 10유저 $10 정액(무료 구간 없음). Advanced 단가 **미확인** | [53][54] |
| 아키텍처 | 앱 키 `com.reliex.activitytimeline.cloud.atlassian.connect`, 스코프 `*:connect-jira` → **Connect 앱** | [55] |
| 자원/가동률 | 개인 Workload Scheme, 일별 involvement. Resource/Team Utilization, Planned vs Actual(ON TRACK/OVER/UNDER) | [56][57][58] |
| 원가 모델 | Finances — 사용자별 Cost Rate + Billing Rate. **"When selecting Monthly, the system treats the value as a fixed monthly amount … automatically distributed (pro-rated) across the days of that month … Monthly rates are time-based, not worklog-based"**. 효력일 기반 단가 이력 | [59][60] |
| 원가 권한 | "역할 기반 접근 제어" 홍보하나 공식 역할 문서(7단계)에 Finances 항목 없음 — 세부 **미확인** | [61] |
| 휴가 | ✅ 연간 허용일 → 요청 → 관리자 승인 → 잔여일 반영. 승인분만 용량 차감 | [62] |
| 팀 관리형 | Start/End·Original Estimate·Story Points를 프로젝트별 **수동** 설정 | [63] |
| 한국어 | ✅ (EN/DE/FR/ES/IT/PT-BR/**KO**/ZH) | [64] |
| 약점 | Jira 동기화 15분+ 지연, 로그 시간 날짜 오표시, 초기 UI 혼란 | [65][66] |

### 4.4 TeamBoard ProScheduler + TimePlanner (DevSamurai)

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표 | ProScheduler 설치 3,195 · 4.3 · 175 / TimePlanner 설치 1,332 · 4.8 · 116 · Cloud Fortified | [68][69] |
| 가격 | ProScheduler **$1.75** + TimePlanner **$1.75** = $3.50. 벤더 사이트는 $1.25/$1.50 표기 — REST와 불일치(구버전 추정) | [68][69][75][76] |
| 아키텍처 | REST `connect:false` → Forge 기반. RoA 배지 **미확인** | [68][69] |
| 자원/가동률 | ProScheduler: 용량 기반 배정, 시간/% 워크로드, 공휴일·병가·휴가, 간트(의존성·베이스라인·크리티컬 패스), 포트폴리오 | [70][71] |
| 원가 모델 | TimePlanner: **Resource / Resource Group / Project / Project Group 4계층 단가**, 유효기간 이력, Scheduled vs Actual Cost, 인보이스. **시급 billing rate — 급여·MD/MM 없음** | [72][73] |
| 원가 권한 | **"Billing/Cost Admin has permission to plan cost and edit cost settings. Billing/Cost Viewer has permission to view billing/cost data"** | [74] |
| 휴가 | ✅ 휴가 승인 + 타임시트 승인 (TimePlanner) | [72] |
| 한국어 | **미확인** | — |

### 4.5 Resource Management for Jira (Be On Time) — 아키텍처가 가장 유사한 신규 앱

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표 | 설치 **12** · 평점 5.0 · 리뷰 2 · "New" · **Runs on Atlassian 배지** · v4.27.0(2026-08-28) | [77] |
| 벤더 | Be On Time — **아르메니아 예레반**. "Konstantin Kireev trading as Be On Time" + 파트너 Repka Solutions LLC (개인사업자 구조) | [78][79] |
| 가격 | **$2.50 정액**(15~1,000명 동일) | [77] |
| 아키텍처 | 순수 Forge. "Runs on Forge, 100% Data stays in Atlassian" | [77][79] |
| 기능 | 리소스 요청 라이프사이클, 과부하 플래그, 휴가 셀프서비스, 타임시트 승인, "invoice-ready exports with cost calculations"(단가 모델 **미확인**), 계층형 팀 + scoped access | [77] |
| 시사점 | "순수 Forge·데이터 무유출" 포지션을 먼저 마켓에 올렸다. 개인사업자 규모라 지속성은 불확실하나 릴리스가 빠르므로 분기별 추적 | — |

### 4.6 Time & Cost Tracker for Jira (SaaSJet)

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표·가격 | 설치 530 · 4.6 · 17 · Cloud Fortified · Forge 기반 · **$1.50** | [80] |
| 원가 모델 | hourly rate + billing rate, 효력일 이력. **"Jira project costs = Personnel worklogs × Salary rates + Direct expenses"**. 예산·EVM·OPEX/CAPEX | [81][82] |
| 원가 권한 | Jira 그룹 단위로 열람/리포트/지출/접근 관리 분리 | [83] |
| 없는 것 | 자원 배정·가동률·휴가·간트 — **사후 원가 리포트 전용** | [80][81] |

### 4.7 Clockwork Pro (HeroCoders)

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표·가격 | 설치 4,631 · 4.6 · 139 · Forge 기반 · **$1.30** | [84] |
| 원가 모델 | Hourly Cost + Hourly Rate. **"Currently, we do not support defining costs and rates for a certain period of time or different rates for different spaces"** | [85] |
| 원가 권한 | `Clockwork Budgeting Access` 글로벌 권한 단일 | [85] |
| 없는 것 | 자원 배정·가동률·휴가·간트·포트폴리오 | [84] |

### 4.8 Planyway for Jira

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표·가격 | 설치 1,468 · 4.6 · 52 · Forge 기반 · **$3.00** | [86] |
| 기능 | 자원 배정, scheduled vs capacity 가동률, 휴가·공휴일, 타임라인, 포트폴리오, 타임시트. **원가·단가 전무** | [86][87] |

### 4.9 Capacity Planner – Resource Planning in Jira (RVS Softek)

| 항목 | 내용 | 근거 |
|---|---|---|
| 마켓 지표·가격 | 설치 496 · 4.4 · 13 · **Connect 앱**(REST `connect:true`, 조사 중 유일) · **$0.50** | [88] |
| 기능 | 스프린트·픽스버전 배정, 가동률 대시보드, 휴가·공휴일, Tempo 연동. 원가·간트 없음 | [88][89] |

### 4.10 독립형 글로벌 리소스관리 SaaS

| 제품 | 가격 | Jira 연동 | 원가 | 단위 | 근거 |
|---|---|---|---|---|---|
| **Float** | Starter $7 / Pro $12 per scheduled person/월 | **단방향(Jira→Float)**. "Projects, people, and tasks created in Float are not synced to Jira". 워크로그 미동기. 마켓 앱 무료·설치 960 | Cost rates, rate cards, 마진 | 시간 | [90][91][92] |
| **Runn** | Lite $7 / Standard $11 per seat/월 | **단방향** 프로젝트·인원만. 타임시트 "We don't support this at the moment" | Project Financials·Budgets | hours/day 또는 % | [93][94] |
| **Resource Guru** | $5 / $8 / $12 per person/월 | **단방향** 이슈 임포트, original estimate vs 스케줄 | 인원·역할별 시급 | hours-per-day | [95][96] |
| **Kantata** | 비공개, 제3자 추정 $45~110, 50석 최소 | **양방향**. "Jira Software Classic만(NextGen 불가)" | PSA 전체 | 일 단위 | [97][98] |

### 4.11 국내 독립형 PMS

| 제품 | 성격 | 공수/인력/원가 | 배포 | Jira | 근거 |
|---|---|---|---|---|---|
| **E3PS PMS** | PTC 파트너, 제조 R&D | "예상 원가 분석, 인력 투입 분석, 리소스 할당". MD/MM·가동률 명시 없음 | 구축형 | ❌ | [99] |
| **유시스 스마트 PMS** | 공정·진척·산출물 | "인력관리". 공수·원가 문구 없음 | 구축형(견적) | ❌ | [100] |
| **WATCH2 Project** | 공공 SI 특화 — WBS⇔간트·S-Curve·산출물 다단계 승인·주/월간보고 DOCX | 공수·원가 항목 없음 | **On-Premise**, 폐쇄망 | ❌ | [101] |
| **Smartbase PMS** | PMBOK EPM, 제조 | "자원관리, 비용관리, 인력 배정, 원가 분석" | SaaS(최소 10유저, 인프라 ₩15~25만/월) | ❌ | [102][103] |
| **Link PMS** | WBS·칸반·간트, 전자정부 F/W | "자원 관리, 현황/통계". MM 미확인 | 구축형+SaaS | ❌ | [104] |
| **솔브리드플러스** | 연구과제 관리 | **미확인**(이미지 페이지) | 구축형 | ❌ | [105] |

> 공공 SW 대가산정은 KOSA 가이드가 정본이다: **"기능점수 방식을 원칙으로 한다. 다만 … 발주자의 판단에 의해 투입공수에 의한 방식을 적용할 수 있다"**, 투입공수 산식 = "(투입인력수×투입기간×기술자직무별단가)+제경비+기술료+직접경비" [106]. 2025년 개정판은 "운영 및 유지관리비는 투입공수 방식으로 산정" [107]. 즉 MM 정산은 제도적으로 규정된 방식인데, 이를 전면에 둔 국내 제품은 확인되지 않았다.

---

## 5. 기능 대조 매트릭스

| 기능 | Moves RMS | Tempo (3앱) | BigPicture | ActivityTimeline | TeamBoard (2앱) | Be On Time RM | 국내 PMS |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Jira 네이티브 | ✅ Forge [C-1] | ✅ Forge Remote [30] | ✅ [40] | ✅ Connect [55] | ✅ Forge 기반 [68] | ✅ Forge [77] | ❌ |
| Runs on Atlassian | 🟡 요건 충족 [1][C-1] | ❌ [30] | ❌ [48] | ❌ [55] | 🟡 미확인 | ✅ 배지 [77] | — |
| 자원 배정·용량 | ✅ | ✅ [27] | ✅ [43] | ✅ [56] | ✅ [70] | ✅ [77] | 🟡 |
| 가동률 (%) | ✅ [C-3] | ✅ [26] | ✅ [43] | ✅ [58] | ✅ [70] | 🟡 과부하 플래그 [77] | 🟡 |
| MD/MM 공수 단위 | ✅ | ❌ 시간·FTE [27] | 🟡 man-day 모드 [45] | ❌ | ❌ | ❌ | 🟡 |
| 급여(연봉/월급) 환산 원가 | ✅ [C-6] | ❌ 시급 [22] | ❌ 시급 [46] | 🟡 월 정액 [59] | ❌ 시급 [73] | 🟡 미확인 | 🟡 |
| 원가 가시성 세분화 | ✅ 정책 이원화 + CostAccess [C-10] | 🟡 3단+3단 [23] | 🟡 2단 [46] | 🟡 미확인 [61] | 🟡 2단 [74] | 🟡 scoped [77] | 미확인 |
| 휴가·공휴일 → 용량 차감 | ✅ [C-3][C-4] | ✅ [28] | ✅ [43] | ✅ [62] | ✅ [70] | ✅ [77] | 미확인 |
| 휴가 승인·잔여일 | ❌ [C-12] | 🟡 미확인 | 🟡 미확인 | ✅ [62] | ✅ [72] | 🟡 셀프서비스 [77] | — |
| 타임시트 승인 | ❌ [C-12] | ✅ [18] | ❌ | ❌ | ✅ [72] | ✅ [77] | — |
| 간트 | ✅ [C-14] | 🟡 Structure 별도 [33] | ✅ [40] | 🟡 타임라인 | ✅ [70] | 🟡 미확인 | ✅ |
| 전사 포트폴리오 | ✅ | 🟡 Structure 별도 [32] | ✅ [40] | 🟡 | 🟡 | 🟡 | 🟡 |
| 워크로그 연동 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 예산 / EVM | 🟡 EVM 근사 — BAC=투입급여, AC=일정 안분 [C-7][C-8] | 🟡 예산만(EVM은 DC) [24] | ✅ [46] | ✅ 예산 [60] | 🟡 계획 vs 실적 [73] | 🟡 | 🟡 |
| 팀 관리형 프로젝트 | ✅ 자동 [C-2] | 🟡 수동 [29] | 🟡 수동 [49] | 🟡 수동 [63] | 미확인 | 미확인 | — |
| 한국어 UI | ✅ [C-11] | ❌ [18] | ❌ | ✅ [64] | 미확인 | 미확인 | ✅ |

---

## 6. 가격 비교 (Cloud, 11~100 유저, $/user/월)

| 제품 | 단가 | 비고 | 근거 |
|---|---|---|---|
| Moves RMS | 미정 | — | — |
| Capacity Planner by RVS | $0.50 | 스프린트 용량만 | [88] |
| Clockwork Pro | $1.30 | 타임트래킹+원가 | [84] |
| Time & Cost Tracker | $1.50 | 원가 리포트만 | [80] |
| TeamBoard ProScheduler + TimePlanner | $1.75 + $1.75 = **$3.50** | 배정·간트 + 원가 | [68][69] |
| ActivityTimeline | **$2.50** | 올인원 (Advanced 미확인) | [54] |
| Resource Management for Jira | **$2.50 정액** | 볼륨 할인 없음 | [77] |
| Planyway | $3.00 | 원가 없음 | [86] |
| BigPicture | ≈ $4.34 Std / $4.78 Adv | 100유저 연간 환산 | [41][42] |
| Tempo Capacity Planner + Timesheets | $3.99 + $5.21 = **$9.20** | + FM(미확인) + Structure $3.52~4.73. **Jira 전 유저 과금** | [15][19][34][16] |
| Float / Runn / Resource Guru | $7~12 | 독립형, Jira 단방향 | [90][93][95] |
| Kantata | $45~110 (추정) | 50석 최소 | [98] |

> 직접 경쟁 3곳이 **$2.50~3.50**. Moves RMS 가격 설계의 기준 구간.

---

## 7. 비교 우위 (우리가 앞서는 지점)

1. **급여 환산 원가 + 가시성 정책** — 경쟁 앱 원가는 전부 시급 rate [22][46][73][85]. 급여 자체를 저장·환산하는 앱은 없다(ActivityTimeline 월 정액이 가장 근접 [59]). "등급 밴드 vs 인원별" 정책과 `CostAccess`를 **별개로 이중 게이팅** [C-10]하는 구조는 경쟁사 2단 Viewer/Admin [46][74]보다 세밀하다. 이는 개인정보 안전성 확보조치 기준의 "업무 수행에 필요한 최소한의 범위로 차등 부여" [116]·GDPR 데이터 최소화 [114]에 직접 대응한다.
2. **MD/MM 공수를 원가까지 연결** — BigPicture가 man-day 효과 모드를 갖지만 [45] 원가는 시급 [46]. 공수 → 급여 환산 [C-6] → 프로젝트 원가 → EVM [C-7]로 이어지는 산식은 조사 범위에서 Moves RMS만 있다. KOSA 대가산정 가이드의 투입공수 산식 "(투입인력수×투입기간×기술자직무별단가)" [106]과 같은 언어다.
3. **팀 관리형 프로젝트 자동 대응** — Tempo·BigPicture·ActivityTimeline 모두 수동 필드 추가를 요구한다 [29][49][63]. 이슈 프로퍼티 우회 [C-2]로 설정 없이 동작한다.
4. **순수 Forge·데이터 무유출** — Tempo(Forge Remote [30])·BigPicture(Appfire AWS [48])·ActivityTimeline(Connect [55])은 데이터가 벤더 인프라로 나간다. 우리는 Runs on Atlassian 요건을 충족하고 [1][2][C-1] 데이터 레지던시를 자동 상속한다 [4]. Forge 수익 배분(누적 $1M까지 0%, 이후 16→17% vs Connect 20→25%) [10]도 유리하다 — 단 인상 시점은 2026-04-01/10-01로 연기됐다 [11].
5. **한국어 + 통합** — 한국어 UI는 ActivityTimeline 외 전무 [18][64]. 배정·가동률·진척·원가·간트·포트폴리오를 한 앱에 담아 Tempo 3앱 [15][19]·TeamBoard 2앱 [68][69] 대비 TCO 메시지를 만들 수 있다.

## 8. 미흡점 — 우선순위별

### 8.1 기능 — 정산 흐름이 끊겨 있다

| 갭 | 왜 치명적인가 | 보유 경쟁사 | 우리 근거 |
|---|---|---|---|
| **타임시트(워크로그) 승인** | 워크로그가 원가로 바뀌는데 "누가 승인했나"가 없으면 정산 근거로 쓸 수 없다 | Tempo Timesheets [18] · TeamBoard [72] · Be On Time [77] | 코드에 승인 기능 0건 [C-12] |
| **예산·실적 원가 정밀화** | EVM 근사는 있으나 ① 사용자 입력 `total_budget`이 원가 분석에 연결 안 됨(BAC=투입급여 합) ② AC가 워크로그 실적이 아닌 일정 경과 안분 ③ 직접비 없음 | BigPicture [46] · ActivityTimeline [60] · SaaSJet(worklog × rate + 직접비) [81] | [C-7][C-8][C-9] |
| **휴가 승인·잔여 연차** | 차감은 되지만 승인자·잔여일이 없다 | ActivityTimeline [62] · TeamBoard [72] | [C-3][C-12] |
| **청구 단가 ↔ 내부 원가 분리** | 외주 SI는 청구 MM 단가와 급여 원가를 나눠 마진을 본다 | TeamBoard [73] · SaaSJet [81] · Clockwork [85] | 코드에 billing 0건 [C-13] |

> 네 항목 모두 우리 강점(급여 원가)의 **앞뒤 흐름**이다.

### 8.2 신뢰 — 아직 제품이 아니라 코드다

| 갭 | 현황 | 비교 |
|---|---|---|
| 마켓플레이스 실적 | 설치·리뷰·Cloud Fortified·RoA 배지 전부 없음 | 최소치 Be On Time도 설치 12건에 배지 [77] |
| E2E 미수행 기능 | 포트폴리오·비용·팀 분석·급여 정책·자원관리 등 다수 | — |
| 데이터 상한 | Forge SQL 1GiB(프로덕션). 아카이빙·삭제 정책 없음 | — |
| 가격 | 미정 | 직접 경쟁 $2.50~3.50 (§6) |

### 8.3 범위

| 갭 | 설명 |
|---|---|
| **Tempo 마이그레이션 경로** | 타겟 조직 상당수가 Tempo 사용(설치 2.7만 [18]). 팀·계정·단가 임포터 없음 |
| **정산용 엑셀 출력** | "월별 인원 × MM × 단가" 정산표 형식 출력 존재 여부 확인 필요. `exceljs` 의존성은 있음 [C-14] |
| **Data Center 미지원** | DC는 2026-03-30 신규 판매 종료, 2028-03-30 기존 고객 구매 마감, 2029-03-28 EOL [9] — 시간이 갈수록 약점 아님 |
| **국가별 휴일·다통화** | 단일 공휴일 테이블 [C-16], 원화 단일 — 글로벌 진출 시 필요 (§12.3) |

### 8.4 일부러 안 하는 것

SAFe/애자일 포트폴리오, what-if 시나리오, AI 예측, 리스크 매트릭스 — BigPicture 영역 [40]이고 Jira Premium Plans가 흡수 중 [5][8]. 타겟 세그먼트가 찾지 않는다.

### 8.5 보강 순서

**타임시트 승인 → 마켓 등록·RoA 배지 → 예산·실적 정밀화** → 휴가 승인 → 청구 단가 분리 → Tempo 마이그레이션.

---

## 9. 리스크와 제언

| 구분 | 내용 | 근거 |
|---|---|---|
| 모방 리스크 | BigPicture는 이미 man-day 모드가 있고 [45], Tempo·ActivityTimeline이 "MD 환산" 뷰를 추가하는 것은 UI 작업이다. **공수 단위 자체는 해자가 아니다.** 급여 환산·가시성 정책·팀 관리형 자동 대응이 방어선 | [45][C-2][C-6][C-10] |
| 신규 경쟁자 | Be On Time이 "순수 Forge·데이터 무유출"을 먼저 올렸다. 개인사업자 구조 [79]라 지속성 불확실, 릴리스 빠름(v4.27, 2026-08 [77]). 분기별 추적 | [77][78][79] |
| GTM | 국내 PMS는 Jira 연동 0곳 [99]~[104] → "Jira를 쓰는 SI 조직"이 빈 자리. MM 정산은 KOSA 가이드에 규정된 제도적 방식 [106][107] | [99]~[107] |
| 가격 | 직접 경쟁 3곳 $2.50~3.50 (§6) | [54][68][69][77] |
| 메시징 | "레이트 기반 원가"가 아니라 "공수(MD/MM) 기반 급여 원가". RoA 배지 취득 우선 | [1] |

---

## 10. 판단 — Tempo·BigPicture 대비

> 결론: **정면으로 붙으면 진다. 그러나 정면으로 붙을 이유가 없다.**

### 10.1 Tempo·BigPicture가 확실히 앞서는 것

| 항목 | 내용 | 근거 |
|---|---|---|
| 성숙도·신뢰 | 설치 2.7만 / 1.1만 건, 리뷰 수백 건, Cloud Fortified. 우리는 0건 | [18][40] |
| 기능 폭 | 타임시트 승인·예산·휴가 승인·통합 생태계(Tempo: Slack/캘린더/IDE [18], BigPicture: SAFe·리스크·what-if [40]) | [18][40] |
| 범용성 | 어느 업종이든 쓸 수 있게 설계. 우리는 "급여를 프로젝트별로 넣고 MD로 정산"이라는 전제가 깔려 있다 | [C-6] |

### 10.2 이들이 구조적으로 못 하는 것

| 항목 | 내용 | 근거 |
|---|---|---|
| 급여 원가 | 둘 다 시급 rate. 기능 부족이 아니라 **설계 철학** — "청구 단가"를 다루지 "직원 연봉"을 앱에 넣는 걸 전제하지 않는다 | [22][46] |
| 가격 구조 | Tempo는 3앱 $9~10+ 에 **Jira 전 유저 강제 과금**("must match your Jira license size") [16]. BigPicture $4.3~4.8 [41]. 우리가 $2.5~3.5 한 앱이면 TCO 3배 차이 | [15][16][19][41] |
| 데이터 위치 | Tempo=Forge Remote("backend services remain on the vendor's own infrastructure") [30], BigPicture=Appfire AWS 6개 리전 [48]. 우리는 Atlassian 밖으로 나가지 않는다 [1][C-1]. 공공·금융 보안 심사에서 통과/탈락 요인 | [30][48][1] |
| 한국어·업계 어휘 | 둘 다 한국어 없음 [18]. "가동률·MM·투입공수"는 KOSA 가이드의 공식 용어 [106] | [18][106] |

### 10.3 판단

**세그먼트를 좁히면 이기고, 넓히면 진다.** "Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 SI·공공·에이전시 조직"으로 좁히면, 그 안에서는 Tempo·BigPicture가 오히려 부적합하다 — 시급을 억지로 넣어야 하고, 3개 앱을 사야 하고, 한국어가 없고, 데이터가 해외로 나간다. 이 세그먼트는 국내 PMS(Jira 연동 0곳)와 해외 앱(급여 원가 0곳) 사이에서 **비어 있다**.

### 10.4 전제 조건

**타임시트 승인**을 채운다는 전제다 [C-12]. 이게 없으면 타겟 세그먼트 안에서도 Tempo Timesheets를 옆에 붙이게 되고 "한 앱" 메시지가 무너진다.

---

## 11. 기능별 대체 관계 — 우리 기능 ↔ 경쟁사 기능

> **대체 가능**: 갈아타도 같은 일을 할 수 있다 · **부분 대체**: 핵심은 같지만 한쪽에만 있는 것이 있다 · **우리만**: 대응 기능이 없다 · **Jira 기본**: 앱 없이 Jira로 대체된다

### 11.1 Moves RMS 기능 → 가장 비슷한 경쟁 기능

| Moves RMS 기능 | 가장 비슷한 경쟁 기능 | 관계 | 차이 | 근거 |
|---|---|---|---|---|
| **내 워크로그** 입력·조회 | Tempo Timesheets · ActivityTimeline 타임시트 · Clockwork 자동 타이머 | 부분 대체 | 경쟁사는 승인·자동 타이머·연동 | [18][52][84] |
| **워크로그 CSV 추출** | Tempo·ActivityTimeline 리포트 export | 대체 가능 | — | [18][52] |
| **프로젝트 인력 관리** | Tempo Teams+Roles · BigPicture Resources · ActivityTimeline Teams | 대체 가능 | **투입 급여** 컬럼은 우리만 | [27][43][57][C-6] |
| **급여 관리** (연봉+투입급여+정책) | Tempo FM cost rate · BigPicture rates · ActivityTimeline 시급+월 정액 · TeamBoard 4계층 | 부분 대체 | 경쟁사=시급, 우리=급여. 밴드/인원별 정책은 우리만. **청구 rate**는 우리에 없음 | [22][46][59][73][C-6][C-13] |
| **작업 배정** (프로젝트 내↔전사 후보) | Tempo 팀 계획 · BigPicture "Find the perfect match" · ActivityTimeline 타임라인 · TeamBoard 보드 | 부분 대체 | 경쟁사는 드래그 타임라인·스킬 자동 추천 | [27][43][56][70] |
| **자원관리 인력현황·가동률** | Tempo Capacity Report · ActivityTimeline Utilization · BigPicture 워크로드 · Planyway | 대체 가능 | 우리는 근무일·MD 분모 [C-3], 경쟁사는 시간·FTE | [26][43][58][87] |
| **프로젝트 배정 관계도** (N:M 그래프) | 직접 대응 없음 | 우리만 | 시각화 차별 | — |
| **팀 분석** | Tempo Team utilization · ActivityTimeline Team Utilization | 대체 가능 | — | [26][58] |
| **작업관리 목록·트리·간트** (SVAR) | Structure+Gantt Charts · BigPicture Gantt/WBS · TeamBoard ProScheduler · Planyway | 부분 대체 | 경쟁사만: 베이스라인·크리티컬 패스·리소스 레벨링·what-if | [32][33][40][70][C-14] |
| **진척도** (공수/완성/일정 3층) | BigPicture 진척 · Structure 롤업 · SaaSJet EVM | 부분 대체 | 우리 3층 산식 독자적 | [40][32][82] |
| **비용 분석** (급여 원가 + EVM 근사) | Tempo FM · BigPicture Financials · ActivityTimeline Finances · SaaSJet · Clockwork | 부분 대체 | 원가·EVM 지표는 동등. 경쟁사만: 사용자 예산 대비·워크로그 기반 AC·직접비·청구 | [22][46][59][81][85][C-7][C-8][C-9] |
| **프로젝트 캘린더** | ActivityTimeline·Planyway 캘린더 · Tempo 캘린더 연동 | 대체 가능 | — | [52][86][18] |
| **개인 스케줄** (연차·반차·출장 → MD 차감) | Tempo 휴일+휴가 · ActivityTimeline Vacation · BigPicture absence · TeamBoard 휴가 | 부분 대체 | 차감 동등 [C-3]. 경쟁사만: 요청→승인→잔여일 | [28][62][43][72] |
| **공휴일 관리** | Tempo·ActivityTimeline Holiday Scheme · BigPicture Holiday Plan | 부분 대체 | 우리 단일 테이블 [C-16], 경쟁사 국가별 | [28][62][43] |
| **프로젝트 대시보드** | BigPicture Overview · Tempo 가젯 · ActivityTimeline 대시보드 | 대체 가능 | — | [40][18][52] |
| **전사 포트폴리오 대시보드** | BigPicture Portfolio Box · Structure 롤업 | 부분 대체 | T/S/R 신호등·가동률 글로벌 지표는 우리 산식 | [40][32] |
| **분석 리포트** (MM 분석) | Tempo 리포트 · ActivityTimeline Planned vs Actual | 부분 대체 | **MM 단위 리포트**는 우리만 | [25][58] |
| **프로젝트 구독** (스페이스→이슈 자동 편입) | Structure 자동화 · BigPicture 스코프 동기화 | 대체 가능 | 방식 차이 | [32][40] |
| **프로젝트 칸반** | Jira 보드 | Jira 기본 | — | — |
| **백오피스** (사용자·팀·스킬·역할·등급) | Tempo Teams/Roles/Skills · ActivityTimeline Functional Teams · BigPicture Resource Admin | 대체 가능 | — | [27][57][47] |
| **권한 관리** (14키·스코프·**급여 가시성**) | Tempo 권한 스킴 · BigPicture 보안 역할 · ActivityTimeline 7단 | 부분 대체 | 급여 가시성 정책+CostAccess는 우리만 | [23][47][61][C-10] |
| **팀 관리형 자동 대응** | 경쟁사 수동 설정 가이드 | 우리만 | — | [29][49][63][C-2] |
| **저장공간 모니터링** | 대응 없음 | 우리만 (Forge 특유) | 경쟁사는 벤더 인프라라 불필요 | — |

### 11.2 경쟁사에 있고 우리로 대체되지 않는 것

| 경쟁 기능 | 보유 제품 | 우리 상태 | 비고 |
|---|---|---|---|
| 타임시트 승인 | Tempo [18] · TeamBoard [72] · Be On Time [77] | 없음 [C-12] | §8.1 1순위 |
| 사용자 예산 대비 · 워크로그 기반 AC · 직접비 | BigPicture [46] · ActivityTimeline [60] · SaaSJet [81] | EVM 근사만 [C-7][C-8] | §8.1 |
| 청구 rate · 인보이스 | TeamBoard [73] · SaaSJet [81] · Clockwork [85] · Float [90] · Kantata [97] | 없음 [C-13] | §8.1 |
| 휴가 요청→승인→잔여일 | ActivityTimeline [62] · TeamBoard [72] | 차감만 [C-3] | §8.1 |
| 스킬 기반 자동 매칭 | BigPicture [43] · ActivityTimeline [57] | 스킬 데이터만 | RMS 확장 시 |
| 베이스라인·크리티컬 패스·리소스 레벨링 | Structure Gantt [33] · BigPicture [40] · TeamBoard [70] | 없음 | 일부러 안 함 |
| what-if·SAFe·리스크 | BigPicture [40] · Jira Plans [8] | 없음 | 일부러 안 함 |
| 다통화·국가별 휴일 스킴 | BigPicture [46] · Tempo [28] · ActivityTimeline [62] | 없음 [C-16] | 글로벌 시 |
| 자동 타이머·Slack/캘린더/IDE 연동 | Tempo [18] · Clockwork [84] | 없음 | 편의 |
| AI/Rovo 에이전트 | Tempo [18] | 없음 | 후순위 |

### 11.3 요약

- **갈아타도 되는 것**: 워크로그·인력 명부·가동률·캘린더·대시보드·백오피스 — 지지만 않으면 된다.
- **갈아타면 잃는 것**: 급여 환산 원가·급여 가시성·MM 리포트·팀 관리형 자동 — 영업 메시지.
- **갈아타야 얻는 것**: 승인·예산 정밀화·청구 — §8 보강 순서.

---

## 12. 확장 전략 — RMS · PMS · 글로벌

### 12.1 "PMS"와 "RMS"는 한 덩어리가 아니다

| 층 | 대표 제품 | 판단 | 이유 | 근거 |
|---|---|---|---|---|
| **RMS — Jira 안 리소스 관리** | ActivityTimeline · Tempo Capacity Planner · TeamBoard | **이길 수 있음** | ActivityTimeline은 Connect·동기화 지연·설치 3.8천 [52][55][65]. Tempo는 Forge Remote 강제 전환·롤백 불가 [30]·2025년 10~25% 인상 [31]·전 유저 과금 [16]·평점 3.7 [14] → **이탈 창구가 열려 있다** | [14][16][30][31][52][55][65] |
| **PMS — 글로벌 범용 PPM** | BigPicture · Structure | **하지 않음** | Jira Premium Plans가 크로스 프로젝트 [5]·의존성 [6]·팀 용량 [7]·**"what if" 시나리오** [8]를 기본 제공. Tempo조차 "Structure vs Jira Plans vs BigPicture" 방어 글을 쓴다 [36]. 플랫폼 기본 기능과 겹치는 앱은 신규 진입자의 자리가 아니다 | [5][6][7][8][36] |
| **PMS — 국내 독립형 PMS 대체** | E3PS · WATCH2 · 유시스 | **대체할 수 있음** | Jira 연동 0곳·구축형·이중 입력 [99]~[104]. 부족한 건 공공 SI 산출물 쪽 — WATCH2가 파는 산출물 다단계 승인·주/월간보고 자동 출력 [101]. Confluence 승인 앱(`moves-approval`)과 결합. 단 DC EOL(2029-03-28 [9]) 전까지 공공은 Cloud 전환 조직만 | [9][99]~[104] |

### 12.2 순서

| 단계 | 시장 | 채워야 할 것 |
|---|---|---|
| 1 | SI·공공 니치 (급여 원가 + MM 정산) | 타임시트 승인 · 정산 엑셀 · RoA 배지 · 레퍼런스 1곳 · 가격 |
| 2 | RMS 전체 — ActivityTimeline 추월 · Tempo 대체 | 휴가 승인 · 스킬 기반 배정 · 용량 예측 · Tempo 임포터 |
| 3 | 국내 PMS 대체 | 산출물 승인 · 보고서 출력 · 요구사항 추적 (Confluence 앱 결합) |
| ✗ | 글로벌 범용 PPM | Atlassian Plans와 싸우는 자리 [5]~[8] |

**동시에 하면 전부 못 한다.** BigPicture가 받는 리뷰("설정 복잡·학습곡선") [50][51]를 1단계 정체성 없이 2·3을 벌리면 우리가 받는다.

### 12.3 글로벌 — "BigPicture처럼"이 아니라 "MM 정산을 쓰는 나라들로"

MM(man-month) 정산은 한국만의 관행이 아니다. 서구 앱이 시급인 것은 미국 소프트웨어 팀 관행이지 글로벌 IT 서비스 관행이 아니다.

| 시장 | 단위 | 1차 근거 | 근거 |
|---|---|---|---|
| **한국** | 투입공수(M/M) | KOSA 대가산정 가이드: 투입공수 방식 = "(투입인력수×투입기간×기술자직무별단가)+제경비+기술료+직접경비" | [106][107] |
| **일본** | 人月 · 人日 | 日経xTECH: 「人月という工数に単価を掛けてカネをもらっている以上…」「70万円、80万円といった単価で」. IPA: 「1人月＝160人時 … 8時間/日＊20日/月」 | [108][109] |
| **독일·DACH** | Tagessatz(일 단가) / PT | BDU 2025: 「Der durchschnittlich fakturierte Tagessatz beträgt 1.300 Euro」「IT-Beratung (-3%)」. Computerwoche: SAP 컨설턴트 「800 Euro pro Tag」~「1.050 und 1.200 Euro」 | [110][111] |
| **인도 오프쇼어·글로벌 SI** | billed person-month | Infosys 20-F(SEC 공시): 「employee utilization as the proportion of total billed person months to total available person months」 | [112] |
| **영국** | day rate | G-Cloud SFIA Rate Card: 「Cost per day in GBP excl VAT」「Consultant's Working Day – 8 hours」 | [113] |

Tempo·BigPicture·ActivityTimeline 모두 이 층을 비워 두고 있다 [22][46][59]. 한국에서 만든 제품이 이 층에 맞는다.

**글로벌로 가려면 채워야 하는 것**

| 항목 | 현재 | 필요 | 근거 |
|---|---|---|---|
| 단가 모델 | 연봉/월급 2종 [C-6] | 시급·일급·월급·연봉 혼합 + 다통화 + 유효기간 이력 | [59][73] 수준 |
| 휴일·근무일 | 단일 공휴일 테이블 [C-16] | 국가/지역별 스킴 | [28][62] 수준 |
| i18n | ko · en [C-11] | **ja → de** 순 | — |
| 급여 민감성 | — | GDPR Art.5: "limited to what is necessary" [114]. ICO: 급여는 고용 기록의 개인정보, "limiting access only to those who need to see it" [115]. 한국: 접근 권한을 "업무 수행에 필요한 최소한의 범위로 차등 부여" [116]. → **가시성 정책 이원화 [C-10] + 데이터 무유출 [1]**이 정확히 그 요구에 답한다. 경쟁사는 시급이라 이 답을 만들 필요가 없었다 | [114][115][116][117] |
| 영어 지원·문서·리뷰 | — | 마켓플레이스 리뷰는 영어로 쌓여야 한다 | — |
| 경쟁자 주시 | — | Be On Time(아르메니아 [78][79])이 순수 Forge·RoA 포지션을 먼저 잡고 있다 | [77][78][79] |

**순서: 한국 → 일본 → DACH.** 일본은 人月 문화 [108][109]·SI 구조가 한국과 겹쳐 제품 변경이 거의 i18n뿐이다. DACH는 단가 모델 일반화·GDPR 대응 [114][115]이 선행돼야 한다.

---

## 13. 시장 데이터

| 항목 | 수치 | 근거 |
|---|---|---|
| Atlassian Marketplace 규모 | 8,000 앱 · 1,800 파트너 · 2021년 이후 약 19% CAGR · 2024 추정 매출 $1.8B | [13] |
| Marketplace 누적 판매 | $6B+ · 300,000+ 고객 | [12] |
| 수익 배분 (2026) | Forge: 누적 $1M까지 0%, 15→16%(**2026-04-01**), 16→17%(**2026-10-01**). Connect: 15→20%(04-01), 20→25%(10-01). ※ 원 공지 1/1·7/1에서 연기 | [10][11] |
| 리소스관리 SW 시장 | USD 6.2B(2025) → 12.8B(2035), CAGR 7.52% (기관별 편차 큼) | [118] |
| PM SW 시장 (아태) | $1,669M(2023) → $5,891M(2030), CAGR 19.7% | [119] |
| Jira Data Center EOL | "On March 30, 2026 … new customers will no longer be able to purchase" · 기존 고객 2028-03-30까지 · "End of life … March 28, 2029" | [9] |
| Jira Cloud 국내 | 2025-10 Standard 약 5%·Premium 약 7.5% 인상, 한국 리전 없음 [121]. 오픈소스컨설팅 500여 고객사 [120]. **국내 Jira Cloud 고객 수 공식 수치 미확인** | [120][121] |

---

## 14. 조사 한계

- 마켓플레이스 설치 수·평점은 2026-08-31 스냅샷. REST 응답과 페이지 표기가 소폭 다를 수 있다.
- 가격은 마켓플레이스 REST 연간 티어 ÷10 환산값. Tempo Financial Manager·ActivityTimeline Advanced 단가는 미확인.
- 원가 가시성 권한 세부는 벤더 문서 공개 범위까지. 실제 동작은 체험판으로 검증해야 한다.
- 국내 PMS는 벤더 페이지 문구 기준. 제안서·데모에서 공수 기능이 더 있을 수 있다.
- Runs on Atlassian 적격 여부는 manifest 선언 기준 판단이며 Atlassian 심사 결과가 아니다.
- 독일 업계지 원문은 "Personentag"보다 "Tagessatz/pro Tag" 표현이 주류라 Tagessatz로 표기했다. NASSCOM 원문은 접근 불가(HTTP 406)라 Infosys SEC 공시로 대체했다. 북유럽 day rate는 근거 미확보로 삭제했다.
- ActivityTimeline 월 정액의 "salaried" 표현은 공식 도움말이 아닌 벤더 블로그 문구다. 도움말은 "fixed monthly amount · pro-rated · not worklog-based"까지 [59].
- ICO 원문은 "role-based"가 아니라 "need to know" 표현이다 [115]. 한국 고시 해설은 "역할에 따라 … 차등 부여"로 role 개념을 명시한다 [116].

---

## 15. 참고 — Atlassian 공식 문서 (요약)

[1] Runs on Atlassian · [2] manifest permissions · [3] 분석 도구 정책 · [4] 데이터 레지던시 · [5]~[8] Jira Plans · [9] DC EOL · [10][11] 수익 배분 — 전문은 §16.

---

## 16. 근거 목록 (외부 출처)

| # | 출처 | 유형 | 확인 | 핵심 인용 / 비고 | URL |
|---|---|---|---|---|---|
| 1 | Atlassian — Runs on Atlassian | 공식 개발자 문서 | 09-01 | "Apps exclusively use Atlassian-hosted compute and storage" / "If your app sends data for analytics and does not send in-scope End-User Data, then it is eligible" | https://developer.atlassian.com/platform/forge/runs-on-atlassian/ |
| 2 | Atlassian — Forge manifest permissions | 공식 개발자 문서 | 09-01 | "If `inScopeEUD` is set to `true`, then the app is ineligible for Runs on Atlassian." | https://developer.atlassian.com/platform/forge/manifest-reference/permissions/ |
| 3 | Atlassian — Analytics tool policy for Forge apps | 공식 개발자 문서 | 08-31 | analytics 카테고리 egress 정책 | https://developer.atlassian.com/platform/forge/analytics-tool-policy/ |
| 4 | Atlassian — Forge data residency | 공식 개발자 문서 | 09-01 | "data residency support for apps that use persistent Forge hosted storage" | https://developer.atlassian.com/platform/forge/data-residency/ |
| 5 | Atlassian — What are plans in Jira Premium? | 공식 지원 문서 | 09-01 | "Plans, which are included with Jira Premium, let you combine work items … spans multiple teams or your entire organization." | https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/ |
| 6 | Atlassian — Dependencies in plans | 공식 지원 문서 | 09-01 | "only available as part of Jira Cloud Premium and Enterprise" | https://support.atlassian.com/jira-software-cloud/docs/what-are-dependencies-in-advanced-roadmaps/ |
| 7 | Atlassian — Capacity and velocity in plans | 공식 지원 문서 | 09-01 | "the number of story points or hours your team can complete in one iteration" | https://support.atlassian.com/jira-software-cloud/docs/what-are-capacity-and-velocity-in-advanced-roadmaps/ |
| 8 | Atlassian — Scenarios in plans | 공식 지원 문서 | 09-01 | "The Scenarios tool helps you to plan for … different 'what if' versions of your plan." | https://support.atlassian.com/jira-software-cloud/docs/what-are-scenarios-in-advanced-roadmaps/ |
| 9 | Atlassian — Data Center end of life | 공식 라이선스 페이지 | 09-01 | "On March 30, 2026 … new customers will no longer be able to purchase" / "until March 30, 2028" / "End of life … March 28, 2029" | https://www.atlassian.com/licensing/data-center-end-of-life |
| 10 | Atlassian — Marketplace revenue share 2026 | 공식 블로그 | 09-01 | "0% revenue share for eligible Forge earnings, up to $1 million" / Forge 15→16→17%, Connect 15→20→25% | https://www.atlassian.com/blog/development/updates-to-marketplace-revenue-share-2026 |
| 11 | Atlassian Developer Community — Extended timelines | 공식 커뮤니티 공지 | 09-01 | "15% → 16%: April 1, 2026 (was Jan 1)" / "16% → 17%: October 1, 2026 (was July 1)" / Connect 동일 연기 | https://community.developer.atlassian.com/t/extended-timelines-for-marketplace-revenue-share-changes/96668 |
| 12 | Atlassian — Marketplace (developer) | 공식 | 08-31 | "$6B+" 누적 판매, "300,000+" 고객 (검색 요약 기준) | https://developer.atlassian.com/platform/marketplace/ |
| 13 | Aventis Advisors — Atlassian Marketplace M&A | 자문사 리포트 | 08-31 | 8,000 apps · 1,800 partners · ~19% CAGR · 2024 est. $1.8B | https://aventis-advisors.com/atlassian-marketplace-ma/ |
| 14 | Tempo Capacity Planner — Marketplace | 마켓 리스팅 | 08-31 | 설치 9,721 · 3.7 · 리뷰 200 | https://marketplace.atlassian.com/apps/1211881 |
| 15 | Tempo — Capacity Planner pricing | 벤더 가격 페이지 | 08-31 | 11–100 $3.99 등 티어 | https://www.tempo.io/pricing/capacity-planner |
| 16 | Tempo — Timesheets pricing (license size) | 벤더 가격 페이지 | 09-01 | "Your Tempo license size must match your Jira license size. A user is anyone who can log into Jira." | https://www.tempo.io/pricing/jira-time-tracking |
| 17 | Tempo KB — subset of Jira users | 벤더 KB | 09-01 | "not possible to limit access to a subset of users" | https://help.tempo.io/kb/latest/can-i-purchase-tempo-for-a-subset-of-my-jira-users |
| 18 | Tempo Timesheets — Marketplace | 마켓 리스팅 | 08-31 | 설치 27,122 · 4.1 · 896 · 언어 EN/FR/ES/DE/PT/RU · AI 자동 추적·승인·Slack/IDE·Rovo | https://marketplace.atlassian.com/apps/6572 |
| 19 | Tempo — pricing (Timesheets) | 벤더 가격 페이지 | 08-31 | 11–100 $5.21 | https://www.tempo.io/pricing |
| 20 | Tempo Financial Manager — Marketplace | 마켓 리스팅 | 08-31 | 설치 3,199 · 3.8 · 46 · Cloud 전용 | https://marketplace.atlassian.com/apps/1221748 |
| 21 | Tempo Budgets — Marketplace (DC) | 마켓 리스팅 | 08-31 | 설치 697 · 4.7 · DC 전용 · EVM·임금 | https://marketplace.atlassian.com/apps/1211259 |
| 22 | Tempo FM — cost rates and billing rates | 벤더 도움말 | 08-31 | 시간당 cost/billing rate, 역할별/개인별, 날짜별 변동 | https://help.tempo.io/financialmanager/latest/setting-project-cost-rates-and-billing-rates |
| 23 | Tempo FM — permissions and roles | 벤더 도움말 | 08-31 | 글로벌 3단 + 프로젝트 3단, Viewer 단가 열람 불가 | https://help.tempo.io/financialmanager/latest/permissions-and-roles-for-tempo-projects |
| 24 | Tempo — Budgets DC vs Cost Tracker Cloud | 벤더 도움말 | 08-31 | Cloud에 EVM·편차 리포트 없음, Timesheets 필수 | https://help.tempo.io/cloudmigration/latest/tempo-budgets-server-data-center-vs-cost-tracker-c |
| 25 | Tempo Planner — Planned vs Actual | 벤더 도움말 | 08-31 | Timesheets 동시 설치 필수 | https://help.tempo.io/planner/latest/planned-vs-actual-reports |
| 26 | Tempo Planner — Utilization rate | 벤더 도움말 | 08-31 | 계산 옵션 2종 | https://help.tempo.io/planner/latest/setting-the-utilization-rate-calculation |
| 27 | Tempo Planner — Workload schemes | 벤더 도움말 | 08-31 | 주/일 근무시간, FTE | https://help.tempo.io/planner/latest/creating-workload-schemes |
| 28 | Tempo Planner — Holiday schemes | 벤더 도움말 | 08-31 | 국가/지역별 휴일 스킴 | https://help.tempo.io/planner/latest/creating-holiday-schemes |
| 29 | Tempo — app fields in team-managed projects | 벤더 도움말 | 08-31 | 팀 관리형 스페이스에 필드 수동 추가 | https://help.tempo.io/timesheets/latest/managing-tempo-app-fields-in-jira-team-managed-pro |
| 30 | Tempo — Tempo moves to Forge | 벤더 제품 공지 | 09-01 | "Forge Remote is a hybrid approach … backend services remain on the vendor's own infrastructure" / "cannot be undone" | https://www.tempo.io/product-news/tempo-moves-to-forge |
| 31 | Tempo — price changes 2025-09-15 | 벤더 블로그 | 08-31 | Cloud 10~25% 인상 | https://www.tempo.io/blog/upcoming-tempo-price-changes-effective-september-15-2025 |
| 32 | Structure — Marketplace | 마켓 리스팅 | 08-31 | 설치 13,081 · 4.6 · 408 | https://marketplace.atlassian.com/apps/34717 |
| 33 | Gantt Charts for Structure — Marketplace | 마켓 리스팅 | 08-31 | 설치 6,493 · 4.2 · Structure 라이선스 별도 | https://marketplace.atlassian.com/apps/1217809 |
| 34 | Tempo — Structure pricing | 벤더 가격 페이지 | 08-31 | Std $3.52 / Adv $4.73 | https://www.tempo.io/pricing/project-portfolio-management-software-ppm |
| 35 | Tempo — Gantt pricing | 벤더 가격 페이지 | 08-31 | $1.27 | https://www.tempo.io/pricing/jira-gantt-chart |
| 36 | Tempo — Structure vs Jira Plans vs BigPicture | 벤더 블로그 | 08-31 | Jira Plans 대비 방어 비교 | https://www.tempo.io/blog/structure-vs-jira-plans-vs-bigpicture |
| 37 | Tempo Capacity Planner — 리뷰 탭 | 마켓 리뷰 | 08-31 | "설치 후 아무것도 안 보임"(2025-06) | https://marketplace.atlassian.com/apps/1211881?tab=reviews&hosting=cloud |
| 38 | Tempo Timesheets — 리뷰 탭 | 마켓 리뷰 | 08-31 | asApp 워크로그·JQL 깨짐·락인(2026-06-10) | https://marketplace.atlassian.com/apps/6572?tab=reviews&hosting=cloud |
| 39 | Atlassian Community — Tempo FM alternatives | 커뮤니티 기사 | 08-31 | 3개 앱 필요 지적 | https://community.atlassian.com/forums/App-Central-articles/Tempo-Financial-Manager-and-5-Alternatives-to-Consider/ba-p/3277885 |
| 40 | BigPicture — Marketplace | 마켓 리스팅 | 08-31 | 설치 10,952 · 3.9 · 504 | https://marketplace.atlassian.com/apps/1212259/bigpicture-project-management-ppm |
| 41 | Appfire — BigPicture pricing updates | 벤더 가격 페이지 | 08-31 | Std/Adv 2에디션, 100유저 $5,210/$5,730 (스니펫) | https://appfire.com/pricing-updates/big-picture-jira |
| 42 | Marketplace REST — BigPicture pricing | 마켓 REST | 08-31 | 100유저 월 $5.73/user, 갱신 50% | https://marketplace.atlassian.com/rest/2/addons/eu.softwareplant.bigpicture/pricing/cloud/live |
| 43 | Appfire — Resources module | 벤더 문서 | 08-31 | 용량 = 워크로드 − 휴일 − 부재, "Find the perfect match" | https://appfire.atlassian.net/wiki/spaces/DLP/pages/298224554 |
| 44 | Appfire — Individual capacity | 벤더 문서 | 08-31 | 개인 용량 산식 | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297636981 |
| 45 | Appfire — Effort modes | 벤더 문서 | 09-01 | "The effort mode can be expressed in the following units: Hours / Man-days / Percent / Story points" | https://appfire.atlassian.net/wiki/spaces/DLP/pages/2211743971/Effort+modes |
| 46 | Appfire — Financials / roles (SPM) | 벤더 문서 | 08-31 | 시간당 단가, Box USD·팀 다통화, Financial Viewer/Admin | https://appfire.atlassian.net/wiki/spaces/SPM/pages/1918404223 |
| 47 | Appfire — Security roles | 벤더 문서 | 08-31 | Box별 보안 역할, Resource Admin | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297994764 |
| 48 | Appfire — Data storage regions | 벤더 문서 | 08-31 | AWS 6개 리전, 리전 선택 Enterprise만 | https://appfire.atlassian.net/wiki/spaces/DLP/pages/297603214 |
| 49 | BigPicture — Team-managed projects setup | 벤더 문서 | 08-31 | 필드 수동 추가·동기화 설정 | https://wiki.bigpicture.one/display/DOCUMENTATION/Setting+up+BigGantt+and+BigPicture+to+support+Team-managed+projects |
| 50 | SoftwareAdvice — BigPicture | 리뷰 사이트 | 08-31 | 무료 구간 초과 시 전체 과금 불만 | https://www.softwareadvice.com/project-management/bigpicture-profile/ |
| 51 | Research.com — BigPicture | 리뷰 사이트 | 08-31 | 학습곡선·성능 | https://research.com/software/reviews/bigpicture |
| 52 | ActivityTimeline — Marketplace | 마켓 리스팅 | 08-31 | 설치 3,759 · 4.7 · 121 · ISO/SOC2 | https://marketplace.atlassian.com/apps/1220860/activity-timeline-resource-planning-time-tracking |
| 53 | ActivityTimeline — pricing | 벤더 가격 페이지 | 08-31 | 10유저 $10 정액 | https://activitytimeline.com/pricing |
| 54 | Marketplace REST — ActivityTimeline pricing | 마켓 REST | 08-31 | 11~100 $2.50 등 | https://marketplace.atlassian.com/rest/2/addons/com.reliex.activitytimeline.cloud.atlassian.connect/pricing/cloud/live |
| 55 | Marketplace REST — ActivityTimeline versions | 마켓 REST | 08-31 | 앱 키 `…atlassian.connect`, 스코프 `*:connect-jira`, 2.3.0 Advanced | https://marketplace.atlassian.com/rest/2/addons/com.reliex.activitytimeline.cloud.atlassian.connect/versions/latest?hosting=cloud |
| 56 | ActivityTimeline — Workload schemes | 벤더 도움말 | 08-31 | 요일별 근무시간 | https://help.activitytimeline.com/at/workload-schemes |
| 57 | ActivityTimeline — Capacity concepts / Teams | 벤더 도움말 | 08-31 | involvement, Classic/Functional 팀 | https://help.activitytimeline.com/at/basic-concepts-workload-capacity-involvement |
| 58 | ActivityTimeline — Planned vs Actual | 벤더 도움말 | 08-31 | ON TRACK/OVER/UNDER | https://help.activitytimeline.com/at/planned-vs-actual-report |
| 59 | ActivityTimeline — Labor rates hierarchy | 벤더 도움말 | 09-01 | "When selecting Monthly, the system treats the value as a fixed monthly amount … pro-rated … Monthly rates are time-based, not worklog-based" | https://help.activitytimeline.com/at/labor-rates-rate-hierarchy |
| 60 | Atlassian Community — AT Finances module | 벤더 기고 | 08-31 | 예산 스코프, 리포트 3단 | https://community.atlassian.com/forums/App-Central-articles/Jira-Cost-Management-with-ActivityTimeline-Finances-Module/ba-p/3249427 |
| 61 | ActivityTimeline — User roles | 벤더 도움말 | 08-31 | 7단 역할, Finances 항목 없음 | https://help.activitytimeline.com/at/user-roles-and-permissions |
| 62 | ActivityTimeline — Vacation management | 벤더 도움말 | 08-31 | 요청→승인→잔여일, Holiday Scheme | https://help.activitytimeline.com/at/vacation-management |
| 63 | ActivityTimeline — Team-managed setup | 벤더 도움말 | 08-31 | 필드 수동 설정 | https://help.activitytimeline.com/at/how-to-setup-start-end-dates-for-jira-team-managed |
| 64 | ActivityTimeline — Configuration settings | 벤더 도움말 | 08-31 | UI 언어 8종(KO 포함) — 스니펫 기준 | https://help.activitytimeline.com/at/configuration-settings |
| 65 | G2 — ActivityTimeline | 리뷰 사이트 | 08-31 | 동기화 지연 | https://www.g2.com/products/activitytimeline/reviews |
| 66 | Capterra — ActivityTimeline | 리뷰 사이트 | 08-31 | UI 혼란 | https://www.capterra.com/p/266080/ActivityTimeline/ |
| 67 | ActivityTimeline — Tempo Planner alternatives | 벤더 블로그 | 08-31 | "Tempo 대체" 마케팅 사례 | https://activitytimeline.com/blog/tempo-planner-alternatives |
| 68 | TeamBoard ProScheduler — Marketplace | 마켓 리스팅 | 08-31 | 설치 3,195 · 4.3 · 175 · $1.75 · connect:false | https://marketplace.atlassian.com/apps/1223423 |
| 69 | TeamBoard TimePlanner — Marketplace | 마켓 리스팅 | 08-31 | 설치 1,332 · 4.8 · 116 · Cloud Fortified · $1.75 | https://marketplace.atlassian.com/apps/1224927 |
| 70 | TeamBoard — ProScheduler features | 벤더 페이지 | 08-31 | 간트·베이스라인·크리티컬 패스·휴가 | https://teamboard.cloud/proscheduler/ |
| 71 | TeamBoard — ProScheduler docs | 벤더 문서 | 08-31 | 비용은 TimePlanner 분리 | https://docs.devsamurai.com/teamboard-proscheduler |
| 72 | TeamBoard — TimePlanner features | 벤더 페이지 | 08-31 | 휴가 승인·타임시트 승인·인보이스 | https://teamboard.cloud/timeplanner-features/ |
| 73 | Atlassian Community — TimePlanner cost tracking | 벤더 기고 | 08-31 | 4계층 rate, "can't overlap … future dates" | https://community.atlassian.com/forums/App-Central-articles/How-To-Use-TeamBoard-TimePlanner-for-Accurate-Cost-Tracking/ba-p/2848745 |
| 74 | TeamBoard — Actual vs Estimated Costs | 벤더 페이지 | 08-31 | "Billing/Cost Admin … Billing/Cost Viewer" | https://teamboard.cloud/actual-vs-estimated-costs/ |
| 75 | TeamBoard — ProScheduler pricing (site) | 벤더 가격 페이지 | 08-31 | $1.25 표기 — REST와 불일치 | https://teamboard.cloud/proscheduler-pricing/ |
| 76 | TeamBoard — TimePlanner pricing (site) | 벤더 가격 페이지 | 08-31 | $1.50 표기 — REST와 불일치 | https://teamboard.cloud/pricing-timeplanner/ |
| 77 | Resource Management for Jira — Marketplace | 마켓 리스팅 | 08-31 | 설치 12 · 5.0 · RoA 배지 · v4.27.0 · $2.50 | https://marketplace.atlassian.com/apps/2338306760/resource-management-for-jira |
| 78 | Be On Time — Marketplace vendor | 마켓 벤더 페이지 | 09-01 | "179 Vardan Ajemyan str, YEREVAN - 0005, ARMENIA" | https://marketplace.atlassian.com/vendors/968174022/be-on-time |
| 79 | Be On Time — About | 벤더 페이지 | 09-01 | "Konstantin Kireev trading as Be On Time" / Repka Solutions LLC | https://be-on-ti.me/about |
| 80 | Time & Cost Tracker — Marketplace | 마켓 리스팅 | 08-31 | 설치 530 · 4.6 · $1.50 | https://marketplace.atlassian.com/apps/1229405 |
| 81 | SaaSJet — Cost Tracker product | 벤더 페이지 | 08-31 | "worklogs × Salary rates + Direct expenses" | https://saasjet.com/cost-tracker-for-jira-cloud/ |
| 82 | SaaSJet — Cost reports | 벤더 문서 | 08-31 | EVM·OPEX/CAPEX | https://saasjet.atlassian.net/wiki/spaces/TCTFJ/pages/2396684299/Cost+reports |
| 83 | SaaSJet — Permissions | 벤더 문서 | 08-31 | Jira 그룹 단위 분리 | https://saasjet.atlassian.net/wiki/spaces/TCTFJ/pages/2372468737 |
| 84 | Clockwork Pro — Marketplace | 마켓 리스팅 | 08-31 | 설치 4,631 · 4.6 · $1.30 | https://marketplace.atlassian.com/apps/1219213 |
| 85 | HeroCoders — Cost & rate tracking | 벤더 문서 | 08-31 | "we do not support defining costs and rates for a certain period of time" / Budgeting Access 권한 | https://docs.herocoders.com/clockwork/cost-rate-tracking |
| 86 | Planyway — Marketplace | 마켓 리스팅 | 08-31 | 설치 1,468 · 4.6 · $3.00 | https://marketplace.atlassian.com/apps/1221297 |
| 87 | Planyway — Capacity planning | 벤더 페이지 | 08-31 | scheduled vs capacity | https://planyway.com/jira/jira-capacity-planning |
| 88 | Capacity Planner (RVS) — Marketplace | 마켓 리스팅 | 08-31 | 설치 496 · 4.4 · $0.50 · connect:true | https://marketplace.atlassian.com/apps/1231411 |
| 89 | RVS Softek — Capacity Planner | 벤더 페이지 | 08-31 | 기능 목록 | https://www.rvssoftek.com/capacity-planner |
| 90 | Float — pricing | 벤더 가격 페이지 | 08-31 | Starter $7 / Pro $12 | https://www.float.com/pricing |
| 91 | Float — Jira integration | 벤더 도움말 | 08-31 | "Projects, people, and tasks created in Float are not synced to Jira" | https://support.float.com/en/articles/3854834-jira |
| 92 | Float — Marketplace app | 마켓 리스팅 | 08-31 | 무료 · 설치 960 | https://marketplace.atlassian.com/apps/1222203/float-resource-management |
| 93 | Runn — pricing | 벤더 가격 페이지 | 08-31 | Lite $7 / Standard $11 | https://www.runn.io/pricing |
| 94 | Runn — Jira integration | 벤더 도움말 | 08-31 | 타임시트 "We don't support this at the moment" | https://help.runn.io/en/articles/9624395-jira-integration-overview |
| 95 | Resource Guru — pricing | 벤더 가격 페이지 | 08-31 | $5 / $8 / $12 | https://resourceguruapp.com/pricing |
| 96 | Resource Guru — Jira | 벤더 도움말 | 08-31 | 단방향 이슈 임포트 | https://help.resourceguruapp.com/en/articles/4983618 |
| 97 | Kantata — Jira integration | 벤더 도움말 | 08-31 | 양방향, "Jira Software Classic만" | https://knowledge.kantata.com/hc/en-us/articles/217177867-Jira-Integration-Overview |
| 98 | Milient — Kantata pricing | 제3자 추정 | 08-31 | $45~110, 50석 최소 | https://www.milientsoftware.com/blog/kantata-pricing |
| 99 | E3PS — PMS | 벤더 페이지 | 08-31 | "예상 원가 분석, 인력 투입 분석" | https://www.e3ps.com/productPMS |
| 100 | 유시스 — 스마트 PMS | 벤더 페이지 | 08-31 | "인력관리" | https://uxis.co.kr/03_Lab/Solution-PMS.php |
| 101 | WATCH2 Project | 벤더 페이지 | 08-31 | On-Premise, 산출물 다단계 승인, 보고서 DOCX | https://watch2.co.kr/watch2project/ |
| 102 | 이노베이스 — Smartbase PMS | 벤더 페이지 | 08-31 | "자원관리, 비용관리, 인력 배정, 원가 분석" | http://www.innobase.net/pms.php |
| 103 | 이노베이스 — SaaS 가격 | 벤더 가격 페이지 | 08-31 | 최소 10유저, 인프라 ₩15~25만/월 | http://www.innobase.net/saas_price.php |
| 104 | 마이링크 — Link PMS | 벤더 페이지 | 08-31 | "자원 관리, 현황/통계" | https://my-link.co.kr/Home/linkPMS |
| 105 | 솔브리드플러스 — PMS | 벤더 페이지 | 08-31 | 이미지 페이지, 미확인 | https://www.solbridplus.com/product_information/pms/ |
| 106 | KOSA — SW사업 대가산정 가이드 (2024 개정판) | 협회 공식 가이드 (PDF p.59, p.127) | 09-01 | "기능점수 방식을 원칙으로 한다. 다만 … 투입공수에 의한 방식을 적용할 수 있다" / "(투입인력수×투입기간×기술자직무별단가)+제경비+기술료+직접경비" | https://data.cmpi.or.kr/program/board/[2024.05.13]%20소프트웨어사업%20대가산정%20가이드.pdf |
| 107 | 바이라인네트워크 — KOSA 2025 개정판 | 언론 | 09-01 | "운영 및 유지관리비는 투입공수 방식으로 산정" | https://byline.network/2025/08/8112/ |
| 108 | 日経xTECH — 人月商売は「人売り」業？ (2017) | 업계지 | 09-01 | 「人月という工数に単価を掛けてカネをもらっている以上…」「70万円、80万円といった単価で」 | https://xtech.nikkei.com/it/atcl/column/14/463805/070500146/ |
| 109 | IPA — ソフトウェア開発データ白書 FAQ | 정부 산하 기관 | 09-01 | 「1人月＝160人時 … 8時間/日＊20日/月」 | https://www.ipa.go.jp/archive/publish/wp-sd/qa.html |
| 110 | BDU — Honorare im Consulting 2025 | 독일 컨설팅협회 | 09-01 | „Der durchschnittlich fakturierte Tagessatz beträgt 1.300 Euro" / „IT-Beratung (-3%)" | https://www.bdu.de/news/studie-honorare-im-consulting-2025-tagessaetze-leicht-ruecklaeufig/ |
| 111 | Computerwoche — SAP-Berater Tagessätze (2014) | 업계지 | 09-01 | „rund 800 Euro pro Tag" / „1.050 und 1.200 Euro" | https://www.computerwoche.de/article/2877593/kompetente-sap-berater-koennen-sie-mit-gold-aufwiegen-2.html |
| 112 | Infosys — Form 20-F FY2015 (SEC EDGAR) | 감사 공시 | 09-01 | "employee utilization as the proportion of total billed person months to total available person months" | https://www.sec.gov/Archives/edgar/data/0001067491/000106749115000029/form20f.htm |
| 113 | UK Digital Marketplace — G-Cloud 14 SFIA Rate Card | 정부 조달 문서 | 09-01 | "Cost per day in GBP excl VAT" / "Consultant's Working Day – 8 hours" | https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/709730/154063523660315-sfia-rate-card-2024-05-07-1123.pdf |
| 114 | GDPR — Article 5 | 법령 | 09-01 | "(c) adequate, relevant and limited to what is necessary" / "(f) … protection against unauthorised or unlawful processing" | https://gdpr-info.eu/art-5-gdpr/ |
| 115 | ICO — Collecting and keeping employment records | 영국 감독기관 가이드 | 09-01 | "records of their workers' names, addresses and salary information" / "limiting access only to those who need to see it" | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/employment-practices-and-data-protection-keeping-employment-records/collecting-and-keeping-employment-records |
| 116 | 개인정보의 안전성 확보조치 기준 (개인정보보호위원회 고시 제2023-6호) 제5조 | 법령(고시) | 09-01 | "접근 권한을 개인정보취급자에게만 업무 수행에 필요한 최소한의 범위로 차등 부여" | https://www.law.go.kr/admRulLsInfoP.do?chrClsCd=010202&admRulSeq=2100000229672 |
| 117 | 개인정보보호위원회 — 인사·노무 개인정보보호 원칙 (2023-01-31) | 정부 보도자료 | 09-01 | "급여 등 개인정보 처리 위탁 시 교육‧감독" / "연봉계약 … 필요한 최소한의 개인정보를 수집" | https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=8579 |
| 118 | Spherical Insights — Resource Management Software Market | 시장조사 | 08-31 | USD 6.2B(2025) → 12.8B(2035), 7.52% | https://www.sphericalinsights.com/blogs/top-25-companies-in-global-resource-management-software-market-2026-2035-expert-view-by-spherical-insights |
| 119 | Grand View Research — PM Software APAC | 시장조사 | 08-31 | $1,669M(2023) → $5,891M(2030), 19.7% | https://www.grandviewresearch.com/horizon/outlook/project-management-software-market/asia-pacific |
| 120 | 오픈소스컨설팅 — Atlassian | 국내 파트너 | 08-31 | "500여 개 이상 고객사" | https://osci.kr/atlassian |
| 121 | itgit — Jira 가격 | 국내 파트너 블로그 | 08-31 | 2025-10 인상, 한국 리전 없음 | https://itgit.co.kr/jira-price/ |
| 122 | Seibert Group — DC end of life | 파트너 블로그 (보조) | 08-31 | [9] 보강 | https://us.seibert.group/blog/end-of-life-atlassian-data-center |
| 123 | 컴퓨터월드 — SW 대가 FP vs M/M | 언론 (보조) | 08-31 | [106] 보강 | https://www.comworld.co.kr/news/articleView.html?idxno=49024 |

---

## 17. 코드 근거 (Moves RMS)

| # | 파일 | 확인 내용 |
|---|---|---|
| C-1 | `manifest.yml` L376–387 | `permissions.external.fetch.client`: `*.ingest.sentry.io`, `*.ingest.us.sentry.io`, `*.sentry-cdn.com` — 전부 `category: analytics`, `inScopeEUD: false`. 그 외 외부 egress 없음 |
| C-2 | `manifest.yml` L65–79 | `jira:entityProperty` propertyKey `movesRms`, searchAlias `movesRmsCoworkers`·`movesRmsAssignedAt`·`movesRmsAssignedBy` — 팀 관리형 프로젝트 커스텀 필드 누락 우회 |
| C-3 | `src/resolver/resourceAnalysis/ResourceAnalysisService.js` L57–98 | `computeLeaveDeductionMap`: "work_ratio=0(연차) → 근무일 1일당 1 MD 차감 / 0.5(반차) → 0.5 MD / 1(출장·기타) → 차감 없음", 공휴일(`holidayMap`) 제외, 겹침 시 최소 ratio |
| C-4 | `static/ui/src/constants/scheduleTypeOptions.js` | 연차 `workRatio:0`, 오전/오후 반차 `0.5`, 출장·기타 `1` |
| C-5 | `src/rdb/schema/ddl/users.sql.js` L36–54 | `user_schedule.schedule_type VARCHAR(30)`, `UNIQUE (account_id, schedule_start_date, schedule_type)` |
| C-6 | `src/resolver/projectCost/EffectiveSalary.js` L6, L67, L77–98 | `effective(ANNUAL) = round((annualSalary / 12) × projectMonths)`; `salary_type` PROJECT/ANNUAL; 밴드 정책 시 `salaryType: null` |
| C-7 | `src/resolver/projectCost/CostCalculator.js` L24–61 | `computeBudget`: BAC=totalSalary, AC=BAC×scheduleRate, EV=BAC×completionRate. `computeEvm`: CPI/EAC/ETC/overBudget/overrunAmount. L63–75 월별 소진 안분 |
| C-8 | `src/resolver/projectCost/ProjectCostService.js` L123–166 | `scheduleRate = computeScheduleRate(elapsedWorkDays, totalWorkDays)`; `burnRate = scheduleRate // = AC/BAC` — **AC는 워크로그 실적이 아닌 일정 경과 안분** |
| C-9 | `src/rdb/schema/ddl/project.sql.js` L8; `src/resolver/project/ProjectService.js` L48, L167 | `project.total_budget DOUBLE` 존재하나 insert/update CRUD에서만 사용. `projectCost/` 어디서도 참조 없음 → **사용자 입력 예산이 원가 분석과 연결 안 됨** |
| C-10 | `src/permission/` | `CostAccess.js` L28 `canReadCost(principal)`, `SalaryVisibility.js`, `ProjectScope.js`, `TeamAnalyticsScope.js`, `TeamLeadFieldPolicy.js`, `ResourceCatalog.js`, `PermissionMap.js`(deny-by-default) |
| C-11 | `locales/kr/`, `locales/en/` → `locales/ko-KR.json`, `locales/en-US.json` | 한국어·영어 2개 언어 |
| C-12 | `grep -i "approv\|승인" src/` | 기능 코드 0건 — 주석 2건만 (`ResourceCatalog.js` L132 "리더 승인 확장", `ProjectSubscriptionQuery.js` L159 UX 설명). **타임시트·휴가 승인 워크플로 없음** |
| C-13 | `grep -i "billing\|invoice\|청구\|bill_rate" src/` | 0건 — **청구 단가·인보이스 없음** |
| C-14 | `package.json`, `static/ui/package.json` | `exceljs ^4.4.0`(엑셀 출력 가능), `@svar-ui/react-gantt ^2.7.1`(간트), `@sentry/react ^10.45.0` |
| C-15 | `static/ui/src/pages/projectDetail/cost/` | `CostEvmCard.jsx`, `CostBurnUp.jsx`, `CostPlanActualBar.jsx`, `CostByIssueChart.jsx`, `CostByRoleLevel.jsx`, `CostKpiHeader.jsx` — EVM·소진·계획 vs 실적 UI 존재 |
| C-16 | `static/ui/src/backoffice/page/publicHoliday/PublicHolidayPage.jsx` | 공휴일 관리 화면 — 단일 테이블(국가/지역 구분 없음) |
