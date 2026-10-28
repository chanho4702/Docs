# contents-user-management-jira (User & Contents Management, UCM)

Jira Cloud용 Forge 앱. Bitbucket `DMOVE_GIT/contents-user-management-jira`, 이슈 키 `CUMJ`. 2026-10-20 인수인계 파악.

## 구조
- Forge 앱(이 저장소): 관리자 globalPage(`static/scheduler`) + 스케줄러 모달(`static/schedulerModal`) + 이슈 패널 보안 블록(`static/secretBlock`), 백엔드 `src/*.js`
- **사용자·라이선스 로직 대부분은 원격 Spring 서버 `dmv-remote.moves.co.kr`** (별도 저장소, `invokeRemote('remote-spring')`, 헤더 `x-cloud-id`). 조직 API 키(orgId/orgKey)는 KVS secret에 저장
- 앱 내부 처리: 컨텐츠 필터(이슈 이벤트 트리거), 보안 블록(AES-GCM, 이슈 패널), 웹훅/스케줄러 설정 KVS

## 운영
- CI/CD 파이프라인 없음. 수동 `yarn build:all` → `forge deploy`. env 규칙 `dev-{이름}` / `production`
- 브랜치: `feature/CUMJ-xxx` → `release/x.y.0` → master (Bitbucket PR)

## 리뷰에서 나온 열린 항목 (2026-10-20)
- SecretBlockLog `todayIso()`가 UTC 기준 → KST 오전에 오늘 로그 누락
- secretBlock `Modal.open()` Promise를 동기 try/catch로 감쌈 → 대체 표시 미작동
- 관리자 리졸버 서버측 권한 검사 없음 (displayConditions만)

## Guard 연관 (2026-10-20)
- Guard SCIM으로 동기화된 그룹에 Jira 권한이 걸려 있으면 UCM의 회수(그룹에서 제거)가 동기화 때 원복된다 → 매뉴얼의 해법은 로컬 그룹 + 그룹 마이그레이션(4시간 스케줄러, 회수자는 블랙리스트)
- 조직 API 키는 반드시 "API key without scopes"
- 회수 수단 비교: 그룹 제거 / `roles/revoke`(사용자 단위, 제품 정밀) / 그룹 roles/revoke / suspend(전 앱) / 디렉터리 제거. roles/revoke가 IdP 그룹에도 먹히는지는 실측 필요
- 인수인계 문서: 저장소 `docs/HANDOVER.md`, Claude Doc "UCM 인수인계 문서"

## Java 런타임 CVE 패치 (2026-10-26)
- 보안 스캔 항목: CVE-2026-91403 / CVE-2026-114820 (CVSS 9.1, eMudhra가 약한 키로 발급한 중간 CA 16개 → TLS MITM). OpenJDK 2026-10-21 OOB 어드바이저리, 영향 범위 "17.0.21 · 21.0.13 이하 전부".
- 발견 상태: Dockerfile 실행 이미지가 `openjdk:26-ea-17-jdk-slim`(JDK **26 EA 빌드 17**, 17이 아님) · pom의 maven-compiler-plugin source/target 16 · 로컬 JDK 21.0.12 — 전부 영향권.
- 실측(버전 번호만 믿지 말 것): Temurin 17.0.21+9 JRE tarball을 받아 확인 → `blocked.certs`에 새 지문 0개, 대신 cacerts에서 emSign 루트 4개 중 3개 제거(NSS 3.131.1 추종, `emSign Root CA - G1`은 남음). Docker Hub `eclipse-temurin:17-jre`는 10-26 기준 아직 17.0.20.1(루트 4개 전부 신뢰). 커뮤니티 PR들은 "포함됨/안 됨"이 엇갈렸음.
- 조치: `eclipse-temurin:17-jre` + `docker/emudhra-blocked.certs`(16지문, scala-lang 어드바이저리·codacy PR 교차 검증)를 `$JAVA_HOME/lib/security/blocked.certs`에 append (업스트림 OpenJDK 방식). 빌드 이미지 `maven:3-eclipse-temurin-17`, pom 16 오버라이드 삭제(release 17 → class major 61). `.gitattributes`로 certs 파일 LF 고정(autocrlf 환경에서 CR 섞임 방지, RUN에서도 `tr -d ''`).
- 교훈: `openjdk` 공식 Docker 이미지는 deprecated라 EA 태그만 갱신됨 → "17" 검색해서 고르면 EA를 잡는다. CVE 패치 여부는 벤더별로 cacerts 제거 vs blocked.certs 차단 방식이 달라 바이너리를 직접 열어 확인해야 한다. ENTRYPOINT가 `java -jar`인 이미지에 `docker run ... sh -c`를 주면 앱이 기동된다(`--entrypoint sh` 필수) — 기본 profile이 prd라 운영 Atlas에 붙을 뻔함.

## Java 서버 분석 (2026-10-20)
- 저장소 로컬 `C:\CloudJira\ucm\forge-remote-spring` (Spring Boot 3.4, Java 17, docker compose :15080). **운영 코드는 `develop`** (master는 2026-03에 멈춤)
- 한 서버가 Jira판·Confluence판 두 앱을 multi-app으로 처리 → 서버 변경은 Confluence판에도 영향
- 핵심 로직은 `ForgeRemoteService` 인터페이스 default 메서드. 회수는 사용자 `roles/revoke`, 그룹 v2 `role-assignments/revoke` (매뉴얼의 "그룹에서 제거" 설명과 다름)
- 로그·예외 대상은 MongoDB Atlas(forgeLog/userLog/except/migration). KVS `schedulerlog3`/`excepttarget2`는 레거시
- 서버는 system token으로 Forge Storage REST를 호출해 KVS secret(orgKey 등)을 읽음
- 중대 이슈: Mongo 비밀번호 하드코딩, TokenBox.toString이 조직 API 키를 로그에 출력, 활동일 조회 실패 시 neverLoginUser면 활동 사용자 회수, 블랙리스트 100건 초과 시 cursor 미전달로 무한 루프
- 교훈: Forge 앱을 볼 때 manifest `remotes`가 있으면 원격 서버 저장소부터 찾을 것 (처음에 서버 코드를 못 찾고 "추정"으로 문서화했다가 사용자 지적으로 정정)
- 도구: draw.io 데스크톱 없이 `.drawio` XML을 Python으로 생성하고, puppeteer와 `viewer.diagrams.net` `GraphViewer`로 PNG 렌더링 가능 (mxCell id 중복 시 렌더 실패 주의)
