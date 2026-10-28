# DMOVE Approvals for Confluence Data Center

Confluence Data Center 페이지와 페이지 내 콘텐츠 영역에 승인 워크플로를 제공하는 Java/P2 앱입니다.

## 현재 구현 범위

- 공통 승인 상태 머신
  - `PENDING`, `APPROVED`, `EXPIRED`, `REJECTED`, `CANCELLED`(회수)
  - **순차 승인 단계** — 지정한 순서가 곧 1·2·3단계이며, 앞 단계가 통과해야 다음 단계 차례가 됩니다
  - 중복 승인 멱등성
  - 지정 승인자 검증, 차례가 아닌 승인자 차단
  - 단일 반려 시 즉시 `REJECTED`
- 페이지 편집 이벤트 및 특정 날짜 만료
- Confluence 9.2/10.2용 `Approval Region` rich-text macro와 page header panel
- Active Objects 기반 승인 요청/승인자/Flow/그룹/알림 저장소
- REST API: 조회, 생성, 승인, 반려, 업무함, Flow·그룹 관리
- 두 LTS 계열을 분리한 P2 패키징 구조

page panel(`approval-page-panel`)은 페이지 header에 **상태 아이콘 pill 하나만** 노출합니다.
pill을 클릭하면 상세 모달이 열리고, 거기서 단계별 진행·감사 타임라인·**버전별 승인 이력**을
보여주며 **지금 차례인 승인자에게만** 승인/반려 버튼이 나타납니다. 승인 요청은 페이지 상단 액션의
`승인 요청` 버튼으로 여는 모달에서 만듭니다. `approval-region` 매크로도 같은 pill·모달 체계를
씁니다.

**편집과 재승인 (버전 기록 모델)** — 승인 완료(`APPROVED`)는 이후 편집·마감에도 무효화되지 않는
영구 기록입니다. 페이지가 승인 버전보다 새로워지면 pill이 `v{n} 승인 · v{m} 미승인`(stale)으로
바뀌고, 상세 모달에서 승인 버전과의 **차이 보기(diff)** 링크와 **`같은 결재선으로 재승인 요청`**
원클릭 버튼(그룹 단계는 요청 시점 구성원으로 재확장)을 제공합니다. 진행 중(`PENDING`) 요청은
기존대로 편집 시 만료됩니다.

승인 업무함(`/plugins/servlet/approval-inbox`)과 승인 설정(`/plugins/servlet/approval-settings`)은
`atl.general` 데코레이터로 **일반 Confluence 페이지처럼** 렌더링되며, 두 화면이 같은
**접이식 앱 사이드바**(내 차례/진행 중/내 요청/참조/처리한 건 + 알림/내 서명/(권한자) 승인 설정)를 공유합니다.
스페이스에서 진입하면 사이드바 상단에 `← 스페이스명` 복귀 링크가 붙습니다.
마감 임박(DUE_SOON) 알림도 피드에 표시됩니다.

Confluence 10 adapter는 아직 제품에 사용할 수 없는 초기 구현이며 이식이 남아 있습니다.
업무함·설정 화면·알림·전자서명·위임·i18n·XSRF 필터가 없으므로 고객 배포 대상은
Confluence 9.2.x뿐입니다. 지원 범위와 이식 기준은 `docs/compatibility.md`, 최근 검증 결과는
`docs/progress-2026-08-20-verification.md`를 참고하세요.

고객 전달 시에는 `docs/customer-handover.md`를 첫 안내서로 제공하고, 역할에 따라
`docs/guide-admin.md`와 `docs/guide-user.md`를 함께 전달하세요.

개발 워크플로는 하네스로 운영합니다: 코드 변경 작업은 `approval-dev` 스킬(스펙 작성 → Codex 구현 →
독립 QA 검증 파이프라인)을 사용합니다. `CLAUDE.md`와 `.claude/agents/`, `.claude/skills/`를 참고하세요.

## 모듈

```text
confluence-approval-dc/
├─ approval-domain/        # Java 17 공통 상태 머신
├─ approval-confluence9/   # Confluence 9.2.22, Java 17, javax 계열 어댑터
├─ approval-confluence10/  # Confluence 10.2.14, Java 21, jakarta 계열 어댑터
├─ docs/
└─ scripts/
```

## 요구 도구

- JDK 21: `C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot`
- Maven 3.9.16: `C:\Onpremise\.toolchains\apache-maven-3.9.16`
- Atlassian Maven repository에 대한 네트워크 연결

시스템 기본 `JAVA_HOME`은 사용하지 않습니다. 제공된 PowerShell 스크립트가 검증된 toolchain을 명시적으로 선택합니다.

