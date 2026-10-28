# 검수 요청 — APM 콜드 아카이브 BE (ZM-156 S1·S2·S3 + S5 옵트인)

- 요청: Claude · 2026-10-01 · 사용자 지시 "ZM-156 APM 콜드 아카이브 BE 구현 — S1·S2·S3 + S5 옵트인 스위치, 설계서 정본"
- 대상: 워크트리 **`C:\worktrees\zm-156-be`**(브랜치 `ZM-156-be`, master `d2b42c8` 기준) — 🔴 **미커밋**(사용자 승인 대기). 본체 `C:\solutions\moveseye-be-spring`은 건드리지 않았다
- 정본: 설계 [`./devdesign_apm-cold-archive.md`](devdesign_apm-cold-archive.md)(§10 결정 Q1·Q2·Q3·Q4·Q7·Q8·Q11) · 공통 기반 [`../../platform/data-archiving/devdesign_data-archiving.md`](../../platform/data-archiving/devdesign_data-archiving.md) §3~§6
- 계약 [`./contract_apm-cold-archive.md`](contract_apm-cold-archive.md) · 보고 [`./zm-156_be-cold-archive.md`](zm-156_be-cold-archive.md)(바꾼 파일 표·테스트 출력·설계와 달라진 점)
- 마이그레이션 **V69**(`V69__archive_ledger_apm_cold_archive.sql`) — 테이블 3개 추가 + 시드 2행(스케줄러 `apm_archive`, 알람 규칙 `ARCHIVE_HOLD`). 기존 표 무변경

## 범위 (한눈에)

| 단계 | 무엇 | 위치 |
|---|---|---|
| **S2** DROP 게이트 | `PartitionDropGuard` + `ApmPartitionService.dropExpired(table, days, guard)` 오버로드(원본 메서드 **무수정**) · 보존 서비스의 3단계(메트릭·트레이스 파티션·SLO 스냅샷)가 `isActive()`일 때만 게이트 경로 · `ApmArchiveDropGate`(판정 표 §5.3) · 보류 장부 `apm_archive_hold` · 보존 잡 요약 `archiveHeld=N`(0이면 생략) | `premium/apm/core/batch/{partition,retention,archive}` |
| **S1** 공통 기반 | 원장 `archive_file`(부분 유니크 OK 1개) · `ArchiveLedger` · `ArchiveWriter`(ZIP·manifest·checksums·재읽기 검증·`.partial`→원자적 이동·`-rN` 무덮어쓰기·part 롤링) · `ArchivePathPolicy`(R0~R6 + 실검사·마운트 판정) · `archive_setting` · 공통 EP `/archives`(목록·상세·다운로드·삭제·선택 삭제·무결성·설정·연결 테스트) | `com.dmove.moveseye.archive..`(premium 밖) |
| **S3** 배치·소스 | `ApmArchiveJob`(00:50, `requiresActiveLicense=false`) · `ApmArchiveService`(대상 날짜 §4.3·시간 예산·NO_SPACE 중단·SOURCE_EXPIRED·false-green 금지) · `ApmArchiveSource`(REPEATABLE READ·파티션 이름 직접 읽기·`select *` 메타 기반 열·UTC ISO+epoch·자기 완결 사전 services/hist_bounds/slos) · APM 설정·상태·보류·실행 EP · 보류 알람 `ARCHIVE_HOLD` | `premium/apm/archive/` · `premium/apm/alert/*` |
| **S5** 옵트인 | `metric1m`(CSV)·`span`(JSONL) 데이터셋 — 기본 미선택, 선택 시 용량 경고 문구, 스팬 `attrs/events/links` 마스킹(기본 켬, `ApmSqlPolicy.MASKED` 재사용) | 같은 곳 |
| 인프라 | `bitbucket-pipelines.yml` BE `docker run`에 `-e ARCHIVE_ALLOWED_ROOTS=/data/archive -v /data/moveseye-archive:/data/archive`(+`mkdir -p`) · 설치 가이드 §4-4·§5-1·§9 | 레포 · `moveseye-docs/operations/설치-배포-가이드.md` |

## 의도 — 고른 것과 버린 대안

