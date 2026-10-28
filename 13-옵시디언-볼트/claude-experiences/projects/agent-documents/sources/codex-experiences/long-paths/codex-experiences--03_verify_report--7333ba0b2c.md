# RFC-213~215 통합 검수

2026-09-30. 저장소 `C:\CloudJira\moves-workforce`. 시작 HEAD는 `2932ecbb4cc1502e57b5b50c48aca89119f2a0df`다. 검수 중 타 세션의 RFC-210 커밋으로 HEAD가 `624a819`를 거쳐 `470bfdf446c91575b56b55c2405c2a96dfdf43c8`로 이동했으며, RFC-213~215는 그 위의 별도 변경 작업 트리로 검토했다. 입력은 상위 `03_verify_report.md`의 재현 원인과 이 실행의 요구사항/상태다. `integration-verify`와 `feature-harness` 기준으로 실제 생산자·소비자와 현재 diff를 대조했다.

검수자는 앱 소스를 수정하지 않았고 이 보고서만 작성했다. 기존 협업 모드와 다른 작업자의 변경을 보존했다. 사용자 승인에 따른 RFC별 커밋은 리더만 수행하며 푸시·배포·DB 변경은 이 작업에 포함하지 않는다.

## 판정

- 코드 계약 검토: RFC-213/214/215 수정 요구사항 통과, 추가 blocker 없음.
- 대상 및 전체 backend/frontend 테스트, CI build 통과. build 이후 Forge lint도 exit 0이며 필수 검증 명령 실행을 마쳤다.
- Forge `PermissionLinter: Unknown product`로 해당 일부 권한 검사는 미검증이다. 앱 PermissionMap/권한 회귀와 별도로 구분한다.
- 실제 Jira 사이트의 브라우저 E2E·원격 지연·드래그 이벤트는 미검증이다.

## RFC-213 — 상세 캐시와 수정 폼 초기화

통과한 코드 경계:

- 서버 `ProjectController.findProjectById → ProjectService.findProjectByIdService`와 `guardedDefine/responseWrapper`의 성공 응답은 `{success,rows}`다. 신규 API/인가 변경은 없다.
- `ProjectDetailPage.jsx:41`은 같은 `findProjectByIdQueryKeys(id)`의 `scopeCheck.rows[0]`을 사용하고, `ProjectIssueMapView.jsx:82`도 `projectDetail.rows[0]`을 사용한다.
- `ProjectModal.jsx:129`는 queryFn에서 원래 응답 전체를 저장하고 `select`에서만 첫 row를 고른다. 상세/맵이 기대하는 공용 cache shape를 훼손하지 않는다.
- `isFetchedAfterMount`, `isFetching`, `isError`와 `hydrated`를 함께 확인해 오래된 cache만으로 필드를 초기화하지 않는다. 첫 fresh 조회 완료 전 기본 필드와 제출이 차단된다.
- 실패하면 로드 오류 및 재시도 UI를 사용하고, 재시도 성공 후 한 번 초기화한다. 이후 background refetch는 이미 작성 중인 필드/스킬을 덮지 않는다. wrapper의 `isOpen` 조건부 마운트와 editId key로 새 모달 세션을 구분한다.
- 저장의 기존 PROJECT write 판정, pending/중복 제출 차단, 부분 실패 복구, 상태 전이 및 저장 후 목록·칸반·상세·인력 관련 무효화는 변경하지 않았다.

검증 대상 실제 테스트는 `static/ui/src/pages/project/modal/__test__/ProjectModal.test.jsx`다. raw cache/최신 값 대기/조회 실패 후 재시도/작성 중 입력 보존/저장 실패/닫기 및 중복 제출 회귀를 확인했다. 테스트의 변환은 CommonJS에서 실행할 수 없는 모듈 최상위 context await만 동기 bridge mock으로 바꾸고 실제 modal/Atlaskit Form/QueryClient를 실행한다.

## RFC-214 — 목록과 상태 메타데이터 도착 순서

통과한 코드 경계:

- `ProjectList.jsx:26`의 statusMap은 projectStatus, `:46`의 rows는 dataList/statusMap/navigate에 의존하는 파생 값이다. 동일 dataList 참조에서도 상태가 늦게 도착하거나 이름/색이 바뀌면 다시 계산된다.
- `:81`의 pages는 totalCount/pageSize를 사용하므로 목록 참조가 그대로인 페이지 크기 변경도 반영된다.
- 헤더·페이지 버튼·오류 문구 번역은 렌더 시 `t()`를 사용한다. row에는 번역 함수로 만든 고정 문구가 없으므로 rows 메모에 t 누락 문제가 없다.
- `ProjectPage`의 목록/상태 독립 쿼리 및 `toProjectStatusData` 응답 계약은 그대로다. 상태 응답 success:false를 성공 cache로 저장하지 않는 기존 queryFn도 유지했다.
- drawer의 status도 같은 최신 statusMap을 참조한다. 삭제/편집 권한과 기존 삭제 continuation에는 변경이 없다.

