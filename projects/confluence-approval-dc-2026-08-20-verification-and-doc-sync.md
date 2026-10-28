# Confluence Approval DC: 검증 및 문서 정합화 (2026-08-20)

## 확인 결과

- `scripts/build.ps1 -Target all`에서 `approval-domain`은 JDK 21 기준 `clean verify`와 JUnit 61개를 통과했다.
- C9은 테스트 실패 전에 Maven `clean`이 Cargo container의 `httpclient-4.5.14.jar` 파일 잠금으로 중단됐다. 실행 중인 로컬 Confluence가 원인이다.
- reactor가 중단되어 C10 build와 양 adapter의 package/descriptor 검증은 실행되지 않았다. 따라서 지원 범위(C9)와 이번 실행의 배포 검증 완료 여부는 구분해야 한다.

## 문서화 원칙

- README는 C10의 제품 미완성 상태를 오래된 진행 기록이 아니라 `compatibility.md`와 최신 검증 기록에 연결한다.
- 검증 기록에는 통과·미완료·미실행을 분리해 적고, 파일 잠금이 코드 실패가 아님을 명시한다. 그렇더라도 전체 release gate가 끝나지 않았으면 배포 가능 판정은 보류한다.
- 재검증은 로컬 Confluence/AMPS Cargo 종료 후 실행한다. `-ResetContainer`는 필요할 때만 사용하고, 범위가 `target/container`이며 Confluence 데이터 홈을 지우지 않는지 문서에 적는다.

## 고객 전달 문서

- 상세 관리자·사용자 가이드 앞에 고객 전달 안내서를 둬야 지원 범위(C9만 지원), release 승인 JAR 사용,
  스테이징 인수 확인을 먼저 전달할 수 있다.
- Data Center 적용은 고객의 변경 관리 절차(node별 적용 방식·작업 창·재기동·rollback 담당)를 사전에 확정하게 한다.
- 적용 스페이스는 미지정 시 전체 노출이므로, 운영 시작 전 전체/지정 스페이스 중 하나를 명시적으로 선택·검증하게 한다.
- 기존 데이터 migration은 호환성, 백업·복구 가능 여부, rollback 기준을 공급사가 서면 확인한 경우에만 진행하게 한다.
