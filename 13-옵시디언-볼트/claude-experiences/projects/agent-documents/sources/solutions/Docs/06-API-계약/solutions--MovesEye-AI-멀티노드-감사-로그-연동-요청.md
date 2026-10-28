# MovesEye AI 멀티노드·감사 로그 연동 요청

## BE 제공 사항

- `ai_chat_request_audit`에 채팅 요청별 `owner_key`, `username`, `question`, `node_id`, 처리 상태를 저장한다.
- 대화 실행은 Redis 분산 잠금으로 같은 `conversationId`의 중복 실행을 차단한다.

## 🔄 FE 요청사항

- AI 대화창의 각 사용자 질문 버블에 질문자 이름을 표시한다.
- 현재 개인 대화만 지원하더라도 메시지 모델에 `authorName` 표시 위치를 두어 공유 대화 기능으로 확장 가능하게 한다.
- 현 API transcript에 사용자 이름이 없다면, 현재 로그인 사용자 이름을 질문 버블에 사용한다. 공유 대화 기능이 도입될 때는 요청별 감사 로그/메시지 author 필드를 API 계약으로 확장한다.

### P0 — `/ai-assistant?c=` 무한 변경 루프 수정

- 대상: `moveseyee_fe/src/pages/ai/AiAssistantPage.tsx`
- 원인: URL `c` → store와 store → URL의 두 `useEffect`가 같은 렌더의 오래된 `conversationId`/`paramId`를 서로 덮어써 `A → B → A → B` 루프를 만든다.
- 수정 원칙: 전체 AI Assistant 페이지에서 URL의 `c`를 정본으로 둔다. 목록 선택은 URL만 변경하고, URL 변경 effect가 `selectConversation`을 수행한다. store 값을 매 렌더 URL에 다시 쓰는 effect는 제거한다.
- 예외: 새 대화가 첫 메시지 전송으로 생성될 때만 생성된 ID를 `replace: true`로 URL에 반영한다. 이 반영은 store의 일반 변화와 분리된 단발성 동작이어야 한다.
- 검증: `?c=A`에서 목록 B 선택, Drawer→전체 페이지 전환, 새 대화 생성, 브라우저 뒤로가기 각각에서 URL이 한 번만 바뀌고 네트워크 요청이 반복되지 않아야 한다.
