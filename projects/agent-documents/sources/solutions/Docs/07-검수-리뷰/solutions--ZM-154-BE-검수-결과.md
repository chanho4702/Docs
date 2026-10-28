# ZM-154 BE 검수 결과

- 검수 대상: BE 커밋 `b2c564a`만
- 제외: ZM-122·151·152·153 및 FE 커밋
- 기준: `devdesign_apm-data-export.md`, `contract_apm-data-export.md`, 검수 요청서
- 검증 방식: 전체 diff와 지정 인접 코드·테스트 소스 정적 검토. 테스트는 실행하지 않음
- 종합 판정: **수정 후 재검수**
- 차단 항목: **R1, R2, R3**

R1 · 필수 · [ApmExportRequest.java](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java%3A59), [ApmRedSeriesExporter.java](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java%3A88), [ApmEndpointExporter.java](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java%3A73) · 미래 `to`를 계획과 다운로드가 각각의 현재 시각으로 다시 자르므로 두 응답의 창·행 수·파일명이 달라질 수 있다. 또한 RED·endpoint의 `ceil()` 결과는 계약의 “`toMs`는 지금을 넘지 않음”과 충돌한다. · 예를 들어 `step=60`, `to`가 미래이고 계획 시각이 12:00:59이면 계획은 12:01까지 1칸을 포함한다. 다운로드가 12:01:01에 시작되면 같은 요청이 12:02까지 확장되어 행이 하나 늘어난다. `error-groups`는 격자 없이 매 요청의 현재 시각을 그대로 쓰므로 더 직접적으로 어긋난다. 기존 테스트는 `ApmExportRequest.toMs == NOW`만 확인하며 계획→다운로드 경계 통과를 검증하지 않는다. · 계획이 확정한 유효 종료 시각을 다운로드 요청에 전달하는 계약으로 고정하거나 plan token/snapshot 파라미터를 도입해야 한다. RED·endpoint의 현재 칸 포함 여부와 `toMs <= now` 규칙 중 하나를 정본으로 확정하고, 분·시간 경계를 사이에 둔 계획/다운로드 회귀 테스트를 추가한다.

R2 · 필수 · [ApmExportController.java](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportController.java%3A63), [GlobalExceptionHandler.java](file:///C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/common/exception/GlobalExceptionHandler.java%3A327) · 잘못된 숫자·boolean 파라미터가 계약의 `APM_EXPORT_INVALID`가 아니라 전역 `INVALID_DATA`로 반환된다. · `from`, `to`, `step`, `gzip`, `rawText`가 이미 `Long`·`Integer`·`Boolean`으로 선언되어 있어 `from=abc` 같은 요청은 `ApmExportRequest.parse()`에 도달하지 못한다. Spring이 `MethodArgumentTypeMismatchException`을 던지고 전역 핸들러가 `errorCode: INVALID_DATA`를 만든다. 계약 §5.2는 잘못된 step·창 형식을 `APM_EXPORT_INVALID`로 규정한다. · 두 EP에서 원시 문자열을 받아 `ApmExportRequest`가 일관되게 변환·검증하거나, 이 컨트롤러 범위의 타입 불일치를 `APM_EXPORT_INVALID`로 매핑한다. MockMvc로 잘못된 `from`·`step`·boolean을 고정한다.

R3 · 필수 · [ApmExportServiceTest.java](file:///C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportServiceTest.java%3A120), [ApmExportServiceTest.java](file:///C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportServiceTest.java%3A202), [ApmExportIT.java](file:///C:/solutions/moveseye-be-spring/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java%3A167) · 핵심 실패 경로가 테스트로 충분히 고정되지 않았다. · 세마포어 테스트는 정상 종료 뒤 permit 반납만 확인한다. `plan()` 예외, `write()`의 RuntimeException, `UncheckedIOException`/클라이언트 중단, 마지막 `flush()` 실패 뒤 재다운로드 가능 여부는 없다. 원문 테스트는 서비스 직접 호출에서 예외만 확인하고 실제 HTTP 200 JSON 403·첨부 헤더 부재를 확인하지 않는다. 429도 응답의 미커밋·0바이트 상태를 확인하지 않는다. 커서 IT 역시 실제 다운로드가 성공함은 보지만 fetchSize 커서가 트랜잭션 안에서 소비되는지를 별도로 고정하지 않는다. · `maxConcurrent=1`로 각 실패를 유발한 뒤 즉시 다음 다운로드가 성공하는 테스트를 추가한다. 403·429는 MockMvc에서 JSON `Content-Type`, body code/errorCode, `Content-Disposition` 부재를 확인한다. 커서 경로는 트랜잭션 활성 상태 또는 autocommit=false를 callback 안에서 검증한다.

## 중점 확인 요청 판정

1. **충족(코드 기준)** — 권한·원문·429·계획·상한 판정 후에만 응답 헤더와 스트림을 연다. 다만 403·429 미커밋 회귀 테스트는 R3처럼 부족하다.
2. **충족(코드 기준)** — permit 획득 이후 전체가 `finally`로 감싸져 plan 예외·클라이언트 중단·flush 실패에서도 반납된다. 실패별 테스트는 부족하다.
3. **충족** — 현재 세 데이터셋의 외부 문자열 열은 모두 TEXT/JSON이고, 수치 열에는 코드가 생성한 숫자·boolean만 들어간다. 음수·과학 표기 수치는 변형하지 않는다.
4. **충족** — RED는 동일 plan의 격자·대상으로 `cells × targets`만큼 쓰고, endpoint는 계획에서 만든 행 목록 자체를 재사용한다. 계획과 별도 다운로드 사이의 미래 `to` 문제는 8번/R1이다.
5. **충족** — 기존 `query()`의 필터·SQL·파라미터 조립을 `windowFilter()`로 그대로 추출했다. 내보내기 count/stream도 같은 모집단을 사용하며 정렬·페이지·전체 endpoint 반환만 의도적으로 다르다.
6. **충족** — `TransactionTemplate(REQUIRES_NEW, readOnly)` 내부에서 `JdbcTemplate.query()` callback을 끝까지 소비한다. 마지막 명시적 `sink.flush()`는 트랜잭션 종료 후 수행된다.
7. **충족(코드 기준)** — 계획과 다운로드 모두 `viewFor()`를 거쳐 비관리자 `rawText=true`를 차단하며, 판정 축은 화면과 동일한 `ApmAccessChecker.canViewRawText()`이다.
8. **불충족** — 미래 `to`를 요청별 현재 시각으로 다시 계산하여 계획과 파일이 시간 경계에서 달라진다. RED·endpoint의 정렬된 `toMs`가 현재보다 미래가 되는 계약 충돌도 있다.
13. **불충족** — 상한의 미커밋 검증과 원문 서비스 단위 검증은 있으나, 세마포어 실패 반납·HTTP 403/429 미커밋·미래 경계 일관성을 고정하지 못한다.