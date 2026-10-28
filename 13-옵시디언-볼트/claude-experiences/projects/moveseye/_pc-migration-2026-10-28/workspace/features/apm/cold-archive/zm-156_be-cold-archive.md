# ZM-156 BE 구현 보고 — APM 콜드 아카이브 (S1·S2·S3 + S5 옵트인)

- 작성 2026-10-01 · Claude(be-engineer) · 상태: **구현·테스트 완료, 미커밋**(사용자 승인 대기)
- 워크트리 **`C:\worktrees\zm-156-be`** · 브랜치 `ZM-156-be`(master `d2b42c8` 기준) · 본체 `C:\solutions\moveseye-be-spring` 무수정
- 정본: 설계 [`./devdesign_apm-cold-archive.md`](devdesign_apm-cold-archive.md) · 기반 [`../../platform/data-archiving/devdesign_data-archiving.md`](../../platform/data-archiving/devdesign_data-archiving.md)
- 산출: 계약 [`./contract_apm-cold-archive.md`](contract_apm-cold-archive.md) · 검수 인계 [`./review_zm-156-be-cold-archive.md`](review_zm-156-be-cold-archive.md)
- 마이그레이션 **V69** `V69__archive_ledger_apm_cold_archive.sql`(현재 최신 V68 다음 — 모든 로컬 브랜치를 `sort -V`로 확인, 충돌 없음)

---

## 1. 한눈에

| 단계 | 상태 | 요지 |
|---|---|---|
| **S2** DROP 게이트 | ✅ 완료 | 꺼진 상태(기본)는 원래 호출 그대로 — 테스트로 고정. 켜진 상태는 아카이브 대상 테이블만 판정 오버로드. 판정 실패는 던짐(fail-closed). 우회 호출처는 ArchUnit으로 금지 |
| **S1** 공통 기반 | ✅ 완료 | 원장 `archive_file` · `ArchiveLedger` · `ArchiveWriter`(ZIP+manifest+checksums+재읽기 검증+원자적 이동) · `ArchivePathPolicy`(R0~R6+실검사) · 설정 저장소 · 공통 EP 9개 |
| **S3** 배치·소스 | ✅ 완료 | `apm_archive`(00:50) · 기본 3종(metric1h·traceSummary·sloSnapshot) · 자기 완결 사전 · 보류 알람 `ARCHIVE_HOLD` · APM EP 5개 |
| **S5** 옵트인 | ✅ 스위치·소스·마스킹 완료 / ⏸ 용량 실측 안 함(지시대로) | metric1m(CSV)·span(JSONL) 기본 미선택, 선택 시 용량 경고 문구, 스팬 마스킹 기본 켬 |
| 인프라 | ✅ 반영 | 파이프라인 `docker run`에 `-e ARCHIVE_ALLOWED_ROOTS=/data/archive -v /data/moveseye-archive:/data/archive` · 설치 가이드 §4-4·§5-1·§9 · ⚠️ `.env.example`은 아래 §6-3 |
| S4 FE | ⏸ 범위 밖 | 계약 §7 연동 가이드 |
| S6 실측 | ⏸ 범위 밖 | NFS·컨테이너 볼륨 판정·1m 소요·다중 노드 |

---

## 2. 바꾼 파일

### 2.1 BE 레포(워크트리) — 수정 18 · 신규 48

**수정**

| 파일 | 변경 |
|---|---|
| `premium/apm/core/batch/partition/ApmPartitionService.java` | **추가만**(삭제 0줄): `dropExpired(table, days, PartitionDropGuard)` + `DropResult(dropped, held)`. 원본 두 `dropExpired`는 무수정 |
| `premium/apm/core/batch/retention/ApmRetentionService.java` | **추가만**(삭제 0줄): 필드 `ApmRetentionDropGate archiveGate`·`archiveHeld`, 세 메서드(메트릭·트레이스 파티션·SLO 스냅샷) 앞에 `if (archiveGate.isActive())` 분기 → 게이트 경로, 아니면 **원래 문장 그대로**. `deleteOldSloSnapshotsGated`·`dropGated`·`consumeArchiveHeld` |
| `premium/apm/core/batch/retention/ApmRetentionJob.java` | 끝에 `archiveHeld=N` 요약(0이면 생략 → 꺼진 상태 요약 불변). 생성자 무변경 |
| `premium/apm/alert/rule/ApmAlertKind.java` | `ARCHIVE_HOLD`("count", 우선순위 3) · `isCollectorScoped()`에 포함 · `expressionThreshold` 0 |
| `premium/apm/alert/rule/ApmAlertKinds.java` · `ApmAlertRuleUpsertReqDto.java` | 문자열 상수·단위·Swagger 허용값 |
| `premium/apm/alert/evaluate/ApmAlertEvaluationService.java` | 세터 주입 `ApmArchiveHoldProbe` · 꺼져 있으면 ARCHIVE_HOLD 대상 생략 · 값은 열린 보류 건수 |
| `premium/apm/alert/evaluate/ApmAlertEvaluator.java` | ARCHIVE_HOLD는 빈 선/empty(미리보기) |
| `premium/apm/alert/rule/ApmAlertService.java` | `targetsOf` — ARCHIVE_HOLD는 시스템 축(serviceId NULL·키 `collector`)이되 라벨 "콜드 아카이브"(Zabbix 이름이 "… — 수집기"가 되지 않게) |
| `premium/apm/export/ApmExportService.java` | `logSafe` → `common/util/LogSafe.of` 위임(규칙 동일, 기존 테스트 무수정) |
| `scheduler/SchedulerRunLogPolicy.java` | `apm_archive` 기본 정책(성공 기록·90건) |
| `engine-api/.../common/exception/ErrorCode.java` | `ARCHIVE_NOT_CONFIGURED`·`ARCHIVE_PATH_INVALID`·`ARCHIVE_SETTING_INVALID`·`ARCHIVE_NOT_FOUND`·`ARCHIVE_REASON_REQUIRED`·`ARCHIVE_FILE_MISSING` |
| `src/main/resources/application.yml` | `app.archive.allowed-roots: ${ARCHIVE_ALLOWED_ROOTS:}` |
| `premium/apm/package-info.java` · `core/package-info.java` | 세트 지도에 `archive/`·`core/batch/archive/`와 갈린 이유 |
| `CLAUDE.md` | §3 #15 — dropExpired 호출처 규칙·꺼진 상태·허용 루트·볼륨 |
| `bitbucket-pipelines.yml` | BE `docker run`에 `-e ARCHIVE_ALLOWED_ROOTS=/data/archive -v /data/moveseye-archive:/data/archive` + `mkdir -p` |
| `test/.../premium/apm/ApmSchemaIT.java` | 스케줄러 job_key 목록에 `apm_archive`(1줄) — 새 잡이 생겼으니 기대값 갱신 |

