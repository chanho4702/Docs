# ZM-114 — 공통 시스템 오류 UX 정립

## 결정

- API의 `errorCode`는 안정 식별자, `message`는 안전한 fallback 또는 제한된 보조 상세로 분리한다.
- 프론트 기본 표시는 원문 메시지가 아니라 `code`/`errorCode` 기반 i18n 키로 결정한다.
- Zabbix 표현식 오류만 원문을 입력 수정용 Alert 상세로 보여 준다.

## 구현

- BE `ApiError`가 `ERROR_CODE: detail` 레거시 문자열도 `errorCode=ERROR_CODE`, `message=detail`로 정규화한다.
- 요청 검증/바인딩은 `INVALID_DATA`와 안전한 메시지를 반환하고, 내부 원문은 로그에 남긴다.
- FE `resolveApiError`가 403, 안정 errorCode, 실제 401, timeout/network/5xx를 공통 i18n 키로 매핑한다.

## 교훈

- HTTP 상태 상수의 누락은 `undefined === undefined` 비교로 네트워크 오류까지 인증 오류로 잘못 분류할 수 있다. 상태 상수와 resolver 회귀 테스트를 함께 추가해야 한다.
- 200 + error envelope 환경에서는 axios reject 경로와 정상 응답 경로를 하나의 resolver로 합쳐야 화면별 누락을 막을 수 있다.

## 검증

- FE `apiEnvelope.test.ts`: 18/18 통과.
- BE `GlobalExceptionHandlerTest`, `ZabbixTriggerManageServiceTest`, `ZabbixLldPrototypeManageServiceTest`: 통과.
- 계약/정적 QA: `_workspace/{contract,qa,e2e}_zm114-error-ux.md`.
