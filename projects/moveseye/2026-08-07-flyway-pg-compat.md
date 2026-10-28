---
tags: [moveseye, backend, flyway, postgresql, deployment]
updated: 2026-08-07
---

# 2026-08-07 — PostgreSQL 18 pg_dump baseline의 구버전 호환성

[[2026-06-10-spring-conversion]]에서 만든 Flyway `V1__baseline.sql`은 PostgreSQL 18.4의 `pg_dump --schema-only` 산출물이었다. 신규 운영 DB에서 V1을 처음 실행하자 PostgreSQL 17에 추가된 `SET transaction_timeout = 0`을 PostgreSQL 16 이하 서버가 인식하지 못해 SQLSTATE `42704`로 부팅이 중단됐다. 컨테이너는 `--restart always` 때문에 재시작 루프에 빠졌고, 그 결과 Docker `PORTS`도 비어 보이며 외부에서는 `ERR_CONNECTION_REFUSED`로 관찰됐다.

수정은 V1에서 `SET transaction_timeout`만 제거하는 방식으로 했다. PostgreSQL 17+에서도 이 설정의 기본값은 `0`이므로 생략해도 migration 트랜잭션 동작은 같다. `bootJar` 성공 후 JAR 내부 V1에 활성 문장이 없음을 확인했다.

## 교훈

- 새 버전 `pg_dump` 산출물을 더 낮은 PostgreSQL에 적용할 때는 dump 헤더의 `SET` 문부터 버전 호환성을 점검한다.
- 컨테이너의 `Restarting (1)`과 포트 연결 거부는 네트워크 원인이 아니라 Spring 부팅 실패의 하류 증상일 수 있다. 마지막 `Caused by`를 먼저 본다.
- 빈 DB에서 V1을 실제 적용하는 smoke test는 운영 지원 최저 PostgreSQL 버전으로도 실행해야 한다. 최신 개발 DB 한 버전만으로는 dump 호환성 회귀를 잡지 못한다. → [[2026-08-03-implementation-risk-audit]]

운영 배포 전체 흐름과 Apache·인증 후속은 [[2026-08-07-onprem-deployment-recovery]] 참조.