1. **게이트 경로 진입 조건 = `isActive()` 한 번 → false면 원래 코드 그대로**. "항상 게이트 경로 + DISABLED면 허용"도 동작은 같지만, 그러면 꺼진 설치본도 판정기 생성·원장 조회를 매일 돈다. 원래 호출을 **그대로 남기는 편**이 "꺼진 상태 불변"을 diff로도 테스트로도 증명하기 쉽다(`ApmRetentionArchiveGateTest.Off`).
2. **원본 `dropExpired(String,int)`·`dropExpired(List)`를 리팩터링하지 않고 오버로드를 옆에 복제**(루프 15줄). 공통 루프로 합치면 "바이트 불변"이 리뷰어의 눈에 달린다. 대신 `ApmPartitionDropGuardTest`가 같은 카탈로그를 두 경로에 주고 **실행 DDL이 같은지** 비교한다.
3. **게이트 인터페이스를 retention 패키지에 둠**(`ApmRetentionDropGate`) — 설계 §5.3은 archive에 두었으나 아카이브가 보존 일수(`ApmRetentionDays`)를 읽어야 해 패키지 순환이 된다. 보존은 자기 인터페이스만 알고 아카이브가 구현(의존은 archive→retention 한 방향, ArchUnit으로 고정).
4. **배치·소스·화면은 `premium/apm/archive/`(메뉴), 게이트·데이터셋·설정·보류 장부·알람 측정은 `core/batch/archive/`** — 스팬 마스킹이 `trace.ingest.ApmSqlPolicy`(메뉴)를 써서 core에 두면 규칙 ③ 위반.
5. **기능 스위치는 `archive_setting(APM).enabled` 하나, 스케줄러 행은 시드 TRUE**. 설계 §4.4(가)의 "스케줄러 enabled=false 기본"을 따르면 스위치가 둘이 되고, "기능만 켜고 스케줄러는 꺼진" 조합이 조용히 보류만 쌓는다. 켜기는 검증 EP를 통과해야만 가능하고, 스케줄러가 꺼지면 상태 EP가 배너를 준다.
6. **보류 알람 = 새 kind `ARCHIVE_HOLD`(시스템 축, `isCollectorScoped()`에 포함)** — 기존 STUCK_REQUEST·SLO_BURN처럼 "우리가 판정하고 >0을 민다". 기능이 꺼져 있으면 평가 배치가 대상을 만들지 않아 꺼진 설치본의 Zabbix에 아이템이 생기지 않는다. 평가 서비스엔 **세터 주입**(기존 생성자 조립 테스트 무수정).
7. **감사 = 로그**(Q8): `[APM-ARCHIVE] action=write|write-failed|hold-expired|continue-policy|settings|disable|download|delete …`. `ApmExportService.logSafe`를 `common/util/LogSafe`로 승격(그 주석의 "두 번째 소비자" 조건 충족, 규칙 동일·기존 메서드는 위임).
8. **RUNNING 원장 행을 두지 않음** — 크래시는 다음 회차 시작 시 1시간 넘은 `.partial` 청소(`abandoned=N`)로 처리. 진행 중 행을 넣으면 부분 유니크·게이트 조회에 상태가 하나 더 끼고 크래시 후 정리 책임이 생긴다.
9. **권한 = 관리자 판정**(`ArchiveAdminAccess`, `ReportAdminAccess`와 같은 모양). 기반 설계의 `DmovePermissions.archive` 기능 권한은 역할 편집·FE 게이팅까지 번져 1차 제외.

## 🔴 중점 확인 요청

1. **게이트 우회 경로** — (a) `ApmArchiveGateArchTest.onlyRetentionServiceDropsPartitions`가 `ApmPartitionService.dropExpired(…)` 호출처를 보존 서비스로 고정하는데, 리플렉션·다른 이름의 DROP(예: `ApmPartitionService` 안에 새 메서드)까지는 못 막는다. 충분한가? (b) 보존 서비스 안에서 **RUM·메시징은 판정 없는 경로 그대로**다(대상 데이터셋 아님). 데이터셋 표에 파티션 데이터셋을 늘릴 때 `dropExpired*Partitions`에 그 테이블이 없으면 `everyPartitionDatasetIsGated`가 실패하는지(지금은 5종 중 파티션 4종 전부 확인). (c) SLO 스냅샷 게이트 경로가 **같은 트랜잭션**에서 보류 기록 실패 시 전부 롤백되는지(`ApmRetentionService.deleteOldSloSnapshotsGated`).
2. **fail-closed** — `isActive()`·`guardFor()`·`touch()`·`recordHoldExpired()` 실패가 전부 "던짐 → 지우지 않음"인가. 특히 `ApmArchiveHoldProbe.active()`는 알람 쪽이라 **실패 시 true**로 본다(값은 empty라 실제로 울리지 않음) — 이 비대칭이 맞는가.
3. **경로 검증** — `ArchivePathPolicy.violation`의 R2(정규화 비교에 원문 끝 구분자 제거 후 비교)·R4(없는 경로는 가장 가까운 기존 조상의 실경로)·R6(LOG_PATH 미설정 시 `./logs` 기준). 실검사 후 `toRealPath`로 다시 루트 안인지 본다. TOCTOU(검사 후 심볼릭 링크 교체)는 배치가 매 회차 `check()`를 다시 돌지만 그 사이 창은 남는다.
4. **원자적 이동·무덮어쓰기** — `ArchiveWriter.Session.finish`: 리눅스 `ATOMIC_MOVE`(rename)는 대상이 있으면 **덮어쓴다**. `freeName`로 직전에 빈 이름을 고르지만 같은 디렉터리에 동시에 쓰는 다른 프로세스가 있으면 경합이 남는다(리스로 잡 단위 직렬화에 기댄다). 비원자 강등 경로는 `REPLACE_EXISTING` 없이 이동 + 이동 후 SHA-256 재대조.
5. **멱등성** — (a) OK+실물 있음은 건너뜀, OK인데 실물 없음은 **다시 만들어 SUPERSEDED로 교체**(`plan`). (b) 원장 기록 실패 시 방금 만든 파일 삭제(`ApmArchiveService.record`). (c) SOURCE_EXPIRED는 키당 한 번. (d) 같은 날 두 회차가 겹치면(리스 만료 등) 부분 유니크가 OK 두 개를 막지만, 두 번째 회차는 `recordOk`에서 첫 OK를 SUPERSEDED로 내린다 — 파일 둘이 남는 건 의도(덮어쓰기 금지)인지.
6. **일관성** — `ApmArchiveSource.writeInTx`: `JpaTransactionManager` + `TransactionTemplate(REPEATABLE_READ, readOnly)` 안에서 `to_regclass` → `count(*)` → `select *`(별도 `JdbcTemplate` fetchSize) → 사전. 파티션을 **이름으로** 읽어 ACCESS SHARE 잠금이 걸리므로 보존 DROP이 트랜잭션 끝까지 기다린다는 가정. 1m 하루(1,400만 행) 소요는 **미측정**(설계 §12 리스크 4).
7. **꺼진 상태 불변** — `ApmRetentionArchiveGateTest.Off`(5건)·`ApmPartitionDropGuardTest.allowAllMatchesOriginalBytes` + 기존 `ApmBatchJobTest`·`ApmRetentionNormalizationTest`·`ApmRetentionPolicyTest`·`ApmRetentionJobIT`를 **수정 없이** 통과. 꺼진 상태에서 늘어난 일은 보존 단계당 `archive_setting` SELECT 1회(3회/일)뿐 — 이것도 "불변"으로 볼지.
8. **CSV 수식 주입 방어가 값을 바꾼다** — 공통 `CsvTabularWriter`가 `= + - @`로 시작하는 텍스트 칸 앞에 `'`를 붙인다(ZM-154 결정). 아카이브는 "되살릴 수 있게"가 원칙이라 이 변형이 맞는지(manifest `format.csvFormulaGuard`에 명시만 했다). 대안: 아카이브는 CSV 방어를 끄는 옵션을 작성기에 추가.

