# RFC-215 칸반 과거 페이지 보존 수정

2026-09-30. 저장소 `C:\CloudJira\moves-workforce`. 입력은 상위 `03_verify_report.md` RFC-215 절, `kanban-pagination.test.js` 재현, 리더가 승인한 완성 보드 cache 유지 설계다. 작업 중 다른 세션이 HEAD를 `624a819`로 갱신했으며 담당 파일 충돌은 없다.

## 수정 결과

- `static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx`: 로컬 `oldPage/hasMoreOld`와 별도 카드 수동 병합을 제거하고 `useKanbanBoardData`로 조회를 통합했다. 더보기 중 버튼을 비활성화하며 기본 조회·더보기·재조회 실패 모두 기존 오류/재시도 UI로 표시한다. 기존 보드가 있어도 실패 안내가 보인다.
- `static/ui/src/pages/projectKanban/useKanbanBoardData.js`: `kanbanQueryKeys`에는 기존과 같은 완성 보드 `{ root, [statusId], [taskId] }`를 저장한다. `root.oldProjects = { loadedPages, hasMore }`만 추가해 카드와 페이지 정보가 같은 query 성공에서 함께 갱신된다.
- `static/ui/src/pages/projectKanban/__test__/kanbanPagination.test.jsx`: 실제 보드, QueryClient, 조립 함수, 이름 변경 mutation을 사용한 17개 회귀 테스트를 추가했다. bridge·카드 표시 UI·모달만 mock했다.

공용 query key, 서버 응답, permission, mutation 구현, 번역은 변경하지 않았다. 기존 협업 모드 및 사용자 dirty 변경을 보존했다. 같은 컬럼 안 드래그 순서 정책은 수정하지 않았다.

## 생산자·소비자 계약

- `getProjectStatusExistLink`: 성공 응답의 `rows` 배열을 상태 컬럼으로 조립한다.
- `getProjectsRecentForKanban`: 성공 응답의 `content` 배열을 최근 카드로 조립한다.
- `getOldProjectsForKanban({ page, size:5 })`: 성공 응답의 `content` 배열과 `page.hasMore` boolean을 사용한다.
- 모든 resolver는 `success:true`와 실제 배열을 확인한다. 실패 envelope, Promise reject, 배열 아닌 content, 잘못된 pagination은 throw해 query error로 처리한다. 빈 배열 성공으로 치환하지 않는다.
- 실제 `useKanbanMutations`의 모든 낙관 patch는 최상위 보드와 필요한 root 필드를 spread하고 rollback은 완성 snapshot을 복원하므로 `root.oldProjects`를 보존한다. 이름 변경 성공/무효화와 기존 삭제 흐름 테스트로 이 소비 계약을 확인했다.

## 조회·캐시·경합 처리

초기에는 recent와 상태만 읽는다. 이후 자동 재조회와 mutation invalidate는 cache에 기록된 1..N 과거 페이지만 재조회한다. 더보기는 같은 query에 N+1 범위를 요청하고, 모든 응답을 성공적으로 조립한 뒤 cache를 교체한다. 실패 중에는 이전 카드와 페이지 메타데이터를 유지한다. 재시도는 실패한 요청 범위를 다시 읽으므로 다음 페이지를 건너뛰지 않는다.

페이지 크기는 5이며 과거 전량 조회는 하지 않는다. 끝을 나타내는 `hasMore:false`를 만나면 더 이른 페이지에서도 종료하고 실제 읽은 `loadedPages`와 함께 기록한다. 프로젝트 삭제·날짜 변경으로 목록이 줄거나 recent/old 사이를 이동해도 새 범위로 보드를 재조립한다. ID 중복은 Map으로 제거하며 recent 결과를 우선한다.

더보기는 진행 중인 이전 범위 refetch를 취소한 뒤 같은 query를 재조회한다. TanStack Query의 AbortSignal을 읽고 응답마다 취소 여부를 확인해 취소된 응답이 추가 페이지 조회나 cache 갱신을 이어가지 않게 한다. 이미 시작한 bridge 요청의 서버 실행 자체를 중단하는 API는 사용하지 않는다. 취소·재시작 때문에 같은 페이지의 네트워크 요청이 다시 발생할 수 있으나, 성공한 보드의 페이지 진행과 카드 수는 중복 증가하지 않는다.

정합성을 위해 더보기에서도 recent/상태 및 이전에 연 페이지를 함께 새로 읽는다. 요청 수는 사용자가 연 페이지 수에 비례하며 페이지별 cache로 API 횟수를 줄이는 별도 구조는 이번 범위에 도입하지 않았다.

## 검증

통과: 작업 디렉토리 `C:\CloudJira\moves-workforce\static\ui`, 다음 명령 종료 코드 0. **5 suites / 35 tests**, 22.96초. 실행 세션 `32730` 출력에 결과가 있으며 별도 로그 파일은 만들지 않았다.

```text
npm test -- --runInBand src/pages/projectKanban
```

신규 17개 테스트는 다음을 확인한다.

- 더보기 후 수동 무효화·3분 자동 재조회에서 old 카드 보존 및 title/status 갱신.
- 불러온 페이지만 조회하고 `size:5` 유지, 마지막 페이지 더보기 버튼 상태 유지.
- 과거 목록 축소 시 card/page/hasMore 동시 반영 및 다음 더보기의 정상 page 번호.
- 실패 응답·네트워크 오류·content shape·pagination 오류의 기존 snapshot 유지와 재시도.
- 기존 여러 페이지 재조회 중 일부 실패에도 부분 snapshot으로 덮어쓰지 않음.
- refetch→더보기, 더보기→invalidate, cancelQueries→더보기 재시도의 실제 QueryClient 경합.
- 늦은 취소 응답 무시, 중복 클릭/중복 프로젝트의 카드 수 일관성.
- recent↔old 경계 이동·상태 변경, 탭 재진입의 cache 페이지 범위 복원.
- 실제 이름 변경 mutation의 낙관 patch와 invalidate 후 페이지 메타데이터 보존.
- 최초 기본 조회의 실패·잘못된 shape를 빈 보드 성공으로 저장하지 않음.

통과: 담당 경로 `git diff --check`, 종료 코드 0. CRLF 변환 안내 외 오류 없음.

첫 테스트 실행에서 Jest의 AbortSignal에 `throwIfAborted()`가 없어 확인됐고, 표준 `signal.aborted` 검사로 변경한 최종 코드가 위 전체 칸반 테스트를 통과했다.

미검증/리더 담당: 전체 backend/frontend 테스트, `CI=true` 빌드·번역 merge·Forge lint, 실제 Jira 브라우저 E2E와 네트워크 지연. 신규 번역이 없어 merge는 실행하지 않았다. 커밋·푸시·배포·설치는 하지 않았다.
