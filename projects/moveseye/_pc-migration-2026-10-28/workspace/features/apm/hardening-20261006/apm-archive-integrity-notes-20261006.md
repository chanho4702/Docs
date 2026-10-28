# 우선순위 8 — 원문 삭제와 archive 검증 연결 사전 메모

상태: root 읽기 전용 조사, 구현 미착수. 앞선 우선순위 검증 후 진행한다.

- `archive/ArchiveFileService.verify`는 실제 SHA-256을 락 밖에서 계산한 뒤 날짜 락 안에서 status/path/파일size만 재검사한다. 실패 결과를 반환해도 원장 OK가 그대로 남는다. 파일 MISSING 분기도 장부를 바꾸지 않는다.
- `premium/apm/core/batch/archive/ApmArchiveDropGate.TableGuard.judge`는 OK 원장 + 관리 파일 존재만 확인하고 ARCHIVED로 허용한다. 다음으로 continue/hold-expiry 정책이 적용된다.
- `archive/ledger/ArchiveLedger`는 OK 원장·RUNNING 전이와 날짜별 유효본1개 인덱스 정본이다. 기존 `failRunning`은 RUNNING 전용이므로 OK 검증 실패 처리에 재사용하면 안 된다.
- 구현 시 파일을 삭제하지 않고 알려진 무결성 실패를 원장에 보존해야 한다. CORRUPT 상태 또는 별도 검증 상태를 도입하는 경우 Flyway check·DTO·FE status표시·재생성·다운로드·삭제 허용 경로를 함께 대조한다.
- verify 판정은 날짜 락 안에서 원장 fingerprint(최소 id/status/path/sha/createdAt)와 파일 identity 변화 여부를 확인해 낡은 실패가 새 유효본을 오염시키지 않게 한다. 긴 SHA I/O는 공유 DB 락 안으로 이동하지 않는다.
- 알려진 손상 후 retention의 원본 삭제를 실제 PG와 손상 temp ZIP으로 검증한다. 관리자 정책 continue/hold-expiry와의 우선순위도 명시해야 한다. 데이터 보존 목적상 알려진 손상은 활성 대상에 한해 기본 차단하는 안을 우선 검토한다.
- 정적 파일 existence만으로 아직 미검출인 모든 bit rot를 보장할 수 없다. 정기검증·삭제전확인 비용까지 어떤 보장을 제공할지 구분한다.
