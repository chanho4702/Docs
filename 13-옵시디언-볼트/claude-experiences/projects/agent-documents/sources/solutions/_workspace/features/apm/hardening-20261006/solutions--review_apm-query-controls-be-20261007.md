# 검수 요청 — APM 순위 9~10 BE: 환경(env) 필터·그룹 범위·내보내기 env/planToken v2 (2026-10-07)

구현: Claude(SOLO-CLAUDE). 검수: Codex. 기준 BE master `fd4fcfb`(브랜치 `apm-query-controls`, worktree `C:/worktrees/apm-c05-followup`). FE는 **다음 커밋**(이 요청서 범위 밖).
계약: `_workspace/features/apm/hardening-20261006/contract_apm-query-controls-20261006.md`(이번에 "2026-10-07 구현 결정" 절 추가). 코덱스 사전 의견 `review_apm-remaining-plan-20261007_codex.md` §3.

## 범위 (BE 19파일)

**범위 판정 정본** — `trace/query/ApmServiceRefLookup.java`
- `envNorm(String)`: 생략·공백→null, 아니면 `ApmNaming.normalize`(env_norm 저장 규칙과 동일).
- `select(uid, env)` → `Selection(serviceId, envNorm, mismatch)`. 없는/비UUID uid → `APM_SERVICE_NOT_FOUND`; 서비스는 있는데 환경 밖 → `mismatch=true`(404 아님).
- `inEnvSql(col)` = `and col in (select id from apm_service where env_norm = ?)` — 집계·count·LIMIT 앞 WHERE에.
- `groupInScope(table, groupId, selection)` — 상세·시계열 사전 확인(`apm_error_group`·`apm_db_query_group`, 코드 상수).

**조회 서비스 4곳** — 전부 기존 시그니처를 오버로드로 보존(env 없는 호출 = 종전).
- `ApmTraceQueryService.Filter`에 `env` 추가(6인자 생성자 유지). `where()`: mismatch→`1=0`, 서비스→종전(involved 유지), env만→루트 서비스 `inEnvSql`. 목록·total·산점도가 같은 where.
- `ApmErrorQueryService`: `list(range, service, env, …)`, `windowFilter(Selection)`(목록·count·내보내기 공통), `countForExport/streamForExport(Selection)`, `detail/series(groupId, range, service, env, …)` + `requireInScope`(범위 조건 있을 때만, 범위 밖→`APM_ERROR_GROUP_NOT_FOUND`).
- `ApmDbQueryService`: `list/systems(…, env)`, `detail/series(…, service, env)`, `appendScope`/`requireInScope`.
- `ApmDependencyQueryService`: `list/series(…, env, …)` — 호출 서비스 `service_id` 기준.
- 컨트롤러 4개: `env` 쿼리 파라미터(+ 그룹 상세·시계열에 `service`).

**내보내기**
- `ApmExportRequest`: `env` 필드(14번째, 기존 10·13인자 생성자 유지), `parse(... method, env, format ...)` 오버로드(문자열·값 입구 둘 다), 제어 문자 거절, 길이는 normalize가 128로 자름. `invalid()` public.
- `ApmExportPlanToken`: `VERSION="v2"`(지문에 env), `LEGACY_VERSION="v1"` 읽기만 — 요청 env가 null일 때만 유효, env 요청에 v1이면 `APM_EXPORT_INVALID`. `legacyFingerprint`, 테스트용 `issueLegacy`. 키 라벨 불변.
- `ApmExportController`: plan·download에 `env`. `ApmExportService.parse(… env …)` 오버로드. `ApmExportPlanDto.env` 추가(`method` 뒤).
- `ApmErrorGroupExporter`: `refs.select`로 Selection, mismatch→`APM_EXPORT_INVALID`, `plan.state()`에 Selection.
- `ApmRedSeriesExporter.inEnv(targets, request)`(static): env만→환경 안 타깃만(비면 빈 목록), 서비스 선택+환경 밖→`APM_EXPORT_INVALID`. `ApmEndpointExporter.plan`도 같은 검사.

