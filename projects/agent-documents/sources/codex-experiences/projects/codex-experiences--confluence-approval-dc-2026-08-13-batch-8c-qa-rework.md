# Confluence Approval DC 배치 8c QA 재작업

- 상세 모달 내부 동작에서 `approvalContainer()`는 모달의 조상이 아니라 바깥 page panel/region을 반환하므로, 모달 상태는 클릭된 버튼에서 `closest('.dmove-approval-modal')`로 찾아야 한다.
- confirm UI가 여러 개일 때 `querySelector(':not(...)')`의 첫 매치에 의존하지 않고 reject/cancel/PIN 박스를 각각 명시적으로 찾아 상호 배타적으로 숨겨야 한다.
- PIN 오류 응답은 `PIN_NOT_SET:`, `PIN_INVALID:`, `PIN_LOCKED:` 계약 접두만 공용 helper에서 제거하고, 접두 없는 기존 오류 본문은 그대로 유지한다.
- 모달을 닫을 때 PIN 박스, 메시지, 입력값뿐 아니라 승인 버튼의 `disabled` 상태도 함께 초기화해야 재진입 동선이 막히지 않는다.
- 서명 업로드 검증은 크기 위반과 magic byte/최소 길이 위반을 분리하고, client MIME 정책과 server 정책을 맞춰야 오류 원인이 정확히 전달된다.
- 검증 기준선: C9 `Tests run: 111, Failures: 0, Errors: 0, Skipped: 0`, C10 compile 성공, `node --check` 성공.
