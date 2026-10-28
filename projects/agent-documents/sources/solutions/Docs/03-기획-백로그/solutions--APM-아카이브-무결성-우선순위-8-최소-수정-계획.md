# APM 아카이브 무결성 — 우선순위 8 최소 수정 계획

작성: 2026-10-06. 상태: **읽기 전용 설계 완료, 구현·테스트·DB 확인 미실행**.

소스 경로는 별도 표시가 없으면 `C:/solutions/moveseye-be-spring/` 기준이다. 현재 작업 중인 우선순위 5 메트릭 변경은 관찰만 했으며 수정하지 않았다. 근거 메모: [루트 사전 조사](solutions--%EC%9A%B0%EC%84%A0%EC%88%9C%EC%9C%84-8-%EC%9B%90%EB%AC%B8-%EC%82%AD%EC%A0%9C%EC%99%80-archive-%EA%B2%80%EC%A6%9D-%EC%97%B0%EA%B2%B0-%EC%82%AC%EC%A0%84-%EB%A9%94%EB%AA%A8.md).

## 1. 결론과 보장 범위

`verify`가 확인한 ZIP checksum 불일치 또는 실물 미확인을 원장에 영속화하고, 아카이빙이 활성화된 대상 날짜는 유효한 대체본이 생기기 전까지 원본 DROP을 차단한다. **원장 `OK`를 단순히 기존 `FAILED`로 바꾸는 방법은 피하고, `CORRUPT` 상태를 추가하는 안을 권고한다.** 파일·SHA·manifest 등 증거는 보존한다.

이번 최소안의 보장은 **검증 실패 상태가 날짜 락 안에서 커밋된 뒤 시작되는 DROP 판정**에 적용된다. 아직 검증하지 않은 파일의 bit rot, 긴 SHA 계산 도중 먼저 완료된 DROP, 외부 프로세스의 무단 파일 변경까지 예방한다고 주장하지 않는다. 이들을 막으려면 별도의 검증 예약 상태/삭제 직전 전체 SHA/주기적 검증 설계가 필요하다.

확인된 손상에 대한 보류는 `onFailure=continue`, `maxHoldDays`보다 우선한다. 관리자가 아카이빙을 OFF하거나 해당 dataset을 대상에서 제외하는 기존 명시적 정책 변경은 유지한다. OFF는 우선순위 5의 미집계 원본 보호를 해제하는 기능이 아니다.

## 2. 현재 코드에서 확인한 문제

| 근거 | 현재 동작 | 영향 |
|---|---|---|
| `archive/ArchiveFileService.java:143` | `verify`는 SHA 불일치를 `ok=false`로 반환하지만 원장을 수정하지 않음 | 손상 ZIP도 계속 `OK` |
| 같은 파일 `:150` | `FileState.MISSING`이면 즉시 반환 | 실물 없음도 실패 이력이 남지 않음 |
| 같은 파일 `:165` | 날짜 락 안에서 status/path/size만 대조 | SHA·원장 세대·동일 크기 파일 교체를 충분히 구분하지 못함 |
| `premium/apm/core/batch/archive/ApmArchiveDropGate.java:130` | `OK` + 관리 파일 존재면 `ARCHIVED` | 검증 실패한 ZIP이 여전히 있으면 원본 DROP 허용 |
| 같은 파일 `:135` | OK가 없어도 continue/보류 만료로 허용 | 상태만 바꾸어서는 알려진 실패의 강제 보류가 되지 않음 |
| 같은 파일 `:179` | `mayDrop`의 switch 기본 분기가 `true` | 새 차단 reason 추가 후 분기 누락 시 판정이 뒤집힘 |
| `archive/ledger/ArchiveLedger.java:115` | `failRunning`은 RUNNING 전용이며 `file_path=null` | 게시된 파일 검증 실패에 재사용 불가 |

