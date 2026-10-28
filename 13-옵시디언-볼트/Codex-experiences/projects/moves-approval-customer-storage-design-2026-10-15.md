# 고객 소유 외부 저장소 신규 개발 설계 (2026-10-15)

- 사용자는 파일 아카이브·마이그레이션 중심이 아니라 워크로그 전체를 외부 DB에 저장하는 신규 개발 관점을 요구했다.
- 제안: Forge 업무 로직 + 고객 Storage API + PostgreSQL + S3. 저장 API에도 승인 잠금·버전·마감의 최종 조건을 두어 조회 후 상태 변경 경합을 막는다.
- Jira 현재 내용과 승인된 고정 버전은 다른 기준이다. 두 저장소를 단일 트랜잭션으로 확정할 수 없으므로 operation 상태와 UNKNOWN 대조가 필요하다.
- FIT 설치 인증은 사용자 권한을 대체하지 않는다. 두 앱 설치를 명시적으로 tenant에 연결하며 고객 endpoint는 manifest·배포 제약을 고려한다.
- DB 복원으로 최근 승인 잠금이 사라질 수 있다. 복원 후 쓰기를 보류하고 결정 증거로 대조한 뒤 재개한다.
- 독자 검토에서 endpoint 선택·사용자 문맥·복원 잠금·오래된 조회 권한·worker 책임·정책 보존 표현을 보완했다.
- 문서: `C:\CloudJira\moves-approval-jira\docs\worklog-approval\CUSTOMER_MANAGED_STORAGE_DESIGN.md`
- 관련: [[moves-approval-property-deletion-2026-10-15]]