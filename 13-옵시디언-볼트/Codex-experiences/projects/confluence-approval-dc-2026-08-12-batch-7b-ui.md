# Confluence Approval DC 배치 7b UI

- 업무함은 전건 배열 및 클라이언트 `matches()`를 제거하고, 뷰·필터·로컬 날짜 경계·offset을 REST query로 조립해 서버 페이지 응답을 사용한다.
- 빠른 필터 변경에는 요청 시퀀스 가드를 두고, 더 보기는 기존 행을 append하며 최종 페이지에서만 새 첫 행으로 포커스를 이동한다.
- `facets`는 select 옵션의 유일한 소스이며 `statusCounts`는 상태/마감 칩의 유일한 소스다. URL의 `f_space`도 서버 `spaceKey`로 왕복한다.
- 상세 모달의 반려는 prompt 대신 인라인 확인 단계로 처리한다. 클라이언트의 필수 사유 검사는 편의용이며 서버 400이 최종 판정이다.
- 409에는 자동 새로고침 대신 한 번만 생성되는 새로고침 버튼을 제공하여 입력을 보존한다.
- 검증: JDK 21에서 C9 Maven test(domain 54, C9 94), C10 Maven compile 성공.
