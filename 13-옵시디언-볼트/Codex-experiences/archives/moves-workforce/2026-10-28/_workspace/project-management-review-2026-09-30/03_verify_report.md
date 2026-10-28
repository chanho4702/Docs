# 프로젝트 수정·상태 컬럼·칸반 검수

2026-09-30. 요청은 검수이며 앱 소스·배포·DB·커밋을 변경하지 않았다. 기존 협업 모드 수정과 타 세션의 이슈 생성 변경은 보존했다. `integration-verify`의 실제 응답 생산자·소비자·캐시 교차 검증을 적용했다.

검수 기준 HEAD: `2932ecbb4cc1502e57b5b50c48aca89119f2a0df`. 사용자가 지정한 분류는 RFC-213 프로젝트 수정 시 필드 누락, RFC-214 프로젝트 상태값 간헐 오류, RFC-215 칸반보드 로드 오류다. 번호 분류만 반영했으며 구현·브랜치 생성·커밋은 하지 않았다.

## 판정: 결함 4개 확인

### RFC-213 / P1 — 프로젝트 수정 시 필드가 비거나 이전 값으로 고정됨

- 생산자 `static/ui/src/pages/projectDetail/ProjectDetailPage.jsx:41`: `findProjectByIdQueryKeys(id)`에 `{success, rows}` 응답 전체 저장. `pages/projectDetail/work/map/ProjectIssueMapView.jsx:82`도 동일하다.
- 소비자 `static/ui/src/pages/project/modal/ProjectModal.jsx:130`: 같은 키를 쓰지만 queryFn은 `result.rows[0]` 한 행만 반환한다(`:134`).
- 초기화 `ProjectModal.jsx:148`: 캐시가 있으면 네트워크 응답 전 `setForm(projectDetail)`을 실행하고 `hydrated.current = true`로 고정한다. 응답 객체에는 `project_name`, `start_date` 등이 최상위에 없어 빈 필드가 된다. 뒤늦게 정상 행을 받아도 다시 초기화하지 않는다.
- 재현: 실제 QueryClient에 상세 화면의 전체 응답을 저장한 뒤 실제 수정 컴포넌트를 열면, 재조회 후 캐시는 정상 행인데 이름·상태·시작일은 빈 값이다. 캐시 없는 대조군은 정상이다.
- 같은 초기화 규칙 때문에 오래된 행 캐시도 최신 응답보다 먼저 폼에 고정된다. 수정창을 재개방하거나 칸반 변경 후 열면 과거 값이 보이고, 이를 전체 저장하면 다른 필드의 최신 값을 덮을 위험이 있다.
- 수정 방향: 공용 queryFn의 캐시 shape를 단일화하고 소비자 변환은 `select` 등 observer 계층에서 수행한다. 초기 hydration은 현재 프로젝트의 정상 데이터 확인 후 한 번만 수행하되, 사용자의 입력을 백그라운드 재조회로 덮지 않도록 dirty 상태와 초기 로드 완료를 분리한다.

### RFC-214 / P2 — 상태 목록이 늦게 도착하면 프로젝트 상태 셀이 계속 비어 있음

- `static/ui/src/pages/project/ProjectList.jsx:83`: 행 생성 effect의 의존성이 `[dataList]`뿐이다. 행 내용은 `projectStatus`에서 만든 `statusMap`도 사용한다.
- `ProjectPage.jsx`는 프로젝트와 상태를 독립 쿼리로 동시에 받는다. 프로젝트가 먼저 오면 빈 상태 셀을 만들고, 상태 응답만 도착해도 행을 재생성하지 않는다.
- 재현: 동일한 dataList 참조를 유지하며 projectStatus를 `[] → [{id:'active',name:'진행 중'}]`로 바꾸면 셀은 계속 `-`. dataList 참조를 새로 주면 정상 이름이 나타난다.
- 새로 조회한 목록이 동일하면 React Query structural sharing으로 참조도 같을 수 있어 단순 refetch로 회복되지 않을 수 있다.
- 수정 방향: rows를 `useMemo`로 직접 계산하거나 상태·번역·페이지 크기 등 실제 의존성을 모두 반영한다. 상태 조회 실패도 정상 빈 상태와 분리한다.

### RFC-215 / P1 — 칸반 재조회가 더보기로 읽은 과거 카드를 제거하지만 페이지 상태는 유지

- `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx:108`: 기본 queryFn은 상태 목록과 최근 프로젝트만으로 보드를 새로 만든다(`:120`).
- 과거 프로젝트는 별도 invoke 후 같은 query cache에 수동으로 합친다(`:205`). `oldPage/hasMoreOld`는 component state이며 query 재조회 때 초기화되지 않는다(`:60`, `:243`).
- 3분 주기 재조회(`:123`) 및 카드 이동·이름 변경·프로젝트 수정 등의 invalidate가 기본 queryFn을 다시 실행해 과거 카드를 지운다.
- 재현: 과거 카드 1개를 더보기로 읽고 `hasMore:false`가 된 뒤 invalidate하면 카드는 사라지고 더보기 버튼도 없다. `hasMore:true`라면 다음 page부터 읽어 앞 페이지가 빠지는 구조다.
- 수정 방향: 최근/과거 페이지를 분리한 query 또는 `useInfiniteQuery`로 모든 로드 페이지를 상태화한다. 갱신 정책은 보드 데이터와 페이지 커서·hasMore를 함께 다뤄야 한다.

