# Confluence Approval DC: Confluence 9 REST 및 플러그인 초기화 점검

2026-08-09

- Confluence 9의 REST 모듈은 Jersey HK2가 생성하므로 Spring Scanner의 생성자 주입 대상이 아니다. `ActiveObjects`, `PermissionManager`, `PageManager` 생성자 인젝션은 HK2 `MultiException`으로 실패했다.
- `ActiveObjects`는 일반 Confluence component lookup으로 조회되지 않아, 플러그인 bundle context의 OSGi service lookup 경로를 별도로 두었다. 이 경로의 실제 HTTP 응답 검증은 브라우저 확장 프로그램이 `/rest/approval/...`을 `ERR_BLOCKED_BY_CLIENT`로 차단하여 보류했다.
- Confluence 9과 10 모두 생성 산출물 manifest의 `Atlassian-Plugin-Key: kr.dmove.confluence.approval` 및 `Spring-Context: *`를 확인했다. Java 21 환경에서 domain test 15건과 C9/C10 패키징이 통과했다.
- 페이지 web panel은 AO 주입 오류가 전체 Confluence 페이지 렌더링을 실패시키지 않도록 C9에서 일시적으로 DB 조회를 분리했다. REST가 실제 응답으로 검증된 뒤 panel의 실제 상태 조회를 복원해야 한다.
- C9 개발 서버의 QuickReload 감시기는 C10 `target` 산출물도 감지해 동일 plugin key를 교체한다. C10 jar는 C9의 JAX-RS package version과 달라 enable에 실패한다. 따라서 실행 중인 C9 서버와 같은 workspace에서는 C10 package 뒤 반드시 C9 jar를 재배포해야 하며, C10 검증은 별도 작업 경로/서버로 분리해야 한다. POM의 `enableQuickReload=false`만으로는 이 감시기를 막지 못했다.
