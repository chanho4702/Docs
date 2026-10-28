---
tags: [book, product-validation, pretotyping, moc]
updated: 2026-07-06
---

# 📙 The Right It — 허브 노트 (MOC)

- **저자**: Alberto Savoia (Google 초대 엔지니어링 디렉터, "Innovation Agitator", 前 Sun Microsystems)
- **출간**: 2019, HarperOne
- **부제**: *Why So Many Ideas Fail and How to Make Sure Yours Succeed*
- **주제**: 신제품/신사업 아이디어의 시장 검증(market validation) 방법론 — **프리토타이핑(pretotyping)**

> [!summary] 책의 핵심 한 문장
> **"제대로 만들기(build It right) 전에, 만들 가치가 있는 것(The Right It)인지부터 확인하라"** — 대부분의 신제품은 유능하게 실행돼도 실패하므로(시장 실패의 법칙), 의견이 아닌 **자기 데이터(YODA)**를 싸고 빠르게 수집해 검증해야 한다.

## 배경

저자는 Sun·Google을 거치며 3전 3승의 성공 가도를 달리다, $25M 투자를 받은 자신의 스타트업이 5년의 유능한 실행 끝에 헐값 매각으로 끝나는 실패를 겪었다. "왜 잘 실행했는데 실패했는가"에 대한 답을 찾는 것이 이 책의 출발점이다. 본서 자체도 프리토타이핑의 산물 — 5일 만에 쓴 소책자 *Pretotype It*(2011)의 시장 반응(수만 다운로드, 12개 언어 자원 번역)을 확인한 뒤에야 정식 집필에 투자했다.

## 목차와 뼈대

책의 논리 흐름: **시장 실패의 법칙 인정 → Thoughtland(의견의 세계) 탈출 → 자기 데이터 수집 원칙 → 가설의 수치화 → 프리토타이핑 실험 → 엄밀한 분석 → 실행 전술 → 통합 예제 → 무엇을 만들 것인가**

### Part I: Hard Facts — 냉정한 사실
1. [[ch1-law-of-market-failure|Ch 1. The Law of Market Failure]] — 신제품 실패율 ~80~90%. 성공은 요인들의 곱(Success Equation)이라 하나만 틀려도 실패. 실패 유형 FLOP(Launch/Operations/Premise) 중 대부분은 **Premise(잘못된 아이디어)**가 근본 원인.
2. [[ch2-the-right-it-thoughtland|Ch 2. The Right It]] — The Right It vs The Wrong It. 아이디어가 의견만 모으는 상상의 공간 **Thoughtland**과 4대 트롤(Lost-in-Translation·Prediction·No-Skin-in-the-Game·Confirmation Bias). Webvan(false positive) vs Ring(false negative).
3. [[ch3-data-beats-opinions|Ch 3. Data Beats Opinions]] — 의견·일화는 데이터가 아니다. 남의 데이터(**OPD**)도 판단 근거로 불충분 — 신선함·관련성·출처·통계적 유의성을 갖춘 **자기 데이터(YODA)**만이 필요충분조건.

### Part II: Sharp Tools — 날카로운 도구
4. [[ch4-thinking-tools|Ch 4. Thinking Tools]] — 시장 관여 가설(**MEH**) → 숫자로 말하기(Say It with Numbers) → **XYZ 가설**("At least X% of Y will Z") → **hypozooming**으로 지금 당장 검증 가능한 xyz 가설로 줌인.
5. [[ch5-pretotyping-tools|Ch 5. Pretotyping Tools]] — 책의 핵심 장. 프로토타입("만들 수 *있는가*")과 달리 프리토타입은 "만들 *가치가 있는가*"를 검증. **8종 기법** ↓
6. [[ch6-analysis-tools|Ch 6. Analysis Tools]] — **Skin-in-the-Game Caliper**(의견 0점 · 이메일 1점 · 전화번호 10점 · 시간 1점/분 · 돈 1점/$)와 **TRI Meter**(시장 실패의 법칙이라는 유죄 추정에서 출발해 실험 결과로 갱신하는 5구간 게이지). 실험은 최소 3~5회.

### Part III: Plastic Tactics — 유연한 전술
7. [[ch7-tactics-toolkit|Ch 7. Tactics Toolkit]] — ① Think Globally, Test Locally(DTD 최소화) ② Testing Now Beats Testing Later(HTD) ③ Think Cheap, Cheaper, Cheapest($TD) ④ Tweak It and Flip It Before You Quit It.
8. [[ch8-complete-example-busu|Ch 8. Complete Example: BusU]] — 통근버스 강의 사업 아이디어를 도구 전체로 검증하는 통합 시연. 원안($3,000 10주)은 Wrong It → tweak 반복으로 The Right It($300 1주)에 도달.
9. [[ch9-final-words|Ch 9. Final Words]] — 방법론 총복습 + 아이디어는 시장뿐 아니라 **나에게도 맞아야 한다**(two-way match). 의미 있고 세상에 이로운 "right Right It"을 추구하라.

