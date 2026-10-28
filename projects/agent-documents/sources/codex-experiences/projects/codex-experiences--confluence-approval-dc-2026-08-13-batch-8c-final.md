# Confluence Approval DC 배치 8c 마감

- 패널과 매크로의 서명 조회는 `signatureEnabled`일 때만 resolver를 만들고, 렌더 단위 `Map`으로 actor별 조회 결과를 캐시했다.
- 저장된 username을 실제 user key로 정규화할 때는 `UserAccessor.getUserByKey` 다음 `getUserByName` 순서로 조회하고, 서명 저장소는 REST와 같이 `ActiveObjects` 기반으로 생성했다.
- 서버 렌더 URL의 context path는 SAL `HttpContext`의 현재 request에서 구해 하드코딩하지 않았다.
- 업무함의 `signature`는 일반 업무 탭의 `data-tab`에서 분리하고 `activate()`가 목록·알림·서명 panel을 상호 배타적으로 전환하게 해야 직접 진입과 사이드바 클릭이 같은 경로를 탄다.
- 검증: C9 `Tests run: 111, Failures: 0, Errors: 0, Skipped: 0`, C10 compile 성공.
