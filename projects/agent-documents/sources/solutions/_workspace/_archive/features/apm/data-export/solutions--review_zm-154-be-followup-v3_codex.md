## N1·N2 반영 판정

| N# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| N1 | 닫힘 | `ApmExportRequest.java:175-214` — 원문 `Character.isISOControl` 검사가 trimming보다 먼저이며 C0·C1을 거절한다. 이후 `stripSpaces`는 U+0020만 제거하고 tchar 검증도 유지된다. `ApmExportRequestTest.java:156-177`은 `"GET\n"`·`"\tGET"`·`"\t"`·U+0085 거절과 `" GET "`·`M-SEARCH`·소문자 method 통과를 직접 단언한다. `METHOD_TOKEN`의 `A-Z` 범위로 `GET`·`PATCH`도 허용된다(`ApmExportRequest.java:98-100`). |
| N2 | 닫힘 | `ApmExportService.java:254-280` — `codePoints()`와 `appendCodePoint()`를 사용해 서로게이트 쌍을 보존하며, C0·C1·Cf·U+2028/2029를 이스케이프한다. 감사 로그의 가변 사용자 문자열인 username과 method 모두 적용된다(`ApmExportService.java:498-507`); 나머지는 enum·UUID·숫자·boolean·내부 상태다. 테스트는 U+0085·U+202E와 이모지 보존을 직접 단언한다(`ApmExportServiceTest.java:346-363`). |

- 새 결함 없음.

## 판정

승인

이유 1: N1·N2의 원인이 구현과 테스트에서 모두 닫혔으며 계약서 §v2.1의 `method` 규칙과 일치한다.  
이유 2: 정상 method와 일반 Unicode 문자의 회귀가 정적으로 발견되지 않았고, 감사 로그의 사용자 입력 지점도 모두 방어된다.

확인하지 못한 것:

- 요청에 따라 빌드·테스트·런타임 실행은 수행하지 않았다.
- 지정된 코드·테스트·계약서 밖의 기능은 재검수하지 않았다.