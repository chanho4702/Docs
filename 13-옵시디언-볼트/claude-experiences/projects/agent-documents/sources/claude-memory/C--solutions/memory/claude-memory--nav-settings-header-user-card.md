---
name: nav-settings-header-user-card
description: "2026-08-19 내비 개편(#ZM-111, FE 8669f42) — 설정 그룹을 헤더 우측 상단 ⚙ 드롭다운(SettingsMenu)으로, 사이드바 맨 아래 로그인 카드(NavUserCard: 아바타·이름·역할·로그아웃). 사이드바에 '설정' 그룹 없음"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8a13f89c-0a1f-450a-9769-57fd8f277eeb
  modified: 2026-08-19T02:25:05.922Z
---

2026-08-19 사용자 지시로 FE 내비 구조 변경(커밋 `8669f42`, #ZM-111, 미푸시).

- **설정은 사이드바에 없다** — 헤더 우측 상단 ⚙(`src/layouts/app/SettingsMenu.tsx`) 드롭다운: 마이 페이지(전원) · 리포트 관리 · 기기분류 관리 · 스케줄러 · 데이터 소스 관리 · 라이선스(관리자=`useIsSuperRole`). 새 설정 화면을 추가하면 **SideNav가 아니라 `SETTINGS_ENTRIES`에 넣는다**(SideNav의 `activeKey` 설정 경로 분기는 잔존, 무해).
- **로그인 정보·로그아웃은 사이드바 맨 아래 `NavUserCard`**(sticky bottom, `NAV.bgDeep`). 로그아웃은 기존 `handleLogout`(확인창→서버 로그아웃→로컬 정리). 모바일 드로어도 동일 카드. 헤더의 "더보기→로그아웃" 드롭다운·모바일 `userItems`는 삭제됨.
- 사용자 선택: "우측 하단"의 뜻을 물어 **사이드바 맨 아래**로 확정(헤더 우측·화면 우측 하단 플로팅은 기각).
- ⚠️ SideNav/MobileSideNav는 다른 세션이 `nav-menu` 클래스 hunk를 미커밋으로 들고 있어 임시 인덱스+blob 치환으로 내 hunk만 커밋([[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--home-widget-dashboard|home-widget-dashboard]]와 같은 방식).
