# 코덱스 검수 전문 2차 — APM 순위 9~10 BE (2026-10-07, gpt-5.6-sol high, 읽기 전용)

## 요약

- **판정: 승인 — 1차 지적 3건 모두 닫힘**
- **건수: 🔴 0 / 🟡 0 / 🟢 3**
- 남은 결함: **없음**
- `git diff --check` 통과. 수정 24파일과 신규 `ApmExportEnvScopeTest.java`까지 검수했으며 파일은 변경하지 않았습니다.

## 남은 결함

없음.

## 1차 항목별 닫힘 여부

- **🔴1 env_norm 정본 — 닫힘.** `ApmExportTarget`이 원문 `env`와 판정용 `envNorm`을 분리하고 DB의 `getEnvNorm()`을 보존합니다(`C:\worktrees\apm-c05-followup\src\main\java\com\dmove\moveseye\premium\apm\export\source\ApmExportTarget.java:16-23`). RED의 `inEnv`와 `observedTargets`도 `envNorm`만 비교합니다(`ApmRedSeriesExporter.java:225-248`). endpoint는 같은 `inEnv`를 호출하고(`ApmEndpointExporter.java:77-82`), error-groups는 `select()`가 DB의 `env_norm`을 직접 조회한 `Selection`으로 count·stream을 제한합니다(`ApmErrorGroupExporter.java:92-102`, `ApmServiceRefLookup.java:120-140`). 원문과 정본이 어긋난 반례도 신규 단위 테스트와 3개 데이터셋 통합 테스트로 고정됐습니다(`ApmExportEnvScopeTest.java:35-43`, `ApmExportIT.java:187-243`).

- **🟡2 집계 전 범위 제한 — 닫힘.** `bucketScopeSql()`과 `scopeParams()`는 mismatch/service/env별 placeholder 수가 0/1개로 일치합니다(`ApmServiceRefLookup.java:160-185`). 오류 목록은 `inner 창 2 → inner scope → outer 창 2 → outer scope → firstSeen/q` 순서가 SQL과 정확히 맞습니다(`ApmErrorQueryService.java:257-303`). DB 목록에는 기존부터 outer 시간 조건이 없으므로 실제 순서는 `inner 창 2 → inner scope → outer scope → system/q → limit/offset`이며 params도 동일합니다(`ApmDbQueryService.java:82-116`, `ApmDbQueryService.java:120-133`). 두 쿼리 모두 scope가 `GROUP BY` 이전 버킷 WHERE에 들어갑니다.

- **🟡3 rolling deploy — 반영 불필요로 닫힘.** `JAR 1개` 문구만으로는 부족하지만 실제 production pipeline이 기존 `moves-be-spring` 컨테이너를 먼저 중지·삭제한 뒤(`C:\worktrees\apm-c05-followup\bitbucket-pipelines.yml:16-31`) 동일 host port `80`에 새 컨테이너 하나만 실행합니다(`bitbucket-pipelines.yml:40-42`). 따라서 old/new issuer가 동시에 요청을 받는 rolling/blue-green 구조가 아닙니다. 새 버전은 배포 직전 발급된 env 없는 v1 토큰도 계속 읽습니다(`ApmExportPlanToken.java:52-59`, `ApmExportPlanToken.java:120-127`).

## 반영 불필요 항목

- **양방향 planToken issuer 호환:** 현 단일 노드 전체 교체 배포에서는 불필요합니다.
- 향후 다중 replica, blue-green, 무중단 rollback을 도입하면 이 판단은 무효입니다. 그때는 먼저 모든 노드가 v2를 읽을 수 있는 호환 릴리스를 배포한 뒤 v2 발급을 켜는 2단계 전환이 필요합니다.