## 검증 현황

- 새 테스트 83건(82 통과·1 skip = 윈도우 심볼릭 링크 R4) — 보고서 §5.2. 전체 `:test` 4351건 중 실패 4 = A5-c(master 동일) + `ApmCollectorLiveRuntimeTest` 3(윈도우 파일 잠금, 단독 재실행 통과). 새 테스트: `ApmRetentionArchiveGateTest` · `ApmPartitionDropGuardTest` · `ApmArchiveDropGateTest` · `ApmArchiveGateArchTest` · `ArchiveWriterTest` · `ArchivePathPolicyTest` · `ApmArchiveServiceTest` · `ApmArchiveSourceTest` · `ApmArchiveAdminServiceTest` · `ApmAlertKindArchiveHoldTest`.
- IT `ApmColdArchiveIT`(도커 PG 5433) — 꺼짐=예전대로 DROP / 켜짐: 보류 → 아카이브(ZIP·manifest·사전·마스킹) → 멱등 → 다음 정리 DROP+보류 해제 → EP(목록·다운로드 바이트 일치·상태·사유 필수 삭제) / 보류 기한 초과 HOLD_EXPIRED / 비관리자 403 / 허용 루트 밖 거절.
- 수정한 기존 테스트: `ApmSchemaIT`의 스케줄러 job_key 목록에 `apm_archive` 추가(1줄).
- ⚠️ `LicenseArchitectureTest.A5-c`는 **master에서도 실패**한다(`ApmOtlpController.receiveTraces`, 이 작업과 무관) — 보고서 §5 근거.
- 미검증: 런타임(실제 BE 기동·화면)·NFS·컨테이너 볼륨 판정 실측·1m/스팬 용량·다중 노드 겹침(설계 S6).

---

## 검수 결과(코덱스 v1) — 2026-10-01 반영

- 검수: [`review_zm-156-be-cold-archive_codex.md`](../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive_codex.md) — 판정 "수정 후 재검수", 필수 R1~R10 + 권장 R11·R12. **12건 전부 반영**(같은 워크트리, 미커밋). 마이그레이션 번호 V69 유지(미커밋이라 같은 파일 수정).

