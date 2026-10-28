---
name: design-system-and-help
description: 2026-08-20 디자인 시스템 정비(팔레트 정본·다크모드)와 화면 도움말 31개. 도움말은 AI와 분리 유지 결정, 라우트·색 관련 교훈 다수
metadata:
  type: project
---

**2026-08-20 완료(FE 커밋 9건 푸시)**. 색 정본은 `constants/palette.ts` 하나 — 컴포넌트에 hex 직접 금지.
하드코딩 hex 파일 66→40. 설계서 `_workspace/devdesign_design-system.md`(P0~P6 전건 완료).

- **팔레트**: BRAND_RAMP(teal 한 축) · CHART_SERIES 8슬롯 · SEVERITY 3종(면/선·핀/넓은면) · LIGHT/DARK 두 벌
- **차트 색**: `utils/chartColor.ts`가 배정 — 의미 고정 지표는 화면 달라도 같은 색, in=파랑/out=주황
- **도움말**: 제목 옆 `?` → 패널(요약·할 수 있는 일·그 화면 용어). 31개 화면·용어 46개(한/영).
  경로 매핑은 `constants/page-guide.ts` 한 줄. **AI `screens.json`과 합치지 않는다**(AI 미사용 고객이 대상,
  그 환경엔 AI 서버가 없다). 순차 투어는 채택 안 함(DOM 앵커라 조용히 깨짐, 라우트 90개)

🔴 **절대경로 자식 라우트는 부모 경로로 시작해야 한다** — 경로 상수 일괄 치환으로 `/setting/...`이
`/zabbix-management` 블록에 남자 **앱 전체가 안 떴다**(값이 유효 문자열이라 tsc·테스트 못 잡음).
🔴 `title: ""`는 falsy — 공용 컬럼 훅이 key로 폴백해 i18n 키가 헤더에 찍혔다(빈 문자열=헤더 없음이 의도).
🔴 **CSS 변수가 안 통하는 자리**: MapLibre paint 속성, SVG attribute(인라인 style은 통함) → `getPalette()`.
🔴 팔레트 훅을 `useSelector`로 짜면 Provider 없는 **단위 테스트 66개가 깨진다** → `useSyncExternalStore`.
🔴 **심각도 6단계는 색만으로 구분 불가**(측정: 최선 ΔE 10.1, 기준 15. Zabbix 원색은 재해↔높음 6.3) → 라벨 필수.
🔴 브랜드 teal(#379e9f)은 채도 낮아(C 0.093) 차트 선에서 회색으로 읽힘 → 차트용 `#0f9b9b` 별도.
🔴 antd `<Tag color="#hex">`는 글자를 흰색 고정 → 밝은 배경에서 2.15:1. `readableTextOn`으로 판정.
🔴 집계와 목록이 다른 질의를 쓰면 숫자를 눌러도 목록이 빈다(그룹 요약=이력 축 vs 목록=열린 문제).

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--fe-page-remount-on-navigate|fe-page-remount-on-navigate]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--vault-secrets-management|vault-secrets-management]]
