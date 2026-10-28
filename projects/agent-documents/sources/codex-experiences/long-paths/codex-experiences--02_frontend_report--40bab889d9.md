# RFC-216 내 이슈 스페이스 후보 후속 수정

- `useWorklogSpaceOptions`가 `getProjects` 전체 목록 대신 `searchIssueWithJQL`로 기존 `buildWorklogIssueJql({ selectedProjectIds })`의 이슈를 읽는다. `fields=['project']`만 요청하고 검색어/선택 스페이스는 제외하여 자기 필터로 후보가 줄어들지 않는다.
- `nextPageToken`을 끝까지 따라가고 같은 프로젝트가 여러 페이지를 차지해도 진행한다. 잘못된 응답·실패·커서 반복은 오류이며 부분 목록을 성공으로 반환하지 않는다. 정상이면 프로젝트 key 중복을 제거하고 label 순으로 정렬한다. query 취소 후에는 후속 페이지를 요청하지 않는다.
- `jiraKeys.worklogSpaces(accountId, normalizedProjectIds)`는 `jiraWorklogIssueSpaces` prefix로 기존 전체 스페이스 캐시와 분리한다. 사용자·RMS 프로젝트 집합별 범위가 다르고 같은 집합의 순서/중복은 같은 캐시를 사용한다.
- 공용 `ProjectFilterDropdown`에 선택적 `labelKeys.clear`만 추가했다. 기본 소비자는 기존 전체 문구 그대로이며 WorklogIssuePicker만 빈 트리거 '스페이스'와 '선택 해제' 메뉴를 사용한다. 생성 후보 로딩/실패 중에도 해제 가능, 저장 중에는 기존 Form submitting 잠금을 유지한다.
- 선택 변경과 해제는 실제 Form 값·selectedIssue·이슈 검색을 함께 초기화한다. 기존 날짜·시각·코멘트는 그대로이며 편집 모드는 필터/이슈 조회를 실행하지 않는다. My Work와 프로젝트 캘린더가 쓰는 공용 WorklogModal의 저장·권한 계약은 변경하지 않았다.
- KR/EN worklog 원본의 `spaceFilter.all`을 `.clear`로 교체하고 `static/ui`의 `npm run merge` exit 0(7afa7c)으로 생성물에 반영했다.

대상 4 suites/46 tests의 1차 실행 exit 0(93686/f8fbcb). 이후 후보 실패 중 해제 1건과 실제 모달 해제/시간 보존 단계를 보강하여 전체 frontend 검증에 포함했다. 전체 backend/frontend, CI build, Forge lint 최종 결과는 03_verify_report 및 00_status에 기록한다. 기존 feature gate 초기화 경고와 번역 스크립트 module type 경고는 별도 환경 경고이다.

실 Jira 브라우저·원격 권한/지연 시간은 미검증이며 API/schema/manifest/쓰기 정책 변경은 없다.
