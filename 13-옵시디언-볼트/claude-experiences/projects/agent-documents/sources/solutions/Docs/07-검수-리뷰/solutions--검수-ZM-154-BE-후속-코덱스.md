- R1 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:407 · 사용자 입력 `method`를 그대로 감사 로그에 기록해 로그 주입이 가능하다 · 근거: 검증은 앞뒤 공백 제거와 32자 상한뿐이므로 `method=GET%0A[APM-EXPORT]%20user=admin` 같은 내부 개행이 통과하고, Logback `%m%n`이 이를 이스케이프하지 않아 위조된 감사 행을 만들 수 있다 · 수정안: HTTP token 문법으로 `method`를 제한하고, 감사 로그 기록 시에도 CR/LF와 제어 문자를 이스케이프한다.
- R2 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:201 · 토큰으로 고정한 해상도의 데이터가 보존 경계 밖에서 삭제돼도 `endpoints` CSV는 부분·빈 파일이라는 사실을 메타나 헤더로 알리지 않는다 · 근거: 다운로드 시 `ApmEndpointExporter`가 `retentionClipped=true`를 다시 계산하지만 성공 헤더에는 창·step·rows만 있으며, JSONL에만 해당 플래그가 들어간다. 7일 경계 직전 M1 계획을 발급하고 경계 통과·보존 삭제 후 토큰으로 받으면 rows=0 또는 일부 집계만 담긴 정상 CSV가 만들어진다 · 수정안: 최소한 `X-Apm-Export-Retention-Clipped`를 추가·노출하고 FE가 경고하도록 계약을 갱신하며, 장기 보존되는 CSV 자체에도 결손 사실을 보존할 방식을 마련한다.
- R3 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:329 · `red-series`에서 무시되는 `q`를 계획 응답과 JSONL `_meta`에는 적용된 필터처럼 기록한다 · 근거: `ApmRedSeriesExporter`는 `q`를 전혀 사용하지 않지만 `toDto()`와 `meta()`는 `request.q()`를 그대로 내보낸다. `red-series?...&q=orders`는 전량 파일인데 `data.q`와 `_meta.q`는 `orders`가 되어 계약의 “적용한 검색어” 의미와 충돌한다 · 수정안: v1 호환을 위해 요청은 계속 무시하되, 적용값을 별도로 계산하여 `red-series`의 DTO·메타에는 `q=null`을 기록한다.
- R4 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:132 · `planToken` 512자 상한이 원문에 적용되지 않아 공백으로 우회된다 · 근거: 513자 공백은 `isBlank()`에서 토큰 미지정으로 처리되고, 긴 공백에 정상 토큰을 붙이면 `trim()` 후 `verify()`되어 정상 토큰 길이만 검사한다. 따라서 쿼리 파라미터 남용 방지 상한과 계약의 `≤512`가 지켜지지 않는다 · 수정안: `isBlank()`와 `trim()`보다 먼저 원문 `planToken.length()`를 검사하고, 512자 초과는 항상 `APM_EXPORT_INVALID`로 거절한다.
- R5 · 권장 · src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanTokenTest.java:267 · 보존 경계 재승격 테스트가 실제 운영 exporter를 거치지 않아 원래 결함의 회귀를 막지 못한다 · 근거: `WindowEchoSource`가 직접 `request.resolution()`을 호출하므로 `ApmRedSeriesExporter`나 `ApmEndpointExporter`가 다시 `ApmResolution.choose()`를 직접 호출하도록 회귀해도 테스트는 계속 통과한다 · 수정안: 실제 두 exporter에 pin이 있는 요청을 넣고 조회에 사용된 resolution과 결과 plan의 step을 단언한다.
- R6 · 권장 · src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanTokenTest.java:116 · “타 사용자 재사용이 권한을 넓히지 않는다”는 보안 판단을 테스트가 검증하지 않는다 · 근거: `ADMIN`과 `OTHER`가 모두 `UserRole.ADMIN`이고 요청도 `rawText=false`라 관리자 발급 `rawText=true` 토큰을 비관리자가 재사용하는 핵심 공격 경로를 실행하지 않는다 · 수정안: `apm.view`만 가진 비관리자로 관리자 발급 원문 토큰을 다운로드해 403, 미커밋 응답, 원천 미호출을 단언한다.
- R7 · 권장 · src/test/java/com/dmove/moveseye/premium/apm/export/ApmExportIT.java:249 · “같은 모집단” IT가 행 수만 비교하여 같은 개수의 다른 route×method가 나온 회귀를 놓친다 · 근거: 네 조건 모두 목록 `total`과 CSV 행 개수만 대조하고 실제 키 집합과 `__other__` 행을 확인하지 않는다 · 수정안: 목록과 파일의 `(route, method)` 집합을 직접 비교하고 `__other__` 씨앗을 추가해 `otherRoutes`는 필터 전 값, 파일의 `isOther`는 필터 후 행임을 단언한다.
- 이상 없음 — HMAC 키 파생은 `HMAC-SHA256(JWT_SECRET, label)`이며 MAC 비교는 `MessageDigest.isEqual`을 사용하고, base64url·필드·숫자 파싱 실패는 `APM_EXPORT_INVALID`로 수렴한다.
- 이상 없음 — 토큰 지문에는 dataset·from·원 요청 to·step·service·q·method·format·gzip·rawText가 모두 포함되며 method는 필터 의미와 같이 대소문자를 정규화한다.
- 이상 없음 — 엔드포인트 필터 추출은 기존 trim·대소문자·부분/정확 일치·AND 동작을 보존하고, `otherRoutes`는 필터 전에 계산되며 계획 rows는 필터 후 행 수다.
- 이상 없음 — 판정 순서는 라이선스 → `apm.view` → 파라미터·토큰 → 원문 관리자 → 슬롯 → 상한이며, 토큰 검증은 슬롯 획득 전이고 `requireSameWindow` 실패는 `finally`에서 슬롯을 반납한다.
- 이상 없음 — TTL 기본값 1,800초와 60~86,400 검증이 선언돼 있으며, 누락된 `JWT_SECRET`은 설정 바인딩에서, 32바이트 미만 값은 `JwtTokenProvider` 생성 시 기동을 실패시킨다.
- 이상 없음 — 이전 R4 보강은 계획 EP의 실제 `from=abc` 요청에서 JSON Content-Type과 `Content-Disposition` 부재를 단언한다.

## 판정

수정 후 재검수

이유 1: R1~R4는 감사 로그 무결성, 토큰 입력 상한, 보존 결손 표시, 파일 메타 정합성에 영향을 주는 필수 결함이다.  
이유 2: 현재 권한·슬롯·필터 핵심 경로는 정적으로 정상이나, R5~R7의 회귀 테스트 공백도 함께 보완하는 편이 안전하다.

확인하지 못한 것:

- 요청에 따라 빌드·테스트·런타임 실행은 하지 않았다.
- 실제 보존 작업의 파티션 삭제 시각·단위와 프록시의 최대 요청행 길이는 실측하지 않았다.
- 브라우저가 새 보존 상태 헤더를 소비할 수 있는지는 FE가 아직 v2 미연동이므로 확인하지 못했다.