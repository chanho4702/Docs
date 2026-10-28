# Confluence Approval DC 배치 6b QA 재작업

- 업무함의 상태 지표는 5칸 grid가 아니라 상태 칩 레일 단일 출처로 유지한다.
- requester 권한 표시는 REST 서버 판정과 동일하게 userKey와 username을 모두 대조하고 null을 방어한다.
- 업무함 URL 필터는 `replaceState`로 보존해야 회수 후 `location.reload()`에도 상태가 복원된다.
- 로컬 UTC 표기는 분 단위 오프셋을 유지해야 한다. `UTC+5:30` 같은 시간대가 실제로 존재한다.
- Maven 검증은 JDK 21이 필요하지만 당시 환경에는 JDK 8/11/17만 설치되어 있어 enforcer 단계에서 중단되었다.
