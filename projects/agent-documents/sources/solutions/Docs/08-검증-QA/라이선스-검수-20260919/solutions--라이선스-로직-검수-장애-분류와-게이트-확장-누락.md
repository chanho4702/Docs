---
tags: [moveseye, licensing, review, reliability]
updated: 2026-09-19
---

# 라이선스 로직 검수 — 장애 분류와 게이트 확장 누락

사용자 요청으로 구현 변경 없이 라이선스 커널·발급기·FE·AWS·APM 배치를 검수했다.

- 정본 검수: `C:/solutions/_workspace/reviews/review_license-logic-20260919.md`.
- BE 52건·FE 34건 통과. 격리 재현 소스는 `_workspace/verification/license-review-20260919/`에 보존.
- P1: Provider가 DB 일시 장애를 INVALID로 바꿔 APM 수신 403으로 이어질 수 있다. 미보유와 UNAVAILABLE을 구분하고 일시 장애에는 503을 써야 한다. 연속 2호출에서 DB 재시도 6회도 재현.
- P1: 발급 파일명이 고객·에디션·날짜뿐이라 같은 날 재발급 시 이전 키를 덮어쓴다. 365일→30일 키로 재현. jti 파일명·CREATE_NEW·대장 무결성 필요.
- P2: ARCHIVED GET은 통과하고 AWS 직접 gateway는 라이선스 검사가 없어 외부 조회가 가능하다. mock gateway 호출 재현. Zabbix 포트 차단만으로 외부 소스 전체를 보호하지 못한다.
- P2: SchedulerManager는 canWrite만 봐 STANDARD/ACTIVE/APM없음 상태에서도 APM 알람 배치를 허용한다. 기능별 배치 게이트와 정리·롤업 예외를 구분해야 한다.
- P2: FE FeatureGate는 isError를 무시해 초기 상태 조회 실패를 미구매로 안내한다(정적 확인).
- 정책상 의도: startsAt은 개시 제한이 아니고 maxHosts는 강제하지 않는다. EXPIRED부터 APM 과거 조회도 차단한다. 기능 결함과 상품 정책 변경을 구분할 것.
- 검수 코드에서 개선 정책으로 자동 변경하지 않았다. 고객 키/개인키·운영 DB 미열람, 제품 코드·런타임 미변경.
- 교훈: 기존 라이선스 테스트 green은 새 외부 공급자·premium 배치·발급 산출물 무결성까지 보장하지 않는다. 정본 설계의 등록일부터 기간 계산 설명은 현 구현과 어긋나므로 후속 동기화 필요.

관련: [[topics/backend/offline-license-enforcement|offline-license-enforcement]], [[projects/moveseye/2026-08-12-license-expiry-in-key|2026-08-12-license-expiry-in-key]], [[projects/moveseye/2026-08-24-license-package-boundaries|2026-08-24-license-package-boundaries]]
