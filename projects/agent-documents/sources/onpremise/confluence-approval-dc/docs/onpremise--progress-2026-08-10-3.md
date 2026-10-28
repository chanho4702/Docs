# Confluence Approval DC 진행 기록 — 2026-08-10 (3회차)

## 이 문서를 읽는 법

앞선 회차와 같은 규칙을 따른다. **코드와 실행 결과로 확인한 것만** 적는다.

이번 회차는 확인 수준이 항목마다 다르다. 그래서 세 단계로 구분해 적는다.

- **빌드·단위 테스트까지 확인**
- **실행 중인 인스턴스에서 확인**
- **아직 확인하지 못함**

마지막 항목이 실제로 남아 있으므로, 이 문서를 근거로 "동작한다"고 말할 수 있는 범위를 오해하지 않아야 한다.

## 검증 기준선

```text
approval-domain      : 44건 통과 (기존 41 + 동시성 3)
approval-confluence9 : 48건 통과
BUILD SUCCESS (domain, confluence9, confluence10)
```

---

## 1. Data Center 앱은 이제 Marketplace에 제출할 수 없다

조사 결과, 배포 전략의 전제가 바뀌었다.

| 날짜 | 내용 |
|---|---|
| 2025-12-16 | 신규 DC 앱 Marketplace 제출 중단 |
| 2026-03-30 | 신규 고객의 DC 구독·앱 구매 종료 |
| 2028-03-30 | 기존 고객의 신규 라이선스·앱·확장 구매 종료 |
| 2029-03-28 | DC 전체 EOL, 모든 인스턴스 read-only 전환 |

Bitbucket DC만 이 일정에서 제외된다. Confluence는 해당하지 않는다.

이 앱은 Marketplace 리스팅이 없으므로 **"신규 앱"에 해당하고 제출 경로가 닫혀 있다.**
따라서 Data Center Apps Approval process(성능 toolkit 증빙, 연간 리뷰 등)는 **더 이상 준비 대상이 아니다.**

남은 배포 경로는 Marketplace 밖 직접 배포 하나뿐이고, 심사가 없다.

- JAR 직접 납품 → UPM 업로드 또는 `installed-plugins` 배치
- Atlassian licensing API(`atlassian-licensing-enabled`)는 사용할 수 없다
- 유상 배포하려면 자체 라이선스 검증을 구현해야 한다

상업적 수명은 길게 잡아 2029-03까지이고, 대상은 기존 DC 고객사로 한정된다.

### 기간제 라이선스 방향 (설계만, 미구현)

- 서명된 라이선스 token을 공개키로 **오프라인 검증**한다. 폐쇄망 고객이 전제이므로 network 호출은 두지 않는다
- 개인키는 배포자 보관, 공개키만 JAR에 embed
- `serverId`를 token에 담아 인스턴스 재사용을 막는다
- 만료 시 **신규 요청 생성만 차단**한다. 진행 중인 승인과 조회·감사 기록은 계속 열어 둔다
- 검증 지점은 REST 경계다. 화면만 숨기는 구현은 규약 위반이다
- 검증 core는 `approval-domain`(Atlassian 무의존), platform 조회는 adapter
- 라이선스 최대 만료일은 2029-03-28로 제한하는 편이 안전하다

JAR은 디컴파일되므로 기술적 강제는 한계가 있다. 실질 억제력은 계약이고,
코드의 역할은 갱신 시점을 놓치지 않게 하는 것과 고의 우회를 명확히 만드는 것이다.

---

## 2. 다중 node에서 승인이 유실되는 결함을 고쳤다

**확인 수준: 빌드·단위 테스트까지.**

### 무엇이 문제였나

`ApprovalRequest`의 `synchronized`는 **객체 단위 lock**이다.
저장소가 호출마다 aggregate를 새로 복원하므로 lock 대상 객체가 매번 다르고,
같은 node 안에서도 상호 배제가 성립하지 않는다. node가 늘면 더 그렇다.

여기에 `save()`가 승인자 행을 **전부 지우고 다시 만들고** 있었다.
두 승인이 겹치면 먼저 기록된 결정이 통째로 사라진다.

### 어떻게 고쳤나