| # | 상태 | 반영 내용 | 위치 · 테스트 |
|---|---|---|---|
| R1 | [x] | 설정 해석을 엄격화 — **행이 없을 때만** 기본(꺼짐). 행이 있으면 `enabled`(Boolean)·`targets`(아는 키 목록, 켜졌는데 비면 오류)·`maxHoldDays`(0~365 정수)·`maskRawText`·`onFailure`·`backfill`을 검사해 틀리면 `InvalidSettings` → 게이트 `isActive/guardFor`·배치가 던짐(보존 단계 실패, 지우지 않음). 화면(GET settings/status)만 관대하게 기본값 + 경고 `warnings[0]`로 띄우고 다시 저장해 고칠 수 있다 | `ApmArchiveSettings.fromStored` · `ApmArchiveSettingsService.current` · `ApmArchiveAdminService.safeCurrent` / `ApmArchiveDropGateTest.corruptSettingsThrow·corruptSettingsStopGate` · `ApmArchiveServiceTest.corruptSettingsThrow` · `ApmArchiveAdminServiceTest.corruptRowCanBeRepaired` · **IT `corruptSettingsStopRetention`**(`{"enabled":"true"}`·오타 대상·빈 대상 각각 보존 중단, 파티션 남음) |
| R2 | [x] | 검증 뒤 `settingsService.save` + `holds.releaseAll`을 **한 `TransactionTemplate`**로. 끄는 저장이면 항상 해제(손상 행에서 끄는 경우 포함) | `ApmArchiveAdminService.update` / `ApmArchiveAdminServiceTest.disableIsAtomic`(해제 실패 → rollback, commit 0) · **IT `disableRollsBackWhenReleaseFails`**(트리거로 해제 실패 → `enabled` 그대로 true) |
| R3 | [x] | **`pg_advisory_xact_lock(hashtext('moveseye-archive'), hashtext('APM|dataset|day'))`**(`ArchiveDayLock`, 트랜잭션 밖 호출은 던짐). 판정 DROP은 **날짜마다 한 트랜잭션**: 게이트가 락을 잡고 원장 OK·실물을 **그 자리에서 다시 읽고**(단계 시작 시 미리 읽던 OK 맵 제거) → DROP → 보류 해제 → 커밋. SLO 경로는 기존 `@Transactional` 안에서 같은 락. 관리자 삭제(원장 재조회→관리 파일 검사→DELETED→파일 삭제)·무결성 검사·게시+원장 OK도 같은 락. 다운로드는 읽기만이라 락 없음(삭제가 락을 잡으므로 지워진 파일은 MISSING) | `ArchiveDayLock` · `ApmArchiveDropGate.TableGuard.mayDrop` · `ApmPartitionService.dropExpired(…, guard)`(세터 주입 트랜잭션) · `ArchiveFileService.deleteAll/verify` · `ApmArchiveService.publish` / `ApmArchiveDropGateTest.locksThenReadsFresh·fixedDecisionsDoNotLock` · **IT `deleteSerializesWithDayLockAndReholds`**(락 보유 중 삭제 700ms 미완료 → 해제 후 완료, 이어 보존 정리는 재보류) |
| R4 | [x] | partial 이름 `{파일명}.{runId}.partial`(UUID), **`CREATE_NEW`+`NOFOLLOW_LINKS`**, 열 때 기존 partial **삭제 안 함**. 원장 **`RUNNING`** 행(부분 유니크 `uq_archive_file_running`, `run_id` 열) = 그 날의 소유권 — 이미 있으면 그 날은 건너뜀(이월). 청소는 ① 60분 넘은 RUNNING → `FAILED(ABANDONED)` + 그 partial만 ② RUNNING 행이 없는 실행의 60분 넘은 partial만. 살아 있는 실행의 partial은 나이 무관 보존 | `ArchiveWriter.open/listPartials/deletePartial` · `ArchiveLedger.startRunning/completeOk/failRunning/dropRunning/abandonStale/runningRunIds` · `ApmArchiveService.cleanupAbandoned` / `ArchiveWriterTest.partialsAreUniquePerRunAndNeverDeletedOnOpen` · `ApmArchiveServiceTest.otherRunningRunSkips·cleanupOnlyOwnerlessPartials` · IT `runningIsUniquePerDay` |
| R5 | [x] | 게시를 **하드 링크(`createLink`, 대상이 있으면 원자적 실패)**로 — 충돌이면 `-rN` 재예약 재시도. 하드 링크 미지원 FS면 존재 재확인 후 `ATOMIC_MOVE`(락 직렬화에 기댐), 그것도 미지원이면 비교체 이동 + 해시 재대조. 게시~원장 OK는 R3 락 안 한 트랜잭션 | `ArchiveWriter.Sealed.publish/publishNoReplace` · `ApmArchiveService.publish` / `ArchiveWriterTest.neverOverwrites·publishNoReplaceRefusesExistingTarget·publishReReservesWhenNameAppears` · `ApmArchiveServiceTest.publishesUnderDayLock` |
| R6 | [x] | 소스에 `deadlineMs` 전달 — ① 트랜잭션 첫 문장 `set local statement_timeout = 남은 ms`(count·커서가 예산을 넘으면 PG가 끊음, 57014) ② 1만 행마다 시계 확인 → `DEFERRED`(partial 폐기, RUNNING 행 삭제, 남은 항목 이월, 실패 아님) ③ 봉인 후 시작+28분(하드 스톱)을 넘겼으면 게시하지 않고 버림. 예산 상한 25 < 하드 스톱 28 < 리스 TTL 30 < 크래시 정리 60을 테스트로 고정. 스케줄러에 heartbeat가 없어 연장 대신 "리스 만료 전 반드시 중단" 쪽 | `ApmArchiveSource.export/writeInTx/stream` · `ApmArchiveService.run` / `ApmArchiveServiceTest.deferredMidStreamIsNotFailure·deadlinePassedToSource·hardStopDiscards` · `scheduler/ArchiveLeaseBudgetTest` |
| R7 | [x] | `ArchivePathPolicy.checkManagedFile` — 절대·정규화 · 이름 `moveseye-{source}_{dataset}_{yyyy-MM-dd}[-rN].zip` · 파일 자신이 링크 아님 · NOFOLLOW 일반 파일 · 실경로 = 절대경로(부모 링크 없음) · 실경로 ⊂ 현재 허용 루트. 다운로드·검사는 위반이면 `ARCHIVE_FILE_REJECTED`(원장 불변 + `[소스-ARCHIVE] action=…-rejected` 감사 로그), 삭제는 결과 `rejected[]`에 담고 원장 불변. 게이트·계획의 "실물 있음"도 같은 검사 | `ArchivePathPolicy` · `ArchiveFileService` · `ApmArchiveDropGate` · `ApmArchiveService.plan` / `ArchivePathPolicyTest.managedFileCheck·managedFileRejectsSymlink` · **IT `ledgerPathOutsideRootRejected`**(루트 밖 파일: 다운로드 REJECTED·삭제 rejected·파일·원장 그대로) |
| R8 | [x] | 작성기가 검증된 basePath **실경로** + 세그먼트 목록을 받아 세그먼트마다 링크·비디렉터리 거절 후 `createDirectory`, 최종 실경로가 기대와 같은지 확인. 게시 직전 디렉터리 실경로를 연 시점 값과 재대조(다르면 게시 안 함). `SecureDirectoryStream`은 윈도우 미지원이라 미사용(재대조로 창을 닫음) | `ArchiveWriter.ensureDirectoryNoFollow` · `Sealed.publish` / `ArchiveWriterTest.symlinkedSegmentRejected·badSegmentsRejected` |
| R9 | [x] | V69에 부분 유니크 `uq_archive_file_hold_expired`·`uq_archive_file_source_expired`(+`uq_archive_file_running`). `ensureHoldExpired`·`ensureSourceExpired` = `INSERT … ON CONFLICT (source,dataset,period_day) WHERE status='…' DO NOTHING`(기존 행도 성공). HOLD_EXPIRED는 DROP과 같은 트랜잭션이라 DROP 실패 시 함께 롤백 | V69 · `ArchiveLedger.insertOnce` / **IT `terminalRecordsAreIdempotent`**(3회 → 각 1행) |
| R10 | [x] | `TabularWriter.open(…, csvFormulaGuard)` 옵션 — 기존 4인자(ZM-154 내보내기)는 **종전대로 켬**, 아카이브 작성기는 **끔**. manifest 최상위 `csvFormulaGuard:false`, `format.csvText` 문구 | `CsvTabularWriter` · `TabularWriter` · `ArchiveWriter` · `ApmArchiveSource` / `CsvFormulaGuardOptionTest`(두 경로) · `ArchiveWriterTest.archiveCsvKeepsFormulaLikeValues` · 기존 `CsvTabularWriterTest` 무수정 통과 |
| R11 | [x] | ArchUnit을 **메서드 단위 허용 목록**으로: 무판정 `dropExpired(String,int)`·`(List)` = 보존 서비스 4개 단계 메서드 + 파티션 서비스 자신, 판정 오버로드 = `dropGated`만. 소스 검사로 `DROP TABLE`(대소문자 무시) 문자열은 `ApmPartitionService.java`에만 허용. ⚠️ 무판정 API를 package-private로 좁히지는 않았다 — 보존 서비스가 다른 패키지이고, 꺼진 경로를 "예전 호출 그대로" 두는 것이 S2 불변 증거의 핵심이라서(메서드 단위 규칙이 같은 효과) | `ApmArchiveGateArchTest.dropExpiredCallSitesAreMethodScoped·dropTableSqlOnlyInPartitionService` |
| R12 | [x] | 롤백 SQL(시드 `job_key`·`rule_uid` 삭제 → 인덱스·테이블 역순 → flyway 이력)을 V69 머리 주석과 설치 가이드 §8 롤백에 | V69 · `moveseye-docs/operations/설치-배포-가이드.md` §8 |