**신규 — 공통 기반 `com.dmove.moveseye.archive`(premium 밖)**

| 파일 | 내용 |
|---|---|
| `ArchiveFileController` · `ArchiveFileService` · `ArchiveFileDto` · `ArchiveDeleteDto` · `ArchiveAdminAccess` · `package-info` | `/archives` 목록·상세·다운로드·삭제·선택 삭제·무결성·설정·연결 테스트. 관리자 판정. 감사 로그 `[{source}-ARCHIVE]` |
| `ledger/ArchiveLedger` · `ArchiveFileRow` · `ArchiveStatus` | 원장 유일 통로(JDBC). OK→SUPERSEDED 같은 트랜잭션, FAILED·SOURCE_EXPIRED·HOLD_EXPIRED 기록, 삭제는 행 남김 |
| `setting/ArchiveSettingStore` · `ArchiveSettingService` · `ArchiveCommonSettings` · `ArchiveSettingsDto` · `UpdateArchiveSettingsReqDto` | `archive_setting`(소스별 1행). 경로는 실검사 통과해야 저장. 읽기 실패는 던짐 |
| `path/ArchivePathPolicy` · `ArchiveProperties` · `PathCheckResult` | 규칙 R0~R6 + 실검사(생성·.probe 쓰기·fsync·재읽기·원자적 이동·여유 공간·컨테이너 마운트 판정) |
| `write/ArchiveWriter` · `ArchiveWriteException` | ZIP(.partial→검증→원자적 이동, `-rN`, part 롤링, CSV 레코드 수 재계수) |
| `common/util/LogSafe` | 로그 이스케이프 승격 |

**신규 — APM**

