# Moves RMS 경쟁 분석 v4 — 마켓플레이스만

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-09-01 |
| 비교 대상 | Atlassian Marketplace 앱 9개 (인력 배정·가동률·원가를 다루는 앱) |
| 가격 기준 | Cloud 11~100명, 1인당 월 요금(달러). 마켓 연간 요금 ÷ 10 |
| 확인 방법 | 마켓 리스팅·가격 API·벤더 문서·리뷰를 직접 확인. 직접 써 보지는 않았다. 우리 기능은 소스 코드로 확인 |
| v3와 차이 | 외부 SaaS(Float·Runn 등)와 국내 PMS를 뺐다. 글로벌 확장 전략, 제도 인용, 출처 각주 123건도 뺐다 — 필요하면 v3에 그대로 있다 |

표 기호: **O** 있음 · **△** 일부만·조건부·확인 못 함 · **X** 없음

---

## 1. 요약

**결론 두 가지.** 공수(MD/MM)를 급여로 바꿔 원가를 내는 앱은 마켓에 없다. 대신 우리는 그 원가를 정산에 쓰게 해 주는 승인 기능이 없다.

| 숫자 | 내용 |
|---|---|
| **0 / 9** | 급여로 원가를 내는 앱. 나머지는 전부 시급이다. ActivityTimeline의 월 정액이 제일 비슷한데, 월 금액을 날짜로 나눌 뿐 급여는 아니다 |
| **3개** | 가장 가까운 경쟁 — ActivityTimeline, TeamBoard, Be On Time. 셋 다 배정·가동률·원가를 한 앱에서 다루지만 MD/MM도 급여도 안 쓴다 |
| **$2.5~3.5** | 경쟁 앱 가격대. 우리 가격은 이 안에서 정하면 된다. 위로는 BigPicture $5.21~5.73, Tempo 3앱 $12.23 |
| **0건** | 우리 설치·리뷰·배지. 제일 작은 경쟁자 Be On Time도 설치 12건에 배지가 있다 |

**같은 조건으로 붙으면 진다. 그런데 그럴 필요가 없다.** "Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 회사"로 대상을 좁히면 Tempo와 BigPicture는 오히려 안 맞는 도구가 된다. 조건은 하나, **타임시트 승인**을 만드는 것.

> **v1~v2에서 고친 것** — "휴가/가용성 없음", "MD 단위는 우리만", "예산/EVM 없음"은 코드 확인 결과 전부 틀렸다. 연차 1MD·반차 0.5MD가 가동률 분모에서 빠지고, `CostCalculator.computeEvm`이 있고, BigPicture에도 man-day 모드가 있다. 경쟁 비교에서 우리 기능은 반드시 코드로 먼저 확인한다.

---

## 2. 경쟁 지형

