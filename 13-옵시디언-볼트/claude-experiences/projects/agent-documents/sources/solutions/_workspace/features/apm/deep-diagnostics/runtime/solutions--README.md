# 격리 런타임 검증 자원

- 본 작업 전용 PG5435·Redis6387·BE3301·FE5271만 사용한다. 공유 서버·DB에 설정/키/fixture를 적용하지 않는다.
- `../prepare_runtime.py`는 새 일회성 RSA 키쌍으로 24시간짜리 APM 검증 라이선스를 발급한다. 개인키는 저장하지 않고 별도 classpath에 넣을 공개키와 fixture.lic만 저장한다. 제품 JAR·기본 공개키·발급기 저장소는 바꾸지 않는다.
- `../run_be_isolated.ps1`은 본 worktree의 bootJar와 별도 resource 경로를 Spring Boot PropertiesLauncher로 기동한다. 검증 전용 공개키를 제품 배포 산출물에 포함하지 않는다. [Spring Boot launcher 설명](https://docs.spring.io/spring-boot/specification/executable-jar/launching.html)
- 여기의 고정 자격증명과 라이선스는 로컬 검증용이며 실제 환경에 사용하지 않는다.
- 기동/검증 로그와 fixture 출처를 남기고, 종료 시 이번 작업이 생성한 PID·컨테이너만 처리한다. 진행 중 타 세션의 프로세스는 종료하지 않는다.
