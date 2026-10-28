# ZM-152 · ZM-154 v2 · ZM-156 런타임 확인 (로그인 없이 확인 가능한 범위)

- 일시: 2026-10-02 10:16~10:25 (KST) · 수행: functional-qa
- 대상: BE :3000 (Spring, `gradle bootRun`, dev 프로필 → 5433 도커 DB `dmove-postgres-test`), master `3637c77` / FE :5173 (Vite dev)
- 🔴 이번 확인의 제약: **로그인 0회**(admin 로그인 금지·계정 생성 금지 — 계정당 세션 1개라 사용자 브라우저가 끊긴다) · 쓰기 요청 0회(GET만 보냄) · DB는 SELECT만 · BE 재기동·빌드 0회 · 코드 수정 0건
- 기대값 출처: `_workspace/contract_apm-cold-archive.md`(§1·§3·§5·§9·§9.1), `_workspace/contract_zm-152-self-explain-be.md`, `_workspace/contract_apm-data-export.md`(§v2)
- 증거(scratchpad `C:\Users\DMOVE\AppData\Local\Temp\claude\C--solutions\88ace7d2-9c84-493b-a4a4-d5e7dfb6b7a4\scratchpad`): `apidocs_1002.json`(이번에 받은 OpenAPI, 821,879바이트), `be3000.log`, `oa.py`·`oa2.py`·`oa3.py`(OpenAPI 대조 스크립트)

## 요약

| 구분 | 통과 | 결함 | 로그인 필요 — 미실시 |
|---|---|---|---|
| ZM-156 (1~5) | DB 스키마·시드·기본 꺼짐, 기동 로그, EP 14개 등록, 미인증 401, 아카이브 폴더 비어 있음, FE 모듈·로케일 | OpenAPI 문서에서 `JobInfo.lastRun` 모양이 틀림(D1) | 설정→실행→파일→게이트 전 흐름 |
| ZM-152 (6~7) | 새 EP 2개와 새 필드 전부 OpenAPI에 있음, 미인증 401, 보존 일수 정상값 | OpenAPI에서 by-service `rows[]` 모양이 틀림(D1과 같은 원인) | 새 필드의 실제 값 |
| ZM-154 v2 (8~9) | `q`·`method`·`planToken` 파라미터, 계획 DTO 새 필드 4개, 미인증 401 | 응답 헤더 미문서화(D2, 지시대로 기록만) | 계획·다운로드·토큰·필터·보존 헤더·브라우저 |

런타임 동작 결함은 찾지 못했다. 결함 둘은 모두 **OpenAPI 문서 쪽**이다. 실제 응답과 FE 타입에는 영향이 없다(FE 타입은 손으로 작성).

---

## ZM-156 — APM 콜드 아카이브

### 1. DB (`docker exec dmove-postgres-test psql -U postgres -d dmove`, SELECT만)

접속 정보는 `application-dev.yml`(`jdbc:postgresql://localhost:5433/dmove`, 사용자 `postgres`)에서 읽었다. `.env`의 `DB_PORT=5432`는 dev 프로필이 덮어쓴다.