실제 테스트 `ProjectListStatus.test.jsx`는 동일 dataList로 지연 상태, 상태 이름/색 변경, pageSize 변경을 확인한다. 기존 `ProjectPageStatusMetadata.test.jsx`와 함께 검증한다.

## RFC-215 — 완성 보드와 과거 페이지 상태

통과한 코드 경계:

- 기존 `kanbanQueryKeys = ['kanban']` 및 `root/column/task-*` 보드 shape를 유지하고 root에 `{oldProjects:{loadedPages,hasMore}}` 메타만 추가한다.
- `useKanbanBoardData.fetchKanbanBoard`는 최근 프로젝트/상태를 읽고 이미 연 과거 페이지까지만 순서대로 다시 읽는다. 성공한 완성 보드와 페이지 메타를 한 query 결과로 교체하므로 재조회가 과거 카드만 지우고 다음 페이지 번호를 남기지 않는다.
- old page가 줄거나 끝나면 loadedPages/hasMore를 함께 갱신한다. Map으로 프로젝트 ID를 중복 제거하며 최근 결과를 우선한다. 컬럼을 찾지 못한 카드는 기존 orphan 경고 경로를 유지한다.
- success:false, reject, 비배열 content/rows, 누락된 hasMore는 오류로 처리한다. 부분 페이지 성공만으로 기존 보드를 덮지 않는다. 데이터가 남아 있는 재조회 실패에도 기존 오류/재시도 UI가 표시된다.
- loadMore는 중복 호출을 ref로 막고 cancelRefetch를 사용한다. 실제 invoke 자체는 중단되지 않지만 각 await 뒤 AbortSignal을 확인하여 늦은 이전 응답이 보드/메타를 덮지 않게 한다. 요청하려던 페이지 범위는 취소 뒤 새 query가 이어받는다.
- `useKanbanMutations`의 기존 카드 이동/추가/삭제/이름 변경과 rollback을 대조했다. root 수정 경로가 모두 `...old.root`/`...next.root`를 보존하고 나머지는 보드 전체를 spread하므로 페이지 메타를 제거하지 않는다. 공용 무효화는 동일 ['kanban'] 키에 도달한다.
- recent/old 서비스는 여전히 principal의 scopedProjectIds를 Repository 조건으로 전달하며 PermissionMap의 KANBAN read/list 가드를 사용한다. 프로젝트 상세 PROJECT read/detail 및 상태 조회 OR 권한도 변경하지 않았다. 새 resolver, schema, scope, 민감 DTO 확장은 없다.

성능 절충: 과거 n페이지를 연 재조회는 기본 2회(status/recent) + old n회 호출한다. 더보기도 이전 페이지를 다시 읽어 offset 이동·삭제·상태 변경을 일관되게 반영한다. 이는 이번 요구사항의 선택이며 요청 수 최적화나 운영 지연 개선으로 주장하지 않는다. 여러 서버 호출에 걸친 DB 트랜잭션 snapshot을 보장하는 설계도 아니다.

확인한 실제 회귀 테스트는 `kanbanPagination.test.jsx`의 자동 재조회, 페이지 축소, 실패/재시도, 부분 실패 snapshot 보존, loadMore↔invalidate 양방향 경합, cancelQueries 뒤 같은 다음 페이지 재시도, recent↔old 경계 이동, 중복 제거, 재진입, 기존 rename mutation이다. 최종 실행 결과는 아래 표에 기록한다.

## 실행 증거

