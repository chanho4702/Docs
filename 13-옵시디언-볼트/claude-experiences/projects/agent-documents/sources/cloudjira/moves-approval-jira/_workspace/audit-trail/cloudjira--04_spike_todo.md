# audit-trail 실측 목록 (dev 배포 후)

| # | 확인할 것 | 방법 | 실패 시 |
|---|---|---|---|
| A7 | `ALTER TABLE approval_event ADD INDEX IF NOT EXISTS …`(v054~v056) 멱등·성공 | 배포 → 아무 화면 1회 → KVS `schema:version` = `v056_index_approval_event_delegate`, 다시 호출해도 `[MIGRATE]` 오류 없음 | 해당 항목 제거(결과는 같고 느릴 뿐). 이름은 재사용 금지 |
| A8 | `listApprovalAudit` 행위자 필터의 `IN (SELECT … UNION SELECT …)` 허용·속도 | 감사 > 결재 탭에서 행위자 지정 검색(오류 여부), 합성 1만 행으로 응답 시간 | actor/delegate 두 질의 키셋 병합으로 교체 |
| A10 | `rms.org` VERIFIED sticky | 두 앱 dev: 워크포스 org 게시물 삭제 → 본인 접속 → `workforce_inbound` status | 연결 판정이 꺼지는 시점을 화면 안내에 반영 |
| A11 | `user/bulk` 의 `accountType`(앱·비활성 계정) | 앱 계정 id 로 `resolveUsers` 호출 → `accountType` | 배지를 "알 수 없음"으로 |
| A5 | 자동화 규칙 워크로그의 `updateAuthor` 계정 종류 | 자동화로 워크로그 추가 → 감사 > 워크로그 변경 행위자 배지 | 배지 문구 조정 |