| # | 확인 | 쿼리 요지 | 실제 | 판정 |
|---|---|---|---|---|
| 1-1 | V69 적용 | `flyway_schema_history where version>=66` | `69 · archive ledger apm cold archive · success=t · 2026-10-02 10:15:14` (66·67·68도 t) | 통과 |
| 1-2 | 테이블 3개 | `information_schema.tables` | `archive_file`·`archive_setting`·`apm_archive_hold` 3개 존재 | 통과 |
| 1-3 | 부분 유니크 인덱스 | `pg_indexes` | `uq_archive_file_ok`(status='OK')·`uq_archive_file_running`('RUNNING')·`uq_archive_file_source_expired`·`uq_archive_file_hold_expired`, `uq_apm_archive_hold_open`(`released_at IS NULL`). 보조 인덱스 `idx_archive_file_key`·`idx_archive_file_created` | 통과 |
| 1-4 | 스케줄러 시드 | `scheduler_setting where job_key='apm_archive'` | `enabled=t · daily · 00:50 · options {"logKeep":90,"leadDays":2,"fetchSize":10000,"logSuccess":true,"maxRunMinutes":20}` | 통과(계약 §0의 leadDays 2·maxRunMinutes 20과 일치) |
| 1-5 | 알람 규칙 시드 | `apm_alert_rule where kind='ARCHIVE_HOLD'` | 1행 · `rule_uid 00000000-0000-4000-8000-0000000000a4` · `service_id` NULL(전역) · threshold 1 · window 1 · enabled t | 통과(계약 §5의 `…0a4`) |
| 1-6 | 기본 꺼짐 | `count(*) archive_setting` | 0행 (`archive_file` 0행, `apm_archive_hold` 0행) | 통과 |
| 1-7 | 기존 보존 잡 불변 | `scheduler_setting` 전체 + `updated_at` | 22행. `updated_at`이 오늘인 행은 `apm_archive`(10:15:14, V69 시드) 하나다. `apm_retention`은 `2026-09-01 14:39:29` 그대로이고 options `{"raw1mDays":7,"dropStatDays":30,"rollup1hDays":400,"rollup5mDays":30,"instanceIdleDays":30}`도 그대로다. `report_cleanup`·`event_cleanup`·`cloud_snapshot_cleanup`도 이전 날짜 그대로 | 통과 |

참고(결함 아님): `apm_archive`와 `apm_slo_snapshot`이 같은 00:50에 돈다. 아카이브는 `leadDays 2`로 이틀 이상 지난 날만 다루므로 그날 스냅샷과 겹치지 않는다.

### 2. 기동 로그 (`be3000.log`, 631줄, 10:15:08~)

| # | 확인 | 실제 | 판정 |
|---|---|---|---|
| 2-1 | 기동 완료 | `Successfully applied 1 migration … now at version v69`(10:15:14) → `Started MoveseyeApplication in 34.863 seconds`(10:15:32) | 통과 |
| 2-2 | 아카이브 관련 WARN/ERROR | WARN 3건은 모두 무관하다: Flyway의 PostgreSQL 18.4 버전 권고, `UserDetailsServiceAutoConfiguration`, `user_sync has no enabled setting`(기존). ERROR·Exception 0건 | 통과 |
| 2-3 | 잡 등록 | `Scheduler 'apm_archive' registered (daily 0 50 0 * * *)`, `Scheduler 'apm_retention' registered (daily 0 30 1 * * *)` (전체 등록 21건) | 통과 |
| 2-4 | 보존 정리 게이트 분기 | 기동 후 `apm_retention`이 아직 돌지 않았다(다음 실행 내일 01:30). `scheduler_run_log`에도 `apm_retention`·`apm_archive` 행이 0건이다(이 잡들은 성공 로그를 남기지 않는 설정) | **판정 불가(미실행)**. 꺼짐 상태는 DB(1-6)로만 확인했다 |

### 3. EP 등록 · 미인증 거절

`GET /v3/api-docs`는 인증 없이 200으로 열렸다.

**경로 — 14개 모두 등록(계약 §1과 일치)**

| 묶음 | 경로 · 메서드 | 응답 스키마 |
|---|---|---|
| 공통 9 | `GET /archives`(쿼리 `source·dataset·status·includeDeleted·from·to·page·limit`) | `PaginationResponseDtoArchiveFileDto{items, total}` |
| | `GET /archives/{id}` · `DELETE /archives/{id}`(본문 `Request{reason}`) | `ArchiveFileDto` · `Result` |
| | `GET /archives/{id}/download` | 본문 스키마 없음(파일) |
| | `POST /archives/delete-bulk`(본문 `BulkRequest{ids, reason}`) | `Result{deleted, skipped, fileDeleteFailed, rejected, busy}` |
| | `POST /archives/{id}/verify` | `VerifyResult{ok, expected, actual, fileExists}` |
| | `GET`·`PUT /archives/settings` | `ArchiveSettingsDto` |
| | `POST /archives/path-check` | `PathCheckResult`(11필드, 계약 §2.6과 일치) |
| APM 5 | `GET`·`PUT /archives/sources/apm/settings` | `ApmArchiveSettingsDto` |
| | `GET /archives/sources/apm/status` | `ApmArchiveStatusDto` |
| | `GET /archives/sources/apm/holds` | `List<HoldItem>` |
| | `POST /archives/sources/apm/run` | `Map<String,Object>` |