## 빌드

```powershell
cd C:\Onpremise\confluence-approval-dc
./scripts/build.ps1 -Target domain
./scripts/build.ps1 -Target confluence9
./scripts/build.ps1 -Target confluence10
./scripts/build.ps1 -Target all
```

빌드 산출물:

- `approval-confluence9/target/approval-confluence9-1.0.0.jar`
- `approval-confluence10/target/approval-confluence10-1.0.0.jar`

## 로컬 Confluence 실행

각 어댑터 디렉터리에서 AMPS `confluence:run`을 실행합니다. Confluence 10.2는 Java 21만 지원합니다.

```powershell
./scripts/run-confluence.ps1 -Target confluence9
./scripts/run-confluence.ps1 -Target confluence10
```

이전 실행이 비정상 종료되어 Cargo 오류가 발생하면 실행 중인 Confluence를 먼저 종료한 뒤 `-ResetContainer`를 한 번 사용합니다. 이 옵션은 `target/container` 아래 Cargo가 생성한 Tomcat 설정만 삭제하며, Confluence 데이터 홈은 삭제하지 않습니다.

```powershell
./scripts/run-confluence.ps1 -Target confluence9 -ResetContainer
```

### 주의: 실행 중인 인스턴스와 반대 adapter 빌드를 섞지 말 것

C9 인스턴스가 떠 있는 상태에서 `approval-confluence10`을 빌드하면 QuickReload가 C10 JAR을 감지해 설치해 버립니다. 두 adapter는 plugin key(`kr.dmove.confluence.approval`)를 공유하므로 교체가 성립하지만, C10 JAR의 `application-version`은 `10.2.x`라 Confluence 9.2에서는 **plugin 전체가 비활성화**되고 page panel과 macro가 화면에서 사라집니다. 반대 방향도 같습니다.

증상 확인:

```powershell
curl.exe -u admin:admin -H "Accept: application/vnd.atl.plugins.plugin+json" `
  http://localhost:1990/confluence/rest/plugins/1.0/kr.dmove.confluence.approval-key
