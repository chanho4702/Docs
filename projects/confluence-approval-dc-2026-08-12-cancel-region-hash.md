# Confluence Approval DC 취소·영역 해시

- `CANCELLED`는 `PENDING`에서만 전이하고, 기존 만료 조건이 `PENDING`만 처리하도록 유지해 sweep와 lazy expiration에서 제외했다.
- 영역 본문은 storage format에서 key별 첫 매크로를 추출하고, 공백 정규화 뒤 SHA-256 앞 16 byte hex로 비교한다.
- 영역이 사라지면 `system` actor와 `REGION_REMOVED` 사유로 회수하고, 본문만 달라지면 기존 content-version 만료 경로를 사용한다.
