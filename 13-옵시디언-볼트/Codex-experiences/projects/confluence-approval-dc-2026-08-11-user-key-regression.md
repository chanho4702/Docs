# Confluence Approval DC 2026-08-11 사용자 key 회귀 수정

- 사용자 검색 REST 응답의 `key`는 username이 아니라 `ConfluenceUser.getKey()`의 문자열 값을 반환해야 한다. 이 값은 `APR_APV.ACTOR_KEY`와 requester key 식별자 체계를 일관되게 유지한다.
- 과거에 username으로 저장된 승인자 및 Flow principal을 지원하려면, 표시 이름 조회는 `getUserByKey` 실패 후 `getUserByName`으로 fallback해야 한다. 두 조회의 `RuntimeException`은 표시용 fallback key로 안전하게 처리한다.
- JDK 21과 Maven 3.9.16으로 `mvn -B -pl approval-confluence9 -am verify`를 실행해 domain 17건, C9 3건 테스트 및 `BUILD SUCCESS`를 확인했다.
