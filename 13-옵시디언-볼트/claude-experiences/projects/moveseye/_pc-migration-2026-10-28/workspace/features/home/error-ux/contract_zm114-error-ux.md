# ZM-114 — 공통 오류 계약 및 사용자 안내

## 목표

- 백엔드는 기계 판독 가능한 안정 `errorCode`와 안전한 기본 `message`를 일관되게 제공한다.
- 프론트엔드는 `errorCode`/HTTP body `code`/네트워크 오류를 한 공통 정책으로 사용자 언어와 다음 행동으로 변환한다.
- 기존 `HTTP 200 + { status: "error", code, errorCode?, message?, data? }` 계약과 401 refresh 동작은 유지한다.

## 범위

- 공통 exception/envelope, FE 공통 error resolver·i18n·대표 소비처 및 회귀 테스트.
- Zabbix 표현식 오류처럼 원문이 사용자 수정에 필요한 경우는 별도 예외로 원문을 보조 안내에 보존한다.

## 비범위

- 모든 화면의 개별 토스트를 한 번에 전수 이관하지 않는다.
- API endpoint/HTTP 상태 계약 변경 및 로그 원문 삭제는 하지 않는다.

## 결정 사항

1. `errorCode`는 화면 문구가 아닌 안정 식별자(대문자 snake case)여야 한다. 동적 상세를 붙인 메시지는 `errorCode`가 될 수 없다.
2. `message`는 안전한 fallback이며, 프론트 기본 화면은 이를 그대로 노출하지 않는다.
3. FE 정책은 우선순위 `권한(code=403) → 알려진 errorCode i18n → 네트워크/5xx → 문맥별 fallback`을 따른다.
4. 기존 `TRIGGER_EXPRESSION_INVALID: <Zabbix 원문>`은 expression 오류 Alert의 보조 상세로만 유지한다.

## 🔄 FE 요청사항

- [x] BE 계약 확정 후 `errorCode`와 fallback message 규칙을 이 문서에 기입했다.

## 검증 기준

- 비즈니스 오류, 권한 거부, 실제 HTTP 5xx/네트워크 오류가 모두 사용자 행동 가능한 안내로 귀결된다.
- `useDmoveQuery` 및 mutation의 실패 envelope이 같은 resolver로 해석된다.
- errorCode가 동적 원문과 섞이지 않는 회귀 테스트가 있다.

## FE 확정사항

- `resolveApiError`는 기존의 `errorCode`·`message`를 보존하면서 `messageKey`와 선택 `detail`을 추가한다.
- 표시 우선순위는 `body code=403` → 알려진 안정 `errorCode` → 실제 HTTP 401 → timeout/network/5xx → 화면별 fallback이다.
- `TRIGGER_EXPRESSION_INVALID`는 구 계약(`message`에 `CODE: detail`)과 신규 계약(`errorCode=CODE`, `message=detail`)을 모두 해석한다. 원문 detail은 트리거 표현식 Alert에서만 보조 정보로 노출한다.
- 대표 이관 파일: `apiEnvelope.ts`, `locales/{kr,en}.json`, `ServerLocationList.tsx`, `MapViewList.tsx`, `TriggerFormDrawer.tsx`, `apiEnvelope.test.ts`.
## BE 확정 항목 (2026-08-25)

- `ApiError(ErrorCode)`는 HTTP 200 + 기존 error envelope를 유지하고 안정 `errorCode`를 반환한다.
- `ApiError(ErrorCode, detail)`은 `errorCode`와 `message`를 분리한다. `TRIGGER_EXPRESSION_INVALID`의 Zabbix 원문은 `message`에만 둔다.
- 과거 `ERROR_CODE: detail` 형식도 `errorCode=ERROR_CODE`, `message=detail`로 정규화한다.
- 요청 바인딩·검증 오류는 `code:400`, `errorCode:INVALID_DATA`, 안전한 한국어 message를 반환한다. 상세 원문은 로그에만 남긴다.
- catch-all은 실제 HTTP 500 plain-body shape를 유지하되 안전한 한국어 message만 반환한다. 실제 HTTP 401 규약은 변경하지 않는다.
- FE는 `code=403` → `errorCode` i18n → HTTP 401 → 일반 fallback 순서로 처리하며, message는 트리거 표현식 오류 등의 보조 상세에만 사용한다.