### 재검수 때 볼 점(반영하며 생긴 것)
1. **꺼진 상태 불변은 유지된다**: `ApmPartitionService`·`ApmRetentionService` diff에 삭제 줄 0(원본 메서드 무수정). 판정 오버로드만 날짜별 트랜잭션이 됐다. `ApmRetentionArchiveGateTest.Off`·`ApmPartitionDropGuardTest`·기존 `ApmBatchJobTest`·`ApmRetentionNormalizationTest`·`ApmRetentionJobIT` 무수정 통과.
2. **판정 DROP이 트랜잭션 안의 DDL**이 됐다 — 부모 테이블 ACCESS EXCLUSIVE가 그 날짜 트랜잭션 커밋까지(DROP 직후 커밋이라 짧다). 락 대기 중인 관리자 삭제는 그만큼 늦다.
3. **advisory lock 키 해시 충돌**은 직렬화가 늘 뿐 정확성 문제 없음. 락은 트랜잭션 락이라 크래시·연결 끊김에 자동 해제.
4. **R6 하드 스톱 후 버린 날**은 다음 회차가 처음부터 다시 만든다(1m 하루가 예산 안에 영영 안 끝나면 매일 이월 → 보류 → 기한 후 HOLD_EXPIRED). 이 경우의 대책(데이터셋 단위 분할 실행)은 실측(S6) 뒤.

### 검증(코덱스 v1 반영 후)
- 아카이브 관련 단위·아키텍처 테스트 104건 + IT 11건 = **115건, 112 통과·3 skip**(윈도우에서 심볼릭 링크 생성 불가 — R4 경로 정책·R7 파일 링크·R8 세그먼트 링크. 리눅스에서 돈다).
- 관련 묶음(`alert.*`·`license.*`·`otel.*`·`core.batch.*`) 433건 중 실패 1 = `LicenseArchitectureTest.A5-c`(master에서도 실패, 무관). `ApmSchemaIT` 20·`ApmRetentionJobIT` 12 통과.

---

## 검수 결과(코덱스 v2) — 2026-10-01 반영

- 검수: [`review_zm-156-be-cold-archive-v2_codex.md`](../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive-v2_codex.md) — 판정 "수정 후 재검수". R2·R4·R5·R8~R12 닫힘, R1·R3·R6·R7 부분 → 새 필수 N1~N5. **N1~N5 전부 반영**(같은 워크트리, 미커밋, V69 유지). 같은 회차에 FE 요청 3건(구조화 경고·`settingsState`·상태 EP 시각)도 반영.

### R1~R12 판정(코덱스 v2)
| R# | v2 판정 | 이번 처리 |
|---|---|---|
| R1 | 부분 | → **N1**로 닫음(모르는 키 거절) |
| R2 | 닫힘 | 설정 락(N2)이 같은 트랜잭션에 더해졌다 |
| R3 | 부분 | → **N2**(설정·보류를 락 안에서 재조회, 설정 저장과 직렬화) + **N3**(제한 대기) |
| R4·R5·R8·R9·R10·R11·R12 | 닫힘 | — |
| R6 | 부분 | → **N5**(봉인 기한·여유 예약) |
| R7 | 부분 | → **N4**(partial·게시 롤백 삭제도 경로 정책 경유) |

