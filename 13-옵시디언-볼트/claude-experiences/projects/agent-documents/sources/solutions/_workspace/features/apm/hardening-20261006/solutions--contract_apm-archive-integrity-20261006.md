# APM 아카이브 무결성 계약

2026-10-06. **제품 구현·테스트 작성 완료, root 실행 검증 대기**. 경로·응답 shape·관리자 권한 및 HTTP/body 규칙은 유지한다.

## FE 선행 계약

- `ArchiveFileDto.status`에 `CORRUPT` 추가: 게시된 파일의 checksum 불일치 또는 실물 미확인을 기록한 격리 상태. 오류 톤/라벨 `무결성 실패`.
- `failReason`에 `FILE_HASH_MISMATCH`, `FILE_UNAVAILABLE` 추가. 각각 `체크섬 불일치`, `파일 확인 불가`. 기존 `VERIFY_MISMATCH`는 생성 중 검증 실패로 의미를 유지한다.
- `fileExists:boolean|null`은 CORRUPT에서도 실제 파일 확인 결과(boolean)다. bytes/경로/SHA/manifest는 보존한다. CORRUPT도 목록의 선택 삭제·용량 집계 대상이다.
- 다운로드·verify 가능 상태는 기존 `OK|SUPERSEDED`뿐이다. CORRUPT에서 해당 요청은 `ARCHIVE_INTEGRITY_FAILED`, **HTTP 200 + body code 409** 오류 envelope. 설명: 무결성 검증에 실패해 격리되었으므로 원본에서 재생성해야 한다. 상태 전이 전 이미 시작된 스트리밍은 취소하지 않는다.
- OK/SUPERSEDED의 `fileExists=false`에서도 verify를 허용한다. 누락을 CORRUPT로 확정하는 경로다. 다운로드는 기존대로 파일 없음이면 비활성이다.
- `POST /archives/{id}/verify` 응답은 `{ok:boolean,expected:string|null,actual:string|null,fileExists:boolean}` 그대로다. checksum 불일치 시 `{ok:false,expected:<기존 SHA>,actual:<계산 SHA>,fileExists:true}`, 실물 미확인 시 `actual:null,fileExists:false`. 이 응답 전에 CORRUPT가 DB에 커밋된다. 성공 응답은 기존과 같다. 경합은 기존 ARCHIVE_BUSY.
- verify 성공/실패 응답 후 목록·상세·APM 상태·보류 조회를 invalidate한다. `ok:false`는 단순 경고 토스트로 끝내지 않고 격리·재생성 필요를 안내한다. CORRUPT 재검사로 자동 복구하지 않는다.
- `DELETE /archives/{id}`, `POST /archives/delete-bulk`는 CORRUPT도 사유 필수로 허용한다. 결과 필드는 유지한다. DELETED로 바뀌어도 무결성 failReason/failDetail이 남으며 **파일 삭제만으로 원본 보호는 풀리지 않는다**.
- `HoldItem.lastHoldReason`에 `INTEGRITY_FAILED` 추가. `expiresInDays=null`. `maxHoldDays`와 `onFailure=continue`를 적용하지 않는다. 복구된 새 OK가 있으면 진행한다.
- 상태 warnings에 `INTEGRITY_FAILED` 추가: `{code:"INTEGRITY_FAILED",message:string,params:{count:number}}`. 강한 경고 톤, `무결성 실패로 원본 삭제 보류` 안내. 기존 HOLDS_PENDING/CONTINUE_POLICY 문구도 이 예외를 설명한다.
- `recentFailures` 및 보류 실패 설명에 게시 후 무결성 실패가 포함된다. 기존 createdAt/lastFailureAt은 해당 원장 행의 생성·게시 시각이며 새 검증 시각 필드를 추가하지 않는다. 검증 시각은 failDetail/감사 로그에 남긴다.

## 정책

활성 대상: 유효한 현재 OK+관리 파일이 있으면 허용 → 없고 무결성 실패 이력이 있으면 강제 보류 → 그 외 일반 실패에 기존 continue/maxHoldDays 적용. 새 OK가 없으면 무결성 실패 사유를 보존한 DELETED도 보류 근거다. 이전 복구본을 다시 삭제하면 과거 실패에 따른 보류가 재활성화될 수 있다.

관리자의 archive OFF/대상 제외는 기존 명시적 우회다. 우선순위 5의 미집계 메트릭 원본 보호까지 해제하지 않는다. 늦은 source 변경으로 ZIP 내용이 오래된 문제는 별도 미해결이며, checksum 일치가 DB 최신성의 증명은 아니다.

## 🔄 FE 요청사항

