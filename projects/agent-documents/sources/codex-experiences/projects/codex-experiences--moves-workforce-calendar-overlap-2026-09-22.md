# Moves RMS 캘린더 겹침 (2026-09-22)

FullCalendar dayGrid의 event-harness marginTop은 다일 이벤트와 다른 날짜에서 시작하는 이벤트의 행 간격이다. 앱 CSS에서 0 !important로 덮으면 단일 개인 일정이 다일 이슈를 덮는다. 실제 설치 bundle과 CSS의 Chromium 비교에서 월간 23px, 주간 29px를 지운 것이 원인이었으며 해당 규칙 제외 시 두 뷰 모두 정상이다. 제품 CSS는 아직 분석만 수행. 증거는 프로젝트 _workspace/calendar-overlap-review.

[[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-deletion-hardening-2026-09-22|moves-workforce-project-deletion-hardening-2026-09-22]]

후속 수정: 사용자 승인 후 FullCalendar.css 강제 margin-top 규칙 제거. Chromium 월간/주간 회귀 검증, 프론트 1822 tests 및 CI build 통과. 스킬 UX는 별도 협의 중.
