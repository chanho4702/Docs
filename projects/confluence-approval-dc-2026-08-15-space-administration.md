# Confluence Approval DC: 스페이스 적용 관리자

- `ApprovalAdministrationSettings`는 PluginSettings에 위임 관리자 user key와 적용 스페이스 key를 보관한다.
- 처음 저장되기 전에는 기존 설치와의 호환성을 위해 모든 스페이스를 적용 상태로 간주한다. 첫 저장부터 명시적으로 선택한 스페이스만 새 승인 요청을 생성할 수 있다.
- REST `POST /administration/spaces`와 승인 생성 endpoint 모두에서 권한과 적용 여부를 확인한다. UI 은닉만으로 접근을 막지 않는다.
- 위임 관리자는 적용 스페이스만 조정하고, 전역 정책·Flow·그룹 설정은 Confluence 관리자만 변경한다.
- `/users/space`는 현재 사용자의 페이지 VIEW 권한을 먼저 검사하고, 동일 스페이스를 볼 수 있는 사용자만 이름·계정·이메일 기준으로 10명씩 반환한다.
- 승인·참조 사용자 picker는 focus 시 첫 10명을 보여 주며 검색어 변경 시 1페이지로 돌아간다. 이전/다음 10명 제어는 input별 WeakMap 상태로 분리해 서로 간섭하지 않는다.
- 설정 화면은 `/plugins/servlet/approval-space-settings`이며 헤더 popover에서 진입한다.
- 2026-08-15 `mvn -pl approval-confluence9 -am package` 성공: domain 54, C9 113 tests.
