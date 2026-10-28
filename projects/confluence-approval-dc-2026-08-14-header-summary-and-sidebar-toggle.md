# Confluence Approval DC 상태형 헤더와 사이드바 경계 toggle

공식 Confluence Server web-item 문서의 전역 header 위치인 `system.header/left`에 직접 `승인` web-item을 두고, 일반 페이지에서 `approval.js`가 상태형 popover로 확장한다. `system.navigation`은 C9의 공식 header location이 아니어서 실제 서버에서 보이지 않았고, 교체 후 다시 패키징했다. popover는 내 차례, 마감 임박, 읽지 않은 알림, 업무함, 내 서명과 관리자 전용 설정 링크를 제공한다.

`/header-summary`는 페이지 제목이나 상세 목록 없이 사용자별 count만 반환한다. unread count는 AO `count` query로 집계한다. 각 승인 후보는 기존 `canView` 서버 권한 검증을 거친다.

앱 사이드바 접기 toggle은 `right:-13px`으로 조정해 지름 26px 원형 버튼의 중심이 border-right 경계선과 일치하게 했다.