이는 **코드로 확인한 조건부 결함**이다. 이번 작업에서는 실제 운영 ZIP을 손상시키거나 원본을 DROP하지 않았다. 기존 `ApmColdArchiveIT`는 정상 보관/삭제/보류/락/설정 경합을 다루지만 checksum 불일치를 원본 보존과 연결하는 회귀는 찾지 못했다.

## 3. 상태 선택과 기존 FAILED 재사용 검토

### 권고: CORRUPT 추가, 생성 실패 FAILED 유지

`CORRUPT`는 게시된 아카이브의 무결성이 확인되지 않아 격리된 상태다. 최소 사유 코드는 다음과 같이 구분한다.

- `FILE_HASH_MISMATCH`: 안정된 파일 관측에서 ZIP SHA-256이 원장의 SHA와 불일치.
- `FILE_UNAVAILABLE`: 원장이 참조하는 관리 파일을 재확인할 수 없음. 현재 `ArchivePathPolicy.checkManagedFile`의 MISSING에는 일부 I/O 실패도 포함되므로 물리적 삭제라고 단정하지 않는 이름을 쓴다.

기존 `VERIFY_MISMATCH`는 `ArchiveWriter`의 **게시 전 생성/재읽기 실패**에 쓰인다(`archive/write/ArchiveWriter.java:437`, `:583`). 게시 후 손상과 다른 사유를 사용해야 gate가 모든 생성 실패를 강제 보류로 오해하지 않는다.

`ArchiveStatus.hasFile`, `ArchiveFileRow.expectsFile`, 삭제 대상, 용량 집계에는 CORRUPT를 포함한다. 이때 `expectsFile`은 다운로드 허가가 아니라 **보존된 파일 참조의 존재 기대**다. 다운로드/검사 가능 상태를 별도 predicate로 분리한다.

| 상태 | 파일 메타데이터 | 다운로드 | verify | 사유 있는 파일 삭제 | 유효본으로 DROP 허용 |
|---|---|---|---|---|---|
| OK | 보존 | 허용 | 허용 | 허용 | 관리 파일 확인 시 허용 |
| SUPERSEDED | 보존 | 허용 | 허용 | 허용 | 불가 |
| CORRUPT | 보존 | 차단 | 재생성 안내로 차단 | 허용 | 불가 |
| CORRUPT에서 전이한 DELETED | 보존, 무결성 failReason 유지 | 차단 | 차단 | 멱등 skip | 불가, 실패 이력도 유지 |
| FAILED | 기존 생성 실패 의미 | 기존 차단 | 기존 차단 | 기존 skip | 기존 실패 정책 |

CORRUPT의 재검사를 잠금 해제 수단으로 삼지 않는다. 외부에서 파일만 바꿔 끼우거나 검사를 반복해 정상 원장으로 자동 복귀시키지 않고, 정식 재생성으로 새 OK를 게시해야 한다. UI는 CORRUPT에서 재생성 실행 경로를 안내한다.

`V69__archive_ledger_apm_cold_archive.sql:42`의 status는 `varchar(16)`이며 CHECK/enum이 없다. CORRUPT 추가 자체에는 신규 Flyway가 필요하지 않다. 기존 V69는 수정하지 않는다. 추후 검증 시각/해결 세대 필드를 정식 추가한다면 새 migration으로 분리한다.

### FAILED 재사용을 권고하지 않는 이유

현재 `ArchiveStatus.java`는 FAILED를 파일 없는 실패로 정의한다. `markDeleted`와 `usage`도 OK/SUPERSEDED만 다룬다(`ArchiveLedger.java:335`, `:346`). FE도 같은 상태 집합을 버튼·선택·용량에 사용한다. FAILED에 파일을 남기려면 reason별 파일 소유 여부를 모든 소비자에 전파해야 하므로 상태 한 개 추가보다 수정 범위가 작다고 보기 어렵다. `failRunning` 재사용은 특히 금지한다.

## 4. verify의 CAS와 트랜잭션 경계