| 무리 | 제품 | 왜 이 무리인가 |
|---|---|---|
| **직접 경쟁**<br>많이 겹침 | [ActivityTimeline](https://marketplace.atlassian.com/apps/1220860/activity-timeline-resource-capacity-planning-time-tracking) · TeamBoard 2앱([ProScheduler](https://marketplace.atlassian.com/apps/1223423/project-management-resource-planning-gantt-chart-for-jira) + [TimePlanner](https://marketplace.atlassian.com/apps/1224927/team-resource-management-time-tracking-timesheets-for-jira)) · [Resource Management for Jira](https://marketplace.atlassian.com/apps/2338306760/resource-management-for-jira) | 한 앱에서 배정·가동률·원가를 다 다룬다. 우리와 같은 문제를 푼다. 다른 점은 원가를 시급으로 낸다는 것, 승인 기능이 있다는 것 |
| **상위 시장**<br>조금 겹침 | [Tempo](https://marketplace.atlassian.com/apps/6572/timesheets-by-tempo-jira-time-tracking) · [BigPicture](https://marketplace.atlassian.com/apps/1212259/bigpicture-portfolio-resource-management-for-jira) | 설치 1만 건이 넘는 큰 제품. 다만 Tempo는 앱을 3개 사야 하고 Jira 쓰는 사람 전원에게 과금된다. BigPicture는 종합 PPM이라 인력·원가는 곁가지다 |
| **부분 경쟁**<br>거의 안 겹침 | [Time & Cost Tracker](https://marketplace.atlassian.com/apps/1229405/time-cost-tracker-for-jira-timesheet-budget-reports) · [Clockwork Pro](https://marketplace.atlassian.com/apps/1219213/clockwork-pro-for-jira-time-tracking-and-timesheets) · [Planyway](https://marketplace.atlassian.com/apps/1221297/planyway-resource-planning-roadmap-time-tracking-for-jira) · [Capacity Planner](https://marketplace.atlassian.com/apps/1231411/capacity-planner-resource-planning-in-jira) | 원가만, 또는 배정만 하나씩 잘라서 싸게 판다. 가격 하한선을 만들 뿐이다 |

---

## 3. 앱별 정리

설치 수·평점은 2026-08-31 기준. ActivityTimeline만 빼면 10명 이하는 모두 무료다.

### 3.1 ActivityTimeline (Reliex) — 가장 가까운 경쟁자

| 항목 | 내용 |
|---|---|
| 마켓 링크 | [Activity Timeline: Resource Capacity Planning, Time Tracking](https://marketplace.atlassian.com/apps/1220860/activity-timeline-resource-capacity-planning-time-tracking) |
| 지표 | 설치 3,759 · 평점 4.7 · 리뷰 121 · Cloud Fortified · ISO 27001/SOC2 |
| 가격 | **$2.50** (101~250명 $1.75, 251명~ $1.25). 10명 이하 $10 정액 — 무료 구간이 없다 |
| 구조 | Connect 앱 |
| 원가 | 사람마다 원가 단가 + 청구 단가. **월 정액**을 고르면 그 달 날짜 수로 나눠 쓴다(워크로그 기준 아님). 단가 변경 이력 남음 |
| 휴가 | 연간 며칠 → 신청 → 관리자 승인 → 남은 일수. 승인된 것만 용량에서 뺀다 |
| 권한 | "역할 기반"이라고 홍보하지만 공식 역할 문서에 비용 항목이 없다. 확인 못 함 |
| 한국어 | 있음 |
| 약점 | Jira 동기화 15분 넘게 걸림, 초기 화면 혼란, 팀 관리형은 필드 수동 설정 |

**판단** — 한국어도 되고 휴가 승인도 있고 가격도 같다. 우리가 앞서는 건 급여 원가와 Forge뿐이다.

### 3.2 TeamBoard ProScheduler + TimePlanner (DevSamurai)

| 항목 | 내용 |
|---|---|
| 마켓 링크 | [ProScheduler — Project Management, Resource Planning & Gantt Chart for Jira](https://marketplace.atlassian.com/apps/1223423/project-management-resource-planning-gantt-chart-for-jira)<br>[TimePlanner — Timesheets, Time Tracking & Capacity Resource Planning](https://marketplace.atlassian.com/apps/1224927/team-resource-management-time-tracking-timesheets-for-jira) |
| 지표 | ProScheduler 설치 3,195 · 4.3 / TimePlanner 설치 1,332 · 4.8 · Cloud Fortified |
| 가격 | $1.75 + $1.75 = **$3.50** (벤더 사이트는 $1.25/$1.50로 다르게 적혀 있다 — 구버전으로 보임) |
| 구조 | Forge 기반. Runs on Atlassian 배지는 확인 못 함 |
| 원가 | 사람·그룹·프로젝트·프로젝트그룹 **4단계 시급**. 기간별 이력, 계획 대 실제 비용, 인보이스 |
| 권한 | 비용 관리자(수정) / 비용 조회자(열람) 2단 |
| 승인 | 휴가 승인 + 타임시트 승인 둘 다 있음 |
| 배정 | 용량 기반 배정, 간트(의존성·베이스라인·크리티컬 패스), 포트폴리오 |

**판단** — 정산 흐름이 제일 잘 갖춰져 있다. 우리가 없는 승인과 인보이스를 다 갖췄다. 대신 급여도 MD/MM도 없고 앱을 2개 사야 한다.

### 3.3 Resource Management for Jira (Be On Time)

| 항목 | 내용 |
|---|---|
| 마켓 링크 | [Resource Management for Jira (Capacity, Timesheet, Approval)](https://marketplace.atlassian.com/apps/2338306760/resource-management-for-jira) |
| 지표 | 설치 **12** (08-31 기준. 09-01 다시 보니 11) · 평점 5.0 · 리뷰 2 · "New" · **Runs on Atlassian 배지** · v4.27(2026-08-28) |
| 가격 | **$2.50 정액** (15~1,000명 같은 값) |
| 구조 | 순수 Forge. "데이터가 Atlassian 밖으로 안 나간다" — 우리와 같은 메시지를 먼저 올렸다 |
| 벤더 | 아르메니아 예레반. 1인 사업자 + 파트너 법인 |
| 기능 | 인력 요청, 과부하 표시, 휴가 셀프 신청, 타임시트 승인, 비용 포함 엑셀 출력(단가 방식 확인 못 함), 계층형 팀 |

**판단** — 분기마다 지켜볼 곳. 아직 설치 12건이지만 업데이트가 빠르다.

### 3.4 Tempo (Tempo Software)

| 항목 | 내용 |
|---|---|
| 마켓 링크 | [Timesheets](https://marketplace.atlassian.com/apps/6572/timesheets-by-tempo-jira-time-tracking) · [Capacity Planner](https://marketplace.atlassian.com/apps/1211881/capacity-planner-jira-team-resource-management-tempo) · [Financial Manager](https://marketplace.atlassian.com/apps/1221748/financial-manager-jira-project-cost-tracking-tempo) · [Structure](https://marketplace.atlassian.com/apps/34717/structure-by-tempo-jira-portfolio-management-ppm) |
| 구성 | Capacity Planner + Timesheets + Financial Manager + Structure — **기능마다 앱을 따로 산다** |
| 지표 | Timesheets 설치 27,122 · 4.1 / Capacity Planner 9,721 · 3.7 / Structure 13,081 · 4.6 / Financial Manager 3,199 · 3.8 |
| 가격 | Capacity Planner $3.99 + Timesheets $5.21 + Financial Manager $3.03 = **$12.23**. Structure $3.52~4.73은 여기에 또 별도 (앱별 상세는 `Tempo_BigPicture_앱별분석.md`) |
| 과금 | Tempo 라이선스 수가 Jira 라이선스 수와 같아야 한다 — **일부 팀만 쓸 수 없다.** 2025-09 10~25% 인상 |
| 구조 | Forge Remote — 화면만 Atlassian, **서버는 벤더 쪽**. 한 번 바꾸면 되돌릴 수 없다 |
| 원가 | 시급 방식, 급여 저장 없음. Timesheets를 같이 사야 원가가 나온다. EVM은 클라우드에 없다 |
| 권한 | 전역 3단 + 프로젝트 역할 3단 |
| 한국어 | 없음 |
| 약점 | 평점 3.7, "설치했는데 아무것도 안 보인다" 리뷰, 워크로그를 앱 이름으로 기록해 작성자 검색이 깨진다는 리뷰(2026-06) |

**판단** — 고객이 빠져나올 이유가 가장 많은 곳이다. 강제 과금 + 연이은 인상 + 되돌릴 수 없는 구조 변경이 겹쳐 있다.

### 3.5 BigPicture (Appfire)

| 항목 | 내용 |
|---|---|
| 마켓 링크 | [BigPicture – Portfolio & Resource Management for Jira](https://marketplace.atlassian.com/apps/1212259/bigpicture-portfolio-resource-management-for-jira) |
| 지표 | 설치 10,952 · 평점 3.9 · 리뷰 504 · Cloud Fortified |
| 가격 | Standard **$5.21** / Advanced **$5.73**. 원가(Financials)는 Advanced에만 있다. 갱신가는 초기가의 50% |
| 구조 | Appfire AWS 6개 지역에 저장. 지역 선택은 최상위 요금제만 → Runs on Atlassian 아님 |
| 공수 | 단위를 시간 / **man-day** / 퍼센트 / 스토리포인트 중에 고른다 — **MD 단위는 우리만 있는 게 아니다.** 다만 원가는 시급 |
| 원가 | Financials 모듈(클라우드는 Advanced만). 시간당 단가, 예상 예산, 실제 비용, 계획 대 실제 |
| 권한 | 앱 레벨 2단(조회/관리) + Box별 보안 역할 |
| 한국어 | 없음 |
| 약점 | 데이터 많으면 느림, 설정 복잡("사내에 Jira 전문가 필요"), 무료 구간 넘으면 전원 과금 |

**판단** — 종합 PPM이라 정면으로 붙을 상대가 아니다. what-if·SAFe 같은 기능은 Jira Premium이 흡수하는 중이다.

### 3.6 부분 경쟁 4개

| 앱 | 가격 | 있는 것 | 없는 것 |
|---|---|---|---|
| [**Time & Cost Tracker**](https://marketplace.atlassian.com/apps/1229405/time-cost-tracker-for-jira-timesheet-budget-reports) (SaaSJet)<br>설치 530 · 4.6 · Forge | $1.50 | "워크로그 × 단가 + **직접비**" 계산, 예산·EVM, 그룹별 권한 분리 | 배정·가동률·휴가·간트. 비용 리포트 전용 |
| [**Clockwork Pro**](https://marketplace.atlassian.com/apps/1219213/clockwork-pro-for-jira-time-tracking-and-timesheets) (HeroCoders)<br>설치 4,627 · 4.6 · Forge | $1.30 | 시간당 원가 + 청구 단가, 자동 타이머, **타임시트 승인** | 기간별·프로젝트별 단가(벤더가 안 된다고 명시), 배정·가동률·휴가·간트 |
| [**Planyway**](https://marketplace.atlassian.com/apps/1221297/planyway-resource-planning-roadmap-time-tracking-for-jira)<br>설치 1,468 · 4.6 · Forge | $3.00 | 배정, 계획 대비 용량 가동률, 휴가·공휴일, 타임라인, 포트폴리오, 타임시트 | **원가·단가 전혀 없음** |
| [**Capacity Planner**](https://marketplace.atlassian.com/apps/1231411/capacity-planner-resource-planning-in-jira) (RVS Softek)<br>설치 502 · 4.4 · Connect | $0.50 | 스프린트·버전 배정, 가동률 대시보드, 휴가·공휴일, Tempo 연동 | 원가·간트 |

> Time & Cost Tracker는 원가 계산만 놓고 보면 **우리보다 정확한 부분**이 있다 — 실제 워크로그를 쓰고 직접비도 넣는다.

> **Clockwork Pro에 타임시트 승인이 생겼다 (2026-09-01 확인).** 리스팅에 "Approve Timesheets in One Click — Review, approve or reject timesheets with ease"가 올라와 있다. **$1.30짜리 앱에도 승인이 붙었다**는 뜻이라, 승인을 "큰 앱만 가진 기능"으로 보면 안 된다. §7의 1순위 판단이 더 급해졌다. 리스팅 문구만 본 것이고 실제 동작은 확인하지 않았다.

---

## 4. 기능 비교표

직접 경쟁 3개와 큰 제품 2개만 넣었다. 부분 경쟁 앱은 기능이 하나뿐이라 뺐다.

| 기능 | Moves RMS | Tempo | BigPicture | ActivityTimeline | TeamBoard | Be On Time |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Runs on Atlassian | △ 조건 충족 | X 서버 외부 | X AWS | X Connect | △ 모름 | **O 배지 있음** |
| 인력 배정·용량 | O | O | O | O | O | O |
| 가동률 | O MD 기준 | O 시간 기준 | O | O | O | △ 과부하만 |
| MD/MM 공수 | **O** | X 시간 | △ man-day | X | X | X |
| **급여로 원가 계산** | **O 연봉·월급** | X 시급 | X 시급 | △ 월 정액 | X 시급 | △ 모름 |
| 원가 열람 권한 세분화 | **O 정책+권한** | △ 3단 | △ 2단 | △ 모름 | △ 2단 | △ 팀 범위 |
| 휴가·공휴일 용량 차감 | O | O | O | O | O | O |
| 휴가 승인·잔여일 | **X** | △ 모름 | △ 모름 | O | O | △ 신청만 |
| **타임시트 승인** | **X** | O | X | X | O | O |
| 예산·EVM | △ 근사치 | △ 예산만 | O | O 예산 | △ 계획 대 실제 | △ |
| 간트 | O | △ 앱 따로 | O | △ 타임라인 | O | △ 모름 |
| 전사 포트폴리오 | O | △ 앱 따로 | O | △ | △ | △ |
| 팀 관리형 프로젝트 | **O 자동** | △ 수동 | △ 수동 | △ 수동 | △ 모름 | △ 모름 |
| 한국어 | O | X | X | O | △ 모름 | △ 모름 |

---

## 5. 가격

Cloud 11~100명 기준, 1인당 월 요금(달러).

| 앱 | 가격 | 비고 |
|---|---|---|
| Capacity Planner (RVS) | $0.50 | 스프린트 용량만 |
| Clockwork Pro | $1.30 | 시간 기록 + 원가 |
| Time & Cost Tracker | $1.50 | 비용 리포트만 |
| **ActivityTimeline** | **$2.50** | 직접 경쟁 · 올인원 |
| **Resource Management for Jira** | **$2.50** | 직접 경쟁 · 인원수 무관 같은 값 |
| Planyway | $3.00 | 원가 없음 |
| **TeamBoard** (2앱) | **$3.50** | 직접 경쟁 |
| BigPicture | $5.21 / $5.73 | Standard / Advanced. 원가는 Advanced에만 |
| Tempo (3앱) | **$12.23** | Capacity Planner + Timesheets + Financial Manager. Structure는 또 별도 |
| **Moves RMS** | **미정 → $2.5~3.5** | 직접 경쟁 구간 |

Tempo는 여기에 더해 **Jira를 쓰는 사람 전원**에게 과금한다. 일부 팀만 쓰려 해도 전사 라이선스를 사야 한다. 그래서 실제 비용 차이는 표보다 크다.

**배수는 상대에 따라 다르다.** 한 앱 $2.5~3.5 기준으로 **Tempo 3앱 대비 3.5~5배**, Structure까지 넣으면 4.5~6배다. 그런데 **BigPicture 대비는 1.6~2.3배**로 3배가 안 된다. "비용 3배" 메시지는 Tempo에만 쓸 수 있다. BigPicture 상대로는 가격이 아니라 급여 원가·한국어·데이터 위치로 싸워야 한다.

---

## 6. 우리가 나은 점

9개를 다 본 뒤에 남은 것은 다섯 가지다.

**1. 급여로 원가를 내고, 볼 사람을 가린다**
다른 앱은 전부 시급이다. 급여를 넣어 쓰는 앱이 없다. 여기에 "등급 밴드냐 개인별이냐" 정책과 `CostAccess` 권한을 **따로 두 번 확인**한다. 경쟁 앱의 관리자/조회자 2단보다 촘촘하다.

**2. 공수를 원가까지 이어 준다**
BigPicture에도 man-day 모드는 있다. **MD 단위 자체는 우리 것이 아니다.** 다만 그 공수를 급여로 바꿔 프로젝트 원가와 EVM까지 잇는 곳은 우리뿐이다.

**3. 팀 관리형 프로젝트가 그냥 된다**
Tempo·BigPicture·ActivityTimeline은 프로젝트마다 필드를 직접 넣으라고 안내한다. 우리는 이슈 프로퍼티로 우회해서 설정 없이 동작한다.

**4. 데이터가 Atlassian 밖으로 안 나간다**
Tempo는 서버가 벤더 쪽, BigPicture는 Appfire AWS, ActivityTimeline은 Connect다. 우리는 순수 Forge라 데이터가 그대로 남고 저장 지역도 Jira를 따라간다. 공공·금융 보안 심사에서 당락이 갈리는 항목이다. 같은 자리에 있는 건 Be On Time뿐이다.

**5. 한국어, 그리고 앱 하나**
한국어가 되는 건 ActivityTimeline 말고 없다. 배정·가동률·진척·원가·간트·포트폴리오가 한 앱에 들어 있어서, 앱을 2~3개 사야 하는 쪽과 비교하기 좋다.

---

## 7. 우리에게 없는 것

원가는 나오는데, 그 원가를 정산 근거로 만들어 주는 단계가 없다.

| 없는 것 | 왜 문제인가 | 있는 곳 |
|---|---|---|
| **타임시트 승인** | 워크로그가 곧 원가인데 누가 승인했는지가 없다. 정산 근거로 못 쓴다. 코드에 승인 기능이 아예 없다 | Tempo · TeamBoard · Be On Time · **Clockwork Pro($1.30)** |
| **예산과 실제 비용** | EVM은 있지만 ① 사용자가 넣은 총예산이 비용 분석에 연결 안 됨 ② 실제 비용을 워크로그가 아니라 날짜 비율로 잡음 ③ 직접비 없음 | BigPicture · ActivityTimeline · SaaSJet |
| **휴가 승인·잔여 연차** | 차감은 잘 된다(연차 1MD, 반차 0.5MD). 없는 건 신청 → 승인 → 남은 일수 흐름 | ActivityTimeline · TeamBoard |
| **청구 단가와 내부 원가 분리** | 외주는 받는 단가와 나가는 급여를 나눠 마진을 본다. 우리는 청구 개념이 없다 | TeamBoard · SaaSJet · Clockwork |
| **마켓 실적** | 설치·리뷰·배지 없음, 가격 미정, 기능 상당수가 실제 환경 검증 전 | 제일 작은 경쟁자도 설치 12건 + 배지 |
| **Tempo에서 옮겨 오는 길** | 노리는 회사 상당수가 Tempo를 쓴다(설치 2.7만). 팀·단가를 가져오는 도구가 없으면 나오려는 고객을 못 받는다 | — |

### 만드는 순서

1. **타임시트 승인** — 없으면 결국 Tempo를 같이 쓰게 된다. $1.30짜리 Clockwork Pro에도 붙은 기능이라 "우리는 없다"가 곧 약점으로 보인다
2. **마켓 등록·배지** — Be On Time이 먼저 가져갔다
3. **예산·실제 비용** — 워크로그 기준 + 직접비
4. **휴가 승인** — 차감은 이미 된다
5. **청구 단가 분리** — 마진 계산
6. **Tempo 가져오기** — 넘어오는 고객 받기

> **일부러 안 하는 것** — SAFe, what-if 시뮬레이션, AI 예측, 리스크 관리, 리소스 레벨링. BigPicture 영역이고 Jira Premium이 흡수하는 중이다. 우리가 노리는 고객은 찾지 않는다.

---

## 8. 결론

### 같은 조건이면 지는 이유

- **실적** — 설치 2.7만 / 1.1만 건에 리뷰 수백 개. 우리는 0이다.
- **기능 수** — 타임시트 승인, 예산, 휴가 승인에 Slack·캘린더 연동까지 붙어 있다.
- **범용성** — 어느 업종이든 쓸 수 있게 만들었다. 우리는 "급여를 넣고 MD로 정산한다"는 전제가 깔려 있다.

### 그들이 못 하는 이유

- **급여 원가** — 못 만드는 게 아니라 안 만든다. 받는 단가를 다루지, 직원 연봉을 앱에 넣을 생각을 안 한다.
- **가격** — Tempo는 앱 3개($12.23)에 전 직원 과금. 우리가 한 앱 $2.5~3.5면 3.5~5배 차이다. 단 BigPicture($5.73 단독)와는 2배 남짓이라 가격만으로는 안 된다.
- **데이터 위치** — 둘 다 데이터가 벤더 서버로 나간다. 심사에서 여기서 걸린다.
- **한국어** — 둘 다 없다. 가동률·MM·투입공수를 그대로 쓰는 화면이 없다.

### 판단

**대상을 좁히면 이기고, 넓히면 진다.** "Jira를 쓰면서 MM으로 정산하고 급여 원가를 보는 회사"라면 Tempo와 BigPicture가 오히려 안 맞는다. 시급을 억지로 넣어야 하고, 앱을 3개 사야 하고, 한국어가 없고, 데이터가 밖으로 나간다.

조건은 하나다. **타임시트 승인**이 없으면 이 고객들도 결국 Tempo를 옆에 붙이게 되고, 그러면 "앱 하나로 끝난다"는 말이 무너진다.

---

## 9. 확인 한계

- 설치 수·평점은 2026-08-31 스냅샷. 페이지 표기와 API 값이 조금 다를 수 있다.
- 가격은 마켓 연간 요금 ÷ 10. Tempo Financial Manager와 ActivityTimeline Advanced 단가는 확인 못 했다.
- 원가 권한의 세부 동작은 벤더 문서에 나온 데까지만 확인했다. 직접 써 보지 않았다.
- Runs on Atlassian 적합 여부는 manifest 기준 판단이고 Atlassian 심사 결과가 아니다.
- ActivityTimeline 월 정액을 "급여용"이라고 쓴 건 벤더 블로그다. 공식 문서에는 "월 고정액을 날짜로 나눠 쓰며 워크로그 기준이 아니다"까지만 나온다.

**출처 123건과 코드 근거 16건은 `Moves_RMS_경쟁분석_v3.md`에 그대로 있다.** 외부 SaaS·국내 PMS·글로벌 확장 전략도 v3에 남아 있다.
