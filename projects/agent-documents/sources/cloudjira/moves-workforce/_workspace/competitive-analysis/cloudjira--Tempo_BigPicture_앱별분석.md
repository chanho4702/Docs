# Tempo 4개 앱 · BigPicture 앱별 분석

경쟁 분석 v4의 "상위 시장" 두 곳을 앱 단위로 쪼갠 문서다. v4는 Tempo를 한 덩어리로 다뤘는데, 실제로는 앱 4개가 따로 팔리고 서로 의존한다. 그 구조와 값을 앱마다 확인했다.

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-09-01 |
| 대상 | Timesheets · Capacity Planner · Financial Manager · Structure (이상 Tempo) / BigPicture (Appfire) |
| 확인 방법 | 마켓플레이스 리스팅 + 가격 REST(`/rest/2/addons/{key}/pricing/cloud/live`) 직접 조회. 직접 써 보지는 않았다 |
| 가격 표기 | **1인당 월 정가**(11~100명 구간). 연간 요금은 월 정가의 정확히 10배라 `연간 ÷ 10`으로 환산했다 — 아래 「가격 환산 주의」 참조 |

> ## ⚠ 가격 환산 주의 — v3·v4의 BigPicture 값이 틀렸다
>
> Atlassian Cloud 앱은 **연간 요금 = 월 정가 × 10**이다(2개월분 할인). 가격 REST의 10명 이하 구간이 월 $10.00 / 연 $100.00으로 나오는 것으로 확인했다.
>
> 그런데 v3·v4는 BigPicture만 `연간 ÷ 12`로 계산해 **$4.34 / $4.78**로 적어 놨다. 같은 문서의 다른 앱은 전부 ÷10이다. 올바른 값은 **$5.21(Standard) / $5.73(Advanced)** 이다.
>
> 이 오류 때문에 v4의 "우리가 한 앱 $2.5~3.5면 3배 차이" 문장도 다시 봐야 한다 — 실제 배수는 아래 §6에 다시 계산했다.
>
> Financial Manager 단가는 v3·v4에서 "확인 못 함"이었는데 이번에 확인했다: **$3.03**.

---

## 0. 한눈에

| 앱 | 설치 | 평점 | 월 정가 | 우리 기능 중 겹치는 것 |
|---|---:|---:|---:|---|
| **Timesheets** (Tempo) | 27,118 | 4.1 (896) | $5.21 | 내 워크로그, 타임시트 |
| **Capacity Planner** (Tempo) | 9,717 | 3.7 (200) | $3.99 | 인력 배정, 가동률 |
| **Financial Manager** (Tempo) | 3,192 | 3.8 (46) | $3.03 | 비용 분석 |
| **Structure** (Tempo) | 13,068 | 4.6 (408) | $3.52 / $4.73 | 전사 포트폴리오, (간트는 또 별도 앱) |
| **BigPicture** (Appfire) | 10,955 | 3.9 (504) | $5.21 / $4.78→**$5.73** | 배정·가동률·원가·간트·포트폴리오 전부 |

다섯 개 모두 **Cloud Fortified**이고 **Runs on Atlassian은 없다.** 다섯 개 모두 **한국어가 없다.**

가장 큰 차이는 포장 방식이다. **Tempo는 기능을 쪼개서 4개로 팔고, BigPicture는 한 앱에 다 넣어 판다.** 우리 제품 모양은 BigPicture 쪽에 가깝다.

---

## 1. Timesheets by Tempo

