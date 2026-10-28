# 프로젝트 수정·상태 표시·칸반 검수

2026-09-30. 앱 코드는 바꾸지 않고 integration-verify로 실제 소비자와 캐시 계약을 대조했다.

사용자 지정 번호: **RFC-213** 프로젝트 수정 시 필드 누락, **RFC-214** 프로젝트 상태값 간헐 오류, **RFC-215** 칸반보드 로드 오류. 카드 순서 원복은 로드 오류와 다른 참고 결함으로 분리한다. 번호 지정은 구현·커밋 승인으로 간주하지 않았다.

- `ProjectDetailPage`·이슈맵은 공용 `projectDetail` 키에 `{success,rows}`를 저장하지만 수정 모달은 단일 row를 저장한다. 상세 방문 후 수정창은 전체 응답을 폼에 한 번만 넣어 빈 필드가 되고 최신 응답으로 회복하지 않는다. 같은 구조에서 오래된 row도 고정된다.
- ProjectList가 상태 메타데이터를 사용해 행 JSX를 state에 만들면서 effect 의존성에 dataList만 넣었다. 프로젝트 목록이 먼저 도착하는 순서에서 상태 컬럼이 비고, 상태 목록이 와도 갱신하지 않는다.
- 칸반은 최근 조회 cache에 과거 페이지를 수동 합친다. 재조회는 최근 카드로 cache를 덮지만 oldPage/hasMore를 유지해 과거 카드가 사라진다. 더보기가 끝났다면 버튼도 돌아오지 않는다.
- 컬럼 내 드래그 순서는 낙관적으로만 바뀌며 서버에는 상태만 저장한다. 성공 후 refetch가 end_date 정렬을 돌려줘 이동이 취소된 것처럼 보인다.
- 기존 관련 31개 테스트는 통과했다. 별도 실제 컴포넌트·훅 재현 6개로 위 결함과 cold-cache 정상 대조군을 확인했다. 테스트 성공은 이번에는 '결함 재현 성공'이며 정상 기능 판정이 아니다.
- 독립 Jest config에서 moduleDirectories에 UI 절대 node_modules를 앞세우면 패키지별 의존성 탐색을 바꿔 source-map 버전이 섞일 수 있다. 기본 node_modules를 우선하고 UI 경로는 fallback으로 둔다.

보고서/진단 테스트: `_workspace/project-management-review-2026-09-30/`. 실제 Jira E2E·동시 mutation·KVS 상태 갱신 직후 일관성은 미검증이다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-skills-ux-2026-09-22|moves-workforce-project-skills-ux-2026-09-22]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-collab-runtime-review-2026-09-30|moves-workforce-collab-runtime-review-2026-09-30]], [[projects/agent-documents/sources/codex-experiences/topics/codex-experiences--tanstack-query-cross-domain-invalidation|tanstack-query-cross-domain-invalidation]].

## 후속 구현

사용자의 작업 완료 후 커밋 요청에 따라 RFC별 수정을 진행했다. 이전 협업 모드 변경과 동시 작업자의 RFC-210 변경은 이번 커밋에서 제외한다.

- 공용 query key의 캐시는 원본 `{success,rows}`로 통일하고 modal만 `select`로 첫 row를 꺼낸다. 최초 fresh 조회 전 오래된 cache로 hydrate하지 않으며, 초기화 이후 입력은 background refetch에서 보존한다.
- 다른 비동기 데이터에 의존하는 JSX는 독립 state/effect보다 올바른 의존성의 파생 값으로 계산한다. 상태 이름·색과 pagination pageSize까지 회귀 테스트한다. navigate mock도 안정 참조여야 누락 의존성이 우연히 갱신되는 false positive를 막는다.
- 칸반은 카드와 loadedPages/hasMore를 같은 query 결과에 저장한다. 재조회는 최근 목록과 이미 연 과거 페이지까지만 읽는다. 부분 실패·취소·더보기와 invalidate 양방향 경합에서는 이전 snapshot을 보존한다. 서버 offset 이동을 반영하는 대신 더보기마다 이전 페이지를 재조회하는 요청 비용이 있다.
- 역사적 결함 재현 파일을 `_workspace`에 `.test.js`로 두면 root Jest도 수집한다. `.repro.js`와 전용 testMatch로 분리해 원본을 보존했다.
- Forge lint는 CI build가 모든 Custom UI output을 완성한 뒤 실행해야 한다. build-panel이 재생성되는 도중 병렬 lint는 index.html 누락 오류를 낼 수 있다.

수정 후 전체 테스트: backend 144 suites/1,965 tests, frontend 134 suites/2,149 tests + snapshot 1 통과. CI build 통과(app 481,804/950,000, panel 329,459/350,000 bytes), 빌드 후 Forge lint exit 0(Unknown product로 일부 권한 검사 미검증). RFC-213 `2019a7e`, RFC-214 `e0e20bc`, RFC-215 `9f8aaf5` 커밋 완료. 푸시·배포·실사이트 E2E는 하지 않았다.