**DTO 필드 — v1.2(§9.1) 반영 확인**

| 항목 | OpenAPI | 판정 |
|---|---|---|
| `settingsState` | `ApmArchiveSettingsDto`·`ApmArchiveStatusDto` 둘 다 있음 | 통과 |
| `warnings` 객체 | `array<ApmArchiveWarning{code, message, params}>`, `Dataset.warning: ApmArchiveWarning` | 통과 |
| `JobInfo` | `archiveJob`·`retentionJob: JobInfo{jobKey, enabled, scheduleType, atHour, atMinute, nextRunAt:integer, lastRun}` | 통과. 단 `lastRun`의 모양은 **D1** |
| `busy` · `rejected` | 삭제 결과 `Result`에 둘 다 있음 | 통과 |
| `lastHoldReason` | `HoldItem`에 있음 | 통과 |
| `ArchiveFileDto` | 21필드, 계약 §2.1과 일치 | 통과 |

**미인증 호출**(헤더는 `x-visitor-id: qa-runtime-check`만, 쿠키 없음, GET만)

| 요청 | HTTP | Content-Type | Content-Disposition | 본문 |
|---|---|---|---|---|
| `GET /archives`, `?includeDeleted=true`, `/archives/1`, **`/archives/1/download`**, `/archives/settings`, `/archives/sources/apm/settings`·`/status`·`/holds` | **401** | `application/json;charset=UTF-8` | 없음 | `{"status":"error","code":401,"message":"INVALID_TOKEN"}` |

→ 다운로드 EP도 파일 없이 401 JSON으로 거절했다. 판정: 통과. PUT·POST·DELETE는 쓰기 금지 지시에 따라 보내지 않았다.

### 4. 아카이브 폴더

`ARCHIVE_ALLOWED_ROOTS`는 scratchpad의 `archive-root`다(이번 기동 스크립트 `run_be_3000_dev_apm_archive.ps1`에서만 지정). `ls -A` 결과 **0개**로, 10:13 생성 후 그대로다. 판정: 통과.

### 5. FE (:5173)

- ⚠️ FE 작업 트리 HEAD는 `2ed84f7`가 아니라 **`9dfcbe8`**(master)이다. `2ed84f7`(ZM-156 FE)은 조상 커밋이다. 그 뒤 커밋 2개(`05ab624` 병합, `9dfcbe8` 사이드바 개편)는 아카이브 파일을 건드리지 않는다. Vite는 이 트리를 서빙하고 있다.
- `/sign-in` 200.

| 확인 | 결과 | 판정 |
|---|---|---|
| Vite 변환 200 (16개) | `DataArchivePage.tsx`·`ApmArchiveTab`·`ArchiveFilesTab`·`ArchiveSettingsTab`·`ApmArchiveStatusCard`·`ArchiveDeleteModal`·`ArchivePathCheckPanel`·`ArchiveFileDetailDrawer`·`archiveDisplay.ts`·**`ApmArchiveHoldBanner.tsx`(보류 배너)**·**`alert-rules/tabs/ApmAlertRulesTab.tsx`(알람 규칙 탭)**·`archive.api.ts`·`useArchive.ts`·`types/archive.ts`·`constants/archive.ts`·`constants/adminConsole.tsx` — 모두 200, 오버레이 오류 문자열 0 | 통과 |
| 라우트·메뉴 | `routes.tsx:977`의 `DataArchivePage` + `adminOnly`, `adminConsole.tsx:192`의 `key: "data-archive"` | 통과 |
| kr/en 로케일 | 아카이브·보류 배너·알람 탭 소스의 `t("…")` 키 173개와 `data_archive.*`·`apm.alert*`·`setting.scheduler*` 문자열 키 290개를 kr·en에서 찾았다 — **누락 0**. `data_archive` 최상위 키 27개(kr=en). 스케줄러 이름 `scheduler.job.apm_archive` = "APM 콜드 아카이브" / "APM cold archive". 알람 `archive_hold`·`archive_hold_note`도 양쪽에 있음 | 통과 |
| 렌더 | — | **로그인 필요 — 미실시** |

---