### N1~N5
| # | 상태 | 반영 내용 | 위치 · 테스트 |
|---|---|---|---|
| N1 | [x] | 허용 키 집합 `ALLOWED_KEYS = {enabled, targets, maskRawText, onFailure, maxHoldDays, backfill}`(= `toOptions` 키). 저장 행의 `keySet − ALLOWED_KEYS`가 비어 있지 않으면 `InvalidSettings(key=그 키들)` → 보존·아카이브 정지, settings/status는 `settingsState:"INVALID"` + `warnings[{code:SETTINGS_INVALID, params.key}]` | `ApmArchiveSettings.fromStored` / `ApmArchiveDropGateTest.unknownKeyRejected` · **IT `typoKeyStopsRetention`**(`maxHoldDay:0` → 보존 중단·파티션 유지·status 경고) |
| N2 | [x] | 보존 날짜 트랜잭션에서 ① **설정 락 공유**(`pg_try_advisory_xact_lock_shared('settings|APM')`) ② 날짜 락 → 그 안에서 **설정·열린 보류(`openHold`)·원장 OK·실물을 지금 읽어** 판정. 판정기의 단계 시작 스냅샷(설정·보류 맵) 제거. APM 설정 저장은 같은 트랜잭션에서 **설정 락 배타**를 먼저 잡고 저장+보류 해제. 순서는 항상 설정 락→날짜 락(교착 없음) | `ArchiveDayLock.tryLockSettingsShared/lockSettingsExclusive` · `ApmArchiveDropGate.TableGuard.mayDrop` · `ApmArchiveAdminService.update` / `ApmArchiveDropGateTest.locksThenReadsEverythingFresh·policyChangeAfterGuardCreationIsSeen` · `ApmArchiveAdminServiceTest.disableIsAtomic`(락→저장→해제→롤백 순서) · **IT `policyChangeDuringStageIsHonored`**(판정기 생성 뒤 무기한 보류로 변경 → 만료 대신 보류) · **IT `settingsSaveWaitsForRetentionDay`**(공유 락 보유 중 저장 700ms 미완료 → 해제 후 완료) |
| N3 | [x] | 모든 advisory lock을 **`pg_try_advisory_xact_lock` 100ms 폴링 + 한도**로: 보존 30초(넘으면 지우지 않고 보류, 사유 `LOCK_TIMEOUT` — `apm_archive_hold.last_reason`), 관리자 작업·게시 60초(넘으면 `ARCHIVE_BUSY` 409 / 게시는 봉인본 폐기 후 이월). `SET lock_timeout` 대신 try-lock을 쓴 이유: 시간 초과가 트랜잭션을 깨지 않아 같은 트랜잭션에서 보류를 기록할 수 있다. 무결성 검사는 **락 밖에서 SHA** → 락 안에서 상태·경로·크기 CAS(바뀌었으면 `ARCHIVE_BUSY`). 삭제는 락 안에서 원장 전이만, 파일 삭제는 커밋 뒤 락 밖 | `ArchiveDayLock` · `ApmArchiveDropGate` · `ArchiveFileService.verify/deleteAll` · `ApmArchiveService` / `ApmArchiveDropGateTest.lockTimeoutHolds` · `ApmArchiveServiceTest.publishLockBusyDefers` · `ApmArchiveAdminServiceTest.settingsLockBusy` · **IT `lockTimeoutsFailClosed`**(다른 트랜잭션이 날짜 보유 → 보존은 파티션 유지·`LOCK_TIMEOUT`, 삭제는 409 `ARCHIVE_BUSY`·원장 OK 유지 → 풀리면 다음 정리가 DROP) |
| N4 | [x] | `ArchivePathPolicy.deletePartialSafely(path, runId)` — 절대·정규화 · partial 이름 정규식 · **이름 속 runId = 원장 runId** · 파일 자신 링크 아님·NOFOLLOW 일반 파일 · **부모 실경로 = 부모 경로**(체인에 링크 없음) · 실경로 ⊂ 허용 루트 — 확인 직후 삭제. 크래시 정리 두 경로(ABANDONED 행의 partial, 고아 partial) 모두 교체(원장이 `run_id`도 돌려준다). 게시 롤백은 `deleteManagedFile`(관리 ZIP 검사 후 삭제). 작성기 자체 partial 삭제는 디렉터리 실경로가 연 시점과 같을 때만. 공개 `ArchiveWriter.deletePartial` 제거 | `ArchivePathPolicy` · `ApmArchiveService.cleanupAbandoned/publish` · `ArchiveWriter.deleteOwnPartial` / `ArchivePathPolicyTest.deletePartialSafely·deleteManagedFile` · `deletePartialRefusesSymlinkedParent`(리눅스 — 윈도우는 링크 권한 없어 `assumeTrue` skip, 사유 표시) · `ApmArchiveServiceTest.cleanupOnlyOwnerlessPartials`(삭제가 전부 정책 경유·runId 대조) |
| N5 | [x] | `ArchiveWriter.Deadline` — 봉인 시작 전 남은 시간 < `max(SEAL_RESERVE_MINUTES=3분, 파일 크기×2÷50MB/s)`이면 **봉인하지 않고 partial 폐기 → `DEFERRED`**. 재읽기 검증·SHA는 8MB마다 기한 확인. 봉인 기한 = 하드 스톱(28분). 불변식 `25(예산) + 3(여유) ≤ 28(하드 스톱) < 30(리스) < 60(크래시 정리)` 테스트 고정. ZIP close·fsync는 끊을 수 없어 시작 전 여유로만 덮는다 | `ArchiveWriter.Session.seal(manifest, deadline, reserve)` · `verify/sha256Of(…, Deadline)` · `ApmArchiveSource.export(…, sealDeadline, sealReserve)` / `ArchiveWriterTest.sealRefusesWithoutReserve·sealChecksDeadlineWhileVerifying·sealWithinDeadline` · `ApmArchiveServiceTest.deadlinePassedToSource`(하드 스톱·여유 전달) · `scheduler/ArchiveLeaseBudgetTest` |

### FE 요청(계약 `🔄 FE 요청사항`) — 같은 회차 반영
- `warnings[]`·`datasets[].warning` → `{code, message, params}`(코드 8종: 계약 §9.1). `settingsState: OK|INVALID|ABSENT`. 상태 EP의 `archiveJob/retentionJob` → `JobInfo`(epoch ms). 설정 › 스케줄러 EP의 "현지 시각 + 리터럴 Z"는 범위 밖 — 보고서 §8에 별도 이슈.