긴 SHA I/O를 현재처럼 날짜 락 밖에 둔다. 성공/실패를 반환하기 전에 짧은 날짜 락 구간에서 **관측한 동일 원장 행과 동일 파일**인지 확인하고, 실패 시 CAS UPDATE를 커밋한다.

1. `before` 원장 행을 읽는다. 검증 대상은 OK/SUPERSEDED뿐이다. 원장 fingerprint는 최소 `id`, `status`, `file_path`, `sha256`, `created_at`; `bytes`도 포함한다. NULL 가능 값은 SQL `IS NOT DISTINCT FROM` 등으로 비교한다.
2. 현재 관리 경로 정책을 통과시킨다. REJECTED는 기존 보안 경계를 유지하고 파일을 읽거나 삭제하지 않는다. 경로 거부까지 자동 무결성 전이로 확장하는 것은 별도 범위다.
3. 일반 파일이면 `BasicFileAttributes`의 `fileKey`(제공될 때), size, lastModifiedTime을 SHA 읽기 전과 후에 확인한다. 링크 미추적 및 관리 경로 재검사를 유지한다. 읽는 중 값이 바뀌면 낡은 판정을 저장하지 않고 `ARCHIVE_BUSY`로 재시도시킨다.
4. 날짜 락 안에서 원장 fingerprint와 관리 경로/파일 fingerprint를 다시 비교한다. 불일치나 경합이면 CAS 변경 없이 `ARCHIVE_BUSY`.
5. 안정된 SHA 불일치는 `OK/SUPERSEDED → CORRUPT`, 새 사유 및 간결한 failDetail을 기록한다. UPDATE 반환 건수가 정확히 1이어야 한다. 이미 다른 검증이 바꾼 행은 실패 판정 덮어쓰기를 하지 않는다.
6. MISSING은 즉시 반환하지 않는다. 날짜 락 안에서 동일 원장인지 확인하고 현재 파일 상태도 여전히 MISSING인지 재확인한 뒤 `FILE_UNAVAILABLE`로 전이한다. 파일이 재등장하거나 경로가 달라지면 재시도시킨다.
7. 실패 상태의 DB 커밋이 끝난 뒤 기존 VerifyResult를 반환한다. 트랜잭션 안에서 ApiError를 던져 실패 기록까지 rollback시키지 않는다. SHA 도중 IOException은 MISSING을 재확인할 수 있을 때만 같은 전이를 사용하고, 그 밖의 불확실한 I/O 실패는 기존 오류/재시도 의미를 유지한다.

checksum 불일치의 응답은 기존 `{ok:false, expected:<sha>, actual:<sha>, fileExists:true}`, 실물 미확인은 `{ok:false, expected:<sha>, actual:null, fileExists:false}`를 유지한다. 성공은 기존 정상 응답이다. CAS 실패는 기존 `ARCHIVE_BUSY`와 기존 HTTP/body envelope 규칙을 유지한다.

파일 mtime/size/fileKey는 우발적 동시 변경을 감지하는 보조 장치다. 동일 inode에서 내용과 mtime을 되돌리는 외부 공격까지 증명하지는 못한다. 날짜 advisory lock도 DB 참여자만 직렬화한다.

## 5. DROP gate의 정확한 순서

기존 `settings shared → day exclusive` 순서를 유지한다. verify는 공통 파일 기능에서 날짜 락만 사용하며 APM 설정 락을 역순으로 추가하지 않는다. 보류 장부 생성은 현재처럼 retention gate가 담당한다.

활성 대상 날짜의 판정은 다음 순서로 고정한다.

1. OFF → DISABLED. 대상 제외 → NOT_TARGET. 기존 명시적 정책 우회 유지.
2. 현재 OK + 관리 파일 존재 → ARCHIVED. 정상 재생성된 대체본이 있으면 과거 손상 행 때문에 영구 보류하지 않음.
3. 해당 `(source,dataset,period_day)`에 게시 후 무결성 실패 기록이 있고 유효 OK가 없으면 → `INTEGRITY_FAILED`, DROP=false.
4. 그 외 생성 실패/미시도에 대해서만 continue 및 maxHoldDays 기존 정책 적용.
5. 그 외 HELD.

