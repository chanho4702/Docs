# Confluence Approval DC: Data Center 운영 준비도 점검 (2026-08-20)

- C9은 상태 전이에 cluster lock과 scheduler의 `RUN_ONCE_PER_CLUSTER`, AO unique 제약을 사용하지만, cluster lock OSGi 조회 실패 시 NO_OP lock으로 fallback한다. 다중 node에서는 이를 배포 차단 또는 fail-closed로 바꾸기 전까지 운영 검증이 필요하다.
- 문서상 C10 어댑터는 기능·테스트·운영 화면이 미완성이다. C10은 고객 배포 대상으로 선언하면 안 된다.
- 운영 전에는 PostgreSQL과 2/4 node에서 동시 승인·중복 요청·scheduler failover·알림 중복·node rolling restart·UPM 업그레이드/rollback을 검증해야 한다.
