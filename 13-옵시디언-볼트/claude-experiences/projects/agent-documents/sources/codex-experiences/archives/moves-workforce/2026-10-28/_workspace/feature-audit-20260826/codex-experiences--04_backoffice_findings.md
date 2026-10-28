# 백오피스 기능 감사 기록

기준: 2026-08-26

## P1 — KVS 기반 백오피스 목록과 상태 전이 데이터가 100건에서 조용히 누락됨

- 공통 `CustomEntityManager.findAll()`, `findByField()`, `findByWhere()`는 기본 한도 100건만 읽고 `nextCursor`를 이어받지 않는다(`src/nosql/query/CustomEntityManager.js:47-83`). 같은 파일은 이 제한과 이를 피하기 위한 `findAllPaged()`/`findByWherePaged()`를 명시하고 있다(`:89-148`).
- 그런데 레벨·역할·권한·프로젝트 상태 목록은 여전히 비페이지 방식 `findAll()`을 사용한다(`src/resolver/backoffice/level/LevelService.js:90`, `role/RoleService.js:39`, `permission/PermissionService.js:34`, `projectStatus/ProjectStatusService.js:84`). 101번째부터 화면·권한 판정·상태 선택지에서 사라져도 오류가 표시되지 않는다.
- 프로젝트 상태는 삭제·링크 저장·순서 재계산에도 `findByField()`를 사용한다(`ProjectStatusService.js:159-164`, `:232`, `:307`, `:361`, `:392`). 상태 또는 전이 링크가 100개를 넘으면 일부 링크를 삭제하지 못하거나, 일부 상태의 순서를 재설정하지 못해 흐름 정의가 불완전해질 수 있다.

권장 수정: 엔티티별 공통 상한 상수를 정하고 목록·중복검사·연관 상태 링크 조회에 같은 상한의 paged helper를 적용한다. 상한을 넘긴 경우에는 조용히 잘린 결과를 반환하지 말고 `truncated`를 API 오류/명시적 제한 응답으로 노출한다.

## P1 — 상태 전이 그래프 무결성을 서버가 보장하지 않음

- 화면은 순환 전이를 막는다(`static/ui/src/backoffice/page/projectStatus/modal/flow/ProjectStatusFlow.jsx:52-73`). 그러나 resolver 입력은 직접 호출할 수 있으므로 이 검증만으로는 데이터 무결성이 보장되지 않는다.
- `setStatusLinkService()`는 입력 `edges`를 검증하기 전에 기존 링크를 전부 삭제하고 새 링크를 저장한다(`src/resolver/backoffice/projectStatus/ProjectStatusService.js:292-321`). 이후 위상 정렬 `getOrderedNodes()`의 결과만 저장하지만, 순환·self-loop·중복 간선·존재하지 않는 상태 ID를 거부하지 않는다(`:325-388`). 순환이 있으면 위상 정렬 결과가 부분 집합이 되어 순서가 누락된 상태 흐름이 영구 저장될 수 있다.

권장 수정: 저장 전에 서버에서 상태 ID의 존재, self-loop/중복 간선, DAG 여부를 검증하고 실패 시 기존 링크를 그대로 유지한다. 삭제 후 다건 저장은 실패 시 복구할 수 있도록 사전 검증과 보상 로직(또는 단일 원자 저장 모델)을 둔다.
