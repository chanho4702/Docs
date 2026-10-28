# standalone-worklog — 단독 모드(워크포스 미연동) 워크로그 승인을 상용 수준으로

> 2026-10-21 · 사용자: "워크로그 승인은 단독 상용일때도 쓸만하게 만들어주". 진행 방식: 빠르게, 결정은 리더가 정하고 보류 기록, Codex 최상위 모델(gpt-6-astra xhigh) 검토 후 커밋. docs/ 커밋 금지.

## 조사 결과(Explore, 2026-10-21) — 단독 모드 현재
- 저장 → 자동 요청(`WorklogRequestService.requestAutomatically`) → 업무함·일괄 결정 → 잠금·마감까지 동작. 워크로그 경로에 워크포스 의존 오류 코드 없음.
- 기본 승인자 = `TeamScope.upperLeadsOf` — 우리 DB 팀 명부에서 작성자가 MEMBER 인 활성 팀의 LEAD. 없으면 자동 요청 `NEEDS_APPROVER`(요청 안 만듦).
- `worklogSelfApprovalOf` 는 단독 모드면 무조건 거부(`eligibility.js:17`), 결정 단계도 `APPROVER_NOT_ELIGIBLE`(`WorklogCertificationTargetAdapter.js:54-66`).

## 결정(리더, 2026-10-21)
- D1 **단독 모드 자기 승인 = 연동 모드와 같은 규칙**: 작성자가 명부상 팀장(LEAD)이고 위 단계 팀장(`upperLeadsOf`)이 비었을 때만 본인 결재 허용. 팀원은 계속 거부("팀장 부재를 자기 승인으로 처리하지 않는다" 유지). 조회 실패 = 거부. 근거: 2026-10-14 사용자 "팀장은 본인 결재 가능해야"(연동), 2026-10-21 "본인 요청 본인이 승인 해도 됨"(상태 변경).
- D2 단독 모드에서도 "내 팀·기본 승인자"를 보여 준다(명부 기반 identity).
- D3 연결 대기(스위치 켬 + 미페어링)는 서버처럼 단독으로 판정·표시.

## 요구 (서버 — 이번 backend 단계)
1. D1: `worklogSelfApprovalOf` 단독 분기 + 호출부 `selfApproval`·어댑터에 명부 팀장 여부·상위 팀장 유무를 넘긴다. `eligibility.test.js` 등 갱신. 자동 요청에서 상위 팀장이 없는 팀장 본인 기록은 본인을 승인자로 요청(연동 모드 "상위 팀장 있으면 그 사람만, 없으면 본인"과 동일). 후보 목록(`candidates`)에 본인 포함 규칙도 연동과 동일.
2. D2: `identity()`(`WorklogRequestService.js:80-88`)가 단독 모드면 명부(`memberTeamOf`/`upperLeadsOf`/LEAD 팀)로 채운다 — 응답 shape 은 연동과 같은 키, `status:'ROSTER'`, `selfApprovalAllowed` 는 D1 판정. 화면 소비처 `WorklogApprovalModeContext` 가 쓸 수 있게 resolver 응답 shape 을 보고서에 적는다.
3. 팀 수 확인 — 설정 화면이 "팀 0개" 경고를 띄울 수 있게, 기존 응답(설정 모드 요약 등)에 활성 팀 수 또는 기본 승인자 미정 기록 수를 싸게(SQL ≤ 1) 싣는다. 유휴 SQL 예산 준수(빈 상태 쿼리 수 테스트).
4. 알림 누락(두 모드 공통, 확인 필요): 트리거 경로 재요청(`WorklogControlDetector.js:153-156` → `submit` 의 `request=null` 분기, `requestRepo.createRequest` 직접)에서 결재자 알림이 나가는지 확인. 저장소 `createRequest` 가 알림 행을 넣는다면 문제 없음(상태 변경 자동 요청에서 확인됨: ApprovalRepository.createRequest 가 approval_notification 삽입). 실제로 누락이면 고친다.
5. 저장 시 승인자 지정 — 서버는 `payload.approverId` 를 이미 받는다(`WorklogService.js:635-636`). 단독 모드에서 그 경로의 검증(후보 범위·이슈 열람·자기 승인 D1)이 맞는지 확인.

## 요구 (화면 — 다음 frontend 단계, 참고)
- 팀 0개 경고 + 팀 명부 링크, 단독 모드 "내 팀·기본 승인자" 표시, 팀 탭 문구에 "워크로그 기본 승인자" 추가, "결재선 함께 씀" 오안내 수정, 연결 대기 문구, 시간 추적 제공자 안내 펼침 + 출처 미증명 안내, `NEEDS_APPROVER` 시 저장 화면에서 승인자 선택.

## 완료 기준
- BE 테스트 전체 통과(현재 2,986), 계약 테스트(권한 3단계·featureGate·유휴 SQL) 통과, asUser/asApp 규칙(불변식 8) 위반 없음.
- `02_backend_report.md` 에 실제 응답 shape 과 바뀐 판정 표.

## 범위 밖
- 워크포스 리포 변경, 새 SQL 테이블(필요하면 보류로 적고 멈춤), 연동 모드 동작 변경.
