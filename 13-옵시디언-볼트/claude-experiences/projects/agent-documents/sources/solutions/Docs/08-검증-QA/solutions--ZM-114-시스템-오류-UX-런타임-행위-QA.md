# ZM-114 시스템 오류 UX — 런타임/행위 QA

- 검증일: 2026-08-25
- 대상: FE `C:\worktrees\zm-114-fe` (최종 수정 `ee8cdc2`), BE `C:\worktrees\zm-114-be` (최종 수정 `b651625`)
- 범위: 공통 `resolveApiError`의 사용자 안내 키 선택과 Spring 예외 envelope의 안정 `errorCode` 전파
- 실행 환경: Windows / OpenJDK 21 (BE 테스트 최초 실행 시 확인)

## 검증 결과

| 흐름 | 기대 | 실제 | 결과 |
|---|---|---|---|
| HTTP 403 또는 `FORBIDDEN` | 권한 없음 안내 키 | `api_error.permission_denied` | 통과 |
| HTTP 401 | 재로그인 안내 키 | 수정 후 `api_error.authentication_required` | 통과 |
| `INVALID_DATA` | 입력값 수정 안내 키 | `api_error.invalid_input` | 통과 |
| `TRIGGER_EXPRESSION_INVALID: <Zabbix 원문>` (과거 형식) | 코드와 보조 상세를 분리, 표현식 화면에서만 원문 노출 | `errorCode=TRIGGER_EXPRESSION_INVALID`, `detail=<원문>` | 통과 |
| 분리된 `TRIGGER_EXPRESSION_INVALID` + message (신규 형식) | 보조 상세 유지 | 동일하게 분리 | 통과 |
| Axios network / timeout / HTTP 5xx | 연결 실패 / 시간 초과 / 서버 일시 불가 안내 | 각각 `api_error.network` / `api_error.timeout` / `api_error.server_unavailable` | 통과 |
| Spring `ApiError` | 기술 원문 대신 안정 `errorCode`, 표현식 원문은 detail로 분리 | `GlobalExceptionHandler` 단위 테스트 통과 | 통과 |

## 실행 증거

### FE

초기 실행:

```powershell
cd C:\worktrees\zm-114-fe
npx jest src/__tests__/apiEnvelope.test.ts --runInBand
```

초기 결과는 18개 중 16개 통과, 2개 실패였다.

- HTTP 401이 `api_error.default`로 반환됨
- response 없는 `ERR_NETWORK`가 `api_error.authentication_required`로 잘못 반환됨

원인: `src/constants/http.ts`에 `HTTP_STATUS.UNAUTHORIZED`가 없어서 resolver의 비교가 `undefined === undefined`이 되었다. 이어서 `npm run build`도 다음 TypeScript 오류로 실패했다.

```text
src/services/apiEnvelope.ts(188,28): error TS2339:
Property 'UNAUTHORIZED' does not exist on type '{ readonly OK: 200; readonly FORBIDDEN: 403; }'.
```

수정 `ee8cdc2` 후 담당자가 같은 Jest 명령을 재실행하여 **18/18 통과**를 확인했다. 이 수정은 401 상수를 명시해 network 오류를 인증 오류로 오분류하던 경로도 함께 해소한다.

### BE

최초 실행 명령:

```powershell
cd C:\worktrees\zm-114-be
.\gradlew.bat test --tests com.dmove.moveseye.common.exception.GlobalExceptionHandlerTest
```

컴파일과 `testClasses`까지는 완료됐으나, 테스트 시작 직전에 기존 산출물 `build\test-results\test\binary\output.bin`을 삭제하지 못해 Gradle이 실패했다. 이는 코드/테스트 assertion 실패가 아니라 다른 프로세스가 해당 파일을 열고 있는 환경 잠금이었다. worktree 보존 지침에 따라 산출물 삭제나 프로세스 종료는 수행하지 않았다.

수정 `b651625` 후 담당자가 지정된 BE 테스트 클래스 3개를 실행하여 통과를 확인했다. `GlobalExceptionHandlerTest`는 안정 `errorCode`, 과거 `CODE: detail` 정규화, 기술 예외 비노출을 포함한다.

## 범위 외 및 결론

- 이번 변경은 오류 resolver/응답 계약 단위이며, 실제 Zabbix·DB·인증 서버가 필요한 브라우저 E2E는 실행하지 않았다.
- FE resolver 핵심 시나리오와 BE 예외 계약 테스트가 최종 통과했고, 발견했던 401/network 오분류 및 build 차단은 수정 반영으로 해소됐다.
- 최종 판정: **통과**.
