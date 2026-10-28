# 코덱스 검수 전문 1차 — APM 순위 9~10 BE (2026-10-07, gpt-5.6-sol high, 읽기 전용)

요청서: review_apm-query-controls-be-20261007.md · 대상 브랜치 apm-query-controls(기준 fd4fcfb) 미커밋 diff

## 요약

**판정: 반려**  
**🔴 1건 · 🟡 2건 · 🟢 5건**

핵심 조회 의미, 그룹 범위 검사, v1/v2 서명·지문 검증, 기존 오버로드 연결은 대부분 계약과 일치합니다. 그러나 RED·endpoint export가 계약상 정본인 `env_norm`이 아니라 원문 `env`를 다시 정규화해 판정하므로, 데이터가 어긋난 경우 **다른 환경의 파일을 정상 적용된 것처럼 내보낼 수 있습니다**. 이 문제를 고치기 전에는 FE 연동으로 넘기면 안 됩니다.

검수는 읽기 전용으로 수행했습니다. 파일 수정과 테스트 재실행은 하지 않았고, `git diff --check`는 통과했습니다. 브랜치 HEAD와 merge-base는 모두 `fd4fcfb`이며 신규 `ApmExportEnvScopeTest.java`도 별도로 확인했습니다.

## 결함

### 1. 🔴 RED·endpoint export가 `env_norm` 대신 원문 `env`로 범위를 판정함

- **심각도:** 🔴
- **위치:**
  - 계약은 비교를 `env_norm` 컬럼으로만 하도록 명시합니다. [features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:11](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:11)
  - `ApmExportTarget`은 원문 `env`만 보존하고 `envNorm`은 버립니다. [ApmExportTarget.java:13](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportTarget.java:13), [ApmExportTarget.java:18](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmExportTarget.java:18)
  - RED·endpoint 공통 검사는 `target.env()` 원문을 다시 정규화합니다. [ApmRedSeriesExporter.java:225](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:225), [ApmRedSeriesExporter.java:230](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:230), [ApmEndpointExporter.java:79](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmEndpointExporter.java:79)
  - 반면 error-groups는 DB의 `env_norm`을 읽는 `select()`를 사용합니다. [ApmErrorGroupExporter.java:96](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmErrorGroupExporter.java:96), [ApmServiceRefLookup.java:138](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmServiceRefLookup.java:138)
  - 계획 응답은 실제 판정 결과가 아니라 요청 `env`를 그대로 “적용값”으로 돌려줍니다. [ApmExportService.java:405](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:405)
- **반례:** DB 행이 `env='prod'`, `env_norm='staging'`인 레거시·수동 보정 상태에서 `red-series?env=prod` 요청 → RED는 이 서비스를 포함하지만 error-groups와 일반 조회는 staging으로 판정 → 계획 응답은 `env='prod'`여서 FE 검사를 통과하고, 권위상 staging인 데이터가 prod 파일로 조용히 반출됩니다. 역방향 불일치에서는 정상 서비스가 누락되거나 선택 서비스 요청이 잘못 거절됩니다.
- **권고:** `ApmExportTarget`에 출력용 원문 `env`와 비교용 `envNorm`을 분리해 싣고, 필터는 반드시 `ApmService.getEnvNorm()` 또는 DB `env_norm`만 사용하십시오. 서비스 미선택 RED도 env에 맞는 `ApmService`를 먼저 고른 뒤 `observedMetrics()`에 넘겨야 합니다. 원문과 `env_norm`을 의도적으로 다르게 넣은 통합 테스트로 세 데이터셋의 동일 판정을 검증해야 합니다.

### 2. 🟡 오류·DB 목록과 RED 대상 탐색에서 env가 집계 전에 적용되지 않음

