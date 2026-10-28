# Moves Approval G3 디렉터리 picker (2026-08-28)

Confluence Cloud에는 사용자 전수 목록 API가 없으므로 설정 화면을 DC처럼 채울 수 없다. 설정 관리자는 저장된 `accountId`를 `user/bulk`로 hydrate해 기본 후보이자 선택 목록에 먼저 노출하고, 두 글자 이상 검색 결과를 그 아래에 합친다. 승인 그룹은 `GET /wiki/rest/api/group`의 모든 페이지를 이어 받아 목록을 채우고, 저장된 그룹 이름을 현재 `groupId`와 다시 연결한 뒤 `membersByGroupId`로 구성원을 미리 보여 준다.

Confluence v1 그룹 API는 `cursor`가 아니라 `start` 기반이다. 프론트와 resolver의 공용 계약은 `{nextCursor, hasMore}`로 유지하되, 서비스 경계에서 `_links.next`의 `start`를 불투명 cursor처럼 전달했다. 완성된 query string을 `route` 보간값 하나로 넘기지 않고 각 값만 보간해야 필터가 URL 인코딩으로 무력화되지 않는다.

디렉터리 REST는 브라우저에서 직접 호출하지 않고 `SELF` resolver와 `asUser()`를 경유한다. 사용자 응답은 `expand=operations`로 Confluence 관리자 여부를 판정하고, `accountStatus !== 'active'`이면 텍스트 배지를 표시하며 신규 선택을 막는다. 표시명은 저장하지 않고 렌더 시점에 다시 조회해 이름 변경을 반영하고 보관 개인정보를 줄인다.

검증은 백엔드 115건, 프론트 13건, UI production build, `forge lint`를 통과했다. Atlaskit의 기존 source-map 및 CSS minimizer 경고는 남지만 compile 실패는 없었다.
