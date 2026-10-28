---
tags: [project, moves-workforce, audit, metrics, portfolio, evm]
created: 2026-06-11
updated: 2026-06-11
---

# 2026-06-11 — 분석 화면 지표 논리 감사 + 개선 (analysis-review)

> 통합 대시보드(Portfolio) + 프로젝트 상세 분석 5종(대시보드/이슈/인력/진척율/비용)의 지표·계산식 타당성 심층 감사 → P1 수정 + InfoTip 명시 + UX 개선. 하네스 파이프라인(architect→backend→frontend→verifier) 완주, 검증 통과 18/실패 0/미검증 3(E2E). 산출물: `_workspace/analysis-review/`.

## 감사 결론 (오류 4 / 의심 6)

산술 오류보다 **분모 정의의 화면 간 비일관**이 진짜 문제였다:

| # | 발견 | 처리 |
|---|------|------|
| A1 ❌ | Portfolio 가동률 분모 = 프로젝트 **전체기간(미래 포함)** → 진행중 프로젝트 구조적 과소 (일정률은 경과/전체로 올바른데 가동률만 비대칭) | **수정**: 분모를 `min(today, endDate)` 경과근무일로. 글로벌 가동률도 미래 endDate를 today로 클램프 |
| A2 ❌ | Portfolio `actualMm = md/20` 하드코딩 ↔ Resource 탭은 동적 monthMm → 같은 프로젝트 MM 불일치 | **수정**: `getMonthMmMap` 평균 동적 분모 |
| A3 ❌ | 진행중 완성률 = 공수 소진율 근사 → CPI·신호등 T가 "공수=완성" 가정 위에 섬 | 데이터 한계로 산식 유지, **InfoTip 명시 확대** (헤더·CPI·신호등) |
| A4 ❌ | "예산/BAC" 라벨인데 실체는 Σ재직기간 총단가(인건비) — 의사결정 오인 위험 | **용어 전면 교체**: "계획 인건비" (i18n 값만, 키 유지 → 코드 무수정) |
| B1 ⚠️ | S축 todoRatio 0.3/0.6 하드코딩 (T·R은 설정 연동) | **설정화**: settings `scopeTodoAmberRatio/RedRatio` + 응답 `scopeBands` 신규 필드 |
| B2~B6 ⚠️ | 신호등 R≠글로벌 가동률 의미차, monthlyBurn 안분 기준 혼합(시간경과 AC를 md로 안분), EAC 가드 BAC×3 근거 부재, costLevel +0.1 하드코딩, null-plan 진행중 0% 표기 | InfoTip 명시 / "-" 표기 / 하드코딩 유지(설정화 효익 낮음 P3 강등) |

UX: TSR 테이블 red desc 정렬+색맹 글리프(▲■●)+EMPTY 재집계 CTA, S-curve 격차 음영, EVM 카드 CPI 게이지+EAC/BAC 막대.

## 교훈

1. **지표 감사의 1순위 질문은 "같은 개념의 분모가 화면마다 같은가"** — 산식 자체보다 분모 정의 비일관(전체기간 vs 경과기간, 고정 20일 vs 동적 근무일)이 숫자 불신의 원인. 분자/분모를 표로 나란히 놓으면 바로 드러난다.
2. **비율 지표의 분모에 미래 기간이 들어가면 진행중 엔터티는 항상 과소평가** — 투입(분자)은 과거에만 쌓이므로 분모도 `min(today, end)`로 클램프해야 의미가 맞다. 일정률은 맞게 하고 가동률은 틀리는 식의 "부분 적용"을 조심.
3. **값만 정확화(shape 동일)는 가장 싼 백엔드 수정** — 필드명·타입 무변경이면 프론트 무수정·계약 표도 불필요. 이번 백엔드 변경 중 경계면 변경은 `scopeBands` 1필드뿐.
4. **라벨이 거짓말하면 산식이 맞아도 틀린 의사결정** — salary=총단가인데 "예산"이라 부르면 "예산 대비" 해석이 전부 오염. i18n 값만 바꾸는 용어 정정은 코드 무수정으로 끝나는 최고 가성비 수정.
5. 산식을 못 고치는 한계(데이터 부재)는 **숨기지 말고 InfoTip으로 전 화면 동일 문구 노출** — "공수=완성 근사"를 한 곳(툴팁)에만 적어두면 다른 화면(CPI·신호등)에서 과신이 발생한다.

## E2E 검증 (같은 날 수행 — forge tunnel @ moves-rms)

- 방법: tunnel + **ResponseWrapper 임시 계측**(scopeBands 있는 응답만 골라 실데이터 로그, 검증 후 git checkout 복원) + 사용자 실브라우저 조작 + 터널 로그 관찰. 통과: scopeBands 수신, 재집계 CTA(PARTIAL→OK 10초), **가동률 0.16→0.45·actualMm 1.5→1.3** (동일 입력 29MD, 신구 산식 전후 비교).
- **E2E가 잠복버그를 노출**: 일일 배치 `runPortfolioSnapshot`이 401 AUTH_TYPE_UNAVAILABLE로 전 프로젝트 실패 — 집계 체인 Jira API가 전부 `as:'user'`인데 스케줄 트리거엔 사용자 컨텍스트가 없음. **자동 배치는 한 번도 성공한 적 없었고 수동 CTA만 동작했던 것.** 수정: 공통 API에 옵셔널 `as` 파라미터(기본 'user', 기존 호출부 무영향) + PortfolioAggregator 체인만 `as:'app'`.
- 추가 교훈:
  6. **스케줄 트리거 코드는 유닛테스트·수동 트리거로는 영원히 통과한다** — asUser/asApp 같은 호출 컨텍스트 의존은 실제 그 컨텍스트(스케줄 invocation)에서만 터진다. 배치 경로는 반드시 tunnel로 스케줄 실행을 한 번 관찰할 것.
  7. **임시 계측을 끼울 곳은 공통 래퍼(responseWrapper)** — git-clean 파일이면 checkout 한 번으로 복원되고, 조건 분기(특정 필드 존재)로 원하는 응답만 골라 실데이터 shape을 로그로 빼낼 수 있다. 단 계측 조건은 실제 반환 구조를 먼저 확인하고 짤 것(`{content:...}` 래핑이라는 리포트 표기를 믿었다가 1회 공침).
  8. asApp 전환은 manifest 스코프를 바꾸지 않으므로 마켓플레이스 심사 부담이 없다 — 심사 변수는 scopes·egress. 단 사용자 방침은 "resolver 경로는 asUser 유지, 배치만 asApp 예외".

## 잔여 (후속 후보)

- 다음 일일 배치 자동 실행 확인(코드·컨텍스트는 CTA 검증과 동일하므로 성공 예상)
- UI 픽셀 육안 확인(red 정렬·글리프·라벨·음영·게이지)은 사용자 브라우저 몫
- SettingPage에 scopeTodo 임계 **입력 폼 없음** (시드/폴백으로 동작은 함 — 폼 추가는 후속)
- monthlyBurn 시간경과 안분 전환(a안), 진행률 custom field 도입(완성률 정밀화)은 범위 외
- development 환경(dmove-sandbox)은 asApp 수정 이전 v3.1.0 — 필요 시 재배포

## 관련
- [[2026-06-01-portfolio-dashboard]] · [[2026-06-05-portfolio-signal-thresholds]] · [[2026-05-27-mm-redesign]] — 감사의 기준점이 된 기존 결정들
- [[harness-engineering]] — 파이프라인 실행 기록(커스텀 subagent_type 직접 생성 첫 실전)