### 재검수 때 볼 점(v2 반영으로 생긴 것)
1. **try-lock 폴링**은 대기 중 커넥션 하나를 쥔다(100ms 간격 쿼리). 보존 배치는 날짜당 최대 30초 — 날짜가 많고 모두 막히면 단계가 길어진다(그래도 지우지 않는 쪽).
2. **설정 락 공유를 SLO 경로는 단계 트랜잭션 끝까지 쥔다**(SLO 정리는 단계 전체가 한 `@Transactional`). 그 동안 APM 설정 저장은 최대 60초 기다린 뒤 `ARCHIVE_BUSY`.
3. **꺼진 상태는 여전히 락·재조회 없음**: 보존 서비스는 단계 시작 시 `isActive()`가 false면 원래 경로(원본 메서드 diff 삭제 0줄). 그 순간 켜진 설정은 다음 단계부터 적용된다(켜기 직전에 시작된 무판정 DROP과의 경합은 "켜기 1초 전과 같다"로 보고 둔다).
4. N5의 처리량 가정(50MB/s)은 실측 전 상수 — S6에서 교체.

### 검증(v2 반영 후, 실제 실행)
- 관련 묶음 **576건 · 실패 0 · skip 4**(윈도우 심볼릭 링크 4건). 그중 아카이브 관련 124건(IT 15 포함).
- IT `ApmColdArchiveIT` **15건**(실 PG, 6.0초) — v1 11 + v2 4(N1·N2×2·N3). `ApmRetentionJobIT` 12·`ApmSchemaIT` 20 통과.
- `LicenseArchitectureTest.A5-c`는 이번 묶음에 넣지 않았다(master 기존 실패, 무관 — v1 때 확인).

### FE R9 대응 (2026-10-01)
- [x] 시스템 규칙 `ARCHIVE_HOLD` 보호 — 삭제·임계/창 변경(지금 값과 다를 때)을 `APM_ALERT_RULE_PROTECTED`(400)로 거절, `enabled` 토글만 허용(`ApmAlertKind.isProtected` · `ApmAlertService.update/delete`). `STUCK_REQUEST`는 임계가 사용자 설정값(V67)이고 서비스별 규칙도 있어 **대상에서 뺐다(동작 불변)**. 테스트 `ApmAlertServiceTest.archiveHoldRuleCannotBeDeleted·archiveHoldRuleToggleAllowed`, 알람 패키지 180건 통과. 계약 §9.1 #9.

---

## 검수 결과(코덱스 v3) — 2026-10-01 반영

- 검수: [`review_zm-156-be-cold-archive-v3_codex.md`](../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive-v3_codex.md). **M1~M4 전부 반영**(같은 워크트리, 미커밋).

### N1~N5 판정(코덱스 v3)
| N# | v3 판정 | 이번 처리 |
|---|---|---|
| N1 | 닫힘 | — |
| N2 | 부분 | → M1(저장 기준을 락 안에서 재조회) · M2(설정 락 실패 시 보류 미기록) |
| N3 | 부분 | → M2 |
| N4 | 닫힘 | — |
| N5 | 부분 | → M3(EOF·반환 직전 기한 확인) |

### M1~M4
| # | 상태 | 반영 내용 | 위치 · 테스트 |
|---|---|---|---|
| M1 | [x] | 저장 순서를 **트랜잭션 시작 → 설정 배타 락 → 현재 설정 재조회 → 요청 병합·검증(경로 실검사 포함) → 저장 → 보류 해제**로 옮겼다(`merge()` 분리). 검증 실패도 이 트랜잭션 안에서 던져 아무것도 남지 않는다 | `ApmArchiveAdminService.update/merge` / `ApmArchiveAdminServiceTest.disableIsAtomic`(락 → `current()` 재조회 → 저장 순서) · **IT `concurrentPartialUpdatesBothSurvive`**(두 저장이 같은 순간 줄 선 뒤 `maxHoldDays=0`·`backfill=all` 둘 다 남음) |
| M2 | [x] | 설정 공유 락을 못 얻으면 **보류 장부를 쓰지 않고** 지우지만 않는다(fail-closed). 사실은 WARN 로그와 게이트의 프로세스 메모리 `lastLockTimeout` → 상태 EP 일시 경고 `{code:"LOCK_TIMEOUT", params:{lock, table, day, at}}`(24시간). 날짜 락 실패는 설정 공유 락을 쥔 채 "켜져 있음"을 확인한 뒤라 보류 기록(`LOCK_TIMEOUT`)을 유지. 설정을 락 안에서 다시 읽어 꺼짐·대상 아님이면 날짜 락 없이 허용 | `ApmArchiveDropGate.mayDrop/lastLockTimeout` · `ApmArchiveAdminService.status` / `ApmArchiveDropGateTest.settingsLockTimeoutWritesNothing·disabledAfterSettingsLockSkipsDayLock` · **IT `disableVersusLockTimeoutDoesNotReopenHolds`**(끄기 트랜잭션이 배타 락 보유 중 보존이 시간 초과 → 파티션 유지, 커밋 뒤 열린 보류 0건) |
| M3 | [x] | 기한 래퍼가 **EOF**에서도 검사하고, `verify`·`sha256Of`는 **반환 직전**에 한 번 더 검사 | `ArchiveWriter.Deadline.wrap` · `verify` · `sha256Of` / `ArchiveWriterTest.smallInputsStillCheckDeadline`(수 KB 입력, 주입 시계로 기한 초과 → 해시·재읽기 모두 `DEFERRED`, 기한 안이면 통과) |
| M4 | [x] | 날짜당 대기 예산 **하나**(`retentionWait` 30초 절대 기한) — 설정 락에 쓴 만큼 날짜 락의 대기가 줄어든다. "날짜당 최대 30초" 가정과 일치 | `ApmArchiveDropGate.mayDrop/remaining` / `ApmArchiveDropGateTest.singleBudgetPerDay`(설정 락에 300ms 쓰면 날짜 락 한도 ≤ 29.75초) |

