# Confluence Approval DC: 승인 요청 사용자 상세 검색 (2026-08-20)

- 승인 요청 모달의 `approverSearch`와 `/users/space` 연결은 빈 검색에서도 10명을 반환해, input focus만으로 사용자 목록이 노출됐다.
- UI에서 검색어가 두 글자 미만이면 요청·결과·pager를 모두 비워 search-first 흐름으로 바꿨다. 서버의 기존 최소 길이·스페이스 조회 권한 검증은 그대로 사용한다.
- `상세 검색`은 요청 모달 위에 열리고, 검색 결과를 체크형 다중 선택한 뒤 `선택한 사용자 추가`로 기존 `addStep` 흐름에 한 번에 넣는다. 닫기/Escape는 적용하지 않은 선택을 버린다.
- 한·영 i18n 키 일치, JavaScript 구문, `git diff --check`, JDK 21의 `mvn -pl approval-confluence9 -am -DskipTests compile`를 통과했다.
