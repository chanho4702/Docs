# Moves Approval 워크로그 승인 범위와 팀장 자기 승인

연동 모드의 승인 대상은 사이트 기본 정책만으로 판단하면 안 된다. `workforceLinkEnabled=true`일 때는 서명 검증을 마친 이슈 연결 신호의 `effective.issueLinked===true`를 함께 요구해야 하며, 자동 요청은 원장 관찰·아웃박스·요청 INSERT보다 앞에서 제외해야 불필요한 저장과 통계 오염을 막을 수 있다.

자기 승인 예외는 Approval 명부의 팀장 여부로 열지 않는다. 서명 검증된 `movesRms.org`의 `leads[]`가 있는 Workforce 팀장만 후보·수동 요청·자동 요청에서 허용하고, 공통 결정 엔진의 `beforeDecide`에서 현재 연동 모드·이슈 연결·팀장 자격을 다시 확인한다. 이 방식이면 기존 CAS와 append-only 승인 이벤트를 그대로 사용하면서 `actor_key===requester_key`로 자기 승인을 감사할 수 있다.

연결이 해제되어도 기존 요청과 감사 이력은 지우지 않는다. 신규 요청과 재승인만 막고 기존 일반 승인자의 결정은 유지하되, 자기 승인은 현재 자격이 필요한 예외이므로 연결 해제 뒤 결정 직전 거부한다.

관련 문서: `C:\CloudJira\moves-approval-jira\_workspace\worklog-settings-mode-separation\02_backend_report.md`
