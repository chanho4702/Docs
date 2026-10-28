## R1~R12 반영 판정

| R# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| R1 | 부분 | 행 없음은 기본 OFF로 분리되고 행 존재 시 주요 타입 오류는 예외 처리된다(`ApmArchiveSettings.java:51-90`). 예외도 DROP 호출 전 `archiveGate.isActive()`에서 발생한다(`ApmRetentionService.java:97-104,132-143,352-359`). 그러나 알 수 없는 옵션 키를 검사하지 않아 `maxHoldDay:0` 같은 오타가 무시되고 기본 `maxHoldDays=7`로 바뀐다(`ApmArchiveSettings.java:55-90`). |
| R2 | 닫힘 | `TransactionTemplate` 안에서 설정 저장과 `releaseAll`을 연속 실행한다(`ApmArchiveAdminService.java:153-159`). `settingsService.save()` → 별도 빈의 `ArchiveSettingStore.write()`는 기본 `REQUIRED` 전파로 외부 트랜잭션에 참여한다(`ApmArchiveSettingsService.java:37-39`, `ArchiveSettingStore.java:63-77`). self-invocation 문제가 없다. |
| R3 | 부분 | 날짜 락 키에 source/dataset/day가 모두 포함되고(`ArchiveDayLock.java:33-47`), 실제 파티션 경로는 같은 `TransactionTemplate`과 Spring-bound connection에서 판정·DROP·보류 해제를 실행한다(`ApmPartitionService.java:139-145,293-303`). 삭제·검사·게시도 동일 키를 쓴다(`ArchiveFileService.java:121-143,163-167`, `ApmArchiveService.java:246-267`). 다만 설정과 열린 보류 목록은 락을 잡기 전에 스냅샷으로 읽고(`ApmArchiveDropGate.java:74-84,95-109`), 락 안 판정은 그 낡은 값을 사용한다(`ApmArchiveDropGate.java:116-140`). 설정 변경은 같은 락에 참여하지 않는다. |
| R4 | 닫힘 | UUID가 포함된 partial을 `CREATE_NEW`와 `NOFOLLOW_LINKS`로 연다(`ArchiveWriter.java:89-115`). 청소는 stale RUNNING을 먼저 ABANDONED로 전환해 돌려받은 경로 또는 살아 있는 `runId`가 없는 오래된 partial만 대상으로 한다(`ApmArchiveService.java:280-299`, `ArchiveLedger.java:128-148`). 경로 안전성 문제는 R7/N4에 별도 기재한다. |
| R5 | 닫힘 | 게시는 날짜 락 안에서 수행되고(`ApmArchiveService.java:246-267`), 하드 링크를 no-replace 예약으로 사용하며 충돌 시 `-rN`을 다시 고른다(`ArchiveWriter.java:303-325,348-385`). 하드 링크 불가 시에도 같은 날짜 락으로 애플리케이션 실행 간 이동을 직렬화한다. |
| R6 | 부분 | 스트리밍 중 10,000행마다 deadline을 확인하고(`ApmArchiveSource.java:345-395`), DB에는 남은 시간만큼 `statement_timeout`을 건다(`ApmArchiveSource.java:281-287`). 시간 초과는 `DEFERRED`로 이월한다(`ApmArchiveService.java:211-217`). 또한 25분 예산·28분 hard stop·30분 lease 순서를 상수와 테스트로 고정했다(`ApmArchiveService.java:62-76`, `ArchiveLeaseBudgetTest.java:15-21`). 그러나 `seal()`의 ZIP 종료·fsync·전체 재읽기·SHA 계산에는 deadline이 없고(`ArchiveWriter.java:461-492`), hard stop은 이 작업이 반환된 뒤에만 검사된다(`ApmArchiveSource.java:226-228`, `ApmArchiveService.java:197-205`). 실제 총 실행 시간이 lease보다 짧다는 보장은 아직 없다. |
| R7 | 부분 | 최종 ZIP의 다운로드·검사·관리자 삭제·게이트 확인은 공통 `checkManagedFile()`을 거친다(`ArchivePathPolicy.java:209-257`, `ArchiveFileService.java:88-100,121-143,183-223`, `ApmArchiveDropGate.java:120-123`). 하지만 stale partial 삭제와 게시 실패 롤백 삭제는 이 API를 우회한다(`ApmArchiveService.java:258-263,284-286`, `ArchiveWriter.java:202-212`). |
| R8 | 닫힘 | 파생 디렉터리를 세그먼트별로 `NOFOLLOW_LINKS` 검사·생성하고 마지막에 실경로를 재검증한다(`ArchiveWriter.java:128-166`). 게시 직전에도 디렉터리 실경로와 partial 링크 여부를 다시 확인한다(`ArchiveWriter.java:307-325`). |
| R9 | 닫힘 | V69에 RUNNING·SOURCE_EXPIRED·HOLD_EXPIRED 상태별 부분 유니크 인덱스가 추가됐다(`V69__archive_ledger_apm_cold_archive.sql:73-84`). 쓰기 경로도 동일 술어의 `ON CONFLICT DO NOTHING`을 사용한다(`ArchiveLedger.java:69-81,164-197`). |
| R10 | 닫힘 | 기존 4인자 `TabularWriter.open()`은 `formulaGuard=true`를 유지하고(`TabularWriter.java:68-77`), ZM-154 내보내기도 그 경로를 그대로 사용한다(`ApmExportService.java:284-290`). 아카이브만 명시적으로 false를 전달하며(`ArchiveWriter.java:558-564`), ZIP manifest에 `csvFormulaGuard=false`를 기록한다(`ArchiveWriter.java:461-466`). |
| R11 | 닫힘 | `dropExpired` 호출을 overload와 호출 메서드 단위로 제한한다(`ApmArchiveGateArchTest.java:38-90`). 또한 main 소스의 `DROP TABLE` 문자열이 `ApmPartitionService` 밖에 존재하지 않는지 검사한다(`ApmArchiveGateArchTest.java:93-116`). |
| R12 | 닫힘 | V69 상단에 스케줄러 실행 이력·lease·설정·알람 시드·인덱스·신규 테이블·Flyway 이력을 제거하는 역순 롤백 SQL과 파일 보존 주의가 포함됐다(`V69__archive_ledger_apm_cold_archive.sql:10-25`). |

