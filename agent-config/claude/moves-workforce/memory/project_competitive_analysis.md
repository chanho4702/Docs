---
name: project-competitive-analysis
description: "Moves RMS 경쟁 분석(2026-08-31, 딥 리서치 v2) — 직접 경쟁 3곳·정정 사항·추적 대상·문서 위치"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ad133d8-cc67-4fbb-8105-1a49b2139732
  modified: 2026-09-01T00:46:44.071Z
---

2026-08-31 경쟁 분석 v2 완료 (Atlassian Marketplace 10종 + 독립형 SaaS 4종 + 국내 PMS 6종). 산출물: 아티팩트 https://claude.ai/code/artifact/37c7894d-3307-48f5-a3e5-2d9bb98f9ffa + Confluence용 md(세션 scratchpad `moves-rms-competitive-landscape.md`, 사용자가 Confluence에 게시 예정).

핵심 결론:
- 직접 경쟁 3곳: **ActivityTimeline**(올인원·한국어 UI·휴가 승인·급여자용 월 정액, $2.50), **TeamBoard TimePlanner**(단가 4계층·Cost Admin/Viewer, $1.75), **Resource Management for Jira by Be On Time**(순수 Forge·Runs on Atlassian 배지, 설치 12건, 2026-08 릴리스 — 분기별 추적 대상).
- 급여(연봉/월급) 저장·환산 원가 + 가시성 정책 이원화 + 팀 관리형 자동 대응은 조사 범위에서 Moves RMS만. **공수(MD) 단위 자체는 해자 아님** — BigPicture가 man-day 효과 모드 보유.
- 우리 미흡점: 휴가 승인 워크플로·잔여 연차, 타임시트 승인, 예산/EVM, 청구·인보이스. **보강 순서 확정(문서 §8.5): 타임시트 승인 → 마켓 등록·RoA 배지 → 예산 대비 소진**. SAFe·what-if·AI·인보이스는 일부러 안 함.
- 판단(§10): 세그먼트를 "Jira+MM 정산+급여 원가 SI·공공·에이전시"로 좁히면 이김. Tempo는 전 Jira 유저 강제 과금·3앱 $9+, BigPicture $4.3~4.8 → 우리 $2.5~3.5 한 앱이면 TCO 3배 메시지 성립.
- 확장 전략(§12): RMS는 이김(AT 추월→Tempo 대체) / 글로벌 범용 PPM 안 함(Atlassian Plans 흡수 중) / 국내 PMS 대체(Confluence 승인 앱 결합) / 글로벌은 MM 문화권(일본 人月→DACH PT), 순서 한국→일본→DACH. §11에 우리 기능↔경쟁 기능 대체 관계표.
- v3(2026-09-01): 외부 출처 123건 + 코드 근거 16건 번호 각주. **"예산/EVM 없음"도 오류** — `CostCalculator.computeEvm` 있음, 갭은 total_budget 미연결·AC 일정 안분·직접비. Be On Time은 아르메니아. 수익배분 인상 2026-04-01/10-01로 연기.
- 문서 정본: `_workspace/competitive-analysis/Moves_RMS_경쟁분석_v3.md` (v2도 보존, git 무시 경로).
- Sentry egress는 analytics 카테고리·inScopeEUD false라 Runs on Atlassian 요건 충족(배지는 등록 시 심사).

**Why:** 사용자가 경쟁사 분석을 요청했고, 1차 문서에 "휴가/가용성 관리 부재"·"MD 단위 유일"이라는 **틀린 주장**이 있었다(코드 확인 결과 연차 1MD·반차 0.5MD가 가동률 분모에서 차감됨, `ResourceAnalysisService.computeLeaveDeductionMap`).

**How to apply:** 경쟁 비교·마케팅 문구를 쓸 때 우리 제품 기능은 반드시 코드로 먼저 확인할 것. "MD 유일" 대신 "MD/MM → 급여 환산 원가" 로 표현. Be On Time 릴리스 동향을 다음 분석 때 재확인. 관련: [[salary-policy]], [[team-managed-field-gap]], [[license-enforcement]].
