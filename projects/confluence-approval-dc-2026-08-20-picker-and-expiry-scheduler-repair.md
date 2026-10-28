# Confluence Approval DC: 승인자 검색과 만료 scheduler 보정 (2026-08-20)

- 승인자 직접 지정 영역에는 2글자부터 검색되는 기본 검색바와 결과·페이지 이동을 유지하고, 상세 검색은 별도 overlay에서 다중 선택 후 적용하도록 역할을 분리했다.
- 상세 검색 overlay는 요청 modal box의 형제 요소로 렌더링해 box의 overflow와 stacking 영향 없이 정상 표시되도록 했다.
- 설정 저장 중 만료 주기 재등록을 위해 `ExpirySweepScheduler`를 Spring `ComponentLocator`가 아니라 plugin-scoped OSGi service locator에서 찾도록 변경했다. scheduler 미발견은 실제 `sweepRescheduled=false` 오류다.
- JavaScript 문법, i18n provider, dark-mode 토큰을 보정했고 JDK 21 `mvn -pl approval-confluence9 -am test`(186건)와 `-DskipTests package`를 통과했다.
