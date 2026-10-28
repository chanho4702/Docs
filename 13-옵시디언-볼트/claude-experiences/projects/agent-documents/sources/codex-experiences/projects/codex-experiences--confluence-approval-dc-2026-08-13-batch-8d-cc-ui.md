# Confluence Approval DC 배치 8d CC UI

- 요청 모달의 CC 선택 상태는 form별 `WeakMap`에 사용자·그룹 배열을 분리해 보관했다. 승인자 picker와 같은 검색 endpoint를 쓰되 `data-approval-cc-*` selector로 이벤트 위임 충돌을 막았다.
- 패널·영역 매크로 상세의 CC 이름은 요청당 `ApprovalCcStore.findRecipients` 1회 후 기존 렌더 단위 이름 `Map` cache로 변환했다. CC가 없으면 사용자 조회가 발생하지 않는다.
- 업무함 `cc` view는 `/mine/cc`의 공통 목록 응답을 그대로 사용하고, endpoint별 부분 badge 응답은 기존 `hasOwnProperty` guard와 bootstrap badge 보충 규칙을 확장했다.
- 8c 잔여로 승인 PIN step을 열 때 회수 step과 버튼 상태를 복구하고, 모든 PIN input에 `autocomplete="new-password"`를 적용했다. 내 서명 화면은 기존 field block과 색상 token으로 세로 정렬했다.
- 검증: C9 domain 54건 + adapter 112건 성공, C10 compile 성공, `approval.js`와 업무함 text block script 2개 `node --check` 성공.
- 설계의 stale domain class 삭제는 실행 정책이 재귀 삭제를 차단해 수행하지 못했지만, C9 게이트에서 adapter 47개 source가 재컴파일됐다.

관련 기록: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--confluence-approval-dc-2026-08-13-batch-8b-cc|confluence-approval-dc-2026-08-13-batch-8b-cc]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--confluence-approval-dc-2026-08-13-batch-8c-final|confluence-approval-dc-2026-08-13-batch-8c-final]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--confluence-approval-dc-2026-08-13-batch-8c-qa-rework|confluence-approval-dc-2026-08-13-batch-8c-qa-rework]]