| 항목 | 명령·디렉토리 | 결과 |
|---|---|---|
| RFC-213 | `npm test -- --runInBand src/pages/project/modal/__test__/ProjectModal.test.jsx` / `static/ui` | 리더 실행 exit 0, 14 tests 통과 |
| RFC-214 | `npm test -- --runInBand src/pages/project/__test__/ProjectListStatus.test.jsx src/pages/project/__test__/ProjectPageStatusMetadata.test.jsx` / `static/ui` | 리더 실행 exit 0, 5 tests 통과 |
| RFC-215 | `npm test -- --runInBand src/pages/projectKanban` / `static/ui` | frontend 담당 최종 exit 0, 5 suites / 35 tests(신규 17건 포함), 세션 `32730`, 22.96초 |
| Diff 공백 | `git diff --check -- static/ui/src/pages/project/ProjectList.jsx static/ui/src/pages/project/modal/ProjectModal.jsx static/ui/src/pages/project/modal/__test__/ProjectModal.test.jsx static/ui/src/pages/projectKanban/ProjectKanbanBoard.jsx` / app root | 검수자 직접 실행 exit 0, chunk `fff8d1`; CRLF 안내만 존재 |
| Backend 전체 | `npm test -- --runInBand` / app root | 리더 최종 exit 0, 144 suites / 1,965 tests, 85.728초 |
| Frontend 전체 | `npm test -- --runInBand` / `static/ui` | 리더 최종 exit 0, 134 suites / 2,149 tests / 1 snapshot, 세션 `3742`, chunk `7dc1ff`, 80.018초 |
| CI build | `CI=true npm run build` / `static/ui` | 리더 최종 exit 0, 세션 `88510`, chunk `531723`. app gzip 481,804/950,000 bytes, panel 329,459/350,000 bytes로 양쪽 예산 통과 |
| Forge lint | `pwd` 후 `forge lint` / app root | 최종 exit 0, `No issues found`, 세션 `45071`, chunk `57cea8`. build 완료 뒤 순차 실행. `PermissionLinter: Unknown product`와 CLI 13.4.0 갱신 경고는 남음 |

동일 소스의 유효한 담당자 실행 증거는 재사용하고 중복 전체 테스트/빌드는 하지 않는다. 상위 감사의 `_workspace` 진단 테스트는 **결함이 있는 이전 동작을 기대하는 재현물**이다. 수정 후 그 기대값이 실패하는 것은 새 기능 회귀 판정이 아니며 실제 수정 검증은 ui/src의 회귀 테스트로 구분했다.

Backend 전체 1차 실행은 실제 앱 테스트 144 suites / 1,965 tests가 통과했지만 `_workspace`의 과거 재현물 4개가 수집되어 전체 exit 1이었다. 리더가 내용을 보존한 채 `*.repro.js`로 이름을 바꾸고 해당 진단 전용 Jest config를 갱신했다. 최종 backend 재실행은 exit 0이다. RFC-214의 navigate mock도 안정된 함수 참조로 변경하여 매 렌더마다 바뀌는 의존성이 잘못된 useMemo를 우연히 갱신시키는 false positive를 방지했다.

RFC-215 초기 테스트 환경의 AbortSignal에는 `throwIfAborted()`가 없어 실패했다. 최종 구현은 각 응답 뒤 표준 `signal.aborted`를 검사하며, 이 코드로 취소/늦은 응답 테스트를 포함한 칸반 35건이 통과했다.

CI build는 번역 merge, app/panel 빌드 및 양쪽 bundle 검사를 마쳤다. 기존 source-map 원본 누락/Browserslist 갱신 경고는 남았으며 이를 고치기 위해 의존성이나 범위를 확대하지 않았다. Forge lint 1차(세션 `81967`, chunk `056170`)는 panel 빌드의 산출물 정리/생성과 겹쳐 index.html 누락 2건으로 exit 1이었다. 리더가 앱 소스를 수정하지 않고 전체 build 이후 순차 재실행하여 exit 0으로 해소했다. `PermissionLinter: Unknown product` 경고는 생성물 시점 문제와 별도이며 해당 일부 권한 검사는 완료로 간주할 수 없다.

## 실패·미검증·범위 밖

- 확인된 신규 코드 결함 없음. 코드 요구사항과 필수 검증 명령 실행은 완료했다. 사용자 승인에 따른 세 RFC 커밋은 리더가 별도로 수행한다.
- 동일 컬럼 안 카드 순서의 영속화는 API/정책 결정이 필요해 명시적으로 범위 밖이다. 기존 낙관 순서가 서버 end_date 정렬로 돌아가는 동작을 이번 RFC-215가 고쳤다고 주장하지 않는다.
- 다중 mutation 전체 snapshot rollback, KVS eventual consistency, 실제 브라우저 드래그, 실사이트 데이터/지연은 별도 검증 대상이다.
- backend API·SQL DML·SELF mutation·급여/원가·명부·권한 세트 배정·라이선스·스키마는 이번 수정이 없어 기능 변경 검증을 추가하지 않았다. 기존 권한/범위 소비 경로는 위와 같이 확인했다.
