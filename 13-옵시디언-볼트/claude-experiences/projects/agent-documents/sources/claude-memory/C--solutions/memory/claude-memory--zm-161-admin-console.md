---
name: zm-161-admin-console
description: "ZM-161 설정 메뉴(⚙ 12개)를 같은 SPA 안 \"관리 콘솔\" 레이아웃으로 분리 — FE 전용, 워크트리 C:/worktrees/zm-161-fe, 2026-09-22 구현·검증 완료·커밋 승인 대기"
metadata: 
  node_type: memory
  type: project
  originSessionId: 674cb13f-5888-4165-8f3b-39df20c9359f
  modified: 2026-09-22T04:06:09.507Z
---

**ZM-161 관리 콘솔 분리(2026-09-22, FE 전용).** ⚙ 드롭다운 12개 → 개인 2개 + "관리 콘솔" 1개. `/setting/**`가 `SettingsLayout`(AppLayout `nav="settings"`)으로 열려 메인 사이드바 대신 콘솔 내비(`SettingsSideNav`/`SettingsMobileSideNav`, 항목 훅 `settingsNavItems.tsx`)가 선다. 콘솔 홈 `/setting`(`AdminConsoleHome`)이 그룹 카드. 정본 `constants/adminConsole.tsx`(5그룹 12항목).

**사용자 결정(09-22):** 별도 앱 안 함(설치형·배포 산출물 증가) · 같은 SPA · **자빅스 관리는 운영 메뉴라 사이드바 잔류** · 워크트리 `C:/worktrees/zm-161-fe` 브랜치 `ZM-161`(master `39ece8e` 기준, 병합 후 정리됨).

**Claude 판단:** URL `/setting/**` 유지 — AI 서버 `screens.json` 10경로·docs 5편·FE 테스트 10파일이 문자열로 물고 있어 `/admin` 전환은 세 저장소 동시 갱신 비용. `SETTINGS_ENTRIES` export는 평탄본으로 남겨 기존 테스트 3개 무수정 통과.

**색 체계(사용자 요청 09-22):** 콘솔은 인디고 축 — `palette.ts`의 `CONSOLE_NAV`(내비 `#1C2140`) + `TPalette.CONSOLE`(모드별 accent/page/hero) → CSS 변수 `--console-*`. 관제 teal과 명도·구조는 같고 색상축만 다르게. 설정 화면 공통 `--control-accent`가 이제 콘솔 강조색을 따른다. 라이트·다크 실측 완료.

**상태:** tsc·eslint 0, jest 7 suites 141 통과(신규 `AdminConsoleNav.test.tsx` 13), 헤드리스 실측(콘솔 홈·관리 화면·⚙·모바일) 통과. 커밋 `d47c0a5` **master ff 병합 완료(09-22, 미푸시)**·워크트리 제거·ZM-161 브랜치 삭제, 검수 인계 `_workspace/features/home/admin-console/review_zm-161-admin-console.md`. 미실측: 접힌 레일·한국어 렌더·다크 카드.

**How to apply:** 설정 화면을 새로 추가하면 `ADMIN_CONSOLE_GROUPS`에만 넣는다(⚙·콘솔 내비·홈·검색이 전부 이걸 읽음). `/setting/**` 밖 경로(APM 알람 규칙·SLO)는 콘솔에 링크만 있고 레이아웃은 원래 것. 워크트리 Vite 실측은 `.env` 복사 + `--port 5174`(BE CORS 5173~5175) + `FE_ROOT` 지정 headless-shot. 관련 [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--nav-settings-header-user-card|nav-settings-header-user-card]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--verify-all-nav-entry-points|verify-all-nav-entry-points]] [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--commit-requires-approval|commit-requires-approval]].
