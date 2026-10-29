---
name: user-management-restructure
description: "사용자 관리 재구성(자빅스 UI/UX 개선) — 2026-07-16 설계 확정, 구현 전. 설계서 _workspace/devdesign_user-management.md"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1c0853f6-3d9a-4fde-a174-1ecaed7ac2fa
---

사용자·역할 메뉴 재구성 — 2026-07-16 설계 완료(구현 전). 설계서: `_workspace/devdesign_user-management.md`.

**진단(2026-07-16 전수조사):** 4화면 중 UserList만 완성 CRUD, UserGroups/HostGroups/UserRoles는 생성·수정·삭제 전부 주석 처리된 조회 전용. 역할 편집 화면 UserRoleUtility(DMOVE/Zabbix 권한 탭 완성 구현)는 라우트·진입 버튼 주석으로 **도달 불가 고아**. 사용자 삭제는 isHard:true 고정. BE 쓰기 경로(user/usergroup/role CRUD)는 전부 살아 있음 → FE 재구성 중심.

**확정 결정(사용자):** 범위=구조 재구성(등록·수정 세 화면 모두 부활), 역할 편집=DMOVE 권한만 1차(Zabbix rules 탭 2차 숨김), 삭제=비활성화 기본+영구삭제는 사용자명 타이핑 강확인, 접근=SUPER_ADMIN 전용 유지.

**핵심 설계:** 메뉴 4→3(HostGroups 화면 제거 — 설정>호스트 등록 관리 그룹 탭과 중복, [[host-registration-feature]]), 역할 select에 DMOVE 권한 미리보기, UserRoleUtility 라우트 복원(DMOVE 탭 단독). BE 최소 보강: PATCH /users/{id}/status 신설(로컬만 차단 — 인증이 로컬 정본이라 충분), DELETE confirmName 서버 검증, Flyway 신규 없음(V9는 호스트 등록이 선점). 감사 로그·medias 편집·ADMIN 개방은 2차.

**구현 전 확인:** ①isHard=false 현 동작 ②역할 삭제 시 소속 사용자 케이스 BE 동작 ③HostGroup 공용 모달 타 소비처 ④비활성 사용자의 Zabbix 직접 로그인 잔존 허용 여부.
