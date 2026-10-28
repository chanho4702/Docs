# ZM-114 — 공통 오류 계약/UX 통합 QA

검증일: 2026-08-25  
검증 범위: `C:\worktrees\zm-114-be`, `C:\worktrees\zm-114-fe`의 진행 중 변경 및 `contract_zm114-error-ux.md`

## 결론

정적 경계면 대조 결과 **통과**. 검증 중 발견한 실제 HTTP 401 안내 누락은 FE에 반영되고 회귀 테스트가 추가된 것을 재확인했다.

| 항목 | 기대(BE 계약) | 실제(FE/BE) | 결과 |
|---|---|---|---|
| 안정 `errorCode`/`message` 분리 | `ApiError(ErrorCode, detail)`은 코드와 상세를 분리 | `ApiError`가 `errorCode`를 별도 보관하고, `GlobalExceptionHandler`가 `getClientMessage()` + `getErrorCode()`를 envelope에 기록 | 통과 |
| 과거 표현식 오류 호환 | `TRIGGER_EXPRESSION_INVALID: detail`도 신규 shape로 정규화 | BE는 과거 접두 형식을 `errorCode=TRIGGER_EXPRESSION_INVALID`, `message=detail`로 내보내고, FE resolver는 구/신규 형식을 모두 `detail`로 분리 | 통과 |
| HTTP 200 오류 envelope | `ApiError`/검증 오류/403은 HTTP 200 + body `code` 유지 | `handleApiError`, validation/bind/type-mismatch가 `ApiResult.error(..., code, errorCode)`로 응답. FE `isFailureEnvelope` 및 mutation unwrap이 body 오류를 reject로 변환 | 통과 |
| 401 보존 및 안내 | 401만 실제 HTTP status, FE는 재로그인 안내로 해석 | BE `UnauthorizedError`는 HTTP 401을 유지. FE resolver 우선순위는 `403 → 안정 errorCode → 401 → transport/5xx → fallback`이며 401 회귀 테스트 포함 | 통과 |
| validation | 안전한 message + `INVALID_DATA` | BE 400 envelope + `INVALID_DATA`; FE `api_error.invalid_input`으로 변환 | 통과 |
| 5xx/network/timeout | 기술 원문 대신 행동 가능한 안내 | BE catch-all은 안전 문구의 실제 500 plain body. FE는 5xx/network/timeout을 각각 i18n 키로 매핑 | 통과 |
| i18n | 양 언어의 모든 공통 키 존재 | `api_error.{default,permission_denied,authentication_required,not_found,conflict,invalid_input,trigger_expression_invalid,timeout,server_unavailable,network}`가 `kr.json`/`en.json` 모두에 존재 | 통과 |
| 표현식 원문 노출 범위 | 원문은 표현식 Alert의 보조 상세에만 노출 | `TriggerFormDrawer`가 resolver의 `detail`을 `setExpressionError`로 전달하고, 일반 toast에는 `messageKey`만 사용 | 통과 |

## 발견 및 조치 이력

| 항목 | 기대(BE) | 최초 실제(FE) | 심각도 | 조치/재검증 |
|---|---|---|---|---|
| 실제 HTTP 401 메시지 | `api_error.authentication_required` | 403과 안정 errorCode 뒤에 401 분기가 없어 일반 fallback으로 귀결 | 높음 | `apiEnvelope.ts`에 `HTTP_STATUS.UNAUTHORIZED` 분기 및 `apiEnvelope.test.ts` 회귀 테스트 추가. 재검증 완료 |

## 확인한 주요 출처

- BE: `engine-api/.../ApiError.java`, `ErrorCode.java`, `src/.../GlobalExceptionHandler.java`, `ZabbixTriggerManageService.java`, `ZabbixLldPrototypeManageService.java`, `GlobalExceptionHandlerTest.java`
- FE: `src/services/apiEnvelope.ts`, `src/__tests__/apiEnvelope.test.ts`, `src/locales/{kr,en}.json`, `TriggerFormDrawer.tsx`, `ServerLocationList.tsx`, `MapViewList.tsx`

## 실행 검증 메모

- BE 구현 담당자 실행: `GlobalExceptionHandlerTest`는 `:test --tests ... --rerun-tasks`로 통과했다. 이후 전체 테스트의 17개 실패는 기존의 dynamic `CODE: detail` 메시지 assertion과의 충돌로 확인되어, 내부 원문은 보존하고 handler 응답에서만 분리하는 방향으로 조정 후 targeted 재실행 중이다.
- FE 검증: `tsc --noEmit`은 오류 없이 완료됐다. Jest는 의존성 설치 후에도 공유 환경의 다수 Node 프로세스와 충돌해 exit 결과를 수집하지 못했으므로 통과로 단정하지 않는다. 테스트 코드는 403, stable code, `INVALID_DATA`, 구/신 `TRIGGER_EXPRESSION_INVALID`, 401, network/timeout/5xx 회귀 케이스를 포함하는 것을 정적으로 확인했다.

## 남은 이슈

- 계약/경계면 불일치 없음.
- BE targeted 재실행 및 FE Jest의 단독 실행 결과 확인만 남음.
