# Moves Approval Forge 영역 결재 매크로

- 영역의 영속 식별자는 Confluence가 재발급할 수 있는 `localId`나 문서 내 순서가 아니라, 앱이 발급해 매크로 ADF `attrs.parameters.regionId`에 저장한 UUID를 사용한다.
- 같은 `regionId`가 복사·붙여넣기로 중복되면 페이지 ADF 전체를 순회해 양쪽 결재를 fail-closed 한다. 편집 중에는 저장된 ADF의 `localId`가 뒤쪽 매크로와 일치할 때만 그 매크로를 재발급하며, 일치하지 않으면 순서 폴백 없이 차단을 유지한다.
- 상신 경쟁을 막으려면 브라우저가 계산한 `v2:` 영역 해시와 서버가 현재 페이지 ADF에서 다시 계산한 해시를 비교한 뒤 `ApprovalRepository.createRequest`를 호출해야 한다. 클라이언트 정규화는 서버 `regionHash.js`와 같은 canonical input을 만드는 대조 테스트로 고정했다.
- 영역 조회 응답은 페이지 결재의 approval/page shape를 그대로 유지하고 최상위 `regionHashMatches`만 추가하면 공용 상태·상세 UI를 재사용할 수 있다.
- bodied macro iframe은 높이가 자동 조정되지 않을 수 있어 `setMacroViewportHeight()`를 `ResizeObserver`와 함께 호출하되, bridge 실패는 기본 높이로 폴백한다.
- 검증: 백엔드 106건, UI 7건 통과, UI production build 성공, `forge lint` 무오류.
