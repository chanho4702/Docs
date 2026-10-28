# Confluence Approval DC 2026-08-11 Java 포맷 복구

- 기능 변경 없이 `approval-confluence9`의 REST, servlet, AO repository/entity, JSON test를 재포맷했다.
- 이 저장소의 코드 스타일은 개별 import, statement 한 줄, 제어문 본문 중괄호, 4칸 들여쓰기, 긴 파라미터의 줄바꿈을 요구한다.
- servlet text block 내부 JavaScript도 함수 단위로 줄바꿈해 리뷰 가능한 형태를 유지한다.
- JDK 21과 Maven 3.9.16으로 `mvn -B -pl approval-confluence9 -am verify`를 실행해 domain 17건 및 C9 3건 테스트 성공을 확인했다.
