# Confluence Approval DC: 1.0.0 기준선

- 운영 첫 기준 버전은 `1.0.0`으로 정했다. 이전 `0.1.0-SNAPSHOT`은 더 이상 배포 식별자로 사용하지 않는다.
- parent, domain, Confluence 9, Confluence 10 module parent version과 README 산출물 경로를 함께 갱신해야 Maven reactor와 문서가 일치한다.
- C9 `mvn -pl approval-confluence9 -am package` 성공. 산출물은 `approval-confluence9-1.0.0.jar`이다.
- 후속 개발은 `1.1.0-SNAPSHOT`, 배포 후보는 `1.1.0`처럼 기능 단위로 올린다.
