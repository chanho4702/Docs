---
tags: [moveseye, review, event, sse]
updated: 2026-09-07
---

# 2026-09-07 로직 검수

관련: [[projects/moveseye/2026-09-02-apm-p2-traces|2026-09-02-apm-p2-traces]] · [[topics/backend/test-false-safety-nets|test-false-safety-nets]]

- 검수 기준 BE `922a708`, FE `ef951b0`. SOLO-CLAUDE 검수 역할로 제품 코드는 변경하지 않았다.
- 정본 리뷰: `C:/solutions/_workspace/reviews/review_logic_2026-09-07_codex.md`.
- 미해결 7건: 동기화 사이 발생·해소된 알람의 RECENT 누락, 복구 불가능한 앞 500건의 후속 후보 처리 차단, 활성 10,000건 상한의 사본 누락, Zabbix/내부 사용자 ID 혼용, UPSERT의 is_read 갱신 누락, SSE trailing 실행 부재, 단기 RAW도 도달 가능한 100,000포인트 절단.
- 기존 관련 테스트 BE 23개·FE 6개 통과. 실제 훅 격리 실행과 실제 SQL/JPQL 추출 SQLite 검증으로 SSE·읽음 UPDATE·복구 후보 반복 3건 재현. 운영/브라우저 E2E는 미실시.
- 교훈: 사본을 사용자 조회 원천으로 승격하면 기존 수집 안전 상한도 정확성 결함이 된다. 실패 큐의 첫 페이지만 재조회하면 후속 후보가 멈춘다. 삽입 인자만 검사하는 테스트는 ON CONFLICT의 UPDATE 누락을 감지하지 못한다. throttle은 중복 억제뿐 아니라 마지막 변경 반영도 검증해야 한다.
