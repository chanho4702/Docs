# Confluence Approval DC 개발 규약

- 사용자 설명, 문서, 주석은 한국어로 작성한다. Technical term과 code identifier는 English를 유지한다.
- `approval-domain`은 Atlassian API에 의존하지 않는다.
- Confluence 9.x와 10.x의 플랫폼 코드는 각각 `approval-confluence9`, `approval-confluence10`에 둔다.
- Confluence 9.x 어댑터는 Java 17, Confluence 10.x 어댑터는 Java 21을 기준으로 한다.
- 승인·반려·만료 같은 상태 전이 규칙은 어댑터에 중복 구현하지 않고 `approval-domain`에서만 변경한다.
- 서버 권한 검증 없이 UI 버튼만 숨기는 구현은 금지한다.
- 승인 이벤트는 화면 제공 여부와 관계없이 append-only 감사 기록으로 남긴다.
- 기존 `C:\Onpremise\addon`은 별도 Jira 플러그인이므로 수정하지 않는다.

