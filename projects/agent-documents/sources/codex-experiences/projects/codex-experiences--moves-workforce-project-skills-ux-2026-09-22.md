# 프로젝트 요구 스킬 통합 입력과 재시도

- 생성·수정 모달에서 검색 후보/선택 스킬 2영역 및 단일 저장 흐름 구현. 기본 정보 2열, 이력 접기, 다크/모바일 적용.
- Forge SQL 다중 문장 트랜잭션 없이 기본정보와 매핑을 저장하므로 부분 실패를 명시한다. 스킬 추가/upsert 후 제외 항목 삭제, 마지막 실제 집합 확인으로 실패/경합을 감지한다.
- 생성 requestId를 사용자별 안정적 UUID로 변환해 응답 유실 재시도를 같은 프로젝트에 연결한다. 불확실한 응답 이후 기본정보 snapshot 잠금은 다음 요청 검증 실패로 풀면 안 된다.
- 생성 재시도는 영구적인 소속 범위 우회가 되면 안 된다. 기존 프로젝트 replay가 scope 밖이면 요청과 현재 스킬이 같은 경우 읽기만 허용한다. 다르면 수정권한 필요 오류를 반환한다.
- 변경 후 프로젝트 목록뿐 아니라 SQL 요구스킬을 소비하는 자원관리 카드와 배정 board/pool의 추천 점수도 갱신한다.
- CommonModal은 Enter 기본동작을 막으므로 picker 버튼 Enter는 전파를 중단해 실제 버튼 활성화를 보장했다.
- locale merge는 파일명 namespace를 자동으로 추가한다. source JSON에 namespace를 다시 감싸면 키가 중복된다.
- 검증: backend 120 suites/1621 tests, frontend 117 suites/1847 tests/1 snapshot, 실제 컴포넌트 Chromium 라이트/다크/390px 및 부분 실패 재시도. 실제 Jira 배포는 별도.

[[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-calendar-overlap-2026-09-22|moves-workforce-calendar-overlap-2026-09-22]]
