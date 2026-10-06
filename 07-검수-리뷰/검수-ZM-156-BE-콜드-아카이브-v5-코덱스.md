## P1~P4 반영 판정

| P# | 닫힘/부분/미반영 | 근거(파일:줄) |
|---|---|---|
| P1 | 닫힘 | `ApmAlertService.java:859-872`에서 보호 규칙의 `THEIRS`를 `APM_ALERT_RULE_PROTECTED`로 거절하고 `OURS`는 기존 정의를 Zabbix에 반영한다. 양쪽 테스트도 존재한다(`ApmAlertServiceTest.java:247-270`). 공개 변경 경로는 CRUD·resync뿐이며(`ApmAlertRuleController.java:131-208`), Zabbix 동기화 배치는 임계치를 채택하지 않고 drift 표시 또는 누락 객체 재생성만 수행한다(`ApmAlertSyncService.java:129-185`). 별도 일괄 저장·가져오기 우회 경로는 확인되지 않았다. |
| P2 | 닫힘 | IT가 공유 락의 실제 획득 결과를 단언하고(`ApmColdArchiveIT.java:581-598`), 두 요청 모두 `beforeExclusiveLock`에 도달할 때까지 latch로 기다린 뒤 어느 요청도 완료되지 않았음을 확인한다(`:599-609`). 락 해제 후 두 필드가 모두 보존됨을 단언한다(`:610-619`). 과거처럼 병합 기준을 락 밖에서 읽으면 마지막 저장이 상대 변경을 덮어 `hold=0`, `bf=all`을 동시에 만족할 수 없어 테스트가 실패한다. |
| P3 | 닫힘 | EOF 검사와 반환 직전 검사가 각각 존재한다(`ArchiveWriter.java:208-215,239-273,715-742`). 단계별 시계와 phase 메시지 단언으로 `sha256Of` 및 `verify`의 EOF·최종 경계를 분리한다(`ArchiveWriterTest.java:308-378`). `sha256Of`에는 별도 시작 검사가 없어 첫 시계 조회 자체가 EOF 검사이며, 최종 검사 테스트는 이전 조회를 모두 기한 안으로 둔다. `verify`는 시작 검사를 통과한 다음 EOF에서만 만료된다. EOF 또는 최종 검사가 빠진 옛 구현은 서로 다른 phase에서 실패한다. |
| P4 | 닫힘 | 실검사는 트랜잭션 생성 전에 수행된다(`ApmArchiveAdminService.java:133-140,184-193`). 락 안에서는 최신 APM 설정 재병합, 형식 검증과 `basePath`·`minFreeSpaceGb` 스냅샷 일치만 확인한다(`:141-153,177-205,225-254`). 불일치는 최대 3회 재검사 후 `ARCHIVE_BUSY`가 된다(`:133-170`). 파일 상태가 검사 직후 변할 수 있는 TOCTOU는 운영 건강검사의 허용된 창으로 판단된다. 실제 배치 시작 시 경로를 다시 검사하고(`ApmArchiveService.java:139-147`), 쓰기 시 실제 경로·심볼릭 링크를 재검증한다(`ArchiveWriter.java:128-166`). |

- 새 결함 없음.

## 판정

승인

P1~P4가 모두 요구한 보호·결정성·테스트 경계·락 축소 조건을 충족한다.  
이번 반영에서 새 필수 또는 권장 결함은 정적으로 확인되지 않았다.

확인하지 못한 것:

- 요청에 따라 빌드와 테스트를 실행하지 않았다.
- 실제 PostgreSQL에서의 동시성 IT 성공 여부는 확인하지 않았다.
- 실제 Zabbix 및 지연·장애가 있는 NFS 환경의 동작은 확인하지 않았다.