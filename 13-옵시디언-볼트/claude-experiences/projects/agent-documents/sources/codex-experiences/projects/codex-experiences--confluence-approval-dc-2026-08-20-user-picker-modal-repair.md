# Confluence Approval DC: 승인자 상세 검색 모달 구조 보정 (2026-08-20)

- 상세 검색 창을 요청 `<form>` 내부가 아닌 요청 모달의 형제 요소로 분리했다. overlay가 form의 레이아웃과 overflow 영향을 받지 않으며, 항상 최상단에 표시된다.
- 버튼·검색 입력·다중 선택·적용은 모달에서 연결된 요청 form을 명시적으로 찾아 동작시킨다.
- `node --check`, i18n 키 대조, `git diff --check`, JDK 21 `mvn -pl approval-confluence9 -am -DskipTests package`를 통과했다.