3번의 조회는 CORRUPT뿐 아니라 `FILE_HASH_MISMATCH`/`FILE_UNAVAILABLE` 사유를 보존한 DELETED도 포함한다. 관리자 파일 삭제가 원본 보호를 푸는 우회가 되면 안 된다. 현재 `idx_archive_file_key`로 날짜별 조회가 가능하므로 새로운 광역 스캔이 필요하지 않다.

**최소안의 보수적 의미:** 실패 이력을 별도 해결 세대 컬럼 없이 남긴다. 새 OK가 있으면 보류를 해제하지만, 그 유효본을 나중에 삭제해 다시 OK가 없어지면 과거 실패 이력에 따른 보류가 재활성화된다. 오래된 SUPERSEDED 파일의 실패 이력도 같은 날짜의 현재 OK가 없는 경우 보류 근거가 된다. 이 동작을 계약에 명시한다. '복구 후 과거 실패는 영구 해결'이라는 더 세밀한 의미가 필요하면 `integrity_resolved_at/by_archive_id` 같은 별도 필드가 필요하며 이번 최소안에서 암묵적으로 구현하지 않는다.

`mayDrop`에는 INTEGRITY_FAILED를 반드시 명시 차단하거나 `Decision.allowed`를 최종 권한으로 사용한다. 현재 switch default=true를 그대로 두고 reason만 추가하면 안 된다. 보류 사유 `INTEGRITY_FAILED`를 `ApmArchiveHoldStore`에 기록하고 held 수를 올린다. hold-expired 원장은 만들지 않는다. DROP 실패/rollback이면 기존처럼 해당 트랜잭션의 변경도 rollback한다.

## 6. 재생성 및 동시 실행

`ApmArchiveService.plan:335`는 OK와 실물 존재 여부로만 생성을 건너뛴다. CORRUPT가 OK에서 빠지면 기존 source.existingDays 범위 안의 날짜는 다음 배치/수동 runNow에서 자연스럽게 재생성된다. 원본이 남아 있지 않거나 날짜가 아직 export 대상 상한 밖이면 즉시 복구된다고 보장하지 않는다.

게시 경로 `ApmArchiveService.publish:264`와 `ArchiveLedger.completeOk:91`은 기존 날짜 락/동일 DB 트랜잭션을 유지한다. 기존 RUNNING 단일 소유권과 OK 부분 unique index도 유지한다. 새 OK의 파일은 writer의 seal/검증을 통과한 새 파일이다. CORRUPT 파일은 이 과정에서 지우지 않는다.

| 경합 | 필요한 결과 |
|---|---|
| 검증 SHA 중 새 OK 게시 | 이전 OK가 SUPERSEDED로 바뀌므로 CAS 실패. 새 OK는 오염되지 않음 |
| 검증 SHA 중 관리자 삭제 | status 변경으로 CAS 실패. DELETED 행을 CORRUPT로 되살리지 않음 |
| 동시 검증 두 건 | 첫 판정만 CAS 성공, 뒤의 낡은 판정은 busy/변경 없음 |
| 검증 실패 커밋 후 retention | 같은 날짜 락 뒤에서 CORRUPT를 읽고 원본 보존 |
| retention이 먼저 날짜 락을 획득해 DROP 완료 | 이후 검증이 원본을 복구할 수 없음. 최소안의 명시적 한계 |
| 새 OK 게시 DB 오류 | 기존 게시 파일 정리/트랜잭션 rollback 의미 유지. CORRUPT 근거는 유지 |
| CORRUPT 삭제 후 재생성 | DELETED의 무결성 사유를 유지하여 중간 DROP 차단, 새 OK 커밋 후 허용 |
| OFF와 retention 경합 | 기존 settings 공유/배타 락 직렬화 유지. OFF 후 보류 재생성 없음 |

## 7. 다운로드·삭제·용량·화면 일관성