## 새 결함

- N1 · 필수 · `ApmArchiveSettings.java:55-90` · 저장 옵션의 알 수 없는 키가 거절되지 않는다 · 구현 주석은 unknown key를 예외 처리한다고 하지만 whitelist 검사가 없다. 예를 들어 운영자가 무기한 보류를 의도해 `maxHoldDay:0`으로 잘못 저장하면 해당 키는 무시되고 기본 `maxHoldDays=7`이 적용되어 8일째 원본이 보관 없이 삭제될 수 있다 · 허용 키 집합을 명시하고 `options.keySet()`의 차집합이 비어 있지 않으면 `InvalidSettings`를 던지며 오타 키 회귀 테스트를 추가한다.

- N2 · 필수 · `ApmArchiveDropGate.java:74-84,95-140`, `ApmArchiveAdminService.java:153-159` · 날짜 락 안에서 설정과 열린 보류를 재조회하지 않아 관리자 설정 변경과 DROP이 직렬화되지 않는다 · 보존 배치가 `onFailure=continue` 또는 만료된 hold를 스냅샷한 뒤 관리자가 `skipDrop`/무기한 보류로 저장해도, 배치는 낡은 정책으로 아카이브 없는 날짜를 DROP할 수 있다. 반대로 비활성화와 경합하면 이미 release한 hold를 다시 열 수도 있다 · 설정 변경과 게이트 판정이 공유하는 source-level 설정 락을 도입하거나, 날짜 트랜잭션 안에서 설정 행을 잠가 재조회한 뒤 원장·실물·hold까지 다시 판정한다.

- N3 · 필수 · `ArchiveDayLock.java:49-59`, `ArchiveFileService.java:121-143,166-205` · advisory lock 대기에 제한이 없고, 관리자 검사는 전체 ZIP SHA 계산을, 삭제는 파일 삭제를 DB 트랜잭션과 락 아래에서 수행한다 · 대형 ZIP 또는 멈춘 NFS I/O 하나가 해당 날짜의 보존 정리를 무기한 대기시킬 수 있다. 30분 scheduler lease가 만료되면 다른 노드도 같은 작업을 시작해 대기열이 누적된다 · `pg_try_advisory_xact_lock` 기반 제한 대기 또는 트랜잭션 `lock_timeout`을 적용하고, 시간 초과는 fail-closed 보류/단계 실패로 기록한다. 긴 파일 검사는 짧은 상태 스냅샷과 결과 CAS 방식으로 락 점유 시간을 줄인다.

- N4 · 필수 · `ApmArchiveService.java:280-299`, `ArchiveWriter.java:202-212` · stale partial 삭제가 공통 경로 정책을 우회한다 · DB의 stale RUNNING `file_path`는 단순 정규화 후 `startsWith(apmRoot)`만 확인한다. `apmRoot/link/victim.<uuid>.partial`의 부모가 외부 디렉터리를 가리키는 symlink면 허용 루트 밖 일반 파일을 삭제할 수 있으며, `deletePartial()`은 파일명 정규식만 검사한다 · partial 전용 안전 검증 API를 만들어 절대경로·허용 root·모든 부모의 실경로·`NOFOLLOW_LINKS`·runId 일치를 확인한 직후 삭제한다. 게시 롤백 삭제도 같은 안전 삭제 함수를 사용한다.

- N5 · 필수 · `ApmArchiveSource.java:226-228`, `ArchiveWriter.java:461-492`, `ApmArchiveService.java:197-205` · hard stop이 봉인·재검증 단계에는 적용되지 않는다 · `seal()`은 ZIP close, fsync, 전 항목 재읽기, ZIP SHA 계산을 제한 없이 수행한 뒤 반환한다. 따라서 25분 deadline 직전에 봉인에 들어가면 30분 lease를 넘긴 뒤에야 28분 hard stop을 확인한다 · `seal/verify/sha256Of`에도 deadline 또는 취소 토큰을 전달해 청크마다 검사하고, lease보다 충분한 안전 여유가 남지 않으면 봉인을 시작하지 말고 partial을 폐기해 `DEFERRED` 처리한다.

## 판정

수정 후 재검수

이유: R1·R3·R6·R7의 근본 원인이 일부 남아 있으며, 특히 설정 오타와 설정 변경 경합은 보관되지 않은 원본의 DROP으로 이어질 수 있습니다.  
이유: 무제한 advisory lock 대기와 검증 시간 미제한은 lease 만료 후 중복 실행을 만들고, partial 정리는 허용 루트 밖 파일 삭제 가능성이 있습니다.

확인하지 못한 것:

- 요청에 따라 빌드·테스트는 실행하지 않았으며 정적 검토만 수행했습니다.
- PostgreSQL 실제 커넥션에서 advisory lock 대기·트랜잭션 결합·`lock_timeout` 동작은 실측하지 않았습니다.
- Linux/NFS/컨테이너에서 symlink 교체, 하드 링크 불가 fallback, 대형 ZIP 봉인 시간은 재현하지 않았습니다.
- 운영 DB의 V69 적용 여부와 기존 데이터에 대한 인덱스 생성 결과는 확인하지 않았습니다.