[마켓 링크](https://marketplace.atlassian.com/apps/6572/timesheets-by-tempo-jira-time-tracking) · Tempo Software (Platinum Partner)

| 항목 | 내용 |
|---|---|
| 지표 | 설치 **27,118** · 평점 4.1 · 리뷰 896 · Cloud Fortified |
| 가격 | **$5.21** (연 $52.10) |
| 호스팅 | Cloud + Server 9.x + Data Center 11.x |
| 최근 버전 | 11.1.0 (2026-07-24) |
| 언어 | 영어·프랑스어·스페인어·독일어·포르투갈어·러시아어 (**한국어 없음**) |

**무엇을 하는 앱인가** — Tempo 제품군의 뿌리이자 가장 많이 깔린 앱이다. 워크로그를 걷고, 청구 가능/불가능 시간을 나누고, 프로젝트·고객별로 리포트를 낸다. 여기에 **승인 워크플로와 기간 잠금**이 붙어 있다.

**우리와 겹치는 것** — 내 워크로그 화면, 워크로그 CSV 추출. 우리도 워크로그를 걷어 MD로 환산한다.

**우리에게 없는 것** — **타임시트 승인과 기간 잠금.** 승인된 시간만 원가로 넘긴다는 개념 자체가 우리에겐 없다. AI 자동 시간 추적, Google Calendar·Outlook·Slack·IDE 연동, Rovo AI 에이전트 연동도 없다(편의 기능이라 급하지는 않다).

**핵심 구조** — 리스팅에 **"70% of customers add these products with Timesheets: Capacity Planner, Financial Manager, Custom Charts, Structure PPM"** 이라고 적혀 있다. Tempo가 스스로 "이건 시작점이고 나머지를 더 사라"고 말하는 셈이다.

**판단** — 설치 2.7만 건은 이 시장에서 압도적이다. **우리 타겟 조직 상당수가 이미 이 앱을 쓰고 있다고 봐야 한다.** 정면으로 대체하려 들기보다, 워크로그를 이 앱이 걷고 우리가 급여 원가만 얹는 그림도 가능한지 따져 볼 값어치가 있다.

---

## 2. Capacity Planner by Tempo

[마켓 링크](https://marketplace.atlassian.com/apps/1211881/capacity-planner-jira-team-resource-management-tempo) · Tempo Software

| 항목 | 내용 |
|---|---|
| 지표 | 설치 9,717 · 평점 **3.7** · 리뷰 200 · Cloud Fortified |
| 가격 | **$3.99** (연 $39.90) |
| 호스팅 | Cloud + Server + Data Center |
| 최근 버전 | 11.1.0 (2026-07-24) |

**무엇을 하는 앱인가** — 우리 자원관리 화면과 가장 직접 겹치는 앱이다. 프로젝트·이슈 단위 계획, 가용성·역할·스킬 기반 **인력 요청**, 휴일·업무량 설정, 계획 대 실제 시간 비교.

**주목할 것 두 가지.**

첫째, **계획 승인 워크플로**가 있다. 그리고 **다른 팀에 시간을 요청**하는 기능이 있다. 우리 작업 배정에는 요청·승인 개념이 없고 관리자가 그냥 꽂는다. 조직이 커지면 이 차이가 드러난다.

둘째, **스킬 기반 인력 요청**이다. 우리는 스킬 데이터를 갖고 있지만 배정 후보를 스킬로 추천하지는 않는다.

**우리가 나은 것** — 가동률 분모가 MD 기준이라 MM 정산과 언어가 같다. Tempo는 시간·FTE 기준이다. 그리고 이 앱만으로는 **계획 대 실제를 볼 수 없다** — Timesheets를 같이 사야 한다.

**약점** — **평점 3.7은 Tempo 제품군에서 가장 낮다.** 리뷰에 "After install nothing works. Global permissions are set. Nothing visible, no settings, no config."(2025-06-25) 같은 게 남아 있다. 설치 후 아무것도 안 보인다는 불만이다.

**판단** — 설치 9,717건에 평점 3.7. **불만을 가진 사용자가 1만 건 가까이 깔려 있다는 뜻이다.** Tempo 이탈 창구 중 가장 열려 있는 지점이 여기다.

---

## 3. Financial Manager by Tempo

[마켓 링크](https://marketplace.atlassian.com/apps/1221748/financial-manager-jira-project-cost-tracking-tempo) · Tempo Software · 구 이름 Cost Tracker

| 항목 | 내용 |
|---|---|
| 지표 | 설치 **3,192** · 평점 3.8 · 리뷰 46 · Cloud Fortified |
| 가격 | **$3.03** (연 $30.30) — v3·v4에서 "확인 못 함"이던 값 |
| 호스팅 | **Cloud 전용** (Tempo 4개 중 유일) |
| 최근 버전 | 6.1.0 (2026-07-24) |

**무엇을 하는 앱인가** — 우리 비용 분석 탭과 정면으로 겹치는 앱이다. 원가 모델은 리스팅 원문이 명확하다:

> "Set cost and billing rates — Define an **hourly cost** and if applicable, **billing rate** for each member. You can also set a default cost and billing rate that automatically applies to all members of the project team."

**사람마다 시간당 원가와 시간당 청구 단가를 넣는다.** 여기에 역할별 전역 단가, 유효 날짜가 있는 단가 이력, 한 사람이 프로젝트마다 다른 역할을 갖는 구조까지 있다.

**우리와의 차이 — 여기가 핵심이다.** 우리는 급여(연봉·월급)를 넣고 투입 기간으로 환산한다. Tempo는 시급을 넣고 워크로그 시간을 곱한다. **"직원 연봉을 앱에 넣는다"는 발상 자체가 없다.** 기능이 부족해서가 아니라 그렇게 설계하지 않은 것이다.

대신 Tempo에는 **청구 단가**가 있고 우리에겐 없다. 마진을 보려면 필요한 축이다.

**구조적 약점** — 리스팅에 **"Integrate with Capacity Planner & Timesheets to track forecast accuracy & approve project-specific hours"** 라고 적혀 있다. 시간이 있어야 원가가 나오니 **Timesheets 없이는 반쪽이다.**

**설치 수를 보라** — Timesheets 27,118건 대비 **Financial Manager는 3,192건, 12%다.** Tempo를 쓰는 조직 10곳 중 9곳은 원가를 안 보고 있다는 뜻이다. 원가까지 가는 조직이 그만큼 적다는 신호이기도 하고, Tempo의 원가 기능이 그만큼 안 팔린다는 신호이기도 하다.

**약점** — 평점 3.8에 리뷰가 46건뿐이다. 남은 불만: "quite limited. As this is a paid software, one would expect much more frequent release of features"(2025-06-04), "Does not work at all — It loads a blank screen"(2025-05-30), "it feels too separated and hard to get around"(2025-07-23, UI 개편 후).

**판단** — 우리가 정면으로 이길 수 있는 유일한 Tempo 앱이다. 시장이 작고(3,192건), 평이 나쁘고(3.8/46건), 원가 모델이 우리와 다른 전제 위에 있다.

---

## 4. Structure by Tempo

[마켓 링크](https://marketplace.atlassian.com/apps/34717/structure-by-tempo-jira-portfolio-management-ppm) · Tempo Software

| 항목 | 내용 |
|---|---|
| 지표 | 설치 13,068 · 평점 **4.6** · 리뷰 408 · Cloud Fortified |
| 가격 | **$3.52**(Standard) / **$4.73**(Advanced) |
| 호스팅 | Cloud + Server + Data Center |
| 최근 버전 | 8.7.0 (2026-08-31) |

**무엇을 하는 앱인가** — 이슈를 계층으로 묶어 스프레드시트처럼 보여 주는 앱이다. 계층 뷰, 데이터 컬럼 설정, 구조를 자동으로 만드는 규칙, 실시간 집계, 인라인 편집.

**우리와 겹치는 것** — 전사 포트폴리오 대시보드, 그리고 작업관리의 트리 뷰.

**중요한 사실** — **간트가 이 앱에 없다.** "Gantt Charts for Structure PPM"이라는 **또 다른 별도 앱**을 사야 한다. Tempo에서 간트까지 가려면 앱이 5개가 된다.

**판단** — Tempo 4개 중 평점이 가장 높다(4.6/408건). 잘 만든 앱이고 정면으로 붙을 대상이 아니다. 다만 우리가 노리는 "MM 정산" 문제를 푸는 앱은 아니다. 이슈를 정리해서 보여 주는 앱이지 원가·공수 앱이 아니다.

---

## 5. BigPicture (Appfire)

[마켓 링크](https://marketplace.atlassian.com/apps/1212259/bigpicture-portfolio-resource-management-for-jira) · Appfire (Platinum Partner)

| 항목 | 내용 |
|---|---|
| 등록명 | BigPicture PPM & Strategic Portfolio Management for Jira |
| 지표 | 설치 10,955 · 평점 3.9 · 리뷰 504 · Cloud Fortified |
| 가격 | **$5.21**(Standard) / **$5.73**(Advanced) ← v4의 $4.34/$4.78은 환산 오류 |
| 최근 버전 | 8.9.0 (2026-08-17) |
| 데이터 | Appfire AWS 6개 지역. 지역 선택은 최상위 요금제만 → **Runs on Atlassian 아님** |

**에디션 구분이 중요하다.**

| | 들어 있는 것 |
|---|---|
| **Standard** | 포트폴리오·프로그램 개요, 간트 타임라인, **리소스·용량 관리**, WBS, 리스크 관리 |
| **Advanced** | Standard 전부 + 전략 목표·OKR, **재무 관리(Financials)**, 전략 우선순위, 고급 리포트 |

**원가를 보려면 Advanced($5.73)여야 한다.** 리소스·용량은 Standard에 들어 있다.

**우리와 겹치는 것** — 거의 전부다. 배정·가동률·원가·간트·포트폴리오가 한 앱 안에 있다. **모양으로 보면 우리와 가장 비슷한 제품이다.**

**공수 단위** — 시간 / **man-day** / 퍼센트 / 스토리포인트 중에 고른다. **MD 단위는 우리만 있는 게 아니다.** 다만 원가는 시급으로 계산한다. 즉 BigPicture는 **공수는 MD로 세면서 돈은 시급으로 센다.** 그 사이를 잇는 게 우리 자리다.

**우리와 다른 것** — 원가가 시급이고 급여가 없다. 한국어가 없다. 데이터가 Appfire AWS로 나간다. 그리고 SAFe·OKR·전략 우선순위·리스크처럼 **우리가 일부러 안 하는 영역**이 제품의 절반이다.

**약점** — 평점 3.9에 리뷰 504건. 남은 불만은 설정 복잡성에 몰려 있다: "not a straightforward configuration, takes lots of time", "The help materials are not helpful or clear"(2025-07-31).

**판단** — 종합 PPM이라 정면 대결 상대는 아니다. 다만 **"한 앱에 다 들어 있다"는 우리 메시지를 BigPicture도 똑같이 쓸 수 있다.** 우리 차별점은 "한 앱"이 아니라 "급여 원가 + 한국어 + 데이터 무유출" 쪽에 있어야 한다.

---

## 6. 조합 비용 — 우리 기능을 대체하려면 얼마인가

우리 제품이 하는 일(배정·가동률·워크로그·원가·간트·포트폴리오)을 기준으로 필요한 앱을 묶었다. 1인당 월 정가.

| 조합 | 구성 | 합계 |
|---|---|---:|
| **Tempo 최소** (배정+워크로그+원가) | Capacity Planner $3.99 + Timesheets $5.21 + Financial Manager $3.03 | **$12.23** |
| **Tempo + 포트폴리오** | 위 + Structure Standard $3.52 | **$15.75** |
| **Tempo 전부** (간트까지) | 위 + Gantt Charts for Structure | $15.75 초과 |
| **BigPicture 단독** | Advanced 한 개 | **$5.73** |
| **Moves RMS** (목표) | 한 개 | **$2.5~3.5** |

**여기서 v4의 문장을 고쳐야 한다.** v4는 "Tempo는 3앱 $9+, BigPicture는 $4.3~4.8, 우리가 $2.5~3.5면 3배 차이"라고 썼는데, 실제로는:

- **Tempo 대비 약 3.5~5배** (3앱 $12.23 기준). 4앱이면 4.5~6배
- **BigPicture 대비 약 1.6~2.3배** — 3배가 아니다

즉 **"TCO 3배" 메시지는 Tempo에만 쓸 수 있고, BigPicture에는 못 쓴다.** BigPicture 상대로는 가격이 아니라 급여 원가·한국어·데이터 위치로 싸워야 한다.

여기에 **Tempo는 Jira 쓰는 사람 전원에게 과금**되는 조건이 붙는다. 일부 팀만 쓰려 해도 전사 라이선스를 사야 하므로 실제 격차는 위 계산보다 더 벌어진다. BigPicture에는 이 조건이 없다.

---

## 7. 우리에게 주는 것

**1. 진짜 경쟁 상대는 BigPicture Advanced 한 개다.**
Tempo는 4개를 조립해야 우리와 같은 모양이 되고 그래서 비싸다. BigPicture는 $5.73 한 개로 우리와 같은 모양을 만든다. 가격 메시지를 쓸 때 상대를 구분해야 한다.

**2. Tempo의 약한 고리는 Capacity Planner와 Financial Manager다.**
Capacity Planner는 설치 9,717건에 평점 3.7 — 불만을 가진 사용자가 크게 깔려 있다. Financial Manager는 설치가 Timesheets의 12%에 불과하고 평점 3.8에 리뷰 46건이다. **Timesheets(2.7만·4.1)와 Structure(1.3만·4.6)는 건드리지 않는 게 맞다.**

**3. 승인은 이제 기본값에 가깝다.**
Timesheets에 타임시트 승인과 기간 잠금이, Capacity Planner에 계획 승인이 있다. 여기에 $1.30짜리 Clockwork Pro에도 승인이 붙었다(v4 §3.6 참조). **승인 없는 원가 앱은 점점 설명하기 어려워진다.**

**4. 우리에게 없는 축 두 개가 반복해서 나온다.**
하나는 **청구 단가**(Financial Manager, BigPicture Financials, TeamBoard 모두 보유), 다른 하나는 **요청 → 승인 흐름**(Capacity Planner의 인력 요청·계획 승인, Timesheets의 타임시트 승인). 둘 다 v4 §7에 이미 들어 있는 항목이고, 이 문서는 그게 상위 시장에서 얼마나 표준인지를 다시 확인해 준다.

**5. MD는 방어선이 아니다.**
BigPicture가 man-day 모드를 갖고 있다. 우리 방어선은 **급여 → 원가 환산**과 **급여 가시성 정책**, 그리고 **한국어·데이터 무유출**이다. MD를 전면에 내세운 메시지는 반박당한다.

---

## 8. 확인 한계

- 설치 수·평점은 2026-09-01 조회값이다. v4의 08-31 스냅샷과 몇 건씩 다르다(Timesheets 27,122→27,118, Capacity Planner 9,721→9,717, Structure 13,081→13,068, BigPicture 10,952→10,955, Financial Manager 3,199→3,192).
- 가격은 마켓플레이스 가격 REST의 11~100명 구간 연간값을 10으로 나눈 월 정가다. Structure Advanced $4.73과 BigPicture Standard $5.21은 v3 조사값을 그대로 썼고 이번에 REST로 재확인하지는 않았다.
- 기능은 리스팅 문구와 벤더 문서 기준이다. 체험판으로 직접 확인하지 않았다.
- 리뷰 인용은 마켓 페이지에 노출된 것만이다. 전체 리뷰를 읽은 것이 아니라 표본이다.
- Tempo의 "Gantt Charts for Structure PPM" 단가는 확인하지 않았다(v3 조사값 $1.27).
