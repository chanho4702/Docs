# Confluence Approval DC C9 리뷰 수리 3건

## 구현

- 설정 저장 뒤 scheduler 재등록이 실패해도 REST 응답은 `200`을 유지하고, `sweepRescheduled`로 재등록 결과를 제공한다.
- `ExpirySweepScheduler`의 OSGi 조회와 job 등록을 `@PostConstruct`로 옮겨 생성자에서 외부 서비스를 호출하거나 `this`를 노출하지 않도록 했다.
- `ConversionContext` property에 `ApprovalSettings.Values`를 보관해 같은 페이지 렌더링에서 macro 간 설정 조회를 공유한다. 전역 TTL cache는 사용하지 않는다.

## 검증

- `mvn -B -pl approval-confluence9 -am verify` 성공: domain 21건, C9 21건.

## 교훈

- Confluence C9 단위 테스트에서 JAX-RS `Response`를 직접 검증하려면 test scope의 Jersey runtime과 `RuntimeDelegate` 초기화가 필요하다.
