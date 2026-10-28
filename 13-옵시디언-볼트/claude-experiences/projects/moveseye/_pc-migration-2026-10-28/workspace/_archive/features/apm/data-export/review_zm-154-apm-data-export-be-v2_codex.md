# ZM-154 BE 재검수 결과

**종합 판정: 승인**  
**차단 항목: 없음**

검수 범위는 `ZM-154-review`의 HEAD `baed6ee` 대비 미커밋 변경 6개 파일로 한정했다. 새 파일은 없다. 테스트는 실행하지 않았으며, 기존 [테스트 보고서](C:/worktrees/zm-154-be/build/reports/tests/test/index.html)는 변경 파일보다 나중에 생성됐고 **78건 성공, 실패 0, 무시 0**이다. `ApmExportIT`도 12건 성공, skip 0으로 기록돼 있다.

## 판정 근거

- 두 EP 모두 숫자·boolean 쿼리 파라미터를 `String`으로 받은 뒤 [ApmExportRequest.java](C:/worktrees/zm-154-be/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java:65)에서 일괄 변환한다.
- `from/to/step` 형식 오류와 `gzip/rawText` 형식 오류는 모두 `ApiError(APM_EXPORT_INVALID)`로 변환된다. `ApiError`의 기본 body code는 400이고, 기존 `GlobalExceptionHandler`는 그대로 HTTP 200 JSON envelope를 반환한다.
- 다운로드 EP는 [ApmExportController.java](C:/worktrees/zm-154-be/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportController.java:118)에서 파싱한 뒤에만 `download()`를 호출한다. 파일 헤더와 출력 스트림은 [ApmExportService.java](C:/worktrees/zm-154-be/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:161)부터 설정되므로 형식 오류 시 `Content-Disposition`이나 파일 본문이 생기지 않는다.
- `GlobalExceptionHandler`에는 diff가 없다. 다른 EP의 기존 `INVALID_DATA` 처리도 바뀌지 않았다.
- 기존 typed `ApmExportRequest.parse(Long, Integer, Boolean…)` 오버로드가 유지됐고, 저장소 내 호출처 검색 결과 깨지는 호출은 없다.
- permit은 [ApmExportService.java](C:/worktrees/zm-154-be/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:131)에서 획득되고 전체 plan·stream 경로를 감싼 `finally`에서 반납된다.
- plan 예외, `source.write()` RuntimeException, permit 획득 후 `UncheckedIOException`, 실제 `ServletOutputStream`의 최종 flush 실패마다 다음 다운로드 성공을 확인한다([ApmExportServiceTest.java](C:/worktrees/zm-154-be/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportServiceTest.java:200)).
- 429 IT는 permit 수만큼 실제 다운로드를 `getOutputStream()`에서 정지시킨 뒤 MockMvc 요청을 보낸다. permit 획득 전의 가짜 경합이 아니다([ApmExportIT.java](C:/worktrees/zm-154-be/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java:336)).
- 403 IT는 `apm.view` 권한이 있는 비관리자 계정을 만들어 원문 판정까지 실제로 도달시키며, 같은 계정의 마스킹 다운로드 성공도 대조한다([ApmExportIT.java](C:/worktrees/zm-154-be/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java:299)).
- 커서 검증은 실제 PostgreSQL과 `ApmErrorGroupExporter.write()`를 사용해 행 callback이 `active-readonly`, 마지막 flush가 트랜잭션 밖 `none`임을 확인한다([ApmExportIT.java](C:/worktrees/zm-154-be/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java:384)).
- 정상 다운로드·계획·원문 판정·행 상한 관련 프로덕션 로직은 변경되지 않았다. 정상 문자열 입력은 기존 typed 파서로 위임된다.

## 발견 사항

R4 · 권장 · [ApmExportIT.java:213](C:/worktrees/zm-154-be/src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java:213) · 계획 EP의 형식 오류 테스트가 HTTP 200과 body code/errorCode만 고정하고 `application/json` 및 `Content-Disposition` 부재는 직접 단언하지 않는다. · 다운로드 EP는 같은 테스트에서 두 속성을 모두 확인하고, 계획 EP 구현도 일반 `ApiResult` 반환이라 현재 동작은 정상이다. 따라서 R2를 다시 여는 결함은 아니지만 계획 EP의 전체 실패 계약을 회귀 테스트로 완전히 고정하지는 못한다. · 계획 EP 응답에도 `Content-Type` JSON과 `Content-Disposition` null 단언을 추가할 것을 권장한다.

R1: **닫힘 — FE에서 닫힘(BE 무변경).**  
R2: **닫힘 — 두 EP 모두 전용 문자열 파싱을 거쳐 `APM_EXPORT_INVALID`로 응답한다.**  
R3: **닫힘 — 실패별 permit 반납, 403·429 JSON 경로, 실제 스트림 경합 및 커서 트랜잭션 소비가 고정됐다.**