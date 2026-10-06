# 모니터링 메뉴 구성 변경

- 사용자 요청: 네트워크 맵부터 아래 메뉴를 모니터링 밖으로 이동.
- 모니터링 하위: 호스트 그룹, 서버 모니터링, 네트워크 모니터링.
- 같은 상위 단계로 이동: 네트워크 맵, 클라우드 인프라 모니터링, 애플리케이션 모니터링, DB 모니터링, GPU 모니터링.
- 데스크톱과 모바일에 같은 순서 적용. 기존 경로·권한·라이선스 조건과 각 메뉴 내부 구성 유지.
- 격리 worktree에서 구현 후 master에 fast-forward. 커밋: `9dfcbe8`.
- 검증: 관련 Jest 2개 suite, 31개 test 통과. TypeScript 검사 통과. Chrome에서 데스크톱·모바일 메뉴 계층, 네트워크 맵 선택 상태, APM 자동 펼침·조회 조건 유지 확인. pageerror 0건.
- 화면 및 결과: `menu-desktop-20261002.png`, `menu-desktop-apm-20261002.png`, `menu-mobile-20261002.png`, `menu-browser-results-20261002.json`.
- 외부 Vault는 현재 쓰기 허용 범위 밖이므로 결정 기록을 이 작업 폴더에 보존.
