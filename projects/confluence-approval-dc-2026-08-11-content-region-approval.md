# Confluence Approval DC 콘텐츠 영역 승인 연동

- 영역 식별자는 macro body, 위치, Confluence macro instance id가 아니라 작성자 제공 `key`만 사용한다. 이 값이 페이지 편집·복사·이동 뒤에도 승인과 감사 기록을 연결하는 명시적 계약이다.
- macro 렌더링에서 `ApprovalWorkflowService.findOpenRequest`를 호출하면 lazy expiration이 저장을 일으킬 수 있다. 렌더링 경로는 AO의 read-only 영역 최신 요청 조회를 사용하고, 요청 행·승인자·감사 이벤트의 세 읽기로 제한했다.
- 페이지 버전 상승 만료는 기존 `expireForPageVersion`이 pageId의 모든 resourceType을 순회하므로 영역 요청에도 별도 어댑터 상태 전이 없이 적용된다.
- 페이지와 영역의 승인 UI는 하나의 JavaScript 흐름을 공유하되, REST는 기존처럼 page EDIT/VIEW와 actorKey를 서버에서 검증한다.