## ZM-152 — 화면 자기설명 (09-28 병합분, 첫 런타임)

### 6. OpenAPI

| 항목 | OpenAPI | 판정 |
|---|---|---|
| `GET /apm/settings/retention` | 있음 → `ApmRetentionDto` 24필드. `errorGroupVisibleDays`·`dbQueryVisibleDays` 있음, `resolutions: array<Resolution{step, promotionDays, effectiveDays, instanceAxis, mismatch}>` | 통과 |
| `GET /apm/ingest/drops/by-service` | 있음, 파라미터 `serviceUid` → `ApmServiceDropSummaryDto{source, countingSinceMs, countingSince, overflowCount, services: array<Service>}`. `Service{serviceUid, displayName, total, truncated, rows}` | 통과. 단 `rows[]`의 모양은 **D1** |
| `absentSlots` | `ApmRuntimeSeriesDto`(`/apm/services/{uid}/runtime`) | 통과 |
| `activeRequestsObserved` / `activeRequestsLastSeenMs` | `ApmRedSeriesDto` / `ApmRedSeriesDto`·`ApmServiceDetailDto` | 통과 |
| `oldestAvailableMs` | `ApmTraceListDto`·`ApmScatterDto`·`ApmErrorGroupsDto`·`ApmDbQueryGroupsDto`·`ApmDependenciesDto`·`ApmAggSeriesDto`·`ApmServiceMapDto`. 계약 §4의 EP 9개 응답 스키마와 대조해 모두 일치 | 통과 |
| `requests` · `received` | `ApmServiceRowDto`(서비스 목록)·`ApmServiceDetailDto`·`Totals`(`ApmOverviewDto.totals`) | 통과 |
| `unknownReason` | `ApmSloRowDto`(`GET /apm/slos` 목록, `GET /apm/slos/{sloUid}`의 `row`) | 통과 |
| `metricsAvailable` | `ApmInstanceRowDto`(`/apm/services/{uid}/instances`) | 통과 |

### 7. 미인증 · 보존 일수 로그

| 확인 | 실제 | 판정 |
|---|---|---|
| `GET /apm/settings/retention` 미인증 | 401 JSON `INVALID_TOKEN` | 통과 |
| `GET /apm/ingest/drops/by-service` 미인증 | 401 JSON `INVALID_TOKEN` | 통과 |
| 보존 일수 정규화 WARN | 로그에 없다. DB `apm_retention` options 값이 모두 양수(7·30·400·30·30)라 정규화 조건 자체가 없다 | **정상값** |

참고: 이 WARN은 보존 값을 읽을 때(retention EP 첫 호출 또는 보존 잡 실행) 한 번 찍힌다. 기동 후 둘 다 일어나지 않았으므로, "로그 없음"은 "값이 정상"이라는 DB 근거와 함께 읽어야 한다.

---

## ZM-154 v2 — 내보내기 필터·계획 토큰

### 8. OpenAPI

| 항목 | OpenAPI | 판정 |
|---|---|---|
| `GET /apm/exports/{dataset}/plan` 파라미터 | `dataset, from, to, step, service, q, method, format, gzip, rawText` | 통과(`planToken`이 없는 것은 계약대로 — 다운로드 전용) |
| `GET /apm/exports/{dataset}` 파라미터 | 위 + `planToken` | 통과 |
| 계획 DTO 새 필드 | `ApmExportPlanDto` 끝에 `q:string`·`method:string`·`planToken:string`·`planTokenExpiresAtMs:integer` | 통과 |
| 응답 헤더 문서화 | 두 EP 모두 `responses.200.headers`가 비어 있음 | **미문서화(D2)** |

코드 기준 헤더(`premium/apm/export/ApmExportService.java:68-77`): `X-Apm-Export-Dataset`·`-From`·`-To`·`-Step`·`-Rows`·`-Raw-Text`·`-Schema-Version`·`-Retention-Clipped`·`-Retention-Cutoff`. `:280`에서 `Access-Control-Expose-Headers`를 설정한다. 실제 응답에 실리는지는 로그인이 필요해 확인하지 못했다.

### 9. 미인증

