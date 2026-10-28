# Moves Approval 고객 가이드 (2026-08-31)

## 결정

- Confluence에 바로 붙여 넣을 수 있는 Markdown 고객 가이드를 `docs/moves-approval-customer-guide-ko.md`에 작성했다. 사용자 안내, Marketplace 설치, 관리자 초기 설정, 전역 정책 기본값, FAQ, 운영 점검표를 하나의 문서에 포함했다.
- 전체 페이지 결재의 본문 편집은 요청을 자동 종료하지 않는다. 요청자는 “요청 이후 수정됨”, 승인 완료 건은 “승인 후 수정됨”으로 표시하며, 요청자 또는 편집 권한자가 새 버전으로 재요청할 때만 이전 요청이 `SUPERSEDED`로 종료된다. 결재 영역은 매크로 삭제 때만 자동 회수된다. 고객 문서에서 이 차이를 분명히 적었다.
- 접근 제한은 결재자·설정 관리자를 먼저 등록한 뒤 일반 계정으로 검증하고 켜도록 안내했다. 제한을 켜면 등록되지 않은 일반 사용자는 요청과 결재함을 사용할 수 없고, Confluence 관리자·설정 관리자는 제외된다.
- Confluence 댓글 알림과 앱 내 알림을 구분했다. 마감 임박·미처리 반복 알림은 앱 내 알림만 생성하고, 페이지 @멘션 댓글은 결재 요청·단계 진행·최종 결과에만 선택적으로 생성된다.

## 검증

- 독립 독자 검토로 설치, 접근 제한, 스페이스 제한, 문서 편집, 재요청, 알림 흐름의 모호성을 점검하고 수정했다.
- `git diff --check`로 문서 변경의 공백 오류가 없는지 확인했다.

## 관련

- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-g1-status-flow-2026-08-28|moves-approval-g1-status-flow-2026-08-28]]
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-g2-space-settings-2026-08-28|moves-approval-g2-space-settings-2026-08-28]]
- [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-approval-f4-notification-settings-2026-08-26|moves-approval-f4-notification-settings-2026-08-26]]