**테스트** — `ApmTraceQueryIT` +1, `ApmTraceAggQueryIT` +3(오류·DB·외부 호출 env/불일치/범위 not-found, 실 PG), `ApmExportPlanTokenTest` +2(v1 레거시·env 지문)·기존 forged 케이스 정정, `ApmExportRequestTest` +1, `ApmExportEnvScopeTest`(신규 3), `ApmReadAccessMvcTest` 스텁 인자 수, `ApmExportIT` v2 접두.

## 의도 — 선택과 버린 대안

1. **mismatch = 빈 모집단(`1=0`), not 404.** 계약 "존재하지만 환경이 다르면 빈 모집단". 서비스는 실재하므로 404는 거짓.
2. **그룹 상세·시계열 범위 확인은 "범위 조건이 있을 때만".** 범위 없는 호출은 종전 동작(상세 LEFT JOIN·시계열 존재 확인 없음) 유지 — 기존 테스트·화면 호환.
3. **내보내기 mismatch는 거절(`APM_EXPORT_INVALID`)**, 목록 화면은 빈 결과 — 감사 파일은 조용한 0행보다 명시 거절이 안전. 세 데이터셋 모두 env 적용(초안 "red-series·endpoints 거절"을 변경, 코덱스 §3-2).
4. **planToken v2 + v1 읽기 병행.** 대안(v1 지문에 env만 추가)은 30분 TTL 안 토큰을 전부 깬다. v1은 env null 요청에서만.
5. **정규화 공용 헬퍼를 `ApmServiceRefLookup`에 둔 이유** — 조회 4곳과 exporter가 이미 이 클래스를 주입받고 있고 `trace.query`는 export에서도 import 가능(기존 의존).
6. `ApmServiceMapQueryService`의 `s.env = ?`(원문 비교) 불일치는 **범위 밖**으로 남김(코덱스 조사 "계약과 어긋나는 점 2").

## 중점 확인 요청

- [ ] **`select()`가 호출마다 `apm_service` 1행 조회** — 종전 `idByUid()`(전 서비스 맵)보다 가볍지만 횟수는 같다. 트레이스 where는 요청당 1회.
- [ ] **`inEnvSql` 서브쿼리 성능** — `apm_service`는 작은 표(수백 행)라 `in (select …)`가 세미조인으로 풀릴 것으로 봄. 실측 EXPLAIN은 안 했다.
- [ ] **`groupInScope` 두 쿼리** — 상세·시계열에 조회 1회 추가(범위 조건 있을 때만).
- [ ] **ErrorQueryService.series 동작 변화** — 범위 조건이 있으면 없는 그룹이 빈 결과 대신 404. 범위 없으면 종전.
- [ ] **planToken v1 호환 창** — v1 토큰은 TTL(30분) 안에만 의미. 배포 후 30분 뒤면 v1 경로는 사실상 죽은 코드지만 제거하지 않음(롤백 안전).
- [ ] **exporter mismatch 메시지에 env 원문이 아니라 정규화 값**이 들어간다 — 사용자 입력 " Prod "가 "prod"로 보임.
- [ ] **`ApmExportPlanDto` 필드 추가 위치(`method` 뒤)** — FE 타입은 다음 커밋. 계약 표본 JSON(`ApmContractFixtureTest`)은 내보내기 계획을 안 다뤄 영향 없음.

## 검증 현황

**통과**: `ApmTraceQueryIT` 15 · `ApmTraceAggQueryIT` 27 · `ApmExportIT` 15(실 PG) · `ApmExportPlanTokenTest` 15 · `ApmExportRequestTest` 16 · `ApmExportEnvScopeTest` 3 · `ApmExportServiceTest` 21 · `ApmErrorGroupExporterTest` 4 · `ApmRedSeriesExporterTest` 10 · `ApmEndpointExporterTest` 3 · `ApmReadAccessMvcTest` 8 · `ApmContractFixtureTest` 36 · `ApmDeployment*` 55 — 실패·건너뜀 0.
**못 한 것**: 실제 HTTP(dev BE)로 env 파라미터 왕복, EXPLAIN 실측, 전체 BE 테스트. FE 연동은 다음 작업.

