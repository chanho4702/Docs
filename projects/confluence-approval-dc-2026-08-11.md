# Confluence Approval DC — 2026-08-11 승인 업무함/Flow 연결

- 승인 요청에 Flow 자체를 domain aggregate가 아닌 C9 AO `APR_REQ`의 nullable `flowId`로 보관했다. 삭제된 Flow의 과거 요청 감사성을 유지하면서 목록에는 이름만 null로 보일 수 있다.
- 사용자·페이지 권한이 필요한 목록 응답은 화면 숨김만으로 충분하지 않다. `/mine`과 `/mine/requested`에서 서버가 요청별 VIEW 권한을 필터해야 제목과 존재 자체가 유출되지 않는다.
- 실행 중인 Confluence가 C9 `target/container`를 점유하면 표준 `clean verify`가 clean에서 실패한다. JDK 21/Maven toolchain의 clean 없는 verify로 컴파일·테스트·패키징은 확인할 수 있지만, 서버 중지 후 표준 스크립트 재검증이 필요하다.
