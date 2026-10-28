# Scheduler·Seed·Migration 기능 감사 기록

기준: 2026-08-26

## P1 — 수동 워크로그 배치가 처리 consumer 없이 queue에만 적재됨

- `startProjectWorklogBatch`는 `project-worklog-project-queue`에 프로젝트별 event를 넣는다(`src/resolver/scheduler/SchedulerService.js:16-26`).
- 그러나 `manifest.yml`의 `consumer`에는 `upload-users-queue`, `portfolio-aggregation-queue`, `subscription-backfill-queue`만 선언되어 있고 이 queue를 소비하는 function/handler가 없다(`manifest.yml:50-60`). 코드 전체에도 대응 consumer 구현이 없다.
- 따라서 설정 권한 사용자가 수동 배치를 실행해도 event만 쌓이고 워크로그 집계는 수행되지 않는다. service가 enqueue 개수나 job ID도 반환하지 않아 UI가 처리 불가 상태를 감지하기 어렵다.

권장 수정: 실제 project worklog consumer와 manifest consumer 선언을 추가하고, 이벤트 body의 `projectId`를 처리하는 멱등 worker를 구현한다. 기능이 폐기된 경로라면 resolver·권한·UI 진입점을 제거한다. enqueue 결과는 최소 `{ queuedCount }`를 반환하고 integration test로 manifest queue key와 producer key의 일치를 검증한다.

## P1 — Seed permission migration이 100개를 넘는 권한 세트에서 일부를 영구 미보정함

- `addPresetPermissionSeed()`는 이름 충돌 판정을 위해 `permission.findAll()`을 사용하고(`src/seed/SeedData.js:161-177`), `migratePermissionSets()`도 같은 비페이지 조회 결과만 순회한다(`:208-245`).
- 공통 helper의 `findAll()`은 100건만 반환하고 cursor를 버린다. 101번째 이후 custom permission set은 신규 ResourceCatalog 항목·`projectScope` 보정·고아 page 정리를 받지 못한다.
- `onInstall`은 seed version을 완료로 기록하므로(`src/trigger/onInstall.js:21-31`), 이후 설치/업그레이드에서는 누락 세트를 자동으로 재시도하지 않는다.

권장 수정: permission seed/migration에 `findAllPaged('name', ..., sharedMax)`를 적용하고 `truncated`면 seed version을 완료로 쓰지 말고 명시적으로 실패시킨다. 목록 관리 경로와 같은 상한을 공유해 보이는 목록과 migration 대상이 갈리지 않게 한다.
