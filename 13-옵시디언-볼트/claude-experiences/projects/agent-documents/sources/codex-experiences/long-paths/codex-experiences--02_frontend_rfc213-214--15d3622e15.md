# RFC-213 / RFC-214 구현

## RFC-213

- `ProjectModal.jsx`는 기존 `findProjectById` 전체 응답을 공용 cache에 보관하고 `select`로 폼용 row만 선택한다. 상세 페이지·이슈 맵의 기존 `{success,rows}` 소비를 바꾸지 않는다.
- `isFetchedAfterMount`와 현재 fetch/error 상태를 보고 처음 여는 수정창은 fresh 성공 이후 한 번 초기화한다. 그 전에는 필드·저장을 잠근다. 기존 hydrated guard는 사용자 입력의 후속 refetch 덮어쓰기를 막는다.
- 캐시가 있어도 첫 조회 실패는 이전 값을 폼에 넣지 않으며 기존 오류/Retry UI를 사용한다. 캐시 없는 생성·수정, 스킬 저장, 권한 게이트 및 협업 설정의 기존 계약은 유지한다.
- targeted `npm test -- --runInBand src/pages/project/modal/__test__/ProjectModal.test.jsx --silent`: exit 0, 1 suite / 14 tests. full-response cache, fresh 대기, 첫 실패→재시도 및 기존 사용자 draft 보존을 검증했다.

## RFC-214

- `ProjectList.jsx`의 행·페이지를 파생 state/effect 대신 `useMemo`로 계산한다. statusMap은 상태 목록 기준, rows는 목록·statusMap·navigate 기준, pages는 count·pageSize 기준이다.
- 늦게 도착한 상태 목록·이름/색 변경이 같은 프로젝트 배열에도 반영되며 별도 refetch를 요구하지 않는다.
- targeted `npm test -- --runInBand src/pages/project/__test__/ProjectListStatus.test.jsx src/pages/project/__test__/ProjectPageStatusMetadata.test.jsx --silent`: exit 0, 2 suites / 5 tests.

백엔드 응답·권한·schema·query key identity·TTL·라우트 변경 없음. 새 번역 없음. 부모/공용 컴포넌트의 기존 계약을 유지한 프론트 수정이며 전체 tests/build 및 독립 검수는 최종 단계에서 수행한다.