## 프리토타입 8종 요약

| 기법 | 한 줄 정의 | 대표 사례 |
|---|---|---|
| **Mechanical Turk** | 아직 없는 기술을 숨은 사람이 대신 수행해 경험 시뮬레이션 | IBM speech-to-text |
| **Pinocchio** | 작동 않는 모형을 진짜처럼 갖고 다니며 사용 패턴 자가 검증 | PalmPilot 나무토막 |
| **Fake Door** | 제품 없이 입구(광고·사이트)만 만들어 수요 측정 | Kevin Kelly 카탈로그 광고 |
| **Facade** | 문 두드리면 실제 응답·제공까지 하는 Fake Door 확장 | CarsDirect 첫 4대 판매 |
| **YouTube** | 미출시 제품의 작동 영상 + skin in the game 수집 결합 | Google Glass Explorer |
| **One-Night Stand** | 장기 커밋 없이 일회성으로 서비스를 실제 제공 | Airbnb 에어매트리스 3개 |
| **Infiltrator** | 소량 실물을 남의 판매 환경에 끼워 넣어 구매 의사 측정 | IKEA 잠입 Wälhub |
| **Relabel** | 기존 제품 라벨만 바꿔 새 제품인 척 반응 측정 | Second-Day Sushi |

## 핵심 용어 사전 (Glossary 요약)

- **The Right It / The Wrong It** — 유능하게 실행하면 성공할 아이디어 / 아무리 잘 실행해도 실패할 아이디어.
- **Law of Market Failure** — "대부분의 신제품은 유능하게 실행돼도 시장에서 실패한다."
- **market failure/success** — 절대 품질이 아니라 투자 시점의 **기대 대비 실제 결과**로 판정.
- **Thoughtland** — 아이디어가 실제 시장 대신 의견만 수집하며 머무는 상상의 공간.
- **false positive / false negative** — Thoughtland에서 좋아 보였으나 실패한 아이디어(대부분의 실패) / 조롱받았으나 성공한 아이디어.
- **opinions / OPD / YODA** — 의견(위험) < 남의 데이터 Other People's Data(불충분) < **Your Own DAta**(필요충분, skin in the game 동반 필수).
- **MEH (Market Engagement Hypothesis)** — 시장이 내 아이디어에 어떻게 관여할지에 대한 핵심 전제 서술.
- **XYZ Hypothesis / xyz hypothesis / hypozooming** — "Y의 최소 X%는 Z할 것" 수치 가설 / 그것을 지금·여기서 검증 가능하게 줌인한 소가설 / 그 줌인 과정.
- **pretotyping / pretotype** — 제품을 만들기 전에 싸고 빠르게 YODA를 수집하는 기법군 / 그 개별 기법·산출물.
- **skin in the game** — 시장이 관심의 증거로 내놓는 가치(돈·시간·정보·평판). 없으면 데이터가 아니다.
- **Skin-in-the-Game Caliper / TRI Meter** — skin의 크기를 점수화하는 도구 / 실험 결과로 The Right It 확률을 매핑하는 게이지.
- **DTD / HTD / $TD** — 데이터까지의 거리(Distance)·시간(Hours)·비용(Dollars)을 최소화하라는 지표.
- **"If we build it, will they come?"** — 만들기 전에 반드시 물어야 할 질문. "시장이 있으면 방법도 있다(If there's a market, there's a way)."

## 실무 적용 체크리스트 (한 장 요약)

1. 아이디어를 **MEH → XYZ 가설**로 수치화한다 ("At least X% of Y will Z").
2. **hypozooming**으로 오늘·여기서 검증 가능한 xyz 가설로 줄인다.
3. 가장 싸고 빠른 **프리토타입**(8종 중 선택)으로 실험을 설계한다.
4. **skin in the game**이 걸린 반응만 데이터로 인정하고 Caliper로 점수화한다.
5. **TRI Meter**에 결과를 매핑한다 — 단일 실험으로 결론 내지 않는다 (3~5회+).
6. Wrong It 판정이면 **tweak → flip → quit** 순으로 탐색한다.
7. 확신이 생긴 뒤에야 "build It right"에 투자한다.

## 연결

- 개별 챕터: [[ch1-law-of-market-failure]] · [[ch2-the-right-it-thoughtland]] · [[ch3-data-beats-opinions]] · [[ch4-thinking-tools]] · [[ch5-pretotyping-tools]] · [[ch6-analysis-tools]] · [[ch7-tactics-toolkit]] · [[ch8-complete-example-busu]] · [[ch9-final-words]]
