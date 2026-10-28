# 실행 전 승인과 정책 자동 적용 요구

작성일: 2026-10-06. 상태: 합리적인 기본안을 사용자에게 명시한 뒤 구현 설계 완료.

## 사용자 의도

1. 승인받은 뒤에 상태 변경과 워크로그 입력을 실행한다.
2. 실제로 강제할 수 있는 범위·우회 경로·설치 조건·적용 실패를 사용자에게 충분히 고지한다.
3. Workforce 연동을 자세하게 설명한다(가이드는 별도 에이전트 담당).
4. 매번 Flow를 설정하고 별도 상신하기보다 앱 필드에서 정책을 선택하면 자동으로 적용한다.

## 초기 비교 질문

- 워크로그 사전승인 단위: **건별 입력안을 승인한 후 등록** 또는 **기간·시간 한도를 먼저 승인한 후 그 안에서 입력**.
- “앱 필드” 위치: **Moves Approval 이슈 패널 dropdown** 또는 **실제 Jira custom field**.

두 축을 비교한 뒤 리더가 사용자에게 건별 승인과 패널 selector를 기본안으로 명시하고 구현 설계를 진행했다. 이는 질문에 사용자가 명시 답변했다고 기록한 것이 아니다. 후속 사용자 답변이 오면 해당 범위를 재검토한다.

## 구현 기본안

- 건별 입력안을 immutable snapshot으로 자동 승인 요청하고 승인 후 요청자 본인 asUser로 등록한다.
- project admin의 required/allowedFlowIds/defaultFlowId 설정 아래에서 issue edit 사용자가 허용 Flow를 패널에서 선택한다. 사용자 None 해제로 우회할 수 없다.
- 실제 Jira custom field·기간 허가·KVS latch·별도 preset CRUD를 제외한다.
- 독립 policy/binding/entry 3테이블과 기존 Flow를 재사용한다. schema 미준비는 앱의 생성 mutation을 일시 거부하며 정상 readiness에서 미설정 project는 기존 입력을 유지한다.
- 기존 전환 rule의 Flow 자동 고정과 validator fail-open은 유지하고 고지를 강화한다.
- 구현 계약은 `01_architect_design.md`다. 초기 옵션 비교는 `01_options_analysis.md`에 보존한다.

## 설계·구현 검증 기준

- 이미 구현된 SQL 규칙 기반 Flow 자동 결정과 새 기능을 구분한다.
- 상태 전환 validator의 적용 범위와 현행 fail-open 조건을 정확히 설명한다.
- 워크로그 즉시 등록·기간 사후 승인과 실행 전 승인 사이의 차이를 정리한다.
- 요청자 작성자 보존, Jira 권한/REST 우회, POST timeout 중복 위험을 설계 제약으로 명시한다.
- 기존 TargetRegistry를 활용하는 옵션, SQL policy binding, custom field의 권한·manifest·동기화 비용을 비교한다.
- 선택한 기본안의 resolver·SQL·adapter·UI 계약과 실측 목록을 확정하고 순차 구현·검증한다.

## 단계별 범위

architect는 분석·설계 문서만 작성한다. 후속 backend/frontend는 01_architect_design 계약에 따라 구현하며, 모든 에이전트 종료 후 리더가 검증한다. 배포·커밋은 별도 사용자 지시를 따른다. 기존 sidebar 작업과 기존 사용자 변경을 보존한다.
