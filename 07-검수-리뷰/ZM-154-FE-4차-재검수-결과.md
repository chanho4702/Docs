# ZM-154 FE 4차 재검수 결과

**종합 판정: 승인**  
**차단 항목: 없음**

## 발견 사항

- R6 · 필수(해소) · [ApmExportModal.tsx:123](C:/solutions/moveseyee_fe/src/pages/application-monitoring/shared/components/ApmExportModal.tsx:123), [ApmExportButton.test.tsx:174](C:/solutions/moveseyee_fe/src/__tests__/ApmExportButton.test.tsx:174) · 문제: 3차에서 `StrictMode`의 첫 cleanup 이후 `closedRef`가 계속 `true`로 남았습니다. · 근거: 현재 effect는 `setup`마다 `false`, cleanup에서 `true`로 설정합니다. 따라서 `setup → cleanup → setup` 후 최종값은 `false`이고, 실제 언마운트 후에는 cleanup으로 `true`가 됩니다. 추가 테스트도 `StrictMode` 안에서 모달을 새로 마운트한 뒤 정상 다운로드와 `saveAs` 호출을 검증합니다. 수정 전 구현이라면 첫 cleanup으로 값이 `true`에 고정되어 `saveAs`가 호출되지 않으므로 해당 테스트가 실패합니다. 닫는 도중 완료된 다운로드를 버리는 기존 테스트도 실제 언마운트 경로를 보완 검증합니다. · 제안: 현재 구현과 회귀 테스트를 유지하십시오.

신규 결함이나 회귀는 발견하지 못했습니다. 주석도 “FE만으로는 완전히 보장할 수 없다”로 구현 경계를 정확히 표현합니다.

테스트는 요청대로 실행하지 않았으며, 소스와 설치된 React 19 동작을 기준으로 정적 검수했습니다.

- 1차 R1: **닫힘** — 세션 변경 또는 모달 언마운트 후 도착한 파일의 저장과 오류 반영이 차단됩니다.
- 1차 R2: **부분** — 미래 `to` 고정과 동일 요청 파라미터 사용은 해결됐고, 보존 경계 재승격은 후속 BE 계획 고정 범위로 남습니다.
- 1차 R3: **부분** — 닫힌 모달의 결과 반영은 차단됐지만 진행 중인 HTTP/BE 작업 자체는 중단하지 않습니다.
- 3차 R6: **닫힘** — StrictMode 재설정과 실제 언마운트 표시가 모두 올바르며 회귀 테스트가 이를 잡습니다.