### 별도 참고 / P2 — 같은 컬럼 안 카드 순서 변경은 성공 직후 원상 복귀

RFC-215의 로드 오류와 구분한다. 순서 기능을 수정 범위에 포함할지는 별도 결정이 필요하다.

- `static/ui/src/pages/projectKanban/useKanbanMutations.js:66`: `taskAbove/taskBelow`로 낙관적 순서를 바꾼다.
- 실제 mutation payload는 `project_id/project_status_key`뿐이고 위치 정보는 보내지 않는다(`:58`). 성공/실패 후 항상 보드를 invalidate한다(`:121`).
- `src/resolver/project/ProjectRepository.js:106`/`:137`: 서버 정렬은 `end_date DESC`이며 사용자 카드 순서 저장 경로가 없다.
- 재현: A/B/C를 A/C/B로 옮기면 낙관적 cache는 맞지만 성공 응답 후 다시 A/B/C가 된다. toast는 성공이다.
- 수정 방향: 순서 변경을 지원할지 결정해야 한다. 미지원이면 동일 컬럼 재정렬을 막고 정렬 기준을 명시한다. 지원하려면 순서 저장·동시 변경 규칙과 서버 조회 순서를 함께 설계해야 한다.

## 검증 증거

실행 위치: `C:\CloudJira\moves-workforce\static\ui`.

- 기존 관련 테스트: `npm test -- --runInBand src/pages/project/modal/__test__/ProjectModal.test.jsx src/pages/project/__test__/ProjectPageStatusMetadata.test.jsx src/pages/projectKanban` — exit 0, 6 suites / 31 tests, 12.123초. 캐시 shape 충돌·메타데이터 지연·과거 페이지 보존·순서 영속화는 기존 테스트에서 검증하지 않았다.
- 별도 진단 테스트: `npm test -- --runInBand --config ../../_workspace/project-management-review-2026-09-30/jest.config.cjs --silent` — exit 0, 4 suites / 6 tests, 5.805초. **결함이 존재하는 현재 동작을 기대값으로 두어 재현했으며, 기능 정상 통과라는 뜻이 아니다.**
- `modal-cache.test.js`: 실제 ProjectModal·Atlaskit Form·QueryClient 실행. 기존 fixture를 재사용했으며 최상위 context await만 기존 테스트와 동일하게 동기 mock 처리했다.
- `status-list.test.js`: 실제 ProjectList의 지연 메타데이터 재렌더 확인. 테이블·라우터·삭제 UI만 mock.
- `kanban-pagination.test.js`: 실제 보드·QueryClient·보드 조립 함수를 사용하고 bridge와 카드 표시 UI/mutation UI를 mock.
- `kanban-order.test.js`: 실제 mutation 훅·QueryClient·노드 조립 함수를 사용하고 서버 응답을 고정 정렬로 재현.
- 진단 초기 실패는 독립 Jest config의 moduleDirectories 우선순위 때문에 source-map 의존성이 잘못 해석된 환경 문제였다. 기본 `node_modules` 탐색을 우선한 최종 실행에서 해소했다. 앱 코드는 수정하지 않았다.
- 후속 구현 검증에서 루트 backend Jest가 `_workspace`의 진단 파일까지 수집하는 것을 확인해 네 파일의 확장자를 `.test.js`에서 `.repro.js`로 변경했다. 전용 config도 함께 변경했으며 진단 내용은 보존했다. 위 재현 결과는 수정 전 기준이며 이후 구현 회귀 테스트는 `static/ui/src`에서 별도로 실행한다.

## 미검증·후속 범위

- 실제 Jira 브라우저 E2E·네트워크 지연·실사이트 상태 데이터는 미검증이다. 위 결함은 현재 소스로 재현했지만 사용자가 겪은 모든 경우의 유일한 원인이라고 단정하지 않는다.
- 이번에는 진단용 파일과 보고서만 추가했다. 앱 변경이 없어 전체 build·Forge 배포를 반복하지 않았다.
- 수정 우선순위: 공용 상세 캐시와 폼 초기화 → 상태 셀 재계산 → 과거 페이지 보존 → 카드 순서 정책.
- 칸반 병렬 mutation의 전체 스냅샷 rollback, KVS 상태 변경 직후 일관성, 실제 드래그 브라우저 이벤트는 추가 검증 후보이며 이 보고서에서는 확정 결함으로 승격하지 않았다.
