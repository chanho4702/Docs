# RFC-216 워크로그 생성 스페이스 필터

2026-09-30. 사용자는 RFC-213~215 완료 후 워크로그 생성의 할당 이슈 목록에 스페이스 필터를 요청했다. 기존 My Work/프로젝트 캘린더는 같은 WorklogModal을 사용하므로 해당 공용 지점에서 추가한다.

## 계약과 교훈

- 생성 이슈 조회는 getMyIssueList resolver가 아니라 frontend executeRequest('searchIssueWithJQL')의 사용자 자격 Jira 검색이다. 기존 RMS 연결·선택 프로젝트·currentUser 담당자/공동작업자 조건에 AND project IN 조건을 더한다.
- 이슈 첫 100건에서 스페이스 후보를 만들거나 결과를 클라이언트 후필터하면 뒤쪽 결과를 잃는다. 후보는 사용자 browse 권한의 live Jira project/search를 페이지 끝까지 읽고, 이슈 검색에는 서버 JQL로 먼저 필터한다. 기존 검색당 100건 제한 자체는 확대하지 않는다.
- 후보 캐시는 jiraKeys의 사용자별 전용 키로 분리한다. 기존 useJiraProjectOptions는 첫 50건·실패 빈 배열·다른 DTO이므로 같은 cache에 섞지 않는다.
- 같은 issue 선택은 Atlaskit Field 내부 값과 별도 selectedIssue에 함께 존재한다. 필터를 바꿀 때 둘을 함께 비우고, 날짜·시간·코멘트는 초기화하지 않는다. Select key만 바꾸면 Form에 이전 issue가 남을 수 있다.
- AsyncSelect cache hit는 loadOptions를 다시 호출하지 않는다. 이전 검색 실패를 무효화하는 요청 세대는 loadOptions뿐 아니라 검색어 전환에도 갱신해야 한다.
- 설치된 useAsync는 cache hit에서 pending lastRequest도 무효화하지 않는다. A cached → B pending → A cached 뒤 B 성공/실패가 현재 목록을 덮는 것을 실제 hook으로 재현했다. Promise loader에서 stale 결과를 []로 바꾸는 것만으로는 부족하므로 공식 callback loader에서 stale callback 자체를 생략한다.
- 검색어를 유지한 채 재시도로 AsyncSelect를 재마운트하면 그 검색 결과가 defaultOptions가 되어 이후 검색어 clear에도 좁은 목록이 남는다. 재시도는 스페이스를 유지하고 검색어만 초기화하는 계약으로 확정했다.
- 기본 목록 실패는 검색 중에는 숨기더라도 빈 검색어로 돌아오면 드러나야 한다. 실패 도착이 clear 전/후인지 둘 다 검증한다. 또한 범위 문자열은 A→B→A에서 재사용되므로 요청 세대의 식별자로 부족하다. 매 전환의 객체 identity로 늦은 callback과 실패 기록을 격리한다.
- 초기 이슈 옵션에 JSX label이 있으면 매 렌더 새 객체를 만들지 않는다. 실제 Atlaskit Field는 object defaultValue를 JSON.stringify로 비교해 React owner 순환 참조를 만날 수 있다. issue별 useMemo 안정화 뒤 실제 Form 생성·편집 테스트가 통과했다.
- 공용 ProjectFilterDropdown은 기본 props를 유지하고 labelKeys/isDisabled만 확장해 이번 화면은 '스페이스' 문구로 구분한다. 제출 상태는 Form 하위의 useFormState({submitting:true})로 재사용한다.

실행 상태: `afa4bd4`로 RFC-216 구현·검수·커밋 완료. 실제 모달/Form 통합 3건을 포함한 대상 9 suites/143 tests 및 전체 frontend 140 suites/2,210 tests/1 snapshot 통과. CI=true build 통과(app gzip 491294/950000, panel 329459/350000). 최종 14파일 SHA256이 검증 전후·커밋 직전 동일함을 확인했다. backend 무변경으로 직전 144 suites/1,965 tests 통과 증거를 재사용했다. Forge lint exit 0이나 기존 PermissionLinter `Unknown product` 경고로 일부 권한 검사는 실행되지 않았다. 실 Jira E2E·push·deploy는 수행하지 않았다. 자세한 증거는 `_workspace/worklog-space-filter-rfc216/` 보고서에 기록했다. 이번 14파일만 커밋하고 이전 협업 모드 변경 및 타 작업 파일은 보존했다.

관련: [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-worklog-time-range-2026-09-02|moves-workforce-worklog-time-range-2026-09-02]], [[projects/agent-documents/sources/codex-experiences/projects/codex-experiences--moves-workforce-project-management-review-2026-09-30|moves-workforce-project-management-review-2026-09-30]].

## 2026-10-01 사용자 피드백 반영

- 사용자는 접근 가능한 전체 스페이스가 아닌 **내 할당 이슈가 있는 스페이스 + 선택 해제**만 원했다. 위 최초 구현의 전체 project/search 후보 정책을 폐기하고, 현재 워크로그 대상(담당자 또는 공동작업자)과 동일한 RMS 범위의 이슈에서 후보를 만든다.
- 첫 100개 이슈만 사용하면 뒤쪽 스페이스를 잃으므로 `searchIssueWithJQL`에 `fields=['project']`만 요청하고 nextPageToken을 끝까지 따라간다. 같은 프로젝트가 여러 페이지를 차지하는 것은 정상이며 후보 수 증가로 진행을 판단하면 안 된다. 커서 반복·잘못된 응답·실패는 부분 성공으로 숨기지 않는다.
- 캐시는 새로운 `jiraWorklogIssueSpaces` prefix와 사용자·정규화 RMS 집합으로 나눈다. 이슈 검색어와 선택된 스페이스는 후보 조회에 적용하지 않아 자기 선택 때문에 나머지 후보가 사라지는 문제를 방지한다.
- 공용 필터의 빈 선택 트리거와 해제 메뉴는 서로 다른 문구다. 선택적 labelKeys.clear로 기존 소비자는 보존하며 이번 모달은 '스페이스'/'선택 해제'로 구분한다. 후보 조회 실패나 로딩 중에도 선택 해제를 허용하되 Form 제출 중에는 잠근다.
- 전체 backend 1965건, frontend 2215건 테스트 통과. 실 Form에서 선택 해제 후 이슈 선택만 초기화하고 날짜·시간·코멘트를 보존함을 확인했다. CI build 통과(app gzip 491409/950000, panel 329459/350000), Forge lint exit 0이나 기존 Unknown product로 일부 권한 lint는 미실행. 검증 전후 12파일 SHA256 동일을 확인하고 `3be2de3`으로 후속 변경만 커밋했다. 기존 미추적 5파일은 보존했으며 실 Jira E2E·push·deploy는 하지 않았다. 자세한 증거는 `_workspace/worklog-space-filter-rfc216/runs/2026-10-01-assigned-spaces/`에 기록했다.
