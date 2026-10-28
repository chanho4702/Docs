---
tags: [moveseye, backend, license, package, logging]
updated: 2026-08-24
---

# 라이선스 패키지 경계와 로그 정책

라이선스 기능은 기능별 수직 분할을 유지하면서도 내부 책임을 `domain`(상태·등급·기능), `crypto`(서명 키·클레임), `provider`(현재 상태 계산·캐시), `application`(등록·해지)로 분리했다. enum은 `domain/state`(AccessMode·LicenseState)와 `domain/entitlement`(Edition·Feature·LicenseType)로 나눠 상태 전이와 구매 권한 모델을 구분했다.

교훈: 상태 판정과 키 검증을 컨트롤러·인터셉터와 같은 최상위 패키지에 두면 import와 테스트 경계가 흐려진다. Java package 이동은 테스트도 같은 경계를 따르게 하고, package-private 테스트 생성자는 의도적으로 public 테스트 주입 생성자로 바꿔야 한다.

운영 로그는 라이선스 패키지 기본 `INFO`, 요청별 게이트·캐시 판단 `DEBUG`, 비정상 키 `WARN/ERROR`로 두고 원문 키/JWT는 절대 로깅하지 않는다.

관련: [[projects/moveseye/moveseye-overview|moveseye-overview]], [[topics/backend/offline-license-enforcement|offline-license-enforcement]]
