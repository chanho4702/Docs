---
title: APM 콜드 아카이브 — 보존 만료 전 파일 보관과 DROP 게이트 (ZM-156)
doc_type: feature
audience: [개발, QA, 운영, 기획]
status: review
owner: MovesEye 팀
baseline: 2026-10-02
source_of_truth: moveseye-be-spring `archive/**`(공통 기반 — `ArchiveFileController`·`ArchiveFileService`·`ledger/ArchiveLedger`·`ledger/ArchiveStatus`·`ledger/ArchiveDayLock`·`path/ArchivePathPolicy`·`path/ArchiveProperties`·`setting/*`·`write/ArchiveWriter`)·`premium/apm/archive/**`(`ApmArchiveJob`·`ApmArchiveService`·`ApmArchiveSource`·`ApmArchiveController`·`ApmArchiveAdminService`)·`premium/apm/core/batch/archive/**`(`ApmArchiveDropGate`·`ApmArchiveDataset`·`ApmArchiveSettings`·`ApmArchiveHoldStore`·`ApmArchiveHoldProbe`)·`core/batch/partition/ApmPartitionService`·`core/batch/retention/ApmRetentionService`·`ApmRetentionDropGate`·`db/migration/V69__archive_ledger_apm_cold_archive.sql`·`bitbucket-pipelines.yml`·`application.yml` `app.archive.*`, moveseye-docs `operations/설치-배포-가이드.md` §4-4·§5-1·§8·§9, moveseyee_fe `pages/setting/data-archive/**`·`pages/application-monitoring/shared/components/ApmArchiveHoldBanner.tsx`·`services/archive.api.ts`·`types/archive.ts`·`constants/archive.ts`, 계약 `C:/solutions/_workspace/contract_apm-cold-archive.md`(v1 + §9/§9.1), 설계 `C:/solutions/_workspace/designs/devdesign_apm-cold-archive.md`(§10 결정)·`devdesign_data-archiving.md`(공통 기반)
reviewed_at: 2026-10-02
review_cycle: event-driven
deployment_scope: source
be_commit: 3637c77 (master ff, 2026-10-02, 미푸시)
fe_commit: 2ed84f7 (master ff, 2026-10-02, 미푸시)
latest_flyway: V69 (`V69__archive_ledger_apm_cold_archive.sql` — 테이블 3개 + 시드 2행, 기존 테이블 DDL 무변경)
qa_evidence: BE 관련 묶음 592건 실패 0·skip 4(윈도우 심볼릭 링크), IT `ApmColdArchiveIT` 17·`ApmRetentionJobIT` 12·`ApmSchemaIT` 20 통과(실 PG 5433), FE 대상 10스위트 232건 중 229 통과(실패 3 = master 기존 `apmHelpContent`), Codex 검수 BE v1 12건→v5 승인·FE v1 15건→v3 승인. 런타임(BE 기동·브라우저·NFS·리눅스)은 미실시
---

# APM 콜드 아카이브 — 보존 만료 전 파일 보관과 DROP 게이트

> **이 문서로 답할 수 있는 질문** — APM 보존 배치가 지우기 전에 무엇을 어디에 어떤 파일로 남기는가? "보관되지 않은 날은 지우지 않는다"(DROP 게이트)는 정확히 어느 코드 경로에서 어떻게 성립하고, 기능이 꺼진 설치본의 보존 동작은 왜 "한 글자도" 달라지지 않는가? 보류(`HELD`)는 언제 생기고 며칠 뒤 어떻게 끝나며(`HOLD_EXPIRED`), 관리자는 어디서 그것을 보는가(배너·알람 `ARCHIVE_HOLD`)? 원장 상태 7종·실패 사유 6종은 각각 무슨 뜻이고, 파일을 지워도 행이 남는 이유는? 배치 시간 예산(25분/28분/30분/60분)과 PG advisory lock 두 종류는 무엇을 막는가? `ARCHIVE_BUSY`·`ARCHIVE_FILE_REJECTED`·`LOCK_TIMEOUT`·`SETTINGS_INVALID`가 보이면 운영자는 무엇을 확인하는가? 컨테이너 배포에서 왜 볼륨 마운트와 `ARCHIVE_ALLOWED_ROOTS`가 선행 조건인가?

> 한 줄 요약 — **APM 보존 배치(`apm_retention`, 01:30)는 지우기만 하고 어디에도 남기지 않았다. 이 기능은 DROP 직전의 (데이터셋, 날짜) 하나를 ZIP 파일로 떨구고(`apm_archive`, 00:50), 떨구지 못한 날은 지우지 않는다(DROP 게이트).** 뒤의 절반이 존재 이유다 — 앞의 절반만 있으면 실패한 날이 그대로 사라진다. 공통 기반(원장·ZIP 작성기·경로 정책·목록 화면)은 자빅스 아카이빙(I7)과 함께 쓰도록 premium 밖에 두었고, APM은 그 위의 첫 소스다. (Jira **ZM-156**)
>
> 🔴 **배포 상태** — 두 레포 모두 master에 ff 병합됐다(BE `3637c77`·FE `2ed84f7`, 2026-10-02). **2026-10-02 기준 로컬 master에만 있다(미푸시)**. 이 문서의 표에서 `현재`는 **master 소스에 구현됨**을 뜻하며, 어떤 런타임에서도 실측하지 않았다(§9). dev BE(:3000)는 이 코드 이전 상태로 떠 있다(미확인 — 재기동 기록 없음).

이 문서는 내부 독자(개발·QA·운영)를 위한 것이다. 사용자 안내 문구는 FE 로케일 `data_archive.*`(kr/en)와 BE 경고 `message`(한국어 기본 문장, 폴백용)가 정본이다. 설계 결정의 상세 근거는 `_workspace/designs/devdesign_apm-cold-archive.md` §5(게이트)·§10(결정 Q1~Q11)에 있다.

## 1. 사용자 목표와 범위

- 해결하는 문제: `ApmRetentionJob`(매일 01:30, `requiresActiveLicense=false`)은 날짜만 보고 파티션을 `DROP`하거나 행을 `DELETE`한다. 롤업은 되돌릴 수 없는 요약이고 트레이스는 7일 뒤 소멸한다. 지우기 전에 남기는 길이 없었고, 배치끼리 서로를 모르므로 "보관 실패"를 "보존 정리"가 알 방법도 없었다.

  **영영 사라지는 것**(설계 §1.4, 코드 `ApmRetentionService`·`ApmPartitionService` 기준):

  | 잃는 것 | 언제 | 되살릴 수 있나 |
  |---|---|---|
  | 인스턴스별 지표(`apm_metric_1m`) | 7일 | ❌ 5m/1h는 서비스 합산 |
  | 5분 이하 해상도(`apm_metric_5m`) | 30일 | ❌ 롤업은 평균·합·최대·버킷만 남긴 요약 |
  | 모든 지표(`apm_metric_1h`) | 400일 | ❌ |
  | 개별 트레이스·스팬(워터폴·속성·SQL, `apm_span`)·요약(`apm_trace_summary`) | 7일 | ❌ 요약도 7일 |
  | 서비스 간 호출·외부 의존·DB 쿼리 버킷(`*_5m`) | 30일 | ❌ |
  | 오류 그룹 원문·스택 표본 | 마지막 발생 후 90일 | ❌ |
  | SLO 일 스냅샷(`apm_slo_snapshot`) | 400일 | ❌ 5m이 30일이라 재계산 불가 |

  DROP 시점은 `cutoff = LocalDate.now() − retentionDays`(서버 기본 시간대), 파티션 날짜 `D < cutoff`이면 DROP ⇔ `오늘 ≥ D + retentionDays + 1`. 1m의 D일 파티션은 D+8일 01:30에 사라진다.

- 주 사용자: **관리자**(`userRole` `ADMIN` ∪ `SUPER_ADMIN`)만. 아카이브 화면·EP 전부가 관리자 전용이다(§7). 비관리자는 보류 배너도 보지 않는다(요청 자체를 하지 않는다).

- 착수 조건으로 확정한 결정 7개(2026-10-01, 설계 §10 ✅):

  | Q | 결정 | 근거 |
  |---|---|---|
  | Q1 | **A안 — 보관 의무 고객 없음을 전제.** 기본 대상 = `metric1h`·`traceSummary`·`sloSnapshot`, **`metric1m`·`span`은 옵트인** | 현대캐피탈 13건에 APM 보관 요구 0(전부 자빅스 인프라 축). 되돌릴 길(옵트인·`maxHoldDays=0`)이 있어 채택 |
  | Q2 | `maxHoldDays=7` 후 DROP + 원장 `HOLD_EXPIRED` 기록, **보류 첫날부터 배너·알람**(`ARCHIVE_HOLD`), 0 = 무기한 보류 | 조용한 소실 방지 + 디스크 상한 |
  | Q3 | **ZM-156이 첫 소비자로 공통 기반(원장·writer·경로 정책·목록 화면)까지 만든다.** 별도 기반 이슈 없음 | 기반 요구의 대부분이 APM 쪽에서 나옴 |
  | Q4 | (데이터셋, 날짜) 단위 ZIP, DROP 직전 | 하루 1 ZIP은 400일 이중 보관·실패 전파(§10 기각 대안) |
  | Q7 | 허용 루트(`ARCHIVE_ALLOWED_ROOTS`) 강제 | 관리자 화면 하나로 서버 아무 경로에나 쓰게 두지 않는다 |
  | Q8 | 공통 감사 체계를 선행하지 않음 — 1차는 ZM-154처럼 **로그 기반**(`[APM-ARCHIVE]`) | 공통 감사 테이블이 코드에 없다 |
  | Q11 | 자빅스 아카이빙은 **기본 기능**(premium 아님) → 공통 기반은 premium 밖, APM 소스만 `premium/apm` | 의존 방향 premium→공통만(ArchUnit A1) |

- 포함:
  - **공통 기반**(`com.dmove.moveseye.archive`, premium 밖): 원장 `archive_file`·설정 `archive_setting`·`ArchiveLedger`·`ArchiveWriter`(ZIP+manifest+checksums+재읽기 검증+no-replace 게시)·`ArchivePathPolicy`(R0~R6+실검사)·`ArchiveDayLock`·공통 EP 9개(`/archives/*`).
  - **DROP 게이트**: `ApmRetentionDropGate`(retention 패키지의 인터페이스) ← `ApmArchiveDropGate`(구현) · `ApmPartitionService.dropExpired(table, days, PartitionDropGuard)` 오버로드 · 보류 장부 `apm_archive_hold` · 보존 잡 요약 `archiveHeld=N`.
  - **배치·소스**: `apm_archive`(매일 00:50, V69 시드) · 데이터셋 기본 3종(`metric1h`·`traceSummary`·`sloSnapshot`) + 옵트인 2종(`metric1m` CSV·`span` JSONL, 마스킹 기본 켬) · 자기 완결 사전(`dict/services`·`dict/hist_bounds`·`dict/slos`) · 알람 종류 `ARCHIVE_HOLD`(전역 규칙 1건 V69 시드) · APM EP 5개(`/archives/sources/apm/*`).
  - **화면**(FE): 관리 콘솔 › 운영 › **데이터 아카이브**(`/setting/data-archive`, `?tab=files|apm|settings`) — 목록·상세·다운로드·사유 필수 삭제·무결성 검사·경로 설정·연결 테스트 / APM 대상 탭(데이터셋·마스킹·보류 기한·실패 시 동작·백필·상태 카드·보류 목록·지금 실행) / APM 메뉴 전체 상단의 **보류 배너**(`ApmArchiveHoldBanner`) / 스케줄러 카탈로그 `apm_archive` / 알람 규칙 화면의 `ARCHIVE_HOLD`(켜기·끄기만).
  - **인프라**: `bitbucket-pipelines.yml` BE `docker run`에 `-e ARCHIVE_ALLOWED_ROOTS=/data/archive -v /data/moveseye-archive:/data/archive`(+`mkdir -p`), 설치 가이드 §4-4·§5-1·§8(롤백 SQL)·§9(백업 대상).
