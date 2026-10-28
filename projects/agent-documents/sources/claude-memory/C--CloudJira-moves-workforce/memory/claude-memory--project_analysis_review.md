---
name: analysis-review-2026-06
description: "분석 화면 지표 논리 감사(2026-06-11) — 가동률 분모·actualMm 수정 적용, 완성률=공수근사 등 의미 한계는 InfoTip 명시로 처리"
metadata: 
  node_type: memory
  type: project
  originSessionId: 350410a5-f8b7-451b-9de6-5f4a190183c8
---

2026-06-11 통합 대시보드 + 프로젝트 상세 분석 5종 지표 논리 감사·개선 완료 (`_workspace/analysis-review/`).

**수정 적용 (값이 바뀜):**
- Portfolio 가동률(avgUtilization·글로벌·members[].utilization) 분모를 전체기간 → **경과기간 `min(today,endDate)`** 으로 (진행중 프로젝트 과소평가 수정)
- `actualMm` 분모 20 하드코딩 → `getMonthMmMap` 평균 동적 (Resource 탭과 정의 통일)
- S축 todoRatio 임계 0.3/0.6 → settings(`scopeTodoAmberRatio`/`scopeTodoRedRatio`) + 응답 `scopeBands` 신규 필드
- "예산" 라벨 전면 교체 → "계획 인건비" (salary=재직기간 총단가, 실제 예산 아님)

**의도된 한계 (산식 유지 + InfoTip 명시로 처리 — 재검토 시 산식 바꾸지 말 것):**
- 완성률 = 진행중 이슈 공수 소진율 근사 (CPI·신호등 T가 이 가정 위에 섬, 데이터 한계)
- AC = salary × scheduleRate (시간경과 안분, 실투입과 무관)
- monthlyBurn = 실투입 md 비중 안분 (시간경과와 혼합 — (b)현행+명시 채택, (a)시간경과 안분은 후속 옵션)
- 신호등 R = 프로젝트 내 평균 부하 ≠ 글로벌 가동률 (의도된 차이)
- EAC 발산 가드 BAC×3, costLevel amber +0.1 하드코딩 유지 (설정화 P3 강등)

**E2E 완료(2026-06-11, forge tunnel @ moves-rms):** scopeBands 수신·재집계 CTA·가동률 0.16→0.45·actualMm 1.5→1.3 실데이터 검증 통과 (`_workspace/analysis-review/05_e2e_report.md`). E2E가 **배치 401 잠복버그** 노출(집계 체인 전부 as:'user' → 스케줄 트리거에서 AUTH_TYPE_UNAVAILABLE) → 공통 API에 옵셔널 `as` 파라미터 추가 + PortfolioAggregator만 `as:'app'` 전달로 수정, moves-rms v4.26.0 배포. [[no-asapp-preference]] 참조(배치는 asApp 예외 확정).

**잔여:** 다음 일일 배치 자동 실행 확인(내일), UI 픽셀 육안 확인은 사용자 몫, SettingPage에 scopeTodo 임계 입력 폼 없음, 진행률 custom field 도입은 범위 외 후속. development 환경(dmove-sandbox)은 asApp 수정 이전 버전(v3.1.0) — 필요 시 재배포.

관련: [[portfolio-dashboard]] [[cost-analysis]] [[progress-page]]