```

응답의 `name`이 실행 중인 인스턴스와 다른 adapter를 가리키거나 `enabled`가 `false`이면 이 문제입니다. 해당 인스턴스에 맞는 adapter를 다시 빌드하면 QuickReload가 되돌립니다.

```powershell
./scripts/build.ps1 -Target confluence9
```

실행 중인 인스턴스와 다른 adapter를 빌드해야 하면 인스턴스를 먼저 내리거나 `-pl`로 해당 모듈만 빌드하고 반대 모듈의 `target/*.jar`를 만들지 않도록 합니다.

실제 Data Center 배포 전에는 외부 DB와 다중 node 환경에서 별도 검증해야 합니다.

## Docker로 Confluence 실행

Docker Desktop과 Docker Compose가 설치되어 있으면 C9 테스트 인스턴스를 다음처럼 실행할 수 있습니다. 공식 `atlassian/confluence:9.2.22` 이미지를 사용하고, Confluence 데이터는 `confluence9-home` named volume에 보존합니다. 앱 JAR은 `atlassian-bundled-plugins`에 자동 마운트되므로 UPM에서 매번 업로드할 필요가 없습니다.

먼저 최신 C9 JAR을 빌드합니다.

```powershell
./scripts/build.ps1 -Target confluence9
```

그 다음 컨테이너를 시작합니다.

```powershell
docker compose up -d
docker compose logs -f confluence
```

브라우저: `http://localhost:1990/confluence`

앱 JAR을 다시 빌드한 뒤에는 컨테이너만 재시작하면 됩니다.

```powershell
docker compose restart confluence
```

종료할 때는 `docker compose down`을 사용합니다. 데이터까지 삭제하는 `docker compose down -v`는 초기화가 필요할 때만 사용해야 합니다.

## REST API (초기 내부 검증용)

두 adapter에 동일한 경로를 제공합니다. 권한은 REST 경계에서 다시 검증하며, 상태를 바꾸는 요청(POST·PUT·PATCH·DELETE)은 앱의 XSRF 필터가 `X-Atlassian-Token` 헤더를 요구합니다(없으면 403).

```text
POST /rest/approval/1.0/approvals?resourceType=PAGE&pageId=123&contentVersion=4&steps=user:alice;group:leads;user:bob
GET  /rest/approval/1.0/approvals/{requestId}
POST /rest/approval/1.0/approvals/{requestId}/approve?actorKey={userKey}
POST /rest/approval/1.0/approvals/{requestId}/reject?actorKey={userKey}
POST /rest/approval/1.0/approvals/page/{pageId}/expire?currentContentVersion=5
GET  /rest/approval/1.0/approvals/mine?actorKey=alice&status=PENDING
GET  /rest/approval/1.0/approvals/groups
GET|POST|DELETE /rest/approval/1.0/approvals/groups/registered
```

대부분의 endpoint는 query/path parameter만 사용합니다. 다만 **서명 이미지와 서명 PIN은 form body 전용**입니다 — URL과 access log에 남지 않도록 query로 받은 같은 이름의 값은 거부합니다.

### 승인 단계 지정

`steps`는 **세미콜론 하나가 단계 하나**입니다. `user:` 또는 `group:` 접두사를 붙이고,
접두사가 없으면 사용자로 봅니다. 적은 순서가 그대로 승인 순서가 됩니다.

- 그룹은 요청 생성 시점의 활성 구성원을 user key로 펼쳐 **한 단계**로 묶습니다.
  통과 조건(한 명 / 전원)은 관리 화면의 **그룹 설정**을 따릅니다.
- 같은 사람이 여러 단계에 있으면 앞 단계에만 남습니다.
- 앞 단계가 통과하기 전에 뒤 단계 승인자가 승인·반려하면 `409`와 함께
  "아직 n단계 차례가 아닙니다" 메시지를 돌려줍니다.

`resourceType=CONTENT_REGION`을 쓰면 `regionKey`를 추가할 수 있습니다. 생략하면 그 페이지의
`default` 영역을 씁니다. `expiresAt`은 ISO-8601 UTC 형식이며 형식이 틀리면 `400`입니다.
`revision`은 생략하면 같은 대상의 마지막 revision + 1로 자동 계산합니다.
`contentVersion` 파라미터는 하위 호환으로 남아 있지만 **서버가 실제 페이지 버전으로 덮어씁니다**
(클라이언트 값을 신뢰하면 편집해도 만료되지 않는 승인이 만들어질 수 있기 때문).
`page/{pageId}/expire`의 `currentContentVersion`도 같은 원칙입니다.

응답에는 `status`, 대상 page/region, `contentVersion`, `revision`,
`steps[]`(단계별 승인자·통과 여부), `stepCount`, `currentStepOrder`, `myTurn`,
`approvedContentVersion`, `requiresReapproval`이 포함됩니다.

`minimumApprovals`·`approverKeys`·`approverGroups` 파라미터는 하위 호환으로 남아 있으며 `steps`가 함께 오면 무시됩니다.

`fromRequestId`는 `steps`·`flowId`·`approverKeys`·`approverGroups`가 모두 없을 때만 이전 결재선을 복원하며, 그 외에는 계보 연결(`PREV_REQUEST_ID`)로만 쓰입니다.

### 서버 측 권한 검증

UI 노출과 별개로 REST 경계에서 다시 검증합니다.

- 생성 및 `page/{pageId}/expire`: 로그인 사용자 + 대상 페이지 `EDIT` 권한
- 조회, 승인, 반려: 로그인 사용자 + 대상 페이지 `VIEW` 권한
- 승인·반려·`/mine`의 `actorKey`는 로그인 사용자의 user key 또는 username과 일치해야 하며, 그렇지 않으면 `403`
- 같은 대상에 이미 `PENDING` 요청이 있으면 생성은 `409`

## 페이지 승인 테스트 방법

1. `./scripts/run-confluence.ps1 -Target confluence9`으로 로컬 인스턴스를 띄웁니다.
2. 승인자로 쓸 계정을 **2개 이상** 준비합니다. 순차 승인은 계정이 하나면 단계 차이를 확인할 수 없습니다.
3. 관리자로 `/plugins/servlet/approval-settings`를 열어 **그룹 설정**에서 쓸 그룹을 등록합니다.
   등록하지 않은 그룹은 결재선 검색에 나오지 않습니다.
4. 임의의 페이지를 엽니다. 제목 위 banner에 `approval-page-panel`이 렌더링되고,
   편집 권한이 있으면 상단 액션에 `승인 요청` 버튼이 보입니다.
5. 버튼을 눌러 모달을 열고 `승인자 직접 지정` 탭에서 승인자를 **순서대로** 추가합니다.
   ↑↓로 순서를 바꿀 수 있습니다. `승인 Flow 사용` 탭에서는 Flow를 고르면 단계와 담당자를 미리 보여줍니다.
6. 요청을 만들면 panel이 `1 / 3단계 진행 중`과 단계별 승인자로 갱신됩니다.
7. **1단계 승인자**로 같은 페이지를 열고 상태 pill을 클릭하면 모달 안에 `승인` / `반려` 버튼이 보입니다.
   2단계 승인자의 모달에는 "앞 단계 승인을 기다리는 중"이 표시되고, REST를 직접 호출하면 `409`가 반환됩니다.
8. 마지막 단계까지 통과하면 pill이 `승인 완료`로 바뀌고 모달에 `v{n} 기준 승인`이 표시됩니다.
9. 그 페이지를 편집하면 승인 기록은 유지된 채 pill이 `v{n} 승인 · v{m} 미승인`으로 바뀝니다.
   pill을 눌러 diff 링크로 변경 내용을 확인하고, `같은 결재선으로 재승인 요청`으로 새 버전의
   승인을 시작할 수 있습니다. (진행 중 요청의 편집 만료는 `ApprovalPageUpdateListener` 담당)
10. 승인 업무함은 `/plugins/servlet/approval-inbox`이며, 헤더 우측 아이콘으로 설정 화면과 Confluence를 오갈 수 있습니다.
## 빌드 빠른 시작

이 저장소의 루트 Maven reactor는 Maven Enforcer로 **JDK 21**을 요구합니다. 다만 산출물의 bytecode 기준은 adapter별로 다릅니다.

| 대상 | Confluence | 컴파일 bytecode | 빌드에 사용하는 JDK |
| --- | --- | --- | --- |
| `approval-domain` | 공통 도메인 | Java 17 | JDK 21 |
| `approval-confluence9` | 9.2.x | Java 17 | JDK 21 |
| `approval-confluence10` | 10.2.x | Java 21 | JDK 21 |

즉, Confluence 9용 플러그인을 빌드할 때도 로컬 빌드 프로세스는 JDK 21로 실행해야 합니다. Java 8 또는 Java 17만으로는 루트 Maven Enforcer 단계에서 실패합니다.

## 사전 조건

- Windows PowerShell 5.1 이상
- JDK 21 (`java -version` 확인)
- Maven 3.9.x
- Maven이 Atlassian Public Repository에 접속할 수 있는 네트워크

프로젝트의 `scripts/build.ps1`은 검증된 JDK/Maven 경로를 명시해 빌드하고, 산출물의 Java bytecode 및 Confluence 지원 버전도 추가로 검사합니다. 일반적인 개발·배포 빌드는 이 스크립트 사용을 권장합니다.

## PowerShell 빌드 명령

프로젝트 루트에서 실행합니다.

```powershell
Set-Location C:\Onpremise\confluence-approval-dc

# Confluence 9 플러그인과 공통 도메인을 빌드·테스트한다.
.\scripts\build.ps1 -Target confluence9

# Confluence 10 플러그인과 공통 도메인을 빌드·테스트한다.
.\scripts\build.ps1 -Target confluence10

# 모든 모듈을 빌드·테스트한다.
.\scripts\build.ps1 -Target all
```

성공하면 배포 가능한 JAR은 다음에 생성됩니다.

```text
approval-confluence9\target\approval-confluence9-1.0.0.jar
approval-confluence10\target\approval-confluence10-1.0.0.jar
```

Confluence 9 서버에는 반드시 첫 번째 JAR만, Confluence 10 서버에는 두 번째 JAR만 설치합니다. 두 adapter는 같은 plugin key를 사용하므로 같은 Confluence 인스턴스에 함께 설치하면 안 됩니다.

## Maven 직접 실행

스크립트를 사용하지 않는 경우, `JAVA_HOME`을 JDK 21로 설정한 뒤 Maven 3.9.x로 실행합니다.

```powershell
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# 저장소에 내려받아 둔 Maven을 쓰는 예시
& .\.tools\apache-maven-3.9.11\bin\mvn.cmd -pl approval-confluence9 -am package
```

전체 검증까지 수행하려면 `package` 대신 `clean verify`를 사용합니다.

```powershell
& .\.tools\apache-maven-3.9.11\bin\mvn.cmd -pl approval-confluence9 -am clean verify
```

## 설치 및 확인

1. 대상 Confluence 버전과 일치하는 JAR을 Universal Plugin Manager에서 업로드합니다.
2. 플러그인이 활성화된 뒤 일반 페이지를 열어 상단 헤더의 `승인` 메뉴와 페이지의 `승인 요청`을 확인합니다.
3. 오류가 나면 Confluence 애플리케이션 로그에서 `kr.dmove.confluence.approval`과 `PluginSettingsFactory`를 검색합니다.

서명 설정의 만료 주기처럼 scheduler 등록에 영향을 주는 설정은 서버 재기동 후 확실히 적용됩니다. 일반적인 승인 설정, Flow, 사용자 선택 설정은 저장 후 즉시 적용됩니다.