- 제외:
  - **restore(되살리기)** — 1차 범위 밖(설계 Q5). 대신 되살릴 수 있게 쓴다: `schemaVersion`·원본 컬럼 이름 그대로·사전 동봉·JSONL 원행 1:1·CSV 값 무변형.
  - **RUM 데이터셋**(보존이 하드코딩이라 옵션화 선행)·`metric5m`·`serviceEdge5m`·`dependency5m`·`dbQuery5m`·`messaging5m`·`errorGroup1h`·`jobRun`·`deployment` — `ApmArchiveDataset`에 없어 설정 EP가 모르는 키로 거절하고, 게이트는 그 테이블을 `NOT_TARGET`으로 허용한다(보존 동작 그대로).
  - **공통 감사 테이블**(Q8) — 로그만. **기능 권한**(`DmovePermissions.archive`) — 관리자 판정으로 갈음(§10).
  - **목록의 날짜 단위 페이지**(`groupBy=day`) — 날짜 묶음은 서버 페이지 안에서만 묶여 하루치가 페이지 경계에 걸리면 두 페이지로 나뉜다(계약 FE 요청 #4, 후속).
  - **파일 보관 기간 자동 삭제**(`archive_cleanup`·`RETENTION_EXPIRED`) — `archiveRetentionDays`는 0(무기한) 고정. **수동 재생성 EP**(특정 날 다시 만들기) — "지금 실행"만 있고, 파일을 지우면 다음 회차가 다시 만든다. **S3 등 원격 스토리지 SDK** — 로컬 또는 OS가 마운트한 NFS/SMB 경로만.

## 2. 현재 상태

`부분` — 소스 구현·단위/IT·정적 검수(Codex BE v5·FE v3 승인)는 끝났고 master에 병합됐다. **런타임 실측(S6)은 0건**이다 — BE를 이 코드로 기동한 적이 없고, 브라우저·NFS·컨테이너 볼륨 판정·리눅스 심볼릭 링크 경로·1m 하루 소요·다중 노드 겹침은 모두 미검증이다. 배포 전제(볼륨 마운트 + `ARCHIVE_ALLOWED_ROOTS`)는 파이프라인에 반영됐으나 실서버 적용은 미확인이다.

| 영역 | 상태 | 근거 |
|---|---|---|
| BE 공통 기반(원장·작성기·경로 정책·락·`/archives` EP 9개) | 현재 | `3637c77`, `ArchiveWriterTest`·`ArchivePathPolicyTest`·`ApmColdArchiveIT` |
| BE DROP 게이트 + 꺼진 상태 불변 | 현재 | `ApmRetentionArchiveGateTest.Off` 5건·`ApmPartitionDropGuardTest.allowAllMatchesOriginalBytes`·원본 두 파일 diff 삭제 0줄·`ApmArchiveGateArchTest` 6건 |
| BE `apm_archive` 배치·소스 3종 + 옵트인 2종·마스킹 | 현재 | `ApmArchiveServiceTest`·`ApmArchiveSourceTest`·IT(ZIP·manifest·사전·마스킹 단언) |
| BE Codex 5회 반영(advisory lock·UUID partial·no-replace 게시·fail-closed 설정·보호 규칙·deadline) | 현재 | `reviews/review_zm-156-be-cold-archive.md` v1~v5 |
| FE 데이터 아카이브 화면 3탭·보류 배너·스케줄러/알람 등록 | 현재 | `2ed84f7`, `DataArchivePage.test.tsx`·`dataArchiveDisplay.test.ts` 73건 |
| 배포 파이프라인 볼륨·허용 루트, 설치 가이드 | 현재(소스) | `bitbucket-pipelines.yml` 41~42행, 가이드 §4-4·§5-1·§8·§9 |
| dev DB V69 적용·BE 재기동 | 계획 | 재기동은 사용자 지시 시에만 |
| S6 런타임 실측(게이트 거부→다음 날 DROP, NFS, 볼륨 판정, 크래시 후 `.partial` 청소, 다중 노드) | 계획 | §9 미검증 |
| 1m·스팬 용량·소요 실측(`ARCHIVE_TO_DB_RATIO` 0.1·봉인 처리량 50MB/s 상수 교체) | 계획 | 사용자 지시로 보류 |
| restore·RUM·날짜 단위 페이지·자동 만료 삭제 | 보류 | §10 |

## 3. 데이터 원천과 소유권

| 데이터 | 원천 | 읽기 | 쓰기 | cache/동기화 |
|---|---|---|---|---|
| 원장(파일 하나 또는 "만들지 못한 사실" 하나 = 1행) | `archive_file`(V69) | `ArchiveLedger`(JDBC, 유일 통로 — premium은 리포지토리가 아니라 이 서비스를 부른다, ArchUnit A3) | `ArchiveLedger`만. 삭제해도 행은 남는다(`DELETED` + 누가·언제·왜) | 캐시 없음. `manifest` jsonb 사본은 목록·상세를 파일을 열지 않고 보여 주기 위한 것 |
| 아카이브 설정(소스별 1행: `COMMON`·`APM`) | `archive_setting`(V69, `options` jsonb) | `ArchiveSettingStore` → `ArchiveCommonSettings`(basePath·minFreeSpaceGb·fileSizeLimitMb) / `ApmArchiveSettings.fromStored`(**엄격** — 행이 있으면 틀린 값·모르는 키에 던짐) | 검증 EP(`PUT /archives/settings`·`PUT /archives/sources/apm/settings`)로만. **스케줄러 옵션에 두지 않는다**(스케줄러 저장은 잡별 옵션 무검증·통째 교체라 경로 검증을 우회한다) | 읽기 실패는 던짐(fail-closed) |
| DROP 보류 장부 | `apm_archive_hold`(V69, 열린 행은 `(table_name, period_day)`당 하나) | `ApmArchiveHoldStore.openHold/openHolds/countOpen` | 게이트가 `touch`(사유 `NOT_ARCHIVED`·`LOCK_TIMEOUT`)·`release`(`ARCHIVED`·`HOLD_EXPIRED`·`CONTINUE_POLICY`·`DISABLED`·`NOT_TARGET`), 설정 끄기가 `releaseAll(DISABLED)` | 배너·`ARCHIVE_HOLD` 알람 값(`ApmArchiveHoldProbe` = 열린 보류 건수)의 근거 |
| 배치 튜닝 값 | `scheduler_setting` job_key `apm_archive`(V69 시드, `enabled=TRUE`, daily 00:50, `{"leadDays":2,"maxRunMinutes":20,"fetchSize":10000,"logSuccess":true,"logKeep":90}`) | `ApmArchiveService.run`이 읽을 때 범위로 자른다(`leadDays` 1~min(대상 보존)−1, `maxRunMinutes` 1~25, `fetchSize` 100~100,000) | 설정 › 스케줄러 공용 폼 | 실행 이력 정책 `SchedulerRunLogPolicy`에 `apm_archive`(성공 기록·90건) 등록 |
| 보존 일수 | `scheduler_setting` job_key `apm_retention`의 options(`ApmRetentionDays`) | `ApmArchiveDataset.retentionDays(days)`는 접근자 참조뿐 — **사본 없음**(설계 §5.4) | 없음(읽기 전용, 화면에서도 읽기 전용 표시) | 아카이브가 자기 기본값을 들면 보존을 줄였을 때 DROP이 아카이브보다 먼저 온다 |
| 원본 데이터 | `apm_metric_1h`·`apm_trace_summary`·`apm_metric_1m`·`apm_span`(일 파티션 `<table>_pYYYYMMDD`)·`apm_slo_snapshot`(비파티션, `day` 컬럼) | `ApmArchiveSource.writeInTx` — REPEATABLE READ 읽기 전용 트랜잭션에서 `to_regclass(파티션)` → `count(*)` → `select *`(fetchSize 커서) → 사전. **파티션을 이름으로 직접 읽는다**(부모를 범위로 읽으면 그 사이 DROP된 날이 "0행 OK"가 된다) | 없음 | 열은 `select *` 메타데이터 그대로(후속 컬럼 자동 포함, 예 V47 `exemplar_value`). 정렬 없음 — 행 순서는 의미 없다 |
| 사전 | `apm_service`·`apm_hist_bounds`·`apm_slo` | 그 파일에 나온 id만. 없는 id는 `<deleted:ID>` 행 + manifest `dictionaries.missing` | 없음 | 내보내기 시점 값(서비스 이름이 뒤에 바뀌어도 파일은 당시 이름) |
| 알람 규칙 | `apm_alert_rule`(V69 시드 `rule_uid …0a4`, `kind=ARCHIVE_HOLD`, `service_id NULL`) | 알람 평가 배치(`ApmAlertEvaluationService`, `ApmArchiveHoldProbe` 세터 주입) | 삭제·임계/창 변경·`resync THEIRS`는 `APM_ALERT_RULE_PROTECTED`로 거절, `enabled` 토글만 | 기능이 꺼져 있으면 평가 대상이 없다(Zabbix 아이템 `apm.archive_hold[collector]`이 생기지 않는다) |
| 파일 실물 | `{basePath}/apm/{dataset}/{yyyy}/{MM}/moveseye-apm_{dataset}_{yyyy-MM-dd}.zip`(재생성은 `-r2`·`-r3`…) | 목록 `fileExists`(OK·SUPERSEDED만 실제 확인, 그 밖은 null)·게이트 "실물 존재" 판정·다운로드·검사 — 모두 `ArchivePathPolicy.checkManagedFile` 통과 후 | `ArchiveWriter`(`.partial` → 봉인 → 게시) · 삭제는 커밋 뒤 락 밖 | 화면 밖 삭제는 `fileExists:false` 배지로 드러난다 |
| 감사 이력 | 애플리케이션 로그 `[APM-ARCHIVE]`(소스별 태그 `[{source}-ARCHIVE]`) | — | `ApmArchiveService`·`ApmArchiveDropGate`·`ApmArchiveAdminService`·`ArchiveFileService` | 테이블 없음(Q8) |

### 3.1 V69 — 테이블 3개 + 시드 2행(추가만, 멱등)

| 테이블 | 역할 | 핵심 제약 |
|---|---|---|
| `archive_file` | 원장. `source`(`APM`\|`ZABBIX`)·`dataset`·`period_day`(🔴 **파티션과 같은 시간대의 날짜** — UTC 날짜로 두면 엉뚱한 날을 "보관됨"으로 읽는다)·`period_start/end`·`file_path`·`file_name`·`bytes`·`source_rows`·`sha256`·`manifest`·`status`·`fail_reason`·`fail_detail`·`deleted_at/by`·`delete_reason`·`run_id`·`created_at` | 부분 유니크 4개: `uq_archive_file_ok`(status='OK')·`_running`·`_source_expired`·`_hold_expired` — 같은 (소스, 데이터셋, 날짜)의 **유효본은 하나**, 터미널 상태도 키당 하나(`INSERT … ON CONFLICT … WHERE status='…' DO NOTHING`). `SUPERSEDED`·`FAILED`·`DELETED`는 여러 개 허용 |
| `archive_setting` | 소스별 설정 1행(`source` PK, `options` jsonb) | 검증 EP를 거쳐서만 쓰인다 |
| `apm_archive_hold` | 보존 정리가 "보관 안 됐으니 지우지 않는다"고 판정한 (테이블, 날짜). `first_held_at`이 `maxHoldDays` 기한 계산의 기준, `last_reason`(`NOT_ARCHIVED`\|`LOCK_TIMEOUT`), `released_at`·`release_reason` | `uq_apm_archive_hold_open`(`released_at IS NULL`) — 열린 보류는 (테이블, 날짜)당 하나 |

시드: `scheduler_setting` `apm_archive`(위 표) · `apm_alert_rule` `ARCHIVE_HOLD`(threshold 1·window 1·enabled). 롤백 SQL은 V69 머리 주석과 설치 가이드 §8에 같은 내용(§8).

### 3.2 원장 상태 7종 · 실패 사유 6종(`ArchiveStatus`)

| status | 파일 | 뜻 | 화면 |
|---|---|---|---|
| `RUNNING` | partial | 내보내는 중. `run_id`가 소유권. 겹친 실행은 같은 날을 동시에 만들지 못한다(부분 유니크) | "진행 중"(processing) — 다운로드·삭제·검사 잠금, `fileExists:null` |
| `OK` | 있음 | 유효본 | 다운로드·검사·삭제 가능 |
| `SUPERSEDED` | 있음 | 같은 날 재생성으로 밀려난 옛 파일 — 🔴 덮어쓰지 않는다(기반 D8) | 회색. 삭제 가능 |
| `DELETED` | 없음 | 사람(사유 필수) 또는 보관 기간 만료(`RETENTION_EXPIRED`, 이번 범위 밖)가 지움 — 🔴 행은 남는다(D12) | 회색 "삭제됨" + 삭제자·일시·사유 툴팁. 기본 목록에서 제외(`includeDeleted`) |
| `FAILED` | 없음 | 시도했지만 실패 — `fail_reason` | 빨강 |
| `SOURCE_EXPIRED` | 없음 | 보관하려 했을 때 원본이 이미 없었다(켜기 전에 지워짐 등). 재시도하지 않는다 | 회색 "원본이 이미 사라짐" |
| `HOLD_EXPIRED` | 없음 | 🔴 보관에 실패한 채 보류 기한이 지나 **보관 없이 지워졌다**(Q2). 조용한 소실이 아니라는 기록 | 주황 "보관 없이 삭제됨" |

전이: `RUNNING → OK`(봉인·게시·원장 OK가 날짜 락 안 한 트랜잭션, 기존 OK는 같은 트랜잭션에서 `SUPERSEDED`) / `RUNNING → FAILED(사유)` / `RUNNING → (행 삭제)`(`DEFERRED` — 원장에 남지 않는다) / 크래시 잔여 `RUNNING`(60분 초과) → `FAILED(ABANDONED)` / `OK·SUPERSEDED → DELETED` / `SOURCE_EXPIRED`·`HOLD_EXPIRED`는 각각 게이트·배치가 키당 한 번 직접 삽입.

`fail_reason`: `NO_SPACE`(여유 공간 부족으로 시작하지 않음 — 그 자리에서 회차 중단, 나머지 이월) · `VERIFY_MISMATCH`(🔴 재읽기 검증 행 수·SHA-256 불일치 — 절대 OK로 두지 않는다) · `WRITE_ERROR` · `SOURCE_ERROR` · `ABANDONED` · `DEFERRED`(시간 예산 초과 — 원장 행은 지워지고 요약 `deferred=N`에만 남는다).

### 3.3 ZIP 안

```
moveseye-apm_{dataset}_{yyyy-MM-dd}[-rN].zip
├─ data/{원본 테이블}.csv.gz          (span은 .jsonl.gz, fileSizeLimitMb 초과 시 .partNN로 이어짐)
├─ dict/services.csv.gz · dict/hist_bounds.csv.gz · dict/slos.csv.gz   (그 파일에 나온 id만)
├─ checksums.txt                     (sha256sum 호환 — 압축을 푼 뒤 `sha256sum -c checksums.txt`)
└─ manifest.json
```

manifest(`ApmArchiveSource.manifest`): `schemaVersion:1` · `product` · `generatedAt` · `source{type:"APM", dataset, table, kind(PARTITION|DAY_ROWS), dbSchemaVersion}` · `period{day, from, to, timezone}`(🔴 파티션 날짜의 시간대) · `counts{sourceRows, writtenRows}` · `masked`(span이고 마스킹 켬일 때만 true)·`maskApplicable`(span만 true) · `format{data, timestamps, csvText, csvNull}` · `dictionaries{capturedAt?, files, missing}` · `retention{sourceRetentionDays, scheduledDropDay}` · `gaps:[]` · `signature:null` · 작성기가 채우는 `files[]`(이름·형식·행·바이트·SHA-256)·`fileSha256`·`atomicMove` · **`csvFormulaGuard:false`**. 열은 원본 컬럼 이름 그대로, PG `timestamp`는 UTC ISO-8601로 바꿔 원 컬럼에 싣고 `{컬럼}_epoch_ms`를 옆에 붙인다. CSV는 UTF-8 BOM·CRLF·RFC 4180·NULL은 빈 칸, 🔴 **값을 바꾸지 않는다**(엑셀 수식 주입 방어 `'` 접두 없음 — 복원용 원본. ZM-154 내보내기 CSV는 종전대로 방어 켬). jsonb·배열은 JSON 문자열.

## 4. 사용자 흐름

### 4.1 배치 `apm_archive` — 매일 00:50

```text
0. 스위치·경로 사전검사
   꺼짐(archive_setting(APM).enabled=false) → "skipped: disabled" 정상 종료(아무것도 읽지 않는다)
   켜짐인데 허용 루트 없음 / basePath 없음 / 경로 실검사 실패(쓰기·여유 공간) → 던진다(회차 실패) — 게이트가 DROP을 막는다
1. 크래시 정리 — 60분(STALE_RUN) 넘은 RUNNING 행 → FAILED(ABANDONED) + 그 partial만 삭제, RUNNING 행이 없는 60분 넘은 고아 partial 삭제(abandoned=N)
2. 보존 정책 읽기 — apm_retention options(사본 없음)
3. 대상 날짜 — dropDay(D) = D + 보존 + 1, 오늘 T에 내보낼 날짜 = { D | dropDay(D) − T ≤ leadDays(2) ∧ 원본 있음 ∧ 유효본(+실물) 없음 }, 급한 순(dropDay 오름차순).
   backfill=all이면 보존 기간 안의 닫힌 날짜(오늘−2 이하) 전부. 곧 지워질 창에 원본이 이미 없으면 SOURCE_EXPIRED 1회 기록
4. (데이터셋, 날짜)마다: 원장 RUNNING(run_id=UUID) → REPEATABLE READ 트랜잭션(set local statement_timeout = 남은 예산) → to_regclass → count(*) → select * 스트리밍(1만 행마다 시계 확인) → 마스킹(span) → .partial ZIP
   → 봉인(checksums·manifest·닫기·fsync·재읽기 검증 행 수·SHA-256 — 8MB마다·EOF·반환 직전 기한 확인) → 날짜 락(60초) 안에서 게시(하드 링크 no-replace, 충돌이면 -rN 재예약) + 원장 OK(기존 OK는 SUPERSEDED)
   실패 → partial 삭제(경로 정책 경유) → 원장 FAILED(사유) → 다음 항목 계속 / NO_SPACE → 그 자리에서 멈춤
5. 요약 "ok=N failed=N expired=N deferred=N abandoned=N rows=N bytes=N [stopped=NO_SPACE]" — 실패가 하나라도 있으면 던진다(false-green 금지, 성공 몫은 메시지에)
```

시간 예산(`ApmArchiveService`·`ArchiveWriter.Deadline`, 불변식은 `scheduler/ArchiveLeaseBudgetTest`가 고정): **`maxRunMinutes` ≤ 25(상한) + 봉인 예약 3분(`SEAL_RESERVE_MINUTES`, 파일 크기 × 2 ÷ 50MB/s 비례로 더 요구) ≤ 28분 하드 스톱(`HARD_STOP_MINUTES` — 넘긴 뒤에는 봉인된 파일도 게시하지 않고 버린다) < 30분 스케줄러 리스 TTL(heartbeat 없음 — 넘기면 다중 노드에서 같은 잡이 겹친다) < 60분 크래시 정리(`STALE_RUN` — 살아 있는 실행의 partial을 지우지 않는다)**. 예산을 넘긴 항목은 `DEFERRED`(실패 아님, partial 폐기·RUNNING 행 삭제·다음 회차 이월). 1m 하루치가 예산 안에 영영 안 끝나면 매일 이월 → 보류 → 기한 후 `HOLD_EXPIRED`(§10 열린 항목).

같은 날을 다른 실행이 만드는 중(RUNNING 행 있음)이면 그 날은 건너뛴다(`deferred`에 포함). `leadDays=2`라 1m의 D일은 D+6에 첫 시도, D+7에 재시도, D+8 01:30에 (성공했으면) DROP — 실패해도 DROP 전 재시도 2회가 있다.

### 4.2 보존 정리 `apm_retention` — 매일 01:30, DROP 게이트

보존 서비스(`ApmRetentionService`)의 세 단계(메트릭 파티션·트레이스 파티션·SLO 스냅샷)는 시작 시 `archiveGate.isActive()`를 한 번 묻는다.

- **false(기본)** → **원래 문장 그대로**(`partitionService.dropExpired(List.of(...))` / `delete from apm_slo_snapshot where day < ?`). 게이트의 판정기를 만들지도 부르지도 않는다. 꺼진 상태에서 늘어난 일은 단계당 `archive_setting` SELECT 1회(하루 3회)뿐이다.
- **true** → 테이블마다 `guardFor(table, days)`(설정 손상을 일찍 드러내려 설정을 한 번 읽는다 — 손상이면 그 단계 실패) → `dropExpired(table, days, guard)` 오버로드가 **날짜마다 한 트랜잭션**으로 `guard.mayDrop(day)`를 묻는다. SLO 스냅샷은 날짜 목록을 뽑아 허용된 날짜만 지운다(단계 전체가 한 `@Transactional`).

`ApmArchiveDropGate.TableGuard.mayDrop(day)` — 날짜당 대기 예산 **30초 하나**(`ArchiveDayLock.RETENTION_WAIT`, 설정 락에 쓴 만큼 날짜 락 대기가 준다):

```text
① 설정 락 공유(pg_try_advisory_xact_lock_shared('settings|APM'), 100ms 폴링)
   못 얻음 → 거부(LOCK_TIMEOUT) — 🔴 보류 장부를 쓰지 않는다(이 순간 "끄기+보류 해제" 저장이 배타 락을 쥐고 있을 수 있어 방금 닫힌 보류를 다시 열 수 있다). 사실은 WARN 로그 + 게이트 메모리 lastLockTimeout → 상태 EP 일시 경고 LOCK_TIMEOUT(24시간, 재기동 시 소실)
② 락 안에서 설정을 다시 읽는다 — 꺼짐·대상 아님이면 날짜 락 없이 허용(DISABLED·NOT_TARGET)
③ 날짜 락 배타(pg_try_advisory_xact_lock('APM|dataset|day'), 남은 예산)
   못 얻음 → 거부(LOCK_TIMEOUT) + 보류 장부 touch(사유 LOCK_TIMEOUT) — 켜져 있음을 공유 락 아래 확인했으므로 끄기와 엇갈리지 않는다
④ 락 안에서 열린 보류·원장 OK·파일 실물(checkManagedFile 통과)을 그 자리에서 읽어 판정(단계 시작 시 스냅샷 없음):
   원장 OK ∧ 관리 대상 실물 존재 → 허용(ARCHIVED)
   onFailure=continue → 허용(CONTINUE_POLICY) + WARN 로그
   maxHoldDays>0 ∧ 보류 일수 > maxHoldDays → 원장 HOLD_EXPIRED 삽입(ON CONFLICT DO NOTHING, DROP과 같은 트랜잭션 — 실패하면 던져서 지우지 않는다) + WARN → 허용(HOLD_EXPIRED)
   그 밖 → 거부(HELD) + 보류 장부 touch(NOT_ARCHIVED, held_count++)
⑤ 허용이면 DROP TABLE(또는 SLO DELETE) → guard.dropped(day) → 보류 해제(release_reason = ARCHIVED|HOLD_EXPIRED|CONTINUE_POLICY|NOT_TARGET|DISABLED) → 커밋
```

🔴 **fail-closed** — `isActive()`·`guardFor()`·보류 기록·`HOLD_EXPIRED` 기록·설정 손상(`InvalidSettings`)·DB 오류는 전부 던진다 → 그 보존 단계 실패(지우지 않음). "조회 실패 = 허용"이면 장애 날에 정확히 지켜야 할 데이터가 사라진다. **보류는 실패가 아니다** — 보존 잡은 던지지 않고 요약 끝에 `archiveHeld=N`(0이면 생략 → 꺼진 상태 요약 불변)만 싣는다. 대신 보류 장부가 배너·알람의 근거가 된다.

`maxHoldDays`(기본 7, 0~365): 보류 첫날(`first_held_at`)부터 센다. **0 = 무기한 보류**(보관 의무 설치본) — 대신 1m은 하루 약 9.6GB(R3 추정)씩 DB 디스크가 계속 는다는 것을 화면이 바로 아래 적는다. 기한을 넘기면 다음 정리가 보관 없이 지우고 원장에 `HOLD_EXPIRED`를 남긴다. RUM·메시징 정리는 대상 데이터셋이 아니라 판정 없는 경로 그대로다(의도).

### 4.3 보류가 생기면 — 배너·알람·화면

| 통로 | 조건 | 내용 |
|---|---|---|
| APM 메뉴 상단 배너(`ApmArchiveHoldBanner`, `DashboardLayout contentTop` 슬롯) | 관리자 ∧ APM 라이선스 확정 ∧ `status.holds.count > 0` | "보관하지 못해 정리가 보류된 날이 N건(가장 오래된 보류 D일째) — M일을 넘기면 보관 없이 지워집니다 / 무기한 보류 중이라 DB 디스크가 계속 늘어납니다" + 링크 `/setting/data-archive?tab=apm`. 1분 폴링·포커스 재조회 끔·실패 시 조용히 숨김. 비관리자는 **요청 자체를 하지 않는다**(상태 EP가 관리자 전용이라 body 403이 전역 "권한 없음" 안내로 새는 것을 막는다) |
| APM 알람 `ARCHIVE_HOLD`(전역 규칙 1건, 단위 `count`, 시스템 축 `collector`·라벨 "콜드 아카이브") | 기능 켜짐 ∧ 열린 보류 ≥ 1 | 기존 APM 알람 이벤트 통로(Zabbix 트리거 포함)로 발화, 0이면 해소. 임계·창은 쓰지 않는다(서버 판정) — 알람 규칙 화면은 임계·창 칸에 "서버 판정", 수정 폼은 임계·창·미리보기를 숨기고 `{enabled}`만 전송, 행에 수정·삭제·재동기화 버튼 없음(켜기/끄기 스위치만). `ApmArchiveHoldProbe.active()`는 설정을 못 읽으면 **true**로 본다(값은 empty라 울리지 않음 — "모르면 울릴 준비") |
| 상태 EP `warnings[]` `HOLDS_PENDING` + `holds.items[]` | 같음 | 보류 표: 데이터셋·테이블·날짜·첫/마지막 보류·횟수·일수·`expiresInDays`(null=무기한, 0=다음 정리에서 지워질 수 있다)·보류 사유(`NOT_ARCHIVED`/`LOCK_TIMEOUT`)·마지막 보관 실패 사유/상세/시각 |

보류가 풀리는 길: 다음 `apm_archive` 회차가 성공(다음 정리에서 `ARCHIVED`로 DROP·해제) / 관리자가 기능을 끔(`releaseAll(DISABLED)` — 저장과 같은 트랜잭션, 해제 실패면 저장도 롤백) / `onFailure=continue`로 바꿈 / 기한 초과 `HOLD_EXPIRED`.

### 4.4 관리자 화면 — 관리 콘솔 › 운영 › 데이터 아카이브

진입: 관리 콘솔 정본 `constants/adminConsole.tsx` 운영 그룹 `data-archive`(`adminOnly`), 라우트 `PATH_SETTING.dataArchive`(`/setting/data-archive`, `PageWrapper adminOnly`, FeatureGate 없음 — 공통 EP는 premium 밖). 사이드바·모바일에는 없다(ZM-161 규약). 전역 검색은 정본에서 자동. 도움말 `page_guide.setting_data_archive`(+`_apm`·`_settings`). 활성 탭은 URL `?tab=`(새로고침·공유·뒤로가기, 배너 링크가 곧장 APM 탭).

| 탭 | 흐름 | 잠금·확인 |
|---|---|---|
| ① 아카이브 목록 | 소스·데이터셋·상태·날짜 필터(URL), "삭제된 항목 표시" 토글, `periodDay` 묶음 트리 표(페이지 안에서만 묶임), 행: 받기(blob, 파일명은 목록 `fileName`)·검사·삭제, 선택 다운로드(순차 개별 저장 — 취소·언마운트·계정 전환 시 `AbortController`로 요청 끊고 파일 폐기)·선택 삭제(최대 500), 상세 드로어(원장 행·manifest·사전·같은 날 이력·`csvFormulaGuard: false`와 "복원용 원본" 안내) | `RUNNING`·`DELETED`·`FAILED`… 행은 체크·받기·검사·삭제 잠금(부모 체크가 비활성 자식을 끌어들이지 않는다 + 서버 `skipped` 이중 방어). `fileExists:false`는 "파일 없음" 배지 + 받기 비활성. **삭제 사유 필수**(trim 후 1~255자, 비면 버튼 잠금) + 대상 날짜·개수·총 용량 문장 + "같은 날짜 정리·게시가 끝날 때까지 기다림" 안내. 첫 페이지 `limit=10`(`DmoveTable` 관례, 계약 기본 50은 요청 상한 200으로 자름) |
| ② APM 대상(APM 라이선스일 때만, 읽는 중엔 본문 미마운트) | 데이터셋 체크(기본 3종 먼저, 옵트인 2종에 "옵트인" 태그)·보존 일수 읽기 전용·하루 예상 용량·`oldestAvailableDay`, 마스킹 스위치, `maxHoldDays`(0이면 무기한 경고 문구), 실패 시 동작 라디오, 백필, 기능 스위치, 상태 카드(기능·보류 건수/최고 일수·다음 정리까지(`retentionJob.nextRunAt − now`)·여유 공간·마지막 회차 요약·사용량·최근 실패 10), 보류 표, **지금 실행**(확인 모달 → `POST …/run` 접수 → 10초 폴링 최대 5분) | **위험한 방향만 확인**: 옵트인 체크(용량 모달 — 이 설치본 추정 > 설계 범위 0.35~0.7GB/일(1m) > 미측정(span)), `onFailure→continue`, 마스킹 끄기. 되돌리는 쪽은 묻지 않는다. 켜는 스위치는 허용 루트·basePath·대상이 없으면 잠그고 **이유를 먼저 말한다**(서버 거부 전에). 편집 중 폴링이 설정을 다시 와도 덮지 않는다(`dirtyRef`), 저장 성공 시 서버 정규화 값으로 맞춤. `settingsState:"INVALID"`면 빨간 배너 + 바꾼 것이 없어도 저장 버튼 활성. 꺼진 기능은 "지금 실행" 비활성 |
| ③ 경로·공통 설정 | basePath·minFreeSpaceGb(1~10000)·fileSizeLimitMb(64~4096)·`archiveRetentionDays`(0 고정 표시), **연결 테스트**(`path-check` — 저장 안 함, 실패도 결과) 결과 패널(규칙 번호 i18n 라벨 + 원문, `mountedVolume:false`면 빨간 "재배포 때 파일이 사라짐") | `configured:false`(허용 루트 없음)면 입력 비활성 + "운영자 조치 필요(ARCHIVE_ALLOWED_ROOTS)". 저장 실패(`ARCHIVE_PATH_INVALID`)는 `data`의 `PathCheckResult`를 그대로 보여 준다 |

경고 배너(`warnings[]`)는 서버 `code`+`params`로 i18n 문장을 그리고, 모르는 코드는 `message` 폴백(화면이 선다). 미저장 입력 보호(`useBlocker`)는 없다 — 탭 간 이동은 마운트 유지로 입력이 남고 화면을 떠나면 사라진다.

### 4.5 권한 없음 · 빈 데이터 · 외부 오류

- 비관리자: 전 EP HTTP 200 + body `code:403` + `errorCode:"FORBIDDEN"`("데이터 아카이빙 화면을 볼 권한이 없습니다"). 화면은 라우트 `adminOnly`라 진입 자체가 막히고, 배너는 요청하지 않는다. APM 전용 EP는 라이선스 `Feature.APM`이 없으면 기존 라이선스 계약의 403. 미인증은 실제 HTTP 401.
- 허용 루트 없음(기본 설치본): 공통 설정 `configured:false`, 저장·켜기는 `ARCHIVE_NOT_CONFIGURED`, `path-check`는 `ok:false, error:"[R0] …"`. 보존 동작은 예전과 같다.
- 켠 첫날: 과거 N일은 이미 지워졌으므로 `oldestAvailableDay` 이전은 보관 불가, 곧 지워질 창에 원본이 없는 날은 `SOURCE_EXPIRED` 행으로 목록에 "이미 사라졌다"가 보인다. `backfill=none`(기본)이면 앞으로 지워질 날만 대상.
- 목록 0건: 표가 비고 상태 카드만 선다. `holds.count=0`이면 배너 없음.
- 디스크: 회차 시작 전 `usableBytes ≥ 예상 크기 + minFreeSpaceGb`가 아니면 던진다(`NO_SPACE`) — 게이트가 DROP을 막고 보류가 쌓인다. NFS 끊김·권한 오류는 경로 실검사(`.probe` 쓰기·fsync·재읽기)에서 걸린다.
- 다운로드 본문 전 실패는 HTTP 200 + JSON envelope가 blob 자리로 온다 — FE는 `blob.type`이 `application/json`이면 envelope로 파싱한다(`window.open`·`<a href>` 금지 — `x-visitor-id`를 못 싣는다).

## 5. API 계약

전 EP `@VisitorIdCheck`(헤더 `x-visitor-id` + 인증 쿠키), 관리자 전용(`ArchiveAdminAccess.require`). 응답은 평소 envelope(`{status, code, data}`), 다운로드만 파일 본문. 시각은 **epoch ms(Long)**, 데이터 날짜는 **`yyyy-MM-dd`**(서버 기본 시간대의 하루). 상세 DTO는 계약서와 `types/archive.ts`가 정본이다.

| Method | Path | 요청 | 응답 `data` | 권한 |
|---|---|---|---|---|
| GET | `/archives` | `source`·`dataset`·`status`·`includeDeleted`(기본 false)·`from`/`to`(`yyyy-MM-dd`)·`page`(1부터)·`limit`(기본 50, 최대 200) | `{items: ArchiveFileDto[], total}` — `periodDay` 내림차순, 같은 날은 최신 행 먼저 | 관리자 |
| GET | `/archives/{id}` | — | `ArchiveFileDto` + `manifest` | 관리자 |
| GET | `/archives/{id}/download` | — | ZIP 본문(`application/zip`, `Content-Disposition`, `Content-Length`) / 본문 전 실패는 envelope | 관리자. 락 없음(읽기만) |
| DELETE | `/archives/{id}` | `{reason}`(필수) | `ArchiveDeleteResult{deleted, skipped[], fileDeleteFailed[], rejected[], busy[]}` | 관리자. 날짜 락 60초 대기 |
| POST | `/archives/delete-bulk` | `{ids[1..500], reason}` | 같음 — 단건은 `ARCHIVE_BUSY` 오류, 선택 삭제는 `busy[]` | 관리자 |
| POST | `/archives/{id}/verify` | — | `{ok, expected, actual, fileExists}` — SHA는 락 밖, 락 안에서 상태·경로·크기 CAS | 관리자 |
| GET | `/archives/settings` | — | `ArchiveSettingsDto{configured, allowedRoots[], basePath, minFreeSpaceGb, fileSizeLimitMb, archiveRetentionDays, updatedAt, updatedBy}` | 관리자 |
| PUT | `/archives/settings` | `{basePath(필수), minFreeSpaceGb?, fileSizeLimitMb?}` | 저장 후 DTO. 규칙+실검사 통과해야 저장 | 관리자 |
| POST | `/archives/path-check` | `{basePath}` | `PathCheckResult{ok, path, created, writable, atomicMove, usableBytes, totalBytes, mountedVolume, mountPoint, error, warnings[]}` — 예외 없이 결과로 | 관리자 |
| GET | `/archives/sources/apm/settings` | — | `ApmArchiveSettingsDto{enabled, targets[], maskRawText, onFailure, maxHoldDays, backfill, configured, basePath, apmPath, datasets[], warnings[], settingsState, updatedAt, updatedBy}` | 관리자 + `Feature.APM` |
| PUT | `/archives/sources/apm/settings` | 부분 수정(null=유지) `{enabled?, targets?, maskRawText?, onFailure?, maxHoldDays?(0~365), backfill?}` | 저장 후 DTO(경고 포함) | 같음. 설정 배타 락 60초 |
| GET | `/archives/sources/apm/status` | — | `ApmArchiveStatusDto{enabled, configured, basePath, diskUsableBytes, archiveJob, retentionJob, holds{count, oldestHeldDays, maxHoldDays, items[]}, usage[], recentFailures[≤10], warnings[], settingsState}` | 같음 |
| GET | `/archives/sources/apm/holds` | — | `HoldItem[]`(기능이 꺼져 있어도 장부의 열린 행 그대로) | 같음 |
| POST | `/archives/sources/apm/run` | — | `{accepted:true}` — 접수만(비동기 `runNow`), 결과는 status·목록으로 | 같음 |

### 5.1 특이 계약

- `fileExists`: OK·SUPERSEDED만 실제 확인값(`checkManagedFile` 통과 + 존재), 그 밖은 null. `absolutePath`는 복사 버튼용, `relativePath`(현재 basePath 기준)는 표 표시용.
- `datasets[]`(카탈로그 5종 고정 — 형식은 선택지가 아니다): `key, table, format(csv|jsonl), defaultTarget, optIn, selected, retentionDays(읽기 전용), recentDailyRows(reltuples 평균, 최대 7일)·recentDailyDbBytes·estimatedDailyArchiveBytes(DB 크기 × 0.1 — 실측 아님)·oldestAvailableDay·warning`.
- `archiveJob`·`retentionJob` = **`JobInfo`** `{jobKey, enabled, scheduleType, atHour, atMinute, nextRunAt(epoch ms), lastRun{startedAt(epoch ms), durationMs, status, summary, errorMessage}}` — 설정 › 스케줄러 DTO(현지 시각 + 리터럴 `Z`)를 싣지 않고 변환한 값이라 서버 시간대와 무관하다. 회차 요약 `lastRun.summary` 형식은 §4.1.
- `settingsState`: `OK | INVALID | ABSENT`. `INVALID`면 보존 정리·아카이브가 **멈춰 있다** — 화면은 기본값으로 뜨고 `warnings`에 `SETTINGS_INVALID{key, detail}`, 다시 저장하면 풀린다.
- `warnings[]`·`datasets[].warning` = `{code, message, params}` (문자열 배열 아님 — v1.2에서 바뀜):

  | code | params | 뜻 |
  |---|---|---|
  | `SETTINGS_INVALID` | `key`·`detail` | 🔴 저장 행 손상(모르는 키 포함) — 빨간 배너 + 다시 저장 |
  | `HOLDS_PENDING` | `count`·`oldestHeldDays`·`maxHoldDays`(0=무기한) | 🔴 보류 배너(맨 앞) |
  | `NOT_CONFIGURED` | — | 허용 루트 없음(운영자 조치) |
  | `BASE_PATH_MISSING` | — | 경로 미저장 |
  | `CONTINUE_POLICY` | — | 손실 감수 경고 고정 |
  | `MASK_OFF` | — | 원문 포함 경고 고정 |
  | `OPT_IN_VOLUME` | `dataset`·`estimatedGbPerDay`·`measured`·`designGbPerDayMin/Max`(1m만 0.35/0.7, span은 null) | 옵트인 용량 확인 모달·배너 |
  | `JOB_DISABLED` | `jobKey` | 스케줄러에서 `apm_archive`가 꺼짐 — 보관이 멈추고 보류가 쌓인다 |
  | `LOCK_TIMEOUT` | `lock`(`settings`\|`day`)·`table`·`day`·`at` | 최근 24시간 안에 보존 정리가 락을 30초 안에 못 얻어 그 날 정리를 미뤘다(지우지 않음). 프로세스 메모리라 재기동 시 사라진다 |

- 보류 항목 `lastHoldReason`: `NOT_ARCHIVED`(보관본 없음) | `LOCK_TIMEOUT`(판정 미룸·지우지 않음). `lastFailure*`는 그날 마지막 아카이브 실패(없으면 null = 아직 시도 전).
- 삭제 대상은 `OK`·`SUPERSEDED`뿐. `fileDeleteFailed`는 행은 DELETED가 됐지만 파일을 못 지움(운영자가 직접). `rejected`는 원장 경로가 관리 대상이 아니라 **아무것도 하지 않은** id(원장 불변, 감사 로그). `busy`는 60초 안에 락을 못 얻어 건너뛴 id. APM 유효본을 지우면 그날 원본이 DB에 아직 있을 때 보존 정리가 **다시 보류**한다(게이트가 실물을 본다) — 다음 회차가 새로 만든다.

### 5.2 오류 코드(전부 HTTP 200 + body code)

| body `code` | `errorCode` | 언제 | `data` |
|---|---|---|---|
| 400 | `ARCHIVE_NOT_CONFIGURED` | 허용 루트 미설정 상태에서 경로 저장·기능 켜기 | — |
| 400 | `ARCHIVE_PATH_INVALID` | 경로 규칙 위반(`[R0]`~`[R6]`) 또는 실검사 실패 | `PathCheckResult` |
| 400 | `ARCHIVE_SETTING_INVALID` | 모르는 데이터셋·범위 밖 값·대상 없이 켜기·basePath 미저장·날짜 형식·bulk ids 비었거나 500 초과 | — |
| 400 | `ARCHIVE_REASON_REQUIRED` | 삭제 사유 비었음/255자 초과 | — |
| 404 | `ARCHIVE_NOT_FOUND` | 없는 id | — |
| 404 | `ARCHIVE_FILE_MISSING` | 다운로드·검사 대상 파일 없음(OK가 아닌 행이거나 디스크에 없음) | — |
| 400 | `ARCHIVE_FILE_REJECTED` | 원장 경로가 관리 대상이 아님(허용 루트 밖·심볼릭 링크·이름 규칙 위반) — 다운로드·검사 거절, 원장 불변 | — |
| 409 | `ARCHIVE_BUSY` | 삭제·무결성 검사·APM 설정 저장이 같은 날짜의 보존 DROP·게시(또는 보존 판정 중인 설정)와 겹쳐 **60초 안에 잠금을 못 얻음**, 검사 도중 대상이 바뀜, 설정 저장 중 공통 경로가 계속 바뀌어 3회 재검사에도 못 맞춤 — 🔴 아무것도 바뀌지 않았다(FE는 "다시 시도" 확인 창) | — |
| 400 | `APM_ALERT_RULE_PROTECTED` | `ARCHIVE_HOLD` 규칙 삭제, 임계·창 변경(지금 값과 다를 때), `resync?mode=THEIRS` — `OURS`·`enabled` 토글은 허용. `STUCK_REQUEST`는 대상 아님 | — |
| 403 | `FORBIDDEN` | 관리자 아님 | — |
| 403 | (라이선스) | APM EP인데 `Feature.APM` 없음 | 기존 라이선스 계약 |
| 401 | — | 미인증(실제 HTTP 401) | — |

FE 타임아웃: 다운로드 10분(`ARCHIVE_DOWNLOAD_TIMEOUT_MS`), 삭제(단건·선택)·검사·APM 설정 저장 3분(`ARCHIVE_LOCK_WAIT_TIMEOUT_MS` — 서버 60초 대기와 공통 60초 경계가 겹쳐 `ARCHIVE_BUSY` 대신 클라이언트 timeout이 나지 않게). 그 밖은 공통 1분 그대로.

## 6. 상태·동시성·실패

### 6.1 꺼진 상태 불변 — 증명 방식

- `ApmPartitionService.java`·`ApmRetentionService.java` diff **삭제 0줄**(추가만). 원본 `dropExpired(String,int)`·`dropExpired(List)`는 무수정이고 판정 오버로드는 옆에 복제(루프 15줄 — 공통 루프로 합치면 "바이트 불변"이 리뷰어의 눈에 달린다).
- `ApmRetentionArchiveGateTest.Off` 5건(꺼짐이면 판정 없는 `dropExpired(List)`에 예전과 같은 계획·SLO는 예전 한 문장·판정기 0회·메시징/RUM은 게이트를 묻지도 않음·요약에 `archiveHeld` 없음) · `ApmPartitionDropGuardTest.allowAllMatchesOriginalBytes`(같은 카탈로그에서 원본 경로와 ALLOW_ALL 경로의 **실행 DDL 문자열 목록 동일**) · 기존 `ApmBatchJobTest`(요약 `partitions=3 … hidden=4` 정확 일치)·`ApmRetentionNormalizationTest`·`ApmRetentionPolicyTest`·`ApmRetentionJobIT` 12건 **무수정 통과** · `ApmColdArchiveIT.offStateDropsAsBefore`.
- 우회 금지(`ApmArchiveGateArchTest` 6건): `onlyRetentionServiceDropsPartitions`(호출처 고정) · `dropExpiredCallSitesAreMethodScoped`(무판정 시그니처 = 보존 서비스 4개 단계 메서드 + 파티션 서비스 자신, 판정 오버로드 = `dropGated`만) · `dropTableSqlOnlyInPartitionService`(`DROP TABLE` 문자열은 `ApmPartitionService.java`에만 — 소스 검사) · `commonArchiveDoesNotDependOnPremium` · `retentionDoesNotDependOnArchive` · `coreDoesNotDependOnArchiveMenu`. `ApmRetentionArchiveGateTest#everyPartitionDatasetIsGated`가 데이터셋 표의 모든 파티션 데이터셋이 보존 경로에 있는지 전수로 본다(새 데이터셋을 더하면 자동 검사). 리플렉션·다른 이름의 DROP까지는 못 막는다(Codex 검수 질문 1 — 수용).
- 켜기 직전에 시작된 무판정 DROP과의 경합은 "켜기 1초 전과 같다"로 보고 둔다(단계 시작 시 `isActive()` 한 번).

### 6.2 fail-closed 목록 — 전부 "지우지 않음"

| 상황 | 동작 |
|---|---|
| APM 설정 행 손상(`enabled`가 Boolean 아님·`targets`가 목록 아님·모르는 대상·켜졌는데 대상 비음·`maxHoldDays` 0~365 정수 아님·`onFailure`/`backfill`/`maskRawText` 값 틀림·**모르는 키**(`maxHoldDay:0` 오타 등)) | `InvalidSettings` → 게이트 `isActive/guardFor`·배치가 던짐 → 보존 단계 실패·아카이브 중단. 행이 **없을 때만** 기본(꺼짐). 화면은 기본값 + `SETTINGS_INVALID`로 다시 저장 유도 |
| 설정 읽기 DB 오류·원장 조회 오류·보류 기록 실패·`HOLD_EXPIRED` 기록 실패 | 던짐 → 그 단계 실패. SLO 경로는 같은 트랜잭션이라 통째로 롤백 |
| 설정 공유 락 30초 초과 | 거부(`LOCK_TIMEOUT`), 보류 장부 미기록, 일시 경고 |
| 날짜 락 30초(남은 예산) 초과 | 거부(`LOCK_TIMEOUT`) + 보류 장부(사유 `LOCK_TIMEOUT`) |
| 게시 날짜 락 60초 초과 | 봉인본 폐기 후 이월(`DEFERRED`) |
| 원장 기록 실패(게시 뒤) | 방금 만든 파일을 지운다(`deleteManagedFile`) |
| 검증 불일치(행 수·SHA) | partial 삭제 + `FAILED(VERIFY_MISMATCH)` — 절대 OK로 두지 않는다 |
| 알람 probe가 설정을 못 읽음 | `active()=true`(값은 empty — 울리지 않음). 게이트와 비대칭이지만 알람 쪽은 "모르면 울릴 준비"가 안전 |

### 6.3 PG advisory lock 2종(`ArchiveDayLock`)

- **왜 PG**: 설치형 1벌 배포 결정으로 Redis 분산 락은 쓰지 않고, 원장·파티션이 같은 PostgreSQL에 있다. 트랜잭션 락(`pg_try_advisory_xact_lock(hashtext('moveseye-archive'), hashtext(key))`)은 커밋·롤백·연결 끊김에 자동으로 풀린다. 🔴 진행 중 트랜잭션이 없으면 던진다(auto-commit이면 즉시 풀려 아무것도 막지 못한다). 키 해시 충돌은 직렬화가 늘 뿐 정확성 문제 없음.
- **설정 락** `settings|APM`: 보존 날짜 트랜잭션은 **공유**로 잡고 그 안에서 설정을 다시 읽는다. 설정 저장(켜기·끄기·정책 변경 + 보류 해제)은 **배타**. → "낡은 정책으로 DROP"과 "해제한 보류를 다시 엶"이 생기지 않는다. SLO 경로는 단계 트랜잭션 끝까지 공유 락을 쥔다 — 그 동안 APM 설정 저장은 최대 60초 기다린 뒤 `ARCHIVE_BUSY`.
- **날짜 락** `APM|{dataset}|{day}`(배타): 게이트 판정~DROP 커밋 · 관리자 삭제의 원장 전이(파일 삭제는 커밋 뒤 락 밖) · 무결성 검사의 CAS(SHA는 락 밖) · 게시+원장 OK. 다운로드는 읽기만이라 락 없음(삭제가 락을 잡으므로 지워진 파일은 `MISSING`).
- **순서는 언제나 설정 락 → 날짜 락**(역순으로 잡는 곳이 없어 교착 없음). **대기는 유한**: `pg_try_advisory_xact_lock` 100ms 폴링 + 한도(보존 30초 `RETENTION_WAIT`, 관리자·게시 60초 `ADMIN_WAIT`). `SET lock_timeout` 대신 try-lock을 쓴 이유: 시간 초과가 트랜잭션을 깨지 않아 같은 트랜잭션에서 보류를 기록할 수 있다. 대기 중 커넥션 하나를 쥔다 — 날짜가 많고 모두 막히면 단계가 길어진다(그래도 지우지 않는 쪽).
- 판정 DROP이 트랜잭션 안의 DDL이 됐다 — 부모 테이블 ACCESS EXCLUSIVE가 그 날짜 트랜잭션 커밋까지(DROP 직후 커밋이라 짧다). 아카이브 소스는 파티션을 이름으로 읽어 ACCESS SHARE를 걸므로 보존 DROP이 그 트랜잭션 끝까지 기다린다는 가정(미실측).
- APM 설정 저장 순서(M1·P4): 경로 실검사(파일 I/O)는 **트랜잭션·락 밖**에서 먼저 → 트랜잭션 시작 → 설정 배타 락 → 현재 설정 재조회 → 요청 병합·검증 → 실검사 입력(`basePath`·`minFreeSpaceGb`)이 지금 공통 설정과 같은지 대조(다르면 락을 놓고 재검사, 최대 3회 초과 시 `ARCHIVE_BUSY`) → 저장 → 끄기면 보류 전부 해제 → 커밋. 동시 부분 수정이 서로를 덮지 않는다(IT `concurrentPartialUpdatesBothSurvive`, latch로 결정적).

### 6.4 쓰기 원자성 — UUID `.partial`·`CREATE_NEW`·하드 링크 no-replace

- partial 이름 `{파일명}.{runId}.partial`(runId=UUID), `CREATE_NEW`+`NOFOLLOW_LINKS` — 같은 이름이 있으면 실패하고, 🔴 **열 때 남의 partial을 지우지 않는다**(겹친 실행이 서로 파일을 지우는 사고 방지). 원장 `RUNNING` 행(`run_id`)이 소유권. 청소는 ① 60분 넘은 RUNNING → `FAILED(ABANDONED)` + 그 partial만 ② RUNNING 행이 없는 실행의 60분 넘은 partial만 — 둘 다 `deletePartialSafely(path, runId)`(이름 정규식·이름 속 runId = 원장 runId·링크 아님·부모 실경로 = 부모 경로·허용 루트 안) 통과 후.
- 봉인: checksums.txt·manifest.json 쓰고 닫기 → fsync → ZIP을 **다시 열어** 항목별 SHA-256·레코드 수 재계수(CSV는 따옴표 안 개행을 레코드 경계로 세지 않는 카운터) → ZIP SHA-256. 시작 전 남은 시간 < `max(3분, 크기×2÷50MB/s)`면 봉인하지 않고 `DEFERRED`. ZIP 닫기·fsync는 끊을 수 없어 시작 전 여유로만 덮는다.
- 게시: 하드 링크 `createLink(target, partial)` — 대상이 있으면 원자적으로 실패(`TAKEN`) → `-rN` 재예약 재시도. 하드 링크 미지원 FS면 존재 확인 후 `ATOMIC_MOVE`(리눅스 rename은 덮으므로 **호출자의 날짜 락**에 기댄다), 그것도 미지원이면 `REPLACE_EXISTING` 없는 이동 + 이동 후 SHA 재대조(`atomicMove:false`). 게시 직전 디렉터리 실경로를 연 시점 값과 재대조(다르면 게시 안 함). 파생 디렉터리는 세그먼트마다 링크·비디렉터리 거절 후 `createDirectory`(`SecureDirectoryStream`은 윈도우 미지원이라 미사용).
- 하드 스톱(28분)을 넘긴 뒤에는 봉인된 파일도 버린다 — 리스가 만료된 뒤 남의 실행과 겹치는 게시 금지.
- 두 회차가 겹치면(리스 만료 등) 부분 유니크가 OK 두 개를 막고, 두 번째 회차는 `recordOk`에서 첫 OK를 SUPERSEDED로 내린다 — 파일 둘이 남는 것은 의도(덮어쓰기 금지).

### 6.5 멱등성·재시도

| 상황 | 동작 | 원장 |
|---|---|---|
| 이미 OK + 실물 있음 | 건너뜀 | — |
| OK인데 실물 없음(화면 밖 삭제) | 다시 만들어 SUPERSEDED로 교체(WARN) | 새 OK + 옛 SUPERSEDED |
| 이전 FAILED | 다음 회차 재시도(`leadDays` 창 안에서 매일) | 새 행(FAILED 이력 보존) |
| 파티션 없음 | 재시도 안 함 | `SOURCE_EXPIRED` 1회(ON CONFLICT) |
| `HOLD_EXPIRED` DROP 재시도 | 중복 없음 | 키당 1행(ON CONFLICT), DROP과 같은 트랜잭션 |
| 수동 "지금 실행" | 같은 계획으로 한 번 더 — 새 파일 + 기존 OK→SUPERSEDED 같은 트랜잭션 | 부분 유니크가 OK 2개를 막는다 |
| 끄기(`true→false`) | 열린 보류 전부 `DISABLED`로 해제(같은 트랜잭션, 실패 시 저장 롤백) | — |
| 유효본 삭제 후 원본이 아직 DB에 있음 | 다음 정리가 재보류 → 다음 회차가 새로 만든다 | — |

retry/timeout: BE 자동 재시도 없음(회차 단위). FE `ARCHIVE_BUSY`는 사용자가 "다시 시도"를 누른다. `apm_slo_snapshot` 배치도 00:50이지만 리스가 job_key 단위라 독립으로 돈다. `apm_archive`와 `apm_retention`이 겹쳐도 안전 — 아카이브가 D일을 쓰는 중이면 원장에 OK가 없어 게이트가 보류, 손해는 하루 지연뿐.

## 7. 권한과 보안

- 기능 permission: **관리자 판정**(`ArchiveAdminAccess.require` = `AdminAccessChecker.isAdmin`, `userRole` ∈ `ADMIN` ∪ `SUPER_ADMIN` — JWT roleid가 아니다). 기반 설계의 `DmovePermissions.archive` 기능 권한은 역할 편집·FE 게이팅까지 번져 1차 제외. APM `apm.edit`로 위임하지 않는 이유 — 경로 설정은 **서버 디스크에 쓰는 권한**이고 다운로드는 **감사 데이터 반출**이다. 공통 EP는 라이선스 무관(만든 파일을 받고 정리하는 길은 막지 않는다), APM EP만 `@RequiresFeature(APM)`(ArchUnit A2). 배치 `ApmArchiveJob.requiresActiveLicense()=false` — true면 만료 중 아카이브가 멈춰 보류가 쌓이고 기한 뒤 소실되거나 디스크가 찬다(롤업 A5와 같은 구조).
- 데이터 범위: 설치본 전체의 APM 데이터(서비스 단위 가시성 필터 없음 — APM 화면과 같다).
- 경로 안전(`ArchivePathPolicy`): **R0** 허용 루트 설정됨 · **R1** 절대 경로 · **R2** `..` 세그먼트 금지(원문 기준) + `normalize()` 결과 = 원문 · **R3** 허용 루트 아래 · **R4** `toRealPath()`(심볼릭 링크 해석, 없는 경로는 가장 가까운 기존 조상) 결과도 루트 아래 · **R5** 제어 문자·NUL·큰따옴표·`${`·512자 초과·앞뒤 공백·윈도우 예약 이름(`CON` 등)·`:` 오용 금지 · **R6** 로그 디렉터리(`LOG_PATH`, 기본 `./logs`)와 겹치지 않음. 실검사: 생성(부모 필요)·`.probe-<uuid>` 쓰기+fsync+재읽기+삭제(`Files.isWritable`만으로는 NFS·ACL에서 거짓 양성)·`ATOMIC_MOVE` 시험·`FileStore` 여유 공간·`/proc/self/mountinfo` 기반 볼륨 판정(컨테이너 안에서 루트 overlay만 담으면 `mountedVolume:false`, 컨테이너 밖·윈도우는 null). 실검사 뒤 `toRealPath`로 다시 루트 안인지 재검증. TOCTOU(검사 후 링크 교체)는 배치가 매 회차 `check()`를 다시 돌고 게시 직전 실경로를 재대조하지만 그 사이 창은 남는다.
- 원장 `file_path`를 믿지 않는다: 다운로드·검사·삭제·게이트 실물 판정 전부 `checkManagedFile`(절대·정규화 · 이름 `^moveseye-[a-z0-9]+_[A-Za-z0-9]+_\d{4}-\d{2}-\d{2}(-r\d+)?\.zip$` · 파일 자신이 링크 아님 · NOFOLLOW 일반 파일 · 실경로 = 절대 경로(부모 체인에 링크 없음) · 실경로 ⊂ 현재 허용 루트). 위반이면 `ARCHIVE_FILE_REJECTED` / 삭제 `rejected[]`, 원장 불변 + `action=…-rejected` 감사 로그.
- 마스킹(`maskRawText` 기본 true, span만 적용): `attrs`·`events`·`links`의 **문자열 값만** — `db.query.text`·`db.statement`는 SQL 마스킹, `exception.stacktrace`는 프레임 줄 보존, 그 밖은 SQL로 보일 때만(`ApmSqlPolicy.MASKED` — 적재·조회와 같은 함수). OTel `{key, value}` 쌍 모양도 키를 따라간다. 깨진 JSON은 통째로 휴리스틱 마스킹. 공통 작성기는 마스킹을 모른다(APM 소스가 가린 뒤 넘긴다 — ArchUnit A1). manifest `masked`·`maskApplicable`로 파일만 보고 원문 포함 여부를 안다. 한계: 스팬 `name`(예 `SELECT users`)은 마스킹하지 않는다, 키에 값이 실린 계측은 막지 못한다. 끄려면 확인 모달 + WARN 로그 + 경고 배너 고정(`keep_raw_sql`과 같은 태도). 파일은 DB보다 통제가 약하다(복사·반출이 흔적 없이 된다).
- 감사 로그(Q8, 테이블 없음): `[APM-ARCHIVE] action=write|write-failed|hold|hold-expired|continue-policy|settings|disable|download|delete|download-rejected|verify-rejected|delete-rejected …`. 공통 파일 EP 태그는 소스별 `[{source}-ARCHIVE]`(`[ZABBIX-ARCHIVE]`가 다음 소비자). 삭제·끄기·원문 반출·손실 감수·스위치 변경은 **WARN**, 다운로드·보통 저장은 INFO. 사용자 입력(사유·사용자명·파일명·데이터셋)은 `common/util/LogSafe.of`로 이스케이프(ZM-154 `ApmExportService.logSafe`를 승격 — CR·LF·TAB → `\r\n\t`, 그 밖의 제어·Cf·U+2028/2029 → `\uXXXX`) — 개행이 든 값이 위조 로그 행을 만들지 못하게.
- secret/개인정보: 파라미터에 비밀값 없음. 허용 루트는 설치 시 환경변수(화면에서 못 고친다). 파일에 원문 SQL·예외 메시지가 들어갈 수 있는 것은 `span` + `maskRawText=false`일 때뿐이며 그 사실이 manifest와 WARN에 남는다. 사전의 서비스 이름·env는 화면과 같은 값.

## 8. 운영

- 설정·환경변수

  | 키 | 어디 | 기본 | 뜻 |
  |---|---|---|---|
  | `app.archive.allowed-roots` (`ARCHIVE_ALLOWED_ROOTS`, 쉼표 구분) | `application.yml`·설치 가이드 §4-4 | 비어 있음 | 🔴 **비면 기능 자체가 켜지지 않는다**(Q7). 화면은 그 아래 경로만 고를 수 있다. 컨테이너는 **마운트 지점과 같은 값**으로 짝지어 넣는다 |
  | `archive_setting(COMMON)` `basePath`·`minFreeSpaceGb`(1~10000, 기본 10)·`fileSizeLimitMb`(64~4096, 기본 1024)·`archiveRetentionDays`(0 고정) | 화면 ③ 탭 / `PUT /archives/settings` | 없음·10·1024·0 | 실검사 통과해야 저장. APM 파일은 `{basePath}/apm/…` |
  | `archive_setting(APM)` `enabled`·`targets`·`maskRawText`·`onFailure`·`maxHoldDays`·`backfill` | 화면 ② 탭 / `PUT /archives/sources/apm/settings` | false·[metric1h, traceSummary, sloSnapshot]·true·skipDrop·7·none | 🔴 `enabled`가 유일한 기능 스위치. 허용 키 6개 밖의 키가 행에 있으면 손상 |
  | `scheduler_setting` `apm_archive` `enabled`·주기·`options.leadDays`·`maxRunMinutes`·`fetchSize`·`logSuccess`·`logKeep` | 설정 › 스케줄러 | TRUE·daily 00:50·2·20·10000·true·90 | 튜닝 값만. 읽을 때 범위로 자른다(1~min(보존)−1 / 1~25 / 100~100,000). ⚠️ 기능을 켠 채 스케줄러에서 끄면 보관이 멈추고 보류가 쌓인다(`JOB_DISABLED` 경고) |
  | 보존 일수(`apm_retention` options) | 설정 › 스케줄러 | V38 시드 | 아카이브는 읽기만. 줄이면 아카이브보다 DROP이 먼저 와 보류가 쌓인다(게이트가 막는다) |

- 컨테이너 볼륨(🔴 코드가 막을 수 없는 운영 요건): `bitbucket-pipelines.yml` BE 실행이 `mkdir -p /data/moveseye-archive` + `docker run … -e ARCHIVE_ALLOWED_ROOTS=/data/archive -v /data/moveseye-archive:/data/archive …`로 바뀌었다. 마운트 없이 켜면 컨테이너 재생성(=매 배포) 때 파일이 전부 사라진다(AI 산출물 유실 2026-08-31과 같은 사고). 유일한 안전망은 `path-check`의 `mountedVolume:false` 빨간 경고(휴리스틱 — 미실측). NAS·NFS는 호스트 OS에서 마운트한 경로를 같은 방식으로 볼륨으로 넘긴다. `.env.example`은 Spring 레포에 없어 설치 가이드 표가 정본이고, 운영 서버 `/home/.env`에는 넣을 필요가 없다(파이프라인이 `-e`로 고정). 아카이브 디렉터리는 백업 대상(§9 — 보존 기간 지난 데이터의 유일한 사본, `archive_file`이 목록).
- metric/log: 메트릭 없음. 로그 `[APM-ARCHIVE]`(§7)·보존 잡 요약 `archiveHeld=N`·회차 요약(`scheduler_run_log`, 성공 90건 보관). 알람 `ARCHIVE_HOLD`.
- 장애 증상과 복구

  | 증상 | 원인 | 조치 |
  |---|---|---|
  | APM 화면 상단 보류 배너 / `ARCHIVE_HOLD` 알람 | `apm_archive`가 그 날을 만들지 못했다(실패·이월·스케줄러 꺼짐) 또는 유효본을 지웠다 | 보류 표의 `lastFailureReason`·`recentFailures`·회차 요약 확인. `NO_SPACE` → 디스크 확보 또는 `minFreeSpaceGb` 조정 / 경로 실검사 실패 → 마운트·권한(`path-check`) / `DEFERRED` 누적 → `maxRunMinutes`(≤25)·대상 축소 / `JOB_DISABLED` → 스케줄러에서 켜기. 급하면 "지금 실행". `maxHoldDays` 안에 못 풀면 보관 없이 지워진다(`HOLD_EXPIRED` 행이 남는다) |
  | 상태 경고 `LOCK_TIMEOUT` | 보존 정리가 30초 안에 설정/날짜 락을 못 얻음(긴 관리자 작업·게시·멈춘 NFS) | 지우지 않았다 — 다음 정리에서 다시 본다. 반복되면 그 시각에 겹치는 작업(검사·삭제·"지금 실행")을 피한다. 경고는 재기동 시 사라진다 |
  | `ARCHIVE_BUSY`(409) | 같은 날짜의 DROP·게시·설정 판정과 겹쳐 60초 안에 잠금 실패, 검사 중 대상 변경, 저장 중 공통 경로 변경 3회 | 아무것도 바뀌지 않았다 — 잠시 뒤 다시 시도. 01:30 직후·00:50 직후를 피한다 |
  | `SETTINGS_INVALID` 빨간 배너 / 보존 정리 단계 실패 로그 | `archive_setting(APM)` 행 손상(DB 직접 수정·오타 키) | 🔴 보존 정리·아카이브가 멈춰 있다(지우지 않는 쪽). 화면 ② 탭에서 **다시 저장**(바꾼 것이 없어도 저장 버튼이 열린다) |
  | `ARCHIVE_FILE_REJECTED` / 삭제 결과 `rejected` | 원장 경로가 허용 루트 밖·링크·이름 규칙 위반(허용 루트 변경·수동 이동) | 원장은 그대로다. 허용 루트·basePath를 원래대로 되돌리거나 파일을 제자리로. 그 날의 게이트도 "실물 없음"으로 보류한다 |
  | `fileExists:false` 배지 | 화면 밖에서 파일 삭제·이동 | 원본이 DB에 있으면 다음 회차가 다시 만든다(SUPERSEDED 교체). 없으면 영구 소실 — 원장 행이 그 사실을 남긴다 |
  | `path-check` `mountedVolume:false` | 컨테이너 안 overlay 루트 | 🔴 재배포 때 사라진다 — 볼륨 마운트 후 `ARCHIVE_ALLOWED_ROOTS`를 마운트 지점으로 |
  | `atomicMove:false` 경고 | 일부 NFS | 동작은 비교체 이동 + 해시 재대조로 강등. 결함 아님 |
  | 디스크(DB) 증가 | `maxHoldDays=0` 무기한 보류가 쌓임 | 아카이브 경로 복구가 먼저. 1m은 하루 약 9.6GB(R3 추정) |
  | 회차 `failed>0`·`stopped=NO_SPACE` | 여유 공간 부족 | 디스크 확보. 실패 항목은 다음 회차가 재시도 |
  | 크래시 후 `.partial` 잔존 | 실행 중 재기동 | 다음 회차가 60분 넘은 것만 청소(`abandoned=N`). 수동 삭제 금지(살아 있는 실행일 수 있다) |

- migration/rollback: V69는 추가만(기존 테이블 DDL 무변경, 시드 2행). 공유 dev DB(5433)는 BE 재기동 때 Flyway가 적용한다(재기동은 사용자 지시 시에만). 되돌릴 때는 **시드부터 지우고 테이블을 역순으로** — V69 머리 주석과 설치 가이드 §8의 같은 SQL(`scheduler_run_log`·`scheduler_lease`·`scheduler_setting`의 `apm_archive` → `apm_alert_rule` `rule_uid …0a4` → `uq_apm_archive_hold_open`·`apm_archive_hold` → `archive_setting` → 인덱스 6개·`archive_file` → `flyway_schema_history` version 69). 🔴 원장이 사라지므로 `archive_file`을 먼저 백업하고 디스크의 ZIP은 지우지 않는다(감사 자료). 아카이브를 켠 적이 있으면 알람 화면에서 `ARCHIVE_HOLD` 규칙을 먼저 삭제해 Zabbix 아이템·트리거를 정리하는 편이 깔끔하다(단, 코드가 V69 상태면 삭제가 `APM_ALERT_RULE_PROTECTED`로 거절된다 — 코드를 되돌린 뒤 지우거나 SQL로). 코드만 롤백하면 FE는 EP 404로 화면이 비지만 다른 화면은 영향 없다(미확인).
- 성능 가정(전부 **미실측**): 1m 하루 ≈ 1,404만 행 × 686B ≈ 9.6GB(DB, R3 실측 규모 기준 추정) → 압축 후 0.35~0.7GB/일 추정, `metric1h` 7.8만 행 ≈ 3MB/일 → 연 1GB, `span` 미측정. 화면 추정 `estimatedDailyArchiveBytes = DB 크기 × 0.1`(`ARCHIVE_TO_DB_RATIO`), 봉인 처리량 50MB/s — S6에서 교체할 상수. 1m 하루치가 25분 예산 안에 끝나는지 모른다. 꺼진 상태 추가 비용은 보존 단계당 SELECT 1회.

## 9. 검증 근거

| 종류 | 증거 | 결과 |
|---|---|---|
| 단위·아키텍처(BE) | `ApmRetentionArchiveGateTest`(꺼짐 5·켜짐 6) · `ApmPartitionDropGuardTest` 3 · `ApmArchiveDropGateTest`(판정 표 전 행·fail-closed·설정 해석·락·예산) · `ApmArchiveGateArchTest` 6 · `ArchiveWriterTest` · `ArchivePathPolicyTest` · `ApmArchiveServiceTest` · `ApmArchiveSourceTest` · `ApmArchiveAdminServiceTest` · `ApmAlertKindArchiveHoldTest` 2 · `ApmAlertServiceTest` 45(보호 규칙 4) · `scheduler/ArchiveLeaseBudgetTest`(25+3 ≤ 28 < 30 < 60) · `CsvFormulaGuardOptionTest` | 관련 묶음 **592건 실패 0·skip 4**(윈도우에서 심볼릭 링크 생성 불가 — R4 경로·R7 파일 링크·R8 세그먼트·N4 부모 링크, `assumeTrue`로 표시. 리눅스에서 돈다). v1 83건 → v4 136건(아카이브 관련) |
| IT(BE, 실 PG 5433 `moveseye_it`) | `ApmColdArchiveIT` **17건** — 꺼짐=예전대로 DROP·보류/원장 0 / 켜짐: 보류 → 회차 `failed=0` → 원장 OK·경로 규칙·manifest·CSV 후속 컬럼·사전 이름/family·스팬 JSONL 마스킹(`kim@example.com` 없음) → 재실행 멱등(OK·SUPERSEDED 1) → 다음 정리 DROP·보류 `ARCHIVED` 해제 → `SOURCE_EXPIRED` → EP 목록·다운로드 바이트 일치·상태·사유 필수 삭제 / 보류 기한 초과 `HOLD_EXPIRED` / 비관리자 403 / 루트 밖 거절 / 손상 설정 3종·오타 키 → 보존 중단 / 끄기 롤백 / 락 보유 중 삭제 대기·재보류 / 루트 밖 원장 경로 거절 / 터미널 상태 멱등 / 같은 날 RUNNING 1 / 판정 중 정책 변경 반영 / 저장이 보존 날짜를 기다림 / 락 시간 초과 fail-closed / 끄기 vs 시간 초과 보류 재오픈 없음 / 동시 부분 수정 둘 다 생존(latch, 변이 확인) | 통과(9.4초). `ApmRetentionJobIT` 12·`ApmSchemaIT` 20(job_key 목록에 `apm_archive` 1줄 갱신) 통과 |
| 꺼진 상태 불변(BE) | 원본 두 파일 diff 삭제 0줄 · `allowAllMatchesOriginalBytes` DDL 동일 · 기존 `ApmBatchJobTest`·`ApmRetentionNormalizationTest`·`ApmRetentionPolicyTest`·`ApmRetentionJobIT` 무수정 통과 · IT `offStateDropsAsBefore` | 통과 |
| 변이 확인(BE) | 저장 기준 설정을 락 밖에서 읽도록 되돌림 → IT `concurrentPartialUpdatesBothSurvive`가 `maxHoldDays=0`이 7로 덮여 실패 → 원복 | 확인 |
| 전체 `:test`(BE, v1 시점) | 4,351건 중 실패 4 = `LicenseArchitectureTest.A5-c`(master `d2b42c8`에서도 실패, 무관) + `ApmCollectorLiveRuntimeTest` 3(윈도우 임시 폴더 파일 잠금, 단독 재실행 통과) | 환경성 외 0 |
| 정적(FE) | `npx tsc --noEmit` · `npm run typecheck:contract`(픽스처 `archiveContractSample.ts` — BE DTO와 대조해 `busy[]`·`lastHoldReason`·`settingsState`·구조화 경고·`JobInfo` epoch 반영) · `eslint --max-warnings 0` | 0 |
| 단위(FE) | `DataArchivePage.test.tsx` 35 · `dataArchiveDisplay.test.ts` 38(아카이브 2스위트 73/73) + `ApmAlertRulesPage`(+3)·`AdminConsoleNav`(13→14)·`apmRoutes`·`apmAdminGating`·`apmHelpContent`·`GlobalSearch`·`apmAlertDisplay`·`apmAlertHooks` | 대상 10스위트 **232건 중 229 통과** — 실패 3은 `apmHelpContent.test.ts`의 master 기존 실패(깨끗한 `c4eaf55` 워크트리에서 동일 재현). 단언: 모르는 경고 코드에도 화면이 선다·같은 날 OK+RUNNING 부모 선택 시 삭제 ids에 RUNNING 제외·`ARCHIVE_HOLD` 행에 수정·삭제·재동기화 버튼 부재·고객 문구에 §·HTML·검수번호 없음 |
| 정적 검수(Codex, gpt-5.6-sol high) | BE v1 R1~R12(12건, 데이터 손실 급 — fail-open 설정·삭제↔DROP 경쟁·공유 partial·`ATOMIC_MOVE` 덮어쓰기·봉인 기한 없음·원장 경로 미검증·CSV 비가역 변형) → v2 N1~N5 → v3 M1~M4 → v4 P1~P4 → **v5 승인(새 결함 0)**. FE v1 R1~R15(필수 6) → v2 N1·R9·R12·N2 → **v3 승인** | 전건 반영 |
| 병합 후 | master ff 병합본 BE 컴파일·FE tsc·`typecheck:contract` 0 | 통과 |
| runtime | — | **미실시** — BE를 이 코드로 기동한 적 없음(:3000은 이전 코드), 브라우저 0건, NFS·컨테이너 볼륨 판정·리눅스 심볼릭 링크 경로(skip 4)·1m/스팬 용량·소요·다중 노드 겹침·크래시 후 `.partial` 청소·게이트 거부→다음 날 DROP(실 스케줄) |

미검증 항목(S6):

- 실제 스케줄 흐름(00:50 → 01:30 보류 → 다음 날 DROP·해제), "지금 실행" 폴링·회차 요약 표시, 보류 배너·`ARCHIVE_HOLD` 규칙 행·Zabbix 아이템 생성
- 브라우저: 목록·실 ZIP 다운로드·삭제 사유 모달·연결 테스트·APM 켜기(허용 루트 있는/없는 설치본)·옵트인 확인 모달·`ARCHIVE_BUSY` 재시도 창·여러 파일 순차 저장 시 브라우저 허용 프롬프트
- NFS에서 `.probe`·`ATOMIC_MOVE`·하드 링크·재읽기 SHA, 컨테이너 `mountinfo` 판정 신뢰도(overlay vs bind mount), 리눅스 심볼릭 링크 거절 4건
- 1m 하루 1,400만 행 소요(25분 예산 안?)·용량·`ARCHIVE_TO_DB_RATIO`·50MB/s, 아카이브 소스의 ACCESS SHARE가 보존 DROP을 실제로 기다리는지, 다중 노드 리스 겹침
- dev DB V69 적용(재기동 전)

증거 원천: 계약 `_workspace/contract_apm-cold-archive.md` · 보고 `reports/zm-156_be-cold-archive.md`(§4 설계와 달라진 점·§5 테스트·§8~§8.5 Codex 반영)·`zm-156_fe-cold-archive.md` · 검수 `reviews/review_zm-156-be-cold-archive.md`(v1~v5)·`review_zm-156-fe-cold-archive.md`(v1~v3) · 메모리 `apm-cold-archive-decisions.md`.

## 10. 결정과 열린 항목

- 결정:
  - **DROP 게이트 = 원장 + 게이트 인터페이스(C안)** — 두 배치는 서로를 호출하지 않고 **데이터(`archive_file` OK + 실물)로만** 만난다(롤업 워터마크가 `apm_setting`에 있는 것과 같은 관용구). 실패가 서로에게 번지지 않는다.
  - **기능 스위치는 하나** — `archive_setting(APM).enabled`(기본 false). 설계의 "스케줄러 `enabled=false` 기본"은 스위치가 둘이 되어 "기능만 켜고 스케줄러는 꺼진" 조합이 조용히 보류만 쌓는다 → 스케줄러 시드는 TRUE, 꺼짐이면 `skipped: disabled`.
  - **게이트 인터페이스는 retention 패키지에**(`ApmRetentionDropGate`) — 설계는 archive에 두었으나 아카이브가 `ApmRetentionDays`를 읽어야 해(사본 금지) 양방향이면 순환. 쓰는 쪽(보존)이 모양을 선언하고 아카이브가 구현(archive→retention 한 방향, ArchUnit).
  - **배치·소스·EP는 `premium/apm/archive/`(메뉴), 게이트·데이터셋·설정·보류·probe는 `core/batch/archive/`** — 스팬 마스킹이 `trace.ingest.ApmSqlPolicy`(메뉴)라 core에 두면 규칙 ③ 위반. **공통 기반은 `com.dmove.moveseye.archive`**(기능 패키지 — `common/`은 도메인 색 없는 유틸만).
  - **권한은 관리자 판정**(기능 권한 미도입). **CSV 수식 방어는 아카이브에서 끔**(`csvFormulaGuard:false` — 복원용 원본, ZM-154 내보내기는 종전대로 켬; 작성기 옵션으로 분리). **`STUCK_REQUEST`는 보호하지 않음**(임계가 사용자 설정값이고 서비스별 규칙도 있어 — `ARCHIVE_HOLD`만 `isProtected`).
  - **Redis 분산 락 대신 PG advisory lock**(설치형 1벌·원장과 파티션이 같은 DB·트랜잭션 락 자동 해제) + **try-lock 유한 대기**(보존 30초·관리자 60초). **UUID `.partial` + `CREATE_NEW`**, **하드 링크 no-replace 게시 + `-rN`**, **상태별 부분 유니크 + `ON CONFLICT DO NOTHING`**, **deadline 전파(statement_timeout·1만 행·8MB·EOF·반환 직전)** — 전부 Codex v1~v4가 잡은 데이터 손실 급 결함의 대응.
  - **설정 손상은 fail-closed**(행이 있으면 엄격, 모르는 키도 손상) — 틀린 값을 조용히 접으면 게이트가 열린 채 지운다. **설정 락 실패 시 보류 미기록**(끄기와 엇갈려 닫힌 보류 재오픈 방지), 대신 일시 경고.
  - **보류는 실패가 아니다**(매일 실패 알람이 울리면 아무도 안 본다) — 배너·`ARCHIVE_HOLD`·요약 `archiveHeld`. **`requiresActiveLicense=false`**.
  - **(데이터셋, 날짜) 단위 ZIP**(Q4), **형식은 데이터셋별 고정**(CSV.gz / span JSONL.gz), **사전 동봉**(services·hist_bounds·slos — `sloSnapshot`의 `slo_id`가 파일만으로 읽혀야 한다), **시각 UTC ISO + `_epoch_ms`**, **`period_day`는 파티션과 같은 시간대**.
  - **경로는 스케줄러 옵션이 아니라 검증 EP 전용 저장소**, **허용 루트 강제**(Q7), **상태 EP는 쓰기 시험 안 함**(폴링마다 디스크에 검사 파일을 쓰지 않는다 — 실검사는 `path-check`).
  - **`warnings`는 `{code, message, params}`**(FE 요청 #1 — 한국어 고정·내부 표기가 고객 화면에 못 간다), **`settingsState`**(#2), **상태 EP 시각은 epoch ms `JobInfo`**(#3 — 스케줄러 DTO의 리터럴 `Z` 결함 회피).
  - **FE는 위험한 방향의 변경만 확인**(옵트인·continue·마스킹 끄기), **비관리자는 배너 요청조차 안 함**, **`ARCHIVE_HOLD`는 토글만**, **잠금 대기 호출에만 3분 timeout**.
- 기각 대안:
  - 잡 실행 이력(`scheduler_run_log`)으로 보관 여부 판정 — 기본 정책이 실패만 기록·`logKeep=0`이면 아무것도 없음·1,000행 절단·500자 자유 문자열·단위가 "실행"이지 "(데이터셋, 날짜)"가 아니다. 로그는 원장이 아니다.
  - 보존 배치 안에서 "내보내기 → 성공 시 DROP"(합치기) — 아카이브(디스크 가득·NFS 끊김) 실패가 라이선스·디스크와 무관하게 반드시 돌아야 할 보존 전체를 끌고 들어간다, 리스 30분을 넘기면 다른 노드가 같은 보존을 시작, 자빅스 소스와 기반 공유 불가.
  - DROP 허가 목록 테이블 — 원장과 두 벌의 진실(수동 삭제·SUPERSEDED 시 허가를 누가 거두나).
  - 하루 1 ZIP(기반 D2) — 1h는 400일 뒤에야 지워지는데 다음 날 이미 파일(400일 이중 보관), 1m은 늦은 도착 구간을 찍음, 1m만 실패해도 그날 ZIP 전체 실패.
  - Parquet — hadoop 계열 의존성이 설치형 번들을 키움(기반 D3). S3·Azure SDK — 온프렘, NAS 마운트로 우회.
  - 공통 감사 테이블 선행(Q8) — 코드에 공통 체계가 없고 ZM-155와 함께 범용 감사를 먼저 만드는 비용. 1차는 로그.
  - 스케줄러 `enabled=false`를 기능 스위치로(스위치 둘) · 게이트 인터페이스를 archive 패키지에(순환) · `.env.example` 갱신(Spring 레포에 없음, 구 NestJS 레포는 참조 전용) · RUNNING 행 없이 partial 청소만(v1 — Codex R4의 소유권 확인에 원장 행이 필요해 철회) · `ATOMIC_MOVE` 게시(리눅스 rename 덮어쓰기) · `SET lock_timeout`(시간 초과가 트랜잭션을 깨 보류를 기록할 수 없다) · 무한 대기 advisory lock · 서버 `warnings[]` 문장을 FE가 머리 매칭으로 재판정(v1 FE 우회 — 코드화로 제거) · `SecureDirectoryStream`(윈도우 미지원).
- 열린 항목:

  | 항목 | 상태 |
  |---|---|
  | S6 런타임 실측(§9 미검증 목록) — BE 재기동 후 | 계획 |
  | 1m·스팬 용량·소요 실측 → `ARCHIVE_TO_DB_RATIO`(0.1)·봉인 처리량(50MB/s)·`SIZE_RATIO` 교체. 1m 하루가 예산 안에 영영 안 끝나면 데이터셋 단위 분할 실행 검토 | 계획(실측 뒤) |
  | restore(되살리기) — 공통 기반 P2를 소스별 복원기 SPI로 재설계(Q5) | 보류 |
  | 목록의 날짜 단위 페이지(`groupBy=day`) — 하루치가 페이지 경계에서 나뉨(FE 요청 #4) | 보류(후속) |
  | `LOCK_TIMEOUT` 경고가 프로세스 메모리라 재기동 시 소실(설정 락 실패는 장부에 남지 않는다) | 보류(의도된 한계) |
  | 설정 › 스케줄러 EP의 시각이 서버 현지 `LocalDateTime` + 리터럴 `Z`(KST JVM이면 9시간 어긋남) — 아카이브 EP는 epoch ms로 회피, 스케줄러 EP·화면은 별도 티켓 | 계획(별도 이슈) |
  | master 기존 실패 2종 — BE `LicenseArchitectureTest.A5-c`(`ApmOtlpController.receiveTraces`), FE `apmHelpContent.test.ts` 3건(키 목록 미갱신) | 계획(별도 수정) |
  | 파일 보관 기간 자동 삭제(`archive_cleanup`·`RETENTION_EXPIRED`), 수동 재생성 EP, 나머지 데이터셋(5m 계열·`errorGroup1h`·RUM 2차·jobRun·deployment), 서명(`signature`) | 보류 |
  | moveseye-ai 툴 카탈로그(`screens.json`)·AI 화면 목록에 새 화면 미등록, FE `navSearchEntries` 규약 확인 | 계획 |
  | 미저장 입력 보호(`useBlocker`) 미적용, 여러 파일 다운로드를 한 ZIP으로 묶는 EP 없음 | 보류 |
  | 꺼진 상태에서 보존 단계당 SELECT 1회 증가를 "불변"으로 볼지 | 수용(동작 불변, 쿼리 수 불변 아님) |
  | 자빅스 아카이빙(I7)이 이 공통 기반을 가져다 쓸 때 `ZABBIX` 소스·`PARTIAL` 상태·`raw_rows/trend_rows` 대신 manifest counts 정본 확인 | 보류(I7 착수 시) |
  | `_workspace` 계약서·보고서 머리의 "미커밋" 표기가 병합 뒤에도 남아 있음 | 계획 |

- 관련 문서: [설치·배포 가이드](../%EC%9A%B4%EC%98%81/solutions--%EC%84%A4%EC%B9%98-%EB%B0%B0%ED%8F%AC-%EA%B0%80%EC%9D%B4%EB%93%9C.md)(§4-4 `ARCHIVE_ALLOWED_ROOTS`·§5-1 볼륨·§8 롤백·§9 백업), [APM 데이터 내보내기](solutions--APM-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%82%B4%EB%B3%B4%EB%82%B4%EA%B8%B0.md)(공용 작성기·`LogSafe`·CSV 수식 방어의 원 결정), [권한 강제와 세션 회수](solutions--%EA%B6%8C%ED%95%9C-%EA%B0%95%EC%A0%9C%EC%99%80-%EC%84%B8%EC%85%98-%ED%9A%8C%EC%88%98.md)(관리자 판정의 정본), [API 카탈로그](../%EA%B8%B0%EC%88%A0/solutions--API-%EC%B9%B4%ED%83%88%EB%A1%9C%EA%B7%B8.md), [데이터 모델](../%EA%B8%B0%EC%88%A0/solutions--%EB%8D%B0%EC%9D%B4%ED%84%B0-%EB%AA%A8%EB%8D%B8.md), [아키텍처](../%EA%B8%B0%EC%88%A0/solutions--%EC%95%84%ED%82%A4%ED%85%8D%EC%B2%98.md), [릴리스 노트](../%EB%A6%B4%EB%A6%AC%EC%8A%A4/solutions--%EB%A6%B4%EB%A6%AC%EC%8A%A4-%EB%85%B8%ED%8A%B8.md), [용어집](../%EC%B0%B8%EA%B3%A0/solutions--%EC%9A%A9%EC%96%B4%EC%A7%91.md). API 카탈로그·데이터 모델·릴리스 노트·용어집에 이 기능 항목이 이미 있는지는 이번 작성에서 확인하지 않았다(미확인).
- Obsidian 관련 노트: `apm-cold-archive-decisions`(결정 7개·구현·병합 경위), `zabbix-data-archiving-backlog`(공통 기반 원설계 I7), `zm-151-156-backlog-sprint`, `apm-implementation-progress`, `codex-model-choice`, `redis-improvement-backlog`(분산 락 안 씀 결정의 맥락).

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-09-16 | 설계 초안 `devdesign_apm-cold-archive.md` — 보존 현황 조사(영영 사라지는 것 표), 공통 기반(I7)과의 비교, DROP 게이트 C안, (데이터셋, 날짜) 단위, 경로 검증 R1~R6, 컨테이너 볼륨 요건, 미결 Q1~Q11 |
| 2026-10-01 | 결정 7개 확정(Q1 A안·Q2·Q3·Q4·Q7·Q8·Q11). BE 구현(S1 공통 기반·S2 게이트·S3 배치/소스 3종·S5 옵트인, V69, 파이프라인 볼륨, 설치 가이드) + Codex BE v1 12건 → v2 N1~N5 → v3 M1~M4 → v4 P1~P4 → v5 승인. FE 구현(S4 — 데이터 아카이브 3탭·보류 배너·스케줄러/알람 등록) + 계약 v1.1·v1.2(`RUNNING`·`rejected[]`·`busy[]`·`ARCHIVE_FILE_REJECTED`·`ARCHIVE_BUSY`·`APM_ALERT_RULE_PROTECTED`·구조화 `warnings`·`settingsState`·`JobInfo`·`LOCK_TIMEOUT`) + Codex FE v1 15건 → v2 → v3 승인 |
| 2026-10-02 | 사용자 승인 후 커밋·master ff 병합 BE `3637c77`·FE `2ed84f7`(미푸시), 워크트리·브랜치 정리, 병합본 컴파일·tsc·contract 0. 이 문서 최초 작성(소스 기준, 런타임 미실시) |
