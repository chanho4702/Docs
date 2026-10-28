# Confluence Approval DC QA 7a 재작업

- `hydrate`의 batch 분할은 `chunks()` 단일 헬퍼를 사용하고, 순수 `assemble(...)` 진입점으로 AO 없이 행 조립을 회귀 검증한다.
- AO 승인자/이벤트 행이 없는 기존 데이터도 복원해야 하므로, 복원 경로는 빈 승인 단계 aggregate를 허용한다. 신규 요청 생성의 승인자 유효성 검증은 유지한다.
- 매크로 렌더링은 `pageSnapshotReadOnly`만 사용한다. lazy expiration은 panel의 최신 PAGE 요청 한 건에만 적용하며 영역·과거 요청은 scheduler가 처리한다.
- C9 REST facets는 `LinkedHashMap`으로 응답 순서를 고정하고 nullable display name/space를 방어한다.

검증: JDK 21로 `mvn -pl approval-confluence9 -am test` 통과(domain 54, C9 94), `mvn -pl approval-confluence10 compile` 통과. `clean`, `package`, `install`, 커밋은 수행하지 않았다.
