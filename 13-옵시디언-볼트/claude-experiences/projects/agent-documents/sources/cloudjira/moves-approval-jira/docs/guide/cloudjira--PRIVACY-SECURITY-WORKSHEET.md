# Privacy & Security 작성 근거표 — 내부용

실제 제출 폼의 질문에 맞춰 조직 담당자가 확정할 자료다. 아래 구현 사실을 법적·조직 운영 보증으로 확대하지 않는다.

| 주제 | 코드에서 확인한 사실 | 담당자 확인 사항 |
| --- | --- | --- |
| 저장 | manifest SQL·KVS, 승인/변경 이력 저장 | production 데이터 지역·보관 정책 |
| 사용자 데이터 | account ID·결정·사유·서명 관련 정보·워크로그 설명/지문 | Privacy Policy의 범주와 처리 목적 일치 |
| 통신 | dynamic webtrigger, 서명된 Workforce 채널, backend egress | production 실제 허용 호스트·연동 설명 |
| 권한 | read:jira-work, read:jira-user, write:jira-work, storage:app, report:personal-data | 설치 동의 화면과 리스팅의 최신 권한 일치 |
| impersonation | 상태 자동 적용 전용 offline 권한 코드 | 해당 기능 출시 전 실행자·동의 검증 |
| 접근 제어 | resolver 가드 및 이슈/작성자/팀 범위 확인 | 실제 권한 없는 계정·export·숨김 기록 검증 |
| 보관·삭제 | 보관 설정, 내보내기 확인, 보호 원장 제외 | 법적 보관 기간·삭제 요청 처리 절차·담당자 |
| 앱 제거 | 통제 해제 작업과 preUninstall 보조 처리 | 잔여 0 확인 및 제거 후 데이터 정책 |
| 지원 | 고객 오류 코드와 진단 UI | 공개 지원 URL·운영 시간·응답 목표 |
| 사고 대응·인증 | 코드만으로 조직 운영 체계나 인증 증명 불가 | 보안 연락처·사고 대응·침투 테스트·인증 증빙 |

공식 [Privacy and Security 안내](https://developer.atlassian.com/platform/marketplace/security-privacy-tab/)의 현행 제출 질문을 기준으로 최종 입력한다. 답변을 확인하지 않은 항목은 임의로 Yes 처리하지 않는다.
