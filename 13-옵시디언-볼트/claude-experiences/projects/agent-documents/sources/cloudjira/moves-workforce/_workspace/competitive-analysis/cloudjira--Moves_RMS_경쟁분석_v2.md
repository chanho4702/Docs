# Moves RMS 경쟁 분석

| 항목 | 내용 |
|---|---|
| 문서 버전 | v2 (딥 리서치 보강) |
| 기준일 | 2026-08-31 |
| 조사 범위 | Atlassian Marketplace 인력·원가 관리 앱 10종, 글로벌 독립형 리소스관리 SaaS 4종, 국내 독립형 PMS 6종, 시장 데이터 |
| 조사 방법 | 마켓플레이스 리스팅·REST 가격 API·벤더 공식 문서·리뷰 사이트 직접 확인 (핸즈온 미실시) |
| 확인 불가 항목 | 본문에 **미확인**으로 명시 |

> **읽는 법** — ✅ 지원 확인 · 🟡 부분 지원·조건부·확인 불가 · ❌ 미지원 · — 개념 자체가 해당 없음. 가격은 별도 표기 없으면 Cloud 11~100 유저 구간 **$/user/월** 기준이며 모든 마켓플레이스 앱은 10유저 이하 무료.

---

## 1. 요약

1. **직접 경쟁자가 없는 조합** — "MD/MM 공수 산정 + 급여(연봉/월급) 환산 원가 + 급여 가시성 정책 + 순수 Forge"를 한 앱에 담은 제품은 조사 범위(마켓플레이스 10종) 안에 없다. 경쟁 앱의 원가는 전부 **시급(hourly rate)** 기반이며, 급여 자체를 저장·환산하는 앱은 확인되지 않았다 (ActivityTimeline만 급여자용 월 정액 단가 지원).
2. **가장 가까운 경쟁자 3곳** — ① **ActivityTimeline**(올인원·한국어 UI·휴가 승인·월 정액 단가, $2.50), ② **TeamBoard TimePlanner**(단가 4계층·Cost Admin/Viewer 권한, $1.75), ③ **Resource Management for Jira by Be On Time**(순수 Forge·Runs on Atlassian 배지, 설치 12건 신규). 세 곳 모두 MD/MM·급여 환산은 없다.
3. **Tempo·BigPicture는 상위 시장** — 설치 1만~2.7만 건의 성숙 제품이지만, Tempo는 3개 유료 앱 조합(≈$9.20+)·전 Jira 유저 강제 과금·한국어 미지원, BigPicture는 범용 PPM이라 인력·원가는 부수 기능. 둘 다 **데이터가 벤더 인프라에 저장**된다 (Tempo=Forge Remote, BigPicture=Appfire AWS).
4. **국내 독립형 PMS는 경쟁재가 아니다** — E3PS·유시스·WATCH2·Smartbase·Link PMS 모두 구축형/온프레미스이고 제조 R&D 또는 공공 SI 산출물 관리 지향. **Jira 연동을 내세운 곳은 한 곳도 없고**, MM 단위를 전면에 둔 제품도 확인되지 않았다.
5. **우리의 미흡점** — 급여 원가의 앞뒤 흐름(타임시트 승인 → 예산 대비 → 청구 단가 분리)이 비어 있고, 마켓플레이스 실적·배지·가격이 없다. 보강 순서는 **타임시트 승인 → 마켓 등록·배지 → 예산 대비**(§8). 이전 문서의 "휴가/가용성 관리 부재"는 **오류**였다 — 연차·반차·출장 스케줄과 공휴일이 가동률 분모에 이미 반영된다.
6. **판단** — Tempo·BigPicture와 정면 경쟁하면 성숙도·기능 폭에서 진다. 그러나 "Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 SI·공공·에이전시"로 좁히면 그들이 구조적으로 못 하는 것(급여 원가·한 앱 가격·데이터 무유출·한국어)이 결정 요인이 된다(§10).
7. **확장** — RMS(Jira 안 리소스 관리)는 이길 수 있고, 국내 독립형 PMS는 Confluence 앱과 결합해 대체할 수 있으며, 글로벌 범용 PPM은 Atlassian Plans가 흡수 중이라 싸울 자리가 아니다. 글로벌은 "MM 정산 문화권"(일본 人月 → DACH PT)으로 간다(§12). 기능별로 어느 경쟁 기능과 대체 관계인지는 §11.

---

## 2. 기준점 — Moves RMS 프로필