**cluster lock 도입.** `ApprovalLockService` 인터페이스를 domain에 두고
Beehive `ClusterLockService` 구현을 adapter에 뒀다. domain의 Atlassian 무의존 규약은 유지된다.

lock 단위는 **requestId가 아니라 target(page/region)** 이다.
생성 시 중복 검사, 승인·반려, lazy expiration이 모두 같은 대상의 행을 건드리므로,
lock을 requestId로 나누면 이 경로들이 서로 배타되지 않는다.

- 모든 상태 전이가 lock 안에서 **다시 읽고** 처리한다
- `inTargetLock(...)`을 공개해 adapter의 생성 경로(중복검사 → revision 계산 → 저장)를 한 원자 구간으로 묶었다
- 재진입은 `ThreadLocal`로 직접 처리한다. **Beehive lock은 재진입을 보장하지 않아서**, 없으면 중첩 호출이 자기 자신을 기다리다 timeout 난다
- 대기 한도 10초. 초과 시 `APPROVAL_LOCK_TIMEOUT` → REST 409
- 조회 경로는 `isDueForExpiry()`로 먼저 판정해, 실제 만료할 것이 있을 때만 lock에 들어간다
- 만료 전이 여부는 반드시 lock 안의 반환값으로 판정한다. 밖에서 읽은 값으로 세면 같은 알림이 두 번 나간다

**승인자 행 갱신 방식 변경.** 전체 삭제-재삽입 대신 변경분만 반영한다.
저장이 겹쳐도 다른 승인자의 결정 행은 남는다.

**index와 unique 제약.** 조회 컬럼에 `@Indexed`를 붙였다.
그런데 그 전에 더 큰 문제가 있었다 — `@StringLength(UNLIMITED)`는 **CLOB/TEXT로 만들어져 대부분의 DB에서 index를 걸 수 없다.**
`REQUEST_ID` 등 조회 조건 컬럼을 `@StringLength(64)`로 바꿨다.

중복 방지는 `DEDUPE_KEY` 단일 unique 컬럼으로 했다. AO는 복합 unique를 지원하지 않는다.
`PENDING`이면 대상 scope key(`open:PAGE:1001:-`), 마감되면 자기 id(`closed:{uuid}`)를 담는다.
항상 non-null이므로 **NULL 중복 허용 규칙이 DB마다 다른 문제를 피한다.**

**`findFlowIds` 전체 테이블 로드 제거.** `IN` 조건으로 좁히고 500개씩 나눠 조회한다(Oracle 상한 고려).

`approval-confluence10`에도 같은 수정을 적용했다. lock은 `@ComponentImport` 생성자 주입이다.

### 회귀 테스트

`ConcurrentApprovalTest`를 추가했다.
AO처럼 **호출마다 aggregate를 새로 복원하는** 저장소로 실제 조건을 재현한다.

lock을 `NO_OP`으로 바꿔 실행하면 **3건 중 2건이 실패한다** — 동시 승인에서 결정이 유실되고,
동시 생성에서 열린 요청이 2건 생긴다. 테스트가 실제 회귀를 잡는다는 것을 이 방법으로 확인했다.

---

## 3. 승인 요청 500의 원인 — 이번 회차의 동시성 수정이 저장 경로를 깨뜨렸다

**확인 수준: 실행 중인 인스턴스에서 해소 확인.**

### 진짜 원인

```text
org.h2.jdbc.JdbcSQLIntegrityConstraintViolationException:
NULL not allowed for column "DEDUPE_KEY"
```

**AO는 `@Unique` 컬럼을 NOT NULL로 만든다.**
그런데 `activeObjects.create()`는 빈 행을 먼저 INSERT하고 그 뒤에 setter를 적용한다.
INSERT 시점에 `DEDUPE_KEY`가 NULL이라 제약을 위반하고, `POST /approvals`가 500이 된다.

즉 이 장애는 **2절의 중복 방지 컬럼을 추가하면서 새로 만든 것**이다.

unique 컬럼의 값은 `DBParam`으로 INSERT 시점에 함께 넘겨야 한다.

```java
activeObjects.create(ApprovalEntity.class, new DBParam("DEDUPE_KEY", dedupeKey(request)))
```

`ApprovalEventEntity.EVENT_ID`도 `@Unique`라 같은 문제가 뒤따른다. 함께 고쳤다.
C10에도 동일하게 적용했다.

