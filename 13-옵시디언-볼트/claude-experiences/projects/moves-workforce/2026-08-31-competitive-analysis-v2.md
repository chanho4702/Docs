---
tags: [moves-workforce, competitive-analysis, market, forge, marketplace]
updated: 2026-08-31
---

# 2026-08-31 경쟁 분석 v2 (딥 리서치)

> 요청: "우리 제품과 비슷한 제품군 찾아 경쟁사 분석" → "비교 우위·미흡점" → "딥 리서치로 근거 보강 + Confluence 포맷 + 공식 문서 링크".
> 산출물: 아티팩트 https://claude.ai/code/artifact/37c7894d-3307-48f5-a3e5-2d9bb98f9ffa · Confluence용 md `_workspace/competitive-analysis/Moves_RMS_경쟁분석_v2.md`
> 선행: [[2026-07-07-competitive-advantage-report]] (우위 5개 프레이밍) — 이번엔 **경쟁사 실측 데이터**로 그 프레이밍을 검증·수정했다.

## 조사 범위·방법
- 마켓플레이스 앱 10종(Tempo 4앱·BigPicture·ActivityTimeline·TeamBoard 2앱·Clockwork Pro·Planyway·Capacity Planner(RVS)·Be On Time·SaaSJet) + 독립형 SaaS 4종(Float·Runn·Resource Guru·Kantata) + 국내 PMS 6종(E3PS·유시스·WATCH2·Smartbase·Link PMS·솔브리드플러스) + 시장 데이터.
- 서브에이전트 4개 병렬(제품군별). 마켓플레이스 **REST 가격 API**(`/rest/2/addons/{key}/pricing/cloud/live`, 연간÷10)와 `versions/latest`의 `deployment.connect` 플래그로 가격·Forge/Connect를 실측 — 벤더 사이트 표기와 어긋난 곳(TeamBoard)이 있었다.

## 결론
| 구분 | 내용 |
|---|---|
| 직접 경쟁 3곳 | **ActivityTimeline**(올인원·한국어 UI·휴가 승인·급여자용 월 정액, $2.50) · **TeamBoard TimePlanner**(단가 4계층·Cost Admin/Viewer, $1.75+$1.75) · **Resource Management for Jira by Be On Time**(순수 Forge·Runs on Atlassian 배지, 설치 12건, 2026-08 릴리스) |
| 상위 시장 | Tempo(설치 2.7만, 3앱 조합 ≈$9.20+, Forge Remote, 한국어 ✗) · BigPicture(1.1만, 범용 PPM, Appfire AWS 저장) |
| 우리만 있는 것 | 급여(연봉/월급) 저장·환산 원가 + 가시성 정책 이원화 + 팀 관리형 자동 대응(이슈 프로퍼티) + 순수 Forge |
| 우리 미흡점 | 휴가 **승인** 워크플로·잔여 연차, 타임시트 승인, 예산/EVM, 청구·인보이스 |
| 국내 PMS | 전부 구축형, **Jira 연동 0곳**, 제조/공공 산출물 지향 → 경쟁재 아님. "Jira 쓰는 SI 조직"이 빈 자리 |
| 가격 기준선 | 직접 경쟁 3곳이 $2.50~3.50 |

## v3 (2026-09-01) — 근거 전면 보강
- 사용자 요청 "출처랑 근거 좀 빡세게". 에이전트 2개로 1차 출처 재수집 → **외부 출처 123건 [n] + 코드 근거 16건 [C-n]** 번호 각주, §16 근거 목록표(유형·확인일·핵심 인용·URL), §17 코드 근거표(파일:라인·확인 내용). 정본 `_workspace/competitive-analysis/Moves_RMS_경쟁분석_v3.md`.
- 🔴 **네 번째 오류 발견**: "예산/EVM 없음"도 거짓 — `CostCalculator.computeBudget/computeEvm`(BAC·AC·EV·CPI·EAC·ETC·초과액·월별 소진)이 있고 UI(`CostEvmCard` 등)도 있다. 정확한 갭은 ① `project.total_budget`이 원가 분석에 미연결(BAC=투입급여 합) ② AC가 워크로그가 아닌 일정 경과 안분(`burnRate = scheduleRate`) ③ 직접비 없음.
- 정정 4건: Be On Time은 유럽이 아니라 **아르메니아 예레반**(개인사업자+파트너 LLC) / 수익배분 인상 시점 2026-04-01·10-01로 **연기**(원 공지 1/1·7/1) / 북유럽 day rate 근거 없어 삭제 / 독일은 "Personentag"보다 "Tagessatz" 표기가 주류.
- 1차 출처로 잡힌 결정적 문장: Tempo "license size must match your Jira license size" · Tempo Forge Remote "backend services remain on the vendor's own infrastructure … cannot be undone" · BigPicture effort mode "Hours / Man-days / Percent / Story points" · AT Monthly rate "time-based, not worklog-based" · KOSA "기능점수 방식을 원칙 … 투입공수에 의한 방식을 적용할 수 있다" · IPA 「1人月＝160人時」 · BDU 「Tagessatz 1.300 Euro」 · Infosys 20-F "billed person months" · 개인정보 안전성 확보조치 기준 제5조 "최소한의 범위로 차등 부여".
- 교훈: **부재 주장은 grep 결과 자체를 근거로 적는다**(C-12, C-13). 마켓 REST(`/rest/2/addons/{key}/pricing/cloud/live`, `versions/latest`의 `deployment.connect`)가 벤더 사이트보다 정확. `www.atlassian.com`은 WebFetch 차단 → support/developer/community 도메인으로 우회.

