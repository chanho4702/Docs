# Confluence Approval DC 배치 8e 내 서명 UI 재작업

- 업무함 `signature` 화면은 왼쪽 300px 내외의 결재란 미리보기 카드와 오른쪽 서명 등록·PIN 카드 영역으로 분리했다. 1024px 이하에서는 한 열로 쌓는다.
- 서명 등록 방식은 기존 `dmove-approval-scope__btn` 세그먼트 패턴과 `hidden` pane 전환을 재사용하고, 이미지 input은 접근 가능한 시각 숨김 상태로 두면서 label drop zone과 선택 파일명을 표시했다.
- 기존 REST 경로, PIN 검증 정규식, `data-signature-*` 훅은 유지했다. 캔버스 bitmap 폭은 표시된 wrapper의 `clientWidth`로 초기화해 100% 폭에서도 좌표 왜곡을 피했다.
- HTML·CSS 증가로 단일 Java text block이 JVM constant-pool UTF-8 한도를 넘었으므로, signature 뷰 경계에서 세 text block을 `String.join`으로 결합했다. `__TOKEN__` 치환 방식과 렌더 결과는 유지했다.
- 렌더 테스트는 eyebrow, 결재란, 세그먼트 tab/pane, 업로드 파일명 훅, 2열 grid를 추가로 고정했다.
- 검증: inline script `node --check` 성공. C9 `Tests run: 112, Failures: 0, Errors: 0, Skipped: 0`.
