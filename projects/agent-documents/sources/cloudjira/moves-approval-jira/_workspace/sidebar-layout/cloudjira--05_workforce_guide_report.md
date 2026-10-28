# Workforce 연동 가이드 상세화 보고

기준일: 2026-10-06. 변경 책임 범위는 `docs/guide/{ko,en}/10-workforce-integration.md`와 이 보고서이다. 제품 코드·locale·manifest·상대 저장소는 읽기만 했으며 테스트·빌드·배포는 실행하지 않았다.

## 변경 내용

한·영 동형 8개 절로 설치 전제와 역할, 데이터 방향, 실제 설정 항목, 게시·수신 진단, 승인 1건 시험, 재게시 범위, 장애 대응, 해제·복구 체크리스트를 작성했다. 키·상대 구현이 준비되기 전에 연결 성공을 기대하지 않도록 준비 상태를 명시했다. 사전 승인 워크로그와 이미 기록된 워크로그의 타임시트 승인을 구분했다.

## 확인 근거

- `static/ui/src/features/settings/WorkforceLinkSettings.jsx`, `workforceLinkModel.js`, `locales/{kr,en}/workforce.json`: 실제 화면 이름, 스위치 즉시 저장, 서명/사이트/게시/수신 카드, 최근 실패 20개, 실패분/전체 재게시 버튼.
- `src/resolver/workforce/WorkforceLinkService.js`, `WorkforceSigner.js`: 관리자 resolver, 상태 판정, 키 configured/inKeyring/trustedPeerKids 의미, 재게시 예약.
- `WorkforcePublisher.js`, `WorkforceLinkRepository.js`: 5분 스윕, 3분 안정화 대기, 현재/직전 연도 범위, 대상 집합, 겹치는 문서 카운트, 8회 이상 실패 24시간 재시도, 일일 대조.
- `WorkforcePropertyGateway.js`, `WorkforceInbound.js`, `WorkforceOrgSource.js`, `src/resolver/timesheet/TimesheetRouting.js`: 수신 asUser/게시 asApp, 이전 검증 자료 sticky 유지, 명부 fallback 조건, 팀장/PM 예외 경로.
- `src/integration/workforce/{keyring,contract}.js`: 빈 키링, 환경별 신뢰 키, 계약과 USER 게시 단위.
- `_workspace/workforce-link/{02_backend_report,04_spike_todo}.md`: 플랫폼 실측 미완료와 키 배포 전제.
- 상대 `C:/CloudJira/moves-workforce/{src,static/ui/src,locales,manifest.yml}` 읽기 검색: `movesApproval`, `movesRms.org/check/pm`, `rms.org`, `approval.timesheet`, `Ed25519` 관련 송수신·연동 메뉴를 찾지 못했다. `MOVES_LINK_PROPERTY_KEY`는 별개 `movesRmsLink` 이슈 연결 기능이다. `WorkforceReader` 이름의 구현 파일은 Approval에서도 찾지 못하여 실제 수신 구성요소인 Inbound/OrgSource/PropertyGateway를 근거로 사용했다.

## 검증과 미완료

한·영 절 순서·표/절차/체크리스트 항목 수, 상대 링크, UTF-8 및 공백을 정적으로 확인했다. 실제 설치 버전·키 배포·Forge runtime 서명·타 사용자 프로퍼티 쓰기·상대 수신/정산·제한 공개 워크로그 지문·스케줄 지연은 확인하지 않았다. 과거 단위 테스트 보고는 실계정 재현 증빙으로 사용하지 않았다.

독자 관점에서 '정상/게시됨'을 연결 완료로 해석하거나 전체 재게시를 모든 사용자·과거 기간으로 해석할 가능성을 차단했고, 수신 실패가 무조건 즉시 명부 fallback으로 이어진다는 기존 문장을 sticky 유지 조건으로 정정했다. 공급자의 상대 기능·공개키·환경 키 준비 후 승인 1건 및 예외 단계 실측이 필요하다.
