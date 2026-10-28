# GPU P1 상세 설계 검토

날짜: 2026-09-17 · 대상: [P1 상세 설계](../../../../features/premium/gpu-monitoring/solutions--devdesign_gpu-monitoring-p1.md), [API 계약 초안](../../../../features/premium/gpu-monitoring/solutions--contract_gpu-monitoring.md)

## 검토 범위

문서 독자 검증 및 로컬 코드와 계약 표현의 대조. 실제 GPU 수집·API·UI·부하 테스트는 수행하지 않았다. 구현은 미착수이며 API 계약은 DRAFT다.

## 반영한 지적

- [x] 기존 Series/TrendSeries가 품질 메타를 전달하지 못함 → MetricPort.querySeriesChecked와 typed 결과, 라이선스 wrapper 구현 책임 명시.
- [x] 과거 lastvalue JSON 및 master 실패를 현재 성공으로 오인할 위험 → discovery 검증과 dependent master 상태 전파, NO_GPU/REMOVED 판정 제한.
- [x] trend 경계 반환/gap 설명 충돌 → 완료된 경계 bucket은 boundaryPartial, 현재 진행 시간은 gap, 소스 조회 경계 확장 규칙 명시.
- [x] snapshot 고정과 freshness 재평가 충돌 → generatedAt 기준 상태 고정, 자동 갱신은 새 snapshot, 권한은 매 요청 검증.

## 문서 검증

- 상세/계약/작업 카드의 로컬 링크 누락 0건.
- JSON 예시 3개 구문 확인.
- ApiStatus 소문자 직렬화와 GlobalExceptionHandler의 ApiError HTTP200 경로 코드 확인.
- GPU 메트릭 key 16개, chart 허용 목록 및 단위 변환 규칙 확인.

## 다음 검증

S0 실장비 프로필 확보 후 키/단위/상태·master chain·history 제약을 확정하고, 구현한 계약과 실제 HTTP/FE 동작을 검증해야 한다. 문서 검토 완료는 GPU 지원 인증이나 제품 구현 완료가 아니다.
