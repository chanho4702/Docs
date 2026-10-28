# RUM 계약 표본

`rum-ingest-metrics.json`과 `rum-ingest-traces.json`은 BE 수신 계약의 참고용 원문이다. FE 소비처와 계약 테스트는 없으며, 브라우저 exporter의 실행 검증을 뜻하지 않는다.

나머지 조회 표본은 `apmRumContractSample.ts` 및 `apmRumContract.test.ts`에서 사용한다. BE 표본과의 비교는 CRLF/LF 줄바꿈을 정규화한 내용 동일성 기준이며, 바이트 동일성을 주장하지 않는다.