| 파일 | 내용 |
|---|---|
| `premium/apm/core/batch/archive/ApmArchiveDropGate` | 판정 표 §5.3, `TableGuard`(단계 시작 시 원장·보류 1회 읽기, 실물 확인) |
| `…/ApmArchiveDataset` · `ApmArchiveSettings` · `ApmArchiveSettingsService` · `ApmArchiveHoldStore` · `ApmArchiveHoldProbe` | 데이터셋 표(보존 일수는 `ApmRetentionDays` 접근자 — 사본 없음) · 설정 해석 · 보류 장부 · 알람 측정 |
| `…/partition/PartitionDropGuard` · `…/retention/ApmRetentionDropGate` | 게이트가 끼는 인터페이스(순환 회피 — §4 #2) |
| `premium/apm/archive/ApmArchiveJob` · `ApmArchiveService` · `ApmArchiveSource` | 배치·회차·(데이터셋, 날짜) 내보내기·사전·마스킹 |
| `…/ApmArchiveController` · `ApmArchiveAdminService` · `ApmArchiveSettingsDto` · `ApmArchiveStatusDto` · `UpdateApmArchiveSettingsReqDto` | `/archives/sources/apm/*`(`@RequiresFeature(APM)`) |
| `db/migration/V69__archive_ledger_apm_cold_archive.sql` | `archive_file`(+부분 유니크) · `archive_setting` · `apm_archive_hold`(+열린 행 부분 유니크) · 시드 `apm_archive`(00:50) · 시드 규칙 `ARCHIVE_HOLD` |

**신규 테스트(11)**: `ApmRetentionArchiveGateTest` · `ApmPartitionDropGuardTest` · `ApmArchiveDropGateTest` · `ApmArchiveGateArchTest` · `ArchiveWriterTest` · `ArchivePathPolicyTest` · `ApmArchiveServiceTest` · `ApmArchiveSourceTest` · `ApmArchiveAdminServiceTest` · `ApmAlertKindArchiveHoldTest` · **`ApmColdArchiveIT`**

### 2.2 레포 밖

| 파일 | 변경 |
|---|---|
| `moveseye-docs/operations/설치-배포-가이드.md` | §4-4 `ARCHIVE_ALLOWED_ROOTS` 행 · §5-1 docker run 예시에 `-e`·`-v` + "데이터 아카이빙 볼륨" 단락 · §9 백업 대상에 아카이브 디렉터리 · 변경 이력 |
| `_workspace/features/apm/cold-archive/contract_apm-cold-archive.md` · `features/apm/cold-archive/zm-156_be-cold-archive.md` · `features/apm/cold-archive/review_zm-156-be-cold-archive.md` | 산출물 |

---

## 3. 단계별 구현과 한계

### S2 — DROP 게이트 (먼저 깔고 "꺼진 상태 불변"부터 고정)

- **진입 조건**: 보존 서비스의 세 메서드가 `archiveGate.isActive()`를 먼저 묻는다. false면 **원래 문장**(`partitionService.dropExpired(List.of(...))` / `delete from apm_slo_snapshot where day < ?`)을 그대로 실행한다 — diff상 원래 줄은 한 줄도 바뀌지 않았다(두 파일 삭제 0줄).
- **판정**(`ApmArchiveDropGate`, 설계 §5.3 그대로): DISABLED → NOT_TARGET → ARCHIVED(원장 OK **그리고 파일 실물**) → CONTINUE_POLICY(+WARN) → HOLD_EXPIRED(보류 일수 > maxHoldDays, 0이면 무기한; **원장 기록 성공 후** 허용) → HELD(보류 장부 upsert).
- **fail-closed**: `isActive()`·`guardFor()`·보류 기록·HOLD_EXPIRED 기록이 실패하면 예외 → 그 보존 단계 실패(지우지 않음). SLO 경로는 같은 트랜잭션이라 통째로 롤백.
- **보류는 실패가 아니다**: 보존 잡은 던지지 않고 요약에 `archiveHeld=N`만 싣는다(0이면 생략). 대신 보류 장부 → 상태 EP 배너·`ARCHIVE_HOLD` 알람(보류 첫날부터, Q2).
- **우회 금지**: `ApmArchiveGateArchTest`가 `ApmPartitionService.dropExpired(…)` 호출처를 `ApmRetentionService`로 고정. 보존 서비스 안에서 데이터셋 표의 **모든 파티션 데이터셋**이 판정 경로로 가는지는 `everyPartitionDatasetIsGated`가 전수로 본다.
- ⚠️ 한계: RUM·메시징 정리는 대상 데이터셋이 아니라 판정 없는 경로 그대로다(의도). 꺼진 상태에서도 보존 단계마다 `archive_setting` SELECT 1회가 늘었다(하루 3회 — 동작 불변이지만 "쿼리 수 불변"은 아니다).

### S1 — 공통 기반

- **원장**: `archive_file`(기반 §5 + 설계 §3.2 확장: `source`·`dataset`·`period_day`·`source_rows`·부분 유니크 `(source, dataset, period_day) WHERE status='OK'`). 기반의 `raw_rows`·`trend_rows`는 넣지 않았다(자빅스 전용 의미 — counts는 manifest가 정본, 설계 §3.2 권고). `PARTIAL`은 자빅스용으로 예약(varchar).
- **작성기**: 표마다 `TabularWriter`(ZM-154 `CsvTabularWriter`/`JsonlTabularWriter` 재사용) → gzip → ZIP 항목(무압축 DEFLATE로 감쌈). 닫은 뒤 ZIP을 **다시 열어** 항목별 SHA-256·레코드 수 재계수(CSV는 따옴표 안 개행을 레코드 경계로 세지 않는 카운터) → ZIP SHA-256 → fsync → 같은 디렉터리 `ATOMIC_MOVE`(미지원이면 일반 이동 + 이동 후 해시 재대조). 이름이 있으면 `-r2`… (덮어쓰기 금지). 크래시 잔여 `.partial`은 다음 회차가 1시간 넘은 것만 청소.
- **경로 정책**: R0(허용 루트)·R1(절대)·R2(`..`·정규화)·R3(루트 아래)·R4(실경로가 루트 아래, 없는 경로는 가장 가까운 조상)·R5(제어 문자·따옴표·`${`·512자·앞뒤 공백·예약 이름·`:`)·R6(LOG_PATH 겹침). 실검사: 생성(부모 필요)·`.probe` 쓰기+fsync+재읽기·원자적 이동·여유 공간·`/proc/self/mountinfo` 기반 볼륨 판정(컨테이너 안에서 루트 overlay만 담으면 false).
- **설정**: 경로는 스케줄러 옵션이 아니라 `archive_setting`(검증 EP로만 씀, 설계 §4.4).
- ⚠️ 한계: 볼륨 판정은 휴리스틱(S6 실측 대상). 파일 보관 기간 자동 삭제(`archive_cleanup`)는 범위 밖 — `archiveRetentionDays`는 0(무기한) 고정. restore 없음(Q5 — 되살릴 수 있게 쓰기만).

### S3 — 배치·소스

- **대상 날짜**(§4.3): `D ≤ 오늘 − 보존 − 1 + leadDays` 중 원본이 있고 유효본(+실물)이 없는 날 — 보류된 옛날 날짜도 같은 식에 들어온다. 급한 순(dropDay 오름차순). `backfill=all`이면 오늘−2까지 전부. 곧 지워질 창에 원본이 이미 없으면 `SOURCE_EXPIRED` 1회 기록.
- **옵션 읽기 시 자르기**: `leadDays` 1~min(보존)−1, `maxRunMinutes` 1~25(리스 TTL 30분), `fetchSize` 100~100,000 — 스케줄러 저장이 무검증이라(ZM-153 관용구).
- **내보내기**(`ApmArchiveSource`): REPEATABLE READ 읽기 전용 트랜잭션 안에서 `to_regclass(파티션)` → `count(*)` → `select *`(fetchSize 커서) → 사전. 🔴 파티션을 **이름으로 직접** 읽는다(부모를 범위로 읽으면 그 사이 DROP된 날이 "0행 OK"가 된다). 쓴 행 ≠ 센 행이면 `VERIFY_MISMATCH`. 열은 `select *` 메타데이터 그대로(V47 `exemplar_value` 같은 후속 컬럼 자동 포함), timestamp는 UTC ISO + `_epoch_ms`, jsonb·배열은 JSON.
- **사전**(§6.3): `dict/services`(id·uid·이름·env·표시명·상태) · `dict/hist_bounds`(id·family·경계) · `dict/slos`(SLO 정의 — 설계 표에 없던 것, §4 #6). 사전에 없는 id는 `<deleted:ID>` + manifest `dictionaries.missing`.
- **회차 결과**: `ok=… failed=… expired=… deferred=… abandoned=… rows=… bytes=…`. 실패가 있으면 던진다(false-green 금지). `NO_SPACE`면 그 자리에서 멈추고 나머지는 이월. 원장 기록이 실패하면 방금 만든 파일을 지운다.
- **알람**: `ARCHIVE_HOLD` 전역 규칙 1건(V69). 꺼져 있으면 대상 없음 → Zabbix 아이템 안 생김.
- **라이선스**: 잡 `requiresActiveLicense=false`(§5.6). APM 설정 EP만 `Feature.APM`, 공통 EP는 premium 밖.
- ⚠️ 한계: 1m 하루치(1,400만 행) 소요 미측정 — 시간 예산(20분)을 넘기면 이월이 쌓이고 결국 보류가 된다(설계 리스크 4). 정렬(ORDER BY) 없이 쓴다 — 행 순서는 의미 없음.

### S5 — 옵트인

- `metric1m`·`span`: 데이터셋은 구현, 기본 미선택(`optIn:true`), 선택하면 응답 `warnings`·`datasets[].warning`에 설계 §6.2 추정치 문구. 용량 실측은 하지 않았다(지시).
- 마스킹(`maskRawText` 기본 true): 스팬 `attrs`·`events`·`links`의 **문자열 값만** — `db.query.text`·`db.statement`는 SQL 마스킹, `exception.stacktrace`는 프레임 줄 보존, 그 밖은 SQL로 보일 때만(`ApmSqlPolicy.MASKED` — 적재·조회와 같은 함수). OTel `{key, value}` 쌍 모양도 키를 따라간다. 깨진 JSON은 통째로 휴리스틱 마스킹. manifest `masked`·`maskApplicable`.
- ⚠️ 한계: 스팬 `name`(예: `SELECT users`)은 마스킹하지 않는다(요약 이름이라). 키에 값이 실린 계측은 막지 못한다(조회 화면과 같은 한계).

---

## 4. 설계와 달라진 점 (이유)

| # | 설계 | 구현 | 이유 |
|---|---|---|---|
| 1 | 공통 기반 위치 `common/archive`(가칭) | **`com.dmove.moveseye.archive`**(기능 패키지) | CLAUDE.md §0.5 규칙 1 — 컨트롤러·표를 가진 기능은 수직 분할, `common/`은 도메인 색 없는 공유 유틸만. 방향(premium→archive만)은 ArchUnit A1 + `commonArchiveDoesNotDependOnPremium` |
| 2 | 게이트 인터페이스를 `core/batch/archive`에, 보존이 import | 인터페이스 `ApmRetentionDropGate`를 **retention에**, archive가 구현 | archive가 `ApmRetentionDays`를 읽어야 해(§5.4 사본 금지) 양방향이면 순환. ArchUnit `retentionDoesNotDependOnArchive` |
| 3 | 배치·소스도 `core/batch/archive` | 배치·소스·화면은 **`premium/apm/archive/`(메뉴)** | 스팬 마스킹이 `trace.ingest.ApmSqlPolicy`(메뉴) — core가 메뉴를 import하면 규칙 ③ 위반. ArchUnit `coreDoesNotDependOnArchiveMenu` |
| 4 | 스케줄러 `apm_archive.enabled=false`가 기본 스위치 | 스케줄러 시드 **TRUE**, 기능 스위치는 `archive_setting(APM).enabled`(기본 false) 하나 | 스위치 둘은 "한쪽만 켜짐" 조합을 만든다. 켜기는 검증 EP(허용 루트·경로 실검사)를 통과해야만. 스케줄러가 꺼지면 상태 EP 경고 |
| 5 | 진행 중 행 크래시 → `FAILED(ABANDONED)` | RUNNING 행을 두지 않고, 크래시 잔여 `.partial` 청소 + 요약 `abandoned=N` | 진행 중 상태가 부분 유니크·게이트 판정에 끼지 않게. 원장은 끝난 사실만 |
| 6 | 사전 3종(services·hist_bounds·error_groups/db_query_groups) | services·hist_bounds + **slos**(error_groups·db_query_groups는 해당 데이터셋 미구현이라 없음) | `sloSnapshot`의 `slo_id`가 무엇인지 파일만으로 알 수 있어야 한다(§6.3 원칙) |
| 7 | 권한 `DmovePermissions.archive` 기능 권한 | **관리자 판정**(`ArchiveAdminAccess`) | 역할 편집 화면·FE 게이팅까지 번진다. 판정 축은 설계 §9 "관리자 전용"과 같다 |
| 8 | `.env.example`에 키 추가 | **설치 가이드 §4-4 표에 추가** | Spring 레포에 `.env.example`이 없고, 있는 것은 구 NestJS 레포(`moveseye-be`, 참조 전용·수정 금지)다(§6-3) |
| 9 | 파일 이름 `moveseye-apm_{dataset}_{date}.zip` | 같음 + 재생성 시 `-r2`… | 덮어쓰기 금지(D8)인데 같은 날 재생성은 같은 이름을 원한다 |
| 10 | 상태 카드 "경로 실검사 결과" | 상태 EP는 `diskUsableBytes`만(쓰기 시험 안 함), 실검사는 `POST /archives/path-check` | 상태는 폴링된다 — 폴링마다 디스크에 검사 파일을 쓰지 않는다 |
| 11 | 하루 예상 용량 = 최근 7일 실제 행 수 기준 | `recentDailyRows`(reltuples 평균)·`recentDailyDbBytes`·`estimatedDailyArchiveBytes = DB × 0.1` | 행 수는 통계 추정, 아카이브 크기 비율은 실측 전 상수(S6에서 교체) |

---

## 5. 테스트 결과 (실제 실행)

> 실행 환경: 워크트리, JDK 17, `.\gradlew.bat :test --tests …`. IT DB = 도커 PG 5433 `moveseye_it`(실행 전 다른 Gradle 테스트 워커 없음 확인, IT 소요 시간 0 아님 → skip 아님).

### 5.1 🔴 "꺼진 상태 불변" 증거

| 증거 | 결과 |
|---|---|
| `ApmPartitionService.java`·`ApmRetentionService.java` diff — 삭제 줄 | **0줄 / 0줄**(추가만) |
| `ApmRetentionArchiveGateTest.Off`(5) — 꺼짐이면 판정 없는 `dropExpired(List)`에 **예전과 같은 계획**·SLO는 예전 한 문장·판정 오버로드/판정기 0회·메시징/RUM은 게이트를 묻지도 않음·잡 요약에 `archiveHeld` 없음 | 5/5 통과 |
| `ApmPartitionDropGuardTest.allowAllMatchesOriginalBytes` — 같은 카탈로그에서 원본 경로와 ALLOW_ALL 판정 경로의 **실행 DDL 문자열 목록이 동일** | 통과 |
| 기존 테스트 **무수정 통과**: `ApmBatchJobTest`(요약 문자열 `partitions=3 … hidden=4` 정확 일치) · `ApmRetentionNormalizationTest` · `ApmRetentionPolicyTest` · **`ApmRetentionJobIT`(12건, 실 PG)** | 통과 |
| `ApmColdArchiveIT.offStateDropsAsBefore` — 실 PG에서 꺼진 상태 보존 정리가 파티션을 지우고 보류 0·원장/보류 장부 0행 | 통과 |

### 5.2 새 테스트 (클래스별)

| 클래스 | 건수 | 결과 |
|---|---|---|
| `ApmRetentionArchiveGateTest`(꺼짐 5 · 켜짐 6) | 11 | 통과 |
| `ApmPartitionDropGuardTest` | 3 | 통과 |
| `ApmArchiveDropGateTest`(판정 표 전 행·fail-closed·설정 해석) | 13 | 통과 |
| `ApmArchiveGateArchTest`(dropExpired 호출처·방향 3) | 4 | 통과 |
| `ArchiveWriterTest` | 10 | 통과 |
| `ArchivePathPolicyTest` | 13 | 12 통과 · **1 skip**(R4 심볼릭 링크 — 윈도우 권한으로 링크 생성 불가, `assumeTrue`. 리눅스에서 돈다) |
| `ApmArchiveServiceTest` | 10 | 통과 |
| `ApmArchiveSourceTest` | 5 | 통과 |
| `ApmArchiveAdminServiceTest` | 7 | 통과 |
| `ApmAlertKindArchiveHoldTest` | 2 | 통과 |
| `ApmColdArchiveIT`(실 PG) | 5 | 통과(8.3초) |
| **합계** | **83** | 82 통과 · 1 skip |

관련 묶음 실행(`archive.*`·`premium.apm.archive.*`·`core.batch.*`·`alert.*`·`export.*`·`ApmSchemaIT`·`scheduler.*`·`OtelArchitectureTest`) **455건** — 실패 1(IT 기대값 — §5.3 수정 후 재실행 통과).

### 5.3 IT `ApmColdArchiveIT` (실 PG, 5건 — 8.3초)

| 테스트 | 확인 |
|---|---|
| 꺼진 상태 | 예전대로 DROP, 보류·원장 0 |
| 켜짐 전 구간 | 보류(파티션 남음·보류 장부) → 아카이브 회차 `failed=0` → 원장 OK·`source_rows=1`·경로 `{base}/apm/metric1h/yyyy/MM/moveseye-apm_metric1h_{day}.zip` → manifest(source·counts·period·scheduledDropDay) → CSV에 `bucket_start_epoch_ms`·`exemplar_value`(후속 컬럼 자동 포함) → `dict/services`에 서비스 이름·`dict/hist_bounds`에 family → 스팬 JSONL에 `kim@example.com` 없음·`masked:true` → 재실행 멱등(OK·SUPERSEDED 1개) → 다음 정리에서 두 파티션 DROP·보류 `ARCHIVED`로 해제 → 곧 지워질 창 3일 `SOURCE_EXPIRED` → EP 목록 `fileExists:true` → 다운로드 바이트 = 파일 바이트 → 상태 `holds.count=0` → 공백 사유 삭제 `ARCHIVE_REASON_REQUIRED` → 사유 삭제 후 파일 삭제·행 `DELETED`+사유 |
| 보류 기한 초과 | `first_held_at`을 9일 전으로 → 다음 정리에서 DROP + 원장 `HOLD_EXPIRED` + 보류 `HOLD_EXPIRED` |
| 비관리자 | `/archives`·`/archives/sources/apm/settings` → body code 403 |
| 허용 루트 밖 | `PUT /archives/settings` → `ARCHIVE_PATH_INVALID` |

### 5.4 전체 `:test` (앱 모듈, 18분)

```
4351 tests completed, 4 failed, 1 skipped
  LicenseArchitectureTest > A5-c                     ← master에서도 실패(§5.5)
  ApmCollectorLiveRuntimeTest > 3건                   ← FileSystemException: …\Temp\junit…\collector.log
                                                         "다른 프로세스가 파일을 사용 중" (윈도우 임시 폴더 정리 시 파일 잠금)
```
- `ApmCollectorLiveRuntimeTest`는 이 작업과 무관한 코드(수집기 런타임 실행)이고 **단독 재실행 시 통과** — 환경성 실패.
- 전체 실행 뒤 `ApmAlertService.targetsOf`(ARCHIVE_HOLD 라벨)를 고쳐, `alert.*` + `premium.apm.archive.*` + `ApmCollectorLiveRuntimeTest`를 다시 돌렸다: **210건 0실패**.

### 5.5 이미 있던 실패

- `LicenseArchitectureTest` **A5-c**(`ApmOtlpController.receiveTraces`가 스스로 라이선스를 확인하지 않는다는 판정) — **master `d2b42c8` 그대로의 임시 워크트리에서 같은 테스트만 돌려 같은 실패 확인**(이 작업과 무관, 수정하지 않음). 별도 이슈 필요.

---

## 6. 뒤집힌 전제·발견

1. **스케줄러 기본 OFF를 스위치로 쓰면 스위치가 둘이 된다**(설계 §4.4 (가)) → 기능 스위치를 검증 EP 쪽 하나로(§4 #4).
2. **보존 ↔ 아카이브 패키지 순환**: 설계대로면 core 안에 순환이 생긴다(§4 #2).
3. **`.env.example`이 Spring 레포에 없다** — 지시의 ".env.example에 키 추가"는 대상 파일이 구 NestJS 레포(참조 전용)뿐이라 하지 않았다. 설치 가이드 표가 실질 정본이라 그쪽에 넣었다. 운영 서버 `/home/.env`에는 넣을 필요가 없다(파이프라인이 `-e`로 고정).
4. **`apm_slo_snapshot` 배치도 00:50이다**(V51) — 아카이브와 같은 시각. 리스가 job_key 단위라 서로 막지 않는다(겹쳐도 무방).
5. **CSV 수식 주입 방어가 값을 바꾼다**(ZM-154 작성기 공유의 대가) — 아카이브는 "되살릴 수 있게"가 원칙이라 긴장이 있다. manifest `format.csvFormulaGuard`에 명시만 했다(검수 질문 8).
6. **`ApmSchemaIT`가 스케줄러 job_key를 `containsExactly`로 고정**해 새 잡마다 갱신이 필요하다(1줄 수정).
7. **IT 공유 DB 오염 주의**: 이 IT는 끝에 `archive_setting`을 지운다 — 남기면 같은 실행의 `ApmRetentionJobIT`가 게이트 경로를 탄다.

---

## 7. 미해결 · 다음

| # | 항목 | 비고 |
|---|---|---|
| 1 | **S4 FE** — 설정 › 데이터 아카이빙(목록·APM 탭·상태 카드·경로) | 계약 §7. `SCHEDULER_JOB_CATALOG`에 `apm_archive`, 알람 규칙 화면 `ARCHIVE_HOLD` 라벨 |
| 2 | **S6 실측** — 1m 하루 소요·용량, 스팬 용량, NFS 원자적 이동, 컨테이너 볼륨 판정, 크래시 후 청소, 다중 노드 겹침 | `ARCHIVE_TO_DB_RATIO`(0.1)·`SIZE_RATIO`(0.5) 교체 근거 |
| 3 | 파일 보관 기간 자동 삭제(`archive_cleanup`, `RETENTION_EXPIRED`) | 현재 0(무기한) 고정 |
| 4 | 수동 재생성 EP(특정 날 다시 만들기) | 지금은 "지금 실행"만. 파일을 지우면 다음 회차가 다시 만든다 |
| 5 | 나머지 데이터셋(metric5m·serviceEdge5m·dependency5m·dbQuery5m·messaging5m·errorGroup1h, RUM 2차) | 데이터셋 표에 더하면 게이트 테스트가 보존 경로 포함을 검사한다 |
| 6 | `LicenseArchitectureTest.A5-c` 기존 실패 | 별도 이슈 |
| 7 | moveseye-ai 툴·FE의 알람 종류 열거에 `ARCHIVE_HOLD` | 모르는 kind를 받으면 어떻게 보이는지 확인 필요 |
| 8 | 운영 배포 시 dev DB에 V69 적용 | 공유 dev DB(5432/5433)는 BE 재기동 때 Flyway가 적용 — 재기동은 사용자 지시 시에만 |

---

## 8. 코덱스 반영 (v1 검수 → 12건 전부, 2026-10-01)

검수 [`../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive_codex.md`](../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive_codex.md) — "수정 후 재검수", 필수 R1~R10·권장 R11·R12. 항목별 위치·테스트는 인계서 [`## 검수 결과(코덱스 v1)`](review_zm-156-be-cold-archive.md) 표가 정본이다. 요약:

| # | 무엇이 틀렸나 | 이제 |
|---|---|---|
| R1 | 손상된 설정 행이 "꺼짐"·"대상 아님"으로 접혀 게이트가 열린 채(fail-open) | 행이 있으면 엄격 검사, 틀리면 보존·아카이브가 멈춘다. 행이 없을 때만 기본(꺼짐) |
| R2 | 끄는 저장과 보류 해제가 다른 트랜잭션 | 한 트랜잭션 — 해제가 실패하면 저장도 롤백 |
| R3 | 게이트 판정(파일 있음)과 DROP 사이에 관리자 삭제가 끼면 둘 다 소실 | (소스, 데이터셋, 날짜) PG advisory lock. 판정은 락 안에서 원장·실물을 다시 읽고 DROP까지 한 트랜잭션. 삭제·검사·게시도 같은 락 |
| R4 | 결정적 partial 이름 + 열 때 무조건 삭제 → 겹친 실행이 서로 파일 삭제 | 실행 UUID partial·`CREATE_NEW`·무삭제. 원장 `RUNNING` 행이 소유권, 청소는 소유 실행이 끝난 것만 |
| R5 | `ATOMIC_MOVE`가 리눅스에서 기존 파일 덮어씀 | 하드 링크 게시(원자적 no-replace) + 충돌 시 `-rN` 재예약, 게시~원장은 락 안 |
| R6 | 한 항목 안에서 시간 예산·리스 검사 없음 | `statement_timeout` + 1만 행마다 확인 → `DEFERRED`(실패 아님), 하드 스톱 28분, 예산<리스 테스트 고정 |
| R7 | 원장 `file_path`를 검증 없이 다운로드·검사·삭제 | 공통 `checkManagedFile`(허용 루트·링크·이름 규칙·일반 파일) — 위반이면 `ARCHIVE_FILE_REJECTED`·삭제 `rejected[]`, 원장 불변 |
| R8 | 파생 디렉터리가 링크를 따라감 | 세그먼트마다 NOFOLLOW 생성·검사 + 게시 직전 실경로 재대조 |
| R9 | DROP 재시도 시 HOLD_EXPIRED 중복, SOURCE_EXPIRED 경쟁 | 상태별 부분 유니크 + `ON CONFLICT DO NOTHING`, HOLD_EXPIRED는 DROP과 같은 트랜잭션 |
| R10 | CSV 수식 방어가 값을 비가역 변형 | 작성기 옵션 — 내보내기 켬(종전), 아카이브 끔. manifest `csvFormulaGuard:false` |
| R11 | ArchUnit이 보존 서비스 전체를 예외 처리 | 오버로드별 메서드 단위 허용 목록 + `DROP TABLE` 문자열 소스 검사 |
| R12 | 롤백 SQL에 시드 삭제가 없음 | V69 머리 주석 + 설치 가이드 §8 롤백 |

### 이 반영으로 §4(설계와 달라진 점)에서 바뀐 것
- **§4 #5 철회**: RUNNING 행을 두지 않았던 결정을 되돌렸다 — 코덱스 R4의 소유권 확인에 원장 행이 필요했다(설계 §8 원안 "진행 중 행 → FAILED(ABANDONED)"로 복귀).
- **§3 S1 "무덮어쓰기"**: `-rN` 선택 + ATOMIC_MOVE → 하드 링크 게시로 바뀌었다.
- **§6 #5(CSV 수식 방어 긴장)** 해소 — 아카이브는 방어를 끈다.

### 테스트(반영 후, 실제 실행)
- 아카이브 관련 단위·아키텍처 **104건** + IT **11건** = 115건 — **112 통과 · 3 skip**(윈도우 심볼릭 링크 생성 불가 3건).
- IT `ApmColdArchiveIT` 11건(실 PG, 3.7초): 기존 5 + R1(손상 설정 3종 각각 보존 중단) · R2(트리거로 해제 실패 → enabled 유지) · R3(락 보유 중 삭제 대기 → 해제 후 완료 → 재보류) · R7(루트 밖 원장 경로 거절·원장 불변) · R9(HOLD_EXPIRED·SOURCE_EXPIRED 3회 → 각 1행) · R4(같은 날 RUNNING 1개).
- 꺼진 상태 불변 재확인: 원본 메서드 diff 삭제 0줄, `ApmRetentionArchiveGateTest.Off`·`ApmPartitionDropGuardTest`·`ApmBatchJobTest`·`ApmRetentionNormalizationTest`·`ApmRetentionPolicyTest`·`ApmRetentionJobIT`(12)·`ApmSchemaIT`(20) 통과.
- 관련 묶음 433건 중 실패 1 = `LicenseArchitectureTest.A5-c`(master 동일).

### FE 계약 변경점(추가만)
`RUNNING` 상태 · 삭제 결과 `rejected[]` · `ARCHIVE_FILE_REJECTED` · 삭제/검사 락 대기(타임아웃 ≥60초) · manifest `csvFormulaGuard:false` · 손상 설정 경고(`warnings[0]`). 계약 §9.

### 8.1 코덱스 v2 재검수 반영 (N1~N5) + FE 요청

R2·R4·R5·R8~R12는 v2에서 닫혔고, 부분이던 R1·R3·R6·R7에서 나온 N1~N5를 반영했다(정본: 인계서 `## 검수 결과(코덱스 v2)`).

| # | 무엇이 남아 있었나 | 이제 |
|---|---|---|
| N1 | 설정 행의 오타 키(`maxHoldDay:0`)가 무시돼 기본 7일로 지움 | 허용 키 밖이면 손상 → 보존 정지, `SETTINGS_INVALID` 경고 |
| N2 | 판정기가 단계 시작 시 설정·보류를 스냅샷 → 낡은 정책으로 DROP·끈 뒤 보류 재오픈 | 설정 락(공유/배타) + 날짜 락 안에서 설정·보류·원장·실물 재조회, 설정 저장과 직렬화 |
| N3 | advisory lock 무한 대기, 검사·삭제의 파일 I/O가 락 아래 | try-lock 한도(보존 30초 → 보류 `LOCK_TIMEOUT`, 관리자·게시 60초 → `ARCHIVE_BUSY`), SHA는 락 밖 + CAS, 파일 삭제는 커밋 뒤 |
| N4 | partial 청소·게시 롤백 삭제가 경로 정책 우회 | `deletePartialSafely`(runId 대조·부모 실경로·허용 루트)·`deleteManagedFile` |
| N5 | 봉인에 기한 없음 | 봉인 여유(3분·크기 비례) 모자라면 봉인 안 함 → `DEFERRED`, 재읽기·SHA 8MB마다 기한 확인 |

**FE 요청 반영**: `warnings` → `{code, message, params}`, `settingsState`, 상태 EP 시각 epoch ms(`JobInfo`). 계약 §9.1.

**테스트(v2 반영 후)**: 관련 묶음 576건 실패 0(skip 4 = 윈도우 심볼릭 링크). 아카이브 관련 124건, IT `ApmColdArchiveIT` 15건(실 PG).

### 8.2 🔴 별도 이슈 — 설정 › 스케줄러 EP의 시각 표기 (이번 범위 밖)
- `SchedulerSettingDto.nextRunAt`·`updatedAt`·`SchedulerRunLogDto.startedAt`은 **서버 기본 시간대의 `LocalDateTime`**을 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`로 직렬화한다 — 리터럴 `Z`가 붙지만 UTC가 아니다. 운영 컨테이너는 `-Duser.timezone=UTC`라 맞고, KST로 도는 dev·설치본에서는 9시간 어긋난다(FE 지적, 계약 FE 요청 #3).
- 이번 작업은 아카이브 상태 EP만 epoch ms `JobInfo`로 바꿔 피했다. 스케줄러 EP 자체를 고치면 설정 › 스케줄러 화면 계약이 바뀌므로 별도 티켓으로: `Instant`(UTC ISO) 또는 epoch ms로 정정 + FE 동반 수정.

### 8.3 FE 검수 R9 대응 — 시스템 알람 규칙 보호
- `ARCHIVE_HOLD` 규칙의 삭제·임계/창 변경을 `APM_ALERT_RULE_PROTECTED`(400)로 거절하고 켜기/끄기만 허용한다. 지우면 "보류 첫날부터 알람"(Q2)이 조용히 사라지는 구멍이었다.
- `STUCK_REQUEST`는 확인 결과 **보호하지 않는다**(기존 동작 그대로): 같은 "서버 판정" 종류지만 임계(ms)가 사용자 설정값이고(V67 "화면에서 바꾼다") 서비스별 규칙도 만들 수 있다.
- 테스트 2건 추가(삭제 거절 + 임계/창 거절, 토글 허용), 알람 패키지 180건 통과.

### 8.4 코덱스 v3 재검수 반영 (M1~M4)
| # | 남아 있던 것 | 이제 |
|---|---|---|
| M1 | 설정 부분 수정의 기준값을 배타 락 밖에서 읽어 동시 저장이 서로를 덮음 | 락 → 재조회 → 병합·검증 → 저장 → 보류 해제(한 트랜잭션) |
| M2 | 설정 락 시간 초과 분기가 락 없이 보류를 기록 → 끄기와 엇갈리면 닫힌 보류 재오픈 | 설정 락 실패 시 보류 미기록(지우지만 않음), 상태 EP 일시 경고 `LOCK_TIMEOUT` |
| M3 | 기한 확인이 8MB마다만 — 작은 파일·마지막 구간은 기한을 넘겨도 봉인 성공 | EOF·`verify`/`sha256Of` 반환 직전 확인 |
| M4 | 설정 락 30초 + 날짜 락 30초 = 날짜당 60초 | 날짜당 절대 기한 하나(30초) |

테스트: 관련 묶음 584건 실패 0(skip 4), IT 17건.

### 8.5 코덱스 v4 재검수 반영 (P1~P4)
| # | 남아 있던 것 | 이제 |
|---|---|---|
| P1 | `ARCHIVE_HOLD` 임계를 `resync THEIRS`로 바꿀 수 있는 우회 | THEIRS 거절(`APM_ALERT_RULE_PROTECTED`), OURS 허용 |
| P2 | M1 동시 저장 IT가 `sleep(500)`에 의존 | 테스트 훅 latch로 두 저장의 락 진입을 확인 후 해제. 옛 구현으로의 변이에서 실제로 실패함을 확인 |
| P3 | M3 테스트가 시작 검사에서 이미 만료돼 EOF·반환 직전 경계를 안 밟음 | 단계별 시계로 `sha256Of`·`verify` 각각 EOF·반환 직전 분리 테스트 4건 |
| P4 | 설정 배타 락·트랜잭션을 쥔 채 경로 실검사(파일 I/O) | 실검사는 락 밖에서 먼저, 락 안에서는 입력 대조만(불일치 시 재검사 최대 3회) |

테스트: 관련 묶음 592건 실패 0(skip 4), IT 17건.