- **심각도:** 🟡
- **위치:**
  - 계약은 집계·total·LIMIT·표본 추출보다 먼저 범위를 제한하도록 요구합니다. [features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:18](/C:/solutions/_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md:18)
  - 오류 목록은 `_1h` 전체를 `group by group_id`한 뒤 외부 `WHERE g.service_id...`를 적용합니다. [ApmErrorQueryService.java:288](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:288), [ApmErrorQueryService.java:296](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:296), [ApmErrorQueryService.java:298](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:298)
  - DB 목록도 동일하게 전체 버킷 집계 후 외부 scope를 겁니다. [ApmDbQueryService.java:96](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:96), [ApmDbQueryService.java:108](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:108), [ApmDbQueryService.java:110](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/dbquery/ApmDbQueryService.java:110)
  - RED 서비스 미선택도 모든 서비스의 관측 메트릭을 조회한 뒤 Java에서 env를 제거합니다. [ApmRedSeriesExporter.java:99](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:99), [ApmRedSeriesExporter.java:102](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:102), [ApmRedSeriesExporter.java:239](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:239), [ApmMetricStore.java:495](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/core/metric/ApmMetricStore.java:495)
- **반례:** `env=prod`, prod 그룹 10개, staging 그룹 100만 개 → 결과 행은 10개로 맞더라도 100만 그룹을 먼저 집계하므로 응답 지연·statement timeout이 발생해 사용자는 정상 10행 대신 오류를 받습니다. RED 역시 전 환경 메트릭을 `distinct` 스캔한 뒤 버립니다.
- **권고:** scoped group ID를 먼저 만드는 CTE/서브쿼리와 버킷 테이블을 조인한 후 집계하십시오. RED는 env에 맞는 서비스 ID만 `observedMetrics()`에 전달하십시오. 환경별 데이터가 크게 치우친 fixture로 `EXPLAIN (ANALYZE, BUFFERS)`를 비교해야 합니다.

### 3. 🟡 단일 배포 변경으로는 rolling deploy의 양방향 토큰 호환이 성립하지 않음

- **심각도:** 🟡
- **위치:**
  - 현재 변경본은 즉시 v2를 발급합니다. [ApmExportPlanToken.java:51](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:51), [ApmExportPlanToken.java:93](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:93)
  - 새 reader의 v1/v2 수용과 env-null 제한 자체는 맞습니다. [ApmExportPlanToken.java:119](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:119), [ApmExportPlanToken.java:124](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:124)
  - 기준 버전은 v1만 수용합니다. [기준 ApmExportPlanToken.java:51](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:51), [기준 ApmExportPlanToken.java:104](/C:/solutions/moveseye-be-spring/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanToken.java:104)
  - 사전 의견도 `dual reader 배포 → v2 issuer 배포`의 두 단계를 요구했습니다. [review_apm-remaining-plan-20261007_codex.md:282](/C:/solutions/_workspace/_archive/features/apm/hardening-20261006/review_apm-remaining-plan-20261007_codex.md:282)
- **반례:** 혼합 fleet에서 신버전 노드가 v2 계획을 발급 → 다운로드가 구버전 노드로 라우팅 → 구버전이 v2 접두를 malformed로 거절하여 `APM_EXPORT_INVALID`.
- **권고:** 1차 배포는 v1/v2 reader이되 issuer는 v1 유지, 전 노드 교체 후 2차로 v2 발급을 켜십시오. 또는 비rolling 전체 교체·구노드 drain을 배포 전제조건으로 명시해야 합니다.

## 중점 확인 요청 판정