- 다운로드: 상태 검사 시 CORRUPT이면 새 `ARCHIVE_INTEGRITY_FAILED` 오류 등 명시적인 기존 방식의 envelope로 차단한다. 이미 상태 확인을 마치고 시작된 스트리밍을 뒤늦게 중단하는 기능은 추가하지 않는다. 원문 경로 허용 정책과 NOFOLLOW는 그대로 유지한다.
- 삭제: CORRUPT도 기존 사유 필수 흐름으로 처리하고 `markDeleted`의 대상에 포함한다. failReason/failDetail은 지우지 않는다. 현재처럼 DB DELETED 커밋 후 파일 삭제, 실패 시 `fileDeleteFailed`에 기록한다. REJECTED 경로를 강제로 지우지 않는다.
- 용량: CORRUPT의 보존 파일 메타데이터도 usage에 포함한다. 이는 현재와 같은 원장상 bytes이며, MISSING 파일의 실제 디스크 점유량을 정확히 재는 API는 아니다. '현재 실제 디스크 사용량'으로 문구를 바꾸면 안 된다.
- 실패 목록: `latestFailure`/`recentFailures`는 현재 FAILED만 조회하므로 CORRUPT 및 무결성 실패 이력을 보완한다. createdAt은 게시 시각이고 검증 시각이 아니므로 이를 수정하거나 검증 시각이라고 표시하지 않는다. 검증 시각은 우선 감사 로그/failDetail에 명시할 수 있다.
- 보류 목록: INTEGRITY_FAILED의 `expiresInDays`는 null. 다른 보류의 maxHoldDays 계산은 유지. 현재 `ApmArchiveAdminService:301`과 `:402`의 무조건 만료/continue 안내는 예외를 설명하도록 수정한다.
- 목록/상세: DTO 필드 추가 없이 status/failReason 허용 값만 확장할 수 있다. fileExists는 CORRUPT에서도 실제 확인값이다. `ArchiveFileService.STATUSES`와 OpenAPI 설명도 갱신한다.
- FE 필요 범위: `src/types/archive.ts`, `src/constants/archive.ts`, `src/pages/setting/data-archive/archiveDisplay.ts`, 목록/상세/삭제 모달, locale, 해당 테스트. 파일 소유·삭제·다운로드·검사 조건을 하나의 상태 집합으로 공유하지 않도록 분리한다. verify 후 목록/상세/status/holds 재조회가 필요하다.

공통 아카이브 기능이므로 `source=APM`만 상태 저장을 허용하는 조건을 넣지 않는다. APM 원본 DROP 정책은 APM gate가 해석한다. 새 dependency는 필요하지 않다.

## 8. 우선순위 5의 late-source freshness와 분리

우선순위 5 작업 중인 `ApmMetricRetentionGate`는 dirty/frontier 및 upstream 파티션을 확인해 재집계 전 원본 삭제를 막는다. **ZIP checksum 일치는 ZIP 생성 이후 DB 원본이 변경되지 않았다는 증명이 아니다.**

예: 1h ZIP 생성 → 늦은 1m 도착 → 5m/1h 재집계 완료 → dirty 해소. 기존 ZIP의 SHA는 계속 일치하지만 최신 1h 행은 들어 있지 않을 수 있다. 현재 archive plan은 기존 OK+파일 존재로 skip하므로 무결성 상태 변경만으로 이 문제를 고치지 못한다.

다음은 이번 8번 완료 판정에서 분리한다.

- 우선순위 5의 미집계 원본/partition retired 보호가 archive OFF에도 유지되는지.
- archive 게시와 source revision/dirty generation을 연결하여 stale OK를 재생성시키는 별도 freshness 설계.
- archive 대상 원본이 write-closed라고 판단하는 정확한 시점과 late arrival 허용 정책.

8번은 **게시된 artifact 자체의 알려진 손상/미확인**만 해결한다. '아카이브 내용이 최신 DB와 완전히 같다'는 주장은 하지 않는다.

## 9. 구현 파일 범위 제안

