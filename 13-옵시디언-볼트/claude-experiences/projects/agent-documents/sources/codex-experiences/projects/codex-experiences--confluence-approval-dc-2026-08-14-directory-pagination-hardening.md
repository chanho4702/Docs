# Confluence Approval DC 대용량 사용자 directory 페이징 보완

`UserAccessor.findUsersAsList`는 결과 전체를 `List`로 만든다. 관리자 Flow 사용자 선택에서 빈 검색으로 이를 호출하면 대규모 directory에서 메모리·응답 시간 문제가 생긴다.

처음에는 Confluence 내부 `UserSearchServiceInternal#doUserSearch(SimplePageRequest, UserSearchRequest)`를 사용했으나, C9 서버의 OSGi가 `com.atlassian.confluence.internal.user` package를 export하지 않아 bundle 해석이 실패했다. 따라서 internal API를 쓰지 않고, 두 글자 미만 검색은 directory를 조회하지 않도록 차단했다. 브라우저는 이전 검색을 `AbortController`로 중단하고 sequence를 비교해 늦게 도착한 응답이 현재 결과를 덮지 못하게 했다. 검색 결과 자체는 공개 `UserAccessor` 결과에서 응답 크기를 20건으로 제한한다.

XSRF는 `XsrfTokenService` bytecode를 확인했다. `X-Atlassian-Token: no-check`는 서비스가 명시적으로 처리하며, 외부 origin은 CORS 없이 이 비단순 header를 붙일 수 없다. 실제 Confluence REST filter의 차단 동작은 설치 인스턴스에서 계속 smoke test한다.