- 🟢 **`select()` 호출 수:** 요청당 1회 서비스 조회이며 trace 목록·count·scatter가 같은 `Where`를 공유하므로 경로 내 중복 조회는 없습니다. [ApmTraceQueryService.java:134](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:134)
- 🟡 **`inEnvSql` 성능:** 세미조인 자체는 타당하지만 오류·DB 목록은 env 조건 전에 전체 집계를 수행하며 EXPLAIN도 없어 승인 근거가 부족합니다.
- 🟢 **`groupInScope` 추가 조회:** 범위가 있을 때만 실행되고 서비스-only도 정상적으로 다른 서비스 그룹을 거절합니다. [ApmErrorQueryService.java:434](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:434), [ApmServiceRefLookup.java:159](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmServiceRefLookup.java:159)
- 🟢 **Error series 동작 변화:** scope가 있으면 없는·범위 밖 그룹을 not-found, scope가 없으면 기존 빈 시계열을 유지해 계약과 같습니다. [ApmErrorQueryService.java:370](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorQueryService.java:370)
- 🟡 **planToken v1 호환 창:** 서명·지문·env-null 경계는 맞지만 혼합 버전 rolling 배포 순서가 구현에 반영되지 않았습니다.
- 🟢 **mismatch 메시지의 env:** parser가 먼저 정규화한 `request.env()`를 사용하므로 `" Prod "`는 `"prod"`로 표시됩니다. [ApmExportRequest.java:223](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportRequest.java:223), [ApmRedSeriesExporter.java:233](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/source/ApmRedSeriesExporter.java:233)
- 🟢 **`ApmExportPlanDto.env` 위치:** `method` 뒤 추가와 DTO 생성 인자 순서는 일치합니다. [ApmExportPlanDto.java:59](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportPlanDto.java:59), [ApmExportService.java:405](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/export/ApmExportService.java:405)

추가로 `involved=true + env` SQL 의미는 계약과 같습니다. 선택 서비스의 환경을 먼저 확인한 뒤 `service_ids` 참여 조건을 유지하므로 dev root에서 시작해 prod 서비스를 거친 trace도 포함됩니다. [ApmTraceQueryService.java:143](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:143), [ApmTraceQueryService.java:147](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/query/ApmTraceQueryService.java:147)

기존 오버로드도 누락 없이 보존됐습니다. HTTP 컨트롤러는 env 포함 오버로드를 사용하고, 리포트·배포 내부 경로는 env 없는 기존 오버로드를 의도대로 사용합니다. [ApmErrorController.java:84](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/trace/errors/ApmErrorController.java:84), [ApmReportBuilder.java:489](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/report/ApmReportBuilder.java:489), [ApmDeploymentService.java:206](/C:/worktrees/apm-c05-followup/src/main/java/com/dmove/moveseye/premium/apm/service/deploy/ApmDeploymentService.java:206)

## 테스트가 못 잡는 케이스

- 저장된 `env`와 `env_norm`이 다른 서비스에서 RED·endpoint·error-groups가 같은 범위를 만드는지
- `involved=true`인 prod 참여 서비스와 dev root trace의 실제 목록·scatter 점 검증
- 오류·DB 상세 모두에서 `service`만 주고 다른 서비스의 groupId를 조회하는 HTTP 수준 검증
- 환경별 데이터가 크게 치우친 상태의 EXPLAIN 및 timeout 회귀
- v1-only 구노드와 v2 신노드가 섞인 plan→download 왕복
- 세 데이터셋 각각의 실제 HTTP plan 응답 `env` 및 동일 env+token 다운로드
- 서비스 미선택·존재하지 않는 env에서 0행 계획이 `env`를 정확히 보존하는지
- NFC 결합문자 및 128자 절단 경계의 env 지문·DB 판정 일치

현재 `ApmExportEnvScopeTest`는 인위적인 `ApmExportTarget`의 원문 env만 검사하므로 `env_norm` 정본 위반을 발견할 수 없습니다. [ApmExportEnvScopeTest.java:26](/C:/worktrees/apm-c05-followup/src/test/java/com/dmove/moveseye/premium/apm/export/source/ApmExportEnvScopeTest.java:26)

## 반영 불필요(의도된 동작)

- 그룹 상세·시계열이 `service`와 `env` 모두 없을 때 기존 존재 판정을 유지하는 것
- 목록·시계열의 service/env 불일치는 빈 모집단, 내보내기 불일치는 `APM_EXPORT_INVALID`인 차이
- 공백 env를 전체 환경인 `null`로 정규화하는 것
- env 없는 요청에서 유효한 v1 토큰을 읽고 HMAC 키 파생 라벨을 유지하는 것
- 기존 시그니처를 env 없는 오버로드로 보존한 것
- 범위가 있는 그룹 상세·시계열에 `groupInScope` 조회 1회를 추가한 것