## 🔴 1차 문서의 틀린 주장 3건 (코드·실측으로 정정)
1. **"휴가/가용성 관리 부재"** → 거짓. `ResourceAnalysisService.computeLeaveDeductionMap`이 연차 1 MD·반차 0.5 MD를 근무일 기준 가동률 분모에서 차감하고 공휴일은 백오피스 관리. 없는 건 승인 워크플로·잔여일뿐.
2. **"MD 단위 유일"** → BigPicture가 man-day 효과 모드 보유(원가는 시급). 표현을 "MD/MM → 급여 환산 원가"로 좁힘. **공수 단위 자체는 해자가 아니다**(UI 레이어로 따라올 수 있음).
3. **"경쟁사는 한국어 없음"** 암묵 가정 → ActivityTimeline이 KO UI 제공.

## 교훈
- **경쟁 비교에서 우리 제품 기능은 반드시 코드로 먼저 확인.** CLAUDE.md 기능 요약만 보고 "없다"고 적었다가 세 번 고쳤다. 상대는 마케팅 페이지로, 우리는 코드로 보니 비대칭이 생긴다.
- 웹 검색 요약만으로는 "레이트 기반"과 "급여 기반"이 구분되지 않는다 — 벤더 도움말의 단가 설정 페이지까지 내려가야 갈린다(Tempo FM·BigPicture Financials·AT Finances 각각 확인).
- Runs on Atlassian은 Sentry egress가 있어도 `analytics` 카테고리 + `inScopeEUD:false`면 요건 충족(공식 정책 확인). 배지는 등록 심사.
- Marketplace REST 가격 API가 벤더 사이트보다 정확하다. 비교표는 REST 기준으로 통일.

## 판단 (문서 §10에 기록)
- **정면으로 붙으면 진다, 붙을 이유가 없다.** Tempo·BigPicture는 성숙도·기능 폭·범용성에서 앞서지만 급여 원가(시급 철학)·한 앱 가격(Tempo 전 Jira 유저 과금)·데이터 무유출·한국어는 구조적으로 못 한다.
- 세그먼트를 "Jira 쓰면서 MM 정산·급여 원가 보는 SI·공공·에이전시"로 좁히면 이기고, 넓히면 진다. 전제 = 타임시트 승인 보강.
- 부족한 것은 **강점(급여 원가)의 앞뒤 흐름**(승인→예산→청구 단가)과 **남이 써본 적 없음**(마켓 실적 0·E2E 미수행 다수·가격 미정). SAFe·what-if·AI·인보이스는 일부러 안 한다.

## 확장 전략 (문서 §11·§12)
- **기능별 대체 관계표(§11)**: 워크로그·인력 명부·가동률·캘린더·대시보드·백오피스는 "대체 가능"(지지만 않으면 됨) / 급여 환산 원가·급여 가시성·MM 리포트·팀 관리형 자동은 "우리만"(영업 메시지) / 승인·예산·청구는 "경쟁사만"(보강 순서).
- **RMS는 이긴다**(ActivityTimeline 추월 → Tempo 대체: Forge Remote 강제 전환·인상·전 유저 과금이 이탈 창구) / **글로벌 범용 PPM은 안 한다**(Atlassian Plans가 흡수 중 — BigPicture가 강해서가 아님) / **국내 PMS는 대체한다**(Jira 연동 0곳 → Jira+Confluence+Moves, 산출물 승인·보고서·요구사항 추적을 `moves-approval`과 결합).
- **글로벌 = MM 정산 문화권**: 시급은 미국 SW팀 관행일 뿐. 일본 人月 → DACH PT → 인도 person-month. 순서 한국→일본(i18n뿐)→DACH(단가 일반화·GDPR — 가시성 정책+RoA가 답). Be On Time은 유럽 벤더 추정.

## 열린 항목
- Be On Time 분기별 추적(릴리스 빠름).
- 보강 순서: **타임시트 승인 → 마켓 등록·RoA 배지 → 예산 대비 소진** → 휴가 승인 → 청구 단가 분리 → Tempo 마이그레이션 경로.
- 정산용 엑셀("월별 인원 × MM × 단가") 출력 존재 여부 코드 확인 필요.
- 경쟁 앱 체험판 핸즈온 미실시 — 원가 권한 세부는 문서 공개 범위까지만.