### 처음에 잘못 짚은 것

`saveNewEvents()`의 `Query.select("EVENT_ID")`를 원인으로 지목했었다.
**AO는 entity proxy를 만들 때 primary key로 행을 식별하므로 select 목록에 `ID`가 없으면 조회가 실패한다** —
이것은 실재하는 결함이고 `Query.select("ID, EVENT_ID")`로 고쳤다.
다만 이번 500의 원인은 아니었다. stack trace 없이 코드만 보고 단정한 것이 오진의 원인이었다.

### 인스턴스에서 확인한 결과

```text
POST /approvals                       → 201 PENDING (approvalCount 0, currentStepOrder 1, myTurn true)
POST /approvals (같은 대상 재요청)     → 409 "이미 진행 중인 승인 요청이 있습니다."
POST /approvals/{id}/approve          → 200 APPROVED (approvalCount 1, approvedContentVersion 1)
GET  /approvals/{id}                  → 200 APPROVED
```

승인 경로가 감사 이벤트를 저장하므로 `EVENT_ID` unique 수정까지 이 결과로 함께 확인됐다.
`DEDUPE_KEY` 기반 중복 방지도 409로 동작한다.

---

## 4. 실행 중인 인스턴스에서 확인한 것

`kr.dmove.confluence.approval` 플러그인이 **기존 데이터가 있는 H2에서 오류 없이 ENABLED 됐다.**
컨테이너를 완전히 지운 뒤의 재기동에서도 같았다.

AO schema migration은 플러그인 활성화 시점에 실행되므로,
`DEDUPE_KEY` unique 추가와 `UNLIMITED` → `VARCHAR(64)` 타입 축소가 **기존 행 위에서 통과했다**는 뜻이다.
실패했다면 플러그인이 비활성으로 떨어졌을 것이다.

다만 이는 **H2 한정**이다. PostgreSQL과 SQL Server는 NULL 처리와 타입 변경 규칙이 달라 별도 확인이 필요하다.
특히 SQL Server는 UNIQUE 제약에서 NULL을 하나만 허용하므로,
기존 행이 여럿인 인스턴스에서 `DEDUPE_KEY` 백필 없이 올리면 migration이 실패할 수 있다.

---

## 5. 아직 확인하지 못한 것

- cluster lock이 실제 Confluence runtime에서 OSGi 주입되는지. `ClusterLockService`를 얻지 못하면 경고 후 `NO_OP`으로 물러나므로 **조용히 lock 없이 동작할 수 있다.**
  생성·승인이 200/201로 돌아왔다는 것은 lock 경로가 예외 없이 지났다는 뜻일 뿐,
  cluster lock을 실제로 잡았는지는 증명하지 않는다
- 다중 node 환경 검증. 단일 node에서는 cluster lock의 실제 배타를 확인할 수 없다
- PostgreSQL / SQL Server에서의 schema migration

---

## 6. 이번에 겪은 환경 문제와 교훈

인스턴스 기동에 여러 번 실패했다. **원인은 전부 환경 쪽이었고 앱 코드와 무관했다.**
같은 함정을 다시 밟지 않도록 적어 둔다.

- **서버가 떠 있는 동안 `clean`을 돌리지 않는다.** `build.ps1`은 `clean verify`다.
  실행 중이면 `target/container` 아래 전개된 webapp을 지우다 파일 잠금에 걸려 멈추고,
  **그때까지 지운 것은 되돌아오지 않아** Confluence context 전체가 404가 된다.
  인스턴스가 떠 있을 때는 `mvn package`만 쓴다.

- **`target/container`를 지울 때는 `target/dependency-maven-plugin-markers`도 함께 지운다.**
  AMPS는 `org.apache.tomcat-apache-tomcat-zip-...marker`로 "이미 unpack 했다"고 판단한다.
  container만 지우면 Tomcat을 다시 풀지 않고
  `[...\apache-tomcat-9.0.118] is not a directory`로 기동이 실패한다.
  `run-confluence.ps1`의 `-ResetContainer`도 container만 지우므로 같은 함정이 있다.

