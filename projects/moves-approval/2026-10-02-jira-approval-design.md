# Jira 판 승인 앱 설계 초안 (2026-10-02)

> 상태: 설계 초안 v0.1, 결정 4건 대기. 문서: `C:\CloudJira\moves-approval\docs\jira\JIRA_APPROVAL_DESIGN.md`
> 관련: [[2026-09-29-worklog-governance-analysis]] · [[moves-workforce]] · [[dc-feature-inventory]]

- 대상 3종: 이슈 전환(함수형 workflowValidator로 **강제 가능**) / 워크로그 타임시트(기록+승인 후 변경 감지) / 필드 변경(요청형 적용).
- 워크포스 연동은 **Jira 엔티티 프로퍼티 + Ed25519 서명**. 프로퍼티는 편집 권한자 누구나 쓸 수 있어 서명 없이는 "승인됨" 위조 가능. cloudId·엔티티 id를 서명에 넣어 복사 재사용 차단.
- validator 를 Jira expression(이슈 프로퍼티 읽기)으로 만들면 같은 이유로 위조 통과 → 함수형만.
- 제한선은 데이터 주인이 판정(계획·참여기간·소속=워크포스, 시간 상한·소급·마감=승인 앱), 위반은 결재선에 "예외 승인 단계" 추가.
- 도메인 817줄은 scopeKey·regionHash 외 Confluence 의존 없음 → 재사용. 기간 10~13주 추정.

교훈: 두 Forge 앱 연동은 저장소 공유가 불가하므로 "공용 채널(엔티티 프로퍼티)"과 "신뢰(서명)"를 분리해 설계한다.

## 후속 (2026-10-03) — 입력 통제 재판정 · 리포 생성 · 하네스

- **판단 정정**: "워크로그는 기록+감지까지"는 `jira:timeTrackingProvider`(Forge, Preview)를 모르고 한 판단이었다. 관리자가 앱을 시간 추적 제공자로 고르면 Jira 기본 Log work 버튼·작업 로그 탭이 숨겨진다 → 일반 사용자의 화면 입력은 우리 화면이 거부 가능. 사이트당 하나라 **Tempo 와 공존 불가**, REST·자동화 경로는 문서 미언급(스파이크).
- 미소속자 작성 금지는 Jira 권한 스킴("Work on work items" → 프로젝트 역할)으로 **완전 차단**. 권한엔 기간 조건이 없어 기간 잠금은 권한으로 불가.
- 워크포스 표시: 전부 표시 + 상태 배지, 원가·정산만 "승인분만".
- 결정: 별도 리포 `C:\CloudJira\moves-approval-jira`(Confluence 판 `fa07591` git archive 복사), 타임시트 먼저, 월 단위 기본.
- **복사한 manifest 에 Confluence 앱 id 가 그대로 있었다** → deploy 하면 기존 앱을 덮어쓴다. 즉시 placeholder 로 교체. 교훈: 리포 복제 시 manifest app id 는 첫 번째로 지운다.
- 하네스: 워크포스 4 에이전트 순차 파이프라인을 이식(`approval-harness` 오케스트레이터 + 로드맵 core-port→timesheet-approval→period-lock→workforce-link→transition-approval). 다른 리포에서 시작한 세션에는 커스텀 subagent_type 이 안 잡혀 general-purpose + 역할 파일 Read 로 대체.
- 커밋 대신 `git add -A` 로 기준선을 스테이징해 `git diff` 를 이식 변경분으로 쓴다(커밋은 사용자 요청 시만).

교훈: Jira 쪽 "불가능" 판정은 모듈 목록(manifest reference)을 먼저 훑은 뒤에 내린다 — 플랫폼이 UI 를 통째로 대체하는 확장점을 갖고 있을 수 있다.