`types/archive.ts`, `constants/archive.ts`, `archiveDisplay.ts`, 파일 목록/상세/삭제 모달, 상태 보류·경고 표시, locale, 관련 테스트를 위 계약에 맞춘다. 파일 소유/선택 삭제와 다운로드/verify 조건을 분리한다. 기존 메서드·path·DTO 필드명 변경은 없다.

## 구현 상세

- `ArchiveFileService.verify`: 긴 SHA 계산은 날짜 락 밖. SHA 전/후 및 날짜 락 안에서 path/fileKey/size/mtime fingerprint를 확인한다. 원장 전체 snapshot도 재조회하여 일치해야 한다. 변경 시 ARCHIVE_BUSY이며 낡은 실패가 새 유효본을 오염시키지 않는다.
- `ArchiveLedger.markCorrupt`: id/source/dataset/day/status/path/SHA/createdAt/bytes 조건의 CAS. OK/SUPERSEDED만 전이한다. 기존 `failRunning`은 사용하지 않으며 FAILED 생성 실패 의미를 유지한다.
- 파일 누락은 같은 날짜 락 안에서 재확인 후 FILE_UNAVAILABLE로 저장한다. SHA 읽기 중 IOException도 현재 파일이 없다고 재확인할 수 있을 때만 이 경로를 따른다. 파일 존재 상태의 불확실한 I/O 실패는 기존 오류로 반환하고 손상을 지어내지 않는다.
- 무결성 실패 전이는 파일·SHA·manifest·bytes·createdAt을 보존한다. DELETED 전이에서도 failReason/failDetail을 지우지 않는다.
- gate는 유효한 현재 OK를 우선 인정하며, 그 외 게시 후 실패 이력은 continue/보류 만료보다 우선한다. `mayDrop`에 INTEGRITY_FAILED 차단을 연결했고 기본 분기도 Decision.allowed를 따른다.
- 원본이 export 가능 범위에 남아 있으면 기존 아카이브 배치/지금 실행이 새 OK를 자동 생성한다. CORRUPT는 okRows에서 제외되므로 별도 재생성 endpoint는 추가하지 않았다. 이전 손상 파일은 관리자 삭제 전까지 보존한다.
- 사용량/파일 선택 삭제는 CORRUPT를 포함한다. 사용량 bytes는 기존과 같은 **원장 메타데이터 합계**이며 누락 파일의 실제 디스크 점유를 측정하는 API가 아니다.
- 보류 행은 retention이 실제 판정할 때 만든다. verify 직후 원장 CORRUPT는 즉시 보이지만 아직 열린 보류가 없으면 holds/warning에는 다음 정리 후 반영될 수 있다.
- V69의 status는 varchar(16)이며 enum/CHECK 제약이 없어 신규 migration은 필요 없다. 기존 migration은 수정하지 않았다. 신규 dependency도 없다.

## 검증과 범위

작성된 신규 회귀는 **20개 예정**이다. 아직 실행하지 않았다.

| 테스트 | 추가 사례 |
|---|---|
| `ArchiveFileServiceTest` | 11개. 실제 temp ZIP의 정상/불일치/누락, 격리 후 다운로드·재검사, 원장 SHA 변경/삭제 CAS, 동일 크기 파일 재쓰기, 누락 뒤 재등장, CAS 실패, SHA 중 소실, 미확인 I/O 오류 |
| `ApmArchiveDropGateTest` | 3개. continue/만료 강제 차단, 새 유효본 우선, OFF/대상 제외 우회 |
| `ApmColdArchiveIT` | 6개. 실제 ZIP 손상→CORRUPT commit→원본 DROP 차단→재생성 해제, 누락→DELETED 증거 유지, 실물 삭제 뒤 보호, OFF, DB 저장 실패 rollback, 오래된 SHA의 CAS 거부 |

root 실행 필터는 위 3개와 기존 `ApmArchiveServiceTest`, `ApmArchiveAdminServiceTest`, `ApmRetentionArchiveGateTest`, `ArchiveWriterTest`, archive 경계 테스트를 권고한다. PG IT가 skip이면 성공으로 간주하지 않는다. 새 IT는 기존 격리 DB 및 temp archive root를 사용한다.

정적 확인: 소유 변경 `git diff --check` 통과. Gradle·빌드·DB·서버·커밋은 실행하지 않았다.

보장은 **무결성 실패 원장 커밋 이후의 DROP 판정**에 적용된다. SHA 계산 중 먼저 끝난 DROP, 미검출 bit rot, 외부에서 파일 내용을 바꾸고 식별 정보까지 되돌린 경우를 완전히 막는 변경은 아니다. 주기적 검증/삭제 직전 검증과 source freshness는 별도 과제다.
