## M1~M4·알람 보호 반영 판정

| 항목 | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| M1 | 부분 | 구현 순서는 트랜잭션→배타 락→재조회→병합→저장→보류 해제로 정확하다(`ApmArchiveAdminService.java:134-141`). 다만 IT는 공유 락 획득 결과를 확인하지 않고 두 요청의 락 진입도 확인하지 않은 채 500ms 후 해제한다(`ApmColdArchiveIT.java:581-604`). 실제 경합을 의도하지만 결정적으로 보장하지 않는다. |
| M2 | 닫힘 | 설정 공유 락 실패는 `lastLockTimeout`만 기록하고 `holds.touch` 없이 거절한다(`ApmArchiveDropGate.java:156-161`). 락 획득 후 꺼짐을 재조회하면 날짜 락 없이 허용하고(`:162-166`), 날짜 락 실패에만 보류를 기록한다(`:168-174`). disable 경합 IT도 배타 락 보유 중 timeout→파티션 유지→커밋 후 열린 보류 0건을 확인한다(`ApmColdArchiveIT.java:626-658`). 꺼진 시작 상태의 기존 무게이트 경로도 유지된다(`ApmRetentionService.java:97-107`). |
| M3 | 부분 | EOF 검사와 `sha256Of`·`verify` 반환 직전 검사는 구현됐다(`ArchiveWriter.java:247-263,214-215,741-742`). 그러나 소형 입력 테스트는 호출 전부터 시계를 기한 밖으로 설정한다(`ArchiveWriterTest.java:310-319`). 특히 `verify`는 시작 검사(`ArchiveWriter.java:726`)에서 즉시 실패하므로 EOF·반환 직전 경계를 실제로 밟지 않는다. |
| M4 | 닫힘 | 날짜당 절대 종료 시각을 한 번 계산하고 두 락에 `remaining`만 전달한다(`ApmArchiveDropGate.java:152-168,222-224`). 테스트도 첫 락에서 300ms를 소모한 뒤 두 번째 예산이 줄었음을 확인한다(`ApmArchiveDropGateTest.java:241-254`). |
| 알람 보호 | 부분 | `ARCHIVE_HOLD`만 보호 대상으로 지정했고(`ApmAlertKind.java:165-174`), 직접 수정의 null 검사와 primitive 비교는 타입·null 안전하다(`ApmAlertService.java:433-465`). 삭제 거절과 현재 임계·창 재전송을 포함한 `enabled` 토글도 검증한다(`ApmAlertServiceTest.java:227-258`). `STUCK_REQUEST`는 사용자 임계와 서비스별 규칙을 지원하므로 미보호 결정이 타당하다(`ApmAlertKind.java:169-170`). 다만 `resync?mode=THEIRS` 우회가 남아 있다. |

## 새 결함

- P1 · 필수 · `ApmAlertService.java:853-918` · `ARCHIVE_HOLD`의 임계를 `resync?mode=THEIRS`로 변경할 수 있다 · 보호 검사는 일반 `update`에만 있고, `adoptTheirThreshold`는 Zabbix 표현식에서 양수 임계를 읽으면 곧바로 `rule.update`와 `rules.save`를 수행한다 · 보호 규칙의 `THEIRS`를 `APM_ALERT_RULE_PROTECTED`로 거절하고, `OURS` 허용 및 우회 거절 테스트를 추가한다.
- P1 · 필수 · `ApmColdArchiveIT.java:581-604` · M1 동시 partial-update IT가 두 요청의 실제 대기 상태를 결정적으로 보장하지 않는다 · 공유 락 결과를 무시하며, 두 요청이 `lockSettingsExclusive`에 도착했는지 확인하지 않고 `Thread.sleep(500)`에 의존하여 기존 lost-update 구현도 스케줄링에 따라 통과할 수 있다 · 테스트 spy/hook으로 두 요청이 배타 락 진입점에 도달한 것을 latch로 확인한 뒤 공유 락을 해제하고, 공유 락 획득 결과도 단언한다.
- P2 · 필수 · `ArchiveWriterTest.java:310-323` · M3 테스트가 EOF·반환 직전 검사를 분리 검증하지 않는다 · `verify`는 읽기 전에 이미 만료되어 `ArchiveWriter.java:726`에서 종료되고, `sha256Of`도 EOF 검사에서 끝나 반환 직전 검사를 검증하지 못한다 · 주입 시계가 시작 검사에서는 기한 안, EOF 또는 최종 검사에서만 기한 밖이 되도록 단계별 테스트를 분리한다.
- P2 · 권장 · `ApmArchiveAdminService.java:134-140,196-209` · 배타 락과 DB 트랜잭션을 잡은 상태로 무제한 파일시스템 실검사를 수행한다 · `ArchivePathPolicy.check`는 디렉터리 접근, 파일 쓰기·`fsync`, 재읽기, 원자 이동, `FileStore` 조회를 수행한다(`ArchivePathPolicy.java:119-185,476-507`). 느린 NFS에서는 보존 날짜마다 공유 락이 30초씩 실패하여 배치가 크게 지연될 수 있다 · 느린 실검사를 트랜잭션 밖에서 수행하고, 락 안에서는 검증 입력의 버전/스냅샷 일치 확인 후 불일치 시 재검사·재시도하는 구조로 바꾼다.

## 판정

수정 후 재검수

이유 1: `ARCHIVE_HOLD` 임계 변경을 막는 계약에 `resync THEIRS` 우회가 남아 있다.  
이유 2: M1·M3의 핵심 회귀 테스트가 요구된 경합 및 deadline 경계를 결정적으로 검증하지 못한다.

확인하지 못한 것:

- 지시대로 빌드와 테스트를 실행하지 않았다.
- PostgreSQL에서 동시 partial-update 및 disable 경합을 직접 관찰하지 않았다.
- 느린 NFS에서 설정 저장과 보존 배치의 실제 지연을 측정하지 않았다.
- 실제 Zabbix를 통한 `ARCHIVE_HOLD`의 `THEIRS` resync는 실행하지 않았다.