# 작업 재개 체크포인트

2026-10-13. 작업은 진행 중이며 전체 완료/배포 상태가 아니다. 사용자 요청으로 작업 단위 커밋 허용, push/deploy는 요청되지 않았다. 추가 제품 동의 질문 없이 진행한다.

- 원 요구 및 설계: 00_input/requirement.md, 01_architect_design.md, 01_ux_flow.md.
- backend: /root/backend가 02_backend_report.md 갱신하며 Workforce 숨김 승인 집계, retention 승인근거 삭제 보호, 보안 문서, 테스트 진행.
- frontend: /root/frontend가 02_frontend_report.md 작성하며 Approval 입력/요청/이력/업무함/설정과 Workforce UI, 저장량 관리자 배너 진행.
- architect: 저장량 안내 구현과 01_audit_storage_review.md 완료. 전용 테스트9개 통과. 필요시 verifier 역할로 재호출.
- root 소유: SettingsFeatureFlags 테스트28개 통과. WorklogRequestService 테스트 포함 인증2suites28개 통과(이후 backend 변경 최종 재검증 필요). WorkforcePublisher의 건별 closeAt tuple10, readCached 연동정책 조회, PeriodCloseService의 touchCertYears, shared contract 검증과 Workforce decoder/vector 동기화, WorklogControlWorker 회귀 테스트 수정 진행.
- root 수정한 shared contract는 _workspace/worklog-approval-simplification/workforce_contract_sync.py 실행으로 Workforce 반영한다. 추후 contract 변경시 재실행 필요.
- root 최근 테스트: 게시/문서2 suites 통과, Worker4실패를 새 정상출처 정책에 맞게 fixture 수정했으나 재실행 전. per-entry 마감 신규 테스트 작성 중.
- 모든 agent 완료 전 build/deploy 금지. 대상 tests 가능. 최종 npm test -- --runInBand, npm run check:bundle, npm run test:ui -- --runInBand, npm run build:ui, forge lint 필수.
- 사용자 감사 요구: 이슈 삭제 시 DB자료 자동삭제 안 됨. 기존 issue:view로 조회 불가한 이슈의 감사 접근 경계 보완 검토 필요. 일반 변경12개월/linked36개월/approval3년, cert/control무기한. 자동삭제없음, 내보내기확정+admin정리. 활성 승인근거 삭제로 잠금/통계 상실 방지 필수.
- 용량 알림:70%주의/85%내보내기권고/95%긴급. 관리자 앱 진입+데이터관리 배너, 자동삭제없음. 추정 200명×240일, 1/3/5건일당 약211–422/633–1266/1055–2109MiB/년. 실측 아님.
- 실행환경: 기본 exec_command는 Get-Location도 helper_unknown_error setup refresh had errors로 실패. require_escalated만 동작. 사용자가 Full access 설정했으나 현재 세션 제한이 유지되거나 helper 오류 지속. 반복승인 매우 싫어함. 기존 승인 명령 재사용/배치 우선. 앱 재시작 가능성으로 이 체크포인트 남김.
- 외부 Workforce repo 기존 untracked(pptx2개, custom-scopes.yaml, LeaderTeamBackfill.test.js, 캡처.png) 보존. root writable repo 외 쓰기는 escalation 규칙 준수.
- 아직 커밋 없음. 완료된 독립 단위만 경로 지정 stage/한국어 이유 중심 메시지, Co-Authored-By/빌드산출물 금지.
