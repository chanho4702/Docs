# Confluence Approval DC 배치 8b CC 백엔드

- `APR_CC`를 승인자 테이블과 분리해 CC 수신자 스냅샷을 저장했다.
- 알림 수신자 계산은 CC를 최종 이벤트에만 합류시키고 마감 임박 알림에는 포함하지 않는다.
- CC 업무함은 `findAllByIds` 배치 하이드레이션을 사용하고, 상세 JSON에서만 `cc`를 제공한다.
- 검증: Confluence 9 테스트와 Confluence 10 컴파일이 모두 성공했다.
