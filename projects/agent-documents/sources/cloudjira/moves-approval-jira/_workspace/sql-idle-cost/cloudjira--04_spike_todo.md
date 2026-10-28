# sql-idle-cost — 실측 확인 목록 (backend 2026-10-10)

배포 후 리더가 확인한다. 코드는 아래 가정으로 구현돼 있다.

| # | 항목 | 가정 | 확인 방법 |
|---|---|---|---|
| S1 | consumer(`sweep-job-consumer`) 실행 한도 | 25초(작업 예산 20초). codex 검토는 scheduledTrigger·async consumer 기본 55초, `timeoutSeconds` 로 최대 900초라고 함 | `forge logs` 에서 `[SWEEP][consumer]` 요약 로그와 실행 시간. 한도가 55초면 `JOB_BUDGET_MS` 를 늘릴 수 있다(지금은 보수적으로 둠) |
| S2 | 큐 지연 | push 후 수 초~수 분 안에 소비 | 일일 트리거 시각 ↔ `[SWEEP][consumer] {"job":...}` 로그 시각 차. 이어달리기 `delayInSeconds: 10` 이 지켜지는지 |
| S3 | `@forge/events@2.1.7` | `@forge/api@7.2.2` 와 짝(이 리포 버전과 동일). 3.x 는 `@forge/api@8` 요구라 피함 | `forge deploy` 번들 성공, consumer 이벤트 수신 |
| S4 | manifest 변경의 major 여부 | scheduledTrigger 3개 삭제 + `consumer` 모듈 1개·function 1개 추가 — scope·egress 변화 없음 → minor 로 예상 | `forge deploy` 출력에 major 경고가 있는지. 있으면 `--approve MAJOR_VERSION_RULE` |
| S5 | 큐 push 가 scope 없이 되는지 | Async Events API 는 별도 scope 불필요로 가정 | 일일 트리거 첫 실행 로그에 `queue push failed — running inline` 이 없는지 |
| S6 | 큐 중복 배달 | at-least-once 가능. 리스(approval_job_state)·결정적 id 로 중복 무해 | 같은 eventId 두 번 소비 로그가 있어도 상태가 한 번만 바뀌는지 |
| S7 | 스케줄 트리거 컨텍스트의 cloudId | 기존 W7 그대로. 트리거가 push 할 때 `cloudIdHint` 를 body 에 실어 consumer 에 넘긴다 | 워크포스 연동 설치에서 `[WF][daily]` 가 CLOUD_ID_UNKNOWN 이 아닌지 |
| S8 | KVS `schema:version` 마커 | 배포 후 첫 resolver 호출(`ensureMigratedOnce`) 또는 일일 트리거 마이그레이션이 기록 | 배포 다음 날 일일 트리거 로그에 `[MIGRATE]` 가 없고(건너뜀), consumer SQL 에 information_schema 가 없는지 |
| S9 | `getAppContext().installationAri` 를 트리거·consumer 에서 읽을 수 있는지 | 스키마 확인 캐시 키. 실패하면 'unknown' 단일 키로 동작(같은 컨테이너의 다른 설치와 키가 겹칠 수 있음 — 그래도 KVS 마커 일치가 전제라 위험은 낮음) | 런타임 로그에서 예외 없음 |