| 요청 | 결과 | 판정 |
|---|---|---|
| `GET /apm/exports/endpoints/plan?from&to&service&q=a&method=GET` | 401 JSON, 파일 헤더 없음 | 통과 |
| `GET /apm/exports/endpoints?…&planToken=v1.x.y` | 401 JSON, `Content-Disposition`·`X-Apm-Export-*` 없음 | 통과 |
| `GET /apm/exports/red-series?from&to` | 401 JSON, 파일 헤더 없음 | 통과 |

---

## 결함 목록

| ID | 심각도 | 내용 | 근거 | 영향 | 넘길 곳 |
|---|---|---|---|---|---|
| D1 | 낮음(문서) | **springdoc 스키마 이름 충돌.** 중첩 record가 단순 이름으로 등록되어, 같은 이름의 다른 클래스가 덮어쓴다. ① `JobInfo.lastRun`이 `LastRun{status, startedAt:**string**, durationMs, message}`(스케줄러 쪽 `LastRun`)으로 문서화됐다. 실제 record는 `LastRun(Long startedAt, long durationMs, String status, String summary, String errorMessage)`(`premium/apm/archive/ApmArchiveStatusDto.java:49`)라, 문서에서 `summary`·`errorMessage`가 빠지고 `startedAt` 타입이 틀렸다. ② `ApmServiceDropSummaryDto.services[].rows`가 트레이스 비교용 `Row{path, name, baselineCount, …}`로 문서화됐다(실제는 `premium/apm/collector/drops/ApmServiceDropSummaryDto.java:38`의 `{reason, metricName, signal, count, lastSeenMs, lastSeenAt}`). ③ `Failure`(아카이브·합성 모니터·Exporter 3곳)·`Row`(12곳)·`Result`·`Request`도 같은 위험이 있다 | `apidocs_1002.json`, `oa2.py` 출력 | 실제 응답과 FE 손작성 타입에는 영향 없음. Swagger를 보고 연동·검증하는 쪽(api-contract-sync, AI 툴 생성)이 틀린 모양을 보게 된다 | be-engineer(후속. 예: `@Schema(name="ApmArchiveLastRun")` 또는 springdoc `use-fqn`) |
| D2 | 낮음(문서) | ZM-154 다운로드의 응답 헤더 9개와 `Access-Control-Expose-Headers`가 OpenAPI에 없다(계약서에만 있음) | §8 | 문서 공백. 동작 영향 없음 | be-engineer(선택) |
| 참고 | — | `contract_apm-cold-archive.md` 머리 상태줄이 아직 "FE(S4) 미착수"다. FE `2ed84f7`이 병합됐으므로 문서가 낡았다 | 계약서 3행 | 없음 | 계약서 관리자 |

---

## 로그인 필요 — 미실시 항목