### 검증(v3 반영 후, 실제 실행)
- 관련 묶음 **584건 · 실패 0 · skip 4**(윈도우 심볼릭 링크). 아카이브 관련 130건, IT `ApmColdArchiveIT` **17건**(실 PG, 9.4초), `ApmRetentionJobIT` 12·`ApmSchemaIT` 20 통과. 알람 패키지(FE R9 포함) 통과.

---

## 검수 결과(코덱스 v4) — 2026-10-01 반영

- 검수: [`review_zm-156-be-cold-archive-v4_codex.md`](../../../_archive/features/apm/cold-archive/review_zm-156-be-cold-archive-v4_codex.md). M2·M4 닫힘, M1·M3·알람 보호 부분 → P1~P4(코덱스 원문 번호 P1·P1·P2·P2를 순서대로 P1~P4로 부름). **전부 반영**(같은 워크트리, 미커밋).

### M1~M4·알람 보호 판정(코덱스 v4)
| 항목 | v4 판정 | 이번 처리 |
|---|---|---|
| M1 | 부분(구현은 정확, IT가 sleep 의존) | → P2 |
| M2 | 닫힘 | — |
| M3 | 부분(구현은 됐으나 테스트가 경계를 안 밟음) | → P3 |
| M4 | 닫힘 | — |
| 알람 보호(FE R9) | 부분(resync THEIRS 우회) | → P1 |

### P1~P4
| # | 상태 | 반영 내용 | 위치 · 테스트 |
|---|---|---|---|
| P1 | [x] | 보호 규칙(`ARCHIVE_HOLD`)의 `resync?mode=THEIRS`(Zabbix 임계를 규칙에 채택 = 임계 변경 우회)를 `APM_ALERT_RULE_PROTECTED`로 거절. `OURS`(우리 정의를 Zabbix에 다시 쓰기)는 허용 | `ApmAlertService.resync` / `ApmAlertServiceTest.archiveHoldResyncTheirsRejected·archiveHoldResyncOursAllowed` |
| P2 | [x] | M1 IT에서 `Thread.sleep` 제거 — 테스트 훅 `ApmArchiveAdminService.beforeExclusiveLock`(운영 no-op)으로 **두 저장이 모두 배타 락 진입 지점에 도달한 것을 latch로 확인**한 뒤 공유 락을 푼다. 공유 락 획득 결과와 "그 시점 아무도 저장 못 함"도 단언. **변이 확인**: 기준 설정을 락 밖에서 읽도록 되돌리면 `{"bf"="all","hold"="7"}` — `maxHoldDays=0`이 7로 덮여 빨개짐을 실제로 돌려 확인 후 원복 | `ApmColdArchiveIT.concurrentPartialUpdatesBothSurvive` |
| P3 | [x] | 단계별 주입 시계(n번째 조회까지 기한 안, 그 뒤 밖)로 경계를 분리해 4건: `sha256Of` EOF 검사 · `sha256Of` 반환 직전 검사 · `verify` EOF 검사(항목 시작 검사는 기한 안) · `verify` 반환 직전 검사(모든 읽기는 기한 안). 반환 직전 경우는 기한 안 시계로 먼저 조회 횟수를 센 뒤 마지막 조회만 밖으로 둔다(구현 세부에 매이지 않게) | `ArchiveWriterTest.sha256OfChecksAtEof·sha256OfChecksBeforeReturn·verifyChecksAtEof·verifyChecksBeforeReturn` |
| P4 | [x] | 경로 실검사(쓰기·fsync·재읽기·이동·FileStore)를 **트랜잭션·락 밖**에서 먼저 수행. 락 안에서는 재조회 설정으로 병합·형식 검증 + 실검사 입력(`basePath`·`minFreeSpaceGb`)이 지금 공통 설정과 같은지만 대조 — 다르면 락을 놓고 다시 검사(최대 3회, 초과 시 `ARCHIVE_BUSY`). 배타 락 점유가 짧아져 느린 NFS에서도 보존 쪽 공유 락 대기가 실패하지 않는다 | `ApmArchiveAdminService.update/probe/mergeFields/requireEnableable` / `ApmArchiveAdminServiceTest.pathProbeRunsOutsideLock`(실검사 → 트랜잭션 → 락 → 저장 순서) · `pathChangedBetweenProbeAndLockRetries`(락 안 대조 불일치 → 새 경로로 재검사 → 저장 1회) |

### 검증(v4 반영 후, 실제 실행)
- 관련 묶음 **592건 · 실패 0 · skip 4**(윈도우 심볼릭 링크). 아카이브 관련 136건, IT `ApmColdArchiveIT` 17건(실 PG), `ApmRetentionJobIT` 12·`ApmSchemaIT` 20, `ApmAlertServiceTest` 45 통과. 변이 원복 후 아카이브 패키지 재실행 통과.

## 검수 결과(코덱스 v5) — 2026-10-01

- 대상: v4 잔여 P1~P4(resync THEIRS 보호·M1 IT 결정성·M3 테스트 경계·락 밖 실검사). 원문 `review_zm-156-be-cold-archive-v5_codex.md`.
- P1~P4 전부 닫힘, 새 결함 0. 왕복 5회(v1 12건 → v2 5건 → v3 4건 → v4 4건 → v5 승인).
- **판정: 승인.** 커밋은 사용자 승인 대기. 런타임 미실측(BE 재기동 전·NFS·리눅스 symlink skip 4건).
