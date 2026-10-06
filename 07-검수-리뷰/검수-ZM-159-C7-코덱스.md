필수 결함은 발견하지 못했습니다. 구현은 승인 가능하며, 테스트 보강 권장 2건이 있습니다.

R1 · 권장 · [ProblemTruncationNotice.test.tsx:12](C:/worktrees/zm-159-fe/src/__tests__/ProblemTruncationNotice.test.tsx:12) · 테스트가 독립 컴포넌트만 검증해 실제 `ProblemList` 연결과 필터→배너→표 배치를 고정하지 못함 · 컴포넌트가 화면에서 제거되거나 위치가 바뀌어도 현재 3개 테스트는 모두 통과하며, 실제 `kr.json`·`en.json` 문구도 mock 때문에 검증되지 않음 · `ProblemList` 통합 테스트에서 API 응답의 `truncated/scanLimit` 전달, RECENT 미노출, 세 요소의 DOM 순서와 실제 locale 키를 함께 검증할 것을 제안.

R2 · 권장 · [EventServiceTest.java:460](C:/worktrees/zm-159-be/src/test/java/com/dmove/moveseye/event/EventServiceTest.java:460) · 20,001건 테스트가 “최신 20,000건” 보존을 직접 고정하지 못함 · 모든 fixture의 `occurredAtMillis`가 동일하고 현재 단언은 `total=20,000`과 요청 `limit=20,001`뿐이라, `subList`가 앞쪽 대신 뒤쪽을 선택하는 회귀는 잡지 못함 · 시각과 식별자가 구분되는 fixture를 사용해 최신 경계 항목은 남고 가장 오래된 1건은 제외되는지 단언할 것을 제안.

확인 결과 `AlertHistoryQuery`의 `limit=20,001`은 어댑터에서 `event.get`에 그대로 전달되며 `clock DESC` 정렬과 반환 순서가 보존됩니다. 3인자 생성자의 다른 호출부는 없고 Swagger에는 새 record 필드가 자동 반영됩니다. AI 서버 소비자는 `JsonNode`에서 필요한 필드만 읽어 추가 필드의 영향을 받지 않으며, FE 공통 `TResponseList`도 오염되지 않았습니다. 지시대로 빌드·테스트는 실행하지 않았습니다.