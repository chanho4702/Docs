## R1~R7 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 부분 | `ApmExportRequest.java:175-187`에서 정규화된 `method`에 tchar 검증을 적용하고, `ApmExportService.java:492-501`에서 감사 로그의 `user`·`method`를 `logSafe`에 통과시킨다. `q`는 boolean, `service`는 UUID, dataset·format은 enum, 시각·행 수는 숫자이며 filename은 감사 로그에 없고 안전한 값으로만 조립된다. 다만 `isBlank()`·`trim()`이 검증보다 먼저여서 `"GET\n"`·`"\tGET"`·탭만 있는 값은 제어 문자가 제거되거나 미지정으로 처리되어 tchar 위반이 거절되지 않는다. 또한 `logSafe`는 C0·DEL·U+2028/2029만 이스케이프하여 C1 제어 문자 전체를 덮지 않는다(`ApmExportService.java:254-274`). |
| R2 | 닫힘 | 다운로드는 `source.plan()`과 상한 판정을 마친 뒤에만 `stream()`으로 진입한다(`ApmExportService.java:168-180`). 보존 헤더와 expose 목록은 `getOutputStream()`보다 먼저 확정된다(`ApmExportService.java:281-302`). CSV NOTE는 데이터 뒤, `finish`/`fail` 앞에 기록되어 ERROR·TRUNCATED가 마지막 줄로 유지된다(`ApmExportService.java:310-329`, `CsvTabularWriter.java:91-106`). 현재 FE는 blob을 저장할 뿐 CSV를 파싱하지 않으며, 기존 마지막 줄 ERROR/TRUNCATED 판정도 유지된다. 보존값은 이미 계산된 plan과 단순 산술만 사용하므로 추가 DB 쿼리는 없다(`ApmExportService.java:208-210`). |
| R3 | 닫힘 | `appliedQuery`와 `appliedMethod`가 적용값을 단일 계산한다(`ApmExportService.java:230-245`). DTO·notes는 `394-417`, JSONL `_meta`는 `450-454`, 감사 로그는 `492-501`에서 이를 사용한다. 토큰 지문은 계속 원 요청 `q`·`method`를 사용한다(`ApmExportPlanToken.java:145-156`). |
| R4 | 닫힘 | 원문 `planToken.length()` 검사가 `isBlank()`·`trim()`보다 먼저 실행된다(`ApmExportService.java:132-143`). 513자 공백과 공백+토큰 우회 테스트도 직접 존재한다(`ApmExportPlanTokenTest.java:157-167`). |
| R5 | 닫힘 | 실제 `ApmRedSeriesExporter`가 pin의 M1으로 plan과 `store.redSeries`를 호출하는지 검증한다(`ApmRedSeriesExporterTest.java:93-118`). 실제 `ApmEndpointExporter`도 `routeTable`의 M1/M5 인자를 검증한다(`ApmEndpointExporterTest.java:55-75`). mock은 저장소 관찰용이며 해상도 판정을 대신하지 않는다. |
| R6 | 닫힘 | 단위 테스트가 실제 `viewFor` 권한 판정을 거쳐 응답 미커밋·원천 미호출을 검증한다(`ApmExportPlanTokenTest.java:170-199`). IT도 `apm.view`만 가진 USER로 전체 웹 계층의 403 JSON 응답을 검증한다(`ApmExportIT.java:308-334`, `655-667`). |
| R7 | 닫힘 | IT가 6개 필터 조건에서 목록과 JSONL의 `(route, method)` 집합을 직접 비교한다(`ApmExportIT.java:230-275`). `__other__` 씨앗을 넣고 목록 `otherRoutes`의 필터 전 값과 파일 `isOther`의 필터 후 존재 여부도 각각 단언한다. |

- N1 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java:175 · `method` 앞뒤 또는 단독 제어 문자가 tchar 오류로 거절되지 않는다 · `method.isBlank()`와 `method.trim()`이 원문 제어 문자 검사보다 먼저라 `"GET\n"`은 `"GET"`으로 통과하고 `"\t"`는 미지정으로 처리된다. 현재 테스트도 가운데 제어 문자만 검증한다(`ApmExportRequestTest.java:158-170`) · 원문에서 CR/LF/TAB 및 모든 ISO control을 먼저 거절한 뒤, 일반 공백 trim과 tchar 검증을 수행하고 경계·단독 제어 문자 테스트를 추가한다.
- N2 · 필수 · src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:266 · `logSafe`가 C1 제어 문자를 이스케이프하지 않아 모든 사용자 입력을 안전하게 만든다는 보장이 성립하지 않는다 · 조건이 C0(`<0x20`)·DEL·U+2028/2029만 포함해 U+0085 NEL 등 U+0080~U+009F가 username을 통해 그대로 감사 로그에 들어간다(`CreateUserDto.java:18-19`는 username을 `@NotBlank`로만 제한) · code point 단위로 C0·C1·line/paragraph separator와 로그 방향을 교란하는 format 문자를 `\uXXXX`로 이스케이프하고 U+0085·U+202E 회귀 테스트를 추가한다.

## 판정

수정 후 재검수

이유 1: R2~R7은 근본 원인을 닫았고, 보존 헤더 계산으로 인한 추가 쿼리나 다른 데이터셋의 스트리밍 회귀는 정적으로 발견되지 않았다.  
이유 2: R1은 일반적인 CR/LF 공격은 막지만 원문 `method` 경계 제어 문자와 C1 감사 로그 문자가 남아 있어 계약과 감사 로그 무결성 요구를 완전히 충족하지 않는다.

확인하지 못한 것:

- 요청에 따라 빌드·테스트·런타임 실행은 수행하지 않았다.
- 실제 브라우저의 교차 오리진 헤더 노출과 프록시 동작은 실측하지 않았다.
- 저장소 밖의 제3자 CSV 소비자가 새 `# NOTE:` 레코드를 어떻게 처리하는지는 확인하지 못했다.
- 실제 DB 쿼리 수와 성능은 프로파일링하지 않았으며, 코드 경로상 추가 쿼리가 없다는 점만 확인했다.