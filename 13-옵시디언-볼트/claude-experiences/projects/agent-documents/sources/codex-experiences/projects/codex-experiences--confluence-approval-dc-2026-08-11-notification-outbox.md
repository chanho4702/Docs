# Confluence Approval DC C9 알림 outbox

## 구현

- C9 adapter에 `APR_NOTIF` AO entity를 등록하고 `(eventId, recipientKey, channel)` 조회 후 insert 방식으로 멱등 적재를 구현했다.
- 감사 이벤트를 source of truth로 사용해 요청 생성, 승인, 반려, REST 만료, sweep 만료, page update 만료 직후 outbox 적재를 호출한다. 적재 실패는 업무 결과를 실패시키지 않고 warn 로그만 남긴다.
- `IN_APP` 채널을 인터페이스로 분리하고 cluster 단일 drain scheduler에서 `PENDING` 행을 batch 50으로 처리한다. 실패는 1분부터 최대 1시간까지 지수 백오프하며, 기본 5회 도달 시 `FAILED`로 남긴다.
- 알림 REST는 현재 로그인한 사용자의 recipientKey만 조회 또는 읽음 처리하며, 요청의 페이지 VIEW 권한을 다시 확인해 알림으로 페이지 존재가 노출되지 않게 했다.
- 알림 설정 3개를 SAL `ApprovalSettings`와 관리자 화면에 추가했다.

## 검증

- `mvn -B -pl approval-confluence9 -am verify` 성공.
- approval-domain 21건, approval-confluence9 27건 단위 테스트 통과.

## 인수 검증 필요

- 실제 Confluence C9 Quick Reload 환경에서 AO schema 생성, scheduler lifecycle, 권한 필터, 업무함 알림 표시를 확인해야 한다.
