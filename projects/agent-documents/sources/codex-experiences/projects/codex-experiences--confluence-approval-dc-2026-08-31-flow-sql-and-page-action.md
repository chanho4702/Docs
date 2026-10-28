# Confluence Approval DC — Flow SQL 및 페이지 액션 배치 (2026-08-31)

## 문제

- 순차 승인 Flow를 선택해 승인 요청을 만들면 `SQL_EXECUTION_ERROR`가 반환됐다.
- 승인 요청 버튼은 `Edit`와 같은 페이지 액션 바에 있어야 했지만, Confluence의 비동기 렌더링 이후 순서 보정이 한 번만 실행되어 배치가 흔들렸다.

## 원인과 결정

- `APR_FLOW.FLOW_ID`와 `APR_FLOW_P.FLOW_ID`가 `StringLength.UNLIMITED`였다. 일부 지원 DB에서는 CLOB/TEXT가 되어 `WHERE FLOW_ID = ?`, 정렬, 삭제에 사용할 수 없다.
- Flow ID는 UUID이므로 64자, principal key는 255자로 제한하고, Flow ID에는 인덱스를 둔다.
- `system.content.action/primary`는 Edit 줄이 아니라 Tools 메뉴다. `system.content.button`을 유지하고, 액션 바가 만들어진 뒤 승인 요청 항목을 Edit 바로 뒤로 배치한다.

## 검증

- `node --check approval-confluence9/src/main/resources/js/approval.js` 통과.
- 이 작업 환경에는 Maven 3.5.4만 있어 프로젝트의 Maven 3.6.3 이상 요구 조건으로 Maven 검증은 실행하지 못했다.

## 교훈

- Active Objects의 `UNLIMITED` 문자열은 표시용 본문에만 쓰고, equality 조건·`IN`·정렬·삭제에 쓰는 식별자는 반드시 길이를 명시한 문자열 컬럼으로 모델링한다.
- Confluence UI 위치 키의 이름만 보고 바꾸지 말고, 실제 위치가 액션 바인지 Tools 메뉴인지 확인한 뒤 DOM 순서 보정은 렌더링 수명주기에 맞춰 실행한다.