## 검수 결과 1차 (Codex, gpt-5.6-sol high, 2026-10-07 — 전문 `review_apm-query-controls-be-20261007_codex.md`)

판정 **반려** → 🔴1·🟡2 반영, 2차 검수 요청. 🟢 5(select 횟수·groupInScope·series 동작·메시지 env·DTO 위치) + involved+env 의미·오버로드 보존 확인.

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | 🔴 | RED·endpoint export가 `ApmExportTarget.env`(원문)를 다시 정규화해 판정 — `env_norm`과 어긋난 행이면 다른 환경 파일이 "정상 적용"으로 나감 | [x] `ApmExportTarget`에 `envNorm`(= `ApmService.getEnvNorm()`) 추가, `inEnv`는 `envNorm`으로만 비교. 서비스 미선택 RED는 `observedTargets(…, envNorm)`이 **관측 조회 전에** 환경 안 서비스만 넘김. 테스트: `ApmExportEnvScopeTest.judgesByEnvNormNotRawEnv`(원문 prod·정본 staging), `ApmExportIT.envScopeAcrossDatasets`(실 PG·HTTP: 원문 'PROD'·env_norm 'staging' 서비스로 세 데이터셋 판정·응답 env·거절 확인) |
| 2 | 🟡 | 오류·DB 목록이 버킷 전체를 `group by` 한 뒤 바깥 WHERE에서 범위를 걸어 환경 밖 그룹까지 집계 | [x] `ApmServiceRefLookup.bucketScopeSql/scopeParams` — 버킷 서브쿼리 안에 `group_id in (select id from <group> where service_id … / service_id in (env))`를 넣어 집계 전 범위 제한(바깥 조건은 유지). 오류 목록·count·내보내기 스트림, DB 목록 모두. [ ] EXPLAIN 실측은 안 함(dev DB에 환경별 치우친 fixture 없음) — 기존 IT로 동작 동일 확인 |
| 3 | 🟡 | 단일 배포로는 rolling deploy 양방향 토큰 호환 불성립(신노드 v2 발급 → 구노드 거절) | [ ] **반영 불필요(근거)** — 이 제품은 설치형이고 BE는 도커 1벌로 전체 교체 배포([[deploy-server-topology]], `COLLAB.md`·`moveseye-be-spring/CLAUDE.md` "설치형 1벌" 전제, 분산 락 미사용 결정과 같은 전제). 혼합 fleet이 없으므로 2단계 issuer 전환은 비용만 든다. 다중 노드(순위 15 HA)를 도입할 때 issuer 버전 플래그를 같이 넣는다 — 계약서에 배포 전제로 명시 |

반영 검증: `ApmExportIT` 16(+1, 실 PG·MockMvc) · `ApmTraceAggQueryIT` 27 · `ApmExportEnvScopeTest` 4 · `ApmRedSeriesExporterTest` 10 · `ApmEndpointExporterTest` 3 · `ApmErrorGroupExporterTest` 4 · `ApmExportPlanTokenTest` 15 · `ApmExportServiceTest` 21 · `ApmReadAccessMvcTest` 8 통과.

## 검수 결과 2차 (Codex, 2026-10-07 — 전문 `review_apm-query-controls-be-20261007_codex2.md`)

**승인 — 1차 지적 3건 모두 닫힘(🔴0·🟡0·🟢3)**, 남은 결함 없음. 🟡3은 코덱스가 `bitbucket-pipelines.yml`(기존 컨테이너 중지·삭제 뒤 새 컨테이너 1개)로 단일 노드 전체 교체 배포임을 확인해 "반영 불필요"로 닫음 — ⚠️ 다중 replica·blue-green·무중단 롤백을 도입하면 무효, 그때 v2 읽기 호환 릴리스 → v2 발급 2단계 전환.
