# Moves Workforce 문서 기준선 동기화 (2026-08-06)

## 확인한 드리프트

- 제품 문서는 2026-08-04 개발 소스를 기준으로 했지만, 2026-08-06 커밋에는 수동 포트폴리오 재집계 완료 폴링과 queue/scheduled 환경 판별 보완이 반영되어 있었다.
- README의 Forge SQL 테이블 수가 12개로 남아 있었으나 실제 스키마는 13개다.
- `migrate.js`에는 v017 `project_subscription.default_estimate_seconds`가 존재했지만 데이터 모델·운영 문서에는 v016까지만 기록돼 있었다.

## 적용 원칙

- 개발 기준선과 운영 배포 완료를 분리해 명시한다. package version이 같아도 기능 집합은 다를 수 있다.
- 사용자 문서에는 완료 체감에 영향을 주는 비동기 동작(15초 폴링, 10분 대기 상한)을, 개발·데이터 문서에는 완료 신호와 DDL 이름을 기록한다.
- 날짜별 작업 기록과 도메인 상세 설계는 현재 제품 문서로 덮어쓰지 않고 역사 자료로 보존한다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-documentation-baseline-sync|moves-workforce-documentation-baseline-sync]]
