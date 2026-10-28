# 협업 모드 프론트 보강 결과

2026-09-30. 저장소 `C:\CloudJira\moves-workforce`. 입력은 `00_input/requirement.md`, `01_architect_design.md`, 리더의 오류·권한별 캐시 계약과 실제 `ProjectCollabService`·`CollabCoverageService` 소스다. 기존 `02_backend_report.md`는 작업 시작 시 없었으며, 확정 계약과 실제 구현으로 대조했다.

## 변경

- `hooks/useProjectReadAuthority.js`: query 성공 상태에서만 app을 허용한다. 최초 실패와 성공 후 재조회 실패 모두 user/UNAVAILABLE로 준비 완료되며 과거 설정값·감사 필드를 현재값으로 내보내지 않는다. QueryClient별 WeakMap으로 전환 메모를 격리해 같은 client의 여러 훅은 한 번만 정리한다. 복구 시 app 재전환과 종속 조회 갱신이 실행된다.
- `utils/collab/collabErrors.js`: `readAuthorityOf`도 query 성공 상태를 확인한다. 전용 resolver의 `COLLAB_ACCESS_UNAVAILABLE`을 접근 재판정 대상에 포함했다.
- `utils/queryKey/collabKeys.js`: `coverage(projectId, canWrite)`로 reader/writer 데이터를 나누며 `coverageOf(projectId)` prefix로 양쪽을 갱신한다. app→user에서는 `resetQueries`로 진행 중 요청을 취소하고 종속 데이터를 지운 뒤 활성 observer를 다시 조회한다. 간트·목록·대시보드 위젯·인사이트·관계 그래프·coverage는 프로젝트 prefix, calendar는 프로젝트 predicate, issue worklog는 해당 프로젝트의 app 키만 대상으로 한다. 다른 프로젝트 cache는 지우지 않는다.
- `hooks/useProjectCollabCoverage.js`: `usePermissionStore((s) => s.canWrite('PROJECT'))`의 boolean 변화를 구독한다. 권한 회수 직후 이전 writer 응답을 reader 화면에 재사용하지 않는다.
- `pages/projectDetail/issue/useWorkListQueries.js`: 같은 프로젝트·같은 authority에서만 이전 페이지 placeholder를 유지한다. app/user 또는 프로젝트가 바뀌면 이전 행을 반환하지 않는다.
- `pages/projectDetail/issue/useWorkListFlatPage.js`, `useWorkListHierarchy.js`: authority 변화도 내부 reset 조건에 포함해 평면 목록 커서·페이지, 계층 목록 페이지·펼침 상태를 초기화한다. 부모 `ProjectIssueTable.jsx`의 기존 변경은 건드리지 않았다.
- `components/collab/CollabModeSetting.jsx`: 설정 재조회 오류나 쓰기 권한 상실 시 이미 열린 켜기 확인 창에서도 적용을 차단한다. 기존 `collab.toggle.loadFailed` 오류 문구를 재사용한다.

신규 화면·라우팅·UI Kit·의존성·번역은 추가하지 않았다. 기존 work/map/issue 화면 변경, `projectKeys.js`, 생성 번역 변경은 보존했다.

## 응답과 소비 계약

- access 성공: `{ success:true, content:{ collabMode, readAuthority, reason, changedBy, changedAt } }`. 실패 응답과 invoke Promise reject를 모두 query error로 승격한다. SQL 장애의 `COLLAB_ACCESS_UNAVAILABLE`은 UI 오류로 소비하며 정상 OFF로 표시하지 않는다.
- coverage 성공: `{ success:true, spaces, hiddenSpaceCount, userOnlyIssueCount, truncated }`의 루트 필드를 유지한다. 실패는 기존 범위 확인 실패 문구를 사용하고, `COLLAB_MODE_OFF`만 기존 규칙대로 조용히 생략한다.
- coverage 단독 실패는 access를 자동 무효화하지 않고 위 실패 UI로 알리는 기존 동작을 유지한다. `invokeCollab`의 접근 재판정은 목록 4경로·워크로그 2경로에 적용된다. access query 자체가 실패하면 배지는 숨기고 user 경로로 전환한다.
- 설정 mutation 성공 shape와 access/종속 cache 갱신은 유지했다. 실패 중에는 mutation 호출을 막는다.
- 목록의 page/detail 성공 DTO는 `{ issues, userMap, nextPageToken? }`로 유지했다. 동일 권한의 페이지 이동 placeholder도 유지한다.

## 검증

통과: `static/ui`에서 아래 명령, 종료 코드 0, **6 suites / 104 tests**. 최종 authority·cursor·placeholder·coverage·설정 수정 상태를 포함한다. 원본 결과는 실행 세션 `30419`의 출력에 있으며 별도 로그 파일은 생성하지 않았다.

```text
npm test -- --runInBand src/hooks/__test__/collabReadAuthority.test.js src/components/collab/__test__/collabUi.test.jsx src/components/collab/__test__/collabFollowup.test.jsx src/pages/projectDetail/issue/__test__/workListCollab.test.js src/pages/projectDetail/issue/workListQuery.test.js src/pages/projectDetail/issue/workListTree.test.js
```

회귀 확인:

- app 성공 → SQL 실패 응답/네트워크 reject → user → app 회복.
- 실제 QueryObserver의 동일키 데이터 제거와 활성 재조회, 늦게 완료되는 app 응답의 복원 방지.
- 같은 client의 다중 훅은 한 번만 reset, 별도 QueryClient는 각각 reset.
- 다른 프로젝트 cache 보존, calendar/app worklog cache 제거.
- 목록 app→user 전환 중 이전 행 미표시, 같은 권한 페이지 이동의 기존 행 유지.
- app cursor가 user 검색에 전달되지 않음, 계층 페이지·펼침 복원.
- writer→reader 변경 직후 writer 전용 스페이스 숨김, reader 재조회, 양쪽 coverage prefix 무효화.
- 오류 시 배지 숨김·복구, 설정 오류 문구·토글 비활성화·확인 창 적용 차단.
- `COLLAB_ACCESS_UNAVAILABLE` 및 scope 거부의 access 재판정.

통과: 담당 파일 `git diff --check`, 종료 코드 0. CRLF 변환 안내만 있으며 공백 오류는 없다.

참고: 첫 신규 경합 테스트는 TanStack Query의 취소된 refetch Promise가 새 refetch Promise에 합류하는 동작 때문에 테스트 자체가 대기했다. user 응답을 해소한 뒤 대기하도록 테스트를 수정했고 위 최종 실행은 전부 통과했다.

미검증/리더 담당: 전체 frontend 테스트, `CI=true` build, translation merge, Forge lint와 실제 Jira 브라우저 동작. 새 번역이 없으며 merge/build는 공유 생성 파일 보호를 위해 리더가 단독 실행한다. 배포·설치·DB migration·커밋·푸시는 하지 않았다.
