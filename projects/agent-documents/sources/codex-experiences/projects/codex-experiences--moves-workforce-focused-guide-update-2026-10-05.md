# Moves Workforce 가이드 한정 수정 — 2026-10-05

- 요청: 프로젝트 관리의 스킬 등록·협업 모드 추가, 통합 대시보드의 차트별 설명 재구성. 한영 4페이지 한정이며 사용자가 넣은 이미지·편집을 보존한다.
- 결과: 프로젝트 KO171573335 v13 / EN204046601 v8, 대시보드 KO173015041 v6 / EN204047167 v4. 나머지 86페이지의 버전 동일. 대시보드 언어별 25차트를 실제 UI 순서로 구성하고 기존 계산·해석 셀 각50개 보존.
- 이미지: storage의 ac:image 정규식만으로는 새 편집기의 이미지가 검출되지 않는다. ADF mediaSingle/media로 확인해야 한다. 프로젝트 KO의 실제 첨부1개 및 크기·배치·캡션을 전후 동일함을 확인했다.
- 프로젝트 편집: 전체 본문을 재붙여넣지 않고 마지막 텍스트 뒤에 추가한다. AX Control+End는 이번 연결에서 커서를 끝으로 보내지 못했다. 실패한 삽입은 Undo로 원래 본문 복원 확인 후 AX selectText(cursor_after)와 locator ArrowRight/Enter로 추가 위치를 지정했다. 게시 전 기존 텍스트가 prefix인지 확인했다.
- 기존 EN 편집 초안은 공개 본문과 달리 intro info panel·표 너비가 있었다. 사용자 초안의 서식을 되돌리지 않고 유지했다. 검증은 이미지 노드 동일, 텍스트·marks·본문 구조 동일을 확인하되 panel wrapper/표 colwidth는 구분한다.
- 정확성: 협업 읽기는 프로젝트 참여자+조회 범위이며 설정 쓰기 권한과 구분. ON 확인/OFF 즉시 요청, 토글 별도 즉시 저장. Gantt 적용, user-only 연관관계 예외는 작업 상세 영역으로 한정. 포트폴리오 전역 문제 이슈 TOP50은 프로젝트 범위 필터까지 보장하지 않는다.
- 증빙: `_workspace/bilingual-guide-preview/project-additions/verification.json`, before/after ADF·90페이지 버전. 다음 작업은 최신 Confluence 본문이 기준. 과거 전체 generator는 사용자 수정·이미지를 지울 수 있어 재실행 금지.
- 관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-control-reference-2026-10-05|moves-workforce-control-reference-2026-10-05]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-bilingual-completion-2026-10-05|moves-workforce-bilingual-completion-2026-10-05]].
