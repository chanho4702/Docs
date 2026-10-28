---
tags: [moveseye, review, reliability]
updated: 2026-10-21
---

# MovesEye 전반 검수

관련: [[2026-10-20-apm-custom-metric-review]], [[session-auth-hardening]], [[test-false-safety-nets]]

상세: `C:/solutions/_workspace/verification/review-20261021/review_moveseye-wide.md`.

BE a9080eb / FE 258d747, AI는 인증·승인 진입부만 표본 검토. 구현 변경 없음.

- 실제 FE 모듈 재현: 같은 URL 중복 GET/POST가 첫 요청을 취소하고 영구 pending Promise로 만든다. 대체 요청의 존재는 기존 호출자의 완료를 보장하지 않는다.
- cloud 설정 실패 envelope도 서비스 Promise가 resolve되어 화면이 성공 처리한다. 관련 기존 Jest 3 suites/42 tests는 통과했다. 성공 테스트 수와 실패 경로 보호 여부는 별개다.
- 코드 검수: 로그인/refresh가 Zabbix 사용자의 모든 API 토큰 삭제, 락 첫 실패 후 재획득 경로 소유권 무시, OTP 사용자 없는 findFirst, 아카이브 감사 username 누락.
- 비용 페이지의 동일 날짜 TOTAL 덮어쓰기와 FE 배포 SHA 비고정도 확인했다. 실제 AWS/토큰 삭제/배포는 실행하지 않았다.
- 공통 교훈: 소유한 자격 증명만 교체, 집계는 페이지 병합 후 산출, 행위자는 신뢰 가능한 id로 해석, 배포는 CI revision 고정. 검수 범위와 실행 검증을 분리해 적는다.