| 기능 | 항목 | 확인할 것 |
|---|---|---|
| ZM-156 | 공통 설정 조회 | `GET /archives/settings` → `configured:true`, `allowedRoots`=`archive-root`, `basePath:null` |
| ZM-156 | 설정 켜기 | `PUT /archives/settings`(basePath=archive-root 하위) → `PUT /archives/sources/apm/settings {enabled:true}`. 사전조건 4개 각각의 오류 코드(`ARCHIVE_NOT_CONFIGURED`·`ARCHIVE_SETTING_INVALID`·`ARCHIVE_PATH_INVALID`·대상 0개) |
| ZM-156 | 연결 테스트 | `POST /archives/path-check` → `ok`·`writable`·`atomicMove`, 규칙 위반 `[R1]`~`[R6]`, 허용 루트 밖 `[R3]`, `mountedVolume:null`(윈도우) |
| ZM-156 | 지금 실행 | `POST /archives/sources/apm/run` → `{accepted:true}` → `status.archiveJob.lastRun.summary`(`ok=… failed=…`), `JobInfo.nextRunAt`이 epoch ms인지 |
| ZM-156 | 파일 생성 | `archive-root/apm/{dataset}/{yyyy}/{MM}/*.zip`, 압축 해제 후 `sha256sum -c checksums.txt`, `manifest.json`의 `csvFormulaGuard:false` |
| ZM-156 | 원장 | `GET /archives` 행 `OK`·`fileExists:true`·`sha256`, 같은 날 재생성 시 `-r2`와 `SUPERSEDED`, 다운로드(`application/zip`)·`verify` |
| ZM-156 | 게이트 보류 | 켠 상태에서 보존 정리가 보관 안 된 날을 지우지 않고 `holds`와 `ARCHIVE_HOLD` 알람으로 드러내는지, `maxHoldDays` 초과 시 `HOLD_EXPIRED`, 끄면 보류가 닫히는지 |
| ZM-156 | 삭제 사유 필수 | `DELETE`에 사유 없음/256자 → `ARCHIVE_REASON_REQUIRED`, 행이 `DELETED`로 남는지, bulk의 `skipped`·`rejected`·`busy` |
| ZM-156 | RUNNING 잠금 | 실행 중인 행이 `RUNNING`·`fileExists:null`이고 다운로드·삭제·검사가 막히는지, 락 대기·`ARCHIVE_BUSY`(409) |
| ZM-156 | 권한·알람 보호 | 비관리자 → body `code:403 FORBIDDEN`. `ARCHIVE_HOLD` 규칙 삭제·임계 변경·`resync THEIRS` → `APM_ALERT_RULE_PROTECTED` |
| ZM-156 | 화면 렌더 | 관리 콘솔 데이터 아카이브 3탭, 보류 배너, 알람 규칙 탭의 `ARCHIVE_HOLD` 토글 전용 행, kr/en 전환 |
| ZM-152 | 새 필드 실제 값 | retention 응답 값(m1 7·m5 30·h1 400, `mismatch:false`, `configured:true`), `oldestAvailableMs` = now − 일수, `absentSlots`(비-JVM은 `NOT_INGESTIBLE`), `activeRequestsObserved`·`LastSeenMs`, `requests`·`received`, SLO `unknownReason`, `metricsAvailable`, by-service의 `countingSinceMs`가 10:15 기동 시각 근처인지 |
| ZM-154 | 계획 | `plan`의 `q`·`method` 적용값(red-series는 `q:null`), `planToken`(`v1.` 접두)·`planTokenExpiresAtMs`(약 +30분), 필터 안내 문장 |
| ZM-154 | 다운로드·토큰 | 토큰 있는 다운로드가 창·해상도를 고정하는지, 파라미터 하나를 바꾸면 `APM_EXPORT_INVALID`, 변조·만료·513자 거절, `method`를 `endpoints` 밖에 주면 거절, `GET\n` 거절 |
| ZM-154 | 필터 동일성 | 트랜잭션 목록 `total` = 파일 행 수(`q`만, `method`만, 둘 다) |
| ZM-154 | 보존 헤더 | `X-Apm-Export-Retention-Clipped`·`-Cutoff`가 실리는지, `Access-Control-Expose-Headers`에 포함되는지, 결손 시 CSV 끝에 `# NOTE:` 줄이 붙는지 |
| ZM-154 | 브라우저 | 트랜잭션 탭 내보내기 모달이 `q`·`method`·`planToken`을 보내는지, `APM_EXPORT_INVALID`를 받으면 계획을 다시 조회하는지, 저장 후 결손 경고 |

> 위 항목은 검증 전용 계정이 생기거나 사용자가 세션 교체를 허락할 때 한 번에 돌릴 수 있다.

## 재현 명령 (요지)

```bash
# DB (읽기 전용)
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select version,success from flyway_schema_history where version='69'"
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select indexname,indexdef from pg_indexes where tablename in ('archive_file','apm_archive_hold')"
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select job_key,enabled,at_hour,at_minute,options,updated_at from scheduler_setting order by job_key"
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select * from apm_alert_rule where kind='ARCHIVE_HOLD'"
docker exec dmove-postgres-test psql -U postgres -d dmove -c "select count(*) from archive_setting"
# OpenAPI (scratchpad에서)
curl -s -H "x-visitor-id: qa-runtime-check" http://localhost:3000/v3/api-docs -o apidocs_1002.json && python oa.py && python oa2.py && python oa3.py
# 미인증
curl -s -D - -H "x-visitor-id: qa-runtime-check" http://localhost:3000/archives/1/download
# 로그
grep -anE " (WARN|ERROR) |Scheduler 'apm_(archive|retention)' registered" be3000.log
```
