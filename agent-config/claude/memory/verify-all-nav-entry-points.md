---
name: verify-all-nav-entry-points
description: "메뉴에 없다/주소로만 진입"이라고 말하기 전에 사이드바·모바일·헤더 ⚙ 설정 메뉴·검색 인덱스·apmRoutes 테스트를 전부 확인할 것 — 09-16 SLO 오판으로 설계 확정 사항을 뒤집음
metadata:
  type: feedback
---

2026-09-16 실수: 사용자가 "SLO가 왜 설정에 들어갔냐"고 물었는데, 사이드바만 보고 **"SLO는 설정에 없고 주소를 직접 쳐야만 열린다"고 틀리게 답했다.** 실제로는 헤더 ⚙ 설정 메뉴(`layouts/app/SettingsMenu.tsx`의 `SETTINGS_ENTRIES`, key `apm-slo`)에 **설계 §1.2 S1 확정**으로 들어가 있었다. 그 오판을 근거로 사용자가 "바로 추가"를 지시했고, 사이드바에 넣어 커밋(FE `3a09b33`, 메시지에도 틀린 전제)했다. 결과: SLO가 사이드바와 ⚙ 두 곳에 생기고, 설계를 못박은 `src/__tests__/apmRoutes.test.tsx`(사이드바 7개·비노출 목록에 slo) 2건이 실패. 커밋 전에 그 테스트를 안 돌렸다.

**Why:** 이 앱의 진입점은 다섯 곳이다 — 데스크톱 `SideNav`·`MobileSideNav`·헤더 ⚙ `SettingsMenu.SETTINGS_ENTRIES`·검색 `constants/navSearchEntries.ts`·라우트. APM은 "사이드바 비노출분은 ⚙로" 가 설계 결정이고 `apmRoutes.test.tsx`가 그걸 강제한다. 한 곳만 보고 "없다"고 단정하면 확정된 설계를 뒤집는다.

**How to apply:**
- "메뉴에 없다"고 말하기 전에 위 다섯 곳을 전부 grep한다(`grep -rn '<path 상수>' src/layouts src/constants`).
- 사용자가 "그거 설정에 있지 않냐"고 하면 **사용자 말부터 검증**한다 — 이번엔 사용자가 맞았다.
- 메뉴·라우트를 건드린 커밋 전에는 `npx jest src/__tests__/apmRoutes.test.tsx`와 메뉴 관련 테스트를 반드시 돌린다.
- 설계 확정 사항(§ 표기, "확정" 주석)을 바꾸는 변경은 먼저 그 사실을 사용자에게 알리고 결정받는다.

관련: [[nav-settings-header-user-card]] · [[zm-151-156-backlog-sprint]]
