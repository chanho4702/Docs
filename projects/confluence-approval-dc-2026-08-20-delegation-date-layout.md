# Confluence Approval DC: 내 위임 기간 입력 정렬 (2026-08-20)

- 내 위임 폼에서 시작일·종료일을 `deleg-form__dates` 그룹으로 묶어 같은 행에 배치했다. 대상 검색 필드의 폭과 독립적으로 날짜 두 필드가 정렬된다.
- `git diff --check`를 통과했다. 로컬 Confluence 실행으로 `target`을 점유 중인 Maven package가 장시간 실행 중이어서 새 JAR 완료는 별도 확인이 필요하다.