- **Cargo가 만드는 경로는 Windows 260자 한계를 넘는다.**
  `Remove-Item -Recurse`가 `atlassian-clientside-extensions-page-bootstrapper` 중첩 경로에서 실패한다.
  빈 폴더를 robocopy `/MIR`로 미러링한 뒤 지우면 우회된다.

- **`run-confluence.ps1`은 비대화형 실행에서 쓸 수 없다.**
  48행의 `& mvn ... 2>&1 | Tee-Object`가 mvn의 stderr(SLF4J 경고)를 `NativeCommandError`로 감싸
  script가 중단되고 **자식 Confluence JVM까지 함께 죽는다.** `-Command`/`-File` 어느 쪽이든 재현된다.
  자동화에서는 Bash에서 `mvn confluence:run`을 직접 호출한다.

- **background 작업으로 서버를 띄우면 wrapper가 종료될 때 자식 JVM도 죽는다.**
  `Start-Process ... -WindowStyle Hidden`으로 세션에서 분리해야 살아남는다.

- **`confluence:run`은 자동화로 띄우면 안 된다.** 이 goal은 stdin으로 Ctrl-C를 기다리는
  foreground goal이라("Type Ctrl-C to shutdown gracefully"),
  프로세스를 분리해도 **부모가 사라져 stdin이 EOF가 되면 스스로 graceful shutdown 한다.**
  로그에는 `confluence started successfully in 316s` 바로 뒤에 `confluence: Shutting down`이 남는다.
  기동은 성공했는데 조용히 사라지므로 원인을 찾기 어렵다.
  띄우고 빠지려면 **`confluence:start`** 를 쓰고, 종료는 `confluence:stop`으로 한다.

- **인스턴스를 중복 실행하면 `InstanceAlreadyExistsException: Confluence:name=RequestMetrics`와
  `AbstractBootstrapHotSwappingFilter ... Could not get swap target`이 나온다.**
  이때 REST는 앱과 무관한 500을 돌려준다. 앱 결함으로 오해하기 쉽다.

- **`run-confluence.ps1`로 띄운 인스턴스의 JVM만 죽이면 부모 Maven이 남는다.**
  남은 부모가 `target/confluence-run.log`를 잡고 있어 다음 기동이 파일 잠금으로 실패한다.
  정리할 때는 process tree 전체를 본다.

- **C9 인스턴스를 띄운 채로 C10을 빌드하면 안 된다.**
  QuickReload는 `approval-confluence9/target`과 `approval-confluence10/target`을 **둘 다** 감시하고,
  두 adapter의 plugin key가 같으므로(`kr.dmove.confluence.approval`)
  나중에 갱신된 JAR이 앞의 것을 덮어쓴다.
  Confluence 9에 C10 bundle이 올라가면 jakarta 계열을 resolve하지 못해
  `Unable to resolve kr.dmove.confluence.approval.confluence10 ... missing requirement`로
  **플러그인 전체가 비활성화**된다.
  한쪽을 띄운 동안에는 그 모듈만 빌드하거나, 다른 쪽 JAR을 `target` 밖으로 옮겨 둔다.
  plugin key를 같게 둔 것은 Marketplace 업그레이드 경로를 위한 의도적 선택이므로, 이 부작용은 감수하고 운용으로 피한다.

- AMPS 인스턴스의 주 로그는 stdout으로만 나간다.
  `target/confluence/home/logs/`에 `atlassian-confluence.log`가 없으므로
  stack trace를 보려면 기동 시점에 출력을 파일로 받아 두어야 한다.

---

## 7. 다음 작업

1. **승인 요청 POST 재현.** 500 해소 확인이 최우선이다
2. `ClusterLockService` 주입 실패 시 조용히 `NO_OP`으로 물러나는 지금 동작을 재검토한다.
   운영에서 lock 없이 도는 것을 로그 경고만으로 두는 것이 맞는지 판단이 필요하다
3. PostgreSQL / SQL Server에서 schema migration 확인. 필요하면 `DEDUPE_KEY` 백필을 넣는다
4. `approval-confluence10`의 기능 격차. C10에는 scheduler, notification, settings, flow, event 저장소가 없다.
   이번 동시성 수정만 동일하게 적용했을 뿐 나머지 간극은 그대로다
5. 기간제 라이선스 구현 착수 여부 결정
