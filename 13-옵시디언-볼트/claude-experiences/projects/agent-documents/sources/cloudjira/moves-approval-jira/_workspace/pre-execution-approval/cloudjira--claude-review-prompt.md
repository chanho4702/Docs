당신은 Atlassian Forge/Jira 승인 앱의 출시 전 독립 심사자다. 이 저장소를 읽기 전용으로 검토하고 한국어로 평가하라. 파일을 수정하거나 명령을 실행하지 마라.

검토 범위는 현재 working tree 전체이며, 특히 다음 보고서를 먼저 읽어라.
- _workspace/transition-auto-apply/01_architect_design.md
- _workspace/transition-auto-apply/02_backend_report.md
- _workspace/transition-auto-apply/03_frontend_report.md
- _workspace/transition-auto-apply/04_verifier_report.md

사용자 요구:
1. 상태 변경은 workflow validator로 승인 전에 막고, 최종 승인 후 고정된 Jira transition을 요청자 권한으로 자동 실행한다.
2. 승인 상태와 실제 Jira 적용 상태를 분리한다. 모호한 POST 결과는 UNKNOWN으로 두고 재전송하지 않으며 정확한 증거만 대조한다.
3. 업그레이드 전 기존 요청은 LEGACY_MANUAL로 남고 신규 요청만 AUTO다.
4. 워크로그 기본 모델은 Jira 원본을 먼저 기록한 뒤 인증하는 것이다. UNVERIFIED/PENDING/VERIFIED/REJECTED/CHANGED_AFTER_VERIFICATION을 제공하고, 인증 뒤 원본 수정·삭제 시 인증을 무효화한다.
5. 기존 WORKLOG_CREATE 사전승인은 선택 가능한 고통제 호환 모드로 유지하고 timesheet 승인과 격리한다.
6. 한영 UI/가이드/Marketplace 심사 문서에서 제약과 권한을 충분히 고지한다.

반드시 확인할 항목:
- AGENTS.md/CLAUDE.md 불변식, resolver guardedDefine + PermissionMap + CONTROLLER_REGISTRARS
- SELF mutation의 SQL owner predicate, 모든 CAS의 rev 증가, 조건부 결정
- asApp transition write가 없는지, offline api.asUser(accountId) 범위와 manifest allowImpersonation 최소성
- 동시 승인/trigger/executor race에서 POST 최대 1회와 승인 소비 최대 1건
- marker 이후 ambiguous 결과 재POST 금지, exact changelog reconciliation이 다른 요청을 성공 처리하지 않는지
- worklog fingerprint가 시간·날짜·설명·visibility 변경을 검출하면서 원문을 불필요하게 복제하지 않는지
- history 설정/수집 범위와 무관하게 certification 무효화가 유지되는지
- Inbox/Notification batch enrichment의 열람 권한·데이터 범위·N+1
- UI가 승인 완료와 적용 완료, preapproval과 certification, certification과 timesheet를 혼동시키지 않는지
- scheduled trigger interval 제약 및 hot-path no-throw/budget/cursor
- migration 호환성, retention/export, locale/document 사실성

검증 근거:
- Backend 전체 96 suites / 1,351 tests PASS
- UI 전체 45 suites / 375 tests PASS
- 추가 five-minute orchestrator 3 suites / 31 tests PASS
- UI production build 성공(Atlaskit sourcemap/CSS 경고만)
- forge lint: No issues found
- 실제 Jira development 배포/설치/end-to-end는 아직 수행하지 않았다.

출력 형식:
1. 판정: PASS / CONDITIONAL PASS / FAIL 중 하나
2. P0, P1, P2, P3 순서의 발견 사항. 각 항목에 파일:라인, 실제 실패 시나리오, 수정안을 포함한다. 근거 없는 추측은 적지 않는다.
3. Marketplace/보안/사용성 관점의 강점
4. 실제 Jira에서 반드시 확인할 항목
5. 출시 차단 항목을 한 줄로 명시한다. 없으면 '출시 차단 코드 결함 없음'이라고 쓴다.
