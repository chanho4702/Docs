# Confluence Data Center 승인 앱 산정 시 Forge와 P2를 분리한다

## 경험

"Confluence Data Center Forge 앱"은 플랫폼 조합부터 바로잡아야 한다. Forge는 Confluence Cloud용이고, Data Center 확장은 고객 인프라에 설치되는 Java 기반 Atlassian SDK/P2 앱이다. 따라서 기존 Forge 앱 경험을 Data Center 공수에 그대로 대입하면 플러그인 생명주기, Active Objects, 클러스터, 지원 DB, 제품 버전 호환성 비용을 누락한다.

2026년 8월 기준 Confluence Data Center는 2029-03-28 EOL이 예정되어 있다. 내부 기존 고객용 단기 기능과 신규 Marketplace 제품의 투자 판단을 분리해야 한다.

## 승인 기능 산정 기준

- 페이지 승인은 단순 상태 CRUD가 아니라 승인자 snapshot, 최소 승인 수, 중복 승인 방지, 동시성, 승인 후 만료 전이를 포함한다.
- 일부 콘텐츠 승인은 rich-text body를 가진 macro로 영역을 감싸는 방식이 가장 예측 가능하다. 임의 문단 선택이나 editor overlay를 요구하면 별도 editor PoC와 호환성 버퍼가 필요하다.
- 페이지 수정 만료는 content update event listener, 날짜 만료는 scheduler와 조회 시 lazy-expire를 함께 두는 편이 안전하다.
- 사용자별 승인 검색은 앱 내부 "내 승인함"이면 Active Objects 인덱스로 처리할 수 있다. Confluence 전역 검색/CQL 통합은 별도 범위다.
- Data Center Marketplace 배포는 1/2/4 node 성능 시험, PostgreSQL/MySQL/SQL Server/Oracle 호환, 보안 설문과 기술 심사를 별도 공수로 잡는다.

## 실무 범위

경험 있는 Atlassian 개발자를 기준으로, macro 기반 콘텐츠 영역과 앱 내부 승인함을 전제로 한 전체 내부 배포 버전은 약 80~120 person-days가 합리적인 1차 범위다. 견적에는 요구사항 불명확성과 Data Center 버전별 API 차이를 위한 15~20% 예비비를 별도로 반영한다.

## 공식 참고

- https://developer.atlassian.com/cloud/confluence/getting-started-with-forge/
- https://developer.atlassian.com/developer-guide/cloud-and-data-center-for-developers/
- https://www.atlassian.com/licensing/data-center-end-of-life
- https://developer.atlassian.com/platform/marketplace/dc-apps-submitting-your-app/

## 2026-08-07 구현 검증 메모

- Confluence 9.2.22와 10.2.14를 하나의 P2 JAR로 합치지 않고, Java 17 공통 domain과 버전별 adapter 두 개로 분리했다.
- `approval-confluence9`는 `--release 17`(class major 61), `approval-confluence10`은 `--release 21`(class major 65)로 검증했다.
- Atlassian SDK 8.2.7에 포함된 Maven 3.5.4는 최신 `maven-compiler-plugin`을 실행하기 부족하므로 Maven 3.9.16을 고정 toolchain으로 사용했다.
- Confluence 9.2.22와 10.2.14의 dependency graph 모두 저장소에 없는 `javax.transaction:jta:1.0.1B`를 참조하므로 parent `dependencyManagement`에서 `javax.transaction:jta:1.1`로 고정해야 재현 가능한 빌드가 됐다.
- Windows 개발 환경에서는 system `JAVA_HOME`에 의존하지 않고 build script에서 JDK와 Maven 절대 경로를 선택하는 편이 Java 17/21 혼선을 줄인다.
- 9.x/10.x용 JAR이 같은 앱의 호환 버전이라면 Atlassian plugin key와 macro key를 공유해야 UPM 업그레이드 및 기존 페이지의 macro 저장 형식이 이어진다. 제품별 설치 가능 범위는 descriptor의 `application-version`을 보조 방어선으로 두되, deprecated 속성이므로 Marketplace 호환 버전 메타데이터를 정본으로 관리한다.
- Maven Enforcer로 build JDK 21과 Maven 3.9+를 강제하고, build script에서 필터링된 descriptor의 app key/version range와 class major 61/65를 검사하면 문서상 호환성 기준을 자동화할 수 있다.
- Confluence XHTML macro descriptor는 공식 예시처럼 `name`을 storage 식별자(`approval-region`)로 사용하고 `<parameters/>`를 반드시 포함해야 Macro Browser metadata 파싱이 안전하다. 표시용 문구는 `description`/i18n으로 분리한다.

## 2026-08-07 개발 진행 및 검증

- `ApprovalRequestRepository`와 `ApprovalWorkflowService`를 추가해 요청·승인·반려·콘텐츠 버전 만료·기한 만료를 persistence-independent하게 연결했다.
- Confluence 9/10 adapter에 Active Objects entity(`DmoveApproval`, `DmoveApprovalApprover`)와 저장소 구현, 초기 REST 조회/승인/반려 경계를 추가했다.
- `scripts/build.ps1 -Target all` 성공: domain 테스트 11개 전부 통과, c9 Java 17(class major 61), c10 Java 21(class major 65), 두 P2 JAR/OBR descriptor 검증 완료.
- 초기 REST에 query parameter 기반 승인 요청 생성 endpoint를 추가해 실제 AO 저장 → 조회 → 승인/반려 흐름을 설치 직후 수동 검증할 수 있게 했다. 정식 UI 계약에서는 JSON DTO와 Confluence 인증 주체로 교체한다.
- page 단위 편집 만료 endpoint와 repository의 page 조회 포트를 추가했다. 이벤트 listener는 다음 단계에서 이 경계를 호출하도록 연결하고, 도메인 테스트는 12개로 확대했다.
- 두 adapter에 Confluence `PageUpdateEvent` listener를 연결했다. Confluence 9/10의 `atlassian-event` 6.0.8 annotation API는 구형 `EventListener` interface가 아니라 method-level `@EventListener`를 사용하므로 명시적인 provided dependency와 버전별 컴파일 검증이 필요했다.
- `atl.page.header` web panel을 두 adapter에 추가해 실제 page context에서 최신 승인 상태를 표시한다. 현재 사용자 키를 추출하는 승인/반려 버튼과 web-resource fetch action도 연결했으며, 운영 전에는 XSRF·권한 검증으로 교체해야 한다.
- AO approver snapshot 기준 `/approvals/mine?actorKey=...&status=...` 사용자별 승인함 조회를 추가했다. 동일 요청이 여러 결정 row로 중복 반환되지 않도록 request ID 기준 dedupe를 적용했다.
- 날짜 만료 일괄 조회와 cluster `RUN_ONCE_PER_CLUSTER` scheduler runner를 구현했지만, 현재 P2 descriptor의 `Atlassian-Plugin-Key` 정책상 `<component>` 직접 등록은 validator가 거부한다. runner activation은 Spring Scanner bean wiring을 별도 검증한 뒤 연결해야 하며, 현재 빌드 산출물에는 비활성 클래스만 포함된다.
- `confluence:run`은 로컬에서 AMPS가 제품 배포물을 다운로드·초기화하는 단계에서 장시간 대기하여 프로세스를 중단했다. 컴파일/패키징 실패가 아니라 실행 환경의 다운로드·초기화 제한이며, 사내 Confluence 인스턴스에 설치하는 통합 테스트가 다음 검증 지점이다.