1. `archive/ledger/ArchiveStatus`, `ArchiveFileRow`, `ArchiveLedger`: 새 상태/사유, CAS 전이, 무결성 실패 조회, 삭제/usage/실패 목록.
2. `archive/ArchiveFileService`, `ArchiveFileDto`, `ArchiveFileController`, 오류 코드: verify 커밋·CAS, 다운로드/검사/삭제 분리, 계약 설명.
3. `premium/apm/core/batch/archive/ApmArchiveDropGate`, `ApmArchiveHoldStore`: 강제 보류 사유와 순서. 기존 settings/day 락 구조 유지.
4. `premium/apm/archive/ApmArchiveAdminService` 및 관련 DTO 설명: 만료/continue 예외, 상태 경고. `ApmArchiveService.plan/publish`는 새 상태와의 실제 작동을 검증하며 불필요한 재작성 금지.
5. `_workspace/contract_apm-archive-integrity-20261006.md` 및 FE 요청: 경로/필드는 보존하고 새 status/reason/error 및 버튼 허용표 명시.

공통 메트릭 partition/retention/rollup 코드를 이 변경에서 수정하지 않는다.

## 10. 구현 후 필수 검증과 완료 기준

다음은 **아직 실행하지 않은 테스트 계획**이다. root가 순차 실행한다. 운영 파일/운영 partition을 변경하지 않고 격리된 PG IT 및 temp ZIP을 사용한다.

1. 정상 ZIP 생성 → 한 byte만 같은 길이로 변경 → verify `ok=false`, CORRUPT 및 예상/실제 SHA 보존 → 실제 retention 실행 → source partition 유지, INTEGRITY_FAILED hold. continue=true와 hold 만료 조건에서도 유지.
2. 파일을 격리 테스트 안에서 제거 → verify `fileExists=false` → FILE_UNAVAILABLE 커밋 → 원본 유지. 일시 MISSING 뒤 재등장은 CAS 재시도.
3. 원본으로 새 ZIP 재생성 → 새 OK 정확히 1개 → 손상 행/파일 유지 → 다음 retention DROP 허용. 새 ZIP 실패 시 원본 계속 유지.
4. CORRUPT 삭제 → DELETED와 무결성 사유 보존 → continue/만료로 우회되지 않음. 재생성 성공 또는 OFF/대상 제외만 기존 정책대로 허용.
5. 검증 SHA와 삭제/게시의 경합을 latch로 제어 → 낡은 판정이 최신 원장/새 OK를 바꾸지 않음. same-size 교체 및 SHA 전후 mtime 변경도 검증.
6. CAS UPDATE 실패/DB 오류 → 거짓 성공 응답 금지, 기존 상태 보존. 새 실패 기록을 만드는 트랜잭션이 반환 오류 때문에 rollback되지 않는지 확인.
7. CORRUPT의 다운로드/verify 차단, 삭제 허용, 목록 fileExists/용량/실패 사유/보류 만료 null 및 FE 버튼 동작이 같은 계약인지 확인.
8. 기존 정상 ZIP verify/download/delete, 보류 만료/continue의 일반 생성 실패, 경로 거부, 설정 OFF 경합, RUNNING unique, 기존 publication rollback 회귀 유지.

우선 실행 후보: `ApmColdArchiveIT`, `ApmArchiveDropGateTest`, `ApmRetentionArchiveGateTest`, `ApmArchiveServiceTest`, `ApmArchiveAdminServiceTest`, `ArchiveWriterTest` 및 새 `ArchiveFileServiceTest`/CAS 회귀. 실제 테스트 클래스명은 구현 시 현 파일 목록과 대조한다.

완료 기준은 **검증 실패가 원장에 남고, 활성 대상의 이후 실제 DROP이 차단되며, 정식 재생성 및 명시적 OFF 정책으로만 정해진 방식대로 진행되는 것**이다. 단순 `verify=false` 응답이나 mock gate 판정만으로 완료 처리하지 않는다.