| 항목 | 내용 |
|---|---|
| 아키텍처 | Atlassian Forge (nodejs22.x) — Forge SQL + Forge KVS + Jira REST. 외부 전송은 Sentry(`analytics` 카테고리, `inScopeEUD: false`)뿐 |
| Runs on Atlassian | 🟡 manifest 기준 [요건 충족](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/) ([분석 도구 정책](https://developer.atlassian.com/platform/forge/analytics-tool-policy/)) — 배지 취득은 마켓플레이스 등록 시 심사 |
| 핵심 기능 | 프로젝트 인력·팀 관리, 워크로그 추적, **MD/MM 산정**, 가동률, 진척도, **급여 기반 원가 분석**, 간트, 전사 포트폴리오 대시보드, 작업 배정, 팀/인력/이슈 분석 리포트 |
| 원가 모델 | 백오피스 연봉 + 프로젝트별 투입급여(`salary_type`), ANNUAL은 월할 환산. 급여 정책(등급 밴드 vs 인원별) + `CostAccess`(PROJECT_COST) 이중 게이팅 |
| 가용성 | 연차(1 MD)·반차(0.5 MD)·출장·기타 스케줄이 근무일 기준 가동률 분모에서 차감, 공휴일 백오피스 관리 |
| 팀 관리형 프로젝트 | ✅ 커스텀 필드 누락을 이슈 엔티티 프로퍼티(`movesRms`)로 자동 우회 — 사용자 수동 설정 불필요 |
| 언어 | 한국어 · 영어 |
| 없는 것 | 휴가 승인 워크플로, 잔여 연차 관리, 타임시트 승인, 예산/EVM, 청구·인보이스, SAFe/what-if, AI 연동, Data Center 버전 |
| 가격 | 미정 |

---

## 3. 경쟁 지형 분류

| 구분 | 제품 | 성격 | 겹치는 정도 |
|---|---|---|---|
| **직접 경쟁** (Jira 앱, 배정+가동률+원가) | ActivityTimeline, TeamBoard TimePlanner(+ProScheduler), Resource Management for Jira(Be On Time) | 한 앱 안에서 인력 배정·가동률·원가를 다룸 | 높음 |
| **상위 시장** (Jira 앱, 대형) | Tempo 제품군(Capacity Planner·Timesheets·Financial Manager·Structure), BigPicture | 설치 1만 건 이상. 범용 PPM 또는 모듈 조합 | 중간 — 세그먼트가 다름 |
| **부분 경쟁** (Jira 앱, 한 축만) | Time & Cost Tracker(원가만), Clockwork Pro(타임트래킹+원가), Planyway(일정·워크로드만), Capacity Planner by RVS(스프린트 용량만) | 원가 또는 배정 중 한 축만 | 낮음~중간 |
| **독립형 글로벌 SaaS** | Float, Runn, Resource Guru, Kantata | Jira 외부 툴. 대부분 Jira→툴 단방향 | 낮음 |
| **국내 독립형 PMS** | E3PS, 유시스, WATCH2, Smartbase, Link PMS, 솔브리드플러스 | 구축형, Jira 연동 없음, 제조/공공 지향 | 낮음 (구매 검토 시 비교 대상으로는 등장 가능) |

---

## 4. 경쟁사 상세

### 4.1 Tempo 제품군 (Tempo Software)

| 항목 | 내용 |
|---|---|
| 구성 | Capacity Planner(구 Planner) + Timesheets + Financial Manager(구 Cost Tracker) + Structure PPM/Gantt — 기능별 **별도 유료 앱** |
| 마켓 지표 | Capacity Planner 설치 9,721 · 평점 3.7 · 리뷰 200 / Timesheets 27,122 · 4.1 · 896 / Financial Manager 3,199 · 3.8 · 46 / Structure 13,081 · 4.6 · 408 |
| 가격 | Capacity Planner $3.99 · Timesheets $5.21 · Structure Std $3.52 / Adv $4.73 · Gantt $1.27 · Financial Manager **미확인**. Planner+Timesheets만 합쳐도 **$9.20** + FM. **Tempo 유저 수 = Jira 유저 수 강제** (미사용자도 과금). 2025-09-15 Cloud 10~25% 인상 |
| 아키텍처 | Connect → **Forge Remote** 전환 중(2026-03-31~ 자동 롤아웃). 프론트만 Atlassian 호스팅, 백엔드는 Tempo 인프라 → Runs on Atlassian 아님. 롤백 불가, 일부 저장 리포트·JQL 필터 깨짐 |
| 자원/가동률 | 워크로드 스킴(주/일 근무시간) − 휴일 스킴 = 용량·FTE. Capacity Report(팀·역할·유저·지역별). Utilization Rate 계산 옵션 2종. **Planned vs Actual은 Timesheets 동시 설치 필수** |
| 원가 모델 | Financial Manager — **시간당** cost rate·billing rate, 역할별 글로벌 단가 또는 개인별, 날짜별 변동 단가. **급여 저장 없음**. Timesheets 필수 의존. EVM·편차 리포트는 DC용 Budgets에만 있고 Cloud 미제공 |
| 원가 권한 | 글로벌 3단(Project Administrator / Manager / Viewer) + 프로젝트 역할 3단(Owner / Editor / Viewer). Viewer는 단가·비용·워크로그 열람 불가 |
| 휴가 | 휴일 스킴(국가/지역별). 휴가 승인 워크플로 **미확인** |
| 팀 관리형 | Tempo Team/Account 필드를 팀 관리형 스페이스에 **수동 추가** 필요. 팀 관리형 비즈니스 프로젝트에선 리포트가 본인 워크로그만 표시 |
| 한국어 | ❌ (EN/FR/ES/DE/PT/RU). 한국 파트너 **미확인** |
| 약점 | 평점 3.7(제품군 최저), "설치 후 아무것도 안 보임" 리뷰, 워크로그가 asApp으로 기록돼 작성자 JQL 깨짐·락인 우려(2026-06 리뷰), 권한 스킴 복잡, 3개 앱 조합 필요 |
| 공식 문서 | [Capacity Planner 마켓](https://marketplace.atlassian.com/apps/1211881) · [가격](https://www.tempo.io/pricing/capacity-planner) · [Planned vs Actual](https://help.tempo.io/planner/latest/planned-vs-actual-reports) · [Utilization Rate](https://help.tempo.io/planner/latest/setting-the-utilization-rate-calculation) · [FM 단가 설정](https://help.tempo.io/financialmanager/latest/setting-project-cost-rates-and-billing-rates) · [FM 권한](https://help.tempo.io/financialmanager/latest/permissions-and-roles-for-tempo-projects) · [Budgets DC vs Cloud](https://help.tempo.io/cloudmigration/latest/tempo-budgets-server-data-center-vs-cost-tracker-c) · [팀 관리형 필드](https://help.tempo.io/timesheets/latest/managing-tempo-app-fields-in-jira-team-managed-pro) · [Forge 전환 공지](https://www.tempo.io/product-news/tempo-moves-to-forge) · [Forge 전환 FAQ](https://help.tempo.io/timesheets/latest/timesheets-migration-to-forge-faqs) · [2025 가격 인상](https://www.tempo.io/blog/upcoming-tempo-price-changes-effective-september-15-2025) · [Structure 가격](https://www.tempo.io/pricing/project-portfolio-management-software-ppm) |

### 4.2 BigPicture (Appfire)

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 10,952 · 평점 3.9 · 리뷰 504(Cloud 295) · Cloud Fortified. DC용 BigPicture Enterprise 별도(설치 2,537) |
| 가격 | Standard / Advanced 2에디션(2026-07-01 적용). 100유저 연간 $5,210 / $5,730 (≈ **$4.34 / $4.78**). 갱신가 초기가의 50%. "무료 구간 넘으면 무료 좌석까지 전부 과금" 리뷰 불만 |
| 아키텍처 | 앱 데이터가 **Appfire AWS 6개 리전**에 저장(리전 선택은 Enterprise만) → Runs on Atlassian 아님. Connect/Forge 여부는 REST 응답 상충으로 **미확인** |
| 자원/가동률 | Resources 모듈, 개인·팀 뷰. 용량 = 워크로드 플랜 − 휴일 플랜 − 개인 부재. 시간 단위 집계, 과부하 색상, "Find the perfect match" 가용 담당자 제안. 개인 용량과 팀 집계를 동시에 쓰지는 못함 |
| 공수 단위 | 🟡 **효과 모드에 man-day 지원** (man-day / 스토리포인트 / 타임트래킹 중 택1) — 다만 원가는 시급 |
| 원가 모델 | Financials 모듈(Cloud는 Advanced 에디션) — 팀/리소스별 **시간당 단가**, Box 레벨 USD만·팀 레벨 다통화, 예상 예산·실행 원가·Planned vs Actual. **급여 저장 없음** |
| 원가 권한 | 앱 레벨 2종 — App Financial Viewer(조회) / App Financial Admin(단가·예산 편집) + Box별 보안 역할 |
| 휴가 | 홀리데이 플랜 + 개인 부재로 용량 차감. 승인 워크플로 **미확인** |
| 팀 관리형 | Start/Due date 필드 추가·베이스라인용 커스텀 필드 2개·프로젝트별 동기화를 **수동** 설정. "일부 기능 사용 불가" 문서화 |
| 한국어 | ❌ (영어 UI). 한국 고객 사례 **미확인** |
| 약점 | 대용량 로딩 지연, 설정 복잡·가파른 학습곡선("사내 Jira 전문가 필요"), 예산·타임트래킹은 상대적 약점, AI 예측 부재 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1212259/bigpicture-project-management-ppm) · [가격 업데이트](https://appfire.com/pricing-updates/big-picture-jira) · [Resources 모듈](https://appfire.atlassian.net/wiki/spaces/DLP/pages/298224554) · [개인 용량](https://appfire.atlassian.net/wiki/spaces/DLP/pages/297636981) · [효과 모드·Financials](https://appfire.atlassian.net/wiki/spaces/SPM/pages/1918404223) · [보안 역할](https://appfire.atlassian.net/wiki/spaces/DLP/pages/297994764) · [데이터 리전](https://appfire.atlassian.net/wiki/spaces/DLP/pages/297603214) · [팀 관리형 설정](https://wiki.bigpicture.one/display/DOCUMENTATION/Setting+up+BigGantt+and+BigPicture+to+support+Team-managed+projects) |

### 4.3 ActivityTimeline (Reliex) — 가장 근접한 직접 경쟁자

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 3,759 · 평점 4.7 · 리뷰 121 · Cloud Fortified · ISO 27001·SOC2 Type 2. 2.3.0(2026-06-09)에서 Advanced 에디션(Finances·프리미엄 지원) 도입 |
| 가격 | 11~100 **$2.50** · 101~250 $1.75 · 251~1,000 $1.25. 10유저 $10 정액(무료 구간 없음). Advanced 단가 **미확인** |
| 아키텍처 | 앱 키 `…atlassian.connect`, 스코프 `*:connect-jira` → **Connect 앱**. 데이터 리전 **미확인** |
| 자원/가동률 | 개인 Workload Scheme(요일별 근무시간), 일별 involvement. Resource Utilization·Team Utilization 리포트, Planned vs Actual(원 견적 vs 로그+잔여, ON TRACK/OVER/UNDER) |
| 원가 모델 | Finances(Advanced·EAP) — 사용자별 Cost Rate + Billing Rate, **시간당 단가와 월 정액(급여자용, 일할 안분) 모두 지원**, 카테고리 배수, 효력일 기반 단가 이력. 예산 = 프로젝트/에픽/JQL 스코프. 리포트 3단 |
| 원가 권한 | "역할 기반 접근 제어로 일반 사용자에게 단가 차단"이라 홍보하나 공식 역할 문서(7단계)에 Finances 항목 없음 — 세부 **미확인** |
| 휴가 | ✅ 연간 허용일 설정 → 요청 → 관리자 승인 → 잔여일 반영. 승인분만 용량 차감. 국가별 Holiday Scheme |
| 팀 관리형 | Start/End·Original Estimate·Story Points를 프로젝트별 **수동** 설정 가이드 |
| 한국어 | ✅ (EN/DE/FR/ES/IT/PT-BR/**KO**/ZH). 한국 고객 사례 **미확인** |
| 약점 | Jira 동기화 15분+ 지연(수동도 동일), 로그 시간이 다른 날짜에 표시, 초기 UI 혼란, 포트폴리오 전략 로드맵 없음 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1220860/activity-timeline-resource-planning-time-tracking) · [가격](https://activitytimeline.com/pricing) · [Workload Scheme](https://help.activitytimeline.com/at/workload-schemes) · [용량 개념](https://help.activitytimeline.com/at/basic-concepts-workload-capacity-involvement) · [Planned vs Actual](https://help.activitytimeline.com/at/planned-vs-actual-report) · [Finances 소개](https://community.atlassian.com/forums/App-Central-articles/Jira-Cost-Management-with-ActivityTimeline-Finances-Module/ba-p/3249427) · [역할·권한](https://help.activitytimeline.com/at/user-roles-and-permissions) · [휴가 관리](https://help.activitytimeline.com/at/vacation-management) · [팀 관리형 설정](https://help.activitytimeline.com/at/how-to-setup-start-end-dates-for-jira-team-managed) |

### 4.4 TeamBoard ProScheduler + TimePlanner (DevSamurai)

| 항목 | 내용 |
|---|---|
| 마켓 지표 | ProScheduler 설치 3,195 · 4.3 · 리뷰 175 / TimePlanner 설치 1,332 · 4.8 · 리뷰 116 · Cloud Fortified |
| 가격 | ProScheduler **$1.75** + TimePlanner **$1.75** = 두 앱 합산 $3.50 (벤더 사이트는 $1.25/$1.50 표기 — 마켓 REST와 불일치, 구버전 추정) |
| 아키텍처 | REST `connect:false` → Forge 기반. Runs on Atlassian 배지 **미확인** |
| 자원/가동률 | ProScheduler: 용량 기반 배정, 시간/% 워크로드 뷰, 공휴일·병가·휴가, 간트(의존성·베이스라인·크리티컬 패스), 프로젝트/프로그램/포트폴리오 |
| 원가 모델 | TimePlanner: **Resource / Resource Group / Project / Project Group 4계층 단가**, 단가 유효기간 이력(겹침 불가·미래 날짜만 추가), Scheduled Cost vs Actual Cost, 개인/팀/프로젝트/클라이언트별 리포트, 인보이스. **시급 billing rate 기반 — 급여·MD/MM 없음** |
| 원가 권한 | Billing/Cost Admin(계획·설정 편집) / Billing/Cost Viewer(조회) 2단 |
| 휴가 | ✅ 휴가 승인 워크플로 + 타임시트 승인 (TimePlanner) |
| 한국어 | **미확인** |
| 약점 | 비용을 별도 앱 추가 구매로 분리, 티어 과금("해당 티어 전액") |
| 공식 문서 | [ProScheduler 마켓](https://marketplace.atlassian.com/apps/1223423) · [TimePlanner 마켓](https://marketplace.atlassian.com/apps/1224927) · [ProScheduler 기능](https://teamboard.cloud/proscheduler/) · [ProScheduler 문서](https://docs.devsamurai.com/teamboard-proscheduler) · [TimePlanner 기능](https://teamboard.cloud/timeplanner-features/) · [원가 추적 가이드](https://community.atlassian.com/forums/App-Central-articles/How-To-Use-TeamBoard-TimePlanner-for-Accurate-Cost-Tracking/ba-p/2848745) · [Actual vs Estimated Cost·권한](https://teamboard.cloud/actual-vs-estimated-costs/) |

### 4.5 Resource Management for Jira (Be On Time) — 아키텍처가 가장 유사한 신규 앱

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 **12** · 평점 5.0 · 리뷰 2 · "New" · **Runs on Atlassian 배지** · v4.27.0(2026-08-28) |
| 가격 | **$2.50 정액**(15~1,000명 동일) — 볼륨 할인 거의 없음 |
| 아키텍처 | 순수 Forge. 벤더 메시지 "Runs on Forge, 100% Data stays in Atlassian" |
| 기능 | 리소스 요청 라이프사이클 + 타임라인, 실시간 과부하 플래그, 캘린더 기반 용량·휴가 셀프서비스, 타임시트 승인, "invoice-ready exports with cost calculations"(단가 모델 **미확인**), 계층형 팀 관리 + scoped access, 포트폴리오 분석 언급. 간트 **미확인** |
| 시사점 | Moves RMS와 같은 "순수 Forge·데이터 무유출" 포지션을 먼저 마켓에 올렸다. 초기 제품이지만 릴리스 주기가 빠르므로 분기별 추적 권장 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/2338306760/resource-management-for-jira) · [벤더](https://be-on-ti.me) |

### 4.6 Time & Cost Tracker for Jira (SaaSJet)

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 530 · 4.6 · 리뷰 17 · Cloud Fortified · Forge 기반 |
| 가격 | **$1.50** |
| 원가 모델 | 사용자별 hourly rate + billing rate, 효력일 이력. 산식 "프로젝트 원가 = 워크로그 × 단가 + 직접비". 직접비·반복비, **예산·EVM, OPEX/CAPEX**, 포트폴리오 비용 집계 |
| 원가 권한 | Jira 그룹 단위로 "팀·단가 열람 / 리포트 생성 / 지출 관리 / 접근 관리" 분리 부여 |
| 없는 것 | 자원 배정, 가동률, 휴가, 간트 — **사후 원가 리포트 전용** |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1229405) · [제품](https://saasjet.com/cost-tracker-for-jira-cloud/) · [Cost reports](https://saasjet.atlassian.net/wiki/spaces/TCTFJ/pages/2396684299/Cost+reports) · [권한](https://saasjet.atlassian.net/wiki/spaces/TCTFJ/pages/2372468737) |

### 4.7 Clockwork Pro (HeroCoders)

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 4,631 · 4.6 · 리뷰 139 · Forge 기반 |
| 가격 | **$1.30** |
| 원가 모델 | 사용자별 Hourly Cost(내부 원가) + Hourly Rate(청구). **기간별·스페이스별 단가 미지원**(공식 문서 명시) |
| 원가 권한 | `Clockwork Budgeting Access` 글로벌 권한 그룹 단일 |
| 없는 것 | 자원 배정, 가동률, 휴가, 간트, 포트폴리오 — 자동 타이머 타임트래커 + 원가 리포트 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1219213) · [Cost & Rate 문서](https://docs.herocoders.com/clockwork/cost-rate-tracking) · [제품](https://www.herocoders.com/products/jira-time-tracking/clockwork-pro) |

### 4.8 Planyway for Jira

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 1,468 · 4.6 · 리뷰 52 · Forge 기반 |
| 가격 | **$3.00** |
| 기능 | 자원 배정, scheduled vs capacity 가동률 % 색상, 휴가·공휴일, 타임라인/로드맵, 멀티 프로젝트 포트폴리오, 타임시트 |
| 없는 것 | **원가·단가·급여 추적 전무** — MD/MM 비용 분석 용도 불가 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1221297) · [Capacity Planning](https://planyway.com/jira/jira-capacity-planning) |

### 4.9 Capacity Planner – Resource Planning in Jira (RVS Softek)

| 항목 | 내용 |
|---|---|
| 마켓 지표 | 설치 496 · 4.4 · 리뷰 13 · **Connect 앱**(조사 대상 중 유일하게 Connect 잔존) |
| 가격 | **$0.50** (최저가) |
| 기능 | 스프린트·픽스버전 단위 배정, 가동률·워크로드 대시보드, 휴가·공휴일, 역할 기반 계획, Tempo Timesheet 연동 |
| 없는 것 | 원가·단가, 간트, 권한 세분화 |
| 공식 문서 | [마켓](https://marketplace.atlassian.com/apps/1231411) · [벤더](https://www.rvssoftek.com/capacity-planner) |

### 4.10 독립형 글로벌 리소스관리 SaaS

| 제품 | 가격 | Jira 연동 | 원가/단가 | 일(MD) 단위 | 공식 문서 |
|---|---|---|---|---|---|
| **Float** | Starter $7 / Pro $12 per scheduled person/월 | **단방향(Jira→Float)** 프로젝트·인원·이슈·견적 임포트. Float→Jira 미동기, 워크로그 미동기. 마켓 앱 무료·설치 960 | Cost rates, rate cards, 마진·예산 소진 | 시간 단위 | [가격](https://www.float.com/pricing) · [Jira 연동](https://support.float.com/en/articles/3854834-jira) |
| **Runn** | Lite $7 / Standard $11 per seat/월, 5명 이하 무료 | **단방향** 프로젝트·인원만. 이슈·견적·타임시트 미지원, 최소 1시간 주기 | Project Financials·Budgets | hours/day 또는 % | [가격](https://www.runn.io/pricing) · [Jira 연동](https://help.runn.io/en/articles/9624395-jira-integration-overview) |
| **Resource Guru** | $5 / $8 / $12 per person/월 | **단방향** 이슈 임포트, original estimate vs 스케줄 비교 | 인원·역할별 시급 | hours-per-day booking | [가격](https://resourceguruapp.com/pricing) · [Jira 연동](https://help.resourceguruapp.com/en/articles/4983618) |
| **Kantata** (Forecast 흡수) | 비공개, 제3자 추정 $45~110, **50석 최소** | **양방향** 이슈↔태스크, 시간 기록 전송. "Jira Classic만(NextGen 불가)" | PSA 전체(예산·마진·청구) | 일 단위 booking | [Jira 연동](https://knowledge.kantata.com/hc/en-us/articles/217177867-Jira-Integration-Overview) |

> 미드마켓 3종은 전부 **Jira→툴 단방향·시간 단위·워크로그 미동기**. Jira 내부에서 MD/MM·급여 원가·가동률을 계산하는 앱과 직접 겹치지 않는다.

### 4.11 국내 독립형 PMS

| 제품 | 성격 | 공수/인력/원가 | 배포 | Jira 연동 | 대상 | 출처 |
|---|---|---|---|---|---|---|
| **E3PS PMS** | PTC 파트너, PMS 구축 300여 사 | "예상 원가 분석, 인력 투입 분석, 리소스 할당". MD/MM·가동률 명시 없음 | 구축형 Web, PDM 통합 | ❌ | 자동차·반도체·제조 R&D | [제품](https://www.e3ps.com/productPMS) |
| **유시스 스마트 PMS** | 공정·진척·산출물 관리 | "인력관리". 공수·원가·가동률 문구 없음 | 구축형(견적) | ❌ | 일반 | [제품](https://uxis.co.kr/03_Lab/Solution-PMS.php) |
| **WATCH2 Project** | 공공 SI 특화, WBS⇔간트, S-Curve, 산출물 다단계 승인, 주·월간보고 DOCX | 공수·원가·가동률 항목 없음 | **On-Premise**, 폐쇄망 | ❌ | 공공 SI | [제품](https://watch2.co.kr/watch2project/) |
| **Smartbase PMS** (이노베이스) | PMBOK 기반 EPM | "자원관리, 비용관리, 인력 배정, 원가 분석" | SaaS(최소 10유저, 인프라 ₩15~25만/월, 모듈 단가 미공개) | ❌ | 스마트팩토리/제조 | [제품](http://www.innobase.net/pms.php) · [SaaS 가격](http://www.innobase.net/saas_price.php) |
| **Link PMS** (마이링크) | WBS·칸반·간트, 전자정부 F/W | "자원 관리, 현황/통계(자원·일정·진척율)". MM 산출 미확인 | 구축형 + SaaS 옵션 | ❌ | PLM/MES 연계 제조 | [제품](https://my-link.co.kr/Home/linkPMS) |
| **솔브리드플러스 PMS** | 연구과제 관리(LIMS·ELN 연계) | **미확인**(페이지가 이미지) | 구축형 | ❌ | 연구개발 | [제품](https://www.solbridplus.com/product_information/pms/) |

> Dooray!, flow, 잔디 등 협업툴은 공수(M/M)·투입인력 관리 기능이 확인되지 않아 제외. 공공 SI 대가 산정이 [기능점수(FP)와 투입공수(M/M) 방식으로 나뉘는데](https://www.comworld.co.kr/news/articleView.html?idxno=49024) MM을 전면에 둔 국내 제품은 확인되지 않았다.

---

## 5. 기능 대조 매트릭스

| 기능 | Moves RMS | Tempo (3앱) | BigPicture | ActivityTimeline | TeamBoard (2앱) | Be On Time RM | 국내 PMS |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Jira 네이티브 | ✅ Forge | ✅ Forge Remote | ✅ | ✅ Connect | ✅ Forge 기반 | ✅ Forge | ❌ |
| Runs on Atlassian (데이터 무유출) | 🟡 요건 충족·배지 심사 전 | ❌ | ❌ | ❌ | 🟡 미확인 | ✅ 배지 | — |
| 자원 배정·용량 계획 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| 가동률 (%) | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 과부하 플래그 | 🟡 |
| MD/MM 공수 단위 | ✅ | ❌ 시간·FTE | 🟡 man-day 효과 모드(원가는 시급) | ❌ | ❌ | ❌ | 🟡 명시 없음 |
| 급여(연봉/월급) 저장·환산 원가 | ✅ | ❌ 시급 rate | ❌ 시급 | 🟡 월 정액 단가 | ❌ 시급 | 🟡 미확인 | 🟡 방식 미확인 |
| 원가 가시성 세분화 | ✅ 정책 이원화 + CostAccess | 🟡 글로벌 3단 + 프로젝트 3단 | 🟡 Viewer/Admin 2단 | 🟡 세부 미확인 | 🟡 Admin/Viewer 2단 | 🟡 scoped access | 미확인 |
| 휴가·공휴일 → 용량 차감 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 미확인 |
| 휴가 승인 워크플로·잔여일 | ❌ | 🟡 미확인 | 🟡 미확인 | ✅ | ✅ | 🟡 셀프서비스 | — |
| 타임시트 승인 | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ | — |
| 간트 | ✅ | 🟡 Structure 별도 | ✅ | 🟡 타임라인 | ✅ | 🟡 미확인 | ✅ |
| 전사 포트폴리오 대시보드 | ✅ | 🟡 Structure 별도 | ✅ | 🟡 | 🟡 | 🟡 | 🟡 |
| 워크로그 연동 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 예산 / EVM | ❌ | 🟡 예산만(EVM은 DC) | ✅ | ✅ 예산 | 🟡 계획 vs 실적 | 🟡 | 🟡 |
| 팀 관리형 프로젝트 | ✅ 자동 | 🟡 수동 필드 | 🟡 수동 필드 | 🟡 수동 필드 | 미확인 | 미확인 | — |
| 한국어 UI | ✅ | ❌ | ❌ | ✅ | 미확인 | 미확인 | ✅ |

---

## 6. 가격 비교 (Cloud, 11~100 유저, $/user/월)

| 제품 | 단가 | 비고 |
|---|---|---|
| Moves RMS | 미정 | — |
| Capacity Planner by RVS | $0.50 | 스프린트 용량만 |
| Clockwork Pro | $1.30 | 타임트래킹+원가 |
| Time & Cost Tracker | $1.50 | 원가 리포트만 |
| TeamBoard ProScheduler + TimePlanner | $1.75 + $1.75 = **$3.50** | 배정·간트 + 원가 |
| ActivityTimeline | **$2.50** | 올인원 (Advanced 별도 단가 미확인) |
| Resource Management for Jira (Be On Time) | **$2.50 정액** | 볼륨 할인 없음 |
| Planyway | $3.00 | 원가 없음 |
| BigPicture | ≈ $4.34 Std / $4.78 Adv | 100유저 연간 환산, 갱신 50% |
| Tempo Capacity Planner + Timesheets | $3.99 + $5.21 = **$9.20** | + Financial Manager(미확인) + Structure $3.52~4.73. 전 Jira 유저 강제 과금 |
| Float / Runn / Resource Guru | $7~12 | 독립형, Jira 단방향 |
| Kantata | $45~110 (추정) | 50석 최소 |

> 직접 경쟁 3곳(ActivityTimeline·TeamBoard·Be On Time)이 **$2.50~3.50** 대에 몰려 있다. Moves RMS 가격 설계의 기준 구간으로 볼 수 있다.

---

## 7. 비교 우위 (우리가 앞서는 지점)

1. **급여 환산 원가 + 가시성 정책** — 경쟁 앱의 원가는 전부 시급 rate이며 급여 자체를 저장·환산하는 앱은 없다(ActivityTimeline 월 정액이 가장 근접). "등급 밴드 vs 인원별" 정책과 `CostAccess`를 **별개로 이중 게이팅**하는 구조는 경쟁사 2단 Viewer/Admin 모델보다 세밀하다.
2. **MD/MM 공수를 원가까지 연결** — BigPicture가 man-day 효과 모드를 갖지만 원가는 시급이다. 공수 → 급여 환산 → 프로젝트 원가로 이어지는 한 줄 산식은 조사 범위에서 Moves RMS만 있다. SI/공공 정산 관행(투입공수 M/M)의 언어를 그대로 쓴다.
3. **팀 관리형 프로젝트 자동 대응** — Tempo·BigPicture·ActivityTimeline 모두 사용자에게 필드 수동 추가를 요구한다. 이슈 프로퍼티(`movesRms`) 우회로 설정 없이 동작하는 것은 도입 마찰을 줄이는 실질적 차이다.
4. **순수 Forge·데이터 무유출** — Tempo(Forge Remote)·BigPicture(Appfire AWS)·ActivityTimeline(Connect)은 데이터가 벤더 인프라로 나간다. Runs on Atlassian 요건을 manifest 기준으로 충족하며, 배지를 받으면 Be On Time과 함께 소수 그룹에 든다. Forge 수익 배분(누적 $1M까지 0%, 이후 16~17% vs Connect 25%)도 유리하다.
5. **한국어 + 통합** — 한국어 UI는 ActivityTimeline 외 전무. 배정·가동률·진척·원가·간트·포트폴리오를 한 앱에 담아 Tempo식 3앱 조합·TeamBoard식 2앱 조합 대비 총소유비용 메시지를 만들 수 있다.

## 8. 미흡점 — 우선순위별

위쪽일수록 타겟 세그먼트(SI·공공·에이전시)에서 계약을 놓치게 만드는 항목이다.

### 8.1 기능 — 정산 흐름이 끊겨 있다

| 갭 | 왜 치명적인가 | 보유 경쟁사 |
|---|---|---|
| **타임시트(워크로그) 승인** | 워크로그가 원가로 바뀌는데 "누가 승인했나"가 없으면 정산 근거로 쓸 수 없다. SI에서 PM 승인 없는 공수는 청구 불가 | Tempo Timesheets · TeamBoard TimePlanner · Be On Time |
| **예산 대비 소진** | 급여 원가는 계산되지만 "계획 대비 얼마나 썼나"가 없다. 원가만 있고 예산이 없으면 관리 도구가 아니라 조회 도구다 | BigPicture Financials · ActivityTimeline Finances · SaaSJet(EVM까지) |
| **휴가 승인·잔여 연차** | 연차·반차가 MD 차감은 되지만 승인자·잔여일이 없다. HR 도구를 옆에 붙이게 된다 | ActivityTimeline · TeamBoard |
| **청구 단가 ↔ 내부 원가 분리** | 외주 SI는 "고객에게 받는 MM 단가"와 "직원 급여 원가"를 나눠 마진을 본다. 우리는 원가 한 축만 있다 | TeamBoard · SaaSJet · Clockwork(cost rate + billing rate 2종) |

> 네 항목 모두 우리 강점(급여 원가)의 **앞뒤 흐름**이다. 강점이 고립돼 있는 상태다.

### 8.2 신뢰 — 아직 제품이 아니라 코드다

| 갭 | 현황 | 비교 |
|---|---|---|
| 마켓플레이스 실적 | 설치·리뷰·Cloud Fortified·Runs on Atlassian 배지 전부 없음 | 경쟁사 최소치 Be On Time도 설치 12건에 배지 보유 |
| E2E 미수행 기능 | 포트폴리오·비용·팀 분석·급여 정책·자원관리 등 "구현+검증 완료·E2E 미수행" 상태가 다수 | 실사용자가 밟은 적 없는 기능이 절반 |
| 데이터 상한 | Forge SQL 1GiB(프로덕션). 저장공간 모니터링은 있으나 **아카이빙·삭제 정책 없음** | 워크로그를 오래 쌓는 조직에서 언제 막히는지 답이 없다 |
| 가격 | 미정 | 비교표에서 우리 칸만 비어 있다 |

### 8.3 범위 — 좁은 세그먼트 안에서도 빠진 것

| 갭 | 설명 |
|---|---|
| **Tempo 마이그레이션 경로** | 타겟 조직 상당수가 이미 Tempo를 쓴다. 워크로그는 Jira 네이티브라 문제없지만 Tempo 팀·계정·단가 데이터를 옮길 방법이 없으면 전환 비용이 도입을 막는다 |
| **정산용 엑셀 출력** | SI 정산은 결국 엑셀로 나간다. "월별 인원 × MM × 단가" 정산표 형식 출력이 있는지 확인·보강 필요 |
| **Data Center 미지원** | 공공은 지금도 DC가 많다. 2029-03 EOL이라 시간이 해결하지만 2~3년은 "Cloud 전환 조직만" 대상 |

### 8.4 일부러 안 하는 것

SAFe/애자일 포트폴리오, what-if 시나리오, AI 예측, 인보이스 발행, 리스크 매트릭스 — BigPicture·Tempo 영역이고 타겟 세그먼트가 찾지 않는다. 여기 손대면 범용 PPM으로 끌려가서 진다.

### 8.5 보강 순서

**타임시트 승인 → 마켓 등록·Runs on Atlassian 배지 → 예산 대비 소진** → 휴가 승인 → 청구 단가 분리 → Tempo 마이그레이션. 앞의 셋 없이는 타겟 세그먼트 안에서도 Tempo Timesheets를 옆에 붙이게 되고, 그 순간 "한 앱" 메시지가 무너진다.

## 9. 리스크와 제언

| 구분 | 내용 |
|---|---|
| 모방 리스크 | Tempo·ActivityTimeline이 "MD 환산 뷰"를 추가하는 것은 UI 레이어 작업에 가깝다. BigPicture는 이미 man-day 모드가 있다. **공수 단위 자체는 해자가 아니다** — 급여 환산·가시성 정책·팀 관리형 자동 대응처럼 구현 난이도가 높은 쪽에 방어선을 두는 편이 안전하다 |
| 신규 경쟁자 | Be On Time이 "순수 Forge·데이터 무유출"을 먼저 마켓에 올렸다. 초기 제품(설치 12)이지만 릴리스가 빠르다(v4.27, 2026-08). 분기별 추적 권장 |
| GTM | 범용 리소스관리로 Tempo·ActivityTimeline과 정면 경쟁하기보다, **MM 정산 관행이 있는 SI·공공·에이전시 조직**을 첫 세그먼트로. 국내 독립형 PMS가 Jira 연동을 하나도 제공하지 않으므로 "Jira를 쓰는 SI 조직"이 비어 있는 자리다 |
| 가격 | 직접 경쟁 3곳이 $2.50~3.50. 이 구간 안에서 "통합 1앱" 메시지가 성립한다 |
| 메시징 | "레이트 기반 원가"가 아니라 "공수(MD/MM) 기반 급여 원가"로 용어를 고정. Runs on Atlassian 배지 취득을 우선 과제로 |
| 우선 보강 후보 | ① 타임시트 승인(SI 정산 직결) ② 예산 대비 소진(급여 원가와 결합 시 차별화) ③ 휴가 승인 워크플로(범위 결정 필요) |

---

## 10. 판단 — Tempo·BigPicture 대비

> 결론: **정면으로 붙으면 진다. 그러나 정면으로 붙을 이유가 없다.**

### 10.1 Tempo·BigPicture가 확실히 앞서는 것

| 항목 | 내용 |
|---|---|
| 성숙도·신뢰 | 설치 2.7만 / 1.1만 건, 리뷰 수백 건, Cloud Fortified. 우리는 0건. 구매 담당자가 "검증된 제품"을 원하면 여기서 끝난다 |
| 기능 폭 | 타임시트 승인·예산·휴가 승인·통합 생태계(Tempo: Slack/캘린더/IDE, BigPicture: SAFe·리스크·what-if). 우리는 "배정→가동률→원가" 한 줄은 깊지만 그 옆이 비어 있다 |
| 범용성 | 어느 업종이든 쓸 수 있게 설계됐다. 우리는 "급여를 프로젝트별로 넣고 MD로 정산하는 조직"이라는 전제가 깔려 있어 그 전제가 없는 조직엔 오히려 낯설다 |

### 10.2 이들이 구조적으로 못 하는 것

| 항목 | 내용 |
|---|---|
| 급여 원가 | 둘 다 시급(rate)이다. 기능 부족이 아니라 **설계 철학** — 서구 앱은 "청구 단가"를 다루지 "직원 연봉"을 앱에 넣는 걸 전제하지 않는다. 따라오려면 데이터 모델과 권한 체계를 새로 짜야 한다 |
| 가격 구조 | Tempo는 3앱 합쳐 $9~10+ 에 **전 Jira 유저 강제 과금**(100명 쓰는 사이트에 Jira 유저가 300명이면 300명 값). BigPicture $4.3~4.8. 우리가 $2.5~3.5 "한 앱"이면 TCO 메시지가 3배 차이로 성립한다 |
| 데이터 위치 | Tempo=Forge Remote(백엔드 자사 서버), BigPicture=Appfire AWS. 우리는 데이터가 Atlassian 밖으로 나가지 않는다. 공공·금융·대기업 보안 심사에서 이건 체크박스가 아니라 **통과/탈락**이다 |
| 한국어·업계 어휘 | 둘 다 한국어 없음. 번역 문제가 아니라 "가동률·MM·투입공수"라는 업계 어휘를 제품이 그대로 쓰느냐의 문제다 |

### 10.3 판단

**세그먼트를 좁히면 이기고, 넓히면 진다.**

Tempo·BigPicture의 고객은 "리소스 관리가 필요한 모든 팀"이다. 그 시장에 가면 기능 폭·인지도에서 밀린다. 그러나 **"Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 SI·공공·에이전시 조직"**으로 좁히면, 그 안에서는 Tempo·BigPicture가 오히려 부적합한 제품이 된다 — 시급을 억지로 넣어야 하고, 3개 앱을 사야 하고, 한국어가 없고, 데이터가 해외로 나간다.

이 세그먼트가 작다는 게 약점이지만, **아무도 채우고 있지 않다**는 게 강점이다. 국내 PMS는 Jira 연동이 0곳이고, 해외 앱은 급여 원가가 0곳이다.

### 10.4 전제 조건

이 판단은 **타임시트 승인을 채운다**는 전제 위에 있다. SI 정산에서 "워크로그를 누가 승인했나"는 거의 필수 요구라서, 이게 없으면 타겟 세그먼트 안에서도 Tempo Timesheets를 옆에 붙이게 되고, 그 순간 "한 앱" 메시지가 무너진다. 예산 대비·휴가 승인은 그 다음이다.

---

## 11. 기능별 대체 관계 — 우리 기능 ↔ 경쟁사 기능

> 읽는 법 — **대체 가능**: 경쟁 제품으로 갈아타도 같은 일을 할 수 있다 · **부분 대체**: 핵심은 같지만 한쪽에만 있는 것이 있다 · **우리만**: 조사 범위에서 대응 기능이 없다 · **Jira 기본**: 앱 없이 Jira 자체 기능으로 대체된다

### 11.1 Moves RMS 기능 → 가장 비슷한 경쟁 기능

| Moves RMS 기능 (화면) | 가장 비슷한 경쟁 기능 | 관계 | 차이 |
|---|---|---|---|
| **내 워크로그** (`/myWork` 입력·조회) | Tempo Timesheets "My Work" · ActivityTimeline 타임시트 · Clockwork 자동 타이머 | 부분 대체 | 입력·조회는 동등. 경쟁사는 승인 워크플로·자동 타이머·캘린더/Slack 연동이 있고 우리는 없다 |
| **워크로그 CSV 추출** (`/worklog-export`) | Tempo 리포트 내보내기 · ActivityTimeline 리포트 export | 대체 가능 | — |
| **프로젝트 인력 관리** (투입 인원·역할·등급·투입 기간) | Tempo Teams+Roles · BigPicture Resources · ActivityTimeline Classic/Functional Teams | 대체 가능 | 인력 명부·역할은 동등. **투입 급여(salary_type)** 컬럼은 우리만 |
| **급여 관리** (백오피스 연봉 + 프로젝트 투입급여 + 정책) | Tempo Financial Manager cost rate · BigPicture Financials rates · ActivityTimeline Finances(시급+월 정액) · TeamBoard 4계층 rate | 부분 대체 | 경쟁사는 **시급 rate**, 우리는 **급여**. 등급 밴드/인원별 정책은 우리만. 반대로 **청구(billing) rate**는 우리에게 없다 |
| **작업 배정** (프로젝트 내 ↔ 전사 후보 테이블 + 배정 실행) | Tempo Capacity Planner 팀 계획 · BigPicture "Find the perfect match" · ActivityTimeline 타임라인 드래그 · TeamBoard 스케줄 보드 | 부분 대체 | 배정 자체는 동등. 경쟁사는 **드래그식 타임라인 배정·스킬 기반 자동 추천**이 있고 우리는 테이블형·수동 |
| **자원관리 인력현황·가동률** (`/resource`) | Tempo Capacity Report · ActivityTimeline Resource Utilization · BigPicture Resources 워크로드 · Planyway 워크로드 | 대체 가능 | 가동률 산출은 동등. 우리는 **근무일·MD 기반 분모**, 경쟁사는 시간·FTE |
| **프로젝트 배정 관계도** (N:M 그래프, 중복 배정 강조) | 직접 대응 없음 (BigPicture Resources 뷰가 근접) | 우리만 | 시각화 방식이 독자적. 기능적 우위라기보다 차별 요소 |
| **팀 분석** (팀별 가동률 밴드·차트 6종) | Tempo Team utilization · ActivityTimeline Team Utilization 파이 | 대체 가능 | — |
| **작업관리 목록·트리·간트** (SVAR 간트, 폴더, 선후행·계층) | Structure + Gantt Charts · BigPicture Gantt/WBS · TeamBoard ProScheduler Gantt · Planyway 타임라인 | 부분 대체 | 기본 간트·의존성·계층은 동등. 경쟁사만 있는 것: **베이스라인·크리티컬 패스·리소스 레벨링·what-if** |
| **진척도** (공수/완성/일정 3층, EVM 근사) | BigPicture 진척 · Structure 롤업 수식 · SaaSJet EVM | 부분 대체 | 우리 3층 산식은 독자적. SaaSJet은 정식 EVM(CPI/SPI) |
| **비용 분석** (프로젝트 비용 탭, 급여 기반 인건비) | Tempo Financial Manager · BigPicture Financials · ActivityTimeline Finances · SaaSJet Time & Cost · Clockwork Cost | 부분 대체 | **원가 계산은 대체 가능**(단위만 다름). 경쟁사만: 예산 대비 소진·청구·EVM·OPEX/CAPEX |
| **프로젝트 캘린더** (인원 일정, FullCalendar) | ActivityTimeline 캘린더 · Planyway 캘린더 · Tempo 캘린더 연동 | 대체 가능 | — |
| **개인 스케줄** (연차·반차·출장 → MD 차감) | Tempo 휴일 스킴+휴가 · ActivityTimeline Vacation · BigPicture absence · TeamBoard 휴가 | 부분 대체 | 용량 차감은 동등. 경쟁사만: **요청→승인→잔여일** |
| **공휴일 관리** (백오피스) | Tempo Holiday Scheme · ActivityTimeline Holiday Scheme · BigPicture Holiday Plan | 부분 대체 | 우리는 단일 테이블, 경쟁사는 **국가/지역별 스킴** |
| **프로젝트 대시보드** (위젯·토폴로지·필터 저장) | BigPicture Overview · Tempo 가젯 · ActivityTimeline 대시보드 | 대체 가능 | — |
| **전사 포트폴리오 대시보드** (스냅샷, T/S/R 신호등, 가동률 글로벌) | BigPicture Portfolio Box · Structure 롤업 · Tempo(Structure) | 부분 대체 | 포트폴리오 뷰는 동등. **T/S/R 신호등·가동률 글로벌 지표**는 우리 산식 |
| **분석 리포트** (이슈·인력·팀 MM 분석) | Tempo 리포트 · ActivityTimeline Planned vs Actual · BigPicture 리포트 | 부분 대체 | 계획 vs 실적은 동등. **MM 단위 리포트**는 우리만 |
| **프로젝트 구독** (Confluence 스페이스 → 이슈 자동 편입) | Structure 자동화(JQL 인서터) · BigPicture 스코프 동기화 | 대체 가능 | 방식이 다를 뿐 "범위 자동 관리"는 동등 |
| **프로젝트 칸반** | Jira 보드 | Jira 기본 | 앱이 없어도 됨 |
| **백오피스** (사용자·팀·스킬·역할·등급, 엑셀 업로드) | Tempo Teams/Roles/Skills(Cloud) · ActivityTimeline Functional Teams · BigPicture Resource Admin | 대체 가능 | — |
| **권한 관리** (카탈로그 14키·프로젝트 스코프·**급여 가시성**) | Tempo 권한 스킴 · BigPicture 보안 역할 · ActivityTimeline 7단 역할 | 부분 대체 | 화면 권한은 동등. **급여 가시성 정책(밴드/인원별) + CostAccess 이중 게이팅**은 우리만 |
| **팀 관리형 프로젝트 자동 대응** (이슈 프로퍼티) | Tempo·BigPicture·ActivityTimeline 수동 필드 설정 가이드 | 우리만 | 경쟁사는 사용자 설정 필요 |
| **저장공간 모니터링** (`/backoffice/storage`) | 대응 없음 | 우리만 (Forge 특유) | 경쟁사는 벤더 인프라라 불필요. 우리에겐 1GiB 제약 때문에 필요 |

### 11.2 경쟁사에 있고 우리로 대체되지 않는 것

| 경쟁 기능 | 보유 제품 | 우리 상태 | 비고 |
|---|---|---|---|
| 타임시트(워크로그) 승인 | Tempo · TeamBoard · Be On Time | 없음 | §8.1 1순위 |
| 예산 대비 소진 · EVM | BigPicture · ActivityTimeline · SaaSJet | 없음 | §8.1 |
| 청구 rate · 인보이스 | TeamBoard · SaaSJet · Clockwork · Float · Kantata | 없음 | §8.1 |
| 휴가 요청→승인→잔여일 | ActivityTimeline · TeamBoard | 차감만 있음 | §8.1 |
| 스킬 기반 자동 매칭 | BigPicture "Find the perfect match" · ActivityTimeline Functional Teams | 스킬 데이터만 있음 | RMS 확장 시 필요 |
| 베이스라인 · 크리티컬 패스 · 리소스 레벨링 | Structure Gantt · BigPicture · TeamBoard | 없음 | PPM 영역 — 일부러 안 함 |
| what-if 시나리오 · SAFe · 리스크 | BigPicture | 없음 | 일부러 안 함 |
| 다통화 · 국가별 휴일 스킴 | BigPicture · Tempo · ActivityTimeline | 없음 | 글로벌 진출 시 필요 |
| 자동 타이머 · Slack/캘린더/IDE 연동 | Tempo · Clockwork | 없음 | 편의 기능 |
| AI/Rovo 에이전트 | Tempo | 없음 | 후순위 |

### 11.3 요약

- **갈아타도 되는 것**(대체 가능): 워크로그 입력·인력 명부·가동률·캘린더·대시보드·백오피스 — 경쟁사도 다 있다. 여기서는 이기지 못하고 **지지만 않으면 된다**.
- **갈아타면 잃는 것**(우리만): 급여 환산 원가·급여 가시성 정책·MM 단위 리포트·팀 관리형 자동 대응. 영업 메시지는 여기서 나온다.
- **갈아타야 얻는 것**(경쟁사만): 승인·예산·청구. 이게 §8의 보강 순서다.

---

## 12. 확장 전략 — RMS · PMS · 글로벌

### 12.1 "PMS"와 "RMS"는 한 덩어리가 아니다

| 층 | 대표 제품 | 판단 | 이유 |
|---|---|---|---|
| **RMS — Jira 안 리소스 관리** | ActivityTimeline · Tempo Capacity Planner · TeamBoard | **이길 수 있음** | ActivityTimeline은 Connect·동기화 15분 지연·설치 3.8천. Tempo는 Forge Remote 강제 전환(롤백 불가)·2025년 10~25% 인상·전 Jira 유저 과금·평점 3.7로 **이탈 창구가 열려 있다**. "Tempo 3앱 → Moves 1앱" 임포터가 영업 도구가 된다 |
| **PMS — 글로벌 범용 PPM** | BigPicture · Structure | **하지 않음** | BigPicture가 강해서가 아니라 **Atlassian 자신이 Jira Premium Plans로 로드맵·용량·시나리오를 흡수 중**이라서. 플랫폼 기본 기능과 겹치는 앱은 "그거 Jira에 있는데"가 된다. 기능 폭 경쟁은 자본 싸움이고, 그 카테고리에서 우리 차별점(급여·MM)은 무의미하다 |
| **PMS — 국내 독립형 PMS 대체** | E3PS · WATCH2 · 유시스 | **대체할 수 있음** | 이들의 약점 = Jira 연동 0곳·구축형·이중 입력. "Jira + Confluence + Moves"로 대체 가능. 부족한 건 공공 SI 산출물 쪽 — **산출물 승인(PL→QA→PMO→고객)·주간/월간 보고서 자동 출력·요구사항 추적**. Confluence 승인 앱(`moves-approval`)과 결합하면 채워진다. 단 DC EOL(2029) 전까지 공공은 Cloud 전환 조직만 대상 |

### 12.2 순서

| 단계 | 시장 | 채워야 할 것 |
|---|---|---|
| 1 | SI·공공 니치 (급여 원가 + MM 정산) | 타임시트 승인 · 정산 엑셀 · RoA 배지 · 레퍼런스 1곳 · 가격 |
| 2 | RMS 전체 — ActivityTimeline 추월 · Tempo 대체 | 휴가 승인 · 스킬 기반 배정 추천 · 용량 예측(N주 과부하) · Tempo 임포터 |
| 3 | 국내 PMS 대체 | 산출물 승인 · 보고서 출력 · 요구사항 추적 (Confluence 앱 결합) |
| ✗ | 글로벌 범용 PPM | Atlassian Plans와 싸우는 자리 |

**동시에 하면 전부 못 한다.** BigPicture가 받는 리뷰("설정 복잡·학습곡선·사내 전문가 필요")를 1단계 정체성 없이 2·3을 벌리면 우리가 받는다. 병목은 기능 속도가 아니라 **실사용 검증 루프**(레퍼런스 → 피드백 → 수정)다.

### 12.3 글로벌 — "BigPicture처럼"이 아니라 "MM 정산을 쓰는 나라들로"

MM(man-month) 정산은 한국만의 관행이 아니다. 서구 앱이 시급(hourly)인 것은 **미국 소프트웨어 팀** 관행이지 글로벌 IT 서비스 관행이 아니다.

| 시장 | 단위 | 상황 |
|---|---|---|
| **일본** | 人月 · 人日 | SI 업계 전체가 人月 정산. 한국과 구조가 가장 비슷하고 Jira 보급도 큼. 다국적 앱 중 일본어 UI 드묾 |
| **독일·DACH** | Personentage(PT) | SAP 컨설팅·IT 서비스가 일 단위로 견적·청구. 유럽 최대 Jira 시장 |
| **인도 오프쇼어** | person-month | 글로벌 SI의 원가 단위 자체가 person-month |
| **컨설팅 전반** | day rate | 영국·북유럽 컨설팅은 시급이 아니라 day rate |

Tempo·BigPicture·ActivityTimeline 모두 이 층을 비워 두고 있다. 한국에서 만든 제품이 우연히 이 층에 맞는다.

**글로벌로 가려면 채워야 하는 것**

| 항목 | 현재 | 필요 |
|---|---|---|
| 단가 모델 | 연봉/월급 2종 | 시급·일급·월급·연봉 혼합 + 다통화 + 유효기간 이력 |
| 휴일·근무일 | 단일 공휴일 테이블 | 국가/지역별 스킴 |
| i18n | ko · en | **ja → de** 순 |
| 급여 민감성 (GDPR) | — | 유럽은 "직원 급여를 Jira 앱에"에 거부감이 크다. **가시성 정책 이원화 + 데이터 무유출(RoA)**이 정확히 그 우려에 답한다 — 경쟁사는 시급이라 이 답을 만들 필요가 없었고, 그래서 없다 |
| 영어 지원·문서·리뷰 | — | 마켓플레이스 리뷰는 영어로 쌓여야 한다. 기능이 아니라 운영 |
| 경쟁자 주시 | — | Be On Time(be-on-ti.me)은 유럽 벤더로 추정. 순수 Forge·RoA 포지션을 유럽에서 먼저 잡고 있다 |

**순서: 한국 → 일본 → DACH.** 일본은 人月 문화·SI 구조·Jira 보급이 한국과 겹쳐 제품 변경이 거의 i18n뿐이다. DACH는 단가 모델 일반화·GDPR 대응이 선행돼야 한다.

---

## 13. 시장 데이터

| 항목 | 수치 | 출처 |
|---|---|---|
| Atlassian Marketplace 규모 | 8,000 앱 · 1,800 파트너 · 2021년 이후 약 19% CAGR · 2024 추정 매출 $1.8B | [Aventis Advisors](https://aventis-advisors.com/atlassian-marketplace-ma/) |
| Marketplace 누적 판매 | $6B+ · 300,000+ 고객 | [Atlassian Developer](https://developer.atlassian.com/platform/marketplace/) |
| 수익 배분 (2026) | Forge 앱: 파트너 누적 Forge 매출 $1M까지 0%, 이후 16%→17%(7/1). Connect: 20%→25% | [Atlassian Blog](https://www.atlassian.com/blog/development/updates-to-marketplace-revenue-share-2026) |
| 리소스관리 SW 시장 | USD 6.2B(2025) → 12.8B(2035), CAGR 7.52% (기관별 편차 큼: 5B~13.6B 시작, CAGR 6~13%) | [Spherical Insights](https://www.sphericalinsights.com/blogs/top-25-companies-in-global-resource-management-software-market-2026-2035-expert-view-by-spherical-insights) |
| PM SW 시장 (아태) | $1,669M(2023) → $5,891M(2030), CAGR 19.7% | [Grand View Research](https://www.grandviewresearch.com/horizon/outlook/project-management-software-market/asia-pacific) |
| Jira Data Center EOL | 2026-03-30 신규 판매 종료 · 2028-03-30 갱신 마감 · 2029-03-28 EOL | [Seibert Group](https://us.seibert.group/blog/end-of-life-atlassian-data-center) |
| Jira Cloud 국내 | 2025-10 Standard 약 5%·Premium 약 7.5% 인상, 한국 리전 없음. 오픈소스컨설팅 500여 고객사. **국내 Jira Cloud 고객 수 공식 수치 미확인** | [itgit](https://itgit.co.kr/jira-price/) · [OSCI](https://osci.kr/atlassian) |

---

## 14. 조사 한계

- 마켓플레이스 설치 수·평점은 2026-08-31 스냅샷이며 REST 응답과 페이지 표기가 소폭 다를 수 있다.
- 가격은 마켓플레이스 REST 연간 티어 ÷10 환산값. Tempo Financial Manager·ActivityTimeline Advanced·BigPicture 상세 에디션 단가는 미확인.
- 원가 가시성 권한의 세부 등급은 벤더 문서 공개 범위까지만 확인했다. 실제 동작은 체험판으로 검증해야 한다.
- 국내 PMS는 벤더 페이지 문구 기준이며, 제안서·데모에서 공수 기능이 더 있을 수 있다.
- Runs on Atlassian 적격 여부는 manifest 선언 기준 판단이며 Atlassian 심사 결과가 아니다.

## 15. 참고 — Atlassian 공식 문서

- [Runs on Atlassian 프로그램](https://developer.atlassian.com/platform/marketplace/runs-on-atlassian/)
- [Runs on Atlassian 앱 빌드 가이드](https://developer.atlassian.com/platform/forge/runs-on-atlassian-apps/)
- [Forge 분석 도구 정책](https://developer.atlassian.com/platform/forge/analytics-tool-policy/)
- [Marketplace 소개](https://developer.atlassian.com/platform/marketplace/introduction-to-marketplace/)
- [2026 Marketplace 수익 배분 변경](https://www.atlassian.com/blog/development/updates-to-marketplace-revenue-share-2026)
