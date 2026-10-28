# Moves Workforce — Project Worklog Queue consumer (2026-08-31)

수동 Worklog batch producer가 event만 넣고 consumer를 등록하지 않아 집계가 실행되지 않던 결함을 보정했다.

- Producer와 manifest가 같은 `project-worklog-project-queue`를 사용하도록 계약을 고정했다.
- event에는 job/batch 식별자와 UUID project ID를 모두 넣고, consumer는 형식 검증·done short-circuit으로 at-least-once delivery를 멱등 처리한다.
- 단일 프로젝트 경로는 기존 `aggregateOneProject`과 snapshot UPSERT를 재사용하되, 전체 portfolio rollup KVS는 수정하지 않는다.
- 일시 Jira 오류만 재시도하고, 최종 실패는 batch/job 상태를 `PARTIAL`로 종결해 RUNNING 상태가 남지 않게 한다.

검증: scheduler·consumer·기존 job completion 회귀 3 suite / 17 test 통과.
