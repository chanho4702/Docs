# Moves Approval Jira: 사전 승인·사이드 메뉴·최적화

2026-10-06. [[moves-approval-jira-marketplace-bilingual-guide-2026-10-05]] 후속 작업.

## 결정과 구현

- 승인된 입력안을 SQL에 고정하고 요청자 asUser로 Jira 워크로그를 등록한다. 결재자가 승인했다고 오프라인 요청자의 작성자로 자동 등록하지 않는다.
- 프로젝트의 허용 Flow·기본 Flow와 이슈 패널 선택을 연결했다. 매번 결재 단계를 구성하지 않는다. native Jira custom field는 구현하지 않았다.
- 승인 필수 정책은 직접 createWorklog 호출에서도 검사한다. 새 테이블·정책 확인 실패 시 앱 입력을 막는다. 외부 REST·자동화·다른 앱의 쓰기까지 막는 것으로 안내하지 않는다.
- SQL CAS와 Jira POST는 분산 transaction이 아니다. 실제 POST 후 결과가 모호하면 UNKNOWN을 유지하고 재POST하지 않는다. 대조 marker는 상관관계 표시이며 권한·성공 증명이 아니다. POST 전 검사 실패는 WAITING으로 복구한다.
- LEFT sidebar와 11개 설정 lazy 로딩, 알림 lazy 로딩, 정책 변경 후 timesheet 캐시 갱신을 적용했다. narrow 화면의 펼침 버튼이 실제로 이름을 보여 주도록 초기 접힘과 CSS 조건을 맞췄다. 사용자의 전체 페이지 요구에 따라 워크포스 manifest의 globalPage layout: blank와 sidebar/main 독립 스크롤을 참조했다.
- PrincipalResolver의 module Map은 warm runtime에서 권한 회수 결과를 숨길 수 있다. 관리자 조회를 InvocationScope.memo로 제한하고 요청 사이에는 다시 확인한다.
- 워크로그 승인 목록은 JOIN으로 승인 상태를 가져온다. 각 행 전체 상세 조회를 반복하지 않고 cursor로 다음 페이지를 읽는다.
- 이미 상신한 요청은 확장 그룹 구성원·Flow 표시 정보·config/binding revision·다른 사용자의 현재 선택 변화로 무효화하지 않는다. 현재도 필수/프로젝트 활성이고 원래 Flow가 허용되며 raw 승인 단계 구조가 같을 때 유효하다.
- 승인 엔진은 DRAFT 요청, approver, event, inbox, LIVE를 여러 SQL로 기록하고 일반 load는 LIVE만 읽는다. 부분 DRAFT 존재 여부를 안전하게 구분하지 못하므로 FAILED/CREATING을 임의 재생성하지 않고 지원 확인으로 fail-closed한다.

## 문서와 검증 범위

한영 가이드 14쌍, 전체 Markdown 31개를 준비했다. 코드 기준으로 워크포스 상대 앱의 연동 기능과 양쪽 서명 KEYRING이 준비되지 않아 설치만으로 연동 완료라고 안내할 수 없다. 최종 시험·빌드 결과는 작업 검증 보고서를 참조한다.

실제 Jira author·property 원자 기록·Forge SQL 마이그레이션·iframe 동작은 배포 후 별도 실측 대상이다. 커밋·배포·Marketplace 제출은 이번 작업에서 실행하지 않았다.
